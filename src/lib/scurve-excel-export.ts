/**
 * S-Curve Excel Export
 *
 * Exports the Dashboard's "Plan vs Actual — S-Curve" panel to an .xlsx file
 * with three sheets:
 *   1. Meta   — context (filters, date range, bucket, exporter, today)
 *   2. Data   — the underlying numeric series (one row per bucket)
 *   3. Chart  — a PNG snapshot of the live on-screen chart, so the Excel
 *              looks visually identical to what the user sees.
 *
 * Implementation notes:
 * - Uses ExcelJS (already added to package.json) instead of xlsx-js-style
 *   because xlsx-js-style cannot embed images.
 * - The chart image is captured by serializing the live Recharts SVG and
 *   rasterising it on a <canvas>. No extra runtime dependencies needed.
 */
import ExcelJS from 'exceljs';
import { isoToExcelSerial, DATE_NUMFMT } from '@/lib/excel-date-cell';
import type { SCurvePoint } from '@/lib/dashboard-utils';
import type {
  DefectSCurveResult,
  DefectSCurveAllResult,
  DefectSCurveStageOpt,
} from '@/lib/defect-dashboard-utils';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const META_LABEL_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE5E7EB' },
};

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF3F4F6' },
};

const TODAY_ROW_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFEE2E2' }, // light red
};

