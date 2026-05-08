import { isOverdue as isOverdueDashboard } from '@/lib/defect-dashboard-utils';

export type DefectEditScope = 'none' | 'assigned' | 'team' | 'full';

export type DefectStatusValue = 'Planned' | 'Delay' | 'Done' | 'WIP' | 'InD';

export const DEFECT_STATUS_VALUES: DefectStatusValue[] = ['Planned', 'Delay', 'Done', 'WIP', 'InD'];

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
  hdec_eng_name: string | null;
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
  aconex_comments: string | null;
  work_type: string | null;
  classification_source: string | null;
  classified_at: string | null;
  raw_payload?: Record<string, unknown>;
  source_upload_id: string | null;
  data_source_type: string | null;
  is_active: boolean;
  updated_by: string | null;
  updated_at: string;
  created_at?: string;
  row_version: number;
  is_critical?: boolean;
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

export function isClosedDefect(item: Pick<DefectItem, 'actual_closure_date' | 'closure_status' | 'status'>): boolean {
  return Boolean(item.actual_closure_date)
    || String(item.closure_status ?? '') === 'Done'
    || String(item.status ?? '').trim().toLowerCase() === 'closed';
}

export function formatPct(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${Math.round(Number(value) * 10) / 10}%`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A defect is overdue when ANY of its planned dates is strictly BEFORE asOf
 * and the corresponding stage is not yet done. Cascade Done semantics apply
 * (closure done ⇒ all stages done; progress >= 100 ⇒ completion done).
 *
 * IMPORTANT: `asOf` is REQUIRED. Pass the project's Data Date — never `new Date()`.
 * Use `useLatestDataDate()` hook to obtain the canonical Data Date.
 *
 * Implementation delegates to `defect-dashboard-utils.isOverdue` (single source of truth).
 */
export function isOverdueDefect(
  item: Pick<DefectItem,
    'planned_start_date' | 'planned_completion_date' | 'planned_closure_date'
    | 'actual_start_date' | 'actual_completion_date' | 'actual_closure_date'
    | 'actual_progress_pct' | 'closure_status' | 'status'
  >,
  asOf: string,
): boolean {
  return isOverdueDashboard(item as any, asOf);
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

/** Extract the OWNER code from an SC issue number like `SC-{CODE}-{SEQ}`. Returns null if pattern does not match. */
export function extractOwnerCodeFromIssueNo(scNo: string | null | undefined): string | null {
  const text = String(scNo ?? '').trim().toUpperCase();
  const match = /^SC-([A-Z0-9]+)-(\d+)$/.exec(text);
  return match ? match[1] : null;
}

/** Build the next SC issue number for the given owner from the current max sequence. */
export function buildNextSubcontractorIssueNo(ownerCode: string | null | undefined, currentMaxSeq: number): string {
  const code = normalizeOwnerCode(ownerCode) ?? 'UNASSIGNED';
  const next = Math.max(0, Math.floor(currentMaxSeq)) + 1;
  return `SC-${code}-${String(next).padStart(5, '0')}`;
}
