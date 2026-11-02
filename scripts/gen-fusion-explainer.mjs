// scripts/gen-fusion-explainer.mjs — writes src/fusionExplainer/charts.ts (GENERATED, do not edit by hand).
// Schematic graphics for the start-page preview and the detail page "buscosun Fusion": NO measured data.
// One smooth temperature curve at a valley site from "now" (15:00 local) and five raw models with offset, drift,
// valley and same-day errors; a terrain cross-section; a 48-h output chart. Usage: node scripts/gen-fusion-explainer.mjs [target]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

// ---- the schematic weather (same functions for every graphic)
function night(t) {
  const h = (15 + t) % 24;
  const d = Math.min(Math.abs(h - 3), 24 - Math.abs(h - 3));
  return d < 6.5 ? Math.max(0, Math.cos(Math.PI * d / 13)) ** 1.4 : 0;
}
function truth(t) {
  const h = (15 + t) % 24;
  const base = 4.2 + 4.6 * Math.cos(2 * Math.PI * (h - 15) / 24) + 0.9 * Math.cos(4 * Math.PI * (h - 15) / 24 + 0.6);
  return base - 2.2 * night(t);
}
const valleyBias = (t) => 2.3 * night(t) - 0.6 * (1 - night(t));
const situational = (t) => 2.5 * Math.exp(-t / 9);
const MODELS = [[1.6, 1.4, 0.45, 0.3], [-0.9, -2.2, 0.35, 1.9], [0.5, 0.6, 0.55, 3.1], [2.3, -1.0, 0.30, 4.4], [-1.4, 2.6, 0.40, 5.6]];
const COLORS = ['#3A6FA8', '#7A9466', '#C8935F', '#6B7A8F', '#7C6BC4'];
function raw(i, t, kb = 1, kd = 1, kw = 1) {
  const [b, d, a, p] = MODELS[i];
  const wig = a * Math.sin(2 * Math.PI * t / 9 + p) + 0.5 * a * Math.sin(2 * Math.PI * t / 4.3 + 2 * p);
  return truth(t) + valleyBias(t) + situational(t) + kb * b + kd * d * t / 36 + kw * wig;
}
const corr = (i, t) => raw(i, t, 0.4, 0.4, 0.8);
const bundle = (t) => [0, 1, 2, 3, 4].reduce((s, i) => s + corr(i, t), 0) / 5;
const terrainT = (t) => bundle(t) - 0.85 * valleyBias(t);
const OFF0 = terrainT(0) - truth(0);
const anchored = (t) => terrainT(t) - OFF0 * Math.exp(-t / 6);
const half = (t) => 0.55 + 0.055 * t + 0.35 * night(t);
const NOISE = [0.2, -0.35, 0.5, -0.1, 0.3, -1.95, 0.15, 0.6, -0.3, 0.1, 3.3, 0.35];

function nightRects(ts, end, x) {
  const out = []; let inside = false, start = 0;
  for (const t of [...ts, end + 0.5]) {
    const n = t <= end ? night(t) > 0.15 : false;
    if (n && !inside) { inside = true; start = t; } else if (!n && inside) { inside = false; out.push([+f1(x(start)), +f1(x(Math.min(t, end)))]); }
  }
  return out;
}

// ---- 1) five step panels, viewBox 0 0 240 120, 36 h
const P = (() => {
  const X0 = 14, X1 = 232, Y_TOP = 12, Y_BOT = 108, T_MAX = 14.5, T_MIN = -5.0;
  const TS = Array.from({ length: 73 }, (_, i) => i * 0.5);
  const x = (t) => X0 + (X1 - X0) * t / 36;
  const y = (v) => Y_TOP + (Y_BOT - Y_TOP) * (T_MAX - v) / (T_MAX - T_MIN);
  const path = (fn) => 'M' + TS.map((t) => `${f1(x(t))} ${f1(y(fn(t)))}`).join(' L');
  const band = (lo, hi) => 'M' + [...TS.map((t) => `${f1(x(t))} ${f1(y(hi(t)))}`), ...[...TS].reverse().map((t) => `${f1(x(t))} ${f1(y(lo(t)))}`)].join(' L') + ' Z';
  const at = (fn, t) => [+f1(x(t)), +f1(y(fn(t)))];
  return {
    viewBox: '0 0 240 120',
    grid: [0, 5, 10].map((v) => +f1(y(v))),
    night: nightRects(TS, 36, x),
    raw: MODELS.map((_, i) => ({ d: path((t) => raw(i, t)), color: COLORS[i] })),
    corrected: MODELS.map((_, i) => ({ d: path((t) => corr(i, t)), color: COLORS[i] })),
    bundle: path(bundle),
    terrain: path(terrainT),
    anchored: path(anchored),
    terrainArrow: { from: at(bundle, 12.5), to: at(terrainT, 12.5) },
    obsNow: [+f1(x(0)), +f1(y(truth(0)))],
    band: band((t) => anchored(t) - half(t), (t) => anchored(t) + half(t)),
    later: NOISE.map((n, k) => { const t = 3 + 3 * k; return [+f1(x(t)), +f1(y(truth(t) + n))]; }),
  };
})();

