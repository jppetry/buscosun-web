/**
 * Motorway glyph of the Autobahnwetter tile on the start page, in the flat style of the flame (src/FireIcon.tsx):
 * a road runs in perspective into a saddle between two hills, under a sign gantry with the blue Autobahn
 * panel; snowy conifers flank it, paler outward. Pure SVG + CSS (.tile-autobahn-*): the lane dashes flow toward
 * the viewer, oncoming headlights grow out of the distance, tail lights shrink away, snow falls and a frost
 * glint flashes on the road. No JS, no per-frame work.
 */
const GROUND = 58;
const HORIZON = 25;
const VX = 74;

/** Conifer silhouette (three tiers + trunk) standing on the ground line at x, as in FireIcon. */
function conifer(x: number, h: number): string {
  const top = GROUND - h;
  const r = (n: number) => Math.round(n * 10) / 10;
  const tier = (apex: number, base: number, half: number) =>
    `M${r(x)} ${r(apex)}L${r(x + half)} ${r(base)}L${r(x - half)} ${r(base)}Z`;
  const trunkW = h * 0.08;
  return (
    tier(top, top + h * 0.42, h * 0.18) +
    tier(top + h * 0.2, top + h * 0.66, h * 0.24) +
    tier(top + h * 0.42, GROUND - h * 0.12, h * 0.3) +
    `M${r(x - trunkW / 2)} ${r(GROUND - h * 0.12)}h${r(trunkW)}V${GROUND}h${r(-trunkW)}Z`
  );
}

/** Snow cap on the top tier of a conifer from conifer(x, h). */
function coniferSnow(x: number, h: number): string {
  const top = GROUND - h;
  const r = (n: number) => Math.round(n * 10) / 10;
  return `M${r(x)} ${r(top)}L${r(x + h * 0.11)} ${r(top + h * 0.26)}L${r(x)} ${r(top + h * 0.21)}L${r(x - h * 0.11)} ${r(top + h * 0.26)}Z`;
}

const ROAD = `M${VX - 2} ${HORIZON}H${VX + 2}L106 ${GROUND}H42Z`;

export default function RoadIcon() {
  return (
    <svg className="tile-autobahn-svg" width="148" height="64" viewBox="0 0 148 64" aria-hidden="true">
      <defs>
        <linearGradient id="autobahn-asphalt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--stone-400)' }} />
          <stop offset="1" style={{ stopColor: 'var(--ink-800)' }} />
        </linearGradient>
        <radialGradient id="autobahn-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#8FB4E3" stopOpacity="0.5" />
          <stop offset="1" stopColor="#8FB4E3" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="autobahn-beam" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#FFF6DC" stopOpacity="0.9" />
          <stop offset="1" stopColor="#FFF6DC" stopOpacity="0" />
        </radialGradient>
        <clipPath id="autobahn-road"><path d={ROAD} /></clipPath>
      </defs>
      {/* Cold glow over the saddle */}
      <ellipse className="tile-autobahn-glow" cx={VX} cy={HORIZON} rx="40" ry="18" fill="url(#autobahn-glow)" />
      {/* Two hills meeting in the saddle the road runs into */}
      <path className="tile-autobahn-hill" d={`M2 ${GROUND}C14 44 30 28 48 21C58 18 66 21 ${VX} ${HORIZON + 1}C82 21 90 18 100 20C118 26 134 42 146 ${GROUND}Z`} />
      {/* Road with flowing lane dashes, oncoming headlights and receding tail lights */}
      <path fill="url(#autobahn-asphalt)" d={ROAD} />
      <g clipPath="url(#autobahn-road)">
        <path className="tile-autobahn-dash" d={`M${VX} ${HORIZON}L${VX} ${GROUND}`} />
      </g>
      <path className="tile-autobahn-edge" d={`M${VX - 2} ${HORIZON}L42 ${GROUND}M${VX + 2} ${HORIZON}L106 ${GROUND}`} />
      <g className="tile-autobahn-car tile-autobahn-car-in">
        <circle cx="0" cy="0" r="5" fill="url(#autobahn-beam)" />
        <circle className="tile-autobahn-head" cx="-1.6" cy="0" r=".9" />
        <circle className="tile-autobahn-head" cx="1.6" cy="0" r=".9" />
      </g>
      <g className="tile-autobahn-car tile-autobahn-car-out">
        <circle className="tile-autobahn-tail" cx="-1.6" cy="0" r=".8" />
        <circle className="tile-autobahn-tail" cx="1.6" cy="0" r=".8" />
      </g>
      {/* Sign gantry with the blue Autobahn panel */}
      <path className="tile-autobahn-gantry" d={`M57 41.5V16M91 41.5V16M57 17H91`} />
      <rect className="tile-autobahn-sign" x="63" y="11" width="22" height="10" rx="1.4" />
      <path className="tile-autobahn-sign-text" d="M66.5 14.6h9M66.5 17.6h13" />
      {/* Snowy conifers, paler outward */}
      <path className="tile-autobahn-tree tile-autobahn-tree-back" d={conifer(10, 24) + conifer(138, 26)} />
      <path className="tile-autobahn-tree" d={conifer(26, 36) + conifer(122, 38)} />
      <path className="tile-autobahn-tree-snow" d={coniferSnow(26, 36) + coniferSnow(122, 38)} />
      {/* Falling snow and a frost glint on the road */}
      <circle className="tile-autobahn-flake" cx="44" cy="6" r="1" />
      <circle className="tile-autobahn-flake tile-autobahn-flake-b" cx="100" cy="4" r=".9" />
      <circle className="tile-autobahn-flake tile-autobahn-flake-c" cx="70" cy="2" r=".8" />
      <circle className="tile-autobahn-flake tile-autobahn-flake-d" cx="114" cy="8" r="1" />
      <circle className="tile-autobahn-flake tile-autobahn-flake-e" cx="34" cy="10" r=".8" />
      <path className="tile-autobahn-glint" d="M88 49l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" />
      <path className="tile-autobahn-ground" d={`M2 ${GROUND + 0.5}H146`} />
    </svg>
  );
}
