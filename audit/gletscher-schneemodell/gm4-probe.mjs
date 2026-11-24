#!/usr/bin/env node
/**
 * Phase GM, GM-4 diagnosis (audit/gletscher-schneemodell.md §3h) — measurements M-6 … M-9 under the frozen rule `gm4-method-frozen.md` (sha256 in
 * `gm4-method-frozen.sha256`). Read only: the data repo is read through a local copy, nothing is written outside `--out`.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/gletscher-schneemodell/gm4-probe.mjs \
 *        [--view=C:\dev\buscosun-glacier-cache\gs\view\glacier\v1] [--cache=C:\dev\buscosun-glacier-cache\gm3c-snowpack\seed]
 *        [--live=C:\dev\buscosun-glacier-cache\gm4\live] [--python=C:\dev\buscosun-glacier-cache\.venv\Scripts\python.exe] [--out=audit/gletscher-schneemodell/gm4-probe.json]
 *
 * The trajectory: the seed tool's own reading functions (`incaOf`, `swissOf`, `fusionTemps`) are taken from `scripts/glacier/snowpack-seed.mjs` through a
 * generated shim (only import paths changed, plus the Swiss days the source did not have when the live seed was built — 17.11. and 23.11. — removed from
 * the listing, so that a file published since does not enter); the stepping is `seedOfForcing` with a recorder. Valid only if the end state equals the
 * seed in the data repo byte for byte (checked; otherwise the probe stops).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const H = 3_600_000;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const VIEW = resolve(args.view ?? 'C:/dev/buscosun-glacier-cache/gs/view/glacier/v1');
const CACHE = resolve(args.cache ?? 'C:/dev/buscosun-glacier-cache/gm3c-snowpack/seed');
const LIVE = resolve(args.live ?? 'C:/dev/buscosun-glacier-cache/gm4/live');
const PY = args.python ?? 'C:/dev/buscosun-glacier-cache/.venv/Scripts/python.exe';
const OUT = resolve(args.out ?? join(HERE, 'gm4-probe.json'));
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const log = (m) => console.error(m);

// --- frozen rule ---------------------------------------------------------------------------------------------------------------------------------
const methodHash = createHash('sha256').update(readFileSync(join(HERE, 'gm4-method-frozen.md'))).digest('hex');
const frozen = readFileSync(join(HERE, 'gm4-method-frozen.sha256'), 'utf8').split(/\s/)[0];
if (methodHash !== frozen) throw new Error(`Messregel geändert (sha256 ${methodHash} statt ${frozen})`);

const T_MS = Date.parse('2026-11-23T17:00:00Z');
const FROM_MS = Date.parse('2026-10-01T00:00:00Z');
const REC_FROM_MS = T_MS - 72 * H;
const EVENT_CM = 3, CALM_CM = 1, LEVEL_MIN_CM = 5, HIT_CM = 1, FALSE_CM = 3, MIN_N = 20;
const RADII = [15, 30, 60];
const MISSING_AT_SEED = ['20261117-ch', '20261123-ch'];

// --- shim of the seed tool -----------------------------------------------------------------------------------------------------------------------
const libUrl = (p) => pathToFileURL(join(ROOT, 'scripts', 'glacier', p)).href;
let src = readFileSync(join(ROOT, 'scripts', 'glacier', 'snowpack-seed.mjs'), 'utf8');
src = src.replace(/from '\.\/(lib\/[^']+)'/g, (_, p) => `from '${libUrl(p)}'`)
  .replace(/from '\.\.\/\.\.\/(src\/[^']+)'/g, (_, p) => `from '${pathToFileURL(join(ROOT, p)).href}'`)
  .replace('const HERE = dirname(SELF);', `const HERE = ${JSON.stringify(join(ROOT, 'scripts', 'glacier'))};`)
  .replace('for (const f of j.features) items.set(f.id, f.assets);', `for (const f of j.features) if (!${JSON.stringify(MISSING_AT_SEED)}.includes(f.id)) items.set(f.id, f.assets);`);
if (!src.includes(JSON.stringify(MISSING_AT_SEED))) throw new Error('Shim: Muster der STAC-Liste nicht gefunden');
src += '\nexport { incaOf, swissOf, fusionTemps };\n';
const shimDir = join(LIVE, '..', 'shim'); mkdirSync(shimDir, { recursive: true });
const shimFile = join(shimDir, 'seed-shim.mjs'); writeFileSync(shimFile, src);
const seedMod = await import(pathToFileURL(shimFile).href);
const { MELT, bandsOf } = await import(libUrl('lib/meltcore.mjs'));
const { SNOW, SNOW_ORIGIN, packSwe, packDepthCm } = await import(libUrl('lib/snowcore.mjs'));
const { snowSwitchesOf, snowCoreSetup, precipRunOf } = await import(libUrl('lib/snowcal.mjs'));
const { emptyLevel, bareAlbedo, stepLevel, normalizeLevel } = await import(libUrl('lib/snowpackcore.mjs'));
const { nudgeState, MELT_SNOW_NUDGE_MM, MELT_SAT_MAX_AGE_DAYS } = await import(pathToFileURL(join(ROOT, 'scripts', 'glacier', 'melt.mjs')).href);
const { glacierSatClass } = await import(pathToFileURL(join(ROOT, 'src', 'glacier', 'glacierSatContract.ts')).href);
const { clearSky, cosZenith, cloudFactor } = await import(libUrl('lib/meltcore.mjs'));

// --- M-0: the trajectory (main of the seed tool up to the glaciers, then a recording step) ----------------------------------------------------
const hours = Math.round((T_MS - FROM_MS) / H);
const rules = snowSwitchesOf({});
const cal = J(join(ROOT, 'scripts', 'glacier', 'melt-calibration.json')).fit;
const index = J(join(VIEW, 'index.json')), build = index.static.build;
const cat = J(join(VIEW, 'static', build, 'catalog.json')).glaciers;
const table = J(join(ROOT, 'scripts', 'glacier', 'snow-calibration.json'));
const precip = precipRunOf(table, [...new Set(cat.map((g) => g.region))]);
const setup = snowCoreSetup({ density: rules.density, base: SNOW, baseOrigin: SNOW_ORIGIN, table });
const hypC = new Map(), hypOf = (r) => { if (!hypC.has(r)) hypC.set(r, J(join(VIEW, 'static', build, 'hypso', `${r}.json`)).glaciers ?? {}); return hypC.get(r); };
const all = [];
for (const g of cat) {
  const h = hypOf(g.region)[g.id];
  if (!h?.a?.some((v) => v > 0)) continue;
  const zb = bandsOf(h).zb, z = [zb[0], g.z[1], zb[zb.length - 1]];
  if (!(z[0] <= z[1] + 25 && z[1] <= z[2] + 25)) continue;
  all.push({ id: g.id, key: g.id, country: g.country, lat: g.lat, lon: g.lon, z, ela: g.z[1], F: precip.factorOf(g.region) });
}
log(`${all.length} Gletscher, ${hours} Stunden, Regeln ${rules.precip}/${rules.density}`);
const { temps: fusion, rows: fusionRows, from: fusionFrom } = await seedMod.fusionTemps({ dataDir: VIEW, cacheDir: CACHE, fromMs: FROM_MS, endMs: T_MS, fetchWx: true });
const hourly = all.filter((g) => g.country !== 'CH'), swiss = all.filter((g) => g.country === 'CH');
const inca = await seedMod.incaOf(hourly, FROM_MS, T_MS, join(CACHE, 'inca'));
const series = new Map(), stampT = new Map();
for (const g of hourly) {
  const s = inca.get(g.key);
  series.set(g.id, { p: Array.from({ length: hours }, (_, h) => s.tp[h + 1]), g: Array.from({ length: hours }, (_, h) => s.g[h + 1]), t: Array.from({ length: hours }, (_, h) => (s.t[h] != null && s.t[h + 1] != null ? (s.t[h] + s.t[h + 1]) / 2 : s.t[h + 1] ?? s.t[h])) });
  stampT.set(g.id, s.t);
}
const days = []; for (let ms = FROM_MS - 24 * H; ms < T_MS; ms += 24 * H) days.push(new Date(ms).toISOString().slice(0, 10));
const grid = await seedMod.swissOf(swiss, days, join(CACHE, 'chgrid'), PY);
for (const g of swiss) {
  const s = seedMod.hourlyFromDaily({ day0: days[0], p: grid.p[g.key], t: grid.t[g.key], tn: grid.tn[g.key], tx: grid.tx[g.key], sun: grid.sun[g.key], lat: g.lat, lon: g.lon, z: g.z[1], fromMs: FROM_MS, hours });
  series.set(g.id, s); stampT.set(g.id, s.t);
}
const solid = (T) => Math.min(1, Math.max(0, (MELT.fsWarm - T) / (MELT.fsWarm - MELT.fsCold)));
const rec0 = Math.round((REC_FROM_MS - FROM_MS) / H);   // record after the step of hour h when FROM + (h+1) ≥ REC_FROM
const traj = {}, endG = {};
for (const gl of all) {
  const dT = fusion.has(gl.id) ? seedMod.shiftOf(fusion.get(gl.id), stampT.get(gl.id)) : null;
  if (dT == null) continue;
  const s = series.get(gl.id), own = fusionRows.get(gl.id), srcRow = fusionRows.get(fusionFrom.get(gl.id) === 'own' || !fusionFrom.has(gl.id) ? gl.id : fusionFrom.get(gl.id));
  let fill = null;
  if (own && srcRow) for (let h = 0; h < hours; h++) {
    if (s.t[h] != null || !own.t[h] || srcRow.p[h] == null) continue;
    (fill ??= {})[h] = { T: own.t[h], P: srcRow.p[h], G: clearSky(cosZenith(gl.lat, gl.lon, FROM_MS + (h + 0.5) * H), gl.z[1]) * (srcRow.c[h] == null ? 0.55 : cloudFactor(srcRow.c[h] / 100)) };
  }
  // the loop of `seedOfForcing`, line for line, with a recorder
  const F = Array.isArray(gl.F) ? gl.F : [gl.F, gl.F, gl.F];
  const levels = [emptyLevel(), emptyLevel(), emptyLevel()], pars = gl.z.map((z) => ({ TF: cal.TF, SRF: cal.SRF, aBare: bareAlbedo(z, gl.ela) }));
  let holes = 0;
  const hs = [[], [], []], swe = [[], [], []];
  for (let h = 0; h < hours; h++) {
    const t = s.t[h];
    if (t == null || !Number.isFinite(t)) {
      const fx = fill?.[h];
      if (!fx) holes++;
      else for (let l = 0; l < 3; l++) { const T = Math.round(fx.T[l] * 10) / 10; stepLevel(levels[l], { tMs: FROM_MS + h * H, T, S: Math.round(100 * F[l] * Math.max(0, fx.P ?? 0) * solid(T)) / 100, G: Math.round(Math.max(0, fx.G ?? 0)) }, pars[l], setup.c); }
    } else {
      const P = Math.max(0, s.p[h] ?? 0), G = Math.round(Math.max(0, s.g[h] ?? 0));
      for (let l = 0; l < 3; l++) {
        const T = Math.round((t + dT + MELT.gamma * (gl.z[l] - gl.z[1])) * 10) / 10;
        stepLevel(levels[l], { tMs: FROM_MS + h * H, T, S: Math.round(100 * F[l] * P * solid(T)) / 100, G }, pars[l], setup.c);
      }
    }
    if (h + 1 >= rec0) for (let l = 0; l < 3; l++) { hs[l].push(packDepthCm(levels[l].pack)); swe[l].push(packSwe(levels[l].pack)); }
  }
  endG[gl.id] = [Math.round(FROM_MS / H), holes, levels.map((lv) => normalizeLevel(lv, setup.c)), levels.map((lv) => Math.round(lv.aS * 1000)), null];
  traj[gl.id] = { z: gl.z, country: gl.country, F, hs, swe };
}
// validity: byte for byte the seed in the data repo
const seed = J(join(LIVE, 'snowpack', 'state.json'));
const seedIds = Object.keys(seed.g), probeIds = Object.keys(endG);
const diff = seedIds.filter((id) => JSON.stringify(seed.g[id]) !== JSON.stringify(endG[id])).concat(probeIds.filter((id) => !seed.g[id]));
const validity = { seedAtMs: seed.atMs, tMs: T_MS, seedGlaciers: seedIds.length, probeGlaciers: probeIds.length, different: diff.length, example: diff.slice(0, 3) };
log(`Gültigkeit: ${JSON.stringify(validity)}`);
if (seed.atMs !== T_MS || diff.length || seedIds.length !== probeIds.length) { writeFileSync(OUT, JSON.stringify({ methodHash, validity, verdict: 'ungültig' }, null, 1)); throw new Error('Nachrechnung weicht vom Startzustand ab: Messung ungültig'); }

// --- stations ---------------------------------------------------------------------------------------------------------------------------------
const map = J(join(LIVE, 'stn', 'map', '20261120-1.4.json'));
const stCat = map.ext.stations;
const slotOf = (ms) => { const d = new Date(ms).toISOString(); const f = join(LIVE, 'stn', 'h', `${d.slice(0, 4)}${d.slice(5, 7)}${d.slice(8, 10)}${d.slice(11, 13)}.json`); if (!existsSync(f)) return null; const j = J(f); return { ...j.stations, ...(j.ext?.stations ?? {}) }; };
const slots = { 0: slotOf(T_MS), 24: slotOf(T_MS - 24 * H), 48: slotOf(T_MS - 48 * H) };
const valAt = (k, id) => { const e = slots[k]?.[id]; if (!e || !Number.isFinite(e.v?.snow)) return null; const at = Date.parse(e.t), ref = T_MS - k * H; return at >= ref - 60 * 60_000 && at <= ref + 15 * 60_000 ? e.v.snow : null; };
const hsdAt = (id) => slots[0]?.[id]?.hsd ?? null;
const recIdx = (ms) => Math.round((ms - REC_FROM_MS) / H) - 0;   // index into hs[l]: entry i = state at REC_FROM + i h
const modelAt = (t, zS, i) => {
  const z = t.z, v = (l) => t.hs[l][i];
  if (zS <= z[0]) return { v: v(0), cls: zS < z[0] ? 'below' : 'inside' };
  if (zS >= z[2]) return { v: v(2), cls: zS > z[2] ? 'above' : 'inside' };
  const l = zS <= z[1] ? 0 : 1, a = z[l], b = z[l + 1];
  return { v: b > a ? v(l) + ((v(l + 1) - v(l)) * (zS - a)) / (b - a) : v(l), cls: 'inside' };
};
const band = (z) => (z < 2000 ? '<2000' : z < 2500 ? '2000-2499' : '>=2500');
const pairs = [];
for (const [gid, r] of Object.entries(map.ext.glaciers)) {
  if (!r.snow || !traj[gid]) continue;
  const [sid, km, dz] = r.snow, sc = stCat[sid];
  if (!sc || !Number.isFinite(sc.elev)) continue;
  const t = traj[gid], zS = sc.elev;
  const m = (k) => modelAt(t, zS, recIdx(T_MS - k * H));
  const p = { gid, sid, net: sid.split(':')[0], country: t.country, F: t.F[1], km, dz, zS, band: band(zS), cls: m(0).cls, lat: sc.lat, lon: sc.lon,
    st: { 0: valAt(0, sid), 24: valAt(24, sid), 48: valAt(48, sid) }, mo: { 0: m(0).v, 24: m(24).v, 48: m(48).v, 72: m(72).v }, hsd: hsdAt(sid) };
  pairs.push(p);
}
const q = (a, x) => { if (!a.length) return null; const s = [...a].sort((u, v) => u - v), i = (s.length - 1) * x, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const pearson = (xs, ys) => { const n = xs.length; if (n < 3) return null; const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; } return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null; };
/** statistics of (model, station) items; `ratioMin` = smallest station value that enters the ratio */
function stats(items, ratioMin) {
  const xs = items.map((i) => i.s), ys = items.map((i) => i.m);
  const ratio = items.filter((i) => i.s >= ratioMin && i.s > 0).map((i) => i.m / i.s);
  return { n: items.length, stations: new Set(items.map((i) => i.sid)).size, station: r1(q(xs, 0.5)), model: r1(q(ys, 0.5)), bias: r1(items.reduce((a, i) => a + i.m - i.s, 0) / (items.length || NaN)), mae: r1(items.reduce((a, i) => a + Math.abs(i.m - i.s), 0) / (items.length || NaN)), ratio: r1(q(ratio, 0.5)), ratioN: ratio.length, r: r1(pearson(xs, ys)) };
}
const groups = (items, ratioMin) => {
  const out = { all: stats(items, ratioMin) };
  for (const [name, key] of [['country', 'country'], ['band', 'band'], ['net', 'net'], ['cls', 'cls']]) {
    out[name] = {};
    for (const v of [...new Set(items.map((i) => i[key]))].sort()) out[name][v] = stats(items.filter((i) => i[key] === v), ratioMin);
  }
  return out;
};
// M-7a level
const lvl = pairs.filter((p) => p.st[0] != null).map((p) => ({ ...p, s: Math.max(0, p.st[0]), m: p.mo[0] }));
// M-7b change from the slots (24 h, 48 h)
const chg = (k) => pairs.filter((p) => p.st[0] != null && p.st[k] != null).map((p) => ({ ...p, s: p.st[0] - p.st[k], m: p.mo[0] - p.mo[k] }));
const c24 = chg(24), c48 = chg(48);
// Tirol HSD as delivered
const hsdItems = (k) => pairs.filter((p) => p.hsd && Number.isFinite(p.hsd[`h${k}`])).map((p) => ({ ...p, s: p.hsd[`h${k}`], m: p.mo[0] - p.mo[k] }));
const ev = c24.filter((i) => i.s >= EVENT_CM), calm = c24.filter((i) => Math.abs(i.s) < CALM_CM);
const hit = ev.length ? ev.filter((i) => i.m >= HIT_CM).length / ev.length : null;
const falseAlarm = calm.length ? calm.filter((i) => i.m >= FALSE_CM).length / calm.length : null;
// claims
const B1v = stats(lvl, LEVEL_MIN_CM).ratio;
const B1 = B1v == null ? 'zu wenig' : B1v >= 1.5 && B1v <= 3 ? 'bestätigt' : 'widerlegt';
const Fbar = ev.length ? ev.reduce((a, i) => a + i.F, 0) / ev.length : null;
const B2v = ev.length ? q(ev.map((i) => i.m / i.s), 0.5) : null;
const B2 = ev.length < MIN_N ? 'zu wenig' : B2v >= 0.67 * Fbar && B2v <= 1.5 * Fbar ? 'Faktor' : B2v >= 0.67 && B2v <= 1.5 ? 'eins zu eins' : 'keins von beiden';
const B3 = ev.length < MIN_N ? 'zu wenig' : hit >= 0.8 ? 'ja' : 'nein';
const B4v = calm.length ? calm.reduce((a, i) => a + i.m - i.s, 0) / calm.length : null;
const B4 = calm.length < MIN_N ? 'zu wenig' : B4v >= -1 && B4v <= 1 ? 'stimmt' : 'weicht ab';

