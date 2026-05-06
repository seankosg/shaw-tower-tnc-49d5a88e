// Warranty (List of Warranties) Excel parser.
// Header row in SHAW workbook is row 7. Each row corresponds to a warranty
// item identified by `No`. Tread* columns become rows in `warranty_threads`.

import * as XLSX from 'xlsx';
import { normalizeDate } from '@/lib/defect-parser';
import { getMappedField } from '@/lib/header-mappings-cache';
import { normalizeTeamValue } from '@/types/enums';

export type WarrantyStatus = 'A' | 'B' | 'C' | 'UR' | 'WIP' | 'Planned';

export interface WarrantyThreadInput {
  thread_label: string;        // canonical key: tread_1, tread_2_1, ...
  display_label: string;       // human label from the original header
  thread_date: string | null;  // ISO date parsed from the header text if present
  action_party: string | null; // optional party hint parsed from header
  content: string | null;      // cell value (the actual remark/discussion content)
  sort_order: number;
}

export interface ParsedWarrantyRow {
  rawRowNo: number;
  sheetName: string;
  item_no: number | null;
  category: string | null;
  warranted_item: string | null;
  team: string | null;
  hdec_pic_name: string | null;
  hdec_eng_name: string | null;
  warranty_period_years: number | null;
  contract_spec_ref: string | null;
  // Schedule R
  r_works_description: string | null;
  subcontractor_name: string | null;
  r_acra_reg_no: string | null;
  r_acra_address: string | null;
  r_subcontract_date: string | null;
  r_brief_description: string | null;
  r_director_1: string | null;
  r_director_2: string | null;
  r_witness: string | null;
  acra_info_status: string | null;
  // Draft
  draft_planned_date: string | null;
  draft_actual_date: string | null;
  draft_response_planned_date: string | null;
  draft_response_actual_date: string | null;
  draft_status: WarrantyStatus | null;
  // Subcon Sign
  subcon_signing_planned_date: string | null;
  subcon_signing_actual_date: string | null;
  subcon_signing_status: WarrantyStatus | null;
  // HDEC Sign
  hdec_signing_planned_date: string | null;
  hdec_signing_actual_date: string | null;
  hdec_signing_status: WarrantyStatus | null;
  // Final
  final_planned_date: string | null;
  final_actual_date: string | null;
  final_status: WarrantyStatus | null;
  remarks: string | null;
  threads: WarrantyThreadInput[];
  raw_payload: Record<string, unknown>;
}

export interface ParseWarrantyResult {
  rows: ParsedWarrantyRow[];
  sheetCount: number;
  sheets: Array<{ name: string; headerCount: number; rowCount: number }>;
  unknownHeaders: string[];
  excludedFields: Set<string>;
}

const STATUS_TOKENS: WarrantyStatus[] = ['A', 'B', 'C', 'UR', 'WIP', 'Planned'];

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toText(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const t = String(value).trim();
  return t === '' ? null : t;
}

function toIntOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function normalizeWarrantyStatus(value: unknown): WarrantyStatus | null {
  const t = toText(value);
  if (!t) return null;
  const upper = t.toUpperCase();
  if (upper === 'A' || upper === 'B' || upper === 'C') return upper;
  if (upper === 'UR') return 'UR';
  if (upper === 'WIP') return 'WIP';
  if (/^PLAN/i.test(t)) return 'Planned';
  // tolerate full words
  if (upper.startsWith('APPROV')) return 'A';
  return null;
}

const FALLBACK_ALIASES: Record<string, string | 'skip'> = {
  'no': 'item_no',
  'no.': 'item_no',
  's/n': 'item_no',
  'category': 'category',
  'warranted item': 'warranted_item',
  'team': 'team',
  'hdec pic': 'hdec_pic_name',
  'hdec eng': 'hdec_eng_name',
  'warranty period years': 'warranty_period_years',
  'contract specification reference': 'contract_spec_ref',
  '[r] description of the works': 'r_works_description',
  '[r] subcontractor': 'subcontractor_name',
  '[r] subcontract contract date': 'r_subcontract_date',
  '[r] brief description': 'r_brief_description',
  'acra info': 'acra_info_status',
  'd. planned submission': 'draft_planned_date',
  'd. actual submission': 'draft_actual_date',
  'd. planned response': 'draft_response_planned_date',
  'd. actual response': 'draft_response_actual_date',
  'd.status': 'draft_status',
  'd status': 'draft_status',
  'subcon planned signing': 'subcon_signing_planned_date',
  'subcon actual signing': 'subcon_signing_actual_date',
  'subcon siging status': 'subcon_signing_status',
  'subcon signing status': 'subcon_signing_status',
  'hdec planned signing': 'hdec_signing_planned_date',
  'hdec actual signing': 'hdec_signing_actual_date',
  'hdec siging status': 'hdec_signing_status',
  'hdec signing status': 'hdec_signing_status',
  'final planned submission': 'final_planned_date',
  'final actual submission': 'final_actual_date',
  'final status': 'final_status',
  'remarks': 'remarks',
};

