// Design tokens loader — fetches PPT color tokens from `design_tokens` table.
// Values are stored as 6-digit hex strings (without `#`) for pptxgenjs.
// Token names mirror design_guide_v4.yaml.

import { supabase } from '@/integrations/supabase/client';

export interface PptColorTokens {
  // Surfaces
  bgBody: string;
  cardBody: string;
  cardBorder: string;
  cardAlert: string;
  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  // Status
  green: string;
  magentaBright: string;
  // Stage accents
  stagePreTest: string;
  stageOfficial: string;
  stageTestReport: string;
  // Misc accents
  cyan: string;
  amber: string;
}

export const DEFAULT_PPT_COLORS: PptColorTokens = {
  bgBody: '0A1A40',
  cardBody: '152C5E',
  cardBorder: '1E3A7A',
  cardAlert: '3D1828',
  textPrimary: 'FFFFFF',
  textSecondary: 'CADCFC',
  textMuted: '8B9BB8',
  green: 'A3E635',
  magentaBright: 'EC4899',
  stagePreTest: '22D3EE',
  stageOfficial: 'A78BFA',
  stageTestReport: 'F472B6',
  cyan: '67E8F9',
  amber: 'FCD34D',
};

const KEY_MAP: Record<string, keyof PptColorTokens> = {
  'ppt.color.bgBody': 'bgBody',
  'ppt.color.cardBody': 'cardBody',
  'ppt.color.cardBorder': 'cardBorder',
  'ppt.color.cardAlert': 'cardAlert',
  'ppt.color.textPrimary': 'textPrimary',
  'ppt.color.textSecondary': 'textSecondary',
  'ppt.color.textMuted': 'textMuted',
  'ppt.color.green': 'green',
  'ppt.color.magentaBright': 'magentaBright',
  'ppt.color.stagePreTest': 'stagePreTest',
  'ppt.color.stageOfficial': 'stageOfficial',
  'ppt.color.stageTestReport': 'stageTestReport',
  'ppt.color.cyan': 'cyan',
  'ppt.color.amber': 'amber',
};

const TOKEN_KEYS = Object.keys(KEY_MAP);

const FIELD_TO_DBKEY = Object.fromEntries(
  Object.entries(KEY_MAP).map(([k, v]) => [v, k]),
) as Record<keyof PptColorTokens, string>;

export function dbKeyForField(field: keyof PptColorTokens): string {
  return FIELD_TO_DBKEY[field];
}

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
