/**
 * DachMapPreview — Zier-Grafik der Startseiten-Kachel „01 · Wetterkarte": eine helle, flache DACH-Karte in den Farben der
 * Feature-Kacheln (Land je Staat getönt: Salbei / Amber / Stahlblau; dunkler Umriss), über die von West nach Ost eine
 * Regenfront zieht — Frontlinie mit Zacken in Zugrichtung, Regenband dahinter —, dazu drei gestrichelte Zugbahnen mit
 * mitwandernden Zellen. Daneben die Ebenen als Chip-Liste mit Farbpunkt (aktiv: Niederschlag). Keine Daten; die Umrisse stehen in `dachPreviewPaths.ts`
 * (GENERIERT, `scripts/gen-dach-preview.mjs`). Die Bewegung (`.tile-map-front`, SMIL der Zellen, `.tile-map-chip-dot`)
 * läuft bewusst ohne prefers-reduced-motion-Ausnahme, wie die übrigen Kachel-Glyphen (Jan 2026-10-03).
 */
import { DACH_PREVIEW_H, DACH_PREVIEW_W, DACH_PREVIEW_PATHS as P, DACH_PREVIEW_RELIEF as R } from './dachPreviewPaths';

const PAD = 8;
const SHAPE = `${P.DE}${P.AT}${P.CH}`;
/** Ebenen mit Farbpunkt (Tokens der Feature-Kacheln). */
const LAYERS: [string, string][] = [
  ['Wind', 'var(--sage-600)'], ['Niederschlag', 'var(--steel-600)'], ['Temperatur', 'var(--amber-500)'], ['Wolken', 'var(--stone-500)'],
  ['Satellit', '#5FAFC9'], ['Blitze', 'var(--amber-500)'], ['Stationen', 'var(--ink-900)'],
];
const ACTIVE = 'Niederschlag';

/** Frontlinie (lokal, Zugrichtung +x) als kubische Bézierkurve; das Regenband liegt BAND Einheiten dahinter. */
const FRONT: [number, number][] = [[12, -10], [-6, 60], [26, 150], [4, 255]];
const BAND = 78;
/** Die Gruppe wandert von X_FROM nach X_TO (Einheiten des Land-Koordinatensystems, Land ≈ 0…190); 16 s je Zug — dieselben Werte stehen in `deck-map-front` (SearchPage.css). */
const X_FROM = -100;
const X_TO = 215;
const DUR_S = 16;
/** Zugbahnen (Land-Koordinaten). Die Zellen sitzen 6 Einheiten hinter dem Linienursprung, also im Regenband. */
const TRACKS = [
  `M${X_FROM - 6} 70 C-20 40 60 92 ${X_TO - 6} 52`,
  `M${X_FROM - 6} 132 C-20 110 70 152 ${X_TO - 6} 120`,
  `M${X_FROM - 6} 192 C-10 170 80 204 ${X_TO - 6} 176`,
];

const bez = (t: number): [number, number] => {
  const u = 1 - t;
  const [a, b, c, d] = FRONT;
  return [0, 1].map((i) => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i]) as [number, number];
};
const frontPath = `M${FRONT[0]} C${FRONT[1]} ${FRONT[2]} ${FRONT[3]}`;
const bandPath = `${frontPath} L${FRONT[3][0] - BAND} ${FRONT[3][1]} C${FRONT[2][0] - BAND} ${FRONT[2][1]} ${FRONT[1][0] - BAND} ${FRONT[1][1]} ${FRONT[0][0] - BAND} ${FRONT[0][1]}Z`;
/** Zacken der Kaltfront: Dreiecke auf der Linie, Spitze in Zugrichtung (+x). */
const TEETH = Array.from({ length: 10 }, (_, i) => {
  const t = 0.05 + i * 0.1;
  const [x, y] = bez(t);
  const [x2, y2] = bez(t + 0.01);
  const [x1, y1] = bez(t - 0.01);
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const tx = (x2 - x1) / len, ty = (y2 - y1) / len;
  const nx = Math.abs(ty), ny = ty >= 0 ? -tx : tx; // normal with positive x
  const f = (n: number) => Math.round(n * 10) / 10;
  return `M${f(x - tx * 4)} ${f(y - ty * 4)}L${f(x + nx * 8)} ${f(y + ny * 8)}L${f(x + tx * 4)} ${f(y + ty * 4)}Z`;
}).join('');

