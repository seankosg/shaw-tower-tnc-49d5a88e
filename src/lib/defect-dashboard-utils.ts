import { type DefectItem } from '@/lib/defect-utils';
import {
  getDefectGroupKey,
  getDefectGroupLabel,
  type DefectScheduleGroupBy,
  type DefectScheduleStage,
} from '@/lib/defect-schedule-utils';

export const NONE_LABEL = '(None)';
export type DefectDashboardStage = 'start' | 'completion' | 'closure';
export type DefectSCurveBucket = 'day' | 'week';

export type DefectForDashboard = DefectItem;

export interface DefectPlanActualMetrics {
  cumPlan: number;
  cumActual: number;
  dataDatePlan: number;
  dataDateActual: number;
  dataDateDelay: number;
  todayPlan: number;
  todayActual: number;
  todayDelay: number;
}

export interface DefectPlanActualRow {
  key: string;
  label: string;
  totalDefects: number;
  completion: DefectPlanActualMetrics;
  closure: DefectPlanActualMetrics;
}

export interface DefectSCurveSeries {
  key: string;       // group key, '__total__' for aggregate, or 'Others'
  label: string;
  plan: number[];          // cumulative, length === buckets.length
  actual: (number | null)[]; // cumulative, null for future buckets
  variance: (number | null)[]; // actual - plan per-bucket increment, null for future
}

export interface DefectSCurveResult {
  buckets: string[];        // ISO bucket starts
  bucketLabels: string[];   // formatted DD-MMM
  todayIndex: number;       // index of today's bucket in buckets[], or -1 if outside range
  total: DefectSCurveSeries;
  groups: DefectSCurveSeries[];   // empty if no group breakdown requested
  stage: DefectScheduleStage;
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string): number {
  const a = new Date(start + 'T00:00:00Z').getTime();
  const b = new Date(end + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000);
}

