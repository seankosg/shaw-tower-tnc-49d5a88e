// Defect Simulation utilities — pure functions.
//
// Predicts cumulative quantity-based progress (%) per stage at any target date,
// combining actual completions to date with planned dates for not-yet-done items.
//
// Delay handling: items whose planned date is already past `dataDate` (delayed)
// are treated according to the chosen `DelayMode`. See effectiveForecastDate().

import type { DefectItem } from '@/lib/defect-utils';
import {
  ALL_DEFECT_STAGE_KEYS,
  addDays,
  getDefectStageActualDate,
  getDefectStagePlannedDate,
  isDefectStageDone,
  type DefectScheduleStage,
} from '@/lib/defect-schedule-utils';

// ───── Delay handling ─────

export type DelayMode = 'optimistic' | 'shift-today' | 'penalty' | 'learned';

export const DELAY_MODE_LABELS: Record<DelayMode, string> = {
  optimistic: 'Optimistic',
  'shift-today': 'Shift to today',
  penalty: 'Penalty (exclude)',
  learned: 'Learned lag',
};

export interface SimOptions {
  mode: DelayMode;
  /** Reference "today" — typically latest data date from completed batches. */
  dataDate: string;
  /** Per-stage average lag in days, used only when mode === 'learned'. */
  lagDays?: Partial<Record<DefectScheduleStage, number>>;
}

/**
 * Compute the effective forecast date for a not-yet-done item × stage,
 * given the chosen delay-handling mode.
 *
 * Returns null when the item should be excluded from forecast.
 */
function effectiveForecastDate(
  planned: string | null,
  dataDate: string,
  mode: DelayMode,
  lagDays: number,
): string | null {
  if (!planned) return null;
  const isDelayed = planned < dataDate;
  if (!isDelayed) return planned;
  switch (mode) {
    case 'optimistic':  return planned;
    case 'shift-today': return dataDate;
    case 'penalty':     return null;
    case 'learned':     return addDays(planned, Math.max(0, Math.round(lagDays)));
  }
}

/**
 * Compute average lag (actual − planned, in days) per stage from completed items.
 * Negative lags clamp to 0; stages with sample size < 5 return 0 (insufficient data).
 */
export function computeStageLagDays(items: DefectItem[]): Record<DefectScheduleStage, number> {
  const out = { start: 0, completion: 0, closure: 0 } as Record<DefectScheduleStage, number>;
  for (const st of ALL_DEFECT_STAGE_KEYS) {
    let sum = 0;
    let n = 0;
    for (const it of items) {
      const planned = getDefectStagePlannedDate(it, st);
      const actual = getEffectiveActualDate(it, st);
      if (!planned || !actual || !isDefectStageDone(it, st)) continue;
      const diff = daysBetween(planned, actual);
      sum += diff;
      n++;
    }
    if (n >= 5) out[st] = Math.max(0, sum / n);
  }
  return out;
}

/**
 * Cascade-aware effective actual date for a stage.
 *   start      ← actual_start_date ?? actual_completion_date ?? actual_closure_date
 *   completion ← actual_completion_date ?? actual_closure_date
 *   closure    ← actual_closure_date
 */
function getEffectiveActualDate(item: DefectItem, stage: DefectScheduleStage): string | null {
  if (stage === 'closure') return getDefectStageActualDate(item, 'closure');
  if (stage === 'completion') {
    return getDefectStageActualDate(item, 'completion')
      ?? getDefectStageActualDate(item, 'closure');
  }
  return getDefectStageActualDate(item, 'start')
    ?? getDefectStageActualDate(item, 'completion')
    ?? getDefectStageActualDate(item, 'closure');
}

export interface StageSimResult {
  stage: DefectScheduleStage;
  total: number;
  doneActual: number;
  forecast: number;       // count whose effective forecast date ≤ target
  predicted: number;
  planOnly: number;       // ALL items whose ORIGINAL planned ≤ target (mode-independent)
  planAtDataDate: number; // ALL items whose ORIGINAL planned ≤ dataDate
  noPlan: number;
  delayedCount: number;   // not-done items with planned < dataDate (mode-independent)
  predictedPct: number;
  planPct: number;
  planAtDataDatePct: number;
  actualPct: number;
  gapPct: number;          // predicted − plan @ target
  behindNowPct: number;    // actual − planAtDataDate (negative = behind)
  behindNowCount: number;  // doneActual − planAtDataDate
}

export function simulateDefectStageAt(
  items: DefectItem[],
  stage: DefectScheduleStage,
  targetDate: string,
  opts: SimOptions,
): StageSimResult {
  const total = items.length;
  let doneActual = 0;
  let forecast = 0;
  let planOnly = 0;
  let planAtDataDate = 0;
  let noPlan = 0;
  let delayedCount = 0;

  const lag = opts.lagDays?.[stage] ?? 0;

  for (const it of items) {
    const planned = getDefectStagePlannedDate(it, stage);
    const actual = getEffectiveActualDate(it, stage);
    const done = isDefectStageDone(it, stage);

    if (planned && planned <= targetDate) planOnly++;
    if (planned && planned <= opts.dataDate) planAtDataDate++;

    if (done) {
      // B1 fix: status-only done rows (closure_status='Done' / status='closed' /
      // progress_pct≥100) have no actual_date — fall back to dataDate so they
      // are not silently dropped from doneActual.
      const eff = actual ?? opts.dataDate;
      if (eff <= targetDate) doneActual++;
    } else {
      if (planned && planned < opts.dataDate) delayedCount++;
      if (planned) {
        const ef = effectiveForecastDate(planned, opts.dataDate, opts.mode, lag);
        if (ef && ef <= targetDate) forecast++;
      } else {
        noPlan++;
      }
    }
  }

  const predicted = doneActual + forecast;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  return {
    stage,
    total,
    doneActual,
    forecast,
    predicted,
    planOnly,
    planAtDataDate,
    noPlan,
    delayedCount,
    predictedPct: round1(pct(predicted)),
    planPct: round1(pct(planOnly)),
    planAtDataDatePct: round1(pct(planAtDataDate)),
    actualPct: round1(pct(doneActual)),
    gapPct: round1(pct(predicted) - pct(planOnly)),
    behindNowPct: round1(pct(doneActual) - pct(planAtDataDate)),
    behindNowCount: doneActual - planAtDataDate,
  };
}

