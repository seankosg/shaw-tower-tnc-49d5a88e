import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface FieldConfigRow {
  field_name: string;
  display_name: string;
  is_enabled: boolean;
  is_required: boolean;
  sort_order: number;
}

/**
 * Minimal protection: only `subtest_id` is always visible so each row remains
 * identifiable/clickable. All other fields (including key columns like
 * system/item_no/mos_code) can be freely hidden via Field Config — the
 * underlying data is always saved regardless of visibility.
 */
const ALWAYS_VISIBLE_FIELDS = new Set<string>([
  'subtest_id',
]);

/**
 * Fetches field_config and exposes helpers to determine whether a given
 * field should be visible in the UI (List columns, Detail form fields)
 * and the configured display order.
 */
export function useFieldConfig() {
  const [fields, setFields] = useState<FieldConfigRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('field_config')
        .select('field_name, display_name, is_enabled, is_required, sort_order')
        .order('sort_order', { ascending: true });
      if (!cancelled && data) setFields(data as FieldConfigRow[]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enabledMap = new Map<string, boolean>();
  for (const f of fields) enabledMap.set(f.field_name, f.is_enabled);

  const isFieldVisible = (fieldName: string): boolean => {
    if (ALWAYS_VISIBLE_FIELDS.has(fieldName)) return true;
    // Default to visible if no config row exists yet (avoid hiding everything
    // before data loads or for newly added fields).
    if (!enabledMap.has(fieldName)) return true;
    return enabledMap.get(fieldName) === true;
  };

  const isFieldRequired = (fieldName: string): boolean => {
    const row = fields.find((f) => f.field_name === fieldName);
    return row?.is_required ?? false;
  };

  // Field names ordered by sort_order ascending (already sorted from DB).
  const orderedFieldNames: string[] = fields.map((f) => f.field_name);

  return { fields, loading, isFieldVisible, isFieldRequired, orderedFieldNames };
}
