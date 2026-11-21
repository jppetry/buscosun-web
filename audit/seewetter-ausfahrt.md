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

## 8. Nachzug AM-N (19.11.): V-AM-7, V-AM-8, V-AM-12

Auftrag Jan 19.11.: die drei Befunde als kleines Paket, weil die Seite seit dem Push (`1bcf3e43`, 19.11. 07:09 MEZ)
live ist; danach V-AM-9 als eigene Phase (§9).

### 8.1 Diagnose (vor dem Code)

**V-AM-7 — der Kartenhinweis über einer geöffneten Ausfahrt.** `MapGestureHint` läuft auf `/seewetter` mit `always`:
der Schleier „Karte erkunden“ kommt bei JEDEM Besuch, nicht nur beim ersten. Die Seite schaltet ihn nur über
`enabled` ab — Desktop `!inDossier`, mobil `mobTab === 'map' && !inDossier`. Ein offener Planer zählt dort nicht:
- Desktop, Link mit `et=`, `sd=` oder `pl=`: der Schleier liegt über Route, Tabelle und Boot, bis man klickt.
- Mobil, `et=`/`sd=`: die Seite öffnet auf dem Blatt (`mobTab = 'plan'`), der Hinweis ruht — und kommt, sobald man
  unten „Karte“ wählt, über die Route.
- Mobil, `pl=`: bis der Spot bekannt ist, steht `mobTab` auf `map`; der Hinweis kann aufgehen, wird vom Wechsel aufs
  Blatt ohne Vermerk geschlossen und kommt bei „Karte“ wieder.
- Von Hand: wer den Planer öffnet, ohne den Hinweis weggeklickt zu haben (mobil über die untere Leiste), bekommt
  ihn beim Zurückkehren auf die Karte.

**V-AM-8 — Quellenzeile und Knopf „Quellen“ über dem Blatt.** Beleg `audit/seewetter-ausfahrt/etappe-mobil-390.png`:
der dunkle Streifen liegt über dem Fuß des Blatts, darunter der Knopf „Quellen“. Ursache: `main.sw-map` ist
positioniert, trägt aber keinen `z-index` — also keinen eigenen Stapel. Streifen (41), Knopf (40) und Kachel (42)
aus `map/mapSources.css` messen sich deshalb direkt mit dem Blatt `.sw-pl-sheet` (6), das ein Geschwister von
`main` ist, und gewinnen. Der Streifen blendet 5 s nach dem Laden aus, **der Knopf bleibt** und verdeckt dauerhaft
die rechte untere Ecke des Blatts (im Beleg das Wort „gesetzt“ der Zeile Wegpunkte). V-AM-8 nannte nur die Zeile;
V-SP-9 nahm das Gegenteil an (Blatt verdeckt Zeile). Die Regel `--msl-bottom` (Streifen und Knopf über eine untere
Leiste heben) greift auf dieser Seite nicht: `seaDeck.css` setzt die Variable nie, und
`.sw-root.is-mobile .sw-map.is-mobile .maplibregl-ctrl-bottom-right { bottom: 0 }` (fünf Klassen) schlägt die
Regel aus `mapSources.css` (drei Klassen). Die Höhe des Blatts hängt am Inhalt (`max-height` 46 dvh, Strand
62 dvh, offen bis 72 px unter den Rand) ⇒ CSS allein kennt sie nicht.

**V-AM-12 — CI.** `.github/workflows/ci.yml` trägt für die Seewetter-Seite `verify:sea-waterlevel` und
`verify:sea-tide-window`. `verify:sea-trip` fehlt; der Prüfer ist netzfrei und braucht keinen Browser, seine
Fixtures liegen im Repo.

### 8.2 Entscheidungen (gesetzt, Jan kann sie drehen)

| Nr. | Frage | Gesetzt |
|---|---|---|
| E-AM-15 | Wie lange ruht der Kartenhinweis? | Solange ein Planer offen ist **und für den Rest des Besuchs**, sobald einer offen war (Link oder von Hand, auch die Frage nach dem Spot). Grund: ein Schleier, der mitten in der Sitzung nach dem Schließen des Planers aufgeht, erklärt jemandem das Zoomen, der die Karte gerade benutzt hat. Beim nächsten Besuch ohne Planer kommt er wie bisher |
| E-AM-16 | Wohin mit Zeile und Knopf, wenn das Blatt offen ist? | Blatt in Ruhe (halbe Höhe): beide stehen auf der Oberkante des Blatts (`--msl-bottom` = gemessene Höhe), die Kachel öffnet darüber. Blatt ganz offen („Alle Befunde zeigen“): unter der Kopfzeile bleiben 8 px Karte — Zeile und Knopf ruhen, wie beim Dossier, das die Karte ebenfalls verdeckt (`seaDeck.css`, Regel `:has(.sw-m-dossier)`); „Karte zeigen“ bringt sie zurück. Grenze: weniger als 56 px Karte zwischen Kopfzeile und Blatt (`PLAN_SHEET_SOURCES_MIN_GAP_PX`, `set`: drei Zeilen Quellenzeile bei 390 px ≈ 42 px + Rand) |

### 8.3 Plan

1. `seaTrip.ts`: `planSheetSources` (rein) + Konstante. `SeaPage.tsx`: Zustand `hintRest`; Messung des Blatts
   (ResizeObserver am Blatt, Fenstergröße), Klasse und Variable an Wurzel und Karte. `seaDeck.css`: zwei Regeln in der
   letzten mobilen Media Query (dort hängt `verify:sea-planner` H10).
2. `verify:sea-trip`: Abschnitt K (Regel mit Negativkontrollen, Verdrahtung, CI-Zeile).
3. `ci.yml`: ein Schritt hinter „Tidenfenster“.
4. Gate: typecheck, `verify:sea-trip`, `verify:sea-planner`, build, budget, Browser 390 × 844 und 1440 × 900.

### 8.4 Beim Prüfen gefunden und mitbehoben

**V-AM-16 — die Etappe zeigte live „Welle: keine Daten“ (seit 19.11. 07:31 MEZ).** Gesehen an der Vorschau des
Builds mit Live-Daten: alle Spalten der Zeile „Welle“ ohne Wert, obwohl `f/006…017.png` geladen waren (je einmal).
Ursache: `loadField` / `loadCurrentUv` (`seaClient.ts`) geben jedem Aufrufer EIN zwischengespeichertes Versprechen je
Datei, und dieses stirbt mit dem Abbruch dessen, der zuerst gefragt hat. Die Etappe lädt ihre Stunden zweimal, sobald
die Strömungsdatei eintrifft (`fieldsKey` wechselt von `<lauf>|-` auf `<lauf>|<stromlauf>`): der erste Durchlauf wird
abgebrochen, der zweite bekommt aus dem Speicher genau die sterbenden Abrufe zurück, `.catch(() => null)` macht daraus
„keine Daten“. Vor Jans Push gab es keine Strömungsdatei im Speicher (V-AM-3) — deshalb war der Fehler am 19.11. um
02:20 nicht zu sehen und trat mit dem ersten BSH-Lauf danach (`status.current` seit 06:31 UTC) bei jeder Etappe auf.
Behebung in `seaTripData.ts` (`sharedLoad`): die Etappe gibt ihr eigenes Signal nicht mehr in die geteilten Lader (sie
kann damit auch der Karte keinen Abruf mehr abbrechen) und fragt nach einem FREMDEN Abbruch neu, höchstens dreimal
(`SEA_TRIP_SHARED_TRIES`, `set`); ein echter Fehler bleibt „keine Daten“. Preis: ein abgebrochener Durchlauf lädt
seine Stunden zu Ende (dieselben Dateien braucht der nächste). `seaClient.ts` ist unverändert.

**V-AM-17 — der Knopf „Quellen“ lag auch über „Spot“, „Ebenen“ und „Schwelle“.** Dieselbe Ursache wie V-AM-8, an den
bildschirmfüllenden Blättern der unteren Leiste (`.sw-m-dock`): `elementFromPoint` an der Stelle des Knopfs traf über
dem offenen Blatt „Ebenen“ den Knopf. Eine Regel neben der des Dossiers (`:has(.sw-m-dock)`): Zeile und Knopf ruhen,
solange ein solches Blatt die Karte verdeckt.

### 8.5 Umsetzung

| Teil | Datei | Was |
|---|---|---|
| Regel | `src/sea/seaTrip.ts` | `planSheetSources` (rein), `PLAN_SHEET_SOURCES_MIN_GAP_PX = 56` |
| Seite | `src/sea/SeaPage.tsx` | `hintRest` / `hintOn` an beiden Einbauten des Hinweises; `plSheetRef` misst das Blatt (ResizeObserver + Fenstergröße), Klasse `has-plsheet` / `is-plsheet-full` an der Wurzel, `--msl-bottom` an der mobilen Karte |
| Stil | `src/sea/seaDeck.css` | zwei Regeln in der letzten mobilen Media Query (heben, ruhen), eine neben der Dossier-Regel (V-AM-17) |
| Daten | `src/sea/seaTripData.ts` | `sharedLoad` um die zwei Feldabrufe (V-AM-16) |
| CI | `.github/workflows/ci.yml` | Schritt „Verifier — Ausfahrt planen“ hinter dem Tidenfenster |
| Prüfer | `scripts/verify-sea-trip.mjs` | Abschnitt K (K1–K6, K3b) |
| Budget | `budget.json` | totalJs 2 044 → 2 045, Notiz |

### 8.6 Gate (19.11.)

| Prüfung | Ergebnis |
|---|---|
| `verify:sea-trip` | **62/62** (55 + K1–K6, K3b). K6 ist ein Verhaltenstest: die echten Lader aus `seaClient.ts` hinter `loadTripHour`, Speicher, Bilddekoder und Canvas durch die Fixture-Dateien ersetzt — am alten Code rot |
| Mutationen | **13 von 14 bemerkt.** Nicht bemerkt: „ein Nicht-Abbruch-Fehler wird dreimal gefragt“ — gleichwertig, die Lader werfen nie etwas anderes als einen Abbruch (sie geben `null` zurück); die Zeile bleibt als Schutz |
| `verify:sea-planner` | 46/46 (H10: die neuen mobilen Regeln stehen in der letzten Media Query) |
| `npm run typecheck` · `npm run build` | grün · grün (281/281) |
| `npm run budget` | grün mit angehobener Grenze: eagerJs 114,9 / 115 · eagerCss 2,4 / 2,5 · largestChunk 278,4 / 302 · totalJs 2 044,0 / 2 045. **Anteil isoliert gemessen** (`git archive` von HEAD gegen den Arbeitsbaum): 2 096 872 → 2 097 285 Byte = **+413 Byte gzip**. Der erste Lauf war rot (2 044,0 > 2 044) |
| Nicht gelaufen | die übrigen `verify:sea-*` (keine ihrer Dateien berührt außer `seaDeck.css` / `SeaPage.tsx`; `verify:sea-ui` ist an HEAD rot, V-TF-5) |

**Im Browser gesehen** (Vorschau des Builds, Chromium über Playwright, Live-Daten 19.11. 07:33–07:47 MEZ):
- *V-AM-7:* Desktop 1440 × 900, Link mit `et=` ⇒ kein Schleier (`amn-desktop-et-link.png`); Planer schließen ⇒ er kommt
  nicht nach. Mobil 390 × 844: `et=` und `sd=` ⇒ kein Schleier, auch nicht nach „Karte“. Gegenprobe `/seewetter` ohne
  Planer: der Schleier kommt wie bisher (Desktop und mobil); mobil „Ausfahrt“ antippen ⇒ er schließt und bleibt weg.
- *V-AM-8:* Blatt in Ruhe 392–780 px, Zeile 351–392, Knopf 366–392 (auf der Oberkante, `amn-mobil-390-blatt-ruhe.png`);
  Kachel „Quellen“ öffnet 8–362 px, also über dem Blatt; „Alle Befunde zeigen“ ⇒ Blatt 72–780, Zeile und Knopf
  `display: none`; „Karte zeigen“ ⇒ wieder auf der Oberkante. Strand: Blatt 257–780, Knopf 231–257. Reiter „Karte“ bei
  offenem Planer: Knopf wieder am Kartenfuß (754–780).
