/**
 * ex-wind-family.mjs — phase EX (`audit/fusion-expertenbericht-2026-09-29.md` §4.4), proposal 18 of the expert report:
 * does the station value of wind and gust score better as a TRUNCATED normal (renormalised on [0, ∞), no atom) than as the
 * CENSORED normal `stackDist` writes today (atom at 0)?
 *
 * Same rows, same fit, same leave-day-out parameters as `stack-score.mjs` (mode S, candidate `stack`): per row the
 * parameters of the valid day's fold, μ = the unbounded station value, σ = the residual rms of the fit. Three
 * distributions on the same (μ, σ):
 *   censored    { censoredNormal, μ, σ, 0, 90 }              — today
 *   truncated   { truncatedNormal, μ, σ, lo 0 }              — the proposal, parameters unchanged
 *   truncated*  { truncatedNormal, μ, s·σ, lo 0 }, s per (variable, bin) by CRPS on the OTHER days (grid 0,7 … 1,5)
 * Paired by issue day (Diebold–Mariano, small-sample form). Writes nothing but the card.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fusionfit/ex-wind-family.mjs
 *       --rows=<root>/score/2026-09-28-fs/rows.jsonl.gz --out=<root>/score/2026-09-29-ex/wind-family.json
 */
import { createReadStream, writeFileSync, mkdirSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { dirname } from 'node:path';
import { parseArgs, codeHash } from '../hindcast/lib/common.mjs';
import { scoreDist } from './lib/distScore.mjs';
import { ScoreAcc, PairAcc } from './lib/stats.mjs';
import { FoldSums, FORMS, formOf, tauGroup, stackValue } from './lib/stackFit.mjs';
import { quantileOf, meanOf } from '../../src/pointForecast/fusion/dist.ts';
import { binIndex } from '../../src/point/fusionFit/strata.ts';
import { lcg } from '../../src/point/calibFit.ts';

const flags = parseArgs(process.argv.slice(2));
if (typeof flags.rows !== 'string' || typeof flags.out !== 'string') throw new Error('--rows und --out sind Pflicht');
const say = (s) => console.log(`[ex-wind-family] ${s}`);
const VARS = ['ws', 'gust'];
const VAR_IDX = { ws: 2, gust: 3 };
const BIN_LABEL = ['0–6', '7–24', '25–48', '51–120', '126–240', '246–336'];
const SCALES = [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.5];
const num = (x) => (x != null && Number.isFinite(x) ? x : null);
const pointOf = (d) => (d.kind === 'normal' ? d.mu : d.kind === 'rice' || d.kind === 'truncatedNormal' ? meanOf(d) : quantileOf(d, 0.5));
const getOr = (m, k, mk) => { let a = m.get(k); if (!a) { a = mk(); m.set(k, a); } return a; };
const pitDraw = (id, V, v) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; const g = lcg((h * 1_000_003 + V * 7919 + VAR_IDX[v] * 104_729) >>> 0); g(); return g(); };

async function* rowsOf(path) {
  const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) { if (!line) continue; yield JSON.parse(line); }
}
/** As `fitInputs` of stack-score.mjs, mode S. */
function fitInputs(row, v) {
  const o = row.v[v], m = o?.S;
  const M = num(m?.M);
  if (M == null) return null;
  const I = num(m.I), tau = I != null ? row.tS : null;
  const Ld = o.Lc ?? o.L;
  const Lp = Ld ? pointOf(Ld) : null;
  const D = Lp != null && Number.isFinite(Lp) ? Lp - M : null;
  return { M, y: o.y, r: o.y - M, I: I != null && tau != null ? I : null, D, g: tauGroup(I != null && tau != null ? tau : row.lead), gl: tauGroup(row.lead) };
}

// pass A — the sums of the fit (as stack-score.mjs)
const sums = new FoldSums();
let nRows = 0;
for await (const row of rowsOf(flags.rows)) {
  if (row.kind) continue;
  nRows += 1;
  const vd = Math.floor(row.V / 24);
  for (const v of VARS) {
    const f = fitInputs(row, v);
    if (!f || f.g < 0) continue;
    const forms = f.I != null ? ['A', 'AB', ...(f.D != null ? ['S'] : [])] : [];
    for (const form of forms) sums.add(`S|${v}|${f.g}|${form}`, vd, FORMS[form].x(f.I, f.D), f.r);
    if (f.gl >= 0) for (const form of ['B', ...(f.D != null ? ['S0'] : [])]) sums.add(`S|${v}|${f.gl}|${form}`, vd, FORMS[form].x(null, f.D), f.r);
  }
}
say(`${nRows} Zeilen, ${sums.byKey.size} Fit-Schlüssel`);

