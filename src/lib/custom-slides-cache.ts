/**
 * In-memory cache of custom_slides rows. Used by both Slide Composer and
 * the PPT export flow.
 *
 * Slides have a status: 'active' | 'draft'.
 *  - active  → shown in Composer / PPT Export (the cache returns these by default)
 *  - draft   → only visible inside the New Slide Generator until promoted
 */
import { supabase } from '@/integrations/supabase/client';
import { SlideSpecSchema, type SlideSpec } from '@/lib/custom-slide-spec';

export type CustomSlideStatus = 'active' | 'draft';

export interface CustomSlide {
  id: string;
  key: string;
  label: string;
  spec: SlideSpec;
  status: CustomSlideStatus;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

const TTL_MS = 5 * 60 * 1000;
// Cache only holds ACTIVE slides — the public list consumed by composer/export.
let cache: { items: CustomSlide[]; at: number } | null = null;

export function invalidateCustomSlidesCache() { cache = null; }

type Row = {
  id: string; key: string; label: string; spec: unknown;
  status?: string | null; created_by?: string | null;
  created_at?: string; updated_at?: string;
};

function parseRow(row: Row): CustomSlide | null {
  const parsed = SlideSpecSchema.safeParse(row.spec);
  if (!parsed.success) {
    console.warn(`[custom-slides] spec invalid for ${row.key}:`, parsed.error.message);
    return null;
  }
  const status: CustomSlideStatus = row.status === 'draft' ? 'draft' : 'active';
  return {
    id: row.id, key: row.key, label: row.label, spec: parsed.data,
    status, created_by: row.created_by ?? null,
    created_at: row.created_at, updated_at: row.updated_at,
  };
}

/** Default: returns ACTIVE slides only (cached). */
export async function fetchCustomSlides(force = false): Promise<CustomSlide[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.items;
  const { data, error } = await supabase
    .from('custom_slides' as never)
    .select('id, key, label, spec, status, created_by, created_at, updated_at')
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('[custom-slides] fetch failed:', error.message);
    return cache?.items ?? [];
  }
  const items: CustomSlide[] = [];
  for (const row of (data ?? []) as Row[]) {
    const p = parseRow(row);
    if (p) items.push(p);
  }
  cache = { items, at: Date.now() };
  return items;
}

/** Fetch drafts created by the current user. Not cached — list is small + interactive. */
export async function fetchMyDrafts(): Promise<CustomSlide[]> {
  const auth = await supabase.auth.getUser();
  const uid = auth.data.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from('custom_slides' as never)
    .select('id, key, label, spec, status, created_by, created_at, updated_at')
    .eq('status', 'draft')
    .eq('created_by', uid)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[custom-slides] fetch drafts failed:', error.message);
    return [];
  }
  const items: CustomSlide[] = [];
  for (const row of (data ?? []) as Row[]) {
    const p = parseRow(row);
    if (p) items.push(p);
  }
  return items;
}

export async function deleteCustomSlide(id: string): Promise<void> {
  const { error } = await supabase.from('custom_slides' as never).delete().eq('id', id);
  if (error) throw error;
  invalidateCustomSlidesCache();
}

export async function insertCustomSlide(params: {
  key: string; label: string; spec: SlideSpec;
  status?: CustomSlideStatus;
}): Promise<CustomSlide> {
  const auth = await supabase.auth.getUser();
  const created_by = auth.data.user?.id ?? null;
  const row = {
    key: params.key,
    label: params.label,
    spec: params.spec as unknown,
    status: params.status ?? 'active',
    created_by,
  };
  const { data, error } = await supabase
    .from('custom_slides' as never)
    .insert(row as never)
    .select('id, key, label, spec, status, created_by, created_at, updated_at')
    .single();
  if (error) throw error;
  if ((params.status ?? 'active') === 'active') invalidateCustomSlidesCache();
  const parsed = parseRow(data as Row);
  if (!parsed) throw new Error('Inserted slide failed spec validation');
  return parsed;
}

/** Flip a draft to active. Returns the updated row. */
export async function promoteDraftToActive(id: string): Promise<CustomSlide> {
  const { data, error } = await supabase
    .from('custom_slides' as never)
    .update({ status: 'active' } as never)
    .eq('id', id)
    .select('id, key, label, spec, status, created_by, created_at, updated_at')
    .single();
  if (error) throw error;
  invalidateCustomSlidesCache();
  const parsed = parseRow(data as Row);
  if (!parsed) throw new Error('Promoted slide failed spec validation');
  return parsed;
}
