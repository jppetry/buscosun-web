#!/usr/bin/env node
/**
 * Phase GM, GM-3c (E-GM-14; audit/gletscher-schneemodell.md §3f) — the SEED of the snowpack line: the state `snowpack/state.json` a first shadow run of
 * `melt.mjs` continues, computed from 1 October with precipitation ANALYSES instead of starting at zero (measured in the audit: stations near the glaciers
 * carried 28 cm on 23.11.2026 where a cold start says 0). A local tool: it writes into `--out` and nothing else; the copy into the data repo is Jan's step.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/snowpack-seed.mjs \
 *        --data=<v1 view of the glacier line> --cache=<dir> --out=<dir> [--from=2026-10-01T00:00] [--end=<iso hour, default: the last full hour − 1 h>]
 *        [--precip=gate-c|country] [--density=helfricht|board] [--snowcal=<json>] [--calibration=<json>] [--python=<python with h5py>] [--fetch-wx=1] [--allow-partial=1] [--report=<json, default <out>-report.json>]
 *        [--glacier-factor=off|on|predicted] [--glacier-factor-table=<json>] [--snowcal-glaciers=<json>] [--melt-respin=<melt/state.json>]
 *
 * GM-10b (V-GM-86, V-GM-91): `--glacier-factor` is the switch of the producer — the seed then runs every glacier on the factor the melt run gives it (own,
 * predicted, else its region) and names the rule in `rules.factor`; a producer run continues only a state of its own rule. `--melt-respin` re-spins the
 * melt state of the glaciers whose factor changes with this rule from `--from` to the state's own hour (`--end` must be that hour) and writes it as
 * `<out>/melt/state.json` next to the snowpack state — the other glaciers keep their entry.
 *
 * Forcing (the datasets the precipitation factor of the calibration stands against — the bridge to buscosun Fusion does not apply here):
 *   Austria, Germany  GeoSphere Austria `inca-v2-1h-1km` (CC BY 4.0): hourly precipitation, temperature, global radiation at the nearest 1 km cell
 *   Switzerland       MeteoSwiss daily grids (CC BY 4.0, "Quelle: MeteoSchweiz"): RhiresD of a finished month, RprelimD after it, TabsD / TminD / TmaxD and the
 *                     relative sunshine duration, nearest cell (read by `py/snowcal_grid.py`); the day sum lies evenly on its 24 hours from 06 UTC (the rule
 *                     of the calibration), the temperature gets a daily course between minimum and maximum, the radiation is clear sky × the cloud factor
 * Neither source names the height its temperature belongs to. It is moved to the median elevation by the median difference to the answers of buscosun
 * Fusion there (the weather runs kept in the data repo), then with the standard lapse to tongue and top (`set`). A glacier without such answers gets no
 * entry (the producer then begins it at zero and says since when). Solid share: the temperature ramp of the melt core. Mass and thickness: the step of the
 * producer (`stepLevel`). An hour the analysis does not have (a day missing at the source, the hours after its end) takes the forcing of buscosun Fusion from the
 * weather run of that hour where the data repo keeps one — the state says for how many glaciers and hours; every other such hour is counted as an hour
 * without forcing, never filled with a guess.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MELT, bandsOf, cosZenith, clearSky, cloudFactor, simulate, emptyState } from './lib/meltcore.mjs';
import { createHash } from 'node:crypto';
import { glacierFactorModeOf, glacierRunOf } from './lib/snowcalGlaciers.mjs';
import { factorTableRunOf, factorRuleOf } from './lib/snowcalPredict.mjs';
import { stateRowOf } from './lib/meltstate.mjs';
import { meltStateProblems } from '../../src/glacier/glacierMeltContract.ts';
import { SNOW, SNOW_ORIGIN } from './lib/snowcore.mjs';
import { snowSwitchesOf, snowCoreSetup, precipRunOf } from './lib/snowcal.mjs';
import { emptyLevel, bareAlbedo, stepLevel, normalizeLevel } from './lib/snowpackcore.mjs';
import { GLACIER_SNOWPACK_PEND_H, GLACIER_SNOWPACK_STATE_PATH, snowpackStateProblems } from '../../src/glacier/glacierSnowpackContract.ts';

const H = 3_600_000;
const SELF = fileURLToPath(import.meta.url);
const HERE = dirname(SELF);
export const SEED_FROM = '2026-10-01T00:00';
export const SEED_SHIFT_MIN_H = 24;
const GEOSPHERE = 'https://dataset.api.hub.geosphere.at/v1';
const STAC = 'https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-surface-derived-grid/items';
const RAW = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/glacier/v1';
const API = 'https://api.github.com/repos/jppetry/buscosun-data/contents/glacier/v1';
const solid = (T) => Math.min(1, Math.max(0, (MELT.fsWarm - T) / (MELT.fsWarm - MELT.fsCold)));
const quant = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };

/** Median of (known − analysis) over the hours both series have; `null` below `min` common hours — never a guessed shift. */
export function shiftOf(known, analysis, min = SEED_SHIFT_MIN_H) {
  const d = [];
  for (let i = 0; i < Math.min(known.length, analysis.length); i++) if (Number.isFinite(known[i]) && Number.isFinite(analysis[i])) d.push(known[i] - analysis[i]);
  return d.length < min ? null : quant(d, 0.5);
}

