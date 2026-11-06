/**
 * Phase DV — „Fahrerblick“ (audit/autobahn-fahrerblick.md): the second picture of „Was auf der Fahrbahn liegt“, behind
 * `ROAD_XS_VIEW` / `?xsview=driver` (`roadFlag.ts`). A stylised view from the driver's seat onto the motorway: the ROAD
 * shows the measured surface state (sensor truth — a hazard never repaints it), the WEATHER shows the leading hazard and
 * its level. Same props as `RoadCrossSection`, pure SVG + CSS (`aw-dv-*` in roadDeck.css), no dependency, no WebGL.
 *
 * Three planes:
 *   1 the still picture — one SVG (`role="img"`) without any animation, so its noise filters are painted once per scene;
 *   2 the weather — above it, `aria-hidden`: every precipitation / wind / dust layer is a small SVG of its own with one
 *     pattern-filled rect; the SVG ELEMENT is moved by exactly one tile per cycle (compositor only, seamless);
 *   3 the HUD — HTML over the picture (never below 12 px): air, dew point, humidity, source, hazard tag, road text, state
 *     chip and the honesty note „Fahrerblick stilisiert, kein Kamerabild“.
 * „unbekannt“ and „nicht gemessen“ are NOT painted as a state (hatch veil / desaturated road with a dashed outline).
 * Design reference: reference/fahrerblick/FahrerblickSzene.dc.html (geometry, layer order, colours, recipes).
 */
import { memo, useId, type CSSProperties, type ReactNode } from 'react';
import type { CrossSection, SurfaceKind } from './roadHzView';
import { HZ_SHORT } from './roadHzView';
import type { RoadHazardId, RoadLevel } from './roadHazards';
import { AW_SEV_TINT } from './roadNivoTheme';
import { rnd, type CrossSectionFx } from './RoadCrossSection';

// --- camera & geometry (computed once) ------------------------------------------------------------------------

/** viewBox 0 0 520 292: horizon H, bottom B, vanishing point VX. The driver sits in the right lane. */
const W = 520, VH = 292, H = 120, B = 292, VX = 268, TOP = H + 1.5;
const ROAD_L = -340, ROAD_R = 600;
const f = (n: number) => n.toFixed(1);
/** Ground mapping: `xb` is the x of a road-fixed line at the bottom edge, `y` the screen row. */
const xAt = (xb: number, y: number) => VX + ((xb - VX) * (y - H)) / (B - H);
/** Screen row of the depth `z` (1 = bottom edge). */
const yAtZ = (z: number) => H + (B - H) / z;
const pt = (x: number, y: number) => `${f(x)},${f(y)}`;
const strip = (xb: number, wb: number, y0: number, y1: number) =>
  [pt(xAt(xb - wb / 2, y0), y0), pt(xAt(xb + wb / 2, y0), y0), pt(xAt(xb + wb / 2, y1), y1), pt(xAt(xb - wb / 2, y1), y1)].join(' ');
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

interface Box { x: string; y: string; w: string; h: string }
interface Ell { cx: string; cy: string; rx: string; ry: string }

