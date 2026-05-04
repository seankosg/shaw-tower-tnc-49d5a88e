// OMM workflow status calculation
// Pipeline: Draft → Submission → Approved

export type OMMStatus = 'Pending Draft' | 'Pending Submission' | 'Under Review' | 'Approved';

export const OMM_STATUS_BADGE_VARIANT: Record<OMMStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  'Pending Draft': 'destructive',
  'Pending Submission': 'outline',
  'Under Review': 'secondary',
  'Approved': 'default',
};

interface OMMStatusInput {
  draft_actual_date?: string | null;
  submission_actual_date?: string | null;
  approved_date?: string | null;
}

export function computeOMMStatus(row: OMMStatusInput): OMMStatus {
  if (row.approved_date) return 'Approved';
  if (row.submission_actual_date) return 'Under Review';
  if (row.draft_actual_date) return 'Pending Submission';
  return 'Pending Draft';
}

export const OMM_CATEGORY_LABELS: Record<string, string> = {
  A: 'Architectural',
  B: 'Mechanical & Electrical',
  C: 'Miscellaneous',
};