export function DachMapPreview() {
  return (
    <>
      <svg
        viewBox={`${-PAD} ${-PAD} ${DACH_PREVIEW_W + 2 * PAD} ${DACH_PREVIEW_H + 2 * PAD}`}
        preserveAspectRatio="xMidYMid meet"
        className="tile-map-svg"
        aria-hidden="true"
      >
        <defs>
          <clipPath id="tkClip"><path d={SHAPE} /></clipPath>
          <linearGradient id="tkBand" gradientUnits="userSpaceOnUse" x1="12" y1="0" x2={12 - BAND} y2="0">
            <stop offset="0" stopColor="var(--tk-rain)" stopOpacity=".6" />
            <stop offset=".5" stopColor="var(--tk-rain)" stopOpacity=".26" />
            <stop offset="1" stopColor="var(--tk-rain)" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="tkCore">
            <stop offset="0" stopColor="var(--tk-core)" stopOpacity=".5" />
            <stop offset="1" stopColor="var(--tk-core)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d={P.DE} fill="var(--tk-de)" />
        <path d={P.AT} fill="var(--tk-at)" />
        <path d={P.CH} fill="var(--tk-ch)" />
        <g clipPath="url(#tkClip)">
          <path d={R.hill.a} fill="var(--tk-hill-a)" />
          <path d={R.hill.b} fill="var(--tk-hill-b)" />
          <path d={R.back.a} fill="var(--tk-mt-a)" fillOpacity=".7" />
          <path d={R.back.b} fill="var(--tk-mt-b)" fillOpacity=".7" />
          <path d={R.back.s} fill="#fff" fillOpacity=".85" />
          <path d={R.front.a} fill="var(--tk-mt-a)" />
          <path d={R.front.b} fill="var(--tk-mt-b)" />
          <path d={R.front.s} fill="#fff" />
        </g>
        <g clipPath="url(#tkClip)">
          <g fill="none" stroke="var(--ink-900)" strokeOpacity=".4" strokeWidth="1.1" strokeLinecap="round" strokeDasharray="1.5 4.5">
            {TRACKS.map((d) => <path key={d} d={d} />)}
          </g>
          <g className="tile-map-front">
            <path d={bandPath} fill="url(#tkBand)" />
            <ellipse cx="-26" cy="62" rx="30" ry="20" fill="url(#tkCore)" />
            <ellipse cx="-30" cy="168" rx="26" ry="18" fill="url(#tkCore)" />
            <path d={frontPath} fill="none" stroke="var(--ink-900)" strokeWidth="2.2" strokeLinecap="round" />
            <path d={TEETH} fill="var(--ink-900)" />
          </g>
          {TRACKS.map((d) => (
            <g key={d} fill="var(--amber-500)">
              <circle r="3.2" stroke="var(--ink-900)" strokeWidth="1.2">
                <animateMotion dur={`${DUR_S}s`} repeatCount="indefinite" path={d} />
              </circle>
              <circle r="3" fill="none" stroke="var(--ink-900)" strokeWidth="1">
                <animateMotion dur={`${DUR_S}s`} repeatCount="indefinite" path={d} />
                <animate attributeName="r" values="3;9" dur="1.6s" repeatCount="indefinite" />
                <animate attributeName="opacity" values=".7;0" dur="1.6s" repeatCount="indefinite" />
              </circle>
            </g>
          ))}
        </g>
        <g fill="none" stroke="var(--ink-900)" strokeOpacity=".3" strokeWidth="1" strokeLinejoin="round">
          <path d={P.AT} /><path d={P.CH} />
        </g>
        <path d={SHAPE} fill="none" stroke="var(--ink-900)" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <div className="tile-map-chips" aria-hidden="true">
        {LAYERS.map(([l, c]) => (
          <span key={l} className={`tile-map-chip${l === ACTIVE ? ' is-on' : ''}`}>
            {l === ACTIVE ? <i className="tile-map-chip-dot" /> : <i className="tile-map-chip-sw" style={{ background: c }} />}
            {l}
          </span>
        ))}
      </div>
    </>
  );
}
