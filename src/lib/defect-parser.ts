import * as XLSX from 'xlsx';
import { normalizeTeamValue, type TeamType } from '@/types/enums';

export type DefectFieldOrigin = 'll_original' | 'hdec_added' | 'system' | 'derived';

export interface DefectHeaderInfo {
  originalHeader: string;
  displayName: string;
  fieldName: string;
  sourceOrigin: DefectFieldOrigin;
}

export interface ParsedDefectRow {
  rawRowNo: number;
  issue_no: string;
  subcontractor_issue_no: string | null;
  subcontractor_issue_source: string | null;
  /** Defect row UUID — only present in re-import files (from "Re-import ready" export). */
  id: string | null;
  main_trade: string | null;
  sub_trade: string | null;
  trade_detail: string | null;
  area_raw: string | null;
  area_type: string | null;
  area_level: string | null;
  area_location: string | null;
  description: string | null;
  defect_type: string | null;
  status: string | null;
  priority: string | null;
  team: TeamType | null;
  subcontractor_name: string | null;
  subsub_name: string | null;
  hdec_pic_name: string | null;
  hdec_eng_name: string | null;
  // New lifecycle date fields
  planned_start_date: string | null;
  planned_completion_date: string | null;
  planned_closure_date: string | null;
  actual_start_date: string | null;
  actual_completion_date: string | null;
  actual_closure_date: string | null;
  planned_progress_pct: number | null;
  actual_progress_pct: number | null;
  completion_status: string | null;
  closure_status: string | null;
  remarks: string | null;
  hdec_comments: string | null;
  work_type: string | null;
  raw_payload: Record<string, unknown>;
}

export interface ParseDefectResult {
  rows: ParsedDefectRow[];
  headers: DefectHeaderInfo[];
  sheetName: string;
  /** True when the file was produced by "Re-import ready" export and contains the
   *  SHAW_DEFECT_REIMPORT_V1 marker — importer should run in update-only mode. */
  isReimport: boolean;
}

export const REIMPORT_MARKER_TAG = 'SHAW_DEFECT_REIMPORT_V1';

const FIELD_ALIASES: Record<string, string> = {
  id: 'id',
  uuid: 'id',
  'defect id': 'id',
  'issue no': 'issue_no',
  'issue number': 'issue_no',
  'issue type': 'defect_type',
  area: 'area_raw',
  'location detail': 'area_location',
  'issue description': 'description',
  description: 'description',
  status: 'status',
  'field discipline': 'trade_detail',
  'defect prioritisation': 'priority',
  priority: 'priority',
  'main trade': 'main_trade',
  'sub trade': 'sub_trade',
  'sub contractor': 'subcontractor_name',
  subcontractor: 'subcontractor_name',
  'sub-sub': 'subsub_name',
  subsub: 'subsub_name',
  'hdec pic': 'hdec_pic_name',
  'hdec p i c': 'hdec_pic_name',
  'hdec_pic': 'hdec_pic_name',
  'hdec pic name': 'hdec_pic_name',
  'hdec in charge': 'hdec_pic_name',
  'hdec person in charge': 'hdec_pic_name',
  'responsible pic': 'hdec_pic_name',
  'person in charge': 'hdec_pic_name',
  // → hdec_eng_name (Engineer 계열은 모두 신규 필드로 매핑)
  'hdec eng': 'hdec_eng_name',
  'hdec engineer': 'hdec_eng_name',
  'hdec_eng': 'hdec_eng_name',
  'hdec eng name': 'hdec_eng_name',
  'responsible engineer': 'hdec_eng_name',
  'engineer in charge': 'hdec_eng_name',
  engineer: 'hdec_eng_name',
  'in charge': 'hdec_pic_name',
  'pic name': 'hdec_pic_name',
  pic: 'hdec_pic_name',
  '담당자': 'hdec_pic_name',
  '담당': 'hdec_pic_name',
  'hdec 담당자': 'hdec_pic_name',
  level: 'area_level',
  location: 'area_location',
  remarks: 'remarks',
  comments: 'hdec_comments',
  'hdec comments': 'hdec_comments',
  // New lifecycle headers
  'planned start date': 'planned_start_date',
  'planned completion date': 'planned_completion_date',
  'planned closure date': 'planned_closure_date',
  'actual start date': 'actual_start_date',
  'actual completion date': 'actual_completion_date',
  'actual closure date': 'actual_closure_date',
  'planned progress %': 'planned_progress_pct',
  'planned progress': 'planned_progress_pct',
  'actual progress %': 'actual_progress_pct',
  'actual progress': 'actual_progress_pct',
  progress: 'actual_progress_pct',
  'completion status': 'completion_status',
  'closure status': 'closure_status',
  'work type': 'work_type',
  'subcontractor issue no': 'subcontractor_issue_no',
  'subcontractor no': 'subcontractor_issue_no',
  'subcontractor issue source': 'subcontractor_issue_source',
  'subcontractor issue no source': 'subcontractor_issue_source',
};

