#!/usr/bin/env node
/**
 * GM-5a (E-GM-32 … E-GM-35) — counter-check of block I of `verify:glacier-snowpack`: every mutation below breaks one rule of the spread from scenarios
 * (core, producer, contract, the precipitation level of the weather core); the verifier must turn red for each. The file is changed, the verifier is
 * run, the file is restored (also on failure). Result: gm5-mutations.json.
 *
 *   node audit/gletscher-schneemodell/gm5-mutations.mjs
 *
 * Do not run it next to a producer run: the run would load the mutated code. After an aborted round: restore the mutated file from git, run the verifier.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const SPC = 'scripts/glacier/lib/snowpackcore.mjs', MELT = 'scripts/glacier/melt.mjs', CON = 'src/glacier/glacierSnowpackContract.ts', WXC = 'scripts/glacier/lib/weathercore.mjs';
const VERIFIERS = ['verify-glacier-snowpack.mjs'];
const MUT = [
  // the switch
  ['Voreinstellung der Spanne „scenarios“', SPC, "export const SNOWPACK_SPREAD_DEFAULT = 'off';", "export const SNOWPACK_SPREAD_DEFAULT = 'scenarios';"],
  ['unbekanntes Wort der Spanne fällt auf „off“ zurück', SPC, "wordOf(value, SNOWPACK_SPREAD_MODES, SNOWPACK_SPREAD_DEFAULT, 'Spanne der Schneedecke')", '(SNOWPACK_SPREAD_MODES.includes(value) ? value : SNOWPACK_SPREAD_DEFAULT)'],
  ['Umgebungsvariable der Spanne wird nicht gelesen', MELT, "snowpackSpreadModeOf(opts['snowpack-spread'] ?? process.env.GLACIER_SNOWPACK_SPREAD)", "snowpackSpreadModeOf(opts['snowpack-spread'])"],
  ['Wort der Spanne wird auch ohne Schneedecke gelesen', MELT, 'const spSpread = spOn ? ', "const spSpread = (snowpackSpreadModeOf(opts['snowpack-spread'] ?? process.env.GLACIER_SNOWPACK_SPREAD), spOn) ? "],
  // the core
  ['Fehler am Faktor wirkt nicht', SPC, 'factor: factor.map((f) => f * fMul), hours });', 'factor, hours });'],
  ['fester Teil der Dichte wirkt nicht', SPC, 'c.rhoNew * rhoSys * Math.exp(sg.densityEvent * gauss(r))', 'c.rhoNew * Math.exp(sg.densityEvent * gauss(r))'],
  ['Tagesteil der Dichte wirkt nicht', SPC, 'c.rhoNew * rhoSys * Math.exp(sg.densityEvent * gauss(r))', 'c.rhoNew * rhoSys * Math.exp(0 * gauss(r))'],
  ['Niederschlagspfad wird nicht benutzt', SPC, 'ps[h] = Number.isFinite(p[h]) ? amount(h, zP) : p[h];', 'ps[h] = p[h];'],
  ['Temperaturpfad wird nicht übergeben', SPC, 'zTs[h] = zT;', 'zTs[h] = 0;'],
  ['Pfade ohne Gedächtnis (jede Stunde neu gezogen)', SPC, 'zP = rule.rho * zP + a * gauss(r); zT = rule.rho * zT + a * gauss(r);', 'zP = gauss(r); zT = gauss(r);'],
  ['Szenarien rechnen auf der Schneedecke der Laufstunde selbst', SPC, 'const fc = start.map((x) => ({ pack: packFromRow(x.row), aS: x.aS }));', 'const fc = levels;'],
  ['Summe der Tage 9–15 statt 8–14', SPC, 'if (d + 1 >= w0 && d + 1 <= w1) wk[l][s] += n;', 'if (d >= w0 && d <= w1) wk[l][s] += n;'],
  ['Spanne der Summe = Summe der Tages-Quantile', SPC, 'hnw: wk.map((x) => q(x, [0.1, 0.5, 0.9])) };', 'hnw: hn.map((lv) => [0.1, 0.5, 0.9].map((v) => r1(lv.slice(w0 - 1, w1).reduce((s, x) => s + q(x, [v])[0], 0)))) };'],
  ['p75 statt p90', SPC, 'const [a10, a90] = q(x, [0.1, 0.9]);', 'const [a10, a90] = q(x, [0.1, 0.75]);'],
  ['p25 statt p10', SPC, 'const [a10, a90] = q(x, [0.1, 0.9]);', 'const [a10, a90] = q(x, [0.25, 0.9]);'],
  ['Quantile aus unsortierten Szenarien', SPC, 'const q = (x, at) => { const srt = Float64Array.from(x).sort();', 'const q = (x, at) => { const srt = Float64Array.from(x);'],
  ['unbrauchbare Regel wird gerechnet', SPC, "throw new Error('Spanne: Regel unbrauchbar');", 'void 0;'],
  ['Erwartungswert wird durch das mittlere Szenario ersetzt', SPC, 'return { hsq: hs.map(pair), hnq: hn.map(pair),', 'return { hsd: hs.map((lv) => lv.map((x) => q(x, [0.5])[0])), hsq: hs.map(pair), hnq: hn.map(pair),'],
  // the producer
  ['Nachbar-Zeilen bekommen eine Spanne', MELT, "if (!own) o.row.sq = 'neighbour';", "if (false) o.row.sq = 'neighbour';"],
  ['Spanne ohne Verteilung der Antwort', MELT, "else if (!f.wx?.pDist?.some((d) => d)) o.row.sq = 'no-distribution';", "else if (false) o.row.sq = 'no-distribution';"],
  ['alle Gletscher ziehen dieselben Pfade', MELT, 'seed: (seedOf(run, g.id) ^ 0x9e3779b9) >>> 0, rule: spSpreadRule', 'seed: 7, rule: spSpreadRule'],
  ['Temperaturfehler der Antwort wirkt nicht', MELT, 'o[h] = arr[h] + (s && fin(s[h]) ? s[h] : 0) * zT[h]; return o; }) };', 'o[h] = arr[h]; return o; }) };'],
  ['Producer rechnet Zeilen ohne drei Antworten nicht über den Kern', MELT, ': (zT) => shiftLevels({ tz: tzW, share: share3, sg: f.sg, zT, hours: hoursSp, ramp: solidFraction });', ': () => ({ tz: tzW, share: share3 });'],
  ['ohne drei Antworten: Temperaturfehler wirkt nicht', SPC, 'const d = (sg && Number.isFinite(sg[h]) ? sg[h] : 0) * zT[h];', 'const d = 0;'],
  ['ohne drei Antworten: Anteil über 1 möglich', SPC, 'sh[l][h] = Math.min(1, Math.max(0, ramp(tzS[l][h]) + (share[l][h] - ramp(tz[l][h]))));', 'sh[l][h] = Math.max(0, ramp(tzS[l][h]) + (share[l][h] - ramp(tz[l][h])));'],
  ['Niederschlag der Szenarien ist der Erwartungswert', MELT, 'amount: precipAmountOf(f.p, f.wx.pDist, hoursSp), place }', 'amount: (h) => Math.max(0, f.p[h]), place }'],
  ['ohne drei Antworten: Versatz zur Rampe fehlt', SPC, 'ramp(tzS[l][h]) + (share[l][h] - ramp(tz[l][h]))', 'ramp(tzS[l][h])'],
  ['ohne drei Antworten: unten mehr Schnee als oben möglich', SPC, 'sh[1][h] = Math.min(sh[1][h], sh[2][h]); sh[0][h] = Math.min(sh[0][h], sh[1][h]);\n  }\n  return { tz: tzS, share: sh };', '}\n  return { tz: tzS, share: sh };'],
  ['Kopf ohne das Paar zum Faktor', MELT, '...(spread ? { spread: spreadCount, now: { factor: GLACIER_SNOWPACK_NOW_FACTOR } } : {}),', '...(spread ? { spread: spreadCount } : {}),'],
  ['Dokument nennt „none“, obwohl Spannen gerechnet sind', MELT, "sums: 'expected', spread: spread ?? 'none', newSnow: 'settled',", "sums: 'expected', spread: 'none', newSnow: 'settled',"],
  ['Zählung im Kopf zählt Vermerke nicht', MELT, "none: rows.reduce((m, r) => (r.sq ? ((m[r.sq] = (m[r.sq] ?? 0) + 1), m) : m), {}) }", 'none: {} }'],
  ['Statuszeile nennt die Spanne nicht', MELT, 'if (spStatus && snowpack.spread) spStatus.spread = snowpack.spread;', ''],
  ['Schalter aus rechnet trotzdem Spannen', MELT, '          if (spSpread) {\n            // GM-5a: the spread of the forecast', '          if (true) {\n            // GM-5a: the spread of the forecast'],
  // the contract
  ['Regel mit 40 Szenarien', CON, 'export const GLACIER_SNOWPACK_SPREAD_K = 100;', 'export const GLACIER_SNOWPACK_SPREAD_K = 40;'],
  ['Fehler am Faktor 0,5 statt 0,25', CON, 'Object.freeze({ factor: 0.25, densitySystematic: 0.12, densityEvent: 0.3 })', 'Object.freeze({ factor: 0.5, densitySystematic: 0.12, densityEvent: 0.3 })'],
  ['Paar zur Laufstunde als nachgemessen ausgegeben', CON, "origin: 'measured', verified: false, note: 'Unsicherheit des Niederschlagsfaktors", "origin: 'measured', verified: true, note: 'Unsicherheit des Niederschlagsfaktors"],
  ['Vertrag prüft die Regel der Spanne nicht', CON, "p.push('Regeln: Spanne');", 'void 0;'],
  ['Vertrag verlangt das Paar zur Laufstunde nicht', CON, "p.push('Kopf: Unsicherheit des Faktors zur Laufstunde fehlt');", 'void 0;'],
  ['Vertrag nimmt „nachgemessen“ am Paar', CON, 'nf.verified !== false || ', ''],
  ['Vertrag nimmt Spannen-Felder ohne Regel', CON, "if (!spreadOn) { if (hasQ || g.sq != null) bad('Spanne ohne Regel'); }", 'if (!spreadOn) { }'],
  ['Vertrag nimmt Kopf-Angaben ohne Regel', CON, "} else if (doc.now != null || doc.spread != null) p.push('Kopf: Spanne ohne Regel');", '}'],
  ['Vertrag nimmt eine Spanne an einer Nachbar-Zeile', CON, "if (g.f !== 'own') bad('Spanne fehlt der Vermerk „neighbour“ (Nachbar-Zeile)');\n      else if (!q2(g.hsq)", 'if (!q2(g.hsq)'],
  ['Vertrag nimmt einen unbekannten Vermerk', CON, 'if (!(GLACIER_SNOWPACK_SPREAD_NONE as readonly string[]).includes(g.sq) || hasQ) bad', 'if (hasQ) bad'],
  ['Vertrag nimmt „neighbour“ an einer eigenen Zeile', CON, "else if ((g.sq === 'neighbour') !== (g.f !== 'own')) bad('Spanne: Vermerk passt nicht zum Antrieb');", ''],
  ['Vertrag prüft die Ordnung der Spanne nicht', CON, 'if (!ok) { bad(`Höhe ${l}: Spanne nicht geordnet`); break; }', ''],
  ['Vertrag prüft die Felder der Spanne nicht', CON, "else if (!q2(g.hsq) || !q2(g.hnq) || !lv3(g.hnw, (x) => Array.isArray(x) && x.length === 3 && x.every(nonNeg))) bad('Spanne: Felder');\n      else {", 'else if (g.hsq && g.hnq && g.hnw) {'],
  ['Vertrag zählt die Spannen nicht nach', CON, "p.push('Kopf: Zählung der Spannen stimmt nicht mit den Zeilen');", 'void 0;'],
  // the precipitation level (weather core)
  ['Stufe des Szenarios geht nicht in die Menge ein', WXC, 'const u = Math.min(1 - 1e-9, Math.max(1e-9, Phi(zP)));', 'const u = 0.5;'],
  ['Lücke zwischen zwei Verteilungen unbegrenzt gemischt', WXC, 'if (a < 0 || b < 0 || (a !== h && b - a > 6)) return Math.max(0, p[h]);', 'if (a < 0 || b < 0) return Math.max(0, p[h]);'],
  ['Mischung zweier Verteilungen mit vertauschten Gewichten', WXC, 'const u = Math.min(1 - 1e-9, Math.max(1e-9, Phi(zP)));\n    if (a === h) return quantileOf(pDist[h], u);\n    const wgt = (h - a) / (b - a);', 'const u = Math.min(1 - 1e-9, Math.max(1e-9, Phi(zP)));\n    if (a === h) return quantileOf(pDist[h], u);\n    const wgt = 1 - (h - a) / (b - a);'],
];
const runOne = (v) => {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--import', './scripts/lib/register-ts.mjs', `scripts/${v}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { verifier: v.replace(/^verify-|\.mjs$/g, ''), status: r.status, failed: (r.stdout.match(/^FAIL .*$/gm) ?? []).map((l) => l.replace(/^FAIL /, '').split(' ')[0].trim()), aborted: (r.stdout.match(/^FAIL \S+ Block bricht ab/gm) ?? []).length };
};
const firstRed = () => { for (const v of VERIFIERS) { const r = runOne(v); if (r.status !== 0) return r; } return null; };
const base = VERIFIERS.map(runOne);
if (base.some((r) => r.status !== 0)) { console.error('the verifier is not green before the mutations', JSON.stringify(base)); process.exit(2); }
// `--only=<text>`: repeat single mutations (their names containing the text) after a correction of the verifier; the result goes to its own file
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7) ?? null;
const out = [];
for (const [name, file, from, to] of MUT) {
  if (ONLY && !ONLY.split('|').some((t) => name.includes(t))) continue;
  const p = join(ROOT, file), orig = readFileSync(p, 'utf8'), nl = orig.includes('\r\n') ? '\r\n' : '\n', fromN = from.replaceAll('\n', nl), toN = to.replaceAll('\n', nl);
  let res = { name, file };
  try {
    if (orig.split(fromN).length !== 2) throw new Error(`pattern found ${orig.split(fromN).length - 1} times`);
    writeFileSync(p, orig.replace(fromN, () => toN));
    const red = firstRed();
    res = { ...res, noticed: !!red, by: red ? `${red.verifier}: ${red.failed.join(', ') || 'Abbruch'}` : null, crashedOnly: !!red && (red.failed.length === 0 || red.aborted === red.failed.length) };
  } catch (e) { res = { ...res, error: String(e.message) }; }
  finally { writeFileSync(p, orig); }
  out.push(res);
  console.log(`${res.noticed ? 'bemerkt   ' : 'ÜBERSEHEN '} ${name}${res.by ? ` (${res.by})` : ''}${res.error ? ` — ${res.error}` : ''}`);
}
const after = VERIFIERS.map(runOne);
const sum = { generated: new Date().toISOString(), verifiers: ['verify:glacier-snowpack'], greenBefore: true, greenAfter: after.every((r) => r.status === 0), noticed: out.filter((o) => o.noticed).length, of: out.length, errors: out.filter((o) => o.error).length, mutations: out };
writeFileSync(join(import.meta.dirname, ONLY ? 'gm5-mutations-rerun.json' : 'gm5-mutations.json'), JSON.stringify(ONLY ? { ...sum, only: ONLY } : sum, null, 1));
console.log(`${sum.noticed} von ${sum.of} bemerkt, ${sum.errors} nicht angewandt; Prüfer danach ${sum.greenAfter ? 'grün' : 'ROT'}`);