/**
 * Daily grid values on hours. Day `d` of the arrays covers 06 UTC of `day0 + d` to 06 UTC of the following day (the day of the Swiss precipitation grid; used
 * for all of them, `set`). `p` mm per day evenly on the 24 hours; `t` daily mean with a cosine course of the amplitude (tx − tn) / 2 and its maximum at 14 h
 * local solar time (the mean stays); radiation = clear sky × cloud factor of (1 − relative sunshine duration `sun` in %), at the middle of the hour.
 * A day without precipitation value or temperature gives `null` in all three (the caller counts the hours).
 */
export function hourlyFromDaily({ day0, p, t, tn, tx, sun, lat, lon, z, fromMs, hours }) {
  const d0 = Date.parse(`${day0}T06:00:00Z`);
  const P = new Array(hours).fill(null), T = new Array(hours).fill(null), G = new Array(hours).fill(null);
  for (let h = 0; h < hours; h++) {
    const ms = fromMs + h * H, d = Math.floor((ms - d0) / (24 * H));
    if (d < 0 || d >= p.length || p[d] == null || t[d] == null) continue;
    P[h] = Math.max(0, p[d]) / 24;
    const amp = tn?.[d] != null && tx?.[d] != null ? Math.max(0, tx[d] - tn[d]) / 2 : 0;
    const local = ((ms + 0.5 * H) / H + lon / 15) % 24;
    T[h] = t[d] + amp * Math.cos((2 * Math.PI * (local - 14)) / 24);
    const cloud = sun?.[d] == null ? null : 1 - Math.min(1, Math.max(0, sun[d] / 100));
    G[h] = clearSky(cosZenith(lat, lon, ms + 0.5 * H), z) * (cloud == null ? 0.55 : cloudFactor(cloud));
  }
  return { p: P, t: T, g: G };
}

/**
 * The seed state from hourly forcing. `glaciers`: { id, z [tongue, median, top], ela, F (number or [3]), series { t, p, g } — index h = the hour that begins at
 * `fromMs + h` hours, `null` = missing —, dT = shift of the series' temperature to the median elevation (K) }. An hour without temperature is an hour without
 * forcing (counted in the entry) — unless the glacier carries `fill[h]` = { T [3] °C at the three elevations, P mm, G W m⁻² } for it: the forcing of buscosun Fusion
 * from a weather run of that hour (a day the analysis does not have, the hours after its end); the state says how many hours were taken from there.
 * A missing precipitation or radiation in an hour with temperature counts as none.
 */
