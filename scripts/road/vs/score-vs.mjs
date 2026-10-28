#!/usr/bin/env node
/**
 * AW-6.2.8 — the test stand of the virtual road sensor (`audit/autobahnwetter.md` §20.14): scores the archived shadow runs
 * (`buscosun-archiv/road/vs/v1`) against the GMA archive (`road/v1/<day>/{00,12}.json.gz`) and the SWSMOS archive
 * (`swsmos/v1/<day>/<HH>.json.gz`). Everything is computed by this script, nothing is read off a plot.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/vs/score-vs.mjs
 *     --vs=<archiv>/road/vs/v1 --gma=<archiv>/road/v1 [--swsmos=<archiv>/swsmos/v1] [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] [--out=<json>] [--cv=5]
 *
 * Road temperature: bias, MAE, RMSE, share within ±1 / ±2 K per lead 0/1/3/6/12/24/48 h, by day/night, weather class, bridge,
 * cold start — against persistence (the GMA value at the measuring hour), SWSMOS TS (newest run ≤ t0), ICON T_G and T2m, each
 * on the SAME pairs where the baseline exists. Hours the product marks `gemessen` are not forecasts and do not count.
 * Ts ≤ 0 °C and ice/rime: POD/FAR/CSI only for observed Ts in −3 … +1 °C, against persistence and SWSMOS (TS ≤ 0; RC 3–6).
 * Condition: contingency model class group × GMA class letter. Water film: MAE in µm at the measuring hour (shadow pairs).
 * Visibility: Brier per threshold and a 10-bin reliability from the product's probabilities at the measuring hour.
 * Site correction: station-grouped K-fold on the shadow pairs — residual table learned on K−1 folds, MAE on the held-out fold.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { learnResiduals, stationCorrection, weatherClassOf } from '../../../src/road/vs/roadVsCouple.ts';
import { roadVsDecode } from '../../../src/road/vs/roadVsForcing.ts';
import { roadVsProductDecode, ROAD_VS_SRC } from '../../../src/road/vs/roadVsProduct.ts';
import { roadStampToMs } from '../../../src/road/roadContract.ts';

const H = 3_600_000;
export const VS_SCORE_LEADS = Object.freeze([0, 1, 3, 6, 12, 24, 48]);
export const VS_SCORE_EVENT_WINDOW_C = Object.freeze({ lo: -3, hi: 1 });
export const VS_SCORE_ICE_MODEL_CODES = Object.freeze([3, 4, 6, 7]);
export const VS_SCORE_SWSMOS_ICE_RC = Object.freeze([3, 4, 5, 6]);
const VIS_X = [1000, 300, 150, 50];
const isNight = (ms) => { const h = new Date(ms).getUTCHours(); return h >= 19 || h < 4; };
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);

// --- Readers --------------------------------------------------------------------------------------

const readGzJson = (f) => JSON.parse(gunzipSync(readFileSync(f)).toString('utf8'));
const days = (dir, from, to) => (existsSync(dir) ? readdirSync(dir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && (!from || d >= from) && (!to || d <= to)).sort() : []);

export function readVsRuns(dir, from, to) {
  const out = [];
  for (const d of days(dir, from, to)) for (const f of readdirSync(join(dir, d)).filter((x) => /^\d{10}\.json\.gz$/.test(x))) { try { out.push(readGzJson(join(dir, d, f))); } catch { /* skipped */ } }
  return out;
}
/** GMA lookup `(id, validMs) → { rs, k }` from the half-day files. */
export function readGmaLookup(dir, from, to) {
  const m = new Map();
  for (const d of days(dir, from, to)) for (const half of ['00', '12']) {
    const f = join(dir, d, `${half}.json.gz`);
    if (!existsSync(f)) continue;
    let doc; try { doc = readGzJson(f); } catch { continue; }
    const slotsMs = doc.slots.map((s) => roadStampToMs(s));
    for (const [id, st] of Object.entries(doc.stations)) for (let i = 0; i < slotsMs.length; i++) if (st.rs[i] != null) m.set(`${id}|${slotsMs[i]}`, { rs: Number(st.rs[i]), k: st.k?.[i] ?? '-' });
  }
  return { lookup: (id, ms) => m.get(`${id}|${ms}`) ?? null, size: m.size };
}
/** SWSMOS lookup `(id, validMs, t0Ms) → { ts, rc }` from the newest run ≤ t0. */
export function readSwsmosLookup(dir, from, to) {
  const runs = [];
  for (const d of days(dir, from, to)) for (const f of readdirSync(join(dir, d)).filter((x) => /^\d{2}\.json\.gz$/.test(x))) { try { const doc = readGzJson(join(dir, d, f)); runs.push(doc); } catch { /* skipped */ } }
  runs.sort((a, b) => a.runMs - b.runMs);
  return {
    lookup: (id, ms, t0Ms) => {
      let run = null;
      for (let i = runs.length - 1; i >= 0; i--) if (runs[i].runMs <= t0Ms) { run = runs[i]; break; }
      if (!run) return null;
      const lead = Math.round((ms - run.runMs) / H);
      const st = run.stations[id];
      if (!st || lead < 1 || lead > run.leads) return null;
      const ts = st.ts[lead - 1];
      return ts == null ? null : { ts: ts / (run.scale?.ts ?? 10), rc: st.rc[lead - 1] };
    },
    runs: runs.length,
  };
}

