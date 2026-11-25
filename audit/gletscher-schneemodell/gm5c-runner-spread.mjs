// GM-5a / GM-5c on the runner (audit §3k.7, §3l.5) — reads the first runner run with the spread switched on (E-GM-36). Read only: works on the folder
// `gm5c-runner-read.mjs` filled from ONE commit of buscosun-data (run that first); fetches nothing and writes only the result file.
//
//   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/gletscher-schneemodell/gm5c-runner-spread.mjs --dir=<folder> --run=2026112423 [--out=<file>]
//
// Checks: both documents against their contracts (the pairs also against the ROWS of the snowpack document), the pairs without the forecast fields
// recomputed from the run's own rows + mapping + station slot (must be the same pairs), `fm` recomputed from the rows, the counts of the head block
// against the pairs and against the status line, and the width of the spread at station elevation.
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { snowpackPairsProblems, GLACIER_SNOWPACK_PAIRS_WINDOW_MIN } from '../../src/glacier/glacierSnowpackPairsContract.ts';
import { snowpackProblems } from '../../src/glacier/glacierSnowpackContract.ts';
import { glacierStnHourPath, glacierStnMapPath } from '../../src/glacier/glacierStationContract.ts';
import { pairsOf, atElevation } from '../../scripts/glacier/lib/snowpackcore.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a, '1']; }));
const { dir, run } = args;
if (!dir || !run) { console.error('--dir= --run= fehlen'); process.exit(2); }
const raw = (rel) => readFileSync(join(dir, rel));
const J = (rel) => JSON.parse(raw(rel).toString('utf8'));
const med = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? Math.round(((s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2) * 100) / 100 : null; };
const r2 = (x) => Math.round(x * 10) / 10 + 0;

const status = J('status.json'), sp = J(`snowpack/${run}.json`), pairsRaw = raw(`snowpack/pairs/${run}.json`), pairs = JSON.parse(pairsRaw.toString('utf8'));
const map = J(glacierStnMapPath(pairs.stations.map)), slot = J(glacierStnHourPath(pairs.stations.slot));
const rowOf = new Map(sp.glaciers.map((r) => [r.id, r])), rowIds = new Set(rowOf.keys());

// the snowpack document: rows with a spread, rows with a reason
const withHsq = sp.glaciers.filter((r) => r.hsq), none = {};
for (const r of sp.glaciers) if (r.sq) none[r.sq] = (none[r.sq] ?? 0) + 1;
const both = sp.glaciers.filter((r) => r.hsq && r.sq).length, neither = sp.glaciers.filter((r) => !r.hsq && !r.sq).length;
// width p10–p90 of the snow depth at the median elevation by day (hsq[level][0|1][day])
const widthDay = (d) => med(withHsq.map((r) => r.hsq[1][1][d] - r.hsq[1][0][d]));
const days = withHsq[0]?.hsq[1][0].length ?? 0;

// the pairs: without the forecast fields they must be what the run's own inputs give
const bare = pairs.pairs.map((p) => { const x = { ...p }; delete x.fm; delete x.fq; delete x.sq; return x; });
const re = pairsOf({ rows: sp.glaciers, map, slot, t0Ms: pairs.atMs, windowMin: GLACIER_SNOWPACK_PAIRS_WINDOW_MIN });
const withQ = pairs.pairs.filter((p) => p.fq), noneP = {};
for (const p of pairs.pairs) if (p.sq) noneP[p.sq] = (noneP[p.sq] ?? 0) + 1;
const fmWrong = pairs.pairs.filter((p) => { const r = rowOf.get(p.g); return !p.fm || [1, 2, 3].some((d, i) => p.fm[i] !== r2(atElevation(r.z, r.hsd.map((a) => a[d - 1]), p.z).v)); }).length;
const sqWrong = pairs.pairs.filter((p) => (p.sq ?? null) !== (rowOf.get(p.g).sq ?? null)).length;
const atQ = { below: 0, inside: 0, above: 0 }; for (const p of withQ) atQ[p.at]++;
const outside = (d) => withQ.filter((p) => p.fm[d] < p.fq[0][d] - 0.05 || p.fm[d] > p.fq[1][d] + 0.05).length;
const unordered = withQ.filter((p) => [0, 1, 2].some((d) => p.fq[0][d] > p.fq[1][d] + 0.15)).length;
const delta = (d) => ({ p10: med(withQ.map((p) => p.fq[0][d] - p.m)), expected: med(withQ.map((p) => p.fm[d] - p.m)), p90: med(withQ.map((p) => p.fq[1][d] - p.m)) });

const out = {
  generated: new Date().toISOString(), run, runAt: sp.runAt,
  status: { mem: status.lines.melt.mem ?? null, meltSeconds: status.lines.melt.seconds, snowpackSeconds: status.lines.snowpack.seconds, spread: status.lines.snowpack.spread ?? null, pairs: status.lines.snowpack.pairs ?? null },
  snowpack: {
    contract: snowpackProblems(sp), bytes: raw(`snowpack/${run}.json`).length, statusBytes: status.lines.snowpack.bytes, rule: sp.rules.spread,
    rows: sp.glaciers.length, rowsWithSpread: withHsq.length, rowsWithoutByReason: none, rowsWithBoth: both, rowsWithNeither: neither,
    statusMatches: status.lines.snowpack.spread?.rows === withHsq.length && JSON.stringify(status.lines.snowpack.spread?.none) === JSON.stringify(none) && status.lines.snowpack.spread?.k === sp.rules.spread?.k,
    widthMedianLevelCm: days ? Object.fromEntries([1, 2, 3, 7, days].filter((d) => d <= days).map((d) => [`day${d}`, widthDay(d - 1)])) : null,
  },
  pairs: {
    contract: snowpackPairsProblems(pairs, rowIds), contractAgainstRows: snowpackPairsProblems(pairs, rowIds, rowOf), bytes: pairsRaw.length, gzBytes: gzipSync(pairsRaw, { level: 9 }).length,
    head: pairs.forecast, origins: pairs.origins,
    bareSameAsRecomputed: JSON.stringify(re.pairs) === JSON.stringify(bare), sameCounts: JSON.stringify(re.counts) === JSON.stringify(pairs.counts),
    n: pairs.pairs.length, withFm: pairs.pairs.filter((p) => p.fm).length, withSpread: withQ.length, withoutByReason: noneP, spreadAndReason: pairs.pairs.filter((p) => p.fq && p.sq).length,
    fmNotTheRow: fmWrong, reasonNotTheRow: sqWrong, headMatches: pairs.forecast?.pairs === withQ.length && JSON.stringify(pairs.forecast?.none) === JSON.stringify(noneP),
    statusMatches: status.lines.snowpack.pairs?.spread === withQ.length && status.lines.snowpack.pairs?.bytes === pairsRaw.length,
    stationsWithSpread: new Set(withQ.map((p) => p.s)).size, spreadByAt: atQ, spreadWithStationValue: withQ.filter((p) => p.v != null).length,
    widthCm: { h24: med(withQ.map((p) => p.fq[1][0] - p.fq[0][0])), h48: med(withQ.map((p) => p.fq[1][1] - p.fq[0][1])), h72: med(withQ.map((p) => p.fq[1][2] - p.fq[0][2])) },
    changeAgainstRunHourCm: { h24: delta(0), h48: delta(1), h72: delta(2) },
    expectedOutsideSpread: { h24: outside(0), h48: outside(1), h72: outside(2) }, spreadNotOrdered: unordered,
  },
};
if (args.out) writeFileSync(args.out, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