export function seedOfForcing({ glaciers, fromMs, hours, cal, c, rules, info = {} }) {
  const g = {}, beginH = Math.round(fromMs / H);
  let filledGlaciers = 0, filledMax = 0;
  for (const gl of glaciers) {
    const F = Array.isArray(gl.F) ? gl.F : [gl.F, gl.F, gl.F];
    const levels = [emptyLevel(), emptyLevel(), emptyLevel()], pars = gl.z.map((z) => ({ TF: cal.TF, SRF: cal.SRF, aBare: bareAlbedo(z, gl.ela) }));
    let holes = 0, filled = 0;
    for (let h = 0; h < hours; h++) {
      const t = gl.series.t[h];
      if (t == null || !Number.isFinite(t)) {
        const fx = gl.fill?.[h];
        if (!fx) { holes++; continue; }
        for (let l = 0; l < 3; l++) { const T = Math.round(fx.T[l] * 10) / 10; stepLevel(levels[l], { tMs: fromMs + h * H, T, S: Math.round(100 * F[l] * Math.max(0, fx.P ?? 0) * solid(T)) / 100, G: Math.round(Math.max(0, fx.G ?? 0)) }, pars[l], c); }
        filled++; continue;
      }
      const P = Math.max(0, gl.series.p[h] ?? 0), G = Math.round(Math.max(0, gl.series.g[h] ?? 0));
      for (let l = 0; l < 3; l++) {
        const T = Math.round((t + gl.dT + MELT.gamma * (gl.z[l] - gl.z[1])) * 10) / 10;
        stepLevel(levels[l], { tMs: fromMs + h * H, T, S: Math.round(100 * F[l] * P * solid(T)) / 100, G }, pars[l], c);
      }
    }
    if (filled) { filledGlaciers++; filledMax = Math.max(filledMax, filled); }
    g[gl.id] = [beginH, holes, levels.map((lv) => normalizeLevel(lv, c)), levels.map((lv) => Math.round(lv.aS * 1000)), null];
  }
  return { schema: 1, kind: 'glacier/snowpack-state', atMs: fromMs + hours * H, source: 'seed', run: null, since: new Date(fromMs).toISOString(), rules, pendH: GLACIER_SNOWPACK_PEND_H, seed: { ...info, ...(filledGlaciers ? { filled: { rule: 'fusion-weather-runs', glaciers: filledGlaciers, maxH: filledMax } } : {}) }, g };
}

/**
 * V-GM-91 (GM-10b) — RE-SPIN of the melt state for a new factor rule: the glaciers of `state` (a `melt/state.json`) whose recorded factor (`fac.f[id]`,
 * none = the value of the region) differs from the factor of the new rule (`factorOf(id)`, `null` = the value of the region) begin again at `fromMs` from
 * an empty state and are run with the melt core of the producer (`simulate`, eti, TF / SRF, the factor, no gradient) on the SAME analysis forcing as the
 * snowpack seed (temperature at the median elevation = analysis + shift, precipitation, radiation; an hour of a weather run of buscosun Fusion where the
 * analysis has none; an hour without either is left out) up to the state's own hour (`hours` = (atMs − fromMs) / 1 h). Every other glacier keeps its entry
 * byte for byte. The result names the rule and the factor of every glacier that is not on its region's value (`fac`), so the producer continues it.
 * `glaciers`: { id, bands, ela, F (the new factor actually used), series, dT, fill? }.
 */
export function respinMeltState({ state, glaciers, factorOf, rule, fromMs, hours, cal }) {
  if (state?.kind !== 'glacier/melt-state') throw new Error('kein Schmelzzustand');
  if (Math.round((state.atMs - fromMs) / H) !== hours) throw new Error(`der Schmelzzustand steht bei ${new Date(state.atMs).toISOString()}, das Einschwingen endet bei ${new Date(fromMs + hours * H).toISOString()} — beide müssen dieselbe Stunde haben`);
  const byId = new Map(glaciers.map((g) => [g.id, g])), g = { ...state.g }, respun = [], missing = [];
  for (const id of Object.keys(state.g)) {
    const was = state.fac?.f?.[id] ?? null, now = factorOf(id);
    if ((was == null) === (now == null) && (was == null || Math.abs(was - now) <= 1e-9)) continue;
    const gl = byId.get(id);
    if (!gl) { missing.push(id); delete g[id]; continue; }   // no forcing: the entry is dropped, the producer begins it anew and says so
    const t = [], p = [], gg = [];
    for (let h = 0; h < hours; h++) {
      const th = gl.series.t[h];
      if (th != null && Number.isFinite(th)) { t.push(th + gl.dT); p.push(Math.max(0, gl.series.p[h] ?? 0)); gg.push(Math.max(0, gl.series.g[h] ?? 0)); }
      else if (gl.fill?.[h]) { const fx = gl.fill[h]; t.push(fx.T[1]); p.push(Math.max(0, fx.P ?? 0)); gg.push(Math.max(0, fx.G ?? 0)); }
    }
    const zMed = gl.ela;
    const out = simulate({ bands: gl.bands, ela: gl.ela, t: Float64Array.from(t), g: Float64Array.from(gg), p: Float64Array.from(p), zT: zMed, zP: zMed, pf: gl.F, TF: cal.TF, SRF: cal.SRF, state: emptyState(gl.bands.zb.length), model: 'eti', pGrad: 0 });
    g[id] = stateRowOf(out.state); respun.push(id);
  }
  const f = Object.fromEntries(Object.keys(g).map((id) => [id, factorOf(id)]).filter(([, F]) => F != null));
  const next = { ...state, g };
  if (rule) next.fac = { rule, f }; else delete next.fac;
  if (next.sat) next.sat = Object.fromEntries(Object.entries(next.sat).filter(([id]) => id in g));
  const problems = meltStateProblems(next);
  if (problems.length) throw new Error(`neu eingeschwungener Schmelzzustand verletzt den Vertrag: ${problems.slice(0, 5).join('; ')}`);
  return { state: next, respun, missing };
}

