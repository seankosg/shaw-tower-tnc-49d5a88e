// PPT builder — renders a ReportData object into a .pptx Blob using pptxgenjs.
// The fontFamily parameter is applied to all text frames so installing the
// matching font file makes the deck render correctly in PowerPoint.

import pptxgen from 'pptxgenjs';
import type { ReportData } from '@/lib/report-builder';
import { DEFAULT_PPT_COLORS, type PptColorTokens } from '@/lib/design-tokens';

// Mutable per-build color holder. Assigned at the start of buildPpt() and read
// by the helper functions below. Safe because pptx generation is synchronous
// within a single buildPpt() call.
const C: PptColorTokens = { ...DEFAULT_PPT_COLORS };

function fmtPct(n: number | undefined): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '–';
  return `${n.toFixed(1)}%`;
}
function fmtSignedPct(n: number | undefined): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '–';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}
function varianceColor(n: number | undefined): string {
  if (n === undefined || n === null || Number.isNaN(n)) return C.textSecondary;
  return n >= 0 ? C.green : C.magentaBright;
}

export interface BuildPptOptions {
  data: ReportData;
  fontFamily: string;
  /** Display name shown on the cover ("Pretendard", "Malgun Gothic", etc.) */
  fontDisplayName?: string;
  /** Optional color overrides (loaded from `design_tokens`). */
  colors?: PptColorTokens;
}

export async function buildPpt(opts: BuildPptOptions): Promise<Blob> {
  const { data, fontFamily, colors } = opts;
  Object.assign(C, DEFAULT_PPT_COLORS, colors ?? {});
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5
  pptx.title = 'SHAW Tower — Completion Management Report';
  pptx.author = 'SHAW T&C Management System';

  const tFace = fontFamily;

  // ---------- Cover ----------
  {
    const s = pptx.addSlide();
    s.background = { color: C.bgBody };
    s.addText('SHAW TOWER', {
      x: 0.6, y: 2.4, w: 12, h: 0.8,
      fontFace: tFace, fontSize: 44, bold: true, color: C.textPrimary,
    });
    s.addText('Completion Management Status Report', {
      x: 0.6, y: 3.2, w: 12, h: 0.6,
      fontFace: tFace, fontSize: 24, color: C.textSecondary,
    });
    s.addText(
      `Generated: ${data.meta.generatedAt.slice(0, 10)}  ·  Project Completion: ${data.meta.mcDate}  ·  D-${data.meta.daysToCompletion}`,
      { x: 0.6, y: 4.1, w: 12, h: 0.4, fontFace: tFace, fontSize: 14, color: C.textSecondary },
    );
    s.addText(`Delay handling: ${data.meta.delayModeLabel}`, {
      x: 0.6, y: 4.5, w: 12, h: 0.3, fontFace: tFace, fontSize: 12, color: C.textMuted,
    });
  }

  // ---------- T&C ----------
  if (data.tnc) {
    addModuleHeader(pptx, tFace, 'T&C (Test & Commissioning)', `Data Date: ${data.tnc.dataDate}`);
    addTncSlide(pptx, tFace, data.tnc);
  }

  // ---------- Defect ----------
  if (data.defect) {
    addModuleHeader(pptx, tFace, 'Defect', `Data Date: ${data.defect.dataDate}`);
    addDefectSlide(pptx, tFace, data.defect);
  }

  // ---------- Docs ----------
  if (data.docs) {
    addModuleHeader(pptx, tFace, 'Docs (ABD / OMM / Warranty / Spare Part)', '');
    addDocsSlide(pptx, tFace, data.docs);
  }

  // ---------- Punch ----------
  if (data.punch) {
    addModuleHeader(pptx, tFace, 'Punch', '');
    addPunchSlide(pptx, tFace, data.punch);
  }

  // ---------- Closing ----------
  {
    const s = pptx.addSlide();
    s.background = { color: C.bgBody };
    s.addText('Thank You', {
      x: 0.6, y: 3.0, w: 12, h: 1.0,
      fontFace: tFace, fontSize: 48, bold: true, color: C.textPrimary, align: 'center',
    });
    s.addText('SHAW T&C Management System', {
      x: 0.6, y: 4.1, w: 12, h: 0.4,
      fontFace: tFace, fontSize: 14, color: C.textSecondary, align: 'center',
    });
  }

  const out = await pptx.write({ outputType: 'blob' });
  return out as Blob;
}

