// Single-row soft delete for Docs tables.
// Mirrors the bulk-actions soft-delete contract: sets is_active=false +
// updated_by, leaving an audit trail in defect_change_log / docs_change_log
// where applicable. Reactivation happens automatically on re-import (the
// import workers re-set is_active=true when matching the same key).

import { supabase } from '@/integrations/supabase/client';

export type DocsSoftDeleteTable =
  | 'docs_drawings'
  | 'docs_omm'
  | 'docs_spare_part'
  | 'warranty_items';

export interface SoftDeleteResult {
  ok: boolean;
  error?: string;
}

export async function softDeleteDocsRow(
  table: DocsSoftDeleteTable,
  id: string,
  userId: string | null,
): Promise<SoftDeleteResult> {
  const payload: Record<string, unknown> = {
    is_active: false,
    updated_by: userId ?? null,
  };
  const { error } = await (supabase as any).from(table).update(payload).eq('id', id);
  if (error) {
    const friendly = /row-level security|policy|permission/i.test(error.message)
      ? 'You do not have permission to delete this record.'
      : error.message;
    return { ok: false, error: friendly };
  }
  return { ok: true };
}
