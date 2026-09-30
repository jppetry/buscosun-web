/**
 * now-vs-5e.mjs — phase AX (`audit/fusion-ausbau.md` §6g): the product as it runs TODAY (stage `fs`, the panel's default since
 * 29.09.2026) against buscosun Fusion Fit 5e (the chain validated in FV, `product@5e`) on the last two weeks of the point archive,
 * at the stations. Reads the scorecard of `stack-score.mjs` (rows of `stack-extract.mjs`) and writes one compact card.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fusionfit/now-vs-5e.mjs
 *       --card=<score dir>/scorecard.json --out=<md> [--title=…]
 *
 * "now" per cell:
 *   mode S (the point is the station, the product with its station member): T/Td/Wind/Böe = `stack` — the station value
 *     M + b + w·I + c·(L − M) fitted LEAVE-DAY-OUT with a purge of ±1 valid day (the deployed table was fitted on 14.–27.09.,
 *     an in-sample number would flatter the product); clouds/precipitation and every cell without MOSMIX (> 240 h) = `product-FS`
 *     (the engine with learnedAtPoint, priorShrink:false, learnedClouds, stationValue — the in-sample table).
 *   mode L (leave-station-out: the point without its own station, MOSMIX and measurement of the nearest OTHER station) = `product-FS`.
 * References: `product@5e`, `mosmix` (mode L: the neighbour's MOSMIX), `live` (the live path, mode S), `fl-K@5e` (the learned
 * stage alone). Significance: Diebold–Mariano per issue day (HLN small-sample form), Benjamini–Hochberg over the whole card
 * (`stack-score.mjs`); * = significantly better, ! = significantly worse, else n.s. Everything is indicative (n_eff ≤ issue days).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from '../hindcast/lib/common.mjs';

const flags = parseArgs(process.argv.slice(2));
if (typeof flags.card !== 'string' || typeof flags.out !== 'string') throw new Error('--card und --out sind Pflicht');
const card = JSON.parse(readFileSync(flags.card, 'utf8'));
if (card.kind !== 'fusionfit/scorecard-stack') throw new Error(`${flags.card}: keine Stack-Scorecard (kind ${card.kind})`);
const title = typeof flags.title === 'string' ? flags.title : 'buscosun Fusion heute (Stufe fs) gegen Fit 5e — Archiv, an den Stationen';

const VARS = ['t', 'td', 'ws', 'gust', 'clct', 'precip'];
const FIT_VARS = new Set(['t', 'td', 'ws', 'gust']);
const VAR_LABEL = { t: 'T', td: 'Td', ws: 'Wind', gust: 'Böe', clct: 'Bewölkung (DE)', precip: 'Niederschlag' };
const UNIT = { t: 'K', td: 'K', ws: 'm/s', gust: 'm/s', clct: '%', precip: 'mm' };
const BINS = [0, 1, 2, 3, 4, 5];
const BIN_LABEL = ['0–6', '7–24', '25–48', '51–120', '126–240', '246–336'];
const REF = 'product@5e';

const S = (mode, v, bin, cand, st = 'all') => card.scores[`${mode}|${v}|${bin}|${cand}|${st}`] ?? null;
const P = (metric, mode, v, bin, cand, ref, st = 'all') => card.pairs[`${metric}|${mode}|${v}|${bin}|${cand}|${ref}|${st}`] ?? null;
const f = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d));
const pct = (p) => (!p || p.skill == null ? '—' : `${p.skill >= 0 ? '+' : ''}${(100 * p.skill).toFixed(1)} %${p.dm?.pAdj < 0.05 ? (p.skill > 0 ? '*' : '!') : ''}`);
const word = (p) => (!p || p.skill == null ? null : p.dm?.pAdj < 0.05 ? (p.skill > 0 ? 'better' : 'worse') : 'ns');
/** The candidate that stands for the product today in this cell (see the header). */
const nowOf = (mode, v, bin) => (mode === 'S' && FIT_VARS.has(v) && bin <= 4 && S(mode, v, bin, 'stack') ? 'stack' : 'product-FS');

