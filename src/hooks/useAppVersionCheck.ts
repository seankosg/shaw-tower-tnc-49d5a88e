import { useCallback, useEffect, useState } from 'react';

interface AppVersionResponse {
  buildId?: string;
  builtAt?: string;
}

const CHECK_INTERVAL_MS = 2 * 60 * 1000;

export function useAppVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch(`/app-version.json?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) return;

      const latest = (await res.json()) as AppVersionResponse;
      if (latest.buildId && latest.buildId !== __APP_BUILD_ID__) {
        setUpdateAvailable(true);
      }
    } catch {
      // Ignore transient network errors; the next interval or tab focus will retry.
    }
  }, []);

  useEffect(() => {
    checkVersion();

    const intervalId = window.setInterval(checkVersion, CHECK_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkVersion();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', checkVersion);
    window.addEventListener('app-version-mismatch', checkVersion);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', checkVersion);
      window.removeEventListener('app-version-mismatch', checkVersion);
    };
  }, [checkVersion]);

  return { updateAvailable, checkVersion };
}