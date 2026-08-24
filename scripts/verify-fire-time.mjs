/**
 * Headless-Verifikation „Waldbrand: Zeitmodell" (Phase WB1, Gate GWB1).
 *
 *   npm run verify:fire-time
 *
 * Prüft `src/fire/fireTime.ts` — das echte Modul, kein Nachbau (V-94).
 *
 * Der Kern ist die Klemmung auf den kleinsten gemeinsamen Horizont: Die
 * Waldbrand-Layer reichen unterschiedlich weit (EU +9 d, DWD +6 d, ICON +1 d,
 * CH und Feuerverbote gar nicht), und ein gemeinsamer Regler darf niemals auf
 * einen Tag zeigen, den ein aktiver Layer nicht liefert. Ergänzend sichern
 * Quell-Sonden, dass dieses Modul NICHT heimlich zu `layerTime.ts` (Phase L5)
 * auswächst — die beiden Zeitmodelle bleiben getrennt (V-193).
 *
 * Netzfrei, dependency-frei.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  verifyFireTime, FIRE_LAYER_TIME, sharedMaxDay, clampDay, reconcileFireTime,
  dayToIsoDate, dayLabel, windowLabel, windowChoices, hasForecastSlider,
  followsSlider, laggingLayers, defaultFireTimeState, HOUR_AXIS_MAX,
} from '../src/fire/fireTime.ts';
import { verifyFirePlayback } from '../src/fire/firePlayback.ts';
import { FIRE_BIT_ORDER } from '../src/fire/fireModel.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

// --- (1) Eingebettete Selbstverifikation ------------------------------------
for (const c of verifyFireTime().checks) add(`[fireTime] ${c.name}`, c.ok, c.detail);
for (const c of verifyFirePlayback().checks) add(`[playback] ${c.name}`, c.ok, c.detail);

// --- (2) Unabhängige Kontrollen ---------------------------------------------
const now = Date.UTC(2026, 7, 14, 12, 0);

// Die Horizonte stimmen mit dem überein, was WB0 an den Quellen gemessen hat.
add('Horizonte entsprechen den gemessenen Quellen (9 / 1)',
  FIRE_LAYER_TIME.fireDanger.maxDay === 9
  && FIRE_LAYER_TIME.fireWeather.maxDay === 1);
// 2026-08-19: die Layer „Amtliche Stufe" und „Feuerverbote (CH)" sind
// zurückgezogen — sie dürfen in keinem Zeitmodell mehr auftauchen, sonst hinge
// ein Regler an einem toten Layer.
add('die zurückgezogenen Layer haben kein Zeitmodell mehr',
  FIRE_LAYER_TIME.fireIndexNational === undefined
  && FIRE_LAYER_TIME.fireBans === undefined);
add('Hotspots sind ein Rückblick, keine Vorhersage',
  FIRE_LAYER_TIME.fireHotspots.mode === 'window'
  && FIRE_LAYER_TIME.fireHotspots.windowsH?.join(',') === '24,168');
add('Schutzgebiete sind ein Zeitpunkt', FIRE_LAYER_TIME.fireContext.mode === 'instant');

// Vollständige Kreuzprobe: JEDE Kombination aus zwei Layern klemmt korrekt.
const ids = Object.keys(FIRE_LAYER_TIME);
let pairFails = 0;
for (const a of ids) {
  for (const b of ids) {
    const max = sharedMaxDay([a, b]);
    const fc = [a, b].filter((l) => FIRE_LAYER_TIME[l].mode === 'forecast');
    const want = fc.length ? Math.min(...fc.map((l) => FIRE_LAYER_TIME[l].maxDay)) : 0;
    if (max !== want) pairFails++;
    // Und der Regler darf danach nie über dem Horizont stehen.
    if (clampDay(99, [a, b]) > max) pairFails++;
  }
}
add('alle Layer-Paare klemmen korrekt (Kreuzprobe)', pairFails === 0, `${ids.length ** 2} Paare`);

// Der Regressionsanker aus dem Alltag: EU allein auf Tag 8, dann DE zuschalten.
const step1 = reconcileFireTime({ ...defaultFireTimeState(), day: 8 }, ['fireDanger']);
add('EU allein: Tag 8 bleibt erlaubt', step1.day === 8);
const step2 = reconcileFireTime(step1, ['fireDanger', 'fireContext']);
add('Schutzgebiete zugeschaltet: Regler bleibt auf 8 (instant klemmt nicht)', step2.day === 8);
const step3 = reconcileFireTime(step2, ['fireDanger', 'fireContext', 'fireWeather']);
add('Treiber zugeschaltet: Regler springt auf 1', step3.day === 1);
const step4 = reconcileFireTime(step3, ['fireDanger']);
add('zurück auf EU allein: Tag bleibt 1 (springt NICHT von selbst hoch)', step4.day === 1);

// Ehrlichkeit: welche Layer stehen still, während der Regler läuft?
add('auf Tag 3 stehen Schutzgebiete und Hotspots still — und das ist benennbar',
  laggingLayers(['fireDanger', 'fireContext', 'fireHotspots'], 3).length === 2
  && followsSlider('fireDanger', 3) === true);
add('hasForecastSlider ist false, wenn nur Zeitpunkt-Layer aktiv sind',
  hasForecastSlider(['fireContext']) === false && hasForecastSlider(['fireDanger']) === true);
add('windowChoices meldet nur, was ein aktiver Layer anbietet',
  windowChoices(['fireContext']).length === 0 && windowChoices(['fireHotspots']).length === 2);

// Datumsrechnung: UTC-treu, weil der String als WMS-TIME-Parameter rausgeht.
add('dayToIsoDate ist UTC-treu über den Tageswechsel',
  dayToIsoDate(0, Date.UTC(2026, 7, 14, 23, 59)) === '2026-08-14'
  && dayToIsoDate(1, Date.UTC(2026, 7, 14, 23, 59)) === '2026-08-15');
add('dayToIsoDate über den Jahreswechsel',
  dayToIsoDate(3, Date.UTC(2026, 11, 30, 12)) === '2027-01-02');
add('dayToIsoDate liefert immer YYYY-MM-DD',
  [0, 1, 5, 9].every((d) => /^\d{4}-\d{2}-\d{2}$/.test(dayToIsoDate(d, now))));
add('dayLabel und windowLabel sind nie leer',
  [0, 1, 2, 3, 9].every((d) => dayLabel(d, now).length > 0)
  && windowLabel(24).length > 0 && windowLabel(168).length > 0);

// --- (3) Quell-Sonde: dieses Modell bleibt klein und koppelt nicht an L5 ----
const src = readFileSync(join(ROOT, 'src', 'fire', 'fireTime.ts'), 'utf8');
add('fireTime.ts importiert nichts aus src/map (keine L5-Kopplung, V-193)',
  !/from\s+['"]\.\.\/map\//.test(src));
add('fireTime.ts importiert kein layerTime', !/layerTime/.test(src.replace(/^[\s\S]*?\*\//, '')));
// DOM-Freiheit auf ZUGRIFFE prüfen, nicht auf das Wort: `'window'` ist hier ein
// legitimer Modus-Wert (`FireTimeMode`), kein Browser-Objekt. Die erste Fassung
// dieser Sonde schlug genau daran fehl — sie hätte ein sauberes Modul angeklagt.
add('fireTime.ts ist DOM-frei (keine window./document.-Zugriffe, keine Hooks)',
  !/\bdocument\s*\.|\bwindow\s*\.|useState\s*\(|useEffect\s*\(|from\s+['"]react['"]/.test(src));
// Kein verstecktes „jetzt": jede Funktion bekommt die Zeit hereingereicht,
// sonst ist das Modul nicht reproduzierbar prüfbar (D-12).
const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
add('kein Date.now() in der Logik — „jetzt" wird immer übergeben',
  !/Date\.now\(\)/.test(body));

// --- (4) WF3: die Stundenachse in der Seite — Quell-Sonden an FirePage.tsx ---
const page = readFileSync(join(ROOT, 'src', 'fire', 'FirePage.tsx'), 'utf8');
const pageLines = page.split(/[\r]?[\n]/);
add('FirePage: beide 12-UTC-Anker laufen über frameAtValidTime (keine handgerollte Schleife mehr)',
  /from\s+['"]\.\.\/sources\/frameAtValidTime['"]/.test(page)
  && (page.match(/frameAtValidTime\(/g) ?? []).length >= 2
  && !/Math\.abs\(f\.validAt\.getTime\(\)\s*-\s*zielMs\)/.test(page));
add('FirePage: die Einheit kommt aus timeUnit (erzwungen > gewählt > Tage), nicht aus einem lokalen Flag',
  /timeUnit\(time,\s*activeList\)/.test(page) && /hasTimeSlider\(activeList,\s*unit\)/.test(page));
add('FirePage: Tages-Layer zeigen auf der Stundenachse den Kalendertag von jetzt + h (dayOfHour)',
  /dayOfHour\(time\.hour,\s*nowMs\)/.test(page)
  && /setCommittedDay\(dayForLayers\)/.test(page));
// 2026-08-19: die amtliche Stufe hat keinen Tagesregler mehr — die Stationsfarbe
// ist wbi_0 und darf NICHT still mit dem Regler der anderen Layer mitlaufen.
add('FirePage: der zurückgezogene Layer ist restlos raus (kein toter Ladeweg)',
  !/fireIndexNational/.test(page) && !/stationLevels/.test(page));
// 2026-08-22: der Windlayer `fireWind` ist zurückgezogen (Jans Auftrag) — kein
// Windframe, keine Zielzeit, keine Klemm-Zeile mehr; das Windgitter lädt nur
// noch für die Ausbreitung (SF1).
add('FirePage: der zurückgezogene Windlayer ist restlos raus (kein toter Ladeweg, keine Klemm-Zeile)',
  !/'fireWind'/.test(page) && !/windClamped|windTargetMs/.test(page));
// Mit dem Rückzug der Ausbreitung (2026-08-23) hat das Windgitter auf der
// Waldbrandseite keinen Verbraucher mehr — es wird gar nicht mehr geladen.
add('FirePage: das Windgitter wird nicht mehr geladen (kein Verbraucher übrig)',
  !/fetchIconD2Wind|sampleWindAt/.test(page));
const fmap = readFileSync(join(ROOT, 'src', 'fire', 'FireMap.tsx'), 'utf8');
add('FireMap: kein Windpartikel-Layer mehr (keine WindLayer-Instanz, kein Windframe)',
  !/WindLayer|windFrameAtValidTimeAsync|fire-wind-particles|'fireWind'/.test(fmap));
// Die Achse ist so lang, wie der Wind aus jedem Lauf reicht: 12 h ab Lauf minus Laufalter.
const windSrc = readFileSync(join(ROOT, 'src', 'wind', 'iconD2WindSource.ts'), 'utf8');
const windMax = Number(/const MAX_STEP = (\d+);/.exec(windSrc)?.[1]);
add('HOUR_AXIS_MAX (6) + maximales Laufalter (~5,5 h) ≤ Wind-MAX_STEP (12) — Wind folgt aus jedem Lauf',
  HOUR_AXIS_MAX + 5.5 <= windMax, `axis ${HOUR_AXIS_MAX}, MAX_STEP ${windMax}`);
add('FirePage: Permalink schreibt h nur auf der Stundenachse',
  /hour:\s*hourly\s*\?\s*time\.hour\s*:\s*null/.test(page));
add('FirePage: Abspielen läuft in der geltenden Einheit (stepPlayback einheitenfrei, Stunden/s)',
  /stepPlayback\(posRef\.current,\s*dt,\s*unitsPerSecond,\s*sliderMax\)/.test(page)
  && /hoursPerSecondForTier\(tier\)/.test(page));
add('FirePage: der Einheiten-Umschalter hängt an hourlyAvailable && !hourlyForced',
  /hourlyAvailable\(activeList\)\s*&&\s*!hourlyForced\(activeList\)/.test(page));
add('FirePage: Lag-Texte kennen beide Regler (Tages-/Stundenregler) und den Tageswert',
  /folgt dem Stundenregler nicht/.test(page) && /folgt dem Tagesregler nicht/.test(page)
  && /Tageswert · gilt für/.test(page));
// Mobil: der Umschalter wird zur eigenen Zeile mit 44-px-Knöpfen (mobile-design-guidelines §3).
const css = readFileSync(join(ROOT, 'src', 'fire', 'fireDeck.css'), 'utf8');
const mobileBlock = css.slice(css.indexOf('@media (max-width: 767px)'));
// Brandradar Command-Deck (2026-08-22): Klassen .br-td-unit / .br-close.
add('fireDeck.css: Einheiten-Umschalter mobil ≥ 44 px',
  /\.br-td-unit button\s*\{[^}]*min-height:\s*44px/.test(mobileBlock));

// --- (5) Der Rückzug von Feuerwetter + Ausbreitung (2026-08-23) --------------
// Jans Auftrag, ausdrückliche Ausnahme vom Funktionserhalt: der Producer
// `iconD2FireWeather.ts` zog ~35 MiB je Aktivierung durch den Netlify-Proxy
// (audit/bandbreite.md §18). Mit ihm gingen der Pfeil-Layer `fireSpread` und
// die Punktkurve, die beide daran hingen. Diese Sonden halten den Rückzug
// RESTLOS — ein halb entfernter Layer ist schlimmer als keiner.
add('FireMap: kein Ausbreitungs-Layer mehr (kein Pfeil, kein Fächer, kein Lizenzträger)',
  !/SPREAD_|fire-spread-|spreadFc/.test(fmap));
add('FireMap: die zurückgezogene Rasterfläche ist restlos entfernt (kein toter ScalarLayer)',
  !/fire-forecast-scalar|forecastLayerRef/.test(fmap));
add('FirePage: kein Feuerwetter-Producer, keine Punktkurve, kein Ausbreitungslauf',
  !/fetchIconD2FireWeather|computeSpreadRun|pointCurve|hffmcChain/.test(page));
add('Bit 14 bleibt reserviert — geteilte #wb=-Links zeigen nicht auf andere Layer',
  FIRE_BIT_ORDER[14] === null && FIRE_BIT_ORDER.indexOf('fireAnomalies') === 15);
add('die Module des Rückzugs sind wirklich weg (kein toter Import-Pfad)',
  !existsSync(join(ROOT, 'src', 'sources', 'iconD2FireWeather.ts'))
    && !existsSync(join(ROOT, 'src', 'fire', 'spread'))
    && !existsSync(join(ROOT, 'src', 'fire', 'fwi')));
// --- Ausgabe ----------------------------------------------------------------
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
process.exit(failed === 0 ? 0 : 1);
