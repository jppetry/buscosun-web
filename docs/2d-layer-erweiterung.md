# 2d-layer-erweiterung.md — Integrationskonzept und Umsetzungsplan

> **Stand: 2026-08-05.** Technische Entscheidungsgrundlage für die Erweiterung der 2D-Karte um
> neue meteorologische Layer (Regenradar, Niederschlagszuglinien, Hagel, Gewitter, Blitzaktivität,
> Schneefall, Wetter- und Unwetterwarnungen sowie weitere DACH-Layer).
>
> **Status: Analyse, Konzept und Plan. Keine Implementierung, kein Produktivcode geändert.**
> Entscheidungen liegen bei Jan — Vorlagen in `decisions.md` §O-09…O-14.
>
> Grundlagen: `docs/DATA_SOURCES.md` (Quellenbewertung) · `docs/LAYER_SYSTEM.md` (Layer-Vertrag) ·
> `docs/MAP.md` (Renderpipeline) · `docs/WEATHER.md` (Fachbeschreibungen) · `docs/API.md`
> (Endpunkt-Kontrakte) · `architecture.md` · `decisions.md` · `CLAUDE.md`.

---

## 0. Die Kernaussage in fünf Sätzen

1. **Neun neue Layer sind machbar, und sechs davon sind billig**, weil buscosun die teuren
   Bausteine (RADOLAN-Decoder, `jsfive`, WMS-TIME-Abruf, DACH-Kompositor, Warp-Mesh, `FrameGovernor`)
   bereits produktiv betreibt.
2. **Der eigentliche Aufwand liegt nicht bei den Quellen, sondern an drei Strukturstellen:**
   der neunfachen Layer-Verdrahtung in `MapView.tsx`, der `max()`-basierten Zeitachse und dem
   Speicher-/Warm-Budget.
3. **Diese drei müssen vor dem ersten neuen Layer gelöst sein** — sonst kostet jeder Layer
   neun Änderungsstellen in der größten Sperrzone des Repos, und die neuesten Layer werden die
   langsamsten (der Defekt A10 zeigt das bereits heute).
4. **Zwei Layer sind reine Ehrlichkeitsgewinne mit sehr kleinem Aufwand** — Wetterwarnungen DE
   (WFS-GeoJSON) und AT (GeoSphere, Blocker V-133 ist gelöst) schließen die im Projekt seit Monaten
   dokumentierte Länder-Asymmetrie.
5. **Ein Layer ist ein echtes Alleinstellungsmerkmal:** amtliche Hagelkorngröße (MeteoSchweiz MESHS,
   5 min, CC BY 4.0) zeigt im DACH-Consumer-Markt praktisch niemand.

---

# TEIL A — INTEGRATIONSKONZEPT

## 1. Layer-Architektur

### 1.1 Grundentscheidung: Registry statt Verdrahtung

Ein `LayerKey` ist heute an neun Stellen verdrahtet, zwei davon 48 Zeilen byte-identisch dupliziert
(Belege: `docs/LAYER_SYSTEM.md` §2). Neun neue Layer bedeuten in der Bestandsstruktur **81
Änderungsstellen** in `MapView.tsx` — der Datei, die `agents.md` §3 als Sperrzone führt und
`decisions.md` O-04 als „größtes Einzelrisiko des Repos" beschreibt.

**Konzept:** Ein Layer wird zu **einem Deskriptor plus einem Loader-Modul**. Ein einziger Applier
liest die Registry und stellt Existenz, Sichtbarkeit und Z-Ordnung her.

```
src/map/layerRegistry.ts        ← rein, DOM-frei, headless verifizierbar (D-12)
   WeatherLayerDescriptor[]     ← key, bit, group, label, title, info, icon,
                                   kind, zBand, time, coverage, loader, lazy
src/map/layerApplier.ts         ← DIE EINE Stelle, die MapLibre anfasst
src/map/layerLoaders/*.ts       ← je Layer ein Lazy-Loader (dynamic import)
```

Der vollständige Deskriptor-Entwurf steht in `docs/LAYER_SYSTEM.md` §5.1 und wird hier nicht
wiederholt.

### 1.2 Warum das kein Selbstzweck ist

| Eigenschaft | Ohne Registry | Mit Registry |
|---|---|---|
| Neuer Layer | 9 Stellen, 2× dupliziert | 1 Deskriptor + 1 Loader |
| Permalink-Bit vergessen | passiert (4 von 16 heute!) | Verifier schlägt fehl |
| Z-Ordnung | 17× `moveLayer`, 3 fast identische Blöcke | 1 Sortierung nach `zBand` |
| Länder-Asymmetrie | Prosa in Tooltips | Daten ⇒ maschinell prüfbar |
| Presets/Gruppen | nicht möglich ohne weitere Listen | `group` ist schon da |
| Parallele Agent-Arbeit | blockiert (Sperrzone) | möglich (je Layer eine Datei) |

Die Registry ist zugleich **Schritt 1 des in `decisions.md` O-04 empfohlenen Zerlegungsplans (V-38)**.
Die Layer-Erweiterung finanziert damit eine ohnehin geplante Strukturverbesserung, statt sie zu
verteuern.

### 1.3 Migrationsreihenfolge (Funktionserhalt zuerst)

```
Schritt 0  Golden-Baseline: Screenshots aller 16 Layer (Desktop + iPhone 12 Pro)
           + Verifier, der die aktuelle Sichtbarkeits-/Z-Matrix festschreibt
           ── BEVOR sich Code bewegt
Schritt 1  Registry parallel aufbauen; Verifier vergleicht Registry-Ergebnis
           byte-genau mit der handgepflegten Liste. Verhalten unverändert.
Schritt 2  Applier ersetzt die zwei duplizierten Blöcke. Gate = Pixel-Diff.
Schritt 3  Zeitmodell (§5) einziehen.
Schritt 4  Erster neuer Layer.
```

Vor Schritt 2 ist kein neuer Layer billig. **Diese Reihenfolge ist die wichtigste Aussage des
gesamten Plans.**

---

## 2. Datenadapter

### 2.1 Der einheitliche Vertrag

Alle heutigen Adapter (`radolan.ts`, `geosphereIncaGrid.ts`, `meteoSwissRadar.ts`, `iconD2*.ts`)
folgen bereits demselben Muster, ohne dass es typisiert wäre. Der Vorschlag ist, es zu benennen:

```ts
// src/sources/adapterContract.ts (Skizze)
export interface RasterFrame {
  values: Uint8Array;            // 0 = leer/außerhalb; sonst quantisiert gegen vMax
  width: number; height: number;
  corners: QuadCorners;          // [NW, NE, SE, SW]
  warpLnglat?: Float32Array;     // optional: projektionskorrektes Mesh
  warpN?: number;
  validAt: Date;                 // ECHTE Messzeit/Gültigkeitszeit — Pflicht (D-04)
  leadMinutes?: number;          // nur bei Vorhersageframes
}

export interface RasterSourceResult {
  frames: RasterFrame[];
  ref: DataRef;                  // Referenzzeit für den Status-Chip (V-19)
  attribution: string;
  coverage: Partial<Record<Country, 'full'|'partial'|'none'>>;
}

export interface VectorSourceResult {
  geojson: GeoJSON.FeatureCollection;   // bereits EPSG:4326
  ref: DataRef;
  attribution: string;
  coverage: Partial<Record<Country, 'full'|'partial'|'none'>>;
}
```

**Wichtig:** Das ist eine **Typisierung des Bestehenden**, keine Umstellung. Bestehende Adapter
erfüllen den Vertrag inhaltlich schon; sie bekommen lediglich die Typannotation und — wo sie fehlt —
die Referenzzeit.

### 2.2 Adapter je geplantem Layer

