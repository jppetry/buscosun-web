#!/usr/bin/env node
/**
 * GM-11 phase 1d part B — B1 (shared part), B2 (readable part), B3 (shuffle + synthetic). Rule: gm11-yearly-frozen.md, sha256 checked first.
 * Uses the original `simulate` (no diagnostic copy). Measured values per glacier winter only in the cache (--out); --public gets aggregates.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/gletscher-schneemodell/gm11-yearly-score.mjs \
 *     --cache=C:\dev\buscosun-glacier-cache --out=C:\dev\buscosun-glacier-cache\gm11\yearly [--public=<repo json>]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { MELT, simulate, emptyState } from '../../scripts/glacier/lib/meltcore.mjs';
import { precipRunOf } from '../../scripts/glacier/lib/snowcal.mjs';
import { loadWinters } from '../../scripts/glacier/snowcal-fit.mjs';
import { attachRadiation } from '../../scripts/glacier/snowcal-fit2.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = join(HERE, '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), '1']; }));
const CACHE = args.cache, OUT = args.out; mkdirSync(OUT, { recursive: true });
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const H = 3_600_000, D = 24 * H;
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quant = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const hav = (lat1, lon1, lat2, lon2) => { const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180; const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(((lon2 - lon1) * Math.PI) / 360) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(a)); };
const memLog = []; const mem = (l) => { const g = os.freemem() / 2 ** 30; memLog.push({ l, gb: r3(g) }); console.error(`[mem] ${l}: ${g.toFixed(2)} GB`); if (g < 3) throw new Error('STOPP: unter 3 GB frei'); };
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());

// ---- frozen rule ----
const frozen = readFileSync(join(HERE, 'gm11-yearly-frozen.md'), 'utf8').replace(/\r\n/g, '\n');
const ruleSha = createHash('sha256').update(frozen).digest('hex');
const wantSha = readFileSync(join(HERE, 'gm11-yearly-frozen.sha256'), 'utf8').trim().split(/\s+/)[0];
if (ruleSha !== wantSha) throw new Error(`Regel geändert: ${ruleSha} ≠ ${wantSha}`);
const R = Object.freeze({ nGrid: 81, fLo: 0.2, fHi: 8, kIter: 40, minOther: 3, minSeriesWinters: 8, validShare: 0.9, minS: 10, pairKm: 30, pairDzBelow: 800, maxPairs: 3, dzClass: 500,
  b1Km: 50, b1Min: 2, imisR2: 0.3, nBoot: 1000, seedBoot: 20261126, nShuf: 200, seedShuf: 20261127, seedSyn: 20261128, synLo: 0.8, synHi: 1.2,
  gainMin: 0.05, shufTol: 0.01, minGlaciers: 15, minRows: 100, lapse: -0.0065 });
const DATES = [[0, 1, '1. Jan'], [1, 1, '1. Feb'], [2, 1, '1. Mär'], [3, 1, '1. Apr']];
const fsOf = (t) => Math.min(1, Math.max(0, (MELT.fsWarm - t) / (MELT.fsWarm - MELT.fsCold)));
const report = { kind: 'gm11/yearly/b', generated: new Date().toISOString(), rule: { file: 'gm11-yearly-frozen.md', sha256: ruleSha }, mem: memLog };

// ================= glaciers: forcing, grid of B_mod(f), k* =================
mem('start');
const cal = J(join(REPO, 'scripts/glacier/melt-calibration.json')).fit;
const gm3 = join(CACHE, 'gm3'), w26 = join(CACHE, 'gm11/w26'), tmpd = join(OUT, 'tmp'); mkdirSync(tmpd, { recursive: true });
const sub = (doc, name, f) => { const p = join(tmpd, name); writeFileSync(p, JSON.stringify({ ...doc, gy: doc.gy.filter(f) })); return p; };
const prep = (truthPath, cache) => { const { winters, fromMs, unusable } = loadWinters({ truthPath, cache }); attachRadiation(winters, (id) => J(join(cache, `rad-${id}.json`)), fromMs); return { winters, unusable }; };
const A = prep(sub(J(join(gm3, 'truth', 'gy.json')), 'a.json', (o) => o.country === 'CH' && o.year >= 2012 && o.year <= 2025), gm3);
const B = prep(sub(J(join(w26, 'gy-2526.json')), 'b.json', (o) => o.country === 'CH' && o.year === 2026), w26);
const recs = [...A.winters, ...B.winters].sort((a, b) => a.key.localeCompare(b.key) || a.year - b.year);
mem('Gletscherwinter geladen');
const precip = precipRunOf(J(join(REPO, 'scripts/glacier/snow-calibration.json')), [...new Set(recs.map((r) => r.region))]);
const bandsOf = (rec) => ({ zb: rec.b.map((x) => x.z), w: rec.b.map((x) => x.w) });
const balOf = (rec, f) => simulate({ bands: bandsOf(rec), ela: rec.zMed, t: rec.t, g: rec.g, p: rec.p, zT: rec.zT, zP: rec.zMed, pf: f, TF: cal.TF, SRF: cal.SRF, state: emptyState(rec.b.length), pGrad: 0, model: 'eti' }).balance;
const measOf = (rec) => rec.b.reduce((s, x) => s + x.w * x.bw, 0);
const LF = Array.from({ length: R.nGrid }, (_, i) => Math.log(R.fLo) + (i * (Math.log(R.fHi) - Math.log(R.fLo))) / (R.nGrid - 1));
const meta = J(join(gm3, 'truth', 'gy.json')).gy.concat(J(join(w26, 'gy-2526.json')).gy);
const metaOf = new Map(meta.map((o) => [`${o.key}|${o.year}`, o]));
const G = [];   // glacier winters
let interpErr = [];
for (const [i, rec] of recs.entries()) {
  if (i % 60 === 0) mem(`Gitter ${i}/${recs.length}`);
  const grid = Float64Array.from(LF, (lf) => balOf(rec, Math.exp(lf)));
  const meas = measOf(rec);
  let k = null; { let lo = R.fLo, hi = R.fHi; const f = (x) => balOf(rec, x) - meas; if (f(lo) <= 0 && f(hi) >= 0) { for (let j = 0; j < R.kIter; j++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; } k = (lo + hi) / 2; } }
  const o = metaOf.get(`${rec.key}|${rec.year}`);
  // forcing S of the glacier at its median elevation, hourly, factor 1 (for OSHD)
  const t0 = Date.parse(`${rec.t0}T00:00:00Z`), Sday = new Map();
  for (let h = 0; h < rec.t.length; h++) { const tb = rec.t[h] + MELT.gamma * (rec.zMed - rec.zT), ph = Number.isFinite(rec.p[h]) ? rec.p[h] : NaN; const dms = Math.floor((t0 + h * H) / D) * D; if (!Number.isFinite(tb) || !Number.isFinite(ph)) { Sday.set(dms, NaN); continue; } const v = Sday.get(dms); if (!Number.isNaN(v)) Sday.set(dms, (v ?? 0) + ph * fsOf(tb)); }
  const row = { key: rec.key, name: rec.name, year: rec.year, region: rec.region, lat: o.lat, lon: o.lon, zMed: rec.zMed, meas, k, grid, F: precip.factorOf(rec.region), Sday };
  if (k != null) interpErr.push(Math.abs(interp(row, k) - meas));
  G.push(row);
}
function interp(row, f) { const lf = Math.log(f); const x = (lf - LF[0]) / (LF[1] - LF[0]); if (x <= 0) return row.grid[0]; if (x >= R.nGrid - 1) return row.grid[R.nGrid - 1]; const i = Math.floor(x), w = x - i; return row.grid[i] * (1 - w) + row.grid[i + 1] * w; }
mem('Gitter fertig');
report.glacierWinters = { all: G.length, withK: G.filter((g) => g.k != null).length, glaciers: new Set(G.map((g) => g.key)).size, interpErrMm: { median: r3(median(interpErr)), max: r3(Math.max(...interpErr)) } };
const byKey = new Map(); for (const g of G) { if (!byKey.has(g.key)) byKey.set(g.key, []); byKey.get(g.key).push(g); }
const kbarOf = (g, kOf = (x) => x.k) => { const o = byKey.get(g.key).filter((x) => x.year !== g.year).map(kOf).filter((v) => v != null); return o.length >= R.minOther ? mean(o) : null; };
for (const g of G) { g.kbar = kbarOf(g); g.ag = g.k != null && g.kbar ? g.k / g.kbar : null; }

// ================= B1 =================
{
  const rows = G.filter((g) => g.ag != null);
  const pairs = { all: [], near: [] };
  for (const g of rows) {
    const same = rows.filter((x) => x.year === g.year && x.key !== g.key);
    if (same.length) pairs.all.push([g.ag, median(same.map((x) => x.ag))]);
    const near = same.filter((x) => hav(g.lat, g.lon, x.lat, x.lon) <= R.b1Km);
    if (near.length >= R.b1Min) pairs.near.push([g.ag, median(near.map((x) => x.ag))]);
  }
  const r2 = (p) => { const x = p.map((v) => v[1]), y = p.map((v) => v[0]), mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < p.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return (sxy * sxy) / (sxx * syy); };
  const sdA = Math.sqrt(mean(rows.map((g) => (g.ag - 1) ** 2)));
  report.b1 = { glacierWinters: rows.length, sdAnomaly: r3(sdA), all: { n: pairs.all.length, r2: r3(r2(pairs.all)) }, within50km: { n: pairs.near.length, r2: r3(r2(pairs.near)) } };
  report.b1.imisQuestion = report.b1.all.r2 >= R.imisR2 || report.b1.within50km.r2 >= R.imisR2;
  mem('B1');
}

// ================= series =================
const sites = J(join(OUT, 'rhires-sites.json')), sitesW = J(join(OUT, 'rhires-sites-w26.json'));
const seriesAll = J(join(OUT, 'b0-series.json')).filter((s) => s.winters.length >= R.minSeriesWinters && sites.points[`${s.kind}:${s.id}`]);
const rDay = (key, ms) => { const p = sites.points[key], i = Math.round((ms - Date.parse(sites.day0 + 'T00:00:00Z')) / D); let v = p.p[i];
  if (ms >= Date.UTC(2025, 9, 1)) { const q = sitesW.points[key], j = sitesW.dates.indexOf(new Date(ms).toISOString().slice(0, 10)); v = j >= 0 ? q.p[j] : null; } return v; };
// SwissMetNet: hourly T (and htoauths) on demand
const smnMetaL = readFileSync(join(CACHE, 'gm11/w26/smn/ogd-smn_meta_stations.csv'), 'latin1').split(/\r?\n/), smh = smnMetaL[0].split(';'), smc = Object.fromEntries(smh.map((x, i) => [x, i]));
const smnMeta = new Map(); for (const l of smnMetaL.slice(1)) { if (!l) continue; const x = l.split(';'); smnMeta.set(x[smc.station_abbr], { abbr: x[smc.station_abbr], lat: +x[smc.station_coordinates_wgs84_lat], lon: +x[smc.station_coordinates_wgs84_lon], z: +x[smc.station_height_masl] }); }
const smnCache = new Map();
function smnRead(abbr) {
  if (smnCache.has(abbr)) return smnCache.get(abbr);
  const T = new Map(), HS = new Map();
  for (const f of [`raw-${abbr}-2010-2019.csv`, `raw-${abbr}-2020-2029.csv`]) {
    const p = existsSync(join(CACHE, 'gm11/w26/smn', f)) ? join(CACHE, 'gm11/w26/smn', f) : join(CACHE, 'gm3/smn', f); if (!existsSync(p)) continue;
    const lines = readFileSync(p, 'latin1').split(/\r?\n/), head = lines[0].split(';'), c = Object.fromEntries(head.map((x, i) => [x, i]));
    for (let i = 1; i < lines.length; i++) { const x = lines[i].split(';'); if (x.length < 3) continue; const ts = x[c.reference_timestamp];
      const ms = Date.UTC(+ts.slice(6, 10), +ts.slice(3, 5) - 1, +ts.slice(0, 2), +ts.slice(11, 13));
      if (x[c.tre200h0] !== '' && x[c.tre200h0] != null) T.set(ms, +x[c.tre200h0]);
      if (c.htoauths != null && x[c.htoauths] !== '' && x[c.htoauths] != null) HS.set(ms, +x[c.htoauths]); }
  }
  const o = { T, HS }; smnCache.set(abbr, o); return o;
}
/** daily mean T over 06 UTC D … 06 UTC D+1 (the RhiresD day); null below 20 hours */
function dayT(abbr, dms) { const { T } = smnRead(abbr); let s = 0, n = 0; for (let h = 7; h <= 30; h++) { const v = T.get(dms + h * H); if (v != null) { s += v; n++; } } return n >= 20 ? s / n : null; }
const smnWithT = [...smnMeta.values()].filter((s) => existsSync(join(CACHE, 'gm3/smn', `raw-${s.abbr}-2010-2019.csv`)) || existsSync(join(CACHE, 'gm11/w26/smn', `raw-${s.abbr}-2020-2029.csv`)));
const WINTERS = Array.from({ length: 15 }, (_, i) => 2012 + i);
const dateMs = (Y, di) => Date.UTC(Y, DATES[di][0], DATES[di][1]);
const series = [];
for (const s of seriesAll) {
  const key = `${s.kind}:${s.id}`;
  // nearest SMN with temperature (≥ 50 % of the hours 2011-10 … 2026-04)
  let tSt = null; for (const c of smnWithT.map((x) => ({ x, km: hav(s.lat, s.lon, x.lat, x.lon) })).sort((a, b) => a.km - b.km)) { const { T } = smnRead(c.x.abbr); if (T.size > 0.5 * 127_000) { tSt = { ...c.x, km: c.km }; break; } }
  const plot = new Map();
  if (s.kind === 'slf-plot') { for (const line of readFileSync(join(CACHE, 'gm3/slf/all-stations.csv'), 'utf8').split(/\r?\n/)) { if (!line.startsWith(s.id + ',')) continue; const x = line.split(','); if (x[4] !== '') plot.set(Date.UTC(+x[1].slice(0, 4), +x[1].slice(5, 7) - 1, +x[1].slice(8, 10)), +x[4]); } }
  else { const { HS } = smnRead(s.id); for (let ms = Date.UTC(2011, 9, 1); ms <= Date.UTC(2026, 4, 1); ms += D) { const a = HS.get(ms + 6 * H), b = HS.get(ms - D + 6 * H); if (a != null && b != null) plot.set(ms, Math.max(0, a - b)); } }
  const q = {};   // q[Y] = [q per date] or null
  for (const Y of WINTERS) {
    if (!s.winters.includes(Y)) continue;
    q[Y] = DATES.map((_, di) => { let hn = 0, S = 0; for (let ms = Date.UTC(Y - 1, 9, 1); ms < dateMs(Y, di); ms += D) { const r = rDay(key, ms), t = tSt ? dayT(tSt.abbr, ms) : null, h = plot.get(ms + D); if (r == null || t == null || h == null) continue; hn += h; S += r * fsOf(t + R.lapse * (s.z - tSt.z)); } return S >= R.minS ? hn / S : null; });
  }
  const a = {}; for (const Y of Object.keys(q)) a[Y] = DATES.map((_, di) => { const oth = Object.keys(q).filter((y) => y !== Y).map((y) => q[y][di]).filter((v) => v != null); return q[Y][di] != null && oth.length >= R.minOther ? q[Y][di] / mean(oth) : null; });
  series.push({ key, kind: s.kind, id: s.id, lat: s.lat, lon: s.lon, z: s.z, tStation: tSt?.abbr, tKm: r1(tSt?.km), a });
}
mem('Reihen');
// OSHD at the glacier
const oshd = J(join(OUT, 'oshd-dates.json')).glaciers;
for (const g of G) {
  const o = oshd[g.key]?.winters?.[String(g.year)]; g.qo = null; if (!o) continue;
  g.qo = DATES.map((_, di) => { let S = 0, bad = false; for (let ms = Date.UTC(g.year - 1, 9, 1); ms < dateMs(g.year, di); ms += D) { const v = g.Sday.get(ms); if (v == null || Number.isNaN(v)) { bad = true; continue; } S += v; } return o[0] == null || o[di + 1] == null || S < R.minS ? null : (o[di + 1] - o[0]) / S; });
}
for (const g of G) g.ao = g.qo ? DATES.map((_, di) => { const oth = byKey.get(g.key).filter((x) => x.year !== g.year && x.qo?.[di] != null).map((x) => x.qo[di]); return g.qo[di] != null && oth.length >= R.minOther ? g.qo[di] / mean(oth) : null; }) : null;

