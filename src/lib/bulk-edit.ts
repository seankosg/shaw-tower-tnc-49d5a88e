import { supabase } from '@/integrations/supabase/client';

export type BulkEditableInputType = 'select' | 'date' | 'text' | 'textarea' | 'boolean' | 'number';

export interface BulkEditableField {
  /** DB column name */
  field: string;
  /** Human label shown in UI */
  label: string;
  /** Input control type */
  inputType: BulkEditableInputType;
  /** For 'select': list of options. Built lazily by the caller. */
  options?: { value: string; label: string }[];
  /** Optional grouping label shown in the field picker */
  group?: string;
  /**
   * Optional helper for fields that should also write companion columns
   * when applied (e.g. picking a subcontractor sets both id + name).
   * The bar will pass through `extraUpdates` to applyBulkUpdate.
   */
  companionFields?: string[];
}

export interface BulkUpdateRequest {
  /** Postgres table name */
  table: 'defect_items' | 'subtests' | 'docs_drawings';
  /** Primary key column (always 'id' here) */
  idField?: string;
  /** Row ids to update */
  ids: string[];
  /** Column to set */
  field: string;
  /** New value (string, number, boolean, or null to clear) */
  value: string | number | boolean | null;
  /** Auth uid of the user performing the change */
  userId: string;
  /** Free-form source tag stored on the change log */
  changeSource?: string;
  /**
   * Optional companion fields applied to the same rows in the same UPDATE.
   * Each entry is logged as its own change-log row.
   */
  extraUpdates?: Record<string, string | number | boolean | null>;
}

export interface BulkUpdateResult {
  attempted: number;
  succeeded: number;
  failed: number;
  errors: { id: string; message: string }[];
}

const CHUNK_SIZE = 100;
export const BULK_EDIT_MAX_ROWS = 500;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Map source table -> change log table */
function logTableFor(
  table: BulkUpdateRequest['table'],
): 'defect_change_log' | 'subtest_change_log' | 'docs_change_log' {
  if (table === 'defect_items') return 'defect_change_log';
  if (table === 'docs_drawings') return 'docs_change_log';
  return 'subtest_change_log';
}

/** Map source table -> entity id column on the log table */
function logIdField(
  table: BulkUpdateRequest['table'],
): 'defect_id' | 'subtest_id' | 'drawing_id' {
  if (table === 'defect_items') return 'defect_id';
  if (table === 'docs_drawings') return 'drawing_id';
  return 'subtest_id';
}

export async function applyBulkUpdate(req: BulkUpdateRequest): Promise<BulkUpdateResult> {
  const { table, ids, field, value, userId } = req;
  const idField = req.idField ?? 'id';
  const changeSource = req.changeSource ?? 'bulk_edit';
  const result: BulkUpdateResult = { attempted: ids.length, succeeded: 0, failed: 0, errors: [] };
  if (ids.length === 0) return result;

  for (const ids_chunk of chunk(ids, CHUNK_SIZE)) {
    // 1) Fetch current values for change-log diff
    const { data: existing, error: selErr } = await (supabase as any)
      .from(table)
      .select(`${idField}, ${field}`)
      .in(idField, ids_chunk);

    if (selErr) {
      result.failed += ids_chunk.length;
      ids_chunk.forEach((id) => result.errors.push({ id, message: selErr.message }));
      continue;
    }

    const existingMap = new Map<string, unknown>();
    for (const row of (existing ?? []) as any[]) existingMap.set(row[idField], row[field]);

    // Only update rows where the value actually differs
    const changingIds: string[] = [];
    const logRows: any[] = [];
    for (const id of ids_chunk) {
      const oldVal = existingMap.get(id);
      const normalizedOld = oldVal == null ? null : String(oldVal);
      const normalizedNew = value == null ? null : String(value);
      if (normalizedOld === normalizedNew) continue;
      changingIds.push(id);
      logRows.push({
        [logIdField(table)]: id,
        changed_field: field,
        old_value: normalizedOld,
        new_value: normalizedNew,
        changed_by: userId,
        change_source: changeSource,
      });
    }

    if (changingIds.length === 0) {
      // counted as "succeeded" no-op
      result.succeeded += ids_chunk.length;
      continue;
    }

    // 2) Apply update
    const { error: updErr, data: updated } = await (supabase as any)
      .from(table)
      .update({ [field]: value, updated_by: userId })
      .in(idField, changingIds)
      .select(idField);

    if (updErr) {
      result.failed += changingIds.length;
      changingIds.forEach((id) => result.errors.push({ id, message: updErr.message }));
      // unchanged rows (no-op) still counted as success
      result.succeeded += ids_chunk.length - changingIds.length;
      continue;
    }

    const updatedIds = new Set<string>((updated ?? []).map((r: any) => r[idField]));
    const succeededInChunk = updatedIds.size;
    const blockedInChunk = changingIds.length - succeededInChunk;
    result.succeeded += succeededInChunk + (ids_chunk.length - changingIds.length); // include no-ops
    result.failed += blockedInChunk;
    if (blockedInChunk > 0) {
      changingIds
        .filter((id) => !updatedIds.has(id))
        .forEach((id) => result.errors.push({ id, message: 'Update blocked by permission policy' }));
    }

    // 3) Insert change log only for actually updated rows
    const successfulLogs = logRows.filter((r) => updatedIds.has(r[logIdField(table)]));
    if (successfulLogs.length > 0) {
      const { error: logErr } = await (supabase as any).from(logTableFor(table)).insert(successfulLogs);
      if (logErr) {
        // Log insert errors are non-fatal but recorded in errors[]
        result.errors.push({ id: '(change-log)', message: logErr.message });
      }
    }
  }

  return result;
}
