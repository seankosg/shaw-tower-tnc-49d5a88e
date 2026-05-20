/**
 * useDdnAutoSave — debounced upsert of ddn_entries row.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { DdnInputs } from './schema-types';

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface Options {
  entryDate: string;
  inputs: DdnInputs;
  dayN: number | null;
  enabled: boolean;
  debounceMs?: number;
}

export function useDdnAutoSave({ entryDate, inputs, dayN, enabled, debounceMs = 5000 }: Options) {
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef<string>('');
  const dirty = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const serialized = JSON.stringify(inputs);
    if (serialized === last.current) return;
    last.current = serialized;
    dirty.current = true;
    setState('pending');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setState('saving');
      try {
        const { error: err } = await supabase
          .from('ddn_entries')
          .upsert(
            {
              entry_date: entryDate,
              inputs: inputs as never,
              day_n: dayN,
              status: 'draft',
            },
            { onConflict: 'entry_date' },
          );
        if (err) throw err;
        dirty.current = false;
        setState('saved');
        setError(null);
      } catch (e) {
        setState('error');
        setError(e instanceof Error ? e.message : 'Save failed');
      }
    }, debounceMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [entryDate, inputs, dayN, enabled, debounceMs]);

  return { state, error };
}
