#!/usr/bin/env node
/**
 * AW-2 — Corridors of Autobahnwetter → `road/v1/static/corridors.json` (built offline, monthly or on demand;
 * pushed by hand — the mirror keeps the repo's copy, `road-mirror.mjs` copyInto).
 *
 * Source DE: BKG DLM250 road axes (`AX_Strassenachse`, objart 42003, Widmung 1301 = Bundesautobahn) from the BKG
 * WFS `wfs_dlm250` as GeoJSON in WGS84 — dl-de/by-2.0, "© GeoBasis-DE / BKG (<Jahr>)". Town labels: GeoNames
 * (`public/fire/places-dach.json`, CC BY 4.0). AT (GIP.at) and CH (OSM) continuations and their forecast points
 * belong to AW-6 and are NOT built yet (`audit/autobahnwetter.md`, E-AW-12): a corridor ends at the border with
 * a border marker.
 *
 * Per motorway (`bez`, e.g. `A8`): segments → chains (ends ≤ 60 m apart joined) → sections (chains joined across
 * gaps ≤ 3 km, the longest first) → Douglas-Peucker (≈ 80 m) → orientation by the German numbering convention
 * (odd numbers north → south, even numbers west → east) → corridor km from 0 (OUR axis, not the official
 * Betriebskilometer, which restarts per state). Stations of that motorway within 2 km are projected onto it.
 *
 *   node scripts/road/build-corridors.mjs --stations=<static/stations.json> --obs=<obs/<slot>.json> --out=<corridors.json>
 *     [--cache=<dir>] [--roads=A8,A93] [--osm=<Overpass cache>] [--gapless [--pin=<published corridors.json>]]
 *
 * Phase AF-2 (`audit/autobahn-fusion12-lueckenlos.md`), `--gapless`: every stretch of main carriageway in service gets a
 * corridor, with or without a station — see `gapSections`. `--pin` takes the published corridors over unchanged and
 * numbers the new sections behind them. Without `--gapless` the build is the one before, byte for byte.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadDeRings } from './deMask.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WFS = 'https://sgx.geodatenzentrum.de/wfs_dlm250';
const UA = 'buscosun-road-corridors (buscosun-web/audit/autobahnwetter.md)';
const JOIN_M = 60, GAP_KM = 3, SNAP_KM = 2, SIMPLIFY_KM = 0.08;
/** Loop removal (`set`): back within 50 m of a vertex ≥ 150 m earlier = revisit; ≥ 70 % of the next 300 m also
 *  revisiting = retrace (dropped), else a loop (cut). */
const LOOP_NEAR_KM = 0.05, LOOP_MIN_KM = 0.15, LOOKAHEAD_KM = 0.3, RETRACE_SHARE = 0.7, REATTACH_KM = 0.5;
/** V-AW-16 (`set`): a cut-away spur of at least this length may become a section of its own (only with a station on it). */
export const SPUR_MIN_KM = 2;
/** V-AW-22 (`set`): no OSM carriageway of the motorway's number within `UNBUILT_MAX_M` for this long and no station on it
 *  ⇒ not built (yet); sampled every `UNBUILT_STEP_KM`. */
export const UNBUILT_MIN_KM = 5, UNBUILT_STEP_KM = 0.5, UNBUILT_MAX_M = 300;
/**
 * AF-2 (`set`). A stretch of main carriageway farther than `GAPLESS_COVER_KM` from every corridor of its number becomes a
 * section of its own from `GAPLESS_MIN_KM` (below it come fragments at junctions); a motorway that would have no
 * corridor at all gets its longest stretch from `GAPLESS_ONLY_MIN_KM` (A 831: 1,9 km). Stretches are joined across
 * breaks of the axis up to `GAPLESS_JOIN_KM` — far less than `GAP_KM`, so a stub beside the road never becomes a
 * corner of it. A new section starts up to `GAPLESS_ATTACH_KM` inside the covered ground (no hole in the drawn line).
 * With the OSM test, a section with no carriageway of its number on `GAPLESS_UNBUILT_SHARE` of its length or more is
 * not built.
 */
export const GAPLESS_MIN_KM = 2, GAPLESS_ONLY_MIN_KM = 0.5, GAPLESS_COVER_KM = 0.3, GAPLESS_JOIN_KM = 0.5, GAPLESS_ATTACH_KM = 0.3, GAPLESS_UNBUILT_SHARE = 0.5;
/** Vertex spacing of the axis while it is clipped and cleaned (`set`): the loop removal needs vertices closer than `LOOP_NEAR_KM`. */
const GAPLESS_STEP_KM = 0.05;
/** DLM250 `zus` (Zustand): 2100 = außer Betrieb/stillgelegt, 4000 = im Bau. */
export const AXIS_NOT_IN_SERVICE = Object.freeze([2100, 4000]);
/** DLM250 `bemerkung` of a ramp (7 952 of 22 161 motorway features, 04.10.2026). */
export const AXIS_RAMP_NOTE = 'Auffahrt/Abfahrt';

const kmBetween = (a, b) => {
  const kx = 111.2 * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 111.2);
};

