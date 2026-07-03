/**
 * EQUIVALENCE GATE (user requirement): a browser capture and a Node capture for
 * the same validTime must be structurally equivalent. No parameter fit ships
 * until this passes — on PASS this writes `fixtures/.equivalence-passed`, the
 * marker `train-background.mjs` requires before writing `public/params/`.
 *
 *   node scripts/equivalence-check.mjs <browser.json> <node.json>
 *
 * Compares schema, meta.bounds, provenance tags, station sets (by id → position
 * exact, truth within fetch-timing tolerance), and background sample parity
 * (positions + DEM elevations + values). Reports the diff; exits non-zero on FAIL.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [aPath, bPath] = process.argv.slice(2);
if (!aPath || !bPath) { console.error('usage: equivalence-check.mjs <browser.json> <node.json>'); process.exit(2); }
const A = JSON.parse(readFileSync(aPath, 'utf8'));   // browser reference
const B = JSON.parse(readFileSync(bPath, 'utf8'));   // node capture

const TOL = { t2m: 0.6, windU: 1.5, windV: 1.5, windSpeed: 1.5, precip: 0.3, cloud: 8 };
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

// schema + bounds
add('same top-level schema', ['meta', 'stations', 'background', 'icond2'].every((k) => k in A && k in B), '');
const bnd = (f) => JSON.stringify(f.meta.bounds);
add('same meta.bounds', bnd(A) === bnd(B), `${bnd(A)} vs ${bnd(B)}`);
add('same validTime', A.meta.validTime === B.meta.validTime,
  `${A.meta.validTime} vs ${B.meta.validTime}`);

// provenance tag distribution
const prov = (f) => {
  const c = {};
  for (const s of [...f.background, ...f.icond2]) { const p = s.provenance ?? 'ccby'; c[p] = (c[p] ?? 0) + 1; }
  return c;
};
add('same provenance distribution', JSON.stringify(prov(A)) === JSON.stringify(prov(B)),
  `${JSON.stringify(prov(A))} vs ${JSON.stringify(prov(B))}`);

// station sets by id
const byId = (f) => new Map(f.stations.map((s) => [s.id, s]));
const ma = byId(A), mb = byId(B);
const common = [...ma.keys()].filter((id) => mb.has(id));
const onlyA = [...ma.keys()].filter((id) => !mb.has(id));
const onlyB = [...mb.keys()].filter((id) => !ma.has(id));
const overlap = common.length / Math.max(ma.size, mb.size, 1);
add('station-id overlap ≥ 0.98', overlap >= 0.98, `${(overlap * 100).toFixed(1)}% (common ${common.length}, onlyA ${onlyA.length}, onlyB ${onlyB.length})`);

// common-station position exactness + truth within tolerance
let posBad = 0, valBad = 0, valChecked = 0;
for (const id of common) {
  const a = ma.get(id), b = mb.get(id);
  if (Math.abs(a.x - b.x) > 1e-9 || Math.abs(a.y - b.y) > 1e-9 || Math.abs(a.elev - b.elev) > 1) posBad++;
  for (const v of Object.keys(TOL)) {
    if (a.truth[v] == null || b.truth[v] == null) continue;
    valChecked++;
    if (Math.abs(a.truth[v] - b.truth[v]) > TOL[v]) valBad++;
  }
}
add('common-station positions exact', posBad === 0, `${posBad} mismatched`);
add('station truth within timing tolerance', valChecked > 0 && valBad / valChecked < 0.02, `${valBad}/${valChecked} out of tol`);

// background parity (positions + DEM elev + values) — matched by source + rounded position
const bgKey = (s) => `${s.source}|${s.x.toFixed(6)}|${s.y.toFixed(6)}`;
const bgA = new Map(A.background.map((s) => [bgKey(s), s]));
let bgCommon = 0, elevBad = 0, bgValBad = 0, bgValChecked = 0;
for (const s of B.background) {
  const a = bgA.get(bgKey(s));
  if (!a) continue;
  bgCommon++;
  if (Math.abs((a.elev ?? 0) - (s.elev ?? 0)) > 2) elevBad++;   // DEM parity (node vs browser Terrarium)
  for (const v of Object.keys(TOL)) {
    if (a.vals[v] == null || s.vals[v] == null) continue;
    bgValChecked++;
    if (Math.abs(a.vals[v] - s.vals[v]) > TOL[v]) bgValBad++;
  }
}
const bgOverlap = bgCommon / Math.max(A.background.length, B.background.length, 1);
add('background overlap ≥ 0.98', bgOverlap >= 0.98, `${(bgOverlap * 100).toFixed(1)}%`);
add('background DEM elev parity (node vs browser)', elevBad === 0, `${elevBad}/${bgCommon} elev diff > 2 m`);
add('background values within tolerance', bgValChecked > 0 && bgValBad / bgValChecked < 0.02, `${bgValBad}/${bgValChecked} out of tol`);

const pad = (s, n) => String(s).padEnd(n);
console.log(`\nEquivalence gate — browser(${aPath}) vs node(${bPath}):\n`);
for (const c of checks) console.log(`  [${c.ok ? '✓' : '✗'}] ${pad(c.name, 42)} ${c.detail}`);
const failed = checks.filter((c) => !c.ok);
if (failed.length === 0) {
  writeFileSync('fixtures/.equivalence-passed', JSON.stringify({ validTime: A.meta.validTime, at: new Date(A.meta.capturedAt).toISOString(), browser: aPath, node: bPath }));
  console.log('\n  PASS — wrote fixtures/.equivalence-passed (train-background may now ship to public/params/).\n');
  process.exit(0);
} else {
  console.log(`\n  FAIL — ${failed.length} check(s) failed. No fit will ship until these resolve.\n`);
  process.exit(1);
}
