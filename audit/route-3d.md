# Audit: 3D-Ansicht „Wetter entlang der Route" (Linie R3D)

> Stand: 2026-08-28 · Phase **R3D-0 — Diagnose** (kein Code).
> Auftrag: eigener 3D-Modus für die Tourenplanung, 2D bleibt Default.
> Verbindliche Vorlagen: `reference/1a-wetter-vorhang-*`, `1b-zeitkorridor-*`,
> `1c-gonogo-relief-*` (Desktop 1440 / Tablet 834 / Mobile 390, alle @2x).

---

## 1 Auftrag

Ein eigener Modus „3D-Ansicht" zur bestehenden Tourenplanung: axonometrische
Szene mit dem Gelände entlang der Route, sieben schaltbare Wetter-Layer,
gekoppelte Regler für Position (km) und Zeit (15-Min-Raster), rechts eine
Punkt-Abfrage, Ehrlichkeits-Auflagen (Auflösung sichtbar, stufige Farben,
Radar ≠ Modell, Konfidenz, „unklar" statt „Go", Status nie nur über Farbe),
WebGL-Prüfung mit sichtbarem 2D-Rückfall.

Diese Diagnose beantwortet vier Fragen, bevor eine Zeile Code entsteht:
**Was zeigen die Vorlagen wirklich? Was existiert im Repo schon? Welche Daten
gibt es je Layer — und welche nicht? Und an welchen Stellen widerspricht der
Auftrag dem Code?**

---

## 2 Was die drei Vorlagen zeigen

Die Referenzen sind **drei Sichten desselben Modus**, nicht drei Varianten
eines Screens. Alle teilen Kopfzeile, Rail, Szenenfeld, rechte Spalte (320 px
auf 1440, am Bild nachgemessen) und den Reglerblock am Fuß.

| Ref | Titel in der Vorlage | Frage, die sie beantwortet | Eigene Bausteine |
|---|---|---|---|
| **1a** | 3D-Ansicht · Wetter entlang der Route | „Was zieht über meine Strecke?" | 6 Layer-Chips, Punkt-Abfrage, Mini-Vertikalschnitt, Auflösungs-Hinweis |
| **1b** | 3D-Ansicht · Zeitkorridor | „Wo bin ich um welche Uhrzeit — was zieht dann über mich hinweg?" | Wetterperlen zur ETA, Zellzug, Wind zur Fahrtrichtung, „Besserer Start", Treffer-Wahrscheinlichkeit |
| **1c** | 3D-Ansicht · Go / No-Go | „Wo wird es kritisch — und warum genau dort?" | eigene Grenzwerte, Abschnittsliste Go/knapp/No-Go, „Warum"-Karte, Go-Fenster, PDF |

**Der Auftragstext beschreibt im Detail nur 1a** (Layer-Liste, Punkt-Abfrage
rechts, gekoppelte Regler, Ehrlichkeitsauflagen). 1b und 1c bringen je eine
eigene Datenlogik mit (Zellzug-Extrapolation bzw. benutzerdefinierte
Grenzwerte mit gespeichertem Profil) — sie sind **kein Beiwerk von 1a**,
sondern zwei weitere Phasen. → Entscheidung E3 (§9).

### 2.1 Die Szene ist kein Kartenbild

Wichtig für die Architektur: in allen neun Bildern ist **kein einziges
Kartenelement** zu sehen — keine Straßen, keine Orte, keine Gewässer, keine
Kartenschrift. Es gibt eine Höhenachse links (1000 / 2000), Silhouetten in
Braun-/Grautönen, Wandsegmente in Rechteckform, gestrichelte Höhenebenen.

Die Mobile-Vorlage (`1a-…-mobile-390.png`) macht es eindeutig: dort ist die
Szene ein **flacher Vertikalschnitt** — Spalten × Höhenbänder als Rechtecke,
genau die Darstellung, die `sectionImage.ts` heute erzeugt. Auf Desktop
kommt eine **Parallelverzerrung** dazu (die Wolkenbasis-Ebene ist ein
Parallelogramm, die Fluchtlinien bleiben parallel) plus eine zweite,
hellere Bergsilhouette hinter dem Hauptprofil.

**Folge:** Die Szene ist eine *axonometrische Projektion des vorhandenen
Vertikalschnitts*, keine 3D-Geländekarte. Axonometrie ist eine
Parallelprojektion und damit eine **affine** Abbildung — in SVG als
`transform="matrix(…)"` darstellbar, ohne Perspektivdivision, ohne Shader.
Das entscheidet §6.

---

## 3 Bestandsaufnahme — was schon da ist

### 3.1 Vertikalschnitt (`src/threed/`, 22 Dateien)

| Datei | Was sie kann | Für R3D |
|---|---|---|
| `crossSection.ts` | Höhe×Distanz-Gitter: Wind auf AGL über Potenzprofil, Böen getrennt, Temperatur höhenkorrigiert + inversionsbewusst, **Inversionshöhe**, **Wolkenbasis als LCL-Näherung** | Kern der Windwand, Wolkenbasis, Temperatur |
| `crossSection.ts:32` | `WIND_BANDS_KMH = [15, 30, 45, 60]` | **exakt die fünf Stufen des Auftrags** |
| `SectionChart.tsx:22` | `BAND_COLORS = ['#B6C8D6','#7A9466','#D4A373','#C97B47','#D7263D']` | **exakt die Legendenfarben in 1a** |
| `buildCrossSection.ts` | `prepareCrossSection` (teure Daten einmal) + `sectionAtTime` (synchron je Zeitpunkt) | trägt den Zeit-Slider ohne Nachladen |
| `sectionImage.ts` | Schnitt-Heatmap als Canvas (Spalten × 132 Zeilen), geteilt von SVG und GL | die Wandtextur |
| `sectionGeometry.ts` | `resampleLine`, `lineBounds`, `SectionColumn` | Korridor-Geometrie |
| `curtainMesh.ts` | `buildCurtain` (pur, headless prüfbar), `buildStreamlineSegments` | Streamlines am Grat |
| `CurtainLayer.ts` | MapLibre-Custom-Layer, `renderingMode:'3d'`, echter Depth-Test, Überhöhung | nur im Karten-Weg (§6 Weg B) |
| `TerrainMap.tsx` | MapLibre + `raster-dem` + `setTerrain`, Überhöhung `EXAGGERATION = 1.3` | nur Weg B |
| `dynamics.ts`, `goNoGo.ts`, `GoNoGoPanel.tsx` | Go/No-Go-Bewertung | Basis für 1c |

Parameter des Bestands: `COLUMNS = 64`, `ANCHORS = 5`,
`ANCHOR_CONCURRENCY = 3`, `DEM_ZOOM = 11` (≈ 76 m/px),
`FORECAST_HOURS = 36` (`buildCrossSection.ts:22-26`).

### 3.2 Tour (`src/route/`, 41 Dateien)

