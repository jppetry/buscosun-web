/**
 * lauf.mjs — one evaluation of the Prüfstand: sets → conserves → scorer → statistics → JSON (plan PS-3). Used by
 * `run.mjs` for every mode and by the self-check.
 */
import { existsSync } from 'node:fs';
import { hashOf, sha256 } from './common.mjs';
import { archiveIssues, hindcastIssues, readConserve } from './konserven.mjs';
import { providerOf } from './modelle.mjs';
import { REFERENCES, listRegister, loadRegister, modelHash, referenceEntry, registerPath } from './register.mjs';
import { ensureConserves } from './runner.mjs';
import { F, LANDS, NVS, ROLES, SCORE_VARS, cellIndex, isKern, scoreRun, truthOfIssue } from './score.mjs';
import { cellSummary, gateG2, gateG3, indexOfPair, newPhysics, pairCard, physicsOfBlock, wetSummary } from './urteil.mjs';
import { blockLength, lcg, pairedTest } from '../../../src/pruefstand/stats.ts';

const r = (x, d = 5) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
export const REF_IDS = Object.freeze([...REFERENCES.map((n) => `ref-${n}`), 'ref-naiv']);
const dayIndex = (day) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);

/** The issue sets of the protocol for a freeze date (YYYY-MM-DD). */
export function issueSets(proto, freeze) {
  const arch = archiveIssues();
  const entwicklung = arch.filter((i) => i.day <= freeze);
  return {
    entwicklung,
    schnell: entwicklung.filter((i) => dayIndex(i.day) % proto.sets.schnell.every === 0),
    spurP: arch.filter((i) => i.day > freeze),
    spurR: hindcastIssues(proto),
  };
}

/** Makes sure every stored model has its conserves on the issues; returns the failures. */
export async function fillConserves(proto, ids, issues, say) {
  const regs = ids.filter((id) => id !== 'ref-naiv' && !(existsSync(registerPath(id)) && loadRegister(id).kind === 'abgeleitet')).map((id) => (id.startsWith('ref-') ? referenceEntry(id.slice(4)) : loadRegister(id)));
  const res = await ensureConserves(proto, regs, issues, { say });
  if (res.failed.length) throw new Error(`Replay fehlgeschlagen (${res.failed.length}): ${res.failed[0].id} ${res.failed[0].day}: ${res.failed[0].error}`);
  return res;
}

/** Scores one set. `ids` = every model, `pairs` = [[a, b]]; returns the raw accumulators plus the physics of `physicsOf`. */
export function scoreSet(proto, w1, issues, ids, pairs, { ripeOnly = false, special = [], physicsOf = null, physicsOfChampion = null, providers = null } = {}) {
  const truthOf = (issue) => truthOfIssue(proto, w1, issue);
  const provs = providers ?? ids.map((id) => providerOf(proto, id, w1, truthOf));
  for (const p of provs) if (p.prepare) p.prepare(issues);
  // the climatology first: the extremes of every other model read its 0,9 quantile
  provs.sort((a, b) => (a.id === 'ref-klima' ? -1 : b.id === 'ref-klima' ? 1 : 0));
  const physics = newPhysics(), physicsChampion = newPhysics();
  const res = scoreRun(proto, w1, issues, provs, pairs, { ripeOnly, special, onIssue: physicsOf ? (issue, ctx) => { const b = ctx.get(physicsOf); if (b) physicsOfBlock(proto, b, physics); const h = physicsOfChampion ? ctx.get(physicsOfChampion) : null; if (h) physicsOfBlock(proto, h, physicsChampion); } : null });
  res.physics = physics; res.physicsChampion = physicsChampion;
  return res;
}

