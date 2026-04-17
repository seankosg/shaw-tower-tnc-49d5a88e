import type { TcStatus } from '@/types/enums';

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
}

export const NONE_LABEL = '(None)';

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + 'T00:00:00Z').getTime();
  const b = new Date(toIso + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000);
}

/** True if subtest has any T1 or T2 planned date past today and not Done. */
export function isOverdue(s: SubtestForDashboard, today: string): boolean {
  return (
    (s.t1_planned_date != null && s.t1_planned_date < today && s.t1_status !== 'Done') ||
    (s.t2_planned_date != null && s.t2_planned_date < today && s.t2_status !== 'Done')
  );
}

/** True if not overdue but a planned date is within `thresholdDays` (inclusive). */
export function isAtRisk(s: SubtestForDashboard, today: string, thresholdDays: number): boolean {
  if (isOverdue(s, today)) return false;
  const within = (planned: string | null, status: TcStatus | null) => {
    if (!planned || status === 'Done') return false;
    const d = daysBetween(today, planned);
    return d >= 0 && d <= thresholdDays;
  };
  return within(s.t1_planned_date, s.t1_status) || within(s.t2_planned_date, s.t2_status);
}

/** Worst delay days across T1/T2 (positive = days late). */
export function maxDelayDays(s: SubtestForDashboard, today: string): number {
  let worst = 0;
  if (s.t1_planned_date && s.t1_status !== 'Done' && s.t1_planned_date < today) {
    worst = Math.max(worst, daysBetween(s.t1_planned_date, today));
  }
  if (s.t2_planned_date && s.t2_status !== 'Done' && s.t2_planned_date < today) {
    worst = Math.max(worst, daysBetween(s.t2_planned_date, today));
  }
  return worst;
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

export type SCurveBucket = 'day' | 'week';

export interface SCurvePoint {
  bucket: string;
  t1Planned: number;
  t1Actual: number;
  t2Planned: number;
  t2Actual: number;
}

function bucketize(iso: string, granularity: SCurveBucket): string {
  if (granularity === 'day') return iso;
  // ISO week start (Monday)
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDay() || 7;
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}

export function buildSCurve(
  subs: SubtestForDashboard[],
  granularity: SCurveBucket,
  rangeDays?: number
): SCurvePoint[] {
  const counts = new Map<string, { t1p: number; t1a: number; t2p: number; t2a: number }>();
  const ensure = (b: string) => {
    let v = counts.get(b);
    if (!v) {
      v = { t1p: 0, t1a: 0, t2p: 0, t2a: 0 };
      counts.set(b, v);
    }
    return v;
  };
  for (const s of subs) {
    if (s.t1_planned_date) ensure(bucketize(s.t1_planned_date, granularity)).t1p++;
    if (s.t1_actual_date) ensure(bucketize(s.t1_actual_date, granularity)).t1a++;
    if (s.t2_planned_date) ensure(bucketize(s.t2_planned_date, granularity)).t2p++;
    if (s.t2_actual_date) ensure(bucketize(s.t2_actual_date, granularity)).t2a++;
  }

  let buckets = Array.from(counts.keys()).sort();
  if (rangeDays && buckets.length) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - rangeDays);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    buckets = buckets.filter(b => b >= cutoffIso);
  }

  let cT1p = 0,
    cT1a = 0,
    cT2p = 0,
    cT2a = 0;
  // include all buckets before range for cumulative carry-over
  const all = Array.from(counts.keys()).sort();
  const carrySet = new Set(buckets);
  for (const b of all) {
    const v = counts.get(b)!;
    if (!carrySet.has(b)) {
      cT1p += v.t1p;
      cT1a += v.t1a;
      cT2p += v.t2p;
      cT2a += v.t2a;
    }
  }

  return buckets.map(b => {
    const v = counts.get(b)!;
    cT1p += v.t1p;
    cT1a += v.t1a;
    cT2p += v.t2p;
    cT2a += v.t2a;
    return { bucket: b, t1Planned: cT1p, t1Actual: cT1a, t2Planned: cT2p, t2Actual: cT2a };
  });
}
