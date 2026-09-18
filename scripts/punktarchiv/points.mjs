/**
 * points.mjs — the archive's point list: stations in DE/AT/CH with an open measurement
 * truth, inside the cube box, with a finite terrain height, unique by id and position.
 *
 * Source of the list: the MOSMIX station catalog the cube publishes
 * (`point/stations/catalog.json`, coordinates from the KML — NOT from
 * `mosmix_stationskatalog.cfg`, whose lat/lon are degrees + decimal minutes, §44). Every
 * point is a catalog station, so it has, by construction, a MOSMIX-L forecast in the cube's
 * station product — and an hourly measurement from one of three truths:
 *
 *   DE          DWD POI (catalog ∩ POI ∩ WMO 10000–10999) — PA1, unchanged.
 *   AT / CH/LI  PA2 (audit/fusion-implementierung.md §9.3): the catalog station co-located
 *               with a TAWES (GeoSphere) resp. SwissMetNet station — no POI requirement.
 *               Id = catalog id (the station product hangs on it), position and height =
 *               the measurement site (the catalog carries two decimals, ≈ 0.7 km, sometimes
 *               an older reference point; at a summit that is hundreds of metres of terrain).
 *   neighbours  CZ/SK/DK/NL/BE/LU catalog stations with POI that PA1 took in via the WMO
 *               BLOCK (block 11 is AT+CZ+SK, block 06 is DK…CH+LI). Kept (two slots carry
 *               them), labelled with their real country, `profile` = the country profile the
 *               live path has used for them (AT resp. CH), so their live series does not break.
 *
 * ⚠ The catalog covers the CUBE box (45,5–55,5 °N / 5,5–17,5 °E), not DACH: its first
 * entry is Falsterbo (Sweden). WMO ranges, not blocks, make this a country list.
 *
 * The list is materialised as `scripts/punktarchiv/points.json` (with a stamp and the
 * counts) so the verifier can check it without the network, and the collector reads the
 * same file — one list, not two.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/punktarchiv/points.mjs [--out=<file>] [--catalog=<url|file>] [--self-test]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { TIERS } from '../../src/point/cubeFormat.ts';
import { POINT_CDN_BASE } from '../../src/point/client/store.ts';
import { STATION_CATALOG_PATH } from '../../src/point/cubeFormat.ts';
import { distanceKm } from '../../src/point/client/cubePoint.ts';
import {
  parsePoiListing, parsePoi, parseSmnStations, parseTawesStations, parseSmnNowRows, POI_DIR_URL, POI_URL, SMN_META_URL, TAWES_META_URL, TAWES_HISTORY_URL, SMN_NOW_URL,
} from './lib/truth.mjs';
import { decodePng } from '../lib/png.mjs';

export const POINTS_FILE = new URL('./points.json', import.meta.url);
const TERRARIUM = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

/**
 * WMO index ranges → country (WMO Publication No. 9, Vol. A). PA1 used whole blocks
 * (10 DE, 11 AT, 06 CH) and thereby labelled Prague "AT" and Leeuwarden "CH" (§9.3.1 (1)).
 */
export const WMO_RANGES = Object.freeze([
  [6000, 6199, 'DK'], [6200, 6399, 'NL'], [6400, 6499, 'BE'], [6500, 6599, 'LU'],
  [6600, 6799, 'CH'], [6990, 6999, 'LI'],
  [10000, 10999, 'DE'],
  [11000, 11399, 'AT'], [11400, 11799, 'CZ'], [11800, 11999, 'SK'],
]);
export const DACH = Object.freeze(['DE', 'AT', 'CH', 'LI']);
/**
 * Country profile the live path (`getPointForecast({ country })`) is called with. CZ/SK keep
 * PA1's block profile AT (AROME and INCA reach into Bohemia); DK/NL/BE/LU run under DE since
 * E-F-11 (Jan, 2026-09-17): ICON-D2 and MOSMIX cover them, AROME does not — until PA3 they ran
 * under CH (WMO block 06), a series break named in every slot (`PROFILE_WHY`).
 */
