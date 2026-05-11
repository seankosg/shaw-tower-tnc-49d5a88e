import * as XLSX from 'xlsx';
import { normalizeDate } from '@/lib/defect-parser';
import { getMappedField } from '@/lib/header-mappings-cache';
import { normalizeTeamValue } from '@/types/enums';

/**
 * OMM (Operation & Maintenance Manual) Excel parser.
 * Single-row header. Headers are normalized via lowercased + trimmed and
 * resolved against admin-managed import_header_mappings (sub_module='omm').
 */

export interface ParsedOmmRow {
  rawRowNo: number;
  sheetName: string;
  sn: string | null;
  category: string | null;        // from TEAM column → normalized
  category_group: string | null;  // from "Category" column (Architectural / M&E / Misc)
  section: string | null;
  work_trade_material: string | null;
  subcontractor_name: string | null;
  team: string | null;
  training_required: string | null;
  pdf_required_qty: number | null;
  pdf_actual_qty: number | null;
  hardcopy_required_qty: number | null;
  hardcopy_actual_qty: number | null;
  instruction_date: string | null;
  // DEPRECATED legacy draft fields (kept for backward read; new imports populate sub1_*)
  draft_planned_date: string | null;
  draft_actual_date: string | null;
  draft_response_date: string | null;
  draft_response_status: string | null;
  // New cycle model: 1st / 2nd / 3rd resubmission
  sub1_planned_date: string | null;
  sub1_actual_date: string | null;
  sub1_response_date: string | null;
  sub1_response_status: string | null;
  sub2_planned_date: string | null;
  sub2_actual_date: string | null;
  sub2_response_planned_date: string | null;
  sub2_response_actual_date: string | null;
  sub2_response_status: string | null;
  sub3_planned_date: string | null;
  sub3_actual_date: string | null;
  sub3_response_planned_date: string | null;
  sub3_response_actual_date: string | null;
  sub3_response_status: string | null;
  final_planned_date: string | null;
  final_actual_date: string | null;
  final_response_planned_date: string | null;
  final_response_actual_date: string | null;
  final_response_status: string | null;
  hdec_pic_name: string | null;
  hdec_eng_name: string | null;
  remarks: string | null;
  raw_payload: Record<string, unknown>;
}

export interface ParseOmmResult {
  rows: ParsedOmmRow[];
  sheetCount: number;
  sheets: Array<{ name: string; headerCount: number; rowCount: number }>;
  unknownHeaders: string[];
  /** Canonical field names the user excluded via column-select. Workers skip
   *  these on UPDATE so existing DB values are preserved. The system-required
   *  key (sn) is forcibly removed and can never be excluded. */
  excludedFields: Set<string>;
}

function normalizeHeader(value: unknown): string {
  let s = String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .trim();
  // Strip parenthetical qualifiers: "Readible PDF (Req)" → "readible pdf"
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  // SHAW abbreviations: "D." / "F." prefix (with or without trailing space) → draft / final
  s = s.replace(/^d\.\s*/, 'draft ').replace(/^f\.\s*/, 'final ');
  // Standalone "d " / "f " prefix when followed by known tokens → draft / final
  s = s.replace(/^d\s+(?=submission|response|actual|planned|respond)/, 'draft ');
  s = s.replace(/^f\s+(?=submission|response|actual|planned|respond)/, 'final ');
  // Ordinal normalization: keep "1st/2nd/3rd" tokens intact
  // SHAW form: "Submission" is implicit when not preceded by an ordinal — drop it.
  // For "1st submission planned" / "2nd submission actual" we KEEP "submission" so
  // FALLBACK_ALIASES can match the explicit form. Only strip when followed by a
  // descriptor that is otherwise unambiguous (e.g. "draft submission planned").
  s = s.replace(/(?<!\b(?:1st|2nd|3rd|sub1|sub2|sub3)\s)\bsubmission\s+/g, '');
  // Variant spellings
  s = s.replace(/\brespond\b/g, 'response');
  s = s.replace(/\btraning\b/g, 'training');
  // Order normalization to canonical "<stage> response <kind> date"
  s = s.replace(/^(draft|final|sub1|sub2|sub3) actual response date$/, '$1 response actual date');
  s = s.replace(/^(draft|final|sub1|sub2|sub3) planned response date$/, '$1 response planned date');
  s = s.replace(/^(1st|2nd|3rd) actual response$/, '$1 response actual');
  s = s.replace(/^(1st|2nd|3rd) planned response$/, '$1 response planned');
  return s.replace(/\s+/g, ' ').trim();
}

