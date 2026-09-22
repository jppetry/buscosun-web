/**
 * queue.mjs — AP10a step 4: the full range as resumable chains, in Node (native CreateProcess — no Cygwin fork).
 * Measured 19.09.: Git-Bash chains died silently mid-run (log ends at START, earlier sessions logged
 * "fork: retry: Resource temporarily unavailable", 0xC000026B) while several pulls ran at once; Node spawning
 * Python directly has no fork. Every extractor skips what is cached and build-slots skips existing slots and refuses
 * slots whose stores are not pulled for the day — so a chain can be restarted at any time (watchdog.ps1 does that).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/hindcast/queue.mjs <mode> [args]
 *     dyn                        dynamical: IFS ENS + AIFS 2026-07 … 2024-04 (newest month first), ICON-EU 2026-07 … 2026-02
 *     series                     Open-Meteo day-0 series 2026-05 … 2023-05 (newest month first), the five t1 models
 *     datarun <from> <to>        Open-Meteo data_run day by day (oldest first — the window expires), all seven models
 *     runslots                   waits for the data_run chains dr-A/B/C + the ENS of June/July, then slots 2026-06-17 … 2026-09-13
 *     preslots                   waits for the dyn + series chains, then slots 2023-05-24 … 2026-06-16 (00/06/12/18 UTC)
 *     truth <from> <to>          truth (CDC, GeoSphere, MeteoSwiss) + IGRA2 for a range
 *     accept                     waits for every other chain in chains.json (and the truth job), then the acceptance
 *                                V1–V8: archive pull, rerun-check, shadow, truth --verify, index, verify-hindcast
 *     pilot-june                 the pilot of the day-0 and dyn routes (2026-06-01 … 06-16)
 *     follow <from> <to>         catch-up for the growing edge: data_run + truth + slots for a range (the data_run
 *                                window expires ≈ 3 months after the run, so every day not pulled is lost for good)
 *
 * Each mode ends with the line "DONE <mode>" — watchdog.ps1 restarts a chain until that line is in its log.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HINDCAST_ROOT } from './lib/common.mjs';

const PY = process.env.HINDCAST_PY || 'C:/dev/buscosun-hindcast/.venv/Scripts/python.exe';
const LOG = join(HINDCAST_ROOT, 'log');
const env = { ...process.env, PYTHONIOENCODING: 'utf-8' };
const say = (msg) => console.log(`${new Date().toISOString().slice(0, 19)}Z ${msg}`);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const monthsDesc = (from, to) => { const out = []; let [y, m] = from.split('-').map(Number); const [y2, m2] = to.split('-').map(Number); while (y > y2 || (y === y2 && m >= m2)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m--; if (!m) { m = 12; y--; } } return out; };
const monthEnd = (ym) => { const [y, m] = ym.split('-').map(Number); return iso(Date.UTC(y, m, 0)); };
const maxIso = (a, b) => (a > b ? a : b);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** run one extractor; the last summary line (JSON) goes to the chain log; a non-zero exit or `"failed": n > 0` counts */
let failures = 0;
function py(args) {
  const t0 = Date.now();
  const r = spawnSync(PY, args, { encoding: 'utf8', env, maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  const lines = out.split('\n').filter((l) => l.includes('"kind": "summary"') || /Traceback|Error:/.test(l));
  const failedN = Number((/"failed": (\d+)/.exec(lines.join(' ')) ?? [])[1] ?? 0);
  if (r.status !== 0 || failedN > 0 || !lines.some((l) => l.includes('"kind": "summary"'))) failures++;
  return { status: r.status, s: Math.round((Date.now() - t0) / 1000), summary: lines.slice(-2).join(' | ').slice(0, 600) };
}
function node(args) {
  const r = spawnSync(process.execPath, ['--max-old-space-size=8192', '--experimental-strip-types', '--import', './scripts/lib/register-ts.mjs', ...args], { encoding: 'utf8', env, maxBuffer: 512 * 1024 * 1024, windowsHide: true });
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  return { status: r.status, tail: out.split('\n').filter((l) => /\[slots\] \d+ geschrieben|Error|error/.test(l)).slice(-3).join(' | ') };
}
const logHas = (name, needle) => { const p = join(LOG, `pull-${name}.log`); return existsSync(p) && readFileSync(p, 'utf8').includes(needle); };

const [mode, a1, a2] = process.argv.slice(2);
say(`START ${mode} ${a1 ?? ''} ${a2 ?? ''}`.trim());

if (mode === 'dyn') {
  for (const m of monthsDesc('2026-07', '2024-04')) {
    for (const ds of ['ifs-ens', 'aifs']) { const r = py(['scripts/hindcast/extract_dynamical.py', '--ds', ds, '--from', `${m}-01`, '--to', monthEnd(m), '--threads', '4']); say(`dyn ${ds} ${m} status ${r.status} ${r.s}s ${r.summary || 'NO-SUMMARY'}`); }
    if (m >= '2026-02') { const r = py(['scripts/hindcast/extract_dynamical.py', '--ds', 'icon-eu', '--from', maxIso(`${m}-01`, '2026-02-10'), '--to', monthEnd(m), '--threads', '4']); say(`dyn icon-eu ${m} status ${r.status} ${r.s}s ${r.summary || 'NO-SUMMARY'}`); }
    writeFileSync(join(LOG, `.dyn-done-${m}`), new Date().toISOString());
  }
} else if (mode === 'series') {
  const FIRST = { ecmwf_ifs025: '2024-01-25', ecmwf_aifs025_single: '2025-02-05', meteoswiss_icon_ch1: '2025-07-01' };
  for (const m of monthsDesc('2026-05', '2023-05')) {
    for (const model of ['dwd_icon_d2', 'dwd_icon_eu', 'ecmwf_ifs025', 'ecmwf_aifs025_single', 'meteoswiss_icon_ch1']) {
      if (FIRST[model] && monthEnd(m) < FIRST[model]) continue;   // S3 has no series before the first date (inventory 19.09.)
      const r = py(['scripts/hindcast/extract_openmeteo.py', '--model', model, '--route', 'series', '--from', maxIso(`${m}-01`, '2023-05-24'), '--to', monthEnd(m), '--workers', '4', '--files', '4']);
      say(`series ${model} ${m} status ${r.status} ${r.s}s ${r.summary || 'NO-SUMMARY'}`);
    }
    writeFileSync(join(LOG, `.series-done-${m}`), new Date().toISOString());
  }
} else if (mode === 'datarun') {
  for (let d = Date.parse(`${a1}T00:00:00Z`); d <= Date.parse(`${a2}T00:00:00Z`); d += 86_400_000) {
    for (const model of ['dwd_icon_d2', 'dwd_icon_eu', 'meteoswiss_icon_ch1', 'meteoswiss_icon_ch2', 'dwd_icon', 'ecmwf_ifs025', 'ecmwf_aifs025_single']) {
      const r = py(['scripts/hindcast/extract_openmeteo.py', '--model', model, '--route', 'run', '--from', iso(d), '--to', iso(d), '--workers', '4', '--files', '6']);
      say(`datarun ${iso(d)} ${model} status ${r.status} ${r.s}s ${r.summary || 'NO-SUMMARY'}`);
    }
  }
} else if (mode === 'pilot-june') {
  // the pilot of the two routes before the data_run window: day-0 (t1) and dyn (t2/t3), 2026-06-01 … 06-16;
  // slots from 06-02 (the lagged ENS control of the 00/06 UTC t2 slots sits on the previous day)
  for (const model of ['dwd_icon_d2', 'dwd_icon_eu', 'ecmwf_ifs025', 'ecmwf_aifs025_single', 'meteoswiss_icon_ch1']) {
    const r = py(['scripts/hindcast/extract_openmeteo.py', '--model', model, '--route', 'series', '--from', '2026-06-01', '--to', '2026-06-16', '--workers', '4', '--files', '4']);
    say(`series ${model} 2026-06-01..16 status ${r.status} ${r.s}s ${r.summary || 'NO-SUMMARY'}`);
  }
  for (const ds of ['ifs-ens', 'aifs', 'icon-eu']) {
    const r = py(['scripts/hindcast/extract_dynamical.py', '--ds', ds, '--from', '2026-06-01', '--to', '2026-06-16', '--threads', '4']);
    say(`dyn ${ds} 2026-06-01..16 status ${r.status} ${r.s}s ${r.summary || 'NO-SUMMARY'}`);
  }
  const r = node(['scripts/hindcast/build-slots.mjs', '--from=2026-06-02', '--to=2026-06-16', '--hours=0,6,12,18']);
  say(`slots 2026-06-02..16 status ${r.status} ${r.tail}`);
} else if (mode === 'follow') {
  // the growing edge: pull the runs of the range, the truth of the range, then build its slots
  for (let d = Date.parse(`${a1}T00:00:00Z`); d <= Date.parse(`${a2}T00:00:00Z`); d += 86_400_000) {
    for (const model of ['dwd_icon_d2', 'dwd_icon_eu', 'meteoswiss_icon_ch1', 'meteoswiss_icon_ch2', 'dwd_icon', 'ecmwf_ifs025', 'ecmwf_aifs025_single']) {
      const r = py(['scripts/hindcast/extract_openmeteo.py', '--model', model, '--route', 'run', '--from', iso(d), '--to', iso(d), '--workers', '4', '--files', '6']);
      say(`follow ${iso(d)} ${model} status ${r.status} ${r.summary || 'NO-SUMMARY'}`);
    }
  }
  // t3-σ_ens comes from IFS ENS (dynamical) even inside the run window (EXPECT.run.t3, V-HC-8) — without it the
  // completeness guard skips the 00/12 UTC t3 slots (measured 22.09.: 4 of 24 slots of 19.–21.09.)
  const dy = py(['scripts/hindcast/extract_dynamical.py', '--ds', 'ifs-ens', '--from', a1, '--to', a2, '--threads', '4']);
  say(`follow dyn ifs-ens ${a1}..${a2} status ${dy.status} ${dy.summary || 'NO-SUMMARY'}`);
  if (failures) { say(`follow: ${failures} Aufrufe fehlgeschlagen — kein Slot-Bau, der Wachhund startet die Kette neu`); process.exit(1); }
  const t = spawnSync(process.execPath, ['--max-old-space-size=8192', '--experimental-strip-types', '--import', './scripts/lib/register-ts.mjs', 'scripts/hindcast/extract_truth.mjs', `--from=${a1}`, `--to=${a2}`, '--quiet'], { encoding: 'utf8', env, maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  say(`follow truth ${a1}..${a2} status ${t.status} ${(`${t.stdout ?? ''}`.trim().split('\n').at(-1) ?? '').slice(0, 400)}`);
  if (t.status !== 0) process.exit(1);
  const r = node(['scripts/hindcast/build-slots.mjs', `--from=${a1}`, `--to=${a2}`]);
  say(`follow slots ${a1}..${a2} status ${r.status} ${r.tail}`);
} else if (mode === 'truth') {
  // truth for a range (resumable: raw downloads and final station-months stay cached), IGRA2 with it
  const r = spawnSync(process.execPath, ['--max-old-space-size=8192', '--experimental-strip-types', '--import', './scripts/lib/register-ts.mjs', 'scripts/hindcast/extract_truth.mjs', `--from=${a1}`, `--to=${a2}`, '--igra', '--quiet'], { encoding: 'utf8', env, maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  const last = `${r.stdout ?? ''}`.trim().split('\n').at(-1) ?? '';
  say(`truth ${a1}..${a2} status ${r.status} ${last.slice(0, 600)}`);
  if (r.status !== 0) process.exit(1);   // no DONE line — the watchdog restarts the chain
} else if (mode === 'runslots') {
  while (!(['dr-A', 'dr-B', 'dr-C'].every((n) => logHas(n, 'DONE datarun')) && existsSync(join(LOG, '.dyn-done-2026-06')))) await sleep(300_000);
  say('runslots: data_run dr-A/B/C and dyn 2026-07/06 present');
  // sweep: dr-A/B/C ran an older queue.mjs that did not count failures (19.09.: ICON-EU 06-29 and ICON-D2 08-01 broke
  // off with a connection reset and were only fetched on a retry) — every model-day once more, cached files cost 0 bytes
  for (let d = Date.parse('2026-06-16T00:00:00Z'); d <= Date.parse('2026-09-13T00:00:00Z'); d += 86_400_000) {
    for (const model of ['dwd_icon_d2', 'dwd_icon_eu', 'meteoswiss_icon_ch1', 'meteoswiss_icon_ch2', 'dwd_icon', 'ecmwf_ifs025', 'ecmwf_aifs025_single']) {
      const s = py(['scripts/hindcast/extract_openmeteo.py', '--model', model, '--route', 'run', '--from', iso(d), '--to', iso(d), '--workers', '4', '--files', '6']);
      if (!/"read": 0,/.test(s.summary)) say(`sweep ${iso(d)} ${model} status ${s.status} ${s.summary || 'NO-SUMMARY'}`);
    }
  }
  if (failures) { say(`sweep: ${failures} Aufrufe fehlgeschlagen — kein Slot-Bau, der Wachhund startet die Kette neu`); process.exit(1); }
  const r = node(['scripts/hindcast/build-slots.mjs', '--from=2026-06-17', '--to=2026-09-13']);
  say(`runslots status ${r.status} ${r.tail}`);
} else if (mode === 'preslots') {
  while (!(logHas('full-dyn', 'DONE dyn') && logHas('full-series', 'DONE series'))) await sleep(600_000);
  say('preslots: dyn + series chains done');
  const r = node(['scripts/hindcast/build-slots.mjs', '--from=2023-05-24', '--to=2026-06-16', '--hours=0,6,12,18']);
  say(`preslots status ${r.status} ${r.tail}`);
} else if (mode === 'accept') {
  // step 5: the acceptance V1–V8 on the whole archive once every chain is done — stamps index.json
  const chains = JSON.parse(readFileSync(join(LOG, 'chains.json'), 'utf8')).filter((c) => c.mode !== 'accept');
  const ready = () => chains.every((c) => logHas(c.name, `DONE ${c.mode}`)) && (logHas('truth-full', 'EXIT') || logHas('truth-full2', 'DONE truth'));
  while (!ready()) await sleep(900_000);
  say('accept: all chains done');
  const run = (cmd, args, label) => { const r = spawnSync(cmd, args, { encoding: 'utf8', env, maxBuffer: 512 * 1024 * 1024, windowsHide: true }); const tail = `${r.stdout ?? ''}`.trim().split('\n').filter((l) => !/Warning|trace-warnings/.test(l)).slice(-2).join(' | '); say(`${label} status ${r.status} ${tail.slice(0, 500)}`); return r.status; };
  const TS = ['--max-old-space-size=8192', '--experimental-strip-types', '--import', './scripts/lib/register-ts.mjs'];
  run('git', ['-C', 'C:/dev/buscosun-archiv', 'pull', '--ff-only'], 'archive pull');
  run(process.execPath, [...TS, 'scripts/hindcast/rerun-check.mjs'], 'rerun-check (V7)');
  run(process.execPath, [...TS, 'scripts/hindcast/shadow.mjs'], 'shadow (V4)');
  run(process.execPath, [...TS, 'scripts/hindcast/extract_truth.mjs', '--verify', '--verify-from=2026-09-14', '--from=2023-05-24', `--to=${iso(Date.now())}`, '--quiet'], 'truth overlap + coverage (V5)');
  run(process.execPath, [...TS, 'scripts/hindcast/index.mjs'], 'index');
  const st = run(process.execPath, [...TS, 'scripts/hindcast/verify-hindcast.mjs', '--sample=0.002'], 'verify V1–V8');
  if (st !== 0) process.exit(1);
} else {
  say(`unknown mode ${mode}`); process.exit(2);
}
if (failures) { say(`${failures} Extraktor-Aufrufe fehlgeschlagen — kein DONE, der Wachhund startet die Kette neu (fertige Dateien werden übersprungen)`); process.exit(1); }
say(`DONE ${mode}`);
