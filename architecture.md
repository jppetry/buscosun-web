# architecture.md — buscosun: Repo-weite Architektur

> Stand: 2026-07-31, verifiziert am Code (letzter `src/`-Commit 2026-07-30).
> **Ergänzt 2026-08-05** um §13 (2D-Layer-Erweiterung) und Querverweise auf die neuen
> Fachspezifikationen unter `docs/`.
> Ersetzt die frühere Atmosphäre-P0-Skizze (in Git-Historie erhalten).
> Ergänzend: `decisions.md` (Warum), `roadmap.md` (Wohin), `docs/` (Fachspezifikationen).

## 1. Überblick

Reine Frontend-SPA, statisch auf Netlify deployt, **kein Backend**. Alle Wetterdaten werden client-seitig von offenen Quellen (DWD, GeoSphere, MeteoSwiss, Météo-France, ECMWF, NOAA u. a.) geholt, dekodiert und gerendert. Umfang: ~75.500 LOC in 367 Dateien unter `src/`.

- **Stack:** React 19, Vite 6, TypeScript 5.7, MapLibre GL 5.6. Runtime-Deps nur `maplibre-gl`, `react`, `react-dom`, `bz2`, `bzip2-wasm`, `jsfive`. Kein Router, keine State-/HTTP-/Chart-Bibliothek — alles handgeschrieben.
- **Nicht vorhanden** (Alt-Doku-Irrtümer): Three.js, WebLLM/`src/assistant`, Cloudflare R2/PMTiles, „AdaptiveQualityController".

## 2. App-Shell & Routing

`src/App.tsx` (142 LOC) ist ein handgerollter View-Switcher (`search | map | feature`), initialisiert **einmalig** aus `location.hash`. Alle Feature-Seiten sind `React.lazy`-Chunks, nur `SearchPage` eager.

- Hash-Permalinks: `#m=` (Karte: Ort + Layer-Bitmaske + Stunde, `src/mapState.ts`), `#atm=`/`#3d=` (Atmosphäre), `#h=` (Historie), `#g=` (Globus), `#ev=` (Event), `#val`, `#mobiletest`.
- **Lücken:** `#r=` (Radar, `src/radar/radarState.ts`) wird von App.tsx nie geprüft → Radar-Permalinks laufen ins Leere. Route, Vorhersage, Feedback haben keinen Hash. Kein `hashchange`-Listener, kein History-Eintrag pro View → Browser-Back navigiert nicht zwischen Features.
- `FeatureId` ist 12-breit: `route event dayflow forecast nowcast atmosphere history globe map2d feedback validation mobiletest` (`dayflow` ist toter Platzhalter).

## 3. 2D-Wetterkarte (Kern)

> **Vertiefung seit 2026-08-05:** `docs/MAP.md` (Renderpipeline, Datenfluss, State, Konfiguration,
> Caching, Fehlerbehandlung, Performance-Budgets) · `docs/LAYER_SYSTEM.md` (Layer-Vertrag,
> Verdrahtungsstellen, Z-Band-Modell, Zielbild Registry) · `docs/WEATHER.md` (fachlicher
> Layer-Katalog). Dieser Abschnitt bleibt die Kurzfassung.

`src/MapView.tsx` — **3.971 LOC, 26 useState, 56 useEffect, 64 useRef** (Stand 2026-07-31;
am 2026-08-05 als **4.173 LOC** gemessen) — ist das God-Object der App: besitzt die MapLibre-Instanz, alle 16 `LayerKey`s (`wind gust nowcast temp clouds sat lightning lightningfc stations confidence snowline flownowcast poprob thunder snow rotation`), Fetch-Orchestrierung, Zeit-Slider und das Command-Deck-UI. Größtes Einzelrisiko des Repos (s. §10).

**Layer-System — zwei Mechanismen:**
- **Custom-WebGL1-Layer** (MapLibre `CustomLayerInterface`): `scalar/ScalarLayer.ts` (Temp, Böen, Gewitter, LPI, Schnee, Rotation), `scalar/RainLayer.ts`, `scalar/CloudLayer.ts`, `scalar/ConfidenceLayer.ts`, `wind/WindLayer.ts`.
- **Native MapLibre-Layer:** Satellit (WMS), Blitze, Stationen, Schneefallgrenze, Länder-Maske.

Z-Ordnung wird imperativ via `addLayer(..., beforeId)` + `moveLayer()`-Sequenzen gepflegt (an ~3 Stellen nahezu identisch dupliziert — bekannte Regressionquelle). `src/countryMask.ts` invertiert DACH als Even-Odd-Loch-Polygon; Scalar-Shader lassen `DEPTH_TEST` mit `depthMask(false)` an, damit die später gezeichnete Maske sie clippt (dokumentierter, subtiler Kontrakt).

**ScalarLayer:** 128×64-Mesh, Mercator-Projektion im Vertex-Shader, Fragment sampelt Werte-Textur (R-Kanal) + 16×16-Farbrampen-LUT. Besonderheit: per-Pixel-DEM-Lapse-Refinement (G-Kanal = Zellmittel-Höhe; Shader rechnet auf Meereshöhe zurück und wendet 6,5 °C/km gegen ein fragment-gesampeltes DEM neu an) → kontinuierliche Tal/Grat-Gradienten statt 6-km-Treppen.

**WindLayer** (`src/wind/`, 1.546 LOC + Shader): GPU-Partikelsystem in webgl-wind-Tradition — Ping-Pong-Zustandstexturen, Advektions-Pass mit Respawn (`calm_boost`), Trail-/Fade-Framebuffer, Heatmap-Pass. `glUtil.ts` verhandelt Texturformat zur Laufzeit (half-float → float → RGBA8-Packing).

**FrameGovernor** (`src/wind/perfGovernor.ts`, 282 LOC, pur, headless-verifiziert): zweistufige adaptive Qualität. Stufe 1 statisches Tier (DPR/Kerne/`deviceMemory`/GPU-Regex), Stufe 2 EMA der Renderdauer mit Hysterese + Cooldown. FPS-Target-Modus (30/24/20) hält Partikelzahl geräteübergreifend konstant (Cross-Device-Parität); `trailLadder` (0,5×-Auflösung) ist letzter Hebel. Repaint pausiert bei `visibilitychange`/Offscreen.

