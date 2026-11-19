# Phase AM — „Ausfahrt planen“ in drei Modi (Etappe · Vor Ort · Strand) auf `/seewetter`

> Stand 19.11.2026. Auftrag (Jan 19.11.): der Planer der Phase SP wird einer von drei Modi. Das Profil setzt den Modus
> beim Öffnen, der Umschalter „Art der Ausfahrt“ ändert ihn jederzeit. Vorlage: `reference/README-seewetter-ausfahrt.md`
> mit vier Entwürfen (Werte darin erfunden). Kein Schalter (Jans Entscheidung, Ausnahme von Rule 2).

## 1. Diagnose (19.11., vor dem Code)

### 1.1 Was es gibt (gelesen an `2d2ff778`)

| Baustein | Ort | Für diese Phase |
|---|---|---|
| Planer „Vor Ort“ | `seaPlanner.ts`, `SeaPlanPanel.tsx`, Blöcke „Phase SP“ in `SeaPage.tsx`, `SeaMap.tsx`, `SeaBand.tsx` | bleibt wie gebaut; bekommt nur den Umschalter im Kopf |
| Geometrie, Wind zum Kurs | `seaPlanner.ts` `planDistKm`, `planBearingDeg`, `planDestination`, `angleDiff`, `relativeWind` (30/75/105/150°) | Kurs je Teilstück, Wind und Welle zum Kurs |
| Uferwinkel | `seaProfiles.ts` `shoreAngle`, `seaPlanner.ts` `driftSideOf` (von See / längs / vom Land) | Strand: Reihenfolge, Farbe der Spot-Marke |
| Wellenfeld | `seaClient.ts` `loadField` (630 × 387, stündlich bis +48 h, dann dreistündlich), `seaView.ts` `sampleField` (nächste Zelle; `undefined` = Land/außerhalb, `null` = Wasser ohne Wert) | Welle je Stunde am Ort der Etappe |
| Strömung | `seaClient.ts` `loadCurrentUv`, `seaCurrent.ts` `currentUvXY`/`currentUvHour`, `seaRipples.ts` `sampleUv` (bilinear über Wasserpunkte), `windAgainstCurrent` (120° / 10 kn / 0,5 kn) | Strom je Stunde, „Wind gegen Strom“ |
| Hinweis Schauer/Gewitter | `seaSight.ts` `sightConvAt` (je Spot und Stunde) | vom nächsten Katalog-Spot |
| Seegebiete | `seaClient.ts` `loadAreas` (18 Flächen: 10 Seegebiete, 8 Küstenabschnitte), Texte `WODL45` / `FQDL50` (`seaText.ts`) | Treffertest der Etappe, amtliche Texte im Wortlaut |
| Sonne | `src/photo/sun.ts` `sunAltitudeDeg`, `seaPlanner.ts` `sunAround` | Ankunft gegen Sonnenuntergang, hell / Dämmerung / dunkel |
| Wasserstand | `waterLevelClient.ts` `loadGaugeForecast`, `waterLevel.ts` `wlAt`, `wlNearestWithCurve`; dänische Spots `dmiDoc.wl.spots` | Ankunft (nur Katalog-Spot mit Quelle), Strand je Spot |
| buscosun Fusion am Punkt | `getPointForecast({ pointSource: 'cube' })` nach `import('../pointForecast/cubeSource')`; Register `FUSION_PARTS` | Wind und Böen an den Probenpunkten der Etappe |

### 1.2 Schritt 0 — gemessen

Werkzeug `scripts/sea/spike/trip-measure.mjs`, Ergebnis `audit/seewetter-ausfahrt/step0.json` (19.11. 00:40 UTC).
Etappe Laboe → Marstal zwischen den Wasserzellen der beiden Spots: 54,1 km = 29,2 sm, Kurs 22°.

**(a) buscosun Fusion an Wasserpunkten** — Cube-Pfad des Clients in Node, wie `sea-derive.mjs` (`country: 'DE'`,
`includeRadarNowcast: false`, `makeIo` + `httpStore`), zehn Punkte in gleichem Abstand (3,2 sm):