const md = [`# ${title}`, ''];
const hdr = card.rows?.header ?? {};
const slots = (hdr.slots ?? []).map((s) => s.slotAt.slice(0, 10));
md.push(`Karte ${card.builtAt.slice(0, 16)}Z · Zeilen ${card.rows?.n ?? '—'} · Ausgabetage ${card.rows?.issueDays ?? '—'} (Ausgabe-Slots ab ${hdr.slotsFrom ?? slots[0] ?? '—'}, Wahrheit aus den Slots ${slots[0] ?? '—'} … ${slots[slots.length - 1] ?? '—'}) · DM-Tests ${card.tests} (BH über die Karte) · Lernstufe ${hdr.tables?.sha256?.slice(0, 12) ?? '—'} (Fit 5e) · Stationswert-Tabelle der Kette ${hdr.stack?.builtAt?.slice(0, 10) ?? '—'} (${hdr.stack?.entries ?? '—'} Einträge)`, '');
md.push('**Lesart.** „5e" = `product@5e`, die Kette wie in FV validiert (Lernstufe, learnedSpeed, learnedPrecip, Klimatologie-Schritt, Stationsmember gewichtet). „heute" = die Stufe fs, wie das Panel seit 29.09. rechnet: T/Td/Wind/Böe mit Station am Punkt = Stationswert **Leave-Day-out** (`stack`; die eingesetzte Tabelle wurde auf 14.–27.09. gefittet, eine In-sample-Zahl schmeichelte); Bewölkung, Niederschlag und die Zellen ohne MOSMIX (> 240 h) = `product-FS` (Motor mit learnedAtPoint, priorShrink:false, learnedClouds). Δ = Skill gegen die Referenz (positiv = heute besser); * signifikant besser, ! signifikant schlechter (DM je Ausgabetag, BH). Alles indikativ.', '');

// ── A: mode S ──────────────────────────────────────────────────────────────────
const tallies = {};
const tally = (key, w) => { const t = tallies[key] ?? (tallies[key] = { better: 0, worse: 0, ns: 0, missing: 0 }); t[w ?? 'missing'] += 1; };
md.push('## A — Modus S: der Punkt ist die Station (Produkt mit Stationsmember)', '', '| Zelle | n | MAE 5e | MAE heute | Δ MAE | CRPS 5e | CRPS heute | Δ CRPS | PIT außen 5e → heute | heute = | MAE MOSMIX | heute gg. MOSMIX | MAE live | heute gg. live |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const v of VARS) for (const bin of BINS) {
  const now = nowOf('S', v, bin), a = S('S', v, bin, REF), b = S('S', v, bin, now);
  if (!a || !b) continue;
  const pm = P('mae', 'S', v, bin, now, REF), pc = P('crps', 'S', v, bin, now, REF);
  const mM = S('S', v, bin, 'mosmix'), pM = P('mae', 'S', v, bin, now, 'mosmix'), mL = S('S', v, bin, 'live'), pL = P('mae', 'S', v, bin, now, 'live');
  tally('S|mae', word(pm)); tally('S|crps', word(pc));
  md.push(`| ${VAR_LABEL[v]} · ${BIN_LABEL[bin]} h | ${b.n} | ${f(a.mae)} | ${f(b.mae)} ${UNIT[v]} | ${pct(pm)} | ${f(a.crps)} | ${f(b.crps)} | ${pct(pc)} | ${f(a.pitOuter)} → ${f(b.pitOuter)} | ${now} | ${mM ? f(mM.mae) : '—'} | ${pct(pM)} | ${mL ? f(mL.mae) : '—'} | ${pct(pL)} |`);
}
md.push('');
md.push('Je Land (Δ MAE heute gegen 5e · heute gegen MOSMIX):', '', '| Zelle | DE gg. 5e | AT gg. 5e | CH gg. 5e | DE gg. MOSMIX | AT gg. MOSMIX | CH gg. MOSMIX |', '|---|---|---|---|---|---|---|');
for (const v of ['t', 'td', 'ws', 'gust']) for (const bin of [0, 1, 2, 3, 4]) {
  const now = nowOf('S', v, bin);
  if (!S('S', v, bin, now)) continue;
  const cc = (c, ref) => pct(P('mae', 'S', v, bin, now, ref, `country:${c}`));
  md.push(`| ${VAR_LABEL[v]} · ${BIN_LABEL[bin]} h | ${cc('DE', REF)} | ${cc('AT', REF)} | ${cc('CH', REF)} | ${cc('DE', 'mosmix')} | ${cc('AT', 'mosmix')} | ${cc('CH', 'mosmix')} |`);
}
md.push('');

