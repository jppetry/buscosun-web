#!/usr/bin/env node
/**
 * Phase GM, GM-10b (audit/gletscher-schneemodell/gm10-diagnose.md §13; E-GM-43, E-GM-44) — the table of PREDICTED precipitation factors for the Swiss
 * glaciers. A local tool: it reads the cache and writes into `--work` / `--out` only. The table it builds is committed as
 * `scripts/glacier/snow-factor-predicted-ch.json` with the source attribution `SNOW_FACTOR_SOURCES` (GLAMOS confirmed the use on 25.11.2026).
 *
 *   node scripts/glacier/snowcal-predict.mjs --mode=forcing --data=<v1 view> --work=<dir> --gm3=<gm3 cache> [--python=<python with h5py>]
 *   node scripts/glacier/snowcal-predict.mjs --mode=x1      --data=<v1 view> --work=<dir> --predictors=<predictors-ch.json>
 *   node scripts/glacier/snowcal-predict.mjs --mode=check-x1 --truth=<gy.json> --gm3=<gm3 cache> --q20gl=<q20-glaciers.json> --report0=<gm10 report.json>
 *   node scripts/glacier/snowcal-predict.mjs --mode=table   --data=<v1 view> --work=<dir> --truth=<gy.json> --gm3=<gm3 cache> --report=<gm3 report-fit2.json>
 *        --predictors=<predictors-ch.json> --step1=<gm10 report-shrunk.json> --out=<table.json> [--own=<snow-calibration-glaciers.json>] [--snowcal=<snow-calibration.json>]
 *
 * forcing  For EVERY Swiss glacier of the build, the forcing rule of the calibration (GM-3 / GM-5b): temperature and global radiation of the nearest
 *          SwissMetNet station within 30 km and 1 800 m of the catalogue's median elevation with ≥ 90 % of the hours of the ten Q20 winters (1 Oct … 1 May,
 *          2016–2025), RhiresD at the nearest 1 km cell (`py/snowcal_grid.py --points`). Writes a cache in the layout `loadWinters` reads.
 * x1       The grid predictor of step 0 for every glacier: per winter the multiplier k at which the operating melt core (eti, TF, SRF of melt-calibration.json)
 *          on the bands of the BUILD hypsometry (50 m) accumulates the Q20 v1.1 gain of snow water from 1 Oct to 1 May; x1 = mean ln k (≥ 3 winters).
 * check-x1 Gegenprobe of the lazy search: at the calibration glaciers with the GLAMOS steps and truth windows of step 0, x1 must equal step 0's x1.
 * table    Refit of form C on the 32 calibration glaciers with the build x1 (scored measure and truth of step 0), leave-one-glacier-out AS BUILT (the rule of
 *          E-GM-44 inside every pass), the spread per basis from it, the final fit on all 32, the table for every Swiss glacier of the build.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { smnStations, smnHourly, hav, STATION_RULE } from './snowcal-forcing.mjs';
import { loadWinters } from './snowcal-fit.mjs';
import { attachRadiation, balAll, tableOf, tabVal, scoreOf, fitF, KS } from './snowcal-fit2.mjs';
import { glacierRunOf } from './lib/snowcalGlaciers.mjs';
import { precipRunOf } from './lib/snowcal.mjs';
import {
  kForLazy, fitForm, predictOf, ruleOf, spreadOfErrors, atSearchBound, snowFactorTableProblems, SNOW_FACTOR_RULE, SNOW_FACTOR_TABLE_KIND, SNOW_FACTOR_BASES,
  SNOW_FACTOR_MIN_GRID_WINTERS, SNOW_FACTOR_NOTE, quantOf, SNOW_FACTOR_SOURCES,
} from './lib/snowcalPredict.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const H = 3_600_000;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const log = (s) => console.error(`[${new Date().toISOString().slice(11, 19)}] ${s}`);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10), r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
/** Hour grid of the forcing files (the grid of the GM-3 cache, so that its station files are the same files). */
export const PREDICT_FROM = '2011-09-01T00:00:00Z';
export const PREDICT_TO = '2025-06-01T00:00:00Z';
/** The Q20 water years of the build window. */
export const PREDICT_YEARS = Object.freeze([2016, 2025]);
const years = () => { const out = []; for (let y = PREDICT_YEARS[0]; y <= PREDICT_YEARS[1]; y++) out.push(y); return out; };
const catalogOf = (data) => { const index = J(join(data, 'index.json')); return { build: index.static.build, glaciers: J(join(data, 'static', index.static.build, 'catalog.json')).glaciers }; };
const ETI = () => { const cal = J(join(HERE, 'melt-calibration.json')).fit; return { model: 'eti', TF: cal.TF, SRF: cal.SRF }; };