// --- Scoring (pure) -------------------------------------------------------------------------------

const newAcc = () => ({ n: 0, sum: 0, abs: 0, sq: 0, w1: 0, w2: 0 });
const addAcc = (a, e) => { a.n++; a.sum += e; a.abs += Math.abs(e); a.sq += e * e; if (Math.abs(e) <= 1) a.w1++; if (Math.abs(e) <= 2) a.w2++; };
const finAcc = (a) => (a.n ? { n: a.n, bias: r2(a.sum / a.n), mae: r2(a.abs / a.n), rmse: r2(Math.sqrt(a.sq / a.n)), within1: r3(a.w1 / a.n), within2: r3(a.w2 / a.n) } : { n: 0 });
const newCont = () => ({ hit: 0, miss: 0, false: 0, correctNeg: 0 });
const finCont = (c) => ({ ...c, pod: r3(c.hit + c.miss ? c.hit / (c.hit + c.miss) : NaN), far: r3(c.hit + c.false ? c.false / (c.hit + c.false) : NaN), csi: r3(c.hit + c.miss + c.false ? c.hit / (c.hit + c.miss + c.false) : NaN) });
const addCont = (c, fc, ob) => { if (fc && ob) c.hit++; else if (!fc && ob) c.miss++; else if (fc && !ob) c.false++; else c.correctNeg++; };
const kGroup = (k) => (k === 'd' ? 'trocken' : k === 'w' ? 'nass' : k === 'f' ? 'frost' : k === 'i' ? 'eis' : null);
const modelGroup = (code) => (code == null ? null : code === 0 ? 'trocken' : code <= 2 ? 'nass' : code === 3 ? 'reif' : 'eis');