export const PROFILE_OF = Object.freeze({ DE: 'DE', AT: 'AT', CH: 'CH', LI: 'CH', CZ: 'AT', SK: 'AT', DK: 'DE', NL: 'DE', BE: 'DE', LU: 'DE' });
/** Written into every slot (PA3), because read cold the neighbours' profile looks like a default fallback. */
export const PROFILE_WHY = 'Der Live-Pfad kennt nur die drei DACH-Profile. CZ/SK tragen AT (PA1, WMO-Block 11; AROME/INCA reichen nach Boehmen), LI traegt CH. DK/NL/BE/LU tragen seit E-F-11 (Jan, 17.09.2026) DE — ICON-D2 und MOSMIX decken sie, AROME nicht; die Slots vom 14.–16.09. rechneten sie unter CH (WMO-Block 06): Reihenbruch am 17.09., im Bewerter nach codeHash trennen.';
/** Which measurement network carries the truth where POI is not required. */
export const NETWORK_OF = Object.freeze({ AT: 'tawes', CH: 'smn', LI: 'smn' });

/**
 * Co-location of a catalog station with a network station — measured 2026-09-16 on the live
 * catalog (171 pairs of equal id, §9.3.1 (4)), not assumed:
 *   idMaxKm  equal id: guard against id reuse only (max. measured 4,56 km, Zell am See)
 *   maxKm    different id: 95 % of the position error of IDENTICAL stations is ≤ 2 km
 *   maxDzM   both: identical pairs ≤ 42 m, the first non-identical ones at 60/65/112 m
 */
export const COLOCATE = Object.freeze({ idMaxKm: 5, maxKm: 2, maxDzM: 50 });

export function countryOfWmo(id) {
  if (!/^\d{5}$/.test(String(id))) return null;
  const n = Number(id);
  for (const [a, b, c] of WMO_RANGES) if (n >= a && n <= b) return c;
  return null;
}

export function inCubeBox(lat, lon) {
  const t = TIERS[0];
  return lat >= t.lat0 && lat <= t.lat0 + (t.ny - 1) * t.deg && lon >= t.lon0 && lon <= t.lon0 + (t.nx - 1) * t.deg;
}

/**
 * Pure: pair catalog stations with network stations (TAWES/SMN). Equal-id pairs first, then
 * the rest by distance; every network station and every catalog station at most once.
 * Catalog stations of DE and of the neighbour countries never take part (DE stays PA1).
 * @returns {{ byCatalogId: Map<string, { net, station, distanceKm, dzM, match }>, rejected: { tooFar: number, dz: number } }}
 */
export function matchNetworks(catalogStations, networkStations, colocate = COLOCATE) {
  const pairs = [];
  const rejected = { tooFar: 0, dz: 0 };
  const eligible = catalogStations.filter((c) => { const k = countryOfWmo(c.id); return k == null || NETWORK_OF[k]; });
  for (const n of networkStations) {
    // Cheap box before the haversine: 5 km ≈ 0.045° lat, ≤ 0.07° lon at 45 °N.
    for (const c of eligible) {
      const idEq = n.wmo != null && n.wmo === c.id;
      if (!idEq && (Math.abs(c.lat - n.lat) > 0.06 || Math.abs(c.lon - n.lon) > 0.09)) continue;
      const d = distanceKm(c.lat, c.lon, n.lat, n.lon);
      if (d > (idEq ? colocate.idMaxKm : colocate.maxKm)) { if (idEq) rejected.tooFar++; continue; }
      const dz = Number.isFinite(n.h) && Number.isFinite(c.elev) ? n.h - c.elev : null;
      if (dz == null || Math.abs(dz) > colocate.maxDzM) { rejected.dz++; continue; }
      pairs.push({ c, n, d, dz, idEq });
    }
  }
  pairs.sort((a, b) => (a.idEq !== b.idEq ? (a.idEq ? -1 : 1) : a.d - b.d || (a.c.id < b.c.id ? -1 : 1)));
  const usedNet = new Set();
  const byCatalogId = new Map();
  for (const p of pairs) {
    const nk = `${p.n.net}:${p.n.id}`;
    if (usedNet.has(nk) || byCatalogId.has(p.c.id)) continue;
    usedNet.add(nk);
    byCatalogId.set(p.c.id, { net: p.n.net, station: p.n, distanceKm: Math.round(p.d * 100) / 100, dzM: Math.round(p.dz), match: p.idEq ? 'id' : 'colocated' });
  }
  return { byCatalogId, rejected };
}