| Adapter | Datei (neu) | Muster | Quelle | Besonderheit | Aufwand |
|---|---|---|---|---|---|
| RADOLAN RE (Phase + Hagel) | `sources/radolanRe.ts` | P2 | `radvor/re/RE*_*.gz` | **900×900**-Gitter (nicht DE1200!) ⇒ eigenes Warp-Mesh; gzip statt bz2; Bit-13-Maske | **M** |
| MeteoSchweiz Hagel | `sources/meteoSwissHail.ts` | P3 | `ch.meteoschweiz.ogd-radar-hail` | Kopie von `meteoSwissRadar.ts`; **Saisonprüfung 01.04.–30.09.** | **S** |
| **DWD Warnungen ✅ UMGESETZT (Phase W1)** | **`sources/dwdCapAlerts.ts`** | P5 | **CAP-Vollstand `alerts/cap/DISTRICT_DWD_STAT`** (statt WFS — 100 % Polygon-Abdeckung, amtliche Farbe inklusive, stabiler `LATEST`-Alias; `docs/DATA_SOURCES.md` §9.1) | GeoJSON aus ZIP; **kein** TIME, Gültigkeit in `onset`/`expires`; Slider filtert die Quelle | **M** |
| GeoSphere Warnungen | `sources/geosphereWarnings.ts` | P5 | `getWarnstatus` + `getWarningsForCoords` | **EPSG:31287 → 4326 Reprojektion**; `wtype`/`wlevel`-Legende aus OpenAPI | **M** |
| DWD Blitzdichte | `sources/dwdLightningDensity.ts` | P1 | WMS `dwd:Blitzdichte` | TIME `PT5M`; 15-min-Fenster ⇒ **nicht summieren** | **S** |
| EUMETSAT MTG-LI | `sources/eumetsatLightning.ts` | P1 | WMS `mtg_fd:li_afa` | `crs=EPSG:3857` funktioniert trotz fehlender Deklaration; Parallaxe-Hinweis | **S** |
| DWD Gewitterzellen | `sources/dwdConvection.ts` | P1 → P5 | WMS `dwd:NCEW_EU`, später KONRAD3D-XML | Stufe 2 erst nach Schema-Klärung | **S → M** |
| GeoSphere SNOWGRID | `sources/geosphereSnowgrid.ts` | P3 | `snowgrid_cl-v2-1d-1km` | **EPSG:3416** (anderes Datum als INCA!); Takt 1 Tag | **M** |
| SLF/EAWS Lawinen | `sources/eawsBulletins.ts` | P5 | `aws.slf.ch/api/bulletin/caaml` + EAWS-Aggregat | Füllfarben **liegen im Payload** | **S** |
| OPERA Europa-Radar | `sources/operaComposite.ts` | P2 (neu) | CloudFerro S3 ODIM-HDF5 | **LAEA-Reprojektion**, 4,18 Mio. Zellen, Proxy nötig | **L** |
| Zugvektoren | `radar/motionField.ts` | Rechnung | RV-Frames | nutzt `src/ml/opticalFlowNowcast.ts` | **M** |

### 2.3 Generalisierung des Kompositors

`precipComposite.ts` ist heute auf vier Quellen hart verdrahtet (`ensureDe/At/Ch/D2`,
`primeDe/At/Ch/D2`, vier Index-Map-Felder). Hagel und Schneefall-Phase brauchen dieselbe
Mehrländer-Zusammenführung.

**Konzept:** Der Kompositor wird auf eine Liste von Beiträgen umgestellt:

```ts
interface CompositeContribution {
  id: string;
  country: Country | 'any';
  corners: QuadCorners;
  cols: number; rows: number;
  polarStereographic: boolean;
  pick: (h: number) => { values: Uint8Array } | null;   // Frame-Wahl für Stunde h
  maxHours: number;
  inclusive: boolean;   // DE/AT inklusiv, CH strikt — heutiges Verhalten erhalten
}
class Compositor { constructor(grid: Grid, contributions: CompositeContribution[]) {} }
```

**Erhalt-Kontrakt (nicht verhandelbar):** Für die Menge `{rv, inca, rzc, d2}` und die heutigen
Horizonte muss das Ergebnis **byte-identisch** zum jetzigen `PrecipCompositor` sein. Das ist per
Verifier prüfbar und ist die Gate-Bedingung dieser Umstellung. (→ V-137)

---

## 3. Tile-Loader

### 3.1 Zwei Ladepfade

```
A) Raster-Tiles (WMS)                      B) Binär-/Objektquellen
   Template mit {bbox-epsg-3857}              fetch → decompress → decode → Uint8-Grid
   TIME-Parameter für Zeitschritte             → Cache API pro unveränderlicher URL
   MapLibre lädt/cacht/verwirft                → RainLayer.setFrame (Texturupload)
```

### 3.2 Der TIME-Loader für WMS-Animationen

`src/sources/wmsTime.ts` liefert bereits das jüngste TIME-Extent über den
**Per-Layer-Virtual-Service** (`/geoserver/dwd/<layer>/wms`), was die Antwort klein hält. Für
Animation fehlt: die Aufzählung der **verfügbaren Schritte** und ein Vorpuffern.

**Konzept `src/map/wmsFrameLoader.ts`:**

```ts
interface WmsAnimationWindow {
  layer: string;
  end: Date;              // aus fetchWmsLatestTime()
  stepMinutes: number;    // aus dem Extent-Suffix (z. B. PT5M)
  count: number;          // bewusst KLEIN: 12 = letzte 60 min
}
// Lädt count Frames als ImageBitmap in einen LRU-Puffer und blendet lokal um,
// statt bei jedem Schritt die Source-URL zu wechseln.
```

**Begründung:** Ein `TIME`-Wechsel an einer MapLibre-Raster-Source bedeutet eine neue URL und damit
das vollständige Neuladen aller sichtbaren Kacheln. Für 13 Monate Zeitachse (`dwd:Blitzdichte`) ist
das unbezahlbar; für ein 60-Minuten-Fenster ist Vorpuffern billig und flüssig.
**Entscheidung: Animationsfenster begrenzen** (→ O-11).

### 3.3 Priorisierung und Staffelung

Beim Zuschalten mehrerer Layer darf nicht alles gleichzeitig starten:

```
Priorität 1  Frame für die AKTUELLE Slider-Stunde des zuletzt aktivierten Layers
Priorität 2  Frames für ±1 Schritt (Scrub-Vorbereitung)
Priorität 3  restliche Frames des Layers
Priorität 4  Frames anderer aktiver Layer
```

Ein kleiner Fetch-Scheduler mit Prioritätswarteschlange und `AbortController` je Layer. Das Muster
existiert im Repo bereits punktuell (`signal`-Durchreichung in allen Adaptern) — es fehlt die
Koordination darüber.

---

## 4. Animation der Niederschlagsbewegung

> **▶ Dieser Abschnitt ist seit 2026-08-05 die Kurzfassung. Die umsetzungsreife Spezifikation
> von E1/E2/E3 samt Beleglage, Pipeline, Schwellen, Zoomdichte, Rendering, Leerzuständen und
> Verifiern steht in `docs/zuglinien-radar-spec.md`.** Bei Widerspruch gilt die dortige Fassung.

Das ist der fachlich anspruchsvollste Teil und zugleich der, bei dem buscosun am meisten gewinnt,
weil die Daten (25 RV-Frames) **bereits geladen werden** und heute nur als Slider-Schritte sichtbar
sind.

**Zwei Befunde vom 2026-08-05, die diesen Abschnitt korrigieren:**

1. **RV enthält kein Bewegungsfeld.** Der Tar hat exakt 25 gleichartige RADOLAN-Gitter und keinen
   Advektionsvektor (am Byte belegt). Die Bewegung ist **immer** eine Eigenberechnung
   (`estimateFlowHS`) — es gibt auf Feldebene keinen Fallback.
2. **KONRAD3D liefert Zellbahnen inklusive amtlicher Unsicherheitsellipsen** (12 Prognosepunkte
   +5…+60 min). F-3 ist geschlossen; E3 ist damit fachlich freigegeben und wandert nach **L11**
   (Begründung: eigener Datenpfad + eigene Ehrlichkeitsfläche, „ein Thema = eine Phase").

### 4.1 Drei Darstellungsebenen

| Ebene | Was der Nutzer sieht | Datenquelle | Renderweg | Aufwand |
|---|---|---|---|---|
| **E1 Verlagerung** | Der Regen bewegt sich flüssig | RV-Frames −60 min…+120 min | `RainLayer` + Playback + **CPU-Crossfade** (`frameBlend.ts`) | **M** — Phase **L6** |
| **E2 Zugvektoren** | Pfeile zeigen Richtung und Tempo | Horn-Schunck über **gemessene** Analysen (`src/ml/opticalFlowNowcast.ts`, vorhanden) | GeoJSON-`symbol`-Layer, rotiert | **M** — Phase **L6** |
| **E3 Zellbahnen** | Umriss + prognostizierter Pfad + ETA | **KONRAD3D (amtlich, Schema belegt)**; `src/radar/cellTracking.ts` = benannter Fallback (D-11) | GeoJSON `fill`+`line`+`symbol` | **M–L** — Phase **L11** |

**E1 ist Pflicht, E2 ist der eigentliche „Zuglinien"-Layer, E3 ist die Kür** (und laut
`docs/high-end-radar-feature-catalogue.md` §15 eines der fünf Differenzierungsmerkmale).

