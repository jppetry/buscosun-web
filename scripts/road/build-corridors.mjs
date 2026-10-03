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
 *     [--cache=<dir>] [--roads=A8,A93]
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
export function sections(chains) {
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
        for (const [d, f] of opts) if (d <= GAP_KM && (!best || d < best.d)) best = { d, f, i };
      }
      if (best) { c = best.f(); left.splice(best.i, 1); grew = true; }
    }
    out.push(c);
  }
  // Short leftovers (ramps, junction stubs) are not corridors.
  return out.filter((c) => lengthKm(c) >= 5);
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
 */
export function removeLoops(c, nearKm = LOOP_NEAR_KM, minLoopKm = LOOP_MIN_KM) {
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
    } else { out.length = j + 1; cum.length = j + 1; }
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
    out.length = j + 1; cum.length = j + 1;                             // loop: cut back to where it began
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

export function buildCorridors({ axes, stations, obsPoints, places, deRings, roads }) {
  const byRoad = new Map();
  for (const f of axes.features) for (const r of roadsOf(f)) {
    if (roads && !roads.includes(r)) continue;
    if (!byRoad.has(r)) byRoad.set(r, []);
    byRoad.get(r).push(...lines(f));
  }
  // Station positions: bulletin positions from a recent slot win over the 2020 catalogue (AW-0: p99 10 km apart).
  const pos = new Map();
  for (const [id, s] of Object.entries(stations ?? {})) if (s.lat != null && s.lon != null && s.kind === 'A') pos.set(id, { lon: s.lon, lat: s.lat, road: s.road, dir: s.dir, n: s.n });
  for (const p of obsPoints ?? []) if (p.kind === 'A' && p.road) pos.set(p.id, { lon: p.lon, lat: p.lat, road: p.road, dir: p.dir ?? pos.get(p.id)?.dir ?? null, n: p.n });

  const corridors = [];
  const num = (r) => Number(r.slice(1));
  for (const road of [...byRoad.keys()].sort((a, b) => num(a) - num(b))) {
    const secs = sections(chain(byRoad.get(road))).map((c) => simplify(removeLoops(c)));
    const built = [];
    secs.forEach((line0) => {
      // Orientation: odd numbers north → south, even numbers west → east.
      let line = line0;
      const odd = num(road) % 2 === 1;
      if (odd ? line[0][1] < line.at(-1)[1] : line[0][0] > line.at(-1)[0]) line = line.slice().reverse();
      const cum = cumKm(line);
      const len = cum.at(-1);
      const st = [];
      for (const [sid, s] of pos) {
        if (s.road !== road) continue;
        const pr = project(line, cum, [s.lon, s.lat]);
        if (pr.offKm <= SNAP_KM) st.push({ id: sid, km: Math.round(pr.km * 10) / 10, dir: s.dir ?? null });
      }
      st.sort((a, b) => a.km - b.km);
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
      built.push({
        id: '', road, shields: [road.replace(/^A/, 'A ')],
        // Loop or short section with both ends at the same town: „A 1 bei Buchholz" instead of „Buchholz → Buchholz".
        title: a && b ? (a[2] === b[2] ? `${road.replace(/^A/, 'A ')} bei ${a[2]}` : `${a[2]} → ${b[2]}`) : road,
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
      });
    });
    // Only sections with at least one station are corridors; ids by station count (`a8` = the busiest section,
    // then `a8-2`, …) so `/autobahnwetter/a8` opens the section with the most measurements.
    built.filter((c) => c.stations.length > 0)
      .sort((x, y) => y.stations.length - x.stations.length || y.lengthKm - x.lengthKm)
      .forEach((c, i) => { c.id = `${road.toLowerCase()}${i ? `-${i + 1}` : ''}`; corridors.push(c); });
  }
  return corridors;
}

async function main() {
  const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const out = arg('out');
  if (!out) { console.error('usage: build-corridors.mjs --out=<file> [--stations=…] [--obs=…] [--cache=…] [--roads=A8,…]'); process.exit(2); }
  const axes = await fetchMotorwayAxes(arg('cache') ? join(arg('cache'), 'dlm250-motorways.json') : null);
  const stations = arg('stations') ? JSON.parse(readFileSync(arg('stations'), 'utf8')).stations : {};
  const obsPoints = arg('obs') ? JSON.parse(readFileSync(arg('obs'), 'utf8')).points : [];
  const places = JSON.parse(readFileSync(join(HERE, '..', '..', 'public', 'fire', 'places-dach.json'), 'utf8')).places;
  const corridors = buildCorridors({ axes, stations, obsPoints, places, deRings: loadDeRings(), roads: arg('roads')?.split(',') });
  const year = (axes.fetchedAt ?? new Date().toISOString()).slice(0, 4);
  const file = {
    schema: 1, product: 'road-corridors', builtAt: new Date().toISOString(),
    sources: [
      { what: 'Autobahnachsen DE', name: 'BKG DLM250 (AX_Strassenachse, Widmung 1301), WFS wfs_dlm250', license: 'dl-de/by-2.0', attribution: `© GeoBasis-DE / BKG (${year})` },
      { what: 'Ortsnamen', name: 'GeoNames', license: 'CC BY 4.0', attribution: 'GeoNames (geonames.org)' },
    ],
    note: 'Korridor-km ist eine eigene, durchgehende Achse je Abschnitt (Ausrichtung: ungerade Nummern Nord → Süd, gerade West → Ost), nicht der amtliche Streckenkilometer. AT/CH-Fortsetzungen und Prognosepunkte folgen mit AW-6.',
    corridors,
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(`${out}.tmp`, JSON.stringify(file) + '\n');
  renameSync(`${out}.tmp`, out);
  const nSt = corridors.reduce((a, c) => a + c.stations.length, 0);
  console.log(JSON.stringify({ ok: true, corridors: corridors.length, stations: nSt, bytes: JSON.stringify(file).length }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.stack ?? e.message); process.exit(1); });
}
