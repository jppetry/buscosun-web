/**
 * Phase SR — pure part of the map layer „Strömung“ (`audit/seewetter-riffel.md`): the BSH surface current as moving
 * ripple fronts. No DOM, no MapLibre: read by the page (colour area, legend), by the canvas layer
 * (`SeaRippleLayer.ts`), by the particle state (`seaRippleSim.ts`) and by `verify:sea-ripples`.
 *
 * What the motion says: where the water goes and how strongly — ordered fronts ACROSS the flow, tip downstream,
 * larger and lighter with speed. It does not show waves. Every number below is the brief's (Jan, 18.11.2026) unless it
 * is marked `set`; px are CSS px, `v` is the speed in m/s.
 */
import { SEA_MODELS } from './seaContract';
import { SEA_CURRENT_UV, type SeaUvGrid } from './seaCurrent';
import { SEA_FIELD_BOUNDS, SEA_OUT_ROWS } from './seaView';

// --- Numbers of the brief ------------------------------------------------------------------------------------------

export const RIPPLE = Object.freeze({
  /** Counts are per this much visible water and scale with the area … */
  refW: 680, refH: 380, tracers: 130, packets: 190,
  /** … up to this multiple (`set`: a 1920 × 1000 map of open sea would ask for 7.4 ×). */
  areaCap: 4,
  /** Movement before phase SR-B, kept as the fallback `?srtempo=lin`: px per frame per m/s at 60 fps (see `rippleStepPx`). */
  pxPerFrame: 0.75,
  /** B. Threads. */
  threadLen: 56, threadMinMs: 0.04,
  /** Life of a thread in frames (`set`: „long-lived“ — two to four times a packet). */
  threadLifeMin: 700, threadLifeMax: 1500,
  /** C. Ripple packets. */
  packetLifeMin: 260, packetLifeMax: 600, fadeFrames: 30, packetMinMs: 0.05, fronts: 3, frontSteps: 4, reliefPx: 1.8,
  /** A packet remembers its way as points this far apart (`set`: 24 points reach past the third front at full spacing). */
  trailStepPx: 1.5, trailPoints: 24,
  /** A particle lives this far beyond the edge of the map (`set`: fronts do not pop at the border). */
  marginPx: 40,
  /** Tries per frame to place one new particle (`set`). */
  spawnTries: 4,
  /** A new hour's field takes this long to replace the one before, u and v mixed linearly (`set`: under the 900 ms of „Abspielen“). */
  blendMs: 800,
  /** The still frame (`?srstill=1`) is the state after this many frames (`set`). */
  stillFrames: 90,
  /** Lattice of the visible-water estimate (`set`). */
  latticeX: 34, latticeY: 19,
});
/**
 * Phase SR-B (E-SR-16, Jan 19.11.2026: „das flüssige Bewegen soll genauso sein“ wie bei den Windpartikeln) — the tempo on
 * the screen follows the wind particles' curve instead of a straight line: px/s = `pxPerSec` · (max(v, `minMs`) /
 * `refMs`)^`gamma`. `gamma` is the wind preset's (`SEGMENT_PRESET.speed.gamma`); the other three are `set` for
 * currents: 0.1 m/s ⇒ 5 px/s, 0.3 ⇒ 12, 1 ⇒ 27 (linear before: 4.5 / 13.5 / 45). `pxPerSec` began at 60 — Jan, 19.11.,
 * four times slower: 48 (E-SR-18), 38 (E-SR-21), 32.3 (E-SR-24) and 27.455 (E-SR-25), the last two −15 % each. Above
 * 0.19 m/s that is slower than the tempo before the curve (0.3 m/s: 0.88 times, 1 m/s: 0.61 times); a weak current is
 * still 1.2 times as fast. The floor is the speed below which a packet is hidden anyway. The tempo is no longer proportional to the speed — size and lightness of the fronts carry
 * the strength, as the legend says.
 */
