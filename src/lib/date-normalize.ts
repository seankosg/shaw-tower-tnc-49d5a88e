// Common date normalization for Excel imports.
// Used by Subtest, Defect, Docs (OMM/Warranty/Spare/ABD) parsers.
//
// Strategy:
//   1. Drop noise tokens (TBD/N/A/-/없음/...) silently.
//   2. Try strict full-string matches: Excel serial, ISO, dd-MMM, MMM-dd, slash.
//   3. If still unmatched, scan the string for an embedded date substring.
//   4. Reject implausible years (clamp to 2010..2100).
//   5. Caller can use parseDate() to receive the resolution mode (for warnings).

import * as XLSX from 'xlsx';

const MONTH_ABBR: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

const NOISE_TOKENS = new Set([
  '', '-', '--', 'n/a', 'na', 'tbd', 'tba', 'tbc', 'pending',
  'none', 'nil', 'null', 'undefined', '없음', '미정', '추후',
  '?', '??', '???',
]);

const pad2 = (n: number | string) => String(n).padStart(2, '0');

function clampReasonable(iso: string | null): string | null {
  if (!iso) return null;
  const y = Number(iso.slice(0, 4));
  if (!Number.isFinite(y) || y < 2010 || y > 2100) return null;
  // Validate month/day ranges
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return iso;
}

function fromSerial(n: number): string | null {
  if (!Number.isFinite(n)) return null;
  // Filter junk like 0, 1 (1900-01-01) — must be > 2010-01-01 serial (40179)
  if (n < 40000 || n > 80000) return null;
  const d = XLSX.SSF.parse_date_code(n);
  if (!d) return null;
  return clampReasonable(`${d.y}-${pad2(d.m)}-${pad2(d.d)}`);
}

function fromDdMmm(day: string, mon: string, yr: string | undefined): string | null {
  const month = MONTH_ABBR[mon.toLowerCase()];
  if (!month) return null;
  let year: number;
  if (yr) {
    year = Number(yr);
    if (year < 100) year += 2000;
  } else {
    year = new Date().getFullYear();
  }
  return clampReasonable(`${year}-${month}-${pad2(day)}`);
}

function fromSlash(text: string): string | null {
  const m = text.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (!m) return null;
  let a = Number(m[1]);
  let b = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  let day: number, month: number;
  if (a > 12) { day = a; month = b; }
  else if (b > 12) { month = a; day = b; }
  else { day = a; month = b; } // ambiguous → DD/MM (project convention)
  return clampReasonable(`${y}-${pad2(month)}-${pad2(day)}`);
}

function tryStrict(text: string): string | null {
  // ISO YYYY-MM-DD (allow trailing time)
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return clampReasonable(`${iso[1]}-${iso[2]}-${iso[3]}`);

  // dd-MMM[-YYYY]
  const ddMmm = text.match(/^(\d{1,2})[\s\-\/]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:[\s\-\/]+(\d{2,4}))?$/i);
  if (ddMmm) return fromDdMmm(ddMmm[1], ddMmm[2], ddMmm[3]);

  // MMM-dd[-YYYY]  (e.g. "Apr 27, 2026")
  const mmmDd = text.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-\/,]+(\d{1,2})(?:[\s\-\/,]+(\d{2,4}))?$/i);
  if (mmmDd) return fromDdMmm(mmmDd[2], mmmDd[1], mmmDd[3]);

  // Slash / dash / dot DD/MM/YYYY
  const slash = fromSlash(text);
  if (slash) return slash;

  // Numeric string → Excel serial
  if (/^\d+(\.\d+)?$/.test(text)) {
    const ser = fromSerial(parseFloat(text));
    if (ser) return ser;
  }

  return null;
}

function tryEmbedded(text: string): string | null {
  // Embedded ISO
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const r = clampReasonable(`${iso[1]}-${iso[2]}-${iso[3]}`);
    if (r) return r;
  }
  // Embedded dd-MMM-YYYY
  const ddMmm = text.match(/(\d{1,2})[\s\-\/]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-\/]+(\d{2,4})/i);
  if (ddMmm) {
    const r = fromDdMmm(ddMmm[1], ddMmm[2], ddMmm[3]);
    if (r) return r;
  }
  // Embedded dd-MMM (no year — assume current year)
  const ddMmmNoYear = text.match(/(?:^|[^\d])(\d{1,2})[\s\-\/]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:$|[^\d\w])/i);
  if (ddMmmNoYear) {
    const r = fromDdMmm(ddMmmNoYear[1], ddMmmNoYear[2], undefined);
    if (r) return r;
  }
  // Embedded slash DD/MM/YYYY
  const slash = text.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (slash) {
    const r = fromSlash(`${slash[1]}/${slash[2]}/${slash[3]}`);
    if (r) return r;
  }
  return null;
}

export type DateParseMode = 'exact' | 'extracted' | 'serial' | 'date-object' | 'noise' | 'unparseable';

export interface DateParseResult {
  date: string | null;
  mode: DateParseMode;
  raw: string | null;
}

export function parseDate(value: unknown): DateParseResult {
  if (value == null || value === '') {
    return { date: null, mode: 'noise', raw: null };
  }

  // Date object (xlsx cellDates: true)
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      return { date: null, mode: 'unparseable', raw: String(value) };
    }
    const iso = `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
    const clamped = clampReasonable(iso);
    return clamped
      ? { date: clamped, mode: 'date-object', raw: iso }
      : { date: null, mode: 'unparseable', raw: iso };
  }

  // Excel serial number
  if (typeof value === 'number') {
    const ser = fromSerial(value);
    return ser
      ? { date: ser, mode: 'serial', raw: String(value) }
      : { date: null, mode: 'unparseable', raw: String(value) };
  }

  const raw = String(value).trim();
  if (NOISE_TOKENS.has(raw.toLowerCase())) {
    return { date: null, mode: 'noise', raw };
  }

  const strict = tryStrict(raw);
  if (strict) return { date: strict, mode: 'exact', raw };

  const embedded = tryEmbedded(raw);
  if (embedded) return { date: embedded, mode: 'extracted', raw };

  return { date: null, mode: 'unparseable', raw };
}

/** Backward-compatible thin wrapper (returns ISO string or null). */
export function normalizeDate(value: unknown): string | null {
  return parseDate(value).date;
}