const G = (() => {
  const RAIL_Z = [1.05, 1.4, 2, 3, 5, 8, 14, 30, 80];
  const band = (xb: number, a: number, b: number) =>
    RAIL_Z.map((z) => { const y = yAtZ(z); return pt(xAt(xb, y), y + a / z); })
      .concat(RAIL_Z.slice().reverse().map((z) => { const y = yAtZ(z); return pt(xAt(xb, y), y + b / z); })).join(' ');
  const posts: Box[] = [], postRefl: Box[] = [];
  for (const xb of [640, -420]) {
    for (const z of [1.15, 1.6, 2.2, 3, 4.1, 5.6, 7.6, 10.5, 14.5, 20, 28, 40]) {
      const yg = yAtZ(z), x = xAt(xb, yg), h = 50 / z, w = Math.max(0.8, 6 / z);
      posts.push({ x: f(x - w / 2), y: f(yg - h), w: f(w), h: f(h) });
      postRefl.push({ x: f(x - w / 2), y: f(yg), w: f(w * 1.3), h: f(h * 0.9) });
    }
  }
  const bank = (xb: number, side: number) => {
    const zs = [1, 1.5, 2.2, 3.4, 5, 8, 14, 40];
    return zs.map((z) => { const y = yAtZ(z); return pt(xAt(xb, y), y); })
      .concat(zs.slice().reverse().map((z) => { const y = yAtZ(z); return pt(xAt(xb + side * 60, y), y - 14 / z); })).join(' ');
  };
  const dashes: string[] = [];
  for (let z = 1.02; z < 60; z += 2.4) dashes.push(strip(150, 9, yAtZ(z), yAtZ(z + 1)));
  const ell = (n: number, at: (i: number) => [number, number, number, number]): Ell[] =>
    range(n).map((i) => { const [cx, cy, rx, ry] = at(i); return { cx: f(cx), cy: f(cy), rx: f(rx), ry: f(ry) }; });
  // puddles in the wheel tracks of the own lane (state „nass“) and scattered ones (hazard Aquaplaning)
  const puddles = ell(9, (i) => { const z = 1.1 + rnd(i, 1) * 5, y = yAtZ(z); return [xAt((rnd(i, 2) > 0.5 ? 262 : 452) + (rnd(i, 3) - 0.5) * 30, y), y, 46 / z, 5 / z]; });
  const puddles2 = ell(14, (i) => { const z = 1.05 + rnd(i, 31) * 7, y = yAtZ(z); return [xAt(-100 + rnd(i, 32) * 600, y), y, 70 / z, 6 / z]; });
  const glints = ell(18, (i) => { const z = 1.05 + rnd(i, 4) * 7, y = yAtZ(z); return [xAt(150 + rnd(i, 5) * 400, y), y, 14 / z + 1, 0.8 / z + 0.4]; });
  const rings = range(26).map((i) => { const z = 1.05 + rnd(i, 6) * 4, y = yAtZ(z); return { cx: f(xAt(-200 + rnd(i, 7) * 760, y)), cy: f(y), rx: f(9 / z), ry: f(1.6 / z), d: 0.6 + rnd(i, 33) * 0.7 }; });
  const cracks = range(7).map((i) => {
    let x = 120 + rnd(i, 8) * 300, y = 220 + rnd(i, 9) * 70;
    const pts = [pt(x, y)];
    for (let j = 0; j < 4; j++) { x += (rnd(i * 7 + j, 10) - 0.5) * 50; y += (rnd(i * 7 + j, 11) - 0.6) * 18; pts.push(pt(x, y)); }
    return pts.join(' ');
  });
  const sparks = range(22).map((i) => {
    const z = 1.05 + rnd(i, 34) * 6, y = yAtZ(z), x = xAt(-250 + rnd(i, 35) * 820, y), s = Math.max(0.4, 1.4 / Math.sqrt(z));
    return { t: `translate(${f(x)} ${f(y)}) scale(${s.toFixed(2)})`, d: 1.2 + rnd(i, 36) * 1.8 };
  });
  const hailRoad = range(70).map((i) => { const z = 1.02 + rnd(i, 37) * 4, y = yAtZ(z); return { x: f(xAt(-300 + rnd(i, 38) * 880, y)), y: f(y), r: f(Math.max(0.5, 2.2 / z)) }; });
  const roadLeaves = range(16).map((i) => { const z = 1.1 + rnd(i, 39) * 5, y = yAtZ(z); return { x: f(xAt(-200 + rnd(i, 40) * 760, y)), y: f(y), rx: f(5 / z + 0.6), ry: f(2 / z + 0.3), c: i % 3 ? '#8A7A34' : '#A86E2A' }; });
  let trees = 'M300 118';
  for (let x = 300; x <= 520; x += 7) trees += ` L${x} ${f(118 - 5 - rnd(x, 17) * 9)} L${x + 3.5} ${f(118 - 2 - rnd(x, 18) * 4)}`;
  trees += ' L520 120 L300 120 Z';
  const joints = [1.3, 1.9, 2.7, 3.8, 5.4, 7.5, 11, 16].map((z) => { const y = yAtZ(z); return `${pt(xAt(ROAD_L, y), y)} ${pt(xAt(ROAD_R, y), y)}`; });
  // Blow-up: one slab of the own lane raised by `rise` units (per level), with its shadow on the near side.
  const ry0 = yAtZ(2.08), ry1 = yAtZ(2.0);
  const ridge = (rise: number) => [pt(xAt(150, ry1), ry1), pt(xAt(560, ry1), ry1), pt(xAt(560, ry0) + 2, ry0 - rise), pt(xAt(150, ry0), ry0 - rise)].join(' ');
  const ridgeShadow = [pt(xAt(150, ry1), ry1), pt(xAt(560, ry1), ry1), pt(xAt(560, ry1 + 4), ry1 + 4), pt(xAt(150, ry1 + 4), ry1 + 4)].join(' ');
  const by = yAtZ(2.3);
  const branches = [
    { pts: [pt(xAt(230, by), by), pt(xAt(330, by - 2), by - 2), pt(xAt(420, by + 1), by + 1)].join(' '), sw: 3 },
    { pts: [pt(xAt(300, by - 1), by - 1), pt(xAt(330, by - 8), by - 8)].join(' '), sw: 1.6 },
    { pts: [pt(xAt(380, by), by), pt(xAt(400, by + 6), by + 6)].join(' '), sw: 1.4 },
  ];
  // The lorry ahead in the own lane (hazard Gischt), z ≈ 3.6.
  const tz = 3.6, tyg = yAtZ(tz), tcx = xAt(355, tyg), tw = 270 / tz, th = 300 / tz;
  const truck = {
    cx: f(tcx), yg: f(tyg), x: f(tcx - tw / 2), y: f(tyg - th), w: f(tw), h: f(th), sx: f(tw * 0.6),
    ix: f(tcx - tw / 2 + 3), iy: f(tyg - th + 3), iw: f(tw - 6), ih: f(th * 0.78), iyb: f(tyg - th + 3 + th * 0.78),
    by: f(tyg - th * 0.12), bh: f(th * 0.08), l1x: f(tcx - tw / 2 + 2), l2x: f(tcx + tw / 2 - 2 - tw * 0.1), lw: f(tw * 0.1),
    ly: f(tyg - th * 0.19), lh: f(th * 0.05), px: f(tcx - tw * 0.12), py: f(tyg - th * 0.18), pw: f(tw * 0.24), ph: f(th * 0.05), rh: f(th * 0.55),
  };
  const spray = range(7).map((i) => {
    const t = i / 6;
    return { cx: f(tcx + (i % 2 ? 1 : -1) * tw * 0.25 * (1 - t * 0.3)), cy: f(tyg - 6 + t * 40), rx: f(tw * (0.35 + t * 0.6)), ry: f(th * (0.14 + t * 0.12)), op: (0.85 - t * 0.45).toFixed(2) };
  });
  // Windsock on the right verge (hazard Seitenwind): droop 55° / 25° / 6° by level, five red/white rings.
  const sz = 2.4, syg = yAtZ(sz), spx = xAt(700, syg), spy = syg - 120 / sz;
  const sockParts = (lv: number) => {
    const a = ([55, 55, 25, 6][lv] * Math.PI) / 180, d = [-Math.cos(a), Math.sin(a)], n = [d[1], -d[0]], L = 30;
    return range(5).map((i) => {
      const t0 = i / 5, t1 = (i + 1) / 5, r0 = 5.5 - 3 * t0, r1 = 5.5 - 3 * t1;
      const c0 = [spx + d[0] * L * t0, spy + d[1] * L * t0], c1 = [spx + d[0] * L * t1, spy + d[1] * L * t1];
      return { pts: [pt(c0[0] + n[0] * r0, c0[1] + n[1] * r0), pt(c1[0] + n[0] * r1, c1[1] + n[1] * r1), pt(c1[0] - n[0] * r1, c1[1] - n[1] * r1), pt(c0[0] - n[0] * r0, c0[1] - n[1] * r0)].join(' '), c: i % 2 ? '#F6F2EA' : '#D2452F' };
    });
  };
  return {
    road: [pt(xAt(ROAD_L, B), B), pt(xAt(ROAD_R, B), B), pt(xAt(ROAD_R, TOP), TOP), pt(xAt(ROAD_L, TOP), TOP)].join(' '),
    vergeR: [pt(xAt(ROAD_R, B), B), pt(W, B), pt(W, TOP), pt(xAt(ROAD_R, TOP), TOP)].join(' '),
    vergeL: [pt(0, B), pt(xAt(ROAD_L, B), B), pt(xAt(ROAD_L, TOP), TOP), pt(0, TOP)].join(' '),
    edgeR: strip(560, 11, B, TOP), edgeL: strip(-300, 11, B, TOP), dashes,
    tracks: [strip(262, 64, B, TOP), strip(452, 64, B, TOP), strip(-130, 64, B, TOP), strip(50, 64, B, TOP)],
    ruts: [strip(250, 18, B, TOP), strip(276, 18, B, TOP), strip(440, 18, B, TOP), strip(466, 18, B, TOP)],
    railR: band(640, -46, -36), railL: band(-420, -46, -36), railReflR: band(640, 36, 46), railReflL: band(-420, 36, 46),
    posts, postRefl, bankR: bank(610, 1), bankL: bank(-350, -1),
    puddles, puddles2, glints, rings, cracks, sparks, hailRoad, roadLeaves, trees, joints, ridge: ['', ridge(2), ridge(3), ridge(4.5)], ridgeShadow, branches,
    truck, spray, sock: { x: f(spx), yg: f(syg), top: f(spy), origin: `${f(spx)}px ${f(spy)}px`, parts: [sockParts(1), sockParts(1), sockParts(2), sockParts(3)] },
    glare: `${VX - 5},${TOP} ${VX + 5},${TOP} ${VX + 170},${B} ${VX - 170},${B}`,
  };
})();

