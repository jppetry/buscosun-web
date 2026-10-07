#!/usr/bin/env node
/**
 * M6 (`audit/autobahnwetter-datenpruefung.md` §5, Jan 06.10.2026 „ja mache es genau so"): ONE position per road-weather
 * station for the measured marker AND the forecast point. The DWD gives two — the position in the bulletin and the one
 * in the station catalogue of 2020 — and neither is right everywhere (measured on 06.10.: at motorways the bulletin wins
 * 42 : 4, off the motorways the catalogue 8 : 1). The rule decides per station by evidence:
 *
 *   1. the position that lies at the station's OWN road (a way with the same road number in OpenStreetMap within
 *      `ROAD_POS_ON_ROAD_M`) wins;
 *   2. both at the road ⇒ the bulletin (current, five decimals);
 *   3. neither ⇒ the bulletin, and the station is flagged (`posUnverified`) and listed for Jan;
 *   4. positions closer than `ROAD_POS_SAME_KM` are the same place ⇒ the bulletin, no check needed.
 *
 * Output `scripts/road/station-positions.json` (producer data next to `de-outline.geojson`, read from the clone of
 * buscosun-web by the derive in the radar mirror and by `build-fc-points.mjs`). Only stations farther apart than
 * `ROAD_POS_SAME_KM` are listed; every other station keeps its bulletin position.
 *
 *   node scripts/road/station-positions.mjs --stations=<road/v1/static/stations.json> --obs=<obs/<slot>.json,…>
 *     --out=scripts/road/station-positions.json [--osm-cache=<file.json>] [--osm-motorways=<Overpass extract of DE motorways>]
 */
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

/** A position counts as "at the road" when a way with the station's road number passes within this distance (`set`). */
export const ROAD_POS_ON_ROAD_M = 300;
/** Bulletin and catalogue closer than this are one place (`set`: the catalogue rounds to 0.01°/1′ in many rows). */
export const ROAD_POS_SAME_KM = 0.3;
/** A recorded decision holds while the bulletin still reports (within this) the position it was taken on. */
export const ROAD_POS_STALE_KM = 0.3;
export const ROAD_POS_FILE = join(dirname(fileURLToPath(import.meta.url)), 'station-positions.json');

/** Public Overpass instances, tried in turn (the main one answers 504 under load). */
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const UA = 'buscosun-road-positions (buscosun-web/audit/autobahnwetter-datenpruefung.md)';
const RAD = Math.PI / 180;