| Datei | Was sie kann | Für R3D |
|---|---|---|
| `tourTiming.ts` | `SampleETA`: `dist`, `lat/lon`, `ele`, **`etaMs`**, `segmentSpeedKmh`, `batteryPctRemaining`, `weather` | die Zeitachse der Tour — fertig |
| `tourTiming.ts` | `Milestone` (start/rest/meal/custom/end) | Etappenknoten in der Szene |
| `windSampling.ts` | Wind-Sampler je Cluster, zeitlich interpoliert | Windwand entlang der Route |
| `windEffect.ts` | `bearingDeg`, `headwindComponentMps`, `windSpeedFactor` | **„Wind mit Relation zur Fahrtrichtung"** — fertig |
| `weatherAggregate.ts` | Aggregate + **Warnungen mit Sample-Index-Range** („zwischen km 5,2 und 9,8") | die Warnzone als km-Bereich — fertig |
| `RouteScrubber.tsx` | ziehbarer Positions-Marker auf dem Höhenprofil, Wetter-Overlays (Regen, Föhn, Schneefallgrenze, Pausen), **Play-Animation**, Pfeiltasten, gesteuerte `dist`-Prop | ≈ 60 % des Reglerblocks — eine Bahn statt zwei |
| `RouteDeck.tsx` | geteilte Shell (Topbar + Ink-Rail bzw. Mobile-Header) | Kopfzeile/Rail „identisch zum Ergebnis-Screen" — fertig |
| `ebikeBattery.ts` | `batterySocAtDist` | „Akku 71 %" in Regler und Punktkarte |
| `breaks.ts`, `speedModel.ts`, `startTime.ts` | Pausen, Tempo, Startzeit | Startzeit-Variation (1b) |

### 3.3 Tokens

Alle im Auftrag genannten Farben sind **vorhandene Tokens**
(`src/designTokens.css`): `--sand-100 #EDE6D3`, `--cream-50 #FAF6EA`,
`--border-default #E0D6BE`, `--ink-900 #2C2A26`, `--terracotta-500 #C97B47`,
`--sage-600 #7A9466`, `--steel-600 #3A6FA8`, Rot `#D7263D` (= `BAND_COLORS[4]`),
Szenen-Hintergrund `#0B0E12` (= `--rd-map-bg`, `--evd-radar-bg`, `--br-map-bg`).

**Korrektur zum Auftrag:** die Stilquelle ist **`src/route/routeDeck.css`
(`--rd-*`)**, nicht `tourTheme.css`. `tourTheme.css` ist die ältere
Mockup-Schicht (`rt-*`) und wird laut Projektgedächtnis **nicht geändert**,
weil sie geteilt ist; Abweichungen laufen als Overrides auf
`:is(.rd-root,.rd-m-root)`.

---

## 4 Datenlage je Layer — was es gibt und was nicht

Grundlage ist `SampleWeather` (`src/pointForecast/types.ts:98-136`), das an
jedem Tour-Sample hängt.

| # | Layer (Auftrag) | Datenquelle im Code | Lage | Auflage |
|---|---|---|---|---|
| 1 | Temperatur am Band | `SampleWeather.temperatureC` / `apparentTempC`, höhenkorrigiert über DEM | ✅ vollständig | stufige Skala, keine Verläufe zwischen Stufen |
| 2 | Windwand, 5 Stufen | `crossSection` (AGL-Potenzprofil) aus `windSpeedMps` / `gustMps` | ✅ vorhanden | Vertikalstruktur ist **abgeleitet**, nicht gemessen (`crossSection.ts:15-18` sagt es selbst) |
| 3 | Regen-Säulen je km | `precipitationMmH` + **`precipitationSource: 'radar' \| 'nwp'`** | ✅ inkl. Kennzeichnung | Radar ≠ Modell ist **im Datenmodell schon da** |
| 4 | Wolkenbasis + Label | LCL-Näherung in `crossSection` | ⚠️ **abgeleitet** aus T + RH | nie als Messwert schreiben; Vorbehalt am Label |
| 5 | Schneefallgrenze | `SampleWeather.snowLineM` — *„AROME snowlmt, **AT/CH**"* | ⚠️ **in DE null** | in DE als Lücke ausweisen, nicht heimlich aus 0 °C rechnen |
| 6 | Warnzone (km × Zeit) | `TourWarning` — *„aktuell von BrightSky/DWD (**DE-only**) gespeist — AT/CH benötigen eigene Adapter"* (`types.ts:139-142`) | ⚠️ **DE-only** | die Vorlage zeigt Oberstdorf → Kemptner Hütte, also DE→AT: die Zone endet an der Grenze und muss das sagen |
| 7 | Streamlines am Grat | `buildStreamlineSegments` (`curtainMesh.ts`) | ✅ vorhanden | — |
| — | Konfidenz | `SampleWeather.confidence` je Größe (8 Felder) | ✅ vollständig | trägt „unklar statt Go" |
| — | Quellen | `sourcesUsed`, `validityFlags`, `isInterpolated` | ✅ vollständig | Quellenzeile am Fuß |

**Vier der sieben Layer sind Datenlücken oder Ableitungen** — keiner davon
ist ein Hindernis, aber jeder erzwingt Text statt Zahl.

---

## 5 Befunde, die den Auftrag korrigieren

### B1 — „Gitterzellen ≈ 2 km · 333 m" ist für diesen Datenpfad falsch

Die Tour fragt **nicht je Sample** ab. `weatherEnrichment` clustert die
Samples räumlich und nach Höhe und holt **einen** Punkt-Forecast je Cluster
(`src/pointForecast/clustering.ts`):

```
radiusForTerrain: alpin 6 000 m · hügelig 10 000 m · flach 14 000 m
DEFAULT_ELEV_BAND_M = 300
```

Die ehrliche Angabe lautet also **horizontal 6–14 km (Cluster, geländeabhängig)
und vertikal 300 m (Höhenband)** — nicht „≈ 2 km". Die 2 km stammen aus dem
ICON-D2-Gitter, das den Punkt-Forecast in DE nur mittelbar speist. Die 333 m
sind vermutlich das 300-m-Band, gerundet.

Die Ehrlichkeitsregel des Projekts schlägt hier die Vorlage: der Chip nennt
die tatsächliche Zahl, die sich zudem **je Tour ändert** (Gelände).

### B2 — Die Kopfzeile „ICON-D2 · 06:00 UTC" nennt die falsche Quelle

Der Punkt-Forecast ist ein Multi-Quellen-Blend, dessen Zusammensetzung vom
Land abhängt (`src/countryProfiles.ts:63-110`):

- DE `stackLabel: 'DWD ICON-D2 / MOSMIX + Live + RADOLAN-RV'`, 24 h
- AT `'GeoSphere AROME + INCA + TAWES'`, 60 h
- CH `'GeoSphere AROME + MeteoSwiss SMN'`, 60 h

Eine Tour über die Grenze (die Vorlage!) hat **zwei Stacks**. Die Kopfzeile
muss `stackLabel` bzw. `sourcesUsed` zeigen, nicht ein einzelnes Modell.
Nebenbefund: DE hat nur **24 h** Horizont — eine Tour, die morgen früh
startet, ist in DE am Rand des Fensters (`validityFlags: 'beyond_horizon'`).

### B3 — Der Tour-Zustand kann nicht in die Query

Der Auftrag verlangt „Ort, Zeit, Aktivitätsprofil und Parameter bleiben beim
Wechsel erhalten (Query-State)". Gemessen: **`src/route/` hat keinerlei
Persistenz** — kein `localStorage`, kein Hash, keine Query, kein Store
(Grep über alle 41 Dateien: null Treffer). Der gesamte Zustand — die
hochgeladene Datei, der geparste Track, Bewegungsart, Startzeit, Pausen, das
berechnete Ergebnis — lebt in React-State von `RoutePage` → `RouteResult` →
`TourView`.

Eine hochgeladene GPX-Datei lässt sich grundsätzlich nicht aus einer URL
rekonstruieren. Ein echter Router-Wechsel auf `/route/3d` würde `RoutePage`
unmounten und die Tour verlieren.

**Auflösung:** kein Router-Wechsel, sondern eine Ansichtsumschaltung
*innerhalb* des Ergebnis-Screens, deren Pfad per `history.replaceState`
gespiegelt wird — exakt das Muster, das RT1 für die Wetterkarte etabliert hat
(„kein Remount der Karte über `wetterkarte/:layer?` — EINE Route mit
optionalem Param"). Direktaufruf des 3D-Pfads ohne Tour landet auf dem
Upload-Screen mit dem Satz, dass 3D eine Strecke braucht.

### B4 — `/route/3d` bricht die Pfadregeln

`src/router/routes.ts` kennt `/tourenplanung` (Aliase `/touren`, `/tour`,
`featureId: 'route'`). `/route` existiert nicht und wäre ein englischer
Top-Level-Pfad neben zwölf deutschen. Die Tabelle kennt bereits Sub-Routen
mit `subParam: 'view'` (Waldbrand).

**Vorschlag:** kanonisch `/tourenplanung/3d`, dazu `/route/3d` als 301-Alias —
beide Wünsche erfüllt, Verifier `verify:routing` bleibt grün, `netlify.toml`
und `generate-seo.mjs` bekommen den Eintrag nach dem bestehenden Muster.

### B5 — „Depth-Test, kein Overlay" beschreibt ein Ergebnis, keine Technik

Die Forderung ist inhaltlich richtig und wichtig: eine Windwand, die vor
einem Berg schwebt, statt dahinter zu verschwinden, macht die Höhenaussage
falsch. In der axonometrischen Schnittszene liegen Wand und Geländeprofil
**in derselben Ebene** — die Verdeckung ist dort exakt über die
Zeichenreihenfolge bzw. ein Clip am Geländepolygon lösbar, ohne Tiefenpuffer.
Ein GL-Depth-Test ist nur nötig, wenn die Szene echte Tiefe bekommt (mehrere
gestaffelte Profile, Weg B in §6). Die Vorlage zeigt genau **eine** hintere
Silhouette, die durchgehend hinter dem Hauptprofil liegt — auch das ist
Zeichenreihenfolge.

### B6 — Es gibt keinen Verifier für `src/threed/` und `src/route/`

55 npm-Aliase, keiner deckt Schnitt oder Tour ab (`src/route/verifySamples.ts`
ist Dev-only und läuft im Browser). Die reinen Module (`curtainMesh`,
`crossSection`, `sectionGeometry`, `windEffect`, `weatherAggregate`) sind
headless prüfbar und heute ungeprüft. R3D bringt die erste Gelegenheit,
das nachzuholen — der neue Verifier deckt dann auch Bestand ab.

### B7 — Der 2D-Rückfall braucht einen Anlass

Der Auftrag verlangt WebGL-Prüfung mit sichtbarem Rückfall. Wenn die Szene
SVG ist (§6 Weg A), gibt es **kein WebGL** und der Rückfall wäre eine
Behauptung ohne Sachgrund. Die ehrliche Fassung: `prefers-reduced-motion`
schaltet die Play-Animation ab (kein Rückfall der ganzen Ansicht), und der
WebGL-Check greift nur, wenn Weg B gewählt wird. Muster für den Check
existiert (`ThreeDMap.tsx` `noWebgl`, `TerrainMap.tsx`, `GlobeMap.tsx`).

---

## 6 Architekturentscheidung: wie entsteht die Szene?

### Weg A — axonometrischer SVG-Schnitt (Empfehlung)

Der vorhandene `SectionChart`-Pfad (SVG + `sectionImage`-Canvas als `<image>`)
bekommt eine affine Transformation und ein Routen-Band statt des
Gelände-Profils.

- **Passt zur Vorlage** — die Mobile-Referenz *ist* dieser Renderer.
- Kein Shader, kein Custom-Layer ⇒ **kein STOPP & FRAGEN**, kein WebGL-Risiko,
  kein Mobile-GPU-Thema, keine Governor-Wechselwirkung.
- Zeit-Slider läuft über `sectionAtTime` synchron — Bestand, gemessen tragfähig.
- Verdeckung exakt über Zeichenreihenfolge/Clip (B5).
- Grenze: echte Tiefe ist gemalt, nicht gerechnet. „Blick Süd → Nord" ist
  eine Scherung, keine Kamera; freies Drehen gibt es nicht (die Vorlage
  zeigt auch keins — nur Reset/+/−).

### Weg B — MapLibre-3D-Terrain + `CurtainLayer`

`TerrainMap` + `CurtainLayer` existieren und liefern echtes Relief mit echtem
Depth-Test und Überhöhung.

- Echte Kamera, echte Verdeckung, echte Geländeform.
- **Sieht anders aus als die Vorlage** (Kartentextur, Horizont, Beleuchtung).
- Berührt die WebGL-Pipeline ⇒ **STOPP & FRAGEN**; Custom-GL-Layer brauchen
  laut WF4-Lehre drei Einträge (`CUSTOM_GL_LAYERS`, Lizenzträger,
  `stateRef` + `applyState`-Deps).
- Zusätzliche DEM-Last: Terrarium-Kacheln für den Kartenausschnitt statt nur
  entlang einer Linie. Größenordnung aus LE0 zum Vergleich: die Wetterkarte
  zog 90 Kacheln in 11,5 s — für einen Tour-Ausschnitt deutlich weniger,
  aber ungemessen.

**Empfehlung: Weg A**, weil er die Vorlage trifft, den Bestand
weiterverwendet und die riskanteste Projektzone gar nicht erst betritt.
Weg B bleibt als späterer „echtes Relief"-Aufsatz möglich, ohne dass Weg A
etwas verbaut — beide lesen denselben `CrossSection`.

---

## 7 Plan (Vorschlag)

| Phase | Inhalt | Gate |
|---|---|---|
| **R3D-1** | Gerüst: Ansichtsumschalter 2D/3D im Ergebnis-Screen ohne Remount, Pfad `/tourenplanung/3d` + Alias, Shell/Kopf/Rail aus `RouteDeck`, leere Szene mit Achsen, Chips, Reglerblock (Position + Zeit gekoppelt, entkoppelbar, Play) | Zustand überlebt den Wechsel in beide Richtungen (Beleg), `verify:routing` grün |
| **R3D-2** | Szene 1a: Geländeprofil + Routenband (Temperatur), Windwand (5 Stufen), Regen-Säulen, Wolkenbasis, Schneefallgrenze, Warnzone; Verdeckung am Geländepolygon | Verdeckung an drei Profilen belegt; Farben stufig; jede Fläche trägt Text |
| **R3D-3** | Punkt-Abfrage rechts (320 px) inkl. Mini-Vertikalschnitt, Ehrlichkeitszeilen (Auflösung je Tour, Quellen je Land, Konfidenz, Lücken DE/AT/CH) | B1/B2 mit echten Zahlen im UI; Länder-Asymmetrie sichtbar |
| **R3D-4** | Responsive Tablet 834 / Mobile 390 nach Vorlage; Touch ≥ 44 px; `prefers-reduced-motion` | drei Breiten belegt, Desktop pixelgleich zur Vorlage |
| **R3D-5** | Verifier `verify:route-3d` (Szenen-Geometrie, Kopplung Position↔Zeit über ETA, Bandfarben-Stufen, Warnzone-km-Spanne, Ehrlichkeitstexte) | Zähllauf grün, erste headless-Abdeckung für `src/threed` + `src/route` |
| *(offen)* | R3D-6 = 1b Zeitkorridor · R3D-7 = 1c Go/No-Go | eigene Gates |

---

## 8 Offene Entscheidungen (Jan)

| # | Frage | Default, wenn nichts gesagt wird |
|---|---|---|
| **E1** | Szenen-Technik: Weg A (SVG-Axonometrie) oder Weg B (MapLibre-Terrain, STOPP & FRAGEN)? | **A** |
| **E2** | Pfad: `/tourenplanung/3d` kanonisch + `/route/3d` als 301-Alias? | **ja** |
| **E3** | Umfang: nur 1a — oder 1a + 1b + 1c in einer Linie? | **nur 1a**, 1b/1c als Folgephasen |
| **E4** | B1: Auflösungs-Chip zeigt die echten 6–14 km / 300 m statt „≈ 2 km · 333 m"? | **ja** (Ehrlichkeit schlägt Mockup) |
| **E5** | B2: Kopfzeile zeigt den Länder-Stack statt „ICON-D2" | **ja** |
| **E6** | Warnzone ist DE-only, Schneefallgrenze AT/CH-only: als Lücke ausweisen oder Layer im betroffenen Land ausblenden? | **ausweisen** (Layer bleibt, sagt „keine Daten in AT") |
| **E7** | Wolkenbasis trägt den Vorbehalt „abgeleitet (LCL)" direkt am Label | **ja** |

---

## 9 Verbesserungskatalog (D-28)

- **V-R3D-1** — `src/route/` hat keine Persistenz; ein Reload verliert die
  ganze Tour. Mehrwert: Ein Neuladen (oder ein versehentlicher Zurück-Klick)
  kostet heute Datei-Upload und Neuberechnung. Skizze: Track + Parameter in
  IndexedDB, Wiederherstellungs-Angebot beim Öffnen — eigene Phase, kein
  R3D-Bestandteil.
- **V-R3D-2** — DE-Punktforecast hat nur 24 h Horizont (AT/CH 60 h). Touren
  ab morgen früh laufen in DE ins `beyond_horizon`-Flag. Skizze: Horizont je
  Land im Startzeit-Schritt nennen, bevor gerechnet wird.
- **V-R3D-3** — Kein Verifier für `src/threed`/`src/route` (B6). Skizze:
  mit R3D-5 nachziehen, dabei `windEffect`, `weatherAggregate` und
  `curtainMesh` mit abdecken.
- **V-R3D-4** — Warnungen sind DE-only (`TourWarning.source: 'dwd_cap'`).
  Mehrwert: Auf AT/CH-Touren fehlt die amtliche Warnung vollständig, ohne
  dass es jemand merkt. Skizze: GeoSphere-/MeteoSwiss-CAP-Adapter (die
  MeteoAlarm-Lehren aus W2 gelten).

---

## 10 Was diese Diagnose *nicht* geprüft hat

- **Keine Browser-Messung**: DEM-Kachelzahl und Ladezeit für einen
  Tour-Korridor, Long Tasks beim Abspielen und die Bildrate der Szene sind
  ungemessen. Das gehört in R3D-2 (Prod-Build, nicht Dev).
- **Keine Prüfung der Tablet-/Mobile-Vorlagen von 1b und 1c** — erst
  relevant, wenn E3 sie in den Umfang nimmt.
- **Keine Aussage zur Bundle-Größe.** Weg A fügt kein Paket hinzu, Weg B
  zieht maplibre in den Tour-Chunk; das Budget (`totalJs`) müsste dann neu
  geratscht werden.

---

## 11 Entscheidungen (2026-08-28)

| # | Entscheidung | Stand |
|---|---|---|
| **E1** | **Weg A — axonometrischer SVG-Schnitt.** MapLibre-Terrain/`CurtainLayer` bleiben unangetastet; die WebGL-Pipeline wird nicht berührt (kein STOPP & FRAGEN nötig). | Jan, 2026-08-28 |
| **E2** | **`/tourenplanung/3d`** kanonisch, **`/route/3d`** als 301-Alias. | Jan, 2026-08-28 |
| **E3** | **Nur 1a** in dieser Linie. 1b (Zeitkorridor) und 1c (Go/No-Go) sind eigene Phasen mit eigenem Gate. | Jan, 2026-08-28 |
| **E4–E7** | Nicht beantwortet ⇒ **Defaults aus §8 gelten**: Auflösungs-Chip nennt die echten 6–14 km / 300 m; Kopfzeile nennt den Länder-Stack; Warnzone und Schneefallgrenze bleiben als Layer sichtbar und weisen die Länder-Lücke aus; die Wolkenbasis trägt „abgeleitet (LCL)". Rücknahme jederzeit möglich — die vier Texte liegen an je einer Stelle. | Default |

**Folge aus E1 für B7:** Es gibt keinen WebGL-Pfad, also auch keinen
WebGL-Rückfall. Was bleibt: `prefers-reduced-motion` schaltet die
Play-Animation ab (die Ansicht bleibt vollständig bedienbar), und die Szene
degradiert bei fehlenden Daten pro Layer sichtbar, nicht als Ganzes.

---

## 12 Umsetzung R3D-1…5 (2026-08-28) — Gate **GR3D-1**

Gebaut wurde Weg A: die Szene ist ein **axonometrischer SVG-Schnitt**. Kein
Shader, kein Custom-Layer, kein maplibre — die WebGL-Pipeline ist unberührt.

### 12.1 Was entstanden ist

| Datei | Rolle | Zeilen |
|---|---|---|
| `src/route/route3d/scene.ts` | **pur**: Parallelprojektion (`makeProjection`), Höhenbereich/-linien, Gelände-, Himmels- und Kappenpfad, Ebenen-Parallelogramm, `freeSpan` | ~230 |
| `src/route/route3d/model.ts` | **pur**: `buildScene` (Spalten, Windwand, Regen, Wolkenbasis, Warnzonen, Verfügbarkeit), Kopplung `etaAtDist`/`distAtEta`, Ehrlichkeits-Texte | ~430 |
| `src/route/route3d/Scene3D.tsx` | die SVG-Szene | ~300 |
| `src/route/route3d/Route3DView.tsx` | Kopf, Chips, Bühne, Punkt-Abfrage, Regler, Fußzeile | ~470 |
| `src/route/route3d/route3d.css` | Prefix `r3-`, drei Breakpoints | ~250 |
| `scripts/verify-route-3d.mjs` | neuer Verifier | 82 Prüfungen |

Geändert: `routes.ts` (Sub-Route `3d` mit `noindex`, `CROSS_ALIASES`,
`routeForPath(…, cross)`), `router.tsx` (Cross-Alias-Routen clientseitig),
`netlify.toml` (301 `/route/3d`, 200 `/tourenplanung/*`), `TourRoute.tsx`,
`RoutePage`/`RouteResult`/`TourView` (Modus durchgereicht, Weiche, Umschalter),
`routeDeck.css` (Umschalter + Viewbar), `windEffect.ts` (`bearingAtDist` aus
`TourView` herausgelöst — 1:1 heißt importieren), `budget.json`.

### 12.2 Gate-Belege

| Frage | Beleg |
|---|---|
| **Funktionserhalt** | Der 2D-Ergebnis-Screen ist unverändert; hinzugekommen ist nur die Leiste mit dem Umschalter. Browser: 3D → 2D → 3D behält Strecke, Wetter **und** Scrub-Position (7,9 km; der 2D-Scrubber zeigt „Höhenprofil 7,9 km"). Browser-Zurück führt von 3D nach 2D, Tour bleibt. |
| **Kein Remount (B3)** | `Route3DView` rendert innerhalb von `TourView`; der Pfad wechselt über `useNavigate` auf derselben Route mit optionalem Param. Verifier prüft beides als Textsonde. |
| **Desktop / Tablet / Mobil** | 1440×900: zweispaltig, Punkt-Abfrage 320 px. 834×1112: einspaltig, Kacheln vierspaltig, kein horizontales Scrollen. 390×844: Szene 38 % der Höhe mit Verlauf, Chips horizontal scrollbar, Kacheln zweispaltig, **kein** Touch-Ziel < 44 px (gemessen). |
| **Konsole** | Nur die vorbestehende liberty-Stil-Warnung („Expected value to be of type number, but found null", V-RL-3). Ein einmaliger HTTP 429 kam aus der Anreicherung (GeoSphere-Rate-Limit, Bestand — V-EZ-3). |
| **Verifier** | `verify:route-3d` **82/82**, `verify:routing` **104/104** (+6), `verify:event-zone` 41/41, `typecheck` grün. |
| **Budget** | totalJs 1 021,9 / **1 024** KB (Ratsche von 1 017,7 angehoben), eagerJs 102,7/106,5 unverändert, largestChunk unverändert. Die 3D-Ansicht ist ein eigener Lazy-Chunk (**10,6 KB gzip** JS + 2,7 KB CSS); der Tour-Chunk **sank** von 47,9 auf 39,2 KB gzip — das 2D-Ergebnis zahlt für 3D nichts. |

### 12.3 Was die Umsetzung gegenüber der Vorlage ändert (E4–E7, gemessen im Browser)

- **Auflösung**: „≈ 6 km · 300 m" auf der Alpentour, „≈ 10 km · 300 m" im
  Mittelgebirge — aus `radiusForTerrain`, nicht als Literal.
- **Quellen**: AT-Tour „GeoSphere (AROME + INCA + TAWES)", DE-Tour
  „DWD (ICON-D2 / MOSMIX + Live + RADOLAN)" — je Land, wie gemessen.
- **Lücken**: auf der AT-Tour trägt der Warn-Chip „ohne Daten" und darunter
  steht der Satz, dass DWD-Warnungen dort nicht greifen; auf der DE-Tour
  heißt es stattdessen „Für den Zeitraum liegt keine amtliche Warnung vor".
- **Wolkenbasis**: „Wolkenbasis ≈ 1 483 m · abgeleitet".
- **Regen**: 0,0 mm/h wird als „trocken · Modell erwartet nichts" gezeigt, nicht
  als Zahl mit Quellenangabe.
- **Wind**: die Himmelsrichtung steht immer, das Wort Gegen-/Rückenwind erst ab
  der Schwelle, ab der er spürbar schiebt oder bremst.

### 12.4 Zwei Fallen, die beim Bauen aufgefallen sind

1. **Ein Label in der Verdeckungsmaske ist unsichtbar.** „Wolkenbasis 1 544 m"
   stand rechts am Bildrand — hinter dem 2 234-m-Gipfel, also weggeclippt.
   Beschriftungen gehören aus der Maske heraus und in die längste Spanne, in der
   die Ebene frei liegt (`freeSpan`, seither im Verifier).
2. **Lazy laden verschiebt CSS.** Der 2D/3D-Umschalter steht auch im
   2D-Ergebnis; seine Regeln mussten aus `route3d.css` (lazy) nach
   `routeDeck.css` wandern, sonst wäre er dort unformatiert.

### 12.5 Offen

- **Prod-Messung** (Long Tasks beim Abspielen, Bildrate der Szene) — Dev-Server
  und Automations-Browser sind dafür nicht aussagekräftig; der Browser meldete
  hier ohnehin `prefers-reduced-motion: reduce`, das Abspielen war also aus.
- **V-R3D-1** (Reload verliert die Tour) bleibt bestehen — im Test bestätigt:
  jeder Viewport-Wechsel der Emulation lud neu und verlangte einen neuen Upload.
- 1b (Zeitkorridor) und 1c (Go/No-Go) sind nicht gebaut (E3).

---

## 13 Phase 1b „Zeitkorridor" — Diagnose (2026-08-28)

Auftrag: `starte 1b`. Vorlagen `reference/1b-zeitkorridor-{desktop-1440,tablet-834,mobile-390}.png`
(@2x — CSS-Pixel = Bildmaße ÷ 2). Grundlage bleibt E1 (SVG-Axonometrie) und
E2 (`/tourenplanung/3d`); 1b ist ein **Modus derselben Szene**, keine zweite Ansicht.

### 13.1 Was die Vorlage zeigt

Kopf und Rahmen sind identisch zu 1a (Logo, „← Ergebnis", 2D/3D-Umschalter,
Rail, Statuszeile) — der Eyebrow wechselt auf `3D-ANSICHT · ZEITKORRIDOR`, die
Unterzeile fragt **„Wo bin ich um welche Uhrzeit — und was zieht dann über mich
hinweg?"** (Tablet/Mobil verkürzt zu „Wo bin ich um 11:30?").

| # | Element | Desktop | Tablet | Mobil |
|---|---|---|---|---|
| 1 | Chips: Wetterperlen zur ETA · Zellzug · Wind zur Fahrtrichtung · Wolkenbasis · Schneefallgrenze (die ersten drei an) | ✅ | ⊘ (nicht gezeigt) | ⊘ |
| 2 | Badge oben rechts „Radar-Nowcast bis 11:45 · danach Modell" | ✅ | ⊘ | ⊘ |
| 3 | Szene mit **Wetterperlen** an den ETA-Knoten (Uhrzeit · km, Icon, Temperatur, Windwort) mit gestrichelter Führungslinie auf die Strecke | 5 Perlen | 2 Perlen | 1 Perle |
| 4 | **Zellzug**: schraffiertes Regenfeld, gestrichelte Ellipse, Pfeil, „Zelle 11:20 · Zug 32 km/h", zweite Ellipse „12:20 durch"; der getroffene Streckenabschnitt **blau verdickt** | ✅ | reduziert (Ellipse + Pfeil + blauer Abschnitt) | blauer Abschnitt + Kopfbadge „ZELLE TRIFFT 11:05 · km 12" |
| 5 | **Windpfeile zur Fahrtrichtung** entlang der Strecke (grün Rücken / orange Seite / rot Gegen) + Legendenkasten | ✅ | ⊘ | ⊘ |
| 6 | Notiz-Badge „DIE ROUTE IST DIE ZEITACHSE · Jede Perle = deine Ankunft dort" | ✅ | ⊘ | ⊘ |
| 7 | Wolkenbasis-/Schneefallgrenzen-Ebene mit Label | ✅ | angedeutet | ⊘ |
| 8 | Rechte Spalte 320 px: **DEIN ZEITFENSTER** (Zeit · Kurztext · Statuspunkt, aktive Zeile hervorgehoben) | 5 Zeilen | als Karte unter der Szene | als Karte |
| 9 | **BESSERER START** (grüne Karte): „10:00 statt 08:30", Begründung mit Zahlen, Knopf „Startzeit übernehmen" | ✅ | ✅ | ✅ |
| 10 | **TREFFER-WAHRSCHEINLICHKEIT**: Balken über die Uhrzeit, 0–80 %, Bildunterschrift „Radar-Nowcast · minutengenau bis 11:45" | ✅ | ⊘ | ⊘ |
| 11 | Reglerblock **„UHRZEIT FÜHRT — POSITION FOLGT"** + `gekoppelt`, Ableseleiste rechts, zwei Spuren (Uhrzeit blau mit markiertem Regenfenster, Position orange) | ✅ | ✅ (eine Zeile) | nur Uhrzeit-Spur |
| 12 | Aktionen: „Zellzug abspielen · 15-Min-Raster", „Startzeit variieren — beste Stunde suchen", „Ansicht teilen" | ✅ | ⊘ | ⊘ |
| 13 | Fußzeile: „Zellzug aus Radar-Nowcast extrapoliert (INCA/RADOLAN) · ab 11:45 Modellwerte · Perlen zeigen die höhenkorrigierte Temperatur zur Ankunftszeit." | ✅ | ⊘ | ⊘ |

**Der Unterschied zu 1a in einem Satz:** 1a fragt „wie sieht es bei km X aus",
1b fragt „wo bin ich um Uhrzeit T" — dieselbe Szene, **umgekehrte Kopplung**,
plus vier neue Aussagen (Perlen, Zellzug, Zeitfenster, besserer Start).

### 13.2 Datenlage je neuem Element

| # | Element | Quelle im Code | Lage |
|---|---|---|---|
| 3 | Wetterperlen zur ETA | `TourTiming.milestones` + `SampleETA.etaMs/weather` | ✅ vollständig, nichts Neues nötig |
| 4 | „getroffener km-Abschnitt zur Zeit T" | `RadarNowcastSampler.sample(lat, lon, T)` — beliebiges T im Horizont | ✅ **ableitbar** (km × Zeit-Feld) |
| 4 | „Zelle · Zug 32 km/h" + Ellipse | — | ❌ **nicht ableitbar** (B10) |
| 5 | Windpfeile zur Fahrtrichtung | `windEffect.ts` (`bearingAtDist`, `headwindComponentMps`), in 1a schon als `windRel`/`windComponentKmh` je Spalte | ✅ vollständig |
| 2/13 | „Radar-Nowcast bis HH:MM" | `RadarNowcastSampler.meta.validUntilMs` | ⚠️ vorhanden, aber **nicht durchgereicht** (B9) |
| 8 | Zeitfenster-Zeilen | abgeleitet aus den Spalten (Regen, Böen, Warnung, Wind) | ✅ regelbasiert |
| 9 | Besserer Start | Cluster-Forecasts + Radar-Sampler **innerhalb** der Anreicherung | ⚠️ heute verworfen (B11) |
| 10 | Treffer-**Wahrscheinlichkeit** | — | ❌ **nicht vorhanden** (B8) |

### 13.3 Befunde

#### B8 — „Treffer-Wahrscheinlichkeit" hat keine Datengrundlage

Die Punkt-Kette führt **nirgends** eine Niederschlagswahrscheinlichkeit:
weder `PointSourceSample` noch `PointForecastHour` noch `SampleWeather` haben ein
solches Feld (`grep -rin "probab|poprob" src/pointForecast/` findet genau einen
Kommentar in `radarSample.ts:57`, der auf das **Karten**-Flow-Gitter verweist).
Der `poprob`-Layer der Wetterkarte ist ein RADOLAN-gespeistes Raster einer
anderen Pipeline und DE-only.

Balken mit „80 %" wären also erfunden. **Vorschlag:** dieselbe Stelle, andere —
echte — Größe: **Regen je Startzeit**. Für jede Kandidaten-Startzeit die
Minuten der Tour im Regen und die Spitzenrate. Das ist rechenbar (B11), es ist
genau die Größe, die die Karte „Besserer Start" darüber begründet, und die
Balkenachse wird damit zur Startzeit-Achse — passend zum Knopf „Startzeit
variieren". Die Konfidenz (`confidence.precipitation`) bleibt daneben als
eigenes Wort, nicht als Prozentzahl verkleidet.

#### B9 — Der Radar-Vorlauf ist je Land verschieden, in CH ist er null

`radarNowcast.ts` belegt drei verschiedene Horizonte:

| Land | Produkt | Frames | Horizont | Toleranz |
|---|---|---|---|---|
| DE | RADOLAN-RV | 25 | 0–120 min | 4 min |
| AT | GeoSphere INCA | 12 | 0,25–3 h | 10 min |
| CH | MeteoSwiss rzc | **1** | **h = 0** | 5 min |

Die Vorlagen-Zeile „Radar-Nowcast bis 11:45 · danach Modell" ist damit **echt
und länderabhängig** — für die Schweiz lautet der ehrliche Satz aber „kein
Radar-Vorlauf, alle Werte sind Modellwerte". `EnrichmentMeta` reicht diesen
Horizont heute **nicht** durch (es zählt nur `radarOverrides`); der Sampler ist
eine lokale Variable und wird nach der Schleife verworfen. Additive Ergänzung
nötig.

#### B10 — „Zelle · Zug 32 km/h" ist nicht ableitbar, das Ergebnis aber schon

Der Sampler exponiert `sample(lat, lon, etaMs)` — einen Punktabgriff, **keine
Frames**. Eine Zellgeschwindigkeit über Grund bräuchte entweder Zellverfolgung
(**KONRAD3D**: DE-only, nur konvektive Zellen, ≈ 0,9 MB je Abruf — und die
Vorlagenroute Oberstdorf → Kemptner Hütte überschreitet die Grenze, die Zelle
verschwände auf halber Strecke) oder eine Kreuzkorrelation der Radarbilder,
die es hier nicht gibt.

Was **exakt** ableitbar ist, ohne eine einzige neue Quelle: das Radarprodukt
ist bereits die Extrapolation. Ein Abgriff an jedem Streckenpunkt zu jedem
Zeitschritt des Horizonts ergibt das **km × Zeit-Regenfeld der Strecke** — und
daraus die Aussage, die der Nutzer eigentlich sucht: *welcher Abschnitt wann
nass ist*. „Regen trifft km 12–15 zwischen 11:05 und 11:40" ist damit belegt,
„Zug 32 km/h über Grund" nicht. Die Wanderung entlang der Strecke ist eine
andere Größe als die Zuggeschwindigkeit und wird, wenn überhaupt, als solche
benannt.

**Folge für die Zeichnung:** blau verdickter Abschnitt und Regenschraffur ja,
gestrichelte Zellellipse mit Grundgeschwindigkeit nein.

#### B11 — „Besserer Start" kostet keinen zusätzlichen Abruf — aber nur an einer Stelle

`weatherEnrichment.ts` hält beides, was eine alternative Startzeit braucht:
`forecasts[cIdx]` (stündlicher `PointForecast` je Cluster) und den
`RadarNowcastSampler` je Land. Beide sind **lokale Variablen** und nach
`return` weg. Wer die Startzeit variieren will, muss die Bewertung deshalb
**innerhalb** der Anreicherung machen — sonst lädt jede Kandidatenzeit die
Cluster erneut (Vorlage: 8 Kandidaten × ~9 Cluster = 72 Punktabfragen).

Zwei Umstände machen es geschenkt:

1. Der Horizont trägt schon Reserve: `neededHours = ceil((maxEta − now)/h) + 2`
   (`weatherEnrichment.ts:137`). Verschiebungen **bis +120 min** liegen damit
   im bereits geholten Fenster — **kein einziges zusätzliches Byte**.
   Negative Verschiebungen sind an `now` zu klemmen (früher als jetzt gibt es
   keinen Start).
2. Die Bewertung selbst ist reine Rechnung: je Kandidat und Sample ein
   Radar-Lookup (bilinear) plus eine Stunden-Interpolation.

Größenordnung: 17 Kandidaten (−120…+120 min im 15-min-Raster) × ~200 Samples
≈ 3 400 Lookups — Millisekunden, nicht Sekunden. Wird gemessen, nicht geschätzt.

#### B12 — Die Startzeit ändert auch die Fahrzeiten

`computeTimingIterated(…, startMs, …, sampler)` nimmt einen Wind-Sampler: der
Wind beeinflusst das Tempo, also die ETAs. Eine Empfehlung, die alle ETAs um
einen konstanten Betrag verschiebt, ist damit eine **Näherung**. Sie ist gut
genug für „ist die Zelle dann durch?", aber sie muss es sagen — und der Knopf
„Startzeit übernehmen" löst ohnehin die echte Neuberechnung aus (`onStart` →
`computeTimingIterated` → `enrichSampleWeather`), sodass die übernommene Zeit
danach mit echten Fahrzeiten dasteht. Der einzige Fehlerfall wäre eine
Empfehlung, die sich nach dem Übernehmen leicht verschiebt; das ist zulässig,
solange die Karte nicht behauptet, exakt zu sein.

#### B13 — Die Kopplung dreht sich nur um, sie entsteht nicht neu

1a koppelt Position → Zeit (`etaAtDist`), 1b Zeit → Position (`distAtEta`).
**Beide Funktionen gibt es seit 1a** samt Rundlauf-Prüfung im Verifier. 1b
braucht dafür keine neue Mechanik, nur eine Führungsachse als Zustand.

### 13.4 Plan

| Schritt | Inhalt | Berührt |
|---|---|---|
| **1b-1** | Radar-Horizont durchreichen: `EnrichmentMeta.radar[]` (Land, Quelle, `validUntilMs`, `frameCount`) — additiv | `weatherEnrichment.ts` |
| **1b-2** | Startzeit-Fenster in der Anreicherung: Option `startOffsetsMin`, Ergebnis `EnrichmentMeta.startWindow[]` (Verschiebung, Regenminuten, Spitzenrate, Böenspitze) — kein zusätzlicher Abruf (B11) | `weatherEnrichment.ts` |
| **1b-3** | Reines Modell `route3d/corridor.ts`: km × Zeit-Regenfeld, Regenfenster je Abschnitt, ETA-Perlen, Zeitfenster-Zeilen, Startempfehlung — DOM-frei, headless prüfbar | neu |
| **1b-4** | Ansicht: Modus `zeitkorridor` in `Route3DView` (Chips, Perlen, blauer Abschnitt, Windpfeile, Zeitfenster, Besserer-Start-Karte, Startzeit-Balken, zeitgeführte Regler) | `Route3DView.tsx`, `Scene3D.tsx`, `route3d.css` |
| **1b-5** | Verifier `verify:route-3d` erweitern (Korridor, Perlen, Startfenster, Kopplung zeitgeführt, Ehrlichkeitstexte) | `scripts/verify-route-3d.mjs` |

**Nicht gebaut** (Begründung oben): Zellellipse mit Grundgeschwindigkeit (B10),
Treffer-Wahrscheinlichkeit als Prozentzahl (B8). An ihrer Stelle stehen das
km-×-Zeit-Regenfenster und die Startzeit-Balken.

### 13.5 Offene Entscheidungen (Jan)

| # | Frage | Default, wenn keine Antwort |
|---|---|---|
| **E8** | 1b als **eigener Modus** in `/tourenplanung/3d` (Umschalter „Wetter · Zeit") oder eigener Pfad `/tourenplanung/3d/zeit`? | **Modus** — die Szene ist dieselbe, ein zweiter Pfad verdoppelte den Zustand (B3 gilt weiter: kein Tour-Zustand in der URL) |
| **E9** | Ersatz für die Treffer-Wahrscheinlichkeit: „Regen je Startzeit" (B8) | ja, so gebaut, Beschriftung nennt die Größe |
| **E10** | Zellellipse + „Zug km/h" ganz weglassen (B10) | ja, weglassen |
| **E11** | Kandidatenfenster für „Besserer Start" | −120 … +120 min im 15-min-Raster, an `now` geklemmt |

---

## 14 Umsetzung 1b-1…5 (2026-08-28) — Gate **GR3D-2**

Der Zeitkorridor ist ein **Modus derselben Szene** (E8), kein zweiter Pfad:
`/tourenplanung/3d` trägt beide, der Umschalter „Wetter entlang der Route |
Zeitkorridor" steht über den Ebenen-Chips und überlebt den Besuch im
`localStorage`.

### 14.1 Was entstanden ist

| Datei | Rolle | Zeilen |
|---|---|---|
| `src/route/route3d/corridor.ts` | **neu, pur**: Regenfenster (km × Zeit), Wetterperlen, Zeitfenster-Zeilen, Startempfehlung, Radar-Vorlauf-Sätze | ~330 |
| `src/pointForecast/weatherEnrichment.ts` | **additiv**: `RadarHorizon`, `StartWindowEntry`, `START_OFFSETS_MIN`, `evaluateStartOffsets`, `sampleDurationsMin` | +150 |
| `src/route/route3d/scene.ts` | `layoutCards` — überlappungsfreie Beschriftungskarten | +40 |
| `src/route/route3d/Scene3D.tsx` | Perlen, getroffener Abschnitt, Windpfeile, Relations-Legende | +130 |
| `src/route/route3d/Route3DView.tsx` | Modus, Chips je Modus, Zeitfenster, Startempfehlung, Startzeit-Diagramm, zeitgeführte Regler | +230 |
| `src/route/route3d/route3d.css` | Prefix `r3-`, drei Breakpoints | +110 |
| `scripts/verify-route-3d.mjs` | 82 → **166** Prüfungen | +84 |

`TourView` reicht `startOffsetsMin: START_OFFSETS_MIN` an die Anreicherung —
die einzige Änderung außerhalb der 3D-Ansicht.

### 14.2 Die vier Ersetzungen gegenüber der Vorlage

| Vorlage | Gebaut | Grund |
|---|---|---|
| „Zelle 11:20 · Zug 32 km/h" + Ellipse | **Regenfenster** „22:31–22:49 · km 0,0–0,7 · bis 0,1 mm/h · Modellwert" | B10 — eine Zuggeschwindigkeit über Grund ist aus einem Punktabgriff nicht ableitbar; *welcher Abschnitt wann nass ist* schon |
| „TREFFER-WAHRSCHEINLICHKEIT 80 %" | **„Regen je Startzeit"** — Minuten der Tour im Regen je Kandidat, mit dem Satz „**keine Wahrscheinlichkeit**" darunter | B8 — die Punkt-Kette führt keine PoP |
| „ICON-D2 · Radar bis 11:45" | **je Land**: „Österreich: Radar-Nowcast (INCA) bis 01:24, danach Modell" | B9 — DE 2 h, AT 3 h, CH gar keiner |
| „Regen 2,4 → 0,3 mm, Böen unverändert" | dieselbe Form, **plus** „Gerechnet mit denselben Fahrzeiten — nach dem Übernehmen rechnen wir sie neu" | B12 — der Wind ändert das Tempo, die Empfehlung hält es fest |

### 14.3 Gate-Belege

| Frage | Beleg |
|---|---|
| **Funktionserhalt** | 1a ist unverändert erreichbar und vollständig (Punkt-Abfrage, Windwand, Warnzone, Mini-Schnitt). Gemessen: Moduswechsel hin und zurück behält die Position (km 6,8 in beiden), 3D → 2D → 3D behält sie ebenfalls (der 2D-Scrubber zeigt „Höhenprofil 6,8 km"), Browser-Zurück führt nach 2D mit erhaltener Tour. |
| **Kein zusätzlicher Abruf (B11)** | `startOffsetsMin` liegt im bereits geholten Horizont; die Bewertung ist reine Rechnung. `pointForecastCalls` unverändert, Netzwerkbild unverändert. |
| **Der Kreis schließt sich** | AT-Tour: Empfehlung „Start um 00:16 statt 22:31: 99 statt 180 Minuten im Regen" → „Startzeit übernehmen" → Tour rechnet **echt** neu (00:16 → 09:14, also 8 h 58 statt 8 h 55 — genau die Abweichung, die B12 vorhersagt) → die Karte sagt danach ehrlich „Keine Startzeit im Fenster ±2 h ist spürbar besser". |
| **Zeit führt** | Reglerreihenfolge `Uhrzeit`, `Position`; die Zeitbahn auf 70 % geschoben bewegt Ablesezeile (22:20 · km 0,0 → 02:35 · km 6,8) **und** Szenen-Marker (x 62 → 750). |
| **Länder-Asymmetrie sichtbar** | DE-Tour: „Schneefallgrenze — ohne Daten", Fußzeile „DWD …". AT-Tour: Schneefallgrenze vorhanden, Fußzeile „Österreich: Radar-Nowcast (INCA) bis 01:24, danach Modell · Quellen: GeoSphere (AROME + INCA + TAWES)". |
| **Desktop / Tablet / Mobil** | 1440×900 zweispaltig mit 320-px-Spalte; 834×1112 einspaltig, Zeitfenster und Empfehlung nebeneinander, Diagramm darunter; 390×844 Szene 320 px (38 % der Höhe), Chips horizontal scrollbar, **kein** Touch-Ziel < 44 px (gemessen), kein horizontales Scrollen der Seite. |
| **Konsole** | Nur die vorbestehende liberty-Warnung („Expected value to be of type number, but found null", V-RL-3). |
| **Verifier** | `verify:route-3d` **166/166** (+84), `verify:routing` 104/104, `verify:event-zone` 41/41, `verify:radar-sampling` 25/25, `verify:layer-geometry` 76/76, `typecheck` grün. |
| **Budget** | totalJs 1 027,4 / **1 027,5** KB (Ratsche von 1 024 angehoben), eagerJs 102,7/106,5 **unverändert**, largestChunk unverändert. Der 3D-Chunk wuchs von 10,6 auf 15,0 KB gzip (+ CSS 3,6 KB); der Tour-Chunk 39,2 → 39,7 KB (`START_OFFSETS_MIN` + die Meta-Felder). |

### 14.4 Sieben Befunde aus dem Browser, die den Code geändert haben

Alle sieben waren im Kopf nicht zu sehen — sie kamen aus dem laufenden Bild:

1. **Die Windwand lief im Zeitkorridor weiter**, obwohl sie dort kein Chip ist:
   ein eingeschalteter Zustand ohne Schalter, der zusätzlich die Windpfeile
   übermalte. Die Szene bekommt jetzt eine **gefilterte** Fassung der Ebenen je
   Modus; der Speicher bleibt unangetastet.
2. **Zwei Perlen klebten aufeinander** („21:50 · km 0,0" und „22:00 · km 0,5").
   Erst mit einem Mindestabstand — dann fiel auf, dass der Abstand **in
   Kilometern** nichts über die Kartenbreite **in Pixeln** sagt: „02:15 · km 6,8"
   und „02:54 · km 8,1" lagen trotz 1,3 km übereinander. Jetzt entscheidet
   `layoutCards` in Bildkoordinaten (und ist headless geprüft).
3. **Die Abstandsregel darf nicht für die Liste gelten.** Mit ihr fehlten in
   „Dein Zeitfenster" die Stunden 00:00 und 01:00 — während einer langen Pause
   bewegt sich die Position kaum. Genau dort ist „wo bin ich um 01:00?" aber
   eine berechtigte Frage. Die Liste ruft jetzt ohne Abstand auf; **eine
   Zeichen-Auflage ist keine fachliche.**
4. **Ohne Abstand stand dieselbe Spalte zweimal** („21:57 Start" und „21:57 ·
   km 0,0"). Zwei Regeln, zwei Gründe: verschiedene Spalte (fachlich) **und**
   Abstand (zeichnerisch).
5. **Ein einzelnes nasses Sample hatte die Ausdehnung null** — „22:24–22:24 ·
   km 0,0–0,0", und der blaue Abschnitt wurde gar nicht gezeichnet. Ein Sample
   steht für seine **Umgebung**: das Fenster reicht jetzt bis zur Mitte zum
   trockenen Nachbarn, an den Streckenenden bleibt die Kante.
6. **Ein fehlender Wert am Tourende kippte die ganze Empfehlung.** `complete`
   war „kein einziges Sample fehlt"; bei einer 9-Stunden-Tour fällt der letzte
   Punkt aus dem Forecast-Horizont, und die Ansicht sagte „konnten nicht
   durchgerechnet werden". Jetzt trägt jeder Eintrag seine **Abdeckung**;
   ab 90 % ist er vergleichbar, und unter 100 % steht der Vorbehalt im Satz
   („Für 8 % der Strecke liegt in diesem Fenster kein Wert vor").
7. **„ohne Daten" war für den Regen-Chip eine Falschaussage** — die Werte sind
   da, sie sagen nur nichts Nasses. Der Chip sagt jetzt „trocken";
   „ohne Daten" bleibt der Schneefallgrenze in DE.

Dazu drei Kleinigkeiten aus demselben Blick: der 2D/3D-Umschalter stand mobil
**zweimal** (Shell-Kopf + Ansicht), die Relations-Legende lief unter die
Überhöhungs-Knöpfe, und die gestrichelten Höhenebenen liefen quer durch ihre
eigene Beschriftung (jetzt Kontur-Rand über `paint-order`).

### 14.5 Zwei Sonden, die auf ihrer eigenen Begründung anschlugen

`verify:route-3d` prüft, dass „Zug 32 km/h" und „Treffer-Wahrscheinlichkeit"
**nicht** im Code stehen — und schlug zuerst auf den Kommentaren an, die
erklären, warum sie fehlen. Textsonden dieser Art müssen den Quelltext **ohne
Kommentare** lesen (`codeOnly` im Verifier); sonst verhindert die Dokumentation
einer Auslassung genau deren Prüfung.

### 14.6 Offen

- **Prod-Messung** (Long Tasks beim Abspielen) — unverändert offen aus GR3D-1.
- **V-R3D-1** (Reload verliert die Tour) — in dieser Runde erneut bestätigt:
  jeder Viewport-Wechsel der Emulation verlangte einen neuen Upload.
- **V-R3D-2 (neu):** `take_screenshot` lief im Automations-Browser bei DPR 3
  wiederholt in den 120-s-Timeout; Tablet und Mobil wurden deshalb zusätzlich
  **numerisch** belegt (Elementmaße, Überlappungen, Touch-Ziele). Für die
  nächste UI-Phase: Maße messen, Bilder nur zur Kontrolle.
- **V-R3D-3 (neu):** „Startzeit übernehmen" führt kurz auf das 2D-Ergebnis
  zurück, weil `show3d` an `weatherState.kind === 'ready'` hängt. Nach der
  Neuberechnung kehrt die Ansicht in denselben Modus zurück (gemessen). Ein
  Ladezustand **innerhalb** der 3D-Ansicht wäre ruhiger — eigene Phase.
- **1c (Go/No-Go)** bleibt ungebaut (E3).

---

## 15 Restposten vor 1c (2026-08-28) — Diagnose

Jans Auftrag: „kläre bevor wir mit 1c starten diese punkte noch: Prod-Long-Tasks,
V-R3D-1, V-R3D-2, V-R3D-3". Alle vier stammen aus §12.6 bzw. §14.6; keiner ist
eine Vermutung geblieben — jeder ist am Prod-Build nachgemessen.

**Messaufbau** (für §15.1–§15.3 identisch): `npm run build` → `vite preview`
(4179), Chrome-Automations-Browser, `PerformanceObserver({entryTypes:['longtask']})`
**vor** dem Upload installiert, Phasen über einen Marker getrennt. Strecke:
`test-routes/at-alpine-patscherkofel.gpx` (161 → 21 Wetter-Punkte, 8,6 km,
1 652 hm, alpin), Bergwandern, Start 23:09 → Ankunft 08:05 (8 h 56) — eine Tour,
die **nass** ist (1,6 mm, 2 h 17 Regen) und über den Radar-Vorlauf hinausläuft,
also beide 1b-Pfade wirklich beansprucht.

### 15.1 Prod-Long-Tasks — gemessen, keine Maßnahme

| Phase | Dauer | Long Tasks | ms/Bild |
|---|---|---|---|
| Upload → Strecke aufbereitet → Wetter berechnet | — | **2** (61 ms, 50 ms) | — |
| 3D-Ansicht öffnen (Lazy-Chunk + erstes Bild) | — | **0** | — |
| Moduswechsel 1a ↔ 1b | 20 ms | **0** | — |
| Zeitbahn scrubben, 122 Bilder hin und zurück | 2 010 ms | **0** | 16,5 |
| Positionsbahn scrubben, 122 Bilder | 2 034 ms | **0** | 16,7 |
| Scrubben in „Wetter entlang der Route" (1a), 122 Bilder | 2 013 ms | **0** | 16,5 |
| „Startzeit übernehmen" → volle Neuberechnung | 11,2 s (Netz) | **0** | — |

Dieselbe Messung mit **CPU-Drossel 4×** (82 Bilder je Lauf): 1a 22,6 ms/Bild,
Zeitbahn 18,3, Positionsbahn 19,6 — **jeweils 0 Long Tasks**. Der Grenzwert der
Selbstverifikation ist 200 ms; der größte gemessene Task der ganzen Sitzung ist
**61 ms** und liegt im Aufbereiten der Strecke, nicht in der 3D-Ansicht.

Damit ist die aus GR3D-1 offene Prod-Messung beantwortet: **die 3D-Ansicht
erzeugt keinen einzigen Long Task** — weder beim Öffnen noch beim Scrubben noch
beim Moduswechsel. Vorbehalt unverändert: DevTools-CPU-Drossel ist ein
Prozessbudget, kein Telefon (V-LE-13); eine Real-Device-Messung bleibt offen und
ist keine Frage dieser Phase.

### 15.2 V-R3D-2 — nicht reproduzierbar, Item geschlossen

Der Verdacht lautete: „`take_screenshot` läuft bei DPR 3 in den Timeout".
Gegenprobe in sechs Konfigurationen, alle **erfolgreich und schnell**:

| Viewport | Inhalt | Modus | Ergebnis |
|---|---|---|---|
| 1440×769 DPR 1 | 3D-Ansicht (Zeitkorridor) | Datei | ok |
| 390×844 DPR 3 | Upload-Seite | Datei | ok |
| 390×844 DPR 3 | Upload-Seite | **inline** | ok |
| 390×844 DPR 3 | **3D-Ansicht** | inline | ok |
| 390×844 DPR 3 | 3D-Ansicht | **fullPage** | ok |
| 390×844 DPR 3 | 2D-Ergebnis **mit laufender MapLibre-Karte** | Datei | ok |
| 834×1112 DPR 2 | direkt nach `emulate` (Reload in Flug) | Datei | ok |

Weder DPR 3 noch die Szene noch eine lebende WebGL-Karte lösen es aus. Der
Befund war ein **Zustand des Automations-Browsers in jener Sitzung**, keine
Eigenschaft der Ansicht. Die Lehre, die bleibt, ist keine Werkzeugregel, sondern
eine Messregel: **Maße sind der Beleg, Bilder sind die Kontrolle** — die
numerische Prüfung (Elementkästen, Überlappungen, Touch-Ziele) hat in §14 exakt
dieselben Aussagen getragen und war nicht vom Werkzeug abhängig.

Was der Ausfall damals gekostet hat, ist trotzdem echt: die **Sichtprüfung** von
Tablet und Mobil stand aus. Sie ist jetzt nachgeholt (§16.4) — und hat zwei
Darstellungsfehler gezeigt, die kein Zahlenwert meldet.

### 15.3 V-R3D-3 — kein Flackern, sondern ein zweiter Kartenaufbau

Gemessen wurde Bild für Bild (rAF-Schleife über den DOM) nach dem Klick auf
„Startzeit übernehmen":

| t nach Klick | Zustand |
|---|---|
| 0 ms | `.r3-root` da, Krume „· 3D-Ansicht · Bergwandern" |
| **+20 ms** | `.r3-root` **weg**, Krume „· Ergebnis", Status „Wetter pro Punkt wird geladen …" |
| **+51 ms** | `.maplibregl-map` **montiert** — die 2D-Karte baut sich auf |
| ≈ +11 200 ms | Wetter fertig, 3D-Ansicht zurück, Modus und Position erhalten |

Der Satz aus §14.6 („zeigt kurz das 2D-Ergebnis") war zu freundlich. Für elf
Sekunden entsteht eine **vollständige zweite Kartenansicht mit eigenem
WebGL-Kontext**, samt Kachel-Abrufen, nur um danach wieder zerstört zu werden —
ausgelöst von einer Zeile:

```ts
const show3d = showResult && view === '3d' && weatherState.kind === 'ready';
```

`show3d` beantwortet zwei verschiedene Fragen mit einem Wert: *„ist die
3D-Ansicht die aktive Ansicht?"* (Rahmen: Krume, Mobil-Kopf, Umschalter) und
*„gibt es Daten zum Zeichnen?"* (Szene). Nur die zweite hängt am Wetterzustand.
Die Trennung ist die ganze Maßnahme; ein Ladezustand innerhalb des Rahmens
ersetzt den Rückfall.

### 15.4 V-R3D-1 — was der Reload wirklich verliert

Zweimal in dieser Sitzung bestätigt: jeder `emulate`-Viewportwechsel lädt die
App neu, danach steht `/tourenplanung/3d` auf der Upload-Seite. Dasselbe gilt für
F5, für einen geteilten Link und für den Rücksprung aus einem anderen Werkzeug.

**Was verloren geht** (Zustand, den niemand sonst hält):

| Zustand | Ort | Wiederbeschaffung |
|---|---|---|
| `File` + `ParsedFile` | `RoutePage.status` | nur durch neuen Upload — **nicht** wiederherstellbar |
| `TourTrack` (Punkte, Samples, Wegpunkte, Meta) | `RouteResult.tour` | Neu-Parse **+ DEM-Abruf** (Netz) |
| Bewegungsart, Tempoprofil, Pausen, Richtung, E-Bike | `TourView` | Handarbeit |
| Startzeit, „Wetter berechnet" | `TourView` | Handarbeit + 11 s Abruf |

Der Pfad kann das nicht tragen (B3): eine hochgeladene GPX passt in keine URL.
Bleibt der Browser-Speicher. Drei Wege, an den Grenzen des Projekts gemessen
(`MAX_TRACKPOINTS` 100 000):

| Weg | Fassungsvermögen | Urteil |
|---|---|---|
| `localStorage` (JSON) | ~5 MB je Origin; 100 k Punkte ≈ **6,5 MB JSON** | fällt an der eigenen Obergrenze um — und synchron auf dem Hauptthread |
| `sessionStorage` | dito, und **nur derselbe Tab** | löst den geteilten Link nicht |
| **IndexedDB** (Structured Clone) | quotenabhängig, 100 k Punkte als vier `Float64Array` = **3,2 MB binär** | trägt den schlimmsten Fall, asynchron, Muster im Repo vorhanden (`iconD2WindSource.ts`) |

Entscheidung: **IndexedDB, spaltenweise**. Die Samples sind Referenzen auf
Elemente von `points` (`selectSamples` gibt `idxs.map(i => points[i])` zurück) —
gespeichert werden **Indizes**, nicht Kopien; das halbiert nicht nur die Größe,
es stellt die Identität wieder her.

Drei Auflagen, die aus den Projektregeln folgen und nicht aus dem Wunsch:

1. **Eine GPX ist ein Bewegungsprofil.** Sie darf nicht heimlich liegen bleiben.
   Die wiederhergestellte Tour sagt oben, dass sie aus dem Gerätespeicher kommt,
   nennt den Zeitpunkt und trägt **„verwerfen"** — ein Klick, und der Eintrag ist
   weg. Kill-Switch `?tour=0` bzw. `localStorage.tour = '0'` (Muster `?afEst=0`).
2. **Gespeichert wird erst ab der Planung**, nicht schon in der Vorschau —
   sonst landet der Reload in einem Schritt, den der Nutzer nie erreicht hat.
3. **Die Startzeit wird nicht erfunden.** Liegt die gespeicherte Startzeit
   außerhalb dessen, was die App selbst für gültig hält (`horizonState` ≠ `ok`,
   also > 1 h vergangen oder > 10 Tage voraus), rückt sie auf „jetzt" — und die
   Notiz sagt es. Keine zweite Zeitregel neben der bestehenden.
   Alterslimit des Eintrags: **7 Tage** (`TOUR_MAX_AGE_MS`).

Das **Wetter wird nie gespeichert.** Es ist der eine Teil, der nach Minuten
falsch wäre; nach dem Wiederherstellen wird es neu geholt — sichtbar, mit
demselben Ladezustand wie sonst.

### 15.5 Plan

| Schritt | Inhalt |
|---|---|
| **R1** | `src/route/tourStore.ts` — reine Pack-/Entpack-Funktionen (`packTour`/`unpackTour`, Spalten als `Float64Array`, Sample-Indizes), `isFreshEntry`, `restoreStartMs`, `tourStoreEnabled`; IndexedDB-Schale daneben (`saveTour`/`loadTour`/`clearTour`) |
| **R2** | Speichern in `TourView` (entprellt), Wiederherstellen in `RoutePage`; `TourView` nimmt `restore`-Vorgabe und eine Notiz-Zeile |
| **R3** | V-R3D-3: `in3d` (Rahmen) von `show3d` (Szene) trennen, Ladezustand **innerhalb** der 3D-Ansicht |
| **R4** | Verifier `verify:route-3d` um Pack-Rundlauf, Frische, Startzeit-Regel und die Rahmen/Szene-Trennung erweitern; Sichtprüfung Desktop/Tablet/Mobil nachholen |

Kein Punkt berührt Shader, Fusion, Edge Functions oder Manifeste — kein
STOPP & FRAGEN.

---

## 16 Umsetzung R1–R4 (2026-08-28) — Gate **GR3D-3**

### 16.1 Was entstanden ist

| Datei | Rolle | Zeilen |
|---|---|---|
| `src/route/tourStore.ts` | **neu**: reine Pack-/Entpack-Funktionen (Spalten, Sample-Indizes), Frische, Startzeit-Regel, Kill-Switch — dahinter eine schmale IndexedDB-Schale | ~270 |
| `src/route/RoutePage.tsx` | Eintrag beim Start anbieten, Status `restored`, „verwerfen" | +40 |
| `src/route/TourView.tsx` | entprelltes Speichern, Vorbelegung aus dem Plan, Notiz-Zeile, `in3d` ≠ `show3d`, Wartefeld | +80 |
| `src/route/routeDeck.css` | Notiz, Wartefeld, 44-px-Anfassfläche des Mobil-Zurück | +70 |
| `src/route/route3d/scene.ts` | `layoutCards`: Decke **vor** dem Vergleich, belegte Kästen | +15 |
| `src/route/route3d/Scene3D.tsx` | Kantenlabels je Modus, Wolkenbasis-Kasten belegen | +15 |
| `src/route/route3d/model.ts` | `LayerAvailability.emptyLabel` | +12 |
| `scripts/verify-route-3d.mjs` | 166 → **219** Prüfungen | +53 |

### 16.2 V-R3D-1 — gemessen

| Frage | Beleg |
|---|---|
| Überlebt die Tour den Reload? | Tour hochgeladen, gerechnet, 3D geöffnet → F5 → **dieselbe Tour**, derselbe Modus, dieselbe Startzeit (23:25), Pfad `/tourenplanung/3d`. Der Reload landet direkt im 3D-Rahmen. |
| Und den Viewport-Wechsel? | Von 1440 auf 834 emuliert (was die App neu lädt): Tour da, Startzeit **01:10** — also der Stand nach „Startzeit übernehmen", nicht der ursprüngliche. |
| Wird das Wetter mitgeschleppt? | Nein. Nach dem Wiederherstellen steht das Wartefeld „Wetter entlang der Route wird gerechnet …", danach die Szene mit frischen Werten. Kein Wert im Speicher trägt einen Wetter-Namen (headless geprüft). |
| Sagt die Ansicht, woher sie kommt? | „**Zuletzt geplante Tour wiederhergestellt** — gespeichert auf diesem Gerät, Fr., 28.08.2026, 23:25. Das Wetter wird frisch geholt." mit **verwerfen** und einem Schließkreuz. |
| Tut „verwerfen" das, was es sagt? | Klick → Eintrag aus IndexedDB **weg** (nachgelesen), Ansicht auf der Upload-Seite, `/tourenplanung/3d` zeigt wieder „dafür braucht sie erst eine Strecke". |
| Kill-Switch | `?tour=0` → kein Wiederherstellen, Upload-Seite — und der Eintrag bleibt **liegen**: ein Schalter, der Daten löscht, wäre kein Schalter. |
| Startzeit | Regel ist `horizonState`, nicht eine zweite eigene: −30 min bleibt stehen (die Tour läuft), −3 h und +20 d rücken auf „jetzt" und sagen es. |

### 16.3 V-R3D-3 — vorher/nachher am selben Klick

| | vorher (§15.3) | nachher |
|---|---|---|
| `.r3-root` | nach **20 ms** weg | bleibt der Rahmen, die **Szene** weicht dem Wartefeld (+15 ms) |
| Krume | wechselt auf „· Ergebnis" | bleibt „· 3D-Ansicht · Bergwandern" |
| MapLibre-Karte | **montiert bei +51 ms**, lebt ~11 s | **nie** (`everMap: false` über den ganzen Vorgang) |
| danach | 3D kehrt zurück | 3D kehrt zurück, Start 01:10 → Ankunft 10:07 |

Dasselbe gilt für den Reload-Weg: von der ersten Bildschirmzeile an steht der
3D-Rahmen, und es entsteht **keine** zweite Kartenansicht.

### 16.4 Was die nachgeholte Sichtprüfung gefunden hat

V-R3D-2 hatte die Bilder gekostet, nicht die Zahlen — und genau die fünf
folgenden Dinge meldet kein Zahlenwert:

1. **Tablet:** „Ziel · 2234 m" lag unter der Ziel-Perle. Die Höhentexte an den
   Streckenenden waren **auf dem Handy** abgeschaltet — eine Breiten-Regel für
   ein Modus-Problem. Im Zeitkorridor sagen die Perlen „km 0,0" und „Ziel"
   ohnehin; die Regel gilt jetzt je **Modus**.
2. **Desktop:** eine Perle verdeckte „Wolkenbasis ≈ 1488 m · abge—". Das Wort
   **„abgeleitet" ist eine Ehrlichkeitsauflage** (E-Entscheidung aus §12) und
   darf nicht hinter einer Beschriftung verschwinden. `layoutCards` kennt jetzt
   **belegte Kästen**: die Ebenen-Beschriftung wird gemieden wie eine Karte.
   Nachgemessen: 0 Überdeckungen.
3. **Latent, aus (2) gefunden:** `layoutCards` hat erst gehoben und **dann**
   geklemmt — eine Karte konnte dadurch genau auf der landen, der sie gerade
   ausgewichen war. Genau der Fehler, den §14.4 (2) im Browser gezeigt hatte.
   Die Decke gilt jetzt **vor** dem Vergleich.
4. **Deutsche Tour:** „Regen — **ohne Daten**" und „Warnzone — **ohne Daten**",
   obwohl DWD geliefert hat und es schlicht trocken und warnungsfrei war. Der
   Befund aus §14.4 (7) war nur für die **Zeitkorridor**-Chips behoben; die
   1a-Chips trugen ihn weiter. Jetzt entscheidet die Stelle, die es weiß:
   `LayerAvailability.emptyLabel` — „trocken", „keine Warnung" in DE, und in
   AT/CH bleibt es bei „ohne Daten", weil dort wirklich die Quelle fehlt.
   Im Browser belegt: `Regen trocken · Schneefallgrenze ohne Daten ·
   Warnzone keine Warnung` an einer DE-Tour.
5. **Mobil:** der Zurück-Knopf der Shell misst 32 px. Er trägt das Kopfzeilen-
   Raster **aller** Route-Screens, deshalb bleibt er 32 px groß — nur seine
   **Anfassfläche** wächst per `::after` auf 44 px. Kein Screen ändert sein Bild,
   und die Gate-Auflage stimmt wieder.

Nicht geändert, aber notiert: der Tourname steht mobil zweimal (Shell-Kopf +
Ansicht). Das ist das **bestehende Muster des Decks** — das 2D-Ergebnis macht es
genauso (`rd-result-title` neben `rd-m-title`). Eine Änderung wäre eine
Deck-Frage, keine 3D-Frage.

### 16.5 Gate-Belege

| Frage | Beleg |
|---|---|
| **Funktionserhalt** | Der frische Weg ist unverändert: Upload → Vorschau → Bewegungsart → Konfiguration → „Wetter berechnen" → Ergebnis → 3D (an einer DE- und einer AT-Tour durchlaufen). Neu ist nur ein **Angebot** beim Start, das man mit einem Klick los wird. |
| **Prod-Long-Tasks** | Endstand am Prod-Build: Wiederherstellen **0**, Zeitbahn 122 Bilder **16,4 ms/Bild, 0**, Positionsbahn **16,5 ms/Bild, 0**, Moduswechsel 33 ms **0**, Scrubben in 1a **16,5 ms/Bild, 0**. Mit CPU-Drossel 4×: 18,3 / 19,6 / 22,6 ms je Bild, **0**. Größter Task der ganzen Sitzung: **61 ms** (Strecke aufbereiten). |
| **Desktop / Tablet / Mobil** | Bilder in allen drei Breiten (Desktop 1440×900, Tablet 834×1112 DPR 2, Mobil 390×844 DPR 3). Mobil: **kein** Touch-Ziel < 44 px (Anfassflächen mitgemessen), kein horizontales Scrollen, Szene 320 px. |
| **Konsole** | Keine App-Fehler, keine Warnungen. Zwei Netz-Einträge des Browsers: DE-Tour **23 × HTTP 404** von `api.brightsky.dev/current_weather` an Sondierpunkten **westlich der Strecke** — der Code behandelt das ausdrücklich als „outside DE coverage" und macht daraus `null`; AT-Tour **1 × HTTP 429** von GeoSphere, verursacht von ~10 Neuberechnungen derselben Tour in 20 Minuten (Messlast, nicht Betrieb; vgl. V-EZ-3). |
| **Verifier** | `verify:route-3d` **219/219** (+53), `verify:routing` 104/104, `verify:layer-geometry` 76/76, `verify:radar-sampling` 25/25, `verify:event-zone` 41/41, `typecheck` grün. |
| **Budget** | totalJs 1 029,5 / **1 029,6** KB (Ratsche von 1 027,5 angehoben), eagerJs 102,7/106,5 **unverändert**, largestChunk unverändert. Der Tour-Chunk wuchs 39,7 → 41,6 KB gzip — das ist der Preis der Persistenz und des Wartefelds. |

### 16.6 Offen

- **Real-Device** statt DevTools-Drossel — die CPU-Drossel ist ein
  Prozessbudget, kein Telefon (V-LE-13). Gilt für die ganze Linie, nicht für
  diese Phase.
- **V-R3D-4 (neu):** die Punkt-Kette sondiert bei DE-Touren nahe der Grenze
  Punkte **außerhalb** des DWD-Netzes und erzeugt dabei 23 vermeidbare
  404-Einträge. Fachlich richtig behandelt, aber die Sondierung könnte Punkte
  jenseits der Landesgrenze überspringen. Gehört in die Punkt-Forecast-Kette.
- **1c (Go/No-Go)** bleibt ungebaut (E3) — jetzt ohne Restposten davor.

---

## 17 Phase 1c „Go / No-Go" — Diagnose (2026-08-29)

Auftrag: „starte mit 1c". Vorlagen `reference/1c-gonogo-relief-{desktop-1440,
tablet-834,mobile-390}.png`. Die Frage der Ansicht steht in ihrem eigenen
Untertitel: **„Wo wird es kritisch — und warum genau dort?"**

1a beantwortet „was zieht über meine Strecke", 1b „wo bin ich um welche
Uhrzeit". 1c ist die erste der drei Sichten, die eine **Entscheidung**
ausspricht — und damit die erste, in der ein falsches Wort teuer wird.

### 17.1 Was die Vorlage zeigt

| # | Element | Desktop 1440 | Tablet 834 | Mobil 390 |
|---|---|---|---|---|
| 1 | Krume „3D-Ansicht · Grenzwerte „Bergwandern"" | ✅ | verkürzt „· Grenzwerte" | ⊘ |
| 2 | Untertitel „Wo wird es kritisch — und warum genau dort?" | ✅ | ⊘ | ⊘ |
| 3 | Chip-Zeile **MEINE GRENZWERTE** (4 Chips + „+ Grenzwert") | ✅ mit Istwert je Chip | ✅ ohne Istwert | ⊘ |
| 4 | „Profil: Bergwandern T3 · gespeichert" | ✅ | ⊘ | ⊘ |
| 5 | Routenband **nach Status** eingefärbt (grün/amber/rot) | ✅ | ✅ | ✅ |
| 6 | No-Go-**Zone** über dem Abschnitt (gestrichelt) + Fahne „NO-GO · km 8–14" | ✅ | ✅ | ✅ |
| 7 | Szenen-Beschriftungen „GO bis km 8", „Rest: knapp", „Start · 08:30" | ✅ | ⊘ | ⊘ |
| 8 | Badge „FARBE = ENTSCHEIDUNG · Gelände bleibt stumm, bis du fragst" | ✅ | ⊘ | ⊘ |
| 9 | Legende „STATUS AM ABSCHNITT … nicht nur Farbe: jeder Abschnitt hat Text" | ✅ | ⊘ | ⊘ |
| 10 | **„WARUM · KM 11,0"**-Karte mit Vertikaldiagramm + Grenzwertlinie | ✅ | ✅ | Knopf „Warum? Schnitt bei km 11 öffnen" |
| 11 | Status-Karte NO-GO mit Zeitfenster + Begründungssatz | rechte Spalte | Banner oben | Karte |
| 12 | **ABSCHNITTE**-Liste (km · Status · Zeit · Werte) | ✅ 3 Zeilen | ✅ | ✅ kompakt |
| 13 | **GO-FENSTER** „Start 06:00 → durchweg Go" | ✅ | ✅ | ✅ |
| 14 | Knöpfe „Auswertung teilen" · „PDF" + Ehrlichkeitssatz | ✅ | ⊘ | ⊘ |
| 15 | Reglerblock, **beide Bahnen nach Status eingefärbt** | ✅ | ✅ | nur Position |
| 16 | „Frühesten Go-Start suchen" · „Grenzwerte bearbeiten" | ✅ | ⊘ | ⊘ |
| 17 | Fußzeile: Rechenweg + Konfidenz + „unklar"-Regel | ✅ | ⊘ | ⊘ |

Der Rahmen ist unverändert der von 1a/1b (Kopf, Umschalter 2D/3D, Szene,
rechte Spalte 320 px, Reglerblock). **1c ist ein dritter Modus auf demselben
Pfad**, kein vierter Screen — genau wie 1b.

### 17.2 Datenlage je neuem Element

| Element | Quelle im Code | Lage |
|---|---|---|
| Grenzwert **Böen** | `SceneColumn.gustKmh` ← `SampleWeather.gustMps`, höhenkorrigiert | ✅ |
| Grenzwert **Regen** | `SceneColumn.precipMmH` (+ `precipSource` Radar/Modell) | ✅ |
| Grenzwert **Gefühlt** | `SceneColumn.apparentC` | ✅ |
| Grenzwert **Wind** (Mittel) | `SceneColumn.windKmh` | ✅ |
| Grenzwert **Amtliche Warnung** | `SceneColumn.warnLevel` (1..5) | ⚠️ **DE-only** |
| Grenzwert **Sicht** | — | ❌ **existiert nicht** (C1) |
| Status je Abschnitt | eigene Rechnung auf den obigen | ✅ |
| „unklar" | `SceneColumn.confidence` + `UNCLEAR_BELOW` (`model.ts:400`) | ✅ |
| Zeitfenster des Abschnitts | `etaMs` je Spalte (dieselbe Diagonale wie `rainWindows`) | ✅ |
| „WARUM"-Diagramm | `windAtAGL` / `lclAgl` (`crossSection.ts`), wie `MiniProfile` in 1a | ✅ **abgeleitet** |
| Go-Fenster / „frühester Go-Start" | `meta.startWindow` (`StartWindowEntry[]`) | ⚠️ **reicht heute nicht** (C4) |
| Report-Text | Muster `GoNoGoPanel.buildReport()` (`src/threed/GoNoGoPanel.tsx:28`) | ✅ |
| PDF | `window.print()` wie `HistoryPro.tsx:228` + `@media print` | ✅ **ohne Dependency** |
| Teilen als Link | — | ❌ **unmöglich** (B3/C7) |

### 17.3 Befunde

#### C1 — „Sicht ≥ 1 km" hat im ganzen Repo keine Quelle

`SampleWeather` (`src/pointForecast/types.ts:98`) führt Temperatur, gefühlte
Temperatur, Wind, Richtung, Böe, Feuchte, Bewölkung, UV, Niederschlag,
Niederschlagsart, Schneefallgrenze, Föhn, Warnungen — **keine Sichtweite**.
`PointForecastHour` und `PointSourceSample` ebensowenig; die Suche nach
`visibility` über `src/` trifft ausschließlich MapLibre-Layer-Sichtbarkeit.
Brightsky führt ein Sichtfeld, die App liest es nicht ein, und AT/CH
(AROME/INCA) bräuchten je einen eigenen Adapter.

Das ist derselbe Fall wie **B8** in 1b (Niederschlagswahrscheinlichkeit): ein
Vorlagen-Element ohne Datengrundlage. Ein Chip „Sicht ≥ 1 km", der aus
Bewölkung oder Luftfeuchte geschätzt würde, wäre eine erfundene Zahl an der
Stelle, an der der Nutzer eine Entscheidung trifft. **Er entsteht nicht.**
Der Grenzwert-Katalog wird stattdessen aus dem gebaut, was wirklich an jedem
Sample hängt (Böen, Wind, Regen, gefühlte Temperatur, amtliche Warnung) — und
die Ansicht sagt, dass Sicht nicht dabei ist.

#### C2 — Es gibt schon ein „Go/No-Go" im Repo, und es beantwortet eine andere Frage

`src/threed/goNoGo.ts` (Epic E, B2B: Drohne/Kran/Event) rechnet:

* an **einem** Anker — dem höchsten Gelände des Schnitts (`referenceAnchor`),
* über die **Zeit** im 15-Minuten-Raster,
* gegen **einen** Grenzwert (Böen), auf **einer** festen Arbeitshöhe,
* mit **zwei** Zuständen (`'go' | 'no-go'`).

Die Tour fragt es andersherum: entlang der **Strecke**, an einer **wandernden**
Position, gegen **mehrere** Grenzwerte, auf der Höhe, auf der der Nutzer
gerade steht — und mit **vier** Zuständen (C3). Die beiden Module teilen genau
eine Sache, und die teilen sie schon: `windAtAGL`.

**Folge:** kein Umdeuten von `evaluateGoNoGo` (die Namenskollisions-Lehre aus
`audit/aktivfeuer.md`), sondern ein eigenes Modul `route3d/gonogo.ts`, das im
Kopfkommentar sagt, welche der beiden Fragen es beantwortet. Der bestehende
Schlüssel `buscosun.threed.gonogo.v1` bleibt unangetastet — ein Drohnenpilot
und ein Bergwanderer haben nicht denselben Böengrenzwert.

**Nebenbefund:** `verifyGoNoGo()` (`goNoGo.ts:115`) hängt an keinem Verifier,
genau wie `verifyCrossSection()` vor R3D (B6). Der Lauf `verify:route-3d`
zieht sie mit — Prüfungen, die es schon gab und die nie liefen.

#### C3 — Der vierte Status ist keine Kür, er ist ein bereits gegebenes Versprechen

Die Legende der Vorlage zeigt drei Zustände (Go · knapp · No-Go), die Fußzeile
nennt einen vierten: *„bei hoher Unsicherheit erscheint der Status als
‚unklar', nicht als Go."*

Dieses Versprechen steht seit 1a **im Produkt**: `Route3DView.tsx:621` sagt
wörtlich „Bei „unklar" nennt die Ansicht keine Entscheidung, nur die Werte.",
und `UNCLEAR_BELOW = 0.45` (`model.ts:400`) ist die eine Stelle, die es
festlegt. Eine Entscheidungsansicht, die daneben aus einer Konfidenz von 0,2
ein grünes „Go" macht, bricht eine Zusage, die zwei Modi weiter oben steht.

**Regel:** die Rangfolge ist `no-go > unklar > knapp > go`. Eine belegte
Grenzwertüberschreitung bleibt eine Überschreitung, auch wenn die Konfidenz
mäßig ist (Unsicherheit macht eine Warnung nicht harmloser); umgekehrt darf
Unsicherheit nie in Richtung Freigabe aufgelöst werden. Die Konfidenz, die
zählt, ist die **der geprüften Größe** (`confidence.gust` für den
Böen-Grenzwert), nicht ein Mittel über alles.

#### C4 — „Frühesten Go-Start suchen" ist möglich, aber die heutige Böe darf dafür nicht benutzt werden

Der Start-Vergleich existiert seit 1b: `evaluateStartOffsets`
(`weatherEnrichment.ts:393`) bewertet ±2 h im 15-Minuten-Raster **innerhalb**
der Anreicherung und kostet deshalb keinen Abruf (B11). Er liefert je
Kandidat `wetMin`, `peakMmH`, `totalMm`, `peakGustMps`, `radarShare`,
`coverage`, `complete`.

Zwei Lücken zwischen dem, was da ist, und dem, was 1c braucht:

1. **`peakGustMps` ist nicht höhenkorrigiert.** Der Kommentar sagt es selbst
   (`weatherEnrichment.ts:88`): *„nur zwischen den Eintraegen vergleichbar,
   nie als absolute Zahl anzeigen."* Genau das täte ein Vergleich gegen den
   Grenzwert 40 km/h — die Zahl in der Startsuche wäre eine andere als die in
   der Abschnittsliste, für denselben Ort und dieselbe Uhrzeit. Das ist
   V-R3D-3 in anderem Gewand: ein Wert, der zwei Fragen beantwortet.
   **Behebbar an Ort und Stelle:** `correctForElevation`
   (`weatherEnrichment.ts:587`) ist exportiert und rein, und alle drei
   Eingaben liegen in der Schleife bereits vor —
   `forecasts[ci].query.elevation` (Anker), `samples[sIdx].ele` (Sample),
   `pf.lapseRatePerM`. Der Kandidat rechnet damit **denselben** Weg wie die
   angezeigte Spalte.
2. **Die gefühlte Temperatur fehlt ganz.** Sie fällt bei (1) als Beiprodukt
   ab: `correctForElevation` liefert sie mit.

Was **nicht** in die Startsuche kann: die **amtlichen Warnungen**.
`warner.check` ist asynchron und netzgestützt; 17 Kandidaten × alle Samples
wären ein zweiter Abfragefächer. Der Warn-Grenzwert gilt daher für die
gefahrene Tour, nicht für die Kandidatensuche — und der Satz sagt es.

**Was dagegen genügt:** tourweite Extremwerte. „Durchweg Go" heißt „jeder
Abschnitt ist Go"; ein Abschnitt fällt genau dann durch, wenn er einen
Grenzwert reißt; also ist die Tour genau dann durchweg Go, wenn der
**schlechteste** Wert jeder Größe den Grenzwert hält. Ein Extremwert je Größe
je Kandidat reicht — keine Ablage je Sample × Kandidat.

#### C5 — Grenzwerte gehören nicht in den Tour-Speicher

Die Persistenz aus R3D-2 (`tourStore.ts`, IndexedDB) hält **eine Tour**.
Grenzwerte sind das Gegenteil: sie überleben die Tour und gelten für die
nächste. Ihre Heimat ist `localStorage`, wie bei den Layer-Schaltern
(`bsc.route3d.layers`), dem Modus (`bsc.route3d.mode`) und dem Drohnen-Panel
(`buscosun.threed.gonogo.v1`). Neuer Schlüssel `bsc.route3d.limits`.

Der Startsatz kommt aus der **Bewegungsart**, die die Tour ohnehin trägt
(`movementTypes.tsx`: `wandern`, `bergwandern` „T3, alpine Steige", `jogging`,
`trail`, `rennrad`, `gravel`, `mtb`, `ebike`) — das ist die „Profil"-Zeile der
Vorlage, ohne eine zweite Profilverwaltung zu erfinden. **Auflage:** ein
Startwert ist ein Startwert und keine Empfehlung. Die Vorlage sagt es in ihrer
eigenen Fußzeile („dein Grenzwert … keine amtliche Empfehlung"); die Ansicht
sagt es an der Stelle, an der die Werte zum ersten Mal erscheinen.

#### C6 — „PDF" kostet keine Dependency

D-06 hält die Laufzeit-Abhängigkeiten bei sieben; eine PDF-Bibliothek wäre ein
STOPP & FRAGEN. Sie ist nicht nötig: `HistoryPro.tsx:228` druckt seit der
Historie-Linie über `window.print()`, das Druckbild steuert `@media print`
(`src/history/history.css:382`). Dasselbe Muster, derselbe Knopfname
(„Bericht (Druck/PDF)" dort).

#### C7 — „Auswertung teilen" kann keinen Link teilen

**B3** steht unverändert: `src/route/` hat keinen Zustand in der URL, und eine
hochgeladene GPX passt in keine. Ein „teilen", das einen Link in die
Zwischenablage legt, führte den Empfänger auf eine leere Tourenplanung.

Teilbar ist der **Text**. Und genau den gibt es schon: `buildReport()` in
`GoNoGoPanel.tsx` schreibt „Ort, Zeit, Höhe, Werte, Grenzwert, Status" — die
Wortfolge, die die Vorlage in ihrer Fußzeile zitiert. 1c bekommt denselben
Berichtstyp für die Strecke (je Abschnitt eine Zeile), über `navigator.share`
bzw. Zwischenablage. Der Knopf heißt deshalb **„Auswertung kopieren"**, wenn
nur die Zwischenablage da ist — er verspricht nichts, was er nicht tut.

#### C8 — Zwei Schwellensätze in einer Ansicht widersprechen sich, wenn man sie nicht trennt

1b rechnet mit **festen** Aufmerksamkeitsmarken: `GUST_WATCH_KMH = 45`,
`GUST_ALERT_KMH = 60`, `RAIN_ALERT_MMH = 4` (`corridor.ts:210-213`). 1c rechnet
mit den **eigenen** Grenzwerten des Nutzers. Bei Grenzwert 40 sagt dieselbe
Stunde in 1b „unauffällig" und in 1c „No-Go" — beides richtig, beides
verwirrend, wenn es gleich aussieht.

**Trennung:** die 1b-Zeitfensterliste bleibt, was sie ist (eine
Aufmerksamkeitsskala, keine Entscheidung), und erscheint in 1c nicht. Die
1c-Abschnittsliste nennt bei jeder Zeile den **Grenzwert**, an dem sie
gemessen wurde. Kein Ton ohne Zahl.

#### C9 — „Böen 55 km/h am Grat" — die Entscheidung fällt auf der Höhe, auf der der Nutzer steht

Die Fußzeile der Vorlage sagt „Böen aus ICON-D2 auf Grathöhe interpoliert".
Das ist bei uns bereits erfüllt, aber auf einem anderen Weg als die Vorlage
suggeriert: nicht durch Hochrechnen im Vertikalprofil, sondern durch die
**Höhenkorrektur des Cluster-Forecasts auf die Sample-Höhe**
(`correctForElevation`) — der Grat ist die Sample-Höhe.

Daraus folgt eine Regel für die „WARUM"-Karte: sie zeichnet dasselbe
Vertikalprofil wie `MiniProfile` in 1a (`windAtAGL`, abgeleitet) und markiert
darin den Punkt, **an dem entschieden wurde** — den Bodenwert über dem
Gelände. Sie darf die Entscheidung nicht auf einer anderen Höhe des Profils
fällen, sonst stünden zwei verschiedene Zahlen für denselben Ort in derselben
Ansicht (die Abschnittsliste sagt 55, das Diagramm 74).

#### C10 — Ein Abschnitt ist kein Sample

Die Abschnittsliste entsteht durch Verschmelzen benachbarter Spalten gleichen
Status. Damit gilt hier wortgleich, was §14.4 (5) für `rainWindows` gelehrt
hat: ein einzelnes abweichendes Sample hätte sonst die Ausdehnung null. Die
Kante läuft bis zur **Mitte zum Nachbarn**, an den Streckenenden bleibt sie
stehen.

### 17.4 Plan

| Schritt | Inhalt | Berührt |
|---|---|---|
| **1c-1** | `route3d/gonogo.ts` (pur): `LimitSet`, Bewertung je Spalte, Rangfolge `no-go > unklar > knapp > go`, Abschnittsbildung mit Mitten-Regel, Begründung je Abschnitt, Startfenster-Auswertung gegen die Grenzwerte | neu |
| **1c-2** | `StartWindowEntry` um höhenkorrigierte Böe + gefühlte Temperatur erweitern (C4), `correctForElevation` in `evaluateStartOffsets` | `weatherEnrichment.ts` additiv |
| **1c-3** | Szene: Routenband nach Status, No-Go-Zone + Fahne, Statuslegende mit Wort | `Scene3D.tsx`, `model.ts` (Mode `gonogo`) |
| **1c-4** | Ansicht: dritter Modus, Grenzwert-Chips + Editor, Statuskarte, Abschnittsliste, Go-Fenster, „WARUM"-Karte, Reglerbahnen nach Status, Bericht (kopieren/teilen) + Druck | `Route3DView.tsx`, `route3d.css` |
| **1c-5** | Verifier: Statusrangfolge, Abschnittsbildung, Grenzwert-Persistenz, Startsuche gegen Grenzwerte, Textsonden auf das, was **nicht** behauptet wird (Sicht, Link-Teilen), `verifyGoNoGo()` mitziehen | `verify-route-3d.mjs` |

### 17.5 Offene Entscheidungen (Jan) — Defaults gelten, bis widersprochen

| # | Frage | Default |
|---|---|---|
| **G1** | Startwerte je Bewegungsart mitliefern? | **Ja**, ausdrücklich als „Startwerte, kein Rat" beschriftet und mit einem Klick änderbar (C5). |
| **G2** | Grenzwert „amtliche Warnung ab Level X" anbieten, obwohl DE-only? | **Ja**, mit der Länderlücke am Chip — dieselbe Regel wie die Warnzone in 1a. |
| **G3** | „Sicht" als Grenzwert nachrüsten (neues Feld durch die ganze Punkt-Kette, drei Länder)? | **Nein** in 1c; als V-Eintrag notieren (C1). |
| **G4** | Bericht auch als Datei anbieten? | **Nein** — Zwischenablage/Teilen + Druck decken es; eine Datei wäre ein vierter Weg für denselben Text. |

---

## 18 Umsetzung 1c-1…5 (2026-08-29) — Gate **GR3D-4**

### 18.1 Was entstanden ist

| Datei | Rolle | Zeilen |
|---|---|---|
| `src/route/route3d/gonogo.ts` | **neu**, pur: Grenzwert-Katalog, Bewertung je Spalte, Rangfolge, Abschnitte, Begründungssätze, Startzeit-Suche, Bericht, Persistenz | ~520 |
| `src/pointForecast/weatherEnrichment.ts` | `StartWindowEntry` + `peakWindMps`/`minApparentC`; `peakGustMps` jetzt **höhenkorrigiert** (C4) | +30 |
| `src/route/route3d/model.ts` | `segmentEdges` — die Kantenregel, die 1b und 1c teilen (C10) | +38 |
| `src/route/route3d/corridor.ts` | `rainWindows` nutzt `segmentEdges` statt einer zweiten Kopie | −8 |
| `src/route/route3d/Scene3D.tsx` | Modus `gonogo`, `STATUS_COLORS`, Statusband, Zonen, Fahnen, Legende | +95 |
| `src/route/route3d/Route3DView.tsx` | dritter Modus, Grenzwert-Zeile + Editor, Statuskarte, Abschnitte, Go-Fenster, „Warum"-Karte, Bericht | +330 |
| `src/route/route3d/route3d.css` | Zustände als Tokens, Editor, Karten, Bahnen, **Druckbild**, Tablet/Mobil | +200 |
| `scripts/verify-route-3d.mjs` | 219 → **316** Prüfungen (inkl. `verifyGoNoGo()`, bis hier unverdrahtet) | +97 |

### 18.2 Die vier Zustände am laufenden Bild

Die Vorlage zeigt drei Zustände in ihrer Legende und nennt den vierten nur in
der Fußzeile. In der Messung an einer echten DE-Tour (Freiburg → Schauinsland,
Gravel, Grenzwerte Böen ≤ 40 km/h · Regen ≤ 2 mm/h · Gefühlt ≥ 0 °C) traten
**alle vier** auf:

| Abschnitt | Status | Zeile |
|---|---|---|
| km 0,0–3,8 | Go | alles im Rahmen |
| km 3,8–5,8 | **unklar** | Gefühlt: Prognose unsicher |
| km 5,8–6,7 | No-Go | Böen 45 km/h |
| km 6,7–7,1 | knapp | Böen 39 km/h |
| km 7,1–9,1 | No-Go | Böen 52 km/h |
| km 9,1–9,7 | **unklar** | Gefühlt: Prognose unsicher |

Der `unklar`-Fall ist **nicht konstruiert**: am Tourende fiel die
Gefühlt-Konfidenz unter `UNCLEAR_BELOW` (0,45), während der Wert selbst den
Grenzwert hielt. Genau der Fall, den C3 verlangt — die Ansicht sagt dort
„unklar", nicht „Go".

### 18.3 C9 end-to-end nachgemessen

Die Zahl in der Abschnittsliste und die Zahl im „Warum"-Diagramm müssen
dieselbe sein. Im Browser abgegriffen:

| | Wert |
|---|---|
| Liste `km 7,1–9,1 · No-Go` | **Böen 52 km/h** |
| „Warum"-Punkt (`.r3-why-dot` Beschriftung) | **Böen 52** |
| Grenzwertlinie (`.r3-why-limit`) | x = 116,9 |
| Entscheidungspunkt (`.r3-why-dot`) | x = 130,0 ⇒ **rechts** der Linie |

Der Punkt sitzt auf `REF_AGL` (10 m über Grund) — dort liefert `windAtAGL`
den Bodenwert unverändert zurück, also **genau** den Wert der Liste. Die Kurve
darüber erklärt die Lage, sie entscheidet nicht; seit der Sichtprüfung steht
dieser Satz auch unter dem Diagramm.

### 18.4 Vier Befunde, die erst das laufende Bild zeigte

1. **Zwei Karten lagen aufeinander.** Die neue „Farbe = Entscheidung"-Karte und
   die bestehende „Blick"-Karte teilen sich denselben Platz auf der Bühne —
   beide wurden gerendert. Jetzt gibt es dort **eine** Karte je Modus; die
   Blick-Angabe ist in die Go-Karte gerückt.
2. **Die Start-Beschriftung lief durch die Legende — auch in 1a.** Auf 390 px
   liegt der Streckenbeginn tief; `Start · 283 m` landete mitten in der
   Legendenzeile am Fuß der Szene. Mit Bildschirmkoordinaten gemessen:
   `ende"Start · 283 m" × legende"< 15"` in **1a** und
   `× legende"Go"` in **1c**. Der Befund ist damit **älter als diese Phase**.
   Behoben für beide: startet die Strecke innerhalb des Legendenbands, steht
   die Beschriftung über dem Punkt statt darunter. Nachgemessen 0 Kollisionen
   in beiden Modi.
3. **Die Fahne verdeckte „Ziel · 1279 m".** Dieselbe Auflage wie §16.4 (2) für
   die Wolkenbasis, nur an einer neuen Stelle: die Streckenenden sind belegte
   Kästen, denen die Fahne ausweicht (bis zu drei Schritte nach unten).
4. **„unklar · Böen 35 km/h" beantwortete die falsche Frage.** Die Zeile zeigte
   den Messwert — der den Grenzwert von 40 km/h **hielt**. Unsicher war die
   Konfidenz, nicht der Wert. Jetzt nennt eine `unklar`-Zeile den Grund
   (`unclearShort`: „Gefühlt: Prognose unsicher" / „Regen: kein Wert"), nie eine
   Zahl. Dabei fiel auf, dass der Langsatz kein deutscher Satz war („Zwischen
   km 3,8 und 5,8 **Gefühlt ist** zu unsicher") — Chip-Texte taugen nicht als
   Satzsubjekt. Jede Größe trägt jetzt eine **Nennform nach „für"**
   (`LimitDef.noun`), die artikellos oder feminin ist; damit sind Nominativ und
   Akkusativ gleich und es gibt keine Numerus-Falle („die Böen ist").

### 18.5 Zwei Mess-Lehren

* **`getBBox()` ignoriert `transform`.** Die erste Kollisionsprüfung meldete
  „0 Kollisionen", während der Screenshot die Überlappung zeigte: die Legende
  sitzt in einem `<g transform="translate(…)">`, und `getBBox()` liefert
  Koordinaten **vor** der Transformation. Für Kollisionen zwischen Gruppen
  zählt `getBoundingClientRect()`. (Umgekehrt zu §16.4: dort waren Client-Rects
  von `<g>`-Elementen zu groß, weil sie die Führungslinie einschlossen — die
  Regel lautet also: Client-Rects, aber auf den **Text- und Rechteck-Elementen
  selbst**, nicht auf ihren Gruppen.)
* **Eine Negativ-Sonde braucht Wortgrenzen.** `!/sicht|visibility/i` schlug an,
  weil „An**sicht**" im eigenen Ehrlichkeitssatz steht — die §14.5-Lehre in
  einem deutschen Kompositum. `\bsicht` trifft „Ansicht" nicht.

### 18.6 Gate-Belege

| Frage | Beleg |
|---|---|
| **Funktionserhalt** | 1a und 1b unverändert bedienbar; Position bleibt über **alle drei** Modi und über 3D → 2D → 3D erhalten (km 5 989 durchgehend, Modus wird gemerkt). Nichts entfernt: 1c ist ein dritter Modus auf demselben Pfad. |
| **Desktop / Tablet / Mobil** | Bilder in 1440×900, 834×1112 DPR 2, 390×844 DPR 3. Mobil: **kein** Touch-Ziel < 44 px (Anfassflächen mitgemessen), **kein** horizontales Scrollen, „Warum" als Knopf statt schwebender Karte. |
| **Keine Überdeckung** | Nach den Korrekturen aus §18.4: 0 Kollisionen zwischen Streckenenden, Legende, Fahnen und Ebenen-Beschriftungen — in **1a** wie in **1c**, auf 390 px gemessen. |
| **Long Tasks** (Prod-Build) | Moduswechsel 17 ms, Positionsbahn 121 Bilder **16,7 ms/Bild**, Zeitbahn 16,7, Grenzwert-Regler 15 Schritte **16,7 ms/Schritt** — **0 Long Tasks**. Mit **CPU-Drossel 4×**: 90 ms / 31,9 / 30,1 und **ein** Task von **61 ms** (Grenze 200). |
| **Konsole** | Keine App-Fehler, keine Warnungen. Netz: dieselben Brightsky-404 der Punkt-Sondierung wie in §16.5 (**V-R3D-4**, Sondierpunkte bei lat 47,2 / 48,4 weit neben der Strecke) — vorbestehend, nicht von 1c. |
| **Bericht** | Mit gestubbtem `navigator.share` abgegriffen: Kopf (Strecke, Art, Datum, Zeitfenster, Quellen), Grenzwertliste, `GESAMT: NO-GO`, jede Abschnittszeile mit Begründung, Vorbehalt „keine amtliche Empfehlung" und die „unklar"-Regel. **Kein `url`-Feld** — `hatUrl: false`. |
| **Druck** | `window.print()` wie `HistoryPro`; das Druckbild lässt Umschalter, Bühne, Regler, Editor und Knöpfe weg (Verifier prüft die `@media print`-Regel). Im Automations-Browser **nicht ausgelöst** — ein Druckdialog blockiert die Sitzung. |
| **Verifier** | `verify:route-3d` **316/316** (+97), `verify:routing` 104/104, `verify:layer-geometry` 76/76, `verify:radar-sampling` 25/25, `verify:event-zone` 41/41, `typecheck` grün. |
| **Budget** | totalJs 1 036,3 / **1 036,4** KB (Ratsche von 1 029,6 angehoben), eagerJs 102,7/106,5 **unverändert**, largestChunk unverändert. Der Route3DView-Chunk wuchs auf 22,5 KB gzip. |
| **Dependencies** | unverändert **sieben** (Verifier prüft die Zahl) — kein PDF-Paket, D-06 unberührt. |
| **STOPP & FRAGEN** | keine Berührung: kein Shader, kein Custom-Layer, keine Fusion, keine Edge Function, kein Cron, keine Manifest-Mechanik, nichts gelöscht. |

### 18.7 Was 1c gegenüber der Vorlage anders macht

| Vorlage | Umsetzung | Grund |
|---|---|---|
| Chip „Sicht ≥ 1 km" | **entfällt**; die Fußzeile sagt, dass keine der drei Quellen eine Sichtweite führt | C1 |
| „Profil: Bergwandern T3 · gespeichert" | „Grenzwerte · auf diesem Gerät gespeichert"; vor der ersten Änderung „**Startwerte — keine Empfehlung**" | C5/G1 — eine Werte-Tabelle je Bewegungsart behauptete Fachkenntnis, die das Projekt nicht belegen kann |
| „Auswertung teilen" (impliziter Link) | Text über `navigator.share`, sonst „Auswertung **kopieren**" | C7 — die Strecke steht in keiner URL |
| „PDF" | „Druck / PDF" über `window.print()` | C6 — keine neue Dependency |
| „Frühesten Go-Start suchen" (alle Grenzwerte) | prüft alles außer der **amtlichen Warnung** und sagt es | C4 — die Warnabfrage ist asynchron |
| drei Zustände in der Legende | **vier** (Go · knapp · unklar · No-Go) | C3 — das „unklar"-Versprechen steht seit 1a im Produkt |

### 18.8 Offen

- **Real-Device** statt DevTools-Drossel (V-LE-13) — gilt für die ganze Linie.
- **V-R3D-4** unverändert: die Punkt-Sondierung greift bei DE-Grenztouren über
  die Landesgrenze. Gehört in die Punkt-Forecast-Kette.
- **V-R3D-5 (neu):** eine Sichtweite als Grenzwert wäre der einzige fehlende
  Katalogeintrag gegenüber der Vorlage. Sie bräuchte ein neues Feld durch die
  ganze Punkt-Kette **und** einen Adapter je Land (Brightsky führt eine, AROME
  und INCA anders) — eine eigene Phase, keine Zeile (G3).
- **V-R3D-6 (neu):** bei Grenzwerten nahe dem Mittel der Strecke zerfällt die
  Liste in viele kurze Abschnitte (gemessen: 7 bei Böen ≤ 40 km/h). Das ist die
  Wahrheit der Daten — ein Zusammenfassen wäre Glättung, also eine Behauptung.
  Ob eine Ansicht das trotzdem bündeln soll („4 Abschnitte unter 1 km"), ist
  eine Produktfrage, keine Datenfrage.

---

## §19 R3D-4 — Diagnose „Gelände exakt, Wetter exakt auf der Ebene" (2026-08-29)

Jans Auftrag: *„dass das terrain (vielleicht von maplibre) auch exakt abgebildet
wird und alle wetterdaten, wind, hagel, schnee, regen exakt auf der 3D ebene
abgebildet werden"*.

Kein Code vor dieser Diagnose. Gemessen wurde mit
`audit/route-3d/gelaende-messung.mjs` (importiert die echten Module, holt echte
Terrarium-Kacheln) an den vier Test-Strecken des Repos.

### 19.1 Was die Szene heute als Gelände zeichnet

`Scene3D.tsx:231-232` zeichnet `terrainCapPath(p, cols)` und
`terrainPath(p, cols)` mit `cols = scene.columns` — und eine Spalte ist ein
**Wetter-Sample**, kein Track-Punkt (`model.ts:224` `buildColumns(samples, …)`).
Dieselbe Kette speist das Himmelspolygon (`skyPath`), an dem Wind, Regen und
Wolkenbasis beschnitten werden, das Routenband (`ribbonPoints`), die
Label-Freiflächen (`freeSpan`) und `terrainAt()`.

Die Sample-Kette ist aber für das **Wetter** gewählt, nicht für das Bild:
`selectSamples` (`tourTrack.ts:284`) nimmt RDP + Höhenextrema und füllt auf
höchstens einen Sample je **500 m alpin / 1 km hügelig / 2 km flach**, gedeckelt
auf 300.

**Gemessen (M1b: derselbe Streckenverlauf, aber mit 25-m-Track und echten
DEM-Höhen — also so, wie ein aufgezeichneter GPS-Track aussieht):**

| Strecke | Punkte | Samples | max. Abstand | Abweichung Profil (med / p95 / max) | Anstieg Track → Kette |
|---|---|---|---|---|---|
| AT Patscherkofel (alpin) | 345 | 23 | 475 m | 3,3 / 22,0 / **39,7 m** | 1 756 → 1 751 hm |
| CH Scheidegg (alpin) | 281 | 18 | 450 m | 2,9 / 22,6 / 28,0 m | 1 114 → 1 080 hm (3 %) |
| DE Schauinsland (alpin) | 388 | 30 | 500 m | 4,0 / 16,9 / 21,4 m | 1 331 → 1 337 hm |
| DE Berlin (flach) | 357 | **7** | **1 650 m** | 1,6 / 6,4 / 12,9 m | 47 → 11 hm (**77 % fehlen**) |

**Befund D1 — das Gelände der 3D-Ansicht ist bis 40 m falsch, im Flachland fehlen
77 % des Reliefs.** Es kostet **keine Daten**, das zu beheben: der volle Track
liegt bereits in der Szene (`buildScene({ samples, points })`) und wird bisher
nur für `bearingAtDist` benutzt.

### 19.2 Woher die Höhe kommt

`tourTrack.ts:99-106` holt das DEM **nur**, wenn `elevationUsable()` fehlschlägt —
und das prüft ausschließlich Lücken (> 50 % NaN), Nullen und „unplausibel flach"
(Spanne < 1 m). Es prüft **nie gegen das Gelände**. Was die Datei behauptet,
zeichnet die Szene.

**Gemessen (M2, Datei gegen Terrarium-DEM am selben Punkt):**

| Strecke | Median | p95 | max | Versatz |
|---|---|---|---|---|
| DE Berlin | 2,4 m | 5,9 m | 9,7 m | +0,6 m |
| CH Scheidegg | 28,7 m | 162,1 m | 177,0 m | +39,2 m |
| AT Patscherkofel | 90,7 m | 381,4 m | 402,6 m | +107,8 m |
| DE Schauinsland | 115,7 m | 235,2 m | 280,1 m | +105,6 m |

Die Höhen dieser vier Dateien sind von Hand erfunden — **genau deshalb ist die
Messung aussagekräftig**: sie zeigt, dass die Kette eine um 100 m verschobene
Strecke widerspruchslos übernimmt und als Gelände zeichnet.

**Befund D2 — und es bleibt nicht beim Bild.** `s.ele` geht in
`correctForElevation` (`weatherEnrichment.ts:270-279`): 100 m Höhenfehler sind
0,65 K Temperatur plus Windzuschlag. Und die Wolkenbasis ist
`terrainM + lclAgl(…)` (`model.ts:240`), die Aussage „Gipfel in Wolke" hängt
daran, und in 1c entscheidet genau dieser Wert über „gefühlt ≥ 0 °C".
Eine falsche Datei-Höhe verschiebt also **die Entscheidung**, nicht nur die Linie.

### 19.3 Die Rückwand

`terrainCapPath` extrudiert dasselbe Profil nach hinten. Der Kommentar sagt
warum: „die Extrusion desselben Profils, nicht ein zweiter, erfundener Kamm" —
zum Bauzeitpunkt war das die ehrliche Wahl, weil das Gelände neben der Strecke
unbekannt war. Mit dem DEM ist es bekannt.

**Gemessen (M4):** die Strecke selbst berührt 4–5 Kacheln (z13); zwei zusätzliche
Profile seitlich (2 km und 5 km) heben das auf **9–11** Kacheln — weit unter dem
bestehenden Deckel `MAX_TILES = 64`.

**Befund D3 — echtes Relief statt Extrusion ist bezahlbar** und ersetzt eine
zeichnerische Behauptung durch eine Messung.

### 19.4 „Alle Wetterdaten exakt auf der 3D-Ebene"

Wind, Regen, Wolkenbasis, Schneefallgrenze und Warnzone liegen bereits **in
derselben Schnittebene** wie das Profil und werden am Himmelspolygon
beschnitten — die Verdeckung ist exakt (§5 B5). Nur: dieses Polygon ist das
grobe Profil aus D1. **Befund D4 — die Windwand endet bis 40 m neben dem Berg,
und die Regensäule beginnt bis 40 m über oder unter dem Boden.** Das ist kein
eigener Fehler, es ist D1 an einer zweiten Stelle; es fällt mit D1.

### 19.5 Hagel

`SampleWeather` (`types.ts:98-135`) führt **kein Hagelfeld**;
`precipitationType` kennt `none | rain | sleet | snow`.

Das Repo hat Hagelquellen — aber es sind **Beobachtungen**:

| Land | Quelle | Art | Takt / Saison |
|---|---|---|---|
| DE | DWD KONRAD3D (`dwdKonrad3d.ts`) | Zellen mit `hail_flag`, Radarerkennung | 5 min, Retention 48 h |
| CH | MeteoSchweiz POH / MESHS (`meteoSwissHail.ts`) | Radarraster | 5 min, **nur 1. April – 30. September** |
| AT | — | — | keine offene Quelle (steht im Layer-Text der Karte) |

Entscheidend ist, dass die App das selbst schon so behandelt:
**`MapView.tsx:1609` schaltet alle Hagel-Layer nur bei `forecastHour === 0`.**

**Befund D5 — Hagel ist in diesem Projekt ein Jetzt-Produkt.** Eine Tour, die in
drei Stunden am Grat ist, kann daraus nichts erfahren; in Österreich gibt es
auch für „jetzt" nichts. Ein Hagel-Chip in der 3D-Ansicht wäre entweder leer
oder erfunden — derselbe Fall wie die Sichtweite in 1c (C1) und die
Niederschlagswahrscheinlichkeit in 1b (B8). Was sich aus ICON-D2 zur ETA
ableiten ließe, ist **Gewitterpotenzial** (CAPE/LPI, im Repo als Layer
`thunder` vorhanden) — eine andere Aussage, die anders heißen muss und nicht
„Hagel" heißen darf.

### 19.6 Schnee

Schnee ist in der Kette (`precipitationType === 'snow'`, dazu `snowLineM` für
AT/CH) und wird in der Szene als **Regen** gezeichnet: `RainCurtain` zieht immer
schräge Striche, nur die Strichfarbe wechselt (`route3d.css:83-85`).
**Befund D6** — die Unterscheidung existiert im Modell und nicht im Bild.

### 19.7 Der MapLibre-Weg — er ist schon da

Jans „vielleicht von maplibre" trifft etwas Vorhandenes:

* `src/threed/TerrainMap.tsx` — MapLibre mit **echtem 3D-Relief**
  (`raster-dem` aus denselben Terrarium-Kacheln, `setTerrain`, Überhöhung 1,3,
  gekippte Kamera).
* `src/threed/CurtainLayer.ts` — Custom-Layer `renderingMode:'3d'`, der eine
  Wetterwand entlang einer Linie auf das Relief stellt; jeder Vertex geht über
  `MercatorCoordinate.fromLngLat([lon,lat], altM)`, **Tiefentest an** ⇒ Berge
  verdecken die Wand.

**Befund D7 — der Weg wäre keine Neuentwicklung, aber ein anderes Produkt.** Die
Vorlagen 1a/1b/1c sind Diagramme: Höhenachse in m ü. NN, Höhenlinien, fünf
Windbänder mit Legende, Grenzwertzonen über die volle Bildhöhe, Ehrlichkeitssätze
am Rand. Eine gekippte Geländekarte trägt keine Höhenachse und keine
Grenzwertzone; sie beantwortet „wie sieht es dort aus", nicht „wo wird es
kritisch". Dazu kommt: `CurtainLayer` ist WebGL — jede Änderung daran ist
**STOPP & FRAGEN**.

**Empfehlung:** das Diagramm bleibt die 3D-Ansicht der Tour, und sein Gelände
wird exakt — **aus genau der DEM-Quelle, die MapLibres `raster-dem` benutzen
würde**. Damit ist „Terrain von MapLibre" der Sache nach erfüllt (dieselben
Kacheln, dieselbe Auflösung), ohne die Ansicht gegen eine zu tauschen, die die
Fragen der drei Modi nicht mehr beantworten kann. Eine Geländekarte als
**vierter** Modus bliebe jederzeit möglich und billig — sie ist im Repo fertig.

### 19.8 Was ein exaktes Bild NICHT exakter macht

**Befund D8 — der Ortsbezug des Wetters bleibt der Cluster.** Gemessen (M3):

| Strecke | Radius | Cluster | Sample → Abfragepunkt (med / p95 / max) |
|---|---|---|---|
| AT Patscherkofel | 6 km | 5 für 21 Samples | 0,48 / 1,44 / 1,95 km |
| CH Scheidegg | 6 km | 4 für 17 | 0,46 / 1,30 / 1,30 km |
| DE Schauinsland | 6 km | 4 für 23 | 0,81 / 1,74 / 1,81 km |
| DE Berlin | 14 km | **1 für 7** | 4,90 / 8,90 / **8,90 km** |

Im Flachland ist das Wetter der ganzen Strecke **eine** Abfrage. Ein
pixelgenaues Gelände darf diesen Umstand nicht überstrahlen — die
Auflösungszeile (`resolutionNote`) bleibt, und die Ehrlichkeitszeile muss künftig
**zwei** Auflösungen nennen, weil sie ab jetzt verschieden sind: Gelände ≈ 30 m,
Wetter 6–14 km.

### 19.9 Plan R3D-4

| # | Was | Wirkung |
|---|---|---|
| **G1** | Eigenes Geländeprofil aus `points` (Hüllkurve je Bildspalte, Min **und** Max) für `terrainPath` / `skyPath` / Kappe / Band / `freeSpan` / `terrainAt`. Spalten bleiben die Wetterträger. | D1 + D4 fallen zusammen |
| **G2** | `buildTourTrack` prüft die Datei-Höhen gegen das DEM und ersetzt sie, wenn sie nicht dieses Gelände beschreiben (Median > 50 m); `meta.elevationSource` / `elevationDeltaM`, die Ansicht sagt es. | D2 — eine Höhenwahrheit für Bild **und** Zahlen |
| **G3** | Zwei echte Seitenprofile aus dem DEM als Relief (Tiefe 0,5 / 1,0); ohne DEM bleibt die Extrusion und die Ansicht sagt es. | D3 |
| **G4** | Schnee wird als Schnee gezeichnet. | D6 |
| **G5** | Ehrlichkeit: zwei Auflösungen statt einer; Hagel als benannte Lücke mit Grund. | D5 + D8 |

### 19.10 Offene Entscheidungen (Defaults, wenn Jan nicht widerspricht)

* **H1 — Höhen-Ersetzung.** Default: ersetzen ab Median > 50 m gegenüber dem
  DEM, mit sichtbarer Notiz. Alternative wäre „nur melden, nie ersetzen" — dann
  bleiben Bild und Entscheidung falsch, obwohl wir es wissen.
* **H2 — Blickrichtung des Reliefs.** Default: die Seite, die die Kopfzeile
  ohnehin nennt („Süd → Nord"), also links der Fahrtrichtung.
* **H3 — Geländekarte als vierter Modus.** Default: **nicht jetzt** (D7).

---

## §20 R3D-4 — Umsetzung G1–G5 · Gate GR3D-5 (2026-08-29)

### 20.1 Was gebaut wurde

**G1 · Das Gelände bekommt seine eigene Auflösung.**
`model.ts` baut mit `buildTerrainProfile(points, keepDists)` ein Profil aus dem
**vollen Track** und legt es als `SceneModel.terrain` neben die Spalten. Die
Ausdünnung ist eine **Hüllkurve**: je Bildspalte überleben der tiefste UND der
höchste Punkt (ein Mittel hätte genau die Grate weggeglättet, um die es geht;
„jeder n-te Punkt" hätte die Kuppe zufällig getroffen). `keepDists` erzwingt
Knoten an jeder Wetterspalte — sonst schwebte das Routenband neben dem Profil,
an dem es hängt. Deckel `PROFILE_MAX_NODES = 1400`.

Alles Geometrische hängt jetzt daran: `terrainPath`, `skyPath` (die
Verdeckungsmaske), `terrainCapPath`, `ribbonPoints`, `freeSpan`, `terrainAt` und
die Höhenachse (`heightRange`). Die Spalten bleiben, was sie waren: die
**Wetterträger**.

**G1b · Wand und Regen stehen auf dem Boden.** `buildWindCells` und
`buildRainColumns` nehmen das Profil entgegen und ziehen ihre Unterkante auf
`minTerrainBetween(profile, fromM, toM)` herunter. Die Höhe über Grund bleibt
dabei die des Abtastpunktes — die Wand wird unten **verlängert, nicht neu
gerechnet** (im Verifier als Gleichheit der `kmh`-Folge festgehalten).

**G2 · Die Höhe wird gegen das Gelände geprüft.** `compareToDem()` in
`enrichElevation.ts` vergleicht die Höhen der Datei an bis zu 120 Punkten mit
dem Terrarium-DEM. `tourTrack.ts` ersetzt sie, wenn der **Median** über
`ELE_TRUST_M = 50 m` liegt (GPS-/Barometerfehler und DEM-Streuung im
Steilgelände liegen zusammen bei ~10–30 m; 50 m ist bewusst darüber). Neu in
`TourMeta`: `elevationSource` (`file` | `dem-filled` | `dem-replaced`) und
`elevationDeltaM` — **`null` heißt „nicht geprüft", nicht „stimmt"**.
Kill-Switch `?dem=0` / `localStorage.dem = '0'`.

**G3 · Echtes Relief statt Extrusion.** `sampleReliefProfiles()` tastet das DEM
**links der Fahrtrichtung** in 2 km und 5 km Abstand ab (senkrecht auf die
*lokale* Richtung, damit der Versatz in der Kurve mitwandert statt eine gerade
Schnittlinie zu behaupten). Die Szene zeichnet sie als Silhouetten in der Tiefe
0,4 und 1,0 — von hinten nach vorne. Liegt Relief vor, **entfällt die Kappe**:
sonst stünde eine Zeichnung vor einer Messung. Kommt nichts (offline, Lücken >
20 %), bleibt alles wie bisher — und die Fußzeile sagt es.
Damit bekommt die Tiefenachse zum ersten Mal eine **Bedeutung**: 1,0 sind 5 km.

**G4 · Schnee wird als Schnee gezeichnet.** Die Neigung der Striche kommt aus
der Art (Schnee 0, Schneeregen 3,5, Regen 7 px), der Strich wird per CSS
unterbrochen. Die Art war im Modell und nicht im Bild.

**G5 · Zwei Auflösungen und eine benannte Lücke.** `terrainNote()` steht in
allen drei Modi **neben** `resolutionNote()`, nie an seiner Stelle — Gelände und
Wetter lösen ab jetzt verschieden auf (D8). `HAIL_NOTE` nennt die Hagel-Lücke
mit Grund und beiden Quellen.

### 20.2 Gemessen — headless

`verify:route-3d` **378/378** (+62). Die tragende Zahl steht im Verifier selbst:
an einem 20-km-Gelände mit echten Kuppen und Spalten im Flachland-Abstand liegt
die **Spaltenkette 223,9 m** daneben, das **Profil 0,1 m** — Faktor **2 587**.

### 20.3 Gemessen — im Browser (Prod-Build, Port 4183)

| Was | Ergebnis |
|---|---|
| DE Schauinsland, Profil | **162 Knoten** statt 31 Spalten; Verdeckungsmaske aus derselben Kante (162) |
| Abweichung Profil ↔ Spaltengerade | **22,2 m** (4 px bei 5,52 m/px) — genau das Relief, das vorher fehlte |
| DE Berlin (flach), Profil | **163 Knoten** statt **7** Spalten |
| Relief | 2 Profile à 163 Knoten, Deckkraft 0,28 (5 km) / 0,48 (2 km); Kappe entfällt |
| Windwand am Boden | **größtes Loch 0,00 px** über alle 31 Spalten |
| Höhen-Gegenprobe Schauinsland | Datei − DEM **116 m** ⇒ **ersetzt**, Fußzeile sagt es, Vorschau-Chip „Höhen aus DEM ersetzt — Datei wich 116 m ab" |
| Höhen-Gegenprobe Berlin | **2 m** ⇒ **nicht angefasst**, Fußzeile „gegen das Höhenmodell geprüft (2 m Abweichung)" |
| DEM-Kosten | **16 verschiedene Kacheln** (12 × z13 für Strecke + Relief), der Rest aus dem Browser-Cache |
| Long Tasks | **0** (6 Moduswechsel + 40 Scrub-Schritte am Prod-Build) |
| Konsole | keine Fehler, keine Warnungen |
| Textkollisionen (mobil 390 px) | **0** (`getBoundingClientRect` auf den Textknoten, §18.5) |

Alle drei Modi laufen mit dem Profil: in 1c folgt das Statusband (Go/knapp/
unklar) derselben Kante, die Grenzwertzonen und die Abschnittsliste bleiben
unverändert.

### 20.4 Was erst das laufende Bild zeigte

1. **Die Vorschau nannte ein Ersetzen „ergänzt".** `RouteSummary.tsx` hing an
   `elevationEnriched` — einem Flag, das seit G2 zwei verschiedene Vorgänge
   bedeutet. „Die Datei hatte keine Höhen" und „die Datei hatte falsche" sind
   zwei Auskünfte; jetzt sind es zwei Chips, und der zweite nennt die Zahl.
2. **Das Relief kommt später als die Szene.** Für rund eine Sekunde stand
   „kein gemessenes Relief" in der Fußzeile — das ist in dem Moment **richtig**,
   heißt aber: ein Screenshot direkt nach dem Öffnen dokumentiert den falschen
   Zustand. Die Messung wartet jetzt auf `.r3-relief-band`.
3. **Der Nachweis „Wand steht auf dem Boden" war beim ersten Versuch falsch.**
   Gemessen wurden **alle** Wandsegmente gegen das Gelände — also auch die, die
   500 m darüber liegen; das meldete ein Loch von 217 px, das es nicht gibt.
   Richtig ist: je Spalte nur das **unterste** Segment. Dieselbe Lehre wie
   §18.5 in anderer Gestalt: eine Messung muss denselben Gegenstand fassen wie
   das Auge — nicht die Menge, in der er liegt.
4. **Die wiederhergestellte Tour trägt die neuen Felder.** Nach dem Ersetzen
   kam die Tour aus IndexedDB mit den DEM-Höhen zurück (`tourStore` spreizt
   `TourMeta`, zählt sie nicht auf) — die Persistenz brauchte keine Änderung.

### 20.5 Gate GR3D-5

| Frage | Beleg |
|---|---|
| 1 Funktionserhalt | Kein Layer, kein Modus, kein Regler entfernt. Die Kappe bleibt der Rückfall ohne DEM; die Höhen der Datei bleiben unangetastet, solange sie das Gelände beschreiben (Berlin, 2 m, live belegt). Chips, Listen und Abschnitte unverändert. |
| 2 Desktop | Bewusst geändert ist nur die 3D-Szene (feineres Profil, Relief) und der Höhen-Chip der Vorschau. Alles andere pixelgleich. |
| 3 Touch ≥ 44 px | Keine neuen Bedienelemente. |
| 4 Konsole | Keine Fehler, keine Warnungen (Schauinsland und Berlin). |
| 5 Long Tasks > 200 ms | **0** am Prod-Build. |

`verify:route-3d` **378/378**, `verify:routing` 104/104, `verify:layer-geometry`
76/76, `verify:radar-sampling` 25/25, `verify:event-zone` 41/41, `typecheck`
grün, Budget totalJs 1 038,3/**1 038,4** KB (Ratsche von 1 036,4 — **+1,9 KB**
für Profil, Relief, Gegenprobe und Texte), eagerJs unverändert 102,7.

### 20.6 Was NICHT gebaut wurde — und warum

* **Kein Hagel.** D5: beide Quellen sind Beobachtung; die App selbst schaltet
  sie nur bei `forecastHour === 0`. Statt eines leeren Chips steht der Grund in
  der Fußzeile.
* **Keine Geländekarte.** D7/H3: `TerrainMap` + `CurtainLayer` liegen fertig im
  Repo, aber sie beantworten die Fragen der drei Modi nicht (keine Höhenachse,
  keine Grenzwertzone) — und `CurtainLayer` ist WebGL, also STOPP & FRAGEN.
  Als **vierter** Modus bleibt der Weg offen und billig.
* **Kein feineres Wetter.** D8: der Ortsbezug bleibt der Cluster (6–14 km). Das
  exakte Bild verdeckt ihn nicht, es steht neben ihm.

### 20.7 Offen

* **Real-Device** (V-LE-13) — gilt weiter für die ganze Linie.
* **V-R3D-4** unverändert.
* **V-R3D-7 (neu):** `sampleElevations` hält keine Kacheln über Aufrufe hinweg.
  Gemessen: **49 Abrufe für 16 verschiedene Kacheln** in einer Sitzung
  (Gegenprobe → Ersetzen → Relief). Das Netz kostet es nicht (Browser-Cache),
  der Dekode schon (`createImageBitmap` + Canvas je Aufruf); ein Modul-Cache
  wäre fünf Zeilen, kostet aber Speicher (256 KB je Kachel) und braucht eine
  Obergrenze — deshalb hier nur gemessen, nicht gebaut.
* **V-R3D-8 (neu):** Das Relief steht **links** der Fahrtrichtung, weil die
  Kopfzeile „Süd → Nord" sagt. Bei einer Tour, die zurückläuft (`Rückwärts`),
  wechselt damit die gezeigte Talseite. Fachlich richtig (die Blickrichtung
  dreht sich mit), aber die Kopfzeile nennt die Richtung nur grob — ob die
  Ansicht die Seite ausdrücklich benennen soll, ist eine Produktfrage.
* **V-R3D-9 (neu):** `ELE_TRUST_M = 50` ist an vier Testdateien und zwei
  Live-Läufen belegt, nicht an einer Stichprobe echter GPX aus Komoot/Strava/
  Garmin. Die Schwelle ist bewusst hoch gesetzt; eine Messung an echten
  Aufzeichnungen würde sie schärfen.

---

## §21 R3D-5 — Diagnose „die Route komplett in 3D" (2026-08-29)

Jans Frage: *„aktuell ist es noch 2D — gibt es auch die Möglichkeit, die Route
komplett in 3D zu sehen und darzustellen, ebenso alle Wetterparameter entlang
der Route?"*

Damit ist die in §19.7 (D7) offengelassene Entscheidung **H3** getroffen: die
Geländekarte wird gebaut. Diese Diagnose klärt, was dafür wirklich fehlt — und
was NICHT gebaut werden darf.

### 21.1 Was schon da ist (und allgemeiner ist als gedacht)

**Befund E1 — der Vorhang ist nicht an die Atmosphäre-Ansicht gebunden.**
`buildCurtain(columns, topM)` (`src/threed/curtainMesh.ts`) nimmt eine
**beliebige Polylinie** aus `{ lon, lat, distanceM, terrainM }` und liefert
einen Triangle-Strip mit uv. Nichts darin setzt eine gerade Schnittlinie voraus.
Die Tour bringt genau diese vier Größen mit — Spalte für Spalte.

**Befund E2 — der Rechenkern ebenso.** `assembleCrossSection({ columns,
anchors })` (`crossSection.ts:285`) interpoliert Oberflächenwerte über
`interpAnchor` entlang der Distanz und rechnet die Vertikale mit **`windAtAGL`**
— demselben Kern, den die axonometrische Ansicht seit 1a benutzt. Und
`AnchorSurface` verlangt genau, was ein Tour-Sample führt: Distanz, Höhe, Wind,
Richtung, Böe, Temperatur, Bewölkung, Feuchte.

Die Tour kann also den **vorhandenen** Vorhang speisen. Es ist kein zweiter
Rechenweg nötig — und damit auch keine zweite Wahrheit.

### 21.2 Was dabei schiefginge, wenn man es einfach so macht

**Befund E3 (schwer) — die Anker einer Tour gelten NICHT zur selben Zeit.**
`estimateInversion(anchors)` (`crossSection.ts:250`) vergleicht den **tiefsten**
mit dem **höchsten** Anker. Auf einer Tour liegen zwischen beiden Stunden: die
Schauinsland-Tour startet um 01:27 im Tal und steht um 10:28 am Gipfel.
„Oben wärmer als unten" wäre dort ein **Zeitunterschied**, keine Schichtung.

Und es bliebe nicht beim falschen Etikett: eine erkannte Inversion ersetzt im
Temperaturfeld die Lapse-Rate durch einen **isothermen Kaltluftsee**
(`crossSection.ts:307-310`). Der Vorhang zeigte dann eine Schichtung, die es
nicht gibt. Zweitens würde die Heuristik (Zweig 2: Relief > 200 m, klar,
windschwach) auf fast jeder Alpentour anschlagen.

⇒ `CrossSectionInput` bekommt **additiv** `inversion?: 'estimate' | 'none'`
(Standard `estimate`, die Atmosphäre-Ansicht bleibt unverändert). Die Tour fährt
`none` — und die Ansicht **sagt warum**. Ohne Inversion ist das Temperaturfeld
`surface.tempC − LAPSE · agl`, also genau die Rechnung, die die Tour ohnehin
für ihre Höhenkorrektur benutzt.

**Befund E4 — kein Shader wird angefasst.** `CurtainLayer` wird **benutzt**,
nicht geändert: `setCurtain(columns, topM, canvas)` und `setStreamlines(lines)`
sind die ganze Schnittstelle; Vertex- und Fragment-Programm bleiben Zeile für
Zeile stehen. Damit fällt die STOPP-&-FRAGEN-Auflage für die WebGL-Pipeline
**nicht** an. Sie fiele an, sobald die Wand etwas zeigen soll, das die Textur
nicht trägt (E5).

**Befund E5 — was die Wand tragen kann, und was nicht.**
`buildAnnotatedCurtain(section, { useGust, temp, clouds })` komponiert **eine**
Textur aus Wind **oder** Böen, Temperaturschichten und Wolkenstockwerken.
**Regen, Schneefallgrenze und Warnzonen sind darin nicht vorgesehen.** Sie in
die Wand zu malen hieße, `sectionImage.ts` umzubauen — möglich, aber ein
eigener Schritt mit eigenem Gate.
⇒ In dieser Phase laufen sie dort, wo sie schon hingehören: **der Regen färbt
die Strecke** (nasse Abschnitte, dieselbe `rainWindows`-Regel wie 1b), Warnung
und Schneefallgrenze stehen in der Punkt-Abfrage. Und die Ansicht sagt
ausdrücklich, welche Größen in der Wand stecken — sonst liest man die
Abwesenheit von Regen in der Wand als „kein Regen".

**Befund E6 — die Überhöhung ist EINE Zahl an ZWEI Stellen.**
`map.setTerrain({ exaggeration })` und `CurtainLayer.exaggeration` müssen
denselben Wert tragen, sonst schwebt die Wand über dem Berg oder steckt darin
(steht so im Kopf von `CurtainLayer`). Eine Konstante, an beide gereicht — und
sie ist **nicht** die Überhöhung des Schnitts (dort 1,8×, hier 1,3×): der
Schnitt streckt eine Zeichnung, die Karte streckt Gelände.

**Befund E7 — WebGL kann fehlen.** `TerrainMap` hat dafür einen benannten
Rückfall. Die Tour braucht denselben — mit dem Hinweis auf den Schnitt, der
ohne WebGL läuft. (Der Schnitt ist SVG; das war der Grund für Weg A.)

**Befund E8 — die Position ist geteilt.** `distM` koppelt 2D und 3D seit 1a.
Die Geländekarte muss sie lesen **und** schreiben, sonst verliert der Wechsel
den Ort — die Regel, die in §12 für 3D→2D→3D schon gilt.

**Befund E9 — zwei weitere Selbstverifikationen hängen an keinem Verifier.**
`verifyCurtainMesh()` (`curtainMesh.ts`) und `verifySectionGeometry()`
(`sectionGeometry.ts`) sind geschrieben und laufen nirgends — derselbe Fall wie
`verifyCrossSection` (B6) und `verifyGoNoGo` (C2). Sie werden mitgezogen.

**Befund E10 — die Auflösung der Wand ist die des Wetters, nicht die des
Bildes.** Ein 96-Spalten-Vorhang sieht fein aus; die Werte darin kommen aus
6–14 km Clustern (D8). Die Wand darf das nicht überstrahlen — dieselbe Auflage
wie beim Gelände in §19.8.

### 21.3 Was „komplett in 3D" heißen kann — und was hier gebaut wird

| Größe | In der Wand? | Wo sonst |
|---|---|---|
| Wind / Böen | **ja** (Heatmap, `windAtAGL` über Grund) | Legende, Punkt-Abfrage |
| Temperatur | **ja** (Schichten) | Punkt-Abfrage |
| Wolken | **ja** (Stockwerke, Wolkenbasis abgeleitet) | Punkt-Abfrage |
| Windströmung | **ja** (Streamlines mit Chevrons, eigener Draw) | Legende |
| Regen | nein (E5) | **Strecke färbt sich**, Punkt-Abfrage |
| Schneefallgrenze | nein (E5) | Punkt-Abfrage (nur AT/CH) |
| Amtliche Warnung | nein (E5) | Punkt-Abfrage (nur DE) |
| Hagel | **gibt es nicht** (§19.5, D5) | benannte Lücke |

### 21.4 Plan R3D-5

| # | Was |
|---|---|
| **T1** | `route3d/routeSection.ts` (pur): Tour → `SectionColumnTerrain[]` + `AnchorSurface[]` → `assembleCrossSection`. Spalten aus dem **Track** (also aus dem in §20 geprüften Gelände), Anker aus den **Samples zur ETA**. |
| **T2** | `inversion?: 'estimate' \| 'none'` additiv in `crossSection.ts`; Standard unverändert. |
| **T3** | `route3d/RouteTerrainMap.tsx`: MapLibre + Terrarium-`raster-dem` + `setTerrain`, Streckenlinie auf dem Relief, `CurtainLayer` (unverändert), Streamlines, Positionsmarke, Kamera quer zur Strecke; WebGL-Rückfall. |
| **T4** | Dritte Sicht **`Gelände`** unter `/tourenplanung/gelaende` (noindex wie `/3d`); der Umschalter wird `2D · 3D · Gelände`. Die Modus-Zeile (Wetter / Zeit / Grenzwerte) bleibt dem Schnitt vorbehalten — sie stellt die **Frage**, die Sicht die **Darstellung**; beides in eine Zeile zu werfen wäre eine Kategorieverwechslung. |
| **T5** | Ehrlichkeit (was in der Wand steckt, warum keine Inversion, welche Auflösung) + Verifier, inkl. `verifyCurtainMesh` und `verifySectionGeometry`. |

### 21.5 Entscheidungen (Defaults, wenn Jan nicht widerspricht)

* **J1 — Die Wand zeigt Wind (bzw. Böen), Temperatur und Wolken.** Regen bleibt
  an der Strecke. Alternative wäre, `sectionImage` um eine Regenschicht zu
  erweitern — eigener Schritt, eigenes Gate.
* **J2 — Die Anker sind die Samples zur Ankunftszeit**, nicht ein Zeitschnitt.
  Das ist die Aussage der ganzen Tourenplanung; ein synoptischer Schnitt wäre
  eine andere Frage (und `SampleWeather` führt nur den ETA-Wert).
* **J3 — Überhöhung 1,3×** wie in der Atmosphäre-Ansicht, fest (nicht am
  Schnitt-Regler), weil sie hier Gelände streckt und nicht eine Zeichnung.

---

## §22 R3D-5 — Umsetzung T1–T5 · Gate GR3D-6 (2026-08-29)

### 22.1 Was gebaut wurde

**Die 3D-Ansicht hat jetzt zwei Bühnen: `Schnitt` und `Gelände`.**
Der Umschalter steht rechts in der Modus-Zeile und ist bewusst von ihr getrennt
— der Modus ist die **Frage** (Wetter / Zeit / Grenzwerte), die Bühne die
**Darstellung**. Auf der Gelände-Bühne entfällt die Modus-Zeile, und ein Satz
sagt, wo Zeitkorridor und Grenzwerte geblieben sind. Der gewählte Modus bleibt
gespeichert; der Rückweg findet die Frage wieder.

**T1 · `route3d/routeSection.ts` (pur).** Die Tour wird in die Form gebracht, die
`assembleCrossSection` ohnehin annimmt: Spalten aus dem **Track** (also aus dem
in §20 gegen das Geländemodell geprüften Gelände, 96 Stützpunkte), Anker aus den
**Samples zur Ankunftszeit**. Damit entsteht **kein zweiter Rechenweg** — der
Verifier rechnet Zelle für Zelle nach, dass `windKmh` und `gustKmh` aus demselben
`windAtAGL` kommen wie im Schnitt.

**T2 · `CrossSectionInput` bekommt zwei additive Felder.**
`inversion: 'estimate' | 'none'` (Standard `estimate`, Atmosphäre unverändert)
und `topM`. Die Tour fährt `none` — begründet in §21.2 (E3) — und deckelt die
Wand.

**T3 · `route3d/RouteTerrainMap.tsx`.** MapLibre mit Terrarium-`raster-dem`,
`setTerrain`, Schummerung aus **derselben** DEM-Quelle, Strecke auf dem Relief,
nasse Abschnitte als eigene Linie, `CurtainLayer` **unverändert**, Streamlines,
Positionsmarke an der geteilten Scrub-Position, Klick auf die Karte setzt sie.
WebGL-Rückfall nennt den Schnitt als Weg.

**T4 · Verdrahtung.** Die Karte kommt als **eigener Lazy-Chunk** (12,3 KB roh /
**4,95 KB gzip**): wer nur den Schnitt öffnet, lädt weder MapLibre-Vorhang noch
Texturbauer. Bühne und Wand-Ebenen liegen im `localStorage`.

**T5 · Ehrlichkeit + Verifier.** `curtainNote` sagt, was in der Wand steckt —
und ausdrücklich, dass Regen, Warnung und Schneefallgrenze **nicht** darin
stehen; `NO_INVERSION_NOTE` sagt, warum keine Inversion beurteilt wird.
`verify:route-3d` **461/461** (+80), inklusive der bis hier unverdrahteten
`verifyCurtainMesh()` und `verifySectionGeometry()`.

### 22.2 Gemessen — im Browser (Prod-Build, AT-Alpentour)

| Was | Ergebnis |
|---|---|
| Karte + Relief | Terrarium-Kacheln z5–z13, Schummerung sichtbar, Wand steht auf der Strecke |
| Geteilte Position | Marke wandert (−110 px, 427 px) → (863 px, −143 px); zurück im Schnitt steht **km 8,6** |
| Wand-Ebenen | fünf Chips schalten live durch (Wind/Böen, Temperatur, Wolken, Strömung, Regen) |
| Long Tasks | 7 Stück, **max 124 ms** (Texturbau + Kartenaufbau) — der Schnitt bleibt bei 0 |
| Konsole | **keine** Fehler, **keine** Warnungen |
| Mobil (390 px) | Karte 340 px, kein Ziel < 44 px, kein horizontaler Überlauf |
| Chunk | `RouteTerrainMap` 12,34 KB / **4,95 KB gzip**, lazy |

### 22.3 Vier Befunde aus dem laufenden Bild

1. **Die liberty-Warnung kam zurück — und die Korrektur lag in einer fremden
   Datei.** `Expected value to be of type number, but found null` (3×): der
   Stil-Fehler V-RL-3, für den `RadarMap.tsx` längst eine Korrektur hatte —
   als **lokale Funktion**. Nach der Regel „1:1 heißt importieren" ist sie jetzt
   `src/map/libertyStyle.ts`, und beide Karten rufen sie.
   **Und sie muss auf `style.load` laufen, nicht auf `load`:** die Kacheln
   werden schon geparst, während `load` noch auf das erste Bild wartet — auf
   `load` gepatcht blieb die Warnung stehen (gemessen).
2. **Die Kamera stand richtig und zeigte nichts.** Quer zur Strecke (Peilung
   − 90°) ist der beste Blick auf eine Wand — im Bild stand dann die Bergflanke
   zwischen Kamera und Wand und schnitt sie unten ab. Die Tiefenprüfung
   arbeitete korrekt; die **Ansicht** war unbrauchbar. Jetzt schaut sie **vom
   tiefen Ende die Strecke hinauf**, 42° aus der Streckenrichtung gedreht.
3. **Die Wand war 3,7 km hoch und verdeckte das Gelände** — obwohl `windAtAGL`
   bei `BOUNDARY_LAYER_M` (1 500 m über Grund) sättigt und darüber nur noch
   derselbe Wert steht. Die Höhe zeigte also nichts und kostete alles. Deckel
   jetzt „höchster Punkt + 1 200 m".
4. **Ein Umschalter sah aus wie ein Ausschalter.** Der Chip hieß „Mittelwind in
   der Wand" und war unbeleuchtet, wenn Mittelwind gezeigt wurde — zu lesen als
   „kein Wind". Die Wand zeigt aber **immer** Wind; der Schalter wählt zwischen
   zwei Größen. Jetzt: „**Böen statt Mittelwind**".

### 22.4 Eine Mess-Lehre

**Ein laufendes WebGL-Gelände lässt sich im Automations-Browser nicht
zuverlässig fotografieren.** `Page.captureScreenshot` lief zweimal in den
120-s-Timeout und gelang dreimal — bei identischem Zustand. Das ist dieselbe
Klasse wie V-R3D-2 (dort DPR 3), hier aber mit einer plausiblen Ursache: die
Karte rendert dauerhaft, während Terrain-Kacheln nachladen. Konsequenz für
künftige Messungen: **erst auf Netzruhe warten, dann fotografieren** — und
Aussagen, die ein Bild belegen soll, zusätzlich numerisch absichern (hier:
Marker-Transformationen, Chip-Zustände, Chunk-Größen).

### 22.5 Gate GR3D-6

| Frage | Beleg |
|---|---|
| 1 Funktionserhalt | Nichts entfernt. Der Schnitt mit seinen drei Modi ist unverändert; die Atmosphären-Ansicht ebenso (beide neuen `CrossSectionInput`-Felder sind optional, der Verifier prüft den unveränderten Standard `topM === 3500` und `inversion === 'observed'`). `RadarMap` verhält sich gleich — dieselbe Funktion, andere Datei. |
| 2 Desktop | Neu ist nur die zweite Bühne; die erste ist pixelgleich. |
| 3 Touch ≥ 44 px | Auf 390 px gemessen: **kein** Element unter 44 px (Bühnen-Umschalter, Einpassen-Knopf, Chips). |
| 4 Konsole | Keine Fehler, keine Warnungen — die liberty-Warnung ist mit der geteilten Korrektur weg. |
| 5 Long Tasks > 200 ms | Größter Task **124 ms**. |

`verify:route-3d` **461/461**, `verify:routing` 104/104, `typecheck` grün,
Budget totalJs 1 046,9/**1 047,1** KB (Ratsche von 1 038,4 — **+8,5 KB** für
Vorhang, Textur, Karte und Schnittbau, alles im Lazy-Chunk), eagerJs unverändert.

### 22.6 Was bewusst NICHT in der Wand steht

Regen, Schneefallgrenze und amtliche Warnung. `buildAnnotatedCurtain` komponiert
Wind/Böen, Temperatur und Wolken; alles Weitere hieße, `sectionImage.ts`
umzubauen — ein eigener Schritt mit eigenem Gate (E5). Der Regen färbt
stattdessen die Strecke, Warnung und Schneefallgrenze stehen in der
Punkt-Abfrage, und der Satz unter der Karte sagt es, damit die Abwesenheit in
der Wand nicht als „kein Regen" gelesen wird.

### 22.7 Offen

* **V-R3D-10 (neu):** Regen als eigene Schicht in der Vorhang-Textur
  (`sectionImage.ts`). Erst damit stünde „alle Wetterparameter" wörtlich in der
  Wand. Eigene Phase — die Textur ist heute Wind/Temperatur/Wolken.
* **V-R3D-11 (neu):** Die Startansicht wählt die Blickseite heuristisch (vom
  tiefen Ende, 42° heraus). Datengestützt wäre: das Gelände **beidseitig**
  abtasten und von der niedrigeren Seite schauen — die Seitenprofile aus §20/G3
  liegen bisher nur links.
* **V-R3D-12 (neu):** Der Texturbau der Wand läuft auf dem Hauptthread
  (gemessen bis 124 ms je Umschaltung). Ein `OffscreenCanvas` im Worker wäre der
  Weg, wenn die Zahl je wächst.
* Real-Device (V-LE-13), V-R3D-4, V-R3D-7…9 unverändert.

---

## §23 R3D-6 — „mehr Atmosphäre als Wetterlage am Boden" · Gate GR3D-7 (2026-08-29)

Jans Rückmeldung zur Gelände-Bühne: *„jetzt zeigt es aber mehr die Atmosphäre
als die Wetterlagen am Boden, bitte korrigiere das."*

Er hat recht, und der Grund steht im Bau von §22.

### 23.1 Warum die Ansicht in die Luft zeigte

Drei Dinge zusammen:

1. **Die Wand war der einzige Träger.** Alles, was die Karte über das Wetter
   sagte, stand in einer senkrechten Fläche ÜBER der Strecke. Am Boden lag nur
   eine orangefarbene Linie — die Strecke selbst, ohne einen einzigen Wert.
2. **Sie reichte bis zur Schnitt-Decke.** `topM` = höchster Punkt + 1 200 m; über
   einer Alpentour also gut 3,5 km Luft. Dass `windAtAGL` bei
   `BOUNDARY_LAYER_M` = 1 500 m über Grund sättigt, machte den oberen Teil
   sogar **aussagelos** — dort stand überall derselbe Wert.
3. **Die Startschalter verstärkten es.** An war die Windströmung (Linien in
   1–3 km Höhe), aus waren die Bodenschichten. Die erste Ansicht zeigte damit
   buchstäblich Höhenwind über einem stummen Boden.

Die Wetterlage am Boden gab es — aber nur in der Punkt-Abfrage rechts, für
**einen** Ort. Auf der Karte war sie nicht.

### 23.2 Was geändert wurde

**A · Die Strecke trägt jetzt die Wetterlage am Boden.** Vier neue Spuren, alle
aus denselben `SceneColumn`-Werten, mit denen der Schnitt arbeitet:

| Spur | Aussage | Regel |
|---|---|---|
| Farbe der Strecke | Temperatur an der Ankunftszeit | dieselben Stufen/Farben wie das Band im Schnitt (`TEMP_COLORS`) |
| Pfeile auf dem Gelände | wohin der Wind weht, gefärbt nach Rücken/Seite/Gegen | dieselbe Auswahlregel wie im Schnitt |
| blaue Spur | nasse Abschnitte | `rainWindows` wie in 1b |
| rote Spur | amtliche Warnung (Level 4/5 dunkler) | `scene.warnZones` |

Neu und pur: `routeSegments()` (je Spalte ein Stück, Grenzen in der **Mitte**
zwischen zwei Abtastpunkten — ein Sample steht für seine Umgebung),
`segmentCoords()` (die eine Stelle für alle Spuren) und `windPicks()`.

**B · Die Wand wird eine bodenfolgende Bahn.** `buildCurtain` bekommt
`bandAglM`: die Oberkante liegt jetzt so viele Meter über dem Gelände **dieser
Spalte**, nicht an der Decke. 300 m — die Luft, durch die man geht. Unten steht
der Bodenwert, oben sieht man, wie schnell er zunimmt.

> Das ist **keine Pipeline-Änderung**: Shader, Attribut-Layout, Textur-Format
> und Zeichenaufruf bleiben Zeile für Zeile stehen; `setCurtain` reicht einen
> Parameter an die reine Geometrie durch, und `v` wird an der tatsächlichen
> Oberkante ausgewertet — die Textur wird nicht umgerechnet, nur ausschnittweise
> gezeigt. `curtainMesh.ts` ist ausdrücklich DOM- und WebGL-frei.

**C · Die Abtastung wird fein genug für eine 300-m-Bahn.** Der Standard-
Höhenschritt (150 m) hätte darin zwei Stützstellen; jetzt 25 m, also zwölf.
Und die Textur-Decke sinkt auf „höchster Punkt + 400 m", damit die 132
Bildzeilen dort liegen, wo die Bahn steht.

**D · Die Schalter sagen, worum es geht.** Die Chip-Zeile hat zwei Gruppen —
**Am Boden** zuerst, **In der Luft** danach. Am Boden ist beim Start alles an,
in der Luft nur die Bahn (Temperaturschichten, Wolken und Strömung sind der
Zusatz und starten aus).

**E · Der Ehrlichkeitssatz beginnt am Boden.** „Die Wetterlage am Boden liegt AN
der Strecke: Farbe = Temperatur, Pfeile = Wind zur Fahrtrichtung, blau = Regen,
rot = amtliche Warnung. Die Wand darüber ist eine Bahn 300 m über Grund …"

### 23.3 Vier Befunde aus dem laufenden Bild

1. **Die Positionsmarke fehlte bis zum ersten Scrubben.** Ihr Effekt läuft beim
   Einhängen — da war `readyRef` noch false, und danach lief er nie wieder, weil
   sich `markerM` nicht geändert hatte. Jetzt setzt der Kartenaufbau sie selbst.
2. **Die Windpfeile lagen hinter der Wand.** Sie wurden vor dem Vorhang
   angelegt, also auch vor ihm gezeichnet — und die Bahn steht genau auf der
   Strecke. Reihenfolge getauscht.
3. **Und dann waren sie immer noch unsichtbar.** Bilder registriert (`hasImage`
   dreimal `true`), elf Merkmale in der Quelle, Layer vorhanden, keine
   „could not be loaded"-Warnung — und trotzdem kein Pfeil. Ursache:
   **`icon-rotation-alignment: 'map'` zieht `icon-pitch-alignment` mit** (der
   Standard ist `auto`). Der Pfeil liegt damit flach auf dem Gelände — was
   richtig ist, er zeigt ja eine Richtung am Boden —, aber bei 64° Kameraneigung
   schrumpft ein 12-px-Pfeil auf rund 5 px. Jetzt 24 px im Bild bei Größe 1,4,
   und beide Ausrichtungen stehen ausdrücklich da statt implizit.
4. **Pfeile dürfen fehlen — dann muss es dastehen.** Unter 4 m/s setzt
   `buildColumns` keine Windrelation (der Wind schiebt und bremst dann nicht
   spürbar). Der Schalter war an und zeigte nichts. Jetzt trägt der Chip
   „zu schwach" und nennt im Titel die Schwelle.

### 23.4 Gemessen (Prod-Build, DE-Tour Freiburg → Schauinsland)

| Was | Ergebnis |
|---|---|
| Bild | Relief trägt, Strecke farbig, 11 Windpfeile auf dem Gelände, Bahn als flache Spur darüber |
| Long Tasks | Chip-Schalter ≤ **64 ms**, Bühnenwechsel 112 ms / 163 ms, Leerlauf **0** |
| Konsole | nur die vorbestehenden Brightsky-404 der Sondierung (V-R3D-4); die liberty-Warnung bleibt weg |
| Mobil (390 px) | kein Ziel < 44 px, kein horizontaler Überlauf, beide Gruppen sichtbar |
| Leere Spuren | „Regen · trocken", „Warnzone · keine Warnung", „Wolkenstockwerke · ohne Daten", „Wind · zu schwach" — jede benannt |

### 23.5 Gate GR3D-7

| Frage | Beleg |
|---|---|
| 1 Funktionserhalt | Nichts entfernt. Die Atmosphären-Ansicht ist unverändert (`bandAglM` ist optional; der Verifier prüft, dass `buildCurtain` ohne Bahn **byte-gleiche** Stützpunkte liefert). Der Schnitt unverändert. Alle Wand-Ebenen bleiben erreichbar, sie starten nur nicht mehr alle an. |
| 2 Desktop | Geändert ist nur die Gelände-Bühne. |
| 3 Touch ≥ 44 px | Auf 390 px gemessen: kein Element darunter. |
| 4 Konsole | Keine neuen Fehler oder Warnungen. |
| 5 Long Tasks > 200 ms | Größter Task **163 ms**. |

`verify:route-3d` **490/490** (+29), `verify:routing` 104/104, `typecheck` grün,
Budget totalJs 1 048,4/**1 048,5** KB.

### 23.6 Offen

* **V-R3D-13 (neu):** Die Bahnhöhe ist mit 300 m fest. Wer die ganze Vertikale
  sehen will, nimmt den **Schnitt** — er hat die Höhenachse dafür. Ob die Karte
  zusätzlich einen Regler braucht, ist eine Produktfrage; ein zweiter Weg zur
  selben Aussage ist erst einmal einer zu viel.
* **V-R3D-10** unverändert: Regen als eigene Schicht IN der Wand. Am Boden
  steht er jetzt; in der Wand steht er weiterhin nicht, und der Satz sagt es.
* Real-Device, V-R3D-4, V-R3D-7…9, V-R3D-11/12 unverändert.

---

## §24 R3D-7 — Diagnose „Zeitplan: alle Wetterereignisse in Schriftform" (2026-08-29)

Jans Auftrag: *„einen Zeitplan erstellen, in dem man alle Wetterereignisse oder
Änderungen entlang der Route nochmal in Schriftform übersichtlich sieht."*

### 24.1 Was es dafür schon gibt — und warum es nicht reicht

| Vorhanden | Was es zeigt | Warum es die Frage nicht beantwortet |
|---|---|---|
| `buildTimeline` (1b, `corridor.ts:218`) | je **Wetterperle** (Stundenraster) eine Zeile „wo bin ich um T, und was ist dort" | Es beschreibt **Zustände**, keine Änderungen: drei Stunden im selben Regen ergeben dreimal Regen. Und je Zeile nur das Wichtigste — der Wind fällt weg, sobald es regnet. |
| `ZEITPLAN` im 2D-Ergebnis (`TourView`) | Start, Pausen, Mahlzeit, Ziel | Das ist der **Bewegungs**plan. Kein Wetter. |
| `SectionList` (1c) | Abschnitte nach Grenzwert-Status | Nur die eigenen Grenzwerte, und nur deren Frage. |
| `buildGoNoGoReport` (1c) | Textbericht je Abschnitt | Ebenso — und nur im Grenzwert-Modus erreichbar. |

**Befund F1 — es fehlt die dritte Form.** Zustand (Perlen), Bewertung
(Abschnitte) und **Ereignis** sind drei verschiedene Fragen. „Wann fängt es an
zu regnen, wann hört es auf, wann dreht der Wind" beantwortet keine der beiden
vorhandenen Listen.

### 24.2 Was sich aus der Kette wirklich ableiten lässt

Alles aus `SceneColumn` plus den bereits gebauten Strukturen — **kein neuer
Abruf, keine neue Quelle**:

| Ereignis | Regel | Woher |
|---|---|---|
| Start / Ankunft | erste und letzte Spalte | `columns` |
| Regen beginnt / endet | Kanten der Regenfenster | `rainWindows` (1b) |
| Niederschlagsart wechselt | `precipType` Regen ↔ Schneeregen ↔ Schnee | `columns` |
| Windband wechselt | `windBandIndex` (fünf benannte Bänder, dieselben wie Wand und Legende) | `crossSection` |
| Wind dreht zur Fahrtrichtung | `windRel` Rücken ↔ Seite ↔ Gegen (Schwelle 4 m/s wie überall) | `columns` |
| Temperatur über-/unterschreitet eine 5-°C-Marke | linear zwischen zwei Spalten interpoliert | `columns` |
| Gefühlt unter 0 °C | eigene Marke, weil sie etwas anderes bedeutet als 5 °C-Schritte | `columns` |
| Amtliche Warnung beginnt / endet | Zonenkanten | `warnZones` (DE) |
| Weg steigt in die Wolkenbasis / wieder heraus | `terrainM` gegen `cloudBaseM` | `columns`, **abgeleitet** |
| Weg über die Schneefallgrenze und zurück | `terrainM` gegen `snowLineM` | `columns` (AT/CH) |
| Grenzwert reißt / hält wieder | Statuswechsel der Abschnitte | `goSections` (1c) |

**Befund F2 — die Uhrzeit eines Ereignisses ist genauer als die Spalte.** Bei
Schwellen (Temperatur, Wolkenbasis, Schneefallgrenze) liegt der Übergang
zwischen zwei Abtastpunkten. Er wird **linear interpoliert** — km und Uhrzeit
kommen aus derselben Interpolation, damit beide denselben Punkt meinen. Bei
Zuständen (Regen, Warnung, Abschnitt) sind die Kanten schon gerechnet
(`segmentEdges`) und werden übernommen, nicht zum zweiten Mal bestimmt.

**Befund F3 — der Plan darf nicht Vollständigkeit behaupten.** Zwischen zwei
Abtastpunkten liegen 500 m bis 2 km; ein Schauer, der genau dazwischen fällt,
steht in keiner Zeile. Und die Lücken sind strukturell: Warnungen nur DE,
Schneefallgrenze nur AT/CH, Hagel nirgends (§19.5). Der Plan trägt deshalb
denselben Auflösungssatz wie die Ansicht und nennt, was strukturell fehlt.

**Befund F4 — Flattern ist ein echtes Risiko.** Ein Wert, der um eine Schwelle
pendelt, erzeugt sonst „Böen über 45 · Böen unter 45 · Böen über 45". Zwei
Regeln dagegen: Bänder statt Zahlen (ein Bandwechsel ist eine Aussage, ein
Wert-Wechsel um 1 km/h nicht), und **je Spalte höchstens ein Ereignis derselben
Art**. Ein Deckel bleibt trotzdem nötig — und wird **ausgesprochen**, nie still
gekürzt (V-246, dieselbe Auflage wie bei der Brände-Liste).

**Befund F5 — der Plan gehört nicht in einen Modus.** Er beantwortet keine der
drei Fragen (1a/1b/1c), sondern fasst alle zusammen. Er steht deshalb **unter**
der Bühne, in jedem Modus und auf beiden Bühnen — und im Druckbild, wo er die
eigentliche „Schriftform" ist.

### 24.3 Plan R3D-7

| # | Was |
|---|---|
| **S1** | `route3d/schedule.ts` (pur): `buildSchedule()` → `ScheduleEvent[]` (Zeit, km, Art, Ton, Satz), `scheduleNote()` (was ein Ereignis ist und was fehlt), `buildScheduleText()` (dieselbe Liste als Text). |
| **S2** | `SchedulePanel` unter der Bühne: Zeit · km · Satz, nach Uhrzeit sortiert, Klick setzt die Position. Ton nur als Beiwerk — der Satz trägt allein. |
| **S3** | Druckbild: der Plan bleibt **stehen**, wenn Bühne und Bedienung verschwinden. |
| **S4** | „Als Text kopieren" nach dem Muster von `buildGoNoGoReport` — kein Link (B3). |
| **S5** | Verifier: jede Regel einzeln, das Nicht-Flattern, der ausgesprochene Deckel, die Interpolation, die benannten Lücken. |

### 24.4 Entscheidungen (Defaults)

* **K1 — Pausen bleiben draußen.** Der Bewegungsplan steht im 2D-Ergebnis; zwei
  Listen mit demselben Namen wären eine zu viel. Der Wetterplan sagt in seiner
  Kopfzeile, dass er das Wetter meint.
* **K2 — Grenzwert-Ereignisse nur, wenn der Grenzwert-Modus etwas liefert.**
  Sonst stünde eine „Entscheidung" im Plan, die der Nutzer nie eingestellt hat.
  Sie tragen das Wort „dein Grenzwert".
* **K3 — Temperatur in 5-°C-Marken.** Feiner wäre Rauschen (die Quelle löst
  6–14 km auf), gröber verlöre den Anstieg einer Bergtour.

---

## §25 R3D-7 — Umsetzung S1–S5 · Gate GR3D-8 (2026-08-29)

### 25.1 Was gebaut wurde

**`src/route/route3d/schedule.ts` (pur, DOM-frei).** `buildSchedule()` erzeugt
aus `SceneColumn`, `rainWindows`, `warnZones` und — wenn vorhanden —
`goSections` eine nach Uhrzeit geordnete Liste von **Änderungen**. Elf
Ereignisarten, jede mit einer benannten Regel (§24.2). Dazu
`buildScheduleText()` (dieselbe Liste als Text, **kein Link**) und
`SCHEDULE_NOTE` (was der Plan ist und was er nicht leisten kann).

**`SchedulePanel` unter der Bühne.** Drei Spalten — Uhrzeit · km · Satz —,
eine Zeile je Änderung, Klick setzt die Position, die Zeile am Marker ist
hervorgehoben. Der Ton färbt nur den linken Rand; **jeder Satz trägt allein**,
auch schwarz auf weiß. Er hängt an **keinem Modus und an keiner Bühne**: er
fasst zusammen, was alle drei Ansichten zeigen.

**Drei Regeln, die die Liste tragen:**

1. **Schwellen werden interpoliert.** Temperatur, Wolkenbasis und
   Schneefallgrenze wechseln zwischen zwei Abtastpunkten; km und Uhrzeit kommen
   aus derselben Interpolation. Im Verifier nachgerechnet: bei 17 °C → 13 °C
   über 1 000 m liegt die 15-°C-Marke exakt in der Mitte.
2. **Bänder statt Zahlen, plus Hysterese.** `steppedBand()` wechselt erst,
   wenn die Kante um 2 km/h (Wind) bzw. 0,5 K (Temperatur) überschritten ist.
   Ein Wert, der um 45 km/h pendelt (44 · 46 · 44 · 46), erzeugt **keine**
   Zeile — im Verifier festgehalten.
3. **Der Deckel wird ausgesprochen.** `omitted` sagt, wie viele Zeilen fehlen;
   nie eine stille Kürzung (V-246).

**Und drei Ehrlichkeitsauflagen:**

* Der Plan sagt in seiner Kopfzeile, dass er **nur Änderungen** nennt und dass
  der Bewegungsplan mit Pausen im 2D-Ergebnis steht (K1) — zwei Listen mit
  demselben Namen wären eine zu viel.
* Grenzwert-Zeilen tragen das Wort **„dein Grenzwert"** (K2).
* Unter der Liste stehen die **strukturellen Lücken**: keine Warnungen in
  AT/CH, keine Schneefallgrenze in DE, und **kein Hagel** (§19.5) — an genau
  der Stelle, an der jemand danach suchen würde.

### 25.2 Gemessen — im Browser (Prod-Build, AT-Alpentour)

Der Plan an echten Daten, unverändert übernommen:

```
15:04  km 0,0  Start · 25 °C, Böen 11 km/h
16:58  km 2,9  Böen steigen ins Band 15–30 km/h
19:55  km 6,3  Temperatur fällt unter 20 °C
21:10  km 6,8  Temperatur fällt unter 15 °C
21:11  km 6,8  Böen fallen ins Band < 15 km/h
23:30  km 7,7  Temperatur fällt unter 10 °C
01:44  km 8,6  Böen steigen ins Band 15–30 km/h
01:44  km 8,6  Ankunft · 8 °C, Böen 27 km/h
```

| Was | Ergebnis |
|---|---|
| Klick auf eine Zeile | Position springt von km 0,0 · 15:04 auf **km 7,7 · 23:30**, die Zeile wird als „hier" markiert |
| „Als Text kopieren" | **1 075 Zeichen**, Kopf mit Tourname, jede Zeile, der Vorbehalt, beide Lücken — **kein `http`** |
| Long Tasks | **0** beim Durchklicken aller acht Zeilen |
| Konsole | keine Fehler, keine Warnungen |
| Mobil (390 px) | km rückt unter die Uhrzeit, kein Ziel < 44 px, kein Überlauf |
| Lücken | „Amtliche Warnungen … nur vom DWD" und der Hagel-Satz stehen unter der Liste |

### 25.3 Was auffiel

**Zwei Zeilen zur selben Minute sind kein Fehler.** Um 01:44 stehen
„Böen steigen ins Band 15–30 km/h" und „Ankunft" untereinander: am Gipfel
frischt es genau bei der Ankunft auf. Die Ordnungsregel `ORDER` sorgt dafür,
dass die Ankunft dabei **zuletzt** steht — sonst läse sich der Plan, als
passiere nach dem Ziel noch etwas.

**Der Kopierweg ist derselbe wie in 1c** (`navigator.share`, sonst
Zwischenablage). Für die Messung musste er gestubbt werden, weil der
Automations-Browser beides sperrt — dasselbe Vorgehen wie beim 1c-Bericht.

### 25.4 Gate GR3D-8

| Frage | Beleg |
|---|---|
| 1 Funktionserhalt | Rein additiv: ein neuer Abschnitt, ein neues pures Modul. Keine bestehende Liste, kein Modus, keine Bühne verändert. |
| 2 Desktop | Nur der neue Abschnitt kommt hinzu. |
| 3 Touch ≥ 44 px | Auf 390 px gemessen: jede Zeile und der Kopieren-Knopf ≥ 44 px. |
| 4 Konsole | Keine Fehler, keine Warnungen. |
| 5 Long Tasks > 200 ms | **0** beim Durchklicken. |

`verify:route-3d` **547/547** (+57), `verify:routing` 104/104, `typecheck`
grün, Budget totalJs 1 050,8/**1 050,9** KB.

**Nicht visuell geprüft:** das Druckbild. `window.print()` öffnet einen
Browser-Dialog und würde die Automatisierung blockieren; die Druckregeln sind
deshalb nur im CSS belegt (der Plan bleibt stehen, der Kopieren-Knopf
verschwindet, eine Zeile wird nicht umbrochen). Das ist eine Messgrenze, keine
Aussage über das Ergebnis.

### 25.5 Offen

* **V-R3D-14 (neu):** Der Plan steht nur in der 3D-Ansicht. Im 2D-Ergebnis
  gäbe es Platz neben dem `ZEITPLAN` der Pausen — dort wären es aber zwei
  Listen nebeneinander, und die Frage, ob sie eine werden sollen (Wetter **und**
  Pausen in einer Spalte), ist eine Produktfrage.
* **V-R3D-15 (neu):** Ereignisse zwischen zwei Abtastpunkten fehlen
  strukturell (500 m – 2 km). Der Vorbehalt sagt es; feiner würde nur eine
  feinere Abfrage, nicht eine feinere Auswertung.
* Real-Device, V-R3D-4, V-R3D-7…13 unverändert.

---

## §26 R3D-8 — Das Ergebnis öffnet mit dem Gelände · Gate GR3D-9 (2026-08-29)

Jans Entscheidung: *„die Geländekarte mit der flachen Karte am Anfang
tauschen."* Auf Rückfrage präzisiert — gemeint ist die Karte im **Ergebnis**
(2D), nicht der Schnitt in der 3D-Ansicht. Gewählte Fassung: das Ergebnis öffnet
mit dem Relief, **die flache Karte bleibt als zweite Ansicht erhalten**.

### 26.1 Warum die flache Karte bleibt

Sie ist kein schlechteres Relief, sie kann anderes: **Pausen-Marker,
Wegpunkt-Vorschläge, Klick „Pause hier", Wetter-Marker mit Popup**. Die
Geländekarte kann davon nichts. Sie ersetzen hieße, diese Funktionen zu
verlieren — der Umschalter kostet einen Knopf und erhält vier Funktionen.

### 26.2 Was gebaut wurde — und was ausdrücklich NICHT zweimal

Die Gelände-Ansicht gibt es jetzt an **zwei** Stellen. Damit daraus keine zwei
Wahrheiten werden, ist die Logik **eine**:

| Wandert nach | Was |
|---|---|
| `model.ts` (pur) | `TEMP_STEPS` / `TEMP_COLORS` / `tempStepIndex` / `REL_COLORS` — eine Palette ist Daten, keine Komponente. `Scene3D` reicht sie unverändert weiter. |
| `routeSection.ts` (pur) | `TerrainLayerFlags`, `DEFAULT_TLAYERS`, `loadTLayers` / `saveTLayers`, **`terrainChips()`** (die Chip-Zeile als Daten) und **`buildGroundLayers()`** (Temperatur-, Warn- und Pfeil-Spuren). |
| `Route3DView.tsx` | exportiert `TerrainChipButton` — beide Ansichten nehmen denselben Knopf. |

Neu ist nur das **Layout**: `RouteTerrainPanel.tsx` für das Ergebnis, die Bühne
„Gelände" in der 3D-Ansicht unverändert. Ein Schalter, ein Speicherschlüssel,
eine Liste — wer im Ergebnis die Temperaturschichten einschaltet, findet sie in
der 3D-Ansicht wieder.

**Im Ergebnis:** Umschalter `Gelände | Karte` **über** der Karte (nicht darin —
die flache Karte hat feste Höhe mit `overflow: hidden`, die Gelände-Ansicht
wächst mit; ein Kind hätte beide Male anders liegen müssen), mit einem Satz
daneben, der sagt, was die jeweilige Ansicht kann. Die Wahl liegt im
`localStorage` (`bsc.route.resultmap`, Standard `terrain`). Ohne berechnetes
Wetter erscheint der Umschalter gar nicht — dann gibt es keine Szene, und ein
Knopf, der nichts verspricht, verspricht auch nichts Falsches.

Die Gelände-Ansicht kommt **lazy**: wer auf die flache Karte umschaltet, lädt
Vorhang und Texturbauer nie.

### 26.3 Zwei Befunde aus dem laufenden Bild

1. **Die Chips schoben die Karte unter den Falz.** Mit der Chip-Zeile obenauf
   begann die Karte auf 1440 × 900 erst bei y ≈ 690 px. Im Ergebnis ist das
   Relief die Aussage ⇒ **erst die Karte, dann die Schalter**. In der 3D-Ansicht
   bleibt es umgekehrt: dort steht die Bühne ohnehin oben. Der Verifier hält
   beide Reihenfolgen fest, damit keine der beiden „aufgeräumt" wird.
2. **Die liberty-Warnung kam zurück — aus der flachen Karte.** `RouteMap.tsx`
   kannte die geteilte Korrektur (V-RL-3) nie; sie fiel bisher nur niemandem
   auf, weil selten beide Karten in einer Sitzung entstehen. Jetzt ist sie der
   **dritte** Aufrufer von `src/map/libertyStyle.ts` — ebenfalls auf
   `style.load`, nicht auf `load`. Konsole seither ohne diese Warnung.

### 26.4 Eine Mess-Lehre

**Ein Werkzeug, das „erfolgreich" meldet, hat nicht unbedingt gewirkt.**
Die erste Mobil-Messung fand Bedienelemente mit 34 und 38 px — die
44-px-Regeln stünden also nicht. Sie stehen; `resize_page` hatte gemeldet, das
Fenster sei 390 px breit, aber `window.innerWidth` war **1600**, und
`matchMedia('(max-width: 767px)')` war `false`. Nach echtem Verkleinern: 44 px,
kein Überlauf. **Konsequenz:** eine responsive Messung beginnt mit der Zusicherung
`innerWidth` / `matchMedia`, nicht mit dem Rückgabewert des Werkzeugs. Dieselbe
Klasse wie `getBBox()` ohne `transform` (§18.5) und wie „alle Wandsegmente statt
des untersten je Spalte" (§20.4).

### 26.5 Gemessen (Prod-Build)

| Was | Ergebnis |
|---|---|
| Start | Ergebnis öffnet mit dem Relief; Umschalter `Gelände · Karte`, Notiz „Relief mit der Wetterlage auf der Strecke" |
| Zurück auf „Karte" | flache Karte samt Markern und Quellen-Overlay wieder da, Notiz wechselt |
| Wahl | überlebt den Wechsel (`bsc.route.resultmap` = `terrain`) |
| Long Tasks | max **184 ms** (Karte aufbauen/abbauen beim Umschalten), Chips ≤ 70 ms |
| Konsole | keine liberty-Warnung mehr; nur die vorbestehenden Brightsky-404/CORS der Sondierung (V-R3D-4) |
| Mobil (echte 390 px) | Chips 44 px, Umschalter 44 px, Karte 300 px, kein horizontaler Überlauf |

### 26.6 Gate GR3D-9

| Frage | Beleg |
|---|---|
| 1 Funktionserhalt | Die flache Karte bleibt mit **allen** Funktionen erreichbar (live geprüft: Marker, Quellen-Overlay, Wind-Legende). Die 3D-Ansicht ist unverändert. Kein Layer, kein Schalter entfernt. |
| 2 Desktop | Geändert ist die Kartenspalte des Ergebnisses; alles andere pixelgleich. |
| 3 Touch ≥ 44 px | Bei **echten** 390 px gemessen (siehe §26.4): kein Element darunter. |
| 4 Konsole | Eine Warnung **weniger** als vorher. |
| 5 Long Tasks > 200 ms | Größter Task 184 ms. |

`verify:route-3d` **564/564** (+11), `verify:routing` 104/104, `typecheck` grün,
Budget totalJs 1 053,0/**1 053,1** KB.

### 26.7 Offen

* **V-R3D-16 (neu):** Umschalten zwischen den beiden Karten baut jedes Mal eine
  MapLibre-Instanz ab und eine auf (184 ms). Beide gleichzeitig zu halten wäre
  schneller und teurer — eine Abwägung, keine Selbstverständlichkeit.
* **V-R3D-14** (Zeitplan nur in der 3D-Ansicht) unverändert.
* Real-Device, V-R3D-4, V-R3D-7…13, V-R3D-15 unverändert.
