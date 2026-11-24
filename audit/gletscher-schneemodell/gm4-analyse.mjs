#!/usr/bin/env node
/**
 * GM-4 — evaluation of the local full runs of `C:\dev\buscosun-glacier-cache\gm4-run.ps1` (trees under `C:\dev\buscosun-glacier-cache\gm4\`):
 * byte identity without switches against the reference of HEAD dc982141 (`gm32\off`), the negative controls with the switches, the content of the pairs
 * file of the real catalogue, and the 3-hour chain of the satellite switch. Writes gm4-analyse.json.
 *
 *   node audit/gletscher-schneemodell/gm4-analyse.mjs [--root=C:\dev\buscosun-glacier-cache]
 */
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const ROOT = args.root ?? 'C:/dev/buscosun-glacier-cache', G = join(ROOT, 'gm4');
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const walk = (d, b = d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p, b) : [relative(b, p).split(sep).join('/')]; });
function cmp(a, b) {
  const A = new Set(walk(a)), B = new Set(walk(b));
  const both = [...A].filter((f) => B.has(f)), diff = both.filter((f) => !readFileSync(join(a, f)).equals(readFileSync(join(b, f))));
  return { a: A.size, b: B.size, same: both.length - diff.length, diff, onlyA: [...A].filter((f) => !B.has(f)), onlyB: [...B].filter((f) => !A.has(f)) };
}
const q = (a, x) => { if (!a.length) return null; const s = [...a].sort((u, v) => u - v), i = (s.length - 1) * x, lo = Math.floor(i), hi = Math.ceil(i); return Math.round((s[lo] + (s[hi] - s[lo]) * (i - lo)) * 10) / 10; };
const runOf = (dir) => readdirSync(join(G, dir, 'melt')).filter((f) => /^\d{10}\.json$/.test(f))[0].slice(0, 10);
const out = {};
out.offVsRef = cmp(join(ROOT, 'gm32', 'off'), join(G, 'off'));
out.offStnVsOff = cmp(join(G, 'off'), join(G, 'off-stn'));
out.spVsOffStn = cmp(join(G, 'off-stn'), join(G, 'sp'));
out.pairsVsSp = cmp(join(G, 'sp'), join(G, 'sp-pairs'));
out.patchPairsVsSp = cmp(join(G, 'patch-sp'), join(G, 'patch-sp-pairs'));
const st = (p) => J(join(G, p, 'status-patch.json')).lines.snowpack;
out.statusSp = st('patch-sp'); out.statusPairs = st('patch-sp-pairs');
// the pairs of the real catalogue
const run = runOf('sp-pairs'), pd = J(join(G, 'sp-pairs', 'snowpack', 'pairs', `${run}.json`));
const withV = pd.pairs.filter((p) => p.v != null);
const by = (key) => Object.fromEntries([...new Set(withV.map((p) => p[key]))].sort().map((k) => { const ps = withV.filter((p) => p[key] === k); return [k, { n: ps.length, stations: new Set(ps.map((p) => p.s)).size, station: q(ps.map((p) => p.v), 0.5), model: q(ps.map((p) => p.m), 0.5), ratio: q(ps.filter((p) => p.v >= 5).map((p) => p.m / p.v), 0.5) }]; }));
out.pairs = { run, bytes: statSync(join(G, 'sp-pairs', 'snowpack', 'pairs', `${run}.json`)).size, stations: pd.stations, counts: pd.counts, withValue: withV.length, ageMin: { p10: q(withV.map((p) => p.age), 0.1), median: q(withV.map((p) => p.age), 0.5), p90: q(withV.map((p) => p.age), 0.9) },
  all: { station: q(withV.map((p) => p.v), 0.5), model: q(withV.map((p) => p.m), 0.5), ratio: q(withV.filter((p) => p.v >= 5).map((p) => p.m / p.v), 0.5) }, byNet: by('net'), byAt: by('at'), withHsd: pd.pairs.filter((p) => p.hsd).length };
// satellite: first run once vs off, then the 3-hour chain
out.satOnceVsOff = cmp(join(G, 'off'), join(G, 'sat-once'));
const docOf = (d) => J(join(G, d, 'melt', `${runOf(d)}.json`));
const off = docOf('off'), once = docOf('sat-once');
out.satOnceFirst = { stateOff: off.state, stateOnce: once.state, rowsSame: off.glaciers.every((g, i) => JSON.stringify(g) === JSON.stringify(once.glaciers[i])), stateFileSat: Object.keys(J(join(G, 'sat-once', 'melt', 'state.json')).sat ?? {}).length };
const tile = (d) => { const ice = d.glaciers.map((g) => g.ice); return { run: d.run, state: d.state, glaciers: ice.length, iceMean: Math.round((ice.reduce((s, v) => s + v, 0) / ice.length) * 10) / 10, iceZero: ice.filter((v) => v === 0).length }; };
const pair = (a, b) => { const m = new Map(b.glaciers.map((g) => [g.id, g])); let same = 0, iceDiff = 0, maxIce = 0, up = 0, down = 0; for (const g of a.glaciers) { const h = m.get(g.id); if (!h) continue; if (JSON.stringify(g) === JSON.stringify(h)) same++; if (g.ice !== h.ice) { iceDiff++; maxIce = Math.max(maxIce, Math.abs(g.ice - h.ice)); if (h.ice > g.ice) up++; else down++; } } return { shared: a.glaciers.length, identical: same, iceDiffers: iceDiff, onceHigher: up, onceLower: down, maxIcePoints: maxIce }; };
const eA = docOf('e-A'), oA = docOf('o-A'), eB = docOf('e-B'), oB = docOf('o-B');
out.chain = { eA: tile(eA), oA: tile(oA), eB: tile(eB), oB: tile(oB), A: pair(eA, oA), B: pair(eB, oB), oBsat: Object.keys(J(join(G, 'o-B', 'melt', 'state.json')).sat ?? {}).length, stateBytes: { e: statSync(join(G, 'e-B', 'melt', 'state.json')).size, o: statSync(join(G, 'o-B', 'melt', 'state.json')).size } };
// run times
out.seconds = Object.fromEntries(['off', 'off-stn', 'sp', 'sp-pairs', 'sat-once', 'e-A', 'o-A', 'e-B', 'o-B'].map((k) => { const p = join(G, `patch-${k}`, 'status-patch.json'); return [k, existsSync(p) ? J(p).lines.melt.seconds : null]; }));
writeFileSync(join(import.meta.dirname, 'gm4-analyse.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