**Verbindliche Zusatzregel zu E2 (2026-08-05):** Der Fluss wird **ausschließlich aus gemessenen
Analysen** geschätzt (`_000`-Frames aufeinanderfolgender Läufe), **nie** aus den
RV-Vorhersageframes — diese tragen bereits die Advektion des DWD-Nowcasts, eine Flussschätzung
darauf misst die eigene Extrapolation und ist zirkulär.

### 4.2 Playback-Komponente

```
src/map/TimelinePlayer.tsx  +  src/map/timelineModel.ts (rein, headless testbar)
```

Funktionsumfang, aus dem Feature-Katalog §2 übernommen:

| Funktion | Warum |
|---|---|
| Play / Pause / Loop | Grundfunktion |
| Geschwindigkeit 0,5× / 1× / 2× (gemerkt) | unterschiedliche Nutzungssituationen |
| **Harter visueller Bruch gemessen ↔ Vorhersage** | Katalog: *„the single most-underrated feature"*; direkt aus D-04 |
| Frame-Schritt ±1 | präzise Inspektion |
| „Zurück zu jetzt" | nach dem Scrubben |
| Auto-Advance bei neuem 5-min-Frame | Live-Verhalten |
| Konfidenz-Abklingen auf der Zeitachse | ehrliches Signal: Minute 90 ≠ Minute 5 |
| `prefers-reduced-motion` | Stepped statt Morphing (A11y) |

