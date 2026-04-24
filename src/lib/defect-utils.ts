export type DefectEditScope = 'none' | 'assigned' | 'team' | 'full';

export type DefectStatusValue = 'Planned' | 'Delay' | 'Done' | 'WIP';

export const DEFECT_STATUS_VALUES: DefectStatusValue[] = ['Planned', 'Delay', 'Done', 'WIP'];

export interface DefectItem {
  id: string;
  project_id: string | null;
  issue_no: string;
  subcontractor_issue_no: string | null;
  subcontractor_issue_source: string | null;
  main_trade: string | null;
  sub_trade: string | null;
  trade_detail: string | null;
  area_raw: string | null;
  area_type: string | null;
  area_level: string | null;
  area_location: string | null;
  description: string | null;
  defect_type: string | null;
  status: string | null;
  priority: string | null;
  team: string | null;
  subcontractor_name: string | null;
  subsub_name: string | null;
  hdec_pic_name: string | null;
  // New lifecycle date fields
  planned_start_date: string | null;
  planned_completion_date: string | null;
  planned_closure_date: string | null;
  actual_start_date: string | null;
  actual_completion_date: string | null;
  actual_closure_date: string | null;
  planned_progress_pct: number | null;
  actual_progress_pct: number | null;
  completion_status: DefectStatusValue | string | null;
  closure_status: DefectStatusValue | string | null;
  remarks: string | null;
  hdec_comments: string | null;
  raw_payload?: Record<string, unknown>;
  source_upload_id: string | null;
  data_source_type: string | null;
  is_active: boolean;
  updated_by: string | null;
  updated_at: string;
  created_at?: string;
  row_version: number;
}

export const DEFECT_RESPONSIBILITY_FIELDS = ['subcontractor_name', 'subsub_name', 'hdec_pic_name'] as const;

// Fields that, when changed, are tracked in defect_schedule_change_audit
export const DEFECT_REVISION_FIELDS = [
  'planned_start_date',
  'planned_completion_date',
  'planned_closure_date',
  'actual_start_date',
  'actual_completion_date',
  'actual_closure_date',
  'planned_progress_pct',
  'actual_progress_pct',
  'completion_status',
  'closure_status',
] as const;

const OWNER_CODE_STOP_WORDS = new Set(['CO', 'LTD', 'INC', 'CORP', 'CORPORATION', 'COMPANY', 'LLC', 'GROUP', 'ENG', 'ENGINEERING', 'THE', 'AND']);

export function isClosedDefect(item: Pick<DefectItem, 'actual_closure_date' | 'closure_status'>): boolean {
  return Boolean(item.actual_closure_date) || String(item.closure_status ?? '') === 'Done';
}

export function formatPct(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${Math.round(Number(value) * 10) / 10}%`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A defect is overdue when any of its planned dates is on/before asOf and the
 * corresponding actual stage hasn't been completed yet.
 */
export function isOverdueDefect(
  item: Pick<DefectItem,
    'planned_start_date' | 'planned_completion_date' | 'planned_closure_date'
    | 'actual_start_date' | 'actual_completion_date' | 'actual_closure_date'
    | 'closure_status'
  >,
  asOf = todayIso(),
): boolean {
  if (Boolean(item.actual_closure_date) || String(item.closure_status ?? '') === 'Done') return false;
  if (item.planned_start_date && item.planned_start_date < asOf && !item.actual_start_date) return true;
  if (item.planned_completion_date && item.planned_completion_date < asOf && !item.actual_completion_date) return true;
  if (item.planned_closure_date && item.planned_closure_date < asOf && !item.actual_closure_date) return true;
  return false;
}

export function toNullable(value: FormDataEntryValue | string | null | undefined): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

export function normalizeOwnerCode(value: string | null | undefined): string | null {
  const code = String(value ?? '').replace(/[^a-z0-9]+/gi, '').toUpperCase();
  return code || null;
}

export function suggestOwnerCode(name: string | null | undefined): string {
  const words = String(name ?? '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const useful = words.filter((word) => !OWNER_CODE_STOP_WORDS.has(word));
  const code = normalizeOwnerCode((useful.length ? useful : words).join('').slice(0, 12));
  return code && code.length >= 2 ? code : 'UNASSIGNED';
}

export function generateSubcontractorIssueNo(ownerCode: string | null | undefined, sequence: number): string {
  const code = normalizeOwnerCode(ownerCode) ?? 'UNASSIGNED';
  return `SC-${code}-${String(Math.max(1, sequence)).padStart(5, '0')}`;
}

export function parseSubcontractorIssueSequence(issueNo: string | null | undefined, ownerCode: string | null | undefined): number | null {
  const code = normalizeOwnerCode(ownerCode);
  const text = String(issueNo ?? '').trim().toUpperCase();
  if (!code) return null;
  const match = new RegExp(`^SC-${code}-(\\d+)$`, 'i').exec(text);
  return match ? Number(match[1]) : null;
}

export function normalizeSubcontractorIssueNo(value: string | null | undefined): string | null {
  const text = String(value ?? '').trim().toUpperCase();
  return text || null;
}