// --- recipes: surface kinds (sensor truth) --------------------------------------------------------------------

/** Sky keys: S snow/neutral, G gray, D dark, C clear, K cold, U low sun, T dust. */
type SkyKey = 'S' | 'G' | 'D' | 'C' | 'K' | 'U' | 'T';
const SKY: Readonly<Record<SkyKey, ReadonlyArray<readonly [number, string]>>> = {
  S: [[0, '#BFC6CD'], [1, '#ECEEF0']],
  G: [[0, '#8F99A4'], [1, '#D6DADE']],
  D: [[0, '#4E5762'], [0.7, '#7D8691'], [1, '#A9B0B7']],
  C: [[0, '#7FA9D3'], [0.75, '#C9DCEC'], [1, '#EEF2F2']],
  K: [[0, '#9DBBDA'], [0.8, '#DCE7F1'], [1, '#F3F6F9']],
  U: [[0, '#8FA9C4'], [0.55, '#E9C9A0'], [1, '#FBE3B8']],
  T: [[0, '#B9A27E'], [1, '#E6D3B0']],
};

interface KindLook {
  sky: SkyKey;
  /** Dark film, sky reflection (Fresnel), mirrored posts/rails, puddles in the wheel tracks: 0…1. */
  dark: number; refl: number; reflP: number; pud: number;
  frost: boolean; ice: boolean; snow: boolean; mark: boolean;
  hillSnow: number; vergeWhite: number;
  /** Not a state: hatch veil (unknown) / desaturated road with a dashed outline (not measured). */
  hatch: boolean; desat: number; dash: boolean;
}
const K0: KindLook = { sky: 'C', dark: 0, refl: 0, reflP: 0, pud: 0, frost: false, ice: false, snow: false, mark: true, hillSnow: 0, vergeWhite: 0, hatch: false, desat: 0, dash: false };
const KIND: Readonly<Record<SurfaceKind, KindLook>> = {
  trocken: { ...K0 },
  feucht: { ...K0, sky: 'G', dark: 0.32, refl: 0.38, reflP: 0.25 },
  nass: { ...K0, sky: 'G', dark: 0.55, refl: 0.95, reflP: 0.7, pud: 0.9 },
  reif: { ...K0, sky: 'K', frost: true, vergeWhite: 0.6, hillSnow: 0.35 },
  eis: { ...K0, sky: 'G', dark: 0.5, refl: 0.9, reflP: 0.75, ice: true, vergeWhite: 0.3 },
  schnee: { ...K0, sky: 'S', snow: true, mark: false, hillSnow: 0.85, vergeWhite: 1 },
  // No measurement says nothing about the weather either: the neutral sky, not the clear one (S-DV-3).
  unbekannt: { ...K0, sky: 'S', hatch: true },
  nichtgemessen: { ...K0, sky: 'S', desat: 0.38, dash: true },
};

// --- recipes: hazards (the weather and what it puts ON the road — never the surface state itself) ------------------

type DriftKey = 'rain1' | 'rain2' | 'rain3' | 'drizzle' | 'snow1' | 'snow2' | 'snow3' | 'hail1' | 'hail2' | 'wind1' | 'wind2' | 'dust' | 'leaves';
/** A moving layer: tile size, movement in whole tiles per cycle, the pattern body. */
const DRIFT: Readonly<Record<DriftKey, { tw: number; th: number; dx: number; dy: number; shift?: string; body: ReactNode }>> = {
  rain1: { tw: 40, th: 80, dx: 0, dy: 1, body: <path d="M8 4l-3 16M27 30l-3 16M17 56l-3 16" stroke="#E2E8EE" strokeWidth="1" strokeLinecap="round" opacity="0.7" /> },
  rain2: { tw: 40, th: 80, dx: 0, dy: 1, body: <path d="M33 12l-3 16M14 40l-3 16M36 62l-3 16" stroke="#E2E8EE" strokeWidth="1" strokeLinecap="round" opacity="0.6" /> },
  rain3: { tw: 40, th: 80, dx: 0, dy: 1, body: <path d="M22 0l-3 16M4 44l-3 16M30 50l-3 16" stroke="#EEF2F5" strokeWidth="1.2" strokeLinecap="round" opacity="0.65" /> },
  drizzle: { tw: 30, th: 60, dx: 0, dy: 1, body: <path d="M6 4l-1 7M20 20l-1 7M12 38l-1 7M26 48l-1 7" stroke="#EAF0F5" strokeWidth="0.8" strokeLinecap="round" opacity="0.75" /> },
  snow1: { tw: 60, th: 60, dx: 0, dy: 1, body: <g fill="#FFFFFF"><circle cx="8" cy="10" r="1.3" /><circle cx="31" cy="4" r="1" /><circle cx="50" cy="20" r="1.5" /><circle cx="20" cy="33" r="1.1" /><circle cx="42" cy="44" r="1.3" /><circle cx="12" cy="52" r="1" /></g> },
  snow2: { tw: 60, th: 60, dx: 0, dy: 1, body: <g fill="#FFFFFF"><circle cx="25" cy="14" r="1.6" /><circle cx="4" cy="28" r="1.2" /><circle cx="46" cy="32" r="1" /><circle cx="33" cy="55" r="1.7" /></g> },
  // the near flakes: larger, with an edge
  snow3: { tw: 90, th: 90, dx: 0, dy: 1, body: <g fill="#FFFFFF" stroke="#C2CFDB" strokeWidth="0.4"><circle cx="20" cy="18" r="2.6" /><circle cx="66" cy="40" r="3" /><circle cx="38" cy="74" r="2.4" /></g> },
  hail1: { tw: 50, th: 60, dx: 0, dy: 1, body: <g fill="#FFFFFF" stroke="#AFC3D6" strokeWidth="0.6"><circle cx="10" cy="10" r="1.8" /><circle cx="34" cy="28" r="2.2" /><circle cx="20" cy="48" r="1.6" /></g> },
  hail2: { tw: 50, th: 60, dx: 0, dy: 1, body: <g fill="#FFFFFF" stroke="#AFC3D6" strokeWidth="0.6"><circle cx="42" cy="6" r="2.4" /><circle cx="6" cy="34" r="2" /><circle cx="28" cy="54" r="2.6" /></g> },
  wind1: { tw: 160, th: 50, dx: -1, dy: 0, body: <path d="M10 10h46M90 26h60M40 42h34" stroke="#FFFFFF" strokeWidth="1.1" strokeLinecap="round" opacity="0.55" /> },
  wind2: { tw: 160, th: 50, dx: -1, dy: 0, shift: 'translate(60 17)', body: <path d="M10 10h46M90 26h60M40 42h34" stroke="#FFFFFF" strokeWidth="1.1" strokeLinecap="round" opacity="0.55" /> },
  dust: { tw: 40, th: 40, dx: -1, dy: 0, body: <g fill="#8E6A3A" opacity="0.7"><circle cx="5" cy="8" r="0.9" /><circle cx="22" cy="3" r="0.7" /><circle cx="33" cy="19" r="1.1" /><circle cx="14" cy="27" r="0.8" /><circle cx="28" cy="36" r="0.9" /></g> },
  leaves: {
    tw: 120, th: 80, dx: -2, dy: 1,
    body: <><path d="M14 18c2-3 6-3 8 0-2 3-6 3-8 0z" fill="#8A9A3C" /><path d="M70 40c2-3 6-3 8 0-2 3-6 3-8 0z" fill="#B07A2E" transform="rotate(30 74 40)" /><path d="M40 66c2-3 6-3 8 0-2 3-6 3-8 0z" fill="#9C8A34" transform="rotate(-25 44 66)" /><path d="M100 12c2-3 6-3 8 0-2 3-6 3-8 0z" fill="#B07A2E" /></>,
  },
};
interface DriftUse { k: DriftKey; op: number; dur: number }

