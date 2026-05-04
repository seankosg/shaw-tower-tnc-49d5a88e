import XLSX from 'xlsx-js-style';
import type { Table, Column, Row } from '@tanstack/react-table';
import { formatDdMmm, formatDdMmmYyyy } from './format';
import { DATA_SOURCE_LABELS, type DataSource, type TcStatus } from '@/types/enums';
import type { FieldConfigRow } from '@/hooks/useFieldConfig';
import { isMetaField } from '@/lib/meta-fields';
import { isoToExcelSerial, isoTimestampToExcelSerial, DATE_NUMFMT, DATETIME_NUMFMT } from '@/lib/excel-date-cell';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportSubtestsOptions<TRow> {
  table: Table<TRow>;
  fieldConfig: FieldConfigRow[];
  globalFilter: string;
  searchParams: URLSearchParams;
  meta: {
    userName: string;
    userType: string;
  };
}

// react-table column id → field_config.field_name (only when they differ)
const COLUMN_ID_TO_FIELD_NAME: Record<string, string> = {
  system_code: 'system',
};

// ---------------------------------------------------------------------------
// Source line inference (from URL params)
// ---------------------------------------------------------------------------

function inferSourceLabel(params: URLSearchParams): string {
  const status = params.get('status');
  if (status === 'overdue') return 'Dashboard → Overdue Subtests';
  if (status === 'at_risk') {
    const days = params.get('at_risk_days') ?? '2';
    return `Dashboard → At-Risk Subtests (≤${days} days)`;
  }
  const subcon = params.get('subcon');
  if (subcon) return `Dashboard → Subcontractor: ${subcon}`;
  const subsub = params.get('subsub');
  if (subsub) return `Dashboard → Sub-subcontractor: ${subsub}`;
  const hdec = params.get('hdec_pic');
  if (hdec) return `Dashboard → HDEC PIC: ${hdec}`;
  const system = params.get('system');
  if (system) return `Dashboard → System: ${system}`;
  const t1 = params.get('t1_status');
  if (t1) return `Dashboard → T1 Status: ${t1}`;
  const t2 = params.get('t2_status');
  if (t2) return `Dashboard → T2 Status: ${t2}`;
  // Date filters
  const dateParams = [
    't1_planned_to', 't2_planned_to', 't1_actual_to', 't2_actual_to',
    't1_planned_on', 't2_planned_on', 't1_actual_on', 't2_actual_on',
  ];
  for (const p of dateParams) {
    const v = params.get(p);
    if (v) return `Dashboard → ${p} = ${v}`;
  }
  return 'Subtest Master DB (direct)';
}

// ---------------------------------------------------------------------------
// Filter & sort summaries
// ---------------------------------------------------------------------------

function getColumnDisplayName<TRow>(
  col: Column<TRow, unknown>,
  fieldConfig: FieldConfigRow[],
): string {
  const id = col.id;
  const fieldName = COLUMN_ID_TO_FIELD_NAME[id] ?? id;
  const cfg = fieldConfig.find((f) => f.field_name === fieldName);
  if (cfg?.display_name) return cfg.display_name;
  const headerDef = col.columnDef.header;
  if (typeof headerDef === 'string') return headerDef;
  return id;
}

function summarizeFilters<TRow>(table: Table<TRow>, fieldConfig: FieldConfigRow[]): string {
  const filters = table.getState().columnFilters;
  if (!filters.length) return '(none)';
  const parts: string[] = [];
  for (const f of filters) {
    const col = table.getColumn(f.id);
    if (!col) continue;
    const name = getColumnDisplayName(col, fieldConfig);
    const v = f.value;
    if (Array.isArray(v)) {
      if (!v.length) continue;
      parts.push(`${name}=[${v.join(', ')}]`);
    } else if (typeof v === 'string' && v.trim()) {
      parts.push(`${name}="${v}"`);
    } else if (v != null) {
      parts.push(`${name}=${String(v)}`);
    }
  }
  return parts.length ? parts.join(' · ') : '(none)';
}

