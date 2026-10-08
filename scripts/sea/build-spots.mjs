#!/usr/bin/env node
/**
 * SW-2 — builds the static files of the sea line (E-SW-5, E-SW-13):
 *   static/spots.json   the spot catalogue: hand list `scripts/sea/spots-src.json` + what is computed here
 *   static/areas.json   DWD sea areas (FQDL50) and coast sections (FQDL51/WODL45) as simplified GeoJSON
 *
 * Computed per spot (reproducible, no OSM):
 *   cell     nearest CWAM sea cell that is not a dead corner: mean Hs of the four fixture steps ≥ 2 cm and ≥ 3 of its
 *            8 neighbours water (SW-0: Wangerooge's nearest cell stayed 0 all run long)
 *   normal   shore normal (bearing pointing SEAWARD, `shoreNormal.mjs`): vector mean of the directions to every cell within 2.5 km,
 *            water +1, land −1 — the mask of the very model the waves come from
 *   seaArea / coast   point in polygon of the cell centre in the DWD shapes (nearest polygon edge as fallback)
 *   station  nearest DWD POI station that delivered wind, direction and gust (SW-0 probe, fill ≥ 0.8)
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/build-spots.mjs
 *     [--grib=scripts/lib/fixtures/sea/cwam-2026100700] [--shapes=<cache dir>] [--poi=audit/seewetter/spike/poi-probe.json]
 *     [--out=<dir>]   (default: print a summary only)  [--geo]  also writes static/spot-geo.json (network: Terrarium + WorldCover)
 *
 *   static/spot-geo.json   producer-only cache entries of the client readers `loadTerrainAtPoint`/`loadZ0AtPoint` at every
 *            spot's water cell (pattern road/fc `geo.json`). Over water Terrarium returns the sea-bed depth as height
 *            (SW-0: −1 … −19 m); the entry carries `elevationM: 0` there (sea surface, E-SW-11; measured effect on
 *            buscosun Fusion wind ≤ 0.15 m/s, T ≤ 0.14 K) and keeps the read value as `elevationRead`.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeGrib2 } from '../../src/sources/gribDecode.ts';
import { decompressBz2 } from '../lib/bz2.mjs';
import { SEA_MODELS, seaCellCentre, seaCellOf, spotCatalogProblems, SEA_SPOT_MAX_CELL_KM } from '../../src/sea/seaContract.ts';
import { SEA_AREA_IDS, SEA_COAST_IDS } from '../../src/sea/seaText.ts';
import { maskVectorNormal } from './shoreNormal.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));

export const SHAPE_URLS = {
  sea: 'https://www.dwd.de/DE/leistungen/opendata/help/warnungen/cap_seegebiete_shape_zip.zip?__blob=publicationFile&v=4',
  coast: 'https://www.dwd.de/DE/leistungen/opendata/help/warnungen/cap_kueste_shape_zip.zip?__blob=publicationFile&v=6',
};
export const AREAS_ATTRIBUTION = 'Seegebiete und Küstenabschnitte: Deutscher Wetterdienst (CAP-Warngebiete); © GeoBasis-DE / BKG 2021 (Daten modifiziert); VMAP0 – Daten z. T. modifiziert';
/** FQDL50 areas of North Sea and Baltic (the shapes also cover Channel, Dogger …, not drawn). */
const SEA_IDS = new Set(Object.values(SEA_AREA_IDS));
const COAST_IDS = new Set(Object.values(SEA_COAST_IDS));
const NAME_OF = Object.fromEntries([...Object.entries(SEA_AREA_IDS), ...Object.entries(SEA_COAST_IDS)].map(([n, id]) => [id, n]));