/** paired anomaly of glacier winter g at date di; yearOf maps the winter whose series values are used (shuffle) */
function pairOf(g, di, yearOf = (y) => y) {
  const Y = yearOf(g.year);
  const near = series.map((s) => ({ s, km: hav(g.lat, g.lon, s.lat, s.lon) })).filter((x) => x.km <= R.pairKm && x.s.z >= g.zMed - R.pairDzBelow && x.s.a[Y]?.[di] != null).sort((a, b) => a.km - b.km).slice(0, R.maxPairs);
  if (!near.length) return null;
  return { ap: median(near.map((x) => x.s.a[Y][di])), dz: g.zMed - near[0].s.z, n: near.length };
}

// ================= B2 / B3 =================
function score(rows, { beta1 = false, fold = 'lowo', base = 'G', truth = null }) {
  // rows: {g, ap, ag, kbar}; truth(g) → measured balance (synthetic replaces it)
  const fit = (train) => { let sxy = 0, sxx = 0; for (const r of train) { sxy += (r.ag - 1) * (r.ap - 1); sxx += (r.ap - 1) ** 2; } return sxx > 0 ? sxy / sxx : 0; };
  const betaCache = new Map();
  const out = [];
  for (const r of rows) {
    const fk = fold === 'lowo' ? `y${r.g.year}` : `g${r.g.key}`;
    if (!betaCache.has(fk)) betaCache.set(fk, beta1 ? 1 : fit(rows.filter((x) => (fold === 'lowo' ? x.g.year !== r.g.year : x.g.key !== r.g.key))));
    const beta = betaCache.get(fk), ahat = 1 + beta * (r.ap - 1), b0 = base === 'G' ? r.kbar : r.g.F;
    const meas = truth ? truth(r) : r.g.meas;
    out.push({ r, e0: Math.abs(interp(r.g, b0) - meas), e: Math.abs(interp(r.g, Math.max(R.fLo, b0 * ahat)) - meas), beta });
  }
  return out;
}
const gainOf = (sc) => { const e0 = mean(sc.map((x) => x.e0)), e = mean(sc.map((x) => x.e)); return { mm: e0 - e, pct: (e0 - e) / e0, e0, e }; };
function boot(sc, seed) { const yrs = [...new Set(sc.map((x) => x.r.g.year))], by = new Map(yrs.map((y) => [y, sc.filter((x) => x.r.g.year === y)])), rn = rng(seed), out = [];
  for (let b = 0; b < R.nBoot; b++) { let e0 = 0, e = 0; for (let i = 0; i < yrs.length; i++) for (const x of by.get(yrs[Math.floor(rn() * yrs.length)])) { e0 += x.e0; e += x.e; } out.push((e0 - e) / e0); } return quant(out, 0.1); }
