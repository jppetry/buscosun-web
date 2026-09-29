/**
 * fv-decision.mjs — applies the FROZEN claims of `audit/fusion-validierung.md` §2 (frozen 2026-09-27T10:36:17Z, precisions §2.9)
 * to the scorecards of phase FV and writes the verdict tables — computed, never by hand.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/fusion-validierung/fv-decision.mjs
 *       --stage=h --card=C:\dev\buscosun-hindcast\score\<date>-fv-h\scorecard.json [--out=audit/fusion-validierung/fv-decision-h.md]
 *       --stage=a --card=C:\dev\buscosun-hindcast\score\<date>-fv-a\scorecard.json [--out=audit/fusion-validierung/fv-decision-a.md]
 *
 * Words (§2.1): „signifikant besser" (skill > 0, p_adj < 0,05) · „gleichauf (n.s., ±)" · „signifikant schlechter" (skill < 0, p_adj < 0,05).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'file:///C:/dev/buscosun-web/scripts/hindcast/lib/common.mjs';

const flags = parseArgs(process.argv.slice(2));
const stage = flags.stage === 'a' ? 'a' : 'h';
if (typeof flags.card !== 'string') throw new Error('--card fehlt');
const C = JSON.parse(readFileSync(flags.card, 'utf8'));
const out = typeof flags.out === 'string' ? flags.out : `C:/dev/buscosun-web/audit/fusion-validierung/fv-decision-${stage}.md`;
const VARS = ['t', 'td', 'ws', 'gust', 'clct', 'precip'];
const VL = { t: 'T', td: 'Td', ws: 'Wind', gust: 'Böe', clct: 'Bewölkung (DE)', precip: 'Niederschlag' };
const BIN = ['0–6', '7–24', '25–48', '51–120', '126–240', '246–336'];
const LAYERS = ['country:DE', 'country:AT', 'country:CH', 'band:lt800', 'band:ge800'];
const f = (x, d = 1) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('-', '−'));
const sig = (p) => p && p.dm && Number.isFinite(p.dm.pAdj) && p.dm.pAdj < 0.05;
const word = (p) => (!p ? '—' : sig(p) ? (p.skill > 0 ? 'signifikant besser' : 'signifikant schlechter') : `gleichauf (n.s., ${p.skill >= 0 ? '+' : '−'})`);
const cell = (p) => (!p ? '—' : `${f(100 * p.skill)} %${sig(p) ? (p.skill > 0 ? '*' : '!') : ''} (p ${f(p.dm?.pAdj, 3)}, ${p.days} d)`);
const md = [];

if (stage === 'h') {
  const pair = (v, b, ref, L = 'all', cand = 'fl-K') => C.pairs[`${v}|${b}|${cand}|${ref}|${L}`] ?? null;
  const has = (v, b) => !!C.scores[`${v}|${b}|fl-K|all`];
  md.push(`# FV-H — Verdikt nach den eingefrorenen Regeln (§2.2) — Scorecard ${C.builtAt.slice(0, 16)}Z`, '',
    `${C.inputs.scored} bewertete Zeilen von ${C.inputs.rows}, Stride ${C.inputs.stride}, Zeilenauswahl ${C.inputs.thin?.mode ?? 'legacy'}, Faltenschema ${C.inputs.foldScheme}, Referenzen ${(C.inputs.refTables ?? []).map((r) => `fl-K@${r.label} (${r.foldScheme}, ${r.thin})`).join(' · ')}; ${Object.keys(C.pairs).length} Paare, BH über alle DM-Tests der Karte.`, '');
  // H1
  const h1Rows = [], h1Worse = [], h1Long = [];
  for (const v of VARS) for (let b = 0; b < 6; b++) {
    if (!has(v, b)) continue;
    const p = pair(v, b, 'fl-K@4');
    h1Rows.push(`| ${VL[v]} · ${BIN[b]} | ${cell(p)} | ${word(p)} |`);
    if (p && sig(p) && p.skill < -0.01) h1Worse.push(`${VL[v]} ${BIN[b]} ${cell(p)}`);
    if (['t', 'td', 'gust'].includes(v) && b >= 4 && !(p && sig(p) && p.skill > 0)) h1Long.push(`${VL[v]} ${BIN[b]} ${cell(p)}`);
  }
  const h1 = !h1Worse.length && !h1Long.length;
  md.push('## H1 — fl-K (5e′) gegen fl-K@4 (Tabellen der Scorecard 4), Schicht all', '', '| Größe · Bin | CRPS-Skill | Wort |', '|---|---|---|', ...h1Rows, '',
    `(a) keine Zelle signifikant schlechter mit Skill < −1 %: **${h1Worse.length ? 'VERLETZT — ' + h1Worse.join('; ') : 'erfüllt'}**`,
    `(b) T, Td, Böe bei 126–240 und 246–336 h signifikant besser: **${h1Long.length ? 'VERLETZT — ' + h1Long.join('; ') : 'erfüllt'}**`, '', `**H1 ${h1 ? 'GILT' : 'GILT NICHT'}.**`, '');
  // H2
  const h2Rows = [], h2Fail = [];
  for (const v of VARS) for (let b = 0; b < 6; b++) {
    if (!has(v, b)) continue;
    const refs = Object.keys(C.pairs).filter((k) => k.startsWith(`${v}|${b}|fl-K|`) && k.endsWith('|all')).map((k) => k.split('|')[3]).filter((r) => r.startsWith('src:') || r === 'mmm');
    const res = refs.map((r) => ({ r, p: pair(v, b, r) }));
    const bad = res.filter(({ p }) => !(p && sig(p) && p.skill > 0));
    const worst = res.length ? res.reduce((a, c) => (c.p.skill < a.p.skill ? c : a)) : null;
    h2Rows.push(`| ${VL[v]} · ${BIN[b]} | ${res.length} | ${worst ? `${worst.r} ${cell(worst.p)}` : '—'} | ${bad.length ? 'fällt: ' + bad.map(({ r, p }) => `${r} ${cell(p)}`).join('; ') : 'besteht'} |`);
    if (bad.length || !res.length) h2Fail.push(`${VL[v]} ${BIN[b]}`);
  }
  md.push('## H2 — fl-K gegen jedes Rohmodell (src:*) und mmm (G-FL-1), Schicht all', '', '| Größe · Bin | Referenzen | schwächster Abstand | Zelle |', '|---|---|---|---|', ...h2Rows, '', `**H2 ${h2Fail.length ? `GILT NICHT — durchfallende Zellen: ${h2Fail.join(', ')}` : 'GILT'}.**`, '');
  // H3
  const h3Rows = [], h3Fail = [];
  for (const v of VARS) for (let b = 0; b < 6; b++) { if (!has(v, b)) continue; const p = pair(v, b, 'cube'); h3Rows.push(`| ${VL[v]} · ${BIN[b]} | ${cell(p)} | ${word(p)} |`); if (!(p && sig(p) && p.skill > 0)) h3Fail.push(`${VL[v]} ${BIN[b]} ${cell(p)}`); }
  md.push('## H3 — fl-K gegen den heutigen Cube-Motor, Schicht all', '', '| Größe · Bin | CRPS-Skill | Wort |', '|---|---|---|', ...h3Rows, '', `**H3 ${h3Fail.length ? `GILT NICHT — ${h3Fail.join('; ')}` : 'GILT'}.**`, '');
  // H4
  const h4Rows = [], h4Miss = [];
  for (const v of VARS) for (let b = 0; b < 6; b++) {
    const g = C.gates[`${v}|${b}|fl-K`]; if (!g) continue;
    if (v === 'precip') { const br = C.brier[`precip|${b}|fl-K|0.1`]; h4Rows.push(`| ${VL[v]} · ${BIN[b]} | — | — | Brier(0,1) ${f(br?.brier, 4)}, BSS ${f(br?.bss, 3)} (G2 entfällt) |`); continue; }
    const inSS = g.spreadSkill != null && g.spreadSkill >= 0.85 && g.spreadSkill <= 1.2, inPit = g.pitOuter != null && g.pitOuter >= 0.15 && g.pitOuter <= 0.25;
    h4Rows.push(`| ${VL[v]} · ${BIN[b]} | ${f(g.spreadSkill, 2)} | ${f(g.pitOuter, 3)} | ${inSS && inPit ? 'im Band' : 'AUSSERHALB'} |`);
    if (!(inSS && inPit)) h4Miss.push(`${VL[v]} ${BIN[b]} (S/S ${f(g.spreadSkill, 2)}, PIT ${f(g.pitOuter, 3)})`);
  }
  md.push('## H4 — Kalibrierung fl-K: rms-Spread/Skill 0,85–1,20 und randomisierter PIT-Rand 0,15–0,25 (G-FL-2)', '', '| Größe · Bin | S/S rms | PIT-Rand | |', '|---|---|---|---|', ...h4Rows, '', `**H4 ${h4Miss.length ? `GILT NICHT — ${h4Miss.length} Zellen außerhalb: ${h4Miss.join('; ')}` : 'GILT'}.**`, '');
  // H5
  const crossing = (v) => {
    const leads = [...new Set(Object.keys(C.scores).filter((k) => k.startsWith(`${v}|`) && k.includes('|fl-K|lead:')).map((k) => Number(k.split('|')[3].slice(5))))].sort((a, b) => a - b);
    const binOf = (L) => { let i = 0; for (const [k, lo] of [0, 7, 25, 51, 126, 246].entries()) if (L >= lo) i = k; return i; };
    const worse = (L) => { const k = C.scores[`${v}|${binOf(L)}|fl-K|lead:${L}`], c = C.scores[`${v}|${binOf(L)}|clima|lead:${L}`]; return !!(k && c) && k.crps > c.crps; };
    for (let i = 0; i + 2 < leads.length; i++) if (worse(leads[i]) && worse(leads[i + 1]) && worse(leads[i + 2])) return leads[i];
    return null;
  };
  md.push('## H5 — Kreuzungsstunde fl-K gegen die Stationsklimatologie (berichtet)', '', VARS.map((v) => `${VL[v]} ${crossing(v) == null ? 'keine' : crossing(v) + ' h'}`).join(' · '), '');
  // H8
  const h8Viol = [], h8Note = [];
  for (const ref of ['fl-K@4', 'mmm', 'cube']) for (const v of VARS) for (let b = 0; b < 6; b++) for (const L of LAYERS) {
    const p = pair(v, b, ref, L); if (!p || !(p.skill < -0.02)) continue;
    (sig(p) ? h8Viol : h8Note).push(`${ref} · ${VL[v]} ${BIN[b]} ${L} ${cell(p)}`);
  }
  md.push('## H8 — Schichten (DE, AT, CH, < / ≥ 800 m) gegen fl-K@4, mmm, cube: signifikant schlechter mit Skill < −2 %?', '', `Verletzungen: ${h8Viol.length ? h8Viol.join('; ') : 'keine'}`, '', `Hinweise (Skill < −2 %, n.s.): ${h8Note.length ? h8Note.join('; ') : 'keine'}`, '', `**H8 ${h8Viol.length ? 'GILT NICHT' : 'GILT'}.**`, '');
  // context: rule fx5 on FV-H
  const r1 = [], r2 = [], r3 = [], zero = [];
  for (const v of VARS) for (let b = 0; b < 6; b++) {
    const p = pair(v, b, 'fl-K@5a'); if (!p) continue;
    if (['t', 'td', 'gust'].includes(v) && b === 5 && !(sig(p) && p.skill > 0)) r1.push(`${VL[v]} ${BIN[b]} ${cell(p)}`);
    if (p.skill < -0.01) r2.push(`${VL[v]} ${BIN[b]} ${cell(p)}`);
    if (['clct', 'precip'].includes(v) && Math.abs(p.skill) > 1e-9) zero.push(`${VL[v]} ${BIN[b]} ${cell(p)}`);
    for (const L of LAYERS) { const q = pair(v, b, 'fl-K@5a', L); if (q && q.skill < -0.02) r3.push(`${VL[v]} ${BIN[b]} ${L} ${cell(q)}`); }
  }
  md.push('## Kontext — Regel fx5 (FX §6.5) auf FV-H: fl-K (5e′) gegen fl-K@5a (5a′)', '', `1. T/Td/Böe 246–336 h signifikant besser: ${r1.length ? 'NICHT erfüllt — ' + r1.join('; ') : 'erfüllt'}`, `2. keine Zelle all < −1 %: ${r2.length ? 'NICHT erfüllt — ' + r2.join('; ') : 'erfüllt'}; Bewölkung/Niederschlag exakt 0,0 %: ${zero.length ? 'VERLETZT — ' + zero.join('; ') : 'erfüllt'}`, `3. keine Schicht < −2 %: ${r3.length ? 'NICHT erfüllt — ' + r3.join('; ') : 'erfüllt'}`, '');
  md.push('| Größe · Bin | fl-K gegen fl-K@5a | gegen Klima | gegen persist |', '|---|---|---|---|');
  for (const v of VARS) for (let b = 0; b < 6; b++) if (has(v, b)) md.push(`| ${VL[v]} · ${BIN[b]} | ${cell(pair(v, b, 'fl-K@5a'))} | ${cell(pair(v, b, 'clima'))} | ${cell(pair(v, b, 'persist'))} |`);
  // context (V-FV-1): the client always computes route 1 (run route, strata fitted on the summer 2026 run days); `all` in 51–336 h is mostly route 3 (dyn, all seasons)
  md.push('', '## Kontext — Routen: fl-K gegen fl-K@4 / cube / clima in route:1 (die Route des Clients) und route:3 (dyn, ganzjährig), CRPS-Skill', '', '| Größe · Bin | n route:1 | fl-K@4 r1 | cube r1 | clima r1 | n route:3 | fl-K@4 r3 | cube r3 | clima r3 |', '|---|---|---|---|---|---|---|---|---|');
  for (const v of VARS) for (let b = 0; b < 6; b++) {
    const s1 = C.scores[`${v}|${b}|fl-K|route:1`], s3 = C.scores[`${v}|${b}|fl-K|route:3`];
    if (!s1 && !s3) continue;
    md.push(`| ${VL[v]} · ${BIN[b]} | ${s1?.n ?? '—'} | ${cell(pair(v, b, 'fl-K@4', 'route:1'))} | ${cell(pair(v, b, 'cube', 'route:1'))} | ${cell(pair(v, b, 'clima', 'route:1'))} | ${s3?.n ?? '—'} | ${cell(pair(v, b, 'fl-K@4', 'route:3'))} | ${cell(pair(v, b, 'cube', 'route:3'))} | ${cell(pair(v, b, 'clima', 'route:3'))} |`);
  }
  md.push('', `## Zusammenfassung`, '', `H1 ${h1 ? 'gilt' : 'gilt nicht'} · H2 ${h2Fail.length ? `gilt nicht (${h2Fail.length} Zellen)` : 'gilt'} · H3 ${h3Fail.length ? `gilt nicht (${h3Fail.length} Zellen)` : 'gilt'} · H4 ${h4Miss.length ? `gilt nicht (${h4Miss.length} Zellen)` : 'gilt'} · H8 ${h8Viol.length ? `gilt nicht (${h8Viol.length})` : 'gilt'}`);
} else {
  const pair = (metric, v, b, cand, ref, L = 'all') => C.pairs[`${metric}|${v}|${b}|${cand}|${ref}|${L}`] ?? null;
  md.push(`# FV-A — Verdikt nach den eingefrorenen Regeln (§2.3, indikativ) — Scorecard ${C.builtAt.slice(0, 16)}Z`, '',
    `Slots ${C.inputs.slots.length} (${C.inputs.slots[0]?.slotAt.slice(0, 10)} … ${C.inputs.slots[C.inputs.slots.length - 1]?.slotAt.slice(0, 10)}), Zeilen ${C.counts.rows} (je Bin ${C.counts.rowsByBin.join(' · ')}), DM-Tests ${C.tests}; n_eff = Ausgabetage je Paar (Spalte d).`, '');
  const ruleOf = (cells) => { const any = cells.filter((c) => c.p); const worse = any.filter((c) => sig(c.p) && c.p.skill < 0); const allPos = any.length === cells.length && any.every((c) => c.p.skill > 0); return { verdict: worse.length ? 'GILT NICHT' : allPos ? 'GILT (indikativ)' : 'TEILWEISE', worse, notPos: any.filter((c) => !(c.p.skill > 0)), missing: cells.filter((c) => !c.p) }; };
  // H6
  const h6 = [];
  md.push('## H6 — product@5e gegen MOSMIX-L (T, Td, Wind, Böe × 0–6/7–24/25–48/51–120 h; CRPS und MAE)', '', '| Größe · Bin | CRPS all | MAE all | CRPS DE | CRPS AT | CRPS CH |', '|---|---|---|---|---|---|');
  for (const v of ['t', 'td', 'ws', 'gust']) for (const b of [0, 1, 2, 3]) {
    const pc = pair('crps', v, b, 'product@5e', 'mosmix'), pm = pair('mae', v, b, 'product@5e', 'mosmix');
    h6.push({ id: `${VL[v]} ${BIN[b]} CRPS`, p: pc }, { id: `${VL[v]} ${BIN[b]} MAE`, p: pm });
    md.push(`| ${VL[v]} · ${BIN[b]} | ${cell(pc)} | ${cell(pm)} | ${['DE', 'AT', 'CH'].map((c) => cell(pair('crps', v, b, 'product@5e', 'mosmix', `country:${c}`))).join(' | ')} |`);
  }
  const r6 = ruleOf(h6);
  md.push('', `**H6 ${r6.verdict}**${r6.worse.length ? ` — signifikant schlechter: ${r6.worse.map((c) => `${c.id} ${cell(c.p)}`).join('; ')}` : ''}${r6.notPos.length ? ` — nicht positiv: ${r6.notPos.map((c) => `${c.id} ${cell(c.p)}`).join('; ')}` : ''}${r6.missing.length ? ` — ohne Zeilen: ${r6.missing.map((c) => c.id).join(', ')}` : ''}.`, '');
  // H7
  const h7 = {};
  for (const [ref, metric, vars] of [['live', 'mae', ['t', 'ws', 'gust', 'clct', 'precip']], ['live-fusion', 'qs3', VARS], ['product@4', 'crps', VARS]]) {
    const cells = [];
    md.push(`## H7 — product@5e gegen ${ref} (${metric.toUpperCase()})`, '', `| Größe · Bin | all | DE | AT | CH |${ref === 'live' ? ' lelev:ok (|DEM − Station| ≤ 50 m) |' : ''}`, `|---|---|---|---|---|${ref === 'live' ? '---|' : ''}`);
    for (const v of vars) for (let b = 0; b < 6; b++) {
      const p = pair(metric, v, b, 'product@5e', ref);
      if (!p) continue;
      cells.push({ id: `${VL[v]} ${BIN[b]}`, p });
      md.push(`| ${VL[v]} · ${BIN[b]} | ${cell(p)} | ${['DE', 'AT', 'CH'].map((c) => cell(pair(metric, v, b, 'product@5e', ref, `country:${c}`))).join(' | ')} |${ref === 'live' ? ` ${cell(pair(metric, v, b, 'product@5e', ref, 'lelev:ok'))} |` : ''}`);
    }
    const r = ruleOf(cells); h7[ref] = r;
    md.push('', `**H7 gegen ${ref}: ${r.verdict}**${r.worse.length ? ` — signifikant schlechter: ${r.worse.map((c) => `${c.id} ${cell(c.p)}`).join('; ')}` : ''}${r.notPos.length ? ` — nicht positiv: ${r.notPos.map((c) => `${c.id} ${cell(c.p)}`).join('; ')}` : ''}.`, '');
  }
  // context
  md.push('## Kontext — product@5e gegen cube, cube-hc, mmm, clima, persist; fl-K@5e gegen cube-hc (CRPS, Schicht all)', '', '| Größe · Bin | cube | cube-hc | mmm | clima | persist | fl-K@5e gegen cube-hc |', '|---|---|---|---|---|---|---|');
  for (const v of VARS) for (let b = 0; b < 6; b++) { const p = pair('crps', v, b, 'product@5e', 'cube'); if (!p) continue; md.push(`| ${VL[v]} · ${BIN[b]} | ${cell(p)} | ${cell(pair('crps', v, b, 'product@5e', 'cube-hc'))} | ${cell(pair('crps', v, b, 'product@5e', 'mmm'))} | ${cell(pair('crps', v, b, 'product@5e', 'clima'))} | ${cell(pair('crps', v, b, 'product@5e', 'persist'))} | ${cell(pair('crps', v, b, 'fl-K@5e', 'cube-hc'))} |`); }
  // controls
  const l1 = [];
  for (const v of VARS) for (let b = 0; b < 6; b++) { const p = C.pairs[`crps|${v}|${b}|product@5e-full|product@5e|l1:all`]; if (p && p.n >= 200) l1.push({ v, b, p }); }
  const l1pos = l1.filter((x) => x.p.skill > 0), l1T = l1.filter((x) => x.v === 't');
  const l1ok = l1.length > 0 && l1pos.length > l1.length / 2 && l1T.every((x) => x.p.skill > 0);
  md.push('', '## Kontrollen', '', `**L1** (volle Tabellen gegen Falten-β auf der Überlappung, Zellen mit ≥ 200 Zeilen): ${l1.map((x) => `${VL[x.v]} ${BIN[x.b]} ${cell(x.p)}`).join('; ') || '—'} ⇒ ${l1pos.length}/${l1.length} Zellen positiv, T ${l1T.every((x) => x.p.skill > 0) ? 'positiv' : 'nicht positiv'} — **${l1ok ? 'bestanden (der Faltenschalter wirkt)' : 'NICHT bestanden — Faltenschalter prüfen'}**`,
    `**L2** (persist T bei Vorlauf 1): MAE ${f(C.controls.L2.maePersist, 3)} K gegen die Wahrheit, ${f(C.controls.L2.maeTruthPlus1h, 3)} K gegen +1 h, ${f(C.controls.L2.maeTruthMinus1h, 3)} K gegen −1 h (n ${C.controls.L2.n}); je Land ${Object.entries(C.controls.L2.byCountry).map(([k, o]) => `${k} ${f(o.same, 3)} / +1 h ${f(o.plus, 3)} / −1 h ${f(o.minus, 3)}`).join(' · ')}; Zeilen mit Messung genau bei V − 1 h: n ${C.controls.L2.exact?.n ?? '—'}, |persist − Wahrheit(V − 1 h)| max ${f(C.controls.L2.exact?.maxAbs, 6)} — **${C.controls.L2.maeTruthPlus1h > C.controls.L2.maePersist && C.controls.L2.exact?.n > 0 && C.controls.L2.exact.maxAbs <= 1e-9 ? 'bestanden' : 'NICHT bestanden'}** (Regel §2.9 (5): +1 h verschlechtert UND genau dort, wo die Messung bei V − 1 h liegt, ist der Fehler 0)`,
    `**L3** (Zeitstempel nach dem Slot): Cube ${C.controls.L3.cubeRunAfterSlot}, Station ${C.controls.L3.stationRunAfterSlot}, Nowcast ${C.controls.L3.nowcastStampAfterSlot}, Messung ${C.controls.L3.obsAfterSlot}; live ${f(C.controls.L3.liveFetchedAfterSlotMin?.min, 1)}…${f(C.controls.L3.liveFetchedAfterSlotMin?.max, 1)} min nach dem Slot (benannt) — **${C.controls.L3.cubeRunAfterSlot + C.controls.L3.stationRunAfterSlot + C.controls.L3.nowcastStampAfterSlot + C.controls.L3.obsAfterSlot === 0 ? 'bestanden' : 'NICHT bestanden'}**`, '',
    `## Zusammenfassung`, '', `H6 ${r6.verdict} · H7 live ${h7.live.verdict} · live-fusion ${h7['live-fusion'].verdict} · product@4 ${h7['product@4'].verdict} · L1 ${l1ok ? 'ok' : 'NICHT ok'}`);
}
writeFileSync(out, md.join('\n') + '\n');
console.log(md.join('\n'));
console.log(`\n[fv-decision] geschrieben ${out}`);