// ---- forcing -----------------------------------------------------------------------------------------------------------------------------------
async function forcing() {
  const data = resolve(args.data), work = resolve(args.work), gm3 = resolve(args.gm3);
  mkdirSync(work, { recursive: true });
  // the raw SwissMetNet downloads are shared with the GM-3 cache (same files, read or added — never changed)
  const smnDir = join(gm3, 'smn');
  const fromMs = Date.parse(PREDICT_FROM), toMs = Date.parse(PREDICT_TO), n = Math.round((toMs - fromMs) / H);
  const idx = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - fromMs) / H);
  const wins = years().map((y) => [idx(`${y - 1}-10-01`), idx(`${y}-05-01`)]), hours = wins.reduce((s, [a, b]) => s + (b - a), 0);
  const { build, glaciers } = catalogOf(data);
  const ch = glaciers.filter((g) => g.country === 'CH');
  const smn = await smnStations(gm3);
  const series = new Map();
  const seriesOf = async (s) => { if (!series.has(s.id)) series.set(s.id, await smnHourly(gm3, s.id, { t: 'tre200h0', g: 'gre000h0' }, fromMs, toMs)); return series.get(s.id); };
  const assign = {}, used = new Set();
  let none = 0;
  for (const g of ch) {
    const z = g.z[1];
    const cand = smn.filter((s) => Math.abs(z - s.height) <= STATION_RULE.dh).map((s) => ({ s, km: hav(g.lon, g.lat, s.lon, s.lat) })).filter((x) => x.km <= STATION_RULE.km).sort((a, b) => a.km - b.km);
    let pick = null;
    for (const { s, km } of cand) {
      const t = (await seriesOf(s)).t;
      let ok = 0; for (const [a, b] of wins) for (let i = Math.max(0, a); i < Math.min(n, b); i++) if (t[i] != null) ok++;
      if (ok / hours >= STATION_RULE.cover) { pick = { id: `CH-${s.id}`, station: s.id, name: s.name, height: s.height, km: r1(km), dh: Math.round(z - s.height), cover: r3(ok / hours) }; break; }
    }
    if (!pick) none++; else used.add(pick.station);
    assign[g.id] = { name: g.name, country: 'CH', zMed: z, temp: pick, tried: cand.length };
  }
  for (const id of used) {
    const s = smn.find((x) => x.id === id), d = await seriesOf(s);
    writeFileSync(join(work, `temp-CH-${id}.json`), JSON.stringify({ id: `CH-${id}`, name: s.name, height: s.height, fromMs, hours: n, t: d.t }));
    // radiation: the physical bounds of snowcal-radiation.mjs (a negative reading at night is zero light, above 1 400 W m⁻² no measurement)
    const g = d.g.map((v) => (v == null || !Number.isFinite(v) || v > 1400 ? null : v < 0 ? 0 : v));
    writeFileSync(join(work, `rad-CH-${id}.json`), JSON.stringify({ id: `CH-${id}`, name: s.name, height: s.height, fromMs, hours: n, g }));
  }
  writeFileSync(join(work, 'stations.json'), JSON.stringify({ from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(), rule: STATION_RULE, build, window: 'Q20 winters 1 Oct … 1 May, water years 2016–2025',
    licences: ['MeteoSwiss OGD SwissMetNet (tre200h0, gre000h0), CC BY 4.0, Quelle: MeteoSchweiz'], assign }));
  log(`${ch.length} Schweizer Gletscher, ${used.size} Stationen, ohne Station ${none}`);
  // RhiresD at every glacier point (nearest 1 km cell), the yearly files of the GM-3 cache
  const pts = join(work, 'points-ch.json');
  writeFileSync(pts, JSON.stringify(ch.map((g) => ({ key: g.id, name: g.name ?? g.id, lat: g.lat, lon: g.lon }))));
  const files = []; for (let y = 2015; y <= 2025; y++) files.push(join(gm3, 'rhiresd', `rhiresd_${y}.nc`));
  execFileSync(args.python ?? 'python', ['-I', join(HERE, 'py', 'snowcal_grid.py'), '--points', pts, '--files', files.join(','), '--out', join(work, 'rhires.json')], { stdio: ['ignore', 'ignore', 'inherit'], maxBuffer: 1 << 26 });
  log('RhiresD fertig');
}

