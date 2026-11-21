#!/usr/bin/env node
/**
 * Phase BS — the lake line of Seewetter (`audit/seewetter-binnenseen.md`, contract `src/sea/seaLakes.ts`).
 *
 *   wind   wind, gust, direction, band `q` and hints `s` of buscosun Fusion at every lake spot of
 *          `static/spots-lakes.json` → `lakes/<run>-w<t1>.json` + `status.lakes`. Exactly the chain of the coastal
 *          spots (`spotWind`, `stepQuantiles`, `sea-sight.mjs`), computed at the spot's water point with the country
 *          parameters of its land and — through `static/lake-geo.json` — at the lake's surface elevation instead of 0.
 *          Due whenever the published wave run or the cube's t1 run is newer than the last lake file (the series lie on
 *          the hour axis of the published wave run, so the page reads them like any spot).
 *   wt     the modelled water temperature of the lakes: 1D model Simstrat of Alplakes (Eawag, CC BY 4.0), one request
 *          per basin, at most every `SEA_LAKES_WT_EVERY_MS` → `lakes/wt-<stamp>.json` + `status.lakesWt`. The API allows
 *          no browser of a foreign origin (CORS allow-list) and asks clients not to poll — hence the producer.
 *
 * Nothing here writes into `spots/<run>.json`: the coastal series do not know the lakes exist.
 *
 * V-SW-18 rule: this producer never writes a series of nulls. No catalogue ⇒ nothing to do (exit 0). A catalogue
 * without `lake-geo.json`, a wind computation without one spot, a missing climatology ⇒ it ABORTS with the reason
 * (exit ≠ 0, store unchanged). A single spot that fails is listed in `wind.failed` / `rejected` and gets no entry.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/sea-lakes.mjs
 *     --store=<sea/v1 working copy> [--data=<buscosun-data checkout with point/ | cdn>] [--repack=<checkout>]
 *     [--check]            only print whether the wind part is due, as JSON (the workflow decides on the cube checkout)
 *     [--only=wind|wt] [--now=<iso>]
 * Kill switch: SEA_KILL=1 (nothing built); SEA_LAKES=0 switches this producer off; SEA_LAKES_WT=0 the water temperature.
 */
import { readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SEA_SPOT_STEPS, SEA_STATUS_PATH, seaRunMs, seaSpotsPath, sanitizeGust, mergeSpotQuantiles, mergeSpotSight, hasQuantiles, hasSight,
} from '../../src/sea/seaContract.ts';
import {
  SEA_SPOT_CATALOG_LAKES_PATH, SEA_LAKE_GEO_PATH, SEA_LAKES_DIR, SEA_LAKES_RE, SEA_LAKES_PRODUCT, SEA_LAKES_KEPT_PER_RUN, seaLakesPath,
  lakeBlockProblems, lakeTableProblems, lakeSeriesProblems, carryLakeColumn,
  SEA_LAKES_WT_PRODUCT, SEA_LAKES_WT_RE, SEA_LAKES_WT_EVERY_MS, SEA_LAKES_WT_KEPT, ALPLAKES, seaLakesWtPath, alplakesPointUrl, alplakesBasinOf, lakesWtProblems,
} from '../../src/sea/seaLakes.ts';
import { spotWind, spotBand, bandDoc, spotSight, readStatus, writeStatus, writeAtomic, indexT1Of } from './sea-derive.mjs';
import { httpRepack, dirRepack } from './sea-sight.mjs';

const SELF = fileURLToPath(import.meta.url);
const H = 3_600_000;
const UA = 'buscosun-sea (https://buscosun.com; buscosun-web/audit/seewetter-binnenseen.md)';
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

