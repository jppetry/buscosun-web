/**
 * Regenradar — 3D-Punktansicht (Phase P3D): the little column. Canvas 2D in an oblique top-down view — no WebGL, no
 * shader, no map layer (the map's own custom layers stay untouched). Everything drawn has a datum behind it:
 *  - particle count and colour = rate class of the radar legend;
 *  - particle kind = phase (rain streaks, tumbling flakes, fast bright grains);
 *  - fall path tilt = atan(v_wind / v_fall) with the gust as a slow fluctuation, drift towards `dir + 180°`;
 *  - ground plate with north, a steel arrow for the wind (towards), a terracotta arrow for the cell's motion.
 * `prefers-reduced-motion` → one still frame; a hidden tab pauses the loop.
 */
import { useEffect, useRef } from 'react';
import { fallSpeedMs, particleCount, rateColor, type ProbePhase } from './probeModel';

/** One world unit of the column in metres — the illustration's scale (`set`), so a 5-m/s drop crosses it in ≈ 1,3 s. */
export const WORLD_UNIT_M = 4;
/** Column height in world units (ground plate is 2 × 2). */
export const COLUMN_H = 1.6;
/** Streak length of a drop = velocity × this (s). */
const STREAK_S = 0.06;
/** Ground foreshortening of the oblique view; the height is drawn 1 : 1 with east–west, so the tilt on screen IS α. */
const VIEW_K = 0.45;
const VIEW_V = 1.0;
const MAX_DT_S = 0.05;

export interface StageInput {
  rateMmH: number | null;
  phase: ProbePhase | null;
  windMs: number | null;
  windDirDeg: number | null;
  gustMs: number | null;
  cellBearingDeg: number | null;
  cellSpeedKmh: number | null;
}

// Command-Deck (hell, Sand/Ink): particle tones from the `--np-*` tokens and the radar legend, lines in Ink/Stone.
const COLOR_SNOW = '#7F90DC';        // between --np-snow-2 and --np-snowline — flakes readable on cream
const COLOR_SLEET = '#A47DC9';       // --np-mix
const COLOR_HAIL = '#C0307A';        // --np-hail
const COLOR_RAIN_LIGHT = 'rgb(95,165,235)'; // legend stop 0,2 mm/h — the 0,06 stop is too pale on cream
const COLOR_LINE = 'rgba(44,42,38,0.34)';
const COLOR_LINE_SOFT = 'rgba(44,42,38,0.14)';
const COLOR_LINE_FADE = 'rgba(44,42,38,0)';
const COLOR_TEXT = '#8B7355';        // stone-500
const COLOR_WIND = '#3A6FA8';        // steel-600
const COLOR_CELL = '#C97B47';        // terracotta-500

interface Particle { x: number; y: number; z: number; ph: number; r: number }

class ColumnRenderer {
  private ps: Particle[] = [];
  private last = 0;
  private t = 0;
  private raf: number | null = null;
  private input: StageInput = { rateMmH: null, phase: null, windMs: null, windDirDeg: null, gustMs: null, cellBearingDeg: null, cellSpeedKmh: null };
  private still = false;
  private paused = false;
  constructor(private canvas: HTMLCanvasElement) {}

  setInput(i: StageInput, still: boolean): void {
    this.input = i;
    this.still = still;
    this.sync();
    if (still) { this.stop(); this.scatter(); this.draw(0); return; }
    this.start();
  }
  setPaused(p: boolean): void { this.paused = p; if (p) this.stop(); else if (!this.still) this.start(); }
  dispose(): void { this.stop(); }

