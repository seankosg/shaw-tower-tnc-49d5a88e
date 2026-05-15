import { supabase } from '@/integrations/supabase/client';
import { applyBulkUpdate, type BulkUpdateRequest } from '@/lib/bulk-edit';

export type BulkEntity = 'subtest' | 'defect' | 'drawing' | 'punch';

export type EditableScope = 'none' | 'assigned' | 'team' | 'full';

export interface ScopeMapResult {
  /** Map of row id -> editable scope */
  byId: Record<string, EditableScope>;
  /** Convenience: ids the user can edit (assigned/team/full) */
  editableIds: string[];
  /** Convenience: ids the user cannot edit */
  skippedIds: string[];
}

/**
 * Resolve per-row edit scope using the existing get_*_edit_scope RPCs.
 * The RPCs are stable + security definer, so we can run them in parallel chunks.
 */
export async function getEditableScopeMap(
  entity: BulkEntity,
  ids: string[],
  userId: string,
): Promise<ScopeMapResult> {
  const out: ScopeMapResult = { byId: {}, editableIds: [], skippedIds: [] };
  if (!ids.length || !userId) return out;

  // Drawings + Punch: no per-row RPC. Resolve from role + team match against the source table.
  if (entity === 'drawing' || entity === 'punch') {
    const tableName = entity === 'drawing' ? 'docs_drawings' : 'punch_items';
    const [{ data: roleRows }, { data: profileRow }, { data: srcRows }] = await Promise.all([
      (supabase as any).from('user_roles').select('role').eq('user_id', userId),
      (supabase as any).from('profiles').select('team, is_active').eq('user_id', userId).maybeSingle(),
      (supabase as any).from(tableName).select('id, team').in('id', ids),
    ]);
    const roles = new Set<string>(((roleRows as any[]) ?? []).map((r) => r.role));
    const isAdminFull = roles.has('admin') || roles.has('superuser');
    const profileActive = (profileRow as any)?.is_active !== false;
    // Mirror UPDATE policy: admin/superuser/senior_user/user have full edit
    // on every row; d_superuser is restricted to own-team rows.
    const isFull = isAdminFull
      || (profileActive && (roles.has('senior_user') || roles.has('user')));
    const isDSuper = roles.has('d_superuser');
    const userTeam = (profileRow as any)?.team ?? null;
    const teamById = new Map<string, string | null>(
      ((srcRows as any[]) ?? []).map((r) => [r.id, r.team ?? null]),
    );
    for (const id of ids) {
      let scope: EditableScope = 'none';
      if (isFull) scope = 'full';
      else if (isDSuper && profileActive && userTeam && teamById.get(id) === userTeam) scope = 'team';
      out.byId[id] = scope;
      if (scope === 'none') out.skippedIds.push(id);
      else out.editableIds.push(id);
    }
    return out;
  }

  // Batched RPC: one round-trip per chunk of ids (vs. one per row previously).
  const fnName = entity === 'subtest' ? 'get_subtest_edit_scope_bulk' : 'get_defect_edit_scope_bulk';
  const CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await (supabase as any).rpc(fnName, { _user_id: userId, _ids: slice });
    const byId = new Map<string, EditableScope>();
    if (!error) {
      for (const row of (data as any[]) ?? []) {
        byId.set(row.id, (row.scope as EditableScope) ?? 'none');
      }
    }
    for (const id of slice) {
      const scope: EditableScope = byId.get(id) ?? 'none';
      out.byId[id] = scope;
      if (scope === 'none') out.skippedIds.push(id);
      else out.editableIds.push(id);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bulk reassign — wrapper over applyBulkUpdate for 1..N fields
// ---------------------------------------------------------------------------

export interface ReassignFieldChange {
  field: string;
  /** null => clear value */
  value: string | null;
}

export interface BulkReassignResult {
  attempted: number;
  succeeded: number;
  failed: number;
  perField: { field: string; succeeded: number; failed: number }[];
}

export async function applyBulkReassign(args: {
  entity: BulkEntity;
  ids: string[];
  changes: ReassignFieldChange[];
  userId: string;
}): Promise<BulkReassignResult> {
  const table: BulkUpdateRequest['table'] =
    args.entity === 'subtest' ? 'subtests'
      : args.entity === 'drawing' ? 'docs_drawings'
        : args.entity === 'punch' ? 'punch_items'
          : 'defect_items';
  const out: BulkReassignResult = { attempted: args.ids.length, succeeded: 0, failed: 0, perField: [] };
  for (const ch of args.changes) {
    const r = await applyBulkUpdate({
      table,
      ids: args.ids,
      field: ch.field,
      value: ch.value,
      userId: args.userId,
      changeSource: 'bulk_reassign',
    });
    out.perField.push({ field: ch.field, succeeded: r.succeeded, failed: r.failed });
  }
  // Aggregate (per-row success requires all fields ok; we keep field-level numbers in perField)
  out.succeeded = out.perField.length ? Math.min(...out.perField.map((p) => p.succeeded)) : 0;
  out.failed = out.perField.reduce((acc, p) => acc + p.failed, 0);
  return out;
}

// ---------------------------------------------------------------------------
// Bulk delete (soft / hard)
// ---------------------------------------------------------------------------

export interface CascadePreview {
  [key: string]: number;
}

export async function previewBulkDelete(entity: BulkEntity, ids: string[]): Promise<CascadePreview> {
  if (!ids.length) return {};
  if (entity === 'drawing') {
    // No cascade RPC — count related change_log entries client-side.
    const { count } = await (supabase as any)
      .from('docs_change_log')
      .select('id', { count: 'exact', head: true })
      .in('drawing_id', ids);
    return { drawings: ids.length, change_log: count ?? 0 };
  }
  if (entity === 'punch') {
    const { count } = await (supabase as any)
      .from('punch_change_log')
      .select('id', { count: 'exact', head: true })
      .in('punch_id', ids);
    return { punch_items: ids.length, change_log: count ?? 0 };
  }
  const fn = entity === 'subtest' ? 'preview_delete_subtests_cascade' : 'preview_delete_defects_cascade';
  const { data, error } = await (supabase as any).rpc(fn, { _ids: ids });
  if (error) throw error;
  return (data ?? {}) as CascadePreview;
}

export interface BulkDeleteResult {
  attempted: number;
  succeeded: number;
  failed: number;
  mode: 'soft' | 'hard';
}

export async function applyBulkDelete(args: {
  entity: BulkEntity;
  ids: string[];
  mode: 'soft' | 'hard';
  userId: string;
}): Promise<BulkDeleteResult> {
  const out: BulkDeleteResult = {
    attempted: args.ids.length,
    succeeded: 0,
    failed: 0,
    mode: args.mode,
  };
  if (!args.ids.length) return out;

  if (args.mode === 'soft') {
    // Soft delete = is_active = false via RLS-protected UPDATE.
    const table =
      args.entity === 'subtest' ? 'subtests'
        : args.entity === 'drawing' ? 'docs_drawings'
          : args.entity === 'punch' ? 'punch_items'
            : 'defect_items';
    const CHUNK = 200;
    let succeeded = 0;
    let failed = 0;
    for (let i = 0; i < args.ids.length; i += CHUNK) {
      const slice = args.ids.slice(i, i + CHUNK);
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await (supabase as any)
        .from(table)
        .update({ is_active: false, updated_by: args.userId })
        .in('id', slice)
        .select('id');
      if (error) { failed += slice.length; continue; }
      succeeded += (data ?? []).length;
      failed += slice.length - (data ?? []).length;
    }
    out.succeeded = succeeded;
    out.failed = failed;
    return out;
  }

  // Hard delete
  if (args.entity === 'drawing' || args.entity === 'punch') {
    // No cascade RPC — purge change_log first, then delete the rows.
    const tableName = args.entity === 'drawing' ? 'docs_drawings' : 'punch_items';
    const logTable = args.entity === 'drawing' ? 'docs_change_log' : 'punch_change_log';
    const logIdCol = args.entity === 'drawing' ? 'drawing_id' : 'punch_id';
    const CHUNK = 200;
    let succeeded = 0;
    let failed = 0;
    for (let i = 0; i < args.ids.length; i += CHUNK) {
      const slice = args.ids.slice(i, i + CHUNK);
      // eslint-disable-next-line no-await-in-loop
      await (supabase as any).from(logTable).delete().in(logIdCol, slice);
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await (supabase as any)
        .from(tableName)
        .delete()
        .in('id', slice)
        .select('id');
      if (error) { failed += slice.length; continue; }
      succeeded += (data ?? []).length;
      failed += slice.length - (data ?? []).length;
    }
    out.succeeded = succeeded;
    out.failed = failed;
    return out;
  }

  // Hard delete — admin/superuser only, enforced by RPC
  const fn = args.entity === 'subtest' ? 'delete_subtests_cascade' : 'delete_defects_cascade';
  const { data, error } = await (supabase as any).rpc(fn, { _ids: args.ids });
  if (error) {
    out.failed = args.ids.length;
    throw error;
  }
  out.succeeded = (data?.deleted as number) ?? 0;
  out.failed = args.ids.length - out.succeeded;
  return out;
}

// ---------------------------------------------------------------------------
// Bulk duplicate
// ---------------------------------------------------------------------------

export interface DuplicateOptions {
  resetActualDates: boolean;
  resetProgressStatus: boolean;
}

export interface BulkDuplicateResult {
  attempted: number;
  succeeded: number;
  failed: number;
}

const SUBTEST_RESET_ACTUALS = ['t1_actual_date', 't2_actual_date', 'pred_actual_date', 'r1_actual_submission_date', 'r2_actual_submission_date', 'r2_actual_approval_date'];
const SUBTEST_RESET_STATUS = ['t1_status', 't2_status', 'pred_status', 'r1_status', 'r2_status'];
const DEFECT_RESET_ACTUALS = ['actual_start_date', 'actual_completion_date', 'actual_closure_date'];
const DEFECT_RESET_STATUS = ['status', 'completion_status', 'closure_status', 'actual_progress_pct'];
const DRAWING_RESET_ACTUALS = [
  'submitted_date', 'approved_date',
  'sub1_submission_date', 'sub1_approval_date', 'sub1_actual_response_date',
  'sub2_submission_date', 'sub2_approval_date', 'sub2_actual_response_date',
  'sub3_submission_date', 'sub3_approval_date', 'sub3_actual_response_date',
];
const DRAWING_RESET_STATUS = [
  'current_status', 'aconex_status',
  'sub1_approval_status', 'sub2_approval_status', 'sub3_approval_status',
];
const PUNCH_RESET_ACTUALS = ['actual_start_date', 'actual_completion_date'];
const PUNCH_RESET_STATUS = ['completion_status', 'actual_progress_pct', 'health_status'];

export async function applyBulkDuplicate(args: {
  entity: BulkEntity;
  rows: any[];
  options: DuplicateOptions;
  userId: string;
}): Promise<BulkDuplicateResult> {
  const out: BulkDuplicateResult = { attempted: args.rows.length, succeeded: 0, failed: 0 };
  if (!args.rows.length) return out;

  if (args.entity === 'subtest') {
    // Need to compute next mos_sequence per (test_id, item_no, mos_code).
    // Fetch full source rows from subtests to ensure we copy *all* columns.
    const ids = args.rows.map((r) => r.id);
    const { data: src, error: srcErr } = await (supabase as any)
      .from('subtests')
      .select('*')
      .in('id', ids);
    if (srcErr) throw srcErr;

    // Determine next mos_sequence per group
    const groups = new Map<string, { test_id: string; item_no: string; mos_code: string }>();
    for (const row of src ?? []) {
      const key = `${row.test_id}::${row.item_no}::${row.mos_code}`;
      groups.set(key, { test_id: row.test_id, item_no: row.item_no, mos_code: row.mos_code });
    }
    const nextSeq = new Map<string, number>();
    for (const [key, g] of groups) {
      // eslint-disable-next-line no-await-in-loop
      const { data: maxRow } = await (supabase as any)
        .from('subtests')
        .select('mos_sequence')
        .eq('test_id', g.test_id)
        .eq('item_no', g.item_no)
        .eq('mos_code', g.mos_code)
        .order('mos_sequence', { ascending: false, nullsFirst: false })
        .limit(1);
      const max = maxRow?.[0]?.mos_sequence ?? 0;
      nextSeq.set(key, (max ?? 0) + 1);
    }

    const inserts: any[] = [];
    for (const row of src ?? []) {
      const key = `${row.test_id}::${row.item_no}::${row.mos_code}`;
      const seq = nextSeq.get(key)!;
      nextSeq.set(key, seq + 1);
      const copy: any = { ...row };
      delete copy.id;
      delete copy.created_at;
      delete copy.updated_at;
      delete copy.row_version;
      copy.mos_sequence = seq;
      copy.subtest_id = `${row.item_no}-${row.mos_code}-${seq}`;
      copy.updated_by = args.userId;
      copy.data_source_type = 'manual';
      copy.source_upload_id = null;
      if (args.options.resetActualDates) for (const f of SUBTEST_RESET_ACTUALS) copy[f] = null;
      if (args.options.resetProgressStatus) for (const f of SUBTEST_RESET_STATUS) copy[f] = null;
      copy.is_active = true;
      inserts.push(copy);
    }

    const { data: ins, error: insErr } = await (supabase as any)
      .from('subtests')
      .insert(inserts)
      .select('id');
    if (!insErr) {
      out.succeeded = (ins ?? []).length;
      out.failed = inserts.length - out.succeeded;
      return out;
    }
    // Batch insert failed — likely a per-project subtest_id collision. Retry one row at a time
    // and append a numeric suffix to subtest_id when 23505 occurs (per-project unique).
    let succeeded = 0;
    let failed = 0;
    for (const payload of inserts) {
      let attempt = 1;
      const baseId = String((payload as any).subtest_id ?? '');
      let lastErr: any = null;
      while (attempt <= 6) {
        const tryPayload = attempt === 1 ? payload : { ...payload, subtest_id: `${baseId}-${attempt}` };
        // eslint-disable-next-line no-await-in-loop
        const { error } = await (supabase as any).from('subtests').insert(tryPayload);
        if (!error) { succeeded++; lastErr = null; break; }
        lastErr = error;
        if (error.code !== '23505') break;
        attempt++;
      }
      if (lastErr) failed++;
    }
    out.succeeded = succeeded;
    out.failed = failed;
    return out;
  }

  if (args.entity === 'drawing') {
    // Drawing duplicate — append "-2", "-3", … to document_no on per-(project, sub_module) collision.
    const ids = args.rows.map((r) => r.id);
    const { data: src, error: srcErr } = await (supabase as any)
      .from('docs_drawings')
      .select('*')
      .in('id', ids);
    if (srcErr) throw srcErr;

    const inserts: any[] = [];
    for (const row of src ?? []) {
      const copy: any = { ...row };
      delete copy.id;
      delete copy.created_at;
      delete copy.updated_at;
      delete copy.row_version;
      copy.updated_by = args.userId;
      copy.data_source_type = 'manual';
      copy.source_upload_id = null;
      copy.is_active = true;
      if (args.options.resetActualDates) for (const f of DRAWING_RESET_ACTUALS) copy[f] = null;
      if (args.options.resetProgressStatus) {
        for (const f of DRAWING_RESET_STATUS) copy[f] = null;
        copy.is_submitted = false;
      }
      inserts.push(copy);
    }

    // Try batch insert first; on collision, retry per row with numeric suffix.
    const { data: ins, error: insErr } = await (supabase as any)
      .from('docs_drawings')
      .insert(inserts)
      .select('id');
    if (!insErr) {
      out.succeeded = (ins ?? []).length;
      out.failed = inserts.length - out.succeeded;
      return out;
    }
    let succeeded = 0;
    let failed = 0;
    for (const payload of inserts) {
      const baseDoc = String((payload as any).document_no ?? '');
      let attempt = 1;
      let lastErr: any = null;
      while (attempt <= 8) {
        const tryPayload = attempt === 1
          ? payload
          : { ...payload, document_no: `${baseDoc}-${attempt}` };
        // eslint-disable-next-line no-await-in-loop
        const { error } = await (supabase as any).from('docs_drawings').insert(tryPayload);
        if (!error) { succeeded++; lastErr = null; break; }
        lastErr = error;
        if (error.code !== '23505') break;
        attempt++;
      }
      if (lastErr) failed++;
    }
    out.succeeded = succeeded;
    out.failed = failed;
    return out;
  }

  if (args.entity === 'punch') {
    // Punch duplicate — increment item_no per project (numeric portion if possible).
    const ids = args.rows.map((r) => r.id);
    const { data: src, error: srcErr } = await (supabase as any)
      .from('punch_items')
      .select('*')
      .in('id', ids);
    if (srcErr) throw srcErr;

    const projectIds = Array.from(new Set((src ?? []).map((r: any) => r.project_id)));
    const maxByProject = new Map<string, number>();
    for (const pid of projectIds) {
      // eslint-disable-next-line no-await-in-loop
      const { data: rows } = await (supabase as any)
        .from('punch_items')
        .select('item_no')
        .eq('project_id', pid);
      let maxN = 0;
      for (const r of rows ?? []) {
        const m = String(r.item_no ?? '').match(/(\d+)/g);
        if (m) {
          const n = parseInt(m[m.length - 1], 10);
          if (!Number.isNaN(n) && n > maxN) maxN = n;
        }
      }
      maxByProject.set(pid as string, maxN);
    }

    const inserts: any[] = [];
    for (const row of src ?? []) {
      const cur = (maxByProject.get(row.project_id) ?? 0) + 1;
      maxByProject.set(row.project_id, cur);
      const m = String(row.item_no ?? '').match(/^(\D*)(\d+)(.*)$/);
      const newItemNo = m
        ? `${m[1]}${String(cur).padStart(m[2].length, '0')}${m[3] ?? ''}`
        : String(cur);
      const copy: any = { ...row };
      delete copy.id;
      delete copy.created_at;
      delete copy.updated_at;
      delete copy.row_version;
      copy.item_no = newItemNo;
      copy.updated_by = args.userId;
      copy.data_source_type = 'manual';
      copy.source_upload_id = null;
      copy.is_active = true;
      if (args.options.resetActualDates) for (const f of PUNCH_RESET_ACTUALS) copy[f] = null;
      if (args.options.resetProgressStatus) for (const f of PUNCH_RESET_STATUS) copy[f] = null;
      inserts.push(copy);
    }

    const { data: ins, error: insErr } = await (supabase as any)
      .from('punch_items')
      .insert(inserts)
      .select('id');
    if (insErr) throw insErr;
    out.succeeded = (ins ?? []).length;
    out.failed = inserts.length - out.succeeded;
    return out;
  }

  // Defect duplicate — increment issue_no per project (numeric portion if possible)
  const ids = args.rows.map((r) => r.id);
  const { data: src, error: srcErr } = await (supabase as any)
    .from('defect_items')
    .select('*')
    .in('id', ids);
  if (srcErr) throw srcErr;

  const projectIds = Array.from(new Set((src ?? []).map((r: any) => r.project_id)));
  const maxByProject = new Map<string, number>();
  for (const pid of projectIds) {
    // eslint-disable-next-line no-await-in-loop
    const { data: rows } = await (supabase as any)
      .from('defect_items')
      .select('issue_no')
      .eq('project_id', pid);
    let maxN = 0;
    for (const r of rows ?? []) {
      const m = String(r.issue_no ?? '').match(/(\d+)/g);
      if (m) {
        const n = parseInt(m[m.length - 1], 10);
        if (!Number.isNaN(n) && n > maxN) maxN = n;
      }
    }
    maxByProject.set(pid as string, maxN);
  }

  const inserts: any[] = [];
  for (const row of src ?? []) {
    const cur = (maxByProject.get(row.project_id) ?? 0) + 1;
    maxByProject.set(row.project_id, cur);
    // Preserve any prefix from original issue_no (e.g. "D-0001" -> "D-NNNN")
    const m = String(row.issue_no ?? '').match(/^(\D*)(\d+)(.*)$/);
    const newIssueNo = m
      ? `${m[1]}${String(cur).padStart(m[2].length, '0')}${m[3] ?? ''}`
      : String(cur);
    const copy: any = { ...row };
    delete copy.id;
    delete copy.created_at;
    delete copy.updated_at;
    delete copy.row_version;
    copy.issue_no = newIssueNo;
    copy.updated_by = args.userId;
    copy.data_source_type = 'manual';
    copy.source_upload_id = null;
    copy.is_active = true;
    if (args.options.resetActualDates) for (const f of DEFECT_RESET_ACTUALS) copy[f] = null;
    if (args.options.resetProgressStatus) for (const f of DEFECT_RESET_STATUS) copy[f] = null;
    inserts.push(copy);
  }

  const { data: ins, error: insErr } = await (supabase as any)
    .from('defect_items')
    .insert(inserts)
    .select('id');
  if (insErr) throw insErr;
  out.succeeded = (ins ?? []).length;
  out.failed = inserts.length - out.succeeded;
  return out;
}

// ---------------------------------------------------------------------------
// Export / Copy
// ---------------------------------------------------------------------------

export interface ExportColumn {
  /** Column id / field name */
  id: string;
  /** Header label */
  label: string;
  /** Optional value resolver — defaults to row[id] */
  accessor?: (row: any) => unknown;
}

function formatCell(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

export async function exportSelectedToXlsx(args: {
  rows: any[];
  columns: ExportColumn[];
  fileName: string;
}): Promise<void> {
  const XLSX = await import('xlsx');
  const aoa: unknown[][] = [];
  aoa.push(args.columns.map((c) => c.label));
  for (const row of args.rows) {
    aoa.push(args.columns.map((c) => formatCell(c.accessor ? c.accessor(row) : row[c.id])));
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Selected');
  XLSX.writeFile(wb, args.fileName);
}

export async function copyRowsAsTsv(args: { rows: any[]; columns: ExportColumn[] }): Promise<{ rowCount: number; colCount: number }> {
  const lines: string[] = [];
  lines.push(args.columns.map((c) => c.label).join('\t'));
  for (const row of args.rows) {
    lines.push(
      args.columns
        .map((c) => formatCell(c.accessor ? c.accessor(row) : row[c.id]).replace(/\t/g, ' ').replace(/\r?\n/g, ' '))
        .join('\t'),
    );
  }
  const text = lines.join('\n');
  await navigator.clipboard.writeText(text);
  return { rowCount: args.rows.length, colCount: args.columns.length };
}
