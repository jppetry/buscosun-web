// Phase GM, GM-2 — analysis of the local producer runs in the four switch positions (read-only).
//   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/gletscher-schneemodell/gm2-analyse.mjs <dir with out-median, out-three, out-three-psnow, out-median-psnow> <run> [reference out dir]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { weatherProblems, weatherHourlyProblems, weatherSnowProblems, weatherHourlySnowProblems, weatherLevelProblems, weatherHourlyLevelProblems } from '../../src/glacier/glacierWeatherContract.ts';
import { weatherProblems as oldWeatherProblems, weatherHourlyProblems as oldWeatherHourlyProblems } from '../../scripts/lib/fixtures/glacier/weather-contract-before-gs.ts';

const [root, run, ref] = process.argv.slice(2);
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 12);
const names = ['median', 'three', 'median-psnow', 'three-psnow'].filter((n) => existsSync(join(root, `out-${n}`)));
const load = (dir) => {
  const daily = J(join(dir, 'melt', 'wx', `${run}.json`));
  const cdir = join(dir, 'melt', 'wx', run);
  const chunks = Object.fromEntries(readdirSync(cdir).map((f) => [f.replace(/\.json$/, ''), J(join(cdir, f))]));
  const hourly = {}; for (const c of Object.values(chunks)) Object.assign(hourly, c.glaciers);
  const size = (bufs) => ({ raw: bufs.reduce((s, b) => s + b.length, 0), gzip: bufs.reduce((s, b) => s + gzipSync(b).length, 0), brotli: bufs.reduce((s, b) => s + brotliCompressSync(b).length, 0) });
  return { dir, daily, chunks, hourly, sizeDaily: size([readFileSync(join(dir, 'melt', 'wx', `${run}.json`))]), sizeChunks: size(readdirSync(cdir).map((f) => readFileSync(join(cdir, f)))) };
};
const R = Object.fromEntries(names.map((n) => [n, load(join(root, `out-${n}`))]));
const out = { run, names };

// 1) the melt document and the state are the same in every switch position
out.melt = Object.fromEntries(names.map((n) => [n, { doc: sha(join(root, `out-${n}`, 'melt', `${run}.json`)), state: sha(join(root, `out-${n}`, 'melt', 'state.json')) }]));
out.meltSame = new Set(names.map((n) => out.melt[n].doc + out.melt[n].state)).size === 1;

// 2) default switch = the documents of the reference run (the producer before GM-2), byte for byte
if (ref && existsSync(join(ref, 'melt', 'wx', `${run}.json`))) {
  const a = join(root, 'out-median', 'melt', 'wx'), b = join(ref, 'melt', 'wx');
  const files = [`${run}.json`, ...readdirSync(join(a, run)).map((f) => join(run, f))];
  const diff = files.filter((f) => !existsSync(join(b, f)) || sha(join(a, f)) !== sha(join(b, f)));
  out.reference = { files: files.length, different: diff.length, first: diff.slice(0, 3), control: sha(join(root, 'out-three', 'melt', 'wx', `${run}.json`)) !== sha(join(b, `${run}.json`)) };
}

// 3) contract: the readers of the page (today's and the frozen one from before GS) and the producer's rules
out.contract = Object.fromEntries(names.map((n) => {
  const { daily, chunks } = R[n];
  const d = [...weatherProblems(daily), ...weatherSnowProblems(daily), ...weatherLevelProblems(daily)], old = oldWeatherProblems(daily);
  let h = 0, oldH = 0;
  for (const c of Object.values(chunks)) { h += weatherHourlyProblems(c, daily).length + weatherHourlySnowProblems(c, daily).length + weatherHourlyLevelProblems(c, daily).length; oldH += oldWeatherHourlyProblems(c, daily).length; }
  return [n, { daily: d.length, hourly: h, oldDaily: old.length, oldHourly: oldH, first: d[0] ?? null }];
}));

// 4) sizes
out.sizes = Object.fromEntries(names.map((n) => [n, { daily: R[n].sizeDaily, chunks: R[n].sizeChunks }]));

// 5) rows
const own = (n) => R[n].daily.glaciers.filter((r) => r.f === 'own');
out.rows = Object.fromEntries(names.map((n) => [n, { all: R[n].daily.glaciers.length, own: own(n).length, lapse: own(n).filter((r) => r.lv === 'lapse').length, skipped: R[n].daily.skipped.length, rules: R[n].daily.rules.levels ?? null }]));