- *V-AM-17:* „Ebenen“ und „Spot“ offen ⇒ Zeile und Knopf `display: none`; zurück auf „Karte“ ⇒ da.
- *V-AM-16 / V-AM-3:* Etappe Laboe → Marstal (10:00, 5 kn): Welle 0,1–0,3 m mit Richtung zum Kurs, Strom 0,0–0,3 kn
  („quer“ bei 0,3), am Ziel „kein Seegang im Modell“ / „kein Wasserpunkt“ (der Punkt liegt im Hafen). Kein Feld
  doppelt geladen. Damit sind Strom und „Wind gegen Strom“ zum ersten Mal mit Live-Daten gesehen.
- Konsole: 0 Fehler, eine Warnung der Basiskarte („circle-11“, wie zuvor).

**Die fünf Fragen.**
1. *Funktionserhalt:* der Hinweis bleibt auf der Seite ohne Planer; Zeile und Knopf „Quellen“ bleiben erreichbar, wo
   Karte zu sehen ist. **Weniger als zuvor:** unter dem ganz offenen Blatt und unter „Spot“ / „Ebenen“ / „Schwelle“
   ist der Knopf „Quellen“ nicht mehr da (vorher lag er dort über dem Inhalt) — gesetzt nach dem Vorbild des Dossiers
   (E-AM-16), ein Tipp auf „Karte“ bzw. „Karte zeigen“ bringt ihn zurück.
2. *Desktop pixelgleich:* **nicht gemessen.** Am Desktop ändert sich nur, ob der Schleier bei offenem Planer kommt;
   die CSS-Regeln stehen in der mobilen Media Query, die Karte trägt am Desktop weder Klasse noch Variable (K2).
3. *Touch-Ziele:* kein neues Bedienelement.
4. *Konsole:* sauber (s. oben).
5. *Long Tasks:* **nicht gemessen**; neu ist ein ResizeObserver am Blatt, der bei geänderter Höhe einen Zustand setzt.

**Nicht geprüft:** Real-Device (Safe-Area oben: die Grenze misst gegen die Kopfzeile, nicht gegen den Rand), Tablet mit
Finger, der `pl=`-Link im Browser (nur über den Prüfer K4), „Schwelle“ im Browser (dieselbe Klasse wie „Ebenen“).

### 8.7 Stand der Befunde aus §7 nach dem Nachzug

V-AM-7, V-AM-8, V-AM-12, V-AM-16, V-AM-17: **umgesetzt** (uncommitted). V-AM-3: **gesehen** — `sea/v1/current/` liegt
seit 19.11. 06:31 UTC im Speicher (Lauf `2026111900`, mit u/v-Feld), Strom steht in der Tabelle.

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| **V-AM-18** | Die Ursache von V-AM-16 liegt in den Ladern selbst und trifft auch die Karte: wechselt man die Ebene (Wellenhöhe ↔ Periode, gleiche Datei), während das Feld noch lädt, bekommt der zweite Abruf das sterbende Versprechen, die Ablehnung wird verschluckt und `fieldState` bleibt auf „lädt“. Nicht nachgestellt, aus dem Code gelesen (`SeaPage.tsx`, Effekt an `fieldKey`) | In `seaClient.ts` den geteilten Abruf vom Signal des Aufrufers lösen (jeder Aufrufer bekommt sein eigenes Abbruch-Rennen um das gemeinsame Versprechen). Preis: ein abgebrochener Abruf lädt zu Ende — beim schnellen Ziehen der Zeit mehr Bandbreite; deshalb Jans Wort. **Umgesetzt 19.11. (§10), nachgestellt, ohne den Preis** |
| **V-AM-19** | E-AM-15 lässt den Hinweis auch dann für den Besuch ruhen, wenn jemand nur „Ausfahrt“ angetippt und sofort wieder geschlossen hat | Falls Jan ihn danach wieder will: `hintRest` nur bei einem Link setzen, sonst allein an `tripOpen` hängen |

## 9. Phase AM-P (19.11.): V-AM-9 — Windpfeile und Strompfeil an der Route

### 9.1 Diagnose (vor dem Code)

**Was die Vorlage zeigt** (`reference/seewetter-ausfahrt-desktop-etappe.dc.html`, Kartenbild): drei Windpfeile neben
der Route, je mit Zahl („12 kn“, „17 kn“, „19 kn“ — wachsend zum Ziel hin, also der Wind dort, wenn das Boot dort
ist), auf der Seite, von der der Wind kommt; dazu EIN Strompfeil in Petrol mit gestricheltem Schaft und „Strom
0,8 kn“, an der Stelle des Befunds „Wind gegen Strom … vor Ærø“. Das README der Vorlage nennt die Pfeile nicht.

**Was die Karte hat** (`SeaMap.tsx`, `syncTrip`): Route als vier Linien-Ebenen, Punkte und Boot als HTML-Marker. Die
Windpfeile an den Spots (`sw-wind`) gelten für die Stunde der Seite, nicht für die Etappe. Die Karte dreht nicht
(`dragRotate: false`, Drehen am Finger aus) ⇒ Bildschirmwinkel = Kompasswinkel.

**Was die Rechnung schon liefert:** `tripRows` gibt je Stopp (Abfahrt, jede volle Stunde, Ankunft) Ort, Kurs des
Teilstücks, Wind (Stärke, Richtung „aus“), Strom (kn, „setzt nach“), `over.wind`. Nichts muss neu geladen oder
gerechnet werden; die Pfeile sind eine zweite Anzeige derselben Zeilen.

**Grenzen der Daten.** (1) Ohne Windrichtung (V-AM-1, „Richtung fehlt“) lässt sich kein Pfeil zeichnen. (2) Strom
unter 0,2 kn hat auf der Seite keine Klasse (E-AM-5). (3) Die Schrift einer Symbol-Ebene käme aus den Glyphen der
Basiskarte, nicht aus League Spartan ⇒ HTML-Marker wie Punkte und Boot.

### 9.2 Gestaltung (Skill `frontend-design`, im Command-Deck)

- **Farben, keine neuen:** Ink `#2C2A26`, Cream `#FAF6EA`, Rot `#B5482E` / Schrift `#8A3320` nur „über deiner
  Grenze“, der Stromton der Seite `#6FD3DC` (Bild `sw-drift` der Strompfeile), Kartendunkel `#0B0E12` als Saum.
- **Schrift:** League Spartan 13 px / 600, tabellarische Ziffern, keine Versalien.
- **Das eine Bild bleibt der Strang:** ein Windpfeil ist ein Stück davon — heller Mantel, dunkler Kern, über deiner
  Grenze roter Kern, genau wie die Route. Verworfen: schlichte helle Pfeile (wären von den Windpfeilen der Spots
  nicht zu unterscheiden, die eine andere Stunde zeigen). Der Strompfeil trägt die umgekehrte Zeichnung der
  Strompfeile der Seite (dunkler Mantel, heller Stromton), gestrichelt wie in der Vorlage.
- **Lage:**

  ```
            12 kn
             ↘                Luv-Seite der Route, 34 px neben dem Stopp, Zahl auf der abgewandten Seite
    ──●───────────●────────   Route
                    ⇢         Lee-Seite, am Stopp mit dem stärksten Strom
                  Strom 0,3 kn
  ```
- Bewegung: keine. Mobil: dieselben Marker, keine Bedienelemente.

### 9.3 Entscheidungen (gesetzt, Jan kann sie drehen)

| Nr. | Frage | Gesetzt |
|---|---|---|
| E-AM-17 | Welchen Wind zeigt ein Pfeil? | Den der Tabellenspalte: am Ort des Stopps zu der Stunde, in der das Boot dort ist. **Abweichung von der Skizze in V-AM-9** („Probenpunkte für die gewählte Stunde“): ein Windfeld EINER Stunde neben einer Tabelle, die je Spalte eine andere Stunde zeigt, gäbe an derselben Stelle zwei verschiedene Zahlen. Karte und Tabelle sagen so dasselbe |
| E-AM-18 | Lage | Pfeilmitte 34 px neben dem Stopp (`SEA_TRIP_ARROW_OFF_PX`, `set`), rechtwinklig zum Kurs, auf der Seite, von der der Wind kommt (genau von vorn/achtern: Steuerbord); Länge 30 px; die Zahl steht auf der der Route abgewandten Seite des Pfeils. So liegt nie ein Pfeil auf der Route |
| E-AM-19 | Zu viele Stopps im Ausschnitt | Pfeile, deren Mitten näher als 58 px lägen (`SEA_TRIP_ARROW_MIN_PX`, `set`), fallen weg — zuerst bleibt der Stopp der gewählten Spalte, dann die über deiner Grenze, dann der Reihe nach. Beim Zoomen neu gerechnet |
| E-AM-20 | Strom | EIN Pfeil: am Stopp mit dem stärksten Strom der Etappe, ab 0,2 kn (E-AM-5), auf der anderen Seite der Route als der Windpfeil dort; „Strom 0,3 kn“ (immer Knoten, wie die Zeile der Tabelle). Kein Pfeil je Stopp: zwei Pfeilreihen an einer Linie liest niemand |
| E-AM-21 | Fehlende Werte | Ohne Windrichtung oder ohne Windwert kein Pfeil — die Tabelle sagt „Richtung fehlt“ / „keine Daten“. Rot nur, wenn der WIND der Spalte über deiner Grenze liegt (der Pfeil nennt den Wind; Böen und Welle färben die Route) |
| E-AM-22 | Bedienung | keine: die Pfeile nehmen keine Klicks (ein Klick auf die Karte setzt weiter den Wegpunkt), die Spalte wählt man in der Tabelle |

### 9.4 Plan

1. `seaTrip.ts` (rein): `tripArrows` (aus den Zeilen), `tripArrowSide`, `tripArrowPx` (Lage am Bildschirm, Norden
   oben), `tripArrowKeep` (Ausdünnen), zwei Wortlaute der Legende.
2. `SeaMap.tsx`: Marker je Pfeil in `syncTrip`, neu gedünnt bei `zoomend`; beim Ziehen eines Punkts weg.
3. `SeaPage.tsx`: Pfeile und gewählte Spalte an die Karte. `SeaTripPanels.tsx`: zwei Einträge in der Legende der
   Tabelle. `seaDeck.css`: `sw-am-arr*`.
4. `verify:sea-trip` Abschnitt L auf den echten Zeilen der Fixtures, mit Negativkontrollen und Mutationen.
5. Gate: typecheck, `verify:sea-trip`, `verify:sea-planner`, build, budget, Browser 1440 × 900 und 390 × 844.

### 9.5 Umsetzung (19.11.)

| Teil | Datei | Was |
|---|---|---|
| Rechnung | `src/sea/seaTrip.ts` | `tripArrows` (Pfeile aus den Zeilen), `tripArrowSide`, `tripArrowPx` (Lage, Zahl, Bündigkeit), `tripArrowRects`, `tripArrowLayout` (Ausdünnen und Ausweichen), sieben gesetzte Maße, zwei Wortlaute in `TRIP_LEGEND` |
| Karte | `src/sea/SeaMap.tsx` | `syncArrows`: je Pfeil ein HTML-Marker ohne Klicks (SVG mit Mantel und Kern, Schaft und Spitze getrennt), gesetzt NACH Route, Punkten und Boot, neu nach `zoomend`, weg beim Ziehen eines Punkts; die Etiketten der Punkte und des Boots werden am Bildschirm gemessen |
| Seite | `src/sea/SeaPage.tsx` | Pfeile der Zeilen und gewählte Spalte an die Karte; eine neue Liste nur, wenn sich ein Pfeil ändert |
| Tabelle | `src/sea/SeaTripPanels.tsx` | zwei Einträge in der Legende („Wind, wenn du dort bist“, „stärkster Strom der Etappe“), `aria-label` „Route und Pfeile auf der Karte“ |
| Stil | `src/sea/seaDeck.css` | `sw-am-arr*`, `sw-am-keyarr`; Punkte und Boot liegen über den Pfeilen |
| Prüfer | `scripts/verify-sea-trip.mjs` | Abschnitt L (L1–L7) |
| Budget | `budget.json` | totalJs 2 045 → 2 046, Notiz |