export function kmBetween(aLat, aLon, bLat, bLon) {
  const dLat = (bLat - aLat) * RAD, dLon = (bLon - aLon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/**
 * Road number of a designator as `{ cls, num }` with ALL digits (`St 2260` → ST/2260, `A045S` → A/45, `L3078x` → L/3078).
 * Classes: A motorway, B federal, L state road (L, S, St, ST, LS), K district road. `null` when there is none (`RWYx`).
 */
export function roadKeyOf(s) {
  if (!s) return null;
  const t = String(s).replace(/[\s.]+/g, '').toUpperCase();
  const m = /^(BAB|A|B|ST|LS|L|S|K)0*(\d{1,4})/.exec(t);
  if (!m) return null;
  const cls = m[1] === 'BAB' ? 'A' : m[1] === 'ST' || m[1] === 'LS' || m[1] === 'S' ? 'L' : m[1];
  return { cls, num: m[2] };
}

/** Road keys an OSM `ref` carries (`A 45;E 41` → A/45 — the E roads are no national class). */
export function refKeys(ref) {
  return String(ref ?? '').split(/[;,/]+/).map(roadKeyOf).filter(Boolean);
}

const sameKey = (a, b) => a.cls === b.cls && a.num === b.num;

/** Distance (m) from `p` = [lon, lat] to the polyline `geom` = [{lat, lon}, …]. */
export function distToGeomM(p, geom) {
  let best = Infinity;
  const kx = Math.cos(p[1] * RAD) * RAD * 6_371_000, ky = RAD * 6_371_000;
  for (let i = 1; i < geom.length; i++) {
    const ax = (geom[i - 1].lon - p[0]) * kx, ay = (geom[i - 1].lat - p[1]) * ky;
    const bx = (geom[i].lon - p[0]) * kx, by = (geom[i].lat - p[1]) * ky;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/** Nearest way (m) at `p` carrying one of `keys`, from a list of OSM ways with `tags.ref` and `geometry`; Infinity if none. */
export function distToOwnRoadM(p, keys, ways) {
  let best = Infinity;
  for (const w of ways) {
    if (!Array.isArray(w.geometry) || w.geometry.length < 2) continue;
    if (!refKeys(w.tags?.ref).some((k) => keys.some((x) => sameKey(k, x)))) continue;
    best = Math.min(best, distToGeomM(p, w.geometry));
  }
  return best;
}

/**
 * The rule (pure). `reportOn` / `catalogOn`: lies at its own road (true/false), `null` = could not be checked.
 * Returns `{ use: 'report' | 'catalog', check }` with check = which position lies at the road.
 */
export function pickPosition({ distKm, reportOn, catalogOn }) {
  if (distKm <= ROAD_POS_SAME_KM) return { use: 'report', check: 'same' };
  if (reportOn == null || catalogOn == null) return { use: 'report', check: 'unchecked' };
  if (reportOn && catalogOn) return { use: 'report', check: 'both' };
  if (reportOn) return { use: 'report', check: 'report' };
  if (catalogOn) return { use: 'catalog', check: 'catalog' };
  return { use: 'report', check: 'neither' };
}

/** Reads the table (or `null`): the derive and the point builder call this once per run. */
export function readStationPositions(file = ROAD_POS_FILE) {
  if (!existsSync(file)) return null;
  try {
    const j = JSON.parse(readFileSync(file, 'utf8'));
    return j?.schema === 1 && j.product === 'road-station-positions' && j.stations && typeof j.stations === 'object' ? j : null;
  } catch { return null; }
}

/**
 * The position of one station for marker and forecast point. `report` = position of the live bulletin (or null),
 * `catalog` = catalogue position (or null). Returns `{ lat, lon, flag }` — flag `posCatalog` (the catalogue was chosen
 * because only it lies at the road), `posUnverified` (neither lies at the road), or none. A decision is used only while
 * the bulletin still reports the position it was taken on: if the DWD corrects the bulletin, the bulletin counts again.
 */
export function stationPosition(table, id, report, catalog) {
  const e = table?.stations?.[id];
  const hasReport = report && Number.isFinite(report.lat) && Number.isFinite(report.lon);
  if (e && e.use === 'catalog' && Array.isArray(e.catalog)) {
    const still = !hasReport || (Array.isArray(e.report) && kmBetween(report.lat, report.lon, e.report[0], e.report[1]) <= ROAD_POS_STALE_KM);
    if (still) return { lat: e.catalog[0], lon: e.catalog[1], flag: 'posCatalog' };
  }
  if (hasReport) {
    const unverified = e && e.check === 'neither' && Array.isArray(e.report) && kmBetween(report.lat, report.lon, e.report[0], e.report[1]) <= ROAD_POS_STALE_KM;
    return { lat: report.lat, lon: report.lon, flag: unverified ? 'posUnverified' : null };
  }
  if (catalog && Number.isFinite(catalog.lat) && Number.isFinite(catalog.lon)) return { lat: catalog.lat, lon: catalog.lon, flag: null };
  return { lat: null, lon: null, flag: null };
}

// --- builder (network: Overpass) ---------------------------------------------------------------------

const round5 = (x) => Math.round(x * 1e5) / 1e5;

/**
 * Ways with a `ref` around every position. `cacheFile`: written after EVERY batch ({ways, done}) — a run that dies on an
 * overloaded Overpass resumes where it stopped (06.10.2026: 504s for minutes).
 */
async function overpassWays(positions, log, cacheFile = null) {
  const ways = new Map();
  const done = new Set();
  if (cacheFile && existsSync(cacheFile)) {
    const c = JSON.parse(readFileSync(cacheFile, 'utf8'));
    for (const [id, w] of c.ways ?? []) ways.set(id, w);
    for (const k of c.done ?? []) done.add(k);
  }
  const keyOf = ([lat, lon]) => `${lat},${lon}`;
  const todo = positions.filter((p) => !done.has(keyOf(p))).filter((p, i, a) => a.findIndex((q) => keyOf(q) === keyOf(p)) === i);
  const BATCH = 10;
  for (let i = 0; i < todo.length; i += BATCH) {
    const part = todo.slice(i, i + BATCH);
    const q = `[out:json][timeout:90];(${part.map(([lat, lon]) => `way(around:${ROAD_POS_ON_ROAD_M + 100},${lat},${lon})[highway][ref];`).join('')});out tags geom;`;
    let ok = false;
    for (let a = 0; a < 15 && !ok; a++) {
      try {
        const r = await fetch(OVERPASS[a % OVERPASS.length], { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA }, body: 'data=' + encodeURIComponent(q) });
        if (r.ok) {
          const j = await r.json();
          for (const e of j.elements ?? []) if (e.type === 'way') ways.set(e.id, { tags: { ref: e.tags?.ref }, geometry: e.geometry });
          ok = true;
        } else { await new Promise((res) => setTimeout(res, Math.min(60_000, 5000 * (a + 1)))); }
      } catch { await new Promise((res) => setTimeout(res, Math.min(60_000, 5000 * (a + 1)))); }
    }
    if (!ok) throw new Error(`Overpass: Stapel ${i / BATCH + 1} nicht lesbar (Zwischenstand gesichert, neuer Lauf setzt fort)`);
    for (const p of part) done.add(keyOf(p));
    if (cacheFile) writeFileSync(cacheFile, JSON.stringify({ updatedAt: new Date().toISOString(), ways: [...ways], done: [...done] }));
    log(`Overpass ${positions.length - todo.length + Math.min(i + BATCH, todo.length)}/${positions.length} Lagen · ${ways.size} Wege`);
    await new Promise((res) => setTimeout(res, 1000));
  }
  return [...ways.values()];
}

/** Candidates: stations with a catalogue row AND a bulletin position, farther apart than `ROAD_POS_SAME_KM`. */
export function candidates(catalog, reportById) {
  const out = [];
  for (const [id, c] of Object.entries(catalog ?? {})) {
    const r = reportById.get(id);
    if (!r || !Number.isFinite(c.lat) || !Number.isFinite(c.lon) || !Number.isFinite(r.lat) || !Number.isFinite(r.lon)) continue;
    const distKm = kmBetween(r.lat, r.lon, c.lat, c.lon);
    if (distKm <= ROAD_POS_SAME_KM) continue;
    // The catalogue keeps the full number (`St2260`); the published `road` of a point is cut to three digits (D-10), so
    // the bulletin's road joins only as motorway or federal road (≤ 3 digits) — it fixes catalogue rows that name the
    // wrong road (H273 Topmannsbach: catalogue A 44, bulletin A 33).
    const kc = roadKeyOf(c.roadRaw ?? c.road), kr = roadKeyOf(r.road);
    const keys = [kc, kr && (kr.cls === 'A' || kr.cls === 'B') ? kr : null].filter(Boolean)
      .filter((k, i, a) => a.findIndex((x) => sameKey(x, k)) === i);
    out.push({ id, name: c.n ?? r.n ?? id, road: c.roadRaw ?? c.road ?? r.road ?? null, keys, distKm, report: [r.lat, r.lon], catalog: [c.lat, c.lon] });
  }
  return out.sort((a, b) => b.distKm - a.distKm);
}

export function decide(cands, ways) {
  const stations = {};
  const counts = { listed: 0, report: 0, catalog: 0, both: 0, neither: 0, unchecked: 0 };
  for (const c of cands) {
    const dR = c.keys.length ? distToOwnRoadM([c.report[1], c.report[0]], c.keys, ways) : null;
    const dC = c.keys.length ? distToOwnRoadM([c.catalog[1], c.catalog[0]], c.keys, ways) : null;
    const res = pickPosition({ distKm: c.distKm, reportOn: dR == null ? null : dR <= ROAD_POS_ON_ROAD_M, catalogOn: dC == null ? null : dC <= ROAD_POS_ON_ROAD_M });
    counts.listed++; counts[res.check]++;
    const m = (d) => (d == null ? null : Number.isFinite(d) ? Math.round(d) : null);
    stations[c.id] = {
      use: res.use, check: res.check, name: c.name, road: c.road, distKm: Math.round(c.distKm * 100) / 100,
      report: [round5(c.report[0]), round5(c.report[1])], catalog: [round5(c.catalog[0]), round5(c.catalog[1])],
      reportToRoadM: m(dR), catalogToRoadM: m(dC),
    };
  }
  return { stations, counts };
}

async function main() {
  const flags = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
  for (const k of ['stations', 'obs', 'out']) if (!flags[k]) { console.error(`--${k} fehlt`); process.exit(2); }
  const log = (m) => console.log(`[positions] ${m}`);
  const catalog = JSON.parse(readFileSync(flags.stations, 'utf8')).stations;
  // Newest obs file wins per station (the files are given oldest first or in any order: by slot).
  const obsDocs = String(flags.obs).split(',').map((f) => JSON.parse(readFileSync(f, 'utf8'))).sort((a, b) => a.slotMs - b.slotMs);
  const reportById = new Map();
  // `rpos` = the bulletin's own position where the slot shows another one (since M6) — the rule always weighs the bulletin.
  for (const d of obsDocs) for (const p of d.points ?? []) {
    const [lat, lon] = Array.isArray(p.rpos) ? p.rpos : [p.lat, p.lon];
    reportById.set(p.id, { lat, lon, road: p.road, n: p.n });
  }
  const cands = candidates(catalog, reportById);
  log(`${reportById.size} meldende Stationen, ${cands.length} mit Meldung und Katalog > ${ROAD_POS_SAME_KM} km auseinander`);
  // `--osm-motorways=<file>`: the Overpass extract of every highway=motorway in Germany (the one `build-fc-points.mjs`
  // caches) answers the motorway stations offline; only the other road classes go to Overpass.
  let motorways = [];
  if (typeof flags['osm-motorways'] === 'string') {
    const m = JSON.parse(readFileSync(flags['osm-motorways'], 'utf8'));
    motorways = (m.elements ?? []).filter((e) => e.type === 'way' && Array.isArray(e.geometry) && e.tags?.ref).map((e) => ({ tags: { ref: e.tags.ref }, geometry: e.geometry }));
    log(`Autobahn-Auszug ${m.osm3s?.timestamp_osm_base ?? '?'}: ${motorways.length} Wege mit ref`);
  }
  const needOverpass = cands.filter((c) => c.keys.length && !(motorways.length && c.keys.every((k) => k.cls === 'A')));
  const ways = [...motorways, ...await overpassWays(needOverpass.flatMap((c) => [c.report, c.catalog]), log, typeof flags['osm-cache'] === 'string' ? flags['osm-cache'] : null)];
  const { stations, counts } = decide(cands, ways);
  const doc = {
    schema: 1, product: 'road-station-positions', builtAt: new Date().toISOString(),
    rule: `Lage an der eigenen Straße gewinnt (Weg mit derselben Nummer in OSM ≤ ${ROAD_POS_ON_ROAD_M} m); beide → Meldung; keine → Meldung, gekennzeichnet; ≤ ${ROAD_POS_SAME_KM} km → Meldung. Eine Entscheidung gilt, solange die Meldung (≤ ${ROAD_POS_STALE_KM} km) dieselbe Lage nennt.`,
    sources: [
      { what: 'Lage aus der Meldung', name: 'DWD Straßenwetter (SWIS), road/v1/obs', license: 'GeoNutzV', attribution: 'Deutscher Wetterdienst' },
      { what: 'Lage aus dem Katalog', name: 'DWD sws_stations_xls.xlsx (road/v1/static/stations.json)', license: 'GeoNutzV', attribution: 'Deutscher Wetterdienst' },
      { what: 'Prüfung an der Straße', name: 'OpenStreetMap (Wege mit ref)', license: 'ODbL 1.0', attribution: '© OpenStreetMap-Mitwirkende' },
    ],
    obs: obsDocs.map((d) => d.slot), counts, stations,
  };
  mkdirSync(dirname(flags.out), { recursive: true });
  writeFileSync(flags.out + '.tmp', JSON.stringify(doc, null, 1) + '\n');
  renameSync(flags.out + '.tmp', flags.out);
  log(`geschrieben: ${JSON.stringify(counts)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
