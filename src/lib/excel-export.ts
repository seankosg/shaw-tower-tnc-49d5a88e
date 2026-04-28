import XLSX from 'xlsx-js-style';
import type { Table, Column, Row } from '@tanstack/react-table';
import { formatDdMmm, formatDdMmmYyyy } from './format';
import { DATA_SOURCE_LABELS, type DataSource, type TcStatus } from '@/types/enums';
import type { FieldConfigRow } from '@/hooks/useFieldConfig';
import { isMetaField } from '@/lib/meta-fields';

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
// Main export function
// ---------------------------------------------------------------------------

export function exportSubtestsToExcel<TRow>(opts: ExportSubtestsOptions<TRow>): {
  rowCount: number;
  fileName: string;
} {
  const { table, fieldConfig, globalFilter, searchParams, meta } = opts;

  const visibleCols = table.getVisibleLeafColumns().filter((c) => !isMetaField(c.id));
  const sortedRows = table.getSortedRowModel().rows;

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const exportedTs = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const fileTs = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;

  const sourceLabel = inferSourceLabel(searchParams);
  const filterSummary = summarizeFilters(table, fieldConfig);
  const sortSummary = summarizeSort(table, fieldConfig);
  const searchLabel = globalFilter?.trim() ? `"${globalFilter.trim()}"` : '(none)';

  const colCount = Math.max(visibleCols.length, 2);
  const lastColLetter = XLSX.utils.encode_col(colCount - 1);

  // Build headers
  const headerRow = visibleCols.map((c) => getColumnDisplayName(c, fieldConfig));

  // Build data rows
  const dataRows = sortedRows.map((r) => visibleCols.map((c) => formatCellValue(r, c)));

  // Compose AOA
  // Rows (1-indexed in spec):
  // 1: Title
  // 2: Exported / by
  // 3: Source
  // 4: Search
  // 5: Filters
  // 6: Sort
  // 7: (blank)
  // 8: Headers
  // 9+: Data
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

  // Merges for meta block (each meta row spans all columns)
  const merges: XLSX.Range[] = [];
  for (let r = 0; r < 6; r++) {
    merges.push({ s: { r, c: 0 }, e: { r, c: colCount - 1 } });
  }
  ws['!merges'] = merges;

  // Column widths from react-table sizes
  const cols: XLSX.ColInfo[] = visibleCols.map((c) => {
    const px = c.getSize();
    const wch = Math.max(8, Math.min(60, Math.round(px / 7)));
    return { wch };
  });
  ws['!cols'] = cols;

  // Row heights
  const rows: XLSX.RowInfo[] = [];
  rows[0] = { hpt: 24 };       // title
  for (let i = 1; i <= 5; i++) rows[i] = { hpt: 16 }; // meta lines
  rows[6] = { hpt: 6 };        // spacer
  rows[7] = { hpt: 28 };       // header
  for (let i = 0; i < dataRows.length; i++) {
    rows[8 + i] = { hpt: 20 };
  }
  ws['!rows'] = rows;

  // Freeze panes: header row (row index 8 in 1-based -> ySplit 8) + first 3 visible columns
  const xSplit = Math.min(3, visibleCols.length);
  ws['!freeze'] = { xSplit, ySplit: 8 };
  // Also set the standard SheetJS view for freeze panes
  (ws as any)['!views'] = [
    {
      state: 'frozen',
      xSplit,
      ySplit: 8,
      topLeftCell: XLSX.utils.encode_cell({ r: 8, c: xSplit }),
      activePane: 'bottomRight',
    },
  ];

  // Apply styles cell-by-cell
  // Title (row 0)
  setCell(ws, 0, 0, aoa[0][0], STYLE_TITLE);
  // Meta rows (1..5) — single styled cell, others blank
  for (let r = 1; r <= 5; r++) {
    setCell(ws, r, 0, aoa[r][0], r === 1 ? STYLE_META_LABEL : STYLE_META_VALUE);
  }
  // Header row (index 7)
  for (let c = 0; c < headerRow.length; c++) {
    setCell(ws, 7, c, headerRow[c], STYLE_HEADER);
  }
  // Data rows
  for (let r = 0; r < dataRows.length; r++) {
    for (let c = 0; c < dataRows[r].length; c++) {
      setCell(ws, 8 + r, c, dataRows[r][c], STYLE_DATA);
    }
  }

  // Update sheet ref to include any new cells
  const lastRow = 8 + dataRows.length - 1;
  ws['!ref'] = `A1:${lastColLetter}${Math.max(lastRow + 1, 8)}`;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Subtests');

  const fileName = `SHAW_Subtests_${fileTs}.xlsx`;
  XLSX.writeFile(wb, fileName);

  return { rowCount: dataRows.length, fileName };
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
