import type { TcStatus, ReportStatus } from '@/types/enums';
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
  type StageKey,
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
  is_critical?: boolean;
  // R1 — Subcontractor → HDEC
  r1_status?: ReportStatus | null;
  r1_target_submission_date?: string | null;
  r1_actual_submission_date?: string | null;
  // R2 — HDEC → Client (final approval)
  r2_status?: ReportStatus | null;
  r2_target_submission_date?: string | null;
  r2_actual_submission_date?: string | null;
  r2_target_approval_date?: string | null;
  r2_actual_approval_date?: string | null;
}

export const NONE_LABEL = '(None)';

export { todayIso, daysBetween };

/**
 * Stages considered for the dashboard's Overdue / At-Risk / Top Overdue cards.
 * R1/R2 (report stages) are intentionally excluded — those are tracked via the
 * dedicated R1/R2 stage cards and Plan vs Actual rows. Overdue cards focus on
 * physical test execution delays (Pred → T1 → T2) only.
 */
const OVERDUE_STAGES: StageKey[] = ['pred', 't1', 't2'];

/** True if subtest has any Pred/T1/T2 planned date on/before as-of date and not Done. */
export function isOverdue(s: SubtestForDashboard, asOfDate: string): boolean {
  return OVERDUE_STAGES.some(stage => isStageDelayedAsOf(s, stage, asOfDate));
}

/** True if not overdue but a Pred/T1/T2 planned date is within `thresholdDays` (inclusive). */
export function isAtRisk(s: SubtestForDashboard, today: string, thresholdDays: number): boolean {
  if (isOverdue(s, today)) return false;
  const within = (stage: StageKey) => {
    const planned = getStagePlannedDate(s, stage);
    if (!planned || isStageDone(s, stage)) return false;
    const d = daysBetween(today, planned);
    return d >= 0 && d <= thresholdDays;
  };
  return OVERDUE_STAGES.some(within);
}

/** Worst delay days across Pred/T1/T2 (positive = days late). */
export function maxDelayDays(s: SubtestForDashboard, today: string): number {
  return getMaxDelayDaysAsOf(s, OVERDUE_STAGES, today);
}

/**
 * All workflow stages — used by the dedicated all-stage Overdue / At-Risk
 * alert banner (Tier 3) which intentionally surfaces R1/R2 report delays
 * alongside Pred/T1/T2 execution delays.
 * R2 = R2 Submission (r2s) — the active key milestone. R2 Approval (r2a)
 * is hidden from UI per business decision; data is still captured.
 */
const ALL_STAGES: StageKey[] = ['pred', 't1', 't2', 'r1', 'r2s'];

/** True if any of the 5 stages has planned date on/before as-of date and not Done. */
export function isOverdueAllStages(s: SubtestForDashboard, asOfDate: string): boolean {
  return ALL_STAGES.some(stage => isStageDelayedAsOf(s, stage, asOfDate));
}

/** True if not all-stage overdue but any of the 5 stages is planned within thresholdDays. */
export function isAtRiskAllStages(s: SubtestForDashboard, today: string, thresholdDays: number): boolean {
  if (isOverdueAllStages(s, today)) return false;
  const within = (stage: StageKey) => {
    const planned = getStagePlannedDate(s, stage);
    if (!planned || isStageDone(s, stage)) return false;
    const d = daysBetween(today, planned);
    return d >= 0 && d <= thresholdDays;
  };
  return ALL_STAGES.some(within);
}

/**
 * Stages used for "stage occurrence" sum displayed in the Tier 3 banner.
 * Matches the 5 Tier 2 stage cards: Pred / T1 / T2 / R1S / R2S.
 */
const OCCURRENCE_STAGES: StageKey[] = ['pred', 't1', 't2', 'r1', 'r2s'];

/**
 * Sum of overdue counts across the 5 Tier-2 stages (Pred/T1/T2/R1S/R2S).
 * A single subtest can contribute multiple times if multiple stages are overdue.
 * This equals the sum of OD badges shown on Tier 2 stage cards.
 */
export function countOverdueStageOccurrences(subs: SubtestForDashboard[], asOfDate: string): number {
  let total = 0;
  for (const s of subs) {
    for (const stage of OCCURRENCE_STAGES) {
      if (isStageDelayedAsOf(s, stage, asOfDate)) total++;
    }
  }
  return total;
}

