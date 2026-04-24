import XLSX from 'xlsx-js-style';
import type { Table, Column, Row } from '@tanstack/react-table';
import { formatDdMmm, formatDdMmmYyyy } from './format';
import { formatTeamLabel } from '@/types/enums';
import { formatPct } from '@/lib/defect-utils';
import { type DefectFieldConfigRow, DEFECT_DEFAULT_FIELD_LABELS } from '@/hooks/useDefectFieldConfig';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DefectExportFormat = 'view' | 'reimport';

export const REIMPORT_MARKER = '[Format: SHAW_DEFECT_REIMPORT_V1]';

/**
 * Stable list of identifier / system columns we always include (and pin to the
 * front) in a Re-import ready export so that the importer can match rows to
 * existing DB records. These fields are intentionally NOT user-friendly — they
 * are the contract between export and re-import.
 */
const REIMPORT_ID_FIELDS = ['id', 'issue_no', 'subcontractor_issue_no'] as const;

const REIMPORT_ID_LABELS: Record<string, string> = {
  id: 'ID',
  issue_no: 'Issue No',
  subcontractor_issue_no: 'Subcontractor Issue No',
};

export interface ExportDefectRawOptions<TRow> {
  table: Table<TRow>;
  fieldConfig: DefectFieldConfigRow[];
  globalFilter: string;
  searchParams: URLSearchParams;
  meta: {
    userName: string;
    userType: string;
  };
  /** 'view' (default) keeps current human-friendly format. 'reimport' produces
   *  a file that can be edited and re-imported to update existing rows. */
  format?: DefectExportFormat;
}

// ---------------------------------------------------------------------------
// Source line inference (from URL params)
// ---------------------------------------------------------------------------

const URL_PARAM_LABELS: Record<string, string> = {
  team: 'Team',
  subcontractor: 'Subcontractor',
  subsub: 'Sub-Sub',
  hdecPic: 'HDEC PIC',
  level: 'Level',
  mainTrade: 'Main Trade',
  subTrade: 'Sub Trade',
  workType: 'Work Type',
  classificationSource: 'Classification',
  status: 'Status',
  closureStatus: 'Closure Status',
  issueNo: 'Issue No',
  subcontractorIssueNo: 'Subcontractor Issue No',
};

const FLAG_LABELS: Record<string, string> = {
  overdue: 'Overdue',
  atRisk: 'At-Risk',
  actualComplete: 'Actual Completion',
  closureComplete: 'Closure Done',
  stage: 'Stage',
};

function inferSourceLabel(params: URLSearchParams): string {
  const parts: string[] = [];
  for (const [key, label] of Object.entries(URL_PARAM_LABELS)) {
    const value = params.get(key);
    if (!value) continue;
    const display = key === 'team' ? formatTeamLabel(value) : value;
    parts.push(`${label}: ${display}`);
  }
  for (const [key, label] of Object.entries(FLAG_LABELS)) {
    const value = params.get(key);
    if (value) parts.push(`${label}=${value}`);
  }
  const dateField = params.get('dateField');
  const dateStart = params.get('dateStart');
  const dateEnd = params.get('dateEnd');
  if (dateField || dateStart || dateEnd) {
    const fieldLabel = dateField ? (DEFECT_DEFAULT_FIELD_LABELS[dateField] || dateField) : 'Date';
    const range = `${dateStart || ''}${dateStart && dateEnd ? ' → ' : ''}${dateEnd || ''}` || '(any)';
    parts.push(`${fieldLabel}: ${range}`);
  }
  return parts.length ? `Defect Raw Data → ${parts.join(' · ')}` : 'Defect Raw Data (direct)';
}

// ---------------------------------------------------------------------------
// Filter & sort summaries
// ---------------------------------------------------------------------------

function getColumnDisplayName<TRow>(col: Column<TRow, unknown>, fieldConfig: DefectFieldConfigRow[]): string {
  const id = col.id;
  const cfg = fieldConfig.find((f) => f.field_name === id);
  if (cfg?.display_name) return cfg.display_name;
  if (DEFECT_DEFAULT_FIELD_LABELS[id]) return DEFECT_DEFAULT_FIELD_LABELS[id];
  const headerDef = col.columnDef.header;
  if (typeof headerDef === 'string') return headerDef;
  return id;
}

