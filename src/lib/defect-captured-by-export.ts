import XLSX from 'xlsx-js-style';
import {
  FONT_NAME,
  STYLE_TITLE,
  STYLE_META_LABEL,
  STYLE_META_VALUE,
  STYLE_HEADER,
  STYLE_DATA,
  setCell,
} from '@/lib/excel-export';

export interface CapturedByExportRow {
  name: string;
  total: number;
  completed: number;
  closed: number;
  dispute: number;
  priTotal: number;
  priCatA: number;
  priCatB: number;
  priNoCat: number;
  isUnknown?: boolean;
}

export interface CapturedByExportTotals {
  total: number;
  completed: number;
  closed: number;
  dispute: number;
  priTotal: number;
  priCatA: number;
  priCatB: number;
  priNoCat: number;
}

export interface ExportCapturedByOptions {
  rows: CapturedByExportRow[];
  totals: CapturedByExportTotals;
  meta: { userName: string; userType: string };
  activeTab: string;
  nameFilter: string[];
}

const COL_LABELS = [
  'Name',
  'Total', 'Completed', 'Closed', 'In Dispute',
  'Total', 'Cat. A', 'Cat. B', 'No Cat.',
];

const STYLE_GROUP_HEADER = {
  font: { name: FONT_NAME, sz: 11, bold: true, color: { rgb: 'FFFFFFFF' } },
  fill: { fgColor: { rgb: 'FF1E3A5F' } },
  alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
  border: {
    top: { style: 'thin', color: { rgb: 'FF1F2937' } },
    bottom: { style: 'thin', color: { rgb: 'FF1F2937' } },
    left: { style: 'thin', color: { rgb: 'FF1F2937' } },
    right: { style: 'thin', color: { rgb: 'FF1F2937' } },
  },
} as const;

const STYLE_DATA_NUM = {
  ...STYLE_DATA,
  alignment: { vertical: 'center', horizontal: 'right' },
} as const;

const STYLE_DATA_NAME = {
  ...STYLE_DATA,
  font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: 'FF111827' } },
} as const;

const STYLE_TOTAL_LABEL = {
  font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: 'FF111827' } },
  fill: { fgColor: { rgb: 'FFE5E7EB' } },
  alignment: { vertical: 'center', horizontal: 'left' },
  border: STYLE_DATA.border,
} as const;

const STYLE_TOTAL_NUM = {
  font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: 'FF111827' } },
  fill: { fgColor: { rgb: 'FFE5E7EB' } },
  alignment: { vertical: 'center', horizontal: 'right' },
  border: STYLE_DATA.border,
} as const;

const STYLE_UNKNOWN_NAME = {
  ...STYLE_DATA_NAME,
  font: { name: FONT_NAME, sz: 10, bold: true, italic: true, color: { rgb: 'FFB91C1C' } },
} as const;

const STYLE_UNKNOWN_NUM = {
  ...STYLE_DATA_NUM,
  font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: 'FFB91C1C' } },
} as const;

function setNumCell(ws: XLSX.WorkSheet, r: number, c: number, value: number, style: Record<string, unknown>) {
  const addr = XLSX.utils.encode_cell({ r, c });
  ws[addr] = { t: 'n', v: value, s: style };
}

function timestampForFilename(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}

