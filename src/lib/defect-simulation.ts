// Defect Simulation utilities — pure functions.
//
// Predicts cumulative quantity-based progress (%) per stage at any target date,
// combining actual completions to date with planned dates for not-yet-done items.
//
// For each item × stage, treat the date "achieved by D" as:
//   - actual_<stage>_date if the stage is done (cascade-aware via isDefectStageDone) and ≤ D
//   - else planned_<stage>_date if present and ≤ D (forecast)
//   - else not counted (item without planned date never contributes)

import type { DefectItem } from '@/lib/defect-utils';
import {
  ALL_DEFECT_STAGE_KEYS,
  getDefectStageActualDate,
  getDefectStagePlannedDate,
  isDefectStageDone,
  type DefectScheduleStage,
} from '@/lib/defect-schedule-utils';

/**
 * Cascade-aware effective actual date for a stage.
 * If the stage's own actual date is missing but a later stage's actual date exists,
 * fall back to the later one (a later stage being done implies the earlier stage
 * happened no later than that date — safe lower-bound estimate).
 *
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
  // start
  return getDefectStageActualDate(item, 'start')
    ?? getDefectStageActualDate(item, 'completion')
    ?? getDefectStageActualDate(item, 'closure');
}

export interface StageSimResult {
  stage: DefectScheduleStage;
  total: number;       // population N (denominator)
  doneActual: number;  // actual completed up to target
  forecast: number;    // not-done items whose planned ≤ target
  predicted: number;   // doneActual + forecast
  planOnly: number;    // ALL items (regardless of actual) whose planned ≤ target
  noPlan: number;      // not-done items missing planned date (never reaches 100)
  predictedPct: number;
  planPct: number;
  actualPct: number;   // doneActual / total
  gapPct: number;      // predictedPct − planPct
}

export function simulateDefectStageAt(
  items: DefectItem[],
  stage: DefectScheduleStage,
  targetDate: string,
): StageSimResult {
  const total = items.length;
  let doneActual = 0;
  let forecast = 0;
  let planOnly = 0;
  let noPlan = 0;

  for (const it of items) {
    const planned = getDefectStagePlannedDate(it, stage);
    const actual = getEffectiveActualDate(it, stage);
    const done = isDefectStageDone(it, stage);

    if (planned && planned <= targetDate) planOnly++;

    if (done && actual && actual <= targetDate) {
      doneActual++;
    } else if (!done) {
      if (planned) {
        if (planned <= targetDate) forecast++;
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
    noPlan,
    predictedPct: round1(pct(predicted)),
    planPct: round1(pct(planOnly)),
    actualPct: round1(pct(doneActual)),
    gapPct: round1(pct(predicted) - pct(planOnly)),
  };
}

export function simulateAllDefectStages(
  items: DefectItem[],
  targetDate: string,
  stages: DefectScheduleStage[] = ALL_DEFECT_STAGE_KEYS,
): Record<DefectScheduleStage, StageSimResult> {
  const out: Partial<Record<DefectScheduleStage, StageSimResult>> = {};
  for (const st of stages) out[st] = simulateDefectStageAt(items, st, targetDate);
  return out as Record<DefectScheduleStage, StageSimResult>;
}

// ───── Time series for line chart ─────

export interface SeriesPoint {
  date: string;          // ISO YYYY-MM-DD
  /** Cumulative % per stage. Predicted is null for past dates ≤ asOf (== Actual). */
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

export function buildDefectSimulationSeries(
  items: DefectItem[],
  rangeStart: string,
  rangeEnd: string,
  asOfDate: string,
): SeriesPoint[] {
  const startMs = isoToUtc(rangeStart);
  const endMs = isoToUtc(rangeEnd);
  if (!isFinite(startMs) || !isFinite(endMs) || endMs < startMs) return [];

  // Pre-extract per-stage planned/actual dates once (with cascade-aware done check).
  type Pre = { planned: number | null; actualDone: number | null };
  const pre: Record<DefectScheduleStage, Pre[]> = {
    start: [], completion: [], closure: [],
  };
  for (const it of items) {
    for (const st of ALL_DEFECT_STAGE_KEYS) {
      const p = getDefectStagePlannedDate(it, st);
      const a = getDefectStageActualDate(it, st);
      const done = isDefectStageDone(it, st);
      pre[st].push({
        planned: p ? isoToUtc(p) : null,
        actualDone: done && a ? isoToUtc(a) : null,
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
        } else if (r.planned != null && r.planned <= cur) {
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
      start: simulateDefectStageAt(arr, 'start', targetDate),
      completion: simulateDefectStageAt(arr, 'completion', targetDate),
      closure: simulateDefectStageAt(arr, 'closure', targetDate),
    });
  }
  rows.sort((a, b) => a.team.localeCompare(b.team));
  return rows;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
