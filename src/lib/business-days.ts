/**
 * Business day calculations matching DB function `add_business_days_no_sun`.
 * Sundays (DOW=0) are skipped; Saturdays count as business days.
 */

const DAY_MS = 86_400_000;

const toDateOnly = (input: string | Date): Date => {
  if (input instanceof Date) {
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  }
  // Expecting YYYY-MM-DD
  const [y, m, d] = input.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
};

const formatDateOnly = (d: Date): string => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Add `days` business days to a base date, skipping Sundays only.
 * Returns ISO date string (YYYY-MM-DD), or null if base is null/invalid.
 */
export function addBusinessDaysNoSunday(
  base: string | Date | null | undefined,
  days: number,
): string | null {
  if (!base) return null;
  const start = toDateOnly(base);
  if (isNaN(start.getTime())) return null;

  let remaining = Math.max(0, Math.floor(days));
  let cursor = start;
  while (remaining > 0) {
    cursor = new Date(cursor.getTime() + DAY_MS);
    if (cursor.getUTCDay() !== 0) {
      remaining -= 1;
    }
  }
  return formatDateOnly(cursor);
}

/**
 * Convenience: derive the standard R1/R2 plan dates from a T2 planned date.
 * - r1_target_submission_date  = T2 + 3 biz days
 * - r2_target_submission_date  = R1 target + 3 biz days
 * - r2_target_approval_date    = R2 submission target + 5 biz days
 */
export function derivePlanFromT2(t2PlannedDate: string | Date | null | undefined) {
  const r1Target = addBusinessDaysNoSunday(t2PlannedDate, 3);
  const r2SubmitTarget = addBusinessDaysNoSunday(r1Target, 3);
  const r2ApprovalTarget = addBusinessDaysNoSunday(r2SubmitTarget, 5);
  return {
    r1_target_submission_date: r1Target,
    r2_target_submission_date: r2SubmitTarget,
    r2_target_approval_date: r2ApprovalTarget,
  };
}