/** Fog: visibility falls with distance — strongest at the horizon (41 % of the height), three levels. Dust alike. */
const FOG = [
  '',
  'linear-gradient(180deg, rgba(205,211,216,0.55) 0%, rgba(205,211,216,0.82) 41%, rgba(205,211,216,0.12) 100%)',
  'linear-gradient(180deg, rgba(205,211,216,0.75) 0%, rgba(205,211,216,0.95) 41%, rgba(205,211,216,0.6) 70%, rgba(205,211,216,0.3) 100%)',
  'linear-gradient(180deg, rgba(210,215,220,0.92) 0%, rgba(210,215,220,1) 50%, rgba(210,215,220,0.82) 78%, rgba(210,215,220,0.55) 100%)',
] as const;
const DUST = 'linear-gradient(180deg, rgba(217,185,138,0.35) 0%, rgba(217,185,138,0.75) 42%, rgba(217,185,138,0.15) 100%)';

interface HzLook {
  sky: SkyKey | null;
  /** Still parts (plane 1). */
  sun: number; shelf: number; joints: boolean; ridge: number; truck: boolean; truckRefl: boolean; pudX: number; glare: number; hailRoad: number; branch: boolean; roadLeaves: number; vergeWhite: number;
  /** Moving parts (plane 2). */
  rings: number; sparks: number; sock: number; spray: readonly [number, number] | null; cold: number; heat: number; heatWave: boolean; dust: boolean; fog: number; flash: number; drifts: DriftUse[];
}
const NO_HZ: HzLook = { sky: null, sun: 0, shelf: 0, joints: false, ridge: 0, truck: false, truckRefl: false, pudX: 0, glare: 0, hailRoad: 0, branch: false, roadLeaves: 0, vergeWhite: 0, rings: 0, sparks: 0, sock: 0, spray: null, cold: 0, heat: 0, heatWave: false, dust: false, fog: 0, flash: 0, drifts: [] };
const per = <T,>(lv: number, v: readonly [T, T, T]): T => v[Math.max(0, Math.min(2, lv - 1))];

/** The scene of a hazard at a level (1…3; density and intensity grow with it). `kind` only decides mirrors and glare strength. */
function hazardLook(id: RoadHazardId, lv: number, kind: SurfaceKind): HzLook {
  const o: HzLook = { ...NO_HZ, drifts: [] };
  const L = (n: number) => lv >= n;
  const rain = (op = 1) => { o.drifts.push({ k: 'rain1', op, dur: 0.42 }); if (L(2)) o.drifts.push({ k: 'rain2', op, dur: 0.36 }); if (L(3)) o.drifts.push({ k: 'rain3', op, dur: 0.3 }); };
  const wind = (from = 1, op = 1) => { if (L(from)) o.drifts.push({ k: 'wind1', op, dur: per(lv, [0.9, 0.75, 0.6]) }); if (L(from + 1)) o.drifts.push({ k: 'wind2', op, dur: per(lv, [0.7, 0.55, 0.45]) }); };
  switch (id) {
    case 'aqua': o.sky = L(3) ? 'D' : 'G'; rain(); o.rings = per(lv, [10, 18, 26]); o.pudX = per(lv, [0.4, 0.7, 1]); break;
    case 'glatteis': o.sky = 'G'; o.drifts.push({ k: 'drizzle', op: 1, dur: 0.7 }); if (L(2)) o.drifts.push({ k: 'rain1', op: 0.6, dur: 0.42 }); if (L(3)) o.drifts.push({ k: 'rain2', op: 0.6, dur: 0.36 }); o.sparks = per(lv, [10, 16, 22]); o.cold = 0.12; break;
    case 'gewitter': o.sky = 'D'; o.shelf = 1; o.flash = per(lv, [6, 4.2, 3]); rain(); o.rings = per(lv, [8, 14, 20]); break;
    case 'hagel': o.sky = 'D'; o.shelf = 0.6; o.drifts.push({ k: 'hail1', op: 1, dur: 0.32 }); if (L(2)) o.drifts.push({ k: 'hail2', op: 1, dur: 0.27 }); if (L(3)) o.drifts.push({ k: 'rain1', op: 1, dur: 0.42 }); o.hailRoad = per(lv, [24, 48, 70]); break;
    case 'schnee': o.sky = 'S'; o.drifts.push({ k: 'snow1', op: 1, dur: L(3) ? 2.2 : 3.2 }); if (L(2)) o.drifts.push({ k: 'snow2', op: 1, dur: L(3) ? 1.8 : 2.6 }); if (L(3)) o.drifts.push({ k: 'snow3', op: 1, dur: 1.5 }); wind(2, 0.6); break;
    case 'nebel': o.sky = 'G'; o.fog = lv; break;
    case 'gischt': o.sky = 'G'; o.truck = true; o.spray = L(2) ? [0.75, 0.9] : [0.4, 0.6]; o.truckRefl = kind === 'nass' || kind === 'feucht' || kind === 'eis'; break;
    case 'sonne': o.sky = 'U'; o.sun = per(lv, [100, 125, 125]); o.glare = kind === 'nass' || kind === 'eis' ? 1 : kind === 'feucht' ? 0.75 : 0.45 + lv * 0.1; break;
    case 'quer': o.sky = L(3) ? 'G' : 'C'; o.sock = lv; wind(1); break;
    case 'baum': o.sky = 'G'; wind(1); o.drifts.push({ k: 'leaves', op: per(lv, [0.7, 1, 1]), dur: per(lv, [2.6, 2.2, 2.2]) }); o.branch = true; o.roadLeaves = per(lv, [8, 16, 16]); break;
    case 'staub': o.sky = 'T'; o.dust = true; o.drifts.push({ k: 'dust', op: 1, dur: 0.5 }, { k: 'wind1', op: 0.5, dur: 0.75 }); break;
    case 'blowup': o.sky = 'C'; o.heat = 0.1 + lv * 0.05; o.heatWave = true; o.joints = true; o.ridge = lv; break;
    case 'frost1': o.sky = 'K'; o.cold = 0.16; o.sparks = per(lv, [10, 16, 16]); o.vergeWhite = 0.45; break;
    case 'sturz': o.sky = 'K'; o.shelf = 1; o.cold = 0.12 + lv * 0.05; wind(2); break;
    case 'reif': o.sky = 'K'; o.cold = 0.14; o.sparks = per(lv, [10, 16, 22]); break;
    case 'nass': o.sky = 'K'; o.cold = 0.16; o.sparks = per(lv, [10, 16, 22]); break;
  }
  return o;
}

