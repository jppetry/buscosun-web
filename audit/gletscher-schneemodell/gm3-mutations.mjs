#!/usr/bin/env node
/**
 * GM-3 — counter-check of `verify:glacier-snowcal`: every mutation below breaks one rule of the calibration code or of the table; the verifier must turn red
 * for each. The file is changed, the verifier is run, the file is restored (also on failure). Result: gm3-mutations.json.
 *
 *   node audit/gletscher-schneemodell/gm3-mutations.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const G = 'scripts/glacier';
const MUT = [
  ['Eisschmelze ohne den Faktor 1,6', `${G}/snowcal-fit.mjs`, 'if (!(swe > 0)) melt *= CAL.ice;', ''],
  ['Verlauf: unten und oben vertauscht', `${G}/snowcal-fit.mjs`, '1 + (gu * Math.min(d, 0)) / 100 + (go * Math.max(d, 0)) / 100', '1 + (gu * Math.max(d, 0)) / 100 + (go * Math.min(d, 0)) / 100'],
  ['Schneeanteil mit falscher Rampe', `${G}/snowcal-fit.mjs`, '(CAL.fsWarm + fsShift - Tb) / CAL.fsWarm', '(CAL.fsWarm + fsShift - Tb) / 4'],
  ['RhiresD-Tag ab 00 statt 06 UTC', `${G}/snowcal-fit.mjs`, "Date.parse(rh.day0 + 'T06:00:00Z')", "Date.parse(rh.day0 + 'T00:00:00Z')"],
  ['WGMS mit falscher Einheit', `${G}/snowcal-truth.mjs`, 'Math.round(Number(r.winter_balance) * 1000)', 'Math.round(Number(r.winter_balance) * 100)'],
  ['Medianhöhe beim Drittel der Fläche', `${G}/snowcal-truth.mjs`, 'if (acc + b.area >= total / 2) return b.z0 + ((total / 2 - acc)', 'if (acc + b.area >= total / 3) return b.z0 + ((total / 3 - acc)'],
  ['Stufenfläche nicht vom Nachbarjahr', `${G}/snowcal-truth.mjs`, 'if (c) { b.area = c.area;', 'if (false) { b.area = c.area;'],
  ['Region mit einem Gletscher bekommt einen eigenen Wert', `${G}/snowcal-fit.mjs`, 'minRegionGlaciers: 2,', 'minRegionGlaciers: 1,'],
  ['Formfehler ohne Abzug des Gletscherfehlers', `${G}/snowcal-fit.mjs`, 's4 += b.w * Math.abs(e[i] - s3);', 's4 += b.w * Math.abs(e[i]);'],
  ['Grenze von F aufgehoben', `${G}/snowcal-fit.mjs`, 'fBounds: [0.3, 5],', 'fBounds: [0.3, 50],'],
  ['Brett: Wasserwert in 12 statt 24 Stunden', `${G}/snowcal-density.mjs`, 'solidMm: mm / 24,', 'solidMm: mm / 12,'],
  ['Regel D3 ohne Untergrenze', `${G}/snowcal-density.mjs`, 'Math.max(DEN.d3.clip[0], a + b * tC)', '(a + b * tC)'],
  ['Tabellenregel: Brücke darf angewandt sein', `${G}/lib/snowcal.mjs`, "p.bridge.value !== 1 || p.bridge.origin !== 'set' || p.bridge.applied !== false", 'false'],
  ['Tabellenregel: gate muss nicht zum Urteil passen', `${G}/lib/snowcal.mjs`, 'else if (p.gate !== verdicts.every((v) => v.pass))', 'else if (false)'],
  ['Tabelle: F der Schweiz von Hand geändert', `${G}/snow-calibration.json`, '"F": 1.793,', '"F": 1.6,'],
  ['Tabelle: gate auf true gesetzt', `${G}/snow-calibration.json`, '"gate": false,', '"gate": true,'],
  ['Tabelle: andere Dichte', `${G}/snow-calibration.json`, '"rhoNew": 96', '"rhoNew": 68'],
  ['eingefrorene Methode nachträglich geändert', 'audit/gletscher-schneemodell/gm3-method-frozen.md', 'mindestens 3 % verbessert', 'mindestens 1 % verbessert'],
  ['Producer liest die Tabelle', `${G}/lib/weathercore.mjs`, null, "\n// import './snowcal.mjs';\n"],
];
const run = () => spawnSync(process.execPath, ['--experimental-strip-types', '--import', './scripts/lib/register-ts.mjs', 'scripts/verify-glacier-snowcal.mjs'], { cwd: ROOT, encoding: 'utf8' });
const base = run();
if (base.status !== 0) { console.error('the verifier is not green before the mutations'); process.exit(2); }
const out = [];
for (const [name, file, from, to] of MUT) {
  const p = join(ROOT, file), orig = readFileSync(p, 'utf8');
  let res = { name, file };
  try {
    if (from != null && !orig.includes(from)) throw new Error('pattern not found');
    writeFileSync(p, from == null ? orig + to : orig.replace(from, to));
    const r = run();
    const failed = (r.stdout.match(/^FAIL .*$/gm) ?? []).map((l) => l.slice(5, 9).trim());
    res = { ...res, noticed: r.status !== 0, failed, crashed: r.status !== 0 && failed.length === 0 };
  } catch (e) { res = { ...res, error: String(e.message) }; }
  finally { writeFileSync(p, orig); }
  out.push(res);
  console.log(`${res.noticed ? 'bemerkt   ' : 'ÜBERSEHEN '} ${name}${res.failed?.length ? ` (${res.failed.join(', ')})` : res.crashed ? ' (Abbruch)' : ''}${res.error ? ` — ${res.error}` : ''}`);
}
const after = run();
writeFileSync(join(import.meta.dirname, 'gm3-mutations.json'), JSON.stringify({ generated: new Date().toISOString(), verifier: 'verify:glacier-snowcal', greenBefore: true, greenAfter: after.status === 0, noticed: out.filter((o) => o.noticed).length, of: out.length, mutations: out }, null, 1));
console.log(`${out.filter((o) => o.noticed).length} von ${out.length} bemerkt; Prüfer danach ${after.status === 0 ? 'grün' : 'ROT'}`);
