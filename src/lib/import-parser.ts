import * as XLSX from 'xlsx';

// ── Header normalization ──────────────────────────────────────────────
const HEADER_MAP: Record<string, string> = {
  system: 'system',
  'system name': 'system',
  itemno: 'item_no',
  'item no': 'item_no',
  'item_no': 'item_no',
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
};

function normalizeHeader(raw: string): string {
  const cleaned = raw.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  return HEADER_MAP[cleaned] || cleaned;
}

// ── Date normalization ────────────────────────────────────────────────
const MONTH_ABBR_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function normalizeDate(val: any): string | null {
  if (val == null || val === '') return null;

  // 1. Numeric (Excel serial date)
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }

  const s = String(val).trim();

  // 2. Numeric string → Excel serial date
  if (/^\d+(\.\d+)?$/.test(s)) {
    const d = XLSX.SSF.parse_date_code(parseFloat(s));
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }

  // 3. ISO format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);

  // 4. dd-MMM or dd-MMM-YYYY (e.g. 15-Jan, 03-Feb-2025)
  const ddMmmMatch = s.match(/^(\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:-(\d{4}))?$/i);
  if (ddMmmMatch) {
    const day = ddMmmMatch[1].padStart(2, '0');
    const month = MONTH_ABBR_MAP[ddMmmMatch[2].toLowerCase()];
    const year = ddMmmMatch[3] || new Date().getFullYear().toString();
    return `${year}-${month}-${day}`;
  }

  // 5. Fallback: new Date()
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().substring(0, 10);
  }
  return null;
}

function normalizeStatus(val: any): string | null {
  if (val == null || val === '') return null;
  const s = String(val).trim();
  const map: Record<string, string> = { planned: 'Planned', wip: 'WIP', done: 'Done', hold: 'Hold' };
  return map[s.toLowerCase()] || s;
}

function normalizePredecessor(val: any): string | null {
  if (val == null || val === '') return null;
  const s = String(val).trim();
  if (s.toLowerCase() === 'done') return 'Done';
  const d = normalizeDate(val);
  return d || s;
}

// ── Parsed row type ───────────────────────────────────────────────────
export interface ParsedSubtest {
  raw_row_no: number;
  raw_system_name: string;
  item_no: string;
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
  subcontractor_name: string | null;
  subsub_name: string | null;
  hdec_pic_name: string | null;
  r1_status: string | null;
  r2_status: string | null;
  aconex_ref_no: string | null;
  remarks: string | null;
  punchlist_comments: string | null;
}

// ── Known target field names (after normalization) ───────────────────
export const KNOWN_FIELDS = new Set<string>([
  'system', 'item_no', 'level', 'equipment', 'description',
  'mos_1', 'mos_2', 'mos_3', 'mos_4', 'mos_5', 'mos_code', 'subtest_id',
  't1_planned_date', 't1_status', 't2_planned_date', 't2_status',
  'predecessor_status_raw',
  'subcontractor_name', 'subsub_name', 'hdec_pic_name',
  'r1_status', 'r2_status', 'aconex_ref_no', 'remarks', 'punchlist_comments',
]);

export interface ParseExcelResult {
  rows: Record<string, string>[];
  rawHeaders: string[];
  mappedHeaders: string[];
  unmappedHeaders: string[];
}

// ── Parse Excel file ──────────────────────────────────────────────────
export function parseExcelFile(file: ArrayBuffer): ParseExcelResult {
  const wb = XLSX.read(file, { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (raw.length < 2) {
    return { rows: [], rawHeaders: [], mappedHeaders: [], unmappedHeaders: [] };
  }

  const rawHeaders = (raw[0] as any[]).map(h => String(h ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim());
  const mappedHeaders = rawHeaders.map(h => normalizeHeader(h));
  const unmappedHeaders = rawHeaders.filter((h, i) => h !== '' && !KNOWN_FIELDS.has(mappedHeaders[i]));

  const rows = raw.slice(1)
    .filter(row => row.some((c: any) => c !== '' && c != null))
    .map((row, idx) => {
      const obj: Record<string, string> = { __row_no: String(idx + 2) };
      mappedHeaders.forEach((h, i) => {
        obj[h] = row[i] != null ? String(row[i]) : '';
      });
      return obj;
    });

  return { rows, rawHeaders, mappedHeaders, unmappedHeaders };
}

// ── Legacy parse: 1 row → multiple subtests (MOS-1~5) ────────────────
export function parseLegacy(rows: Record<string, string>[]): ParsedSubtest[] {
  const result: ParsedSubtest[] = [];
  for (const row of rows) {
    const system = (row.system || '').trim();
    const item_no = (row.item_no || '').trim();
    if (!item_no) continue;

    const base = {
      raw_row_no: parseInt(row.__row_no) || 0,
      raw_system_name: system,
      item_no,
      level: row.level?.trim() || null,
      equipment: row.equipment?.trim() || null,
      description: row.description?.trim() || null,
      t1_planned_date: normalizeDate(row.t1_planned_date),
      t1_status: normalizeStatus(row.t1_status),
      t2_planned_date: normalizeDate(row.t2_planned_date),
      t2_status: normalizeStatus(row.t2_status),
      predecessor_status_raw: normalizePredecessor(row.predecessor_status_raw),
      subcontractor_name: row.subcontractor_name?.trim() || null,
      subsub_name: row.subsub_name?.trim() || null,
      hdec_pic_name: row.hdec_pic_name?.trim() || null,
      r1_status: row.r1_status?.trim() || null,
      r2_status: row.r2_status?.trim() || null,
      aconex_ref_no: row.aconex_ref_no?.trim() || null,
      remarks: row.remarks?.trim() || null,
      punchlist_comments: row.punchlist_comments?.trim() || null,
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
  for (const row of rows) {
    const system = (row.system || '').trim();
    const item_no = (row.item_no || '').trim();
    const mos_code = (row.mos_code || '').trim();
    if (!item_no || !mos_code) continue;

    result.push({
      raw_row_no: parseInt(row.__row_no) || 0,
      raw_system_name: system,
      item_no,
      level: row.level?.trim() || null,
      equipment: row.equipment?.trim() || null,
      description: row.description?.trim() || null,
      mos_code,
      subtest_id: row.subtest_id?.trim() || `${item_no}-${mos_code}`,
      t1_planned_date: normalizeDate(row.t1_planned_date),
      t1_status: normalizeStatus(row.t1_status),
      t2_planned_date: normalizeDate(row.t2_planned_date),
      t2_status: normalizeStatus(row.t2_status),
      predecessor_status_raw: normalizePredecessor(row.predecessor_status_raw),
      subcontractor_name: row.subcontractor_name?.trim() || null,
      subsub_name: row.subsub_name?.trim() || null,
      hdec_pic_name: row.hdec_pic_name?.trim() || null,
      r1_status: row.r1_status?.trim() || null,
      r2_status: row.r2_status?.trim() || null,
      aconex_ref_no: row.aconex_ref_no?.trim() || null,
      remarks: row.remarks?.trim() || null,
      punchlist_comments: row.punchlist_comments?.trim() || null,
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
