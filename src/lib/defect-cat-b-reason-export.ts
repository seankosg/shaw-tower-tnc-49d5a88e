import XLSX from 'xlsx-js-style';
import {
  STYLE_TITLE,
  STYLE_META_LABEL,
  STYLE_META_VALUE,
  STYLE_HEADER,
  STYLE_DATA,
  setCell,
} from '@/lib/excel-export';

export interface ExportCatBReasonsOptions {
  reasons: Array<[string, number]>;
  meta: { userName: string; userType: string };
}

function setNumberCell(
  ws: XLSX.WorkSheet,
  r: number,
  c: number,
  value: number,
  numFmt: string,
  style: Record<string, unknown>,
) {
  const addr = XLSX.utils.encode_cell({ r, c });
  ws[addr] = { t: 'n', v: value, z: numFmt, s: { ...style, numFmt } };
}

export function exportHdecCatBReasons({ reasons, meta }: ExportCatBReasonsOptions) {
  const sorted = [...reasons].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, c]) => s + c, 0);

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const exportedTs = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const fileTs = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;

  const headerRow = ['Rank', 'Reason', 'Count', 'Percentage'];
  const colCount = headerRow.length;

  const aoa: any[][] = [
    ["HDEC's Basis of Cat B — Distribution"],
    [`Exported: ${exportedTs}  by  ${meta.userName}${meta.userType ? ` (${meta.userType})` : ''}`],
    [`Source: Defect Dashboard → Category Classification & Dispute`],
    [`Filter: hdec_verification = "Cat B - Minor Defect" AND not closure done`],
    [`Total items: ${total.toLocaleString()}    Reasons: ${sorted.length}`],
    [],
    headerRow,
    ...sorted.map(([reason, count], i) => [
      i + 1,
      reason === '__EMPTY__' ? 'Unspecified' : reason,
      count,
      total > 0 ? count / total : 0,
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Merges
  const merges: XLSX.Range[] = [];
  for (let r = 0; r < 5; r++) merges.push({ s: { r, c: 0 }, e: { r, c: colCount - 1 } });
  ws['!merges'] = merges;

  // Column widths
  ws['!cols'] = [{ wch: 6 }, { wch: 60 }, { wch: 12 }, { wch: 14 }];

  // Row heights
  const rowsInfo: XLSX.RowInfo[] = [];
  rowsInfo[0] = { hpt: 24 };
  for (let i = 1; i <= 4; i++) rowsInfo[i] = { hpt: 16 };
  rowsInfo[5] = { hpt: 6 };
  rowsInfo[6] = { hpt: 24 };
  for (let i = 0; i < sorted.length; i++) rowsInfo[7 + i] = { hpt: 18 };
  ws['!rows'] = rowsInfo;

  // Freeze under header
  (ws as any)['!freeze'] = { xSplit: 0, ySplit: 7 };
  (ws as any)['!views'] = [
    {
      state: 'frozen',
      xSplit: 0,
      ySplit: 7,
      topLeftCell: XLSX.utils.encode_cell({ r: 7, c: 0 }),
      activePane: 'bottomLeft',
    },
  ];

  // Styles
  setCell(ws, 0, 0, aoa[0][0], STYLE_TITLE);
  for (let r = 1; r <= 4; r++) {
    setCell(ws, r, 0, aoa[r][0], r === 1 ? STYLE_META_LABEL : STYLE_META_VALUE);
  }
  for (let c = 0; c < headerRow.length; c++) {
    setCell(ws, 6, c, headerRow[c], STYLE_HEADER);
  }
  for (let i = 0; i < sorted.length; i++) {
    const [reason, count] = sorted[i];
    const row = 7 + i;
    setNumberCell(ws, row, 0, i + 1, '0', STYLE_DATA);
    setCell(ws, row, 1, reason === '__EMPTY__' ? 'Unspecified' : reason, STYLE_DATA);
    setNumberCell(ws, row, 2, count, '#,##0', STYLE_DATA);
    setNumberCell(ws, row, 3, total > 0 ? count / total : 0, '0.0%', STYLE_DATA);
  }

  const lastColLetter = XLSX.utils.encode_col(colCount - 1);
  const lastRow = 7 + sorted.length - 1;
  ws['!ref'] = `A1:${lastColLetter}${Math.max(lastRow + 1, 7)}`;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CatB Reasons');

  XLSX.writeFile(wb, `SHAW_HDEC_CatB_Reasons_${fileTs}.xlsx`);

  return { rowCount: sorted.length };
}