function summarizeFilters<TRow>(table: Table<TRow>, fieldConfig: DefectFieldConfigRow[]): string {
  const filters = table.getState().columnFilters;
  if (!filters.length) return '(none)';
  const parts: string[] = [];
  for (const f of filters) {
    const col = table.getColumn(f.id);
    if (!col) continue;
    const name = getColumnDisplayName(col, fieldConfig);
    const v = f.value as any;
    if (Array.isArray(v)) {
      if (!v.length) continue;
      parts.push(`${name}=[${v.join(', ')}]`);
    } else if (v && typeof v === 'object') {
      const bits: string[] = [];
      if (v.text) bits.push(`"${v.text}"`);
      if (v.from || v.to) bits.push(`${v.from || ''}${v.from && v.to ? '→' : ''}${v.to || ''}`);
      if (v.emptyOnly) bits.push('(Empty)');
      if (bits.length) parts.push(`${name}=${bits.join(' ')}`);
    } else if (typeof v === 'string' && v.trim()) {
      parts.push(`${name}="${v}"`);
    } else if (v != null) {
      parts.push(`${name}=${String(v)}`);
    }
  }
  return parts.length ? parts.join(' · ') : '(none)';
}

function summarizeSort<TRow>(table: Table<TRow>, fieldConfig: DefectFieldConfigRow[]): string {
  const sorting = table.getState().sorting;
  if (!sorting.length) return '(default)';
  return sorting
    .map((s) => {
      const col = table.getColumn(s.id);
      const name = col ? getColumnDisplayName(col, fieldConfig) : s.id;
      return `${name} ${s.desc ? '↓' : '↑'}`;
    })
    .join(', ');
}

// ---------------------------------------------------------------------------
// Cell value formatter (mirrors UI rendering)
// ---------------------------------------------------------------------------

const DATE_FIELDS = new Set([
  'planned_start_date',
  'planned_completion_date',
  'planned_closure_date',
  'actual_start_date',
  'actual_completion_date',
  'actual_closure_date',
  'classified_at',
]);
const DATETIME_FIELDS = new Set(['updated_at', 'created_at']);
const PROGRESS_FIELDS = new Set(['planned_progress_pct', 'actual_progress_pct']);

function formatCellValue<TRow>(row: Row<TRow>, col: Column<TRow, unknown>): string {
  const id = col.id;
  const raw = row.getValue(id);
  if (raw == null || raw === '') return '';

  if (id === 'team') return formatTeamLabel(raw as any);
  if (PROGRESS_FIELDS.has(id)) return formatPct(raw as any);
  if (DATE_FIELDS.has(id)) return formatDdMmm(String(raw).slice(0, 10));
  if (DATETIME_FIELDS.has(id)) return formatDdMmmYyyy(String(raw));
  if (id === 'classification_source') return String(raw).toLowerCase();
  return String(raw);
}

// ---------------------------------------------------------------------------
// Style helpers (identical to T&C export)
// ---------------------------------------------------------------------------

const FONT_NAME = 'Calibri';

const STYLE_TITLE = {
  font: { name: FONT_NAME, sz: 14, bold: true, color: { rgb: 'FFFFFFFF' } },
  fill: { fgColor: { rgb: 'FF1E3A5F' } },
  alignment: { vertical: 'center', horizontal: 'left' },
} as const;

const STYLE_META_LABEL = {
  font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: 'FF374151' } },
  fill: { fgColor: { rgb: 'FFF3F4F6' } },
  alignment: { vertical: 'center', horizontal: 'left' },
} as const;

const STYLE_META_VALUE = {
  font: { name: FONT_NAME, sz: 10, color: { rgb: 'FF111827' } },
  fill: { fgColor: { rgb: 'FFF3F4F6' } },
  alignment: { vertical: 'center', horizontal: 'left', wrapText: true },
} as const;

