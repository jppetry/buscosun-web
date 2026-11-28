/**
 * GM-12 B3 — terrain sun in the melt, measurement only. Shared data and model code of `gm12-sun.mjs` (no change under scripts/glacier/**).
 *
 * Sets
 *   E   judging set: Swiss summers 2012–2024 with a GLAMOS fixed-date summer balance, forcing S (temperature station + RhiresD + measured radiation
 *       of the temperature station × clear-sky elevation gain, missing hour = clear sky × 0.55), the whole hydrological year 1 Oct … 30 Sep.
 *   GC  gate C set (75 glacier years 2023–2025, the forcing of gate C): rebuild (control B) and second view.
 *   W   421 Swiss glacier winters 2011/12–2025/26 (forcing S, window t0 … t1 of the truth), as §3q.8/§3q.9.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { freemem as osFree } from 'node:os';
import { join } from 'node:path';
import { simulate, emptyState, cosZenith, clearSky, cloudFactor, MELT } from '../../scripts/glacier/lib/meltcore.mjs';
import { loadWinters } from '../../scripts/glacier/snowcal-fit.mjs';
import { attachRadiation } from '../../scripts/glacier/snowcal-fit2.mjs';
import { loadSunTable, sunEntryOf, sunC, sunSvf, diffuseShare, terrainG, SUN_RATIO_MAX, SUN_DIFFUSE_CLEAR, SUN_COSZ_MIN } from '../../scripts/glacier/lib/sunTable.mjs';

export const H = 3_600_000;
export const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const CACHE = 'C:/dev/buscosun-glacier-cache';
export const OUTDIR = join(CACHE, 'gm12/sun');
export function mem(label, log = console.log) {
  const gb = osFree() / 2 ** 30;
  log(`frei ${gb.toFixed(1)} GB (${label})`);
  if (gb < 1.5) { console.error('STOPP: weniger als 1,5 GB frei'); process.exit(3); }
  return gb;
}

// --- ids of the gate C file that differ from the catalogue (Part B step 3: the old SGI suffix) ----------------------------------------------
export const GC_ID = Object.freeze({
  'gl_ch_findelgletscher-b56-03': 'gl_ch_findelgletscher',
  'gl_ch_glacier-du-gietro-b82-14': 'gl_ch_glacier-du-gietro',
  'gl_ch_vadret-dal-murtel-e23-16': 'gl_ch_vadret-dal-murtel-g009821e46407n',
});
export const catId = (id) => GC_ID[id] ?? id;

// --- sun table -----------------------------------------------------------------------------------------------------------------------------------
let TABLE = null;
export function table() {
  if (TABLE) return TABLE;
  const r = loadSunTable(join(CACHE, 'gm11/sun-table.json'));
  if (!r.table) throw new Error(r.why);
  return (TABLE = r.table);
}
export function catalog() {
  const c = J(join(CACHE, 'gs/view/glacier/v1/static/20261120-1/catalog.json'));
  const m = new Map(); for (const g of c.glaciers) m.set(g.id, g);
  return m;
}
export function terrainParams() { return J(join(CACHE, 'gm11/terrain-params.json')).glaciers; }
/** sunDay of a glacier, mean of months (0-based), weighted by the pixel count of each level. */
export function sunDayOf(tp, id, months = [5, 6, 7, 8]) {
  const L = (tp[id]?.levels ?? []).filter((l) => l.sunDay);
  if (!L.length) return null;
  let s = 0, w = 0;
  for (const l of L) { const n = l.n || 1; for (const m of months) s += (n * l.sunDay[m]) / months.length; w += n; }
  return s / w;
}

// --- diffuse share from the clearness (decision 2): the rule of the operation on cf := G / clear sky; Erbs et al. 1982 as sensitivity ----------
const CF_MIN = cloudFactor(1);
export const dOper = (cf) => Math.min(1, Math.max(SUN_DIFFUSE_CLEAR, SUN_DIFFUSE_CLEAR + (1 - SUN_DIFFUSE_CLEAR) * (1 - cf) / (1 - CF_MIN)));
export function dErbs(kt) {
  const k = Math.min(1, Math.max(0, kt));
  const f = k <= 0.22 ? 1 - 0.09 * k : k <= 0.8 ? 0.9511 - 0.1604 * k + 4.388 * k ** 2 - 16.638 * k ** 3 + 12.336 * k ** 4 : 0.165;
  return Math.min(1, Math.max(0, f));
}