**Niederschlags-Kompositing** (`src/scalar/precipComposite.ts` + `precipIndexMap.ts` + Worker): per-Land-Radar in **ein** lat/lon-Raster — DE→RADOLAN-RV (≤2 h), AT→INCA (≤3 h), CH→MeteoSwiss rzc (≤0,5 h). Zell→Quellgrid-Mapping einmal exakt vorberechnet (polar-stereographische Inverse für RADOLAN, Newton-Inverse bilinear sonst), pro Slider-Schritt nur Array-Gather. `src/nowcast/precipSource.ts` ist der pure Entscheidungspunkt der Quellwahl (Ansicht ist seit N1 **radar-only jetzt–2 h**, s. `decisions.md`).

## 4. Datenquellen (`src/sources` — 53 Dateien, ~8.700 LOC)

| Provider | Module (Auswahl) |
|---|---|
| DWD ICON-D2 (Arbeitspferd, 2,2 km) | Precip, Temp, Snow, Rotation (UH/SDI), Thunder (CAPE×CIN×LPI), LPI, Clouds, Gust, CAPE, EPS (ikosaedrisch), Wind |
| DWD sonstig | RADOLAN-RV (+Decoder+Worker), Radar, CAP-Alerts, Blitze (Sferics), Pollen, UV, Meteosat, ICON-EU (+Sounding), ICON-Global, AICON (KI-Modell) |
| GeoSphere (AT) | INCA (+Grid), AROME, TAWES-Stationen |
| MeteoSwiss (CH) | rzc-Radar, SMN-Stationen, ICON-CH1/CH2-EPS |
| Météo-France | AROME-France 0,01°, ARPEGE |
| ECMWF/NOAA | IFS, AIFS, AIFS-ENS, GFS (2D + Sounding) |
| Aggregatoren/Obs | BrightSky, Open-Meteo (opt-in, Rate-Limit), DACH-Stationsliste, DMI/IPMA/SMHI |

**GRIB-Decoding komplett client-seitig und handgeschrieben** (`sources/gribDecode.ts`): GDT 0 + 101 (ikosaedrisch), DRT 0/1 + **DRT 42 CCSDS-AEC** (JS-Port des libaec-Pfads), DOM-frei. **Historisch** in Node bit-genau gegen eccodes verifiziert (`scripts/verify-aec.mjs`, erstmals grün 2026-06) — die Golddaten liegen nicht im Repo, der Lauf ist rotiert, die Prüfung ist derzeit **nicht wiederholbar** (D-07, V-91; Erzeugungsanleitung im Skriptkopf). Dekompression in begrenztem Worker-Pool.

**Bekannte Fragilität:** DWD-Verzeichnislayout, RADOLAN-Header-Semantik, DE1200-Eckkoordinaten etc. sind reverse-engineerte Konstanten — brechen bei Upstream-Änderung still. ~10 `icon*`-Quellen duplizieren das Muster resolveLatestRun→fetch→bz2→decode→regrid.

## 5. Fusion-Engine (`src/fusion` — 23 Dateien, ~5.400 LOC)

v1 (produktiv): Quell-Samples mit Region×Variable-Gewichtsmatrix → IDW auf 160×128-DACH-Grid → Barnes-Glättung → Coverage-Maske → PNG-Texturen. Orchestrator `loadFusedForecast.ts` mit Quick-Mode-First-Paint und Result-Cache.

**v2 (flag-gated, default-off, produktiv inaktiv):** fünf gestaffelte Flags (`oi`, `incrementPersist`, `uncertainty`, `bgMinVar`, `bgOffDiag`); alles aus ⇒ byte-identisch zu v1. OI mit Cholesky/SOAR (`oi.ts`), Desroziers, CRPS, LOSO-Validierung. Cutover ist **vertagt, per-Variable geplant** (Entscheidung A, s. `decisions.md`); Trainings-Artefakt entsteht aus `fixtures/session-*.json` (stündliche Captures via Task Scheduler auf Jans PC — lokale Abhängigkeit!). Modell-Katalog (~25 Modelle) + purer `modelSource`-Reducer für den Per-Land-Modell-Switcher.

## 6. ML (`src/ml` — 22 Dateien, ~3.900 LOC)

Klassisch/klein, kein TF.js: Horn-Schunck-Optical-Flow-Nowcast (bewusst statt CNN — intensitätserhaltend), stochastisches Flow-Ensemble (ehrlicher PoP-Spread), Analog-Ensemble, Fourier-Klimatologie-Grid, MOS-Training, isotone Regression, kleine ConvNets (experimentell).

## 7. Punkt-Forecast (`src/pointForecast` — ~4.900 LOC)

Das Daten-Rückgrat (von 20+ Modulen importiert): lead-time-gewichteter Quellen-Blend, Höhenkorrektur (Lapse + Terrarium-DEM), Föhn-Detektor, Niederschlagsart via Schneefallgrenze, gefühlte Temperatur, UV, Warnungs-Abgleich. UI: `PointForecastPanel` in der MapView (dort auch Lawinen-Linktabelle `avalanche.ts` und Open-Meteo-Opt-in).

## 8. Feature-Verticals

| Vertical | LOC | Einstieg | Design | Bemerkung |
|---|---|---|---|---|
| Route (`src/route`) | ~8.800 | Kachel (kein Hash) | Command-Deck **+ Alt-Theme parallel** | GPX/FIT/KML…, Wetter zur echten Ankunftszeit, E-Bike-Akku; Ergebnis-Screen noch auf `tourTheme.css` |
| Historie (`src/history`) | ~6.200 | `#h=` | Command-Deck (+ Alt-CSS geladen) | ERA5 seit 1940, 12 Chart-Typen; beste A11y; 77-KB-Stationstabelle im Bundle |
| Event (`src/event`) | ~5.300 | `#ev=` | Command-Deck (+ tote `EventPage.css` importiert) | 3-Schritt-Wizard, Phasen-Scoring, Plan B, ICS; `EventResult.tsx` 88 KB = größte Komponente |
| Nowcast (`src/nowcast`) | ~5.100 | Kachel/Deck-Rail | Command-Deck | 0–2-h-Radar-Ansicht (radar-only seit N1), Blitz-Alerts, alpiner Tal/Grat-Split |
| Atmosphäre (`src/atmosphere`) | ~3.800 | `#atm=`, `#3d=` | Command-Deck | Linsen Höhenwind/Inversion/Go-No-Go + Föhn/Thermik/Isentropen; konsumiert `src/threed` als Bibliothek |
| Vorhersage (`src/confidence`) | ~3.600 | Kachel (kein Hash) | Command-Deck (+ Alt-CSS) | Multi-Modell-Spread, Konfidenz, Hit-Rate-Rückblick |
| 3D-Bibliothek (`src/threed`) | ~4.400 | — | — | `ThreeDPage.tsx` ist tot; Rest (Skew-T, Curtain, Sounding-Mathe) lebt via Atmosphäre |
| Globus (`src/globe`) | ~1.350 | `#g=` | **nicht** redesignt | MapLibre-Globe + GFS-Live-Wind (nullschool-Stil) |
| Validation (`src/validation`) | ~380 | `#val` | Alt-Chrome | Live-RADOLAN-Hindcast (Brier/BSS) |
| Astro/Photo (`src/astro`, `src/photo`) | ~800 | — | — | Reine Heuristik-Bibliotheken, nur von Event konsumiert |
| Notifications (`src/notifications`) | ~1.500 | nur aus EventResult | — | Trigger-Engine + Inbox lokal; **Push-Backend = NULL_BACKEND (unimplementiert)** |
| Feedback / QA / Intro / Mobile | klein | | | `mailto:`-Form; Dev-QA-Harness; Onboarding-Tour; BottomSheet/MobileToolbar-Primitives **ungenutzt** (MapView baut eigenes Sheet) |

