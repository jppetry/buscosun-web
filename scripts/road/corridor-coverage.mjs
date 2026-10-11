#!/usr/bin/env node
/**
 * AF-2 — Completeness of the corridor catalogue against the DLM250 motorway axes (gate of
 * `audit/autobahn-fusion12-lueckenlos.md` §3 AF-2). Read-only: measures, builds nothing.
 *
 * Every feature line of the axes (Widmung 1301) is sampled every `COVER_STEP_KM`; a sample is
 *   line           ≤ `COVER_LINE_KM` from a corridor line of ITS OWN number,
 *   point          else ≤ `COVER_POINT_KM` from an axis forecast point of its own number (`roadFcAxisKms`, the nominal
 *                  position on the corridor line — the points file snaps it onto the carriageway later),
 *   construction   else the DLM250 itself says "under construction" / "out of service" (`zus` 4000 / 2100),
 *   noCarriageway  else OpenStreetMap has no carriageway of this number within 300 m (V-AW-22; only with `isBuilt`),
 *   open           else — these are the gaps; the gate wants them below 0,5 % and lists them per motorway.
 * `ramp` (DLM250 `bemerkung` "Auffahrt/Abfahrt") is reported separately, never excused.
 *
 * The reverse question — does a corridor line run where there is no axis? — is `offAxis`.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/corridor-coverage.mjs \
 *     --axes=<dlm250-motorways.json> --corridors=<corridors.json> [--osm=<Overpass cache>] [--pin=<live corridors.json>] [--json]
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { roadFcAxisKms, roadPointAtKm } from '../../src/road/roadFc.ts';
import { axisRoadsOf, axisIsRamp, axisInService, AXIS_NOT_IN_SERVICE, AXIS_RAMP_NOTE, UNBUILT_MAX_M } from './build-corridors.mjs';

export { axisRoadsOf, axisIsRamp, axisInService, AXIS_NOT_IN_SERVICE, AXIS_RAMP_NOTE };

export const COVER_STEP_KM = 0.5, COVER_LINE_KM = 0.3, COVER_POINT_KM = 2.5;
/** Share of samples that must be covered or a named exception (`set`, AF-2). */
export const COVER_TARGET = 0.995;

const kmBetween = (a, b) => {
  const kx = 111.2 * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 111.2);
};

function distToSegKm(p, a, b) {
  const kx = 111.2 * Math.cos((p[1] * Math.PI) / 180), ky = 111.2;
  const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky, bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

const linesOf = (f) => {
  const g = f.geometry;
  return !g ? [] : g.type === 'MultiLineString' ? g.coordinates : g.type === 'LineString' ? [g.coordinates] : [];
};

/** Samples every `stepKm` along every feature line (the first at its start). */
export function axisSamples(axes, stepKm = COVER_STEP_KM) {
  const out = [];
  for (const f of axes.features) {
    const roads = axisRoadsOf(f);
    if (!roads.length) continue;
    const ramp = axisIsRamp(f), inService = axisInService(f);
    for (const l of linesOf(f)) {
      let acc = 0, next = 0;
      for (let i = 1; i < l.length; i++) {
        const d = kmBetween(l[i - 1], l[i]);
        // 1 mm of slack: a line of exactly n steps gets its end sample whatever the rounding of the sum.
        while (next <= acc + d + 1e-6 && d > 0) {
          const t = Math.min(1, (next - acc) / d);
          out.push({ p: [l[i - 1][0] + t * (l[i][0] - l[i - 1][0]), l[i - 1][1] + t * (l[i][1] - l[i - 1][1])], roads, ramp, inService });
          next += stepKm;
        }
        acc += d;
      }
    }
  }
  return out;
}

/** Lines with a padded bounding box, for a cheap reject. */
const boxed = (line, padKm) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of line) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  const py = padKm / 111.2, px = padKm / (111.2 * Math.cos(((y0 + y1) / 2) * Math.PI / 180));
  return { line, box: [x0 - px, y0 - py, x1 + px, y1 + py] };
};
const inBox = (p, b) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
export function distToLinesKm(p, boxedLines) {
  let best = Infinity;
  for (const { line, box } of boxedLines) {
    if (!inBox(p, box)) continue;
    for (let i = 1; i < line.length; i++) { const d = distToSegKm(p, line[i - 1], line[i]); if (d < best) best = d; }
  }
  return best;
}
export const boxedLines = (lines, padKm = COVER_LINE_KM) => lines.map((l) => boxed(l, padKm));

