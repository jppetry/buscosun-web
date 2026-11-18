#!/usr/bin/env node
/**
 * Phase WT, step 0 — measurement only (no product code): what serves a water temperature at every Seewetter spot.
 *
 *   model    DMI DKSS, EDR parameter `water-temperature`, at the spot's CWAM cell centre in every sub-model whose box
 *            holds it: grid point, km, values, horizon. No value anywhere ⇒ ring search around the cell (the nearest
 *            grid point WITH water). One extra query per sub-model compares the plain parameter with its depth levels.
 *   WSV      PEGELONLINE stations with a `WT` series: CORS, sampling, current value, how far `measurements` reach back
 *   DMI      oceanObs stations with `tw`: which delivered in the last 3 h, sampling; history: one sample hour on the
 *            15th of every month since 2000 (all stations in one request) ⇒ months with data per station and year
 *   pairs    per spot the nearest DELIVERING station of either network with its distance
 *   compare  DKSS at the station against the measurement on the common whole hours of the run
 *
 * Every answer is cached byte-exact under `--out/raw/` (keyed by a hash of the URL) — a second pass asks nothing twice.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/spike/wt-probe.mjs
 *     [--out=audit/seewetter-wassertemperatur/spike] [--history=0] [--fresh]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { seaCellCentre } from '../../../src/sea/seaContract.ts';
import { WT_STATION_MAX_KM } from '../../../src/sea/seaWaterTemp.ts';
import { wtUsableStations } from '../build-watertemp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const OUT = resolve(ROOT, String(args.out ?? 'audit/seewetter-wassertemperatur/spike'));
const RAW = join(OUT, 'raw');
mkdirSync(RAW, { recursive: true });
const DMI = 'https://opendataapi.dmi.dk';
const PO = 'https://www.pegelonline.wsv.de/webservices/rest-api/v2';
const DATA = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/sea/v1/static';
const UA = 'buscosun-sea (weather page, measurement)';
const H = 3_600_000;
const NOW = Date.now();
const PARAM = 'water-temperature';

const km = (aLat, aLon, bLat, bLon) => {
  const r = Math.PI / 180, dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const busy = [];
let asked = 0;
/** One GET, cached byte-exact. `volatile` answers (live values) are cached too — one probe run is one moment. */
async function get(url, { cache = true } = {}) {
  const key = createHash('sha256').update(url).digest('hex').slice(0, 20);
  const file = join(RAW, `${key}.bin`), metaFile = join(RAW, `${key}.json`);
  if (cache && !args.fresh && existsSync(file) && existsSync(metaFile)) {
    const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
    const buf = readFileSync(file);
    let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch { /* not JSON */ }
    return { ...meta, json, cached: true };
  }
  const t0 = Date.now();
  let r, buf;
  for (let a = 1; a <= 4; a++) {
    if (url.startsWith(DMI)) await sleep(url.includes('/forecastedr/') ? 1500 : 500);
    try {
      r = await fetch(url, { headers: { 'user-agent': UA, origin: 'https://buscosun.com', accept: 'application/json' }, signal: AbortSignal.timeout(90_000) });
      buf = Buffer.from(await r.arrayBuffer());
    } catch (e) { busy.push({ url, error: String(e.message).split('\n')[0], attempt: a }); await sleep(6000 * a); continue; }
    asked++;
    if (r.status !== 429 && r.status < 500) break;
    busy.push({ url: url.replace(DMI, ''), status: r.status, attempt: a });
    await sleep(8000 * a);
  }
  if (!r) return { status: 0, json: null };
  const meta = { url, status: r.status, cors: r.headers.get('access-control-allow-origin'), type: r.headers.get('content-type'), bytes: buf.length, ms: Date.now() - t0, at: new Date().toISOString() };
  if (r.status === 200) { writeFileSync(file, buf); writeFileSync(metaFile, JSON.stringify(meta)); }
  let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch { /* not JSON */ }
  return { ...meta, json };
}
const position = (coll, lat, lon, params = [PARAM]) =>
  `${DMI}/v1/forecastedr/collections/${coll}/position?coords=POINT(${lon}%20${lat})&crs=crs84&parameter-name=${params.join(',')}&f=CoverageJSON`;

