#!/usr/bin/env node
/**
 * AW-6.1 — store of the route forecast in `jppetry/buscosun-archiv` (`road/fc/v1/`; audit/autobahnwetter.md §14.6).
 *
 * A forecast that was not kept cannot be recomputed later (the cube runs and the radar slots it read are gone after
 * hours, the data repo's history is cut). The backtest of AW-6.2 / Gate D needs forecast and measurement at the same
 * place — so this keeps the forecast where a measurement exists: the STATION points. Each run of the archive job
 * (every 3 h, `workflow-road-archiv.yml`) stores the newest run of buscosun-data `road/fc/v1`, thinned:
 *
 *   <YYYY-MM-DD>/<run>.json.gz   station points only, the first `ROAD_FC_ARCHIVE_STEPS` hourly steps (lead 0…24 h),
 *                                variables `ROAD_FC_ARCHIVE_VARS` in the contract's integer coding, engine block as is.
 *   index.json                   runs per day (points, bytes).
 *
 * A stored run is never rewritten. Pure thinning (`thinRun`), no clock inside.
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/road-fc-archive.mjs \
 *     --fc=<buscosun-data>/road/fc/v1 --archive=<buscosun-archiv>/road/fc/v1 [--now=<ISO>]
 * Exit 0 = stored or nothing new · 1 = pointer or run files unreadable.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { ROAD_FC_INDEX_PATH, parseRoadFcIndex, parseRoadFcFile, roadFcStampToMs } from '../../src/road/roadFc.ts';

/** Lead 0…24 h — the range Gate D scores (+1/+3/+6 h) with room for a day-ahead check. */
export const ROAD_FC_ARCHIVE_STEPS = 25;
export const ROAD_FC_ARCHIVE_VARS = Object.freeze(['t', 'ts', 'td', 'pp', 'rr', 'sn', 'ff', 'fx', 'n', 'q']);
export const ROAD_FC_ARCHIVE_SCHEMA = 1;

export const fcArchivePath = (run) => `${new Date(roadFcStampToMs(run)).toISOString().slice(0, 10)}/${run}.json.gz`;

/** Run files (parsed) → the archive document: station points, first steps, chosen variables; sorted by id. */
export function thinRun(files) {
  const first = files[0];
  if (!first) return null;
  const stations = {};
  for (const f of files) for (const p of f.points) {
    if (p.kind !== 'station') continue;
    stations[p.id] = {
      lat: p.lat, lon: p.lon, h: p.h ?? null, mos: p.mos ?? null, at: f.kind === 'corridor' ? f.id : null,
      v: Object.fromEntries(ROAD_FC_ARCHIVE_VARS.map((k) => [k, p.v[k].slice(0, ROAD_FC_ARCHIVE_STEPS)])),
    };
  }
  return {
    schema: ROAD_FC_ARCHIVE_SCHEMA, product: 'road-fc-archive', run: first.run, issuedAt: first.issuedAt, t0Ms: first.t0Ms,
    steps: Math.min(ROAD_FC_ARCHIVE_STEPS, first.steps), vars: ROAD_FC_ARCHIVE_VARS, engine: first.engine, source: first.source,
    stations: Object.fromEntries(Object.keys(stations).sort().map((k) => [k, stations[k]])),
  };
}

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
function writeAtomic(p, body) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p + '.tmp', body);
  renameSync(p + '.tmp', p);
}

export function archiveRoadFc({ fcDir, archiveDir, nowMs = Date.now() }) {
  const index = parseRoadFcIndex(readJson(join(fcDir, ROAD_FC_INDEX_PATH)));
  if (!index) return { ok: false, reason: `kein lesbarer Zeiger unter ${fcDir}` };
  const entry = index.runs[0];
  if (!entry) return { ok: true, stored: null, reason: 'kein Lauf im Zeiger' };
  const rel = fcArchivePath(entry.run);
  const target = join(archiveDir, rel);
  if (existsSync(target)) return { ok: true, stored: null, reason: `${entry.run} liegt schon im Archiv` };
  const files = [];
  for (const sub of ['c', 's']) {
    const d = join(fcDir, entry.run, sub);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).sort()) {
      const doc = parseRoadFcFile(readJson(join(d, f)));
      if (!doc || doc.run !== entry.run) return { ok: false, reason: `Lauf-Datei ${entry.run}/${sub}/${f} nicht lesbar` };
      files.push(doc);
    }
  }
  const doc = thinRun(files);
  const n = doc ? Object.keys(doc.stations).length : 0;
  if (!n) return { ok: false, reason: `Lauf ${entry.run} ohne Stationspunkte` };
  const gz = gzipSync(JSON.stringify(doc), { level: 9 });
  writeAtomic(target, gz);
  const idxPath = join(archiveDir, 'index.json');
  const idx = readJson(idxPath) ?? { schema: ROAD_FC_ARCHIVE_SCHEMA, product: 'road-fc-archive-index', updatedAt: null, days: {} };
  const day = rel.slice(0, 10);
  (idx.days[day] ??= {})[entry.run] = { stations: n, bytes: gz.length, issuedAt: entry.issuedAt };
  idx.days = Object.fromEntries(Object.keys(idx.days).sort().map((k) => [k, idx.days[k]]));
  idx.updatedAt = new Date(nowMs).toISOString();
  writeAtomic(idxPath, `${JSON.stringify(idx, null, 1)}\n`);
  return { ok: true, stored: rel, stations: n, bytes: gz.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const fcDir = arg('fc'), archiveDir = arg('archive');
  if (!fcDir || !archiveDir) { console.error('usage: road-fc-archive.mjs --fc=<road/fc/v1 dir> --archive=<archive road/fc/v1 dir> [--now=<ISO>]'); process.exit(2); }
  const res = archiveRoadFc({ fcDir, archiveDir, nowMs: arg('now') ? Date.parse(arg('now')) : Date.now() });
  console.log(JSON.stringify(res));
  if (!res.ok) process.exit(1);
}
