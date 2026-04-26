import { useCallback, useEffect, useState } from 'react';

interface AppVersionResponse {
  buildId?: string;
  builtAt?: string;
}

export type VersionCheckResult =
  | { state: 'latest'; current: string; remote: string }
  | { state: 'update'; current: string; remote: string }
  | { state: 'error'; reason?: string };

const CHECK_INTERVAL_MS = 2 * 60 * 1000;

export function useAppVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const checkVersion = useCallback(async (): Promise<VersionCheckResult> => {
    const current = typeof __APP_BUILD_ID__ === 'string' ? __APP_BUILD_ID__ : '';
    try {
      const res = await fetch(`/app-version.json?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) {
        console.warn('[version-check] fetch failed', res.status, res.statusText);
        return { state: 'error', reason: `http_${res.status}` };
      }

      // Guard against SPA fallback returning HTML when app-version.json is missing
      // (e.g. dev mode, where the appVersionPlugin only emits during `vite build`).
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('json')) {
        console.warn('[version-check] non-JSON response (likely SPA fallback)', contentType);
        return { state: 'error', reason: 'non_json' };
      }

      let latest: AppVersionResponse;
      try {
        latest = (await res.json()) as AppVersionResponse;
      } catch (e) {
        console.warn('[version-check] JSON parse failed', e);
        return { state: 'error', reason: 'parse_failed' };
      }

      const remote = latest?.buildId;
      if (!remote || typeof remote !== 'string') {
        // Empty / missing buildId is NOT "latest" — it's a manifest problem.
        // Without this guard, an empty string would short-circuit the comparison
        // and silently report 'latest' even though the IDs differ.
        console.warn('[version-check] remote buildId missing/invalid', latest);
        return { state: 'error', reason: 'missing_remote_build_id' };
      }

      const match = current === remote;
      console.info('[version-check]', { current, remote, match });

      if (!match) {
        setUpdateAvailable(true);
        return { state: 'update', current, remote };
      }
      return { state: 'latest', current, remote };
    } catch (e) {
      // Ignore transient network errors; the next interval or tab focus will retry.
      console.warn('[version-check] network error', e);
      return { state: 'error', reason: 'network' };
    }
  }, []);

  useEffect(() => {
    void checkVersion();

    const intervalId = window.setInterval(() => { void checkVersion(); }, CHECK_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkVersion();
    };
    const handleEvent = () => { void checkVersion(); };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleEvent);
    window.addEventListener('app-version-mismatch', handleEvent);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleEvent);
      window.removeEventListener('app-version-mismatch', handleEvent);
    };
  }, [checkVersion]);

  return { updateAvailable, checkVersion };
}
