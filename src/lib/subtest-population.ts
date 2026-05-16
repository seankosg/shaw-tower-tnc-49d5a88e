// Single source of truth for the "active subtests" statistics population.
//
// RULE (Option B, approved 2026-05-16): rows with `is_active = false` are
// soft-deleted (effectively removed) and MUST be excluded from every
// statistic, dashboard, simulation and report population. They are kept in
// the DB only because hard-delete caused integrity issues at import time.
//
// All new code that fetches subtests for counting / charting / forecasting
// MUST go through `fetchActiveSubtests` so the `is_active = true` filter
// cannot be forgotten. An ESLint rule (`no-restricted-syntax`) enforces this
// for new code; legacy import / detail / raw-data callers that intentionally
// need to see inactive rows are listed as exceptions.
//
// See: .lovable/plan.md ("T&C 데이터 정합 수정 — Option B + 재발 방지")

import { supabase } from '@/integrations/supabase/client';

export interface FetchActiveSubtestsOptions {
  /** Column projection. Defaults to '*'. */
  select?: string;
  /** Page size. Defaults to 1000 (Supabase default cap). */
  pageSize?: number;
  /** Optional order column. */
  orderBy?: string;
}

/**
 * Paginated fetch of all active subtests. Always applies `is_active = true`.
 * Returns rows typed as `T[]` — callers are responsible for the actual shape
 * matching their `select` projection.
 */
export async function fetchActiveSubtests<T = unknown>(
  options: FetchActiveSubtestsOptions = {},
): Promise<T[]> {
  const { select = '*', pageSize = 1000, orderBy } = options;
  const out: T[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = (supabase as any)
      .from('subtests')
      .select(select)
      .eq('is_active', true)
      .range(from, from + pageSize - 1);
    if (orderBy) q = q.order(orderBy);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}
