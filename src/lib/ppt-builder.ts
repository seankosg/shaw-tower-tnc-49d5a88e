/**
 * SHAW Tower — Completion Management Report
 * PPT Builder  v4  (Phase 2 — Browser / Lovable)
 *
 * Port of build_ppt_v4.js (Node.js + pptxgenjs) → TypeScript browser build
 *
 * Changes from Phase 1:
 *  - No fs / execSync / child_process
 *  - ReportData typed input (no JSON file)
 *  - JSZip replaces unzip CLI for XML post-processing
 *  - Pretendard font via CDN (index.html에 link 태그 추가 필요)
 *  - buildAndDownloadPpt() → browser auto-download
 *
 * Usage:
 *   import { buildAndDownloadPpt } from '@/lib/ppt-builder';
 *   const { data } = await buildReport(opts);
 *   await buildAndDownloadPpt(data);
 */

import pptxgen from 'pptxgenjs';
import { resolveText, type TextOverrideMap } from '@/lib/text-token-registry';

// Module-level text overrides, set by buildPpt() and read by builder functions.
let TEXT_OVERRIDES: TextOverrideMap | undefined = undefined;
const T = (slideKey: string, fieldKey: string, fallback: string) =>
  resolveText(TEXT_OVERRIDES, slideKey, fieldKey, fallback);

// Module-level slide display options (per slide_key → options object), set by buildPpt().
let DISPLAY_OPTIONS: Record<string, Record<string, unknown>> = {};
let CURRENT_SLIDE_KEY = '';
function getOpt<T>(slideKey: string, optKey: string, fallback: T): T {
  const v = DISPLAY_OPTIONS[slideKey]?.[optKey];
  return (v === undefined || v === null) ? fallback : (v as T);
}
import JSZip from 'jszip';
import type {
  ReportData,
  TncReportData,
  DefectReportData,
  DocsReportData,
  PunchReportData,
} from '@/lib/report-builder';
import type { PptColorTokens } from '@/lib/design-tokens';

// ─────────────────────────────────────────
// DESIGN TOKENS  (mirrors design_guide_v4.yaml)
// Mutable — overridable per-build via buildPpt({ colors }).
// ─────────────────────────────────────────
export const C: Record<string, string> = {
  gapShortfall:        'F87171',
  gapExcess:           'A3E635',
  bgBody:              '0A1A40',
  cardBody:            '152C5E',
  cardBorder:          '1E3A7A',
  cardAlert:           '3D1828',
  cardAlertBorder:     'EC4899',
  bgSubtle:            '1A2D5C',
  textPrimary:         'FFFFFF',
  textSecondary:       'CADCFC',
  textMuted:           '8B9BB8',
  textDim:             '5B7099',
  stagePreTest:        '22D3EE',
  stageOfficial:       'A78BFA',
  stageTestReport:     'F472B6',
  stagePreTestLight:   '67E8F9',
  stageOfficialLight:  'C4B5FD',
  stageTestReportLight:'F9A8D4',
  cyan:                '67E8F9',
  cyanDim:             '0EA5E9',
  green:               'A3E635',
  greenBright:         '84CC16',
  amber:               'FCD34D',
  magenta:             'F472B6',
  magentaBright:       'EC4899',
};

export let FONT      = 'Pretendard';
export let FONT_MONO = 'Consolas';

// ─────────────────────────────────────────
// MONTH LABELS
// ─────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─────────────────────────────────────────
// INTERNAL KPI TYPES (extracted from ReportData)
// ─────────────────────────────────────────
interface StageKpi { pct: number; done: number; variance: number; }

interface TncKPI {
  total:              number;
  preTest:            StageKpi;
  official:           StageKpi;
  testReport:         StageKpi;
  requiredPace:       TncReportData['requiredPace'];
  snapshots:          NonNullable<TncReportData['snapshots']>;
  scurve:             NonNullable<TncReportData['scurve']>;
  actionPlanTriggers: NonNullable<TncReportData['actionPlanTriggers']>;
  daysToPC:           number;
  dataDate:           string;
  dDay:               string;
  today:              string;
}

interface DefectKPI {
  total:              number;
  completion:         StageKpi;
  closure:            StageKpi;
  requiredPace:       NonNullable<DefectReportData['requiredPace']>;
  snapshots:          NonNullable<DefectReportData['snapshots']>;
  scurve:             NonNullable<DefectReportData['scurve']>;
  actionPlanTriggers: NonNullable<DefectReportData['actionPlanTriggers']>;
}

interface DocsKPI {
  abd:       { total: number; pcts: Record<string,number>; statusCounts: Record<string,number>; currentCounts: Record<string,number>; };
  omm:       { total: number; pcts: Record<string,number>; statusCounts: Record<string,number>; currentCounts: Record<string,number>; };
  warranty:  { total: number; pcts: Record<string,number>; statusCounts: Record<string,number>; currentCounts: Record<string,number>; };
  sparePart: { total: number; pcts: Record<string,number>; statusCounts: Record<string,number>; currentCounts: Record<string,number>; };
}

