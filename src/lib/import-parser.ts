import * as XLSX from 'xlsx';
import { getMappedField } from '@/lib/header-mappings-cache';
import {
  coerceCustomValue,
  getCustomField,
  isCustomTarget,
  parseCustomTarget,
} from '@/lib/custom-fields-cache';

// ── Header normalization ──────────────────────────────────────────────
const HEADER_MAP: Record<string, string> = {
  system: 'system',
  'system name': 'system',
  itemno: 'item_no',
  'item no': 'item_no',
  'item_no': 'item_no',
  team: 'team',
  level: 'level',
  lv: 'level',
  equipment: 'equipment',
  description: 'description',
  'mos-1': 'mos_1',
  'mos-2': 'mos_2',
  'mos-3': 'mos_3',
  'mos-4': 'mos_4',
  'mos-5': 'mos_5',
  'mos code': 'mos_code',
  'mos_code': 'mos_code',
  moscode: 'mos_code',
  'subtest id': 'subtest_id',
  subtestid: 'subtest_id',
  'subtest_id': 'subtest_id',
  't1 planned': 't1_planned_date',
  't1planned': 't1_planned_date',
  't1 planned date': 't1_planned_date',
  't1_planned_date': 't1_planned_date',
  't1 date': 't1_planned_date',
  't1date': 't1_planned_date',
  't1 status': 't1_status',
  't1status': 't1_status',
  't1_status': 't1_status',
  't2 planned': 't2_planned_date',
  't2planned': 't2_planned_date',
  't2 planned date': 't2_planned_date',
  't2_planned_date': 't2_planned_date',
  't2 date': 't2_planned_date',
  't2date': 't2_planned_date',
  't2 status': 't2_status',
  't2status': 't2_status',
  't2_status': 't2_status',
  'predecessor status': 'predecessor_status_raw',
  'pre decessor status': 'predecessor_status_raw',
  'pre decessor': 'predecessor_status_raw',
  'precessor status': 'predecessor_status_raw',
  'predecessor': 'predecessor_status_raw',
  'predecessor_status_raw': 'predecessor_status_raw',
  subcontractor: 'subcontractor_name',
  'subcontractor name': 'subcontractor_name',
  'subcontractor_name': 'subcontractor_name',
  subsub: 'subsub_name',
  'sub-sub': 'subsub_name',
  'sub sub': 'subsub_name',
  'sub_sub': 'subsub_name',
  'subsub name': 'subsub_name',
  'subsub_name': 'subsub_name',
  'sub-sub name': 'subsub_name',
  'sub-subcontractor': 'subsub_name',
  'sub subcontractor': 'subsub_name',
  'subsubcontractor': 'subsub_name',
  'sub_subcontractor': 'subsub_name',
  'sub-sub contractor': 'subsub_name',
  'sub-sub-contractor': 'subsub_name',
  'hdec pic': 'hdec_pic_name',
  'hdecpic': 'hdec_pic_name',
  'hdec_pic_name': 'hdec_pic_name',
  'hdec pic name': 'hdec_pic_name',
  // Legacy R1/R2 columns historically held free-text (report ref no., remarks)
  // — routed through smart splitter into r1_status/r1_report_ref (R1)
  //   or r2_status/aconex_ref_no (R2).
  'r1 status': 'r1_status',
  'r1status': 'r1_status',
  'r1_status': 'r1_status',
  'r1': 'r1_status',
  'r1 (report review)': 'r1_status',
  'r1 report review': 'r1_status',
  'r2 status': 'r2_status',
  'r2status': 'r2_status',
  'r2_status': 'r2_status',
  'r2': 'r2_status',
  'r2 (review by consultant)': 'r2_status',
  'r2 review by consultant': 'r2_status',
  // R1 / R2 new fields (target / actual dates, refs)
  'r1 report ref': 'r1_report_ref',
  'r1 report reference': 'r1_report_ref',
  'r1_report_ref': 'r1_report_ref',
  'r1 ref': 'r1_report_ref',
  'r1 target submission': 'r1_target_submission_date',
  'r1 target submission date': 'r1_target_submission_date',
  'r1_target_submission_date': 'r1_target_submission_date',
  'r1 actual submission': 'r1_actual_submission_date',
  'r1 actual submission date': 'r1_actual_submission_date',
  'r1_actual_submission_date': 'r1_actual_submission_date',
  'r2 target submission': 'r2_target_submission_date',
  'r2 target submission date': 'r2_target_submission_date',
  'r2_target_submission_date': 'r2_target_submission_date',
  'r2 actual submission': 'r2_actual_submission_date',
  'r2 actual submission date': 'r2_actual_submission_date',
  'r2_actual_submission_date': 'r2_actual_submission_date',
  'r2 target approval': 'r2_target_approval_date',
  'r2 target approval date': 'r2_target_approval_date',
  'r2_target_approval_date': 'r2_target_approval_date',
  'r2 actual approval': 'r2_actual_approval_date',
  'r2 actual approval date': 'r2_actual_approval_date',
  'r2_actual_approval_date': 'r2_actual_approval_date',
  'aconex': 'aconex_ref_no',
  'aconex ref': 'aconex_ref_no',
  'aconex ref no': 'aconex_ref_no',
  'aconex_ref_no': 'aconex_ref_no',
  'aconex no': 'aconex_ref_no',
  'remarks': 'remarks',
  'remark': 'remarks',
  'note': 'remarks',
  'notes': 'remarks',
  'punchlist': 'punchlist_comments',
  'punch list': 'punchlist_comments',
  'punchlist comments': 'punchlist_comments',
  'punch list comments': 'punchlist_comments',
  'punchlist_comments': 'punchlist_comments',
  'punchlist comment': 'punchlist_comments',
  source: 'source',
  updated: 'updated_at',
  'updated at': 'updated_at',
  updated_at: 'updated_at',
};

