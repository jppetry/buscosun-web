#!/usr/bin/env node
// SW-0 spike: arrival times of DWD maritime products from the inventory `content.log.bz2` (not the directory listing,
// which lagged by days for GWAM). Each snapshot is merged into a JSON file keyed by model/run and text issue, so that
// repeated runs over several days build the arrival statistics (the inventory itself only covers ≈ 48 h).
//
// Per wave-model run: files seen, first file, last file, time when every parameter of the LAST step was there
// (= run complete), minutes after run start. Per text issue: Last-Modified minus nominal issue time.
//
// Usage: node scripts/sea/spike/arrivals.mjs [--out=audit/seewetter/spike/arrivals.json] [--loop] [--every=60]

import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decompressBz2 } from '../../lib/bz2.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const OUT = resolve(ROOT, typeof args.out === 'string' ? args.out : 'audit/seewetter/spike/arrivals.json');
const URL_INV = 'https://opendata.dwd.de/weather/maritime/content.log.bz2';
const EXPECT = { cwam: { params: 13, steps: 79, last: 78 }, ewam: { params: 13, steps: 79, last: 78 }, gwam: { params: 13, steps: 59, last: 174 } };

export function parseInventory(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const [path, size, ts] = line.trim().split('|');
    if (!path || !ts) continue;
    rows.push({ path: path.replace(/^\.\//, ''), size: Number(size), at: Date.parse(ts.replace(' ', 'T') + 'Z') });
  }
  return rows;
}

export function summarise(rows) {
  const runs = {};
  const texts = {};
  for (const r of rows) {
    let m = /^wave_models\/(\w+)\/grib\/\d\d\/(\w+)\/\w+?_\w+?_(\d{10})_(\d{3})\.grib2\.bz2$/.exec(r.path);
    if (m) {
      const [, model, param, run, step] = m;
      const key = `${model}/${run}`;
      const e = (runs[key] ??= { model, run, files: 0, bytes: 0, first: Infinity, last: -Infinity, lastStep: {} });
      e.files++; e.bytes += r.size;
      e.first = Math.min(e.first, r.at); e.last = Math.max(e.last, r.at);
      if (+step === EXPECT[model]?.last) e.lastStep[param] = Math.max(e.lastStep[param] ?? -Infinity, r.at);
      continue;
    }
    m = /^forecast\/german\/(\w{6})_EDZW_(\d{6})$/.exec(r.path);
    if (m) texts[`${m[1]}_${m[2]}`] = { product: m[1], issue: m[2], bytes: r.size, at: r.at };
  }
  const out = { runs: {}, texts: {} };
  for (const [key, e] of Object.entries(runs)) {
    const t0 = Date.UTC(+e.run.slice(0, 4), +e.run.slice(4, 6) - 1, +e.run.slice(6, 8), +e.run.slice(8, 10));
    const exp = EXPECT[e.model];
    const lastParams = Object.keys(e.lastStep).length;
    const complete = exp && e.files === exp.params * exp.steps && lastParams === exp.params ? Math.max(...Object.values(e.lastStep)) : null;
    const min = (ms) => (ms == null ? null : Math.round((ms - t0) / 60_000));
    out.runs[key] = {
      model: e.model, run: e.run, files: e.files, expected: exp ? exp.params * exp.steps : null, mb: +(e.bytes / 1e6).toFixed(1),
      firstAt: new Date(e.first).toISOString(), lastAt: new Date(e.last).toISOString(), completeAt: complete ? new Date(complete).toISOString() : null,
      firstMin: min(e.first), lastMin: min(e.last), completeMin: min(complete),
    };
  }
  for (const [key, t] of Object.entries(texts)) out.texts[key] = { ...t, at: new Date(t.at).toISOString() };
  return out;
}

async function snapshot() {
  const r = await fetch(URL_INV, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`inventory HTTP ${r.status}`);
  const text = Buffer.from(await decompressBz2(Buffer.from(await r.arrayBuffer()))).toString('utf8');
  const s = summarise(parseInventory(text));
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { snapshots: [], runs: {}, texts: {} };
  // Runs: a later snapshot of the same run wins only if it saw at least as many files (the window drops old files).
  for (const [k, v] of Object.entries(s.runs)) if (!prev.runs[k] || v.files >= prev.runs[k].files) prev.runs[k] = v;
  for (const [k, v] of Object.entries(s.texts)) prev.texts[k] = v;
  prev.snapshots.push({ at: new Date().toISOString(), rows: Object.keys(s.runs).length });
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT + '.tmp', JSON.stringify(prev, null, 1) + '\n');
  renameSync(OUT + '.tmp', OUT);
  console.log(`[arrivals] ${new Date().toISOString()} runs ${Object.keys(prev.runs).length}, texts ${Object.keys(prev.texts).length}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await snapshot().catch((e) => console.error(`[arrivals] ${e.message}`));
  if (args.loop) for (;;) { await new Promise((r) => setTimeout(r, Number(args.every ?? 60) * 60_000)); await snapshot().catch((e) => console.error(`[arrivals] ${e.message}`)); }
}
