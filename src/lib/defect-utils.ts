export type DefectEditScope = 'none' | 'assigned' | 'team' | 'full';

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
  planned_date: string | null;
  target_date: string | null;
  actual_progress_pct: number | null;
  closed_date: string | null;
  closure_status: string | null;
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
export const DEFECT_REVISION_FIELDS = ['planned_date', 'target_date', 'closed_date', 'actual_progress_pct', 'closure_status'] as const;

export function isClosedDefect(item: Pick<DefectItem, 'closure_status' | 'status' | 'closed_date'>): boolean {
  return Boolean(item.closed_date) || /closed|complete|done/i.test(`${item.closure_status ?? ''} ${item.status ?? ''}`);
}

export function formatPct(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${Math.round(Number(value) * 10) / 10}%`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isOverdueDefect(item: Pick<DefectItem, 'planned_date' | 'target_date' | 'closure_status' | 'status' | 'closed_date'>, asOf = todayIso()): boolean {
  if (isClosedDefect(item)) return false;
  const due = item.target_date ?? item.planned_date;
  return Boolean(due && due < asOf);
}

export function toNullable(value: FormDataEntryValue | string | null | undefined): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}
