/**
 * Globe glyph of the Globus tile on the start page. Pure SVG + CSS: land strip scrolls
 * behind a sphere shade (steady slow turn, 24 s), meridians sweep across with it, a soft
 * atmosphere ring and highlight give depth. No JS, no per-frame work.
 */
const LAND = [
  'M6 18q4-6 10-4t6 6q-2 6-8 6t-8-8z',
  'M26 12q8-3 12 3t2 8q-6 4-10 0t-4-11z',
  'M14 34q6-2 8 4t-2 10q-6 0-8-6t2-8z',
  'M36 32q6-2 10 3t-2 9q-8 2-10-4t2-8z',
];
const MERIDIANS = [0, 0.25, 0.5, 0.75];

export default function GlobeIcon() {
  return (
    <svg className="tile-globe-svg" width="88" height="88" viewBox="0 0 60 60" aria-hidden="true">
      <defs>
        <clipPath id="globe-clip"><circle cx="30" cy="30" r="26" /></clipPath>
        <radialGradient id="globe-ocean" cx="38%" cy="32%" r="80%">
          <stop offset="0" stopColor="#F4F8FD" />
          <stop offset="1" stopColor="#C9DAEE" />
        </radialGradient>
        <radialGradient id="globe-shade" cx="38%" cy="32%" r="75%">
          <stop offset="0.55" stopColor="#2C2A26" stopOpacity="0" />
          <stop offset="1" stopColor="#2C2A26" stopOpacity="0.28" />
        </radialGradient>
      </defs>
      <circle cx="30" cy="30" r="29" className="tile-globe-halo" />
      <circle cx="30" cy="30" r="26" fill="url(#globe-ocean)" />
      <g clipPath="url(#globe-clip)">
        <g className="tile-globe-land">
          <g transform="translate(4 0)">{LAND.map((d) => <path key={d} d={d} />)}</g>
          <g transform="translate(56 0)">{LAND.map((d) => <path key={d} d={d} />)}</g>
        </g>
        <g className="tile-globe-grid">
          <line x1="4" y1="30" x2="56" y2="30" />
          <path d="M6 18H54M6 42H54" />
          {MERIDIANS.map((p) => (
            <ellipse
              key={p}
              className="tile-globe-meridian"
              cx="30" cy="30" rx="26" ry="26"
              style={{ animationDelay: `${-p * 12}s` }}
            />
          ))}
        </g>
        <circle cx="30" cy="30" r="26" fill="url(#globe-shade)" />
      </g>
      <circle cx="30" cy="30" r="26" className="tile-globe-rim" />
    </svg>
  );
}