/**
 * Pure selection. `opts.networkStations`: TAWES/SMN stations `{ net, id, wmo, name, country, lat, lon, h }`
 * (already filtered to those with readable truth). Without them the rule degrades to PA1 for
 * AT/CH (POI only) — a metadata outage must not delete points.
 */
export function selectPoints(catalogStations, poiIds, opts = {}) {
  const { byCatalogId, rejected } = matchNetworks(catalogStations, opts.networkStations ?? [], opts.colocate ?? COLOCATE);
  const seenPos = new Set();
  const seenId = new Set();
  const out = [];
  const dropped = { noCountry: 0, noTruth: 0, outsideBox: 0, dupId: 0, dupPos: 0, colocateTooFar: rejected.tooFar, colocateDz: rejected.dz };
  for (const s of catalogStations) {
    const wmoCountry = countryOfWmo(s.id);
    const m = byCatalogId.get(s.id) ?? null;
    const country = m ? m.station.country : wmoCountry;
    if (!country) { dropped.noCountry++; continue; }
    const poi = poiIds.has(s.id);
    if (!m && !poi) { dropped.noTruth++; continue; }
    const lat = m ? m.station.lat : s.lat;
    const lon = m ? m.station.lon : s.lon;
    if (!inCubeBox(lat, lon)) { dropped.outsideBox++; continue; }
    if (seenId.has(s.id)) { dropped.dupId++; continue; }
    const posKey = `${lat.toFixed(3)}/${lon.toFixed(3)}`;
    if (seenPos.has(posKey)) { dropped.dupPos++; continue; }
    seenId.add(s.id); seenPos.add(posKey);
    const p = {
      id: s.id, name: String(m ? m.station.name : s.name).trim(), lat, lon, elev: m ? m.station.h : s.elev,
      country, profile: PROFILE_OF[country], wmo: m?.station.wmo ?? (wmoCountry ? s.id : null),
      truth: { poi, tawes: m?.net === 'tawes' ? m.station.id : null, smn: m?.net === 'smn' ? m.station.id : null },
    };
    if (m) p.mosmix = { id: s.id, name: String(s.name).trim(), lat: s.lat, lon: s.lon, elev: s.elev, distanceKm: m.distanceKm, dzM: m.dzM, match: m.match };
    out.push(p);
  }
  out.sort((a, b) => (a.id < b.id ? -1 : 1));
  return { points: out, dropped };
}

async function fetchText(url, timeoutMs = 30_000, encoding = 'utf-8') {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return new TextDecoder(encoding).decode(await r.arrayBuffer());
  } finally { clearTimeout(t); }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

/** Terrain height per point from Terrarium z9 (nearest pixel; 'finite' is all the list needs). */
async function terrainHeights(points) {
  const z = 9;
  const tileOf = (lat, lon) => {
    const n = 2 ** z;
    const x = Math.floor(((lon + 180) / 360) * n);
    const r = (lat * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
    return { x, y, fx: ((lon + 180) / 360) * n - x, fy: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n - y };
  };
  const tiles = new Map();
  const out = new Map();
  for (const p of points) {
    const t = tileOf(p.lat, p.lon);
    const key = `${t.x}/${t.y}`;
    if (!tiles.has(key)) {
      try {
        const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 30_000);
        const r = await fetch(TERRARIUM(z, t.x, t.y), { signal: ac.signal }); clearTimeout(tm);
        tiles.set(key, r.ok ? decodePng(Buffer.from(await r.arrayBuffer())) : null);
      } catch { tiles.set(key, null); }
    }
    const img = tiles.get(key);
    if (!img) { out.set(p.id, null); continue; }
    const i = Math.min(255, Math.floor(t.fx * 256)), j = Math.min(255, Math.floor(t.fy * 256));
    const o = (j * img.width + i) * img.channels;
    out.set(p.id, img.data[o] * 256 + img.data[o + 1] + img.data[o + 2] / 256 - 32768);
  }
  return { heights: out, tiles: tiles.size };
}