// ── B: in-sample chain against the leave-day-out value ───────────────────────
md.push('## B — Kontrolle: die Kette mit der eingesetzten Tabelle (In-sample, `product-FS`) gegen den Leave-Day-out-Stationswert (`stack`), Modus S', '', 'Steht hier fast 0, gilt die Leave-Day-out-Zahl in A auch für die Kette, die im Panel rechnet.', '', '| Zelle | Δ MAE product-FS gg. stack | Δ CRPS |', '|---|---|---|');
for (const v of ['t', 'td', 'ws', 'gust']) for (const bin of [0, 1, 2, 3, 4]) { const pm = P('mae', 'S', v, bin, 'product-FS', 'stack'), pc = P('crps', 'S', v, bin, 'product-FS', 'stack'); if (pm || pc) md.push(`| ${VAR_LABEL[v]} · ${BIN_LABEL[bin]} h | ${pct(pm)} | ${pct(pc)} |`); }
md.push('');

// ── C: mode L ──────────────────────────────────────────────────────────────────
md.push('## C — Modus L: der Punkt OHNE eigene Station (Leave-Station-out; MOSMIX und Messung der nächsten anderen Station)', '', 'heute = `product-FS` (der Stationswert greift ohne Station am Punkt nicht).', '', '| Zelle | n | MAE 5e | MAE heute | Δ MAE | CRPS 5e | CRPS heute | Δ CRPS | PIT außen 5e → heute | MAE MOSMIX (Nachbar) | heute gg. MOSMIX | heute gg. fl-K@5e (MAE) |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const v of VARS) for (const bin of BINS) {
  const a = S('L', v, bin, REF), b = S('L', v, bin, 'product-FS');
  if (!a || !b) continue;
  const pm = P('mae', 'L', v, bin, 'product-FS', REF), pc = P('crps', 'L', v, bin, 'product-FS', REF);
  const mM = S('L', v, bin, 'mosmix'), pM = P('mae', 'L', v, bin, 'product-FS', 'mosmix'), pK = P('mae', 'L', v, bin, 'product-FS', 'fl-K@5e');
  tally('L|mae', word(pm)); tally('L|crps', word(pc));
  md.push(`| ${VAR_LABEL[v]} · ${BIN_LABEL[bin]} h | ${b.n} | ${f(a.mae)} | ${f(b.mae)} ${UNIT[v]} | ${pct(pm)} | ${f(a.crps)} | ${f(b.crps)} | ${pct(pc)} | ${f(a.pitOuter)} → ${f(b.pitOuter)} | ${mM ? f(mM.mae) : '—'} | ${pct(pM)} | ${pct(pK)} |`);
}
md.push('');
md.push('Je Land (Δ MAE heute gegen 5e, Modus L):', '', '| Zelle | DE | AT | CH |', '|---|---|---|---|');
for (const v of ['t', 'td', 'ws', 'gust']) for (const bin of [0, 1, 2, 3, 4]) { if (!S('L', v, bin, 'product-FS')) continue; const cc = (c) => pct(P('mae', 'L', v, bin, 'product-FS', REF, `country:${c}`)); md.push(`| ${VAR_LABEL[v]} · ${BIN_LABEL[bin]} h | ${cc('DE')} | ${cc('AT')} | ${cc('CH')} |`); }
md.push('');