| Punkt | Wind / Böen +1 h (kn) | +6 h | +12 h | Abrufe | KB | ms |
|---|---|---|---|---|---|---|
| Laboe | 6,0 / 13,7 | 3,0 / 6,2 | 4,3 / 9,8 | 18 | 1 486 | 841 |
| 3 sm | 13,0 / 15,5 | 6,5 / 8,2 | 10,5 / 12,8 | 1 | 38 | 190 |
| 6 sm | 16,6 / 21,1 | 7,6 / 11,0 | 10,8 / 14,6 | 5 | 387 | 157 |
| 10 sm | 14,0 / 17,2 | 5,5 / 6,6 | 10,2 / 12,7 | 1 | 34 | 173 |
| 13 sm | 14,4 / 17,5 | 6,1 / 7,2 | 10,0 / 12,3 | 1 | 32 | 193 |
| 16 sm | 13,2 / 17,3 | 4,7 / 7,0 | 7,9 / 11,5 | 2 | 79 | 285 |
| 19 sm | 13,9 / 17,5 | 4,9 / 7,4 | 7,6 / 11,1 | 0 | 0 | 66 |
| 23 sm | 13,1 / 16,7 | 4,9 / 7,7 | 7,3 / 10,8 | 1 | 70 | 188 |
| 26 sm | 11,2 / 15,7 | 4,9 / 7,7 | 6,9 / 10,7 | 1 | 82 | 184 |
| Marstal | 11,3 / 15,9 | 5,0 / 7,8 | 6,8 / 10,7 | 3 | 183 | 643 |

- **Es geht.** Alle zehn Punkte liefern Wind und Böen für jede Stunde (Stand buscosun Fusion 14).
- **Kosten für alle zehn: 33 Abrufe, 2 391 KB, 2,9 s.** Der erste Punkt trägt 18 Abrufe / 1 486 KB (Index, Tabellen,
  Stationskatalog 361 KB, ein Cube-Chunk 351 KB), jeder weitere 0–5 Abrufe (im Mittel 1,7 / 103 KB): meist eine
  Höhenkachel (Terrarium, 32–97 KB), an einer Chunk-Grenze ein zweiter Chunk (348 KB). 13 der 33 Abrufe sind Höhenkacheln
  (773 KB) — über Wasser ohne Wirkung (Höhe 0), der Leser holt sie trotzdem.
- **Der Wind ändert sich entlang der Etappe um 1–4 kn je 3 sm** (ufernah Laboe → 3 sm: +7 kn). Ein Probenpunkt je Etappe
  wäre zu wenig, einer je Seemeile kostet nur Abrufe.
- **Nördlich von 55,5° N:** 55,45° und 55,50° N (10,85° O) liefern Werte, **ab 55,55° N liefert der Cube nichts** (0
  Stunden, kein Fehler, keine Ausnahme); ebenso an der Nordsee (7,90° O: 55,45° ja, 55,55° nein). Das Wellenfeld reicht
  bis 56,45° N. Eine Etappe nach Norden hat dort Welle und Strom, aber keinen Wind ⇒ „keine Daten“ für den Wind dieses
  Teils, nie der Wind eines Spots.
- **Befund zur Lage am Messtag (nicht Teil der Phase):** der t1-Cube steht seit 17.11. 15 UTC (V-SG-9). An Punkten ohne
  Station in der Nähe (ab 16 sm) fehlt die **Windrichtung ab +15 h** (Wind und Böen sind da). Die Etappe muss eine Stunde
  ohne Richtung tragen: „Richtung fehlt“, kein Wind zum Kurs (E-FR-5) ⇒ V-AM-1.

**(b) `sampleField` und `sampleUv` an denselben Punkten und Stunden**

- CWAM (Lauf 2026111812, Stunden +1/+3/+6/+12/+24): **50 von 50 Proben mit Wellenhöhe**, auch an den zwölf Punkten
  nördlich davon. Ein Feld 106–109 KB. Beispiel +3 h: 0,30 m (Laboe) · 0,55 m (13 sm) · 0,15 m (Marstal), Periode 1,6–3,4 s.
- Strömung: **im Datenspeicher liegt keine** (`status.current` fehlt, kein Ordner `sea/v1/current/`): der Schritt
  „Currents“ in `sea.yml` läuft erst, wenn die Commits der Phasen ST/SR auf `origin/main` von `buscosun-web` liegen (der
  Workflow prüft `scripts/sea/sea-current.mjs` und überspringt). Gemessen deshalb an den zwei echten u/v-Bildern des
  BSH-Laufs 2026111812 aus `scripts/lib/fixtures/sea/ripples/` (Stunden 6 und 9): **44 von 44 Proben mit Wert**, auf der
  Etappe 0,03–0,49 kn, im Großen Belt bis 1,19 kn. Ein Bild 35 KB.
  ⇒ Bis zu Jans Push steht in der Spalte „Strom“ überall „keine Daten“, und „Wind gegen Strom“ entfällt. Kein Ersatz.

