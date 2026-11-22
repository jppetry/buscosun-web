#!/usr/bin/env node
/**
 * Phase GM (GM-2) — fixture of `verify:glacier-weather`, block H: REAL answers of buscosun Fusion at tongue, median elevation and top of
 * glaciers (the calls `melt.mjs` makes with `--heights=three`): `scripts/lib/fixtures/glacier/weather-levels.json`. Per glacier and elevation
 * the series the weather core reads (temperature, sigma, humidity, pSnow), at the median elevation also precipitation, clouds, wind, gust
 * and the snowfall line of the answer — one entry per hour from the run hour, `null` = the answer has nothing there.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/make-weather-levels-fixture.mjs \
 *        --data=<v1 dir of the glacier view> --cube=<checkout of buscosun-data with point/ and ruc/> --now=<iso> [--ids=a,b]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeIo, dirStore, geoBackend } from '../road/road-forecast.mjs';
import { getPointForecastFromCube, clearCubeForecastCache } from '../../src/pointForecast/cubeSource.ts';
import { installNodeShims } from '../punktarchiv/lib/nodeShims.mjs';
import { glacierStaticPath, glacierHypsoFile } from '../../src/glacier/glacierContract.ts';
import { GLACIER_MELT_HOURS } from '../../src/glacier/glacierMeltContract.ts';
import { bandsOf } from './lib/meltcore.mjs';
import { weatherSeriesOf } from './lib/weathercore.mjs';
import { flatTerrain, assertClima, forcingFromForecast } from './melt.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'lib', 'fixtures', 'glacier', 'weather-levels.json');
const H = 3_600_000;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const dataDir = resolve(args.data), cubeDir = resolve(args.cube);
const nowMs = Date.parse(args.now);
if (!Number.isFinite(nowMs)) { console.error('--now=<iso> fehlt'); process.exit(2); }
const t0Ms = Math.floor(nowMs / H) * H;
// a glacier in a cold column (the answer's snowfall line runs to a few metres) and one with a warm tongue far below the median elevation
const ids = String(args.ids ?? 'gl_at_hallstaetter-gletscher,gl_ch_grosser-aletschgletscher').split(',');

installNodeShims();
const index = J(join(dataDir, 'index.json')), build = index.static.build;
const cat = J(join(dataDir, glacierStaticPath(build, 'catalog.json'))).glaciers;
const io0 = makeIo({ store: dirStore(cubeDir), cache: geoBackend(null), nowMs });
await assertClima(io0);
const arr = (a, digits) => Array.from(a, (v) => (Number.isFinite(v) ? +v.toFixed(digits) : null));
const glaciers = [];
let notes = null, runs = null;
for (const id of ids) {
  const g = cat.find((x) => x.id === id);
  if (!g) throw new Error(`${id}: nicht im Katalog`);
  const hyp = J(join(dataDir, 'static', build, glacierHypsoFile(g.region))).glaciers[id];
  const zb = bandsOf(hyp).zb, z = [zb[0], g.z[1], zb[zb.length - 1]];
  const levels = [];
  let median = null;
  for (const [lv, zz] of z.entries()) {
    clearCubeForecastCache();
    const fc = await getPointForecastFromCube({ lat: g.lat, lng: g.lon, country: g.country, hours: GLACIER_MELT_HOURS, pointSource: 'cube', includeRadarNowcast: false }, { ...io0, terrain: false, terrainOverride: flatTerrain(zz, g.lat, g.lon) });
    notes ??= fc.cube.notes; runs ??= fc.cube.v2.provenance?.runs ?? null;
    const f = forcingFromForecast(fc, { lat: g.lat, lon: g.lon, zRef: zz, t0Ms }), wx = weatherSeriesOf(fc, { t0Ms, hours: GLACIER_MELT_HOURS });
    levels.push({ z: zz, t: arr(f.t, 3), sg: arr(f.sg, 3), rh: arr(wx.rh, 1), ps: arr(wx.ps, 3) });
    if (lv === 1) median = { p: arr(f.p, 3), n: arr(f.n, 3), fz: arr(f.fz, 0), w: arr(wx.w, 2), g: arr(wx.g, 2), g10: arr(wx.g10, 2), g90: arr(wx.g90, 2), d: arr(wx.d, 0), t10: arr(wx.t10, 2), t90: arr(wx.t90, 2), sl: arr(wx.sl, 0) };
  }
  glaciers.push({ id, country: g.country, region: g.region, z, levels, median });
}
const doc = {
  what: 'Reale Antworten von buscosun Fusion an Zunge, Medianhöhe und Oberkante (make-weather-levels-fixture.mjs), Phase GM',
  at: new Date(nowMs).toISOString(), t0: new Date(t0Ms).toISOString(), hours: GLACIER_MELT_HOURS, notes, runs, glaciers,
};
writeFileSync(OUT, JSON.stringify(doc));
console.log(JSON.stringify({ out: OUT, bytes: readFileSync(OUT).length, glaciers: glaciers.map((g) => ({ id: g.id, z: g.z })) }));
