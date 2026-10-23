/**
 * Wave glyph of the Seewetter tile on the start page, composed like the flame of the Waldbrand tile
 * (src/FireIcon.tsx): one layered breaking wave with whitewater at its foot in the middle, flanked on both sides by a stand of
 * three dunes with beach grass that shrink and pale outwards; the two dunes next to the wave are wet
 * on their inner side. Pure SVG + CSS (.tile-coast-*): the wave layers surge out of phase, a soft
 * glow breathes, spray rises off the crest and the wet sand glistens. No JS, no per-frame work.
 */
const stop = (v: string) => ({ stopColor: `var(${v})` });

const GROUND = 58;

/** Dune hump standing on the ground line at x. */
function dune(x: number, w: number, h: number): string {
  const r = (n: number) => Math.round(n * 10) / 10;
  return `M${r(x - w / 2)} ${GROUND}C${r(x - w / 3.2)} ${r(GROUND - h * 1.3)} ${r(x + w / 3.2)} ${r(GROUND - h * 1.3)} ${r(x + w / 2)} ${GROUND}Z`;
}

/** Tuft of beach grass on the top of a dune at x (top y). */
function grass(x: number, top: number, h: number): string {
  const r = (n: number) => Math.round(n * 10) / 10;
  return `M${r(x - 1)} ${r(top + 0.6)}l${r(-h * 0.35)} ${r(-h)}M${r(x)} ${r(top + 0.4)}l${r(h * 0.05)} ${r(-h * 1.15)}M${r(x + 1)} ${r(top + 0.6)}l${r(h * 0.4)} ${r(-h * 0.9)}`;
}

export default function SeaIcon() {
  return (
    <svg className="tile-coast-svg" width="148" height="64" viewBox="0 0 148 64" aria-hidden="true">
      <defs>
        <linearGradient id="coast-outer" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5FB7C2" />
          <stop offset="0.55" stopColor="#2A9AA6" />
          <stop offset="1" stopColor="#1C5F6B" />
        </linearGradient>
        <linearGradient id="coast-inner" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#CDEBEE" />
          <stop offset="1" stopColor="#5FB7C2" />
        </linearGradient>
        <radialGradient id="coast-glow" cx="50%" cy="62%" r="50%">
          <stop offset="0" stopColor="#5FB7C2" stopOpacity="0.34" />
          <stop offset="1" stopColor="#5FB7C2" stopOpacity="0" />
        </radialGradient>
        {/* Wet dunes: dry sand on the far side, sea-wet towards the wave. */}
        <linearGradient id="coast-dune-wet-l" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.3" style={stop('--border-strong')} />
          <stop offset="1" stopColor="#2A9AA6" />
        </linearGradient>
        <linearGradient id="coast-dune-wet-r" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0.3" style={stop('--border-strong')} />
          <stop offset="1" stopColor="#2A9AA6" />
        </linearGradient>
      </defs>
      {/* Own viewport keeps the wave's 64×64 coordinates (CSS transform-origin) unchanged, like the flame. */}
      <svg x="42" y="0" width="64" height="64" viewBox="0 0 64 64" overflow="visible">
        <circle className="tile-coast-glow" cx="34" cy="36" r="31" fill="url(#coast-glow)" />
        <path
          className="tile-coast-outer"
          fill="url(#coast-outer)"
          d="M8 58C9 44 15 30 24 20C31 12 40 5 50 5C57.5 5 61 11 59 16.5C57.5 20.5 52.5 21.5 50.5 18C49.2 15.8 46 16 44 19.5C40 26 41.5 37 48 46C51.5 51 55 54.5 57 58Z"
        />
        <path
          className="tile-coast-inner"
          fill="url(#coast-inner)"
          d="M17 58C18.5 47 23 37 29.5 28.5C34 22.5 39.5 18 45 16.5C40 22 37.8 29 38.6 37C39.5 45 43 52 46 58Z"
        />
        <path className="tile-coast-crest" d="M27.5 21.5C33.5 13.5 41.5 8.2 49.5 7.8C54.8 7.6 57.6 10.8 56.8 14.6C55.4 11.9 52.6 10.8 49.4 11C42.4 11.5 34.8 15.8 27.5 21.5Z" />
        {/* Core: whitewater where the wave crashes, in the place of the flame's bright core */}
        <path className="tile-coast-core" d="M37 58C37.5 55.6 40 54.2 42.5 54.8C43.6 52.2 46.6 51 49.2 52.2C50.8 49.8 54.6 49.6 56.4 52C58.8 51.2 61.8 52.8 62.2 55.4C63.6 55.6 64.4 56.8 64 58Z" />
        <circle className="tile-coast-spray" cx="46" cy="6" r="1.3" />
        <circle className="tile-coast-spray tile-coast-spray-b" cx="55" cy="50" r="1.1" />
        <circle className="tile-coast-spray tile-coast-spray-c" cx="52" cy="3" r="1" />
      </svg>
      {/* Dune stands: pale far dunes, full middle dunes with grass, wet inner dunes */}
      <path className="tile-coast-dune tile-coast-dune-back" d={dune(10, 18, 13) + dune(138, 18, 14)} />
      <path className="tile-coast-dune" d={dune(25, 28, 21) + dune(123, 28, 22)} />
      <path className="tile-coast-grass" d={grass(22, 37.9, 10) + grass(29, 39.6, 7) + grass(120, 36.9, 10) + grass(127, 38.6, 7)} />
      <path className="tile-coast-dune-wet" fill="url(#coast-dune-wet-l)" d={dune(41.5, 20, 15)} />
      <path className="tile-coast-dune-wet" fill="url(#coast-dune-wet-r)" d={dune(106.5, 20, 15.5)} />
      <path className="tile-coast-ground" d={`M2 ${GROUND + 0.5}H146`} />
    </svg>
  );
}