**(c) Seegebiete der Etappe** — 109 Proben (alle 500 m) gegen die 18 Flächen: Westliche Ostsee (Seegebiet, 0–46,7 km) ·
Flensburg bis Fehmarn (Küstenabschnitt, 0–33,7 km) · Belte und Sund (Seegebiet, 47,1–54,1 km). Keine Probe ohne Gebiet.
Warnstatus trägt WODL45 nur für Deutsche Bucht, Westliche Ostsee, Südliche Ostsee und die beiden deutschen Küsten;
„Belte und Sund“ hat **keinen** ⇒ dort „Kein amtlicher Warnstatus“ (Wortlaut der Seite an dänischen Spots).

**Zahl der Probenpunkte (aus diesen Zahlen):** je Teilstück Anfang, Ende und dazwischen so viele Punkte, dass keiner
weiter als **5 km** (2,7 sm) vom nächsten liegt (`SEA_TRIP_SAMPLE_KM`, `set`: zwei Gitterweiten des Kurzfristmodells,
derselbe Wert wie der Radius des Planers Vor Ort); höchstens **24** je Etappe (`SEA_TRIP_MAX_SAMPLES`, `set`), darüber
wächst der Abstand und die Seite sagt es. Laboe → Marstal: 12 Punkte, hochgerechnet ≈ 36 Abrufe / 2,6 MB / 3,5 s beim
ersten Mal (eine Hochrechnung, keine Messung — V-AM-2). Je Teilstück geteilt, damit beim Ziehen eines Wegpunkts nur die
zwei angrenzenden Teilstücke neu rechnen.

### 1.3 Was fehlt

(a) Rechnung der Etappe: Ort je Stunde, Ankunft, Kurs je Teilstück, Werte am Ort, Befunde, Abfahrtsvergleich,
Gebietstest. (b) Strand: Reihenfolge nach Stunden mit Wind von See, Dämmerungsklassen. (c) Eingabe auf der Karte
(Punkte setzen, ziehen, löschen), Route und Boot. (d) Tabelle, Karten, Befunde, amtlicher Block. (e) Umschalter und
Link für drei Modi.

### 1.4 Was nicht angefasst wird

Motor, Tabellen und Stände von buscosun Fusion (`src/pointForecast/fusion/**` außer EINER Zeile in `FUSION_PARTS`),
Edge Functions, Shader/WebGL-Pipeline, Abhängigkeiten, Producer und Workflows. **Daten-Repos: kein Bedarf, kein Push** —
alles kommt aus Dateien, die die Seite schon liest, und aus dem Cube.

### 1.5 Grenzen der Daten, die die Anzeige sagt

1. Nur Stundenwerte. Die Ankunft liegt selten auf einer vollen Stunde ⇒ ihre Werte sind die der **nächsten vollen
   Stunde**, und die Spalte sagt, welche.
2. Wind und Böen sind am **nächsten Probenpunkt** gerechnet (höchstens 2,5 km entfernt), nicht am Ort der Stunde.
3. Die Etappe ist eine gerade Linie zwischen den Punkten: kein Kurs, keine Navigationsgrundlage, keine Landprüfung.
4. Ankunft = Strecke / eingegebene Fahrt. Der Strom steht da, wird aber nie verrechnet.
5. Wind und Strom bleiben zwei Richtungen: keine gemeinsame Drift.
6. Welle: stündlich nur bis +48 h ab Modelllauf; danach schreibt das Feld nur jede dritte Stunde ⇒ dazwischen „keine Daten“.
7. Profil Motorboot kennt nur eine Grenze für die Windsee; das Stundenfeld trägt die Gesamtwelle ⇒ auf der Etappe wird
   für dieses Profil keine Wellengrenze geprüft, und die Seite sagt es (V-AM-4).
8. Strand: Wind und Welle gelten an der Wasserzelle des Spots (wie überall auf der Seite); nur die Windrichtung zum
   Ufer ordnet, nichts bewertet.

## 2. Entscheidungen (gesetzt, Jan kann sie drehen)

