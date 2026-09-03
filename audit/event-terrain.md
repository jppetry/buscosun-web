# ET0 — Terrain-Ansicht der Event-Fläche + Wetter-Readout: Recherche & Diagnose

> Stand: 2026-09-01 · Jans Auftrag: „Im Eventplaner eine Ansicht des Terrains der ausgewählten
> Fläche einfügen und mehrere wetterabhängige Informationen übersichtlich bereitstellen.
> Recherche der Möglichkeiten; aus Sicht eines professionellen Eventplaners: was sind die
> Needs, und können sie mit einer Terrain-Ansicht gelöst werden?"
> **Reine Diagnose — kein Code.** Vorphase: EZ1–EZ3 (`audit/event-zone.md`).

## §1 Auftrag, Frage, Vorgehen

Zwei Fragen stecken im Auftrag:

1. **Terrain-Ansicht:** Kann und soll der Eventplaner das Gelände der aufgezogenen Fläche
   zeigen — und welche Eventplaner-Bedürfnisse löst das wirklich (statt nur hübsch zu sein)?
2. **Wetter-Readout:** Welche weiteren wetterabhängigen Informationen lassen sich
   **übersichtlich** bereitstellen — mit den Quellen, die das Projekt hat, und ohne die
   Ehrlichkeitsregeln zu verletzen (eine 8-km-Zone im Flachland löst kein Modell auf, §2
   in `audit/event-zone.md`)?

Vorgehen: Bestandsaufnahme am Code (§2), Bedarfsanalyse aus Eventplaner-Sicht mit
Machbarkeits-Urteil je Bedarf (§3), Ehrlichkeitsgrenzen (§4), Wegevergleich (§5),
Phasenplan-Vorschlag (§6), Entscheidungen für Jan (§7), V-Katalog (§8).

## §2 Bestand — am Code gemessen

### §2.1 Der Eventplaner heute

Wizard mit 5 Schritten (`EventPage.tsx`): **Ort → Fläche (Pflicht) → Anlass → Zeitfenster
& Phasen → Plan B**. Die Fläche wird auf einer **flachen** liberty-Karte aufgezogen
(`EventZoneMap.tsx`, lazy, kein Draw-Plugin, V-EZ-4-Regel: übernommen wird die zuletzt
gezeichnete Fläche).

Ergebnis (`EventResult.tsx`): Bester-Tag-Hero mit Score + Konfidenz, Faktor-Kacheln,
Anlass-Sondersektionen (Foto-Licht, Astro-Nacht, Hochzeits-Karten Wind/Hitze/Abendkälte),
Stundenverlauf (`EventCourseChart`), eingebettete 2D-Wetterkarte
(`EventMapSection`: MapView mit Temperatur | Niederschlag | Wind, **nur wenn der beste Tag
im ~28-h-Raster-Horizont liegt**), **ZoneSection** (Spanne über die 5 Messpunkte),
Plan B + Ausweichtag + Ausweichort, Phasen-Einzelbewertung, Termin-Vergleich, Rangliste,
Konfidenz-Zeitleiste, ICS-Export, Link teilen.

### §2.2 Der Zonen-Scan (EZ3) — und was er wegwirft (Befund B1)

`eventZoneScan.ts` ruft je Messpunkt `getPointForecast` + `recommendBestDay` auf — das
Ergebnis je Ecke ist ein **vollständiges `DayResult`** mit `DaySummary`
(tMax/tMin, gefühlte Temperatur, Niederschlagssumme + Spitzenstunde, Wind **und Böen**,
Bewölkung, UV, Luftfeuchte, Risiken je Fenster). `scorePoint` behält davon aber nur
`score`, `downside`, `reason` — **die bezahlten Detailwerte je Ecke werden verworfen**
(`eventZoneScan.ts:78-81`). Ein Ecken-Readout „Böen 14 m/s an der NW-Ecke, gefühlt 9 °C
an der SO-Ecke am Abend" kostet **null zusätzliche Abrufe** — nur das Behalten.

### §2.3 Die Pipeline rechnet das Gelände bereits (Befund B2)

`src/pointForecast/terrainPhysics.ts` ist in `pointForecast.ts` verdrahtet
(`pointForecast.ts:50,187,434`) und korrigiert die Temperatur am Punkt um:

- **Kaltluftsee/Senkentiefe** (TPI aus dem DEM-Lookup, nachts + windschwach + klar,
  bis −3,5 °C),