// ---- x1 -----------------------------------------------------------------------------------------------------------------------------------------
/** x1 of one glacier from its winters (`recs` from loadWinters, radiation attached) and its Q20 winters: mean ln k over the winters with a positive gain. */
export function x1Of(recs, q20Winters, m) {
  const lk = []; let capped = 0, dropped = 0, missing = 0, evals = 0;
  for (const rec of recs) {
    const w = q20Winters?.[String(rec.year)];
    if (!w || w.swe0 == null || w.swe1 == null) { missing++; continue; }
    const dS = w.swe1 - w.swe0;
    if (!(dS > 0)) { dropped++; continue; }
    const k = kForLazy((j) => { const bal = balAll(rec, m, KS[j]); let s = 0; for (let b = 0; b < bal.length; b++) s += rec.b[b].w * bal[b]; return s; }, dS, KS);
    evals += k.evals; if (k.capped) capped++;
    lk.push(Math.log(k.k));
  }
  return { x1: lk.length >= SNOW_FACTOR_MIN_GRID_WINTERS ? mean(lk) : null, winters: lk.length, capped, dropped, missing, evals };
}
function x1Mode() {
  const data = resolve(args.data), work = resolve(args.work), pred = J(resolve(args.predictors)).glaciers;
  const { build, glaciers } = catalogOf(data), st = J(join(work, 'stations.json')), m = ETI();
  const hyp = new Map(), hypOf = (r) => { if (!hyp.has(r)) hyp.set(r, J(join(data, 'static', build, 'hypso', `${r}.json`)).glaciers ?? {}); return hyp.get(r); };
  const ch = glaciers.filter((g) => g.country === 'CH'), out = {}, unusable = [];
  const chunk = Number(args.chunk ?? 60);
  for (let c0 = 0; c0 < ch.length; c0 += chunk) {
    const part = ch.slice(c0, c0 + chunk), gy = [];
    for (const g of part) {
      const h = hypOf(g.region)[g.id], row = { station: st.assign[g.id]?.temp?.id ?? null };
      out[g.id] = row;
      if (!h?.a?.some((v) => v > 0)) { row.why = 'no-hypsometry'; continue; }
      if (!row.station) { row.why = 'no-station'; continue; }
      const bins = []; h.a.forEach((a, i) => { if (a > 0) bins.push({ z0: h.z0 + 50 * i, z1: h.z0 + 50 * (i + 1), area: a, bw: 0 }); });
      for (const y of years()) gy.push({ src: 'build', country: 'CH', name: g.name, key: g.id, year: y, t0: `${y - 1}-10-01`, t1: `${y}-04-30`, bins, catId: g.id, region: g.region, lat: g.lat, lon: g.lon, zMed: g.z[1], bw: 0 });
    }
    const tp = join(work, `truth-chunk.json`);
    writeFileSync(tp, JSON.stringify({ gy }));
    const { winters, unusable: un, fromMs } = loadWinters({ truthPath: tp, cache: work });
    unusable.push(...un);
    const rads = new Map(), radOf = (id) => { if (!rads.has(id)) rads.set(id, J(join(work, `rad-${id}.json`))); return rads.get(id); };
    attachRadiation(winters, radOf, fromMs);
    const by = new Map(); for (const r of winters) { if (!by.has(r.key)) by.set(r.key, []); by.get(r.key).push(r); }
    for (const g of part) {
      const row = out[g.id]; if (row.why) continue;
      const x = x1Of(by.get(g.id) ?? [], pred[g.id]?.winters, m);
      Object.assign(row, { x1: x.x1 == null ? null : Math.round(x.x1 * 1e6) / 1e6, winters: x.winters, capped: x.capped, dropped: x.dropped, missing: x.missing, usable: (by.get(g.id) ?? []).length });
      if (x.x1 == null) row.why = 'few-grid-winters';
    }
    log(`x1 ${Math.min(c0 + chunk, ch.length)}/${ch.length}`);
  }
  const res = { kind: 'glacier/snowcal-x1', build, generated: new Date().toISOString(), melt: m, window: '1 Oct 00 UTC … 1 May 00 UTC, water years 2016–2025', bands: 'build hypsometry, 50 m',
    rule: 'x1 = mean over winters with a positive Q20 gain of ln k, k = multiplier at which the glacier-mean balance of the melt core reaches the gain (first crossing on k = 0.30 … 5.00 step 0.02, linear in between)',
    minWinters: SNOW_FACTOR_MIN_GRID_WINTERS, unusableWinters: unusable.length, glaciers: out };
  writeFileSync(join(work, 'x1-ch.json'), JSON.stringify(res));
  const n = Object.values(out); log(`x1: ${n.filter((r) => r.x1 != null).length} mit Wert; ohne: ${Object.entries(n.reduce((a, r) => (r.why ? ((a[r.why] = (a[r.why] ?? 0) + 1), a) : a), {})).map(([k, v]) => `${k} ${v}`).join(', ')}`);
}

