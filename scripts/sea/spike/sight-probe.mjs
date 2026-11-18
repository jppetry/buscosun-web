#!/usr/bin/env node
/**
 * Phase SG, step 0 — measurements before any product code (`audit/seewetter-sicht-konvektion.md` §2). Measuring tool only.
 *
 *   --part=poi      POI files of the catalogue's DWD stations: visibility column, unit, fill rate, range; rows kept for `pair`
 *   --part=dmi      DMI metObs visibility at the stations of the Danish spots (last 24 h)
 *   --part=repack   `thunder` and `cape` of the newest repack run at every spot (spot position and CWAM water cell)
 *   --part=fusion   buscosun Fusion (t2m, td2m, precip, rain chance) at the POI stations, hourly from now — saved, paired later
 *   --part=pair     the diagnosis of roadVsVis.ts (humidity and precipitation parts) against the measured visibility:
 *                   (a) on the station's own measured T/Td/RR (the rule alone), (b) on the saved Fusion values (the hint as built)
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/spike/sight-probe.mjs --part=poi,dmi,repack --out=<dir>
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decodePng } from '../../lib/png.mjs';
import { quadCellIndex } from '../../../src/pointForecast/quadSampler.ts';
import { hazeVisibilityM, precipVisibilityM, diagnoseVisibilityM } from '../../../src/road/vs/roadVsVis.ts';
import { seaCellCentre, mergeSpotCatalogs } from '../../../src/sea/seaContract.ts';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const parts = new Set(String(args.part ?? 'poi,dmi,repack').split(','));
const OUT = resolve(String(args.out ?? 'audit/seewetter-sicht-konvektion/spike'));
mkdirSync(OUT, { recursive: true });
const RAW = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main';
const UA = { 'user-agent': 'buscosun-sea-probe (phase SG, one-off measurement)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (u) => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(60_000) }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };
const getBytes = async (u) => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(60_000) }); if (!r.ok) throw new Error(`${r.status} ${u}`); return Buffer.from(await r.arrayBuffer()); };
const save = (name, obj) => { writeFileSync(join(OUT, name), JSON.stringify(obj, null, 1) + '\n'); console.log(`→ ${join(OUT, name)}`); };
const load = (name) => (existsSync(join(OUT, name)) ? JSON.parse(readFileSync(join(OUT, name), 'utf8')) : null);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

const cat = await getJson(`${RAW}/sea/v1/static/spots.json`);
const dk = await getJson(`${RAW}/sea/v1/static/spots-dk.json`).catch(() => null);
const spots = mergeSpotCatalogs(cat.spots, dk?.spots ?? null);
const stations = new Map();
for (const s of spots) if (s.station) { const e = stations.get(s.station.id) ?? { ...s.station, spots: [] }; e.spots.push(s.id); stations.set(s.station.id, e); }
console.log(`Katalog: ${spots.length} Spots, ${stations.size} Stationen (${[...stations.values()].filter((s) => s.net === 'dmi').length} DMI)`);

/** POI CSV → rows with every column this phase needs (visibility km, T, Td, RH, RR1, present weather). */
export function parsePoiFull(text) {
  const rows = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const head = rows[0].split(';'), unit = rows[1].split(';');
  const ci = (n) => head.indexOf(n);
  const col = { vis: ci('horizontal_visibility'), t: ci('dry_bulb_temperature_at_2_meter_above_ground'), td: ci('dew_point_temperature_at_2_meter_above_ground'), rh: ci('relative_humidity'), rr: ci('precipitation_amount_last_hour'), ww: ci('present_weather') };
  const num = (s) => (s == null || s === '' || s === '---' ? null : Number(s.replace(',', '.')));
  const out = [];
  for (const r of rows.slice(3)) {
    const c = r.split(';');
    if (!/^\d\d\.\d\d\.\d\d$/.test(c[0] ?? '') || !/^\d\d:\d\d$/.test(c[1] ?? '')) continue;
    const t = Date.UTC(2000 + +c[0].slice(6, 8), +c[0].slice(3, 5) - 1, +c[0].slice(0, 2), +c[1].slice(0, 2), +c[1].slice(3, 5));
    const v = (k) => { const x = col[k] >= 0 ? num(c[col[k]]) : null; return x == null || !Number.isFinite(x) ? null : x; };
    out.push({ t, vis: v('vis'), tC: v('t'), tdC: v('td'), rh: v('rh'), rr: v('rr'), ww: v('ww') });
  }
  return { rows: out, units: { vis: unit[col.vis] ?? null, t: unit[col.t] ?? null, rr: unit[col.rr] ?? null }, hasCol: col.vis >= 0 };
}