| Nr. | Frage | Entscheidung |
|---|---|---|
| E-AM-1 | Schalter | **keiner, an für alle (Jan 19.11.)** |
| E-AM-2 | Aufruf von buscosun Fusion | genau der gemessene: `getPointForecast({ pointSource: 'cube', country: 'DE', includeRadarNowcast: false })`, geschaltet über den neuen Teil `sea` in `FUSION_PARTS`. **Nicht** über `getFusionForecast`: der fällt bei einem Fehler auf den Live-Pfad zurück — das wäre ein Ersatz. Ohne Cube-Ergebnis (Fehler, `?pf=live`, außerhalb) steht „keine Daten“ |
| E-AM-3 | Probenpunkte | je Teilstück alle ≤ 5 km, höchstens 24 (§1.2) |
| E-AM-4 | Werte der Ankunft | nächste volle Stunde, in der Spalte genannt |
| E-AM-5 | Strom zum Kurs | mit ≤ 45°, gegen ≥ 135°, sonst quer (`set`); unter 0,2 kn nur die Zahl (`set`) |
| E-AM-6 | Welle zum Kurs | dieselben Grenzen wie der Wind (`REL_BORDERS`) |
| E-AM-7 | Schauer/Gewitter | Hinweis des nächsten Katalog-Spots bis **15 km** (`SEA_TRIP_CONV_KM`, `set`), mit Namen; sonst leer |
| E-AM-8 | Grenzen auf der Etappe | Wind über `windMax`, Böen über `gustMax`, Welle über `hsMax`. Eine Untergrenze („zu wenig Wind“) ist kein Hinweis „über deiner Grenze“ |
| E-AM-9 | Fahrt beim Öffnen | Yacht 5 kn, Motorboot 12 kn, sonst 4 kn (`set`); 0,5–40 kn |
| E-AM-10 | Punkt auf einem Spot | ein Klick auf einen Spot rastet ein: der Punkt liegt auf der Mitte seiner Wasserzelle (≤ 3 km vom Spot, laut Wellenmodell Wasser; dort rechnet auch der Producer den Wind des Spots) und trägt den Namen des Spots. Der Link trägt nur Lagen; beim Lesen bekommt ein Punkt auf einer Wasserzelle seinen Spot zurück |
| E-AM-11 | Strand-Fenster | heute 17–22 Uhr Ortszeit (`set`); nach 22 Uhr morgen. Dämmerung: Sonne zwischen −0,833° und −6° (bürgerliche Dämmerung) zur halben Stunde, wie `classify` |
| E-AM-12 | Link | `pl=` bleibt (Vor Ort). Neu `et=<Abfahrt>_<Fahrt × 10>_<Punkte>` (Punkt = `Breite×10⁴ x Länge×10⁴`, getrennt durch `.`) und `sd=<Start>_<Ende>`; Zeiten als volle UTC-Stunde wie in `pl`. Der Schlüssel nennt den Modus |
| E-AM-13 | Wasserstand am Strand | nur wo der Pegelkatalog im Umkreis von 20 km einen Pegel mit Kurve nennt; je Pegel ein Abruf, höchstens 12 Pegel je Liste |
| E-AM-14 | Layout am Desktop | Etappe: links die Eingabe (die Ebenen klappen darunter zu — umgruppiert), Mitte Karte mit Tabelle am Fuß, rechts Befunde. Strand: rechts die Liste, links bleibt der Ebenen-Dock |

## 3. Gestaltung (Skill `frontend-design`, im Command-Deck)

- **Farben:** Ink `#2C2A26`, Cream `#FAF6EA`, Sand `#EDE6D3`/`#E0D6BE`, Petrol `--sw-accent`, Rot `--sw-out` **nur** für
  „über deiner Grenze“. Strand: **kein neues Token** — die zwei Bedeutungsfarben des Planers Vor Ort (`--sw-pl-sea`
  hell-petrol = Wind von See, `--sw-pl-land` bernstein = Wind vom Land, `--sw-pl-along` hell = längs), auf hellem Grund
  als Schrift Petrol-dunkel bzw. `#9A5A2A`. Das Braun der Vorlage entfällt: dieselbe Aussage hätte sonst zwei Farben.
- **Schrift:** League Spartan aus `src/fonts.css`; Zahlen tabellarisch. Keine Versalien-Etiketten in den neuen Teilen
  (die Vorlage setzt Abschnittsnamen in normaler Schreibung, 15 px, Stein).
- **Das eine Bild:** der Strang der Etappe — auf der Karte dunkel, rot, gestrichelt; derselbe Strang liegt flach über
  den Spalten der Tabelle. Wer die Karte gelesen hat, kann die Tabelle lesen.
- **Aufbau Desktop (Etappe):**

  ```
  rail | Eingabe 300        | Karte + Route + Boot                 | Befunde 400
       | Profil · Art       |                                      | Laboe → Marstal
       | Start/Wegp./Ziel   |                                      | Abfahrt | Ankunft
       | Fahrt · Strecke    |--------------------------------------| Befunde
       | Abfahrt vergleichen| Entlang der Etappe (Strang + Tabelle)| Amtlich · Seegebiete
       | Deine Grenzen      |                                      | Fuß
  ```
- **Mobil (Etappe, kein Entwurf):** dasselbe Blatt wie Vor Ort; die Tabelle rollt seitwärts, erste Spalte steht.
- **Tablet 834 px:** kein dritter Breakpoint. Mit Maus gilt der Desktop-Aufbau, mit Finger das Blatt (V-AM-6).
- Bewegung: keine neue. Das Boot springt mit der gewählten Stunde.

