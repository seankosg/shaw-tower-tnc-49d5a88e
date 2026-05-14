import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseDate, normalizeDate } from '@/lib/date-normalize';

describe('date-normalize', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-30T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  describe('strict matches', () => {
    it('parses ISO YYYY-MM-DD', () => {
      expect(normalizeDate('2026-05-18')).toBe('2026-05-18');
    });
    it('parses ISO with trailing time', () => {
      expect(normalizeDate('2026-05-18T10:30:00Z')).toBe('2026-05-18');
    });
    it('parses dd-MMM-YYYY', () => {
      expect(normalizeDate('27-Apr-2026')).toBe('2026-04-27');
    });
    it('parses dd-MMM (current year)', () => {
      expect(normalizeDate('27-Apr')).toBe('2026-04-27');
    });
    it('parses MMM-dd-YYYY', () => {
      expect(normalizeDate('Apr 27, 2026')).toBe('2026-04-27');
    });
    it('parses DD/MM/YYYY (project locale)', () => {
      expect(normalizeDate('3/5/2026')).toBe('2026-05-03');
    });
    it('parses Excel serial number', () => {
      // 45444 = 2024-05-04
      expect(normalizeDate(46157)).toBe('2026-04-17');
    });
    it('parses Date object', () => {
      expect(normalizeDate(new Date(Date.UTC(2026, 4, 18)))).toBe('2026-05-18');
    });
  });

  describe('embedded extraction', () => {
    it('extracts ISO from "see remarks: 2026-05-18 revised"', () => {
      const r = parseDate('see remarks: 2026-05-18 revised');
      expect(r.date).toBe('2026-05-18');
      expect(r.mode).toBe('extracted');
    });
    it('extracts dd-MMM-YYYY from prefix text', () => {
      const r = parseDate('submitted 27-Apr-2026 by AB');
      expect(r.date).toBe('2026-04-27');
      expect(r.mode).toBe('extracted');
    });
    it('extracts ISO from "TBD 2026-05-18"', () => {
      expect(normalizeDate('TBD 2026-05-18')).toBe('2026-05-18');
    });
  });

  describe('noise tokens', () => {
    it.each(['TBD', 'N/A', 'n/a', '-', '', 'pending', '없음', '미정', '?'])(
      'returns null without warning for %s',
      (v) => {
        const r = parseDate(v);
        expect(r.date).toBe(null);
        expect(r.mode).toBe('noise');
      },
    );
  });

  describe('clamp + reject garbage', () => {
    it('rejects bogus year 2001', () => {
      expect(normalizeDate('2001-05-03')).toBe(null);
    });
    it('rejects 1899', () => {
      expect(normalizeDate('1899-12-30')).toBe(null);
    });
    it('marks "hello world" as unparseable', () => {
      const r = parseDate('hello world');
      expect(r.date).toBe(null);
      expect(r.mode).toBe('unparseable');
      expect(r.raw).toBe('hello world');
    });
    it('marks tiny serial as unparseable', () => {
      const r = parseDate(1);
      expect(r.date).toBe(null);
      expect(r.mode).toBe('unparseable');
    });
  });
});
