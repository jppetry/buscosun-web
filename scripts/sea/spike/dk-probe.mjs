#!/usr/bin/env node
/**
 * Phase DK, step 0 — measurement only (no product code): what every Danish spot of `spots-src.json` can be served with.
 *
 *   CWAM   nearest water cell by the catalogue's own rule (`pickSpotCell`, fixture run + dry map): km, dry share
 *   cube   spot and cell centre inside the point cube (`CUBE_DOMAIN`, lat ≤ 55.5)?
 *   BSH    nearest gauge of the live catalogue (`sea/v1/static/gauges.json`) and nearest WITH a curve
 *   DMI    DKSS collections whose box holds the spot: `/position` at the water cell → grid point, km, values, horizon;
 *          HARMONIE DINI at the cell; nearest metObs station with wind + gust that delivered in the last 3 h;
 *          nearest oceanObs station with `sealev_dvr` that delivered in the last 3 h
 *   ref    DKSS `sea-mean-deviation` against the measured `sealev_dvr` (DVR90) at DMI gauges, overlap hours of the run
 *
 * Every DMI response is stored byte-exact under `--out/raw/` (the verifier's fixtures are copies of these files).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/spike/dk-probe.mjs
 *     [--out=audit/seewetter-daenemark/spike]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeGrib2 } from '../../../src/sources/gribDecode.ts';
import { decompressBz2 } from '../../lib/bz2.mjs';
import { SEA_MODELS, seaCellCentre } from '../../../src/sea/seaContract.ts';
import { CUBE_DOMAIN } from '../../../src/point/cubeFormat.ts';
import { pickSpotCell, DRY_MAP_FIXTURE } from '../build-spots.mjs';
import { readDryMap } from '../build-dry-map.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const OUT = resolve(ROOT, String(args.out ?? 'audit/seewetter-daenemark/spike'));
const RAW = join(OUT, 'raw');
mkdirSync(RAW, { recursive: true });
const DMI = 'https://opendataapi.dmi.dk';
const UA = 'buscosun-sea (weather page, measurement)';
const H = 3_600_000;

const km = (aLat, aLon, bLat, bLon) => {
  const r = Math.PI / 180, dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const busy = [];
async function get(url, name) {
  const t0 = Date.now();
  let r, buf;
  for (let a = 1; a <= 4; a++) {
    if (url.startsWith(DMI)) await sleep(700);
    r = await fetch(url, { headers: { 'user-agent': UA, origin: 'https://buscosun.com' }, signal: AbortSignal.timeout(90_000) });
    buf = Buffer.from(await r.arrayBuffer());
    if (r.status !== 429 && r.status < 500) break;
    busy.push({ url: url.replace(DMI, ''), status: r.status, attempt: a });
    await sleep(6000 * a);
  }
  if (name) writeFileSync(join(RAW, name), buf);
  let json = null;
  try { json = JSON.parse(buf.toString('utf8')); } catch { /* not JSON */ }
  return { status: r.status, cors: r.headers.get('access-control-allow-origin'), type: r.headers.get('content-type'), bytes: buf.length, ms: Date.now() - t0, json };
}
const position = (coll, lat, lon, params) =>
  `${DMI}/v1/forecastedr/collections/${coll}/position?coords=POINT(${lon}%20${lat})&crs=crs84&parameter-name=${params.join(',')}&f=CoverageJSON`;

// --- CWAM --------------------------------------------------------------------------------------------
const gribDir = resolve(ROOT, 'scripts/lib/fixtures/sea/cwam-2026100700');
const fields = [];
for (const s of [10, 24, 34, 58]) fields.push(decodeGrib2(new Uint8Array(await decompressBz2(readFileSync(join(gribDir, `CWAM_SWH_2026100700_${String(s).padStart(3, '0')}.grib2.bz2`))))).values);
const dry = readDryMap(resolve(ROOT, DRY_MAP_FIXTURE));
const src = JSON.parse(readFileSync(resolve(ROOT, 'scripts/sea/spots-src.json'), 'utf8'));
const spots = src.spots.filter((s) => s.country === 'DK');

