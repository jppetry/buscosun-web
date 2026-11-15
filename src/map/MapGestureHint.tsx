import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
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
  /** Wortlaut und Farbton je Feature; Standard `fire` (Brandradar). */
  subject?: HintSubject;
  /** Wetterkarte only: the page is in its mobile layout (bottom bar instead of the dock on the left). Says WHERE things are. */
  mobileLayout?: boolean;
}

export type HintSubject = 'fire' | 'glacier' | 'road' | 'sea' | 'weather';
/** The Wetterkarte has its own card (`bs-wx-*`) and is not in this table. */
const TEXTS: Record<Exclude<HintSubject, 'weather'>, { sub: string; pick: string; pickSub: string }> = {
  fire: {
    sub: 'Zoome hinein, um einzelne Brände und Brandflächen genauer zu sehen.',
    pick: 'Brände anklicken', pickSub: 'zeigt nähere Infos zum jeweiligen Brand',
  },
  glacier: {
    sub: 'Zoome hinein, um einzelne Gletscher genauer zu sehen.',
    pick: 'Gletscher anklicken', pickSub: 'zeigt nähere Infos zum jeweiligen Gletscher',
  },
  road: {
    sub: 'Zoome hinein, um einzelne Streckenabschnitte und Messstellen genauer zu sehen.',
    pick: 'Strecken und Messstellen anklicken', pickSub: 'zeigt nähere Infos zu Fahrbahn und Wetter dort',
  },
  sea: {
    sub: 'Zoome hinein, um einzelne Küstenabschnitte und Spots genauer zu sehen.',
    pick: 'Spots anklicken', pickSub: 'zeigt nähere Infos zu Wind, Wellen und Wetter dort',
  },
};

/* --- Wetterkarte: wind illustration of the zoom tile ------------------------------------------------------------
   The look of the real layer, zoomed out: every particle is a short dotted trail (5 to 8 dots, bright head, fading
   tail) along a gently curved flow. Built once from a seeded generator, so it is the same picture on every render,
   and drawn as one path per trail position and colour (16 paths instead of ~1400 circles). No canvas, no map. */
const WX_FIELD_W = 520;
const WX_FIELD_H = 220;
const WX_TRAIL_MAX = 8;
/** `particleColor` of `wind/weatherWindPreset.ts` ([0.86, 0.92, 1.0]) and the cooler tint of the slower particles. */
const WX_DOT_COLORS = ['#DBEBFF', '#9CC6EE'] as const;
interface WxDotLayer { d: string; c: string; w: number; o: number }

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let wxFieldCache: WxDotLayer[] | null = null;
function wxField(): WxDotLayer[] {
  if (wxFieldCache) return wxFieldCache;
  const rnd = mulberry32(20261115);
  const d: string[][] = WX_DOT_COLORS.map(() => Array.from({ length: WX_TRAIL_MAX }, () => ''));
  const flow = (x: number, y: number) => 0.62 + 0.5 * Math.sin(x / 150 + y / 95) + 0.28 * Math.cos(y / 60 - x / 240);
  const stepX = 31;
  const stepY = 26;
  for (let gy = -1; gy * stepY < WX_FIELD_H + stepY; gy++) {
    for (let gx = -1; gx * stepX < WX_FIELD_W + stepX; gx++) {
      let x = (gx + rnd()) * stepX;
      let y = (gy + rnd()) * stepY;
      const n = 5 + Math.floor(rnd() * 4);
      const c = rnd() < 0.28 ? 1 : 0;
      const step = 3.1 + rnd() * 0.6;
      // k = 0 is the head; the trail runs back against the flow. A tiny segment with round caps draws a dot.
      for (let k = 0; k < n; k++) {
        d[c][k] += `M${x.toFixed(1)} ${y.toFixed(1)}h.01`;
        const a = flow(x, y);
        x -= Math.cos(a) * step;
        y -= Math.sin(a) * step;
      }
    }
  }
  const out: WxDotLayer[] = [];
  WX_DOT_COLORS.forEach((c, ci) => {
    for (let k = 0; k < WX_TRAIL_MAX; k++) {
      if (d[ci][k]) out.push({ d: d[ci][k], c, w: +(2 * (1.5 - 0.094 * k)).toFixed(2), o: +(0.95 * 0.75 ** k).toFixed(2) });
    }
  });
  wxFieldCache = out;
  return out;
}

