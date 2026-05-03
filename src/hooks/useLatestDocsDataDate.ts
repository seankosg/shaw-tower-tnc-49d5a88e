import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns the most recent `data_date` from completed Docs (As-Built) upload batches.
 * Mirrors useLatestDataDate / useLatestSubtestDataDate. Used as the reference "today"
 * for cycle delay calculations.
 */
export function useLatestDocsDataDate(subModule: string = 'as_built') {
  const [dataDate, setDataDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from('docs_upload_batches')
        .select('data_date')
        .eq('sub_module', subModule)
        .eq('status', 'completed')
        .not('data_date', 'is', null)
        .order('data_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setDataDate((data?.data_date as string | undefined) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [subModule]);

  return { dataDate, loading };
}