if (parts.has('poi')) {
  const res = [];
  for (const st of [...stations.values()].filter((s) => s.net !== 'dmi').sort((a, b) => (a.id < b.id ? -1 : 1))) {
    try {
      const r = await fetch(`https://opendata.dwd.de/weather/weather_reports/poi/${st.id}-BEOB.csv`, { headers: UA, signal: AbortSignal.timeout(30_000) });
      if (!r.ok) { res.push({ id: st.id, name: st.name, error: `HTTP ${r.status}` }); continue; }
      const text = await r.text();
      writeFileSync(join(OUT, `poi-${st.id}.csv`), text);
      const p = parsePoiFull(text);
      const n = p.rows.length, vis = p.rows.filter((x) => x.vis != null).map((x) => x.vis);
      const hourly = p.rows.filter((x) => new Date(x.t).getUTCMinutes() === 0);
      res.push({
        id: st.id, name: st.name, spots: st.spots.length, rows: n, hourlyRows: hourly.length, unit: p.units.vis, hasCol: p.hasCol,
        fillVis: pct(vis.length, n), fillT: pct(p.rows.filter((x) => x.tC != null).length, n), fillTd: pct(p.rows.filter((x) => x.tdC != null).length, n),
        fillRr: pct(p.rows.filter((x) => x.rr != null).length, n), fillWw: pct(p.rows.filter((x) => x.ww != null).length, n),
        visMinKm: vis.length ? Math.min(...vis) : null, visMaxKm: vis.length ? Math.max(...vis) : null,
        newestAgeMin: n ? Math.round((Date.now() - p.rows[0].t) / 60000) : null, newestVisAgeMin: (() => { const x = p.rows.find((y) => y.vis != null); return x ? Math.round((Date.now() - x.t) / 60000) : null; })(),
      });
      console.log(JSON.stringify(res.at(-1)));
    } catch (e) { res.push({ id: st.id, name: st.name, error: String(e.message) }); }
  }
  save('poi-visibility.json', { at: new Date().toISOString(), stations: res });
}

if (parts.has('dmi')) {
  const res = [];
  const from = new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 19) + 'Z';
  for (const st of [...stations.values()].filter((s) => s.net === 'dmi')) {
    const row = { id: st.id, name: st.name, spots: st.spots };
    for (const par of ['visibility', 'visib_mean_last10min']) {
      await sleep(700);
      try {
        const j = await getJson(`https://opendataapi.dmi.dk/v2/metObs/collections/observation/items?stationId=${st.id}&parameterId=${par}&datetime=${from}/..&limit=300`);
        const v = (j.features ?? []).map((f) => f.properties).filter((p) => typeof p?.value === 'number');
        row[par] = { n: v.length, minM: v.length ? Math.min(...v.map((p) => p.value)) : null, maxM: v.length ? Math.max(...v.map((p) => p.value)) : null, newest: v[0]?.observed ?? null, newestAgeMin: v[0] ? Math.round((Date.now() - Date.parse(v[0].observed)) / 60000) : null };
      } catch (e) { row[par] = { error: String(e.message).slice(0, 80) }; }
    }
    res.push(row); console.log(JSON.stringify(row));
  }
  save('dmi-visibility.json', { at: new Date().toISOString(), stations: res });
}

