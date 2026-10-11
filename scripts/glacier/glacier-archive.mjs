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
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { GLACIER_MELT_RUN_RE, meltLeadDoc } from '../../src/glacier/glacierMeltContract.ts';

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

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  for (const k of ['melt', 'catalog', 'archive', 'out']) if (!args[k] || args[k] === true) { console.error(`--${k}=<Pfad> fehlt`); process.exit(2); }
  const res = archiveMelt({ meltDir: resolve(args.melt), catalogFile: resolve(args.catalog), archiveDir: resolve(args.archive), outDir: resolve(args.out), log: (m) => console.error(m) });
  console.log(JSON.stringify(res));
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) main();
