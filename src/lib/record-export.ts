/**
 * Record Export
 *
 * Builds a daily/cumulative matrix of Planned vs Actual records and exports
 * it to an .xlsx file. Used by Admin > Report > Record Export.
 *
 * Rows  = individual items (one Subtest or one Defect per row)
 * Cols  = identifier columns + per-date groups (Daily P/A/Var, Cum P/A/Var)
 *
 * Includes an optional S-Curve sheet (A4 landscape) plotting cumulative
 * Planned vs Actual totals across the selected period.
 */
import ExcelJS from 'exceljs';
import { supabase } from '@/integrations/supabase/client';
import { isoToExcelSerial, DATE_NUMFMT } from '@/lib/excel-date-cell';

export type RecordModule = 'tnc' | 'defect';
export type TncMilestone = 't1' | 't2';
export type OutputKind = 'planned' | 'actual';

export interface RecordExportOptions {
  module: RecordModule;
  projectId: string;
  subcontractors: string[];       // empty = all
  subsubs: string[];              // empty = all
  systemIds: string[];            // empty = all (T&C only)
  startDate: string;              // YYYY-MM-DD
  endDate: string;                // YYYY-MM-DD inclusive
  outputs: OutputKind[];          // ['planned'], ['actual'], or both
  tncMilestone: TncMilestone;     // T&C only; ignored for defect
  includeSubtotals: boolean;
  includeSCurve: boolean;
}

interface SourceItem {
  subcontractor: string;
  subsub: string;
  system: string;        // system_code (or '—')
  itemNo: string;        // item_no for T&C, issue_no for Defect
  mosCode: string;       // T&C only; '' for Defect
  description: string;
  plannedDate: string | null;
  actualDate: string | null;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function listDates(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const s = new Date(startISO + 'T00:00:00Z');
  const e = new Date(endISO + 'T00:00:00Z');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s > e) return out;
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function normDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(s));
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Data fetch
// ---------------------------------------------------------------------------