// ---- 2) terrain cross-section, viewBox 0 0 640 270
const TERRAIN = (() => {
  const W = 640, H = 270, CELL = 80;
  const elev = (x) => 700 + 900 * Math.exp(-(((x - 90) / 75) ** 2)) + 1050 * Math.exp(-(((x - 445) / 85) ** 2)) + 520 * Math.exp(-(((x - 640) / 60) ** 2))
    - 380 * Math.exp(-(((x - 255) / 28) ** 2)) + 28 * Math.sin(x / 7.3) + 17 * Math.sin(x / 3.1 + 1.2) + 9 * Math.sin(x / 1.7);
  const ye = (e) => 214 - (e - 480) * 0.105;
  const xs = Array.from({ length: 321 }, (_, i) => i * 2);
  const real = xs.map((x) => [x, ye(elev(x))]);
  const line = 'M' + real.map(([x, y]) => `${x} ${f1(y)}`).join(' L');
  const cells = Array.from({ length: 8 }, (_, k) => { const seg = xs.filter((x) => x >= k * CELL && x < (k + 1) * CELL).map(elev); return ye(seg.reduce((a, b) => a + b, 0) / seg.length); });
  let stair = `M0 ${f1(cells[0])}`;
  cells.forEach((c, k) => { stair += ` L${k * CELL} ${f1(c)} L${(k + 1) * CELL} ${f1(c)}`; });
  const yc = ye(elev(255)) - 22;
  const pool = real.filter(([x, y]) => x >= 190 && x <= 330 && y > yc);
  const poolD = pool.length ? `M${pool[0][0]} ${f1(yc)} ` + pool.map(([x, y]) => `L${x} ${f1(y)}`).join(' ') + ` L${pool[pool.length - 1][0]} ${f1(yc)} Z` : '';
  return {
    viewBox: `0 0 ${W} ${H}`, cellWidth: CELL, line, area: `${line} L${W} ${H} L0 ${H} Z`, stair, pool: poolD,
    place: [256, +f1(ye(elev(256)))], modelYAtPlace: +f1(cells[3]), ridgeLabelY: Math.round(ye(elev(90)) - 18),
  };
})();

// ---- 3) output chart, viewBox 0 0 640 220, 48 h
const OUTPUT = (() => {
  const X0 = 20, X1 = 620, Y0 = 18, Y1 = 202, T_MAX = 14.5, T_MIN = -5.0;
  const TS = Array.from({ length: 97 }, (_, i) => i * 0.5);
  const x = (t) => X0 + (X1 - X0) * t / 48;
  const y = (v) => Y0 + (Y1 - Y0) * (T_MAX - v) / (T_MAX - T_MIN);
  const band = 'M' + [...TS.map((t) => `${f1(x(t))} ${f1(y(anchored(t) + half(t)))}`), ...[...TS].reverse().map((t) => `${f1(x(t))} ${f1(y(anchored(t) - half(t)))}`)].join(' L') + ' Z';
  const marker = (n, t, v) => ({ n, leftPct: +(x(t) / 640 * 100).toFixed(2), topPct: +(y(v) / 220 * 100).toFixed(2) });
  const READ_T = 16; // 07:00 next morning
  const r = (v) => Math.round(v);
  return {
    viewBox: '0 0 640 220', x0: X0, x1: X1,
    grid: [0, 5, 10].map((v) => +f1(y(v))),
    night: nightRects(TS, 48, x),
    band, p50: 'M' + TS.map((t) => `${f1(x(t))} ${f1(y(anchored(t)))}`).join(' L'),
    markers: [marker(1, READ_T, anchored(READ_T)), marker(2, 30, anchored(30) + half(30)), marker(3, 44, anchored(44) - half(44))],
    readout: { value: r(anchored(READ_T)), lo: r(anchored(READ_T) - half(READ_T)), hi: r(anchored(READ_T) + half(READ_T)) },
  };
})();

const target = process.argv[2] ?? 'src/fusionExplainer/charts.ts';
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `// GENERATED by scripts/gen-fusion-explainer.mjs — do not edit by hand.
// Schematic graphics of the buscosun Fusion explainer: NO measured data.
export const STEP_PANELS = ${JSON.stringify(P, null, 1)} as const;
export const TERRAIN = ${JSON.stringify(TERRAIN, null, 1)} as const;
export const OUTPUT = ${JSON.stringify(OUTPUT, null, 1)} as const;
`);
console.log(`written: ${target}`);