function toText(value: unknown): string | null {
  if (value == null) return null;
  const t = String(value).trim();
  return t === '' ? null : t;
}

function toIntOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function normalizeStatusLetter(value: unknown): string | null {
  const t = toText(value);
  if (!t) return null;
  const u = t.toUpperCase();
  if (u === 'A' || u === 'B' || u === 'C') return u;
  if (u.startsWith('APPROV')) return 'A';
  return null;
}

/** Built-in fallback aliases (used when DB mapping is missing). */
const FALLBACK_ALIASES: Record<string, string | 'skip'> = {
  'sn': 'sn',
  's/n': 'sn',
  'sno': 'sn',
  'no': 'skip',
  'no.': 'skip',
  's. no': 'sn',
  's. no.': 'sn',
  'category': 'category_group',
  'team': 'category',
  'section': 'section',
  'work / trade / material': 'work_trade_material',
  'work/trade/material': 'work_trade_material',
  'work trade material': 'work_trade_material',
  'subcontractor': 'subcontractor_name',
  'sub-contractor': 'subcontractor_name',
  'subcontractor name': 'subcontractor_name',
  'training required': 'training_required',
  'training': 'training_required',
  // SHAW export short labels (PDF Required / PDF Actual / HC Required / HC Actual)
  'readible pdf': 'pdf_required_qty',
  'readable pdf': 'pdf_required_qty',
  'pdf': 'pdf_required_qty',
  'pdf required': 'pdf_required_qty',
  'pdf required qty': 'pdf_required_qty',
  'pdf check': 'pdf_actual_qty',
  'pdf actual': 'pdf_actual_qty',
  'pdf actual qty': 'pdf_actual_qty',
  'hardcopy': 'hardcopy_required_qty',
  'hard copy': 'hardcopy_required_qty',
  'hardcopy required': 'hardcopy_required_qty',
  'hardcopy required qty': 'hardcopy_required_qty',
  'hc required': 'hardcopy_required_qty',
  'hc required qty': 'hardcopy_required_qty',
  'hardcopy check': 'hardcopy_actual_qty',
  'hard copy check': 'hardcopy_actual_qty',
  'hardcopy actual': 'hardcopy_actual_qty',
  'hardcopy actual qty': 'hardcopy_actual_qty',
  'hc actual': 'hardcopy_actual_qty',
  'hc actual qty': 'hardcopy_actual_qty',
  'instruction date': 'instruction_date',
  'instruction': 'instruction_date',
  'draft planned date': 'draft_planned_date',
  'draft planned': 'draft_planned_date',
  'draft actual date': 'draft_actual_date',
  'draft actual': 'draft_actual_date',
  'draft response date': 'draft_response_date',
  'draft response': 'draft_response_date',
  'draft response status': 'draft_response_status',
  'draft response (a/b/c)': 'draft_response_status',
  'draft response a/b/c': 'draft_response_status',
  'final planned date': 'final_planned_date',
  'final planned': 'final_planned_date',
  'final actual date': 'final_actual_date',
  'final actual': 'final_actual_date',
  'final response planned date': 'final_response_planned_date',
  'final response planned': 'final_response_planned_date',
  'final response actual date': 'final_response_actual_date',
  'final response actual': 'final_response_actual_date',
  'final response status': 'final_response_status',
  'final response (a/b/c)': 'final_response_status',
  'final response a/b/c': 'final_response_status',
  'hdec pic': 'hdec_pic_name',
  'hdec p.i.c': 'hdec_pic_name',
  'hdec p.i.c.': 'hdec_pic_name',
  'pic': 'hdec_pic_name',
  'hdec eng': 'hdec_eng_name',
  'hdec engineer': 'hdec_eng_name',
  'remarks': 'remarks',
  'remark': 'remarks',
  'note': 'remarks',
  'notes': 'remarks',
  // SHAW export system / derived columns — non-importable
  'cycle': 'skip',
  'cycle progress': 'skip',
  'cycle_progress': 'skip',
  'status': 'skip',
  'risk': 'skip',
};

function mapHeader(header: string): string | 'skip' | null {
  const rawTrim = String(header ?? '').trim();
  if (rawTrim.startsWith('__')) return 'skip';
  const norm = normalizeHeader(header);
  if (!norm) return 'skip';
  // DB-driven mapping first (admin can override)
  const db = getMappedField('docs', norm, 'omm');
  if (db === 'skip') return 'skip';
  if (db) return db;
  return FALLBACK_ALIASES[norm] ?? null;
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
  if (!best || best.score < 4) return null;
  return { idx: best.idx, cols: best.cols };
}

