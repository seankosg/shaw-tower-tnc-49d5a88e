/**
 * Punch Dashboard helpers.
 *
 * Pure functions used by PunchDashboardPage and PunchRawDataPage drill-downs.
 * Derived metrics (start delays, completion overdue, lookahead windows,
 * blocker classification, weighted progress, recovery priority).
 */
import type { PunchItem } from '@/lib/punch-excel-utils';

const today = (): string => new Date().toISOString().slice(0, 10);

const dayDiff = (aIso: string, bIso: string): number => {
  const a = new Date(aIso + 'T00:00:00Z').getTime();
  const b = new Date(bIso + 'T00:00:00Z').getTime();
  return Math.round((a - b) / 86_400_000);
};

const addDaysIso = (iso: string, days: number): string => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// ── Schedule predicates ──────────────────────────────────────────────────

export function isCompleted(r: PunchItem): boolean {
  return !!r.actual_completion_date;
}

export function isWip(r: PunchItem): boolean {
  return !!r.actual_start_date && !r.actual_completion_date;
}

export function isNotStarted(r: PunchItem): boolean {
  return !r.actual_start_date;
}

export function isCompletionOverdue(r: PunchItem, asOf: string = today()): boolean {
  if (r.actual_completion_date) return false;
  if (!r.planned_completion_date) return false;
  return r.planned_completion_date < asOf;
}

export function isStartDelayed(r: PunchItem, asOf: string = today()): boolean {
  if (r.actual_start_date) return false;
  if (!r.planned_start_date) return false;
  return r.planned_start_date < asOf;
}

export function daysOverdue(r: PunchItem, asOf: string = today()): number {
  if (!isCompletionOverdue(r, asOf)) return 0;
  return dayDiff(asOf, r.planned_completion_date as string);
}

export function isCriticalDelay(r: PunchItem, asOf: string = today()): boolean {
  if (r.health_status === 'critical') return true;
  return daysOverdue(r, asOf) > 14;
}

export function isBehindSchedule(r: PunchItem): boolean {
  return r.health_status === 'behind' || r.health_status === 'critical';
}

export function isDueWithin(r: PunchItem, days: number, asOf: string = today()): boolean {
  if (r.actual_completion_date) return false;
  if (!r.planned_completion_date) return false;
  const horizon = addDaysIso(asOf, days);
  return r.planned_completion_date >= asOf && r.planned_completion_date <= horizon;
}

export function isDueThisWeek(r: PunchItem, asOf: string = today()): boolean {
  return isDueWithin(r, 7, asOf);
}

export function isPlannedToStartWithin(r: PunchItem, days: number, asOf: string = today()): boolean {
  if (r.actual_start_date) return false;
  if (!r.planned_start_date) return false;
  const horizon = addDaysIso(asOf, days);
  return r.planned_start_date >= asOf && r.planned_start_date <= horizon;
}

// ── Pre-engineering ──────────────────────────────────────────────────────

export type PunchBlockerKind =
  | 'material_approval'
  | 'material_procurement'
  | 'drawing_approval'
  | 'mos_approval';

export const BLOCKER_LABEL: Record<PunchBlockerKind, string> = {
  material_approval: 'Material Approval',
  material_procurement: 'Material Procurement',
  drawing_approval: 'Drawing Approval',
  mos_approval: 'MOS Approval',
};

export function blockersFor(r: PunchItem): PunchBlockerKind[] {
  const out: PunchBlockerKind[] = [];
  if (r.material_approval_status === 'pending') out.push('material_approval');
  if (
    r.material_procurement_status === 'pending'
    || r.material_procurement_status === 'partially_secured'
  ) out.push('material_procurement');
  if (r.drawing_approval_status === 'pending') out.push('drawing_approval');
  if (r.mos_approval_status === 'pending') out.push('mos_approval');
  return out;
}

export function isBlockedByPreEng(r: PunchItem): boolean {
  return !r.pre_engineering_ready;
}

export function dominantBlocker(r: PunchItem): PunchBlockerKind | 'multiple' | null {
  const bs = blockersFor(r);
  if (bs.length === 0) return null;
  if (bs.length === 1) return bs[0];
  return 'multiple';
}

