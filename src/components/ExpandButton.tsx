/**
 * Enlarge / shrink button for dossier maps and satellite pictures (Jan 2026-11-07): top right of the picture. The pictures in the
 * dossiers of Gletscher, Seewetter and Brandradar neither zoom nor pan in place (the page scrolls over them) — that starts
 * after this button is pressed. `useExpandedFrame` carries the Esc key and the scroll lock of the enlarged state.
 */
import { useEffect } from 'react';
import './expandButton.css';

export function ExpandButton({ expanded, onClick, label }: { expanded: boolean; onClick: () => void; label?: string }) {
  const text = label ?? (expanded ? 'Kleiner machen' : 'Vergrößern');
  return (
    <button type="button" className="ui-expand" onClick={(e) => { e.stopPropagation(); onClick(); }} onKeyDown={(e) => e.stopPropagation()} aria-label={text} title={text}>
      {expanded ? (
        /* corners pointing inward = make smaller */
        <svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="2,7 7,7 7,2" /><polyline points="16,7 11,7 11,2" /><polyline points="2,11 7,11 7,16" /><polyline points="16,11 11,11 11,16" />
        </svg>
      ) : (
        /* corners pointing outward = make larger */
        <svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="2,6 2,2 6,2" /><polyline points="16,6 16,2 12,2" /><polyline points="2,12 2,16 6,16" /><polyline points="16,12 16,16 12,16" />
        </svg>
      )}
    </button>
  );
}

/** While `active`: Esc calls `close`, and the page behind does not scroll. */
export function useExpandedFrame(active: boolean, close: () => void): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