const WX_ICON = {
  width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
} as const;
/** No-break space: keeps "▶" with the word after it. */
const NBSP = String.fromCharCode(160);
const WX_LABEL_FONT ="'League Spartan', system-ui, sans-serif";
/** Fallback when the caller does not pass `mobileLayout` (same query as `MOBILE_MAP_MEDIA_QUERY` in MapView). */
const MOBILE_LAYOUT_QUERY = '(max-width: 767px), (max-width: 1439px) and (pointer: coarse), (max-height: 430px) and (orientation: landscape)';

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
 *
 * Wetterkarte (`subject="weather"`): same veil and same closing rules, but a bento card with four tiles
 * (layers, zoom, time, place), a close button, a "Los geht’s" button and Escape.
 */
export default function MapGestureHint({ map, feature, accent = '#B5651D', enabled = true, pickSpots, always = false, subject = 'fire', mobileLayout }: Props) {
  const wxHeadId = useId();
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

  // Wetterkarte: Escape closes too (the card is no modal, focus is not trapped).
  useEffect(() => {
    if (!open || subject !== 'weather') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [open, subject, close]);

  if (!open) return null;

  // Wetterkarte: bento card instead of the gesture stage. Two independent axes for the wording: the LAYOUT of the
  // page (dock on the left or bottom bar) says where things are, the POINTER (fine or coarse) names the gesture.
  // Which grid the card uses follows the size of the stage (container queries in the CSS), not the viewport.
  if (subject === 'weather') {
    const mob = mobileLayout ?? (typeof window !== 'undefined' && window.matchMedia(MOBILE_LAYOUT_QUERY).matches);
    return (
      <div
        ref={rootRef}
        className={`bs-hint bs-wx${touch ? ' is-touch' : ' is-mouse'} is-weather ${mob ? 'is-mob' : 'is-desk'}`}
        style={{ ['--bs-hint-accent' as string]: accent }}
        onWheel={close}
        onTouchStart={(e) => { if (e.touches.length > 1) close(); }}
      >
        <button type="button" className="bs-hint-veil" aria-label="Hinweis schließen" tabIndex={-1} onClick={close} />
        <div className="bs-wx-edge">
          <svg {...WX_ICON} width={18} height={18}><path d="m14 5-7 7 7 7" /></svg>
          Wetterlayer hier ein und ausblenden
        </div>
        <div className="bs-wx-lay">
          <section className="bs-wx-card" aria-labelledby={wxHeadId}>
            <header className="bs-wx-head">
              <span className="bs-wx-eyebrow">Wetterkarte</span>
              <h2 className="bs-wx-h" id={wxHeadId}>So nutzt du die Karte</h2>
            </header>
            <button type="button" className="bs-wx-x" aria-label="Hinweis schließen" onClick={close}>
              <svg {...WX_ICON} width={20} height={20}><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
            <div className="bs-wx-bento">
              <div className="bs-wx-t bs-wx-t1">
                <div className="bs-wx-ill" aria-hidden="true">
                  <div className="bs-wx-mock">
                    <span className="bs-wx-mock-eb">Wetterlayer</span>
                    <div className="bs-wx-row is-r1 is-on"><i style={{ background: 'var(--steel-600, #3A6FA8)' }} />Niederschlag<span className="bs-wx-tg" /></div>
                    <div className="bs-wx-row is-ani"><i style={{ background: 'var(--sage-600, #7A9466)' }} />Wind<span className="bs-wx-tg" /></div>
                    <div className="bs-wx-row is-on"><i style={{ background: 'var(--terracotta-500, #C97B47)' }} />Temperatur<span className="bs-wx-tg" /></div>
                    <div className="bs-wx-row is-r4"><i style={{ background: 'var(--slate-500, #6B7A8F)' }} />Wolken<span className="bs-wx-tg" /></div>
                    <div className="bs-wx-mbar">
                      <svg {...WX_ICON}><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="m3 13 9 5 9-5" /></svg>
                      <span><svg {...WX_ICON}><rect x="3" y="5" width="18" height="6" rx="2" /><rect x="3" y="13" width="18" height="6" rx="2" /></svg>Layer</span>
                    </div>
                  </div>
                </div>
                <div className="bs-wx-tx">
                  <b>Wetterlayer ein und ausblenden</b>
                  <p>{mob
                    ? 'Unten auf „Layer“ tippen. Mehrere gleichzeitig möglich.'
                    : `In der Leiste links Wind, Temperatur, Niederschlag und mehr ${touch ? 'antippen' : 'anklicken'}. Mehrere gleichzeitig möglich.`}</p>
                </div>
              </div>
              <div className="bs-wx-t bs-wx-t2">
                <svg className="bs-wx-field" viewBox={`0 0 ${WX_FIELD_W} ${WX_FIELD_H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                  <path d="M83 0 C114 88 52 132 104 220" stroke="#E9EDF0" strokeOpacity={0.6} strokeWidth={1.6} strokeDasharray="5 5" fill="none" />
                  {wxField().map((l, i) => (
                    <path key={i} d={l.d} stroke={l.c} strokeOpacity={l.o} strokeWidth={l.w} strokeLinecap="round" fill="none" />
                  ))}
                  <g className="bs-wx-lbl" fontFamily={WX_LABEL_FONT} fontSize={12} fontWeight={600} fill="#E9EDF0" stroke="#3E4143" strokeWidth={3} paintOrder="stroke">
                    <text x="156" y="66">München</text>
                    <text className="bs-wx-lbl2" x="322" y="110">Innsbruck</text>
                  </g>
                  <g className="bs-wx-lbl" fontFamily={WX_LABEL_FONT} fontSize={12} fontWeight={700} fill="#F3E36B" stroke="#3E4143" strokeWidth={3} paintOrder="stroke">
                    <text x="214" y="66">7°</text>
                    <text className="bs-wx-lbl2" x="384" y="110">9°</text>
                  </g>
                </svg>
                <div className="bs-wx-shade" aria-hidden="true" />
                <span className="bs-wx-badge">
                  <svg {...WX_ICON}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4M8 11h6M11 8v6" /></svg>
                  {touch ? 'Zwei Finger' : 'Mausrad'}
                </span>
                <div className="bs-wx-tx">
                  <b>Hineinzoomen</b>
                  <p>Je näher, desto feiner zeigen die Windpartikel die Strömung, bis in einzelne Täler.</p>
                </div>
              </div>
              <div className="bs-wx-t bs-wx-t3">
                <div className="bs-wx-ill" aria-hidden="true">
                  <div className="bs-wx-pill">
                    <span className="bs-wx-play"><svg width="9" height="9" viewBox="0 0 12 12"><path d="M3 1.5v9l7-4.5Z" fill="#FAF6EA" /></svg></span>
                    <div className="bs-wx-track"><span className="bs-wx-run" /></div>
                  </div>
                </div>
                <div className="bs-wx-tx">
                  <b>Zeit wählen</b>
                  <p>Der Regler unten zeigt die nächsten Stunden, ▶{NBSP}spielt sie ab.</p>
                </div>
              </div>
              <div className="bs-wx-t bs-wx-t4">
                <div className="bs-wx-ill" aria-hidden="true">
                  <div className="bs-wx-pill">
                    <svg {...WX_ICON} width={16} height={16} className="bs-wx-lens"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
                    Innsbruck<i className="bs-wx-caret" />
                  </div>
                </div>
                <div className="bs-wx-tx">
                  <b>Ort suchen</b>
                  <p>Oben eingeben, die Karte fliegt hin und zeigt die Vorhersage dort.</p>
                </div>
              </div>
            </div>
            <footer className="bs-wx-foot">
              <span className="bs-wx-note">Schließt auch beim ersten Zoomen oder Klick auf die Karte.</span>
              <button type="button" className="bs-wx-go" onClick={close}>Los geht’s</button>
            </footer>
          </section>
        </div>
      </div>
    );
  }

  const txt = TEXTS[subject];

  return (
    <div
      ref={rootRef}
      className={`bs-hint${touch ? ' is-touch' : ' is-mouse'} is-${subject}`}
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
          {txt.sub}
        </div>
        <div className="bs-hint-click">
          <span className="bs-hint-click-tile">
            <span className="bs-hint-ripple" />
            <span className="bs-hint-dot" />
          </span>
          <span className="bs-hint-click-txt">
            <b>{txt.pick}</b>
            <span>{txt.pickSub}</span>
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
