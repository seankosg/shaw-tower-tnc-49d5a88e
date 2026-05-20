import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DdnMappingRule } from './mapping-types';

export function useDdnMappingRules() {
  return useQuery({
    queryKey: ['ddn-mapping-rules'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ddn_mapping_rules')
        .select('*')
        .order('display_order');
      if (error) throw error;
      return (data ?? []) as unknown as DdnMappingRule[];
    },
  });
}
