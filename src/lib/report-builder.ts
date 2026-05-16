// Markdown status report builder.
// Aggregates per-module data directly from the backend and produces a
// structured Markdown document (and structured JSON) suitable for handing
// to an external LLM or for archival / external analysis.

import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, isValid } from 'date-fns';
import {
  simulateAllTncStages,
  addDays,
  type TncSimStage,
  type DelayMode,
} from '@/lib/tnc-simulation';
import { simulateAllDefectStages } from '@/lib/defect-simulation';
import { buildSCurve, type SubtestForDashboard } from '@/lib/dashboard-utils';
import { buildDefectSCurveAllStages } from '@/lib/defect-dashboard-utils';
import type { DefectItem } from '@/lib/defect-utils';
import type { DefectScheduleStage } from '@/lib/defect-schedule-utils';
import { TNC_RAW_DATA_GUIDE_MD } from '@/lib/tnc-raw-data-guide';

export type ReportModule = 'tnc' | 'defect' | 'docs' | 'punch';
export type ReportSection = 'dashboard' | 'progress' | 'simulation' | 'snapshots';

export interface ReportOptions {
  modules: ReportModule[];
  sections: ReportSection[];
  snapshotDates: string[]; // YYYY-MM-DD
  mcDate?: string;         // default 2026-06-15
  /** Delay handling for snapshot Predicted % (mirrors Simulation tab). Default 'penalty'. */
  delayMode?: DelayMode;
  /** Override Data Date (YYYY-MM-DD). When omitted, latest completed batch date is used. */
  dataDate?: string;
  /** Append the T&C Raw Data Business Guide as Appendix A. Default true when T&C module selected. */
  includeTncGuide?: boolean;
}

// ---------- structured JSON types ----------
export interface SimStageSnapshot {
  predictedPct: number;
  actualPct: number;
  planPct: number;
  gapPct: number;
  doneNow: number;
  forecastAdditional: number;
  predictedTotal: number;
  total: number;
}
export interface TncSnapshotEntry {
  date: string;
  t1: SimStageSnapshot;
  t2: SimStageSnapshot;
  r2s: SimStageSnapshot;
}
export interface DefectSnapshotEntry {
  date: string;
  start: SimStageSnapshot;
  completion: SimStageSnapshot;
  closure: SimStageSnapshot;
}
export interface TncCurrentActual {
  preTestPct: number;
  officialTestPct: number;
  testReportPct: number;
  preTestVariancePct: number;
  officialTestVariancePct: number;
  testReportVariancePct: number;
}
export interface TncScurvePoint {
  date: string;
  bucketLabel: string;
  t1PlanPct: number;
  t1ActualPct: number | null;
  t2PlanPct: number;
  t2ActualPct: number | null;
}
export interface TncActionPlanTrigger {
  stage: 'preTest' | 'officialTest' | 'testReport';
  status: 'CRITICAL' | 'AT_RISK';
  actualPct: number;
  reason: string;
}
export interface TncReportData {
  dataDate: string;
  totals: { total: number; t1: number; t2: number; r2s: number };
  plannedToDate: { t1: number; t2: number; r2s: number };
  currentActual?: TncCurrentActual;
  requiredPace?: { daysRemaining: number; preTestRemaining: number; t2Remaining: number; r2sRemaining: number; preTestPerDay: number; t2PerDay: number; r2sPerDay: number };
  snapshots?: TncSnapshotEntry[];
  scurve?: TncScurvePoint[];
  actionPlanTriggers?: TncActionPlanTrigger[];
}
export interface DefectScurvePoint {
  date: string;
  bucketLabel: string;
  completionPlanPct: number;
  completionActualPct: number | null;
  closurePlanPct: number;
  closureActualPct: number | null;
}
export interface DefectReportData {
  dataDate: string;
  totals: { total: number; completion: number; closure: number };
  plannedToDate: { completion: number; closure: number };
  currentActual?: {
    completionPct: number;
    closurePct: number;
    completionVariancePct: number;
    closureVariancePct: number;
  };
  requiredPace?: { daysRemaining: number; completionRemaining: number; closureRemaining: number; completionPerDay: number; closurePerDay: number };
  snapshots?: DefectSnapshotEntry[];
  scurve?: DefectScurvePoint[];
  actionPlanTriggers?: Array<{
    stage: 'completion' | 'closure';
    status: 'CRITICAL' | 'AT_RISK';
    actualPct: number;
    reason: string;
  }>;
}
export interface PunchReportData {
  totals: { total: number; completion: number };
  plannedToDate: { completion: number };
  currentActual?: {
    completionPct: number;
    variancePct: number;
  };
  requiredPace?: { daysRemaining: number; completionRemaining: number; completionPerDay: number };
  snapshots?: Array<{ date: string; total: number; completion: number; completionPct: number }>;
  actionPlanTriggers?: Array<{
    stage: 'completion';
    status: 'CRITICAL' | 'AT_RISK';
    actualPct: number;
    reason: string;
  }>;
}
export interface DocsTableSnapshot {
  date: string;
  total: number;
  /** counts per column key (column name → row count where date ≤ snapshot) */
  counts: Record<string, number>;
}
export interface DocsSubmoduleData {
  total: number;
  currentPcts?: Record<string, number>;
  currentCounts?: Record<string, number>;
  statusCounts?: Record<string, number>;
  snapshots?: DocsTableSnapshot[];
}
export interface DocsReportData {
  abd: DocsSubmoduleData;
  omm: DocsSubmoduleData;
  warranty: DocsSubmoduleData;
  sparePart: DocsSubmoduleData;
}
export interface ReportMeta {
  generatedAt: string;
  mcDate: string;
  daysToCompletion: number;
  delayMode: DelayMode;
  delayModeLabel: string;
  modules: ReportModule[];
  sections: ReportSection[];
  snapshotDates: string[];
  tncDataDate?: string;
  defectDataDate?: string;
  includesTncGuide: boolean;
}
export interface ReportData {
  meta: ReportMeta;
  tnc?: TncReportData;
  defect?: DefectReportData;
  docs?: DocsReportData;
  punch?: PunchReportData;
}