if (parts.has('repack')) {
  const index = await getJson(`${RAW}/index.json`);
  const run = (typeof args.run === 'string' ? index.runs.find((r) => r.run === args.run) : null) ?? index.runs.find((r) => r.thunder?.steps?.length >= 13 && r.cape?.steps?.length >= 28) ?? index.runs[0];
  console.log(`Repack-Lauf ${run.run}: thunder ${run.thunder?.steps?.length ?? 0} Schritte, cape ${run.cape?.steps?.length ?? 0} Schritte`);
  const dir = join(OUT, `repack-${run.run}`);
  mkdirSync(dir, { recursive: true });
  const img = async (file) => { const f = join(dir, file); if (!existsSync(f)) writeFileSync(f, await getBytes(`${RAW}/${run.path}/${file}`)); return decodePng(readFileSync(f)); };
  const quad = (c) => [c.nw, c.ne, c.se, c.sw];
  const where = (sp) => ({ spot: { lat: sp.lat, lon: sp.lon }, cell: seaCellCentre('cwam', sp.cell.i, sp.cell.j) });
  const per = Object.fromEntries(spots.map((s) => [s.id, { thunder: { spot: [], cell: [] }, cape: { spot: [], cell: [] }, alpha0: 0 }]));
  for (const st of run.thunder.steps) {
    const p = await img(st.file);
    for (const s of spots) for (const [k, pos] of Object.entries(where(s))) {
      const idx = quadCellIndex(p.width, p.height, quad(run.grid.corners), pos.lat, pos.lon);
      const a = idx == null ? 0 : p.data[idx * p.channels + (p.channels - 1)];
      if (!a && k === 'cell') per[s.id].alpha0++;
      per[s.id].thunder[k].push(idx == null || !a ? null : Math.round((p.data[idx * p.channels] / 255) * 100));
    }
  }
  for (const st of run.cape.steps) {
    const p = await img(st.file);
    for (const s of spots) for (const [k, pos] of Object.entries(where(s))) {
      const idx = quadCellIndex(p.width, p.height, quad(run.cape.grid.corners), pos.lat, pos.lon);
      per[s.id].cape[k].push(idx == null ? null : Math.round((p.data[idx * p.channels] / 255) * 4000));
    }
  }
  const mm = (a) => { const v = a.filter((x) => x != null); return v.length ? [Math.min(...v), Math.max(...v)] : null; };
  const rows = spots.map((s) => {
    const e = per[s.id];
    const diff = (a, b) => Math.max(0, ...a.map((x, i) => (x == null || b[i] == null ? 0 : Math.abs(x - b[i]))));
    return { id: s.id, country: s.country ?? 'DE', cellKm: s.cell.km, thunderCell: mm(e.thunder.cell), thunderSpot: mm(e.thunder.spot), capeCell: mm(e.cape.cell), capeSpot: mm(e.cape.spot), maxDiffThunder: diff(e.thunder.cell, e.thunder.spot), maxDiffCape: diff(e.cape.cell, e.cape.spot), outside: e.alpha0, thunder: e.thunder.cell, cape: e.cape.cell };
  });
  const all = (k) => mm(rows.flatMap((r) => r[k] ?? []));
  const summary = { run: run.run, thunderSteps: run.thunder.steps.map((s) => s.step), capeSteps: run.cape.steps.map((s) => s.step), thunderGrid: [run.grid.width, run.grid.height], capeGrid: [run.cape.grid.width, run.cape.grid.height], spots: rows.length, thunderRange: all('thunderCell'), capeRange: all('capeCell'), outside: rows.filter((r) => r.outside).map((r) => r.id), maxDiffThunder: Math.max(...rows.map((r) => r.maxDiffThunder)), maxDiffCape: Math.max(...rows.map((r) => r.maxDiffCape)), spotsWithThunderGe: Object.fromEntries([1, 10, 20, 30, 40].map((x) => [x, rows.filter((r) => (r.thunderCell?.[1] ?? 0) >= x).length])), spotsWithCapeGe: Object.fromEntries([50, 100, 200, 400, 800].map((x) => [x, rows.filter((r) => (r.capeCell?.[1] ?? 0) >= x).length])) };
  console.log(JSON.stringify(summary));
  save(`repack-${run.run}.json`, { at: new Date().toISOString(), summary, spots: rows });
}

if (parts.has('fusion')) {
  const { installNodeShims } = await import('../../punktarchiv/lib/nodeShims.mjs');
  installNodeShims();
  const { makeIo, geoBackend } = await import('../../road/road-forecast.mjs');
  const { getPointForecastFromCube, clearCubeForecastCache } = await import('../../../src/pointForecast/cubeSource.ts');
  const { exceedance } = await import('../../../src/pointForecast/fusion/dist.ts');
  const { httpStore, memoStore } = await import('../../../src/point/client/store.ts');
  const nowMs = Date.now();
  const io = makeIo({ store: memoStore(httpStore({})), cache: geoBackend(null), nowMs });
  const out = {};
  for (const st of [...stations.values()].filter((s) => s.net !== 'dmi')) {
    try {
      clearCubeForecastCache();
      const fc = await getPointForecastFromCube({ lat: st.lat, lng: st.lon, country: 'DE', hours: 30, pointSource: 'cube', includeRadarNowcast: false }, io);
      const steps = fc.cube?.v2?.axis?.steps ?? [];
      out[st.id] = steps.map((s) => ({ t: s.validAtMs, tC: s.vars.t2m?.mean ?? null, tdC: s.vars.td2m?.mean ?? null, rr: s.vars.precip?.mean ?? null, pWet: s.vars.precip?.dist ? exceedance(s.vars.precip.dist, 0) : null, interp: s.interpolated }));
      console.log(`${st.id} ${st.name}: ${steps.length} Schritte, T ${out[st.id][0]?.tC?.toFixed(1)} Td ${out[st.id][0]?.tdC?.toFixed(1)}`);
    } catch (e) { console.log(`${st.id}: ${String(e.message).split('\n')[0]}`); }
  }
  save(`fusion-stations-${new Date(nowMs).toISOString().slice(0, 13).replace(/[-T]/g, '')}.json`, { at: new Date(nowMs).toISOString(), stations: out });
}

