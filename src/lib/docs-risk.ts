import { differenceInDays, parseISO, subDays } from 'date-fns';

export type RiskLevel = 'green' | 'amber' | 'red';

/**
 * Compute As-Built drawing risk based on Substantial Completion date and submission lead time.
 * - Submitted/Approved → green (already done)
 * - Otherwise compare today vs (SC date - leadDays):
 *   - past target → red
 *   - within 7 days of target → amber
 *   - else green
 */
export function computeRisk(
  isSubmitted: boolean,
  scDateIso: string | null | undefined,
  leadDays: number,
  today: Date = new Date(),
): RiskLevel {
  if (isSubmitted) return 'green';
  if (!scDateIso) return 'green'; // no SC date configured → can't assess
  let scDate: Date;
  try {
    scDate = parseISO(scDateIso);
    if (isNaN(scDate.getTime())) return 'green';
  } catch {
    return 'green';
  }
  const target = subDays(scDate, leadDays);
  const diff = differenceInDays(target, today);
  if (diff < 0) return 'red';
  if (diff < 7) return 'amber';
  return 'green';
}
