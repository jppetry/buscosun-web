#!/usr/bin/env node
/**
 * Phase BS, step 0 — measurement only (no product code): what every lake spot of `scripts/sea/lakes-src.json` can be served with.
 *
 *   outline  the draft catalogue of `build-lake-spots.mjs` (shore point, normal, water point, fetch, DWD lake warning cell)
 *   town     the hand position against the coordinate of the place's Wikipedia article (distance, and whether the place
 *            lies on the LAND side of the shore point) — a check of the hand list, nothing of it is stored in the product
 *   obs      nearest obs/v1 station per network (DWD, TAWES, SwissMetNet) that delivers wind AND gust right now:
 *            distance, elevation difference to the lake surface; `wind` = the nearest of them within OBS_MAX_KM
 *   cube     buscosun Fusion at the water point over the CDN (stage of the current release, terrain as read): cube cell
 *            (t1 grid), height the reader finds there against the lake's surface elevation, hours with wind and gust
 *   wsv      the PEGELONLINE station named per lake: which series it delivers (`W`, `WT`), newest stamps
 *   alplakes 1D metadata (lake keys), one point answer, CORS preflight, throttle headers
 *   bafu     LINDAS: lake stations with a level (one SPARQL query), update stamp
 *   gkd      the sentence of the GKD imprint about a machine-readable interface (link-only decision)
 *   links    HTTP status of the warning services the catalogue links to
 *
 * Every answer of a foreign service is stored byte-exact under `--out/raw/` (the verifier's fixtures are copies).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/spike/lake-probe.mjs
 *     [--out=audit/seewetter-binnenseen/spike] [--cache=<outline cache>] [--cube=0] [--only=<lake id>]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLakeCatalog, loadOutline, readWarnCells, distKm, LAKE_CELLS_FILE } from '../build-lake-spots.mjs';
import { cellOf, TIERS } from '../../../src/point/cubeFormat.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const OUT = resolve(ROOT, String(args.out ?? 'audit/seewetter-binnenseen/spike'));
const RAW = join(OUT, 'raw');
const UA = 'buscosun-sea (https://buscosun.com; audit/seewetter-binnenseen.md)';
/** Rules of the measurement, written before the first run (2026-11-21). */
export const OBS_MAX_KM = 25;
export const OBS_FRESH_MIN = 90;
/** A station far above or below the lake does not measure the wind at the lake (Feuerkogel above the Traunsee: +1 196 m). */
export const OBS_MAX_DELEV_M = 150;
const R = Math.PI / 180;

mkdirSync(RAW, { recursive: true });
const save = (name, buf) => { writeFileSync(join(RAW, name), buf); return name; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, { name = null, headers = {}, method = 'GET', body = undefined, timeout = 60_000 } = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { method, body, headers: { 'user-agent': UA, ...headers }, signal: AbortSignal.timeout(timeout) });
    const buf = Buffer.from(await r.arrayBuffer());
    if (name) save(name, buf);
    return { ok: r.ok, status: r.status, ms: Date.now() - t0, bytes: buf.length, buf, headers: Object.fromEntries(r.headers) };
  } catch (e) { return { ok: false, status: 0, ms: Date.now() - t0, bytes: 0, buf: Buffer.alloc(0), headers: {}, error: String(e?.message ?? e).split('\n')[0] }; }
}
const bearing = (aLat, aLon, bLat, bLon) => ((Math.atan2(Math.sin((bLon - aLon) * R) * Math.cos(bLat * R), Math.cos(aLat * R) * Math.sin(bLat * R) - Math.sin(aLat * R) * Math.cos(bLat * R) * Math.cos((bLon - aLon) * R)) / R) + 360) % 360;
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