// --- catalogues --------------------------------------------------------------------------------------
const gauges = (await get('https://raw.githubusercontent.com/jppetry/buscosun-data/main/sea/v1/static/gauges.json', null)).json?.gauges ?? [];
const colls = (await get(`${DMI}/v1/forecastedr/collections`, 'collections.json')).json?.collections ?? [];
const BOX = '7.5,54.3,12.6,56.4';
const metSt = (await get(`${DMI}/v2/metObs/collections/station/items?bbox=${BOX}&status=Active&limit=1000`, 'metobs-stations.json')).json?.features ?? [];
const ocSt = (await get(`${DMI}/v2/oceanObs/collections/station/items?bbox=${BOX}&status=Active&limit=1000`, 'oceanobs-stations.json')).json?.features ?? [];
const current = (f) => !f.properties.validTo && !f.properties.operationTo;
const metWind = metSt.filter((f) => current(f) && ['wind_speed', 'wind_dir', 'wind_max'].every((p) => (f.properties.parameterId ?? []).includes(p)));
const ocDvr = ocSt.filter((f) => current(f) && (f.properties.parameterId ?? []).includes('sealev_dvr'));
const DKSS = ['dkss_nsbs', 'dkss_idw', 'dkss_ws', 'dkss_lb'];
const boxOf = (id) => colls.find((c) => c.id === id)?.extent?.spatial?.bbox?.[0] ?? null;
const inBox = (b, lat, lon) => b && lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];

const delivered = async (api, stationId, parameterId, tag) => {
  const from = new Date(Date.now() - 3 * H).toISOString().slice(0, 19) + 'Z';
  const r = await get(`${DMI}/v2/${api}/collections/observation/items?stationId=${stationId}&parameterId=${parameterId}&datetime=${from}/..&limit=100`, tag);
  const f = r.json?.features ?? [];
  return { status: r.status, n: f.length, last: f[0]?.properties?.observed ?? null, value: f[0]?.properties?.value ?? null };
};
const nearest = (list, lat, lon, n = 3) => list.map((f) => ({ id: f.properties.stationId, name: f.properties.name, owner: f.properties.owner, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], km: +km(lat, lon, f.geometry.coordinates[1], f.geometry.coordinates[0]).toFixed(1) })).sort((a, b) => a.km - b.km).slice(0, n);

