import { supabase } from '@/integrations/supabase/client';
import type { TextOverrideMap } from '@/lib/text-token-registry';

const TTL_MS = 5 * 60 * 1000;
let cache: { at: number; data: TextOverrideMap } | null = null;

export function invalidateTextOverridesCache() {
  cache = null;
}

export async function fetchTextOverrides(force = false): Promise<TextOverrideMap> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) {
    return cache.data;
  }
  try {
    const { data, error } = await supabase
      .from('slide_text_overrides')
      .select('slide_key, field_key, value');
    if (error) throw error;
    const map: TextOverrideMap = {};
    for (const row of data ?? []) {
      const sk = (row as { slide_key: string }).slide_key;
      const fk = (row as { field_key: string }).field_key;
      const v  = (row as { value: string }).value;
      if (!map[sk]) map[sk] = {};
      map[sk][fk] = v;
    }
    cache = { at: Date.now(), data: map };
    return map;
  } catch {
    return {};
  }
}

export async function saveTextOverride(slideKey: string, fieldKey: string, value: string): Promise<void> {
  const auth = await supabase.auth.getUser();
  const uid = auth.data.user?.id ?? null;
  const { error } = await supabase
    .from('slide_text_overrides')
    .upsert(
      { slide_key: slideKey, field_key: fieldKey, value, updated_by: uid },
      { onConflict: 'slide_key,field_key' },
    );
  if (error) throw error;
  invalidateTextOverridesCache();
}

export async function deleteTextOverride(slideKey: string, fieldKey: string): Promise<void> {
  const { error } = await supabase
    .from('slide_text_overrides')
    .delete()
    .eq('slide_key', slideKey)
    .eq('field_key', fieldKey);
  if (error) throw error;
  invalidateTextOverridesCache();
}