  private start(): void {
    if (this.raf != null || this.paused) return;
    this.last = 0;
    const loop = (ts: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = this.last ? Math.min(MAX_DT_S, (ts - this.last) / 1000) : 0;
      this.last = ts;
      this.t += dt;
      this.step(dt);
      this.draw(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }
  private stop(): void { if (this.raf != null) { cancelAnimationFrame(this.raf); this.raf = null; } }

  /** Particle count follows the rate; new ones start anywhere in the column (no visible „top edge" burst). */
  private sync(): void {
    // Hail: fewer, larger grains for the same rate (`set`) — a hailstone is a big, rare particle.
    const n = this.input.phase ? Math.round(particleCount(this.input.rateMmH ?? 0) * (this.input.phase === 'hail' ? 0.55 : 1)) : 0;
    while (this.ps.length > n) this.ps.pop();
    while (this.ps.length < n) this.ps.push({ x: rnd(-1, 1), y: rnd(-1, 1), z: rnd(0, COLUMN_H), ph: rnd(0, Math.PI * 2), r: rnd(0.7, 1.3) });
  }
  private scatter(): void { for (const p of this.ps) { p.x = rnd(-1, 1); p.y = rnd(-1, 1); p.z = rnd(0, COLUMN_H); } }

  /** Velocity (world units / s) of the particles right now: fall + wind drift with the gust fluctuation. */
  private velocity(): { vx: number; vy: number; vz: number; vFall: number } {
    const i = this.input;
    const vFall = i.phase ? fallSpeedMs(i.phase, i.rateMmH ?? 0) : 0;
    const w = i.windMs ?? 0;
    const g = i.gustMs != null && i.gustMs > w ? i.gustMs : w;
    // Slow, bounded fluctuation between mean wind and gust (`set`): no datum says when the gust comes, only that it does.
    const f = Math.max(0, Math.min(1, 0.5 + 0.5 * Math.sin(this.t * 0.7) * Math.sin(this.t * 1.9 + 0.8)));
    const wind = w + (g - w) * f;
    const d = i.windDirDeg;
    const towards = d != null ? ((d + 180) * Math.PI) / 180 : null;
    const vx = towards != null ? (Math.sin(towards) * wind) / WORLD_UNIT_M : 0;
    const vy = towards != null ? (Math.cos(towards) * wind) / WORLD_UNIT_M : 0;
    return { vx, vy, vz: -vFall / WORLD_UNIT_M, vFall };
  }

  private step(dt: number): void {
    if (!this.ps.length || dt <= 0) return;
    const { vx, vy, vz } = this.velocity();
    const snowy = this.input.phase === 'snow' || this.input.phase === 'sleet';
    for (const p of this.ps) {
      p.x += vx * dt; p.y += vy * dt; p.z += vz * dt * p.r;
      if (snowy) { p.x += Math.sin(this.t * 2.1 + p.ph) * 0.12 * dt; p.y += Math.cos(this.t * 1.7 + p.ph) * 0.12 * dt; }
      // Leaving the column sideways ⇒ back in on the other side (the tilt is never capped).
      if (p.x > 1) p.x -= 2; else if (p.x < -1) p.x += 2;
      if (p.y > 1) p.y -= 2; else if (p.y < -1) p.y += 2;
      if (p.z < 0) { p.z += COLUMN_H; p.x = rnd(-1, 1); p.y = rnd(-1, 1); }
    }
  }

  private draw(_dt: number): void {
    const c = this.canvas, ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const S = Math.min(w * 0.31, (h * 0.86) / (COLUMN_H + 2 * VIEW_K)), cx = w / 2, cy = h * 0.5 + (S * (COLUMN_H - 2 * VIEW_K)) / 2 + S * VIEW_K * 0.3;
    const P = (x: number, y: number, z: number): [number, number] => [cx + x * S, cy - y * S * VIEW_K - z * S * VIEW_V];

    // Column: ground plate (lit from the front), back edges, particles, front edges — a depth cue without a z-buffer.
    const [gx0, gy0] = P(0, 1, 0), [, gy1] = P(0, -1, 0);
    const plate = ctx.createLinearGradient(gx0, gy0, gx0, gy1);
    plate.addColorStop(0, 'rgba(224,214,190,0.35)'); plate.addColorStop(1, 'rgba(224,214,190,0.85)');
    // Soft shadow under the front edge — the plate sits on the card.
    const sh = ctx.createLinearGradient(gx0, gy1, gx0, gy1 + S * 0.18);
    sh.addColorStop(0, 'rgba(44,42,38,0.10)'); sh.addColorStop(1, 'rgba(44,42,38,0)');
    ctx.fillStyle = sh;
    poly(ctx, [P(-1, -1, 0), P(1, -1, 0), [P(1, -1, 0)[0], P(1, -1, 0)[1] + S * 0.18], [P(-1, -1, 0)[0], P(-1, -1, 0)[1] + S * 0.18]], true, false);
    ctx.lineWidth = 1;
    ctx.strokeStyle = COLOR_LINE; ctx.fillStyle = plate;
    poly(ctx, [P(-1, -1, 0), P(1, -1, 0), P(1, 1, 0), P(-1, 1, 0)], true);
    this.edge(ctx, P(-1, 1, 0), P(-1, 1, COLUMN_H), COLOR_LINE_SOFT); this.edge(ctx, P(1, 1, 0), P(1, 1, COLUMN_H), COLOR_LINE_SOFT);

    this.drawGround(ctx, P);
    this.drawParticles(ctx, P);

    this.edge(ctx, P(-1, -1, 0), P(-1, -1, COLUMN_H), COLOR_LINE); this.edge(ctx, P(1, -1, 0), P(1, -1, COLUMN_H), COLOR_LINE);
    ctx.strokeStyle = COLOR_LINE; ctx.lineWidth = 1.2;
    line(ctx, P(-1, -1, 0), P(1, -1, 0));
    ctx.lineWidth = 1;
  }

  /** A vertical edge fading out towards the open top of the column. */
  private edge(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number], color: string): void {
    const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
    g.addColorStop(0, color); g.addColorStop(1, COLOR_LINE_FADE);
    ctx.strokeStyle = g; line(ctx, a, b);
  }

  private drawGround(ctx: CanvasRenderingContext2D, P: (x: number, y: number, z: number) => [number, number]): void {
    // North: a small arrow at the back edge of the plate.
    ctx.strokeStyle = COLOR_TEXT; ctx.fillStyle = COLOR_TEXT;
    arrow(ctx, P(0.82, 0.55, 0), P(0.82, 0.95, 0), 4);
    ctx.font = '700 9px "League Spartan", system-ui, sans-serif'; ctx.textAlign = 'center';
    const n = P(0.82, 1.12, 0); ctx.fillText('N', n[0], n[1] + 2);
    const i = this.input;
    // Wind: towards, length by speed (steel).
    if (i.windDirDeg != null && i.windMs != null && i.windMs > 0.3) {
      const a = ((i.windDirDeg + 180) * Math.PI) / 180;
      const L = Math.min(0.95, 0.25 + (i.windMs / 15) * 0.7);
      ctx.strokeStyle = COLOR_WIND; ctx.fillStyle = COLOR_WIND; ctx.lineWidth = 1.5;
      arrow(ctx, P(0, 0, 0), P(Math.sin(a) * L, Math.cos(a) * L, 0), 5);
    }
    // Cell motion: towards the bearing, length by speed (terracotta).
    if (i.cellBearingDeg != null) {
      const a = (i.cellBearingDeg * Math.PI) / 180;
      const L = Math.min(0.95, 0.3 + ((i.cellSpeedKmh ?? 30) / 80) * 0.65);
      ctx.strokeStyle = COLOR_CELL; ctx.fillStyle = COLOR_CELL; ctx.lineWidth = 2;
      arrow(ctx, P(-Math.sin(a) * 0.15, -Math.cos(a) * 0.15, 0), P(Math.sin(a) * L, Math.cos(a) * L, 0), 6);
    }
    ctx.lineWidth = 1;
  }

  private drawParticles(ctx: CanvasRenderingContext2D, P: (x: number, y: number, z: number) => [number, number]): void {
    const i = this.input;
    if (!this.ps.length || !i.phase) return;
    const { vx, vy, vz } = this.velocity();
    const phase = i.phase;
    const rate = i.rateMmH ?? 0;
    const color = phase === 'snow' ? COLOR_SNOW : phase === 'sleet' ? COLOR_SLEET : phase === 'hail' ? COLOR_HAIL : rate < 0.2 ? COLOR_RAIN_LIGHT : solid(rateColor(rate));
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineCap = 'round';
    const heavy = (i.rateMmH ?? 0) >= 5;
    ctx.lineWidth = heavy ? 1.6 : 1.1;
    let k = 0;
    for (const p of this.ps) {
      const a = P(p.x, p.y, p.z);
      // Depth cue: particles at the back of the plate a little fainter.
      ctx.globalAlpha = 0.6 + 0.4 * ((1 - p.y) / 2);
      if (phase === 'rain' || (phase === 'sleet' && (k++ & 1))) {
        const b = P(p.x - vx * STREAK_S * p.r, p.y - vy * STREAK_S * p.r, p.z - vz * STREAK_S * p.r);
        line(ctx, a, b);
      } else if (phase === 'hail') {
        ctx.beginPath(); ctx.arc(a[0], a[1], 1.8, 0, Math.PI * 2); ctx.fill();
        const b = P(p.x - vx * STREAK_S * 0.5, p.y - vy * STREAK_S * 0.5, p.z - vz * STREAK_S * 0.5);
        ctx.globalAlpha *= 0.25; line(ctx, a, b);
      } else {
        ctx.beginPath(); ctx.arc(a[0], a[1], 1.2 + 1.2 * p.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

function rnd(a: number, b: number): number { return a + Math.random() * (b - a); }
function line(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number]): void { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
function poly(ctx: CanvasRenderingContext2D, pts: Array<[number, number]>, fill: boolean, stroke = true): void {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath();
  if (fill) ctx.fill(); if (stroke) ctx.stroke();
}
function arrow(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number], head: number): void {
  line(ctx, a, b);
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  ctx.beginPath();
  ctx.moveTo(b[0], b[1]);
  ctx.lineTo(b[0] - head * Math.cos(ang - 0.5), b[1] - head * Math.sin(ang - 0.5));
  ctx.lineTo(b[0] - head * Math.cos(ang + 0.5), b[1] - head * Math.sin(ang + 0.5));
  ctx.closePath(); ctx.fill();
}
/** The legend colours carry an alpha for the map; the particle takes the hue at full strength. */
function solid(rgba: string): string {
  const m = /rgba?\(([^)]+)\)/.exec(rgba);
  if (!m) return rgba;
  const [r, g, b] = m[1].split(',').map((s) => Number(s.trim()));
  return `rgb(${r},${g},${b})`;
}

export default function ProbeStage({ input, className }: { input: StageInput; className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const rendRef = useRef<ColumnRenderer | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const r = new ColumnRenderer(c);
    rendRef.current = r;
    const onVis = () => r.setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); r.dispose(); rendRef.current = null; };
  }, []);
  useEffect(() => {
    const still = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    rendRef.current?.setInput(input, still);
  }, [input]);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
