// T&C (Subtest) Simulation utilities — pure functions.
//
// Mirror of `defect-simulation.ts`, adapted for T&C subtests with 4 stages:
//   T1 · T2 · R1 (R1S) · R2A
//
// Predicts cumulative quantity-based progress (%) per stage at any target date,
// combining actual completions to date with planned dates for not-yet-done items.

import type { SubtestForDashboard } from '@/lib/dashboard-utils';
import {
  getStageActualDate,
  getStagePlannedDate,
  isStageDone,
} from '@/lib/stage-metrics';

// ───── stages ─────

export type TncSimStage = 't1' | 't2' | 'r1' | 'r2a';

export const ALL_TNC_SIM_STAGES: TncSimStage[] = ['t1', 't2', 'r1', 'r2a'];

export const TNC_SIM_STAGE_LABELS: Record<TncSimStage, string> = {
  t1: 'T1',
  t2: 'T2',
  r1: 'R1S',
  r2a: 'R2A',
};

// ───── Delay handling ─────

export type DelayMode = 'optimistic' | 'penalty';

export const DELAY_MODE_LABELS: Record<DelayMode, string> = {
  optimistic: 'Best Case',
  penalty: 'Worst Case',
};

export interface SimOptions {
  mode: DelayMode;
  /** Reference "today" — typically latest data date from completed batches. */
  dataDate: string;
  /**
   * When true, T2 is only counted as actually done if T1 is also done,
   * and R2A only if R1 is done. Mirrors the workflow rule and protects
   * against legacy data where downstream actuals exist without upstream.
   */
  enforceSequential?: boolean;
}

/** Returns the prerequisite stages that must also be `isStageDone` for `stage`. */
function prerequisiteStages(stage: TncSimStage): TncSimStage[] {
  if (stage === 't2') return ['t1'];
  if (stage === 'r2a') return ['r1'];
  return [];
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
  return Math.round((isoToUtc(b) - isoToUtc(a)) / MS);
}

export function addDays(iso: string, n: number): string {
  return utcToIso(isoToUtc(iso) + n * MS);
}

/**
 * Compute the effective forecast date for a not-yet-done subtest × stage,
 * given the chosen delay-handling mode.
 *
 * Returns null when the item should be excluded from forecast.
 */
function effectiveForecastDate(
  planned: string | null,
  dataDate: string,
  mode: DelayMode,
): string | null {
  if (!planned) return null;
  const isDelayed = planned < dataDate;
  if (!isDelayed) return planned;
  switch (mode) {
    case 'optimistic':  return planned;
    case 'penalty':     return null;
  }
}

// ───── Stage simulation result ─────

