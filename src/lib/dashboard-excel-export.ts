import XLSX from 'xlsx-js-style';
import type { PlanActualRow, PlanActualMetrics } from './dashboard-utils';

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
  alignment: { vertical: 'top', horizontal: 'center' },
  border: BORDERS_ALL,
} as const;

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
  yesterday: string,
): { rowCount: number; fileName: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const fileTs = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;

  const COL_COUNT = 14; // group, total, stage, 3×(plan,act,Δ), progress%
  const ws: XLSX.WorkSheet = {};

  // ── Row 0: Title ──
  set(ws, 0, 0, `SHAW T&C — Plan vs Actual (${groupHeader})`, S_TITLE);
  for (let c = 1; c < COL_COUNT; c++) set(ws, 0, c, '', S_TITLE);

  // ── Row 1: Meta ──
  set(ws, 1, 0, `Exported: ${ts}  ·  Base date: ${today}  ·  Yesterday: ${yesterday}`, S_META);
  for (let c = 1; c < COL_COUNT; c++) set(ws, 1, c, '', S_META);

  // ── Row 2: spacer ──

  // ── Row 3: Group header (merged) ──
  const HR = 3;
  const hdrLabels = [groupHeader, 'Total\nSubtests', 'Stage',
    'To-Yesterday (Cumulative)', '', '', 'Yesterday', '', '', 'Today', '', '', 'Progress'];
  hdrLabels.forEach((l, c) => set(ws, HR, c, l, S_GROUP_HDR));

  // ── Row 4: Sub header ──
  const SHR = 4;
  const subLabels = ['', '', '', 'Plan', 'Actual', 'Δ', 'Plan', 'Actual', 'Δ', 'Plan', 'Actual', 'Δ', '%'];
  subLabels.forEach((l, c) => set(ws, SHR, c, l, S_SUB_HDR));

  // Merges for header rows
  const merges: XLSX.Range[] = [
    // Title row
    { s: { r: 0, c: 0 }, e: { r: 0, c: COL_COUNT - 1 } },
    // Meta row
    { s: { r: 1, c: 0 }, e: { r: 1, c: COL_COUNT - 1 } },
    // Group header merges
    { s: { r: HR, c: 0 }, e: { r: SHR, c: 0 } },   // group name header
    { s: { r: HR, c: 1 }, e: { r: SHR, c: 1 } },   // total header
    { s: { r: HR, c: 2 }, e: { r: SHR, c: 2 } },   // stage header
    { s: { r: HR, c: 3 }, e: { r: HR, c: 5 } },     // To-Yesterday
    { s: { r: HR, c: 6 }, e: { r: HR, c: 8 } },     // Yesterday
    { s: { r: HR, c: 9 }, e: { r: HR, c: 11 } },    // Today
    { s: { r: HR, c: 12 }, e: { r: SHR, c: 12 } },  // Progress
  ];

  // ── Data rows ──
  let dataRow = 5;
  const stages: Array<{ key: keyof Pick<PlanActualRow, 'predecessor' | 't1' | 't2'>; label: string }> = [
    { key: 'predecessor', label: 'Pred' },
    { key: 't1', label: 'T1' },
    { key: 't2', label: 'T2' },
  ];

  for (const r of rows) {
    const startRow = dataRow;
    stages.forEach((st, i) => {
      const m: PlanActualMetrics = r[st.key];
      const cumD = m.cumActual - m.cumPlan;
      const yD = m.yesterdayActual - m.yesterdayPlan;
      const tD = m.todayActual - m.todayPlan;
      const pct = r.totalSubtests ? Math.round((m.cumActual / r.totalSubtests) * 100) : 0;

      const cr = dataRow;

      // Group name & total (only first stage row)
      if (i === 0) {
        set(ws, cr, 0, r.label, S_GROUP_NAME);
        setNum(ws, cr, 1, r.totalSubtests, S_TOTAL);
      }

      // Stage with counts
      const remaining = r.totalSubtests - m.cumActual;
      set(ws, cr, 2, `${st.label}  ${m.cumActual}/${r.totalSubtests} (${remaining})`, S_STAGE(st.label));

      // Cumulative
      setNum(ws, cr, 3, m.cumPlan, S_NUM);
      setNum(ws, cr, 4, m.cumActual, S_NUM);
      setNum(ws, cr, 5, cumD, deltaStyle(cumD));

      // Yesterday
      setNum(ws, cr, 6, m.yesterdayPlan, S_NUM);
      setNum(ws, cr, 7, m.yesterdayActual, S_NUM);
      setNum(ws, cr, 8, yD, deltaStyle(yD));

      // Today
      setNum(ws, cr, 9, m.todayPlan, S_NUM);
      setNum(ws, cr, 10, m.todayActual, S_NUM);
      setNum(ws, cr, 11, tD, deltaStyle(tD));

      // Progress
      set(ws, cr, 12, `${pct}%`, S_PCT);

      dataRow++;
    });

    // Merge group name & total cells across 3 stage rows
    merges.push(
      { s: { r: startRow, c: 0 }, e: { r: startRow + 2, c: 0 } },
      { s: { r: startRow, c: 1 }, e: { r: startRow + 2, c: 1 } },
    );
  }

  ws['!merges'] = merges;

  // Column widths
  ws['!cols'] = [
    { wch: 22 }, // group
    { wch: 8 },  // total
    { wch: 20 }, // stage + counts
    { wch: 8 }, { wch: 8 }, { wch: 7 },  // cum
    { wch: 8 }, { wch: 8 }, { wch: 7 },  // yesterday
    { wch: 8 }, { wch: 8 }, { wch: 7 },  // today
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
    xSplit: 3,
    ySplit: 5,
    topLeftCell: XLSX.utils.encode_cell({ r: 5, c: 3 }),
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
