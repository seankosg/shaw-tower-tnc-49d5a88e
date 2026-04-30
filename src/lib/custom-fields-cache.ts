// Module-level synchronous cache for custom field definitions.
// Loaded once on app boot via loadCustomFieldsCache(); parsers read it sync.
import { supabase } from '@/integrations/supabase/client';

export type CustomFieldModule = 'tnc' | 'defect';
export type CustomFieldType = 'text' | 'number' | 'date' | 'boolean';

export interface CustomFieldDef {
  id: string;
  module: CustomFieldModule;
  field_name: string;
  display_name: string;
  data_type: CustomFieldType;
  is_active: boolean;
  sort_order: number;
}

const cache: Record<CustomFieldModule, Map<string, CustomFieldDef>> = {
  tnc: new Map(),
  defect: new Map(),
};

let loaded = false;
let inflight: Promise<void> | null = null;

export async function loadCustomFieldsCache(force = false): Promise<void> {
  if (loaded && !force) return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from('custom_field_definitions')
        .select('id, module, field_name, display_name, data_type, is_active, sort_order');
      if (error) {
        console.warn('[custom-fields] load failed:', error.message);
        return;
      }
      const next: Record<CustomFieldModule, Map<string, CustomFieldDef>> = {
        tnc: new Map(),
        defect: new Map(),
      };
      for (const r of (data ?? []) as CustomFieldDef[]) {
        if (r.module !== 'tnc' && r.module !== 'defect') continue;
        next[r.module].set(r.field_name, r);
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

export function getCustomField(mod: CustomFieldModule, fieldName: string): CustomFieldDef | undefined {
  return cache[mod].get(fieldName);
}

export function getActiveCustomFields(mod: CustomFieldModule): CustomFieldDef[] {
  return Array.from(cache[mod].values())
    .filter((f) => f.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.display_name.localeCompare(b.display_name));
}

export function isCustomFieldsCacheLoaded(): boolean {
  return loaded;
}

/** Returns true if a target_field string represents a custom field. */
export function isCustomTarget(target: string | null | undefined): boolean {
  return !!target && target.startsWith('custom:');
}

/** Extracts field_name from a "custom:xxx" target string. */
export function parseCustomTarget(target: string): string | null {
  if (!target.startsWith('custom:')) return null;
  const name = target.slice('custom:'.length);
  return name || null;
}

/**
 * Coerce a raw cell value into the declared custom field type.
 * Returns { ok, value, reason } — value is JSON-serializable on success.
 */
export function coerceCustomValue(
  type: CustomFieldType,
  raw: unknown,
): { ok: true; value: string | number | boolean | null } | { ok: false; reason: string } {
  if (raw == null || raw === '') return { ok: true, value: null };
  switch (type) {
    case 'text': {
      const s = String(raw).trim();
      return { ok: true, value: s === '' ? null : s };
    }
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(/,/g, ''));
      if (!Number.isFinite(n)) return { ok: false, reason: `not a number: "${raw}"` };
      return { ok: true, value: n };
    }
    case 'boolean': {
      const s = String(raw).trim().toLowerCase();
      if (['y', 'yes', 'true', '1', 't'].includes(s)) return { ok: true, value: true };
      if (['n', 'no', 'false', '0', 'f'].includes(s)) return { ok: true, value: false };
      return { ok: false, reason: `not a boolean: "${raw}"` };
    }
    case 'date': {
      // ISO YYYY-MM-DD only; callers can pre-normalize using their own date parser.
      const s = String(raw).trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return { ok: true, value: s.slice(0, 10) };
      const d = new Date(s);
      if (!isNaN(d.getTime())) return { ok: true, value: d.toISOString().slice(0, 10) };
      return { ok: false, reason: `not a date: "${raw}"` };
    }
  }
}