// ── D: the two switch candidates of the day (only when the card carries them) ───
if (S('S', 'clct', 0, 'product-FS+atoms')) {
  md.push('## D — AX-4 Wolkenatome: `product-FS+atoms` (Tabelle mit Atomen, Familie cloudMix) gegen `product-FS` (heute) — Bewölkung (DE)', '', '| Zelle | Modus | n | CRPS heute | CRPS Atome | Δ CRPS | MAE heute | MAE Atome | Δ MAE | PIT außen heute → Atome | Atome gg. MOSMIX (CRPS) |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const mode of ['S', 'L']) for (const bin of BINS) {
    const a = S(mode, 'clct', bin, 'product-FS'), b = S(mode, 'clct', bin, 'product-FS+atoms');
    if (!a || !b) continue;
    md.push(`| Bewölkung · ${BIN_LABEL[bin]} h | ${mode} | ${b.n} | ${f(a.crps)} | ${f(b.crps)} | ${pct(P('crps', mode, 'clct', bin, 'product-FS+atoms', 'product-FS'))} | ${f(a.mae)} | ${f(b.mae)} | ${pct(P('mae', mode, 'clct', bin, 'product-FS+atoms', 'product-FS'))} | ${f(a.pitOuter)} → ${f(b.pitOuter)} | ${pct(P('crps', mode, 'clct', bin, 'product-FS+atoms', 'mosmix'))} |`);
  }
  md.push('', `K7 (Atome berühren nur die Bewölkung): ${card.verdicts?.K7 ?? '—'} · Verdikt AX-4 nach der Regel von stack-score: ${card.verdicts?.['AX-4'] ?? '—'}`, '');
}
if (S('S', 'ws', 1, 'stack-cc')) {
  md.push('## E — E-AX-7 Landesparameter: `stack-cc` (Tabelle je Land) gegen `stack` (gepoolt, heute) und gegen MOSMIX — Modus S, MAE', '', '| Zelle | alle gg. stack | CH gg. stack | AT gg. stack | DE gg. stack | CH gg. MOSMIX heute → mit Land |', '|---|---|---|---|---|---|');
  for (const v of ['t', 'td', 'ws', 'gust']) for (const bin of [0, 1, 2, 3, 4]) {
    if (!S('S', v, bin, 'stack-cc')) continue;
    const cc = (c) => pct(P('mae', 'S', v, bin, 'stack-cc', 'stack', c));
    md.push(`| ${VAR_LABEL[v]} · ${BIN_LABEL[bin]} h | ${cc('all')} | ${cc('country:CH')} | ${cc('country:AT')} | ${cc('country:DE')} | ${pct(P('mae', 'S', v, bin, 'stack', 'mosmix', 'country:CH'))} → ${pct(P('mae', 'S', v, bin, 'stack-cc', 'mosmix', 'country:CH'))} |`);
  }
  md.push('', `Verdikt AX-5 nach der Regel von stack-score: ${card.verdicts?.['AX-5'] ?? '—'}`, '');
}

