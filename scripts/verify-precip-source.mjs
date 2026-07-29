/**
 * Headless-Verifikation der Niederschlags-Quellenwahl (Konsolidierungs-Phase N1) —
 * prüft die REINE Entscheidungslogik am ECHTEN App-Code
 * (`src/nowcast/precipSource.ts`), so wie sie `MapView.tsx` verdrahtet. Kein GPU /
 * kein Fetch / kein Vitest.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-precip-source.mjs
 *
 * ENTSCHEIDUNG Jan (2026-07-24): „Niederschlag · jetzt–2 h" = NUR gemessenes
 * Radar/Nowcast, per Land bis zum Nowcast-Horizont (DE 2 / AT 3 / CH 0,5 h);
 * die Modell-/Fusionshälfte (2–12 h) ist draußen. `precipSource.ts` ist rein
 * (nur `type Country`) → headless importierbar. Deckt: Radar-Fenster + Grenzen,
 * KEINE Modellverlängerung, DACH-OR-Sichtbarkeit, Slider-Horizont.
 */
import {
  resolvePrecipSource, precipCompositeReady, precipRadarHorizonHours,
  verifyPrecipSource, RADAR_HORIZON_H,
} from '../src/nowcast/precipSource.ts';

const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

// (1) Die im App-Code eingebettete Selbst-Verifikation.
const inApp = verifyPrecipSource();
for (const c of inApp.checks) add(`[app] ${c.name}`, c.ok, c.detail);

// (2) Unabhängige Kontrollen gegen die exportierten Helfer.
add('RADAR_HORIZON_H DE=2 · AT=3 · CH=0.5',
  RADAR_HORIZON_H.DE === 2 && RADAR_HORIZON_H.AT === 3 && RADAR_HORIZON_H.CH === 0.5,
  `${RADAR_HORIZON_H.DE}/${RADAR_HORIZON_H.AT}/${RADAR_HORIZON_H.CH}`);

const full = { radarDE: true, radarAT: true, radarCH: true };

// Kern-Entscheidung: kürzer & radar-only — die Naht (Ende der Ansicht) liegt am
// Land-Horizont, jenseits davon KEINE Modellverlängerung.
add('DE Naht: 1.9 h ready → 2.1 h NICHT ready',
  resolvePrecipSource(1.9, 'DE', full).ready === true && resolvePrecipSource(2.1, 'DE', full).ready === false);

// Per-Land isoliert.
const deOnly = { radarDE: true, radarAT: false, radarCH: false };
const atOnly = { radarDE: false, radarAT: true, radarCH: false };
const chOnly = { radarDE: false, radarAT: false, radarCH: true };
add('DE-only: 2.0 h ready · 2.1 h nicht', resolvePrecipSource(2.0, 'DE', deOnly).ready === true && resolvePrecipSource(2.1, 'DE', deOnly).ready === false);
add('AT-only: 3.0 h ready · 3.1 h nicht', resolvePrecipSource(3.0, 'AT', atOnly).ready === true && resolvePrecipSource(3.1, 'AT', atOnly).ready === false);
add('CH-only: 0.4 h ready · 0.5 h nicht (strikt)', resolvePrecipSource(0.4, 'CH', chOnly).ready === true && resolvePrecipSource(0.5, 'CH', chOnly).ready === false);

// DACH-OR: bei 2.5 h führt nur AT (INCA); Komposit sichtbar. Bei 3.5 h keiner mehr.
add('Komposit 2.5 h sichtbar (AT), 3.5 h nicht',
  precipCompositeReady(2.5, full) === true && precipCompositeReady(3.5, full) === false);

// Keine Modellhälfte: selbst mit allen Radaren ist ab 3 h Schluss (max Horizont INCA).
add('Komposit hat KEINE Modellverlängerung > 3 h', precipCompositeReady(4, full) === false && precipCompositeReady(12, full) === false);

// Slider-Horizont = max geladener Radar-Horizont.
add('Slider-Horizont: full=3 · DE-only=2 · leer=0',
  precipRadarHorizonHours(full) === 3 && precipRadarHorizonHours(deOnly) === 2 && precipRadarHorizonHours({ radarDE: false, radarAT: false, radarCH: false }) === 0);

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail != null ? `  (${c.detail})` : ''}`);
}
console.log(`\n${failed === 0 ? `ALLE ${passed} CHECKS PASS` : `${failed} von ${checks.length} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failed === 0 ? 0 : 1);