const STYLE_HEADER = {
  font: { name: FONT_NAME, sz: 11, bold: true, color: { rgb: 'FFFFFFFF' } },
  fill: { fgColor: { rgb: 'FF334155' } },
  alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
  border: {
    top: { style: 'thin', color: { rgb: 'FF1F2937' } },
    bottom: { style: 'thin', color: { rgb: 'FF1F2937' } },
    left: { style: 'thin', color: { rgb: 'FF1F2937' } },
    right: { style: 'thin', color: { rgb: 'FF1F2937' } },
  },
} as const;

const STYLE_DATA = {
  font: { name: FONT_NAME, sz: 10, color: { rgb: 'FF111827' } },
  alignment: { vertical: 'center', horizontal: 'left' },
  border: {
    top: { style: 'thin', color: { rgb: 'FFE5E7EB' } },
    bottom: { style: 'thin', color: { rgb: 'FFE5E7EB' } },
    left: { style: 'thin', color: { rgb: 'FFE5E7EB' } },
    right: { style: 'thin', color: { rgb: 'FFE5E7EB' } },
  },
} as const;

// ---------------------------------------------------------------------------
// Workbook builder (shared by single + per-subcon exports)
// ---------------------------------------------------------------------------

interface BuildSheetParams<TRow> {
  rows: Row<TRow>[];
  visibleCols: Column<TRow, unknown>[];
  fieldConfig: DefectFieldConfigRow[];
  meta: { userName: string; userType: string };
  globalFilter: string;
  searchParams: URLSearchParams;
  sourceSuffix?: string;
}