// 6) temperature at tongue and top: three answers against the lapse from the median elevation (hourly, 48 h)
if (R.three) {
  const q = (a, p) => { const s = Float64Array.from(a).sort(); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2); };
  const stat = (lv) => {
    const d = [], grad = [], gradOld = [];
    for (const r of own('three')) {
      if (r.lv) continue;
      const a = R.three.hourly[r.id], b = R.median.hourly[r.id]; if (!a || !b) continue;
      for (let h = 0; h < 48; h++) d.push(a.t[lv][h] - b.t[lv][h]);
      const dz = r.z[2] - r.z[0];
      if (dz >= 300) for (let h = 0; h < 48; h += 6) { grad.push(((a.t[2][h] - a.t[0][h]) / dz) * 1000); gradOld.push(((b.t[2][h] - b.t[0][h]) / dz) * 1000); }
    }
    return { n: d.length, mean: +(d.reduce((x, y) => x + y, 0) / d.length).toFixed(2), mae: +(d.reduce((x, y) => x + Math.abs(y), 0) / d.length).toFixed(2), p10: q(d, 0.1), p50: q(d, 0.5), p90: q(d, 0.9), over2K: +(d.filter((v) => Math.abs(v) > 2).length / d.length).toFixed(3),
      ...(lv === 0 ? { gradient: { three: { p10: q(grad, 0.1), p50: q(grad, 0.5), p90: q(grad, 0.9), inversions: +(grad.filter((v) => v > 0).length / grad.length).toFixed(3) }, lapse: { p10: q(gradOld, 0.1), p50: q(gradOld, 0.5), p90: q(gradOld, 0.9) }, n: grad.length } } : {}) };
  };
  out.temperature = { tongue: stat(0), median: stat(1), top: stat(2) };
}

// 7) new snow: sums per elevation, and glaciers whose three elevations carry the same 14-day sum
out.snow = Object.fromEntries(names.map((n) => {
  const rows = own(n), sum = [0, 0, 0];
  let same = 0, wetSame = 0, wet = 0;
  for (const r of rows) {
    const s = r.sn.map((lv) => lv.reduce((a, b) => a + b, 0));
    s.forEach((v, i) => { sum[i] += v; });
    const eq = Math.abs(s[0] - s[2]) < 0.05; if (eq) same++;
    if (s[2] >= 1) { wet++; if (eq) wetSame++; }
  }
  return [n, { mm: sum.map((v) => +v.toFixed(1)), sameAtAllLevels: same, wetGlaciers: wet, wetSame }];
}));

// 8) snowfall line per hour
const lineStat = (n) => {
  const kinds = {}, hist = { lt100: 0, lt500: 0, lt1000: 0, other: 0, nul: 0 };
  let below = 0, vals = 0, cells = 0;
  for (const r of own(n)) {
    const h = R[n].hourly[r.id]; if (!h?.sl) continue;
    for (let i = 0; i < h.sl.length; i++) {
      const v = h.sl[i]; cells++;
      if (v == null) { hist.nul++; continue; }
      vals++; if (v < 100) hist.lt100++; else if (v < 500) hist.lt500++; else if (v < 1000) hist.lt1000++; else hist.other++;
      if (v < r.z[0]) below++;
    }
  }
  // the own line (`slo`, `slk`) next to the one of the answer
  let ownVals = 0, ownCells = 0, ownMin = Infinity; const insideByHour = new Array(120).fill(0);
  for (const r of own(n)) { const h = R[n].hourly[r.id]; if (!h?.slk) continue; for (let i = 0; i < h.slk.length; i++) { ownCells++; kinds[h.slk[i]] = (kinds[h.slk[i]] ?? 0) + 1; if (h.slo[i] != null) { ownVals++; ownMin = Math.min(ownMin, h.slo[i] - r.z[0]); } } }
  const dayKinds = {}; for (const r of own(n)) if (r.slk) for (const k of r.slk) dayKinds[k] = (dayKinds[k] ?? 0) + 1;
  const dayNull = own(n).reduce((s, r) => s + r.sl.filter((v) => v == null).length, 0), dayAll = own(n).length * 14;
  return { answer: { cells, values: vals, hist, belowTongue: below, daily: { cells: dayAll, null: dayNull } }, own: ownCells ? { cells: ownCells, values: ownVals, kinds, lowestBelowTongueM: Number.isFinite(ownMin) ? ownMin : null, dailyKinds: dayKinds } : null };
};
out.line = Object.fromEntries(names.map((n) => [n, lineStat(n)]));

// 8b) repeatability: a second run with three answers writes the same bytes
if (existsSync(join(root, 'out-three-again'))) {
  const a = join(root, 'out-three', 'melt', 'wx'), b = join(root, 'out-three-again', 'melt', 'wx');
  const files = [`${run}.json`, ...readdirSync(join(a, run)).map((f) => join(run, f))];
  out.repeat = { files: files.length, different: files.filter((f) => sha(join(a, f)) !== sha(join(b, f))).length };
}
// 8c) the line of the answer is the same field in every position
if (R.three) out.answerLineSame = own('three').every((r) => JSON.stringify(r.sl) === JSON.stringify(R.median.daily.glaciers.find((x) => x.id === r.id)?.sl) && JSON.stringify(R.three.hourly[r.id].sl) === JSON.stringify(R.median.hourly[r.id].sl));

// 9) status lines
out.status = Object.fromEntries(names.map((n) => { const p = join(root, `patch-${n}`, 'status-patch.json'); const s = existsSync(p) ? J(p).lines : null; return [n, s ? { melt: s.melt, levels: s.weather?.levels ?? null, phase: s.weather?.phase ?? null, files: s.weather?.files, bytes: s.weather?.bytes } : null]; }));
console.log(JSON.stringify(out, null, 1));
