import { useEffect, useState } from 'react';

/**
 * Live device orientation + narrow-viewport detector.
 * - `isLandscape` — viewport width > height (media query).
 * - `isMobile`    — physical viewport height < 700px (a phone/tablet range).
 * Together they gate the "big-screen landscape mode" tracker view.
 */
export function useOrientation() {
  const readState = () => {
    if (typeof window === 'undefined') return { isLandscape: false, isMobile: false };
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Coarse pointer = touch device (phones, tablets). Combined with a strict
    // small-side threshold this reliably identifies a *phone* held sideways —
    // NOT a laptop in landscape (which would otherwise trigger this view and
    // hide the point-entry UI). Falls back to a very tight size threshold
    // (< 500px on the smallest side) when matchMedia is unavailable.
    const coarse = typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches;
    const smallSide = Math.min(w, h);
    return {
      isLandscape: w > h,
      isMobile: coarse ? smallSide < 560 : smallSide < 500,
    };
  };

  const [state, setState] = useState(readState);

  useEffect(() => {
    const onChange = () => setState(readState());
    window.addEventListener('resize', onChange);
    window.addEventListener('orientationchange', onChange);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('orientationchange', onChange);
    };
  }, []);

  return state;
}