// --- catalogues --------------------------------------------------------------------------------------
const spots = [...((await get(`${DATA}/spots.json`)).json?.spots ?? []), ...((await get(`${DATA}/spots-dk.json`)).json?.spots ?? [])];
if (spots.length < 60) throw new Error(`Katalog: nur ${spots.length} Spots`);
const colls = (await get(`${DMI}/v1/forecastedr/collections`)).json?.collections ?? [];
const DKSS = ['dkss_lb', 'dkss_idw', 'dkss_ws', 'dkss_nsbs']; // finest first
/** Grid spacing in degrees (DMI documentation: nautical miles; nsbs 3′ × 5′) — only for the ring search. */
const STEP = { dkss_lb: [0.15 / 60, 0.25 / 60], dkss_idw: [0.5 / 60, 0.8333 / 60], dkss_ws: [1 / 60, 1.6667 / 60], dkss_nsbs: [3 / 60, 5 / 60] };
const boxOf = (id) => colls.find((c) => c.id === id)?.extent?.spatial?.bbox?.[0] ?? null;
const inBox = (b, lat, lon) => b && lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
const levelsOf = (id) => Object.keys(colls.find((c) => c.id === id)?.parameter_names ?? {}).filter((k) => k.startsWith(`${PARAM}-`)).map((k) => parseInt(k.slice(PARAM.length + 1), 10)).sort((a, b) => a - b);

async function wtAt(coll, lat, lon, ref) {
  const r = await get(position(coll, +lat.toFixed(5), +lon.toFixed(5)));
  const ax = r.json?.domain?.axes, v = r.json?.ranges?.[PARAM]?.values ?? [];
  const ok = v.filter((x) => typeof x === 'number' && Number.isFinite(x));
  return {
    coll, status: r.status, bytes: r.bytes, ms: r.ms, asked: { lat: +lat.toFixed(5), lon: +lon.toFixed(5) },
    grid: ax ? { lat: +ax.y.values[0].toFixed(5), lon: +ax.x.values[0].toFixed(5), km: +km(ref.lat, ref.lon, ax.y.values[0], ax.x.values[0]).toFixed(2) } : null,
    n: v.length, values: ok.length, t0: ax?.t.values[0] ?? null, t1: ax?.t.values.at(-1) ?? null,
    min: ok.length ? +Math.min(...ok).toFixed(2) : null, max: ok.length ? +Math.max(...ok).toFixed(2) : null,
    error: r.json?.type === 'Coverage' ? null : (r.json?.message ?? r.json?.error ?? `HTTP ${r.status}`),
    series: ax && ok.length ? { t: ax.t.values, v } : null,
  };
}
/** The nearest grid point with water around `p` in `coll`: rings 1 and 2 (24 points), nearest first. `full` = water in every hour of the run. */
async function ring(coll, p, full = false) {
  const [dLat, dLon] = STEP[coll];
  // Rings out to ≈ 4 km (idw 4 steps, ws 2, the coarse North Sea grid 1) — beyond that a point is not "at the spot".
  const R = Math.max(1, Math.min(4, Math.floor(4 / km(0, 0, dLat, 0))));
  const cand = [];
  for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) if (di || dj) cand.push({ lat: p.lat + dj * dLat, lon: p.lon + di * dLon, d: km(p.lat, p.lon, p.lat + dj * dLat, p.lon + di * dLon) });
  cand.sort((a, b) => a.d - b.d);
  let best = null, tried = 0;
  for (const c of cand) {
    if (!inBox(boxOf(coll), c.lat, c.lon)) continue;
    if (best && c.d > best.grid.km + 0.7 * km(0, 0, dLat, 0)) break; // nothing nearer can follow
    tried++;
    const x = await wtAt(coll, c.lat, c.lon, p);
    if ((full ? x.values === x.n && x.n > 0 : x.values > 0) && (!best || x.grid.km < best.grid.km)) best = x;
  }
  return { best, tried };
}

