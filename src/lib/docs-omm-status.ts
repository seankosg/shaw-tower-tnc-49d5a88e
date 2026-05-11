// OMM workflow status calculation
// Pipeline: Sub1 → Sub2 → Sub3 → Final → Approved
// Each submission cycle has a response status (A=approved, B/C=resubmit required).

export type OMMStatus =
  | 'Pending Sub1'
  | 'Sub1 Under Review'
  | 'Pending Sub2'
  | 'Sub2 Under Review'
  | 'Pending Sub3'
  | 'Sub3 Under Review'
  | 'Pending Final'
  | 'Final Under Review'
  | 'Approved'
  | 'Rejected';

export const OMM_STATUS_COLOR: Record<OMMStatus, string> = {
  'Pending Sub1': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  'Sub1 Under Review': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  'Pending Sub2': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  'Sub2 Under Review': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  'Pending Sub3': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  'Sub3 Under Review': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  'Pending Final': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'Final Under Review': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  'Approved': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  'Rejected': 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
};

export interface OMMStatusInput {
  sub1_planned_date?: string | null;
  sub1_actual_date?: string | null;
  sub1_response_date?: string | null;
  sub1_response_status?: string | null;
  sub2_planned_date?: string | null;
  sub2_actual_date?: string | null;
  sub2_response_planned_date?: string | null;
  sub2_response_actual_date?: string | null;
  sub2_response_status?: string | null;
  sub3_planned_date?: string | null;
  sub3_actual_date?: string | null;
  sub3_response_planned_date?: string | null;
  sub3_response_actual_date?: string | null;
  sub3_response_status?: string | null;
  final_planned_date?: string | null;
  final_actual_date?: string | null;
  final_response_planned_date?: string | null;
  final_response_actual_date?: string | null;
  final_response_status?: string | null;
}

const u = (v: string | null | undefined) => (v ?? '').toUpperCase();

export function computeOmmStatus(row: OMMStatusInput): OMMStatus {
  const fRes = u(row.final_response_status);
  if (fRes === 'A') return 'Approved';
  if (fRes === 'B' || fRes === 'C') return 'Rejected';
  if (row.final_actual_date) return 'Final Under Review';
  if (row.final_planned_date) return 'Pending Final';

  const s3Res = u(row.sub3_response_status);
  if (s3Res === 'A') return 'Pending Final';
  if (s3Res === 'B' || s3Res === 'C') return 'Pending Final'; // resubmission cycle exhausted → escalate to final
  if (row.sub3_actual_date) return 'Sub3 Under Review';
  if (row.sub3_planned_date) return 'Pending Sub3';

  const s2Res = u(row.sub2_response_status);
  if (s2Res === 'A') return 'Pending Final';
  if (s2Res === 'B' || s2Res === 'C') return 'Pending Sub3';
  if (row.sub2_actual_date) return 'Sub2 Under Review';
  if (row.sub2_planned_date) return 'Pending Sub2';

  const s1Res = u(row.sub1_response_status);
  if (s1Res === 'A') return 'Pending Final';
  if (s1Res === 'B' || s1Res === 'C') return 'Pending Sub2';
  if (row.sub1_actual_date) return 'Sub1 Under Review';

  return 'Pending Sub1';
}

export type OMMStage = 'Sub1' | 'Sub2' | 'Sub3' | 'Final' | 'Closed';

export function computeOmmStage(row: OMMStatusInput): OMMStage {
  if (u(row.final_response_status) === 'A') return 'Closed';
  if (row.final_actual_date || row.final_planned_date) return 'Final';
  if (u(row.sub3_response_status) === 'A') return 'Final';
  if (row.sub3_actual_date || row.sub3_planned_date) return 'Sub3';
  if (u(row.sub2_response_status) === 'A') return 'Final';
  if (u(row.sub2_response_status) === 'B' || u(row.sub2_response_status) === 'C') return 'Sub3';
  if (row.sub2_actual_date || row.sub2_planned_date) return 'Sub2';
  if (u(row.sub1_response_status) === 'A') return 'Final';
  if (u(row.sub1_response_status) === 'B' || u(row.sub1_response_status) === 'C') return 'Sub2';
  return 'Sub1';
}

// ---------- Stage cell classification (used by Cycle Progress UI) ----------
export type OmmStageState = 'planned' | 'wip' | 'done' | 'delayed' | 'empty';

interface CycleSlice {
  planned: string | null | undefined;
  actual: string | null | undefined;
  responseStatus?: string | null | undefined;
}

function classifyCycle(slice: CycleSlice, asOf: Date = new Date()): OmmStageState {
  const status = u(slice.responseStatus);
  if (status === 'A') return 'done';
  if (slice.actual) return 'wip';
  if (slice.planned) {
    const plannedDate = new Date(slice.planned);
    if (!Number.isNaN(plannedDate.getTime()) && plannedDate < asOf) return 'delayed';
    return 'planned';
  }
  return 'empty';
}

export function classifyOmmCycles(row: OMMStatusInput, asOf?: Date): {
  sub1: OmmStageState;
  sub2: OmmStageState;
  sub3: OmmStageState;
  final: OmmStageState;
} {
  return {
    sub1: classifyCycle({ planned: row.sub1_planned_date, actual: row.sub1_actual_date, responseStatus: row.sub1_response_status }, asOf),
    sub2: classifyCycle({ planned: row.sub2_planned_date, actual: row.sub2_actual_date, responseStatus: row.sub2_response_status }, asOf),
    sub3: classifyCycle({ planned: row.sub3_planned_date, actual: row.sub3_actual_date, responseStatus: row.sub3_response_status }, asOf),
    final: classifyCycle({ planned: row.final_planned_date, actual: row.final_actual_date, responseStatus: row.final_response_status }, asOf),
  };
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
