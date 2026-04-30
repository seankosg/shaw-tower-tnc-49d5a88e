// Module-level synchronous cache for import header mappings.
// Loaded once on app boot via loadHeaderMappingsCache(); parsers read it sync.
import { supabase } from '@/integrations/supabase/client';

export type MappingModule = 'tnc' | 'defect';

interface MappingRow {
  module: MappingModule;
  header_alias: string;
  target_field: string;
  is_active: boolean;
}

const cache: Record<MappingModule, Map<string, string>> = {
  tnc: new Map(),
  defect: new Map(),
};

let loaded = false;
let inflight: Promise<void> | null = null;

export async function loadHeaderMappingsCache(force = false): Promise<void> {
  if (loaded && !force) return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from('import_header_mappings')
        .select('module, header_alias, target_field, is_active');
      if (error) {
        // Leave cache empty; parsers will fall back to hardcoded maps.
        console.warn('[header-mappings] load failed, using hardcoded fallbacks:', error.message);
        return;
      }
      const next: Record<MappingModule, Map<string, string>> = {
        tnc: new Map(),
        defect: new Map(),
      };
      for (const r of (data ?? []) as MappingRow[]) {
        if (!r.is_active) continue;
        if (r.module !== 'tnc' && r.module !== 'defect') continue;
        next[r.module].set(r.header_alias, r.target_field);
      }
      cache.tnc = next.tnc;
      cache.defect = next.defect;
      loaded = true;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Synchronous lookup. Returns undefined if not found (caller falls back). */
export function getMappedField(mod: MappingModule, normalizedAlias: string): string | undefined {
  return cache[mod].get(normalizedAlias);
}

export function isHeaderMappingsCacheLoaded(): boolean {
  return loaded;
}

/** For Admin UI / debugging. */
export function getAllCachedMappings(mod: MappingModule): Array<[string, string]> {
  return Array.from(cache[mod].entries());
}