// --- model per spot ----------------------------------------------------------------------------------
const rows = [];
for (const s of spots) {
  const cc = seaCellCentre('cwam', s.cell.i, s.cell.j);
  const p = { lat: cc.lat, lon: cc.lon };
  const row = { id: s.id, name: s.name, country: s.country ?? 'DE', region: s.region, lat: s.lat, lon: s.lon, cell: { lat: +p.lat.toFixed(5), lon: +p.lon.toFixed(5) }, dkss: [] };
  for (const coll of DKSS) {
    if (!inBox(boxOf(coll), p.lat, p.lon)) { row.dkss.push({ coll, inBox: false }); continue; }
    const x = await wtAt(coll, p.lat, p.lon, p);
    row.dkss.push({ inBox: true, ...x, series: undefined });
  }
  // Rule of the catalogue (E-WT-3): the NEAREST grid point with water in every hour of the run — the cell's own point in
  // every sub-model, and where the finest sub-model has no such point at the cell, its nearest one in a ring around it.
  // Equal distance (within 0.3 km) ⇒ the finer sub-model. No point with water in every hour ⇒ the one with the most hours.
  const inBoxColls = row.dkss.filter((x) => x.inBox);
  const cands = inBoxColls.filter((x) => x.values > 0).map((x) => ({ ...x }));
  const finest = inBoxColls[0] ?? null;
  row.ring = null;
  if (finest && !(finest.values === finest.n && finest.n > 0)) {
    const { best, tried } = await ring(finest.coll, p, true);
    row.ring = { coll: finest.coll, tried, found: !!best, full: true };
    if (best) cands.push({ inBox: true, ...best, series: undefined, ring: true });
    else if (!cands.length) {
      for (const coll of DKSS) {
        if (!inBox(boxOf(coll), p.lat, p.lon)) continue;
        const any = await ring(coll, p, false);
        row.ring = { coll, tried: any.tried, found: !!any.best, full: false };
        if (any.best) { cands.push({ inBox: true, ...any.best, series: undefined, ring: true }); break; }
      }
    }
  }
  const order = (x) => DKSS.indexOf(x.coll);
  const fullOnes = cands.filter((x) => x.values === x.n);
  const pick = (fullOnes.length ? fullOnes : cands).sort((a, b) => (fullOnes.length ? 0 : b.values - a.values) || (Math.abs(a.grid.km - b.grid.km) > 0.3 ? a.grid.km - b.grid.km : order(a) - order(b)))[0] ?? null;
  row.candidates = cands.map((x) => ({ coll: x.coll, km: x.grid.km, values: x.values, n: x.n, ring: !!x.ring }));
  row.pick = pick ? { coll: pick.coll, asked: pick.asked, grid: pick.grid, n: pick.n, values: pick.values, t0: pick.t0, t1: pick.t1, min: pick.min, max: pick.max, ring: !!pick.ring } : null;
  rows.push(row);
  console.log(`${s.id.padEnd(22)} ${row.dkss.filter((x) => x.inBox).map((x) => `${x.coll.slice(5)} ${x.values}/${x.n}@${x.grid?.km ?? '–'}km`).join(' · ')} ⇒ ${row.pick ? `${row.pick.coll}${row.pick.ring ? ' (Ring)' : ''} ${row.pick.grid.km} km, ${row.pick.min}…${row.pick.max} °C` : 'KEIN Wasserpunkt'}`);
}

