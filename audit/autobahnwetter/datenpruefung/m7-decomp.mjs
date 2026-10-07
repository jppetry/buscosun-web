// M7 (D-8): split the dip of the cube member at a route-forecast point into the PAP-4 correction with the cell's hModEff
// as published (it jumps when 3-h/6-h sources join the mean) and the same correction with hModEff held at the point's
// hourly value (median over the axis). Recomputes the point with the producer's io (stage fs) from raw.githubusercontent.
// node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/autobahnwetter/datenpruefung/m7-decomp.mjs <outJson> <id:lat:lon> …
import { writeFileSync } from 'node:fs';
import { installNodeShims } from '../../../scripts/punktarchiv/lib/nodeShims.mjs';
installNodeShims();
import { httpStore, POINT_RAW_BASE } from '../../../src/point/client/store.ts';
import { getPointForecastFromCube, clearCubeForecastCache } from '../../../src/pointForecast/cubeSource.ts';
import { verticalCorrection } from '../../../src/pointForecast/fusion/vertical.ts';
import { makeIo, geoBackend } from '../../../scripts/road/road-forecast.mjs';

const nowMs = Date.now();
const io = makeIo({ store: httpStore({ base: POINT_RAW_BASE }), cache: geoBackend(null), nowMs });
const curv = (a, i) => a[i] - (a[i - 1] + a[i + 1]) / 2;
const res = [];
for (const arg of process.argv.slice(3)) {
  const [id, lat, lon] = arg.split(':');
  clearCubeForecastCache();
  const fc = await getPointForecastFromCube({ lat: +lat, lng: +lon, country: 'DE', hours: 48, pointSource: 'cube', includeRadarNowcast: true }, io);
  const v2 = fc.cube.v2, hTrue = v2.point.hTrue;
  const cells = new Map(fc.cube.cells.filter((c) => c.tier === 't1').map((c) => [c.validAtMs, c.v]));
  const steps = v2.axis.steps.filter((s) => s.tier === 't1' && !s.interpolated && cells.has(s.validAtMs) && s.vars.t2m);
  const hm = steps.map((s) => cells.get(s.validAtMs).hModEff).filter(Number.isFinite).sort((a, b) => a - b);
  const hFix = hm[Math.floor(hm.length / 2)];
  const rows = steps.map((s) => {
    const v = cells.get(s.validAtMs);
    const prof = { gammaEff: v.gammaEff, zBase: v.zBase, zInv: v.zInv, dTInv: v.dTInv };
    const member = s.vars.t2m.members.find((m) => m.tag.startsWith('cube-'))?.value ?? null;
    const dAct = verticalCorrection({ tMean: 0, hModEff: v.hModEff, hTrue, profile: prof }).deltaK;
    const dFix = verticalCorrection({ tMean: 0, hModEff: hFix, hTrue, profile: prof }).deltaK;
    return { utc: new Date(s.validAtMs).toISOString().slice(5, 13), hMod: v.hModEff, zBase: v.zBase, zInv: v.zInv, dTInv: v.dTInv, gEff: v.gammaEff,
      mean: s.vars.t2m.mean, member, dAct, dFix, raw: member == null ? null : member - dAct, fixed: member == null ? null : member - dAct + dFix };
  });
  const out = { id, lat: +lat, lon: +lon, hTrue, hFix, dips: [] };
  for (let i = 1; i < rows.length - 1; i++) {
    const c = (k) => curv(rows.map((r) => r[k]), i);
    if (c('mean') < -1.5) out.dips.push({ utc: rows[i].utc, hMod: rows[i].hMod, curvMean: +c('mean').toFixed(2), curvMember: +c('member').toFixed(2), curvRaw: +c('raw').toFixed(2), curvFixedH: +c('fixed').toFixed(2), dAct: +rows[i].dAct.toFixed(2), dFix: +rows[i].dFix.toFixed(2), zInv: rows[i].zInv, dTInv: rows[i].dTInv });
  }
  out.rows = rows;
  res.push(out);
  console.log(`${id} h ${hTrue?.toFixed(0)} hFix ${hFix}`);
  for (const d of out.dips) console.log(`  ${d.utc} hMod ${d.hMod} curv out ${d.curvMean} member ${d.curvMember} raw T̄ ${d.curvRaw} hMod fest ${d.curvFixedH} | Δ ${d.dAct} / fest ${d.dFix} | inv ${d.zInv} +${d.dTInv}`);
}
writeFileSync(process.argv[2], JSON.stringify(res, null, 1));
