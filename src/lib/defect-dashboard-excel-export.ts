import XLSX from 'xlsx-js-style';
import { diffMetrics, type DefectPlanActualMetrics, type DefectPlanActualRow } from './defect-dashboard-utils';
import { formatDdMmm } from './format';

const FONT = 'Calibri';
const BORDER_THIN = { style: 'thin', color: { rgb: 'FFE5E7EB' } } as const;
const BORDER_DARK = { style: 'thin', color: { rgb: 'FF1F2937' } } as const;
const BORDERS_ALL = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN } as const;
const BORDERS_HEADER = { top: BORDER_DARK, bottom: BORDER_DARK, left: BORDER_DARK, right: BORDER_DARK } as const;
const S_TITLE = { font: { name: FONT, sz: 14, bold: true, color: { rgb: 'FFFFFFFF' } }, fill: { fgColor: { rgb: 'FF1E3A5F' } }, alignment: { vertical: 'center', horizontal: 'left' } } as const;
const S_META = { font: { name: FONT, sz: 10, color: { rgb: 'FF6B7280' } }, fill: { fgColor: { rgb: 'FFF3F4F6' } }, alignment: { vertical: 'center', horizontal: 'left' } } as const;
const S_GROUP_HDR = { font: { name: FONT, sz: 11, bold: true, color: { rgb: 'FFFFFFFF' } }, fill: { fgColor: { rgb: 'FF334155' } }, alignment: { vertical: 'center', horizontal: 'center', wrapText: true }, border: BORDERS_HEADER } as const;
const S_SUB_HDR = { font: { name: FONT, sz: 10, bold: true, color: { rgb: 'FFFFFFFF' } }, fill: { fgColor: { rgb: 'FF475569' } }, alignment: { vertical: 'center', horizontal: 'center' }, border: BORDERS_HEADER } as const;
const S_GROUP_NAME = { font: { name: FONT, sz: 10, bold: true, color: { rgb: 'FF111827' } }, fill: { fgColor: { rgb: 'FFF8FAFC' } }, alignment: { vertical: 'top', horizontal: 'left' }, border: BORDERS_ALL } as const;
const S_NUM = { font: { name: FONT, sz: 10, color: { rgb: 'FF111827' } }, alignment: { vertical: 'center', horizontal: 'right' }, border: BORDERS_ALL } as const;
const S_PCT = { font: { name: FONT, sz: 10, color: { rgb: 'FF374151' } }, alignment: { vertical: 'center', horizontal: 'center' }, border: BORDERS_ALL } as const;
const S_DASH = { font: { name: FONT, sz: 10, color: { rgb: 'FF9CA3AF' } }, alignment: { vertical: 'center', horizontal: 'right' }, border: BORDERS_ALL } as const;

const summaryStyle = (v: number, tone?: 'done' | 'remain') => ({
  font: { name: FONT, sz: 10, bold: true, color: { rgb: v === 0 ? 'FFD1D5DB' : tone === 'done' ? 'FF047857' : tone === 'remain' ? 'FFB45309' : 'FF111827' } },
  fill: { fgColor: { rgb: 'FFF8FAFC' } }, alignment: { vertical: 'center', horizontal: 'right' }, border: BORDERS_ALL,
});
const stageColor = (stage: string) =>
  stage === 'Completion' ? 'FF2563EB' : stage === 'Closure' ? 'FF16A34A' : 'FF6B7280';
const S_STAGE = (stage: string) => ({ font: { name: FONT, sz: 10, bold: true, color: { rgb: stageColor(stage) } }, alignment: { vertical: 'center', horizontal: 'center' }, border: BORDERS_ALL });
// Difference 행: 양수=적체(빨강), 음수=빠름(초록), 일반 셀과 반대 색 의미
const deltaStyle = (v: number) => ({ font: { name: FONT, sz: 10, bold: v !== 0, color: { rgb: v < 0 ? 'FFDC2626' : v > 0 ? 'FF16A34A' : 'FF9CA3AF' } }, alignment: { vertical: 'center', horizontal: 'right' }, border: BORDERS_ALL });
const diffDeltaStyle = (v: number) => ({ font: { name: FONT, sz: 10, bold: v !== 0, color: { rgb: v > 0 ? 'FFDC2626' : v < 0 ? 'FF16A34A' : 'FF9CA3AF' } }, alignment: { vertical: 'center', horizontal: 'right' }, border: BORDERS_ALL });
function set(ws: XLSX.WorkSheet, r: number, c: number, v: unknown, s: Record<string, unknown>) { ws[XLSX.utils.encode_cell({ r, c })] = { t: 's', v: v == null ? '' : String(v), s }; }
function setNum(ws: XLSX.WorkSheet, r: number, c: number, v: number, s: Record<string, unknown>) { ws[XLSX.utils.encode_cell({ r, c })] = { t: 'n', v, s }; }

