import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Save & restore the scroll position of the AppLayout <main> element across
 * in-app navigation (sessionStorage scoped per route).
 *
 * - Restores once when `ready` becomes true (e.g. after data loading completes).
 * - Saves continuously on scroll, and on unmount / route change.
 *
 * Uses sessionStorage so positions reset across browser sessions but persist
 * during navigation within the app.
 */
export function useMainScrollRestoration(ready: boolean) {
  const { pathname } = useLocation();
  const restoredRef = useRef(false);
  const keyRef = useRef(`dashboard-scroll:${pathname}`);

  // Reset restoration flag when pathname changes.
  useEffect(() => {
    keyRef.current = `dashboard-scroll:${pathname}`;
    restoredRef.current = false;
  }, [pathname]);

  // Restore once data is ready.
  useEffect(() => {
    if (!ready || restoredRef.current) return;
    if (typeof window === 'undefined') return;
    const main = document.querySelector('main');
    if (!main) return;
    try {
      const raw = sessionStorage.getItem(keyRef.current);
      if (raw) {
        const top = Number(raw);
        if (Number.isFinite(top) && top > 0) {
          // Defer to next frame so layout has painted.
          requestAnimationFrame(() => {
            main.scrollTop = top;
          });
        }
      }
    } catch {
      // ignore
    }
    restoredRef.current = true;
  }, [ready]);

  // Save scroll position on scroll + on unmount / route change.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const main = document.querySelector('main');
    if (!main) return;
    let raf = 0;
    const save = () => {
      try {
        sessionStorage.setItem(keyRef.current, String(main.scrollTop));
      } catch {
        // ignore quota errors
      }
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        save();
      });
    };
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      main.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
      save();
    };
  }, [pathname]);
}
