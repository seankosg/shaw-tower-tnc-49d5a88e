// Date formatting utilities
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format a date string (ISO YYYY-MM-DD or any Date-parsable value) as `dd-MMM` (e.g. "15-Jan").
 * Returns "—" for null/empty values, or the original string if not parsable.
 */
export const formatDdMmm = (v: string | null | undefined): string => {
  if (!v) return '—';
  // Parse YYYY-MM-DD as local date to avoid timezone shifting
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (isoMatch) {
    const day = isoMatch[3];
    const month = MONTH_ABBR[parseInt(isoMatch[2], 10) - 1];
    return month ? `${day}-${month}` : v;
  }
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return `${String(d.getDate()).padStart(2, '0')}-${MONTH_ABBR[d.getMonth()]}`;
};

/**
 * Smart formatter for dashboards.
 * Current calendar year → `dd-MMM` (e.g. "15-Jan").
 * Other years → `dd-MMM-yyyy` (e.g. "15-Jan-2027").
 * Returns "—" for null/empty, original string if not parsable.
 */
export const formatDdMmmSmart = (v: string | null | undefined): string => {
  if (!v) return '—';
  const currentYear = new Date().getFullYear();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (isoMatch) {
    const year = isoMatch[1];
    const day = isoMatch[3];
    const month = MONTH_ABBR[parseInt(isoMatch[2], 10) - 1];
    if (!month) return v;
    return parseInt(year, 10) === currentYear ? `${day}-${month}` : `${day}-${month}-${year}`;
  }
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  const day = String(d.getDate()).padStart(2, '0');
  const month = MONTH_ABBR[d.getMonth()];
  const year = d.getFullYear();
  return year === currentYear ? `${day}-${month}` : `${day}-${month}-${year}`;
};

export const formatDdMmmYyyy = (v: string | null | undefined): string => {
  if (!v) return '—';
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (isoMatch) {
    const month = MONTH_ABBR[parseInt(isoMatch[2], 10) - 1];
    return month ? `${isoMatch[3]}-${month}-${isoMatch[1]}` : v;
  }
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return `${String(d.getDate()).padStart(2, '0')}-${MONTH_ABBR[d.getMonth()]}-${d.getFullYear()}`;
};

export const formatDateTimeDdMmmYyyy = (v: string | null | undefined): string => {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return formatDdMmmYyyy(v);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${String(d.getDate()).padStart(2, '0')}-${MONTH_ABBR[d.getMonth()]}-${d.getFullYear()} ${hh}:${mm}`;
};

export const formatSignedDays = (v: number | null | undefined): string => {
  if (v == null) return '—';
  if (v > 0) return `+${v}`;
  return String(v);
};

/**
 * Format a millisecond duration as a short human-readable string.
 * Examples: "<1s", "12s", "3m 24s", "1h 5m". Returns "—" for null/invalid.
 */
export const formatDuration = (ms: number | null | undefined): string => {
  if (ms == null || !isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return '<1s';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (totalMin < 60) return sec ? `${totalMin}m ${sec}s` : `${totalMin}m`;
  const hr = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return min ? `${hr}h ${min}m` : `${hr}h`;
};