/**
 * Terrain radiation of ONE band: the formula of `terrainG` (sunTable.mjs) with the diffuse share d per hour given by the caller.
 *   g       flat hourly radiation [W m⁻²] (index i = hour from t0Ms + i h)
 *   zClear  elevation of the clear-sky reference for the clearness (station height of a measured G; the same scale cancels for forcing S)
 */
export function terrainBand({ entry, zM, g, lat, lon, t0Ms, zClear, dMode = 'oper' }) {
  const T = table(), n = g.length, out = new Float64Array(n), svf = sunSvf(entry, zM);
  for (let i = 0; i < n; i++) {
    const gi = g[i];
    if (!(gi > 0)) { out[i] = Number.isFinite(gi) ? 0 : gi; continue; }
    const cz = cosZenith(lat, lon, t0Ms + (i + 0.5) * H);
    const cs = clearSky(cz, zClear);
    const kt = cs > 0 ? gi / cs : 1;
    const d = dMode === 'erbs' ? dErbs(kt) : dOper(Math.min(1, kt));
    const direct = cz < SUN_COSZ_MIN ? 0 : Math.min(sunC(T, entry, zM, t0Ms + i * H) / cz, SUN_RATIO_MAX);
    out[i] = gi * ((1 - d) * direct + d * svf);
  }
  return out;
}
/** Self-check of terrainBand against terrainG of the operation: same d ⇒ same numbers bit for bit (used in control A). */
export function terrainSelfCheck(entry, zM, lat, lon, t0Ms, n = 24 * 40) {
  const gFlat = new Float64Array(n), nn = new Float64Array(n);
  for (let i = 0; i < n; i++) { const cz = cosZenith(lat, lon, t0Ms + (i + 0.5) * H); nn[i] = (i * 0.37) % 1; gFlat[i] = clearSky(cz, 2500) * cloudFactor(nn[i]); }
  const a = terrainG({ table: table(), entry, zM, gFlat, n: nn, cosZ: (i) => cosZenith(lat, lon, t0Ms + (i + 0.5) * H), t0Ms });
  // reproduce with terrainBand: pass d through the clearness by construction (g / clearSky(·, 2500) = cloudFactor(n))
  const b = terrainBand({ entry, zM, g: gFlat, lat, lon, t0Ms, zClear: 2500 });
  let maxRel = 0; for (let i = 0; i < n; i++) if (a[i] > 0) maxRel = Math.max(maxRel, Math.abs(a[i] - b[i]) / a[i]);
  return maxRel;
}

/** Permuted entry: the glacier's own elevations with another glacier's sun and sky view (control B4). */
export const permEntry = (own, other) => ({ z: own.z, lv: other.lv, svf: other.svf });

// --- the band model --------------------------------------------------------------------------------------------------------------------------------
/**
 * One record over an hour range with a radiation per band (`gb[b]`) or one flat series (`g`): band by band, each band its own `simulate` call with
 * corr = [the band's own multiplier], so that the per-band arithmetic is that of the multi-band call (control A).
 */
export function simBands(a, gb) {
  const nb = a.bands.zb.length, n = a.t.length;
  const corr = a.corr ?? a.bands.zb.map((z) => 1 + ((a.pGrad ?? MELT.pGrad) * (z - a.zP)) / 100);
  const bal = new Float64Array(nb), swe = new Float64Array(nb), aS = new Float64Array(nb), meltB = new Float64Array(nb);
  const meltH = new Float64Array(n);
  for (let b = 0; b < nb; b++) {
    const r = simulate({ ...a, bands: { zb: [a.bands.zb[b]], w: [1] }, g: gb ? gb[b] : a.g, corr: [corr[b]], state: { swe: [a.state.swe[b]], aS: [a.state.aS[b]] } });
    bal[b] = r.bal[0]; swe[b] = r.state.swe[0]; aS[b] = r.state.aS[0]; meltB[b] = r.meltSum;
    for (let h = 0; h < n; h++) meltH[h] += a.bands.w[b] * r.meltH[h];
  }
  return { bal, state: { swe, aS }, meltB, meltH, balance: a.bands.w.reduce((s, w, b) => s + w * bal[b], 0) };
}