/** The lake catalogue of the store, or `null` (no file = the phase is switched off by its fallback). Bad spots are named, not used. */
export function readLakeCatalog(storeDir) {
  const doc = readJson(join(storeDir, SEA_SPOT_CATALOG_LAKES_PATH));
  if (!doc || doc.product !== 'sea-spots' || doc.part !== 'lakes' || !Array.isArray(doc.spots) || !doc.spots.length) return null;
  const table = lakeTableProblems(doc.lakes);
  if (table.length) throw new Error(`${SEA_SPOT_CATALOG_LAKES_PATH}: Seetabelle ungültig — ${table.slice(0, 3).join('; ')}`);
  const lakeIds = new Set(doc.lakes.map((l) => l.id));
  const spots = [], problems = [];
  for (const s of doc.spots) {
    const pr = lakeBlockProblems(s.id, s, s.lake);
    if (s.lake && !lakeIds.has(s.lake.id)) pr.push(`${s.id}: See ${s.lake.id} nicht in der Tabelle`);
    if (pr.length) problems.push(...pr); else spots.push(s);
  }
  if (!spots.length) throw new Error(`${SEA_SPOT_CATALOG_LAKES_PATH}: kein gültiger Seespot — ${problems.slice(0, 3).join('; ')}`);
  return { doc, lakes: doc.lakes, spots, problems };
}

/** Is a wind computation for the lakes due? Pure on the store. */
export function lakesDue(storeDir, indexT1) {
  if (!existsSync(join(storeDir, SEA_SPOT_CATALOG_LAKES_PATH))) return { due: false, reason: `kein Seekatalog (${SEA_SPOT_CATALOG_LAKES_PATH}) im Speicher` };
  const st = readStatus(storeDir);
  const run = st.field?.lastPublishedRun ?? null;
  if (!run) return { due: false, reason: 'kein veröffentlichter Seegangslauf (die Seen liegen auf seiner Stundenachse)' };
  if (!existsSync(join(storeDir, seaSpotsPath(run)))) return { due: false, run, reason: `${seaSpotsPath(run)} fehlt` };
  if (!indexT1) return { due: false, run, reason: 'Cube-Index ohne t1-Lauf' };
  const have = st.lakes?.run === run && existsSync(join(storeDir, String(st.lakes.path))) ? st.lakes : null;
  if (have && indexT1 <= have.t1) return { due: false, run, usedT1: have.t1, indexT1, reason: `Seen schon mit t1 ${have.t1}` };
  return { due: true, run, usedT1: have?.t1 ?? null, indexT1 };
}

/** Keeps the newest `SEA_LAKES_KEPT_PER_RUN` lake files of every wave run the store still carries; the rest goes. */
export function pruneLakes(storeDir) {
  const dir = join(storeDir, SEA_LAKES_DIR), removed = [];
  if (!existsSync(dir)) return removed;
  const kept = new Set(existsSync(join(storeDir, 'spots')) ? readdirSync(join(storeDir, 'spots')).filter((f) => /^\d{10}\.json$/.test(f)).map((f) => f.slice(0, 10)) : []);
  const perRun = new Map();
  for (const m of readdirSync(dir).map((f) => SEA_LAKES_RE.exec(f)).filter(Boolean).sort((a, b) => (a[0] < b[0] ? 1 : -1))) {
    const n = (perRun.get(m[1]) ?? 0) + 1;
    perRun.set(m[1], n);
    if (!kept.has(m[1]) || n > SEA_LAKES_KEPT_PER_RUN) { rmSync(join(dir, m[0]), { force: true }); removed.push(`${SEA_LAKES_DIR}/${m[0]}`); }
  }
  const wt = readdirSync(dir).filter((f) => SEA_LAKES_WT_RE.test(f)).sort().reverse();
  for (const f of wt.slice(SEA_LAKES_WT_KEPT)) { rmSync(join(dir, f), { force: true }); removed.push(`${SEA_LAKES_DIR}/${f}`); }
  return removed;
}

/**
 * The wind part: computes the lake spots on the cube (`windImpl` = `spotWind`) and writes the file and the pointer.
 * Throws — store unchanged — when the catalogue has no terrain file or not one spot got a wind.
 */
