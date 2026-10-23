/**
 * Coast glyph of the Seewetter tile on the start page, built like the flame of the Waldbrand tile
 * (src/FireIcon.tsx) and the glacier (src/GlacierIcon.tsx). Pure SVG + CSS (.tile-coast-*): wave
 * rows roll in towards a dune coast with a lighthouse, surf washes up the beach, a sailboat rocks
 * on the swell, the lamp blinks and its beam sweeps; a soft sun glows over the horizon.
 * No JS, no per-frame work.
 */
const HORIZON = 33;
const BASE = 58;
const PERIOD = 16;

/** One wave row: a gentle sine of PERIOD px, two periods wider than the view so it can roll. */
function waveRow(y: number, amp: number): string {
  let d = `M${-2 * PERIOD} ${y}`;
  for (let x = -2 * PERIOD; x < 148 + 2 * PERIOD; x += PERIOD) d += `q${PERIOD / 4} ${-amp} ${PERIOD / 2} 0t${PERIOD / 2} 0`;
  return d;
}

export default function SeaIcon() {
  return (
    <svg className="tile-coast-svg" width="148" height="64" viewBox="0 0 148 64" aria-hidden="true">
      <defs>
        <linearGradient id="coast-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#BFE3E6" />
          <stop offset="0.35" stopColor="#7FC4CC" />
          <stop offset="0.75" stopColor="#2A9AA6" />
          <stop offset="1" stopColor="#1C5F6B" />
        </linearGradient>
        <linearGradient id="coast-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.16" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.86" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="coast-mask"><rect x="0" y="0" width="148" height="64" fill="url(#coast-fade)" /></mask>
        <radialGradient id="coast-sun" cx="50%" cy="50%" r="50%">
          <stop offset="0" style={{ stopColor: 'var(--amber-500)' }} stopOpacity="0.45" />
          <stop offset="1" style={{ stopColor: 'var(--amber-500)' }} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="coast-beam" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#FFE7A8" stopOpacity="0.85" />
          <stop offset="1" stopColor="#FFE7A8" stopOpacity="0" />
        </linearGradient>
        <clipPath id="coast-water"><rect x="0" y={HORIZON} width="148" height={BASE - HORIZON} /></clipPath>
      </defs>
      {/* Sun low over the horizon */}
      <circle className="tile-coast-glow" cx="34" cy={HORIZON - 4} r="16" fill="url(#coast-sun)" />
      <circle className="tile-coast-sun" cx="34" cy={HORIZON - 4} r="5" />
      {/* Sea with rolling wave rows, fading out to the left */}
      <g mask="url(#coast-mask)">
        <rect x="0" y={HORIZON} width="148" height={BASE - HORIZON} fill="url(#coast-sea)" />
        <g clipPath="url(#coast-water)">
          <path className="tile-coast-wave tile-coast-wave-a" d={waveRow(HORIZON + 4, 1)} />
          <path className="tile-coast-wave tile-coast-wave-b" d={waveRow(HORIZON + 10, 1.6)} />
          <path className="tile-coast-wave tile-coast-wave-c" d={waveRow(HORIZON + 17, 2.2)} />
        </g>
        {/* Sailboat rocking on the swell */}
        <g className="tile-coast-boat">
          <path className="tile-coast-hull" d="M44 39.5h12l-2 2.6h-8z" />
          <path className="tile-coast-sail" d="M50 25.5v13h7.5z" />
          <path className="tile-coast-sail-b" d="M49 28v10.5h-5z" />
          <path className="tile-coast-mast" d="M50 25v14.5" />
        </g>
      </g>
      {/* Dune coast with beach grass; surf washes up the beach */}
      <path className="tile-coast-surf" d={`M90 ${BASE - 0.5}C95 ${BASE - 3} 99 ${BASE - 4} 104 ${BASE - 3.4}`} />
      <path className="tile-coast-dune" d={`M92 ${BASE}C99 ${BASE - 6} 105 ${BASE - 11} 114 ${HORIZON + 8}C121 ${HORIZON + 5} 127 ${HORIZON + 2} 134 ${HORIZON + 2}C139 ${HORIZON + 2} 143 ${HORIZON + 5} 145 ${HORIZON + 10}C146.5 ${HORIZON + 15} 147 ${BASE - 5} 147 ${BASE}Z`} />
      <path className="tile-coast-beach" d={`M92 ${BASE}C99 ${BASE - 6} 105 ${BASE - 11} 114 ${HORIZON + 8}C110 ${HORIZON + 14} 106 ${BASE - 4} 104 ${BASE}Z`} />
      <path className="tile-coast-grass" d={`M116 ${HORIZON + 8}l-1.5-4M118 ${HORIZON + 7}l.5-4.5M120 ${HORIZON + 6}l2-4M138 ${HORIZON + 3}l-1-4M140 ${HORIZON + 3.5}l1.5-3.5`} />
      {/* Lighthouse: striped tower, gallery, blinking lamp and a sweeping beam */}
      <path className="tile-coast-beam" d="M129 14.5L96 9.5V19.5Z" fill="url(#coast-beam)" />
      <path className="tile-coast-tower" d={`M126.5 ${HORIZON + 2.5}L127.8 17h4.4l1.3 ${HORIZON - 14.5}z`} />
      <path className="tile-coast-band" d="M127.3 22.5h5.4l.3 3.8h-6zM126.9 29.6h6.2l.3 3.6h-6.8z" />
      <path className="tile-coast-gallery" d="M126.6 16.4h6.8v1.2h-6.8z" />
      <rect className="tile-coast-lamp" x="128.4" y="12.6" width="3.2" height="3.8" rx="0.6" />
      <path className="tile-coast-roof" d="M127.6 12.8L130 10.2l2.4 2.6z" />
      {/* Gulls */}
      <path className="tile-coast-gull" d="M70 14q2 -2 4 0q2 -2 4 0" />
      <path className="tile-coast-gull tile-coast-gull-b" d="M84 9q1.5 -1.5 3 0q1.5 -1.5 3 0" />
      <path className="tile-coast-ground" d={`M2 ${BASE + 0.5}H146`} />
    </svg>
  );
}