**Nachtrag zu §9.3, aus dem ersten Bild.** Der erste Stand (`amp-desktop-1440-pfeile.png`, überschrieben) hatte zwei
Fehler, die kein Prüfer sah: der Pfeil am Start lag unter den Etiketten „Start“ und „10:00 · Start“, und die breite
Zahl „Strom 0,3 kn“ ragte mittig gesetzt in die Route. Daraus:

| Nr. | Frage | Gesetzt |
|---|---|---|
| E-AM-23 | Etiketten auf der Karte | Ein Pfeil weicht dem Namen eines Punkts und dem Etikett des Boots auf die andere Seite der Route aus (er zeigt weiter, wohin der Wind weht); steht auf beiden Seiten ein Etikett, fällt er weg. Vor einem anderen PFEIL wird nicht gewendet — sonst füllten sich beide Seiten und das Ausdünnen griffe nicht (im ersten Lauf des Prüfers so gesehen: 6 von 7 Pfeilen blieben). Der Strompfeil bleibt immer |
| E-AM-24 | Zahl neben einer Route links oder rechts | bündig am Pfeil, von der Route weg laufend (ab 12 px seitlichem Versatz); mittig nur, wenn die Route über oder unter dem Pfeil läuft |

### 9.6 Gate (19.11.)

| Prüfung | Ergebnis |
|---|---|
| `verify:sea-trip` | **69/69** (62 + L1–L7): L1 Seite gegen eine zweite Regel auf 648 Paaren · L2 Pfeile aus den echten Zeilen der Fixtures (die Startstunde ohne Richtung ⇒ kein Pfeil) · L3 Gegenproben (ohne Richtung, Strom unter 0,2 kn, Land, Einheit, Rot nur am Wind, stärkster statt erster Strom) · L4 Lage über 1 152 Lagen: Pfeilende ≥ 18 px, Zahl ≥ 5 px von der Route · L5 Ausdünnen und Ausweichen · L6 Verdrahtung, CSS · L7 Legende |
| Im ersten Lauf rot | L5: die Regel ließ Pfeile einander ausweichen (E-AM-23) — **ein Fehler im Entwurf**, behoben |
| Mutationen | **27 von 27 bemerkt** (Seite, Richtung, Rot, Einheit, Strom-Auswahl und -Schwelle, Lage der Zahl, Bündigkeit, Wenden, Ausweichen, Rangfolge, Ausdünnen, Ziehen, Zoom, Reihenfolge der Marker, `position` an der Marke, Klicks, Lauf ungültig, Legende). Zwei Prüfungen kamen erst nach der Frage „welche Mutation bliebe unbemerkt?“ dazu (Rot folgt dem Wind; stärkster Strom) |
| `verify:sea-planner` · `-wind-band` · `-contract` · `-current` · `-ripples` · `-sight` · `-tide-window` · `-waterlevel` · `-watertemp` · `-dk` · `-seo` · `-text` · `-decode` | 46/46 · 41/41 · 30/30 · 108/108 · 111/111 · 76/76 · 49/49 · 63/63 · 136/136 · 70/70 · 23/23 · 35/35 · 13/13 |
| `verify:fusion-release` · `verify:tour-result` | 33/33 · 51/51 |
| `verify:sea-ui` · `verify:sea-derive` | nicht gelaufen (wie §6) |
| `npm run typecheck` · `npm run build` | grün · grün |
| `npm run budget` | grün mit angehobener Grenze: eagerJs 114,9 / 115 · eagerCss 2,4 / 2,5 · largestChunk 278,4 / 302 · totalJs 2 045,6 / 2 046. **Anteil gemessen** (derselbe Zähler wie §8.6): 2 097 285 → 2 098 894 Byte = **+1 609 Byte gzip** (Chunk der Seite +1 572, Lazy-Chunk der Tabelle +140) |

**Im Browser gesehen** (Vorschau des Builds, Chromium über Playwright, Live-Daten 19.11. 08:00–08:12 MEZ):
- Desktop 1440 × 900, Laboe → Marstal, 10:00, 5 kn (`amp-desktop-1440-pfeile.png`): vier Windpfeile („3 kn“, „10 kn“,
  „10 kn“, „7 kn“ — die Zahlen der Spalten 10, 12, 14 und 15 Uhr) von sieben Stopps, ein Strompfeil „Strom 0,3 kn“ am
  Stopp 12 Uhr (dort steht in der Tabelle 0,3 quer). Der Pfeil am Start steht gewendet links der Route. Gemessen:
  keine Zahl überlappt ein Etikett.
- Spalte wählen (13:00, 15:43, 11:00): das Boot springt, die Pfeile werden neu gesetzt, jedes Mal ohne Überlappung.
- Mobil 390 × 844 (`amp-mobil-390-pfeile.png`): dieselben Pfeile über dem Blatt.
- Über der Grenze (`amp-mobil-390-ueber-grenze.png`, Profil SUP/Kajak, Abfahrt 20.11. 13:00): roter Kern, Zahl
  „18 kn“ in heller Pille mit roter Schrift; daneben „7 kn“ ohne Rot; „Strom 0,8 kn“. An diesem Tag tragen mehrere
  Stopps keine Windrichtung (V-AM-1) ⇒ dort kein Pfeil.
- Konsole: 0 Fehler, eine Warnung der Basiskarte (wie zuvor). Long Tasks beim Wählen dreier Spalten und beim Zoomen:
  75, 74, 61 ms.

**Die fünf Fragen.**
1. *Funktionserhalt:* nichts entfernt. Die Windpfeile an den Spots bleiben; Punkte ziehen, Wegpunkt setzen (die Pfeile
   nehmen keine Klicks), Boot, Tabelle wie zuvor. Die Legende der Tabelle trägt zwei Einträge mehr und heißt für den
   Vorleser jetzt „Route und Pfeile auf der Karte“.
2. *Desktop pixelgleich:* ohne offene Etappe rendert keine Klasse dieser Phase; **nicht gemessen**. Mit offener
   Etappe ist die Karte gewollt anders.
3. *Touch-Ziele:* kein neues Bedienelement (die Pfeile sind nicht bedienbar).
4. *Konsole:* sauber.
5. *Long Tasks:* höchstens 75 ms (in diesem Chromium, nicht auf einem Telefon).

**Nicht geprüft:** Ziehen eines Punkts im Browser (dass die Pfeile dabei verschwinden, belegt nur L6 am Quelltext),
Real-Device, Tablet, eine Etappe mit mehr als acht Stopps, eine Route mit engem Knick.

### 9.7 Befunde

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| **V-AM-20** | Während ein Zoom läuft, stehen die Pfeile noch in der Auswahl von vorher (neu gesetzt wird bei `zoomend`); im Test überlappte in dieser Zeit eine Zahl das Etikett des Boots, danach nicht mehr | Bei `zoom` gedrosselt neu setzen (alle 150 ms) |
| **V-AM-21** | An Stopps ohne Windrichtung steht kein Pfeil, ohne dass die Karte sagt, warum (die Tabelle sagt „Richtung fehlt“); am 20.11. betraf das die meisten Stopps (V-AM-1) | Erledigt sich mit dem Punkt-Cron; sonst ein Ring mit Zahl statt des Pfeils, mit Eintrag in der Legende |
| **V-AM-22** | Ein gewendeter Pfeil steht auf der Lee-Seite und zeigt von der Route weg; wer die Regel „steht dort, woher der Wind kommt“ gelernt hat, liest ihn dennoch richtig (die Spitze zeigt, wohin er weht), aber die Lage sagt dann nichts | Statt zu wenden den Pfeil am Stopp entlang der Route verschieben (halber Weg zum Nachbarstopp) |
| **V-AM-23** | Die Breite einer Zahl wird gerechnet (7,5 px je Zeichen), nicht gemessen; das Ausweichen prüft gegen gemessene Etiketten. Im Browser lag die gerechnete Breite 4 bis 11 px über der gemessenen (26 statt 30, 33 statt 38, 79 statt 90 px) — auf der vorsichtigen Seite | Die Zahl nach dem Setzen messen und bei Bedarf einmal neu legen |
| **V-AM-24** | Der Strompfeil zeigt den stärksten Strom der Etappe, nicht den, an dem „Wind gegen Strom“ gilt; die Vorlage setzt ihn an diese Stelle | Gilt an einem Stopp „Wind gegen Strom“, den Pfeil dorthin setzen (dann ist er der Ort des Befunds) — Jans Wort, weil es die Regel E-AM-20 dreht |
| **V-AM-25** | Die Legende der Tabelle bricht mit fünf Einträgen am Desktop in zwei Zeilen | Die zwei Pfeil-Einträge in die aufklappbare Legende der Karte legen |

## 10. V-AM-18 (19.11.): der geteilte Abruf gehört allen, die auf ihn warten

Jans Auftrag (19.11.): „setze das um und erhöhe beliebig das Budget“.

### 10.1 Diagnose (vor dem Code, jetzt nachgestellt)

`loadField`, `loadCurrentField` und `loadCurrentUv` (`seaClient.ts`) hielten je Datei EIN Versprechen im Speicher und
gaben dem Abruf dahinter das Signal dessen mit, der zuerst gefragt hatte. Bricht der ab, stirbt der Abruf für alle,
die inzwischen dasselbe Versprechen bekommen haben. Der Eintrag wird zwar gelöscht, aber erst in einem Mikrotask nach
dem Abbruch — und React ruft das Aufräumen eines Effekts und den nächsten Effekt im selben Durchlauf, ohne Mikrotask
dazwischen. Der zweite Frager bekommt deshalb genau das sterbende Versprechen.

**Nachgestellt** mit den echten Ladern (Speicher, Bilddekoder und Canvas durch Fixture-Dateien ersetzt, K7 am Stand
vor der Behebung):

| Fall | alt | Soll |
|---|---|---|
| (a) Karte: Ebene wechselt auf derselben Datei (Wellenhöhe ↔ Periode), während sie lädt | der neue Frager endet mit `AbortError`, die Seite verschluckt ihn, `fieldState` bleibt „lädt“, die Fläche bleibt die der Stunde davor (oder leer); 1 Abruf, abgebrochen | Bild aus demselben Abruf |
| (c) zwei Frager, der erste geht später | der zweite endet mit `AbortError` | Bild |
| (e) dasselbe am u/v-Feld und am Pfeilfeld der Strömung | wie (a) | Bild / Feld |
| (d) Frager ohne Signal zuerst, dann einer mit Signal | ging gut — aber nur, weil das zweite Signal gar nicht galt | der zweite endet für sich, der Abruf bleibt |

V-AM-16 (Etappe) war derselbe Fehler; die Behebung vom Vormittag (`sharedLoad` in `seaTripData.ts`: kein eigenes
Signal, nach fremdem Abbruch bis zu dreimal neu fragen) hat ihn umgangen, nicht behoben.

### 10.2 Entscheidungen (gesetzt, Jan kann sie drehen)

| Nr. | Frage | Gesetzt |
|---|---|---|
| E-AM-24 | Lädt ein verlassener Abruf zu Ende (die Skizze aus §8.7, für deren Preis Jans Wort galt)? | **Nein.** Der Abruf läuft auf einem eigenen Signal und zählt, wer auf ihn wartet. Das Signal eines Fragers beendet nur dessen Warten (`AbortError`, wie bisher). Ist der letzte Frager mit Signal gegangen und hält keiner ohne Signal den Abruf (das Vorwärmen der nächsten Strömungsstunde fragt ohne), endet der Abruf — nachgesehen einen Mikrotask später, damit ein Frager, der im selben Durchlauf geht und neu fragt, den laufenden Abruf behält. Damit fällt der Preis „mehr Bandbreite beim schnellen Ziehen der Zeit“ nicht an: im Browser gemessen bricht `f/019.png` ab, sobald die Zeit weitergeht (§10.4) |
| E-AM-25 | Bleibt `sharedLoad` in der Etappe? | **Nein.** Mit der Behebung an der Wurzel erreicht kein fremder Abbruch die Etappe mehr; das Nachfragen wäre toter Code mit einem Kommentar, der etwas anderes sagt. `loadTripHour` gibt sein Signal wieder in die Lader und macht aus dem eigenen Abbruch `null`; `SEA_TRIP_SHARED_TRIES` entfällt. Folge: eine verlassene Etappe lädt ihre Stunden nicht mehr zu Ende (der Preis aus §8.4 entfällt ebenfalls), und der zweite Durchlauf nach dem Eintreffen der Strömungsdatei nimmt die laufenden Abrufe des ersten |

