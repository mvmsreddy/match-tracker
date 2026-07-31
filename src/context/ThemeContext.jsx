import { createContext, useContext, useEffect, useState } from 'react';
import { getSunTimes } from '../lib/weather';

const ThemeContext = createContext(null);

const PRE_DAWN = 30, PRE_DUSK = 45; // minutes of margin

// Migrates the old binary 'light'/'dark' values (and the already-retired
// 'midnight'/'navy' picker values) to the new 4-value preference. Anything
// unrecognized (including "never set") defaults to 'auto' rather than a
// fixed tier, since that's the new picker's primary mode.
function migratePreference(raw) {
  if (raw === 'day' || raw === 'night' || raw === 'glare' || raw === 'auto') return raw;
  if (raw === 'light') return 'day';
  if (raw === 'dark' || raw === 'midnight' || raw === 'navy') return 'night';
  return 'auto';
}

function resolveTier(pref, sun, now = new Date()) {
  if (pref !== 'auto') return pref;
  if (!sun) return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day';
  const t = now.getTime();
  const from = sun.sunrise + PRE_DAWN * 60000;
  const to = sun.sunset - PRE_DUSK * 60000;
  return t >= from && t < to ? 'day' : 'night';
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(() => migratePreference(localStorage.getItem('tt-theme')));
  const [sun, setSun] = useState(null);
  const [tier, setTier] = useState(() => resolveTier(preference, null));

  useEffect(() => {
    localStorage.setItem('tt-theme', preference);
  }, [preference]);

  // Only needed in 'auto' — resolveTier ignores `sun` for a fixed preference,
  // and fetching it anyway would cost every day/night/glare user a needless
  // geolocation prompt. Re-runs if the user switches into 'auto' later;
  // getSunTimes() has its own per-calendar-day cache, so this stays cheap
  // even though the tier-apply effect below re-runs every 5 minutes.
  useEffect(() => {
    if (preference !== 'auto') return;
    let cancelled = false;
    getSunTimes()
      .then((s) => { if (!cancelled) setSun(s); })
      .catch(() => { if (!cancelled) setSun(null); });
    return () => { cancelled = true; };
  }, [preference]);

  useEffect(() => {
    const apply = () => {
      const next = resolveTier(preference, sun);
      document.documentElement.dataset.tier = next;
      // Kept in sync for one release so anything still keyed on the old
      // .dark class (rather than [data-tier]) doesn't go unstyled.
      document.documentElement.classList.toggle('dark', next === 'night');
      setTier(next);
    };
    apply();
    const id = setInterval(apply, 5 * 60 * 1000); // catch dusk mid-match
    document.addEventListener('visibilitychange', apply); // and after a screen lock
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', apply); };
  }, [preference, sun]);

  // Legacy binary shim for components not yet migrated off useTheme()'s old
  // { theme, toggle } shape (TopNav, AppShell, MTNavChrome, TrackerPage,
  // MatchDetailPage, VideoAnalysisTestPage) — never 'navy', so the dormant
  // [data-theme="navy"] MTNavChrome branch in those pages stays dormant
  // until they're migrated to `tier`/`preference` directly.
  const theme = tier === 'night' ? 'dark' : 'light';
  const toggle = () => setPreference(resolveTier(preference, sun) === 'night' ? 'day' : 'night');

  return (
    <ThemeContext.Provider value={{ preference, setPreference, tier, sun, theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
