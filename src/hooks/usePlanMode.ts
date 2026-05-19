import { useCallback, useEffect, useState } from 'react';

export type PlanMode = 'baseline' | 'remaining';

const STORAGE_KEY = 'defect:planMode';
const EVENT_NAME = 'defect-planmode-change';
const DEFAULT_MODE: PlanMode = 'remaining';

function readStored(): PlanMode {
  if (typeof window === 'undefined') return DEFAULT_MODE;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'baseline' || v === 'remaining') return v;
  } catch {}
  return DEFAULT_MODE;
}

/**
 * Cross-page synchronized plan mode toggle.
 * - Single source of truth in localStorage (key: `defect:planMode`)
 * - Same-tab pages stay in sync via a custom event ('defect-planmode-change')
 * - Cross-tab sync uses the native `storage` event
 */
export function usePlanMode(): [PlanMode, (next: PlanMode) => void] {
  const [mode, setMode] = useState<PlanMode>(() => readStored());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onCustom = () => setMode(readStored());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setMode(readStored());
    };
    window.addEventListener(EVENT_NAME, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const update = useCallback((next: PlanMode) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    setMode(next);
    try {
      window.dispatchEvent(new Event(EVENT_NAME));
    } catch {}
  }, []);

  return [mode, update];
}

export const PLAN_MODE_DEFAULT: PlanMode = DEFAULT_MODE;
