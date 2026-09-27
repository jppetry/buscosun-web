/**
 * fx5-negcheck.mjs — the negative control of `fit.mjs --climaVars` (phase FX-5, E-FX-8; `audit/fusion-forschung.md` §6.5):
 * between a plain fit A (no `--climaCols`) and a fit B with `--climaCols=station --climaVars=<list>` on the same rows, every
 * MEAN and VARIANCE entry of a variable OUTSIDE the list must be byte-identical (names, β, λ, CV, fold β, status) — the flag
 * must not touch them — while every written entry of a listed variable ends with the μ_c column and differs from A.
 * Speed law, σ scale and hurdle are NOT compared (they follow the other Fit-5b flags: grid, bands, scale rule).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/fusion-forschung/fx5-negcheck.mjs --a=<A>\fusion.hindcast.json --b=<B>\fusion.hindcast.json
 *
 * Exit 1 on any violation. Prints the counts the audit quotes.
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'file:///C:/dev/buscosun-web/scripts/hindcast/lib/common.mjs';
import { climaColumnsFor } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/tables.ts';

const flags = parseArgs(process.argv.slice(2));
if (typeof flags.a !== 'string' || typeof flags.b !== 'string') throw new Error('--a und --b fehlen');
const A = JSON.parse(readFileSync(flags.a, 'utf8')), B = JSON.parse(readFileSync(flags.b, 'utf8'));
const list = B.design?.mean?.climaVars ?? null;
if (!list) throw new Error('B trägt kein design.mean.climaVars — nichts zu prüfen');
if (A.design?.mean?.clima === 'station') throw new Error('A ist selbst eine station-Tabelle — die Kontrolle braucht ein Fit ohne --climaCols');
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const stats = { outsideSame: 0, outsideDiff: [], outsideMissing: [], listedMu: 0, listedNoMu: [], listedSameAsA: [], varianceSame: 0, varianceDiff: [] };
for (const [k, eb] of Object.entries(B.mean)) {
  const v = k.split('|')[1], ea = A.mean[k];
  if (climaColumnsFor(B.design.mean, v) === 'none') {
    if (!ea) { stats.outsideMissing.push(k); continue; }
    if (same(ea, eb)) stats.outsideSame += 1; else stats.outsideDiff.push(k);
  } else if (eb.status === 'written') {
    if (eb.names[eb.names.length - 1] === 'muC') stats.listedMu += 1; else stats.listedNoMu.push(k);
    if (ea && same(ea.beta, eb.beta)) stats.listedSameAsA.push(k);
  }
}
for (const [k, eb] of Object.entries(B.variance)) {
  const v = k.split('|')[1];
  if (climaColumnsFor(B.design.mean, v) !== 'none') continue;
  const ea = A.variance[k];
  // the σ scale follows `--scaleVars` (a Fit-5b flag) — compare the moment model only
  const strip = (e) => e && { ...e, scale: undefined, scaleCv: undefined };
  if (ea && same(strip(ea), strip(eb))) stats.varianceSame += 1; else stats.varianceDiff.push(k);
}
const ok = !stats.outsideDiff.length && !stats.outsideMissing.length && !stats.listedNoMu.length && !stats.listedSameAsA.length && !stats.varianceDiff.length && stats.outsideSame > 0 && stats.listedMu > 0;
console.log(`[negcheck] climaVars ${list.join(',')} · Mittelwert-Strata außerhalb der Liste byte-gleich zu A: ${stats.outsideSame}, abweichend: ${stats.outsideDiff.length}${stats.outsideDiff.length ? ` (${stats.outsideDiff.slice(0, 5).join(' ')})` : ''}, in A fehlend: ${stats.outsideMissing.length} · gelistete geschriebene Strata mit μ_c-Spalte: ${stats.listedMu}, ohne: ${stats.listedNoMu.length}, β gleich A: ${stats.listedSameAsA.length} · Varianz-Strata außerhalb (ohne Skala) gleich: ${stats.varianceSame}, abweichend: ${stats.varianceDiff.length}${stats.varianceDiff.length ? ` (${stats.varianceDiff.slice(0, 5).join(' ')})` : ''}`);
console.log(`[negcheck] ${ok ? 'BESTANDEN' : 'VERLETZT'}`);
if (!ok) process.exit(1);
