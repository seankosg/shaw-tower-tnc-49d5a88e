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

// ── Suggested recovery action (rule-based) ───────────────────────────────

export function suggestedRecoveryAction(r: PunchItem, asOf: string = today()): string {
  if (isCompleted(r) && !r.actual_completion_date) return 'Update actual completion date';
  const bs = blockersFor(r);
  if (bs.includes('material_approval')) return 'Clear material approval';
  if (bs.includes('material_procurement')) return 'Expedite material procurement';
  if (bs.includes('drawing_approval')) return 'Close drawing approval';
  if (bs.includes('mos_approval')) return 'Close MOS approval';
  if (isReadyButNotStarted(r)) return 'Mobilize subcontractor';
  const od = daysOverdue(r, asOf);
  if (od > 0 && isWip(r)) return 'Increase manpower / close remaining works';
  if (isStartDelayed(r, asOf)) return 'Start work immediately';
  const w = Number(r.weight ?? 0);
  if (w >= 10 && isBehindSchedule(r)) return 'Assign recovery owner and daily target';
  if (isDueWithin(r, 7, asOf) && ((Number(r.actual_progress_pct) || 0) < (Number(r.planned_progress_pct) || 0))) {
    return 'Daily follow-up until completion';
  }
  if (od > 0) return 'Recover schedule';
  return '—';
}

// ── Data quality issues ──────────────────────────────────────────────────

export type PunchDqKey =
  | 'missing_planned_start' | 'missing_planned_completion'
  | 'missing_hdec_pic' | 'missing_subcontractor' | 'missing_team'
  | 'completed_missing_actual_completion'
  | 'invalid_progress' | 'invalid_dates'
  | 'missing_weight' | 'missing_health';

export const PUNCH_DQ_LABEL: Record<PunchDqKey, string> = {
  missing_planned_start: 'Missing planned start',
  missing_planned_completion: 'Missing planned completion',
  missing_hdec_pic: 'Missing HDEC PIC',
  missing_subcontractor: 'Missing subcontractor',
  missing_team: 'Missing team',
  completed_missing_actual_completion: 'Completed w/o actual completion',
  invalid_progress: 'Invalid progress (>100 or <0)',
  invalid_dates: 'Invalid date order',
  missing_weight: 'Missing weight',
  missing_health: 'Missing health status',
};

export function punchDqMatch(key: PunchDqKey, r: PunchItem): boolean {
  switch (key) {
    case 'missing_planned_start': return !r.planned_start_date;
    case 'missing_planned_completion': return !r.planned_completion_date;
    case 'missing_hdec_pic': return !String(r.hdec_pic_name ?? '').trim();
    case 'missing_subcontractor': return !String(r.subcontractor_name ?? '').trim();
    case 'missing_team': return !String(r.team ?? '').trim();
    case 'completed_missing_actual_completion':
      return (Number(r.actual_progress_pct) || 0) >= 100 && !r.actual_completion_date;
    case 'invalid_progress': {
      const a = Number(r.actual_progress_pct);
      const p = Number(r.planned_progress_pct);
      return (Number.isFinite(a) && (a > 100 || a < 0)) || (Number.isFinite(p) && (p > 100 || p < 0));
    }
    case 'invalid_dates': {
      const ps = r.planned_start_date, pc = r.planned_completion_date;
      const as_ = r.actual_start_date, ac = r.actual_completion_date;
      if (ps && pc && pc < ps) return true;
      if (as_ && ac && ac < as_) return true;
      return false;
    }
    case 'missing_weight': return !(Number(r.weight) > 0);
    case 'missing_health': return !r.health_status;
  }
}

export function computePunchDqCounts(rows: PunchItem[]): Record<PunchDqKey, number> {
  const keys: PunchDqKey[] = [
    'missing_planned_start','missing_planned_completion','missing_hdec_pic',
    'missing_subcontractor','missing_team','completed_missing_actual_completion',
    'invalid_progress','invalid_dates','missing_weight','missing_health',
  ];
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<PunchDqKey, number>;
  for (const r of rows) {
    for (const k of keys) if (punchDqMatch(k, r)) out[k]++;
  }
  return out;
}

// ── Top delaying parties ─────────────────────────────────────────────────

export interface TopParty { key: string; total: number; overdue: number; critical: number; blocked: number; score: number; }

