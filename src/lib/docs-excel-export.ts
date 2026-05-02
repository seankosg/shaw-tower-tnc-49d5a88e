import XLSX from 'xlsx-js-style';
import type { Table } from '@tanstack/react-table';
import { formatDdMmm } from './format';
import { isoToExcelSerial, isoTimestampToExcelSerial, DATE_NUMFMT, DATETIME_NUMFMT } from '@/lib/excel-date-cell';
import type { DocsFieldConfigRow } from '@/hooks/useDocsFieldConfig';

export type DocsExportFormat = 'view' | 'reimport';
export const DOCS_REIMPORT_MARKER = '[Format: SHAW_DOCS_REIMPORT_V1]';

const REIMPORT_ID_FIELDS = ['id', 'document_no', 'revision'] as const;
const REIMPORT_ID_LABELS: Record<string, string> = {
  id: 'ID',
  document_no: 'Document No',
  revision: 'Revision',
};

const DATE_FIELDS = new Set([
  'submitted_date',
  'approved_date',
  'transmittal_due_date',
  'sub1_planned_date',
  'sub1_submission_date',
  'sub1_approval_date',
  'sub2_planned_date',
  'sub2_submission_date',
  'sub2_approval_date',
  'sub3_planned_date',
  'sub3_submission_date',
  'sub3_approval_date',
]);

const TIMESTAMP_FIELDS = new Set(['updated_at', 'created_at']);

export interface ExportDocsRawOptions<TRow> {
  table: Table<TRow>;
  fieldConfig: DocsFieldConfigRow[];
  globalFilter: string;
  meta: { userName: string; userType: string };
  format?: DocsExportFormat;
}

function buildHeaderRow(visibleColumnIds: string[], labels: Record<string, string>): string[] {
  return visibleColumnIds.map((id) => labels[id] ?? id);
}

function cellValue(field: string, raw: any): any {
  if (raw == null || raw === '') return '';
  if (DATE_FIELDS.has(field)) {
    const serial = isoToExcelSerial(String(raw));
    return serial ?? formatDdMmm(String(raw));
  }
  if (TIMESTAMP_FIELDS.has(field)) {
    const serial = isoTimestampToExcelSerial(String(raw));
    return serial ?? String(raw);
  }
  if (typeof raw === 'boolean') return raw ? 'Y' : 'N';
  return raw;
}

export function exportDocsRawToExcel<TRow extends Record<string, any>>(opts: ExportDocsRawOptions<TRow>) {
  const { table, fieldConfig, globalFilter, meta, format = 'view' } = opts;

  const wb = XLSX.utils.book_new();
  const filteredRows = table.getFilteredRowModel().rows.map((r) => r.original);

  const visibleCols = table.getVisibleLeafColumns().map((c) => c.id);

  let columnIds: string[];
  let labelMap: Record<string, string>;

  if (format === 'reimport') {
    const idCols = REIMPORT_ID_FIELDS.filter((f) => fieldConfig.find((fc) => fc.field_name === f) || f === 'id');
    const editableCols = visibleCols.filter(
      (id) => !REIMPORT_ID_FIELDS.includes(id as any) && id !== 'select' && id !== 'comments' && id !== 'risk' && id !== 'trade',
    );
    columnIds = [...idCols, ...editableCols];
    labelMap = {
      ...REIMPORT_ID_LABELS,
      ...Object.fromEntries(fieldConfig.map((f) => [f.field_name, f.display_name])),
    };
  } else {
    columnIds = visibleCols.filter((id) => id !== 'select');
    labelMap = Object.fromEntries(fieldConfig.map((f) => [f.field_name, f.display_name]));
  }

  // Meta header
  const today = new Date().toISOString().slice(0, 10);
  const headerLines: any[][] = [
    [`SHAW As-Built Drawings — Raw Data Export`],
    [`Exported By: ${meta.userName} (${meta.userType})`],
    [`Exported At: ${today}`],
    [`Filter: ${globalFilter || '(none)'}`],
    [`Rows: ${filteredRows.length}`],
  ];
  if (format === 'reimport') headerLines.push([DOCS_REIMPORT_MARKER]);
  headerLines.push([]); // blank

  const headerRow = buildHeaderRow(columnIds, labelMap);
  const dataRows = filteredRows.map((row) =>
    columnIds.map((field) => cellValue(field, (row as any)[field])),
  );

  const aoa = [...headerLines, headerRow, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Apply date format to date columns
  const headerRowIndex = headerLines.length; // 0-based row index of header
  for (let c = 0; c < columnIds.length; c++) {
    const field = columnIds[c];
    const isDate = DATE_FIELDS.has(field);
    const isTs = TIMESTAMP_FIELDS.has(field);
    if (!isDate && !isTs) continue;
    for (let r = headerRowIndex + 1; r < aoa.length; r++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = ws[ref];
      if (cell && typeof cell.v === 'number') {
        cell.t = 'n';
        cell.z = isDate ? DATE_NUMFMT : DATETIME_NUMFMT;
      }
    }
  }

  // Bold header
  for (let c = 0; c < columnIds.length; c++) {
    const ref = XLSX.utils.encode_cell({ r: headerRowIndex, c });
    if (ws[ref]) ws[ref].s = { font: { bold: true } };
  }

  // Column widths
  ws['!cols'] = columnIds.map((id) => ({ wch: id === 'title' ? 40 : id === 'remarks' ? 30 : 16 }));

  XLSX.utils.book_append_sheet(wb, ws, 'Drawings');

  const fname = `shaw_drawings_${format}_${today.replace(/-/g, '')}.xlsx`;
  XLSX.writeFile(wb, fname);
}