/** Nominal axis forecast points of a corridor (no point on an `unbuilt` stretch, as `axisPointsOf`). */
export const nominalAxisPoints = (c) => roadFcAxisKms(c.lengthKm)
  .filter((km) => !(c.unbuilt ?? []).some(([a, b]) => km >= a && km <= b))
  .map((km) => roadPointAtKm(c.line, km));

/**
 * @param isBuilt optional `(p, road) => boolean` (OSM carriageway of that number within 300 m)
 * @returns counts per class, per road and the open samples
 */
export function coverageOf({ samples, corridors, isBuilt = null }) {
  const lines = new Map(), points = new Map();
  for (const c of corridors) {
    if (!lines.has(c.road)) { lines.set(c.road, []); points.set(c.road, []); }
    lines.get(c.road).push(boxed(c.line, COVER_LINE_KM));
    points.get(c.road).push(...nominalAxisPoints(c));
  }
  const count = { line: 0, point: 0, construction: 0, noCarriageway: 0, open: 0 };
  const main = { n: 0, open: 0 }, ramp = { n: 0, open: 0 };
  const byRoad = new Map(), open = [];
  for (const s of samples) {
    let cls = 'open';
    if (s.roads.some((r) => distToLinesKm(s.p, lines.get(r) ?? []) <= COVER_LINE_KM)) cls = 'line';
    else if (s.roads.some((r) => (points.get(r) ?? []).some((q) => kmBetween(s.p, q) <= COVER_POINT_KM))) cls = 'point';
    else if (!s.inService) cls = 'construction';
    else if (isBuilt && !s.roads.some((r) => isBuilt(s.p, r))) cls = 'noCarriageway';
    count[cls] += 1;
    const part = s.ramp ? ramp : main;
    part.n += 1;
    for (const r of s.roads) {
      if (!byRoad.has(r)) byRoad.set(r, { n: 0, line: 0, point: 0, construction: 0, noCarriageway: 0, open: 0, openRamp: 0 });
      const row = byRoad.get(r);
      row.n += 1; row[cls] += 1;
      if (cls === 'open' && s.ramp) row.openRamp += 1;
    }
    if (cls === 'open') { part.open += 1; open.push(s); }
  }
  const n = samples.length;
  return {
    n, count, main, ramp, byRoad, open,
    share: n ? (n - count.open) / n : 1,
    roads: [...byRoad.keys()],
    roadsWithout: [...byRoad.keys()].filter((r) => !lines.has(r)),
  };
}

/** Corridor line samples (every `COVER_STEP_KM`) farther than `COVER_LINE_KM` from every axis line of the corridor's number. */
export function offAxis({ axes, corridors }) {
  const byRoad = new Map();
  for (const f of axes.features) for (const r of axisRoadsOf(f)) {
    if (!byRoad.has(r)) byRoad.set(r, []);
    for (const l of linesOf(f)) byRoad.get(r).push(boxed(l, COVER_LINE_KM));
  }
  const rows = [];
  let n = 0, off = 0;
  for (const c of corridors) {
    const axis = byRoad.get(c.road) ?? [];
    let cn = 0, co = 0, run = 0, maxRun = 0;
    for (let km = 0; km <= c.lengthKm + 1e-9; km += COVER_STEP_KM) {
      cn += 1;
      if (distToLinesKm(roadPointAtKm(c.line, km), axis) > COVER_LINE_KM) { co += 1; run += COVER_STEP_KM; if (run > maxRun) maxRun = run; } else run = 0;
    }
    n += cn; off += co;
    if (co) rows.push({ id: c.id, n: cn, off: co, maxRunKm: maxRun });
  }
  return { n, off, rows };
}

