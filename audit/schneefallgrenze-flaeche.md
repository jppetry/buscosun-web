# Phase SK — Schneefallgrenze als Fläche im Gelände (Regenradar)

> Auftrag 09.10.2026. Stand: **Diagnose** (kein Code). Erst Bestand, dann Messung, welche Schneefallgrenze in 0–48 h
> räumlich besser ist, dann ob die eingebauten Kartenmittel ohne neuen Shader reichen. Entscheidungen E-SK-* = Jans Gate.
> buscosun Fusion wird nur genutzt, nicht verändert.

## 0 Kurzfassung

- **Vorhanden und funktionsfähig:** die Schneefallgrenze als **Linie** (Wetterkarten-Logik, ICON-D2-T2m + Gelände +
  ML #2, 0–24 h) auf der Regenradar-Karte; das **Fusion-Kartenfeld** der Schneefallgrenze mit Spanne
  (`point/field/v1/…/snowlmt-LLL.png`, t1 0–48 h stündlich, t2 51–120 h dreistündlich) — **gebaut, aber ohne Leser im
  Client**; am Ort liefert buscosun Fusion je Stunde `vars.snowline` (p10/p50/p90) und `vars.pSnow` (Phase aus der
  Feuchttemperatur); MapLibre-Gelände mit Schummerung gibt es in Routen-3D, Event-Gelände, 3D-Wetter und Thermik.
- **Fehlt:** Band/Spanne auf der Karte, Schneekappe als Fläche, jede 3D-Ansicht im Regenradar („Karte + 3D", „3D"),
  Schummerung in der Regenradar-Karte, ein Leser für das `snowlmt`-Feld, der Satz „Schnee bis zu dir …" am Ort, Antippen
  eines Hangs mit Schnee/Schneeregen/Regen.
- **Messung (24 Archivtage, 358 Stationen in DE/AT/CH, 28 306 Stunden nahe der Grenze):** das **Fusion-Feld ist in allen
  drei Vorlauf-Fenstern besser** als die Wetterkarten-Methode — HSS 0,67/0,69/0,66 gegen 0,60/0,51/0,53 (0–6/7–24/25–48 h),
  Bootstrap-Intervall der Differenz schließt 0 aus; die Spanne trägt Information (Brier 0,06–0,08 gegen 0,08–0,09 ohne
  Spanne). Die Wetterkarten-Linie endet ohnehin bei +24 h und hat keine Spanne. Einschränkungen in §2.4 (Proxy-Wahrheit,
  Herbst, Ersatzeingang für die Wetterkarten-Methode).
- **Kartenmittel:** reichen **ohne neuen Shader**, wenn die Kappe auf der CPU (Worker) als Bild gerechnet wird
  (Gelände-Höhe gegen Feld-Grenze je Pixel) und als `image`-Quelle liegt — in 2D wie auf dem Gelände in 3D. Die eingebaute
  Höhenfärbung `color-relief` (MapLibre 5.24) kennt nur **eine** Höhe für die ganze Karte und taugt nicht. 3D als **eigene
  Bühne** (zweite Karte nach dem Muster Routen-3D); Gelände in der bestehenden Karte würde die eigenen WebGL-Layer
  (Radar, Wind) verschieben ⇒ Shader-Eingriff ⇒ nicht vorgeschlagen.
- **Vorschlag:** Fläche + Linie + Band aus dem Fusion-Feld, hinter `?sk=1` (aus), Rückfall = heutige Linie; Satz am Ort aus
  der vollen buscosun Fusion. Offene Entscheidungen E-SK-1…7 (§5).

## 1 Bestand (gelesen am Arbeitsbaum, HEAD `e2c3a2c`)

| Baustein | Stand | Ort |
|---|---|---|
| Schneefallgrenze als Linie (Regenradar = Wetterkarte) | **vorhanden**: Feld `T2m(ICON-D2, 2,2 km) + 6,5 K/km·(hsurf − DEM) − T50`, Null-Linie per Marching Squares auf ≈ 2,5 km, MapLibre-`line` (weißer Rand 4,5 px + `#1f4fd0` 2 px); T50 = +1 °C + ML-#2-Ortskorrektur (±1,5 K) | `src/scalar/snowLine.ts:74`, `src/ml/climaField.ts:157`, `src/MapView.tsx:1617` |
| Zeitbezug der Linie | folgt dem Slider (nächstes Frame, keine Interpolation), **nur 0–24 h** (`MAX_STEP = 24`); danach bleibt das +24-h-Frame stehen | `src/sources/iconD2TempSource.ts:43`, `src/sources/frameAtValidTime.ts:66` |
| Kosten der Linie | **≈ 5 s Hauptthread** beim Einschalten (V-RR-15, geerbt) | `audit/regenradar-datenangleich.md` §5 |
| Unsicherheitsband auf der Karte | **fehlt** (nur eine Linie) | — |
| Fusion-Feld Schneefallgrenze | **gebaut, ohne Leser**: R Mitte/25 m, G halbe Breite (p10…p90, 1,2816 σ), B Herkunft (σ_ens/σ_div), A 0/255; t1 0,05° 0–48 h stündlich, t2 0,10° 51–120 h 3-stündlich, **t3 ohne** (keine Quelle); Gebiet lon 5,5–17,5 / lat 45,5–55,5 | `src/point/fieldFormat.ts:160–200`, `scripts/point/build-point-fields.mjs:113` |
| Leser-Muster für Felder | vorhanden (Chance, Summen): `chanceField.ts`, `fieldCum.ts`, Konturen `precipChance/contours.ts`, Zeichnung ohne Shader `chanceMapLayer.ts` | `src/precipChance/*`, `src/precipSums/*` |
| Schneefallgrenze am Ort | **vorhanden**: `vars.snowline` p10/p50/p90 je Stunde (= Cube-Wert der Zelle, `fromCell`), `vars.pSnow` (Phase aus Feuchttemperatur, volle Kette mit Station), `phaseLabel` 0,25/0,75 ⇒ Regen/Schneeregen/Schnee | `fusion/output.ts:284,381`, `fusion/meteo.ts:85–126` |
| Anzeige am Ort heute | Kennzahl „Schneegrenze" (Mittel über die Stunden), `AlpineCard`, Punkt-Streifen-Chip — **kein** Satz „Schnee bis zu dir" | `NowcastDeck.tsx:533`, `alpineSplit.ts:113`, `PointStrip.tsx:71` |
| 3D-Ansicht im Regenradar | **fehlt** — Deck kennt nur „Karte \| Diagramm"; „Karte + 3D / 3D" nur in Konzept (`niederschlagsplattform-konzept.md` §4/§7) und Vorlage `reference/regenradar2-desktop.dc.html` | `NowcastDeck.tsx:125` |
| Gelände + Schummerung | vorhanden in **vier** anderen Karten (Terrarium `raster-dem`, `setTerrain` 1,3, `hillshade`), je als Kopie, kein geteiltes Modul; **nicht** in `MapView` | `route3d/RouteTerrainMap.tsx:191`, `event/EventTerrainMap.tsx:156`, `threed/TerrainMap.tsx:84`, `atmosphere/ThermalMap.tsx:69` |
| Ebene `snow` | ICON-D2 Schneedecke/Neuschnee (liegender Schnee) — **nicht** Schneefall, bleibt unberührt | `src/sources/iconD2Snow.ts` |
| Mobiler Reiter „Jetzt" | heißt im Code **„Schnellblick"** (`glance`) — dorthin gehört der Satz | `NowcastDeck.tsx:696` |
| Kartenzeit über +3 h | Slider −2 … +2/3 h; die 48-h-Leiste von Phase RC (hinter `?rc=1`) setzt die Kartenzeit bis +48 h | `audit/regenchance.md` E-RC-1 |

## 2 Messung: welche Schneefallgrenze ist in 0–48 h räumlich besser?

### 2.1 Aufbau

Skript `audit/schneefallgrenze-flaeche/snowline-compare.mjs` (nur lesend, ≈ 4 min), Ergebnis `…/ergebnis.json`.
Daten: Punktarchiv `C:\dev\buscosun-archiv`, 24 Slots 14.09.–07.10., je Slot der t1-Lauf mit 49 Vorläufen an den
Archivpunkten (405, ab 05.10. 2 069), Wahrheit aus den folgenden Slots (DWD-POI, TAWES, SwissMetNet, stündlich).

- **F — Fusion-Feld:** Cube-`snowlmt` der Zelle mit σ_ens vor σ_div — genau der Wert, den der Feld-Producer schreibt
  (`fieldValuesFromResult`: Cube-Sample der Zelle). Schnee an der Station, wenn Stationshöhe ≥ Mitte; Wahrscheinlichkeit
  Φ((h − Mitte)/σ).
- **W — Wetterkarten-Methode:** T2m auf die Stationshöhe mit 6,5 K/km, Schnee wenn ≤ T50 (`ClimaField.snowT50`, dieselbe
  ML-#2-Korrektur wie die Karte). **Ersatzeingang:** T2m und Modellhöhe aus dem Cube t1 (ICON-D2 ist nicht archiviert,
  DWD hält nur 24 h vor) ⇒ gemessen ist die **Methode**, nicht das ICON-D2-Bild selbst. `Wp` = wie die Karte heute jenseits
  +24 h (stehendes +24-h-Frame).
- **Wahrheit (Proxy):** Feuchttemperatur aus T, Td, Stationsdruck (POI ohne Stationsdruck: Standardatmosphäre);
  Schnee wenn T_w ≤ 1,0 °C (Empfindlichkeit 0,5 / 1,5 °C). Gegenprobe mit der Trockentemperatur T ≤ 1 °C — die begünstigt
  W per Definition. Gewertet nur Stunden mit T_w im Fenster Schwelle ± 4 K (sonst sind beide trivial richtig).
- Intervall: Block-Bootstrap über die Lauftage (400 Ziehungen, 95 %).

### 2.2 Ergebnis (T_w ≤ 1,0 °C, alle Stunden)

| Vorlauf | n | Trefferquote F / W | HSS F / W / Wp | Δ HSS (F − W), 95 % | Brier F (mit Spanne) / W |
|---|---|---|---|---|---|
| 0–6 h | 5 947 | 0,923 / 0,894 | **0,674** / 0,602 / 0,602 | +0,02 … +0,15 | **0,063** / 0,106 |
| 7–24 h | 9 036 | 0,908 / 0,863 | **0,689** / 0,508 / 0,508 | +0,15 … +0,22 | **0,076** / 0,137 |
| 25–48 h | 13 323 | 0,911 / 0,875 | **0,661** / 0,533 / 0,544 | +0,09 … +0,17 | **0,072** / 0,125 |

- Je Land (HSS F/W, 7–24 h): DE 0,74/0,66, AT 0,65/0,49, CH 0,70/0,47 — F überall vorn.
- Empfindlichkeit: bei T_w ≤ 0,5 und ≤ 1,5 °C dasselbe Bild (F 0,60–0,70, W 0,47–0,61; einzig 0–6 h bei 1,5 °C gleichauf
  0,62/0,61).
- Nur Stunden mit Niederschlag (≥ 0,1 mm): 94/189/207 Fälle, fast nur AT/CH — F 0,70/0,79/0,74 gegen W 0,72/0,59/0,58;
  0–6 h gleichauf, sonst F vorn (Intervall berührt 0).
- Gegenprobe Trockentemperatur (begünstigt W): F 0,51/0,47/0,49 gegen W 0,41/0,50/0,46 — W nur bei 7–24 h knapp vorn.
- Die Spanne trägt Information: F als 0/1 hätte Brier ≈ 0,077/0,092/0,089, mit Spanne 0,063/0,076/0,072.
- σ der Spanne an den Stationen: p10 27 m, p50 169 m, p90 649 m (V-NP0-15: σ_div enthält Auflösungsunterschiede).
- Bias F < 1 bei T_w ≤ 1,0 (0,65–0,82): die Feld-Grenze liegt eher am T_w ≈ 0,5 °C — passt zu `PHASE_TW50_C` 0,6.

### 2.3 Räumliche Auflösung

Die Kappe entsteht in beiden Fällen aus **Geländehöhe gegen Grenzhöhe**; das scharfe Muster liefert das Gelände (Terrarium,
z7–z11), nicht die Grenze. Die Grenzhöhe selbst ist glatt: das Fusion-Feld (0,05° ≈ 3,7 × 5,6 km) genügt dafür, die
2,5-km-Linie der Wetterkarte hat keinen Auflösungsvorteil, der die Messung umdrehen würde.

### 2.4 Einschränkungen (ehrlich)

1. Keine beobachtete Niederschlagsart, sondern ein Feuchttemperatur-Proxy; echte Phasenbeobachtung (DWD-Stundenwerte
   `WRTR`, SWIS-Niederschlagsart der Straßenstationen) gibt es im Herbst kaum an Stationen nahe der Grenze ⇒ Wiederholung
   im Winter (V-SK-1).
2. W mit Cube-T2m statt ICON-D2-Bild; Stationshöhe statt Gipfel-erhaltender DEM-Zelle.
3. Herbst: die relevanten Stationen liegen hoch (p10 396 m, p50 1 709 m, p90 2 960 m); Tieflagen-Schneefall ist nicht
   vertreten.
4. Nur t1 (0–48 h); t2 (51–120 h) nicht gemessen.

### 2.5 Vorschlag aus der Messung

Auf der Fläche das **Fusion-Feld** (t1 0–48 h, t2 51–120 h), mit Spanne. Die Wetterkarten-Linie bleibt auf der Wetterkarte
unverändert und im Regenradar als Rückfall (`?sk=0`) erreichbar. Nebenwirkung: der 5-s-Block (V-RR-15) entfällt im
Regenradar, weil das Feld fertig gerechnet ankommt.

## 3 Reichen die eingebauten Kartenmittel ohne neuen Shader?

| Teil | Mittel | Shader nötig? |
|---|---|---|
| Kappe (Gelände ≥ p50, Deckkraft nach Niederschlag) | Bild je Zeitschritt auf der CPU im Worker: DEM-Kacheln (Terrarium, vorhanden über `loadElevationTiles`/`demGrid.ts`) gegen Feld-Grenze bilinear; MapLibre-`image`-Quelle + `raster`-Layer | nein |
| Band p10…p90 fein schraffiert | in dasselbe Bild auf Bildschirmmaßstab eingerechnet (neu je `moveend`), oder Konturflächen mit `fill-pattern` wie Regenchance | nein |
| Linie p50 Blau mit weißem Rand + Beschriftung | Marching Squares auf (DEM − p50) im Worker ⇒ `line` ×2 + `symbol` mit Linienplatzierung | nein |
| Höhenfärbung `color-relief` | nur **eine** Farbrampe über die Höhe für die ganze Karte — eine örtlich wechselnde Grenze ist damit nicht abbildbar | (taugt nicht) |
| 3D: gekipptes Gelände + Schummerung | zweite Karte: `raster-dem` + `setTerrain` (1,3) + `hillshade` (Muster Routen-3D/Event); Bild, Linie, Schraffur legen sich als normale Layer auf das Gelände | nein |
| 3D in der bestehenden Karte (`MapView`) | Gelände würde die eigenen 2D-WebGL-Layer (Radar `RainLayer`, Wind, Zellen) neben das Gelände zeichnen | **ja ⇒ nicht vorgeschlagen** |
| Antippen eines Hangs (Höhe, Grenze, Phase) | `queryTerrainElevation` bzw. DEM-Abfrage + Feldwert am Punkt; Phase aus Φ((h − p50)/σ) mit den Schwellen von `phaseLabel` | nein |

Aufwand je Zeitschritt (Schätzung, zu messen): Bild ≈ 1 Mio. Pixel × wenige Rechenschritte im Worker ≈ 10–30 ms auf
Desktop; das DEM ist ohnehin geladen. Real-Device-Messung bleibt Pflicht (Gate).

## 4 Vorschlag (Plan in Grundzügen, nach E-SK-*)

1. **Leser** `snowlmt` (Muster `chanceField.ts`): Index, Lauf, Stufe t1/t2, Dekodierung `decodeSnowPixel`, Lücke = A 0.
2. **Kappen-Rechner** im Worker: Kappe, Band, Linie aus DEM + Feld (+ Niederschlag, E-SK-3); rein und headless prüfbar.
3. **2D-Ebene** in `MapView` nur im Profil `radar`, Ebene „Schneefallgrenze" hinter `?sk=1` (aus; `?sk=0`/ohne = heutige
   Linie); Legende mit Etikett „buscosun Fusion ‹n› · Modell · Cube · Lauf HH UTC" und „Spanne der Modelle, unkalibriert".