export interface StageSimResult {
  stage: TncSimStage;
  total: number;
  doneActual: number;
  forecast: number;       // count whose effective forecast date ≤ target
  predicted: number;
  planOnly: number;       // ALL items whose ORIGINAL planned ≤ target (mode-independent)
  planAtDataDate: number; // ALL items whose ORIGINAL planned ≤ dataDate (i.e. should be done by now)
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

export function simulateTncStageAt(
  items: SubtestForDashboard[],
  stage: TncSimStage,
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

  const prereqs = prerequisiteStages(stage);
  const isEffectivelyDone = (it: SubtestForDashboard) => {
    if (!isStageDone(it, stage)) return false;
    if (!opts.enforceSequential) return true;
    return prereqs.every(p => isStageDone(it, p));
  };

  for (const it of items) {
    const planned = getStagePlannedDate(it, stage);
    const actual = getStageActualDate(it, stage);
    const done = isEffectivelyDone(it);

    if (planned && planned <= targetDate) planOnly++;
    if (planned && planned <= opts.dataDate) planAtDataDate++;

    if (done) {
      // B1: status indicates done but actual_date may be missing (e.g. R1 'Under Review').
      // Fall back to dataDate so the row still counts toward "Done now" instead of vanishing.
      const eff = actual ?? opts.dataDate;
      if (eff <= targetDate) doneActual++;
    } else {
      if (planned && planned < opts.dataDate) delayedCount++;
      if (planned) {
        const ef = effectiveForecastDate(planned, opts.dataDate, opts.mode);
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

export function simulateAllTncStages(
  items: SubtestForDashboard[],
  targetDate: string,
  opts: SimOptions,
  stages: TncSimStage[] = ALL_TNC_SIM_STAGES,
): Record<TncSimStage, StageSimResult> {
  const out: Partial<Record<TncSimStage, StageSimResult>> = {};
  for (const st of stages) out[st] = simulateTncStageAt(items, st, targetDate, opts);
  return out as Record<TncSimStage, StageSimResult>;
}

// ───── Time series for line chart ─────

export type SeriesPoint = {
  date: string;
} & {
  [K in TncSimStage as `${K}_plan`]: number;
} & {
  [K in TncSimStage as `${K}_actual`]: number | null;
} & {
  [K in TncSimStage as `${K}_predicted`]: number | null;
};

export function buildTncSimulationSeries(
  items: SubtestForDashboard[],
  rangeStart: string,
  rangeEnd: string,
  asOfDate: string,
  opts: SimOptions,
): SeriesPoint[] {
  const startMs = isoToUtc(rangeStart);
  const endMs = isoToUtc(rangeEnd);
  if (!isFinite(startMs) || !isFinite(endMs) || endMs < startMs) return [];

  type Pre = { planned: number | null; effForecast: number | null; actualDone: number | null };
  const pre: Record<TncSimStage, Pre[]> = { t1: [], t2: [], r1: [], r2a: [] };

  const dataDateMs = isoToUtc(opts.dataDate);
  for (const it of items) {
    for (const st of ALL_TNC_SIM_STAGES) {
      const p = getStagePlannedDate(it, st);
      const a = getStageActualDate(it, st);
      let done = isStageDone(it, st);
      if (done && opts.enforceSequential) {
        for (const pr of prerequisiteStages(st)) {
          if (!isStageDone(it, pr)) { done = false; break; }
        }
      }
      const ef = done ? null : effectiveForecastDate(p, opts.dataDate, opts.mode);
      pre[st].push({
        planned: p ? isoToUtc(p) : null,
        effForecast: ef ? isoToUtc(ef) : null,
        // B1: status-only done (no actual date) → treat as completed at dataDate.
        actualDone: done ? (a ? isoToUtc(a) : dataDateMs) : null,
      });
    }
  }

  const total = items.length;
  const points: SeriesPoint[] = [];
  const asOfMs = isoToUtc(asOfDate);

  for (let cur = startMs; cur <= endMs; cur += MS) {
    const iso = utcToIso(cur);
    const isPast = cur <= asOfMs;
    const calc = (st: TncSimStage) => {
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

    const point = { date: iso } as SeriesPoint;
    for (const st of ALL_TNC_SIM_STAGES) {
      const v = calc(st);
      (point as any)[`${st}_plan`] = v.plan;
      (point as any)[`${st}_actual`] = isPast ? v.actual : null;
      (point as any)[`${st}_predicted`] = isPast ? null : v.predicted;
    }
    points.push(point);
  }
  return points;
}

// ───── Group breakdown (by team) ─────

export interface TeamSimRow {
  team: string;
  count: number;
  t1: StageSimResult;
  t2: StageSimResult;
  r1: StageSimResult;
  r2a: StageSimResult;
}

export function simulateByTeam(
  items: SubtestForDashboard[],
  targetDate: string,
  opts: SimOptions,
): TeamSimRow[] {
  const groups = new Map<string, SubtestForDashboard[]>();
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
      t1: simulateTncStageAt(arr, 't1', targetDate, opts),
      t2: simulateTncStageAt(arr, 't2', targetDate, opts),
      r1: simulateTncStageAt(arr, 'r1', targetDate, opts),
      r2a: simulateTncStageAt(arr, 'r2a', targetDate, opts),
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