/** Strip trailing decoration markers like "(H)" used in some templates. */
function cleanHeader(raw: string): string {
  return String(raw ?? '').replace(/\s*\(H\)\s*$/i, '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeHeader(raw: string): string {
  const cleaned = cleanHeader(raw).toLowerCase();
  // DB-managed mapping wins, hardcoded HEADER_MAP is the fallback when DB cache misses or is unloaded.
  return getMappedField('tnc', cleaned) ?? HEADER_MAP[cleaned] ?? cleaned;
}

// ── Date normalization (delegated to shared module) ──────────────────
import { normalizeDate as _normalizeDate, parseDate } from '@/lib/date-normalize';
const normalizeDate = _normalizeDate;
export { parseDate };

const SUBTEST_DATE_FIELDS = [
  't1_planned_date', 't2_planned_date',
  'r1_target_submission_date', 'r1_actual_submission_date',
  'r2_target_submission_date', 'r2_actual_submission_date',
  'r2_target_approval_date', 'r2_actual_approval_date',
] as const;

/**
 * Parse all known date fields from a raw row, collecting any unparseable
 * cells as warnings for downstream field-log emission.
 */
function pickSubtestDates(row: Record<string, any>) {
  const out: Record<string, string | null> = {};
  const warnings: Array<{ field: string; raw: string }> = [];
  for (const f of SUBTEST_DATE_FIELDS) {
    const r = parseDate(row[f]);
    out[f] = r.date;
    if (r.mode === 'unparseable' && r.raw) {
      warnings.push({ field: f, raw: r.raw });
    }
  }
  return { dates: out, warnings };
}


function normalizeStatus(val: any): string | null {
  if (val == null || val === '') return null;
  const s = String(val).trim();
  const map: Record<string, string> = { planned: 'Planned', wip: 'WIP', done: 'Done', hold: 'Hold' };
  return map[s.toLowerCase()] || s;
}

// Recognised R1/R2 enum values (PostgreSQL public.report_status)
const REPORT_STATUS_MAP: Record<string, string> = {
  planned: 'Planned',
  submitted: 'Submitted',
  'under review': 'Under Review',
  underreview: 'Under Review',
  'in review': 'Under Review',
  approved: 'Approved',
  approval: 'Approved',
  returned: 'Returned',
  rejected: 'Returned',
};

/**
 * Try to interpret a cell value as a report_status enum.
 * Returns the canonical enum label or null if not recognised.
 */
export function normalizeReportStatus(val: any): string | null {
  if (val == null || val === '') return null;
  const key = String(val).trim().toLowerCase();
  return REPORT_STATUS_MAP[key] || null;
}

/**
 * Smart split for legacy R1/R2 free-text columns:
 * - If value matches an enum (Submitted/Approved/...) → status only.
 * - Otherwise treat as a free-text reference (report no., remarks).
 */
export function splitReportField(val: any): { status: string | null; ref: string | null } {
  if (val == null || val === '') return { status: null, ref: null };
  const enumVal = normalizeReportStatus(val);
  if (enumVal) return { status: enumVal, ref: null };
  const trimmed = String(val).trim();
  return { status: null, ref: trimmed || null };
}

function normalizeTeam(val: any): string | null {
  if (val == null || val === '') return null;
  const s = String(val).trim();
  if (s.toLowerCase() === 'clear') return 'clear';
  const key = s.toLowerCase().replace(/[^a-z]/g, '');
  const map: Record<string, string> = {
    mech: 'Mech', mecha: 'Mech', mechanical: 'Mech',
    elec: 'Elec', electrical: 'Elec', electric: 'Elec',
    arch: 'Arch', archi: 'Arch', architecture: 'Arch', architectural: 'Arch',
    facade: 'Arch',
    supp: 'Supp', support: 'Supp', supplier: 'Supp',
    external: 'Supp',
    design: 'Design', designer: 'Design',
  };
  return map[key] || null;
}

function normalizePredecessor(val: any): string | null {
  if (val == null || val === '') return null;
  const s = String(val).trim();
  if (s.toLowerCase() === 'done') return 'Done';
  const d = normalizeDate(val);
  return d || s;
}

/**
 * Parse predecessor cell into normalized fields.
 * Returns { raw, status, plannedDate, actualDate }.
 * - Date value → status='Planned', plannedDate=date
 * - 'done'/'완료'/'complete' → status='Done', no date set (caller fills actual)
 * - Other text → raw kept, no status
 * - Empty → all null
 */
export interface ParsedPredecessor {
  raw: string | null;
  status: 'Planned' | 'Done' | null;
  plannedDate: string | null;
  actualDate: string | null;
}

const PRED_DONE_KEYWORDS = ['done', 'complete', 'completed', 'finished', '완료'];

export function parsePredecessor(val: any): ParsedPredecessor {
  if (val == null || val === '') {
    return { raw: null, status: null, plannedDate: null, actualDate: null };
  }
  const s = String(val).trim();
  if (!s) return { raw: null, status: null, plannedDate: null, actualDate: null };

  // Done keyword check
  const lower = s.toLowerCase();
  if (PRED_DONE_KEYWORDS.some(k => lower === k || lower.includes(k))) {
    return { raw: 'Done', status: 'Done', plannedDate: null, actualDate: null };
  }

  // Try date parse
  const d = normalizeDate(val);
  if (d) {
    return { raw: d, status: 'Planned', plannedDate: d, actualDate: null };
  }

  // Other text — keep raw, no normalized status
  return { raw: s, status: null, plannedDate: null, actualDate: null };
}

// ── Parsed row type ───────────────────────────────────────────────────
export interface ParsedSubtest {
  raw_row_no: number;
  raw_system_name: string;
  item_no: string;
  team: string | null;
  level: string | null;
  equipment: string | null;
  description: string | null;
  mos_code: string;
  subtest_id: string;
  t1_planned_date: string | null;
  t1_status: string | null;
  t2_planned_date: string | null;
  t2_status: string | null;
  predecessor_status_raw: string | null;
  pred_status: 'Planned' | 'Done' | null;
  pred_planned_date: string | null;
  pred_actual_date: string | null;
  subcontractor_name: string | null;
  subsub_name: string | null;
  hdec_pic_name: string | null;
  // R1 — subcontractor → HDEC report
  r1_status: string | null;            // enum-narrowed (or null when source value is free-text)
  r1_report_ref: string | null;        // free-text report reference (legacy R1 column)
  r1_target_submission_date: string | null;
  r1_actual_submission_date: string | null;
  // R2 — HDEC → client report
  r2_status: string | null;            // enum-narrowed (or null when source value is free-text)
  aconex_ref_no: string | null;        // R2 free-text fallback also lands here
  r2_target_submission_date: string | null;
  r2_actual_submission_date: string | null;
  r2_target_approval_date: string | null;
  r2_actual_approval_date: string | null;
  remarks: string | null;
  punchlist_comments: string | null;
  custom_payload: Record<string, string | number | boolean | null>;
  custom_field_errors: Array<{ field_name: string; raw: string; reason: string }>;
  /** Date cells that contained text but couldn't be parsed (for field log warnings). */
  _dateWarnings?: Array<{ field: string; raw: string }>;
}

// ── Known target field names (after normalization) ───────────────────
export const KNOWN_FIELDS = new Set<string>([
  'system', 'item_no', 'team', 'level', 'equipment', 'description',
  'mos_1', 'mos_2', 'mos_3', 'mos_4', 'mos_5', 'mos_code', 'subtest_id',
  't1_planned_date', 't1_status', 't2_planned_date', 't2_status',
  'predecessor_status_raw',
  'subcontractor_name', 'subsub_name', 'hdec_pic_name',
  'r1_status', 'r1_report_ref', 'r1_target_submission_date', 'r1_actual_submission_date',
  'r2_status', 'aconex_ref_no',
  'r2_target_submission_date', 'r2_actual_submission_date',
  'r2_target_approval_date', 'r2_actual_approval_date',
  'remarks', 'punchlist_comments',
  'source', 'updated_at',
]);

export type DetectedImportType = 'legacy' | 'standard' | 'unknown';

export function detectImportType(mappedHeaders: string[]): { type: DetectedImportType; reasons: string[] } {
  const headers = new Set(mappedHeaders.filter(Boolean));
  const hasLegacyMos = ['mos_1', 'mos_2', 'mos_3', 'mos_4', 'mos_5'].some(h => headers.has(h));
  const hasMosCode = headers.has('mos_code');
  const standardSignalCount = [
    headers.has('subtest_id'),
    headers.has('t1_planned_date') || headers.has('t1_status'),
    headers.has('t2_planned_date') || headers.has('t2_status'),
    headers.has('team'),
    headers.has('source') || headers.has('updated_at'),
  ].filter(Boolean).length;

  if (hasLegacyMos) return { type: 'legacy', reasons: ['MOS-1~5'] };
  if (hasMosCode && standardSignalCount > 0) return { type: 'standard', reasons: ['MOS Code', `${standardSignalCount} standard signal(s)`] };
  return { type: 'unknown', reasons: hasMosCode ? ['MOS Code only'] : ['No MOS structure'] };
}

export interface ParseExcelResult {
  rows: Record<string, string>[];
  rawHeaders: string[];
  mappedHeaders: string[];
  unmappedHeaders: string[];
  resolvedSheetName?: string;
  /** 0-based index of the header row that was actually used. */
  headerRowIdx?: number;
  /** True when the detector could not find a key column and fell back to row 0. */
  headerAutodetected?: boolean;
}

// ── Header auto-detection ─────────────────────────────────────────────
// Scan up to this many rows from the top of a sheet looking for the header row.
const HEADER_SCAN_LIMIT = 20;

// A row qualifies as the header if any of its cells normalizes to one of these targets.
const TNC_HEADER_KEY_FIELDS = new Set<string>([
  'item_no', 'subtest_id', 'mos_code',
  'mos_1', 'mos_2', 'mos_3', 'mos_4', 'mos_5',
]);

function detectTncHeaderRow(ws: XLSX.WorkSheet): { headerRowIdx: number; headers: string[] } | null {
  // blankrows:true keeps row indices aligned with sheet coordinates so that
  // sheet_to_json({range: idx}) downstream picks up the right starting row.
  const matrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: true });
  const limit = Math.min(matrix.length, HEADER_SCAN_LIMIT);
  for (let i = 0; i < limit; i += 1) {
    const row = matrix[i] ?? [];
    const headers = row.map((c: any) => cleanHeader(c));
    const mapped = headers.map((h) => normalizeHeader(h));
    if (mapped.some((m) => TNC_HEADER_KEY_FIELDS.has(m))) {
      return { headerRowIdx: i, headers };
    }
  }
  return null;
}