// --- depth level of the plain parameter ----------------------------------------------------------------
const levels = [];
for (const coll of DKSS) {
  const r0 = rows.find((r) => r.pick?.coll === coll);
  if (!r0) continue;
  const lv = levelsOf(coll).slice(0, 3);
  const r = await get(position(coll, r0.pick.asked.lat, r0.pick.asked.lon, [PARAM, ...lv.map((m) => `${PARAM}-${m}m`)]));
  const R = r.json?.ranges ?? {};
  const col = (k) => (R[k]?.values ?? []);
  const base = col(PARAM);
  const cmp = lv.map((m) => { const c = col(`${PARAM}-${m}m`); const d = base.map((b, i) => (b != null && c[i] != null ? Math.abs(b - c[i]) : null)).filter((x) => x != null); return { level: `${m}m`, values: c.filter((x) => x != null).length, maxAbsDiff: d.length ? +Math.max(...d).toFixed(4) : null }; });
  levels.push({ coll, at: r0.id, allLevels: levelsOf(coll), compared: cmp });
  console.log(`Tiefe ${coll}: Ebenen ${levelsOf(coll).slice(0, 6).join(', ')} m … · ${cmp.map((c) => `${c.level}: ${c.values} Werte, |Δ| ≤ ${c.maxAbsDiff}`).join(' · ')}`);
}

// --- PEGELONLINE -------------------------------------------------------------------------------------
const poAns = await get(`${PO}/stations.json?timeseries=WT&includeTimeseries=true&includeCurrentMeasurement=true`);
const poAll = poAns.json ?? [];
const poCors = poAns.cors;
/** The moment the station list was read — a station's age is counted against it (a cached answer keeps its own time). */
const poAt = Date.parse(poAns.at ?? new Date(NOW).toISOString());
const nearSpot = (lat, lon) => spots.map((s) => ({ id: s.id, km: km(lat, lon, s.lat, s.lon) })).sort((a, b) => a.km - b.km)[0];
const po = [];
for (const x of poAll) {
  if (!(x.latitude >= 53.0 && x.latitude <= 55.3 && x.longitude >= 6.0 && x.longitude <= 14.6)) continue;
  const ts = x.timeseries.find((t) => t.shortname === 'WT');
  const ns = nearSpot(x.latitude, x.longitude);
  const row = { net: 'wsv', id: x.number, uuid: x.uuid, name: x.longname, water: x.water?.longname, agency: x.agency, lat: +x.latitude.toFixed(5), lon: +x.longitude.toFixed(5), equidistanceMin: ts.equidistance, last: ts.currentMeasurement?.timestamp ?? null, value: ts.currentMeasurement?.value ?? null, nearestSpot: ns.id, km: +ns.km.toFixed(1) };
  row.ageMin = row.last ? Math.round((poAt - Date.parse(row.last)) / 60_000) : null;
  po.push(row);
}
po.sort((a, b) => a.km - b.km);
// History depth and CORS of `measurements` at the stations within 60 km of a spot.
for (const st of po.filter((x) => x.km <= 60)) {
  const r = await get(`${PO}/stations/${st.uuid}/WT/measurements.json?start=P40D`);
  const m = Array.isArray(r.json) ? r.json : [];
  st.history = { status: r.status, cors: r.cors, n: m.length, first: m[0]?.timestamp ?? null, last: m.at(-1)?.timestamp ?? null, days: m.length ? +((Date.parse(m.at(-1).timestamp) - Date.parse(m[0].timestamp)) / 86_400_000).toFixed(1) : null, bytes: r.bytes };
  st.series = m;
  console.log(`WSV ${st.name.padEnd(28)} ${String(st.water).padEnd(10)} ${st.km} km → ${st.nearestSpot.padEnd(18)} ${st.value} °C, ${st.ageMin} min alt, ${st.equidistanceMin}-min, Historie ${st.history.days} Tage (${st.history.n})`);
}