/**
 * Sum of at-risk counts across the 5 Tier-2 stages: planned within
 * `thresholdDays` from `today` (inclusive), not yet Done.
 * A single subtest can contribute multiple times.
 */
export function countAtRiskStageOccurrences(
  subs: SubtestForDashboard[],
  today: string,
  thresholdDays: number,
): number {
  let total = 0;
  for (const s of subs) {
    for (const stage of OCCURRENCE_STAGES) {
      const planned = getStagePlannedDate(s, stage);
      if (!planned || isStageDone(s, stage)) continue;
      const d = daysBetween(today, planned);
      if (d >= 0 && d <= thresholdDays) total++;
    }
  }
  return total;
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
  r1: PlanActualMetrics;
  r2: PlanActualMetrics;
}

export type TcPlanMode = 'baseline' | 'remaining';

/** Aggregate Plan vs Actual metrics by group. */
export function aggregatePlanActualByGroup(
  subs: SubtestForDashboard[],
  today: string,
  dataDate: string,
  groupKey: (s: SubtestForDashboard) => string,
  groupLabel: (key: string) => string,
  planMode: TcPlanMode = 'baseline',
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
    const calc = (stage: StageKey): PlanActualMetrics => {
      let cumPlan = 0, cumActual = 0, dataDatePlan = 0, dataDateActual = 0, dataDateDelay = 0, tPlan = 0, tActual = 0, tDelay = 0;
      for (const i of items) {
        const doneAsOfData = isStageActualUpTo(i, stage, dataDate);
        const doneAsOfToday = isStageActualUpTo(i, stage, today);
        const countPlanData = planMode === 'baseline' || !doneAsOfData;
        const countPlanToday = planMode === 'baseline' || !doneAsOfToday;
        if (countPlanData && isStagePlannedUpTo(i, stage, dataDate)) cumPlan++;
        if (doneAsOfData) cumActual++;
        if (countPlanData && isStagePlannedOn(i, stage, dataDate)) dataDatePlan++;
        if (isStageActualOn(i, stage, dataDate)) dataDateActual++;
        if (countPlanData && isStagePlannedOn(i, stage, dataDate) && !isStageDone(i, stage)) dataDateDelay++;
        if (countPlanToday && isStagePlannedOn(i, stage, today)) tPlan++;
        if (isStageActualOn(i, stage, today)) tActual++;
        if (countPlanToday && isStagePlannedOn(i, stage, today) && !isStageDone(i, stage)) tDelay++;
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
      r1: calc('r1'),
      // r2 entry uses the submission milestone (r2s) — active key indicator.
      r2: calc('r2s'),
    });
  }
  // Alphabetic ascending by group label (consistent with Defect Dashboard).
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

export type SCurveBucket = 'day' | 'week';

export interface SCurvePoint {
  bucket: string;
  bucketLabel: string;
  t1Planned: number;
  t1Actual: number | null;
  t2Planned: number;
  t2Actual: number | null;
  r2sPlanned: number;
  r2sActual: number | null;
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
  planMode: TcPlanMode = 'baseline',
  asOfDate?: string,
): SCurvePoint[] {
  const counts = new Map<string, { t1p: number; t1a: number; t2p: number; t2a: number }>();
  const ensure = (b: string) => {
    let v = counts.get(b);
    if (!v) { v = { t1p: 0, t1a: 0, t2p: 0, t2a: 0 }; counts.set(b, v); }
    return v;
  };
  const asOf = asOfDate ?? today;
  for (const s of subs) {
    const t1Plan = getStagePlannedDate(s, 't1');
    const t1Actual = getStageActualDate(s, 't1');
    const t2Plan = getStagePlannedDate(s, 't2');
    const t2Actual = getStageActualDate(s, 't2');
    const t1DoneAsOf = isStageActualUpTo(s, 't1', asOf);
    const t2DoneAsOf = isStageActualUpTo(s, 't2', asOf);
    const countT1Plan = planMode === 'baseline' || !t1DoneAsOf;
    const countT2Plan = planMode === 'baseline' || !t2DoneAsOf;
    if (t1Plan && countT1Plan) ensure(bucketize(t1Plan, granularity)).t1p++;
    if (t1Actual) ensure(bucketize(t1Actual, granularity)).t1a++;
    if (t2Plan && countT2Plan) ensure(bucketize(t2Plan, granularity)).t2p++;
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