// ── Parse Excel file ──────────────────────────────────────────────────
/**
 * Parse a single sheet from an Excel buffer.
 *
 * Behaviour (mirrors Defect parser):
 *  - If `sheetName` is provided, only that sheet is considered. Otherwise every
 *    sheet is scanned and the first one whose top rows contain a recognisable
 *    header (item_no / subtest_id / mos_code / mos_1..5) is used.
 *  - Header row may sit anywhere in the first 20 rows — title/meta rows above
 *    are skipped.
 *  - If no sheet yields a detected header, falls back to the original
 *    "first sheet, row 0 = header" behaviour for backwards compatibility.
 */
export function parseExcelFile(file: ArrayBuffer, sheetName?: string): ParseExcelResult {
  const wb = XLSX.read(file, { type: 'array', cellDates: false });
  const allSheets = wb.SheetNames ?? [];
  if (allSheets.length === 0) {
    return { rows: [], rawHeaders: [], mappedHeaders: [], unmappedHeaders: [] };
  }

  const sheetsToScan = sheetName && allSheets.includes(sheetName) ? [sheetName] : allSheets;

  let chosen: { name: string; ws: XLSX.WorkSheet; headerRowIdx: number; headers: string[] } | null = null;
  let headerOnlyFallback: { name: string; ws: XLSX.WorkSheet; headerRowIdx: number; headers: string[] } | null = null;

  for (const name of sheetsToScan) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const detected = detectTncHeaderRow(ws);
    if (!detected) continue;

    // Probe whether there is at least one data row after the detected header.
    const probe: any[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: '',
      blankrows: false,
      range: detected.headerRowIdx + 1,
    });
    const hasData = probe.some((r) => r.some((c: any) => c !== '' && c != null));

    if (hasData) {
      chosen = { name, ws, headerRowIdx: detected.headerRowIdx, headers: detected.headers };
      break;
    }
    if (!headerOnlyFallback) {
      headerOnlyFallback = { name, ws, headerRowIdx: detected.headerRowIdx, headers: detected.headers };
    }
  }

  // Strict mode: if a sheet was specifically requested but detection failed,
  // try detection only on that sheet — if still nothing, fall through to row-0
  // fallback against the requested sheet.
  let autodetected = true;
  if (!chosen && headerOnlyFallback) {
    chosen = headerOnlyFallback;
  }
  if (!chosen) {
    autodetected = false;
    const fallbackName = sheetName && allSheets.includes(sheetName) ? sheetName : allSheets[0];
    const ws = wb.Sheets[fallbackName];
    if (!ws) {
      return { rows: [], rawHeaders: [], mappedHeaders: [], unmappedHeaders: [], resolvedSheetName: fallbackName };
    }
    const matrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (matrix.length < 2) {
      return {
        rows: [], rawHeaders: [], mappedHeaders: [], unmappedHeaders: [],
        resolvedSheetName: fallbackName, headerRowIdx: 0, headerAutodetected: false,
      };
    }
    const headerRow = (matrix[0] as any[]).map((h) => cleanHeader(h));
    chosen = { name: fallbackName, ws, headerRowIdx: 0, headers: headerRow };
  }

  // Build rows from chosen sheet starting one row past the header.
  const matrix: any[][] = XLSX.utils.sheet_to_json(chosen.ws, {
    header: 1,
    defval: '',
    blankrows: false,
    range: chosen.headerRowIdx,
  });
  // matrix[0] is the header row we already have; data starts at index 1
  const rawHeaders = chosen.headers.map((h) => String(h ?? '').trim());
  const mappedHeaders = rawHeaders.map((h) => normalizeHeader(h));
  const unmappedHeaders = rawHeaders.filter((h, i) => h !== '' && !KNOWN_FIELDS.has(mappedHeaders[i]));

  const dataRows = matrix.slice(1).filter((row) => row.some((c: any) => c !== '' && c != null));
  // Excel displays rows as 1-based; header is at headerRowIdx+1, data starts at headerRowIdx+2
  const headerExcelRow = chosen.headerRowIdx + 1;
  const rows = dataRows.map((row, idx) => {
    const obj: Record<string, string> = { __row_no: String(headerExcelRow + 1 + idx) };
    mappedHeaders.forEach((h, i) => {
      obj[h] = row[i] != null ? String(row[i]) : '';
    });
    return obj;
  });

  return {
    rows,
    rawHeaders,
    mappedHeaders,
    unmappedHeaders,
    resolvedSheetName: chosen.name,
    headerRowIdx: chosen.headerRowIdx,
    headerAutodetected: autodetected,
  };
}

