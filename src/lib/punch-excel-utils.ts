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

/**
 * Normalize free-text team values from imported workbooks into the
 * `team_type` enum (Mech | Elec | Arch | Supp | Design). Returns null when
 * the value is empty or cannot be mapped — caller then leaves the column
 * NULL instead of triggering an enum error on insert.
 */
function normalizePunchTeam(val: unknown): string | null {
  if (val == null || val === '') return null;
  const key = String(val).trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!key) return null;
  const map: Record<string, string> = {
    mech: 'Mech', mecha: 'Mech', mechanical: 'Mech',
    elec: 'Elec', electrical: 'Elec', electric: 'Elec',
    arch: 'Arch', archi: 'Arch', architecture: 'Arch', architectural: 'Arch',
    facade: 'Arch',
    supp: 'Supp', support: 'Supp', supplier: 'Supp',
    external: 'Supp',
    design: 'Design', designer: 'Design',
  };
  return map[key] ?? null;
}
import { isoToExcelSerial, DATE_NUMFMT } from '@/lib/excel-date-cell';
import { getMappedField } from '@/lib/header-mappings-cache';
import {
  buildFieldLog,
  classifyChange,
  stringifyForLog,
  type PendingFieldLog,
} from '@/lib/import-field-log';
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

/**
 * Parse a Subtask-style Item No like "3_1", "3.1", "Elec-001_2" into
 * { itemNo, parentItemNo }. Normalizes '_' separator to '.'.
 * Returns parentItemNo=null when the value is not a subtask pattern.
 *
 * Pattern: <base><sep><digits>  where sep is '_' or '.', digits >= 1.
 * Only the LAST separator is split, so "3_1_2" → parent "3_1", child ".2".
 */
export function parseSubtaskItemNo(raw: unknown): { itemNo: string; parentItemNo: string | null } {
  const s = raw == null ? '' : String(raw).trim();
  if (!s) return { itemNo: s, parentItemNo: null };
  const m = s.match(/^(.+)[._](\d+)$/);
  if (!m) return { itemNo: s, parentItemNo: null };
  const base = m[1].trim();
  const child = m[2];
  if (!base) return { itemNo: s, parentItemNo: null };
  return { itemNo: `${base}.${child}`, parentItemNo: base };
}

/** Coerce a Subtask Stage cell into one of the 3 enum values. Returns
 * undefined if blank, the enum string if valid, or null if invalid. */
const STAGE_ALIAS_MAP: Record<string, 'pre_engineering' | 'physical_work' | 'inspection'> = {
  preengineering: 'pre_engineering', preeng: 'pre_engineering', pe: 'pre_engineering',
  physicalwork: 'physical_work', physical: 'physical_work', pw: 'physical_work', work: 'physical_work',
  inspection: 'inspection', inspect: 'inspection', in: 'inspection', insp: 'inspection',
};
export function coerceSubtaskStage(value: unknown): 'pre_engineering' | 'physical_work' | 'inspection' | undefined | null {
  if (value == null) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  const norm = s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return STAGE_ALIAS_MAP[norm] ?? null;
}

/** Normalize Excel header for header_mapping lookup.
 * Must match Admin's punch normalizeAlias: lowercase + strip all non-alphanumerics.
 * So "Main Cat", "main-cat", "Main_Cat" all collapse to "maincat". */
