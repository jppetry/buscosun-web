#!/usr/bin/env node
/**
 * GL Gate E — day archive of the melt line in `buscosun-archiv` `glacier/v1/<YYYY-MM-DD>/melt-<run>.json.gz`:
 * the lead glaciers' rows (`lead: true` in the catalogue) of every melt run. The runs themselves stay in `buscosun-data` for 72 h
 * only (`GLACIER_MELT_KEEP_MS`), so the archive is the only record Gate E (summer 2027, model against measurement) can use.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/glacier-archive.mjs \
 *        --melt=<buscosun-data glacier/v1/melt> --catalog=<static build catalog.json> --archive=<buscosun-archiv glacier/v1> --out=<dir>
 *
 * Writes `<out>/<day>/melt-<run>.json.gz` for every run that the archive does not hold yet (the day = the run's UTC day) and prints one
 * JSON line; the workflow hands each day directory to `glacier-publish.mjs --archive` (add only, never --force). Nothing here touches the archive.
 *
 * Phase GM (GM-4, E-GM-21): with `--pairs=<buscosun-data glacier/v1/snowpack/pairs>` also the shadow pairs of the snowpack line, one file per run as
 * `<out>/<day>/pairs-<run>.json.gz` (the files stay in the data repo for 72 h only). Without `--pairs` the archive does exactly what it did before; a
 * missing pairs directory (the switch is off on the runner) archives nothing and says so.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { GLACIER_MELT_RUN_RE, meltLeadDoc } from '../../src/glacier/glacierMeltContract.ts';
import { snowpackPairsProblems } from '../../src/glacier/glacierSnowpackPairsContract.ts';

const SELF = fileURLToPath(import.meta.url);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
/** UTC day of a run stamp `YYYYMMDDHH`. */
export const runDay = (run) => `${run.slice(0, 4)}-${run.slice(4, 6)}-${run.slice(6, 8)}`;

export function archiveMelt({ meltDir, catalogFile, archiveDir, outDir, log = () => {} }) {
  const catalog = readJson(catalogFile);
  const leads = new Set((catalog.glaciers ?? []).filter((g) => g.lead).map((g) => g.id));
  if (!leads.size) throw new Error('Katalog ohne Leitgletscher — Abbruch statt leerer Ablage');
  const runs = (existsSync(meltDir) ? readdirSync(meltDir) : []).filter((f) => GLACIER_MELT_RUN_RE.test(f.replace(/\.json$/, '')) && f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
  const written = [], held = [];
  for (const run of runs) {
    const day = runDay(run), name = `melt-${run}.json.gz`;
    if (existsSync(join(archiveDir, day, name))) { held.push(run); continue; }
    const doc = readJson(join(meltDir, `${run}.json`));
    const lead = meltLeadDoc(doc, leads);
    if (!lead.glaciers.length) { log(`${run}: keine Leitgletscher-Zeile — übersprungen`); continue; }
    const dst = join(outDir, day, name);
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, gzipSync(Buffer.from(JSON.stringify(lead)), { level: 9, mtime: 0 }));
    written.push(run);
  }
  return { runs: runs.length, written, held: held.length, leads: leads.size };
}

/** GM-4 (E-GM-21): every pairs file the archive does not hold yet, gzipped as it is (one name per run, add only). A file that breaks its contract is not archived and named. */
export function archivePairs({ pairsDir, archiveDir, outDir, log = () => {} }) {
  const runs = (existsSync(pairsDir) ? readdirSync(pairsDir) : []).filter((f) => /^\d{10}\.json$/.test(f)).map((f) => f.slice(0, -5)).sort();
  const written = [], held = [], refused = [];
  for (const run of runs) {
    const day = runDay(run), name = `pairs-${run}.json.gz`;
    if (existsSync(join(archiveDir, day, name))) { held.push(run); continue; }
    const raw = readFileSync(join(pairsDir, `${run}.json`));
    let doc = null;
    try { doc = JSON.parse(raw.toString('utf8')); } catch { /* refused below */ }
    const problems = doc ? snowpackPairsProblems(doc) : ['kein JSON'];
    if (problems.length || doc.run !== run) { refused.push(run); log(`${run}: Schattenpaare nicht abgelegt (${problems[0] ?? 'Name und Lauf verschieden'})`); continue; }
    const dst = join(outDir, day, name);
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, gzipSync(raw, { level: 9, mtime: 0 }));
    written.push(run);
  }
  return { dir: existsSync(pairsDir), runs: runs.length, written, held: held.length, refused };
}