// ---------- helpers ----------
const MC_DEFAULT = '2026-06-15';

function pct(n: number, d: number): string {
  if (!d) return '0.0%';
  return ((n / d) * 100).toFixed(1) + '%';
}

function safeDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  try { const d = parseISO(s); return isValid(d) ? d : null; } catch { return null; }
}

function isOnOrBefore(actual: string | null | undefined, snapshot: string): boolean {
  if (!actual) return false;
  return actual <= snapshot;
}

function toSimSnap(r: { predictedPct: number; actualPct: number; planPct: number; doneActual: number; forecast: number; predicted: number; total: number }): SimStageSnapshot {
  return {
    predictedPct: r.predictedPct,
    actualPct: r.actualPct,
    planPct: r.planPct,
    gapPct: +(r.predictedPct - r.planPct).toFixed(1),
    doneNow: r.doneActual,
    forecastAdditional: r.forecast,
    predictedTotal: r.predicted,
    total: r.total,
  };
}

// ---------- T&C ----------
async function fetchTnc(): Promise<SubtestForDashboard[]> {
  const out: SubtestForDashboard[] = [];
  let from = 0; const size = 1000;
  while (true) {
    const { data, error } = await (supabase as any)
      .from('subtests').select('*').eq('is_active', true)
      .range(from, from + size - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as SubtestForDashboard[]));
    if (data.length < size) break;
    from += size;
  }
  return out;
}

async function resolveTncDataDate(override?: string): Promise<string> {
  if (override) return override;
  const { data } = await (supabase as any)
    .from('upload_batches').select('data_date').eq('status', 'completed')
    .not('data_date', 'is', null).order('data_date', { ascending: false })
    .limit(1).maybeSingle();
  return (data?.data_date as string | undefined) ?? format(new Date(), 'yyyy-MM-dd');
}

function computeTncData(rows: SubtestForDashboard[], opts: ReportOptions, dataDate: string): TncReportData {
  const today = format(new Date(), 'yyyy-MM-dd');
  const total = rows.length;
  const t1 = rows.filter(r => !!(r as any).t1_actual_date).length;
  const t2 = rows.filter(r => !!(r as any).t2_actual_date).length;
  const r2s = rows.filter(r => !!(r as any).r2_actual_submission_date).length;
  const planned = {
    t1: rows.filter(r => isOnOrBefore((r as any).t1_planned_date, today)).length,
    t2: rows.filter(r => isOnOrBefore((r as any).t2_planned_date, today)).length,
    r2s: rows.filter(r => isOnOrBefore((r as any).r2_target_submission_date, today)).length,
  };
  const r1 = (n: number) => +n.toFixed(1);
  const preTestPct = total ? r1((t1 / total) * 100) : 0;
  const officialTestPct = total ? r1((t2 / total) * 100) : 0;
  const testReportPct = total ? r1((r2s / total) * 100) : 0;
  const preTestVariancePct = total ? r1(((t1 - planned.t1) / total) * 100) : 0;
  const officialTestVariancePct = total ? r1(((t2 - planned.t2) / total) * 100) : 0;
  const testReportVariancePct = total ? r1(((r2s - planned.r2s) / total) * 100) : 0;
  const currentActual: TncCurrentActual = {
    preTestPct,
    officialTestPct,
    testReportPct,
    preTestVariancePct,
    officialTestVariancePct,
    testReportVariancePct,
  };
  const triggers: TncActionPlanTrigger[] = [];
  const evalStage = (stage: TncActionPlanTrigger['stage'], label: string, actualPct: number, variancePct: number) => {
    if (actualPct < 1.0) {
      triggers.push({ stage, status: 'CRITICAL', actualPct, reason: `${label} has not started` });
    } else if (variancePct < -20) {
      triggers.push({ stage, status: 'AT_RISK', actualPct, reason: `${label} is behind plan by ${Math.abs(variancePct).toFixed(1)}%` });
    }
  };
  evalStage('preTest', 'preTest', preTestPct, preTestVariancePct);
  evalStage('officialTest', 'officialTest', officialTestPct, officialTestVariancePct);
  evalStage('testReport', 'testReport', testReportPct, testReportVariancePct);

  const data: TncReportData = {
    dataDate,
    totals: { total, t1, t2, r2s },
    plannedToDate: planned,
    currentActual,
    actionPlanTriggers: triggers,
  };
  if (opts.sections.includes('simulation')) {
    const mc = opts.mcDate ?? MC_DEFAULT;
    const days = Math.max(1, Math.ceil((+new Date(mc) - Date.now()) / 86400000));
    const remT1 = total - t1;
    const remT2 = total - t2;
    const remR2S = total - r2s;
    data.requiredPace = {
      daysRemaining: days,
      preTestRemaining: remT1,
      t2Remaining: remT2,
      r2sRemaining: remR2S,
      preTestPerDay: +(remT1 / days).toFixed(2),
      t2PerDay: +(remT2 / days).toFixed(2),
      r2sPerDay: +(remR2S / days).toFixed(2),
    };
  }
  if (opts.sections.includes('snapshots')) {
    const mode: DelayMode = opts.delayMode ?? 'penalty';
    const stages: TncSimStage[] = ['t1', 't2', 'r2s'];
    data.snapshots = opts.snapshotDates.map(d => {
      const r = simulateAllTncStages(rows, d, { mode, dataDate, enforceSequential: true }, stages);
      return { date: d, t1: toSimSnap(r.t1), t2: toSimSnap(r.t2), r2s: toSimSnap(r.r2s) };
    });
  }
  return data;
}