4. **3D-Bühne** (E-SK-4): Ansicht „Karte | Karte + 3D | 3D" im Deck, zweite Karte mit Gelände, Schummerung, Kappe, Linie,
   Band, Ortsmarke; folgt Ausschnitt und Zeit; geteiltes Gelände-Modul aus dem Routen-3D-Muster (nur ergänzt).
5. **Satz am Ort** im Readout (mobil Schnellblick) aus der vollen buscosun Fusion (E-SK-5).
6. **Hinweise ohne Daten:** außerhalb des Feldgebiets, Zelle ohne Wert, jenseits +120 h (t3 ohne Schneefallgrenze), Feld
   des Laufs fehlt (V-RC-2) ⇒ keine Tönung, Satz in der Legende.
7. Verifier `verify:snowcap` (Feld-Rundlauf, Kappe an Prüfzellen gegen Rechnung, Negativkontrollen, Verdrahtung),
   Pixel-Diff ohne Schalter = HEAD, Budget, Browser Desktop + Mobil, Real-Device = Jans Gate.

## 5 Entscheidungen (Jan)

| Nr. | Frage | Empfehlung |
|---|---|---|
| E-SK-1 | Quelle der Fläche | Fusion-Feld (§2.5); Wetterkarten-Linie als Rückfall `?sk=0`, Wetterkarte selbst unverändert |
| E-SK-2 | Zeitbereich der Fläche | Slider (−2 … +3 h) **und** Kartenzeit bis +48 h über eine kleine Stundenleiste am Ort (Muster RC); t2 bis +120 h erst mit der Zeitachse NP-1 |
| E-SK-3 | „Wo es niederschlägt, kräftiger": woraus? | im Radarbereich das Radar zur Slider-Zeit, sonst die Regenchance des Fusion-Felds (dieselbe Lauf-Stunde); trocken = angedeutet |
| E-SK-4 | 3D | eigene Bühne (zweite Karte), Radar dort zunächst **nicht** (bräuchte Shader); mobil „3D" als ganze Ansicht statt geteilt, Hauptkarte ruht dabei (Muster Dashboard `suspended`) |
| E-SK-5 | Grundlage des Satzes am Ort | `pSnow` der vollen buscosun Fusion (Station, Gelände, Feuchte am Ort): „ab" = erste Stunde P ≥ 0,5, Spanne = erste Stunde P ≥ 0,1 … P ≥ 0,9; Grenzzahlen im Satz aus `vars.snowline`. Hinweis: die Schneefallgrenze der Fusion am Ort ist derselbe Cube-Wert wie das Feld — der Mehrwert am Ort liegt in `pSnow` |
| E-SK-6 | Satz bei Trockenheit | nennt die Regenchance mit („… · Niederschlag dann 20 %"); „Bei dir bleibt es Regen" nur, wenn in 48 h jede nasse Stunde P(Schnee) < 0,1 hat, sonst „Kein Schnee bei dir bis …" |
| E-SK-7 | Flag | `?sk=1` (aus); Einschalten nach Gate = Jans Wort |

**Jans Entscheidungen 09.10.2026:** E-SK-1 Fusion-Feld (Rückfall `?sk=0`) · E-SK-2 Slider + 48-h-Leiste · E-SK-3 Radar, sonst
Fusion-Feld · E-SK-4 eigene 3D-Bühne (ohne Radar in 3D, mobil ganze Ansicht) · E-SK-5 Satz aus `pSnow` der vollen
buscosun Fusion · E-SK-6 Regenchance mitnennen · E-SK-7 hinter `?sk=1`, aus — je die Empfehlung.

**Nachtrag 09.10. (Jan, nach Abgleich mit den parallelen Linien HZS und ZT):**
- **E-SK-5 ersetzt:** kein zweiter Satz. SK zeigt `snowSentence` aus `src/nowcast/heightTime/heightTimeModel.ts` (Phase HZS,
  E-HZS-6: Grenze p10/p50/p90 gegen die Ortshöhe, Zusatz „— aber kaum Niederschlag") im Readout und im Schnellblick und
  ergänzt nur, was fehlt: „Bei dir bleibt es Regen", wenn die Grenze im Fenster sicher über dem Ort bleibt (p10 > Ortshöhe
  an jedem Schritt) und Niederschlag erwartet wird, und die Regenchance als Zahl. Die Ergänzung liegt in SK, `snowSentence`
  bleibt unverändert.
- **E-SK-4 ersetzt:** keine eigene 3D-Bühne. Phase ZT baut die Hülle (`src/nowcast/cellTowers/TowerStage.tsx`, `?z3d=1`,
  „Karte | Karte + 3D | 3D", Reiter „3D") und meldet die 3D-Karte über `onTowerStageReady(map)`; SK liefert die Schneekappe
  als Ebenen-Modul für jede MapLibre-Karte (2D jetzt, 3D über den Haken, unter den Zelltürmen: `beforeId` `zt-tracks`).
  Antippen eines Hangs in 3D über dasselbe Modul.

## 4a Entwurf nach den Entscheidungen (zur Durchsicht durch Jan, vor dem ersten Code)

**Bausteine** (je eine Aufgabe, rein prüfbar, wo möglich ohne DOM):

| Baustein | Datei (neu, falls nicht genannt) | Aufgabe | hängt ab von |
|---|---|---|---|
| Feld-Leser | `src/snowCap/snowField.ts` | Index → jüngster Lauf je Stufe (t1, t2) → `snowlmt-LLL.png` zur Stunde dekodieren (`decodeSnowPixel`), Gitter + Lauf + Stand von buscosun Fusion aus dem Manifest; Lücke = A 0 | `fieldFormat.ts` (nur gelesen) |
| Kappen-Rechner | `src/snowCap/capRaster.ts` (+ Worker `capWorker.ts`) | je Bildpixel: Höhe (DEM) gegen Feld-Grenze bilinear ⇒ Kappe (h ≥ p50), Band (p10 ≤ h ≤ p90, Schraffur in Bildschirmmaßstab), Deckkraft aus Niederschlag; Linie p50 als Marching Squares auf (DEM − p50) mit Beschriftungspunkten (p50, p10–p90, auf 50 m gerundet) | Feld, DEM, Niederschlagsquelle |
| Niederschlagsquelle | `src/snowCap/capPrecip.ts` | zur Kartenzeit: im Radarbereich das Radarbild der Slider-Zeit (Komposit, vorhanden), sonst Feld-Chance t1 (`chanceField.ts`), Quelle als Etikett | Radar-Stack, `chanceField.ts` |
| 2D-Ebene | `src/snowCap/snowCapLayer.ts`, Einbindung in `MapView.tsx` nur im Profil `radar` und nur mit `?sk=1` | `image`-Quelle + `raster` (Kappe/Band), `line` weißer Rand + `line` Schneefallgrenzen-Blau `--np-snowline` `#4F5FB8`, `symbol` Beschriftung; dezent (Kappe weiß, Deckkraft trocken ≈ 0,15 / nass bis ≈ 0,5, am Gerät abzustimmen); ohne Schalter läuft die heutige Linie unverändert | Rechner |
| 3D-Bühne | `src/snowCap/SnowCap3D.tsx`, gemeinsames Gelände-Setup `src/map/terrainSetup.ts` (neu, nur von der Bühne genutzt — Bestand unberührt) | zweite MapLibre-Karte, Positron, Terrarium `raster-dem` + `setTerrain` 1,3 + `hillshade` (Sand/Ink wie Routen-3D), dieselben Kappe/Band/Linie/Beschriftung; folgt Mitte, Zoom und Zeit der Hauptkarte; Antippen ⇒ Kärtchen „Höhe 1 820 m · Grenze 1 400 m (1 200–1 650) · Schnee" (Phase aus Φ((h − p50)/σ), Schwellen von `phaseLabel`) | Rechner |
| Ansicht | `NowcastDeck.tsx` (Topbar/Deck), nur mit `?sk=1` | Desktop „Karte \| Karte + 3D \| 3D" (geteilt 50 : 50), mobil Reiter-Eintrag „3D" als ganze Ansicht; Hauptkarte bei „3D" `suspended` (Muster Dashboard) | Bühne |
| Satz am Ort | `src/snowCap/snowArrival.ts` (rein) + Karte `SnowArrivalCard.tsx` im Readout und im Schnellblick | aus der vollen buscosun Fusion am Ort (vorhandene Abfrage, 50 h): `pSnow` je Stunde ⇒ „Schnee bis zu dir (650 m) ab Do 03:00, zwischen 23:00 und 07:00 · Niederschlag dann 60 %" bzw. „Bei dir bleibt es Regen" / „Kein Schnee bei dir bis …"; Vermerk „buscosun Fusion ‹n›" aus dem Register | `usePointChance`-Muster, `fusionRelease.ts` |
| 48-h-Leiste | im Readout der Schneefallgrenze, Muster RC (`onTimeChange`/`onUserTime`) | Klick setzt die Kartenzeit bis +48 h, Slider-Marke „außerhalb"; die Fläche folgt Slider oder Leiste | RC-Melder (vorhanden) |
| Lücken | Legende + Kartenhinweis | kein Feld / außerhalb des Gebiets / Zelle ohne Wert / jenseits +48 h ⇒ keine Tönung, Satz „Schneefallgrenze hier ohne Daten (…)" | Leser |

**Datenfluss:** Kartenzeit (Slider oder Leiste) → Feld-Leser (Stunde t1) → Worker (DEM des Ausschnitts + Feld +
Niederschlag) → Bild + Linie + Beschriftung → 2D-Ebene und, wenn offen, 3D-Bühne (gleiche Daten, ein Rechenlauf).

**Fehler:** jeder Abruf mit Frist und Rückfall auf „ohne Daten" (nie die alte Linie stillschweigend unterschieben);
Konsolenmeldung mit Grund.

**Prüfung (Gate):** `verify:snowcap` (Feld-Rundlauf am echten Lauf, Kappe/Band/Linie an Prüfpixeln gegen Rechnung mit
Negativkontrolle, Satz-Regeln an konstruierten Reihen, Verdrahtung `?sk`), Pixel-Diff ohne Schalter = HEAD
(`regenradar-wk-pixeldiff.mjs`), Rechenzeit je Zeitschritt Desktop/mobil, Browser Desktop 1440 × 900 + iPhone 12 Pro,
`typecheck`, `build`, `budget`, die fünf Selbstprüfungsfragen; Real-Device = Jans Gate. buscosun Fusion: `git diff
src/pointForecast` leer.

## 6 Befunde

- **V-SK-1** Phasenmessung mit echter Niederschlagsart im Winter wiederholen (DWD `WRTR`, SWIS-Archiv `road/v1`), Regel
  vorab einfrieren. Mehrwert: belegt, dass die Kappe bei echtem Schneefall stimmt, nicht nur am Proxy.
- **V-SK-2** Die Wetterkarten-Linie zeigt jenseits +24 h still das +24-h-Frame (kein Hinweis). Mehrwert: keine stillen
  Altwerte. Skizze: Hinweis oder Ausblenden jenseits des letzten Frames (Wetterkarte, eigene kleine Phase).
- **V-SK-3** Feld-Bias: die Feld-Grenze entspricht eher T_w ≈ 0,5 °C. Mehrwert: Kappe an der richtigen Höhe. Skizze: in
  der Winterwiederholung (V-SK-1) mitschätzen, Producer-Seite, Fusion-Gate.
- **V-SK-4** Gelände-Setup (DEM, Terrain, Schummerung) steht viermal kopiert. Mehrwert: ein Ort für Terrarium-URL und
  Stil. Skizze: geteiltes Modul, nur für neue Nutzer, Bestand unberührt.

## 7 Umsetzung (09.10.2026, uncommitted, hinter `?sk=1`)

Plan: `docs/superpowers/plans/2026-10-09-schneefallgrenze-flaeche.md` (10 Aufgaben), Ledger mit allen Abweichungen
`audit/schneefallgrenze-flaeche/ledger.md`. buscosun Fusion, Feldvertrag und `MapView.tsx`
unverändert; HZS-Dateien unverändert (nur `snowSentence` & Co. gelesen); an der ZT-Bühne nur `onStageReady={…}`.

| Datei (neu) | Inhalt |
|---|---|
| `src/snowCap/snowCapModel.ts` | importfrei: Schalter `?sk=1`, Konstanten (`set`), P(Schnee in der Höhe) aus dem Band, Beschriftung „Schneefallgrenze 1 400 m (1 200–1 650 m)“, Radar-Gewicht |
| `src/snowCap/snowPhase.ts` | Phase in der Höhe mit `phaseLabel` von buscosun Fusion (0,25/0,75 ⇒ Regen/Schneeregen/Schnee) |
| `src/snowCap/snowField.ts` | Leser `snowlmt-LLL.png` (t1 ±30 min, dann t2 ±90 min), Dekodierung (A = 0 ⇒ Lücke), bilinear |
| `src/snowCap/capRaster.ts` | Bild in Mercator-Zeilen: Kappe ab p50 (Deckkraft trocken 0,16 … nass 0,55), Band p10…p90 schraffiert, Lücke durchsichtig; Linie p50 als Kontur (Bild- und Lückenrand abgeschnitten), Beschriftung als Punkte auf den drei längsten Linienzügen; in 8-ms-Scheiben |
| `src/snowCap/capWet.ts` | Nässe je Feldzelle: Radar des Landes zur Kartenzeit, sonst Regenchance des Felds |
| `src/snowCap/snowCapView.ts` | Ausschnitt (Feldgebiet, ≤ 6° × 4° bei gekippter 3D-Karte, ≤ 1024/640 px), DEM-Zoom ≤ 11 / ≤ 30 Kacheln |
| `src/snowCap/snowCapLayer.ts` | MapLibre-Ebenen `sk-*`/`sk3-*` (image + raster, line ×2, symbol), Tipp-Karte 3D |
| `src/snowCap/snowCapEngine.ts` | Lazy-Chunk (7,0 KB gz): Feld + Nässe je Zeit, DEM + Bild je Ausschnitt, Hover-/Tipp-Text |
| `src/snowCap/useSnowCap.ts` | Hook je Karte (2D und ZT-Bühne), neu bei Zeit (5-min-Schlüssel) und `moveend` |
| `src/snowCap/snowArrival.ts`, `useSnowArrival.ts`, `SnowArrivalPanel.tsx` | Satz am Ort = `snowSentence` (HZS) + „Bei dir bleibt es Regen“ / „Kein Schnee bei dir bis …“, Ortshöhe, Niederschlag dann x %; 48-h-Leiste (mobil 3-h-Zellen 44 × 44 px, waagerecht scrollbar) setzt die Kartenzeit; Lazy-Chunk (3,3 KB gz) |
| `src/snowCap/SnowCapUi.tsx`, `snowCap.css` | Legende (Desktop in der Radar-Legende, mobil Status-Hinweis), Tipp-Karte |
| `scripts/verify-snowcap.mjs` (`verify:snowcap`, CI), `scripts/sk-probe.mjs` | Verifier A–G (+ L live); Browser-Sonde (CDP) |

Additiv geändert: `NowcastRadarMap.tsx` (Prop `snowCap`, alte Linie nur mit Schalter aus der Profil-Liste, zwei Hooks,
Hover, Tipp-Effekt auf der ZT-Bühne, Legende), `NowcastDeck.tsx` (Schalter, `skPickMs`, ZT-Bühnenkarte über
`onStageReady`, Satz-Karte im Readout und Schnellblick, Kartenprops), `package.json`, `ci.yml`, `budget.json`.

### 7.1 Gates

| Prüfung | Ergebnis |
|---|---|
| `verify:snowcap` | **56/56** (A Modell 6 · B Feld 6 · C Bild 11 · D Nässe 4 · E Ansicht 7 · F Satz 7 · G Verdrahtung 15); `--live` **59/59**: echtes t1-Feld `2026100912` (buscosun Fusion 9) 48 441/48 441 Zellen, Pixelwerte exakt; echtes Terrarium Inntal z10: 1 208 Pixel, 0 falsch; Linie im Median 18 m an der Grenzhöhe |
| Nachbarn | `verify:height-time` 58/58, `verify:cell-towers` 59/59, `verify:regenchance` 44/44, `verify:rain-window` 63/63, `verify:cell-places` 60/60, `verify:fusion-release` 28/28, `verify:regenradar-profile` 24 ✓ / 1 ⊘, `verify:dashboard` 80/80 |
| typecheck / Build / Budget | 0 / grün / eagerJs 109,3 unverändert, totalJs 1 691,9 / **1 693** (angehoben mit Notiz: SK ≈ +12 KB, davon 10,3 KB lazy) |
| Browser (`sk-probe.mjs`, Dev-Server, Innsbruck) | Desktop 1440 × 900 „Karte + 3D“: Kappe + Linie + Beschriftung 2D und 3D, Legende „buscosun Fusion 9 · Modell · Cube · Lauf 12 UTC · gültig …“, Hover „Höhe 3 060 m · Schneefallgrenze 2 800 m (2 600–3 000 m) · Schnee“, 3D-Antippen „Höhe 2 648 m · Schneefallgrenze 2 550 m (2 400–2 650 m) · Schnee“, Leiste +24 h ändert die Gültigkeit, Feld-Index blockiert ⇒ „nicht verfügbar“ ohne Tönung, ohne Schalter 0 `sk`-Elemente und die ICON-D2-Linie wie vorher; mobil 390 × 844: Satz im Schnellblick, Zellen 44 × 44; Konsole 0 Fehler/Warnungen. Bilder `schneefallgrenze-flaeche/sk-*.png` |
| Bauzeit je Bild | Dev-Browser 480 × 520: 83–163 ms (kalt bis 780), 3D 481 × 785: 172–735 ms (kalt 1 407); in 8-ms-Scheiben, keine Long Task aus der Rechnung — Real-Device = Jan |

Zwei Fehler fand erst der Browser (beide mit Prüfung RED → GREEN behoben): Absturz beim Wechsel auf „Karte + 3D“
(`towerStage(…)` las `skOn` vor der Deklaration, G4b) und Kappe ÜBER dem Radar (Custom-Layer fehlen in `getStyle()`, G2c).

### 7.2 Die fünf Selbstprüfungsfragen

1. **Funktionserhalt:** nichts entfernt; ohne `?sk=1` bleibt die ICON-D2-Linie samt Notiz (Sonde „Ohne Schalter“); mit
   Schalter ersetzt die Fläche sie nur im Regenradar, die Wetterkarte ist unberührt.
2. **Desktop pixelgleich ohne Schalter:** alle SK-Pfade hängen an `snowCap`/`skOn`; Sonde ohne Schalter: 0 `sk`-Elemente,
   alte Linie sichtbar. Ein Pixel-Diff gegen HEAD ist im geteilten Arbeitsbaum nicht aussagekräftig (ZT ist seit 09.10.
   voreingestellt an) — Ruling im Ledger; nach dem Aufteilen der Commits nachholen.
3. **Touch ≥ 44 px:** mobile Leistenzellen 44 × 44, „Karte folgt wieder dem Slider“ min. 44 px hoch.
4. **Konsole sauber:** 0 Fehler/Warnungen (Desktop, ohne Feld, ohne Schalter, mobil).
5. **Long Tasks:** headless nicht messbar; Rechnung in Scheiben (s. Bauzeit). Real-Device (Jan).

### 7.3 Neue Befunde

- **V-SK-5** Beim ersten Aufruf lädt die Engine die Radar-Stapel aller drei Länder (≈ 1–3 s), bis dahin steht
  „Schneefallgrenze lädt …“. Skizze: zuerst ohne Nässe zeichnen, Nässe nachreichen.
- **V-SK-6** Die Kontur im Hochgebirge ist sehr verwinkelt (2D z8–9) — am Gerät prüfen, ob eine geglättete Linie
  (gröberes Raster) besser lesbar ist; die Kappe selbst bleibt fein.
- **V-SK-7** Dock-Untertitel „Schneefallgrenze“ nennt mit `?sk=1` nicht, dass die Ebene jetzt Fläche + Spanne aus
  buscosun Fusion ist (mobiles Layer-Panel, eigener Prop durch fremde Zeilen — ausgelassen).

### 7.4 Abschluss-Review (frischer Reviewer, 11 Befunde)

Behoben, je mit Prüfung RED → GREEN: (1) gekippte 3D-Bühne schnitt den Ausschnitt um die Mitte der Bounds statt um den
Blickpunkt — Vordergrund ohne Kappe (E6); (2) flache 2D-Karte beim Rauszoomen auf eine 6° × 4°-Box geschnitten (E7);
(3) nach einem Fehler blieb die alte Stunde stehen (G7); (4) beim Abspielen verhungerte die Rechnung (Abbruch je 5-min-Schritt) —
jetzt zusammengefasst, PNG asynchron, 2D ruht hinter „3D“ (G7/G8); (5) Zugriff auf die entfernte 3D-Karte (Konsolenwarnung
beim Verlassen von 3D, G8, Sonde Konsole 0); (8) Kappe auf der alten Karte bei `?rr=legacy`/Chunk-Rückfall (G2d); (11) eine
fremde HEAD-Zeile versehentlich verändert (G2e). Offen als kleine Befunde: Linienzüge am Ring-Anfang geteilt (V-SK-8),
Hinweistext für Rückblick-Zeiten vor dem jüngsten Lauf (V-SK-9), Satz am Ort rollt nicht stündlich weiter (V-SK-10),
Schraffur 2 px statt 1,4 (V-SK-11).
