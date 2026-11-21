#!/usr/bin/env node
/**
 * Phase GS, step 0 — which snow fields the answer of buscosun Fusion carries per lead time at a glacier point. READ-ONLY: the same call
 * as `scripts/glacier/melt.mjs` (flat terrain at the median elevation, 336 h, cube path), nothing is written but the JSON next to this file.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/gletscher-schneefelder/probe-fields.mjs \
 *        --data=<v1 dir of the glacier view> --cube=<checkout of buscosun-data with point/ and ruc/> [--now=<iso>] [--n=6] [--out=<json>]
 *
 * Per field and glacier: the lead hours with a value, folded into ranges with their step (hourly / 3-hourly / none); the kind of the
 * distribution; and the check that the engine's own phase function on the answer's temperature distribution and humidity gives the
 * answer's `pSnow` again (the base of the snow share at tongue and top).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeIo, dirStore, geoBackend } from '../../scripts/road/road-forecast.mjs';
import { getPointForecastFromCube, clearCubeForecastCache } from '../../src/pointForecast/cubeSource.ts';
import { installNodeShims } from '../../scripts/punktarchiv/lib/nodeShims.mjs';
import { fusionVersionOfNotes } from '../../src/pointForecast/fusion/fusionRelease.ts';
import { quantileOf } from '../../src/pointForecast/fusion/dist.ts';
import { wetBulbC, snowProbabilityFromWetBulb } from '../../src/pointForecast/fusion/meteo.ts';
import { PHASE_RH_BLEND, PHASE_RH_SATURATED } from '../../src/pointForecast/fusion/priors.ts';
import { glacierStaticPath } from '../../src/glacier/glacierContract.ts';
import { flatTerrain, assertClima } from '../../scripts/glacier/melt.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const H = 3_600_000;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const fin = Number.isFinite;

/** Lead hours → ranges `a–b/step`. */
function fold(hours) {
  if (!hours.length) return 'none';
  const out = [];
  let a = hours[0], prev = hours[0], step = null;
  const push = () => out.push(a === prev ? `${a}` : `${a}–${prev}/${step}h`);
  for (let i = 1; i < hours.length; i++) {
    const d = hours[i] - prev;
    if (step == null) step = d;
    if (d !== step) { push(); a = hours[i]; step = null; }
    prev = hours[i];
  }
  push();
  return out.join(' ');
}

const dataDir = resolve(args.data), cubeDir = resolve(args.cube);
const nowMs = args.now ? Date.parse(args.now) : Date.now();
const t0Ms = Math.floor(nowMs / H) * H;
installNodeShims();
const index = J(join(dataDir, 'index.json'));
const cat = J(join(dataDir, glacierStaticPath(index.static.build, 'catalog.json'))).glaciers.filter((g) => g.klass !== 'C').sort((a, b) => a.z[1] - b.z[1]);
const n = Number(args.n ?? 6);
const pick = [...new Set([...Array.from({ length: n - 1 }, (_, i) => cat[Math.round((i * (cat.length - 1)) / (n - 2))]), cat.find((g) => g.country === 'DE')].filter(Boolean))];
const io0 = makeIo({ store: dirStore(cubeDir), cache: geoBackend(null), nowMs });
await assertClima(io0);

