// np0-cost.mjs — D-NP0-10 per-cell cost: (a) fuseCubePoint full chain (stage fs, cube only) per tier;
// (b) the engine's hour step alone (fuseHour, exported, one cube sample) — the lower bound of a precipitation-only composition.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const W = 'file:///C:/dev/buscosun-web/';
const { readArchiveSlot, archiveSeries, losoClimaProduct, inputFromArchive } = await import(W + 'scripts/fusionfit/lib/archiveAdapter.mjs');
const { fuseCubePoint, cubeSampleOf } = await import(W + 'src/pointForecast/cubeSource.ts');
const { fuseHour } = await import(W + 'src/pointForecast/fusion/fuse.ts');
const { predictPrecip } = await import(W + 'src/point/fusionFit/predict.ts');
const { ClimaField } = await import(W + 'src/ml/climaField.ts');
const H = 3_600_000;
const T5 = JSON.parse(readFileSync('C:/dev/buscosun-hindcast/fit/2026-09-27-fx5e/fusion.hindcast.json', 'utf8'));
const T6 = JSON.parse(readFileSync('C:/dev/buscosun-hindcast/fit/2026-09-30-ax4/fusion.ax4.json', 'utf8'));
const feat = JSON.parse(readFileSync('C:/dev/buscosun-hindcast/features/points.v1.json', 'utf8'));
const clima = new ClimaField(JSON.parse(readFileSync(new URL('public/climaGrid.json', W), 'utf8')));
const ids = Object.keys(feat.byPoint).filter((id) => ['DE', 'AT', 'CH'].includes(feat.byPoint[id].country) && !feat.byPoint[id].flags.includes('noTerrain')).sort();
const day = readdirSync('C:/dev/buscosun-archiv').filter((x) => x === '2026-10-01')[0];
const f = readdirSync(join('C:/dev/buscosun-archiv', day)).filter((x) => /\.json\.gz$/.test(x))[0];
const s = readArchiveSlot(join('C:/dev/buscosun-archiv', day, f));
const floorMs = Math.floor(s.slotAtMs / H) * H;
const OPT = { hourly: false, tail: false, learned: true, learnedSpeed: true, learnedPrecip: true, learnedAtPoint: true, learnedClouds: true, priorShrink: false, anchorWindKm: 10, nowcastHourMean: true };
const spans = { t1: [0, 48], t2: [51, 120], t3: [126, 336] };
const N = 200;
for (const tier of ['t1', 't2', 't3']) {
  const full = [], hourOnly = [];
  let steps = 0;
  for (let rep = 0; rep < 2; rep++) for (const id of ids.slice(0, N)) {   // rep 0 warms the JIT, rep 1 is measured
    const row = feat.byPoint[id], ser = archiveSeries(s, tier, id);
    if (!ser) continue;
    const window = { fromMs: floorMs + spans[tier][0] * H, toMs: floorMs + spans[tier][1] * H, stepH: 1 };
    const inp = inputFromArchive(s, row, { cube: { [tier]: ser }, station: null, nowcast: [], covering: [], obs: null, clima, learned: T6, learnedClima: losoClimaProduct(T5, row), nowMs: s.slotAtMs, window });
    let t0 = performance.now();
    const r = fuseCubePoint(inp, OPT);
    if (rep) full.push(performance.now() - t0);
    // the hour step alone: one cube sample per native step through fuseHour with the cube path's context shape
    const ctxBase = { elevationM: row.elevM, lapseRatePerM: -0.0065, terrain: inp.terrain?.scales ?? r.terrain?.scales ?? null, skyView: inp.terrain?.svf ?? 1, sinkDepthM: 0, terrainDeltaC: 0, solarElevDeg: 20, foehnScore: null, terrainDeltaAt: () => 0, priorShrink: false };
    if (!ctxBase.terrain) continue;
    t0 = performance.now();
    let n = 0;
    for (const st of ser.steps) {
      const leadH = Math.round((st.validAtMs - floorMs) / H);
      if (leadH < spans[tier][0] || leadH > spans[tier][1]) continue;
      const smp = cubeSampleOf(tier, st, ser);
      const cs = clima.sample(row.lat, row.lon, 280, row.elevM);
      const fused = fuseHour([smp], leadH, { ...ctxBase, clima: { tempMeanC: cs.tempMean, tempSigmaC: cs.tempStd, wetProbDaily: cs.wetProb } });
      n += 1;
      void fused;
    }
    if (rep) { hourOnly.push(performance.now() - t0); steps = n; }
  }
  const st = (a) => { a.sort((x, y) => x - y); return { n: a.length, median: +a[Math.floor(a.length / 2)].toFixed(2), mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), p90: +a[Math.floor(0.9 * (a.length - 1))].toFixed(2) }; };
  console.log(tier, 'native steps', steps, 'fuseCubePoint ms/cell', JSON.stringify(st(full)), '· fuseHour only ms/cell', JSON.stringify(st(hourOnly)));
}
void predictPrecip;
