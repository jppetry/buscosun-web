// GL-0 spike: buscosun Fusion in Node at a glacier point (plan §5.7). Reads the cube over the CDN (like sea-derive --data=cdn).
//   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/spike/fusion-probe.mjs <lat> <lon> <country> [hours]
import { readFileSync } from 'node:fs';
import { installNodeShims } from '../../punktarchiv/lib/nodeShims.mjs';
import { makeIo, geoBackend } from '../../road/road-forecast.mjs';
import { getPointForecastFromCube, clearCubeForecastCache } from '../../../src/pointForecast/cubeSource.ts';
import { httpStore, memoStore } from '../../../src/point/client/store.ts';

installNodeShims();
const [lat, lon, country = 'AT', hours = '336'] = process.argv.slice(2);
const nowMs = Date.now();
const store = memoStore(httpStore({}));
const io = makeIo({ store, cache: geoBackend({ entries: [] }), nowMs });
const hasClima = !!(await io.clima());
console.log('clima field:', hasClima);
for (const pass of ['cold', 'warm']) {
  clearCubeForecastCache();
  const t0 = Date.now();
  const fc = await getPointForecastFromCube({ lat: +lat, lng: +lon, country, hours: +hours, pointSource: 'cube', includeRadarNowcast: false }, io);
  console.log(pass, 'ms', Date.now() - t0);
  if (pass === 'warm') {
    const v2 = fc.cube.v2;
    console.log('top-level keys:', Object.keys(fc), '| cube keys:', Object.keys(fc.cube));
    console.log('v2 keys:', Object.keys(v2));
    console.log('point:', JSON.stringify(v2.point));
    console.log('axis steps:', v2.axis.steps.length, 'first', JSON.stringify(v2.axis.steps[0]).slice(0, 700));
    console.log('step vars at +24h:', Object.keys(v2.axis.steps[24]?.vars ?? {}));
    console.log('notes:', fc.cube.notes?.slice(0, 12));
    console.log('errors:', fc.cube.errors);
    console.log('provenance runs:', JSON.stringify(v2.provenance?.runs).slice(0, 500));
    if (fc.cube.cells) console.log('cells keys:', Object.keys(fc.cube.cells));
  }
}
console.log('store stats', JSON.stringify(store.stats ?? {}));
{
  const fc = await getPointForecastFromCube({ lat: +lat, lng: +lon, country, hours: +hours, pointSource: 'cube', includeRadarNowcast: false }, io);
  const c = fc.cube.cells;
  const k = Object.keys(c);
  const cell = c[24];
  console.log('cell[24] keys:', Object.keys(cell));
  const s = JSON.stringify(cell); console.log('cell[24] json bytes', s.length, s.slice(0, 1500));
  const st = fc.cube.v2.axis.steps[24];
  console.log('step24 snowline', JSON.stringify(st.vars.snowline), 'ps', JSON.stringify(st.vars.ps).slice(0, 200), 'clct', JSON.stringify(st.vars.clct).slice(0, 200));
}
