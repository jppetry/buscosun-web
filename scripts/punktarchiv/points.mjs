/**
 * points.mjs — the archive's point list: stations in DE/AT/CH with an open measurement
 * truth, inside the cube box, with a finite terrain height, unique by id and position.
 *
 * Source of the list: the MOSMIX station catalog the cube publishes
 * (`point/stations/catalog.json`, coordinates from the KML — NOT from
 * `mosmix_stationskatalog.cfg`, whose lat/lon are degrees + decimal minutes, §44), cut to
 * the WMO blocks 10 (DE), 11 (AT), 06 (CH) and to the ids that have a DWD POI file. Every
 * point therefore has, by construction, a MOSMIX-L forecast in the cube's station product
 * AND an hourly measurement — the pair the calibration needs.
 *
 * ⚠ The catalog covers the CUBE box (45,5–55,5 °N / 5,5–17,5 °E), not DACH: its first
 * entry is Falsterbo (Sweden). The WMO block is what makes this a DE/AT/CH list.
 *
 * The list is materialised as `scripts/punktarchiv/points.json` (with a stamp and the
 * counts) so the verifier can check it without the network, and the collector reads the
 * same file — one list, not two.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/punktarchiv/points.mjs [--out=<file>] [--catalog=<url|file>]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { TIERS } from '../../src/point/cubeFormat.ts';
import { POINT_CDN_BASE } from '../../src/point/client/store.ts';
import { STATION_CATALOG_PATH } from '../../src/point/cubeFormat.ts';
import { parsePoiListing, parseSmnMeta, POI_DIR_URL, SMN_META_URL, TAWES_META_URL } from './lib/truth.mjs';
import { decodePng } from '../lib/png.mjs';

export const POINTS_FILE = new URL('./points.json', import.meta.url);
export const WMO_BLOCKS = Object.freeze({ '10': 'DE', '11': 'AT', '06': 'CH' });
const TERRARIUM = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

export function countryOfWmo(id) {
  const m = /^(\d{2})\d{3}$/.exec(id);
  return m ? (WMO_BLOCKS[m[1]] ?? null) : null;
}

export function inCubeBox(lat, lon) {
  const t = TIERS[0];
  return lat >= t.lat0 && lat <= t.lat0 + (t.ny - 1) * t.deg && lon >= t.lon0 && lon <= t.lon0 + (t.nx - 1) * t.deg;
}

/** Pure selection: catalog ∩ POI ids ∩ WMO blocks ∩ box, unique by id AND by rounded position. */
export function selectPoints(catalogStations, poiIds, opts = {}) {
  const smnByWmo = opts.smnByWmo ?? new Map();
  const tawesIds = opts.tawesIds ?? new Set();
  const seenPos = new Set();
  const out = [];
  const dropped = { noCountry: 0, noPoi: 0, outsideBox: 0, dupId: 0, dupPos: 0 };
  const seenId = new Set();
  for (const s of catalogStations) {
    const country = countryOfWmo(s.id);
    if (!country) { dropped.noCountry++; continue; }
    if (!poiIds.has(s.id)) { dropped.noPoi++; continue; }
    if (!inCubeBox(s.lat, s.lon)) { dropped.outsideBox++; continue; }
    if (seenId.has(s.id)) { dropped.dupId++; continue; }
    const posKey = `${s.lat.toFixed(3)}/${s.lon.toFixed(3)}`;
    if (seenPos.has(posKey)) { dropped.dupPos++; continue; }
    seenId.add(s.id); seenPos.add(posKey);
    out.push({
      id: s.id, name: String(s.name).trim(), lat: s.lat, lon: s.lon, elev: s.elev, country, wmo: s.id,
      truth: { poi: true, tawes: country === 'AT' && tawesIds.has(s.id) ? s.id : null, smn: country === 'CH' ? (smnByWmo.get(s.id)?.abbr ?? null) : null },
    });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : 1));
  return { points: out, dropped };
}

async function fetchText(url, timeoutMs = 30_000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return await r.text();
  } finally { clearTimeout(t); }
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

