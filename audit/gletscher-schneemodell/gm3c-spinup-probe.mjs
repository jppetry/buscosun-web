#!/usr/bin/env node
/**
 * Phase GM, GM-3c — measurement M-4 (audit §3f.1): what a spin-up of the snow core from 1 October with the INCA analysis gives, against measured snow depth
 * at stations, against SNOWGRID at the Austrian glaciers and against the melt state on the runner. A PROBE: nothing here is a producer, nothing is published.
 *
 *   node audit/gletscher-schneemodell/gm3c-spinup-probe.mjs --cache=C:/dev/buscosun-glacier-cache/gm3c-snowpack [--view=<v1 view>] [--bridge=<gm3/bridge>] [--end=2026-11-23T12:00]
 *
 * Forcing: GeoSphere Austria `inca-v2-1h-1km` (CC BY 4.0; hourly from 2026-10-01; east of 8.1° E only) — `tp` (mm in the hour ending at the stamp), `2t` (°C),
 * `ssrd` (W m⁻²). The analysis is given at the height of its 1 km cell, which the API does not name: the temperature is moved to the wanted height by the
 * median difference to a temperature that IS known there — at a station its own measurement (the hour files of the last 72 h), at a glacier the answer of
 * buscosun Fusion at the median elevation (the first hours of every weather run since 15.11., read from the cache of the bridge measurement) — and from there
 * with the standard lapse to tongue and top.
 * Mass: solid = F · P · ramp(T) (the ramp of the melt core), melt = the enhanced temperature index of the melt core with the measured radiation.
 * Core: `stepPack` with the constants of the run (`board` = 96 kg m⁻³, or `helfricht` = 68 kg m⁻³).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MELT, bandsOf } from '../../scripts/glacier/lib/meltcore.mjs';
import { SNOW, SNOW_ORIGIN, emptyPack, stepPack, packSwe, packDepthCm, newSnow } from '../../scripts/glacier/lib/snowcore.mjs';
import { snowCoreSetup, precipLevelOf } from '../../scripts/glacier/lib/snowcal.mjs';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const CACHE = arg('cache'), VIEW = arg('view', 'C:/dev/buscosun-glacier-cache/gs/view/glacier/v1'), BRIDGE = arg('bridge', 'C:/dev/buscosun-glacier-cache/gm3/bridge');
const RAW = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/glacier/v1';
const GEOSPHERE = 'https://dataset.api.hub.geosphere.at/v1';
const H = 3_600_000;
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const START = Date.parse('2026-10-01T00:00Z'), END = Date.parse(arg('end', '2026-11-23T12:00') + 'Z');
const N = Math.round((END - START) / H) + 1;
const INCA_BOX = { lon: [8.15, 17.6], lat: [45.6, 49.4] };
const inBox = (p) => p.lon >= INCA_BOX.lon[0] && p.lon <= INCA_BOX.lon[1] && p.lat >= INCA_BOX.lat[0] && p.lat <= INCA_BOX.lat[1];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quant = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const stampOf = (ms) => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 10);

async function getJson(url, file) {
  if (file && existsSync(file)) { const t = readFileSync(file, 'utf8'); return t ? JSON.parse(t) : null; }
  for (let k = 0; ; k++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'node' } });
      if (r.status === 404) { if (file) writeFileSync(file, ''); return null; }
      if (!r.ok) throw new Error(`${r.status} ${url.slice(0, 120)}`);
      const t = await r.text(); if (file) writeFileSync(file, t); return JSON.parse(t);
    } catch (e) { if (k >= 3) throw e; await sleep(3000 * (k + 1)); }
  }
}

/** INCA series of `points` ({ key, lat, lon }) on the hour grid START … END; 20 points per request. */
async function inca(points, tag) {
  const dir = join(CACHE, 'inca'); mkdirSync(dir, { recursive: true });
  const iso = (ms) => new Date(ms).toISOString().slice(0, 16);
  const out = new Map();
  for (let i = 0; i < points.length; i += 20) {
    const part = points.slice(i, i + 20);
    const j = await getJson(`${GEOSPHERE}/timeseries/historical/inca-v2-1h-1km?parameters=tp,2t,ssrd&start=${iso(START)}&end=${iso(END)}&${part.map((p) => `lat_lon=${p.lat},${p.lon}`).join('&')}&output_format=geojson`, join(dir, `${tag}-${i}.json`));
    if (!j?.features) { console.log(`INCA ${tag}-${i}: keine Antwort`); continue; }
    if (j.timestamps.length !== N) throw new Error(`INCA ${tag}-${i}: ${j.timestamps.length} Stunden statt ${N}`);
    j.features.forEach((f, k) => { const P = f.properties.parameters; out.set(part[k].key, { tp: P.tp.data, t: P['2t'].data, g: P.ssrd.data, cell: f.geometry.coordinates }); });
    if (!existsSync(join(dir, `${tag}-${i}.json.seen`))) await sleep(250);
  }
  return out;
}

