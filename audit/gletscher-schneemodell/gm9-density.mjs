#!/usr/bin/env node
/**
 * Phase GM-9 (V-GM-50) — new-snow density against temperature, wind and wet-bulb temperature.
 * Measuring tool, not part of the product. Method frozen in audit/gletscher-schneemodell/gm9-method-frozen.md (sha256 in gm9-method-frozen.sha256).
 *
 *   node audit/gletscher-schneemodell/gm9-density.mjs --cache=<gm3 cache> --dwd=<gm9 dwd cache> --mode=count
 *   node audit/gletscher-schneemodell/gm9-density.mjs --cache=<gm3 cache> --dwd=<gm9 dwd cache> --mode=score --out=<report.json>
 *
 * `count` loads and counts only (no density is printed); `score` refuses to run unless the frozen method file matches its hash file.
 *
 * Data (all cleared, see §4 of audit/gletscher-schneemodell.md):
 *  - CH: SLF study plots (Q6; HN_1D, HNW_1D from the same board, 06 UTC) with the SwissMetNet station within 3 km / 200 m (Q21; hourly T, wind, RH).
 *  - AT: GeoSphere klima-v2-1d (Q7; new snow by hand, gauge precipitation, daily mean T and wind) — density from the GAUGE, descriptive only.
 *  - DE: DWD CDC daily water_equiv (total-snowpack water equivalent, Mon/Wed/Fri) with daily kl at the same station — increment density, descriptive only.
 * Downloads go to the cache outside the repo, never into buscosun-data.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { smnStations, smnHourly, klimaStations, hav } from '../../scripts/glacier/snowcal-forcing.mjs';
import { boardDepth } from '../../scripts/glacier/snowcal-density.mjs';
import { SNOW, newSnowDensity } from '../../scripts/glacier/lib/snowcore.mjs';

// ---- constants of the measurement (origins in the frozen method) ----------------------------------------------------------------
export const G9 = Object.freeze({
  // CH events: the GM-3 §B admission, unchanged (set in gm3-method-frozen.md)
  pairKm: 3, pairDh: 200, gamma: -0.0065, hnMin: 3, hnwMin: 2, tHours: 20, tMax: 1, rhoMin: 20, rhoMax: 400, years: [2012, 2025],
  rhMinHours: 20,                       // set: hours with RH for a wet-bulb mean
  bands: { CH: [[0, 1500], [1500, 2000], [2000, 9999]], AT: [[1000, 1500], [1500, 2000], [2000, 9999]], DE: [[0, 1000], [1000, 9999]] },
  tClasses: [[-99, -8], [-8, -3], [-3, 99]],   // °C, as GM-3 (−8 / −3)
  uClasses: [[0, 2], [2, 4], [4, 99]],         // m/s, as GM-3 undercatch classes
  constNow: 96,                                 // measured, GM-3 D2 (`board` today)
  clip: [20, 400],                              // kg/m³, clip of every fitted rule = admission bounds (set)
  irls: { iters: 200, eps: 1e-4 },
  gain: 0.05, gainVsNow: 0.05, winterShare: 0.6, highBand: 2000, highMin: 100, highWorse: -0.02, simpler: 0.02,
  seed: 20261124,
  at: { minAlt: 1000, hn: 3, rr: 2, tMax: -1, years: [2016, 2025] },
  de: { minAlt: 800, gapDays: 3, dhMin: 5, dsweMin: 2, years: [2012, 2026] },
});
const H = 3_600_000;
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const quant = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const hyearOf = (ms) => { const d = new Date(ms); return d.getUTCMonth() >= 9 ? d.getUTCFullYear() + 1 : d.getUTCFullYear(); };
const inSeason = (ms) => { const m = new Date(ms).getUTCMonth(); return m >= 10 || m <= 3; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

/** Wet-bulb temperature (°C) from air temperature (°C) and relative humidity (%), Stull 2011 (J. Appl. Meteor. Climatol. 50, 2267) — literature. */
export function wetBulb(t, rh) {
  if (t == null || rh == null) return null;
  const r = Math.min(99, Math.max(5, rh));
  return t * Math.atan(0.151977 * Math.sqrt(r + 8.313659)) + Math.atan(t + r) - Math.atan(r - 1.676331) + 0.00391838 * r ** 1.5 * Math.atan(0.023101 * r) - 4.686035;
}