## 4. Plan

1. `src/sea/seaTrip.ts` (rein): Modi, Route, Ort je Stunde, Probenpunkte, Zeilen, Befunde, Abfahrtsvergleich,
   Gebietstest, Strand-Reihenfolge, Dämmerung, Link, Wortlaute.
2. `src/sea/seaTripData.ts`: Wind an den Probenpunkten (Cube), Wellen- und Stromproben je Stunde.
3. `fusionRelease.ts`: Teil `sea`. `seaState.ts`: `et`, `sd`. `SeaMap.tsx`: Route, Punkte, Boot, Uferfarbe.
4. `SeaTripPanels.tsx` (Eingabe, Tabelle, Befunde, Strand), `SeaPlanPanel.tsx` (Umschalter), `SeaPage.tsx`, `seaDeck.css`.
5. Gate: `verify:sea-trip`, typecheck, build, budget, `verify:sea-*`, `verify:fusion-release`.

## 5. Umsetzung (19.11.)

| Teil | Datei | Was |
|---|---|---|
| Rechnung | `src/sea/seaTrip.ts` (rein, neu) | Modi (`defaultTripMode`), Route (`tripRoute`, `routePosAt`, `routeSlice`, `insertIndex`, `snapToSpot`), Ort je Stunde und Ankunft (`tripTimeline`), Probenpunkte (`tripSamples`, `nearestSample`), Zeilen (`tripRows`: Wind/Welle/Strom zum Kurs, „Wind gegen Strom“, Grenzen, Status), Strang (`tripPieces`), Befunde (`tripFindings`), Abfahrtsvergleich (`tripCompare`), Gebietstest und amtliche Texte (`tripAreas`, `pointInArea`, `tripOfficial`), Strand (`strandRows`, `strandDefaultWindow`, `strandHours`, `duskOf`), Link (`et`, `sd`), alle Wortlaute |
| Daten | `src/sea/seaTripData.ts` (neu) | `loadTripWind` (buscosun Fusion am Probenpunkt: Cube-Pfad, `country: 'DE'`, ohne Radar, hinter `fusionPathFor('sea')`, einer nach dem anderen, 10 min gemerkt; ohne Ergebnis „keine Daten“ mit Grund), `windSeriesOfSteps` (Kodierung der Spot-Reihe), `tripFieldStep` / `loadTripHour` (nur das Feld genau dieser Stunde), `waveAt`, `currentAt`, `convAt`, `tripDataOf` |
| Hook | `src/sea/useSeaTrip.ts` (neu) | lädt Wind je Probenpunkt, Felder je Stunde der Etappe und der zwei Vergleichs-Abfahrten, Wasserstand am Ziel; `useStrandLevels` |
| Register | `src/pointForecast/fusion/fusionRelease.ts` | EINE Zeile: Teil `sea` („Seewetter · Etappe“), an. Motor, Tabellen, Stände unberührt |
| Adresse | `src/sea/seaState.ts` | Schlüssel `et`, `sd` nach `pl`; ohne Planer bleibt die Adresse wie zuvor |
| Karte | `src/sea/SeaMap.tsx` | Prop `trip`: Quelle `sw-trip` mit vier Linien-Ebenen (helle Unterlage, dunkel, rot, gestrichelt), Punkte als ziehbare `maplibregl.Marker` (Entf löscht), Boot als Marker, Klick setzt einen Punkt (auf einem Spot rastet er ein). Prop `shore`: Spot-Marke in der Farbe der Windseite. Keine eigene GL-Ebene |
| Anzeige | `src/sea/SeaTripPanels.tsx` (neu, eigener Lazy-Chunk), `SeaTripSwitch.tsx` (neu) | `EtappeInput`, `EtappeTable`, `EtappeResult`, `StrandPanel`; Umschalter „Art der Ausfahrt“ |
| Vor Ort | `src/sea/SeaPlanPanel.tsx` | nur der Umschalter unter dem Kopf (`onMode`); ohne ihn Markup wie zuvor (`verify:sea-trip` J8, `verify:sea-planner` 46/46) |
| Seite | `src/sea/SeaPage.tsx` | Zustand `etappe` / `strand`, `setTripMode`, `openPlanner` (Profil ⇒ Modus), Link, Layout: Etappe links Eingabe (Ebenen klappen darunter), Tabelle am Kartenfuß, rechts Befunde; Strand rechts die Liste; mobil das Blatt des Planers für alle drei Modi; die Legende nennt im Strand die Windseite |
| Stil | `src/sea/seaDeck.css` | `sw-am-*`; mobil in der bestehenden Media Query des Planers; ein Zusatz `@media (max-width: 1439px)` für die Breite der Eingabe |
| Prüfer | `scripts/verify-sea-trip.mjs`, `package.json`, `scripts/verify-fusion-release.mjs` (eine Zeile: der Teil `sea` hängt am Register) | `verify:sea-trip` |
| Werkzeuge, Fixtures | `scripts/sea/spike/trip-measure.mjs`, `trip-record-fixtures.mjs`, `scripts/lib/fixtures/sea/trip/` | Schritt 0; echte Reihen und Bilder für den Prüfer |

