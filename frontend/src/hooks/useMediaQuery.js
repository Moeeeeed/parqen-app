import { useState, useEffect } from 'react';

/**
 * useMediaQuery — tiny SSR-safe media query hook.
 *
 * Returns true when the given CSS media query currently matches.
 * Used by Dashboard to render the NoOnes-style two-column layout
 * on desktop (>=1280px) while keeping the existing mobile layout.
 */
export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    // Safari < 14 lacks addEventListener on MediaQueryList
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
    setMatches(mql.matches);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, [query]);

  return matches;
}