/** All motorway axes (Widmung 1301), paged, cached as one GeoJSON. */
export async function fetchMotorwayAxes(cacheFile) {
  if (cacheFile && existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, 'utf8'));
  const features = [];
  for (let start = 0; ; start += 5000) {
    const url = `${WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=dlm250:objart_42003_l&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326&COUNT=5000&STARTINDEX=${start}&SORTBY=objid&CQL_FILTER=${encodeURIComponent("wdm='1301'")}`;
    const r = await fetch(url, { headers: { 'user-agent': UA } });
    if (!r.ok) throw new Error(`DLM250 WFS: HTTP ${r.status}`);
    const j = await r.json();
    features.push(...j.features);
    if (j.features.length < 5000) break;
  }
  const fc = { type: 'FeatureCollection', fetchedAt: new Date().toISOString(), features };
  if (cacheFile) { mkdirSync(dirname(cacheFile), { recursive: true }); writeFileSync(cacheFile, JSON.stringify(fc)); }
  return fc;
}

/** Road numbers a feature carries (`bez` "A8" or "A8;A93"). */
export const roadsOf = (f) => String(f.properties?.bez ?? '').split(/[#;,/ ]+/).map((s) => s.trim().toUpperCase()).filter((s) => /^A\d{1,3}$/.test(s));

/** Road numbers with the letter suffix the DLM250 carries (`A64a` → `A64A`) — the gapless build and its gate. */
export const axisRoadsOf = (f) => String(f.properties?.bez ?? '').split(/[#;,/ ]+/).map((s) => s.trim().toUpperCase()).filter((s) => /^A\d{1,3}[A-Z]?$/.test(s));
export const axisIsRamp = (f) => f.properties?.bemerkung === AXIS_RAMP_NOTE;
export const axisInService = (f) => !AXIS_NOT_IN_SERVICE.includes(Number(f.properties?.zus));
/** „A 8“, „A 64a“. */
const shieldOf = (road) => road.replace(/^A(\d+)([A-Z]?)$/, (_, n, l) => `A ${n}${l.toLowerCase()}`);

function lines(f) {
  const g = f.geometry;
  if (!g) return [];
  return g.type === 'MultiLineString' ? g.coordinates : g.type === 'LineString' ? [g.coordinates] : [];
}

/** Segments → chains: joins ends closer than JOIN_M, greedily, both orientations. */
export function chain(segments) {
  const segs = segments.filter((s) => s.length >= 2).map((s) => s.map((p) => [p[0], p[1]]));
  const used = new Array(segs.length).fill(false);
  const chains = [];
  const close = (a, b) => kmBetween(a, b) * 1000 <= JOIN_M;
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let c = segs[i].slice();
    let grew = true;
    while (grew) {
      grew = false;
      for (let j = 0; j < segs.length; j++) {
        if (used[j]) continue;
        const s = segs[j];
        if (close(c.at(-1), s[0])) c = c.concat(s.slice(1));
        else if (close(c.at(-1), s.at(-1))) c = c.concat(s.slice(0, -1).reverse());
        else if (close(c[0], s.at(-1))) c = s.slice(0, -1).concat(c);
        else if (close(c[0], s[0])) c = s.slice(1).reverse().concat(c);
        else continue;
        used[j] = true;
        grew = true;
      }
    }
    chains.push(c);
  }
  return chains;
}

const lengthKm = (c) => { let s = 0; for (let i = 1; i < c.length; i++) s += kmBetween(c[i - 1], c[i]); return s; };

/** Chains → sections: the longest chain grows by chains whose end lies within GAP_KM of its ends. */
export function sections(chains, minKm = 5, gapKm = GAP_KM) {
  const left = chains.slice().sort((a, b) => lengthKm(b) - lengthKm(a));
  const out = [];
  while (left.length) {
    let c = left.shift();
    let grew = true;
    while (grew) {
      grew = false;
      let best = null;
      for (let i = 0; i < left.length; i++) {
        const s = left[i];
        const opts = [
          [kmBetween(c.at(-1), s[0]), () => c.concat(s)],
          [kmBetween(c.at(-1), s.at(-1)), () => c.concat(s.slice().reverse())],
          [kmBetween(c[0], s.at(-1)), () => s.concat(c)],
          [kmBetween(c[0], s[0]), () => s.slice().reverse().concat(c)],
        ];
        for (const [d, f] of opts) if (d <= gapKm && (!best || d < best.d)) best = { d, f, i };
      }
      if (best) { c = best.f(); left.splice(best.i, 1); grew = true; }
    }
    out.push(c);
  }
  // Short leftovers (ramps, junction stubs) are not corridors.
  return out.filter((c) => lengthKm(c) >= minKm);
}

/**
 * Cleans a chained axis (review finding #4: corridor km inflated by 15–22 %, A 8 München → Salzburg 161 instead of
 * ≈ 128 km). Greedy chaining (≤ 60 m) also follows interchange ramps, cloverleaf loops and — on motorways with two
 * carriageway lines — runs out on one and back on the other. Whenever the path comes back within `nearKm` of a vertex
 * at least `minLoopKm` earlier, a look-ahead decides:
 *   - retrace: the next `LOOKAHEAD_KM` keep running over visited ground (opposite carriageway, ramp back) ⇒ the
 *     returning vertices are dropped, the line keeps its outbound part;
 *   - loop: the path leaves the visited ground again (cloverleaf, spur) ⇒ everything since that vertex is cut.
 * A grid of ≈ 70 m cells keeps it near linear.
 *
 * V-AW-16: `cuts` (optional array) collects every piece cut away — a spur of the motorway that the chain ran out on and
 * back is one of them; `buildCorridors` keeps those ≥ `SPUR_MIN_KM` as sections of their own. Without it: unchanged.
 */
export function removeLoops(c, nearKm = LOOP_NEAR_KM, minLoopKm = LOOP_MIN_KM, cuts = null) {
  const out = [], cum = [];
  const grid = new Map();
  const key = (cx, cy) => `${cx}:${cy}`;
  const cellOf = (p) => [Math.floor(p[0] / 0.001), Math.floor(p[1] / 0.00065)];
  const push = (p) => {
    cum.push(out.length ? cum[out.length - 1] + kmBetween(out[out.length - 1], p) : 0);
    out.push(p);
    const [cx, cy] = cellOf(p);
    const k = key(cx, cy);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push([out.length - 1, p]);
  };
  /** Earliest kept vertex within `nearKm` of p that lies at least `minLoopKm` behind `along`; -1 when none. */
  const revisit = (p, along) => {
    const [cx, cy] = cellOf(p);
    let hit = -1;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const [j, q] of grid.get(key(cx + dx, cy + dy)) ?? []) {
        if (out[j] !== q || (hit >= 0 && j >= hit)) continue;         // stale entry (cut away) or not earlier
        if (along - cum[j] >= minLoopKm && kmBetween(q, p) <= nearKm) hit = j;
      }
    }
    return hit;
  };
  /**
   * After a retrace the path leaves visited ground again — usually where the chain began (it started mid-way, ran to
   * an end, came back on the other carriageway and goes on past its start). Then the kept line is turned round so it
   * ends at its start and the path continues from there; elsewhere the dead-end branch is cut.
   */
  const reattach = (p) => {
    if (kmBetween(out[out.length - 1], p) <= REATTACH_KM) return;
    let j = -1, best = REATTACH_KM;
    for (let k = 0; k < out.length; k++) { const d = kmBetween(out[k], p); if (d < best) { best = d; j = k; } }
    if (j < 0) return;                                                  // a real gap: keep going
    if (cum[j] <= REATTACH_KM) {
      const rev = out.slice().reverse();
      out.length = 0; cum.length = 0; grid.clear();
      for (const q of rev) push(q);
    } else { cuts?.push(out.slice(j)); out.length = j + 1; cum.length = j + 1; }
  };
  let retracing = false;
  for (let i = 0; i < c.length; i++) {
    const p = c[i];
    if (!out.length) { push(p); continue; }
    const along = cum[out.length - 1] + kmBetween(out[out.length - 1], p);
    const j = revisit(p, along);
    if (j < 0) {
      if (retracing) { reattach(p); retracing = false; }
      push(p);
      continue;
    }
    let n = 0, near = 0, d = 0;
    for (let k = i + 1; k < c.length && d < LOOKAHEAD_KM; k++) {
      d += kmBetween(c[k - 1], c[k]);
      n++;
      if (revisit(c[k], along + d) >= 0) near++;
    }
    if (n === 0 || near / n >= RETRACE_SHARE) { retracing = true; continue; }   // retrace (or chain ends on visited ground): drop
    if (retracing) { reattach(p); retracing = false; push(p); continue; }       // a retrace ends: re-anchor, never cut the outbound
    cuts?.push(out.slice(j)); out.length = j + 1; cum.length = j + 1;  // loop: cut back to where it began
    push(p);
  }
  return out;
}

/** Douglas-Peucker in km. */
export function simplify(c, tolKm = SIMPLIFY_KM) {
  if (c.length < 3) return c;
  const keep = new Uint8Array(c.length);
  keep[0] = keep[c.length - 1] = 1;
  const stack = [[0, c.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distToSegKm(c[i], c[a], c[b]).d;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tolKm) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return c.filter((_, i) => keep[i]);
}

function distToSegKm(p, a, b) {
  const kx = 111.2 * Math.cos((p[1] * Math.PI) / 180), ky = 111.2;
  const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky, bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
  return { d: Math.hypot(ax + t * dx, ay + t * dy), t };
}

/** Projects (lon, lat) onto the polyline: { km along, offKm }. */
export function project(line, cum, p) {
  let best = { offKm: Infinity, km: 0 };
  for (let i = 1; i < line.length; i++) {
    const { d, t } = distToSegKm(p, line[i - 1], line[i]);
    if (d < best.offKm) best = { offKm: d, km: cum[i - 1] + t * (cum[i] - cum[i - 1]) };
  }
  return best;
}

const cumKm = (line) => { const c = [0]; for (let i = 1; i < line.length; i++) c.push(c[i - 1] + kmBetween(line[i - 1], line[i])); return c; };

function nearestPlace(places, p, minPop, maxKm) {
  let best = null;
  for (const pl of places) {
    if (pl[5] < minPop) continue;
    const d = kmBetween([pl[1], pl[0]], p);
    if (d <= maxKm && (!best || d < best.d || (d < best.d + 5 && pl[5] > best.pl[5] * 3))) best = { d, pl };
  }
  return best?.pl ?? null;
}

/** Border marker when a section end lies near the DE outline and a neighbour country's big town is close. */
function borderAt(end, deRings, places) {
  let min = Infinity;
  for (const r of deRings) for (let i = 1; i < r.length; i++) min = Math.min(min, distToSegKm(end, r[i - 1], r[i]).d);
  if (min > 3) return null;
  const pl = places.filter((x) => x[4] !== 'DE' && x[5] >= 1500).map((x) => ({ x, d: kmBetween([x[1], x[0]], end) })).sort((a, b) => a.d - b.d)[0];
  return pl && pl.d < 40 ? pl.x[4] : 'X';
}

/**
 * `spurs` (V-AW-16) and `isBuilt(p, road)` (V-AW-22, OSM carriageway test) are off when not given: the result is then
 * byte-equal to the build before (verify:road-contract K6).
 *
 * `gapless` (AF-2): after the corridors of a motorway, the stretches of its main carriageway that none of them covers
 * become sections of their own (`gapSections`), numbered behind the existing ones; `gap: true` marks a section without
 * a station. `pin` (only with `gapless`): the corridors of a published file — they ARE the corridors of their
 * motorways, taken over unchanged (identifier, line, km and stations are in shared links, in `where.json`, in the points
 * file and in the archive); nothing of them is rebuilt. `report` (optional object) receives what did not become a
 * section: `rest` (too short), `skipped` (no carriageway), `rampOnly` (numbers that exist only as ramps) and
 * `unassigned` (stations on a pinned corridor that does not list them).
 */
export function buildCorridors({ axes, stations, obsPoints, places, deRings, roads, spurs = false, isBuilt = null, gapless = false, pin = null, report = null }) {
  const byRoad = new Map();
  for (const f of axes.features) for (const r of roadsOf(f)) {
    if (roads && !roads.includes(r)) continue;
    if (!byRoad.has(r)) byRoad.set(r, []);
    byRoad.get(r).push(...lines(f));
  }
  // AF-2: the material of the new sections — main carriageway in service, never a ramp.
  const mainByRoad = new Map(), rampRoads = new Set();
  if (gapless) for (const f of axes.features) for (const r of axisRoadsOf(f)) {
    if (roads && !roads.includes(r)) continue;
    if (axisIsRamp(f)) { rampRoads.add(r); continue; }
    if (!axisInService(f)) continue;
    if (!mainByRoad.has(r)) mainByRoad.set(r, []);
    mainByRoad.get(r).push(...lines(f));
  }
  const pinned = gapless && pin ? pin : null;
  if (report) Object.assign(report, { rest: [], skipped: [], rampOnly: [], unassigned: [] });
  // Station positions: bulletin positions from a recent slot win over the 2020 catalogue (AW-0: p99 10 km apart).
  const pos = new Map();
  for (const [id, s] of Object.entries(stations ?? {})) if (s.lat != null && s.lon != null && s.kind === 'A') pos.set(id, { lon: s.lon, lat: s.lat, road: s.road, dir: s.dir, n: s.n });
  for (const p of obsPoints ?? []) if (p.kind === 'A' && p.road) pos.set(p.id, { lon: p.lon, lat: p.lat, road: p.road, dir: p.dir ?? pos.get(p.id)?.dir ?? null, n: p.n });

  const corridors = [];
  const num = (r) => parseInt(r.slice(1), 10);
  const roadList = new Set(byRoad.keys());
  if (gapless) { for (const r of mainByRoad.keys()) roadList.add(r); for (const c of pinned ?? []) if (!roads || roads.includes(c.road)) roadList.add(c.road); }
  for (const road of [...roadList].sort((a, b) => num(a) - num(b) || (a < b ? -1 : a > b ? 1 : 0))) {
    const cuts = [];
    // The corridors of this motorway before the gap sections: the pinned ones, else the build as before.
    const own = pinned ? pinned.filter((c) => c.road === road) : [];
    const secs = pinned ? [] : sections(chain(byRoad.get(road) ?? [])).map((c) => simplify(removeLoops(c, LOOP_NEAR_KM, LOOP_MIN_KM, spurs ? cuts : null)));
    const built = [];
    const stationsOn = (line, cum, ok) => {
      const st = [];
      for (const [sid, s] of pos) {
        if (s.road !== road || !ok(sid)) continue;
        const pr = project(line, cum, [s.lon, s.lat]);
        if (pr.offKm <= SNAP_KM) st.push({ id: sid, km: Math.round(pr.km * 10) / 10, dir: s.dir ?? null });
      }
      return st.sort((a, b) => a.km - b.km);
    };
    const make = (line0, ok, extra = {}) => {
      // Orientation: odd numbers north → south, even numbers west → east.
      let line = line0;
      const odd = num(road) % 2 === 1;
      if (odd ? line[0][1] < line.at(-1)[1] : line[0][0] > line.at(-1)[0]) line = line.slice().reverse();
      let cum = cumKm(line);
      let st = stationsOn(line, cum, ok);
      // V-AW-22: stretches the DLM250 lists as motorway but OSM has no carriageway of this number for ≥ UNBUILT_MIN_KM and
      // no station measures on: at an end they are cut off, inside the section they are named (`unbuilt`, band + points).
      let unbuilt = [];
      if (isBuilt) {
        const gaps = unbuiltRuns(line, cum.at(-1), (p) => isBuilt(p, road)).filter(([a, b]) => b - a >= UNBUILT_MIN_KM && !st.some((s) => s.km >= a - 0.5 && s.km <= b + 0.5));
        const len0 = cum.at(-1);
        const head = gaps.find(([a]) => a <= UNBUILT_STEP_KM), tail = gaps.find(([, b]) => b >= len0 - UNBUILT_STEP_KM);
        if (head || tail) {
          line = sliceLine(line, cum, head ? head[1] : 0, tail ? tail[0] : len0);
          cum = cumKm(line);
          st = stationsOn(line, cum, ok);
        }
        const shift = head ? head[1] : 0;
        unbuilt = gaps.filter((g) => g !== head && g !== tail).map(([a, b]) => [Math.round((a - shift) * 10) / 10, Math.round((b - shift) * 10) / 10]);
        if (head || tail) extra = { ...extra, trimmedKm: Math.round(((head ? head[1] - head[0] : 0) + (tail ? tail[1] - tail[0] : 0)) * 10) / 10 };
      }
      const len = cum.at(-1);
      const borderStart = borderAt(line[0], deRings, places);
      const borderEnd = borderAt(line.at(-1), deRings, places);
      // A corridor end at the border is named after the city across it (design: „München → Salzburg").
      const endName = (p, border) => (border && border !== 'X' ? nearestPlace(places.filter((x) => x[4] === border), p, 20000, 15) : null)
        ?? nearestPlace(places, p, 5000, 12) ?? nearestPlace(places, p, 20000, 30) ?? nearestPlace(places, p, 1500, 30);
      const a = endName(line[0], borderStart);
      const b = endName(line.at(-1), borderEnd);
      const towns = [];
      for (const pl of places) {
        if (pl[4] !== 'DE' || pl[5] < 50000) continue;
        const pr = project(line, cum, [pl[1], pl[0]]);
        if (pr.offKm <= 8) towns.push([Math.round(pr.km), pl[2]]);
      }
      if (a) towns.push([0, a[2]]);
      if (b) towns.push([Math.round(len), b[2]]);
      const seen = new Set();
      const townsOut = towns.sort((x, y) => x[0] - y[0]).filter((t) => (seen.has(t[1]) ? false : (seen.add(t[1]), true)));
      return {
        id: '', road, shields: [shieldOf(road)],
        // Loop or short section with both ends at the same town: „A 1 bei Buchholz" instead of „Buchholz → Buchholz".
        title: a && b ? (a[2] === b[2] ? `${shieldOf(road)} bei ${a[2]}` : `${a[2]} → ${b[2]}`) : road,
        from: a?.[2] ?? null, to: b?.[2] ?? null,
        lengthKm: Math.round(len * 10) / 10,
        countries: ['DE'],
        borders: [
          ...(borderStart && borderStart !== 'X' ? [{ km: 0, country: borderStart }] : []),
          ...(borderEnd && borderEnd !== 'X' ? [{ km: Math.round(len * 10) / 10, country: borderEnd }] : []),
        ],
        // [lon, lat] with 5 decimals (≈ 1 m), oriented as above.
        line: line.map((p) => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]),
        towns: townsOut,
        stations: st,
        forecastPoints: [],
        ...(unbuilt.length ? { unbuilt } : {}),
        ...extra,
      };
    };
    for (const line0 of secs) built.push(make(line0, () => true));
    // Only sections with at least one station are corridors; ids by station count (`a8` = the busiest section,
    // then `a8-2`, …) so `/autobahnwetter/a8` opens the section with the most measurements.
    const regular = built.filter((c) => c.stations.length > 0).sort((x, y) => y.stations.length - x.stations.length || y.lengthKm - x.lengthKm);
    regular.forEach((c, i) => { c.id = `${road.toLowerCase()}${i ? `-${i + 1}` : ''}`; own.push(c); });
    // V-AW-16: spurs the loop removal cut away (≥ SPUR_MIN_KM) become sections of their own when a station of this
    // motorway that no regular section took lies on one. Numbered AFTER the regular sections: their ids stay stable.
    if (spurs && !pinned) {
      const taken = new Set(regular.flatMap((c) => c.stations.map((s) => s.id)));
      const byPiece = new Map();
      for (const [sid, s] of pos) {
        if (s.road !== road || taken.has(sid)) continue;
        let best = null;
        for (const piece of cuts) {
          if (lengthKm(piece) < SPUR_MIN_KM) continue;
          const line = simplify(piece);
          const pr = project(line, cumKm(line), [s.lon, s.lat]);
          if (pr.offKm <= SNAP_KM && (!best || pr.offKm < best.off)) best = { piece, line, off: pr.offKm };
        }
        if (!best) continue;
        if (!byPiece.has(best.piece)) byPiece.set(best.piece, { line: best.line, ids: new Set() });
        byPiece.get(best.piece).ids.add(sid);
      }
      [...byPiece.values()].map(({ line, ids }) => make(line, (sid) => ids.has(sid), { spur: true }))
        .filter((c) => c.stations.length > 0)
        .sort((x, y) => y.stations.length - x.stations.length || y.lengthKm - x.lengthKm)
        .forEach((c, i) => { c.id = `${road.toLowerCase()}-${regular.length + i + 1}`; own.push(c); });
    }
    corridors.push(...own);
    if (gapless) corridors.push(...gapSections({ road, own, segments: mainByRoad.get(road) ?? [], pos, make, isBuilt, report }));
  }
  if (report) report.rampOnly = [...rampRoads].filter((r) => !mainByRoad.has(r) && !corridors.some((c) => c.road === r)).sort((a, b) => num(a) - num(b));
  return corridors;
}

/** Points every `GAPLESS_STEP_KM` along a chain (its vertices stay). */
function densify(c) {
  const out = [c[0]];
  for (let i = 1; i < c.length; i++) {
    const n = Math.max(1, Math.ceil(kmBetween(c[i - 1], c[i]) / GAPLESS_STEP_KM));
    for (let k = 1; k <= n; k++) out.push(k === n ? c[i] : [c[i - 1][0] + (c[i][0] - c[i - 1][0]) * k / n, c[i - 1][1] + (c[i][1] - c[i - 1][1]) * k / n]);
  }
  return out;
}

/** Segments of lines in cells of 0,01° — `dist(p)` is exact up to ≈ 0,65 km (three cells), `Infinity` beyond. */
function lineGrid() {
  const CELL = 0.01, cells = new Map();
  return {
    add(line) {
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i], seg = [a, b];
        const x0 = Math.floor(Math.min(a[0], b[0]) / CELL), x1 = Math.floor(Math.max(a[0], b[0]) / CELL);
        const y0 = Math.floor(Math.min(a[1], b[1]) / CELL), y1 = Math.floor(Math.max(a[1], b[1]) / CELL);
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
          const k = `${x}:${y}`;
          if (!cells.has(k)) cells.set(k, []);
          cells.get(k).push(seg);
        }
      }
    },
    dist(p) {
      const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL);
      let best = Infinity;
      for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (const [a, b] of cells.get(`${x}:${y}`) ?? []) {
        const d = distToSegKm(p, a, b).d;
        if (d < best) best = d;
      }
      return best;
    },
  };
}