**Abweichungen von der Vorlage, mit Grund.** (1) „Wind gegen Strom“ steht in der Vorlage rot und zählt dort als Hinweis
über der Grenze — hier ist es ein fetter Hinweis, nicht rot, nicht gezählt: Rot heißt nur „über deiner Grenze“ (README).
(2) Die Stundenleiste im Strand zeigt je Stunde „n von m Stränden mit Wind von See“ statt einer Windstärke: eine Liste
über ein ganzes Revier hat keinen einen Wind. (3) Windpfeile und Strompfeil entlang der Route sind nicht gebaut (V-AM-9).
(4) Fünf Chips „Wer fährt?“ der Vorlage = die sieben Profile der Seite. (5) Kein Braun für „vom Land“ (§3).

**Daten-Repos:** kein Commit, kein Push nach `buscosun-data` oder `buscosun-archiv` in dieser Phase.

## 6. Gate (19.11.)

| Prüfung | Ergebnis |
|---|---|
| `verify:sea-trip` (neu, netzfrei, ohne Browser) | **55/55** — A echte Reihen von buscosun Fusion 14 an 13 Probenpunkten (377 Stunden ohne Windrichtung darin), zwei CWAM-Bilder, zwei u/v-Bilder; Leser gegen eine zweite Regel · B Ort je Stunde, Ankunft · C Kurs über Nord (350° → 10°), Klassen · D Proben gegen die echten Bilder, Land, fehlende Stunde · E Zeilen, Status, Strang, Befunde, „Richtung fehlt“, außerhalb des Cubes · F Abfahrtsvergleich · G Gebietstest wie Schritt 0, amtliche Texte Zeichen für Zeichen an zwei echten WODL45 · H Strand auf der echten Spot-Datei, Dämmerung, Fenster · I Link aller drei Modi und ein alter `pl=`-Link · J Wortlaut auf 63 Texten, Markup, Verdrahtung, CSS |
| Im ersten Lauf rot, behoben | 8 von 54: sieben Erwartungen von mir, die an den echten Daten falsch waren (Wellenhöhe 0,05 m vor Marstal; die Startstunde in Laboe trägt keine Windrichtung; das Fenster gilt noch in seiner letzten Stunde; ein Satz, der „Drift“ verneint, traf mein Verbotsmuster; drei Zählmuster) und **ein Fehler im Code**: drei Klassen ohne Regel im Stylesheet |
| Mutationen | **12 von 12 bemerkt** (Ankunft abgerundet; Strom in die Ankunft gerechnet; mit/gegen vertauscht; falscher Probenpunkt; Strand-Reihenfolge vertauscht; amtlicher Text verändert; Dämmerung bis −12°; Grenze in m/s; Land als ruhige See; Nachbarstunde statt „keine Daten“ — beim ersten Mal NICHT bemerkt, deshalb `tripFieldStep` + D4; Aufruf mit Radar; Link auf drei Stellen) |
| `verify:sea-planner` | 46/46 (Vor Ort unverändert; H5/H10 an den Einstiegen und an der letzten Media Query hängen weiter) |
| `verify:sea-wind-band` · `-contract` · `-current` · `-ripples` · `-sight` · `-tide-window` · `-waterlevel` · `-watertemp` · `-dk` · `-seo` · `-text` · `-decode` | 41/41 · 30/30 · 108/108 · 111/111 · 76/76 · 49/49 · 63/63 · 136/136 · 70/70 · 23/23 · 35/35 · 13/13 |
| `verify:fusion-release` · `verify:tour-result` | 33/33 (12 Plattformteile am Register, darunter „Seewetter · Etappe“) · 51/51 |
| `verify:sea-ui` · `verify:sea-derive` | **nicht gelaufen** (`sea-ui` ist ein Browser-Prüfer und an HEAD rot — V-TF-5; `sea-derive` baut Läufe, 400–1 200 s, von dieser Phase nicht berührt) |
| `npm run typecheck` | grün |
| `npm run build` | grün (281/281 Shell-Prüfungen) |
| `npm run budget` | grün im Arbeitsbaum: eagerJs 114,9 / 115 · eagerCss 2,4 / 2,5 · largestChunk 278,4 / 302 · totalJs 2 043,5 / 2 044. **Anteil der Phase isoliert gemessen** (`git archive` von HEAD in einen eigenen Ordner, einmal unverändert, einmal mit den elf Dateien): 2 018,6 → 2 038,6 KB = **+20,0 KB gzip** (mit dem Stand des Commits gemessen, dort auch `tsc` grün ohne die fremde Linie; vor den Korrekturen aus der Browser-Prüfung 2 038,5), eagerJs 114,6 → 114,7. Grenze von Hand 2 019 → 2 039 (Commit) bzw. 2 024 → 2 044 (Arbeitsbaum, der zugleich die fremde Linie RN trägt) |

