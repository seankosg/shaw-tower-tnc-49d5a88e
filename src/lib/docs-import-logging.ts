// Common logging helper for the Docs Import hub.
// Writes batch counters + docs_upload_row_logs + import_field_logs (kind='docs')
// + docs_change_log in a single bulk-insert pass. Used by every sub-module worker
// so that ABD / OMM / Warranty / Spare Part audit trails stay identical.
import { supabase } from '@/integrations/supabase/client';
import type { ImportRowOutcome, WorkerContext } from '@/contexts/docs-import/types';

interface BatchCounters {
  totalRows: number;
  inserted: number;
  updated: number;
  skipped: number;
  rejected: number;
}

export async function writeImportLogs(
  ctx: WorkerContext,
  outcomes: ImportRowOutcome[],
  counters: BatchCounters,
): Promise<void> {
  // 1. docs_upload_row_logs — one row per processed input row.
  const rowLogs = outcomes.map((o) => ({
    upload_id: ctx.batchId,
    raw_row_no: o.rawRowNo,
    document_no: o.key, // sub-module key shares this slot; UI labels it dynamically.
    action_taken: o.action,
    reason_code: o.reasonCode ?? null,
    reason_detail: o.reasonDetail ?? null,
  }));
  for (let i = 0; i < rowLogs.length; i += 500) {
    const { error } = await (supabase as any)
      .from('docs_upload_row_logs')
      .insert(rowLogs.slice(i, i + 500));
    if (error) console.warn('docs_upload_row_logs insert failed:', error);
  }

  // 2. import_field_logs — flatten per-row pending logs.
  const fieldLogs: any[] = [];
  for (const o of outcomes) {
    for (const fl of o.fieldLogs) {
      fieldLogs.push({
        upload_id: ctx.batchId,
        kind: 'docs',
        raw_row_no: fl.raw_row_no,
        field_name: fl.field_name,
        outcome: fl.outcome,
        raw_value: fl.raw_value,
        applied_value: fl.applied_value,
        previous_value: fl.previous_value,
        reason_code: fl.reason_code,
        reason_detail: fl.reason_detail,
        created_by: ctx.userId,
      });
    }
  }
  for (let i = 0; i < fieldLogs.length; i += 500) {
    const { error } = await (supabase as any)
      .from('import_field_logs')
      .insert(fieldLogs.slice(i, i + 500));
    if (error) console.warn('import_field_logs (docs) insert failed:', error);
  }

  // 3. docs_change_log — one row per changed field on inserted/updated records.
  const changeLogs: any[] = [];
  for (const o of outcomes) {
    if (!o.changeLog || o.changeLog.length === 0) continue;
    if (!o.recordId && !o.drawingId) continue;
    for (const c of o.changeLog) {
      changeLogs.push({
        sub_module: ctx.subModule,
        record_id: o.recordId ?? null,
        drawing_id: o.drawingId ?? null,
        changed_field: c.field,
        old_value: c.oldValue,
        new_value: c.newValue,
        change_source: 'excel_import',
        upload_id: ctx.batchId,
        changed_by: ctx.userId,
      });
    }
  }
  for (let i = 0; i < changeLogs.length; i += 500) {
    const { error } = await (supabase as any)
      .from('docs_change_log')
      .insert(changeLogs.slice(i, i + 500));
    if (error) console.warn('docs_change_log insert failed:', error);
  }

  // 4. Final batch counters.
  await (supabase as any)
    .from('docs_upload_batches')
    .update({
      status: 'completed',
      processed_rows: counters.totalRows,
      success_rows: counters.inserted + counters.updated,
      skipped_rows: counters.skipped,
      rejected_rows: counters.rejected,
    })
    .eq('id', ctx.batchId);
}

/** Bounded-concurrency runner — same shape as the legacy ABD context. */
export async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIdx = 0;
  async function pump() {
    while (true) {
      const idx = nextIdx++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => pump()));
  return results;
}

export function fmtSupabaseError(err: any): { message: string; code?: string; details?: string; hint?: string } {
  if (!err) return { message: 'Unknown error' };
  if (err instanceof Error) return { message: err.message };
  return {
    message: err.message ?? String(err),
    code: err.code,
    details: err.details,
    hint: err.hint,
  };
}

export function normalizeOrgKey(value: string | null | undefined): string {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface OrgResolverMaps {
  aliasByLabel: Map<string, string | null>;
  subcontractorByName: Map<string, string>;
}

export async function buildOrgResolver(): Promise<OrgResolverMaps> {
  const aliasByLabel = new Map<string, string | null>();
  const subcontractorByName = new Map<string, string>();
  const [aliasRes, subRes] = await Promise.all([
    (supabase as any).from('docs_org_alias').select('raw_label, subcontractor_id').eq('is_active', true),
    (supabase as any).from('subcontractor_master').select('id, name').eq('is_active', true),
  ]);
  for (const a of aliasRes.data ?? []) {
    aliasByLabel.set(normalizeOrgKey(a.raw_label), a.subcontractor_id ?? null);
  }
  for (const s of subRes.data ?? []) {
    subcontractorByName.set(normalizeOrgKey(s.name), s.id);
  }
  return { aliasByLabel, subcontractorByName };
}

export function resolveSubcontractorId(rawOrg: string | null | undefined, maps: OrgResolverMaps): string | null {
  if (!rawOrg) return null;
  const key = normalizeOrgKey(rawOrg);
  if (!key) return null;
  if (maps.aliasByLabel.has(key)) return maps.aliasByLabel.get(key) ?? null;
  if (maps.subcontractorByName.has(key)) return maps.subcontractorByName.get(key) ?? null;
  return null;
}

/** Persists newly-discovered raw org labels with subcontractor_id=null so admins can match them. */
export async function persistUnmatchedOrgs(
  unmatchedKeys: Set<string>,
  rowsForRaw: Array<{ organisation_raw?: string | null }>,
): Promise<void> {
  if (unmatchedKeys.size === 0) return;
  const rawByKey = new Map<string, string>();
  for (const row of rowsForRaw) {
    if (!row.organisation_raw) continue;
    const key = normalizeOrgKey(row.organisation_raw);
    if (unmatchedKeys.has(key) && !rawByKey.has(key)) {
      rawByKey.set(key, row.organisation_raw.trim());
    }
  }
  const aliasRows = [...rawByKey.values()].map((raw_label) => ({
    raw_label, subcontractor_id: null, is_active: true,
  }));
  if (aliasRows.length > 0) {
    await (supabase as any)
      .from('docs_org_alias')
      .upsert(aliasRows, { onConflict: 'raw_label', ignoreDuplicates: true });
  }
}

export async function getDefaultProject(): Promise<{ id: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (!session) {
    throw new Error(
      'Not signed in. Please log in (admin/superuser) and retry the import. ' +
      'Background queries to projects/docs tables are blocked by RLS without a session.',
    );
  }
  const { data, error } = await (supabase as any)
    .from('projects')
    .select('id, project_code, project_name')
    .eq('is_active', true)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Project lookup failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(
      'No active project found. Ask an admin to create/activate a project ' +
      `(signed in as ${session.user?.email ?? 'unknown'}).`,
    );
  }
  if (data.length > 1) {
    throw new Error(`Multiple active projects found (${data.length}). Please configure a default project.`);
  }
  return { id: data[0].id };
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