/** Pinned identifiers: every corridor of `live` is in `built` under the same id, unchanged. */
export function pinCheck(live, built) {
  const byId = new Map(built.map((c) => [c.id, c]));
  const missing = [], changed = [];
  for (const c of live) {
    const d = byId.get(c.id);
    if (!d) missing.push(c.id);
    else if (JSON.stringify(d) !== JSON.stringify(c)) changed.push(c.id);
  }
  const ids = built.map((c) => c.id);
  return { n: live.length, missing, changed, duplicate: ids.filter((id, i) => ids.indexOf(id) !== i) };
}

async function main() {
  const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  if (!arg('axes') || !arg('corridors')) { console.error('usage: corridor-coverage.mjs --axes=<dlm250-motorways.json> --corridors=<corridors.json> [--osm=…] [--pin=…] [--json]'); process.exit(2); }
  const axes = JSON.parse(readFileSync(arg('axes'), 'utf8'));
  const corridors = JSON.parse(readFileSync(arg('corridors'), 'utf8')).corridors;
  let isBuilt = null;
  if (arg('osm')) {
    const F = await import('./build-fc-points.mjs');
    const index = F.buildOsmIndex(JSON.parse(readFileSync(arg('osm'), 'utf8')));
    isBuilt = (p, road) => { const hit = F.nearestCarriageway(index, p, road); return !!hit && !hit.other && hit.d <= UNBUILT_MAX_M; };
  }
  const cov = coverageOf({ samples: axisSamples(axes), corridors, isBuilt });
  const off = offAxis({ axes, corridors });
  const pin = arg('pin') ? pinCheck(JSON.parse(readFileSync(arg('pin'), 'utf8')).corridors, corridors) : null;
  const openByRoad = [...cov.byRoad].filter(([, r]) => r.open).sort((a, b) => b[1].open - a[1].open).map(([road, r]) => ({ road, open: r.open, ramp: r.openRamp, km: r.open * COVER_STEP_KM }));
  const out = {
    axesFetchedAt: axes.fetchedAt ?? null, samples: cov.n, share: cov.share, count: cov.count, main: cov.main, ramp: cov.ramp,
    roads: cov.roads.length, roadsWithout: cov.roadsWithout, corridors: corridors.length,
    gap: corridors.filter((c) => c.gap).length, openByRoad, offAxis: { n: off.n, off: off.off, rows: off.rows.sort((a, b) => b.off - a.off).slice(0, 30) }, pin,
  };
  if (process.argv.includes('--json')) { console.log(JSON.stringify(out)); return; }
  console.log(`Achsen ${out.axesFetchedAt} · ${out.samples} Proben alle ${COVER_STEP_KM} km · ${out.corridors} Korridore (${out.gap} ohne Messstelle) auf ${cov.roads.length - cov.roadsWithout.length} von ${out.roads} Nummern`);
  console.log(`gedeckt oder benannt: ${(out.share * 100).toFixed(2)} % (Ziel ${(COVER_TARGET * 100).toFixed(1)} %) — Linie ${cov.count.line} · Prognosepunkt ${cov.count.point} · im Bau/außer Betrieb ${cov.count.construction} · ohne OSM-Fahrbahn ${cov.count.noCarriageway} · offen ${cov.count.open}`);
  console.log(`Hauptfahrbahn: ${cov.main.n} Proben, offen ${cov.main.open} · Auf-/Abfahrten: ${cov.ramp.n} Proben, offen ${cov.ramp.open}`);
  console.log(`ohne Korridor: ${out.roadsWithout.join(' ') || '—'}`);
  console.log(`offen je Autobahn (Proben, davon Auf-/Abfahrt): ${openByRoad.map((r) => `${r.road}:${r.open}(${r.ramp})`).join(' ') || '—'}`);
  console.log(`Korridor-Linie abseits der Achse: ${off.off} von ${off.n} Proben; ${out.offAxis.rows.slice(0, 15).map((r) => `${r.id}:${r.off}(max ${r.maxRunKm} km)`).join(' ') || '—'}`);
  if (pin) console.log(`Kennungen: ${pin.n - pin.missing.length - pin.changed.length} von ${pin.n} unverändert · fehlen ${pin.missing.join(' ') || '—'} · geändert ${pin.changed.join(' ') || '—'} · doppelt ${pin.duplicate.join(' ') || '—'}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.stack ?? e.message); process.exit(1); });
}