/**
 * Network stations whose truth the collector can read TODAY: TAWES ids with at least one
 * `TL` in the last 24 h (one request per ≤ 100 ids — the API rejects URLs past ≈ 2 kB),
 * SMN day files that answer with at least one row. Measured and counted, never assumed.
 */
async function readableNetworkStations() {
  const tawes = parseTawesStations(JSON.parse(await fetchText(TAWES_META_URL)));
  // The OGD CSVs are Windows-1252 ("S\xe4ntis"), not UTF-8 — measured on the file bytes.
  const smn = parseSmnStations(await fetchText(SMN_META_URL, 30_000, 'windows-1252'));
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString().slice(0, 16);
  const tawesOk = new Set();
  const tawesProbe = { stations: tawes.length, requests: 0, bytes: 0, ms: 0 };
  const t0 = Date.now();
  for (let i = 0; i < tawes.length; i += 100) {
    const ids = tawes.slice(i, i + 100).map((s) => s.id);
    const txt = await fetchText(`${TAWES_HISTORY_URL}?parameters=TL&station_ids=${ids.join(',')}&start=${iso(now - 24 * 3_600_000)}&end=${iso(now)}`, 60_000);
    tawesProbe.requests++; tawesProbe.bytes += txt.length;
    for (const f of JSON.parse(txt).features ?? []) if ((f.properties.parameters.TL?.data ?? []).some((v) => v != null)) tawesOk.add(String(f.properties.station));
  }
  tawesProbe.ms = Date.now() - t0;
  const smnProbe = { stations: smn.length, requests: smn.length, bytes: 0, ms: 0, failed: [] };
  const t1 = Date.now();
  const smnOk = new Set();
  await mapLimit(smn, 6, async (s) => {
    try {
      const txt = await fetchText(SMN_NOW_URL(s.id));
      smnProbe.bytes += txt.length;
      if (parseSmnNowRows(txt).length > 0) smnOk.add(s.id); else smnProbe.failed.push(`${s.id}: leer`);
    } catch (e) { smnProbe.failed.push(`${s.id}: ${e.message.slice(0, 40)}`); }
  });
  smnProbe.ms = Date.now() - t1;
  const readable = [...tawes.filter((s) => tawesOk.has(s.id)), ...smn.filter((s) => smnOk.has(s.id))];
  return { readable, probe: { tawes: { ...tawesProbe, readable: tawesOk.size, notReadable: tawes.filter((s) => !tawesOk.has(s.id)).map((s) => `${s.id} ${s.name}`) }, smn: { ...smnProbe, readable: smnOk.size } } };
}

/**
 * POI files that carry at least one measurement (PA3): a file can exist and hold only „---"
 * for days — measured 2026-09-17 at 10004 UFS TW Ems, 10007 UFS Deutsche Bucht, 10044
 * Leuchtturm Kiel, 10382 Berlin-Tegel (closed airport), 10522 Euskirchen. A point whose only
 * truth is such a file has no truth. Probed only for catalog stations that could become
 * points (WMO range or network pair), one file each, six in parallel.
 */
