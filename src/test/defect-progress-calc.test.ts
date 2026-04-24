import { describe, expect, it } from 'vitest';
import { computePlannedProgressPct } from '@/lib/defect-progress-calc';

describe('computePlannedProgressPct', () => {
  it('returns null when planned start is missing', () => {
    expect(computePlannedProgressPct(null, '2026-01-10', '2026-01-05')).toBeNull();
  });

  it('returns null when planned completion is missing', () => {
    expect(computePlannedProgressPct('2026-01-01', null, '2026-01-05')).toBeNull();
  });

  it('returns null when completion is before start (invalid range)', () => {
    expect(computePlannedProgressPct('2026-01-10', '2026-01-01', '2026-01-05')).toBeNull();
  });

  it('returns null when data date is before planned start (Q1=b)', () => {
    expect(computePlannedProgressPct('2026-01-10', '2026-01-20', '2026-01-05')).toBeNull();
  });

  it('returns 100 when duration is zero and dataDate === start', () => {
    expect(computePlannedProgressPct('2026-01-10', '2026-01-10', '2026-01-10')).toBe(100);
  });

  it('returns 100 when duration is zero and dataDate > start', () => {
    expect(computePlannedProgressPct('2026-01-10', '2026-01-10', '2026-02-01')).toBe(100);
  });

  it('returns 100 when data date is after planned completion (Q2=a)', () => {
    expect(computePlannedProgressPct('2026-01-01', '2026-01-10', '2026-02-01')).toBe(100);
  });

  it('computes exact midpoint to 1 decimal', () => {
    // start=2026-01-01, completion=2026-01-11 (10-day duration)
    // dataDate=2026-01-06 (5 lapsed days) -> 50.0
    expect(computePlannedProgressPct('2026-01-01', '2026-01-11', '2026-01-06')).toBe(50);
  });

  it('rounds to 1 decimal place', () => {
    // start=2026-01-01, completion=2026-01-08 (7-day duration)
    // dataDate=2026-01-04 (3 lapsed days) -> 42.857... -> 42.9
    expect(computePlannedProgressPct('2026-01-01', '2026-01-08', '2026-01-04')).toBe(42.9);
  });

  it('handles leap-year boundary (Feb 28 -> Mar 1, 2024)', () => {
    // 2024 is leap year. Feb 28 -> Mar 1 spans 2 days (28th -> 29th -> 1st).
    expect(computePlannedProgressPct('2024-02-28', '2024-03-01', '2024-02-29')).toBe(50);
  });

  it('returns 0 when dataDate equals planned start', () => {
    expect(computePlannedProgressPct('2026-01-01', '2026-01-11', '2026-01-01')).toBe(0);
  });

  it('returns 100 when dataDate equals planned completion', () => {
    expect(computePlannedProgressPct('2026-01-01', '2026-01-11', '2026-01-11')).toBe(100);
  });
});
