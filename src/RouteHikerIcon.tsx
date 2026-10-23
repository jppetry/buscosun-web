/**
 * Route line of the Tourenplanung tile on the start page with a small hiker walking along it, in the flat style of
 * the flame, glacier, coast and motorway glyphs. The route keeps its former shape (y squeezed so the svg scales
 * uniformly at the desktop width instead of stretching the hiker). The hiker follows the line by SMIL
 * animateMotion and fades in and out at the ends; legs, arm and pole swing by CSS (.tile-hiker-*), the body bobs
 * and a warm glow walks with him. No JS, no per-frame work.
 */
const ROUTE = 'M0 39.5L70 26.8L140 33.8L210 12.7L290 22.6L360 15.5L440 28.2L520 8.5';

export default function RouteHikerIcon() {
  return (
    <svg viewBox="0 -9 520 58.5" className="tile-route-svg" aria-hidden="true">
      <defs>
        <linearGradient id="hiker-pack" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E6BC8E" />
          <stop offset="1" style={{ stopColor: 'var(--terracotta-500)' }} />
        </linearGradient>
        <radialGradient id="hiker-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" style={{ stopColor: 'var(--amber-500)' }} stopOpacity="0.4" />
          <stop offset="1" style={{ stopColor: 'var(--amber-500)' }} stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d={ROUTE} fill="none" stroke="var(--amber-500)" strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="210" cy="12.7" r="3.6" fill="var(--terracotta-500)" />
      <circle cx="440" cy="28.2" r="3.6" fill="var(--steel-600)" />
      <g>
        <animateMotion dur="16s" repeatCount="indefinite" path={ROUTE} calcMode="linear" />
        <animate attributeName="opacity" dur="16s" repeatCount="indefinite" values="0;1;1;0" keyTimes="0;0.05;0.95;1" />
        <ellipse className="tile-hiker-glow" cx="0" cy="-11" rx="17" ry="15" fill="url(#hiker-glow)" />
        <g className="tile-hiker" transform="scale(1.5)">
          <g className="tile-hiker-body">
            <path className="tile-hiker-leg" d="M0 -6.5V0" />
            <path className="tile-hiker-leg tile-hiker-leg-b" d="M0 -6.5V0" />
            <rect fill="url(#hiker-pack)" x="-3.1" y="-12.2" width="3" height="5.6" rx="1.1" />
            <path className="tile-hiker-torso" d="M0 -6.5L.8 -11.6" />
            <circle className="tile-hiker-head" cx="1.3" cy="-13.6" r="1.7" />
            <path className="tile-hiker-cap" d="M-.4 -14.4Q1.3 -16.2 3 -14.4L3.9 -14.2" />
            <g className="tile-hiker-arm">
              <path className="tile-hiker-limb" d="M.8 -10.8L3 -8" />
              <path className="tile-hiker-pole" d="M3 -9.2L4.4 0" />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
