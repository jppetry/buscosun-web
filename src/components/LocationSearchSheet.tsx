/**
 * Full-screen location search page for phone / tablet (Jan 04.11.): tapping a location field opens it instead of the inline
 * dropdown — big input (16 px, so iOS does not zoom), the DACH map behind it, suggestions while typing (Photon), Enter still
 * runs the full Nominatim search. Shared by the Regenradar, Vertikalschnitt and Historie fields; `accent` sets the button colour.
 */
import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from 'react';
import { createPortal, flushSync } from 'react-dom';
import type { Location } from '../types';
import { geocodeDACH, suggestDACH, nominatimToLocation, flagForCountry } from '../geocode';
import './locationSearchSheet.css';

// Same DACH map as on the start page (own chunk, loaded when the page opens).
const DachMapBackground = lazy(() => import('../DachMapBackground'));
const SHEET_QUERY = '(max-width: 1024px), (pointer: coarse)';

/** State + opener for a field: `openSheet` goes on the input's onFocus; it only acts on phone / tablet. */
export function useSearchSheet() {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const openSheet = () => {
    if (open || !window.matchMedia(SHEET_QUERY).matches) return;
    flushSync(() => setOpen(true));       // mount synchronously so the focus below still counts as the tap (iOS keyboard)
    inputRef.current?.focus();
  };
  return { open, openSheet, close: () => setOpen(false), inputRef };
}

export function LocationSearchSheet({ onPick, onClose, inputRef, placeholder, accent, accentDark }: {
  onPick: (l: Location) => void;
  onClose: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  placeholder: string;
  /** Colour of the close and search buttons (any CSS colour). */
  accent: string;
  accentDark?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onEsc); abortRef.current?.abort(); };
  }, [onClose]);

  // Suggestions while typing: after a pause, from Photon; a newer keystroke cancels the older request. Failures stay silent.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) { setResults([]); return; }
    const ctl = new AbortController();
    const t = window.setTimeout(() => {
      suggestDACH(q, ctl.signal)
        .then(list => {
          if (ctl.signal.aborted) return;
          setError(null);
          setResults(list.map(nominatimToLocation).filter((l): l is Location => l != null));
        })
        .catch(() => { /* silent — Enter remains */ });
    }, 300);
    return () => { window.clearTimeout(t); ctl.abort(); };
  }, [query]);

  async function search() {
    const q = query.trim();
    if (!q) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true); setError(null); setResults([]);
    try {
      const found = await geocodeDACH(q, ac.signal);
      if (ac.signal.aborted) return;
      if (found.length === 0) setError('Keine Ergebnisse in DE / AT / CH gefunden.');
      else if (found.length === 1) onPick(found[0]);
      else setResults(found);
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div className="lss" role="dialog" aria-label="Ort suchen"
      style={{ '--lss-accent': accent, '--lss-accent-dark': accentDark ?? accent } as CSSProperties}>
      <Suspense fallback={null}><DachMapBackground /></Suspense>
      <div className="lss-head">
        <button type="button" className="lss-x" onClick={onClose} aria-label="Suche schließen">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
            <line x1="4" y1="4" x2="14" y2="14" /><line x1="14" y1="4" x2="4" y2="14" />
          </svg>
        </button>
        <form className="lss-search" role="search" onSubmit={(e: FormEvent) => { e.preventDefault(); void search(); }}>
          <svg className="lss-icon" width="19" height="19" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <circle cx="8" cy="8" r="6" /><line x1="13" y1="13" x2="17" y2="17" strokeLinecap="round" />
          </svg>
          <input ref={inputRef} type="text" className="lss-input" placeholder={placeholder} value={query}
            onChange={(e) => setQuery(e.target.value)} aria-label="Ort suchen" autoComplete="off" />
          <button type="submit" className="lss-go" disabled={loading || !query.trim()}>{loading ? 'Suche …' : 'Suchen'}</button>
        </form>
      </div>
      {(results.length > 0 || error) && (
        <div className="lss-list" role="listbox">
          {error && <div className="lss-error">⚠ {error}</div>}
          {results.map((r, i) => (
            <button key={`${r.lat},${r.lon}-${i}`} type="button" className="lss-result" onClick={() => onPick(r)}>
              <span className="lss-flag" aria-hidden="true">{flagForCountry(r.country)}</span>
              <span className="lss-name">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