// Wikipedia titles of the places where the article is not the spot's name.
const WIKI = {
  'genfersee-vevey-montreux': 'Vevey', 'bodensee-radolfzell': 'Radolfzell am Bodensee', 'bodensee-lindau': 'Lindau (Bodensee)', 'neusiedler-see-podersdorf': 'Podersdorf am See',
  'neusiedler-see-rust': 'Rust (Burgenland)', 'neusiedler-see-moerbisch': 'Mörbisch am See', 'neuenburgersee-neuchatel': 'Neuenburg NE', 'mueritz-waren': 'Waren (Müritz)',
  'mueritz-roebel': 'Röbel/Müritz', 'vierwaldstaettersee-kuessnacht': 'Küssnacht SZ', 'zuerichsee-rapperswil': 'Rapperswil SG', 'chiemsee-prien': 'Prien am Chiemsee',
  'chiemsee-seebruck': 'Seebruck', 'ammersee-herrsching': 'Herrsching am Ammersee', 'ammersee-diessen': 'Dießen am Ammersee', 'ammersee-stegen': 'Stegen (Inning am Ammersee)',
  'attersee-seewalchen': 'Seewalchen am Attersee', 'attersee-weissenbach': 'Weißenbach am Attersee', 'bielersee-biel': 'Biel/Bienne', 'bielersee-erlach': 'Erlach BE',
  'zugersee-zug': 'Zug (Stadt)', 'zugersee-arth': 'Arth SZ', 'kummerower-see-kummerow': 'Kummerow (am See)', 'steinhuder-meer-mardorf': 'Mardorf (Neustadt am Rübenberge)',
  'traunsee-ebensee': 'Ebensee am Traunsee', 'schaalsee-zarrentin': 'Zarrentin am Schaalsee', 'koelpinsee-klink': 'Klink', 'brienzersee-brienz': 'Brienz BE', 'thunersee-thun': 'Thun', 'zuerichsee-zuerich': 'Zürich',
};

const src = JSON.parse(readFileSync(join(ROOT, 'scripts/sea/lakes-src.json'), 'utf8'));
if (typeof args.only === 'string') { src.lakes = src.lakes.filter((l) => l.id === args.only); src.spots = src.spots.filter((s) => s.lake === args.only); }
const cacheDir = resolve(ROOT, String(args.cache ?? '.sea-cache/lakes'));
const out = { at: new Date().toISOString(), rules: { OBS_MAX_KM, OBS_FRESH_MIN, OBS_MAX_DELEV_M }, spots: {}, lakes: {}, sources: {} };

// --- outline: the draft catalogue ------------------------------------------------------------------------------
const outlines = {};
for (const l of src.lakes) outlines[l.id] = await loadOutline(l, src.spots.filter((s) => s.lake === l.id), cacheDir);
const draft = buildLakeCatalog({ src, outlines, cells: readWarnCells(resolve(ROOT, LAKE_CELLS_FILE)), probe: null });
const lakeOf = Object.fromEntries(src.lakes.map((l) => [l.id, l]));
for (const s of draft.spots) out.spots[s.id] = { lake: s.lake.id, lat: s.lat, lon: s.lon, snapM: s._how.snapM, normal: s.normal, pt: s.lake.pt, warncell: s.lake.warncell, cellHow: s._how.cell };
console.log(`Entwurf: ${draft.lakes.length} Seen, ${draft.spots.length} Spots`);

// --- town: the hand list against Wikipedia ---------------------------------------------------------------------
{
  const titleOf = (s) => WIKI[s.id] ?? s.name;
  const titles = [...new Set(draft.spots.map(titleOf))];
  const coords = {};
  for (let i = 0; i < titles.length; i += 40) {
    const r = await get(`https://de.wikipedia.org/w/api.php?action=query&prop=coordinates&redirects=1&format=json&colimit=max&titles=${encodeURIComponent(titles.slice(i, i + 40).join('|'))}`, { name: `wiki-coords-${i / 40}.json` });
    if (!r.ok) { console.log(`Wikipedia HTTP ${r.status}`); continue; }
    const j = JSON.parse(r.buf.toString('utf8'));
    const back = Object.fromEntries([...(j.query?.normalized ?? []), ...(j.query?.redirects ?? [])].map((x) => [x.to, x.from]));
    for (const p of Object.values(j.query?.pages ?? {})) {
      const c = p.coordinates?.[0];
      if (!c) continue;
      let t = p.title;
      coords[t] = c;
      while (back[t]) { t = back[t]; coords[t] = c; }
    }
    await sleep(500);
  }
  for (const s of draft.spots) {
    const c = coords[titleOf(s)];
    if (!c) { out.spots[s.id].town = { title: titleOf(s), found: false }; continue; }
    const km = distKm(s.lat, s.lon, c.lat, c.lon);
    // The place should lie behind the shore: the bearing shore → place points away from the water.
    const side = angDiff(bearing(s.lat, s.lon, c.lat, c.lon), s.normal);
    out.spots[s.id].town = { title: titleOf(s), found: true, km: +km.toFixed(2), landSide: km < 0.3 ? null : side > 60, angle: Math.round(side) };
  }
}

