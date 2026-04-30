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
  /** Set of canonical field names that the user excluded via the column-select
   *  dialog. Importer uses this to skip change-detection / audit / payload work
   *  for those fields, so picking few columns is dramatically faster. */
  excludedFields: Set<string>;
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
  // LL original "Closed On" column → treated as actual closure date
  'closed on': 'actual_closure_date',
  'closed date': 'actual_closure_date',
  'date closed': 'actual_closure_date',
  'closure date': 'actual_closure_date',
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

export function cleanHeader(header: string): string {
  return String(header ?? '').replace(/\s*\(H\)\s*$/i, '').trim();
}

export function toFieldName(header: string): string {
  const normalized = cleanHeader(header).toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return FIELD_ALIASES[normalized] ?? normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function toText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

const MONTH_ABBR: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function pad2(n: number | string): string {
  return String(n).padStart(2, '0');
}

function clampReasonable(iso: string | null): string | null {
  if (!iso) return null;
  // Reject obviously bogus parsed years (e.g., 1901/2001 from year-less input bugs)
  const y = Number(iso.slice(0, 4));
  if (!Number.isFinite(y) || y < 2010 || y > 2100) return null;
  return iso;
}

function normalizeDate(value: unknown): string | null {
  if (value == null || value === '') return null;

  // 1. Excel serial number
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return clampReasonable(`${parsed.y}-${pad2(parsed.m)}-${pad2(parsed.d)}`);
    return null;
  }

  const text = String(value).trim();
  if (!text) return null;

  // 2. Numeric string → Excel serial
  if (/^\d+(\.\d+)?$/.test(text)) {
    const parsed = XLSX.SSF.parse_date_code(parseFloat(text));
    if (parsed) return clampReasonable(`${parsed.y}-${pad2(parsed.m)}-${pad2(parsed.d)}`);
  }

  // 3. ISO YYYY-MM-DD
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return clampReasonable(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`);

  // 4. dd-MMM or dd-MMM-YYYY (e.g. "27-Apr", "03-May-2026", "3 May 26")
  const ddMmmMatch = text.match(/^(\d{1,2})[\s\-\/]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:[\s\-\/]+(\d{2,4}))?$/i);
  if (ddMmmMatch) {
    const day = pad2(ddMmmMatch[1]);
    const month = MONTH_ABBR[ddMmmMatch[2].toLowerCase()];
    let yearStr = ddMmmMatch[3];
    let year: number;
    if (yearStr) {
      year = Number(yearStr);
      if (year < 100) year += 2000;
    } else {
      year = new Date().getFullYear();
    }
    return clampReasonable(`${year}-${month}-${day}`);
  }

  // 5. MMM-dd or MMM-dd-YYYY (e.g. "Apr-27", "May 3, 2026")
  const mmmDdMatch = text.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-\/,]+(\d{1,2})(?:[\s\-\/,]+(\d{2,4}))?$/i);
  if (mmmDdMatch) {
    const month = MONTH_ABBR[mmmDdMatch[1].toLowerCase()];
    const day = pad2(mmmDdMatch[2]);
    let yearStr = mmmDdMatch[3];
    let year: number;
    if (yearStr) {
      year = Number(yearStr);
      if (year < 100) year += 2000;
    } else {
      year = new Date().getFullYear();
    }
    return clampReasonable(`${year}-${month}-${day}`);
  }

  // 6. Slash formats: try DD/MM/YYYY first (project locale), then MM/DD/YYYY
  const slashMatch = text.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (slashMatch) {
    let a = Number(slashMatch[1]);
    let b = Number(slashMatch[2]);
    let y = Number(slashMatch[3]);
    if (y < 100) y += 2000;
    // If first part > 12, it must be day (DD/MM)
    // Otherwise default to DD/MM (project convention)
    let day: number, month: number;
    if (a > 12) { day = a; month = b; }
    else if (b > 12) { month = a; day = b; }
    else { day = a; month = b; } // ambiguous → DD/MM
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return clampReasonable(`${y}-${pad2(month)}-${pad2(day)}`);
    }
  }

  // 7. Last-resort fallback — but NEVER use new Date() on year-less strings
  //    (V8 silently maps to 1901/2001). If we got here, give up.
  return null;
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

// ──────────────────────────────────────────────────────────────────────────────
// Area parsing — extract Type / Level / Location from the raw area path.
//
// Real LL data follows the pattern:  "Project > Discipline > Level NN [> Detail...]"
// but parts.length varies. We must NOT use a fixed index for "level"; instead we
// detect the actual Level token, and explicitly prevent the Level value from
// being duplicated into Location. ────────────────────────────────────────────────

const LEVEL_REGEXES: RegExp[] = [
  /^level\s*[-]?\s*\d+[a-z]?$/i,        // Level 1, Level 07, Level-1, Level2A
  /^lvl\s*[-]?\s*\d+[a-z]?$/i,          // Lvl 12
  /^l\s*\d+[a-z]?$/i,                   // L1, L07, L2A
  /^b\s*\d+$/i,                         // B1, B2 (basement)
  /^basement(\s*\d+)?$/i,               // Basement, Basement 2
  /^roof(\s|$)/i,                       // Roof, Roof Top
  /^rf$/i,
  /^ground(\s+floor)?$/i,               // Ground, Ground Floor
  /^gf$/i,
  /^mezzanine(\s*\d*)?$/i,
  /^attic$/i,
  /^penthouse$/i,
  /^ph$/i,
];

export function isLevelToken(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return LEVEL_REGEXES.some((rx) => rx.test(trimmed));
}

/** Normalize a level token so "Level 7", "level 07", "L7", "Lvl 7" all match. */
export function canonicalLevel(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Numeric Level forms → "Level NN" (zero-padded to 2 digits if pure number)
  const numMatch = trimmed.match(/^(?:level|lvl|l)\s*[-]?\s*(\d+)([a-z]?)$/i);
  if (numMatch) {
    const num = numMatch[1].padStart(2, '0');
    const suffix = numMatch[2] ? numMatch[2].toUpperCase() : '';
    return `Level ${num}${suffix}`;
  }
  const bMatch = trimmed.match(/^b\s*(\d+)$/i);
  if (bMatch) return `B${bMatch[1]}`;
  // Title-case named levels
  return trimmed.replace(/\s+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const compareKey = (value: string | null | undefined) =>
  (value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

export function parseArea(area: string | null): Pick<ParsedDefectRow, 'area_type' | 'area_level' | 'area_location'> {
  if (!area) return { area_type: null, area_level: null, area_location: null };
  const parts = area.split('>').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return { area_type: null, area_level: null, area_location: null };

  const levelIdx = parts.findIndex(isLevelToken);

  if (levelIdx >= 0) {
    const levelCanonical = canonicalLevel(parts[levelIdx]);
    // type = the discipline immediately before the level token; fall back to first part.
    const area_type = levelIdx > 0 ? parts[levelIdx - 1] : (parts[0] ?? null);
    // location = everything AFTER the level token, with any duplicate level tokens removed.
    const tail = parts.slice(levelIdx + 1).filter((p) => {
      if (isLevelToken(p)) return false;
      if (compareKey(p) === compareKey(levelCanonical)) return false;
      return true;
    });
    const area_location = tail.length > 0 ? tail.join(' > ') : null;
    return { area_type, area_level: levelCanonical, area_location };
  }

  // No level token detected — preserve the old behavior for backward compatibility,
  // but DO NOT promote a non-level token (e.g. "STR") into the level field.
  if (parts.length === 1) {
    return { area_type: parts[0], area_level: null, area_location: null };
  }
  const useful = parts.length >= 4 ? parts.slice(1) : parts;
  const area_type = useful[0] ?? null;
  const area_location = useful.length > 1 ? useful.slice(1).join(' > ') : null;
  return { area_type, area_level: null, area_location };
}

/**
 * Reconcile parsed area_raw fields with explicit "Level"/"Location" columns
 * from the spreadsheet. Explicit columns are noisy (free-text, status strings,
 * other rows' raw paths, even just numbers), so we validate them before using.
 */
export function reconcileAreaFields(
  parsed: { area_type: string | null; area_level: string | null; area_location: string | null },
  explicitLevel: string | null,
  explicitLocation: string | null,
) {
  let area_level = parsed.area_level;
  let area_location = parsed.area_location;

  // Level: only override when the explicit value actually looks like a level token.
  if (explicitLevel) {
    if (isLevelToken(explicitLevel)) {
      area_level = canonicalLevel(explicitLevel);
    } else if (!area_level && /^[A-Za-z0-9 \-]{1,30}$/.test(explicitLevel)) {
      // raw didn't yield a level and explicit is a short alphanumeric label; accept as-is.
      area_level = explicitLevel.trim();
    }
  }

  // Location: only adopt explicit when it is a sane detail string.
  if (explicitLocation) {
    const trimmed = explicitLocation.trim();
    const looksLikeLevel = isLevelToken(trimmed);
    const sameAsLevel = area_level && compareKey(trimmed) === compareKey(area_level);
    const looksLikeStatus = /^(closed|open|n\/a|cancel|pending)\b/i.test(trimmed);
    const looksLikeOtherAreaPath = trimmed.includes('>'); // entire raw path → reject
    const isJustNumber = /^\d+$/.test(trimmed);
    if (!looksLikeLevel && !sameAsLevel && !looksLikeStatus && !looksLikeOtherAreaPath && !isJustNumber) {
      area_location = trimmed;
    }
    // else: keep parsed value (which may already be null) — explicit is rejected.
  }

  // Final guard: never let location duplicate the level value.
  if (area_location && area_level && compareKey(area_location) === compareKey(area_level)) {
    area_location = null;
  }
  if (area_location && isLevelToken(area_location)) {
    area_location = null;
  }

  return { area_type: parsed.area_type, area_level, area_location };
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
  // IMPORTANT: do NOT use blankrows:false here — it compresses indices and causes
  // them to drift away from the actual sheet coordinates that sheet_to_json({range})
  // expects. We need raw sheet-coordinate row indices.
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '', blankrows: true });
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
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '', blankrows: true });
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

/** Return the list of sheet names present in a Defect Excel file. */
export async function getDefectExcelSheetNames(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, bookSheets: true });
  return workbook.SheetNames ?? [];
}

/**
 * Quickly extract just the header row + first sample row from a Defect Excel file
 * (without parsing all data rows). Used to populate the "Select Columns" dialog
 * without paying the full parse cost.
 */
export async function getDefectExcelHeaders(
  file: File,
  sheetName?: string,
): Promise<{ headers: string[]; sample: Record<string, unknown>; isReimport: boolean; sheetName: string } | null> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetsToScan = sheetName && workbook.SheetNames.includes(sheetName)
    ? [sheetName]
    : workbook.SheetNames;

  for (const name of sheetsToScan) {
    const ws = workbook.Sheets[name];
    if (!ws) continue;
    const detected = detectHeaderRow(ws);
    if (!detected) continue;
    const candidateRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      range: detected.headerRowIdx,
      defval: '',
      blankrows: false,
    });
    const headers = Object.keys(candidateRows[0] ?? {});
    const sample = candidateRows[0] ?? {};
    const isReimport = detectReimportMarker(ws);
    return { headers, sample, isReimport, sheetName: name };
  }
  return null;
}

export async function parseDefectExcel(file: File, sheetName?: string, excludedHeaders?: string[]): Promise<ParseDefectResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });

  let resolvedSheetName: string | null = null;
  let worksheet: XLSX.WorkSheet | null = null;
  let headerRowIdx = 0;
  let rawRows: Record<string, unknown>[] = [];
  const scannedSheets: string[] = [];
  let headerOnlySheet: { name: string; headerRowIdx: number } | null = null;

  // If sheetName is specified, only consider that sheet.
  const sheetsToScan = sheetName && workbook.SheetNames.includes(sheetName)
    ? [sheetName]
    : workbook.SheetNames;

  for (const name of sheetsToScan) {
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
      resolvedSheetName = name;
      worksheet = ws;
      headerRowIdx = detected.headerRowIdx;
      rawRows = candidateRows;
      break;
    }
    if (!headerOnlySheet) {
      headerOnlySheet = { name, headerRowIdx: detected.headerRowIdx };
    }
  }

  if (!worksheet || !resolvedSheetName) {
    if (headerOnlySheet) {
      throw new Error(`No data rows found in sheet '${headerOnlySheet.name}' (header detected at row ${headerOnlySheet.headerRowIdx + 1})`);
    }
    if (sheetName) {
      throw new Error(`No 'Issue No' column found in sheet '${sheetName}'`);
    }
    throw new Error(`No 'Issue No' column found. Scanned sheets: [${scannedSheets.join(', ')}]`);
  }
  const sheetNameResolved = resolvedSheetName;

  // Apply user-selected column exclusion: drop excluded headers from each raw row.
  // Safety: never drop headers that map to `issue_no` (PK / row-detection trigger),
  // even if the caller mistakenly excluded them.
  const excludedSet = new Set((excludedHeaders ?? []).filter((h) => toFieldName(h) !== 'issue_no'));
  // Build the set of canonical field names that are excluded (for the importer
  // to skip change-detection / audit work on those fields).
  const excludedFields = new Set<string>();
  for (const h of excludedSet) {
    const f = toFieldName(h);
    if (f) excludedFields.add(f);
  }
  if (excludedSet.size > 0) {
    rawRows = rawRows.map((raw) => {
      const next: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (!excludedSet.has(k)) next[k] = v;
      }
      return next;
    });
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
    const reconciledArea = reconcileAreaFields(parsedArea, explicitLevel, explicitLocation);
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
      area_type: reconciledArea.area_type,
      area_level: reconciledArea.area_level,
      area_location: reconciledArea.area_location,
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
  return { rows, headers, sheetName: sheetNameResolved, isReimport, excludedFields };
}

export function daysDiff(oldDate?: string | null, newDate?: string | null): number | null {
  if (!oldDate || !newDate) return null;
  const oldTime = new Date(oldDate).getTime();
  const newTime = new Date(newDate).getTime();
  if (Number.isNaN(oldTime) || Number.isNaN(newTime)) return null;
  return Math.round((newTime - oldTime) / 86400000);
}