**SearchPage** (`src/SearchPage.tsx`, 838 LOC): Landing mit Geocode-Suche (Nominatim, DACH-begrenzt), Bento-Grid, Command-Palette, Favoriten-Chips (Anlegen derzeit nirgends verdrahtet — Defekt, s. `roadmap.md`).

## 9. Design-System

`src/designTokens.css` (eager) = gemeinsame Basis: Sand/Cream-Flächen, Ink, semantische Farben (Sage/Terracotta/Amber/Steel/Violett), League Spartan/Space Grotesk/IBM Plex Mono — plus per-Feature-Token-Blöcke (`--evd-* --hd-* --rd-* --fd-* --vs-* --nc-*`). Die „Command-Deck"-Deck-CSS-Dateien (je 20–36 KB, Präfixe `.rd- .evd- .hd- .fcd- .vsd- .rr- .mdk-`) folgen demselben Muster, teilen aber **keine** gemeinsame Stylesheet-Abstraktion — Pattern ist kopiert. Alt-Stylesheets (~200 KB) werden teils weiterhin mitgeladen. Kein i18n (deutsche String-Literale inline, `Intl` fast ungenutzt); A11y sehr ungleich (Historie gut, Globus/Validation/Feedback quasi unausgezeichnet; kaum Keyboard-Navigation, kein Focus-Trap).

## 10. Transport, Deployment, Betrieb

- **Netlify:** Build `tsc -b && vite build && node scripts/generate-seo.mjs`; Rewrites `/_dwd_opendata/*`→opendata.dwd.de, `/_gfs/*`→NOAA-S3, SPA-Catch-all. **Keine Security-Header/CSP.**
- **Edge Functions** `netlify/edge-functions/dwd-{wind,grib}.ts`: Whitelist-Proxys (Präfix-, Extensions-, Traversal-, Methoden-Checks) mit `Netlify-CDN-Cache-Control: durable, max-age=21600, immutable`; Fehler → `no-store`. In Node importierbar → Byte-Identitäts-Verifier.
- **Warm-Crons** `.github/workflows/warm-{grib,wind}.yml` (15-min-Takt, 2 min versetzt): wärmen den Durable Cache über die Prod-URL, schreiben dann atomar `public/latest-{grib,wind}.json` und committen per shallow-sicherer Retry-Schleife auf `main` (Commit triggert Netlify-Rebuild). Bot hat 194 von 308 Commits.
- **⚠ Prod-Proxy-Lücke:** `/_mf` (AROME-FR/ARPEGE), `/_ecmwf` (IFS/AIFS), `/_cscs` (CH-EPS) existieren **nur** im Vite-Dev-Proxy — in Produktion antwortet die SPA-Shell. Diese Quellen sind prod-defekt (s. `roadmap.md` §A).
- **PWA:** handgeschriebener `public/sw.js` (network-first Navigation, cache-first Assets, FIFO-Cap), Web-Manifest + Icons.
- **SEO/GEO:** `scripts/generate-seo.mjs` erzeugt statische `/wetter/ /wissen/ /funktionen/ /wetterlage/`-Seiten, Sitemaps, RSS, JSON-LD; `public/llms.txt` + AI-Crawler-Allowlist in `robots.txt`; Log-Parser statt JS-Analytics (trackerfrei). **Domain-Inkonsistenz** buscosun.app (SEO) vs. buscosun.com (Betrieb).
- **Keine CI auf Push/PR** (nur Warm-Crons), keine Observability/Alerts (Warmer können still stehenbleiben), kein ESLint. Fusion-Captures (`fixtures/`) hängen am Task Scheduler von Jans PC.

## 11. Verifikationskultur

Kein Vitest/Jest (bewusst). **24** `scripts/verify-*.mjs` (+ 1 unter `scripts/seo/`) via `node --experimental-strip-types` importieren **echte** App-Module (`register-ts.mjs`-Resolve-Hook) — Abdeckung: Governor, OI/LOSO/Desroziers, alle Modellquellen, Transport-Byte-Identität (2D + Wind), Feature-Layer (Thunder/Schnee/Rotation/…), Datenalter, SEO-HTML-Gate. **Nicht laufend abgesichert:** GRIB/AEC gegen eccodes (D-07 — historisch, Golddaten nicht im Repo). **76 `verify()`-Exporte in 69 `src`-Modulen**, davon aber nur **8** an einem npm-Skript — der Rest läuft nur per Dev-Konsole und liefert keinen Regressionsschutz (V-95). **Ungetestet:** React-Komponenten, Hooks, Routing, Service Worker, WebGL-Rendering (nur manuell via MCP), A11y, die Warm-Skripte selbst.

## 12. Größen-Hotspots (Top-Risiken für parallele Arbeit)

`MapView.tsx` 3.971 LOC · `EventResult.tsx` 1.663 · `WindLayer.ts` 1.546 · `meteostatStations.ts` 1.192 · `HistoryPage.tsx` 1.023. Die fünf 1.000+-LOC-Dateien halten ~12 % des Codes — Änderungen dort nie parallel durch mehrere Agenten (s. `agents.md`).

## 13. 2D-Layer-Erweiterung (Analyse 2026-08-05 — Konzept, nicht umgesetzt)