**Im Browser gesehen** (Vorschau des Builds, Chromium über Playwright, Live-Daten vom 19.11. 02:20 MEZ; Belege in
`audit/seewetter-ausfahrt/`): `etappe-desktop-1440-final.png`, `strand-desktop-1440-final.png`, `etappe-mobil-390.png`,
`strand-mobil-390.png`. Dabei gefunden und behoben: (1) die Punkt-Marken lagen neben der Route (`position: relative` in
meiner Regel überschrieb die Lage von MapLibre); (2) der Start lag unter der Tabelle (Kartenrand 340 → 420 px); (3) ein
geteilter Link öffnete auf „jetzt“ statt auf der Abfahrt; (4) mobil blieb das Blatt bei einem `et=`-Link zu; (5) die
Legende nannte im Strand die Profil-Klassen, während die Marken die Windseite zeigen.
Durchgespielt: Planer öffnen mit Profil Yacht ⇒ Etappe; Start und Ziel per Klick; „Wegpunkt setzen“ ⇒ Klick auf einen
Spot rastet ein („Glücksburg Holnis“); Spalte wählen ⇒ Boot springt, Stunde der Seite folgt; „Abfahrt vergleichen“ ⇒
Adresse trägt die neue Abfahrt; Umschalten auf Strand ⇒ `sd=`, 64 Spots, Pegel an den Nordsee-Spots; auf Vor Ort ⇒
fragt nach dem Spot.

**Die fünf Fragen.**
1. *Funktionserhalt:* Vor Ort ist der Planer der Phase SP mit einer Zeile mehr (J8: ohne den Umschalter dasselbe
   Markup; `verify:sea-planner` 46/46). Ohne offenen Planer zeigt die Seite nichts Neues. Im Modus Etappe klappen die
   Ebenen unter die Eingabe (ein Klick), die Legende über die Tabelle (ein Klick), Spot-Auswahl und Spot-Kachel ruhen
   wie bei SP. **Nicht einzeln im Browser abgehakt:** jede Ebene im zugeklappten Block.
2. *Desktop pixelgleich:* **nicht gemessen** (kein Pixelvergleich gegen HEAD). Ohne Planer rendert keine Klasse dieser
   Phase.
3. *Touch-Ziele:* im Blatt gemessen (390 × 844): **kein** Knopf, Eingabefeld oder Aufklapper unter 44 px, in Etappe und
   Strand. Punkt-Marken mobil 44 px per Regel.
4. *Konsole:* Etappe Laboe → Marstal, Strand, mobil: **0 Fehler**, eine Warnung der Basiskarte („circle-11“, auch ohne
   diese Phase). **Nicht sauber** bei einer Etappe in dänischen Gewässern: 17 × `404` derselben fehlenden
   Stationskachel (V-AM-5) — kein Fehler der Seite, aber rot in der Konsole.
5. *Long Tasks:* längste beim Laden 93 ms, beim Umschalten, Abfahrt wechseln und Spalte wählen 55 ms (unter 200 ms). In
   diesem Chromium gemessen, nicht auf einem Telefon.

**Nicht geprüft:** Ziehen eines Punkts mit Maus oder Finger (nur Klicks gespielt), Real-Device, Tablet 834 px,
Strom und „Wind gegen Strom“ mit Live-Daten (es gibt keine, §1.2 b), Wasserstand am Ziel über das DMI (die Datei liegt
noch nicht im Speicher).