/**
 * GM-11 (V-GM-139): the forcing and the snowpack rows of the glaciers with a snow station, one file per run as `<out>/<day>/forcing-<run>.json.gz`
 * (the weather runs, the snowpack rows and the status stay in the data repo for 72 h only; without them a shadow pair cannot be taken apart later).
 * `storeDir` = `glacier/v1` of buscosun-data with `melt/wx/`, `snowpack/`, `snowpack/pairs/` and `stn/map/`. Per run: the hourly rows `t p s sn sl`
 * of every glacier with a snow station and of the glacier whose forcing it runs on (`f` ≠ own), the rows `z f hs swe hn gap` of the glaciers with a
 * station, and the head of the snowpack document (state, factor per region, density). Add only; a run without its snowpack document or without
 * a station mapping is named and not archived. Without `--forcing` the archive does exactly what it did before.
 */
export function archiveForcing({ storeDir, archiveDir, outDir, log = () => {} }) {
  const wxDir = join(storeDir, 'melt', 'wx'), spDir = join(storeDir, 'snowpack'), mapDir = join(storeDir, 'stn', 'map');
  const runs = (existsSync(wxDir) ? readdirSync(wxDir) : []).filter((f) => /^\d{10}$/.test(f)).sort();
  const maps = existsSync(mapDir) ? readdirSync(mapDir).filter((f) => f.endsWith('.json')).sort() : [];
  const written = [], held = [], refused = [];
  let bytes = 0;
  for (const run of runs) {
    const day = runDay(run), name = `forcing-${run}.json.gz`;
    if (existsSync(join(archiveDir, day, name))) { held.push(run); continue; }
    const spFile = join(spDir, `${run}.json`);
    if (!existsSync(spFile)) { refused.push({ run, why: 'kein snowpack-Dokument' }); continue; }
    const sp = readJson(spFile);
    const prFile = join(spDir, 'pairs', `${run}.json`);
    const mapName = existsSync(prFile) ? `${readJson(prFile).stations?.map}.json` : maps[maps.length - 1];
    if (!mapName || !existsSync(join(mapDir, mapName))) { refused.push({ run, why: `Zuordnung ${mapName ?? '–'} fehlt` }); continue; }
    const map = readJson(join(mapDir, mapName));
    const withStation = new Set(Object.entries(map.ext?.glaciers ?? {}).filter(([, g]) => g?.snow).map(([id]) => id));
    if (!withStation.size) { refused.push({ run, why: 'Zuordnung ohne Schneestationen (ext)' }); continue; }
    const rows = {}, owners = new Set();
    for (const g of sp.glaciers ?? []) if (withStation.has(g.id)) { rows[g.id] = { z: g.z, f: g.f, hs: g.hs, swe: g.swe, hn: g.hn, ...(g.gap ? { gap: g.gap } : {}) }; if (g.f && g.f !== 'own') owners.add(g.f); }
    const hourly = {};
    for (const f of readdirSync(join(wxDir, run)).filter((x) => x.endsWith('.json')).sort()) {
      const d = readJson(join(wxDir, run, f));
      for (const [id, g] of Object.entries(d.glaciers ?? {})) if (withStation.has(id) || owners.has(id)) { const o = { region: f.slice(0, -5) }; for (const k of ['t', 'p', 's', 'sn', 'sl']) if (g[k] != null) o[k] = g[k]; hourly[id] = o; }
    }
    const doc = {
      schema: 1, kind: 'glacier/snowpack-forcing', run, runAt: sp.runAt, map: mapName.slice(0, -5), origin: 'model',
      note: 'Antrieb (buscosun Fusion, Stundenwerte ab der Laufstunde) und Schneedecken-Zeilen der Gletscher mit Schneestation; Abschrift für die Zerlegung der Schattenpaare',
      engine: sp.engine ?? null, state: sp.state ?? null, rules: { precip: sp.rules?.precip ? { rule: sp.rules.precip.rule, regions: Object.fromEntries(Object.entries(sp.rules.precip.regions ?? {}).map(([k, v]) => [k, v.F])) } : null, density: sp.rules?.density ?? null },
      counts: { withStation: withStation.size, rows: Object.keys(rows).length, hourly: Object.keys(hourly).length, owners: owners.size },
      rows, hourly,
    };
    const buf = gzipSync(Buffer.from(JSON.stringify(doc)), { level: 9, mtime: 0 });
    const dst = join(outDir, day, name);
    mkdirSync(dirname(dst), { recursive: true }); writeFileSync(dst, buf);
    written.push(run); bytes += buf.length;
  }
  for (const r of refused) log(`${r.run}: ${r.why} — nicht abgelegt`);
  return { dir: existsSync(wxDir), runs: runs.length, written, held: held.length, refused, bytes };
}

/**
 * GM-11 (V-GM-139): the measured 24-h precipitation (`precipsum/v1`, DE RW/SF, AT INCA, CH CombiPrecip) at the cell of every snow station, for each
 * precipsum run that ends at 17 UTC (the hour of the 24-h windows of the shadow pairs), as `<out>/<day>/precipsum24-<end>.json.gz` — the product keeps
 * three runs only. `cellValue(png, lat, lon)` reads one cell (handed in, so this file needs no image code). Add only.
 */
