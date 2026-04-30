/**
 * Excel date cell helpers.
 *
 * Converts ISO date strings (YYYY-MM-DD) to Excel serial numbers so the cell
 * is a real "date cell" in Excel — meaning sorting/filtering treats it as a
 * date, and Excel's input UI guides the user toward valid date entries.
 *
 * Note: This does NOT add hard data-validation rules (xlsx-js-style does not
 * emit those). It uses the cell's number-format to make wrong input visually
 * obvious and to keep round-trip imports unambiguous.
 */

/** Display format for date cells in exports. e.g. 04-May */
export const DATE_NUMFMT = 'dd-mmm';

/** Display format for datetime cells in exports. e.g. 04-May-2026 14:30 */
export const DATETIME_NUMFMT = 'dd-mmm-yyyy hh:mm';

/**
 * Convert an ISO date (YYYY-MM-DD or full ISO timestamp) to an Excel serial
 * number using the 1900 date system.
 *
 * Excel epoch quirk: Excel treats 1900 as a leap year (it isn't). The standard
 * workaround is to use 1899-12-30 (UTC) as the epoch and divide elapsed
 * milliseconds by 86,400,000.
 *
 * Returns null when the input cannot be parsed as a real date.
 */
export function isoToExcelSerial(iso: string | null | undefined): number | null {
  if (iso == null) return null;
  const s = String(iso).trim();
  if (!s) return null;

  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;

  const utc = Date.UTC(y, mo - 1, d);
  const epoch = Date.UTC(1899, 11, 30);
  const days = Math.round((utc - epoch) / 86400000);
  if (!Number.isFinite(days) || days <= 0) return null;
  return days;
}

/**
 * Convert an ISO timestamp (with or without time) to an Excel serial number
 * including the time fraction. Returns null on parse failure.
 */
export function isoTimestampToExcelSerial(iso: string | null | undefined): number | null {
  if (iso == null) return null;
  const s = String(iso).trim();
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  const epoch = Date.UTC(1899, 11, 30);
  const v = (t - epoch) / 86400000;
  if (!Number.isFinite(v) || v <= 0) return null;
  return v;
}