/** Resolve a raw header to a canonical field. Returns:
 *   - 'skip' when the header is intentionally ignored
 *   - 'thread:<key>' for Tread* columns (caller writes warranty_threads)
 *   - canonical field name (e.g. 'item_no')
 *   - null when unmapped */
function mapHeader(header: string): string | 'skip' | null {
  const raw = String(header ?? '').trim();
  if (!raw) return 'skip';
  if (raw.startsWith('__')) return 'skip';
  // DB-driven mapping wins
  const db = getMappedField('docs', raw, 'warranty');
  if (db === 'skip') return 'skip';
  if (db) return db;
  const lower = raw.toLowerCase();
  // Tread headers (no DB seed for these — fallback)
  if (/^tread\s*\d/i.test(raw)) {
    const key = raw
      .toLowerCase()
      .replace(/^tread\s*/i, 'tread_')
      .replace(/\s+.*$/, '')
      .replace(/-/g, '_')
      .replace(/[^\w]/g, '');
    return `thread:${key || 'tread_unknown'}`;
  }
  return FALLBACK_ALIASES[lower] ?? null;
}

/** Parse "(16.7.2025)" or "on 18.9.2025" out of a Tread header. */
function extractDateFromHeader(header: string): string | null {
  const m = header.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
  if (!m) return null;
  const [, d, mm, y] = m;
  const day = String(d).padStart(2, '0');
  const mon = String(mm).padStart(2, '0');
  return `${y}-${mon}-${day}`;
}

function detectHeaderRow(matrix: unknown[][]): { idx: number; cols: Array<{ raw: string; field: string | 'skip' | null }> } | null {
  const limit = Math.min(matrix.length, 25);
  let best: { idx: number; score: number; cols: Array<{ raw: string; field: string | 'skip' | null }> } | null = null;
  for (let r = 0; r < limit; r++) {
    const row = matrix[r] ?? [];
    let score = 0;
    const cols: Array<{ raw: string; field: string | 'skip' | null }> = [];
    for (const cell of row) {
      const raw = String(cell ?? '').trim();
      const m = raw ? mapHeader(raw) : null;
      if (m && m !== 'skip') score++;
      cols.push({ raw, field: m });
    }
    if (!best || score > best.score) best = { idx: r, score, cols };
  }
  if (!best || best.score < 5) return null;
  return { idx: best.idx, cols: best.cols };
}

async function readArrayBuffer(file: File): Promise<ArrayBuffer> {
  return await file.arrayBuffer();
}

export async function getWarrantyExcelSheetNames(file: File): Promise<string[]> {
  const buf = await readArrayBuffer(file);
  const wb = XLSX.read(buf, { type: 'array' });
  return wb.SheetNames;
}

export async function getWarrantyHeaderInfo(
  file: File,
  selectedSheets?: string[],
): Promise<{
  headers: string[];
  samples: Record<string, unknown>;
  fieldByHeader: Record<string, string | null>;
}> {
  const buf = await readArrayBuffer(file);
  const wb = XLSX.read(buf, { type: 'array' });
  const sheets = selectedSheets && selectedSheets.length > 0 ? selectedSheets : wb.SheetNames;
  const headerOrder: string[] = [];
  const seen = new Set<string>();
  const samples: Record<string, unknown> = {};
  const fieldByHeader: Record<string, string | null> = {};
  for (const sheetName of sheets) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
    const detected = detectHeaderRow(matrix);
    if (!detected) continue;
    for (const c of detected.cols) {
      if (!c.raw) continue;
      if (!seen.has(c.raw)) {
        seen.add(c.raw);
        headerOrder.push(c.raw);
        fieldByHeader[c.raw] = c.field && c.field !== 'skip' ? c.field : null;
      }
    }
    const startRow = detected.idx + 1;
    const lastRow = Math.min(matrix.length, startRow + 30);
    for (let r = startRow; r < lastRow; r++) {
      const dataRow = matrix[r] ?? [];
      for (let c = 0; c < detected.cols.length; c++) {
        const label = detected.cols[c].raw;
        if (!label || samples[label] != null) continue;
        const v = dataRow[c];
        if (v != null && String(v).trim() !== '') samples[label] = v;
      }
    }
  }
  return { headers: headerOrder, samples, fieldByHeader };
}

