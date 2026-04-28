/**
 * Business rule: actual dates (start / completion / closure) cannot be later
 * than the project's Data Date. The Data Date represents the snapshot moment;
 * any actual event happening "after" it is logically impossible.
 *
 * Used by:
 *  - Excel importer (DefectImportContext) — rejects offending rows
 *  - Defect Detail page — blocks save
 *  - Quick Update page — blocks save
 *  - Bulk Edit Bar — blocks save
 */

export type ActualDateField =
  | 'actual_start_date'
  | 'actual_completion_date'
  | 'actual_closure_date';

const FIELD_LABEL: Record<ActualDateField, string> = {
  actual_start_date: 'Actual Start Date',
  actual_completion_date: 'Actual Completion Date',
  actual_closure_date: 'Actual Closure Date',
};

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
      message: `${FIELD_LABEL[field]} (${value}) cannot be later than Data Date (${dataDate}).`,
    };
  }
  return { ok: true };
}

/**
 * Validate a record's actual_* fields together. Returns first violation message
 * (or all combined) for surfacing in toasts.
 */
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