if (parts.has('rule')) {
  // The class rule of the product (E-SG-5, `visCodeOf`) on the stations' own measurements — the numbers the page names.
  const { visCodeOf, visClassOfCode } = await import('../../../src/sea/seaContract.ts');
  const T = { gut: [0, 0, 0, 0], eingeschraenkt: [0, 0, 0, 0], nebel: [0, 0, 0, 0] };
  const used = new Set();
  let pairs = 0;
  for (const st of [...stations.values()].filter((s) => s.net !== 'dmi')) {
    const f = join(OUT, `poi-${st.id}.csv`);
    if (!existsSync(f)) continue;
    for (const x of parsePoiFull(readFileSync(f, 'utf8')).rows) {
      if (x.vis == null || x.tC == null || x.tdC == null) continue;
      const cls = visClassOfCode(visCodeOf(hazeVisibilityM(x.tC, x.tdC), precipVisibilityM(x.tC > 1 ? (x.rr ?? 0) : 0, x.tC <= 1 ? (x.rr ?? 0) : 0)));
      if (!cls) continue;
      T[cls][x.vis >= 10 ? 0 : x.vis >= 4 ? 1 : x.vis >= 1 ? 2 : 3]++; pairs++; used.add(st.id);
    }
  }
  const row = (a) => { const n = a.reduce((s, x) => s + x, 0); return { n, measured: { ge10: a[0], km4to10: a[1], km1to4: a[2], lt1: a[3] }, above10Pct: Math.round((a[0] / n) * 100), below10Pct: Math.round(((n - a[0]) / n) * 100), below4Pct: Math.round(((a[2] + a[3]) / n) * 100) }; };
  const lt10 = T.gut[1] + T.gut[2] + T.gut[3] + T.eingeschraenkt[1] + T.eingeschraenkt[2] + T.eingeschraenkt[3] + T.nebel[1] + T.nebel[2] + T.nebel[3];
  const res = { at: new Date().toISOString(), input: 'measured T, Td, RR of the same station and hour (POI)', pairs, stations: used.size, gut: row(T.gut), eingeschraenkt: row(T.eingeschraenkt), nebel: row(T.nebel), below10Total: lt10, below10InLowerClassesPct: Math.round(((lt10 - (T.gut[1] + T.gut[2] + T.gut[3])) / lt10) * 100) };
  console.log(JSON.stringify(res, null, 1));
  save('rule-check.json', res);
}

