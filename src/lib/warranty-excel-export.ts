import XLSX from 'xlsx-js-style';
import type { Table, Column } from '@tanstack/react-table';
import { isoToExcelSerial, DATE_NUMFMT } from '@/lib/excel-date-cell';
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
import { computeWarrantyOverallStatus } from '@/lib/docs-warranty-status';

export type WarrantyExportFormat = 'view' | 'reimport';
export const WARRANTY_REIMPORT_MARKER = '[Format: SHAW_WARRANTY_REIMPORT_V1]';

const REIMPORT_ID_FIELDS = ['id', 'item_no', 'resubmission_seq'] as const;
const REIMPORT_ID_LABELS: Record<string, string> = {
  id: 'ID',
  item_no: 'Item No',
  resubmission_seq: 'Resubmission Seq',
};

export const WARRANTY_DATE_FIELDS = new Set([
  'r_subcontract_date',
  'draft_planned_date',
  'draft_actual_date',
  'draft_response_planned_date',
  'draft_response_actual_date',
  'subcon_signing_planned_date',
  'subcon_signing_actual_date',
  'hdec_signing_planned_date',
  'hdec_signing_actual_date',
  'final_planned_date',
  'final_actual_date',
]);

export interface ExportWarrantyOptions<TRow> {
  table: Table<TRow>;
  fieldConfig: DocsFieldConfigRow[];
  globalFilter: string;
  meta: { userName: string; userType: string };
  format?: WarrantyExportFormat;
}

function getFieldDisplayName(fieldName: string, fieldConfig: DocsFieldConfigRow[]): string {
  const cfg = fieldConfig.find((f) => f.field_name === fieldName);
  return cfg?.display_name || fieldName;
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
      // stage-progress
      const stageKeys = ['acra', 'draft', 'subcon', 'hdec', 'final'];
      const stageBits = stageKeys
        .filter((k) => Array.isArray(v[k]) && v[k].length)
        .map((k) => `${k}(${v[k].join(',')})`);
      if (stageBits.length) {
        parts.push(`${name}={${stageBits.join(' · ')}}`);
      } else if ('text' in v && v.text) {
        parts.push(`${name}~"${v.text}"`);
      } else if ('from' in v || 'to' in v) {
        parts.push(`${name}=${v.from ?? '*'}…${v.to ?? '*'}`);
      } else if ('min' in v || 'max' in v) {
        parts.push(`${name}=${v.min ?? '*'}–${v.max ?? '*'}`);
      } else if (v.emptyOnly) {
        parts.push(`${name}=(empty)`);
      }
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
  return sorting
    .map((s) => `${getFieldDisplayName(s.id, fieldConfig)} ${s.desc ? '↓' : '↑'}`)
    .join(', ');
}

function rawCellValue(field: string, raw: any): { kind: 'date' | 'text'; value: any } {
  if (raw == null || raw === '') return { kind: 'text', value: '' };
  if (WARRANTY_DATE_FIELDS.has(field)) {
    const serial = isoToExcelSerial(String(raw));
    if (serial != null) return { kind: 'date', value: serial };
    return { kind: 'text', value: String(raw) };
  }
  if (typeof raw === 'boolean') return { kind: 'text', value: raw ? 'Y' : 'N' };
  return { kind: 'text', value: raw };
}

function colWidthFor<TRow>(col: Column<TRow, unknown> | undefined, field: string): number {
  if (col) {
    try {
      const px = col.getSize();
      if (px && px > 0) return Math.max(8, Math.min(60, Math.round(px / 7)));
    } catch {
      /* fall through */
    }
  }
  if (field === 'warranted_item') return 36;
  if (field === 'remarks' || field === 'r_works_description' || field === 'r_brief_description') return 30;
  if (field === 'r_acra_address') return 32;
  if (WARRANTY_DATE_FIELDS.has(field)) return 12;
  if (field === 'item_no' || field === 'warranty_period_years') return 8;
  return 16;
}

const REIMPORT_SKIP = new Set([
  '__select',
  '__open',
  '__expand',
  'cycle_progress',
  'current_stage',
  'current_status',
]);