function modelSummary(proto, acc) {
  const cells = [];
  for (let v = 0; v < NVS; v++) for (let w = 0; w < proto.windows.length; w++) for (let land = 0; land < LANDS.length; land++) for (let role = 0; role < ROLES.length; role++) {
    const c = cellSummary(proto, acc, v, w, land, role);
    if (!c) continue;
    if (land !== 3) delete c.pit;
    cells.push({ var: SCORE_VARS[v], window: proto.windows[w].id, land: LANDS[land], role: ROLES[role], kern: isKern(proto, v, w), ...c });
  }
  const wet = [];
  for (let w = 0; w < proto.windows.length; w++) for (let role = 0; role < ROLES.length; role++) { const s = wetSummary(proto, acc, w, role); if (s) wet.push({ window: proto.windows[w].id, role: ROLES[role], ...s }); }
  const ms = acc.info.map((i) => i.pointMsMedian).filter((x) => x != null).sort((a, b) => a - b);
  return { issues: acc.issues, pointMsMedian: ms.length ? ms[Math.floor(ms.length / 2)] : null, cells, wet };
}
const kernFilled = (proto, acc) => { let n = 0; for (let v = 0; v < NVS; v++) for (let w = 0; w < proto.windows.length; w++) if (isKern(proto, v, w)) for (let role = 0; role < 2; role++) n += acc.cells[cellIndex(proto, v, w, 3, role) * F.N + F.n]; return n; };

function stationRows(proto, pa) {
  const out = [];
  proto.scored.forEach((s, i) => { for (let v = 0; v < NVS; v++) { const o = (i * NVS + v) * 3; if (pa.station[o + 2]) out.push([s.id, SCORE_VARS[v], r(pa.station[o] / pa.station[o + 2]), r(pa.station[o + 1] / pa.station[o + 2]), pa.station[o + 2]]); } });
  return out;
}
function specialSummary(proto, res) {
  const out = {};
  for (const [id, a] of res.special.pairs) {
    out[id] ??= {};
    out[id].heightPairs = [];
    ['t', 'td'].forEach((name, v) => [0, 1].forEach((inv) => [0, 1].forEach((far) => { const k = ((v * 2 + inv) * 2 + far) * 2; if (a[k + 1]) out[id].heightPairs.push({ var: name, inversion: !!inv, leads: far ? `> ${proto.leads.hourlyToH} h` : `≤ ${proto.leads.hourlyToH} h`, maeDelta: r(a[k] / a[k + 1], 3), n: a[k + 1] }); })));
  }
  for (const [id, a] of res.special.seams) {
    out[id] ??= {};
    out[id].seams = proto.seams.map((h, si) => ({ seamH: h, before: a[(si * 3) * 2 + 1] ? r(a[(si * 3) * 2] / a[(si * 3) * 2 + 1], 3) : null, across: a[(si * 3 + 1) * 2 + 1] ? r(a[(si * 3 + 1) * 2] / a[(si * 3 + 1) * 2 + 1], 3) : null, after: a[(si * 3 + 2) * 2 + 1] ? r(a[(si * 3 + 2) * 2] / a[(si * 3 + 2) * 2 + 1], 3) : null, n: a[(si * 3 + 1) * 2 + 1] }));
  }
  for (const [id, a] of res.special.interp) {
    out[id] ??= {};
    out[id].interpolation = ['t', 'td', 'ws', 'gust', 'precip', 'clct'].map((name, v) => ({ var: name, raster: a[(v * 2) * 2 + 1] ? r(a[(v * 2) * 2] / a[(v * 2) * 2 + 1], 4) : null, between: a[(v * 2 + 1) * 2 + 1] ? r(a[(v * 2 + 1) * 2] / a[(v * 2 + 1) * 2 + 1], 4) : null, nRaster: a[(v * 2) * 2 + 1], nBetween: a[(v * 2 + 1) * 2 + 1] })).filter((x) => x.nRaster || x.nBetween);
  }
  return out;
}

/**
 * The JSON summary of a scored set. `cand`/`champ` name the pair the gates read; every pair gets its index at role B
 * (and A), the candidate's pairs a scorecard.
 */
