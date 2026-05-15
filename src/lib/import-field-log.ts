// Shared helpers for building field-level import logs.
// Used by both T&C (ImportContext) and Defect (DefectImportContext) importers.

export type FieldLogOutcome =
  | 'applied'
  | 'unchanged'
  | 'derived'
  | 'auto_filled'
  | 'corrected'
  | 'skipped_empty'
  | 'skipped_clear_blocked'
  | 'skipped_no_permission'
  | 'rejected_invalid'
  | 'rejected_conflict'
  | 'info';

export type FieldLogKind = 'tnc' | 'defect' | 'docs' | 'punch';

export interface PendingFieldLog {
  // Filled in at write time:
  upload_id?: string;
  kind: FieldLogKind;
  // Used to back-fill row_log_id once the parent row log row is inserted.
  // We key by raw_row_no — sufficient because each raw row produces at most
  // one parent row log per import pass.
  raw_row_no: number | null;
  field_name: string;
  outcome: FieldLogOutcome;
  raw_value: string | null;
  applied_value: string | null;
  previous_value: string | null;
  reason_code: string | null;
  reason_detail: string | null;
}

export const stringifyForLog = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

export const valuesEqual = (a: unknown, b: unknown): boolean => {
  const sa = stringifyForLog(a);
  const sb = stringifyForLog(b);
  if (sa === null && sb === null) return true;
  if (sa === null || sb === null) return false;
  return sa.trim() === sb.trim();
};

export interface BuildFieldLogArgs {
  rawRowNo: number | null;
  field: string;
  outcome: FieldLogOutcome;
  raw?: unknown;
  applied?: unknown;
  previous?: unknown;
  code?: string | null;
  detail?: string | null;
}

export const buildFieldLog = (
  kind: FieldLogKind,
  a: BuildFieldLogArgs
): PendingFieldLog => ({
  kind,
  raw_row_no: a.rawRowNo,
  field_name: a.field,
  outcome: a.outcome,
  raw_value: stringifyForLog(a.raw),
  applied_value: stringifyForLog(a.applied),
  previous_value: stringifyForLog(a.previous),
  reason_code: a.code ?? null,
  reason_detail: a.detail ?? null,
});

/**
 * Compare an incoming value against the existing DB value and return the
 * appropriate outcome ('applied' for a real change, 'unchanged' otherwise).
 * Returns null for skipped (empty + nothing existed) — caller decides whether
 * to log skipped_empty.
 */
export const classifyChange = (
  incoming: unknown,
  existing: unknown
): 'applied' | 'unchanged' | 'empty' => {
  const incomingEmpty = incoming === null || incoming === undefined || incoming === '';
  const existingEmpty = existing === null || existing === undefined || existing === '';
  if (incomingEmpty && existingEmpty) return 'empty';
  if (valuesEqual(incoming, existing)) return 'unchanged';
  return 'applied';
};
