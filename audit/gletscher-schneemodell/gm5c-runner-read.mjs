// GM-5c, step 0 (audit §3h.17) — reads the first runner run with shadow pairs. Read only: the files are fetched from buscosun-data at ONE commit
// (the publish commit of the run) into a local folder; nothing is written anywhere else.
//
//   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/gletscher-schneemodell/gm5c-runner-read.mjs --dir=<folder> --run=2026112417 --sha=<commit> [--prev=<run>]
//
// Checks: status line, the pairs document against its contract and against the snowpack document of the same run, the pairs recomputed from the run's own
// snowpack rows + mapping + station slot (must be the same document), snowpack and melt documents against their contracts, the states.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { snowpackPairsProblems, GLACIER_SNOWPACK_PAIRS_WINDOW_MIN } from '../../src/glacier/glacierSnowpackPairsContract.ts';
import { snowpackProblems, snowpackStateProblems } from '../../src/glacier/glacierSnowpackContract.ts';
import { meltProblems, meltStateProblems } from '../../src/glacier/glacierMeltContract.ts';
import { glacierStnHourPath, glacierStnMapPath } from '../../src/glacier/glacierStationContract.ts';
import { pairsOf } from '../../scripts/glacier/lib/snowpackcore.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a, '1']; }));
const { dir, run, sha } = args;
if (!dir || !run || !sha) { console.error('--dir= --run= --sha= fehlen'); process.exit(2); }
const BASE = `https://raw.githubusercontent.com/jppetry/buscosun-data/${sha}/glacier/v1`;
const get = async (rel) => {
  const f = join(dir, rel);
  if (!existsSync(f)) { const r = await fetch(`${BASE}/${rel}`); if (!r.ok) return null; mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, Buffer.from(await r.arrayBuffer())); }
  return readFileSync(f);
};
const J = async (rel) => { const b = await get(rel); return b ? JSON.parse(b.toString('utf8')) : null; };
const med = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? Math.round(((s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2) * 100) / 100 : null; };
const q = (a, p) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))] : null; };

const status = await J('status.json'), index = await J('index.json');
const pairsRaw = await get(`snowpack/pairs/${run}.json`), pairs = pairsRaw ? JSON.parse(pairsRaw.toString('utf8')) : null;
const sp = await J(`snowpack/${run}.json`), melt = await J(`melt/${run}.json`), spState = await J('snowpack/state.json'), meltState = await J('melt/state.json');
const out = { generated: new Date().toISOString(), commit: sha, run, status: { melt: status.lines.melt, snowpack: status.lines.snowpack }, pointer: { melt: index.melt, snowpack: index.snowpack, stations: index.stations } };

if (pairs) {
  const rowIds = new Set(sp.glaciers.map((r) => r.id));
  const map = await J(glacierStnMapPath(pairs.stations.map)), slot = await J(glacierStnHourPath(pairs.stations.slot));
  const re = map && slot ? pairsOf({ rows: sp.glaciers, map, slot, t0Ms: pairs.atMs, windowMin: GLACIER_SNOWPACK_PAIRS_WINDOW_MIN }) : null;
  const withV = pairs.pairs.filter((p) => p.v != null), net = {}, netV = {}, ratio = [];
  for (const p of pairs.pairs) { net[p.net] = (net[p.net] ?? 0) + 1; if (p.v != null) { netV[p.net] = (netV[p.net] ?? 0) + 1; if (p.v >= 5) ratio.push(p.m / p.v); } }
  out.pairs = {
    bytes: pairsRaw.length, statusBytes: status.lines.snowpack.pairs?.bytes, contract: snowpackPairsProblems(pairs, rowIds), run: pairs.run, atMs: new Date(pairs.atMs).toISOString(), snowpack: pairs.snowpack, stations: pairs.stations,
    counts: pairs.counts, statusLine: status.lines.snowpack.pairs, statusMatches: status.lines.snowpack.pairs?.pairs === pairs.counts.pairs && status.lines.snowpack.pairs?.withValue === pairs.counts.withValue && status.lines.snowpack.pairs?.map === pairs.stations.map && status.lines.snowpack.pairs?.slot === pairs.stations.slot,
    recomputed: re ? { samePairs: JSON.stringify(re.pairs) === JSON.stringify(pairs.pairs), sameCounts: JSON.stringify(re.counts) === JSON.stringify(pairs.counts) } : 'Zuordnung oder Slot nicht lesbar',
    byNet: net, withValueByNet: netV, withHsd: pairs.pairs.filter((p) => p.hsd).length, ageMin: { p10: q(withV.map((p) => p.age), 0.1), median: med(withV.map((p) => p.age)), p90: q(withV.map((p) => p.age), 0.9) },
    modelOverStation: { n: ratio.length, median: med(ratio), rule: 'nur Paare mit Stationswert >= 5 cm' }, stationsDistinct: new Set(pairs.pairs.map((p) => p.s)).size,
    carriesForecast: pairs.pairs.some((p) => 'fm' in p || 'fq' in p) || 'forecast' in pairs,
  };
}
const catalogIds = null;
out.snowpack = {
  contract: snowpackProblems(sp, catalogIds ?? undefined).slice(0, 5), glaciers: sp.glaciers.length, skipped: sp.skipped.length, coverage: sp.coverage, state: sp.state, spread: sp.rules.spread, precip: sp.rules.precip.rule, density: sp.rules.density.source,
  engine: sp.engine, cube: sp.cube, stateFile: { contract: snowpackStateProblems(spState).slice(0, 5), atMs: new Date(spState.atMs).toISOString(), run: spState.run, glaciers: Object.keys(spState.g).length },
  hsMedianCm: { tongue: med(sp.glaciers.map((r) => r.hs[0])), median: med(sp.glaciers.map((r) => r.hs[1])), top: med(sp.glaciers.map((r) => r.hs[2])) },
};
out.melt = {
  contract: meltProblems(melt).slice(0, 5), glaciers: melt.glaciers.length, skipped: melt.skipped.length, state: melt.state, engine: melt.engine, cube: melt.cube, precip: melt.params.precip?.rule ?? null, glaciersBlock: melt.params.precip?.glaciers ?? null,
  stateFile: { contract: meltStateProblems(meltState).slice(0, 5), atMs: new Date(meltState.atMs).toISOString(), glaciers: Object.keys(meltState.g).length, pend: !!meltState.pend, sat: 'sat' in meltState },
};
if (args.prev) {
  const prevSp = await J(`snowpack/${args.prev}.json`);
  if (prevSp) {
    // the run before forecast this run hour: its day index does not hit it exactly unless the distance is a multiple of 24 h — only the direction is read here
    const a = new Map(prevSp.glaciers.map((r) => [r.id, r])), d = sp.glaciers.filter((r) => a.has(r.id)).map((r) => r.hs[1] - a.get(r.id).hs[1]);
    out.prev = { run: args.prev, common: d.length, hsMedianLevelChangeCm: { p10: q(d, 0.1), median: med(d), p90: q(d, 0.9) } };
  } else out.prev = { run: args.prev, note: 'nicht mehr im Daten-Repo an diesem Commit' };
}
if (args.out) writeFileSync(args.out, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