export const RIPPLE_TEMPO = Object.freeze({ pxPerSec: 27.455, refMs: 1, gamma: 0.7, minMs: 0.05 });
/** Movement of threads and packets in px per 60-fps frame at speed `v` (m/s); still water does not move. `linear` = the fallback. */
export function rippleStepPx(v: number, linear = false): number {
  if (!(v > 0)) return 0;
  if (linear) return RIPPLE.pxPerFrame * v;
  return (RIPPLE_TEMPO.pxPerSec / 60) * Math.pow(Math.max(v, RIPPLE_TEMPO.minMs) / RIPPLE_TEMPO.refMs, RIPPLE_TEMPO.gamma);
}
/**
 * The two fallbacks of phase SR-B, read from the link: `srstill=1` = one still frame instead of the motion (E-SR-15 —
 * the layer moves whatever the device says about reduced motion, as the wind layer does), `srtempo=lin` = the tempo
 * before the phase. Anything else, or a broken query: motion with the curve.
 */
export function rippleMotionFrom(search: string | null | undefined): { still: boolean; linear: boolean } {
  try {
    const q = new URLSearchParams(search ?? '');
    return { still: q.get('srstill') === '1', linear: q.get('srtempo') === 'lin' };
  } catch { return { still: false, linear: false }; }
}

/**
 * E-SR-22 (Jan, 19.11.2026: „beim Reinzoomen etwas zu viele Wellen … −25 %“) — zoomed in beyond the start view the layer
 * shows fewer packets: the full count at the start view and further out, `packets` of it from `levels` zoom levels
 * further in, sliding in between (no jump while zooming). Threads keep their count.
 */
export const RIPPLE_ZOOM = Object.freeze({ levels: 1, packets: 0.75 });
/**
 * How many zoom levels the view lies beyond the one at which the start view `home` (west, south, east, north) fits the
 * map box with `padPx` free on every side — the way the map is created (`fitBoundsOptions: { padding: 10 }`). Computed
 * from the layer's own view: the map's `cameraForBounds` adds the padding the page sets for legend and panels, and then
 * the start view itself counts as zoomed in (measured 19.11.: 17 % fewer strokes at the start view). `null` = unknown.
 */
export function rippleZoomIn(view: RippleView, home: readonly [number, number, number, number] | null | undefined, padPx = 10): number | null {
  if (!home) return null;
  const fit = Math.min((view.w - 2 * padPx) / (mercX(home[2]) - mercX(home[0])), (view.h - 2 * padPx) / (mercY(home[1]) - mercY(home[3])));
  return fit > 0 && view.ax > 0 ? Math.log2(view.ax / fit) : null;
}
/** Share of the packets at `zoomIn` (`rippleZoomIn`); unknown ⇒ all of them. */
export function zoomPacketScale(zoomIn: number | null | undefined): number {
  if (zoomIn == null || Number.isNaN(zoomIn)) return 1;
  const q = Math.min(1, Math.max(0, zoomIn / RIPPLE_ZOOM.levels));
  return 1 - (1 - RIPPLE_ZOOM.packets) * q;
}

/**
 * V-SR-13 — one picture per frame while the map moves. The map draws the layer itself on every 'move' (with the view of
 * exactly that frame); the layer's own loop then only steps the particles. The loop draws again once no map picture
 * came for `factor` × the interval of the last two (at least `minMs`, at most `maxMs` — all three `set`): at 60 frames
 * that is the frame after next, so a pointer held still in the middle of a drag does not freeze the ripples.
 */
export const RIPPLE_MOVE = Object.freeze({ minMs: 25, maxMs: 100, factor: 1.5 });
/** Does the loop draw this frame? `movedAtMs` = time of the last picture drawn on a map move, `moveEveryMs` = the interval before it. */
export function loopPaints(nowMs: number, movedAtMs: number, moveEveryMs: number): boolean {
  const every = moveEveryMs > 0 ? moveEveryMs : 0;
  return nowMs - movedAtMs > Math.min(RIPPLE_MOVE.maxMs, Math.max(RIPPLE_MOVE.minMs, RIPPLE_MOVE.factor * every));
}