// ---- CH: board events ------------------------------------------------------------------------------------------------------------
export async function loadCH(cache) {
  const fromMs = Date.parse('2011-09-01T00:00:00Z'), toMs = Date.parse('2025-06-01T00:00:00Z');
  const smn = await smnStations(cache);
  const rows = readFileSync(join(cache, 'slf', 'stations.csv'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => l.split(','));
  const h = Object.fromEntries(rows[0].map((c, i) => [c, i]));
  const pairs = new Map();
  for (const r of rows.slice(1)) {
    const p = { code: r[h.station_code], label: r[h.label], lon: +r[h.lon], lat: +r[h.lat], z: +r[h.elevation] };
    const c = smn.map((s) => ({ s, km: hav(p.lon, p.lat, s.lon, s.lat) })).filter((x) => x.km <= G9.pairKm && Math.abs(x.s.height - p.z) <= G9.pairDh).sort((a, b) => a.km - b.km)[0];
    if (c) pairs.set(p.code, { ...p, smn: c.s.id, smnHeight: c.s.height, km: Math.round(c.km * 10) / 10 });
  }
  const met = new Map();
  for (const p of pairs.values()) if (!met.has(p.smn)) met.set(p.smn, await smnHourly(cache, p.smn, { t: 'tre200h0', u: 'fkl010h0', rh: 'ure200h0' }, fromMs, toMs));
  const events = [], counts = { days: 0, small: 0, noWater: 0, fewT: 0, warm: 0, badDensity: 0, admitted: 0, noWind: 0, fewRh: 0, scored: 0 };
  const text = readFileSync(join(cache, 'slf', 'all-stations.csv'), 'utf8');
  let pos = text.indexOf('\n') + 1;
  while (pos < text.length) {
    let end = text.indexOf('\n', pos); if (end < 0) end = text.length;
    const line = text.slice(pos, end); pos = end + 1;
    const code = line.slice(0, line.indexOf(',')), p = pairs.get(code);
    if (!p) continue;
    const c = line.split(',');
    const ms = Date.parse(c[1].replace(' ', 'T'));
    if (!(ms >= fromMs + 25 * H && ms < toMs) || !inSeason(ms)) continue;
    const hy = hyearOf(ms); if (hy < G9.years[0] || hy > G9.years[1]) continue;
    counts.days++;
    const hn = c[4] === '' ? null : +c[4], hnw = c[5] == null || c[5].trim() === '' ? null : +c[5];
    if (hn == null || !(hn >= G9.hnMin)) { counts.small++; continue; }
    if (hnw == null) { counts.noWater++; continue; }
    if (!(hnw >= G9.hnwMin)) { counts.small++; continue; }
    const m = met.get(p.smn), iEnd = Math.round((ms - fromMs) / H) - 1;
    const t = [], u = [], rh = [];
    for (let i = iEnd - 23; i <= iEnd; i++) { t.push(m.t[i] == null ? null : m.t[i] + G9.gamma * (p.z - p.smnHeight)); u.push(m.u[i]); rh.push(m.rh[i]); }
    const tOk = t.filter((v) => v != null);
    if (tOk.length < G9.tHours) { counts.fewT++; continue; }
    if (Math.max(...tOk) > G9.tMax) { counts.warm++; continue; }
    const rho = hnw / (hn / 100);
    if (!(rho >= G9.rhoMin && rho <= G9.rhoMax)) { counts.badDensity++; continue; }
    counts.admitted++;
    const tm = mean(tOk), tf = t.map((v) => (v == null ? tm : v));
    const uOk = u.every((v) => v != null), rhN = rh.filter((v) => v != null).length;
    if (!uOk) counts.noWind++;
    if (rhN < G9.rhMinHours) counts.fewRh++;
    const scored = uOk && rhN >= G9.rhMinHours;
    if (scored) counts.scored++;
    let tw = null;
    if (rhN >= G9.rhMinHours) { const rm = mean(rh.filter((v) => v != null)); tw = tf.map((v, k) => wetBulb(v, rh[k] ?? rm)); }
    events.push({ code, ms, hy, z: p.z, hn, hnw, rho, t: tf, tMean: tm, u: uOk ? u : null, uMean: uOk ? mean(u) : null, sqrtU: uOk ? mean(u.map(Math.sqrt)) : null, tw, twMean: tw ? mean(tw) : null, scored });
  }
  return { pairs: [...pairs.values()], events, counts };
}

// ---- AT: gauge-based, descriptive ----------------------------------------------------------------------------------------------
export async function loadAT(cache) {
  const st = (await klimaStations(cache, '1d')).filter((s) => s.height >= G9.at.minAlt);
  const ev = [], counts = { stationsInCache: 0, stationsWithNewSnow: 0, admitted: 0, noWind: 0 };
  for (const s of st) {
    const file = join(cache, 'geosphere', `raw-1d-${s.id}.json`);
    if (!existsSync(file)) continue; // only what GM-3 fetched; no new download
    counts.stationsInCache++;
    const j = JSON.parse(readFileSync(file, 'utf8')), f = j.features?.[0]; if (!f) continue;
    const P = f.properties.parameters, rr = P.rr?.data, hn = P.shneu_manu?.data, tl = P.tl_mittel?.data, vv = P.vv_mittel?.data;
    if (!rr || !hn || !hn.some((v) => v > 0)) continue;
    counts.stationsWithNewSnow++;
    const cov = (lag) => { let x = 0; for (let i = 1; i < hn.length; i++) if (hn[i] > 0 && rr[i - lag] > 0) x += hn[i] * rr[i - lag]; return x; };
    const lag = cov(1) >= cov(0) ? 1 : 0;
    for (let i = 1; i < hn.length; i++) {
      const ms = Date.parse(j.timestamps[i]); if (!inSeason(ms)) continue;
      const hy = hyearOf(ms); if (hy < G9.at.years[0] || hy > G9.at.years[1]) continue;
      const k = i - lag;
      if (!(hn[i] >= G9.at.hn) || !(rr[k] >= G9.at.rr) || tl?.[k] == null || !(tl[k] <= G9.at.tMax)) continue;
      const rho = rr[k] / (hn[i] / 100); if (!(rho >= G9.rhoMin && rho <= G9.rhoMax)) continue;
      counts.admitted++;
      if (vv?.[k] == null) counts.noWind++;
      ev.push({ code: s.id, name: s.name, z: s.height, hy, hn: hn[i], hnw: rr[k], rho, tMean: tl[k], uMean: vv?.[k] ?? null });
    }
  }
  return { events: ev, counts };
}

// ---- DE: DWD water_equiv + kl, descriptive -------------------------------------------------------------------------------------
const DWD = 'https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/daily';
async function cachedText(path, url) {
  if (!existsSync(path)) { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); writeFileSync(path, Buffer.from(await r.arrayBuffer())); }
  return readFileSync(path, 'latin1');
}
async function listing(dir, sub) {
  const p = join(dir, `listing-${sub.replace(/\//g, '_')}.html`);
  return [...(await cachedText(p, `${DWD}/${sub}/`)).matchAll(/href="([^"]+\.zip)"/g)].map((m) => m[1]);
}
async function zipProduct(dir, sub, name) {
  const p = join(dir, 'zip', name);
  mkdirSync(join(dir, 'zip'), { recursive: true });
  if (!existsSync(p)) { const r = await fetch(`${DWD}/${sub}/${name}`); if (!r.ok) return null; writeFileSync(p, Buffer.from(await r.arrayBuffer())); await new Promise((res) => setTimeout(res, 150)); }
  const out = spawnSync('unzip', ['-p', p, 'produkt*'], { encoding: 'latin1', maxBuffer: 1 << 28 });
  if (out.status !== 0) return null;
  return out.stdout;
}
function parseProduct(txt) {
  if (!txt) return [];
  const lines = txt.split(/\r?\n/).filter(Boolean), head = lines[0].split(';').map((s) => s.trim());
  return lines.slice(1).map((l) => { const c = l.split(';').map((s) => s.trim()); const o = {}; head.forEach((k, i) => { o[k] = c[i]; }); return o; });
}
const num = (v) => { const x = Number(v); return v == null || v === '' || !Number.isFinite(x) || x === -999 ? null : x; };
export async function loadDE(dir) {
  const st = readFileSync(join(dir, 'stations-recent.txt'), 'latin1').split(/\r?\n/).slice(2).filter((l) => l.trim()).map((l) => { const p = l.trim().split(/\s+/); return { id: p[0], from: p[1], to: p[2], z: +p[3], lat: +p[4], lon: +p[5], name: p.slice(6, -2).join(' ') }; });
  const pick = st.filter((s) => s.z >= G9.de.minAlt && s.to >= `${G9.de.years[0] - 1}1001` && s.from <= `${G9.de.years[1]}0501`);
  const waHist = await listing(dir, 'water_equiv/historical'), waRec = await listing(dir, 'water_equiv/recent');
  const klHist = await listing(dir, 'kl/historical'), klRec = await listing(dir, 'kl/recent');
  const ev = [], counts = { stations: pick.length, withKl: 0, pairsOfDays: 0, admitted: 0, noT: 0, warm: 0 };
  const perStation = [];
  for (const s of pick) {
    const rowsWa = [], rowsKl = [];
    for (const n of waHist.filter((x) => x.includes(`_Wa_${s.id}_`))) rowsWa.push(...parseProduct(await zipProduct(dir, 'water_equiv/historical', n)));
    for (const n of waRec.filter((x) => x.includes(`_Wa_${s.id}_`))) rowsWa.push(...parseProduct(await zipProduct(dir, 'water_equiv/recent', n)));
    for (const n of klHist.filter((x) => x.includes(`_KL_${s.id}_`))) rowsKl.push(...parseProduct(await zipProduct(dir, 'kl/historical', n)));
    for (const n of klRec.filter((x) => x.includes(`_KL_${s.id}_`))) rowsKl.push(...parseProduct(await zipProduct(dir, 'kl/recent', n)));
    if (rowsKl.length) counts.withKl++;
    const kl = new Map(rowsKl.map((r) => [r.MESS_DATUM, { t: num(r.TMK), tx: num(r.TXK), u: num(r.FM), rh: num(r.UPM) }]));
    const wa = new Map(); for (const r of rowsWa) { const sw = num(r.WASH_6), hs = num(r.SH_TAG); if (sw != null && hs != null) wa.set(r.MESS_DATUM, { sw, hs }); }
    const days = [...wa.keys()].sort();
    let n = 0;
    for (let k = 1; k < days.length; k++) {
      const d0 = days[k - 1], d1 = days[k];
      const ms0 = Date.UTC(+d0.slice(0, 4), +d0.slice(4, 6) - 1, +d0.slice(6, 8)), ms1 = Date.UTC(+d1.slice(0, 4), +d1.slice(4, 6) - 1, +d1.slice(6, 8));
      const gap = Math.round((ms1 - ms0) / 86_400_000);
      if (gap < 1 || gap > G9.de.gapDays || !inSeason(ms1)) continue;
      const hy = hyearOf(ms1); if (hy < G9.de.years[0] || hy > G9.de.years[1]) continue;
      counts.pairsOfDays++;
      const a = wa.get(d0), b = wa.get(d1), dh = b.hs - a.hs, dsw = b.sw - a.sw;
      if (!(dh >= G9.de.dhMin) || !(dsw >= G9.de.dsweMin)) continue;
      const rho = dsw / (dh / 100); if (!(rho >= G9.rhoMin && rho <= G9.rhoMax)) continue;
      // weather of the days after d0 up to the day before d1 (the 06 UTC reading of d1 closes the interval)
      const w = []; for (let ms = ms0; ms < ms1; ms += 86_400_000) { const key = new Date(ms).toISOString().slice(0, 10).replace(/-/g, ''); if (kl.has(key)) w.push(kl.get(key)); }
      const tOk = w.filter((x) => x.t != null);
      if (tOk.length < gap) { counts.noT++; ev.push({ code: s.id, name: s.name, z: s.z, hy, dh, dsw, rho, gap, tMean: null, uMean: null, twMean: null }); n++; continue; }
      if (Math.max(...w.map((x) => x.tx ?? x.t)) > G9.tMax) { counts.warm++; continue; }
      counts.admitted++; n++;
      const um = w.every((x) => x.u != null) ? mean(w.map((x) => x.u)) : null;
      const twm = w.every((x) => x.rh != null) ? mean(w.map((x) => wetBulb(x.t, x.rh))) : null;
      ev.push({ code: s.id, name: s.name, z: s.z, hy, dh, dsw, rho, gap, tMean: mean(tOk.map((x) => x.t)), uMean: um, twMean: twm });
    }
    perStation.push({ id: s.id, name: s.name, z: s.z, waRows: rowsWa.length, klRows: rowsKl.length, intervals: n });
  }
  return { events: ev, counts, perStation };
}

