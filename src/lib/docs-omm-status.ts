// OMM workflow status calculation
// Pipeline: Draft → Final → Approved (with response cycles)

export type OMMStatus =
  | 'Pending Draft'
  | 'Draft Under Review'
  | 'Pending Final Submission'
  | 'Final Under Review'
  | 'Approved'
  | 'Rejected';

export const OMM_STATUS_COLOR: Record<OMMStatus, string> = {
  'Pending Draft': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  'Draft Under Review': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  'Pending Final Submission': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'Final Under Review': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  'Approved': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  'Rejected': 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
};

export interface OMMStatusInput {
  draft_planned_date?: string | null;
  draft_actual_date?: string | null;
  draft_response_status?: string | null;
  draft_response_date?: string | null;
  final_planned_date?: string | null;
  final_actual_date?: string | null;
  final_response_status?: string | null;
  final_response_actual_date?: string | null;
}

export function computeOmmStatus(row: OMMStatusInput): OMMStatus {
  const dRes = (row.draft_response_status ?? '').toUpperCase();
  const fRes = (row.final_response_status ?? '').toUpperCase();
  if (fRes === 'A') return 'Approved';
  if (fRes === 'B' || fRes === 'C') return 'Rejected';
  if (row.final_actual_date && !fRes) return 'Final Under Review';
  if (row.final_planned_date && !row.final_actual_date) return 'Pending Final Submission';
  if (dRes === 'A') return 'Pending Final Submission';
  if (dRes === 'B' || dRes === 'C') return 'Rejected';
  if (row.draft_actual_date && !dRes) return 'Draft Under Review';
  return 'Pending Draft';
}

export function computeOmmStage(row: OMMStatusInput): 'Draft' | 'Final' | 'Closed' {
  const fRes = (row.final_response_status ?? '').toUpperCase();
  if (fRes === 'A') return 'Closed';
  const dRes = (row.draft_response_status ?? '').toUpperCase();
  if (dRes === 'A' || row.final_actual_date || row.final_planned_date) return 'Final';
  return 'Draft';
}

// ---------- Copy quantity alert ----------
export type CopyAlertState = 'ok' | 'short' | 'over' | 'pending';

export function copyAlertState(required: number | null | undefined, actual: number | null | undefined): CopyAlertState {
  const req = typeof required === 'number' ? required : null;
  const act = typeof actual === 'number' ? actual : null;
  if (req == null) return 'pending';
  if (act == null) return 'pending';
  if (act < req) return 'short';
  if (act > req) return 'over';
  return 'ok';
}

export interface OmmCopyAlertInput {
  pdf_required_qty?: number | null;
  pdf_actual_qty?: number | null;
  hardcopy_required_qty?: number | null;
  hardcopy_actual_qty?: number | null;
}

export function computeOmmCopyAlert(row: OmmCopyAlertInput): {
  pdf: CopyAlertState;
  hardcopy: CopyAlertState;
  hasMismatch: boolean;
} {
  const pdf = copyAlertState(row.pdf_required_qty, row.pdf_actual_qty);
  const hardcopy = copyAlertState(row.hardcopy_required_qty, row.hardcopy_actual_qty);
  return {
    pdf,
    hardcopy,
    hasMismatch: pdf === 'short' || pdf === 'over' || hardcopy === 'short' || hardcopy === 'over',
  };
}

export const OMM_CATEGORY_LABELS: Record<string, string> = {
  Architectural: 'Architectural',
  'Mechanical & Electrical': 'Mechanical & Electrical',
  Miscellaneous: 'Miscellaneous',
};
