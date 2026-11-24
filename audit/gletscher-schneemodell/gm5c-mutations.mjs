#!/usr/bin/env node
/**
 * GM-5c (V-GM-79, V-GM-81; audit §3k, §3l) — counter-check of block J of `verify:glacier-snowpack` and block L of `verify:glacier-melt`: every mutation
 * below breaks one rule of the forecast at the station elevation (core, pairs, producer, contract) or of the memory line; the verifier named with the
 * mutation must turn red. The file is changed, the verifier is run, the file is restored (also on failure). Result: gm5c-mutations.json.
 *
 *   node audit/gletscher-schneemodell/gm5c-mutations.mjs [--root=<copy of the tree>] [--max=<n>] [--fresh] [--only=<text>|<text>]
 *
 * V-GM-100: `--root` names a COPY of the tree (scripts, src, public, package.json, node_modules) — the mutations and the verifier runs then happen
 * there and the working tree is never touched; a round that is stopped half way leaves nothing behind in it. The round can be run in parts: every
 * result is appended to a progress file next to the copy, a later call goes on where the last one stopped (`--max` = mutations per call, `--fresh` =
 * forget the progress). Without `--root` the working tree itself is mutated (then never next to a producer run from it; after an aborted round restore
 * the mutated file from its copy in C:/dev/buscosun-glacier-cache/gm5c/backup and run the verifiers).
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const REPO = join(import.meta.dirname, '..', '..');
const argOf = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? null;
const ROOT = argOf('root') ? resolve(argOf('root')) : REPO, COPY = ROOT !== REPO;
const SPC = 'scripts/glacier/lib/snowpackcore.mjs', MELT = 'scripts/glacier/melt.mjs', PCON = 'src/glacier/glacierSnowpackPairsContract.ts', MEM = 'scripts/glacier/lib/runmem.mjs';
const SP = 'verify-glacier-snowpack.mjs', ML = 'verify-glacier-melt.mjs';
const MUT = [
  // --- the core: the scenarios read at the station elevation
  ['Spanne in Stationshöhe = Mischung der Quantile zweier Höhen', SP, SPC, '...(sa ? { at: pair(sa) } : {}) };', '...(sa ? { at: [0, 1].map((j) => sa.map((_, d) => r1(atElevation(at.z, hs.map((lv) => pair(lv)[j][d]), at.zs).v))) } : {}) };'],
  ['Szenario-Werte in Stationshöhe: immer die Zunge', SP, SPC, 'sa[d][s] = atElevation(at.z, [hs[0][d][s], hs[1][d][s], hs[2][d][s]], at.zs).v;', 'sa[d][s] = hs[0][d][s];'],
  ['Szenario-Werte in Stationshöhe: immer die Mitte', SP, SPC, 'sa[d][s] = atElevation(at.z, [hs[0][d][s], hs[1][d][s], hs[2][d][s]], at.zs).v;', 'sa[d][s] = hs[1][d][s];'],
  ['Szenario-Werte in Stationshöhe: einen Tag zu spät', SP, SPC, 'if (sa && d < sa.length) sa[d][s] = atElevation(', 'if (sa && d >= 1 && d <= sa.length) sa[d - 1][s] = atElevation('],
  ['der Zusatz zieht eine Zufallszahl', SP, SPC, 'if (sa && d < sa.length) sa[d][s] = atElevation(', 'if (sa && d < sa.length) gauss(r); if (sa && d < sa.length) sa[d][s] = atElevation('],
  ['obere Grenze in Stationshöhe 0,3 cm zu tief', SP, SPC, '...(sa ? { at: pair(sa) } : {}) };', '...(sa ? { at: pair(sa).map((x, j) => (j ? x.map((v) => Math.max(0, v - 0.3)) : x)) } : {}) };'],
  ['unbrauchbare Stationshöhe wird gerechnet', SP, SPC, "throw new Error('Spanne: Stationshöhe unbrauchbar');", 'void 0;'],
  ['Feld `at` auch ohne Angabe', SP, SPC, '...(sa ? { at: pair(sa) } : {}) };', 'at: sa ? pair(sa) : null };'],
  ['Stationshöhe wird unter der Zunge hochgerechnet', SP, SPC, "if (zs < z[0]) return { v: vals[0], at: 'below' };", "if (zs < z[0]) return { v: Math.max(0, vals[0] + ((vals[1] - vals[0]) * (zs - z[0])) / (z[1] - z[0])), at: 'below' };"],
  // --- the pairs
  ['erwartete Schneehöhe aus den Tagen 2–4', SP, SPC, 'r.hsd.map((a) => a[d - 1]), st.elev).v));', 'r.hsd.map((a) => a[d]), st.elev).v));'],
  ['erwartete Schneehöhe: Wert der Mitte statt der Stationshöhe', SP, SPC, 'p.fm = forecast.days.map((d) => r2(atElevation(r.z, r.hsd.map((a) => a[d - 1]), st.elev).v));', 'p.fm = forecast.days.map((d) => r.hsd[1][d - 1]);'],
  ['Paar ohne Spanne trägt den Vermerk der Zeile nicht', SP, SPC, 'if (r.sq) { p.sq = r.sq; fNone[r.sq] = (fNone[r.sq] ?? 0) + 1; }', 'if (r.sq) { fNone[r.sq] = (fNone[r.sq] ?? 0) + 1; }'],
  ['Vermerk „neighbour“ an jedem Paar ohne Spanne', SP, SPC, 'if (r.sq) { p.sq = r.sq; fNone[r.sq] = (fNone[r.sq] ?? 0) + 1; }', "if (r.sq) { p.sq = 'neighbour'; fNone.neighbour = (fNone.neighbour ?? 0) + 1; }"],
  ['fehlende Spanne in Stationshöhe wird durch die der Zunge ersetzt', SP, SPC, 'if (!r.hsq || !q || q.zs !== st.elev) throw new Error(`Spanne in Stationshöhe fehlt (${r.id}, ${sid})`);\n        p.fq = q.q; fPairs++;', 'p.fq = q && q.zs === st.elev ? q.q : [r.hsq[0][0].slice(0, 3), r.hsq[0][1].slice(0, 3)]; fPairs++;'],
  ['Spanne einer anderen Stationshöhe wird genommen', SP, SPC, 'if (!r.hsq || !q || q.zs !== st.elev) throw', 'if (!r.hsq || !q) throw'],
  ['Zeile ohne Spanne und ohne Vermerk bekommt eine Spanne', SP, SPC, 'if (!r.hsq || !q || q.zs !== st.elev) throw', 'if (!q || q.zs !== st.elev) throw'],
  ['Paare mit Spanne werden nicht gezählt', SP, SPC, 'p.fq = q.q; fPairs++;', 'p.fq = q.q;'],
  ['Zählung der Vorhersage auch ohne Vorhersage', SP, SPC, '...(forecast ? { forecast: { pairs: fPairs, none: fNone } } : {}) };', 'forecast: { pairs: fPairs, none: fNone } };'],
  ['Stationshöhen ohne den Abschnitt ext', SP, SPC, "if (!ext?.glaciers || !ext?.stations) throw new Error('Stationszuordnung ohne Abschnitt ext');\n  const out = new Map();", 'if (!ext?.glaciers || !ext?.stations) return new Map();\n  const out = new Map();'],
  // --- the producer
  ['Paare tragen die Vorhersage auch mit ausgeschalteter Spanne', SP, MELT, '...(spSpread ? { forecast: { rule: spSpreadRule, at: spAtQ } } : {}) });', 'forecast: { rule: spSpreadRule, at: spAtQ } });'],
  ['Paare tragen die Vorhersage nie', SP, MELT, '...(spSpread ? { forecast: { rule: spSpreadRule, at: spAtQ } } : {}) });', '});'],
  ['Spanne in Stationshöhe landet in der Zeile der Schneedecke', SP, MELT, 'Object.assign(o.row, q);\n              if (atq)', 'Object.assign(o.row, q, atq ? { at: atq } : {});\n              if (atq)'],
  ['Spanne in Stationshöhe wird nicht gehalten', SP, MELT, 'if (atq) spAtQ.set(g.id, { zs, q: atq });', ''],
  ['Spanne in Stationshöhe für die Medianhöhe statt der Station gerechnet', SP, MELT, '...(zs != null ? { at: { z: o.row.z, zs, days: GLACIER_SNOWPACK_PAIRS_FC_HOURS.length } } : {}) });', '...(zs != null ? { at: { z: o.row.z, zs: o.row.z[1], days: GLACIER_SNOWPACK_PAIRS_FC_HOURS.length } } : {}) });'],
  ['Kopfblock nennt das K der Voreinstellung statt des Laufs', SP, MELT, 'k: forecast.rule.k, quantiles: forecast.rule.quantiles,', 'k: GLACIER_SNOWPACK_SPREAD_RULE.k, quantiles: forecast.rule.quantiles,'],
  ['Kopfblock fehlt', SP, MELT, "    ...(forecast ? { forecast: { hours: GLACIER_SNOWPACK_PAIRS_FC_HOURS, origin: 'computed',", "    ...(false ? { forecast: { hours: GLACIER_SNOWPACK_PAIRS_FC_HOURS, origin: 'computed',"],
  ['Herkunft der Vorhersage fehlt', SP, MELT, "hsd: 'measured', ...(forecast ? { fm: 'computed', fq: 'computed' } : {}) },", "hsd: 'measured' },"],
  ['Herkunft der Vorhersage auch ohne Vorhersage', SP, MELT, "hsd: 'measured', ...(forecast ? { fm: 'computed', fq: 'computed' } : {}) },", "hsd: 'measured', fm: 'computed', fq: 'computed' },"],
  ['Statuszeile der Paare nennt die Spanne nicht', SP, MELT, 'bytes: pairs.bytes, ...(pairs.spread != null ? { spread: pairs.spread } : {}) };', 'bytes: pairs.bytes };'],
  ['Zuordnung nicht lesbar bricht die Schneedecke ab', SP, MELT, 'catch { spAt = null; } }', 'catch (e) { spAt = null; sp.error = String(e?.message ?? e); } }'],
  ['Tage aus Stunden falsch (h / 12)', SP, MELT, 'GLACIER_SNOWPACK_PAIRS_FC_HOURS.map((h) => h / 24)', 'GLACIER_SNOWPACK_PAIRS_FC_HOURS.map((h) => h / 12)'],
  // --- the contract
  ['Vorlaufzeiten 24 / 48 / 96 h', SP, PCON, 'export const GLACIER_SNOWPACK_PAIRS_FC_HOURS = Object.freeze([24, 48, 72] as const);', 'export const GLACIER_SNOWPACK_PAIRS_FC_HOURS = Object.freeze([24, 48, 96] as const);'],
  ['Vertrag nimmt Vorhersage-Felder ohne Kopfblock', SP, PCON, 'if (!fcOn) { if (r.fm !== undefined || r.fq !== undefined || r.sq !== undefined) p.push(`${k}: Vorhersage ohne Kopfblock`); continue; }', 'if (!fcOn) continue;'],
  ['Vertrag prüft die Regel des Kopfblocks nicht', SP, PCON, "p.push('forecast: Regel');", 'void 0;'],
  ['Vertrag nimmt K unter 10', SP, PCON, ' || fc.spread.k < 10\n', '\n'],
  ['Vertrag prüft die Herkunft der Vorhersage nicht', SP, PCON, "p.push('origins: Vorhersage');", 'void 0;'],
  ['Vertrag nimmt die Herkunft der Vorhersage ohne Kopfblock', SP, PCON, "p.push('origins: Vorhersage ohne Kopfblock');", 'void 0;'],
  ['Vertrag prüft die erwartete Schneehöhe nicht', SP, PCON, 'if (!tri(r.fm)) p.push(`${k}: Vorhersage`);', ''],
  ['Vertrag nimmt negative Werte', SP, PCON, 'a.length === nF && a.every((x) => fin(x) && x >= 0);', 'a.length === nF && a.every((x) => fin(x));'],
  ['Vertrag nimmt Spanne und Vermerk zugleich', SP, PCON, 'if (r.sq !== undefined && r.fq !== undefined) p.push(`${k}: Spanne und Vermerk`);\n    else if (r.sq !== undefined) {', 'if (r.sq !== undefined) {'],
  ['Vertrag nimmt einen unbekannten Vermerk', SP, PCON, 'if (!(GLACIER_SNOWPACK_SPREAD_NONE as readonly string[]).includes(r.sq)) p.push(`${k}: Spanne: unbekannter Vermerk`);', ''],
  ['Vertrag verlangt weder Spanne noch Vermerk', SP, PCON, '} else if (!fqOk) p.push(`${k}: Spanne fehlt`);', '} else if (!fqOk) void 0;'],
  ['Vertrag prüft die Ordnung der Spanne nicht', SP, PCON, 'if (r.fq![0].some((x, i) => x > r.fq![1][i] + 0.15)) p.push(`${k}: Spanne nicht geordnet`);', ''],
  ['Vertrag zählt die Vorhersage nicht nach', SP, PCON, "p.push('forecast: Zählung');", 'void 0;'],
  ['Vertrag vergleicht den Vermerk nicht mit der Zeile', SP, PCON, 'if ((r.sq ?? null) !== (row.sq ?? null)) p.push(`${k}: Vermerk ist nicht der der Zeile`);', ''],
  ['Vertrag vergleicht unter der Zunge die Vorhersage nicht mit der Zeile', SP, PCON, 'if (r.fm.some((x, i) => x !== row.hsd[l]?.[i])) p.push(`${k}: Vorhersage ist nicht die der Zeile an dieser Höhe`);', ''],
  ['Vertrag vergleicht unter der Zunge die Spanne nicht mit der Zeile', SP, PCON, 'if (fqOk && row.hsq && [0, 1].some((j) => r.fq![j].some((x, i) => x !== row.hsq![l]?.[j]?.[i]))) p.push(`${k}: Spanne ist nicht die der Zeile an dieser Höhe`);', ''],
  ['Vertrag: über der Oberkante gilt die Mitte', SP, PCON, "const l = r.at === 'below' ? 0 : r.at === 'above' ? 2 : -1;", "const l = r.at === 'below' ? 0 : r.at === 'above' ? 1 : -1;"],
  // --- the memory line (V-GM-81)
  ['Speicher: die letzte Abtastung statt der höchsten', ML, MEM, 'if (u > heap) heap = u;', 'heap = u;'],
  ['Speicher: beim Schreiben der Zeile wird nicht mehr abgetastet', ML, MEM, 'line: () => { sample(); return {', 'line: () => { return {'],
  ['Speicher: Kilobyte durch 1000', ML, MEM, 'rssMb: Math.round(peakRssKb() / 1024)', 'rssMb: Math.round(peakRssKb() / 1000)'],
  ['Speicher: Grenze in Byte', ML, MEM, 'heapLimitMb: Math.round(heapLimit() / MB)', 'heapLimitMb: heapLimit()'],
  ['Speicher: der Stand von jetzt statt des Höchstwerts des Prozesses', ML, MEM, 'peakRssKb = () => process.resourceUsage().maxRSS,', 'peakRssKb = () => process.memoryUsage.rss() / 1024,'],
  ['Speicher wird in der Schleife nicht abgetastet', ML, MELT, '    mem.sample();\n    try {\n      const hyp = hypOf(g.region)[g.id];', '    try {\n      const hyp = hypOf(g.region)[g.id];'],
  ['Speicherzeile fehlt in der Statuszeile', ML, MELT, ', mem: mem.line() },', ' },'],
  ['Speicherzeile steht auch im Schmelzdokument', ML, MELT, '    build, glaciers: rows, skipped,\n  };\n  const rowIds', '    build, glaciers: rows, skipped, mem: mem.line(),\n  };\n  const rowIds'],
  ['Speicherzeile steht auch im Zeiger', ML, MELT, 'cube: cubeRuns, unit, build },\n    ...(weather && !weather.error ? { weather: weather.pointer } : {}),', 'cube: cubeRuns, unit, build, mem: mem.line() },\n    ...(weather && !weather.error ? { weather: weather.pointer } : {}),'],
  ['die Messung der Naht wird nicht benutzt', ML, MELT, 'const mem = (opts.memWatch ?? memWatch)();', 'const mem = memWatch();'],
];
const runOne = (v) => {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--import', './scripts/lib/register-ts.mjs', `scripts/${v}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const failed = (r.stdout.match(/^FAIL .*$/gm) ?? []).map((l) => l.replace(/^FAIL /, '').split(' ')[0].trim());
  // "noticed only as an abort": no named check failed, or every failed line is a block that broke off (`… Block bricht ab`, `X0 Block X läuft …`)
  const aborted = (r.stdout.match(/^FAIL (\S+ Block bricht ab|[A-Z]0 Block )/gm) ?? []).length;
  return { verifier: v.replace(/^verify-|\.mjs$/g, ''), status: r.status, failed, aborted };
};
const ONLY = argOf('only'), MAX = argOf('max') ? Number(argOf('max')) : Infinity;
// the copy must carry the code of the working tree: every target file byte for byte
if (COPY) for (const f of [...new Set(MUT.map((m) => m[2])), `scripts/${SP}`, `scripts/${ML}`]) if (!readFileSync(join(ROOT, f)).equals(readFileSync(join(REPO, f)))) { console.error(`the copy differs from the working tree: ${f}`); process.exit(2); }
const PROGRESS = 'C:/dev/buscosun-glacier-cache/gm5c/mut-progress.json';
const prior = COPY && !ONLY && !process.argv.includes('--fresh') && existsSync(PROGRESS) ? JSON.parse(readFileSync(PROGRESS, 'utf8')) : [];
const doneNames = new Set(prior.map((o) => o.name));
const used = [...new Set(MUT.filter(([name]) => !ONLY || ONLY.split('|').some((t) => name.includes(t))).map((m) => m[1]))];
const base = used.map(runOne);
if (base.some((r) => r.status !== 0)) { console.error('the verifiers are not green before the mutations', JSON.stringify(base)); process.exit(2); }
// the files are uncommitted work: when the working tree itself is mutated, one copy of each outside the repository before the first mutation
const BACKUP = 'C:/dev/buscosun-glacier-cache/gm5c/backup';
if (!COPY) { mkdirSync(BACKUP, { recursive: true }); for (const f of new Set(MUT.map((m) => m[2]))) copyFileSync(join(ROOT, f), join(BACKUP, f.replaceAll('/', '__'))); }
const out = [...prior];
let ran = 0;
for (const [name, verifier, file, from, to] of MUT) {
  if (ONLY && !ONLY.split('|').some((t) => name.includes(t))) continue;
  if (doneNames.has(name)) continue;
  if (ran >= MAX) break;
  ran++;
  const p = join(ROOT, file), orig = readFileSync(p, 'utf8'), nl = orig.includes('\r\n') ? '\r\n' : '\n', fromN = from.replaceAll('\n', nl), toN = to.replaceAll('\n', nl);
  let res = { name, file, verifier: verifier.replace(/^verify-|\.mjs$/g, '') };
  try {
    if (orig.split(fromN).length !== 2) throw new Error(`pattern found ${orig.split(fromN).length - 1} times`);
    writeFileSync(p, orig.replace(fromN, () => toN));
    const red = runOne(verifier);
    const noticed = red.status !== 0;
    res = { ...res, noticed, by: noticed ? red.failed.join(', ') || 'Abbruch' : null, crashedOnly: noticed && (red.failed.length === 0 || red.aborted === red.failed.length) };
  } catch (e) { res = { ...res, error: String(e.message) }; }
  finally { writeFileSync(p, orig); }
  out.push(res);
  if (COPY && !ONLY) writeFileSync(PROGRESS, JSON.stringify(out, null, 1));
  console.log(`${res.noticed ? (res.crashedOnly ? 'nur Abbruch' : 'bemerkt    ') : 'ÜBERSEHEN  '} ${name}${res.by ? ` (${res.by})` : ''}${res.error ? ` — ${res.error}` : ''}`);
}
const after = used.map(runOne);
const complete = ONLY || MUT.every((m) => out.some((o) => o.name === m[0]));
const sum = { generated: new Date().toISOString(), root: COPY ? 'Kopie des Arbeitsbaums (jede Zieldatei und beide Prüfer vor der Runde Byte für Byte verglichen)' : 'Arbeitsbaum', verifiers: used.map((v) => v.replace(/^verify-|\.mjs$/g, '').replace('-', ':')), greenBefore: true, greenAfter: after.every((r) => r.status === 0), noticed: out.filter((o) => o.noticed).length, crashedOnly: out.filter((o) => o.crashedOnly).length, of: out.length, errors: out.filter((o) => o.error).length, mutations: out };
if (complete) writeFileSync(join(import.meta.dirname, ONLY ? 'gm5c-mutations-rerun.json' : 'gm5c-mutations.json'), JSON.stringify(ONLY ? { ...sum, only: ONLY } : sum, null, 1));
console.log(`${complete ? '' : `Teil: ${out.length} von ${MUT.length} gelaufen — `}${sum.noticed} von ${sum.of} bemerkt (${sum.crashedOnly} nur als Abbruch), ${sum.errors} nicht angewandt; Prüfer danach ${sum.greenAfter ? 'grün' : 'ROT'}`);
