#!/usr/bin/env node
/**
 * GM-3b (E-GM-7, E-GM-8) — counter-check of the three verifiers that carry the two switches: every mutation below breaks one rule of the new code;
 * at least one of `verify:glacier-melt`, `verify:glacier-snowcal`, `verify:glacier-snowcore` must turn red for each. The file is changed, the verifiers
 * are run, the file is restored (also on failure). Result: gm3b-mutations.json. Since 23.11. (E-GM-12) both switches are ON by default: the first two
 * mutations and the one of the table now switch them back off.
 *
 *   node audit/gletscher-schneemodell/gm3b-mutations.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const G = 'scripts/glacier';
const VERIFIERS = ['verify-glacier-melt.mjs', 'verify-glacier-snowcal.mjs', 'verify-glacier-snowcore.mjs'];
const MUT = [
  ['Voreinstellung des Faktors zurück auf „gate-c“', `${G}/lib/snowcal.mjs`, "export const SNOW_PRECIP_DEFAULT = 'country';", "export const SNOW_PRECIP_DEFAULT = 'gate-c';"],
  ['Voreinstellung der Dichte zurück auf „helfricht“', `${G}/lib/snowcal.mjs`, "export const SNOW_DENSITY_SOURCE_DEFAULT = 'board';", "export const SNOW_DENSITY_SOURCE_DEFAULT = 'helfricht';"],
  ['Faktor je Land mit dem Verlauf der Tabelle', `${G}/lib/snowcal.mjs`, 'return { F: r.F * doc.precip.bridge.value, origin: r.fOrigin, from: r.fFrom };', 'return { F: r.F * doc.precip.bridge.value * precipProfile(300, r.gu, r.go), origin: r.fOrigin, from: r.fFrom };'],
  ['Faktor je Land ohne die Brücke', `${G}/lib/snowcal.mjs`, 'return { F: r.F * doc.precip.bridge.value, origin: r.fOrigin, from: r.fFrom };', 'return { F: r.F, origin: r.fOrigin, from: r.fFrom };'],
  ['„board“ ohne „country“ erlaubt', `${G}/lib/snowcal.mjs`, "if (out.density === 'board' && out.precip !== 'country') throw", 'if (false) throw'],
  ['unbekanntes Wort fällt auf die Voreinstellung zurück', `${G}/lib/snowcal.mjs`, 'if (!allowed.includes(value)) throw new Error(', 'if (!allowed.includes(value)) return fallback; if (false) throw new Error('],
  ['Lauf prüft nicht, ob die Tabelle jede Region kennt', `${G}/lib/snowcal.mjs`, 'for (const r of regions) if (!doc?.precip?.regions?.[r]) problems.push(`precip.regions: Region ${r} fehlt`);', ''],
  ['Lauf prüft die Regeln der Tabelle nicht', `${G}/lib/snowcal.mjs`, '  const problems = snowCalibrationProblems(doc);\n  for (const r of regions)', '  const problems = [];\n  for (const r of regions)'],
  ['zweiter Konstantensatz behält die Dichte des Kerns', `${G}/lib/snowcal.mjs`, 'rhoNew: d.rhoNew, rhoNewP10: d.span.p10', 'rhoNew: base.rhoNew, rhoNewP10: d.span.p10'],
  ['zweiter Konstantensatz ohne gemessene Quantile', `${G}/lib/snowcal.mjs`, 'rhoNewP10: d.span.p10, rhoNewP90: d.span.p90 });', '});'],
  ['Block im Dokument: Gradient ungeprüft', `${G}/lib/snowcal.mjs`, "if (block.gradient !== 0 || block.origin?.gradient !== 'set')", 'if (false)'],
  ['„country“ behält die 4 % je 100 m', `${G}/melt.mjs`, 'pf: precip.factorOf(g.region), pGrad: precip.gradient }', 'pf: precip.factorOf(g.region) }'],
  ['„country“ rechnet mit dem Faktor von Gate C', `${G}/melt.mjs`, 'pf: precip.factorOf(g.region), pGrad: precip.gradient }', 'pf: params.pf, pGrad: precip.gradient }'],
  ['Tabelle wird auch bei „gate-c“ geöffnet', `${G}/melt.mjs`, "if (precipRule === 'country') {", 'if (true) {'],
  ['Dokument verschweigt den Faktor', `${G}/melt.mjs`, ', ...(precip ? { precip: precip.block } : {}) },', ' },'],
  ['Statuszeile verschweigt den Faktor', `${G}/melt.mjs`, 'seconds: Math.round((Date.now() - tStart) / 1000), ...(precip ? { precip: precipRule } : {}) },', 'seconds: Math.round((Date.now() - tStart) / 1000) },'],
  ['Umgebungsvariable wird nicht gelesen', `${G}/melt.mjs`, 'snowPrecipOf(opts.precip ?? process.env.GLACIER_SNOW_PRECIP)', 'snowPrecipOf(opts.precip)'],
  ['Schmelzlauf reicht den Gradienten nicht an den Kern', `${G}/melt.mjs`, "...(params.pGrad == null ? {} : { pGrad: params.pGrad }) });", '});'],
  ['Kern übergeht den genannten Gradienten', `${G}/lib/meltcore.mjs`, '1 + (pGrad * (z - zP)) / 100', '1 + (MELT.pGrad * (z - zP)) / 100'],
  ['Kern ohne Angabe ohne Gradient', `${G}/lib/meltcore.mjs`, 'pGrad = MELT.pGrad }) {', 'pGrad = 0 }) {'],
  ['Spanne übergeht die gemessenen Quantile', `${G}/lib/snowcore.mjs`, 'if (Number.isFinite(c.rhoNewP10) && Number.isFinite(c.rhoNewP90)) return', 'if (false) return'],
  ['Schritt legt Neuschnee immer mit der Dichte des Kerns ab', `${G}/lib/snowcore.mjs`, 'rhoNew === undefined ? c.rhoNew : rhoNew', 'rhoNew === undefined ? SNOW.rhoNew : rhoNew'],
  ['Tabelle behauptet, der Producer benutze sie nicht', `${G}/snow-calibration.json`, '"usedByProducer": true,', '"usedByProducer": false,'],
  ['Voreinstellung liest eine andere Tabelle als die des Repos', `${G}/melt.mjs`, "opts.snowcal ?? join(here, 'snow-calibration.json')", "opts.snowcal ?? join(here, 'snow-calibration-2.json')"],
];
const run = () => VERIFIERS.map((v) => {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--import', './scripts/lib/register-ts.mjs', `scripts/${v}`], { cwd: ROOT, encoding: 'utf8' });
  return { verifier: v.replace(/^verify-|\.mjs$/g, ''), status: r.status, failed: (r.stdout.match(/^FAIL .*$/gm) ?? []).map((l) => l.slice(5, 9).trim()) };
});
const base = run();
if (base.some((r) => r.status !== 0)) { console.error('the verifiers are not green before the mutations', JSON.stringify(base)); process.exit(2); }
const out = [];
for (const [name, file, from, to] of MUT) {
  const p = join(ROOT, file), orig = readFileSync(p, 'utf8');
  let res = { name, file };
  try {
    if (!orig.includes(from)) throw new Error('pattern not found');
    writeFileSync(p, orig.replace(from, to));
    const rs = run();
    const red = rs.filter((r) => r.status !== 0);
    res = { ...res, noticed: red.length > 0, by: red.map((r) => `${r.verifier}: ${r.failed.join(', ') || 'Abbruch'}`), crashedOnly: red.length > 0 && red.every((r) => r.failed.length === 0) };
  } catch (e) { res = { ...res, error: String(e.message) }; }
  finally { writeFileSync(p, orig); }
  out.push(res);
  console.log(`${res.noticed ? 'bemerkt   ' : 'ÜBERSEHEN '} ${name}${res.by?.length ? ` (${res.by.join(' | ')})` : ''}${res.error ? ` — ${res.error}` : ''}`);
}
const after = run();
writeFileSync(join(import.meta.dirname, 'gm3b-mutations.json'), JSON.stringify({ generated: new Date().toISOString(), verifiers: VERIFIERS.map((v) => v.replace(/^verify-|\.mjs$/g, '').replace('glacier-', 'verify:glacier-')), greenBefore: true, greenAfter: after.every((r) => r.status === 0), noticed: out.filter((o) => o.noticed).length, of: out.length, crashedOnly: out.filter((o) => o.crashedOnly).length, mutations: out }, null, 1));
console.log(`${out.filter((o) => o.noticed).length} von ${out.length} bemerkt (${out.filter((o) => o.crashedOnly).length} nur als Abbruch); Prüfer danach ${after.every((r) => r.status === 0) ? 'grün' : 'ROT'}`);