// --- obs/v1: nearest delivering station per network ------------------------------------------------------------
{
  const base = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/obs/v1';
  const cat = await get(`${base}/stations.json`), lat = await get(`${base}/latest.json`);
  if (!cat.ok || !lat.ok) throw new Error(`obs/v1 nicht lesbar (${cat.status}, ${lat.status})`);
  const stations = JSON.parse(cat.buf.toString('utf8')), latest = JSON.parse(lat.buf.toString('utf8'));
  const nowMs = Date.parse(latest.builtAt);
  const fresh = (e, k) => {
    const t = e?.v?.[k] != null ? e.t : e?.older?.[k]?.t;
    return t != null && nowMs - Date.parse(t) <= OBS_FRESH_MIN * 60_000;
  };
  const windy = stations.stations.filter((s) => s.vars.includes('ff') && s.vars.includes('fx')).map((s) => ({ ...s, delivers: fresh(latest.stations[s.id], 'ff') && fresh(latest.stations[s.id], 'fx') }));
  out.sources.obs = { builtAt: latest.builtAt, stations: stations.count, withWind: windy.length, delivering: windy.filter((s) => s.delivers).length };
  for (const s of draft.spots) {
    const elev = lakeOf[s.lake.id].elevM;
    const near = (list) => list.map((st) => ({ st, km: distKm(s.lat, s.lon, st.lat, st.lon) })).sort((a, b) => a.km - b.km)[0] ?? null;
    const row = (x) => (x ? { id: x.st.id, name: x.st.name, km: +x.km.toFixed(1), lat: x.st.lat, lon: x.st.lon, elevM: x.st.elev ?? null, dElevM: x.st.elev == null ? null : Math.round(x.st.elev - elev), net: x.st.networks[0] } : null);
    const byNet = {};
    for (const c of ['de', 'at', 'ch']) byNet[c] = row(near(windy.filter((st) => st.delivers && st.id.startsWith(`${c}:`))));
    const atLake = (st) => st.elev != null && Math.abs(st.elev - elev) <= OBS_MAX_DELEV_M;
    const best = row(near(windy.filter((st) => st.delivers && atLake(st))));
    const nearestAny = row(near(windy.filter((st) => st.delivers)));
    const silent = row(near(windy.filter((st) => !st.delivers)));
    out.spots[s.id].obs = byNet;
    out.spots[s.id].wind = best && best.km <= OBS_MAX_KM ? best : null;
    out.spots[s.id].obsSilentNearer = silent && best && silent.km < best.km ? silent : null;
    // A nearer station that is left out because it stands far above or below the lake.
    out.spots[s.id].obsOffLevel = nearestAny && (!best || nearestAny.id !== best.id) ? nearestAny : null;
  }
}

// --- cube: buscosun Fusion at the water point --------------------------------------------------------------------
if (args.cube !== '0') {
  const { installNodeShims } = await import('../../punktarchiv/lib/nodeShims.mjs');
  installNodeShims();
  const { httpStore, memoStore } = await import('../../../src/point/client/store.ts');
  const { getPointForecastFromCube, clearCubeForecastCache } = await import('../../../src/pointForecast/cubeSource.ts');
  const { makeIo, geoBackend } = await import('../../road/road-forecast.mjs');
  const { fusionVersionOfNotes } = await import('../../../src/pointForecast/fusion/fusionRelease.ts');
  const nowMs = Date.now();
  const io = makeIo({ store: memoStore(httpStore({})), cache: geoBackend(null), nowMs });
  const t1 = TIERS[0] ?? null;
  for (const s of draft.spots) {
    const p = s.lake.pt, elev = lakeOf[s.lake.id].elevM;
    clearCubeForecastCache();
    const t0 = Date.now();
    try {
      const fc = await getPointForecastFromCube({ lat: p.lat, lng: p.lon, country: s.lake.land, hours: 79, pointSource: 'cube', includeRadarNowcast: false }, io);
      const steps = fc.cube?.v2?.axis?.steps ?? [];
      const n = (k) => steps.filter((x) => Number.isFinite(x.vars?.[k]?.mean)).length;
      const st = fc.cube?.v2?.provenance?.runs?.stations ?? null;
      const h = fc.cube?.v2?.point?.hTrue ?? null;
      out.spots[s.id].cube = {
        cell: t1 ? cellOf(t1, p.lat, p.lon) : null, hRead: h == null ? null : Math.round(h), lakeElevM: elev, dH: h == null ? null : Math.round(h - elev),
        steps: steps.length, wind: n('wind'), gust: n('gust'), dir: n('windDir'), stage: fusionVersionOfNotes(fc.cube.notes),
        windKn0: steps.length && Number.isFinite(steps[0].vars?.wind?.mean) ? +(steps[0].vars.wind.mean * 1.943844).toFixed(1) : null,
        mosmix: st?.id != null ? { id: String(st.id), km: st.distKm == null ? null : +st.distKm.toFixed(1) } : null, ms: Date.now() - t0, errors: fc.cube.errors.length,
      };
    } catch (e) { out.spots[s.id].cube = { error: String(e?.message ?? e).split('\n')[0] }; }
    console.log(`cube ${s.id}: ${JSON.stringify(out.spots[s.id].cube)}`);
  }
}

