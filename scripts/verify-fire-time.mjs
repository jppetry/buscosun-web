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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  verifyFireTime, FIRE_LAYER_TIME, sharedMaxDay, clampDay, reconcileFireTime,
  dayToIsoDate, dayLabel, windowLabel, windowChoices, hasForecastSlider,
  followsSlider, laggingLayers, defaultFireTimeState, HOUR_AXIS_MAX,
} from '../src/fire/fireTime.ts';
import { verifyFirePlayback } from '../src/fire/firePlayback.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

// --- (1) Eingebettete Selbstverifikation ------------------------------------
for (const c of verifyFireTime().checks) add(`[fireTime] ${c.name}`, c.ok, c.detail);
for (const c of verifyFirePlayback().checks) add(`[playback] ${c.name}`, c.ok, c.detail);

// --- (2) Unabhängige Kontrollen ---------------------------------------------
const now = Date.UTC(2026, 7, 14, 12, 0);

// Die Horizonte stimmen mit dem überein, was WB0 an den Quellen gemessen hat.
add('Horizonte entsprechen den gemessenen Quellen (9 / 6 / 1)',
  FIRE_LAYER_TIME.fireDanger.maxDay === 9
  && FIRE_LAYER_TIME.fireIndexNational.maxDay === 6
  && FIRE_LAYER_TIME.fireWeather.maxDay === 1);
add('Hotspots sind ein Rückblick, keine Vorhersage',
  FIRE_LAYER_TIME.fireHotspots.mode === 'window'
  && FIRE_LAYER_TIME.fireHotspots.windowsH?.join(',') === '24,168');
add('CH-Feuerverbote sind ein Zeitpunkt', FIRE_LAYER_TIME.fireBans.mode === 'instant');

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
const step2 = reconcileFireTime(step1, ['fireDanger', 'fireIndexNational']);
add('DE zugeschaltet: Regler springt auf 6, nicht ins Leere', step2.day === 6);
const step3 = reconcileFireTime(step2, ['fireDanger', 'fireIndexNational', 'fireWeather']);
add('Treiber zugeschaltet: Regler springt auf 1', step3.day === 1);
const step4 = reconcileFireTime(step3, ['fireDanger']);
add('zurück auf EU allein: Tag bleibt 1 (springt NICHT von selbst hoch)', step4.day === 1);

// Ehrlichkeit: welche Layer stehen still, während der Regler läuft?
add('auf Tag 3 stehen Verbote und Hotspots still — und das ist benennbar',
  laggingLayers(['fireDanger', 'fireBans', 'fireHotspots'], 3).length === 2
  && followsSlider('fireDanger', 3) === true);
add('hasForecastSlider ist false, wenn nur Zeitpunkt-Layer aktiv sind',
  hasForecastSlider(['fireBans']) === false && hasForecastSlider(['fireDanger']) === true);
add('windowChoices meldet nur, was ein aktiver Layer anbietet',
  windowChoices(['fireBans']).length === 0 && windowChoices(['fireHotspots']).length === 2);

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
  && /stationLevels\.get\(s\.id\)\?\.\[dayForLayers\]/.test(page)
  && /setCommittedDay\(dayForLayers\)/.test(page));
add('FirePage: Wind bekommt auf der Stundenachse die Zielzeit jetzt + h (windTargetMs), sonst null',
  /const windTargetMs = hourly \? frameTargetMs : null/.test(page) && /windTargetMs=\{windTargetMs\}/.test(page));
add('FirePage: ein zu kurzer Windlauf wird gesagt, nicht still geklemmt (windClamped)',
  /windClamped/.test(page) && /Modellfeld reicht bis \+/.test(page));
