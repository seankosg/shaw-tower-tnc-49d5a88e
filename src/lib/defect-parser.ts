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
  planned_date: string | null;
  target_date: string | null;
  actual_progress_pct: number | null;
  closed_date: string | null;
  closure_status: string | null;
  remarks: string | null;
  hdec_comments: string | null;
  raw_payload: Record<string, unknown>;
}

export interface ParseDefectResult {
  rows: ParsedDefectRow[];
  headers: DefectHeaderInfo[];
  sheetName: string;
}

const FIELD_ALIASES: Record<string, string> = {
  'issue no': 'issue_no',
  'issue number': 'issue_no',
  'issue type': 'defect_type',
  area: 'area_raw',
  'location detail': 'area_location',
  'issue description': 'description',
  description: 'description',
  status: 'status',
  'due date': 'planned_date',
  'planned date': 'planned_date',
  'target date': 'target_date',
  'closed on': 'closed_date',
  'date closed': 'closed_date',
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
  pic: 'hdec_pic_name',
  level: 'area_level',
  location: 'area_location',
  remarks: 'remarks',
  comments: 'hdec_comments',
  'hdec comments': 'hdec_comments',
  'actual progress %': 'actual_progress_pct',
  'actual progress': 'actual_progress_pct',
  progress: 'actual_progress_pct',
  'closure status': 'closure_status',
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

export async function parseDefectExcel(file: File): Promise<ParseDefectResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
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
    const closedDate = normalizeDate(getMapped(raw, 'closed_date'));
    const closure = toText(getMapped(raw, 'closure_status')) ?? (closedDate || status?.toLowerCase() === 'closed' ? 'Closed' : status ? 'Open' : null);

    return {
      rawRowNo: index + 2,
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
      planned_date: normalizeDate(getMapped(raw, 'planned_date')),
      target_date: normalizeDate(getMapped(raw, 'target_date')),
      actual_progress_pct: normalizePct(getMapped(raw, 'actual_progress_pct')),
      closed_date: closedDate,
      closure_status: closure,
      remarks: toText(getMapped(raw, 'remarks')),
      hdec_comments: toText(getMapped(raw, 'hdec_comments')),
      raw_payload: raw,
    };
  });

  return { rows, headers, sheetName };
}

export function daysDiff(oldDate?: string | null, newDate?: string | null): number | null {
  if (!oldDate || !newDate) return null;
  const oldTime = new Date(oldDate).getTime();
  const newTime = new Date(newDate).getTime();
  if (Number.isNaN(oldTime) || Number.isNaN(newTime)) return null;
  return Math.round((newTime - oldTime) / 86400000);
}
