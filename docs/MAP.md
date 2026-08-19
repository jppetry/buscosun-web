# MAP.md — Die 2D-Wetterkarte: Komponenten, Renderpipeline, Datenfluss

> **Stand: 2026-08-05.** Ist-Analyse am Code (letzter geprüfter Stand `src/MapView.tsx` 4.173 Zeilen)
> plus die Punkte, an denen die geplante Layer-Erweiterung angreift.
> **Status: Analyse. Keine Implementierung.**
>
> Zugehörig: `docs/LAYER_SYSTEM.md` (Layer-Vertrag) · `docs/DATA_SOURCES.md` (Quellen) ·
> `docs/API.md` (Endpunkt-Kontrakte) · `docs/2d-layer-erweiterung.md` (Umsetzungsplan) ·
> `architecture.md` §3 · `docs/niederschlag-architektur.md` (Niederschlags-Spezialfall).

---

## 1. Komponentenlandschaft

```
App.tsx  (handgerollter View-Switcher, kein Router)
  └─ MapView.tsx  ······ 4.173 LOC · 26 useState · 56 useEffect · 64 useRef
       │                 besitzt die MapLibre-Instanz und ALLE 16 LayerKeys
       ├─ components/LayerInfoPanel.tsx    Readout-Karte je aktivem Layer
       ├─ components/LayerIcon.tsx         Dock-/Readout-Icons
       ├─ map/ModelSwitcher.tsx            Per-Land-Modellwahl (D-16)
       ├─ map/ModelLibraryOverlay.tsx      Modellkatalog
       ├─ map/SevenDayForecast.tsx         7-Tage-Streifen
       ├─ pointForecast/PointForecastPanel.tsx
       ├─ map/deckIcons.tsx  ·  map/mapDeck.css (55 KB)
       └─ MapView.css (70 KB)
```

Daneben existieren **fünf weitere MapLibre-Instanzen** im Projekt, die dieselbe Bibliothek, aber
nicht dieselbe Layer-Infrastruktur nutzen: `radar/RadarMap.tsx`, `nowcast/NowcastRadarMap.tsx`,
`route/RouteMap.tsx`, `globe/GlobeMap.tsx`, `threed/TerrainMap.tsx`, `atmosphere/ThermalMap.tsx`,
`history/MapPicker.tsx`, `HeroMapBackground.tsx`.

**Relevanz für die Erweiterung:** `NowcastRadarMap.tsx` (29 KB) zeigt Radar in der
Nowcast-Ansicht und `RadarMap.tsx` (19 KB) in der Radar-Ansicht. Neue Radar-nahe Layer sollten in
mindestens einer dieser Ansichten mitgedacht werden — sonst entstehen drei Wahrheiten über „was ist
Radar". Zugleich gilt `CLAUDE.md` „Ein Thema = eine Phase": die Ausweitung auf die anderen Karten ist
eine **eigene** Phase, kein Nebenschauplatz.

---

## 2. Renderpipeline

### 2.1 Der Frame

```
MapLibre render loop
  ├─ Style-Layer (basemap, dim, raster, geojson-fill/line/circle) — MapLibre zeichnet
  └─ Custom-Layer in Stack-Reihenfolge — buscosun zeichnet selbst:
       render(gl, args)
         args = CustomRenderMethodInput | number[] | Float32Array
         matrix = args.defaultProjectionData.mainMatrix   (MapLibre 5.x)
```

Jeder Custom-Layer sichert den GL-Zustand, den er verändert, und stellt ihn wieder her
(`prevBlend`, `prevDepth`, `prevDepthMask` in `RainLayer.render()`).

### 2.2 Der Depth-Kontrakt (subtil, dokumentiert, brechbar)

```ts
gl.enable(gl.DEPTH_TEST);   // MUSS an bleiben
gl.depthMask(false);        // aber nicht schreiben
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
```

Begründung im Code (`RainLayer.ts:265-272`): Ein `disable(DEPTH_TEST)` unterbindet nach
WebGL-Spezifikation auch den Depth-**Write**. Die später gezeichnete Länder-Maske hätte dann nichts
mehr zu testen, und der Layer schiene über die Landesgrenze hinaus durch — ein realer User-Report.
`src/countryMask.ts` baut DACH als invertiertes Even-Odd-Loch-Polygon.

**Für die Erweiterung:** Jeder neue Custom-Layer, der auf DACH beschnitten sein soll, muss diesen
Kontrakt exakt übernehmen. Layer, die *nicht* beschnitten sein sollen (Europa-Radar, Satellit,
MTG-Blitz), müssen bewusst außerhalb der Maske liegen — das ist eine Z-Band-Entscheidung (§6 in
`docs/LAYER_SYSTEM.md`), keine Shader-Entscheidung.