// --- HUD colours (constants, so `verify:road-driver` can count the contrast against the worst backdrop: white) -----

/** Glass panel and the inks on it. Alpha 0.66: white text keeps ≥ 4.5 : 1 even over snow and the sun bloom. */
export const DV_HUD = Object.freeze({ panel: [20, 22, 26, 0.66] as const, ink: '#FFFFFF', sub: '#E6E9EC', src: '#F2F2F2' });
/** State chip per surface kind (background, ink). `unbekannt` is hatched, `nichtgemessen` dashed — see the CSS. */
export const DV_CHIP: Readonly<Record<SurfaceKind, { bg: string; ink: string }>> = Object.freeze({
  trocken: { bg: '#E9E4D6', ink: '#2C2A26' }, feucht: { bg: '#BFD6EE', ink: '#1F3F6E' }, nass: { bg: '#2B66A8', ink: '#FFFFFF' },
  reif: { bg: '#E4EEF7', ink: '#1F3F6E' }, eis: { bg: '#CFE2F3', ink: '#1F3F6E' }, schnee: { bg: '#FFFFFF', ink: '#2C2A26' },
  unbekannt: { bg: '#EDE6D3', ink: '#3A3833' }, nichtgemessen: { bg: '#F5F1E8', ink: '#7A4520' },
});
/** The honesty note of this view (replaces „Querschnitt schematisch, Schichtdicke überhöht“ of the cross-section). */
export const DV_NOTE = 'Fahrerblick stilisiert, kein Kamerabild';

/** The hazard tag — word for word the one of `RoadCrossSection` (`verify:road-driver` compares both). */
export const driverTag = (fx: CrossSectionFx | null): string | null =>
  (fx && fx.lv > 0 ? `${HZ_SHORT[fx.id]} · ${fx.at ? `ab ${fx.at}` : `Stufe ${fx.lv}`}${fx.at || fx.ev === 'p' ? ' · Prognose' : ''}` : null);

// --- component ------------------------------------------------------------------------------------------------

export default function RoadDriverView({ xs, fx = null }: { xs: CrossSection; fx?: CrossSectionFx | null }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const kind = xs.kind;
  const hz = fx && fx.lv > 0 ? fx : null;
  const lv: RoadLevel = hz ? hz.lv : 0;
  const ahead = !!hz?.at;
  const tag = driverTag(fx);
  const tint = hz ? AW_SEV_TINT[lv] : null;
  const chip = DV_CHIP[kind];
  const [pr, pg, pb, pa] = DV_HUD.panel;
  const vars = { '--dv-panel': `rgba(${pr}, ${pg}, ${pb}, ${pa})`, '--dv-ink': DV_HUD.ink, '--dv-sub': DV_HUD.sub, '--dv-src': DV_HUD.src, '--dv-chip-bg': chip.bg, '--dv-chip-ink': chip.ink } as CSSProperties;
  return (
    <div className="aw-dv" style={vars}>
      <div className="aw-dv-stage">
        <Still uid={uid} kind={kind} film={xs.filmMm} hz={hz?.id ?? null} lv={lv} ahead={ahead}
          label={`Fahrbahn aus Fahrersicht: ${xs.label}, ${xs.roadText}${tag ? `; Szene: ${tag}` : ''}`} />
        {hz && <Weather uid={uid} kind={kind} hz={hz.id} lv={lv} ahead={ahead} />}
      </div>
      <div className="aw-dv-top">
        <div className="aw-dv-panel aw-dv-airbox">
          <div className="aw-dv-air">{xs.air}</div>
          <div className="aw-dv-dew"><span>{xs.dew} ·</span> <span>{xs.rh}</span></div>
        </div>
        <div className="aw-dv-right">
          <div className="aw-dv-src">{xs.src}</div>
          {tag && tint && <div className={`aw-dv-tag${ahead ? ' is-ahead' : ''}`} aria-hidden="true" style={{ background: tint.bg, borderColor: tint.border, color: tint.ink }}>{tag}</div>}
        </div>
      </div>
      <div className="aw-dv-bot">
        <div className="aw-dv-road" aria-hidden="true">
          <div className={`aw-dv-roadtext${xs.roadText.length > 20 ? ' is-long' : ''}`}>{xs.roadText}</div>
          <div className={`aw-dv-chip${kind === 'unbekannt' ? ' is-hatch' : kind === 'nichtgemessen' ? ' is-dash' : ''}`}>{xs.label}</div>
        </div>
        <div className="aw-dv-cap">{DV_NOTE}</div>
      </div>
    </div>
  );
}

// --- plane 1: the still picture -------------------------------------------------------------------------------

const ROADRECT = { x: 0, y: 118, width: W, height: 174 } as const;