export async function buildLakes({ storeDir, dataDir, nowMs = Date.now(), indexT1, log = () => {}, windImpl = spotWind, repack = httpRepack(), killed = process.env.SEA_KILL === '1' }) {
  if (killed) return { built: false, reason: 'Kill-Schalter SEA_KILL=1' };
  const due = lakesDue(storeDir, indexT1);
  if (!due.due) return { built: false, ...due };
  const cat = readLakeCatalog(storeDir);
  if (!cat) return { built: false, reason: 'kein Seekatalog' };
  const geoDoc = readJson(join(storeDir, SEA_LAKE_GEO_PATH));
  if (geoDoc?.product !== 'sea-lake-geo' || !Array.isArray(geoDoc.entries) || !geoDoc.entries.length) {
    throw new Error(`${SEA_LAKE_GEO_PATH} fehlt oder ist leer — ohne die Geländeeinträge rechnet buscosun Fusion nicht auf dem Seespiegel; keine Reihe für die Seen geschrieben`);
  }
  const { run } = due, runMs = seaRunMs(run), started = Date.now();
  const st = readStatus(storeDir);
  const wind = await windImpl({ dataDir, spots: cat.spots, geoDoc, nowMs, runMs, log });
  if (!Object.keys(wind?.series ?? {}).length) throw new Error(`Seen ${run}: kein Spot mit Wind — ${wind?.failed?.[0]?.error ?? 'Grund unbekannt'}; nichts geschrieben`);
  const t1 = wind.meta?.runs?.t1 ?? null;
  if (!t1) throw new Error(`Seen ${run}: die Rechnung nennt keinen t1-Lauf des Cubes; nichts geschrieben`);
  if (due.usedT1 && t1 <= due.usedT1) return { built: false, run, reason: `Rechnung trug t1 ${t1}, nicht neuer als ${due.usedT1}` };
  const from = Math.max(0, Math.round((Math.floor(nowMs / H) * H - runMs) / H));
  const hours = SEA_SPOT_STEPS.length;
  // The run's earlier lake file: its hours before `from` stay (a later computation starts at its own hour).
  const prev = st.lakes?.run === run ? readJson(join(storeDir, String(st.lakes.path))) : null;
  const sight = await spotSight({ wind, spots: cat.spots, runMs, nowMs, repack, log });
  const spots = {}, rejected = [], bandProblems = [];
  let bandSpots = 0;
  for (const sp of cat.spots) {
    const w = wind.series[sp.id];
    if (!w) continue;                                   // named in wind.failed
    const old = prev?.product === SEA_LAKES_PRODUCT ? prev.spots?.[sp.id] ?? null : null;
    // This computation's own columns first (a gust below the wind is dropped, its band with it) …
    const now = { wind: w.wind.slice(), gust: w.gust.slice(), windDir: w.windDir.slice() };
    const gustDropped = sanitizeGust(now);
    const qNow = spotBand(now, w.q, sp.id, bandProblems);
    // … then the hours before `from` of the run's earlier file, column by column.
    const v = { wind: carryLakeColumn(now.wind, old?.v?.wind, from), gust: carryLakeColumn(now.gust, old?.v?.gust, from), windDir: carryLakeColumn(now.windDir, old?.v?.windDir, from) };
    const pr = lakeSeriesProblems(v, hours);
    if (pr.length) { rejected.push(`${sp.id}: ${pr.slice(0, 2).join('; ')}`); continue; }
    const qAll = old?.q || qNow ? mergeSpotQuantiles(old?.q ?? null, qNow, from, hours) : null;
    const q = qAll ? spotBand(v, qAll, sp.id, bandProblems) : null;
    if (q && hasQuantiles(q)) bandSpots++;
    const sNow = sight?.spots[sp.id] ?? null;
    const s = old?.s || sNow ? mergeSpotSight(old?.s ?? null, sNow, from, hours) : null;
    spots[sp.id] = { v, ...(q && hasQuantiles(q) ? { q } : {}), ...(s && hasSight(s) ? { s } : {}), ...(gustDropped ? { gustDropped } : {}) };
  }
  if (!Object.keys(spots).length) throw new Error(`Seen ${run}: jede Reihe verletzt die Wertsperre (${rejected[0]}); nichts geschrieben`);
  const builtAt = new Date(nowMs).toISOString();
  const path = seaLakesPath(run, t1);
  const doc = {
    schema: 1, product: SEA_LAKES_PRODUCT, run, runMs, t1, from, steps: hours, builtAt,
    units: { wind: '0.1 m/s', gust: '0.1 m/s', windDir: 'deg' },
    about: 'Wind, Böen und Richtung von buscosun Fusion an den Seespots, gerechnet am Wasserpunkt des Spots auf dem Seespiegel des Sees (static/lake-geo.json) mit den Landesparametern seines Landes. Stundenachse des Seegangslaufs run; Stunden vor from stammen aus der vorigen Rechnung dieses Laufs.',
    wind: { ...wind.meta, failed: wind.failed ?? [] }, rejected, catalogProblems: cat.problems,
    ...(bandSpots ? { quantiles: bandDoc(bandSpots, bandProblems) } : {}), ...(sight ? { sight: sight.doc } : {}),
    spots,
  };
  const text = JSON.stringify(doc) + '\n';
  writeAtomic(join(storeDir, path), text);
  st.lakes = { run, t1, path, from, builtAt, engine: wind.meta?.engine ?? null, version: wind.meta?.version ?? null, spots: Object.keys(spots).length, failed: (wind.failed ?? []).length, rejected: rejected.length, buildS: Math.round((Date.now() - started) / 1000), bytes: Buffer.byteLength(text) };
  const removed = pruneLakes(storeDir);
  writeStatus(storeDir, st, nowMs);
  log(`Seen ${run} mit t1 ${t1}: ${Object.keys(spots).length}/${cat.spots.length} Spots ab Stunde ${from} (${bandSpots} mit Spanne), ${(wind.failed ?? []).length} ohne Rechnung, ${rejected.length} abgelehnt, ${st.lakes.buildS} s`);
  return { built: true, run, t1, from, path, spots: Object.keys(spots).length, of: cat.spots.length, bandSpots, sightSpots: sight?.doc.spots ?? 0, failed: wind.failed ?? [], rejected, removed, bytes: st.lakes.bytes };
}

