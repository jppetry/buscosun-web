#!/usr/bin/env node
/**
 * AW-6.2.7 — store of the virtual road sensor in `jppetry/buscosun-archiv` `road/vs/v1/` (`audit/autobahnwetter.md` §20.13):
 * the data repo keeps three runs; Gate G (6.2.8) needs forecasts and shadow pairs for months. Each archive run (every 3 h with
 * the road archive) stores every product run of the data repo that is not yet there, THINNED:
 *
 *   <YYYY-MM-DD>/<run>.json.gz   station points only (the measurable ones), every series, leads 0 … 48, engine block; plus the
 *                                forcing of the same run at those stations for the baselines of Gate G (`tg`, `t2m`, `td2m`),
 *                                and the shadow pairs of the run (model − GMA at the measuring hour).
 *   index.json                   runs per day (points, pairs, bytes). A stored run is never rewritten.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/vs/archive-vs.mjs \
 *     --store=<buscosun-data>/road/vs/v1 --archive=<buscosun-archiv>/road/vs/v1
 * Exit 0 = stored or nothing new · 1 = store unreadable. `thinRun` is pure.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { ROAD_VS_INDEX_PATH, roadVsShadowPath } from '../../../src/road/vs/roadVsProduct.ts';
import { roadVsForcingPath } from '../../../src/road/vs/roadVsForcing.ts';

export const VS_ARCHIVE_SCHEMA = 1;
/** Forcing fields kept at the stations (baselines ICON T_G and T2m of Gate G; the dew point for the weather class). */
export const VS_ARCHIVE_FORCING_FIELDS = Object.freeze(['tg', 't2m', 'td2m', 'clct', 'u10', 'v10', 'prr', 'prs', 'frz']);

const dayOf = (run) => `${run.slice(0, 4)}-${run.slice(4, 6)}-${run.slice(6, 8)}`;
export const vsArchivePath = (run) => `${dayOf(run)}/${run}.json.gz`;
function writeAtomic(p, body) { mkdirSync(dirname(p), { recursive: true }); writeFileSync(`${p}.tmp`, body); renameSync(`${p}.tmp`, p); }

/** Product files of a run + forcing + shadow lines → the archive document. Pure. */
export function thinRun({ run, files, forcing = null, shadow = [] }) {
  const stations = {};
  let engine = null, t0Ms = null, steps = null;
  for (const doc of files) {
    engine ??= doc.engine; t0Ms ??= doc.t0Ms; steps ??= doc.steps;
    for (const p of doc.points) {
      if (p.kind !== 'station') continue;
      stations[p.id] = { lat: p.lat, lon: p.lon, bridge: p.bridge, kaltstart: p.kaltstart, ...(p.couple ? { couple: p.couple } : {}), ...(p.corr ? { corr: p.corr } : {}), v: p.v };
    }
  }
  const fc = {};
  if (forcing) for (const p of forcing.points) if (stations[p.id]) fc[p.id] = Object.fromEntries(VS_ARCHIVE_FORCING_FIELDS.filter((k) => p.v[k]).map((k) => [k, p.v[k]]));
  return {
    schema: VS_ARCHIVE_SCHEMA, product: 'road-vs-archive', run, t0Ms, steps, engine,
    forcing: forcing ? { run: forcing.run, fields: [...VS_ARCHIVE_FORCING_FIELDS], scale: 'wie roadVsForcing.ts', points: fc } : null,
    shadow, counts: { stations: Object.keys(stations).length, forcing: Object.keys(fc).length, shadow: shadow.length },
    stations: Object.fromEntries(Object.keys(stations).sort().map((k) => [k, stations[k]])),
  };
}

export function archiveVs({ storeDir, archiveDir, log = () => {} }) {
  const idxFile = join(storeDir, ROAD_VS_INDEX_PATH);
  if (!existsSync(idxFile)) throw new Error('road/vs/v1/index.json fehlt im Daten-Repo');
  const idx = JSON.parse(readFileSync(idxFile, 'utf8'));
  const aIdxFile = join(archiveDir, 'index.json');
  const aIdx = existsSync(aIdxFile) ? JSON.parse(readFileSync(aIdxFile, 'utf8')) : { schema: VS_ARCHIVE_SCHEMA, product: 'road-vs-archive-index', updatedAt: null, days: {} };
  let stored = 0;
  for (const r of [...(idx.runs ?? [])].sort((a, b) => (a.run < b.run ? -1 : 1))) {
    const target = join(archiveDir, vsArchivePath(r.run));
    if (existsSync(target)) continue;
    const runDir = join(storeDir, r.run);
    if (!existsSync(runDir)) continue;
    const files = [];
    for (const sub of ['c', 's']) { const d = join(runDir, sub); if (!existsSync(d)) continue; for (const f of readdirSync(d)) { try { files.push(JSON.parse(readFileSync(join(d, f), 'utf8'))); } catch { /* skipped */ } } }
    if (!files.length) continue;
    const ff = join(storeDir, roadVsForcingPath(r.run));
    const forcing = existsSync(ff) ? JSON.parse(gunzipSync(readFileSync(ff)).toString('utf8')) : null;
    const sf = join(storeDir, roadVsShadowPath(r.run));
    const shadow = existsSync(sf) ? gunzipSync(readFileSync(sf)).toString('utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    const doc = thinRun({ run: r.run, files, forcing, shadow });
    const gz = gzipSync(JSON.stringify(doc), { level: 9 });
    writeAtomic(target, gz);
    (aIdx.days[dayOf(r.run)] ??= []).push({ run: r.run, stations: doc.counts.stations, shadow: doc.counts.shadow, bytes: gz.length });
    aIdx.days[dayOf(r.run)].sort((a, b) => (a.run < b.run ? -1 : 1));
    stored++;
    log(`${r.run}: ${doc.counts.stations} Stationen, ${doc.counts.shadow} Schattenpaare, ${(gz.length / 1024).toFixed(0)} KB gz`);
  }
  if (stored || !existsSync(aIdxFile)) {
    aIdx.updatedAt = new Date().toISOString();
    writeAtomic(aIdxFile, `${JSON.stringify(aIdx, null, 1)}\n`);
    writeAtomic(join(archiveDir, 'README.md'), '# road/vs/v1 — virtueller Fahrbahnsensor (Schattenbetrieb)\n\nJe Lauf eine Datei `<Tag>/<Lauf>.json.gz`: Stationspunkte mit allen Reihen 0 … 48 h, Antrieb (ICON T_G, T2m, Td, Bewölkung, Wind, Niederschlag) an den Stationen, Schattenpaare Modell − GMA. Einmal geschrieben, nie neu. Zweck: Gate G (buscosun-web audit/autobahnwetter.md §20).\n');
  }
  return { stored };
}

async function main() {
  const flags = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
  if (!flags.store || !flags.archive) { console.error('--store=<buscosun-data>/road/vs/v1 und --archive=<buscosun-archiv>/road/vs/v1 fehlen'); process.exit(2); }
  const r = archiveVs({ storeDir: flags.store, archiveDir: flags.archive, log: (m) => console.log(`[vs-archiv] ${m}`) });
  console.log(`[vs-archiv] ${r.stored} Läufe abgelegt`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