export function exportWarrantyToExcel<TRow extends Record<string, any>>(
  opts: ExportWarrantyOptions<TRow>,
) {
  const { table, fieldConfig, globalFilter, meta, format = 'view' } = opts;

  const filteredRows = table.getSortedRowModel().rows.map((r) => r.original);
  const visibleCols = table.getVisibleLeafColumns().map((c) => c.id);

  let columnIds: string[];
  let labelMap: Record<string, string>;

  if (format === 'reimport') {
    const idCols = [...REIMPORT_ID_FIELDS];
    const editableCols = visibleCols.filter(
      (id) =>
        !REIMPORT_ID_FIELDS.includes(id as any) &&
        !REIMPORT_SKIP.has(id),
    );
    columnIds = [...idCols, ...editableCols];
    labelMap = {
      ...REIMPORT_ID_LABELS,
      ...Object.fromEntries(fieldConfig.map((f) => [f.field_name, f.display_name])),
    };
  } else {
    columnIds = visibleCols.filter(
      (id) => id !== '__select' && id !== '__open' && id !== '__expand' && id !== 'cycle_progress',
    );
    labelMap = Object.fromEntries(fieldConfig.map((f) => [f.field_name, f.display_name]));
  }

  const headerRow = columnIds.map((id) => labelMap[id] ?? id);

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const exportedTs = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const fileTs = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;

  const sourceLabel =
    format === 'reimport'
      ? `Warranty Deeds (direct) | Reimport Template ${WARRANTY_REIMPORT_MARKER}`
      : 'Warranty Deeds (direct)';
  const searchLabel = globalFilter?.trim() ? `"${globalFilter.trim()}"` : '(none)';
  const filterSummary = summarizeFilters(table, fieldConfig);
  const sortSummary = summarizeSort(table, fieldConfig);

  const colCount = Math.max(columnIds.length, 2);
  const lastColLetter = XLSX.utils.encode_col(colCount - 1);

  const aoa: any[][] = [
    ['SHAW Warranty Deeds — Raw Data Export'],
    [`Exported: ${exportedTs}  by  ${meta.userName}${meta.userType ? ` (${meta.userType})` : ''}`],
    [`Source: ${sourceLabel}`],
    [`Search: ${searchLabel}`],
    [`Filters: ${filterSummary}`],
    [`Sort: ${sortSummary}`],
    [],
    headerRow,
    ...filteredRows.map((row) =>
      columnIds.map((field) => {
        if (format === 'view' && field === 'current_status') {
          return computeWarrantyOverallStatus(row as any);
        }
        const cv = rawCellValue(field, (row as any)[field]);
        return cv.value;
      }),
    ),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Merge meta rows across full width
  const merges: XLSX.Range[] = [];
  for (let r = 0; r < 6; r++) merges.push({ s: { r, c: 0 }, e: { r, c: colCount - 1 } });
  ws['!merges'] = merges;

  // Column widths
  const colMap = new Map(table.getVisibleLeafColumns().map((c) => [c.id, c]));
  ws['!cols'] = columnIds.map((id) => ({ wch: colWidthFor(colMap.get(id), id) }));

  // Row heights
  const rowsInfo: XLSX.RowInfo[] = [];
  rowsInfo[0] = { hpt: 24 };
  for (let i = 1; i <= 5; i++) rowsInfo[i] = { hpt: 16 };
  rowsInfo[6] = { hpt: 6 };
  rowsInfo[7] = { hpt: 28 };
  for (let i = 0; i < filteredRows.length; i++) rowsInfo[8 + i] = { hpt: 20 };
  ws['!rows'] = rowsInfo;

  // Freeze panes (2 ID cols + 8 metadata rows)
  const xSplit = Math.min(2, columnIds.length);
  ws['!freeze'] = { xSplit, ySplit: 8 } as any;
  (ws as any)['!views'] = [
    {
      state: 'frozen',
      xSplit,
      ySplit: 8,
      topLeftCell: XLSX.utils.encode_cell({ r: 8, c: xSplit }),
      activePane: 'bottomRight',
    },
  ];

  // Apply styles
  setCell(ws, 0, 0, aoa[0][0], STYLE_TITLE);
  for (let r = 1; r <= 5; r++) {
    setCell(ws, r, 0, aoa[r][0], r === 1 ? STYLE_META_LABEL : STYLE_META_VALUE);
  }
  for (let c = 0; c < headerRow.length; c++) {
    setCell(ws, 7, c, headerRow[c], STYLE_HEADER);
  }
  for (let r = 0; r < filteredRows.length; r++) {
    const row = filteredRows[r];
    for (let c = 0; c < columnIds.length; c++) {
      const field = columnIds[c];
      let value: any;
      let kind: 'date' | 'text';
      if (format === 'view' && field === 'current_status') {
        value = computeWarrantyOverallStatus(row as any);
        kind = 'text';
      } else {
        const cv = rawCellValue(field, (row as any)[field]);
        value = cv.value;
        kind = cv.kind;
      }
      if (kind === 'date') {
        setDateCell(ws, 8 + r, c, value as number, STYLE_DATA, DATE_NUMFMT);
      } else {
        setCell(ws, 8 + r, c, value, STYLE_DATA);
      }
    }
  }

  const lastRow = 8 + filteredRows.length - 1;
  ws['!ref'] = `A1:${lastColLetter}${Math.max(lastRow + 1, 8)}`;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, format === 'reimport' ? 'Warranty (Re-import)' : 'Warranty');

  const fname = `SHAW_Warranty_${format}_${fileTs}.xlsx`;
  XLSX.writeFile(wb, fname);
}
