import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { todayIso } from '@/lib/defect-utils';

/**
 * Returns the most recent `data_date` from completed defect upload batches.
 * This is the canonical "as-of" date used for ALL Defect overdue / delay calculations
 * across the app (Dashboard, Raw Data, Progress, Export).
 *
 * Falls back to today's date if no batch is found (e.g. fresh project).
 *
 * Note: `today` (real today) is only used for At-Risk (future imminent) calculations,
 * not for overdue judgments.
 */
export function useLatestDataDate(): { dataDate: string; isLoading: boolean; source: 'batch' | 'fallback' } {
  const { data, isLoading } = useQuery({
    queryKey: ['latest-defect-data-date'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('defect_upload_batches')
        .select('data_date')
        .eq('status', 'completed')
        .not('data_date', 'is', null)
        .order('data_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn('[useLatestDataDate] failed to read defect_upload_batches:', error.message);
        return null;
      }
      return (data?.data_date as string | undefined) ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  if (data) return { dataDate: data, isLoading, source: 'batch' };
  return { dataDate: todayIso(), isLoading, source: 'fallback' };
}
