// Schedule page utilities — bucketization, group aggregation, critical detection.
import type { TcStatus } from '@/types/enums';
import type { SubtestForDashboard } from '@/lib/dashboard-utils';
import {
  getStageActualDate,
  getStageKeys,
  getStagePlannedDate,
  isStageActualUpTo,
  isStageDelayedAsOf,
  isStageDone,
  isStagePlannedUpTo,
  type StageKey,
} from '@/lib/stage-metrics';

export type ScheduleStage = StageKey;
export type ScheduleStageFilter = 'all' | ScheduleStage;
export type ScheduleBucket = 'day' | 'week';
export type ScheduleGroupBy = 'system' | 'subcon' | 'subsub' | 'hdec' | 'team';

export interface BucketCell {
  bucket: string; // ISO date (day) or week-start ISO
  plan: number;
  actual: number;
}

export interface StageRow {
  stage: ScheduleStage;
  cells: BucketCell[];
  totalPlan: number;
  totalActual: number;
  totalDone: number; // # subtests actual-completed up to the selected as-of date
  total: number; // # subtests in group (denominator)
  /** # of subtests with plan_date <= selected as-of date (for this stage). */
  cumPlan: number;
  /** # of subtests with actual_date <= selected as-of date (for this stage). */
  cumActual: number;
}

export interface GroupRow {
  key: string;
  label: string;
  total: number; // # subtests in group
  doneCount: number; // # selected stages actual-completed up to the selected as-of date
  cumPlan: number;
  cumActual: number;
  stages: Record<ScheduleStage, StageRow>;
  // Combined cells for collapsed view (sum of selected stages)
  combined: BucketCell[];
}

export interface CriticalItem {
  subtestId: string;
  systemCode: string;
  itemNo: string;
  mosCode: string;
  stage: ScheduleStage;
  daysLeft: number;
  plannedDate: string;
  status: TcStatus | string | null;
  group: string;
}

export interface LaggingGroup {
  key: string;
  label: string;
  cumPlan: number;
  cumActual: number;
  ratio: number; // actual / plan
  total: number;
}

// ───── helpers ─────
export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

export function weekStartIso(iso: string): string {
  // ISO week (Monday)
  const d = new Date(iso + 'T00:00:00Z');
  const dow = d.getUTCDay() || 7;
  if (dow !== 1) d.setUTCDate(d.getUTCDate() - (dow - 1));
  return toIso(d);
}

export function bucketize(iso: string, granularity: ScheduleBucket): string {
  return granularity === 'day' ? iso : weekStartIso(iso);
}

/** Build sorted bucket list covering [startIso, endIso] inclusive. */
export function buildBucketRange(startIso: string, endIso: string, granularity: ScheduleBucket): string[] {
  const out: string[] = [];
  let cur = granularity === 'day' ? startIso : weekStartIso(startIso);
  const end = granularity === 'day' ? endIso : weekStartIso(endIso);
  let safety = 0;
  while (cur <= end && safety < 1000) {
    out.push(cur);
    cur = addDays(cur, granularity === 'day' ? 1 : 7);
    safety++;
  }
  return out;
}

// ───── group key extractors ─────
export function getGroupKey(s: SubtestForDashboard, by: ScheduleGroupBy, sysCodeById: Map<string, string>): string {
  if (by === 'system') return sysCodeById.get(s.system_id) ?? '—';
  if (by === 'subcon') return s.subcontractor_name ?? '(None)';
  if (by === 'hdec') return s.hdec_pic_name ?? '(None)';
  if (by === 'team') return s.team ?? '(None)';
  return s.subsub_name ?? '(None)';
}

export function isPredDone(s: SubtestForDashboard & { predecessor_status_raw?: string | null }): boolean {
  return isStageDone(s, 'pred');
}

function getStageDates(
  s: SubtestForDashboard,
  stage: ScheduleStage
): { plan: string | null; actual: string | null } {
  return {
    plan: getStagePlannedDate(s, stage),
    actual: getStageActualDate(s, stage),
  };
}

