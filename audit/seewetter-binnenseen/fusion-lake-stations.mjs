#!/usr/bin/env node
/**
 * Phase BS, step 0 — buscosun Fusion against stations AT the lakes: wind and gust, leads 1–48 h, from the stored forecasts
 * of the Prüfstand (no new replay). Read-only on C:\dev\buscosun-pruefstand.
 *
 * Rule, written before the first run (2026-11-21):
 *   model     conserve `fusion-12x` = buscosun Fusion 13 (wind and gust of Fusion 14 are byte-equal to 13)
 *   cases     every archive issue of that conserve (development set), raster leads 1–48 h
 *   stations  Prüfnetz P1, scored, DE/AT/CH. A "lake station" stands at most LAKE_KM (10) km from the shore point of a lake
 *             spot of `scripts/sea/lakes-src.json` and at most D_ELEV_M (150) m above or below that lake's surface. Of all
 *             such stations the TEN nearest to their spot are taken (one lake per station: the lake of its nearest spot).
 *   truth     the Prüfstand's own truth blocks (W1): wind = 10-min mean at the hour, gust = maximum of the interval
 *   numbers   per station and per lake: cases, bias and mean absolute error of the median (q50) in kn, share of cases
 *             inside q10–q90, mean width of q10–q90 in kn — bins 1–6 h, 7–24 h, 25–48 h and all
 *
 * What the numbers are NOT: a measurement on the water. The stations stand on land at the shore; the lake spots are
 * computed at a water point 250 m in front of it.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/seewetter-binnenseen/fusion-lake-stations.mjs
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PS_ROOT, REPO, distKm, p, readBlock } from '../../scripts/pruefstand/lib/common.mjs';
import { loadProtocol } from '../../scripts/pruefstand/lib/protokoll.mjs';
import { QUANTITY_VARS, TRUTH_VARS, leadsOf } from '../../src/pruefstand/protokoll.ts';

const MODEL = 'fusion-12x', LAKE_KM = 10, D_ELEV_M = 150, TAKE = 10, MAX_LEAD = 48, KN = 1.943844;
const BINS = [[1, 6], [7, 24], [25, 48]];
const VARS = ['ws', 'gust'];

const proto = loadProtocol();
const src = JSON.parse(readFileSync(p(REPO, 'scripts/sea/lakes-src.json'), 'utf8'));
// The shore points of the catalogue draft (the measurement file carries them); the hand positions as fallback.
const probe = existsSync(p(REPO, 'audit/seewetter-binnenseen/spike/lake-probe.json')) ? JSON.parse(readFileSync(p(REPO, 'audit/seewetter-binnenseen/spike/lake-probe.json'), 'utf8')) : null;
const spots = src.spots.map((s) => ({ id: s.id, lake: s.lake, lat: probe?.spots?.[s.id]?.lat ?? s.lat, lon: probe?.spots?.[s.id]?.lon ?? s.lon }));
const lakeOf = Object.fromEntries(src.lakes.map((l) => [l.id, l]));
const st = proto.scored;
const cand = [];
st.forEach((s, i) => {
  const near = spots.map((sp) => ({ sp, km: distKm(s, sp) })).sort((a, b) => a.km - b.km)[0];
  const lake = lakeOf[near.sp.lake];
  if (near.km <= LAKE_KM && Math.abs(s.elevM - lake.elevM) <= D_ELEV_M) cand.push({ i, id: s.id, name: s.name, land: s.land, role: s.role, lake: lake.id, lakeName: lake.name, spot: near.sp.id, km: +near.km.toFixed(1), dElevM: Math.round(s.elevM - lake.elevM), anchorKm: s.anchor?.km ?? null });
});
cand.sort((a, b) => a.km - b.km);
const chosen = cand.slice(0, TAKE);
const idx = new Map(chosen.map((c) => [c.i, c]));

const kroot = p(PS_ROOT, 'konserven', proto.id);
let dir = null;
for (const d of readdirSync(kroot)) {
  const a = p(kroot, d, 'archiv');
  if (!existsSync(a)) continue;
  const f = readdirSync(a).filter((x) => x.endsWith('.f32'))[0];
  if (f && readBlock(p(a, f)).header.model === MODEL) { dir = a; break; }
}
if (!dir) throw new Error(`keine Konserve von ${MODEL} unter ${kroot}`);

const taus = proto.quantiles;
const iq = (t) => taus.findIndex((x) => Math.abs(x - t) < 1e-9);
const I10 = iq(0.1), I50 = iq(0.5), I90 = iq(0.9);
const NQV = QUANTITY_VARS.length, NT = TRUTH_VARS.length;
const acc = {};
const cell = (key) => (acc[key] ??= { n: 0, bias: 0, mae: 0, in80: 0, width: 0, y: 0 });
let issues = 0, first = null, last = null;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.f32')).sort()) {
  const truthFile = p(PS_ROOT, 'faelle', proto.id, 'archiv', f);
  if (!existsSync(truthFile)) continue;
  const K = readBlock(p(dir, f)), T = readBlock(truthFile);
  if (K.header.caseHash !== T.header.caseHash) continue;
  const leads = K.header.leads, nL = leads.length, nq = K.header.nq, ch = NQV * nq + 2;
  const raster = new Set(leadsOf(proto, new Date(K.header.issueMs).getUTCHours()).raster);
  issues++; first ??= K.header.day; last = K.header.day;
  for (const [s, c] of idx) {
    for (let l = 0; l < nL; l++) {
      const h = leads[l];
      if (h > MAX_LEAD || !raster.has(h)) continue;
      const b = BINS.findIndex(([a, z]) => h >= a && h <= z);
      if (b < 0) continue;
      for (const name of VARS) {
        const v = QUANTITY_VARS.indexOf(name);
        const y = T.data[(s * nL + l) * NT + TRUTH_VARS.indexOf(name)];
        const o = (s * nL + l) * ch + v * nq;
        const q10 = K.data[o + I10], q50 = K.data[o + I50], q90 = K.data[o + I90];
        if (y !== y || q10 !== q10 || q50 !== q50 || q90 !== q90) continue;
        for (const key of [`st|${c.id}|${name}|${b}`, `st|${c.id}|${name}|all`, `lake|${c.lake}|${name}|${b}`, `lake|${c.lake}|${name}|all`, `all||${name}|${b}`, `all||${name}|all`]) {
          const x = cell(key);
          x.n++; x.bias += (q50 - y) * KN; x.mae += Math.abs(q50 - y) * KN; x.in80 += y >= q10 && y <= q90 ? 1 : 0; x.width += (q90 - q10) * KN; x.y += y * KN;
        }
      }
    }
  }
}
const r1 = (x) => Math.round(x * 10) / 10;
const rowOf = (key) => { const x = acc[key]; return x ? { n: x.n, meanObsKn: r1(x.y / x.n), biasKn: r1(x.bias / x.n), maeKn: r1(x.mae / x.n), cov80: r1((x.in80 / x.n) * 100), widthKn: r1(x.width / x.n) } : null; };
const binName = (b) => (b === 'all' ? '1–48 h' : `${BINS[b][0]}–${BINS[b][1]} h`);
const rows = [];
for (const kind of ['lake', 'st', 'all']) {
  const ids = kind === 'all' ? [''] : kind === 'lake' ? [...new Set(chosen.map((c) => c.lake))] : chosen.map((c) => c.id);
  for (const id of ids) for (const name of VARS) for (const b of [0, 1, 2, 'all']) { const r = rowOf(`${kind}|${id}|${name}|${b}`); if (r) rows.push({ kind, id, var: name, lead: binName(b), ...r }); }
}
const out = {
  rule: { model: MODEL, lakeKm: LAKE_KM, dElevM: D_ELEV_M, take: TAKE, maxLeadH: MAX_LEAD, bins: BINS, truth: 'W1 (Prüfstand)', protocol: proto.id },
  issues, first, last, candidates: cand.length, stations: chosen.map(({ i, ...c }) => c), notTaken: cand.slice(TAKE).map(({ i, ...c }) => c), rows,
};
writeFileSync(p(REPO, 'audit/seewetter-binnenseen/fusion-lake-stations.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(`${MODEL}: ${issues} Ausgaben ${first} … ${last}; Seestationen (≤ ${LAKE_KM} km, |Δh| ≤ ${D_ELEV_M} m): ${cand.length}, genommen ${chosen.length}`);
for (const c of chosen) console.log(`  ${c.name} (${c.land}, Rolle ${c.role}) · ${c.lakeName} · ${c.km} km von ${c.spot} · Δh ${c.dElevM} m`);
for (const r of rows.filter((x) => x.kind !== 'st')) console.log(`${(r.kind === 'all' ? 'alle zehn' : lakeOf[r.id].name).padEnd(20)} ${r.var.padEnd(5)} ${r.lead.padEnd(8)} n=${String(r.n).padStart(5)}  Messung ${String(r.meanObsKn).padStart(5)} kn  Bias ${String(r.biasKn).padStart(5)} kn  MAE ${String(r.maeKn).padStart(4)} kn  q10–q90 ${String(r.cov80).padStart(5)} %  Breite ${r.widthKn} kn`);
