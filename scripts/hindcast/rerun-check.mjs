/**
 * rerun-check.mjs — AP10a acceptance V7 (resumability): every extractor is run AGAIN over a range that is already
 * complete in the cache; each must transfer 0 data bytes and produce nothing new. Writes
 * <HINDCAST_ROOT>/verify/rerun.json, which verify-hindcast.mjs (V7) reads. Catalogue reads that upstream republishes
 * daily and that carry no measurement — the Icechunk catalog of the dynamical open (≈ 0.1 MB), the CDC station
 * descriptions and directory listings, the GeoSphere dataset metadata, the MeteoSwiss station list — are reported as
 * `metaBytes`, apart from the data bytes (measured 20.09.: they were the only reason V7 failed on the full archive).
 *
 *   node scripts/hindcast/rerun-check.mjs [--run-day=2026-09-10] [--series=2026-08-01..2026-08-31] [--dyn=2026-08-01..2026-08-31] [--truth=2026-08-01..2026-08-31]
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { HINDCAST_ROOT, parseArgs } from './lib/common.mjs';

const flags = parseArgs(process.argv.slice(2));
const PY = process.env.HINDCAST_PY || 'C:/dev/buscosun-hindcast/.venv/Scripts/python.exe';
const runDay = flags['run-day'] ?? '2026-09-10';
const [sFrom, sTo] = String(flags.series ?? '2026-08-01..2026-08-31').split('..');
const [dFrom, dTo] = String(flags.dyn ?? '2026-08-01..2026-08-31').split('..');
const [tFrom, tTo] = String(flags.truth ?? '2026-08-01..2026-08-31').split('..');
const env = { ...process.env, PYTHONIOENCODING: 'utf-8' };

function lastJson(out, pred) {
  const lines = out.split('\n').filter((l) => l.trim().startsWith('{'));
  for (let i = lines.length - 1; i >= 0; i--) { try { const j = JSON.parse(lines[i]); if (pred(j)) return j; } catch { /* not JSON */ } }
  return null;
}
function run(cmd, args) {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 });
  return { out: `${r.stdout ?? ''}\n${r.stderr ?? ''}`, status: r.status, s: +((Date.now() - t0) / 1000).toFixed(1) };
}

const rows = [];
for (const m of ['dwd_icon_d2', 'dwd_icon_eu', 'meteoswiss_icon_ch1', 'meteoswiss_icon_ch2', 'dwd_icon', 'ecmwf_ifs025', 'ecmwf_aifs025_single']) {
  const r = run(PY, ['scripts/hindcast/extract_openmeteo.py', '--model', m, '--route', 'run', '--from', runDay, '--to', runDay]);
  const j = lastJson(r.out, (x) => x.kind === 'summary');
  rows.push({ extractor: 'extract_openmeteo.py', model: m, route: 'run', range: runDay, planned: j?.planned ?? null, read: j?.read ?? null, bytes: j?.bytes ?? null, requests: j?.requests ?? null, s: r.s, status: r.status });
  console.log(`[rerun] open-meteo run ${m} ${runDay}: ${JSON.stringify(rows.at(-1))}`);
}
for (const m of ['dwd_icon_d2', 'dwd_icon_eu', 'ecmwf_ifs025', 'ecmwf_aifs025_single', 'meteoswiss_icon_ch1']) {
  const r = run(PY, ['scripts/hindcast/extract_openmeteo.py', '--model', m, '--route', 'series', '--from', sFrom, '--to', sTo]);
  const j = lastJson(r.out, (x) => x.kind === 'summary');
  rows.push({ extractor: 'extract_openmeteo.py', model: m, route: 'series', range: `${sFrom}..${sTo}`, planned: j?.planned ?? null, read: j?.read ?? null, bytes: j?.bytes ?? null, requests: j?.requests ?? null, s: r.s, status: r.status });
  console.log(`[rerun] open-meteo series ${m}: ${JSON.stringify(rows.at(-1))}`);
}
for (const ds of ['ifs-ens', 'aifs', 'icon-eu']) {
  const r = run(PY, ['scripts/hindcast/extract_dynamical.py', '--ds', ds, '--from', dFrom, '--to', dTo]);
  const j = lastJson(r.out, (x) => x.kind === 'summary');
  rows.push({ extractor: 'extract_dynamical.py', ds, route: 'dyn', range: `${dFrom}..${dTo}`, planned: j ? j.inits : null, read: j?.read ?? null, bytes: j?.bytes ?? null, requests: j?.requests ?? null, metaBytes: j?.metaBytes ?? null, s: r.s, status: r.status });
  console.log(`[rerun] dynamical ${ds}: ${JSON.stringify(rows.at(-1))}`);
}
{
  const r = run(process.execPath, ['--max-old-space-size=8192', '--experimental-strip-types', '--import', './scripts/lib/register-ts.mjs', 'scripts/hindcast/extract_truth.mjs', `--from=${tFrom}`, `--to=${tTo}`, '--quiet']);
  const j = lastJson(r.out, (x) => x.kind === 'hindcast/truth-run');
  for (const [net, v] of Object.entries(j?.net ?? {})) {
    // `read` is what the run PRODUCED (station-months); the station lists and dataset metadata that every run
    // refetches (CDC republishes them daily) are metaBytes, like the Icechunk catalog of the dynamical extractor
    rows.push({ extractor: 'extract_truth.mjs', network: net, route: 'truth', range: `${tFrom}..${tTo}`, read: v.records ?? 0, bytes: v.bytes, metaBytes: v.metaBytes ?? 0, requests: v.requests, cacheHits: v.cacheHits, daysWritten: j?.days?.written ?? null, s: r.s, status: r.status });
    console.log(`[rerun] truth ${net}: ${JSON.stringify(rows.at(-1))}`);
  }
  if (!j) rows.push({ extractor: 'extract_truth.mjs', route: 'truth', range: `${tFrom}..${tTo}`, read: null, bytes: null, status: r.status, error: r.out.slice(-400) });
}
mkdirSync(join(HINDCAST_ROOT, 'verify'), { recursive: true });
writeFileSync(join(HINDCAST_ROOT, 'verify', 'rerun.json'), `${JSON.stringify({ at: new Date().toISOString(), rows }, null, 1)}\n`);
const bad = rows.filter((r) => r.bytes !== 0 || r.read !== 0 || r.daysWritten);
const meta = rows.reduce((s, r) => s + (r.metaBytes ?? 0), 0);
console.log(`[rerun] ${rows.length} Läufe · ${bad.length ? `NICHT 0 Byte: ${bad.map((r) => r.model ?? r.ds ?? r.network).join(', ')}` : 'alle 0 Datenbytes'} · Katalog ${(meta / 1e6).toFixed(1)} MB → verify/rerun.json`);
