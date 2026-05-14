import XLSX from 'xlsx-js-style';
import type { Table, Column, Row } from '@tanstack/react-table';
import { isoToExcelSerial, isoTimestampToExcelSerial, DATE_NUMFMT, DATETIME_NUMFMT } from '@/lib/excel-date-cell';
import {
  STYLE_TITLE,
  STYLE_META_LABEL,
  STYLE_META_VALUE,
  STYLE_HEADER,
  STYLE_DATA,
  setCell,
  setDateCell,
} from '@/lib/excel-export';
import type { DocsFieldConfigRow } from '@/hooks/useDocsFieldConfig';
import { DOCS_DEFAULT_FIELD_LABELS } from '@/hooks/useDocsFieldConfig';

export type SparePartExportFormat = 'view' | 'reimport';
export const SPARE_PART_REIMPORT_MARKER = '[Format: SHAW_SPARE_PART_REIMPORT_V1]';

const REIMPORT_ID_FIELDS = ['id', 'sn'] as const;
const REIMPORT_ID_LABELS: Record<string, string> = { id: 'ID', sn: 'S/N' };

/** All date-typed columns on docs_spare_part. Cells become real Excel date cells. */
export const SPARE_PART_DATE_FIELDS = new Set([
  'planned_confirm_date',
  'actual_confirm_date',
  'direction_to_subcon_date',
  'eta_date',
  'planned_po_date',
  'actual_po_date',
  'planned_delivery_date',
  'actual_delivery_date',
]);
const DATETIME_FIELDS = new Set(['updated_at', 'created_at']);

const REIMPORT_SKIP = new Set(['__select', '__open', '__expand']);

export interface ExportSparePartOptions<TRow> {
  table: Table<TRow>;
  fieldConfig: DocsFieldConfigRow[];
  globalFilter: string;
  meta: { userName: string; userType: string };
  format?: SparePartExportFormat;
}

function getFieldDisplayName(fieldName: string, fieldConfig: DocsFieldConfigRow[]): string {
  const cfg = fieldConfig.find((f) => f.field_name === fieldName);
  return cfg?.display_name || DOCS_DEFAULT_FIELD_LABELS[fieldName] || fieldName;
}