export async function parseWarrantyExcel(
  file: File,
  selectedSheets?: string[],
  options?: { excludedHeaders?: string[] },
): Promise<ParseWarrantyResult> {
  const buf = await readArrayBuffer(file);
  const wb = XLSX.read(buf, { type: 'array' });
  const sheets = selectedSheets && selectedSheets.length > 0 ? selectedSheets : wb.SheetNames;
  const excludedSet = new Set((options?.excludedHeaders ?? []).map((h) => h.trim()).filter(Boolean));
  const excludedFields = new Set<string>();

  const rows: ParsedWarrantyRow[] = [];
  const sheetSummary: ParseWarrantyResult['sheets'] = [];
  const unknown = new Set<string>();

  for (const sheetName of sheets) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
    const detected = detectHeaderRow(matrix);
    if (!detected) {
      sheetSummary.push({ name: sheetName, headerCount: 0, rowCount: 0 });
      continue;
    }
    for (const c of detected.cols) {
      if (c.raw && (!c.field || c.field === null)) unknown.add(c.raw);
    }

    let count = 0;
    for (let r = detected.idx + 1; r < matrix.length; r++) {
      const dataRow = matrix[r] ?? [];
      const payload: Record<string, unknown> = {};
      const struct: Record<string, any> = {};
      const threads: WarrantyThreadInput[] = [];
      let threadOrder = 0;

      for (let c = 0; c < detected.cols.length; c++) {
        const col = detected.cols[c];
        if (col.raw) payload[col.raw] = dataRow[c];
        if (!col.field || col.field === 'skip') continue;
        const isExcluded = !!(col.raw && excludedSet.has(col.raw));
        if (isExcluded) {
          if (col.field !== 'item_no') excludedFields.add(col.field);
          continue;
        }
        const f = col.field;
        const v = dataRow[c];

        if (f.startsWith('thread:')) {
          const content = toText(v);
          if (!content && !col.raw) continue;
          // Always record the thread header even when empty content — Detail
          // page may want to show the slot. Skip only if BOTH header & content
          // are blank.
          if (!content) continue;
          const key = f.slice('thread:'.length);
          threads.push({
            thread_label: key,
            display_label: col.raw,
            thread_date: extractDateFromHeader(col.raw),
            action_party: /action party/i.test(col.raw) ? content : null,
            content,
            sort_order: threadOrder++,
          });
          continue;
        }

        if (f.endsWith('_date')) struct[f] = normalizeDate(v);
        else if (f === 'item_no' || f === 'warranty_period_years') struct[f] = toIntOrNull(v);
        else if (
          f === 'draft_status' || f === 'subcon_signing_status' ||
          f === 'hdec_signing_status' || f === 'final_status'
        ) struct[f] = normalizeWarrantyStatus(v);
        else struct[f] = toText(v);
      }

      const itemNo = struct.item_no;
      const warranted = struct.warranted_item;
      // Skip rows that have neither item_no nor warranted_item.
      if (itemNo == null && !warranted) continue;

      const teamRaw = toText(struct.team);
      const team = normalizeTeamValue(teamRaw) ?? teamRaw;

      rows.push({
        rawRowNo: r + 1,
        sheetName,
        item_no: itemNo ?? null,
        category: toText(struct.category),
        warranted_item: warranted ?? null,
        team,
        hdec_pic_name: toText(struct.hdec_pic_name),
        hdec_eng_name: toText(struct.hdec_eng_name),
        warranty_period_years: struct.warranty_period_years ?? null,
        contract_spec_ref: toText(struct.contract_spec_ref),
        r_works_description: toText(struct.r_works_description),
        subcontractor_name: toText(struct.subcontractor_name),
        r_acra_reg_no: toText(struct.r_acra_reg_no),
        r_acra_address: toText(struct.r_acra_address),
        r_subcontract_date: struct.r_subcontract_date ?? null,
        r_brief_description: toText(struct.r_brief_description),
        r_director_1: toText(struct.r_director_1),
        r_director_2: toText(struct.r_director_2),
        r_witness: toText(struct.r_witness),
        acra_info_status: toText(struct.acra_info_status),
        draft_planned_date: struct.draft_planned_date ?? null,
        draft_actual_date: struct.draft_actual_date ?? null,
        draft_response_planned_date: struct.draft_response_planned_date ?? null,
        draft_response_actual_date: struct.draft_response_actual_date ?? null,
        draft_status: struct.draft_status ?? null,
        subcon_signing_planned_date: struct.subcon_signing_planned_date ?? null,
        subcon_signing_actual_date: struct.subcon_signing_actual_date ?? null,
        subcon_signing_status: struct.subcon_signing_status ?? null,
        hdec_signing_planned_date: struct.hdec_signing_planned_date ?? null,
        hdec_signing_actual_date: struct.hdec_signing_actual_date ?? null,
        hdec_signing_status: struct.hdec_signing_status ?? null,
        final_planned_date: struct.final_planned_date ?? null,
        final_actual_date: struct.final_actual_date ?? null,
        final_status: struct.final_status ?? null,
        remarks: toText(struct.remarks),
        threads,
        raw_payload: payload,
      });
      count++;
    }
    sheetSummary.push({
      name: sheetName,
      headerCount: detected.cols.filter((c) => c.raw).length,
      rowCount: count,
    });
  }

  // Suppress unknown 'STATUS_TOKENS' lint
  void STATUS_TOKENS;

  return {
    rows,
    sheetCount: sheets.length,
    sheets: sheetSummary,
    unknownHeaders: [...unknown].sort(),
    excludedFields,
  };
}