// --- water temperature of the lakes (Alplakes) -------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * One request per basin, one after the other with a pause; 429/5xx/network: up to three tries with a longer pause
 * (`Retry-After` when the service sends it). Three basins in a row without an answer end the pass.
 */
export async function collectLakeWt({ keys, nowMs, fetchImpl = fetch, pauseMs = ALPLAKES.pauseMs, log = () => {} }) {
  const basins = {}, failed = [];
  let dead = 0;
  for (const key of keys) {
    if (dead >= 3) { failed.push({ key, error: 'nicht gefragt: drei Becken in Folge ohne Antwort' }); continue; }
    let err = null, entry = null;
    for (let a = 1; a <= 3 && !entry; a++) {
      try {
        const r = await fetchImpl(alplakesPointUrl(key, nowMs), { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
        if (r.status === 429 || r.status >= 500) {
          err = `HTTP ${r.status}`;
          const ra = Number(r.headers?.get?.('retry-after'));
          if (a < 3) await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 120) * 1000 : pauseMs * 4 * a);
          continue;
        }
        if (!r.ok) { err = `HTTP ${r.status}`; break; }
        const b = alplakesBasinOf(await r.json());
        if (typeof b === 'string') { err = b; break; }
        entry = b;
      } catch (e) { err = String(e?.message ?? e).split('\n')[0]; if (a < 3) await sleep(pauseMs * 2 * a); }
    }
    if (entry) { basins[key] = entry; dead = 0; } else { failed.push({ key, error: err ?? 'keine Antwort' }); dead++; }
    await sleep(pauseMs);
  }
  log(`Wassertemperatur der Seen: ${Object.keys(basins).length}/${keys.length} Becken, ${failed.length} ohne`);
  return { basins, failed };
}

