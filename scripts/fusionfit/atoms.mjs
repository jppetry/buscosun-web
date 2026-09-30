/**
 * atoms.mjs — phase AX, AX-4 (`audit/fusion-ausbau.md` §4; V-FV-10, V-FX-15): the two cloud atoms of the learning stage,
 * fitted and scored out of fold on the hindcast cases.
 *
 *   pass 1 (fit)    streams the case files; every row with a cloud truth (DE, oktas × 12,5 %) and a form-K situation feeds two
 *                   reservoirs per stratum `K|clct|<bin>|<cls>` (`HurdleRows`, Algorithm R): y_clear = truth ≤ 6,25 %,
 *                   y_overcast = truth ≥ 93,75 %, x = `atomsDesign` (cube cover, σ_div, harmonics, svf, lead fraction); the
 *                   reference probability per row is the censored normal's own atom mass with the OUT-OF-FOLD μ/σ of the
 *                   tables (`--tables`). Per stratum and side: damped Newton (pooled), exact fold β, out-of-fold Brier against
 *                   the reference ⇒ `written` / `no-skill` (`fitAtoms.ts`). Writes `--out` = the tables plus the `atoms` section.
 *   pass 2 (score)  streams again (own thinning): per row the cloud distribution of the fold tables WITHOUT atoms (the
 *                   censored normal — today's fl-K) and WITH the fold atoms (`cloudMix`); CRPS, MAE, PIT (randomised on the
 *                   atoms), spread, Brier and reliability of P(clear)/P(overcast); pairs by day (DM, HLN) per bin and layer.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fusionfit/atoms.mjs
 *       --tables=<fit 5e>/fusion.hindcast.json --out=<root>/fit/<date>-ax4/fusion.ax4.json --score=<root>/score/<date>-ax4/atoms.json
 *       [--decision=audit/fusion-ausbau/ax4-atoms.md] [--cases=…] [--features=…] [--months=2025-09,2026-09] [--stride=4] [--scoreStride=8]
 *       [--thin=hash] [--cap=250000] [--fitOnly=1]
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { HINDCAST_ROOT, parseArgs, codeHash } from '../hindcast/lib/common.mjs';
import { readCases } from './lib/casesio.mjs';
import { siteOf, prepareBatch, rowContext, ROW_COLUMNS, FIT_VARS } from './lib/rowFeatures.mjs';
import { thinSelect, parseThin } from './lib/thin.mjs';
import { ScoreAcc, PairAcc, BrierAcc, benjaminiHochberg } from './lib/stats.mjs';
import { scoreDist } from './lib/distScore.mjs';
import { predict } from '../../src/point/fusionFit/predict.ts';
import { validateTables } from '../../src/point/fusionFit/tables.ts';
import { atomsDesign, AT_NAMES } from '../../src/point/fusionFit/design.ts';
import { HurdleRows } from '../../src/point/fusionFit/fitPrecip.ts';
import { fitAtomsRows, atomsKey, ATOM_SIDES, ATOM_CLEAR_MAX, ATOM_OVERCAST_MIN } from '../../src/point/fusionFit/fitAtoms.ts';
import { stratumKey, timeFolds, STRATUM_MIN } from '../../src/point/fusionFit/strata.ts';
import { climaDesign, climaAt, C_DIM } from '../../src/point/fusionFit/fitClima.ts';
import { cdfOf } from '../../src/pointForecast/fusion/dist.ts';
import { lcg } from '../../src/point/calibFit.ts';

const H = 3_600_000;
const flags = parseArgs(process.argv.slice(2));
if (typeof flags.tables !== 'string' || typeof flags.out !== 'string') throw new Error('--tables und --out sind Pflicht');
const root = HINDCAST_ROOT;
const casesDir = typeof flags.cases === 'string' ? flags.cases : join(root, 'cases', 'v1');
const featPath = typeof flags.features === 'string' ? flags.features : join(root, 'features', 'points.v1.json');
const monthRange = typeof flags.months === 'string' ? flags.months.split(',') : null;
const stride = Math.max(1, Number(flags.stride) || 4), scoreStride = Math.max(1, Number(flags.scoreStride) || 8);
const thin = parseThin(flags.thin ?? 'hash');
const cap = Math.max(20000, Number(flags.cap) || 250000);
const fitOnly = flags.fitOnly === '1' || flags.fitOnly === true;
const say = (s) => console.log(`[atoms] ${s}`);

const tb = readFileSync(flags.tables);
const T = JSON.parse(tb.toString('utf8'));
{ const e = validateTables(T); if (e.length) throw new Error(`${flags.tables}: ${e.join('; ')}`); }
const tablesSha = createHash('sha256').update(tb).digest('hex');
const foldScheme = T.inputs?.foldScheme === 'half' ? 'half' : 'month';
const feat = JSON.parse(readFileSync(featPath, 'utf8'));
const files = [];
for (const m of readdirSync(casesDir).filter((d) => /^\d{4}-\d{2}$/.test(d)).sort()) {
  if (monthRange && (m < monthRange[0] || m > monthRange[1])) continue;
  for (const t of ['t1', 't2', 't3']) { const p = join(casesDir, m, `${t}.cas.gz`); if (existsSync(`${p}.meta.json`)) files.push({ month: m, tier: t, path: p }); }
}
say(`${files.length} Falldateien, Tabellen ${tablesSha.slice(0, 12)} (${foldScheme}), Reservoir ≤ ${cap}, Fit-Stride ${stride}, Score-Stride ${scoreStride} (${thin})`);

// ── shared: sites, fold tables, the form-K situation (the scorer's glue) ──────
let sites = null;
const prepareSites = (header) => { if (sites) return; sites = header.points.map((id) => (feat.byPoint[id] ? siteOf(feat.byPoint[id]) : null)); };
const foldCache = new Map();
const tablesForFold = (Tb, key) => {
  let c = foldCache.get(Tb); if (!c) { c = new Map(); foldCache.set(Tb, c); }
  if (c.has(key)) return c.get(key);
  const mean = {}, occurrence = {}, atoms = {};
  for (const [k, e] of Object.entries(Tb.mean)) mean[k] = e.folds?.[key] ? { ...e, beta: e.folds[key] } : e;
  for (const [k, e] of Object.entries(Tb.occurrence)) occurrence[k] = e.folds?.[key] ? { ...e, beta: e.folds[key] } : e;
  for (const [k, e] of Object.entries(Tb.atoms ?? {})) atoms[k] = e.folds?.[key] ? { ...e, beta: e.folds[key] } : e;
  const t = { ...Tb, mean, occurrence, ...(Tb.atoms ? { atoms } : {}) };
  c.set(key, t);
  return t;
};
const foldOf = (ctx) => (foldScheme === 'half' ? ctx.half : ctx.month);
const cxS = new Float64Array(C_DIM);
const muCOf = (site, v, x) => {
  const est = T.climaMu?.byPoint?.[site.id]?.[v];
  if (est) { let s = 0; for (let i = 0; i < C_DIM; i++) s += est[i] * x[i]; return s; }
  const pe = T.clima?.byPoint?.[site.id]?.[v] ?? T.clima?.pooled?.[`${site.band}|${site.country}`]?.[v];
  return pe && pe.status === 'written' ? climaAt(pe, x).mu : null;
};
const sitK = (ctx) => {
  climaDesign(ctx.validAtMs, ctx.site.site.lonDeg, cxS);
  const muC = {}; for (const v of FIT_VARS) muC[v] = muCOf(ctx.site, v, cxS);
  return { z: ctx.z, leadH: ctx.leadH, route: ctx.route, srcMask: ctx.srcMask, srcCount: ctx.srcCount, dhM: ctx.dhM, dTsfcK: ctx.dTsfcK, k: ctx.k, p: {}, sigDiv: ctx.sigDiv, sigEns: ctx.sigEns, wetShare: ctx.wetShareK, pDryCube: ctx.pDryCube, muC, band: ctx.site.band };
};
async function stream(label, keep, cb) {
  const T0 = Date.now(); let rows = 0, used = 0;
  for (const f of files) {
    const r = await readCases(f.path, { columns: ROW_COLUMNS, batchRows: 32768, onBatch: (cols, n, header) => {
      prepareSites(header);
      const b = prepareBatch(cols);
      for (let i = 0; i < n; i++) {
        rows += 1;
        if (!Number.isFinite(cols.obs_n[i]) || !keep(cols.validAtH[i], cols.pointIdx[i])) continue;
        const ctx = rowContext(b, i, sites, false);
        if (!ctx || ctx.y.clct == null || ctx.k.clct == null || !ctx.z) continue;
        used += 1; cb(ctx);
      }
    } });
    say(`${label}: ${f.month} ${f.tier} ${r.rows} Zeilen, ${used} genutzt · ${Math.round((Date.now() - T0) / 1000)} s`);
  }
  say(`${label} fertig: ${rows} Zeilen, ${used} mit Bewölkungswahrheit, ${Math.round((Date.now() - T0) / 1000)} s`);
}
const atomY = (y) => ({ clear: y <= ATOM_CLEAR_MAX ? 1 : 0, overcast: y >= ATOM_OVERCAST_MIN ? 1 : 0 });

// ── pass 1: the reservoirs and the fit ────────────────────────────────────────
const res = new Map();   // `${stratum}|${side}` → HurdleRows
const resOf = (k) => { let r = res.get(k); if (!r) { r = new HurdleRows(AT_NAMES.length, cap); res.set(k, r); } return r; };
let noRef = 0;
await stream('Fit', thinSelect(thin, stride), (ctx) => {
  const key = stratumKey('K', 'clct', ctx.bin, ctx.clsK);
  const pr = predict(tablesForFold(T, foldOf(ctx)), 'K', sitK(ctx), { cloudAtoms: false });
  const d = pr.dist.clouds;
  if (!d || d.kind !== 'censoredNormal') { noRef += 1; return; }
  const pRef = { clear: cdfOf(d, 0), overcast: 1 - cdfOf(d, 99.999999) };
  const x = atomsDesign(ctx.z, ctx.k.clct, ctx.sigDiv.clct ?? null);
  const ys = atomY(ctx.y.clct);
  for (const side of ATOM_SIDES) resOf(`${key}|${side}`).add(x, ys[side], foldOf(ctx), 1 - pRef[side], ctx.dayIdx);
});
const atoms = {};
{
  const T1 = Date.now();
  for (const [k, r] of res) {
    const [form, , bin, cls, side] = k.split('|');
    const e = fitAtomsRows(form, Number(bin), cls, side, r, timeFolds([...r.months].sort()), STRATUM_MIN);
    atoms[atomsKey('K', Number(bin), cls, side)] = e;
    say(`Atom ${k}: ${r.n} von ${r.offered} Zeilen, Anteil ${(e.share * 100).toFixed(1)} %, ${e.iterations} Newton, ${e.status}${e.cv ? `, oof Brier ${e.cv.brier} gegen zensiert ${e.cv.brierRef} (Skill ${e.cv.skill == null ? '—' : (e.cv.skill * 100).toFixed(1) + ' %'}, n ${e.cv.n}, ${e.cv.folds} Falten)` : ''}`);
  }
  say(`Atome: ${res.size} Einträge in ${Math.round((Date.now() - T1) / 1000)} s; ${noRef} Zeilen ohne zensierte Referenz`);
  res.clear();
}
const T4 = { ...T, atoms, notes: [...(T.notes ?? []), `Phase AX, AX-4 (${new Date().toISOString().slice(0, 10)}): Wolkenatome P(0) und P(100) je Stratum (fitAtoms.ts, atoms.mjs) auf den Tabellen ${tablesSha.slice(0, 12)}; Reservoir ≤ ${cap}, Fit-Stride ${stride} (${thin}); no-skill = kein Out-of-fold-Gewinn gegen die Atommasse der zensierten Normal.`] };
{ const e = validateTables(T4); if (e.length) throw new Error(`Ausgabe ungültig: ${e.join('; ')}`); }
mkdirSync(dirname(flags.out), { recursive: true });
writeFileSync(flags.out, JSON.stringify(T4));
const written = Object.values(atoms).filter((e) => e.status === 'written').length;
say(`geschrieben ${flags.out}: ${Object.keys(atoms).length} Atom-Einträge, ${written} geschrieben, ${Object.values(atoms).filter((e) => e.status === 'no-skill').length} no-skill, ${Object.values(atoms).filter((e) => e.status === 'too-short').length} zu kurz`);
if (fitOnly || typeof flags.score !== 'string') process.exit(0);

// ── pass 2: out-of-fold score, censored normal against the mixture ───────────
const BIN_LABEL = ['0–6', '7–24', '25–48', '51–120', '126–240', '246–336'];
const acc = new Map();     // `${cand}|${layer}` → ScoreAcc
const pairs = new Map();   // layer → PairAcc (crps mix against cens)
const pairsMae = new Map();
const brier = new Map();   // `${cand}|${side}|${layer}` → BrierAcc
const getOr = (m, k, mk) => { let a = m.get(k); if (!a) { a = mk(); m.set(k, a); } return a; };
const pitDraw = (ctx) => { const g = lcg((ctx.pointIdx * 1_000_003 + Math.round(ctx.validAtMs / H) * 7919 + 5 * 104_729) >>> 0); g(); return g(); };
let scoredRows = 0, mixRows = 0;
await stream('Score', thinSelect(thin, scoreStride), (ctx) => {
  const tf = tablesForFold(T4, foldOf(ctx));
  const sit = sitK(ctx);
  const dC = predict(tf, 'K', sit, { cloudAtoms: false }).dist.clouds;
  const dM = predict(tf, 'K', sit).dist.clouds;
  if (!dC || !dM) return;
  const y = ctx.y.clct, u = pitDraw(ctx);
  const sC = scoreDist(dC, y, u, 96), sM = scoreDist(dM, y, u, 96);
  if (!sC || !sM) return;
  scoredRows += 1; if (dM.kind === 'cloudMix') mixRows += 1;
  const layers = ['all', `bin:${ctx.bin}`, `route:${ctx.route}`, `month:${ctx.month}`, `band:${ctx.site.band}`];
  const ys = atomY(y);
  const pC = { clear: cdfOf(dC, 0), overcast: 1 - cdfOf(dC, 99.999999) }, pM = { clear: cdfOf(dM, 0), overcast: 1 - cdfOf(dM, 99.999999) };
  for (const L of layers) {
    getOr(acc, `cens|${L}`, () => new ScoreAcc()).add(sC.point - y, sC.crps, sC.pit, sC.sigma, sC.sd);
    getOr(acc, `mix|${L}`, () => new ScoreAcc()).add(sM.point - y, sM.crps, sM.pit, sM.sigma, sM.sd);
    getOr(pairs, L, () => new PairAcc()).add(ctx.dayIdx, sM.crps, sC.crps);
    getOr(pairsMae, L, () => new PairAcc()).add(ctx.dayIdx, Math.abs(sM.point - y), Math.abs(sC.point - y));
    for (const side of ATOM_SIDES) { getOr(brier, `cens|${side}|${L}`, () => new BrierAcc()).add(pC[side], ys[side]); getOr(brier, `mix|${side}|${L}`, () => new BrierAcc()).add(pM[side], ys[side]); }
  }
});
const cells = [];
const pAll = [];
for (const [L, pa] of pairs) {
  const sC = acc.get(`cens|${L}`).summary(), sM = acc.get(`mix|${L}`).summary(), pr = pa.summary(), pm = pairsMae.get(L).summary();
  const b = {}; for (const cand of ['cens', 'mix']) for (const side of ATOM_SIDES) b[`${cand}|${side}`] = brier.get(`${cand}|${side}|${L}`)?.summary() ?? null;
  cells.push({ layer: L, n: sC.n, days: pr?.days ?? 0, cens: sC, mix: sM, crpsSkill: pr?.skill ?? null, dm: pr?.dm ?? null, ci90: pr?.ci90 ?? null, maeSkill: pm?.skill ?? null, dmMae: pm?.dm ?? null, brier: b });
  if (pr?.dm && Number.isFinite(pr.dm.p)) pAll.push(pr.dm.p);
}
const bh = benjaminiHochberg(pAll);
let bi = 0; for (const c of cells) if (c.dm && Number.isFinite(c.dm.p)) { c.dm.pBH = bh[bi]; bi += 1; }
cells.sort((a, b) => a.layer.localeCompare(b.layer));
const card = { kind: 'fusionfit/atoms-score', schema: 1, builtAt: new Date().toISOString(), codeHash: codeHash(), tables: flags.tables, tablesSha, out: flags.out, foldScheme, stride, scoreStride, thin, cap, rows: scoredRows, mixRows, atoms: Object.fromEntries(Object.entries(atoms).map(([k, e]) => [k, { status: e.status, n: e.n, share: e.share, cv: e.cv ?? null }])), cells };
mkdirSync(dirname(flags.score), { recursive: true });
writeFileSync(flags.score, JSON.stringify(card));
const f3 = (x) => (x == null ? '—' : x.toFixed(3)), f1 = (x) => (x == null ? '—' : x.toFixed(1)), pct = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)} %`);
const word = (c) => (c.dm?.pBH == null ? '' : c.dm.pBH < 0.05 ? (c.crpsSkill > 0 ? '*' : '!') : '');
const md = ['# AX-4 — Bewölkung: zensierte Normal (fl-K heute) gegen die Zwei-Atome-Mischung „cloudMix" (out of fold)', '',
  `Karte ${card.builtAt.slice(0, 16)}Z · Tabellen ${tablesSha.slice(0, 12)} (${foldScheme}) · Atome aus ${Object.keys(atoms).length} Einträgen (${written} geschrieben) · ${scoredRows} Zeilen bewertet (${mixRows} davon mit Mischung), Score-Stride ${scoreStride} (${thin}). Skill = 1 − CRPS(mix)/CRPS(zensiert); * signifikant besser, ! signifikant schlechter (DM auf Tagesmitteln, HLN, BH über die Karte). PIT außen = Anteil der Ränder (Soll 0,20).`, '',
  '| Schicht | n | Tage | CRPS zens. | CRPS mix | Skill | MAE zens. | MAE mix | PIT außen zens. / mix | S/S zens. / mix | Brier klar zens. / mix | Brier bedeckt zens. / mix | Basisrate klar / bedeckt |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
for (const c of cells) {
  const lab = c.layer.startsWith('bin:') ? `Bin ${BIN_LABEL[Number(c.layer.slice(4))]} h` : c.layer;
  md.push(`| ${lab} | ${c.n} | ${c.days} | ${f3(c.cens.crps)} | ${f3(c.mix.crps)} | ${pct(c.crpsSkill)}${word(c)} | ${f3(c.cens.mae)} | ${f3(c.mix.mae)} | ${f3(c.cens.pitOuter)} / ${f3(c.mix.pitOuter)} | ${f3(c.cens.spreadSkill)} / ${f3(c.mix.spreadSkill)} | ${f3(c.brier['cens|clear']?.brier)} / ${f3(c.brier['mix|clear']?.brier)} | ${f3(c.brier['cens|overcast']?.brier)} / ${f3(c.brier['mix|overcast']?.brier)} | ${pct(c.brier['cens|clear']?.baseRate)} / ${pct(c.brier['cens|overcast']?.baseRate)} |`);
}
md.push('', '## Zuverlässigkeit der Atome (Schicht all, 10 Klassen: Vorhersage → beobachtete Häufigkeit)', '');
for (const side of ATOM_SIDES) for (const cand of ['cens', 'mix']) {
  const b = brier.get(`${cand}|${side}|all`)?.summary(); if (!b) continue;
  md.push(`- **${side} · ${cand}:** ${b.reliability.filter((r) => r.n > 0).map((r) => `${r.bin}: ${(r.fc * 100).toFixed(0)} → ${(r.obs * 100).toFixed(0)} % (n ${r.n})`).join(' · ')}`);
}
md.push('', '## Atome je Stratum', '', '| Stratum | Status | n | Anteil | oof Brier | Referenz | Skill |', '|---|---|---|---|---|---|---|');
for (const [k, e] of Object.entries(atoms).sort()) md.push(`| ${k} | ${e.status} | ${e.n} | ${pct(e.share)} | ${e.cv ? f3(e.cv.brier) : '—'} | ${e.cv ? f3(e.cv.brierRef) : '—'} | ${e.cv ? pct(e.cv.skill) : '—'} |`);
if (typeof flags.decision === 'string') { mkdirSync(dirname(flags.decision), { recursive: true }); writeFileSync(flags.decision, md.join('\n')); }
writeFileSync(flags.score.replace(/\.json$/, '.md'), md.join('\n'));
const all = cells.find((c) => c.layer === 'all');
say(`geschrieben ${flags.score} (+ .md): ${cells.length} Zellen; all: CRPS ${f3(all?.cens.crps)} → ${f3(all?.mix.crps)} (${pct(all?.crpsSkill)}${all ? word(all) : ''}), PIT außen ${f3(all?.cens.pitOuter)} → ${f3(all?.mix.pitOuter)}`);
