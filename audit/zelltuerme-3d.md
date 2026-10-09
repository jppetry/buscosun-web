# audit/zelltuerme-3d.md — Diagnose: 3D-Ansicht „Zelltürme auf Gelände" im Regenradar (Phase ZT)

> Stand: 2026-10-09. Auftrag Jan 09.10.: Gewitterzellen der Zellvorhersage als Türme auf dem echten Gelände,
> Umschalter „Karte | Karte + 3D | 3D", mobil eigener Reiter. **Diagnose vor Code** (CLAUDE.md, Harte Regeln).
> Konzeptvorlage: `audit/niederschlagsplattform-konzept.md` §4/§7 (NP-4), `reference/regenradar2-desktop.dc.html`.
> Diagnose ohne Code (Spike nur im Scratchpad, Kopie in `audit/zelltuerme-3d/`); **Umsetzung 09.10. nach Jans Freigabe:
> §6b, Gates §7** (uncommitted). **Eingeschaltet 09.10. (Jan: „du kannst das featur einschalten“): voreingestellt an,
> `?z3d=0` = Regenradar wie vor ZT** (§7b).

## 0. Kurzfassung für Jan

- **Gebaut ist davon nichts.** Es gibt keine 3D-Ansicht im Regenradar, kein `fill-extrusion` in `src/`, keine
  Kamera-Kopplung zweier Karten und keine geteilte Bühne. Der Commit `e2c3a2c` „Update 3D" enthält ZO/RC, keine Türme.