/** Hills, tree line and verges; whitened by the surface kind (and by „Erster Frost“). */
const Land = memo(function Land({ hillSnow, vergeWhite }: { hillSnow: number; vergeWhite: number }) {
  const hill = 'M0 116 C50 108 90 110 140 113 C200 104 250 110 300 114 C360 106 430 108 520 112 L520 122 L0 122 Z';
  return (
    <>
      <path d="M0 108 C60 92 110 96 170 102 C230 86 300 90 360 100 C420 92 470 96 520 104 L520 122 L0 122 Z" fill="#9AA4A6" opacity="0.7" />
      <path d={hill} fill="#6F7B6E" />
      <path d={G.trees} fill="#46553F" />
      {hillSnow > 0 && <path d={hill} fill="#FFFFFF" opacity={hillSnow} />}
      <polygon points={G.vergeR} fill="#8C9466" />
      <polygon points={G.vergeL} fill="#8C9466" />
      {vergeWhite > 0 && <g fill="#F2F4F6" opacity={vergeWhite}><polygon points={G.vergeR} /><polygon points={G.vergeL} /></g>}
    </>
  );
});

/** Asphalt with its two grain layers and the wheel tracks — the same for every scene. */
const Asphalt = memo(function Asphalt({ uid }: { uid: string }) {
  return (
    <>
      <rect {...ROADRECT} fill={`url(#awDvAsph${uid})`} />
      <rect {...ROADRECT} fill="#000" filter={`url(#awDvGrainD${uid})`} opacity="0.7" />
      <rect {...ROADRECT} fill="#000" filter={`url(#awDvGrainL${uid})`} opacity="0.55" />
      {G.tracks.map((t, i) => <polygon key={i} points={t} fill="#2E2C29" opacity="0.18" />)}
    </>
  );
});

/** Markings and the overlay of the surface kind (film, reflection, puddles, frost, ice, snow, hatch, desaturation). */
const Surface = memo(function Surface({ uid, kind, film }: { uid: string; kind: SurfaceKind; film: number }) {
  const k = KIND[kind];
  // „nass“: the film height scales the puddles (≥ 0.2 mm = full; the sensor word alone keeps a third).
  const pud = k.pud * Math.max(0.35, Math.min(1, film / 0.2));
  return (
    <>
      {k.mark && <g fill="#ECEAE2"><polygon points={G.edgeR} /><polygon points={G.edgeL} />{G.dashes.map((d, i) => <polygon key={i} points={d} />)}</g>}
      {k.dark > 0 && <rect {...ROADRECT} fill="#15171A" opacity={k.dark} />}
      {k.refl > 0 && <rect {...ROADRECT} fill={`url(#awDvRefl${uid})`} opacity={k.refl} />}
      {k.reflP > 0 && (
        <g opacity={k.reflP} filter={`url(#awDvBlur${uid})`}>
          <polygon points={G.railReflR} fill="#C9CED3" /><polygon points={G.railReflL} fill="#C9CED3" />
          {G.postRefl.map((p, i) => <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill="#3A3F45" />)}
          <rect x="340" y="128" width="180" height="12" fill="#56634F" opacity="0.6" />
        </g>
      )}
      {pud > 0 && <g opacity={pud.toFixed(2)}>{G.puddles.map((p, i) => <ellipse key={i} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} fill="#C3CCD4" opacity="0.55" />)}</g>}
      {k.frost && (
        <g>
          <rect {...ROADRECT} fill="#DCE3EA" opacity="0.5" />
          <rect {...ROADRECT} fill="#000" filter={`url(#awDvFrost${uid})`} opacity="0.9" />
          {/* traffic wears the frost off: the wheel tracks are less white */}
          {G.tracks.map((t, i) => <polygon key={i} points={t} fill="#5B5D60" opacity="0.38" />)}
        </g>
      )}
      {k.ice && (
        <g>
          <rect {...ROADRECT} fill="#6F97BF" opacity="0.22" />
          {G.cracks.map((c, i) => <polyline key={i} points={c} fill="none" stroke="#E6F0F8" strokeWidth="0.8" opacity="0.65" />)}
          {G.glints.map((p, i) => <ellipse key={i} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} fill="#FFFFFF" opacity="0.85" />)}
        </g>
      )}
      {k.snow && (
        <g>
          <rect {...ROADRECT} fill={`url(#awDvSnow${uid})`} />
          <rect {...ROADRECT} fill="#000" filter={`url(#awDvGrainD${uid})`} opacity="0.12" />
          {G.tracks.map((t, i) => <polygon key={i} points={t} fill="#8A9298" opacity="0.8" />)}
          {G.ruts.map((t, i) => <polygon key={`r${i}`} points={t} fill="#5F676E" opacity="0.7" />)}
        </g>
      )}
      {k.hatch && <g><rect {...ROADRECT} fill="#3A3833" opacity="0.25" /><rect {...ROADRECT} fill={`url(#awDvHatch${uid})`} opacity="0.32" /></g>}
      {k.desat > 0 && <rect {...ROADRECT} fill="#9C9890" opacity={k.desat} />}
    </>
  );
});

/** Guardrails, posts and (snow) the banks at the edges. */
const Rails = memo(function Rails({ snow }: { snow: boolean }) {
  return (
    <>
      <polygon points={G.railR} fill="#B8BDC2" /><polygon points={G.railL} fill="#B8BDC2" />
      {G.posts.map((p, i) => <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill="#5A5F64" />)}
      {snow && <g fill="#FFFFFF"><polygon points={G.bankR} /><polygon points={G.bankL} /></g>}
    </>
  );
});