function addModuleHeader(pptx: pptxgen, tFace: string, title: string, subtitle: string) {
  const s = pptx.addSlide();
  s.background = { color: C.bgBody };
  s.addShape('rect', { x: 0, y: 0, w: 13.33, h: 1.1, fill: { color: C.cardBorder } });
  s.addText(title, {
    x: 0.5, y: 0.2, w: 12, h: 0.5,
    fontFace: tFace, fontSize: 24, bold: true, color: C.textPrimary,
  });
  if (subtitle) {
    s.addText(subtitle, {
      x: 0.5, y: 0.7, w: 12, h: 0.3,
      fontFace: tFace, fontSize: 12, color: C.textSecondary,
    });
  }
}

function addTncSlide(pptx: pptxgen, tFace: string, t: NonNullable<ReportData['tnc']>) {
  const s = pptx.addSlide();
  s.background = { color: C.bgBody };
  // Header
  s.addText('T&C — Current Status', {
    x: 0.5, y: 0.3, w: 12, h: 0.4,
    fontFace: tFace, fontSize: 20, bold: true, color: C.textPrimary,
  });
  s.addText(`Total Subtests: ${t.totals.total.toLocaleString()}`, {
    x: 0.5, y: 0.75, w: 12, h: 0.3, fontFace: tFace, fontSize: 12, color: C.textSecondary,
  });

  // Stage cards
  const stages: Array<{ label: string; done: number; plan: number; actualPct?: number; variancePct?: number }> = [
    { label: 'Pre-Test (T1)', done: t.totals.t1, plan: t.plannedToDate.t1, actualPct: t.currentActual?.preTestPct, variancePct: t.currentActual?.preTestVariancePct },
    { label: 'Official Test (T2)', done: t.totals.t2, plan: t.plannedToDate.t2, actualPct: t.currentActual?.officialTestPct, variancePct: t.currentActual?.officialTestVariancePct },
    { label: 'Test Report (R2)', done: t.totals.r2s, plan: t.plannedToDate.r2s, actualPct: t.currentActual?.testReportPct, variancePct: t.currentActual?.testReportVariancePct },
  ];

  const cardW = 4.0; const gap = 0.27; const startX = 0.5; const y = 1.3; const h = 2.4;
  stages.forEach((st, i) => {
    const x = startX + i * (cardW + gap);
    s.addShape('roundRect', { x, y, w: cardW, h, fill: { color: C.cardBody }, line: { color: C.cardBorder }, rectRadius: 0.08 });
    s.addText(st.label, { x: x + 0.25, y: y + 0.2, w: cardW - 0.5, h: 0.4, fontFace: tFace, fontSize: 14, bold: true, color: C.textPrimary });
    s.addText(fmtPct(st.actualPct), { x: x + 0.25, y: y + 0.6, w: cardW - 0.5, h: 0.9, fontFace: tFace, fontSize: 40, bold: true, color: C.textPrimary });
    s.addText(`Done ${st.done.toLocaleString()} / Plan ${st.plan.toLocaleString()}`, {
      x: x + 0.25, y: y + 1.55, w: cardW - 0.5, h: 0.3, fontFace: tFace, fontSize: 11, color: C.textSecondary,
    });
    s.addText(`Variance vs plan: ${fmtSignedPct(st.variancePct)}`, {
      x: x + 0.25, y: y + 1.85, w: cardW - 0.5, h: 0.3, fontFace: tFace, fontSize: 11, bold: true, color: varianceColor(st.variancePct),
    });
  });

  // Required pace
  if (t.requiredPace) {
    const r = t.requiredPace;
    s.addText('Required Pace to Completion', {
      x: 0.5, y: 4.0, w: 12, h: 0.4, fontFace: tFace, fontSize: 16, bold: true, color: C.textPrimary,
    });
    const rows = [
      ['Days remaining', String(r.daysRemaining)],
      ['Pre-Test', `${r.preTestRemaining.toLocaleString()} remaining  ·  ${r.preTestPerDay.toFixed(1)} / day`],
      ['Official Test', `${r.t2Remaining.toLocaleString()} remaining  ·  ${r.t2PerDay.toFixed(1)} / day`],
      ['Test Report', `${r.r2sRemaining.toLocaleString()} remaining  ·  ${r.r2sPerDay.toFixed(1)} / day`],
    ];
    rows.forEach(([k, v], i) => {
      const yy = 4.5 + i * 0.42;
      s.addText(k, { x: 0.6, y: yy, w: 3.0, h: 0.4, fontFace: tFace, fontSize: 12, color: C.textSecondary });
      s.addText(v, { x: 3.6, y: yy, w: 9, h: 0.4, fontFace: tFace, fontSize: 13, bold: true, color: C.textPrimary });
    });
  }

  // Action plan triggers (if any)
  if (t.actionPlanTriggers && t.actionPlanTriggers.length > 0) {
    const s2 = pptx.addSlide();
    s2.background = { color: C.textPrimary };
    s2.addText('T&C — Action Triggers', {
      x: 0.5, y: 0.3, w: 12, h: 0.4, fontFace: tFace, fontSize: 20, bold: true, color: C.textPrimary,
    });
    t.actionPlanTriggers.forEach((trig, i) => {
      const y = 1.0 + i * 0.95;
      const color = trig.status === 'CRITICAL' ? C.magentaBright : C.amber;
      s2.addShape('roundRect', { x: 0.5, y, w: 12.3, h: 0.8, fill: { color: C.cardBody }, line: { color }, rectRadius: 0.06 });
      s2.addText(`${trig.status} · ${trig.stage} (${fmtPct(trig.actualPct)})`, {
        x: 0.7, y: y + 0.1, w: 12, h: 0.3, fontFace: tFace, fontSize: 13, bold: true, color,
      });
      s2.addText(trig.reason, {
        x: 0.7, y: y + 0.4, w: 12, h: 0.4, fontFace: tFace, fontSize: 11, color: C.textPrimary,
      });
    });
  }
}

