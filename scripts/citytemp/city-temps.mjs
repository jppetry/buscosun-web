#!/usr/bin/env node
/**
 * Producer of the city temperatures of the map labels (`buscosun-data/citytemp/v1/`, contract `src/sources/cityTemps.ts`):
 * buscosun Fusion (the newest stand of the register, `fusionRelease.ts`) at every city of `DACH_CITIES`, hourly +0 … +48 h,
 * from a local checkout of the data repo — ONE file, `latest.json`.
 *
 * The chain is the client's (`getPointForecastFromCube`, stage `fs`), with the producer facts of the route forecast
 * (`scripts/road/road-forecast.mjs`: directory store, Node decoders, terrain and roughness preloaded from
 * `static/geo.json`). The measurement anchor reads the mirror product `obs/v1` of the SAME checkout through the client's
 * own selection (`nearestObsStations`, dense set, per-variable stamps) and mapping (`cubeObsOf`) — what the browser reads
 * over the CDN. A product older than `OBS_PRODUCT_MAX_AGE_MS` counts as not there (the run then has no anchor and says so).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/citytemp/city-temps.mjs
 *     --data=<checkout of buscosun-data> [--now=<iso>] [--publish] [--build-geo] [--out=<file>] [--remote=origin] [--branch=main]
 *
 * `--build-geo`: (re)builds `static/geo.json` from the tile servers (whenever the city list changes; a missing file is
 * rebuilt by itself); with `--publish` it is pushed together with the run. Without `--publish` the run is written to
 * `--out` (default: a temp file).
 * Exit 0 = published / built / switched off (`CITYTEMP=0`), 3 = run NOT published (too many cities failed, stage not
 * read), 1 = error.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { installNodeShims } from '../punktarchiv/lib/nodeShims.mjs';
import { dirStore, makeIo, geoBackend } from '../road/road-forecast.mjs';
import { buildGeo } from '../road/build-fc-points.mjs';
import { DACH_CITIES } from '../../src/temperatureLabels.ts';
import { pickCountry } from '../../src/pointForecast/countryOfPoint.ts';
import { getPointForecastFromCube, clearCubeForecastCache, cubeObsOf } from '../../src/pointForecast/cubeSource.ts';
import { FUSION_CURRENT, FUSION_NAME, fusionVersionOfNotes } from '../../src/pointForecast/fusion/fusionRelease.ts';
import {
  OBS_DIR, OBS_CATALOG_PATH, OBS_LATEST_PATH, OBS_DENSE_MAX, OBS_PRODUCT_MAX_AGE_MS, parseObsCatalog, parseObsLatest, obsStoreOf, nearestObsStations,
} from '../../src/sources/obsStore.ts';
import {
  CITY_TEMPS_DIR, CITY_TEMPS_FILE, CITY_TEMPS_GEO_PATH, CITY_TEMPS_STEPS, CITY_TEMPS_MIN_CITIES, makeCityTemps, cityTempCode, parseCityTemps,
} from '../../src/sources/cityTemps.ts';

const H = 3_600_000;
const PUSH_RETRIES = 6;
/** More than this share of cities without a result ⇒ the run is not published. */
const MAX_FAILED_SHARE = 0.1;

/** The cities as producer points; a name is the key of the file, so it must be unique. */
export function cityPoints() {
  const seen = new Set();
  return DACH_CITIES.map((c) => {
    if (seen.has(c.name)) throw new Error(`DACH_CITIES nennt „${c.name}" zweimal — der Name ist der Schlüssel der Datei`);
    seen.add(c.name);
    return { id: c.name, lat: c.lat, lon: c.lng, country: pickCountry(c.lat, c.lng) };
  });
}