// ---- tables ------------------------------------------------------------------------------------------------------------------
const inCls = (v, [lo, hi]) => v != null && v >= lo && v < hi;
const clsName = ([lo, hi]) => `${lo <= -98 ? '<' : lo}${lo <= -98 ? hi : hi >= 98 ? '+' : `…${hi}`}`;
function table(ev, bands, xKey, yKey, xCls, yCls) {
  const out = [];
  for (const b of bands) for (const xc of xCls) {
    const row = { band: `${b[0]}–${b[1] >= 9999 ? '' : b[1]}`, x: clsName(xc), cells: [] };
    for (const yc of yCls) {
      const e = ev.filter((v) => v.z >= b[0] && v.z < b[1] && inCls(v[xKey], xc) && inCls(v[yKey], yc));
      row.cells.push({ y: clsName(yc), n: e.length, p50: e.length ? Math.round(quant(e.map((v) => v.rho), 0.5)) : null, p10: e.length >= 10 ? Math.round(quant(e.map((v) => v.rho), 0.1)) : null, p90: e.length >= 10 ? Math.round(quant(e.map((v) => v.rho), 0.9)) : null });
    }
    const e = ev.filter((v) => v.z >= b[0] && v.z < b[1] && inCls(v[xKey], xc));
    row.all = { n: e.length, p50: e.length ? Math.round(quant(e.map((v) => v.rho), 0.5)) : null };
    out.push(row);
  }
  return out;
}
const q3 = (ev) => ({ n: ev.length, p10: r1(quant(ev.map((e) => e.rho), 0.1)), p50: r1(quant(ev.map((e) => e.rho), 0.5)), p90: r1(quant(ev.map((e) => e.rho), 0.9)) });