function summarizeSort<TRow>(table: Table<TRow>, fieldConfig: FieldConfigRow[]): string {
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

const DATE_COLUMN_IDS = new Set([
  't1_planned_date', 't1_actual_date',
  't2_planned_date', 't2_actual_date',
]);

function formatCellValue<TRow>(row: Row<TRow>, col: Column<TRow, unknown>): string {
  const id = col.id;

  // Synthetic stage progress: derive a compact text representation
  if (id === 'stage_progress') {
    const r = row.original as any;
    const t1 = r.t1_status === 'Done' ? '✓T1' : r.t1_status === 'WIP' ? '⋯T1' : '';
    const t2 = r.t2_status === 'Done' ? '✓T2' : r.t2_status === 'WIP' ? '⋯T2' : '';
    const parts = [t1, t2].filter(Boolean);
    return parts.length ? parts.join(' ') : '—';
  }

  const raw = row.getValue(id);
  if (raw == null || raw === '') return '';

  if (DATE_COLUMN_IDS.has(id)) {
    return formatDdMmm(raw as string);
  }
  if (id === 'updated_at') {
    return formatDdMmmYyyy(raw as string);
  }
  if (id === 'data_source_type') {
    return DATA_SOURCE_LABELS[raw as DataSource] ?? String(raw);
  }
  if (id === 't1_status' || id === 't2_status') {
    return String(raw as TcStatus);
  }
  return String(raw);
}

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

export const FONT_NAME = 'Calibri';

export const STYLE_TITLE = {
  font: { name: FONT_NAME, sz: 14, bold: true, color: { rgb: 'FFFFFFFF' } },
  fill: { fgColor: { rgb: 'FF1E3A5F' } },
  alignment: { vertical: 'center', horizontal: 'left' },
} as const;

export const STYLE_META_LABEL = {
  font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: 'FF374151' } },
  fill: { fgColor: { rgb: 'FFF3F4F6' } },
  alignment: { vertical: 'center', horizontal: 'left' },
} as const;

export const STYLE_META_VALUE = {
  font: { name: FONT_NAME, sz: 10, color: { rgb: 'FF111827' } },
  fill: { fgColor: { rgb: 'FFF3F4F6' } },
  alignment: { vertical: 'center', horizontal: 'left', wrapText: true },
} as const;

export const STYLE_HEADER = {
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

export const STYLE_DATA = {
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
// Workbook builder (shared by single + per-Subcontractor exports)
// ---------------------------------------------------------------------------

interface BuildSubtestsWorkbookParams<TRow> {
  rows: Row<TRow>[];
  visibleCols: Column<TRow, unknown>[];
  fieldConfig: FieldConfigRow[];
  globalFilter: string;
  searchParams: URLSearchParams;
  meta: { userName: string; userType: string };
  sourceSuffix?: string;
  filterSummary: string;
  sortSummary: string;
}

function buildSubtestsWorkbook<TRow>(params: BuildSubtestsWorkbookParams<TRow>): {
  wb: XLSX.WorkBook;
  rowCount: number;
} {
  const { rows: sortedRows, visibleCols, fieldConfig, globalFilter, searchParams, meta, sourceSuffix, filterSummary, sortSummary } = params;

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const exportedTs = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const baseSourceLabel = inferSourceLabel(searchParams);
  const sourceLabel = sourceSuffix ? `${baseSourceLabel} | ${sourceSuffix}` : baseSourceLabel;
  const searchLabel = globalFilter?.trim() ? `"${globalFilter.trim()}"` : '(none)';

  const colCount = Math.max(visibleCols.length, 2);
  const lastColLetter = XLSX.utils.encode_col(colCount - 1);

  const headerRow = visibleCols.map((c) => getColumnDisplayName(c, fieldConfig));
  const dataRows = sortedRows.map((r) => visibleCols.map((c) => formatCellValue(r, c)));

  const aoa: any[][] = [
    ['SHAW T&C — Subtest Master DB Export'],
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
      const col = visibleCols[c];
      const colId = col?.id;
      if (colId && DATE_COLUMN_IDS.has(colId)) {
        const original = sortedRows[r].original as any;
        const rawIso = original?.[colId];
        const serial = isoToExcelSerial(rawIso);
        if (serial != null) {
          setDateCell(ws, 8 + r, c, serial, STYLE_DATA, DATE_NUMFMT);
          continue;
        }
      }
      if (colId === 'updated_at') {
        const original = sortedRows[r].original as any;
        const rawIso = original?.updated_at;
        const serial = isoTimestampToExcelSerial(rawIso);
        if (serial != null) {
          setDateCell(ws, 8 + r, c, serial, STYLE_DATA, DATETIME_NUMFMT);
          continue;
        }
      }
      setCell(ws, 8 + r, c, dataRows[r][c], STYLE_DATA);
    }
  }

  const lastRow = 8 + dataRows.length - 1;
  ws['!ref'] = `A1:${lastColLetter}${Math.max(lastRow + 1, 8)}`;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Subtests');
  return { wb, rowCount: dataRows.length };
}

function timestampForFilename(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function sanitizeForFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 80) || 'Unnamed';
}

