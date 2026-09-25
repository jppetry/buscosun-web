/**
 * features.mjs — the static per-point feature table of phase FL (FL-AP1; `audit/fusion-lernphase.md` §4, §9).
 *
 * One row per archive point (`scripts/punktarchiv/points.json`, 405): terrain (Terrarium z11 + z8 through the SAME
 * loader as the browser, `loadTerrainAtPoint`), land cover / z0 / d_water (WorldCover mirror, the loader's own class
 * field), the lake distance at ≥ 1 km² (V-FL-6, same tiles), the urban raster (`static/urban/v1`, jsDelivr), the model
 * height per source at the nearest cell and the 2×2 block (hindcast `cells/<tier>.json`, no network), the nearest
 * radiosonde (IGRA2, no network), height bands and the 1° tile.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fusionfit/features.mjs
 *       [--out=C:\dev\buscosun-hindcast\features\points.v1.json] [--root=C:\dev\buscosun-hindcast]
 *       [--only=10865,11035] [--limit=N] [--concurrency=4] [--force] [--timeout=20000]
 *
 * Idempotent: rows already in the output file are kept unless `--force`; tile bytes and finished per-point results
 * live in `<root>\cache\tiles` (disk cache, never swept). The header carries the code hash, the WorldCover mirror SHA,
 * the cells commit and the index commit of the urban read, so a fit can name the table it used.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { decodePng, toRgba } from '../lib/png.mjs';
import { loadPointList } from '../punktarchiv/points.mjs';
import { loadTierCells } from '../hindcast/lib/cellsio.mjs';
import { HINDCAST_ROOT, codeHash, parseArgs } from '../hindcast/lib/common.mjs';
import { diskBackend } from './lib/diskCache.mjs';
import { FEATURES_SCHEMA, FEATURES_KIND, TIERS, featureRow, hmodelOfPoint, nearestSonde, lakeMinBodyPx, stableStringify, LAKE_MIN_M2 } from './lib/featureLib.mjs';
import { loadTerrainAtPoint, TERRAIN_SCALES } from '../../src/point/client/terrain.ts';
import { loadWorldCoverTiles, classAtOf, Z0_SOURCE } from '../../src/point/client/z0Point.ts';
import { landCoverFromClassField, windowFromTiles, dWaterFromWindow, LANDCOVER_SET } from '../../src/point/client/landCover.ts';
import { WC_MIRROR_SHA } from '../../src/fire/detail/worldCover.ts';
import { httpStore, withRawFallback } from '../../src/point/client/store.ts';
import { readUrbanPoint, URBAN_PRODUCT, URBAN_VERSION } from '../../src/point/client/staticPoint.ts';
import { POINT_INDEX_PATH } from '../../src/point/cubeFormat.ts';

const flags = parseArgs(process.argv.slice(2));
const root = typeof flags.root === 'string' ? flags.root : HINDCAST_ROOT;
const out = typeof flags.out === 'string' ? flags.out : join(root, 'features', 'points.v1.json');
const timeoutMs = Number(flags.timeout) || 20_000;
const concurrency = Math.max(1, Number(flags.concurrency) || 4);
const only = typeof flags.only === 'string' ? new Set(flags.only.split(',').map((s) => s.trim())) : null;
const limit = Number(flags.limit) || Infinity;
const force = flags.force === true;
/** `--redo=noUrban,noLandCover`: rebuild the rows that carry one of these flags (a rerun after a CDN hiccup, V-FI-5). */
const redo = typeof flags.redo === 'string' ? new Set(flags.redo.split(',').map((s) => s.trim())) : null;

const say = (s) => console.log(`[features] ${s}`);
const decodeRgba = (b) => { const png = decodePng(b); return { data: toRgba(png), width: png.width, height: png.height }; };

function loadSondes(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json.gz')) continue;
    try {
      const doc = JSON.parse(gunzipSync(readFileSync(join(dir, f))).toString('utf8'));
      out.push({ id: doc.station ?? f.replace(/\.json\.gz$/, ''), name: doc.name ?? null, lat: doc.lat, lon: doc.lon, elev: doc.elev });
    } catch (e) { say(`IGRA ${f} nicht lesbar: ${e?.message ?? e}`); }
  }
  return out;
}

async function withRetry(label, fn, tries = 3) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    try { const r = await fn(); if (r != null) return r; last = new Error('kein Ergebnis'); } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  say(`${label}: nach ${tries} Versuchen ohne Ergebnis (${last?.message ?? last})`);
  return null;
}

