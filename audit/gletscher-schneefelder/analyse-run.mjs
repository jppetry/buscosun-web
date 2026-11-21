#!/usr/bin/env node
/**
 * Phase GS — reads the weather documents of ONE local producer run and reports: sizes (raw, gzip, brotli), the contract (new reader and the
 * frozen reader of the page before the phase), the old fields against the document of the SAME run in the data repo (if it is there), the
 * comparison of the two phase rules. READ-ONLY.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/gletscher-schneefelder/analyse-run.mjs --out=<out dir of melt.mjs> [--live=<v1 dir of the data repo>]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { weatherProblems, weatherHourlyProblems, weatherSnowProblems, weatherHourlySnowProblems, phaseVerdict, GLACIER_WEATHER_PHASE_PATH, GLACIER_WEATHER_RUN_RE } from '../../src/glacier/glacierWeatherContract.ts';
import { weatherProblems as oldProblems, weatherHourlyProblems as oldHourlyProblems } from '../../scripts/lib/fixtures/glacier/weather-contract-before-gs.ts';
import { glacierForbiddenWords } from '../../src/glacier/glacierContract.ts';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const out = resolve(args.out), wx = join(out, 'melt', 'wx');
const run = args.run ?? readdirSync(wx).filter((f) => f.endsWith('.json') && GLACIER_WEATHER_RUN_RE.test(f.slice(0, -5))).map((f) => f.slice(0, -5)).sort().at(-1);
const size = (bufs) => ({ raw: bufs.reduce((s, b) => s + b.length, 0), gzip: bufs.reduce((s, b) => s + gzipSync(b).length, 0), brotli: bufs.reduce((s, b) => s + brotliCompressSync(b).length, 0) });
const dailyBuf = readFileSync(join(wx, `${run}.json`)), daily = JSON.parse(dailyBuf);
const chunkBufs = readdirSync(join(wx, run)).sort().map((f) => readFileSync(join(wx, run, f))), chunks = chunkBufs.map((b) => JSON.parse(b));
const OLD_ROW = ['id', 'z', 'f', 'tn', 'tx', 'tq', 'w', 'gx', 'wd', 'p', 'sn', 'c', 'sl', 'omit'], OLD_HOURLY = ['t', 'w', 'g', 'd', 'p', 's', 'c'];
const pick = (o, keys) => JSON.stringify(keys.map((k) => o[k]));
// share of the bytes per field (daily rows)
const bytesOf = (rows, keys) => Object.fromEntries(keys.map((k) => [k, rows.reduce((s, r) => s + (r[k] === undefined ? 0 : JSON.stringify(r[k]).length + k.length + 4), 0)]));
const report = {
  run, rule: daily.rules.phase.rule, spread: daily.rules.spread, engine: daily.engine,
  rows: daily.glaciers.length, own: daily.glaciers.filter((r) => r.f === 'own').length, skipped: daily.skipped.length, skipReasons: [...new Set(daily.skipped.map((s) => s.reason))],
  size: { daily: size([dailyBuf]), chunks: size(chunkBufs), chunkFiles: chunkBufs.length, largestChunk: Math.max(...chunkBufs.map((b) => b.length)) },
  bytesPerField: { daily: bytesOf(daily.glaciers, ['tn', 'tx', 'tq', 'w', 'gx', 'wd', 'p', 'sn', 'c', 'sl', 'pq', 'snq', 'gq']), hourly: bytesOf(chunks.flatMap((c) => Object.values(c.glaciers)), ['t', 'w', 'g', 'd', 'p', 's', 'c', 'sl', 'sn']) },
  contract: {
    new: weatherProblems(daily).length + weatherSnowProblems(daily).length + chunks.reduce((s, c) => s + weatherHourlyProblems(c, daily).length + weatherHourlySnowProblems(c, daily).length, 0),
    oldReader: oldProblems(daily).length + chunks.reduce((s, c) => s + oldHourlyProblems(c, daily).length, 0),
  },
  neighbour: (() => { const nb = daily.glaciers.filter((r) => r.f !== 'own'); return { rows: nb.length, keys: [...new Set(nb.map((r) => Object.keys(r).join(',')))], omit: [...new Set(nb.map((r) => r.omit))] }; })(),
  snowline: (() => { let v = 0, n = 0, rows = 0, after115 = 0; for (const c of chunks) for (const r of Object.values(c.glaciers)) { if (!r.sl) continue; rows++; r.sl.forEach((x, h) => { if (x == null) n++; else { v++; if (h > 115) after115++; } }); } return { rows, values: v, nulls: n, after115 }; })(),
  forbiddenWords: (() => { const txt = dailyBuf.toString('utf8') + chunkBufs.map((b) => b.toString('utf8')).join(''); return glacierForbiddenWords(txt); })(),
  phase: existsSync(join(out, GLACIER_WEATHER_PHASE_PATH)) ? (() => { const d = JSON.parse(readFileSync(join(out, GLACIER_WEATHER_PHASE_PATH), 'utf8')); return { last: d.runs.at(-1), verdict: phaseVerdict(d) }; })() : null,
};
if (args.live && existsSync(join(resolve(args.live), 'melt', 'wx', `${run}.json`))) {
  const lv = resolve(args.live), liveDaily = JSON.parse(readFileSync(join(lv, 'melt', 'wx', `${run}.json`), 'utf8'));
  const by = new Map(liveDaily.glaciers.map((r) => [r.id, r]));
  let same = 0, diff = 0, missing = 0; const firstDiff = [];
  for (const r of daily.glaciers) { const o = by.get(r.id); if (!o) { missing++; continue; } if (pick(r, OLD_ROW) === pick(o, OLD_ROW)) same++; else { diff++; if (firstDiff.length < 3) firstDiff.push({ id: r.id, keys: OLD_ROW.filter((k) => JSON.stringify(r[k]) !== JSON.stringify(o[k])) }); } }
  let hs = 0, hd = 0;
  for (const c of chunks) { const f = join(lv, 'melt', 'wx', run, `${c.region}.json`); if (!existsSync(f)) continue; const o = JSON.parse(readFileSync(f, 'utf8')); for (const [id, r] of Object.entries(c.glaciers)) { if (!o.glaciers[id]) continue; if (pick(r, OLD_HOURLY) === pick(o.glaciers[id], OLD_HOURLY)) hs++; else hd++; } }
  report.live = { runAt: liveDaily.runAt, localRunAt: daily.runAt, cubeSame: JSON.stringify(liveDaily.cube) === JSON.stringify(daily.cube), dailyRows: { same, diff, missing }, hourlyRows: { same: hs, diff: hd }, firstDiff, liveSize: { daily: readFileSync(join(lv, 'melt', 'wx', `${run}.json`)).length } };
}
console.log(JSON.stringify(report, null, 1));