/** The engine's measurement hook on the checkout's `obs/v1` — `{ obs, note }`; `obs: null` when the product is not usable. */
export function obsHookOf(dataDir, nowMs) {
  const read = (f) => { try { return JSON.parse(readFileSync(join(dataDir, OBS_DIR, f), 'utf8')); } catch { return null; } };
  const catalog = parseObsCatalog(read(OBS_CATALOG_PATH)), latest = parseObsLatest(read(OBS_LATEST_PATH));
  if (!catalog || !latest) return { obs: null, note: `${OBS_DIR} fehlt im Klon oder ist nicht lesbar — kein Anker` };
  const ageMin = Math.round((nowMs - Date.parse(latest.builtAt)) / 60_000);
  if (!(ageMin * 60_000 <= OBS_PRODUCT_MAX_AGE_MS)) return { obs: null, note: `${OBS_DIR}/${OBS_LATEST_PATH} ist ${ageMin} min alt (Grenze ${OBS_PRODUCT_MAX_AGE_MS / 60_000} min) — kein Anker` };
  const store = obsStoreOf(catalog, latest, nowMs);
  // The same call the browser makes (`fetchCubeObs` → `fetchNearestStationObs`, product branch), on the files of the checkout.
  const obs = async (lat, lon, country, _signal, hint, opts) => cubeObsOf(nearestObsStations(store, lat, lon, country, {
    max: opts?.dense ? OBS_DENSE_MAX : 6, nowMs,
    station: hint?.station ? { id: hint.station.id, lat: hint.station.lat, lon: hint.station.lon } : null,
    ...(opts?.dense ? { dense: true } : {}), ...(opts?.perVar === false ? {} : { perVar: 'split' }),
  }), nowMs);
  return { obs, note: `${OBS_DIR} vom ${latest.builtAt} (${ageMin} min alt)` };
}

/** One city → `{ series, stage, anchored, runs }` or `{ error }`; never throws. */
export async function computeCity(p, io, t0Ms) {
  try {
    clearCubeForecastCache();
    const fc = await getPointForecastFromCube({ lat: p.lat, lng: p.lon, country: p.country, hours: CITY_TEMPS_STEPS - 1, pointSource: 'cube', includeRadarNowcast: true }, io);
    if (!fc.cube?.v2) return { error: 'kein Cube-Ergebnis' };
    const series = new Array(CITY_TEMPS_STEPS).fill(null);
    for (const s of fc.cube.v2.axis.steps) {
      const i = (s.validAtMs - t0Ms) / H;
      if (Number.isInteger(i) && i >= 0 && i < CITY_TEMPS_STEPS) series[i] = cityTempCode(s.vars.t2m?.mean);
    }
    if (series.filter((v) => v != null).length < CITY_TEMPS_STEPS / 2) return { error: 'weniger als die Hälfte der Stunden mit Temperatur' };
    const r = fc.cube.v2.provenance?.runs ?? {};
    return {
      series,
      stage: fusionVersionOfNotes(fc.cube.notes) === FUSION_CURRENT,
      anchored: fc.cube.notes.some((n) => /^anchor: \d+ Paar/.test(n)),
      runs: { t1: r.t1?.run ?? null, t2: r.t2?.run ?? null, stations: r.stations?.run ?? null },
    };
  } catch (e) {
    return { error: String(e?.message ?? e).split('\n')[0] };
  }
}