// ---- check of the lazy search against step 0 ---------------------------------------------------------------------------------------------------
function checkX1() {
  const gm3 = resolve(args.gm3), m = ETI();
  const { winters, fromMs } = loadWinters({ truthPath: resolve(args.truth), cache: gm3 });
  attachRadiation(winters, (id) => J(join(gm3, `rad-${id}.json`)), fromMs);
  const q = J(resolve(args.q20gl)).glaciers, inv = new Map(J(resolve(args.report0)).inventory.map((g) => [g.key, g]));
  const by = new Map(); for (const r of winters) if (r.country === 'CH') { if (!by.has(r.key)) by.set(r.key, []); by.get(r.key).push(r); }
  const rows = [];
  for (const [key, recs] of by) {
    // step 0: the winter of the truth, SWE(t1 + 1) − SWE(t0) — the q20 file of step 0 keys its winters by the truth year
    const x = x1Of(recs, q[key]?.winters, m), ref = inv.get(key)?.x1 ?? null;
    rows.push({ key, x1: r3(x.x1), step0: ref, same: (x.x1 == null && ref == null) || (x.x1 != null && ref != null && Math.abs(r3(x.x1) - ref) < 1e-9), evals: x.evals });
  }
  const bad = rows.filter((r) => !r.same);
  console.log(JSON.stringify({ glaciers: rows.length, same: rows.length - bad.length, differ: bad, evalsPerWinter: r1(mean(rows.map((r) => r.evals)) / 10) }, null, 1));
  if (bad.length) process.exit(1);
}