export function exportCapturedByToExcel(opts: ExportCapturedByOptions): { fileName: string; rowCount: number } {
  const { rows, totals, meta, activeTab, nameFilter } = opts;

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const exportedTs = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const colCount = COL_LABELS.length; // 9
  const lastColLetter = XLSX.utils.encode_col(colCount - 1);

  const ws: XLSX.WorkSheet = {};

  // Row 0: Title
  setCell(ws, 0, 0, "SHAW T&C — PM's Defect Statistics", STYLE_TITLE);
  // Row 1-4: Meta
  setCell(ws, 1, 0, `Exported: ${exportedTs}  by  ${meta.userName}${meta.userType ? ` (${meta.userType})` : ''}`, STYLE_META_LABEL);
  setCell(ws, 2, 0, `Tab: ${activeTab}`, STYLE_META_VALUE);
  setCell(ws, 3, 0, `Name Filter: ${nameFilter.length ? nameFilter.join(', ') : '(none)'}`, STYLE_META_VALUE);
  setCell(ws, 4, 0, `Rows: ${rows.length}`, STYLE_META_VALUE);
  // Row 5: spacer (empty)

  // Row 6: Group headers
  setCell(ws, 6, 0, '', STYLE_HEADER);
  for (let c = 1; c <= 4; c++) setCell(ws, 6, c, c === 1 ? 'By Quantity' : '', STYLE_GROUP_HEADER);
  for (let c = 5; c <= 8; c++) setCell(ws, 6, c, c === 5 ? 'By Priority for Outstanding Items' : '', STYLE_GROUP_HEADER);

  // Row 7: Column headers
  for (let c = 0; c < COL_LABELS.length; c++) setCell(ws, 7, c, COL_LABELS[c], STYLE_HEADER);

  // Row 8: TOTAL row
  setCell(ws, 8, 0, `TOTAL (n=${rows.length})`, STYLE_TOTAL_LABEL);
  const totalVals = [totals.total, totals.completed, totals.closed, totals.dispute, totals.priTotal, totals.priCatA, totals.priCatB, totals.priNoCat];
  totalVals.forEach((v, i) => setNumCell(ws, 8, 1 + i, v, STYLE_TOTAL_NUM));

  // Row 9+: Data
  rows.forEach((r, idx) => {
    const rowIdx = 9 + idx;
    const nameStyle = r.isUnknown ? STYLE_UNKNOWN_NAME : STYLE_DATA_NAME;
    const numStyle = r.isUnknown ? STYLE_UNKNOWN_NUM : STYLE_DATA_NUM;
    setCell(ws, rowIdx, 0, r.name, nameStyle);
    const vals = [r.total, r.completed, r.closed, r.dispute, r.priTotal, r.priCatA, r.priCatB, r.priNoCat];
    vals.forEach((v, i) => setNumCell(ws, rowIdx, 1 + i, v, numStyle));
  });

  // Merges: title (row0) + each meta row + group headers
  const merges: XLSX.Range[] = [];
  for (let r = 0; r < 5; r++) merges.push({ s: { r, c: 0 }, e: { r, c: colCount - 1 } });
  merges.push({ s: { r: 5, c: 0 }, e: { r: 5, c: colCount - 1 } });
  merges.push({ s: { r: 6, c: 1 }, e: { r: 6, c: 4 } });
  merges.push({ s: { r: 6, c: 5 }, e: { r: 6, c: 8 } });
  ws['!merges'] = merges;

  // Column widths
  ws['!cols'] = [
    { wch: 28 },
    { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
  ];

  // Row heights
  const rowsInfo: XLSX.RowInfo[] = [];
  rowsInfo[0] = { hpt: 24 };
  for (let i = 1; i <= 4; i++) rowsInfo[i] = { hpt: 16 };
  rowsInfo[5] = { hpt: 6 };
  rowsInfo[6] = { hpt: 22 };
  rowsInfo[7] = { hpt: 24 };
  rowsInfo[8] = { hpt: 22 };
  for (let i = 0; i < rows.length; i++) rowsInfo[9 + i] = { hpt: 20 };
  ws['!rows'] = rowsInfo;

  // Freeze: header + total row, name column
  (ws as any)['!views'] = [{
    state: 'frozen',
    xSplit: 1,
    ySplit: 9,
    topLeftCell: XLSX.utils.encode_cell({ r: 9, c: 1 }),
    activePane: 'bottomRight',
  }];

  const lastRow = 9 + rows.length - 1;
  ws['!ref'] = `A1:${lastColLetter}${Math.max(lastRow + 1, 9)}`;

  // Autofilter on header row
  ws['!autofilter'] = { ref: `A8:${lastColLetter}${Math.max(lastRow + 1, 9)}` };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "PM's Defect Statistics");

  const fileName = `SHAW_PM_Defect_Statistics_${timestampForFilename()}.xlsx`;
  XLSX.writeFile(wb, fileName);

  return { fileName, rowCount: rows.length };
}