/** Computes the run; `{ doc, stats }`. */
export async function buildRun({ dataDir, nowMs = Date.now(), geoDoc, log = () => {} }) {
  installNodeShims();
  const T0 = Date.now();
  const t0Ms = Math.floor(nowMs / H) * H;
  const hook = obsHookOf(dataDir, nowMs);
  log(`Messungen: ${hook.note}`);
  const cache = geoBackend(geoDoc);
  const io = { ...makeIo({ store: dirStore(dataDir), cache, nowMs }), obs: hook.obs };
  const points = cityPoints();
  const cities = {}, failed = [];
  let noStage = 0, anchored = 0, runs = null;
  for (const p of points) {
    const r = await computeCity(p, io, t0Ms);
    if (r.error) { failed.push({ id: p.id, error: r.error }); continue; }
    cities[p.id] = r.series;
    runs ??= r.runs;
    if (!r.stage) noStage++;
    if (r.anchored) anchored++;
  }
  const doc = makeCityTemps({ issuedAtMs: nowMs, t0Ms, engine: { name: FUSION_NAME, version: FUSION_CURRENT, anchored, runs: runs ?? {} }, cities });
  const stats = { total: points.length, ok: Object.keys(cities).length, failed, noStage, anchored, geo: cache.counts, ms: Date.now() - T0 };
  log(`${stats.ok}/${stats.total} Städte · ${failed.length} ohne Ergebnis · Anker an ${anchored} · Cube ${JSON.stringify(runs)} · ${(stats.ms / 1000).toFixed(1)} s${noStage ? ` · ${noStage} OHNE Stufe fs` : ''}${cache.counts.terrainMiss || cache.counts.z0Miss ? ` · Gelände nicht vorab: ${cache.counts.terrainMiss}, z0: ${cache.counts.z0Miss}` : ''}`);
  return { doc, stats };
}

/** May this run be published? */
export function publishVerdict({ doc, stats }) {
  const reasons = [];
  if (stats.ok < CITY_TEMPS_MIN_CITIES) reasons.push(`nur ${stats.ok} Städte mit Ergebnis`);
  if (stats.total && stats.failed.length / stats.total > MAX_FAILED_SHARE) reasons.push(`${stats.failed.length} von ${stats.total} Städten ohne Ergebnis (> ${100 * MAX_FAILED_SHARE} %)`);
  if (stats.noStage) reasons.push(`${stats.noStage} Städte ohne Stufe fs (gelernte Tabellen nicht gelesen) — das wäre nicht ${FUSION_NAME}`);
  if (!doc.engine.runs?.t1) reasons.push('kein Lauf der Stufe 1 gelesen');
  if (!parseCityTemps(JSON.parse(JSON.stringify(doc)))) reasons.push('Datei besteht den eigenen Prüfer nicht');
  return { ok: reasons.length === 0, reasons };
}

function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file + '.tmp', text);
  renameSync(file + '.tmp', file);
}

/**
 * Writes `files` (`[{ rel, text }]`, relative to `citytemp/v1/`) into the checkout and pushes. Every attempt starts from a
 * fresh `origin/<branch>` (the map line force-pushes this repo, the mirror pushes every few minutes), never `--force`;
 * only `citytemp/v1` enters the commit.
 */
export function publish({ repoDir, files, message, remote = 'origin', branch = 'main', log = () => {}, retries = PUSH_RETRIES }) {
  const git = (args) => execFileSync('git', args, { cwd: repoDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      git(['fetch', '--quiet', '--depth=1', remote, branch]);
      git(['checkout', '--quiet', '-B', branch, `${remote}/${branch}`]);
      const staged = git(['diff', '--cached', '--name-only']);
      if (staged) throw Object.assign(new Error(`Index des Klons trägt fremde Änderungen (${staged.split('\n').slice(0, 3).join(', ')}) — kein Push`), { fatal: true });
      for (const f of files) writeAtomic(join(repoDir, CITY_TEMPS_DIR, f.rel), f.text);
      git(['add', '-A', '--', CITY_TEMPS_DIR]);
      if (!git(['status', '--porcelain', '--', CITY_TEMPS_DIR])) return { noop: true, attempt };
      git(['commit', '--quiet', '-m', message, '--', CITY_TEMPS_DIR]);
      const outside = git(['diff', '--name-only', `${remote}/${branch}`, 'HEAD']).split('\n').filter((f) => f && !f.startsWith(`${CITY_TEMPS_DIR}/`));
      if (outside.length) throw Object.assign(new Error(`Commit fasst fremde Pfade an (${outside.slice(0, 3).join(', ')}) — kein Push`), { fatal: true });
      git(['push', '--quiet', remote, `HEAD:${branch}`]);
      return { attempt, commit: git(['rev-parse', 'HEAD']) };
    } catch (e) {
      if (e.fatal) throw e;
      lastErr = e;
      log(`Push-Versuch ${attempt}/${retries} abgelehnt (${String(e.stderr ?? e.message).split('\n').find((l) => l.trim()) ?? 'unbekannt'}) — neu aufsetzen`);
    }
  }
  throw lastErr;
}

