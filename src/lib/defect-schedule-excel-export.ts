import XLSX from 'xlsx-js-style';
import {
  type DefectAggregateResult,
  type DefectScheduleBucket,
  type DefectScheduleStageFilter,
  type DefectScheduleStage,
  ALL_DEFECT_STAGE_KEYS,
  DEFECT_STAGE_LABELS,
  formatBucketLabel,
} from './defect-schedule-utils';

const FONT = 'Calibri';
const BORDER_THIN = { style: 'thin', color: { rgb: 'FFE5E7EB' } } as const;
const BORDER_DARK = { style: 'thin', color: { rgb: 'FF1F2937' } } as const;
const BORDERS_ALL = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN } as const;
const BORDERS_HDR = { top: BORDER_DARK, bottom: BORDER_DARK, left: BORDER_DARK, right: BORDER_DARK } as const;

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

const S_GRP_HDR = {
  font: { name: FONT, sz: 10, bold: true, color: { rgb: 'FFFFFFFF' } },
  fill: { fgColor: { rgb: 'FF334155' } },
  alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
  border: BORDERS_HDR,
} as const;

const S_SUB_HDR = {
  font: { name: FONT, sz: 9, bold: true, color: { rgb: 'FFFFFFFF' } },
  fill: { fgColor: { rgb: 'FF475569' } },
  alignment: { vertical: 'center', horizontal: 'center' },
  border: BORDERS_HDR,
} as const;

const S_GROUP_ROW = {
  font: { name: FONT, sz: 10, bold: true, color: { rgb: 'FF111827' } },
  fill: { fgColor: { rgb: 'FFF8FAFC' } },
  alignment: { vertical: 'center', horizontal: 'left' },
  border: BORDERS_ALL,
} as const;

const S_GROUP_NUM = {
  font: { name: FONT, sz: 10, bold: true, color: { rgb: 'FF111827' } },
  fill: { fgColor: { rgb: 'FFF8FAFC' } },
  alignment: { vertical: 'center', horizontal: 'right' },
  border: BORDERS_ALL,
} as const;

const S_STAGE_ROW = {
  font: { name: FONT, sz: 9, color: { rgb: 'FF374151' } },
  alignment: { vertical: 'center', horizontal: 'left' },
  border: BORDERS_ALL,
} as const;

const S_NUM = {
  font: { name: FONT, sz: 9, color: { rgb: 'FF111827' } },
  alignment: { vertical: 'center', horizontal: 'right' },
  border: BORDERS_ALL,
} as const;

const S_PCT = {
  font: { name: FONT, sz: 9, color: { rgb: 'FF6B7280' } },
  alignment: { vertical: 'center', horizontal: 'right' },
  border: BORDERS_ALL,
} as const;

const S_TIMELINE = {
  font: { name: FONT, sz: 9, color: { rgb: 'FF374151' } },
  alignment: { vertical: 'center', horizontal: 'center' },
  border: BORDERS_ALL,
} as const;

const S_TIMELINE_TODAY = {
  font: { name: FONT, sz: 9, bold: true, color: { rgb: 'FF1E40AF' } },
  fill: { fgColor: { rgb: 'FFDBEAFE' } },
  alignment: { vertical: 'center', horizontal: 'center' },
  border: BORDERS_ALL,
} as const;

const varStyle = (v: number, base: Record<string, unknown> = {}) => {
  const color = v < 0 ? 'FFDC2626' : v > 0 ? 'FF16A34A' : 'FF9CA3AF';
  return {
    ...S_NUM,
    ...base,
    font: { name: FONT, sz: 9, bold: v !== 0, color: { rgb: color } },
  };
};

function set(ws: XLSX.WorkSheet, r: number, c: number, v: unknown, s: Record<string, unknown>) {
  ws[XLSX.utils.encode_cell({ r, c })] = { t: 's', v: v == null ? '' : String(v), s };
}
function setNum(ws: XLSX.WorkSheet, r: number, c: number, v: number, s: Record<string, unknown>) {
  ws[XLSX.utils.encode_cell({ r, c })] = { t: 'n', v, s };
}

export interface DefectScheduleExportOpts {
  groupHeader: string;
  stageFilter: DefectScheduleStageFilter;
  bucket: DefectScheduleBucket;
  today: string;
  dataDate?: string;
  asOfLabel?: string;
  planMode?: 'baseline' | 'remaining';
}

