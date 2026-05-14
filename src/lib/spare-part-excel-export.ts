/**
 * Spare Part Raw Data Excel export — mirrors Defect export UX (single file
 * or per-subcontractor split with auto-ZIP threshold) but uses a simpler
 * view-friendly format.
 */
import XLSX from 'xlsx-js-style';
import type { Table, Row } from '@tanstack/react-table';
import JSZip from 'jszip';
import { formatDdMmm } from './format';
import type { DocsFieldConfigRow } from '@/hooks/useDocsFieldConfig';

export interface SparePartExportOptions<TRow> {
  table: Table<TRow>;
  fieldConfig: DocsFieldConfigRow[];
  globalFilter: string;
  meta: { userName: string; userType: string };
}

const DATE_FIELDS = new Set<string>([]);

function visibleColumnIds<TRow>(table: Table<TRow>): string[] {
  return table.getVisibleLeafColumns()
    .map((c) => c.id)
    .filter((id) => id && id !== '__select');
}

function labelFor(field: string, fieldConfig: DocsFieldConfigRow[]): string {
  const cfg = fieldConfig.find((f) => f.field_name === field);
  return cfg?.display_name || field;
}

function rowsToAOA<TRow>(
  rows: Row<TRow>[],
  columnIds: string[],
  headers: string[],
): (string | number | null)[][] {
  const headerRow: (string | number | null)[] = [...headers];
  const body = rows.map((r) => columnIds.map((id) => {
    const raw = (r.original as any)[id];
    if (raw == null || raw === '') return null;
    if (DATE_FIELDS.has(id)) return formatDdMmm(String(raw).slice(0, 10));
    if (typeof raw === 'object') return JSON.stringify(raw);
    return String(raw);
  }));
  return [headerRow, ...body];
}

function buildSheet<TRow>(
  rows: Row<TRow>[],
  table: Table<TRow>,
  fieldConfig: DocsFieldConfigRow[],
  meta: { userName: string; userType: string },
  globalFilter: string,
  title: string,
) {
  const columnIds = visibleColumnIds(table);
  const headers = columnIds.map((id) => labelFor(id, fieldConfig));

  const summary: (string | number)[][] = [
    [title],
    [`Exported by: ${meta.userName} (${meta.userType})`],
    [`Exported at: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`],
    [`Rows: ${rows.length}`],
  ];
  if (globalFilter) summary.push([`Search: ${globalFilter}`]);
  summary.push([]);

  const aoa = [...summary, ...rowsToAOA(rows, columnIds, headers)];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Bold header row
  const headerRowIdx = summary.length;
  for (let c = 0; c < headers.length; c++) {
    const ref = XLSX.utils.encode_cell({ r: headerRowIdx, c });
    if (!ws[ref]) continue;
    ws[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: 'F1F5F9' } } };
  }
  // Auto column widths
  ws['!cols'] = headers.map((h, i) => {
    const maxLen = Math.max(
      h.length,
      ...rows.slice(0, 200).map((r) => String((r.original as any)[columnIds[i]] ?? '').length),
    );
    return { wch: Math.min(Math.max(maxLen + 2, 8), 40) };
  });
  return ws;
}

function safeName(input: string): string {
  return String(input ?? '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Unassigned';
}

export function exportSparePartRawToExcel<TRow>(opts: SparePartExportOptions<TRow>): {
  rowCount: number; fileName: string;
} {
  const rows = opts.table.getSortedRowModel().rows;
  const ws = buildSheet(rows, opts.table, opts.fieldConfig, opts.meta, opts.globalFilter, 'Spare Part Raw Data');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Spare Parts');
  const fileName = `spare-parts-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return { rowCount: rows.length, fileName };
}

function groupBySubcontractor<TRow>(rows: Row<TRow>[]): Map<string, Row<TRow>[]> {
  const map = new Map<string, Row<TRow>[]>();
  for (const r of rows) {
    const key = safeName((r.original as any)?.subcontractor_name ?? 'Unassigned');
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return map;
}

export function exportSparePartRawToExcelBySubcontractor<TRow>(opts: SparePartExportOptions<TRow>): {
  rowCount: number; fileCount: number;
} {
  const rows = opts.table.getSortedRowModel().rows;
  const grouped = groupBySubcontractor(rows);
  const date = new Date().toISOString().slice(0, 10);
  for (const [subcon, subset] of grouped.entries()) {
    const ws = buildSheet(subset, opts.table, opts.fieldConfig, opts.meta, opts.globalFilter, `Spare Part Raw Data — ${subcon}`);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Spare Parts');
    XLSX.writeFile(wb, `spare-parts-${safeName(subcon)}-${date}.xlsx`);
  }
  return { rowCount: rows.length, fileCount: grouped.size };
}

export async function exportSparePartRawToZipBySubcontractor<TRow>(opts: SparePartExportOptions<TRow>): Promise<{
  rowCount: number; fileCount: number; zipFileName: string;
}> {
  const rows = opts.table.getSortedRowModel().rows;
  const grouped = groupBySubcontractor(rows);
  const date = new Date().toISOString().slice(0, 10);
  const zip = new JSZip();
  for (const [subcon, subset] of grouped.entries()) {
    const ws = buildSheet(subset, opts.table, opts.fieldConfig, opts.meta, opts.globalFilter, `Spare Part Raw Data — ${subcon}`);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Spare Parts');
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    zip.file(`spare-parts-${safeName(subcon)}-${date}.xlsx`, buffer);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const zipFileName = `spare-parts-by-subcontractor-${date}.zip`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { rowCount: rows.length, fileCount: grouped.size, zipFileName };
}
