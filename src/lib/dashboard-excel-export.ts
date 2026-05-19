import XLSX from 'xlsx-js-style';
import type { PlanActualRow, PlanActualMetrics } from './dashboard-utils';
import { formatDdMmm } from './format';

// ---------------------------------------------------------------------------
// Style constants
// ---------------------------------------------------------------------------

const FONT = 'Calibri';

const BORDER_THIN = { style: 'thin', color: { rgb: 'FFE5E7EB' } } as const;
const BORDER_DARK = { style: 'thin', color: { rgb: 'FF1F2937' } } as const;
const BORDER_GROUP = { style: 'medium', color: { rgb: 'FF94A3B8' } } as const;

const BORDERS_ALL = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN } as const;
const BORDERS_HEADER = { top: BORDER_DARK, bottom: BORDER_DARK, left: BORDER_DARK, right: BORDER_DARK } as const;

const S_TITLE = {
  font: { name: FONT, sz: 14, bold: true, color: { rgb: 'FFFFFFFF' } },
  fill: { fgColor: { rgb: 'FF1E3A5F' } },
  alignment: { vertical: 'center', horizontal: 'left' },
} as const;

const S_META = {
  font: { name: FONT, sz: 10, color: { rgb: 'FF6B7280' } },
  fill: { fgColor: { rgb: 'FFF3F4F6' } },
  alignment: { vertical: 'center', horizontal: 'left' },
} as const;

const S_GROUP_HDR = {
  font: { name: FONT, sz: 11, bold: true, color: { rgb: 'FFFFFFFF' } },
  fill: { fgColor: { rgb: 'FF334155' } },
  alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
  border: BORDERS_HEADER,
} as const;

const S_SUB_HDR = {
  font: { name: FONT, sz: 10, bold: true, color: { rgb: 'FFFFFFFF' } },
  fill: { fgColor: { rgb: 'FF475569' } },
  alignment: { vertical: 'center', horizontal: 'center' },
  border: BORDERS_HEADER,
} as const;

const S_GROUP_NAME = {
  font: { name: FONT, sz: 10, bold: true, color: { rgb: 'FF111827' } },
  fill: { fgColor: { rgb: 'FFF8FAFC' } },
  alignment: { vertical: 'top', horizontal: 'left' },
  border: BORDERS_ALL,
} as const;

const S_TOTAL = {
  font: { name: FONT, sz: 10, bold: true, color: { rgb: 'FF111827' } },
  fill: { fgColor: { rgb: 'FFF8FAFC' } },
  alignment: { vertical: 'center', horizontal: 'right' },
  border: BORDERS_ALL,
} as const;

const summaryStyle = (v: number, tone?: 'done' | 'remain') => ({
  font: {
    name: FONT,
    sz: 10,
    bold: true,
    color: { rgb: v === 0 ? 'FFD1D5DB' : tone === 'done' ? 'FF047857' : tone === 'remain' ? 'FFB45309' : 'FF111827' },
  },
  fill: { fgColor: { rgb: 'FFF8FAFC' } },
  alignment: { vertical: 'center', horizontal: 'right' },
  border: BORDERS_ALL,
});

const S_NUM = {
  font: { name: FONT, sz: 10, color: { rgb: 'FF111827' } },
  alignment: { vertical: 'center', horizontal: 'right' },
  border: BORDERS_ALL,
} as const;

const stageColor = (stage: string) => {
  if (stage === 'Pred') return 'FF6B7280'; // gray
  if (stage === 'T1') return 'FF2563EB';   // blue
  return 'FF16A34A';                        // green
};

const S_STAGE = (stage: string) => ({
  font: { name: FONT, sz: 10, bold: true, color: { rgb: stageColor(stage) } },
  alignment: { vertical: 'center', horizontal: 'center' },
  border: BORDERS_ALL,
});

const deltaStyle = (v: number) => {
  const color = v < 0 ? 'FFDC2626' : v > 0 ? 'FF16A34A' : 'FF9CA3AF';
  return {
    font: { name: FONT, sz: 10, bold: v !== 0, color: { rgb: color } },
    alignment: { vertical: 'center', horizontal: 'right' },
    border: BORDERS_ALL,
  };
};

