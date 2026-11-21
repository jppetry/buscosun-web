#!/usr/bin/env node
/**
 * Phase GS — fixture of `verify:glacier-weather` from REAL answers of buscosun Fusion at glacier points (the same call as `melt.mjs`):
 * `scripts/lib/fixtures/glacier/weather-answer.json`. Per glacier the values of the answer the weather core reads (column-wise, one
 * entry per hour from the run hour, `null` = the answer has nothing there), the forcing `melt.mjs` derives from it, and — with
 * `--before` — the row and hourly row the weather core returns at the moment of the call.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/make-weather-answer-fixture.mjs \
 *        --data=<v1 dir of the glacier view> --cube=<checkout of buscosun-data with point/ and ruc/> --now=<iso> [--ids=a,b] [--before]
 *
 * `before` is the reference of the function-preservation check (old fields unchanged under the temperature rule): it was written ONCE with
 * the core of commit `beforeFrom`, before phase GS touched it. Without `--before` an existing block is kept as it is.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeIo, dirStore, geoBackend } from '../road/road-forecast.mjs';
import { getPointForecastFromCube, clearCubeForecastCache } from '../../src/pointForecast/cubeSource.ts';
import { installNodeShims } from '../punktarchiv/lib/nodeShims.mjs';
import { glacierStaticPath, glacierHypsoFile } from '../../src/glacier/glacierContract.ts';
import { GLACIER_MELT_HOURS } from '../../src/glacier/glacierMeltContract.ts';
import { bandsOf } from './lib/meltcore.mjs';
import { weatherSeriesOf, weatherOfGlacier } from './lib/weathercore.mjs';
import { flatTerrain, assertClima, forcingFromForecast, tempAt } from './melt.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'lib', 'fixtures', 'glacier', 'weather-answer.json');
const H = 3_600_000;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const dataDir = resolve(args.data), cubeDir = resolve(args.cube);
const nowMs = Date.parse(args.now);
if (!Number.isFinite(nowMs)) { console.error('--now=<iso> fehlt'); process.exit(2); }
const t0Ms = Math.floor(nowMs / H) * H;
const ids = String(args.ids ?? 'gl_at_hochweissenfeld-kees,gl_ch_firenband-g008754e46812n').split(',');
const prev = existsSync(OUT) ? J(OUT) : null;

installNodeShims();
const index = J(join(dataDir, 'index.json')), build = index.static.build;
const cat = J(join(dataDir, glacierStaticPath(build, 'catalog.json'))).glaciers;
const io0 = makeIo({ store: dirStore(cubeDir), cache: geoBackend(null), nowMs });
await assertClima(io0);
const num = (v) => (v == null || !Number.isFinite(v) ? null : v);
const glaciers = [];
let notes = null, runs = null;
for (const id of ids) {
  const g = cat.find((x) => x.id === id);
  if (!g) throw new Error(`${id}: nicht im Katalog`);
  const hyp = J(join(dataDir, 'static', build, glacierHypsoFile(g.region))).glaciers[id];
  clearCubeForecastCache();
  const fc = await getPointForecastFromCube({ lat: g.lat, lng: g.lon, country: g.country, hours: GLACIER_MELT_HOURS, pointSource: 'cube', includeRadarNowcast: false }, { ...io0, terrain: false, terrainOverride: flatTerrain(g.z[1], g.lat, g.lon) });
  notes ??= fc.cube.notes; runs ??= fc.cube.v2.provenance?.runs ?? null;
  const steps = fc.cube.v2.axis.steps.filter((s) => { const i = Math.round((s.validAtMs - t0Ms) / H); return i >= 0 && i < GLACIER_MELT_HOURS; });
  const col = (fn) => steps.map((s) => fn(s.vars ?? {}) ?? null);
  const answer = {
    h: steps.map((s) => Math.round((s.validAtMs - t0Ms) / H)), interpolated: steps.map((s) => (s.interpolated ? 1 : 0)),
    t2m: { mean: col((x) => num(x.t2m?.mean)), sigma: col((x) => num(x.t2m?.sigma)), p10: col((x) => num(x.t2m?.p10)), p90: col((x) => num(x.t2m?.p90)) },
    rh: { p50: col((x) => num(x.rh?.p50)) },
    precip: { mean: col((x) => num(x.precip?.mean)), p10: col((x) => num(x.precip?.p10)), p90: col((x) => num(x.precip?.p90)), dist: col((x) => x.precip?.dist) },
    clct: { mean: col((x) => num(x.clct?.mean)) },
    wind: { mean: col((x) => num(x.wind?.mean)) }, windDir: { mean: col((x) => num(x.windDir?.mean)) },
    gust: { mean: col((x) => num(x.gust?.mean)), p10: col((x) => num(x.gust?.p10)), p90: col((x) => num(x.gust?.p90)) },
    snowline: { mean: col((x) => num(x.snowline?.mean)) }, pSnow: { mean: col((x) => num(x.pSnow?.mean)) },
  };
  const f = forcingFromForecast(fc, { lat: g.lat, lon: g.lon, zRef: g.z[1], t0Ms });
  const zb = bandsOf(hyp).zb, z = [zb[0], g.z[1], zb[zb.length - 1]];
  const arr = (a) => Array.from(a, (v) => (Number.isFinite(v) ? v : null));
  const row = { id, country: g.country, region: g.region, klass: g.klass, z, zRef: g.z[1], answer, forcing: { t: arr(f.t), sg: arr(f.sg), p: arr(f.p), n: arr(f.n), fz: arr(f.fz) } };
  const old = prev?.glaciers?.find((x) => x.id === id);
  if (args.before) {
    const w = weatherOfGlacier({ id, z, tz: z.map((zz) => tempAt(f, zz)), from: 'own', p: f.p, n: f.n, wx: weatherSeriesOf(fc, { t0Ms, hours: GLACIER_MELT_HOURS }) });
    if (w.skip) throw new Error(`${id}: übersprungen (${w.skip})`);
    row.before = { row: w.row, hourly: w.hourly };
  } else if (old?.before && prev.t0 === new Date(t0Ms).toISOString()) row.before = old.before;
  glaciers.push(row);
}
const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
const doc = {
  what: 'Reale Antworten von buscosun Fusion an Gletscherpunkten (make-weather-answer-fixture.mjs); before = Ausgabe des Wetterkerns vor Phase GS',
  at: new Date(nowMs).toISOString(), t0: new Date(t0Ms).toISOString(), hours: GLACIER_MELT_HOURS, notes, runs,
  beforeFrom: args.before ? head : prev?.beforeFrom ?? null, glaciers,
};
writeFileSync(OUT, JSON.stringify(doc));
console.log(JSON.stringify({ out: OUT, bytes: readFileSync(OUT).length, glaciers: glaciers.map((g) => ({ id: g.id, z: g.z, before: !!g.before })), beforeFrom: doc.beforeFrom }));
