import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// We need to access the internal `normalizeDate`. Since it's not exported,
// test it through `parseDefectExcelRows`-adjacent surface. Easier: re-export
// for testing. The simplest reliable approach is to import via dynamic eval.
// Instead, we test the public exported behaviour by parsing a constructed row.

// To keep things simple, expose a thin re-import using rewire-style. We test
// behaviour by importing the module and using a small private helper exposed
// via the module's public export indirectly. Here we duplicate the logic test
// surface using the parser entrypoint.

// Pragmatic approach: import and call normalizeDate via the module's namespace.
// Since the original function is module-private, we add the test to lock in
// the regression by exercising parseDefectRow which uses it under the hood.

import * as defectParser from '@/lib/defect-parser';

describe('defect-parser normalizeDate (regression: dd-MMM year handling)', () => {
  beforeEach(() => {
    // Freeze year to 2026 so "27-Apr" → "2026-04-27"
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-30T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Use the high-level parser to validate normalizeDate behaviour
  const parseOne = (val: unknown): string | null => {
    const headers = ['issue no', 'planned start date'];
    const row: Record<string, unknown> = {
      'issue no': 'TEST-1',
      'planned start date': val,
    };
    const result = defectParser.parseDefectRows(headers, [row]);
    return result.rows[0]?.planned_start_date ?? null;
  };

  it('parses "27-Apr" as current year (2026), no TZ shift', () => {
    expect(parseOne('27-Apr')).toBe('2026-04-27');
  });

  it('parses "04-May" as current year (2026)', () => {
    expect(parseOne('04-May')).toBe('2026-05-04');
  });

  it('parses "03-May-2025" with explicit year', () => {
    expect(parseOne('03-May-2025')).toBe('2025-05-03');
  });

  it('parses "3-May-25" two-digit year', () => {
    expect(parseOne('3-May-25')).toBe('2025-05-03');
  });

  it('keeps ISO format unchanged', () => {
    expect(parseOne('2025-05-03')).toBe('2025-05-03');
  });

  it('rejects bogus year < 2010 (legacy bug detector)', () => {
    expect(parseOne('2001-05-03')).toBe(null);
  });

  it('returns null for empty / null', () => {
    expect(parseOne('')).toBe(null);
    expect(parseOne(null)).toBe(null);
  });
});