const km = (aLat, aLon, bLat, bLon) => {
  const r = Math.PI / 180, dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

// --- zip + shapefile (no dependency) -----------------------------------------------------------------
import { inflateRawSync } from 'node:zlib';
export function unzip(buf) {
  const out = {};
  let p = 0;
  while (p + 30 <= buf.length && buf.readUInt32LE(p) === 0x04034b50) {
    const method = buf.readUInt16LE(p + 8), csize = buf.readUInt32LE(p + 18), nlen = buf.readUInt16LE(p + 26), xlen = buf.readUInt16LE(p + 28);
    const name = buf.subarray(p + 30, p + 30 + nlen).toString('utf8');
    const data = buf.subarray(p + 30 + nlen + xlen, p + 30 + nlen + xlen + csize);
    out[name.split('/').pop()] = method === 8 ? inflateRawSync(data) : Buffer.from(data);
    p += 30 + nlen + xlen + csize;
  }
  return out;
}
export function readDbf(b) {
  const n = b.readUInt32LE(4), hl = b.readUInt16LE(8), rl = b.readUInt16LE(10);
  const fields = [];
  for (let o = 32; b[o] !== 0x0d; o += 32) fields.push([b.toString('latin1', o, o + 11).replace(/\0.*/, ''), b.readUInt8(o + 16)]);
  const rows = [];
  for (let r = 0; r < n; r++) {
    let o = hl + r * rl + 1;
    const row = {};
    for (const [name, len] of fields) { row[name] = b.toString('utf8', o, o + len).trim(); o += len; }
    rows.push(row);
  }
  return rows;
}
export function readShpPolygons(b) {
  const out = [];
  let p = 100;
  while (p + 8 <= b.length) {
    const len = b.readInt32BE(p + 4) * 2;
    const c = p + 8;
    const type = b.readInt32LE(c);
    if (type === 5) {
      const np = b.readInt32LE(c + 36), npt = b.readInt32LE(c + 40);
      const parts = Array.from({ length: np }, (_, k) => b.readInt32LE(c + 44 + 4 * k));
      const pts = Array.from({ length: npt }, (_, k) => [b.readDoubleLE(c + 44 + 4 * np + 16 * k), b.readDoubleLE(c + 44 + 4 * np + 16 * k + 8)]);
      out.push(parts.map((s, k) => pts.slice(s, k + 1 < np ? parts[k + 1] : npt)));
    } else out.push([]);
    p = c + len;
  }
  return out;
}
export function pointInRings(rings, lon, lat) {
  let inside = false;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distToRingsKm(rings, lon, lat) {
  let best = Infinity;
  for (const ring of rings) for (let i = 0; i + 1 < ring.length; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[i + 1];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((lon - ax) * dx + (lat - ay) * dy) / l2)) : 0;
    best = Math.min(best, km(lat, lon, ay + t * dy, ax + t * dx));
  }
  return best;
}
function simplify(ring, tol) {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length); keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1, bd = 0;
    const [ax, ay] = ring[a], [bx, by] = ring[b];
    for (let i = a + 1; i < b; i++) {
      const [x, y] = ring[i];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-18;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
      const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
      if (d > bd) { bd = d; best = i; }
    }
    if (best >= 0 && bd > tol) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return ring.filter((_, i) => keep[i]).map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]);
}

async function loadShapes(cacheDir) {
  const res = {};
  for (const [kind, url] of Object.entries(SHAPE_URLS)) {
    const file = cacheDir ? join(cacheDir, `${kind}.zip`) : null;
    let buf;
    if (file && existsSync(file)) buf = readFileSync(file);
    else {
      const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      buf = Buffer.from(await r.arrayBuffer());
      if (file) { mkdirSync(cacheDir, { recursive: true }); writeFileSync(file, buf); }
    }
    const z = unzip(buf);
    const shp = Object.keys(z).find((n) => n.endsWith('.shp')), dbf = Object.keys(z).find((n) => n.endsWith('.dbf'));
    const rows = readDbf(z[dbf]), polys = readShpPolygons(z[shp]);
    res[kind] = rows.map((row, k) => ({ id: row.WARNCELLID, name: row.NAME, copyright: row.COPYRIGHT, rings: polys[k] }));
  }
  return res;
}

