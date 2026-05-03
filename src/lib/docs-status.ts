/**
 * As-Built v2 status engine.
 *
 * Each drawing has up to 3 submission cycles. For every cycle:
 *   S = submission_date
 *   P = approval_date  (== Planned Response Date = S + lead_days, or Excel value)
 *   R = actual_response_date
 *   K = approval_status ∈ {'A','B','C',null}
 *
 * Status mapping (per-cycle):
 *   R + K=A      → 'A'              (closed)
 *   R + K=B      → 'B'              (next cycle activated)
 *   R + K=C      → 'C'              (next cycle activated)
 *   R + K=null   → 'Under Review'
 *   -R, +S, D>P  → 'R.Delayed'      (response overdue, days = D-P)
 *   -R, +S, D≤P  → 'Under Review'
 *   -S, D>P      → 'S.Delayed'      (submission overdue, days = D-P)
 *   -S           → 'Planned'
 */

export type CycleStatus =
  | 'Planned'
  | 'S.Delayed'
  | 'Under Review'
  | 'R.Delayed'
  | 'A'
  | 'B'
  | 'C';

export interface DrawingCycle {
  planned_date: string | null;
  submission_date: string | null;
  approval_date: string | null;
  actual_response_date: string | null;
  approval_status: string | null;
}

export interface DrawingForStatus {
  sub1_planned_date?: string | null;
  sub1_submission_date?: string | null;
  sub1_approval_date?: string | null;
  sub1_actual_response_date?: string | null;
  sub1_approval_status?: string | null;
  sub2_planned_date?: string | null;
  sub2_submission_date?: string | null;
  sub2_approval_date?: string | null;
  sub2_actual_response_date?: string | null;
  sub2_approval_status?: string | null;
  sub3_planned_date?: string | null;
  sub3_submission_date?: string | null;
  sub3_approval_date?: string | null;
  sub3_actual_response_date?: string | null;
  sub3_approval_status?: string | null;
}

export type CycleNumber = 1 | 2 | 3;

const VALID_STATUS = new Set(['A', 'B', 'C']);

function normStatus(raw: string | null | undefined): 'A' | 'B' | 'C' | null {
  if (!raw) return null;
  const v = String(raw).trim().toUpperCase();
  if (VALID_STATUS.has(v)) return v as 'A' | 'B' | 'C';
  return null;
}

export function getCycle(drawing: DrawingForStatus, n: CycleNumber): DrawingCycle {
  return {
    planned_date: (drawing as any)[`sub${n}_planned_date`] ?? null,
    submission_date: (drawing as any)[`sub${n}_submission_date`] ?? null,
    approval_date: (drawing as any)[`sub${n}_approval_date`] ?? null,
    actual_response_date: (drawing as any)[`sub${n}_actual_response_date`] ?? null,
    approval_status: (drawing as any)[`sub${n}_approval_status`] ?? null,
  };
}

/** Has any meaningful data been entered for this cycle? */
export function isCycleStarted(cycle: DrawingCycle): boolean {
  return !!(
    cycle.planned_date ||
    cycle.submission_date ||
    cycle.approval_date ||
    cycle.actual_response_date ||
    normStatus(cycle.approval_status)
  );
}

export function computeCycleStatus(
  cycle: DrawingCycle,
  dataDate: string | null,
): CycleStatus {
  const status = normStatus(cycle.approval_status);
  if (cycle.actual_response_date) {
    if (status) return status;
    return 'Under Review';
  }
  // No actual response yet
  const D = (dataDate ?? '').slice(0, 10);
  const P = (cycle.approval_date ?? '').slice(0, 10);
  if (cycle.submission_date) {
    if (D && P && D > P) return 'R.Delayed';
    return 'Under Review';
  }
  // No submission yet
  if (D && P && D > P) return 'S.Delayed';
  return 'Planned';
}

/** Number of days the cycle is delayed beyond P (planned response date). 0 if not delayed. */
export function computeCycleDelayDays(
  cycle: DrawingCycle,
  dataDate: string | null,
): number {
  const status = computeCycleStatus(cycle, dataDate);
  if (status !== 'S.Delayed' && status !== 'R.Delayed') return 0;
  const D = (dataDate ?? '').slice(0, 10);
  const P = (cycle.approval_date ?? '').slice(0, 10);
  if (!D || !P) return 0;
  const dDate = new Date(D + 'T00:00:00Z').getTime();
  const pDate = new Date(P + 'T00:00:00Z').getTime();
  return Math.max(0, Math.round((dDate - pDate) / 86_400_000));
}

/** True if any cycle has status 'A'. */
export function computeIsClosed(drawing: DrawingForStatus): boolean {
  return (
    normStatus(drawing.sub1_approval_status) === 'A' ||
    normStatus(drawing.sub2_approval_status) === 'A' ||
    normStatus(drawing.sub3_approval_status) === 'A'
  );
}