// ---- fitting (weighted least absolute deviation on log ρ*, IRLS) ------------------------------------------------------------
function solve(A, b) { // small dense Gauss-Jordan
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) return null;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
export function wlad(X, y, w) {
  const p = X[0].length; let beta = new Array(p).fill(0), ww = [...w];
  for (let it = 0; it < G9.irls.iters; it++) {
    const A = Array.from({ length: p }, () => new Array(p).fill(0)), b = new Array(p).fill(0);
    for (let i = 0; i < y.length; i++) for (let j = 0; j < p; j++) { b[j] += ww[i] * X[i][j] * y[i]; for (let k = 0; k < p; k++) A[j][k] += ww[i] * X[i][j] * X[i][k]; }
    const nb = solve(A, b); if (!nb) break;
    const moved = nb.some((v, j) => Math.abs(v - beta[j]) > 1e-9); beta = nb;
    for (let i = 0; i < y.length; i++) { let r = y[i]; for (let j = 0; j < p; j++) r -= X[i][j] * beta[j]; ww[i] = w[i] / Math.max(Math.abs(r), G9.irls.eps); }
    if (!moved) break;
  }
  return beta;
}
/** Deposition density (constant over the 24 h) that makes the core's board show the measured new snow — bisection. */
export function rhoStar(e) {
  let lo = 15, hi = 600;
  for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (boardDepth(e.hnw, e.t, () => mid) > e.hn) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
const clip = (r) => Math.min(G9.clip[1], Math.max(G9.clip[0], r));

// Candidate rules. `x(e, h)` = predictor row of hour h (fitted forms are log-linear); `lit(e, h)` = literature density as printed.
const hourly = {
  T: (e, h) => e.t[h], Tw: (e, h) => e.tw[h], sU: (e, h) => Math.sqrt(e.u[h]),
};
export const RULES = [
  { id: 'C0', label: 'Konstante 96 (heute, `board`)', kind: 'fixed', rho: () => G9.constNow },
  { id: 'C1', label: 'Konstante, je Rückhaltung neu geschätzt', kind: 'fit', x: () => [1] },
  { id: 'F1', label: 'log ρ = a + b·T + c·√u', kind: 'fit', x: (e, h) => [1, hourly.T(e, h), hourly.sU(e, h)], tw: true },
  { id: 'F2', label: 'log ρ = a + b·Tw + c·√u', kind: 'fit', x: (e, h) => [1, hourly.Tw(e, h), hourly.sU(e, h)], tw: true },
  { id: 'F3', label: 'log ρ = a + b·T (nur Temperatur)', kind: 'fit', x: (e, h) => [1, hourly.T(e, h)] },
  { id: 'F4', label: 'log ρ = a + c·√u (nur Wind)', kind: 'fit', x: (e, h) => [1, hourly.sU(e, h)] },
  { id: 'L1', label: 'Vionnet 2012 wie gedruckt (109 + 6·T + 26·√u)', kind: 'lit', lit: (e, h) => newSnowDensity({ rule: 'vionnet', tC: e.t[h], uMs: e.u[h] }) },
  { id: 'L2', label: 'Anderson 1976 (50 + 1,7·(Tw + 15)^1,5)', kind: 'lit', lit: (e, h) => (e.tw[h] >= -15 ? 50 + 1.7 * (e.tw[h] + 15) ** 1.5 : 50) },
  { id: 'L3', label: 'Hedstrom & Pomeroy 1998 (67,92 + 51,25·e^(T/2,59))', kind: 'lit', lit: (e, h) => 67.92 + 51.25 * Math.exp(Math.min(0, e.t[h]) / 2.59) },
  { id: 'L1s', label: 'k × Vionnet 2012', kind: 'scale', base: 'L1' },
  { id: 'L2s', label: 'k × Anderson 1976', kind: 'scale', base: 'L2' },
  { id: 'L3s', label: 'k × Hedstrom & Pomeroy 1998', kind: 'scale', base: 'L3' },
];
export const TW_RULES = ['F1', 'F2', 'L1', 'L1s']; // forms with temperature (or wet-bulb) AND wind: they answer Jan's question
const PARAMS = { C0: 0, C1: 1, F1: 3, F2: 3, F3: 2, F4: 2, L1: 0, L2: 0, L3: 0, L1s: 1, L2s: 1, L3s: 1 };
// measured inputs a rule needs in the product: T, u, RH (wet-bulb needs T and RH)
const INPUTS = { C0: 0, C1: 0, F1: 2, F2: 3, F3: 1, F4: 1, L1: 2, L2: 2, L3: 1, L1s: 2, L2s: 2, L3s: 1 };
const complexity = (id) => PARAMS[id] + INPUTS[id];

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

export function score(evAll) {
  const ev = evAll.filter((e) => e.scored);
  for (const e of ev) e.rs = rhoStar(e), e.lrs = Math.log(e.rs);
  const winters = [...new Set(ev.map((e) => e.hy))].sort();
  const meanRow = (e, f) => { const rows = Array.from({ length: 24 }, (_, h) => f(e, h)); return rows[0].map((_, j) => mean(rows.map((r) => r[j]))); };
  const litOf = (id) => RULES.find((r) => r.id === id).lit;
  const res = {};
  const fitPredict = (rule, train, test) => {
    if (rule.kind === 'fixed') return test.map((e) => () => rule.rho());
    if (rule.kind === 'lit') return test.map((e) => (h) => rule.lit(e, h));
    if (rule.kind === 'scale') {
      const lit = litOf(rule.base);
      const y = train.map((e) => e.lrs - Math.log(mean(Array.from({ length: 24 }, (_, h) => lit(e, h)))));
      const [lk] = wlad(train.map(() => [1]), y, train.map((e) => e.hn));
      return test.map((e) => (h) => clip(Math.exp(lk) * lit(e, h)));
    }
    const beta = wlad(train.map((e) => meanRow(e, rule.x)), train.map((e) => e.lrs), train.map((e) => e.hn));
    return test.map((e) => (h) => { const x = rule.x(e, h); let s = 0; for (let j = 0; j < x.length; j++) s += x[j] * beta[j]; return clip(Math.exp(s)); });
  };
  const run = (rule, data, perm = null) => {
    const err = new Map(), lr = new Map(), coefs = [];
    for (const w of winters) {
      const train = data.filter((e) => e.hy !== w), test = data.filter((e) => e.hy === w);
      if (!test.length) continue;
      const pred = fitPredict(rule, perm ? perm(train) : train, test);
      test.forEach((e, k) => {
        const d = boardDepth(e.hnw, e.t, pred[k]);
        err.set(e, d - e.hn);
        lr.set(e, Math.log(e.hnw / (d / 100)) - Math.log(e.hnw / (e.hn / 100))); // log(model board density) − log(measured)
      });
    }
    return { err, lr };
  };
  const summarize = (r, data) => {
    const e = data.map((x) => r.err.get(x)), l = data.map((x) => r.lr.get(x));
    return { n: data.length, mae: mean(e.map(Math.abs)), bias: mean(e), madLog: mean(l.map(Math.abs)), sseLog: l.reduce((s, v) => s + v * v, 0) };
  };
  for (const rule of RULES) res[rule.id] = run(rule, ev);
  // negative control: F1 with the weather of other events (permuted within the training set)
  const rand = rng(G9.seed);
  const permute = (train) => { const idx = train.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } return train.map((e, i) => ({ ...e, t: train[idx[i]].t, u: train[idx[i]].u, tw: train[idx[i]].tw })); };
  res.NC = run(RULES.find((r) => r.id === 'F1'), ev, permute);
  const high = ev.filter((e) => e.z >= G9.highBand);
  const table1 = {};
  for (const id of [...RULES.map((r) => r.id), 'NC']) {
    const s = summarize(res[id], ev), c1 = summarize(res.C1, ev), c0 = summarize(res.C0, ev);
    const perW = winters.map((w) => { const d = ev.filter((e) => e.hy === w); return { w, n: d.length, mae: summarize(res[id], d).mae, c1: summarize(res.C1, d).mae }; });
    const hs = high.length ? summarize(res[id], high) : null, hc = high.length ? summarize(res.C1, high) : null;
    table1[id] = {
      ...s, gainVsC1: 1 - s.mae / c1.mae, gainVsC0: 1 - s.mae / c0.mae,
      spreadExplainedMad: 1 - s.madLog / c1.madLog, spreadExplainedR2: 1 - s.sseLog / c1.sseLog,
      wintersBetter: perW.filter((x) => x.mae < x.c1).length, winters: perW.length,
      high: hs ? { n: hs.n, mae: hs.mae, c1: hc.mae, gain: 1 - hs.mae / hc.mae } : null, params: PARAMS[id] ?? 3,
    };
  }
  // verdict, as frozen
  const carries = (id) => { const r = table1[id]; return r.gainVsC1 >= G9.gain && r.gainVsC0 >= G9.gainVsNow && r.wintersBetter / r.winters >= G9.winterShare && (!r.high || r.high.n < G9.highMin || r.high.gain >= G9.highWorse); };
  const ncPasses = table1.NC.gainVsC1 >= G9.gain;
  const cand = RULES.map((r) => r.id).filter((id) => !['C0', 'C1'].includes(id) && carries(id)).sort((a, b) => table1[a].mae - table1[b].mae);
  let chosen = cand[0] ?? null;
  if (chosen) for (const id of cand) if (complexity(id) < complexity(chosen) && 1 - table1[chosen].mae / table1[id].mae < G9.simpler) chosen = id;
  const twCarries = TW_RULES.filter(carries);
  const verdict = ncPasses ? 'void (negative control passes)' : twCarries.length ? 'yes' : 'no';
  // full-data fit of every fitted rule, for the record
  const full = {};
  for (const rule of RULES.filter((r) => r.kind === 'fit')) full[rule.id] = wlad(ev.map((e) => meanRow(e, rule.x)), ev.map((e) => e.lrs), ev.map((e) => e.hn)).map((v) => Math.round(v * 1e4) / 1e4);
  for (const rule of RULES.filter((r) => r.kind === 'scale')) { const lit = litOf(rule.base); full[rule.id] = [Math.round(Math.exp(wlad(ev.map(() => [1]), ev.map((e) => e.lrs - Math.log(mean(Array.from({ length: 24 }, (_, h) => lit(e, h))))), ev.map((e) => e.hn))[0]) * 1e4) / 1e4]; }
  // bias of the constant 96 per cell (where it is wrong)
  const biasC0 = [];
  for (const tc of G9.tClasses) for (const uc of G9.uClasses) { const d = ev.filter((e) => inCls(e.tMean, tc) && inCls(e.uMean, uc)); if (d.length) biasC0.push({ t: clsName(tc), u: clsName(uc), n: d.length, bias: r1(mean(d.map((e) => res.C0.err.get(e)))), rhoStarP50: r1(quant(d.map((e) => e.rs), 0.5)) }); }
  return { n: ev.length, winters, table: table1, carries: Object.fromEntries(Object.keys(table1).filter((k) => k !== 'NC').map((k) => [k, carries(k)])), negativeControlPasses: ncPasses, twCarries, chosen, verdict, full, biasC0, rhoStar: { p10: r1(quant(ev.map((e) => e.rs), 0.1)), p50: r1(quant(ev.map((e) => e.rs), 0.5)), p90: r1(quant(ev.map((e) => e.rs), 0.9)) } };
}

