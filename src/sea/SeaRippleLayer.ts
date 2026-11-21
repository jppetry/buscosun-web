/**
 * Phase SR — the ripple layer of the Seewetter map (`audit/seewetter-riffel.md`): a 2D canvas above the map canvas
 * (below the HTML markers), no WebGL, no shader. It draws what `RippleSim` holds: threads (B) and ripple packets with
 * up to three fronts (C); the colour area (A) is the map's own image layer under everything (`colourCurrentArea`).
 *
 * Frame rate: only through the `FrameGovernor` pattern of the wind layer (FPS-target mode, fed with the render
 * duration) — the frame rate ladder first, then shorter threads, fewer packets last (`RIPPLE_LADDER`). The loop stops
 * when the tab is hidden, the layer is off or the map is off stage.
 *
 * Phase SR-B (E-SR-15): the layer moves whatever the device says about reduced motion — as the wind layer does. ONE
 * still frame is the fallback `?srstill=1`; `?srtempo=lin` is the tempo before the phase (`rippleMotionFrom`).
 * Measured 19.11.2026 on a desktop GPU: 60 frames per second, 4–5 ms per frame (audit §7); no phone yet.
 */
import type maplibregl from 'maplibre-gl';
import { FrameGovernor } from '../wind/perfGovernor';
import type { SeaUvGrid } from './seaCurrent';
import {
  RIPPLE, RIPPLE_LADDER, RIPPLE_RGB, crestRange, frontCurve, frontFade, frontLineWidth, frontPoints, frontSpacing, loopPaints, makePxSampler, mercX, mercY, newFront,
  packetStrength, pointBehind, rgbCss, rippleCounts, rippleMotionFrom, rippleZoomIn, threadPositions, threadStrength, viewFromTwo, visibleWaterPx, zoomPacketScale,
  type Front, type PxSampler, type RippleLadder, type RippleView,
} from './seaRipples';
import { RippleSim } from './seaRippleSim';

/** A circle the layer leaves free, so a spot, gauge or station of the map below stays readable. */
export interface RippleKeepOut { lon: number; lat: number; r: number }

const FRAME_MS = 1000 / 60;
const REF_A: [number, number] = [6, 57], REF_B: [number, number] = [15, 53];
const M_A = { x: mercX(REF_A[0]), y: mercY(REF_A[1]) }, M_B = { x: mercX(REF_B[0]), y: mercY(REF_B[1]) };
const STILL_SEED = 7;

export class SeaRippleLayer {
  private readonly map: maplibregl.Map;
  /** The map's start view (west, south, east, north) — E-SR-22: fewer packets when zoomed in beyond it. */
  private readonly home: [number, number, number, number] | null;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly motion = rippleMotionFrom(typeof location !== 'undefined' ? location.search : '');
  private readonly sim = new RippleSim(STILL_SEED, this.motion.linear);
  private readonly ladder: RippleLadder;
  private readonly gov: FrameGovernor;
  private from: SeaUvGrid | null = null;
  private to: SeaUvGrid | null = null;
  private blendAt = 0;
  private active = true;
  private raf = 0;
  private last = 0;
  private level: number;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private keepOut: readonly RippleKeepOut[] = [];
  // V-SR-13: the last picture drawn on a map move — when, how long after the one before, and how long it took.
  private movedAt = -Infinity;
  private moveEvery = 0;
  private movePaintMs = 0;
  private dead = false;
  // Scratch (no allocation per frame).
  private readonly wx = new Float32Array(RIPPLE.threadLen + 2);
  private readonly wy = new Float32Array(RIPPLE.threadLen + 2);
  private readonly pool: Front[] = [];
  private fAlpha = new Float32Array(256);
  private fK = new Uint8Array(256);
  private readonly pt = { x: 0, y: 0 };

  constructor(map: maplibregl.Map, home: [number, number, number, number] | null = null) {
    this.map = map;
    this.home = home;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'sw-ripples';
    this.canvas.setAttribute('aria-hidden', 'true');
    // Directly above the map canvas: markers (callout, planner boat) come later in the container and stay on top.
    map.getCanvas().after(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    this.ladder = coarse ? RIPPLE_LADDER.coarse : RIPPLE_LADDER.fine;
    this.gov = new FrameGovernor({ fpsLadder: [...this.ladder.fps], trailLadder: [...this.ladder.trail] });
    this.level = this.gov.levelIndex;
    document.addEventListener('visibilitychange', this.kick);
    map.on('move', this.onMove);
    map.on('moveend', this.onSettle);
    map.on('resize', this.onResize);
    this.resize();
  }

  /** The chosen hour's field; `null` = nothing to draw (layer off, no data). A new field replaces the one before over `blendMs`. */
  setField(grid: SeaUvGrid | null): void {
    if (grid === this.to) return;
    if (!grid) { this.from = null; this.to = null; this.kick(); return; }
    this.from = this.to;
    this.to = grid;
    this.blendAt = performance.now();
    this.recount();
    this.kick();
  }
  /** Off while the map is not on stage (dossier): the loop stops, the canvas is empty. */
  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    // Back on stage: the map box may have been without a size in between.
    if (on) { this.resize(); this.recount(); }
    this.kick();
  }
  setKeepOut(list: readonly RippleKeepOut[]): void {
    this.keepOut = list;
    if (!this.raf && this.shown()) this.repaint();
  }
  destroy(): void {
    this.dead = true;
    this.stop();
    document.removeEventListener('visibilitychange', this.kick);
    this.map.off('move', this.onMove);
    this.map.off('moveend', this.onSettle);
    this.map.off('resize', this.onResize);
    this.canvas.remove();
  }

