#!/usr/bin/env node
/**
 * V-BS-1 — why buscosun Fusion gives no wind direction at many hours at the Alpine lakes. Measurement only; buscosun
 * Fusion is READ (the producer's own call, `getPointForecastFromCube` at the lake's water point), nothing is changed.
 *
 * Rules, written before the first run (2026-11-21):
 *   spots     every spot of the published lake catalogue, same point, country and terrain file as the producer
 *   gate      the engine reports a direction when ν/σ of its fused wind components reaches WIND_DIR_MIN_CONCENTRATION;
 *             the fused components are not part of the output, so the gate is read by its result (direction or none)
 *   hidden    the direction the gate withholds = bearing of the cube member (u10, v10 of the cell the engine reads, same
 *             chunk, same step). At the lake spots the cube member carries the wind alone (weight 1), and both components
 *             get the same factors, so this is the bearing the engine would report without the gate
 *   ν, σ      ν = speed of the cube member's mean vector; σ = spread of the wind speed in the engine's output (`sigma`);
 *             next to it the cube's own two spreads of the components (models against each other, ensemble)
 *   truth     the wind station of the catalogue (`lake.stations.wind`), `obs/v1/latest.json`, read with the page's own
 *             rule `lakeObsOf`; a measurement below CALM_MS has no direction worth comparing. Compared with the carrying
 *             step nearest to the measurement time, at most 90 minutes away
 *   numbers   share of hours with a direction on carrying and on interpolated steps; ν/σ and σ per lake; wind speed in
 *             the hours without a direction; error of the direction against the station for gate open / gate closed;
 *             change of the direction from one carrying step to the next (noise shows as large jumps)
 *
 * One run is ONE weather situation.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/seewetter-binnenseen/wind-dir-probe.mjs [--out=<file>]
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RAW = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main';
const CALM_MS = 1.0, MATCH_MAX_MIN = 90, H = 3_600_000, KN = 1.943844;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const getJson = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u} → ${r.status}`); return r.json(); };

const { installNodeShims } = await import('../../scripts/punktarchiv/lib/nodeShims.mjs');
installNodeShims();
const { makeIo, geoBackend } = await import('../../scripts/road/road-forecast.mjs');
const { getPointForecastFromCube, clearCubeForecastCache } = await import('../../src/pointForecast/cubeSource.ts');
const { WIND_DIR_MIN_CONCENTRATION } = await import('../../src/pointForecast/fusion/priors.ts');
const { httpStore, memoStore } = await import('../../src/point/client/store.ts');
const { spotWaterPoint } = await import('../../src/sea/seaContract.ts');
const { lakeObsOf } = await import('../../src/sea/seaLakes.ts');
const { readPointBundle } = await import('../../src/point/client/readPoint.ts');

const [cat, geoDoc, latest] = await Promise.all([getJson(`${RAW}/sea/v1/static/spots-lakes.json`), getJson(`${RAW}/sea/v1/static/lake-geo.json`), getJson(`${RAW}/obs/v1/latest.json`)]);
const nowMs = Date.now();
const io = makeIo({ store: memoStore(httpStore({})), cache: geoBackend(geoDoc), nowMs });
if (!(await io.clima())) throw new Error('Klimatologie fehlt');

const bearing = (u, v) => ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360;
const dAng = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

const spots = (args.only ? cat.spots.filter((s) => String(args.only).split(',').includes(s.id) || String(args.only).split(',').includes(s.lake.id)) : cat.spots);
const rows = [];        // one per spot and step
const perSpot = {};
for (const sp of spots) {
  const p = spotWaterPoint(sp);
  clearCubeForecastCache();
  const fc = await getPointForecastFromCube({ lat: p.lat, lng: p.lon, country: sp.lake?.fusion?.country ?? 'DE', hours: 80, pointSource: 'cube', includeRadarNowcast: false }, io);
  const v2 = fc.cube?.v2?.axis?.steps ?? [];
  // the cube member itself (u10, v10 and its two spreads) — the same chunks, already in the memo store
  const b = await readPointBundle({ lat: p.lat, lon: p.lon, nowMs, fromMs: Math.floor(nowMs / H) * H, toMs: Math.floor(nowMs / H) * H + 80 * H, stepH: 1 }, { store: io.store, nowcast: false, plan: false, neighbours: true });
  const cube = new Map();
  for (const tier of ['t3', 't2', 't1']) for (const cs of b.cube?.[tier]?.steps ?? []) cube.set(`${tier}|${cs.validAtMs}`, cs.values);
  const list = [];
  v2.forEach((st) => {
    const out = st.vars ?? {};
    const row = { spot: sp.id, lake: sp.lake.id, land: sp.lake.land, t: st.validAtMs, lead: st.leadH, tier: st.tier, interp: !!st.interpolated,
      mean: out.wind?.mean ?? null, sigmaOut: out.wind?.sigma ?? null, dir: out.windDir?.mean ?? null, nu: null, sigma: null, sigmaEns: null, ratio: null, hidden: null };
    const cv = st.interpolated ? null : cube.get(`${st.tier}|${st.validAtMs}`);
    const n = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    if (cv && n(cv.u10) != null && n(cv.v10) != null) {
      row.nu = Math.hypot(cv.u10, cv.v10); row.hidden = bearing(cv.u10, cv.v10);
      if (n(cv.u10_sd) != null && n(cv.v10_sd) != null) row.sigma = Math.sqrt(0.5 * (cv.u10_sd ** 2 + cv.v10_sd ** 2));
      if (n(cv.u10_sd_ens) != null && n(cv.v10_sd_ens) != null) row.sigmaEns = Math.sqrt(0.5 * (cv.u10_sd_ens ** 2 + cv.v10_sd_ens ** 2));
      // the engine's own gate works on the fused components; from outside only the output is visible: mean vector of the
      // cube member against the spread of the wind speed the engine reports
      if (row.sigmaOut) row.ratio = row.nu / row.sigmaOut;
    }
    list.push(row); rows.push(row);
  });
  // station
  const stn = sp.lake.stations?.wind ?? null;
  const obs = stn ? lakeObsOf(latest.stations?.[stn.id], Date.parse(latest.builtAt)) : null;
  let cmp = null;
  if (obs && obs.ffMs != null && obs.ddDeg != null && obs.ffMs >= CALM_MS) {
    const carryRow = list.filter((r) => !r.interp && r.hidden != null).sort((a, b) => Math.abs(a.t - obs.t) - Math.abs(b.t - obs.t))[0];
    if (carryRow && Math.abs(carryRow.t - obs.t) <= MATCH_MAX_MIN * 60_000) cmp = { station: stn.id, km: stn.km, obsMs: obs.ffMs, obsDir: obs.ddDeg, lead: carryRow.lead, nuMs: carryRow.nu, ratio: carryRow.ratio, open: carryRow.dir != null, hidden: carryRow.hidden, err: dAng(carryRow.hidden, obs.ddDeg) };
  }
  perSpot[sp.id] = { lake: sp.lake.id, steps: list.length, carrying: list.filter((r) => !r.interp).length, obs: obs ? { ffMs: obs.ffMs, ddDeg: obs.ddDeg } : null, cmp };
  process.stderr.write('.');
}
process.stderr.write('\n');

// --- numbers ----------------------------------------------------------------------------------------------
const carry = rows.filter((r) => !r.interp && r.nu != null && r.ratio != null), interp = rows.filter((r) => r.interp);
const share = (a, f) => (a.length ? Math.round((1000 * a.filter(f).length) / a.length) / 10 : null);
const lakes = {};
for (const r of rows) (lakes[r.lake] ??= { land: r.land, rows: [] }).rows.push(r);
const perLake = Object.entries(lakes).map(([id, L]) => {
  const c = L.rows.filter((r) => !r.interp && r.nu != null && r.ratio != null), i = L.rows.filter((r) => r.interp);
  const closed = c.filter((r) => r.dir == null);
  return { lake: id, land: L.land, hours: L.rows.length, dirAllPct: share(L.rows, (r) => r.dir != null), carrying: c.length, dirCarryPct: share(c, (r) => r.dir != null), interp: i.length, dirInterpPct: share(i, (r) => r.dir != null),
    nuMed: r1(med(c.map((r) => r.nu))), ratioMed: r1(med(c.map((r) => r.ratio))), closedMeanKnMed: r1(med(closed.map((r) => r.mean * KN))), closedMeanKnP90: r1(q(closed.map((r) => r.mean * KN), 0.9)),
    sigmaDivMed: r1(med(c.filter((r) => r.sigma != null).map((r) => r.sigma))), sigmaEnsMed: r1(med(c.filter((r) => r.sigmaEns != null).map((r) => r.sigmaEns))), sigmaOutMed: r1(med(c.map((r) => r.sigmaOut))) };
}).sort((a, b) => (a.dirAllPct ?? 0) - (b.dirAllPct ?? 0));

// jumps of the direction between consecutive carrying steps of one spot (same step width only)
const jumps = { open: [], closed: [] };
const bySpot = {};
for (const r of carry) (bySpot[r.spot] ??= []).push(r);
for (const list of Object.values(bySpot)) for (let k = 1; k < list.length; k++) {
  const a = list[k - 1], b = list[k];
  if (a.hidden == null || b.hidden == null || b.t - a.t > 3 * H) continue;
  const both = a.dir != null && b.dir != null, none = a.dir == null && b.dir == null;
  if (both) jumps.open.push(dAng(a.hidden, b.hidden)); else if (none) jumps.closed.push(dAng(a.hidden, b.hidden));
}
// interpolated hours: the engine interpolates the speed between two carrying steps but gives no direction there. What a
// direction interpolated on the shorter arc would fill: both neighbours carry a direction and differ by at most 90°
const fill = { interp: 0, bothOpen: 0, within90: 0, windKn: [], perLake: {} };
const allBySpot = {};
for (const r of rows) (allBySpot[r.spot] ??= []).push(r);
for (const list of Object.values(allBySpot)) list.forEach((r, k) => {
  if (!r.interp) return;
  fill.interp++;
  let a = k - 1, b = k + 1;
  while (a >= 0 && list[a].interp) a--;
  while (b < list.length && list[b].interp) b++;
  if (a < 0 || b >= list.length || list[a].dir == null || list[b].dir == null) return;
  fill.bothOpen++;
  if (dAng(list[a].dir, list[b].dir) <= 90) { fill.within90++; if (r.mean != null) fill.windKn.push(r.mean * KN); fill.perLake[r.lake] = (fill.perLake[r.lake] ?? 0) + 1; }
});
const fillOut = { interp: fill.interp, bothNeighboursWithDir: fill.bothOpen, within90: fill.within90, windKnMed: r1(med(fill.windKn)), windKnMax: r1(Math.max(...fill.windKn, 0)), perLake: fill.perLake };
// by lead
const leadBins = [[0, 6], [7, 24], [25, 48], [49, 80]].map(([a, b]) => { const c = carry.filter((r) => r.lead >= a && r.lead <= b), al = rows.filter((r) => r.lead >= a && r.lead <= b);
  return { lead: `${a}-${b}`, hours: al.length, dirAllPct: share(al, (r) => r.dir != null), carrying: c.length, dirCarryPct: share(c, (r) => r.dir != null), interpPct: share(al, (r) => r.interp), sigmaOutMed: r1(med(c.map((r) => r.sigmaOut))), nuMed: r1(med(c.map((r) => r.nu))) }; });
// what another threshold would open
// the outside ratio ν/σout at which the gate was open / closed (the engine's own ratio is not in the output)
const thresholds = { openRatio: { p10: r1(q(carry.filter((r) => r.dir != null).map((r) => r.ratio), 0.1)), med: r1(med(carry.filter((r) => r.dir != null).map((r) => r.ratio))) }, closedRatio: { med: r1(med(carry.filter((r) => r.dir == null).map((r) => r.ratio))), p90: r1(q(carry.filter((r) => r.dir == null).map((r) => r.ratio), 0.9)) },
  cubeSpeedKn: [2, 3, 4, 5, 6, 8].map((kn) => ({ fromKn: kn, hours: carry.filter((r) => r.nu * KN >= kn).length, dirPct: share(carry.filter((r) => r.nu * KN >= kn), (r) => r.dir != null) })) };
// station comparison (unique stations)
const seen = new Set(), cmps = [];
for (const s of Object.values(perSpot)) if (s.cmp && !seen.has(s.cmp.station)) { seen.add(s.cmp.station); cmps.push({ lake: s.lake, ...s.cmp }); }
const cmpStat = (a) => ({ n: a.length, medErr: r1(med(a.map((x) => x.err))), within45: a.filter((x) => x.err <= 45).length, within90: a.filter((x) => x.err <= 90).length });

const out = {
  at: new Date(nowMs).toISOString(), obsAt: latest.builtAt, gate: WIND_DIR_MIN_CONCENTRATION, rules: { CALM_MS, MATCH_MAX_MIN },
  all: { spots: spots.length, hours: rows.length, dirAllPct: share(rows, (r) => r.dir != null), carrying: carry.length, dirCarryPct: share(carry, (r) => r.dir != null), interp: interp.length, dirInterpPct: share(interp, (r) => r.dir != null) },
  leadBins, thresholds, interpolated: fillOut, perLake,
  jumps: { open: { n: jumps.open.length, medDeg: r1(med(jumps.open)), p90Deg: r1(q(jumps.open, 0.9)) }, closed: { n: jumps.closed.length, medDeg: r1(med(jumps.closed)), p90Deg: r1(q(jumps.closed, 0.9)) } },
  stations: { open: cmpStat(cmps.filter((x) => x.open)), closed: cmpStat(cmps.filter((x) => !x.open)), rows: cmps.map((x) => ({ ...x, nuMs: r1(x.nuMs), ratio: r1(x.ratio), hidden: Math.round(x.hidden), err: Math.round(x.err) })), calmStations: Object.values(perSpot).filter((s) => s.obs && s.obs.ffMs != null && s.obs.ffMs < CALM_MS).length },
  closedWindKn: { n: carry.filter((r) => r.dir == null).length, med: r1(med(carry.filter((r) => r.dir == null).map((r) => r.mean * KN))), p90: r1(q(carry.filter((r) => r.dir == null).map((r) => r.mean * KN), 0.9)), nuKnMed: r1(med(carry.filter((r) => r.dir == null).map((r) => r.nu * KN))), nuKnP90: r1(q(carry.filter((r) => r.dir == null).map((r) => r.nu * KN), 0.9)) },
};
const file = resolve(typeof args.out === 'string' ? args.out : 'audit/seewetter-binnenseen/wind-dir-probe.json');
writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify({ all: out.all, interpolated: fillOut, leadBins, thresholds, jumps: out.jumps, stations: { open: out.stations.open, closed: out.stations.closed }, closedWindKn: out.closedWindKn }, null, 1));
console.log('lake                   land dirAll carry dirCarry interp dirInterp   ν   ν/σout closed kn (med p90)  σout σdiv σens');
for (const L of perLake) console.log(`${L.lake.padEnd(22)} ${L.land}   ${String(L.dirAllPct).padStart(5)} ${String(L.carrying).padStart(5)} ${String(L.dirCarryPct).padStart(7)} ${String(L.interp).padStart(6)} ${String(L.dirInterpPct).padStart(8)}  ${L.nuMed}  ${L.ratioMed}    ${L.closedMeanKnMed} ${L.closedMeanKnP90}    ${L.sigmaOutMed} ${L.sigmaDivMed} ${L.sigmaEnsMed}`);
console.log(`→ ${file}`);
