// Warranty workflow status calculation
// Pipeline: Schedule R (ACRA) → Draft → Subcon Sign → HDEC Sign → Final
// Each stage has a planned date, an actual date, and a status (A/B/C/UR/WIP/Planned).

export type WarrantyStatusToken = 'A' | 'B' | 'C' | 'UR' | 'WIP' | 'Planned';

export type WarrantyStage = 'ACRA' | 'Draft' | 'Subcon' | 'HDEC' | 'Final';

export type WarrantyOverallStatus =
  | 'Pending ACRA'
  | 'Pending Draft'
  | 'Draft Under Review'
  | 'Pending Subcon Sign'
  | 'Subcon Sign Under Review'
  | 'Pending HDEC Sign'
  | 'HDEC Sign Under Review'
  | 'Pending Final'
  | 'Final Under Review'
  | 'Approved'
  | 'Rejected';

export const WARRANTY_OVERALL_STATUS_COLOR: Record<WarrantyOverallStatus, string> = {
  'Pending ACRA': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  'Pending Draft': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  'Draft Under Review': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  'Pending Subcon Sign': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'Subcon Sign Under Review': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  'Pending HDEC Sign': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'HDEC Sign Under Review': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  'Pending Final': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'Final Under Review': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  Approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  Rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
};

export interface WarrantyStatusInput {
  acra_info_status?: string | null;
  r_subcontract_date?: string | null;

  draft_planned_date?: string | null;
  draft_actual_date?: string | null;
  draft_status?: string | null;

  subcon_signing_planned_date?: string | null;
  subcon_signing_actual_date?: string | null;
  subcon_signing_status?: string | null;

  hdec_signing_planned_date?: string | null;
  hdec_signing_actual_date?: string | null;
  hdec_signing_status?: string | null;

  final_planned_date?: string | null;
  final_actual_date?: string | null;
  final_status?: string | null;
}

function up(v: string | null | undefined): string {
  return String(v ?? '').toUpperCase();
}

/** A status token "passes" the stage when it's A (approved) */
function isPassed(status: string | null | undefined): boolean {
  return up(status) === 'A';
}

/** B/C tokens indicate the stage was rejected and needs resubmission */
function isRejected(status: string | null | undefined): boolean {
  const s = up(status);
  return s === 'B' || s === 'C';
}

export function computeWarrantyOverallStatus(row: WarrantyStatusInput): WarrantyOverallStatus {
  // Final wins
  if (isPassed(row.final_status)) return 'Approved';
  if (isRejected(row.final_status)) return 'Rejected';
  if (row.final_actual_date && !row.final_status) return 'Final Under Review';

  // HDEC sign
  if (isRejected(row.hdec_signing_status)) return 'Rejected';
  if (row.final_planned_date && isPassed(row.hdec_signing_status)) return 'Pending Final';
  if (row.hdec_signing_actual_date && !row.hdec_signing_status) return 'HDEC Sign Under Review';

  // Subcon sign
  if (isRejected(row.subcon_signing_status)) return 'Rejected';
  if (isPassed(row.subcon_signing_status)) return 'Pending HDEC Sign';
  if (row.subcon_signing_actual_date && !row.subcon_signing_status) return 'Subcon Sign Under Review';

  // Draft
  if (isRejected(row.draft_status)) return 'Rejected';
  if (isPassed(row.draft_status)) return 'Pending Subcon Sign';
  if (row.draft_actual_date && !row.draft_status) return 'Draft Under Review';

  // ACRA / Schedule R
  if (!row.r_subcontract_date && up(row.acra_info_status) !== 'COMPLETE' && up(row.acra_info_status) !== 'OK') {
    return 'Pending ACRA';
  }
  return 'Pending Draft';
}

/** Returns the current pipeline stage. */
export function computeWarrantyStage(row: WarrantyStatusInput): WarrantyStage {
  if (isPassed(row.hdec_signing_status) || row.final_planned_date || row.final_actual_date || row.final_status) {
    return 'Final';
  }
  if (isPassed(row.subcon_signing_status) || row.hdec_signing_planned_date || row.hdec_signing_actual_date) {
    return 'HDEC';
  }
  if (isPassed(row.draft_status) || row.subcon_signing_planned_date || row.subcon_signing_actual_date) {
    return 'Subcon';
  }
  if (row.draft_planned_date || row.draft_actual_date) return 'Draft';
  return 'ACRA';
}

// ── Per-stage state for filter / cycle progress ───────────────────────────
export type WarrantyStageState = 'Done' | 'WIP' | 'Planned' | 'Delayed';

export const WARRANTY_STAGE_KEYS = ['acra', 'draft', 'subcon', 'hdec', 'final'] as const;
export type WarrantyStageKey = typeof WARRANTY_STAGE_KEYS[number];

export const WARRANTY_STAGE_LABELS: Record<WarrantyStageKey, string> = {
  acra: 'ACRA',
  draft: 'Draft',
  subcon: 'Subcon',
  hdec: 'HDEC',
  final: 'Final',
};

interface StageRefs {
  planned: string | null | undefined;
  actual: string | null | undefined;
  status: string | null | undefined;
}

function pickStageRefs(row: WarrantyStatusInput, key: WarrantyStageKey): StageRefs {
  switch (key) {
    case 'acra':
      return {
        planned: null,
        actual: row.r_subcontract_date,
        status: row.acra_info_status,
      };
    case 'draft':
      return {
        planned: row.draft_planned_date,
        actual: row.draft_actual_date,
        status: row.draft_status,
      };
    case 'subcon':
      return {
        planned: row.subcon_signing_planned_date,
        actual: row.subcon_signing_actual_date,
        status: row.subcon_signing_status,
      };
    case 'hdec':
      return {
        planned: row.hdec_signing_planned_date,
        actual: row.hdec_signing_actual_date,
        status: row.hdec_signing_status,
      };
    case 'final':
      return {
        planned: row.final_planned_date,
        actual: row.final_actual_date,
        status: row.final_status,
      };
  }
}

export function classifyWarrantyStageState(
  row: WarrantyStatusInput,
  key: WarrantyStageKey,
  asOf?: string | Date | null,
): WarrantyStageState {
  const refs = pickStageRefs(row, key);
  const status = up(refs.status);

  if (status === 'A' || status === 'COMPLETE' || status === 'OK') return 'Done';
  if (refs.actual && !status) return 'WIP';
  if (status === 'WIP' || status === 'UR') return 'WIP';

  // Delayed: planned date is past `asOf` and no actual yet
  if (refs.planned && !refs.actual) {
    const today = asOf
      ? typeof asOf === 'string'
        ? asOf.slice(0, 10)
        : asOf.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    if (refs.planned.slice(0, 10) < today) return 'Delayed';
  }
  return 'Planned';
}

export const WARRANTY_STAGE_STATES: WarrantyStageState[] = ['Done', 'WIP', 'Planned', 'Delayed'];

export const WARRANTY_STATUS_BADGE: Record<WarrantyStatusToken, string> = {
  A: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  B: 'bg-amber-100 text-amber-800 border-amber-300',
  C: 'bg-orange-100 text-orange-800 border-orange-300',
  UR: 'bg-blue-100 text-blue-800 border-blue-300',
  WIP: 'bg-purple-100 text-purple-800 border-purple-300',
  Planned: 'bg-muted text-muted-foreground border-border',
};
