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
 * Always-visible fields (key/identity columns). These are never hidden by
 * the Field Config toggle to preserve data integrity & navigation.
 */
const ALWAYS_VISIBLE_FIELDS = new Set<string>([
  'system',
  'item_no',
  'subtest_id',
  'mos_code',
]);

/**
 * Fetches field_config and exposes helpers to determine whether a given
 * field should be visible in the UI (List columns, Detail form fields).
 */
export function useFieldConfig() {
  const [fields, setFields] = useState<FieldConfigRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('field_config')
        .select('field_name, display_name, is_enabled, is_required, sort_order');
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

  return { fields, loading, isFieldVisible, isFieldRequired };
}
