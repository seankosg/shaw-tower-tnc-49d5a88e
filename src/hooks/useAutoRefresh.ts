import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseAutoRefreshOptions {
  /** Unique prefix for localStorage keys (e.g. "tnc", "defect", "docs", "punch"). */
  storageKey: string;
  /** Default interval in ms (used if nothing in localStorage). Default 30s. */
  defaultIntervalMs?: number;
  /** Called on each tick. Should re-fetch data WITHOUT setting a full-page loading flag. */
  onRefresh: () => Promise<void> | void;
}

export interface UseAutoRefreshResult {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  intervalMs: number;
  setIntervalMs: (ms: number) => void;
  lastUpdatedAt: Date | null;
  isRefreshing: boolean;
  refreshNow: () => Promise<void>;
}

const DEFAULT_INTERVAL_MS = 30_000;

function lsKey(prefix: string, suffix: string) {
  return `dashboard.autoRefresh.${prefix}.${suffix}`;
}

function readEnabled(prefix: string): boolean {
  try {
    return localStorage.getItem(lsKey(prefix, 'enabled')) === '1';
  } catch {
    return false;
  }
}

function readInterval(prefix: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(lsKey(prefix, 'intervalMs'));
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 5_000 ? n : fallback;
  } catch {
    return fallback;
  }
}

export function useAutoRefresh(opts: UseAutoRefreshOptions): UseAutoRefreshResult {
  const { storageKey, defaultIntervalMs = DEFAULT_INTERVAL_MS, onRefresh } = opts;

  const [enabled, setEnabledState] = useState<boolean>(() => readEnabled(storageKey));
  const [intervalMs, setIntervalMsState] = useState<number>(() => readInterval(storageKey, defaultIntervalMs));
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Keep latest onRefresh in a ref so interval doesn't reset on each render.
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  const inFlightRef = useRef(false);

  const refreshNow = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsRefreshing(true);
    try {
      await onRefreshRef.current();
      setLastUpdatedAt(new Date());
    } catch (e) {
      // Swallow; caller is responsible for surfacing if needed.
      console.warn('[auto-refresh] tick failed', e);
    } finally {
      inFlightRef.current = false;
      setIsRefreshing(false);
    }
  }, []);

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    try { localStorage.setItem(lsKey(storageKey, 'enabled'), v ? '1' : '0'); } catch { }
  }, [storageKey]);

  const setIntervalMs = useCallback((ms: number) => {
    setIntervalMsState(ms);
    try { localStorage.setItem(lsKey(storageKey, 'intervalMs'), String(ms)); } catch { }
  }, [storageKey]);

  // Interval + visibility handling
  useEffect(() => {
    if (!enabled) return;

    let timerId: number | undefined;
    const start = () => {
      if (timerId !== undefined) return;
      timerId = window.setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        void refreshNow();
      }, intervalMs);
    };
    const stop = () => {
      if (timerId !== undefined) {
        window.clearInterval(timerId);
        timerId = undefined;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Fire one immediate refresh on re-focus, then continue ticking.
        void refreshNow();
      }
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, intervalMs, refreshNow]);

  return { enabled, setEnabled, intervalMs, setIntervalMs, lastUpdatedAt, isRefreshing, refreshNow };
}