/** One point through the snow core. `dT` = shift of the INCA temperature to the wanted height (K). Returns the pack and what it took. */
function runPoint({ s, dT, F, c, cal, aBare = MELT.aIce, until = N }) {
  const pack = emptyPack(); let aS = MELT.aFirnSnow; const decay = Math.exp(-1 / MELT.tauH);
  let solid = 0, melted = 0, rain = 0, gaps = 0;
  for (let i = 0; i < until; i++) {
    const T = s.t[i] == null ? NaN : s.t[i] + dT, P = s.tp[i] ?? 0, G = s.g[i] ?? 0;
    if (!Number.isFinite(T)) { gaps++; continue; }
    const fs = Math.min(1, Math.max(0, (MELT.fsWarm - T) / (MELT.fsWarm - MELT.fsCold)));
    const S = F * P * fs; rain += F * P * (1 - fs);
    aS = S > 0 ? aS + (MELT.aFresh - aS) * Math.min(1, S / 5) : MELT.aFirnSnow + (aS - MELT.aFirnSnow) * decay;
    const Ti = T <= 0 ? T : MELT.bIce * T;
    const alb = packSwe(pack) + S > MELT.sweMin ? aS : aBare;
    const m = Ti > MELT.tT ? cal.TF * Ti + cal.SRF * (1 - alb) * G : 0;
    const r = stepPack(pack, { tMs: START + i * H, solidMm: S, meltMm: m, tC: T }, c);
    solid += S; melted += r.melted;
  }
  return { pack, solid, melted, rain, gaps };
}

const cal = J('scripts/glacier/melt-calibration.json').fit;
const table = J('scripts/glacier/snow-calibration.json');
const board = snowCoreSetup({ density: 'board', base: SNOW, baseOrigin: SNOW_ORIGIN, table }).c;
const report = { kind: 'glacier/gm3c-spinup-probe', generated: new Date().toISOString(), window: { from: new Date(START).toISOString(), to: new Date(END).toISOString(), hours: N }, forcing: 'GeoSphere Austria inca-v2-1h-1km (tp, 2t, ssrd), CC BY 4.0' };
mkdirSync(join(CACHE, 'live', 'stn', 'h'), { recursive: true });

