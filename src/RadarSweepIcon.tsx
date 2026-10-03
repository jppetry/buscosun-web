/**
 * Radar glyph of the Nowcast tile on the start page (audit/startseite-radar-icon.md).
 * Pure SVG: the beam group turns at a constant slow speed via CSS (.tile-radar-beam-group,
 * 14 s per turn), with a fading afterglow and a few static echoes.
 */
const C = 32;
const R = 29.5;
const rad = (deg: number) => (deg * Math.PI) / 180;

// Afterglow: stacked wedges 3°…72° behind the beam, sharing the leading edge.
const TRAIL = Array.from({ length: 24 }, (_, i) => {
  const a = rad(-(i + 1) * 3);
  return `M${C} ${C}L${C + R} ${C}A${R} ${R} 0 0 0 ${(C + R * Math.cos(a)).toFixed(2)} ${(C + R * Math.sin(a)).toFixed(2)}Z`;
});

// Echoes: a small rain band to the north-east, a cell to the south-west. [x, y, r, opacity]
const ECHOES: ReadonlyArray<readonly [number, number, number, number]> = [
  [44, 20, 2.6, 0.55], [49, 27, 2, 0.4], [39, 13, 1.8, 0.45], [21, 43, 2.2, 0.4], [17, 37, 1.5, 0.3],
];

export default function RadarSweepIcon() {
  return (
    <svg className="tile-radar-svg" width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
      <circle className="tile-radar-ring" cx="32" cy="32" r="30" />
      <circle className="tile-radar-ring" cx="32" cy="32" r="20" />
      <circle className="tile-radar-ring" cx="32" cy="32" r="10" />
      {ECHOES.map(([x, y, r, o]) => (
        <circle key={`${x}-${y}`} className="tile-radar-echo" cx={x} cy={y} r={r} opacity={o} />
      ))}
      <g className="tile-radar-beam-group">
        <g className="tile-radar-trail">
          {TRAIL.map((d) => <path key={d} d={d} />)}
        </g>
        <line className="tile-radar-beam" x1={C} y1={C} x2={C + R} y2={C} />
      </g>
      <circle className="tile-radar-hub" cx="32" cy="32" r="3" />
    </svg>
  );
}