const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
};

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function downloadWorkbook(wb: ExcelJS.Workbook, fileName: string) {
  return wb.xlsx.writeBuffer().then((buf) => {
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

// ---------------------------------------------------------------------------
// SVG → PNG rasterisation (for the on-screen Recharts chart)
// ---------------------------------------------------------------------------

interface CapturedImage {
  pngBase64: string; // base64 (no data URL prefix)
  widthPx: number;
  heightPx: number;
}

/**
 * Capture an HTMLElement that contains a Recharts <svg> as a PNG.
 * Returns null if no svg is found or rasterisation fails.
 *
 * The function inlines the page's computed font-family on the cloned SVG
 * so the exported image looks like the on-screen chart.
 */
export async function captureChartElementAsPng(
  el: HTMLElement | null,
  scale = 2,
): Promise<CapturedImage | null> {
  if (!el) return null;
  const svg = el.querySelector('svg');
  if (!svg) return null;

  // Use the rendered bounding box for size (Recharts sets viewBox + width/height).
  const rect = svg.getBoundingClientRect();
  const widthPx = Math.max(1, Math.round(rect.width));
  const heightPx = Math.max(1, Math.round(rect.height));

  // Clone so we can inject styles without disturbing the live chart.
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(widthPx));
  clone.setAttribute('height', String(heightPx));

  // Inline computed text styles so legend / axis text renders correctly.
  const fontFamily =
    getComputedStyle(document.body).fontFamily || 'Inter, sans-serif';
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.textContent = `
    text { font-family: ${fontFamily}; }
    .recharts-cartesian-axis-tick-value { font-size: 11px; fill: #4B5563; }
    .recharts-legend-item-text { font-size: 11px !important; fill: #374151 !important; }
  `;
  clone.insertBefore(styleEl, clone.firstChild);

  // White background rect so PNG is opaque (Recharts svg is transparent).
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', '0');
  bg.setAttribute('y', '0');
  bg.setAttribute('width', String(widthPx));
  bg.setAttribute('height', String(heightPx));
  bg.setAttribute('fill', '#FFFFFF');
  clone.insertBefore(bg, styleEl.nextSibling);

  const xml = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG image failed to load'));
    });
    img.src = svgUrl;
    await loaded;

    const canvas = document.createElement('canvas');
    canvas.width = widthPx * scale;
    canvas.height = heightPx * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    return { pngBase64: base64, widthPx, heightPx };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

// ---------------------------------------------------------------------------
// Meta sheet
// ---------------------------------------------------------------------------

export interface SCurveMetaInput {
  module: 'T&C' | 'Defect';
  sourcePage: string;          // e.g. '/dashboard'
  exportedByName: string;
  exportedByRole: string;
  today: string;               // ISO YYYY-MM-DD
  bucket: 'day' | 'week';
  rangeStart: string;
  rangeEnd: string;
  filters: Array<[string, string]>; // label, value
  hiddenSeries?: string[];
  totalIncluded: number;       // total subtests / defects in scope
  notes?: string[];
  planMode?: 'baseline' | 'remaining';
}

function writeMetaSheet(ws: ExcelJS.Worksheet, m: SCurveMetaInput) {
  ws.columns = [
    { width: 28 },
    { width: 64 },
  ];

  const rows: Array<[string, string]> = [
    ['Module', m.module],
    ['Source page', m.sourcePage],
    ['Exported by', `${m.exportedByName} (${m.exportedByRole})`],
    ['Exported at', new Date().toLocaleString()],
    ['Today (reference)', m.today],
    ['Bucket', m.bucket === 'day' ? 'Daily' : 'Weekly'],
    ['Date range', `${m.rangeStart} ~ ${m.rangeEnd}`],
    ['Total in scope', String(m.totalIncluded)],
    ['Plan mode', m.planMode === 'remaining' ? 'Remaining' : 'Baseline'],
  ];
  for (const [k, v] of m.filters) rows.push([`Filter: ${k}`, v]);
  if (m.hiddenSeries && m.hiddenSeries.length > 0) {
    rows.push(['Hidden series', m.hiddenSeries.join(', ')]);
  }
  if (m.notes) for (const n of m.notes) rows.push(['Note', n]);

  // Title row
  ws.mergeCells('A1:B1');
  const title = ws.getCell('A1');
  title.value = `Plan vs Actual — S-Curve (${m.module})`;
  title.font = { bold: true, size: 14 };
  title.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getRow(1).height = 22;

  rows.forEach(([label, value], i) => {
    const r = ws.getRow(i + 3);
    r.getCell(1).value = label;
    r.getCell(1).fill = META_LABEL_FILL;
    r.getCell(1).font = { bold: true };
    r.getCell(1).border = BORDER_THIN;
    r.getCell(2).value = value;
    r.getCell(2).border = BORDER_THIN;
    r.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  });

  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// ---------------------------------------------------------------------------
// T&C Data sheet
// ---------------------------------------------------------------------------

const TNC_DATA_HEADERS = [
  'Date Bucket',
  'T1 Planned (cum)',
  'T1 Actual (cum)',
  'T2 Planned (cum)',
  'T2 Actual (cum)',
  'T1 Met',
  'T1 Shortfall',
  'T1 Excess',
  'T1 Plan (Future)',
  'T2 Met',
  'T2 Shortfall',
  'T2 Excess',
  'T2 Plan (Future)',
] as const;

function writeTncDataSheet(ws: ExcelJS.Worksheet, scurve: SCurvePoint[], today: string) {
  ws.columns = [
    { width: 14 },
    ...new Array(TNC_DATA_HEADERS.length - 1).fill(null).map(() => ({ width: 16 })),
  ] as Partial<ExcelJS.Column>[];

  // Header row
  const header = ws.addRow([...TNC_DATA_HEADERS]);
  header.font = { bold: true };
  header.alignment = { horizontal: 'center', vertical: 'middle' };
  header.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.border = BORDER_THIN;
  });
  header.height = 22;

  for (const p of scurve) {
    const serial = isoToExcelSerial(p.bucket);
    const row = ws.addRow([
      serial ?? p.bucketLabel,
      p.t1Planned,
      p.t1Actual,
      p.t2Planned,
      p.t2Actual,
      p.t1Met,
      p.t1Shortfall,
      p.t1Excess,
      p.t1FuturePlan,
      p.t2Met,
      p.t2Shortfall,
      p.t2Excess,
      p.t2FuturePlan,
    ]);
    if (serial != null) row.getCell(1).numFmt = DATE_NUMFMT;
    for (let c = 2; c <= TNC_DATA_HEADERS.length; c++) {
      row.getCell(c).numFmt = '#,##0';
    }
    row.eachCell((c) => { c.border = BORDER_THIN; });
    if (p.bucket === today || p.bucket > today === false && p.bucket >= today) {
      // highlight the first bucket >= today exactly once
    }
  }

  // Highlight the row that contains today (or first bucket after today's start).
  const todayIdx = scurve.findIndex((p) => p.bucket >= today);
  if (todayIdx >= 0) {
    const r = ws.getRow(todayIdx + 2); // +1 header, +1 1-index
    r.eachCell((c) => { c.fill = TODAY_ROW_FILL; });
  }

  ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }];
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: TNC_DATA_HEADERS.length },
  };
}

// ---------------------------------------------------------------------------
// Defect Data sheet (handles both single-stage and all-stages results)
// ---------------------------------------------------------------------------

