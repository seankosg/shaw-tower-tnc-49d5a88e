import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { loadCustomFieldsCache, type CustomFieldType } from '@/lib/custom-fields-cache';

export interface CustomFieldDefRow {
  id: string;
  module: 'tnc' | 'defect';
  field_name: string;
  display_name: string;
  data_type: CustomFieldType;
  is_active: boolean;
  sort_order: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

const QK_LIST = ['custom_field_definitions'] as const;
const QK_VERSION = ['app_settings', 'custom_fields_version'] as const;

export function useCustomFields() {
  return useQuery({
    queryKey: QK_LIST,
    queryFn: async (): Promise<CustomFieldDefRow[]> => {
      const { data, error } = await supabase
        .from('custom_field_definitions')
        .select('*')
        .order('module')
        .order('sort_order')
        .order('display_name');
      if (error) throw error;
      return (data ?? []) as CustomFieldDefRow[];
    },
  });
}

/** Polls custom_fields_version and refreshes the parser cache + list query when it changes. */
export function useCustomFieldsSync() {
  const qc = useQueryClient();
  const { data: version } = useQuery({
    queryKey: QK_VERSION,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'custom_fields_version')
        .maybeSingle();
      if (error) throw error;
      return (data?.value as number | null) ?? 0;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    loadCustomFieldsCache(true).catch(() => {});
    qc.invalidateQueries({ queryKey: QK_LIST });
  }, [version, qc]);
}