export async function readablePoiIds(poiIds, catalogStations) {
  const candidates = catalogStations.filter((s) => poiIds.has(s.id) && (countryOfWmo(s.id) != null || s.id.startsWith('P')));
  const readable = new Set();
  const empty = [];
  const failed = [];
  const t0 = Date.now();
  let bytes = 0;
  await mapLimit(candidates, 6, async (s) => {
    try {
      const txt = await fetchText(POI_URL(s.id));
      bytes += txt.length;
      const rows = parsePoi(txt);
      let any = false;
      for (const r of rows.values()) if (r.t != null || r.rh != null || r.ff != null || r.p != null || r.n != null) { any = true; break; }
      if (any) readable.add(s.id); else empty.push(`${s.id} ${String(s.name).trim()}`);
    } catch (e) { failed.push(`${s.id}: ${e.message.slice(0, 40)}`); readable.add(s.id); }   // an outage is not an empty station
  });
  return { readable, probe: { candidates: candidates.length, readable: readable.size, empty, failed, bytes, ms: Date.now() - t0 } };
}

export async function buildPointList(opts = {}) {
  const t0 = Date.now();
  const catalogSrc = opts.catalog ?? `${POINT_CDN_BASE}/${STATION_CATALOG_PATH}`;
  const catalog = /^https?:/.test(catalogSrc) ? JSON.parse(await fetchText(catalogSrc)) : JSON.parse(readFileSync(catalogSrc, 'utf8'));
  const poiAll = parsePoiListing(await fetchText(POI_DIR_URL));
  let poiIds = poiAll;
  let poiProbe = null;
  try { ({ readable: poiIds, probe: poiProbe } = await readablePoiIds(poiAll, catalog.stations)); } catch (e) { console.warn(`[points] POI-Sonde gescheitert — alle POI-Dateien gelten als lesbar: ${e.message}`); }
  let networkStations = [];
  let probe = null;
  try { ({ readable: networkStations, probe } = await readableNetworkStations()); } catch (e) { console.warn(`[points] TAWES/SMN nicht lesbar — AT/CH fallen auf POI zurück: ${e.message}`); }
  const sel = selectPoints(catalog.stations, poiIds, { networkStations });
  const { heights, tiles } = await terrainHeights(sel.points);
  const noDem = [];
  for (const p of sel.points) {
    const h = heights.get(p.id);
    if (h == null || !Number.isFinite(h)) noDem.push(p.id);
    p.demM = h != null && Number.isFinite(h) ? Math.round(h) : null;
  }
  const points = sel.points.filter((p) => p.demM != null);
  const byCountry = {};
  for (const p of points) byCountry[p.country] = (byCountry[p.country] ?? 0) + 1;
  const count = (f) => points.filter(f).length;
  const doc = {
    schema: 1, kind: 'punktarchiv/points', builtAt: new Date().toISOString(),
    from: { catalog: catalogSrc, catalogUpdatedAt: catalog.updatedAt ?? null, catalogCount: catalog.count ?? catalog.stations.length, poiDir: POI_DIR_URL, poiFiles: poiAll.size, poiProbe, smnMeta: SMN_META_URL, tawesMeta: TAWES_META_URL, networkProbe: probe },
    rule: 'DE: MOSMIX-Katalog ∩ POI ∩ WMO 10000–10999 (PA1); seit PA3 zählt eine POI-Datei nur, wenn sie mindestens einen Messwert trägt (Sonde beim Bau). AT/CH/LI: Katalogstation mit TAWES- bzw. SMN-Station am selben Ort (gleiche Kennung ≤ 5 km oder ≤ 2 km, |Δz| ≤ 50 m; Position = Messstelle), POI zusätzlich wo vorhanden, ohne Netzpaar POI allein. Nachbarn (CZ/SK/DK/NL/BE/LU) nur mit POI, Länderprofil wie in PA1. Alle: Cube-Box, eindeutig nach Kennung und Position (3 Dezimalen), DEM (Terrarium z9) endlich. Herleitung: audit/fusion-implementierung.md §9.3, §9.12.',
    profileWhy: PROFILE_WHY,
    colocate: COLOCATE,
    counts: {
      points: points.length, byCountry,
      dach: count((p) => DACH.includes(p.country)), neighbours: count((p) => !DACH.includes(p.country)),
      withPoi: count((p) => p.truth.poi), withTawes: count((p) => p.truth.tawes), withSmn: count((p) => p.truth.smn),
      networkOnly: count((p) => !p.truth.poi && (p.truth.tawes || p.truth.smn)),
      matchId: count((p) => p.mosmix?.match === 'id'), matchColocated: count((p) => p.mosmix?.match === 'colocated'),
      droppedNoDem: noDem.length, poiEmpty: poiProbe?.empty.length ?? null, ...sel.dropped, terrariumTiles: tiles,
    },
    points,
    ms: Date.now() - t0,
  };
  return doc;
}

