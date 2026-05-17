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
  s.addText('SHAW · Status Report', {
    x: 0.5, y: 7.1, w: 5, h: 0.3,
    fontFace: FONT_MONO, fontSize: 10, color: C.cyan,
  });
  s.addText(`Page ${pageNum}`, {
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
  } :