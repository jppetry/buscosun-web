# Diagnose RP0 — Punktverortung im Regenradar (Karte ↔ Slider/Punktstreifen)

> Stand: 2026-08-19 · Auslöser: Jans Beobachtung, dass die Karte an einem Standort
> Niederschlag zeigt, während der Slider unten für denselben Standort „trocken“ meldet.
> Status: **RP0 diagnostiziert · RP1 (DE) Gate GRP1 grün (§10) · RP2 (AT + CH) Gate GRP2 grün (§11).**
> Alle drei Landesgitter werden jetzt in ihrem eigenen Gitterraum verortet — Karte, Karten-Komposit und
> Punktabfrage teilen EINE Geometrie je Quelle.

## 1. Befund in einem Satz

Die Karte zeichnet das RADOLAN-Raster **projektionskorrekt**, die Punktabfrage darunter
(Slider-Profil, Punktstreifen, „Regen in X Minuten“, Regenwahrscheinlichkeit, Klick-Abfrage)
liest ihre mm/h-Werte über eine **lineare Näherung zwischen den vier Geo-Ecken** — und greift
damit in Deutschland **13–36 km (Median 24 km) zu weit nördlich** ins Gitter. Karte und Slider
beschreiben nicht denselben Ort.

## 2. Die zwei Wege durch den Code

| | Karte (Raster) | Punktabfrage (Slider/Streifen/Text) |
|---|---|---|
| Modul | `src/scalar/RainLayer.ts` → `setFrame({ warpLnglat })` | `src/pointForecast/quadSampler.ts` → `sampleRadarQuad` |
| Verortung DE | **Warp-Mesh** 32×32, Knoten exakt polar-stereografisch (`de1200WarpMesh`, `src/sources/radolan.ts:93`) | inverse Bilinear-Interpolation der 4 WGS84-Ecken (`inverseBilinear`) |
| Restfehler | ~40 m (dokumentiert in `radolan.ts:63-69`) | 13–36 km (gemessen, §3) |

Die Widerlegung steht bereits im eigenen Repo: `RainLayer.ts:110-116` begründet das Warp-Mesh
mit „sonst bis ~40 km Versatz“, und `precipComposite.ts:21-24` schreibt für den Kompositor der
Wetterkarte ausdrücklich „RADOLAN ist polar-stereografisch → exakte Inverse über `psFwd`“
(umgesetzt in `precipIndexMap.ts:41-53`, Flag `ps`). Der Kommentarkopf von `quadSampler.ts:6-12`
behauptet dagegen „deutlich unter einem Pixel“ — das gilt für achsparallele lat/lon-Gitter
(ICON-D2 `regular-lat-lon`, daher ist `iconD2Cape.ts:41` **nicht** betroffen), nicht für RADOLAN.

## 3. Messung 1 — Sampler gegen exakte Projektion (netzfrei, DE1200)

Exakte PS-Inverse (dieselben Konstanten wie `radolan.ts`) gegen `inverseBilinear`, 20 Städte:

| Ort | Δ Spalte | Δ Zeile | Versatz | Richtung |
|---|---:|---:|---:|---|
| Flensburg | +0,5 | −36,9 | **36,0 km** | NO |
| Kiel | −0,0 | −35,5 | 34,5 km | NO |
| Hamburg | +0,1 | −33,0 | 31,9 km | NO |
| Bremen | +1,5 | −30,6 | 29,6 km | NO |
| Hannover | +0,4 | −29,8 | 28,7 km | NO |
| Stuttgart | +1,2 | −25,9 | 24,4 km | NO |
| München | −1,9 | −25,3 | 23,7 km | NW |
| Berlin | −4,3 | −23,5 | 23,0 km | NW |
| Dresden | −5,4 | −19,0 | 18,9 km | NW |
| Görlitz | −7,0 | −12,4 | 13,5 km | NW |

Max 36,0 km · Median 23,8 km · Mittel 24,5 km. Der Fehler ist **systematisch nach Norden**
(Δ Zeile immer negativ) und wächst zur Nordkante — also genau dort am größten, wo die
Bilinear-Näherung am weitesten von der PS-Krümmung abweicht.
Skript: `audit/radar-punktverortung/geo-offset.mjs` (Node `--experimental-strip-types`, importiert das echte
App-Modul `quadSampler.ts`).

## 4. Messung 2 — an echten Radardaten (RV-Lauf 2026-08-19 20:55 UTC)

