import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import './mapGestureHint.css';

/** Ein Punkt, den der Hinweis über den Schleier heben darf (Leuchtpunkt). */
export interface HintSpot {
  lng: number;
  lat: number;
  /** Etikett vor „· Klicken für Details" — bei Brandradar der Name des Brands. */
  name: string;
  /** Klick auf den Leuchtpunkt: der Hinweis schließt, dann öffnet der Aufrufer die Detailkarte. */
  onPick: () => void;
}

interface Props {
  /** MapLibre-Instanz der Punktkarte; solange `null`, bleibt der Hinweis unsichtbar. */
  map: MapLibreMap | null;
  /** Schlüssel je Feature: `localStorage` `bs.hint.zoom.<feature>`. */
  feature: string;
  /** Akzentfarbe des Features. */
  accent?: string;
  /** Aus, solange die Karte nicht sichtbar ist (z. B. Dossier oder anderer mobiler Reiter). */
  enabled?: boolean;
  /** Kandidaten für den Leuchtpunkt, stärkster zuerst. Der erste, der außerhalb des Textblocks liegt, gewinnt. */
  pickSpots?: () => HintSpot[];
  /** Bei jedem Besuch zeigen (kein `localStorage`-Vermerk); nach dem Schließen nur bis zum Verlassen der Seite still. */
  always?: boolean;
}

const storageKey = (feature: string) => `bs.hint.zoom.${feature}`;
const seen = (feature: string): boolean => {
  try { return localStorage.getItem(storageKey(feature)) === '1'; } catch { return false; }
};
const markSeen = (feature: string) => {
  try { localStorage.setItem(storageKey(feature), '1'); } catch { /* privater Modus: Hinweis kommt dann wieder */ }
};

/** Was zum Textblock gehört, darf der Leuchtpunkt nicht überdecken (Rand um den Block, px). */
const SPOT_CLEARANCE = 28;
/** Breite des Etiketts neben dem Punkt, grob nach Textlänge — für die Kollisionsprüfung. */
const spotLabelW = (name: string) => 170 + name.length * 7.5;

/**
 * „Gesten-Bühne": einmaliger Hinweis je Feature auf einer Punktkarte. Dunkler Schleier über der
 * Kartenfläche, die Karte darunter atmet per CSS-Transform (kein echter Zoom), in der Mitte steht,
 * wie man zoomt (Mausrad bzw. zwei Finger) und dass die Punkte klickbar sind. Schließt bei Klick,
 * Mausrad, Pinch, erstem echtem Zoom oder Klick auf den Leuchtpunkt — und kommt dann nie wieder.
 */