### 2.3 Projektion im Vertex-Shader

```glsl
float mx = (a_lnglat.x + 180.0) / 360.0;
float my = 0.5 - log(tan(PI*0.25 + lat_rad*0.5)) / (2.0*PI);
gl_Position = u_matrix * vec4(mx, my, 0.0, 1.0);
```

Web-Mercator wird **im Shader** gerechnet; die CPU liefert nur lon/lat. Das ist der Grund, warum
Quellgitter in beliebigen Projektionen ohne CPU-Reprojektion darstellbar sind — man muss lediglich
die **Geo-Koordinaten der Gitterknoten** kennen.

### 2.4 Warp-Mesh statt Vier-Eck-Quad

Das ist die architektonisch wichtigste Einzelentscheidung der Renderpipeline. RADOLAN DE1200 ist
polar-stereografisch; sein WGS84-Fußabdruck ist ein **Trapez mit gekrümmten Kanten**. Ein linearer
Vier-Eck-Warp verschiebt Zellen im Inneren um **bis zu ~40 km** (Mittel ~15 km).

`radolan.ts` löst das mit `de1200WarpMesh()`: ein 33×33-Stützpunktgitter, dessen Knoten **exakt**
polar-stereografisch verortet sind (`psFwd`/`psInv`, handimplementiert wegen eines bekannten
proj4js-Bugs bei `lat_0=90`). Restfehler < ~50 m. `RainLayer.setFrame()` erkennt `warpLnglat`+`warpN`
und baut daraus N·N·6 Vertices statt 6.

**Konsequenz für neue Quellen:**

| Quelle | Projektion | Warp nötig? |
|---|---|---|
| RADOLAN RV (DE1200) | polar-stereografisch | **ja**, vorhanden |
| RADOLAN RE (900×900) | polar-stereografisch, **anderer Ursprung** | **ja, eigenes Mesh** |
| MeteoSchweiz RZC/BZC/MZC | LV95 / `somerc` | Ecken aus `/where`; Domäne klein ⇒ ⚠️ Vier-Eck genügt vermutlich — **zu messen** |
| GeoSphere INCA | EPSG:31287 | lon/lat-Arrays liegen **im NetCDF** ⇒ exakt, kein Mesh nötig |
| GeoSphere SNOWGRID | **EPSG:3416** | anderes Datum als INCA ⇒ eigene Behandlung |
| OPERA | LAEA, 3800×4400 km | **ja, großes Mesh** — Verzerrung über diese Ausdehnung erheblich |

**Diese Tabelle ist der eigentliche Aufwandstreiber der Rastererweiterung** — nicht das Dekodieren.

### 2.5 Abtastung und Farbgebung

`RainLayer` sampelt **bikubisch (B-Spline, 4 Taps)** statt nur GPU-bilinear. B-Spline-Gewichte sind
alle nicht-negativ und summieren zu 1 ⇒ rein konvexe Mischung ⇒ **kein Überschwingen, kein
künstlicher Regen an Kanten**. Das ist meteorologisch wichtig und sollte für jeden neuen
Intensitäts-Layer übernommen werden.

Die Farbskala liegt als **16×16-LUT-Textur** im Fragment-Shader. Folge: Ein Frame-Wechsel kostet nur
einen ~1-MB-Texturupload, und ein **Palettenwechsel kostet gar keinen Netzwerkverkehr**
(`setColorRamp()`). Damit sind Farbenblind-Paletten, dBZ-vs-mm/h-Umschaltung und
Akkumulations-Paletten praktisch gratis — ein Vorteil, den ein WMS-Rasterlayer prinzipiell nicht hat.

`ScalarLayer` geht einen Schritt weiter: Der G-Kanal trägt die **Zellmittel-Höhe**; der Shader
rechnet auf Meereshöhe zurück und wendet 6,5 °C/km gegen ein fragment-gesampeltes DEM neu an →
kontinuierliche Tal/Grat-Gradienten statt 6-km-Treppen.

---

## 3. Datenfluss

### 3.1 Gesamtbild

```
                     ┌──────────────── Transport ────────────────┐
opendata.dwd.de ──►  │ Netlify-Rewrite /_dwd_opendata (CORS-Fix) │
                     │ Edge Function /_dwd_grib  (durable cache)  │ ──► fetch
                     │ Edge Function /_dwd_wind  (durable cache)  │
maps.dwd.de     ──►  │ direkt (CORS ok)                          │
data.geo.admin  ──►  │ direkt (CORS *)                           │
geosphere.at    ──►  │ direkt (CORS gemischt, Rate-Limit 240/h)  │
                     └───────────────────────────────────────────┘
                                        │
        ┌───────────────────────────────┼───────────────────────────────┐
        ▼                               ▼                               ▼
  decompress.ts                   jsfive H5File                  DOMParser (WMS caps)
  (bz2/gz Worker-Pool)                  │                               │
        ▼                               ▼                               ▼
  radolanDecode / gribDecode      Werte + /where-Ecken            TIME-Extent
        ▼                               ▼                               │
        └────────────► Uint8/Float32-Grid + Ecken/Warp ◄────────────────┘
                                        │
                         precipComposite.ts (DACH-Kompositor)
                                        │
                       RainLayer.setFrame / ScalarLayer.setData
                                        │
                                  triggerRepaint()
```

