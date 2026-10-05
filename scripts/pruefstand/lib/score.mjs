/**
 * score.mjs — the scorer of the Prüfstand (plan PS-3, Konzept §7–§9): forecast blocks × truth blocks → sums per cell
 * and day. A cell is score variable × lead window × country (DE, AT, CH, alle) × role (A, B). Pure accumulation; the
 * statistics, gates and the report read the result (`urteil.mjs`, `bericht.mjs`).
 *
 * Score per case: CRPS_Q of the quantile set (a point value: the absolute error) for t, td, ws, gust, precip, clct;
 * the Brier term (p − o)² for `wet`; the angular error for `dd` (only where the measured wind reaches `minWindMs`).
 * Pairs are accumulated on IDENTICAL cases: a case one of the two models lacks is dropped for that pair (Konzept R-1).
 * Aggregation is per issue day first; skill is always a ratio of sums.
 */
import { existsSync } from 'node:fs';
import { H, isoDay, readBlock, writeBlock } from './common.mjs';
import { caseHash, leadsOfIssue, truthPath } from './konserven.mjs';
import { truthBlock } from './wahrheit.mjs';
import { QUANTITY_VARS, TRUTH_VARS, stepHoursOf, windowOf } from '../../../src/pruefstand/protokoll.ts';
import { angleError } from '../../../src/pruefstand/metrics.ts';

export const SCORE_VARS = Object.freeze(['t', 'td', 'ws', 'gust', 'precip', 'clct', 'wet', 'dd']);
export const LANDS = Object.freeze(['DE', 'AT', 'CH', 'alle']);
export const ROLES = Object.freeze(['A', 'B']);
export const NVS = SCORE_VARS.length;
/** Fields of a single-model cell. */
export const F = Object.freeze({ n: 0, s: 1, err: 2, abs: 3, sq: 4, cov: 5, below: 6, above: 7, width: 8, nQ: 9, tw: 10, nTw: 11, vari: 12, a: 13, b: 14, c: 15, d: 16, N: 17 });
export const PIT_BINS = 20, WET_BINS = 100;
const NQV = QUANTITY_VARS.length, NT = TRUTH_VARS.length;

export const nCells = (proto) => NVS * proto.windows.length * LANDS.length * ROLES.length;
export const cellIndex = (proto, v, w, land, role) => ((v * proto.windows.length + w) * LANDS.length + land) * ROLES.length + role;
/** Is (variable, window) a core cell of the protocol? */
export function isKern(proto, v, w) {
  const def = proto.variables[SCORE_VARS[v]];
  return def.cell === 'kern' && (def.kernToH == null || proto.windows[w].toH <= def.kernToH);
}

/** Truth block of an issue: read from `faelle/` when final, else built from W1 (and stored). */
export function truthOfIssue(proto, w1, issue) {
  const f = truthPath(proto, issue), leads = leadsOfIssue(proto, issue).all, ch = caseHash(proto, issue);
  if (existsSync(f)) { const b = readBlock(f); if (b.header.final && b.header.caseHash === ch && b.header.w1 === w1.manifest.stationsHash) return b.data; }
  const data = truthBlock(w1, proto, issue.issueMs, leads);
  const lastDay = isoDay(issue.issueMs + leads[leads.length - 1] * H);
  const final = w1.reif(lastDay);
  writeBlock(f, { kind: 'pruefstand/fall', protocol: proto.id, caseHash: ch, source: issue.source, day: issue.day, issueMs: issue.issueMs, shape: [proto.scored.length, leads.length, NT], vars: TRUTH_VARS, leads, w1: w1.manifest.stationsHash, stand: proto.truth.stand, final }, data);
  return data;
}

function newModelAcc(proto) {
  const nc = nCells(proto);
  return { cells: new Float64Array(nc * F.N), pit: new Float64Array(nc * PIT_BINS), wet: new Float64Array(proto.windows.length * ROLES.length * WET_BINS * 3), daily: new Map(), issues: 0, info: [] };
}

/**
 * Scores a set of issues. `providers`: [{ id, block(issue, ctx) → { nq, data, info? } | null }]; `pairs`: [[a, b]] ids.
 * Options: `ripeOnly` (count only cases whose truth day is mature), `special` (ids of quantile models for the height-pair,
 * seam and interpolation checks), `stationPairs` (pair keys for per-station sums), `stationFilter(sIdx)` (A/A splits).
 */