### 10.3 Umsetzung

| Teil | Datei | Was |
|---|---|---|
| Lader | `src/sea/seaClient.ts` | `sharedRead` (ein Eintrag je Datei: Versprechen, eigenes Abbruch-Signal, Zahl der Wartenden, „gehalten“, „fertig“); die drei Lader lesen darüber, ihre Rümpfe (Canvas-Weg, Größenprüfung) und ihre Speichergrößen (40 / 80 / 6) sind unverändert. Ein gescheiterter oder beendeter Abruf wird nicht gemerkt, eine Antwort schon (auch „falsche Bildgröße“ = `null`, wie zuvor). Das gemeinsame Versprechen lehnt nie ab (kein Versprechen ohne Abnehmer) |
| Etappe | `src/sea/seaTripData.ts` | `sharedLoad` und `SEA_TRIP_SHARED_TRIES` entfernt; `loadTripHour` reicht `signal` durch, Abbruch ⇒ `null` |
| Prüfer | `scripts/verify-sea-trip.mjs` | K6 auf den neuen Stand (jede Datei einmal geholt, (f) neu), **K7** neu (a–g) |
| Seite | `SeaPage.tsx`, `useSeaTrip.ts` | **unverändert** — die Aufrufer fragen wie bisher |

### 10.4 Gate (19.11.)

| Prüfung | Ergebnis |
|---|---|
| `verify:sea-trip` | **70/70** (69 + K7). K7 am Stand vor der Behebung **rot**: `a: ["AbortError","AbortError",1,1]`, `c` ebenso, `e` ohne Feld; danach `a: ["AbortError",630,1,0]` |
| Mutationen | **11 von 11 bemerkt** (Abbruch ohne Mikrotask · Abruf endet nie · Frager ohne Signal hält nicht · gescheiterter Abruf gemerkt · Gehen nicht gezählt · abgebrochenes Signal fragt doch · der Letzte sieht die anderen nicht · beendeter Abruf bleibt im Speicher · Abruf hängt wieder am Frager · Etappe ohne eigenes Signal · Etappe lässt den Abbruch durch). „Beendeter Abruf bleibt im Speicher“ blieb im ersten Lauf unbemerkt ⇒ Fall (g) ergänzt (wer genau zwischen Ende und Abschluss fragt) |
| Übrige Prüfer | `verify:sea-ripples` 111/111 (G15 liest die Speichergröße 6 am Quelltext) · `verify:sea-current` 108/108 · `verify:sea-planner` 46/46 · `verify:sea-sight` 76/76 · `verify:sea-wind-band` 41/41 · `verify:sea-dk` 70/70 |
| `npm run typecheck` · `npm run build` | grün · grün (281/281) |
| `npm run budget` | grün, **Grenze nicht angehoben** (Jan hatte sie freigegeben): eagerJs 114,9 / 115 · eagerCss 2,4 / 2,5 · largestChunk 278,4 / 302 · totalJs 2 045,9 / 2 046. Anteil mit dem Zähler aus §9.6: 2 098 894 → 2 099 189 Byte = **+295 Byte gzip** (gegen die Zahl aus §9.6 gerechnet, nicht gegen einen zweiten Build) |
| Nicht gelaufen | `verify:sea-ui` (Browser, an HEAD rot, V-TF-5), `verify:sea-derive`, `verify:sea-watertemp`, `verify:sea-tide-window` (lesen diese Lader nicht) |

**Im Browser gesehen** (Vorschau des Builds, Chromium über Playwright, 1440 × 900, Live-Daten 19.11. ≈ 08:30 MEZ):
- *Ebenenwechsel beim Laden:* `f/007.png` 2 s festgehalten, nach 1,9 s „Periode“ geklickt ⇒ EIN Abruf, nicht
  abgebrochen, fertig nach 2,0 s; Kopfzeile der Legende „Periode Tm s“, kein „Feld nicht ladbar“
  (`amv18-desktop-ebenenwechsel.png` — der Kartenhinweis liegt noch darüber, die Fläche ist dahinter zu sehen).
- *Zeit schnell weiter* (jedes Feld 1,5 s festgehalten, „+12 h“ und „+24 h“ im Abstand von 150 ms): `f/019.png`
  `net::ERR_ABORTED`, `f/031.png` geladen, Legende „Vorlauf +31 h“ — der verlassene Abruf endet. Der Klick auf „+6 h“
  davor löste keinen Abruf aus (nicht untersucht; der Test klickte mit `force`).
- *Etappe* Laboe → 54,62 N 10,30 E → Marstal (11:00 MEZ, 5 kn): Welle 0,1–0,3 m mit Richtung zum Kurs in sechs
  Spalten, am Ziel „kein Seegang im Modell“; Strom 0,1–0,3 kn („quer“ bei 0,3). 23 Dateien (12 × `f`, 11 × `uv`),
  **keine doppelt, keine abgebrochen**.
- Konsole: 0 Fehler, eine Warnung der Basiskarte (wie zuvor).

**Die fünf Fragen.**
1. *Funktionserhalt:* nichts entfernt, was jemand sieht. Entfernt ist das Nachfragen der Etappe (E-AM-25) — es ist
   nicht mehr erreichbar. Die Lader haben dieselben Signaturen und dieselben Antworten (`null` = keine Daten,
   `AbortError` = der Frager selbst hat abgebrochen).
2. *Desktop pixelgleich:* kein CSS, kein Markup berührt; **nicht per Pixelvergleich gemessen**.
3. *Touch-Ziele:* kein Bedienelement berührt.
4. *Konsole:* sauber (s. oben).
5. *Long Tasks:* **nicht gemessen**; neu ist ein Mikrotask je Abbruch.

**Nicht geprüft:** Mobil 390 px und Real-Device (der Code kennt keine Breite); das Pfeilfeld der Strömung und die
Ebene „Strömung“ im Browser (nur über K7 e); der Fall (a) im Browser am Stand VOR der Behebung (dort nur über K7).

### 10.5 Befunde

V-AM-18: **umgesetzt** (uncommitted).

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| **V-AM-26** | Dasselbe Muster steht in `waterLevelClient.ts`: `loadGaugeForecast` hält je Pegel ein laufendes Versprechen (`inFlight`), dessen Abruf am Signal des ersten Fragers hängt. Fragen Spot-Karte, Etappe (Pegel am Ziel) und Strand denselben Pegel und bricht der erste ab, endet der Abruf für alle. Aus dem Code gelesen, nicht nachgestellt | Die Pegelkurve fehlt dann bis zum nächsten Anlass. `sharedRead` aus `seaClient.ts` exportieren und dort verwenden (der TTL-Speicher bleibt davor); eigener Fall im Prüfer des Wasserstands |
| **V-AM-27** | Die Seite verschluckt an drei Stellen die Ablehnung eines Laders (`() => {}`) und setzt `fieldState` / `uvState` nur im Erfolgsfall zurück. Seit V-AM-18 lehnt ein Lader nur noch beim eigenen Abbruch ab — dann ist das richtig; ein künftiger Lader, der anders ablehnt, ließe „lädt“ wieder stehen | Im Ablehnungszweig bei nicht abgebrochenem Signal auf „Feld nicht ladbar“ setzen (drei Zeilen in `SeaPage.tsx`) |

## 11. Phase AM-O (19.11.): „Vor Ort“ im Aufbau der Etappe

Auftrag Jan 19.11.: Die Ansicht der Etappe (`amn-desktop-et-link.png`) gefällt deutlich besser als die, die „Ausfahrt
planen“ mit einem anderen Profil öffnet. Von zwei Wegen gewählt: **„Vor Ort“ bekommt den Aufbau der Etappe** — Eingabe
links, Stundenwerte am Kartenfuß, Befunde rechts.

### 11.1 Diagnose (vor dem Code)

Der Unterschied ist der Modus, nicht ein anderer Stil: `defaultTripMode` öffnet für Yacht und Motorboot „Etappe“, für
die fünf anderen Profile (Kite ist die Voreinstellung der Seite) „Vor Ort“.

| | Etappe | Vor Ort (heute) |
|---|---|---|
| Links | `EtappeInput`: Wer fährt, Art der Ausfahrt, Etappe (Start, Wegpunkte, Ziel, Fahrt), Abfahrt, Grenzen; die Ebenen klappen darunter | der Ebenen-Dock, unverändert |
| Kartenfuß | Tabelle „Entlang der Etappe“, Legende klappt darüber | Stundenband mit der Zeile „Fenster“, Legende klappt darüber |
| Rechts | `EtappeResult`: Kopf mit Strecke, Zeit, Profil; Karten, Befunde, amtlich, Hinweise | `SeaPlanPanel`: ALLES in einer Spalte — Kopf, Umschalter, amtliche Meldung, Profile, Grenzen, Fenster + Abspielen, Schiene Start → Rückkehr mit zwei Schrittschaltern, „Im ganzen Fenster“, Hinweise, Fuß |
| Ohne Spot | zwei Klicks auf die Karte | fragt nach dem Spot: rechts die Spotliste mit dem Kasten, links bleibt der Ebenen-Dock |

Der Kartenfuß stimmt also schon. Was abweicht: die Eingabe von „Vor Ort“ (Profil, Modus, Startort, Start und
Rückkehr, Abspielen, Grenzen) steht in der Befund-Spalte, und links steht etwas, das nicht zum Planer gehört. Wer von
„Etappe“ auf „Vor Ort“ schaltet, sieht deshalb den Umschalter die Seite wechseln.

**Was daran hängt.** `verify:sea-planner` H3/H4 (Schiene, amtliche Meldung über den Karten, Fuß), H5 (Einstiege), H10
(Klassen, Blatt nur mobil); `verify:sea-trip` J8 („Vor Ort“ ist der Planer der Phase SP plus Umschalter — dieser Satz
gilt danach nicht mehr und wird ersetzt). Mobil trägt das Blatt heute den ganzen Planer mit dem Stundenband darin.

### 11.2 Entscheidungen (gesetzt, Jan kann sie drehen)

| Nr. | Frage | Gesetzt |
|---|---|---|
| E-AM-25 | Was wandert nach links? | Alles, was man einstellt: Wer fährt, Art der Ausfahrt, Startort mit „Spot wechseln“, Start und Rückkehr mit ihren Schrittschaltern, die Länge des Fensters, „Fenster abspielen“, deine Grenzen; die Ebenen klappen darunter (umgruppiert wie bei der Etappe, nicht entfernt) |
| E-AM-26 | Was bleibt rechts? | Die Befunde, in ihrem eigenen Bild: die Schiene Start → Rückkehr mit den zwei Karten und den Befunden dazwischen, „Im ganzen Fenster“, die Hinweise (offen wie bisher, nicht eingeklappt), der Fuß. Der Kopf nennt wie bei der Etappe Ort, Zeit und Profil. Die Karten tragen keine Schrittschalter mehr (ein Bedienelement, ein Ort) |
| E-AM-27 | Amtliche Meldung „Bitte zuerst lesen“ | bleibt über allen Befunden: am Desktop oben in der rechten Spalte, mobil ganz oben im Blatt, vor der Eingabe |
| E-AM-28 | Ohne gewählten Spot | Die Eingabe steht schon links (Startort: „wählen“), rechts die Spotliste mit dem Kasten wie bisher — der Planer sieht vom ersten Klick an aus wie danach |
| E-AM-29 | Mobil | dieselbe Reihenfolge wie die Etappe im Blatt: Eingabe, Stundenband, Befunde. Kein eigener Aufbau fürs Telefon |

### 11.3 Plan