// ── F: the product AFTER both switches (fs + country parameters + cloud atoms) against 5e and MOSMIX ──
if (S('S', 'ws', 1, 'stack-cc') && S('S', 'clct', 0, 'product-FS+atoms')) {
  /** The candidate that stands for the product after E-AX-7 and AX-4: country station value, atoms for the clouds, else as today. */
  const nextOf = (mode, v, bin) => (v === 'clct' ? 'product-FS+atoms' : mode === 'S' && FIT_VARS.has(v) && bin <= 4 && S(mode, v, bin, 'stack-cc') ? 'stack-cc' : nowOf(mode, v, bin));
  const t2 = {};
  const tally2 = (key, w) => { const t = t2[key] ?? (t2[key] = { better: 0, worse: 0, ns: 0, missing: 0 }); t[w ?? 'missing'] += 1; };
  md.push('## F — Das Produkt NACH beiden Schaltungen (fs + Landesparameter E-AX-7 + Wolkenatome AX-4) gegen 5e, gegen heute und gegen MOSMIX — Modus S', '', '| Zelle | n | MAE 5e | MAE heute | MAE danach | Δ danach gg. 5e | Δ danach gg. heute | Δ CRPS gg. 5e | PIT außen 5e → danach | danach = | Δ danach gg. MOSMIX | Δ CH gg. MOSMIX |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const v of VARS) for (const bin of BINS) {
    const now = nowOf('S', v, bin), nxt = nextOf('S', v, bin), a = S('S', v, bin, REF), b = S('S', v, bin, now), c = S('S', v, bin, nxt);
    if (!a || !b || !c) continue;
    const pm = P('mae', 'S', v, bin, nxt, REF), pc = P('crps', 'S', v, bin, nxt, REF);
    const pNow = nxt === now ? null : P('mae', 'S', v, bin, nxt, now);
    tally2('S|mae', word(pm)); tally2('S|crps', word(pc));
    md.push(`| ${VAR_LABEL[v]} · ${BIN_LABEL[bin]} h | ${c.n} | ${f(a.mae)} | ${f(b.mae)} | ${f(c.mae)} ${UNIT[v]} | ${pct(pm)} | ${nxt === now ? '= heute' : pct(pNow)} | ${pct(pc)} | ${f(a.pitOuter)} → ${f(c.pitOuter)} | ${nxt} | ${pct(P('mae', 'S', v, bin, nxt, 'mosmix'))} | ${pct(P('mae', 'S', v, bin, nxt, 'mosmix', 'country:CH'))} |`);
  }
  md.push('', `Modus S danach gegen 5e: MAE ${t2['S|mae']?.better ?? 0} signifikant besser · ${t2['S|mae']?.worse ?? 0} signifikant schlechter · ${t2['S|mae']?.ns ?? 0} gleichauf; CRPS ${t2['S|crps']?.better ?? 0} / ${t2['S|crps']?.worse ?? 0} / ${t2['S|crps']?.ns ?? 0}.`, '');
  md.push('Modus L (ohne eigene Station) ändert sich nur bei der Bewölkung (Atome); die Landesparameter greifen dort nicht (Stationswert braucht eine Station am Punkt): siehe D.', '');
}

// ── summary ────────────────────────────────────────────────────────────────────
const tl = (k) => { const t = tallies[k] ?? { better: 0, worse: 0, ns: 0, missing: 0 }; return `${t.better} signifikant besser · ${t.worse} signifikant schlechter · ${t.ns} gleichauf${t.missing ? ` · ${t.missing} ohne Paar` : ''}`; };
md.push('## Zusammenfassung (heute gegen 5e, Zellen Größe × Bin)', '', `- Modus S, MAE: ${tl('S|mae')}`, `- Modus S, CRPS: ${tl('S|crps')}`, `- Modus L, MAE: ${tl('L|mae')}`, `- Modus L, CRPS: ${tl('L|crps')}`, '');
md.push('**Nicht in dieser Messung** (die Karte bewertet native Schritte an Archivpunkten): AX-3 (Anomalie-Interpolation, nur zwischen den Schritten), AX-1 (Messungen am Punkt — im Archiv liegt die Messung ohnehin am Punkt), sowie alles hinter Gates (AX-4 Wolkenatome, AX-5 Landesparameter, AX-7 ENS-Mittel, AX-8 MOSMIX-S, AX-9 Klimagitter, AX-10 INCA). Beide Ketten rechnen auf denselben archivierten Eingaben mit derselben Lernstufe (Fit 5e); der Unterschied ist allein die Kette (learnedAtPoint, priorShrink:false, learnedClouds, Stationswert).', '');

mkdirSync(dirname(flags.out), { recursive: true });
writeFileSync(flags.out, md.join('\n'));
console.log(`[now-vs-5e] geschrieben ${flags.out}: ${md.length} Zeilen; ${Object.entries(tallies).map(([k, t]) => `${k} ${t.better}/${t.worse}/${t.ns}`).join(' · ')}`);