Analyse- und Planungsergebnis für die Erweiterung der 2D-Karte um neun weitere meteorologische
Layer (Regenradar, Niederschlagszuglinien, Hagel, Gewitterzellen, Blitzaktivität, Schneefall,
Wetterwarnungen, Unwetterwarnungen, Lawinen) plus Ausbaustufen (Europa-Radar, Satellit HD,
Waldbrand, Pollen/UV/Luftqualität).

**Vollständige Dokumente:** `docs/DATA_SOURCES.md` (Quellenbewertung, 24 Kriterien je Quelle) ·
`docs/LAYER_SYSTEM.md` · `docs/MAP.md` · `docs/WEATHER.md` · `docs/API.md` ·
`docs/2d-layer-erweiterung.md` (Integrationskonzept + Umsetzungsplan L0–L15) ·
**`docs/zuglinien-radar-spec.md`** (umsetzungsreife Spezifikation der Phasen **L5 + L6**:
Zeitmodell, Playback, Regenradar-Rückblick, Niederschlagszuglinien).
**Entscheidungsvorlagen:** `decisions.md` §O-09…O-19. **Verbesserungen:** `improvements.md`
V-134…V-147.

### 13.1 Kernbefunde der Ist-Analyse

- **Ein `LayerKey` ist an neun Stellen verdrahtet**, zwei davon byte-identisch dupliziert —
  **korrigierte Fundstelle (Zeilenvergleich 2026-08-05): `MapView.tsx:1103-1149` / `:2813-2859`,
  47 Zeilen**. Neun neue Layer bedeuten in der Bestandsstruktur ~81 Änderungsstellen in der
  Sperrzone.
- **`src/mapState.ts` `LAYER_ORDER` listet nur 12 der 16 Keys** — `thunder`, `lightningfc`, `snow`
  und `rotation` sind **nicht permalink-fähig** (V-134).
- Die **Zeitachse** (`sliderMax = max(...)`) trägt keine heterogenen Zeitmodelle: die neuen Layer
  reichen von „−14 Tage" (MeteoSchweiz-Hagelarchiv) über „Gültigkeitsintervall" (Warnungen) bis
  „gestern" (SNOWGRID).
- **`precipComposite.ts` ist auf vier Quellen hart verdrahtet** (je vier `ensureXxx`/`primeXxx`);
  Hagel und Schneefall-Phase brauchen dieselbe Mehrländer-Zusammenführung (V-137).
- Renderpipeline, Warp-Mesh, LUT-Farbgebung, Worker-Muster, Cache-Ebenen und `FrameGovernor` sind
  **quellenunabhängig gebaut und tragen die Erweiterung ohne Umbau**.

### 13.2 Zielbild

Ein Layer wird zu **einem Deskriptor plus einem Loader-Modul**; ein einziger Applier stellt
Existenz, Sichtbarkeit und Z-Ordnung her:

```
src/map/layerRegistry.ts    WeatherLayerDescriptor[] — rein, DOM-frei, headless verifizierbar
src/map/layerApplier.ts     die EINE Stelle, die MapLibre für Layer anfasst
src/map/layerTime.ts        vier Zeitmodi: instant | window | forecast | valid-interval
src/map/frameBudget.ts      globaler LRU-Frame-Puffer, an das FrameGovernor-Tier gekoppelt
src/map/layerLoaders/*      je Layer ein Lazy-Loader
```

Das ist zugleich **Schritt 1 des Zerlegungsplans aus `decisions.md` O-04 (V-38)** — die Erweiterung
finanziert eine ohnehin geplante Strukturverbesserung.

**Z-Band-Modell statt `moveLayer`-Ketten** (heute 17×): `basemap · satellite · field · precip ·
mask · veil · vector · points · particles`. Alle neuen Layer fügen sich in **bestehende** Bänder ein
— es entsteht kein neues Band.

### 13.3 Quellenlage (Kurzfassung)

| Layer | DE | AT | CH | DACH |
|---|---|---|---|---|
| Regenradar | RADOLAN-RY/RV | INCA (**Analyse**, nicht Radar) | rzc | (OPERA) |
| Zuglinien | RV 25 Frames + **eigener** Optical Flow (RV führt **kein** Bewegungsfeld ✅ 2026-08-05) | INCA, **11–12 variable Leads, keine Analyse** | — Lücke | — |
| Zellbahnen | **KONRAD3D** ✅ Schema belegt (ID, Umriss, `cell_speed`, 12 Prognosepunkte **mit amtlicher Unsicherheitsellipse**, Hagel-/Böen-Flag) | — Lücke | — Lücke | — |
| Hagel | RADVOR-RE **Bit 13 „Hagelflag"** | — **Lücke** | **POH + MESHS** | — |
| Gewitterzellen | `dwd:NCEW_EU` → KONRAD3D | — Lücke | — Lücke | (MSG RDT) |
| Blitz | **`dwd:Blitzdichte`** (TIME `PT5M`, 13 Mon.) | — Lücke | — Lücke | **MTG-LI `li_afa`** |
| Schneefall | RE (Phasenanteil) | SNOWGRID (täglich) | SMN/SLF | — |
| Warnungen | **WFS `dwd:Warnungen_Gemeinden`** | **GeoSphere `getWarnstatus`** | — **Lücke** | (MeteoAlarm) |
| Lawinen | (DE-BY via EAWS) | ALBINA/EAWS | **SLF** | EAWS |

Alle empfohlenen Quellen sind **amtlich, kostenlos, ohne API-Key und ohne Registrierung**.
Ausgeschlossen: Blitzortung.org (kommerzielle Nutzung untersagt), ALDIS/Météorage/EUCLID
(kommerziell), RainViewer (Abkündigung), MeteoSwiss-App-Backend (undokumentiert, ohne Lizenz).

**Vier auszuweisende Länder-Lücken (D-04):** AT ohne offenes Radar · AT+CH ohne offene Blitzdaten ·
AT ohne Hagelprodukt · CH ohne offene Warnungen und ohne offenen Nowcast.

### 13.4 Transport-Konsequenzen

- `opendata.dwd.de` sendet **kein CORS** → RE läuft über den bestehenden `/_dwd_opendata`-Rewrite.
- `maps.dwd.de`, `data.geo.admin.ch`, `warnungen.zamg.at`, `view.eumetsat.int` sind (nach heutigem
  Kenntnisstand) direkt erreichbar.
- **GeoSphere begrenzt auf 5 req/s und 240 req/h pro IP** → Edge-Proxy mit Durable Cache ist Pflicht,
  nicht Optimierung. **STOPP & FRAGEN** (Edge-/Transport-Zone).
