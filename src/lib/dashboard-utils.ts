import type { TcStatus } from '@/types/enums';
import {
  daysBetween,
  getMaxDelayDaysAsOf,
  getStageActualDate,
  getStageKeys,
  getStagePlannedDate,
  isStageActualOn,
  isStageActualUpTo,
  isStageDelayedAsOf,
  isStageDone,
  isStagePlannedOn,
  isStagePlannedUpTo,
  todayIso,
} from '@/lib/stage-metrics';

export interface SubtestForDashboard {
  id: string;
  item_no: string;
  mos_code: string;
  system_id: string;
  subcontractor_name: string | null;
  subsub_name: string | null;
  hdec_pic_name: string | null;
  t1_status: TcStatus | null;
  t2_status: TcStatus | null;
  t1_planned_date: string | null;
  t1_actual_date: string | null;
  t2_planned_date: string | null;
  t2_actual_date: string | null;
  pred_status?: TcStatus | null;
  pred_planned_date?: string | null;
  pred_actual_date?: string | null;
  predecessor_status_raw?: string | null;
  team?: string | null;
}

export const NONE_LABEL = '(None)';

export { todayIso, daysBetween };

/** True if subtest has any Pred/T1/T2 planned date on/before as-of date and not Done. */
export function isOverdue(s: SubtestForDashboard, asOfDate: string): boolean {
  return getStageKeys('all').some(stage => isStageDelayedAsOf(s, stage, asOfDate));
}

/** True if not overdue but a planned date is within `thresholdDays` (inclusive). */
export function isAtRisk(s: SubtestForDashboard, today: string, thresholdDays: number): boolean {
  if (isOverdue(s, today)) return false;
  const within = (stage: 'pred' | 't1' | 't2') => {
    const planned = getStagePlannedDate(s, stage);
    if (!planned || isStageDone(s, stage)) return false;
    const d = daysBetween(today, planned);
    return d >= 0 && d <= thresholdDays;
  };
  return within('pred') || within('t1') || within('t2');
}

/** Worst delay days across Pred/T1/T2 (positive = days late). */
export function maxDelayDays(s: SubtestForDashboard, today: string): number {
  return getMaxDelayDaysAsOf(s, getStageKeys('all'), today);
}

export type TestStatus = 'done' | 'in_progress' | 'not_started';

/** Aggregate Tests by (system_id, item_no). Test = Done iff all subtests' T2 are Done. */
export function aggregateTests(subs: SubtestForDashboard[]): Map<string, TestStatus> {
  const groups = new Map<string, SubtestForDashboard[]>();
  for (const s of subs) {
    const key = `${s.system_id}::${s.item_no}`;
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }
  const result = new Map<string, TestStatus>();
  for (const [key, items] of groups) {
    const allT2Done = items.every(i => i.t2_status === 'Done');
    const anyStarted = items.some(
      i => i.t1_status === 'WIP' || i.t1_status === 'Done' || i.t2_status === 'WIP' || i.t2_status === 'Done'
    );
    result.set(key, allT2Done ? 'done' : anyStarted ? 'in_progress' : 'not_started');
  }
  return result;
}

export interface GroupAggregate {
  key: string;
  label: string;
  totalTests: number;
  testsDone: number;
  testsInProgress: number;
  testsNotStarted: number;
  overdueSubtests: number;
  t1DonePct: number;
  t2DonePct: number;
  totalSubtests: number;
}

/** Aggregate by a grouping key extractor. */
export function aggregateByGroup(
  subs: SubtestForDashboard[],
  today: string,
  groupKey: (s: SubtestForDashboard) => string,
  groupLabel: (key: string) => string
): GroupAggregate[] {
  const buckets = new Map<string, SubtestForDashboard[]>();
  for (const s of subs) {
    const k = groupKey(s);
    const arr = buckets.get(k) ?? [];
    arr.push(s);
    buckets.set(k, arr);
  }

  const out: GroupAggregate[] = [];
  for (const [k, items] of buckets) {
    const tests = aggregateTests(items);
    let done = 0,
      wip = 0,
      not = 0;
    for (const st of tests.values()) {
      if (st === 'done') done++;
      else if (st === 'in_progress') wip++;
      else not++;
    }
    const overdue = items.filter(i => isOverdue(i, today)).length;
    const t1Done = items.filter(i => i.t1_status === 'Done').length;
    const t2Done = items.filter(i => i.t2_status === 'Done').length;
    out.push({
      key: k,
      label: groupLabel(k),
      totalTests: tests.size,
      testsDone: done,
      testsInProgress: wip,
      testsNotStarted: not,
      overdueSubtests: overdue,
      t1DonePct: items.length ? Math.round((t1Done / items.length) * 100) : 0,
      t2DonePct: items.length ? Math.round((t2Done / items.length) * 100) : 0,
      totalSubtests: items.length,
    });
  }
  return out.sort((a, b) => b.overdueSubtests - a.overdueSubtests || a.label.localeCompare(b.label));
}

