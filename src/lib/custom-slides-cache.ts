/**
 * In-memory cache of custom_slides rows. Used by both Slide Composer and
 * the PPT export flow.
 */
import { supabase } from '@/integrations/supabase/client';
import { SlideSpecSchema, type SlideSpec } from '@/lib/custom-slide-spec';

export interface CustomSlide {
  id: string;
  key: string;
  label: string;
  spec: SlideSpec;
  created_at?: string;
  updated_at?: string;
}

const TTL_MS = 5 * 60 * 1000;
let cache: { items: CustomSlide[]; at: number } | null = null;

export function invalidateCustomSlidesCache() { cache = null; }

export async function fetchCustomSlides(force = false): Promise<CustomSlide[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.items;
  const { data, error } = await supabase
    .from('custom_slides' as never)
    .select('id, key, label, spec, created_at, updated_at')
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('[custom-slides] fetch failed:', error.message);
    return cache?.items ?? [];
  }
  const items: CustomSlide[] = [];
  for (const row of (data ?? []) as Array<{ id: string; key: string; label: string; spec: unknown; created_at?: string; updated_at?: string }>) {
    const parsed = SlideSpecSchema.safeParse(row.spec);
    if (!parsed.success) {
      console.warn(`[custom-slides] spec invalid for ${row.key}:`, parsed.error.message);
      continue;
    }
    items.push({
      id: row.id, key: row.key, label: row.label, spec: parsed.data,
      created_at: row.created_at, updated_at: row.updated_at,
    });
  }
  cache = { items, at: Date.now() };
  return items;
}

export async function deleteCustomSlide(id: string): Promise<void> {
  const { error } = await supabase.from('custom_slides' as never).delete().eq('id', id);
  if (error) throw error;
  invalidateCustomSlidesCache();
}

export async function insertCustomSlide(params: {
  key: string; label: string; spec: SlideSpec;
}): Promise<CustomSlide> {
  const auth = await supabase.auth.getUser();
  const created_by = auth.data.user?.id ?? null;
  const row = {
    key: params.key,
    label: params.label,
    spec: params.spec as unknown,
    created_by,
  };
  const { data, error } = await supabase
    .from('custom_slides' as never)
    .insert(row as never)
    .select('id, key, label, spec, created_at, updated_at')
    .single();
  if (error) throw error;
  invalidateCustomSlidesCache();
  const r = data as { id: string; key: string; label: string; spec: unknown; created_at?: string; updated_at?: string };
  return {
    id: r.id, key: r.key, label: r.label, spec: SlideSpecSchema.parse(r.spec),
    created_at: r.created_at, updated_at: r.updated_at,
  };
}
