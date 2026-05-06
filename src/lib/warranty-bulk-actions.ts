/**
 * Warranty-only bulk action helpers.
 *
 * Mirrors src/lib/omm-bulk-actions.ts but targets the `warranty_items` table.
 * RLS is the permission gate — failures per row surface in the result.
 */
import { supabase } from '@/integrations/supabase/client';

export const WARRANTY_BULK_MAX_ROWS = 500;

export interface WarrantyBulkResult {
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

export async function applyWarrantyBulkUpdate(args: {
  ids: string[];
  field: string;
  value: string | number | boolean | null;
  userId: string;
}): Promise<WarrantyBulkResult> {
  const out: WarrantyBulkResult = {
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
      .from('warranty_items')
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

export async function applyWarrantyBulkSoftDelete(args: {
  ids: string[];
  userId: string;
}): Promise<WarrantyBulkResult> {
  return applyWarrantyBulkUpdate({ ...args, field: 'is_active', value: false });
}