- **Warn-Layer dürfen nicht durable gecacht werden** — DWD verlangt „vollständig und unverzüglich",
  MeteoSchweiz „unverzüglich und inhaltlich unverändert".

### 13.5 Umsetzungsreihenfolge (Vorschlag)

`L0` Golden-Baseline + CORS-Protokoll → `L1` Registry → `L2` Applier → `L3` Warnungen DE →
`L4` Warnungen AT (entblockt V-24/V-133) → `L5` Zeitmodell + Playback → `L6` Regenradar + Zuglinien →
`L7` Blitz → `L8` Hagel → `L9` Schneefall → `L10/L11` Gewitterzellen → `L12` Lawinen →
`L13` Gruppen/Presets. Ausbaustufen: `L14` OPERA, `L15` CAMS/EFFIS.

**Aufwand Kernumfang L0–L13: ca. 37–62 Personentage.** Kritischer Pfad L0 → L1 → L2.

**Nicht angetastet:** D-14 (Niederschlag radar-only jetzt–2 h) wird nicht revidiert · WebGL1-Basis
und RGBA8-Pfad (D-08) · `FrameGovernor` als einziger Performance-Hebel (D-09) · Fusions-Engine ·
D-06 (keine neue Runtime-Abhängigkeit) · D-01 (kein Zustands-Backend).

## 14. Waldbrand DACH (Analyse 2026-08-14 — Konzept, nicht umgesetzt)

Ergebnis der Datenquellen- und Architekturanalyse für die geplante Kachel **„Waldbrand DACH"**
(Feature-Id `fire`) — eine eigene Kartenansicht im Aufbau der 2D-Wetterkarte mit umschaltbaren
Layern und gemeinsamem Zeitregler. **Kein Code geschrieben.** Vollständige Quellenmatrix:
`docs/DATA_SOURCES.md` §W. Umsetzungsplan: `plan.md` §Phase WB. Gates: `checklist.md` §GWB0–GWB5.
Kickoff: `prompt-waldbrand-dach.md`.

### 14.1 Warum eine eigene Kartenansicht statt neuer Layer in `MapView.tsx`

`MapView.tsx` ist auf **5.723 LOC / 19 `LayerKey`s / 10 Verdrahtungsstellen** gewachsen; die
Sichtbarkeits- und Z-Ordnungs-Logik existiert dort **zweimal byte-identisch** (`:1831-1904` ≡
`:4062-4135`, 74 Zeilen — gemessen 2026-08-14, die Angabe „47 Zeilen bei `:1103`/`:2813`" in
`docs/LAYER_SYSTEM.md` ist veraltet). Sechs weitere Waldbrand-Layer dort einzuhängen bedeutet
~60 Änderungsstellen in der Sperrzone.

Der Präzedenzfall im Repo ist eindeutig: **`src/nowcast/NowcastRadarMap.tsx` + `src/radar/RadarMap.tsx`**
fahren eine **eigene MapLibre-Instanz**, einen **eigenen Layer-Id-Typ** (`RadarLayerId`,
`radarModel.ts:296`), **eigene Presets** (`RADAR_PRESETS:320-324`) und eine **eigene Playback-Engine**
(`NowcastRadarMap.tsx:269-279`) — und importieren aus der Wetterkarte nur die *Renderprimitive*.
Keine der sieben Nebenkarten im Repo (`RadarMap`, `RouteMap`, `GlobeMap`, `TerrainMap`, `ThermalMap`,
`MapPicker`, `HeroMapBackground`) importiert `MapView`, `LayerKey` oder `mapState`.

**Waldbrand folgt diesem Muster.** Das ist zugleich der einzige Weg, der `MapView.tsx` nicht anfasst
und damit weder GL0-Baseline noch die laufenden Phasen L5/L6 blockiert.

> **Vorbedingung (V-190):** `LayerIcon.tsx:7` und `LayerInfoPanel.tsx:14` importieren `LayerKey`
> **aus `MapView.tsx`**. Wer sie wiederverwendet, zieht die 316-KB-Datei in den Waldbrand-Chunk.
> Der Typ muss vorher nach `src/map/layerTypes.ts` gehoben werden — reine Verschiebung, byte-gleich
> im Verhalten, eigener Verifier.

### 14.2 Datenfluss je Layer-Typ

Es gibt im Repo **genau zwei** Ingest-Wege, und **keine** Vorverarbeitung von Kacheln oder Bildern —
kein R2, kein PMTiles, kein Netlify Blobs, kein `sharp`, kein Tile-Skript (repo-weit gegengeprüft an
`package.json` und Grep). Jedes Byte wird im Browser dekodiert. Waldbrand ändert daran nichts.

| Layer-Typ | Beispiel | Weg | Renderprimitiv | Cache |
|---|---|---|---|---|
| **WMS-Raster (fremd)** | EFFIS/GWIS `ecmwf.fwi`, EDO `smian`, CLC2018 | MapLibre `raster`-Source direkt gegen den Fremd-WMS — **nur wenn CORS** (L0-Probe, s. 14.4) | native MapLibre | Browser-HTTP-Cache |
| **GeoJSON-Punkte** | **GWIS** `ms:viirs.hs.today`/`.week` (Hotspots) via WFS | `fetch` → `geojson`-Source | `circle`/`symbol` | In-Memory-TTL wie `dwdCapAlerts.ts:62` |
| **GeoJSON-Polygone** | BAFU Gefahrenstufen + Feuerverbote | `fetch` → `geojson`-Source, Farbe **aus `level` abgeleitet** (die Features tragen kein `color`) | `fill` + `line` | In-Memory-TTL, **kein Durable-Cache** |
| **Stationspunkte + Fläche** | DWD WBI/GLFI (**484 CSV.gz, eine je Station**, + `stations_list.txt` mit den Koordinaten) | `stations_list.txt` einmal je Sitzung → Punkte; Werte sichtfeldabhängig und gedeckelt nach; Fläche **eigene Interpolation** | `circle` + optional `ScalarLayer` | In-Memory, Tages-TTL |

