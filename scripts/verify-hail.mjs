/**
 * Headless-Verifikation des Hagel-Layers (Phase HA1, Gate GHA1) — prüft den
 * ECHTEN App-Code (`src/sources/meteoSwissHail.ts`, `src/radar/hailField.ts`,
 * `src/radar/konrad3d.ts`) gegen ECHTE Fixtures. Kein Netz / kein GPU / kein Vitest.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-hail.mjs
 *
 * Fixtures (`scripts/fixtures/`, alle unverändert von der Quelle):
 *   meteoswiss-poh-bzc.h5    POH  — MeteoSchweiz, 2026-08-05 21:40 UTC
 *   meteoswiss-meshs-mzc.h5  MESHS— MeteoSchweiz, 2026-08-05 21:40 UTC (hagelfrei)
 *   konrad3d-sample.xml      DWD  — 3 Zellen, davon EINE mit Hagelsignal
 *
 * Die wichtigste Zusicherung hier ist die **Einheiten-Sperre**: MESHS ist in
 * **mm** (an der Datei gemessen, `audit/hagel.md` §2). Die Altdoku sagte „cm";
 * wer das übernimmt, zeigt Korngrößen 10× zu groß — im Hagel-Layer der
 * schlimmstmögliche Fehler.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { decodeSwissHail, isSwissHailSeason } from '../src/sources/meteoSwissHail.ts';
import {
  MESHS_STOPS, POH_STOPS, stopsFor, hailFloor, hailColor, hailRasterToRGBA, hailLegendEnds,
  meshsLabel, pohLabel, hasHail, hailCellHeadline, hailCellDetail, buildHailCellFeatures,
} from '../src/radar/hailField.ts';
import { parseKonrad3d } from '../src/radar/konrad3d.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (n) => join(here, 'fixtures', n);
const ab = (n) => { const b = readFileSync(fx(n)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

// ---------------------------------------------------------------------------
// (1) CH — POH aus der echten Datei
// ---------------------------------------------------------------------------
const poh = decodeSwissHail(ab('meteoswiss-poh-bzc.h5'), 'poh', 'bzc-fixture');
add('POH: Gitter 710×640', poh.width === 710 && poh.height === 640, `${poh.width}×${poh.height}`);
add('POH: Wertefeld vollständig', poh.values.length === 710 * 640);
add('POH: Messzeit aus /what, nicht Abrufzeit',
  poh.validAt.getUTCFullYear() === 2026 && poh.validAt.getUTCMonth() === 7 && poh.validAt.getUTCDate() === 5,
  poh.validAt.toISOString());
{
  let nan = 0, over1 = 0, neg = 0, max = 0;
  for (const v of poh.values) {
    if (!Number.isFinite(v)) { nan++; continue; }
    if (v > 1) over1++;
    if (v < 0) neg++;
    if (v > max) max = v;
  }
  add('POH: NaN = außerhalb der Abdeckung vorhanden', nan > 0, `${nan} Zellen`);
  add('POH ist ein ANTEIL 0…1, keine Prozentzahl', over1 === 0 && neg === 0 && max <= 1, `max=${max.toFixed(3)}`);
  add('POH: Maximum > 0 im Fixture (sonst prüft die Palette nichts)', max > 0, `${(max * 100).toFixed(0)} %`);
  add('POH: gemeldetes Maximum == Feldmaximum und substanziell (> 50 %)',
    Math.abs(max - poh.max) < 1e-9 && max > 0.5, `${poh.max}`);
}
// Ecken kommen aus /where und liegen bereits in WGS84 vor
{
  const [NW, NE, SE, SW] = poh.corners;
  add('POH: Ecken aus /where (WGS84), Reihenfolge NW/NE/SE/SW',
    Math.abs(NW[0] - 2.68942) < 1e-4 && Math.abs(NW[1] - 49.3744) < 1e-4 &&
    Math.abs(NE[0] - 12.4623) < 1e-4 && Math.abs(SE[1] - 43.6190) < 1e-4 && Math.abs(SW[0] - 3.16878) < 1e-4,
    JSON.stringify(poh.corners.map((c) => c.map((x) => +x.toFixed(3)))));
  add('POH: Gitter ist ein TRAPEZ (keine achsparallele Box)',
    Math.abs(NW[0] - SW[0]) > 0.4, `Δlon oben/unten = ${Math.abs(NW[0] - SW[0]).toFixed(3)}°`);
}

// ---------------------------------------------------------------------------
// (2) CH — MESHS + die Einheiten-Sperre (mm, NICHT cm)
// ---------------------------------------------------------------------------
const meshs = decodeSwissHail(ab('meteoswiss-meshs-mzc.h5'), 'meshs', 'mzc-fixture');
add('MESHS: gleiches Gitter wie POH', meshs.width === poh.width && meshs.height === poh.height);
add('MESHS: gleiche Ecken wie POH', JSON.stringify(meshs.corners) === JSON.stringify(poh.corners));
add('MESHS: hagelfreies Fixture ⇒ max = 0 (GÜLTIGES Ergebnis, kein Fehler)', meshs.max === 0, `${meshs.max}`);
{
  let nan = 0;
  for (const v of meshs.values) if (!Number.isFinite(v)) nan++;
  add('MESHS: NaN-Maske vorhanden', nan > 0, `${nan} Zellen`);
}
// Einheiten-Sperre: die Schwellen stehen in mm. In cm gelesen wären 20 „20 cm".
add('EINHEIT: MESHS-Stufen sind mm (erste Stufe 20 mm = 2 cm)', MESHS_STOPS[0].v === 20, `${MESHS_STOPS[0].v}`);
add('EINHEIT: meshsLabel(20 mm) = „2,0 cm"', meshsLabel(20) === '2,0 cm', meshsLabel(20));
add('EINHEIT: meshsLabel(60 mm) = „6,0 cm"', meshsLabel(60) === '6,0 cm', meshsLabel(60));
add('EINHEIT: meshsLabel(0) nennt kein Maß', meshsLabel(0) === 'kein Hagel erwartet', meshsLabel(0));
add('EINHEIT: pohLabel(0,81) = „81 %"', pohLabel(0.81) === '81 %', pohLabel(0.81));
add('Legenden-Enden passen zur Einheit', hailLegendEnds('meshs')[0] === '2 cm' && hailLegendEnds('poh')[1] === '≥ 90 %',
  hailLegendEnds('meshs').join('…') + ' / ' + hailLegendEnds('poh').join('…'));

// ---------------------------------------------------------------------------
// (3) Palette
// ---------------------------------------------------------------------------
add('Stufen aufsteigend (MESHS)', MESHS_STOPS.every((s, i) => i === 0 || s.v > MESHS_STOPS[i - 1].v));
add('Stufen aufsteigend (POH)', POH_STOPS.every((s, i) => i === 0 || s.v > POH_STOPS[i - 1].v));
add('stopsFor trennt die Produkte', stopsFor('meshs') !== stopsFor('poh'));
add('unter der Schwelle wird nicht gezeichnet', hailColor('meshs', hailFloor('meshs') - 0.001) === null);
add('NaN wird nicht gezeichnet', hailColor('poh', NaN) === null);
add('genau auf der Schwelle wird gezeichnet', hailColor('poh', hailFloor('poh')) !== null);
add('höchste Stufe gewinnt', JSON.stringify(hailColor('meshs', 999)) === JSON.stringify(MESHS_STOPS[4].rgba));
add('Deckkraft steigt mit dem Wert',
  MESHS_STOPS.every((s, i) => i === 0 || s.rgba[3] >= MESHS_STOPS[i - 1].rgba[3]));
{
  const rgba = hailRasterToRGBA(poh.values, poh.width, poh.height, 'poh');
  add('RGBA-Puffer hat 4 Byte je Zelle', rgba.length === poh.width * poh.height * 4);
  let painted = 0, nanPainted = 0;
  for (let i = 0; i < poh.values.length; i++) {
    const a = rgba[i * 4 + 3];
    if (a > 0) painted++;
    if (!Number.isFinite(poh.values[i]) && a > 0) nanPainted++;
  }
  add('POH-Raster malt nur oberhalb der Schwelle', painted > 0 && painted < poh.values.length / 10, `${painted} Zellen`);
  add('KEINE Farbe auf NaN-Zellen (außerhalb der Abdeckung)', nanPainted === 0, `${nanPainted}`);
  const rgbaM = hailRasterToRGBA(meshs.values, meshs.width, meshs.height, 'meshs');
  let paintedM = 0;
  for (let i = 0; i < meshs.values.length; i++) if (rgbaM[i * 4 + 3] > 0) paintedM++;
  add('hagelfreies MESHS-Raster ist vollständig transparent', paintedM === 0, `${paintedM}`);
}

// ---------------------------------------------------------------------------
// (4) DE — KONRAD3D-Hagelzellen
// ---------------------------------------------------------------------------
const run = parseKonrad3d(readFileSync(fx('konrad3d-sample.xml'), 'utf8'), 'fixture');
const cell12 = run.cells.find((c) => c.id === 12);
const cell231 = run.cells.find((c) => c.id === 231);
add('Fixture: 3 Zellen, davon eine mit Hagelsignal', run.cells.length === 3 && run.cells.filter(hasHail).length === 1);
add('hymec gelesen: area_hail 5,5 km²', Math.abs(cell12.hailAreaKm2 - 5.5) < 1e-9, `${cell12.hailAreaKm2}`);
add('hymec gelesen: area_large_hail 0 (kein Großhagel)', cell12.largeHailAreaKm2 === 0, `${cell12.largeHailAreaKm2}`);
add('hymec gelesen: echo_top_hail 6250 m', cell12.hailEchoTopM === 6250, `${cell12.hailEchoTopM}`);
add('hymec gelesen: maximum_near_ground_class 9', cell12.nearGroundClass === 9, `${cell12.nearGroundClass}`);
add('SENTINEL: echo_top_hail −1000000000 → null (Zelle ohne Hagel)',
  cell231.hailEchoTopM === null, `${cell231.hailEchoTopM}`);
add('Zelle ohne Hagelsignal zählt nicht als Hagel', hasHail(cell231) === false);

{
  const fc = buildHailCellFeatures(run);
  const kinds = fc.features.map((f) => f.properties.kind);
  add('nur die Hagelzelle wird gezeichnet (1 Fläche + 1 Punkt)',
    fc.features.length === 2 && kinds.includes('area') && kinds.includes('dot'), kinds.join(','));
  add('alle Features tragen dieselbe Zell-ID', fc.features.every((f) => f.properties.id === 12));
  const area = fc.features.find((f) => f.properties.kind === 'area');
  const ring = area.geometry.coordinates[0];
  add('Umriss ist ein geschlossener Ring',
    ring.length >= 4 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1], `${ring.length}`);
  add('Umriss liegt im DACH-Fenster',
    ring.every(([lo, la]) => la > 45 && la < 56 && lo > 1 && lo < 19));
  add('Flächen sind in den Properties (km²)', area.properties.areaHail === 5.5 && area.properties.areaLargeHail === 0);
  let worst = Infinity;
  const walk = (v) => {
    if (typeof v === 'number') worst = Math.min(worst, v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(fc.features.map((f) => f.geometry));
  add('keine Sentinel-Zahl in der Geometrie', worst > -9e8, `min=${worst}`);
}

// Wortwahl (D-19)
{
  const forbidden = ['Tornado', 'Warnung', 'Gefahr', 'Unwetter', 'trifft', 'es hagelt'];
  const head = hailCellHeadline(cell12);
  const det = hailCellDetail(cell12);
  add('Kurzzeile sagt „Radar erkennt Hagel"', head.includes('Radar erkennt Hagel'), head);
  add('kein Großhagel-Hinweis ohne Großhagel', !head.includes('Großhagel'), head);
  add('Detailzeile nennt Fläche und Obergrenze',
    det.includes('Hagelfläche') && det.includes('Hagel-Obergrenze'), det);
  add('keine Warnsprache (D-19)', ![head, det].some((t) => forbidden.some((w) => t.includes(w))));
  // Großhagel-Fall künstlich, aber aus echten Feldern abgeleitet
  const big = { ...cell12, largeHailAreaKm2: 3.5 };
  add('Großhagel wird als HINWEIS formuliert, nicht als Zusage',
    hailCellHeadline(big).includes('Hinweis auf Großhagel'), hailCellHeadline(big));
  add('Großhagelfläche erscheint im Detail', hailCellDetail(big).includes('davon Großhagel'), hailCellDetail(big));
}

// ---------------------------------------------------------------------------
// (5) Saison (CH-Produkte laufen 1. April – 30. September)
// ---------------------------------------------------------------------------
add('Saison: 5. August ist drin', isSwissHailSeason(new Date(Date.UTC(2026, 7, 5))));
add('Saison: 1. April ist drin', isSwissHailSeason(new Date(Date.UTC(2026, 3, 1))));
add('Saison: 30. September ist drin', isSwissHailSeason(new Date(Date.UTC(2026, 8, 30))));
add('Saison: 31. März ist draußen', !isSwissHailSeason(new Date(Date.UTC(2026, 2, 31))));
add('Saison: 1. Oktober ist draußen', !isSwissHailSeason(new Date(Date.UTC(2026, 9, 1))));

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail != null ? `  (${c.detail})` : ''}`);
console.log(`\n${failed === 0 ? `ALLE ${passed} CHECKS PASS` : `${failed} von ${checks.length} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failed === 0 ? 0 : 1);