/** The parts of chain `c` farther than `GAPLESS_COVER_KM` from the lines in `grid`, each with up to `GAPLESS_ATTACH_KM` of covered lead-in and run-out
 *  (never the open ground of the neighbouring part: two parts must not contain each other, or clipping them again never ends). */
function openRuns(c, grid) {
  const open = c.map((p) => grid.dist(p) > GAPLESS_COVER_KM);
  const runs = [];
  for (let i = 0; i < c.length; i++) {
    if (!open[i]) continue;
    let j = i;
    while (j + 1 < c.length && open[j + 1]) j++;
    let a = i, b = j;
    for (let d = 0; a > 0 && !open[a - 1] && (d += kmBetween(c[a - 1], c[a])) <= GAPLESS_ATTACH_KM + 1e-9;) a--;
    for (let d = 0; b + 1 < c.length && !open[b + 1] && (d += kmBetween(c[b], c[b + 1])) <= GAPLESS_ATTACH_KM + 1e-9;) b++;
    if (b > a) runs.push(c.slice(a, b + 1));
    i = j;
  }
  return runs;
}

/**
 * AF-2: the sections of motorway `road` that none of its corridors `own` covers. The longest open stretch first; each
 * accepted section counts as covered ground for the next ones (a parallel line or a stretch cut out of a loop never
 * doubles one). A station no corridor lists goes to the new section it lies nearest to — unless a corridor of `own` is
 * nearer still: then it stays unassigned and is named. Ids continue behind the highest index of `own`: by station
 * count, then length.
 */
