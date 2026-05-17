// Design tokens loader — fetches PPT color tokens from `design_tokens` table.
// Values are stored as 6-digit hex strings (without `#`) for pptxgenjs.

import { supabase } from '@/integrations/supabase/client';

export interface PptColorTokens {
  primary: string;
  accent: string;
  text: string;
  muted: string;
  bg_soft: string;
  danger: string;
  ok: string;
}

export const DEFAULT_PPT_COLORS: PptColorTokens = {
  primary: '1E2761',
  accent: '4F46E5',
  text: '1F2937',
  muted: '6B7280',
  bg_soft: 'F1F5F9',
  danger: 'DC2626',
  ok: '16A34A',
};

const KEY_MAP: Record<string, keyof PptColorTokens> = {
  'ppt.color.primary': 'primary',
  'ppt.color.accent': 'accent',
  'ppt.color.text': 'text',
  'ppt.color.muted': 'muted',
  'ppt.color.bg_soft': 'bg_soft',
  'ppt.color.danger': 'danger',
  'ppt.color.ok': 'ok',
};

const TOKEN_KEYS = Object.keys(KEY_MAP);

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { at: number; data: PptColorTokens } | null = null;

export function invalidatePptColorCache() {
  cache = null;
}

export async function fetchPptColorTokens(): Promise<PptColorTokens> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;

  const { data, error } = await supabase
    .from('design_tokens')
    .select('key, value')
    .in('key', TOKEN_KEYS);

  if (error) {
    console.error('[design-tokens] fetch failed, using defaults:', error);
    return { ...DEFAULT_PPT_COLORS };
  }

  const merged: PptColorTokens = { ...DEFAULT_PPT_COLORS };
  for (const row of data ?? []) {
    const field = KEY_MAP[row.key];
    if (field && typeof row.value === 'string') merged[field] = row.value;
  }
  cache = { at: Date.now(), data: merged };
  return merged;
}

export function colorKey(field: keyof PptColorTokens): string {
  return Object.entries(KEY_MAP).find(([, v]) => v === field)?.[0] ?? '';
}