export function simulateAllDefectStages(
  items: DefectItem[],
  targetDate: string,
  opts: SimOptions,
  stages: DefectScheduleStage[] = ALL_DEFECT_STAGE_KEYS,
): Record<DefectScheduleStage, StageSimResult> {
  const out: Partial<Record<DefectScheduleStage, StageSimResult>> = {};
  for (const st of stages) out[st] = simulateDefectStageAt(items, st, targetDate, opts);
  return out as Record<DefectScheduleStage, StageSimResult>;
}

// ───── Time series for line chart ─────

export interface SeriesPoint {
  date: string;
  start_plan: number;
  start_actual: number | null;
  start_predicted: number | null;
  completion_plan: number;
  completion_actual: number | null;
  completion_predicted: number | null;
  closure_plan: number;
  closure_actual: number | null;
  closure_predicted: number | null;
}

const MS = 86_400_000;

function isoToUtc(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

function utcToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const am = isoToUtc(a);
  const bm = isoToUtc(b);
  return Math.round((bm - am) / MS);
}

export function buildDefectSimulationSeries(
  items: DefectItem[],
  rangeStart: string,
  rangeEnd: string,
  asOfDate: string,
  opts: SimOptions,
): SeriesPoint[] {
  const startMs = isoToUtc(rangeStart);
  const endMs = isoToUtc(rangeEnd);
  if (!isFinite(startMs) || !isFinite(endMs) || endMs < startMs) return [];

  type Pre = { planned: number | null; effForecast: number | null; actualDone: number | null };
  const pre: Record<DefectScheduleStage, Pre[]> = { start: [], completion: [], closure: [] };

  for (const it of items) {
    for (const st of ALL_DEFECT_STAGE_KEYS) {
      const p = getDefectStagePlannedDate(it, st);
      const a = getEffectiveActualDate(it, st);
      const done = isDefectStageDone(it, st);
      const lag = opts.lagDays?.[st] ?? 0;
      const ef = done ? null : effectiveForecastDate(p, opts.dataDate, opts.mode, lag);
      // B1 fix: done with no actual date → use dataDate as effective completion.
      const effActual = done ? (a ?? opts.dataDate) : null;
      pre[st].push({
        planned: p ? isoToUtc(p) : null,
        effForecast: ef ? isoToUtc(ef) : null,
        actualDone: effActual ? isoToUtc(effActual) : null,
      });
    }
  }

  const total = items.length;
  const points: SeriesPoint[] = [];
  const asOfMs = isoToUtc(asOfDate);

  for (let cur = startMs; cur <= endMs; cur += MS) {
    const iso = utcToIso(cur);
    const isPast = cur <= asOfMs;
    const calc = (st: DefectScheduleStage) => {
      let planCount = 0;
      let actualCount = 0;
      let predCount = 0;
      const arr = pre[st];
      for (const r of arr) {
        if (r.planned != null && r.planned <= cur) planCount++;
        const isDone = r.actualDone != null && r.actualDone <= cur;
        if (isDone) {
          actualCount++;
          predCount++;
        } else if (r.effForecast != null && r.effForecast <= cur) {
          predCount++;
        }
      }
      const denom = total || 1;
      return {
        plan: round1((planCount / denom) * 100),
        actual: round1((actualCount / denom) * 100),
        predicted: round1((predCount / denom) * 100),
      };
    };

    const s = calc('start');
    const c = calc('completion');
    const cl = calc('closure');

    points.push({
      date: iso,
      start_plan: s.plan,
      start_actual: isPast ? s.actual : null,
      start_predicted: isPast ? null : s.predicted,
      completion_plan: c.plan,
      completion_actual: isPast ? c.actual : null,
      completion_predicted: isPast ? null : c.predicted,
      closure_plan: cl.plan,
      closure_actual: isPast ? cl.actual : null,
      closure_predicted: isPast ? null : cl.predicted,
    });
  }
  return points;
}

// ───── Group breakdown ─────

export interface TeamSimRow {
  team: string;
  count: number;
  start: StageSimResult;
  completion: StageSimResult;
  closure: StageSimResult;
}

export function simulateByTeam(
  items: DefectItem[],
  targetDate: string,
  opts: SimOptions,
): TeamSimRow[] {
  const groups = new Map<string, DefectItem[]>();
  for (const it of items) {
    const k = it.team ?? '(None)';
    const arr = groups.get(k) ?? [];
    arr.push(it);
    groups.set(k, arr);
  }
  const rows: TeamSimRow[] = [];
  for (const [team, arr] of groups) {
    rows.push({
      team,
      count: arr.length,
      start: simulateDefectStageAt(arr, 'start', targetDate, opts),
      completion: simulateDefectStageAt(arr, 'completion', targetDate, opts),
      closure: simulateDefectStageAt(arr, 'closure', targetDate, opts),
    });
  }
  rows.sort((a, b) => {
    const aNone = a.team === '(None)';
    const bNone = b.team === '(None)';
    if (aNone !== bNone) return aNone ? 1 : -1;
    return a.team.localeCompare(b.team);
  });
  return rows;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
