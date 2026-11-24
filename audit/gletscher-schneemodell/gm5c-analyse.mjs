// GM-5c (audit §3k.4, §3l.3) — byte comparison and measurements of the full local runs (C:\dev\buscosun-glacier-cache\gm5c\full-runs.sh).
//
//   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/gletscher-schneemodell/gm5c-analyse.mjs [--final]
//
// Runs (same read view gm4/view-stn, same cube, clock 21.11. 17:50 UTC, all with --snowpack=shadow):
//   head-pairs    code of HEAD (b448d652), --snowpack-pairs=on                       the reference: what the runner writes today
//   work-pairs    the working tree with V-GM-79, same switches                       must be the same bytes
//   work-both     … with --snowpack-spread=scenarios as well                        negative control + the new fields
//   head-spread   code of HEAD, --snowpack-spread=scenarios, no pairs                the snowpack document work-both must reproduce byte for byte
// With --final (after V-GM-81 was added): final-pairs / final-both from the final working tree, against head-pairs / work-both.
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { snowpackPairsProblems } from '../../src/glacier/glacierSnowpackPairsContract.ts';
import { snowpackProblems } from '../../src/glacier/glacierSnowpackContract.ts';
import { atElevation } from '../../scripts/glacier/lib/snowpackcore.mjs';

const B = 'C:/dev/buscosun-glacier-cache/gm5c', RUN = '2026112117', FINAL = process.argv.includes('--final');
const walk = (d, root = d, out = []) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p, root, out); else out.push(relative(root, p).replaceAll('\\', '/')); } return out; };
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const treeOf = (name) => { const root = `${B}/${name}/out`; return new Map(walk(root).sort().map((f) => [f, sha(join(root, f))])); };
const cmp = (a, b) => {
  const A = treeOf(a), Bt = treeOf(b), all = [...new Set([...A.keys(), ...Bt.keys()])].sort();
  const onlyA = all.filter((f) => !Bt.has(f)), onlyB = all.filter((f) => !A.has(f)), differ = all.filter((f) => A.has(f) && Bt.has(f) && A.get(f) !== Bt.get(f));
  return { a, b, filesA: A.size, filesB: Bt.size, identical: all.length - onlyA.length - onlyB.length - differ.length, onlyA, onlyB, differ };
};
// the status patch carries run times and (from V-GM-81 on) the memory line: compared without them, both kept aside
const patchOf = (name) => {
  const s = JSON.parse(readFileSync(`${B}/${name}/patch/status-patch.json`, 'utf8')), index = readFileSync(`${B}/${name}/patch/index-patch.json`, 'utf8');
  const aside = { seconds: { melt: s.lines.melt.seconds, levels: s.lines.weather?.levels?.seconds, snowpack: s.lines.snowpack?.seconds, spread: s.lines.snowpack?.spread?.seconds ?? null }, mem: s.lines.melt.mem ?? null };
  delete s.lines.melt.seconds; delete s.lines.melt.mem; if (s.lines.weather?.levels) delete s.lines.weather.levels.seconds; if (s.lines.snowpack) { delete s.lines.snowpack.seconds; if (s.lines.snowpack.spread) delete s.lines.snowpack.spread.seconds; }
  return { status: s, index, aside };
};
const raw = (name, rel) => readFileSync(`${B}/${name}/out/${rel}`, 'utf8');
const med = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? Math.round(((s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2) * 100) / 100 : null; };
const qn = (a, p) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))] : null; };
const gz = (s) => gzipSync(Buffer.from(s), { level: 9 }).length;
const barePairs = (d) => { const x = structuredClone(d); delete x.forecast; delete x.origins.fm; delete x.origins.fq; for (const q of x.pairs) { delete q.fm; delete q.fq; delete q.sq; } return JSON.stringify(x); };
const statusDiff = (a, b) => { const out = []; const walkO = (x, y, path) => { const keys = new Set([...Object.keys(x ?? {}), ...Object.keys(y ?? {})]); for (const k of keys) { const u = x?.[k], v = y?.[k]; if (u && v && typeof u === 'object' && typeof v === 'object' && !Array.isArray(u)) walkO(u, v, `${path}${k}.`); else if (JSON.stringify(u) !== JSON.stringify(v)) out.push(`${path}${k}`); } }; walkO(a, b, ''); return out; };

// a run counts only when it ended: its patch files are written last
const done = (n) => existsSync(`${B}/${n}/patch/status-patch.json`);
// --final: the runs of the FINAL working tree (V-GM-79 and V-GM-81 together) stand in for the first snapshot's
const WP = FINAL ? 'final-pairs' : 'work-pairs', WB = FINAL ? 'final-both' : 'work-both';
const wanted = ['head-pairs', WP, WB, 'head-spread'];
const names = wanted.filter(done);
const P = Object.fromEntries(names.map((n) => [n, patchOf(n)]));
const out = { generated: new Date().toISOString(), run: RUN, final: FINAL, runs: names, missing: wanted.filter((n) => !done(n)), timing: Object.fromEntries(names.map((n) => [n, P[n].aside.seconds])), mem: Object.fromEntries(names.map((n) => [n, P[n].aside.mem])) };
const pairPath = `snowpack/pairs/${RUN}.json`, spPath = `snowpack/${RUN}.json`;