> **An der Messung korrigiert (Phase WB0, 2026-08-14** — Diagnose `audit/waldbrand-transport.md`,
> Einträge `V-198`…`V-201`): Der **EFFIS**-WFS liefert für `ms:viirs.hs` einen bei Oktober 2021
> eingefrorenen Archivstand; live ist der **GWIS**-Zweig mit den Fensterlayern `.today`/`.week`,
> dort allerdings nur mit `id, acq_at, CLASS` — **`frp` gibt es live nicht**. Die BAFU-Features
> führen `region_id, canton, level, name_*, title_*, valid_from` und **kein `color`**, die Farbe ist
> deshalb unsere Zutat (`colorOrigin: 'derived'`, Muster `warnField.ts:79`); `valid_from` ist die
> Referenzzeit für `dataAge`. Der DWD-Index kommt als **484 Einzeldateien** plus einer Stationsliste,
> die `docs/DATA_SOURCES.md` §W.1 ursprünglich nicht kannte.
| **ICON-D2-Raster (eigen)** | `relhum_2m` (neu), `t_2m`/`vmax_10m`/`tot_prec` (bestehend) | Manifest → `/_dwd_grib` Edge Function → bz2-Worker → GRIB-Worker → Wertetextur | **`ScalarLayer`** (R=Wert, A=Maske, G=Höhe, 16×16-LUT) | Edge durable 6 h |

**`ScalarLayer` trägt die Waldbrand-Felder unverändert** (`src/scalar/ScalarLayer.ts:126-311`):
128×64-Mesh, Mercator im Vertex-Shader, LUT-Farbgebung, `visRange`-Smoothstep, `zoomAttenuation`.
Zwei Kontrakte bleiben unangetastet: `DEPTH_TEST` an mit `depthMask(false)` (`:266-267`, sonst läuft
der Layer über die Landesmaske hinaus) und `raw.a < 0.05 → discard` als Verfügbarkeitsmaske (`:72`).

### 14.3 Zeitmodell

Die neuen Layer haben **fünf** verschiedene Zeitsemantiken — mehr als jede bisherige Phase:

| Layer | Zeitmodell | Reichweite |
|---|---|---|
| EFFIS/GWIS FWI | `forecast`, Tagesschritte | +1…+9 Tage (ECMWF), WMS-`TIME`-Dimension `2018-01-01/2099-12-31` |
| DWD WBI/GLFI | `forecast`, Tagesschritte | Tag 0…+6, Spalten `wbi_0`…`wbi_6` |
| BAFU CH-Stufe | `instant` | ein Zeitpunkt, **Mo–Fr nach Mittag** |
| Hotspots | `window` | rückwärts 24 h / 7 d |
| ICON-D2-Treiber | `forecast`, Stundenschritte | 0…+24 h |

Ein **gemeinsamer Zeitregler** braucht deshalb genau das, was `docs/2d-layer-erweiterung.md` als
`src/map/layerTime.ts` plant und was **heute nicht existiert** (`src/map/` enthält nur `deckIcons`,
`mapDeck.css`, `ModelLibraryOverlay`, `ModelSwitcher`, `SevenDayForecast`). In `MapView.tsx` steckt
die Zeitlogik verstreut im Sichtbarkeits-Record (`cells` ≤ 60 min, `hail` nur `=== 0`).

**Entscheidung für Waldbrand: eigener, kleiner Zeitregler in Tagesschritten** (`fireTime.ts`, pur,
headless verifizierbar), **nicht** die Generalisierung von `layerTime.ts` vorwegnehmen. Begründung:
Waldbrand ist zu 80 % ein **Tages**-Produkt; L5 baut das Stundenmodell für die Wetterkarte. Zwei
kleine Zeitmodelle sind billiger und risikoärmer als eine geteilte Abstraktion, die L5 blockiert.
Der Zusammenführung steht später nichts im Weg (V-193).

### 14.4 Transport und CORS

- **`opendata.dwd.de` sendet kein CORS** → WBI/GLFI-CSV läuft über den **bestehenden**
  `/_dwd_opendata`-Rewrite (`netlify.toml:27-31`). Kein neuer Rewrite, keine STOPP-Zone.
- **`relhum_2m`** läuft über die **bestehende** Edge Function `/_dwd_grib` — deren
  `ALLOWED_PREFIXES` (`dwd-grib.ts:32`) deckt `weather/nwp/icon-d2/grib/` bereits ab. **Aber:** der
  Warm-Cron müsste den Parameter aufnehmen → `scripts/warm-grib.mjs` + Manifest → **STOPP & FRAGEN
  (Jan)**, plus Warm-Budget (heute 90,8 MB/Lauf, `warm-grib.mjs:94-101`).
- **`data.geo.admin.ch` ist direkt erreichbar** — im Repo bereits produktiv genutzt
  (`src/sources/meteoSwissHail.ts`). CH-GeoJSON braucht keinen Proxy.
- **`maps.effis.emergency.copernicus.eu`, `drought.emergency.copernicus.eu`,
  `image.discomap.eea.europa.eu`, `bio.discomap.eea.europa.eu`: CORS unbestätigt.** MapLibre lädt
  Raster-Kacheln als WebGL-Texturen und braucht dafür `Access-Control-Allow-Origin`. **Das ist der
  einzige echte Blocker des Gesamtkonzepts** und deshalb Inhalt von Gate **GWB0**
  (`scripts/l0/probe-cors.mjs` erweitern). Fällt CORS aus, braucht es einen Rewrite → STOPP-Zone.
- **Fair Use `geo.admin.ch`:** „maximum number of requests per time unit"; Web-Anwendungen mit
  ⌀ 20.000 Nutzern/Tag gelten als Fair Use. Bei D-01 (client-only) trifft das den Client → **ein
  Abruf je Sitzung, In-Memory-TTL ≥ 1 h, kein Polling.**

### 14.5 Wiederverwendung aus der Wetterkarte

**1:1 übernehmbar:** `ScalarLayer`/`RainLayer`/`CloudLayer` · `FrameGovernor`
(`wind/perfGovernor.ts:164`) · GRIB-Kette (`gribManifest.ts`, `gribDecode.ts`, `gribGridWorker.ts`,
Edge Function) · `frameAtValidTime.ts` · `dataAge.ts` (`DataRef`, `dataAgeText`, `isStale`,
`oldestRef`) · `manifestHealth.ts` · `countryMask.ts` · `LayerInfoPanel`-Komponente (nicht die
`LAYER_INFO`-Tabelle) · Feature-Routing (`App.tsx:15-28`, eine Zeile) · `featureRail.tsx`.

**Als Muster kopieren, nicht importieren:** die Auswahl-Kaskade `overrides ?? perCountry ?? global`
aus `fusion/modelSource.ts:123-155` (für die Index-Quelle je Land) und die **quellenreine
Stufentrennung** aus `warnings/warnField.ts:65-109` (`WarnSourceKey`/`WARN_SOURCE_DE`/`WARN_SOURCE_CH`)
— letzteres ist das entscheidende Vorbild, weil dort schon einmal gelöst wurde, dass
„DWD-Stufe 1 = gelb, Schweizer Stufe 1 = grün" (`LayerInfoPanel.tsx:134-138`).

