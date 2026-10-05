/**
 * urteil.mjs — statistics, indices, gates and the verdict of the Prüfstand (plan PS-3-1/PS-3-2, Konzept §10–§11).
 * Reads the accumulators of `score.mjs`; pure (no I/O). Everything it returns is plain JSON with a stable key order, so
 * `scores.json` is byte-identical on a repeat.
 */
import { F, LANDS, NVS, PIT_BINS, ROLES, SCORE_VARS, WET_BINS, cellIndex, isKern } from './score.mjs';
import { QUANTITY_VARS } from '../../../src/pruefstand/protokoll.ts';
import { isotonicFit, sedi } from '../../../src/pruefstand/metrics.ts';
import { benjaminiHochberg, blockBootstrap, pairedTest } from '../../../src/pruefstand/stats.ts';

const r = (x, d = 5) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const NQV = QUANTITY_VARS.length;

/** Summary of one single-model cell. */
export function cellSummary(proto, acc, v, w, land, role) {
  const ci = cellIndex(proto, v, w, land, role), C = acc.cells, c = ci * F.N, n = C[c + F.n];
  if (!n) return null;
  const out = { n, score: r(C[c + F.s] / n) };
  if (v < NQV) {
    const rmse = Math.sqrt(C[c + F.sq] / n);
    out.bias = r(C[c + F.err] / n); out.mae = r(C[c + F.abs] / n); out.rmse = r(rmse);
    const nQ = C[c + F.nQ];
    if (nQ) {
      out.cover = r(C[c + F.cov] / nQ); out.below = r(C[c + F.below] / nQ); out.above = r(C[c + F.above] / nQ); out.width = r(C[c + F.width] / nQ);
      out.spreadSkill = rmse > 0 ? r(Math.sqrt(C[c + F.vari] / nQ) / rmse, 3) : null;
      out.pit = Array.from(acc.pit.subarray(ci * PIT_BINS, (ci + 1) * PIT_BINS), (x) => r(x / nQ, 4));
      if (C[c + F.nTw]) { out.twCrps = r(C[c + F.tw] / C[c + F.nTw]); out.sedi = r(sedi(C[c + F.a], C[c + F.b], C[c + F.c], C[c + F.d]), 3); out.extreme = { hits: C[c + F.a], falseAlarms: C[c + F.b], misses: C[c + F.c] }; }
    }
  }
  return out;
}

/** Brier decomposition and CORP terms of the wet event for one window and role (all countries), from the probability bins. */
export function wetSummary(proto, acc, w, role) {
  const p = [], o = [], wt = [];
  let n = 0, so = 0;
  for (let b = 0; b < WET_BINS; b++) {
    const k = ((w * ROLES.length + role) * WET_BINS + b) * 3, cnt = acc.wet[k];
    if (!cnt) continue;
    p.push(acc.wet[k + 1] / cnt); o.push(acc.wet[k + 2] / cnt); wt.push(cnt); n += cnt; so += acc.wet[k + 2];
  }
  if (!n) return null;
  const base = so / n;
  let rel = 0, res = 0;
  for (let i = 0; i < p.length; i++) { rel += wt[i] * (p[i] - o[i]) ** 2; res += wt[i] * (o[i] - base) ** 2; }
  const fit = isotonicFit(p, o, wt);
  // on the binned pairs: BS_binned = REL − RES + UNC exactly; the recalibrated score uses the PAV fit of the bins
  let bsRecal = 0;
  for (let i = 0; i < p.length; i++) bsRecal += wt[i] * ((fit[i] - o[i]) ** 2 + o[i] * (1 - o[i]));
  const unc = base * (1 - base), bsBinned = rel / n - res / n + unc;
  return { n, baseRate: r(base, 4), reliability: r(rel / n, 6), resolution: r(res / n, 6), uncertainty: r(unc, 6), brierBinned: r(bsBinned, 6), mcb: r(bsBinned - bsRecal / n, 6), dsc: r(unc - bsRecal / n, 6), curve: p.map((x, i) => [r(x, 3), r(o[i], 3), wt[i], r(fit[i], 3)]) };
}

