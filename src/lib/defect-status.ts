import { DEFECT_STATUS_VALUES, type DefectStatusValue } from '@/lib/defect-utils';

export interface DefectStatusInputs {
  planned_start_date: string | null;
  planned_completion_date: string | null;
  planned_closure_date: string | null;
  actual_start_date: string | null;
  actual_completion_date: string | null;
  actual_closure_date: string | null;
  planned_progress_pct: number | null;
  actual_progress_pct: number | null;
}

export function isValidDefectStatus(value: unknown): value is DefectStatusValue {
  return typeof value === 'string' && (DEFECT_STATUS_VALUES as string[]).includes(value);
}

/**
 * Compute Completion Status using strict comparison rules.
 * Order of checks (first match wins):
 *  1. actual_completion_date present OR actual_progress_pct >= 100 -> 'Done'
 *  2. asOf < planned_start_date -> 'Planned'
 *  3. actual_progress_pct < planned_progress_pct -> 'Delay'
 *  4. planned_completion_date < asOf and not done -> 'Delay'
 *  5. actual_progress_pct > 0 -> 'WIP'
 *  6. otherwise -> 'Planned'
 */
export function computeCompletionStatus(input: DefectStatusInputs, asOf: string): DefectStatusValue {
  const actualPct = Number(input.actual_progress_pct ?? 0);
  if (input.actual_completion_date || actualPct >= 100) return 'Done';
  if (input.planned_start_date && asOf < input.planned_start_date) return 'Planned';
  const plannedPct = Number(input.planned_progress_pct ?? 0);
  if (actualPct < plannedPct) return 'Delay';
  if (input.planned_completion_date && input.planned_completion_date < asOf && !input.actual_completion_date) return 'Delay';
  if (actualPct > 0) return 'WIP';
  return 'Planned';
}

/**
 * Compute Closure Status with completion linkage.
 *  1. actual_closure_date present -> 'Done'
 *  2. planned_closure_date < asOf -> 'Delay'
 *  3. completionStatus == 'Done' AND no actual_closure_date -> 'WIP'
 *  4. otherwise -> 'Planned'
 */
export function computeClosureStatus(
  input: DefectStatusInputs,
  asOf: string,
  completionStatus: DefectStatusValue,
): DefectStatusValue {
  if (input.actual_closure_date) return 'Done';
  if (input.planned_closure_date && input.planned_closure_date < asOf) return 'Delay';
  if (completionStatus === 'Done' && !input.actual_closure_date) return 'WIP';
  return 'Planned';
}

/**
 * Convenience: compute both statuses at once.
 */
export function computeDefectStatuses(input: DefectStatusInputs, asOf: string) {
  const completion = computeCompletionStatus(input, asOf);
  const closure = computeClosureStatus(input, asOf, completion);
  return { completion_status: completion, closure_status: closure };
}
