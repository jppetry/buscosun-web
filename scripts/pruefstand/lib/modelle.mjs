/**
 * modelle.mjs — the forecast providers the scorer reads (plan PS-2-3, PS-3-7):
 *   fusion / referenz   the stored conserve of a register entry
 *   abgeleitet          a transform of another model's block — the negative controls of the self-check (Konzept §14) and
 *                       the deliberately worsened candidate of gate G-PS4. Derived blocks are never stored.
 *   naiv                the naive fusion of protocol P1: mean of `roh-lapse` and `mosmix`, normal with the RMSE of that
 *                       mean per quantity × window × country from the OTHER days of the set (day ± lockDays left out)
 *
 * Transforms (`reg.transform`): { widen: f } bands scaled around the median · { noise: f, seed } every quantile set
 * shifted by f × its own 10–90 width × N(0, 1) · { truth: true } the truth as a point forecast · { leak: true } the truth
 * at role A, the base at role B.
 */
import { H } from './common.mjs';
import { leadsOfIssue, readConserve } from './konserven.mjs';
import { modelHash, loadRegister, referenceEntry } from './register.mjs';
import { QUANTITY_VARS, TRUTH_VARS, windowOf } from '../../../src/pruefstand/protokoll.ts';
import { normalQuantile } from '../../../src/pruefstand/metrics.ts';
import { lcg } from '../../../src/pruefstand/stats.ts';

const NQV = QUANTITY_VARS.length, NT = TRUTH_VARS.length;
const LO = { ws: 0, gust: 0, precip: 0, clct: 0 }, HI = { clct: 100 };
const clampV = (name, x) => (LO[name] != null && x < LO[name] ? LO[name] : HI[name] != null && x > HI[name] ? HI[name] : x);

export function storedProvider(proto, reg) {
  const hash = modelHash(reg);
  return { id: reg.id, reg, hash, block: (issue) => { const c = readConserve(proto, hash, issue); return c ? { nq: c.nq, data: c.data, info: c.info, sha256: c.sha256 } : null; } };
}

export function derivedProvider(proto, reg) {
  const t = reg.transform, nq = proto.quantiles.length, im = proto.quantiles.findIndex((x) => Math.abs(x - 0.5) < 1e-9), i10 = proto.quantiles.findIndex((x) => Math.abs(x - 0.1) < 1e-9), i90 = proto.quantiles.findIndex((x) => Math.abs(x - 0.9) < 1e-9);
  const wetThr = proto.variables.wet.thresholdMmH;
  return {
    id: reg.id, reg, hash: `abgeleitet:${reg.base}:${JSON.stringify(t)}`,
    block(issue, ctx) {
      const nSt = proto.scored.length, nL = ctx.leads.length, T = ctx.truth;
      if (t.truth) {
        const ch = NQV + 2, out = new Float32Array(nSt * nL * ch).fill(NaN);
        for (let i = 0; i < nSt * nL; i++) { for (let v = 0; v < NQV; v++) out[i * ch + v] = T[i * NT + v]; const pr = T[i * NT + 4]; out[i * ch + NQV] = pr === pr ? (pr >= wetThr ? 1 : 0) : NaN; out[i * ch + NQV + 1] = T[i * NT + 6]; }
        return { nq: 1, data: out };
      }
      const base = ctx.get(reg.base);
      if (!base || base.nq !== nq) return null;
      const ch = NQV * nq + 2, out = new Float32Array(base.data);
      const rnd = t.noise ? lcg((t.seed ?? 1) + Math.floor(issue.issueMs / H)) : null;
      const gauss = () => normalQuantile(Math.min(1 - 1e-9, Math.max(1e-9, rnd())));
      for (let s = 0; s < nSt; s++) for (let l = 0; l < nL; l++) {
        const o = (s * nL + l) * ch, to = (s * nL + l) * NT;
        for (let v = 0; v < NQV; v++) {
          const name = QUANTITY_VARS[v], m = out[o + v * nq + im];
          if (m !== m) continue;
          if (t.widen) for (let k = 0; k < nq; k++) out[o + v * nq + k] = clampV(name, m + t.widen * (out[o + v * nq + k] - m));
          if (t.noise) { const sh = t.noise * (out[o + v * nq + i90] - out[o + v * nq + i10] + 1e-3) * gauss(); for (let k = 0; k < nq; k++) out[o + v * nq + k] = clampV(name, out[o + v * nq + k] + sh); }
          if (t.leak && proto.scored[s].role === 'A') { const y = T[to + v]; if (y === y) for (let k = 0; k < nq; k++) out[o + v * nq + k] = y; }
        }
        if (t.leak && proto.scored[s].role === 'A') { const pr = T[to + 4]; if (pr === pr) out[o + NQV * nq] = pr >= wetThr ? 1 : 0; }
      }
      return { nq, data: out };
    },
  };
}