{
  // 1. the claim: with the spread switch off every file is what HEAD writes
  out.headVsWork = { tree: cmp('head-pairs', WP), status: JSON.stringify(P['head-pairs'].status) === JSON.stringify(P[WP].status), index: P['head-pairs'].index === P[WP].index };
  if (done(WB)) {
  // 2. the negative control: with both switches exactly two files differ
  const tree = cmp(WP, WB);
  const dOff = JSON.parse(raw(WP, pairPath)), dOn = JSON.parse(raw(WB, pairPath)), sp = JSON.parse(raw(WB, spPath));
  out.pairsVsBoth = {
    tree, pairsBareEqualsOff: barePairs(dOn) === raw(WP, pairPath), statusDiffers: statusDiff(P[WP].status, P[WB].status), index: P[WP].index === P[WB].index,
  };
  // 3. the snowpack document with both switches is the one HEAD writes with the spread alone (and the one GM-5a measured, a file from before this package)
  const old = 'C:/dev/buscosun-glacier-cache/gm5/build/full-on/out/' + spPath;
  out.snowpackWithSpread = {
    ...(done('head-spread') ? { equalsHeadSpread: raw(WB, spPath) === raw('head-spread', spPath), tree: cmp('head-spread', WB), statusDiffers: statusDiff(P['head-spread'].status, P[WB].status) } : { equalsHeadSpread: 'head-spread nicht gelaufen' }),
    bytes: Buffer.byteLength(raw(WB, spPath)), equalsGm5FullOn: existsSync(old) ? readFileSync(old, 'utf8') === raw(WB, spPath) : 'Datei fehlt',
  };
  // 4. the new fields at the real catalogue
  const rows = new Map(sp.glaciers.map((r) => [r.id, r])), withQ = dOn.pairs.filter((p) => p.fq), inside = withQ.filter((p) => p.at === 'inside');
  // what mixing the row's quantiles between two levels would have given, against the quantile of the values read per scenario
  const mixDiff = [];
  for (const p of inside) { const r = rows.get(p.g); for (let j = 0; j < 2; j++) for (let d = 0; d < 3; d++) mixDiff.push(Math.abs(Math.round(atElevation(r.z, r.hsq.map((lv) => lv[j][d]), p.z).v * 10) / 10 - p.fq[j][d])); }
  const width = (d) => med(withQ.map((p) => p.fq[1][d] - p.fq[0][d])), change = (d, j) => med(withQ.map((p) => p.fq[j][d] - p.m));
  const outside = (d) => withQ.filter((p) => p.fm[d] < p.fq[0][d] - 0.05 || p.fm[d] > p.fq[1][d] + 0.05).length;
  out.forecast = {
    head: dOn.forecast, origins: dOn.origins, contract: snowpackPairsProblems(dOn, new Set(rows.keys()), rows), snowpackContract: snowpackProblems(sp).slice(0, 3),
    pairs: dOn.pairs.length, withSpread: withQ.length, withSpreadAndValue: withQ.filter((p) => p.v != null).length, stationsWithSpread: new Set(withQ.map((p) => p.s)).size,
    at: { below: withQ.filter((p) => p.at === 'below').length, inside: inside.length, above: withQ.filter((p) => p.at === 'above').length }, none: dOn.forecast.none, everyPairHasFm: dOn.pairs.every((p) => Array.isArray(p.fm) && p.fm.length === 3),
    widthCmMedian: { h24: width(0), h48: width(1), h72: width(2) }, changeCmMedian: { h24: [change(0, 0), med(withQ.map((p) => p.fm[0] - p.m)), change(0, 1)], h72: [change(2, 0), med(withQ.map((p) => p.fm[2] - p.m)), change(2, 1)] },
    expectedOutsideSpan: { h24: outside(0), h48: outside(1), h72: outside(2) },
    mixedQuantilesInside: { pairs: inside.length, values: mixDiff.length, differ01: mixDiff.filter((v) => v >= 0.05).length, differ1cm: mixDiff.filter((v) => v >= 0.95).length, medianCm: med(mixDiff), p90Cm: qn(mixDiff, 0.9), maxCm: Math.max(...mixDiff) },
    bytes: { off: Buffer.byteLength(raw(WP, pairPath)), on: Buffer.byteLength(raw(WB, pairPath)), gzOff: gz(raw(WP, pairPath)), gzOn: gz(raw(WB, pairPath)) },
    statusLine: P[WB].status.lines.snowpack.pairs,
  };
  // 5. the archiver of HEAD (the one a runner pinned to an older `main` would run) takes the new document
  const oldArch = await import(pathToFileURL(`${B}/code-head/scripts/glacier/glacier-archive.mjs`).href);
  const aOut = `${B}/arch-old-out`; rmSync(aOut, { recursive: true, force: true }); mkdirSync(aOut, { recursive: true });
  const res = oldArch.archivePairs({ pairsDir: `${B}/${WB}/out/snowpack/pairs`, archiveDir: `${B}/arch-none`, outDir: aOut });
  out.oldArchiver = { commit: readFileSync(`${B}/code-head/COMMIT`, 'utf8').trim().slice(0, 8), written: res.written, refused: res.refused, files: existsSync(aOut) ? walk(aOut) : [] };
  } else out.note = `${WB} nicht gelaufen: Negativkontrolle und neue Felder am vollen Lauf fehlen`;
  // the pairs document both runs wrote, against its contract
  { const d = JSON.parse(raw(WP, pairPath)); out.pairsOff = { bytes: Buffer.byteLength(raw(WP, pairPath)), sameAsHead: raw(WP, pairPath) === raw('head-pairs', pairPath), contract: snowpackPairsProblems(d), counts: d.counts, hasForecast: 'forecast' in d || d.pairs.some((p) => 'fm' in p || 'fq' in p || 'sq' in p), origins: d.origins }; }
}
writeFileSync(join(import.meta.dirname, FINAL ? 'gm5c-analyse-final.json' : 'gm5c-analyse.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
