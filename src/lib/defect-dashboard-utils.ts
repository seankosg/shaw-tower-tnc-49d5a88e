import { type DefectItem } from '@/lib/defect-utils';

export const NONE_LABEL = '(None)';
export type DefectDashboardStage = 'planned' | 'target' | 'closure';
export type DefectSCurveBucket = 'day' | 'week';

export interface DefectForDashboard extends DefectItem {
  actual_date: string | null;
}

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
  planned: DefectPlanActualMetrics;
  target: DefectPlanActualMetrics;
  closure: DefectPlanActualMetrics;
}

export interface DefectSCurvePoint {
  bucket: string;
  bucketLabel: string;
  plannedPlan: number;
  plannedActual: number | null;
  targetPlan: number;
  targetActual: number | null;
  closurePlan: number;
  closureActual: number | null;
  actualMet: number;
  actualShortfall: number;
  actualExcess: number;
  actualFuturePlan: number;
  closureMet: number;
  closureShortfall: number;
  closureExcess: number;
  closureFuturePlan: number;
}

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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

export function isActualComplete(item: Pick<DefectForDashboard, 'actual_progress_pct'>): boolean {
  return Number(item.actual_progress_pct ?? 0) >= 100;
}

export function isClosureComplete(item: Pick<DefectForDashboard, 'closed_date'>): boolean {
  return Boolean(item.closed_date);
}

export function getStagePlanDate(item: DefectForDashboard, stage: DefectDashboardStage): string | null {
  if (stage === 'planned') return item.planned_date;
  if (stage === 'target') return item.target_date;
  return item.target_date ?? item.planned_date;
}

export function getStageActualDate(item: DefectForDashboard, stage: DefectDashboardStage): string | null {
  if (stage === 'closure') return item.closed_date;
  return isActualComplete(item) ? item.actual_date : null;
}

export function isStageDone(item: DefectForDashboard, stage: DefectDashboardStage): boolean {
  return stage === 'closure' ? isClosureComplete(item) : isActualComplete(item);
}

export function isStageDelayedAsOf(item: DefectForDashboard, stage: DefectDashboardStage, asOfDate: string): boolean {
  const plan = getStagePlanDate(item, stage);
  return Boolean(plan && plan <= asOfDate && !isStageDone(item, stage));
}

export function isOverdue(item: DefectForDashboard, asOfDate: string): boolean {
  return isStageDelayedAsOf(item, 'planned', asOfDate) || isStageDelayedAsOf(item, 'target', asOfDate) || isStageDelayedAsOf(item, 'closure', asOfDate);
}

export function isAtRisk(item: DefectForDashboard, today: string, thresholdDays: number): boolean {
  if (isOverdue(item, today)) return false;
  return (['planned', 'target', 'closure'] as DefectDashboardStage[]).some((stage) => {
    const plan = getStagePlanDate(item, stage);
    if (!plan || isStageDone(item, stage)) return false;
    const diff = daysBetween(today, plan);
    return diff >= 0 && diff <= thresholdDays;
  });
}

export function maxDelayDays(item: DefectForDashboard, asOfDate: string): number {
  return Math.max(0, ...(['planned', 'target', 'closure'] as DefectDashboardStage[]).map((stage) => {
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
    planned: calcMetrics(rows, 'planned', today, dataDate),
    target: calcMetrics(rows, 'target', today, dataDate),
    closure: calcMetrics(rows, 'closure', today, dataDate),
  })).sort((a, b) => {
    const va = (a.planned.cumActual - a.planned.cumPlan) + (a.target.cumActual - a.target.cumPlan) + (a.closure.cumActual - a.closure.cumPlan);
    const vb = (b.planned.cumActual - b.planned.cumPlan) + (b.target.cumActual - b.target.cumPlan) + (b.closure.cumActual - b.closure.cumPlan);
    return va - vb || a.label.localeCompare(b.label);
  });
}

export function buildDefectSCurve(items: DefectForDashboard[], granularity: DefectSCurveBucket, startDate: string, endDate: string, today: string): DefectSCurvePoint[] {
  const counts = new Map<string, { pp: number; pa: number; tp: number; ta: number; cp: number; ca: number }>();
  const ensure = (bucket: string) => {
    let value = counts.get(bucket);
    if (!value) { value = { pp: 0, pa: 0, tp: 0, ta: 0, cp: 0, ca: 0 }; counts.set(bucket, value); }
    return value;
  };
  for (const item of items) {
    const plannedPlan = getStagePlanDate(item, 'planned');
    const plannedActual = getStageActualDate(item, 'planned');
    const targetPlan = getStagePlanDate(item, 'target');
    const targetActual = getStageActualDate(item, 'target');
    const closurePlan = getStagePlanDate(item, 'closure');
    const closureActual = getStageActualDate(item, 'closure');
    if (plannedPlan) ensure(bucketize(plannedPlan, granularity)).pp++;
    if (plannedActual) ensure(bucketize(plannedActual, granularity)).pa++;
    if (targetPlan) ensure(bucketize(targetPlan, granularity)).tp++;
    if (targetActual) ensure(bucketize(targetActual, granularity)).ta++;
    if (closurePlan) ensure(bucketize(closurePlan, granularity)).cp++;
    if (closureActual) ensure(bucketize(closureActual, granularity)).ca++;
  }
  const buckets = generateBuckets(startDate, endDate, granularity);
  if (!buckets.length) return [];
  let cpp = 0, cpa = 0, ctp = 0, cta = 0, ccp = 0, cca = 0;
  for (const [bucket, value] of counts) {
    if (bucket < buckets[0]) { cpp += value.pp; cpa += value.pa; ctp += value.tp; cta += value.ta; ccp += value.cp; cca += value.ca; }
  }
  const todayBucket = bucketize(today, granularity);
  return buckets.map((bucket) => {
    const value = counts.get(bucket) ?? { pp: 0, pa: 0, tp: 0, ta: 0, cp: 0, ca: 0 };
    cpp += value.pp; cpa += value.pa; ctp += value.tp; cta += value.ta; ccp += value.cp; cca += value.ca;
    const isFuture = bucket > todayBucket;
    const actualPlan = value.tp;
    const actualDone = isFuture ? 0 : value.ta;
    const closurePlan = value.cp;
    const closureDone = isFuture ? 0 : value.ca;
    return {
      bucket,
      bucketLabel: labelDdMmm(bucket),
      plannedPlan: cpp,
      plannedActual: isFuture ? null : cpa,
      targetPlan: ctp,
      targetActual: isFuture ? null : cta,
      closurePlan: ccp,
      closureActual: isFuture ? null : cca,
      actualMet: isFuture ? 0 : Math.min(actualPlan, actualDone),
      actualShortfall: isFuture ? 0 : Math.max(0, actualPlan - actualDone),
      actualExcess: isFuture ? 0 : Math.max(0, actualDone - actualPlan),
      actualFuturePlan: isFuture ? actualPlan : 0,
      closureMet: isFuture ? 0 : Math.min(closurePlan, closureDone),
      closureShortfall: isFuture ? 0 : Math.max(0, closurePlan - closureDone),
      closureExcess: isFuture ? 0 : Math.max(0, closureDone - closurePlan),
      closureFuturePlan: isFuture ? closurePlan : 0,
    };
  });
}