// --- DMI oceanObs --------------------------------------------------------------------------------------
const ocSt = (await get(`${DMI}/v2/oceanObs/collections/station/items?status=Active&limit=1000`)).json?.features ?? [];
const twSt = ocSt.filter((f) => !f.properties.validTo && !f.properties.operationTo && (f.properties.parameterId ?? []).includes('tw'));
const dmi = [];
for (const f of twSt) {
  const [lon, lat] = f.geometry.coordinates;
  const ns = nearSpot(lat, lon);
  if (ns.km > 60) continue;
  const from = new Date(NOW - 3 * H).toISOString().slice(0, 19) + 'Z';
  const r = await get(`${DMI}/v2/oceanObs/collections/observation/items?stationId=${f.properties.stationId}&parameterId=tw&datetime=${from}/..&limit=100`);
  const o = r.json?.features ?? [];
  const t = o.map((x) => Date.parse(x.properties.observed)).sort((a, b) => a - b);
  const gaps = t.slice(1).map((x, i) => (x - t[i]) / 60_000);
  dmi.push({ net: 'dmi', id: f.properties.stationId, name: f.properties.name, owner: f.properties.owner, type: f.properties.type, operationFrom: f.properties.operationFrom, lat: +lat.toFixed(5), lon: +lon.toFixed(5), nearestSpot: ns.id, km: +ns.km.toFixed(1), cors: r.cors, n3h: o.length, last: o[0]?.properties?.observed ?? null, value: o[0]?.properties?.value ?? null, stepMin: gaps.length ? Math.min(...gaps) : null });
}
dmi.sort((a, b) => a.km - b.km);
for (const st of dmi) console.log(`DMI ${st.id.padEnd(8)} ${st.name.padEnd(26)} ${st.km} km → ${st.nearestSpot.padEnd(20)} ${st.n3h} Werte/3 h, ${st.value ?? '–'} °C, Takt ${st.stepMin ?? '–'} min`);

// History: one sample hour on the 15th of every month since 2000, all stations at once.
const history = {};
if (args.history !== '0') {
  for (let y = 2000; y <= new Date(NOW).getUTCFullYear(); y++) for (let mo = 1; mo <= 12; mo++) {
    const d = `${y}-${String(mo).padStart(2, '0')}-15`;
    if (Date.parse(`${d}T13:00:00Z`) > NOW) continue;
    const r = await get(`${DMI}/v2/oceanObs/collections/observation/items?parameterId=tw&datetime=${d}T12:00:00Z/${d}T13:00:00Z&limit=3000`);
    const ids = new Set((r.json?.features ?? []).map((x) => x.properties.stationId));
    for (const id of ids) ((history[id] ??= {})[y] ??= []).push(mo);
  }
  for (const st of dmi) {
    const h = history[st.id] ?? {};
    st.fullYears = Object.entries(h).filter(([, m]) => m.length === 12).map(([y]) => +y);
    st.monthsByYear = Object.fromEntries(Object.entries(h).map(([y, m]) => [y, m.length]));
    console.log(`Historie ${st.name.padEnd(26)} volle Jahre (12/12 Stichproben): ${st.fullYears.length} ${st.fullYears.length ? `(${st.fullYears[0]}–${st.fullYears.at(-1)})` : ''}`);
  }
}

// --- nearest delivering station per spot ---------------------------------------------------------------
// `nearestAny` = nearest station that delivered, of any water (shows what the water rule of the catalogue changes);
// `stations` = the nearest three the catalogue may use (`wtUsableStations`: delivered, WSV only at the sea and the tidal
// streams the spots lie at, no sluice).
const delivering = [
  ...po.filter((x) => x.ageMin != null && x.ageMin <= 180).map((x) => ({ net: 'wsv', id: x.id, name: x.name, water: x.water, lat: x.lat, lon: x.lon, value: x.value })),
  ...dmi.filter((x) => x.n3h > 0).map((x) => ({ net: 'dmi', id: x.id, name: x.name, water: null, lat: x.lat, lon: x.lon, value: x.value })),
];
const usable = wtUsableStations({ at: new Date(NOW).toISOString(), wsv: po, dmi });
for (const row of rows) {
  const near = (list) => list.map((x) => ({ ...x, km: +km(row.lat, row.lon, x.lat, x.lon).toFixed(1) })).sort((a, b) => a.km - b.km);
  row.nearestAny = near(delivering)[0] ?? null;
  row.stations = near(usable).slice(0, 3);
}