/** Return the list of sheet names present in an Excel buffer. */
export function getExcelSheetNames(file: ArrayBuffer): string[] {
  const wb = XLSX.read(file, { type: 'array', cellDates: false, bookSheets: true });
  return wb.SheetNames ?? [];
}

// ── Item No carry-forward (parent → /Level child rows) ──────────────
// When a row has empty item_no but Level is filled, treat it as a
// "level breakdown" child of the most recent parent row that *did* have
// an item_no. We assign `${parent}/${normalizedLevel}` as the child's
// item_no so the (item_no, mos_code) unique key holds.
//
// Rules:
//  - Only identity / context fields (system, team, mos_code, equipment,
//    subcontractor, sub-sub, HDEC PIC) are carried forward when the
//    child cell is empty. Description is NOT carried forward (each level
//    typically has its own "_Level N" suffix in the source data).
//  - Progress/report fields (T1/T2/R1/R2 status & dates, predecessor,
//    aconex_ref, remarks, punchlist) are NEVER carried forward — child
//    rows start in Pending state and are filled as work progresses.
//  - If a row has no item_no AND no level, it is left untouched (will
//    be skipped downstream as before).
//  - If a row has no item_no AND a level, but no parent has been seen
//    yet, it is also left untouched (also skipped downstream).
const CARRY_FORWARD_FIELDS = [
  'system', 'team', 'mos_code', 'equipment',
  'subcontractor_name', 'subsub_name', 'hdec_pic_name',
] as const;