const S_PCT = {
  font: { name: FONT, sz: 10, color: { rgb: 'FF374151' } },
  alignment: { vertical: 'center', horizontal: 'center' },
  border: BORDERS_ALL,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function set(ws: XLSX.WorkSheet, r: number, c: number, v: unknown, s: Record<string, unknown>) {
  ws[XLSX.utils.encode_cell({ r, c })] = { t: 's', v: v == null ? '' : String(v), s };
}

function setNum(ws: XLSX.WorkSheet, r: number, c: number, v: number, s: Record<string, unknown>) {
  ws[XLSX.utils.encode_cell({ r, c })] = { t: 'n', v, s };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function exportPlanActualToExcel(
  rows: PlanActualRow[],
  groupHeader: string,
  today: string,
  dataDate: string,
  planMode: 'baseline' | 'remaining' = 'baseline',
): { rowCount: number; fileName: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const fileTs = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;

  const dataDateLabel = formatDdMmm(dataDate);
  const todayLabel = formatDdMmm(today);
  const planModeLabel = planMode === 'remaining' ? 'Remaining' : 'Baseline';
  const COL_COUNT = 17; // group, stage, total/done/remain, cum(3), data date(4), today(4), progress%
  const ws: XLSX.WorkSheet = {};

  // ── Row 0: Title ──
  set(ws, 0, 0, `SHAW T&C — Plan vs Actual (${groupHeader}) [Plan: ${planModeLabel}]`, S_TITLE);
  for (let c = 1; c < COL_COUNT; c++) set(ws, 0, c, '', S_TITLE);

  // ── Row 1: Meta ──
  set(ws, 1, 0, `Exported: ${ts}  ·  Today: ${today}  ·  Data Date: ${dataDate}  ·  Plan Mode: ${planModeLabel}`, S_META);
  for (let c = 1; c < COL_COUNT; c++) set(ws, 1, c, '', S_META);

  // ── Row 2: spacer ──

  // ── Row 3: Group header (merged) ──
  const HR = 3;
  const hdrLabels = [groupHeader, 'Stage', 'Total', 'Done', 'Remain',
    'To Data Date (Cumulative)', '', '', `Data Date (${dataDateLabel})`, '', '', '', `Today (${todayLabel})`, '', '', '', 'Progress'];
  hdrLabels.forEach((l, c) => set(ws, HR, c, l, S_GROUP_HDR));

  // ── Row 4: Sub header ──
  const SHR = 4;
  const subLabels = ['', '', '', '', '', 'Plan', 'Actual', 'Δ', 'Plan', 'Actual', 'Δ', 'Delay', 'Plan', 'Actual', 'Δ', 'Delay', '%'];
  subLabels.forEach((l, c) => set(ws, SHR, c, l, S_SUB_HDR));

  // Merges for header rows
  const merges: XLSX.Range[] = [
    // Title row
    { s: { r: 0, c: 0 }, e: { r: 0, c: COL_COUNT - 1 } },
    // Meta row
    { s: { r: 1, c: 0 }, e: { r: 1, c: COL_COUNT - 1 } },
    // Group header merges
    { s: { r: HR, c: 0 }, e: { r: SHR, c: 0 } },   // group name header
    { s: { r: HR, c: 1 }, e: { r: SHR, c: 1 } },   // stage header
    { s: { r: HR, c: 2 }, e: { r: SHR, c: 2 } },   // total header
    { s: { r: HR, c: 3 }, e: { r: SHR, c: 3 } },   // done header
    { s: { r: HR, c: 4 }, e: { r: SHR, c: 4 } },   // remain header
    { s: { r: HR, c: 5 }, e: { r: HR, c: 7 } },     // To Data Date
    { s: { r: HR, c: 8 }, e: { r: HR, c: 11 } },    // Data Date
    { s: { r: HR, c: 12 }, e: { r: HR, c: 15 } },   // Today
    { s: { r: HR, c: 16 }, e: { r: SHR, c: 16 } },  // Progress
  ];

  // ── Data rows ──
  let dataRow = 5;
  const stages: Array<{ key: keyof Pick<PlanActualRow, 'predecessor' | 't1' | 't2' | 'r1' | 'r2'>; label: string }> = [
    { key: 'predecessor', label: 'Pred' },
    { key: 't1', label: 'T1' },
    { key: 't2', label: 'T2' },
    { key: 'r1', label: 'R1' },
    { key: 'r2', label: 'R2' },
  ];

  for (const r of rows) {
    const startRow = dataRow;
    stages.forEach((st, i) => {
      const m: PlanActualMetrics = r[st.key];
      const cumD = m.cumActual - m.cumPlan;
      const dataDateD = m.dataDateActual - m.dataDatePlan;
      const tD = m.todayActual - m.todayPlan;
      const pct = r.totalSubtests ? Math.round((m.cumActual / r.totalSubtests) * 100) : 0;

      const cr = dataRow;

      // Group name (only first stage row)
      if (i === 0) {
        set(ws, cr, 0, r.label, S_GROUP_NAME);
      }

      // Stage summary
      const remaining = r.totalSubtests - m.cumActual;
      set(ws, cr, 1, st.label, S_STAGE(st.label));
      setNum(ws, cr, 2, r.totalSubtests, summaryStyle(r.totalSubtests));
      setNum(ws, cr, 3, m.cumActual, summaryStyle(m.cumActual, 'done'));
      setNum(ws, cr, 4, remaining, summaryStyle(remaining, 'remain'));

      // Cumulative
      setNum(ws, cr, 5, m.cumPlan, S_NUM);
      setNum(ws, cr, 6, m.cumActual, S_NUM);
      setNum(ws, cr, 7, cumD, deltaStyle(cumD));

      // Data Date
      setNum(ws, cr, 8, m.dataDatePlan, S_NUM);
      setNum(ws, cr, 9, m.dataDateActual, S_NUM);
      setNum(ws, cr, 10, dataDateD, deltaStyle(dataDateD));
      setNum(ws, cr, 11, m.dataDateDelay, S_NUM);

      // Today
      setNum(ws, cr, 12, m.todayPlan, S_NUM);
      setNum(ws, cr, 13, m.todayActual, S_NUM);
      setNum(ws, cr, 14, tD, deltaStyle(tD));
      setNum(ws, cr, 15, m.todayDelay, S_NUM);

      // Progress
      set(ws, cr, 16, `${pct}%`, S_PCT);

      dataRow++;
    });

    // Merge group name cells across all stage rows
    merges.push(
      { s: { r: startRow, c: 0 }, e: { r: startRow + stages.length - 1, c: 0 } },
    );
  }

  ws['!merges'] = merges;

  // Column widths
  ws['!cols'] = [
    { wch: 22 }, // group
    { wch: 9 },  // stage
    { wch: 8 }, { wch: 8 }, { wch: 8 }, // total / done / remain
    { wch: 8 }, { wch: 8 }, { wch: 7 },  // cum
    { wch: 8 }, { wch: 8 }, { wch: 7 }, { wch: 8 }, // data date
    { wch: 8 }, { wch: 8 }, { wch: 7 }, { wch: 8 }, // today
    { wch: 10 }, // progress
  ];

  // Row heights
  const rowInfo: XLSX.RowInfo[] = [];
  rowInfo[0] = { hpt: 26 }; // title
  rowInfo[1] = { hpt: 16 }; // meta
  rowInfo[2] = { hpt: 6 };  // spacer
  rowInfo[HR] = { hpt: 28 };  // group header
  rowInfo[SHR] = { hpt: 22 }; // sub header
  for (let i = 5; i < dataRow; i++) rowInfo[i] = { hpt: 20 };
  ws['!rows'] = rowInfo;

  // Freeze panes
  (ws as any)['!views'] = [{
    state: 'frozen',
    xSplit: 5,
    ySplit: 5,
    topLeftCell: XLSX.utils.encode_cell({ r: 5, c: 5 }),
    activePane: 'bottomRight',
  }];

  // Sheet ref
  const lastCol = XLSX.utils.encode_col(COL_COUNT - 1);
  ws['!ref'] = `A1:${lastCol}${dataRow}`;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Plan vs Actual');

  const fileName = `SHAW_PlanVsActual_${groupHeader.replace(/[\s/]/g, '_')}_${fileTs}.xlsx`;
  XLSX.writeFile(wb, fileName);

  return { rowCount: rows.length, fileName };
}