export function scoreVs({ runs, gma, swsmos = null, cvFolds = 5 }) {
  const temp = {};   // key = `${stratum}|${lead}|${model|persist|swsmos|tg|t2m}` → acc
  const acc = (key) => (temp[key] ??= newAcc());
  const events = { ts0: {}, ice: {} };
  const ev = (group, who, lead) => (events[group][`${who}|${lead}`] ??= newCont());
  const contingency = {};
  const film = newAcc();
  const vis = VIS_X.map(() => ({ brier: 0, n: 0, bins: Array.from({ length: 10 }, () => ({ n: 0, p: 0, o: 0 })) }));
  const shadowAll = [];
  let pairs = 0;
  for (const run of runs) {
    const t0 = run.t0Ms;
    const obsHour = new Map((run.shadow ?? []).map((s) => [s.id, s]));
    for (const [id, st] of Object.entries(run.stations)) {
      const sh = obsHour.get(id) ?? null;
      const fp = run.forcing?.points?.[id] ?? null;
      for (const lead of VS_SCORE_LEADS) {
        if (lead >= run.steps) continue;
        const ms = t0 + lead * H;
        const tfRaw = st.v.tf?.[lead];
        const src = st.v.tf_src?.[lead];
        if (tfRaw == null || src === ROAD_VS_SRC.gemessen || src === ROAD_VS_SRC.unbekannt) continue;
        const ob = gma(id, ms);
        if (!ob || !Number.isFinite(ob.rs)) continue;
        const tf = roadVsProductDecode('tf', tfRaw);
        const f = fp ? { ff: Math.hypot(roadVsDecode('u10', fp.u10?.[lead]) ?? 0, roadVsDecode('v10', fp.v10?.[lead]) ?? 0), clct: roadVsDecode('clct', fp.clct?.[lead]), rain: roadVsDecode('prr', fp.prr?.[lead]) ?? 0, snow: roadVsDecode('prs', fp.prs?.[lead]) ?? 0, frz: roadVsDecode('frz', fp.frz?.[lead]) ?? 0 } : null;
        const cls = f ? weatherClassOf(f) : 'unbekannt';
        const strata = ['alle', isNight(ms) ? 'nacht' : 'tag', `klasse:${cls}`, st.bridge ? 'bruecke' : 'strecke', st.kaltstart ? 'kaltstart' : 'eingeschwungen'];
        const base = {
          model: tf,
          persist: sh && lead >= sh.hObs ? sh.obsTs : null,
          swsmos: swsmos ? swsmos(id, ms, t0)?.ts ?? null : null,
          tg: fp ? roadVsDecode('tg', fp.tg?.[lead]) : null,
          t2m: fp ? roadVsDecode('t2m', fp.t2m?.[lead]) : null,
        };
        for (const s of strata) for (const [who, val] of Object.entries(base)) if (val != null) addAcc(acc(`${s}|${lead}|${who}`), val - ob.rs);
        pairs++;
        // Events in the window.
        if (ob.rs >= VS_SCORE_EVENT_WINDOW_C.lo && ob.rs <= VS_SCORE_EVENT_WINDOW_C.hi) {
          const obsCold = ob.rs <= 0;
          for (const [who, val] of Object.entries(base)) if (val != null) addCont(ev('ts0', who, lead), val <= 0, obsCold);
          const obsIce = ob.k === 'i';
          addCont(ev('ice', 'model', lead), VS_SCORE_ICE_MODEL_CODES.includes(st.v.zustand?.[lead]), obsIce);
          if (sh && lead >= sh.hObs) { const pk = gma(id, t0 + sh.hObs * H)?.k; if (pk) addCont(ev('ice', 'persist', lead), pk === 'i', obsIce); }
          if (swsmos) { const sw = swsmos(id, ms, t0); if (sw && sw.rc != null) addCont(ev('ice', 'swsmos', lead), VS_SCORE_SWSMOS_ICE_RC.includes(sw.rc), obsIce); }
        }
        // Contingency of the class groups.
        const mg = modelGroup(st.v.zustand?.[lead]), og = kGroup(ob.k);
        if (mg && og) { const key = `${lead}|${mg}|${og}`; contingency[key] = (contingency[key] ?? 0) + 1; }
      }
      // Measuring hour: film and visibility.
      if (sh) {
        shadowAll.push(sh);
        if (sh.obsWf != null && sh.modelWater != null) addAcc(film, (sh.modelWater - sh.obsWf) * 1000);
        if (sh.obsVis != null) VIS_X.forEach((x, i) => {
          const p = roadVsProductDecode(`vis_p${x}`, st.v[`vis_p${x}`]?.[sh.hObs]);
          if (p == null) return;
          const pr = p / 100, o = sh.obsVis < x ? 1 : 0;
          vis[i].brier += (pr - o) ** 2; vis[i].n++;
          const b = Math.min(9, Math.floor(pr * 10)); vis[i].bins[b].n++; vis[i].bins[b].p += pr; vis[i].bins[b].o += o;
        });
      }
    }
  }
  // Station-grouped K-fold of the site correction on the shadow pairs (measuring hour).
  const cv = [];
  const ids = [...new Set(shadowAll.filter((s) => !s.coldStart && s.cls).map((s) => s.id))].sort();
  if (ids.length >= cvFolds && cvFolds > 1) {
    for (let k = 0; k < cvFolds; k++) {
      const test = new Set(ids.filter((_, i) => i % cvFolds === k));
      const train = shadowAll.filter((s) => !s.coldStart && s.cls && !test.has(s.id)).map((s) => ({ station: s.id, validMs: s.validMs, cls: s.cls, residualK: s.residualK }));
      const tab = learnResiduals(train, 'cv');
      // Held-out stations have no own cell by construction; the station correction is therefore 0 — the fold measures what a
      // station-specific table CANNOT transfer. A pooled hour × class mean (all training stations) is the transferable part.
      const pooled = {};
      for (const p of train) { const key = `${new Date(p.validMs).getUTCHours()}:${p.cls}`; (pooled[key] ??= []).push(p.residualK); }
      const pooledMean = Object.fromEntries(Object.entries(pooled).map(([key, a]) => [key, a.reduce((s, x) => s + x, 0) / a.length]));
      const raw = newAcc(), corr = newAcc();
      for (const s of shadowAll) {
        if (!test.has(s.id) || s.coldStart || !s.cls) continue;
        addAcc(raw, s.residualK);
        const key = `${new Date(s.validMs).getUTCHours()}:${s.cls}`;
        const k2 = stationCorrection(tab, s.id, s.validMs, s.cls).k || (pooledMean[key] ?? 0);
        addAcc(corr, s.residualK - k2);
      }
      cv.push({ fold: k, stations: test.size, raw: finAcc(raw), corrected: finAcc(corr) });
    }
  }
  const tempOut = {};
  for (const [key, a] of Object.entries(temp)) { const [s, lead, who] = key.split('|'); ((tempOut[s] ??= {})[lead] ??= {})[who] = finAcc(a); }
  const evOut = {};
  for (const g of ['ts0', 'ice']) { evOut[g] = {}; for (const [key, c] of Object.entries(events[g])) { const [who, lead] = key.split('|'); (evOut[g][lead] ??= {})[who] = finCont(c); } }
  return {
    runs: runs.length, pairs, temperature: tempOut, events: evOut, contingency,
    film: film.n ? { n: film.n, maeUm: r2(film.abs / film.n), biasUm: r2(film.sum / film.n) } : { n: 0 },
    visibility: VIS_X.map((x, i) => ({ thresholdM: x, n: vis[i].n, brier: vis[i].n ? r3(vis[i].brier / vis[i].n) : null, reliability: vis[i].bins.map((b, j) => ({ bin: j / 10, n: b.n, meanP: b.n ? r3(b.p / b.n) : null, obsFreq: b.n ? r3(b.o / b.n) : null })) })),
    cv: { folds: cv.length, perFold: cv, meanRawMae: cv.length ? r2(cv.reduce((s, f) => s + (f.raw.mae ?? 0), 0) / cv.length) : null, meanCorrectedMae: cv.length ? r2(cv.reduce((s, f) => s + (f.corrected.mae ?? 0), 0) / cv.length) : null },
  };
}