export function scoreRun(proto, w1, issues, providers, pairs, { ripeOnly = false, special = [], onIssue = null } = {}) {
  const stations = proto.scored, nSt = stations.length, nW = proto.windows.length, taus = proto.quantiles, nq19 = taus.length;
  const iq = (t) => taus.findIndex((x) => Math.abs(x - t) < 1e-9);
  const I10 = iq(0.1), I50 = iq(0.5), I90 = iq(0.9), I15 = iq(0.15), I85 = iq(0.85), IX = iq(proto.extremes.quantile);
  const wetThr = proto.variables.wet.thresholdMmH, minWind = proto.variables.dd.minWindMs;
  const landOf = stations.map((s) => LANDS.indexOf(s.land)), roleOf = stations.map((s) => ROLES.indexOf(s.role));
  const nc = nCells(proto);
  const models = new Map(providers.map((p) => [p.id, newModelAcc(proto)]));
  const pairAcc = new Map(pairs.map(([a, b]) => [`${a}|${b}`, { a, b, daily: new Map(), station: new Float64Array(nSt * NVS * 3) }]));
  const spec = { pairs: new Map(), seams: new Map(), interp: new Map() };
  const meta = { issues: 0, days: [], unripeSkipped: 0, unripeCounted: 0 };   // unripe*: values of the first provider whose truth day is not mature
  const stIdx = new Map(stations.map((s, i) => [s.id, i]));
  const hPairs = proto.net.pairs.map((p) => ({ v: stIdx.get(p.valley), m: stIdx.get(p.mountain) })).filter((p) => p.v != null && p.m != null);

  for (const issue of issues) {
    const L = leadsOfIssue(proto, issue), leads = L.all, nL = leads.length;
    const raster = new Set(L.raster);
    const T = truthOfIssue(proto, w1, issue);
    const lw = leads.map((h) => (raster.has(h) ? windowOf(proto, h) : -1));
    const ripe = leads.map((h) => w1.reif(isoDay(issue.issueMs + h * H)));
    const cache = new Map();
    const ctx = { issue, leads, truth: T, proto, get: (id) => { if (!cache.has(id)) { const pr = providers.find((p) => p.id === id); cache.set(id, pr ? pr.block(issue, ctx) : null); } return cache.get(id); } };
    const klima = ctx.get('ref-klima');
    const S = new Map();
    let any = false;
    for (const pr of providers) {
      const blk = ctx.get(pr.id);
      if (!blk) continue;
      const acc = models.get(pr.id);
      acc.issues += 1;
      if (blk.info) acc.info.push({ day: issue.day, ...blk.info });
      let day = acc.daily.get(issue.day);
      if (!day) { day = new Float64Array(nc * 4); acc.daily.set(issue.day, day); }
      const nq = blk.nq, ch = NQV * nq + 2, D = blk.data, sc = new Float32Array(nSt * nL * NVS).fill(NaN);
      const kch = klima ? NQV * klima.nq + 2 : 0;
      for (let s = 0; s < nSt; s++) for (let l = 0; l < nL; l++) {
        const w = lw[l];
        if (w < 0 && !special.includes(pr.id)) continue;
        if (ripeOnly && !ripe[l]) { if (w >= 0 && pr === providers[0]) meta.unripeSkipped += 1; continue; }
        const o = (s * nL + l) * ch, to = (s * nL + l) * NT, so = (s * nL + l) * NVS;
        for (let v = 0; v < NVS; v++) {
          let score = NaN, y, med = NaN;
          if (v < NQV) {
            y = T[to + v];
            const q0 = D[o + v * nq];
            if (y !== y || q0 !== q0) continue;
            if (nq === 1) { med = q0; score = Math.abs(y - q0); }
            else { let sum = 0; for (let k = 0; k < nq; k++) { const x = D[o + v * nq + k]; sum += ((y < x ? 1 : 0) - taus[k]) * (x - y); } score = (2 * sum) / nq; med = D[o + v * nq + I50]; }
          } else if (v === 6) {
            const yr = T[to + 4], pw = D[o + NQV * nq];
            if (yr !== yr || pw !== pw) continue;
            y = yr >= wetThr ? 1 : 0; score = (pw - y) * (pw - y);
          } else {
            const yd = T[to + 6], yw = T[to + 2], fd = D[o + NQV * nq + 1];
            if (yd !== yd || fd !== fd || !(yw >= minWind)) continue;
            score = angleError(fd, yd);
          }
          sc[so + v] = score;
          if (w < 0) continue;
          for (const land of [landOf[s], 3]) {
            const ci = cellIndex(proto, v, w, land, roleOf[s]), c = ci * F.N, C = acc.cells;
            C[c + F.n] += 1; C[c + F.s] += score; day[ci * 4] += 1; day[ci * 4 + 1] += score;
            if (v < NQV) {
              const e = med - y; C[c + F.err] += e; C[c + F.abs] += Math.abs(e); C[c + F.sq] += e * e;
              if (nq > 1) {
                const lo = D[o + v * nq + I10], hi = D[o + v * nq + I90];
                const inside = y >= lo && y <= hi ? 1 : 0;
                C[c + F.cov] += inside; C[c + F.below] += y < lo ? 1 : 0; C[c + F.above] += y > hi ? 1 : 0; C[c + F.width] += hi - lo; C[c + F.nQ] += 1;
                day[ci * 4 + 2] += inside; day[ci * 4 + 3] += 1;
                const sd = (D[o + v * nq + I85] - D[o + v * nq + I15]) / 2.0728; C[c + F.vari] += sd * sd;
                let r = 0; while (r < nq && y >= D[o + v * nq + r]) r++;
                acc.pit[ci * PIT_BINS + r] += 1;
                if (klima && klima.nq === nq19 && v !== 1 && v !== 5) {
                  const thr = klima.data[(s * nL + l) * kch + v * klima.nq + IX];
                  if (thr === thr) {
                    const yy = y > thr ? y : thr; let sum = 0;
                    for (let k = 0; k < nq; k++) { const x = D[o + v * nq + k] > thr ? D[o + v * nq + k] : thr; sum += ((yy < x ? 1 : 0) - taus[k]) * (x - yy); }
                    C[c + F.tw] += (2 * sum) / nq; C[c + F.nTw] += 1;
                    const fe = med > thr, oe = y > thr;
                    C[c + (fe ? (oe ? F.a : F.b) : oe ? F.c : F.d)] += 1;
                  }
                }
              }
            } else if (v === 6 && land === 3) {
              const pw = D[o + NQV * nq], b = Math.min(WET_BINS - 1, Math.max(0, Math.floor(pw * WET_BINS)));
              const wo = ((w * ROLES.length + roleOf[s]) * WET_BINS + b) * 3;
              acc.wet[wo] += 1; acc.wet[wo + 1] += pw; acc.wet[wo + 2] += y;
            }
          }
          if (!ripe[l] && pr === providers[0]) meta.unripeCounted += 1;
        }
      }
      S.set(pr.id, sc);
      any = true;
    }
    for (const pa of pairAcc.values()) {
      const sa = S.get(pa.a), sb = S.get(pa.b);
      if (!sa || !sb) continue;
      let day = pa.daily.get(issue.day);
      if (!day) { day = new Float64Array(nc * 3); pa.daily.set(issue.day, day); }
      for (let s = 0; s < nSt; s++) for (let l = 0; l < nL; l++) {
        const w = lw[l];
        if (w < 0) continue;
        const so = (s * nL + l) * NVS;
        for (let v = 0; v < NVS; v++) {
          const x = sa[so + v], z = sb[so + v];
          if (x !== x || z !== z) continue;
          for (const land of [landOf[s], 3]) { const c = cellIndex(proto, v, w, land, roleOf[s]) * 3; day[c] += x; day[c + 1] += z; day[c + 2] += 1; }
          const st = (s * NVS + v) * 3; pa.station[st] += x; pa.station[st + 1] += z; pa.station[st + 2] += 1;
        }
      }
    }
    // ── special checks (Konzept §9) on the median of the named quantile models and on the point references they are held against
    for (const id of special) {
      const blk = ctx.get(id);
      if (!blk) continue;
      const nq = blk.nq, ch = NQV * nq + 2, D = blk.data, im = nq === 1 ? 0 : I50;
      const med = (s, l, v) => D[(s * nL + l) * ch + v * nq + im];
      // height pairs: error of the predicted difference valley − mountain, split by inversion at issue time (from the measurements)
      const hp = spec.pairs.get(id) ?? spec.pairs.set(id, new Float64Array(2 * 2 * 2 * 2)).get(id);   // [var t|td][inversion 0|1][lead ≤ 48 | > 48][sum, n]
      for (const p of hPairs) {
        const tv0 = w1.at(p.v, issue.issueMs, 0), tm0 = w1.at(p.m, issue.issueMs, 0);
        if (tv0 !== tv0 || tm0 !== tm0) continue;
        const inv = tv0 < tm0 ? 1 : 0;
        for (let l = 0; l < nL; l++) {
          if (lw[l] < 0 || (ripeOnly && !ripe[l])) continue;
          for (let v = 0; v < 2; v++) {
            const fv = med(p.v, l, v), fm = med(p.m, l, v), yv = T[(p.v * nL + l) * NT + v], ym = T[(p.m * nL + l) * NT + v];
            if (fv !== fv || fm !== fm || yv !== yv || ym !== ym) continue;
            const k = ((v * 2 + inv) * 2 + (leads[l] <= proto.leads.hourlyToH ? 0 : 1)) * 2;
            hp[k] += Math.abs(fv - fm - (yv - ym)); hp[k + 1] += 1;
          }
        }
      }
      // seams: error of the predicted temperature change across the seam against the two neighbouring raster pairs
      const sm = spec.seams.get(id) ?? spec.seams.set(id, new Float64Array(proto.seams.length * 3 * 2)).get(id);   // [seam][before|across|after][sum per hour, n]
      const ri = leads.map((h, i) => (raster.has(h) ? i : -1)).filter((i) => i >= 0);
      proto.seams.forEach((seamH, si) => {
        const k = ri.findIndex((i) => leads[i] > seamH);
        if (k < 2 || k + 1 >= ri.length) return;
        const trip = [[ri[k - 2], ri[k - 1]], [ri[k - 1], ri[k]], [ri[k], ri[k + 1]]];
        for (let s = 0; s < nSt; s++) trip.forEach(([i0, i1], j) => {
          if (ripeOnly && !ripe[i1]) return;
          const f0 = med(s, i0, 0), f1 = med(s, i1, 0), y0 = T[(s * nL + i0) * NT], y1 = T[(s * nL + i1) * NT];
          if (f0 !== f0 || f1 !== f1 || y0 !== y0 || y1 !== y1) return;
          const o = (si * 3 + j) * 2; sm[o] += Math.abs(f1 - f0 - (y1 - y0)); sm[o + 1] += 1;
        });
      });
      // hour interpolation in stage 2: score on the diagnostic hours against the raster hours of the same lead range
      const sc = S.get(id);
      if (sc && L.diagnostic.length) {
        const ip = spec.interp.get(id) ?? spec.interp.set(id, new Float64Array(NQV * 2 * 2)).get(id);   // [var][raster|diagnostic][sum, n]
        const loH = proto.leads.hourlyToH, hiH = proto.leads.diagnosticHourlyToH;
        for (let s = 0; s < nSt; s++) for (let l = 0; l < nL; l++) {
          if (leads[l] <= loH || leads[l] > hiH || (ripeOnly && !ripe[l])) continue;
          for (let v = 0; v < NQV; v++) {
            if (stepHoursOf(proto, leads[l]) > 1 && (v === 3 || v === 4)) continue;   // step quantities are not comparable hour by hour
            const x = sc[(s * nL + l) * NVS + v];
            if (x !== x) continue;
            const o = (v * 2 + (lw[l] < 0 ? 1 : 0)) * 2; ip[o] += x; ip[o + 1] += 1;
          }
        }
      }
    }
    if (any) { meta.issues += 1; meta.days.push(issue.day); }
    if (onIssue) onIssue(issue, ctx, S);
  }
  return { proto, models, pairs: pairAcc, special: spec, meta };
}
