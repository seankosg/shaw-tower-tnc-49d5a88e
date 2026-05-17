import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_SLIDE_ORDER, SLIDE_REGISTRY, type SlideKey } from '@/lib/slide-registry';
import type { SlideConfigItem } from '@/lib/ppt-builder';

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { items: SlideConfigItem[]; at: number } | null = null;

export function invalidateSlideConfigCache() {
  cache = null;
}

function defaultItems(): SlideConfigItem[] {
  return DEFAULT_SLIDE_ORDER.map((k) => ({ key: k, enabled: true }));
}

/** Normalise stored config against the current registry:
 *  - drop keys we no longer know about
 *  - append any registry keys missing from the stored list (enabled by default)
 */
function reconcile(stored: SlideConfigItem[]): SlideConfigItem[] {
  const known = new Set(Object.keys(SLIDE_REGISTRY));
  const filtered = stored.filter((i) => known.has(i.key));
  const present = new Set(filtered.map((i) => i.key));
  const appended = DEFAULT_SLIDE_ORDER
    .filter((k) => !present.has(k))
    .map((k) => ({ key: k, enabled: true }));
  return [...filtered, ...appended];
}

export async function fetchSlideConfig(force = false): Promise<SlideConfigItem[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.items;
  try {
    const { data, error } = await supabase
      .from('ppt_slide_config')
      .select('slides')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const raw = (data?.slides as SlideConfigItem[] | null) ?? null;
    const items = raw && Array.isArray(raw) && raw.length > 0 ? reconcile(raw) : defaultItems();
    cache = { items, at: Date.now() };
    return items;
  } catch {
    return defaultItems();
  }
}

export async function saveSlideConfig(items: SlideConfigItem[]): Promise<void> {
  // single-row config; pick a stable id so upsert hits the same row
  const { data: existing } = await supabase
    .from('ppt_slide_config')
    .select('id')
    .limit(1)
    .maybeSingle();
  const auth = await supabase.auth.getUser();
  const updated_by = auth.data.user?.id ?? null;

  if (existing?.id) {
    const { error } = await supabase
      .from('ppt_slide_config')
      .update({ slides: items as unknown as object, updated_by })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('ppt_slide_config')
      .insert({ slides: items as unknown as object, updated_by });
    if (error) throw error;
  }
  invalidateSlideConfigCache();
}

export type { SlideConfigItem };
export type { SlideKey };
