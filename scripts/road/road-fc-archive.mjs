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
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  ROAD_FC_INDEX_PATH, ROAD_FC_POINTS_PATH, ROAD_FC_GEO_PATH, ROAD_FC_STALE_MS, ROAD_FC_REPO_DIR,
  parseRoadFcIndex, parseRoadFcFile, parseRoadFcPoints, roadFcStampToMs,
} from '../../src/road/roadFc.ts';

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
      // V-AW-21: whether (and by how much) this forecast was anchored on the station's measurement.
      ...(p.anc ? { anc: p.anc } : {}),
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

// --- V-AW-28: watch of the pointer ------------------------------------------------------------------

/**
 * Age of the newest run in the pointer. The job is woken hourly and after every `point` run; when neither fires (the
 * schedule of the new workflow did not start for two hours on 04.10.2026, V-AW-28) the page shows "veraltet" after 3 h
 * (`ROAD_FC_STALE_MS`) and nobody would notice. Same limit here: older ⇒ `stale`. A set kill switch is named, not red;
 * no readable pointer counts as stale (the product is gone). Pure, no clock inside.
 */
export function roadFcPointerAge(index, nowMs) {
  if (!index) return { stale: true, reason: 'Zeiger road/fc/v1/index.json fehlt oder ist unlesbar', newestRun: null, ageMin: null, killed: false };
  if (index.killed) return { stale: false, reason: 'Schalter aus (killed)', newestRun: index.runs[0]?.run ?? null, ageMin: null, killed: true };
  const r = index.runs[0];
  if (!r) return { stale: true, reason: 'kein Lauf im Zeiger', newestRun: null, ageMin: null, killed: false };
  const ageMs = nowMs - Date.parse(r.issuedAt);
  const ageMin = Math.round(ageMs / 60_000);
  return { stale: !(ageMs <= ROAD_FC_STALE_MS), reason: `jüngster Lauf ${r.run} ist ${ageMin} min alt (Grenze ${ROAD_FC_STALE_MS / 60_000} min)`, newestRun: r.run, ageMin, killed: false };
}

export function roadFcPointerAgeOf(fcDir, nowMs) {
  return roadFcPointerAge(parseRoadFcIndex(readJson(join(fcDir, ROAD_FC_INDEX_PATH))), nowMs);
}

// --- V-AW-24: copy of the static files ---------------------------------------------------------------

/**
 * `static/points.json` (public) and `static/geo.json` (producer only) are built by hand and live only in buscosun-data.
 * A hand push that falls into a force-push of the map line can lose them — then every forecast run ends with "points.json
 * fehlt". The archive keeps a gzip copy of both (`static/<file>.gz` + `static/manifest.json` with the sha-256 of the PLAIN
 * file); the producer takes them back when they are missing (`restoreFcStatic`) and its next push heals the data repo.
 */
export const ROAD_FC_STATIC_FILES = Object.freeze([ROAD_FC_POINTS_PATH, ROAD_FC_GEO_PATH]);
export const ROAD_FC_ARCHIVE_STATIC_MANIFEST = 'static/manifest.json';
export const ROAD_FC_ARCHIVE_RAW = `https://raw.githubusercontent.com/jppetry/buscosun-archiv/main/${ROAD_FC_REPO_DIR}`;
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

/** Copies changed static files of the data repo into the archive. Unchanged (same sha-256) ⇒ nothing written. */
export function syncFcStatic({ fcDir, archiveDir }) {
  const manPath = join(archiveDir, ROAD_FC_ARCHIVE_STATIC_MANIFEST);
  const man = readJson(manPath) ?? { schema: 1, product: 'road-fc-static', files: {} };
  const written = [], missing = [];
  for (const rel of ROAD_FC_STATIC_FILES) {
    const src = join(fcDir, rel);
    if (!existsSync(src)) { missing.push(rel); continue; }
    const b = readFileSync(src);
    // A points file that the client would not accept is no backup.
    if (rel === ROAD_FC_POINTS_PATH && !parseRoadFcPoints(JSON.parse(b.toString('utf8')))) { missing.push(rel); continue; }
    const h = sha256(b);
    if (man.files[rel]?.sha256 === h && existsSync(join(archiveDir, `${rel}.gz`))) continue;
    writeAtomic(join(archiveDir, `${rel}.gz`), gzipSync(b, { level: 9 }));
    man.files[rel] = { sha256: h, bytes: b.length };
    written.push(rel);
  }
  if (written.length) writeAtomic(manPath, `${JSON.stringify(man, null, 1)}\n`);
  return { written, missing };
}

/**
 * Producer side: static files missing in the checkout are fetched from the archive (`fetchBytes(url)` ⇒ bytes or null),
 * checked against the manifest's sha-256 and written. Returns the restored files (`[{ rel, bytes }]`) and what could not
 * be restored. Never throws for a missing archive — the caller then fails as before, named.
 */
export async function restoreFcStatic(fcDir, { fetchBytes = defaultFetchBytes, base = ROAD_FC_ARCHIVE_RAW, log = () => {} } = {}) {
  const need = ROAD_FC_STATIC_FILES.filter((rel) => !existsSync(join(fcDir, rel)));
  if (!need.length) return { restored: [], failed: [] };
  const restored = [], failed = [];
  let man = null;
  try { const b = await fetchBytes(`${base}/${ROAD_FC_ARCHIVE_STATIC_MANIFEST}`); man = b ? JSON.parse(Buffer.from(b).toString('utf8')) : null; } catch { man = null; }
  for (const rel of need) {
    const want = man?.files?.[rel];
    if (!want) { failed.push({ rel, reason: 'nicht im Archiv-Manifest' }); continue; }
    let bytes = null;
    try { const gz = await fetchBytes(`${base}/${rel}.gz`); bytes = gz ? gunzipSync(Buffer.from(gz)) : null; } catch { bytes = null; }
    if (!bytes) { failed.push({ rel, reason: 'Archiv-Kopie nicht abrufbar' }); continue; }
    if (sha256(bytes) !== want.sha256) { failed.push({ rel, reason: 'Prüfsumme passt nicht zum Manifest' }); continue; }
    writeAtomic(join(fcDir, rel), bytes);
    restored.push({ rel, bytes });
    log(`${rel} fehlte im Daten-Repo — aus buscosun-archiv zurückgeholt (${bytes.length} B, sha256 ${want.sha256.slice(0, 12)})`);
  }
  return { restored, failed };
}

async function defaultFetchBytes(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 60_000);
  try {
    const r = await fetch(url, { signal: ac.signal });
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  } finally { clearTimeout(t); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const fcDir = arg('fc'), archiveDir = arg('archive');
  if (!fcDir || !archiveDir) { console.error('usage: road-fc-archive.mjs --fc=<road/fc/v1 dir> --archive=<archive road/fc/v1 dir> [--now=<ISO>]'); process.exit(2); }
  const nowMs = arg('now') ? Date.parse(arg('now')) : Date.now();
  const res = archiveRoadFc({ fcDir, archiveDir, nowMs });
  // V-AW-24: the copy of the static files rides along with every archive run (written only when changed).
  const st = syncFcStatic({ fcDir, archiveDir });
  console.log(JSON.stringify({ ...res, static: st }));
  if (!res.ok) process.exit(1);
}