export function exportDefectPlanActualToExcel(
  rows: DefectPlanActualRow[],
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
  const COL_COUNT = 17;
  const ws: XLSX.WorkSheet = {};
  set(ws, 0, 0, `SHAW Defect — Plan vs Actual (${groupHeader}) [Plan: ${planModeLabel}]`, S_TITLE);
  for (let c = 1; c < COL_COUNT; c++) set(ws, 0, c, '', S_TITLE);
  set(ws, 1, 0, `Exported: ${ts}  ·  Today: ${today}  ·  Data Date: ${dataDate}  ·  Plan Mode: ${planModeLabel}`, S_META);
  for (let c = 1; c < COL_COUNT; c++) set(ws, 1, c, '', S_META);
  const HR = 3;
  [groupHeader, 'Stage', 'Total', 'Done', 'Remain', 'To Data Date (Cumulative)', '', '', `Data Date (${dataDateLabel})`, '', '', '', `Today (${todayLabel})`, '', '', '', 'Progress'].forEach((l, c) => set(ws, HR, c, l, S_GROUP_HDR));
  ['', '', '', '', '', 'Plan', 'Actual', 'Δ', 'Plan', 'Actual', 'Δ', 'Delay', 'Plan', 'Actual', 'Δ', 'Delay', '%'].forEach((l, c) => set(ws, 4, c, l, S_SUB_HDR));
  const merges: XLSX.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: COL_COUNT - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: COL_COUNT - 1 } },
    { s: { r: HR, c: 0 }, e: { r: 4, c: 0 } }, { s: { r: HR, c: 1 }, e: { r: 4, c: 1 } }, { s: { r: HR, c: 2 }, e: { r: 4, c: 2 } }, { s: { r: HR, c: 3 }, e: { r: 4, c: 3 } }, { s: { r: HR, c: 4 }, e: { r: 4, c: 4 } },
    { s: { r: HR, c: 5 }, e: { r: HR, c: 7 } }, { s: { r: HR, c: 8 }, e: { r: HR, c: 11 } }, { s: { r: HR, c: 12 }, e: { r: HR, c: 15 } }, { s: { r: HR, c: 16 }, e: { r: 4, c: 16 } },
  ];
  let dataRow = 5;
  for (const row of rows) {
    const startRow = dataRow;
    const stageList: Array<{ label: 'Completion' | 'Closure' | 'Difference'; metrics: DefectPlanActualMetrics; isDiff: boolean }> = [
      { label: 'Completion', metrics: row.completion, isDiff: false },
      { label: 'Closure', metrics: row.closure, isDiff: false },
      { label: 'Difference', metrics: diffMetrics(row), isDiff: true },
    ];
    stageList.forEach((s, i) => {
      const m = s.metrics;
      const cr = dataRow;
      const totalCell = s.isDiff ? m.cumActual : row.totalDefects;
      const remain = s.isDiff ? 0 : row.totalDefects - m.cumActual;
      const cumD = m.cumActual - m.cumPlan;
      const dataDateD = m.dataDateActual - m.dataDatePlan;
      const todayD = m.todayActual - m.todayPlan;
      const pct = row.totalDefects ? Math.round((m.cumActual / row.totalDefects) * 100) : 0;
      const dStyle = s.isDiff ? diffDeltaStyle : deltaStyle;
      if (i === 0) set(ws, cr, 0, row.label, S_GROUP_NAME);
      set(ws, cr, 1, s.label, S_STAGE(s.label));
      setNum(ws, cr, 2, totalCell, summaryStyle(totalCell));
      setNum(ws, cr, 3, m.cumActual, summaryStyle(m.cumActual, 'done'));
      setNum(ws, cr, 4, remain, summaryStyle(remain, 'remain'));
      setNum(ws, cr, 5, m.cumPlan, S_NUM); setNum(ws, cr, 6, m.cumActual, S_NUM); setNum(ws, cr, 7, cumD, dStyle(cumD));
      setNum(ws, cr, 8, m.dataDatePlan, S_NUM); setNum(ws, cr, 9, m.dataDateActual, S_NUM); setNum(ws, cr, 10, dataDateD, dStyle(dataDateD)); setNum(ws, cr, 11, m.dataDateDelay, S_NUM);
      setNum(ws, cr, 12, m.todayPlan, S_NUM); setNum(ws, cr, 13, m.todayActual, S_NUM); setNum(ws, cr, 14, todayD, dStyle(todayD)); setNum(ws, cr, 15, m.todayDelay, S_NUM);
      if (s.isDiff) set(ws, cr, 16, '—', S_DASH);
      else set(ws, cr, 16, `${pct}%`, S_PCT);
      dataRow++;
    });
    merges.push({ s: { r: startRow, c: 0 }, e: { r: startRow + 2, c: 0 } });
  }
  ws['!merges'] = merges;
  ws['!cols'] = [{ wch: 24 }, { wch: 11 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 7 }, { wch: 8 }, { wch: 8 }, { wch: 7 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 7 }, { wch: 8 }, { wch: 10 }];
  ws['!ref'] = `A1:${XLSX.utils.encode_col(COL_COUNT - 1)}${dataRow}`;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Plan vs Actual');
  const fileName = `SHAW_Defect_PlanVsActual_${groupHeader.replace(/[\s/]/g, '_')}_${fileTs}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return { rowCount: rows.length, fileName };
}