// --- M-8 leave-one-station-out ------------------------------------------------------------------------------------------------------------------
const km = (a, b, c, d) => { const R = 6371, x = ((c - a) * Math.PI) / 180, y = ((d - b) * Math.PI) / 180; const s = Math.sin(x / 2) ** 2 + Math.cos((a * Math.PI) / 180) * Math.cos((c * Math.PI) / 180) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
function loso(items, valueOf) {
  const bySt = new Map();
  for (const i of items) { if (!bySt.has(i.sid)) bySt.set(i.sid, { sid: i.sid, lat: i.lat, lon: i.lon, country: i.country, v: [] }); const v = valueOf(i); if (Number.isFinite(v)) bySt.get(i.sid).v.push(v); }
  const st = [...bySt.values()].filter((s) => s.v.length).map((s) => ({ ...s, d: q(s.v, 0.5) }));
  const out = { stations: st.length, d: { p10: r1(q(st.map((s) => s.d), 0.1)), median: r1(q(st.map((s) => s.d), 0.5)), p90: r1(q(st.map((s) => s.d), 0.9)) } };
  const none = st.reduce((a, s) => a + Math.abs(s.d), 0) / (st.length || NaN);
  out.noCorrection = r1(none);
  const med = st.map((s) => Math.abs(s.d - q(st.filter((o) => o.sid !== s.sid).map((o) => o.d), 0.5)));
  out.globalMedian = { mae: r1(med.reduce((a, b) => a + b, 0) / (med.length || NaN)) };
  const cm = st.filter((s) => st.some((o) => o.sid !== s.sid && o.country === s.country)).map((s) => Math.abs(s.d - q(st.filter((o) => o.sid !== s.sid && o.country === s.country).map((o) => o.d), 0.5)));
  out.countryMedian = { n: cm.length, mae: r1(cm.reduce((a, b) => a + b, 0) / (cm.length || NaN)) };
  for (const R of RADII) {
    const e = [], base = [];
    for (const s of st) {
      let w = 0, sum = 0;
      for (const o of st) { if (o.sid === s.sid) continue; const d = km(s.lat, s.lon, o.lat, o.lon); if (d > R) continue; const ww = 1 / Math.max(d, 1); w += ww; sum += ww * o.d; }
      if (!w) continue;
      e.push(Math.abs(sum / w - s.d)); base.push(Math.abs(s.d));
    }
    const mae = e.reduce((a, b) => a + b, 0) / (e.length || NaN), b = base.reduce((a, x) => a + x, 0) / (base.length || NaN);
    out[`R${R}`] = { n: e.length, mae: r1(mae), noCorrection: r1(b), gain: r1(1 - mae / b) };
  }
  return out;
}
const losoLevel = loso(lvl, (i) => i.m - i.s);
const losoChange = loso(ev, (i) => Math.log(Math.max(i.m, 0.1) / i.s));
const B5 = losoLevel.R30.n >= 30 && losoLevel.R30.gain > 0.2 ? 'trägt' : 'trägt nicht';
const B5c = losoChange.R30.n >= 30 && losoChange.R30.gain > 0.2 ? 'trägt' : 'trägt nicht';

// --- M-9 satellite rule on the snowpack ---------------------------------------------------------------------------------------------------------
const liveIndex = J(join(LIVE, 'index.json'));
const satRows = new Map();
for (const [year, regions] of Object.entries(liveIndex.sat?.seasons ?? {}).sort()) for (const [region, st] of Object.entries(regions)) {
  const f = join(LIVE, 'season', year, region, `${st}.json`); if (!existsSync(f)) continue;
  for (const [id, rows] of Object.entries(J(f).glaciers ?? {})) if (rows.length) satRows.set(id, rows[rows.length - 1]);
}
const sat = { glaciersWithRow: 0, eligible: 0, changed: 0, set: 0, cleared: 0, medianSweDelta: [], ageDays: [] };
const last = 72;
for (const g of cat) {
  const t = traj[g.id]; if (!t) continue;
  const sr = satRows.get(g.id); if (!sr) continue;
  sat.glaciersWithRow++;
  if (!(g.area?.km2 != null && glacierSatClass(g))) continue;
  const ageDays = (T_MS - Date.parse(`${sr[0]}T12:00:00Z`)) / 86_400_000;
  sat.ageDays.push(ageDays);
  if (!(ageDays >= 0 && ageDays <= MELT_SAT_MAX_AGE_DAYS)) continue;
  sat.eligible++;
  const bands = bandsOf(hypOf(g.region)[g.id]), zl = t.z, w = (l) => t.swe[l][last];
  const sweAt = (z) => (z <= zl[0] ? w(0) : z >= zl[2] ? w(2) : z <= zl[1] ? w(0) + ((w(1) - w(0)) * (z - zl[0])) / Math.max(1, zl[1] - zl[0]) : w(1) + ((w(2) - w(1)) * (z - zl[1])) / Math.max(1, zl[2] - zl[1]));
  const st = { swe: Float64Array.from(bands.zb, sweAt), aS: new Float64Array(bands.zb.length) };
  const before = Float64Array.from(st.swe);
  const n = nudgeState(st, bands, sr);
  if (!n) continue;
  sat.changed++;
  let up = false, down = false;
  for (let b = 0; b < before.length; b++) { if (st.swe[b] > before[b]) up = true; if (st.swe[b] < before[b]) down = true; }
  if (up) sat.set++; if (down) sat.cleared++;
  const bm = bands.zb.reduce((bi, z, i) => (Math.abs(z - g.z[1]) < Math.abs(bands.zb[bi] - g.z[1]) ? i : bi), 0);
  sat.medianSweDelta.push(st.swe[bm] - before[bm]);
}
const satOut = { ...sat, nudgeMm: MELT_SNOW_NUDGE_MM, maxAgeDays: MELT_SAT_MAX_AGE_DAYS, ageDays: { p10: r1(q(sat.ageDays, 0.1)), median: r1(q(sat.ageDays, 0.5)), p90: r1(q(sat.ageDays, 0.9)) }, medianSweDelta: { n: sat.medianSweDelta.length, p10: r1(q(sat.medianSweDelta, 0.1)), median: r1(q(sat.medianSweDelta, 0.5)), p90: r1(q(sat.medianSweDelta, 0.9)) } };

// --- M-6 inventory --------------------------------------------------------------------------------------------------------------------------------
const glWithSnow = Object.entries(map.ext.glaciers).filter(([, r]) => r.snow);
const inv = { glaciers: Object.keys(traj).length, withSnowStation: glWithSnow.length, withDsnow: Object.values(map.ext.glaciers).filter((r) => r.dsnow).length, pairsUsable: pairs.length,
  byCountry: {}, byNet: {}, cls: {}, dz: { p10: r1(q(pairs.map((p) => p.dz), 0.1)), median: r1(q(pairs.map((p) => p.dz), 0.5)), p90: r1(q(pairs.map((p) => p.dz), 0.9)) }, km: { median: r1(q(pairs.map((p) => p.km), 0.5)), p90: r1(q(pairs.map((p) => p.km), 0.9)) },
  stationValueAtT: pairs.filter((p) => p.st[0] != null).length, at24: pairs.filter((p) => p.st[24] != null).length, at48: pairs.filter((p) => p.st[48] != null).length, slotsInCopy: readdirSync(join(LIVE, 'stn', 'h')).length };
for (const p of pairs) { inv.byCountry[p.country] = (inv.byCountry[p.country] ?? 0) + 1; inv.byNet[p.net] = (inv.byNet[p.net] ?? 0) + 1; inv.cls[p.cls] = (inv.cls[p.cls] ?? 0) + 1; }
// rejected snow values in all slots of the copy (QC of the line)
const rej = {}; let slotN = 0;
for (const f of readdirSync(join(LIVE, 'stn', 'h'))) { const j = J(join(LIVE, 'stn', 'h', f)); slotN++; for (const [id, q2, why] of j.rejected ?? []) if (q2 === 'snow' || q2 === 'hsd') { const k = `${q2}:${why}`; rej[k] = (rej[k] ?? 0) + 1; } }
inv.rejectedSnow = { slots: slotN, ...rej };

const result = {
  kind: 'gm4-probe', methodHash, at: new Date().toISOString(), T: new Date(T_MS).toISOString(), validity,
  M6: inv,
  M7: { level: groups(lvl, LEVEL_MIN_CM), change24: groups(c24, EVENT_CM), change48: groups(c48, EVENT_CM), events24: groups(ev, EVENT_CM), calm24: groups(calm, 0),
    tirolHsd: { h24: groups(hsdItems(24), EVENT_CM), h48: groups(hsdItems(48), EVENT_CM), h72: groups(hsdItems(72), EVENT_CM) },
    hit: r1(hit), falseAlarm: r1(falseAlarm), events: ev.length, calm: calm.length, Fbar: r1(Fbar) },
  M8: { level: losoLevel, changeLogRatio: losoChange },
  M9: satOut,
  verdict: { B1: { value: B1v, verdict: B1 }, B2: { value: r1(B2v), Fbar: r1(Fbar), n: ev.length, verdict: B2 }, B3: { value: r1(hit), n: ev.length, verdict: B3 }, B4: { value: r1(B4v), n: calm.length, verdict: B4 }, B5: { level: B5, change: B5c } },
};
writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log(JSON.stringify({ validity, M6: { pairs: inv.pairsUsable, byCountry: inv.byCountry, byNet: inv.byNet, cls: inv.cls }, verdict: result.verdict }));
