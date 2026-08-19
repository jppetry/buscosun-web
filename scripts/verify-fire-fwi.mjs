/**
 * Headless-Verifikation „Waldbrand: FWI-Rechenkern" (Phase WF1, Gate GWF1).
 *
 *   npm run verify:fire-fwi
 *
 * Prüft `src/fire/fwi/fwi.ts` — das echte Modul, kein Nachbau — gegen die
 * Testvektoren des Referenzpakets `cffdrs` (Natural Resources Canada):
 *
 *   scripts/fixtures/fire-fwi-vectors.json
 *     Quelle: https://github.com/cffdrs/cffdrs_r (main), abgerufen 2026-08-19.
 *     `daily49`  = tests/testthat/data/fwi_01.csv — `fwi(test_fwi)`, die
 *                  1985er Testreihe (Van Wagner & Pickett) mit allen sechs
 *                  Ausgaben je Tag, Start 85/6/15, Breite 40 °N;
 *     `ffmcDaily`/`dmcDaily`/`dcDaily`/`isi`/`bui`/`fwi`/`hffmc`
 *                = Stichproben aus den Paket-Sweeps (tests/testthat/data/*.csv),
 *                  auf physikalisch gültige Bereiche gefiltert (RH 0…100,
 *                  Regen ≥ 0, DMC/DC-Tabellen für Breite > 30° bzw. > 20°).
 *     Präzision der Referenz: 4 signifikante Stellen (setup.r `SIG_DIGS <- 4`)
 *     ⇒ Toleranz = 0,6 Einheiten der 4. signifikanten Stelle, mindestens 0,006.
 *
 * Netzfrei, dependency-frei. Was hier NICHT geprüft wird: die Lawson-Diurnal-
 * Starttabellen (kommen mit WF5) und alles, was einen Browser braucht.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  verifyFwi, FWI_STARTUP, ffmcDaily, dmcDaily, dcDaily, isi, bui, fwi, dsr, dailyFwi,
  hffmc, hffmcChain, ffmcEquilibrium, ffmcEquilibriumBand, hourlyIndices, snowMasked,
  DMC_DAY_LENGTH, DC_DAY_LENGTH,
} from '../src/fire/fwi/fwi.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

/** Tolerance for a reference rounded to 4 significant digits. */
function tol4(expected) {
  const a = Math.abs(expected);
  if (a === 0) return 0.006;
  const unit = Math.pow(10, Math.floor(Math.log10(a)) - 3);
  return Math.max(0.006, 0.6 * unit);
}
const near = (got, exp) => Number.isFinite(got) && Math.abs(got - exp) <= tol4(exp);

// --- (1) Eingebettete Selbstverifikation ------------------------------------
for (const c of verifyFwi().checks) add(`[fwi] ${c.name}`, c.ok, c.ok ? '' : `erwartet ${c.expected}, ist ${c.got}`);

// --- (2) Referenzvektoren ---------------------------------------------------
const V = JSON.parse(readFileSync(join(ROOT, 'scripts', 'fixtures', 'fire-fwi-vectors.json'), 'utf8'));
add('Vektor-Fixture trägt Herkunft + Abrufdatum', typeof V._meta?.repo === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(V._meta?.fetched ?? ''));

// (2a) Tageskette 1985: alle sechs Ausgaben je Tag, Zustand wird fortgeschrieben.
{
  let state = { ...FWI_STARTUP };
  let worst = { name: '', diff: 0 };
  let fails = 0;
  for (const r of V.daily49.rows) {
    const out = dailyFwi(state, { t: r.temp, rh: r.rh, w: r.ws, r24: r.prec, month: r.mon });
    for (const k of ['ffmc', 'dmc', 'dc', 'isi', 'bui', 'fwi', 'dsr']) {
      const diff = Math.abs(out[k] - r[k]);
      if (!near(out[k], r[k])) { fails++; if (diff > worst.diff) worst = { name: `${r.mon}-${r.day} ${k}: soll ${r[k]}, ist ${out[k].toFixed(4)}`, diff }; }
    }
    state = { ffmc: out.ffmc, dmc: out.dmc, dc: out.dc };
  }
  add(`Tageskette 1985 (${V.daily49.rows.length} Tage × 7 Größen) trifft cffdrs auf 4 Stellen`, fails === 0,
    fails ? `${fails} Abweichungen, größte: ${worst.name}` : `Endzustand FFMC ${state.ffmc.toFixed(2)} DMC ${state.dmc.toFixed(2)} DC ${state.dc.toFixed(2)}`);
}

// (2b) Einzelfunktionen gegen die Sweeps.
function sweep(name, rows, fn) {
  let fails = 0; let worst = { row: null, diff: 0 };
  for (const row of rows) {
    const exp = row[row.length - 1];
    const got = fn(row);
    if (!near(got, exp)) { fails++; const d = Math.abs(got - exp); if (!(d <= worst.diff)) worst = { row: `${JSON.stringify(row)} → ${got}`, diff: d }; }
  }
  add(`${name}: ${rows.length} Vektoren`, fails === 0, fails ? `${fails} Abweichungen, z. B. ${worst.row}` : '');
}
sweep('ffmcDaily', V.ffmcDaily.rows, ([y, t, h, w, p]) => ffmcDaily(y, t, h, w, p));
sweep('dmcDaily', V.dmcDaily.rows, ([y, t, h, p, m]) => dmcDaily(y, t, h, p, m));
sweep('dcDaily', V.dcDaily.rows, ([y, t, p, m]) => dcDaily(y, t, p, m));
sweep('isi', V.isi.rows, ([f, w]) => isi(f, w));
sweep('bui', V.bui.rows, ([a, b]) => bui(a, b));
sweep('fwi', V.fwi.rows, ([a, b]) => fwi(a, b));
sweep('hffmc (time.step 9/18 h, Regenfälle)', V.hffmc.rows, ([y, t, h, w, p, ts]) => hffmc(y, t, h, w, p, ts));

