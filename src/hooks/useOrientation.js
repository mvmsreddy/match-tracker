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
    return {
      isLandscape: w > h,
      isMobile: Math.min(w, h) < 900, // covers phone + small tablet in landscape
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