export function topDelayingParties(
  rows: PunchItem[], keyFn: (r: PunchItem) => string, limit = 5, asOf: string = today(),
): TopParty[] {
  const m = new Map<string, TopParty>();
  for (const r of rows) {
    const k = (keyFn(r) || '').trim();
    if (!k) continue;
    let p = m.get(k);
    if (!p) { p = { key: k, total: 0, overdue: 0, critical: 0, blocked: 0, score: 0 }; m.set(k, p); }
    p.total++;
    if (isCompletionOverdue(r, asOf)) p.overdue++;
    if (isCriticalDelay(r, asOf)) p.critical++;
    if (isBlockedByPreEng(r)) p.blocked++;
  }
  for (const p of m.values()) p.score = p.critical * 3 + p.overdue * 2 + p.blocked;
  return Array.from(m.values()).filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score || b.overdue - a.overdue).slice(0, limit);
}

// ── Critical Level Summary ───────────────────────────────────────────────

export const CRITICAL_LEVEL_ORDER = [
  'High', 'mid-High', 'Medium', 'mid-Low', 'Low', 'Unspecified',
] as const;
export type CriticalLevel = typeof CRITICAL_LEVEL_ORDER[number];

export type GateKey =
  | 'material_approval'
  | 'material_procurement'
  | 'drawing_approval'
  | 'mos_approval';

export interface GateCount { approved: number; pending: number; total: number; }

export interface CriticalLevelSummary {
  level: CriticalLevel;
  total: number;
  earliestStart: string | null;
  latestFinish: string | null;
  gates: Record<GateKey, GateCount>;
}

const isApprovalApproved = (v: string | null | undefined): boolean =>
  v === 'approved' || v === 'not_required';

const isProcurementApproved = (v: string | null | undefined): boolean =>
  v === 'secured' || v === 'not_required';

function normalizeCriticalLevel(v: string | null | undefined): CriticalLevel {
  if (!v) return 'Unspecified';
  const hit = (CRITICAL_LEVEL_ORDER as readonly string[]).find(
    (k) => k.toLowerCase() === v.toLowerCase(),
  );
  return (hit as CriticalLevel | undefined) ?? 'Unspecified';
}

export function summarizeByCriticalLevel(items: PunchItem[]): CriticalLevelSummary[] {
  const buckets = new Map<CriticalLevel, CriticalLevelSummary>();
  const ensure = (lvl: CriticalLevel): CriticalLevelSummary => {
    let b = buckets.get(lvl);
    if (!b) {
      b = {
        level: lvl,
        total: 0,
        earliestStart: null,
        latestFinish: null,
        gates: {
          material_approval: { approved: 0, pending: 0, total: 0 },
          material_procurement: { approved: 0, pending: 0, total: 0 },
          drawing_approval: { approved: 0, pending: 0, total: 0 },
          mos_approval: { approved: 0, pending: 0, total: 0 },
        },
      };
      buckets.set(lvl, b);
    }
    return b;
  };

  for (const r of items) {
    const lvl = normalizeCriticalLevel(r.critical_level);
    const b = ensure(lvl);
    b.total++;

    if (r.planned_start_date && (!b.earliestStart || r.planned_start_date < b.earliestStart)) {
      b.earliestStart = r.planned_start_date;
    }
    if (r.planned_completion_date && (!b.latestFinish || r.planned_completion_date > b.latestFinish)) {
      b.latestFinish = r.planned_completion_date;
    }

    const tally = (key: GateKey, approved: boolean) => {
      const g = b.gates[key];
      g.total++;
      if (approved) g.approved++; else g.pending++;
    };
    tally('material_approval', isApprovalApproved(r.material_approval_status));
    tally('material_procurement', isProcurementApproved(r.material_procurement_status));
    tally('drawing_approval', isApprovalApproved(r.drawing_approval_status));
    tally('mos_approval', isApprovalApproved(r.mos_approval_status));
  }

  return CRITICAL_LEVEL_ORDER
    .map((lvl) => buckets.get(lvl))
    .filter((b): b is CriticalLevelSummary => !!b && b.total > 0);
}

export const GATE_SHORT_LABEL: Record<GateKey, string> = {
  material_approval: 'MTL',
  material_procurement: 'PROC',
  drawing_approval: 'DWG',
  mos_approval: 'MOS',
};

export const CRITICAL_LEVEL_ACCENT: Record<CriticalLevel, { bar: string; ring: string }> = {
  'High':        { bar: 'bg-red-500',     ring: 'focus-visible:ring-red-500' },
  'mid-High':    { bar: 'bg-orange-500',  ring: 'focus-visible:ring-orange-500' },
  'Medium':      { bar: 'bg-amber-500',   ring: 'focus-visible:ring-amber-500' },
  'mid-Low':     { bar: 'bg-sky-500',     ring: 'focus-visible:ring-sky-500' },
  'Low':         { bar: 'bg-emerald-500', ring: 'focus-visible:ring-emerald-500' },
  'Unspecified': { bar: 'bg-muted-foreground', ring: 'focus-visible:ring-ring' },
};