// ---- table --------------------------------------------------------------------------------------------------------------------------------------
function tableMode() {
  const data = resolve(args.data), work = resolve(args.work), gm3 = resolve(args.gm3), m = ETI();
  const ownPath = resolve(args.own ?? join(HERE, 'snow-calibration-glaciers.json')), snowcalPath = resolve(args.snowcal ?? join(HERE, 'snow-calibration.json'));
  const { build, glaciers } = catalogOf(data), byId = new Map(glaciers.map((g) => [g.id, g]));
  const ch = glaciers.filter((g) => g.country === 'CH');
  const precip = precipRunOf(J(snowcalPath), [...new Set(glaciers.map((g) => g.region))]);
  const countryVals = [...new Set(ch.map((g) => precip.factorOf(g.region)))];
  if (countryVals.length !== 1) throw new Error(`mehr als ein Landeswert in der Schweiz: ${countryVals.join(', ')}`);
  const countryF = countryVals[0];
  const own = glacierRunOf(J(ownPath), { factor: true }, new Set(glaciers.map((g) => g.id)));
  const x1 = J(join(work, 'x1-ch.json')), pred = J(resolve(args.predictors)).glaciers, report = J(resolve(args.report));
  const step1 = J(resolve(args.step1));
  // the truth and the scored measure of step 0: GLAMOS steps, truth windows, tables over k (V-GM-103)
  log('Wahrheit und Tabellen über k …');
  const { winters, fromMs } = loadWinters({ truthPath: resolve(args.truth), cache: gm3 });
  attachRadiation(winters, (id) => J(join(gm3, `rad-${id}.json`)), fromMs);
  const items = new Map();
  for (const rec of winters) {
    if (rec.country !== 'CH' || !report.table[rec.key]) continue;
    const tab = tableOf(rec, m), tot = new Float64Array(KS.length);
    for (let j = 0; j < KS.length; j++) for (let b = 0; b < tab.length; b++) tot[j] += rec.b[b].w * tab[b][j];
    if (!items.has(rec.key)) items.set(rec.key, []);
    items.get(rec.key).push({ rec, tab, tot, BW: rec.b.reduce((s, x) => s + x.w * x.bw, 0) });
  }
  log('Tabellen fertig');
  // calibration glaciers: the Swiss glaciers of the GM-5b report with a build x1 (step 0 scored 32; the list must stay the same, else stop)
  // the calibration set is the one of step 0 / step 1 (32 Swiss glaciers); every one of them needs a build x1, else the tool stops. Swiss glaciers of the
  // GM-5b table that step 0 could not score (truth before the Q20 years) are named, not added — the set of the frozen rule stays.
  const step0Keys = (step1.perGlacier ?? []).map((g) => g.key).sort();
  if (!step0Keys.length) throw new Error('Schritt 1 (report-shrunk.json) ohne Gletscherliste');
  const cal = step0Keys.map((key) => {
    const t = report.table[key], g = byId.get(t?.catId), p = pred[t?.catId], xr = x1.glaciers[t?.catId];
    if (!t || !g || !p || xr?.x1 == null || !items.get(key)?.length) throw new Error(`Eichgletscher ${key} (${t?.name}): ohne Katalog, Prädiktoren, x1 des Builds oder Winter`);
    return { key, catId: t.catId, name: t.name, Fown: t.Fown, x: [xr.x1, g.z[1], p.north], x1: xr.x1, zMed: g.z[1], north: p.north, nIn: p.nIn, areaKm2: g.area.km2, items: items.get(key) };
  });
  const notScored = [...items.keys()].filter((k) => !step0Keys.includes(k)).map((k) => ({ key: k, name: report.table[k].name, buildX1: x1.glaciers[report.table[k].catId]?.x1 ?? null }));
  const tabFn = (tot, k) => tabVal(tot, k);
  const calOf = (train) => {
    const ownF = train.map((g) => g.Fown).filter((F) => !atSearchBound(F));
    return { ranges: Object.fromEntries(SNOW_FACTOR_RULE.predictors.map((n) => [n, [Math.min(...train.map((g) => g[n])), Math.max(...train.map((g) => g[n]))]])), minArea: Math.min(...train.map((g) => g.areaKm2)), own: [Math.min(...ownF), Math.max(...ownF)] };
  };
  const classOf = (n) => (n <= 1 ? 'K1' : n <= 4 ? 'K2' : 'K3');
  // leave one glacier out, AS BUILT: the rule inside every pass, and G1 for comparison
  log('Ein Gletscher ausgelassen, wie gebaut …');
  const loo = new Map();
  for (const g of cal) {
    const train = cal.filter((x) => x !== g);
    const mC = fitForm(train.map((x) => ({ key: x.key, x: x.x, items: x.items })), tabFn);
    const mG1 = fitForm(train.map((x) => ({ key: x.key, x: [x.x1], items: x.items })), tabFn, { withConstant: false });
    const c = calOf(train), r = ruleOf(g, mC, c, countryF);
    loo.set(g.key, { ...r, G1: predictOf(mG1, [g.x1]), C: predictOf(mC, g.x), cPrime: Math.exp(mC.c0), beta: mC.beta });
  }
  // exact scores with the core (s2, mm w. e.), per glacier-winter
  log('Wertung exakt …');
  const rows = [];
  for (const g of cal) for (const it of g.items) {
    const L = loo.get(g.key), s = (F) => scoreOf(it.rec, m, it.rec.b.map(() => F)).s2;
    rows.push({ key: g.key, cls: classOf(g.nIn), country: s(countryF), G1: s(L.G1), built: s(L.F), C: s(L.C), own: s(g.Fown) });
  }
  const forms = ['country', 'G1', 'C', 'built', 'own'];
  const summary = (sel) => { const R = rows.filter(sel); return { glaciers: new Set(R.map((r) => r.key)).size, winters: R.length, ...Object.fromEntries(forms.map((f) => [f, r1(mean(R.map((r) => r[f])))])) }; };
  const bound = cal.filter((g) => atSearchBound(g.Fown)).map((g) => g.key);
  const asBuilt = { all: summary(() => true), K1: summary((r) => r.cls === 'K1'), K2: summary((r) => r.cls === 'K2'), K3: summary((r) => r.cls === 'K3'),
    withoutBound: { all: summary((r) => !bound.includes(r.key)), K1: summary((r) => r.cls === 'K1' && !bound.includes(r.key)), K2: summary((r) => r.cls === 'K2' && !bound.includes(r.key)), K3: summary((r) => r.cls === 'K3' && !bound.includes(r.key)) } };
  const perGlacier = cal.map((g) => {
    const R = rows.filter((r) => r.key === g.key), L = loo.get(g.key);
    return { key: g.key, name: g.name, nIn: g.nIn, cls: classOf(g.nIn), areaKm2: g.areaKm2, x1: r3(g.x1), zMed: g.zMed, north: g.north, Fown: g.Fown, basis: L.basis, why: L.why ?? null,
      F: r3(L.F), FG1: r3(L.G1), FC: r3(L.C), country: r1(mean(R.map((r) => r.country))), G1: r1(mean(R.map((r) => r.G1))), built: r1(mean(R.map((r) => r.built))), own: r1(mean(R.map((r) => r.own))), winters: R.length };
  });
  const worse = perGlacier.filter((g) => g.built > g.country).map((g) => ({ name: g.name, cls: g.cls, basis: g.basis, by: r1(g.built - g.country) })).sort((a, b) => b.by - a.by);
  // spread per basis from the leave-one-glacier-out (glaciers not at the search bound): e = ln(F / F_own)
  const nb = cal.filter((g) => !atSearchBound(g.Fown));
  const eOf = (sel, F) => nb.filter(sel).map((g) => Math.log(F(g) / g.Fown));
  const ownE = [];   // the own factor with one winter left out (GM-5b's fit) against the one of all winters: how well N winters fix it
  for (const g of nb) for (let i = 0; i < g.items.length; i++) { const F = fitF(g.items.filter((_, j) => j !== i)); ownE.push(Math.log(F / g.Fown)); }
  const spread = {
    own: { ...spreadOfErrors(ownE), how: 'own factor fitted with one winter left out against the one of all winters (GM-5b fit, Swiss calibration glaciers)' },
    predicted: { ...spreadOfErrors(eOf((g) => true, (g) => loo.get(g.key).C)), how: 'form C, one glacier left out, against the own factor (all calibration glaciers not at a bound)' },
    'predicted-shrunk': { ...spreadOfErrors(eOf((g) => true, (g) => Math.exp(SNOW_FACTOR_RULE.shrink * Math.log(loo.get(g.key).C) + (1 - SNOW_FACTOR_RULE.shrink) * Math.log(countryF)))), how: 'form C halfway to the country value, one glacier left out, against the own factor' },
    country: { ...spreadOfErrors(eOf(() => true, () => countryF)), how: 'country value against the own factor' },
    origin: 'measured', glaciers: nb.length,
  };
  // the final fit on all calibration glaciers and the table for every Swiss glacier of the build
  log('Anpassung an allen Eichgletschern, Tabelle …');
  const model = fitForm(cal.map((x) => ({ key: x.key, x: x.x, items: x.items })), tabFn), calAll = calOf(cal);
  const small = step1.withMontCollon && step1.withoutMontCollon ? {
    K1: { shrunk: step1.withMontCollon.K1.Cs, country: step1.withMontCollon.K1.a }, K2: { shrunk: step1.withMontCollon.K2.Cs, country: step1.withMontCollon.K2.a },
    K2withoutBound: { shrunk: step1.withoutMontCollon.K2.Cs, country: step1.withoutMontCollon.K2.a } } : null;
  if (!small) throw new Error('Schritt 1 (report-shrunk.json) ohne Klassentabelle');
  const smallRule = small.K1.shrunk < small.K1.country && small.K2.shrunk < small.K2.country ? 'shrunk' : 'country';
  const out = {};
  const counts = Object.fromEntries(SNOW_FACTOR_BASES.map((b) => [b, 0])), area = Object.fromEntries(SNOW_FACTOR_BASES.map((b) => [b, 0])), why = {};
  for (const g of ch) {
    const p = pred[g.id], xr = x1.glaciers[g.id], ownF = own.factorOf(g.id);
    let row;
    if (ownF != null) row = { b: 'own', F: ownF };
    else if (own.has(g.id)) row = { b: 'country', F: countryF, why: 'own-at-bound' };
    else {
      const r = ruleOf({ x1: xr?.x1 ?? null, zMed: g.z[1], north: p.north, nIn: p.nIn, areaKm2: g.area.km2 }, model, calAll, countryF);
      if (r.basis === 'predicted-shrunk' && smallRule !== 'shrunk') row = { b: 'country', F: countryF, why: 'small-keeps-country' };
      else row = { b: r.basis, F: r3(r.F), ...(r.why ? { why: r.basis === 'country' && xr?.why ? xr.why : r.why } : {}) };
      if (row.b === 'country') row.F = countryF;
    }
    const s = spread[row.b];
    row.q = [r3(row.F * s.p10), r3(row.F * s.p90)]; row.n = p.nIn;
    out[g.id] = row; counts[row.b]++; area[row.b] += g.area.km2;
    if (row.why) why[row.why.split(':')[0]] = (why[row.why.split(':')[0]] ?? 0) + 1;
  }
  const totalArea = ch.reduce((s, g) => s + g.area.km2, 0);
  const doc = {
    schema: 1, kind: SNOW_FACTOR_TABLE_KIND, country: 'CH', build, builtAt: new Date().toISOString(), origin: 'computed', verified: false, note: SNOW_FACTOR_NOTE,
    rule: SNOW_FACTOR_RULE, smallClasses: { rule: smallRule, decision: 'Jan 25.11.2026: shrunk C if it beats the country value in BOTH small classes (step 1, one glacier left out), else the country value', step1: small },
    inputs: { ownTable: sha(ownPath), snowcal: sha(snowcalPath), countryF, predictors: sha(resolve(args.predictors)), x1: sha(join(work, 'x1-ch.json')), q20: 'Zenodo record 24088217, v1.1', melt: m, tool: sha(fileURLToPath(import.meta.url)) },
    sources: SNOW_FACTOR_SOURCES,
    model: { c: model.c, beta: model.beta, mu: model.mu, sc: model.sc, cPrime: Math.exp(model.c0), glaciers: cal.length, winters: rows.length, cal: calAll },
    spread, counts, area: Object.fromEntries(SNOW_FACTOR_BASES.map((b) => [b, { km2: r1(area[b]), share: r3(area[b] / totalArea) }])), countryWhy: why,
    glaciers: out,
  };
  const problems = snowFactorTableProblems(doc, new Map(glaciers.map((g) => [g.id, g])));
  if (problems.length) throw new Error(`Tabelle verletzt ihre Regeln: ${problems.slice(0, 5).join('; ')}`);
  writeFileSync(resolve(args.out), JSON.stringify(doc));
  // the report next to it (local only, values per glacier): the leave-one-glacier-out as built
  const rep = { kind: 'glacier/snow-factor-predicted-report', table: resolve(args.out), tableSha: sha(resolve(args.out)), generated: doc.builtAt, countryF, model: doc.model, smallClasses: doc.smallClasses,
    asBuilt, worse: { n: worse.length, list: worse }, spread, counts, area: doc.area, countryWhy: why, perGlacier,
    x1Compare: cal.map((g) => ({ key: g.key, name: g.name, build: r3(g.x1) })), boundGlaciers: bound, notScored };
  writeFileSync(resolve(args.out).replace(/\.json$/, '-report.json'), JSON.stringify(rep, null, 1));
  console.log(JSON.stringify({ ...rep, perGlacier: undefined, x1Compare: undefined }, null, 1));
}

const SELF = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  const mode = args.mode;
  const run = mode === 'forcing' ? forcing : mode === 'x1' ? x1Mode : mode === 'check-x1' ? checkX1 : mode === 'table' ? tableMode : null;
  if (!run) { console.error('--mode=forcing|x1|check-x1|table'); process.exit(2); }
  Promise.resolve().then(run).catch((e) => { console.error(e.stack ?? e); process.exit(1); });
}