/** One pair cell: sums, skill, daily differences, test and bootstrap interval. */
export function pairCell(proto, pa, v, w, land, role, { withDaily = false } = {}) {
  const st = proto.statistics, ci = cellIndex(proto, v, w, land, role) * 3;
  const days = [...pa.daily.keys()].sort();
  const d = [], tuples = [], series = [];
  let A = 0, B = 0, n = 0;
  for (const day of days) {
    const x = pa.daily.get(day), k = x[ci + 2];
    if (!k) continue;
    A += x[ci]; B += x[ci + 1]; n += k;
    d.push((x[ci] - x[ci + 1]) / k); tuples.push([x[ci], x[ci + 1]]);
    if (withDaily) series.push([day, r(x[ci] / k), r(x[ci + 1] / k), k]);
  }
  if (!n) return null;
  const out = { n, days: d.length, a: r(A / n), b: r(B / n), skill: B > 0 ? r(1 - A / B) : null };
  if (d.length >= st.minDays) {
    const t = pairedTest(d, st.alpha, st.power);
    const boot = blockBootstrap(tuples, (s) => (s[1] > 0 ? 1 - s[0] / s[1] : NaN), st.bootstrap.draws, st.bootstrap.seed);
    out.test = { k: r(t.k, 3), nEff: r(t.nEff, 2), t: r(t.t, 3), pTwoSided: r(t.pTwoSided, 5), pBetter: r(t.pLess, 5), pWorse: r(t.pGreater, 5), fallback: t.fallback };
    out.ci95 = boot ? [r(boot.lo), r(boot.hi)] : null;
    out.mdeRel = B > 0 ? r(t.mde / (B / n), 4) : null;
  }
  if (withDaily) out.daily = series;
  return out;
}

export const kernCells = (proto) => { const out = []; for (let v = 0; v < NVS; v++) for (let w = 0; w < proto.windows.length; w++) if (isKern(proto, v, w)) for (let land = 0; land < 3; land++) out.push({ v, w, land }); return out; };

/** The index Σ w_c · (1 − ΣA_c/ΣB_c) over the core cells of a role (equal weights over the cells with data), its interval and test. */
export function indexOfPair(proto, pa, role) {
  const st = proto.statistics, cells = kernCells(proto);
  const days = [...pa.daily.keys()].sort();
  const idx = cells.map((c) => cellIndex(proto, c.v, c.w, c.land, role) * 3);
  const tot = idx.map(() => [0, 0, 0]);
  for (const day of days) { const x = pa.daily.get(day); idx.forEach((ci, i) => { tot[i][0] += x[ci]; tot[i][1] += x[ci + 1]; tot[i][2] += x[ci + 2]; }); }
  const used = tot.map((t) => t[1] > 0 && t[2] > 0);
  const nUsed = used.filter(Boolean).length;
  if (!nUsed) return { value: null, cells: 0, days: days.length };
  const stat = (s) => { let acc = 0, m = 0; for (let i = 0; i < idx.length; i++) if (used[i] && s[2 * i + 1] > 0) { acc += 1 - s[2 * i] / s[2 * i + 1]; m++; } return m ? acc / m : NaN; };
  const tuples = [], lin = [];
  for (const day of days) {
    const x = pa.daily.get(day), tup = new Array(idx.length * 2).fill(0);
    let acc = 0, m = 0;
    idx.forEach((ci, i) => { if (!used[i]) return; tup[2 * i] = x[ci]; tup[2 * i + 1] = x[ci + 1]; const k = x[ci + 2]; if (k) { acc += (x[ci] / k - x[ci + 1] / k) / (tot[i][1] / tot[i][2]); m++; } });
    if (!m) continue;
    tuples.push(tup); lin.push(acc / m);
  }
  const value = stat(tuples.reduce((s, t) => s.map((x, i) => x + t[i]), new Array(idx.length * 2).fill(0)));
  const out = { value: r(value), cells: nUsed, days: lin.length };
  if (lin.length >= st.minDays) {
    const t = pairedTest(lin, st.alpha, st.power), boot = blockBootstrap(tuples, stat, st.bootstrap.draws, st.bootstrap.seed);
    out.ci95 = boot ? [r(boot.lo), r(boot.hi)] : null;
    out.test = { k: r(t.k, 3), nEff: r(t.nEff, 2), pBetter: r(t.pLess, 5), pWorse: r(t.pGreater, 5) };
    out.mde = r(t.mde, 4);
  }
  return out;
}