Live im Browser (Dev :5199) gegen `fetchRvNowcast()`, Frame lead 0, Wert der Karten-Zelle
(exakt) gegen `sampleRadarQuad` (Slider):

**700 deutsche Städte ≥ 20 000 Einwohner: bei 21,7 % widerspricht der Slider der Karte**
in der Ja/Nein-Aussage „regnet es hier gerade“ (Nassschwelle 0,06 mm/h).
Kontrollnetz 0,25° über DE (1 116 Punkte): 86,1 % Übereinstimmung; von 232 Punkten mit Regen
auf der Karte meldet der Slider bei **70 (30 %) „trocken“**.

| Ort | Karte | Slider |
|---|---:|---:|
| Limburg a. d. Lahn | 2,67 mm/h | **0,00** |
| Rathenow | 2,27 mm/h | **0,00** |
| Achim | 1,10 mm/h | **0,00** |
| Goslar | 0,63 mm/h | **0,00** |
| Freiberg | 0,00 mm/h | **20,00** |
| Frankenthal | 0,00 mm/h | **17,25** |
| Chemnitz | 0,00 mm/h | **2,51** |
| Sonneberg | 20,00 mm/h | 1,88 (0,09×) |
| Kulmbach | 1,57 mm/h | 17,88 (11,4×) |
| Frankfurt a. M. | 5,41 mm/h | 3,45 |

Der Fehler betrifft **alle 25 Frames**, nicht nur „jetzt“ — Beispiel Rathenow über die
Nowcast-Kette: lead 0 Karte 2,27 / Slider 0,00 · lead 15 1,57 / 0,00 · lead 60 2,51 / 0,00.

## 5. Sichtprüfung in der UI (Beleg)

`audit/radar-punktverortung/rathenow-karte-nass-slider-trocken.png` (Desktop 1440×900,
Standort Rathenow, RV 22:55 lokal): der Standort-Pin steht mitten im blau eingefärbten
Regengebiet, das Slider-Profil unten liegt bei „JETZT“ auf null, und der Schnellblick rechts
sagt **„In 30 Minuten Regen. Beginnt ~23:31“**. Genau das gemeldete Symptom.

## 6. Betroffene Stellen (alle über denselben Sampler)

| Datei:Zeile | Was der Nutzer davon sieht |
|---|---|
| `src/radar/PointStrip.tsx:40` (`frameIntensities`) | **das Intensitätsprofil in der Zeitleiste — der gemeldete Fall** |
| `src/radar/PointStrip.tsx:30` (`stripSamples`) | Punkt-Streifen „Regen beginnt in X min“ |
| `src/pointForecast/radarNowcast.ts:103/135/150` | `buildNowcast` ⇒ Schnellblick, Ereignisse, Kennzahlen 6 h, `NowcastRainSlider`, `NowcastTimeline`, Alerts |
| `src/radar/pointPoP.ts:54` | Ensemble-Regenwahrscheinlichkeit am Punkt |
| `src/radar/RadarMap.tsx:130` | Klick-Punktabfrage **auf der Karte selbst** (man klickt auf den Regenfleck, bekommt den Wert 24 km daneben) |
| `src/sources/iconD2Cape.ts:41` | **nicht betroffen** — ICON-D2 ist `regular-lat-lon`, dort ist die Bilinear-Inverse exakt |

Nicht betroffen: die Wetterkarte (`MapView`), deren Niederschlags-Kompositor bereits exakt
rechnet (`precipIndexMap.ts`, `ps=true`).

## 7. AT und CH

| Land | Gitter | Befund |
|---|---|---|
| AT | GeoSphere INCA, Lambert EPSG:31287, 701×431 | Sampler liest **4,9–10,6 km** daneben (gegen die echten Zell-`lat`/`lon` aus dem NetCDF gemessen: Wien 4,9 · Graz 7,5 · Innsbruck 9,8 · Klagenfurt 9,9 · Salzburg 10,6 km). Die Karte hat hier **kein** Warp-Mesh und liegt ihrerseits 3,2–3,9 km neben dem Sampler (Mercator-lineares Quad gegen lat/lon-lineare Inverse). |
| CH | MeteoSchweiz rzc, Swiss-LV95, 710×640 | Karte und Sampler liegen **7,3–8,4 km** auseinander (Zürich 7,7 · Bern 8,2 · Genf 8,4 km). Absolute Verortung nicht geprüft — das ODIM-Produkt liefert nur die 4 Ecken, für den Wahrheitswert bräuchte es eine somerc-Inverse. |