const Still = memo(function Still({ uid, kind, film, hz, lv, ahead, label }: { uid: string; kind: SurfaceKind; film: number; hz: RoadHazardId | null; lv: number; ahead: boolean; label: string }) {
  const k = KIND[kind];
  const h = hz ? hazardLook(hz, lv, kind) : NO_HZ;
  /** A hazard that only starts later is drawn faint (0.7), like `is-ahead` of the cross-section. */
  const dim = ahead ? 0.7 : 1;
  const id = (n: string) => `awDv${n}${uid}`, url = (n: string) => `url(#${id(n)})`;
  const hzSky = h.sky && h.sky !== k.sky ? h.sky : null;
  const t = G.truck;
  const grad = (key: SkyKey) => (
    <linearGradient key={key} id={id(`Sky${key}`)} x1="0" y1="0" x2="0" y2="1">{SKY[key].map(([o, c]) => <stop key={o} offset={o} stopColor={c} />)}</linearGradient>
  );
  const blur = k.reflP > 0 || h.truckRefl;
  return (
    <svg className="aw-dv-scene" viewBox={`0 0 ${W} ${VH}`} width="100%" role="img" aria-label={label}>
      <defs>
        {grad(k.sky)}{hzSky && grad(hzSky)}
        <linearGradient id={id('Asph')} x1="0" y1={H} x2="0" y2={B} gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#A5A39E" /><stop offset="0.3" stopColor="#7A7873" /><stop offset="1" stopColor="#4B4945" /></linearGradient>
        {k.refl > 0 && <linearGradient id={id('Refl')} x1="0" y1={H} x2="0" y2={B} gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#E6EBEF" stopOpacity="0.95" /><stop offset="0.28" stopColor="#C9D1D8" stopOpacity="0.55" /><stop offset="1" stopColor="#9AA5AF" stopOpacity="0" /></linearGradient>}
        {k.snow && <linearGradient id={id('Snow')} x1="0" y1={H} x2="0" y2={B} gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#E4E8EC" /><stop offset="1" stopColor="#F6F8FA" /></linearGradient>}
        {h.glare > 0 && <linearGradient id={id('Glare')} x1="0" y1={H} x2="0" y2={B} gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#FFF6DA" stopOpacity="1" /><stop offset="0.5" stopColor="#FFE7B0" stopOpacity="0.55" /><stop offset="1" stopColor="#FFE7B0" stopOpacity="0" /></linearGradient>}
        {h.sun > 0 && <radialGradient id={id('Sun')}><stop offset="0" stopColor="#FFFBEA" /><stop offset="0.18" stopColor="#FFF1C4" stopOpacity="0.95" /><stop offset="0.5" stopColor="#FFD98A" stopOpacity="0.45" /><stop offset="1" stopColor="#FFC24A" stopOpacity="0" /></radialGradient>}
        <filter id={id('GrainL')} x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" /><feColorMatrix type="matrix" values="0 0 0 0 0.86  0 0 0 0 0.84  0 0 0 0 0.8  1.4 0 0 0 -0.62" /></filter>
        <filter id={id('GrainD')} x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="11" /><feColorMatrix type="matrix" values="0 0 0 0 0.12  0 0 0 0 0.12  0 0 0 0 0.12  1.6 0 0 0 -0.7" /></filter>
        {k.frost && <filter id={id('Frost')} x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.5" numOctaves="1" seed="7" /><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  2.4 0 0 0 -0.95" /></filter>}
        {blur && <filter id={id('Blur')} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6 3" /></filter>}
        {k.hatch && <pattern id={id('Hatch')} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3.2" height="9" fill="#EDE6D3" /></pattern>}
        <clipPath id={id('Road')}><polygon points={G.road} /></clipPath>
      </defs>

      <rect x="0" y="0" width={W} height="122" fill={url(`Sky${k.sky}`)} />
      {hzSky && <rect x="0" y="0" width={W} height="122" fill={url(`Sky${hzSky}`)} opacity={dim} />}
      {h.sun > 0 && <g opacity={dim}><circle cx={VX} cy="104" r={h.sun} fill={url('Sun')} /><circle cx={VX} cy="104" r="9" fill="#FFFDF2" /></g>}
      {h.shelf > 0 && (
        <g opacity={(h.shelf * dim).toFixed(2)}>
          <path d="M0 70 C40 62 90 66 140 60 C200 54 260 62 320 58 C380 54 440 62 520 58 L520 112 C480 104 450 112 400 106 C350 100 320 110 270 104 C220 98 180 108 130 102 C80 96 40 106 0 100 Z" fill="#3E4650" opacity="0.88" />
          <path d="M0 100 C40 106 80 96 130 102 C180 108 220 98 270 104 C320 110 350 100 400 106 C450 112 480 104 520 112 L520 116 L0 116 Z" fill="#59626C" opacity="0.6" />
        </g>
      )}
      <Land hillSnow={k.hillSnow} vergeWhite={Math.max(k.vergeWhite, h.vergeWhite * dim)} />

      <g clipPath={url('Road')}>
        <Asphalt uid={uid} />
        {h.joints && <g opacity={dim}>{G.joints.map((j, i) => <polyline key={i} points={j} fill="none" stroke="#2E2C29" strokeWidth="0.9" opacity="0.55" />)}</g>}
        <Surface uid={uid} kind={kind} film={film} />
        {/* what the hazard puts on the road — the surface state below stays the sensor's */}
        {hz && (
          <g opacity={dim}>
            {h.truckRefl && (
              <g opacity="0.8" filter={url('Blur')}>
                <rect x={t.x} y={t.yg} width={t.w} height={t.rh} fill="#5B636B" opacity="0.55" />
                <rect x={t.l1x} y={t.yg} width={t.lw} height={t.rh} fill="#C8332B" opacity="0.5" /><rect x={t.l2x} y={t.yg} width={t.lw} height={t.rh} fill="#C8332B" opacity="0.5" />
              </g>
            )}
            {h.pudX > 0 && <g opacity={h.pudX}>{G.puddles2.map((p, i) => <ellipse key={i} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} fill="#B9C4CE" opacity="0.6" />)}</g>}
            {h.glare > 0 && <polygon points={G.glare} fill={url('Glare')} opacity={h.glare.toFixed(2)} />}
            {h.hailRoad > 0 && G.hailRoad.slice(0, h.hailRoad).map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={p.r} fill="#F4F7FA" stroke="#B8C8D8" strokeWidth="0.4" />)}
            {h.ridge > 0 && <g><polygon points={G.ridge[h.ridge]} fill="#C9C3B6" /><polygon points={G.ridgeShadow} fill="#1E1C19" opacity="0.6" /></g>}
            {h.branch && (
              <g>
                {G.branches.map((b, i) => <polyline key={i} points={b.pts} fill="none" stroke="#5A4128" strokeWidth={b.sw} strokeLinecap="round" strokeLinejoin="round" />)}
                {G.roadLeaves.slice(0, h.roadLeaves).map((p, i) => <ellipse key={`l${i}`} cx={p.x} cy={p.y} rx={p.rx} ry={p.ry} fill={p.c} />)}
              </g>
            )}
          </g>
        )}
      </g>
      {k.dash && <polygon points={G.road} fill="none" stroke="#9A5A2A" strokeWidth="1.6" strokeDasharray="6 4" />}

      <Rails snow={k.snow} />
      {h.truck && (
        <g opacity={dim}>
          <ellipse cx={t.cx} cy={t.yg} rx={t.sx} ry="3" fill="#000" opacity="0.35" />
          <rect x={t.x} y={t.y} width={t.w} height={t.h} rx="1.5" fill="#5B636B" />
          <rect x={t.ix} y={t.iy} width={t.iw} height={t.ih} fill="none" stroke="#7A838B" strokeWidth="0.8" />
          <line x1={t.cx} y1={t.iy} x2={t.cx} y2={t.iyb} stroke="#7A838B" strokeWidth="0.8" />
          <rect x={t.x} y={t.by} width={t.w} height={t.bh} fill="#2E3338" />
          <rect x={t.l1x} y={t.ly} width={t.lw} height={t.lh} fill="#D23A30" /><rect x={t.l2x} y={t.ly} width={t.lw} height={t.lh} fill="#D23A30" />
          <rect x={t.px} y={t.py} width={t.pw} height={t.ph} fill="#E9E4D6" />
        </g>
      )}
    </svg>
  );
});

// --- plane 2: the weather -------------------------------------------------------------------------------------

const pct = (v: number) => `${(v * 100).toFixed(4)}%`;
const VB = `0 0 ${W} ${VH}`;

/** One moving layer: its own SVG, moved as an element by whole tiles per cycle (percent of its own size ⇒ compositor only). */
function Drift({ uid, k, op, dur }: DriftUse & { uid: string }) {
  const d = DRIFT[k];
  const mx = Math.abs(d.dx) * d.tw, my = Math.abs(d.dy) * d.th;
  // The box covers the picture at both ends of the cycle: it starts shifted against the movement.
  const x0 = d.dx > 0 ? -mx : 0, y0 = d.dy > 0 ? -my : 0, w = W + mx, h = VH + my;
  const id = `awDv${k}${uid}`;
  const style = { left: pct(x0 / W), top: pct(y0 / VH), width: pct(w / W), height: pct(h / VH), opacity: op, animationDuration: `${dur}s`, '--dv-dx': pct((d.dx * d.tw) / w), '--dv-dy': pct((d.dy * d.th) / h) } as CSSProperties;
  return (
    <svg className="aw-dv-drift" viewBox={`${x0} ${y0} ${w} ${h}`} preserveAspectRatio="none" style={style}>
      <defs><pattern id={id} width={d.tw} height={d.th} patternUnits="userSpaceOnUse" patternTransform={d.shift}>{d.body}</pattern></defs>
      <rect x={x0} y={y0} width={w} height={h} fill={`url(#${id})`} />
    </svg>
  );
}

const SPARK = 'M0 -2.6L0.6 -0.6 2.6 0 0.6 0.6 0 2.6 -0.6 0.6 -2.6 0 -0.6 -0.6Z';
const timing = (dur: number, i: number): CSSProperties => ({ animationDuration: `${dur.toFixed(2)}s`, animationDelay: `${(-rnd(i, 9) * dur).toFixed(2)}s` });

const Weather = memo(function Weather({ uid, kind, hz, lv, ahead }: { uid: string; kind: SurfaceKind; hz: RoadHazardId; lv: number; ahead: boolean }) {
  const h = hazardLook(hz, lv, kind);
  const small = h.rings > 0 || h.sparks > 0 || h.sock > 0;
  return (
    <div className={`aw-dv-wx${ahead ? ' is-ahead' : ''}`} aria-hidden="true">
      {small && (
        <svg className="aw-dv-fx" viewBox={VB}>
          {G.rings.slice(0, h.rings).map((r, i) => <ellipse key={`r${i}`} className="aw-dv-ring" cx={r.cx} cy={r.cy} rx={r.rx} ry={r.ry} fill="none" stroke="#E8EDF1" strokeWidth="0.8" style={timing(r.d, i)} />)}
          {G.sparks.slice(0, h.sparks).map((s, i) => <path key={`s${i}`} className="aw-dv-twinkle" d={SPARK} fill="#FFFFFF" transform={s.t} style={timing(s.d, i + 40)} />)}
          {h.sock > 0 && (
            <g>
              <line x1={G.sock.x} y1={G.sock.yg} x2={G.sock.x} y2={G.sock.top} stroke="#5A5F64" strokeWidth="1.8" />
              <g className="aw-dv-sock" style={{ transformOrigin: G.sock.origin, animationDuration: `${[0, 2.2, 1.4, 0.8][h.sock]}s` }}>
                {G.sock.parts[h.sock].map((s, i) => <polygon key={i} points={s.pts} fill={s.c} stroke="#7A2A1E" strokeWidth="0.3" />)}
              </g>
            </g>
          )}
        </svg>
      )}
      {h.spray && (
        <svg className="aw-dv-fx aw-dv-spray" viewBox={VB} style={{ opacity: h.spray[1], '--dv-o0': h.spray[0], '--dv-o1': h.spray[1] } as CSSProperties}>
          <defs><filter id={`awDvSoft${uid}`} x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4" /></filter></defs>
          <g filter={`url(#awDvSoft${uid})`}>{G.spray.map((s, i) => <ellipse key={i} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill="#D4DADF" opacity={s.op} />)}</g>
        </svg>
      )}
      {h.cold > 0 && <div className="aw-dv-veil" style={{ background: '#BFD6EE', opacity: h.cold.toFixed(2) }} />}
      {h.heat > 0 && <div className="aw-dv-veil" style={{ background: '#F7C98A', opacity: h.heat.toFixed(2) }} />}
      {h.heatWave && (
        <svg className="aw-dv-fx" viewBox={VB}>
          <path className="aw-dv-heat" d="M150 121 q8 -2 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0" stroke="#EAD9C0" strokeWidth="2.4" fill="none" opacity="0.8" style={{ animationDuration: '0.9s' }} />
          <path className="aw-dv-heat" d="M200 116 q6 -1.5 12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0" stroke="#F2E6D2" strokeWidth="1.6" fill="none" opacity="0.7" style={{ animationDuration: '1.1s', animationDelay: '-0.4s' }} />
        </svg>
      )}
      {h.dust && <div className="aw-dv-veil" style={{ background: DUST }} />}
      {h.drifts.map((d) => <Drift key={d.k} uid={uid} {...d} />)}
      {h.fog > 0 && (
        <>
          <div className="aw-dv-veil" style={{ background: FOG[h.fog] }} />
          <svg className="aw-dv-fx aw-dv-fogbank" viewBox={VB}>
            <defs><filter id={`awDvSoft2${uid}`} x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="9" /></filter></defs>
            <g filter={`url(#awDvSoft2${uid})`} fill="#E2E6EA">
              <ellipse cx="120" cy="150" rx="140" ry="16" opacity="0.7" /><ellipse cx="380" cy="168" rx="160" ry="18" opacity="0.6" /><ellipse cx="260" cy="205" rx="200" ry="20" opacity="0.45" />
            </g>
          </svg>
        </>
      )}
      {h.flash > 0 && (
        <>
          <div className="aw-dv-veil aw-dv-flash" style={{ animationDuration: `${h.flash}s` }} />
          <svg className="aw-dv-fx aw-dv-bolt" viewBox={VB} style={{ animationDuration: `${h.flash}s` }}>
            {/* between the HUD panels, down to the horizon */}
            <path d="M0 0l-12 30h10l-9 28 22-36h-11l9-22z" transform="translate(298 40) scale(1.3)" fill="#FFF3B0" stroke="#F2D25A" strokeWidth="0.8" />
          </svg>
        </>
      )}
    </div>
  );
});