export function loadPointList() {
  const p = new URL(POINTS_FILE);
  if (!existsSync(p)) throw new Error('scripts/punktarchiv/points.json fehlt — erst `points.mjs` laufen lassen');
  return JSON.parse(readFileSync(p, 'utf8'));
}

export function pointsSelfTest() {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
  add('WMO-Bereiche: 10865 DE · 11035 AT · 11518 CZ (Prag) · 11816 SK · 06700 CH · 06270 NL · 06590 LU · 06990 LI · 02616 (Schweden) keins · P0083 keins',
    countryOfWmo('10865') === 'DE' && countryOfWmo('11035') === 'AT' && countryOfWmo('11518') === 'CZ' && countryOfWmo('11816') === 'SK' && countryOfWmo('06700') === 'CH'
    && countryOfWmo('06270') === 'NL' && countryOfWmo('06590') === 'LU' && countryOfWmo('06990') === 'LI' && countryOfWmo('02616') === null && countryOfWmo('P0083') === null);
  add('Box: München drin, Falsterbo drin (Box, nicht Land!), Rom draußen', inCubeBox(48.14, 11.58) && inCubeBox(55.38, 12.82) && !inCubeBox(41.9, 12.5));
  const cat = [
    { id: '02616', name: 'FALSTERBO', lat: 55.38, lon: 12.82, elev: 3 },
    { id: '10865', name: 'MUENCHEN', lat: 48.16, lon: 11.54, elev: 515 },
    { id: '10865', name: 'MUENCHEN DUP', lat: 48.16, lon: 11.54, elev: 515 },
    { id: '11035', name: 'WIEN/HOHE WARTE', lat: 48.25, lon: 16.37, elev: 198 },
    { id: '11120', name: 'INNSBRUCK FL.', lat: 47.27, lon: 11.35, elev: 581 },
    { id: '11146', name: 'SONNBLICK', lat: 47.05, lon: 12.95, elev: 3106 },
    { id: '11280', name: 'MURAU', lat: 47.11, lon: 14.18, elev: 814 },
    { id: '11518', name: 'PRAG FL.', lat: 50.1, lon: 14.26, elev: 364 },
    { id: '06700', name: 'GENF', lat: 46.25, lon: 6.13, elev: 411 },
    { id: '06680', name: 'SAENTIS', lat: 47.25, lon: 9.33, elev: 2502 },
    { id: '06990', name: 'VADUZ FL.', lat: 47.13, lon: 9.52, elev: 457 },
    { id: '06270', name: 'LEEUWARDEN', lat: 53.22, lon: 5.77, elev: 1 },
    { id: '10999', name: 'OHNE POI', lat: 50, lon: 10, elev: 100 },
    { id: '10998', name: 'GLEICHE POSITION', lat: 48.16, lon: 11.54, elev: 515 },
    { id: '06999', name: 'SMN WEIT WEG', lat: 46.9, lon: 7.9, elev: 900 },
  ];
  const poi = new Set(['02616', '10865', '11035', '11518', '06700', '06270', '10998']);
  const net = [
    { net: 'tawes', id: '11035', wmo: '11035', name: 'WIEN/HOHE WARTE', country: 'AT', lat: 48.2486, lon: 16.3564, h: 198 },
    { net: 'tawes', id: '11121', wmo: '11121', name: 'INNSBRUCK-FLUGHAFEN (AUTOMAT)', country: 'AT', lat: 47.2597, lon: 11.3567, h: 578 },
    { net: 'tawes', id: '11343', wmo: '11343', name: 'SONNBLICK - AUTOM.', country: 'AT', lat: 47.0542, lon: 12.9578, h: 3109 },
    { net: 'tawes', id: '11363', wmo: '11363', name: 'STOLZALPE', country: 'AT', lat: 47.1142, lon: 14.1897, h: 1291 },
    { net: 'smn', id: 'GVE', wmo: '06700', name: 'Genève / Cointrin', country: 'CH', lat: 46.2475, lon: 6.1278, h: 411 },
    { net: 'smn', id: 'SAE', wmo: '06680', name: 'Säntis', country: 'CH', lat: 47.2494, lon: 9.3435, h: 2501 },
    { net: 'smn', id: 'VAD', wmo: '06990', name: 'Vaduz', country: 'LI', lat: 47.1283, lon: 9.5178, h: 457 },
    { net: 'smn', id: 'FAR', wmo: '06999', name: 'Weit weg', country: 'CH', lat: 47.2, lon: 7.9, elev: 900, h: 900 },
  ];
  const sel = selectPoints(cat, poi, { networkStations: net });
  const ids = sel.points.map((p) => p.id).join();
  add('Auswahl: Falsterbo (kein Land), Duplikat-Kennung, DE ohne POI, gleiche Position, Murau (Δz 477 m) und eine Station 33 km neben ihrem Netzpaar fallen weg',
    ids === '06270,06680,06700,06990,10865,11035,11120,11146,11518', ids);
  add('Auswahl: die Gründe sind gezählt (ohne Land 1, ohne Wahrheit 3, Duplikat 1, Position 1, Δz 1, zu weit 1)',
    sel.dropped.noCountry === 1 && sel.dropped.noTruth === 3 && sel.dropped.dupId === 1 && sel.dropped.dupPos === 1 && sel.dropped.colocateDz === 1 && sel.dropped.colocateTooFar === 1, JSON.stringify(sel.dropped));
  const by = Object.fromEntries(sel.points.map((p) => [p.id, p]));
  add('DE unverändert: München an der Katalogposition, nur POI, ohne mosmix-Feld, Profil DE',
    by['10865'].lat === 48.16 && by['10865'].truth.poi && !by['10865'].truth.tawes && !by['10865'].mosmix && by['10865'].profile === 'DE');
  add('AT gleiche Kennung: Wien trägt TAWES 11035 UND POI, Position = Messstelle (48,2486), Katalogposition unter mosmix',
    by['11035'].truth.tawes === '11035' && by['11035'].truth.poi && by['11035'].lat === 48.2486 && by['11035'].mosmix?.lat === 48.25 && by['11035'].mosmix.match === 'id');
  add('AT andere Kennung am selben Ort: Innsbruck FL. 11120 ↔ TAWES 11121 (colocated), Sonnblick 11146 ↔ 11343 ohne POI',
    by['11120'].truth.tawes === '11121' && by['11120'].mosmix.match === 'colocated' && by['11146'].truth.tawes === '11343' && by['11146'].truth.poi === false && by['11146'].elev === 3109);
  add('CH: Genf SMN GVE + POI, Säntis SMN SAE ohne POI (Höhe der Messstelle 2501 m); LI: Vaduz SMN VAD, Profil CH',
    by['06700'].truth.smn === 'GVE' && by['06700'].country === 'CH' && by['06680'].truth.smn === 'SAE' && !by['06680'].truth.poi && by['06680'].elev === 2501
    && by['06990'].country === 'LI' && by['06990'].truth.smn === 'VAD' && by['06990'].profile === 'CH');
  add('Nachbarn richtig etikettiert: Prag CZ/Profil AT (PA1), Leeuwarden NL/Profil DE (E-F-11), beide nur POI',
    by['11518'].country === 'CZ' && by['11518'].profile === 'AT' && by['06270'].country === 'NL' && by['06270'].profile === 'DE' && by['11518'].truth.poi && !by['11518'].truth.tawes);
  // Rückfall: ohne Netzstationen (Metadaten-Ausfall) bleibt ein AT-Punkt mit POI stehen, einer ohne POI fällt.
  const bare = selectPoints(cat, poi, {});
  add('Rückfall ohne TAWES/SMN: Wien und Genf bleiben (POI, Katalogposition), Sonnblick und Säntis fallen',
    !!bare.points.find((p) => p.id === '11035' && p.lat === 48.25 && !p.truth.tawes) && !!bare.points.find((p) => p.id === '06700') && !bare.points.find((p) => p.id === '11146' || p.id === '06680'));
  // Eindeutigkeit der Paare: zwei Katalogstationen an derselben Netzstation — die kennungsgleiche gewinnt.
  const two = matchNetworks([{ id: '11144', lat: 47.3, lon: 12.8, elev: 766 }, { id: '11143', lat: 47.29, lon: 12.79, elev: 753 }],
    [{ net: 'tawes', id: '11144', wmo: '11144', name: 'ZELL AM SEE', country: 'AT', lat: 47.2925, lon: 12.7867, h: 754 }]);
  add('Paare: eine Netzstation gehört höchstens EINER Katalogstation, die kennungsgleiche zuerst (Zell am See 11144 vor 11143 FL.)',
    two.byCatalogId.size === 1 && two.byCatalogId.get('11144')?.match === 'id', JSON.stringify([...two.byCatalogId.keys()]));
  return { checks, passed: checks.filter((c) => c.ok).length, total: checks.length };
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
  if (args.includes('--self-test')) {
    const r = pointsSelfTest();
    for (const c of r.checks) console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
    console.log(`${r.passed}/${r.total}`);
    process.exitCode = r.passed === r.total ? 0 : 1;
    return;
  }
  const doc = await buildPointList({ catalog: flag('catalog') });
  const out = flag('out') ?? POINTS_FILE;
  writeFileSync(out, `${JSON.stringify(doc, null, 1)}\n`);
  const c = doc.counts;
  console.log(`[points] ${c.points} Punkte · ${Object.entries(c.byCountry).map(([k, v]) => `${k} ${v}`).join(' · ')} · POI ${c.withPoi} · TAWES ${c.withTawes} · SMN ${c.withSmn} (nur Netz ${c.networkOnly}; Paar id ${c.matchId} / Ort ${c.matchColocated}) · ohne DEM ${c.droppedNoDem}`);
  console.log(`[points] verworfen: ${JSON.stringify({ noCountry: c.noCountry, noTruth: c.noTruth, outsideBox: c.outsideBox, dupId: c.dupId, dupPos: c.dupPos, colocateTooFar: c.colocateTooFar, colocateDz: c.colocateDz })}`);
  const pr = doc.from.networkProbe;
  if (pr) console.log(`[points] Wahrheit geprüft: TAWES ${pr.tawes.readable}/${pr.tawes.stations} (${pr.tawes.requests} Abrufe, ${(pr.tawes.bytes / 1024).toFixed(0)} KB, ${pr.tawes.ms} ms) · SMN ${pr.smn.readable}/${pr.smn.stations} (${pr.smn.requests} Abrufe, ${(pr.smn.bytes / 1024).toFixed(0)} KB, ${pr.smn.ms} ms)${pr.smn.failed.length ? ` — nicht lesbar: ${pr.smn.failed.join(', ')}` : ''}${pr.tawes.notReadable.length ? ` — TAWES ohne TL: ${pr.tawes.notReadable.join(', ')}` : ''}`);
  const pp = doc.from.poiProbe;
  if (pp) console.log(`[points] POI geprüft: ${pp.readable}/${pp.candidates} Dateien mit Messwert (${(pp.bytes / 1024).toFixed(0)} KB, ${pp.ms} ms)${pp.empty.length ? ` — leer: ${pp.empty.join(', ')}` : ''}${pp.failed.length ? ` — nicht lesbar (gelten als lesbar): ${pp.failed.join(', ')}` : ''}`);
  console.log(`[points] ${doc.ms} ms → ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
