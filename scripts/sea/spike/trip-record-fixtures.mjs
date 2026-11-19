#!/usr/bin/env node
// Phase AM: records the fixtures of `verify:sea-trip` (scripts/lib/fixtures/sea/trip/) — REAL answers, written once.
//   wind.json                buscosun Fusion at the sample points of the leg Laboe → waypoint → Marstal (client cube path
//                            in Node as `sea-derive.mjs` calls it: country 'DE', no radar), read with `windSeriesOfSteps`
//   f-<run>-<sss>.png        the CWAM field images of the two hours the recorded u/v images of the BSH run cover
//                            (scripts/lib/fixtures/sea/ripples/, hours 6 and 9 = 19.11.2026 07:00 and 10:00 UTC)
//   manifest.json            what, when, sha256
// Usage: node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/spike/trip-record-fixtures.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installNodeShims } from '../../punktarchiv/lib/nodeShims.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '..', '..', 'lib', 'fixtures', 'sea');
const OUT = join(FIX, 'trip');
const H = 3_600_000, RUN = '2026111812';
mkdirSync(OUT, { recursive: true });
installNodeShims();
const { httpStore, memoStore } = await import('../../../src/point/client/store.ts');
const { getPointForecastFromCube, clearCubeForecastCache } = await import('../../../src/pointForecast/cubeSource.ts');
const { makeIo, geoBackend } = await import('../../road/road-forecast.mjs');
const { fusionVersionOfNotes } = await import('../../../src/pointForecast/fusion/fusionRelease.ts');
const C = await import('../../../src/sea/seaContract.ts');
const T = await import('../../../src/sea/seaTrip.ts');
const D = await import('../../../src/sea/seaTripData.ts');

const spots = C.mergeSpotCatalogs(JSON.parse(readFileSync(join(FIX, 'static', 'spots.json'), 'utf8')).spots, JSON.parse(readFileSync(join(FIX, 'dk', 'spots-dk.json'), 'utf8')).spots);
const laboe = spots.find((s) => s.id === 'laboe'), marstal = spots.find((s) => /marstal/.test(s.id));
if (!laboe || !marstal) throw new Error(`Spots fehlen: ${spots.filter((s) => /laboe|marstal/.test(s.id)).map((s) => s.id)}`);
const points = [T.snapToSpot(laboe), { lat: 54.62, lon: 10.3 }, T.snapToSpot(marstal)];
const route = T.tripRoute(points);
const { samples, stepKm } = T.tripSamples(route);

const nowMs = Date.now();
const io = makeIo({ store: memoStore(httpStore({})), cache: geoBackend(null), nowMs });
const out = { recorded: new Date(nowMs).toISOString(), call: "getPointForecastFromCube({ country: 'DE', hours: 80, pointSource: 'cube', includeRadarNowcast: false })", stage: null, t1: null, points, stepKm, km: route.km, samples: [] };
for (const s of samples) {
  clearCubeForecastCache();
  const fc = await getPointForecastFromCube({ lat: s.lat, lng: s.lon, country: 'DE', hours: 80, pointSource: 'cube', includeRadarNowcast: false }, io);
  const steps = fc.cube?.v2?.axis?.steps ?? [];
  out.stage ??= fusionVersionOfNotes(fc.cube.notes);
  out.t1 ??= fc.cube.v2.provenance?.runs?.t1?.run ?? null;
  const series = D.windSeriesOfSteps(steps);
  // [hour ms, wind m/s, gust m/s, direction] exactly as the reader hands them to the rows.
  const hours = series ? [...series].map(([t, w]) => [t, w.windMs, w.gustMs, w.windDir]) : [];
  // The raw means of the engine next to them, so the verifier can check the reader against a second rule.
  const raw = steps.filter((x) => x.validAtMs % H === 0).map((x) => [x.validAtMs, x.vars?.wind?.mean ?? null, x.vars?.gust?.mean ?? null, x.vars?.windDir?.mean ?? null]);
  out.samples.push({ lat: s.lat, lon: s.lon, km: +s.km.toFixed(3), hours, raw });
  console.log(`${s.lat},${s.lon} km ${s.km.toFixed(1)}: ${hours.length} Stunden, ohne Richtung ${hours.filter((h) => h[3] == null).length}`);
}
writeFileSync(join(OUT, 'wind.json'), JSON.stringify(out));

const sha = (b) => createHash('sha256').update(b).digest('hex');
const files = {};
for (const step of [19, 22]) {
  const path = C.seaFieldPath('cwam', RUN, step);
  const r = await fetch(`${C.SEA_RAW_BASE}/${path}`, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  const b = Buffer.from(await r.arrayBuffer()), name = `f-${RUN}-${String(step).padStart(3, '0')}.png`;
  writeFileSync(join(OUT, name), b);
  files[name] = { bytes: b.length, sha256: sha(b), path: `sea/v1/${path}` };
}
files['wind.json'] = { bytes: readFileSync(join(OUT, 'wind.json')).length, sha256: sha(readFileSync(join(OUT, 'wind.json'))) };
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({
  recorded: out.recorded.slice(0, 10),
  note: 'Phase AM. wind.json: buscosun Fusion at the sample points of the leg Laboe → 54.62 N 10.30 E → Marstal, the client cube path run in Node as sea-derive.mjs runs it. f-*.png: byte-exact copies of the CWAM field images of run 2026111812 for 19.11.2026 07:00 and 10:00 UTC — the hours of the two recorded u/v images of the BSH run (../ripples/).',
  run: RUN, fusion: out.stage, t1: out.t1, producer: 'scripts/sea/spike/trip-record-fixtures.mjs', files,
}, null, 1) + '\n');
console.log(JSON.stringify({ samples: out.samples.length, stepKm, km: +route.km.toFixed(2), stage: out.stage, t1: out.t1, files }));
