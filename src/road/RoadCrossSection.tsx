/**
 * AW-8.2 — „Was auf der Fahrbahn liegt“: the schematic cross-section of the boards (own SVG, no nivo — gefahren §nivo):
 * air with temperature, dew point and humidity above; the surface layer (Reif, Eis, Schnee, Wasserfilm, feucht, trocken,
 * unbekannt hatched, nicht gemessen dashed); the asphalt with its temperature. Layer thickness exaggerated, labelled so.
 * The weather above the road is animated after the leading hazard and its level (SVG + CSS only; still under reduced motion);
 * a hazard that only starts later is drawn faint and labelled „ab HH:MM“, without a hazard the surface state gets a calm scene.
 */
import { useId, type CSSProperties, type ReactNode } from 'react';
import type { CrossSection, SurfaceKind } from './roadHzView';
import type { RoadEvidence, RoadHazardId, RoadLevel } from './roadHazards';
import { HZ_SHORT } from './roadHzView';
import { AW_SEV_TINT } from './roadNivoTheme';

/** The hazard the scene shows: now (`at` null) or the first one ahead (`at` = „HH:MM“). */
export interface CrossSectionFx { id: RoadHazardId; lv: RoadLevel; at: string | null; ev: RoadEvidence | null }

export default function RoadCrossSection({ xs, fx = null }: { xs: CrossSection; fx?: CrossSectionFx | null }) {
  const film = Math.max(2, Math.min(9, xs.filmMm * 22));
  const k = xs.kind;
  const cold = xs.station?.rs != null && xs.station.rs <= 0;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const tag = fx && fx.lv > 0 ? `${HZ_SHORT[fx.id]} · ${fx.at ? `ab ${fx.at}` : `Stufe ${fx.lv}`}${fx.at || fx.ev === 'p' ? ' · Prognose' : ''}` : null;
  const tagW = tag ? tag.length * 5.1 + 16 : 0;
  const tint = fx && fx.lv > 0 ? AW_SEV_TINT[fx.lv] : null;
  return (
    <svg viewBox="0 0 338 118" width="100%" role="img" aria-label={`Querschnitt der Fahrbahn: ${xs.label}, ${xs.roadText}${tag ? `; Szene: ${tag}` : ''}`} className="aw-hz-xs">
      <defs>
        <linearGradient id="awSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#EEF3F8" /><stop offset="1" stopColor="#F7F4EC" /></linearGradient>
        <pattern id="awXsHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#EDE6D3" /><rect width="2.5" height="6" fill="#8B8474" /></pattern>
        <clipPath id={`awXsSky${uid}`}><rect x="0" y="0" width="338" height="64" rx="8" /></clipPath>
        <clipPath id={`awXsRoad${uid}`}><rect x="0" y="0" width="338" height="98" /></clipPath>
        <filter id={`awXsBlur${uid}`} x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="4" /></filter>
        <radialGradient id={`awXsSun${uid}`}><stop offset="0" stopColor="#FFF6D6" /><stop offset="0.45" stopColor="#FFD873" /><stop offset="1" stopColor="#FFC24A" stopOpacity="0" /></radialGradient>
      </defs>
      <rect x="0" y="0" width="338" height="64" rx="8" fill="url(#awSky)" />
      <g clipPath={`url(#awXsSky${uid})`} className={`aw-xs-fx${fx?.at ? ' is-ahead' : ''}`}>{sky(fx, k, uid)}</g>
      <text x="10" y="17" fontSize="11" fontWeight="600" fill="#2C2A26">{xs.air}</text>
      <text x="10" y="31" fontSize="10.5" fill="#5C5447">{xs.dew} · {xs.rh}</text>
      <text x="328" y="17" fontSize="9.5" fill="#8B7355" textAnchor="end">{xs.src}</text>
      {tag && tint && (
        <g>
          <rect x={330 - tagW} y="36" width={tagW} height="13" rx="6.5" fill={tint.bg} stroke={tint.border} strokeWidth="0.8" opacity={fx?.at ? 0.85 : 1} />
          <text x={330 - tagW / 2} y="45.4" fontSize="8.6" fontWeight="700" fill={tint.ink} textAnchor="middle">{tag}</text>
        </g>
      )}
      <rect x="0" y="64" width="338" height="34" fill={k === 'nichtgemessen' ? '#4A4740' : cold ? '#3B4A5C' : '#3A3833'} />
      <g fill="#6E6A60" opacity="0.6"><circle cx="30" cy="74" r="1.2" /><circle cx="64" cy="86" r="1.4" /><circle cx="102" cy="78" r="1.1" /><circle cx="141" cy="90" r="1.3" /><circle cx="180" cy="73" r="1.2" /><circle cx="221" cy="85" r="1.4" /><circle cx="262" cy="77" r="1.1" /><circle cx="300" cy="89" r="1.3" /></g>
      <rect x="0" y="98" width="338" height="20" fill="#7A6C55" />
      {k === 'nass' && <g><rect x="0" y={64 - film} width="338" height={film} fill="#5E97D1" opacity="0.85" /><path d="M20 61c8-2 14-2 22 0M120 60c8-2 14-2 22 0M230 61c8-2 14-2 22 0" stroke="#EAF1F7" strokeWidth="1.2" fill="none" /></g>}
      {k === 'feucht' && <rect x="0" y="62" width="338" height="2" fill="#5E97D1" opacity="0.7" />}
      {k === 'reif' && <g><rect x="0" y="60" width="338" height="4" fill="#E4EEF7" /><path d="M8 60l3-5 3 5M26 60l2-4 2 4M44 60l3-6 3 6M63 60l2-4 2 4M80 60l3-5 3 5M99 60l2-4 2 4M117 60l3-6 3 6M136 60l2-4 2 4M154 60l3-5 3 5M173 60l2-4 2 4M191 60l3-6 3 6M210 60l2-4 2 4M228 60l3-5 3 5M247 60l2-4 2 4M265 60l3-6 3 6M284 60l2-4 2 4M302 60l3-5 3 5M321 60l2-4 2 4" stroke="#9FBEDC" strokeWidth="1.2" fill="none" strokeLinejoin="round" /></g>}
      {k === 'eis' && <g><rect x="0" y="58" width="338" height="6" fill="#CFE2F3" /><path d="M14 60l40 0M90 61l60 0M200 60l50 0" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" /></g>}
      {k === 'schnee' && <path d="M0 64V55c12-4 24 2 36-1s24-4 36 0 24 3 36-1 24-3 36 1 24 2 36-1 24-3 36 0 24 3 36 0 24-2 36 0 24 2 34 0V64z" fill="#FFFFFF" stroke="#D9E3EE" strokeWidth="1" />}
      {k === 'unbekannt' && <g><rect x="0" y="58" width="338" height="6" fill="url(#awXsHatch)" /><text x="169" y="52" fontSize="10.5" fontWeight="700" fill="#5C5447" textAnchor="middle">?</text></g>}
      {k === 'nichtgemessen' && <rect x="0.6" y="58.6" width="336.8" height="5" fill="none" stroke="#9A5A2A" strokeWidth="1.2" strokeDasharray="4 3" />}
      {k === 'trocken' && <rect x="282" y="76" width="16" height="6" rx="1.5" fill="#E9E4D6" />}
      <g clipPath={`url(#awXsRoad${uid})`} className={`aw-xs-fx${fx?.at ? ' is-ahead' : ''}`}>{surfaceFx(fx, k, film)}</g>
      <text x="10" y="54" fontSize="10.5" fontWeight="700" fill="#1F3F6E">{xs.label}</text>
      <text x="10" y="86" fontSize="13" fontWeight="700" fill="#FAF6EA">{xs.roadText}</text>
      <text x="328" y="112" fontSize="9" fill="#EDE6D3" textAnchor="end">Querschnitt schematisch, Schichtdicke überhöht</text>
    </svg>
  );
}

// --- scene ------------------------------------------------------------------------------------------------

/** Deterministic 0…1 per element and channel — the same scene on every render. */
const rnd = (i: number, ch: number) => { const v = Math.sin(i * 12.9898 + ch * 78.233) * 43758.5453; return v - Math.floor(v); };
/** Count, duration factor and opacity per level (1 faint, 3 dense and fast). */
const N = (lv: RoadLevel, base: readonly [number, number, number]) => base[Math.max(0, lv - 1)];
const SPEED: Record<RoadLevel, number> = { 0: 1.2, 1: 1, 2: 0.78, 3: 0.6 };
const anim = (dur: number, i: number, extra?: Record<string, string>): CSSProperties =>
  ({ animationDuration: `${dur.toFixed(2)}s`, animationDelay: `${(-rnd(i, 9) * dur).toFixed(2)}s`, ...extra }) as CSSProperties;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
/** Overcast veil over the sky gradient, so light precipitation keeps its contrast. */
const veil = (fill: string, op: number) => <rect x="0" y="0" width="338" height="64" fill={fill} opacity={op} />;

function rain(n: number, lv: RoadLevel, color: string, len: number, seed = 0): ReactNode {
  return range(n).map((i) => {
    const x = 6 + rnd(i + seed, 1) * 340, y = rnd(i + seed, 2) * 54, d = (0.55 + rnd(i + seed, 3) * 0.25) * SPEED[lv];
    return <line key={`r${i}`} className="aw-xs-rain" x1={x} y1={y} x2={x - 2.4} y2={y + len} stroke={color} strokeWidth={lv >= 3 ? 1.3 : 1.1} strokeLinecap="round"
      style={anim(d, i + seed, { '--y0': `${-(y + len + 4)}px`, '--y1': `${64 - y}px` })} />;
  });
}
function streaks(n: number, lv: RoadLevel, color: string, seed = 0): ReactNode {
  return range(n).map((i) => {
    const x = rnd(i + seed, 1) * 338, y = 5 + rnd(i + seed, 2) * 54, w = 22 + rnd(i + seed, 3) * 40, d = (1.6 + rnd(i + seed, 4)) * SPEED[lv] * 1.4;
    return <line key={`w${i}`} className="aw-xs-wind" x1={x} y1={y} x2={x + w} y2={y} stroke={color} strokeWidth={0.9 + lv * 0.25} strokeLinecap="round"
      style={anim(d, i + seed, { '--x0': `${-(x + w + 6)}px`, '--x1': `${344 - x}px` })} />;
  });
}
function sparkles(n: number, y0: number, y1: number, color: string, seed = 0): ReactNode {
  return range(n).map((i) => (
    <g key={`s${i}`} transform={`translate(${(6 + rnd(i + seed, 1) * 326).toFixed(1)} ${(y0 + rnd(i + seed, 2) * (y1 - y0)).toFixed(1)}) scale(${(0.7 + rnd(i + seed, 3) * 0.7).toFixed(2)})`}>
      <path className="aw-xs-twinkle" d="M0-3.2L.8-.8 3.2 0 .8.8 0 3.2-.8.8-3.2 0-.8-.8Z" fill={color} stroke="#6F98C2" strokeWidth="0.5" style={anim(1.6 + rnd(i + seed, 4) * 1.8, i + seed)} />
    </g>
  ));
}
function cloud(x: number, y: number, s: number, fill: string, i: number, dur: number): ReactNode {
  return (
    <g key={`c${i}`} transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="aw-xs-cloud" style={anim(dur, i)}>
        <ellipse cx="0" cy="0" rx="22" ry="9" fill={fill} /><ellipse cx="-12" cy="2" rx="13" ry="7" fill={fill} /><ellipse cx="13" cy="1" rx="15" ry="8" fill={fill} /><ellipse cx="2" cy="-6" rx="12" ry="8" fill={fill} />
      </g>
    </g>
  );
}

/** Above the road: precipitation, fog, wind, sun, heat — after the hazard; a calm scene after the surface state otherwise. */
function sky(fx: CrossSectionFx | null, kind: SurfaceKind, uid: string): ReactNode {
  if (!fx || fx.lv === 0) {
    if (kind === 'trocken') return <>{cloud(250, 14, 0.7, '#FFFFFF', 0, 26)}{cloud(120, 9, 0.5, '#FFFFFF', 1, 34)}</>;
    if (kind === 'nass' || kind === 'feucht') return <>{cloud(230, 12, 0.8, '#E1E6EC', 0, 30)}{cloud(90, 8, 0.6, '#E7EBF0', 1, 38)}</>;
    return null;
  }
  const lv = fx.lv;
  switch (fx.id) {
    case 'aqua':
      return <>{veil('#C4CED8', 0.25 + lv * 0.08)}{cloud(270, 6, 1.1, '#C9D2DC', 0, 28)}{cloud(110, 4, 1, '#D2DAE2', 1, 34)}{rain(N(lv, [16, 28, 44]), lv, '#5E87B3', 9)}</>;
    case 'glatteis':
      return <>{veil('#C4CED8', 0.25 + lv * 0.08)}{cloud(210, 5, 1.1, '#CDD5DE', 0, 30)}{rain(N(lv, [10, 18, 28]), lv, '#7FA6CF', 7)}</>;
    case 'gewitter':
      return (
        <>
          {veil('#7F8A96', 0.2 + lv * 0.1)}
          <rect className="aw-xs-flash" x="0" y="0" width="338" height="64" fill="#FFFFFF" style={anim(N(lv, [7, 4.6, 3]), 3)} />
          {cloud(240, 4, 1.4, '#7E8792', 0, 24)}{cloud(90, 2, 1.2, '#8C949E', 1, 30)}
          <path className="aw-xs-bolt" d="M232 12l-9 17h8l-6 16 16-21h-9l7-12z" fill="#FFE27A" stroke="#E0A800" strokeWidth="0.6" style={anim(N(lv, [7, 4.6, 3]), 3)} />
          {rain(N(lv, [12, 22, 34]), lv, '#6D86A0', 9)}
        </>
      );
    case 'hagel':
      return (
        <>
          {veil('#8E98A4', 0.2 + lv * 0.08)}
          {cloud(220, 4, 1.3, '#8E98A4', 0, 26)}
          {range(N(lv, [8, 15, 24])).map((i) => {
            const x = 8 + rnd(i, 1) * 322, y = rnd(i, 2) * 50, r = 1.3 + rnd(i, 3) * (0.6 + lv * 0.45);
            return <circle key={i} className="aw-xs-hail" cx={x} cy={y} r={r} fill="#FFFFFF" stroke="#AFC3D6" strokeWidth="0.6"
              style={anim((0.75 + rnd(i, 4) * 0.3) * SPEED[lv], i, { '--y0': `${-(y + 6)}px`, '--y1': `${61 - r - y}px` })} />;
          })}
        </>
      );
    case 'schnee':
      return (
        <>
          {veil('#C9D3DD', 0.35 + lv * 0.1)}
          {cloud(250, 4, 1, '#DCE3EA', 0, 32)}
          {range(N(lv, [14, 26, 42])).map((i) => {
            const x = 6 + rnd(i, 1) * 330, y = rnd(i, 2) * 56, r = 1 + rnd(i, 3) * (0.9 + lv * 0.3);
            return <circle key={i} className="aw-xs-snow" cx={x} cy={y} r={r} fill="#FFFFFF" stroke="#93A8BE" strokeWidth="0.6"
              style={anim((3.2 + rnd(i, 4) * 1.8) * SPEED[lv] * (lv >= 3 ? 0.8 : 1), i, { '--y0': `${-(y + 4)}px`, '--y1': `${62 - y}px` })} />;
          })}
          {lv >= 2 && streaks(N(lv, [0, 3, 6]), lv, '#FFFFFF', 40)}
        </>
      );
    case 'nebel':
      return <>{veil('#D5DBE1', [0, 0.3, 0.45, 0.6][lv])}{range(N(lv, [3, 5, 7])).map((i) => (
        <ellipse key={i} className="aw-xs-fog" cx={20 + rnd(i, 1) * 300} cy={22 + rnd(i, 2) * 40} rx={90 + rnd(i, 3) * 60} ry={7 + rnd(i, 4) * 6 + lv * 1.5}
          fill="#B9C2CB" opacity={[0, 0.6, 0.72, 0.85][lv]} filter={`url(#awXsBlur${uid})`} style={anim(9 + rnd(i, 5) * 7, i)} />
      ))}</>;
    case 'gischt':
      return <>{veil('#C4CED8', 0.25 + lv * 0.08)}{cloud(240, 6, 0.9, '#D5DCE3', 0, 30)}{rain(N(lv, [8, 14, 14]), lv, '#7E9BB8', 7)}</>;
    case 'sonne':
      return (
        <g transform="translate(300 60)">
          <circle r={26 + lv * 6} fill={`url(#awXsSun${uid})`} className="aw-xs-glow" style={anim(4, 1)} />
          <g className="aw-xs-rays" style={anim(24, 2)}>
            {range(10 + lv * 2).map((i) => { const a = (i / (10 + lv * 2)) * Math.PI * 2; return <line key={i} x1={Math.cos(a) * 14} y1={Math.sin(a) * 14} x2={Math.cos(a) * (24 + lv * 6)} y2={Math.sin(a) * (24 + lv * 6)} stroke="#FFD25A" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />; })}
          </g>
          <circle r="10" fill="#FFE07A" stroke="#F2B630" strokeWidth="1" />
        </g>
      );
    case 'quer':
      return <>{streaks(N(lv, [7, 12, 18]), lv, '#5F7488')}{lv >= 3 && cloud(240, 6, 1, '#B8C2CC', 0, 10)}</>;
    case 'baum':
      return (
        <>
          {streaks(N(lv, [6, 10, 10]), lv, '#6E8194')}
          {range(N(lv, [5, 9, 9])).map((i) => {
            const y = 8 + rnd(i, 2) * 50, x = rnd(i, 1) * 338, d = (2 + rnd(i, 3) * 1.4) * SPEED[lv];
            return (
              <g key={`l${i}`} className="aw-xs-leaf" style={anim(d, i + 20, { '--x0': `${-(x + 10)}px`, '--x1': `${348 - x}px` })}>
                <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
                  <path className="aw-xs-spin" d="M-4 0C-2-3 2-3 4 0 2 3-2 3-4 0Z" fill={i % 3 ? '#8A9A3C' : '#B07A2E'} style={anim(0.9 + rnd(i, 4), i)} />
                </g>
              </g>
            );
          })}
        </>
      );
    case 'staub':
      return (
        <>
          <rect x="0" y="0" width="338" height="64" fill="#D9B98A" opacity="0.3" />
          {range(34).map((i) => {
            const x = rnd(i, 1) * 338, y = 4 + rnd(i, 2) * 58, d = 3 + rnd(i, 3) * 2.5;
            return <circle key={i} className="aw-xs-dust" cx={x} cy={y} r={0.7 + rnd(i, 4) * 1.1} fill="#8E6A3A" opacity="0.75" style={anim(d, i, { '--x0': `${-(x + 4)}px`, '--x1': `${342 - x}px` })} />;
          })}
        </>
      );
    case 'blowup':
      return (
        <>
          <rect x="0" y="0" width="338" height="64" fill="#F7C98A" opacity={0.12 + lv * 0.08} />
          {range(N(lv, [5, 8, 12])).map((i) => (
            <path key={i} className="aw-xs-heat" d={`M${(10 + rnd(i, 1) * 318).toFixed(1)} 62q3-4 0-8t0-8q3-4 0-8`} stroke="#E39A4F" strokeWidth="1.1" fill="none" strokeLinecap="round" style={anim(2.4 + rnd(i, 2) * 1.4, i)} />
          ))}
        </>
      );
    case 'sturz':
      return (
        <>
          <rect className="aw-xs-chill" x="0" y="0" width="338" height="64" fill="#BFD6EE" style={anim(5, 1)} />
          {range(N(lv, [5, 8, 12])).map((i) => {
            const x = 10 + rnd(i, 1) * 318, y = rnd(i, 2) * 50;
            return <path key={i} className="aw-xs-fall" d={`M${(x - 4).toFixed(1)} ${y.toFixed(1)}l4 4 4-4`} stroke="#6D93BD" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round"
              style={anim((2.2 + rnd(i, 3)) * SPEED[lv], i, { '--y0': `${-(y + 6)}px`, '--y1': `${60 - y}px` })} />;
          })}
        </>
      );
    case 'frost1':
      return <><rect className="aw-xs-chill" x="0" y="0" width="338" height="64" fill="#CFE0F0" style={anim(6, 1)} />{sparkles(N(lv, [6, 10, 10]), 6, 50, '#9FBEDC')}</>;
    case 'reif':
      return <><rect className="aw-xs-chill" x="0" y="0" width="338" height="64" fill="#D6E4F2" style={anim(6, 1)} />{sparkles(N(lv, [4, 7, 10]), 8, 48, '#CFE0F0', 20)}</>;
    case 'nass':
      return <>{cloud(240, 8, 0.8, '#DCE2E8', 0, 34)}<rect className="aw-xs-chill" x="0" y="0" width="338" height="64" fill="#D3E1EF" style={anim(6, 1)} /></>;
    default:
      return null;
  }
}

/** On the surface: splashes, spray, sparkles of freezing water, the sheen of a film — after the hazard or the surface state. */
function surfaceFx(fx: CrossSectionFx | null, kind: SurfaceKind, film: number): ReactNode {
  const top = kind === 'nass' ? 64 - film : kind === 'schnee' ? 56 : kind === 'eis' ? 58 : kind === 'reif' ? 60 : 62;
  const sheen = (kind === 'nass' || kind === 'feucht') && (
    <rect className="aw-xs-sheen" x="-60" y={top} width="60" height={64 - top} fill="#FFFFFF" opacity="0.35" style={anim(5.5, 2)} />
  );
  if (!fx || fx.lv === 0) {
    if (kind === 'eis' || kind === 'reif' || kind === 'schnee') return sparkles(5, top - 2, top + 2, '#FFFFFF', 70);
    return sheen || null;
  }
  const lv = fx.lv;
  const splashes = (n: number, color: string) => range(n).map((i) => (
    <ellipse key={`p${i}`} className="aw-xs-ripple" cx={8 + rnd(i, 6) * 322} cy={top + 0.5} rx={3 + lv} ry="1.1" fill="none" stroke={color} strokeWidth="0.9" style={anim(0.9 + rnd(i, 7) * 0.6, i + 30)} />
  ));
  switch (fx.id) {
    case 'aqua': return <>{sheen}{splashes(N(lv, [6, 10, 16]), '#EAF2FA')}</>;
    case 'gewitter': return <>{sheen}{splashes(N(lv, [5, 8, 12]), '#E6EEF6')}</>;
    case 'glatteis': return <>{splashes(N(lv, [4, 7, 10]), '#EAF2FA')}{sparkles(N(lv, [5, 9, 14]), top - 2, top + 2, '#FFFFFF', 50)}</>;
    case 'hagel': return sparkles(N(lv, [3, 5, 8]), top - 2, top + 1, '#FFFFFF', 50);
    case 'schnee': return sparkles(N(lv, [3, 5, 8]), top - 2, top + 1, '#FFFFFF', 50);
    case 'gischt':
      return range(N(lv, [7, 12, 12])).map((i) => (
        <g key={i} transform={`translate(${(10 + rnd(i, 1) * 318).toFixed(1)} ${top})`}>
          <circle className="aw-xs-spray" r={5 + rnd(i, 2) * 4} fill="#A3B5C6" style={anim(2 + rnd(i, 3) * 1.4, i)} />
        </g>
      ));
    case 'reif': return sparkles(N(lv, [8, 14, 22]), top - 4, top + 2, '#FFFFFF', 50);
    case 'nass': return <>{sheen}{sparkles(N(lv, [5, 10, 16]), top - 2, top + 2, '#FFFFFF', 50)}</>;
    case 'frost1': return sparkles(N(lv, [3, 6, 6]), top - 2, top + 2, '#FFFFFF', 50);
    case 'sonne': return <rect className="aw-xs-glare" x="200" y={top - 2} width="138" height={66 - top} fill="#FFF1C2" style={anim(4, 1)} />;
    case 'blowup': return null;
    default: return sheen || null;
  }
}
