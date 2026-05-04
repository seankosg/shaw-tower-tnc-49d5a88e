import { supabase } from '@/integrations/supabase/client';
import { CYCLE_DATA_FIELDS, normalizeApprovalStatus } from '@/lib/docs-status';

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
  const { table, ids, field, value, userId, extraUpdates } = req;
  const idField = req.idField ?? 'id';
  const changeSource = req.changeSource ?? 'bulk_edit';
  const result: BulkUpdateResult = { attempted: ids.length, succeeded: 0, failed: 0, errors: [] };
  if (ids.length === 0) return result;

  // All fields involved in this update (primary + companions)
  const allFields = [field, ...Object.keys(extraUpdates ?? {})];
  const allValues: Record<string, string | number | boolean | null> = {
    [field]: value,
    ...(extraUpdates ?? {}),
  };

  for (const ids_chunk of chunk(ids, CHUNK_SIZE)) {
    // 1) Fetch current values for change-log diff
    const selectCols = [idField, ...allFields].join(', ');
    const { data: existing, error: selErr } = await (supabase as any)
      .from(table)
      .select(selectCols)
      .in(idField, ids_chunk);

    if (selErr) {
      result.failed += ids_chunk.length;
      ids_chunk.forEach((id) => result.errors.push({ id, message: selErr.message }));
      continue;
    }

    const existingMap = new Map<string, Record<string, unknown>>();
    for (const row of (existing ?? []) as any[]) existingMap.set(row[idField], row);

    // Determine which rows actually need updating (any field differs)
    const changingIds: string[] = [];
    const logRows: any[] = [];
    for (const id of ids_chunk) {
      const row = existingMap.get(id) ?? {};
      const perFieldDiffs: { f: string; oldNorm: string | null; newNorm: string | null }[] = [];
      let anyDiff = false;
      for (const f of allFields) {
        const oldVal = row[f];
        const newVal = allValues[f];
        const oldNorm = oldVal == null ? null : String(oldVal);
        const newNorm = newVal == null ? null : String(newVal);
        if (oldNorm !== newNorm) anyDiff = true;
        perFieldDiffs.push({ f, oldNorm, newNorm });
      }
      if (!anyDiff) continue;
      changingIds.push(id);
      for (const d of perFieldDiffs) {
        if (d.oldNorm === d.newNorm) continue;
        logRows.push({
          [logIdField(table)]: id,
          changed_field: d.f,
          old_value: d.oldNorm,
          new_value: d.newNorm,
          changed_by: userId,
          change_source: changeSource,
        });
      }
    }

    if (changingIds.length === 0) {
      result.succeeded += ids_chunk.length;
      continue;
    }

    // 2) Apply update
    const updatePayload: Record<string, unknown> = { ...allValues, updated_by: userId };
    const { error: updErr, data: updated } = await (supabase as any)
      .from(table)
      .update(updatePayload)
      .in(idField, changingIds)
      .select(idField);

    if (updErr) {
      result.failed += changingIds.length;
      changingIds.forEach((id) => result.errors.push({ id, message: updErr.message }));
      result.succeeded += ids_chunk.length - changingIds.length;
      continue;
    }

    const updatedIds = new Set<string>((updated ?? []).map((r: any) => r[idField]));
    const succeededInChunk = updatedIds.size;
    const blockedInChunk = changingIds.length - succeededInChunk;
    result.succeeded += succeededInChunk + (ids_chunk.length - changingIds.length);
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
        result.errors.push({ id: '(change-log)', message: logErr.message });
      }
    }

    // 4) Docs-only: when bulk-setting subN_approval_status to 'A',
    //    clear subsequent cycles' data on the same rows.
    if (table === 'docs_drawings' && updatedIds.size > 0) {
      const cycleMatch = /^sub([123])_approval_status$/.exec(field);
      if (cycleMatch && normalizeApprovalStatus(value as any) === 'A') {
        const setCycle = parseInt(cycleMatch[1], 10) as 1 | 2 | 3;
        const targetCycles = setCycle === 1 ? [2, 3] : setCycle === 2 ? [3] : [];
        if (targetCycles.length > 0) {
          const cleanupPayload: Record<string, null> = {};
          for (const n of targetCycles) {
            for (const f of CYCLE_DATA_FIELDS) cleanupPayload[`sub${n}_${f}`] = null;
          }
          const ids = [...updatedIds];
          // Read current values for diff/log
          const { data: beforeRows } = await (supabase as any)
            .from('docs_drawings')
            .select(['id', ...Object.keys(cleanupPayload)].join(', '))
            .in('id', ids);
          await (supabase as any)
            .from('docs_drawings')
            .update({ ...cleanupPayload, updated_by: userId })
            .in('id', ids);
          const cleanupLogs: any[] = [];
          for (const row of (beforeRows ?? []) as any[]) {
            for (const f of Object.keys(cleanupPayload)) {
              const oldVal = row[f];
              if (oldVal == null || oldVal === '') continue;
              cleanupLogs.push({
                drawing_id: row.id,
                changed_field: f,
                old_value: String(oldVal),
                new_value: null,
                changed_by: userId,
                change_source: 'auto_close_cleanup',
              });
            }
          }
          if (cleanupLogs.length > 0) {
            await (supabase as any).from('docs_change_log').insert(cleanupLogs);
          }
        }
      }
    }
  }

  return result;
}