// --- loaders ---------------------------------------------------------------------------------------------------------------------------------------
function fillGaps(a, maxGap = 3) {
  const out = Float64Array.from(a, (v) => (v == null ? NaN : v));
  for (let i = 0; i < out.length;) {
    if (Number.isNaN(out[i])) {
      let j = i; while (j < out.length && Number.isNaN(out[j])) j++;
      if (i > 0 && j < out.length && j - i <= maxGap) for (let k = i; k < j; k++) out[k] = out[i - 1] + ((out[j] - out[i - 1]) * (k - i + 1)) / (j - i + 1);
      i = j;
    } else i++;
  }
  return out;
}
/** Gate C set exactly as gate-c.mjs prepares it (+ glacier position from the catalogue for the sun). */
export function loadGateC() {
  const GC = join(CACHE, 'gate-c'), FROM_MS = Date.UTC(2022, 9, 1);
  const hourIdx = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - FROM_MS) / H);
  const forcing = {};
  const forcingOf = (abbr) => forcing[abbr] ??= (() => { const d = J(join(GC, `forcing-${abbr}.json`)); return { height: d.height, t: fillGaps(d.t), g: fillGaps(d.g), p: Float64Array.from(d.p, (v) => (v == null ? NaN : v)) }; })();
  const gy = J(join(GC, 'gy.json'));
  const hef = existsSync(join(GC, 'hef.json')) ? J(join(GC, 'hef.json')) : null;
  if (hef) gy.push(...hef.filter((x) => x.hef));
  const cat = catalog();
  const all = gy.map((o) => {
    const tg = forcingOf(o.tg), pp = forcingOf(o.pp);
    const sl = (a, i0, i1) => a.subarray(i0, i1);
    const w0 = hourIdx(o.year - 1, 10, 1), w1 = hourIdx(o.year, 5, 1), s1 = hourIdx(o.year, 10, 1);
    const gap = (a) => { let n = 0; for (let i = w1; i < s1; i++) if (Number.isNaN(a[i])) n++; return n / (s1 - w1); };
    const c = cat.get(catId(o.id));
    return {
      ...o, cid: catId(o.id), lat: c?.lat, lon: c?.lon, zMed: c?.z?.[1],
      bands: { zb: Float64Array.from(o.zb), w: Float64Array.from(o.w) }, zT: tg.height, zP: pp.height, zG: tg.height,
      win: { t: sl(tg.t, w0, w1), g: sl(tg.g, w0, w1), p: sl(pp.p, w0, w1) }, sum: { t: sl(tg.t, w1, s1), g: sl(tg.g, w1, s1), p: sl(pp.p, w1, s1) },
      t0Win: FROM_MS + w0 * H, t0Sum: FROM_MS + w1 * H, gapT: gap(tg.t), gapG: gap(tg.g),
    };
  });
  for (const o of all) o.usable = o.gapT <= 0.15 && o.gapG <= 0.15 && !(o.bs == null);
  return all;
}

/** GLAMOS fixed-date glacier-wide balances: key|year → { bw, bs, ba }. */
export function glamosFixdate() {
  const lines = readFileSync(join(CACHE, 'raw/glamos/massbalance_fixdate.csv'), 'utf8').split(/\r?\n/);
  const m = new Map();
  for (const L of lines) {
    const c = L.split(','); if (c.length < 8 || !/^\d{4}-/.test(c[4] ?? '')) continue;
    const y = +c[4].slice(0, 4), num = (s) => (s === '' || s == null || Number.isNaN(+s) ? null : +s);
    m.set(`${c[1]}|${y}`, { bw: num(c[5]), bs: num(c[6]), ba: num(c[7]) });
  }
  return m;
}