- **Hangexposition/Einstrahlung** (Neigung + Aspekt + Sonnenstand, ±1,5 °C),
- mit **NOAA-Sonnenstand inkl. Azimut** (`solarPosition`).

Das heißt: die Spanne, die der Zonen-Scan über die Ecken misst, enthält Talboden- und
Hang-Effekte **schon heute**. Zwei Folgerungen:

1. Eine Terrain-Ansicht muss **kein neues Mikroklima erfinden** — ihr Job ist, das
   **Warum** der Spanne sichtbar zu machen (die Ecke in der Senke, die Ecke am Kamm).
2. Die heutige ZoneSection-Bildunterschrift **untertreibt die eigene Pipeline**: sie nennt
   als Ursachen nur „Geländehöhe und Stationsnähe" (`EventResult.tsx:1672`) — Senke und
   Hangexposition fehlen, obwohl sie einberechnet sind (**V-ET-3**).

### §2.4 Terrain-Technik liegt fertig im Repo (Befund B3)

Die R3D-Linie hat alles gebaut, was eine Gelände-Bühne braucht, und die Fallen dokumentiert:

| Baustein | Fundort | Wiederverwendbar für die Event-Zone? |
|---|---|---|
| Terrarium-`raster-dem` + `setTerrain` + Schummerung aus derselben Quelle | `RouteTerrainMap.tsx:49-51` | **Ja, 1:1-Muster** (Quelle, Überhöhung 1,3, Hillshade) |
| liberty-Stil + `patchLibertyRefLength` auf `style.load` | `src/map/libertyStyle.ts` (dritter/vierter Aufrufer, R3D-8-Lehre) | Ja — Pflicht, sonst kommt V-RL-3 zurück |
| Attribution nach `load` einklappen (verdeckt sonst Klicks) | BD2e | Ja — Pflicht |
| Kamera: Pitch + `cameraForBounds`-Zoom-Bonus, WebGL-Rückfall benannt | `RouteTerrainMap.tsx:41-47,94` | Ja (Kamera-Logik einfacher: Zone statt Strecke) |
| Symbol-Pfeile: `icon-rotation-alignment: 'map'` zieht `icon-pitch-alignment` mit | R3D-6 §23.3 | Ja — Falle gilt für Ecken-Windpfeile genauso |
| `CurtainLayer` (Wetterwand), `buildGroundLayers`, `terrainChips` | `src/threed/`, `routeSection.ts` | **Nein** — Strecken-Instrumente: Spalten entlang einer Linie; eine Fläche hat keine natürliche Schnittlinie (§5, Weg C) |

**Kein STOPP & FRAGEN nötig:** wie bei R3D-5 wird die WebGL-Pipeline nur **benutzt**
(MapLibre-Kern-Terrain + Hillshade), kein Shader angefasst.

### §2.5 DEM-Abtastung und Sonnen-Astronomie sind DOM-frei vorhanden (Befund B4/B5)

- `sampleElevations(points: LatLon[])` in `src/route/enrichElevation.ts:151` holt und
  dekodiert Terrarium-Kacheln für **beliebige Punktlisten** — genau das Werkzeug für
  Zonen-Kennzahlen (Höhenspanne, Neigung, tiefster/höchster Punkt).
- Sonnenstand: `photo/sun.ts` (Höhe, Lichtfenster — trägt die Foto-Sektion) und
  `terrainPhysics.solarPosition` (Höhe **und Azimut**). Für „wo steht die Sonne zur
  Trauung" ist **kein neuer Algorithmus** nötig.

### §2.6 Die gezeichnete Zone ist im Ergebnis unsichtbar (Befund B6)

Der Nutzer zieht in Schritt 2 eine Pflicht-Fläche auf — im Ergebnis erscheint sie
**nirgends als Bild**: die ZoneSection zeigt Zahlen (Spanne + Punktliste), die eingebettete
MapView bekommt nur `location`, keine Zone (`EventResult.tsx:953-960`). Wer wissen will,
welche Ecke „Nordwest-Ecke" ist, muss es sich merken (**V-ET-2**). Zudem entfällt die
eingebettete Wetterkarte jenseits des 28-h-Horizonts komplett — an späten Tagen hat das
Ergebnis **gar keine Karte** (**V-ET-4**); das Gelände wäre horizontunabhängig.