// ---------------------------------------------------------------------------
// Main export function (single file)
// ---------------------------------------------------------------------------

export function exportSubtestsToExcel<TRow>(opts: ExportSubtestsOptions<TRow>): {
  rowCount: number;
  fileName: string;
} {
  const { table, fieldConfig, globalFilter, searchParams, meta } = opts;
  const visibleCols = table.getVisibleLeafColumns().filter((c) => !isMetaField(c.id));
  const sortedRows = table.getSortedRowModel().rows;

  const filterSummary = summarizeFilters(table, fieldConfig);
  const sortSummary = summarizeSort(table, fieldConfig);

  const { wb, rowCount } = buildSubtestsWorkbook({
    rows: sortedRows,
    visibleCols,
    fieldConfig,
    globalFilter,
    searchParams,
    meta,
    filterSummary,
    sortSummary,
  });

  const fileName = `SHAW_Subtests_${timestampForFilename()}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return { rowCount, fileName };
}

// ---------------------------------------------------------------------------
// Per-Subcontractor split exports (individual downloads + ZIP bundle)
// ---------------------------------------------------------------------------

function groupSubtestRowsBySubcontractor<TRow>(rows: Row<TRow>[]): Map<string, Row<TRow>[]> {
  const groups = new Map<string, Row<TRow>[]>();
  for (const r of rows) {
    const original = r.original as any;
    const raw = original?.subcontractor_name;
    const key = raw && String(raw).trim() ? String(raw).trim() : 'Unassigned';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  return groups;
}

function sortGroupKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });
}

export function exportSubtestsToExcelBySubcontractor<TRow>(opts: ExportSubtestsOptions<TRow>): {
  fileCount: number;
  rowCount: number;
  fileNames: string[];
} {
  const { table, fieldConfig, globalFilter, searchParams, meta } = opts;
  const visibleCols = table.getVisibleLeafColumns().filter((c) => !isMetaField(c.id));
  const sortedRows = table.getSortedRowModel().rows;

  const groups = groupSubtestRowsBySubcontractor(sortedRows);
  const filterSummary = summarizeFilters(table, fieldConfig);
  const sortSummary = summarizeSort(table, fieldConfig);
  const ts = timestampForFilename();
  const fileNames: string[] = [];

  for (const subconName of sortGroupKeys(Array.from(groups.keys()))) {
    const groupRows = groups.get(subconName)!;
    const { wb } = buildSubtestsWorkbook({
      rows: groupRows,
      visibleCols,
      fieldConfig,
      globalFilter,
      searchParams,
      meta,
      sourceSuffix: `Subcontractor: ${subconName}`,
      filterSummary,
      sortSummary,
    });
    const fileName = `SHAW_Subtests_${sanitizeForFilename(subconName)}_${ts}.xlsx`;
    XLSX.writeFile(wb, fileName);
    fileNames.push(fileName);
  }

  return { fileCount: fileNames.length, rowCount: sortedRows.length, fileNames };
}

export async function exportSubtestsToZipBySubcontractor<TRow>(
  opts: ExportSubtestsOptions<TRow>,
): Promise<{ fileCount: number; rowCount: number; zipFileName: string; fileNames: string[] }> {
  const { default: JSZip } = await import('jszip');
  const { table, fieldConfig, globalFilter, searchParams, meta } = opts;
  const visibleCols = table.getVisibleLeafColumns().filter((c) => !isMetaField(c.id));
  const sortedRows = table.getSortedRowModel().rows;

  const groups = groupSubtestRowsBySubcontractor(sortedRows);
  const filterSummary = summarizeFilters(table, fieldConfig);
  const sortSummary = summarizeSort(table, fieldConfig);
  const ts = timestampForFilename();

  const zip = new JSZip();
  const usedNames = new Set<string>();
  const fileNames: string[] = [];

  for (const subconName of sortGroupKeys(Array.from(groups.keys()))) {
    const groupRows = groups.get(subconName)!;
    const { wb } = buildSubtestsWorkbook({
      rows: groupRows,
      visibleCols,
      fieldConfig,
      globalFilter,
      searchParams,
      meta,
      sourceSuffix: `Subcontractor: ${subconName}`,
      filterSummary,
      sortSummary,
    });

    const baseName = `SHAW_Subtests_${sanitizeForFilename(subconName)}_${ts}`;
    let candidate = `${baseName}.xlsx`;
    let n = 2;
    while (usedNames.has(candidate)) {
      candidate = `${baseName} (${n}).xlsx`;
      n += 1;
    }
    usedNames.add(candidate);

    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    zip.file(candidate, buffer);
    fileNames.push(candidate);
  }

  const zipFileName = `SHAW_Subtests_BySubcontractor_${ts}.zip`;
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { fileCount: fileNames.length, rowCount: sortedRows.length, zipFileName, fileNames };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

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

function setDateCell(
  ws: XLSX.WorkSheet,
  r: number,
  c: number,
  serial: number,
  style: Record<string, unknown>,
  numFmt: string,
) {
  const addr = XLSX.utils.encode_cell({ r, c });
  ws[addr] = { t: 'n', v: serial, z: numFmt, s: { ...style, numFmt } };
}

// ---------------------------------------------------------------------------
// Array-based export (for pages without a react-table instance, e.g. Progress)
//
// Mirrors the layout, styles, freeze panes and date-cell handling of
// `exportSubtestsToExcel`, but takes a plain `rows` array and an explicit
// list of field names to include as columns. The display labels and order
// come from `fieldConfig` (sort_order ascending, enabled fields).
// ---------------------------------------------------------------------------

export interface ExportSubtestsArrayOptions {
  rows: any[];
  fieldConfig: FieldConfigRow[];
  /** Optional override of which fields to include (in order). Defaults to all
   *  enabled fields from `fieldConfig`, sorted by sort_order. */
  fieldNames?: string[];
  meta: { userName: string; userType: string };
  sourceLabel: string;
  filterSummary: string;
  /** "Subtests" by default. */
  sheetName?: string;
  /** Filename stem; the timestamp + .xlsx is appended. */
  fileStem?: string;
}

function formatRawValue(fieldName: string, raw: unknown, original: any): string {
  if (raw == null || raw === '') return '';
  if (fieldName === 'system_code' || fieldName === 'system') {
    // Some callers pre-resolve system_code; otherwise fall back to system_id.
    return String(raw);
  }
  if (DATE_COLUMN_IDS.has(fieldName)) return formatDdMmm(raw as string);
  if (fieldName === 'updated_at' || fieldName === 'created_at') {
    return formatDdMmmYyyy(raw as string);
  }
  if (fieldName === 'data_source_type') {
    return DATA_SOURCE_LABELS[raw as DataSource] ?? String(raw);
  }
  if (fieldName === 't1_status' || fieldName === 't2_status') {
    return String(raw as TcStatus);
  }
  if (fieldName === 'stage_progress') {
    const t1 = original?.t1_status === 'Done' ? '✓T1' : original?.t1_status === 'WIP' ? '⋯T1' : '';
    const t2 = original?.t2_status === 'Done' ? '✓T2' : original?.t2_status === 'WIP' ? '⋯T2' : '';
    const parts = [t1, t2].filter(Boolean);
    return parts.length ? parts.join(' ') : '—';
  }
  return String(raw);
}

export function exportSubtestsArrayToExcel(opts: ExportSubtestsArrayOptions): {
  rowCount: number;
  fileName: string;
} {
  const { rows, fieldConfig, meta, sourceLabel, filterSummary } = opts;

  // Determine field list: explicit override, else enabled fields by sort_order.
  const explicit = opts.fieldNames;
  const orderedFields: FieldConfigRow[] = explicit
    ? explicit
        .map((n) => fieldConfig.find((f) => f.field_name === n))
        .filter((f): f is FieldConfigRow => !!f)
    : [...fieldConfig]
        .filter((f) => f.is_enabled !== false)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .filter((f) => !isMetaField(f.field_name));

  const headerRow = orderedFields.map((f) => f.display_name || f.field_name);
  const fieldNames = orderedFields.map((f) => f.field_name);

  const dataRows = rows.map((r) =>
    fieldNames.map((fname) => formatRawValue(fname, r?.[fname], r)),
  );

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const exportedTs = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const fileTs = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;

  const colCount = Math.max(headerRow.length, 2);
  const lastColLetter = XLSX.utils.encode_col(colCount - 1);

  const aoa: any[][] = [
    ['SHAW T&C — Subtest Export'],
    [`Exported: ${exportedTs}  by  ${meta.userName}${meta.userType ? ` (${meta.userType})` : ''}`],
    [`Source: ${sourceLabel}`],
    [`Search: (none)`],
    [`Filters: ${filterSummary}`],
    [`Sort: (default)`],
    [],
    headerRow,
    ...dataRows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  const merges: XLSX.Range[] = [];
  for (let r = 0; r < 6; r++) merges.push({ s: { r, c: 0 }, e: { r, c: colCount - 1 } });
  ws['!merges'] = merges;

  // Reasonable default widths
  ws['!cols'] = headerRow.map(() => ({ wch: 18 }));

  const rowsInfo: XLSX.RowInfo[] = [];
  rowsInfo[0] = { hpt: 24 };
  for (let i = 1; i <= 5; i++) rowsInfo[i] = { hpt: 16 };
  rowsInfo[6] = { hpt: 6 };
  rowsInfo[7] = { hpt: 28 };
  for (let i = 0; i < dataRows.length; i++) rowsInfo[8 + i] = { hpt: 20 };
  ws['!rows'] = rowsInfo;

  const xSplit = Math.min(3, headerRow.length);
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
    const original = rows[r];
    for (let c = 0; c < dataRows[r].length; c++) {
      const fname = fieldNames[c];
      if (DATE_COLUMN_IDS.has(fname)) {
        const serial = isoToExcelSerial(original?.[fname]);
        if (serial != null) {
          setDateCell(ws, 8 + r, c, serial, STYLE_DATA, DATE_NUMFMT);
          continue;
        }
      }
      if (fname === 'updated_at' || fname === 'created_at') {
        const serial = isoTimestampToExcelSerial(original?.[fname]);
        if (serial != null) {
          setDateCell(ws, 8 + r, c, serial, STYLE_DATA, DATETIME_NUMFMT);
          continue;
        }
      }
      setCell(ws, 8 + r, c, dataRows[r][c], STYLE_DATA);
    }
  }

  const lastRow = 8 + dataRows.length - 1;
  ws['!ref'] = `A1:${lastColLetter}${Math.max(lastRow + 1, 8)}`;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, opts.sheetName ?? 'Subtests');

  const fileName = `${opts.fileStem ?? 'SHAW_Subtests'}_${fileTs}.xlsx`;
  XLSX.writeFile(wb, fileName);

  return { rowCount: dataRows.length, fileName };
}