1. `SeaTripSwitch.tsx`: die Profil-Reihe „Wer fährt?“ als geteiltes Stück (die Etappe nutzt dasselbe).
2. `SeaPlanPanel.tsx`: `OrtInput` (neu) und der Planer als reine Befund-Spalte; `PlanOfficial` als eigenes Stück.
3. `SeaPage.tsx`: links die Eingabe, sobald „Vor Ort“ offen ist oder nach dem Spot fragt; mobil Eingabe, Band, Befunde.
4. `seaDeck.css`: zwei Regeln für die Zeilen mit Schrittschalter; `.sw-pl-bar` entfällt.
5. Prüfer: `verify:sea-planner` H3–H5, H10 und ein neuer H11 (Eingabe); `verify:sea-trip` J8 neu.
6. Gate: typecheck, beide Prüfer, die übrigen `verify:sea-*`, build, budget, Browser 1440 × 900 und 390 × 844, vorher/nachher.

### 11.4 Umsetzung (19.11.)

| Teil | Datei | Was |
|---|---|---|
| Geteilt | `src/sea/SeaTripSwitch.tsx` | `TripProfiles` („Wer fährt?“) neben dem Umschalter — dasselbe Stück für Etappe und Vor Ort |
| Eingabe | `src/sea/SeaPlanPanel.tsx` | `OrtInput` (neu): Wer fährt, Art der Ausfahrt, Kasten „Vor Ort“ (Startort, Start und Rückkehr mit Schrittschalter, Fenster), „Spot wechseln“, „Fenster abspielen“, Hinweis, deine Grenzen, darunter die Ebenen |
| Befunde | `src/sea/SeaPlanPanel.tsx` | `SeaPlanPanel` trägt nur noch Kopf (Ort, Zeit · Profil), amtliche Meldung, Schiene, „Im ganzen Fenster“, Hinweise, Fuß; `PlanOfficial` als eigenes Stück |
| Etappe | `src/sea/SeaTripPanels.tsx` | nutzt `TripProfiles` statt einer eigenen Kopie |
| Seite | `src/sea/SeaPage.tsx` | `ortInput` links, sobald „Vor Ort“ offen ist oder nach dem Spot fragt; `layersFold` für beide Eingaben; mobil amtlich → Eingabe → Stundenband → Befunde |
| Text | `src/sea/seaPlanner.ts` | `PLAN_INPUT_NOTE` |
| Stil | `src/sea/seaDeck.css` | `.sw-pl-when`, `.sw-pl-tools`; `.sw-pl-bar`, `.sw-pl-span-tx`, `.sw-pl-limits` entfallen (kein Markup mehr) |
| Prüfer | `scripts/verify-sea-planner.mjs`, `scripts/verify-sea-trip.mjs` | H3/H4 neu gefasst, H11, H11b, H12, H13 neu; J8 neu gefasst |

Gesehen und nachgebessert: der Knopf „Fenster abspielen“ verlor in der Zeile der Etappen-Werkzeuge seinen Rand
(`.sw-am-tools button` setzt ihn zurück) ⇒ eigene Zeile `.sw-pl-tools`.

### 11.5 Gate (19.11.)

| Prüfung | Ergebnis |
|---|---|
| `verify:sea-planner` | **50/50** (46 + H11, H11b, H12, H13). H11b ruft die Eingabe als Funktion und drückt die Schalter am Elementbaum: „Start später“ ⇒ `start +1`, „Rückkehr früher“ ⇒ `end −1` |
| `verify:sea-trip` | **70/70**; J8 vergleicht den Kopf beider Eingaben Zeichen für Zeichen (715 Zeichen gleich bis auf den gewählten Modus) |
| Mutationen | **23 von 23 bemerkt** (Umschalter in den Befunden, Kopf ohne Profil, amtliche Meldung fehlt / doppelt / mobil weg, Hinweise eingeklappt, Schalter am falschen Ende, Sperre vertauscht, Reihenfolge, fehlende Zeile, fehlende Grenzen, Ebenen entfernt, Eingabe fehlt beim Fragen, mobil Befunde zuerst, links bleibt der Dock, „Spot wechseln“ beim Fragen, CSS-Regel weg, Etappe beginnt anders) |
| übrige | `sea-wind-band` 41/41 · `-contract` 30/30 · `-current` 108/108 · `-ripples` 122/122 (im ersten Lauf 118/122, während die Riffel-Sitzung im selben Baum schrieb) · `-sight` 76/76 · `-tide-window` 49/49 · `-waterlevel` 63/63 · `-watertemp` 136/136 · `-dk` 70/70 · `-seo` 23/23 · `-text` 35/35 · `-decode` 13/13 · `fusion-release` 33/33 · `tour-result` 51/51 |
| `npm run typecheck` · `npm run build` · `npm run budget` | grün · grün · grün ohne Anhebung (totalJs 2 046,6 / 2 047; der Anteil dieser Phase ist NICHT isoliert gemessen — der Baum trägt daneben die Riffel-Linie) |

**Im Browser gesehen** (Vorschau des Builds über CDP mit `scripts/lib/cdpBrowser.mjs`, headless Chromium mit
Software-GL, Live-Daten 19.11. gegen 11 Uhr MEZ — der Playwright-Browser war von der Riffel-Sitzung belegt):
- Vorher / nachher am Desktop 1440 × 900, `/seewetter/laboe?p=kite&pl=…`: `amo-desktop-vor-ort-vorher.png`,
  `amo-desktop-vor-ort-nachher.png`. Links die Eingabe (318 px, ohne Rollen), Kasten „Startort Laboe · Start Do 13:00 ·
  Rückkehr Do 16:00 · Fenster 3 Stunden“; am Kartenfuß das Stundenband mit der Zeile „Fenster“; rechts „Laboe ·
  Do 13:00 bis Do 16:00 · Kite“, die Schiene, kein Schrittschalter und keine Profile mehr.
- Bedient: „Rückkehr eine Stunde später“ ⇒ Kasten 4 Stunden, Adresse `pl=…_2026111916_…`; „Fenster abspielen“ ⇒
  „Anhalten“; „Ebenen der Karte“ aufgeklappt ⇒ zehn Kacheln und Schalter; Etappe ⇒ Eingabe „Etappe“, zurück auf
  Vor Ort ⇒ Eingabe „Vor Ort“. Konsole ohne Fehler.
- Ohne Spot (`amo-desktop-vor-ort-fragt.png`): „Ausfahrt planen“ mit Profil Kite ⇒ links schon die Eingabe mit
  „Startort noch nicht gewählt“, rechts die Spotliste mit dem Kasten.
- Mobil 390 × 844 (`amo-mobil-390-vor-ort-nachher.png`): Blatt mit Eingabe, Stundenband, Befunden; kein Ziel unter
  44 px, nichts ragt seitwärts.

**Die fünf Fragen.**
1. *Funktionserhalt:* nichts entfernt, alles umgruppiert. Nach links gewandert: Profile, Umschalter, „Spot wechseln“,
   die zwei Schrittschalter, „Fenster abspielen“, deine Grenzen; die Ebenen klappen darunter (ein Klick mehr als
   bisher, wie bei der Etappe). Rechts geblieben: Schiene, Befunde, Hinweise (offen), Fuß. Die Zeile „Fenster: 3
   Stunden, Do 13:00 bis Do 16:00“ steht jetzt geteilt: „3 Stunden“ in der Eingabe, die Zeit im Kopf der Befunde.
   **Nicht einzeln im Browser abgehakt:** jeder Schalter im zugeklappten Block, „Spot wechseln“ bis zum neuen Spot.
2. *Desktop pixelgleich:* ohne offenen Planer rendert nichts Neues; **nicht gemessen**. Mit offenem „Vor Ort“ ist die
   Ansicht gewollt anders (Vorher-/Nachher-Bild).
3. *Touch-Ziele:* im Blatt gemessen, keines unter 44 px.
4. *Konsole:* 0 Fehler in den vier Läufen.
5. *Long Tasks:* **nicht gemessen** (im headless Chromium liefert der Beobachter nichts).

**Nicht geprüft:** das Boot ziehen, die Griffe im Stundenband ziehen, Real-Device, Tablet (bei 834 px mit Maus ist die
Karte durch die breitere linke Spalte noch 46 px schmaler als bisher — V-AM-6 gilt jetzt auch für „Vor Ort“), eine
amtliche Meldung mit Live-Daten (es lag keine vor; H4 und H13 prüfen Markup und Reihenfolge).

### 11.6 Befunde

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| **V-AM-28** | Mobil öffnet ein `pl=`-Link den Plan (das Boot steht), aber nicht das Blatt: der Reiter bleibt auf „Karte“, ein Tipp auf „Ausfahrt“ zeigt es. **Schon an HEAD so** (isolierter Build von `dd162736`, derselbe Lauf: alle 50 ms abgetastet, das Blatt war nie offen) — nicht von dieser Phase. Ursache nicht gefunden: der Link-Effekt setzt `mobTab` auf `plan`, etwas stellt es zurück | Ursache mit einer Protokollzeile im Dev-Build suchen; Verdacht: der Effekt, der `mobTab` bei geschlossenem Planer auf `map` zurückstellt, läuft im selben Durchlauf nach dem Link-Effekt |
| **V-AM-29** | Solange „Vor Ort“ nach dem Spot fragt, stehen die Profile zweimal auf der Seite: links in der Eingabe und rechts im Kasten „Mein Profil“ der Spotliste | Den Kasten „Mein Profil“ der Liste ruhen lassen, solange links die Eingabe steht |
| **V-AM-30** | Strand hat als einziger Modus keine Eingabe links: Fenster, Stundenleiste und Liste stehen zusammen rechts, links bleibt der Ebenen-Dock (E-AM-14) | Fenster und Reihenfolge nach links, die Liste rechts — erst mit Jans Wort, die Vorlage zeigt Strand nur mobil |
| **V-AM-31** | Die linke Spalte ist mit offenem „Vor Ort“ 318 statt 272 px breit; die Karte verliert 46 px, das Stundenband zeigt ohne Rollen eine Stunde weniger | Breite der Eingabe für „Vor Ort“ auf die des Docks setzen, wenn Jan die Karte wichtiger ist als gleiche Spalten |

## 12. Phase AM-S (19.11.): Strand im selben Aufbau (V-AM-30)

Auftrag Jan 19.11. („bitte angleichen“): nach „Vor Ort“ (§11) auch Strand — was man einstellt links, Stundenwerte am
Kartenfuß, was daraus folgt rechts.

### 12.1 Diagnose (vor dem Code)

`StrandPanel` trägt heute ALLES in der rechten Spalte: Kopf (Fenster, Zählsatz der gewählten Stunde), Umschalter,
Revier, zwei Schrittschalter (Beginn, Ende), die Stundenleiste (je Stunde „n/m“ Strände mit Wind von See, hell /
Dämm. / dunkel), Reihenfolge, Farbschlüssel der Spot-Marken, die Liste, Hinweise, Fuß. Links bleibt der Ebenen-Dock,
am Kartenfuß steht die Legende offen neben nichts (`sw-ov-right`), der Kartenrand unten ist 40 px.

Die drei Teile lassen sich ohne neue Rechnung trennen — die Seite reicht `strandWin`, `strandStrip`, `strandList`
schon getrennt hinein:

| Teil | Inhalt | künftig |
|---|---|---|
| Eingabe | Art der Ausfahrt, Revier, Beginn und Ende des Fensters, Länge, Reihenfolge | links (`StrandInput`), die Ebenen klappen darunter |
| Stundenwerte | die Stundenleiste, ihr Satz „Je Stunde …“, der Farbschlüssel der Spot-Marken | Kartenfuß (`StrandStrip`), die Legende klappt darüber wie bei Etappe und Vor Ort |
| Befunde | Kopf, die Liste der Strände, Hinweise, Fuß | rechts (`StrandPanel`) |

**Was daran hängt.** `verify:sea-trip` J7 (ein Stück mit allem — wird in drei Prüfungen geteilt), J12 (Klassen),
`verify:sea-planner` H13 (`layersFold` zweimal — wird dreimal). Mobil trägt das Blatt heute das eine Stück; die Regel
`.sw-pl-sheet.is-strand:not(.is-open) { max-height: 62dvh }` bleibt.

### 12.2 Entscheidungen (gesetzt, Jan kann sie drehen)