function gapSections({ road, own, segments, pos, make, isBuilt, report }) {
  const grid = lineGrid();
  for (const c of own) grid.add(c.line);
  const taken = new Set(own.flatMap((c) => c.stations.map((s) => s.id)));
  // The queue is sorted after every change — the length of a run is measured once.
  const lengths = new WeakMap();
  const lenOf = (c) => { let l = lengths.get(c); if (l == null) { l = lengthKm(c); lengths.set(c, l); } return l; };
  const byLength = (a, b) => lenOf(b) - lenOf(a);
  const queue = sections(chain(segments).map(densify).flatMap((c) => openRuns(c, grid)), 0, GAPLESS_JOIN_KM).sort(byLength);
  const accepted = [], rest = [];
  /** true = dealt with (a line for a section, or named as skipped); false = too short. */
  const tryPiece = (line, minKm) => {
    const len = lengthKm(line);
    if (len < minKm) return false;
    if (isBuilt) {
      const gone = unbuiltRuns(line, len, (p) => isBuilt(p, road)).reduce((s, [a, b]) => s + (b - a), 0);
      if (gone >= len * GAPLESS_UNBUILT_SHARE) { report?.skipped.push({ road, km: Math.round(len * 10) / 10, why: 'noCarriageway', at: line[0].map((x) => Math.round(x * 1e4) / 1e4) }); return true; }
    }
    accepted.push(line);
    grid.add(line);
    return true;
  };
  for (let guard = 0; queue.length; guard++) {
    if (guard > 10_000) throw new Error(`gapSections ${road}: the queue does not empty (${queue.length} stretches left)`);
    const c = queue.shift();
    // Ground an earlier section took in the meantime is clipped away; what is left queues again.
    const parts = openRuns(c, grid);
    if (!(parts.length === 1 && parts[0].length === c.length)) { queue.push(...parts); queue.sort(byLength); continue; }
    const cuts = [];
    const line = simplify(removeLoops(c, LOOP_NEAR_KM, LOOP_MIN_KM, cuts));
    if (cuts.length) { queue.push(...cuts.filter((k) => k.length >= 2)); queue.sort(byLength); }
    if (!tryPiece(line, GAPLESS_MIN_KM)) rest.push(line);
  }
  // A motorway without any corridor gets its longest stretch even below the minimum.
  if (!own.length && !accepted.length) {
    rest.sort(byLength);
    const i = rest.findIndex((l) => tryPiece(l, GAPLESS_ONLY_MIN_KM));
    if (i >= 0) rest.splice(i, 1);
  }
  for (const l of rest) report?.rest.push({ road, km: Math.round(lengthKm(l) * 100) / 100, at: l[0].map((x) => Math.round(x * 1e4) / 1e4) });
  // Stations: each one no corridor lists goes to the nearest line — a new one takes it, an existing one leaves it named.
  const all = [...own.map((c) => ({ line: c.line, cum: cumKm(c.line), ids: null })), ...accepted.map((line) => ({ line, cum: cumKm(line), ids: new Set() }))];
  for (const [sid, s] of pos) {
    if (s.road !== road || taken.has(sid)) continue;
    let best = null;
    for (const l of all) { const off = project(l.line, l.cum, [s.lon, s.lat]).offKm; if (off <= SNAP_KM && (!best || off < best.off)) best = { off, l }; }
    if (!best) continue;
    if (best.l.ids) best.l.ids.add(sid); else report?.unassigned.push(sid);
  }
  const pieces = all.filter((l) => l.ids).map(({ line, ids }) => {
    const c = make(line, (sid) => ids.has(sid));
    if (!c.stations.length) c.gap = true;
    return c;
  });
  const low = road.toLowerCase();
  let next = Math.max(0, ...own.map((c) => (c.id === low ? 1 : Number(c.id.slice(low.length + 1)) || 0))) + 1;
  pieces.sort((x, y) => y.stations.length - x.stations.length || y.lengthKm - x.lengthKm || x.line[0][0] - y.line[0][0] || x.line[0][1] - y.line[0][1]);
  for (const c of pieces) { c.id = next === 1 ? low : `${low}-${next}`; next++; }
  return pieces;
}