function normalizeAliasForLookup(raw: string): string {
  return String(raw ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Resolve a header string to a PunchFieldDef:
 *   1. Try Admin-managed `import_header_mappings` (module='punch') first.
 *   2. Fall back to the registry's hardcoded aliases.
 */
function resolveHeader(raw: string): PunchFieldDef | null {
  const aliasNorm = normalizeAliasForLookup(raw);
  const mappedField = getMappedField('punch', aliasNorm, '');
  if (mappedField) {
    const def = PUNCH_FIELDS_BY_NAME[mappedField];
    if (def) return def;
  }
  return normalizePunchHeader(raw);
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
  /** First non-null sample value per header — used by the Column Select dialog. */
  headerSamples: Record<string, unknown>;
  sheetName: string;
  sheetNames: string[];
}

export interface PunchParseOptions {
  /** Excel headers to skip (their fields will not be applied/persisted). */
  excludedHeaders?: string[];
}

export async function parsePunchWorkbook(
  file: File,
  preferredSheet?: string,
  opts: PunchParseOptions = {},
): Promise<PunchParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, cellNF: false });
  const sheetNames = wb.SheetNames;
  const sheetName = preferredSheet && sheetNames.includes(preferredSheet)
    ? preferredSheet
    : (sheetNames.find((n) => /punch|outstanding|minor/i.test(n)) ?? sheetNames[0]);
  const ws = wb.Sheets[sheetName];

  // Auto-detect header row: scan first 20 rows, pick the one with most registry-matched cells.
  // IMPORTANT: use blankrows:true so row indices align with real sheet coordinates
  // (otherwise sheet_to_json({range}) below reads from the wrong row when the
  // workbook starts with one or more blank rows above the real header).
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1, raw: true, defval: null, blankrows: true,
  });
  let headerRowIdx = 0;
  let bestScore = -1;
  const scanLimit = Math.min(20, aoa.length);
  for (let i = 0; i < scanLimit; i++) {
    const row = aoa[i] ?? [];
    let score = 0;
    for (const cell of row) {
      if (cell == null || cell === '') continue;
      if (resolveHeader(String(cell))) score++;
    }
    if (score > bestScore) { bestScore = score; headerRowIdx = i; }
  }
  if (bestScore <= 0) headerRowIdx = 0; // fallback

  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    raw: true, defval: null, blankrows: false, range: headerRowIdx,
  });

  // Drop auto-generated empty headers (e.g. __EMPTY, __EMPTY_1) from blank columns.
  const headers = Object.keys(json[0] ?? {}).filter(
    (h) => h && h.trim() !== '' && !/^__EMPTY(_\d+)?$/.test(h),
  );
  const excludedSet = new Set(opts.excludedHeaders ?? []);
  const headerMap = headers.map((h) => ({ header: h, field: resolveHeader(h) }));

  // Collect first non-null/non-empty sample per header for UI preview
  const headerSamples: Record<string, unknown> = {};
  for (const h of headers) {
    for (const row of json) {
      const v = row[h];
      if (v !== null && v !== undefined && v !== '') {
        headerSamples[h] = v;
        break;
      }
    }
  }

  const rows: PunchParsedRow[] = [];
  const errors: PunchParseRowError[] = [];

  json.forEach((raw, idx) => {
    const rawRowNo = idx + 2; // +2: header row + 1-indexed
    const values: Partial<PunchInsert> = {};
    for (const { header, field } of headerMap) {
      if (!field || field.readOnly) continue;
      if (excludedSet.has(header)) continue;
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
          if (field.field === 'subtask_stage') {
            const stage = coerceSubtaskStage(cell);
            if (stage === undefined) break; // blank → skip
            if (stage === null) {
              errors.push({ rawRowNo, reason: `Invalid Subtask Stage: "${String(cell).trim()}" (allowed: pre_engineering, physical_work, inspection)` });
              return; // reject row
            }
            (values as any).subtask_stage = stage;
            break;
          }
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
          if (field.field === 'team') {
            const t = normalizePunchTeam(cell);
            if (t) (values as any).team = t;
            else errors.push({ rawRowNo, reason: `Unknown team value: "${String(cell).trim()}" (allowed: Mech, Elec, Arch, Supp, Design)` });
          } else {
            (values as any)[field.field] = String(cell).trim();
          }
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
    // Normalize Item No (e.g. "3_1" → "3.1") and auto-extract parent.
    // Explicit parent_item_no column from Excel takes precedence.
    if (values.item_no) {
      const { itemNo, parentItemNo } = parseSubtaskItemNo(values.item_no);
      values.item_no = itemNo;
      if (parentItemNo && !(values as any).parent_item_no) {
        (values as any).parent_item_no = parentItemNo;
      }
    }
    rows.push({ rawRowNo, values, rawPayload: raw });
  });

  return { rows, errors, headerMap, headerSamples, sheetName, sheetNames };
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

/** Fields whose changes we record in punch_change_log + import_field_logs. */
const TRACKED_FIELDS: string[] = PUNCH_FIELDS
  .filter((f) => !f.readOnly)
  .map((f) => f.field);

export async function upsertPunchRows(
  rows: PunchParsedRow[],
  opts: { projectId: string; uploadId?: string | null; updatedBy: string | null },
): Promise<PunchUpsertResult> {
  const result: PunchUpsertResult = { inserted: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
  if (!rows.length) return result;

  // Strip virtual hierarchy field (parent_item_no) from per-row values — it's
  // not a DB column; we resolve it to parent_id in a second pass below.
  const parentRefByItemNo = new Map<string, string>(); // child item_no → parent item_no
  for (const r of rows) {
    const pin = (r.values as any).parent_item_no;
    if (pin && r.values.item_no) parentRefByItemNo.set(r.values.item_no, String(pin).trim());
    delete (r.values as any).parent_item_no;
    delete (r.values as any).manual_override_fields;
    delete (r.values as any).is_summary; // never imported directly
  }

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

  const pendingFieldLogs: PendingFieldLog[] = [];
  const pendingChangeLogs: Array<{
    punch_id: string;
    upload_id: string | null;
    changed_field: string;
    old_value: string | null;
    new_value: string | null;
    change_source: string;
    changed_by: string | null;
  }> = [];
  const pendingRowLogs: Array<{
    upload_id: string;
    raw_row_no: number | null;
    item_no: string | null;
    action_taken: 'inserted' | 'updated' | 'skipped' | 'rejected';
    reason_code: string | null;
    reason_detail: string | null;
  }> = [];
  const pushRowLog = (
    rawRowNo: number | null,
    itemNo: string | null,
    action: 'inserted' | 'updated' | 'skipped' | 'rejected',
    reasonCode: string | null = null,
    reasonDetail: string | null = null,
  ) => {
    if (!opts.uploadId) return;
    pendingRowLogs.push({
      upload_id: opts.uploadId,
      raw_row_no: rawRowNo,
      item_no: itemNo,
      action_taken: action,
      reason_code: reasonCode,
      reason_detail: reasonDetail,
    });
  };

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
        pushRowLog(row.rawRowNo, itemNo, 'rejected', 'db_error', error.message);
        continue;
      }
      result.updated++;
      pushRowLog(row.rawRowNo, itemNo, 'updated');

      // Build field-level diffs
      for (const field of TRACKED_FIELDS) {
        if (!(field in row.values)) continue;
        const incoming = (row.values as any)[field];
        const previous = (existing as any)[field];
        const change = classifyChange(incoming, previous);
        if (change === 'empty') continue;
        pendingFieldLogs.push(
          buildFieldLog('punch', {
            rawRowNo: row.rawRowNo,
            field,
            outcome: change === 'applied' ? 'applied' : 'unchanged',
            raw: incoming,
            applied: change === 'applied' ? incoming : previous,
            previous,
          }),
        );
        if (change === 'applied') {
          pendingChangeLogs.push({
            punch_id: existing.id,
            upload_id: opts.uploadId ?? null,
            changed_field: field,
            old_value: stringifyForLog(previous),
            new_value: stringifyForLog(incoming),
            change_source: 'excel_import',
            changed_by: opts.updatedBy,
          });
        }
      }
    } else {
      const insert: PunchInsert = {
        ...(row.values as PunchInsert),
        project_id: opts.projectId,
        outstanding_work: row.values.outstanding_work ?? '',
        updated_by: opts.updatedBy,
        created_by: opts.updatedBy,
        source_upload_id: opts.uploadId ?? null,
        data_source_type: 'excel_import',
        raw_payload: row.rawPayload as any,
      } as PunchInsert;
      const { data: inserted, error } = await supabase
        .from('punch_items')
        .insert(insert)
        .select('id')
        .maybeSingle();
      if (error) {
        result.failed++;
        result.errors.push({ itemNo, reason: error.message });
        pushRowLog(row.rawRowNo, itemNo, 'rejected', 'db_error', error.message);
        continue;
      }
      result.inserted++;
      pushRowLog(row.rawRowNo, itemNo, 'inserted');

      // Field logs for inserts (every applied non-empty field)
      const newId = inserted?.id;
      for (const field of TRACKED_FIELDS) {
        if (!(field in row.values)) continue;
        const incoming = (row.values as any)[field];
        if (incoming === null || incoming === undefined || incoming === '') continue;
        pendingFieldLogs.push(
          buildFieldLog('punch', {
            rawRowNo: row.rawRowNo,
            field,
            outcome: 'applied',
            raw: incoming,
            applied: incoming,
            previous: null,
          }),
        );
        if (newId) {
          pendingChangeLogs.push({
            punch_id: newId,
            upload_id: opts.uploadId ?? null,
            changed_field: field,
            old_value: null,
            new_value: stringifyForLog(incoming),
            change_source: 'excel_import',
            changed_by: opts.updatedBy,
          });
        }
      }
    }
  }

  // Flush field logs (best-effort; log failures but don't fail the import)
  if (opts.uploadId && pendingFieldLogs.length) {
    const payload = pendingFieldLogs.map((p) => ({
      ...p,
      upload_id: opts.uploadId,
      created_by: opts.updatedBy,
    }));
    const { error } = await supabase.from('import_field_logs').insert(payload as any);
    if (error) console.warn('[punch] field log insert failed:', error.message);
  }
  if (pendingChangeLogs.length) {
    const { error } = await supabase.from('punch_change_log').insert(pendingChangeLogs as any);
    if (error) console.warn('[punch] change log insert failed:', error.message);
  }
  if (opts.uploadId && pendingRowLogs.length) {
    const { error } = await (supabase as any).from('punch_upload_row_logs').insert(pendingRowLogs);
    if (error) console.warn('[punch] row log insert failed:', error.message);
  }

  // --- Second pass: resolve Parent Item No → parent_id, promote parents ---
  if (parentRefByItemNo.size > 0) {
    const childItemNos = Array.from(parentRefByItemNo.keys());
    const parentItemNos = Array.from(new Set(parentRefByItemNo.values()));
    const { data: refRows } = await supabase
      .from('punch_items')
      .select('id, item_no, is_summary, parent_id')
      .eq('project_id', opts.projectId)
      .in('item_no', [...childItemNos, ...parentItemNos]);

    const idByItemNo = new Map<string, { id: string; is_summary: boolean | null; parent_id: string | null }>();
    (refRows || []).forEach((r) => {
      if (r.item_no) idByItemNo.set(r.item_no, { id: r.id, is_summary: (r as any).is_summary, parent_id: (r as any).parent_id });
    });

    const parentsToPromote = new Set<string>();
    for (const [childNo, parentNo] of parentRefByItemNo) {
      const child = idByItemNo.get(childNo);
      if (!child) {
        result.errors.push({ itemNo: childNo, reason: `Child row not found after insert — skipped` });
        continue;
      }
      let parent = idByItemNo.get(parentNo);
      // Auto-create empty Summary if parent row is missing.
      if (!parent) {
        const { data: created, error: createErr } = await supabase
          .from('punch_items')
          .insert({
            project_id: opts.projectId,
            item_no: parentNo,
            outstanding_work: parentNo,
            is_summary: true,
            data_source_type: 'auto_generated',
            source_upload_id: opts.uploadId ?? null,
            created_by: opts.updatedBy,
            updated_by: opts.updatedBy,
          } as PunchInsert)
          .select('id, item_no, is_summary, parent_id')
          .maybeSingle();
        if (createErr || !created) {
          result.errors.push({ itemNo: childNo, reason: `Auto-create parent "${parentNo}" failed: ${createErr?.message ?? 'unknown'}` });
          continue;
        }
        parent = { id: created.id, is_summary: created.is_summary as boolean | null, parent_id: created.parent_id as string | null };
        idByItemNo.set(parentNo, parent);
        result.inserted++;
        if (opts.uploadId) {
          pendingRowLogs.push({
            upload_id: opts.uploadId,
            raw_row_no: null,
            item_no: parentNo,
            action_taken: 'inserted',
            reason_code: 'auto_summary',
            reason_detail: `Auto-created parent for ${childNo}`,
          });
        }
      }
      if (child.id === parent.id) continue;
      if (parent.parent_id) {
        result.errors.push({ itemNo: childNo, reason: `Parent "${parentNo}" is already a subtask — only 2-level hierarchy allowed` });
        continue;
      }
      const { error: linkErr } = await supabase
        .from('punch_items')
        .update({ parent_id: parent.id })
        .eq('id', child.id);
      if (linkErr) {
        result.errors.push({ itemNo: childNo, reason: `Parent link failed: ${linkErr.message}` });
        continue;
      }
      if (!parent.is_summary) parentsToPromote.add(parent.id);
    }
    for (const pid of parentsToPromote) {
      await supabase.from('punch_items').update({ is_summary: true } as any).eq('id', pid);
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

/**
 * Sort items so each Summary is immediately followed by its children
 * (stage then item_no). Standalone rows keep their relative order.
 */
function sortItemsForExport(items: PunchItem[]): PunchItem[] {
  const STAGE_ORDER: Record<string, number> = {
    pre_engineering: 0, physical_work: 1, inspection: 2,
  };
  const byParent = new Map<string, PunchItem[]>();
  const top: PunchItem[] = [];
  for (const row of items) {
    const pid = (row as any).parent_id as string | null;
    if (pid) {
      const arr = byParent.get(pid) ?? [];
      arr.push(row);
      byParent.set(pid, arr);
    } else {
      top.push(row);
    }
  }
  const out: PunchItem[] = [];
  for (const parent of top) {
    out.push(parent);
    const kids = byParent.get(parent.id) ?? [];
    kids.sort((a, b) => {
      const sa = STAGE_ORDER[(a as any).subtask_stage] ?? 99;
      const sb = STAGE_ORDER[(b as any).subtask_stage] ?? 99;
      if (sa !== sb) return sa - sb;
      return String(a.item_no ?? '').localeCompare(String(b.item_no ?? ''));
    });
    out.push(...kids);
  }
  const inOut = new Set(out.map((r) => r.id));
  for (const r of items) if (!inOut.has(r.id)) out.push(r);
  return out;
}

export function buildPunchExportRows(
  items: PunchItem[],
  fields: PunchFieldDef[] = PUNCH_FIELDS,
): Array<Record<string, unknown>> {
  const itemNoById = new Map<string, string | null>();
  for (const row of items) itemNoById.set(row.id, row.item_no ?? null);

  return items.map((row) => {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      let v: unknown;
      if (f.field === 'parent_item_no') {
        const pid = (row as any).parent_id as string | null;
        v = pid ? (itemNoById.get(pid) ?? '') : '';
      } else if (f.field === 'manual_override_fields') {
        const ov = (row as any).override_fields;
        v = ov && typeof ov === 'object' ? Object.keys(ov).join(', ') : '';
      } else {
        v = (row as any)[f.field];
      }
      if (Array.isArray(v)) out[f.exportLabel] = v.join(', ');
      else if (typeof v === 'boolean') out[f.exportLabel] = v ? 'TRUE' : 'FALSE';
      else out[f.exportLabel] = v ?? '';
    }
    return out;
  });
}

export function exportPunchWorkbook(items: PunchItem[], opts: PunchExportOptions = {}): { rowCount: number } {
  const fields = opts.fields ?? PUNCH_FIELDS;
  const sorted = sortItemsForExport(items);
  const rows = buildPunchExportRows(sorted, fields);
  const ws = XLSX.utils.json_to_sheet(rows, { header: fields.map((f) => f.exportLabel) });

  // Format date columns as Excel date cells
  fields.forEach((f, colIdx) => {
    if (f.dataType !== 'date') return;
    sorted.forEach((row, rowIdx) => {
      const serial = isoToExcelSerial((row as any)[f.field]);
      if (serial == null) return;
      const cellRef = XLSX.utils.encode_cell({ c: colIdx, r: rowIdx + 1 });
      ws[cellRef] = { t: 'n', v: serial, z: DATE_NUMFMT };
    });
  });

  ws['!cols'] = fields.map((f) => ({
    wch: Math.max(f.exportLabel.length + 2, f.dataType === 'text' ? 22 : 12),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Punch Items');

  const info = [
    ['Generated At', new Date().toISOString()],
    ['Total Rows', items.length],
    ['Field Count', fields.length],
    ['Schema Version', 'punch-v2-hierarchy'],
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