| Nr. | Frage | Gesetzt |
|---|---|---|
| E-AM-30 | „Wer fährt?“ im Strand | **nicht** in der Eingabe. Das Profil ändert an der Strand-Liste nichts (sie zählt Stunden mit Wind von See, keine Klasse); eine Auswahl ohne Wirkung sähe nach einer Wirkung aus. Die Eingabe beginnt deshalb mit „Art der Ausfahrt“ |
| E-AM-31 | Stundenleiste am Kartenfuß | im selben Kasten wie die Tabelle der Etappe, mit ihrem Satz und dem Farbschlüssel der Spot-Marken im Kopf (der Schlüssel erklärt die Karte, auf der der Kasten liegt) |
| E-AM-32 | Schrittschalter | Beginn und Ende als Zeilen des Kastens „Fenster“, dieselbe Zeichnung wie Start und Rückkehr bei „Vor Ort“ (ein geteiltes Stück); dazu die Länge in Stunden |
| E-AM-33 | Mobil | Eingabe, Stundenleiste, Liste — dieselbe Reihenfolge wie die zwei anderen Modi |

### 12.3 Plan

1. `SeaTripSwitch.tsx`: der Schrittschalter als geteiltes Stück (`TripStepper`). `SeaPlanPanel.tsx` nutzt ihn.
2. `SeaTripPanels.tsx`: `StrandInput`, `StrandStrip`, `StrandPanel` (nur noch Kopf, Liste, Hinweise, Fuß).
3. `SeaPage.tsx`: links die Eingabe, am Kartenfuß die Leiste mit eingeklappter Legende, Kartenrand unten; mobil die
   drei Stücke im Blatt.
4. `seaDeck.css`: `.sw-am-win` entfällt, der Kasten der Leiste.
5. Prüfer: `verify:sea-trip` J7 in J7a/b/c; `verify:sea-planner` H13.
6. Gate wie §11.

### 12.4 Umsetzung (19.11.)

| Teil | Datei | Was |
|---|---|---|
| Geteilt | `src/sea/SeaTripSwitch.tsx` | `TripStepper` (früher / später an einem Ende eines Fensters) — „Vor Ort“ und Strand nutzen dasselbe Stück |
| Strand | `src/sea/SeaTripPanels.tsx` | `StrandInput` (Art der Ausfahrt, Revier, Kasten „Fenster“ mit Beginn, Ende, Länge, Reihenfolge der Liste, darunter die Ebenen), `StrandStrip` (Kasten „Stunden des Fensters“ mit Satz und Farbschlüssel), `StrandPanel` (Kopf, Liste, Hinweise, Fuß) |
| Vor Ort | `src/sea/SeaPlanPanel.tsx` | nutzt `TripStepper` statt einer eigenen Kopie |
| Seite | `src/sea/SeaPage.tsx` | links `strandInput`, am Kartenfuß `strandStripBox` mit eingeklappter Legende, rechts die Liste; Kartenrand unten 40 → 210 px; mobil Eingabe → Stunden → Liste |
| Stil | `src/sea/seaDeck.css` | drei Regeln für Revier, Schlüssel und Leiste im Kasten; `.sw-am-win` entfällt |
| Prüfer | `scripts/verify-sea-trip.mjs`, `scripts/verify-sea-planner.mjs` | J7 → J7a (Eingabe, mit gedrückten Schaltern am Elementbaum), J7b (Stunden), J7c (Liste), J7d (Seite); H13 zählt die eingeklappten Ebenen dreimal |

### 12.5 Gate (19.11.)

| Prüfung | Ergebnis |
|---|---|
| `verify:sea-trip` | **73/73** (70 − J7 + J7a–d) |
| `verify:sea-planner` | 50/50 |
| Mutationen | **21 von 21 bemerkt** („Wer fährt?“ im Strand, Schalter am falschen Ende, Sperre vertauscht, Länge fehlt, Dänemark ohne dänische Spots, Reihenfolge nicht umkehrbar / falsch verdrahtet, Ebenen entfernt, leerer Kasten, Schlüssel fehlt, Fenster nicht markiert, Umschalter in der Liste, angeschnittenes Fenster verschwiegen, links bleibt der Dock, mobil Liste zuerst, Stunden fehlen am Kartenfuß, Kartenrand, Kasten ohne Lauf, Klasse ohne Regel, Name des Schalters) |
| übrige | `sea-wind-band` 41/41 · `-contract` 30/30 · `-current` 108/108 · `-ripples` 122/122 · `-sight` 76/76 · `-tide-window` 49/49 · `-waterlevel` 63/63 · `-watertemp` 136/136 · `-dk` 70/70 · `-seo` 23/23 · `-text` 35/35 · `-decode` 13/13 · `fusion-release` 33/33 · `tour-result` 51/51 |
| `npm run typecheck` · `npm run build` · `npm run budget` | grün · grün · grün ohne Anhebung (totalJs 2 046,7 / 2 047; Anteil nicht isoliert gemessen) |

**Im Browser gesehen** (Vorschau des Builds über CDP, headless Chromium, Live-Daten 19.11. gegen 12 Uhr MEZ):
- Desktop 1440 × 900, `/seewetter?sd=2026111916_2026111921`: vorher `ams-desktop-strand-vorher.png`, nachher
  `ams-desktop-strand-nachher.png`. Links „Art der Ausfahrt · Revier · Fenster · Reihenfolge der Liste“, Kasten „Beginn
  Do 17:00 · Ende Do 22:00 · Länge 6 Stunden“; am Kartenfuß der Kasten „Stunden des Fensters“ (632 × 131 px, acht
  Stunden), die Legende eingeklappt darüber; rechts „Do 17 bis 22 Uhr · 17 Uhr: Wind von See an 27 von 55 Stränden“
  und 64 Zeilen — ohne Umschalter, Schrittschalter oder Leiste.
- Bedient: „Ende eine Stunde später“ ⇒ Länge 7 Stunden, Adresse `sd=…_2026111922`, Kopf „Do 17 bis 23 Uhr“, neun
  Stunden im Kasten; „Wind vom Land zuerst“ ⇒ erste Zeile wechselt von Wangerooge auf Büsum; Stunde 18 im Kasten ⇒
  Kopf „18 Uhr: … 28 von 55“; Revier Ostsee ⇒ 39 Zeilen; „Ebenen der Karte“ aufgeklappt ⇒ zehn Kacheln und Schalter.
  Konsole ohne Fehler.
- Mobil 390 × 844 (`ams-mobil-390-strand-nachher.png`): Blatt mit Eingabe, Stunden, Liste; kein Ziel unter 44 px,
  nichts ragt seitwärts.

**Die fünf Fragen.**
1. *Funktionserhalt:* nichts entfernt. Umgruppiert: Umschalter, Revier, die zwei Schrittschalter und die Reihenfolge
   nach links; Stundenleiste und Farbschlüssel an den Kartenfuß; die Legende der Karte klappt dort ein (ein Klick, wie
   bei Etappe und Vor Ort); die Ebenen klappen unter die Eingabe. Neu sichtbar: Beginn und Ende als Uhrzeit und die
   Länge des Fensters.
2. *Desktop pixelgleich:* ohne offenen Planer rendert nichts Neues; **nicht gemessen**. Mit offenem Strand gewollt anders.
3. *Touch-Ziele:* im Blatt gemessen, keines unter 44 px.
4. *Konsole:* 0 Fehler.
5. *Long Tasks:* **nicht gemessen** (headless).

**Nicht geprüft:** Real-Device, Tablet, ein Fenster über Mitternacht im Browser (nur im Prüfer), Strand ohne gültigen
Lauf im Browser.

### 12.6 Befunde

V-AM-30: **umgesetzt.**

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| **V-AM-32** | Mobil zeigt das Blatt im Strand in Ruhe (62 % der Höhe) nur die Eingabe; die Liste, um die es geht, beginnt erst nach „Ganze Liste zeigen“ oder nach dem Rollen. Bei Etappe und Vor Ort ist es dasselbe | Mobil die Eingabe eingeklappt beginnen lassen (eine Zeile „Do 17 bis 22 Uhr · Alle · von See zuerst — ändern“), sobald ein Fenster steht — für alle drei Modi gleich, deshalb Jans Wort |
| **V-AM-33** | Der Kasten am Kartenfuß zeigt die Stunden des Fensters plus je eine davor und danach; bei einem Fenster von 24 Stunden rollt er seitwärts | Ab 14 Stunden die Zellen schmaler setzen |

## 13. Phase AM-W (19.11.): der Planer als Assistent, Schritt für Schritt

Auftrag Jan 19.11.: der Planer führt Seite für Seite durch die Planung statt alles in einer Ansicht zu zeigen; Vorbild
ist der Routenplaner (Aufbau, Schrittführung, Bedienung, Design). Schritt 1 = „Wer fährt?“ und „Art der Ausfahrt“.
Rechnung und Ergebnisse bleiben, wie sie sind; keine neuen Parameter; Links dürfen nicht brechen; der Planer bleibt
erkennbar keine amtliche Warnung. Das beantwortet zugleich V-AM-32 (mobil beginnt jedes Blatt mit der ganzen Eingabe).

### 13.1 Diagnose (vor dem Code)

**Routenplaner (Vorbild, gelesen: `RouteDeck.tsx`, `RoutePage.tsx`, `RouteResult.tsx`, `TourView.tsx`,
`MovementPicker.tsx`, `routeDeck.css`).** Vier Schritte „Strecke · Bewegungsart · Planung · Ergebnis“. Desktop: nummerierte
Kreise mit Namen (`rd-steps`: erledigt = Haken, laufend = Akzent), Dock links (was geplant wird) + Bühne; mobil eine
Leiste aus Strichen unter dem Kopf und „Schritt 2 von 4“ über dem Titel. Auswahl als Kacheln mit Haken (`rt-mvcard`),
eine Haupt-Aktion je Seite (`rd-cta`), Zurück im Kopf, im Ergebnis „Planung anpassen“. Der Schritt steht nicht in der
Adresse (die Strecke passt in keine), nur Bewegungsart, Start und Richtung.

**Ausfahrtsplaner heute (AM-O/AM-S, §11/§12).** Je Modus drei Stücke: Eingabe links (`OrtInput`, `EtappeInput`,
`StrandInput` — alles auf einmal), Stundenwerte am Kartenfuß, Befunde rechts; mobil alle drei untereinander in einem
Blatt. Parameter und was an ihnen hängt:

| Parameter | Wo gesetzt | Gilt für | Hängt ab von | Geht ein in |
|---|---|---|---|---|
| Profil „Wer fährt?“ (sieben: Kite, Wing/Surf, SUP/Kajak, Jolle, Yacht, Motorboot, Angeln) | Chips | Vor Ort, Etappe | — | Grenzen (Startwerte je Profil), Klassenfarbe, Modus beim Öffnen (Yacht/Motorboot ⇒ Etappe), Fahrt der Etappe beim Anlegen (5 / 12 / 4 kn) |
| Art der Ausfahrt | Umschalter | alle | — | welche Rechnung (`seaPlanner.ts` / `seaTrip.ts` Etappe / Strand) |
| Startort (Spot) | Liste rechts oder Karte | Vor Ort | Katalog | Stundenreihe, Uferwinkel, Radius des Boots |
| Boot | Karte (ziehen, ≤ 5 km) | Vor Ort | Spot | Rückkehrlinie, Wind zum Rückweg |
| Fenster Start → Rückkehr | Schrittschalter, zwei Griffe im Stundenband | Vor Ort | Vorhersage-Stunden | `planFindings` |
| Start, Ziel, Wegpunkte (≤ 12) | Karte | Etappe | — | `tripRoute`, Proben für buscosun Fusion |
| Fahrt (0,5–40 kn) | Zahlenfeld | Etappe | Profil (Startwert) | `tripTimeline` (Ankunft) |
| Abfahrt (± 1 h, Vergleich −2 h / gewählt / +2 h) | Knöpfe | Etappe | Strecke, Fahrt, Grenzen | `tripTimeline`, `tripCompare` |
| Grenzen (Wind ab/bis, Böen, Böenspanne, Welle, Windsee) | **nicht im Planer** — nur im Spot-Dock „Mein Profil“; der Planer zeigt sie als Satz | Vor Ort, Etappe | Profil | Klassen, „über deiner Grenze“ |
| Revier | Chips | Strand | Katalog (Dänemark nur mit dänischen Spots) | Liste |
| Fenster Beginn → Ende (≤ 24 h) | Schrittschalter | Strand | Vorhersage-Stunden | `strandRows` |
| Reihenfolge (von See / vom Land zuerst) | Umschalter | Strand | — | Sortierung |