export function archivePrecipsum({ psDir, mapFile, archiveDir, outDir, readCell, log = () => {} }) {
  const dirs = (existsSync(psDir) ? readdirSync(psDir) : []).filter((d) => /^\d{8}17-/.test(d)).sort();
  if (!dirs.length) return { dir: existsSync(psDir), runs: 0, written: [] };
  const map = readJson(mapFile), stations = map.ext?.stations ?? {};
  const ids = [...new Set(Object.values(map.ext?.glaciers ?? {}).map((g) => g?.snow?.[0]).filter(Boolean))].sort();
  const written = [];
  for (const d of dirs) {
    const end = d.slice(0, 10), day = runDay(end), name = `precipsum24-${end}.json.gz`;
    if (existsSync(join(archiveDir, day, name))) continue;
    const png = join(psDir, d, 'sum-024h.png');
    if (!existsSync(png)) { log(`${d}: sum-024h.png fehlt`); continue; }
    const values = {};
    for (const id of ids) { const s = stations[id]; values[id] = s ? readCell(png, s.lat, s.lon) : null; }
    const doc = { schema: 1, kind: 'glacier/precipsum24-at-stations', end, dir: d, origin: 'analysis', unit: 'mm', note: 'gemessene 24-h-Summe (DE RW/SF, AT INCA, CH CombiPrecip) an der Zelle jeder Schneestation', map: map.file ?? null, values };
    const dst = join(outDir, day, name);
    mkdirSync(dirname(dst), { recursive: true }); writeFileSync(dst, gzipSync(Buffer.from(JSON.stringify(doc)), { level: 9, mtime: 0 }));
    written.push(end);
  }
  return { dir: true, runs: dirs.length, written };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  for (const k of ['melt', 'catalog', 'archive', 'out']) if (!args[k] || args[k] === true) { console.error(`--${k}=<Pfad> fehlt`); process.exit(2); }
  const res = archiveMelt({ meltDir: resolve(args.melt), catalogFile: resolve(args.catalog), archiveDir: resolve(args.archive), outDir: resolve(args.out), log: (m) => console.error(m) });
  if (args.pairs && args.pairs !== true) res.pairs = archivePairs({ pairsDir: resolve(args.pairs), archiveDir: resolve(args.archive), outDir: resolve(args.out), log: (m) => console.error(m) });
  if (args.forcing && args.forcing !== true) res.forcing = archiveForcing({ storeDir: resolve(args.forcing), archiveDir: resolve(args.archive), outDir: resolve(args.out), log: (m) => console.error(m) });
  if (args.precipsum && args.precipsum !== true) {
    const { decodePng, toRgba } = await import('../lib/png.mjs');
    const { G } = await import('../../src/scalar/precipIndexMap.ts');
    const { PAST_SUM_UNIT_MM } = await import('../../src/precipSums/pastSumFormat.ts');
    const memo = new Map();
    const readCell = (png, lat, lon) => {
      if (!memo.has(png)) memo.set(png, toRgba(decodePng(readFileSync(png))));
      const px = memo.get(png), r = Math.floor(((G.latMax - lat) / (G.latMax - G.latMin)) * G.h), c = Math.floor(((lon - G.lonMin) / (G.lonMax - G.lonMin)) * G.w);
      if (r < 0 || r >= G.h || c < 0 || c >= G.w) return null;
      const o = 4 * (r * G.w + c);
      return px[o + 3] === 255 ? Math.round(((px[o] << 16) | (px[o + 1] << 8) | px[o + 2]) * PAST_SUM_UNIT_MM * 100) / 100 : null;
    };
    // the station mapping the newest pairs file names (stores beside `--forcing`)
    const store = args.forcing && args.forcing !== true ? resolve(args.forcing) : null;
    const prDir = store ? join(store, 'snowpack', 'pairs') : null;
    const newest = prDir && existsSync(prDir) ? readdirSync(prDir).filter((f) => /^\d{10}\.json$/.test(f)).sort().pop() : null;
    const mapName = newest ? readJson(join(prDir, newest)).stations?.map : null;
    const mapFile = mapName ? join(store, 'stn', 'map', `${mapName}.json`) : null;
    res.precipsum = mapFile && existsSync(mapFile) ? archivePrecipsum({ psDir: resolve(args.precipsum), mapFile, archiveDir: resolve(args.archive), outDir: resolve(args.out), readCell, log: (m) => console.error(m) }) : { error: 'keine Stationszuordnung (Paare + stn/map unter --forcing)' };
  }
  console.log(JSON.stringify(res));
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) main();