**Der Bruch zwischen Messung und Vorhersage ist nicht optional.** Er ist die visuelle Umsetzung von
D-04 und der Grund, warum D-14 („radar-only, kürzer und ehrlicher") getroffen wurde.

### 4.3 Frame-Interpolation (Morphing)

⚠️ **Korrektur 2026-08-05 (`agents.md` §1.3, Code schlägt Doku):** Der frühere Satz
„`src/fusion/frameInterp.ts` existiert, ist aber nicht im Slider-Pfad verdrahtet" ist **falsch**.
`lerpFrameImage` ist an **acht** Stellen in `MapView.tsx` verdrahtet (`:24` Import; `:2280, :2309,
:2485, :2507, :2527, :2548, :2569, :2594`) — für Temperatur, Fusions-Niederschlag, Böen, Gewitter,
Blitzprognose, Rotation und Schnee.

**Was wirklich fehlt:** `lerpFrameImage` arbeitet auf `HTMLImageElement`/`HTMLCanvasElement`
(`frameInterp.ts:31-47`) und benutzt `document.createElement` (`:22`) — es ist **DOM-gebunden**
(verletzt D-12, headless nicht prüfbar) und bedient nur den **PNG-Pfad** der ScalarLayer.
Für den `RainLayer`-Uint8-Pfad (Niederschlag, Regenradar) gibt es **keine** Interpolation.

| Weg | Beschreibung | Bewertung |
|---|---|---|
| **CPU-Crossfade** (`src/map/frameBlend.ts`, neu, **rein**) | konvexe Mischung zweier Uint8-Frames: `out = (1−f)·a + f·b` | **gewählt.** 307 200 Ops je Tween-Frame — im Rauschen; kein Überschwingen (alle Gewichte ≥ 0, Summe 1); null WebGL-Risiko; headless prüfbar |
| Zweiter `RainLayer` mit Alpha | zwei halbtransparente Flächen übereinander | **verworfen** — Alpha-Compositing ist nicht dieselbe Größe wie eine gemischte Intensität; die Legende würde lügen |
| **Flow-Warp** | Zwischenframe per `advect()` advehieren | hinter Flag `motionWarp`, **default off**, Fallback = Crossfade (D-11) |
| Shader-`mix` (2 Texturen) | am billigsten auf der GPU | **STOPP & FRAGEN** (Shader-Zone) — nicht Teil von L6 |

**Der `FrameGovernor` schaltet in fester Reihenfolge ab** (D-09, keine Sonderpfade):
`motionWarp` → Crossfade → Playback-FPS 2,5 → 1,5 → Zugvektor-Dichte eine Zoomklasse gröber.
Die Partikelzahl bleibt **nie** ein Hebel. `prefers-reduced-motion` schaltet Tween sofort aus.

### 4.4 Zugvektor-Rendering

**GeoJSON-Pfeile statt GPU-Streamlines.** Begründung: Streamlines wären ein zweiter `WindLayer` und
damit eine Shader-/WebGL-Pipeline-Änderung ⇒ **STOPP & FRAGEN** nach `CLAUDE.md`. Pfeile
beantworten die Nutzerfrage („zieht das auf mich zu?") vollständig, sind gegen die Golden-Baseline
prüfbar und kosten kein WebGL-Risiko. Streamlines bleiben als spätere Option offen.

Vektordichte zoomabhängig (grob bei z<7, dicht bei z>10) — dasselbe Prinzip wie die
zoom-adaptive Partikeldichte im Wind-Layer.

---

## 5. Zeitsteuerung

### 5.1 Das Problem

`sliderMax = max(Basis, Wolken-Horizont, precipRadarHorizonHours)` trägt keine heterogenen
Zeitmodelle. Die neuen Layer bringen mit:

| Layer | Zeitmodell | Bereich |
|---|---|---|
| Regenradar | Rückblick + Nowcast | −45 min … +2 h (DE) |
| Zuglinien | Nowcast | 0 … +2 h |
| Hagel DE (RE) | Nowcast | 0 … +2 h |
| Hagel CH (POH/MESHS) | nur Vergangenheit | −14 d … jetzt (**nur Apr–Sep**) |
| Blitz DE | Vergangenheit (13 Mon. Archiv) | −60 min … jetzt (Fenster) |
| Blitz DACH | Vergangenheit (14 Mon. Archiv) | −60 min … jetzt (Fenster) |
| Schneefall DE | Nowcast | 0 … +2 h |
| Schnee AT | tägliche Analyse | gestern |
| Warnungen | Gültigkeitsintervall | `ONSET` … `EXPIRES` |
| Lawinen | Bulletin | 2×/Tag, `validTime` |

### 5.2 Konzept: vier Zeitmodi

```ts
type TimeMode =
  | 'instant'         // ein Zeitpunkt, kein Slider-Einfluss (SNOWGRID)
  | 'window'          // gleitendes Rückblicksfenster (Blitz, Hagel CH)
  | 'forecast'        // 0 … +N h (Radar, Zuglinien, Hagel DE, Schneefall)
  | 'valid-interval'; // gilt von … bis (Warnungen, Lawinen)
```

**Der Slider bekommt eine Vergangenheitsachse.** Heute läuft er 0…+N; künftig −M…+N.
`forecastHour` wird von `number ≥ 0` zu einer vorzeichenbehafteten Größe.

**Die Rückwärtskompatibilität ist eine prüfbare Eigenschaft, keine Hoffnung:** `sliderRange()`
liefert `minHours === 0`, solange **kein aktiver Layer eine Vergangenheitsachse deklariert** — für
jede Teilmenge der 16 bestehenden `LayerKey`s ändert sich also nichts. Das ist die erste Assertion
von `verify:layer-time` (`docs/zuglinien-radar-spec.md` §14.1).

⚠️ **Das berührt das Permalink-Format** (`#m=` speichert `h`). Bestehende Links enthalten nur
nicht-negative `h` — negative Werte sind neu und kollidieren nicht; `decodeMapState` akzeptiert
bereits jeden endlichen Wert (`mapState.ts:55`), es ist **keine Formatversion nötig**.
Die Klemmung passiert im Aufrufer, nicht im Dekoder (erst dort ist bekannt, welche Layer aktiv sind).

⚠️⚠️ **Korrektur 2026-08-05:** Dieser Absatz und Risiko **U-4** nannten `verify:mapstate`, als
existierte er. **Es gibt keinen solchen Alias in `package.json`** (geprüft 2026-08-05; 26
`verify:*`-Aliase, keiner davon `mapstate`). Er ist **neu zu erstellen**; die vollständige
Assertion-Liste steht in `docs/zuglinien-radar-spec.md` §5.3 und schließt V-134 maschinell
(„jeder `LayerKey` hat ein Bit" — dafür muss `MapView.tsx` eine **Laufzeitliste
`ALL_LAYER_KEYS`** exportieren, weil der Typ zur Laufzeit weg ist).

### 5.3 Verhalten je Modus

| Modus | Slider-Wirkung | Außerhalb des Bereichs |
|---|---|---|
| `instant` | keine; Layer zeigt immer seinen Stand | Alter im Chip anzeigen |
| `window` | wählt das Fensterende | Layer aus + Grund `out-of-retention` |
| `forecast` | wählt den Frame | Layer aus (**kein** Modell-Ersatz — D-14), Grund `out-of-horizon` |
| `valid-interval` | filtert nach Gültigkeit | **Layer bleibt an und rendert leer**, Hinweis „Keine gültige Warnung für diesen Zeitpunkt" |

⚠️ **Korrektur 2026-08-05:** Die letzte Zeile hieß früher „Layer aus, Hinweis". Das ist die
schlechtere Variante — ein *abgeschalteter* Warn-Layer ist von einem *kaputten* nicht zu
unterscheiden, genau die Mehrdeutigkeit, die O-14 Option A verwirft. Ein aktiver, leerer Layer mit
Text sagt „hier ist gerade nichts". Begründung: `docs/zuglinien-radar-spec.md` §3.5.

✅ **Genau so umgesetzt (Phase W1, 2026-08-06):** Der Warn-Layer bleibt über den ganzen Slider
sichtbar; gilt zur gewählten Stunde nichts, ist die Quelle leer und Legende/Statuszeile sagen
„Für in N h liegen keine amtlichen Warnungen für Deutschland vor". Die dritte Lage — **Abruf
gescheitert** — ist davon ausdrücklich unterschieden („nicht erreichbar · das heißt nicht, dass
keine gelten"), denn genau diese Verwechslung wäre die gefährliche.

**Zusätzlich, weil es der häufigste Fehlerfall wird:** Ein eigener Grund `no-frame-near` greift,
wenn der nächstgelegene Frame weiter als ein voller `stepMinutes`-Schritt von der gewählten Zeit
entfernt liegt. Text: „Für diesen Zeitpunkt liegt kein Radarbild vor" — **nicht** „kein
Niederschlag".

### 5.4 Reine Logik, headless prüfbar

Nach dem Vorbild `precipSource.ts`:

```
src/map/layerTime.ts   (rein, DOM-frei)
  resolveLayerTime(spec, sliderHours, availability, nowMs) -> { ready, frameIndex?, reason? }
  sliderRange(activeLayers, baseHours)                     -> { minHours, maxHours, stepMinutes }
  verifyLayerTime()                                        -> Selbsttest
+ scripts/verify-layer-time.mjs  +  npm run verify:layer-time
```

Ohne npm-Skript zählt der Selbsttest nicht (V-95: 76 `verify()`-Exporte, nur 8 verdrahtet).

**Zwei Festlegungen, die in der Erstfassung fehlten und ohne die das Modell nicht trägt:**

1. **Die Frame-Wahl geht über die absolute Gültigkeitszeit, nicht über den Lead-Index.**
   `targetMs = nowMs + sliderHours · 3 600 000`, dann der Frame mit minimalem
   `|validAtMs − targetMs|`; ist dieser weiter als `stepMinutes` entfernt ⇒ `no-frame-near`.
   Grund: INCA-Leads zählen ab der **Laufzeit**, nicht ab „jetzt" — die heutige Index-Wahl erzeugt
   für Österreich einen Zeitversatz von bis zu ~45 min (am Live-Datensatz mit 32 min gemessen,
   `docs/zuglinien-radar-spec.md` §2.3, → V-144).
2. **`precipSource.ts` wird nicht aufgelöst, sondern von `layerTime.ts` aufgerufen.** Die frühere
   Alternative „aufgehen lassen **oder** unverändert lassen" (§11.2) ist entschieden:
   **unverändert lassen.** Damit ist die Byte-Identität konstruktiv gegeben statt geprüft, und
   `npm run verify:precip-source` bleibt mit unveränderter Prüfnamen-Liste grün. Vollständige
   Begründung samt Gegenargument: `docs/zuglinien-radar-spec.md` §3.6; die spätere
   Zusammenführung liegt als **O-16** vor.

---

## 6. Aktualisierung der Daten

| Quelle | Takt | Strategie | Trigger |
|---|---|---|---|
| RADOLAN RV/RE | 5 min | Poll auf `_runCache`-TTL (60 s), dann Verzeichnis prüfen | Timer + `visibilitychange` |
| MeteoSchweiz RZC/BZC/MZC | 5 min | `If-None-Match` → 304; STAC-Item einmal/Tag | Timer |
| GeoSphere INCA / SNOWGRID | 15 min / 1 d | **über Edge-Proxy**, Client pollt den Proxy | Timer |
| DWD WFS Warnungen | Empfehlung **15 min** | Poll; **kein** Durable Cache (Lizenzklausel) | Timer |
| GeoSphere Warnungen | unregelmäßig | `HEAD /getWarnstatus` → `Last-Modified` (billig) | Timer |
| WMS-TIME-Layer | 5 min | `fetchWmsLatestTime` (TTL 5 min) → neue URL bei Änderung | Timer |
| EAWS/SLF-Bulletin | 2×/Tag | `publicationTime` / `nextUpdate` aus dem Payload | Timer |

**Regeln:**
1. Aktualisierung **nur bei sichtbarem Tab** (`visibilitychange`) und **nur für aktive Layer**.
2. Ein neuer Frame verdrängt den alten erst nach erfolgreichem Dekodieren (kein Flackern).
3. Auto-Advance nur, wenn der Nutzer auf „jetzt" steht — nicht während des Scrubbens.
4. Der Status-Chip zeigt **immer** die echte Referenzzeit, nie die Abrufzeit (D-04 / V-19 / A12).

---

## 7. Caching und Speicherverwaltung

### 7.1 Cache-Matrix

| Ebene | Neu für welche Layer | Regel |
|---|---|---|
| **Netlify-Rewrite** `/_dwd_opendata` | RE (Hagel/Schneefall-Phase) | vorhanden, kein Eingriff nötig |
| **Edge Function + Durable Cache** | **GeoSphere** (Pflicht wegen 240 req/h), ggf. OPERA | ⚠️ **STOPP & FRAGEN** — Edge-/Transport-Zone |
| **Warm-Cron** | RE, POH/MESHS falls Kaltstart zu langsam | Budget **vorher** neu schneiden (A10/V-80) |
| **Cache API** | RE-Läufe (`radolan-re-gz-v1`), POH/MESHS (`meteoswiss-hail-v1`) | FIFO-Cap je Cache, wie `RV_TAR_CACHE_MAX = 14` |
| **HTTP 304** | MeteoSchweiz (liefert `ETag`) | `If-None-Match` nutzen |
| **In-Memory** | alle | LRU über **alle** Layer, nicht je Layer |
| **Kein Cache** | Warnungen | Lizenzklausel „vollständig und unverzüglich" |

### 7.2 Speicherbudget

Die kritische Zahl: Ein DE1200-Frame ist 1100×1200 = **1,32 MB** als Uint8. Bei 25 Frames sind das
**33 MB pro Layer**. Drei Raster-Layer mit voller Frame-Historie = ~100 MB — auf einem Mobilgerät
ist das jenseits der Schmerzgrenze.

**Konzept — ein globaler Frame-Puffer statt Puffer je Layer:**

```ts
// src/map/frameBudget.ts (rein, headless testbar)
interface FrameBudget {
  maxBytes: number;                 // aus FrameGovernor-Tier abgeleitet
  admit(layerKey, frameKey, bytes): boolean;
  touch(layerKey, frameKey): void;  // LRU
  evict(): void;
}
```

**Vorgeschlagene Budgets** (Entscheidung O-13):

| Geräte-Tier | Gesamtbudget Frames | Frames je Layer | Verhalten bei Überschreitung |
|---|---|---|---|
| Desktop hoch | 192 MB | bis 25 | nichts |
| Desktop / Tablet mittel | 96 MB | 13 (jeder 2.) | Frames ausdünnen |
| Mobil hoch | 64 MB | 9 | ausdünnen + Komposit-Auflösung senken |
| Mobil niedrig | 32 MB | 5 | nur ±2 Schritte um die aktuelle Stunde |

**Zwei Ersparnisse, die sofort greifen:**
1. **Auf dem Komposit-Gitter halten, nicht auf dem Quellgitter.** Das DACH-Komposit ist 600×512 =
   **307 KB** statt 1,32 MB — Faktor 4,3. Der Kompositor rechnet ohnehin dorthin; die Quellframes
   werden nach dem Komposit nur noch für Neuberechnungen gebraucht.
2. **Frames nur für den sichtbaren Zeitbereich halten.** Wer auf „jetzt" steht, braucht +115 min
   nicht im Speicher.

### 7.3 Kopplung an den FrameGovernor

Der `FrameGovernor` (D-09) bleibt der **einzige** Performance-Hebel. Er bekommt keine neue Logik,
sondern liefert nur sein Tier an `frameBudget`. Keine Sonderpfade je Layer — das ist ausdrückliche
Regel in `CLAUDE.md`.

---

## 8. Fehlerbehandlung und Offline-Verhalten

### 8.1 Fehler-Taxonomie (neu)

Heute sehen fachlich sehr verschiedene Zustände im UI gleich aus. Vorschlag:

```ts
type LayerFailure =
  | { kind: 'offline'; lastGood?: DataRef }     // Netz weg → Letztstand + Stale-Badge
  | { kind: 'upstream'; status: number }        // 404/5xx → Quelle nennen, Retry
  | { kind: 'format' }                          // Dekodierung gescheitert → Kontrakt-Bruch melden
  | { kind: 'out-of-coverage'; country: Country }  // Land nicht abgedeckt → amtliche Quelle verlinken
  | { kind: 'out-of-season'; from: string; to: string }  // Hagel CH Okt–Mär
  | { kind: 'out-of-horizon'; horizonHours: number }     // jenseits des Nowcast-Fensters
  | { kind: 'rate-limited'; retryAfter?: number };       // GeoSphere 429
```

**`out-of-season` und `out-of-coverage` sind die wichtigsten Neuzugänge.** Ein leerer Hagel-Layer im
Januar darf nicht wie „kein Hagel" aussehen (RK-7), und ein leerer AT-Hagel-Layer darf nicht wie
„keine Gefahr" aussehen — das ist derselbe Fehler, den V-17 für Warnungen bereits behoben hat.

### 8.2 Offline

Der RV-Tar-Cache **enthält** brauchbare Daten, wenn das Netz fehlt — sie werden nur nicht angeboten.
Konzept: Bei `offline` den jüngsten Cache-Treffer anzeigen, mit **Stale-Badge** und echter
Referenzzeit. Der Feature-Katalog fordert das ausdrücklich („Offline last-frame").

**Ausnahme Warnungen:** veraltete Warnungen sind gefährlicher als keine. Offline → Layer aus,
Hinweis + Deep-Link auf die amtliche Quelle (`src/officialSources.ts` liefert die Links bereits).

### 8.3 Kontrakt-Monitoring

Mit neun weiteren reverse-engineerten Quellen wächst die Fläche für stille Upstream-Brüche
erheblich. Nach dem V-87-Muster: eine nächtliche Sonde je Quelle, die Erreichbarkeit, Format-Signatur
(Header-Bytes, HDF5-Pfade, GeoJSON-Properties) und Frische prüft und bei Abweichung meldet.
(→ V-142)

---

## 9. Performanceoptimierung und Renderingstrategie

### 9.1 Renderstrategie je Layer-Typ

| Typ | Renderweg | Warum |
|---|---|---|
| Intensitätsraster (Regen, Hagel, Schnee) | `RainLayer` (bikubisch, LUT) | Palettenwechsel gratis; kein Überschwingen; Frame-Wechsel = Texturupload |
| Modellfelder | `ScalarLayer` (DEM-Lapse) | vorhandene Höhenverfeinerung |
| Blitz, Satellit, Gewitterzellen (Stufe 1) | native `raster`-Source | fertig eingefärbt, kein Decoder |
| Warnungen, Lawinen, Zellumrisse, Zugvektoren | native `geojson`-Layer | MapLibre macht Tiling/Simplify/Hit-Test |
| Wind | `WindLayer` | unverändert |

**Regel:** Neue Layer bekommen **keine** neuen Custom-Layer-Klassen, solange `RainLayer`,
`ScalarLayer` oder ein nativer Layer ausreichen. Jede neue Shader-Pipeline ist eine
STOPP-&-FRAGEN-Zone.

### 9.2 Optimierungen

| Maßnahme | Wirkung |
|---|---|
| Auf dem Komposit-Gitter halten statt auf Quellgittern | Faktor ~4,3 Speicher |
| Index-Maps über die Session cachen (Geometrie ändert sich nie) | −250…370 ms je Quellwechsel |
| Adapter-Dekodierung im Worker (Muster vorhanden) | keine Long Tasks > 200 ms |
| Fetch-Scheduler mit Prioritäten | erster Frame schneller sichtbar |
| Layer-Gruppen mit gegenseitigem Ausschluss | weniger Draw-Calls, weniger Farbmatsch |
| Warm-Cron für die tatsächlich sichtbaren Layer (A10 beheben) | Kaltstart der neuen Layer |
| WMS-Animation auf 60-min-Fenster begrenzen | kein Kachelsturm |
| `prefers-reduced-motion` → Morphing aus | A11y + Performance |

### 9.3 Messpunkte

Jede Phase weist nach: Zeit bis erster Frame (warm/kalt), GPU-Speicher bei allen aktiven Layern,
Long Tasks, FPS beim Scrubben mit 3 Rasterlayern (Real-Device), Netzverkehr je Aktivierung.
Zielwerte in `docs/MAP.md` §10.3.

---

## 10. Skalierung und Erweiterbarkeit

Nach der Registry ist ein Layer:

```
1 Deskriptor in layerRegistry.ts
1 Loader-Modul in map/layerLoaders/
1 Adapter in sources/ (oder ein vorhandener)
1 Eintrag in docs/WEATHER.md + docs/API.md
1 Verifier (falls neue reine Logik)
```

Das ist die Zielgröße und der Prüfstein: **Wenn ein zehnter Layer mehr als diese fünf Artefakte
kostet, ist die Registry nicht fertig.**

Weitere Ausbaustufen, die die Architektur dann ohne Umbau trägt: OPERA-Europa-Radar,
CAMS-Pollen/UV/Luftqualität, EFFIS-Waldbrand, MSG-Satellit in 5-Minuten-Auflösung, Hagelklimatologie,
Niederschlagsmessnetz CH.

---

# TEIL B — UMSETZUNGSPLAN

## 11. Dateien

### 11.1 Neu anzulegen

**Infrastruktur (Phase L0–L2)**

| Datei | Zweck | LOC (grob) |
|---|---|---|
| `src/map/layerRegistry.ts` | Deskriptoren aller Layer; rein | 400–600 |
| `src/map/layerApplier.ts` | einzige MapLibre-Berührung für Existenz/Sichtbarkeit/Z | 200–300 |
| `src/map/layerTypes.ts` | Deskriptor-, Gruppen-, ZBand-Typen | 120 |
| `src/map/layerTime.ts` | Zeitmodi, Slider-Bereich, Verfügbarkeit; rein — **Spec: `zuglinien-radar-spec.md` §3** | 200 |
| `src/map/frameBudget.ts` | globaler LRU-Frame-Puffer; rein — **Spec: §6.2** | 150 |
| `src/map/fetchScheduler.ts` | Prioritätswarteschlange + Abort je Layer — **Spec: §6.4** | 120 |
| `src/map/frameBlend.ts` | **neu (L6)** — konvexe Uint8-Mischung für den Crossfade; rein — **Spec: §9.3** | 60 |
| `src/radar/motionField.ts` | **neu (L6)** — Bewegungsfeld → Zugvektor-GeoJSON; rein — **Spec: §10** | 220 |
| `src/radar/motionWorker.ts` | **neu (L6)** — Horn-Schunck off-main, Pool 1, Main-Thread-Fallback | 60 |
| `src/sources/adapterContract.ts` | `RasterFrame`/`RasterSourceResult`/`VectorSourceResult` | 80 |
| `src/map/layerLoaders/index.ts` | ID → dynamischer Import | 60 |

**Layer-Datenadapter (Phasen L3–L9)**

| Datei | Layer |
|---|---|
| `src/sources/radolanRe.ts` | Hagel DE + Schneefall-Phase DE (**ein** Adapter für **zwei** Layer) |
| `src/sources/meteoSwissHail.ts` | Hagel CH (POH/MESHS) |
| `src/sources/dwdWarnings.ts` | Wetter-/Unwetterwarnungen DE |
| `src/sources/geosphereWarnings.ts` | Warnungen AT (+ `at31287.ts` für die Reprojektion) |
| `src/sources/dwdLightningDensity.ts` | Blitz DE (`dwd:Blitzdichte`, TIME) |
| `src/sources/eumetsatLightning.ts` | Blitz DACH (`mtg_fd:li_afa`, TIME) |
| `src/sources/dwdConvection.ts` | Gewitterzellen (NCEW_EU → KONRAD3D) |
| `src/sources/geosphereSnowgrid.ts` | Schneedecke AT |
| `src/sources/eawsBulletins.ts` | Lawinen CH/AT (optional) |
| `src/sources/operaComposite.ts` | Europa-Radar (Ausbaustufe) |

**Renderer / Komponenten**

| Datei | Zweck |
|---|---|
| `src/map/TimelinePlayer.tsx` | Play/Pause/Speed/Step/Jetzt + Mess-/Prognose-Bruch — **Spec: §4** |
| `src/map/timelineModel.ts` | reine Playback-Logik, headless testbar — **Spec: §4.2** |
| `src/radar/cellPolygons.ts` | Zellumrisse + **amtlicher** Pfadkegel aus KONRAD3D (L11) — **Spec: §11.2** |
| `src/sources/dwdKonrad3d.ts` | **neu (L11)** — DOM-freier Pull-Parser über ~20 Pfade + Sentinel-Filter |
| `src/map/WarningLayer.ts` | GeoJSON-Warnpolygone: Styling, Klick, Filter nach Stufe |

**Verifier**

`scripts/verify-layer-registry.mjs` · `verify-layer-time.mjs` · `verify-frame-budget.mjs` ·
`verify-radolan-re.mjs` · `verify-warnings-de.mjs` · `verify-warnings-at.mjs` ·
`verify-meteoswiss-hail.mjs` · `verify-timeline.mjs` · `verify-composite-equivalence.mjs` ·
**`verify-mapstate.mjs` (existiert NICHT, s. §5.2)** · **`verify-motion-field.mjs`** ·
**`verify-radar.mjs`** (bindet das vorhandene, aber unverdrahtete `src/radar/_verify.ts` an npm —
schließt zugleich V-143)
(+ je ein `npm run verify:*`-Alias — **ohne Alias zählt der Selbsttest nicht**)

**Dokumentation** — dieses Dokument, `docs/DATA_SOURCES.md`, `docs/LAYER_SYSTEM.md`, `docs/MAP.md`,
`docs/WEATHER.md`, `docs/API.md`, `README.md`, `DEVELOPMENT.md`, `CONTRIBUTING.md`.

### 11.2 Anzupassen

| Datei | Änderung | Risiko |
|---|---|---|
| `src/MapView.tsx` | Sichtbarkeits-/`moveLayer`-Blöcke → Applier; Loader → Registry; Slider → `layerTime` | **hoch** (Sperrzone) |
| `src/mapState.ts` | `LAYER_ORDER` aus der Registry ableiten; negative `h` zulassen | mittel |
| `src/components/LayerInfoPanel.tsx` | `LAYER_INFO` aus der Registry beziehen | niedrig |
| `src/components/LayerIcon.tsx` | Icons für 9 neue Layer | niedrig |
| `src/scalar/precipComposite.ts` | Generalisierung auf Beitragsliste (byte-identisch für Bestand!) — **erst L8**, in L5/L6 **nicht angefasst** | **hoch** |
| `src/nowcast/precipSource.ts` | **entschieden 2026-08-05: unverändert lassen.** `layerTime.ts` ruft `precipRadarHorizonHours` auf, statt es zu ersetzen (Begründung `zuglinien-radar-spec.md` §3.6; spätere Zusammenführung = O-16) | **keins** |
| `src/radar/radarFrames.ts` | `DE_PAST_SEED_FRAMES` 9 → 12 (45 → 60 min, O-10) **und** die AT-Laufzeit-Korrektur (V-144) | mittel |
| `src/sources/geosphereIncaGrid.ts` | `last_forecast_reftime` aus dem NetCDF-Root-Attribut mitliefern (heute ungelesen) — Voraussetzung für V-144 | niedrig |
| `src/sources/radolanDecode.ts` | 900×900-Gitter zusätzlich zu DE1200 | mittel |
| `src/dataAge.ts` | neue Quellentypen | niedrig |
| `src/officialSources.ts` | AT-Warnungen sind nicht mehr nur Deep-Link | niedrig |
| `netlify.toml` / `vite.config.ts` | ggf. `/_geosphere`, `/_opera` | ⚠️ **STOPP & FRAGEN** |
| `.github/workflows/warm-grib.yml` | Warm-Budget neu schneiden (A10) | ⚠️ **STOPP & FRAGEN** |
| `package.json` | neue `verify:*`-Skripte | niedrig |
| `src/map/mapDeck.css` | Gruppen, Presets, Zeitleiste | niedrig |

**Nicht anzufassen:** `src/wind/*` (Shader/Governor), `src/fusion/*`, `src/scalar/ScalarLayer.ts`
(Shader), `src/countryMask.ts`, `netlify/edge-functions/*` ohne Freigabe.

---

## 12. Reihenfolge der Umsetzung

Jede Phase = ein Thema = ein Gate (`CLAUDE.md`). Reihenfolge nach Wert/Risiko/Abhängigkeit.

| Phase | Inhalt | Vorbedingung | Aufwand | Wert |
|---|---|---|---|---|
| **L0** | **Golden-Baseline** — Screenshots aller 16 Layer (Desktop + iPhone 12 Pro), Sichtbarkeits-/Z-Matrix als Verifier, CORS-Prüfung aller 12 Zielendpunkte im Browser | — | **S (1–2 T)** | ohne sie ist alles Weitere blind |
| **L1** | **Layer-Registry** parallel; Verifier vergleicht byte-genau mit der Bestandsliste. Kein Verhaltenswechsel | L0 | **M (3–5 T)** | entblockt alles |
| **L2** | **Applier** ersetzt die zwei duplizierten Blöcke. Gate = Pixel-Diff. **`LAYER_ORDER` wird vollständig** (4 fehlende Layer!) | L1 | **M (2–4 T)** | behebt V-134 nebenbei |
| **L3** | **Wetter-/Unwetterwarnungen DE** (WFS-GeoJSON) — Polygone, Stufenfilter, Klick-Detail, `EXPIRES`-Logik | L2 | **S–M (2–4 T)** | Table-Stakes, jeder Wettbewerber hat es |
| **L4** | **Warnungen AT** (GeoSphere) — Reprojektion 31287→4326, `wtype`-Legende, `getWarningsForCoords`-Detail. **Schließt V-24/V-133** | L3 | **M (3–5 T)** | größter Ehrlichkeitsgewinn |
| **L5** | **Zeitmodell + TimelinePlayer** — vier Zeitmodi, Vergangenheitsachse, Play/Pause/Speed/Step/Loop, **Mess-/Prognose-Bruch**, Frame-Budget, Prefetch-Scheduler, **`LAYER_ORDER` vollständig + `verify:mapstate`**, **AT-Zeitversatz-Fix (V-144)**. Vollspec: `docs/zuglinien-radar-spec.md` Teil II · Gate **GL5** | L2 | **M–L (4–7 T)** | macht 25 vorhandene RV-Frames endlich sichtbar |
| **L6** | **Regenradar-Ansicht + Niederschlagszuglinien** — Rückblick 60 min, CPU-Crossfade, Zugvektoren (E1 + E2). Vollspec: `docs/zuglinien-radar-spec.md` Teil III · Gate **GL6** | L5 | **M (4–6 T)** | Kernversprechen der Marke |
| **L7** | **Blitzaktivität** — `dwd:Blitzdichte` (DE, TIME) + `mtg_fd:li_afa` (DACH). Zwei WMS-Adapter, ein Layer mit Quellenumschaltung | L5 | **S–M (2–4 T)** | DACH-weit, sehr günstig |
| **L8** | **Hagel** — MeteoSchweiz POH/MESHS (CH) + RADOLAN RE Bit 13 (DE). Saison- und Abdeckungs-Fehlerzustände | L5, F-2 geklärt | **M (4–6 T)** | **Alleinstellungsmerkmal** |
| **L9** | **Schneefall** — RE-Phase (DE, **derselbe Fetch wie L8**) + SNOWGRID (AT) | L8 | **S–M (2–4 T)** | halber Aufwand dank L8 |
| **L10** | **Gewitterzellen** Stufe 1 — `dwd:NCEW_EU` als Raster, mit ehrlicher Kennzeichnung Messung/Prognose | L5 | **S (1–2 T)** | schnelle Ergänzung |
| ~~**L11**~~ ✅ **erledigt als Phase Z1 (2026-08-05)** | **Gewitterzellen** Stufe 2 = **E3** — KONRAD3D-Objekte, Zellumrisse, **amtlicher** Pfadkegel, ETA. Spec: `docs/zuglinien-radar-spec.md` §11.2 · Diagnose: `audit/zellbahnen.md` · Gate **GZ1** | keine — **vor** L5/L6 gebaut (Jans Auftrag), eigener Datenpfad | **umgesetzt in 1 Session** (Spec war fertig) | Differenzierungsmerkmal Nr. 4 des Katalogs — **live** als `LayerKey 'cells'` |
| **L12** | **Lawinen** (SLF/EAWS-GeoJSON mit fertigen Farben) | L2 | **S (1–2 T)** | bestes Aufwand/Nutzen-Verhältnis |
| **L13** | **Gruppen + Presets** im Dock | L3–L12 | **M (3–5 T)** | Bedienbarkeit bei 25 Layern |
| **L14** | *Ausbaustufe:* OPERA-Europa-Radar | F-7 geklärt | **L (8–14 T)** | schließt die Grenzkante |
| **L15** | *Ausbaustufe:* CAMS Pollen/UV/Luftqualität, EFFIS-Waldbrand | L2 | **M (3–5 T)** | schließt V-26/V-27 ohne API-Key |

¹ **Aufwand für L11 gesenkt (2026-08-05): von 6–10 T auf 5–8 T.** Grund: F-3 ist geschlossen, die
Analysephase entfällt (2 T → 0,5 T), und der Pfadkegel muss nicht geschätzt werden — KONRAD3D
liefert je Prognosestützstelle eine amtliche Unsicherheitsellipse. Gegenläufig kommt ein
DOM-freier XML-Pull-Parser dazu (+0,5 T).

**Gesamt Kernumfang L0–L13: ca. 36–60 Personentage** (vorher 37–62; die Differenz ist L11).
Mit Ausbaustufen L14–L15: ca. 47–79 Personentage.

**Kritischer Pfad:** L0 → L1 → L2 → (L3, L5 parallel) → L6/L7/L8 → L9 → L13.

### 12.1 Reihenfolge-Begründung

- **L3/L4 (Warnungen) vor den Radar-Layern**, obwohl Radar „spannender" ist: Sie sind billiger,
  risikoärmer, schließen einen seit Monaten dokumentierten Ehrlichkeitsdefekt (V-13/V-17/V-24) und
  liefern eine Table-Stakes-Funktion, die jeder Wettbewerber hat.
- **L5 (Zeitmodell) vor allen Animationslayern:** Ohne einheitliche Zeitachse bekommt jeder
  Animations-Layer seine eigene — genau die Duplikation, die das Projekt schon einmal teuer bezahlt
  hat.
- **L8 vor L9:** Hagel und Schneefall-Phase kommen aus **demselben** RE-Request. Wer L8 baut, hat
  L9 zu 60 % erledigt.
- **L11 nach Schema-Klärung:** KONRAD3D ohne belegtes Schema ist Raten — verboten nach D-04.
  **Erledigt: F-3 ist am 2026-08-05 aus einer echten Datei geschlossen worden** (`docs/API.md`
  §2.4). L11 wartet ab sofort nur noch auf L10.
- **E3 bleibt in L11 und wandert nicht nach L6**, obwohl die Beleglage es zuließe. Grund ist
  Phasendisziplin, nicht fehlende Evidenz: E3 ist ein eigener Datenpfad (Verzeichnis-Scrape,
  0,6-MB-XML, DOM-freier Parser, Proxy), ein eigenes Rendering und vor allem eine eigene
  Ehrlichkeitsfläche — `hail_flag`, `gust_flag` und `maximum_estimated_wind_gust` sind warnungsnahe
  Größen und lösen D-19 aus. L6 ist mit E1 + E2 bereits M-groß. Wer es anders will, entscheidet
  **O-18**.

---

## 13. Aufwandsschätzung im Detail

| Phase | Analyse | Umsetzung | Verifikation | Doku | Summe |
|---|---|---|---|---|---|
| L0 Baseline | 0,5 | 0,5 | 0,5 | 0,5 | **1–2** |
| L1 Registry | 1 | 2 | 1 | 0,5 | **3–5** |
| L2 Applier | 0,5 | 1,5 | 1,5 | 0,5 | **2–4** |
| L3 Warnungen DE | 0,5 | 1,5 | 0,5 | 0,5 | **2–4** |
| L4 Warnungen AT | 0,5 | 2,5 | 1 | 0,5 | **3–5** |
| L5 Zeitmodell | 1 | 3 | 1,5 | 0,5 | **4–7** |
| L6 Radar + Zuglinien | 1 | 3 | 1 | 0,5 | **4–6** |
| L7 Blitz | 0,5 | 1,5 | 0,5 | 0,5 | **2–4** |
| L8 Hagel | 1 | 3 | 1 | 0,5 | **4–6** |
| L9 Schneefall | 0,5 | 1,5 | 0,5 | 0,5 | **2–4** |
| L10 Gewitter S1 | 0,25 | 0,75 | 0,25 | 0,25 | **1–2** |
| L11 Gewitter S2 (E3) | **0,5** ¹ | **4,5** | 1,5 | 0,5 | **5–8** |
| L12 Lawinen | 0,25 | 0,75 | 0,25 | 0,25 | **1–2** |
| L13 Gruppen/Presets | 0,5 | 2,5 | 1 | 0,5 | **3–5** |
| **Kern L0–L13** | | | | | **36–60 T** |
| L14 OPERA | 2 | 8 | 2 | 1 | **8–14** |
| L15 CAMS/EFFIS | 0,5 | 2,5 | 0,5 | 0,5 | **3–5** |

¹ Analyse-Anteil von 2 T auf 0,5 T gesenkt, weil das KONRAD3D-Schema seit 2026-08-05 vollständig
belegt ist (`docs/DATA_SOURCES.md` §4.1 B2, `docs/API.md` §2.4).

**Annahmen (falsifizierbar):** ein Entwickler; keine parallelen Themen (`CLAUDE.md`: ein Thema =
eine Phase); die offenen Fragen aus `docs/DATA_SOURCES.md` §13 werden **vorab** geklärt (das
ist Teil von L0 — F-3 und F-12 sind seit 2026-08-05 erledigt, F-1 teilweise, F-13 kam neu hinzu);
keine STOPP-&-FRAGEN-Wartezeit eingerechnet.

**Was die Schätzung kippen würde:** (a) CORS-Annahmen falsch ⇒ zusätzliche Edge-Function-Arbeit,
je Quelle +1–2 T; (b) `jsfive` scheitert an einem HDF5-Filter ⇒ eigener Filter, +3–5 T;
(c) EUMETSAT-/EUMETNET-Lizenzfragen negativ ⇒ L14 und der Satellit-Ausbau entfallen;
(d) L1/L2 gehen nicht verhaltensneutral durch ⇒ Rückfall auf Direktverdrahtung, **+2 T je Layer**.

---

## 14. Risiken (Umsetzungsrisiken; Quellenrisiken s. `docs/DATA_SOURCES.md` §12)

| # | Risiko | W | A | Gegenmaßnahme |
|---|---|---|---|---|
| U-1 | **Registry-Umbau bricht eine bestehende Layer-Kombination** | mittel | **sehr hoch** | Golden-Baseline (L0) + byte-genauer Vergleichsverifier in L1 + Pixel-Diff-Gate in L2. Rückfallpfad: Applier hinter Flag (D-11) |
| U-2 | **Kompositor-Generalisierung ändert Pixel** | mittel | hoch | Äquivalenz-Verifier: `{rv,inca,rzc,d2}` muss byte-identisch bleiben. Gate-Bedingung |
| U-3 | **Speicherdruck auf Mobil** durch viele Frames | **hoch** | hoch | `frameBudget` **vor** dem ersten neuen Raster-Layer (L5); Komposit- statt Quellgitter halten |
| U-4 | **Zeitachse mit Vergangenheit bricht Permalinks** | niedrig | mittel | negative `h` sind neu ⇒ keine Kollision. ⚠️ `verify:mapstate` **existiert nicht** (geprüft 2026-08-05) — er ist **neu zu erstellen**, nicht zu erweitern; Assertion-Liste in `docs/zuglinien-radar-spec.md` §5.3, inkl. eingefrorenem Legacy-Hash als Regressionsfall |
| U-5 | **STOPP-&-FRAGEN-Zonen blockieren** (Edge Function für GeoSphere, Warm-Budget) | **hoch** | mittel | frühzeitig vorlegen; L3/L4/L7/L12 brauchen **keine** Edge-Arbeit ⇒ parallel weiterarbeiten |
| U-6 | **MapView wächst weiter statt zu schrumpfen** | mittel | hoch | LOC-Budget als Gate-Kriterium: nach L2 **kleiner** als vorher, nach L13 < 3.000 |
| U-7 | **Neun Layer überfordern das Dock** | **hoch** | mittel | L13 (Gruppen/Presets) nicht ans Ende schieben, sondern nach L8 vorziehen, falls das Dock kippt |
| U-8 | **Ehrlichkeitsregression:** ein Layer suggeriert Abdeckung, die es nicht gibt | mittel | **sehr hoch** | `coverage` im Deskriptor + Verifier, der für jede Kombination Layer×Land einen Text erzwingt (V-17-Regel maschinell) |
| U-9 | **Kein Test-Framework für UI** ⇒ Regression fällt erst dem Nutzer auf | **hoch** | hoch | O-02 Option C (Playwright-Smoke) vorziehen; mindestens Screenshot-Diff im Gate |
| U-10 | **Warm-Cron-Budget reißt** (heute schon falsch geschnitten) | **hoch** | mittel | A10/V-80 **vor** L8 beheben |
| U-11 | **Parallele Agenten kollidieren in MapView** | mittel | hoch | `agents.md` §3 Sperrzone respektieren; nach L2 sind Layer-Dateien konfliktfrei |
| U-12 | **Barrierefreiheit fällt hinten runter** | **hoch** | mittel | Legenden nicht nur farbcodiert, Zeitleiste tastaturbedienbar, `prefers-reduced-motion`, Screenreader-Text — **Teil der Definition of Done je Phase** |

---

## 15. Teststrategie

Konsistent mit D-10 (kein Test-Framework, Verifier-Harness) und den Empfehlungen aus O-02.

### 15.1 Ebene 1 — Headless-Verifier (Pflicht, netzfrei)

| Verifier | Prüft |
|---|---|
| `verify:layer-registry` | jeder Key hat genau ein Bit; Bits lückenlos und stabil; jeder Key hat Label/Info/Icon/Loader/Coverage; **kein Key ohne Permalink-Bit** |
| `verify:layer-time` | die vier Zeitmodi, Slider-Bereichsberechnung, Grenzinklusivität (DE/AT inklusiv, CH strikt — heutiges Verhalten!) |
| `verify:frame-budget` | LRU-Verdrängung, Tier-Budgets, kein Layer verhungert |
| `verify:composite-equivalence` | **byte-identisches Ergebnis** für die Bestandsquellen |
| `verify:timeline` | Playback-Zustandsmaschine, Auto-Advance nur bei „jetzt", Mess-/Prognose-Grenze |
| `verify:warnings-de` / `-at` | Feldabbildung, Stufenlogik, Ablauf über `EXPIRES`, `wtype`-Legende vollständig |
| `verify:radolan-re` | Header-Parsing, **Bit-13-Maske**, 900×900-Gitter, Wertebereich 0–1000 |
| `verify:meteoswiss-hail` | HDF5-Pfade, `/where`-Ecken, **Saisonerkennung** |
| `verify:coverage-honesty` | für **jede** Kombination Layer × {DE,AT,CH} existiert entweder Abdeckung oder ein Hinweistext |

`verify:coverage-honesty` ist der wichtigste neue Verifier: Er macht D-04 aus einer Haltung eine
Prüfbedingung.

### 15.2 Ebene 2 — Kontrakt-Sonden (netzabhängig, nicht Gate-blockierend)

Je Quelle eine Sonde: Erreichbarkeit, Format-Signatur, Frische, CORS. Nächtlich, meldet Abweichungen.
Nach dem V-87-Muster. (→ V-142)

### 15.3 Ebene 3 — UI-Verifikation (Chrome DevTools MCP)

Je Phase: Desktop 1440×900 und iPhone 12 Pro 390×844 DPR 3; Screenshot-Diff gegen die
Golden-Baseline; Konsole sauber; keine Long Tasks > 200 ms; Touch-Targets ≥ 44 px.
**Achtung:** Emulation ist für WebGL nicht repräsentativ — GPU-kritische Aussagen brauchen ein
Real-Device (`CLAUDE.md`).

### 15.4 Ebene 4 — die fünf Selbstverifikations-Fragen

Vor jedem Gate schriftlich mit Beleg: (1) Funktionserhalt **einzeln je Layer**, (2) Desktop
pixelgleich, (3) Touch-Targets ≥ 44 px, (4) Konsole sauber, (5) keine Long Tasks > 200 ms.

---

## 16. Validierungsschritte je Phase

| Phase | Validierung (Beleg-Pflicht) |
|---|---|
| **L0** | Baseline-Screenshots liegen vor; CORS aller 12 Endpunkte im Browser geprüft und protokolliert; Matrix-Verifier läuft **und kann fehlschlagen** (Red-Test-Nachweis) |
| **L1** | Registry-Verifier grün; **kein** Verhaltenswechsel (Diff auf `MapView.tsx`-Verhalten = 0) |
| **L2** | Pixel-Diff aller 16 Layer = 0; `LAYER_ORDER` vollständig; die vier bisher fehlenden Layer sind permalink-fähig (manuell geprüft) |
| **L3** | Warnungen erscheinen bei aktiver Lage; Stufenfarben = DWD-Skala; `EXPIRES` blendet aus; Klick zeigt Klartext; Lizenzhinweis + Deep-Link sichtbar |
| **L4** | Reprojektion gegen bekannte Gemeindegrenzen geprüft; `wtype`-Legende vollständig; **keine** geratene Bezeichnung; Hochalpin-Einschränkung ausgewiesen |
| **L5** | Alle vier Zeitmodi funktionieren; **Mess-/Prognose-Bruch sichtbar**; Auto-Advance stört das Scrubben nicht; tastaturbedienbar; `prefers-reduced-motion` respektiert |
| **L6** | Loop läuft flüssig (≥ 30 FPS Real-Device); Zugvektoren zeigen die Richtung, die die Frame-Folge zeigt (visuelle Kreuzprüfung); Speicher im Budget |
| **L7** | TIME-Extent korrekt gelesen; „letzte 15 Minuten" in der Legende; Parallaxe-Hinweis bei der Satellitenquelle; DE- und DACH-Quelle unterscheidbar |
| **L8** | POH/MESHS-Werte plausibel gegen ein reales Hagelereignis; **Saisonzustand** zeigt Saisonhinweis, nicht leere Fläche; AT zeigt „keine amtliche Quelle" |
| **L9** | Phasenanteil plausibel gegen die Schneefallgrenze (`snowline`) — sie widersprechen sich nicht; SNOWGRID-Alter (1 Tag) sichtbar |
| **L10/L11** | Messung und Prognose getrennt oder Vermischung ausdrücklich benannt; Zellattribute belegt, nicht geraten; **keine** Warnsprache (D-19) |
| **L12** | Regionen-Join `regionID` ↔ EAWS-Polygone korrekt; Bulletin-Gültigkeit sichtbar; verlinkt statt bewertet |
| **L13** | Presets laden die richtigen Layer; Permalink überlebt einen Preset; Dock bleibt auf Mobil bedienbar |

---

## 17. Was dieser Plan bewusst NICHT tut

- **D-14 wird nicht revidiert.** Der `nowcast`-Layer bleibt radar-only jetzt–2 h. Der neue
  Regenradar-Layer ist eine zusätzliche Ansicht, keine Rückkehr zur Modellverlängerung.
- **Kein Layer wird entfernt oder versteckt.** Funktionserhalt ist oberste Direktive.
- **Keine Shader-Änderung, keine Fusion-Änderung, keine Dependency.** `jsfive`, `bz2`, `bzip2-wasm`
  und `maplibre-gl` decken alles Geplante ab — D-06 (Near-Zero-Dependencies) bleibt unangetastet.
- **Kein Backend.** Alle geplanten Layer funktionieren client-seitig; die einzige Serverkomponente
  wäre ein Edge-Cache-Proxy für GeoSphere — dasselbe Muster wie `/_dwd_grib`, kein Zustands-Backend.
  D-01 bleibt gültig.
- **Keine Quelle mit API-Key, Freemium, proprietärem SDK oder restriktiven Bedingungen.**
  Blitzortung.org ist ausgeschlossen; ALDIS, Météorage und EUCLID sind kommerziell und bleiben außen
  vor.
- **Keine geratene Semantik.** `composite/hg/`, `vii/` und `dmax/` bleiben draußen, bis ihre
  Bedeutung amtlich belegt ist.

---

## 18. Nächste Schritte (konkret)

1. **Entscheidungen einholen** — `decisions.md` §O-09…O-14 (Reihenfolge, Zeitmodell,
   Gruppen/Presets, Speicherbudget, Edge-Proxy für GeoSphere, Umgang mit den Länder-Lücken).
2. **Die zwölf offenen Fragen klären** — `docs/DATA_SOURCES.md` §13. Zehn davon kosten je einen
   Request; zwei sind schriftliche Anfragen (EUMETSAT, EUMETNET) und sollten **sofort** rausgehen,
   weil sie Wartezeit haben.
3. **L0 starten** — Golden-Baseline und CORS-Protokoll. Das ist die einzige Arbeit, die ohne
   Entscheidung risikofrei beginnen kann.
4. **A10/V-80 (Warm-Budget) einplanen** — bevor L8 die ersten neuen Binärquellen dazustellt.
