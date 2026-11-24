#!/usr/bin/env node
/**
 * GM-4 (E-GM-20 … E-GM-22) — counter-check of block H of `verify:glacier-snowpack` and block J of `verify:glacier-melt`: every mutation below breaks one
 * rule of the shadow pairs, of the archive of the pairs or of the satellite switch; the verifiers must turn red for each. The file is changed, the
 * verifiers are run, the file is restored (also on failure). Result: gm4-mutations.json.
 *
 *   node audit/gletscher-schneemodell/gm4-mutations.mjs
 *
 * Do not run it next to a producer run: the run would load the mutated code. After an aborted round: restore the mutated file from git, run the verifiers.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const SPC = 'scripts/glacier/lib/snowpackcore.mjs', MS = 'scripts/glacier/lib/meltstate.mjs', MELT = 'scripts/glacier/melt.mjs', PC = 'src/glacier/glacierSnowpackPairsContract.ts';
const CON = 'src/glacier/glacierMeltContract.ts', PUB = 'scripts/glacier/glacier-publish.mjs', ARC = 'scripts/glacier/glacier-archive.mjs';
const VERIFIERS = ['verify-glacier-snowpack.mjs', 'verify-glacier-melt.mjs'];
const MUT = [
  // pairs, pure part
  ['Voreinstellung der Schattenpaare „on“', SPC, "export const SNOWPACK_PAIRS_DEFAULT = 'off';", "export const SNOWPACK_PAIRS_DEFAULT = 'on';"],
  ['unbekanntes Wort der Paare fällt auf „off“ zurück', SPC, "wordOf(value, SNOWPACK_PAIRS_MODES, SNOWPACK_PAIRS_DEFAULT, 'Schattenpaare')", "(SNOWPACK_PAIRS_MODES.includes(value) ? value : SNOWPACK_PAIRS_DEFAULT)"],
  ['unter der Zunge hochgerechnet', SPC, "if (zs < z[0]) return { v: vals[0], at: 'below' };", "if (zs < z[0]) return { v: vals[0] + ((vals[1] - vals[0]) * (zs - z[0])) / (z[1] - z[0]), at: 'below' };"],
  ['über der Oberkante der Wert der Mitte', SPC, "if (zs > z[2]) return { v: vals[2], at: 'above' };", "if (zs > z[2]) return { v: vals[1], at: 'above' };"],
  ['immer zwischen Zunge und Mitte interpoliert', SPC, 'const l = zs <= z[1] ? 0 : 1, a = z[l], b = z[l + 1];', 'const l = 0, a = z[0], b = z[1];'],
  ['zu alter Stationswert gilt', SPC, "if (age > windowMin[0]) { p.age = age; p.why = 'stale'; }", "if (false) { p.age = age; p.why = 'stale'; }"],
  ['Stationswert aus der Zukunft gilt', SPC, 'else if (age < -windowMin[1]) {', 'else if (false) {'],
  ['Station ohne Schneehöhe wird nicht erkannt', SPC, "if (!e || !Number.isFinite(e.v?.snow) || !Number.isFinite(stamp)) p.why = 'no-value';", "if (!e || !Number.isFinite(stamp)) p.why = 'no-value';"],
  ['gelieferte Änderung der Schneehöhe fehlt', SPC, 'if (e?.hsd && Object.keys(e.hsd).length) p.hsd = e.hsd;', ''],
  ['zugeordnete Gletscher ohne Zeile werden nicht gezählt', SPC, 'if (g.snow && !rowOf.has(id)) mappedWithoutRow++;', 'if (false) mappedWithoutRow++;'],
  ['Zuordnung ohne `ext` wird als Ganzes gelesen', SPC, 'const ext = map?.ext;', 'const ext = map?.ext ?? map;'],
  // pairs, producer
  ['Umgebungsvariable der Paare wird nicht gelesen', MELT, "snowpackPairsModeOf(opts['snowpack-pairs'] ?? process.env.GLACIER_SNOWPACK_PAIRS)", "snowpackPairsModeOf(opts['snowpack-pairs'])"],
  ['Wort der Paare wird auch ohne Schneedecke gelesen', MELT, 'const spPairs = spOn ? ', "const spPairs = (snowpackPairsModeOf(opts['snowpack-pairs']), spOn) ? "],
  ['Paare auch ohne geschriebene Schneedecke', MELT, "if (snowpack?.error) throw new Error('Schneedecke nicht geschrieben');", ''],
  ['kein Rückgriff auf den Slot der Stunde davor', MELT, '[run, stamp(t0Ms - H)]', '[run]'],
  ['Statuszeile nennt die Paare nicht', MELT, 'if (spStatus && pairs) spStatus.pairs = ', 'if (false) spStatus.pairs = '],
  // pairs, contract
  ['Zeitfenster 90 statt 60 min', PC, 'Object.freeze([60, 15] as const)', 'Object.freeze([90, 15] as const)'],
  ['Vertrag prüft die Herkunft nicht', PC, "if (d.origins?.m !== 'computed' ||", "if (false && d.origins?.m !== 'computed' ||"],
  ['Vertrag nimmt einen Wert außerhalb des Fensters', PC, 'if (!fin(r.age) || r.age > GLACIER_SNOWPACK_PAIRS_WINDOW_MIN[0] || r.age < -GLACIER_SNOWPACK_PAIRS_WINDOW_MIN[1]) p.push', 'if (!fin(r.age)) p.push'],
  ['Vertrag nimmt doppelte Paare', PC, 'if (seen.has(k)) p.push(`${k}: doppelt`);', ''],
  ['Vertrag zählt die Werte nicht nach', PC, 'if (!c || c.pairs !== d.pairs.length || c.withValue !== withValue ||', 'if (!c || c.pairs !== d.pairs.length ||'],
  ['Vertrag nimmt Gletscher ohne Zeile der Schneedecke', PC, 'if (rowIds && !rowIds.has(r.g)) p.push', 'if (false) p.push'],
  // publisher and archive
  ['Paare bleiben 30 Tage im Daten-Repo', PUB, "{ prefix: 'snowpack/pairs', olderThanMs: 72 * 3_600_000", "{ prefix: 'snowpack/pairs', olderThanMs: 720 * 3_600_000"],
  ['Archiv legt ein Dokument ab, das den Vertrag bricht', ARC, 'if (problems.length || doc.run !== run) {', 'if (false) {'],
  ['Archiv überschreibt eine vorhandene Datei', ARC, 'name = `pairs-${run}.json.gz`;\n    if (existsSync(join(archiveDir, day, name))) { held.push(run); continue; }', 'name = `pairs-${run}.json.gz`;'],
  // satellite once per scene
  ['Voreinstellung des Satelliten-Abgleichs „once“', MS, "export const SAT_NUDGE_DEFAULT = 'every';", "export const SAT_NUDGE_DEFAULT = 'once';"],
  ['unbekanntes Wort des Satelliten-Schalters fällt zurück', MS, 'if (!SAT_NUDGE_MODES.includes(word)) throw new Error(`--sat-nudge', 'if (!SAT_NUDGE_MODES.includes(word)) return SAT_NUDGE_DEFAULT; if (false) throw new Error(`--sat-nudge'],
  ['dieselbe Szene greift wieder', MS, 'rowDate > seen', 'rowDate >= seen'],
  ['der Modus wird bei der Szene nicht beachtet', MS, "mode !== 'once' || seen == null", 'seen == null'],
  ['Umgebungsvariable des Satelliten-Schalters wird nicht gelesen', MELT, "satNudgeModeOf(opts['sat-nudge'] ?? process.env.GLACIER_SAT_NUDGE)", "satNudgeModeOf(opts['sat-nudge'])"],
  ['Vermerk gilt auch für einen verworfenen Zustand', MELT, 'const seen = carriedHere ? satSeen[g.id] ?? null : null;', 'const seen = (stateIn?.sat ?? {})[g.id] ?? null;'],
  ['Vermerk wird beim Abgleich nicht erneuert', MELT, 'satStat.applied++; satNext[g.id] = sr[0]; }', 'satStat.applied++; }'],
  ['gehaltene Szene wird nicht gezählt', MELT, '        else satStat.held++;', '        else satStat.held += 0;'],
  ['Vermerk wird nicht weitergetragen', MELT, 'if (seen != null) satNext[g.id] = seen;', ''],
  ['Zustand trägt keinen Vermerk', MELT, 'stateOut.sat = Object.fromEntries(Object.entries(satNext).filter(([id]) => nextState[id]));', 'stateOut.sat = {};'],
  ['Dokument zählt die Szenen nicht', MELT, "...(satMode === 'once' ? { sat: { rule: 'once', applied: satStat.applied, held: satStat.held } } : {})", ''],
  ['Statuszeile nennt den Satelliten-Modus nicht', MELT, "...(satMode === 'once' ? { sat: satMode } : {}) },", '},'],
  ['Vertrag prüft das Datum des Vermerks nicht', CON, "if (typeof d !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(d)) p.push(", 'if (false) p.push('],
  ['Vertrag nimmt einen Vermerk ohne Zustand', CON, 'if (!(id in (s.g ?? {}))) p.push(`${id}: Szene ohne Zustand`);', ''],
];
const runOne = (v) => {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--import', './scripts/lib/register-ts.mjs', `scripts/${v}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { verifier: v.replace(/^verify-|\.mjs$/g, ''), status: r.status, failed: (r.stdout.match(/^FAIL .*$/gm) ?? []).map((l) => l.replace(/^FAIL /, '').slice(0, 3).trim()) };
};
const firstRed = () => { for (const v of VERIFIERS) { const r = runOne(v); if (r.status !== 0) return r; } return null; };
const base = VERIFIERS.map(runOne);
if (base.some((r) => r.status !== 0)) { console.error('the verifiers are not green before the mutations', JSON.stringify(base)); process.exit(2); }
const out = [];
for (const [name, file, from, to] of MUT) {
  const p = join(ROOT, file), orig = readFileSync(p, 'utf8');
  let res = { name, file };
  try {
    if (orig.split(from).length !== 2) throw new Error(`pattern found ${orig.split(from).length - 1} times`);
    writeFileSync(p, orig.replace(from, to));
    const red = firstRed();
    res = { ...res, noticed: !!red, by: red ? `${red.verifier}: ${red.failed.join(', ') || 'Abbruch'}` : null, crashedOnly: !!red && (red.failed.length === 0 || red.failed.every((f) => /^[A-Z]0$|^[A-Z] B$/.test(f))) };
  } catch (e) { res = { ...res, error: String(e.message) }; }
  finally { writeFileSync(p, orig); }
  out.push(res);
  console.log(`${res.noticed ? 'bemerkt   ' : 'ÜBERSEHEN '} ${name}${res.by ? ` (${res.by})` : ''}${res.error ? ` — ${res.error}` : ''}`);
}
const after = VERIFIERS.map(runOne);
writeFileSync(join(import.meta.dirname, 'gm4-mutations.json'), JSON.stringify({ generated: new Date().toISOString(), verifiers: ['verify:glacier-snowpack', 'verify:glacier-melt'], greenBefore: true, greenAfter: after.every((r) => r.status === 0), noticed: out.filter((o) => o.noticed).length, of: out.length, crashedOnly: out.filter((o) => o.crashedOnly).length, mutations: out }, null, 1));
console.log(`${out.filter((o) => o.noticed).length} von ${out.length} bemerkt (${out.filter((o) => o.crashedOnly).length} nur als Abbruch); Prüfer danach ${after.every((r) => r.status === 0) ? 'grün' : 'ROT'}`);