const rows = [];
for (const s of spots) {
  const { best, nearest: near } = pickSpotCell(fields, s.lat, s.lon, dry);
  const cc = best ? seaCellCentre('cwam', best.i, best.j) : null;
  const row = { id: s.id, name: s.name, lat: s.lat, lon: s.lon };
  row.cwam = best ? { i: best.i, j: best.j, km: +best.km.toFixed(2), dry: best.dry == null ? null : +best.dry.toFixed(2), lat: +cc.lat.toFixed(5), lon: +cc.lon.toFixed(5), nearestOther: near && (near.i !== best.i || near.j !== best.j) ? { i: near.i, j: near.j, km: +near.km.toFixed(2), dry: near.dry } : null } : null;
  row.cube = { spot: s.lat <= CUBE_DOMAIN.latMax, cell: cc ? cc.lat <= CUBE_DOMAIN.latMax : null, latMax: CUBE_DOMAIN.latMax };
  const g = gauges.map((x) => ({ id: x.id, name: x.name, curve: !!x.has?.curve, km: +km(s.lat, s.lon, x.lat, x.lon).toFixed(1) })).sort((a, b) => a.km - b.km);
  row.bsh = { nearest: g[0] ?? null, nearestCurve: g.find((x) => x.curve) ?? null };
  const p = cc ?? { lat: s.lat, lon: s.lon };
  row.dkss = [];
  // The water-level point of the catalogue: the finest collection with values at the cell; none ⇒ the nearest
  // neighbouring grid point of the coarse North Sea model that carries values (Hvide Sande: the cell's point is land).
  const wlAt = async (coll, lat, lon) => {
    const r = await get(position(coll, lat, lon, ['sea-mean-deviation']), null);
    const ax = r.json?.domain?.axes, v = r.json?.ranges?.['sea-mean-deviation']?.values ?? [];
    return ax && v.length && v.every((x) => x != null && Number.isFinite(x)) ? { coll, lat: +lat.toFixed(4), lon: +lon.toFixed(4), grid: { lat: +ax.y.values[0].toFixed(5), lon: +ax.x.values[0].toFixed(5) }, km: +km(p.lat, p.lon, ax.y.values[0], ax.x.values[0]).toFixed(2), n: v.length } : null;
  };
  row.wl = null;
  for (const coll of ['dkss_lb', 'dkss_idw', 'dkss_ws', 'dkss_nsbs']) { if (inBox(boxOf(coll), p.lat, p.lon)) { row.wl = await wlAt(coll, p.lat, p.lon); if (row.wl) break; } }
  if (!row.wl) {
    const cand = [];
    for (const dj of [-1, 0, 1]) for (const di of [-1, 0, 1]) if (di || dj) { const x = await wlAt('dkss_nsbs', p.lat + dj * 0.05, p.lon + di * (5 / 60)); if (x) cand.push(x); }
    row.wl = cand.sort((a, b) => a.km - b.km)[0] ?? null;
  }
  for (const id of DKSS) {
    if (!inBox(boxOf(id), p.lat, p.lon)) { row.dkss.push({ coll: id, inBox: false }); continue; }
    const r = await get(position(id, p.lat, p.lon, ['sea-mean-deviation']), `dkss-${id}-${s.id}.json`);
    const ax = r.json?.domain?.axes, v = r.json?.ranges?.['sea-mean-deviation']?.values ?? [];
    const ok = v.filter((x) => x != null && Number.isFinite(x));
    row.dkss.push({ coll: id, inBox: true, status: r.status, cors: r.cors, bytes: r.bytes, ms: r.ms, grid: ax ? { lat: +ax.y.values[0].toFixed(5), lon: +ax.x.values[0].toFixed(5), km: +km(p.lat, p.lon, ax.y.values[0], ax.x.values[0]).toFixed(2) } : null, n: v.length, values: ok.length, t0: ax?.t.values[0] ?? null, t1: ax?.t.values.at(-1) ?? null, min: ok.length ? +Math.min(...ok).toFixed(2) : null, max: ok.length ? +Math.max(...ok).toFixed(2) : null });
  }
  {
    const r = await get(position('harmonie_dini_sf', p.lat, p.lon, ['wind-speed-10m', 'gust-wind-speed-10m', 'wind-dir-10m']), `harmonie-${s.id}.json`);
    const ax = r.json?.domain?.axes, R = r.json?.ranges ?? {};
    const cnt = (k) => (R[k]?.values ?? []).filter((x) => x != null && Number.isFinite(x)).length;
    row.harmonie = { status: r.status, cors: r.cors, bytes: r.bytes, ms: r.ms, grid: ax ? { lat: +ax.y.values[0].toFixed(5), lon: +ax.x.values[0].toFixed(5), km: +km(p.lat, p.lon, ax.y.values[0], ax.x.values[0]).toFixed(2) } : null, t0: ax?.t.values[0] ?? null, t1: ax?.t.values.at(-1) ?? null, n: ax?.t.values.length ?? 0, wind: cnt('wind-speed-10m'), gust: cnt('gust-wind-speed-10m'), dir: cnt('wind-dir-10m') };
  }
  row.metObs = [];
  for (const st of nearest(metWind, s.lat, s.lon)) {
    const w = await delivered('metObs', st.id, 'wind_speed', row.metObs.length ? null : `metobs-${st.id}-wind_speed.json`);
    const gst = await delivered('metObs', st.id, 'wind_max', row.metObs.length ? null : `metobs-${st.id}-wind_max.json`);
    row.metObs.push({ ...st, wind: w.n, gust: gst.n, last: w.last });
  }
  row.oceanObs = [];
  for (const st of nearest(ocDvr, s.lat, s.lon, 2)) {
    const w = await delivered('oceanObs', st.id, 'sealev_dvr', row.oceanObs.length ? null : `oceanobs-${st.id}-sealev_dvr.json`);
    row.oceanObs.push({ ...st, n: w.n, last: w.last, cm: w.value });
  }
  row.station = row.metObs.find((x) => x.wind > 0 && x.gust > 0) ?? null;
  rows.push(row);
  console.log(`  → Wasserstand ${row.wl ? `${row.wl.coll} @ ${row.wl.grid.lat}/${row.wl.grid.lon}, ${row.wl.km} km von der Zelle` : 'KEIN Punkt'} · Station ${row.station?.name ?? '–'} ${row.station?.km ?? ''} km`);
  const d = row.dkss.filter((x) => x.inBox).map((x) => `${x.coll.slice(5)} ${x.values}/${x.n} @${x.grid?.km ?? '–'} km`).join(' · ');
  console.log(`${s.id.padEnd(20)} CWAM ${row.cwam ? `${row.cwam.km} km trocken ${row.cwam.dry ?? '–'}` : 'KEINE Zelle'} · Cube ${row.cube.cell ? 'ja' : 'nein'} (${row.cwam?.lat ?? s.lat}) · BSH ${row.bsh.nearestCurve?.name ?? '–'} ${row.bsh.nearestCurve?.km ?? ''} km · DKSS ${d} · HARMONIE ${row.harmonie.wind}/${row.harmonie.n} · metObs ${row.metObs[0]?.name} ${row.metObs[0]?.km} km (${row.metObs[0]?.wind}/${row.metObs[0]?.gust}) · oceanObs ${row.oceanObs[0]?.name} ${row.oceanObs[0]?.km} km (${row.oceanObs[0]?.n})`);
}

