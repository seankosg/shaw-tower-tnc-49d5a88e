import { type DefectItem } from '@/lib/defect-utils';

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

export interface DefectSCurvePoint {
  bucket: string;
  bucketLabel: string;
  completionPlan: number;
  completionActual: number | null;
  closurePlan: number;
  closureActual: number | null;
  completionMet: number;
  completionShortfall: number;
  completionExcess: number;
  completionFuturePlan: number;
  closureMet: number;
  closureShortfall: number;
  closureExcess: number;
  closureFuturePlan: number;
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

export function buildDefectSCurve(items: DefectForDashboard[], granularity: DefectSCurveBucket, startDate: string, endDate: string, today: string): DefectSCurvePoint[] {
  const counts = new Map<string, { cmp: number; cma: number; cp: number; ca: number }>();
  const ensure = (bucket: string) => {
    let value = counts.get(bucket);
    if (!value) { value = { cmp: 0, cma: 0, cp: 0, ca: 0 }; counts.set(bucket, value); }
    return value;
  };
  for (const item of items) {
    const completionPlan = getStagePlanDate(item, 'completion');
    const completionActual = getStageActualDate(item, 'completion');
    const closurePlan = getStagePlanDate(item, 'closure');
    const closureActual = getStageActualDate(item, 'closure');
    if (completionPlan) ensure(bucketize(completionPlan, granularity)).cmp++;
    if (completionActual) ensure(bucketize(completionActual, granularity)).cma++;
    if (closurePlan) ensure(bucketize(closurePlan, granularity)).cp++;
    if (closureActual) ensure(bucketize(closureActual, granularity)).ca++;
  }
  const buckets = generateBuckets(startDate, endDate, granularity);
  if (!buckets.length) return [];
  let ccmp = 0, ccma = 0, ccp = 0, cca = 0;
  for (const [bucket, value] of counts) {
    if (bucket < buckets[0]) { ccmp += value.cmp; ccma += value.cma; ccp += value.cp; cca += value.ca; }
  }
  const todayBucket = bucketize(today, granularity);
  return buckets.map((bucket) => {
    const value = counts.get(bucket) ?? { cmp: 0, cma: 0, cp: 0, ca: 0 };
    ccmp += value.cmp; ccma += value.cma; ccp += value.cp; cca += value.ca;
    const isFuture = bucket > todayBucket;
    const completionPlan = value.cmp;
    const completionDone = isFuture ? 0 : value.cma;
    const closurePlan = value.cp;
    const closureDone = isFuture ? 0 : value.ca;
    return {
      bucket,
      bucketLabel: labelDdMmm(bucket),
      completionPlan: ccmp,
      completionActual: isFuture ? null : ccma,
      closurePlan: ccp,
      closureActual: isFuture ? null : cca,
      completionMet: isFuture ? 0 : Math.min(completionPlan, completionDone),
      completionShortfall: isFuture ? 0 : Math.max(0, completionPlan - completionDone),
      completionExcess: isFuture ? 0 : Math.max(0, completionDone - completionPlan),
      completionFuturePlan: isFuture ? completionPlan : 0,
      closureMet: isFuture ? 0 : Math.min(closurePlan, closureDone),
      closureShortfall: isFuture ? 0 : Math.max(0, closurePlan - closureDone),
      closureExcess: isFuture ? 0 : Math.max(0, closureDone - closurePlan),
      closureFuturePlan: isFuture ? closurePlan : 0,
    };
  });
}