function writeDefectDataSheet(
  ws: ExcelJS.Worksheet,
  opts: {
    stage: DefectSCurveStageOpt;
    single?: DefectSCurveResult;
    all?: DefectSCurveAllResult;
    hiddenSeries?: Set<string>;
  },
  today: string,
) {
  const { single, all, stage, hiddenSeries } = opts;
  const isHidden = (k: string) => hiddenSeries?.has(k) ?? false;

  // Build columns dynamically based on stage / groups
  const cols: Array<{ header: string; values: (number | null)[] }> = [];
  let buckets: string[] = [];
  let bucketLabels: string[] = [];
  let todayIndex = -1;

  if (stage === 'all' && all) {
    buckets = all.buckets;
    bucketLabels = all.bucketLabels;
    todayIndex = all.todayIndex;
    const stages: Array<keyof typeof all.byStage> = ['start', 'completion', 'closure'];
    for (const s of stages) {
      const total = all.byStage[s];
      if (!isHidden(`${s}:${total.key}`) && !isHidden(`${s}:total`)) {
        cols.push({ header: `${cap(s)} — Plan (cum)`, values: total.plan });
        cols.push({ header: `${cap(s)} — Actual (cum)`, values: total.actual });
      }
      const groups = all.byStageGroups[s];
      for (const g of groups) {
        if (isHidden(`${s}:${g.key}`)) continue;
        cols.push({ header: `${cap(s)} / ${g.label} — Plan (cum)`, values: g.plan });
        cols.push({ header: `${cap(s)} / ${g.label} — Actual (cum)`, values: g.actual });
      }
    }
  } else if (single) {
    buckets = single.buckets;
    bucketLabels = single.bucketLabels;
    todayIndex = single.todayIndex;
    if (!isHidden('total') && !isHidden(single.total.key)) {
      cols.push({ header: `${cap(single.stage)} — Plan (cum)`, values: single.total.plan });
      cols.push({ header: `${cap(single.stage)} — Actual (cum)`, values: single.total.actual });
    }
    for (const g of single.groups) {
      if (isHidden(g.key)) continue;
      cols.push({ header: `${g.label} — Plan (cum)`, values: g.plan });
      cols.push({ header: `${g.label} — Actual (cum)`, values: g.actual });
    }
  }

  // Header
  ws.columns = [
    { width: 14 },
    ...cols.map(() => ({ width: 22 })),
  ] as Partial<ExcelJS.Column>[];
  const header = ws.addRow(['Date Bucket', ...cols.map((c) => c.header)]);
  header.font = { bold: true };
  header.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  header.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.border = BORDER_THIN;
  });
  header.height = 32;

  // Body
  for (let i = 0; i < buckets.length; i++) {
    const serial = isoToExcelSerial(buckets[i]);
    const row = ws.addRow([
      serial ?? bucketLabels[i],
      ...cols.map((c) => (c.values[i] === null ? null : c.values[i])),
    ]);
    if (serial != null) row.getCell(1).numFmt = DATE_NUMFMT;
    for (let c = 2; c <= cols.length + 1; c++) row.getCell(c).numFmt = '#,##0';
    row.eachCell((c) => { c.border = BORDER_THIN; });
  }

  if (todayIndex >= 0) {
    const r = ws.getRow(todayIndex + 2);
    r.eachCell((c) => { c.fill = TODAY_ROW_FILL; });
  }

  ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }];
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: cols.length + 1 },
  };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Chart sheet — embed the captured PNG
// ---------------------------------------------------------------------------

function writeChartSheet(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  meta: SCurveMetaInput,
  image: CapturedImage | null,
) {
  ws.columns = [{ width: 4 }, { width: 120 }];

  // Title
  ws.mergeCells('B2:B2');
  const t = ws.getCell('B2');
  t.value = `Plan vs Actual — S-Curve (${meta.module})`;
  t.font = { bold: true, size: 14 };

  const subtitle = ws.getCell('B3');
  subtitle.value = `${meta.bucket === 'day' ? 'Daily' : 'Weekly'} · ${meta.rangeStart} ~ ${meta.rangeEnd} · Today: ${meta.today}`;
  subtitle.font = { color: { argb: 'FF6B7280' }, italic: true };

  if (!image) {
    const note = ws.getCell('B5');
    note.value =
      'Chart image could not be captured (the S-Curve panel may have been collapsed during export). ' +
      'See the "Data" sheet for the full numeric series.';
    note.font = { color: { argb: 'FFB91C1C' } };
    note.alignment = { wrapText: true };
    ws.getRow(5).height = 40;
    return;
  }

  const imgId = wb.addImage({
    base64: image.pngBase64,
    extension: 'png',
  });

  // Place image starting at column B, row 5. Size in EMU is auto via ext.
  // ExcelJS expects ext in pixels.
  ws.addImage(imgId, {
    tl: { col: 1, row: 4 }, // 0-indexed: column B, row 5
    ext: { width: image.widthPx, height: image.heightPx },
    editAs: 'oneCell',
  });
}

