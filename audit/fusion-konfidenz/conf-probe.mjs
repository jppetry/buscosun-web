// conf-probe.mjs — the three factors of the confidence score of buscosun Fusion 6 at real points against the CDN (read-only).
//   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/fusion-konfidenz/conf-probe.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HINDCAST_ROOT } from 'file:///C:/dev/buscosun-web/scripts/hindcast/lib/common.mjs';
import { terrainOf } from 'file:///C:/dev/buscosun-web/scripts/fusionfit/lib/archiveAdapter.mjs';
import { getPointForecastFromCube, clearCubeForecastCache } from 'file:///C:/dev/buscosun-web/src/pointForecast/cubeSource.ts';
import { httpStore } from 'file:///C:/dev/buscosun-web/src/point/client/store.ts';
import { ClimaField } from 'file:///C:/dev/buscosun-web/src/ml/climaField.ts';

const feat = JSON.parse(readFileSync(join(HINDCAST_ROOT, 'features', 'points.v1.json'), 'utf8'));
const clima = new ClimaField(JSON.parse(readFileSync('C:/dev/buscosun-web/public/climaGrid.json', 'utf8')));
const pick = (pred) => Object.values(feat.byPoint).find(pred);
const POINTS = [
  pick((r) => r.country === 'DE' && /M.{1,2}NCHEN/i.test(r.name ?? '')),
  pick((r) => r.country === 'DE' && /HAMBURG/i.test(r.name ?? '')) ?? pick((r) => r.country === 'DE' && r.elevM < 100),
  pick((r) => r.country === 'AT' && /INNSBRUCK/i.test(r.name ?? '')) ?? pick((r) => r.country === 'AT' && r.elevM > 500 && r.elevM < 1000),
  pick((r) => r.country === 'CH' && r.elevM > 1200),
].filter(Boolean);
const HOURS = [1, 3, 6, 12, 24, 48, 72, 120, 168, 240, 336];
const VARS = ['t2m', 'td2m', 'wind', 'gust', 'clct'];
const pc = (x) => (x == null ? '  —' : String(Math.round(x * 100)).padStart(3));
const f1 = (x) => (x == null ? '—' : x.toFixed(2));
const summary = { n: 0, byVar: {} };
for (const row of POINTS) {
  clearCubeForecastCache();
  const opts = { lat: row.lat, lng: row.lon, country: row.country, hours: 336, pointSource: 'cube', includeRadarNowcast: false };
  const io = { store: httpStore({ timeoutMs: 20_000 }), terrain: false, clima: async () => clima, obs: null, learnedSource: 'json', climaSource: 'json', stackSource: 'json', stage: 'fs', cells: true, terrainOverride: terrainOf(row), elevationM: row.elevM };
  const f = await getPointForecastFromCube(opts, io);
  const v2 = f.cube.v2;
  console.log(`\n## ${row.name?.trim()} (${row.country}, ${row.elevM} m) — stage notes: ${f.cube.notes.filter((n) => /^stage|^learned: /.test(n)).map((n) => n.slice(0, 80)).join(' | ')}`);
  console.log('h    var    score spread agree lage | sigma sigmaKind      flags/members');
  const t0 = v2.axis.steps[0]?.validAtMs ?? 0;
  for (const h of HOURS) {
    const step = v2.axis.steps.find((s) => s.leadH === h);
    if (!step) continue;
    for (const id of VARS) {
      const v = step.vars[id];
      if (!v) continue;
      const c = v.confidence;
      const flags = (step.flags ?? []).filter((x) => !/^learned/.test(x)).join(',');
      console.log(`${String(h).padStart(3)}  ${id.padEnd(5)}  ${pc(c?.score)}   ${pc(c?.spread)}   ${pc(c?.agree)}  ${pc(c?.lage)} | ${f1(v.sigma).padStart(5)} ${String(v.sigmaKind).padEnd(12)} ${step.tier} ${flags} m=${v.members.filter((m) => m.weight != null).map((m) => `${m.tag}:${(m.weight ?? 0).toFixed(2)}`).join(' ')}`);
      if (c) {
        const s = (summary.byVar[id] ??= { n: 0, score: 0, spread: 0, agree: 0, lage: 0, lt50: 0, lt70: 0 });
        s.n++; s.score += c.score; s.spread += c.spread ?? 0; s.agree += c.agree ?? 0; s.lage += c.lage ?? 0; if (c.score < 0.5) s.lt50++; if (c.score < 0.7) s.lt70++;
      }
    }
  }
  // whole-window statistics for T (the dashboard reads t2m)
  const all = v2.axis.steps.map((s) => s.vars.t2m?.confidence).filter(Boolean);
  const mean = (k) => all.reduce((a, c) => a + (c[k] ?? 0), 0) / all.length;
  console.log(`T over ${all.length} steps: score ${pc(mean('score'))} · spread ${pc(mean('spread'))} · agree ${pc(mean('agree'))} · lage ${pc(mean('lage'))}; steps < 0,5: ${all.filter((c) => c.score < 0.5).length}, < 0,7: ${all.filter((c) => c.score < 0.7).length}`);
  // srcCount at native steps from the raw cells
  const cells = f.cube.cells ?? [];
  const sc = cells.map((r) => r.cell?.srcCount).filter((x) => x != null);
  if (sc.length) console.log(`srcCount at ${sc.length} native steps: min ${Math.min(...sc)} · max ${Math.max(...sc)} · values ${[...new Set(sc)].sort((a, b) => a - b).join('/')}`);
}
console.log('\n## Mean over the sampled hours × points');
for (const [id, s] of Object.entries(summary.byVar)) console.log(`${id.padEnd(5)} n=${s.n} score ${pc(s.score / s.n)} spread ${pc(s.spread / s.n)} agree ${pc(s.agree / s.n)} lage ${pc(s.lage / s.n)} | < 0,5: ${s.lt50} · < 0,7: ${s.lt70}`);