// --- (3) Invarianten --------------------------------------------------------
add('Tageslängentabellen haben 12 Einträge (Le ≥ 30° N, Lf > 20° N)',
  DMC_DAY_LENGTH.length === 12 && DC_DAY_LENGTH.length === 12 && DMC_DAY_LENGTH[3] === 12.8 && DC_DAY_LENGTH[6] === 6.4);
{
  const dry = Array.from({ length: 72 }, () => ({ t: 25, rh: 30, w: 12, r1h: 0 }));
  const band = ffmcEquilibriumBand(25, 30);
  const fromLow = hffmcChain(40, dry); const fromHigh = hffmcChain(99, dry);
  add('konstantes Wetter: Kette von unten und oben landet im Gleichgewichtsband',
    fromLow[71] >= band.lo - 0.3 && fromLow[71] <= band.hi + 0.3 && fromHigh[71] >= band.lo - 0.3 && fromHigh[71] <= band.hi + 0.3,
    `Band [${band.lo.toFixed(2)}, ${band.hi.toFixed(2)}], von 40 → ${fromLow[71].toFixed(2)}, von 99 → ${fromHigh[71].toFixed(2)}`);
  add('ffmcEquilibrium liegt im Band', ffmcEquilibrium(25, 30) > band.lo && ffmcEquilibrium(25, 30) < band.hi);
  add('feuchter ⇒ niedrigeres Gleichgewicht', ffmcEquilibrium(20, 80) < ffmcEquilibrium(20, 30));
}
add('RH↑ ⇒ hFFMC↓ (eine Stunde, sonst gleich)', hffmc(85, 20, 30, 10, 0) > hffmc(85, 20, 70, 10, 0));
add('Regen senkt hFFMC monoton (0 → 1 → 5 mm)',
  hffmc(90, 20, 40, 10, 0) > hffmc(90, 20, 40, 10, 1) && hffmc(90, 20, 40, 10, 1) > hffmc(90, 20, 40, 10, 5));
add('ISI monoton im Wind (0 … 60 km/h)', [0, 5, 10, 20, 40, 60].every((w, i, a) => i === 0 || isi(90, w) > isi(90, a[i - 1])));
add('BUI monoton in DMC und DC', bui(20, 200) > bui(10, 200) && bui(20, 300) > bui(20, 200));
add('DSR ist 0,0272·FWI^1,77', Math.abs(dsr(10) - 0.0272 * Math.pow(10, 1.77)) < 1e-9);
add('NaN wird durchgereicht, nie zu 0', [ffmcDaily(NaN, 20, 40, 5, 0), dmcDaily(6, 20, NaN, 0, 5), dcDaily(15, NaN, 0, 5), isi(NaN, 5), bui(NaN, 10), fwi(5, NaN), hffmc(85, 20, 40, NaN, 0)].every(Number.isNaN));
add('Kelvin-Fehleingabe ⇒ NaN in allen Tages- und Stundenfunktionen',
  [ffmcDaily(85, 293, 40, 5, 0), dmcDaily(6, 293, 40, 0, 5), dcDaily(15, 293, 0, 5), hffmc(85, 293, 40, 5, 0)].every(Number.isNaN));
add('snowMasked: 1 cm ist die Grenze', !snowMasked(0.01) && snowMasked(0.0101) && !snowMasked(NaN));
add('hourlyIndices: ohne BUI kein FWI, mit BUI ein FWI', hourlyIndices(88, 10, null).fwi === null && Number.isFinite(hourlyIndices(88, 10, 40).fwi));

// --- (4) Quell-Sonde: das Modul bleibt rein ----------------------------------
const src = readFileSync(join(ROOT, 'src', 'fire', 'fwi', 'fwi.ts'), 'utf8');
const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
add('fwi.ts importiert nichts (reine Mathematik)', !/^\s*import\s/m.test(body));
add('fwi.ts ist DOM-, Netz- und Zeit-frei', !/\bdocument\s*\.|\bwindow\s*\.|\bfetch\s*\(|Date\.now\(\)|from\s+['"]react['"]/.test(body));
add('fwi.ts nennt die Referenzen (Van Wagner 1977/1985/1987, cffdrs)',
  /Van Wagner/.test(src) && /1977/.test(src) && /1985/.test(src) && /1987/.test(src) && /cffdrs/.test(src));
add('kein eigener Gewichtsfaktor: die FF-Skalen-Konstante ist die exakte 250·59,5/101 (cffdrs)',
  /250\s*\*\s*59\.5\s*\/\s*101/.test(body) && !/147\.2\b/.test(body));

// --- Ausgabe ----------------------------------------------------------------
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
process.exit(failed === 0 ? 0 : 1);
