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
  /**
   * Aconex (LL) original Status field. Auto-mapping rules:
   *   - "Closed"     → closure_status = Done (and completion = Done)
   *   - "Work Done"  → completion_status = Done (closure derived from dates)
   *   - "Open" / "In dispute" / others → no auto-mapping
   */
  status?: string | null;
}

/** Returns true when the Aconex `Status` column indicates the defect is closed. */
export function isStatusClosed(status: string | null | undefined): boolean {
  return String(status ?? '').trim().toLowerCase() === 'closed';
}

/** Returns true when the Aconex `Status` column indicates work is done (but not yet closed). */
export function isStatusWorkDone(status: string | null | undefined): boolean {
  return String(status ?? '').trim().toLowerCase() === 'work done';
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
  // Aconex Status auto-mapping: "Work Done" or "Closed" → completion is Done.
  if (
    input.actual_completion_date
    || actualPct >= 100
    || isStatusWorkDone(input.status)
    || isStatusClosed(input.status)
  ) return 'Done';
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
  // LL Status === "Closed" → treat as closure Done even when no actual_closure_date is present
  if (isStatusClosed(input.status)) return 'Done';
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

export interface ReconcileClosureCompletionResult {
  completion_status: DefectStatusValue;
  closure_status: DefectStatusValue;
  /** When present, importer should overwrite these fields on the row. */
  patch?: {
    actual_completion_date: string;
    actual_progress_pct: 100;
  };
  /** True when closure is Done but Excel explicitly provided non-Done completion data — auto-fix skipped. */
  conflict?: boolean;
  conflictDetail?: string;
}

/**
 * Auto-reconcile rule: if Closure is Done but Completion is not, force Completion to Done
 * by populating actual_completion_date and actual_progress_pct=100.
 *
 * "Excel-explicit values win" policy:
 *   - If Excel row carries an explicit actual_progress_pct (any non-null number < 100) OR
 *     an explicit actual_completion_date, do NOT auto-fix; flag conflict instead.
 *
 * @param input        Row's date/progress/status inputs (post merge with existing values).
 * @param asOf         Data date — used as fallback completion date when no closure date exists.
 * @param excelExplicit Original Excel-provided (raw) values to detect user-supplied conflicts.
 */
export function reconcileClosureCompletion(
  input: DefectStatusInputs,
  asOf: string,
  excelExplicit: { actual_progress_pct: number | null | undefined; actual_completion_date: string | null | undefined },
): ReconcileClosureCompletionResult {
  const completion = computeCompletionStatus(input, asOf);
  const closure = computeClosureStatus(input, asOf, completion);

  const excelPct = excelExplicit.actual_progress_pct;
  const excelDate = excelExplicit.actual_completion_date;
  const hasExplicitPct = excelPct !== null && excelPct !== undefined && Number(excelPct) < 100;
  const hasExplicitDate = excelDate !== null && excelDate !== undefined && String(excelDate).trim() !== '';

  // Case A: Aconex Status="Work Done" or "Closed" implies completion=Done by status,
  // but actual_completion_date / actual_progress_pct may be missing. Auto-fill them unless Excel
  // explicitly contradicts.
  if (
    completion === 'Done'
    && (isStatusWorkDone(input.status) || isStatusClosed(input.status))
    && !input.actual_completion_date
    && Number(input.actual_progress_pct ?? 0) < 100
  ) {
    if (hasExplicitPct || hasExplicitDate) {
      return {
        completion_status: completion,
        closure_status: closure,
        conflict: true,
        conflictDetail: `Aconex Status="${input.status}" implies completion=Done but Excel provided actual_progress_pct=${excelPct ?? 'null'}, actual_completion_date=${excelDate ?? 'null'}. Auto-reconcile skipped (Excel value wins).`,
      };
    }
    // Prefer closure date if available, otherwise asOf.
    const completionDate = input.actual_closure_date ?? asOf;
    return {
      completion_status: completion,
      closure_status: closure,
      patch: {
        actual_completion_date: completionDate,
        actual_progress_pct: 100,
      },
    };
  }

  if (closure !== 'Done' || completion === 'Done') {
    return { completion_status: completion, closure_status: closure };
  }

  // Case B (existing): Closure=Done, Completion!=Done → check for Excel conflict (vars reused from above)

  if (hasExplicitPct || hasExplicitDate) {
    return {
      completion_status: completion,
      closure_status: closure,
      conflict: true,
      conflictDetail: `Closure=Done but Excel provided actual_progress_pct=${excelPct ?? 'null'}, actual_completion_date=${excelDate ?? 'null'}. Auto-reconcile skipped (Excel value wins).`,
    };
  }

  // Auto-fix: derive completion date from closure date or fall back to data date
  const completionDate = input.actual_closure_date ?? asOf;
  return {
    completion_status: 'Done',
    closure_status: closure,
    patch: {
      actual_completion_date: completionDate,
      actual_progress_pct: 100,
    },
  };
}
