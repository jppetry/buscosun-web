/**
 * Full-screen search page for phone / tablet over a LOCAL list (Seewetter spots, motorways, measuring points): the same page
 * as `LocationSearchSheet` (opened with `useSearchSheet` on the field's focus), but nothing is geocoded — the caller owns the
 * query and passes the rows it already filters for its inline list.
 */
import { lazy, Suspense, useEffect, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import './locationSearchSheet.css';

const DachMapBackground = lazy(() => import('../DachMapBackground'));
/** Rows shown at once; a longer list asks for a narrower search instead of rendering hundreds of buttons. */
const MAX_ROWS = 80;

export interface ListSearchRow { id: string; name: string; sub?: string; lead?: ReactNode }

export function ListSearchSheet({ label, placeholder, query, onQuery, rows, empty, onPick, onClose, inputRef, accent, accentDark }: {
  /** Accessible name of the page and its field, e.g. „Spot suchen". */
  label: string;
  placeholder: string;
  query: string;
  onQuery: (q: string) => void;
  rows: readonly ListSearchRow[];
  /** Line shown when no row matches. */
  empty: string;
  onPick: (id: string) => void;
  onClose: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  accent: string;
  accentDark?: string;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onEsc); };
  }, [onClose]);

  const more = rows.length - MAX_ROWS;
  return createPortal(
    <div className="lss" role="dialog" aria-label={label}
      style={{ '--lss-accent': accent, '--lss-accent-dark': accentDark ?? accent } as CSSProperties}>
      <Suspense fallback={null}><DachMapBackground /></Suspense>
      <div className="lss-head">
        <button type="button" className="lss-x" onClick={onClose} aria-label="Suche schließen">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
            <line x1="4" y1="4" x2="14" y2="14" /><line x1="14" y1="4" x2="4" y2="14" />
          </svg>
        </button>
        <div className="lss-search is-list" role="search">
          <svg className="lss-icon" width="19" height="19" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <circle cx="8" cy="8" r="6" /><line x1="13" y1="13" x2="17" y2="17" strokeLinecap="round" />
          </svg>
          <input ref={inputRef} type="search" className="lss-input" placeholder={placeholder} value={query}
            onChange={(e) => onQuery(e.target.value)} aria-label={label} autoComplete="off" enterKeyHint="search" />
        </div>
      </div>
      <div className="lss-list" role="listbox">
        {!rows.length && <div className="lss-note">{empty}</div>}
        {rows.slice(0, MAX_ROWS).map((r) => (
          <button key={r.id} type="button" className="lss-result is-list" onClick={() => onPick(r.id)}>
            {r.lead != null && <span className="lss-lead" aria-hidden="true">{r.lead}</span>}
            <span className="lss-body">
              <span className="lss-name">{r.name}</span>
              {r.sub && <span className="lss-sub">{r.sub}</span>}
            </span>
          </button>
        ))}
        {more > 0 && <div className="lss-note">{more} weitere Treffer — Suche verfeinern.</div>}
      </div>
    </div>,
    document.body,
  );
}