/** Naive fusion; `prepare(issues, truthOf)` must run before the scorer (it needs the residuals of every day of the set). */
export function naiveProvider(proto, w1, truthOf) {
  const a = storedProvider(proto, referenceEntry('roh-lapse')), b = storedProvider(proto, referenceEntry('mosmix'));
  const taus = proto.quantiles, nq = taus.length, z = taus.map((t) => normalQuantile(t)), lock = proto.references.naiv.lockDays;
  const nW = proto.windows.length, lands = ['DE', 'AT', 'CH'];
  const landOf = proto.scored.map((s) => lands.indexOf(s.land));
  const byDay = new Map();   // day → Float64Array [var × window × land × (sumSq, n)]
  const meanOf = (issue, leads) => {
    const A = a.block(issue), B = b.block(issue);
    if (!A && !B) return null;
    const nSt = proto.scored.length, nL = leads.length, ch = NQV + 2, out = new Float32Array(nSt * nL * NQV).fill(NaN);
    for (let i = 0; i < nSt * nL; i++) for (let v = 0; v < NQV; v++) { const x = A ? A.data[i * ch + v] : NaN, y = B ? B.data[i * ch + v] : NaN; out[i * NQV + v] = x === x && y === y ? (x + y) / 2 : x === x ? x : y; }
    return out;
  };
  const dayIdx = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
  return {
    id: 'ref-naiv', reg: { id: 'ref-naiv', kind: 'referenz', name: 'naiv' }, hash: 'naiv:1',
    prepare(issues) {
      for (const issue of issues) {
        const L = leadsOfIssue(proto, issue), leads = L.all, raster = new Set(L.raster), m = meanOf(issue, leads);
        if (!m) continue;
        const T = truthOf(issue), acc = new Float64Array(NQV * nW * 3 * 2), nSt = proto.scored.length, nL = leads.length;
        for (let s = 0; s < nSt; s++) for (let l = 0; l < nL; l++) {
          if (!raster.has(leads[l])) continue;
          const w = windowOf(proto, leads[l]);
          for (let v = 0; v < NQV; v++) { const x = m[(s * nL + l) * NQV + v], y = T[(s * nL + l) * NT + v]; if (x !== x || y !== y) continue; const o = ((v * nW + w) * 3 + landOf[s]) * 2; acc[o] += (x - y) * (x - y); acc[o + 1] += 1; }
        }
        byDay.set(issue.day, acc);
      }
    },
    block(issue, ctx) {
      const leads = ctx.leads, m = meanOf(issue, leads);
      if (!m) return null;
      const sig = new Float64Array(NQV * nW * 3 * 2), d0 = dayIdx(issue.day);
      for (const [day, acc] of byDay) if (Math.abs(dayIdx(day) - d0) > lock) for (let i = 0; i < sig.length; i++) sig[i] += acc[i];
      const nSt = proto.scored.length, nL = leads.length, ch = NQV * nq + 2, out = new Float32Array(nSt * nL * ch).fill(NaN);
      const wetThr = proto.variables.wet.thresholdMmH;
      for (let s = 0; s < nSt; s++) for (let l = 0; l < nL; l++) {
        const w = windowOf(proto, leads[l]);
        if (w < 0) continue;
        for (let v = 0; v < NQV; v++) {
          const x = m[(s * nL + l) * NQV + v], o2 = ((v * nW + w) * 3 + landOf[s]) * 2;
          if (x !== x || sig[o2 + 1] < proto.references.naiv.minResiduals) continue;   // too few residuals from other days: no naive forecast for this cell
          const sd = Math.sqrt(sig[o2] / sig[o2 + 1]), o = (s * nL + l) * ch, name = QUANTITY_VARS[v];
          for (let k = 0; k < nq; k++) out[o + v * nq + k] = clampV(name, x + sd * z[k]);
          if (name === 'precip') out[o + NQV * nq] = x >= wetThr ? 1 : 0;
        }
      }
      return { nq, data: out };
    },
  };
}

/** Provider of an id: a register entry (`fusion-…`, `test-…`) or a reference (`ref-…`). */
export function providerOf(proto, id, w1, truthOf) {
  if (id === 'ref-naiv') return naiveProvider(proto, w1, truthOf);
  if (id.startsWith('ref-')) return storedProvider(proto, referenceEntry(id.slice(4)));
  const reg = loadRegister(id);
  return reg.kind === 'abgeleitet' ? derivedProvider(proto, reg) : storedProvider(proto, reg);
}