const fmap = readFileSync(join(ROOT, 'src', 'fire', 'FireMap.tsx'), 'utf8');
add('FireMap: Windframe-Zielzeit = windTargetMs ?? Date.now() — Tagesachse bleibt „jetzt"',
  /windFrameAtValidTimeAsync\(wind,\s*windTargetMs\s*\?\?\s*Date\.now\(\)/.test(fmap)
  && /\[wind,\s*active,\s*windEpoch,\s*windTargetMs\]/.test(fmap));
// Die Achse ist so lang, wie der Wind aus jedem Lauf reicht: 12 h ab Lauf minus Laufalter.
const windSrc = readFileSync(join(ROOT, 'src', 'wind', 'iconD2WindSource.ts'), 'utf8');
const windMax = Number(/const MAX_STEP = (\d+);/.exec(windSrc)?.[1]);
add('HOUR_AXIS_MAX (6) + maximales Laufalter (~5,5 h) ≤ Wind-MAX_STEP (12) — Wind folgt aus jedem Lauf',
  HOUR_AXIS_MAX + 5.5 <= windMax, `axis ${HOUR_AXIS_MAX}, MAX_STEP ${windMax}`);
// Producer (WF2) lädt nicht mehr, als die Achse zeigt.
const producer = readFileSync(join(ROOT, 'src', 'sources', 'iconD2FireWeather.ts'), 'utf8');
add('FIRE_WEATHER_AHEAD_H == HOUR_AXIS_MAX (Producer-Horizont = Stundenachse)',
  Number(/export const FIRE_WEATHER_AHEAD_H = (\d+);/.exec(producer)?.[1]) === HOUR_AXIS_MAX);
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
add('fireDeck.css: Einheiten-Umschalter mobil ≥ 44 px',
  /\.fire-td-unit button\s*\{[^}]*min-height:\s*44px/.test(mobileBlock));

// --- (5) WF4: der Forecast-Layer in Seite und Karte --------------------------
// Der Layer ist der erste `hourly`-Layer; die Sonden sichern die drei Stellen,
// an denen ein Custom-GL-Layer in diesem Projekt erfahrungsgemäß still bricht.
add('FireMap: `fire-forecast-scalar` steht in CUSTOM_GL_LAYERS (sonst Platzhalter ⇒ nie sichtbar)',
  /const CUSTOM_GL_LAYERS = new Set\(\[[^\]]*'fire-forecast-scalar'/.test(fmap));
add('FireMap: der Forecast hat einen Lizenzträger (Custom-Layer tragen keine Source-Attribution)',
  /ATTRIB_CARRIERS[\s\S]{0,600}fire-forecast-attrib[\s\S]{0,120}ICON_D2_FIRE_WEATHER_ATTRIBUTION/.test(fmap));
add('FireMap: der Forecast-Frame wird mit vMin 0 / vMax 1 gesetzt (R = ISI/ISI_VMAX kommt aus dem Producer)',
  /forecastLayerRef\.current\.setData\([\s\S]{0,240}vMin:\s*0,\s*vMax:\s*1/.test(fmap));
add('FireMap: der Forecast-Zustand steht in stateRef UND in den applyState-Deps',
  (fmap.match(/wind, soil, forecast, fireEvents/g) ?? []).length === 2
    && /weather, wind, soil, forecast, day,/.test(fmap));
add('FirePage: der Forecast lädt über den WF2-Producer',
  /fetchIconD2FireWeather\(\{/.test(page) && /aheadHours:\s*FIRE_WEATHER_AHEAD_H/.test(page));
add('FirePage: der Forecast-Frame kommt aus frameAtValidTime (eine Zeitregel für alle ICON-Layer)',
  /const forecast = useMemo\([\s\S]{0,200}frameAtValidTime\(fireWx\.frames, frameTargetMs\)/.test(page));
// Der Punkt-Forecast zieht die Fusions-Quellenschicht nach. Statisch importiert
// läge sie im FirePage-Chunk und jeder Waldbrand-Kaltstart bezahlte sie mit.
add('FirePage: der Punkt-Forecast wird NUR dynamisch importiert (eigener Chunk)',
  /await Promise[.]all[(][[][\s\S]{0,200}import[(]'[.][.][/]pointForecast[/]pointForecast'[)]/.test(page)
    && !pageLines.some((l) => /^import\s/.test(l) && /pointForecast[/]pointForecast/.test(l)));
add('FirePage: die Punktkurve rechnet mit DEMSELBEN Kern wie die Fläche (hffmcChain + isi)',
  /hffmcChain\(start,/.test(page) && /ffmcEquilibrium\(/.test(page) && /isiOf\(chain\[i\]/.test(page));
// Ehrlichkeit: ein Leerzustand ohne Grund läse sich wie „keine Gefahr".
add('FirePage: die Punktkurve kennt einen Leerzustand MIT Grund (`gap` + reason)',
  /kind:\s*'gap'[\s\S]{0,200}reason:/.test(page));
add('FirePage: die Punktkurve sagt „Punkt (Fusion) ≠ Fläche (ICON-D2)"',
  /Punkt \(Fusion\) ≠ Fläche \(ICON-D2\)/.test(page));
add('fireDeck.css: der Schließen-Knopf der Punktkurve ist mobil ≥ 44 px',
  /\.fire-pc-close\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/.test(mobileBlock));

// --- Ausgabe ----------------------------------------------------------------
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
process.exit(failed === 0 ? 0 : 1);
