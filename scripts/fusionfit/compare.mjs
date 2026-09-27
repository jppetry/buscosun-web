/**
 * compare.mjs — before/after tables of two fits or two scorecards of phase FL (`audit/fusion-lernphase.md` §11.9,
 * §11.11): what the audit quotes, computed from the documents, never by hand.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fusionfit/compare.mjs
 *       --fit=<before>\fusion.hindcast.json,<after>\fusion.hindcast.json --out=<dir>\compare-fit.md
 *   node … compare.mjs --score=<before>\scorecard.json,<after>\scorecard.json --out=<dir>\compare-score.md
 *
 * Fit: per stratum (form K) n, λ, status, time/region/band CV MSE before → after; per (var, bin) the n-weighted MSE
 * over the routes; flips of status; fusionFit@3 extras (σ scale, speed law, hurdle CV) listed for the after document.
 * Scorecard: per candidate (fl-K, fl-P) and (var, bin) CRPS/MAE/S/S/PIT-edge/skill-vs-references and the gates before →
 * after (layer `all`), then per country and band the CRPS before → after; regressions > 1 % and gate changes named.
 * Since phase FX the scorer's `spreadSkill` is the rms form of the observable sd and the old definition lives in
 * `spreadSkillLatent`: the column "S/S vor → nach" stays like-for-like (the after card's latent value when the before
 * card has no `spreadSkillLatent`), the column "S/S rms (nach)" carries the new measure.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from '../hindcast/lib/common.mjs';

const flags = parseArgs(process.argv.slice(2));
const out = typeof flags.out === 'string' ? flags.out : null;
if (!out) throw new Error('--out fehlt');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const f3 = (x, d = 3) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d));
const pct = (a, b) => (a != null && b != null && a > 0 ? `${(100 * (b / a - 1)).toFixed(1).replace('-', '−')} %` : '—');
const BIN_LABEL = ['0–6', '7–24', '25–48', '51–120', '126–240', '246–336'];
const VAR_LABEL = { t: 'T', td: 'Td', ws: 'Wind', gust: 'Böe', clct: 'Bewölkung (DE)', precip: 'Niederschlag', u: 'u', v: 'v' };
const ROUTE = { r1: 'run', r2: 'day0', r3: 'dyn' };
const md = [];

if (typeof flags.fit === 'string') {
  const [pB, pA] = flags.fit.split(',');
  const B = read(pB), A = read(pA);
  const cnt = (T) => { const v = Object.values(T.mean); return `${v.filter((e) => e.status === 'written').length}/${v.filter((e) => e.status === 'no-skill').length}/${v.filter((e) => e.status === 'too-short').length}`; };
  md.push(`# Fit before/after — ${B.fitVersion} (${B.builtAt.slice(0, 16)}) → ${A.fitVersion} (${A.builtAt.slice(0, 16)})`, '', `Strata written/no-skill/too-short: before ${cnt(B)} · after ${cnt(A)}`, '');
  md.push('## Per stratum (form K)', '', '| Stratum | n | λ vor → nach | Status | MSE Zeit vor → nach (Δ) | MSE Region vor → nach (Δ) | MSE Band vor → nach (Δ) |', '|---|---|---|---|---|---|---|');
  const keys = [...new Set([...Object.keys(B.mean), ...Object.keys(A.mean)])].filter((k) => k.startsWith('K|')).sort((x, y) => { const [, va, ba, ca] = x.split('|'), [, vb, bb, cb] = y.split('|'); const vo = ['t', 'td', 'u', 'v', 'gust', 'clct', 'precip']; return vo.indexOf(va) - vo.indexOf(vb) || Number(ba) - Number(bb) || ca.localeCompare(cb); });
  const agg = new Map();
  const flips = [];
  for (const k of keys) {
    const b = B.mean[k], a = A.mean[k]; if (!b || !a) continue;
    const [, v, bin, cls] = k.split('|');
    const m = (e, ax) => e.cv?.[ax]?.mse;
    md.push(`| ${v} · ${BIN_LABEL[bin]} · ${ROUTE[cls] ?? cls} | ${a.n} | ${b.lambda} → ${a.lambda} | ${b.status} → ${a.status} | ${f3(m(b, 'time'))} → ${f3(m(a, 'time'))} (${pct(m(b, 'time'), m(a, 'time'))}) | ${f3(m(b, 'region'))} → ${f3(m(a, 'region'))} (${pct(m(b, 'region'), m(a, 'region'))}) | ${f3(m(b, 'band'))} → ${f3(m(a, 'band'))} (${pct(m(b, 'band'), m(a, 'band'))}) |`);
    if (b.status !== a.status) flips.push(`${k}: ${b.status} → ${a.status}`);
    const ak = `${v}|${bin}`; let g = agg.get(ak); if (!g) { g = { n: 0, tb: 0, ta: 0, rb: 0, ra: 0, bb: 0, ba: 0 }; agg.set(ak, g); }
    const nT = a.cv?.time?.n ?? a.n;
    if (m(b, 'time') != null && m(a, 'time') != null) { g.n += nT; g.tb += m(b, 'time') * nT; g.ta += m(a, 'time') * nT; g.rb += (m(b, 'region') ?? 0) * nT; g.ra += (m(a, 'region') ?? 0) * nT; g.bb += (m(b, 'band') ?? 0) * nT; g.ba += (m(a, 'band') ?? 0) * nT; }
  }
  md.push('', `Flips: ${flips.length ? flips.join('; ') : 'none'}`, '', '## Per variable × bin (form K, n-weighted over the routes)', '', '| Größe · Bin | n | MSE Zeit vor → nach (Δ) | Δ Region | Δ Band |', '|---|---|---|---|---|');
  for (const [ak, g] of agg) { if (!g.n) continue; const [v, bin] = ak.split('|'); md.push(`| ${VAR_LABEL[v] ?? v} · ${BIN_LABEL[bin]} | ${g.n} | ${f3(g.tb / g.n)} → ${f3(g.ta / g.n)} (${pct(g.tb, g.ta)}) | ${pct(g.rb, g.ra)} | ${pct(g.bb, g.ba)} |`); }
  // fusionFit@3 extras of the after document; phase FX (A1): family, grid, edge flags (v3 entries: from the v3 axes), band entries with the pooled law on their rows
  if (A.speed) {
    const { speedEdge } = await import('../../src/point/fusionFit/fitSpeed.ts');
    md.push('', '## Speed law (after, V-FL-22 / V-FX-6)', '', '| Stratum | Band | n | Familie · Gitter | a b c | Rand | Status | oof CRPS Rice → TN (Δ) | PIT-Rand Rice → TN | je Familie oof (add / sd) | gepooltes Gesetz auf den Bandzeilen → Band-TN (Δ) | LN (126–336 h, Teilstichprobe): CRPS LN / TN / Rice · PIT LN |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const [k, e] of Object.entries(A.speed).sort()) {
      const law = e.law ?? 'add', grid = e.grid ?? 'v3', edge = e.edge ?? speedEdge('v3', { law, a: e.a, b: e.b, c: e.c });
      const byLaw = e.cv?.byLaw ? ['add', 'sd'].map((l) => { const x = e.cv.byLaw[l]; return x ? `${l} ${x.a}/${x.b}/${x.c}${x.edge.length ? ` [${x.edge.join('')}]` : ''} ${x.oof ? `${f3(x.oof.crps, 4)} (${pct(x.oof.crpsRice, x.oof.crps)})` : '—'}` : `${l} —`; }).join(' · ') : '—';
      const vsPooled = e.band ? (e.cv?.crpsPooledLaw != null ? `${f3(e.cv.crpsPooledLaw, 4)} → ${f3(e.cv.crpsTn, 4)} (${pct(e.cv.crpsPooledLaw, e.cv.crpsTn)})` : '—') : '';
      md.push(`| ${k} | ${e.band ?? 'gepoolt'} | ${e.n} | ${law} · ${grid} | ${e.a} ${e.b} ${e.c} | ${edge.length ? edge.join('') : '—'} | ${e.status} | ${e.cv?.oof ? `${f3(e.cv.oof.crpsRice, 4)} → ${f3(e.cv.oof.crps, 4)} (${pct(e.cv.oof.crpsRice, e.cv.oof.crps)})` : '—'} | ${e.cv?.oof ? `${f3(e.cv.oof.pitOuterRice)} → ${f3(e.cv.oof.pitOuter)}` : '—'} | ${byLaw} | ${vsPooled} | ${e.ln ? `${f3(e.ln.crps, 4)} / ${f3(e.ln.crpsTn, 4)} / ${f3(e.ln.crpsRice, 4)} · ${f3(e.ln.pitOuter)} (n ${e.ln.n})` : '—'} |`);
    }
    const pooledK = Object.values(A.speed).filter((e) => !e.band && e.status !== 'too-short' && e.cv);
    const onEdge = (p) => pooledK.filter((e) => (e.edge ?? speedEdge(e.grid ?? 'v3', { law: e.law ?? 'add', a: e.a, b: e.b, c: e.c })).includes(p)).length;
    md.push('', `Gitterrand (gepoolte Strata mit Verdikt, ${pooledK.length}): a am Rand ${onEdge('a')}, b ${onEdge('b')}, c ${onEdge('c')}; Familie sd ${pooledK.filter((e) => e.law === 'sd').length}; Band-Einträge ${Object.values(A.speed).filter((e) => e.band).length} (geschrieben ${Object.values(A.speed).filter((e) => e.band && e.status === 'written').length})`);
  }
  // phase FX (C1): the climatology column and the ρ_f target of the after document
  if (A.design?.mean?.clima === 'station' || A.inputs?.rhoTarget) {
    md.push('', '## μ_c-Spalte und ρ_f-Ziel (after, V-FX-5)', '', `design.mean.clima: ${A.design?.mean?.clima ?? 'none'} · rhoTarget: ${A.inputs?.rhoTarget ? Object.entries(A.inputs.rhoTarget).sort().map(([k, r]) => `${k} ${r}`).join(' · ') : '—'} · climaFallback: ${A.inputs?.climaFallback ? JSON.stringify(A.inputs.climaFallback) : '—'}${A.inputs?.climaShuffle ? ' · NEGATIVKONTROLLE (Nachbar-μ_c)' : ''}`, '', '| Stratum (Form K) | β_cube vor → nach | β_μc (nach) | Ziel ρ | Status |', '|---|---|---|---|---|');
    for (const k of keys) {
      const b = B.mean[k], a = A.mean[k]; if (!a || a.status === 'too-short') continue;
      const iC = a.names.indexOf('cube'), iM = a.names.indexOf('muC');
      md.push(`| ${k} | ${b?.beta?.length ? f3(b.beta[b.names.indexOf('cube')]) : '—'} → ${a.beta.length ? f3(a.beta[iC]) : '—'} | ${iM >= 0 && a.beta.length ? f3(a.beta[iM]) : '—'} | ${a.rhoTarget ?? '—'} | ${a.status} |`);
    }
  }
  const scaled = Object.entries(A.variance).filter(([, e]) => e.scaleCv);
  if (scaled.length) {
    md.push('', '## σ scale (after, V-FL-15)', '', '| Stratum | k geschrieben | k bestes | oof CRPS k=1 → k* (Δ) | PIT-Rand k=1 → k* | n |', '|---|---|---|---|---|---|');
    for (const [k, e] of scaled.sort()) md.push(`| ${k} | ${e.scale} | ${e.scaleCv.k} | ${e.scaleCv.oof ? `${f3(e.scaleCv.oof.crpsBase, 4)} → ${f3(e.scaleCv.oof.crps, 4)} (${pct(e.scaleCv.oof.crpsBase, e.scaleCv.oof.crps)})` : '—'} | ${e.scaleCv.oof ? `${f3(e.scaleCv.oof.pitOuterBase)} → ${f3(e.scaleCv.oof.pitOuter)}` : '—'} | ${e.scaleCv.oof?.n ?? 0} |`);
  }
  const occ = Object.entries(A.occurrence).filter(([, e]) => e.cv !== undefined);
  if (occ.length) {
    md.push('', '## Hurdle CV (after, V-FL-18)', '', '| Stratum | n | Status | oof Brier gelernt vs Cube (Skill) | β logitWetCube |', '|---|---|---|---|---|');
    for (const [k, e] of occ.sort()) md.push(`| ${k} | ${e.n} | ${e.status} | ${e.cv ? `${f3(e.cv.brier, 4)} vs ${f3(e.cv.brierCube, 4)} (${e.cv.skill == null ? '—' : (100 * e.cv.skill).toFixed(1) + ' %'}, n ${e.cv.n})` : '—'} | ${e.beta.length ? f3(e.beta[e.beta.length - 1]) : '—'} |`);
  }
}

if (typeof flags.score === 'string') {
  const [pB, pA] = flags.score.split(',');
  const B = read(pB), A = read(pA);
  md.push(`# Scorecard before/after — ${B.tables.fitVersion} (${B.builtAt.slice(0, 16)}) → ${A.tables.fitVersion} (${A.builtAt.slice(0, 16)})`, '', `Rows scored: before ${B.inputs.scored} · after ${A.inputs.scored} (stride ${A.inputs.stride})`, '');
  const REFS = ['cube', 'mmm', 'clima'];
  const regressions = [], gateChanges = [];
  const gm = (g) => (g ? `${g.G1 ? '✓' : '✗'} ${g.G2 == null ? '–' : g.G2 ? '✓' : '✗'} ${g.G4 ? '✓' : '✗'}` : '');
  for (const cand of ['fl-K', 'fl-P']) {
    md.push(`## ${cand}`, '', '| Größe · Bin | n | CRPS vor → nach (Δ) | MAE vor → nach | S/S vor → nach | S/S rms (nach) | PIT-Rand vor → nach | vs Cube vor → nach | vs MMM | vs beste Quelle | vs Klima | G1 G2 G4 vor → nach |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const v of ['t', 'td', 'ws', 'gust', 'clct', 'precip']) for (let bin = 0; bin < 6; bin++) {
      const sb = B.scores[`${v}|${bin}|${cand}|all`], sa = A.scores[`${v}|${bin}|${cand}|all`];
      if (!sb || !sa) continue;
      const pr = (T, ref) => { const p = T.pairs[`${v}|${bin}|${cand}|${ref}|all`]; return p ? `${(100 * p.skill).toFixed(1)} %${p.dm.pAdj < 0.05 ? (p.skill > 0 ? '*' : '!') : ''}` : '—'; };
      const best = (T) => { const srcs = Object.keys(T.pairs).filter((k) => k.startsWith(`${v}|${bin}|${cand}|src:`) && k.endsWith('|all')); if (!srcs.length) return '—'; const b = srcs.reduce((x, y) => (T.pairs[y].skill < T.pairs[x].skill ? y : x)); return `${b.split('|')[3].slice(4)} ${pr(T, b.split('|')[3])}`; };
      const gb = B.gates[`${v}|${bin}|${cand}`], ga = A.gates[`${v}|${bin}|${cand}`];
      // like-for-like S/S: a pre-FX before card carries only the latent definition ⇒ read the after card's `spreadSkillLatent`
      const ssA = sb.spreadSkillLatent == null && sa.spreadSkillLatent != null ? sa.spreadSkillLatent : sa.spreadSkill;
      md.push(`| ${VAR_LABEL[v]} · ${BIN_LABEL[bin]} | ${sa.n} | ${f3(sb.crps)} → ${f3(sa.crps)} (${pct(sb.crps, sa.crps)}) | ${f3(sb.mae, 2)} → ${f3(sa.mae, 2)} | ${f3(sb.spreadSkill, 2)} → ${f3(ssA, 2)} | ${f3(sa.spreadSkill, 2)} | ${f3(sb.pitOuter)} → ${f3(sa.pitOuter)} | ${pr(B, 'cube')} → ${pr(A, 'cube')} | ${pr(A, 'mmm')} | ${best(A)} | ${pr(A, 'clima')} | ${gm(gb)} → ${gm(ga)} |`);
      if (sa.crps > sb.crps * 1.01) regressions.push(`${cand} ${VAR_LABEL[v]} ${BIN_LABEL[bin]} +${(100 * (sa.crps / sb.crps - 1)).toFixed(1)} %`);
      if (gb && ga) for (const g of ['G1', 'G2', 'G4']) if (gb[g] !== ga[g]) gateChanges.push(`${cand} ${VAR_LABEL[v]} ${BIN_LABEL[bin]} ${g} ${gb[g] ? '✓' : '✗'} → ${ga[g] ? '✓' : '✗'}`);
    }
    md.push('');
  }
  md.push(`CRPS regressions > 1 % (layer all): ${regressions.length ? regressions.join('; ') : 'none'}`, '', `Gate changes: ${gateChanges.length ? gateChanges.join('; ') : 'none'}`, '');
  // Brier at 0,1 mm/h for precipitation (the V-FL-18 target)
  md.push('## Niederschlag: Brier(nass ≥ 0,1 mm/h) vor → nach, gelernt gegen Cube', '', '| Bin | fl-K vor → nach | cube vor → nach | fl-P vor → nach | n |', '|---|---|---|---|---|');
  for (let bin = 0; bin < 6; bin++) { const g = (T, c) => T.brier[`precip|${bin}|${c}|0.1`]; const kb = g(B, 'fl-K'), ka = g(A, 'fl-K'), cb = g(B, 'cube'), ca = g(A, 'cube'), pb = g(B, 'fl-P'), pa = g(A, 'fl-P'); if (!ka && !ca) continue; md.push(`| ${BIN_LABEL[bin]} | ${f3(kb?.brier, 4)} → ${f3(ka?.brier, 4)} | ${f3(cb?.brier, 4)} → ${f3(ca?.brier, 4)} | ${f3(pb?.brier, 4)} → ${f3(pa?.brier, 4)} | ${ka?.n ?? ca?.n ?? '—'} |`); }
  md.push('');
  // per country and band
  // phase FX-4: the `dnn:` layers (distance to the nearest other station) ride along where the after card has them
  const layers = [...new Set(Object.keys(A.scores).map((k) => k.split('|')[3]))].filter((l) => l.startsWith('country:') || l.startsWith('band:') || l.startsWith('dnn:')).sort();
  const regL = [];
  for (const cand of ['fl-K', 'fl-P']) {
    md.push(`## ${cand} je Land / Band — CRPS vor → nach`, '', `| Größe · Bin | ${layers.join(' | ')} |`, `|---|${layers.map(() => '---').join('|')}|`);
    for (const v of ['t', 'td', 'ws', 'gust', 'clct', 'precip']) for (let bin = 0; bin < 6; bin++) {
      const cells = layers.map((l) => { const sb = B.scores[`${v}|${bin}|${cand}|${l}`], sa = A.scores[`${v}|${bin}|${cand}|${l}`]; if (!sb || !sa) return '—'; if (sa.crps > sb.crps * 1.01) regL.push(`${cand} ${VAR_LABEL[v]} ${BIN_LABEL[bin]} ${l} +${(100 * (sa.crps / sb.crps - 1)).toFixed(1)} % (n ${sa.n})`); return `${f3(sb.crps)} → ${f3(sa.crps)} (${pct(sb.crps, sa.crps)})`; });
      if (cells.every((c) => c === '—')) continue;
      md.push(`| ${VAR_LABEL[v]} · ${BIN_LABEL[bin]} | ${cells.join(' | ')} |`);
    }
    md.push('');
  }
  md.push(`CRPS regressions > 1 % in the layers: ${regL.length ? regL.join('; ') : 'none'}`, '');
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, md.join('\n'));
console.log(`[compare] geschrieben ${out} (${md.length} Zeilen)`);