function normalizeLevelForItemNo(level: string): string {
  // Trim, collapse internal whitespace, keep original casing for the
  // common pattern (L2, L32, RF, B1, etc.).
  const t = String(level).trim().replace(/\s+/g, '');
  return t;
}

export function applyItemNoCarryForward(
  rows: Record<string, string>[],
): Record<string, string>[] {
  let parent: Record<string, string> | null = null;
  const out: Record<string, string>[] = [];
  for (const raw of rows) {
    const row = { ...raw };
    const itemNo = (row.item_no || '').trim();
    const level = (row.level || '').trim();

    if (itemNo) {
      // This is a parent (or standalone) row.
      parent = row;
      out.push(row);
      continue;
    }

    // Empty item_no.
    if (!level || !parent) {
      // Nothing we can do — leave as-is (downstream will skip).
      out.push(row);
      continue;
    }

    // Child row: assign synthesized item_no.
    const parentItem = (parent.item_no || '').trim();
    const normLevel = normalizeLevelForItemNo(level);
    if (!parentItem || !normLevel) {
      out.push(row);
      continue;
    }
    row.item_no = `${parentItem}/${normLevel}`;

    // Carry forward identity/context fields when the child cell is empty.
    for (const f of CARRY_FORWARD_FIELDS) {
      const cur = (row[f] || '').trim();
      if (!cur) {
        const inherited = (parent[f] || '').trim();
        if (inherited) row[f] = inherited;
      }
    }

    // If a downstream parser auto-builds subtest_id from item_no + mos_code,
    // make sure any pre-existing subtest_id from the parent is NOT inherited
    // here (we want each child to get its own ID). The carry-forward list
    // above already excludes subtest_id, so nothing else to do.

    out.push(row);
  }
  return out;
}