**Einstiegspunkte (Entscheidung Jan, 2026-08-14).** Waldbrand bekommt eine **10. Bento-Kachel** auf
der Startseite **und** einen **10. Eintrag in der geteilten Werkzeug-Rail**. Beides ist teurer als es
klingt: Eine Kachel ist sieben Verdrahtungsstellen (`App.tsx` `FeatureId` · `SearchPage.tsx`
`FEATURE` · `PALETTE` · Bento-Grid · der **hartcodierte** Zähler `09 WERKZEUGE` bei `:539` ·
Kategorie-Zuordnung · `featureRail.tsx` `RailFeature` + `FEATURE_RAIL_ITEMS`), und
`FEATURE_RAIL_ITEMS` wird von **allen** Command-Decks gerendert — ein zehntes Icon ändert die
Rail-Höhe in Route, Event, Radar, Konfidenz, Historie und Atmosphäre mit. Das Bento-Raster wurde in
Phase SA1 handkuratiert. Beide Stellen brauchen deshalb einen Screenshot-Abgleich gegen die Baseline
(`tests.md` §V-WALDBRAND, T1-7…T1-13), nicht nur einen Listeneintrag.

**Nicht wiederverwendbar (bewusst):** `LayerKey`-Union, `LAYER_INFO`, `LAYER_ORDER`-Bitmaske,
Sichtbarkeits-Applier, `sliderMax`-Logik. Waldbrand bekommt eigene, gleichnamige Strukturen unter
`src/fire/` und einen eigenen Hash-Präfix `#wb=` analog `#m=`/`#g=`/`#ev=`.

### 14.6 Was das Konzept nicht antastet

D-01 (kein Backend) · D-06 (keine neue Runtime-Dependency — **kein NetCDF-/GeoTIFF-Decoder im MVP**)
· D-08 (WebGL1/RGBA8) · D-09 (`FrameGovernor` als einziger Perf-Hebel) · D-14 (Niederschlag
radar-only) · Fusions-Engine · `MapView.tsx` · Edge Functions (außer dem Warm-Parameter, s. 14.4).

### 14.7 Footprint-Modell und Brandflächen-Panel (BP0–BP4, 2026-08-17 — umgesetzt, Gate GBP1, uncommitted)

