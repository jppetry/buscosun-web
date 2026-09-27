/**
 * fx4-decision.mjs — applies the decision rule of `audit/fusion-forschung.md` §6.4 to a Scorecard with reference-table
 * candidates (`score.mjs --refTables=5a=…,5b=…`) and prints the evidence the audit quotes — computed, never by hand.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/fusion-forschung/fx4-decision.mjs
 *       --card=C:\dev\buscosun-hindcast\score\2026-09-26-fx5c\scorecard.json [--label=5c]
 *       [--card4=…\score\2026-09-25-ap8c\scorecard.json --card5a=… --card5b=…] [--out=audit/fusion-forschung/fx4-decision-5c.md]
 *       [--rule=fx4|fx5] [--ref2=5c --card2=…\score\2026-09-26-fx5c\scorecard.json]
 *
 * Rule fx4 (§6.4; fl-K, layer `all`, DM with BH-FDR on identical rows):
 *   1. T, Td, gust, wind at 126–240 h AND 246–336 h: fl-K beats fl-K@5a significantly (skill > 0, p_adj < 0,05);
 *   2. no variable × bin in `all` loses more than 1 % CRPS against fl-K@5a — cloud cover against fl-K@5b (V-FX-25);
 *   3. no variable × bin in DE/AT/CH/< 800 m/≥ 800 m loses more than 2 % against fl-K@5a (cloud cover against fl-K@5b).
 * Rule fx5 (§6.5, E-FX-8 — phase FX-5, the narrowed μ_c column `--climaVars=t,td,gust`):
 *   1. T, Td and gust at 246–336 h beat fl-K@5a significantly;
 *   2. no variable × bin in `all` loses more than 1 % against fl-K@5a — EVERY variable against 5a (cloud cover and precipitation
 *      must sit at exactly 0,0 %: their form-K path is byte-identical to 5a — the negative control of the flag; the wind measures A1 alone);
 *   3. no variable × bin in DE/AT/CH/< 800 m/≥ 800 m loses more than 2 % against fl-K@5a; the dnn: strata are reported.
 * The second reference column (`--ref2`, default 5b) is informative only (fx5: 5c = what the narrowing cost against the full column).
 * Skill of a pair = 1 − CRPS_cand/CRPS_ref ⇒ a regression of x % is skill < −x/100.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'file:///C:/dev/buscosun-web/scripts/hindcast/lib/common.mjs';

const flags = parseArgs(process.argv.slice(2));
const H = 'C:/dev/buscosun-hindcast';
const cardPath = typeof flags.card === 'string' ? flags.card : `${H}/score/2026-09-26-fx5c/scorecard.json`;
const label = typeof flags.label === 'string' ? flags.label : '5c';
const RULE = flags.rule === 'fx5' ? 'fx5' : 'fx4';
const REF2 = typeof flags.ref2 === 'string' ? flags.ref2 : '5b';
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const C = read(cardPath);
const C4 = read(typeof flags.card4 === 'string' ? flags.card4 : `${H}/score/2026-09-25-ap8c/scorecard.json`);
const CA = read(typeof flags.card5a === 'string' ? flags.card5a : `${H}/score/2026-09-25-fx5a/scorecard.json`);
const CB = read(typeof flags.card2 === 'string' ? flags.card2 : typeof flags.card5b === 'string' ? flags.card5b : `${H}/score/2026-09-25-fx5b/scorecard.json`);
const out = typeof flags.out === 'string' ? flags.out : `C:/dev/buscosun-web/audit/fusion-forschung/fx4-decision-${label}.md`;
const VARS = ['t', 'td', 'ws', 'gust', 'clct', 'precip'];
const VL = { t: 'T', td: 'Td', ws: 'Wind', gust: 'Böe', clct: 'Bewölkung (DE)', precip: 'Niederschlag' };
const BIN = ['0–6', '7–24', '25–48', '51–120', '126–240', '246–336'];
const LAYERS3 = ['country:DE', 'country:AT', 'country:CH', 'band:lt800', 'band:ge800'];
const refOf = (v) => (RULE === 'fx4' && v === 'clct' ? 'fl-K@5b' : 'fl-K@5a');
const RULE1_VARS = RULE === 'fx5' ? ['t', 'td', 'gust'] : ['t', 'td', 'ws', 'gust'];
const RULE1_BINS = RULE === 'fx5' ? [5] : [4, 5];
const REF2N = `fl-K@${REF2}`;
const pair = (v, b, ref, L = 'all') => C.pairs[`${v}|${b}|fl-K|${ref}|${L}`] ?? null;
const f = (x, d = 1) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d));
const pct = (p) => (p ? `${(100 * p.skill).toFixed(1).replace('-', '−')} %${p.dm.pAdj < 0.05 ? (p.skill > 0 ? '*' : '!') : ''}` : '—');
const crps = (card, v, b, L = 'all') => card.scores[`${v}|${b}|fl-K|${L}`]?.crps ?? null;

const md = [`# ${RULE === 'fx5' ? 'FX-5 (E-FX-8)' : 'FX-4'} Entscheidung — Regel ${RULE} — Scorecard ${label} (${C.builtAt.slice(0, 16)}Z, ${C.inputs.scored} Zeilen, Stride ${C.inputs.stride})`, '',
  `μ_c: ${C.inputs.climaMu ? `geschätzt — Kandidat ${C.inputs.climaMu.candidate}, Schätzer ${JSON.stringify(C.inputs.climaMu.estimator)}, Trendmerkmale ${C.inputs.climaMu.trendSet ?? '—'}` : 'Stationsklimatologie (kein climaMu)'}; Referenzen ${(C.inputs.refTables ?? []).map((r) => `fl-K@${r.label} (${r.clima}${r.climaMu ? `, μ_c ${r.climaMu}` : ''})`).join(', ')}.`, '',
  `## Größe × Bin (Schicht all): CRPS fl-K in Scorecard 4 → 5a → ${REF2} → ${label}, Paare ${label} gegen fl-K@5a / ${REF2N} (* signifikant besser, ! signifikant schlechter, BH-FDR)`, '',
  `| Größe · Bin | n | CRPS 4 | 5a | ${REF2} | ${label} | ${label} gegen 5a (%) | ${label} gegen ${REF2} (%) | gegen Klima (${label}) |`, '|---|---|---|---|---|---|---|---|---|'];
let ok1 = true, ok2 = true, ok3 = true;
const fail1 = [], fail2 = [], fail3 = [];
for (const v of VARS) for (let b = 0; b < 6; b++) {
  const s = C.scores[`${v}|${b}|fl-K|all`]; if (!s) continue;
  const pA = pair(v, b, 'fl-K@5a'), pB = pair(v, b, REF2N), pC = C.pairs[`${v}|${b}|fl-K|clima|all`];
  md.push(`| ${VL[v]} · ${BIN[b]} | ${s.n} | ${f(crps(C4, v, b), 3)} | ${f(crps(CA, v, b), 3)} | ${f(crps(CB, v, b), 3)} | ${f(s.crps, 3)} | ${pct(pA)} | ${pct(pB)} | ${pct(pC)} |`);
  // rule 1
  if (RULE1_VARS.includes(v) && RULE1_BINS.includes(b)) { const okc = !!pA && pA.skill > 0 && pA.dm.pAdj < 0.05; if (!okc) { ok1 = false; fail1.push(`${VL[v]} ${BIN[b]} ${pct(pA)} (p ${f(pA?.dm.pAdj, 3)})`); } }
  // rule 2
  const p2 = pair(v, b, refOf(v)); if (p2 && p2.skill < -0.01) { ok2 = false; fail2.push(`${VL[v]} ${BIN[b]} ${pct(p2)} gegen ${refOf(v)}`); }
}
md.push('', `## Schichten (Regel 3): Paare ${label} gegen fl-K@5a${RULE === 'fx4' ? ' (Bewölkung gegen fl-K@5b)' : ''}, Skill in %`, '', `| Größe · Bin | ${LAYERS3.join(' | ')} |`, `|---|${LAYERS3.map(() => '---').join('|')}|`);
for (const v of VARS) for (let b = 0; b < 6; b++) {
  const cells = LAYERS3.map((L) => { const p = pair(v, b, refOf(v), L); if (p && p.skill < -0.02) { ok3 = false; fail3.push(`${VL[v]} ${BIN[b]} ${L} ${pct(p)}`); } return p ? `${pct(p)} (n ${p.n})` : '—'; });
  if (cells.every((c) => c === '—')) continue;
  md.push(`| ${VL[v]} · ${BIN[b]} | ${cells.join(' | ')} |`);
}
// distance to the nearest station: the number for a station-less point
const DNN = (C.inputs.dnnBins ?? []).map((b) => `dnn:${b}`);
if (DNN.length) {
  md.push('', '## Gewinn nach Abstand zur nächsten anderen Station (Paare ' + label + ' gegen fl-K@5a, Skill in %; n = bewertete Zeilen)', '', `| Größe · Bin | ${DNN.join(' | ')} |`, `|---|${DNN.map(() => '---').join('|')}|`);
  for (const v of ['t', 'td', 'ws', 'gust']) for (const b of [3, 4, 5]) md.push(`| ${VL[v]} · ${BIN[b]} | ${DNN.map((L) => { const p = pair(v, b, 'fl-K@5a', L); return p ? `${pct(p)} (n ${p.n})` : '—'; }).join(' | ')} |`);
}
// fx5: the negative control — cloud cover and precipitation must be exactly 0,0 % against 5a in every bin (byte-identical form-K path)
const zero = [];
if (RULE === 'fx5') for (const v of ['clct', 'precip']) for (let b = 0; b < 6; b++) { const p = pair(v, b, 'fl-K@5a'); if (p && Math.abs(p.skill) > 1e-9) zero.push(`${VL[v]} ${BIN[b]} ${pct(p)}`); }
const verdict = ok1 && ok2 && ok3 && !zero.length;
md.push('', `## Regel ${RULE}`, '', `1. Langfrist-Gewinn ${RULE1_VARS.map((v) => VL[v]).join('/')} bei ${RULE1_BINS.map((b) => BIN[b] + ' h').join(' und ')} gegen fl-K@5a signifikant: **${ok1 ? 'erfüllt' : 'NICHT erfüllt'}**${fail1.length ? ` — ${fail1.join('; ')}` : ''}`,
  `2. Keine Regression > 1 % in \`all\` gegen fl-K@5a${RULE === 'fx4' ? ' (Bewölkung gegen fl-K@5b)' : ''}: **${ok2 ? 'erfüllt' : 'NICHT erfüllt'}**${fail2.length ? ` — ${fail2.join('; ')}` : ''}${RULE === 'fx5' ? `; Negativkontrolle Bewölkung/Niederschlag exakt 0,0 % gegen 5a: **${zero.length ? 'VERLETZT — ' + zero.join('; ') : 'bestanden'}**` : ''}`,
  `3. Keine Regression > 2 % in DE/AT/CH/< 800 m/≥ 800 m: **${ok3 ? 'erfüllt' : 'NICHT erfüllt'}**${fail3.length ? ` — ${fail3.join('; ')}` : ''}`, '',
  `**Verdikt ${label}: ${verdict ? 'BAUEN (alle drei Bedingungen erfüllt)' : 'NICHT bauen (Regel verletzt)'}**`, '');
writeFileSync(out, md.join('\n'));
console.log(md.join('\n'));
console.log(`\n[fx4-decision] geschrieben ${out}`);
