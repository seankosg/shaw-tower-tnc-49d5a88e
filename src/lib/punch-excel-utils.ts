/**
 * Punch Import / Export utilities.
 *
 * Round-trip guaranteed: every column produced by `buildPunchExportRows` can
 * be re-imported via `parsePunchWorkbook` because both sides share the
 * `PUNCH_FIELDS` registry as the single source of truth.
 *
 * Read-only fields (planned %, variance %, health, pre-eng ready/blockers)
 * are exported for visibility but ignored on import — the DB trigger
 * recomputes them.
 */

import * as XLSX from 'xlsx';
import {
  PUNCH_FIELDS,
  PUNCH_FIELDS_BY_NAME,
  normalizePunchHeader,
  type PunchFieldDef,
  PUNCH_GATE_STATUS,
  PUNCH_PROCUREMENT_STATUS,
} from '@/lib/punch-field-registry';
import { normalizeDate } from '@/lib/date-normalize';
import { isoToExcelSerial, DATE_NUMFMT } from '@/lib/excel-date-cell';
import type { Database } from '@/integrations/supabase/types';

export type PunchItem = Database['public']['Tables']['punch_items']['Row'];
export type PunchInsert = Database['public']['Tables']['punch_items']['Insert'];

const GATE_ALIAS_MAP: Record<string, string> = {
  approved: 'approved', approve: 'approved', ok: 'approved', yes: 'approved', y: 'approved', complete: 'approved', completed: 'approved', done: 'approved',
  pending: 'pending', wip: 'pending', open: 'pending', inprogress: 'pending', progress: 'pending',
  notrequired: 'not_required', na: 'not_required', no: 'not_required', n: 'not_required', none: 'not_required',
  partiallysecured: 'partially_secured', partial: 'partially_secured', partialsecured: 'partially_secured',
  secured: 'secured',
};

function coerceGate(value: unknown, allowed: readonly string[]): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const norm = s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if ((allowed as readonly string[]).includes(s)) return s;
  if ((allowed as readonly string[]).includes(norm)) return norm;
  const mapped = GATE_ALIAS_MAP[norm];
  if (mapped && (allowed as readonly string[]).includes(mapped)) return mapped;
  return null;
}

function coerceNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = String(value).replace(/[%,\s]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// --- Parse (Import) -------------------------------------------------------

export interface PunchParseRowError {
  rawRowNo: number;
  reason: string;
}

export interface PunchParsedRow {
  rawRowNo: number;
  values: Partial<PunchInsert>;
  rawPayload: Record<string, unknown>;
}

export interface PunchParseResult {
  rows: PunchParsedRow[];
  errors: PunchParseRowError[];
  /** Header → matched field (for UI preview). null = unmatched. */
  headerMap: Array<{ header: string; field: PunchFieldDef | null }>;
  sheetName: string;
  sheetNames: string[];
}

export async function parsePunchWorkbook(
  file: File,
  preferredSheet?: string,
): Promise<PunchParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, cellNF: false });
  const sheetNames = wb.SheetNames;
  const sheetName = preferredSheet && sheetNames.includes(preferredSheet)
    ? preferredSheet
    : (sheetNames.find((n) => /punch|outstanding|minor/i.test(n)) ?? sheetNames[0]);
  const ws = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    raw: true, defval: null, blankrows: false,
  });

  const headers = Object.keys(json[0] ?? {});
  const headerMap = headers.map((h) => ({ header: h, field: normalizePunchHeader(h) }));

  const rows: PunchParsedRow[] = [];
  const errors: PunchParseRowError[] = [];

  json.forEach((raw, idx) => {
    const rawRowNo = idx + 2; // +2: header row + 1-indexed
    const values: Partial<PunchInsert> = {};
    for (const { header, field } of headerMap) {
      if (!field || field.readOnly) continue;
      const cell = raw[header];
      if (cell == null || cell === '') continue;
      switch (field.dataType) {
        case 'date': {
          const iso = normalizeDate(cell);
          if (iso) (values as any)[field.field] = iso;
          break;
        }
        case 'number':
        case 'pct': {
          const n = coerceNumber(cell);
          if (n != null) (values as any)[field.field] = n;
          break;
        }
        case 'enum': {
          const allowed = field.field.startsWith('material_procurement')
            ? PUNCH_PROCUREMENT_STATUS
            : PUNCH_GATE_STATUS;
          const v = coerceGate(cell, allowed);
          if (v) (values as any)[field.field] = v;
          break;
        }
        case 'bool': {
          if (typeof cell === 'boolean') (values as any)[field.field] = cell;
          else {
            const s = String(cell).trim().toLowerCase();
            if (['true', 'yes', 'y', '1'].includes(s)) (values as any)[field.field] = true;
            else if (['false', 'no', 'n', '0'].includes(s)) (values as any)[field.field] = false;
          }
          break;
        }
        default: {
          (values as any)[field.field] = String(cell).trim();
        }
      }
    }
    if (!values.outstanding_work && !values.item_no) {
      errors.push({ rawRowNo, reason: 'Missing both Item No and Outstanding Works' });
      return;
    }
    if (!values.outstanding_work) {
      errors.push({ rawRowNo, reason: 'Missing Outstanding Works' });
      return;
    }
    rows.push({ rawRowNo, values, rawPayload: raw });
  });

  return { rows, errors, headerMap, sheetName, sheetNames };
}

