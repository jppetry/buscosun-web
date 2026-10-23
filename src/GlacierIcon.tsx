/**
 * Glacier glyph of the Gletscher tile on the start page, built like the flame of the Waldbrand
 * tile (src/FireIcon.tsx). Pure SVG + CSS (.tile-glacier-*): a glacier tongue flows down from the
 * firn basin between two ridges, a light sheen glides over the ice, crevasses drift downhill,
 * meltwater drips from the snout into a small lake and the snow on the summit glints.
 * No JS, no per-frame work.
 */
const GROUND = 58;

/** Ice tongue from the firn basin down to the snout (shared by fill and sheen clip). */
const TONGUE = 'M60 17C66 13 82 13 89 18C87 27 84 35 81 43C79 49 77 52 73 52C69 52 67 49 66 45C64 36 62 27 60 17Z';

export default function GlacierIcon() {
  return (
    <svg className="tile-glacier-svg" width="148" height="64" viewBox="0 0 148 64" aria-hidden="true">
      <defs>
        <linearGradient id="glacier-ice" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F2FAFC" />
          <stop offset="0.45" stopColor="#A9D4E2" />
          <stop offset="1" stopColor="#5FAFC9" />
        </linearGradient>
        <linearGradient id="glacier-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0.3" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.85" />
          <stop offset="0.7" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="glacier-rock" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--stone-400)' }} />
          <stop offset="1" style={{ stopColor: 'var(--border-strong)' }} />
        </linearGradient>
        <radialGradient id="glacier-glow" cx="50%" cy="40%" r="50%">
          <stop offset="0" stopColor="#8FD0E3" stopOpacity="0.4" />
          <stop offset="1" stopColor="#8FD0E3" stopOpacity="0" />
        </radialGradient>
        <clipPath id="glacier-tongue"><path d={TONGUE} /></clipPath>
      </defs>
      {/* Cold glow behind the massif */}
      <ellipse className="tile-glacier-glow" cx="74" cy="28" rx="46" ry="26" fill="url(#glacier-glow)" />
      {/* Back range, then the massif with its two ridges */}
      <path className="tile-glacier-back" d={`M0 ${GROUND}L18 34L30 42L46 22L58 34L74 30L92 34L104 20L120 40L134 30L148 38V${GROUND}Z`} />
      <path fill="url(#glacier-rock)" d={`M26 ${GROUND}L52 22L62 14L74 4L86 14L96 20L124 ${GROUND}Z`} />
      <path className="tile-glacier-facet" d={`M74 4L86 14L96 20L124 ${GROUND}H96L84 30Z`} />
      {/* Summit snow and firn basin */}
      <path className="tile-glacier-snow" d="M74 4L81 10L78 12L75 10L71 13L67 10Z" />
      <path className="tile-glacier-snow" d="M52 22L56 19L60 22L57 24Z" />
      {/* Ice tongue with sheen and drifting crevasses */}
      <path fill="url(#glacier-ice)" d={TONGUE} />
      <g clipPath="url(#glacier-tongue)">
        <rect className="tile-glacier-sheen" x="50" y="-10" width="50" height="40" fill="url(#glacier-sheen)" />
        <g className="tile-glacier-crev">
          <path d="M66 24Q74 27 84 23M67 32Q74 35 83 31M68 40Q74 43 81 39M69 48Q74 50 78 47M65 16Q74 19 86 15" />
        </g>
      </g>
      <path className="tile-glacier-edge" d={TONGUE} />
      {/* Meltwater: drops from the snout into a small lake with ripples */}
      <circle className="tile-glacier-drop" cx="73" cy="53" r="1.2" />
      <circle className="tile-glacier-drop tile-glacier-drop-b" cx="70.5" cy="53" r="0.9" />
      <circle className="tile-glacier-drop tile-glacier-drop-c" cx="75.5" cy="53" r="1" />
      <ellipse className="tile-glacier-lake" cx="73" cy={GROUND - 0.5} rx="13" ry="1.8" />
      <ellipse className="tile-glacier-ripple" cx="73" cy={GROUND - 0.5} rx="5" ry="0.9" />
      {/* Glints on the snow */}
      <path className="tile-glacier-glint" d="M77 7l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" />
      <path className="tile-glacier-glint tile-glacier-glint-b" d="M83 21l.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5z" />
      <path className="tile-glacier-glint tile-glacier-glint-c" d="M63 25l.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5z" />
      <path className="tile-glacier-ground" d={`M2 ${GROUND + 0.5}H146`} />
    </svg>
  );
}