// --- the tool ----------------------------------------------------------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getText(url, file = null, { bin = false } = {}) {
  if (file && existsSync(file)) return bin ? null : readFileSync(file, 'utf8');
  for (let k = 0; ; k++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'node' } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`${r.status} ${url.slice(0, 140)}`);
      if (bin) { writeFileSync(file, Buffer.from(await r.arrayBuffer())); return null; }
      const t = await r.text(); if (file) writeFileSync(file, t); return t;
    } catch (e) { if (k >= 3) throw e; await sleep(3000 * (k + 1)); }
  }
}
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

/** INCA on the stamps fromMs … endMs (inclusive), 20 points per request: per key { tp, t, g } on the stamps. */
async function incaOf(points, fromMs, endMs, dir) {
  mkdirSync(dir, { recursive: true });
  const iso = (ms) => new Date(ms).toISOString().slice(0, 16), n = Math.round((endMs - fromMs) / H) + 1, out = new Map();
  for (let i = 0; i < points.length; i += 20) {
    const part = points.slice(i, i + 20), file = join(dir, `inca-${iso(fromMs).replace(/\W/g, '')}-${iso(endMs).replace(/\W/g, '')}-${i}.json`);
    const fresh = !existsSync(file);
    const t = await getText(`${GEOSPHERE}/timeseries/historical/inca-v2-1h-1km?parameters=tp,2t,ssrd&start=${iso(fromMs)}&end=${iso(endMs)}&${part.map((p) => `lat_lon=${p.lat},${p.lon}`).join('&')}&output_format=geojson`, file);
    const j = t ? JSON.parse(t) : null;
    if (!j?.features || j.timestamps.length !== n) throw new Error(`INCA: Antwort ${i} unbrauchbar (${j?.timestamps?.length ?? 'keine'} Stunden statt ${n})`);
    j.features.forEach((f, k) => { const P = f.properties.parameters; out.set(part[k].key, { tp: P.tp.data, t: P['2t'].data, g: P.ssrd.data }); });
    if (fresh) await sleep(250);
  }
  return out;
}

/** The Swiss daily grids for the days `days` (yyyy-mm-dd): per variable { key → value per day }, and the days the source does not have. */
async function swissOf(points, days, dir, python) {
  mkdirSync(dir, { recursive: true });
  const items = new Map();
  for (let url = `${STAC}?limit=100`, k = 0; url && k < 30; k++) { const j = JSON.parse(await getText(url)); for (const f of j.features) items.set(f.id, f.assets); url = j.links?.find((l) => l.rel === 'next')?.href ?? null; }
  const VARS = { p: ['rhiresd', 'rprelimd'], t: ['tabsd', 'tabsd'], tn: ['tmind', 'tmind'], tx: ['tmaxd', 'tmaxd'], sun: ['sreld', 'sreld'] };
  const assetOf = (assets, name) => Object.entries(assets ?? {}).find(([key]) => new RegExp(`\\.${name}_`).test(key))?.[1]?.href ?? null;
  writeFileSync(join(dir, 'points.json'), JSON.stringify(points));
  const out = {}, missing = new Set();
  for (const [v, [monthly, daily]] of Object.entries(VARS)) {
    const files = new Map();   // url → local file, in the order of the days
    for (const d of days) {
      const m = assetOf(items.get(`${d.slice(0, 4)}${d.slice(5, 7)}-ch`), monthly), href = m ?? assetOf(items.get(`${d.replace(/-/g, '')}-ch`), daily);
      if (!href) { if (v === 'p' || v === 't') missing.add(d); continue; }
      if (!files.has(href)) files.set(href, join(dir, href.split('/').pop()));
    }
    for (const [href, file] of files) if (!existsSync(file)) { await getText(href, file, { bin: true }); await sleep(100); }
    const res = join(dir, `grid-${v}.json`);
    execFileSync(python, [join(HERE, 'py', 'snowcal_grid.py'), '--points', join(dir, 'points.json'), '--files', [...files.values()].join(','), '--out', res], { stdio: ['ignore', 'ignore', 'inherit'], maxBuffer: 64 * 1024 * 1024 });
    const grid = J(res), at = new Map(grid.dates.map((d, i) => [d, i]));
    out[v] = Object.fromEntries(points.map((p) => [p.key, days.map((d) => { const i = at.get(d); const x = i == null ? null : grid.points[p.key]?.p[i]; return x == null ? null : x; })]));
  }
  return { ...out, missing: [...missing].sort() };
}