/** Scorecard of a pair on the core and side cells: every variable × window × country for one role. */
export function pairCard(proto, pa, role, { withDaily = false } = {}) {
  const rows = [];
  for (let v = 0; v < NVS; v++) for (let w = 0; w < proto.windows.length; w++) for (let land = 0; land < LANDS.length; land++) {
    const c = pairCell(proto, pa, v, w, land, role, { withDaily: withDaily && land < 3 && isKern(proto, v, w) });
    if (c) rows.push({ var: SCORE_VARS[v], window: proto.windows[w].id, land: LANDS[land], role: ROLES[role], kern: isKern(proto, v, w), ...c });
  }
  // Benjamini–Hochberg over the core cells per country (the gates read only this mark)
  const k = rows.filter((x) => x.kern && x.land !== 'alle' && x.test);
  const adjW = benjaminiHochberg(k.map((x) => x.test.pWorse)), adjB = benjaminiHochberg(k.map((x) => x.test.pBetter));
  k.forEach((x, i) => { x.test.pWorseBH = r(adjW[i], 5); x.test.pBetterBH = r(adjB[i], 5); });
  return rows;
}

// ── gates ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export function gateG2(proto, card) {
  const a = proto.statistics.alpha;
  const tested = card.filter((x) => x.kern && x.land !== 'alle' && x.test);
  const worse = tested.filter((x) => x.test.pWorseBH < a && x.skill < -proto.gates.G2.delta);
  return { status: !tested.length ? 'nicht bewertbar' : worse.length ? 'rot' : 'grün', tested: tested.length, worse: worse.map((x) => ({ var: x.var, window: x.window, land: x.land, skill: x.skill, pWorseBH: x.test.pWorseBH })) };
}

/** G3 on one set: coverage q10–q90 per core quantity × window at role B (all countries) against the nominal value and the champion. */
export function gateG3(proto, accC, accH) {
  const st = proto.statistics, nominal = proto.gates.G3.nominal, rows = [];
  const role = ROLES.indexOf('B'), land = LANDS.indexOf('alle');
  for (let v = 0; v < NQV; v++) for (let w = 0; w < proto.windows.length; w++) {
    if (!isKern(proto, v, w)) continue;
    const ci = cellIndex(proto, v, w, land, role) * 4;
    const days = [...accC.daily.keys()].sort();
    const dC = [], tup = [];
    let cov = 0, n = 0, covH = 0, nH = 0;
    for (const day of days) {
      const x = accC.daily.get(day), h = accH?.daily.get(day);
      if (!x[ci + 3]) continue;
      cov += x[ci + 2]; n += x[ci + 3]; dC.push(x[ci + 2] / x[ci + 3] - nominal);
      const hc = h ? h[ci + 2] : 0, hn = h ? h[ci + 3] : 0;
      covH += hc; nH += hn; tup.push([x[ci + 2], x[ci + 3], hc, hn]);
    }
    if (!n) continue;
    const row = { var: SCORE_VARS[v], window: proto.windows[w].id, cover: r(cov / n, 4), n, days: dC.length, champion: nH ? r(covH / nH, 4) : null };
    if (dC.length >= st.minDays) {
      const t = pairedTest(dC, st.alpha, st.power);
      row.band = [r(nominal + t.ci95[0] - t.mean, 4), r(nominal + t.ci95[1] - t.mean, 4)];
      row.inBand = cov / n >= row.band[0] && cov / n <= row.band[1];
      if (nH) { const b = blockBootstrap(tup, (s) => (s[1] > 0 && s[3] > 0 ? Math.abs(s[0] / s[1] - nominal) - Math.abs(s[2] / s[3] - nominal) : NaN), st.bootstrap.draws, st.bootstrap.seed); row.fartherThanChampion = b ? [r(b.lo, 4), r(b.hi, 4)] : null; row.fartherSignificant = !!b && b.lo > 0; }
      else row.fartherSignificant = !row.inBand;
      row.red = !row.inBand && row.fartherSignificant;
    }
    rows.push(row);
  }
  const judged = rows.filter((x) => x.red != null);
  return { status: !judged.length ? 'nicht bewertbar' : judged.some((x) => x.red) ? 'rot' : 'grün', nominal, rows };
}

/** Physics of a quantile block (G4): shares of cases that violate an order the forecast must keep. */
export function physicsOfBlock(proto, blk, acc) {
  const nq = blk.nq;
  if (nq === 1) return;
  const ch = NQV * nq + 2, D = blk.data, im = proto.quantiles.findIndex((x) => Math.abs(x - 0.5) < 1e-9), g = proto.gates.G4;
  const iv = (name) => QUANTITY_VARS.indexOf(name) * nq;
  for (let o = 0; o < D.length; o += ch) {
    const t = D[o + iv('t') + im], td = D[o + iv('td') + im], ws = D[o + iv('ws') + im], gu = D[o + iv('gust') + im];
    if (t === t && td === td) { acc.tdN += 1; if (td > t + g.tolK) acc.tdAboveT += 1; }
    if (ws === ws && gu === gu) { acc.gustN += 1; if (gu < ws - g.tolMs) acc.gustBelowWind += 1; }
    const p0 = D[o + iv('precip')]; if (p0 === p0) { acc.precipN += 1; if (p0 < 0) acc.precipNegative += 1; }
    const c0 = D[o + iv('clct')], c1 = D[o + iv('clct') + nq - 1]; if (c0 === c0) { acc.clctN += 1; if (c0 < -1e-6 || c1 > 100 + 1e-6) acc.clctOutside += 1; }
  }
}
export const newPhysics = () => ({ tdN: 0, tdAboveT: 0, gustN: 0, gustBelowWind: 0, precipN: 0, precipNegative: 0, clctN: 0, clctOutside: 0 });