export interface PlanActualMetrics {
  /** Cumulative as of Data Date (planned_date <= dataDate) */
  cumPlan: number;
  /** Cumulative as of Data Date (actual_date <= dataDate) */
  cumActual: number;
  /** Planned exactly on Data Date (planned_date === dataDate) */
  dataDatePlan: number;
  /** Actual exactly on Data Date (actual_date === dataDate) */
  dataDateActual: number;
  /** Delayed as of Data Date (planned_date <= dataDate and not Done) */
  dataDateDelay: number;
  /** @deprecated Use dataDatePlan. */
  yesterdayPlan: number;
  /** @deprecated Use dataDateActual. */
  yesterdayActual: number;
  /** @deprecated Use dataDateDelay. */
  yesterdayDelay: number;
  todayPlan: number;
  todayActual: number;
  todayDelay: number;
}

/** Returns ISO date string for (today - 1 day). */
export function yesterdayIso(today: string): string {
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface PlanActualRow {
  key: string;
  label: string;
  totalSubtests: number;
  predecessor: PlanActualMetrics;
  t1: PlanActualMetrics;
  t2: PlanActualMetrics;
}

/** Aggregate Plan vs Actual metrics by group. */
export function aggregatePlanActualByGroup(
  subs: SubtestForDashboard[],
  today: string,
  dataDate: string,
  groupKey: (s: SubtestForDashboard) => string,
  groupLabel: (key: string) => string
): PlanActualRow[] {
  const buckets = new Map<string, SubtestForDashboard[]>();
  for (const s of subs) {
    const k = groupKey(s);
    const arr = buckets.get(k) ?? [];
    arr.push(s);
    buckets.set(k, arr);
  }

  const out: PlanActualRow[] = [];
  for (const [k, items] of buckets) {
    const calc = (stage: 'pred' | 't1' | 't2'): PlanActualMetrics => {
      let cumPlan = 0, cumActual = 0, dataDatePlan = 0, dataDateActual = 0, dataDateDelay = 0, tPlan = 0, tActual = 0, tDelay = 0;
      for (const i of items) {
        if (isStagePlannedUpTo(i, stage, dataDate)) cumPlan++;
        if (isStageActualUpTo(i, stage, dataDate)) cumActual++;
        if (isStagePlannedOn(i, stage, dataDate)) dataDatePlan++;
        if (isStageActualOn(i, stage, dataDate)) dataDateActual++;
        if (isStageDelayedAsOf(i, stage, dataDate)) dataDateDelay++;
        if (isStagePlannedOn(i, stage, today)) tPlan++;
        if (isStageActualOn(i, stage, today)) tActual++;
        if (isStagePlannedOn(i, stage, today) && !isStageDone(i, stage)) tDelay++;
      }
      return {
        cumPlan,
        cumActual,
        dataDatePlan,
        dataDateActual,
        dataDateDelay,
        yesterdayPlan: dataDatePlan,
        yesterdayActual: dataDateActual,
        yesterdayDelay: dataDateDelay,
        todayPlan: tPlan,
        todayActual: tActual,
        todayDelay: tDelay,
      };
    };
    out.push({
      key: k,
      label: groupLabel(k),
      totalSubtests: items.length,
      predecessor: calc('pred'),
      t1: calc('t1'),
      t2: calc('t2'),
    });
  }
  // default sort: most-delayed (largest negative cumulative variance T2 then T1) first
  return out.sort((a, b) => {
    const va = (a.t1.cumActual - a.t1.cumPlan) + (a.t2.cumActual - a.t2.cumPlan);
    const vb = (b.t1.cumActual - b.t1.cumPlan) + (b.t2.cumActual - b.t2.cumPlan);
    return va - vb || a.label.localeCompare(b.label);
  });
}

export type SCurveBucket = 'day' | 'week';

export interface SCurvePoint {
  bucket: string;
  bucketLabel: string;
  t1Planned: number;
  t1Actual: number | null;
  t2Planned: number;
  t2Actual: number | null;
  // T1 stacked bar segments
  t1Met: number;            // min(plan, actual)
  t1Shortfall: number;      // max(0, plan - actual)
  t1Excess: number;         // max(0, actual - plan)
  t1FuturePlan: number;     // future: plan value (light color)
  // T2 stacked bar segments
  t2Met: number;
  t2Shortfall: number;
  t2Excess: number;
  t2FuturePlan: number;     // future: plan value (light color)
}

const MONTH_ABBR_SC = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function labelDdMmm(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}-${MONTH_ABBR_SC[parseInt(m[2], 10) - 1]}`;
}

function bucketize(iso: string, granularity: SCurveBucket): string {
  if (granularity === 'day') return iso;
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDay() || 7;
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}

function generateBuckets(startDate: string, endDate: string, granularity: SCurveBucket): string[] {
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

export function buildSCurve(
  subs: SubtestForDashboard[],
  granularity: SCurveBucket,
  startDate: string,
  endDate: string,
  today: string,
): SCurvePoint[] {
  const counts = new Map<string, { t1p: number; t1a: number; t2p: number; t2a: number }>();
  const ensure = (b: string) => {
    let v = counts.get(b);
    if (!v) { v = { t1p: 0, t1a: 0, t2p: 0, t2a: 0 }; counts.set(b, v); }
    return v;
  };
  for (const s of subs) {
    const t1Plan = getStagePlannedDate(s, 't1');
    const t1Actual = getStageActualDate(s, 't1');
    const t2Plan = getStagePlannedDate(s, 't2');
    const t2Actual = getStageActualDate(s, 't2');
    if (t1Plan) ensure(bucketize(t1Plan, granularity)).t1p++;
    if (t1Actual) ensure(bucketize(t1Actual, granularity)).t1a++;
    if (t2Plan) ensure(bucketize(t2Plan, granularity)).t2p++;
    if (t2Actual) ensure(bucketize(t2Actual, granularity)).t2a++;
  }

  const buckets = generateBuckets(startDate, endDate, granularity);
  if (buckets.length === 0) return [];

  let cT1p = 0, cT1a = 0, cT2p = 0, cT2a = 0;
  for (const [b, v] of counts) {
    if (b < buckets[0]) {
      cT1p += v.t1p; cT1a += v.t1a; cT2p += v.t2p; cT2a += v.t2a;
    }
  }

  const todayBucket = bucketize(today, granularity);

  return buckets.map(b => {
    const v = counts.get(b) ?? { t1p: 0, t1a: 0, t2p: 0, t2a: 0 };
    cT1p += v.t1p; cT1a += v.t1a; cT2p += v.t2p; cT2a += v.t2a;
    const isFuture = b > todayBucket;
    const t1p = v.t1p;
    const t1a = isFuture ? 0 : v.t1a;
    const t2p = v.t2p;
    const t2a = isFuture ? 0 : v.t2a;
    return {
      bucket: b,
      bucketLabel: labelDdMmm(b),
      t1Planned: cT1p,
      t1Actual: isFuture ? null : cT1a,
      t2Planned: cT2p,
      t2Actual: isFuture ? null : cT2a,
      t1Met: isFuture ? 0 : Math.min(t1p, t1a),
      t1Shortfall: isFuture ? 0 : Math.max(0, t1p - t1a),
      t1Excess: isFuture ? 0 : Math.max(0, t1a - t1p),
      t1FuturePlan: isFuture ? t1p : 0,
      t2Met: isFuture ? 0 : Math.min(t2p, t2a),
      t2Shortfall: isFuture ? 0 : Math.max(0, t2p - t2a),
      t2Excess: isFuture ? 0 : Math.max(0, t2a - t2p),
      t2FuturePlan: isFuture ? t2p : 0,
    };
  });
}