### 3.2 Der DACH-Kompositor

`src/scalar/precipComposite.ts` ist das architektonische Herzstück der Mehrländer-Darstellung:

- **Ein** reguläres lat/lon-Zielgitter: `G = {lon 5.5…17.4, lat 45.3…55.5, 600×512}` ≈ 2 km.
- Jede Zielzelle wird **einmal** einem Land zugeordnet (`pickCountry`, Box-Heuristik).
- Je Quelle wird **einmal** eine `Int32Array`-Index-Map berechnet: Zielzelle → Quellindex.
  RADOLAN über die exakte polar-stereografische Inverse, alle anderen über eine
  **inverse Bilinear-Interpolation mit Newton-Verfahren** (8 Iterationen, `precipIndexMap.ts`).
- Der Aufbau läuft off-main in `precipIndexWorker` (2er-Pool) — vorher blockierte er 250–370 ms je
  Quelle im Render-Pfad.
- **Pro Slider-Schritt nur noch ein Array-Gather** über 307.200 Zellen. Das ist der Grund, warum
  Scrubbing flüssig ist.

**Das ist ein sehr gutes Muster, und es skaliert auf die neuen Layer:** Hagel, Schneefall-Phase und
Zellintensität sind strukturell dieselbe Aufgabe („mehrere Landesgitter → ein DACH-Gitter"). Was
fehlt, ist die Generalisierung: Der Kompositor ist heute auf `rv/inca/rzc/d2` **hart verdrahtet**
(vier `ensureXxx`/`primeXxx`-Methodenpaare, vier Index-Map-Felder). Ein fünfter oder sechster
Datensatz erzwingt Copy-Paste. → V-137.

### 3.3 Die Quellenwahl

`src/nowcast/precipSource.ts` ist die **einzige** Stelle, die entscheidet, welches Landesradar für
eine Slider-Stunde zuständig ist. Rein, DOM-frei, headless verifiziert
(`npm run verify:precip-source`, 22 Prüfungen).

Das ist das Referenzmuster für jede neue zeitabhängige Verfügbarkeitslogik (→ `docs/LAYER_SYSTEM.md`
§4.1, §8.2). **Es bleibt in L5/L6 unverändert** — `src/map/layerTime.ts` ruft
`precipRadarHorizonHours` auf, statt die Logik zu übernehmen. Damit ist die Byte-Identität für
`{rv, inca, rzc, d2}` konstruktiv gegeben statt geprüft (`docs/zuglinien-radar-spec.md` §3.6).

### 3.4 Ein Zeitbezugs-Defekt, der die Erweiterung direkt betrifft

Die Frame-Wahl je Layer läuft in `MapView.tsx` bereits über die **absolute** Gültigkeitszeit
(`Date.now() + forecastHour · 3 600 000`, 15 Fundstellen). Zwei Stellen tun es **nicht**:

- `src/radar/radarFrames.ts:161-169` verankert die INCA-Leads an `Date.now()` statt an der
  Laufzeit des INCA-Laufs.
- `src/scalar/precipComposite.ts:200` wählt den AT-Frame über `|leadHours − h|`.

INCA-Leads zählen aber ab der **Referenzzeit** des Laufs, und `src/sources/geosphereIncaGrid.ts`
liest diese gar nicht aus (sie steht als Root-Attribut `last_forecast_reftime` im NetCDF).
**Wirkung, am Live-Datensatz gemessen (2026-08-05, Referenzzeit 19:15, Abruf 19:47): jeder
AT-Frame wird um 32 Minuten zu jung beschriftet**; der Versatz entspricht `now − reftime` und
liegt zwischen 0 und ~45 Minuten. DE und CH sind nicht betroffen (RV trägt seine Laufzeit im
Header, rzc seine Messzeit in `/what`).

Das ist der Grund, warum `layerTime.ts` die Frame-Wahl auf die absolute Gültigkeitszeit umstellt
(→ V-144, Spec §3.4).

---

## 4. State-Management

**Es gibt keine State-Bibliothek.** Der Zustand lebt in React-Hooks in `MapView.tsx`:

| Art | Anzahl | Beispiele | Zweck |
|---|---|---|---|
| `useState` | 26 | `active: Set<LayerKey>`, `forecastHour`, `statuses`, `layerHover`, `satProduct`, `snowMode` | UI-Zustand, löst Re-Render aus |
| `useRef` | 64 | `mapRef`, `nowcastRef`, `incaGridRef`, `meteoRadarRef`, `iconD2Ref`, `modelSourceRef` | Datenhaltung **ohne** Re-Render |
| `useEffect` | 56 | Lazy-Loader je Layer, Sichtbarkeit, Frame-Setzen, Slider | Seiteneffekte |

**Das Ref-Muster ist bewusst und richtig:** Ein 1,3-Mio.-Zellen-Frame gehört nicht in `useState` — er
würde bei jedem Slider-Schritt einen React-Reconcile über den gesamten Baum auslösen. Die Refs
halten die Daten, die Effects schieben sie in die GL-Layer, React sieht nur Booleans und Zahlen.

**Der Preis:** Die Verfügbarkeit wird aus Refs *abgeleitet* (`precipAvailability()` liest
`nowcastRef.current != null` usw.). Bei 25 Layern wächst das linear. Ein `useSyncExternalStore` über
einen kleinen Layer-Datenspeicher wäre die naheliegende Weiterentwicklung — aber sie berührt
`MapView.tsx` massiv und gehört deshalb hinter die Registry-Arbeit (O-04 Schritt 3/4), nicht davor.

**Permalink-Zustand:** `src/mapState.ts` kodiert Ort + Layer-Bitmaske + Stunde in `#m=`.
Bekannter Defekt: 4 der 16 Layer fehlen in der Bitmaske (s. `docs/LAYER_SYSTEM.md` §2, V-134).

---

## 5. Konfigurationssystem

Es gibt **keine** zentrale Layer-Konfigurationsdatei. Konfiguration ist heute auf fünf Orte verteilt:

| Ort | Was dort konfiguriert wird |
|---|---|
| `MapView.tsx` Modulkopf | Layer-IDs, Farbrampen, Sichtbarkeitsschwellen (`SNOW_VIS_RANGE`), `TEMP_RANGE`, `NOWONLY_AHEAD_H`, Feature-Konstanten |
| `LAYER_OPTIONS` / `LAYER_INFO` / `LayerIcon` | Beschriftung, Beschreibung, Legende, Icon |
| Adapter in `src/sources/*` | Endpunkte, Produktkonstanten (`RR_SCALE`, `RR_FILL`, `BBOX`, `PRECIP_VMAX`), Attribution |
| `precipSource.ts` / `precipComposite.ts` | Horizonte (`RADAR_HORIZON_H`, `RV_MAX_H`, …) und Zielgitter (`G`) |
| `netlify.toml` / `vite.config.ts` | Transportpfade |

**Positiv:** Die Konstanten stehen dicht am Code, der sie braucht, und sind fast durchgängig
kommentiert (das Projekt hat außergewöhnlich gute Modulköpfe). **Negativ:** Ein neuer Layer muss an
fünf Orten konfiguriert werden, und Horizonte sind an zwei Stellen redundant gepflegt
(`RADAR_HORIZON_H` ↔ `RV_MAX_H`/`INCA_MAX_H`/`RZC_MAX_H`, im Kommentar ausdrücklich als
„deckungsgleich" markiert — also eine bewusst in Kauf genommene Doppelpflege).

**Zielbild:** Die `WeatherLayerDescriptor`-Registry (→ `docs/LAYER_SYSTEM.md` §5) sammelt Punkt 1, 2
und die Horizonte aus Punkt 4 an einer Stelle. Adapter (Punkt 3) und Transport (Punkt 5) bleiben, wo
sie sind — das ist die richtige Trennung.

---

## 6. Tile-Handling und Overlay-System

### 6.1 WMS-Kacheln

MapLibre expandiert `{bbox-epsg-3857}` je Kachel. Beispiel aus `dwdSatellite.ts`:

```
https://maps.dwd.de/geoserver/dwd/wms
  ?service=WMS&version=1.1.0&request=GetMap
  &layers=dwd:Satellite_...&styles=
  &bbox={bbox-epsg-3857}&width=512&height=512
  &srs=EPSG:3857&format=image/png&transparent=true
```

Kachelgröße 512 für Satellit/Blitze, 256 in `dwdRadar.ts`. Zeitgesteuerte Layer hängen `TIME=` an —
**exakt auf dem 5-Minuten-UTC-Raster**, sonst antwortet der DWD-GeoServer mit HTTP 200 **und einem
ServiceException-XML im Body** (`snapToDwdFrame()` löst das, `dwdRadar.ts:36-41`).

**Wichtig für die Blitz-Animation:** Ein `TIME`-Wechsel bedeutet eine neue Source-URL, also
**vollständiges Neuladen aller sichtbaren Kacheln**. Für flüssiges Scrubbing über eine 13-monatige
Zeitachse ist das zu teuer. Zwei Auswege: (a) Frames vorab in ein Offscreen-Canvas/Texture-Array
laden und lokal animieren; (b) Animation auf ein enges Fenster (z. B. letzte 60 min = 12 Frames)
begrenzen. Variante (b) ist billiger und fachlich ausreichend. → Entscheidung O-11.

### 6.2 GeoJSON-Overlays

Für Warnungen, Lawinen und Zellumrisse ist das native Muster deutlich günstiger:
MapLibre übernimmt Tiling, Vereinfachung, Hit-Testing und `feature-state`. Klick-Handler existieren
bereits als Muster (`map.on('click', STATIONS_LAYER_ID, …)` + `mouseenter`/`mouseleave` für den
Cursor).

**Datenmengen-Abschätzung:** `dwd:Warnungen_Gemeinden` liefert nur die **aktiven** Warnungen — bei
ruhiger Lage wenige Features, bei Unwetterlage einige Hundert Gemeindepolygone. Das ist für MapLibre
unkritisch. Die statische Geometrie (`dwd:Warngebiete_Gemeinden`, ~11.000 Polygone) wird **nicht**
gebraucht, solange man den WFS-Weg geht — genau deshalb ist er dem CAP-Weg überlegen.

`dwd:Warnungen_Gemeinden_vereinigt` (aufgelöste Flächen) ist kartografisch sauberer und GPU-freundlicher
und sollte der Default sein; die per-Gefahr-Layer (`…_vereinigt_Gewitter` usw.) erlauben eine
Gefahrenfilterung **ohne** Client-Logik.

### 6.3 Overlay-Reihenfolge

Siehe `docs/LAYER_SYSTEM.md` §6 (Z-Band-Modell). Heute imperativ über `moveLayer()`-Ketten an
drei nahezu identischen Stellen gepflegt — die bekannteste Regressionsquelle des Moduls.

---

## 7. Animation

> **Neu geschrieben 2026-08-05** gegen den gemessenen Code-Stand. Die vorherige Fassung listete
> sieben von acht Playback-Bausteinen als fehlend — **das war falsch**. Umsetzungsspezifikation:
> `docs/zuglinien-radar-spec.md` Teil II (L5) und Teil III (L6).

### 7.1 Was heute animiert

| Mechanismus | Wo | Wie |
|---|---|---|
| **Slider-Scrubbing** | Niederschlag, Wolken, alle Scalar-Layer | Frame-Wechsel per Textur-Upload; **kein** Netzverkehr, keine PNG-Dekodierung |
| **Zeitraffer (Play)** | `MapView.tsx:2985-2994` | `setInterval(…, 900 ms)`, Schritt **+1 h**, wrappt auf `dayLo` — Play/Pause und Loop sind also **vorhanden**, Geschwindigkeit und Schrittweite sind fest |
| **Partikel** | `WindLayer` | GPU-Ping-Pong-Advektion, Trail-FBO, kontinuierlicher Repaint |
| **Optical-Flow-Nowcast** | `flownowcast` | Horn-Schunck-Bewegungsfeld + semi-Lagrange-Advektion (`src/ml/opticalFlowNowcast.ts`) |
| **Frame-Interpolation** | `src/fusion/frameInterp.ts` | **verdrahtet, an acht Stellen** (`MapView.tsx:24` Import; `:2280, :2309, :2485, :2507, :2527, :2548, :2569, :2594`) — Temperatur, Fusions-Niederschlag, Böen, Gewitter, Blitzprognose, Rotation, Schnee |
| **Repaint-Steuerung** | `FrameGovernor` | pausiert bei `visibilitychange`/Offscreen (Phase P3) |

⚠️ **Korrektur zur vorherigen Fassung:** Der Satz „`frameInterp.ts` vorhanden, aber nicht im
Slider-Pfad verdrahtet" ist widerlegt. **Was wirklich fehlt:** `lerpFrameImage` arbeitet auf
`HTMLImageElement`/`HTMLCanvasElement` (`frameInterp.ts:31-47`) und ruft `document.createElement`
(`:22`) — es ist **DOM-gebunden** (verletzt D-12, headless nicht prüfbar) und bedient nur den
**PNG-Pfad** der ScalarLayer. Für den `RainLayer`-Uint8-Pfad — also für Niederschlag und Regenradar,
wo die Animation gebraucht wird — **gibt es keine Interpolation.**

### 7.2 Ist-Stand je Playback-Baustein (gemessen, nicht geschätzt)

`docs/high-end-radar-feature-catalogue.md` §2 nennt die Bausteine. Der Stand ist in den beiden
Kartenwelten **verschieden**, und das ist der eigentliche Befund:

| Baustein | 2D-Karte (`MapView.tsx`) | Regenradar (`src/radar/`, `NowcastRadarMap.tsx`) |
|---|---|---|
| Play / Pause | ✅ `:2985-2994`, Button `:3321-3329` | ✅ rAF-Engine `NowcastRadarMap.tsx:269-279`, `fps = 2,5 · speed` |
| Loop | ✅ implizit (`:2990`), **ohne Schalter** | ✅ mit Schalter (`RadarTimeline.tsx:191`) |
| Geschwindigkeit 0,5×/1×/2× | ❌ (900 ms fest) | ✅ `RadarTimeline.tsx:30,184-190` — ⚠️ **nicht gemerkt** (`useState(1)`, kein `localStorage`) |
| Frame-Schritt ±1 | ❌ | ✅ `RadarTimeline.tsx:178,182` |
| „Zurück zu jetzt" | ✅ `:3332-3340` | ✅ `RadarTimeline.tsx:183`, `NowcastRadarMap.tsx:359` |
| Auto-Advance bei neuem Frame | ❌ | ✅ `NowcastRadarMap.tsx:200-230` (Bedingung `wasAtNow`, `:202`) |
| **Harter Bruch gemessen ↔ Vorhersage** | ❌ | ✅ **vorhanden** — `RadarTimeline.tsx:148-175` (`rdr-tl-fill-meas`/`-fc`, Bruchlinie `:164`, „jetzt"-Marke `:170-175`) |
| Konfidenz-Abklingen | ❌ | ✅ `RadarTimeline.tsx:154` (`opacity = max(0,25; 1 − lead/(skillMin·1,5))`) |
| Morphing/Tween | ✅ **nur für Bild-Layer** (s. 7.1) | ❌ |
| `prefers-reduced-motion` | ❌ | ❌ |

**Die Aufgabe von L5 ist damit präziser als „Playback bauen":** Der beste Teil existiert bereits im
Regenradar — er ist nur **nicht wiederverwendbar**, weil die Abspiel-Engine **im Bauteil** liegt
(`NowcastRadarMap.tsx:269-279`) statt in einem reinen Modul. L5 hebt sie nach
`src/map/timelineModel.ts` heraus (headless prüfbar) und portiert die Bruch-Darstellung in das
Command-Deck-Tokensystem. **Das ist eine Konsolidierung, keine Neuentwicklung** — und es ist der
Grund, warum L5 mit 4–7 Tagen auskommt.

### 7.3 Der Renderpfad für Zugvektoren

| Option | Umsetzung | Aufwand | Bewertung |
|---|---|---|---|
| **GeoJSON-Pfeile** ← gewählt | Bewegungsfeld → Vektorgitter → `symbol`-Layer mit `icon-rotate` | S | robust, gut lesbar, MapLibre macht Tiling/Hit-Test; **null WebGL-Risiko** |
| **GPU-Streamlines** | zweiter `WindLayer` mit dem Radar-Bewegungsfeld als Eingang | M | optisch stark; aber **Shader-/WebGL-Zone ⇒ STOPP & FRAGEN** nach `CLAUDE.md` |

**Entschieden: GeoJSON-Pfeile.** Sie beantworten die Nutzerfrage („zieht das auf mich zu?")
vollständig, kosten kein WebGL-Risiko und lassen sich gegen die Golden-Baseline prüfen.
Vollständige Pipeline (Flussgitter 150 × 128, Schwellen, Zoomdichte, Einheiten-Rechnung, Rendering,
Leerzustände): `docs/zuglinien-radar-spec.md` §10.

### 7.4 Tween für den `RainLayer` — was L6 dafür baut

Ein neues reines Modul `src/map/frameBlend.ts` mischt zwei Uint8-Frames konvex
(`out = (1−f)·a + f·b`, 307 200 Operationen je Tween-Frame). Konvexe Mischung erbt dasselbe
Argument wie die bikubische B-Spline-Abtastung (§2.5): alle Gewichte ≥ 0, Summe 1 ⇒ **kein
Überschwingen, kein künstlicher Regen**. Ein zweiter `RainLayer` mit Alpha wäre **nicht**
gleichwertig — Alpha-Compositing ist eine andere Größe als eine gemischte Intensität. Eine
Shader-Lösung wäre am billigsten, ist aber STOPP-&-FRAGEN-Zone.

---

## 8. Caching

Vier Ebenen, alle produktiv:

| Ebene | Technik | Wo | Gültigkeit |
|---|---|---|---|
| **Durable Edge Cache** | Netlify Edge Function, `Netlify-CDN-Cache-Control: durable, max-age=21600, immutable` | `/_dwd_wind`, `/_dwd_grib` | 6 h; Fehler → `no-store` |
| **Warm-Cron** | GitHub Actions, 15-min-Takt, 2 min versetzt | wärmt den Durable Cache, schreibt `public/latest-{grib,wind}.json` | laufend |
| **Cache API (Browser)** | `caches.open('radolan-rv-tar-v1')`, FIFO-Cap 14 Einträge | RV-Tars, URL pro Lauf unveränderlich | bis Verdrängung |
| **In-Memory** | Refs + `_runCache` (TTL 60 s) + `wmsTime`-Cache (TTL 5 min) | MapView / Adapter | Session |

**Bewertung für die Erweiterung:**

- Das RV-Tar-Cache-Muster ist **direkt übertragbar** auf RE (Hagel/Phase): unveränderliche URL pro
  Lauf, kleine Dateien (~25 KB), 25 Frames je Lauf.
- MeteoSchweiz liefert `ETag`/`Last-Modified` und antwortet mit **304** — das ist billiger als jede
  eigene Cache-Schicht. `If-None-Match` sollte genutzt werden.
- GeoSphere **muss** hinter einen Edge-Proxy mit Durable Cache, sonst reißt das 240-req/h-Limit bei
  moderater Last (→ RK-4 in `docs/DATA_SOURCES.md`). Das ist eine **STOPP-&-FRAGEN-Zone**
  (`CLAUDE.md`: Änderungen an Edge Functions/Warm-Crons/Manifest-Mechanik).
- Warn-Layer dürfen **nicht** durable gecacht werden: DWD verlangt, dass Warnungen „vollständig und
  unverzüglich" ankommen; MeteoSchweiz erlaubt Weitergabe nur „unverzüglich und inhaltlich
  unverändert". Kurzes TTL + sichtbares Alter + Deep-Link zur amtlichen Quelle.

**Bekannter Betriebsdefekt, der die Erweiterung direkt betrifft (A10):** Gewärmt werden heute vier
Wolken-Parameter (~28 MB/Lauf) für einen Layer, dessen Toggle auskommentiert ist — während die vier
sichtbaren Feature-Layer (Gewitter, Blitzprognose, Schnee, Rotation) **gar nicht** gewärmt werden.
Neun weitere Layer verschärfen das. **Das Warm-Budget muss vor der Erweiterung neu geschnitten
werden** (V-80), sonst sind die neuesten Layer die langsamsten.

---

## 9. Fehlerbehandlung und Offline-Verhalten

### 9.1 Ist-Zustand

| Mechanismus | Umsetzung |
|---|---|
| Layer-Status | `statuses[key].err` → Fehlertext im Deck; Layer bleibt aus |
| Lauf-Fallback | `fetchRvNowcast` versucht die **zwei** jüngsten Läufe (der jüngste kann noch im Upload sein) |
| Tages-Fallback | `resolveLatestRzcHref` prüft heute, dann gestern |
| Worker-Fallback | `decodeRvTarOffMain` / `buildIndexMapOffMain` fallen transparent auf Main-Thread zurück |
| Format-Fallback | `glUtil.ts` verhandelt half-float → float → RGBA8-Packing |
| Health-Probe | `probeDwdRadar()`, `manifestHealth.ts` |
| Stille Fehler | `wmsTime.ts` und `probeDwdRadar` schlucken Fehler im `catch` und liefern `null`/`false` |
| PWA | handgeschriebener `public/sw.js`: network-first Navigation, cache-first Assets, FIFO-Cap |

**Das Muster ist konsistent und gut:** „Fallback vor Fehlermeldung, Fehlermeldung vor stiller
Leere." Neue Layer müssen es übernehmen.

### 9.2 Lücken, die neun neue Layer verschärfen

1. **Kein Offline-Letztstand für Radar.** Der Feature-Katalog fordert ihn ausdrücklich
   („Show last cached radar with a stale badge when offline"). Der RV-Tar-Cache **enthält** die
   Daten — sie werden nur nicht angeboten, wenn das Netz fehlt.
2. **Keine einheitliche Fehler-Taxonomie.** „Netz weg" / „Quelle 404" / „Format unerwartet" /
   „außerhalb der Abdeckung" / „außerhalb der Saison" sind fachlich verschieden, sehen im UI aber
   gleich aus. **Für Hagel-CH ist das akut:** Zwischen Oktober und März existieren die Dateien und
   sind leer — „keine Daten" darf dort nicht wie „kein Hagel" aussehen (RK-7).
3. **Stille CORS-Fehler.** `wmsTime.ts` und `probeDwdRadar` fangen alles ab. Ein CORS-Bruch
   degradiert lautlos statt zu melden.
4. **Kein Kontrakt-Monitoring.** Verzeichnislayouts, Header-Semantik und Eckkoordinaten sind
   reverse-engineert (`architecture.md` §4: „brechen bei Upstream-Änderung still"). Mit neun
   weiteren Quellen wächst diese Fläche erheblich (→ V-87-Muster, V-142).

---

## 10. Performance-Konzept

### 10.1 Was heute schützt

| Hebel | Wirkung |
|---|---|
| **`FrameGovernor`** (`src/wind/perfGovernor.ts`, 282 LOC, pur, headless verifiziert) | Stufe 1 statisches Geräte-Tier (DPR/Kerne/`deviceMemory`/GPU-Regex), Stufe 2 EMA der Renderdauer mit Hysterese + Cooldown. FPS-Leiter 30→24→20 **zuerst**, Trail-0,5× als **letzter** Hebel, **Partikelzahl nie** (Cross-Device-Optik-Parität) |
| **Worker-Pools** | `radolanWorker`, `precipIndexWorker` (2), `gribGridWorker`, `windFrameWorker`, `bz2Worker` |
| **Index-Map-Vorwärmen** | `primeDe/At/Ch/D2` bauen die Index-Map off-main, **bevor** der React-Tick `build()` auslöst |
| **Lazy Layer** | kein Layer außer Wind lädt am Start; `START_NOW_ONLY` begrenzt initial auf +2 h |
| **Code-Splitting** | `maplibre-gl` als eigener Chunk; alle Feature-Seiten `React.lazy` |
| **Repaint-Pause** | `visibilitychange` / Offscreen |

### 10.2 Was neun neue Layer bedrohen

| Risiko | Größenordnung | Gegenmittel |
|---|---|---|
| **GPU-Speicher** | Je RainLayer-Frame 1,3 MB (DE1200) bzw. 307 KB (Komposit). Bei 6 gleichzeitig aktiven Raster-Layern mit je 25 vorgehaltenen Frames: **~50–200 MB** — auf Mobilgeräten kritisch | Frame-Budget je Layer, globaler LRU, Frames nur für den sichtbaren Zeitbereich halten |
| **Custom-Layer-Anzahl** | Jeder Custom-Layer ist ein eigener Draw-Call mit Programmwechsel und Texturbindungen | Layer-Gruppen mit gegenseitigem Ausschluss; „max. 3 gestapelt" als Default (Feature-Katalog §3) |
| **Netzverkehr beim Zuschalten** | RV 1,4 MB + RE 25×25 KB + POH/MESHS 2×1 MB + INCA-NetCDF + WFS-GeoJSON | Staffelung, Priorisierung, Warm-Budget neu schneiden (V-80) |
| **Index-Map-Aufbau** | 250–370 ms je neue Quelle | Vorwärmen (bereits gelöst) + Cache über Session |
| **WMS-Kachelstürme bei TIME-Scrubbing** | vollständiges Kachel-Neuladen je Frame | Animationsfenster begrenzen; Frames vorab puffern |
| **`MapView.tsx`-Wachstum** | heute 4.173 LOC; +9 Layer ≈ +1.200 LOC in der Sperrzone | **Registry zuerst** (O-04 Schritt 1) |

### 10.3 Budgets (Vorschlag)

| Kennzahl | Ziel | Messung |
|---|---|---|
| Zusätzliche Zeit bis erster Frame je neuem Layer | ≤ 1,5 s warm, ≤ 4 s kalt | Chrome-Trace |
| GPU-Speicher gesamt, alle Layer aktiv, mobil | ≤ 250 MB | `performance.memory` + GPU-Profiler |
| Long Tasks beim Zuschalten | **keine > 200 ms** | eine der fünf Selbstverifikations-Fragen |
| Slider-Scrub bei 3 aktiven Raster-Layern | ≥ 30 FPS auf iPhone 12 Pro | Real-Device |
| Netzverkehr je Layer-Aktivierung | ≤ 2 MB | Netzwerkpanel |

---

## 11. Skalierung und Erweiterbarkeit — Zusammenfassung

Die Renderpipeline ist erweiterungsfähig: Warp-Mesh, LUT-Farbgebung, bikubische Abtastung,
Kompositor und `FrameGovernor` sind alle quellenunabhängig gebaut. Der Datenfluss ist es ebenfalls —
fünf klare Muster, in die sich jeder geplante Layer einordnen lässt.

**Die drei Engpässe sind woanders:**

1. **Die Layer-Registrierung** (neun Verdrahtungsstellen, zwei davon dupliziert) → Registry.
2. **Die Zeitachse** (`max()`-Heuristik trägt keine heterogenen Zeitmodelle) → Zeitmodell.
3. **Das Speicher-/Warm-Budget** (heute schon falsch geschnitten) → Budget vor Umsetzung.

Alle drei sind vor dem ersten neuen Layer zu lösen. Der Rest ist dann tatsächlich nur
„Adapter schreiben" — und für drei der neun Layer sogar nur „vorhandenen Adapter kopieren".
