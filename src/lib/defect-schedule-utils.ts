// Defect Progress (Schedule-style) utilities — bucketization, group aggregation,
// critical detection. Mirrors T&C `schedule-utils.ts` but adapted to Defect's
// 3-stage lifecycle (start / completion / closure).

import { TEAM_LABELS, type TeamType } from '@/types/enums';
import { type DefectItem, isClosedDefect } from '@/lib/defect-utils';

// ───── types ─────
export type DefectScheduleStage = 'start' | 'completion' | 'closure';
export type DefectScheduleStageFilter = 'all' | DefectScheduleStage | DefectScheduleStage[];
export type DefectScheduleBucket = 'day' | 'week';
export type DefectScheduleGroupBy =
  | 'team'
  | 'subcontractor_name'
  | 'subsub_name'
  | 'hdec_pic_name'
  | 'hdec_eng_name'
  | 'area_level'
  | 'main_trade'
  | 'sub_trade'
  | 'work_type';

export const ALL_DEFECT_STAGE_KEYS: DefectScheduleStage[] = ['start', 'completion', 'closure'];

/** Canonical ordered list of all Group dimensions. Order drives toolbar layout & URL serialization. */
export const ALL_DEFECT_GROUP_KEYS: DefectScheduleGroupBy[] = [
  'team',
  'subcontractor_name',
  'subsub_name',
  'hdec_pic_name',
  'hdec_eng_name',
  'area_level',
  'main_trade',
  'sub_trade',
  'work_type',
];

/** Group spec: a single dimension or an ordered list of dimensions to combine. */
export type DefectGroupBySpec = DefectScheduleGroupBy | DefectScheduleGroupBy[];

const DEFECT_GROUP_KEY_SEP = ' · ';

function toGroupArray(by: DefectGroupBySpec): DefectScheduleGroupBy[] {
  return Array.isArray(by) ? by : [by];
}

/** First dimension — used for downstream features (URL filter mapping, critical, export header). */
export function getPrimaryDefectGroup(by: DefectGroupBySpec): DefectScheduleGroupBy {
  const arr = toGroupArray(by);
  return arr[0] ?? 'team';
}

export const DEFECT_STAGE_LABELS: Record<DefectScheduleStage, string> = {
  start: 'Start',
  completion: 'Comp',
  closure: 'Close',
};

export const DEFECT_GROUP_LABELS: Record<DefectScheduleGroupBy, string> = {
  team: 'Team',
  subcontractor_name: 'Subcontractor',
  subsub_name: 'Sub-Sub',
  hdec_pic_name: 'HDEC PIC',
  hdec_eng_name: 'HDEC ENG',
  area_level: 'Level',
  main_trade: 'Main Trade',
  sub_trade: 'Sub Trade',
  work_type: 'Work Type',
};

/** Maps each Group key to the URL query param name accepted by DefectRawDataPage. */
export const DEFECT_GROUP_QUERY_PARAM: Record<DefectScheduleGroupBy, string> = {
  team: 'team',
  subcontractor_name: 'subcontractor',
  subsub_name: 'subsub',
  hdec_pic_name: 'hdecPic',
  hdec_eng_name: 'hdecEng',
  area_level: 'level',
  main_trade: 'mainTrade',
  sub_trade: 'subTrade',
  work_type: 'workType',
};

export interface BucketCell {
  bucket: string; // ISO date (day) or week-start ISO
  plan: number;
  actual: number;
}

export interface DefectStageRow {
  stage: DefectScheduleStage;
  cells: BucketCell[];
  totalPlan: number;
  totalActual: number;
  totalDone: number;
  total: number;
  cumPlan: number;
  cumActual: number;
}

export interface DefectGroupRow {
  key: string;
  label: string;
  total: number;
  doneCount: number;
  cumPlan: number;
  cumActual: number;
  stages: Record<DefectScheduleStage, DefectStageRow>;
  combined: BucketCell[];
}

export interface DefectCriticalItem {
  defectId: string;
  issueNo: string;
  scNo: string;
  trade: string;
  stage: DefectScheduleStage;
  daysLeft: number;
  plannedDate: string;
  status: string | null;
  group: string;
}

