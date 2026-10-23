/**
 * Coast glyph of the Seewetter tile on the start page, in the flat style of the flame (src/FireIcon.tsx):
 * a cliff coast with beach grass on the left, the sea on the right as three wave bands (pale far, dark
 * near) fading out to the right, and a sun setting behind the horizon. Pure SVG + CSS (.tile-coast-*): the wave
 * bands roll at different speeds, the surf washes up the beach and the sun glows. No JS, no per-frame work.
 */
const GROUND = 58;
const PERIOD = 16;

/** Wave band: filled from a wavy top at y down to the ground, two periods wider than the sea so it can roll. */
function band(y: number, amp: number): string {
  let d = `M${32 - 2 * PERIOD} ${GROUND}V${y}`;
  for (let x = 32 - 2 * PERIOD; x < 150 + PERIOD; x += PERIOD) d += `q${PERIOD / 4} ${-amp} ${PERIOD / 2} 0t${PERIOD / 2} 0`;
  return `${d}V${GROUND}Z`;
}

export default function SeaIcon() {
  return (
    <svg className="tile-coast-svg" width="148" height="64" viewBox="0 0 148 64" aria-hidden="true">
      <defs>
        <linearGradient id="coast-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2A9AA6" />
          <stop offset="1" stopColor="#1C5F6B" />
        </linearGradient>
        <linearGradient id="coast-sand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#EADFC4" />
          <stop offset="1" style={{ stopColor: 'var(--border-strong)' }} />
        </linearGradient>
        <radialGradient id="coast-sun-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" style={{ stopColor: 'var(--amber-500)' }} stopOpacity="0.4" />
          <stop offset="1" style={{ stopColor: 'var(--amber-500)' }} stopOpacity="0" />
        </radialGradient>
        {/* The sea runs out softly to the right, like the pale far trees and ridges of the other glyphs */}
        <linearGradient id="coast-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.82" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="coast-sea"><rect x="38" y="16" width="110" height={GROUND - 16} fill="url(#coast-fade)" /></mask>
      </defs>
      {/* Sun setting behind the horizon */}
      <circle className="tile-coast-glow" cx="102" cy="26" r="20" fill="url(#coast-sun-glow)" />
      <circle className="tile-coast-sun" cx="102" cy="27" r="8" />
      {/* Sea: three wave bands, far to near */}
      <g mask="url(#coast-sea)">
        <path className="tile-coast-band tile-coast-band-far" d={band(28, 1.2)} />
        <path className="tile-coast-band tile-coast-band-mid" d={band(37, 1.8)} />
        <path className="tile-coast-band tile-coast-band-near" fill="url(#coast-near)" d={band(46, 2.2)} />
      </g>
      {/* Cliff coast with its shadow side and beach grass; the surf washes against its foot */}
      <path className="tile-coast-sand" fill="url(#coast-sand)" d={`M4 ${GROUND}C7 47 11 35 18 28C23 23 29 21 34 22.5C39 24 42 29 44 36C45.5 42 48 48 54 52C57 54 60 56 62 ${GROUND}Z`} />
      <path className="tile-coast-facet" d={`M34 22.5C39 24 42 29 44 36C45.5 42 48 48 54 52C57 54 60 56 62 ${GROUND}H47C45 50 42 40 39.5 32C38.4 28 36.6 24.6 34 22.5Z`} />
      <path className="tile-coast-grass" d="M19 28.2l-1.8-4.6M21 26.4l-.2-5M23 25.2l1.6-4.4M28.5 23l-1-4.6M30.5 22.6l.4-4.8M32.5 22.8l1.8-4" />
      <path className="tile-coast-surf" d="M46.6 47C49.6 45.2 53.2 45.2 56.6 46.6" />
      <path className="tile-coast-ground" d={`M2 ${GROUND + 0.5}H146`} />
    </svg>
  );
}