// --- WSV PEGELONLINE ---------------------------------------------------------------------------------------------
for (const l of src.lakes) {
  out.lakes[l.id] = { wsv: null, bafu: [], alp: null };
  if (!l.wsv) continue;
  const r = await get(`https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations/${l.wsv.uuid}.json?includeTimeseries=true&includeCurrentMeasurement=true`, { name: `wsv-${l.id}.json` });
  if (!r.ok) { out.lakes[l.id].wsvError = `HTTP ${r.status}`; continue; }
  const j = JSON.parse(r.buf.toString('utf8'));
  out.lakes[l.id].wsv = {
    uuid: j.uuid, name: j.longname, water: j.water?.longname ?? null, lat: j.latitude, lon: j.longitude, series: j.timeseries.map((t) => t.shortname),
    newest: Object.fromEntries(j.timeseries.map((t) => [t.shortname, t.currentMeasurement?.timestamp ?? null])), gaugeZero: j.timeseries.find((t) => t.shortname === 'W')?.gaugeZero ?? null, cors: r.headers['access-control-allow-origin'] ?? null,
  };
  await sleep(400);
}

// --- Alplakes (Eawag) --------------------------------------------------------------------------------------------
{
  const base = 'https://alplakes-api.eawag.ch';
  const meta = await get(`${base}/simulations/1d/metadata`, { name: 'alplakes-1d-metadata.json' });
  const a = { status: meta.status, rate: Object.fromEntries(Object.entries(meta.headers).filter(([k]) => /ratelimit|retry-after/i.test(k))) };
  if (meta.ok) {
    const lakes = JSON.parse(meta.buf.toString('utf8')).flatMap((m) => (m.model === 'simstrat' ? m.lakes : []));
    a.lakes = lakes.length;
    const keys = new Map(lakes.map((x) => [x.name, x]));
    for (const l of src.lakes) {
      const want = [...new Set([l.alp, ...src.spots.filter((s) => s.lake === l.id).map((s) => s.alp)].filter(Boolean))];
      out.lakes[l.id].alp = want.map((k) => ({ key: k, found: keys.has(k), end: keys.get(k)?.end_date ?? null, minDepth: keys.get(k)?.depth?.[0] ?? null }));
    }
    await sleep(1500);
    const day = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
    const one = await get(`${base}/simulations/1d/point/simstrat/murten/${day(Date.now() - 86_400_000)}0000/${day(Date.now() + 3 * 86_400_000)}0000/1?variables=T`, { name: 'alplakes-1d-point-murten.json' });
    a.point = { status: one.status, bytes: one.bytes, ms: one.ms, keys: one.ok ? Object.keys(JSON.parse(one.buf.toString('utf8'))) : null };
    await sleep(1500);
    const pre = await get(`${base}/simulations/1d/metadata`, { method: 'OPTIONS', headers: { origin: 'https://buscosun.com', 'access-control-request-method': 'GET' }, name: 'alplakes-preflight.txt' });
    a.cors = { status: pre.status, allowOrigin: pre.headers['access-control-allow-origin'] ?? null, body: pre.buf.toString('utf8').slice(0, 80) };
    const docs = await get(`${base}/openapi.json`, { name: 'alplakes-openapi.json' });
    a.licence = docs.ok ? (/licensed under \[?(CC BY [0-9.]+)/.exec(docs.buf.toString('utf8'))?.[1] ?? null) : null;
    a.userAgentAsked = docs.ok ? /descriptive User-Agent including an app name and contact/.test(docs.buf.toString('utf8')) : null;
    a.throttleDocumented = docs.ok ? /429\*\* response/.test(docs.buf.toString('utf8')) : null;
    a.attribution = docs.ok ? (/Suggested attribution: \\?"?'?([^'"\\]+)/.exec(docs.buf.toString('utf8'))?.[1] ?? null) : null;
  }
  out.sources.alplakes = a;
}