export function summarizeSet(proto, res, { cand = null, champ = null } = {}) {
  const out = { issues: res.meta.issues, days: res.meta.days, unripeSkipped: res.meta.unripeSkipped, unripeCounted: res.meta.unripeCounted, models: {}, pairs: {}, special: specialSummary(proto, res) };
  for (const [id, acc] of res.models) if (acc.issues) { out.models[id] = modelSummary(proto, acc); out.models[id].kernFilled = kernFilled(proto, acc); }
  for (const [key, pa] of res.pairs) {
    if (!pa.daily.size) continue;
    const e = { indexB: indexOfPair(proto, pa, 1), indexA: indexOfPair(proto, pa, 0) };
    if (pa.a === cand) { e.cardB = pairCard(proto, pa, 1, { withDaily: pa.b === champ }); if (pa.b === champ) { e.cardA = pairCard(proto, pa, 0); e.stations = stationRows(proto, pa); } else if (pa.b === 'ref-klima') e.stations = stationRows(proto, pa); }
    out.pairs[key] = e;
  }
  if (cand && champ && out.pairs[`${cand}|${champ}`]) {
    const pc = out.pairs[`${cand}|${champ}`];
    out.G2 = gateG2(proto, pc.cardB);
    out.G3 = res.models.get(cand)?.issues ? gateG3(proto, res.models.get(cand), res.models.get(champ)) : { status: 'nicht bewertbar', rows: [] };
    const gain = pc.indexA.value != null && pc.indexB.value != null ? pc.indexA.value - pc.indexB.value : null;
    out.overfit = { gainA: pc.indexA.value, gainB: pc.indexB.value, difference: r(gain), warning: gain != null && gain > proto.gates.overfit.margin };
  }
  return out;
}

/** Pairs every run needs: candidate against champion, predecessors and references; every version against the climatology. */
export function standardPairs(cand, champ, versions, refs) {
  const pairs = [];
  const add = (a, b) => { if (a && b && !pairs.some(([x, y]) => x === a && y === b)) pairs.push([a, b]); };
  add(cand, champ);
  for (const v of versions) if (v !== cand) add(cand, v);
  for (const x of refs) add(cand, x);
  for (const v of [...versions, ...refs]) add(v, 'ref-klima');
  return pairs;
}

/** G4 determinism: recomputes the candidate's block for the first issue of a set in a worker and compares the data bytes. */
export async function determinismCheck(proto, reg, issue, recompute) {
  const stored = readConserve(proto, modelHash(reg), issue);
  if (!stored) return { ok: false, detail: `keine Konserve für ${issue.day}` };
  const again = await recompute(reg, issue);
  const a = sha256(Buffer.from(stored.data.buffer, stored.data.byteOffset, stored.data.byteLength));
  return { ok: a === again, detail: `${issue.source} ${issue.day}: gespeichert ${a.slice(0, 12)}, zweiter Lauf ${String(again).slice(0, 12)}` };
}

