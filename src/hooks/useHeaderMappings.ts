import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { loadHeaderMappingsCache } from '@/lib/header-mappings-cache';

export type HeaderMappingModule = 'tnc' | 'defect' | 'docs';
export type DocsSubModule = 'as_built' | 'warranty' | 'omm' | 'spare_part';

export interface HeaderMappingRow {
  id: string;
  module: HeaderMappingModule;
  sub_module: string | null;
  header_alias: string;
  target_field: string;
  is_system: boolean;
  is_active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

const QK_LIST = ['import_header_mappings'] as const;
const QK_VERSION = ['app_settings', 'header_mappings_version'] as const;

export function useHeaderMappings() {
  return useQuery({
    queryKey: QK_LIST,
    queryFn: async (): Promise<HeaderMappingRow[]> => {
      const { data, error } = await supabase
        .from('import_header_mappings')
        .select('*')
        .order('module')
        .order('target_field')
        .order('header_alias');
      if (error) throw error;
      return (data ?? []) as HeaderMappingRow[];
    },
  });
}

/**
 * Polls header_mappings_version and refreshes the in-memory parser cache + the
 * React Query list whenever it changes.
 */
export function useHeaderMappingsSync() {
  const qc = useQueryClient();
  const { data: version } = useQuery({
    queryKey: QK_VERSION,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'header_mappings_version')
        .maybeSingle();
      if (error) throw error;
      return (data?.value as number | null) ?? 0;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    // Whenever version changes, force-refresh the parser cache + list query.
    loadHeaderMappingsCache(true).catch(() => {});
    qc.invalidateQueries({ queryKey: QK_LIST });
  }, [version, qc]);
}