async function main() {
  const T0 = Date.now();
  const points = loadPointList();
  const cells = Object.fromEntries(TIERS.map((t) => [t, loadTierCells(t, root)]));
  const cellsCommit = cells.t1?.hmodel?.commit ?? null;
  const summary = existsSync(join(root, 'cells', 'summary.json')) ? JSON.parse(readFileSync(join(root, 'cells', 'summary.json'), 'utf8')) : null;
  const sondes = loadSondes(join(root, 'igra'));
  const tileCache = diskBackend(join(root, 'cache', 'tiles'), { keep: true });
  // jsDelivr answers a fresh static chunk with 403 for seconds (V-FI-5); the raw fallback (hedge 2,5 s) is the
  // same route the bundle reader takes in the browser.
  const store = withRawFallback(httpStore({ timeoutMs, retries: 2 }));
  const index = await store.json(POINT_INDEX_PATH).catch(() => null);
  const urbanManifest = await store.json(`point/static/${URBAN_PRODUCT}/${URBAN_VERSION}/static.json`).catch(() => null);

  const existing = !force && existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
  const reusable = existing?.byPoint && existing.schema === FEATURES_SCHEMA && existing.wcMirrorSha === WC_MIRROR_SHA && existing.cellsCommit === cellsCommit;
  const byPoint = reusable ? { ...existing.byPoint } : {};
  if (existing && !reusable) say('vorhandene Tabelle passt nicht zu Spiegel/Zellen/Schema — wird neu gebaut');

  const needsRedo = (p) => !!redo && !!byPoint[p.id] && byPoint[p.id].flags.some((f) => redo.has(f));
  const todo = points.points.filter((p) => (!only || only.has(p.id)) && (force || !byPoint[p.id] || needsRedo(p))).slice(0, limit);
  say(`${points.points.length} Punkte, ${Object.keys(byPoint).length} vorhanden, ${todo.length} zu bauen, ${sondes.length} Radiosonden, Zellen-Commit ${String(cellsCommit).slice(0, 7)}, urban-Manifest ${urbanManifest ? 'da' : 'FEHLT'}`);

  let done = 0, failed = 0;
  const one = async (p) => {
    const t0 = Date.now();
    const terrain = await withRetry(`${p.id} terrain`, async () => {
      const r = await loadTerrainAtPoint(p.lat, p.lon, { decodeRgba, cache: tileCache, timeoutMs });
      return r && r.elevationM != null && r.tiles.failed === 0 ? r : null;
    });
    // Land cover, z0 and d_water from the loader's own class field — and the lake distance from the SAME window (V-FL-6).
    let landCover = null, dLake = null;
    const tiles = await withRetry(`${p.id} worldcover`, async () => {
      const t = await loadWorldCoverTiles(p.lat, p.lon, { cache: tileCache, timeoutMs });
      return t && t.usable.length ? t : null;
    });
    if (tiles) {
      const win = windowFromTiles(tiles.usable, p.lat, p.lon);
      landCover = { ...landCoverFromClassField(classAtOf(tiles.usable), p.lat, p.lon, win), source: Z0_SOURCE };
      if (win) {
        const minPx = lakeMinBodyPx(win.pxW, win.pxH);
        dLake = minPx ? { ...dWaterFromWindow(win, minPx), minBodyPx: minPx } : null;
      }
    }
    const urban = urbanManifest ? await withRetry(`${p.id} urban`, () => readUrbanPoint(store, p.lat, p.lon, { manifest: urbanManifest, priority: 'low' }), 2) : null;
    const hmodel = Object.fromEntries(TIERS.map((t) => [t, hmodelOfPoint(cells[t], p.id)]));
    const sonde = nearestSonde(p.lat, p.lon, p.elev, sondes);
    const row = featureRow(p, { terrain, landCover, dLake, urban, hmodel, sonde });
    row.builtMs = Date.now() - t0;
    byPoint[p.id] = row;
    done += 1;
    if (row.flags.includes('noTerrain')) failed += 1;
    if (done % 25 === 0 || done === todo.length) say(`${done}/${todo.length} · ${p.id} ${p.name} (${p.country}) ${row.flags.length ? row.flags.join(',') : 'ok'} · ${Math.round((Date.now() - T0) / 1000)} s · Kacheln hit ${tileCache.stats.hits} / put ${tileCache.stats.puts}`);
  };
  // A small worker pool: the loaders are network-bound, four in flight keeps S3/jsDelivr happy.
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, async () => {
    while (i < todo.length) { const p = todo[i++]; try { await one(p); } catch (e) { failed += 1; say(`${p.id}: ${e?.message ?? e}`); } }
  }));

  const rows = Object.values(byPoint);
  const doc = {
    schema: FEATURES_SCHEMA, kind: FEATURES_KIND,
    builtAt: new Date().toISOString(), codeHash: codeHash(),
    pointsFrom: { file: 'scripts/punktarchiv/points.json', builtAt: points.builtAt ?? null, total: points.points.length },
    wcMirrorSha: WC_MIRROR_SHA, terrainScales: TERRAIN_SCALES, landCoverSet: LANDCOVER_SET, lakeMinM2: LAKE_MIN_M2,
    cellsCommit, cellsBuiltAt: summary?.builtAt ?? null,
    urban: { product: URBAN_PRODUCT, version: URBAN_VERSION, indexCommit: index?.commit ?? null, manifestUpdatedAt: urbanManifest?.updatedAt ?? null, note: 'static product read from @main at build time (in-place mutable, V-FI-1); the index commit names the publish it belonged to' },
    sondes: sondes.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, elev: s.elev })),
    counts: {
      points: rows.length,
      noTerrain: rows.filter((r) => r.flags.includes('noTerrain')).length,
      noLandCover: rows.filter((r) => r.flags.includes('noLandCover')).length,
      noUrban: rows.filter((r) => r.flags.includes('noUrban')).length,
      demVsStationGt100: rows.filter((r) => r.flags.includes('demVsStationGt100')).length,
      lakeFound: rows.filter((r) => r.dLake?.reason === 'found').length,
      byCountry: Object.fromEntries([...new Set(rows.map((r) => r.country))].sort().map((c) => [c, rows.filter((r) => r.country === c).length])),
    },
    byPoint: Object.fromEntries(rows.sort((a, b) => a.id.localeCompare(b.id)).map((r) => [r.id, r])),
  };
  mkdirSync(dirname(out), { recursive: true });
  const tmp = `${out}.${process.pid}.tmp`;
  writeFileSync(tmp, stableStringify(doc, 1));
  renameSync(tmp, out);
  say(`geschrieben ${out}: ${rows.length} Punkte, noTerrain ${doc.counts.noTerrain}, noLandCover ${doc.counts.noLandCover}, noUrban ${doc.counts.noUrban}, Seen ${doc.counts.lakeFound}, DEM≠Station>100 m ${doc.counts.demVsStationGt100}; ${failed} Fehlschläge; ${Math.round((Date.now() - T0) / 1000)} s`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