// ── self-check (Konzept §14, plan PS-3-7) ──────────────────────────────────────────────────────────────────────────
export function selfCheck(proto, w1, issues, champId, { ripeOnly = false } = {}) {
  const sc = proto.selfcheck, truthOf = (issue) => truthOfIssue(proto, w1, issue);
  const partner = listRegister().some((x) => x.id === sc.aa.partner && x.id !== champId) ? sc.aa.partner : sc.aa.partnerFallback;
  const derived = (id, transform) => ({ id, kind: 'abgeleitet', base: champId, transform });
  const regs = [derived('test-wahrheit', { truth: true }), derived('test-halb', { widen: sc.controls.halvedBands }), derived('test-rauschen', { noise: sc.controls.noise, seed: sc.aa.seed }), derived('test-leck', { leak: true })];
  const ids = ['ref-klima', champId, partner];
  const providers = [...new Set(ids)].map((id) => providerOf(proto, id, w1, truthOf));
  return import('./modelle.mjs').then(({ derivedProvider }) => {
    for (const g of regs) providers.push(derivedProvider(proto, g));
    const pairs = [[champId, partner], ['test-rauschen', champId], ['test-leck', champId], ['test-halb', champId], ['ref-klima', 'ref-klima'], ['test-wahrheit', 'ref-klima']];
    const res = scoreSet(proto, w1, issues, null, pairs, { ripeOnly, providers });
    const controls = [];
    // 1 the truth as a version scores 0 in every cell
    let maxTruth = 0; const tw = res.models.get('test-wahrheit');
    for (let c = 0; c < tw.cells.length / F.N; c++) maxTruth = Math.max(maxTruth, tw.cells[c * F.N + F.s]);
    controls.push({ name: 'Wahrheit als Version ⇒ Score 0', ok: tw.issues > 0 && maxTruth < 1e-9, detail: `größte Score-Summe einer Zelle ${maxTruth}` });
    // 2 the climatology against itself has a quality index of exactly 0
    const kk = indexOfPair(proto, res.pairs.get('ref-klima|ref-klima'), 1);
    controls.push({ name: 'Klimatologie ⇒ Güteindex 0', ok: kk.value === 0, detail: `Güteindex ${kk.value} über ${kk.cells} Zellen` });
    // 3 halved bands fail G3
    const g3 = gateG3(proto, res.models.get('test-halb'), res.models.get(champId));
    controls.push({ name: 'halbierte Bänder ⇒ G3 rot', ok: g3.status === 'rot', detail: `G3 ${g3.status}; ${g3.rows.filter((x) => x.red).length} von ${g3.rows.length} Zellen rot` });
    // 4 noise fails G2
    const g2 = gateG2(proto, pairCard(proto, res.pairs.get(`test-rauschen|${champId}`), 1));
    controls.push({ name: 'Rauschen ⇒ G2 rot', ok: g2.status === 'rot', detail: `G2 ${g2.status}; ${g2.worse.length} von ${g2.tested} Kernzellen signifikant schlechter` });
    // 5 a model that knows the truth at role A raises the over-fitting warning
    const lk = res.pairs.get(`test-leck|${champId}`), ia = indexOfPair(proto, lk, 0).value, ib = indexOfPair(proto, lk, 1).value;
    controls.push({ name: 'Leck-Modell ⇒ Überanpassungs-Warnung', ok: ia != null && ib != null && ia - ib > proto.gates.overfit.margin, detail: `Gewinn an A ${ia}, an B ${ib}` });

    // A/A by block sign flips of the daily differences champion − partner
    const pa = res.pairs.get(`${champId}|${partner}`), st = proto.statistics, rnd = lcg(sc.aa.seed);
    const cells = [];
    for (let v = 0; v < NVS; v++) for (let w = 0; w < proto.windows.length; w++) if (isKern(proto, v, w)) for (let land = 0; land < 3; land++) {
      const ci = cellIndex(proto, v, w, land, 1) * 3, d = [];
      for (const day of [...pa.daily.keys()].sort()) { const x = pa.daily.get(day); if (x[ci + 2]) d.push((x[ci] - x[ci + 1]) / x[ci + 2]); }
      if (d.length >= st.minDays) cells.push({ key: `${SCORE_VARS[v]}|${proto.windows[w].id}|${LANDS[land]}`, d });
    }
    let tests = 0, rejects = 0;
    const perCell = cells.map(() => 0), perRep = [];
    for (let rep = 0; rep < sc.aa.repetitions; rep++) {
      let rr = 0;
      cells.forEach((c, i) => {
        const n = c.d.length, blk = blockLength(n), x = new Array(n);
        let sign = 1;
        for (let t = 0; t < n; t++) { if (t % blk === 0) sign = rnd() < 0.5 ? -1 : 1; x[t] = sign * c.d[t]; }
        const p = pairedTest(x, st.alpha, st.power).pTwoSided;
        tests += 1; if (p < st.alpha) { rejects += 1; perCell[i] += 1; rr += 1; }
      });
      perRep.push(cells.length ? rr / cells.length : 0);
    }
    perRep.sort((a, b) => a - b);
    const rate = tests ? rejects / tests : null;
    const aa = { partner, cells: cells.length, days: cells.length ? Math.max(...cells.map((c) => c.d.length)) : 0, repetitions: sc.aa.repetitions, nominal: st.alpha, rate: r(rate, 4), perCellMin: cells.length ? r(Math.min(...perCell) / sc.aa.repetitions, 4) : null, perCellMax: cells.length ? r(Math.max(...perCell) / sc.aa.repetitions, 4) : null, perRepP05: r(perRep[Math.floor(0.05 * (perRep.length - 1))], 4), perRepP95: r(perRep[Math.floor(0.95 * (perRep.length - 1))], 4), maxRate: sc.aa.maxRate, ok: rate != null && rate <= sc.aa.maxRate };
    return { ok: aa.ok && controls.every((c) => c.ok), aa, controls, issues: res.meta.issues, hash: hashOf({ aa, controls }) };
  });
}