Die INCA-Antwort enthält `lat`/`lon` **je Zelle** (701×431 float32); `geosphereIncaGrid.ts:69-71`
liest sie bereits, verwendet aber nur die 4 Ecken.

## 8. Fix-Plan (DE umgesetzt in RP1, s. §10; AT/CH offen)

1. **DE (der große Fehler) — ERLEDIGT (RP1):** `sampleRadarQuad` ein `ps`-Flag geben und für RADOLAN vor der
   inversen Bilinear-Interpolation `psFwd` anwenden — exakt das Muster, das
   `precipIndexMap.ts:41-53` schon fährt. Ecken **und** Punkt in PS umrechnen, dann ist das
   Gitter dort achsparallel und die Inverse exakt. Aufrufer: `PointStrip`, `pointPoP`,
   `radarNowcast` (DE-Zweig), `RadarMap`.
2. **AT:** die vorhandenen Zell-`lat`/`lon` aus dem NetCDF durchreichen und für die Punktabfrage
   eine Nächster-Nachbar-/bilineare Suche darauf fahren (kein neuer Fetch, nur nicht wegwerfen);
   alternativ Lambert-Inverse. Bringt zusätzlich die Karte in Reichweite eines Warp-Mesh.
3. **CH:** somerc-Inverse oder Warp-Mesh analog DE; kleinster Hebel, aber 8 km sind bei 1-km-Radar
   und Schauern nicht nichts.
4. **Verifier — ERLEDIGT:** `scripts/verify-radar-sampling.mjs` — Sampler gegen exakte Projektion an
   festen Stützpunkten, Toleranz < 1 Zelle; plus Regressionsanker, dass Karte und Punktabfrage
   für dieselbe (lat, lon) dieselbe Zelle treffen.
5. **Kommentarkopf `quadSampler.ts:6-12` korrigiert (ERLEDIGT)** — die Aussage „deutlich unter einem Pixel“
   gilt nur für achsparallele lat/lon-Gitter und hat den Fehler drei Phasen lang gedeckt.

## 9. Lehre

Ein Projektionsfehler, den das Rendering korrekt behandelt, kann in der Punktabfrage desselben
Feldes trotzdem stehen — beide Wege müssen **denselben** Verortungscode benutzen, sonst
beschreiben Karte und Text verschiedene Orte. Und: ein Genauigkeits-Kommentar („Sub-Pixel“) ist
eine Behauptung, bis sie an der Zielgröße gemessen wurde; hier stand die Widerlegung
(„bis ~40 km Versatz“) zwei Dateien weiter im selben Repo.

## 10. Gate GRP1 — DE repariert (2026-08-19)

**Umsetzung.** Fünf Dateien geändert, zwei neu:

| Datei | Änderung |
|---|---|
| `src/sources/radolanGeo.ts` | **neu** — Gitter-Geometrie (`DE1200_CORNERS`, `psFwd`/`psInv`, `de1200WarpMesh`) als reines Modul ohne DOM/Worker/Netz, damit Rendering, Komposit, Punktabfrage **und** der Verifier dieselben Formeln benutzen |
| `src/sources/radolan.ts` | Geometrie herausgelöst, re-exportiert (`export { … } from './radolanGeo'`) — alle bestehenden Importpfade bleiben gültig |
| `src/pointForecast/quadSampler.ts` | optionaler Parameter `project?: ProjectXY`: Ecken **und** Punkt werden projiziert, die Newton-Iteration läuft im projizierten Raum. Ohne `project` bit-identisch zu vorher (Toleranz bleibt `1e-7` in Grad; mit Projektion `1e-3` m) |
| `src/pointForecast/radarSample.ts` | **neu** — Fassade `sampleRadarPoint(source, …)` + `projectionFor(source)`: die EINE Stelle, die weiß, welches Landesgitter in welchem Raum regulär ist. Kein Aufrufer kann die Projektion mehr vergessen |
| `src/radar/PointStrip.tsx` · `src/radar/pointPoP.ts` · `src/radar/RadarMap.tsx` · `src/pointForecast/radarNowcast.ts` | rufen die Fassade statt `sampleRadarQuad` |
| `src/sources/iconD2Cape.ts` | unverändert, nur Kommentar: `regular-lat-lon` braucht keine Projektion |
| `src/scalar/precipIndexMap.ts` | importiert `psFwd` jetzt aus `radolanGeo` (schlankerer Worker-Bundle, gleiches Verhalten) |