// --- A. stations ---------------------------------------------------------------------------------------------------------------------------
const cat = J(join(CACHE, 'live', 'stn', 'stations.json'));
const stnMeta = new Map([...Object.values(cat.stations), ...Object.values(cat.ext?.stations ?? {})].map((s) => [s.id, s]));
const endSlot = stampOf(END);
const hours = [];
for (let ms = END - 71 * H; ms <= END; ms += H) {
  const slot = stampOf(ms);
  const d = await getJson(`${RAW}/stn/h/${slot}.json`, join(CACHE, 'live', 'stn', 'h', `${slot}.json`));
  if (d) hours.push({ ms, e: { ...d.stations, ...(d.ext?.stations ?? {}) } });
}
const last = hours.find((h) => stampOf(h.ms) === endSlot)?.e;
if (!last) throw new Error(`Stundendatei ${endSlot} fehlt`);
const stations = [...stnMeta.values()].filter((s) => inBox(s) && Number.isFinite(last[s.id]?.v?.snow)).map((s) => ({ key: s.id, lat: s.lat, lon: s.lon, elev: s.elev, country: s.country, net: s.networks[0], hs: last[s.id].v.snow }));
console.log(`Stationen mit Schneehöhe um ${endSlot} im INCA-Gebiet: ${stations.length} (Stundendateien: ${hours.length})`);
const incaS = await inca(stations, 'stn');
const Fof = (country) => (country === 'AT' ? precipLevelOf(table, 'at-glocknergruppe').F : country === 'CH' ? precipLevelOf(table, 'ch-ost').F : country === 'DE' ? precipLevelOf(table, 'de').F : null);
const stnRows = [];
for (const st of stations) {
  const s = incaS.get(st.key); if (!s) continue;
  // shift: median of (measured t − INCA 2t) over the hours both have (the measurement of an hour file is up to 30 min after the full hour)
  const diffs = [];
  for (const h of hours) { const v = h.e[st.key]?.v?.t, i = Math.round((h.ms - START) / H); if (Number.isFinite(v) && s.t[i] != null) diffs.push(v - s.t[i]); }
  if (diffs.length < 24) continue;
  const dT = quant(diffs, 0.5), sd = Math.sqrt(diffs.reduce((a, d) => a + (d - dT) ** 2, 0) / diffs.length);
  const one = (F, c) => { const r = runPoint({ s, dT, F, c, cal }); return { hs: packDepthCm(r.pack), swe: packSwe(r.pack), solid: r.solid, melted: r.melted, gaps: r.gaps }; };
  const a = one(1, board), b = one(1, SNOW), F = Fof(st.country), cF = F ? one(F, board) : null;
  stnRows.push({ id: st.key, net: st.net, country: st.country, elev: st.elev, hs: st.hs, dT: r1(dT), dTsd: r1(sd), nT: diffs.length, f1: { hs: r1(a.hs), swe: r1(a.swe), solid: r1(a.solid), melted: r1(a.melted) }, f1h: { hs: r1(b.hs) }, fF: cF ? { F, hs: r1(cF.hs), swe: r1(cF.swe) } : null, gaps: a.gaps });
}
const stat = (rows, get) => { const x = rows.filter((r) => get(r) != null); if (!x.length) return null; const d = x.map((r) => get(r) - r.hs); const mo = x.reduce((s, r) => s + get(r), 0) / x.length, me = x.reduce((s, r) => s + r.hs, 0) / x.length; const cov = x.reduce((s, r) => s + (get(r) - mo) * (r.hs - me), 0), va = x.reduce((s, r) => s + (get(r) - mo) ** 2, 0), vb = x.reduce((s, r) => s + (r.hs - me) ** 2, 0); return { n: x.length, measured: r1(me), model: r1(mo), bias: r1(d.reduce((s, v) => s + v, 0) / d.length), mae: r1(d.reduce((s, v) => s + Math.abs(v), 0) / d.length), r: va > 0 && vb > 0 ? Math.round((cov / Math.sqrt(va * vb)) * 100) / 100 : null }; };
const classes = [['< 1 500 m', 0, 1500], ['1 500–2 000 m', 1500, 2000], ['2 000–2 500 m', 2000, 2500], ['2 500–3 000 m', 2500, 3000], ['≥ 3 000 m', 3000, 9999]];
const block = (rows) => ({ n: rows.length, cold: stat(rows, () => 0), f1: stat(rows, (r) => r.f1.hs), f1helfricht: stat(rows, (r) => r.f1h.hs), fCountry: stat(rows.filter((r) => r.fF), (r) => r.fF.hs) });
report.stations = {
  hour: endSlot, selected: stations.length, used: stnRows.length, shiftAbsMedianK: r1(quant(stnRows.map((r) => Math.abs(r.dT)), 0.5)), shiftSdMedianK: r1(quant(stnRows.map((r) => r.dTsd), 0.5)),
  all: block(stnRows), byElevation: Object.fromEntries(classes.map(([name, lo, hi]) => [name, block(stnRows.filter((r) => r.elev >= lo && r.elev < hi))])),
  byNet: Object.fromEntries([...new Set(stnRows.map((r) => r.net))].sort().map((k) => [k, block(stnRows.filter((r) => r.net === k))])),
  byCountry: Object.fromEntries([...new Set(stnRows.map((r) => r.country))].sort().map((k) => [k, block(stnRows.filter((r) => r.country === k))])),
  rows: stnRows,
};
console.log('Stationen:', JSON.stringify(report.stations.all));
for (const [k, v] of Object.entries(report.stations.byElevation)) console.log(' ', k, JSON.stringify(v));