/** Temperature of buscosun Fusion at the median elevation per glacier on the stamps fromMs + k h: of every weather run the hours up to the next run. */
async function fusionTemps({ dataDir, cacheDir, fromMs, endMs, fetchWx }) {
  const n = Math.round((endMs - fromMs) / H) + 1, out = new Map(), rows = new Map(), from = new Map();
  const runMs = (r) => Date.UTC(+r.slice(0, 4), +r.slice(4, 6) - 1, +r.slice(6, 8), +r.slice(8, 10));
  const local = join(dataDir, 'melt', 'wx');
  let runs = existsSync(local) ? readdirSync(local).filter((f) => /^\d{10}$/.test(f)) : [];
  const read = new Map();
  if (fetchWx) {
    mkdirSync(join(cacheDir, 'wx'), { recursive: true });
    const listing = JSON.parse(await getText(`${API}/melt/wx?ref=main`));
    runs = [...new Set([...runs, ...listing.map((e) => e.name).filter((x) => /^\d{10}$/.test(x))])];
  }
  runs = runs.filter((r) => runMs(r) <= endMs && runMs(r) >= endMs - 10 * 24 * H).sort();
  for (let k = 0; k < runs.length; k++) {
    const r0 = runMs(runs[k]), gap = Math.min(48, k + 1 < runs.length ? Math.round((runMs(runs[k + 1]) - r0) / H) : 6);
    let chunks = [], dailyDoc = null;
    if (existsSync(join(local, runs[k]))) { chunks = readdirSync(join(local, runs[k])).map((f) => J(join(local, runs[k], f))); if (existsSync(join(local, `${runs[k]}.json`))) dailyDoc = J(join(local, `${runs[k]}.json`)); }
    else if (fetchWx) {
      const daily = JSON.parse((await getText(`${RAW}/melt/wx/${runs[k]}.json`, join(cacheDir, 'wx', `${runs[k]}.json`))) ?? 'null');
      dailyDoc = daily;
      for (const region of daily?.regions ?? []) { const t = await getText(`${RAW}/melt/wx/${runs[k]}/${region}.json`, join(cacheDir, 'wx', `${runs[k]}-${region}.json`)); if (t) chunks.push(JSON.parse(t)); }
    }
    read.set(runs[k], chunks.length);
    for (const r of dailyDoc?.glaciers ?? []) from.set(r.id, r.f ?? 'own');
    for (const c of chunks) for (const [id, row] of Object.entries(c.glaciers ?? {})) {
      if (!row.t?.[1]) continue;
      if (!out.has(id)) out.set(id, new Array(n).fill(null));
      if (!rows.has(id)) rows.set(id, { t: new Array(n).fill(null), p: new Array(n).fill(null), c: new Array(n).fill(null) });
      const rw = rows.get(id);
      for (let h = 0; h < gap; h++) {
        const i = Math.round((r0 + h * H - fromMs) / H);
        if (i < 0 || i >= n || !Number.isFinite(row.t[1][h])) continue;
        out.get(id)[i] = row.t[1][h];
        if ([0, 1, 2].every((l) => Number.isFinite(row.t[l]?.[h]))) rw.t[i] = [row.t[0][h], row.t[1][h], row.t[2][h]];
        if (Number.isFinite(row.p?.[h])) rw.p[i] = row.p[h];
        if (Number.isFinite(row.c?.[h])) rw.c[i] = row.c[h];
      }
    }
  }
  return { temps: out, rows, from, runs: [...read.entries()].filter(([, c]) => c > 0).map(([r]) => r) };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
  for (const k of ['data', 'cache', 'out']) if (!args[k]) { console.error(`--${k}=<Pfad> fehlt`); process.exit(2); }
  const dataDir = resolve(args.data), cacheDir = resolve(args.cache), outDir = resolve(args.out);
  const fromMs = Date.parse(`${args.from ?? SEED_FROM}Z`), endMs = args.end ? Date.parse(`${args.end}Z`) : Math.floor(Date.now() / H) * H - H;
  if (!(endMs > fromMs) || endMs % H || fromMs % H) throw new Error('Zeitraum: --from und --end sind volle Stunden, --end nach --from');
  const hours = Math.round((endMs - fromMs) / H);
  const rules = snowSwitchesOf({ precip: args.precip ?? process.env.GLACIER_SNOW_PRECIP, density: args.density ?? process.env.GLACIER_SNOW_DENSITY });
  const cal = J(resolve(args.calibration ?? join(HERE, 'melt-calibration.json'))).fit;
  const index = J(join(dataDir, 'index.json')), build = index.static.build;
  const cat = J(join(dataDir, 'static', build, 'catalog.json')).glaciers;
  const table = rules.precip === 'country' ? J(resolve(args.snowcal ?? join(HERE, 'snow-calibration.json'))) : null;
  const precip = table ? precipRunOf(table, [...new Set(cat.map((g) => g.region))]) : null;   // throws when the table is not usable
  const setup = snowCoreSetup({ density: rules.density, base: SNOW, baseOrigin: SNOW_ORIGIN, table });
  // V-GM-86 (GM-10b): the factor switch of the producer — the seed runs on the SAME factor per glacier and names the rule in its state
  const facMode = glacierFactorModeOf(args['glacier-factor'] ?? process.env.GLACIER_SNOW_GLACIER_FACTOR);
  let facOf = () => null;
  if (facMode !== 'off') {
    if (rules.precip !== 'country') throw new Error('Faktor je Gletscher gilt nur mit dem Niederschlagsfaktor „country“');
    const ownFile = resolve(args['snowcal-glaciers'] ?? join(HERE, 'snow-calibration-glaciers.json'));
    const own = glacierRunOf(J(ownFile), { factor: true }, new Set(cat.map((g) => g.id))), ownSha = createHash('sha256').update(readFileSync(ownFile)).digest('hex');
    let pred = null, sha = ownSha;
    if (facMode === 'predicted') {
      const named = args['glacier-factor-table'] ?? process.env.GLACIER_SNOW_GLACIER_FACTOR_TABLE;
      if (!named) throw new Error('Faktor je Gletscher „predicted“ braucht --glacier-factor-table=<json>');
      const raw = readFileSync(resolve(named));
      sha = createHash('sha256').update(raw).digest('hex');
      const regionOf = new Map(cat.map((g) => [g.id, g.region]));
      pred = factorTableRunOf(JSON.parse(raw.toString('utf8')), { own, ownSha, countryOf: (id) => precip.factorOf(regionOf.get(id)), catalog: new Map(cat.map((g) => [g.id, g])), tableSha: sha });
    }
    facOf = (id) => own.factorOf(id) ?? pred?.factorOf(id) ?? null;
    rules.factor = factorRuleOf(facMode, sha);
  }
  const hyp = new Map(), hypOf = (region) => { if (!hyp.has(region)) hyp.set(region, J(join(dataDir, 'static', build, 'hypso', `${region}.json`)).glaciers ?? {}); return hyp.get(region); };
  const skipped = [], all = [];
  for (const g of cat) {
    const h = hypOf(g.region)[g.id];
    if (!h?.a?.some((v) => v > 0)) { skipped.push({ id: g.id, reason: 'no-hypsometry' }); continue; }
    const zb = bandsOf(h).zb, z = [zb[0], g.z[1], zb[zb.length - 1]];
    if (!(z[0] <= z[1] + 25 && z[1] <= z[2] + 25)) { skipped.push({ id: g.id, reason: 'elevations' }); continue; }
    all.push({ id: g.id, key: g.id, country: g.country, lat: g.lat, lon: g.lon, z, ela: g.z[1], bands: bandsOf(h), F: precip ? facOf(g.id) ?? precip.factorOf(g.region) : z.map((zz) => cal.pf * (1 + (MELT.pGrad * (zz - g.z[1])) / 100)) });
  }
  console.error(`${all.length} Gletscher (${skipped.length} ohne Höhen), ${hours} Stunden ${new Date(fromMs).toISOString()} … ${new Date(endMs).toISOString()}, Regeln ${rules.precip}/${rules.density}`);
  const { temps: fusion, rows: fusionRows, from: fusionFrom, runs: wxRuns } = await fusionTemps({ dataDir, cacheDir, fromMs, endMs, fetchWx: !!args['fetch-wx'] });
  if (!wxRuns.length) throw new Error('keine Wetterläufe von buscosun Fusion im Zeitraum (melt/wx): ohne sie hat die Temperatur der Analysen keine Höhe — mit --fetch-wx=1 aus dem Daten-Repo lesen');
  // Austria, Germany: INCA on the stamps; the hour h takes the precipitation and radiation of the stamp that ends it and the mean temperature of its two stamps
  const hourly = all.filter((g) => g.country !== 'CH'), swiss = all.filter((g) => g.country === 'CH');
  const inca = hourly.length ? await incaOf(hourly, fromMs, endMs, join(cacheDir, 'inca')) : new Map();
  const series = new Map(), stampT = new Map();
  for (const g of hourly) {
    const s = inca.get(g.key);
    series.set(g.id, { p: Array.from({ length: hours }, (_, h) => s.tp[h + 1]), g: Array.from({ length: hours }, (_, h) => s.g[h + 1]), t: Array.from({ length: hours }, (_, h) => (s.t[h] != null && s.t[h + 1] != null ? (s.t[h] + s.t[h + 1]) / 2 : s.t[h + 1] ?? s.t[h])) });
    stampT.set(g.id, s.t);
  }
  let missingDays = [];
  if (swiss.length) {
    const days = []; for (let ms = fromMs - 24 * H; ms < endMs; ms += 24 * H) days.push(dayOf(ms));
    const grid = await swissOf(swiss, days, join(cacheDir, 'chgrid'), args.python ?? 'python');
    missingDays = grid.missing.filter((d) => Date.parse(`${d}T06:00:00Z`) < endMs);
    for (const g of swiss) {
      const s = hourlyFromDaily({ day0: days[0], p: grid.p[g.key], t: grid.t[g.key], tn: grid.tn[g.key], tx: grid.tx[g.key], sun: grid.sun[g.key], lat: g.lat, lon: g.lon, z: g.z[1], fromMs, hours });
      series.set(g.id, s); stampT.set(g.id, s.t);
    }
  }
  const glaciers = [], shifts = [];
  for (const g of all) {
    const dT = fusion.has(g.id) ? shiftOf(fusion.get(g.id), stampT.get(g.id)) : null;
    if (dT == null) { skipped.push({ id: g.id, reason: 'no-shift' }); continue; }
    // hours the analysis does not have: the forcing of buscosun Fusion from the weather run of that hour — temperature of the row itself (its own elevations),
    // precipitation and cloud cover of the row its forcing comes from (the glacier itself or its neighbour)
    const s = series.get(g.id), own = fusionRows.get(g.id), src = fusionRows.get(fusionFrom.get(g.id) === 'own' || !fusionFrom.has(g.id) ? g.id : fusionFrom.get(g.id));
    let fill = null;
    if (own && src) for (let h = 0; h < hours; h++) {
      if (s.t[h] != null || !own.t[h] || src.p[h] == null) continue;
      (fill ??= {})[h] = { T: own.t[h], P: src.p[h], G: clearSky(cosZenith(g.lat, g.lon, fromMs + (h + 0.5) * H), g.z[1]) * (src.c[h] == null ? 0.55 : cloudFactor(src.c[h] / 100)) };
    }
    shifts.push(dT); glaciers.push({ ...g, series: s, dT, ...(fill ? { fill } : {}) });
  }
  if (!args['allow-partial'] && skipped.filter((s) => s.reason === 'no-shift').length > 0.05 * all.length) throw new Error(`${skipped.filter((s) => s.reason === 'no-shift').length} von ${all.length} Gletschern ohne Höhenbezug der Temperatur (Wetterläufe fehlen?) — Abbruch statt eines lückenhaften Startzustands (--allow-partial=1 lässt es zu)`);
  const info = {
    builtAt: new Date().toISOString(), build, forcing: { AT: 'GeoSphere Austria inca-v2-1h-1km (tp, 2t, ssrd), CC BY 4.0', DE: 'GeoSphere Austria inca-v2-1h-1km (tp, 2t, ssrd), CC BY 4.0', CH: 'MeteoSchweiz ogd-surface-derived-grid (RhiresD / RprelimD, TabsD, TminD, TmaxD, SrelD), CC BY 4.0, Quelle: MeteoSchweiz' },
    phase: 'temperature', shift: { against: 'buscosun Fusion, Medianhöhe', runs: [wxRuns[0], wxRuns[wxRuns.length - 1], wxRuns.length], lapse: MELT.gamma, origin: 'set' }, missingDays: { CH: missingDays }, glaciers: glaciers.length, skipped: skipped.length,
  };
  const state = seedOfForcing({ glaciers, fromMs, hours, cal, c: setup.c, rules, info });
  const problems = snowpackStateProblems(state);
  if (problems.length) throw new Error(`Startzustand verletzt den Vertrag: ${problems.slice(0, 5).join('; ')}`);
  mkdirSync(join(outDir, dirname(GLACIER_SNOWPACK_STATE_PATH)), { recursive: true });
  const raw = JSON.stringify(state);
  writeFileSync(join(outDir, GLACIER_SNOWPACK_STATE_PATH), raw);
  // report: what the seed holds, per country
  const sweOf = (row) => (row[0] + row.slice(2).reduce((s, v, i) => s + (i % 3 === 0 ? v : 0), 0)) / 10, hsOf = (row) => (row[1] + row.slice(2).reduce((s, v, i) => s + (i % 3 === 1 ? v : 0), 0)) / 10;
  const q3 = (a) => [0.1, 0.5, 0.9].map((q) => Math.round(quant(a, q) * 10) / 10);
  const by = (c) => { const gs = glaciers.filter((g) => g.country === c); return gs.length ? { glaciers: gs.length, filledH: q3(gs.map((g) => Object.keys(g.fill ?? {}).length)), holesH: q3(gs.map((g) => state.g[g.id][1])), hsCm: [0, 1, 2].map((l) => q3(gs.map((g) => hsOf(state.g[g.id][2][l])))), sweMm: [0, 1, 2].map((l) => q3(gs.map((g) => sweOf(state.g[g.id][2][l])))), without: [0, 1, 2].map((l) => gs.filter((g) => state.g[g.id][2][l][0] === 0 && state.g[g.id][2][l].length === 2).length) } : null; };
  // V-GM-91 (GM-10b): `--melt-respin=<melt/state.json>` re-spins the melt state of the glaciers whose factor changes with this rule, up to the state's own hour
  let respin = null;
  if (args['melt-respin']) {
    const ms = J(resolve(args['melt-respin']));
    const r = respinMeltState({ state: ms, glaciers, factorOf: facOf, rule: rules.factor ?? null, fromMs, hours, cal });
    mkdirSync(join(outDir, 'melt'), { recursive: true });
    writeFileSync(join(outDir, 'melt', 'state.json'), JSON.stringify(r.state));
    respin = { from: resolve(args['melt-respin']), respun: r.respun.length, dropped: r.missing.length, rule: rules.factor ?? null };
  }
  const report = { kind: 'glacier/snowpack-seed-report', ...info, ...(respin ? { meltRespin: respin } : {}), window: { from: state.since, to: new Date(state.atMs).toISOString(), hours }, rules, bytes: Buffer.byteLength(raw), shiftK: q3(shifts), byCountry: Object.fromEntries(['AT', 'CH', 'DE'].map((c) => [c, by(c)])), skippedList: skipped };
  // the report lies NEXT to the output tree: the tree holds nothing but `snowpack/state.json`, so it can be handed to the publisher as it is
  writeFileSync(resolve(args.report ?? `${outDir}-report.json`), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ ...report, skippedList: undefined, skippedReasons: skipped.reduce((m, s) => { m[s.reason] = (m[s.reason] ?? 0) + 1; return m; }, {}) }));
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
