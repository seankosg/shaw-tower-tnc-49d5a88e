import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { todayIso } from '@/lib/defect-utils';

/**
 * Returns the most recent `data_date` from completed T&C (subtest) upload batches.
 * Used to enforce the "actual_* date cannot be later than Data Date" business rule
 * on the Subtest Detail page and Mobile Quick Update.
 *
 * Falls back to today's date if no batch is found.
 */
export function useLatestSubtestDataDate(): {
  dataDate: string;
  isLoading: boolean;
  source: 'batch' | 'fallback';
} {
  const { data, isLoading } = useQuery({
    queryKey: ['latest-subtest-data-date'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('upload_batches')
        .select('data_date')
        .eq('status', 'completed')
        .not('data_date', 'is', null)
        .order('data_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn('[useLatestSubtestDataDate] failed to read upload_batches:', error.message);
        return null;
      }
      return (data?.data_date as string | undefined) ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  if (data) return { dataDate: data, isLoading, source: 'batch' };
  return { dataDate: todayIso(), isLoading, source: 'fallback' };
}
