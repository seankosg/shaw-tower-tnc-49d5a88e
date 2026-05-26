// Module-scope cache for defect_items.
// - Slim columns are loaded first for fast paint.
// - Heavy text/json columns (description, remarks, hdec_comments, aconex_comments,
//   raw_payload, custom_payload) are loaded in background and merged.
// - Single Realtime subscription patches the cache on remote changes.
// - Components subscribe via subscribeDefectCache() / useDefectCache().

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { DefectItem } from '@/lib/defect-utils';

export type CachedDefect = DefectItem & { created_at?: string | null };

// Heavy columns deferred from the initial fetch.
const HEAVY_COLUMNS = [
  'description',
  'remarks',
  'hdec_comments',
  'aconex_comments',
  'raw_payload',
  'custom_payload',
] as const;

// Slim select string: every column except the heavy ones.
// We rely on '*' minus heavy by enumerating the slim list explicitly.
const SLIM_COLUMNS = [
  'id',
  'project_id',
  'issue_no',
  'subcontractor_issue_no',
  'subcontractor_issue_source',
  'main_trade',
  'sub_trade',
  'trade_detail',
  'area_raw',
  'area_type',
  'area_level',
  'area_location',
  'defect_type',
  'status',
  'priority',
  'team',
  'subcontractor_name',
  'subsub_name',
  'hdec_pic_name',
  'hdec_eng_name',
  'captured_by_name',
  'planned_start_date',
  'planned_completion_date',
  'planned_closure_date',
  'actual_start_date',
  'actual_completion_date',
  'actual_closure_date',
  'planned_progress_pct',
  'actual_progress_pct',
  'completion_status',
  'closure_status',
  'hdec_verification',
  'hdec_reason',
  'work_type',
  'classification_source',
  'classified_at',
  'source_upload_id',
  'data_source_type',
  'is_active',
  'updated_by',
  'updated_at',
  'created_at',
  'row_version',
  'is_critical',
  'critical_marked_at',
  'critical_marked_by',
  'critical_marked_by_name',
] as const;

const SLIM_SELECT = SLIM_COLUMNS.join(', ');
const HEAVY_SELECT = `id, updated_at, ${HEAVY_COLUMNS.join(', ')}`;

interface CacheState {
  byId: Map<string, CachedDefect>;
  list: CachedDefect[];
  maxUpdatedAt: string | null;
  maxUpdatedId: string | null;
  heavyLoaded: boolean;
  initialLoaded: boolean;
  loading: boolean;
  refreshing: boolean;
  channelBound: boolean;
}

const state: CacheState = {
  byId: new Map(),
  list: [],
  maxUpdatedAt: null,
  maxUpdatedId: null,
  heavyLoaded: false,
  initialLoaded: false,
  loading: false,
  refreshing: false,
  channelBound: false,
};

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

function rebuildList() {
  // Stable ordering by issue_no asc (matches existing UI default).
  const arr = Array.from(state.byId.values()).filter((r) => r.is_active);
  arr.sort((a, b) => String(a.issue_no ?? '').localeCompare(String(b.issue_no ?? '')));
  state.list = arr;
}

function trackUpdated(rows: { updated_at?: string | null; id?: string | null }[]) {
  for (const r of rows) {
    const u = r.updated_at ?? null;
    if (!u) continue;
    if (!state.maxUpdatedAt || u > state.maxUpdatedAt) {
      state.maxUpdatedAt = u;
      state.maxUpdatedId = r.id ?? null;
    } else if (u === state.maxUpdatedAt && r.id && (!state.maxUpdatedId || r.id > state.maxUpdatedId)) {
      // Advance the tiebreaker so subsequent incremental fetches skip already-seen ties.
      state.maxUpdatedId = r.id;
    }
  }
}

function mergeRows(rows: any[]) {
  for (const r of rows) {
    if (!r?.id) continue;
    const existing = state.byId.get(r.id);
    if (existing) {
      state.byId.set(r.id, { ...existing, ...r });
    } else {
      state.byId.set(r.id, r as CachedDefect);
    }
  }
  trackUpdated(rows);
  rebuildList();
}

async function fetchSlimAll() {
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await (supabase as any)
      .from('defect_items')
      .select(SLIM_SELECT)
      .eq('is_active', true)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as any[];
    if (rows.length === 0) break;
    mergeRows(rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
}

async function fetchHeavyAll() {
  const ids = Array.from(state.byId.keys());
  const chunkSize = 500;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await (supabase as any)
      .from('defect_items')
      .select(HEAVY_SELECT)
      .in('id', chunk);
    if (error) throw error;
    mergeRows((data ?? []) as any[]);
    emit();
  }
  state.heavyLoaded = true;
  emit();
}

async function fetchIncremental() {
  if (!state.maxUpdatedAt) return;
  // Fetch rows changed since last seen (updated_at, id) — using gte + client-side
  // filtering of already-seen ties avoids OFFSET pagination dropping rows that
  // share the same updated_at timestamp (a common bulk-import pattern).
  const cols = state.heavyLoaded
    ? `${SLIM_SELECT}, ${HEAVY_COLUMNS.join(', ')}`
    : SLIM_SELECT;
  const pageSize = 1000;
  let from = 0;
  const cursorAt = state.maxUpdatedAt;
  const cursorId = state.maxUpdatedId;
  while (true) {
    const { data, error } = await (supabase as any)
      .from('defect_items')
      .select(cols)
      .gte('updated_at', cursorAt)
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rawRows = (data ?? []) as any[];
    if (rawRows.length === 0) break;

    // Filter out rows we've already processed (same updated_at and id <= cursor).
    const rows = rawRows.filter((r) => {
      if (!cursorId) return true;
      if (r.updated_at !== cursorAt) return true;
      return String(r.id) > cursorId;
    });

    // Drop deactivated rows.
    for (const r of rows) {
      if (!r.is_active) state.byId.delete(r.id);
    }
    const active = rows.filter((r) => r.is_active);
    if (active.length) mergeRows(active);
    else if (rows.length) {
      trackUpdated(rows);
      rebuildList();
    }
    if (rawRows.length < pageSize) break;
    from += pageSize;
  }
}