/** V-AW-22: km runs along `line` (sampled every UNBUILT_STEP_KM) where `built(p)` is false. */
export function unbuiltRuns(line, len, built) {
  const runs = [];
  let cur = null;
  for (let k = 0; k <= len + 1e-9; k += UNBUILT_STEP_KM) {
    const p = pointAtKm(line, k);
    if (!built(p)) { if (!cur) cur = [k, k]; cur[1] = k; } else if (cur) { runs.push(cur); cur = null; }
  }
  if (cur) runs.push(cur);
  return runs.map(([a, b]) => [Math.round(a * 10) / 10, Math.round(Math.min(len, b) * 10) / 10]);
}

function pointAtKm(line, km) {
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const d = kmBetween(line[i - 1], line[i]);
    if (acc + d >= km && d > 0) { const t = Math.max(0, (km - acc) / d); return [line[i - 1][0] + t * (line[i][0] - line[i - 1][0]), line[i - 1][1] + t * (line[i][1] - line[i - 1][1])]; }
    acc += d;
  }
  return line.at(-1);
}

/** The part of `line` between km `a` and `b` (vertices inside plus the interpolated ends). */
export function sliceLine(line, cum, a, b) {
  const out = [pointAtKm(line, a)];
  for (let i = 0; i < line.length; i++) if (cum[i] > a && cum[i] < b) out.push(line[i]);
  out.push(pointAtKm(line, b));
  return out;
}