## §3 Bedarfsanalyse — was ein professioneller Eventplaner braucht

Maßstab: die Entscheidungen, die ein Planer für Outdoor-Events (Hochzeit, Fest/Grillen,
Festival-artige Flächen, Foto/Drohne/Sterne, Sport) tatsächlich trifft. Je Bedarf:
löst eine Terrain-Ansicht ihn — und trägt die Datenlage die Aussage?

| # | Bedarf des Planers | Löst die Terrain-Ansicht das? | Datenlage im Repo | Ehrlichkeitsgrenze |
|---|---|---|---|---|
| N1 | **Mikro-Standortwahl auf dem Gelände:** Wo ist es eben (Bühne, Zelt, Tanzfläche), wo Hang, wo Senke? | **Ja, direkt** — 3D-Relief + Schummerung beantworten das visuell; Kennzahlen (Höhenspanne, mittlere Neigung) sind aus dem DEM berechenbar (B4) | DEM vorhanden (Terrarium, ~30 m) | Auflösung nennen; keine Gebäude/Bäume im DEM |
| N2 | **Windexposition:** Hält der Pavillon? Welche Ecke liegt am Kamm, welche im Lee? (Plan B hat die Böenschwelle schon: Default 13 m/s) | **Ja, erklärend** — die Ansicht zeigt Kamm vs. Mulde; die **Zahlen** je Ecke liegen im Scan bereits vor und werden heute verworfen (B1) | Böen je Ecke: bezahlt, verworfen (B1) | Punktforecast ist höhenkorrigierter Modellwind, **keine Umströmungssimulation** — so sagen |
| N3 | **Sonne & Schatten:** Blendet die Sonne die Trauung um 14 Uhr? Wann verschwindet sie hinter dem Grat (Talhochzeit, Foto-Slot, Abendfeier)? | **Ja, mit Rechnung** — Sonnenbahn (vorhanden, B5) + Horizontverdeckung aus DEM-Strahlen je Messpunkt: „Sonne hinter dem Grat ab 17:40" ist exakt ableitbar | `solarPosition` + `sampleElevations`; reine Astronomie + DEM, **keine neue Quelle** | Schatten von Bäumen/Gebäuden kann das DEM nicht — benennen. Hillshade ist Relief-**Beleuchtung**, kein Schattenwurf |
| N4 | **Abendkälte im Talboden:** Wird die Abendfeier in der Senke empfindlich kalt? | **Ja, sichtbar machen** — die Physik steckt **schon im Score** (B2: Kaltluftsee bis −3,5 °C); die Ansicht zeigt das Warum, das Readout die gefühlte Abendtemperatur je Ecke (aus B1) | terrainPhysics in der Pipeline; `apparentMinC` je Ecke im verworfenen `DaySummary` | Korrektur ist konservativ gedeckelt; als Modellzuschlag benennen |
| N5 | **Regen & Boden:** Wo sammelt sich Wasser (Matsch, Zufahrt)? | **Teilweise** — der tiefste Punkt der Fläche ist aus dem DEM ehrlich bestimmbar und ein brauchbarer Marker („bei Regen zuerst nass") | DEM | **Keine Abflussmodellierung** (wäre ein neuer Rechenweg mit Behauptungscharakter); Bodenart kennt niemand |
| N6 | **Logistik/Zugang:** Steigung der Zufahrt, barrierefreier Weg | **Teilweise** — Relief + Straßen des liberty-Stils qualitativ; Höhendifferenz der Fläche als Zahl | DEM + Basiskarte | Keine Routen-/Wegebewertung — nicht behaupten |
| N7 | **Gewitter-Exposition:** freie Kuppe = exponiert | **Teilweise** — höchster Punkt/Exposition benennbar; das Gewitterrisiko selbst steht schon im Risiko-Readout (CAPE + Warnungen) | vorhanden | Konservative Formulierung (bestehende Regel); keine Blitz-„Sicherheitsberatung" |
| N8 | **Drohne** (eigener Anlass): Geländehindernisse, Höhenspanne, Sichtlinie | **Ja, direkt** — Relief + Höhenspanne der Zone sind genau die Fragen | DEM | Luftrecht/Geo-Zonen sind nicht im Repo — nicht suggerieren |
| N9 | **Foto/Sterne:** Horizonthöhe (wann geht das Licht, wo ist der Horizont frei) | **Ja** — dieselbe Horizont-Rechnung wie N3; für Sterne Horizonthöhe je Richtung | wie N3 | wie N3 |
| N10 | **Publikums-Komfort:** Gefälle der Sitz-/Stehfläche, Sichtachsen | **Qualitativ** — Neigung ja; Sichtachsen-Berechnung nein | DEM | Keine Sichtachsen behaupten |
| N11 | **Plan-B-Verortung:** Wo auf dem Gelände steht das Zelt geschützt? | **Qualitativ** — Ansicht + Ecken-Windpfeile geben die Richtung; keine Lee-Berechnung | B1-Winddaten | „geschützt" nie als berechnete Aussage |
| N12 | **Kommunikation/Vertrauen:** Der Planer muss die Entscheidung (Termin, Plan B) Dritten begründen | **Ja** — eine Geländeansicht mit Messpunkten + Scores macht die abstrakte „Spanne 62–74 Punkte" anschaulich und teilbar | vorhanden (Scan) | Uniform-Fall bleibt uniform: keine Scheinauflösung (s. §4) |

**Kern-Urteil:** Die Terrain-Ansicht löst vor allem **Verortungs- und Erklärungs-Needs**
(N1, N2, N4, N8, N12: *wo* auf dem Gelände gilt *welcher* Wert, und *warum* unterscheiden
sich die Ecken) — die Zahlen selbst kommen weiter aus der vorhandenen Pipeline. Echten
**neuen** Informationsgewinn liefern zwei Rechnungen, beide ohne neue Quelle:
**Gelände-Kennzahlen** (N1/N5/N8: Höhenspanne, Neigung, tiefster/höchster Punkt) und
**Sonnenbahn + Horizontverdeckung** (N3/N9: für Hochzeit und Foto der wertvollste Einzelposten).

## §4 Was die Ansicht ehrlich sagen kann — und was nicht

1. **Die Uniform-Regel bleibt der Anker.** Über flachem Gelände löst keine Quelle die
   Fläche auf (gemessen: 0,16 K über 8 km, `audit/event-zone.md` §2). Eine Terrain-Ansicht
   über einer flachen Zone zeigt dann eben **flaches Gelände** — und genau das IST die
   Erklärung des Uniform-Satzes. Sie darf keine Scheinunterschiede dekorieren.
2. **Hillshade ist Beleuchtung, kein Schattenwurf.** MapLibres
   `hillshade-illumination-direction` auf den Sonnenazimut der Phase zu stellen, macht die
   sonnenzugewandten Hänge hell und die abgewandten dunkel — das ist eine legitime
   **Orientierung**, aber kein simulierter Schatten (keine geworfenen Bergschatten,
   keine Objekte). Wenn gebaut, dann mit genau diesem Satz daneben.
3. **Der Modellwind bleibt Modellwind.** Ecken-Böen sind höhenkorrigierte Punktwerte,
   keine Geländeumströmung. Kamm vs. Mulde erklärt Unterschiede — die Ansicht darf keine
   „Windschutz-Karte" behaupten.
4. **DEM-Grenzen benennen:** ~30 m Raster, keine Vegetation, keine Bauwerke. Für „ist die
   Wiese eben genug fürs Zelt" reicht das; für „steht die Eiche im Weg" nicht.
5. **Horizont-Rechnung ist exakt im Rahmen des DEM** — „Sonne hinter dem Grat ab 17:40"
   ist ableitbar und datumsgenau (reine Astronomie, funktioniert auch **jenseits** des
   Wetter-Horizonts — wie die Foto-Lichtfenster heute schon).

## §5 Wegevergleich

**Weg A — Terrain-Bühne im ERGEBNIS, an der ZoneSection (empfohlen).**
Dort liegen die Daten (Scan am besten Tag), dort steht die Frage („warum ist die NW-Ecke
schwächer?"), und dort fehlt heute jede Karte, sobald der beste Tag jenseits von 28 h liegt
(V-ET-4). Lazy-Chunk nach dem Muster `EventZoneMap`/`RouteTerrainMap`; die flache
Zeichen-Karte in Schritt 2 bleibt **unverändert** (Funktionserhalt; auf gekipptem Gelände
ist ein Rechteck-Zug nicht kontrollierbar — Zeichnen bleibt flach).

**Weg B — Terrain-Vorschau zusätzlich im Wizard-Schritt 2 (Umschalter „Karte | Gelände").**
Hilft bei der Flächenwahl („liegt mein Rechteck im Talboden?"), kostet aber eine zweite
MapLibre-Instanz im Wizard und den Umschalt-Abbau/-Aufbau (V-R3D-16-Falle). Als spätere
Phase sinnvoll, nicht als Start — und wenn, dann mit geteilter Logik statt Kopie
(R3D-8-Lehre: eine Stelle für Palette/Kennzahlen, zwei Layouts).

**Weg C — Wetterwand (`CurtainLayer`) über der Zone: nicht bauen.**
Der Vorhang ist ein **Strecken**-Instrument (Spalten entlang einer Linie mit Distanzachse);
eine Fläche hat keine natürliche Schnittlinie — jede gewählte wäre willkürlich und
suggerierte eine Auflösung quer über die Fläche, die die Quellen nicht haben (Uniform-Regel).
Die Bodenwerte gehören an die **Messpunkte**, nicht in eine erfundene Wand.

## §6 Phasenplan-Vorschlag (jede Phase einzeln gate-fähig)

| Phase | Inhalt | Reuse | Aufwand |
|---|---|---|---|
| **ET1 — Terrain-Bühne im Ergebnis** | Lazy `EventTerrainMap`: Terrarium-DEM + `setTerrain(1,3)` + Schummerung, gekippte Kamera auf die Zone, Zonen-Rechteck auf dem Relief, 5 Messpunkt-Marker mit Score-Chips (schwächste Ecke markiert wie in der Punktliste), WebGL-Rückfall benannt; Attribution-Einklappen (BD2e), liberty-Patch auf `style.load` | `RouteTerrainMap`-Muster, `zoneRing`, `zoneSamplePoints`, vorhandener Scan | mittel |
| **ET2 — Ecken-Readout (0 neue Abrufe)** | `scanZone` behält das `DaySummary` je Punkt (additives Feld); je Ecke Böen · gefühlt (Min im Abendfenster) · Regenspitze; Ecken-Windpfeile zur Phasen-Stunde (`windDirection` liegt im Forecast; `icon-pitch-alignment`-Falle); Bildunterschrift korrigieren: Senke/Hang als Ursachen nennen (V-ET-3) | B1, B2 | klein–mittel |
| **ET3 — Gelände-Kennzahlen der Zone** | `sampleElevations` über ein gedeckeltes Zonen-Raster (~8×8): Höhenspanne, mittlere Neigung, tiefster + höchster Punkt als Marker („bei Regen zuerst nass" / „exponierteste Stelle"); „DEM ~30 m, ohne Bebauung/Bewuchs" als Satz | B4 | klein |
| **ET4 — Sonne über dem Gelände** | Je Phase: Sonnenhöhe + -azimut (`solarPosition`) als Pfeil/Kompass an der Zone; **Horizontverdeckung** per DEM-Strahlabtastung je Messpunkt: „Sonne verschwindet hinter dem Grat um 17:40" — funktioniert auch jenseits des Wetter-Horizonts; optional Hillshade-Beleuchtung auf den Phasen-Azimut, mit dem Satz aus §4.2 | B4, B5 | mittel |
| **ET5 (optional)** | Terrain-Umschalter im Wizard-Schritt 2 (Weg B) | ET1-Bausteine geteilt | klein–mittel |

Verifikation: neue pure Module (Zonen-Raster, Horizont-Rechnung) headless in
`verify:event-zone` erweitern; Browser-Belege nach Standard (Konsole 0, Long Tasks am
Prod-Build, 44-px-Ziele, Desktop pixelgleich außerhalb der neuen Sektion). Budget:
alles im Lazy-Chunk, eagerJs unverändert.

## §7 Entscheidungen für Jan (mit Defaults)

- **E1 — Wo?** Default: Weg A (Ergebnis, an der ZoneSection). Weg B (Wizard) als spätere
  Option ET5.
- **E2 — Umfang:** Default: ET1–ET3 als erster Block, ET4 (Sonne/Horizont) als eigene
  Phase danach. ET4 hat für Hochzeit/Foto den höchsten Produktwert, kostet aber die
  meiste neue Rechnung.
- **E3 — Mobil:** Default: gleiche gekippte Karte, WebGL-Rückfall-Text wie R3D; Vorbehalt
  Real-Device (Emulation für WebGL nicht repräsentativ — bestehende Regel).
- **E4 — DEM-Kosten-Deckel:** Default: Kennzahlen-Raster ≤ 64 Punkte, Kachelzoom z12,
  Deckel ~16 Kacheln je Zone (60-km-Maximalkante).
- **E5 — Hillshade auf Phasen-Azimut:** Default: erst mit ET4, immer mit dem
  Beleuchtungs-Satz (§4.2), nie als „Schatten" beschriftet.

## §8 V-Katalog (neu)

- **V-ET-1:** `scorePoint` verwirft das vollständige `DaySummary` je Ecke — bezahlte
  Werte (Böen, gefühlt, Regenspitze, UV) fehlen im Ergebnis. Beheben = additives Feld
  im `ZoneScanPoint`, 0 neue Abrufe (ET2).
- **V-ET-2:** Die Pflicht-Fläche aus Schritt 2 ist im Ergebnis nirgends zu sehen — weder
  als Karte noch in der eingebetteten MapView. ET1 schließt das.
- **V-ET-3:** ZoneSection-Bildunterschrift nennt als Ursachen nur „Geländehöhe und
  Stationsnähe", obwohl die Pipeline auch Senkentiefe (Kaltluftsee) und Hangexposition
  korrigiert (`terrainPhysics.ts` in `pointForecast.ts:434`) — der Text untertreibt die
  eigene Rechnung.
- **V-ET-4:** Jenseits des 28-h-Raster-Horizonts hat das Ergebnis gar keine Karte
  (`eventWithinRasterHorizon`) — die Terrain-Bühne ist horizontunabhängig und füllt die
  Lücke an späten Tagen.

---

## §9 Umsetzung ET1–ET5 (2026-09-01)

Jans Zuschnitt: **alles** — ET1–ET5, E-Defaults aus §7 (E3 gleiche gekippte Karte mobil,
E4 Raster ≤ 64 Punkte, E5 Beleuchtung nur mit ET4 und nie als „Schatten" beschriftet).

### §9.1 Was gebaut wurde

- **`src/event/eventTerrain.ts` (pur, DOM-frei)** — die eine Stelle der Fach-Logik
  (R3D-8-Lehre): Wind-Helfer (`phasesWindow`/`representativeWindHour`/`windAtHour`),
  Zonen-Raster + Kennzahlen (`zoneGrid` ≤ 64 Punkte aspektproportional,
  `zoneTerrainMetrics` NaN-tolerant, `null` unter 50 % Deckung), Horizont
  (`horizonRayPoints` 64 Azimute × 24 geometrisch gestaffelte Stützen 60 m…30 km,
  `horizonAngles` mit Erdkrümmungsabzug d²/2R — am Verifier: 100-m-Wand auf 1 000 m
  ⇒ 5,706°, Punkt auf Standhöhe in 20 km ⇒ −0,090°), Sonnen-Kreuzung
  (`sunBehindRidge`: Grat erst ab `RIDGE_MIN_DEG` 1,0° — darunter ist es Sonnenuntergang).
- **`src/event/eventTerrainLoad.ts` (Browser)** — je Aufgabe EIN `sampleElevations`-Batch
  (Kennzahlen ≤ 16 Kacheln, Horizont ≤ 32 ⇒ ~z11/~52 m); `enrichElevation.ts` bekam dafür
  den **additiven** Parameter `maxTiles` (Default = bisherige Konstante 64,
  Bestandsaufrufer byte-gleich — der einzige Eingriff außerhalb von `src/event/`).
- **`src/event/EventTerrainMap.tsx` (lazy, eigener Chunk 6,5 KB roh)** — 1:1 nach dem
  `RouteTerrainMap`-Muster (Terrarium-`raster-dem`, `setTerrain(1,3)`, Schummerung vor dem
  ersten Symbol-Layer, Sky in try/catch, `cameraForBounds` + Pitch-Zoom-Bonus 1,1,
  WebGL-Rückfall benannt), plus die Pflicht-Fallen: liberty-Patch auf **`style.load`**,
  BD2e-Attribution-Dreizeiler, Pfeile mit **beiden** Alignments `'map'`,
  `'hillshade-illumination-anchor': 'map'`. **`BEARING = 0` fest** — die Messpunkte heißen
  „Nordwest-Ecke" usw., eine gedrehte Karte widerspräche ihren eigenen Namen.
- **ET2** — `scorePoint` behält `DaySummary` + Windrichtung zur repräsentativen Stunde
  (Böen-Spitze, sonst Fenster-Mitte; V-ET-1 geschlossen, **0 neue Abrufe**, Reihenfolge/
  Pausen des Scans unangetastet — der Verifier wacht über `for (const p of toFetch)` und
  das Fehlen von `Promise.all(toFetch`). Je Punktzeile: Böen · gefühlt min · Regenspitze.
  Caption korrigiert (V-ET-3): nennt jetzt Senkenlage und Hangexposition.
- **ET3** — Kennzahlen-Raster „Gelände der Fläche" (Höhenlage · Höhenunterschied ·
  mittlere Neigung, < 1° ⇒ „praktisch eben" · steilste Stelle), tiefster/höchster
  Rasterpunkt als Karten-Marker, DEM-Vorbehaltssatz; Ausfall benannt, nie stumm.
- **ET4** — je Phase eine Sonnen-Karte (Kompass-SVG mit Azimut, Sonnenhöhe, Grat-Zeile);
  Klick stellt die Hillshade-Beleuchtung der Bühne auf den Phasen-Azimut (nur wenn die
  Sonne der Phase über dem Horizont steht — eine Nachtphase beleuchtet nichts);
  Pflichtsatz „Beleuchtung, kein Schattenwurf" immer sichtbar. **Nicht am Scan und nicht
  am Wetter-Horizont gegated** (V-ET-4 geschlossen: auch an späten Tagen steht jetzt eine
  Karte im Ergebnis).
- **ET5** — Wizard-Schritt 2 „Karte | Gelände": die **Zeichenkarte bleibt montiert** und
  wird per CSS versteckt (kein Remount, kein Zonen-Verlust; nur die Terrain-Instanz wird
  je Umschalt auf-/abgebaut — der V-R3D-16-Preis, bewusst), beim Zurückschalten
  `map.resize()` (versteckte Container messen 0 × 0 — Canvas nach dem Wechsel wieder
  718 × 280 gemessen); Vorschau im `preview`-Modus (Zone + Ecken-Kürzel, **kein** Wetter);
  Zeichnen-Knöpfe gesperrt mit dem Satz „nur auf der flachen Karte".

### §9.2 Bewusste Abweichungen vom §6-Vorschlag

1. **EINE Horizont-Rechnung je Zone** (Anker = gewählter Ort, wenn in der Fläche, sonst
   Zonen-Mitte — dieselbe Konvention wie der Scan; die Fußzeile sagt, wo gerechnet wurde)
   statt „je Messpunkt": fünf DEM-Batches für eine Aussage, die sich auf einer ≤ 60-km-Zone
   kaum unterscheidet, stünden in keinem Verhältnis.
2. **Kachel-Deckel 16 (Raster) / 32 (Horizont)** statt der generischen 64: `chooseZoom`
   akzeptiert bis 64 Kacheln — ein 8×8-Raster über der Maximalzone hätte sonst je Stütze
   eine eigene Kachel geladen.
3. **Kopie mit Herkunftskommentar** für `supportsWebGL()`, `arrowImage()` und den
   BD2e-Dreizeiler (Darstellungs-Utilities ohne Aussagecharakter; Präzedenz `FireMiniMap`);
   die Fach-Logik liegt dagegen in EINEM Modul. `RouteTerrainMap.tsx` blieb unangetastet.
4. **EIN neutrales Pfeilbild** statt der drei Relations-Farben der Route — die
   Kopf/Quer/Rücken-Relation gibt es an einer Fläche nicht.

### §9.3 Befunde aus dem laufenden Bild

1. **Die Windpfeile lagen exakt UNTER den Chips** — Pfeil (Symbol-Layer) und Chip
   (HTML-Marker) teilen die Koordinate, der mittig verankerte Chip deckte den Pfeil
   vollständig ab (im Browser gesehen; kein Verifier-Wert meldet so etwas). Der Chip
   sitzt jetzt mit Offset −22 px über seinem Punkt, der Pfeil liegt sichtbar am Boden.
2. **Die ZEICHENkarte des Wizards startete mit ausgeklappter Attribution** — dieselbe
   BD2e-Falle, auf einer Karte, deren untere Hälfte Zeichenfläche ist. Dreizeiler
   nachgezogen (Beifang; die Datei war für ET5 ohnehin offen).
3. **`resize_page` genügt nicht für Mobil** (§26.4-Lehre erneut): das Fenster stoppt bei
   ~500 px `innerWidth`. Erst die Viewport-Emulation (375×844×2, mobile, touch) mit
   Zusicherung `innerWidth === 375` macht die Messung gültig.

### §9.4 Gate GET1 — Belege

1. **Funktionserhalt:** Zeichnen in Schritt 2 unverändert (flache Karte, gleiche Handler;
   ET5 nur additiv mit Sperr-Satz); ZoneSection-Spanne/Uniform-Regel byte-gleiche Logik
   (nur Behalten zusätzlicher Felder); eingebettete MapView ≤ 28 h erscheint weiter
   (Flachland-Beleg mit bestem Tag = heute); `RouteTerrainMap`/Bestandsverifier unberührt
   (`sampleElevations`-Default per Verifier festgenagelt).
2. **Desktop außerhalb der neuen Sektionen pixelgleich:** strukturell — alle Änderungen
   liegen IN der ZoneSection bzw. sind neue `evd-tmap-*`/`evd-sun-*`/`evd-terrain-*`/
   `evd-zone-viewtab*`-Klassen; keine bestehende CSS-Regel verändert, nur ergänzt.
3. **Touch-Ziele ≥ 44 px** (echte 375-px-Emulation): ⤢-Fit 44×44, Sonnen-Karten 305×66,
   Wizard-Viewtabs min-height 44; kein horizontaler Überlauf (`scrollWidth == innerWidth`).
4. **Konsole sauber:** Dev UND Prod-Preview 0 Fehler / 0 Warnungen — ausdrücklich keine
   `ref_length`-Warnung (style.load-Patch wirkt) und keine MapLibre-Bild-Warnung.
5. **Long Tasks am Prod-Build:** Laden der Ergebnisseite (inkl. Terrain-Aufbau) 8 Tasks,
   **max 152 ms**; Phasen-Wechsel ×2 + „Fläche einpassen" zusammen **1 Task à 73 ms** —
   nichts über 200 ms.

**Messwerte:** Gebirgszone Igls/Patscherkofel (6,0 × 6,7 km): Spanne 91–98 „slight",
schwächste SO-Ecke (12 ° Tagestemperatur gegen 21 ° im Tal, gefühlt min 6 °C — die
Kaltluft-/Höhenaussage, sichtbar am Relief), Kennzahlen 579–2 031 m · 1 452 m ·
10,3°/30,6°, Sonne zur Trauung 49° mit „**Hinter dem Grat ab 19:39 (Grat 1,4° hoch)**"
vor dem astronomischen Untergang, Abendfeier „Sonne unter dem Horizont"; Beleuchtungs-
Wechsel im Bild belegt (Süd-Licht ⇄ Standard-NW). Flachlandzone Schönefeld: Uniform-Satz
81–83 + „praktisch eben" (29–43 m, steilste 0,6°) + „Frei bis Sonnenuntergang (19:53)" —
das Gelände ERKLÄRT den Uniform-Satz, statt Scheinunterschiede zu dekorieren.
Screenshots: `audit/event-terrain/et1-ergebnis-desktop.png`,
`et2-pfeile-trauung-2.png`, `et4-beleuchtung-abendfeier.png`, `et5-wizard-gelaende.png`,
`et-mobil-375.png`.

**Verifikation:** `verify:event-zone` **102/102** (+61: Wind-Helfer, Raster/Kennzahlen an
synthetischer schiefer Ebene, Horizont an synthetischer Wand + Krümmungsterm,
Sonnen-Kreuzung in vier Fällen, Quelltext-Sonden auf alle Pflicht-Fallen inkl.
V-EZ-3-Wache; eine Sonde brauchte Whitespace-Toleranz — JSX bricht Knopftexte um,
SF0-Lehre), `npm run typecheck` grün, `npm run build` grün, Budget totalJs
**1 072,0/1 109,8** KB (eagerJs 103,1/107,9 unberührt; `EventTerrainMap` eigener
Lazy-Chunk, `largestChunk` unverändert maplibre).

**Offen:** **V-ET-5** (Altbestand: die eingebettete 2D-Wetterkarte `EventMapSection`/
MapView startet mit ausgeklappter Attribution — BD2e dort nie nachgezogen; live gesehen
am Flachland-Beleg), Real-Device-Vorbehalt für Mobil-WebGL (E3, bestehende Regel:
Emulation ist für WebGL nicht repräsentativ).