async function refetchMany(ids: string[]) {
  if (ids.length === 0) return;
  const cols = state.heavyLoaded
    ? `${SLIM_SELECT}, ${HEAVY_COLUMNS.join(', ')}`
    : SLIM_SELECT;
  const chunkSize = 500;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await (supabase as any)
      .from('defect_items')
      .select(cols)
      .in('id', chunk);
    if (error || !data) continue;
    const rows = data as any[];
    const seen = new Set<string>();
    for (const r of rows) {
      seen.add(r.id);
      if (!r.is_active) state.byId.delete(r.id);
    }
    // Any id we asked about but didn't get back means it was hard-deleted.
    for (const id of chunk) if (!seen.has(id)) state.byId.delete(id);
    const active = rows.filter((r) => r.is_active);
    if (active.length) mergeRows(active);
    else { trackUpdated(rows); rebuildList(); }
  }
  rebuildList();
  emit();
}

function bindRealtime() {
  if (state.channelBound) return;
  state.channelBound = true;
  const pending = new Set<string>();
  let flushHandle: number | undefined;
  const scheduleFlush = () => {
    if (flushHandle != null) return;
    flushHandle = window.setTimeout(() => {
      flushHandle = undefined;
      const ids = Array.from(pending);
      pending.clear();
      refetchMany(ids);
    }, 400);
  };

  supabase
    .channel('defect-cache-items')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'defect_items' },
      (payload: any) => {
        const id = (payload?.new?.id ?? payload?.old?.id) as string | undefined;
        if (!id) return;
        if (payload.eventType === 'DELETE') {
          state.byId.delete(id);
          rebuildList();
          emit();
          return;
        }
        pending.add(id);
        scheduleFlush();
      },
    )
    .subscribe();
}

/** Optimistic local patch: apply a partial change to N rows and emit. Realtime will reconcile. */
export function patchDefectCacheLocal(ids: string[], patch: Partial<CachedDefect>) {
  let changed = false;
  for (const id of ids) {
    const row = state.byId.get(id);
    if (row) {
      state.byId.set(id, { ...row, ...patch });
      changed = true;
    }
  }
  if (changed) {
    rebuildList();
    emit();
  }
}

/** Trigger an incremental refresh on demand (e.g., after a bulk write). */
export function refreshDefectCache() {
  if (state.refreshing || !state.initialLoaded) return;
  state.refreshing = true;
  emit();
  fetchIncremental()
    .catch(() => undefined)
    .finally(() => {
      state.refreshing = false;
      emit();
    });
}

export function getDefectCacheSnapshot() {
  return {
    items: state.list,
    initialLoaded: state.initialLoaded,
    heavyLoaded: state.heavyLoaded,
    loading: state.loading,
    refreshing: state.refreshing,
  };
}

export function subscribeDefectCache(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function invalidateDefectCache() {
  state.byId.clear();
  state.list = [];
  state.maxUpdatedAt = null;
  state.heavyLoaded = false;
  state.initialLoaded = false;
  emit();
}

/**
 * Stale-while-revalidate loader.
 * - First call: full slim load + background heavy load + bind realtime.
 * - Subsequent calls: returns cached data immediately and runs an incremental refresh.
 */
export async function ensureDefectCache(opts: { withHeavy?: boolean } = {}) {
  bindRealtime();
  if (!state.initialLoaded) {
    if (state.loading) {
      // Wait for in-flight load.
      await new Promise<void>((resolve) => {
        const off = subscribeDefectCache(() => {
          if (state.initialLoaded) {
            off();
            resolve();
          }
        });
      });
    } else {
      state.loading = true;
      emit();
      try {
        await fetchSlimAll();
        state.initialLoaded = true;
      } finally {
        state.loading = false;
        emit();
      }
      // Heavy load runs in background; do not await unless caller asks.
      if (opts.withHeavy && !state.heavyLoaded) {
        fetchHeavyAll().catch(() => undefined);
      } else {
        // Default: still kick off heavy in background so columns fill in.
        fetchHeavyAll().catch(() => undefined);
      }
    }
  } else {
    // Background refresh (incremental).
    if (!state.refreshing) {
      state.refreshing = true;
      emit();
      fetchIncremental()
        .catch(() => undefined)
        .finally(() => {
          state.refreshing = false;
          emit();
        });
    }
    if (opts.withHeavy && !state.heavyLoaded) {
      fetchHeavyAll().catch(() => undefined);
    }
  }
}

/** Wait until heavy columns are merged (used by Export). */
export async function ensureHeavyLoaded(): Promise<void> {
  await ensureDefectCache({ withHeavy: true });
  if (state.heavyLoaded) return;
  await new Promise<void>((resolve) => {
    const off = subscribeDefectCache(() => {
      if (state.heavyLoaded) {
        off();
        resolve();
      }
    });
  });
}

export function useDefectCache(opts: { withHeavy?: boolean } = {}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const off = subscribeDefectCache(() => setTick((t) => t + 1));
    ensureDefectCache(opts).catch(() => undefined);
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return getDefectCacheSnapshot();
}