if (parts.has('hint')) {
  // The hint AS BUILT: the product's rule on the saved buscosun Fusion values at the stations (`--fusion=<file,…>`) against the
  // visibility measured afterwards (`--poi=<dir>` with fresh POI files). `lead` = hours between the Fusion computation and the row.
  const { visCodeOf, visClassOfCode } = await import('../../../src/sea/seaContract.ts');
  const dir = resolve(String(args.poi ?? OUT));
  const T = { gut: [0, 0, 0], eingeschraenkt: [0, 0, 0], nebel: [0, 0, 0] };
  const leads = {}, spreadErr = [];
  let pairs = 0;
  for (const file of String(args.fusion ?? '').split(',').filter(Boolean)) {
    const doc = JSON.parse(readFileSync(resolve(file), 'utf8')), at0 = Math.floor(Date.parse(doc.at) / 3_600_000) * 3_600_000;
    for (const [id, steps] of Object.entries(doc.stations)) {
      const f = join(dir, `poi-${id}.csv`);
      if (!existsSync(f)) continue;
      for (const x of parsePoiFull(readFileSync(f, 'utf8')).rows) {
        const s = steps.find((y) => y.t === x.t);
        if (!s || x.vis == null || x.t < at0 || s.tC == null || s.tdC == null) continue;
        const cls = visClassOfCode(visCodeOf(hazeVisibilityM(s.tC, s.tdC), precipVisibilityM(s.tC > 1 ? (s.rr ?? 0) : 0, s.tC <= 1 ? (s.rr ?? 0) : 0)));
        if (!cls) continue;
        T[cls][x.vis >= 10 ? 0 : x.vis >= 4 ? 1 : 2]++; pairs++;
        const lead = Math.round((x.t - at0) / 3_600_000); leads[lead] = (leads[lead] ?? 0) + 1;
        if (x.tC != null && x.tdC != null) spreadErr.push((s.tC - s.tdC) - (x.tC - x.tdC));
      }
    }
  }
  spreadErr.sort((a, b) => a - b);
  const res = { at: new Date().toISOString(), input: 'buscosun Fusion t2m, td2m, precip at the station position (computed before the measurement)', pairs, leadsH: leads,
    table: { classes: ['≥ 10 km', '4–10 km', '< 4 km'], ...T }, spreadFusionMinusMeasuredK: spreadErr.length ? { median: +spreadErr[spreadErr.length >> 1].toFixed(2), p10: +spreadErr[Math.floor(0.1 * (spreadErr.length - 1))].toFixed(2), p90: +spreadErr[Math.floor(0.9 * (spreadErr.length - 1))].toFixed(2) } : null };
  console.log(JSON.stringify(res, null, 1));
  save('hint-check.json', res);
}

if (parts.has('pair')) {
  // Classes as the product draft: ≥ 10 km / 4–10 km / < 4 km (in the same order for measurement and diagnosis).
  const cls = (m) => (m == null ? null : m >= 10_000 ? 0 : m >= 4_000 ? 1 : 2);
  const table = () => [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const A = table(), B = table();
  let nA = 0, nB = 0, limA = { feuchte: 0, niederschlag: 0 }, fogMeas = 0, fogHit = 0;
  const fusionFiles = (args.fusion ? String(args.fusion).split(',') : []).map((f) => JSON.parse(readFileSync(resolve(f), 'utf8')));
  const perStation = [];
  for (const st of [...stations.values()].filter((s) => s.net !== 'dmi')) {
    const f = join(OUT, `poi-${st.id}.csv`);
    if (!existsSync(f)) continue;
    const rows = parsePoiFull(readFileSync(f, 'utf8')).rows.filter((x) => new Date(x.t).getUTCMinutes() === 0 && x.vis != null);
    let n = 0, same = 0;
    for (const x of rows) {
      const meas = cls(x.vis * 1000);
      if (x.tC != null && x.tdC != null) {
        const d = diagnoseVisibilityM({ qcMgKg: null, rain: x.tC > 1 ? (x.rr ?? 0) : 0, snow: x.tC <= 1 ? (x.rr ?? 0) : 0, tC: x.tC, tdC: x.tdC });
        if (d.vM != null) { A[meas][cls(d.vM)]++; nA++; n++; if (meas === cls(d.vM)) same++; if (cls(d.vM) === 2) limA[d.limiting]++; if (x.vis < 1) { fogMeas++; if (cls(d.vM) === 2) fogHit++; } }
      }
      for (const doc of fusionFiles) {
        const s = doc.stations?.[st.id]?.find((y) => y.t === x.t);
        if (!s || s.tC == null || s.tdC == null || x.t <= Date.parse(doc.at)) continue;
        const d = diagnoseVisibilityM({ qcMgKg: null, rain: s.tC > 1 ? (s.rr ?? 0) : 0, snow: s.tC <= 1 ? (s.rr ?? 0) : 0, tC: s.tC, tdC: s.tdC });
        if (d.vM != null) { B[meas][cls(d.vM)]++; nB++; }
      }
    }
    perStation.push({ id: st.id, name: st.name, pairs: n, sameClass: pct(same, n) });
  }
  const hit = (T) => T[0][0] + T[1][1] + T[2][2];
  const res = { at: new Date().toISOString(), classesKm: ['≥ 10', '4–10', '< 4'], ruleOnMeasured: { pairs: nA, sameClassPct: pct(hit(A), nA), table: A, lowLimiting: limA, measuredBelow1km: fogMeas, ofThoseDiagnosedBelow4km: fogHit }, hintOnFusion: { pairs: nB, sameClassPct: pct(hit(B), nB), table: B }, perStation };
  console.log(JSON.stringify(res, null, 1));
  save('pair-diagnosis.json', res);
  void hazeVisibilityM; void precipVisibilityM;
}
