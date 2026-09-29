/**
 * fs-bytes-check.mjs — phase FS step 5: without the four options the engine is byte-identical to HEAD, on REAL archive inputs.
 * The caller puts the HEAD copies next to the working files (`cubeSource.head.tmp.ts`, `fusion/fuse.head.tmp.ts`), both engines
 * run in the same process on the same inputs; compared is JSON of steps, calib and notes. Positive control: each option changes
 * the result. Variants: the default path, the product chain (learned + learnedSpeed + learnedPrecip), hourly + tail.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { HINDCAST_ROOT } from '../../scripts/hindcast/lib/common.mjs';
import { readArchiveSlot, archiveSeries, archiveStation, archiveNowcast, archiveTruth, archiveObs, losoClimaProduct, inputFromArchive } from '../../scripts/fusionfit/lib/archiveAdapter.mjs';
import { fuseCubePoint } from '../../src/pointForecast/cubeSource.ts';
import { fuseCubePoint as fuseHead } from '../../src/pointForecast/cubeSource.head.tmp.ts';
import { ClimaField } from '../../src/ml/climaField.ts';

const H = 3_600_000, ARCH = 'C:/dev/buscosun-archiv';
const T5 = JSON.parse(readFileSync(join(HINDCAST_ROOT, 'fit', '2026-09-27-fx5e', 'fusion.hindcast.json'), 'utf8'));
const stack = JSON.parse(readFileSync(join(HINDCAST_ROOT, 'fit', '2026-09-28-fs', 'stack.archive.json'), 'utf8'));
const feat = JSON.parse(readFileSync(join(HINDCAST_ROOT, 'features', 'points.v1.json'), 'utf8'));
const clima = new ClimaField(JSON.parse(readFileSync(new URL('../../public/climaGrid.json', import.meta.url), 'utf8')));
const ids = Object.keys(feat.byPoint).filter((id) => ['DE', 'AT', 'CH', 'LI'].includes(feat.byPoint[id].country) && !feat.byPoint[id].flags.includes('noTerrain')).sort();
const sig = (r) => JSON.stringify([r.steps, r.calib, r.notes.filter((n) => !/ ms\b/.test(n))]);
const PRODUCT = { learned: true, learnedSpeed: true, learnedPrecip: true };
const VAR = { 'Voreinstellung': { hourly: false, tail: false }, 'Voreinstellung stündlich + Schwanz': { hourly: true, tail: true }, 'Kette (learned, learnedSpeed, learnedPrecip)': { hourly: false, tail: false, ...PRODUCT }, 'Kette stündlich + Schwanz': { hourly: true, tail: true, ...PRODUCT } };
const OPT = { learnedAtPoint: { learnedAtPoint: true }, 'priorShrink:false': { priorShrink: false }, learnedClouds: { learnedClouds: true }, stationValue: { stationValue: true } };
const res = { runs: 0, same: 0, diff: [], positive: Object.fromEntries(Object.keys(OPT).map((k) => [k, { runs: 0, changed: 0 }])) };
for (const day of ['2026-09-15', '2026-09-22', '2026-09-26']) {
  const s = readArchiveSlot(join(ARCH, day, readdirSync(join(ARCH, day)).find((x) => /^\d{4}\.json\.gz$/.test(x))));
  const floorMs = Math.floor(s.slotAtMs / H) * H;
  const truth = archiveTruth(s, (id) => feat.byPoint[id]?.country);
  for (let i = 0; i < ids.length; i += 13) {
    const id = ids[i], row = feat.byPoint[id];
    const cube = {};
    for (const t of ['t1', 't2', 't3']) { const x = archiveSeries(s, t, id); if (x) cube[t] = x; }
    if (!Object.keys(cube).length) continue;
    const stn = archiveStation(s, id, row.elevM), nc = archiveNowcast(s, id);
    const base = { cube, station: stn.series, stationReason: stn.reason, nowcast: nc.nowcast, covering: nc.covering, obs: archiveObs(s, truth.get(id), row), clima, nowMs: s.slotAtMs, window: { fromMs: floorMs, toMs: floorMs + 336 * H, stepH: 1 }, learned: T5, learnedClima: losoClimaProduct(T5, row), stack };
    for (const [name, o] of Object.entries(VAR)) {
      const a = sig(fuseCubePoint(inputFromArchive(s, row, base), o)), b = sig(fuseHead(inputFromArchive(s, row, base), o));
      res.runs += 1;
      if (a === b) res.same += 1; else if (res.diff.length < 5) res.diff.push(`${day} ${id} ${name}`);
      if (name.startsWith('Kette (')) for (const [k, x] of Object.entries(OPT)) { const c = sig(fuseCubePoint(inputFromArchive(s, row, base), { ...o, ...x })); res.positive[k].runs += 1; if (c !== a) res.positive[k].changed += 1; }
    }
  }
}
console.log(JSON.stringify(res, null, 1));
const ok = res.runs > 0 && res.same === res.runs && Object.values(res.positive).every((p) => p.changed > 0.9 * p.runs);
console.log(ok ? `OK — ${res.same}/${res.runs} Läufe byte-gleich zu HEAD; jede Option ändert das Ergebnis (Positivkontrolle)` : 'FEHLER');
process.exit(ok ? 0 : 1);
