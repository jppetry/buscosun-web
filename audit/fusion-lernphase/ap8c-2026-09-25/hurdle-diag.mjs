// Hurdle diagnosis (V-FL-18, FL-AP8c): why does the learned hurdle lose in the run route 0–48 h even with the cube column?
// One run-route month (t1, stride 24): Brier of the pooled β, of the fold β of that month, of the cube; then IRLS continued on
// this month's rows (in-sample) to see whether three steps had converged.
import { readFileSync } from 'node:fs';
import { readCases } from 'file:///C:/dev/buscosun-web/scripts/fusionfit/lib/casesio.mjs';
import { rowContext, prepareBatch, siteOf, ROW_COLUMNS } from 'file:///C:/dev/buscosun-web/scripts/fusionfit/lib/rowFeatures.mjs';
import { occurrenceDesign, O_NAMES } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/design.ts';
import { LogisticAcc, predictWet } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/fitPrecip.ts';
import { stratumKey } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/strata.ts';

const root = 'C:/dev/buscosun-hindcast';
const month = process.argv[2] ?? '2026-08';
const T = JSON.parse(readFileSync(`${root}/fit/2026-09-25-ap8c/fusion.hindcast.json`, 'utf8'));
const feat = JSON.parse(readFileSync(`${root}/features/points.v1.json`, 'utf8'));
let sites = null;
const rows = [];   // [key, x, y, pCube]
await readCases(`${root}/cases/v1/${month}/t1.cas.gz`, { columns: ROW_COLUMNS, batchRows: 32768, onBatch: (cols, n, header) => {
  if (!sites) sites = header.points.map((id) => (feat.byPoint[id] ? siteOf(feat.byPoint[id]) : null));
  const b = prepareBatch(cols);
  for (let i = 0; i < n; i++) {
    if ((cols.validAtH[i] + cols.pointIdx[i]) % 24 !== 0) continue;
    const ctx = rowContext(b, i, sites, false);
    if (!ctx || ctx.y.wet == null || ctx.pDryCube == null || ctx.k.precip == null || ctx.bin > 2) continue;
    rows.push([stratumKey('K', 'precip', ctx.bin, ctx.clsK), occurrenceDesign(ctx.z, Math.expm1(ctx.k.precip), ctx.wetShareK, ctx.sigDiv.precip, ctx.pDryCube), ctx.y.wet, 1 - ctx.pDryCube]);
  }
} });
const byKey = new Map();
for (const r of rows) { let a = byKey.get(r[0]); if (!a) { a = []; byKey.set(r[0], a); } a.push(r); }
const brier = (rs, f) => rs.reduce((s, r) => s + (f(r) - r[2]) ** 2, 0) / rs.length;
for (const [key, rs] of byKey) {
  const e = T.occurrence[key]; if (!e) continue;
  const bPool = e.beta, bFold = e.folds?.[month];
  console.log(`${key} n ${rs.length} wet ${(rs.reduce((s, r) => s + r[2], 0) / rs.length).toFixed(3)} · Brier cube ${brier(rs, (r) => r[3]).toFixed(4)} · pooled β ${brier(rs, (r) => predictWet(r[1], bPool)).toFixed(4)} · fold β(${month}) ${bFold ? brier(rs, (r) => predictWet(r[1], bFold)).toFixed(4) : '—'} · status ${e.status} cv ${e.cv ? `${e.cv.brier} vs ${e.cv.brierCube}` : '—'}`);
  // continue IRLS in-sample from the pooled β on THESE rows: does the Brier keep falling (unconverged) or not?
  let beta = new Float64Array(bPool);
  for (let it = 1; it <= 6; it++) {
    const acc = new LogisticAcc(O_NAMES.length);
    for (const r of rs) acc.add(r[1], r[2], beta, 0);
    const nb = acc.solve(); if (!nb) break; beta = nb;
    console.log(`   IRLS +${it} in-sample Brier ${brier(rs, (r) => predictWet(r[1], beta)).toFixed(4)} · β_logitWetCube ${beta[10].toFixed(3)} β₀ ${beta[0].toFixed(3)} β_lnP ${beta[1].toFixed(3)}`);
  }
  // and a β with ONLY the cube column (β₀ = 0, β₁₀ = 1): the identity — must equal the cube's Brier
  const ident = new Float64Array(O_NAMES.length); ident[10] = 1;
  console.log(`   Identität (nur logitWetCube = 1): Brier ${brier(rs, (r) => predictWet(r[1], ident)).toFixed(4)}`);
}