function addDefectSlide(pptx: pptxgen, tFace: string, d: NonNullable<ReportData['defect']>) {
  const s = pptx.addSlide();
  s.background = { color: C.bgBody };
  s.addText('Defect — Current Status', {
    x: 0.5, y: 0.3, w: 12, h: 0.4, fontFace: tFace, fontSize: 20, bold: true, color: C.textPrimary,
  });
  s.addText(`Total Defects: ${d.totals.total.toLocaleString()}`, {
    x: 0.5, y: 0.75, w: 12, h: 0.3, fontFace: tFace, fontSize: 12, color: C.textSecondary,
  });

  const stages = [
    { label: 'Completion', done: d.totals.completion, plan: d.plannedToDate.completion, actualPct: d.currentActual?.completionPct, variancePct: d.currentActual?.completionVariancePct },
    { label: 'Closure', done: d.totals.closure, plan: d.plannedToDate.closure, actualPct: d.currentActual?.closurePct, variancePct: d.currentActual?.closureVariancePct },
  ];
  const cardW = 6.1; const gap = 0.3; const y = 1.3; const h = 2.4;
  stages.forEach((st, i) => {
    const x = 0.5 + i * (cardW + gap);
    s.addShape('roundRect', { x, y, w: cardW, h, fill: { color: C.cardBody }, line: { color: C.cardBorder }, rectRadius: 0.08 });
    s.addText(st.label, { x: x + 0.3, y: y + 0.2, w: cardW - 0.6, h: 0.4, fontFace: tFace, fontSize: 14, bold: true, color: C.textPrimary });
    s.addText(fmtPct(st.actualPct), { x: x + 0.3, y: y + 0.6, w: cardW - 0.6, h: 0.9, fontFace: tFace, fontSize: 40, bold: true, color: C.textPrimary });
    s.addText(`Done ${st.done.toLocaleString()} / Plan ${st.plan.toLocaleString()}`, {
      x: x + 0.3, y: y + 1.55, w: cardW - 0.6, h: 0.3, fontFace: tFace, fontSize: 11, color: C.textSecondary,
    });
    s.addText(`Variance vs plan: ${fmtSignedPct(st.variancePct)}`, {
      x: x + 0.3, y: y + 1.85, w: cardW - 0.6, h: 0.3, fontFace: tFace, fontSize: 11, bold: true, color: varianceColor(st.variancePct),
    });
  });

  if (d.requiredPace) {
    const r = d.requiredPace;
    s.addText('Required Pace to Completion', {
      x: 0.5, y: 4.0, w: 12, h: 0.4, fontFace: tFace, fontSize: 16, bold: true, color: C.textPrimary,
    });
    const rows = [
      ['Days remaining', String(r.daysRemaining)],
      ['Completion', `${r.completionRemaining.toLocaleString()} remaining  ·  ${r.completionPerDay.toFixed(1)} / day`],
      ['Closure', `${r.closureRemaining.toLocaleString()} remaining  ·  ${r.closurePerDay.toFixed(1)} / day`],
    ];
    rows.forEach(([k, v], i) => {
      const yy = 4.5 + i * 0.42;
      s.addText(k, { x: 0.6, y: yy, w: 3.0, h: 0.4, fontFace: tFace, fontSize: 12, color: C.textSecondary });
      s.addText(v, { x: 3.6, y: yy, w: 9, h: 0.4, fontFace: tFace, fontSize: 13, bold: true, color: C.textPrimary });
    });
  }
}

