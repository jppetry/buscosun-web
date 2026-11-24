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

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  for (const k of ['melt', 'catalog', 'archive', 'out']) if (!args[k] || args[k] === true) { console.error(`--${k}=<Pfad> fehlt`); process.exit(2); }
  const res = archiveMelt({ meltDir: resolve(args.melt), catalogFile: resolve(args.catalog), archiveDir: resolve(args.archive), outDir: resolve(args.out), log: (m) => console.error(m) });
  if (args.pairs && args.pairs !== true) res.pairs = archivePairs({ pairsDir: resolve(args.pairs), archiveDir: resolve(args.archive), outDir: resolve(args.out), log: (m) => console.error(m) });
  console.log(JSON.stringify(res));
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) main();
