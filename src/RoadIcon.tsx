/**
 * Motorway glyph of the Autobahnwetter tile on the start page, reduced like the flame (src/FireIcon.tsx):
 * only the road running in perspective to the horizon and one car seen from behind in the right lane.
 * Pure SVG + CSS (.tile-autobahn-*): the lane dashes flow toward the viewer, the car sways gently and its
 * tail lights glow, a soft glow breathes over the horizon. No JS, no per-frame work.
 */
const GROUND = 58;
const HORIZON = 16;
const VX = 74;

const ROAD = `M${VX - 2} ${HORIZON}H${VX + 2}L122 ${GROUND}H26Z`;

export default function RoadIcon() {
  return (
    <svg className="tile-autobahn-svg" width="148" height="64" viewBox="0 0 148 64" aria-hidden="true">
      <defs>
        <linearGradient id="autobahn-asphalt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--stone-400)' }} stopOpacity="0" />
          <stop offset="0.3" style={{ stopColor: 'var(--stone-500)' }} />
          <stop offset="1" style={{ stopColor: 'var(--stone-600)' }} />
        </linearGradient>
        <linearGradient id="autobahn-car" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5B8FCB" />
          <stop offset="1" style={{ stopColor: 'var(--steel-600)' }} />
        </linearGradient>
        <radialGradient id="autobahn-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#8FB4E3" stopOpacity="0.5" />
          <stop offset="1" stopColor="#8FB4E3" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="autobahn-tail-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#E0554F" stopOpacity="0.55" />
          <stop offset="1" stopColor="#E0554F" stopOpacity="0" />
        </radialGradient>
        <clipPath id="autobahn-road"><path d={ROAD} /></clipPath>
      </defs>
      {/* Soft glow over the horizon */}
      <ellipse className="tile-autobahn-glow" cx={VX} cy={HORIZON + 4} rx="34" ry="14" fill="url(#autobahn-glow)" />
      {/* Road with edge lines and flowing lane dashes */}
      <path fill="url(#autobahn-asphalt)" d={ROAD} />
      <g clipPath="url(#autobahn-road)">
        <path className="tile-autobahn-dash" d={`M${VX} ${HORIZON}L${VX} ${GROUND}`} />
      </g>
      <path className="tile-autobahn-edge" d={`M${VX - 2} ${HORIZON + 4}L28 ${GROUND}M${VX + 2} ${HORIZON + 4}L120 ${GROUND}`} />
      {/* One car from behind in the right lane */}
      <g className="tile-autobahn-car">
        <ellipse className="tile-autobahn-shadow" cx="92" cy="54.6" rx="13" ry="1.6" />
        <path className="tile-autobahn-wheel" d="M81 50h4v4.4h-4zM99 50h4v4.4h-4z" />
        <path fill="url(#autobahn-car)" d="M84.6 38.2C85.2 36.6 86.4 35.8 88 35.8H96C97.6 35.8 98.8 36.6 99.4 38.2L101.2 43C103.4 43.6 104.6 45 104.6 47.2V51.4Q104.6 53 103 53H81Q79.4 53 79.4 51.4V47.2C79.4 45 80.6 43.6 82.8 43Z" />
        <path className="tile-autobahn-window" d="M86.6 38.6C86.9 37.8 87.5 37.4 88.4 37.4H95.6C96.5 37.4 97.1 37.8 97.4 38.6L98.8 42.6H85.2Z" />
        <circle className="tile-autobahn-tail-glow" cx="83.6" cy="46.6" r="4.4" fill="url(#autobahn-tail-glow)" />
        <circle className="tile-autobahn-tail-glow" cx="100.4" cy="46.6" r="4.4" fill="url(#autobahn-tail-glow)" />
        <rect className="tile-autobahn-tail" x="81" y="45.4" width="5" height="2.2" rx="1" />
        <rect className="tile-autobahn-tail" x="98" y="45.4" width="5" height="2.2" rx="1" />
        <rect className="tile-autobahn-plate" x="88.6" y="48.4" width="6.8" height="2.4" rx=".5" />
      </g>
      <path className="tile-autobahn-ground" d={`M2 ${GROUND + 0.5}H146`} />
    </svg>
  );
}