/** Colours of the brief (rgb). `WATER` is the layer's own water tone under the colour area (`set`, audit §1.3). */
export const RIPPLE_RGB = Object.freeze({
  tint: [120, 214, 222] as const, thread: [150, 222, 228] as const, relief: [3, 38, 46] as const,
  front: [176, 232, 237] as const, crest: [232, 250, 251] as const, water: [28, 80, 102] as const,
});
export const rgbCss = (c: readonly [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;

/** A. Colour area: alpha of the tint. */
export const tintAlpha = (v: number): number => Math.min(1, 0.82 * Math.pow(Math.max(0, v), 0.8)) * 0.5;
/** B. Alpha of a thread; hidden below 0.04 m/s. */
export const threadAlpha = (fade: number, v: number): number => (v < RIPPLE.threadMinMs ? 0 : fade * Math.min(0.2, 0.05 + 0.22 * v));
/** C. Alpha `a` of a packet; hidden below 0.05 m/s. */
export const packetAlpha = (fade: number, v: number): number => (v < RIPPLE.packetMinMs ? 0 : fade * Math.min(1, 0.2 + 1.3 * v));
/** The same two without the cut — the layer fades a particle out over `fadeFrames` when it falls below the limit (E). */
export const threadStrength = (v: number): number => Math.min(0.2, 0.05 + 0.22 * v);
export const packetStrength = (v: number): number => Math.min(1, 0.2 + 1.3 * v);
/** Fade in and out over 30 frames at the ends of a life. */
export const lifeFade = (age: number, life: number): number => Math.max(0, Math.min(1, age / RIPPLE.fadeFrames, (life - age) / RIPPLE.fadeFrames));
/** The k-th front (k = 0 leads) lies this far behind the one before it. */
export const frontSpacing = (v: number): number => 7 + Math.min(7, 7 * v);
export const frontHalfWidth = (v: number, k: number): number => (5 + Math.min(12, 11 * v)) * (1 - 0.16 * k);
export const frontLineWidth = (k: number): number => 2.2 - 0.4 * k;
export const frontFade = (k: number): number => 1 - 0.28 * k;
/** How far point `i` (steps from the centre) is moved downstream; the centre gets 0.385 · w, the ends −0.315 · w. */
export const frontOffset = (w: number, i: number): number => 0.7 * w * (1 - (i / RIPPLE.frontSteps) ** 2) - 0.315 * w;
/** D. A new position is accepted with this probability. */
export const spawnProbability = (v: number): number => Math.min(1, 0.12 + 1.3 * v);

/** Counts for an amount of visible water (px²); `packetScale` is the last lever of the frame governor. */
export function rippleCounts(waterPx: number, packetScale = 1): { scale: number; tracers: number; packets: number } {
  const scale = Math.min(RIPPLE.areaCap, Math.max(0, waterPx) / (RIPPLE.refW * RIPPLE.refH));
  return { scale, tracers: Math.round(RIPPLE.tracers * scale), packets: Math.round(RIPPLE.packets * scale * packetScale) };
}
export const RIPPLE_MAX = Object.freeze({ tracers: RIPPLE.tracers * RIPPLE.areaCap, packets: RIPPLE.packets * RIPPLE.areaCap });

/**
 * Frame governor (`FrameGovernor` of the wind layer, FPS-target mode): ONE level index, three levers in the order of the
 * brief — the frame rate first, then shorter threads, fewer packets last. Index 4 is the un-governed top.
 * `fine` = mouse devices, `coarse` = touch (the wind layer caps those at 30 fps too).
 */
export const RIPPLE_LADDER = Object.freeze({
  fine: Object.freeze({ fps: [30, 30, 30, 45, 60], trail: [0.5, 0.5, 1, 1, 1], packets: [0.6, 1, 1, 1, 1] }),
  coarse: Object.freeze({ fps: [20, 20, 20, 24, 30], trail: [0.5, 0.5, 1, 1, 1], packets: [0.6, 1, 1, 1, 1] }),
});
export type RippleLadder = typeof RIPPLE_LADDER.fine;
/** Positions a thread draws at a frame rate: 56 at 60 fps; fewer frames cover the same time with fewer positions. */
export const threadPositions = (fps: number, trailScale: number): number => Math.max(6, Math.round(RIPPLE.threadLen * trailScale * Math.min(1, fps / 60)));

// --- Flow between two hours -------------------------------------------------------------------------------------------

export interface Flow { u: number; v: number }
/** u and v mixed linearly: a current that turns between two hours passes through zero, it does not swing round at full speed. */
export const lerpFlow = (a: Flow, b: Flow, w: number): Flow => ({ u: a.u + (b.u - a.u) * w, v: a.v + (b.v - a.v) * w });
export const flowSpeed = (f: Flow): number => Math.hypot(f.u, f.v);

/**
 * One grid at fractional cell coordinates, bilinear over the water points around it. `false` = no water point here
 * (the nearest cell is land or outside the grid) — the caller treats that as land.
 */
export function sampleUv(g: SeaUvGrid, x: number, y: number, out: Flow): boolean {
  const xr = Math.round(x), yr = Math.round(y), nx = g.nx;
  if (!(xr >= 0 && yr >= 0 && xr < nx && yr < g.ny) || !g.ok[yr * nx + xr]) return false;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  let u = 0, v = 0, w = 0;
  for (let c = 0; c < 4; c++) {
    const cx = x0 + (c & 1), cy = y0 + (c >> 1);
    if (cx < 0 || cy < 0 || cx >= nx || cy >= g.ny) continue;
    const p = cy * nx + cx;
    if (!g.ok[p]) continue;
    const q = ((c & 1) ? fx : 1 - fx) * ((c >> 1) ? fy : 1 - fy);
    u += q * g.u[p]; v += q * g.v[p]; w += q;
  }
  if (w <= 0) return false;
  out.u = u / w; out.v = v / w;
  return true;
}
const TMP: Flow = { u: 0, v: 0 };
/**
 * The flow at weight `w` between the hour before (`a`, may be null) and the chosen hour (`b`). A point that is water
 * in only one of the two fades to or from still water; at the ends (w = 0, w = 1) only that hour's own mask counts.
 */
export function sampleBlend(a: SeaUvGrid | null, b: SeaUvGrid, w: number, x: number, y: number, out: Flow): boolean {
  if (!a || w >= 1) return sampleUv(b, x, y, out);
  if (w <= 0) return sampleUv(a, x, y, out);
  const okA = sampleUv(a, x, y, TMP), au = TMP.u, av = TMP.v;
  const okB = sampleUv(b, x, y, out);
  if (!okA && !okB) return false;
  if (!okA) { out.u *= w; out.v *= w; return true; }
  if (!okB) { out.u = au * (1 - w); out.v = av * (1 - w); return true; }
  out.u = au + (out.u - au) * w; out.v = av + (out.v - av) * w;
  return true;
}
/** The hours the page keeps for a chosen hour: itself and the next one (the hour „Abspielen“ walks to). */
export const rippleHours = (hour: number, hours: number): number[] => [hour, hour + 1].filter((h) => h >= 0 && h < hours);

// --- Map coordinates ----------------------------------------------------------------------------------------------------

/** Web mercator, both axes 0–1 (x from 180° W, y from the north). Particles live in these and are re-projected every frame. */
export const mercX = (lon: number): number => (lon + 180) / 360;
export const mercY = (lat: number): number => 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);
export const lonOfMercX = (mx: number): number => mx * 360 - 180;
export const latOfMercY = (my: number): number => (Math.atan(Math.exp((0.5 - my) * 2 * Math.PI)) * 360) / Math.PI - 90;

/** The map's view as px = a · mercator + b (the Seewetter map never rotates or tilts), and its size in px. */
export interface RippleView { ax: number; bx: number; ay: number; by: number; w: number; h: number }
/** From two positions and where the map draws them. */
export function viewFromTwo(m1: { x: number; y: number }, p1: { x: number; y: number }, m2: { x: number; y: number }, p2: { x: number; y: number }, w: number, h: number): RippleView {
  const ax = (p2.x - p1.x) / (m2.x - m1.x), ay = (p2.y - p1.y) / (m2.y - m1.y);
  return { ax, bx: p1.x - ax * m1.x, ay, by: p1.y - ay * m1.y, w, h };
}

/** Direction of the flow on the screen as a unit vector (x right, y DOWN), and the speed in m/s. Still water: 0 / 0 / 0. */
export interface PxFlow { dx: number; dy: number; v: number }
export type PxSampler = (px: number, py: number, out: PxFlow) => boolean;
/** The flow at a screen position: px → mercator → u/v grid → the two hours mixed. `false` = land. */
export function makePxSampler(view: RippleView, a: SeaUvGrid | null, b: SeaUvGrid, w: number): PxSampler {
  const g = SEA_MODELS.cwam.grid, f = SEA_CURRENT_UV, flow: Flow = { u: 0, v: 0 };
  return (px, py, out) => {
    const lon = lonOfMercX((px - view.bx) / view.ax), lat = latOfMercY((py - view.by) / view.ay);
    if (!sampleBlend(a, b, w, ((lon - g.lon1) / g.di - f.off) / f.stride, ((g.lat1 - lat) / g.dj - f.off) / f.stride, flow)) return false;
    const v = Math.hypot(flow.u, flow.v);
    out.v = v;
    if (v > 0) { out.dx = flow.u / v; out.dy = -flow.v / v; } else { out.dx = 0; out.dy = 0; }
    return true;
  };
}
/** Visible water in px²: the share of a lattice over the map that lies on a water point. */
export function visibleWaterPx(sample: PxSampler, w: number, h: number): number {
  const f: PxFlow = { dx: 0, dy: 0, v: 0 };
  let n = 0;
  for (let j = 0; j < RIPPLE.latticeY; j++) for (let i = 0; i < RIPPLE.latticeX; i++) {
    if (sample(((i + 0.5) / RIPPLE.latticeX) * w, ((j + 0.5) / RIPPLE.latticeY) * h, f)) n++;
  }
  return (n / (RIPPLE.latticeX * RIPPLE.latticeY)) * w * h;
}

// --- One front ----------------------------------------------------------------------------------------------------------

const FRONT_PTS = 2 * RIPPLE.frontSteps + 1;
/** Points of one front from one end through the centre to the other; `step[i]` = steps from the centre (signed). */
export interface Front { n: number; xs: Float32Array; ys: Float32Array; step: Int8Array; /** Flow direction at the centre. */ ux: number; uy: number; w: number }
export const newFront = (): Front => ({ n: 0, xs: new Float32Array(FRONT_PTS), ys: new Float32Array(FRONT_PTS), step: new Int8Array(FRONT_PTS), ux: 0, uy: 0, w: 0 });
const F0: PxFlow = { dx: 0, dy: 0, v: 0 };
const SIDE_X = new Float32Array(RIPPLE.frontSteps), SIDE_Y = new Float32Array(RIPPLE.frontSteps);
/**
 * The front of a packet moving at `v` whose k-th front has its centre at (cx, cy): half-width w, four steps of w/4 to
 * each side, each step perpendicular to the flow AT THAT POINT (the front bends with the field); a side stops at land
 * and where the water stands still. Then every point moves downstream along its own flow — the centre furthest, so the
 * tip points downstream. Returns the number of points (0 = centre on land or in still water; 1 = no side: not drawn).
 */
export function frontPoints(sample: PxSampler, cx: number, cy: number, v: number, k: number, out: Front): number {
  out.n = 0;
  if (!sample(cx, cy, F0) || F0.v <= 0) return 0;
  const w = frontHalfWidth(v, k), stepPx = w / RIPPLE.frontSteps, ux = F0.dx, uy = F0.dy;
  out.ux = ux; out.uy = uy; out.w = w;
  let n = 0;
  for (const side of [-1, 1]) {
    let x = cx, y = cy, dx = ux, dy = uy, m = 0;
    for (let i = 1; i <= RIPPLE.frontSteps; i++) {
      // Perpendicular to the flow at the point the step starts from.
      const nx = x - dy * side * stepPx, ny = y + dx * side * stepPx;
      if (!sample(nx, ny, F0) || F0.v <= 0) break;
      x = nx; y = ny; dx = F0.dx; dy = F0.dy;
      const off = frontOffset(w, i);
      SIDE_X[m] = x + dx * off; SIDE_Y[m] = y + dy * off; m++;
    }
    if (side < 0) {
      for (let i = m - 1; i >= 0; i--) { out.xs[n] = SIDE_X[i]; out.ys[n] = SIDE_Y[i]; out.step[n] = -(i + 1); n++; }
      const off = frontOffset(w, 0);
      out.xs[n] = cx + ux * off; out.ys[n] = cy + uy * off; out.step[n] = 0; n++;
    } else {
      for (let i = 0; i < m; i++) { out.xs[n] = SIDE_X[i]; out.ys[n] = SIDE_Y[i]; out.step[n] = i + 1; n++; }
    }
  }
  out.n = n;
  return n;
}
/** Index range of the front's middle half (steps −2 … +2), `[from, to]` inclusive. */
export function crestRange(f: Front): [number, number] {
  const half = RIPPLE.frontSteps / 2;
  let from = 0, to = f.n - 1;
  while (from < to && f.step[from] < -half) from++;
  while (to > from && f.step[to] > half) to--;
  return [from, to];
}
/** What a canvas context and the legend's SVG path both understand. */
export interface PathSink { moveTo(x: number, y: number): void; lineTo(x: number, y: number): void; quadraticCurveTo(cx: number, cy: number, x: number, y: number): void }
/** A smooth curve through points `from … to` of a front, shifted by (ox, oy): quadratic pieces through the midpoints. */
export function frontCurve(sink: PathSink, f: Front, from: number, to: number, ox = 0, oy = 0): void {
  const xs = f.xs, ys = f.ys;
  sink.moveTo(xs[from] + ox, ys[from] + oy);
  if (to - from < 2) { if (to > from) sink.lineTo(xs[to] + ox, ys[to] + oy); return; }
  for (let i = from + 1; i < to - 1; i++) sink.quadraticCurveTo(xs[i] + ox, ys[i] + oy, (xs[i] + xs[i + 1]) / 2 + ox, (ys[i] + ys[i + 1]) / 2 + oy);
  sink.quadraticCurveTo(xs[to - 1] + ox, ys[to - 1] + oy, xs[to] + ox, ys[to] + oy);
}
/** The point `dist` px behind the head along a way given head first; `false` when the way is shorter. */
export function pointBehind(xs: ArrayLike<number>, ys: ArrayLike<number>, n: number, dist: number, out: { x: number; y: number }): boolean {
  if (dist <= 0 && n > 0) { out.x = xs[0]; out.y = ys[0]; return true; }
  let left = dist;
  for (let i = 1; i < n; i++) {
    const seg = Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
    if (seg >= left && seg > 0) { const q = left / seg; out.x = xs[i - 1] + (xs[i] - xs[i - 1]) * q; out.y = ys[i - 1] + (ys[i] - ys[i - 1]) * q; return true; }
    left -= seg;
  }
  return false;
}

// --- Colour area (A) and the layer's own water tone -------------------------------------------------------------------------

const mix = (a: number, b: number, q: number) => Math.round(a + (b - a) * q);
/** Colour of the area at a speed: the tint over the layer's water tone. */
export function areaRgb(v: number): [number, number, number] {
  const q = tintAlpha(v), w = RIPPLE_RGB.water, t = RIPPLE_RGB.tint;
  return [mix(w[0], t[0], q), mix(w[1], t[1], q), mix(w[2], t[2], q)];
}
/**
 * The colour area for the map: the same image form as `colourField` (630 columns, rows linear in web mercator, alpha
 * 235), so it takes the place of the wave area in the image source. Land stays transparent. The tint share is computed
 * once per u/v cell and mixed bilinearly between the water cells, so the 1.8 km grid does not show as tiles. Measured
 * in Node on a real hour: 12–22 ms per image (a full flow sample per pixel took 89 ms) — once per chosen hour.
 */
export function colourCurrentArea(g: SeaUvGrid): Uint8ClampedArray {
  const cw = SEA_MODELS.cwam.grid, f = SEA_CURRENT_UV, ni = cw.ni, nx = g.nx, ny = g.ny, out = new Uint8ClampedArray(ni * SEA_OUT_ROWS * 4);
  const top = mercY(SEA_FIELD_BOUNDS.north), bot = mercY(SEA_FIELD_BOUNDS.south);
  const w = RIPPLE_RGB.water, t = RIPPLE_RGB.tint, d0 = t[0] - w[0], d1 = t[1] - w[1], d2 = t[2] - w[2];
  const q = new Float32Array(nx * ny);
  for (let p = 0; p < q.length; p++) if (g.ok[p]) q[p] = tintAlpha(Math.hypot(g.u[p], g.v[p]));
  const cx0 = new Int16Array(ni), cxr = new Int16Array(ni), cfx = new Float32Array(ni);
  for (let i = 0; i < ni; i++) { const gx = (i - f.off) / f.stride; cx0[i] = Math.floor(gx); cxr[i] = Math.round(gx); cfx[i] = gx - cx0[i]; }
  for (let y = 0; y < SEA_OUT_ROWS; y++) {
    const lat = latOfMercY(top + ((y + 0.5) / SEA_OUT_ROWS) * (bot - top)), gy = ((cw.lat1 - lat) / cw.dj - f.off) / f.stride;
    const yr = Math.round(gy), y0 = Math.floor(gy), fy = gy - y0;
    if (yr < 0 || yr >= ny) continue;
    const r0 = y0 >= 0 && y0 < ny ? y0 * nx : -1, r1 = y0 + 1 < ny && y0 + 1 >= 0 ? (y0 + 1) * nx : -1;
    for (let i = 0; i < ni; i++) {
      const xr = cxr[i];
      if (xr < 0 || xr >= nx || !g.ok[yr * nx + xr]) continue;
      const x0 = cx0[i], x1 = x0 + 1, fx = cfx[i], in0 = x0 >= 0 && x0 < nx, in1 = x1 < nx;
      let s = 0, n = 0;
      if (r0 >= 0) {
        if (in0 && g.ok[r0 + x0]) { const k = (1 - fx) * (1 - fy); s += k * q[r0 + x0]; n += k; }
        if (in1 && g.ok[r0 + x1]) { const k = fx * (1 - fy); s += k * q[r0 + x1]; n += k; }
      }
      if (r1 >= 0) {
        if (in0 && g.ok[r1 + x0]) { const k = (1 - fx) * fy; s += k * q[r1 + x0]; n += k; }
        if (in1 && g.ok[r1 + x1]) { const k = fx * fy; s += k * q[r1 + x1]; n += k; }
      }
      const a = n > 0 ? s / n : q[yr * nx + xr], o = (y * ni + i) * 4;
      out[o] = w[0] + d0 * a; out[o + 1] = w[1] + d1 * a; out[o + 2] = w[2] + d2 * a; out[o + 3] = 235;
    }
  }
  return out;
}

// --- Legend ---------------------------------------------------------------------------------------------------------------

const hex2 = (n: number) => n.toString(16).padStart(2, '0');
/** Colour stops of the area for the dock tile and the legend bar: m/s → colour (the tint is full from 1.28 m/s ≈ 2.5 kn). */
export const CUR_STOPS: ReadonlyArray<[number, string]> = [0, 0.1, 0.25, 0.5, 0.75, 1, 1.3].map((v) => { const c = areaRgb(v); return [v, `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}`] as [number, string]; });
/** Speeds the legend draws a front for (m/s; ≈ 0.2, 0.5, 1, 2 kn). */
export const LEGEND_SPEEDS = Object.freeze([0.1, 0.26, 0.51, 1.03]);
class PathText implements PathSink {
  d = '';
  private n = (x: number) => (Math.round(x * 10) / 10).toString();
  moveTo(x: number, y: number) { this.d += `M${this.n(x)} ${this.n(y)}`; }
  lineTo(x: number, y: number) { this.d += `L${this.n(x)} ${this.n(y)}`; }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) { this.d += `Q${this.n(cx)} ${this.n(cy)} ${this.n(x)} ${this.n(y)}`; }
}
/**
 * One front of the legend, drawn with the layer's own geometry in a flow towards the right: the SVG paths of the whole
 * front, its middle half and the relief line, the widths and alphas of the brief at full fade.
 */
