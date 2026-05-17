import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_SLIDE_ORDER, SLIDE_REGISTRY, type SlideKey } from '@/lib/slide-registry';
import type { SlideConfigItem } from '@/lib/ppt-builder';
import { fetchCustomSlides } from '@/lib/custom-slides-cache';

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { items: SlideConfigItem[]; at: number } | null = null;

export function invalidateSlideConfigCache() {
  cache = null;
}

function defaultItems(): SlideConfigItem[] {
  return DEFAULT_SLIDE_ORDER.map((k) => ({ key: k, enabled: true }));
}

/** Normalise stored config against the current registry + custom slides:
 *  - drop keys that match neither a built-in nor a known custom slide
 *  - append any missing keys (enabled by default), custom slides last
 */
async function reconcile(stored: SlideConfigItem[]): Promise<SlideConfigItem[]> {
  const builtins = new Set(Object.keys(SLIDE_REGISTRY));
  let customKeys: string[] = [];
  try {
    customKeys = (await fetchCustomSlides()).map((c) => c.key);
  } catch {
    customKeys = [];
  }
  const known = new Set<string>([...builtins, ...customKeys]);
  const filtered = stored.filter((i) => known.has(i.key));
  const present = new Set(filtered.map((i) => i.key));
  const missingBuiltins = DEFAULT_SLIDE_ORDER
    .filter((k) => !present.has(k))
    .map((k) => ({ key: k, enabled: true }));
  const missingCustoms = customKeys
    .filter((k) => !present.has(k))
    .map((k) => ({ key: k, enabled: true }));
  return [...filtered, ...missingBuiltins, ...missingCustoms];
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
    const raw = (data?.slides ?? null) as unknown as SlideConfigItem[] | null;
    const base = raw && Array.isArray(raw) && raw.length > 0 ? raw : defaultItems();
    const items = await reconcile(base);
    cache = { items, at: Date.now() };
    return items;
  } catch {
    return defaultItems();
  }
}

export async function saveSlideConfig(items: SlideConfigItem[]): Promise<void> {
  const { data: existing } = await supabase
    .from('ppt_slide_config')
    .select('id')
    .limit(1)
    .maybeSingle();
  const auth = await supabase.auth.getUser();
  const updated_by = auth.data.user?.id ?? undefined;
  const slides = items as unknown as never;

  if (existing?.id) {
    const { error } = await supabase
      .from('ppt_slide_config')
      .update({ slides, updated_by } as never)
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('ppt_slide_config')
      .insert({ slides, updated_by } as never);
    if (error) throw error;
  }
  invalidateSlideConfigCache();
}

/** Append a new custom slide key to the stored config (enabled by default). */
export async function appendSlideKey(key: string): Promise<void> {
  const current = await fetchSlideConfig(true);
  if (current.some((i) => i.key === key)) return;
  await saveSlideConfig([...current, { key, enabled: true }]);
}

export type { SlideConfigItem };
export type { SlideKey };