> Der Kopf von §14 („Konzept, nicht umgesetzt") ist überholt: die Waldbrand-Linie WB0–WB5, WBU1, F0–F2,
> E0–E3, GWBA1, GWT1, GWW1, BA3, BC1, BF3/BF4 ist gebaut (Belege in `audit/waldbrand-*.md`,
> `audit/brandflaechen-echtzeit.md`), aber **uncommitted**. Dieser Abschnitt beschreibt den nächsten
> Schritt; Diagnose mit Datei:Zeile und Gate-Protokoll: `audit/brandflaechen-panel.md` (§9). Gebaut:
> `src/fire/footprint/fireRegistry.ts` (Registry), `src/fire/FireFootprintPanel.tsx` (Panel),
> `src/fire/footprint/places.ts` + `public/fire/places-dach.json` (Ortsverzeichnis GeoNames),
> Layer `fireFootprints` in `fireModel.ts`/`FireMap.tsx`.

**Drei Quellen, ein Record.** Die Brandflächen-Ansicht kennt drei Geometrie-Herkünfte, die derselbe
Brand haben kann: (1) **Live** aus FIRMS-Detektionen — Detektionsraster (`fireZones.ts`) und konvexe
Cluster-Hülle (`fireClusters.ts`), beides Obergrenzen der Messung, keine Brandfläche; (2) **amtlich
kartiert** — EFFIS `ms:modis.ba.poly.season/.week` (`euContext.ts`) und, wo vorhanden, die
Copernicus-EMS-Delineation; (3) **eigene Kartierung** — Sentinel-2-dNBR-Polygone aus dem
Batch-Modul (`konzept-brandflaechen-modul.md`, geplant). `src/fire/footprint/reconcile.ts` ist die
**eine** Stelle, die sie verknüpft (räumlich beidseitig, ±14 d) — sie wird um die weiteren Stufen
erweitert, nicht dupliziert. Vorrang der gezeichneten Geometrie: EMS > EFFIS > eigene Kartierung >
Raster > Hülle; **nie zwei zugleich** (BF3-Zusicherung, im Verifier). Eine geplante Registry
(`footprint/fireRegistry.ts`, pur) gibt jedem Brand eine **überflugstabile ID** (Anker = älteste
Detektion; `effis:<id>`, `ems:<code>`, `ba:<event_id>`), verfolgt Merge/Split innerhalb der Sitzung
und liefert das `FireRecord`-Schema für das Panel. Mehrere Cluster in derselben Kartierung sind
**ein** Eintrag (`mergeClusters`) — die Kartierung ist die Beobachtung mit der größeren Reichweite.

**Datenweg — bewusst zweigeteilt.** Live-Footprints und EFFIS-Flächen bleiben **clientseitig**
(0 zusätzliche Requests, Worker gemessen 73–167 ms; EFFIS-Saison gemessen 1,58 MB / 303 Features /
52 k Stützpunkte). Die eigene Sentinel-2-Detektion ist **nur als Batch in GitHub Actions** möglich —
der COG-Bucket sendet kein CORS, die Bandfenster brauchen 16 Range-Reads mit 0,1–0,9 s Latenz je
Ereignis — und liefert **statisches GeoJSON nach `public/fire/ba/` per Commit-back** (Muster
`warm-wind.yml`, D-20). **Es gibt im Repo weiterhin kein R2, kein PMTiles, kein Netlify Blobs**
(§14.2 gilt); ein neuer Speicherweg wäre eine STOPP-&-FRAGEN-Entscheidung, ebenso der neue Cron und
eine Python-Toolchain im Runner. GeoJSON trägt bis ~3–5 MB / ~150 k Stützpunkte; PMTiles wäre auch
ohne Objektspeicher (Netlify liefert Range) später möglich, bräuchte aber eine Bundle-Bibliothek (D-06).

**Panel.** Ein neuer `FireLayerId` `fireFootprints` (Bit 12, **angehängt**; Z-Band 78 zwischen Wind und
Hotspots) trägt die Polygone; das Panel selbst ist ein **absolutes Overlay am linken Rand von
`.fire-center`** (keine vierte Flex-Spalte — sonst 552 px Karte bei 1440 px und ein
`trackResize`-Reallokieren der Custom-Layer bei jedem Auf-/Zuklappen), mobil ein drittes Segment der
Readout-Tabs im Bottom-Sheet. Hover/Auswahl laufen als **Filter auf eigenen Line-Layern** (kein
`feature-state`), die BC1-Auswahl wird nicht verallgemeinert, sondern parallel geführt (gegenseitiger
Ausschluss). Zeitmodell: keines neu — Detektionsseite `time.windowH`, EFFIS-Seite `HISTORY_DAYS`.

### 14.8 Aktiv-Feuer: Überflüge, Intensität, Dynamik, Beobachtung, Merkmalsschema, Flächenschätzung (AF0–AF4, 2026-08-18 — umgesetzt, Gates GAF1–GAF4, uncommitted)

Die Aktiv-Feuer-Linie (`konzept-aktivfeuer-modul.md`) läuft **nicht** als Python-Batch mit Objektspeicher,
sondern als reine TypeScript-Erweiterung der Brand-Registry im Client (Diagnose `audit/aktivfeuer.md`,
Entscheidungen §10). Ordner `src/fire/activity/`: `overpasses.ts` ist die **eine** Überflug-Regel des
Projekts (10 min je Satellit; `fireEvents.ts` und `fireClusters.ts` importieren `groupPasses`, die
Registry `mergePasses`), `intensity.ts` liefert `frpLastPassMw`/`frpMaxPassMw` und FRE (Trapez über die
Überflüge, nur bei ≥ 3 Detektionen über ≥ 2 Überflüge, sonst `null` = „nicht bestimmbar"), `fireActivity.ts`
komponiert das additive Feld `FireRecord.activity` (AF4 `areaEst` angelegt und `null`). **AF2:**
`dynamics.ts` liefert die Tendenz (`growing` nur bei ΣFRP-Anstieg > 30 % **und** Randwachstum über eine
Pixelbreite hinaus, verglichen über die letzten drei Überflüge derselben Tageshälfte; `declining` erst über
zwei Rückgänge; sonst `stable`/`null` mit Grund), die Ausbreitungsrichtung (FRP-gewichteter Schwerpunkt,
≥ 3 Überflüge, ≥ 200 m) und das Windflag (`agree`/`disagree`/`null` gegen ICON-D2 „wohin"; nur wenn
`fireWind` geladen ist und ein Frame ±3 h um den Überflug liegt — Sampler `src/wind/windPointSample.ts`,
von `src/qa/layerSampler.ts` re-exportiert). `observation.ts` qualifiziert jedes „kein Signal": Index
über die angezeigten FIRMS-Zeilen (1°-Zellen, je Zelle nach Überflug gruppiert, globale Erst-/Letztzeit je
Überflug); ein Überflug > 10 min nach der letzten Detektion mit Detektionen im Umkreis von 150 km ⇒
`confirmed` („Sicht in der Region gegeben"), sonst `unobserved` — beides als grober Proxy beschriftet,
DWD-Bewölkung bewusst nicht angeschlossen (nur Vorhersage-Frames). Die Registry nimmt beides über optionale
Callbacks (`RegistryInput.observationAt`/`windAt`) entgegen; `FireEvent.trend` (Zählregel) bleibt eine
andere Größe und heißt anders. **AF3:** `features.ts` fixiert das versionierte Merkmalsschema
`FireFeatures` (v1, 28 Schlüssel, `docs/aktivfeuer-merkmale.md`) und ist mit `featuresOf(record, asOfMs)`
die EINE Referenzimplementierung für Client (Detailkarte, „JSON kopieren") und späteren BA-Batch (Node
strip-types importiert dieselbe Datei). `coverageHa` = Detektionsraster (keine Brandfläche),
`effisMappedHa` = Referenz, das Ziel (`FireLabelTarget`, `isEligiblePair`: mapped/final ∧ Trennbarkeit
≥ 1,5 ∧ nicht ortsfest) kommt ausschließlich aus der BA-Linie. Persistenz ist benannt (Watchlist-Feld
`features`, eingefroren bei `t_end + 7 d`), nicht betrieben — kein Cron, kein Speicher. **AF4:** statt auf
die BA-Linie zu warten, kommen die Labelpaare aus dem **Archiv** (Jans Entscheidung 2026-08-18):
`scripts/fire/pairs-from-archive.mjs` verschneidet je Jahr die EFFIS-Kartierungen (`ms:modis.ba.poly.{Y}`,
DACH; seit 2020/21 Sentinel-2-gestützt bis 0–2 ha) mit den VIIRS-Detektionen aus dem FIRMS-Archiv
(`VIIRS_SNPP_SP`/`VIIRS_NOAA20_SP`, 5-Tage-Chunks, `type ≠ 0` verworfen) — mit **denselben** Modulen wie
der Client (Cluster → Zonen → Abgleich → Registry → `featuresOf`) — und schreibt `FireLabelPair`-JSONL
(`target.source = 'effis-rda'`); der FIRMS-Schlüssel bleibt lokal (Env/gitignored Datei), der Prod-Proxy
NRT-only. `scripts/fire/calibrate.mjs` fittet mit `src/fire/activity/calibration.ts` (log-log-OLS,
80-%-Prädiktionsintervall, Leave-one-out; kein Fit < 25 Paare) die Modelle `fre` (x = FRE) und `det`
(x = Detektionen) → `public/fire/af/area-estimate-v1.json` (statisch, Commit von Hand). Der Client lädt die
Datei lazy (`estimate.ts`, `loadAreaModel`) und füllt über `RegistryInput.estimateFor` das Feld
`activity.areaEst` — nur innerhalb des Prädiktorbereichs, nie ohne Intervall, Kartierung geht vor;
Panelzeile „Flächenschätzung", Kill-Switch `?afEst=0` / `localStorage.afEst = '0'`. Schema-Doku
`docs/aktivfeuer-merkmale.md` §7. Namensregel: `frpSumMw` bleibt die Fenstersumme (BC1-Sortierung),
`FireCluster.maxFrp` das stärkste Einzelpixel — Überfluggrößen tragen eigene Namen. Keine Biomasse,
kein eigener Cron; Persistenz (Labelpaare, Verlauf > Fenster, Kalibriermodell) kommt erst mit dem
BA-Batch. Verifier `verify:fire-activity`.
