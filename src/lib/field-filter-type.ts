/**
 * Infer the appropriate column filter type for a Field-Config-driven column.
 *
 * Used by Raw Data tables (T&C, Defect) so that fields toggled-enabled in
 * Field Config automatically receive a sensible header filter (text /
 * date-range / multi-select / progress) without requiring code changes.
 */

export type InferredFilterType = 'date-range' | 'multi-select' | 'progress' | 'text';

/** Explicit overrides — used when the heuristic would pick the wrong type. */
const EXPLICIT: Record<string, InferredFilterType> = {
  // T&C
  team: 'multi-select',
  system: 'multi-select',
  system_code: 'multi-select',
  level: 'text',
  predecessor_status_raw: 'date-range',
  // Defect / shared
  status: 'multi-select',
  closure_status: 'multi-select',
  completion_status: 'multi-select',
  classification_source: 'multi-select',
  defect_type: 'multi-select',
  priority: 'multi-select',
  area_type: 'multi-select',
  area_level: 'multi-select',
  area_location: 'multi-select',
  main_trade: 'multi-select',
  sub_trade: 'multi-select',
  work_type: 'multi-select',
  subcontractor_name: 'multi-select',
  subsub_name: 'multi-select',
  hdec_pic_name: 'multi-select',
  hdec_eng_name: 'multi-select',
  data_source_type: 'multi-select',
};

const DATE_KEYWORDS = ['date', 'on', '_at'];
const ENUM_KEYWORDS = ['status', 'team', 'type', 'priority', 'source', 'level', 'category'];

function lower(s?: string | null): string {
  return String(s ?? '').toLowerCase();
}

export function inferFilterType(
  fieldName: string,
  originalHeader?: string | null,
): InferredFilterType {
  if (EXPLICIT[fieldName]) return EXPLICIT[fieldName];

  const fn = lower(fieldName);
  const hd = lower(originalHeader);

  // Date-ish
  if (fn.endsWith('_date') || fn.endsWith('_at') || fn === 'classified_at') return 'date-range';
  if (DATE_KEYWORDS.some((k) => hd.includes(k))) return 'date-range';

  // Progress / percentage
  if (fn.endsWith('_pct') || fn.includes('progress')) return 'progress';

  // Enum-ish
  if (ENUM_KEYWORDS.some((k) => fn.includes(k))) return 'multi-select';

  return 'text';
}