## 7. Befunde

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| **V-AM-1** | Am 19.11. fehlt an Punkten ohne Station die Windrichtung ab +15 h (der t1-Cube steht seit 17.11. 15 UTC, V-SG-9); die Etappe sagt „Richtung fehlt“ | Mit einem laufenden Punkt-Cron hat jede Stunde eine Richtung. Ursache im Daten-Repo (Punkt-Cron), nicht in der Seite |
| **V-AM-2** | Die Kosten je Etappe sind in Node gemessen (33 Abrufe / 2,4 MB für 10 Punkte), im Browser nicht; 13 der 33 Abrufe sind Höhenkacheln, die über Wasser nichts ändern | Messung mit `perf-measure.mjs` am Build; danach entscheiden, ob Wasserpunkte ohne Höhenkachel rechnen dürfen (ein Eingriff in den Leser — Jan) |
| **V-AM-3** | Strom und „Wind gegen Strom“ zeigen bis zu Jans Push der Phasen ST/SR „keine Daten“ (kein `sea/v1/current/` im Speicher) | Nach dem Push und dem ersten BSH-Lauf mit u/v-Feld eine Etappe ansehen; der Prüfer rechnet schon auf den aufgezeichneten Bildern |
| **V-AM-4** | Profil Motorboot: die Windsee-Grenze wird auf der Etappe nicht geprüft (Komponentenfeld nur dreistündlich) | Windsee je Stunde ins Stundenfeld schreiben (Producer), dann prüfen |
| **V-AM-5** | Der Cube-Leser fragt eine fehlende Stationskachel (`point/stations/<lauf>/12_05.bin`, 404) an JEDEM Probenpunkt neu: 17 rote Zeilen in der Konsole bei einer Etappe in dänischen Gewässern, 17 unnütze Abrufe | Eine 404 der Kachel für die Sitzung merken (`src/point/client/`) — Eingriff in den Punkt-Leser, deshalb nicht in dieser Phase |
| **V-AM-6** | Tablet 834 px: kein dritter Breakpoint (Auftrag). Mit Finger gilt das Blatt; mit Maus bleibt der Desktop-Aufbau, und der lässt bei 834 px nur 144 px Karte (Rail 62 + Eingabe 288 + Befunde 340) — gerechnet, nicht angesehen | Den Aufbau der Tablet-Vorlage (Karte oben, darunter zwei Spalten) hinter einer Container-Abfrage der Bühne statt eines Viewport-Breakpoints |
| **V-AM-7** | Der Kartenhinweis „Karte erkunden“ legt sich beim ersten Besuch über eine geöffnete Etappe (auch über einen `pl=`-Link der Phase SP) | Hinweis ruhen lassen, solange ein Planer-Link öffnet |
| **V-AM-8** | Mobil liegt die Quellenzeile der Karte in den ersten Sekunden ÜBER dem Blatt (auch bei Vor Ort; V-SP-9 nahm das Gegenteil an) | `--msl-bottom` auf die Höhe des Blatts setzen |
| **V-AM-9** | Windpfeile mit Knoten und der Strompfeil entlang der Route (Vorlage) fehlen; die Windpfeile an den Spots bleiben | Symbol-Ebene an den Probenpunkten für die gewählte Stunde |
| **V-AM-10** | Der Wind der Etappe wird im Browser gerechnet (Leser des Clients, mit dem dichten Messsatz), der Wind der Spots im Producer (ohne): an der Wasserzelle eines Spots können beide leicht abweichen. Nicht gemessen | Alle Spots einmal mit beiden Wegen rechnen und die Differenz ins Audit schreiben |
| **V-AM-11** | Die Phase kostet 20,0 KB gzip, davon rund 13,6 im Chunk der Seite (auch wer nie plant, lädt Rechnung und Wortlaute mit) | Hook und `seaTrip.ts` hinter einen dynamischen Import legen, den erst der geöffnete Planer zieht |
| **V-AM-12** | `verify:sea-trip` steht nicht in `.github/workflows/ci.yml` | Eine Zeile hinter dem Prüfer des Planers (wie V-SP-4) |
| **V-AM-13** | Strand liest je Liste höchstens 12 Pegel; im Revier „Alle“ bleiben Spots ohne Wasserstand, obwohl ein Pegel in der Nähe eine Kurve trägt (die Seite nennt die Grenze) | Pegel nur für die sichtbaren Zeilen nachladen |
| **V-AM-14** | Die Ankunft liest die NÄCHSTE volle Stunde; bei 13:29 ist das 13 Uhr, bei 13:31 schon 14 Uhr | Beide Nachbarstunden zeigen („13 Uhr 18 kn, 14 Uhr 21 kn“) statt einer |
| **V-AM-15** | Ein Punkt lässt sich auf Land setzen (kein Landtest, wie V-SP-1); dort stehen Welle und Strom als „kein Seegang im Modell“ / „kein Wasserpunkt“ und der Strang wird gestrichelt | Küstenlinie wie V-SP-1 |
