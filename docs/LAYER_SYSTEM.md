# LAYER_SYSTEM.md — Das Layer-System der 2D-Karte

> **Stand: 2026-08-05.** Ist-Analyse am Code (`src/MapView.tsx`, `src/scalar/*`, `src/wind/*`,
> `src/sources/*`) plus Zielbild für die Erweiterung um neue meteorologische Layer.
> **Status: Analyse und Konzept. Keine Implementierung.**
>
> Zugehörig: `docs/MAP.md` (Renderpipeline, Datenfluss) · `docs/DATA_SOURCES.md` (Quellenbewertung) ·
> `docs/WEATHER.md` (fachliche Layer-Beschreibungen) · `docs/2d-layer-erweiterung.md` (Umsetzungsplan) ·
> `architecture.md` §3 (Kurzfassung).

---

## 1. Überblick: zwei Layer-Mechanismen, ein Sichtbarkeitsmodell

buscosun kennt genau zwei Wege, einen Wetterlayer auf die Karte zu bringen:

**(A) Custom-WebGL1-Layer** — Klassen, die MapLibres `CustomLayerInterface` implementieren und im
`render(gl, matrix)`-Callback selbst zeichnen. Sie besitzen ihre Texturen, ihre Shader und ihre
Geometrie. Vier Klassen decken heute alles ab:

| Klasse | Datei | Geometrie | Was sie kann | Wer sie nutzt |
|---|---|---|---|---|
| `ScalarLayer` | `src/scalar/ScalarLayer.ts` | 128×64-Mesh, achsparallele `uvBounds` | Skalarfeld + Farbrampen-LUT, **per-Pixel-DEM-Lapse-Refinement** | temp, gust, thunder, lightningfc, snow, rotation, precip-forecast |
| `RainLayer` | `src/scalar/RainLayer.ts` | 4-Eck-Quad **oder** feines Warp-Mesh | 1-kanalige Werte-Textur (LUMINANCE) + Rampe, **bikubische B-Spline-Abtastung** | nowcast, flownowcast, poprob, clouds |
| `CloudLayer` | `src/scalar/CloudLayer.ts` | Quad | geschichtete Bewölkung | clouds (Fusionspfad) |
| `ConfidenceLayer` | `src/scalar/ConfidenceLayer.ts` | Quad | Kreuzschraffur ∝ Unsicherheit | confidence |
| `WindLayer` | `src/wind/WindLayer.ts` | GPU-Partikelsystem | Ping-Pong-Advektion, Trail-FBO, Heatmap | wind |

**(B) Native MapLibre-Layer** — normale Style-Layer über `map.addLayer({...})`:

| Typ | Layer-IDs | Source-Typ |
|---|---|---|
| `raster` | `satellite-layer`, `lightning-layer` | WMS-`tiles`-Template mit `{bbox-epsg-3857}` |
| `circle` | `dach-stations-layer` | `geojson` |
| `line` | `snowline-casing`, `snowline-line` | `geojson` |
| `fill` | `country-mask-fill`, `basemap-dim` | `geojson` |

**Das Sichtbarkeitsmodell ist für beide identisch:** ein `Record<layerId, boolean>` wird über
`map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')` angewandt, gefolgt von einer
festen `moveLayer()`-Sequenz, die die Z-Ordnung wiederherstellt.

---

## 2. Der `LayerKey`-Vertrag

`src/MapView.tsx:300` definiert die 16 heute existierenden Schlüssel:

```ts
export type LayerKey =
  | 'wind' | 'gust' | 'nowcast' | 'temp' | 'clouds' | 'sat'
  | 'lightning' | 'lightningfc' | 'stations' | 'confidence'
  | 'snowline' | 'flownowcast' | 'poprob' | 'thunder' | 'snow' | 'rotation';
```

**Geplante Erweiterung (L6):** zwei neue Keys — **`rainradar`** (Regenradar mit Rückblick) und
**`motion`** (Niederschlagszuglinien). Ihre Permalink-Bits sind ab L5 **eingefroren** (§2, Befund 1):