Nicht relevant je Auswahl: im Strand das Profil und die Grenzen (E-AM-30: die Liste zählt Stunden mit Wind von See,
keine Klasse); bei „Vor Ort“ Fahrt und Abfahrt; bei der Etappe Spot-Radius und Fenster.

**Adresse heute.** `pl=` (Vor Ort), `et=` (Etappe, ab einem Punkt), `sd=` (Strand) öffnen den Planer im Modus; Profil
`p=`, Revier `rv=`, Stunde `t=`. Kein Schritt. „Vor Ort“ ohne Spot und eine Etappe ohne Punkt stehen gar nicht in der
Adresse.

**Was der Auftrag wörtlich nennt und der Bestand anders hat.** Die Aufzählung „Kite, Wing, Surf/SUP, Kajak, Jolle,
Yacht, Motorboot, Angeln“ sind acht Namen; der Code hat sieben Profile mit den Chips „Wing/Surf“ und „SUP/Kajak“
(Tabelle SW-6, mit je einem Grenzsatz). Ein achtes Profil wäre ein neuer Parameter mit neuen Grenzen ⇒ **nicht**
gebaut (E-AM-34), die sieben bleiben.

### 13.2 Konzept: die Schritte

Ein Assistent, dessen Schritte die Art der Ausfahrt bestimmt. Schritt 1 ist für alle gleich.

| Schritt | Vor Ort | Etappe | Strand |
|---|---|---|---|
| 1 Grundangaben | Wer fährt? · Art der Ausfahrt (drei Karten mit einem Satz) | dasselbe | dasselbe; Hinweis „das Profil zählt im Strand nicht“ |
| 2 Wo | **Startort**: Spot aus Liste oder Karte, Boot vor dem Spot ziehen | **Strecke**: Start, Ziel, Wegpunkte, umkehren, löschen; Strecke in sm | **Revier** und Reihenfolge der Liste |
| 3 Wann | **Zeitfenster**: Start, Rückkehr, Länge, abspielen; das Stundenband mit den zwei Griffen am Kartenfuß | **Fahrt und Abfahrt**: Fahrt in kn, Abfahrt ± 1 h, Dauer und Ankunft, „Abfahrt vergleichen“ | **Zeitfenster**: Beginn, Ende, Länge |
| 4 Grenzen | die Grenzen des Profils, änderbar (dieselben Felder wie im Spot-Dock) | dasselbe + Hinweis, was auf der Etappe gezählt wird | entfällt |
| letzter: Ergebnis | „Deine Angaben“ (je Zeile „ändern“ ⇒ der Schritt) · Stundenband · Befunde | „Deine Angaben“ · Tabelle „Entlang der Etappe“ · Befunde | „Deine Angaben“ · Stunden des Fensters · Liste |

Warum so: erst **wer und was** (bestimmt alle folgenden Seiten), dann **wo** (ohne Ort keine Stundenreihe, ohne
Strecke keine Ankunft), dann **wann** (braucht den Ort), dann **woran gemessen wird** (Grenzen — sie haben Startwerte,
deshalb zuletzt und nie ein Hindernis), dann das Ergebnis. „Abfahrt vergleichen“ steht bei der Abfahrt, weil es eine
Wahl der Abfahrt ist; es zählt mit den Grenzen, die gerade gelten.

Prüfung je Schritt, bevor „Weiter“ geht: Startort gewählt · Start **und** Ziel gesetzt · ein Fenster bzw. eine Ankunft
steht auf den Stunden der Vorhersage (sonst der Grund: lädt / kein gültiger Lauf) · „Wind ab“ nicht über „Wind bis“.
Die Leiste oben lässt zurück zu jedem erledigten Schritt und vor bis zum ersten, der noch etwas braucht.

### 13.3 Entscheidungen (gesetzt, Jan kann sie drehen)

| Nr. | Frage | Gesetzt |
|---|---|---|
| E-AM-34 | Acht Namen im Auftrag, sieben Profile im Code | die **sieben** bestehenden Profile mit ihren Namen. Kein neues Profil (neue Grenzen wären ein neuer Parameter) |
| E-AM-35 | Wo lebt der Assistent | in der Spalte neben der Karte (Desktop links, 344 px; mobil das Blatt über dem Kartenfuß) — **nicht** als eigene Seite wie der Routenplaner: Spot, Boot und Wegpunkte setzt man auf der Karte. Vom Routenplaner kommen Leiste, Kacheln, eine Haupt-Aktion je Seite, „Schritt n von m“ |
| E-AM-36 | Rechte Spalte während der Eingabe | ruht (die Karte wird breiter); sie kommt mit dem Ergebnis. Die Spot-Liste steht im Schritt „Startort“ selbst |
| E-AM-37 | Stundenwerte am Kartenfuß | nur, wo sie die Eingabe SIND (Vor Ort, Zeitfenster: die zwei Griffe) und im Ergebnis |
| E-AM-38 | Grenzen im Planer änderbar | ja, mit denselben Feldern und derselben Ablage wie im Spot-Dock (ein geteiltes Stück) — kein neuer Parameter, der Planer zeigte sie bisher nur als Satz |
| E-AM-39 | Schritt 1 im Strand trotz E-AM-30 | „Wer fährt?“ steht in Schritt 1 für alle (Jans Auftrag); ist Strand gewählt, sagt ein Satz, dass das Profil dort nichts ändert, und der Schritt „Grenzen“ entfällt |
| E-AM-40 | Adresse | `ps=<art>.<schritt>` (z. B. `ps=etappe.strecke`); das Ergebnis schreibt kein `ps` ⇒ **jeder alte Link (`pl=`, `et=`, `sd=`) öffnet wie bisher auf den Befunden**. Ein Link auf einen Schritt, dem noch etwas fehlt, landet auf dem ersten Schritt, der es braucht. Ersetzt, nicht gestapelt (wie der übrige Zustand der Seite) |
| E-AM-41 | Angaben behalten | Vor und Zurück ändern nichts. Neu: auch der Wechsel der Art in Schritt 1 und zurück behält das Fenster von „Vor Ort“ und das Strand-Fenster (bisher nur die Etappe) |
| E-AM-42 | Karte in Schritt 1 | die gewählte Art zeigt sich sofort auf der Karte (wie heute der Umschalter); Wegpunkte setzt ein Klick aber nur im Schritt „Strecke“ |
| E-AM-43 | Kein amtliches Produkt | ein fester Satz im Fuß des Assistenten auf **jeder** Seite; die Befunde behalten ihren Fuß „Amtliche Warnungen gehen vor.“ und die amtliche Meldung im Wortlaut |

### 13.4 Plan

1. `seaSteps.ts` (rein): Schritte je Art, Namen, Prüfung je Schritt, `ps` lesen/schreiben, Texte.
2. `SeaWizard.tsx`: Rahmen (Leiste, Titel, Zurück/Weiter, Fuß), „Deine Angaben“, Schritt „Grenzen“; `SeaTripSwitch.tsx`
   wird Schritt 1 (Kacheln, Karten); `SeaPlanPanel.tsx` / `SeaTripPanels.tsx`: die Eingaben in Schritte geteilt.
3. `SeaDock.tsx`: die Grenzen-Felder als geteiltes Stück, die Spot-Liste ohne Profil (`show: 'spots'`).
4. `SeaPage.tsx`: Schritt-Zustand, Verdrahtung, Kartenfuß und rechte Spalte je Schritt, `ps`.
5. `seaDeck.css`: `sw-wz-*`; mobil in der letzten Media Query.
6. Prüfer: `verify:sea-planner`, `verify:sea-trip` an den neuen Aufbau, neuer `verify:sea-wizard`.
7. Gate: typecheck, build, budget, Browser Desktop + mobil, alle 7 × 3 Kombinationen.

### 13.5 Umsetzung (19.11.)

| Teil | Datei | Was |
|---|---|---|
| Schrittlogik (rein) | `src/sea/seaSteps.ts` (neu) | `WIZ_STEPS` je Art, Namen/Überschrift/Satz je Seite, `wizBlock` (warum „Weiter“ noch nicht geht), `wizCoreBlock` + `wizClamp` (nur Spot bzw. Start und Ziel schicken je zurück), `wizReach` (Reichweite der Leiste), `parseWizParam` / `encodeWizParam`, die Texte (Fuß-Satz, Strand-Hinweis, Gründe). Rechnet nichts |
| Rahmen | `src/sea/SeaWizard.tsx` (neu) | `SeaWizard` (Kopf mit Schließen, Leiste aus nummerierten Kreisen, „Schritt n von m“, Überschrift, Satz, die Seite, Fuß mit Grund, Zurück \| Weiter und dem Satz E-AM-43), `WerStep` (Schritt 1), `LimitsStep`, `WizSummary` („Deine Angaben“, mobil eingeklappt). Der Fokus geht beim Seitenwechsel auf die Überschrift, wenn er im Assistenten war |
| Schritt 1 | `src/sea/SeaTripSwitch.tsx` | „Wer fährt?“ als sieben Kacheln, „Art der Ausfahrt“ als drei Karten mit Zeichen und Satz (statt Chips und Umschalter); `TripStepper` unverändert |
| Vor Ort | `src/sea/SeaPlanPanel.tsx` | `OrtInput` geteilt in `OrtSpotStep` (Startort, Boot, Liste bzw. Knopf) und `OrtTimeStep` (Start, Rückkehr, Länge, abspielen); die Befunde tragen ihren Schließen-Knopf nur noch mit `onClose` |
| Etappe, Strand | `src/sea/SeaTripPanels.tsx` | `EtappeInput` → `EtappeRouteStep` + `EtappeTimeStep` (neu sichtbar: Abfahrt und Ankunft als Uhrzeit); `StrandInput` → `StrandRevierStep` (mit der Zahl der Spots) + `StrandTimeStep`; Befunde wie oben |
| Dock | `src/sea/SeaDock.tsx` | `SeaLimitsEditor` als geteiltes Stück (Dock und Schritt „Grenzen“, dasselbe Markup wie bisher), `show: 'spots'` = Suche, Revier, Spots ohne Profil |
| Seite | `src/sea/SeaPage.tsx` | `wizStep` / `linkPs`, `wizOpen`, `wizMode`, `step` (über `wizClamp`), `footKind`, `wizGo`, `wizPickMode`, `wizProfile`; `planKeep` / `strandKeep` (E-AM-41); links der Assistent, rechts die Befunde nur im Ergebnis, Kartenfuß und Kartenrand je Seite; mobil der Assistent im Blatt; ein Kartenklick setzt Wegpunkte nur auf „Strecke“; „Vor Ort“ ohne Spot öffnet mobil nicht mehr das Blatt „Spot“, sondern Schritt 1; das Blatt „Spot“ heißt während der Frage „Startort wählen“ und zeigt nur die Spots |
| Adresse | `src/sea/seaState.ts` | `ps` (`SEA_PS_RE`), hinter `sd`, vor `wt` |
| Texte | `src/sea/seaTrip.ts` | die Sätze zu Etappe und Strand im Bau des Satzes zu „Vor Ort“ |
| Stil | `src/sea/seaDeck.css` | Abschnitt „Phase AM-W“ (`sw-wz-*`, Spalte 344 px, ≤ 1439 px 324 px), mobil in der letzten Media Query (Leiste und Schließen in einer Zeile; Karten-Seiten 46 %, Formular-Seiten und Ergebnis 66 % der Höhe); die Regeln der drei alten Eingaben (`sw-am-in`, `-mode`, `-modeseg`, `-sec`, `-limits`, `sw-pl-sheetbody`) entfallen |
| Prüfer | `scripts/verify-sea-wizard.mjs` (neu, in `package.json` und `ci.yml`), `verify-sea-planner.mjs` (H3, H11, H11b, H12, H13, H10), `verify-sea-trip.mjs` (J6, J7a, J7d, J8, J11, J12) | die alten Prüfungen hingen an „eine Eingabe je Modus“ und sind auf die Seiten umgestellt |
| Budget | `budget.json` | totalJs 2 047 → 2 051 (gemessen +3,9 KB gzip, Lazy-Chunks), von Hand mit Notiz |

