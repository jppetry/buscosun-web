#!/usr/bin/env node
// SW-0/E-SW-11: does the Terrarium bathymetry height at water spots change buscosun Fusion WIND? Same spot, same clock,
// geo preloaded once as read (height < 0) and once with elevationM patched to 0. Usage: node … elev-effect.mjs
import { installNodeShims } from '../../punktarchiv/lib/nodeShims.mjs';
import { httpStore, memoStore } from '../../../src/point/client/store.ts';
import { getPointForecastFromCube, clearCubeForecastCache } from '../../../src/pointForecast/cubeSource.ts';
import { makeIo, geoBackend } from '../../road/road-forecast.mjs';
import { buildGeo } from '../../road/build-fc-points.mjs';
installNodeShims();
const spots = [{ id: 'fehmarn', lat: 54.5459, lon: 11.1875 }, { id: 'helgoland', lat: 54.1709, lon: 7.8681 }, { id: 'westerland', lat: 54.9376, lon: 8.2431 }];
const { entries, failed } = await buildGeo(spots);
console.log('geo', entries.length, 'failed', failed.length, entries.filter(([k]) => k.startsWith('terrain/')).map(([k, v]) => `${k.slice(0, 40)} h=${v.elevationM}`).join(' | '));
const patched = entries.map(([k, v]) => [k, k.startsWith('terrain/') && v.elevationM < 0 ? { ...v, elevationM: 0 } : v]);
const nowMs = Date.now();
const store = memoStore(httpStore({}));
for (const s of spots) {
  const res = [];
  for (const geo of [entries, patched]) {
    clearCubeForecastCache();
    const io = { ...makeIo({ store, cache: geoBackend({ entries: geo }), nowMs }), z0: { cache: geoBackend({ entries: geo }), cacheOnly: true } };
    const fc = await getPointForecastFromCube({ lat: s.lat, lng: s.lon, country: 'DE', hours: 79, pointSource: 'cube', includeRadarNowcast: false }, io);
    const st = fc.cube.v2.axis.steps;
    res.push({ h: fc.cube.v2.point.hTrue, w: st.map((x) => x.vars.wind?.mean), g: st.map((x) => x.vars.gust?.mean), t: st.map((x) => x.vars.t2m?.mean) });
  }
  const maxd = (a, b) => Math.max(...a.map((x, i) => Math.abs((x ?? 0) - (b[i] ?? 0))));
  console.log(s.id, 'hTrue', res[0].h, '→', res[1].h, '| max |Δ| wind', maxd(res[0].w, res[1].w).toFixed(3), 'm/s, gust', maxd(res[0].g, res[1].g).toFixed(3), 'm/s, T', maxd(res[0].t, res[1].t).toFixed(3), 'K');
}