function buildDefectWorkbook<TRow>(params: BuildSheetParams<TRow>): XLSX.WorkBook {
  const { rows: sortedRows, visibleCols, fieldConfig, meta, globalFilter, searchParams, sourceSuffix } = params;

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const exportedTs = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const baseSourceLabel = inferSourceLabel(searchParams);
  const sourceLabel = sourceSuffix ? `${baseSourceLabel} · ${sourceSuffix}` : baseSourceLabel;
  // dummy table-less summaries: we accept that filters/sort summaries depend on table state; pass via closure below
  const filterSummary = (params as any)._filterSummary ?? '(none)';
  const sortSummary = (params as any)._sortSummary ?? '(default)';
  const searchLabel = globalFilter?.trim() ? `"${globalFilter.trim()}"` : '(none)';

  const colCount = Math.max(visibleCols.length, 2);
  const lastColLetter = XLSX.utils.encode_col(colCount - 1);

  const headerRow = visibleCols.map((c) => getColumnDisplayName(c, fieldConfig));
  const dataRows = sortedRows.map((r) => visibleCols.map((c) => formatCellValue(r, c)));

  const aoa: any[][] = [
    ['SHAW T&C — Defect Raw Data Export'],
    [`Exported: ${exportedTs}  by  ${meta.userName}${meta.userType ? ` (${meta.userType})` : ''}`],
    [`Source: ${sourceLabel}`],
    [`Search: ${searchLabel}`],
    [`Filters: ${filterSummary}`],
    [`Sort: ${sortSummary}`],
    [],
    headerRow,
    ...dataRows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  const merges: XLSX.Range[] = [];
  for (let r = 0; r < 6; r++) {
    merges.push({ s: { r, c: 0 }, e: { r, c: colCount - 1 } });
  }
  ws['!merges'] = merges;

  const cols: XLSX.ColInfo[] = visibleCols.map((c) => {
    const px = c.getSize();
    const wch = Math.max(8, Math.min(60, Math.round(px / 7)));
    return { wch };
  });
  ws['!cols'] = cols;

  const rowsInfo: XLSX.RowInfo[] = [];
  rowsInfo[0] = { hpt: 24 };
  for (let i = 1; i <= 5; i++) rowsInfo[i] = { hpt: 16 };
  rowsInfo[6] = { hpt: 6 };
  rowsInfo[7] = { hpt: 28 };
  for (let i = 0; i < dataRows.length; i++) {
    rowsInfo[8 + i] = { hpt: 20 };
  }
  ws['!rows'] = rowsInfo;

  const xSplit = Math.min(3, visibleCols.length);
  ws['!freeze'] = { xSplit, ySplit: 8 };
  (ws as any)['!views'] = [
    {
      state: 'frozen',
      xSplit,
      ySplit: 8,
      topLeftCell: XLSX.utils.encode_cell({ r: 8, c: xSplit }),
      activePane: 'bottomRight',
    },
  ];

  setCell(ws, 0, 0, aoa[0][0], STYLE_TITLE);
  for (let r = 1; r <= 5; r++) {
    setCell(ws, r, 0, aoa[r][0], r === 1 ? STYLE_META_LABEL : STYLE_META_VALUE);
  }
  for (let c = 0; c < headerRow.length; c++) {
    setCell(ws, 7, c, headerRow[c], STYLE_HEADER);
  }
  for (let r = 0; r < dataRows.length; r++) {
    for (let c = 0; c < dataRows[r].length; c++) {
      setCell(ws, 8 + r, c, dataRows[r][c], STYLE_DATA);
    }
  }

  const lastRow = 8 + dataRows.length - 1;
  ws['!ref'] = `A1:${lastColLetter}${Math.max(lastRow + 1, 8)}`;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Defects');
  return wb;
}

function timestampForFilename(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function sanitizeForFilename(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'Unassigned';
  const cleaned = trimmed.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  const truncated = cleaned.slice(0, 30);
  return truncated || 'Unassigned';
}

// ---------------------------------------------------------------------------
// Main export function (single file)
// ---------------------------------------------------------------------------

export function exportDefectRawToExcel<TRow>(opts: ExportDefectRawOptions<TRow>): {
  rowCount: number;
  fileName: string;
} {
  const { table, fieldConfig, globalFilter, searchParams, meta } = opts;

  const visibleCols = table.getVisibleLeafColumns();
  const sortedRows = table.getSortedRowModel().rows;

  const wb = buildDefectWorkbook({
    rows: sortedRows,
    visibleCols,
    fieldConfig,
    meta,
    globalFilter,
    searchParams,
    _filterSummary: summarizeFilters(table, fieldConfig),
    _sortSummary: summarizeSort(table, fieldConfig),
  } as BuildSheetParams<TRow>);

  const fileName = `SHAW_Defects_${timestampForFilename()}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return { rowCount: sortedRows.length, fileName };
}

// ---------------------------------------------------------------------------
// Per-subcontractor split export
// ---------------------------------------------------------------------------

export function exportDefectRawToExcelBySubcontractor<TRow>(opts: ExportDefectRawOptions<TRow>): {
  fileCount: number;
  rowCount: number;
  fileNames: string[];
} {
  const { table, fieldConfig, globalFilter, searchParams, meta } = opts;
  const visibleCols = table.getVisibleLeafColumns();
  const sortedRows = table.getSortedRowModel().rows;

  // Group by subcontractor_name
  const groups = new Map<string, Row<TRow>[]>();
  for (const r of sortedRows) {
    const original = r.original as any;
    const raw = original?.subcontractor_name;
    const key = raw && String(raw).trim() ? String(raw).trim() : 'Unassigned';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const filterSummary = summarizeFilters(table, fieldConfig);
  const sortSummary = summarizeSort(table, fieldConfig);
  const ts = timestampForFilename();
  const fileNames: string[] = [];

  // Sort keys alphabetically, Unassigned last
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });

  for (const subconName of sortedKeys) {
    const groupRows = groups.get(subconName)!;
    const wb = buildDefectWorkbook({
      rows: groupRows,
      visibleCols,
      fieldConfig,
      meta,
      globalFilter,
      searchParams,
      sourceSuffix: `Subcontractor: ${subconName}`,
      _filterSummary: filterSummary,
      _sortSummary: sortSummary,
    } as BuildSheetParams<TRow>);

    const fileName = `SHAW_Defects_${sanitizeForFilename(subconName)}_${ts}.xlsx`;
    XLSX.writeFile(wb, fileName);
    fileNames.push(fileName);
  }

  return { fileCount: fileNames.length, rowCount: sortedRows.length, fileNames };
}

function setCell(
  ws: XLSX.WorkSheet,
  r: number,
  c: number,
  value: unknown,
  style: Record<string, unknown>,
) {
  const addr = XLSX.utils.encode_cell({ r, c });
  const v = value == null ? '' : value;
  ws[addr] = { t: 's', v: String(v), s: style };
}