function labelDdMmm(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}-${MONTH_ABBR[parseInt(m[2], 10) - 1]}`;
}

function bucketize(iso: string, granularity: DefectSCurveBucket): string {
  if (granularity === 'day') return iso;
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDay() || 7;
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}

function generateBuckets(startDate: string, endDate: string, granularity: DefectSCurveBucket): string[] {
  const result: string[] = [];
  const d = new Date(bucketize(startDate, granularity) + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  const step = granularity === 'day' ? 1 : 7;
  while (d <= end) {
    result.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + step);
  }
  return result;
}

/**
 * Completion stage is "done" when:
 *   - actual_completion_date exists, OR
 *   - actual_progress_pct >= 100 (lenient policy — onsite often updates % only)
 */
export function isActualComplete(item: Pick<DefectForDashboard, 'actual_completion_date' | 'actual_progress_pct'>): boolean {
  return Boolean(item.actual_completion_date) || Number(item.actual_progress_pct ?? 0) >= 100;
}

/**
 * Closure stage is "done" when:
 *   - actual_closure_date exists, OR
 *   - closure_status indicates closed (Done / Closed)
 */
export function isClosureComplete(item: Pick<DefectForDashboard, 'actual_closure_date' | 'closure_status'>): boolean {
  if (item.actual_closure_date) return true;
  const status = String((item as any).closure_status ?? '').trim().toLowerCase();
  return status === 'done' || status === 'closed';
}

export function getStagePlanDate(item: DefectForDashboard, stage: DefectDashboardStage): string | null {
  if (stage === 'start') return item.planned_start_date;
  if (stage === 'completion') return item.planned_completion_date;
  return item.planned_closure_date;
}

export function getStageActualDate(item: DefectForDashboard, stage: DefectDashboardStage): string | null {
  if (stage === 'start') return item.actual_start_date;
  if (stage === 'completion') return item.actual_completion_date;
  return item.actual_closure_date;
}

/**
 * Cascade Done logic: if a downstream stage is done, all upstream stages are
 * implicitly done too. This prevents phantom "start overdue" on items where
 * closure is already complete but actual_start_date was never recorded.
 */
export function isStageDone(item: DefectForDashboard, stage: DefectDashboardStage): boolean {
  if (stage === 'closure') return isClosureComplete(item);
  if (stage === 'completion') return isClosureComplete(item) || isActualComplete(item);
  // start
  return isClosureComplete(item) || isActualComplete(item) || Boolean(item.actual_start_date);
}

/**
 * Strict less-than: a plan dated on `asOfDate` is NOT yet overdue
 * (the work day is still open). Aligns with PM convention.
 */
export function isStageDelayedAsOf(item: DefectForDashboard, stage: DefectDashboardStage, asOfDate: string): boolean {
  const plan = getStagePlanDate(item, stage);
  return Boolean(plan && plan < asOfDate && !isStageDone(item, stage));
}

const STAGES: DefectDashboardStage[] = ['start', 'completion', 'closure'];

/** Overdue judgment — ALWAYS uses Data Date as `asOfDate`. */
export function isOverdue(item: DefectForDashboard, asOfDate: string): boolean {
  return STAGES.some((stage) => isStageDelayedAsOf(item, stage, asOfDate));
}

/**
 * At-Risk = not overdue (relative to `today`) and at least one stage plan
 * falls within the next `thresholdDays`. Uses real today since "imminent"
 * is naturally a forward-looking metric. Includes closure stage.
 */
export function isAtRisk(item: DefectForDashboard, today: string, thresholdDays: number): boolean {
  if (isOverdue(item, today)) return false;
  return STAGES.some((stage) => {
    const plan = getStagePlanDate(item, stage);
    if (!plan || isStageDone(item, stage)) return false;
    const diff = daysBetween(today, plan);
    return diff >= 0 && diff <= thresholdDays;
  });
}

/**
 * Maximum delay in days across all stages. Returns 0 for closed items
 * (closure complete cascades down — no stage can be "delayed" anymore).
 */
export function maxDelayDays(item: DefectForDashboard, asOfDate: string): number {
  if (isClosureComplete(item)) return 0;
  return Math.max(0, ...STAGES.map((stage) => {
    const plan = getStagePlanDate(item, stage);
    return plan && !isStageDone(item, stage) ? Math.max(0, -daysBetween(asOfDate, plan)) : 0;
  }));
}

function calcMetrics(items: DefectForDashboard[], stage: DefectDashboardStage, today: string, dataDate: string): DefectPlanActualMetrics {
  let cumPlan = 0, cumActual = 0, dataDatePlan = 0, dataDateActual = 0, dataDateDelay = 0, todayPlan = 0, todayActual = 0, todayDelay = 0;
  for (const item of items) {
    const plan = getStagePlanDate(item, stage);
    const actual = getStageActualDate(item, stage);
    if (plan && plan <= dataDate) cumPlan++;
    if (actual && actual <= dataDate) cumActual++;
    if (plan === dataDate) dataDatePlan++;
    if (actual === dataDate) dataDateActual++;
    if (plan === dataDate && !isStageDone(item, stage)) dataDateDelay++;
    if (plan === today) todayPlan++;
    if (actual === today) todayActual++;
    if (plan === today && !isStageDone(item, stage)) todayDelay++;
  }
  return { cumPlan, cumActual, dataDatePlan, dataDateActual, dataDateDelay, todayPlan, todayActual, todayDelay };
}

export function aggregateDefectPlanActualByGroup(
  items: DefectForDashboard[],
  today: string,
  dataDate: string,
  groupKey: (item: DefectForDashboard) => string,
  groupLabel: (key: string) => string,
): DefectPlanActualRow[] {
  const buckets = new Map<string, DefectForDashboard[]>();
  for (const item of items) {
    const key = groupKey(item) || NONE_LABEL;
    buckets.set(key, [...(buckets.get(key) ?? []), item]);
  }
  return [...buckets.entries()].map(([key, rows]) => ({
    key,
    label: groupLabel(key),
    totalDefects: rows.length,
    completion: calcMetrics(rows, 'completion', today, dataDate),
    closure: calcMetrics(rows, 'closure', today, dataDate),
  })).sort((a, b) => {
    const va = (a.completion.cumActual - a.completion.cumPlan) + (a.closure.cumActual - a.closure.cumPlan);
    const vb = (b.completion.cumActual - b.completion.cumPlan) + (b.closure.cumActual - b.closure.cumPlan);
    return va - vb || a.label.localeCompare(b.label);
  });
}

/** Difference metrics = completion − closure (검측 대기 적체 지표) */
export function diffMetrics(row: DefectPlanActualRow): DefectPlanActualMetrics {
  const c = row.completion;
  const z = row.closure;
  return {
    cumPlan: c.cumPlan - z.cumPlan,
    cumActual: c.cumActual - z.cumActual,
    dataDatePlan: c.dataDatePlan - z.dataDatePlan,
    dataDateActual: c.dataDateActual - z.dataDateActual,
    dataDateDelay: Math.max(0, c.dataDateDelay - z.dataDateDelay),
    todayPlan: c.todayPlan - z.todayPlan,
    todayActual: c.todayActual - z.todayActual,
    todayDelay: Math.max(0, c.todayDelay - z.todayDelay),
  };
}

export interface BuildSCurveOptions {
  granularity: DefectSCurveBucket;
  startDate: string;
  endDate: string;
  today: string;
  stage: DefectScheduleStage;
  groupBy?: DefectScheduleGroupBy | null;
  topN?: number; // for grouped breakdown; default 8
}

const TOTAL_KEY = '__total__';
const OTHERS_KEY = '__others__';

interface PerSeriesCounts {
  // bucket -> { plan, actual }
  byBucket: Map<string, { p: number; a: number }>;
  totalPlan: number;
}

function getStageDates(item: DefectForDashboard, stage: DefectScheduleStage): { plan: string | null; actual: string | null } {
  return { plan: getStagePlanDate(item, stage), actual: getStageActualDate(item, stage) };
}

export function buildDefectSCurve(items: DefectForDashboard[], options: BuildSCurveOptions): DefectSCurveResult {
  const { granularity, startDate, endDate, today, stage, groupBy, topN = 8 } = options;
  const buckets = generateBuckets(startDate, endDate, granularity);
  const bucketLabels = buckets.map(labelDdMmm);
  const todayBucket = bucketize(today, granularity);
  const todayIndex = buckets.findIndex((b) => b >= todayBucket);

  // Count per series (always compute total; compute per-group only if groupBy)
  const seriesMap = new Map<string, PerSeriesCounts>();
  const ensureSeries = (key: string) => {
    let s = seriesMap.get(key);
    if (!s) { s = { byBucket: new Map(), totalPlan: 0 }; seriesMap.set(key, s); }
    return s;
  };
  const addToSeries = (key: string, bucket: string, field: 'p' | 'a', delta = 1) => {
    const s = ensureSeries(key);
    let v = s.byBucket.get(bucket);
    if (!v) { v = { p: 0, a: 0 }; s.byBucket.set(bucket, v); }
    v[field] += delta;
    if (field === 'p') s.totalPlan += delta;
  };

  for (const item of items) {
    const { plan, actual } = getStageDates(item, stage);
    if (plan) addToSeries(TOTAL_KEY, bucketize(plan, granularity), 'p');
    if (actual) addToSeries(TOTAL_KEY, bucketize(actual, granularity), 'a');
    if (groupBy) {
      const gKey = getDefectGroupKey(item, groupBy);
      if (plan) addToSeries(gKey, bucketize(plan, granularity), 'p');
      if (actual) addToSeries(gKey, bucketize(actual, granularity), 'a');
    }
  }

  // Determine top-N groups by total plan; collapse rest into Others
  let groupOrder: string[] = [];
  let othersKeys = new Set<string>();
  if (groupBy) {
    const groupKeys = [...seriesMap.keys()].filter((k) => k !== TOTAL_KEY);
    groupKeys.sort((a, b) => (seriesMap.get(b)!.totalPlan - seriesMap.get(a)!.totalPlan) || a.localeCompare(b));
    groupOrder = groupKeys.slice(0, topN);
    othersKeys = new Set(groupKeys.slice(topN));
  }

  const buildSeries = (key: string, label: string, getCounts: (bucket: string) => { p: number; a: number }): DefectSCurveSeries => {
    // Pre-fill cumulative from any pre-window data: count all bucket entries < first bucket
    const plan: number[] = [];
    const actual: (number | null)[] = [];
    const variance: (number | null)[] = [];

    if (!buckets.length) return { key, label, plan, actual, variance };

    // Initial cumulative from before window
    let cumP = 0;
    let cumA = 0;
    if (key === TOTAL_KEY || key === OTHERS_KEY) {
      // For composite series we still need pre-window. We'll iterate via getCounts per bucket only for window.
      // Pre-window aggregation handled by caller via series counts map snapshot below.
    }

    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      const inc = getCounts(b);
      cumP += inc.p;
      const isFuture = i > todayIndex && todayIndex >= 0;
      cumA += isFuture ? 0 : inc.a;
      plan.push(cumP);
      actual.push(isFuture ? null : cumA);
      variance.push(isFuture ? null : (inc.a - inc.p));
    }
    return { key, label, plan, actual, variance };
  };

  // Helper: returns counts for a bucket aggregating from the provided keys, also adding pre-window cumulative
  const seriesCountsAggregator = (keys: string[]): { pre: { p: number; a: number }; perBucket: (b: string) => { p: number; a: number } } => {
    let preP = 0, preA = 0;
    const firstBucket = buckets[0];
    const merged = new Map<string, { p: number; a: number }>();
    for (const k of keys) {
      const s = seriesMap.get(k);
      if (!s) continue;
      for (const [b, v] of s.byBucket) {
        // Exclude any data outside the selected window so the cumulative line starts at 0.
        if (firstBucket && b < firstBucket) continue;
        let cur = merged.get(b);
        if (!cur) { cur = { p: 0, a: 0 }; merged.set(b, cur); }
        cur.p += v.p; cur.a += v.a;
      }
    }
    return {
      pre: { p: preP, a: preA },
      perBucket: (b: string) => merged.get(b) ?? { p: 0, a: 0 },
    };
  };

  // Total series — with pre-window cumulative seeded
  const totalAgg = seriesCountsAggregator([TOTAL_KEY]);
  const totalSeries = ((): DefectSCurveSeries => {
    const plan: number[] = [];
    const actual: (number | null)[] = [];
    const variance: (number | null)[] = [];
    let cumP = totalAgg.pre.p;
    let cumA = totalAgg.pre.a;
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      const inc = totalAgg.perBucket(b);
      cumP += inc.p;
      const isFuture = todayIndex >= 0 && i > todayIndex;
      cumA += isFuture ? 0 : inc.a;
      plan.push(cumP);
      actual.push(isFuture ? null : cumA);
      variance.push(isFuture ? null : (inc.a - inc.p));
    }
    return { key: TOTAL_KEY, label: 'Total', plan, actual, variance };
  })();

  // Per-group series
  const groupSeries: DefectSCurveSeries[] = [];
  if (groupBy) {
    for (const gKey of groupOrder) {
      const agg = seriesCountsAggregator([gKey]);
      let cumP = agg.pre.p;
      let cumA = agg.pre.a;
      const plan: number[] = [];
      const actual: (number | null)[] = [];
      const variance: (number | null)[] = [];
      for (let i = 0; i < buckets.length; i++) {
        const b = buckets[i];
        const inc = agg.perBucket(b);
        cumP += inc.p;
        const isFuture = todayIndex >= 0 && i > todayIndex;
        cumA += isFuture ? 0 : inc.a;
        plan.push(cumP);
        actual.push(isFuture ? null : cumA);
        variance.push(isFuture ? null : (inc.a - inc.p));
      }
      groupSeries.push({ key: gKey, label: getDefectGroupLabel(groupBy, gKey), plan, actual, variance });
    }
    if (othersKeys.size > 0) {
      const agg = seriesCountsAggregator([...othersKeys]);
      let cumP = agg.pre.p;
      let cumA = agg.pre.a;
      const plan: number[] = [];
      const actual: (number | null)[] = [];
      const variance: (number | null)[] = [];
      for (let i = 0; i < buckets.length; i++) {
        const b = buckets[i];
        const inc = agg.perBucket(b);
        cumP += inc.p;
        const isFuture = todayIndex >= 0 && i > todayIndex;
        cumA += isFuture ? 0 : inc.a;
        plan.push(cumP);
        actual.push(isFuture ? null : cumA);
        variance.push(isFuture ? null : (inc.a - inc.p));
      }
      groupSeries.push({ key: OTHERS_KEY, label: `Others (${othersKeys.size})`, plan, actual, variance });
    }
  }

  return { buckets, bucketLabels, todayIndex, total: totalSeries, groups: groupSeries, stage };
}

export type DefectSCurveStageOpt = DefectScheduleStage | 'all';

export interface DefectSCurveAllResult {
  buckets: string[];
  bucketLabels: string[];
  todayIndex: number;
  byStage: Record<DefectScheduleStage, DefectSCurveSeries>;
  /** Per-stage group breakdown. Empty arrays when no groupBy was provided. */
  byStageGroups: Record<DefectScheduleStage, DefectSCurveSeries[]>;
}

/**
 * All-stage S-curve: builds Plan/Actual cumulative + per-bucket increments
 * for Start, Completion, and Closure stages over the same bucket axis.
 *
 * When `groupBy` is provided, each stage also returns its per-group series
 * (top-N by total plan), enabling combined Stage=All + Group=… filtering.
 */
export function buildDefectSCurveAllStages(
  items: DefectForDashboard[],
  options: Omit<BuildSCurveOptions, 'stage'>,
): DefectSCurveAllResult {
  const stages: DefectScheduleStage[] = ['start', 'completion', 'closure'];
  const results = stages.map((s) =>
    buildDefectSCurve(items, { ...options, stage: s }),
  );
  const byStage = {
    start: results[0].total,
    completion: results[1].total,
    closure: results[2].total,
  };
  const byStageGroups = {
    start: results[0].groups,
    completion: results[1].groups,
    closure: results[2].groups,
  };
  return {
    buckets: results[0].buckets,
    bucketLabels: results[0].bucketLabels,
    todayIndex: results[0].todayIndex,
    byStage,
    byStageGroups,
  };
}

