/**
 * Suggestions while typing for the inline location fields (desktop): after a pause, from Photon via `suggestDACH`;
 * a newer keystroke cancels the older request, failures stay silent (Enter still runs the full Nominatim search).
 * Same behaviour as the full-screen sheet on phones (`LocationSearchSheet`).
 */
import { useEffect } from 'react';
import type { Location } from './types';
import { suggestDACH, nominatimToLocation } from './geocode';

export function useLocationSuggest(query: string, setResults: (l: Location[]) => void, enabled = true) {
  useEffect(() => {
    const q = query.trim();
    if (!enabled) return;
    if (q.length < 3) { setResults([]); return; }
    const ctl = new AbortController();
    const t = window.setTimeout(() => {
      suggestDACH(q, ctl.signal)
        .then(list => {
          if (ctl.signal.aborted) return;
          setResults(list.map(nominatimToLocation).filter((l): l is Location => l != null));
        })
        .catch(() => { /* silent — Enter remains */ });
    }, 300);
    return () => { window.clearTimeout(t); ctl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, enabled]);
}