/** Short German summary for the audit. */
export function summaryText(sc) {
  const lines = [`Läufe ${sc.runs}, Paare ${sc.pairs}`];
  for (const lead of VS_SCORE_LEADS) {
    const t = sc.temperature.alle?.[lead];
    if (!t) continue;
    const f = (w) => (t[w]?.n ? `${w} MAE ${t[w].mae} (n ${t[w].n})` : `${w} —`);
    lines.push(`+${lead} h: ${['model', 'persist', 'swsmos', 'tg', 't2m'].map(f).join(' · ')}`);
  }
  for (const lead of VS_SCORE_LEADS) { const e = sc.events.ts0?.[lead]?.model; if (e && e.hit + e.miss) lines.push(`Ts ≤ 0 +${lead} h: POD ${e.pod} FAR ${e.far} CSI ${e.csi} (Ereignisse ${e.hit + e.miss})`); }
  lines.push(`Film: ${sc.film.n ? `MAE ${sc.film.maeUm} µm (n ${sc.film.n})` : 'keine Paare'}`);
  lines.push(`Sicht Brier: ${sc.visibility.map((v) => `<${v.thresholdM} m ${v.brier ?? '—'} (n ${v.n})`).join(', ')}`);
  lines.push(`Standortkorrektur CV: roh ${sc.cv.meanRawMae ?? '—'} → korrigiert ${sc.cv.meanCorrectedMae ?? '—'} K MAE über ${sc.cv.folds} Falten`);
  return lines.join('\n');
}

async function main() {
  const flags = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
  if (!flags.vs || !flags.gma) { console.error('--vs=<archiv>/road/vs/v1 und --gma=<archiv>/road/v1 fehlen'); process.exit(2); }
  const runs = readVsRuns(flags.vs, flags.from, flags.to);
  const g = readGmaLookup(flags.gma, flags.from, flags.to);
  const s = flags.swsmos ? readSwsmosLookup(flags.swsmos, flags.from, flags.to) : null;
  const sc = scoreVs({ runs, gma: g.lookup, swsmos: s?.lookup ?? null, cvFolds: flags.cv ? Number(flags.cv) : 5 });
  console.log(`[vs-score] VS-Läufe ${runs.length}, GMA-Werte ${g.size}, SWSMOS-Läufe ${s?.runs ?? 0}`);
  console.log(summaryText(sc));
  if (flags.out) { mkdirSync(dirname(flags.out), { recursive: true }); writeFileSync(flags.out, JSON.stringify(sc, null, 1)); console.log(`[vs-score] → ${flags.out}`); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