function addDocsSlide(pptx: pptxgen, tFace: string, d: NonNullable<ReportData['docs']>) {
  const s = pptx.addSlide();
  s.background = { color: C.bgBody };
  s.addText('Docs — Totals & Status', {
    x: 0.5, y: 0.3, w: 12, h: 0.4, fontFace: tFace, fontSize: 20, bold: true, color: C.textPrimary,
  });
  const subs: Array<[string, ReturnType<() => NonNullable<ReportData['docs']>['abd']>]> = [
    ['As Built Drawing', d.abd], ['OMM', d.omm], ['Warranty', d.warranty], ['Spare Part', d.sparePart],
  ];
  const cardW = 3.0; const gap = 0.2; const y = 1.1; const h = 2.0;
  subs.forEach(([label, sub], i) => {
    const x = 0.5 + i * (cardW + gap);
    s.addShape('roundRect', { x, y, w: cardW, h, fill: { color: C.cardBody }, line: { color: C.cardBorder }, rectRadius: 0.08 });
    s.addText(label, { x: x + 0.2, y: y + 0.15, w: cardW - 0.4, h: 0.4, fontFace: tFace, fontSize: 13, bold: true, color: C.textPrimary });
    s.addText(sub.total.toLocaleString(), { x: x + 0.2, y: y + 0.55, w: cardW - 0.4, h: 0.7, fontFace: tFace, fontSize: 28, bold: true, color: C.textPrimary });
    s.addText('Total items', { x: x + 0.2, y: y + 1.3, w: cardW - 0.4, h: 0.3, fontFace: tFace, fontSize: 10, color: C.textSecondary });
  });

  // Status counts (ABD as example detail)
  if (d.abd.statusCounts) {
    s.addText('ABD — Status Breakdown', {
      x: 0.5, y: 3.5, w: 12, h: 0.4, fontFace: tFace, fontSize: 16, bold: true, color: C.textPrimary,
    });
    const entries = Object.entries(d.abd.statusCounts).slice(0, 6);
    entries.forEach(([k, v], i) => {
      const yy = 4.0 + Math.floor(i / 3) * 0.5;
      const xx = 0.6 + (i % 3) * 4.2;
      s.addText(k, { x: xx, y: yy, w: 2.4, h: 0.4, fontFace: tFace, fontSize: 12, color: C.textSecondary });
      s.addText(String(v), { x: xx + 2.4, y: yy, w: 1.6, h: 0.4, fontFace: tFace, fontSize: 13, bold: true, color: C.textPrimary });
    });
  }
}