export function legendFront(v: number, cx: number, cy: number, k = 0): { whole: string; crest: string; relief: string; width: number; a: number } | null {
  const f = newFront();
  if (frontPoints((_x, _y, o) => { o.dx = 1; o.dy = 0; o.v = v; return true; }, cx, cy, v, k, f) < 2) return null;
  const whole = new PathText(), crest = new PathText(), relief = new PathText(), [from, to] = crestRange(f);
  frontCurve(whole, f, 0, f.n - 1);
  frontCurve(crest, f, from, to);
  frontCurve(relief, f, 0, f.n - 1, -f.ux * RIPPLE.reliefPx, -f.uy * RIPPLE.reliefPx);
  return { whole: whole.d, crest: crest.d, relief: relief.d, width: frontLineWidth(k), a: packetAlpha(1, v) * frontFade(k) };
}

// --- Words ------------------------------------------------------------------------------------------------------------------

export const RIPPLE_LAYER_LABEL = 'Strömung';
export const RIPPLE_LEGEND_LINE = 'Bögen zeigen stromab · größer und heller = stärker';
/** Stands next to the layer with the model note of the current (`SEA_CURRENT_MODEL_NOTE`). */
export const RIPPLE_MOTION_NOTE = 'Die Bewegung zeigt Richtung und Stärke der Strömung, keine Wellen.';
export const RIPPLE_STILL_NOTE = 'Standbild: die Bewegung ist über „srstill=1“ im Link abgeschaltet.';
/** Why the layer has nothing to draw — the page writes „Keine Daten.“ in front of it; never an older field in its place. */
export const RIPPLE_WHY = Object.freeze({
  noField: 'Der Lauf der Strömungsvorhersage im Datenspeicher trägt noch kein Feld für diese Ebene.',
  outside: 'Die gewählte Stunde liegt außerhalb des Laufs der Strömungsvorhersage.',
  unreadable: 'Das Strömungsfeld dieser Stunde ist nicht lesbar oder gerade nicht erreichbar.',
});

/** Seeded random numbers (mulberry32) — the still frame and the verifier see the same particles every time. */
export function rippleRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
