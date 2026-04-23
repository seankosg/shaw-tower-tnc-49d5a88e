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