  // --- loop ---------------------------------------------------------------------------------------------------------

  private shown(): boolean { return !this.dead && this.active && !!this.to; }
  private still(): boolean { return this.motion.still; }
  private stop(): void { if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; } }
  /** Decides what runs: nothing, the still frame, or the loop. Called on every change of field, stage and tab. */
  private kick = (): void => {
    if (this.dead) return;
    if (!this.shown()) { this.stop(); this.clear(); return; }
    if (this.still()) { this.stop(); this.stillFrame(); return; }
    if (document.hidden) { this.stop(); return; }      // the last picture stays; the loop resumes with the tab
    if (!this.raf) { this.last = 0; this.raf = requestAnimationFrame(this.frame); }
  };
  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    // FPS cap of the governor's current level.
    if (this.last && now - this.last < 1000 / this.gov.targetFps - 1.5) return;
    const dt = this.last ? Math.min(100, now - this.last) : FRAME_MS;
    this.last = now;
    const t0 = performance.now();
    const view = this.view(), sample = this.sampler(view, now);
    this.sim.step(view, sample, dt / FRAME_MS);
    // V-SR-13: while the map moves it draws the layer itself on every 'move' — one picture per frame, not two.
    const own = loopPaints(t0, this.movedAt, this.moveEvery);
    if (own) this.paint(view, sample, this.gov.targetFps);
    // Render duration, not the frame interval (the interval is pinned by the cap); the map's picture counts in place of the loop's.
    this.gov.feed(performance.now() - t0 + (own ? 0 : this.movePaintMs));
    if (this.gov.levelIndex !== this.level) { this.level = this.gov.levelIndex; this.recount(); }
    if (this.from && now - this.blendAt >= RIPPLE.blendMs) this.from = null;
  };
  /** One still frame: the same particles every time (seeded), after `stillFrames` steps, in their steady state. */
  private stillFrame(): void {
    if (!this.to) return;
    this.from = null;
    const view = this.view(), sample = this.sampler(view, performance.now());
    this.sim.reset(STILL_SEED);
    this.recount();
    for (let i = 0; i < RIPPLE.stillFrames; i++) this.sim.step(view, sample, 1);
    this.sim.settle();
    this.paint(view, sample, 60);
  }
  /** Redraw without a step — the map moved under the same particles. */
  private repaint(): void {
    if (!this.to) return;
    const view = this.view();
    this.paint(view, this.sampler(view, performance.now()), this.gov.targetFps);
  }
  private onMove = (): void => {
    if (!this.shown() || document.hidden) return;
    const t0 = performance.now();
    this.repaint();
    if (this.raf) { this.moveEvery = t0 - this.movedAt; this.movedAt = t0; this.movePaintMs = performance.now() - t0; }
  };
  private onSettle = (): void => {
    if (!this.shown()) return;
    if (this.still()) this.stillFrame(); else this.recount();
  };
  private onResize = (): void => { this.resize(); this.onSettle(); };

  // --- view -----------------------------------------------------------------------------------------------------------

  private resize(): void {
    const box = this.map.getContainer();
    this.w = box.clientWidth; this.h = box.clientHeight;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(this.w * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.h * this.dpr));
    this.canvas.style.width = `${this.w}px`; this.canvas.style.height = `${this.h}px`;
  }
  /** Two positions of the map give the whole view: it never rotates or tilts (`dragRotate: false`). */
  private view(): RippleView {
    return viewFromTwo(M_A, this.map.project(REF_A), M_B, this.map.project(REF_B), this.w, this.h);
  }
  private sampler(view: RippleView, now: number): PxSampler {
    const w = !this.from || this.still() ? 1 : Math.min(1, (now - this.blendAt) / RIPPLE.blendMs);
    return makePxSampler(view, this.from, this.to as SeaUvGrid, w);
  }
  /** Counts for the visible water, with the governor's packet lever and fewer packets when zoomed in (E-SR-22). */
  private recount(): void {
    if (!this.to || this.w < 1 || this.h < 1) return;
    const view = this.view();
    const c = rippleCounts(visibleWaterPx(this.sampler(view, performance.now()), this.w, this.h), this.ladder.packets[this.gov.levelIndex] * zoomPacketScale(rippleZoomIn(view, this.home)));
    this.sim.setCounts(c.tracers, c.packets);
  }

  // --- drawing ----------------------------------------------------------------------------------------------------------

  private clear(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  private paint(view: RippleView, sample: PxSampler, fps: number): void {
    const ctx = this.ctx, sim = this.sim;
    if (!ctx) return;
    this.clear();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const wx = this.wx, wy = this.wy;

    // B. Threads: the last positions as one 1 px line.
    const positions = threadPositions(fps, this.ladder.trail[this.gov.levelIndex]);
    ctx.strokeStyle = rgbCss(RIPPLE_RGB.thread); ctx.lineWidth = 1;
    for (let i = 0; i < sim.threads; i++) {
      if (!sim.tAlive[i]) continue;
      const a = sim.threadFade(i) * threadStrength(sim.tV[i]);
      if (a < 0.004) continue;
      const n = sim.threadWay(i, view, positions, wx, wy);
      if (n < 2) continue;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.moveTo(wx[0], wy[0]);
      for (let k = 1; k < n; k++) ctx.lineTo(wx[k], wy[k]);
      ctx.stroke();
    }

    // C. Fronts of every packet, collected first: three passes over all of them, so no relief line covers a light front.
    let nf = 0;
    const edge = 30;
    for (let i = 0; i < sim.packets; i++) {
      if (!sim.pAlive[i]) continue;
      const v = sim.pV[i], a = sim.packetFade(i) * packetStrength(v);
      if (a < 0.01) continue;
      const nWay = sim.packetWay(i, view, wx, wy), gap = frontSpacing(v);
      for (let k = 0; k < RIPPLE.fronts; k++) {
        if (!pointBehind(wx, wy, nWay, k * gap, this.pt)) break;
        const { x, y } = this.pt;
        if (x < -edge || y < -edge || x > this.w + edge || y > this.h + edge) continue;
        const fr = this.pool[nf] ?? (this.pool[nf] = newFront());
        if (frontPoints(sample, x, y, v, k, fr) < 2) continue;
        if (nf >= this.fAlpha.length) {
          const fa = new Float32Array(this.fAlpha.length * 2); fa.set(this.fAlpha); this.fAlpha = fa;
          const fk = new Uint8Array(this.fK.length * 2); fk.set(this.fK); this.fK = fk;
        }
        this.fAlpha[nf] = a * frontFade(k); this.fK[nf] = k; nf++;
      }
    }
    // Relief: the same curve 1.8 px upstream, dark.
    ctx.strokeStyle = rgbCss(RIPPLE_RGB.relief);
    for (let f = 0; f < nf; f++) {
      const fr = this.pool[f];
      ctx.globalAlpha = 0.5 * this.fAlpha[f]; ctx.lineWidth = frontLineWidth(this.fK[f]) + 0.6;
      ctx.beginPath();
      frontCurve(ctx, fr, 0, fr.n - 1, -fr.ux * RIPPLE.reliefPx, -fr.uy * RIPPLE.reliefPx);
      ctx.stroke();
    }
    // The whole front, light.
    ctx.strokeStyle = rgbCss(RIPPLE_RGB.front);
    for (let f = 0; f < nf; f++) {
      const fr = this.pool[f];
      ctx.globalAlpha = 0.55 * this.fAlpha[f]; ctx.lineWidth = frontLineWidth(this.fK[f]);
      ctx.beginPath();
      frontCurve(ctx, fr, 0, fr.n - 1);
      ctx.stroke();
    }
    // Its middle half, lightest.
    ctx.strokeStyle = rgbCss(RIPPLE_RGB.crest);
    for (let f = 0; f < nf; f++) {
      const fr = this.pool[f], [from, to] = crestRange(fr);
      if (to <= from) continue;
      ctx.globalAlpha = this.fAlpha[f]; ctx.lineWidth = frontLineWidth(this.fK[f]);
      ctx.beginPath();
      frontCurve(ctx, fr, from, to);
      ctx.stroke();
    }

    // Spots, gauges and stations of the map below stay free.
    if (this.keepOut.length) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1;
      ctx.beginPath();
      for (const k of this.keepOut) {
        const x = view.ax * mercX(k.lon) + view.bx, y = view.ay * mercY(k.lat) + view.by;
        if (x < -k.r || y < -k.r || x > this.w + k.r || y > this.h + k.r) continue;
        ctx.moveTo(x + k.r, y);
        ctx.arc(x, y, k.r, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }
}
