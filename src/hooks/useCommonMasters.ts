import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type MasterOption = { value: string; label: string };

export const TEAM_OPTIONS: MasterOption[] = [
  { value: 'Mech', label: 'Mech' },
  { value: 'Elec', label: 'Elec' },
  { value: 'Arch', label: 'Arch' },
  { value: 'Supp', label: 'Supp' },
  { value: 'Design', label: 'Design' },
];

interface CommonMasters {
  teamOptions: MasterOption[];
  subcontractorOptions: MasterOption[];
  hdecPicOptions: MasterOption[];
  hdecEngOptions: MasterOption[];
  loading: boolean;
  refresh: () => void;
}

type CacheShape = Omit<CommonMasters, 'loading' | 'refresh'> & { ts: number };

let cache: CacheShape | null = null;
let inflight: Promise<CacheShape> | null = null;
const TTL_MS = 60_000;

async function fetchAll(): Promise<CacheShape> {
  if (inflight) return inflight;
  inflight = (async () => {
    const [subRes, picRes, engRes] = await Promise.all([
      (supabase as any)
        .from('subcontractor_master')
        .select('name, type, is_active')
        .eq('is_active', true),
      (supabase as any)
        .from('hdec_pic_master')
        .select('name')
        .eq('is_active', true)
        .order('name', { ascending: true }),
      (supabase as any)
        .from('profiles')
        .select('name')
        .eq('is_active', true)
        .order('name', { ascending: true }),
    ]);

    const dedupSorted = (rows: any[] | null | undefined) => {
      const seen = new Set<string>();
      const out: MasterOption[] = [];
      for (const r of rows ?? []) {
        const n = (r?.name ?? '').toString().trim();
        if (!n || seen.has(n)) continue;
        seen.add(n);
        out.push({ value: n, label: n });
      }
      out.sort((a, b) => a.label.localeCompare(b.label));
      return out;
    };

    const subRows = (subRes?.data ?? []).filter(
      (r: any) => r?.type === 'sub' || r?.type === 'subsub',
    );

    const next: CacheShape = {
      teamOptions: TEAM_OPTIONS,
      subcontractorOptions: dedupSorted(subRows),
      hdecPicOptions: dedupSorted(picRes?.data),
      hdecEngOptions: dedupSorted(engRes?.data),
      ts: Date.now(),
    };
    cache = next;
    return next;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/**
 * Loads project-wide master option lists used by multiple raw-data pages
 * (Team, Subcontractor, HDEC PIC, HDEC ENG). Sources of truth:
 *  - team       → team_type enum (hardcoded)
 *  - subcontractor_name → public.subcontractor_master (active sub/subsub)
 *  - hdec_pic_name → public.hdec_pic_master (active)
 *  - hdec_eng_name → public.profiles (active)
 *
 * 60-second module-level cache prevents duplicate fetches when navigating
 * between OMM and Warranty pages within the same session.
 */
export function useCommonMasters(): CommonMasters {
  const [state, setState] = useState<CacheShape | null>(() => {
    if (cache && Date.now() - cache.ts < TTL_MS) return cache;
    return null;
  });
  const [loading, setLoading] = useState<boolean>(!state);

  const load = useCallback(async (force = false) => {
    if (!force && cache && Date.now() - cache.ts < TTL_MS) {
      setState(cache);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await fetchAll();
      setState(next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  return {
    teamOptions: state?.teamOptions ?? TEAM_OPTIONS,
    subcontractorOptions: state?.subcontractorOptions ?? [],
    hdecPicOptions: state?.hdecPicOptions ?? [],
    hdecEngOptions: state?.hdecEngOptions ?? [],
    loading,
    refresh: () => {
      cache = null;
      load(true);
    },
  };
}

/**
 * Merge master options with values that already exist in current rows.
 * Master values come first; legacy values present in data but missing from
 * master are appended with a " (legacy)" suffix so the user can still
 * filter/bulk-edit without losing visibility.
 */
export function unionWithLegacy(
  master: MasterOption[],
  presentValues: Iterable<string | null | undefined>,
): MasterOption[] {
  const masterSet = new Set(master.map((o) => o.value));
  const legacy: MasterOption[] = [];
  const seen = new Set<string>();
  for (const raw of presentValues) {
    const v = (raw ?? '').toString().trim();
    if (!v || masterSet.has(v) || seen.has(v)) continue;
    seen.add(v);
    legacy.push({ value: v, label: `${v} (legacy)` });
  }
  legacy.sort((a, b) => a.label.localeCompare(b.label));
  return [...master, ...legacy];
}