async function main() {
  const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const out = arg('out');
  if (!out) { console.error('usage: build-corridors.mjs --out=<file> [--stations=…] [--obs=…] [--cache=…] [--roads=A8,…]'); process.exit(2); }
  const axes = await fetchMotorwayAxes(arg('cache') ? join(arg('cache'), 'dlm250-motorways.json') : null);
  const stations = arg('stations') ? JSON.parse(readFileSync(arg('stations'), 'utf8')).stations : {};
  const obsPoints = arg('obs') ? JSON.parse(readFileSync(arg('obs'), 'utf8')).points : [];
  const places = JSON.parse(readFileSync(join(HERE, '..', '..', 'public', 'fire', 'places-dach.json'), 'utf8')).places;
  // V-AW-16: spurs on unless --no-spurs. V-AW-22: with --osm=<Overpass cache of build-fc-points> unbuilt stretches are cut
  // off or named (run with the TS loader then: the carriageway test comes from build-fc-points.mjs).
  let isBuilt = null;
  if (arg('osm')) {
    const F = await import('./build-fc-points.mjs');
    const index = F.buildOsmIndex(JSON.parse(readFileSync(arg('osm'), 'utf8')));
    isBuilt = (p, road) => { const hit = F.nearestCarriageway(index, p, road); return !!hit && !hit.other && hit.d <= UNBUILT_MAX_M; };
  }
  // AF-2: --gapless adds a section for every stretch no corridor covers; --pin=<published corridors.json> keeps the
  // published corridors as they are.
  const gapless = process.argv.includes('--gapless');
  const pin = arg('pin') ? JSON.parse(readFileSync(arg('pin'), 'utf8')).corridors : null;
  if (pin && !gapless) { console.error('--pin gilt nur mit --gapless'); process.exit(2); }
  if (gapless && !pin) console.error('Hinweis: ohne --pin=<veröffentlichte corridors.json> werden die bestehenden Abschnitte neu gebaut — ihre Kennungen hängen dann an den Stationszahlen der heutigen Meldung (V-AF-4).');
  const report = {};
  const corridors = buildCorridors({ axes, stations, obsPoints, places, deRings: loadDeRings(), roads: arg('roads')?.split(','), spurs: !process.argv.includes('--no-spurs'), isBuilt, gapless, pin, report });
  const year = (axes.fetchedAt ?? new Date().toISOString()).slice(0, 4);
  const file = {
    schema: 1, product: 'road-corridors', builtAt: new Date().toISOString(),
    sources: [
      { what: 'Autobahnachsen DE', name: 'BKG DLM250 (AX_Strassenachse, Widmung 1301), WFS wfs_dlm250', license: 'dl-de/by-2.0', attribution: `© GeoBasis-DE / BKG (${year})` },
      { what: 'Ortsnamen', name: 'GeoNames', license: 'CC BY 4.0', attribution: 'GeoNames (geonames.org)' },
      ...(isBuilt ? [{ what: 'Pruefung, ob eine Strecke gebaut ist (V-AW-22)', name: 'OpenStreetMap (highway=motorway, highway=trunk mit Autobahn-Nummer)', license: 'ODbL', attribution: '© OpenStreetMap-Mitwirkende' }] : []),
    ],
    note: `Korridor-km ist eine eigene, durchgehende Achse je Abschnitt (Ausrichtung: ungerade Nummern Nord → Süd, gerade West → Ost), nicht der amtliche Streckenkilometer. AT/CH-Fortsetzungen und Prognosepunkte folgen mit AW-6.${isBuilt ? ` Strecken, die das DLM250 als Autobahn führt, für die OpenStreetMap aber auf mindestens ${UNBUILT_MIN_KM} km keine Fahrbahn dieser Nummer kennt und an denen keine Messstelle liegt, sind am Ende abgeschnitten (trimmedKm) oder innen als unbuilt [von, bis km] benannt (V-AW-22).` : ''}${corridors.some((c) => c.spur) ? ' Abschnitte mit spur: true sind Stichäste einer Autobahn mit eigener Messstelle (V-AW-16), nach den übrigen Abschnitten nummeriert.' : ''}${corridors.some((c) => c.gap) ? ` Abschnitte mit gap: true sind Teilstücke ohne Messstelle (ab ${GAPLESS_MIN_KM} km Hauptfahrbahn in Betrieb, die kein anderer Abschnitt deckt): dort gibt es nur die Prognose.` : ''}`,
    corridors,
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(`${out}.tmp`, JSON.stringify(file) + '\n');
  renameSync(`${out}.tmp`, out);
  const nSt = corridors.reduce((a, c) => a + c.stations.length, 0);
  console.log(JSON.stringify({
    ok: true, corridors: corridors.length, stations: nSt, bytes: JSON.stringify(file).length,
    ...(gapless ? { roads: new Set(corridors.map((c) => c.road)).size, gap: corridors.filter((c) => c.gap).length, pinned: pin?.length ?? 0, restKm: Math.round(report.rest.reduce((s, r) => s + r.km, 0)), skipped: report.skipped, rampOnly: report.rampOnly, unassigned: report.unassigned } : {}),
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.stack ?? e.message); process.exit(1); });
}
