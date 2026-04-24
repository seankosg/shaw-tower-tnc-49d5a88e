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
  start: DefectPlanActualMetrics;
  completion: DefectPlanActualMetrics;
  closure: DefectPlanActualMetrics;
}

export interface DefectSCurvePoint {
  bucket: string;
  bucketLabel: string;
  startPlan: number;
  startActual: number | null;
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

export function isActualComplete(item: Pick<DefectForDashboard, 'actual_completion_date' | 'actual_progress_pct'>): boolean {
  return Boolean(item.actual_completion_date) || Number(item.actual_progress_pct ?? 0) >= 100;
}

export function isClosureComplete(item: Pick<DefectForDashboard, 'actual_closure_date'>): boolean {
  return Boolean(item.actual_closure_date);
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

export function isStageDone(item: DefectForDashboard, stage: DefectDashboardStage): boolean {
  if (stage === 'start') return Boolean(item.actual_start_date);
  if (stage === 'completion') return isActualComplete(item);
  return isClosureComplete(item);
}

export function isStageDelayedAsOf(item: DefectForDashboard, stage: DefectDashboardStage, asOfDate: string): boolean {
  const plan = getStagePlanDate(item, stage);
  return Boolean(plan && plan <= asOfDate && !isStageDone(item, stage));
}

export function isOverdue(item: DefectForDashboard, asOfDate: string): boolean {
  return (['start', 'completion', 'closure'] as DefectDashboardStage[]).some((stage) => isStageDelayedAsOf(item, stage, asOfDate));
}

export function isAtRisk(item: DefectForDashboard, today: string, thresholdDays: number): boolean {
  if (isOverdue(item, today)) return false;
  return (['start', 'completion', 'closure'] as DefectDashboardStage[]).some((stage) => {
    const plan = getStagePlanDate(item, stage);
    if (!plan || isStageDone(item, stage)) return false;
    const diff = daysBetween(today, plan);
    return diff >= 0 && diff <= thresholdDays;
  });
}

export function maxDelayDays(item: DefectForDashboard, asOfDate: string): number {
  return Math.max(0, ...(['start', 'completion', 'closure'] as DefectDashboardStage[]).map((stage) => {
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
    if (isStageDelayedAsOf(item, stage, dataDate)) dataDateDelay++;
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
    start: calcMetrics(rows, 'start', today, dataDate),
    completion: calcMetrics(rows, 'completion', today, dataDate),
    closure: calcMetrics(rows, 'closure', today, dataDate),
  })).sort((a, b) => {
    const va = (a.start.cumActual - a.start.cumPlan) + (a.completion.cumActual - a.completion.cumPlan) + (a.closure.cumActual - a.closure.cumPlan);
    const vb = (b.start.cumActual - b.start.cumPlan) + (b.completion.cumActual - b.completion.cumPlan) + (b.closure.cumActual - b.closure.cumPlan);
    return va - vb || a.label.localeCompare(b.label);
  });
}

export function buildDefectSCurve(items: DefectForDashboard[], granularity: DefectSCurveBucket, startDate: string, endDate: string, today: string): DefectSCurvePoint[] {
  const counts = new Map<string, { sp: number; sa: number; cmp: number; cma: number; cp: number; ca: number }>();
  const ensure = (bucket: string) => {
    let value = counts.get(bucket);
    if (!value) { value = { sp: 0, sa: 0, cmp: 0, cma: 0, cp: 0, ca: 0 }; counts.set(bucket, value); }
    return value;
  };
  for (const item of items) {
    const startPlan = getStagePlanDate(item, 'start');
    const startActual = getStageActualDate(item, 'start');
    const completionPlan = getStagePlanDate(item, 'completion');
    const completionActual = getStageActualDate(item, 'completion');
    const closurePlan = getStagePlanDate(item, 'closure');
    const closureActual = getStageActualDate(item, 'closure');
    if (startPlan) ensure(bucketize(startPlan, granularity)).sp++;
    if (startActual) ensure(bucketize(startActual, granularity)).sa++;
    if (completionPlan) ensure(bucketize(completionPlan, granularity)).cmp++;
    if (completionActual) ensure(bucketize(completionActual, granularity)).cma++;
    if (closurePlan) ensure(bucketize(closurePlan, granularity)).cp++;
    if (closureActual) ensure(bucketize(closureActual, granularity)).ca++;
  }
  const buckets = generateBuckets(startDate, endDate, granularity);
  if (!buckets.length) return [];
  let csp = 0, csa = 0, ccmp = 0, ccma = 0, ccp = 0, cca = 0;
  for (const [bucket, value] of counts) {
    if (bucket < buckets[0]) { csp += value.sp; csa += value.sa; ccmp += value.cmp; ccma += value.cma; ccp += value.cp; cca += value.ca; }
  }
  const todayBucket = bucketize(today, granularity);
  return buckets.map((bucket) => {
    const value = counts.get(bucket) ?? { sp: 0, sa: 0, cmp: 0, cma: 0, cp: 0, ca: 0 };
    csp += value.sp; csa += value.sa; ccmp += value.cmp; ccma += value.cma; ccp += value.cp; cca += value.ca;
    const isFuture = bucket > todayBucket;
    const completionPlan = value.cmp;
    const completionDone = isFuture ? 0 : value.cma;
    const closurePlan = value.cp;
    const closureDone = isFuture ? 0 : value.ca;
    return {
      bucket,
      bucketLabel: labelDdMmm(bucket),
      startPlan: csp,
      startActual: isFuture ? null : csa,
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