**Belege.**

1. **Verifier** `npm run verify:radar-sampling` — **ALLE 12 CHECKS PASS**: Abtastzelle = exakte Zelle
   (20 Orte, max 0,00 Zellen Abweichung, Ortsversatz ≤ 0,66 km = halbe Zelldiagonale); Deckung mit den
   961 inneren Warp-Mesh-Knoten der Karte auf **0,23 m**; Regressionsanker „ohne Projektion 13,4–36,1 km“;
   `regular-lat-lon`-Pfad unverändert exakt; außerhalb des Gitters weiterhin `null`.
2. **Echte Daten, RV-Lauf 21:25 UTC** (Dev :5199, 700 DE-Städte ≥ 20 000 EW): Punktabfrage und Karte sind
   **700/700 wertgleich** (max. Abweichung 0,00 mm/h). Widersprüche „nass/trocken“ **114 → 0**.
   Beispiele vorher → jetzt: Wiesbaden 0,00 → **3,22** (Karte 3,22) · Frankfurt 2,90 → **8,08** (8,08) ·
   Dresden 2,98 → **7,22** (7,22) · Mainz 0,16 → **1,57** (1,57).
3. **Sichtprüfung** `audit/radar-punktverortung/nach-fix-wiesbaden.png` (Desktop 1440×900, Wiesbaden):
   Pin im Regengebiet, Schnellblick sagt **„Es regnet gerade.“** — der Ort, der vor dem Fix „trocken“ meldete.
   Vergleichsbild vorher: `rathenow-karte-nass-slider-trocken.png`.
4. `npm run typecheck` grün · `npm run build` grün · **alle 47 lauffähigen Verifier Exit 0**
   (`verify:aec` Exit 2 = „kann nicht laufen“, Golddaten liegen nicht im Repo — unverändert).
5. **Budget**: totalJs 916,9 / 926,1 KB · eagerJs 124,1 / 130,2 KB · largestChunk 278,4 / 292,3 KB — eingehalten.

**Die fünf Selbstverifikations-Fragen.**

1. *Funktionserhalt?* Ja — keine Funktion entfernt oder versteckt. Alle Aufrufer behalten Signatur und
   Verhalten; `sampleRadarQuad` bleibt exportiert und ohne `project` bit-identisch (Beleg: Verifier-Check
   „reguläres lat/lon-Quad bleibt exakt“, AT/CH-Pfade unverändert, `projectionFor` gibt dort `null`).
2. *Desktop pixelgleich?* Ja — keine Zeile CSS/Layout berührt; geändert haben sich ausschließlich die
   **Zahlenwerte** der Punktabfrage, und zwar absichtlich (das ist der Fix).
3. *Touch-Targets ≥ 44 px?* Unberührt — keine UI-Elemente geändert.
4. *Konsole sauber?* Ja — einziger Eintrag ist ein vorbestehender 404 auf einen
   `tiles.openfreemap.org`-Font, nicht aus diesem Pfad.
5. *Keine Long Tasks > 200 ms?* Ja — gemessen (bester von 3 Läufen, 5 000 Samples): 1,80 µs → 2,48 µs je
   Sample. Ein `frameIntensities`-Aufruf über den ganzen Frame-Stack kostet **0,062 ms**; die Projektion
   sind 5 zusätzliche `psFwd` je Sample.

**Damals offen, inzwischen erledigt:** AT und CH — s. §11.

## 11. Gate GRP2 — AT und CH repariert (2026-08-20)

Jans Auftrag nach GRP1: „fixe jetzt auch AT und CH“. Beide Gitter sind projiziert, keines ist in lon/lat
regulär — und anders als bei DE war hier **auch die Karte** falsch verortet (kein Warp-Mesh).

### 11.1 Erst gemessen, dann gebaut

Keine Projektion wurde angenommen; beide sind am Datenfeld belegt:

