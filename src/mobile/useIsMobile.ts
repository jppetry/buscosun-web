import { useEffect, useState } from 'react';

/**
 * Phone layout: up to 767 px, and — Jan 15.11.2026 — on touch tablets (`pointer: coarse`) up to 1439 px, portrait and landscape.
 * A mouse device keeps the tablet/desktop layout from 768 px. The stylesheets carry the same clause on their width queries.
 */
export const MOBILE_BREAKPOINT_QUERY = '(max-width: 767px), (max-width: 1439px) and (pointer: coarse)';

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