**Nicht angefasst:** `seaPlanner.ts` (Rechnung), `seaTrip.ts` bis auf zwei Sätze, `useSeaTrip.ts`, `seaTripData.ts`,
`SeaMap.tsx`, `SeaBand.tsx`, die Befunde selbst (Schiene, Tabelle, Liste), Dossier, Dock ohne offenen Planer.

### 13.6 Gate (19.11.)

| Prüfung | Ergebnis |
|---|---|
| `verify:sea-wizard` (neu) | **28/28** — Schritte je Art, Prüfung je Schritt, Reichweite, `wizClamp`; `ps` (elf Werte, alte Links Zeichen für Zeichen unverändert, Gegenprobe); Rahmen, „Deine Angaben“, „Grenzen“ ohne Browser; Schritt 1 in allen 21 Kombinationen; Verdrahtung der Seite; CSS und Worte |
| `verify:sea-planner` | **50/50** (H3, H11, H11b, H12, H13 auf die Seiten umgestellt) |
| `verify:sea-trip` | **73/73** (J6, J7a, J7d, J8, J11, J12 umgestellt) |
| Mutationen | **23 von 23 bemerkt** (Strand mit „Grenzen“, Startort hält nie, Ergebnis schreibt `ps`, fehlende Stundenwerte schicken zurück, `ps` vor `sd`, Fuß-Satz fehlt, Weiter trotz Grund, Leiste hinter der Reichweite frei, „ändern“ führt immer auf Seite 1, Strand-Satz fehlt, Motor-Hinweis bei „Vor Ort“, Klick setzt überall Wegpunkte, Planer öffnet auf dem Ergebnis, Fenster wird nicht gemerkt, `ps` fehlt in der Adresse, rechte Spalte bleibt während der Eingabe, Klasse ohne Regel, Satz von „Vor Ort“ geändert, Kachel vertauscht, Schrittschalter vertauscht, Boot ohne Spot, Fahrt auf der Seite „Strecke“, Reihenfolge falsch verdrahtet). Der erste Lauf übersah eine (rechte Spalte) — E5 prüft sie jetzt |
| übrige Seewetter-Prüfer | `-wind-band` 41/41 · `-contract` 30/30 · `-current` 108/108 · `-ripples` 122/122 · `-sight` 76/76 · `-tide-window` 49/49 · `-waterlevel` 63/63 · `-watertemp` 136/136 · `-dk` 70/70 · `-seo` 23/23 · `-text` 35/35 · `-decode` 13/13 |
| `npm run typecheck` · `npm run build` | grün · grün (SEO-/Routing-Prüfung des Builds 281/281) |
| `npm run budget` | grün nach Anhebung von Hand: totalJs **2 050,6 / 2 051** (vorher 2 046,7 / 2 047; +3,9 KB gzip, Lazy-Chunks); eagerJs 114,9 / 115, eagerCss 2,4 / 2,5, largestChunk unverändert |
| nicht gelaufen | `verify:sea-ui` (Browser-Prüfer, schon an HEAD rot — V-TF-5) |

**Im Browser** (Vorschau des Builds, `vite preview`, Playwright-Chromium, Live-Daten 19.11. gegen 13–15 Uhr MEZ):

- **Alle 7 × 3 Kombinationen, Desktop 1440 × 900 und mobil 390 × 844** (`.playwright-mcp/walk.js`, je Kombination: Planer
  öffnen, Profil und Art wählen, Seite für Seite „Weiter“ bis zum Ergebnis, schließen): **21 von 21 an beiden Größen**.
  Geprüft je Kombination: die Folge der Überschriften (Vor Ort: Grundangaben › Startort › Zeitfenster › Deine Grenzen ›
  Ergebnis; Etappe: … › Strecke › Fahrt und Abfahrt › …; Strand: Grundangaben › Revier › Zeitfenster › Ergebnis), der
  Fuß-Satz auf jeder Seite, im Ergebnis die Befunde der Art, die Stundenwerte (Stundenband / Tabelle / Stunden des
  Fensters), „Deine Angaben“ mit dem gewählten Profil und der Art (vier Zeilen, Strand drei), die Adresse mit `pl=` /
  `et=` / `sd=` und ohne `ps`. Auf „Strecke“ hält der Assistent, bis ein Kartenklick das Ziel setzt. Konsole: keine
  Fehler der Seite (jsDelivr-403 der Punkt-Kacheln wie an HEAD, V-FI-5).
  Am Desktop brauchte der Lauf zwei Anläufe für „Kite“: der Kartenhinweis lag über dem Knopf (V-AM-34, Testlauf, nicht
  der Assistent).
- **Links** (`.playwright-mcp/links.js`, 13 Fälle, Desktop): `pl=` ohne `ps` ⇒ Ergebnis „St. Peter-Ording“, Adresse
  unverändert, vier Haken · `et=` ⇒ Ergebnis „Start → Ziel“ · `sd=` ⇒ Ergebnis (beide schreiben wie an HEAD die Stunde
  `t=` dazu) · `ps=etappe.strecke` ohne Punkt ⇒ Etappe auf „Strecke“, hält mit „Setze Start und Ziel auf der Karte.“ ·
  `/seewetter/laboe?ps=ort.zeit` ⇒ „Zeitfenster“, der Plan wird angelegt · `/seewetter?ps=ort.zeit` ohne Spot ⇒
  „Startort“, hält, Adresse `ps=ort.ort` · `et=` mit einem Punkt ⇒ „Strecke“, „Setze noch das Ziel“ · `pl=…&ps=etappe.zeit`
  (andere Art) ⇒ der Plan gewinnt, Ergebnis · `ps=kaputt` fällt aus der Adresse, kein Planer.
- **Vor und Zurück:** Link auf „Grenzen“ ⇒ Zurück ⇒ „Rückkehr eine Stunde später“ (3 → 4 Stunden) ⇒ Zurück auf
  „Startort“ ⇒ Weiter: weiter 4 Stunden; der Fokus steht nach „Weiter“ auf der Überschrift. „Wind bis“ 10 unter „Wind
  ab“ 15 ⇒ Weiter gesperrt mit dem Grund; „Startwerte wiederherstellen“ gibt frei. Ergebnis zeigt „4 Stunden“;
  „Fenster ändern“ ⇒ „Zeitfenster“; Schritt 5 der Leiste ⇒ Ergebnis.
- **Wechsel der Art** (Dev-Server): Vor Ort → Etappe → Strand → Vor Ort → Etappe: Fenster und Boot (`pl=` Zeichen für
  Zeichen), die Etappe mit beiden Punkten kommen wieder (E-AM-41).
- **Mobil gemessen:** im Blatt kein Ziel unter 44 px, nichts ragt seitwärts (Ergebnis-Seite „Vor Ort“ und die Seiten
  der Bildfolge).
- **Bilder** `audit/seewetter-ausfahrt/amw-desktop-*.png` und `amw-mobil-390-*.png`: `1-grundangaben`,
  `2-startort-haelt` (ohne Spot), `2-startort`, `3-zeitfenster`, `4-grenzen`, `5-ergebnis`, `etappe-2-strecke-haelt`,
  `etappe-3-fahrt-abfahrt`, `etappe-5-ergebnis`, `strand-1-grundangaben`, `strand-2-revier`, `strand-4-ergebnis`.

**Die fünf Fragen.**
1. *Funktionserhalt:* nichts entfernt, alles umgruppiert — Profile, Art der Ausfahrt, Startort mit Spot-Wechsel, Boot,
   Fenster mit Schrittschaltern und den zwei Griffen, abspielen, Wegpunkte setzen / löschen / umkehren, Fahrt, Abfahrt
   ± 1 h, Abfahrt vergleichen, Revier, Strand-Fenster, Reihenfolge, die Ebenen der Karte (klappen unter jede Seite), die
   drei Befunde, die amtliche Meldung, alle Hinweise, die Links. Die drei Komponenten `OrtInput`, `EtappeInput`,
   `StrandInput` gibt es nicht mehr — ihr Inhalt steht Zeile für Zeile in den Seiten. Neu sichtbar: die Grenzen im
   Planer änderbar (bisher nur im Spot-Dock), Abfahrt und Ankunft als Uhrzeit, die Zahl der Spots im Revier, das Boot
   als Entfernung. **Geändert im Verhalten:** ein Kartenklick setzt Wegpunkte nur noch auf der Seite „Strecke“ (E-AM-42);
   während der Eingabe ruht die rechte Spalte (Spot-Liste und „Mein Profil“ sind dann über Schritt 1/2 bzw. nach dem
   Schließen erreichbar); „Vor Ort“ ohne Spot öffnet mobil Schritt 1 statt des Blatts „Spot“.
2. *Desktop pixelgleich:* ohne offenen Planer rendert dieselbe Seite — der Dock nutzt dasselbe Markup der Grenzen
   (jetzt als geteiltes Stück); **nicht per Pixelvergleich gemessen**. Mit offenem Planer gewollt anders.
3. *Touch-Ziele:* im Blatt gemessen, keines unter 44 px.
4. *Konsole:* keine Fehler der Seite.
5. *Long Tasks:* **nicht gemessen** (der Test-Browser zeichnet ≈ 1 Bild/s).

**Nicht geprüft:** Real-Device; Tablet (834 px mit Maus); das Boot und die Punkte ZIEHEN (nur Klicks); die zwei Griffe
im Stundenband ziehen; ein Lauf ohne gültige Vorhersage im Browser (der Grund auf „Zeitfenster“ ist nur im Prüfer
belegt); Browser-Zurück über mehrere Spots mit offenem Assistenten; Screenreader.

### 13.7 Befunde

V-AM-32 (mobil beginnt jedes Blatt mit der ganzen Eingabe): **erledigt** — das Ergebnis trägt die Eingabe als eine
eingeklappte Zeile „Deine Angaben“, die Befunde stehen direkt darunter.
V-AM-29 (Profile doppelt, solange nach dem Spot gefragt wird): **erledigt** — das Blatt „Startort wählen“ zeigt nur die Spots.

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| **V-AM-34** | Der Kartenhinweis „Karte erkunden“ liegt bis zum ersten Klick über dem Knopf „Ausfahrt planen“ (schon an HEAD; im Testlauf aufgefallen): der erste Klick auf den Knopf schließt nur den Hinweis | Ein Klick weniger bis zum Planer: den Hinweis über `sw-ov-right` aussparen oder den Klick durchreichen |
| **V-AM-35** | Der Schritt steht in der Adresse, aber Browser-Zurück geht nicht Seite für Seite (E-AM-40: ersetzt wie der übrige Zustand der Seite) | Wer „Zurück“ am Telefon gewohnt ist, verlässt den Spot statt des Schritts. Skizze: Seitenwechsel als `pushState` — berührt den Wrapper `SeaRoute.tsx` (einziger Schreiber), deshalb Jans Wort |
| **V-AM-36** | Die Kacheln „Wer fährt?“ tragen nur den Namen; der Routenplaner zeigt je Bewegungsart ein Zeichen | Schnelleres Wiederfinden. Sieben Zeichen im Strich der Rail zeichnen (Kite, Wing, SUP, Jolle, Yacht, Motorboot, Angel) |
| **V-AM-37** | Der Auftrag nennt acht Namen (Wing und Surf/SUP und Kajak getrennt), der Code sieben Profile (E-AM-34) | Soll es acht geben, braucht jedes neue Profil eigene Startgrenzen (Tabelle SW-6) — Jans Wort |
| **V-AM-38** | Am Desktop passt Schritt 1 bei 900 px Höhe ohne Rollen; darunter (z. B. 768 px) rollt die Seite, Kopf und Fuß bleiben stehen | Auf kleinen Laptops die Karten der Art enger setzen oder den Satz der Grenzen einklappen |
| **V-AM-39** | Auf „Startort“ steht mobil nur der Knopf „Spot wählen“; die Liste ist ein eigenes Blatt (das bestehende „Spot“ der unteren Leiste) | Ein Blattwechsel weniger, wenn die Suche direkt auf der Seite stünde; die Liste mit 64 Spots passt aber nicht in das niedrige Blatt über der Karte |