export function isReadyButNotStarted(r: PunchItem): boolean {
  return !!r.pre_engineering_ready && !r.actual_start_date;
}

// ── Weighted progress ────────────────────────────────────────────────────

export interface WeightedProgress {
  planned: number;
  actual: number;
  variance: number;
  hasWeight: boolean;
  totalWeight: number;
}

export function weightedProgress(rows: PunchItem[]): WeightedProgress {
  let wsum = 0;
  let pSum = 0;
  let aSum = 0;
  let hasWeight = false;
  for (const r of rows) {
    const w = Number(r.weight ?? 0);
    if (w > 0) hasWeight = true;
    const eff = w > 0 ? w : 1;
    wsum += eff;
    pSum += eff * (Number(r.planned_progress_pct) || 0);
    aSum += eff * (Number(r.actual_progress_pct) || 0);
  }
  if (wsum === 0) return { planned: 0, actual: 0, variance: 0, hasWeight, totalWeight: 0 };
  const planned = pSum / wsum;
  const actual = aSum / wsum;
  return { planned, actual, variance: actual - planned, hasWeight, totalWeight: wsum };
}

export function simpleAverageProgress(rows: PunchItem[]): { planned: number; actual: number; variance: number } {
  if (!rows.length) return { planned: 0, actual: 0, variance: 0 };
  const planned = rows.reduce((s, r) => s + (Number(r.planned_progress_pct) || 0), 0) / rows.length;
  const actual = rows.reduce((s, r) => s + (Number(r.actual_progress_pct) || 0), 0) / rows.length;
  return { planned, actual, variance: actual - planned };
}

// ── Progress matrix grouping ─────────────────────────────────────────────

export interface ProgressMatrixRow {
  key: string;
  total: number;
  completed: number;
  remaining: number;
  wip: number;
  notStarted: number;
  overdue: number;
  critical: number;
  blocked: number;
  completionPct: number;
  weightedPlanned: number;
  weightedActual: number;
  variance: number;
}

export function groupProgressMatrix(
  rows: PunchItem[],
  keyFn: (r: PunchItem) => string,
  asOf: string = today(),
): ProgressMatrixRow[] {
  const groups = new Map<string, PunchItem[]>();
  for (const r of rows) {
    const k = keyFn(r) || 'Unassigned';
    const list = groups.get(k);
    if (list) list.push(r); else groups.set(k, [r]);
  }
  const out: ProgressMatrixRow[] = [];
  for (const [key, list] of groups) {
    const completed = list.filter(isCompleted).length;
    const wip = list.filter(isWip).length;
    const notStarted = list.filter(isNotStarted).length;
    const overdue = list.filter((r) => isCompletionOverdue(r, asOf)).length;
    const critical = list.filter((r) => isCriticalDelay(r, asOf)).length;
    const blocked = list.filter(isBlockedByPreEng).length;
    const wp = weightedProgress(list);
    out.push({
      key,
      total: list.length,
      completed,
      remaining: list.length - completed,
      wip,
      notStarted,
      overdue,
      critical,
      blocked,
      completionPct: list.length ? (completed / list.length) * 100 : 0,
      weightedPlanned: wp.planned,
      weightedActual: wp.actual,
      variance: wp.variance,
    });
  }
  return out;
}

// ── Recovery priority ────────────────────────────────────────────────────

/**
 * Higher score = more urgent to act on.
 * Combines: critical health, days overdue, weight, due-soon pressure, blocked.
 */
export function recoveryPriorityScore(r: PunchItem, asOf: string = today()): number {
  let s = 0;
  if (r.health_status === 'critical') s += 50;
  else if (r.health_status === 'behind') s += 20;
  s += Math.min(60, daysOverdue(r, asOf) * 2);
  if (isBlockedByPreEng(r)) s += 15;
  if (isDueWithin(r, 7, asOf) && !isCompleted(r)) s += 10;
  const w = Number(r.weight ?? 0);
  if (w > 0) s += Math.min(20, w);
  // Behind: actual lagging planned
  const variance = (Number(r.actual_progress_pct) || 0) - (Number(r.planned_progress_pct) || 0);
  if (variance < 0) s += Math.min(25, -variance / 2);
  return s;
}
