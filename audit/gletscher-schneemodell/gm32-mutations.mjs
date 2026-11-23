#!/usr/bin/env node
/**
 * GM-3d (V-GM-32) — counter-check of block I of `verify:glacier-melt`: every mutation below breaks one rule of the state switch `--melt-state`; the
 * verifier must turn red for each. The file is changed, the verifier is run, the file is restored (also on failure). Result: gm32-mutations.json.
 *
 *   node audit/gletscher-schneemodell/gm32-mutations.mjs
 *
 * Do not run it next to a producer run: the run would load the mutated code. After an aborted round: run the verifier first, restore the mutated file.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const MS = 'scripts/glacier/lib/meltstate.mjs', MELT = 'scripts/glacier/melt.mjs', CON = 'src/glacier/glacierMeltContract.ts';
const VERIFIERS = ['verify-glacier-melt.mjs'];
const MUT = [
  ['Voreinstellung des Schalters „run-hour“', MS, "export const MELT_STATE_DEFAULT = 'ahead';", "export const MELT_STATE_DEFAULT = 'run-hour';"],
  ['unbekanntes Wort fällt auf die Voreinstellung zurück', MS, 'if (!MELT_STATE_MODES.includes(word)) throw new Error(', 'if (!MELT_STATE_MODES.includes(word)) return MELT_STATE_DEFAULT; if (false) throw new Error('],
  ['gespeicherter Antrieb eine Stunde zu kurz', MS, 'Array.from({ length: hours }, (_, i) => q(a?.[i], fac))', 'Array.from({ length: hours - 1 }, (_, i) => q(a?.[i], fac))'],
  ['Temperatur auf ganze Grad gespeichert', MS, 'col(f.t, 100)', 'col(f.t, 1)'],
  ['Niederschlag auf ganze Millimeter gespeichert', MS, 'col(f.p, 100)]', 'col(f.p, 1)]'],
  ['fehlender Wert wird als 0 gespeichert', MS, '(Number.isFinite(v) ? Math.round(v * f) / f : null)', '(Number.isFinite(v) ? Math.round(v * f) / f : 0)'],
  ['gespeicherte Lücke wird als 0 gelesen', MS, '(v == null ? NaN : v)', '(v == null ? 0 : v)'],
  ['„run-hour“ liest den Antrieb der Datei nicht', MS, "if (mode === 'run-hour' && state.pend &&", "if (false && state.pend &&"],
  ['„ahead“ rechnet eine Datei mit Antrieb nach', MS, "if (mode === 'run-hour' && state.pend &&", 'if (state.pend &&'],
  ['Nachrechnen nimmt immer den ganzen gespeicherten Antrieb', MS, 'const replayH = Math.min(gapH, state.pend.h), ageH = gapH - replayH;', 'const replayH = state.pend.h, ageH = gapH - replayH;'],
  ['Stunden jenseits des Antriebs werden nicht gezählt', MS, 'const replayH = Math.min(gapH, state.pend.h), ageH = gapH - replayH;', 'const replayH = Math.min(gapH, state.pend.h), ageH = 0;'],
  ['Zustand aus der Zukunft oder mit halber Stunde wird genommen', MS, 'if (!(gapH >= 0) || !Number.isInteger(gapH)) return', 'if (false) return'],
  ['Höchstalter gilt mit „run-hour“ nicht', MS, "return ageH <= maxAgeH ? { carry: true, ageH, replayH, form: 'pend' }", "return true ? { carry: true, ageH, replayH, form: 'pend' }"],
  ['„ahead“ nimmt einen Zustand aus der Zukunft', MS, 'const carry = gapH >= 0 && gapH <= maxAgeH;', 'const carry = gapH <= maxAgeH;'],
  ['Zustand der Datei auf ganze Millimeter', MS, 'Array.from(st.swe, (v) => Math.round(v * 10) / 10)', 'Array.from(st.swe, (v) => Math.round(v))'],
  ['Umgebungsvariable des Schalters wird nicht gelesen', MELT, "meltStateModeOf(opts['melt-state'] ?? process.env.GLACIER_MELT_STATE)", "meltStateModeOf(opts['melt-state'])"],
  ['Nachrechnen ohne den Temperaturfaktor', MELT, 'forcing: fo, params: paramsOf(g), state: st, hours: sv.replayH', 'forcing: fo, params: { ...paramsOf(g), TF: 0 }, state: st, hours: sv.replayH'],
  ['Nachrechnen über den ganzen gespeicherten Antrieb', MELT, 'forcing: fo, params: paramsOf(g), state: st, hours: sv.replayH', 'forcing: fo, params: paramsOf(g), state: st, hours: null'],
  ['Nachrechnen mit der Gleichgewichtslinie 0', MELT, 'meltOfForcing({ bands, ela, forcing: fo,', 'meltOfForcing({ bands, ela: 0, forcing: fo,'],
  ['Nachbar-Antrieb wird beim Nachrechnen nicht gefunden', MELT, 'const owner = stateIn.pend.o?.[id] ?? id;', 'const owner = id;'],
  ['Gletscher ohne Antrieb wird nicht gezählt', MELT, 'else stStat.held++;', 'else stStat.held += 0;'],
  ['Datei trägt den Zustand NACH 6 Stunden statt den der Laufstunde', MELT, 'nextState[g.id] = stateRowOf(st);', 'nextState[g.id] = [out.next.swe, out.next.aS];'],
  ['Datei mit „run-hour“ steht 6 h hinter der Laufstunde', MELT, "atMs: t0Ms, g: nextState, pend: pendOut }", "atMs: t0Ms + MELT_STATE_ADVANCE_H * H, g: nextState, pend: pendOut }"],
  ['Zuordnung zum Antriebsgeber wird nicht geschrieben', MELT, 'if (owner !== g.id) pendOut.o[g.id] = owner;', ''],
  ['Antrieb des Nachbarn unter dem eigenen Namen gespeichert', MELT, "const owner = f.from === 'own' ? g.id : f.from;", 'const owner = g.id;'],
  ['Dokument nennt Modus und nachgerechnete Stunden nicht', MELT, "...(stMode === 'run-hour' ? { mode: stMode, replayedH: carry ? sv.replayH : 0, held: stStat.held } : {})", ''],
  ['Statuszeile nennt den Modus nicht', MELT, "...(stMode === 'run-hour' ? { state: stMode } : {}) },", '},'],
  ['„ahead“ schreibt den Modus in die Statuszeile', MELT, "...(stMode === 'run-hour' ? { state: stMode } : {}) },", '...{ state: stMode } },'],
  ['Zustand wird nach dem Nachrechnen nicht auf die Auflösung der Datei gebracht', MELT, 'st = stateOfRow(stateRowOf(meltOfForcing({ bands, ela, forcing: fo, params: paramsOf(g), state: st, hours: sv.replayH }).state));', 'st = meltOfForcing({ bands, ela, forcing: fo, params: paramsOf(g), state: st, hours: sv.replayH }).state;'],
  ['gespeicherter Antrieb 12 statt 18 Stunden', CON, 'export const GLACIER_MELT_STATE_PEND_H = 18;', 'export const GLACIER_MELT_STATE_PEND_H = 12;'],
  ['Vertrag prüft die Länge der Reihen nicht', CON, 'a.length === pd.h && a.every(num)', 'a.every(num)'],
  ['Vertrag nimmt negativen Niederschlag und negative Strahlung', CON, 'else if (series[2].some((x) => x != null && x < 0) || series[3].some((x) => x != null && x < 0)) p.push(', 'else if (false) p.push('],
  ['Vertrag nimmt einen Zustand ohne Antrieb', CON, 'if (!((pd.o[id] ?? id) in pd.f)) p.push(', 'if (false) p.push('],
  ['Vertrag nimmt eine Zeile ohne Bezugshöhe', CON, 'if (!Array.isArray(r) || r.length !== 5 || !Number.isFinite(r[0])) {', 'if (!Array.isArray(r) || r.length !== 5) {'],
];
const runOne = (v) => {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--import', './scripts/lib/register-ts.mjs', `scripts/${v}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { verifier: v.replace(/^verify-|\.mjs$/g, ''), status: r.status, failed: (r.stdout.match(/^(FAIL|\s*✗) .*$/gm) ?? []).map((l) => l.replace(/^(FAIL|\s*✗) /, '').slice(0, 3).trim()) };
};
const firstRed = () => { for (const v of VERIFIERS) { const r = runOne(v); if (r.status !== 0) return r; } return null; };
const base = VERIFIERS.map(runOne);
if (base.some((r) => r.status !== 0)) { console.error('the verifier is not green before the mutations', JSON.stringify(base)); process.exit(2); }
const out = [];
for (const [name, file, from, to] of MUT) {
  const p = join(ROOT, file), orig = readFileSync(p, 'utf8');
  let res = { name, file };
  try {
    if (!orig.includes(from)) throw new Error('pattern not found');
    writeFileSync(p, orig.replace(from, to));
    const red = firstRed();
    res = { ...res, noticed: !!red, by: red ? `${red.verifier}: ${red.failed.join(', ') || 'Abbruch'}` : null, crashedOnly: !!red && red.failed.length === 0 };
  } catch (e) { res = { ...res, error: String(e.message) }; }
  finally { writeFileSync(p, orig); }
  out.push(res);
  console.log(`${res.noticed ? 'bemerkt   ' : 'ÜBERSEHEN '} ${name}${res.by ? ` (${res.by})` : ''}${res.error ? ` — ${res.error}` : ''}`);
}
const after = VERIFIERS.map(runOne);
writeFileSync(join(import.meta.dirname, 'gm32-mutations.json'), JSON.stringify({ generated: new Date().toISOString(), verifiers: ['verify:glacier-melt'], greenBefore: true, greenAfter: after.every((r) => r.status === 0), noticed: out.filter((o) => o.noticed).length, of: out.length, crashedOnly: out.filter((o) => o.crashedOnly).length, mutations: out }, null, 1));
console.log(`${out.filter((o) => o.noticed).length} von ${out.length} bemerkt (${out.filter((o) => o.crashedOnly).length} nur als Abbruch); Prüfer danach ${after.every((r) => r.status === 0) ? 'grün' : 'ROT'}`);