// ── Custom field extraction (target_field = "custom:<field_name>") ───
function extractCustomFields(row: Record<string, string>): {
  custom_payload: Record<string, string | number | boolean | null>;
  custom_field_errors: Array<{ field_name: string; raw: string; reason: string }>;
} {
  const payload: Record<string, string | number | boolean | null> = {};
  const errors: Array<{ field_name: string; raw: string; reason: string }> = [];
  for (const [key, raw] of Object.entries(row)) {
    if (!isCustomTarget(key)) continue;
    const fieldName = parseCustomTarget(key);
    if (!fieldName) continue;
    const def = getCustomField('tnc', fieldName);
    if (!def || !def.is_active) continue; // unknown/inactive — skip silently
    if (raw == null || String(raw).trim() === '') continue;
    const coerced = coerceCustomValue(def.data_type, raw);
    if (coerced.ok === false) {
      errors.push({ field_name: fieldName, raw: String(raw), reason: coerced.reason });
    } else if (coerced.value !== null) {
      payload[fieldName] = coerced.value;
    }
  }
  return { custom_payload: payload, custom_field_errors: errors };
}

// ── Legacy parse: 1 row → multiple subtests (MOS-1~5) ────────────────
export function parseLegacy(rows: Record<string, string>[]): ParsedSubtest[] {
  const result: ParsedSubtest[] = [];
  const carried = applyItemNoCarryForward(rows);
  for (const row of carried) {
    const system = (row.system || '').trim();
    const item_no = (row.item_no || '').trim();
    if (!item_no) continue;

    const pred = parsePredecessor(row.predecessor_status_raw);
    const dp = pickSubtestDates(row);
    const base = {
      raw_row_no: parseInt(row.__row_no) || 0,
      raw_system_name: system,
      item_no,
      team: null,
      level: row.level?.trim() || null,
      equipment: row.equipment?.trim() || null,
      description: row.description?.trim() || null,
      t1_planned_date: dp.dates.t1_planned_date,
      t1_status: normalizeStatus(row.t1_status),
      t2_planned_date: dp.dates.t2_planned_date,
      t2_status: normalizeStatus(row.t2_status),
      predecessor_status_raw: pred.raw,
      pred_status: pred.status,
      pred_planned_date: pred.plannedDate,
      pred_actual_date: pred.actualDate,
      subcontractor_name: row.subcontractor_name?.trim() || null,
      subsub_name: row.subsub_name?.trim() || null,
      hdec_pic_name: row.hdec_pic_name?.trim() || null,
      ...(() => {
        const r1 = splitReportField(row.r1_status);
        const r2 = splitReportField(row.r2_status);
        const aconexExplicit = row.aconex_ref_no?.trim() || null;
        return {
          r1_status: r1.status,
          r1_report_ref: row.r1_report_ref?.trim() || r1.ref,
          r2_status: r2.status,
          // Explicit aconex column wins; otherwise free-text from R2 column.
          aconex_ref_no: aconexExplicit ?? r2.ref,
        };
      })(),
      r1_target_submission_date: dp.dates.r1_target_submission_date,
      r1_actual_submission_date: dp.dates.r1_actual_submission_date,
      r2_target_submission_date: dp.dates.r2_target_submission_date,
      r2_actual_submission_date: dp.dates.r2_actual_submission_date,
      r2_target_approval_date: dp.dates.r2_target_approval_date,
      r2_actual_approval_date: dp.dates.r2_actual_approval_date,
      remarks: row.remarks?.trim() || null,
      punchlist_comments: row.punchlist_comments?.trim() || null,
      _dateWarnings: dp.warnings.length ? dp.warnings : undefined,
      ...extractCustomFields(row),
    };

    const mosCodes: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const code = (row[`mos_${i}`] || '').trim();
      if (code) mosCodes.push(code);
    }

    if (mosCodes.length === 0) {
      // If no MOS columns, try mos_code directly
      const code = (row.mos_code || '').trim();
      if (code) mosCodes.push(code);
    }

    if (mosCodes.length === 0) continue;

    for (const mos of mosCodes) {
      result.push({
        ...base,
        mos_code: mos,
        subtest_id: `${item_no}-${mos}`,
      });
    }
  }
  return result;
}