// --- BAFU via LINDAS -----------------------------------------------------------------------------------------------
{
  const q = `PREFIX schema: <http://schema.org/>
PREFIX dim: <https://environment.ld.admin.ch/foen/hydro/dimension/>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX cube: <https://cube.link/>
SELECT ?id ?name ?lake ?wkt ?time ?level ?temp
FROM <https://lindas.admin.ch/foen/hydro>
WHERE {
  <https://environment.ld.admin.ch/foen/hydro/lake/observation/> cube:observation ?obs .
  ?obs dim:station ?st ; dim:measurementTime ?time .
  OPTIONAL { ?obs dim:waterLevel ?level }
  OPTIONAL { ?obs dim:waterTemperature ?temp }
  ?st schema:identifier ?id ; schema:name ?name .
  OPTIONAL { ?st schema:containedInPlace/schema:name ?lake }
  OPTIONAL { ?st geo:hasGeometry/geo:asWKT ?wkt }
}
ORDER BY ?lake ?name`;
  const r = await get('https://lindas.admin.ch/query', { method: 'POST', body: new URLSearchParams({ query: q }).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/sparql-results+json', origin: 'https://buscosun.com' }, name: 'lindas-lake-stations.json' });
  const b = { status: r.status, bytes: r.bytes, cors: r.headers['access-control-allow-origin'] ?? null };
  if (r.ok) {
    const rows = JSON.parse(r.buf.toString('utf8')).results.bindings.map((x) => {
      const m = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(x.wkt?.value ?? '');
      return { id: x.id.value, name: x.name.value, lake: x.lake?.value ?? null, lon: m ? +m[1] : null, lat: m ? +m[2] : null, time: x.time.value, level: x.level ? +x.level.value : null, temp: x.temp ? +x.temp.value : null };
    });
    b.stations = rows.length; b.withLevel = rows.filter((x) => x.level != null).length; b.withTemp = rows.filter((x) => x.temp != null).length;
    b.newest = rows.map((x) => x.time).sort().pop();
    for (const l of src.lakes) out.lakes[l.id].bafu = rows.filter((x) => (l.bafu ?? []).includes(x.lake) && x.level != null && x.lat != null).map(({ id, name, lake, lat, lon, level, time }) => ({ id, name, lake, lat, lon, level, time }));
  }
  out.sources.bafu = b;
}

// --- GKD Bayern: the sentence that decides "link only" ---------------------------------------------------------------
{
  const r = await get('https://www.gkd.bayern.de/de/impressum', { name: 'gkd-impressum.html' });
  const t = r.buf.toString('utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  out.sources.gkd = { status: r.status, noApi: /keine Public-API[^.]*\./.exec(t)?.[0] ?? null, licence: /Namensnennung 4\.0 International \(CC BY 4\.0\)/.test(t) ? 'CC BY 4.0' : null };
}

// --- links of the responsible services -----------------------------------------------------------------------------
{
  out.sources.links = {};
  for (const url of [...new Set(Object.values(src.services).flat().map((s) => s.url))]) {
    const r = await get(url, { headers: { accept: 'text/html' } });
    out.sources.links[url] = { status: r.status, bytes: r.bytes, ...(r.error ? { error: r.error } : {}) };
    await sleep(300);
  }
}

writeFileSync(join(OUT, 'lake-probe.json'), JSON.stringify(out, null, 1) + '\n');
// Console summary.
const flag = Object.entries(out.spots).filter(([, s]) => s.town && (!s.town.found || s.town.km > 3 || s.town.landSide === false));
console.log(`\nLage-Gegenprobe: ${flag.length} Spots auffällig${flag.length ? ': ' + flag.map(([id, s]) => `${id} (${s.town.found ? `${s.town.km} km, Winkel ${s.town.angle}°` : 'kein Artikel'})`).join(', ') : ''}`);
console.log(`Wind: ${Object.values(out.spots).filter((s) => s.wind).length}/${Object.keys(out.spots).length} Spots mit liefernder Station ≤ ${OBS_MAX_KM} km`);
console.log(JSON.stringify(out.sources, null, 1));
console.log(`geschrieben: ${join(OUT, 'lake-probe.json')}`);