// ---- main ------------------------------------------------------------------------------------------------------------------------
async function main() {
  const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
  const cache = arg('cache'), dwd = arg('dwd'), mode = arg('mode', 'count'), t0 = Date.now();
  const frozenP = join(import.meta.dirname, 'gm9-method-frozen.md'), hashP = join(import.meta.dirname, 'gm9-method-frozen.sha256');
  const ch = await loadCH(cache);
  console.log('CH', JSON.stringify({ pairs: ch.pairs.length, sites: new Set(ch.events.map((e) => e.code)).size, ...ch.counts, winters: [...new Set(ch.events.filter((e) => e.scored).map((e) => e.hy))].length, scoredFrom2000: ch.events.filter((e) => e.scored && e.z >= 2000).length }));
  const at = await loadAT(cache);
  console.log('AT', JSON.stringify({ ...at.counts, sites: new Set(at.events.map((e) => e.code)).size }));
  const de = await loadDE(dwd);
  console.log('DE', JSON.stringify({ ...de.counts, sites: new Set(de.events.map((e) => e.code)).size }));
  if (mode === 'count') {
    const cnt = (ev, bands) => bands.map((b) => ({ band: b, n: ev.filter((e) => e.z >= b[0] && e.z < b[1]).length }));
    console.log('per band (counts only)', JSON.stringify({ CH: cnt(ch.events.filter((e) => e.scored), G9.bands.CH), AT: cnt(at.events, G9.bands.AT), DE: cnt(de.events.filter((e) => e.tMean != null), G9.bands.DE) }));
    console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
    return;
  }
  const sha = createHash('sha256').update(readFileSync(frozenP)).digest('hex');
  const want = readFileSync(hashP, 'utf8').trim().split(/\s+/)[0];
  if (sha !== want) throw new Error(`gm9-method-frozen.md does not match its hash (${sha} vs ${want})`);
  const T = G9.tClasses, U = G9.uClasses;
  const chS = ch.events.filter((e) => e.scored);
  const report = {
    kind: 'glacier/gm9-density-report', generated: new Date().toISOString(), method: { file: 'audit/gletscher-schneemodell/gm9-method-frozen.md', sha256: sha }, constants: G9,
    data: { CH: { ...ch.counts, sites: new Set(chS.map((e) => e.code)).size }, AT: { ...at.counts, sites: new Set(at.events.map((e) => e.code)).size }, DE: { ...de.counts, sites: new Set(de.events.map((e) => e.code)).size, perStation: de.perStation } },
    tables: {
      CH: { all: q3(chS), byBand: G9.bands.CH.map((b) => ({ band: b, ...q3(chS.filter((e) => e.z >= b[0] && e.z < b[1])) })), tByU: table(chS, G9.bands.CH, 'tMean', 'uMean', T, U), twByU: table(chS, G9.bands.CH, 'twMean', 'uMean', T, U) },
      AT: { note: 'density from the gauge (undercatch, GM-3 D: gauge = 0.70 of the board in CH)', all: q3(at.events), byBand: G9.bands.AT.map((b) => ({ band: b, ...q3(at.events.filter((e) => e.z >= b[0] && e.z < b[1])) })), tByU: table(at.events, G9.bands.AT, 'tMean', 'uMean', T, U) },
      DE: { note: 'increment density ΔSWE/ΔHS of the total snowpack over 1–3 days', all: q3(de.events.filter((e) => e.tMean != null)), withoutT: q3(de.events.filter((e) => e.tMean == null)), byBand: G9.bands.DE.map((b) => ({ band: b, ...q3(de.events.filter((e) => e.tMean != null && e.z >= b[0] && e.z < b[1])) })), tByU: table(de.events.filter((e) => e.tMean != null), G9.bands.DE, 'tMean', 'uMean', T, U), twByU: table(de.events.filter((e) => e.twMean != null), G9.bands.DE, 'twMean', 'uMean', T, U) },
    },
  };
  report.score = score(ch.events);
  report.seconds = (Date.now() - t0) / 1000;
  writeFileSync(arg('out'), JSON.stringify(report, null, 1));
  console.log('verdict', report.score.verdict, 'chosen', report.score.chosen, 'twCarries', JSON.stringify(report.score.twCarries), `${report.seconds.toFixed(0)} s → ${arg('out')}`);
}
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) await main();