// ── Standard parse: 1 row = 1 subtest ────────────────────────────────
export function parseStandard(rows: Record<string, string>[]): ParsedSubtest[] {
  const result: ParsedSubtest[] = [];
  const carried = applyItemNoCarryForward(rows);
  for (const row of carried) {
    const system = (row.system || '').trim();
    const item_no = (row.item_no || '').trim();
    const mos_code = (row.mos_code || '').trim();
    if (!item_no || !mos_code) continue;

    const pred = parsePredecessor(row.predecessor_status_raw);
    const dp = pickSubtestDates(row);
    result.push({
      raw_row_no: parseInt(row.__row_no) || 0,
      raw_system_name: system,
      item_no,
      team: normalizeTeam(row.team),
      level: row.level?.trim() || null,
      equipment: row.equipment?.trim() || null,
      description: row.description?.trim() || null,
      mos_code,
      subtest_id: row.subtest_id?.trim() || `${item_no}-${mos_code}`,
      t1_planned_date: dp.dates.t1_planned_date,
      t1_status: normalizeStatus(row.t1_status),
      t2_planned_date: dp.dates.t2_planned_date,
      t2_status: normalizeStatus(row.t2_status),
      predecessor_status_raw: pred.raw,
      pred_status: pred.status,
      pred_planned_date: pred.plannedDate,
      pred_actual_date: pred.actualDate,
      subcontractor_name: row.subcontractor_name?.trim() || null,
      subsub_name: row.subsub_name?.trim() || null,
      hdec_pic_name: row.hdec_pic_name?.trim() || null,
      ...(() => {
        const r1 = splitReportField(row.r1_status);
        const r2 = splitReportField(row.r2_status);
        const aconexExplicit = row.aconex_ref_no?.trim() || null;
        return {
          r1_status: r1.status,
          r1_report_ref: row.r1_report_ref?.trim() || r1.ref,
          r2_status: r2.status,
          aconex_ref_no: aconexExplicit ?? r2.ref,
        };
      })(),
      r1_target_submission_date: dp.dates.r1_target_submission_date,
      r1_actual_submission_date: dp.dates.r1_actual_submission_date,
      r2_target_submission_date: dp.dates.r2_target_submission_date,
      r2_actual_submission_date: dp.dates.r2_actual_submission_date,
      r2_target_approval_date: dp.dates.r2_target_approval_date,
      r2_actual_approval_date: dp.dates.r2_actual_approval_date,
      remarks: row.remarks?.trim() || null,
      punchlist_comments: row.punchlist_comments?.trim() || null,
      _dateWarnings: dp.warnings.length ? dp.warnings : undefined,
      ...extractCustomFields(row),
    });
  }
  return result;
}

// ── Value resolution: blank = keep, "clear" = null ───────────────────
export function resolveValue(newVal: string | null, existingVal: string | null): string | null | undefined {
  if (newVal == null || newVal === '') return undefined; // keep existing
  if (newVal.toLowerCase() === 'clear') return null; // set to null
  return newVal;
}