function summarizeFilters<TRow>(table: Table<TRow>, fieldConfig: DocsFieldConfigRow[]): string {
  const filters = table.getState().columnFilters;
  if (!filters.length) return '(none)';
  const parts: string[] = [];
  for (const f of filters) {
    const name = getFieldDisplayName(f.id, fieldConfig);
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

function summarizeSort<TRow>(table: Table<TRow>, fieldConfig: DocsFieldConfigRow[]): string {
  const sorting = table.getState().sorting;
  if (!sorting.length) return '(default)';
  return sorting.map((s) => `${getFieldDisplayName(s.id, fieldConfig)} ${s.desc ? '↓' : '↑'}`).join(', ');
}

function colWidthFor<TRow>(col: Column<TRow, unknown> | undefined, field: string): number {
  if (col) {
    try {
      const px = col.getSize();
      if (px && px > 0) return Math.max(8, Math.min(60, Math.round(px / 7)));
    } catch { /* fall through */ }
  }
  if (field === 'material' || field === 'specification') return 36;
  if (field === 'remarks' || field === 'spares_requirements' || field === 'storage_area_required') return 30;
  if (SPARE_PART_DATE_FIELDS.has(field)) return 12;
  if (field === 'sn') return 14;
  return 16;
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
  return cleaned.slice(0, 30) || 'Unassigned';
}

interface BuildSheetParams<TRow> {
  rows: Row<TRow>[];
  visibleCols: Column<TRow, unknown>[];
  fieldConfig: DocsFieldConfigRow[];
  meta: { userName: string; userType: string };
  globalFilter: string;
  sourceSuffix?: string;
  format?: SparePartExportFormat;
  _filterSummary?: string;
  _sortSummary?: string;
}

function buildSparePartWorkbook<TRow>(params: BuildSheetParams<TRow>): XLSX.WorkBook {
  const { rows: sortedRows, visibleCols, fieldConfig, meta, globalFilter, sourceSuffix } = params;
  const format: SparePartExportFormat = params.format ?? 'view';
  const isReimport = format === 'reimport';

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const exportedTs = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const baseSourceLabel = 'Spare Parts (direct)';
  const sourceLabel = sourceSuffix ? `${baseSourceLabel} · ${sourceSuffix}` : baseSourceLabel;
  const filterSummary = params._filterSummary ?? '(none)';
  const sortSummary = params._sortSummary ?? '(default)';
  const searchLabel = globalFilter?.trim() ? `"${globalFilter.trim()}"` : '(none)';
  const formatLabel = isReimport ? `Re-import ready  ${SPARE_PART_REIMPORT_MARKER}` : 'View-friendly';

  const visibleColIds = new Set(visibleCols.map((c) => c.id));
  const reimportIdFields = isReimport ? REIMPORT_ID_FIELDS.filter((f) => !visibleColIds.has(f)) : [];

  const headerRow: string[] = [
    ...reimportIdFields.map((f) => REIMPORT_ID_LABELS[f] ?? f),
    ...visibleCols.map((c) =>
      isReimport && REIMPORT_ID_LABELS[c.id]
        ? REIMPORT_ID_LABELS[c.id]
        : getFieldDisplayName(c.id, fieldConfig),
    ),
  ];

  const colCount = Math.max(headerRow.length, 2);
  const lastColLetter = XLSX.utils.encode_col(colCount - 1);

  const aoa: any[][] = [
    [`SHAW Docs — Spare Parts Raw Data Export  (${formatLabel})`],
    [`Exported: ${exportedTs}  by  ${meta.userName}${meta.userType ? ` (${meta.userType})` : ''}`],
    [`Source: ${sourceLabel}`],
    [`Search: ${searchLabel}`],
    [`Filters: ${filterSummary}`],
    [`Sort: ${sortSummary}`],
    [],
    headerRow,
    ...sortedRows.map((row) => [
      ...reimportIdFields.map((f) => {
        const v = (row.original as any)?.[f];
        return v == null ? '' : String(v);
      }),
      ...visibleCols.map((c) => {
        const id = c.id;
        const v = (row.original as any)?.[id];
        if (v == null || v === '') return '';
        if (SPARE_PART_DATE_FIELDS.has(id) || DATETIME_FIELDS.has(id)) return ''; // filled later as real date cell
        return v;
      }),
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  const merges: XLSX.Range[] = [];
  for (let r = 0; r < 6; r++) merges.push({ s: { r, c: 0 }, e: { r, c: colCount - 1 } });
  ws['!merges'] = merges;

  const cols: XLSX.ColInfo[] = headerRow.map((_, idx) => {
    if (idx < reimportIdFields.length) {
      const fieldId = reimportIdFields[idx];
      return { wch: fieldId === 'id' ? 38 : 14 };
    }
    const c = visibleCols[idx - reimportIdFields.length];
    return { wch: colWidthFor(c, c.id) };
  });
  ws['!cols'] = cols;

  const rowsInfo: XLSX.RowInfo[] = [];
  rowsInfo[0] = { hpt: 24 };
  for (let i = 1; i <= 5; i++) rowsInfo[i] = { hpt: 16 };
  rowsInfo[6] = { hpt: 6 };
  rowsInfo[7] = { hpt: 28 };
  for (let i = 0; i < sortedRows.length; i++) rowsInfo[8 + i] = { hpt: 20 };
  ws['!rows'] = rowsInfo;

  const xSplit = Math.min(3, headerRow.length);
  ws['!freeze'] = { xSplit, ySplit: 8 } as any;
  (ws as any)['!views'] = [{
    state: 'frozen', xSplit, ySplit: 8,
    topLeftCell: XLSX.utils.encode_cell({ r: 8, c: xSplit }),
    activePane: 'bottomRight',
  }];

  setCell(ws, 0, 0, aoa[0][0], STYLE_TITLE);
  for (let r = 1; r <= 5; r++) setCell(ws, r, 0, aoa[r][0], r === 1 ? STYLE_META_LABEL : STYLE_META_VALUE);
  for (let c = 0; c < headerRow.length; c++) setCell(ws, 7, c, headerRow[c], STYLE_HEADER);

  const fieldIdByColIdx: (string | null)[] = [...reimportIdFields, ...visibleCols.map((c) => c.id)];

  for (let r = 0; r < sortedRows.length; r++) {
    const original = sortedRows[r].original as any;
    for (let c = 0; c < headerRow.length; c++) {
      const fieldId = fieldIdByColIdx[c];
      const raw = fieldId ? original?.[fieldId] : null;
      if (fieldId && SPARE_PART_DATE_FIELDS.has(fieldId)) {
        const serial = isoToExcelSerial(raw == null ? null : String(raw));
        if (serial != null) { setDateCell(ws, 8 + r, c, serial, STYLE_DATA, DATE_NUMFMT); continue; }
      } else if (fieldId && DATETIME_FIELDS.has(fieldId)) {
        const serial = isoTimestampToExcelSerial(raw == null ? null : String(raw));
        if (serial != null) { setDateCell(ws, 8 + r, c, serial, STYLE_DATA, DATETIME_NUMFMT); continue; }
      }
      setCell(ws, 8 + r, c, raw == null || raw === '' ? '' : raw, STYLE_DATA);
    }
  }

  const lastRow = 8 + sortedRows.length - 1;
  ws['!ref'] = `A1:${lastColLetter}${Math.max(lastRow + 1, 8)}`;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, format === 'reimport' ? 'Spare Parts (Re-import)' : 'Spare Parts');
  return wb;
}

// ---------- Public API: legacy single-table export (used by existing detail page button) ----------

export function exportSparePartToExcel<TRow extends Record<string, any>>(opts: ExportSparePartOptions<TRow>) {
  const result = exportSparePartRawToExcel(opts);
  return result;
}

// ---------- New per-Defect-style API ----------

export function exportSparePartRawToExcel<TRow>(opts: ExportSparePartOptions<TRow>): {
  rowCount: number;
  fileName: string;
} {
  const { table, fieldConfig, globalFilter, meta, format = 'view' } = opts;
  const visibleCols = table.getVisibleLeafColumns().filter((c) => !REIMPORT_SKIP.has(c.id));
  const sortedRows = table.getSortedRowModel().rows;
  const wb = buildSparePartWorkbook({
    rows: sortedRows,
    visibleCols,
    fieldConfig,
    meta,
    globalFilter,
    format,
    _filterSummary: summarizeFilters(table, fieldConfig),
    _sortSummary: summarizeSort(table, fieldConfig),
  });
  const suffix = format === 'reimport' ? '_REIMPORT' : '';
  const fileName = `SHAW_SpareParts${suffix}_${timestampForFilename()}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return { rowCount: sortedRows.length, fileName };
}

export function exportSparePartRawToExcelBySubcontractor<TRow>(opts: ExportSparePartOptions<TRow>): {
  fileCount: number;
  rowCount: number;
  fileNames: string[];
} {
  const { table, fieldConfig, globalFilter, meta, format = 'view' } = opts;
  const visibleCols = table.getVisibleLeafColumns().filter((c) => !REIMPORT_SKIP.has(c.id));
  const sortedRows = table.getSortedRowModel().rows;

  const groups = new Map<string, Row<TRow>[]>();
  for (const r of sortedRows) {
    const raw = (r.original as any)?.subcontractor_name;
    const key = raw && String(raw).trim() ? String(raw).trim() : 'Unassigned';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const filterSummary = summarizeFilters(table, fieldConfig);
  const sortSummary = summarizeSort(table, fieldConfig);
  const ts = timestampForFilename();
  const suffix = format === 'reimport' ? '_REIMPORT' : '';
  const fileNames: string[] = [];

  const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });

  for (const subconName of sortedKeys) {
    const groupRows = groups.get(subconName)!;
    const wb = buildSparePartWorkbook({
      rows: groupRows, visibleCols, fieldConfig, meta, globalFilter, format,
      sourceSuffix: `Subcontractor: ${subconName}`,
      _filterSummary: filterSummary, _sortSummary: sortSummary,
    });
    const fileName = `SHAW_SpareParts${suffix}_${sanitizeForFilename(subconName)}_${ts}.xlsx`;
    XLSX.writeFile(wb, fileName);
    fileNames.push(fileName);
  }

  return { fileCount: fileNames.length, rowCount: sortedRows.length, fileNames };
}

export async function exportSparePartRawToZipBySubcontractor<TRow>(
  opts: ExportSparePartOptions<TRow>,
): Promise<{ fileCount: number; rowCount: number; zipFileName: string; fileNames: string[] }> {
  const { default: JSZip } = await import('jszip');
  const { table, fieldConfig, globalFilter, meta, format = 'view' } = opts;
  const visibleCols = table.getVisibleLeafColumns().filter((c) => !REIMPORT_SKIP.has(c.id));
  const sortedRows = table.getSortedRowModel().rows;

  const groups = new Map<string, Row<TRow>[]>();
  for (const r of sortedRows) {
    const raw = (r.original as any)?.subcontractor_name;
    const key = raw && String(raw).trim() ? String(raw).trim() : 'Unassigned';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const filterSummary = summarizeFilters(table, fieldConfig);
  const sortSummary = summarizeSort(table, fieldConfig);
  const ts = timestampForFilename();
  const suffix = format === 'reimport' ? '_REIMPORT' : '';

  const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });

  const zip = new JSZip();
  const usedNames = new Set<string>();
  const fileNames: string[] = [];

  for (const subconName of sortedKeys) {
    const groupRows = groups.get(subconName)!;
    const wb = buildSparePartWorkbook({
      rows: groupRows, visibleCols, fieldConfig, meta, globalFilter, format,
      sourceSuffix: `Subcontractor: ${subconName}`,
      _filterSummary: filterSummary, _sortSummary: sortSummary,
    });
    const baseName = `SHAW_SpareParts${suffix}_${sanitizeForFilename(subconName)}_${ts}`;
    let candidate = `${baseName}.xlsx`;
    let n = 2;
    while (usedNames.has(candidate)) { candidate = `${baseName} (${n}).xlsx`; n += 1; }
    usedNames.add(candidate);
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    zip.file(candidate, buffer);
    fileNames.push(candidate);
  }

  const zipFileName = `SHAW_SpareParts${suffix}_BySubcontractor_${ts}.zip`;
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