interface PunchKPI {
  total:                   number;
  completion:              StageKpi;
  requiredPace:            NonNullable<PunchReportData['requiredPace']>;
  snapshots:               NonNullable<PunchReportData['snapshots']>;
  statusBreakdown:         NonNullable<PunchReportData['statusBreakdown']>;
  completionDateBreakdown: NonNullable<PunchReportData['completionDateBreakdown']>;
  monthlyBeyondSc:         NonNullable<NonNullable<PunchReportData['completionDateBreakdown']>['monthlyBeyondSc']>;
  latestItems:             NonNullable<PunchReportData['latestItems']>;
  actionPlanTriggers:      NonNullable<PunchReportData['actionPlanTriggers']>;
  progressKpi:             NonNullable<PunchReportData['progressKpi']>;
  riskKpi:                 NonNullable<PunchReportData['riskKpi']>;
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
function fmtLong(iso: string | null | undefined): string {
  if (!iso) return '';
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return s;
  return `${String(d).padStart(2,'0')}-${MONTHS[m-1]}-${y}`;
}

function fmtDateShort(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2,'0')}-${MONTHS[m-1]}`;
}

function drawFooter(pres: pptxgen, s: pptxgen.Slide, pageNum: string) {
  // Per-slide show_footer override (defaults to true). Uses CURRENT_SLIDE_KEY
  // which is set immediately before each builder runs.
  const show = getOpt(CURRENT_SLIDE_KEY, 'show_footer', true);
  if (!show) return;
  void pres;
  const brand = T('__common', 'footer_brand', 'SHAW · Status Report');
  const pageFmt = T('__common', 'footer_page_fmt', 'Page {n}');
  s.addText(brand, {
    x: 0.5, y: 7.1, w: 5, h: 0.3,
    fontFace: FONT_MONO, fontSize: 10, color: C.cyan,
  });
  s.addText(pageFmt.replace('{n}', pageNum), {
    x: 11, y: 7.1, w: 1.83, h: 0.3,
    fontFace: FONT_MONO, fontSize: 10, color: C.textMuted, align: 'right',
  });
}

interface CardConfig {
  label:       string;
  bigNumber:   string;
  unit:        string;
  footer:      string;
  footerColor: string;
  numberColor: string;
  bg:          string;
  accentColor: string | null;
  alert:       boolean;
  alertLabel?: string;
}

function drawCard(pres: pptxgen, s: pptxgen.Slide, x: number, y: number, w: number, h: number, card: CardConfig) {
  s.addShape(pres.ShapeType.rect, {
    x, y, w, h,
    fill: { color: card.bg },
    line: card.alert
      ? { color: C.cardAlertBorder, width: 1.5 }
      : { color: C.cardBorder, width: 0.75 },
  });
  if (card.accentColor) {
    s.addShape(pres.ShapeType.rect, {
      x, y, w, h: card.alert ? 0.08 : 0.05,
      fill: { color: card.accentColor },
      line: { color: card.accentColor, width: 0 },
    });
  }
  if (card.alert) {
    const badge = card.alertLabel ?? 'AT RISK';
    s.addShape(pres.ShapeType.rect, {
      x: x + w - 0.95, y: y + 0.2, w: 0.75, h: 0.3,
      fill: { color: C.magentaBright }, line: { color: C.magentaBright, width: 0 },
    });
    s.addText(badge, {
      x: x + w - 0.95, y: y + 0.2, w: 0.75, h: 0.3,
      fontFace: FONT_MONO, fontSize: 9, bold: true,
      color: C.textPrimary, align: 'center', valign: 'middle', margin: 0, charSpacing: 1,
    });
  }
  s.addText(card.label, {
    x: x + 0.25, y: y + 0.25, w: card.alert ? w - 1.2 : w - 0.5, h: 0.35,
    fontFace: FONT, fontSize: 12, color: C.textMuted,
  });
  s.addText([
    { text: card.bigNumber, options: { fontSize: 56, bold: true, color: card.numberColor } },
    ...(card.unit ? [{ text: ` ${card.unit}`, options: { fontSize: 22, color: C.textMuted } }] : []),
  ] as pptxgen.TextProps[], {
    x: x + 0.25, y: y + 0.65, w: w - 0.5, h: 1.0,
    fontFace: FONT, margin: 0, valign: 'middle',
  });
  s.addText(card.footer, {
    x: x + 0.25, y: y + 1.65, w: w - 0.5, h: 0.45,
    fontFace: FONT, fontSize: 12, color: card.footerColor, bold: card.alert,
  });
}

function drawBar(s: pptxgen.Slide, pres: pptxgen, x: number, y: number, w: number, pct: number, color: string) {
  s.addShape(pres.ShapeType.rect, { x, y, w, h: 0.1, fill: { color: C.cardBorder }, line: { color: C.cardBorder, width: 0 } });
  const fw = Math.max(0.015, (pct / 100) * w);
  s.addShape(pres.ShapeType.rect, { x, y, w: fw, h: 0.1, fill: { color }, line: { color, width: 0 } });
}

function getBadge(triggers: Array<{ status: string }>) {
  const crit = triggers.find(t => t.status === 'CRITICAL');
  const risk = triggers.find(t => t.status === 'AT_RISK');
  if (crit) return { text: 'Critical', bg: C.cardAlert, color: C.magentaBright };
  if (risk) return { text: 'At Risk',  bg: '4A3010',    color: C.amber };
  return       { text: 'On Track',  bg: '0F2E20',    color: C.green };
}

// ─────────────────────────────────────────
// DATA MAPPING: ReportData → KPI objects
// ─────────────────────────────────────────
export function loadKPIs(rd: ReportData): { tncKPI?: TncKPI; defectKPI?: DefectKPI; docsKPI?: DocsKPI; punchKPI?: PunchKPI; } {
  const meta = rd.meta;
  const today = meta.generatedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);

  // ── T&C ──
  const tnc = rd.tnc;
  const tncKPI: TncKPI | undefined = tnc ? {
    total:      tnc.totals.total,
    preTest:    { pct: tnc.currentActual!.preTestPct,      done: tnc.totals.t1,  variance: tnc.currentActual!.preTestVariancePct },
    official:   { pct: tnc.currentActual!.officialTestPct, done: tnc.totals.t2,  variance: tnc.currentActual!.officialTestVariancePct },
    testReport: { pct: tnc.currentActual!.testReportPct,   done: tnc.totals.r2s, variance: tnc.currentActual!.testReportVariancePct },
    requiredPace:       tnc.requiredPace,
    snapshots:          tnc.snapshots   ?? [],
    scurve:             tnc.scurve      ?? [],
    actionPlanTriggers: tnc.actionPlanTriggers ?? [],
    daysToPC:    meta.daysToCompletion,
    dataDate:    tnc.dataDate,
    dDay:        meta.mcDate,
    today,
  } : undefined;

  // ── Defect ──
  const defect = rd.defect;
  const defectKPI: DefectKPI | undefined = defect ? {
    total:      defect.totals.total,
    completion: { pct: defect.currentActual!.completionPct, done: defect.totals.completion, variance: defect.currentActual!.completionVariancePct },
    closure:    { pct: defect.currentActual!.closurePct,    done: defect.totals.closure,    variance: defect.currentActual!.closureVariancePct },
    requiredPace:       defect.requiredPace!,
    snapshots:          defect.snapshots   ?? [],
    scurve:             defect.scurve      ?? [],
    actionPlanTriggers: defect.actionPlanTriggers ?? [],
  } : undefined;

  // ── Docs ──
  const docs = rd.docs;
  const mkDocs = (sub: NonNullable<typeof docs>['abd']) => ({
    total:        sub.total,
    pcts:         sub.currentPcts        ?? {},
    statusCounts: sub.statusCounts       ?? {},
    currentCounts:sub.currentCounts      ?? {},
  });
  const docsKPI: DocsKPI | undefined = docs ? {
    abd:       mkDocs(docs.abd),
    omm:       mkDocs(docs.omm),
    warranty:  mkDocs(docs.warranty),
    sparePart: mkDocs(docs.sparePart),
  } : undefined;

  // ── Punch ──
  const punch = rd.punch;
  const punchKPI: PunchKPI | undefined = punch ? {
    total:      punch.totals.total,
    completion: { pct: punch.currentActual!.completionPct, done: punch.totals.completion, variance: punch.currentActual!.variancePct },
    requiredPace:            punch.requiredPace!,
    snapshots:               punch.snapshots ?? [],
    statusBreakdown:         punch.statusBreakdown!,
    completionDateBreakdown: punch.completionDateBreakdown!,
    monthlyBeyondSc:         punch.completionDateBreakdown?.monthlyBeyondSc ?? [],
    latestItems:             punch.latestItems ?? [],
    actionPlanTriggers:      punch.actionPlanTriggers ?? [],
    progressKpi:             punch.progressKpi ?? { completionPct: 0, weightedActualPct: 0, weightedPlannedPct: 0, weightedVariancePct: 0 },
    riskKpi:                 punch.riskKpi ?? { blocked: 0, overdue: 0, criticalDelay: 0 },
  } : undefined;

  return { tncKPI, defectKPI, docsKPI, punchKPI };
}

// ─────────────────────────────────────────
// SLIDE 01: COVER
// ─────────────────────────────────────────
export function buildCover(pres: pptxgen, tncKPI: TncKPI) {
  const s = pres.addSlide();
  s.background = { color: C.bgBody };

  // Decorative concentric circles
  const cx = 11.5, cy = 4.5;
  s.addShape(pres.ShapeType.ellipse, { x: cx-4, y: cy-4, w: 8, h: 8, fill: { type: 'none' }, line: { color: '2A4580', width: 0.75 } });
  s.addShape(pres.ShapeType.ellipse, { x: cx-3, y: cy-3, w: 6, h: 6, fill: { type: 'none' }, line: { color: C.cyanDim, width: 1 } });
  s.addShape(pres.ShapeType.ellipse, { x: cx-2, y: cy-2, w: 4, h: 4, fill: { type: 'none' }, line: { color: C.cyan, width: 1.25 } });

  s.addText('PROJECT STATUS REPORT', {
    x: 0.65, y: 0.55, w: 6, h: 0.35,
    fontFace: FONT_MONO, fontSize: 11, color: C.cyan, charSpacing: 4,
  });
  s.addText('SHAW TOWER', {
    x: 0.65, y: 1.4, w: 10, h: 1.8,
    fontFace: FONT, fontSize: 80, bold: true, color: C.textPrimary, margin: 0,
  });
  s.addText(T('cover', 'subtitle_line1', 'Completion Management status —'), {
    x: 0.65, y: 3.4, w: 8, h: 0.5,
    fontFace: FONT, fontSize: 22, color: C.textSecondary,
  });
  s.addText(T('cover', 'subtitle_line2', `D-${tncKPI.daysToPC} readiness review.`), {
    x: 0.65, y: 3.9, w: 8, h: 0.5,
    fontFace: FONT, fontSize: 22, color: C.textSecondary,
  });

  // Days countdown
  s.addText(String(tncKPI.daysToPC), {
    x: 0.65, y: 5.85, w: 1.4, h: 1.2,
    fontFace: FONT, fontSize: 64, bold: true, color: C.textPrimary, margin: 0,
  });
  s.addText('days to Completion', {
    x: 2.0, y: 6.45, w: 2.5, h: 0.4,
    fontFace: FONT, fontSize: 14, color: C.textSecondary,
  });
  s.addText(`Project Completion · ${fmtLong(tncKPI.dDay)}`, {
    x: 0.65, y: 7.1, w: 5, h: 0.3,
    fontFace: FONT_MONO, fontSize: 11, color: C.cyan,
  });

  // Bottom-right metadata (with a solid background plate so decorative circles don't bleed through the text)
  const snapshotLabels = tncKPI.snapshots.map(sn => fmtDateShort(sn.date)).join(' / ');
  s.addShape(pres.ShapeType.rect, {
    x: 7.4, y: 6.5, w: 5.55, h: 1.0,
    fill: { color: C.bgBody }, line: { color: C.bgBody, width: 0 },
  });
  s.addText([
    { text: `Data date · ${fmtLong(tncKPI.dataDate)}`, options: { color: C.textMuted, breakLine: true } },
    { text: 'Simulation mode · Worst Case',              options: { color: C.textMuted, breakLine: true } },
    { text: `Snapshots · ${snapshotLabels}`,             options: { color: C.textMuted } },
  ] as pptxgen.TextProps[], {
    x: 7.5, y: 6.55, w: 5.4, h: 0.9,
    fontFace: FONT_MONO, fontSize: 10, align: 'right', paraSpaceAfter: 2,
  });
}

// ─────────────────────────────────────────
// SLIDE 02: DASHBOARD (all modules)
// ─────────────────────────────────────────
export function buildDashboard(pres: pptxgen, tncKPI: TncKPI, defectKPI: DefectKPI, docsKPI: DocsKPI, punchKPI: PunchKPI) {
  const s = pres.addSlide();
  s.background = { color: C.bgBody };

  s.addText(`SNAPSHOT · ${fmtLong(tncKPI.dataDate)}`, {
    x: 0.5, y: 0.4, w: 6, h: 0.3, fontFace: FONT_MONO, fontSize: 11, color: C.cyan, charSpacing: 3,
  });
  s.addText('30-Day Completion Readiness', {
    x: 7, y: 0.4, w: 4.1, h: 0.3, fontFace: FONT_MONO, fontSize: 10, color: C.textMuted, align: 'right',
  });
  s.addText(T('dashboard', 'headline', 'Four workstreams — four risk profiles'), {
    x: 0.5, y: 0.75, w: 12.3, h: 0.65,
    fontFace: FONT, fontSize: 30, bold: true, color: C.textPrimary, margin: 0,
  });

  function cardHeader(sx: number, sy: number, sw: number, title: string, subtitle: string, triggers: Array<{status:string}>, accentColor: string) {
    const badge = getBadge(triggers);
    s.addShape(pres.ShapeType.rect, { x: sx, y: sy, w: sw, h: 0.04, fill: { color: accentColor }, line: { color: accentColor, width: 0 } });
    s.addText(title, { x: sx+0.2, y: sy+0.1, w: sw-1.5, h: 0.32, fontFace: FONT, fontSize: 13, bold: true, color: C.textPrimary });
    s.addShape(pres.ShapeType.rect, { x: sx+sw-1.05, y: sy+0.12, w: 0.85, h: 0.26, fill: { color: badge.bg }, line: { color: badge.bg, width: 0 } });
    s.addText(badge.text, { x: sx+sw-1.05, y: sy+0.12, w: 0.85, h: 0.26, fontFace: FONT, fontSize: 9, bold: true, color: badge.color, align: 'center', valign: 'middle' });
    s.addText(subtitle, { x: sx+0.2, y: sy+0.44, w: sw-0.4, h: 0.24, fontFace: FONT, fontSize: 10, color: C.textMuted });
  }

  function progressRow(rx: number, ry: number, rw: number, label: string, pct: number, color: string, variance: number | null) {
    s.addText(label, { x: rx+0.2, y: ry, w: rw*0.45, h: 0.22, fontFace: FONT, fontSize: 10, color: C.textSecondary });
    drawBar(s, pres, rx+0.2, ry+0.24, rw-0.4, pct, color);
    const vStr = variance != null ? `  ${variance >= 0 ? '+' : ''}${variance.toFixed(1)}%` : '';
    s.addText(pct.toFixed(1) + '%' + vStr, {
      x: rx+rw-1.6, y: ry, w: 1.4, h: 0.22, fontFace: FONT, fontSize: 10,
      color: variance != null ? (variance >= 0 ? C.green : C.magentaBright) : C.textPrimary,
      align: 'right',
    });
  }

  const cardW = 6.0, gapX = 0.3, gapY = 0.2;
  const col1 = 0.5, col2 = col1 + cardW + gapX;
  const tier1H = 2.35, tier2H = 2.95;
  const row1 = 1.5, row2 = row1 + tier1H + gapY;

  // T&C card
  s.addShape(pres.ShapeType.rect, { x: col1, y: row1, w: cardW, h: tier1H, fill: { color: C.cardBody }, line: { color: C.cardBorder, width: 0.75 } });
  cardHeader(col1, row1, cardW, 'T&C Management', `${tncKPI.total.toLocaleString()} subtests · 3 stages`, tncKPI.actionPlanTriggers, C.stagePreTest);
  let ry = row1 + 0.72;
  [
    { label: 'Pre-Test',      pct: tncKPI.preTest.pct,    color: C.stagePreTest,    variance: tncKPI.preTest.variance    },
    { label: 'Official Test', pct: tncKPI.official.pct,   color: C.stageOfficial,   variance: tncKPI.official.variance   },
    { label: 'Test Report',   pct: tncKPI.testReport.pct, color: C.stageTestReport, variance: tncKPI.testReport.variance },
  ].forEach(r => { progressRow(col1, ry, cardW, r.label, r.pct, r.color, r.variance); ry += 0.45; });

  // Defect card
  s.addShape(pres.ShapeType.rect, { x: col2, y: row1, w: cardW, h: tier1H, fill: { color: C.cardBody }, line: { color: C.cardBorder, width: 0.75 } });
  cardHeader(col2, row1, cardW, 'Defect Management', `${defectKPI.total.toLocaleString()} active defects · 2 stages`, defectKPI.actionPlanTriggers, C.stageOfficial);
  ry = row1 + 0.72;
  [
    { label: 'Completion', pct: defectKPI.completion.pct, color: C.stageOfficial, variance: defectKPI.completion.variance },
    { label: 'Closure',    pct: defectKPI.closure.pct,    color: C.amber,         variance: defectKPI.closure.variance    },
  ].forEach(r => { progressRow(col2, ry, cardW, r.label, r.pct, r.color, r.variance); ry += 0.45; });

  // Close Out Docs card
  const abdApvPct  = docsKPI.abd.pcts['sub1_approval_date'] ?? 0;
  const abdSubPct  = docsKPI.abd.pcts['sub1_submission_date'] ?? 0;
  const ommSubPct  = docsKPI.omm.pcts['sub2_actual_date'] ?? 0;
  const ommUrCount = docsKPI.omm.statusCounts['under_review'] ?? 0;
  const ommUrPct   = docsKPI.omm.total > 0 ? (ommUrCount / docsKPI.omm.total) * 100 : 0;
  const warFinal   = docsKPI.warranty.pcts['final_actual_date'] ?? 0;
  const spDel      = docsKPI.sparePart.pcts['actual_delivery_date'] ?? 0;
  const docTriggers = spDel < 1 ? [{ status: 'CRITICAL' }] : warFinal < 50 ? [{ status: 'AT_RISK' }] : [];

  s.addShape(pres.ShapeType.rect, { x: col1, y: row2, w: cardW, h: tier2H, fill: { color: C.cardBody }, line: { color: C.cardBorder, width: 0.75 } });
  cardHeader(col1, row2, cardW, 'Close Out Document',
    `ABD ${docsKPI.abd.total.toLocaleString()} · OMM ${docsKPI.omm.total} · Warranty ${docsKPI.warranty.total} · Spare ${docsKPI.sparePart.total}`,
    docTriggers, C.cyan);
  ry = row2 + 0.72;
  [
    { label: 'ABD Submitted',        pct: abdSubPct, color: C.cyan },
    { label: 'OMM Draft Submitted',  pct: ommSubPct, color: C.stageOfficialLight },
    { label: 'Warranty Final',       pct: warFinal,  color: warFinal < 50 ? C.amber : C.green },
    { label: 'Spare Delivery',       pct: spDel,     color: spDel < 1 ? C.magentaBright : C.green },
  ].forEach(r => { progressRow(col1, ry, cardW, r.label, r.pct, r.color, null); ry += 0.45; });
  void abdApvPct; void ommUrPct;

  // Punch card
  const sb   = punchKPI.statusBreakdown;
  const cdb  = punchKPI.completionDateBreakdown;
  const within    = cdb.withinMcDate ?? 0;
  const beyond    = cdb.beyondMcDate ?? 0;
  const incomplete = within + beyond;
  const punchTriggers = beyond > 0 ? [{ status: 'AT_RISK' }] : [];

  s.addShape(pres.ShapeType.rect, { x: col2, y: row2, w: cardW, h: tier2H, fill: { color: C.cardBody }, line: { color: C.cardBorder, width: 0.75 } });
  cardHeader(col2, row2, cardW, 'Punch List',
    `${punchKPI.total} items  ·  ${sb.completed} completed  ·  ${sb.wip} in progress  ·  ${sb.notStarted} not started`,
    punchTriggers, C.stageTestReport);

  // Mini status cards
  const msY = row2 + 0.73, msH = 0.63, msW = (cardW - 0.4) / 3 - 0.1;
  [
    { label: 'Completed',   value: sb.completed,  color: C.green,         bg: '0F2E20' },
    { label: 'In Progress', value: sb.wip,        color: C.cyan,          bg: C.cardBody },
    { label: 'Not Started', value: sb.notStarted, color: C.magentaBright, bg: C.cardAlert },
  ].forEach((m, i) => {
    const mx = col2 + 0.2 + i * (msW + 0.1);
    s.addShape(pres.ShapeType.rect, { x: mx, y: msY, w: msW, h: msH, fill: { color: m.bg }, line: { color: C.cardBorder, width: 0.5 } });
    s.addText(m.label, { x: mx+0.1, y: msY+0.06, w: msW-0.15, h: 0.18, fontFace: FONT, fontSize: 9, color: m.color });
    s.addText(String(m.value), { x: mx+0.1, y: msY+0.24, w: msW-0.15, h: 0.34, fontFace: FONT, fontSize: 26, bold: true, color: m.color, margin: 0 });
  });

  // Timeline mini-banner
  const tlX2 = col2 + 0.2, tlW2 = cardW - 0.4;
  const divY = msY + msH + 0.12;
  const axisY2 = divY + 0.28;
  const incompleteN = incomplete > 0 ? incomplete : 1;
  const mcX2 = tlX2 + (within / incompleteN) * tlW2;

  s.addText(`Today  ${fmtLong(tncKPI.dataDate)}`, {
    x: tlX2, y: divY, w: 1.6, h: 0.2, fontFace: FONT_MONO, fontSize: 8, color: C.textMuted,
  });
  s.addText(`MC Date  ${fmtLong(tncKPI.dDay)}`, {
    x: Math.max(tlX2 + 1.7, mcX2 - 1.5), y: divY, w: 1.45, h: 0.2, fontFace: FONT_MONO, fontSize: 8, color: C.cyan, align: 'right',
  });
  s.addShape(pres.ShapeType.rect, { x: tlX2, y: axisY2, w: tlW2, h: 0.015, fill: { color: C.cardBorder }, line: { color: C.cardBorder, width: 0 } });
  s.addShape(pres.ShapeType.rect, { x: tlX2, y: axisY2 - 0.05, w: 0.02, h: 0.08, fill: { color: C.textMuted }, line: { color: C.textMuted, width: 0 } });

  const rowH2 = 0.24, rowGap2 = 0.10;
  const markerH2 = rowH2 * 3 + rowGap2 * 2 + 0.04;
  s.addShape(pres.ShapeType.rect, { x: mcX2-0.012, y: axisY2, w: 0.024, h: markerH2, fill: { color: C.cyan }, line: { color: C.cyan, width: 0 } });
  s.addShape(pres.ShapeType.rect, { x: mcX2-0.012, y: axisY2-0.05, w: 0.024, h: 0.08, fill: { color: C.cyan }, line: { color: C.cyan, width: 0 } });

  // Helper: render a timeline row label safely even when the bar width is 0 or tiny.
  // Falls back to placing the label next to the row baseline so PPT never gets a negative-width text box.
  const MIN_LABEL_W = 1.6;
  function drawTimelineLabel(text: string, barX: number, barY: number, barW: number, color: string) {
    if (barW >= MIN_LABEL_W) {
      s.addText(text, { x: barX+0.1, y: barY+0.03, w: barW-0.15, h: rowH2-0.04, fontFace: FONT, fontSize: 9, bold: true, color, margin: 0 });
    } else {
      // Place label to the right of the (possibly tiny) bar, clamped inside the card
      const lx = Math.min(barX + Math.max(barW, 0.05) + 0.05, col2 + cardW - MIN_LABEL_W - 0.1);
      s.addText(text, { x: lx, y: barY+0.03, w: MIN_LABEL_W, h: rowH2-0.04, fontFace: FONT, fontSize: 9, bold: true, color, margin: 0 });
    }
  }

  const r1Y = axisY2 + 0.06;
  const withinW2 = (within / incompleteN) * tlW2;
  if (withinW2 > 0.01) {
    s.addShape(pres.ShapeType.rect, { x: tlX2, y: r1Y, w: withinW2, h: rowH2, fill: { color: C.green }, line: { color: C.green, width: 0 } });
  }
  drawTimelineLabel(`Within MC Date  ·  ${within} items`, tlX2, r1Y, withinW2, C.textPrimary);

  const r2Y2 = r1Y + rowH2 + rowGap2;
  const beyondW2 = (beyond / incompleteN) * tlW2;
  if (withinW2 > 0.01) {
    s.addShape(pres.ShapeType.rect, { x: tlX2, y: r2Y2, w: withinW2, h: rowH2, fill: { color: '2A1020' }, line: { color: '2A1020', width: 0 } });
  }
  if (beyondW2 > 0.01) {
    s.addShape(pres.ShapeType.rect, { x: mcX2, y: r2Y2, w: beyondW2, h: rowH2, fill: { color: C.magentaBright }, line: { color: C.magentaBright, width: 0 } });
  }
  drawTimelineLabel(`Beyond  ·  ${beyond} items`, mcX2, r2Y2, beyondW2, C.textPrimary);

  const r3Y2 = r2Y2 + rowH2 + rowGap2;
  const noPlanW2 = (noPlan / incompleteN) * tlW2;
  if (noPlanW2 > 0.01) {
    s.addShape(pres.ShapeType.rect, { x: tlX2, y: r3Y2, w: noPlanW2, h: rowH2, fill: { color: '4A4A6A' }, line: { color: '4A4A6A', width: 0 } });
  }
  drawTimelineLabel(`No Plan  ·  ${noPlan} items`, tlX2, r3Y2, noPlanW2, C.textPrimary);

  drawFooter(pres, s, '02');
}

// ─────────────────────────────────────────
// SLIDE 03: T&C SNAPSHOT
// ─────────────────────────────────────────
export function buildSnapshot(pres: pptxgen, tncKPI: TncKPI) {
  const s = pres.addSlide();
  s.background = { color: C.bgBody };

  s.addText(`T&C  ·  SNAPSHOT  ·  ${fmtLong(tncKPI.dataDate)}`, {
    x: 0.5, y: 0.45, w: 6, h: 0.35, fontFace: FONT_MONO, fontSize: 11, color: C.cyan, charSpacing: 3,
  });
  s.addText('Worst-case simulation', { x: 7, y: 0.45, w: 4.1, h: 0.35, fontFace: FONT_MONO, fontSize: 10, color: C.textMuted, align: 'right' });

  const headlineDefault = tncKPI.testReport.pct < 1
    ? 'Tests running ahead — Test Report has not started.'
    : tncKPI.testReport.variance < -10
    ? `Tests ahead — Test Report critically behind at ${tncKPI.testReport.pct.toFixed(1)}%.`
    : 'Tests and reports are progressing.';
  const headline = T('tnc_snapshot', 'headline', headlineDefault);
  s.addText(headline, { x: 0.5, y: 0.85, w: 12, h: 0.8, fontFace: FONT, fontSize: 36, bold: true, color: C.textPrimary, margin: 0 });

  const cards: CardConfig[] = [
    {
      label: 'Days to Project Completion', bigNumber: String(tncKPI.daysToPC), unit: 'days',
      footer: `Completion ${fmtLong(tncKPI.dDay)}`, footerColor: C.cyan, numberColor: C.textPrimary,
      bg: C.cardBody, accentColor: null, alert: false,
    },
    {
      label: 'Pre-Test', bigNumber: tncKPI.preTest.pct.toFixed(1), unit: '%',
      footer: `${tncKPI.preTest.variance >= 0 ? '+' : ''}${tncKPI.preTest.variance.toFixed(1)}% vs plan`,
      footerColor: tncKPI.preTest.variance >= 0 ? C.green : C.magentaBright, numberColor: C.textPrimary,
      bg: C.cardBody, accentColor: C.stagePreTest, alert: false,
    },
    {
      label: 'Official Test', bigNumber: tncKPI.official.pct.toFixed(1), unit: '%',
      footer: `${tncKPI.official.variance >= 0 ? '+' : ''}${tncKPI.official.variance.toFixed(1)}% vs plan`,
      footerColor: tncKPI.official.variance >= 0 ? C.green : C.magentaBright, numberColor: C.textPrimary,
      bg: C.cardBody, accentColor: C.stageOfficial, alert: false,
    },
    {
      label: 'Test Report', bigNumber: tncKPI.testReport.pct.toFixed(1), unit: '%',
      footer: tncKPI.testReport.pct < 1
        ? `${tncKPI.total.toLocaleString()} reports outstanding`
        : `${tncKPI.testReport.variance.toFixed(1)}% vs plan`,
      footerColor: C.magentaBright, numberColor: C.magentaBright,
      bg: C.cardAlert, accentColor: C.stageTestReport, alert: tncKPI.testReport.pct < 30,
    },
  ];

  const cardW = 2.95, cardH = 2.2, startX = 0.5, startY = 2.0, gapX = 0.13;
  cards.forEach((c, i) => drawCard(pres, s, startX + i * (cardW + gapX), startY, cardW, cardH, c));

  drawFooter(pres, s, '03');
}

// ─────────────────────────────────────────
// SLIDE 04: T&C S-CURVE (Plan vs Actual)
// ─────────────────────────────────────────
export function buildPlanVsActual(pres: pptxgen, tncKPI: TncKPI) {
  const s = pres.addSlide();
  s.background = { color: C.bgBody };

  const pts = tncKPI.scurve;
  const startLabel = pts[0]     ? fmtDateShort(pts[0].date)                 : '';
  const endLabel   = pts.at(-1) ? fmtDateShort(pts.at(-1)!.date)            : '';

  s.addText('T&C  ·  TEST EXECUTION', {
    x: 0.5, y: 0.45, w: 6, h: 0.35, fontFace: FONT_MONO, fontSize: 11, color: C.cyan, charSpacing: 3,
  });
  s.addText(`Plan vs Actual · ${startLabel} → ${endLabel}`, {
    x: 7, y: 0.45, w: 4.1, h: 0.35, fontFace: FONT_MONO, fontSize: 10, color: C.textMuted, align: 'right',
  });

  const headlineDefault = tncKPI.testReport.pct < 1
    ? 'Tests are running ahead — reports have not started.'
    : `Tests ahead of plan — Test Report at ${tncKPI.testReport.pct.toFixed(1)}%.`;
  const headline = T('tnc_scurve', 'headline', headlineDefault);
  s.addText(headline, { x: 0.5, y: 0.85, w: 12.5, h: 0.8, fontFace: FONT, fontSize: 32, bold: true, color: C.textPrimary, margin: 0 });

  const cats    = pts.map((p, i) => i % 7 === 0 ? p.bucketLabel : '');
  const chartData = [
    { name: 'Pre-Test · Plan',       labels: cats, values: pts.map(p => p.t1PlanPct) },
    { name: 'Pre-Test · Actual',     labels: cats, values: pts.map(p => p.t1ActualPct) },
    { name: 'Official Test · Plan',  labels: cats, values: pts.map(p => p.t2PlanPct) },
    { name: 'Official Test · Actual',labels: cats, values: pts.map(p => p.t2ActualPct) },
    { name: 'Test Report · Plan',    labels: cats, values: pts.map(p => 0) }, // placeholder — actual R2S plan computed below
  ];

  // Test Report Plan: use snapshot planPct to interpolate if possible
  // Simple approach: zero until last data date, then ramp to 100 by dDay
  const lastActualIdx = pts.reduce((acc, p, i) => p.t1ActualPct != null ? i : acc, 0);
  chartData[4].values = pts.map((p, i) => {
    if (i < lastActualIdx) return 0;
    const remaining = pts.length - 1 - lastActualIdx;
    if (remaining <= 0) return 0;
    return ((i - lastActualIdx) / remaining) * 100;
  });

  const CX = 0.5, CY = 1.75, CW = 12.3, CH = 4.9;
  s.addChart('line' as pptxgen.CHART_NAME, chartData, {
    x: CX, y: CY, w: CW, h: CH,
    chartColors: [C.stagePreTest, C.stagePreTest, C.stageOfficial, C.stageOfficial, C.stageTestReport],
    lineSize: 2.5, lineSmooth: true, lineDataSymbol: 'none',
    showLegend: true, legendPos: 't', legendFontSize: 10, legendColor: C.textSecondary,
    catAxisLabelColor: C.textMuted, valAxisLabelColor: C.textMuted,
    catAxisLabelFontSize: 9, valAxisLabelFontSize: 9,
    catAxisLabelFrequency: 7 as unknown as string,
    valGridLine: { color: C.cardBorder, size: 0.5 }, catGridLine: { style: 'none' } as pptxgen.OptsChartGridLine,
    valAxisMaxVal: 100, valAxisMinVal: 0,
    valAxisLabelFormatCode: '0"%"',
    chartArea: { fill: { color: C.bgBody } }, plotArea: { fill: { color: C.bgBody } },
  });

  // Floating annotations
  const PLOT_L = CX + 0.75, PLOT_T = CY + 0.65;
  const PLOT_W = CW - 0.75 - 0.15, PLOT_H = CH - 0.65 - 0.65;

  let lastIdx = 0, lastT1 = 0, lastT2 = 0;
  pts.forEach((p, i) => {
    if (p.t1ActualPct != null) { lastIdx = i; lastT1 = p.t1ActualPct; lastT2 = p.t2ActualPct ?? 0; }
  });
  const nPts = pts.length;
  const xDD = PLOT_L + (lastIdx / Math.max(nPts - 1, 1)) * PLOT_W;
  const yT1 = PLOT_T + (1 - lastT1 / 100) * PLOT_H;
  const yT2 = PLOT_T + (1 - lastT2 / 100) * PLOT_H;

  s.addText(`${Math.round(lastT1)}%`, { x: xDD+0.15, y: yT1-0.18, w: 0.8, h: 0.28, fontFace: FONT, fontSize: 13, bold: true, color: C.stagePreTest, margin: 0 });
  s.addText(`${Math.round(lastT2)}%`, { x: xDD+0.15, y: yT2-0.18, w: 0.8, h: 0.28, fontFace: FONT, fontSize: 13, bold: true, color: C.stageOfficial, margin: 0 });

  const yT1Plan = PLOT_T + (1 - (pts[lastIdx]?.t1PlanPct ?? 0) / 100) * PLOT_H;
  const yT2Plan = PLOT_T + (1 - (pts[lastIdx]?.t2PlanPct ?? 0) / 100) * PLOT_H;
  const xVar = xDD - 2.3;
  // Stack variance label above the endpoint label to avoid overlap when plan & actual are close
  if (tncKPI.preTest.variance > 0) {
    const yVar1 = Math.min((yT1+yT1Plan)/2 - 0.18, yT1 - 0.55);
    s.addText(`▲ +${tncKPI.preTest.variance.toFixed(1)}%`, { x: xVar, y: yVar1, w: 1.8, h: 0.3, fontFace: FONT, fontSize: 13, bold: true, color: C.green, align: 'right', margin: 0 });
  }
  if (tncKPI.official.variance > 0) {
    const yVar2 = Math.min((yT2+yT2Plan)/2 - 0.18, yT2 - 0.55);
    s.addText(`▲ +${tncKPI.official.variance.toFixed(1)}%`, { x: xVar, y: yVar2, w: 1.8, h: 0.3, fontFace: FONT, fontSize: 13, bold: true, color: C.green, align: 'right', margin: 0 });
  }

  drawFooter(pres, s, '04');
}

// ─────────────────────────────────────────
// SLIDE 05: T&C FORECAST
// ─────────────────────────────────────────
export function buildForecast(pres: pptxgen, tncKPI: TncKPI) {
  const s = pres.addSlide();
  s.background = { color: C.bgBody };

  s.addText('T&C  ·  FORECAST  ·  PLANNED COMPLETION', { x: 0.5, y: 0.45, w: 7, h: 0.35, fontFace: FONT_MONO, fontSize: 11, color: C.cyan, charSpacing: 3 });
  s.addText('Planned % · ' + tncKPI.snapshots.map(sn => fmtDateShort(sn.date)).join(' → '), { x: 7, y: 0.45, w: 4.1, h: 0.35, fontFace: FONT_MONO, fontSize: 10, color: C.textMuted, align: 'right' });
  s.addText(T('tnc_forecast', 'headline', 'Plan trajectory by milestone date'), { x: 0.5, y: 0.85, w: 12.5, h: 0.8, fontFace: FONT, fontSize: 32, bold: true, color: C.textPrimary, margin: 0 });

  const snaps = tncKPI.snapshots;
  const milestones = snaps.map(sn => fmtDateShort(sn.date));

  const chartData = [
    { name: 'Pre-Test',      labels: milestones, values: snaps.map(sn => sn.t1.planPct) },
    { name: 'Official Test', labels: milestones, values: snaps.map(sn => sn.t2.planPct) },
    { name: 'Test Report',   labels: milestones, values: snaps.map(sn => sn.r2s.planPct) },
  ];

  s.addChart('bar' as pptxgen.CHART_NAME, chartData, {
    x: 0.5, y: 1.8, w: 12.3, h: 4.2,
    barDir: 'col', barGrouping: 'clustered', barOverlapPct: -25, barGapWidthPct: 200,
    chartColors: [C.stagePreTest, C.stageOfficial, C.stageTestReport],
    chartArea: { fill: { color: C.bgBody } }, plotArea: { fill: { color: C.bgBody } },
    catAxisLabelColor: C.textSecondary, valAxisLabelColor: C.textMuted,
    catAxisLabelFontSize: 16, valAxisLabelFontSize: 10,
    valGridLine: { color: C.cardBorder, size: 0.5 }, catGridLine: { style: 'none' } as pptxgen.OptsChartGridLine,
    valAxisMaxVal: 100, valAxisMinVal: 0, valAxisLabelFormatCode: '0"%"',
    showLegend: true, legendPos: 't', legendColor: C.textSecondary, legendFontSize: 12,
    showValue: true, dataLabelColor: C.textPrimary, dataLabelFontSize: 12, dataLabelFontBold: true,
    dataLabelFormatCode: '0"%"', dataLabelPosition: 'outEnd',
  });

  // Required pace strip
  const rp = tncKPI.requiredPace;
  if (rp) {
    const stripY = 6.25;
    s.addShape(pres.ShapeType.rect, { x: 0.5, y: stripY, w: 12.3, h: 0.65, fill: { color: C.cardBody }, line: { color: C.cardBorder, width: 0.5 } });
    s.addText([
      { text: 'Required daily pace to Completion  ·  ', options: { color: C.textMuted, italic: true, fontSize: 11 } },
      { text: '● ', options: { color: C.stagePreTest, fontSize: 14 } },
      { text: `Pre-Test ${Math.ceil(rp.preTestPerDay)}/day`, options: { color: C.textPrimary, bold: true } },
      { text: '      ', options: {} },
      { text: '● ', options: { color: C.stageOfficial, fontSize: 14 } },
      { text: `Official Test ${Math.ceil(rp.t2PerDay)}/day`, options: { color: C.textPrimary, bold: true } },
      { text: '      ', options: {} },
      { text: '● ', options: { color: C.stageTestReport, fontSize: 14 } },
      { text: `Test Report ${Math.ceil(rp.r2sPerDay)}/day`, options: { color: C.textPrimary, bold: true } },
    ] as pptxgen.TextProps[], { x: 0.5, y: stripY, w: 12.3, h: 0.65, fontFace: FONT, fontSize: 13, align: 'center', valign: 'middle' });
  }

  drawFooter(pres, s, '05');
}

// ─────────────────────────────────────────
// SLIDE 06: T&C ACTION PLAN
// ─────────────────────────────────────────
export function buildActionPlan(pres: pptxgen, tncKPI: TncKPI) {
  const s = pres.addSlide();
  s.background = { color: C.bgBody };

  const rp = tncKPI.requiredPace;
  const trigger = tncKPI.actionPlanTriggers.find(t => t.stage === 'testReport');
  const triggerLabel = trigger?.status === 'CRITICAL'
    ? `Test Report CRITICAL (${tncKPI.testReport.pct.toFixed(1)}%)`
    : trigger?.status === 'AT_RISK'
    ? `Test Report AT RISK (${tncKPI.testReport.pct.toFixed(1)}%)`
    : 'Test Report requires attention';
  const lastSnap = tncKPI.snapshots.at(-1);
  const planTarget = lastSnap?.r2s.planPct.toFixed(1) ?? '99.8';

  s.addText('T&C  ·  REPORTING RISK', { x: 0.5, y: 0.4, w: 6, h: 0.3, fontFace: FONT_MONO, fontSize: 11, color: C.magenta, charSpacing: 3 });
  s.addText(rp ? `Required pace · ${Math.ceil(rp.r2sPerDay)} / day` : '', { x: 7, y: 0.4, w: 4.1, h: 0.3, fontFace: FONT_MONO, fontSize: 10, color: C.textMuted, align: 'right' });
  s.addText(T('tnc_action_plan', 'headline', 'Test Report submission requires immediate start'), { x: 0.5, y: 0.75, w: 12.3, h: 0.65, fontFace: FONT, fontSize: 26, bold: true, color: C.textPrimary, margin: 0 });

  // Top 3 panels
  const topY = 1.55, topH = 1.7;
  const panels = [
    { x: 0.5,  label: 'Test Report — actual', big: `${tncKPI.testReport.pct.toFixed(1)}%`,       sub: `of ${tncKPI.total.toLocaleString()} reports required`, accent: C.stageTestReport, bg: C.cardAlert, border: C.cardAlertBorder },
    { x: 4.7,  label: 'Required pace',        big: rp ? `${Math.ceil(rp.r2sPerDay)}/day` : '—',  sub: rp ? `${rp.r2sRemaining.toLocaleString()} reports · ${rp.daysRemaining} days remaining` : '', accent: C.cyan, bg: C.cardBody, border: C.cardBorder },
    { x: 8.9,  label: `Plan target by ${lastSnap ? fmtDateShort(lastSnap.date) : '14-Jun'}`, big: `${planTarget}%`, sub: 'baseline plan, Test Report stream', accent: C.green, bg: C.cardBody, border: C.cardBorder },
  ];
  panels.forEach(p => {
    s.addShape(pres.ShapeType.rect, { x: p.x, y: topY, w: 3.9, h: topH, fill: { color: p.bg }, line: { color: p.border, width: 0.75 } });
    s.addShape(pres.ShapeType.rect, { x: p.x, y: topY, w: 3.9, h: 0.06, fill: { color: p.accent }, line: { color: p.accent, width: 0 } });
    s.addText(p.label, { x: p.x+0.2, y: topY+0.18, w: 3.5, h: 0.3, fontFace: FONT, fontSize: 11, color: p.accent });
    s.addText(p.big,   { x: p.x+0.2, y: topY+0.45, w: 3.5, h: 1.0, fontFace: FONT, fontSize: 60, bold: true, color: C.textPrimary, margin: 0, valign: 'middle' });
    s.addText(p.sub,   { x: p.x+0.2, y: topY+topH-0.42, w: 3.5, h: 0.3, fontFace: FONT, fontSize: 10, color: C.textSecondary });
  });

  // Action Plan
  const apY = 3.5;
  s.addText('ACTION PLAN', { x: 0.5, y: apY, w: 5, h: 0.3, fontFace: FONT_MONO, fontSize: 11, color: C.cyan, charSpacing: 3 });
  s.addText(`Triggered by: ${triggerLabel}`, { x: 7, y: apY, w: 4.1, h: 0.3, fontFace: FONT_MONO, fontSize: 9, color: C.textMuted, align: 'right', italic: true });

  const colY = apY + 0.4, colH = 2.85, colW = 6.1;
  s.addShape(pres.ShapeType.rect, { x: 0.5, y: colY, w: colW, h: colH, fill: { color: C.cardBody }, line: { color: C.cardBorder, width: 0.75 } });
  s.addText(T('tnc_action_plan', 'left_panel_title', 'Key Causes & Action Items'), { x: 0.7, y: colY+0.15, w: colW-0.4, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: C.cyan });
  s.addText([
    { text: 'Key Causes', options: { bold: true, color: C.textPrimary, fontSize: 12, breakLine: true } },
    { text: '   • [원인 1 — 작성 필요]', options: { color: C.textDim, italic: true, breakLine: true } },
    { text: '   • [원인 2 — 작성 필요]', options: { color: C.textDim, italic: true, breakLine: true } },
    { text: '', options: { breakLine: true } },
    { text: 'Action Items', options: { bold: true, color: C.textPrimary, fontSize: 12, breakLine: true } },
    { text: '   • [조치 1 — 작성 필요]', options: { color: C.textDim, italic: true, breakLine: true } },
    { text: '   • [조치 2 — 작성 필요]', options: { color: C.textDim, italic: true, breakLine: true } },
    { text: '   • [조치 3 — 작성 필요]', options: { color: C.textDim, italic: true } },
  ] as pptxgen.TextProps[], { x: 0.7, y: colY+0.55, w: colW-0.4, h: colH-0.65, fontFace: FONT, fontSize: 11, paraSpaceAfter: 4 });

  s.addShape(pres.ShapeType.rect, { x: 6.7, y: colY, w: colW, h: colH, fill: { color: C.cardBody }, line: { color: C.cardBorder, width: 0.75 } });
  s.addText(T('tnc_action_plan', 'right_panel_title', 'Cooperation Requests & Owners'), { x: 6.9, y: colY+0.15, w: colW-0.4, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: C.green });
  s.addText([
    { text: 'Cooperation Requests', options: { bold: true, color: C.textPrimary, fontSize: 12, breakLine: true } },
    { text: '   • [협조 요청 1 — 작성 필요]', options: { color: C.textDim, italic: true, breakLine: true } },
    { text: '   • [협조 요청 2 — 작성 필요]', options: { color: C.textDim, italic: true, breakLine: true } },
    { text: '', options: { breakLine: true } },
    { text: 'Owner / Deadline', options: { bold: true, color: C.textPrimary, fontSize: 12, breakLine: true } },
    { text: '   • [담당자 — 기한]', options: { color: C.textDim, italic: true, breakLine: true } },
    { text: '   • [담당자 — 기한]', options: { color: C.textDim, italic: true } },
  ] as pptxgen.TextProps[], { x: 6.9, y: colY+0.55, w: colW-0.4, h: colH-0.65, fontFace: FONT, fontSize: 11, paraSpaceAfter: 4 });

  drawFooter(pres, s, '06');
}

// ─────────────────────────────────────────
// SLIDE 07: DEFECT SNAPSHOT
// ─────────────────────────────────────────
export function buildDefectSnapshot(pres: pptxgen, defectKPI: DefectKPI) {
  const s = pres.addSlide();
  s.background = { color: C.bgBody };

  s.addText('DEFECT MANAGEMENT', { x: 0.5, y: 0.4, w: 7, h: 0.3, fontFace: FONT_MONO, fontSize: 11, color: C.stageOfficial, charSpacing: 3 });
  s.addText(`Actual %  ·  ${fmtLong(defectKPI.snapshots[0]?.date ?? '')}`, { x: 7, y: 0.4, w: 4.1, h: 0.3, fontFace: FONT_MONO, fontSize: 10, color: C.textMuted, align: 'right' });

  const headlineDefault = defectKPI.closure.variance <= -20
    ? 'Completion is ahead — Closure is critically behind plan.'
    : defectKPI.closure.variance < 0
    ? `Completion ahead — Closure behind plan by ${Math.abs(defectKPI.closure.variance).toFixed(1)}%.`
    : 'Defect completion and closure both on track.';
  const headline = T('defect_snapshot', 'headline', headlineDefault);
  s.addText(headline, { x: 0.5, y: 0.75, w: 12.3, h: 0.7, fontFace: FONT, fontSize: 30, bold: true, color: C.textPrimary, margin: 0 });

  const cards: CardConfig[] = [
    {
      label: 'Completion', bigNumber: defectKPI.completion.pct.toFixed(1), unit: '%',
      footer: `${defectKPI.completion.variance >= 0 ? '+' : ''}${defectKPI.completion.variance.toFixed(1)}% vs plan`,
      footerColor: defectKPI.completion.variance >= 0 ? C.green : C.magentaBright, numberColor: C.textPrimary,
      bg: C.cardBody, accentColor: C.stageOfficial, alert: false,
    },
    {
      label: 'Closure', bigNumber: defectKPI.closure.pct.toFixed(1), unit: '%',
      footer: `${defectKPI.closure.variance.toFixed(1)}% vs plan`,
      footerColor: C.magentaBright, numberColor: C.magentaBright,
      bg: C.cardAlert, accentColor: C.amber, alert: defectKPI.closure.variance <= -10,
    },
  ];
  const cardW = 5.9;
  cards.forEach((card, i) => drawCard(pres, s, 0.5 + i * (cardW + 0.4), 1.65, cardW, 2.2, card));

  // Required pace strip
  const rp = defectKPI.requiredPace;
  s.addShape(pres.ShapeType.rect, { x: 0.5, y: 4.1, w: 12.3, h: 1.8, fill: { color: C.cardBody }, line: { color: C.cardBorder, width: 0.75 } });
  s.addText('Required pace to Completion', { x: 0.7, y: 4.25, w: 12, h: 0.35, fontFace: FONT, fontSize: 12, color: C.textMuted });
  s.addText([
    { text: 'Completion ', options: { color: C.stageOfficial, bold: true } },
    { text: `${rp.completionPerDay.toFixed(1)}/day   `, options: { color: C.textPrimary, bold: true, fontSize: 18 } },
    { text: 'Closure ', options: { color: C.amber, bold: true } },
    { text: `${rp.closurePerDay.toFixed(1)}/day`, options: { color: C.magentaBright, bold: true, fontSize: 18 } },
  ] as pptxgen.TextProps[], { x: 0.7, y: 4.6, w: 12, h: 0.8, fontFace: FONT, fontSize: 14 });
  s.addText(`${rp.completionRemaining.toLocaleString()} completion · ${rp.closureRemaining.toLocaleString()} closure remaining over ${rp.daysRemaining} days`, {
    x: 0.7, y: 5.35, w: 12, h: 0.35, fontFace: FONT, fontSize: 11, color: C.textSecondary,
  });

  drawFooter(pres, s, '07');
}

// ─────────────────────────────────────────
// SLIDE 08: DEFECT S-CURVE (Plan vs Actual)
// ─────────────────────────────────────────
export function buildDefectPlanVsActual(pres: pptxgen, defectKPI: DefectKPI) {
  const s = pres.addSlide();
  s.background = { color: C.bgBody };

  const pts = defectKPI.scurve;
  s.addText('DEFECT MANAGEMENT  ·  PROGRESS TREND', { x: 0.5, y: 0.4, w: 8, h: 0.3, fontFace: FONT_MONO, fontSize: 11, color: C.stageOfficial, charSpacing: 3 });
  s.addText(`Plan vs Actual · ${fmtDateShort(pts[0]?.date ?? '')} → ${fmtDateShort(pts.at(-1)?.date ?? '')}`, { x: 7, y: 0.4, w: 4.1, h: 0.3, fontFace: FONT_MONO, fontSize: 10, color: C.textMuted, align: 'right' });

  const headlineDefault = defectKPI.closure.variance <= -20
    ? 'Completion is ahead — Closure is critically behind plan.'
    : defectKPI.closure.variance < 0
    ? `Completion ahead — Closure behind plan by ${Math.abs(defectKPI.closure.variance).toFixed(1)}%.`
    : 'Defect completion and closure both on track.';
  const headline = T('defect_scurve', 'headline', headlineDefault);
  s.addText(headline, { x: 0.5, y: 0.75, w: 12.3, h: 0.65, fontFace: FONT, fontSize: 28, bold: true, color: C.textPrimary, margin: 0 });

  const cats = pts.map((p, i) => i % 7 === 0 ? p.bucketLabel : '');
  const chartData = [
    { name: 'Completion · Plan',    labels: cats, values: pts.map(p => p.completionPlanPct) },
    { name: 'Completion · Actual',  labels: cats, values: pts.map(p => p.completionActualPct) },
    { name: 'Closure · Plan',       labels: cats, values: pts.map(p => p.closurePlanPct) },
    { name: 'Closure · Actual',     labels: cats, values: pts.map(p => p.closureActualPct) },
  ];

  s.addChart('line' as pptxgen.CHART_NAME, chartData, {
    x: 0.5, y: 1.55, w: 12.3, h: 4.9,
    chartColors: [C.stageOfficial, C.stageOfficial, C.amber, C.amber],
    lineDataSymbol: 'none', lineSmooth: true, lineSize: 2.5,
    showLegend: true, legendPos: 't', legendFontSize: 11, legendColor: C.textSecondary,
    valAxisMinVal: 0, valAxisMaxVal: 100, valAxisLabelFormatCode: '0"%"',
    valAxisLabelColor: C.textMuted, catAxisLabelColor: C.textSecondary,
    catAxisLabelFontSize: 10, catAxisLabelFrequency: 7 as unknown as string,
    valGridLine: { color: C.cardBorder, size: 0.5 }, catGridLine: { style: 'none' } as pptxgen.OptsChartGridLine,
    plotArea: { fill: { color: C.bgBody } }, chartArea: { fill: { color: C.bgBody } },
  });

  // Floating annotations
  const DCX = 0.5, DCY = 1.55, DCW = 12.3, DCH = 4.9;
  const DP_L = DCX + 0.75, DP_T = DCY + 0.65;
  const DP_W = DCW - 0.75 - 0.15, DP_H = DCH - 0.65 - 0.65;

  let dLastIdx = 0, dLastCompl = 0, dLastClos = 0;
  pts.forEach((p, i) => {
    if (p.completionActualPct != null) { dLastIdx = i; dLastCompl = p.completionActualPct; dLastClos = p.closureActualPct ?? 0; }
  });
  const dXDate = DP_L + (dLastIdx / Math.max(pts.length - 1, 1)) * DP_W;
  const dYCompl = DP_T + (1 - dLastCompl / 100) * DP_H;
  const dYClos  = DP_T + (1 - dLastClos  / 100) * DP_H;

  s.addText(`${Math.round(dLastCompl)}%`, { x: dXDate+0.1, y: dYCompl-0.2, w: 0.7, h: 0.28, fontFace: FONT, fontSize: 13, bold: true, color: C.stageOfficial, margin: 0 });
  s.addText(`${Math.round(dLastClos)}%`,  { x: dXDate+0.1, y: dYClos-0.2,  w: 0.7, h: 0.28, fontFace: FONT, fontSize: 13, bold: true, color: C.amber,         margin: 0 });

  const dComplPlan = pts[dLastIdx]?.completionPlanPct ?? 0;
  const dClosPlan  = pts[dLastIdx]?.closurePlanPct    ?? 0;
  const dYComplPlan = DP_T + (1 - dComplPlan / 100) * DP_H;
  const dYClosPlan  = DP_T + (1 - dClosPlan  / 100) * DP_H;
  const dXVar = dXDate - 1.9;

  if (defectKPI.completion.variance > 0) {
    s.addText(`▲ +${defectKPI.completion.variance.toFixed(1)}%`, { x: dXVar, y: (dYCompl+dYComplPlan)/2-0.18, w: 1.8, h: 0.3, fontFace: FONT, fontSize: 13, bold: true, color: C.green, align: 'right', margin: 0 });
  }
  const closVarText  = defectKPI.closure.variance < 0 ? `▼ ${defectKPI.closure.variance.toFixed(1)}%` : `▲ +${defectKPI.closure.variance.toFixed(1)}%`;
  const closVarColor = defectKPI.closure.variance < 0 ? C.magentaBright : C.green;
  s.addText(closVarText, { x: dXVar, y: (dYClos+dYClosPlan)/2-0.18, w: 1.8, h: 0.3, fontFace: FONT, fontSize: 13, bold: true, color: closVarColor, align: 'right', margin: 0 });

  drawFooter(pres, s, '08');
}

// ─────────────────────────────────────────
// SLIDE 09: DEFECT FORECAST
// ─────────────────────────────────────────
export function buildDefectForecast(pres: pptxgen, defectKPI: DefectKPI) {
  const s = pres.addSlide();
  s.background = { color: C.bgBody };

  s.addText('DEFECT  ·  FORECAST  ·  PLANNED COMPLETION', { x: 0.5, y: 0.4, w: 9, h: 0.3, fontFace: FONT_MONO, fontSize: 11, color: C.stageOfficial, charSpacing: 3 });
  s.addText('Planned %  ·  ' + defectKPI.snapshots.map(sn => fmtDateShort(sn.date)).join(' → '), { x: 7, y: 0.4, w: 4.1, h: 0.3, fontFace: FONT_MONO, fontSize: 10, color: C.textMuted, align: 'right' });

  const headlineDefault = defectKPI.closure.variance <= -20
    ? `Closure shortfall growing — ${defectKPI.requiredPace.closurePerDay.toFixed(0)}/day recovery required.`
    : 'Defect plan trajectory by milestone.';
  const headline = T('defect_forecast', 'headline', headlineDefault);
  s.addText(headline, { x: 0.5, y: 0.75, w: 12.3, h: 0.65, fontFace: FONT, fontSize: 26, bold: true, color: C.textPrimary, margin: 0 });

  const snaps = defectKPI.snapshots;
  const milestones = snaps.map(sn => fmtDateShort(sn.date));
  const chartData = [
    { name: 'Completion', labels: milestones, values: snaps.map(sn => sn.completion.planPct) },
    { name: 'Closure',    labels: milestones, values: snaps.map(sn => sn.closure.planPct) },
  ];

  s.addChart('bar' as pptxgen.CHART_NAME, chartData, {
    x: 0.5, y: 1.55, w: 12.3, h: 4.3,
    barDir: 'col', barGrouping: 'clustered', barOverlapPct: -25, barGapWidthPct: 200,
    chartColors: [C.stageOfficial, C.amber],
    showValue: true, dataLabelColor: C.textPrimary, dataLabelFontSize: 12, dataLabelFontBold: true,
    dataLabelFormatCode: '0"%"', dataLabelPosition: 'outEnd',
    valAxisMinVal: 0, valAxisMaxVal: 100, valAxisLabelFormatCode: '0"%"', valAxisLabelColor: C.textMuted,
    catAxisLabelColor: C.textSecondary, catAxisLabelFontSize: 16,
    valGridLine: { color: C.cardBorder, size: 0.5 }, catGridLine: { style: 'none' } as pptxgen.OptsChartGridLine,
    showLegend: true, legendPos: 't', legendColor: C.textSecondary, legendFontSize: 12,
    plotArea: { fill: { color: C.bgBody } }, chartArea: { fill: { color: C.bgBody } },
  });

  // Gap annotation
  const gapY = 5.95;
  const gapParts: pptxgen.TextProps[] = [
    { text: 'Gap vs Plan  ·  ', options: { color: C.textMuted, italic: true, fontSize: 11 } },
    ...snaps.flatMap((sn, i): pptxgen.TextProps[] => [
      { text: milestones[i] + '  ', options: { color: C.textMuted } },
      { text: `Completion ${sn.completion.gapPct >= 0 ? '+' : ''}${sn.completion.gapPct.toFixed(1)}%`, options: { color: sn.completion.gapPct >= 0 ? C.green : C.magentaBright, bold: true } },
      { text: '  /  ', options: { color: C.textMuted } },
      { text: `Closure ${sn.closure.gapPct >= 0 ? '+' : ''}${sn.closure.gapPct.toFixed(1)}%`, options: { color: sn.closure.gapPct >= 0 ? C.green : C.magentaBright, bold: true } },
      { text: i < snaps.length - 1 ? '     ' : '', options: { color: C.textMuted } },
    ]),
  ];
  s.addText(gapParts, { x: 0.5, y: gapY, w: 12.3, h: 0.35, fontFace: FONT, fontSize: 11, align: 'center' });

  // Required pace strip
  const rp = defectKPI.requiredPace;
  s.addShape(pres.ShapeType.rect, { x: 0.5, y: 6.35, w: 12.3, h: 0.65, fill: { color: C.cardBody }, line: { color: C.cardBorder, width: 0.5 } });
  s.addText([
    { text: 'Required daily pace  ·  ', options: { color: C.textMuted, italic: true, fontSize: 12 } },
    { text: '● ', options: { color: C.stageOfficial, fontSize: 14 } },
    { text: `Completion ${rp.completionPerDay.toFixed(1)}/day`, options: { color: C.textPrimary, bold: true, fontSize: 13 } },
    { text: '      ● ', options: { color: C.amber, fontSize: 14 } },
    { text: `Closure ${rp.closurePerDay.toFixed(1)}/day`, options: { color: C.magentaBright, bold: true, fontSize: 13 } },
  ] as pptxgen.TextProps[], { x: 0.5, y: 6.35, w: 12.3, h: 0.65, fontFace: FONT, align: 'center', valign: 'middle' });

  drawFooter(pres, s, '09');
}

// ─────────────────────────────────────────
// SLIDE 10: DEFECT ACTION PLAN
// ─────────────────────────────────────────
export function buildDefectActionPlan(pres: pptxgen, defectKPI: DefectKPI) {
  const s = pres.addSlide();
  s.background = { color: C.bgBody };
  const rp = defectKPI.requiredPace;

  s.addText('DEFECT  ·  REPORTING RISK', { x: 0.5, y: 0.4, w: 7, h: 0.3, fontFace: FONT_MONO, fontSize: 11, color: C.amber, charSpacing: 3 });
  s.addText(`Closure at ${defectKPI.closure.pct.toFixed(1)}% — ${rp.closurePerDay.toFixed(0)}/day required`, { x: 7, y: 0.4, w: 4.1, h: 0.3, fontFace: FONT_MONO, fontSize: 9, color: C.textMuted, align: 'right' });
  s.addText(T('defect_action_plan', 'headline', 'Defect Closure is critically behind'), { x: 0.5, y: 0.75, w: 12.3, h: 0.65, fontFace: FONT, fontSize: 30, bold: true, color: C.textPrimary, margin: 0 });

  // Top 3 panels
  const topY = 1.55, topH = 1.7;
  const panels = [
    { x: 0.5,  label: 'Closure — actual',   big: `${defectKPI.closure.pct.toFixed(1)}%`, sub: `of ${defectKPI.total.toLocaleString()} defects`,                                        accent: C.amber,  bg: C.cardAlert, border: C.amber },
    { x: 4.85, label: 'Required pace',       big: `${rp.closurePerDay.toFixed(0)}/day`,    sub: `${rp.closureRemaining.toLocaleString()} remaining · ${rp.daysRemaining} days`,         accent: C.cyan,   bg: C.cardBody,  border: C.cardBorder },
    { x: 9.2,  label: 'Completion — ahead',  big: `${defectKPI.completion.pct.toFixed(1)}%`, sub: `+${defectKPI.completion.variance.toFixed(1)}% ahead of plan`,                     accent: C.green,  bg: C.cardBody,  border: C.cardBorder },
  ];
  panels.forEach(p => {
    s.addShape(pres.ShapeType.rect, { x: p.x, y: topY, w: 4.05, h: topH, fill: { color: p.bg }, line: { color: p.border, width: 0.75 } });
    s.addShape(pres.ShapeType.rect, { x: p.x, y: topY, w: 4.05, h: 0.05, fill: { color: p.accent }, line: { color: p.accent, width: 0 } });
    s.addText(p.label, { x: p.x+0.2, y: topY+0.18, w: 3.65, h: 0.3, fontFace: FONT, fontSize: 11, color: p.accent });
    s.addText(p.big,   { x: p.x+0.2, y: topY+0.48, w: 3.65, h: 0.8, fontFace: FONT, fontSize: 44, bold: true, color: C.textPrimary, margin: 0, valign: 'middle' });
    s.addText(p.sub,   { x: p.x+0.2, y: topY+topH-0.42, w: 3.65, h: 0.35, fontFace: FONT, fontSize: 10, color: C.textSecondary });
  });

  // Action plan columns
  const apY = 3.5;
  s.addText('ACTION PLAN', { x: 0.5, y: apY, w: 5, h: 0.3, fontFace: FONT_MONO, fontSize: 11, color: C.cyan, charSpacing: 3 });
  s.addText(`Triggered by: Defect Closure at ${defectKPI.closure.pct.toFixed(1)}% · AT_RISK (−20%)`, { x: 6, y: apY, w: 6.83, h: 0.3, fontFace: FONT_MONO, fontSize: 9, color: C.textMuted, align: 'right', italic: true });

  const colY = apY + 0.4, colH = 2.85, colW = 6.0;
  s.addShape(pres.ShapeType.rect, { x: 0.5, y: colY, w: colW, h: colH, fill: { color: C.cardBody }, line: { color: C.amber, width: 0.75 } });
  s.addText(T('defect_action_plan', 'left_panel_title', 'Suggested Alternatives'), { x: 0.7, y: colY+0.15, w: colW-0.4, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: C.amber });
  s.addText([
    { text: `• Dedicate closure teams to ${Math.ceil(rp.closurePerDay * 14).toLocaleString()} closures in first 14 days (50% milestone).`, options: { breakLine: true, color: C.textSecondary } },
    { text: '', options: { breakLine: true } },
    { text: `• Prioritise Tier-1 and access-ready defects — ${Math.ceil(rp.closurePerDay * 7).toLocaleString()}/week minimum target.`, options: { breakLine: true, color: C.textSecondary } },
    { text: '', options: { breakLine: true } },
    { text: `• Completion teams (ahead by +${defectKPI.completion.variance.toFixed(1)}%) to pivot to assist closure from 01-Jun.`, options: { color: C.textSecondary } },
  ] as pptxgen.TextProps[], { x: 0.7, y: colY+0.58, w: colW-0.4, h: colH-0.7, fontFace: FONT, fontSize: 11, paraSpaceAfter: 2 });

  s.addShape(pres.ShapeType.rect, { x: 6.8, y: colY, w: colW+0.3, h: colH, fill: { color: C.cardBody }, line: { color: C.cardBorder, width: 0.75 } });
  s.addText(T('defect_action_plan', 'right_panel_title', 'Cooperation Requests & Owners'), { x: 7.0, y: colY+0.15, w: colW, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: C.green });
  s.addText([
    { text: 'Cooperation Requests', options: { bold: true, color: C.textPrimary, fontSize: 12, breakLine: true } },
    { text: '   • [협조 요청 — 작성 필요]', options: { color: C.textDim, italic: true, breakLine: true } },
    { text: '', options: { breakLine: true } },
    { text: 'Owner / Deadline', options: { bold: true, color: C.textPrimary, fontSize: 12, breakLine: true } },
    { text: '   • [담당자 — 기한]', options: { color: C.textDim, italic: true } },
  ] as pptxgen.TextProps[], { x: 7.0, y: colY+0.55, w: colW, h: colH-0.65, fontFace: FONT, fontSize: 11, paraSpaceAfter: 4 });

  drawFooter(pres, s, '10');
}

// ─────────────────────────────────────────
// SLIDE 11: CLOSE OUT DOCUMENTS
// ─────────────────────────────────────────
export function buildDocsSnapshot(pres: pptxgen, docsKPI: DocsKPI) {
  const s = pres.addSlide();
  s.background = { color: C.bgBody };

  s.addText('CLOSE OUT DOCUMENTS', { x: 0.5, y: 0.4, w: 7, h: 0.3, fontFace: FONT_MONO, fontSize: 11, color: C.cyan, charSpacing: 3 });
  s.addText('ABD · OMM · Warranty · Spare Parts', { x: 7, y: 0.4, w: 4.1, h: 0.3, fontFace: FONT_MONO, fontSize: 10, color: C.textMuted, align: 'right' });

  const abdSub    = docsKPI.abd.currentCounts['sub1_submission_date'] ?? 0;
  const abdApv    = docsKPI.abd.currentCounts['sub1_approval_date']   ?? 0;
  const abdApvPct = docsKPI.abd.pcts['sub1_approval_date']            ?? 0;
  const abdUr     = docsKPI.abd.statusCounts['under_review']          ?? 0;
  const abdNs     = docsKPI.abd.statusCounts['not_submitted']         ?? 0;

  const ommUr     = docsKPI.omm.statusCounts['under_review']  ?? 0;
  const ommSub    = docsKPI.omm.pcts['sub2_actual_date']       ?? 0;
  const ommUrPct  = docsKPI.omm.total > 0 ? (ommUr / docsKPI.omm.total) * 100 : 0;

  const warFinal  = docsKPI.warranty.pcts['final_actual_date']            ?? 0;
  const warHdec   = docsKPI.warranty.pcts['hdec_signing_actual_date']     ?? 0;
  const warSubcon = docsKPI.warranty.pcts['subcon_signing_actual_date']   ?? 0;

  const spDel   = docsKPI.sparePart.pcts['actual_delivery_date'] ?? 0;
  const spPo    = docsKPI.sparePart.pcts['actual_po_date']       ?? 0;
  const spConf  = docsKPI.sparePart.pcts['actual_confirm_date']  ?? 0;

  const headlineDefault = abdUr > 500
    ? 'ABD and OMM complete — Warranty and Spare Parts require urgent action.'
    : 'Document submissions progressing — Warranty and Spare Parts lagging.';
  const headline = T('docs_snapshot', 'headline', headlineDefault);
  s.addText(headline, { x: 0.5, y: 0.75, w: 12.3, h: 0.65, fontFace: FONT, fontSize: 24, bold: true, color: C.textPrimary, margin: 0 });

  function barRow(sx: number, sy: number, sw: number, pct: number, color: string) {
    s.addShape(pres.ShapeType.rect, { x: sx, y: sy, w: sw, h: 0.1, fill: { color: C.cardBorder }, line: { color: C.cardBorder, width: 0 } });
    const fw = Math.max(0.01, (pct / 100) * sw);
    s.addShape(pres.ShapeType.rect, { x: sx, y: sy, w: fw, h: 0.1, fill: { color }, line: { color, width: 0 } });
  }

  function kpiRow(sx: number, sy: number, sw: number, label: string, value: string, unit: string, color: string) {
    s.addText(label, { x: sx+0.15, y: sy, w: sw*0.55, h: 0.28, fontFace: FONT, fontSize: 11, color: C.textSecondary });
    s.addText(value + unit, { x: sx+sw-1.5, y: sy, w: 1.35, h: 0.28, fontFace: FONT, fontSize: 13, bold: true, color, align: 'right' });
  }

  const cW = 5.9, cH = 2.65;
  const positions: [number,number][] = [[0.5, 1.55], [6.9, 1.55], [0.5, 4.35], [6.9, 4.35]];

  const modules = [
    {
      name: 'ABD', subtitle: `${docsKPI.abd.total.toLocaleString()} as-built drawings`, accent: C.cyan,
      rows: [
        { label: 'Submitted',     val: abdSub.toLocaleString(), unit: ' dwgs', color: C.cyan,         isPct: false },
        { label: 'Approved',      val: abdApv.toLocaleString(), unit: ' dwgs', color: abdApvPct < 50 ? C.amber : C.green, isPct: false },
        { label: 'Under Review',  val: abdUr.toLocaleString(),  unit: ' dwgs', color: C.stageOfficial, isPct: false },
        { label: 'Not Submitted', val: abdNs.toLocaleString(),  unit: ' dwgs', color: C.magentaBright, isPct: false },
      ],
    },
    {
      name: 'OMM', subtitle: `${docsKPI.omm.total} operation & maintenance manuals`, accent: C.stageOfficial,
      rows: [
        { label: 'Submitted (Sub2)', val: ommSub.toFixed(1),   unit: '%', color: C.stageOfficial, isPct: true, pct: ommSub },
        { label: 'Under Review',     val: ommUrPct.toFixed(1), unit: '%', color: C.amber,         isPct: true, pct: ommUrPct },
      ],
    },
    {
      name: 'Warranty Deeds', subtitle: `${docsKPI.warranty.total} warranty deeds`, accent: C.amber,
      rows: [
        { label: 'Subcon Signed',     val: warSubcon.toFixed(1), unit: '%', color: C.textSecondary, isPct: true, pct: warSubcon },
        { label: 'HDEC Signed',       val: warHdec.toFixed(1),   unit: '%', color: C.cyan,          isPct: true, pct: warHdec },
        { label: 'Final Submission',  val: warFinal.toFixed(1),  unit: '%', color: warFinal < 50 ? C.magentaBright : C.green, isPct: true, pct: warFinal },
      ],
    },
    {
      name: 'Spare Parts', subtitle: `${docsKPI.sparePart.total} spare part items`, accent: C.magentaBright,
      rows: [
        { label: 'Confirmed', val: spConf.toFixed(1), unit: '%', color: spConf < 1 ? C.magentaBright : C.amber, isPct: true, pct: spConf },
        { label: 'PO Issued', val: spPo.toFixed(1),   unit: '%', color: spPo < 1   ? C.magentaBright : C.cyan,  isPct: true, pct: spPo },
        { label: 'Delivered', val: spDel.toFixed(1),  unit: '%', color: spDel < 1  ? C.magentaBright : C.green, isPct: true, pct: spDel },
      ],
    },
  ];

  positions.forEach(([cx, cy], i) => {
    const m = modules[i];
    s.addShape(pres.ShapeType.rect, { x: cx, y: cy, w: cW, h: cH, fill: { color: C.cardBody }, line: { color: C.cardBorder, width: 0.75 } });
    s.addShape(pres.ShapeType.rect, { x: cx, y: cy, w: cW, h: 0.04, fill: { color: m.accent }, line: { color: m.accent, width: 0 } });
    s.addText(m.name,     { x: cx+0.15, y: cy+0.1,  w: 3.5, h: 0.35, fontFace: FONT, fontSize: 14, bold: true, color: C.textPrimary });
    s.addText(m.subtitle, { x: cx+0.15, y: cy+0.46, w: cW-0.3, h: 0.25, fontFace: FONT, fontSize: 10, color: C.textMuted });
    let ry = cy + 0.72;
    m.rows.forEach(row => {
      kpiRow(cx, ry, cW, row.label, row.val, row.unit, row.color);
      if (row.isPct && 'pct' in row) {
        barRow(cx+0.15, ry+0.28, cW-0.3, row.pct as number, row.color);
        ry += 0.56;
      } else {
        ry += 0.44;
      }
    });
  });

  drawFooter(pres, s, '11');
}

// ─────────────────────────────────────────
// SLIDE 12: PUNCH LIST
// ─────────────────────────────────────────
export function buildPunchSnapshot(pres: pptxgen, punchKPI: PunchKPI, meta: ReportData['meta']) {
  const s = pres.addSlide();
  s.background = { color: C.bgBody };

  const sb       = punchKPI.statusBreakdown;
  const cdb      = punchKPI.completionDateBreakdown;
  const beyond   = cdb.beyondMcDate ?? 0;
  void punchKPI.monthlyBeyondSc; // reserved for future month breakdown
  const latest   = punchKPI.latestItems;
  const prog     = punchKPI.progressKpi;
  const risk     = punchKPI.riskKpi;
  const total    = punchKPI.total;

  const scDateStr = meta.mcDate;

  // ── Header (slide 3/7/10 pattern) ──
  s.addText('PUNCH LIST', {
    x: 0.5, y: 0.4, w: 6, h: 0.3,
    fontFace: FONT_MONO, fontSize: 11, color: C.stageTestReport, charSpacing: 3,
  });
  s.addText(
    T('punch_snapshot', 'deadline_label', `SC · Substantial Completion · ${fmtLong(scDateStr)}`),
    { x: 6, y: 0.4, w: 6.83, h: 0.3, fontFace: FONT_MONO, fontSize: 10, color: C.textMuted, align: 'right' },
  );

  // ── Headline ──
  const headlineDefault = beyond > 0
    ? `${sb.notStarted} items not started — ${beyond} will be over SC.`
    : prog.weightedVariancePct < -10
    ? `Progress behind plan by ${Math.abs(prog.weightedVariancePct).toFixed(1)}% — recovery required.`
    : `${total} punch items — all within Substantial Completion date.`;
  const headline = T('punch_snapshot', 'headline', headlineDefault);
  s.addText(headline, {
    x: 0.5, y: 0.8, w: 12.3, h: 0.65,
    fontFace: FONT, fontSize: 26, bold: true, color: C.textPrimary, margin: 0,
  });

  // ── Hero row: 3 cards (slide 3 pattern) ──
  const heroY = 1.55, heroH = 1.85, heroGap = 0.13;
  const heroW = (12.3 - 2 * heroGap) / 3;

  const completionAlert = prog.completionPct < 5 || prog.weightedVariancePct < -20;
  const beyondAlert = beyond > 0;
  const varianceSign = prog.weightedVariancePct >= 0 ? '+' : '';

  const heroCards: CardConfig[] = [
    {
      label: 'Completion',
      bigNumber: prog.completionPct.toFixed(1),
      unit: '%',
      footer: `${sb.completed} / ${total} items`,
      footerColor: completionAlert ? C.magentaBright : C.textSecondary,
      numberColor: completionAlert ? C.magentaBright : C.textPrimary,
      bg: completionAlert ? C.cardAlert : C.cardBody,
      accentColor: completionAlert ? C.magentaBright : C.green,
      alert: completionAlert,
    },
    {
      label: 'Weighted Actual',
      bigNumber: prog.weightedActualPct.toFixed(1),
      unit: '%',
      footer: `${varianceSign}${prog.weightedVariancePct.toFixed(1)}% vs plan ${prog.weightedPlannedPct.toFixed(1)}%`,
      footerColor: prog.weightedVariancePct >= 0 ? C.green : C.magentaBright,
      numberColor: C.textPrimary,
      bg: C.cardBody,
      accentColor: prog.weightedVariancePct >= 0 ? C.green : C.amber,
      alert: false,
    },
    {
      label: 'Beyond SC',
      bigNumber: String(beyond),
      unit: beyond === 1 ? 'item' : 'items',
      footer: beyondAlert ? 'scope review required' : 'all within SC date',
      footerColor: beyondAlert ? C.magentaBright : C.green,
      numberColor: beyondAlert ? C.magentaBright : C.textPrimary,
      bg: beyondAlert ? C.cardAlert : C.cardBody,
      accentColor: beyondAlert ? C.magentaBright : C.green,
      alert: beyondAlert,
    },
  ];
  heroCards.forEach((c, i) => drawCard(pres, s, 0.5 + i * (heroW + heroGap), heroY, heroW, heroH, c));

  // ── Detail row: 2 list cards (slide 11 pattern) ──
  const listY = heroY + heroH + 0.2, listH = 1.75;
  const listW = (12.3 - 0.25) / 2;

  const pct = (n: number) => total > 0 ? (n / total) * 100 : 0;

  type ListRow = { label: string; count: number; color: string };
  const statusRows: ListRow[] = [
    { label: 'Completed',   count: sb.completed,  color: C.green },
    { label: 'In Progress', count: sb.wip,        color: C.cyan },
    { label: 'Not Started', count: sb.notStarted, color: C.magentaBright },
  ];
  const riskRows: ListRow[] = [
    { label: 'Pre-Eng Blocked', count: risk.blocked,       color: C.amber },
    { label: 'Overdue',         count: risk.overdue,       color: C.magentaBright },
    { label: 'Critical Delay',  count: risk.criticalDelay, color: C.magentaBright },
  ];

  function drawListCard(cx: number, cy: number, title: string, accent: string, rows: ListRow[], alert: boolean) {
    // Card body + top stripe
    s.addShape(pres.ShapeType.rect, {
      x: cx, y: cy, w: listW, h: listH,
      fill: { color: alert ? C.cardAlert : C.cardBody },
      line: alert ? { color: C.cardAlertBorder, width: 1.5 } : { color: C.cardBorder, width: 0.75 },
    });
    s.addShape(pres.ShapeType.rect, {
      x: cx, y: cy, w: listW, h: alert ? 0.08 : 0.05,
      fill: { color: accent }, line: { color: accent, width: 0 },
    });
    s.addText(title, {
      x: cx + 0.25, y: cy + 0.2, w: listW - 0.5, h: 0.3,
      fontFace: FONT, fontSize: 13, bold: true, color: C.textPrimary,
    });
    // Rows
    const rowsTop = cy + 0.65;
    const rowH = (listH - 0.85) / rows.length;
    rows.forEach((r, i) => {
      const ry = rowsTop + i * rowH;
      s.addText(r.label, {
        x: cx + 0.25, y: ry, w: listW * 0.55, h: 0.28,
        fontFace: FONT, fontSize: 12, color: C.textSecondary,
      });
      const pctText = total > 0 ? `${r.count}  (${pct(r.count).toFixed(0)}%)` : `${r.count}`;
      s.addText(pctText, {
        x: cx + listW - 1.8, y: ry, w: 1.55, h: 0.28,
        fontFace: FONT, fontSize: 13, bold: true, color: r.color, align: 'right',
      });
      // Mini bar
      const barY = ry + 0.32;
      const barW = listW - 0.5;
      s.addShape(pres.ShapeType.rect, {
        x: cx + 0.25, y: barY, w: barW, h: 0.06,
        fill: { color: C.cardBorder }, line: { color: C.cardBorder, width: 0 },
      });
      const fw = Math.max(0.01, (pct(r.count) / 100) * barW);
      s.addShape(pres.ShapeType.rect, {
        x: cx + 0.25, y: barY, w: fw, h: 0.06,
        fill: { color: r.color }, line: { color: r.color, width: 0 },
      });
    });
  }

  drawListCard(0.5, listY, 'Status Mix', C.cyan, statusRows, false);
  drawListCard(0.5 + listW + 0.25, listY, 'Risk Watch', C.magentaBright, riskRows,
    risk.overdue > 0 || risk.criticalDelay > 0);

  // ── TOP 3 LATEST table ──
  const t3Y = listY + listH + 0.2;
  s.addText('TOP 3 LATEST  ·  Beyond SC  ·  Scope Review Required', {
    x: 0.5, y: t3Y, w: 10, h: 0.24,
    fontFace: FONT_MONO, fontSize: 11, color: C.magentaBright, charSpacing: 2,
  });
  s.addShape(pres.ShapeType.rect, {
    x: 0.5, y: t3Y + 0.27, w: 12.3, h: 0.015,
    fill: { color: C.cardBorder }, line: { color: C.cardBorder, width: 0 },
  });

  const rowItems = latest.length > 0
    ? latest.slice(0, 3).map((item, i) => ({ idx: i + 1, item }))
    : [1, 2, 3].map((n) => ({ idx: n, item: null as null | typeof latest[0] }));

  const ROW_H = 0.30;
  rowItems.forEach(({ idx, item }, i) => {
    const iy = t3Y + 0.32 + i * (ROW_H + 0.02);
    s.addShape(pres.ShapeType.rect, {
      x: 0.5, y: iy, w: 12.3, h: ROW_H,
      fill: { color: i % 2 === 0 ? C.cardBody : '0D1A35' },
      line: { color: C.cardBorder, width: 0.5 },
    });
    s.addText(String(idx), { x: 0.6, y: iy + 0.04, w: 0.35, h: 0.22, fontFace: FONT, fontSize: 12, bold: true, color: C.magentaBright });
    if (item) {
      s.addText(item.itemNo || '-', { x: 1.0, y: iy + 0.04, w: 1.5, h: 0.22, fontFace: FONT_MONO, fontSize: 9, color: C.textMuted });
      s.addText(item.description || '(no description)', { x: 2.6, y: iy + 0.04, w: 6.2, h: 0.22, fontFace: FONT, fontSize: 10, color: C.textPrimary });
      s.addText(item.discipline || '-', { x: 8.9, y: iy + 0.04, w: 2.0, h: 0.22, fontFace: FONT, fontSize: 9, color: C.textSecondary });
      s.addText(fmtLong(item.plannedCompletionDate) || '-', { x: 11.0, y: iy + 0.04, w: 1.8, h: 0.22, fontFace: FONT_MONO, fontSize: 9, color: C.magentaBright, align: 'right' });
    } else {
      s.addText('— Awaiting data —', { x: 1.0, y: iy + 0.04, w: 10, h: 0.22, fontFace: FONT, fontSize: 10, color: C.textMuted, italic: true });
    }
  });

  drawFooter(pres, s, '12');
}


// ─────────────────────────────────────────
// XML POST-PROCESSING (JSZip — replaces execSync+unzip)
// ─────────────────────────────────────────
const PLAN_SERIES_NAMES = [
  'Pre-Test · Plan',
  'Official Test · Plan',
  'Test Report · Plan',
  'Completion · Plan',
  'Closure · Plan',
];

async function postProcessXml(blob: Blob): Promise<Blob> {
  const zip = await JSZip.loadAsync(blob);

  const chartPaths = Object.keys(zip.files).filter(
    f => f.startsWith('ppt/charts/') && f.endsWith('.xml') && !zip.files[f].dir
  );

  for (const chartPath of chartPaths) {
    let xml = await zip.files[chartPath].async('string');

    const hasPlanSeries = PLAN_SERIES_NAMES.some(n => xml.includes(n));
    if (!hasPlanSeries) continue;

    // 1. Plan series → dashed line (prstDash val="solid" → "dash")
    for (const name of PLAN_SERIES_NAMES) {
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      xml = xml.replace(
        new RegExp(`(<c:ser>[\\s\\S]*?<c:v>${esc}<\\/c:v>[\\s\\S]*?<a:prstDash val=")solid("\\/>[\\s\\S]*?<\\/c:ser>)`, 'g'),
        '$1dash$2'
      );
    }

    // 2. dispBlanksAs span → gap  (Actual lines terminate at dataDate)
    xml = xml.replace(/<c:dispBlanksAs val="span"\/>/g, '<c:dispBlanksAs val="gap"/>');

    // 3. Per-series line widths: Plan 1.5pt (19050 EMU), Actual 3.5pt (44450 EMU)
    xml = xml.replace(/<c:ser>[\s\S]*?<\/c:ser>/g, serBlock => {
      const isPlan   = /·\s*Plan<\/c:v>/.test(serBlock);
      const isActual = /·\s*Actual<\/c:v>/.test(serBlock);
      if (!isPlan && !isActual) return serBlock;
      const emw = isPlan ? 19050 : 44450;
      return serBlock.replace(/(<a:ln\b[^>]*\bw=")[^"]*(")/g, `$1${emw}$2`);
    });

    // 4. Black text in data-label blocks → textSecondary (CADCFC)
    xml = xml.replace(
      /(<a:solidFill><a:srgbClr val=")000000("\/><\/a:solidFill>)/g,
      '$1CADCFC$2'
    );

    // 5. Legend font color (bare defRPr defaults to black in PPT)
    xml = xml.replace(
      /(<c:legend>[\s\S]*?<a:defRPr\b[^>]*>)(\s*<\/a:defRPr>)/g,
      '$1<a:solidFill><a:srgbClr val="CADCFC"/></a:solidFill>$2'
    );

    zip.file(chartPath, xml);
  }

  return zip.generateAsync({ type: 'blob' });
}

// ─────────────────────────────────────────
// MAIN: Build & download PPTX
// ─────────────────────────────────────────
export async function buildAndDownloadPpt(rd: ReportData): Promise<void> {
  const { tncKPI, defectKPI, docsKPI, punchKPI } = loadKPIs(rd);

  const pres = new pptxgen();
  pres.layout  = 'LAYOUT_WIDE';
  pres.author  = 'HDEC';
  pres.title   = 'SHAW TOWER Completion Management';

  if (tncKPI) buildCover(pres, tncKPI);
  if (tncKPI && defectKPI && docsKPI && punchKPI) buildDashboard(pres, tncKPI, defectKPI, docsKPI, punchKPI);
  if (tncKPI) {
    buildSnapshot(pres, tncKPI);
    buildPlanVsActual(pres, tncKPI);
    buildForecast(pres, tncKPI);
    buildActionPlan(pres, tncKPI);
  }
  if (defectKPI) {
    buildDefectSnapshot(pres, defectKPI);
    buildDefectPlanVsActual(pres, defectKPI);
    buildDefectForecast(pres, defectKPI);
    buildDefectActionPlan(pres, defectKPI);
  }
  if (docsKPI) buildDocsSnapshot(pres, docsKPI);
  if (punchKPI) buildPunchSnapshot(pres, punchKPI, rd.meta);

  // Write → Blob → JSZip XML post-processing → download
  const rawBlob = await pres.write({ outputType: 'blob' }) as Blob;
  const processedBlob = await postProcessXml(rawBlob);

  const url = URL.createObjectURL(processedBlob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = 'SHAW_External_v4.pptx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ─────────────────────────────────────────
// SLIDE ORCHESTRATION
// ─────────────────────────────────────────
export type BuiltInSlideKey =
  | 'cover' | 'dashboard'
  | 'tnc_snapshot' | 'tnc_scurve' | 'tnc_forecast' | 'tnc_action_plan'
  | 'defect_snapshot' | 'defect_scurve' | 'defect_forecast' | 'defect_action_plan'
  | 'docs_snapshot' | 'punch_snapshot';

// Allow custom (runtime-defined) slide keys alongside built-ins.
// eslint-disable-next-line @typescript-eslint/ban-types
export type SlideKey = BuiltInSlideKey | (string & {});

export const DEFAULT_SLIDE_ORDER: BuiltInSlideKey[] = [
  'cover', 'dashboard',
  'tnc_snapshot', 'tnc_scurve', 'tnc_forecast', 'tnc_action_plan',
  'defect_snapshot', 'defect_scurve', 'defect_forecast', 'defect_action_plan',
  'docs_snapshot', 'punch_snapshot',
];

export interface SlideConfigItem { key: string; enabled: boolean; }

export interface BuildPptOptions {
  data: ReportData;
  fontFamily?: string;
  fontMono?: string;
  fontDisplayName?: string;
  colors?: PptColorTokens;
  slideConfig?: SlideConfigItem[];
  textOverrides?: TextOverrideMap;
  /**
   * Module filter. When provided, only slides whose `category` is in this list
   * are rendered. `intro` and `overview` categories are always included if any
   * module is selected. When omitted, all enabled slides render (legacy behavior).
   */
  modules?: Array<'tnc' | 'defect' | 'docs' | 'punch' | 'custom'>;
}

export async function buildPpt(opts: BuildPptOptions): Promise<Blob> {
  const { data, fontFamily, fontMono, colors, slideConfig, textOverrides, modules } = opts;
  if (fontFamily) FONT = fontFamily;
  if (fontMono) FONT_MONO = fontMono;
  if (colors) Object.assign(C, colors);
  TEXT_OVERRIDES = textOverrides;

  // Load per-slide display options (best-effort; falls back to defaults).
  try {
    const { fetchAllSlideDisplayOptions } = await import('@/lib/slide-display-options');
    DISPLAY_OPTIONS = await fetchAllSlideDisplayOptions(true);
  } catch (err) {
    console.warn('[ppt-builder] display options unavailable:', err);
    DISPLAY_OPTIONS = {};
  }

  const { tncKPI, defectKPI, docsKPI, punchKPI } = loadKPIs(data);

  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.author = 'HDEC';
  pres.title  = 'SHAW TOWER Completion Management';

  const config = (slideConfig && slideConfig.length > 0)
    ? slideConfig
    : DEFAULT_SLIDE_ORDER.map(k => ({ key: k, enabled: true }));

  const runners: Record<BuiltInSlideKey, () => void> = {
    cover:              () => { if (tncKPI) buildCover(pres, tncKPI); },
    dashboard:          () => { if (tncKPI && defectKPI && docsKPI && punchKPI) buildDashboard(pres, tncKPI, defectKPI, docsKPI, punchKPI); },
    tnc_snapshot:       () => { if (tncKPI) buildSnapshot(pres, tncKPI); },
    tnc_scurve:         () => { if (tncKPI) buildPlanVsActual(pres, tncKPI); },
    tnc_forecast:       () => { if (tncKPI) buildForecast(pres, tncKPI); },
    tnc_action_plan:    () => { if (tncKPI) buildActionPlan(pres, tncKPI); },
    defect_snapshot:    () => { if (defectKPI) buildDefectSnapshot(pres, defectKPI); },
    defect_scurve:      () => { if (defectKPI) buildDefectPlanVsActual(pres, defectKPI); },
    defect_forecast:    () => { if (defectKPI) buildDefectForecast(pres, defectKPI); },
    defect_action_plan: () => { if (defectKPI) buildDefectActionPlan(pres, defectKPI); },
    docs_snapshot:      () => { if (docsKPI) buildDocsSnapshot(pres, docsKPI); },
    punch_snapshot:     () => { if (punchKPI) buildPunchSnapshot(pres, punchKPI, data.meta); },
  };

  // Load custom slides (runtime-defined via New Slide Generator).
  // Imported dynamically to avoid pulling supabase into this module's top-level graph
  // when used in non-browser contexts.
  let customMap = new Map<string, import('@/lib/custom-slide-spec').SlideSpec>();
  try {
    const [{ fetchCustomSlides }, { renderCustomSlide }, { loadSlideRegistry }] = await Promise.all([
      import('@/lib/custom-slides-cache'),
      import('@/lib/custom-slide-renderer'),
      import('@/lib/slide-registry'),
    ]);
    const customs = await fetchCustomSlides();
    customMap = new Map(customs.map(c => [c.key, c.spec]));
    const kpiBag = { tnc: tncKPI, defect: defectKPI, docs: docsKPI, punch: punchKPI, data, meta: data.meta };

    // Category filter (only applied when modules option is provided)
    const registry = await loadSlideRegistry();
    const isAllowed = (key: string): boolean => {
      if (!modules || modules.length === 0) return true;
      const cat = registry[key]?.category;
      if (!cat) return true; // unknown key — let downstream skip silently
      if (cat === 'intro' || cat === 'overview') return true;
      return (modules as string[]).includes(cat);
    };

    for (const item of config) {
      if (!item.enabled) continue;
      if (!isAllowed(item.key)) continue;
      CURRENT_SLIDE_KEY = item.key;
      const fn = (runners as Record<string, () => void>)[item.key];
      if (fn) {
        fn();
        continue;
      }
      const spec = customMap.get(item.key);
      if (spec) {
        try {
          renderCustomSlide({ pres, spec, kpis: kpiBag, C, FONT, FONT_MONO });
        } catch (err) {
          console.error(`[ppt-builder] custom slide ${item.key} failed:`, err);
        }
      }
    }
  } catch (err) {
    console.warn('[ppt-builder] custom slides unavailable, falling back to built-ins:', err);
    for (const item of config) {
      if (!item.enabled) continue;
      CURRENT_SLIDE_KEY = item.key;
      const fn = (runners as Record<string, () => void>)[item.key];
      if (fn) fn();
    }
  }
  CURRENT_SLIDE_KEY = '';

  const raw = await pres.write({ outputType: 'blob' }) as Blob;
  return await postProcessXml(raw);
}