export interface DefectLaggingGroup {
  key: string;
  label: string;
  cumPlan: number;
  cumActual: number;
  ratio: number;
  total: number;
}

export interface DefectAggregateResult {
  buckets: string[];
  rows: DefectGroupRow[];
}

// ───── date helpers ─────
export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

export function weekStartIso(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const dow = d.getUTCDay() || 7;
  if (dow !== 1) d.setUTCDate(d.getUTCDate() - (dow - 1));
  return toIso(d);
}

export function bucketize(iso: string, granularity: DefectScheduleBucket): string {
  return granularity === 'day' ? iso : weekStartIso(iso);
}

export function buildBucketRange(startIso: string, endIso: string, granularity: DefectScheduleBucket): string[] {
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

export function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z').getTime();
  const db = new Date(b + 'T00:00:00Z').getTime();
  return Math.round((db - da) / 86400000);
}

export function formatBucketLabel(iso: string, bucket: DefectScheduleBucket): { primary: string; secondary: string } {
  const d = new Date(iso + 'T00:00:00Z');
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = d.getUTCDate();
  if (bucket === 'day') {
    const dow = d.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' });
    return { primary: `${month} ${day}`, secondary: dow };
  }
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

// ───── stage accessors ─────
export function getDefectStagePlannedDate(item: DefectItem, stage: DefectScheduleStage): string | null {
  if (stage === 'start') return item.planned_start_date ?? null;
  if (stage === 'completion') return item.planned_completion_date ?? null;
  return item.planned_closure_date ?? null;
}

export function getDefectStageActualDate(item: DefectItem, stage: DefectScheduleStage): string | null {
  if (stage === 'start') return item.actual_start_date ?? null;
  if (stage === 'completion') return item.actual_completion_date ?? null;
  return item.actual_closure_date ?? null;
}

/**
 * Cascade Done semantics:
 *  - closure done ⇒ completion + start done
 *  - completion done (actual or actual_progress_pct >= 100) ⇒ start done
 */
export function isDefectStageDone(item: DefectItem, stage: DefectScheduleStage): boolean {
  const closure = isClosedDefect(item);
  if (stage === 'closure') return closure;
  if (closure) return true;
  if (stage === 'completion') {
    if (item.actual_completion_date) return true;
    if (Number(item.actual_progress_pct ?? 0) >= 100) return true;
    return false;
  }
  // start
  if (item.actual_start_date) return true;
  if (item.actual_completion_date) return true;
  if (Number(item.actual_progress_pct ?? 0) >= 100) return true;
  return false;
}

export function isDefectStagePlannedUpTo(item: DefectItem, stage: DefectScheduleStage, asOfDate: string): boolean {
  const planned = getDefectStagePlannedDate(item, stage);
  return !!planned && planned <= asOfDate;
}

export function isDefectStageActualUpTo(item: DefectItem, stage: DefectScheduleStage, asOfDate: string): boolean {
  if (!isDefectStageDone(item, stage)) return false;
  const actual = getDefectStageActualDate(item, stage);
  return !!actual && actual <= asOfDate;
}

export function isDefectStagePlannedOn(item: DefectItem, stage: DefectScheduleStage, date: string): boolean {
  return getDefectStagePlannedDate(item, stage) === date;
}

export function isDefectStageDelayedAsOf(item: DefectItem, stage: DefectScheduleStage, asOfDate: string): boolean {
  return isDefectStagePlannedUpTo(item, stage, asOfDate) && !isDefectStageDone(item, stage);
}

export function getDefectStageKeys(filter: DefectScheduleStageFilter): DefectScheduleStage[] {
  if (filter === 'all') return ALL_DEFECT_STAGE_KEYS;
  if (Array.isArray(filter)) {
    if (filter.length === 0) return ALL_DEFECT_STAGE_KEYS;
    return ALL_DEFECT_STAGE_KEYS.filter(k => filter.includes(k));
  }
  return [filter];
}

// ───── group accessors ─────
const NONE_LABEL = '(None)';

export function getDefectGroupKey(item: DefectItem, by: DefectScheduleGroupBy): string {
  const raw = (item as any)[by];
  const text = raw == null ? '' : String(raw).trim();
  if (!text) return NONE_LABEL;
  if (by === 'team') return text; // raw enum value used as map key; label resolves separately
  return text;
}

export function getDefectGroupLabel(by: DefectScheduleGroupBy, key: string): string {
  if (key === NONE_LABEL) return key;
  if (by === 'team') return TEAM_LABELS[key as TeamType] ?? key;
  return key;
}

/** Composite group key: joins per-dimension keys with separator. Single-dim spec is identical to getDefectGroupKey. */
export function getDefectCompositeGroupKey(item: DefectItem, by: DefectGroupBySpec): string {
  const dims = toGroupArray(by);
  return dims.map(d => getDefectGroupKey(item, d)).join(DEFECT_GROUP_KEY_SEP);
}

/** Composite display label — resolves Team enum to full name, joins with separator. */
export function getDefectCompositeGroupLabel(by: DefectGroupBySpec, key: string): string {
  const dims = toGroupArray(by);
  if (dims.length === 1) return getDefectGroupLabel(dims[0], key);
  const parts = key.split(DEFECT_GROUP_KEY_SEP);
  return dims.map((d, i) => getDefectGroupLabel(d, parts[i] ?? NONE_LABEL)).join(DEFECT_GROUP_KEY_SEP);
}

/** Composite header label for toolbar / page subheading (e.g. "Team · Subcontractor"). */
export function getDefectGroupHeaderLabel(by: DefectGroupBySpec): string {
  const dims = toGroupArray(by);
  return dims.map(d => DEFECT_GROUP_LABELS[d]).join(DEFECT_GROUP_KEY_SEP);
}

// ───── main aggregation ─────
export interface DefectAggregateOptions {
  groupBy: DefectScheduleGroupBy;
  bucket: DefectScheduleBucket;
  stageFilter: DefectScheduleStageFilter;
  rangeStart: string;
  rangeEnd: string;
  asOfDate: string;
}

export function aggregateDefectSchedule(
  items: DefectItem[],
  opts: DefectAggregateOptions,
): DefectAggregateResult {
  const buckets = buildBucketRange(opts.rangeStart, opts.rangeEnd, opts.bucket);
  const bucketIdx = new Map<string, number>();
  buckets.forEach((b, i) => bucketIdx.set(b, i));

  const groupMap = new Map<string, DefectItem[]>();
  for (const it of items) {
    const k = getDefectGroupKey(it, opts.groupBy);
    const arr = groupMap.get(k) ?? [];
    arr.push(it);
    groupMap.set(k, arr);
  }

  const stagesToShow = getDefectStageKeys(opts.stageFilter);
  const rows: DefectGroupRow[] = [];

  for (const [key, groupItems] of groupMap) {
    const stageData: Record<DefectScheduleStage, DefectStageRow> = {
      start: emptyStageRow('start', buckets, groupItems.length),
      completion: emptyStageRow('completion', buckets, groupItems.length),
      closure: emptyStageRow('closure', buckets, groupItems.length),
    };

    for (const it of groupItems) {
      for (const st of ALL_DEFECT_STAGE_KEYS) {
        const plan = getDefectStagePlannedDate(it, st);
        const actual = getDefectStageActualDate(it, st);
        if (plan) {
          const b = bucketize(plan, opts.bucket);
          const i = bucketIdx.get(b);
          if (i !== undefined) {
            stageData[st].cells[i].plan++;
            stageData[st].totalPlan++;
          }
          if (isDefectStagePlannedUpTo(it, st, opts.asOfDate)) stageData[st].cumPlan++;
        }
        if (actual) {
          const b = bucketize(actual, opts.bucket);
          const i = bucketIdx.get(b);
          if (i !== undefined) {
            stageData[st].cells[i].actual++;
            stageData[st].totalActual++;
          }
          if (isDefectStageActualUpTo(it, st, opts.asOfDate)) stageData[st].cumActual++;
        }
        if (isDefectStageActualUpTo(it, st, opts.asOfDate)) stageData[st].totalDone++;
      }
    }

    const combined: BucketCell[] = buckets.map(b => ({ bucket: b, plan: 0, actual: 0 }));
    for (const st of stagesToShow) {
      stageData[st].cells.forEach((c, i) => {
        combined[i].plan += c.plan;
        combined[i].actual += c.actual;
      });
    }

    let cumPlan = 0;
    let cumActual = 0;
    let doneCount = 0;
    for (const st of stagesToShow) {
      cumPlan += stageData[st].cumPlan;
      cumActual += stageData[st].cumActual;
      doneCount += stageData[st].totalDone;
    }

    const total = groupItems.length * stagesToShow.length;

    rows.push({
      key,
      label: getDefectGroupLabel(opts.groupBy, key),
      total,
      doneCount,
      cumPlan,
      cumActual,
      stages: stageData,
      combined,
    });
  }

  rows.sort((a, b) => {
    const ra = a.cumPlan ? a.cumActual / a.cumPlan : 1;
    const rb = b.cumPlan ? b.cumActual / b.cumPlan : 1;
    return ra - rb || a.label.localeCompare(b.label);
  });

  return { buckets, rows };
}

function emptyStageRow(stage: DefectScheduleStage, buckets: string[], total: number): DefectStageRow {
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

// ───── critical detection ─────
/**
 * High Risk: planned date within `windowDays` and stage not done.
 * Closure Bottleneck: completion is overdue (planned <= today, not done) but closure not yet done.
 */
export function findDefectCritical(
  items: DefectItem[],
  today: string,
  windowDays: number,
  groupBy: DefectScheduleGroupBy,
): { highRisk: DefectCriticalItem[]; closureBottleneck: DefectCriticalItem[] } {
  const horizon = addDays(today, windowDays);
  const highRisk: DefectCriticalItem[] = [];
  const closureBottleneck: DefectCriticalItem[] = [];

  for (const it of items) {
    const groupLabel = getDefectGroupLabel(groupBy, getDefectGroupKey(it, groupBy));

    for (const stage of ALL_DEFECT_STAGE_KEYS) {
      const planned = getDefectStagePlannedDate(it, stage);
      if (!planned || planned > horizon) continue;
      if (isDefectStageDone(it, stage)) continue;

      const status = stage === 'closure'
        ? (it.closure_status ?? null)
        : stage === 'completion'
          ? (it.completion_status ?? null)
          : (it.status ?? null);

      const item: DefectCriticalItem = {
        defectId: it.id,
        issueNo: it.issue_no,
        scNo: it.subcontractor_issue_no ?? '',
        trade: it.sub_trade ?? it.main_trade ?? '',
        stage,
        daysLeft: daysBetween(today, planned),
        plannedDate: planned,
        status: status as string | null,
        group: groupLabel,
      };
      highRisk.push(item);
    }

    // Closure bottleneck: completion overdue but not done & closure also not done
    const completionPlanned = getDefectStagePlannedDate(it, 'completion');
    if (
      completionPlanned &&
      completionPlanned <= today &&
      !isDefectStageDone(it, 'completion') &&
      !isDefectStageDone(it, 'closure')
    ) {
      closureBottleneck.push({
        defectId: it.id,
        issueNo: it.issue_no,
        scNo: it.subcontractor_issue_no ?? '',
        trade: it.sub_trade ?? it.main_trade ?? '',
        stage: 'completion',
        daysLeft: daysBetween(today, completionPlanned),
        plannedDate: completionPlanned,
        status: (it.completion_status ?? null) as string | null,
        group: getDefectGroupLabel(groupBy, getDefectGroupKey(it, groupBy)),
      });
    }
  }

  highRisk.sort((a, b) => a.daysLeft - b.daysLeft);
  closureBottleneck.sort((a, b) => a.daysLeft - b.daysLeft);
  return { highRisk: highRisk.slice(0, 30), closureBottleneck: closureBottleneck.slice(0, 20) };
}

export function findDefectLaggingGroups(rows: DefectGroupRow[], topN = 5): DefectLaggingGroup[] {
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
