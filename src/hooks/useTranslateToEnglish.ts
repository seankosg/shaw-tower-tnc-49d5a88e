import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const KOREAN_REGEX = /[\u3131-\uD79D\uAC00-\uD7AF]/;

export function containsKorean(text: string | null | undefined): boolean {
  if (!text) return false;
  return KOREAN_REGEX.test(text);
}

interface TranslateState {
  loading: boolean;
  error: string | null;
}

export function useTranslateToEnglish() {
  const [state, setState] = useState<TranslateState>({ loading: false, error: null });
  const cacheRef = useRef<Map<string, string>>(new Map());

  const translate = useCallback(async (text: string): Promise<string | null> => {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const cached = cacheRef.current.get(trimmed);
    if (cached) return cached;

    setState({ loading: true, error: null });
    try {
      const { data, error } = await supabase.functions.invoke('translate-text', {
        body: { text: trimmed },
      });
      if (error) {
        // Try to extract a useful message from edge function error
        let msg = error.message || 'Translation failed';
        const ctx: any = (error as any).context;
        if (ctx?.body) {
          try {
            const parsed = typeof ctx.body === 'string' ? JSON.parse(ctx.body) : ctx.body;
            if (parsed?.error) msg = parsed.error;
          } catch { /* ignore */ }
        }
        setState({ loading: false, error: msg });
        return null;
      }
      const translated: string | undefined = data?.translated;
      if (!translated) {
        setState({ loading: false, error: 'Empty translation result' });
        return null;
      }
      cacheRef.current.set(trimmed, translated);
      setState({ loading: false, error: null });
      return translated;
    } catch (err: any) {
      setState({ loading: false, error: err?.message || 'Translation failed' });
      return null;
    }
  }, []);

  const reset = useCallback(() => setState({ loading: false, error: null }), []);

  return { translate, reset, loading: state.loading, error: state.error };
}