// ───── main aggregation ─────
export interface AggregateOptions {
  groupBy: ScheduleGroupBy;
  bucket: ScheduleBucket;
  stageFilter: ScheduleStageFilter;
  rangeStart: string;
  rangeEnd: string;
  /** Selected as-of ISO date — used to compute cumulative Plan/Actual. */
  asOfDate: string;
  sysCodeById: Map<string, string>;
}

export interface AggregateResult {
  buckets: string[];
  rows: GroupRow[];
}

export function aggregateSchedule(
  subs: SubtestForDashboard[],
  opts: AggregateOptions
): AggregateResult {
  const buckets = buildBucketRange(opts.rangeStart, opts.rangeEnd, opts.bucket);
  const bucketIdx = new Map<string, number>();
  buckets.forEach((b, i) => bucketIdx.set(b, i));

  const groupMap = new Map<string, SubtestForDashboard[]>();
  for (const s of subs) {
    const k = getGroupKey(s, opts.groupBy, opts.sysCodeById);
    const arr = groupMap.get(k) ?? [];
    arr.push(s);
    groupMap.set(k, arr);
  }

  const stagesToShow = getStageKeys(opts.stageFilter);

  const rows: GroupRow[] = [];
  for (const [key, items] of groupMap) {
    const stageData: Record<ScheduleStage, StageRow> = {
      pred: emptyStageRow('pred', buckets, items.length),
      t1: emptyStageRow('t1', buckets, items.length),
      t2: emptyStageRow('t2', buckets, items.length),
      r1: emptyStageRow('r1', buckets, items.length),
      r2: emptyStageRow('r2', buckets, items.length),
    };

    for (const s of items) {
      for (const st of ['pred', 't1', 't2', 'r1', 'r2'] as ScheduleStage[]) {
        const { plan, actual } = getStageDates(s, st);
        if (plan) {
          const b = bucketize(plan, opts.bucket);
          const i = bucketIdx.get(b);
          if (i !== undefined) {
            stageData[st].cells[i].plan++;
            stageData[st].totalPlan++;
          }
          if (isStagePlannedUpTo(s, st, opts.asOfDate)) stageData[st].cumPlan++;
        }
        if (actual) {
          const b = bucketize(actual, opts.bucket);
          const i = bucketIdx.get(b);
          if (i !== undefined) {
            stageData[st].cells[i].actual++;
            stageData[st].totalActual++;
          }
          if (isStageActualUpTo(s, st, opts.asOfDate)) stageData[st].cumActual++;
        }
        if (isStageActualUpTo(s, st, opts.asOfDate)) stageData[st].totalDone++;
      }
    }

    // combined = sum of stages in stageFilter
    const combined: BucketCell[] = buckets.map(b => ({ bucket: b, plan: 0, actual: 0 }));
    for (const st of stagesToShow) {
      stageData[st].cells.forEach((c, i) => {
        combined[i].plan += c.plan;
        combined[i].actual += c.actual;
      });
    }

    // cumPlan / cumActual / doneCount = sum across stages in filter
    let cumPlan = 0;
    let cumActual = 0;
    let doneCount = 0;
    for (const st of stagesToShow) {
      cumPlan += stageData[st].cumPlan;
      cumActual += stageData[st].cumActual;
      doneCount += stageData[st].totalDone;
    }

    // total denominator scales with number of stages shown
    const total = items.length * stagesToShow.length;

    rows.push({
      key,
      label: key,
      total,
      doneCount,
      cumPlan,
      cumActual,
      stages: stageData,
      combined,
    });
  }

  rows.sort((a, b) => {
    // Lagging first (ratio low), then label
    const ra = a.cumPlan ? a.cumActual / a.cumPlan : 1;
    const rb = b.cumPlan ? b.cumActual / b.cumPlan : 1;
    return ra - rb || a.label.localeCompare(b.label);
  });

  return { buckets, rows };
}

