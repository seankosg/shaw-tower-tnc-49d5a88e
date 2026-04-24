/**
 * Computes Planned Progress % using a linear (per-day) distribution between
 * Planned Start Date and Planned Completion Date, evaluated as of `dataDate`.
 *
 * Rules (top-to-bottom; first match wins):
 *   1) plannedStart or plannedCompletion is null -> null
 *   2) plannedCompletion < plannedStart           -> null (invalid range)
 *   3) dataDate < plannedStart                    -> null (not started yet)
 *   4) duration_days = plannedCompletion - plannedStart
 *      duration === 0 (start === completion):
 *        dataDate >= start -> 100
 *   5) dataDate > plannedCompletion               -> 100
 *   6) otherwise -> round(lapsed/duration * 100, 1)
 *
 * Inputs are 'YYYY-MM-DD' strings; comparison is performed at UTC midnight in
 * whole-day units to avoid timezone drift.
 */

const MS_PER_DAY = 86_400_000;

function parseUtcDay(value: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const ts = Date.UTC(year, month - 1, day);
  return Number.isFinite(ts) ? ts : null;
}

function diffDays(aMs: number, bMs: number): number {
  return Math.round((aMs - bMs) / MS_PER_DAY);
}

export function computePlannedProgressPct(
  plannedStart: string | null,
  plannedCompletion: string | null,
  dataDate: string,
): number | null {
  const startMs = parseUtcDay(plannedStart);
  const endMs = parseUtcDay(plannedCompletion);
  const dataMs = parseUtcDay(dataDate);
  if (startMs == null || endMs == null || dataMs == null) return null;
  if (endMs < startMs) return null;
  if (dataMs < startMs) return null;

  const duration = diffDays(endMs, startMs);
  if (duration === 0) return 100;
  if (dataMs > endMs) return 100;

  const lapsed = diffDays(dataMs, startMs);
  const pct = (lapsed / duration) * 100;
  // Clamp defensively then round to 1 decimal place
  const clamped = Math.max(0, Math.min(100, pct));
  return Math.round(clamped * 10) / 10;
}