function cleanHeader(header: string): string {
  return String(header ?? '').replace(/\s*\(H\)\s*$/i, '').trim();
}

function toFieldName(header: string): string {
  const normalized = cleanHeader(header).toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return FIELD_ALIASES[normalized] ?? normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function toText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function normalizeDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const text = String(value).trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function normalizePct(value: unknown): number | null {
  const text = toText(value);
  if (!text) return null;
  const num = Number(text.replace('%', '').trim());
  if (Number.isNaN(num)) return null;
  return num <= 1 && text.includes('%') ? num * 100 : num;
}

export function stripHeaderMarker(header: string): string {
  return cleanHeader(header);
}

export function parseArea(area: string | null): Pick<ParsedDefectRow, 'area_type' | 'area_level' | 'area_location'> {
  if (!area) return { area_type: null, area_level: null, area_location: null };
  const parts = area.split('>').map((part) => part.trim()).filter(Boolean);
  const useful = parts.length >= 4 ? parts.slice(1) : parts;
  return {
    area_type: useful[0] ?? null,
    area_level: useful[1] ?? null,
    area_location: useful.length > 2 ? useful.slice(2).join(' > ') : null,
  };
}

function normalizeTeam(value: unknown): TeamType | null {
  return normalizeTeamValue(value);
}

function getMapped(row: Record<string, unknown>, field: string): unknown {
  const entry = Object.entries(row).find(([header]) => toFieldName(header) === field);
  return entry?.[1];
}

// Increased to 20 so re-import files (with extra metadata block / marker rows) still parse.
const HEADER_SCAN_LIMIT = 20;

function detectHeaderRow(worksheet: XLSX.WorkSheet): { headerRowIdx: number; headers: string[] } | null {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '', blankrows: false });
  const limit = Math.min(matrix.length, HEADER_SCAN_LIMIT);
  for (let i = 0; i < limit; i += 1) {
    const row = matrix[i] ?? [];
    const headers = row.map((cell) => String(cell ?? '').trim());
    if (headers.some((h) => h && toFieldName(h) === 'issue_no')) {
      return { headerRowIdx: i, headers };
    }
  }
  return null;
}

/** Scan the first ~20 rows of a worksheet for the SHAW_DEFECT_REIMPORT_V1 marker. */
function detectReimportMarker(worksheet: XLSX.WorkSheet): boolean {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '', blankrows: false });
  const limit = Math.min(matrix.length, HEADER_SCAN_LIMIT);
  for (let i = 0; i < limit; i += 1) {
    const row = matrix[i] ?? [];
    for (const cell of row) {
      const text = String(cell ?? '');
      if (text.includes(REIMPORT_MARKER_TAG)) return true;
    }
  }
  return false;
}