export async function buildPointList(opts = {}) {
  const t0 = Date.now();
  const catalogSrc = opts.catalog ?? `${POINT_CDN_BASE}/${STATION_CATALOG_PATH}`;
  const catalog = /^https?:/.test(catalogSrc) ? JSON.parse(await fetchText(catalogSrc)) : JSON.parse(readFileSync(catalogSrc, 'utf8'));
  const poiIds = parsePoiListing(await fetchText(POI_DIR_URL));
  let smnByWmo = new Map();
  try { smnByWmo = parseSmnMeta(await fetchText(SMN_META_URL)); } catch (e) { console.warn(`[points] SMN-Meta nicht lesbar: ${e.message}`); }
  let tawesIds = new Set();
  try {
    const meta = JSON.parse(await fetchText(TAWES_META_URL));
    for (const s of meta.stations ?? []) if (s.is_active !== false) tawesIds.add(String(s.id));
  } catch (e) { console.warn(`[points] TAWES-Meta nicht lesbar: ${e.message}`); }
  const sel = selectPoints(catalog.stations, poiIds, { smnByWmo, tawesIds });
  const { heights, tiles } = await terrainHeights(sel.points);
  const noDem = [];
  for (const p of sel.points) {
    const h = heights.get(p.id);
    if (h == null || !Number.isFinite(h)) noDem.push(p.id);
    p.demM = h != null && Number.isFinite(h) ? Math.round(h) : null;
  }
  const points = sel.points.filter((p) => p.demM != null);
  const byCountry = { DE: 0, AT: 0, CH: 0 };
  for (const p of points) byCountry[p.country]++;
  const doc = {
    schema: 1, kind: 'punktarchiv/points', builtAt: new Date().toISOString(),
    from: { catalog: catalogSrc, catalogUpdatedAt: catalog.updatedAt ?? null, catalogCount: catalog.count ?? catalog.stations.length, poiDir: POI_DIR_URL, poiFiles: poiIds.size, smnMeta: SMN_META_URL, tawesMeta: TAWES_META_URL },
    rule: 'MOSMIX-Katalog ∩ POI-Kennung ∩ WMO-Block 10/11/06 ∩ Cube-Box, eindeutig nach Kennung und Position (3 Dezimalen), DEM (Terrarium z9) endlich.',
    counts: { points: points.length, byCountry, withTawes: points.filter((p) => p.truth.tawes).length, withSmn: points.filter((p) => p.truth.smn).length, droppedNoDem: noDem.length, ...sel.dropped, terrariumTiles: tiles },
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
  add('WMO-Block: 10865 DE · 11035 AT · 06700 CH · 02616 (Schweden) keins · P0083 keins', countryOfWmo('10865') === 'DE' && countryOfWmo('11035') === 'AT' && countryOfWmo('06700') === 'CH' && countryOfWmo('02616') === null && countryOfWmo('P0083') === null);
  add('Box: München drin, Falsterbo drin (Box, nicht Land!), Rom draußen', inCubeBox(48.14, 11.58) && inCubeBox(55.38, 12.82) && !inCubeBox(41.9, 12.5));
  const cat = [
    { id: '02616', name: 'FALSTERBO', lat: 55.38, lon: 12.82, elev: 3 },
    { id: '10865', name: 'MUENCHEN', lat: 48.16, lon: 11.54, elev: 515 },
    { id: '10865', name: 'MUENCHEN DUP', lat: 48.16, lon: 11.54, elev: 515 },
    { id: '11035', name: 'WIEN', lat: 48.25, lon: 16.36, elev: 198 },
    { id: '06700', name: 'GENEVE', lat: 46.25, lon: 6.13, elev: 411 },
    { id: '06660', name: 'ZUERICH', lat: 47.38, lon: 8.57, elev: 556 },
    { id: '10999', name: 'OHNE POI', lat: 50, lon: 10, elev: 100 },
    { id: '10998', name: 'GLEICHE POSITION', lat: 48.16, lon: 11.54, elev: 515 },
  ];
  const poi = new Set(['02616', '10865', '11035', '06700', '06660', '10998']);
  const sel = selectPoints(cat, poi, { smnByWmo: new Map([['06700', { abbr: 'GVE' }]]), tawesIds: new Set(['11035']) });
  add('Auswahl: Falsterbo (kein DACH-Block), Duplikat-Kennung, ohne POI und gleiche Position fallen weg ⇒ 4 Punkte',
    sel.points.map((p) => p.id).join() === '06660,06700,10865,11035', sel.points.map((p) => p.id).join());
  add('Auswahl: die Gründe sind gezählt', sel.dropped.noCountry === 1 && sel.dropped.dupId === 1 && sel.dropped.noPoi === 1 && sel.dropped.dupPos === 1, JSON.stringify(sel.dropped));
  add('Wahrheit: Wien hat TAWES, Genf hat SMN GVE, Zürich hat kein SMN-Kürzel (fehlt in der Meta), München nur POI',
    sel.points.find((p) => p.id === '11035').truth.tawes === '11035' && sel.points.find((p) => p.id === '06700').truth.smn === 'GVE'
    && sel.points.find((p) => p.id === '06660').truth.smn === null && sel.points.find((p) => p.id === '10865').truth.tawes === null);
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
  console.log(`[points] ${doc.counts.points} Punkte (DE ${doc.counts.byCountry.DE} · AT ${doc.counts.byCountry.AT} · CH ${doc.counts.byCountry.CH}), `
    + `TAWES ${doc.counts.withTawes}, SMN ${doc.counts.withSmn}, ohne DEM ${doc.counts.droppedNoDem}, `
    + `verworfen: ${JSON.stringify({ noCountry: doc.counts.noCountry, noPoi: doc.counts.noPoi, outsideBox: doc.counts.outsideBox, dupId: doc.counts.dupId, dupPos: doc.counts.dupPos })}, ${doc.ms} ms → ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
