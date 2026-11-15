#!/usr/bin/env node
/**
 * Phase GW, step 4 — high-elevation check of buscosun Fusion, READ-ONLY.
 *
 * Takes the stored replay rows of the Prüfstand (protocol P1, truth W1) exactly as they are and scores only the stations
 * of the test network at or above a height: MAE of the median, CRPS of the quantile set and the coverage of q10–q90 per
 * variable and lead bin, with the number of stations and rows. It changes nothing of the Prüfstand: no protocol, truth,
 * register or gate is touched, nothing is replayed and nothing is written below the Prüfstand root — an issue without a
 * stored truth block or a model without a stored forecast is counted as missing and left out.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/highelev-score.mjs \
 *        [--ids=fusion-12x,ref-roh,ref-roh-lapse,ref-mosmix] [--min=2500,1800] [--out=<json>]
 *
 * The score formulas are the ones of `scripts/pruefstand/lib/score.mjs` (CRPS_Q = 2/n · Σ pinball; a point value scores its
 * absolute error). A stand that has no register entry has no rows here: the script then says so instead of scoring another one.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { loadProtocol } from '../pruefstand/lib/protokoll.mjs';
import { archiveIssues, hindcastIssues, leadsOfIssue, caseHash, truthPath } from '../pruefstand/lib/konserven.mjs';
import { providerOf } from '../pruefstand/lib/modelle.mjs';
import { registerPath } from '../pruefstand/lib/register.mjs';
import { readBlock } from '../pruefstand/lib/common.mjs';
import { QUANTITY_VARS, TRUTH_VARS } from '../../src/pruefstand/protokoll.ts';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
/** Lead bins (hours, upper bound exclusive) of the report — a reading aid, not a rule of the protocol. */
export const HIGHELEV_BINS = Object.freeze([[0, 6], [6, 24], [24, 48], [48, 120], [120, 337]]);
const binOf = (h) => HIGHELEV_BINS.findIndex(([a, b]) => h >= a && h < b);

export function scoreHighElevation({ ids, cuts }) {
  const proto = loadProtocol();
  const stations = proto.scored, nSt = stations.length, taus = proto.quantiles;
  const NQV = QUANTITY_VARS.length, NT = TRUTH_VARS.length;
  const i10 = taus.findIndex((x) => Math.abs(x - 0.1) < 1e-9), i50 = taus.findIndex((x) => Math.abs(x - 0.5) < 1e-9), i90 = taus.findIndex((x) => Math.abs(x - 0.9) < 1e-9);
  const inCut = cuts.map((m) => stations.map((s) => Number.isFinite(s.elevM) && s.elevM >= m));
  const known = ids.filter((id) => id.startsWith('ref-') || existsSync(registerPath(id)));
  const unknown = ids.filter((id) => !known.includes(id));
  const providers = known.map((id) => providerOf(proto, id, null, null));
  const mk = () => ({ n: 0, abs: 0, crps: 0, cov: 0, nQ: 0, st: new Set() });
  const acc = new Map(known.map((id) => [id, cuts.map(() => QUANTITY_VARS.map(() => HIGHELEV_BINS.map(mk)))]));
  const meta = { issues: 0, noTruth: 0, noForecast: Object.fromEntries(known.map((id) => [id, 0])), scored: Object.fromEntries(known.map((id) => [id, 0])) };
  const issues = [...archiveIssues(), ...hindcastIssues(proto)];
  for (const issue of issues) {
    meta.issues++;
    const tf = truthPath(proto, issue);
    if (!existsSync(tf)) { meta.noTruth++; continue; }
    const tb = readBlock(tf);
    if (tb.header.caseHash !== caseHash(proto, issue)) { meta.noTruth++; continue; }
    const T = tb.data, L = leadsOfIssue(proto, issue), leads = L.all, nL = leads.length, raster = new Set(L.raster);
    for (const pr of providers) {
      let blk = null;
      try { blk = pr.block(issue); } catch { blk = null; }
      if (!blk) { meta.noForecast[pr.id]++; continue; }
      meta.scored[pr.id]++;
      const nq = blk.nq, ch = NQV * nq + 2, D = blk.data, A = acc.get(pr.id);
      for (let s = 0; s < nSt; s++) {
        if (!inCut.some((c) => c[s])) continue;
        for (let l = 0; l < nL; l++) {
          if (!raster.has(leads[l])) continue;
          const b = binOf(leads[l]);
          if (b < 0) continue;
          const o = (s * nL + l) * ch, to = (s * nL + l) * NT;
          for (let v = 0; v < NQV; v++) {
            const y = T[to + v], q0 = D[o + v * nq];
            if (y !== y || q0 !== q0) continue;
            let crps, med, inside = null;
            if (nq === 1) { med = q0; crps = Math.abs(y - q0); }
            else {
              let sum = 0;
              for (let k = 0; k < nq; k++) { const x = D[o + v * nq + k]; sum += ((y < x ? 1 : 0) - taus[k]) * (x - y); }
              crps = (2 * sum) / nq; med = D[o + v * nq + i50];
              inside = y >= D[o + v * nq + i10] && y <= D[o + v * nq + i90] ? 1 : 0;
            }
            for (let c = 0; c < cuts.length; c++) {
              if (!inCut[c][s]) continue;
              const a = A[c][v][b];
              a.n++; a.abs += Math.abs(med - y); a.crps += crps; a.st.add(stations[s].id);
              if (inside != null) { a.cov += inside; a.nQ++; }
            }
          }
        }
      }
    }
  }
  const r = (x, d = 3) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
  const rows = [];
  for (const id of known) for (let c = 0; c < cuts.length; c++) for (let v = 0; v < NQV; v++) for (let b = 0; b < HIGHELEV_BINS.length; b++) {
    const a = acc.get(id)[c][v][b];
    if (!a.n) continue;
    rows.push({ id, minElevM: cuts[c], variable: QUANTITY_VARS[v], leadH: HIGHELEV_BINS[b], rows: a.n, stations: a.st.size, mae: r(a.abs / a.n), crps: r(a.crps / a.n), cover1090: a.nQ ? r(a.cov / a.nQ) : null });
  }
  return {
    kind: 'glacier/highelev-score', protocol: proto.id, ids: known, unknown, cuts,
    stations: cuts.map((m, c) => ({ minElevM: m, n: inCut[c].filter(Boolean).length, list: stations.filter((_, i) => inCut[c][i]).map((s) => `${s.id}/${s.land}/${Math.round(s.elevM)} m/${s.role}`) })),
    meta, rows,
  };
}

if (process.argv[1] && /(^|[\\/])highelev-score\.mjs$/.test(process.argv[1])) {
  const ids = String(args.ids ?? 'fusion-12x,ref-roh,ref-roh-lapse').split(',').filter(Boolean);
  const cuts = String(args.min ?? '2500,1800').split(',').map(Number).filter(Number.isFinite);
  const res = scoreHighElevation({ ids, cuts });
  if (args.out) writeFileSync(args.out, JSON.stringify(res, null, 1));
  for (const u of res.unknown) console.log(`${u}: kein Registereintrag, also keine gespeicherten Zeilen — nicht gewertet`);
  console.log(JSON.stringify({ meta: res.meta, stations: res.stations.map((s) => ({ minElevM: s.minElevM, n: s.n })) }));
  for (const x of res.rows) console.log(`${x.id}\t≥${x.minElevM} m\t${x.variable}\t${x.leadH[0]}–${x.leadH[1]} h\tn=${x.rows}\tSt=${x.stations}\tMAE ${x.mae}\tCRPS ${x.crps}\tq10–q90 ${x.cover1090 ?? '—'}`);
}
