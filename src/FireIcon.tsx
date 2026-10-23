/**
 * Flame glyph of the Waldbrand tile on the start page. Pure SVG + CSS (.tile-flame-*):
 * three nested flame layers flicker out of phase, a soft glow breathes behind them and
 * a few embers rise and fade. A small conifer stand flanks the fire; the two trees next
 * to it catch the firelight on their inner side. No JS, no per-frame work.
 */
const stop = (v: string) => ({ stopColor: `var(${v})` });

const GROUND = 58;

/** Conifer silhouette (three tiers + trunk) standing on the ground line at x. */
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

export default function FireIcon() {
  return (
    <svg className="tile-flame-svg" width="148" height="64" viewBox="0 0 148 64" aria-hidden="true">
      <defs>
        <linearGradient id="flame-outer" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={stop('--amber-500')} />
          <stop offset="0.55" style={stop('--terracotta-500')} />
          <stop offset="1" style={stop('--terracotta-700')} />
        </linearGradient>
        <linearGradient id="flame-inner" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFD27A" />
          <stop offset="1" style={stop('--amber-500')} />
        </linearGradient>
        <radialGradient id="flame-glow" cx="50%" cy="62%" r="50%">
          <stop offset="0" style={stop('--amber-500')} stopOpacity="0.38" />
          <stop offset="1" style={stop('--amber-500')} stopOpacity="0" />
        </radialGradient>
        {/* Firelit trees: sage on the far side, warm towards the flame. */}
        <linearGradient id="fire-tree-lit-l" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.35" style={stop('--sage-600')} />
          <stop offset="1" style={stop('--terracotta-500')} />
        </linearGradient>
        <linearGradient id="fire-tree-lit-r" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0.35" style={stop('--sage-600')} />
          <stop offset="1" style={stop('--terracotta-500')} />
        </linearGradient>
      </defs>
      {/* Own viewport keeps the flame's 64×64 coordinates (CSS transform-origin) unchanged. */}
      <svg x="42" y="0" width="64" height="64" viewBox="0 0 64 64" overflow="visible">
        <circle className="tile-flame-glow" cx="32" cy="38" r="30" fill="url(#flame-glow)" />
        <path
          className="tile-flame-outer"
          fill="url(#flame-outer)"
          d="M32 4C34 14 48 20 48 38C48 50 41 58 32 58C23 58 16 50 16 38C16 30 20 25 24 20C25 25 27 27 29 28C28 20 29 11 32 4Z"
        />
        <path
          className="tile-flame-inner"
          fill="url(#flame-inner)"
          d="M32 26C34 32 41 36 41 44C41 51 37 55 32 55C27 55 23 51 23 44C23 39 26 36 29 33C30 36 31 37 32 38C31 33 31 29 32 26Z"
        />
        <path
          className="tile-flame-core"
          fill="#FFF3D6"
          d="M32 40C34 43 37 45 37 49C37 53 35 55 32 55C29 55 27 53 27 49C27 46 30 44 32 40Z"
        />
        <circle className="tile-flame-ember" cx="24" cy="30" r="1.3" />
        <circle className="tile-flame-ember tile-flame-ember-b" cx="40" cy="28" r="1" />
        <circle className="tile-flame-ember tile-flame-ember-c" cx="33" cy="24" r="1.1" />
      </svg>
      <path className="tile-fire-tree tile-fire-tree-back" d={conifer(9, 28) + conifer(139, 30)} />
      <path className="tile-fire-tree" d={conifer(23, 44) + conifer(125, 46)} />
      <path className="tile-fire-tree-lit" fill="url(#fire-tree-lit-l)" d={conifer(40, 34)} />
      <path className="tile-fire-tree-lit" fill="url(#fire-tree-lit-r)" d={conifer(108, 32)} />
      <path className="tile-fire-ground" d={`M2 ${GROUND + 0.5}H146`} />
    </svg>
  );
}
