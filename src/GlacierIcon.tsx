/**
 * Glacier glyph of the Gletscher tile on the start page, built like the flame of the Waldbrand
 * tile (src/FireIcon.tsx). Pure SVG + CSS (.tile-glacier-*): below the snowy summit a firn basin
 * feeds an ice tongue that winds down the valley; a light sheen glides over the ice, the crevasses
 * drift downhill, meltwater drips from the snout into a small lake and the snow glints.
 * No JS, no per-frame work.
 */
const GROUND = 58;

/** Firn basin and winding tongue down to the snout (shared by fill, sheen clip and outline). */
const TONGUE = 'M63 18C66 15.5 70 13 74 12C78 13 84 16 88 19.5C83 24 79 29 76 34.5C74 40 71 44 69.5 49.5Q68.5 53 65 53Q61.5 53 61 50C60.5 44 64 40 64.5 34C65 29 66 24 63 18Z';

export default function GlacierIcon() {
  return (
    <svg className="tile-glacier-svg" width="148" height="64" viewBox="0 0 148 64" aria-hidden="true">
      <defs>
        <linearGradient id="glacier-ice" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FAFDFE" />
          <stop offset="0.3" stopColor="#D3ECF3" />
          <stop offset="0.7" stopColor="#8FCAE0" />
          <stop offset="1" stopColor="#4FA3C2" />
        </linearGradient>
        <linearGradient id="glacier-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0.3" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="0.7" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="glacier-rock" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--stone-400)' }} />
          <stop offset="1" style={{ stopColor: 'var(--border-strong)' }} />
        </linearGradient>
        <radialGradient id="glacier-glow" cx="50%" cy="45%" r="50%">
          <stop offset="0" stopColor="#8FD0E3" stopOpacity="0.5" />
          <stop offset="1" stopColor="#8FD0E3" stopOpacity="0" />
        </radialGradient>
        <clipPath id="glacier-tongue"><path d={TONGUE} /></clipPath>
      </defs>
      {/* Cold glow behind the summit */}
      <ellipse className="tile-glacier-glow" cx="74" cy="24" rx="38" ry="20" fill="url(#glacier-glow)" />
      {/* Back range tapering out at both ends, then the massif with light and shadow side */}
      <path className="tile-glacier-back" d={`M4 ${GROUND}L22 38L32 43L46 27L57 35L66 31L84 33L102 22L116 34L126 29L144 ${GROUND}Z`} />
      <path fill="url(#glacier-rock)" d={`M18 ${GROUND}L46 21L56 27L74 7L90 21L101 17L130 ${GROUND}Z`} />
      <path className="tile-glacier-facet" d={`M74 7L90 21L101 17L130 ${GROUND}H90L82 36L80 24Z`} />
      <path className="tile-glacier-ridge" d={`M46 21L52 31L50 42M101 17L106 30L112 40`} />
      {/* Summit and shoulder snow */}
      <path className="tile-glacier-snow" d="M46 21L50 24.5L47.5 24L45.5 25.5L43 24.4Z" />
      <path className="tile-glacier-snow" d="M101 17L105 21L102.5 20.5L100.5 22L98 20.5Z" />
      {/* Ice: firn basin and tongue, with sheen, drifting crevasses and the medial moraine */}
      <path fill="url(#glacier-ice)" d={TONGUE} />
      <g clipPath="url(#glacier-tongue)">
        <rect className="tile-glacier-sheen" x="52" y="-6" width="44" height="34" fill="url(#glacier-sheen)" />
        <g className="tile-glacier-crev">
          <path d="M68 20Q76 23 84 20M67 26Q73 29 80 26M66 32Q71 35 77 32M65 38Q69 41 74 38M63 44Q67 47 71 44M62 50Q65 52 69 50M69 14Q76 17 85 14" />
        </g>
      </g>
      <path className="tile-glacier-moraine" d="M75 15C75 24 71.5 31 70 37C68.5 43 67 47 65.5 52" />
      <path className="tile-glacier-edge" d={TONGUE} />
      {/* Summit snow sits on top of the firn basin */}
      <path className="tile-glacier-snow" d="M74 7L80.5 13.5L77.5 15L75 13L72 15.5L69 14L67.5 14.6Z" />
      {/* Meltwater: drops from the snout into a small lake with ripples */}
      <circle className="tile-glacier-drop" cx="65" cy="53.5" r="1.1" />
      <circle className="tile-glacier-drop tile-glacier-drop-b" cx="63" cy="53.5" r="0.85" />
      <circle className="tile-glacier-drop tile-glacier-drop-c" cx="67" cy="53.5" r="0.95" />
      <ellipse className="tile-glacier-lake" cx="65" cy={GROUND - 0.6} rx="12" ry="1.9" />
      <ellipse className="tile-glacier-ripple" cx="65" cy={GROUND - 0.6} rx="4.5" ry="0.9" />
      {/* Glints on snow and ice */}
      <path className="tile-glacier-glint" d="M76 9l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" />
      <path className="tile-glacier-glint tile-glacier-glint-b" d="M82 20l.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5z" />
      <path className="tile-glacier-glint tile-glacier-glint-c" d="M66 30l.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5z" />
      <path className="tile-glacier-ground" d={`M2 ${GROUND + 0.5}H146`} />
    </svg>
  );
}