async function main() {
  const flags = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
  const log = (m) => console.log(`[citytemp] ${m}`);
  if (!flags.data) { console.error('--data=<Klon von buscosun-data> fehlt'); process.exit(2); }
  if (process.env.CITYTEMP === '0') { log('CITYTEMP=0 — Schalter aus, kein Lauf'); return; }
  const nowMs = typeof flags.now === 'string' ? Date.parse(flags.now) : Date.now();
  if (!Number.isFinite(nowMs)) { console.error('--now nicht lesbar'); process.exit(2); }

  const geoFile = join(flags.data, CITY_TEMPS_DIR, CITY_TEMPS_GEO_PATH);
  const files = [];
  let geoDoc = existsSync(geoFile) ? JSON.parse(readFileSync(geoFile, 'utf8')) : null;
  // A geo file lost in the data repo (a force-push of the map line in the window of a push) is rebuilt here by itself.
  if (flags['build-geo'] || !geoDoc) {
    if (!flags['build-geo']) log(`${CITY_TEMPS_GEO_PATH} fehlt im Daten-Repo — wird neu gebaut`);
    installNodeShims();
    const { entries, failed } = await buildGeo(cityPoints(), { log, seed: geoDoc?.entries ?? [] });
    geoDoc = { schema: 1, product: 'citytemp-geo', builtAt: new Date().toISOString(), note: 'Cache-Einträge der Client-Leser loadTerrainAtPoint (Terrarium z11 + z8) und loadZ0AtPoint (ESA WorldCover 2021, CC BY 4.0) je Stadt — nur für den Producer.', failed, entries };
    const geoText = JSON.stringify(geoDoc) + '\n';
    writeAtomic(geoFile, geoText);
    files.push({ rel: CITY_TEMPS_GEO_PATH, text: geoText });
    log(`${CITY_TEMPS_GEO_PATH}: ${entries.length} Einträge, ${failed.length} Städte unvollständig${failed.length ? ` (${failed.slice(0, 5).map((f) => f.id).join(', ')})` : ''}`);
  }
  const built = await buildRun({ dataDir: flags.data, nowMs, geoDoc, log });
  for (const f of built.stats.failed.slice(0, 10)) log(`  ohne Ergebnis: ${f.id} — ${f.error}`);
  const verdict = publishVerdict(built);
  if (!verdict.ok) { log(`Lauf NICHT veröffentlicht: ${verdict.reasons.join(' · ')}`); process.exit(3); }
  const text = JSON.stringify(built.doc) + '\n';
  if (!flags.publish) {
    const out = typeof flags.out === 'string' ? flags.out : join(mkdtempSync(join(tmpdir(), 'citytemp-')), CITY_TEMPS_FILE);
    writeAtomic(out, text);
    log(`gebaut nach ${out} (${(text.length / 1024).toFixed(1)} KB, ohne --publish)`);
    return;
  }
  files.push({ rel: CITY_TEMPS_FILE, text });
  const r = publish({ repoDir: flags.data, files, message: `citytemp: ${new Date(built.doc.t0Ms).toISOString().slice(0, 13)}Z (${built.stats.ok} Städte, ${FUSION_NAME})`, remote: flags.remote || 'origin', branch: flags.branch || 'main', log });
  log(r.noop ? 'nichts zu committen' : `veröffentlicht ${r.commit.slice(0, 7)} (Versuch ${r.attempt}) · ${(text.length / 1024).toFixed(1)} KB`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