// --- B. glaciers with own forcing east of 8.1° E ---------------------------------------------------------------------------------------------
const index = J(join(VIEW, 'index.json')), build = index.static.build;
const glaciers = J(join(VIEW, 'static', build, 'catalog.json')).glaciers;
const hyp = new Map();
const hypOf = (region) => { if (!hyp.has(region)) hyp.set(region, J(join(VIEW, 'static', build, 'hypso', `${region}.json`)).glaciers ?? {}); return hyp.get(region); };
const own = [];
for (const g of glaciers) {
  if (g.klass === 'C' || !inBox(g)) continue;
  let h; try { h = hypOf(g.region)[g.id]; } catch { h = null; }
  if (!h?.a?.some((v) => v > 0)) continue;
  const zb = bandsOf(h).zb;
  own.push({ key: g.id, lat: g.lat, lon: g.lon, country: g.country, region: g.region, z: [zb[0], g.z[1], zb[zb.length - 1]] });
}
console.log(`Gletscher mit eigenem Antrieb im INCA-Gebiet: ${own.length}`);
const incaG = await inca(own, 'gl');
// temperature of buscosun Fusion at the median elevation: of every cached weather run the hours up to the next run
const runs = [...new Set(readdirSync(BRIDGE).map((f) => /^h-(\d{10})-/.exec(f)?.[1]).filter(Boolean))].sort();
const runMs = (r) => Date.UTC(+r.slice(0, 4), +r.slice(4, 6) - 1, +r.slice(6, 8), +r.slice(8, 10));
const fusionT = new Map();
for (let k = 0; k < runs.length; k++) {
  const r0 = runMs(runs[k]), gap = Math.min(48, k + 1 < runs.length ? Math.round((runMs(runs[k + 1]) - r0) / H) : 6);
  for (const f of readdirSync(BRIDGE).filter((n) => n.startsWith(`h-${runs[k]}-`))) {
    const d = J(join(BRIDGE, f));
    for (const [id, row] of Object.entries(d?.glaciers ?? {})) { if (!row.t?.[1]) continue; if (!fusionT.has(id)) fusionT.set(id, new Map()); for (let h = 0; h < gap; h++) fusionT.get(id).set(Math.round((r0 + h * H - START) / H), row.t[1][h]); }
  }
}
const snowgrid = J(join(CACHE, 'live', 'snow', '20261122.json')).glaciers;
const meltState = J(join(CACHE, 'live', 'melt', 'state.json')).g;
const iSg = Math.round((Date.parse('2026-11-22T06:00Z') - START) / H) + 1;   // SNOWGRID day 22.11.: the state on the morning of that day (set for this comparison)
const glRows = [];
for (const g of own) {
  const s = incaG.get(g.key), ft = fusionT.get(g.key); if (!s || !ft) continue;
  const diffs = []; for (const [i, v] of ft) if (i >= 0 && i < N && s.t[i] != null && Number.isFinite(v)) diffs.push(v - s.t[i]);
  if (diffs.length < 48) continue;
  const dT0 = quant(diffs, 0.5), sd = Math.sqrt(diffs.reduce((a, d) => a + (d - dT0) ** 2, 0) / diffs.length);
  const F = precipLevelOf(table, g.region)?.F; if (!F) continue;
  const lv = g.z.map((z) => {
    const dT = dT0 + MELT.gamma * (z - g.z[1]), aBare = z < g.z[1] ? MELT.aIce : MELT.aFirn;
    const end = runPoint({ s, dT, F, c: board, cal, aBare }), sg = runPoint({ s, dT, F, c: board, cal, aBare, until: iSg }), f1 = runPoint({ s, dT, F: 1, c: board, cal, aBare, until: iSg });
    const ns = newSnow(end.pack, END, 72, board);
    return { z, hs: r1(packDepthCm(end.pack)), swe: r1(packSwe(end.pack)), solid: r1(end.solid), melted: r1(end.melted), rain: r1(end.rain), hn72: r1(ns.cm), hsSg: r1(packDepthCm(sg.pack)), sweSg: r1(packSwe(sg.pack)), hsSgF1: r1(packDepthCm(f1.pack)), sweSgF1: r1(packSwe(f1.pack)) };
  });
  // melt state of the runner at the same three elevations (band mids: lowest, the one nearest the median elevation, highest)
  const ms = meltState[g.key]?.[0], zb = bandsOf(hypOf(g.region)[g.key]).zb;
  const near = zb.reduce((b, z, i) => (Math.abs(z - g.z[1]) < Math.abs(zb[b] - g.z[1]) ? i : b), 0);
  const sgRow = snowgrid[g.key] ?? null;
  glRows.push({ id: g.key, country: g.country, region: g.region, z: g.z, F, dT: r1(dT0), dTsd: r1(sd), nT: diffs.length, lv, melt: ms && ms.length === zb.length ? [ms[0], ms[near], ms[ms.length - 1]] : null, snowgrid: sgRow ? { cm: sgRow[0], mm: sgRow[1] } : null });
}
const q3 = (a) => [r1(quant(a, 0.1)), r1(quant(a, 0.5)), r1(quant(a, 0.9))];
const names = ['Zunge', 'Median', 'Oberkante'];
const sgRows = glRows.filter((r) => r.snowgrid && r.snowgrid.cm != null);
const cmp = (rows, get, truth) => { const d = rows.map((r) => get(r) - truth(r)); return { n: rows.length, truth: r1(rows.reduce((s, r) => s + truth(r), 0) / rows.length), model: r1(rows.reduce((s, r) => s + get(r), 0) / rows.length), bias: r1(d.reduce((s, v) => s + v, 0) / d.length), mae: r1(d.reduce((s, v) => s + Math.abs(v), 0) / d.length) }; };
report.glaciers = {
  n: glRows.length, shiftSdMedianK: r1(quant(glRows.map((r) => r.dTsd), 0.5)), shiftP10P50P90K: q3(glRows.map((r) => r.dT)),
  spinup: Object.fromEntries(names.map((nm, i) => [nm, { hsCm: q3(glRows.map((r) => r.lv[i].hs)), sweMm: q3(glRows.map((r) => r.lv[i].swe)), solidMm: q3(glRows.map((r) => r.lv[i].solid)), meltedMm: q3(glRows.map((r) => r.lv[i].melted)), hn72Cm: q3(glRows.map((r) => r.lv[i].hn72)), without: glRows.filter((r) => r.lv[i].swe < 1).length }])),
  meltStateMm: Object.fromEntries(names.map((nm, i) => [nm, q3(glRows.filter((r) => r.melt).map((r) => r.melt[i]))])),
  meltStateMinusSpinupMm: Object.fromEntries(names.map((nm, i) => [nm, q3(glRows.filter((r) => r.melt).map((r) => r.melt[i] - r.lv[i].swe))])),
  snowgrid: {
    day: '20261122', n: sgRows.length,
    depthCm: { F: cmp(sgRows, (r) => r.lv[1].hsSg, (r) => r.snowgrid.cm), F1: cmp(sgRows, (r) => r.lv[1].hsSgF1, (r) => r.snowgrid.cm) },
    sweMm: { F: cmp(sgRows.filter((r) => r.snowgrid.mm != null), (r) => r.lv[1].sweSg, (r) => r.snowgrid.mm), F1: cmp(sgRows.filter((r) => r.snowgrid.mm != null), (r) => r.lv[1].sweSgF1, (r) => r.snowgrid.mm) },
  },
  byCountry: Object.fromEntries(['AT', 'CH', 'DE'].map((c) => [c, { n: glRows.filter((r) => r.country === c).length, hsMedianCm: q3(glRows.filter((r) => r.country === c).map((r) => r.lv[1].hs)), sweMedianMm: q3(glRows.filter((r) => r.country === c).map((r) => r.lv[1].swe)) }])),
  rows: glRows,
};
console.log('Gletscher:', JSON.stringify({ ...report.glaciers, rows: undefined }, null, 1));
writeFileSync(join(CACHE, 'spinup-probe.json'), JSON.stringify(report));
writeFileSync('audit/gletscher-schneemodell/gm3c-spinup-probe.json', JSON.stringify({ ...report, stations: { ...report.stations, rows: undefined }, glaciers: { ...report.glaciers, rows: undefined } }, null, 1));
