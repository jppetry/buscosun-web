/**
 * Switch of the new route result view (phase TE, `audit/tour-ergebnis.md`). Rule 2: default off, named fallback.
 *   `?tourv=2` → new view, `?tourv=1` → old view, otherwise `TOUR_RESULT_V2`.
 * With the switch off the result is the old `resultBody` of `TourView.tsx`, unchanged.
 */
/** On since Jan 11.11. (phase TE). Fallback: `?tourv=1` = the old result. */
export const TOUR_RESULT_V2 = true;
export const TOUR_RESULT_QUERY_KEY = 'tourv';

/** Pure (no `window`) for the verifier. */
export function tourResultV2From(search: string, base: boolean = TOUR_RESULT_V2): boolean {
  let v: string | null = null;
  try { v = new URLSearchParams(search).get(TOUR_RESULT_QUERY_KEY); } catch { v = null; }
  if (v === '2') return true;
  if (v === '1') return false;
  return base;
}

export function tourResultV2On(): boolean {
  return tourResultV2From(typeof window !== 'undefined' ? window.location?.search ?? '' : '');
}
