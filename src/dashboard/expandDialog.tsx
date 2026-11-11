/**
 * "Groß anzeigen" for the map tile and the warnings tile of the dashboard's first row (Jan 11.11.): the same dialog shell
 * as the nowcast detail (`dbd-rose-overlay` / `dbd-rose-dialog`), Esc and a click beside it close, the page does not scroll.
 */
import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react';
import { WarningStrip } from './tiles';
import type { PlaceIn, WarningVM } from './model/types';

const MiniMap = lazy(() => import('./MiniMap'));

/** Zoom of the large map: about four times the area of the tile (zoom 9), still close enough for place temperatures. */
const BIG_MAP_ZOOM = 7.6;

export function ExpandIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

function ExpandDialog({ title, sub, wide, onClose, children }: { title: string; sub?: string; wide?: boolean; onClose: () => void; children: ReactNode }) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeBtn.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="dbd-rose-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`dbd-rose-dialog dbd-xp-dialog${wide ? ' is-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dbd-xp-title">
        <div className="dbd-rose-dlg-head">
          <div>
            <span className="dbd-eyebrow" id="dbd-xp-title">{title}</span>
            {sub && <span className="dbd-rose-range">{sub}</span>}
          </div>
          <button ref={closeBtn} type="button" className="dbd-rose-open" onClick={onClose} aria-label="Schließen" title="Schließen (Esc)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Larger map section around the place, movable and zoomable; same layers as the tile. */
export function MapDetail({ place, onClose }: { place: PlaceIn; onClose: () => void }) {
  return (
    <ExpandDialog title="KARTE · WIND, NIEDERSCHLAG, TEMPERATUR" sub={place.name} wide onClose={onClose}>
      <div className="dbd-minimap dbd-xp-map">
        <Suspense fallback={null}><MiniMap place={place} zoom={BIG_MAP_ZOOM} interactive /></Suspense>
      </div>
    </ExpandDialog>
  );
}

/** All warnings for the place at full length — verbatim as in the tile, nothing summarised. */
export function WarningsDetail({ vm, onClose }: { vm: WarningVM; onClose: () => void }) {
  const n = vm.state === 'active' ? (vm.items?.length ?? 1) : 0;
  return (
    <ExpandDialog title="AMTLICHE WARNUNGEN" sub={n > 1 ? `${n} Meldungen` : undefined} onClose={onClose}>
      <div className="dbd-xp-warn"><WarningStrip vm={vm} /></div>
    </ExpandDialog>
  );
}