export function exportDefectScheduleToExcel(
  data: DefectAggregateResult,
  opts: DefectScheduleExportOpts,
): { rowCount: number; fileName: string } {
  const { groupHeader, stageFilter, bucket, today, dataDate, asOfLabel = 'Today' } = opts;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const fileTs = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;

  const stagesSelected: DefectScheduleStage[] =
    stageFilter === 'all'
      ? ALL_DEFECT_STAGE_KEYS
      : Array.isArray(stageFilter)
        ? ALL_DEFECT_STAGE_KEYS.filter(s => stageFilter.includes(s))
        : [stageFilter as DefectScheduleStage];
  const stageLabel = stagesSelected.length === ALL_DEFECT_STAGE_KEYS.length
    ? 'All'
    : stagesSelected.map(s => DEFECT_STAGE_LABELS[s]).join('+');
  const showSubRows = stagesSelected.length > 1;
  const stages: DefectScheduleStage[] = showSubRows ? stagesSelected : [];

  const FIXED_COLS = 9;
  const bucketCount = data.buckets.length;
  const COL_COUNT = FIXED_COLS + bucketCount;

  let todayBucketIdx = -1;
  for (let i = 0; i < data.buckets.length; i++) {
    if (data.buckets[i] === today) { todayBucketIdx = i; break; }
    if (data.buckets[i] > today) break;
    todayBucketIdx = i;
  }

  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];

  set(ws, 0, 0, `SHAW Defect — Progress Status (${groupHeader})`, S_TITLE);
  for (let c = 1; c < COL_COUNT; c++) set(ws, 0, c, '', S_TITLE);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: COL_COUNT - 1 } });

  set(ws, 1, 0, `Exported: ${ts}  ·  Stage: ${stageLabel}  ·  Bucket: ${bucket === 'day' ? 'Daily' : 'Weekly'}  ·  Data Date: ${dataDate ?? '—'}  ·  Today: ${today}  ·  Cumulative: ${asOfLabel}`, S_META);
  for (let c = 1; c < COL_COUNT; c++) set(ws, 1, c, '', S_META);
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: COL_COUNT - 1 } });

  const HR = 3;
  set(ws, HR, 0, groupHeader, S_GRP_HDR);
  set(ws, HR, 1, 'Total Scope', S_GRP_HDR);
  for (let c = 2; c <= 4; c++) set(ws, HR, c, '', S_GRP_HDR);
  merges.push({ s: { r: HR, c: 1 }, e: { r: HR, c: 4 } });
  set(ws, HR, 5, `Up to ${asOfLabel}`, S_GRP_HDR);
  for (let c = 6; c <= 8; c++) set(ws, HR, c, '', S_GRP_HDR);
  merges.push({ s: { r: HR, c: 5 }, e: { r: HR, c: 8 } });
  if (bucketCount > 0) {
    set(ws, HR, FIXED_COLS, 'Timeline', S_GRP_HDR);
    for (let c = FIXED_COLS + 1; c < COL_COUNT; c++) set(ws, HR, c, '', S_GRP_HDR);
    merges.push({ s: { r: HR, c: FIXED_COLS }, e: { r: HR, c: COL_COUNT - 1 } });
  }
  merges.push({ s: { r: HR, c: 0 }, e: { r: HR + 1, c: 0 } });

  const SHR = 4;
  set(ws, SHR, 0, '', S_SUB_HDR);
  ['Total', 'Done', '%', 'Remain', 'Plan', 'Actual', '%', 'Diff'].forEach((l, i) => set(ws, SHR, 1 + i, l, S_SUB_HDR));
  data.buckets.forEach((b, i) => {
    const lbl = formatBucketLabel(b, bucket);
    const isToday = i === todayBucketIdx;
    set(ws, SHR, FIXED_COLS + i, `${lbl.primary}\n${lbl.secondary}`, isToday ? {
      ...S_SUB_HDR,
      fill: { fgColor: { rgb: 'FF1E40AF' } },
    } : S_SUB_HDR);
  });

  let dataRow = 5;

  for (const row of data.rows) {
    const cr = dataRow;
    set(ws, cr, 0, row.label, S_GROUP_ROW);

    setNum(ws, cr, 1, row.total, S_GROUP_NUM);
    setNum(ws, cr, 2, row.doneCount, S_GROUP_NUM);
    const donePct = row.total > 0 ? Math.round((row.doneCount / row.total) * 100) : 0;
    set(ws, cr, 3, `${donePct}%`, { ...S_PCT, fill: { fgColor: { rgb: 'FFF8FAFC' } }, font: { ...S_PCT.font, bold: true } });
    const remain = row.total - row.doneCount;
    setNum(ws, cr, 4, remain, varStyle(remain > 0 ? -1 : 0, { fill: { fgColor: { rgb: 'FFF8FAFC' } } }));

    setNum(ws, cr, 5, row.cumPlan, S_GROUP_NUM);
    setNum(ws, cr, 6, row.cumActual, S_GROUP_NUM);
    const cumPct = row.cumPlan > 0 ? Math.round((row.cumActual / row.cumPlan) * 100) : 0;
    set(ws, cr, 7, `${cumPct}%`, { ...S_PCT, fill: { fgColor: { rgb: 'FFF8FAFC' } }, font: { ...S_PCT.font, bold: true } });
    const diff = row.cumActual - row.cumPlan;
    setNum(ws, cr, 8, diff, varStyle(diff, { fill: { fgColor: { rgb: 'FFF8FAFC' } } }));

    row.combined.forEach((c, i) => {
      const isToday = i === todayBucketIdx;
      const style = isToday ? S_TIMELINE_TODAY : S_TIMELINE;
      if (c.plan === 0 && c.actual === 0) set(ws, cr, FIXED_COLS + i, '', style);
      else set(ws, cr, FIXED_COLS + i, `${c.plan}/${c.actual}`, style);
    });

    dataRow++;

    if (showSubRows) {
      stages.forEach((st, si) => {
        const sr = row.stages[st];
        const scr = dataRow;
        const prefix = si < stages.length - 1 ? '├ ' : '└ ';
        set(ws, scr, 0, `  ${prefix}${DEFECT_STAGE_LABELS[st]}`, S_STAGE_ROW);

        setNum(ws, scr, 1, sr.total, S_NUM);
        setNum(ws, scr, 2, sr.totalDone, S_NUM);
        const sPct = sr.total > 0 ? Math.round((sr.totalDone / sr.total) * 100) : 0;
        set(ws, scr, 3, `${sPct}%`, S_PCT);
        const sRemain = sr.total - sr.totalDone;
        setNum(ws, scr, 4, sRemain, varStyle(sRemain > 0 ? -1 : 0));

        setNum(ws, scr, 5, sr.cumPlan, S_NUM);
        setNum(ws, scr, 6, sr.cumActual, S_NUM);
        const sCumPct = sr.cumPlan > 0 ? Math.round((sr.cumActual / sr.cumPlan) * 100) : 0;
        set(ws, scr, 7, `${sCumPct}%`, S_PCT);
        const sDiff = sr.cumActual - sr.cumPlan;
        setNum(ws, scr, 8, sDiff, varStyle(sDiff));

        sr.cells.forEach((c, i) => {
          const isToday = i === todayBucketIdx;
          const style = isToday ? S_TIMELINE_TODAY : S_TIMELINE;
          if (c.plan === 0 && c.actual === 0) set(ws, scr, FIXED_COLS + i, '', style);
          else set(ws, scr, FIXED_COLS + i, `${c.plan}/${c.actual}`, style);
        });

        dataRow++;
      });
    }
  }

  ws['!merges'] = merges;

  const cols: XLSX.ColInfo[] = [
    { wch: 22 },
    { wch: 7 }, { wch: 7 }, { wch: 6 }, { wch: 7 },
    { wch: 7 }, { wch: 7 }, { wch: 6 }, { wch: 7 },
  ];
  const bucketW = bucket === 'day' ? 8 : 10;
  for (let i = 0; i < bucketCount; i++) cols.push({ wch: bucketW });
  ws['!cols'] = cols;

  const rowInfo: XLSX.RowInfo[] = [];
  rowInfo[0] = { hpt: 26 };
  rowInfo[1] = { hpt: 16 };
  rowInfo[2] = { hpt: 6 };
  rowInfo[HR] = { hpt: 24 };
  rowInfo[SHR] = { hpt: 28 };
  for (let i = 5; i < dataRow; i++) rowInfo[i] = { hpt: 18 };
  ws['!rows'] = rowInfo;

  (ws as any)['!views'] = [{
    state: 'frozen',
    xSplit: FIXED_COLS,
    ySplit: 5,
    topLeftCell: XLSX.utils.encode_cell({ r: 5, c: FIXED_COLS }),
    activePane: 'bottomRight',
  }];

  const lastCol = XLSX.utils.encode_col(COL_COUNT - 1);
  ws['!ref'] = `A1:${lastCol}${dataRow}`;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Defect Progress');

  const fileName = `SHAW_Defect_Progress_${groupHeader.replace(/[\s/]/g, '_')}_${stageLabel}_${fileTs}.xlsx`;
  XLSX.writeFile(wb, fileName);

  return { rowCount: data.rows.length, fileName };
}
