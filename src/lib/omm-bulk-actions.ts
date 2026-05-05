/**
 * OMM-only bulk action helpers.
 *
 * Self-contained: does NOT extend the shared bulk-edit / bulk-actions stack
 * (which is hardwired to defects + subtests + docs_drawings). All operations
 * go through plain Supabase calls and rely on the table's RLS policies as
 * the permission gate. Failures per row surface in the result.
 */
import { supabase } from '@/integrations/supabase/client';

export const OMM_BULK_MAX_ROWS = 500;

export interface OmmBulkResult {
  attempted: number;
  succeeded: number;
  failed: number;
  errors: { id: string; message: string }[];
}

const CHUNK = 100;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export async function applyOmmBulkUpdate(args: {
  ids: string[];
  field: string;
  value: string | number | boolean | null;
  userId: string;
}): Promise<OmmBulkResult> {
  const out: OmmBulkResult = {
    attempted: args.ids.length,
    succeeded: 0,
    failed: 0,
    errors: [],
  };
  if (!args.ids.length) return out;

  for (const slice of chunk(args.ids, CHUNK)) {
    const payload: Record<string, unknown> = {
      [args.field]: args.value,
      updated_by: args.userId,
    };
    const { data, error } = await (supabase as any)
      .from('docs_omm')
      .update(payload)
      .in('id', slice)
      .select('id');
    if (error) {
      out.failed += slice.length;
      slice.forEach((id) => out.errors.push({ id, message: error.message }));
      continue;
    }
    const updated = new Set<string>((data ?? []).map((r: any) => r.id));
    out.succeeded += updated.size;
    out.failed += slice.length - updated.size;
    slice
      .filter((id) => !updated.has(id))
      .forEach((id) =>
        out.errors.push({ id, message: 'Update blocked by permission policy' }),
      );
  }
  return out;
}

export async function applyOmmBulkSoftDelete(args: {
  ids: string[];
  userId: string;
}): Promise<OmmBulkResult> {
  return applyOmmBulkUpdate({ ...args, field: 'is_active', value: false });
}

export async function applyOmmBulkDuplicate(args: {
  rows: any[];
  resetActuals: boolean;
  resetResponses: boolean;
  userId: string;
}): Promise<OmmBulkResult> {
  const out: OmmBulkResult = {
    attempted: args.rows.length,
    succeeded: 0,
    failed: 0,
    errors: [],
  };
  if (!args.rows.length) return out;

  // Re-fetch full source rows so we copy ALL columns.
  const ids = args.rows.map((r) => r.id);
  const { data: src, error: srcErr } = await (supabase as any)
    .from('docs_omm')
    .select('*')
    .in('id', ids);
  if (srcErr) {
    out.failed = args.rows.length;
    args.rows.forEach((r) => out.errors.push({ id: r.id, message: srcErr.message }));
    return out;
  }

  const ACTUAL_DATES = [
    'draft_actual_date',
    'final_actual_date',
    'final_response_actual_date',
    'draft_response_date',
  ];
  const RESPONSES = ['draft_response_status', 'final_response_status'];

  const inserts: any[] = [];
  for (const row of (src ?? []) as any[]) {
    const copy: any = { ...row };
    delete copy.id;
    delete copy.created_at;
    delete copy.updated_at;
    delete copy.row_version;
    copy.parent_id = null;
    copy.is_resubmission = false;
    copy.resubmission_seq = 0;
    copy.is_active = true;
    copy.updated_by = args.userId;
    copy.data_source_type = 'manual';
    copy.source_upload_id = null;
    if (args.resetActuals) for (const f of ACTUAL_DATES) copy[f] = null;
    if (args.resetResponses) for (const f of RESPONSES) copy[f] = null;
    inserts.push(copy);
  }

  const { data: ins, error: insErr } = await (supabase as any)
    .from('docs_omm')
    .insert(inserts)
    .select('id');
  if (insErr) {
    out.failed = inserts.length;
    out.errors.push({ id: '(insert)', message: insErr.message });
    return out;
  }
  out.succeeded = (ins ?? []).length;
  out.failed = inserts.length - out.succeeded;
  return out;
}