// --- Upsert ---------------------------------------------------------------

export interface PunchUpsertResult {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ itemNo: string | null; reason: string }>;
}

import { supabase } from '@/integrations/supabase/client';

export async function upsertPunchRows(
  rows: PunchParsedRow[],
  opts: { projectId: string; uploadId?: string | null; updatedBy: string | null },
): Promise<PunchUpsertResult> {
  const result: PunchUpsertResult = { inserted: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
  if (!rows.length) return result;

  const itemNos = rows.map((r) => r.values.item_no).filter((v): v is string => !!v);
  const existingByItemNo = new Map<string, PunchItem>();
  if (itemNos.length) {
    const { data } = await supabase
      .from('punch_items')
      .select('*')
      .eq('project_id', opts.projectId)
      .in('item_no', itemNos);
    (data || []).forEach((row) => {
      if (row.item_no) existingByItemNo.set(row.item_no, row as PunchItem);
    });
  }

  for (const row of rows) {
    const itemNo = row.values.item_no ?? null;
    const existing = itemNo ? existingByItemNo.get(itemNo) : undefined;
    if (existing) {
      const { error } = await supabase
        .from('punch_items')
        .update({
          ...row.values,
          updated_by: opts.updatedBy,
          source_upload_id: opts.uploadId ?? existing.source_upload_id,
          data_source_type: 'excel_import',
        })
        .eq('id', existing.id);
      if (error) {
        result.failed++;
        result.errors.push({ itemNo, reason: error.message });
      } else result.updated++;
    } else {
      const insert: PunchInsert = {
        ...(row.values as PunchInsert),
        project_id: opts.projectId,
        outstanding_work: row.values.outstanding_work ?? '',
        updated_by: opts.updatedBy,
        source_upload_id: opts.uploadId ?? null,
        data_source_type: 'excel_import',
        raw_payload: row.rawPayload as any,
      };
      const { error } = await supabase.from('punch_items').insert(insert);
      if (error) {
        result.failed++;
        result.errors.push({ itemNo, reason: error.message });
      } else result.inserted++;
    }
  }
  return result;
}

// --- Export ---------------------------------------------------------------

export interface PunchExportOptions {
  /** Subset of registry fields. Defaults to all in registry order. */
  fields?: PunchFieldDef[];
  fileName?: string;
}

export function buildPunchExportRows(
  items: PunchItem[],
  fields: PunchFieldDef[] = PUNCH_FIELDS,
): Array<Record<string, unknown>> {
  return items.map((row) => {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      const v = (row as any)[f.field];
      if (Array.isArray(v)) out[f.exportLabel] = v.join(', ');
      else if (typeof v === 'boolean') out[f.exportLabel] = v ? 'TRUE' : 'FALSE';
      else out[f.exportLabel] = v ?? '';
    }
    return out;
  });
}

export function exportPunchWorkbook(items: PunchItem[], opts: PunchExportOptions = {}): { rowCount: number } {
  const fields = opts.fields ?? PUNCH_FIELDS;
  const rows = buildPunchExportRows(items, fields);
  const ws = XLSX.utils.json_to_sheet(rows, { header: fields.map((f) => f.exportLabel) });

  // Format date columns as Excel date cells
  fields.forEach((f, colIdx) => {
    if (f.dataType !== 'date') return;
    items.forEach((row, rowIdx) => {
      const serial = isoToExcelSerial((row as any)[f.field]);
      if (serial == null) return;
      const cellRef = XLSX.utils.encode_cell({ c: colIdx, r: rowIdx + 1 });
      ws[cellRef] = { t: 'n', v: serial, z: DATE_NUMFMT };
    });
  });

  // Column widths
  ws['!cols'] = fields.map((f) => ({
    wch: Math.max(f.exportLabel.length + 2, f.dataType === 'text' ? 22 : 12),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Punch Items');

  // Info sheet
  const info = [
    ['Generated At', new Date().toISOString()],
    ['Total Rows', items.length],
    ['Field Count', fields.length],
    ['Schema Version', 'punch-v1'],
  ];
  const infoWs = XLSX.utils.aoa_to_sheet(info);
  infoWs['!cols'] = [{ wch: 18 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, infoWs, 'Export Info');

  const fileName = opts.fileName ?? `punch_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return { rowCount: items.length };
}

// Suppress unused-import warning when build pares unused symbols
void PUNCH_FIELDS_BY_NAME;