| | Kandidat | Beleg |
|---|---|---|
| **CH** | LV95/`somerc`, Bessel, `towgs84=674.374,15.056,405.346` | Die Quelle nennt sie selbst: ODIM-Attribut `/where.projdef` des rzc-Produkts. Gegenprobe: die vier gelieferten WGS84-Ecken landen auf **2 255 000 / 2 965 000 East** und **840 000 / 1 480 000 North** — volle Kilometer, achsparallel auf **< 1 m**, Spannweite 709 997 × 640 006 m gegen `xsize·xscale = 710 000` und `ysize·yscale = 640 000`. Zusatzprobe: der Projektionsursprung landet auf 2 600 072 / 1 200 147 — dem LV95-Nullpunkt Bern |
| **AT** | Lambert (EPSG:31287-Geometrie: lat_1 46, lat_2 49, lat_0 47,5, lon_0 13⅓, x_0 = y_0 = 400 000) **auf WGS84** | Das INCA-NetCDF liefert `lat`/`lon` je Zelle. Projiziert man die Eckzellen damit, wird das Gitter achsparallel mit **999,99 m × 1000,00 m** Zellgröße (Restschiefe der Kanten ≤ 26 m = 2,6 % einer Zelle). Auf Bessel gerechnet wären es 999,87 m — die Felder kommen also bereits datumsbereinigt, deshalb WGS84 |

### 11.2 Umsetzung

| Datei | Änderung |
|---|---|
| `src/sources/meteoSwissGeo.ts` | **neu** — `rzcFwd`/`rzcInv` (somerc inkl. 3-Parameter-Datumsübergang WGS84 ↔ Bessel) + `rzcWarpMesh` |
| `src/sources/geosphereIncaGeo.ts` | **neu** — `incaFwd`/`incaInv` (Lambert) + `incaWarpMesh` + `cellCentersToEdges` |
| `src/sources/geosphereIncaGrid.ts` | gibt die Ecken jetzt als **Außenkanten** aus (aus den Zellmitten des NetCDF gerechnet) — damit gilt im ganzen Repo EINE Eck-Konvention |
| `src/pointForecast/quadSampler.ts` | zusätzlich zur Projektion ein `anchor`-Modus (`'center'` = Zellmitten, `'edge'` = Außenkanten); Bbox-Vorfilter mit 1e-6-Toleranz, weil Punkte exakt auf der Gitterkante sonst je nach Rundung `null` lieferten |
| `src/pointForecast/radarSample.ts` | Fassade kennt jetzt Projektion **und** Anker je Quelle (`projectionFor`, `anchorFor`) |
| `src/radar/radarFrames.ts` | AT- und CH-Stack tragen `warpLnglat`/`warpN` — der RainLayer zeichnet beide Raster projektionskorrekt statt über 4 Ecken |
| `src/scalar/precipIndexMap.ts` · `precipIndexWorker.ts` · `precipComposite.ts` | `ps: boolean` → `GridKind` (`'radolan' | 'inca' | 'rzc' | 'lonlat'`): auch das DACH-Komposit der **Wetterkarte** verortet INCA und rzc jetzt in ihrem Gitterraum |

### 11.3 Belege

1. **Verifier** `npm run verify:radar-sampling` — **ALLE 25 CHECKS PASS** (12 → 25). Neu u. a.: AT-Gitter
   regulär mit 999,99 × 1000,00 m; `cellCentersToEdges` liefert n·Zellgröße statt (n−1); CH-Ecken
   achsparallel < 5 m; CH-Spannweite = `xsize·xscale`; LV95-Nullpunkt Bern; beide Inversen als exakte
   Umkehrung (AT 8e-10 m, CH 1,3 mm); Punktabfrage trifft die Zellmitte inkl. Rändern (7/7 je Land);
   **Karte ↔ Punktabfrage decken sich über 256 Mesh-Maschen auf < 1/10 Zelle** (AT 40 m, CH 42 m) und
   treffen abseits der Zellgrenzen dieselbe Zelle (AT 169/169, CH 192/192).
2. **Geometrie an echten Ortslisten** (`audit/radar-punktverortung/versatz-atch.mjs`, netzfrei):

   | | vorher (4-Eck in lon/lat) | jetzt (im Gitterraum) |
   |---|---|---|
   | AT, 51 Orte ≥ 10 000 EW | Median **6,71 km** daneben, max 10,95 km (Saalfelden) | Median **0,38 km**, max 0,62 km |
   | CH, 133 Orte ≥ 10 000 EW | Median **10,28 km** daneben, max 11,11 km (Pratteln) | Median **0,38 km**, max 0,66 km |

   0,38 km ist der Abstand zur Zellmitte bei 1-km-Zellen — also die Zelle selbst.