/**
 * Which cycle should accept new input?
 *   - returns 1 if cycle1 not yet final (no A/B/C)
 *   - returns 2 if cycle1 final B/C and cycle2 not yet final
 *   - returns 3 if cycle2 final B/C and cycle3 not yet final
 *   - returns null if any cycle is 'A' (closed) OR all 3 are exhausted
 */
export function computeNextActiveCycle(drawing: DrawingForStatus): CycleNumber | null {
  if (computeIsClosed(drawing)) return null;
  for (const n of [1, 2, 3] as CycleNumber[]) {
    const s = normStatus((drawing as any)[`sub${n}_approval_status`]);
    if (s !== 'B' && s !== 'C') return n;
  }
  return null;
}

/** Cycle 3 reached B/C without ever reaching 'A' → all cycles exhausted, escalation needed. */
export function computeAllCyclesExhausted(drawing: DrawingForStatus): boolean {
  const s1 = normStatus(drawing.sub1_approval_status);
  const s2 = normStatus(drawing.sub2_approval_status);
  const s3 = normStatus(drawing.sub3_approval_status);
  return (
    (s1 === 'B' || s1 === 'C') &&
    (s2 === 'B' || s2 === 'C') &&
    (s3 === 'B' || s3 === 'C')
  );
}

/**
 * Overall drawing status — status of the most "advanced" cycle.
 * If any cycle is 'A' → 'A'. Otherwise the highest-numbered started cycle's status.
 * If nothing started → cycle 1's status (Planned/S.Delayed).
 */
export function computeOverallStatus(
  drawing: DrawingForStatus,
  dataDate: string | null,
): CycleStatus {
  if (computeIsClosed(drawing)) return 'A';
  for (const n of [3, 2, 1] as CycleNumber[]) {
    const cycle = getCycle(drawing, n);
    if (isCycleStarted(cycle)) return computeCycleStatus(cycle, dataDate);
  }
  return computeCycleStatus(getCycle(drawing, 1), dataDate);
}

/** Total delay days across all cycles (sum of S.Delayed + R.Delayed values). */
export function computeTotalDelayDays(
  drawing: DrawingForStatus,
  dataDate: string | null,
): number {
  let sum = 0;
  for (const n of [1, 2, 3] as CycleNumber[]) {
    sum += computeCycleDelayDays(getCycle(drawing, n), dataDate);
  }
  return sum;
}

/** Is cycle N currently editable for actual_response_date / approval_status? */
export function isCycleInputEnabled(
  drawing: DrawingForStatus,
  cycleNumber: CycleNumber,
): boolean {
  const next = computeNextActiveCycle(drawing);
  return next === cycleNumber;
}

/** Normalize a free-text status to A/B/C/null. Used during import. */
export function normalizeApprovalStatus(raw: string | null | undefined): 'A' | 'B' | 'C' | null {
  if (!raw) return null;
  const v = String(raw).trim().toUpperCase();
  if (v === 'A') return 'A';
  if (v === 'B') return 'B';
  if (v === 'C') return 'C';
  if (v === 'APPROVED') return 'A';
  if (v.startsWith('APPROVED WITH COMMENT')) return 'B';
  if (v.startsWith('APPROVED W/COMMENT')) return 'B';
  if (v.startsWith('APPROVED W COMMENT')) return 'B';
  if (v === 'REJECTED' || v === 'REJECT') return 'C';
  if (v.startsWith('REVISE') || v.includes('RESUBMIT')) return 'C';
  return null;
}

export function cycleStatusColorClasses(status: CycleStatus): string {
  switch (status) {
    case 'A':
      return 'bg-emerald-500 border-emerald-600 text-white';
    case 'B':
      return 'bg-amber-400 border-amber-500 text-amber-950';
    case 'C':
      return 'bg-rose-500 border-rose-600 text-white';
    case 'Under Review':
      return 'bg-sky-400 border-sky-500 text-white';
    case 'R.Delayed':
      return 'bg-rose-600 border-rose-700 text-white';
    case 'S.Delayed':
      return 'bg-orange-500 border-orange-600 text-white';
    case 'Planned':
    default:
      return 'bg-transparent border-muted-foreground/40 text-muted-foreground/70';
  }
}

export function cycleStatusGlyph(status: CycleStatus): string {
  switch (status) {
    case 'A':
      return 'A';
    case 'B':
      return 'B';
    case 'C':
      return 'C';
    case 'Under Review':
      return '◐';
    case 'R.Delayed':
      return '⚠';
    case 'S.Delayed':
      return '!';
    case 'Planned':
    default:
      return '○';
  }
}