/** Terrain + z0 cache entries at the spots' water cells; sea-bed heights become 0 (E-SW-11). */
export async function buildSpotGeo(spots, opts = {}) {
  const { buildGeo } = await import('../road/build-fc-points.mjs');
  const pts = spots.map((s) => ({ id: s.id, ...seaCellCentre('cwam', s.cell.i, s.cell.j) }));
  const { entries, failed } = await buildGeo(pts, opts);
  const fixed = entries.map(([k, v]) => [k, k.startsWith('terrain/') && Number.isFinite(v.elevationM) && v.elevationM < 0 ? { ...v, elevationM: 0, elevationRead: v.elevationM } : v]);
  return { schema: 1, product: 'sea-spot-geo', note: 'Cache-Einträge der Client-Leser (Terrarium z11 + z8, ESA WorldCover 2021, CC BY 4.0) an der Wasserzelle jedes Spots; Höhe über Wasser = 0 (Meeresoberfläche, E-SW-11), gelesene Tiefe in elevationRead. Nur für den Producer.', failed, entries: fixed };
}

export async function buildSpots({ gribDir, shapesCache = null, poiFile, src }) {
  const g = SEA_MODELS.cwam.grid;
  const fields = [];
  for (const s of [10, 24, 34, 58]) fields.push(decodeGrib2(new Uint8Array(await decompressBz2(readFileSync(join(gribDir, `CWAM_SWH_2026100700_${String(s).padStart(3, '0')}.grib2.bz2`))))).values);
  const water = (i, j) => i >= 0 && j >= 0 && i < g.ni && j < g.nj && !Number.isNaN(fields[0][j * g.ni + i]);
  const meanHs = (i, j) => fields.reduce((a, f) => a + f[j * g.ni + i], 0) / fields.length;
  const shapes = await loadShapes(shapesCache);
  const poi = JSON.parse(readFileSync(poiFile, 'utf8')).stations.filter((s) => s.fill.ff >= 0.8 && s.fill.dd >= 0.8 && s.fill.fx >= 0.8);
  const spots = [];
  for (const s of src.spots) {
    const c = seaCellOf('cwam', s.lat, s.lon);
    let best = null;
    for (let j = Math.floor(c.j) - 8; j <= Math.ceil(c.j) + 8; j++) for (let i = Math.floor(c.i) - 8; i <= Math.ceil(c.i) + 8; i++) {
      if (!water(i, j)) continue;
      let nb = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if ((di || dj) && water(i + di, j + dj)) nb++;
      if (nb < 3 || meanHs(i, j) < 0.02) continue;
      const p = seaCellCentre('cwam', i, j);
      const d = km(s.lat, s.lon, p.lat, p.lon);
      if (!best || d < best.km) best = { i, j, km: d };
    }
    // Shore normal from the mask within 2.5 km of the spot (V-SW-9: the coastline rule `maskCoastNormal` was measured
    // against the BKG DLM250 coastline and is NOT better at these positions — audit/seewetter.md §13.3).
    const normal = maskVectorNormal(water, g, s.lat, s.lon);
    const cc = best ? seaCellCentre('cwam', best.i, best.j) : { lat: s.lat, lon: s.lon };
    const find = (list, ids) => {
      const cand = list.filter((a) => ids.has(a.id));
      const hit = cand.find((a) => pointInRings(a.rings, cc.lon, cc.lat));
      if (hit) return { id: hit.id, name: NAME_OF[hit.id] ?? hit.name, how: 'inside' };
      const near = cand.map((a) => ({ a, d: distToRingsKm(a.rings, cc.lon, cc.lat) })).sort((x, y) => x.d - y.d)[0];
      return near && near.d < 15 ? { id: near.a.id, name: NAME_OF[near.a.id] ?? near.a.name, how: `nearest ${near.d.toFixed(1)} km` } : null;
    };
    const sea = find(shapes.sea, SEA_IDS), coast = find(shapes.coast, COAST_IDS);
    const st = poi.map((p) => ({ p, d: km(s.lat, s.lon, p.lat, p.lon) })).sort((x, y) => x.d - y.d)[0];
    spots.push({
      id: s.id, name: s.name, region: s.region, kinds: s.kinds, lat: s.lat, lon: s.lon,
      ...(Number.isFinite(s.normal) ? { normal: s.normal, normalFrom: 'set', normalMask: normal, normalWhy: s.normalWhy } : { normal, normalFrom: 'mask' }),
      cell: best ? { model: 'cwam', i: best.i, j: best.j, km: +best.km.toFixed(2) } : { model: 'cwam', i: -1, j: -1, km: 99 },
      seaArea: sea ? { id: sea.id, name: sea.name } : null,
      coast: coast ? { id: coast.id, name: coast.name } : null,
      wodlCoast: s.region === 'nordsee' ? 'Nordseekueste' : 'Ostseekueste',
      station: st ? { id: st.p.id, name: st.p.name, km: +st.d.toFixed(1), lat: st.p.lat, lon: st.p.lon } : null,
      ...(s.tidal ? { tidal: true } : {}),
      _how: { sea: sea?.how ?? null, coast: coast?.how ?? null },
    });
  }
  const areas = {
    type: 'FeatureCollection', schema: 1, product: 'sea-areas', attribution: AREAS_ATTRIBUTION, source: SHAPE_URLS,
    features: [...shapes.sea.filter((a) => SEA_IDS.has(a.id)).map((a) => ({ ...a, kind: 'sea' })), ...shapes.coast.filter((a) => COAST_IDS.has(a.id)).map((a) => ({ ...a, kind: 'coast' }))]
      .map((a) => ({
        type: 'Feature', properties: { id: a.id, name: NAME_OF[a.id] ?? a.name, kind: a.kind },
        geometry: { type: 'MultiPolygon', coordinates: a.rings.map((r) => simplify(r, 0.005)).filter((r) => r.length >= 4).map((r) => [r]) },
      })),
  };
  return { spots, areas };
}

