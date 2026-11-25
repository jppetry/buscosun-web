#!/usr/bin/env node
/**
 * GM-10b (E-GM-44) — counter-check of block I of `verify:glacier-snowcal`, block L of `verify:glacier-melt` and I14–I17 of `verify:glacier-snowpack`:
 * every mutation below breaks one rule of the predicted factor (table, reader, rule, search for x1), of the factor rule in the melt state (V-GM-91) or
 * of the factor in the snowpack (V-GM-86); a verifier must turn red for each. Runs ONLY on a COPY of the tree (`--root`, never the living checkout):
 * the file is changed, the verifiers are run in that copy, the file is restored (also on failure). Result: `--out` (default gm10b-mutations.json here).
 *
 *   node audit/gletscher-schneemodell/gm10b-mutations.mjs --root=<copy of the tree with node_modules> [--out=<json>] [--only=<text>|<text>]
 *
 * Never next to a full local run or the forcing build (memory). After an aborted round: throw the copy away.
 */
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;
const ROOT = arg('root') ? resolve(arg('root')) : null;
const LIVING = resolve(import.meta.dirname, '..', '..');
if (!ROOT || !existsSync(join(ROOT, 'scripts', 'glacier', 'melt.mjs'))) { console.error('--root=<Kopie des Baums> fehlt oder ist kein Baum'); process.exit(2); }
if (realpathSync(ROOT) === realpathSync(LIVING)) { console.error('nie im lebenden Arbeitsbaum: eine Kopie nennen'); process.exit(2); }
const SP = 'scripts/glacier/lib/snowcalPredict.mjs', SG = 'scripts/glacier/lib/snowcalGlaciers.mjs', MELT = 'scripts/glacier/melt.mjs', SPC = 'scripts/glacier/lib/snowpackcore.mjs';
const SEED = 'scripts/glacier/snowpack-seed.mjs', TOOL = 'scripts/glacier/snowcal-predict.mjs', MCT = 'src/glacier/glacierMeltContract.ts', SCT = 'src/glacier/glacierSnowpackContract.ts';
// fastest verifier first: the first red one ends the try
const VERIFIERS = ['verify-glacier-snowcal.mjs', 'verify-glacier-melt.mjs', 'verify-glacier-snowpack.mjs'];
const MUT = [
  // the source attribution of the table (GLAMOS confirmed the use on 25.11.2026; CC BY 4.0 citation stays a duty)
  ['Vertrag verlangt die Quellenangabe der Tabelle nicht', SP, "  if (JSON.stringify(doc.sources) !== JSON.stringify(SNOW_FACTOR_SOURCES)) out.push('sources: Quellenangabe (mit dem Zitierwortlaut von GLAMOS, Release 2025) fehlt oder weicht ab');\n", ''],
  // the switch and the producer
  ['Voreinstellung „Faktor je Gletscher“ = predicted', SG, "export const GLACIER_FACTOR_DEFAULT = 'off';", "export const GLACIER_FACTOR_DEFAULT = 'predicted';"],
  ['Kommandozeile reicht die Tabelle nicht durch', MELT, "'glacier-factor-table': args['glacier-factor-table'], ", ''],
  ['„predicted“ ohne genannte Tabelle bricht nicht mit Grund ab', MELT, "    if (!named) throw new Error('Faktor je Gletscher „predicted“ braucht die Tabelle vorhergesagter Faktoren (--glacier-factor-table=<json> oder GLACIER_SNOW_GLACIER_FACTOR_TABLE)');\n", ''],
  ['fehlende Tabelle fällt still auf eine leere zurück', MELT, "    try { raw = readFileSync(file); } catch (e) { throw new Error(`Tabelle vorhergesagter Faktoren nicht lesbar (${file}): ${String(e?.message ?? e).split('\\n')[0]}`); }", "    try { raw = readFileSync(file); } catch { raw = Buffer.from('{}'); }"],
  ['Schalter gelten auch neben „gate-c“', MELT, "if (precipRule !== 'country') throw new Error('Faktor je Gletscher / Form je Band gelten nur mit dem Niederschlagsfaktor „country“');", ''],
  ['Producer übergeht die vorhergesagte Tabelle', MELT, 'const glacierFactorOf = (g) => (glTab ? glTab.factorOf(g.id) ?? predTab?.factorOf(g.id) ?? null : null);', 'const glacierFactorOf = (g) => (glTab ? glTab.factorOf(g.id) ?? null : null);'],
  ['Dokument nennt die vorhergesagten Zeilen nicht', MELT, "...(predTab ? { predicted: { ...predTab.block, applied: { predicted: glApplied.predicted, 'predicted-shrunk': glApplied['predicted-shrunk'] } } } : {})", '...{}'],
  ['Statuszeile zählt die vorhergesagten Zeilen nicht', MELT, "...(predTab ? { predicted: glApplied.predicted.length, predictedShrunk: glApplied['predicted-shrunk'].length } : {}), ", ''],
  // V-GM-91
  ['V-GM-91: Zustand eines anderen Faktors wird fortgesetzt', MELT, '      if ((was == null) !== (now == null) || (was != null && Math.abs(was - now) > 1e-9)) { c = null; respun.push(g.id); }', '      void was; void now;'],
  ['V-GM-91: Zustand nennt die Faktorregel nicht', MELT, '  if (factorRule) {\n    stateOut.fac =', '  if (false) {\n    stateOut.fac ='],
  ['V-GM-91: Dokument zählt neu begonnene nicht', MELT, ', ...(respun.length ? { respun: respun.length } : {}) },\n    build, glaciers: rows, skipped,', ' },\n    build, glaciers: rows, skipped,'],
  ['V-GM-91: Vertrag prüft `fac` nicht', MCT, "  if (s.fac !== undefined) {", "  if (false) {"],
  // V-GM-86
  ['V-GM-86: Schneedecke rechnet wieder mit dem Landeswert', MELT, 'const factor = precip ? z.map(() => glacierFactorOf(g) ?? precip.factorOf(g.region))', 'const factor = precip ? z.map(() => precip.factorOf(g.region))'],
  ['V-GM-86: Schneedecke nennt die Faktorregel nicht', MELT, '...(factorRule ? { factor: factorRule } : {}) } };', '} };'],
  ['V-GM-86: Zustand einer anderen Faktorregel wird fortgesetzt', SPC, "  if ((state.rules?.factor ?? null) !== (rules.factor ?? null)) return", '  if (false) return'],
  ['V-GM-86: Vertrag prüft die Faktorregel des Zustands nicht', SCT, "  if (s.rules?.factor !== undefined && (", '  if (false && ('],
  ['Kopf ohne Paare je Grundlage', MELT, "...(spSpread && predTab ? { nowBases: predTab.spread } : {}),", ''],
  ['Vertrag nimmt Paare je Grundlage ohne Herkunft „measured“', SCT, "x.origin === 'measured' && x.verified === false", 'x.verified === false'],
  // the reader
  ['Leser: Tabelle gegen eine andere eigene Tabelle gilt', SP, "  if (!problems.length && doc.inputs.ownTable !== ownSha) problems.push(", '  if (false) problems.push('],
  ['Leser: Zeile „own“ mit anderem Faktor gilt', SP, "      if (g.b === 'own' && (o == null || Math.abs(o - g.F) > 1e-9)) {", "      if (g.b === 'own' && o == null) {"],
  ['Leser: Gletscher mit eigenem Faktor als „predicted“ gilt', SP, "      if (g.b !== 'own' && o != null) {", '      if (false) {'],
  ['Leser: anderer Landeswert im Lauf gilt', SP, '      if (Math.abs(countryOf(id) - doc.inputs.countryF) > 1e-9) {', '      if (false) {'],
  ['Leser gibt auch Zeilen „country“ heraus', SP, "factorOf: (id) => (g[id] && g[id].b !== 'country' ? g[id].F : null),", 'factorOf: (id) => (g[id] ? g[id].F : null),'],
  ['Block nennt den vorhergesagten Faktor gemessen', SP, "      origin: 'computed', verified: false, counts: doc.counts },", "      origin: 'measured', verified: false, counts: doc.counts },"],
  // the contract of the table
  ['Vertrag: Herkunft „measured“ gilt', SP, "  if (doc.origin !== 'computed') out.push(", '  if (false) out.push('],
  ['Vertrag: vorhergesagter Faktor muss nicht gekappt sein', SP, "    if ((g.b === 'predicted' || g.b === 'predicted-shrunk') && cal && !within(g.F, cal.own)) out.push(", '    if (false) out.push('],
  ['Vertrag: volle Form C unter 5 Zellen gilt', SP, "    if (g.b === 'predicted' && !(g.n >= r?.minCells)) out.push(", '    if (false) out.push('],
  ['Vertrag: Paare je Grundlage ohne Herkunft gelten', SP, "  if (sp && sp.origin !== 'measured') out.push(", '  if (false) out.push('],
  ['Vertrag: Spanne einer Zeile passt nicht zur Grundlage', SP, "    if (!Array.isArray(g.q) || g.q.length !== 2 || !s ||", '    if (!Array.isArray(g.q) || g.q.length !== 2 || !s || false &&'],
  ['Vertrag: Landeswert-Zeile mit anderem Wert gilt', SP, "    if (g.b === 'country' && (Math.abs(g.F - doc.inputs?.countryF) > 1e-9 || !g.why)) out.push(", "    if (g.b === 'country' && !g.why) out.push("],
  // the rule
  ['Regel: unter 5 Zellen nicht geschrumpft', SP, '  const raw = full ? Fc : Math.exp(rule.shrink * Math.log(Fc) + (1 - rule.shrink) * Math.log(countryF));', '  const raw = Fc;'],
  ['Regel: Schrumpfung 0,6 statt ½', SP, 'minCells: 5, shrink: 0.5,', 'minCells: 5, shrink: 0.6,'],
  ['Regel: genau 5 Zellen gelten als klein', SP, '  const full = g.nIn >= rule.minCells;', '  const full = g.nIn > rule.minCells;'],
  ['Regel: keine Kappung', SP, '  const F = Math.min(cal.own[1], Math.max(cal.own[0], raw));', '  const F = raw;'],
  ['Regel: kleiner als jeder Eichgletscher wird vorhergesagt', SP, "  if (!(g.areaKm2 >= cal.minArea)) return { basis: 'country', F: countryF, why: 'smaller-than-calibration' };", ''],
  ['Regel: außerhalb der Eichspanne wird vorhergesagt', SP, "  if (outside.length) return { basis: 'country', F: countryF, why: `outside:${outside.join('+')}` };", ''],
  ['Regel: Rand der Eichspanne gilt als außerhalb', SP, '  const outside = rule.predictors.filter((n) => !(g[n] >= cal.ranges[n][0] && g[n] <= cal.ranges[n][1]));', '  const outside = rule.predictors.filter((n) => !(g[n] > cal.ranges[n][0] && g[n] < cal.ranges[n][1]));'],
  ['Vorhersage ohne Skalierung der Prädiktoren', SP, 'b * ((x[j] - m.mu[j]) / m.sc[j])', 'b * (x[j] - m.mu[j])'],
  // the search for x1 and the tool
  ['x1-Suche: Schnitt einen Gitterpunkt zu spät', SP, '  const j = hi - 1, d = at(hi) - at(j);', '  const j = hi, d = at(Math.min(n - 1, hi + 1)) - at(j);'],
  ['x1-Suche: Ziel genau am unteren Rand nicht gekappt', SP, '  if (target <= at(0)) return { k: KS[0], capped: true, evals: memo.size };', '  if (target < at(0)) return { k: KS[0], capped: true, evals: memo.size };'],
  ['x1: Winter ohne Zuwachs zählt mit', TOOL, '    if (!(dS > 0)) { dropped++; continue; }', '    if (!(dS > -1e9)) { dropped++; continue; }'],
  ['x1: zwei Winter reichen', 'scripts/glacier/lib/snowcalPredict.mjs', 'export const SNOW_FACTOR_MIN_GRID_WINTERS = 3;', 'export const SNOW_FACTOR_MIN_GRID_WINTERS = 2;'],
  // the re-spin of the melt state
  ['Neu-Einschwingen: Gletscher mit neuem Faktor behält den alten Schnee', SEED, '    g[id] = stateRowOf(out.state); respun.push(id);', '    respun.push(id);'],
  ['Neu-Einschwingen: Stunde ohne Antrieb wird als null gerechnet', SEED, "      else if (gl.fill?.[h]) { const fx = gl.fill[h]; t.push(fx.T[1]); p.push(Math.max(0, fx.P ?? 0)); gg.push(Math.max(0, fx.G ?? 0)); }", '      else { t.push(0); p.push(0); gg.push(0); }'],
  ['Neu-Einschwingen: Regel wird nicht vermerkt', SEED, '  if (rule) next.fac = { rule, f }; else delete next.fac;', '  delete next.fac;'],
  ['Neu-Einschwingen: Gletscher ohne Antrieb behält alten Schnee', SEED, "    if (!gl) { missing.push(id); delete g[id]; continue; }", '    if (!gl) { missing.push(id); continue; }'],
];
// `--check`: only say whether every pattern is found exactly once in the copy (no verifier runs)
if (process.argv.includes('--check')) {
  const bad = MUT.map(([name, file, from]) => { const t = readFileSync(join(ROOT, file), 'utf8'), nl = t.includes('\r\n') ? '\r\n' : '\n'; return [name, t.split(from.replaceAll('\n', nl)).length - 1]; }).filter(([, n]) => n !== 1);
  console.log(JSON.stringify({ mutations: MUT.length, notOnce: bad }));
  process.exit(bad.length ? 1 : 0);
}
const runOne = (v) => {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--import', './scripts/lib/register-ts.mjs', `scripts/${v}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { verifier: v.replace(/^verify-|\.mjs$/g, ''), status: r.status, failed: (r.stdout.match(/^FAIL .*$/gm) ?? []).map((l) => l.replace(/^FAIL /, '').split(' ')[0].trim()), crashed: r.status !== 0 && !/^FAIL /m.test(r.stdout), tail: r.status !== 0 && !/^FAIL /m.test(r.stdout) ? (r.stderr ?? '').split('\n').filter(Boolean).slice(-2).join(' | ') : null };
};
const firstRed = () => { for (const v of VERIFIERS) { const r = runOne(v); if (r.status !== 0) return r; } return null; };
const ONLY = arg('only');
const base = VERIFIERS.map(runOne);
if (base.some((r) => r.status !== 0)) { console.error('the verifiers are not green in the copy before the mutations', JSON.stringify(base)); process.exit(2); }
const out = [];
for (const [name, file, from, to] of MUT) {
  if (ONLY && !ONLY.split('|').some((t) => name.includes(t))) continue;
  const p = join(ROOT, file), orig = readFileSync(p, 'utf8'), nl = orig.includes('\r\n') ? '\r\n' : '\n', fromN = from.replaceAll('\n', nl), toN = to.replaceAll('\n', nl);
  let res = { name, file };
  try {
    if (orig.split(fromN).length !== 2) throw new Error(`pattern found ${orig.split(fromN).length - 1} times`);
    writeFileSync(p, orig.replace(fromN, () => toN));
    const red = firstRed();
    res = { ...res, noticed: !!red, by: red ? `${red.verifier}: ${red.failed.join(', ') || `Abbruch (${red.tail})`}` : null, crashedOnly: !!red && (red.crashed || red.failed.length === 0) };
  } catch (e) { res = { ...res, error: String(e.message) }; }
  finally { writeFileSync(p, orig); }
  out.push(res);
  console.log(`${res.noticed ? 'bemerkt   ' : 'ÜBERSEHEN '} ${name}${res.by ? ` (${res.by})` : ''}${res.crashedOnly ? ' [nur als Abbruch]' : ''}${res.error ? ` — ${res.error}` : ''}`);
}
const after = VERIFIERS.map(runOne);
const sum = { generated: new Date().toISOString(), root: ROOT, verifiers: VERIFIERS.map((v) => v.replace(/^verify-|\.mjs$/g, '').replace('glacier-', 'verify:glacier-')), greenBefore: true, greenAfter: after.every((r) => r.status === 0),
  noticed: out.filter((o) => o.noticed).length, of: out.length, crashedOnly: out.filter((o) => o.crashedOnly).length, errors: out.filter((o) => o.error).length, mutations: out };
writeFileSync(arg('out') ?? join(import.meta.dirname, ONLY ? 'gm10b-mutations-rerun.json' : 'gm10b-mutations.json'), JSON.stringify(sum, null, 1));
console.log(`${sum.noticed} von ${sum.of} bemerkt (${sum.crashedOnly} nur als Abbruch), ${sum.errors} nicht angewandt; Prüfer danach ${sum.greenAfter ? 'grün' : 'ROT'}`);