function renderTncMd(d: TncReportData, opts: ReportOptions): string {
  const mode: DelayMode = opts.delayMode ?? 'penalty';
  const modeLabel = mode === 'penalty' ? 'Worst Case' : 'Best Case';
  const { total, t1, t2, r2s } = d.totals;
  const planned = d.plannedToDate;
  const lines: string[] = [];
  lines.push('## 1. T&C Management');
  if (opts.sections.includes('dashboard')) {
    lines.push('### 1.1 Dashboard');
    lines.push(`- Total subtests (active): **${total}**`);
    lines.push(`- Pre-Test (T1) completed: ${t1} (${pct(t1, total)})`);
    lines.push(`- Official Test (T2) completed: ${t2} (${pct(t2, total)})`);
    lines.push(`- Test Report (R2) completed: ${r2s} (${pct(r2s, total)})`);
    lines.push('');
  }
  if (opts.sections.includes('progress')) {
    lines.push('### 1.2 Current Status (Stages: Pre-Test, Official Test, Test Report)');
    lines.push('| Stage | Planned to date | Actual to date | Actual % | Gap (Actual − Planned) |');
    lines.push('|-------|-----------------|----------------|----------|------------------------|');
    lines.push(`| Pre-Test (T1) | ${planned.t1} | ${t1} | ${pct(t1, total)} | ${t1 - planned.t1} |`);
    lines.push(`| Official Test (T2) | ${planned.t2} | ${t2} | ${pct(t2, total)} | ${t2 - planned.t2} |`);
    lines.push(`| Test Report (R2) | ${planned.r2s} | ${r2s} | ${pct(r2s, total)} | ${r2s - planned.r2s} |`);
    lines.push('');
  }
  if (opts.sections.includes('simulation') && d.requiredPace) {
    const p = d.requiredPace;
    lines.push('### 1.3 Plan — Required Pace toward Project Completion (' + (opts.mcDate ?? MC_DEFAULT) + ')');
    lines.push(`- Days remaining to Project Completion: **${p.daysRemaining}**`);
    lines.push(`- Actual Test remaining: ${p.t2Remaining} → required pace: ${p.t2PerDay.toFixed(2)} / day`);
    lines.push(`- Test Report remaining: ${p.r2sRemaining} → required pace: ${p.r2sPerDay.toFixed(2)} / day`);
    lines.push('');
  }
  if (opts.sections.includes('snapshots') && d.snapshots) {
    lines.push('### 1.4 Plan — Stage Progress Snapshots');
    lines.push(`_Plan computed via Simulation engine — mode: **${modeLabel}**, data date: **${d.dataDate}**, sequential: enforced._`);
    lines.push('| Date | Pre-Test Planned % (Actual %) | Actual Test Planned % (Actual %) | Test Report Planned % (Actual %) |');
    lines.push('|------|-------------------------------|----------------------------------|----------------------------------|');
    for (const s of d.snapshots) {
      const cell = (x: SimStageSnapshot) => `${x.predictedPct.toFixed(1)}% (${x.actualPct.toFixed(1)}%)`;
      lines.push(`| ${s.date} | ${cell(s.t1)} | ${cell(s.t2)} | ${cell(s.r2s)} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ---------- Defect ----------
async function fetchDefects(): Promise<DefectItem[]> {
  const out: DefectItem[] = [];
  let from = 0; const size = 1000;
  while (true) {
    const { data, error } = await (supabase as any)
      .from('defect_items').select('*').eq('is_active', true)
      .range(from, from + size - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as DefectItem[]));
    if (data.length < size) break;
    from += size;
  }
  return out;
}

async function resolveDefectDataDate(override?: string): Promise<string> {
  if (override) return override;
  const { data } = await (supabase as any)
    .from('defect_upload_batches').select('data_date').eq('status', 'completed')
    .not('data_date', 'is', null).order('data_date', { ascending: false })
    .limit(1).maybeSingle();
  return (data?.data_date as string | undefined) ?? format(new Date(), 'yyyy-MM-dd');
}

function computeDefectData(rows: DefectItem[], opts: ReportOptions, dataDate: string): DefectReportData {
  const today = format(new Date(), 'yyyy-MM-dd');
  const total = rows.length;
  const completion = rows.filter(r => !!(r as any).actual_completion_date).length;
  const closure = rows.filter(r => !!(r as any).actual_closure_date).length;
  const planned = {
    completion: rows.filter(r => isOnOrBefore((r as any).planned_completion_date, today)).length,
    closure: rows.filter(r => isOnOrBefore((r as any).planned_closure_date, today)).length,
  };
  const data: DefectReportData = {
    dataDate,
    totals: { total, completion, closure },
    plannedToDate: planned,
  };
  if (opts.sections.includes('simulation')) {
    const mc = opts.mcDate ?? MC_DEFAULT;
    const days = Math.max(1, Math.ceil((+new Date(mc) - Date.now()) / 86400000));
    data.requiredPace = {
      daysRemaining: days,
      completionRemaining: total - completion,
      closureRemaining: total - closure,
      completionPerDay: +((total - completion) / days).toFixed(2),
      closurePerDay: +((total - closure) / days).toFixed(2),
    };
  }
  if (opts.sections.includes('snapshots')) {
    const mode: DelayMode = opts.delayMode ?? 'penalty';
    const stages: DefectScheduleStage[] = ['start', 'completion', 'closure'];
    data.snapshots = opts.snapshotDates.map(d => {
      const r = simulateAllDefectStages(rows, d, { mode, dataDate }, stages);
      return { date: d, start: toSimSnap(r.start), completion: toSimSnap(r.completion), closure: toSimSnap(r.closure) };
    });
  }
  {
    const r1 = (n: number) => Math.round(n * 10) / 10;
    data.currentActual = total ? {
      completionPct:         r1((completion / total) * 100),
      closurePct:            r1((closure / total) * 100),
      completionVariancePct: r1(((completion - planned.completion) / total) * 100),
      closureVariancePct:    r1(((closure    - planned.closure)    / total) * 100),
    } : { completionPct: 0, closurePct: 0, completionVariancePct: 0, closureVariancePct: 0 };
    data.actionPlanTriggers = [];
    const defectChecks = [
      { stage: 'completion' as const, pct: data.currentActual.completionPct, v: data.currentActual.completionVariancePct },
      { stage: 'closure'    as const, pct: data.currentActual.closurePct,    v: data.currentActual.closureVariancePct },
    ];
    for (const c of defectChecks) {
      if (c.pct < 1.0) {
        data.actionPlanTriggers.push({ stage: c.stage, status: 'CRITICAL', actualPct: c.pct, reason: `${c.stage} has not started` });
      } else if (c.v <= -20) {
        data.actionPlanTriggers.push({ stage: c.stage, status: 'AT_RISK', actualPct: c.pct, reason: `${c.stage} is behind plan by ${Math.abs(c.v).toFixed(1)}%` });
      }
    }
  }
  return data;
}

function renderDefectMd(d: DefectReportData, opts: ReportOptions): string {
  const mode: DelayMode = opts.delayMode ?? 'penalty';
  const modeLabel = mode === 'penalty' ? 'Worst Case' : 'Best Case';
  const { total, completion, closure } = d.totals;
  const planned = d.plannedToDate;
  const lines: string[] = [];
  lines.push('## 2. Defect Management');
  if (opts.sections.includes('dashboard')) {
    lines.push('### 2.1 Dashboard');
    lines.push(`- Total defects (active): **${total}**`);
    lines.push(`- Completion done: ${completion} (${pct(completion, total)})`);
    lines.push(`- Closure done: ${closure} (${pct(closure, total)})`);
    lines.push('');
  }
  if (opts.sections.includes('progress')) {
    lines.push('### 2.2 Current Status (Stages: Completion, Closure)');
    lines.push('| Stage | Planned to date | Actual to date | Actual % | Gap |');
    lines.push('|-------|-----------------|----------------|----------|-----|');
    lines.push(`| Completion | ${planned.completion} | ${completion} | ${pct(completion, total)} | ${completion - planned.completion} |`);
    lines.push(`| Closure | ${planned.closure} | ${closure} | ${pct(closure, total)} | ${closure - planned.closure} |`);
    lines.push('');
  }
  if (opts.sections.includes('simulation') && d.requiredPace) {
    const p = d.requiredPace;
    lines.push('### 2.3 Plan — Required Pace toward Project Completion (' + (opts.mcDate ?? MC_DEFAULT) + ')');
    lines.push(`- Days remaining to Project Completion: **${p.daysRemaining}**`);
    lines.push(`- Completion remaining: ${p.completionRemaining} → required: ${p.completionPerDay.toFixed(2)} / day`);
    lines.push(`- Closure remaining: ${p.closureRemaining} → required: ${p.closurePerDay.toFixed(2)} / day`);
    lines.push('');
  }
  if (opts.sections.includes('snapshots') && d.snapshots) {
    lines.push('### 2.4 Plan — Stage Progress Snapshots');
    lines.push(`_Plan computed via Simulation engine — mode: **${modeLabel}**, data date: **${d.dataDate}**._`);
    lines.push('| Date | Start Planned % (Actual %) | Completion Planned % (Actual %) | Closure Planned % (Actual %) |');
    lines.push('|------|----------------------------|---------------------------------|------------------------------|');
    for (const s of d.snapshots) {
      const cell = (x: SimStageSnapshot) => `${x.predictedPct.toFixed(1)}% (${x.actualPct.toFixed(1)}%)`;
      lines.push(`| ${s.date} | ${cell(s.start)} | ${cell(s.completion)} | ${cell(s.closure)} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ---------- Punch ----------
interface PunchRow {
  actual_completion_date: string | null;
  planned_completion_date: string | null;
  completion_status: string | null;
}

async function fetchPunch(): Promise<PunchRow[]> {
  const out: PunchRow[] = [];
  let from = 0; const size = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('punch_items')
      .select('actual_completion_date,planned_completion_date,completion_status')
      .eq('is_active', true)
      .range(from, from + size - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as PunchRow[]));
    if (data.length < size) break;
    from += size;
  }
  return out;
}

function punchSnapshot(rows: PunchRow[], snap: string) {
  const total = rows.length;
  const completion = rows.filter(r => isOnOrBefore(r.actual_completion_date, snap)).length;
  return { total, completion };
}

function computePunchData(rows: PunchRow[], opts: ReportOptions): PunchReportData {
  const today = format(new Date(), 'yyyy-MM-dd');
  const cur = punchSnapshot(rows, today);
  const planned = rows.filter(r => isOnOrBefore(r.planned_completion_date, today)).length;
  const data: PunchReportData = {
    totals: cur,
    plannedToDate: { completion: planned },
  };
  if (opts.sections.includes('simulation')) {
    const mc = opts.mcDate ?? MC_DEFAULT;
    const days = Math.max(1, Math.ceil((+new Date(mc) - Date.now()) / 86400000));
    data.requiredPace = {
      daysRemaining: days,
      completionRemaining: cur.total - cur.completion,
      completionPerDay: +((cur.total - cur.completion) / days).toFixed(2),
    };
  }
  if (opts.sections.includes('snapshots')) {
    data.snapshots = opts.snapshotDates.map(d => {
      const s = punchSnapshot(rows, d);
      return { date: d, total: s.total, completion: s.completion, completionPct: s.total ? +((s.completion / s.total) * 100).toFixed(1) : 0 };
    });
  }
  {
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const completionPct = cur.total ? r1((cur.completion / cur.total) * 100) : 0;
    const variancePct   = cur.total ? r1(((cur.completion - planned) / cur.total) * 100) : 0;
    data.currentActual = { completionPct, variancePct };
    data.actionPlanTriggers = [];
    if (completionPct < 1.0) {
      data.actionPlanTriggers.push({ stage: 'completion', status: 'CRITICAL', actualPct: completionPct, reason: 'completion has not started' });
    } else if (variancePct < -20) {
      data.actionPlanTriggers.push({ stage: 'completion', status: 'AT_RISK', actualPct: completionPct, reason: `completion is behind plan by ${Math.abs(variancePct).toFixed(1)}%` });
    }
  }
  return data;
}

function renderPunchMd(d: PunchReportData, opts: ReportOptions): string {
  const { total, completion } = d.totals;
  const planned = d.plannedToDate.completion;
  const lines: string[] = [];
  lines.push('## 4. Punch Management');
  if (opts.sections.includes('dashboard')) {
    lines.push('### 4.1 Dashboard');
    lines.push(`- Total punch items (active): **${total}**`);
    lines.push(`- Completion done: ${completion} (${pct(completion, total)})`);
    lines.push('');
  }
  if (opts.sections.includes('progress')) {
    lines.push('### 4.2 Current Status (Stage: Completion)');
    lines.push('| Stage | Planned to date | Actual to date | Actual % | Gap |');
    lines.push('|-------|-----------------|----------------|----------|-----|');
    lines.push(`| Completion | ${planned} | ${completion} | ${pct(completion, total)} | ${completion - planned} |`);
    lines.push('');
  }
  if (opts.sections.includes('simulation') && d.requiredPace) {
    const p = d.requiredPace;
    lines.push('### 4.3 Plan — Required Pace toward Project Completion (' + (opts.mcDate ?? MC_DEFAULT) + ')');
    lines.push(`- Days remaining to Project Completion: **${p.daysRemaining}**`);
    lines.push(`- Completion remaining: ${p.completionRemaining} → required: ${p.completionPerDay.toFixed(2)} / day`);
    lines.push('');
  }
  if (opts.sections.includes('snapshots') && d.snapshots) {
    lines.push('### 4.4 Plan — Stage Progress Snapshots');
    lines.push('| Date | Completion % |');
    lines.push('|------|--------------|');
    for (const s of d.snapshots) {
      lines.push(`| ${s.date} | ${pct(s.completion, s.total)} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ---------- Docs ----------
interface AbdRow {
  sub1_submission_date: string | null; sub1_approval_date: string | null; sub1_approval_status: string | null;
  sub2_submission_date: string | null; sub2_approval_date: string | null; sub2_approval_status: string | null;
  sub3_submission_date: string | null; sub3_approval_date: string | null; sub3_approval_status: string | null;
  sub1_planned_date: string | null; sub2_planned_date: string | null; sub3_planned_date: string | null;
  approved_date: string | null; current_status: string | null;
}
interface OmmRow {
  sub1_actual_date: string | null; sub2_actual_date: string | null; sub3_actual_date: string | null;
  final_actual_date: string | null; final_response_actual_date: string | null; draft_actual_date: string | null;
}
interface WarrantyRow {
  draft_actual_date: string | null; subcon_signing_actual_date: string | null;
  hdec_signing_actual_date: string | null; final_actual_date: string | null;
}
interface SparePartRow {
  actual_confirm_date: string | null; actual_po_date: string | null; actual_delivery_date: string | null;
}

async function fetchAll<T>(table: string, columns: string, filter?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  let from = 0; const size = 1000;
  while (true) {
    let q: any = supabase.from(table as any).select(columns).eq('is_active', true);
    if (filter) q = filter(q);
    q = q.range(from, from + size - 1);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < size) break;
    from += size;
  }
  return out;
}

const ABD_COLS: Array<keyof AbdRow> = ['sub1_submission_date','sub1_approval_date','sub2_submission_date','sub2_approval_date','sub3_submission_date','sub3_approval_date','approved_date'];
const OMM_COLS: Array<keyof OmmRow> = ['draft_actual_date','sub1_actual_date','sub2_actual_date','sub3_actual_date','final_actual_date','final_response_actual_date'];
const WARR_COLS: Array<keyof WarrantyRow> = ['draft_actual_date','subcon_signing_actual_date','hdec_signing_actual_date','final_actual_date'];
const SP_COLS: Array<keyof SparePartRow> = ['actual_confirm_date','actual_po_date','actual_delivery_date'];

function snapshotCounts<T>(rows: T[], cols: Array<keyof T>, date: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cols) {
    out[c as string] = rows.filter(r => isOnOrBefore(r[c] as unknown as string | null, date)).length;
  }
  return out;
}

async function computeDocsData(opts: ReportOptions): Promise<DocsReportData> {
  const wantSnap = opts.sections.includes('snapshots');
  const [abd, omm, warr, sp] = await Promise.all([
    fetchAll<AbdRow>('docs_drawings', 'sub1_submission_date,sub1_approval_date,sub1_approval_status,sub2_submission_date,sub2_approval_date,sub2_approval_status,sub3_submission_date,sub3_approval_date,sub3_approval_status,sub1_planned_date,sub2_planned_date,sub3_planned_date,approved_date,current_status', (q) => q.eq('sub_module', 'as_built')),
    fetchAll<OmmRow>('docs_omm', 'sub1_actual_date,sub2_actual_date,sub3_actual_date,final_actual_date,final_response_actual_date,draft_actual_date'),
    fetchAll<WarrantyRow>('warranty_items', 'draft_actual_date,subcon_signing_actual_date,hdec_signing_actual_date,final_actual_date'),
    fetchAll<SparePartRow>('docs_spare_part', 'actual_confirm_date,actual_po_date,actual_delivery_date'),
  ]);
  const mk = <T,>(rows: T[], cols: Array<keyof T>): DocsSubmoduleData => {
    const total = rows.length;
    const currentPcts: Record<string, number> = {};
    const currentCounts: Record<string, number> = {};
    for (const c of cols) {
      const count = rows.filter(r => {
        const v = r[c] as unknown;
        return v != null && v !== '';
      }).length;
      currentPcts[c as string] = total ? Math.round((count / total) * 1000) / 10 : 0;
      currentCounts[c as string] = count;
    }
    return {
      total,
      currentPcts,
      currentCounts,
      snapshots: wantSnap ? opts.snapshotDates.map(d => ({ date: d, total, counts: snapshotCounts(rows, cols, d) })) : undefined,
    };
  };
  // ABD: approval은 *_approval_status === 'A' 만 실적으로 인정 (대시보드 SSOT와 일치).
  // approval_date / approved_date 컬럼은 Planned Respond Date로 import되므로 카운트 금지.
  const abdSubCols: Array<keyof AbdRow> = ['sub1_submission_date','sub2_submission_date','sub3_submission_date'];
  const abdTotal = abd.length;
  const abdCounts: Record<string, number> = {};
  for (const c of abdSubCols) {
    abdCounts[c as string] = abd.filter(r => r[c] != null && r[c] !== '').length;
  }
  abdCounts['sub1_approval_date'] = abd.filter(r => r.sub1_approval_status === 'A').length;
  abdCounts['sub2_approval_date'] = abd.filter(r => r.sub2_approval_status === 'A').length;
  abdCounts['sub3_approval_date'] = abd.filter(r => r.sub3_approval_status === 'A').length;
  abdCounts['approved_date'] = abd.filter(r =>
    r.sub3_approval_status === 'A' || r.sub2_approval_status === 'A' || r.sub1_approval_status === 'A'
  ).length;
  const abdPcts: Record<string, number> = {};
  for (const k of Object.keys(abdCounts)) {
    abdPcts[k] = abdTotal ? Math.round((abdCounts[k] / abdTotal) * 1000) / 10 : 0;
  }
  const abdData: DocsSubmoduleData = {
    total: abdTotal,
    currentPcts: abdPcts,
    currentCounts: abdCounts,
    // Snapshots: 승인은 과거 시점 재구성 불가 (실제 승인일 미보유) → Submission만 포함.
    snapshots: wantSnap ? opts.snapshotDates.map(d => ({
      date: d,
      total: abdTotal,
      counts: snapshotCounts(abd, abdSubCols, d),
    })) : undefined,
    statusCounts: {
      under_review:  abd.filter(r => r.current_status === 'Under Review').length,
      not_submitted: abd.filter(r => !r.sub1_submission_date).length,
    },
  };
  const ommData = mk(omm, OMM_COLS);
  ommData.statusCounts = {
    under_review: omm.filter(r => !!r.sub2_actual_date && !r.final_response_actual_date).length,
  };
  return {
    abd: abdData,
    omm: ommData,
    warranty: mk(warr, WARR_COLS),
    sparePart: mk(sp, SP_COLS),
  };
}

function renderDocsMd(d: DocsReportData, opts: ReportOptions): string {
  const lines: string[] = [];
  lines.push('## 3. Docs Management');
  const pctOf = (n: number | undefined, t: number) => pct(n ?? 0, t);

  // ABD
  lines.push('### 3.1 As Built Drawing (ABD)');
  lines.push(`- Total: **${d.abd.total}**`);
  if (opts.sections.includes('snapshots') && d.abd.snapshots) {
    lines.push('| Date | Sub1 Sub % | Sub1 Apv % | Sub2 Sub % | Sub2 Apv % | Sub3 Sub % | Sub3 Apv % | Approved % |');
    lines.push('|------|-----------|-----------|-----------|-----------|-----------|-----------|-----------|');
    for (const s of d.abd.snapshots) {
      const t = s.total;
      lines.push(`| ${s.date} | ${pctOf(s.counts.sub1_submission_date, t)} | ${pctOf(s.counts.sub1_approval_date, t)} | ${pctOf(s.counts.sub2_submission_date, t)} | ${pctOf(s.counts.sub2_approval_date, t)} | ${pctOf(s.counts.sub3_submission_date, t)} | ${pctOf(s.counts.sub3_approval_date, t)} | ${pctOf(s.counts.approved_date, t)} |`);
    }
  }
  lines.push('');

  // OMM
  lines.push('### 3.2 OMM (Operation & Maintenance Manual)');
  lines.push(`- Total: **${d.omm.total}**`);
  if (opts.sections.includes('snapshots') && d.omm.snapshots) {
    lines.push('| Date | Draft % | Sub1 % | Sub2 % | Sub3 % | Final Sub % | Final Apv % |');
    lines.push('|------|---------|--------|--------|--------|-------------|-------------|');
    for (const s of d.omm.snapshots) {
      const t = s.total;
      lines.push(`| ${s.date} | ${pctOf(s.counts.draft_actual_date, t)} | ${pctOf(s.counts.sub1_actual_date, t)} | ${pctOf(s.counts.sub2_actual_date, t)} | ${pctOf(s.counts.sub3_actual_date, t)} | ${pctOf(s.counts.final_actual_date, t)} | ${pctOf(s.counts.final_response_actual_date, t)} |`);
    }
  }
  lines.push('');

  // Warranty
  lines.push('### 3.3 Warranty Deeds');
  lines.push(`- Total: **${d.warranty.total}**`);
  if (opts.sections.includes('snapshots') && d.warranty.snapshots) {
    lines.push('| Date | Draft % | Subcon Sign % | HDEC Sign % | Final % |');
    lines.push('|------|---------|---------------|-------------|---------|');
    for (const s of d.warranty.snapshots) {
      const t = s.total;
      lines.push(`| ${s.date} | ${pctOf(s.counts.draft_actual_date, t)} | ${pctOf(s.counts.subcon_signing_actual_date, t)} | ${pctOf(s.counts.hdec_signing_actual_date, t)} | ${pctOf(s.counts.final_actual_date, t)} |`);
    }
  }
  lines.push('');

  // Spare Part
  lines.push('### 3.4 Spare Part');
  lines.push(`- Total: **${d.sparePart.total}**`);
  if (opts.sections.includes('snapshots') && d.sparePart.snapshots) {
    lines.push('| Date | Confirm % | PO % | Delivery % |');
    lines.push('|------|-----------|------|------------|');
    for (const s of d.sparePart.snapshots) {
      const t = s.total;
      lines.push(`| ${s.date} | ${pctOf(s.counts.actual_confirm_date, t)} | ${pctOf(s.counts.actual_po_date, t)} | ${pctOf(s.counts.actual_delivery_date, t)} |`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

// ---------- public ----------
export async function buildReport(opts: ReportOptions): Promise<{ markdown: string; data: ReportData }> {
  const mode: DelayMode = opts.delayMode ?? 'penalty';
  const modeLabel = mode === 'penalty' ? 'Worst Case' : 'Best Case';

  const needsTncDate = opts.modules.includes('tnc');
  const needsDefectDate = opts.modules.includes('defect');
  const [tncDataDate, defectDataDate] = await Promise.all([
    needsTncDate ? resolveTncDataDate(opts.dataDate) : Promise.resolve(opts.dataDate ?? ''),
    needsDefectDate ? resolveDefectDataDate(opts.dataDate) : Promise.resolve(opts.dataDate ?? ''),
  ]);

  const includeGuide = needsTncDate && opts.includeTncGuide !== false;

  const meta: ReportMeta = {
    generatedAt: new Date().toISOString(),
    mcDate: opts.mcDate ?? MC_DEFAULT,
    daysToCompletion: Math.ceil((+new Date(opts.mcDate ?? MC_DEFAULT) - Date.now()) / 86400000),
    delayMode: mode,
    delayModeLabel: modeLabel,
    modules: opts.modules,
    sections: opts.sections,
    snapshotDates: opts.snapshotDates,
    tncDataDate: needsTncDate ? tncDataDate : undefined,
    defectDataDate: needsDefectDate ? defectDataDate : undefined,
    includesTncGuide: includeGuide,
  };

  const data: ReportData = { meta };

  // Compute data per selected module
  if (opts.modules.includes('tnc')) {
    const rows = await fetchTnc();
    data.tnc = computeTncData(rows, opts, tncDataDate);
    if (data.tnc) {
      const endDate = opts.mcDate ?? MC_DEFAULT;
      const startDate = addDays(tncDataDate, -35);
      const scPoints = buildSCurve(rows, 'day', startDate, endDate, tncDataDate);
      const tot = data.tnc.totals.total || 1;
      data.tnc.scurve = scPoints.map(p => ({
        date: p.bucket,
        bucketLabel: p.bucketLabel,
        t1PlanPct: Math.round((p.t1Planned / tot) * 1000) / 10,
        t1ActualPct: p.t1Actual != null ? Math.round((p.t1Actual / tot) * 1000) / 10 : null,
        t2PlanPct: Math.round((p.t2Planned / tot) * 1000) / 10,
        t2ActualPct: p.t2Actual != null ? Math.round((p.t2Actual / tot) * 1000) / 10 : null,
      }));
    }
  }
  if (opts.modules.includes('defect')) {
    const rows = await fetchDefects();
    data.defect = computeDefectData(rows, opts, defectDataDate);
    if (data.defect) {
      const sc = buildDefectSCurveAllStages(rows, {
        granularity: 'day',
        startDate: addDays(defectDataDate, -35),
        endDate: opts.mcDate ?? MC_DEFAULT,
        today: defectDataDate,
        groupBy: null,
      });
      const tot = data.defect.totals.total || 1;
      data.defect.scurve = sc.buckets.map((b, i) => {
        const cAct = sc.byStage.completion.actual[i];
        const zAct = sc.byStage.closure.actual[i];
        return {
          date: b,
          bucketLabel: sc.bucketLabels[i],
          completionPlanPct:   Math.round((sc.byStage.completion.plan[i] / tot) * 1000) / 10,
          completionActualPct: cAct != null ? Math.round((cAct / tot) * 1000) / 10 : null,
          closurePlanPct:      Math.round((sc.byStage.closure.plan[i]    / tot) * 1000) / 10,
          closureActualPct:    zAct != null ? Math.round((zAct / tot) * 1000) / 10 : null,
        };
      });
    }
  }
  if (opts.modules.includes('docs')) {
    data.docs = await computeDocsData(opts);
  }
  if (opts.modules.includes('punch')) {
    const rows = await fetchPunch();
    data.punch = computePunchData(rows, opts);
  }

  // Render markdown from data
  const head: string[] = [];
  head.push('# SHAW Project — Status Report');
  head.push(`_Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')} (SGT)_`);
  head.push(`_Project Completion D-Day: ${opts.mcDate ?? MC_DEFAULT}_`);
  head.push(`_Snapshot dates: ${opts.snapshotDates.join(', ') || '(none)'}_`);
  head.push(`_Snapshot delay mode: **${modeLabel}**_`);
  if (needsTncDate) head.push(`_T&C data date: ${tncDataDate}_`);
  if (needsDefectDate) head.push(`_Defect data date: ${defectDataDate}_`);
  if (includeGuide) head.push(`_T&C guide: included (Appendix A)_`);
  head.push('');

  const parts: string[] = [head.join('\n')];
  if (data.tnc) parts.push(renderTncMd(data.tnc, opts));
  if (data.defect) parts.push(renderDefectMd(data.defect, opts));
  if (data.docs) parts.push(renderDocsMd(data.docs, opts));
  if (data.punch) parts.push(renderPunchMd(data.punch, opts));
  if (includeGuide) parts.push(TNC_RAW_DATA_GUIDE_MD);

  return { markdown: parts.join('\n'), data };
}

/** Backwards-compatible wrapper. */
export async function buildReportMarkdown(opts: ReportOptions): Promise<string> {
  const { markdown } = await buildReport(opts);
  return markdown;
}
