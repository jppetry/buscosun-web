#!/usr/bin/env node
// SW-0 spike: does the buscosun Fusion cube deliver wind and gust at the water spots (stage fs, 0-78 h)?
// Reads the live cube over the CDN with the road producer's Node io (makeIo, no anchor), one spot after another.
// Usage: node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/spike/cube-spots.mjs [--json=<out>]
import { writeFileSync } from 'node:fs';
import { installNodeShims } from '../../punktarchiv/lib/nodeShims.mjs';
import { httpStore, memoStore } from '../../../src/point/client/store.ts';
import { getPointForecastFromCube, clearCubeForecastCache } from '../../../src/pointForecast/cubeSource.ts';
import { makeIo, geoBackend } from '../../road/road-forecast.mjs';
import { fusionVersionOfNotes } from '../../../src/pointForecast/fusion/fusionRelease.ts';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
// The eleven mockup spots: nearest CWAM sea cell of the decode spike (lat/lon of the cell centre).
const cell = (i, j) => ({ lat: +(56.445835 - j * 0.008333).toFixed(4), lon: +(6.173611 + i * 0.013889).toFixed(4) });
const SPOTS = [['St. Peter-Ording', 172, 256], ['Westerland', 149, 181], ['Helgoland', 122, 273], ['Büsum', 190, 279], ['Cuxhaven-Duhnen', 181, 307],
  ['Norderney', 69, 327], ['Eckernförde', 266, 237], ['Kiel-Schilksee', 289, 241], ['Laboe', 292, 242], ['Heiligenhafen', 348, 247], ['Fehmarn Grüner Brink', 361, 228]];
installNodeShims();
const nowMs = Date.now();
const io = makeIo({ store: memoStore(httpStore({})), cache: geoBackend(null), nowMs });
const out = [];
for (const [name, i, j] of SPOTS) {
  const p = cell(i, j);
  clearCubeForecastCache();
  const t0 = Date.now();
  try {
    const fc = await getPointForecastFromCube({ lat: p.lat, lng: p.lon, country: 'DE', hours: 79, pointSource: 'cube', includeRadarNowcast: false }, io);
    const steps = fc.cube?.v2?.axis?.steps ?? [];
    const w = steps.map((s) => s.vars?.wind?.mean).filter(Number.isFinite), g = steps.map((s) => s.vars?.gust?.mean).filter(Number.isFinite), d = steps.map((s) => s.vars?.windDir?.mean).filter(Number.isFinite);
    const lastH = steps.length ? Math.round((steps[steps.length - 1].validAtMs - nowMs) / 3.6e6) : null;
    const tiers = [...new Set(steps.map((s) => s.tier))];
    out.push({ name, ...p, ms: Date.now() - t0, steps: steps.length, lastH, wind: w.length, gust: g.length, dir: d.length, tiers,
      stage: fusionVersionOfNotes(fc.cube.notes), hTrue: fc.cube.v2.point?.hTrue ?? null, windKn0: w.length ? +(w[0] * 1.94384).toFixed(1) : null,
      gustKn0: g.length ? +(g[0] * 1.94384).toFixed(1) : null, errors: fc.cube.errors.length, sources: fc.sourcesAvailable });
  } catch (e) { out.push({ name, ...p, error: String(e?.message ?? e).split('\n')[0] }); }
  console.log(JSON.stringify(out[out.length - 1]));
}
if (args.json) writeFileSync(String(args.json), JSON.stringify({ at: new Date(nowMs).toISOString(), spots: out }, null, 1));
