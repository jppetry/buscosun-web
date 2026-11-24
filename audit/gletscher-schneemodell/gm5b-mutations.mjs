#!/usr/bin/env node
/**
 * GM-5b (E-GM-9, E-GM-31) — counter-check of block K of `verify:glacier-melt`, block H of `verify:glacier-snowcal` and I14 of `verify:glacier-snowpack`:
 * every mutation below breaks one rule of the factor per glacier, of the shape per band, of the table or of the tool of the second round; a verifier
 * must turn red for each. The file is changed, the verifiers are run, the file is restored (also on failure). Result: gm5b-mutations.json.
 *
 *   node audit/gletscher-schneemodell/gm5b-mutations.mjs [--only=<text>|<text>]
 *
 * Do not run it next to a producer run: the run would load the mutated code. After an aborted round: restore the mutated file from git, run the verifiers.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const MC = 'scripts/glacier/lib/meltcore.mjs', SG = 'scripts/glacier/lib/snowcalGlaciers.mjs', MELT = 'scripts/glacier/melt.mjs', FIT = 'scripts/glacier/snowcal-fit2.mjs', TAB = 'scripts/glacier/snowcal-table2.mjs';
const VERIFIERS = ['verify-glacier-melt.mjs', 'verify-glacier-snowcal.mjs', 'verify-glacier-snowpack.mjs'];
const MUT = [
  // the switches and the reader
  ['Voreinstellung „Faktor je Gletscher“ an', SG, "export const GLACIER_FACTOR_DEFAULT = 'off';", "export const GLACIER_FACTOR_DEFAULT = 'on';"],
  ['Voreinstellung „Form je Band“ an', SG, "export const GLACIER_SHAPE_DEFAULT = 'off';", "export const GLACIER_SHAPE_DEFAULT = 'on';"],
  ['unbekanntes Wort des Faktor-Schalters fällt zurück', SG, "wordOf(value, GLACIER_FACTOR_MODES, GLACIER_FACTOR_DEFAULT, 'Faktor je Gletscher')", '(GLACIER_FACTOR_MODES.includes(value) ? value : GLACIER_FACTOR_DEFAULT)'],
  ['unbekanntes Wort des Form-Schalters fällt zurück', SG, "wordOf(value, GLACIER_SHAPE_MODES, GLACIER_SHAPE_DEFAULT, 'Form je Band')", '(GLACIER_SHAPE_MODES.includes(value) ? value : GLACIER_SHAPE_DEFAULT)'],
  ['Umgebungsvariable des Faktor-Schalters wird nicht gelesen', MELT, "glacierFactorModeOf(opts['glacier-factor'] ?? process.env.GLACIER_SNOW_GLACIER_FACTOR)", "glacierFactorModeOf(opts['glacier-factor'])"],
  ['Umgebungsvariable des Form-Schalters wird nicht gelesen', MELT, "glacierShapeModeOf(opts['glacier-shape'] ?? process.env.GLACIER_SNOW_GLACIER_SHAPE)", "glacierShapeModeOf(opts['glacier-shape'])"],
  ['Schalter gelten auch neben „gate-c“', MELT, "if (precipRule !== 'country') throw new Error('Faktor je Gletscher / Form je Band gelten nur mit dem Niederschlagsfaktor „country“');", ''],
  ['Tabelle je Gletscher wird auch ohne Schalter geöffnet', MELT, 'if (glFactor || glShape) {', 'if (true) {'],
  ['Faktor an der Grenze wird benutzt', SG, "factorOf: (id) => (factor && g[id] && g[id].atBound !== true ? g[id].F : null),", 'factorOf: (id) => (factor && g[id] ? g[id].F : null),'],
  ['Faktor wirkt auch ohne seinen Schalter', SG, "factorOf: (id) => (factor && g[id] && g[id].atBound !== true ? g[id].F : null),", 'factorOf: (id) => (g[id] && g[id].atBound !== true ? g[id].F : null),'],
  ['Form wirkt auch ohne ihren Schalter', SG, 'corrOf: (id, zb, w) => (shape && g[id] ? shapeCorrOf(g[id].shape, zb, w) : null),', 'corrOf: (id, zb, w) => (g[id] ? shapeCorrOf(g[id].shape, zb, w) : null),'],
  ['Form ist nicht mittelwertfrei', SG, 'return s.map((v) => Math.max(floor, 1 + shape.m * (v - bar)));', 'return s.map((v) => Math.max(floor, 1 + shape.m * v));'],
  ['Schrumpfung der Form wird nicht angewandt', SG, 'return s.map((v) => Math.max(floor, 1 + shape.m * (v - bar)));', 'return s.map((v) => Math.max(floor, 1 + (v - bar)));'],
  ['Untergrenze der Form fehlt', SG, 'return s.map((v) => Math.max(floor, 1 + shape.m * (v - bar)));', 'return s.map((v) => 1 + shape.m * (v - bar));'],
  ['Form zwischen den Stützstellen nicht linear', SG, 'return shape.s[i] + (shape.s[i + 1] - shape.s[i]) * (x - i);', 'return shape.s[i];'],
  ['Form über der höchsten Stützstelle hochgerechnet', SG, 'if (x >= n - 1) return shape.s[n - 1];', 'if (x >= n - 1) return shape.s[n - 1] + (shape.s[n - 1] - shape.s[n - 2]) * (x - n + 1);'],
  ['Leser nimmt einen Faktor, dessen Urteil nicht trägt', SG, "if (!problems.length && factor && doc.gate.factor !== true) problems.push(", 'if (false) problems.push('],
  ['Leser nimmt eine Form, deren Urteil nicht trägt', SG, "if (!problems.length && shape && doc.gate.shape !== true) problems.push(", 'if (false) problems.push('],
  // the contract of the table
  ['Vertrag: `gate` darf dem Urteil widersprechen', SG, "if (doc.gate?.factor !== v.K6.carries) out.push('gate.factor widerspricht dem Urteil K6');", ''],
  ['Vertrag: Vermerk „atBound“ wird nicht geprüft', SG, 'out.push(`${id}: Vermerk „atBound“ passt nicht zum Faktor`);', 'void 0;'],
  ['Vertrag: Faktor außerhalb der Grenzen gilt', SG, "if (!within(g.F, SNOWCAL_GLACIERS_BOUNDS.F) || g.origin !== 'measured') out.push(", "if (g.origin !== 'measured') out.push("],
  ['Vertrag: Gletscher außerhalb des Katalogs gilt', SG, 'if (catalogIds && !catalogIds.has(id)) out.push(`${id}: nicht im Katalog`);', ''],
  ['Vertrag: weniger als vier Winter gelten', SG, 'g.winters < SNOWCAL_GLACIERS_BOUNDS.minWinters) out.push', 'g.winters < 1) out.push'],
  ['Vertrag: andere Schmelze als die des Betriebs gilt', SG, "if (doc.melt?.model !== 'eti' || !(doc.melt.TF > 0) || !(doc.melt.SRF > 0)) out.push(", 'if (false) out.push('],
  // the producer
  ['Gletscher mit Eintrag rechnet trotzdem mit dem Regionswert', MELT, 'pf: glTab.factorOf(g.id) ?? precip.factorOf(g.region), pGrad: precip.gradient, corrOf:', 'pf: precip.factorOf(g.region), pGrad: precip.gradient, corrOf:'],
  ['Form wird dem Kern nicht übergeben', MELT, '...(corr ? { corr } : {}) });', '});'],
  ['Dokument nennt die Gletscher nicht', MELT, 'precip: glTab ? { ...precip.block, glaciers: { ...glTab.block, applied: { factor: glApplied.factor, shape: glApplied.shape } } } : precip.block', 'precip: precip.block'],
  ['Statuszeile zählt die Gletscher nicht', MELT, '...(glTab ? { glacier: { factor: glApplied.factor.length, shape: glApplied.shape.length } } : {}) },', '},'],
  ['Faktor an der Grenze wird als angewandt genannt', MELT, 'if (glTab.factorOf(g.id) != null) glApplied.factor.push(g.id);', 'if (glTab.has(g.id)) glApplied.factor.push(g.id);'],
  ['Form wird ohne ihren Schalter als angewandt genannt', MELT, 'if (glTab.shape && glTab.has(g.id)) glApplied.shape.push(g.id);', 'if (glTab.has(g.id)) glApplied.shape.push(g.id);'],
  ['Schneedecke rechnet mit dem Faktor des Gletschers', MELT, 'const factor = precip ? z.map(() => precip.factorOf(g.region))', 'const factor = precip ? z.map(() => paramsOf(g).pf)'],
  // the core
  ['Kern ignoriert den Multiplikator je Band', MC, 'const corr = corrIn ?? bands.zb.map(', 'const corr = bands.zb.map('],
  ['Kern nimmt eine Liste, die nicht zu den Bändern passt', MC, "throw new Error('simulate: corr passt nicht zu den Bändern');", 'void 0;'],
  // the tool of the round and the table tool
  ['Faktor eines Winters aus ALLEN Wintern (Winter nicht ausgelassen)', FIT, 'cases.push({ it, key, country, FL, Fown: fitF(others),', 'cases.push({ it, key, country, FL, Fown: fitF(list),'],
  ['Landeswert MIT dem Gletscher', FIT, "const FL = fitF(items.filter((it) => it.rec.country === country && it.rec.key !== key));", "const FL = fitF(items.filter((it) => it.rec.country === country));"],
  ['Form MIT dem eigenen Winter', FIT, 'n: others.length, sh: others.map((x) => shapes.get(x)), foreign });', 'n: others.length, sh: list.map((x) => shapes.get(x)), foreign });'],
  ['Negativkontrolle nimmt die eigene Form', FIT, 'const foreign = byG.get(scored[(gi + 1) % scored.length]).map((it) => shapes.get(it));', 'const foreign = byG.get(scored[gi]).map((it) => shapes.get(it));'],
  ['Form im Werkzeug nicht mittelwertfrei', FIT, 'return s.map((v) => Math.max(CAL2.shapeFloor, 1 + m * (v - bar)));', 'return s.map((v) => Math.max(CAL2.shapeFloor, 1 + m * v));'],
  ['Strahlung ohne Höhenzuschlag', FIT, 'else g[i] = v * scale;', 'else g[i] = v;'],
  ['Stunde ohne Messung bekommt vollen Klarhimmel', FIT, 'gUnknown: 0.55,', 'gUnknown: 1,'],
  ['Stunden ohne Messung werden nicht gezählt', FIT, 'if (v == null || !Number.isFinite(v)) { miss++; g[i] = gc[i]; }', 'if (v == null || !Number.isFinite(v)) { g[i] = gc[i]; }'],
  ['gekappter Multiplikator wird nicht als gekappt gezählt', FIT, 'return { k: CAL2.kMax, capped: true };', 'return { k: CAL2.kMax, capped: false };'],
  ['Kennzahl s1 ohne Flächengewicht', FIT, 'rec.b.forEach((x, b) => { s1 += x.w * Math.abs(e[b]); s3 += x.w * e[b]; });', 'rec.b.forEach((x, b) => { s1 += Math.abs(e[b]) / rec.b.length; s3 += x.w * e[b]; });'],
  ['Werkzeug rechnet mit Gradtag statt mit der Schmelze des Betriebs', FIT, "const simArgs = (rec, m) => ({ ela: rec.zMed, t: rec.t, g: m.clear ? rec.gClear : rec.g, p: rec.p, zT: rec.zT, zP: rec.zMed, TF: m.TF, SRF: m.SRF, ddf: m.ddf ?? null, model: m.model, pGrad: 0 });", "const simArgs = (rec, m) => ({ ela: rec.zMed, t: rec.t, g: m.clear ? rec.gClear : rec.g, p: rec.p, zT: rec.zT, zP: rec.zMed, TF: m.TF, SRF: m.SRF, ddf: 0.165, model: 'ddf', pGrad: 0 });"],
  ['Tabellen-Werkzeug lässt den Vermerk „atBound“ weg', TAB, '...(g.F <= lo + 1e-9 || g.F >= hi - 1e-9 ? { atBound: true } : {}), shape: g.shape };', 'shape: g.shape };'],
  ['Tabellen-Werkzeug nennt die Tabelle „vom Producer benutzt“', TAB, 'usedByProducer: false,', 'usedByProducer: true,'],
];
const runOne = (v) => {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--import', './scripts/lib/register-ts.mjs', `scripts/${v}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { verifier: v.replace(/^verify-|\.mjs$/g, ''), status: r.status, failed: (r.stdout.match(/^FAIL .*$/gm) ?? []).map((l) => l.replace(/^FAIL /, '').split(' ')[0].trim()), aborted: (r.stdout.match(/^FAIL \S+ Block bricht ab/gm) ?? []).length, crashed: r.status !== 0 && !/^FAIL /m.test(r.stdout) };
};
const firstRed = () => { for (const v of VERIFIERS) { const r = runOne(v); if (r.status !== 0) return r; } return null; };
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7) ?? null;
const base = VERIFIERS.map(runOne);
if (base.some((r) => r.status !== 0)) { console.error('the verifiers are not green before the mutations', JSON.stringify(base)); process.exit(2); }
const out = [];
for (const [name, file, from, to] of MUT) {
  if (ONLY && !ONLY.split('|').some((t) => name.includes(t))) continue;
  const p = join(ROOT, file), orig = readFileSync(p, 'utf8'), nl = orig.includes('\r\n') ? '\r\n' : '\n', fromN = from.replaceAll('\n', nl), toN = to.replaceAll('\n', nl);
  let res = { name, file };
  try {
    if (orig.split(fromN).length !== 2) throw new Error(`pattern found ${orig.split(fromN).length - 1} times`);
    writeFileSync(p, orig.replace(fromN, () => toN));
    const red = firstRed();
    res = { ...res, noticed: !!red, by: red ? `${red.verifier}: ${red.failed.join(', ') || 'Abbruch'}` : null, crashedOnly: !!red && (red.crashed || red.failed.length === 0 || red.aborted === red.failed.length) };
  } catch (e) { res = { ...res, error: String(e.message) }; }
  finally { writeFileSync(p, orig); }
  out.push(res);
  console.log(`${res.noticed ? 'bemerkt   ' : 'ÜBERSEHEN '} ${name}${res.by ? ` (${res.by})` : ''}${res.crashedOnly ? ' [nur als Abbruch]' : ''}${res.error ? ` — ${res.error}` : ''}`);
}
const after = VERIFIERS.map(runOne);
const sum = { generated: new Date().toISOString(), verifiers: VERIFIERS.map((v) => v.replace(/^verify-|\.mjs$/g, '').replace('glacier-', 'verify:glacier-')), greenBefore: true, greenAfter: after.every((r) => r.status === 0), noticed: out.filter((o) => o.noticed).length, of: out.length, errors: out.filter((o) => o.error).length, crashedOnly: out.filter((o) => o.crashedOnly).length, ...(ONLY ? { only: ONLY } : {}), mutations: out };
writeFileSync(join(import.meta.dirname, ONLY ? 'gm5b-mutations-rerun.json' : 'gm5b-mutations.json'), JSON.stringify(sum, null, 1));
console.log(`${sum.noticed} von ${sum.of} bemerkt (${sum.crashedOnly} nur als Abbruch), ${sum.errors} nicht angewandt; Prüfer danach ${sum.greenAfter ? 'grün' : 'ROT'}`);
