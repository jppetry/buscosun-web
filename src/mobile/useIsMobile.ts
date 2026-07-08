import { useEffect, useState } from 'react';

/** Session-wide breakpoint convention (see CLAUDE.md): mobile <= 767px, tablet 768–1024px, desktop > 1024px. */
export const MOBILE_BREAKPOINT_QUERY = '(max-width: 767px)';

function readMatch(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
}

/** Tracks a `max-width` media query live; defaults to the project's mobile breakpoint (767px). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => readMatch(query));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_BREAKPOINT_QUERY);
}
