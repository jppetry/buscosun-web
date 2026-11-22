// Phase GM, GM-2 — how large are the cases in which pSnow of buscosun Fusion is higher at a LOWER elevation of the same glacier (the order rule
// "never more below than above" then changes a share)? Read-only; every `step`-th glacier with own forcing, three answers each, 336 hours.
//   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/gletscher-schneemodell/gm2-order.mjs <v1 dir> <cube dir> <now iso> [step]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeIo, dirStore, geoBackend } from '../../scripts/road/road-forecast.mjs';
import { getPointForecastFromCube, clearCubeForecastCache } from '../../src/pointForecast/cubeSource.ts';
import { installNodeShims } from '../../scripts/punktarchiv/lib/nodeShims.mjs';
import { glacierStaticPath, glacierHypsoFile } from '../../src/glacier/glacierContract.ts';
import { GLACIER_MELT_HOURS } from '../../src/glacier/glacierMeltContract.ts';
import { bandsOf } from '../../scripts/glacier/lib/meltcore.mjs';
import { weatherSeriesOf, fillPhase } from '../../scripts/glacier/lib/weathercore.mjs';
import { flatTerrain, forcingFromForecast } from '../../scripts/glacier/melt.mjs';

const [dataDir, cubeDir, now, stepArg] = process.argv.slice(2);
const H = 3_600_000, nowMs = Date.parse(now), t0Ms = Math.floor(nowMs / H) * H, step = Number(stepArg ?? 8);
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
installNodeShims();
const build = J(join(dataDir, 'index.json')).static.build;
const cat = J(join(dataDir, glacierStaticPath(build, 'catalog.json'))).glaciers.filter((g) => g.klass !== 'C').filter((_, i) => i % step === 0);
const io0 = makeIo({ store: dirStore(cubeDir), cache: geoBackend(null), nowMs });
const hyp = new Map();
const bins = [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.25];
const out = { glaciers: 0, hours: 0, wetHours: 0, any: 0, over: Object.fromEntries(bins.map((b) => [b, { all: 0, wet: 0, mm: 0 }])), max: 0, worst: [] };
for (const g of cat) {
  if (!hyp.has(g.region)) hyp.set(g.region, J(join(dataDir, 'static', build, glacierHypsoFile(g.region))).glaciers);
  const hy = hyp.get(g.region)[g.id]; if (!hy?.a?.some((v) => v > 0)) continue;
  const zb = bandsOf(hy).zb, z = [zb[0], g.z[1], zb[zb.length - 1]];
  const ps = [], T = []; let p = null;
  for (const [lv, zz] of z.entries()) {
    clearCubeForecastCache();
    const fc = await getPointForecastFromCube({ lat: g.lat, lng: g.lon, country: g.country, hours: GLACIER_MELT_HOURS, pointSource: 'cube', includeRadarNowcast: false }, { ...io0, terrain: false, terrainOverride: flatTerrain(zz, g.lat, g.lon) });
    const f = forcingFromForecast(fc, { lat: g.lat, lon: g.lon, zRef: zz, t0Ms });
    ps.push(fillPhase(weatherSeriesOf(fc, { t0Ms, hours: GLACIER_MELT_HOURS }).ps)); T.push(f.t); if (lv === 1) p = f.p;
  }
  out.glaciers++;
  for (let h = 0; h < GLACIER_MELT_HOURS; h++) {
    if (!ps.every((a) => Number.isFinite(a[h]))) continue;
    out.hours++; const wet = p[h] >= 0.1; if (wet) out.wetHours++;
    const d = Math.max(ps[0][h] - Math.min(ps[1][h], ps[2][h]), ps[1][h] - ps[2][h]);   // the largest amount the rule takes away
    if (d > 1e-9) out.any++;
    for (const b of bins) if (d > b) { out.over[b].all++; if (wet) { out.over[b].wet++; out.over[b].mm += d * p[h]; } }
    if (d > out.max) out.max = d;
    if (d > 0.1 && out.worst.length < 12) out.worst.push({ id: g.id, h, z, ps: ps.map((a) => +a[h].toFixed(3)), T: T.map((a) => +a[h].toFixed(1)), p: +p[h].toFixed(2) });
  }
}
for (const b of bins) out.over[b].mm = +out.over[b].mm.toFixed(1);
console.log(JSON.stringify(out, null, 1));