export function gateG4(proto, { determinism, physics, physicsChampion = null, filledC, filledH, pointMs, leak }) {
  const g = proto.gates.G4, checks = [];
  checks.push({ name: 'Determinismus', ok: determinism.ok, detail: determinism.detail });
  const share = (a, n) => (n ? a / n : 0);
  const sharesOf = (p) => ({ tdAboveT: share(p.tdAboveT, p.tdN), gustBelowWind: share(p.gustBelowWind, p.gustN), precipNegative: share(p.precipNegative, p.precipN), clctOutside: share(p.clctOutside, p.clctN) });
  const ph = sharesOf(physics), phH = physicsChampion && physicsChampion.tdN ? sharesOf(physicsChampion) : null;
  // a check holds when the share stays under the limit OR is not larger than the champion's (protocol G4)
  const over = Object.keys(ph).filter((k) => ph[k] > g.physicsMaxShare);
  const bad = over.filter((k) => !(phH && ph[k] <= phH[k] + 1e-12));
  const f = (x) => `${(x * 100).toFixed(3).replace('.', ',')} %`;
  checks.push({ name: 'Physik', ok: bad.length === 0, detail: `Anteile: Td-Median > T-Median + ${g.tolK} K ${f(ph.tdAboveT)}, Böen-Median < Wind-Median − ${g.tolMs} m/s ${f(ph.gustBelowWind)}, Niederschlag < 0 ${f(ph.precipNegative)}, Bewölkung außerhalb 0–100 ${f(ph.clctOutside)}; Grenze ${f(g.physicsMaxShare)}${over.length ? ` — über der Grenze: ${over.join(', ')}${phH ? `, beim Champion ${over.map((k) => f(phH[k])).join(', ')}${bad.length ? '' : ' (nicht schlechter als der Champion)'}` : ''}` : ''}`, shares: ph, championShares: phH });
  checks.push({ name: 'Vollständigkeit', ok: filledH == null || filledC >= filledH, detail: `${filledC} bewertete Kernfälle${filledH == null ? '' : `, Champion ${filledH}`}` });
  checks.push({ name: 'Punktabfrage', ok: pointMs == null || pointMs < g.maxPointMs, detail: pointMs == null ? 'keine Zeitmessung in den Konserven' : `Median ${String(pointMs).replace('.', ',')} ms je Punkt im Replay (Grenze ${g.maxPointMs} ms)` });
  checks.push({ name: 'Leck-Prüfung', ok: leak.ok, detail: leak.detail });
  return { status: checks.every((c) => c.ok) ? 'grün' : 'rot', checks };
}

/** G1 from the indices of track P and track R. */
export function gateG1(proto, indexP, indexR, rUsable) {
  const a = proto.statistics.alpha;
  const pOk = indexP?.test && indexP.value > 0 && indexP.test.pBetter < a;
  const rNeg = rUsable && indexR?.test && indexR.value < 0 && indexR.test.pWorse < a;
  const status = rNeg ? 'rot' : pOk ? 'grün' : 'nicht nachweisbar';
  const why = rNeg ? 'Spur R signifikant negativ' : pOk ? 'Spur P positiv und einseitig signifikant' : !indexP?.test ? `Spur P trägt ${indexP?.days ?? 0} Ausgabetage mit reifer Wahrheit (nötig ${proto.statistics.minDays})` : 'Spur P nicht signifikant positiv';
  return { status, why, spurP: indexP ?? null, spurR: rUsable ? indexR ?? null : null };
}

export function verdictOf(gates, sameAsChampion) {
  if ([gates.G2, gates.G3, gates.G4].some((g) => g.status === 'rot') || gates.G1.status === 'rot') return 'abgelehnt';
  if (sameAsChampion) return 'Kandidat';
  return gates.G1.status === 'grün' ? 'Champion' : 'Kandidat';
}
