// Schedule page utilities — bucketization, group aggregation, critical detection.
import type { TcStatus } from '@/types/enums';
import type { SubtestForDashboard } from '@/lib/dashboard-utils';

export type ScheduleStage = 'pred' | 't1' | 't2';
export type ScheduleStageFilter = 'all' | ScheduleStage;
export type ScheduleBucket = 'day' | 'week';
export type ScheduleGroupBy = 'system' | 'subcon' | 'subsub';

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
  totalDone: number; // # subtests for this stage marked Done
  total: number; // # subtests in group (denominator)
}

export interface GroupRow {
  key: string;
  label: string;
  total: number; // # subtests in group
  doneCount: number; // T2 done count (overall progress)
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
  stage: 't1' | 't2';
  daysLeft: number;
  plannedDate: string;
  status: TcStatus | null;
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
  return s.subsub_name ?? '(None)';
}

// ───── Predecessor done check ─────
// Single source of truth: pred_status field. Falls back to raw text only when status missing.
const PRED_DONE_TOKENS = ['done', 'complete', 'completed', 'finished', '완료'];

export function isPredDone(s: SubtestForDashboard & { predecessor_status_raw?: string | null }): boolean {
  if (s.pred_status === 'Done') return true;
  if (s.pred_status != null) return false; // status set but not Done
  // Fallback: raw text (for legacy rows not yet normalized)
  const raw = (s.predecessor_status_raw ?? '').toLowerCase().trim();
  if (!raw) return false;
  return PRED_DONE_TOKENS.some(t => raw === t || raw.includes(t));
}

function getStageDates(
  s: SubtestForDashboard,
  stage: ScheduleStage
): { plan: string | null; actual: string | null; done: boolean } {
  if (stage === 't1') {
    return {
      plan: s.t1_planned_date,
      actual: s.t1_status === 'Done' ? s.t1_actual_date : null,
      done: s.t1_status === 'Done',
    };
  }
  if (stage === 't2') {
    return {
      plan: s.t2_planned_date,
      actual: s.t2_status === 'Done' ? s.t2_actual_date : null,
      done: s.t2_status === 'Done',
    };
  }
  // pred — use normalized fields directly. No more T1-derived inference.
  const done = isPredDone(s);
  return {
    plan: s.pred_planned_date ?? null,
    actual: done ? (s.pred_actual_date ?? null) : null,
    done,
  };
}

// ───── main aggregation ─────
export interface AggregateOptions {
  groupBy: ScheduleGroupBy;
  bucket: ScheduleBucket;
  stageFilter: ScheduleStageFilter;
  rangeStart: string;
  rangeEnd: string;
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

  const stagesToShow: ScheduleStage[] =
    opts.stageFilter === 'all' ? ['pred', 't1', 't2'] : [opts.stageFilter as ScheduleStage];

  const rows: GroupRow[] = [];
  for (const [key, items] of groupMap) {
    const stageData: Record<ScheduleStage, StageRow> = {
      pred: emptyStageRow('pred', buckets, items.length),
      t1: emptyStageRow('t1', buckets, items.length),
      t2: emptyStageRow('t2', buckets, items.length),
    };

    for (const s of items) {
      for (const st of ['pred', 't1', 't2'] as ScheduleStage[]) {
        const { plan, actual, done } = getStageDates(s, st);
        if (plan) {
          const b = bucketize(plan, opts.bucket);
          const i = bucketIdx.get(b);
          if (i !== undefined) {
            stageData[st].cells[i].plan++;
            stageData[st].totalPlan++;
          }
        }
        if (actual) {
          const b = bucketize(actual, opts.bucket);
          const i = bucketIdx.get(b);
          if (i !== undefined) {
            stageData[st].cells[i].actual++;
            stageData[st].totalActual++;
          }
        }
        if (done) stageData[st].totalDone++;
      }
    }

    // combined = sum of stages in stageFilter
    const combined: BucketCell[] = buckets.map(b => ({ bucket: b, plan: 0, actual: 0 }));
    let cumPlan = 0;
    let cumActual = 0;
    for (const st of stagesToShow) {
      stageData[st].cells.forEach((c, i) => {
        combined[i].plan += c.plan;
        combined[i].actual += c.actual;
      });
      cumPlan += stageData[st].totalPlan;
      cumActual += stageData[st].totalActual;
    }

    const doneCount = items.filter(i => i.t2_status === 'Done').length;

    rows.push({
      key,
      label: key,
      total: items.length,
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

  for (const s of subs) {
    const groupLabel = getGroupKey(s, groupBy, sysCodeById);
    const sysCode = sysCodeById.get(s.system_id) ?? '—';

    if (s.t2_planned_date && s.t2_planned_date <= horizon && s.t2_status !== 'Done') {
      const days = daysBetween(today, s.t2_planned_date);
      const item: CriticalItem = {
        subtestId: s.id,
        systemCode: sysCode,
        itemNo: s.item_no,
        mosCode: s.mos_code,
        stage: 't2',
        daysLeft: days,
        plannedDate: s.t2_planned_date,
        status: s.t2_status,
        group: groupLabel,
      };
      highRisk.push(item);
      if (s.t1_status !== 'Done') {
        t1Bottleneck.push({ ...item, stage: 't1', plannedDate: s.t1_planned_date ?? s.t2_planned_date });
      }
    }
    if (s.t1_planned_date && s.t1_planned_date <= horizon && s.t1_status !== 'Done') {
      const days = daysBetween(today, s.t1_planned_date);
      highRisk.push({
        subtestId: s.id,
        systemCode: sysCode,
        itemNo: s.item_no,
        mosCode: s.mos_code,
        stage: 't1',
        daysLeft: days,
        plannedDate: s.t1_planned_date,
        status: s.t1_status,
        group: groupLabel,
      });
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