const FIELDS = {
  'snowline.mean': (x) => x.snowline?.mean, 'snowline.p10': (x) => x.snowline?.p10,
  'pSnow.mean': (x) => x.pSnow?.mean,
  'precip.mean': (x) => x.precip?.mean, 'precip.p10': (x) => x.precip?.p10, 'precip.p90': (x) => x.precip?.p90, 'precip.dist': (x) => (x.precip?.dist ? 1 : null),
  'gust.mean': (x) => x.gust?.mean, 'gust.p10': (x) => x.gust?.p10, 'gust.p90': (x) => x.gust?.p90, 'gust.dist': (x) => (x.gust?.dist ? 1 : null),
  't2m.dist': (x) => (x.t2m?.dist ? 1 : null), 'rh.p50': (x) => x.rh?.p50,
};
const rows = [];
let engine = null;
for (const g of pick) {
  const io = { ...io0, terrain: false, terrainOverride: flatTerrain(g.z[1], g.lat, g.lon) };
  clearCubeForecastCache();
  const t = Date.now();
  const fc = await getPointForecastFromCube({ lat: g.lat, lng: g.lon, country: g.country, hours: 336, pointSource: 'cube', includeRadarNowcast: false }, io);
  const steps = fc.cube.v2.axis.steps.map((s) => ({ ...s, h: Math.round((s.validAtMs - t0Ms) / H) })).filter((s) => s.h >= 0 && s.h < 336);
  engine ??= fusionVersionOfNotes(fc.cube.notes);
  const fields = Object.fromEntries(Object.entries(FIELDS).map(([k, fn]) => [k, fold(steps.filter((s) => { const v = fn(s.vars ?? {}); return v != null && fin(v); }).map((s) => s.h))]));
  const kinds = (id) => [...new Set(steps.map((s) => s.vars?.[id]?.dist?.kind).filter(Boolean))].join(',');
  // the engine's phase function on the answer's own temperature distribution and humidity median against the answer's pSnow
  let dMax = 0, nCmp = 0, wet = 0;
  for (const s of steps) {
    const x = s.vars ?? {};
    if (!x.t2m?.dist || !fin(x.pSnow?.mean)) continue;
    const rh = fin(x.rh?.p50) ? (1 - PHASE_RH_BLEND) * x.rh.p50 + PHASE_RH_BLEND * PHASE_RH_SATURATED : PHASE_RH_SATURATED;
    let acc = 0;
    for (let i = 0; i < 21; i++) acc += snowProbabilityFromWetBulb(wetBulbC(quantileOf(x.t2m.dist, (i + 0.5) / 21), rh));
    dMax = Math.max(dMax, Math.abs(acc / 21 - x.pSnow.mean)); nCmp++;
    if (x.pSnow.mean > 0.02 && x.pSnow.mean < 0.98) wet++;
  }
  rows.push({
    id: g.id, country: g.country, zMed: g.z[1], seconds: (Date.now() - t) / 1000, steps: steps.length,
    interpolated: fold(steps.filter((s) => s.interpolated).map((s) => s.h)),
    tiers: Object.fromEntries(['t1', 't2', 't3'].map((k) => [k, fold(steps.filter((s) => s.tier === k).map((s) => s.h))])),
    fields, dist: { t2m: kinds('t2m'), precip: kinds('precip'), gust: kinds('gust'), snowline: kinds('snowline') },
    pSnowReplica: { hours: nCmp, mixedHours: wet, maxAbsDiff: Math.round(dMax * 1e5) / 1e5 },
    sample: steps.filter((s) => [3, 30, 60, 130, 300].includes(s.h)).map((s) => ({ h: s.h, tier: s.tier, interpolated: s.interpolated, t2m: s.vars.t2m && { mean: s.vars.t2m.mean, sigma: s.vars.t2m.sigma, dist: s.vars.t2m.dist }, rh: s.vars.rh?.p50, pSnow: s.vars.pSnow?.mean, snowline: s.vars.snowline, precip: s.vars.precip && { mean: s.vars.precip.mean, p10: s.vars.precip.p10, p50: s.vars.precip.p50, p90: s.vars.precip.p90, dist: s.vars.precip.dist }, gust: s.vars.gust && { mean: s.vars.gust.mean, p10: s.vars.gust.p10, p90: s.vars.gust.p90, dist: s.vars.gust.dist } })),
  });
}
const out = { at: new Date(nowMs).toISOString(), t0: new Date(t0Ms).toISOString(), engine, cube: J(join(cubeDir, 'point', 'index.json')).latestByTier && Object.fromEntries(Object.entries(J(join(cubeDir, 'point', 'index.json')).latestByTier).map(([k, v]) => [k, v.run])), glaciers: rows };
writeFileSync(resolve(args.out ?? join(HERE, 'probe-fields.json')), JSON.stringify(out, null, 1));
for (const r of rows) console.log(r.id, r.zMed, 'm', `${r.seconds.toFixed(1)} s`, JSON.stringify({ interpolated: r.interpolated, tiers: r.tiers, fields: r.fields, dist: r.dist, pSnowReplica: r.pSnowReplica }));
