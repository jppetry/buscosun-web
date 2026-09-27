/**
 * diag-fx4.mjs — stage 1 of phase FX-4 (`audit/fusion-forschung.md` §6.4): can μ_c be ESTIMATED at a point without a
 * station series? Leave-station-out at the 389 stations of the station climatology: every station's 13 μ_c coefficients
 * per variable are estimated from the OTHER 388 with the estimators of `src/point/fusionFit/climaProduct.ts` (one
 * definition for diagnosis, product and client), and compared with the station's own coefficients.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/fusion-forschung/diag-fx4.mjs
 *       [--clima=C:\dev\buscosun-hindcast\fit\2026-09-23\clima.hindcast.json] [--features=…\features\points.v1.json]
 *       [--out=audit/fusion-forschung/diag-fx4] [--loso=C:\dev\buscosun-hindcast\fit\2026-09-26-fx4] [--grid=0.05]
 *
 * Candidates: idw1/idw2/idw3 (k nearest, T/Td with the climatology's own per-coefficient height slope, others without),
 * idw3n (k 3, no slope at all), idw3h (k 3, slope for every variable), ridge (trend on the client's site features, λ by
 * leave-region-out CV — nested: chosen WITHOUT the held-out station), krig3 (trend + IDW k 3 of the neighbours' residuals),
 * cf (T only: `ClimaField`, Meteostat 178 stations, k 3, set lapse 6,5 K/km — the reference the engine uses today).
 * Controls: pooled (band|country entry of the station's own stratum — what `--climaCols=station` falls back to), shuffle
 * (a derangement of the stations: station i gets the coefficients of station π(i), evaluated at i's longitude —
 * the negative control; a useful estimator must beat it by far).
 *
 * Measure per (candidate, variable, station): RMSE of μ̂_c(t) − μ_c(t) over all 8 760 hours of 2025 = √(Δᵀ M Δ) with M the
 * second moment of the climatology design at the station's longitude, and the annual-mean error Δᵀ m. Aggregated as RMS,
 * median and p90 over the stations per layer (all, country, band, distance to the nearest other station d_nn).
 * X = mean distance of a DACH land point to the nearest station, on a 0,05° grid inside `public/countries/*.geojson`.
 *
 * Writes <out>.json, <out>.md and, per candidate, a leave-station-out climatology document in the schema of the station
 * climatology (`byPoint[id][v].mu` = the estimate WITHOUT the station; var/varFloor copied, unused by the μ_c column) —
 * the input of stage 2 (`fit.mjs --climaMu=…`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { siteOf, topTiles } from 'file:///C:/dev/buscosun-web/scripts/fusionfit/lib/rowFeatures.mjs';
import { regionOf } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/strata.ts';
import { climaDesign, C_DIM, C_NAMES, CLIMA_VARS } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/fitClima.ts';
import { estimateCoefficients, fitLapse, fitTrend, trendVector, distKm, TREND_NAMES, TREND_DIM, TREND_SETS, CLIMA_PRODUCT_KIND, CLIMA_PRODUCT_SCHEMA } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/climaProduct.ts';
import { FIT_VERSION } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/tables.ts';
import { ClimaField } from 'file:///C:/dev/buscosun-web/src/ml/climaField.ts';
import { hourlyClimaTemp } from 'file:///C:/dev/buscosun-web/src/pointForecast/fusion/fuse.ts';
import { parseArgs, codeHash } from 'file:///C:/dev/buscosun-web/scripts/hindcast/lib/common.mjs';
import { CLIMA_CANDIDATES, specOf } from 'file:///C:/dev/buscosun-web/scripts/fusionfit/lib/climaCandidates.mjs';

const T0 = Date.now();
const flags = parseArgs(process.argv.slice(2));
const ROOT = 'C:/dev/buscosun-hindcast';
const climaPath = typeof flags.clima === 'string' ? flags.clima : `${ROOT}/fit/2026-09-23/clima.hindcast.json`;
const featPath = typeof flags.features === 'string' ? flags.features : `${ROOT}/features/points.v1.json`;
const outBase = typeof flags.out === 'string' ? flags.out : 'C:/dev/buscosun-web/audit/fusion-forschung/diag-fx4';
const losoDir = typeof flags.loso === 'string' ? flags.loso : `${ROOT}/fit/2026-09-26-fx4`;
const gridDeg = Number(flags.grid) || 0.05;
const say = (s) => console.log(`[diag-fx4] ${s}`);
const H = 3_600_000;
const VARS = [...CLIMA_VARS];
const RANK_VARS = ['t', 'td', 'gust', 'u', 'v'];   // the priority variables of the decision (long range T/Td/gust/wind)

// ── inputs ─────────────────────────────────────────────────────────────────────
const climaBytes = readFileSync(climaPath);
const clima = JSON.parse(climaBytes.toString('utf8'));
const climaSha = createHash('sha256').update(climaBytes).digest('hex');
const feat = JSON.parse(readFileSync(featPath, 'utf8'));
const NET = { DE: 'cdc', AT: 'tawes', CH: 'smn', LI: 'smn' };
const stations = [];
for (const [id, byVar] of Object.entries(clima.byPoint)) {
  const fr = feat.byPoint[id];
  if (!fr) { say(`Station ${id} ohne Merkmalszeile — übersprungen`); continue; }
  const so = siteOf(fr);
  const mu = {}, variance = {};
  for (const v of VARS) { const e = byVar[v]; if (e && e.status === 'written') { mu[v] = e.mu; variance[v] = { var: e.var, varFloor: e.varFloor, n: e.n, days: e.days }; } }
  stations.push({ id, name: fr.name, lat: fr.lat, lon: fr.lon, elevM: fr.elevM, country: fr.country, band: fr.band2, tile: fr.tile, net: NET[fr.country] ?? null, mu, variance, feat: Array.from(trendVector(so.site, fr.lat)), featBy: Object.fromEntries(Object.entries(TREND_SETS).map(([k, names]) => [k, Array.from(trendVector(so.site, fr.lat, names))])), site: so.site });
}
stations.sort((a, b) => a.id.localeCompare(b.id));
const regions = topTiles(stations.map((s) => ({ tile: s.tile })), 12);
const regionOfId = new Map(stations.map((s) => [s.id, regionOf(s.tile, regions)]));
say(`${stations.length} Stationen (${['DE', 'AT', 'CH', 'LI'].map((c) => `${c} ${stations.filter((s) => s.country === c).length}`).join(' · ')}; ≥ 800 m ${stations.filter((s) => s.band === 'ge800').length}), Regionen ${regions.size} + rest, Trend-Merkmale ${TREND_DIM} (${TREND_NAMES.join(' ')})`);

// ── the design's second moment over a year of hours, per station longitude ──────
const YEAR0 = Date.UTC(2025, 0, 1);
const momentAt = (lonDeg) => {
  const M = new Float64Array(C_DIM * C_DIM), m = new Float64Array(C_DIM), x = new Float64Array(C_DIM);
  const n = 365 * 24;
  for (let h = 0; h < n; h++) {
    climaDesign(YEAR0 + h * H, lonDeg, x);
    for (let i = 0; i < C_DIM; i++) { m[i] += x[i]; for (let j = i; j < C_DIM; j++) M[i * C_DIM + j] += x[i] * x[j]; }
  }
  for (let i = 0; i < C_DIM; i++) { m[i] /= n; for (let j = i; j < C_DIM; j++) { M[i * C_DIM + j] /= n; M[j * C_DIM + i] = M[i * C_DIM + j]; } }
  return { M, m };
};
const errOf = (mom, est, truth) => {
  const d = new Float64Array(C_DIM);
  for (let j = 0; j < C_DIM; j++) d[j] = est[j] - truth[j];
  let q = 0, b = 0;
  for (let i = 0; i < C_DIM; i++) { b += d[i] * mom.m[i]; let s = 0; for (let j = 0; j < C_DIM; j++) s += mom.M[i * C_DIM + j] * d[j]; q += d[i] * s; }
  return { rmse: Math.sqrt(Math.max(0, q)), bias: b };
};
const moments = new Map(stations.map((s) => [s.id, momentAt(s.lon)]));

// ── distance covariate and the DACH land grid ─────────────────────────────────
for (const s of stations) { let best = Infinity, bestId = null; for (const o of stations) { if (o === s) continue; const d = distKm(s.lat, s.lon, o.lat, o.lon); if (d < best) { best = d; bestId = o.id; } } s.dnn = best; s.dnnId = bestId; }
const DNN_BINS = [[0, 10, '< 10 km'], [10, 20, '10–20 km'], [20, 35, '20–35 km'], [35, Infinity, '> 35 km']];
const dnnBin = (d) => DNN_BINS.find(([lo, hi]) => d >= lo && d < hi)[2];
function pointInRings(rings, lon, lat) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
const countries = {};
for (const c of ['DE', 'AT', 'CH']) {
  const g = JSON.parse(readFileSync(`C:/dev/buscosun-web/public/countries/${c}.geojson`, 'utf8'));
  const geo = g.type === 'Feature' ? g.geometry : g.features[0].geometry;
  countries[c] = geo.type === 'Polygon' ? [geo.coordinates] : geo.coordinates;   // list of polygons, each = rings (outer + holes)
}
const inCountry = (c, lon, lat) => countries[c].some((rings) => pointInRings(rings, lon, lat));
const grid = { points: 0, byCountry: {}, dnn: [] };
const statsCountry = { DE: [], AT: [], CH: [] };
for (let lat = 45.7; lat <= 55.15; lat += gridDeg) for (let lon = 5.8; lon <= 17.25; lon += gridDeg) {
  const c = ['DE', 'AT', 'CH'].find((k) => inCountry(k, lon, lat));
  if (!c) continue;
  let best = Infinity;
  for (const s of stations) { const d = distKm(lat, lon, s.lat, s.lon); if (d < best) best = d; }
  grid.points += 1; grid.dnn.push(best); statsCountry[c].push(best);
}
const q = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const summ = (arr) => ({ n: arr.length, mean: mean(arr), p50: q(arr, 0.5), p90: q(arr, 0.9), shareGt20: arr.length ? arr.filter((d) => d > 20).length / arr.length : null, shareGt35: arr.length ? arr.filter((d) => d > 35).length / arr.length : null });
const X = { grid: gridDeg, all: summ(grid.dnn), byCountry: Object.fromEntries(Object.entries(statsCountry).map(([c, a]) => [c, summ(a)])), stations: summ(stations.map((s) => s.dnn)), stationsByCountry: Object.fromEntries(['DE', 'AT', 'CH'].map((c) => [c, summ(stations.filter((s) => s.country === c).map((s) => s.dnn))])) };
say(`X (DACH-Landgitter ${gridDeg}°, ${grid.points} Punkte): mittlerer Abstand zur nächsten Station ${X.all.mean.toFixed(1)} km, p50 ${X.all.p50.toFixed(1)}, p90 ${X.all.p90.toFixed(1)}, > 20 km ${(100 * X.all.shareGt20).toFixed(1)} %, > 35 km ${(100 * X.all.shareGt35).toFixed(1)} % · je Land ${Object.entries(X.byCountry).map(([c, s]) => `${c} ${s.mean.toFixed(1)} (p90 ${s.p90.toFixed(1)})`).join(' · ')} · Stationen untereinander d_nn p50 ${X.stations.p50.toFixed(1)} km, mean ${X.stations.mean.toFixed(1)}`);

// ── candidates ─────────────────────────────────────────────────────────────────
const CANDS = CLIMA_CANDIDATES;   // one table with the product builder (`scripts/fusionfit/lib/climaCandidates.mjs`)
const SETS = [...new Set(Object.values(CANDS).filter((c) => c.kind !== 'idw').map((c) => c.set ?? 'full'))];
const baseProduct = { schema: CLIMA_PRODUCT_SCHEMA, kind: CLIMA_PRODUCT_KIND, fitVersion: FIT_VERSION, provenance: 'hindcast', builtAt: new Date().toISOString(), design: C_NAMES, vars: VARS, lapse: null, trend: null, stations, source: { clima: climaPath, sha256: climaSha, period: clima.period, days: clima.days, points: stations.length }, licence: ['test'], notes: [] };
// trend rows per feature set and variable (all stations carrying it) — the LOSO fit removes one row
const trendRows = Object.fromEntries(SETS.map((set) => [set, Object.fromEntries(VARS.map((v) => [v, stations.filter((s) => s.mu[v]).map((s) => ({ id: s.id, x: s.featBy[set], y: s.mu[v] }))]))]));
const regionFn = (id) => regionOfId.get(id);
const stationsBy = Object.fromEntries(SETS.map((set) => [set, stations.map((st) => ({ ...st, feat: st.featBy[set] }))]));
const needsLapse = (spec) => spec.heightSlope !== 'none';
// shuffle: a derangement (rotation by a prime offset within the sorted list)
const SHIFT = 97;
const shuffleOf = (i) => stations[(i + SHIFT) % stations.length];
// results: cand → var → [{ id, rmse, bias }]
const res = {};
const push = (cand, v, rec) => { ((res[cand] ??= {})[v] ??= []).push(rec); };
const losoDocs = Object.fromEntries(Object.keys(CANDS).map((c) => [c, {}]));
const lambdaLog = Object.fromEntries(VARS.map((v) => [v, []]));
let tTrend = 0;
for (let si = 0; si < stations.length; si++) {
  const s = stations[si];
  const mom = moments.get(s.id);
  // LOSO lapse and trend for this station
  const lapse = {};
  for (const v of VARS) { const l = fitLapse(stations, v, s.id); if (l) lapse[v] = Array.from(l); }
  const trendBy = {};
  {
    const t1 = Date.now();
    for (const set of SETS) {
      const beta = {}, lambda = {};
      for (const v of VARS) {
        const rows = trendRows[set][v].filter((r) => r.id !== s.id);
        const f = fitTrend(rows, regionFn);
        if (f) { beta[v] = f.beta.map((b) => Array.from(b)); lambda[v] = f.lambda; if (set === 'full') lambdaLog[v].push(f.lambda); }
      }
      trendBy[set] = { names: TREND_SETS[set], beta, lambda };
    }
    tTrend += Date.now() - t1;
  }
  for (const [cand, c] of Object.entries(CANDS)) {
    const spec = specOf(c), set = c.set ?? 'full';
    // the product view of this candidate: stations carry the features of ITS set (kriging reads `feat` for the residuals)
    const product = { ...baseProduct, estimator: spec, lapse: needsLapse(spec) ? lapse : null, trend: spec.kind === 'idw' ? null : trendBy[set], stations: spec.kind === 'kriging' && set !== 'full' ? stationsBy[set] : stations };
    const target = { lat: s.lat, lon: s.lon, elevM: s.elevM, feat: s.featBy[set] };
    const est = estimateCoefficients(product, target, { exclude: s.id });
    if (est.used.includes(s.id)) throw new Error(`LECK: ${cand} benutzt die ausgelassene Station ${s.id}`);
    const doc = {};
    for (const v of VARS) {
      const truth = s.mu[v]; const e = est.mu[v];
      if (!e) continue;
      if (truth) push(cand, v, { id: s.id, ...errOf(mom, e, truth) });
      const own = s.variance[v] ?? {};
      doc[v] = { mu: Array.from(e).map((x) => Math.round(x * 1e5) / 1e5), var: own.var ?? [], varFloor: own.varFloor ?? 0, n: own.n ?? 0, days: own.days ?? 0, status: 'written', how: est.how[v], used: est.used, nearestKm: est.nearestKm == null ? null : Math.round(est.nearestKm * 10) / 10 };
    }
    losoDocs[cand][s.id] = doc;
  }
  // controls: pooled (own band|country) and shuffle (another station's coefficients at this longitude)
  const pooled = clima.pooled?.[`${s.band}|${s.country}`] ?? {};
  const sh = shuffleOf(si);
  for (const v of VARS) {
    const truth = s.mu[v]; if (!truth) continue;
    const pe = pooled[v]; if (pe && pe.status === 'written') push('pooled', v, { id: s.id, ...errOf(mom, pe.mu, truth) });
    if (sh.mu[v]) push('shuffle', v, { id: s.id, ...errOf(mom, sh.mu[v], truth) });
  }
  if ((si + 1) % 50 === 0) say(`LOSO ${si + 1}/${stations.length} · ${Math.round((Date.now() - T0) / 1000)} s (Trend ${Math.round(tTrend / 1000)} s)`);
}
say(`LOSO fertig: ${Object.keys(res).length} Kandidaten/Kontrollen, ${Math.round((Date.now() - T0) / 1000)} s; Trend-λ je Größe (Median über die LOSO-Fits): ${VARS.map((v) => `${v} ${q(lambdaLog[v], 0.5) ?? '—'}`).join(' · ')}`);

// ── ClimaField reference (T only): hourly RMSE against the station's μ_c(t) over 2025 ──
{
  const cf = new ClimaField(JSON.parse(readFileSync('C:/dev/buscosun-web/public/climaGrid.json', 'utf8')));
  const x = new Float64Array(C_DIM);
  for (const s of stations) {
    const truth = s.mu.t; if (!truth) continue;
    let se = 0, sb = 0, n = 0;
    for (let d = 0; d < 365; d++) {
      const cs = cf.sample(s.lat, s.lon, d + 1, s.elevM);
      if (!Number.isFinite(cs.tempMean)) continue;
      for (let hh = 0; hh < 24; hh++) {
        const ms = YEAR0 + (d * 24 + hh) * H;
        climaDesign(ms, s.lon, x);
        let mu = 0; for (let j = 0; j < C_DIM; j++) mu += truth[j] * x[j];
        const local = (((hh + s.lon / 15) % 24) + 24) % 24;
        const e = hourlyClimaTemp(cs.tempMean, cs.diurnalAmp, local) - mu;
        se += e * e; sb += e; n += 1;
      }
    }
    if (n) push('cf', 't', { id: s.id, rmse: Math.sqrt(se / n), bias: sb / n });
  }
}

// ── aggregation ────────────────────────────────────────────────────────────────
const byId = new Map(stations.map((s) => [s.id, s]));
const LAYERS = ['all', 'country:DE', 'country:AT', 'country:CH', 'band:lt800', 'band:ge800', ...DNN_BINS.map((b) => `dnn:${b[2]}`)];
const inLayer = (s, L) => L === 'all' || (L.startsWith('country:') && s.country === L.slice(8)) || (L.startsWith('band:') && s.band === L.slice(5)) || (L.startsWith('dnn:') && dnnBin(s.dnn) === L.slice(4));
const agg = {};
for (const [cand, byVar] of Object.entries(res)) {
  agg[cand] = {};
  for (const [v, recs] of Object.entries(byVar)) {
    agg[cand][v] = {};
    for (const L of LAYERS) {
      const rs = recs.filter((r) => inLayer(byId.get(r.id), L));
      if (!rs.length) continue;
      const rm = rs.map((r) => r.rmse), bs = rs.map((r) => r.bias);
      agg[cand][v][L] = { n: rs.length, rms: Math.sqrt(mean(rm.map((x) => x * x))), p50: q(rm, 0.5), p90: q(rm, 0.9), biasMean: mean(bs), biasRms: Math.sqrt(mean(bs.map((x) => x * x))) };
    }
  }
}
// ranking score: mean over the priority variables of RMS(all) relative to the pooled control
const score = {};
for (const cand of Object.keys(agg)) {
  const ratios = RANK_VARS.map((v) => (agg[cand][v]?.all && agg.pooled[v]?.all ? agg[cand][v].all.rms / agg.pooled[v].all.rms : null)).filter((x) => x != null);
  score[cand] = ratios.length === RANK_VARS.length ? mean(ratios) : null;
}
const ranked = Object.entries(score).filter(([c, s]) => s != null && CANDS[c]).sort((a, b) => a[1] - b[1]);
say(`Rang (mittleres RMS-Verhältnis zur gepoolten Kontrolle über ${RANK_VARS.join('/')}): ${ranked.map(([c, s]) => `${c} ${s.toFixed(3)}`).join(' · ')}; shuffle ${score.shuffle?.toFixed(3)}`);

// ── outputs ────────────────────────────────────────────────────────────────────
const f2 = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d));
const UNIT = { t: 'K', td: 'K', u: 'm/s', v: 'm/s', gust: 'm/s', clct: '%', precip: 'ln(1+mm/h)' };
const md = [`# diag-fx4 — Leave-Station-out der Stationsklimatologie (μ_c), ${new Date().toISOString().slice(0, 16)}Z`, '',
  `Stationen ${stations.length} (DE ${stations.filter((s) => s.country === 'DE').length} · AT ${stations.filter((s) => s.country === 'AT').length} · CH ${stations.filter((s) => s.country === 'CH').length} · LI ${stations.filter((s) => s.country === 'LI').length}; ≥ 800 m ${stations.filter((s) => s.band === 'ge800').length}), Klimatologie \`${climaPath}\` (sha256 ${climaSha.slice(0, 12)}, ${clima.days} Tage), Merkmale \`${featPath}\`, codeHash ${codeHash()}.`, '',
  `Maß: RMSE von μ̂_c − μ_c über 8 760 Stunden (2025) an der Stationslänge; RMS/p50/p90 über die Stationen der Schicht; Bias = Jahresmittel-Fehler (RMS über Stationen). Einheiten: ${Object.entries(UNIT).map(([v, u]) => `${v} ${u}`).join(', ')}.`, '',
  `**X — Abstand zur nächsten Station auf dem DACH-Landgitter (${gridDeg}°, ${grid.points} Punkte):** mean ${f2(X.all.mean, 1)} km, p50 ${f2(X.all.p50, 1)}, p90 ${f2(X.all.p90, 1)}, > 20 km ${f2(100 * X.all.shareGt20, 1)} %, > 35 km ${f2(100 * X.all.shareGt35, 1)} %; je Land ${Object.entries(X.byCountry).map(([c, s]) => `${c} mean ${f2(s.mean, 1)} / p90 ${f2(s.p90, 1)} km`).join(' · ')}. Stationen untereinander (d_nn, die Kovariate der LOSO-Messung): p50 ${f2(X.stations.p50, 1)} km, mean ${f2(X.stations.mean, 1)}, p90 ${f2(X.stations.p90, 1)}; je Land ${Object.entries(X.stationsByCountry).map(([c, s]) => `${c} p50 ${f2(s.p50, 1)}`).join(' · ')}.`, '',
  `**Rang (mittleres RMS-Verhältnis zur gepoolten Kontrolle über ${RANK_VARS.join('/')}, kleiner = besser):** ${ranked.map(([c, s]) => `${c} ${f2(s, 3)}`).join(' · ')} · Kontrollen: pooled 1,000 · shuffle ${f2(score.shuffle, 3)}. Trend-λ (Median der LOSO-Fits): ${VARS.map((v) => `${v} ${q(lambdaLog[v], 0.5) ?? '—'}`).join(' · ')}.`, ''];
const ORDER = [...Object.keys(CANDS), 'cf', 'pooled', 'shuffle'];
// cloud cover of the composites must equal idw3 (their override), the other variables their trend — a self-check of `byVar`
for (const [comp, base] of [['ridgeTx', 'ridgeT'], ['ridgex', 'ridge']]) {
  const same = (a, b, v) => JSON.stringify(agg[a]?.[v]?.all) === JSON.stringify(agg[b]?.[v]?.all);
  if (!same(comp, 'idw3', 'clct') || !same(comp, base, 't') || !same(comp, base, 'gust')) throw new Error(`byVar-Kontrolle: ${comp} ≠ (${base} außer clct = idw3)`);
}
say('byVar-Kontrolle: ridgeTx/ridgex = Trend außer Bewölkung = idw3 (bestanden)');
md.push('## Schicht `all` — RMS / p50 / p90 (Bias-RMS) je Kandidat × Größe', '', `| Kandidat | ${VARS.map((v) => `${v} [${UNIT[v]}]`).join(' | ')} |`, `|---|${VARS.map(() => '---').join('|')}|`);
for (const c of ORDER) { if (!agg[c]) continue; md.push(`| ${c} | ${VARS.map((v) => { const a = agg[c][v]?.all; return a ? `${f2(a.rms)} / ${f2(a.p50)} / ${f2(a.p90)} (${f2(a.biasRms)})` : '—'; }).join(' | ')} |`); }
md.push('');
for (const v of VARS) {
  md.push(`## ${v} [${UNIT[v]}] — RMS je Schicht (n Stationen)`, '', `| Kandidat | ${LAYERS.join(' | ')} |`, `|---|${LAYERS.map(() => '---').join('|')}|`);
  for (const c of ORDER) { if (!agg[c]?.[v]) continue; md.push(`| ${c} | ${LAYERS.map((L) => { const a = agg[c][v][L]; return a ? `${f2(a.rms)} (${a.n})` : '—'; }).join(' | ')} |`); }
  md.push('');
}
md.push('## Lesehilfe', '', '- `pooled` = die Rückfall-Klimatologie Band|Land (was `--climaCols=station` an einer Station ohne Reihe heute nähme); `shuffle` = Koeffizienten einer anderen Station an der eigenen Länge (Negativkontrolle).',
  '- Die LOSO-Messung an Stationen ist gegenüber dem Browser-Punkt konservativ, wenn der Fehler mit d_nn wächst: die Stationen liegen im Mittel weiter von ihrer nächsten Nachbarin als ein Landpunkt von seiner nächsten Station (X oben) — die Spalten `dnn:` sagen, was ein Punkt bei seinem Abstand bekommt.',
  '- `cf` = heutige `ClimaField`-Referenz nur für T (Meteostat, Tagesmittel + Tagesgang-Amplitude, Lapse 6,5 K/km set).', '');
mkdirSync(join(outBase, '..'), { recursive: true });
writeFileSync(`${outBase}.md`, md.join('\n'));
writeFileSync(`${outBase}.json`, JSON.stringify({ builtAt: new Date().toISOString(), codeHash: codeHash(), clima: { path: climaPath, sha256: climaSha }, features: featPath, stations: stations.map((s) => ({ id: s.id, country: s.country, band: s.band, elevM: s.elevM, dnnKm: Math.round(s.dnn * 10) / 10, dnnId: s.dnnId })), X, candidates: CANDS, score, agg, perStation: res, lambdaMedian: Object.fromEntries(VARS.map((v) => [v, q(lambdaLog[v], 0.5)])) }));
// LOSO climatology documents (stage-2 input): schema of the station climatology, μ = the estimate without the station
mkdirSync(losoDir, { recursive: true });
for (const [cand, byPoint] of Object.entries(losoDocs)) {
  const doc = { ...clima, builtAt: new Date().toISOString(), codeHash: codeHash(), loso: { estimator: specOf(CANDS[cand]), trendSet: CANDS[cand].set ?? (CANDS[cand].kind === 'idw' ? null : 'full'), candidate: cand, source: { path: climaPath, sha256: climaSha }, note: 'byPoint[id][v].mu = Schätzung OHNE die Station (Leave-Station-out, diag-fx4); var/varFloor von der Station kopiert (die μ_c-Spalte liest sie nicht); pooled unverändert' }, byPoint, counts: { written: Object.values(byPoint).reduce((a, p) => a + Object.keys(p).length, 0), tooShort: 0 } };
  const p = join(losoDir, `clima.loso.${cand}.json`);
  writeFileSync(p, JSON.stringify(doc));
}
say(`geschrieben ${outBase}.md/.json und ${Object.keys(losoDocs).length} LOSO-Dokumente unter ${losoDir}; ${Math.round((Date.now() - T0) / 1000)} s`);
for (const line of md.slice(6, 6 + 4 + ORDER.length)) console.log(line);
