// Module-level synchronous cache for import header mappings.
// Loaded once on app boot via loadHeaderMappingsCache(); parsers read it sync.
import { supabase } from '@/integrations/supabase/client';

export type MappingModule = 'tnc' | 'defect' | 'docs' | 'punch';
/** Sub-modules currently used (Docs umbrella). Empty string for tnc/defect. */
export type MappingSubModule = '' | 'as_built' | 'warranty' | 'omm' | 'spare_part';

interface MappingRow {
  module: string;
  sub_module: string | null;
  header_alias: string;
  target_field: string;
  is_active: boolean;
}

/** Composite key: `${module}::${sub_module ?? ''}` -> alias -> target_field */
const cache: Map<string, Map<string, string>> = new Map();

function keyOf(mod: MappingModule, sub: MappingSubModule | null | undefined): string {
  return `${mod}::${sub ?? ''}`;
}

let loaded = false;
let inflight: Promise<void> | null = null;

export async function loadHeaderMappingsCache(force = false): Promise<void> {
  if (loaded && !force) return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from('import_header_mappings')
        .select('module, sub_module, header_alias, target_field, is_active');
      if (error) {
        console.warn('[header-mappings] load failed, using hardcoded fallbacks:', error.message);
        return;
      }
      const next = new Map<string, Map<string, string>>();
      for (const r of (data ?? []) as MappingRow[]) {
        if (!r.is_active) continue;
        if (r.module !== 'tnc' && r.module !== 'defect' && r.module !== 'docs' && r.module !== 'punch') continue;
        const k = `${r.module}::${r.sub_module ?? ''}`;
        let bucket = next.get(k);
        if (!bucket) { bucket = new Map(); next.set(k, bucket); }
        bucket.set(r.header_alias, r.target_field);
      }
      cache.clear();
      for (const [k, v] of next.entries()) cache.set(k, v);
      loaded = true;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Synchronous lookup. Returns undefined if not found (caller falls back). */
export function getMappedField(
  mod: MappingModule,
  normalizedAlias: string,
  sub?: MappingSubModule | null,
): string | undefined {
  return cache.get(keyOf(mod, sub ?? ''))?.get(normalizedAlias);
}

export function isHeaderMappingsCacheLoaded(): boolean {
  return loaded;
}

/** For Admin UI / debugging. */
export function getAllCachedMappings(
  mod: MappingModule,
  sub?: MappingSubModule | null,
): Array<[string, string]> {
  return Array.from(cache.get(keyOf(mod, sub ?? ''))?.entries() ?? []);
}