// --- reference level: DKSS at the gauge against the measured sealev_dvr -----------------------------------
const ref = [];
for (const st of ocDvr.filter((f) => /Gedser|Bagenkop|Fynshav|Esbjerg Havn I|Fredericia|Slipshavn|Korsør Havn I|Rødby/.test(f.properties.name))) {
  const [lon, lat] = st.geometry.coordinates;
  const from = new Date(Date.now() - 12 * H).toISOString().slice(0, 19) + 'Z';
  const obs = (await get(`${DMI}/v2/oceanObs/collections/observation/items?stationId=${st.properties.stationId}&parameterId=sealev_dvr&datetime=${from}/..&limit=300`, null)).json?.features ?? [];
  const at = new Map(obs.map((f) => [Date.parse(f.properties.observed), f.properties.value]));
  for (const coll of DKSS) {
    if (!inBox(boxOf(coll), lat, lon)) continue;
    const r = await get(position(coll, lat, lon, ['sea-mean-deviation']), null);
    const ax = r.json?.domain?.axes, v = r.json?.ranges?.['sea-mean-deviation']?.values ?? [];
    if (!ax) continue;
    const d = [];
    ax.t.values.forEach((t, k) => { const o = at.get(Date.parse(t)); if (o != null && v[k] != null) d.push(v[k] * 100 - o); });
    if (!d.length) continue;
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / d.length);
    ref.push({ station: st.properties.stationId, name: st.properties.name, coll, gridKm: +km(lat, lon, ax.y.values[0], ax.x.values[0]).toFixed(2), hours: d.length, meanCm: +mean.toFixed(1), sdCm: +sd.toFixed(1), run0: ax.t.values[0] });
    console.log(`Bezug ${st.properties.name.padEnd(18)} ${coll.padEnd(10)} n=${d.length} DKSS − sealev_dvr = ${mean.toFixed(1)} cm (σ ${sd.toFixed(1)}), Gitterpunkt ${ref.at(-1).gridKm} km`);
  }
}
writeFileSync(join(OUT, 'dk-probe.json'), JSON.stringify({ at: new Date().toISOString(), busy, cubeLatMax: CUBE_DOMAIN.latMax, cwamGrid: SEA_MODELS.cwam.grid, stations: { metWind: metWind.length, oceanDvr: ocDvr.length }, rows, ref }, null, 1) + '\n');
console.log(`geschrieben: ${join(OUT, 'dk-probe.json')}`);