function emptyStageRow(stage: ScheduleStage, buckets: string[], total: number): StageRow {
  return {
    stage,
    cells: buckets.map(b => ({ bucket: b, plan: 0, actual: 0 })),
    totalPlan: 0,
    totalActual: 0,
    totalDone: 0,
    total,
    cumPlan: 0,
    cumActual: 0,
  };
}

// ───── Critical detection ─────
export function findCritical(
  subs: SubtestForDashboard[],
  today: string,
  windowDays: number,
  sysCodeById: Map<string, string>,
  groupBy: ScheduleGroupBy
): { highRisk: CriticalItem[]; t1Bottleneck: CriticalItem[] } {
  const horizon = addDays(today, windowDays);
  const highRisk: CriticalItem[] = [];
  const t1Bottleneck: CriticalItem[] = [];
  // Stages monitored for High Risk (Pred is excluded — critical card surfaces actionable test/report milestones).
  const RISK_STAGES: ScheduleStage[] = ['t1', 't2', 'r1', 'r2'];

  for (const s of subs) {
    const groupLabel = getGroupKey(s, groupBy, sysCodeById);
    const sysCode = sysCodeById.get(s.system_id) ?? '—';

    for (const stage of RISK_STAGES) {
      const planned = getStagePlannedDate(s, stage);
      if (!planned || planned > horizon) continue;
      if (isStageDone(s, stage)) continue;

      const status = (
        stage === 't1' ? s.t1_status :
        stage === 't2' ? s.t2_status :
        stage === 'r1' ? s.r1_status :
        s.r2_status
      ) ?? null;

      const item: CriticalItem = {
        subtestId: s.id,
        systemCode: sysCode,
        itemNo: s.item_no,
        mosCode: s.mos_code,
        stage,
        daysLeft: daysBetween(today, planned),
        plannedDate: planned,
        status,
        group: groupLabel,
      };
      highRisk.push(item);

      // T1 bottleneck: when T2 is at risk and T1 is also not done
      if (stage === 't2' && !isStageDone(s, 't1')) {
        t1Bottleneck.push({
          ...item,
          stage: 't1',
          plannedDate: getStagePlannedDate(s, 't1') ?? planned,
          status: s.t1_status ?? null,
        });
      }
    }
  }

  highRisk.sort((a, b) => a.daysLeft - b.daysLeft);
  t1Bottleneck.sort((a, b) => a.daysLeft - b.daysLeft);
  return { highRisk: highRisk.slice(0, 30), t1Bottleneck: t1Bottleneck.slice(0, 20) };
}

export function findLaggingGroups(rows: GroupRow[], topN = 5): LaggingGroup[] {
  return rows
    .filter(r => r.cumPlan > 0)
    .map(r => ({
      key: r.key,
      label: r.label,
      cumPlan: r.cumPlan,
      cumActual: r.cumActual,
      ratio: r.cumActual / r.cumPlan,
      total: r.total,
    }))
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, topN);
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z').getTime();
  const db = new Date(b + 'T00:00:00Z').getTime();
  return Math.round((db - da) / 86400000);
}

export const STAGE_LABELS: Record<ScheduleStage, string> = {
  pred: 'Pred',
  t1: 'T1',
  t2: 'T2',
  r1: 'R1',
  r2: 'R2',
};

export function formatBucketLabel(iso: string, bucket: ScheduleBucket): { primary: string; secondary: string } {
  const d = new Date(iso + 'T00:00:00Z');
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = d.getUTCDate();
  if (bucket === 'day') {
    const dow = d.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' });
    return { primary: `${month} ${day}`, secondary: dow };
  }
  // week
  const week = getIsoWeek(d);
  return { primary: `W${week}`, secondary: `${month} ${day}` };
}

function getIsoWeek(d: Date): number {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.getTime() - firstThursday.getTime()) / 86400000;
  return 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}
