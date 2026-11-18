#!/usr/bin/env node
/**
 * Phase SU, step 0 — coverage of the q10–q90 (and q25–q75) band of wind and gust at COASTAL stations, by lead bin,
 * from the stored forecasts of the Prüfstand (no new replay). Read-only on C:\dev\buscosun-pruefstand.
 *
 * Rule, written before the first run (2026-11-18):
 *   model     conserve `fusion-12x` = buscosun Fusion 13 (wind and gust of Fusion 14 are byte-equal to 13)
 *   cases     every archive issue of that conserve (development set), raster leads 1–78 h (the horizon of /seewetter)
 *   stations  Prüfnetz P1, scored, land DE, at most COAST_KM (10) km from one of the 56 spot positions of
 *             `scripts/sea/spots-src.json`; a second set at 25 km is printed for comparison, and all DE stations as context
 *   truth     the Prüfstand's own truth blocks (W1): wind = 10-min mean at the hour, gust = maximum of the interval
 *   bins      1–6 h · 7–24 h · 25–48 h · 49–78 h
 *   numbers   share of cases with q10 ≤ y ≤ q90 and q25 ≤ y ≤ q75, share below q10 / above q90, mean band width;
 *             band of chance around 80 % with n_eff = station × issue pairs (hours of one pair are not independent)
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/seewetter-bandbreite/coverage-coast.mjs
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PS_ROOT, REPO, distKm, p, readBlock } from '../../scripts/pruefstand/lib/common.mjs';
import { loadProtocol } from '../../scripts/pruefstand/lib/protokoll.mjs';
import { QUANTITY_VARS, TRUTH_VARS, leadsOf } from '../../src/pruefstand/protokoll.ts';

const MODEL = 'fusion-12x', COAST_KM = 10, WIDE_KM = 25, MAX_LEAD = 78, KN = 1.943844;
const BINS = [[1, 6], [7, 24], [25, 48], [49, 78]];
const VARS = ['ws', 'gust'];

const proto = loadProtocol();
const spots = JSON.parse(readFileSync(p(REPO, 'scripts/sea/spots-src.json'), 'utf8')).spots;
const st = proto.scored;
const nearKm = st.map((s) => Math.min(...spots.map((sp) => distKm(s, sp))));
const sets = {
  coast10: st.map((s, i) => s.land === 'DE' && nearKm[i] <= COAST_KM),
  coast25: st.map((s, i) => s.land === 'DE' && nearKm[i] <= WIDE_KM),
  deAll: st.map((s) => s.land === 'DE'),
};

// the conserve directory of the model (header names it)
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
const I10 = iq(0.1), I25 = iq(0.25), I75 = iq(0.75), I90 = iq(0.9);
const NQV = QUANTITY_VARS.length, NT = TRUTH_VARS.length;
const acc = {};
const cell = (set, v, b) => (acc[`${set}|${v}|${b}`] ??= { n: 0, in80: 0, in50: 0, below: 0, above: 0, width: 0, pairs: new Set() });
let issues = 0, first = null, last = null;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.f32')).sort()) {
  const truthFile = p(PS_ROOT, 'faelle', proto.id, 'archiv', f);
  if (!existsSync(truthFile)) continue;
  const K = readBlock(p(dir, f)), T = readBlock(truthFile);
  if (K.header.caseHash !== T.header.caseHash) continue;
  const leads = K.header.leads, nL = leads.length, nq = K.header.nq, ch = NQV * nq + 2;
  const raster = new Set(leadsOf(proto, new Date(K.header.issueMs).getUTCHours()).raster);
  issues++; first ??= K.header.day; last = K.header.day;
  for (let s = 0; s < st.length; s++) {
    for (let l = 0; l < nL; l++) {
      const h = leads[l];
      if (h > MAX_LEAD || !raster.has(h)) continue;
      const b = BINS.findIndex(([a, z]) => h >= a && h <= z);
      if (b < 0) continue;
      for (const name of VARS) {
        const v = QUANTITY_VARS.indexOf(name);
        const y = T.data[(s * nL + l) * NT + TRUTH_VARS.indexOf(name)];
        const o = (s * nL + l) * ch + v * nq;
        const q10 = K.data[o + I10], q25 = K.data[o + I25], q75 = K.data[o + I75], q90 = K.data[o + I90];
        if (y !== y || q10 !== q10 || q90 !== q90) continue;
        for (const set of Object.keys(sets)) {
          if (!sets[set][s]) continue;
          const c = cell(set, name, b);
          c.n++; c.in80 += y >= q10 && y <= q90 ? 1 : 0; c.in50 += y >= q25 && y <= q75 ? 1 : 0;
          c.below += y < q10 ? 1 : 0; c.above += y > q90 ? 1 : 0; c.width += (q90 - q10) * KN; c.pairs.add(`${s}|${f}`);
        }
      }
    }
  }
}

const pct = (x) => Math.round(x * 1000) / 10;
const rows = [];
for (const set of Object.keys(sets)) for (const v of VARS) BINS.forEach(([a, z], b) => {
  const c = acc[`${set}|${v}|${b}`];
  if (!c) return;
  const nEff = c.pairs.size, half = 1.96 * Math.sqrt((0.8 * 0.2) / nEff);
  rows.push({ set, var: v, lead: `${a}–${z} h`, n: c.n, pairs: nEff, cov80: pct(c.in80 / c.n), cov50: pct(c.in50 / c.n), below: pct(c.below / c.n), above: pct(c.above / c.n), widthKn: Math.round((c.width / c.n) * 10) / 10, band80: [pct(0.8 - half), pct(0.8 + half)] });
});
const out = {
  rule: { model: MODEL, coastKm: COAST_KM, wideKm: WIDE_KM, maxLeadH: MAX_LEAD, bins: BINS, truth: 'W1 (Prüfstand)', protocol: proto.id },
  issues, first, last,
  stations: Object.fromEntries(Object.entries(sets).map(([k, m]) => [k, st.filter((_, i) => m[i]).map((s, i2) => ({ id: s.id, name: s.name, role: s.role }))])),
  rows,
};
writeFileSync(p(REPO, 'audit/seewetter-bandbreite/coverage-coast.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(`${MODEL}: ${issues} Ausgaben ${first} … ${last}; Stationen Küste ≤ ${COAST_KM} km: ${out.stations.coast10.length}, ≤ ${WIDE_KM} km: ${out.stations.coast25.length}, DE: ${out.stations.deAll.length}`);
console.log(out.stations.coast10.map((s) => `${s.name} (${s.role})`).join(' · '));
for (const r of rows) console.log(`${r.set.padEnd(8)} ${r.var.padEnd(5)} ${r.lead.padEnd(8)} n=${String(r.n).padStart(6)} Paare=${String(r.pairs).padStart(5)}  q10–q90 ${String(r.cov80).padStart(5)} %  q25–q75 ${String(r.cov50).padStart(5)} %  unter ${String(r.below).padStart(4)} %  über ${String(r.above).padStart(4)} %  Breite ${r.widthKn} kn  Zufallsband ${r.band80[0]}–${r.band80[1]}`);
