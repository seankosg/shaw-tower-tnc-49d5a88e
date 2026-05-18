import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/types/enums';
import { isAllowedByRoles } from '@/lib/field-role-gate';
import { PUNCH_FIELDS } from '@/lib/punch-field-registry';

export interface PunchFieldConfigRow {
  id: string;
  field_name: string;
  display_name: string;
  is_enabled: boolean;
  is_required: boolean;
  sort_order: number;
  original_header: string | null;
  source_origin: string;
  visible_to_roles: AppRole[] | null;
  editable_to_roles: AppRole[] | null;
}

/** Default labels derived from the punch field registry. */
export const PUNCH_DEFAULT_FIELD_LABELS: Record<string, string> = Object.fromEntries(
  PUNCH_FIELDS.map((f) => [f.field, f.exportLabel]),
);

/** System-required (registry-marked) fields — always required regardless of DB config. */
const REGISTRY_REQUIRED = new Set(PUNCH_FIELDS.filter((f) => f.required).map((f) => f.field));

export function usePunchFieldConfig() {
  const [fields, setFields] = useState<PunchFieldConfigRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await (supabase as any)
        .from('punch_field_config')
        .select('*')
        .order('sort_order', { ascending: true });
      if (!cancelled) {
        setFields((data ?? []) as PunchFieldConfigRow[]);
        setLoading(false);
      }
    };
    load();
    // Realtime: refetch whenever an admin edits punch_field_config.
    const channel = supabase
      .channel('punch-field-config-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'punch_field_config' }, () => {
        load();
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const fieldMap = useMemo(
    () => new Map(fields.map((field) => [field.field_name, field])),
    [fields],
  );

  const isFieldRequired = (fieldName: string): boolean =>
    REGISTRY_REQUIRED.has(fieldName) || (fieldMap.get(fieldName)?.is_required ?? false);

  const isFieldVisible = (fieldName: string, userRoles: AppRole[] = []) => {
    const field = fieldMap.get(fieldName);
    if (field && field.is_enabled === false) return false;
    return isAllowedByRoles(field?.visible_to_roles ?? null, userRoles);
  };

  const isFieldEditable = (fieldName: string, userRoles: AppRole[]) =>
    isAllowedByRoles(fieldMap.get(fieldName)?.editable_to_roles ?? null, userRoles);

  const getLabel = (fieldName: string) =>
    fieldMap.get(fieldName)?.display_name
    || PUNCH_DEFAULT_FIELD_LABELS[fieldName]
    || fieldName;

  const getOrder = (fieldName: string) => fieldMap.get(fieldName)?.sort_order ?? 9999;

  const sortFieldNames = (fieldNames: string[]) =>
    [...fieldNames].sort((a, b) => getOrder(a) - getOrder(b));

  const getOriginalHeader = (fieldName: string) =>
    fieldMap.get(fieldName)?.original_header ?? null;

  const getSourceOrigin = (fieldName: string): string =>
    fieldMap.get(fieldName)?.source_origin ?? 'system';

  return {
    fields,
    loading,
    isFieldRequired,
    isFieldVisible,
    isFieldEditable,
    getLabel,
    getOrder,
    sortFieldNames,
    getOriginalHeader,
    getSourceOrigin,
  };
}
