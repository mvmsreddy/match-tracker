import { useEffect } from 'react';

/**
 * useWakeLock — keeps the screen awake while the caller is mounted.
 *
 * Wraps the Screen Wake Lock API (Chrome/Edge/Safari 16.4+). Silently no-ops
 * where unsupported. Also re-requests the lock automatically when the tab
 * becomes visible again (the browser drops locks on hide).
 *
 * @param {boolean} active - when true, hold the wake lock. Flip to false to release.
 */
export function useWakeLock(active) {
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === 'undefined' || !navigator.wakeLock) return;

    let sentinel = null;
    let cancelled = false;

    const request = async () => {
      try {
        const s = await navigator.wakeLock.request('screen');
        if (cancelled) { s.release?.(); return; }
        sentinel = s;
        // If the browser drops it on visibility change, we'll re-request below
        sentinel.addEventListener?.('release', () => { sentinel = null; });
      } catch {
        /* user gesture required or permission denied — silently ignore */
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinel) request();
    };

    request();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      sentinel?.release?.().catch(() => {});
      sentinel = null;
    };
  }, [active]);
}