export default function MapGestureHint({ map, feature, accent = '#B5651D', enabled = true, pickSpots, always = false }: Props) {
  const [open, setOpen] = useState(false);
  const dismissed = useRef(false);
  const [spot, setSpot] = useState<{ x: number; y: number; dx: number; dy: number; flip: boolean; s: HintSpot } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  const close = useCallback(() => {
    if (always) dismissed.current = true; else markSeen(feature);
    setOpen(false);
  }, [feature, always]);

  // Einblenden: erst wenn die Karte ruht, und nur beim ersten Besuch.
  useEffect(() => {
    if (!map || !enabled || (always ? dismissed.current : seen(feature))) return;
    let cancelled = false;
    const show = () => { if (!cancelled) setOpen(true); };
    if (map.loaded() && !map.isMoving()) {
      const id = requestAnimationFrame(show);
      return () => { cancelled = true; cancelAnimationFrame(id); };
    }
    map.once('idle', show);
    return () => { cancelled = true; map.off('idle', show); };
  }, [map, enabled, feature, always]);

  // Der Hinweis gehört nur zur sichtbaren Karte: wird sie versteckt, verschwindet er ohne Vermerk.
  useEffect(() => { if (!enabled) setOpen(false); }, [enabled]);

  // Erster echter Zoom (mit Nutzer-Ereignis) schließt sofort.
  useEffect(() => {
    if (!map || !open) return;
    const onZoomStart = (e: { originalEvent?: unknown }) => { if (e.originalEvent) close(); };
    map.on('zoomstart', onZoomStart);
    return () => { map.off('zoomstart', onZoomStart); };
  }, [map, open, close]);

  // Die Karte atmet im Takt der Geste — CSS-Transform auf dem Canvas-Container, ohne Map-Zoom.
  useEffect(() => {
    if (!map || !open) return;
    const el = map.getCanvasContainer();
    el.classList.add('bs-hint-breathe');
    return () => { el.classList.remove('bs-hint-breathe'); };
  }, [map, open]);

  // Leuchtpunkt: der erste Kandidat, der im Ausschnitt liegt und den Textblock nicht berührt.
  const placeSpot = useCallback(() => {
    const root = rootRef.current;
    const text = textRef.current;
    if (!map || !root || !text || !pickSpots) { setSpot(null); return; }
    const box = root.getBoundingClientRect();
    const tb = text.getBoundingClientRect();
    const block = {
      l: tb.left - box.left - SPOT_CLEARANCE, r: tb.right - box.left + SPOT_CLEARANCE,
      t: tb.top - box.top - SPOT_CLEARANCE, b: tb.bottom - box.top + SPOT_CLEARANCE,
    };
    const edge = 56;
    for (const s of pickSpots()) {
      const p = map.project([s.lng, s.lat]);
      if (p.x < edge || p.y < edge + 40 || p.x > box.width - edge || p.y > box.height - 150) continue;
      // Etikett steht rechts vom Punkt; passt es nicht mehr in die Karte, klappt es nach links.
      const labelW = spotLabelW(s.name);
      const flip = p.x + labelW > box.width - 12;
      const lab = flip ? { l: p.x - labelW, r: p.x + 12 } : { l: p.x - 12, r: p.x + labelW };
      const hit = lab.r > block.l && lab.l < block.r && p.y + 20 > block.t && p.y - 20 < block.b;
      if (!hit) { setSpot({ x: p.x, y: p.y, dx: p.x - box.width / 2, dy: p.y - box.height / 2, flip, s }); return; }
    }
    setSpot(null);
  }, [map, pickSpots]);

  useLayoutEffect(() => {
    if (!open) { setSpot(null); return; }
    placeSpot();
  }, [open, placeSpot]);

  useEffect(() => {
    if (!map || !open) return;
    map.on('resize', placeSpot);
    return () => { map.off('resize', placeSpot); };
  }, [map, open, placeSpot]);

  if (!open) return null;

  return (
    <div
      ref={rootRef}
      className={`bs-hint${touch ? ' is-touch' : ' is-mouse'}`}
      style={{ ['--bs-hint-accent' as string]: accent }}
    >
      <button
        type="button"
        className="bs-hint-veil"
        aria-label="Hinweis schließen"
        onClick={close}
        onWheel={close}
        onTouchStart={(e) => { if (e.touches.length > 1) close(); }}
      />
      <div className="bs-hint-content" ref={textRef}>
        <div className="bs-hint-art" aria-hidden="true">
          {touch ? (
            <svg viewBox="0 0 136 136" className="bs-hint-fingers">
              <defs>
                <marker id="bs-hint-arr" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0 0 L8 4 L0 8 Z" fill="rgba(250,246,234,0.45)" />
                </marker>
              </defs>
              <line x1="30" y1="106" x2="106" y2="30" stroke="rgba(250,246,234,0.45)" strokeWidth="2" strokeDasharray="5 5" markerStart="url(#bs-hint-arr)" markerEnd="url(#bs-hint-arr)" />
            </svg>
          ) : null}
          {touch ? (
            <>
              <span className="bs-hint-finger is-a" />
              <span className="bs-hint-finger is-b" />
            </>
          ) : (
            <>
              <span className="bs-hint-mouse">
                <span className="bs-hint-wheel" />
              </span>
              <svg className="bs-hint-chev" viewBox="0 0 24 24" width="22" height="22">
                <path d="M6 15 L12 8 L18 15" fill="none" stroke="#FAF6EA" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="bs-hint-plus">+</span>
            </>
          )}
        </div>
        <div className="bs-hint-title">Karte erkunden</div>
        <div className="bs-hint-sub">
          Zoome hinein, um einzelne Brände und Brandflächen genauer zu sehen.
        </div>
        <div className="bs-hint-click">
          <span className="bs-hint-click-tile">
            <span className="bs-hint-ripple" />
            <span className="bs-hint-dot" />
          </span>
          <span className="bs-hint-click-txt">
            <b>Brandflächen anklicken</b>
            <span>zeigt nähere Infos zum jeweiligen Brand</span>
          </span>
        </div>
        <div className="bs-hint-cta">Los geht’s</div>
      </div>
      {spot && (
        <button
          type="button"
          className={`bs-hint-spot${spot.flip ? ' is-flip' : ''}`}
          style={{ left: spot.x, top: spot.y, ['--dx' as string]: `${spot.dx}px`, ['--dy' as string]: `${spot.dy}px` }}
          aria-label={`${spot.s.name}, Details öffnen`}
          onClick={() => { close(); spot.s.onPick(); }}
        >
          <span className="bs-hint-spot-dot"><span className="bs-hint-ripple" /></span>
          <span className="bs-hint-spot-label">
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 3 L5 19 L9.5 15 L12.5 21 L15 19.8 L12 14 L18 14 Z" fill="#2C2A26" />
            </svg>
            {spot.s.name} · {touch ? 'Antippen' : 'Klicken'} für Details
          </span>
        </button>
      )}
    </div>
  );
}