/** Set E: the hydrological year (1 Oct … 30 Sep) of every Swiss winter record 2012–2024 that has a fixed-date summer balance; forcing S. */
export function loadE(tmpDir) {
  const gm3 = join(CACHE, 'gm3');
  const truth = J(join(gm3, 'truth', 'gy.json')), fx = glamosFixdate();
  const gy = [];
  for (const o of truth.gy) {
    if (o.country !== 'CH' || o.year < 2012 || o.year > 2024) continue;
    const f = fx.get(`${o.key}|${o.year}`); if (f?.bs == null) continue;
    gy.push({ ...o, t1: `${o.year}-09-30`, bs: f.bs, bwFix: f.bw });
  }
  mkdirSync(tmpDir, { recursive: true });
  const p = join(tmpDir, 'e-truth.json'); writeFileSync(p, JSON.stringify({ ...truth, gy }));
  const { winters, fromMs, unusable } = loadWinters({ truthPath: p, cache: gm3 });
  attachRadiation(winters, (id) => J(join(gm3, `rad-${id}.json`)), fromMs);
  for (const r of winters) {
    const t0 = Date.parse(`${r.t0}T00:00:00Z`), may = Date.UTC(r.year, 4, 1);
    r.t0Ms = t0; r.split = Math.round((may - t0) / H);
    r.zbArr = Float64Array.from(r.b.map((x) => x.z)); r.wArr = Float64Array.from(r.b.map((x) => x.w));
    r.zG = r.zMed;   // forcing S: g carries the clear-sky gain to zMed, the clearness is the same against clear sky at zMed
  }
  return { recs: winters, unusable };
}

/** Set W: the 421 glacier winters of §3q.8/§3q.9. */
export function loadW(tmpDir) {
  const gm3 = join(CACHE, 'gm3'), w26 = join(CACHE, 'gm11/w26');
  mkdirSync(tmpDir, { recursive: true });
  const sub = (doc, name, f) => { const p = join(tmpDir, name); writeFileSync(p, JSON.stringify({ ...doc, gy: doc.gy.filter(f) })); return p; };
  const prep = (truthPath, cache) => { const { winters, fromMs, unusable } = loadWinters({ truthPath, cache }); attachRadiation(winters, (id) => J(join(cache, `rad-${id}.json`)), fromMs); return { winters, unusable }; };
  const A = prep(sub(J(join(gm3, 'truth', 'gy.json')), 'wa.json', (o) => o.country === 'CH' && o.year >= 2012 && o.year <= 2025), gm3);
  const B = prep(sub(J(join(w26, 'gy-2526.json')), 'wb.json', (o) => o.country === 'CH' && o.year === 2026), w26);
  const recs = [...A.winters, ...B.winters].sort((a, b) => a.key.localeCompare(b.key) || a.year - b.year);
  for (const r of recs) { r.t0Ms = Date.parse(`${r.t0}T00:00:00Z`); r.zbArr = Float64Array.from(r.b.map((x) => x.z)); r.wArr = Float64Array.from(r.b.map((x) => x.w)); r.zG = r.zMed; r.meas = r.b.reduce((s, x) => s + x.w * x.bw, 0); }
  return { recs, unusable: [...A.unusable, ...B.unusable] };
}

// --- statistics ------------------------------------------------------------------------------------------------------------------------------------
export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
export const quant = (a, q) => { const s = a.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y); if (!s.length) return null; const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
export function ols(y, X) {
  // y: n, X: n × k (with intercept column if wanted); normal equations by Gauss–Jordan
  const k = X[0].length, A = Array.from({ length: k }, () => new Float64Array(k + 1));
  for (let i = 0; i < y.length; i++) for (let a = 0; a < k; a++) { for (let b = 0; b < k; b++) A[a][b] += X[i][a] * X[i][b]; A[a][k] += X[i][a] * y[i]; }
  for (let c = 0; c < k; c++) {
    let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c]; if (Math.abs(d) < 1e-12) return null;
    for (let j = c; j <= k; j++) A[c][j] /= d;
    for (let r = 0; r < k; r++) if (r !== c) { const f = A[r][c]; for (let j = c; j <= k; j++) A[r][j] -= f * A[c][j]; }
  }
  return A.map((r) => r[k]);
}
export const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);
export { simulate, emptyState, cosZenith, clearSky, MELT, sunEntryOf, writeFileSync, mkdirSync, join, existsSync };