export async function buildLakeWt({ storeDir, nowMs = Date.now(), fetchImpl = fetch, pauseMs = ALPLAKES.pauseMs, log = () => {}, killed = process.env.SEA_KILL === '1' || process.env.SEA_LAKES_WT === '0' }) {
  if (killed) return { built: false, reason: 'ausgeschaltet (SEA_KILL=1 oder SEA_LAKES_WT=0)' };
  const cat = readLakeCatalog(storeDir);
  if (!cat) return { built: false, reason: 'kein Seekatalog' };
  const keys = [...new Set(cat.spots.map((s) => s.lake.model?.key).filter(Boolean))].sort();
  if (!keys.length) return { built: false, reason: 'kein Seespot mit Modellbecken' };
  const st = readStatus(storeDir);
  const last = st.lakesWt?.builtAt ? Date.parse(st.lakesWt.builtAt) : NaN;
  if (Number.isFinite(last) && nowMs - last < SEA_LAKES_WT_EVERY_MS && existsSync(join(storeDir, String(st.lakesWt.path)))) return { built: false, reason: `jünger als ${SEA_LAKES_WT_EVERY_MS / H} h` };
  const { basins, failed } = await collectLakeWt({ keys, nowMs, fetchImpl, pauseMs, log });
  if (!Object.keys(basins).length) throw new Error(`Wassertemperatur der Seen: kein Becken mit Antwort — ${failed[0]?.error ?? 'Grund unbekannt'}; nichts geschrieben`);
  const stamp = new Date(nowMs).toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const doc = {
    schema: 1, product: SEA_LAKES_WT_PRODUCT, stamp, builtAt: new Date(nowMs).toISOString(), source: ALPLAKES.model, licence: ALPLAKES.licence, credit: ALPLAKES.credit, depthM: ALPLAKES.depthM,
    about: 'Wassertemperatur der Seen aus dem 1D-Modell Simstrat von Alplakes (Eawag) in 1 m Tiefe, ein Wert je Becken und drei Stunden, in 0,1 °C. Ein Modell für das ganze Becken, keine Messung am Spot.',
    basins, failed,
  };
  const pr = lakesWtProblems(doc);
  if (pr.length) throw new Error(`Wassertemperatur der Seen: Wertsperre — ${pr.slice(0, 3).join('; ')}; nichts geschrieben`);
  const path = seaLakesWtPath(stamp), text = JSON.stringify(doc) + '\n';
  writeAtomic(join(storeDir, path), text);
  st.lakesWt = { stamp, path, builtAt: doc.builtAt, basins: Object.keys(basins).length, failed: failed.length, bytes: Buffer.byteLength(text) };
  const removed = pruneLakes(storeDir);
  writeStatus(storeDir, st, nowMs);
  return { built: true, stamp, path, basins: Object.keys(basins).length, failed, removed, bytes: st.lakesWt.bytes };
}

// --- CLI ----------------------------------------------------------------------------------------------------------
async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const storeDir = resolve(String(args.store ?? 'sea/v1'));
  const nowMs = typeof args.now === 'string' ? Date.parse(args.now) : Date.now();
  const log = (m) => console.log(`[sea-lakes] ${m}`);
  if (process.env.SEA_LAKES === '0') { log('ausgeschaltet (SEA_LAKES=0)'); console.log(JSON.stringify({ built: false, reason: 'SEA_LAKES=0' })); return; }
  const rawIndexT1 = async () => {
    try { const r = await fetch('https://raw.githubusercontent.com/jppetry/buscosun-data/main/point/index.json', { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30_000) }); return r.ok ? indexT1Of(await r.json()) : null; } catch { return null; }
  };
  if (args.check) { console.log(JSON.stringify(lakesDue(storeDir, await rawIndexT1()))); return; }
  const out = {};
  let bad = false;
  if (args.only !== 'wt') {
    try {
      if (typeof args.data !== 'string') out.wind = { built: false, reason: 'kein Cube-Checkout (--data)' };
      else {
        const dataDir = args.data === 'cdn' ? 'cdn' : resolve(args.data);
        const t1 = dataDir === 'cdn' ? await rawIndexT1() : indexT1Of(readJson(join(dataDir, 'point', 'index.json')));
        out.wind = await buildLakes({ storeDir, dataDir, nowMs, indexT1: t1, log, repack: typeof args.repack === 'string' ? dirRepack(resolve(args.repack)) : httpRepack() });
      }
      log(out.wind.built ? `Seen ${out.wind.run} · t1 ${out.wind.t1} geschrieben (${out.wind.spots}/${out.wind.of} Spots)` : `keine Rechnung für die Seen: ${out.wind.reason}`);
    } catch (e) { bad = true; out.wind = { built: false, error: String(e?.message ?? e).split('\n')[0] }; log(`FEHLER: ${out.wind.error}`); }
  }
  if (args.only !== 'wind') {
    try {
      out.wt = await buildLakeWt({ storeDir, nowMs, log });
      log(out.wt.built ? `Wassertemperatur ${out.wt.stamp} geschrieben (${out.wt.basins} Becken, ${out.wt.failed.length} ohne)` : `keine neue Wassertemperatur: ${out.wt.reason}`);
    } catch (e) { bad = true; out.wt = { built: false, error: String(e?.message ?? e).split('\n')[0] }; log(`FEHLER: ${out.wt.error}`); }
  }
  console.log(JSON.stringify(out));
  if (bad) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) await main();