```
 0 wind        1 nowcast     2 temp        3 clouds      4 sat        5 lightning
 6 stations    7 confidence  8 snowline    9 flownowcast 10 poprob    11 gust
12 thunder    13 lightningfc 14 snow       15 rotation   16 rainradar 17 motion
```
Bits 0–11 sind der heutige Bestand **unverändert** (`mapState.ts:24`) — alle bestehenden Permalinks
bleiben gültig. 12–15 schließen die vier vergessenen Layer (V-134), 16–17 sind neu.

Ein `LayerKey` ist heute an **acht** Stellen verdrahtet. Das ist der eigentliche Integrationsaufwand
eines neuen Layers — nicht der Datenpfad.

| # | Ort | Was dort steht | Pflicht? |
|---|---|---|---|
| 1 | `MapView.tsx:300` `LayerKey` | der Schlüssel selbst | ✅ |
| 2 | `MapView.tsx:331` `LAYER_OPTIONS` | Kurzlabel + `title` (Tooltip, meist mit Ehrlichkeits-Sätzen) | ✅ |
| 3 | `MapView.tsx:438` `statuses`-Initialwert | `{}` je Key — sonst `undefined`-Zugriff | ✅ |
| 4 | `MapView.tsx:~1053` `addLayers()` | Instanz erzeugen + `map.addLayer(layer, beforeId)` | ✅ |
| 5 | **`MapView.tsx:1103-1149` und `:2813-2859`** | Sichtbarkeits-Record + `moveLayer`-Schwanz — **47 Zeilen byte-identisch dupliziert** (Zeilenvergleich 2026-08-05; frühere Angabe `:1108-1136`/`:2818-2846` war ein älterer Dateistand) | ✅ (2×!) |
| 6 | `MapView.tsx:1140-1148` + `:2850-2858` | `moveLayer()`-Sequenz für die Z-Ordnung (Teil des Blocks unter #5) | ✅ (2×!) |
| 7 | `components/LayerInfoPanel.tsx:49` `LAYER_INFO` | Eyebrow, Titel, Akzentfarbe, Beschreibung, Quelle, Legende, ggf. `trust` | ✅ |
| 8 | `components/LayerIcon.tsx` | SVG-Icon für Dock und Readout | ✅ |
| 9 | `mapState.ts:24` `LAYER_ORDER` | Bitmaske für den `#m=`-Permalink | ⚠️ **heute 4× vergessen** |

### Befund 1 — die Permalink-Lücke ist real und wächst

`LAYER_ORDER` listet **12 von 16** Keys. **`thunder`, `lightningfc`, `snow` und `rotation` sind nicht
permalink-fähig** — ein geteilter Link verliert sie stillschweigend. Der Grund ist strukturell: die
Liste ist bit-stabil sortiert („`confidence` ans ENDE angehängt → bestehende Permalinks bleiben
gültig"), und wer einen Layer anlegt, denkt an das Dock, nicht an die Bitmaske.

Bei 16 Layern ist die Bitmaske außerdem am Limit dessen, was in einer JSON-Zahl komfortabel bleibt;
mit 9 weiteren Layern (25 Bits) ist sie es weiterhin technisch, aber die Fehleranfälligkeit steigt.
**Konsequenz für die Erweiterung: die Registrierung muss so gebaut sein, dass „vergessen" nicht
möglich ist** (→ §5, → `improvements.md` V-134).

### Befund 2 — die Duplikation ist der eigentliche Skalierungsdeckel

Der Sichtbarkeits-Record steht **zweimal** identisch im Code (2026-08-05 per Zeilenvergleich
bestätigt: `:1103-1149` ≡ `:2813-2859`, 47 Zeilen), `map.moveLayer(STATIONS_LAYER_ID)` steht **5×**,
`moveLayer` insgesamt **17×**. Die Kommentare an diesen Stellen dokumentieren einen realen
Nutzer-Bug („Regen über Belgien/Slowenien"), der aus einer falschen Hebung entstand.

Mit 16 Layern ist das unangenehm. Mit 25 Layern ist es die wahrscheinlichste Regressionsquelle des
Projekts. **Deshalb ist die deklarative Layer-Registry (V-38 / O-04 Schritt 1) keine Aufräumarbeit,
sondern die Vorbedingung der Erweiterung.**

### Befund 3 — zwei implizite Rendering-Kontrakte, die nicht brechen dürfen

1. **Scalar-/Rain-Shader lassen `DEPTH_TEST` an und setzen `depthMask(false)`.** Nur so respektieren
   sie die später gezeichnete Länder-Maske und laufen nicht über die Landesgrenze hinaus
   (`RainLayer.ts:265-272` dokumentiert das ausdrücklich als Reaktion auf einen User-Report). Ein
   `disable(DEPTH_TEST)` unterbindet den Depth-Write komplett — der Layer würde dann durchscheinen.
2. **Wind liegt bewusst *über* Grenzen und Labels** (`addLayer(wind)` **ohne** `beforeId`,
   `MapView.tsx:1073`); **Stationen müssen *über* der Länder-Maske bleiben** (deshalb die
   `moveLayer`-Sequenz am Ende).

Jeder neue Layer muss sich an einer definierten Stelle in diese Ordnung einfügen — und die
Einfügeposition ist eine fachliche, keine technische Entscheidung (§6).

---

## 3. Datenpfad-Muster: wie ein Layer heute an seine Daten kommt

Fünf Muster sind im Code identifizierbar. Jeder neue Layer wird einem davon zugeordnet — das ist der
schnellste Weg zu einer belastbaren Aufwandsschätzung.

### Muster P1 — WMS-Rasterkachel (leichtestes Muster)

```
satelliteTileTemplate() ──► map.addSource({type:'raster', tiles:[tpl], tileSize:512})
                       └──► map.addLayer({type:'raster', source})
fetchWmsLatestTime(layerLocalName) ──► echtes Aufnahmedatum für den Status-Chip
```
Beispiele: `sat`, `lightning`. **Kosten:** ~40 Zeilen Adapter + Verdrahtung. Kein Decoder, kein
Worker, kein Proxy (sofern CORS stimmt). **Frame-Wechsel** über den `TIME`-Parameter ⇒ neue
Source-URL ⇒ MapLibre lädt Kacheln nach.

### Muster P2 — Binärprodukt über Proxy + Worker (schwerstes Muster)

```
listRuns() ─► fetchBytesCached() ─► Cache API ─► decompress() (bz2/gz-Worker)
          └─► decodeXxxOffMain() (Worker, Fallback Main-Thread)
          └─► Uint8-Werte-Grid + Ecken/Warp-Mesh ─► RainLayer.setFrame()
```
Beispiel: `nowcast` via `radolan.ts`. **Kosten:** Decoder + Worker + Cache-Strategie + Proxy-Eintrag.
Aber: **für RE (Hagel/Phase) ist der Decoder bereits da** — nur ein zweites Gitter (900×900) und
gzip statt bz2.

### Muster P3 — HDF5/NetCDF direkt (mittleres Muster)

```
STAC-Item / Grid-API ─► fetch (CORS ok) ─► jsfive H5File ─► Werte + /where-Ecken
                                        └─► precipToU8() ─► RainLayer.setFrame()
```
Beispiele: `meteoSwissRadar.ts`, `geosphereIncaGrid.ts`. **Kosten:** ~100–150 Zeilen. Kein Proxy,
kein eigener Decoder. **Das Muster, in das POH/MESHS eins zu eins passen.**

### Muster P4 — GRIB2 über Edge Function (Modell-Layer)

```
gribManifest (latest-grib.json, Warm-Cron) ─► /_dwd_grib/... (Edge Function, durable cache)
  ─► decompress ─► gribDecode (DRT 0/1/42) ─► regrid ─► ScalarLayer.setData()
```
Beispiele: `temp`, `gust`, `thunder`, `snow`, `rotation`. **Nur für Modelldaten relevant** —
für die neuen Mess-Layer kein Kandidat.

### Muster P5 — GeoJSON-Vektorlayer (bisher nur intern genutzt)

```
fetch(url) ─► GeoJSON ─► map.addSource({type:'geojson'}) ─► fill/line/circle-Layer
```
Heute nur für `stations`, `snowline`, `country-mask`. **Für Warnungen, Lawinen und Zellpolygone ist
das das richtige Muster** — und es ist das billigste von allen, weil MapLibre alles übernimmt:
Tiling, Simplification, Hit-Testing, Feature-State.

### Zuordnung der geplanten Layer

| Neuer Layer | Muster | Begründung |
|---|---|---|
| **Regenradar `rainradar`** (L6) | **P2/P3 vorhanden** | speist sich aus dem bestehenden `PrecipCompositor` — **kein neuer Datenpfad**; neu sind nur Rückblick-Frames und Playback |
| **Niederschlagszuglinien `motion`** (L6) | **P2 vorhanden + Rechnung → P5** | RV-Frames sind schon geladen; die Bewegung wird aus **gemessenen** Analysen mit `estimateFlowHS` gerechnet (RV enthält kein Bewegungsfeld, `docs/DATA_SOURCES.md` §4.1 B1) und als **GeoJSON-`symbol`-Layer** gerendert |
| **Zellbahnen `cells`** ✅ (Phase Z1, 2026-08-05) | **P5-artig** | KONRAD3D-XML → **eine** GeoJSON-Quelle + **fünf** per `['==', ['get','kind'], …]` gefilterte Layer: `fill` (Trichter), `fill`+`line` (Umriss), gestrichelte `line` (Spur), `circle` (Klickziel). **Kein `symbol`/`text-field`** — der Basemap-Stil garantiert keine Glyphen; Details per Popup. **DOM-freier** Pull-Parser (D-12), Proxy Pflicht. Z-Band: über den Rastern, **unter** den Stationen |
| **Warnungen `warnings`** ✅ (Phase W1, 2026-08-06) | **P5-artig** | CAP-1.2 aus einem **ZIP** → **eine** GeoJSON-Quelle + zwei Layer (`fill` + `line`). Besonderheiten: **Farbe kommt aus den Daten** (`['get','color']` statt Rampe — die Meldung führt ihre amtliche `AREA_COLOR` mit), **`fill-sort-key`** nach Warnstufe, und die Zeitachse steckt **in den Features** (`onset`/`expires`), nicht im Layer — der Slider filtert die Quelle neu, ohne neu zu laden (zwei getrennte Effekte). ZIP-Leser + Parser DOM-frei (D-12), Proxy Pflicht, **kein** Durable-Cache (Lizenzauflage). Z-Band: über den Rastern, **unter** Zellbahnen/Hagel/Stationen |
| Hagel DE (RE Bit 13) | **P2 (Variante)** | `decodeRadolanRaw` wiederverwenden, 900×900-Gitter neu |
| Hagel CH (POH/MESHS) | **P3** | wortgleiches Muster wie `meteoSwissRadar.ts` |
| Gewitterzellen (NCEW_EU) | **P1** | WMS-Raster |
| Gewitterzellen (KONRAD3D) | **P5-artig** | XML→GeoJSON-Konvertierung, dann Vektorlayer |
| Blitz DE (`Blitzdichte`) | **P1 + TIME** | `wmsTime.ts` liefert die Zeitachse |
| Blitz DACH (MTG-LI) | **P1 + TIME** | dito |
| Schneefall DE (RE-Phase) | **P2 (Variante)** | derselbe Request wie Hagel DE |
| Schnee AT (SNOWGRID) | **P3** | NetCDF-4 via `jsfive`, aber **EPSG:3416** |
| Warnungen DE (WFS) | **P5** | GeoJSON-Polygone direkt |
| Warnungen AT (GeoSphere) | **P5 + Reprojektion** | EPSG:31287 → 4326 vor dem Einhängen |
| Lawinen (SLF/EAWS) | **P5** | GeoJSON mit fertigen Füllfarben |
| Europa-Radar (OPERA) | **P2 (neu)** | HDF5 + LAEA-Reprojektion + Proxy — der teuerste Kandidat |

---

## 4. Sichtbarkeit, Zeit und Verfügbarkeit

### 4.1 Der Sichtbarkeits-Ausdruck

Ein Layer ist heute sichtbar, wenn drei Bedingungen zusammenkommen:

```ts
[NOWCAST_LAYER_ID]: active.has('nowcast')                    // Nutzer hat ihn eingeschaltet
                 && precipFrameReady(forecastHour)           // für DIESE Stunde liegen Daten vor
                 && modelSourceRef.current.radar,            // die Modellwahl erlaubt Radar
```

Das mittlere Glied ist der interessante Teil: **Verfügbarkeit ist zeitabhängig**, und die Logik
dafür ist bewusst in ein reines, headless testbares Modul gehoben — `src/nowcast/precipSource.ts`
mit `RADAR_HORIZON_H = { DE: 2, AT: 3, CH: 0.5 }`, `resolvePrecipSource`, `precipCompositeReady` und
`precipRadarHorizonHours`. Verifiziert über `npm run verify:precip-source`.

**Das ist das Vorbild für jeden neuen Layer mit Zeitachse.** Es erfüllt D-12 (Purity-Grenze), es ist
prüfbar, und es hält die Horizont-Logik aus dem 4.000-LOC-God-Object heraus.

### 4.2 Der Zeit-Slider

`sliderMax = max(Basis, Wolken-Horizont falls aktiv, precipRadarHorizonHours falls Niederschlag aktiv)`
(`MapView.tsx:2941-2953`). Eine untere Grenze existiert nicht — `dayLo` ist außer im Embed-Fall
konstant 0 (`:2980`).

Der Slider passt sich also dem **aktiven Layer mit dem weitesten Horizont** an. Bei neun neuen Layern
mit sehr verschiedenen Zeitachsen (Blitz: −13 Monate … jetzt · Radar: −60 min … +2 h · Hagel CH:
−14 Tage … jetzt · Warnungen: jetzt … +Gültigkeitsende · SNOWGRID: gestern) ist eine
`max()`-Heuristik nicht mehr tragfähig.

**Das ist die zentrale Architekturfrage der Erweiterung** (→ `docs/2d-layer-erweiterung.md` §5,
→ `decisions.md` O-11). **Sie ist seit 2026-08-05 spezifiziert:**
`docs/zuglinien-radar-spec.md` §3 (`src/map/layerTime.ts`, vier Modi, `sliderRange`,
`resolveLayerTime`).

**Die Zeitmodus-Spalte je Layer** (verbindliche Zuordnung, Vollfassung mit `stepMinutes`,
`pastWindowH` und `drivesSliderMax` in `docs/zuglinien-radar-spec.md` §3.2):

| Modus | Layer |
|---|---|
| `forecast` | `wind` · `gust` · `temp` · `clouds` · `nowcast` · `lightningfc` · `confidence` · `snowline` · `flownowcast` · `poprob` · `thunder` · `snow` · `rotation` · **`rainradar`** · **`motion`** |
| `instant` | `sat` · `stations` · *(L9)* `snowgrid` |
| `window` | `lightning` · *(L7)* `lightningdensity` · *(L8)* `hail` (CH) |
| `valid-interval` | *(L3/L4)* `warnde` · `warnat` · *(L12)* `avalanche` |

Zwei Festlegungen daraus, die den Vertrag verschärfen:

- **Die Frame-Wahl geht über die absolute Gültigkeitszeit**, nie über den Lead-Index. Der
  Index-Weg erzeugt für Österreich einen Zeitversatz von bis zu ~45 min, weil INCA-Leads ab der
  **Laufzeit** zählen (`docs/zuglinien-radar-spec.md` §2.3, → V-144).
- **`precipSource.ts` bleibt unverändert** und wird von `layerTime.ts` **aufgerufen**, nicht
  ersetzt (§3.6 dort; O-16 für eine spätere Zusammenführung).

### 4.3 Status und Datenalter

`statuses: Record<LayerKey, { ok?: { model, fetchedAt, ref? }, err? }>` — mit dem wichtigen
Unterschied zwischen `fetchedAt` (Abrufzeit) und `ref` (**echte** Referenzzeit: Modelllauf bzw.
Messzeit). Fehlt `ref`, beschriftet die Anzeige die Abrufzeit **als solche**, statt sie als Datenstand
auszugeben (D-04, V-19). `src/dataAge.ts` kapselt die Bewertung.

**Regel für neue Layer:** Jeder Layer, der eine Referenzzeit hat, muss sie liefern. Für WMS-T-Layer
liefert `fetchWmsLatestTime()` sie; für ODIM-HDF5 steht sie in `/what` (`date`/`time`); für RADOLAN im
Header. **Es gibt keinen neuen Layer ohne `ref`, außer die Quelle weist wirklich keine aus.**

---

## 5. Zielbild: die deklarative Layer-Registry

Der Kern des Integrationskonzepts ist, die **acht bis neun Verdrahtungsstellen auf eine** zu
reduzieren. Das ist zugleich Schritt 1 des in `decisions.md` O-04 empfohlenen Zerlegungsplans
(V-38) — die Erweiterung finanziert damit eine ohnehin geplante Strukturverbesserung.

### 5.1 Das Deskriptor-Objekt (Skizze, nicht Implementierung)

```ts
// src/map/layerRegistry.ts — rein, DOM-frei, headless testbar (D-12)
export interface WeatherLayerDescriptor {
  key: LayerKey;                       // Schlüssel — einzige Quelle der Wahrheit
  bit: number;                         // Permalink-Bit, EINMAL vergeben, nie neu belegt
  group: LayerGroup;                   // 'niederschlag' | 'gewitter' | 'wind' | 'warnung' | ...
  label: string;                       // Dock-Kurzlabel
  title: string;                       // Tooltip inkl. Ehrlichkeitssatz
  info: LayerInfo;                     // Eyebrow/Titel/Beschreibung/Legende/Quelle/trust
  icon: LayerIconId;

  kind: 'scalar' | 'rain' | 'raster' | 'geojson' | 'custom';
  zBand: ZBand;                        // deklarative Z-Ordnung statt moveLayer-Kette
  defaultOpacity: number;

  // Zeit- und Verfügbarkeitsmodell
  time: {
    mode: 'instant' | 'window' | 'forecast' | 'valid-interval';
    horizonHours: (avail: Availability) => { past: number; future: number };
    stepMinutes: number;
  };

  // Länderabdeckung — Grundlage der Ehrlichkeits-Hinweise (D-04)
  coverage: Partial<Record<Country, 'full' | 'partial' | 'none'>>;
  coverageNote?: Partial<Record<Country, string>>;

  // Datenpfad
  loader: LayerLoaderId;               // Verweis, KEIN Import → kein Eager-Bundle
  lazy: true;                          // ausnahmslos: kein neuer Layer lädt eager
}
```

### 5.2 Was die Registry erzwingt

| Problem heute | Wie die Registry es löst |
|---|---|
| `LAYER_ORDER` wird vergessen | `bit` ist Pflichtfeld; ein Verifier prüft Eindeutigkeit + Lückenlosigkeit und **schlägt fehl**, wenn ein Key kein Bit hat |
| Sichtbarkeits-Block 2× dupliziert | **Ein** Applier iteriert die Registry; keine handgepflegte Liste mehr |
| `moveLayer`-Kette 17× | `zBand` deklariert die Ordnung; der Applier sortiert **einmal** |
| `LAYER_INFO` und `LAYER_OPTIONS` driften auseinander | beide Felder liegen im selben Deskriptor |
| Länder-Asymmetrie steht in Prosa | `coverage`/`coverageNote` sind Daten ⇒ maschinell prüfbar (V-17-Regel wird durchsetzbar) |
| Layer laden eager | `lazy: true` als Pflichtfeld; `loader` ist eine ID, kein Import |

### 5.3 Migrationsstrategie — Funktionserhalt zuerst

Nach `CLAUDE.md` („Oberste Direktive: Funktionserhalt") und D-11 (Flag-Gating) gilt:

1. **Schritt 0 — Golden-Baseline.** Screenshot-Referenz aller 16 Layer (Desktop 1440×900, iPhone 12
   Pro 390×844) + Verifier, der die aktuelle Sichtbarkeits-/Z-Matrix für alle 2^16 relevanten
   Kombinationen als Erwartung festschreibt. **Bevor sich Code bewegt.**
2. **Schritt 1 — Registry parallel aufbauen.** Die 16 bestehenden Layer werden als Deskriptoren
   beschrieben; ein Verifier vergleicht das Ergebnis der Registry mit der handgepflegten Liste
   **byte-genau**. Kein Verhalten ändert sich.
3. **Schritt 2 — Applier einführen.** Erst wenn Schritt 1 grün ist, ersetzt der eine Applier die
   beiden duplizierten Blöcke. Gate: Pixel-Diff gegen die Golden-Baseline.
4. **Schritt 3 — neue Layer.** Ab hier ist ein Layer ein Deskriptor + ein Loader-Modul.

**Erst nach Schritt 2 ist ein neuer Layer billig.** Vorher kostet jeder neue Layer die volle
Neunfach-Verdrahtung — bei neun Layern also 81 Änderungsstellen in der Sperrzone `MapView.tsx`.

---

## 6. Z-Ordnung — das `zBand`-Modell

Die Z-Ordnung ist heute imperativ und an drei Stellen fast identisch dupliziert. Das Zielbild ist
eine deklarative Bandeinteilung; die konkreten Bänder ergeben sich aus den bestehenden Kontrakten:

| Band | Inhalt | Warum dort |
|---|---|---|
| 0 `basemap` | Kartenstil, `basemap-dim` | Grundlage |
| 1 `satellite` | Satellitenbild | großflächig, muss unter allem Wetter liegen |
| 2 `field` | Skalarfelder: temp, gust, thunder, lightningfc, snow, rotation | flächige Modellgrößen |
| 3 `precip` | Niederschlag: nowcast, flownowcast, poprob, **`rainradar`**, **Hagel**, **Schneefall** | Messgrößen über Modellflächen |
| 4 `mask` | Länder-Maske | clippt Bänder 2–3 auf DACH (Depth-Kontrakt!) |
| 5 `veil` | confidence | Unsicherheits-Schraffur über den Daten |
| 6 `vector` | snowline, **Warnpolygone**, **Zellumrisse**, **Lawinenregionen**, **Zugvektoren `motion`** | Linien/Polygone über Flächen |
| 7 `points` | stations, **Blitzpunkte** (falls Punkt-Variante) | Symbole ganz oben |
| 8 `particles` | wind | **bewusst über Grenzen und Labels** (bestehender Kontrakt) |

**Die neuen Layer fügen sich ausschließlich in bestehende Bänder ein** — es entsteht kein neues Band.
Das ist ein starkes Signal dafür, dass die Erweiterung architekturkonform ist.

**Drei Fallen, die im Band-Modell explizit werden:**
- **Warnpolygone gehören in Band 6, nicht 3.** Eine Warnfläche unter dem Niederschlag ist unlesbar.
- **Hagel, `nowcast` und `rainradar` konkurrieren in Band 3.** Gleichzeitig sichtbar ergibt
  Farbmatsch — und `nowcast` + `rainradar` zeigen bei h ≥ 0 sogar **dieselben Pixel**. Die
  Layer-Gruppen (§7) regeln das über einen **weichen** gegenseitigen Ausschluss (O-12: der zuletzt
  aktivierte gewinnt, mit sichtbarem Hinweis — kein hartes Sperren, das als Wegnahme gelesen würde).
- **Die Zugvektoren gehören in Band 6, nicht 7 oder 8.** Über dem Raster (sonst unsichtbar), aber
  **unter** Stationen und Wind — sonst konkurrieren zwei Pfeilfelder um dieselbe Lesart. Konkret:
  `addLayer(..., beforeId = STATIONS_LAYER_ID)` und in der `moveLayer`-Sequenz **vor**
  `STATIONS_LAYER_ID` einsortiert.

---

## 7. Layer-Gruppen und Presets

Mit 25 Layern ist eine flache Liste im Dock nicht mehr bedienbar.
`docs/high-end-radar-feature-catalogue.md` §3 formuliert die Regel bereits:
*„never show more than ~3 layers stacked by default. Provide a clean layer panel with sane presets."*

**Vorschlag für die Gruppierung** (Entscheidung liegt bei Jan, → O-12):

| Gruppe | Layer |
|---|---|
| **Niederschlag** | Regenradar · Niederschlag jetzt–2 h · Zuglinien · Flow-Nowcast · Regen-Chance · Schneefall · Schneegrenze |
| **Gewitter** | Gewitterpotenzial · Gewitterzellen · Blitze · Blitzprognose · Hagel · Rotation |
| **Wind** | Wind · Böen |
| **Temperatur & Wolken** | Temperatur · Wolken · Satellit |
| **Warnungen** | Wetterwarnungen · Unwetterwarnungen · Lawinen · Waldbrand |
| **Mess & Meta** | Stationen · Sicherheit |

**Presets** (aus dem Feature-Katalog übernommen, um vier ergänzt):
`Standard` · `Gewitter-Jagd` · `Winter` · `Wandern` · `Unwetterlage` · `Landwirtschaft`.

Ein Preset ist technisch nur eine `LayerKey[]` — es passt ohne Erweiterung in die vorhandene
`initialActive`-Prop und in die Permalink-Bitmaske.

---

## 8. Konventionen für neue Layer (verbindlich)

Abgeleitet aus `CLAUDE.md`, `decisions.md` und dem beobachteten Code-Stil.

1. **Lazy ausnahmslos.** Kein neuer Layer lädt eager. Muster: eigener `useEffect`, der beim ersten
   Aktivieren lädt (`MapView.tsx:1940-1962` zeigt es fünfmal).
2. **Reine Entscheidungslogik nach draußen** (D-12). Horizonte, Quellenwahl, Verfügbarkeit gehören
   in ein DOM-freies Modul nach dem Vorbild `precipSource.ts` — mit `verify*()`-Export und
   npm-Skript. **Ohne npm-Skript zählt der Selbsttest nicht** (V-95: 76 `verify()`-Exporte, nur 8
   verdrahtet).
3. **Referenzzeit ist Pflicht** (D-04/V-19). `ref` liefern, sonst Abrufzeit **als Abrufzeit**
   beschriften.
4. **Länderabdeckung deklarieren.** Wo eine Quelle fehlt, sagt der Layer das — im Deskriptor, damit
   es prüfbar ist, und in der Legende, damit es sichtbar ist.
5. **Konservative Sprache bei Experten-Layern** (D-19). „Verdacht", „Potenzial", „Hinweis" — nie
   „Warnung", nie „Tornado", nie eine Formulierung, die amtliche Warnprodukte imitiert.
6. **Attribution korrekt.** Für abgeleitete/eingefärbte DWD-Daten ist die richtige Form
   `Datenbasis: Deutscher Wetterdienst, Rasterdaten bildlich wiedergegeben` — nicht
   `Quelle: DWD`. Die heutigen Strings sind formal unpräzise (→ V-140).
7. **Neue Rechenpfade default-off hinter Flag** (D-11 „Rule 2") mit benanntem Fallback.
8. **Kein Layer ohne belegte Produktdefinition.** `composite/hg/` existiert, aber seine Semantik ist
   in keiner zugänglichen DWD-Doku definiert — daraus wird kein Hagel-Layer. Das ist derselbe
   Fehlertyp wie V-18 („78 %"), nur sicherheitsrelevant.
9. **Command-Deck-Designsprache** (D-27). Neue UI ausschließlich im Deck-System.
10. **Ein Thema = eine Phase = ein Gate** (`CLAUDE.md`). Neun Layer sind neun Phasen, nicht eine.

---

## 9. Was die Erweiterung an der Architektur **nicht** ändert

Bewusst festgehalten, weil Funktionserhalt oberste Direktive ist:

- Der `nowcast`-Layer und `precipSource.ts` bleiben unverändert. **D-14 (radar-only jetzt–2 h) wird
  nicht revidiert** — der neue Regenradar-Layer ist eine *zusätzliche* Ansicht, keine Rückkehr zur
  12-h-Modellverlängerung.
- Die WebGL1-Basis, das Texturformat-Verhandlungsschema und der RGBA8-Packing-Pfad bleiben
  unangetastet (D-08, `CLAUDE.md`-Sperrzone).
- Der `FrameGovernor` bleibt der **einzige** Performance-Hebel (D-09). Neue Layer bekommen keine
  Sonderpfade.
- Die Fusion-Engine wird nicht berührt (STOPP-&-FRAGEN-Zone).
- Alle 16 bestehenden Layer behalten Verhalten, Beschriftung und Z-Position.

---

## 10. Zusammenfassung

Das Layer-System ist fachlich sehr gut gebaut — zwei klar getrennte Mechanismen, saubere
Purity-Grenzen bei der Entscheidungslogik, ein durchdachtes Ehrlichkeitsmodell für Datenalter und
Abdeckung. **Sein einziger struktureller Mangel ist, dass die Registrierung eines Layers auf neun
Stellen verteilt und an zwei davon dupliziert ist.**

Bei 16 Layern ist das eine Unbequemlichkeit. Bei 25 Layern ist es der begrenzende Faktor. Die
Erweiterung ist deshalb **zuerst eine Registry-Arbeit und erst danach eine Quellenarbeit** — und
genau in dieser Reihenfolge ist sie risikoarm, weil Schritt 1 unter Golden-Baseline verhaltensneutral
ist und jeder folgende Layer dann eine Datei statt neun Änderungsstellen kostet.
