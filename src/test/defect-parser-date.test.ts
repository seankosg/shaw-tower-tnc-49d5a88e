import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { normalizeDate } from '@/lib/defect-parser';

describe('defect-parser normalizeDate (regression: dd-MMM year handling)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-30T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('parses "27-Apr" as current year (2026), no TZ shift', () => {
    expect(normalizeDate('27-Apr')).toBe('2026-04-27');
  });

  it('parses "04-May" as current year (2026)', () => {
    expect(normalizeDate('04-May')).toBe('2026-05-04');
  });

  it('parses "03-May-2025" with explicit year', () => {
    expect(normalizeDate('03-May-2025')).toBe('2025-05-03');
  });

  it('parses "3-May-25" two-digit year', () => {
    expect(normalizeDate('3-May-25')).toBe('2025-05-03');
  });

  it('keeps ISO format unchanged', () => {
    expect(normalizeDate('2025-05-03')).toBe('2025-05-03');
  });

  it('rejects bogus year < 2010 (legacy bug detector)', () => {
    expect(normalizeDate('2001-05-03')).toBe(null);
  });

  it('returns null for empty / null', () => {
    expect(normalizeDate('')).toBe(null);
    expect(normalizeDate(null)).toBe(null);
  });

  it('parses DD/MM/YYYY slash format', () => {
    expect(normalizeDate('03/05/2026')).toBe('2026-05-03');
  });
});