function addPunchSlide(pptx: pptxgen, tFace: string, p: NonNullable<ReportData['punch']>) {
  const s = pptx.addSlide();
  s.background = { color: C.bgBody };
  s.addText('Punch — Current Status', {
    x: 0.5, y: 0.3, w: 12, h: 0.4, fontFace: tFace, fontSize: 20, bold: true, color: C.textPrimary,
  });
  s.addText(`Total: ${p.totals.total.toLocaleString()}`, {
    x: 0.5, y: 0.75, w: 12, h: 0.3, fontFace: tFace, fontSize: 12, color: C.textSecondary,
  });

  const cardW = 6.1; const gap = 0.3; const y = 1.3; const h = 2.4;
  // Completion card
  s.addShape('roundRect', { x: 0.5, y, w: cardW, h, fill: { color: C.cardBody }, line: { color: C.cardBorder }, rectRadius: 0.08 });
  s.addText('Completion', { x: 0.8, y: y + 0.2, w: cardW - 0.6, h: 0.4, fontFace: tFace, fontSize: 14, bold: true, color: C.textPrimary });
  s.addText(fmtPct(p.currentActual?.completionPct), { x: 0.8, y: y + 0.6, w: cardW - 0.6, h: 0.9, fontFace: tFace, fontSize: 40, bold: true, color: C.textPrimary });
  s.addText(`Done ${p.totals.completion.toLocaleString()} / Plan ${p.plannedToDate.completion.toLocaleString()}`, {
    x: 0.8, y: y + 1.55, w: cardW - 0.6, h: 0.3, fontFace: tFace, fontSize: 11, color: C.textSecondary,
  });
  s.addText(`Variance vs plan: ${fmtSignedPct(p.currentActual?.variancePct)}`, {
    x: 0.8, y: y + 1.85, w: cardW - 0.6, h: 0.3, fontFace: tFace, fontSize: 11, bold: true, color: varianceColor(p.currentActual?.variancePct),
  });

  // Status breakdown card
  if (p.statusBreakdown) {
    const x2 = 0.5 + cardW + gap;
    s.addShape('roundRect', { x: x2, y, w: cardW, h, fill: { color: C.cardBody }, line: { color: C.cardBorder }, rectRadius: 0.08 });
    s.addText('Status Breakdown', { x: x2 + 0.3, y: y + 0.2, w: cardW - 0.6, h: 0.4, fontFace: tFace, fontSize: 14, bold: true, color: C.textPrimary });
    const rows = [
      ['Completed', p.statusBreakdown.completed],
      ['WIP', p.statusBreakdown.wip],
      ['Not Started', p.statusBreakdown.notStarted],
    ];
    rows.forEach(([k, v], i) => {
      const yy = y + 0.7 + i * 0.5;
      s.addText(String(k), { x: x2 + 0.3, y: yy, w: 3.0, h: 0.4, fontFace: tFace, fontSize: 13, color: C.textSecondary });
      s.addText(String(v), { x: x2 + 3.3, y: yy, w: 2.5, h: 0.4, fontFace: tFace, fontSize: 16, bold: true, color: C.textPrimary });
    });
  }

  if (p.requiredPace) {
    const r = p.requiredPace;
    s.addText('Required Pace to Completion', {
      x: 0.5, y: 4.0, w: 12, h: 0.4, fontFace: tFace, fontSize: 16, bold: true, color: C.textPrimary,
    });
    s.addText(`Days remaining: ${r.daysRemaining}`, {
      x: 0.6, y: 4.5, w: 12, h: 0.4, fontFace: tFace, fontSize: 12, color: C.textPrimary,
    });
    s.addText(`Completion: ${r.completionRemaining.toLocaleString()} remaining · ${r.completionPerDay.toFixed(1)} / day`, {
      x: 0.6, y: 4.85, w: 12, h: 0.4, fontFace: tFace, fontSize: 12, color: C.textPrimary,
    });
  }
}
