// M7 (D-8): one route-forecast point recomputed on the producer's io (stage fs) from the CDN, per step:
// cube member value, learned value, final mean/σ, members with weights, calib keys — and the same without the stage.
// node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/autobahnwetter/datenpruefung/m7-point.mjs <lat> <lon> <stepsCsv> [outJson]
import { writeFileSync } from 'node:fs';
import { installNodeShims } from '../../../scripts/punktarchiv/lib/nodeShims.mjs';
installNodeShims();
import { httpStore, POINT_RAW_BASE } from '../../../src/point/client/store.ts';
import { getPointForecastFromCube, clearCubeForecastCache } from '../../../src/pointForecast/cubeSource.ts';
import { makeIo, geoBackend } from '../../../scripts/road/road-forecast.mjs';

const [lat, lon] = [Number(process.argv[2]), Number(process.argv[3])];
const want = (process.argv[4] ?? '').split(',').filter(Boolean).map(Number);
const nowMs = Date.now();
const store = httpStore({ base: POINT_RAW_BASE });
const cache = geoBackend(null);
const base = makeIo({ store, cache, nowMs });
const variants = {
  fs: base,
  noStage: { ...base, stage: undefined, learnedSource: undefined, stackSource: undefined, climaSource: undefined },
};
const out = {};
for (const [name, io] of Object.entries(variants)) {
  clearCubeForecastCache();
  const fc = await getPointForecastFromCube({ lat, lng: lon, country: 'DE', hours: 48, pointSource: 'cube', includeRadarNowcast: true }, io);
  const v2 = fc.cube.v2;
  const t0 = Math.floor(nowMs / 3_600_000) * 3_600_000;
  const rows = [];
  for (const s of v2.axis.steps) {
    const i = (s.validAtMs - t0) / 3_600_000;
    const x = s.vars.t2m;
    rows.push({ i, utc: new Date(s.validAtMs).toISOString().slice(5, 13), tier: s.tier, interp: s.interpolated, mean: x?.mean, sigma: x?.sigma, kind: x?.sigmaKind,
      members: (x?.members ?? []).map((m) => `${m.tag}:${m.value == null ? '-' : m.value.toFixed(1)}@${m.weight ?? '-'}`).join(' '), calib: (x?.calib ?? []).join(','),
      stepMembers: (s.members ?? []).map((m) => `${m.tag}${m.models ? '[' + m.models.join('+') + ']' : ''}${m.run ? ' ' + m.run : ''}`).join(' | ') });
  }
  out[name] = { notes: fc.cube.notes, calibByVar: v2.provenance?.calibByVar?.t2m, rows };
  console.log(`## ${name} — hTrue ${v2.point?.hTrue}`);
  for (const r of rows) if (!want.length || want.includes(r.i)) console.log(r.i, r.utc, r.tier, r.interp ? 'int' : 'nat', r.mean?.toFixed(1), 'σ', r.sigma?.toFixed(2), r.kind, '|', r.members, '|', r.calib);
}
console.log('calibByVar t2m', JSON.stringify(out.fs.calibByVar));
console.log('notes', out.fs.notes.slice(0, 6).join('\n'));
if (process.argv[5]) writeFileSync(process.argv[5], JSON.stringify(out, null, 1));
// cells of the 2×2 block per tier (raw cube values, before buscosun Fusion)
{
  clearCubeForecastCache();
  const fc = await getPointForecastFromCube({ lat, lng: lon, country: 'DE', hours: 48, pointSource: 'cube', includeRadarNowcast: true }, base);
  const cells = fc.cube.cells;
  if (process.argv[5]) writeFileSync(process.argv[5].replace(/\.json$/, '-cells.json'), JSON.stringify(cells, null, 1).slice(0, 5e7));
  console.log('cells keys', Object.keys(cells ?? {}), JSON.stringify(cells).slice(0, 1200));
}