3. **Echte Daten im Browser** (INCA-Lauf + rzc-Snapshot, Dev :5199): Punktabfrage und Karte sind
   **AT 51/51** und **CH 133/133 wertgleich** (max. Abweichung 0,00 mm/h). Beispiele, an denen der alte Weg
   falsch lag: Bellinzona **5,18 → 0,00** mm/h (Karte 0,00 — der alte Weg zeigte Regen, der woanders fiel),
   Buchs 0,00 → **0,39** (Karte 0,39), Bludenz 0,00 → **0,31** (Karte 0,31). Die Zahl der geänderten Orte
   ist hier klein, weil in AT/CH gerade kaum Niederschlag fällt — die Größe des Fehlers steht in (2), sie
   ist lageunabhängig.
4. **Sichtprüfung** `audit/radar-punktverortung/nach-fix-zuerich-ch.png` (Desktop, Zürich): das rzc-Raster
   rendert mit dem neuen Warp-Mesh sauber (Regengebiet Richtung Luzern, keine Verzerrung, keine Spiegelung),
   Karte und Schnellblick („Trocken.“) stimmen überein.
5. `npm run typecheck` grün · `npm run build` grün · Budget **totalJs 918,2 / 926,1 KB**,
   eagerJs 124,1 / 130,2 KB, largestChunk 278,4 / 292,3 KB.
6. **Verifier-Suite:** alle lauffähigen Verifier Exit 0, mit zwei Ausnahmen, die nicht an dieser Phase
   hängen: `verify:aec` Exit 2 („kann nicht laufen“, Golddaten nicht im Repo) und `verify:fire-registry`,
   dessen 150-ms-Perf-Anker unter Suitenlast reißt (181 ms) — einzeln gemessen 81/92/95 ms, und der
   Registry-Code importiert keines der hier geänderten Module (geprüft).

### 11.4 Die fünf Selbstverifikations-Fragen

1. *Funktionserhalt?* Ja — nichts entfernt. `sampleRadarQuad` bleibt exportiert und ohne `project`/`anchor`
   bit-identisch (ICON-D2-Pfad unverändert, Verifier-Check). Neu sind nur Genauigkeit und zwei Geo-Module.
2. *Desktop pixelgleich?* Nein — und das ist der Auftrag: das AT- und CH-Raster wird jetzt an der richtigen
   Stelle gezeichnet (vorher bis 11 km versetzt). Layout/CSS unberührt.
3. *Touch-Targets ≥ 44 px?* Unberührt — keine UI-Elemente geändert.
4. *Konsole sauber?* Ja — einziger Eintrag ist der vorbestehende 404 auf einen `tiles.openfreemap.org`-Font.
5. *Keine Long Tasks > 200 ms?* Die Meshes sind 17×17 Knoten (AT/CH) und werden einmal je Laden gebaut;
   die Punktabfrage kostet weiterhin ~2,5 µs je Sample (RP1-Messung, dieselbe Codebahn). Der teure Pfad
   (`buildIndexMap`, 307 200 Zellen je Quelle) läuft unverändert im Worker.

### 11.5 Nebenbefund (nicht behoben, anderes Thema)

`src/nowcast/NowcastDeck.tsx:259` schreibt die Datenlage als **festen Text** „0–2 h · DWD RADOLAN-RV“ —
auch für Zürich und Wien, wo MeteoSchweiz rzc bzw. GeoSphere INCA die Quelle ist (im Screenshot aus (4)
sichtbar). Das ist vorbestehend und eine Falschauskunft über die Quelle; Zeile 402 und 670 derselben Datei
haben dasselbe Muster. Ein Einzeiler je Stelle (Quelle aus `stack.sourceLabel`), aber eigener Auftrag.

### 11.6 Lehre

Eine Projektion muss man nicht raten: **CH lieferte sie im Produkt mit** (`/where.projdef`), **AT lieferte
die Zellkoordinaten**, an denen sich jeder Kandidat prüfen lässt — beides stand die ganze Zeit in den
Daten, die die App ohnehin lädt. Und die zweite Hälfte des Fehlers steckte nicht in der Projektion, sondern
in der Frage, **was die vier Ecken bezeichnen**: Zellmitten oder Außenkanten. Das ist eine halbe Zelle, und
solange zwei Stellen es verschieden beantworten, sind Karte und Text auch mit perfekter Projektion nicht
deckungsgleich.
