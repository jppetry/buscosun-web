/**
 * wahrheit.mjs — reader of the truth table W1 (`wahrheit/build-w1.mjs`) and the case builder's truth block.
 *
 *   openW1(proto)            → { manifest, day(day) → Float32Array | null, at(sIdx, ms, vIdx), hash }
 *   truthBlock(w1, proto, issueMs, leads) → Float32Array [stations × leads × TRUTH_VARS] in the definitions of P1:
 *       t, td, ws, dd, clct  the value AT the valid stamp
 *       gust                 maximum of the hourly maxima in the step before the stamp (1 h / 3 h / 6 h)
 *       precip               mean rate in the step: sum of the hourly sums / step hours (mm/h)
 *     a step value is NaN unless every hour of the step is present.
 */
import { existsSync } from 'node:fs';
import { PS_ROOT, H, DAY, isoDay, p, readBlock, readJson } from './common.mjs';
import { NV, W1_VARS } from '../wahrheit/qc.mjs';
import { TRUTH_VARS, stepHoursOf } from '../../../src/pruefstand/protokoll.ts';

const V = Object.fromEntries(W1_VARS.map((v, i) => [v, i]));

export function openW1(proto, dir = p(PS_ROOT, 'wahrheit', proto.truth.stand)) {
  const mp = p(dir, 'manifest.json');
  if (!existsSync(mp)) throw new Error(`Wahrheit ${proto.truth.stand} fehlt (${mp}) — zuerst scripts/pruefstand/wahrheit/build-w1.mjs`);
  const manifest = readJson(mp);
  const ids = proto.scored.map((s) => s.id);
  if (manifest.stations.join() !== ids.join()) throw new Error(`Wahrheit ${dir}: Stationsliste passt nicht zum Protokoll`);
  const cache = new Map();
  const day = (d) => {
    if (cache.has(d)) return cache.get(d);
    const f = p(dir, `${d}.f32`);
    let data = null;
    if (manifest.days[d] && existsSync(f)) {
      const b = readBlock(f);
      if (b.sha256 !== manifest.days[d].sha256) throw new Error(`Wahrheit ${f}: sha256 passt nicht zum Manifest`);
      data = b.data;
    }
    cache.set(d, data);
    return data;
  };
  const nSt = ids.length;
  /** Hourly value of station index `s` at stamp `ms` for W1 column `v` (index), NaN when absent. */
  const byIdx = new Map();   // integer day index → block (the hot path of the climatology: no date strings)
  const at = (s, ms, v) => {
    const di = Math.floor(ms / DAY);
    let d = byIdx.get(di);
    if (d === undefined) { d = day(isoDay(di * DAY)); byIdx.set(di, d); }
    if (!d) return NaN;
    return d[(s * 24 + (ms - di * DAY) / H) * NV + v];
  };
  return { dir, manifest, day, at, nSt, hash: manifest.hash, reif: (d) => manifest.days[d]?.reif === true };
}

/** One P1 truth value: variable name of TRUTH_VARS at the valid stamp for a step of `stepH` hours. */
export function truthValue(w1, s, validMs, name, stepH) {
  if (name === 'gust') { let mx = -Infinity; for (let k = 0; k < stepH; k++) { const x = w1.at(s, validMs - k * H, V.gust); if (x !== x) return NaN; if (x > mx) mx = x; } return mx; }
  if (name === 'precip') { let sum = 0; for (let k = 0; k < stepH; k++) { const x = w1.at(s, validMs - k * H, V.rr); if (x !== x) return NaN; sum += x; } return sum / stepH; }
  return w1.at(s, validMs, V[name]);
}

export function truthBlock(w1, proto, issueMs, leads) {
  const nSt = w1.nSt, nL = leads.length, nV = TRUTH_VARS.length;
  const out = new Float32Array(nSt * nL * nV).fill(NaN);
  for (let s = 0; s < nSt; s++) for (let l = 0; l < nL; l++) {
    const valid = issueMs + leads[l] * H, stepH = stepHoursOf(proto, leads[l]);
    const o = (s * nL + l) * nV;
    for (let v = 0; v < nV; v++) out[o + v] = truthValue(w1, s, valid, TRUTH_VARS[v], stepH);
  }
  return out;
}
