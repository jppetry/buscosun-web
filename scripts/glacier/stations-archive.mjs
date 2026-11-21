#!/usr/bin/env node
/**
 * Phase GO — archive of the station hours in `buscosun-archiv` `glacier/v1/<YYYY-MM-DD>/stn-<yyyymmddhh>.json.gz`
 * (`audit/gletscher-stationen.md`): every hour document of `glacier/v1/stn/h/` exactly as published, plus the catalogue whenever
 * it changed (`stn-stations-<builtAt>.json.gz`, the name carries its build time). The hour files stay in `buscosun-data` for 72 h only
 * (`GLACIER_STN_KEEP_MS`); the archive is the record the high-elevation validation and Gate E read.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/stations-archive.mjs \
 *        --stn=<buscosun-data glacier/v1/stn> --archive=<buscosun-archiv glacier/v1> --out=<dir>
 *
 * Writes `<out>/<day>/…` for every file the archive does not hold yet (day = the UTC day of the hour) and prints one JSON line; the
 * workflow hands each day directory to `glacier-publish.mjs --archive` (add only, never --force). Nothing here touches the archive.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { GLACIER_STN_HOUR_RE, stnHourProblems } from '../../src/glacier/glacierStationContract.ts';

const SELF = fileURLToPath(import.meta.url);
/** UTC day of an hour key `yyyymmddhh`. */
export const hourDay = (hour) => `${hour.slice(0, 4)}-${hour.slice(4, 6)}-${hour.slice(6, 8)}`;
export const stnArchiveName = (hour) => `stn-${hour}.json.gz`;
const gz = (bytes) => gzipSync(bytes, { level: 9, mtime: 0 });

export function archiveStations({ stnDir, archiveDir, outDir, log = () => {} }) {
  const hDir = join(stnDir, 'h');
  const hours = (existsSync(hDir) ? readdirSync(hDir) : []).filter((f) => f.endsWith('.json') && GLACIER_STN_HOUR_RE.test(f.slice(0, -5))).map((f) => f.slice(0, -5)).sort();
  const written = [], held = [], skipped = [];
  const put = (day, name, bytes) => { const dst = join(outDir, day, name); mkdirSync(dirname(dst), { recursive: true }); writeFileSync(dst, gz(bytes)); };
  for (const hour of hours) {
    const day = hourDay(hour), name = stnArchiveName(hour);
    if (existsSync(join(archiveDir, day, name))) { held.push(hour); continue; }
    const bytes = readFileSync(join(hDir, `${hour}.json`));
    let doc = null;
    try { doc = JSON.parse(bytes.toString('utf8')); } catch { /* reported below */ }
    const bad = doc ? stnHourProblems(doc) : ['kein JSON'];
    if (bad.length || doc.hour !== hour) { skipped.push(hour); log(`${hour}: nicht abgelegt — ${bad[0] ?? 'Stunde im Dokument weicht ab'}`); continue; }
    put(day, name, bytes);
    written.push(hour);
  }
  // the catalogue, once per build time
  let catalog = null;
  const catFile = join(stnDir, 'stations.json');
  if (existsSync(catFile)) {
    const bytes = readFileSync(catFile), cat = JSON.parse(bytes.toString('utf8'));
    const stamp = String(cat.builtAt ?? '').replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    if (/^\d{8}T\d{6}Z$/.test(stamp)) {
      const day = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`, name = `stn-stations-${stamp}.json.gz`;
      if (!existsSync(join(archiveDir, day, name))) { put(day, name, bytes); catalog = name; }
    }
  }
  return { hours: hours.length, written, held: held.length, skipped, catalog };
}

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  for (const k of ['stn', 'archive', 'out']) if (!args[k] || args[k] === true) { console.error(`--${k}=<Pfad> fehlt`); process.exit(2); }
  const res = archiveStations({ stnDir: resolve(args.stn), archiveDir: resolve(args.archive), outDir: resolve(args.out), log: (m) => console.error(m) });
  console.log(JSON.stringify(res));
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) main();
