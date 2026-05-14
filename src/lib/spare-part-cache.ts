// Module-scope cache for docs_spare_part rows (mirrors defect-cache pattern).
// Spare Part has no large text/JSON columns to defer, so a single slim load suffices.
// Realtime channel patches the cache on remote changes; components subscribe via useSparePartCache().
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { SparePartItem } from '@/lib/spare-part-utils';

export type CachedSparePart = SparePartItem & { created_at?: string | null };

const SELECT_ALL = '*';

interface CacheState {
  byId: Map<string, CachedSparePart>;
  list: CachedSparePart[];
  maxUpdatedAt: string | null;
  initialLoaded: boolean;
  loading: boolean;
  refreshing: boolean;
  channelBound: boolean;
}

const state: CacheState = {
  byId: new Map(),
  list: [],
  maxUpdatedAt: null,
  initialLoaded: false,
  loading: false,
  refreshing: false,
  channelBound: false,
};

type Listener = () => void;
const listeners = new Set<Listener>();
function emit() { for (const l of listeners) l(); }

function rebuildList() {
  const arr = Array.from(state.byId.values()).filter((r) => r.is_active !== false);
  arr.sort((a, b) => {
    const ca = String(a.category ?? '');
    const cb = String(b.category ?? '');
    if (ca !== cb) return ca.localeCompare(cb);
    return String(a.sn ?? '').localeCompare(String(b.sn ?? ''), undefined, { numeric: true });
  });
  state.list = arr;
}

function trackUpdated(rows: { updated_at?: string | null }[]) {
  for (const r of rows) {
    const u = r.updated_at ?? null;
    if (u && (!state.maxUpdatedAt || u > state.maxUpdatedAt)) state.maxUpdatedAt = u;
  }
}

function mergeRows(rows: any[]) {
  for (const r of rows) {
    if (!r?.id) continue;
    const existing = state.byId.get(r.id);
    state.byId.set(r.id, existing ? { ...existing, ...r } : (r as CachedSparePart));
  }
  trackUpdated(rows);
  rebuildList();
}

async function fetchAll() {
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await (supabase as any)
      .from('docs_spare_part')
      .select(SELECT_ALL)
      .eq('is_active', true)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as any[];
    if (rows.length === 0) break;
    mergeRows(rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
}

async function fetchIncremental() {
  if (!state.maxUpdatedAt) return;
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await (supabase as any)
      .from('docs_spare_part')
      .select(SELECT_ALL)
      .gt('updated_at', state.maxUpdatedAt)
      .order('updated_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as any[];
    if (rows.length === 0) break;
    for (const r of rows) if (!r.is_active) state.byId.delete(r.id);
    const active = rows.filter((r) => r.is_active);
    if (active.length) mergeRows(active);
    else { trackUpdated(rows); rebuildList(); }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
}

async function refetchMany(ids: string[]) {
  if (ids.length === 0) return;
  const chunkSize = 500;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await (supabase as any)
      .from('docs_spare_part')
      .select(SELECT_ALL)
      .in('id', chunk);
    if (error || !data) continue;
    const rows = data as any[];
    const seen = new Set<string>();
    for (const r of rows) {
      seen.add(r.id);
      if (!r.is_active) state.byId.delete(r.id);
    }
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
    .channel('spare-part-cache-items')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'docs_spare_part' }, (payload: any) => {
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
    })
    .subscribe();
}

export function patchSparePartCacheLocal(ids: string[], patch: Partial<CachedSparePart>) {
  let changed = false;
  for (const id of ids) {
    const row = state.byId.get(id);
    if (row) {
      state.byId.set(id, { ...row, ...patch });
      changed = true;
    }
  }
  if (changed) { rebuildList(); emit(); }
}

export function refreshSparePartCache() {
  if (state.refreshing || !state.initialLoaded) return;
  state.refreshing = true;
  emit();
  fetchIncremental().catch(() => undefined).finally(() => { state.refreshing = false; emit(); });
}

export function getSparePartCacheSnapshot() {
  return {
    items: state.list,
    initialLoaded: state.initialLoaded,
    loading: state.loading,
    refreshing: state.refreshing,
  };
}

export function subscribeSparePartCache(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function invalidateSparePartCache() {
  state.byId.clear();
  state.list = [];
  state.maxUpdatedAt = null;
  state.initialLoaded = false;
  emit();
}

export async function ensureSparePartCache() {
  bindRealtime();
  if (!state.initialLoaded) {
    if (state.loading) {
      await new Promise<void>((resolve) => {
        const off = subscribeSparePartCache(() => {
          if (state.initialLoaded) { off(); resolve(); }
        });
      });
    } else {
      state.loading = true; emit();
      try { await fetchAll(); state.initialLoaded = true; }
      finally { state.loading = false; emit(); }
    }
  } else if (!state.refreshing) {
    state.refreshing = true; emit();
    fetchIncremental().catch(() => undefined).finally(() => { state.refreshing = false; emit(); });
  }
}

export function useSparePartCache() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const off = subscribeSparePartCache(() => setTick((t) => t + 1));
    ensureSparePartCache().catch(() => undefined);
    return off;
  }, []);
  return getSparePartCacheSnapshot();
}