// ---------------------------------------------------------------------------
// Public API — T&C
// ---------------------------------------------------------------------------

export interface ExportTncSCurveOptions {
  scurve: SCurvePoint[];
  today: string;
  bucket: 'day' | 'week';
  rangeStart: string;
  rangeEnd: string;
  filters: Array<[string, string]>;
  totalIncluded: number;
  exportedByName: string;
  exportedByRole: string;
  chartElement: HTMLElement | null;
  planMode?: 'baseline' | 'remaining';
}

export async function exportTncSCurveToExcel(
  opts: ExportTncSCurveOptions,
): Promise<{ rowCount: number; fileName: string }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SHAW T&C';
  wb.created = new Date();

  const meta: SCurveMetaInput = {
    module: 'T&C',
    sourcePage: '/dashboard',
    exportedByName: opts.exportedByName,
    exportedByRole: opts.exportedByRole,
    today: opts.today,
    bucket: opts.bucket,
    rangeStart: opts.rangeStart,
    rangeEnd: opts.rangeEnd,
    filters: opts.filters,
    totalIncluded: opts.totalIncluded,
    planMode: opts.planMode,
  };

  writeMetaSheet(wb.addWorksheet('Meta'), meta);
  writeTncDataSheet(wb.addWorksheet('Data'), opts.scurve, opts.today);
  const chartImg = await captureChartElementAsPng(opts.chartElement);
  writeChartSheet(wb, wb.addWorksheet('Chart'), meta, chartImg);

  const fileName = `SCurve_TnC_${opts.bucket}_${opts.rangeStart}_${opts.rangeEnd}_${timestamp()}.xlsx`;
  await downloadWorkbook(wb, fileName);
  return { rowCount: opts.scurve.length, fileName };
}

// ---------------------------------------------------------------------------
// Public API — Defect
// ---------------------------------------------------------------------------

export interface ExportDefectSCurveOptions {
  stage: DefectSCurveStageOpt;
  single?: DefectSCurveResult;
  all?: DefectSCurveAllResult;
  hiddenSeries?: Set<string>;
  today: string;
  bucket: 'day' | 'week';
  rangeStart: string;
  rangeEnd: string;
  filters: Array<[string, string]>;
  totalIncluded: number;
  exportedByName: string;
  exportedByRole: string;
  chartElement: HTMLElement | null;
}

export async function exportDefectSCurveToExcel(
  opts: ExportDefectSCurveOptions,
): Promise<{ rowCount: number; fileName: string }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SHAW T&C';
  wb.created = new Date();

  const buckets =
    opts.stage === 'all' ? opts.all?.buckets ?? [] : opts.single?.buckets ?? [];

  const meta: SCurveMetaInput = {
    module: 'Defect',
    sourcePage: '/defects/dashboard',
    exportedByName: opts.exportedByName,
    exportedByRole: opts.exportedByRole,
    today: opts.today,
    bucket: opts.bucket,
    rangeStart: opts.rangeStart,
    rangeEnd: opts.rangeEnd,
    filters: opts.filters,
    totalIncluded: opts.totalIncluded,
    hiddenSeries: opts.hiddenSeries ? [...opts.hiddenSeries] : undefined,
  };

  writeMetaSheet(wb.addWorksheet('Meta'), meta);
  writeDefectDataSheet(
    wb.addWorksheet('Data'),
    {
      stage: opts.stage,
      single: opts.single,
      all: opts.all,
      hiddenSeries: opts.hiddenSeries,
    },
    opts.today,
  );
  const chartImg = await captureChartElementAsPng(opts.chartElement);
  writeChartSheet(wb, wb.addWorksheet('Chart'), meta, chartImg);

  const stageTag = opts.stage === 'all' ? 'all' : opts.stage;
  const fileName = `SCurve_Defect_${stageTag}_${opts.bucket}_${opts.rangeStart}_${opts.rangeEnd}_${timestamp()}.xlsx`;
  await downloadWorkbook(wb, fileName);
  return { rowCount: buckets.length, fileName };
}