export async function parseDefectExcel(file: File): Promise<ParseDefectResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });

  let sheetName: string | null = null;
  let worksheet: XLSX.WorkSheet | null = null;
  let headerRowIdx = 0;
  let rawRows: Record<string, unknown>[] = [];
  const scannedSheets: string[] = [];
  let headerOnlySheet: { name: string; headerRowIdx: number } | null = null;

  for (const name of workbook.SheetNames) {
    scannedSheets.push(name);
    const ws = workbook.Sheets[name];
    if (!ws) continue;
    const detected = detectHeaderRow(ws);
    if (!detected) continue;
    const candidateRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      range: detected.headerRowIdx,
      defval: '',
      blankrows: false,
    });
    if (candidateRows.length > 0) {
      sheetName = name;
      worksheet = ws;
      headerRowIdx = detected.headerRowIdx;
      rawRows = candidateRows;
      break;
    }
    if (!headerOnlySheet) {
      headerOnlySheet = { name, headerRowIdx: detected.headerRowIdx };
    }
  }

  if (!worksheet || !sheetName) {
    if (headerOnlySheet) {
      throw new Error(`No data rows found in sheet '${headerOnlySheet.name}' (header detected at row ${headerOnlySheet.headerRowIdx + 1})`);
    }
    throw new Error(`No 'Issue No' column found. Scanned sheets: [${scannedSheets.join(', ')}]`);
  }

  const headers = Object.keys(rawRows[0] ?? {}).map((originalHeader, index) => ({
    originalHeader,
    displayName: cleanHeader(originalHeader),
    fieldName: toFieldName(originalHeader),
    sourceOrigin: /\(H\)\s*$/i.test(originalHeader) ? 'hdec_added' as const : 'll_original' as const,
    sortOrder: index + 1,
  }));

  const rows = rawRows.map((raw, index) => {
    const areaRaw = toText(getMapped(raw, 'area_raw'));
    const parsedArea = parseArea(areaRaw);
    const explicitLevel = toText(getMapped(raw, 'area_level'));
    const explicitLocation = toText(getMapped(raw, 'area_location'));
    const status = toText(getMapped(raw, 'status'));

    return {
      rawRowNo: index + headerRowIdx + 2,
      id: toText(getMapped(raw, 'id')),
      issue_no: toText(getMapped(raw, 'issue_no')) ?? '',
      subcontractor_issue_no: toText(getMapped(raw, 'subcontractor_issue_no')),
      subcontractor_issue_source: toText(getMapped(raw, 'subcontractor_issue_source')),
      main_trade: toText(getMapped(raw, 'main_trade')),
      sub_trade: toText(getMapped(raw, 'sub_trade')),
      trade_detail: toText(getMapped(raw, 'trade_detail')),
      area_raw: areaRaw,
      area_type: parsedArea.area_type,
      area_level: explicitLevel ?? parsedArea.area_level,
      area_location: explicitLocation ?? parsedArea.area_location,
      description: toText(getMapped(raw, 'description')),
      defect_type: toText(getMapped(raw, 'defect_type')),
      status,
      priority: toText(getMapped(raw, 'priority')),
      team: normalizeTeam(getMapped(raw, 'team')),
      subcontractor_name: toText(getMapped(raw, 'subcontractor_name')),
      subsub_name: toText(getMapped(raw, 'subsub_name')),
      hdec_pic_name: toText(getMapped(raw, 'hdec_pic_name')),
      hdec_eng_name: toText(getMapped(raw, 'hdec_eng_name')),
      planned_start_date: normalizeDate(getMapped(raw, 'planned_start_date')),
      planned_completion_date: normalizeDate(getMapped(raw, 'planned_completion_date')),
      planned_closure_date: normalizeDate(getMapped(raw, 'planned_closure_date')),
      actual_start_date: normalizeDate(getMapped(raw, 'actual_start_date')),
      actual_completion_date: normalizeDate(getMapped(raw, 'actual_completion_date')),
      actual_closure_date: normalizeDate(getMapped(raw, 'actual_closure_date')),
      planned_progress_pct: normalizePct(getMapped(raw, 'planned_progress_pct')),
      actual_progress_pct: normalizePct(getMapped(raw, 'actual_progress_pct')),
      completion_status: toText(getMapped(raw, 'completion_status')),
      closure_status: toText(getMapped(raw, 'closure_status')),
      remarks: toText(getMapped(raw, 'remarks')),
      hdec_comments: toText(getMapped(raw, 'hdec_comments')),
      work_type: toText(getMapped(raw, 'work_type')),
      raw_payload: raw,
    };
  });

  const isReimport = detectReimportMarker(worksheet);
  return { rows, headers, sheetName, isReimport };
}

export function daysDiff(oldDate?: string | null, newDate?: string | null): number | null {
  if (!oldDate || !newDate) return null;
  const oldTime = new Date(oldDate).getTime();
  const newTime = new Date(newDate).getTime();
  if (Number.isNaN(oldTime) || Number.isNaN(newTime)) return null;
  return Math.round((newTime - oldTime) / 86400000);
}