async function fetchAll<T>(builder: () => any): Promise<T[]> {
  const all: T[] = [];
  const pageSize = 1000;
  for (let from = 0; from < 200000; from += pageSize) {
    const { data, error } = await builder().range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}

export async function fetchDistinctSubcontractors(
  module: RecordModule,
  projectId: string,
): Promise<string[]> {
  const table = module === 'tnc' ? 'subtests' : 'defect_items';
  const rows = await fetchAll<{ subcontractor_name: string | null }>(() =>
    (supabase.from(table as any) as any)
      .select('subcontractor_name')
      .eq('project_id', projectId)
      .eq('is_active', true),
  );
  const set = new Set<string>();
  for (const r of rows) {
    const v = (r.subcontractor_name ?? '').trim();
    if (v) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export async function fetchDistinctSubsubs(
  module: RecordModule,
  projectId: string,
  subcontractors: string[],
): Promise<string[]> {
  if (subcontractors.length === 0) return [];
  const table = module === 'tnc' ? 'subtests' : 'defect_items';
  const rows = await fetchAll<{ subsub_name: string | null }>(() =>
    (supabase.from(table as any) as any)
      .select('subsub_name')
      .eq('project_id', projectId)
      .eq('is_active', true)
      .in('subcontractor_name', subcontractors),
  );
  const set = new Set<string>();
  for (const r of rows) {
    const v = (r.subsub_name ?? '').trim();
    if (v) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export async function fetchSystems(projectId: string): Promise<{ id: string; code: string }[]> {
  const rows = await fetchAll<{ id: string; system_code: string }>(() =>
    (supabase.from('system_master') as any)
      .select('id, system_code')
      .eq('project_id', projectId)
      .eq('is_active', true)
      .order('system_code', { ascending: true }),
  );
  return rows.map(r => ({ id: r.id, code: r.system_code }));
}

async function fetchTncItems(opts: RecordExportOptions): Promise<SourceItem[]> {
  let q: any = (supabase.from('subtests') as any)
    .select(
      'item_no, mos_code, description, subcontractor_name, subsub_name, system_id, t1_planned_date, t1_actual_date, t2_planned_date, t2_actual_date, system_master!inner(system_code)',
    )
    .eq('project_id', opts.projectId)
    .eq('is_active', true);
  if (opts.subcontractors.length) q = q.in('subcontractor_name', opts.subcontractors);
  if (opts.subsubs.length) q = q.in('subsub_name', opts.subsubs);
  if (opts.systemIds.length) q = q.in('system_id', opts.systemIds);

  const rows = await fetchAll<any>(() => q);
  const isT1 = opts.tncMilestone === 't1';
  return rows.map(r => ({
    subcontractor: (r.subcontractor_name ?? '').trim() || '—',
    subsub: (r.subsub_name ?? '').trim() || '—',
    system: r.system_master?.system_code ?? '—',
    itemNo: r.item_no ?? '',
    mosCode: r.mos_code ?? '',
    description: r.description ?? '',
    plannedDate: normDate(isT1 ? r.t1_planned_date : r.t2_planned_date),
    actualDate: normDate(isT1 ? r.t1_actual_date : r.t2_actual_date),
  }));
}

async function fetchDefectItems(opts: RecordExportOptions): Promise<SourceItem[]> {
  let q: any = (supabase.from('defect_items') as any)
    .select(
      'issue_no, description, subcontractor_name, subsub_name, planned_completion_date, actual_completion_date',
    )
    .eq('project_id', opts.projectId)
    .eq('is_active', true);
  if (opts.subcontractors.length) q = q.in('subcontractor_name', opts.subcontractors);
  if (opts.subsubs.length) q = q.in('subsub_name', opts.subsubs);

  const rows = await fetchAll<any>(() => q);
  return rows.map(r => ({
    subcontractor: (r.subcontractor_name ?? '').trim() || '—',
    subsub: (r.subsub_name ?? '').trim() || '—',
    system: '—',
    itemNo: r.issue_no ?? '',
    mosCode: '',
    description: r.description ?? '',
    plannedDate: normDate(r.planned_completion_date),
    actualDate: normDate(r.actual_completion_date),
  }));
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

interface BuiltRow {
  kind: 'item' | 'subtotal' | 'grand';
  label: string;          // identifier label for subtotals
  item?: SourceItem;
  // per-date numbers, keyed by date index
  daily: { planned: number; actual: number }[];
  cum: { planned: number; actual: number }[];
}

function buildRows(items: SourceItem[], dates: string[], includeSubtotals: boolean): BuiltRow[] {
  // Sort items
  const sorted = [...items].sort((a, b) =>
    a.subcontractor.localeCompare(b.subcontractor) ||
    a.subsub.localeCompare(b.subsub) ||
    a.system.localeCompare(b.system) ||
    a.itemNo.localeCompare(b.itemNo, undefined, { numeric: true }),
  );

  const dateIdx = new Map(dates.map((d, i) => [d, i]));
  const lastIdx = dates.length - 1;

  function rowFor(item: SourceItem): BuiltRow {
    const daily = dates.map(() => ({ planned: 0, actual: 0 }));
    const cum = dates.map(() => ({ planned: 0, actual: 0 }));
    if (item.plannedDate && dateIdx.has(item.plannedDate)) {
      daily[dateIdx.get(item.plannedDate)!].planned = 1;
    }
    if (item.actualDate && dateIdx.has(item.actualDate)) {
      daily[dateIdx.get(item.actualDate)!].actual = 1;
    }
    // cumulative: 1 from the first date >= the event date, onward
    const pIdx = item.plannedDate
      ? (dateIdx.has(item.plannedDate)
          ? dateIdx.get(item.plannedDate)!
          : item.plannedDate < dates[0] ? 0 : -1)
      : -1;
    const aIdx = item.actualDate
      ? (dateIdx.has(item.actualDate)
          ? dateIdx.get(item.actualDate)!
          : item.actualDate < dates[0] ? 0 : -1)
      : -1;
    for (let i = 0; i <= lastIdx; i++) {
      cum[i].planned = pIdx >= 0 && i >= pIdx ? 1 : 0;
      cum[i].actual = aIdx >= 0 && i >= aIdx ? 1 : 0;
    }
    return { kind: 'item', label: '', item, daily, cum };
  }

  function emptyAgg(): BuiltRow {
    return {
      kind: 'subtotal',
      label: '',
      daily: dates.map(() => ({ planned: 0, actual: 0 })),
      cum: dates.map(() => ({ planned: 0, actual: 0 })),
    };
  }

  function addInto(target: BuiltRow, src: BuiltRow) {
    for (let i = 0; i < dates.length; i++) {
      target.daily[i].planned += src.daily[i].planned;
      target.daily[i].actual += src.daily[i].actual;
      target.cum[i].planned += src.cum[i].planned;
      target.cum[i].actual += src.cum[i].actual;
    }
  }

  const out: BuiltRow[] = [];
  const grand = emptyAgg();
  grand.kind = 'grand';
  grand.label = 'Grand Total';

  let curSub: BuiltRow | null = null;
  let curSubKey = '';

  for (const item of sorted) {
    const row = rowFor(item);
    addInto(grand, row);

    if (includeSubtotals) {
      const subKey = item.subcontractor;
      if (curSubKey !== subKey) {
        if (curSub) out.push(curSub);
        curSub = emptyAgg();
        curSub.label = `Subtotal — ${subKey}`;
        curSubKey = subKey;
      }
      addInto(curSub!, row);
    }
    out.push(row);
  }
  if (includeSubtotals && curSub) out.push(curSub);
  out.push(grand);
  return out;
}

// ---------------------------------------------------------------------------
// Excel build
// ---------------------------------------------------------------------------

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' },
};
const TOTAL_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' },
};
const SUBTOTAL_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' },
};
const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
};
const NUMFMT_DASH = '#,##0;-#,##0;"-"';

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export async function exportRecordWorkbook(opts: RecordExportOptions): Promise<void> {
  const dates = listDates(opts.startDate, opts.endDate);
  if (dates.length === 0) throw new Error('Invalid date range');

  const items = opts.module === 'tnc' ? await fetchTncItems(opts) : await fetchDefectItems(opts);
  const rows = buildRows(items, dates, opts.includeSubtotals);

  const showPlanned = opts.outputs.includes('planned');
  const showActual = opts.outputs.includes('actual');
  const showVar = showPlanned && showActual;

  // Identifier columns
  const idCols: { key: string; header: string; width: number }[] = [
    { key: 'subcontractor', header: 'Subcontractor', width: 22 },
    { key: 'subsub', header: 'Sub-Sub', width: 18 },
  ];
  if (opts.module === 'tnc') {
    idCols.push({ key: 'system', header: 'System', width: 14 });
    idCols.push({ key: 'itemNo', header: 'Item No', width: 14 });
    idCols.push({ key: 'mosCode', header: 'MOS Code', width: 12 });
  } else {
    idCols.push({ key: 'itemNo', header: 'Issue No', width: 14 });
  }
  idCols.push({ key: 'description', header: 'Description', width: 40 });

  // Per-date sub-columns
  const subCols: { key: 'dp' | 'da' | 'dv' | 'cp' | 'ca' | 'cv'; label: string }[] = [];
  if (showPlanned) subCols.push({ key: 'dp', label: 'Daily P' });
  if (showActual) subCols.push({ key: 'da', label: 'Daily A' });
  if (showVar) subCols.push({ key: 'dv', label: 'Daily Var' });
  if (showPlanned) subCols.push({ key: 'cp', label: 'Cum P' });
  if (showActual) subCols.push({ key: 'ca', label: 'Cum A' });
  if (showVar) subCols.push({ key: 'cv', label: 'Cum Var' });

  if (subCols.length === 0) throw new Error('Select at least one output (Planned or Actual)');

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SHAW T&C Management System';
  wb.created = new Date();

  // ---------- Summary sheet ----------
  const sum = wb.addWorksheet('Summary');
  sum.columns = [{ width: 22 }, { width: 60 }];
  const summary: [string, string][] = [
    ['Generated', new Date().toLocaleString()],
    ['Module', opts.module === 'tnc' ? `T&C (${opts.tncMilestone.toUpperCase()})` : 'Defect'],
    ['Period', `${opts.startDate} ~ ${opts.endDate} (${dates.length} day${dates.length === 1 ? '' : 's'})`],
    ['Subcontractor', opts.subcontractors.length ? opts.subcontractors.join(', ') : 'All'],
    ['Sub-Sub', opts.subsubs.length ? opts.subsubs.join(', ') : 'All'],
    ['System', opts.module === 'tnc' ? (opts.systemIds.length ? `${opts.systemIds.length} selected` : 'All') : 'n/a'],
    ['Outputs', opts.outputs.join(', ') + (showVar ? ' (+Variance)' : '')],
    ['Subtotals', opts.includeSubtotals ? 'Included' : 'Excluded'],
    ['S-Curve sheet', opts.includeSCurve ? 'Included' : 'Excluded'],
    ['Total items', String(items.length)],
  ];
  for (const [k, v] of summary) {
    const r = sum.addRow([k, v]);
    r.getCell(1).font = { bold: true };
    r.getCell(1).fill = HEADER_FILL;
  }

  // ---------- Daily & Cumulative sheet ----------
  const ws = wb.addWorksheet('Daily & Cumulative', {
    views: [{ state: 'frozen', xSplit: idCols.length, ySplit: 2 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
  });

  const subPerDate = subCols.length;
  const totalCols = idCols.length + dates.length * subPerDate;

  // Header row 1: identifier headers (merged vertically) + date headers (merged across subCols)
  const h1 = ws.addRow([]);
  const h2 = ws.addRow([]);
  for (let i = 0; i < idCols.length; i++) {
    const cell = h1.getCell(i + 1);
    cell.value = idCols[i].header;
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = HEADER_FILL;
    cell.border = BORDER_THIN;
    ws.mergeCells(1, i + 1, 2, i + 1);
  }
  for (let di = 0; di < dates.length; di++) {
    const startCol = idCols.length + di * subPerDate + 1;
    const endCol = startCol + subPerDate - 1;
    const cell = h1.getCell(startCol);
    const serial = isoToExcelSerial(dates[di]);
    cell.value = serial !== null ? serial : dates[di];
    cell.numFmt = DATE_NUMFMT;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = BORDER_THIN;
    if (endCol > startCol) ws.mergeCells(1, startCol, 1, endCol);
    for (let si = 0; si < subPerDate; si++) {
      const c = h2.getCell(startCol + si);
      c.value = subCols[si].label;
      c.font = { bold: true };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.fill = HEADER_FILL;
      c.border = BORDER_THIN;
    }
  }
  h1.height = 22;
  h2.height = 18;

  // Set column widths
  for (let i = 0; i < idCols.length; i++) {
    ws.getColumn(i + 1).width = idCols[i].width;
  }
  for (let i = idCols.length + 1; i <= totalCols; i++) {
    ws.getColumn(i).width = 7;
  }

  // Data rows
  for (const r of rows) {
    const row = ws.addRow([]);
    const isTotal = r.kind === 'grand';
    const isSubtotal = r.kind === 'subtotal';

    if (r.kind === 'item' && r.item) {
      const it = r.item;
      const idVals: Record<string, string> = {
        subcontractor: it.subcontractor,
        subsub: it.subsub,
        system: it.system,
        itemNo: it.itemNo,
        mosCode: it.mosCode,
        description: it.description,
      };
      for (let i = 0; i < idCols.length; i++) {
        row.getCell(i + 1).value = idVals[idCols[i].key] ?? '';
      }
    } else {
      // subtotal / grand total: label spans the identifier columns
      row.getCell(1).value = r.label;
      if (idCols.length > 1) ws.mergeCells(row.number, 1, row.number, idCols.length);
      row.getCell(1).font = { bold: true };
      row.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
    }

    for (let di = 0; di < dates.length; di++) {
      const startCol = idCols.length + di * subPerDate + 1;
      const d = r.daily[di];
      const c = r.cum[di];
      const vals: Record<string, number> = {
        dp: d.planned, da: d.actual, dv: d.actual - d.planned,
        cp: c.planned, ca: c.actual, cv: c.actual - c.planned,
      };
      for (let si = 0; si < subPerDate; si++) {
        const cell = row.getCell(startCol + si);
        cell.value = vals[subCols[si].key];
        cell.numFmt = NUMFMT_DASH;
        cell.alignment = { horizontal: 'center' };
      }
    }

    if (isTotal || isSubtotal) {
      const fill = isTotal ? TOTAL_FILL : SUBTOTAL_FILL;
      for (let i = 1; i <= totalCols; i++) {
        const c = row.getCell(i);
        c.fill = fill;
        c.font = { bold: true };
      }
    }
  }

  // ---------- S-Curve sheet ----------
  if (opts.includeSCurve) {
    const sc = wb.addWorksheet('S-Curve', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
    });
    sc.columns = [{ width: 14 }, { width: 14 }, { width: 14 }];
    const head = sc.addRow(['Date', 'Cum Planned', 'Cum Actual']);
    head.eachCell(c => { c.font = { bold: true }; c.fill = HEADER_FILL; c.border = BORDER_THIN; });

    // Use grand-total row's cum values
    const grand = rows.find(r => r.kind === 'grand')!;
    for (let i = 0; i < dates.length; i++) {
      const r = sc.addRow([]);
      const dc = r.getCell(1);
      const serial = isoToExcelSerial(dates[i]);
      dc.value = serial !== null ? serial : dates[i];
      dc.numFmt = DATE_NUMFMT;
      r.getCell(2).value = grand.cum[i].planned;
      r.getCell(3).value = grand.cum[i].actual;
      r.getCell(2).numFmt = NUMFMT_DASH;
      r.getCell(3).numFmt = NUMFMT_DASH;
    }

    // Native ExcelJS line chart
    try {
      const lastRow = dates.length + 1;
      // @ts-ignore — exceljs chart API
      sc.addChart?.({
        type: 'line',
        title: { name: `Cumulative Planned vs Actual (${opts.startDate} ~ ${opts.endDate})` },
        position: { type: 'twoCell', from: { col: 4, row: 0 }, to: { col: 18, row: 28 } },
        series: [
          { name: 'Planned', categories: `S-Curve!$A$2:$A$${lastRow}`, values: `S-Curve!$B$2:$B$${lastRow}` },
          { name: 'Actual', categories: `S-Curve!$A$2:$A$${lastRow}`, values: `S-Curve!$C$2:$C$${lastRow}` },
        ],
      });
    } catch {
      // ExcelJS chart support varies; data table still usable.
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `RecordExport_${opts.module}_${opts.startDate}_${opts.endDate}_${timestamp()}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