async function readArrayBuffer(file: File): Promise<ArrayBuffer> {
  return await file.arrayBuffer();
}

export async function getOmmExcelSheetNames(file: File): Promise<string[]> {
  const buf = await readArrayBuffer(file);
  const wb = XLSX.read(buf, { type: 'array' });
  return wb.SheetNames;
}

/**
 * Inspect the workbook and return every detected header label across the given
 * sheets, plus a first non-empty sample value per header and the structured
 * field it maps to. Used by the column-select dialog in the Docs OMM import UI.
 */
export async function getOmmHeaderInfo(
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
    const lastRow = Math.min(matrix.length, startRow + 20);
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

export async function parseOmmExcel(
  file: File,
  selectedSheets?: string[],
  options?: { excludedHeaders?: string[] },
): Promise<ParseOmmResult> {
  const buf = await readArrayBuffer(file);
  const wb = XLSX.read(buf, { type: 'array' });
  const sheets = selectedSheets && selectedSheets.length > 0 ? selectedSheets : wb.SheetNames;
  const excludedSet = new Set((options?.excludedHeaders ?? []).map((h) => h.trim()).filter(Boolean));
  // Track canonical fields the user excluded — workers will skip them on UPDATE.
  const excludedFields = new Set<string>();

  const rows: ParsedOmmRow[] = [];
  const sheetSummary: ParseOmmResult['sheets'] = [];
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
      for (let c = 0; c < detected.cols.length; c++) {
        const col = detected.cols[c];
        if (col.raw) payload[col.raw] = dataRow[c];
        if (!col.field || col.field === 'skip') continue;
        const isExcluded = !!(col.raw && excludedSet.has(col.raw));
        if (isExcluded) {
          // Track canonical excluded field (skip system-required key `sn`).
          if (col.field !== 'sn') excludedFields.add(col.field);
          // `team` is derived from `category`; if user excluded `category`,
          // also preserve existing `team` (do not overwrite from null fallback).
          if (col.field === 'category') excludedFields.add('team');
          continue;
        }
        const f = col.field;
        const v = dataRow[c];
        if (f.endsWith('_date')) struct[f] = normalizeDate(v);
        else if (f.endsWith('_qty')) struct[f] = toIntOrNull(v);
        else if (f === 'draft_response_status' || f === 'final_response_status') struct[f] = normalizeStatusLetter(v);
        else struct[f] = toText(v);
      }

      const sn = struct.sn ? String(struct.sn).trim() : '';
      const wtm = struct.work_trade_material ?? null;
      // Skip empty rows: must have either sn or work/trade/material
      if (!sn && !wtm) continue;

      const teamRaw = struct.category ?? null; // Excel TEAM
      const category = teamRaw ? String(teamRaw).trim() : null;
      const team = normalizeTeamValue(category);

      rows.push({
        rawRowNo: r + 1,
        sheetName,
        sn: sn || null,
        category,
        category_group: struct.category_group ?? null,
        section: struct.section ?? null,
        work_trade_material: wtm,
        subcontractor_name: struct.subcontractor_name ?? null,
        team,
        training_required: struct.training_required ?? null,
        pdf_required_qty: struct.pdf_required_qty ?? null,
        pdf_actual_qty: struct.pdf_actual_qty ?? null,
        hardcopy_required_qty: struct.hardcopy_required_qty ?? null,
        hardcopy_actual_qty: struct.hardcopy_actual_qty ?? null,
        instruction_date: struct.instruction_date ?? null,
        draft_planned_date: struct.draft_planned_date ?? null,
        draft_actual_date: struct.draft_actual_date ?? null,
        draft_response_date: struct.draft_response_date ?? null,
        draft_response_status: struct.draft_response_status ?? null,
        final_planned_date: struct.final_planned_date ?? null,
        final_actual_date: struct.final_actual_date ?? null,
        final_response_planned_date: struct.final_response_planned_date ?? null,
        final_response_actual_date: struct.final_response_actual_date ?? null,
        final_response_status: struct.final_response_status ?? null,
        hdec_pic_name: struct.hdec_pic_name ?? null,
        hdec_eng_name: struct.hdec_eng_name ?? null,
        remarks: struct.remarks ?? null,
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

  return {
    rows,
    sheetCount: sheets.length,
    sheets: sheetSummary,
    unknownHeaders: [...unknown].sort(),
    excludedFields,
  };
}

