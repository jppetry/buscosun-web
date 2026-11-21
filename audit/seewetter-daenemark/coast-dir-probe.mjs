#!/usr/bin/env node
/**
 * V-DK-4 / phase BS-N — the direction fill at the COASTAL spots, measured on the live cube. Measurement only: buscosun
 * Fusion is READ through the producer's own call (`spotWind` of `scripts/sea/sea-derive.mjs`, cube over the CDN), nothing
 * is written to any repository.
 *
 * Rules, written before the first run (2026-11-21):
 *   spots      the published coastal catalogue (`static/spots.json` + `static/spots-dk.json`), terrain file `spot-geo.json`,
 *              hour axis of the published wave run (`status.field.lastPublishedRun`) — as in the workflow
 *   fill       `spotDirFill` (= `fillLakeDir`, 90°) on the series `spotWind` returns, with its `interp` list
 *   counts     per spot: hours with a wind, hours without a direction before and after, interpolated hours, filled hours,
 *              and why an hour stays empty: the engine's own step without a direction (its gate), an interpolated hour whose
 *              neighbouring step has none, a jump of more than 90° between the two steps
 *   control    every hour that is NOT in `interp` must carry the same direction before and after (count of differences = 0);
 *              the comparison is shown not to be blind by changing one such hour
 *   hold-out   how good is the rule? Where the engine gives a direction at four consecutive own hours h … h+3, the hours
 *              h+1 and h+2 are predicted from h and h+3 by the same rule and compared with the engine's own direction
 *              (error in degrees; pairs further apart than 90° are counted as "not filled"). This uses hourly steps only —
 *              the 3-hourly part, where the fill really acts, has no direction to compare with
 *
 * One run is ONE weather situation.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/seewetter-daenemark/coast-dir-probe.mjs [--out=<file>]
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RAW = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main';
const H = 3_600_000;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const getJson = async (u, opt = false) => { const r = await fetch(u); if (!r.ok) { if (opt) return null; throw new Error(`${u} → ${r.status}`); } return r.json(); };

const { spotWind, spotDirFill } = await import('../../scripts/sea/sea-derive.mjs');
const { mergeSpotCatalogs, seaRunMs, SEA_SPOT_STEPS } = await import('../../src/sea/seaContract.ts');
const { fillLakeDir, LAKE_DIR_FILL_MAX_DEG } = await import('../../src/sea/seaLakes.ts');

const [cat, dk, geoDoc, status] = await Promise.all([
  getJson(`${RAW}/sea/v1/static/spots.json`), getJson(`${RAW}/sea/v1/static/spots-dk.json`, true), getJson(`${RAW}/sea/v1/static/spot-geo.json`), getJson(`${RAW}/sea/v1/status.json`),
]);
const spots = mergeSpotCatalogs(cat.spots, dk?.product === 'sea-spots' ? dk.spots : null);
const run = String(args.run ?? status.field.lastPublishedRun), runMs = seaRunMs(run), nowMs = Date.now();
const wind = await spotWind({ dataDir: 'cdn', spots, geoDoc, nowMs, runMs, log: (m) => console.error(`[coast-dir-probe] ${m}`) });

const dAng = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const N = SEA_SPOT_STEPS.length;

const perSpot = {}, hold = [];
let changedOutside = 0, holdSkipped = 0;
const tot = { spots: 0, hoursWithWind: 0, noDirBefore: 0, noDirAfter: 0, interp: 0, interpNoDir: 0, filled: 0, stayGate: 0, stayNeighbour: 0, stayJump: 0, stayEdge: 0 };
for (const sp of spots) {
  const s = wind.series[sp.id];
  if (!s) continue;
  const interp = new Set(wind.interp?.[sp.id] ?? []);
  const fill = spotDirFill(wind, sp.id, s.windDir);
  const row = { country: sp.country ?? 'DE', hoursWithWind: 0, noDirBefore: 0, noDirAfter: 0, interp: interp.size, interpNoDir: 0, filled: fill.filled, stayGate: 0, stayNeighbour: 0, stayJump: 0, stayEdge: 0, firstInterp: interp.size ? Math.min(...interp) : null };
  for (let i = 0; i < N; i++) {
    if (!interp.has(i) && s.windDir[i] !== fill.dir[i]) changedOutside++;
    if (s.wind[i] == null) continue;
    row.hoursWithWind++;
    if (s.windDir[i] == null) row.noDirBefore++;
    if (fill.dir[i] != null) continue;
    row.noDirAfter++;
    if (!interp.has(i)) { row.stayGate++; continue; }
    let a = i - 1, b = i + 1;
    while (a >= 0 && interp.has(a)) a--;
    while (b < N && interp.has(b)) b++;
    const da = a >= 0 ? s.windDir[a] : null, db = b < N ? s.windDir[b] : null;
    if (a < 0 || b >= N) row.stayEdge++; else if (da == null || db == null) row.stayNeighbour++; else row.stayJump++;
  }
  for (const i of interp) if (s.windDir[i] == null && s.wind[i] != null) row.interpNoDir++;
  // hold-out on the hourly part: predict h+1, h+2 from h and h+3
  for (let h = 0; h + 3 < N; h++) {
    if ([h, h + 1, h + 2, h + 3].some((i) => interp.has(i) || s.windDir[i] == null)) continue;
    const probe = s.windDir.slice(); probe[h + 1] = null; probe[h + 2] = null;
    const p = fillLakeDir(probe, [h + 1, h + 2]);
    for (const i of [h + 1, h + 2]) { if (p.dir[i] == null) holdSkipped++; else hold.push({ err: dAng(p.dir[i], s.windDir[i]), wind: s.wind[i] / 10 }); }
  }
  perSpot[sp.id] = row;
  tot.spots++;
  for (const k of Object.keys(tot)) if (k !== 'spots') tot[k] += row[k];
}
// the control is not blind: one changed hour outside `interp` is counted
const first = Object.keys(perSpot)[0], s0 = wind.series[first], i0 = s0.windDir.findIndex((x, i) => x != null && !(wind.interp[first] ?? []).includes(i));
const tampered = spotDirFill(wind, first, s0.windDir).dir; tampered[i0] = (tampered[i0] + 1) % 360;
const controlSees = s0.windDir.filter((x, i) => !(wind.interp[first] ?? []).includes(i) && x !== tampered[i]).length;

const errs = hold.map((x) => x.err), strong = hold.filter((x) => x.wind >= 5).map((x) => x.err);
const out = {
  kind: 'sea/coast-dir-probe', builtAt: new Date(nowMs).toISOString(), run, engine: wind.meta.engine, cubeRuns: wind.meta.runs, maxDeg: LAKE_DIR_FILL_MAX_DEG,
  spotsInCatalogue: spots.length, spotsWithWind: tot.spots, failed: wind.failed,
  total: tot,
  control: { changedOutsideInterp: changedOutside, tamperedHourSeen: controlSees },
  holdOut: { pairs: errs.length, notFilledOver90: holdSkipped, medianDeg: q(errs, 0.5), p90Deg: q(errs, 0.9), maxDeg: errs.length ? Math.max(...errs) : null, from5ms: { pairs: strong.length, medianDeg: q(strong, 0.5), p90Deg: q(strong, 0.9) } },
  perSpot,
};
if (typeof args.out === 'string') writeFileSync(resolve(args.out), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify({ ...out, perSpot: undefined }, null, 1));
console.log(Object.entries(perSpot).map(([id, r]) => `${id.padEnd(28)} ${r.country} wind ${String(r.hoursWithWind).padStart(2)} · ohne Richtung ${String(r.noDirBefore).padStart(2)} → ${String(r.noDirAfter).padStart(2)} · interpoliert ${String(r.interp).padStart(2)} ab h${r.firstInterp ?? '–'} · gefüllt ${String(r.filled).padStart(2)} · bleibt: Sperre ${r.stayGate}, Nachbar ${r.stayNeighbour}, Sprung ${r.stayJump}, Rand ${r.stayEdge}`).join('\n'));