// pass B — per row the three distributions; the CRPS of every scale per issue day for the out-of-day choice of s
const acc = new Map(), pairs = new Map();
const byScale = new Map();     // `${v}|${bin}` → Map<day, Float64Array(SCALES.length + 1)> (sum of CRPS per scale, last = n)
const zero = new Map();        // `${v}|${bin}` → { n, y0, massCens, massBelow }
const keep = [];               // rows for the second look (the scaled candidate needs the choice first)
for await (const row of rowsOf(flags.rows)) {
  if (row.kind) continue;
  const vd = Math.floor(row.V / 24), bin = binIndex(row.lead);
  for (const v of VARS) {
    const f = fitInputs(row, v);
    if (!f || f.g < 0) continue;
    const form = formOf('stack', f.I, f.D);
    const x = FORMS[form].x(f.I, f.D), key = `S|${v}|${form === 'B' || form === 'S0' ? f.gl : f.g}|${form}`;
    const fit = sums.fit(key, vd);
    if (!fit) continue;
    const mu = stackValue(f.M, x, fit.beta, false), sigma = Math.max(1e-3, fit.sigma ?? 1), y = f.y, u = pitDraw(row.id, row.V, v);
    const k = `${v}|${bin}`;
    const cens = scoreDist({ kind: 'censoredNormal', mu, sigma, lo: 0, hi: 90 }, y, u);
    const trun = scoreDist({ kind: 'truncatedNormal', mu, sigma, lo: 0 }, y, u);
    if (!cens || !trun) continue;
    getOr(acc, `${k}|censored`, () => new ScoreAcc()).add(cens.point - y, cens.crps, cens.pit, cens.sigma, cens.sd);
    getOr(acc, `${k}|truncated`, () => new ScoreAcc()).add(trun.point - y, trun.crps, trun.pit, trun.sigma, trun.sd);
    getOr(pairs, `${k}|truncated|censored`, () => new PairAcc()).add(row.d, trun.crps, cens.crps);
    const z = getOr(zero, k, () => ({ n: 0, y0: 0, below: 0 }));
    z.n += 1; if (!(y > 0)) z.y0 += 1; if (mu < 0) z.below += 1;
    const days = getOr(byScale, k, () => new Map());
    const s = getOr(days, row.d, () => new Float64Array(SCALES.length + 1));
    for (let i = 0; i < SCALES.length; i++) { const r = scoreDist({ kind: 'truncatedNormal', mu, sigma: SCALES[i] * sigma, lo: 0 }, y, u); if (r) s[i] += r.crps; }
    s[SCALES.length] += 1;
    keep.push([k, row.d, mu, sigma, y, u, cens.crps]);
  }
}
// the scale of a day = the CRPS minimum over all OTHER issue days of the cell
const scaleOf = new Map();
for (const [k, days] of byScale) {
  const tot = new Float64Array(SCALES.length);
  for (const s of days.values()) for (let i = 0; i < SCALES.length; i++) tot[i] += s[i];
  for (const [d, s] of days) {
    let best = 0, bestV = Infinity;
    for (let i = 0; i < SCALES.length; i++) { const v = tot[i] - s[i]; if (v < bestV) { bestV = v; best = i; } }
    scaleOf.set(`${k}|${d}`, SCALES[best]);
  }
}
const chosen = new Map();
for (const [k, d, mu, sigma, y, u, censCrps] of keep) {
  const s = scaleOf.get(`${k}|${d}`);
  const r = scoreDist({ kind: 'truncatedNormal', mu, sigma: s * sigma, lo: 0 }, y, u);
  if (!r) continue;
  getOr(acc, `${k}|truncated*`, () => new ScoreAcc()).add(r.point - y, r.crps, r.pit, r.sigma, r.sd);
  getOr(pairs, `${k}|truncated*|censored`, () => new PairAcc()).add(d, r.crps, censCrps);
  const c = getOr(chosen, k, () => new Map()); c.set(s, (c.get(s) ?? 0) + 1);
}

const card = { schema: 1, kind: 'fusionfit/ex-wind-family', builtAt: new Date().toISOString(), codeHash: codeHash(), rows: flags.rows, n: nRows, scales: SCALES, cells: {} };
const lines = ['| Größe | Bin (h) | n | y = 0 | μ < 0 | CRPS zensiert | CRPS gestutzt | Δ | p | CRPS gestutzt* (s) | Δ* | p* | MAE zens. / gest. | PIT-Rand zens. / gest. / gest.* |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
const f3 = (x) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(3));
const pc = (x) => (x == null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(1)} %`);
for (const v of VARS) for (let bin = 0; bin < BIN_LABEL.length; bin++) {
  const k = `${v}|${bin}`;
  const a = acc.get(`${k}|censored`)?.summary(), b = acc.get(`${k}|truncated`)?.summary(), c = acc.get(`${k}|truncated*`)?.summary();
  if (!a || !b) continue;
  const p1 = pairs.get(`${k}|truncated|censored`)?.summary(), p2 = pairs.get(`${k}|truncated*|censored`)?.summary();
  const z = zero.get(k);
  const sc = [...(chosen.get(k) ?? new Map())].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  card.cells[k] = { n: a.n, zeroShare: z.y0 / z.n, muBelowZero: z.below / z.n, censored: a, truncated: b, truncatedScaled: c ?? null, scale: sc, pair: p1 ?? null, pairScaled: p2 ?? null };
  lines.push(`| ${v === 'ws' ? 'Wind' : 'Böe'} | ${BIN_LABEL[bin]} | ${a.n} | ${pc(z.y0 / z.n)} | ${pc(z.below / z.n)} | ${f3(a.crps)} | ${f3(b.crps)} | ${pc(b.crps / a.crps - 1)} | ${f3(p1?.dm?.p)} | ${f3(c?.crps)} (${sc ?? '—'}) | ${pc(c ? c.crps / a.crps - 1 : null)} | ${f3(p2?.dm?.p)} | ${f3(a.mae)} / ${f3(b.mae)} | ${f3(a.pitOuter)} / ${f3(b.pitOuter)} / ${f3(c?.pitOuter)} |`);
}
mkdirSync(dirname(flags.out), { recursive: true });
writeFileSync(flags.out, JSON.stringify(card));
writeFileSync(flags.out.replace(/\.json$/, '.md'), `${lines.join('\n')}\n`);
say(`geschrieben ${flags.out}`);
console.log(lines.join('\n'));