// --- model against measurement on the common hours ------------------------------------------------------
const compare = [];
const hourlyObs = async (st) => {
  if (st.net === 'wsv') {
    const m = po.find((x) => x.id === st.id)?.series ?? [];
    return new Map(m.filter((x) => Date.parse(x.timestamp) % H === 0).map((x) => [Date.parse(x.timestamp), x.value]));
  }
  const from = new Date(NOW - 14 * H).toISOString().slice(0, 19) + 'Z';
  const o = (await get(`${DMI}/v2/oceanObs/collections/observation/items?stationId=${st.id}&parameterId=tw&datetime=${from}/..&limit=300`)).json?.features ?? [];
  return new Map(o.filter((x) => Date.parse(x.properties.observed) % H === 0).map((x) => [Date.parse(x.properties.observed), x.properties.value]));
};
// Compared are the stations a spot will point to (≤ WT_STATION_MAX_KM), each against the finest sub-model that carries
// water at the station or in a ring around it (a harbour is land in the model).
const used = new Map();
for (const row of rows) { const s0 = row.stations[0]; if (s0 && s0.km <= WT_STATION_MAX_KM && !used.has(s0.key)) used.set(s0.key, s0); }
for (const st of used.values()) {
  const obs = await hourlyObs(st);
  let done = false;
  for (const coll of DKSS) {
    if (done || !inBox(boxOf(coll), st.lat, st.lon)) continue;
    let x = await wtAt(coll, st.lat, st.lon, st);
    let viaRing = false;
    if (!(x.values > 0)) { const rr = await ring(coll, st); if (!rr.best) { compare.push({ station: st.id, net: st.net, name: st.name, coll, water: false }); continue; } x = rr.best; viaRing = true; }
    done = true;
    const d = [];
    x.series.t.forEach((t, k) => { const o = obs.get(Date.parse(t)); if (o != null && x.series.v[k] != null) d.push(x.series.v[k] - o); });
    if (!d.length) { compare.push({ station: st.id, net: st.net, name: st.name, coll, water: true, hours: 0, gridKm: x.grid.km }); continue; }
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / d.length);
    compare.push({ station: st.id, net: st.net, name: st.name, coll, water: true, ring: viaRing, gridKm: x.grid.km, hours: d.length, meanK: +mean.toFixed(2), sdK: +sd.toFixed(2), maxAbsK: +Math.max(...d.map(Math.abs)).toFixed(2), run0: x.t0 });
    console.log(`Vergleich ${st.net} ${st.name.padEnd(26)} ${coll.padEnd(10)} n=${d.length} DKSS − Messung = ${mean.toFixed(2)} K (σ ${sd.toFixed(2)}, max ${Math.max(...d.map(Math.abs)).toFixed(2)}), Gitterpunkt ${x.grid.km} km${viaRing ? ' (Ring)' : ''}`);
  }
}

for (const st of po) delete st.series;
writeFileSync(join(OUT, 'wt-probe.json'), JSON.stringify({ at: new Date(NOW).toISOString(), asked, busy, param: PARAM, dkssBoxes: Object.fromEntries(DKSS.map((c) => [c, boxOf(c)])), levels, poCors, counts: { spots: spots.length, wsvAll: poAll.length, wsvBox: po.length, dmiTw: twSt.length, dmiNear: dmi.length }, rows, wsv: po, dmi, compare }, null, 1) + '\n');
console.log(`geschrieben: ${join(OUT, 'wt-probe.json')} · ${asked} Abrufe, ${busy.length} mal 429/5xx/Netz`);
