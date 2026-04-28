/**
 * Business rule: actual dates cannot be later than the project's Data Date.
 * The Data Date represents the snapshot moment; any actual event happening
 * "after" it is logically impossible.
 *
 * Used by:
 *  - Defect importer / Defect Detail / Quick Update / Bulk Edit
 *  - T&C importer / SubtestDetail / MobileUpdate
 *  - DB-side trigger guards as the final line of defence
 */

// --- Defect (defect_items) ---
export type ActualDateField =
  | 'actual_start_date'
  | 'actual_completion_date'
  | 'actual_closure_date';

const DEFECT_FIELD_LABEL: Record<ActualDateField, string> = {
  actual_start_date: 'Actual Start Date',
  actual_completion_date: 'Actual Completion Date',
  actual_closure_date: 'Actual Closure Date',
};

// --- T&C (subtests) ---
export type SubtestActualDateField =
  | 't1_actual_date'
  | 't2_actual_date'
  | 'pred_actual_date'
  | 'r1_actual_submission_date'
  | 'r2_actual_submission_date'
  | 'r2_actual_approval_date';

const SUBTEST_FIELD_LABEL: Record<SubtestActualDateField, string> = {
  t1_actual_date: 'T1 Actual Date',
  t2_actual_date: 'T2 Actual Date',
  pred_actual_date: 'Predecessor Actual Date',
  r1_actual_submission_date: 'R1 Actual Submission Date',
  r2_actual_submission_date: 'R2 Actual Submission Date',
  r2_actual_approval_date: 'R2 Actual Approval Date',
};

export const SUBTEST_ACTUAL_DATE_FIELDS: SubtestActualDateField[] = [
  't1_actual_date', 't2_actual_date', 'pred_actual_date',
  'r1_actual_submission_date', 'r2_actual_submission_date', 'r2_actual_approval_date',
];

export interface ActualDateValidationResult {
  ok: boolean;
  message?: string;
}

export function validateActualDateNotAfterDataDate(
  field: ActualDateField,
  value: string | null | undefined,
  dataDate: string,
): ActualDateValidationResult {
  if (!value) return { ok: true };
  if (value > dataDate) {
    return {
      ok: false,
      message: `${DEFECT_FIELD_LABEL[field]} (${value}) cannot be later than Data Date (${dataDate}).`,
    };
  }
  return { ok: true };
}

export function validateActualDatesAgainstDataDate(
  values: Partial<Record<ActualDateField, string | null | undefined>>,
  dataDate: string,
): ActualDateValidationResult {
  const violations: string[] = [];
  (Object.keys(values) as ActualDateField[]).forEach((field) => {
    const result = validateActualDateNotAfterDataDate(field, values[field], dataDate);
    if (!result.ok && result.message) violations.push(result.message);
  });
  if (violations.length === 0) return { ok: true };
  return { ok: false, message: violations.join(' ') };
}

/** Single subtest actual date check */
export function validateSubtestActualDateNotAfterDataDate(
  field: SubtestActualDateField,
  value: string | null | undefined,
  dataDate: string,
): ActualDateValidationResult {
  if (!value) return { ok: true };
  if (value > dataDate) {
    return {
      ok: false,
      message: `${SUBTEST_FIELD_LABEL[field]} (${value}) cannot be later than Data Date (${dataDate}).`,
    };
  }
  return { ok: true };
}

/** Validate any subset of subtest actual_* fields together */
export function validateSubtestActualDatesAgainstDataDate(
  values: Partial<Record<SubtestActualDateField, string | null | undefined>>,
  dataDate: string,
): ActualDateValidationResult {
  const violations: string[] = [];
  (Object.keys(values) as SubtestActualDateField[]).forEach((field) => {
    const result = validateSubtestActualDateNotAfterDataDate(field, values[field], dataDate);
    if (!result.ok && result.message) violations.push(result.message);
  });
  if (violations.length === 0) return { ok: true };
  return { ok: false, message: violations.join(' ') };
}
