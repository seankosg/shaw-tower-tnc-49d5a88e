import { supabase } from '@/integrations/supabase/client';

/**
 * Fetch all rows from a Supabase table for a given upload_id, paging past the
 * default 1000-row limit. Used by Import Logs pages where a single batch can
 * produce thousands of row-log entries.
 */
export async function fetchAllByUploadId<T = any>(
  table: string,
  selectCols: string,
  uploadId: string,
  orderCol = 'raw_row_no',
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // safety cap to avoid runaway loops
  for (let i = 0; i < 100; i++) {
    const to = from + pageSize - 1;
    const { data, error } = await (supabase.from(table as any) as any)
      .select(selectCols)
      .eq('upload_id', uploadId)
      .order(orderCol, { ascending: true, nullsFirst: false })
      .range(from, to);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

/**
 * Generic paginated fetch. Pass a builder that returns a PostgREST query for the
 * given range. Loops until a short page is returned. Works around Supabase's
 * default 1000-row response cap.
 */
export async function fetchAllRows<T = any>(
  build: (from: number, to: number) => any,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (let i = 0; i < 100; i++) {
    const to = from + pageSize - 1;
    const { data, error } = await build(from, to);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