const rowsFor = (di, kind, yearOf) => G.filter((g) => g.ag != null).map((g) => { if (kind === 'oshd') { const ap = g.ao?.[di]; return ap == null ? null : { g, ap, ag: g.ag, kbar: g.kbar, dz: null }; } const p = pairOf(g, di, yearOf); return p ? { g, ap: p.ap, ag: g.ag, kbar: g.kbar, dz: p.dz } : null; }).filter(Boolean);
const shuffleYearOf = (rn) => { const ys = [...WINTERS]; for (let i = ys.length - 1; i > 0; i--) { const j = Math.floor(rn() * (i + 1)); [ys[i], ys[j]] = [ys[j], ys[i]]; } const m = new Map(WINTERS.map((y, i) => [y, ys[i]])); return (y) => m.get(y); };

const full = { rows: {} };
report.b2 = {}; report.b3 = {};
for (const kind of ['measured', 'oshd']) {
  report.b2[kind] = {}; report.b3[kind] = {};
  for (const [di, [, , label]] of DATES.entries()) {
    mem(`${kind} ${label}`);
    const rows = rowsFor(di, kind);
    full.rows[`${kind}|${di}`] = rows.map((r) => ({ key: r.g.key, year: r.g.year, ap: r.ap, ag: r.ag, dz: r.dz }));
    const nGl = new Set(rows.map((r) => r.g.key)).size;
    const res = {};
    for (const beta1 of [false, true]) for (const fold of ['lowo', 'logo']) for (const base of ['G', 'L']) {
      const sc = score(rows, { beta1, fold, base }), g = gainOf(sc);
      const k = `${beta1 ? 'beta1' : 'betaFit'}|${fold}|${base}`;
      const perGl = new Map(); for (const x of sc) { const a = perGl.get(x.r.g.key) ?? { e0: 0, e: 0 }; a.e0 += x.e0; a.e += x.e; perGl.set(x.r.g.key, a); }
      const cls = (f) => { const s2 = sc.filter(f); if (!s2.length) return { n: 0 }; const q = gainOf(s2); return { n: s2.length, gainMm: r1(q.mm), gainPct: r3(q.pct) }; };
      res[k] = { rows: sc.length, glaciers: nGl, e0Mm: r1(g.e0), eMm: r1(g.e), gainMm: r1(g.mm), gainPct: r3(g.pct), bootP10Pct: r3(boot(sc, R.seedBoot)), betaMedian: r3(median(sc.map((x) => x.beta))),
        betterGlaciers: [...perGl.values()].filter((a) => a.e < a.e0).length, worseGlaciers: [...perGl.values()].filter((a) => a.e > a.e0).length,
        w2526: cls((x) => x.r.g.year === 2026), ...(kind === 'measured' ? { dzLe500: cls((x) => x.r.dz <= R.dzClass), dz500to800: cls((x) => x.r.dz > R.dzClass) } : {}) };
    }
    // B3 shuffle (main combination G/lowo, both beta variants)
    const rn = rng(R.seedShuf + di + (kind === 'oshd' ? 100 : 0)), sh = { betaFit: [], beta1: [] };
    for (let s = 0; s < R.nShuf; s++) {
      const yo = shuffleYearOf(rn);
      let rowsS;
      if (kind === 'oshd') { rowsS = G.filter((g) => g.ag != null).map((g) => { const src = byKey.get(g.key).find((x) => x.year === yo(g.year)); const ap = src?.ao?.[di]; return ap == null ? null : { g, ap, ag: g.ag, kbar: g.kbar }; }).filter(Boolean); }
      else rowsS = rowsFor(di, kind, yo);
      for (const beta1 of [false, true]) sh[beta1 ? 'beta1' : 'betaFit'].push(gainOf(score(rowsS, { beta1, fold: 'lowo', base: 'G' })).pct);
    }
    // B3 synthetic: plant a_syn = 1 + (a_p − 1) + ε, truth = B_mod(k̄_syn-consistent)
    const rs = rng(R.seedSyn + di + (kind === 'oshd' ? 100 : 0));
    const resid = rows.map((r) => (r.ag - 1) - (r.ap - 1)), sdE = Math.sqrt(mean(resid.map((v) => v * v)) - mean(resid) ** 2);
    const syn = new Map(rows.map((r) => [r, 1 + (r.ap - 1) + sdE * gauss(rs)]));
    // synthetic k* of each glacier winter with a pair: k̄ (real, other winters) × a_syn; its own anomaly against the mean of the other synthetic k*
    // deviation from the frozen text (written in §3q.10): a planted a_syn ≤ 0 has no factor; those glacier winters are left out of the synthetic control and counted
    const nonPos = rows.filter((r) => !(syn.get(r) > 0)).length;
    const kSyn = new Map(rows.filter((r) => syn.get(r) > 0).map((r) => [r, r.kbar * syn.get(r)]));
    const rowsSyn = rows.map((r) => { if (!kSyn.has(r)) return null; const oth = rows.filter((x) => x.g.key === r.g.key && x.g.year !== r.g.year && kSyn.has(x)).map((x) => kSyn.get(x)); if (oth.length < R.minOther) return null; const kb = mean(oth); return { ...r, ag: kSyn.get(r) / kb, kbar: kb, _k: kSyn.get(r) }; }).filter(Boolean);
    let sxy = 0, sxx = 0; for (const r of rowsSyn) { sxy += (r.ag - 1) * (r.ap - 1); sxx += (r.ap - 1) ** 2; }
    const betaSyn = sxy / sxx, gSyn = gainOf(score(rowsSyn, { fold: 'lowo', base: 'G', truth: (r) => interp(r.g, r._k) }));
    const synPass = betaSyn >= R.synLo && betaSyn <= R.synHi && gSyn.pct > 0;
    report.b3[kind][label] = { shuffle: { betaFit: { meanPct: r3(mean(sh.betaFit)), p90Pct: r3(quant(sh.betaFit, 0.9)) }, beta1: { meanPct: r3(mean(sh.beta1)), p90Pct: r3(quant(sh.beta1, 0.9)) } }, synthetic: { rows: rowsSyn.length, droppedNonPositive: nonPos, sdEps: r3(sdE), beta: r3(betaSyn), gainPct: r3(gSyn.pct), pass: synPass } };
    // verdicts
    const verdict = (k, shufMean) => { const x = res[k]; if (x.glaciers < R.minGlaciers || x.rows < R.minRows) return 'too few pairs'; return x.gainPct >= R.gainMin && x.bootP10Pct > 0 && Math.abs(shufMean) <= R.shufTol && synPass ? 'yearly component carries' : 'does not carry'; };
    for (const k of Object.keys(res)) res[k].verdict = verdict(k, mean(sh[k.startsWith('beta1') ? 'beta1' : 'betaFit']));
    report.b2[kind][label] = res;
  }
}
report.series = { measured: series.length, note: 'Hauptreihen: Messungen (SLF-Messfelder HN, SwissMetNet htoauths). Nebenreihe OSHD: eine ANALYSE des SLF (Q20 v1.1), keine Messung; nie mit den Hauptreihen gemischt.', list: series.map((s) => ({ key: s.key, z: s.z, tStation: s.tStation, tKm: s.tKm, winters: Object.values(s.a).filter((v) => v.some((x) => x != null)).length })) };
writeFileSync(join(OUT, 'b-full.json'), JSON.stringify({ report, rows: full.rows, glaciers: G.map((g) => ({ key: g.key, year: g.year, k: g.k, kbar: g.kbar, ag: g.ag, ao: g.ao })) }, null, 1));
writeFileSync(join(OUT, 'b.json'), JSON.stringify(report, null, 1));
if (args.public) writeFileSync(args.public, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ b1: report.b1, interp: report.glacierWinters }, null, 1));