async function main() {
  const src = JSON.parse(readFileSync(join(HERE, 'spots-src.json'), 'utf8'));
  const { spots, areas } = await buildSpots({
    gribDir: resolve(ROOT, String(args.grib ?? 'scripts/lib/fixtures/sea/cwam-2026100700')),
    shapesCache: typeof args.shapes === 'string' ? resolve(args.shapes) : null,
    poiFile: resolve(ROOT, String(args.poi ?? 'audit/seewetter/spike/poi-probe.json')), src,
  });
  for (const s of spots) console.log(`${s.id.padEnd(22)} cell ${String(s.cell.i).padStart(3)}/${String(s.cell.j).padStart(3)} ${s.cell.km.toFixed(2)} km · Ufer ${String(s.normal).padStart(3)}° · ${s.seaArea?.name ?? '–'} (${s._how.sea}) · ${s.coast?.name ?? '–'} (${s._how.coast}) · ${s.station?.name ?? '–'} ${s.station?.km ?? ''} km`);
  const problems = spotCatalogProblems(spots);
  console.log(`\n${spots.length} Spots, ${problems.length} Befunde${problems.length ? `: ${problems.join(' | ')}` : ''} (Zelle ≤ ${SEA_SPOT_MAX_CELL_KM} km)`);
  if (typeof args.out === 'string') {
    mkdirSync(args.out, { recursive: true });
    const doc = { schema: 1, product: 'sea-spots', built: new Date().toISOString(), about: src.about, from: { grib: 'CWAM 2026100700 swh +10/24/34/58 h', poi: 'audit/seewetter/spike/poi-probe.json', shapes: SHAPE_URLS }, spots: spots.map(({ _how, ...s }) => s) };
    writeFileSync(join(args.out, 'spots.json'), JSON.stringify(doc) + '\n');
    writeFileSync(join(args.out, 'areas.json'), JSON.stringify(areas) + '\n');
    if (args.geo) {
      const { installNodeShims } = await import('../punktarchiv/lib/nodeShims.mjs');
      installNodeShims();
      const geo = await buildSpotGeo(doc.spots);
      writeFileSync(join(args.out, 'spot-geo.json'), JSON.stringify(geo) + '\n');
      console.log(`spot-geo.json: ${geo.entries.length} Einträge, ${geo.failed.length} Spots unvollständig, ${geo.entries.filter(([, v]) => v.elevationRead != null).length} Höhen auf 0 gesetzt`);
    }
    console.log(`geschrieben: ${join(args.out, 'spots.json')} · ${join(args.out, 'areas.json')}`);
  }
  if (problems.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