- **Vorhanden und wiederverwendbar:** vier Geländekarten (Terrarium-DEM, Überhöhung 1,3, Schummerung in Sand-Tönen,
  „⤢"-Knopf), am besten passt `EventTerrainMap.tsx`; die Zelldaten (`Konrad3dCell`) mit Umriss, Echobasis/-top,
  dBZ max, Hagelzahlen, Blitzrate und 12 Prognosepunkten mit Ellipsen; die fertige 2D-Geometrie der Bahnen und
  Ellipsen (`buildCellFeatures`); der Zell-Steckbrief im Readout (`CellPlacesCard`) mit Zellauswahl; der
  Reiter-Mechanismus des Mobil-Blatts; die Abdeckungsregel `inKonradReach` (150 km um die 17 DWD-Radare).
- **Eingebaute 3D-Mittel reichen, kein neuer Shader** (§3, am Spike geprüft): `setTerrain` + `hillshade` +
  `fill-extrusion` + gedrapte `fill`/`line`/`image`-Ebenen. Zwei Fallen mit Lösung: Kachelnaht (Quelle mit
  `maxzoom: 7`) und Bezug der Extrusionshöhe (über Grund am Schwerpunkt).
- **Was fehlt** (§5): Lader für vergangene Zell-Läufe (V-RR-12), Trend, Hagelkern-Geometrie, Radarbild als Bild
  statt Custom-Layer, Echobasis im Steckbrief, Kamera-Kopplung, Umschalter, Reiter, Legende.
- **Zehn Entscheidungen** E-ZT-1…10 (§6), jeweils mit Empfehlung.

## 1. Was schon da ist

| Baustein | Ort | Zustand | Nutzen für ZT |
|---|---|---|---|
| Geländekarte mit Schummerung | `src/event/EventTerrainMap.tsx:128-183` | Terrarium `raster-dem` (tileSize 256, maxzoom 14), `setTerrain` ×1,3 (`TERRAIN_EXAGGERATION`, :67), `hillshade` 0,45 Schatten `#4A4234` / Akzent `#6B5A45`, Himmel, „⤢" 44 × 44 (:331), `fitToZone` mit Pitch 64 | Vorlage für die 3D-Bühne (eigene Instanz, Muster kopieren mit Herkunftskommentar wie ET) |
| Weitere Geländekarten | `src/threed/TerrainMap.tsx`, `src/route/route3d/RouteTerrainMap.tsx`, `src/atmosphere/ThermalMap.tsx` | je eigene Kopie, Basiskarte liberty | — |
| Gedraptes Bild auf Gelände | `src/atmosphere/ThermalMap.tsx:117-132` | CPU-RGBA → `image`-Quelle + `raster`-Ebene, `updateImage` | Muster für das Radarbild auf dem Relief |
| Zelldaten | `src/radar/konrad3d.ts:30-103`, `src/sources/dwdKonrad3d.ts:148` | jüngster Lauf (cells.json aus dem Daten-Repo, Rückfall XML), Hauptthread, 60-s-Cache, Abruf alle 5 min | Türme: `hull`, `echoBottomM`/`echoTopM` (m ü. NN), `dbzMax`, `hailFlag`/`hailAreaKm2`/`hailEchoTopM`/`hailVolumeKm3`, `lightningRate`, `vil`, `forecast[12]` mit Ellipsen |
| Zell-Geometrie 2D | `src/radar/cellPolygons.ts:556-682` | Umriss, Bahn, Trichter, Ellipsen je Vorlauf, Pfeil, Zeitmarken | Bahn + Ellipsen auf dem Gelände **unverändert** wiederverwenden |
| Steckbrief | `src/nowcast/CellPlacesCard.tsx`, `src/radar/cellLayers.ts:77-130` | Kopfzeile, Zieht-über-Liste, Echotop, Blitzrate, dBZ, Hagel-/Böen-Hinweise; **keine Echobasis, kein Trend** | ergänzen, nicht neu bauen |
| Zellauswahl | `src/nowcast/useCellPlaces.ts:49,91` (`select`), Klick `NowcastRadarMap.tsx:253-262` | Klick auf Zellpunkt wählt Zelle im Readout | Turm-Antippen ruft denselben `select` |
| Abdeckung | `src/radar/cellPlaces.ts:325-333` `inKonradReach` | 150 km um 17 Radare, gemessen max. 163 km (`zell-orte.md`) | Hinweis AT/CH |
| Mobil-Reiter | `src/nowcast/NowcastDeck.tsx:94,696-760` | Schnellblick · Zeitachse · Diagramm · Layer · Detail, Blatt peek 34 vh / voll 92 vh | sechster Reiter „3D" |
| Zeit | `NowcastRadarMap.tsx:207,602-618` | `framePos` → absolute `timeMs`, `timeBracket` | 3D liest dieselbe Zeit |
| Kamera | `MapView.tsx:1221` (`moveend` → lat/lon/zoom), `onMapReady` :1364 | nur Bericht für die URL | Kopplung neu |

Konzept und Vorlage sind da: `niederschlagsplattform-konzept.md` §7 (Türme als `fill-extrusion`, Bahn/Trichter
gedrapt, „Echohöhen über NN, über Grund umgerechnet (benannt); Türme nur im DE-Verbund"), Desktop-Vorlage mit
Umschalter in der Topbar, Dock in „Karte + 3D" auf 64 px, Hälften 50 : 50, Fußnote „Überhöhung 1,3 · Echohöhen
über NN, über Grund umgerechnet · Zellen nur DE-Verbund". Die Mobil-Vorlage hat einen Reiter „3D" ohne Inhalt.

## 2. Was die Zelldaten liefern (an den Fixtures gemessen)

- **Umriss:** genau ein Ring je Zelle (`polygons_projected`), 19–84 Ecken (Median ≈ 25–30), nicht geschlossen.
- **Höhen:** `echo_bottom_msl`, `echo_top_msl` in **m über NN**, ein Wert je Zelle (keine Werte je Ecke).
  20261007T1845: Top 2 259–4 618, Basis 317–1 072 m; 20261008T1430: Top 3 148–5 746, Basis 471–1 894 m.
  **Falle:** im Alpen-Fixture `konrad3d-sample.xml` liegt bei Zelle 12 die Basis bei 1 609 m ü. NN, die DWD-Geländehöhe
  am Zellort (`ground_elevation_of_cell_position`, nicht geparst) bei 2 990 m ⇒ **Basis unter Grund**.
- **Reflektivität:** `dbzMax` 47,7–58,1 dBZ in den Oktober-Fixtures. Die heutige Zellfarbe ist die **Severity**
  (`CELLS_SEVERITY_COLOR`), keine dBZ-Skala.
- **Hagel:** nur Flag und Zahlen (`hailAreaKm2`, `hailEchoTopM` ü. NN, `hailVolumeKm3`), **kein Hagel-Umriss**; die
  Hagel-Ebene der Karte nimmt den ganzen Zellumriss (`hailField.ts:147-183`). Hagel-Echobasis nicht geparst.
- **Vorhersage:** 12 Schwerpunkte +5…+60 min mit Ellipse (Hauptachse +60 min 21–48 km), **keine Prognose-Umrisse,
  keine Prognose-Höhen**.
- **Trend:** steht im XML (`intensity/trends`: Echotop-45-dBZ-Trend m/5 min, VIL-Trend, dBZ-Trend, Severity-Trend),
  wird aber **nicht geparst** und steht nicht in `cells.json`. Der Kommentar `NowcastRadarMap.tsx:521-523`
  „KONRAD3D kennt keinen Trend" ist falsch (V-ZT-1).
- **Rückblick:** der Spiegel hält `konrad3d/<slot>/cells.json` 24 Slots ≈ 115 min (`radarImg.ts:52-56`), der Client
  lädt aber **nur den jüngsten Lauf** — kein Lader nach Gültigkeitszeit (bekannte Lücke V-RR-12; die 2D-Zellbahnen
  zeigen im Rückblick heute den aktuellen Lauf).
- **Abdeckung:** nur DWD-Verbund; AT/CH nur grenznah (Gmunden, Brenner), Wien/Graz/Kärnten/Wallis/Tessin/Genf nie.

## 3. Reichen die eingebauten 3D-Mittel? — ja (Spike, MapLibre 5.24.0)

Am Quelltext (`node_modules/maplibre-gl/dist/maplibre-gl-dev.js`, `fillExtrusionVert`) und an drei Bildern geprüft:

1. **Höhenbezug:** mit Gelände hebt MapLibre jede Extrusion um `get_elevation(a_centroid)` an — die Geländehöhe am
   **Schwerpunkt des Polygons, mal Überhöhung**; `fill-extrusion-base/-height` kommen **unüberhöht** obendrauf
   (bei `base = 0` zusätzlich −10 m). Für „über Grund" heißt das: Basis/Top ü. NN − Geländehöhe am Schwerpunkt.
2. **Kern durch den Turm sichtbar:** halbtransparente Extrusionen zeichnen erst Tiefe, dann nur die vorderste Fläche.
   Liegt die Kern-Ebene **unter** der Turm-Ebene (opak), scheint sie durch die Turmwand
   (`zelltuerme-3d/spike-kern-durch-turm.png`). Gelände hinter dem Turm bleibt lesbar.
3. **Kachelnaht:** der Schwerpunkt wird **je Kachelstück** gerechnet. Ein Umriss über einer Kachelgrenze im Gebirge
   zerfällt in Stücke mit verschiedener Sockelhöhe — sichtbare Stufe bei z11,5
   (`spike-kachelnaht-stufe.png`). Gegenprobe: GeoJSON-Quelle mit `maxzoom: 7` (Kachel ≈ 200 km, Geometrie
   übergezoomt, Auflösung ≈ 40 m) — Stufe weg (`spike-kachelnaht-maxzoom7.png`). Rest: eine Zelle genau auf einer
   z7-Grenze bleibt geteilt (selten, benannt als V-ZT-2).
4. **Drapieren:** `fill`, `line`, `raster`/`image` werden auf das Gelände gelegt. **Nicht** gedrapt werden
   Custom-Layer: das Radar zeichnet heute `RainLayer` (`src/scalar/RainLayer.ts`, z = 0 im Shader). Für das Relief
   braucht es ein **Bild** des Niederschlags (`image`-Quelle, ThermalMap-Muster) — kein Shader-Eingriff.
5. Der Haupt-Karte (`MapView`) darf man keinen Pitch geben (`WindLayer.ts:2119` setzt Pitch/Bearing 0 voraus) ⇒
   3D ist eine **eigene Karteninstanz** (zweiter WebGL-Kontext).

**Kein Shader-Eingriff nötig.** Regenstriche/Flocken bleiben draußen (Konzept: eigener Custom-Layer = STOPP).

## 4. Architektur-Befund

- `NowcastRadarMap` besitzt Zeit, Bildstapel, Zell-Lauf und Zeitachse (die `RadarTimeline` liegt **in** ihr unter
  der Karte). Die 3D-Bühne gehört deshalb **in** `NowcastRadarMap` neben `MapView` — dann bleibt die Zeitachse in
  allen drei Ansichten unter der Bühne, und Zeit/Lauf fließen ohne Anheben in die 3D-Karte.
- `MapView` meldet nur lat/lon/zoom bei `moveend`; die Kopplung läuft über die Karteninstanz (`onMapReady`).
- Der bestehende Umschalter „Karte | Diagramm" (Dock und Bühne oben rechts, `NowcastDeck.tsx:125,223-230,386-390`)
  bleibt; er gilt für die Karten-Hälfte.
- Desktop 1440 heute: Rail 62 + Dock 226 + Readout 352 ⇒ Bühne ≈ 800 px ⇒ Hälften ≈ 400 px.

## 5. Was fehlt (Umfang der Phase)

| # | Fehlt | Lösungsskizze |
|---|---|---|
| ZT-a | Umschalter „Karte \| Karte + 3D \| 3D" | Topbar `.rr-topbar`, Stil nach Vorlage (`npBtn`), Zustand in der URL (`?ansicht3d=` o. ä., replaceState) |
| ZT-b | 3D-Bühne | neue Lazy-Datei `src/nowcast/cellTowers/TowerStage.tsx` nach `EventTerrainMap`-Muster, positron + Schummerung, Pitch 60 |
| ZT-c | Türme | reine Funktion `buildTowerFeatures(run, groundAt)` → GeoJSON (Quelle `maxzoom: 7`), Ebenen Kern (unten) + Turm (oben, Deckkraft ≈ 0,6) |
| ZT-d | Höhen über Grund | DEM am Schwerpunkt (`loadElevationLookup`, derselbe Terrarium-Bestand) |
| ZT-e | Bahn + Ellipsen gedrapt | `buildCellFeatures` unverändert, eigene `line`/`fill`-Ebenen in der 3D-Karte |
| ZT-f | Radar auf dem Relief | CPU-Bild des Ausschnitts aus denselben Frames → `image`-Quelle, gleiche Farbskala |
| ZT-g | Rückblick | Lader `fetchKonrad3dAt(timeMs)` aus `konrad3d/<slot>/cells.json` (≤ 115 min), nur für die 3D-Bühne |
| ZT-h | Trend | E-ZT-4 |
| ZT-i | Steckbrief | `CellPlacesCard` um Echobasis/Echotop (über Grund, ü. NN in Klammern), Blitzrate, Trend ergänzen |
| ZT-j | Legende | dBZ-Farbskala, „Gelände ×1,3", „Höhen über Grund", Hagelkern schematisch |
| ZT-k | Hinweis ohne Zelldaten | `inKonradReach` am Kartenmittelpunkt ⇒ Satz statt leerer Luft; 0 Zellen im Verbund ⇒ eigener Satz |
| ZT-l | Kamera-Kopplung | Mitte/Zoom beidseitig, Drehung/Kippung nur in 3D, Schleifensperre; „Ansicht zurücksetzen" |
| ZT-m | Mobil | Reiter „3D" im Blatt; 3D-Karte nur montiert, solange der Reiter offen ist; pixelRatio ≤ 1,5 |
| ZT-n | Flag | hinter Schalter, voreingestellt aus (Rule 2) |

## 6. Entscheidungen (Jan)

| # | Frage | Empfehlung | Alternative |
|---|---|---|---|
| E-ZT-1 | Überhöhung | Gelände **und** Türme ×1,3 (Projektstandard; Proportionen Turm : Berg stimmen), Zahlen im Steckbrief echt | Türme unüberhöht (sitzen dann scheinbar zu tief) · alles 1,0 |
| E-ZT-2 | Bezug „über Grund" | Terrarium-DEM am Schwerpunkt (= der Punkt, auf den MapLibre den Turm stellt); Basis unter Grund ⇒ 0, im Steckbrief „Echobasis unter Geländehöhe" | DWD-Geländehöhe aus dem XML (Parser + `cells.json` Schema 2 = Producer + Daten-Repo) |
| E-ZT-3 | Hagelkern ohne Hagel-Umriss | Umriss um den Schwerpunkt auf `hailAreaKm2` verkleinert, von Basis bis `hailEchoTopM`, Legende „Lage schematisch" | ganzer Umriss bis Hagel-Echotop dunkel · kein Kern |
| E-ZT-4 | Trend | aus zwei Läufen im Client (Echotop/VIL gegen den Slot 5 min davor, gleiche `id` + `firstDetectedMs`), Wörter „wächst / gleichbleibend / schwächt ab", Schwellen `set` | DWD-Trend aus dem XML (Parser + Schema 2, Daten-Repo-Gate) |
| E-ZT-5 | Türme bei Zukunftszeit | Turm bleibt am **Messort** (gemessen), Bahn + Ellipsen zeigen die Zukunft, die Ellipse zur Slider-Zeit hervorgehoben; > +60 min: keine Türme, Satz „Zellvorhersage reicht bis +60 min" | „Geisterturm" verschoben entlang der Bahn (Umriss/Höhe nicht vorhergesagt) |
| E-ZT-6 | Radar auf dem Relief | CPU-Bild des Ausschnitts aus den nativen Landesgittern (HD, Besitz-Maske), in Mercator-Zeilen, ≤ 1024 px (mobil 512) | Komposit 600 × 512 direkt (schneller gebaut, ≈ 30 % Pixel verloren) |
| E-ZT-7 | Dock bei „Karte + 3D" | wie Vorlage auf 64-px-Symbole mit Tooltip (alle Funktionen erreichbar), Hälften ≈ 560 px | Dock bleibt 226 px, Hälften ≈ 400 px |
| E-ZT-8 | Mobil | sechster Reiter „3D", Blatt voll, 3D-Karte nur solange offen; Echt-Gerät durch Jan | 3D ersetzt die Karte vollflächig |
| E-ZT-9 | Freischaltung | hinter `?z3d=1`, voreingestellt aus | gleich an |
| E-ZT-10 | Basiskarte 3D | positron + Schummerung (wie Regenradar) | liberty (wie Tour/Event; bringt 3D-Gebäude ab z14) |

dBZ-Farbskala (Vorschlag, `set`): < 45 `#C9A227` · 45–50 `#E08A2E` · 50–55 `#C9522E` · ≥ 55 `#8F2140` (Farben der
Vorlage); Hagelkern `#3B0F18`.

**Jans Entscheidung (09.10.): E-ZT-1…10 je die Empfehlung.** Gelände und Türme ×1,3; Trend und Geländehöhe nur im
Client (kein Producer-, kein Daten-Repo-Eingriff; DWD-Trend bleibt V-ZT-1); Turm am Messort; Hagelkern schematisch;
Radar als HD-Bild; Layout wie Vorlage; `?z3d=1` voreingestellt aus; positron + Schummerung.

## 6a. Entwurf (zur Durchsicht vor dem Umsetzungsplan)

**Bausteine** (alle neu unter `src/nowcast/cellTowers/`, Lazy-Chunk; bestehende Dateien nur additiv):

| Einheit | Aufgabe | hängt ab von |
|---|---|---|
| `towerFlag.ts` | `towers3dEnabledFrom(search)` (`?z3d=1`), `View3d = 'map' \| 'split' \| '3d'` aus `?ansicht3d=` | — |
| `towerModel.ts` (rein, importfrei bis auf Typen) | `buildTowerFeatures(run, groundAt, exag)` → Turm- und Kern-Features: Basis/Top über Grund = max(0, h_NN − Grund), × `exag`; Kern = Umriss um den Schwerpunkt auf `√(hailAreaKm2 / areaKm2)` skaliert, bis `hailEchoTopM`; `dbzColor`; Flags `baseBelowGround` | `Konrad3dCell` |
| `towerTrend.ts` (rein) | `cellTrend(cell, prevRun)` → `grows \| steady \| weakens \| new` aus ΔEchotop/ΔVIL je 5 min, Schwellen `set` (Echotop ±300 m, VIL ±2 kg/m²), Zuordnung über `id` + `firstDetectedMs` | `Konrad3dRun` |
| `konradAt.ts` | `fetchKonrad3dAt(timeMs)`: Slot ≤ t aus `konrad3d/<slot>/cells.json` (Gate ≥ 330 s, ≤ 115 min), Cache je Slot; außerdem der Vorgänger-Slot für den Trend | `radarImg.ts`, `dwdKonrad3d.ts` (nur Lesen) |
| `radarDrape.ts` | CPU-Bild des Ausschnitts aus den HD-Frames der aktuellen Zeit (Besitz-Maske, gleiche Rampe), Mercator-Zeilen, ≤ 1024/512 px, in Zeitscheiben | HD-Frame-Bytes, `radarCountryMask` |
| `TowerStage.tsx` | eigene MapLibre-Instanz (Muster `EventTerrainMap`, Herkunftskommentar): positron, DEM + Schummerung, Quellen Türme/Kern (`maxzoom: 7`), Bahn/Ellipsen (`buildCellFeatures`), Radarbild; Antippen → `onCellPick(id)`; „Ansicht zurücksetzen"; Hinweis-Overlay; Legende | obige |
| `useCameraLink.ts` | Mitte/Zoom beidseitig zwischen Haupt- und 3D-Karte, Sperre gegen Rückkopplung; Drehung/Kippung nur 3D | zwei Karteninstanzen |
| `TowerLegend.tsx` | dBZ-Skala, „Gelände und Türme 1,3-fach überhöht", „Höhen über Grund", „Hagelkern: Lage schematisch", „Zellen nur DE-Radarverbund" | — |

**Einhängepunkte (additiv, alles hinter dem Flag):** `NowcastRadarMap` rendert neben `MapView` die `TowerStage`
(Zeit, Lauf, Frames liegen dort; Zeitachse bleibt darunter); `NowcastDeck` Topbar-Umschalter, Dock 64 px bei
`split`, Reiter „3D" mobil; `CellPlacesCard` Zeilen Echobasis/Echotop (über Grund, ü. NN in Klammern), Blitzrate,
Trend. Ohne Flag: keine Zeile anders, kein Chunk geladen.

**Datenfluss:** Slider → `timeMs` → (a) Lauf: `t ≤ jetzt` ⇒ `fetchKonrad3dAt(t)`, `t > jetzt` ⇒ jüngster Lauf, Türme am
Messort, Ellipse mit `validMs` nächst `t` hervorgehoben, `t > +60 min` ⇒ keine Türme + Satz; (b) Radarbild der Zeit;
(c) Gelände-Lookup einmal je Ausschnitt (z9, wie ThermalMap). Kamera: Hauptkarte `move` → 3D `jumpTo` (Mitte/Zoom),
3D `moveend` → Hauptkarte.

**Fehler und Leerzustände:** kein Lauf für die Rückblick-Zeit ⇒ „für diese Zeit keine Zelldaten im Spiegel" (kein
stiller Rückfall auf den aktuellen Lauf); Ausschnitt außerhalb `inKonradReach` ⇒ „Keine Zelldaten: der deutsche
Radarverbund reicht hier nicht hin (Österreich/Schweiz ohne Zellprodukt)"; 0 Zellen ⇒ bestehender Satz „keine
konvektiven Zellen erkannt"; kein WebGL / Chunk-Fehler ⇒ Hinweis in der Bühne, Karte bleibt; DEM fehlt ⇒ Türme mit
Grund 0 und Kennzeichnung „Gelände nicht geladen".

**Mobil:** Reiter „3D" öffnet das Blatt voll; `TowerStage` montiert nur dann, wird beim Verlassen abgebaut
(Lehre `route-3d.md` §15.3), `pixelRatio ≤ 1,5`, Bild 512 px, Steckbrief unter der Bühne im Blatt.

## 6b. Umsetzung (09.10., uncommitted, hinter `?z3d=1`)

Jan hat den Entwurf §6a am 09.10. freigegeben („ja ich gebe frei, bau es jetzt"). Gebaut wie §6a, mit drei Abweichungen:

| Abweichung | Warum |
|---|---|
| Bühne liegt nicht in einer Wrapper-Div, sondern als Geschwister `.zt-aside` vor der Zeitachse; `.nc-radar.zt-has-aside` wird ein Raster (Zeile 1 Karte \| 3D, alles andere über beide Spalten) | `NowcastRadarMap.tsx` wird parallel von HZS, ZO und SK bearbeitet — so bleiben die Eingriffe drei kleine, lokale Einfügungen |
| Die Ansicht wird nur beim Laden aus `?ansicht3d=` gelesen, nicht zurückgeschrieben (V-ZT-4) | `NowcastRoute` baut die URL bei jeder Kamerabewegung aus den beim Laden gelesenen Zusatz-Schlüsseln neu — ein später geschriebener Schlüssel würde überschrieben |
| Geländehöhe am Turmfuß aus `map.queryTerrainElevation` der Bühne (÷ 1,3) statt `loadElevationLookup` | dieselben DEM-Kacheln, die MapLibre zum Anheben nimmt; ein DACH-weiter Lookup in z9 wären Hunderte Kacheln |

**Dateien.** Neu `src/nowcast/cellTowers/`: `towerFlag.ts` (Schalter, Ansicht), `towerModel.ts` (Höhen über Grund, ×1,3,
dBZ-Farbe, schematischer Hagelkern — rein), `towerTrend.ts` (Trend aus zwei Läufen — rein), `konradAt.ts` (Lauf nach
Gültigkeitszeit aus `konrad3d/<slot>/cells.json`, Fenster 115 min, kein stiller Rückfall), `radarDrape.ts` (Radarbild aus
den HD-Frames, Länder wie die HD-Masken, Rampen wie der Shader, Mercator-Zeilen, 8-ms-Zeitscheiben), `TowerStage.tsx`
(Bühne + Legende + `TowerFacts`, Lazy-Chunk 8,8 KB gzip), `cellTowers.css` (Bühne), `cellTowersShell.css` (Umschalter,
schmales Dock, Raster — vom Deck geladen). Additiv: `MapView.tsx` (Prop `onProfileRadarPick` + Typ `ProfileRadarPick`,
meldet die HD-Frames der näheren Radarzeit), `NowcastRadarMap.tsx` (Props `stageAside`/`stage3d`/`onProfileRadarPick`,
Klasse an der Wurzel, Karte `suspended` in „3D"), `NowcastDeck.tsx` (Topbar-Umschalter, Dock-Hülle 64 px mit „Alle
Einstellungen", Steckbrief-Block im Readout, Reiter „3D" im Blatt). Werkzeuge: `scripts/verify-cell-towers.mjs` (CI),
`scripts/cell-towers-probe.mjs` (CDP, spielt den Alpen-Lauf auf jeden Slot verschoben ein), `audit/zelltuerme-3d/measure-foot.mjs`.

**Schnittstelle für andere Linien:** `TowerStage` meldet die Bühnenkarte über `onStageReady(map | null)` (nach DEM,
Terrain, Schummerung und allen ZT-Ebenen; `null` beim Abbau); erste gedrapte Ebene `ZT_FIRST_DRAPED_LAYER` = `zt-cone`.
Die SK-Linie (Schneefallgrenze als Fläche) hängt sich dort ein (abgestimmt 09.10.).

## 7. Gates (Belege)

| Gate | Beleg |
|---|---|
| `verify:cell-towers` (neu, in CI) | **59/59** — A Höhen über Grund (Alpen-Zelle 12: Basis 1 609 m unter 2 990 m ⇒ 0 und benannt; ×1,3 an allen 12 Türmen 07.10.; DEM genau am Eckpunkt-Mittel), B Hagelkern (nur Zelle 12, √(5,5/86,5) = 0,25, gleicher Fuß, Kern vor Turm), C Farben, D Trend (wächst/schwächt ab/gleichbleibend/neu/unbekannt, ID-Wiederverwendung), E Slots (Zukunft ⇒ neuester, Rückblick ⇒ 5-min-Boden, > 115 min ⇒ zu alt, fehlender Slot ⇒ null), F Radarbild (LUT = Shader-Rampen, Mercator-Zeilen, München-Pixel = LUT am `sampleRadarIndex`-Wert, AT ohne Frame transparent + Gegenprobe), G Verdrahtung (Schalter, Lazy-Chunk, kein Custom-Layer/Shader, `maxzoom: 7`, Kern unter Turm, MapView/NowcastRadarMap nur additiv mit Gegenprobe, Fusion + 2D-Zellmodule unverändert) |
| Nachbar-Verifier | `verify:cell-places` 60/60 (H2 von ZO an ZT angepasst, abgestimmt), `rain-window` 63/63, `regenchance` 44/44, `precip-sums` 57/57, `fusion-release` 28/28, `dashboard` 80/80, `regenradar-profile` 24/24 (+1 ⊘), `height-time` 58/58 |
| typecheck / Build / Budget | 0 Fehler · 255/255 · eagerJs 109,3 / 109,4 unverändert, totalJs 1 677,5 / **1 679** (angehoben mit Notiz; ZT-Chunk 8,8 KB, Rest parallele Linien) |
| Browser (CDP, Prod-Build, `probe-output.txt`) | Desktop „Karte + 3D" (`desktop-split.png`): Dock 64 px, Türme + Hagelkern auf dem Relief, Bahn/Ellipsen gedrapt, Karte folgt (Mitte/Zoom gleich); Antippen Turm 12 ⇒ Steckbrief „Echobasis unter Geländehöhe (1.609 m ü. NN) · Echotop 5,5 km über Grund (8.670 m ü. NN) · 14 / 5 min · wächst (Echotop +450 m je 5 min) · Hagel 5,5 km² bis 3,1 km über Grund · Gelände 3.133 m ü. NN" (`desktop-readout-steckbrief.png`); „Alle Einstellungen" ⇒ Dock 226 px (`desktop-dock-offen.png`); „3D" (`desktop-3d.png`): Bühne 800 px, Karte ruht verborgen; Zukunft: +45 min ⇒ Ellipse +50 min hervorgehoben, > +60 min ⇒ keine Türme + Satz (`desktop-zukunft-ellipse.png`); Wien ⇒ „Keine Zelldaten: der deutsche Radarverbund reicht hier nicht hin (Österreich und Schweiz ohne Zellprodukt)." (`desktop-wien.png`); Zurücksetzen ⇒ Pitch 60, Peilung 0; „Karte" ⇒ keine Bühne; **ohne Schalter 0 ZT-Elemente** (`desktop-ohne-schalter.png`). Radarbild auf dem Relief: Testmuster zweimal in dieselbe Quelle, das zweite erscheint gedrapt (`drape-test-1-magenta.png`, `drape-test-2-gruen.png`). Mobil 390 × 844 (`mobil-3d.png`): Reiter „3D", pixelRatio 1,5, Steckbrief unter der Bühne |
| Rückblick in der Oberfläche | **nicht im Browser belegt** — in der Kopflos-Sitzung begann der Radarstapel bei „jetzt" (keine Rückblick-Frames), die Zeitachse ließ sich nicht vor „jetzt" stellen; die Slot-Regel ist in E3/E6/E7 geprüft |

**Fünf Selbstprüfungsfragen.** (1) Funktionserhalt: ohne `?z3d=1` kein ZT-Element (Sonde: 0); mit Schalter bleiben
„Karte | Diagramm" (Dock und Bühne), „Karte + Höhe" (HZS: Wahl setzt die 3D-Ansicht auf „Karte"), alle Dock-Funktionen
(64 px + „Alle Einstellungen"), Zellbahnen 2D unverändert (G10). (2) Desktop pixelgleich: kein Pixel-Diff gegen HEAD
gerechnet (der Arbeitsbaum trägt ungecommittete Teile von HZS/SK/ZO); belegt sind DOM ohne ZT-Element und die rein
additiven Einfügungen in `MapView`/`NowcastRadarMap` (G8/G9 mit Gegenprobe). (3) Touch-Ziele: Zurücksetzen 44 × 44,
Legende 69 × 44, Reiter 65 × 59; die MapLibre-Knöpfe der Bühne blendet das bestehende Mobil-CSS aus (0 × 0) — Drehen,
Kippen, Zoomen mit zwei Fingern (V-ZT-6). (4) Konsole: keine Fehler; **2 Warnungen** von MapLibre „cannot calculate
elevation if elevation maxzoom > source.maxzoom" = Folge von `maxzoom: 7`, gemessen und benannt (V-ZT-5). (5) Long Tasks:
in headless-shell nicht messbar; das Radarbild rechnet in 8-ms-Scheiben, die Türme sind wenige Dutzend Features —
Echt-Gerät = Jans Gate.

## 7b. Einschalten (09.10.)

Jan: „du kannst das featur einschalten“. `towers3dEnabledFrom` ist jetzt an, außer `?z3d=0`/`false`/`off` (benannter
Rückfall = Regenradar wie vor ZT). Die Startansicht bleibt „Karte“: der 3D-Chunk lädt erst bei „Karte + 3D“, „3D“ oder dem
Reiter. Belege: `verify:cell-towers` 59/59 (G1 neu: an ohne Parameter, aus mit 0/false/off), typecheck 0, Build 255/255,
Budget grün; CDP-Sonde (`probe-output.txt`): Voreinstellung Umschalter „Karte * | Karte + 3D | 3D“, keine Bühne, kein
`TowerStage`-Chunk geladen (`desktop-voreinstellung.png`); `?z3d=0` 0 ZT-Elemente; Desktop/Mobil wie §7; Konsole nur die
zwei Warnungen aus V-ZT-5. Beim ersten Sondenlauf brach `?ansicht3d=split` mit „Cannot access '_e' before
initialization“ ab — Ursache war ein Zwischenstand der parallelen SK-Anbindung im selben Arbeitsbaum (Zustand nach dem
ZT-Block gelesen), von SK behoben; mit neuem Build lädt die Ansicht.

## 7a. Gates (ursprünglicher Plan)

Verifier `verify:cell-towers` (neu, CI): Höhen über Grund an den drei Fixtures (inkl. Basis unter Grund), Hagelkern
nur mit Hagel, Kachel-Quelle `maxzoom`, Rückblick-Slot-Wahl, Trend-Wörter, Hinweis AT/CH, Flag aus ⇒ byte-gleiche
Seite. Browser: Desktop 1440 alle drei Ansichten, Mobil 390 Reiter, Konsole sauber, Pixel-Diff ohne Flag 0 px;
Long Tasks am Prod-Build; Real-Device (Jan). Budget: alles lazy, totalJs mit Notiz anheben.

## 8. Befunde

- **V-ZT-1** Kommentar `NowcastRadarMap.tsx:521-523` „KONRAD3D kennt keinen Trend" ist falsch — das XML trägt
  `intensity/trends`. Mehrwert: echter DWD-Trend statt Zwei-Lauf-Vergleich. Skizze: Parser + `cells.json` Schema 2.
- **V-ZT-2** Kachelnaht der Extrusion: auch mit `maxzoom: 7` bleibt eine Zelle auf einer z7-Grenze geteilt.
  Mehrwert: kein Sprung im Turmfuß. Skizze: Zelle über der Grenze in eine Kachel verschieben ist nicht möglich ohne
  Shader; Befund benennen, Häufigkeit messen.
- **V-ZT-4** `NowcastRoute` schreibt die URL aus den beim Laden gelesenen Zusatz-Schlüsseln — Ansichten, die sich später
  ändern (`?ansicht3d=`), lassen sich nicht teilen. Mehrwert: geteilter Link öffnet dieselbe Ansicht. Skizze: Zusatz-
  Schlüssel als Zustand in `NowcastRoute` führen und einen Setter nach unten geben.
- **V-ZT-5** Turmfuß bei `maxzoom: 7`: MapLibre liest die Fußhöhe aus dem z7-Höhenmodell. Gemessen an 23 echten Zellen
  (`zelltuerme-3d/measure-foot.txt`): Abweichung zum feinen Gelände Median 9 m, p90 47 m, max 147 m (Alpen); z8 max 28 m,
  aber 3 statt 1 von 23 Zellen über einer Kachelgrenze (Stufe im Turm). Folge: zwei MapLibre-Warnungen in der Konsole.
  Mehrwert einer Lösung: Fuß exakt und Konsole sauber. Skizze: eigene Extrusion als Custom-Layer = Shader ⇒ STOPP & FRAGEN;
  ohne Shader bleibt die Abwägung.
- **V-ZT-6** Mobil blendet das bestehende Regenradar-CSS die MapLibre-Knöpfe auch in der 3D-Bühne aus. Mehrwert: Kompass
  zum Einnorden für Nutzer ohne Zwei-Finger-Geste. Skizze: Ausnahme `.zt-stage .maplibregl-ctrl-group` im Mobil-CSS (44-px-Knöpfe).
- **V-ZT-7** Rückblick der Türme nicht im Browser belegt (Kopflos-Sitzung ohne Rückblick-Frames). Skizze: Sonde mit
  eingespielten `rv-past`-Frames oder Echt-Gerät an einem Gewittertag.
- **V-ZT-3** Terrarium-URL in zwei Schreibweisen (`elevation-tiles-prod.s3.amazonaws.com` vs.
  `s3.amazonaws.com/elevation-tiles-prod`) ⇒ getrennter HTTP-Cache. Skizze: eine Konstante.
