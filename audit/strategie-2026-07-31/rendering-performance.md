# Rendering & Performance — Strategie-Deep-Dive (2026-07-31)

> Rolle: **Rendering & Performance** (`agents.md` §2). Handlungsfelder `roadmap.md` §B **1 (Wettervisualisierung)**, **3 (Performance)**, **12 (Wartbarkeit / MapView-Zerlegung, O-04)**.
> Alle Aussagen sind am Code des Working-Trees (Stand 2026-07-31) verifiziert und mit `Datei:Zeile` belegt. Wo nur eine Messung fehlt, steht das explizit dabei.
> **Nicht ausgeführt:** Builds, Tests, Dev-Server, `npm`, Git-Änderungen. Es wurde ausschließlich gelesen (inkl. des bereits vorhandenen `dist/`-Builds vom 2026-07-21) und diese eine Datei geschrieben.

---

## 1. Auftrag & Abgrenzung

**Auftrag:** Ist-Stand der Render- und Ladepfade belegen, ein messbares Performance-Budget vorschlagen, den MapView-Zerlegungsplan (O-04 / V-14) so konkret liefern, dass ein Implementierungs-Agent ihn ohne Rückfragen abarbeiten kann, und die Visualisierungs-Zukunft (WebGL2/WebGPU, Referenzoptik, Globus) ehrlich bewerten.

**In meinem Bereich:** `src/MapView.tsx`, `src/wind/*`, `src/scalar/*`, `src/map/*`, `src/globe/*`, `src/threed/*` (nur als Bibliothek), `src/mapState.ts`, `src/countryMask.ts`, Worker-Pools, `vite.config.ts` (lesend), Bundle-/Chunk-Struktur.

**Nicht in meinem Bereich (an andere Rollen):** Quellenwahl/Modell-Strategie (Daten & Meteorologie), Fusion-**Engine-Logik** (STOPP-Zone), Command-Deck-Designsprache (UX), Edge-Functions/Warm-Crons (Infra), CI-Workflow-Bau (QA), Security-Header/Fonts-Recht (Infra/Recht — ein Fund unten berührt es und wird dorthin verwiesen).

**Bekannte Fiktionen, die hier nirgends behauptet werden:** Three.js, WebLLM/`src/assistant`, Cloudflare R2/PMTiles, „AdaptiveQualityController", WebGPU-Raymarching. Der Globus ist MapLibre-Globe (`src/globe/GlobeMap.tsx:141-152`).

**Messgrenze (hart):** Chrome-DevTools-Emulation drosselt `requestAnimationFrame` → **jede** FPS-/GPU-/Thermik-Aussage ist mit 🔴 markiert und braucht ein echtes Gerät (`audit/performance-2d.md` §1: gemessene INP 264 s = physikalisch unmöglich). Netz-, Byte- und Bundle-Aussagen sind dagegen emulator-/dateisystem-belastbar.

---

## 2. Ist-Stand am Code belegt

### 2.1 Rendering-Architektur (Kurzfassung, verifiziert)

| Baustein | Beleg | Befund |
|---|---|---|
| Renderer | `package.json` (maplibre-gl ^5.6.0, installiert **5.24.0**) | Ein einziger Renderer: MapLibre GL. Kein Three.js, kein WebGPU. |
| Custom-Layer | `src/wind/WindLayer.ts` (1.546 LOC), `src/scalar/{ScalarLayer,RainLayer,CloudLayer,ConfidenceLayer}.ts` | 5 Layer-Klassen, GLSL ES 1.00. |
| Shader-Präzision | `src/wind/shaders.ts:10,23,65,71,233,239-240`, `src/scalar/RainLayer.ts:50` | `highp` explizit dort, wo das 2-Byte-Positions-Decoding sitzt; `mediump` bei den Farbpässen. Konsistent mit D-08. |
| Format-Verhandlung | `src/wind/glUtil.ts:128-133` | half-float → float → byte, per Context gecacht (`glUtil.ts:110`). **Siehe §2.5 — greift real nicht mehr.** |
| Adaptivregler | `src/wind/perfGovernor.ts` (FPS-Leiter `[20,24,30]` + Trail-Leiter, `WindLayer.ts:776-790`) | FrameGovernor im FPS-Modus, mobil; Desktop gepinnt/ungedeckelt. |
| Repaint-Disziplin | `WindLayer.ts:330,344-360,1344-1349` | `paused = docHidden ‖ offscreen`; einziger Dauerloop wird gestoppt (Gate GP3 live belegt). |
| DPR-Cap 2D | `src/MapView.tsx:767` | `coarsePointer ? min(dpr, 1.5) : dpr`. |
| Mobil-Knöpfe 2D | `MapView.tsx:895` (`reduceMotionOnMove`), `:905` (`upsample: coarse ? 1 : 2`) | Vorhanden, isoliert per `coarsePointer`. |
| Niederschlags-Komposit | `src/scalar/precipComposite.ts:196-224` | 600×512-Gather pro Slider-Schritt, **weiterhin nicht memoisiert** (bewusst, ~2,2 ms Desktop). |
| Worker-Pools | `src/sources/iconD2Precip.ts:298` (GRIB-Grid, ≤3), `src/scalar/precipComposite.ts:67` (Index-Map, ≤2), `FETCH_CONCURRENCY = 6` (`iconD2Precip.ts:281`) | Sauber gedeckelt an `hardwareConcurrency`. |

### 2.2 `MapView.tsx` — gemessene Struktur (Grundlage für §5)

| Metrik | Wert (gemessen) |
|---|---|
| LOC | **3.971** |
| `useState` | **26** |
| `useEffect` | **56** |
| `useRef` | **64** |
| `useMemo` / `useCallback` | 3 / 4 |
| `map.addLayer(` | 28 · `map.moveLayer(` **17** · `map.addSource(` 6 · `removeLayer` 3 |
| `LayerKey`s | **16** (`MapView.tsx:297`) |

Grob-Segmentierung (Zeilenbereiche gemessen):

| Bereich | Zeilen | LOC | Inhalt |
|---|---|---|---|
| Modulkopf | 1–415 | 415 | 105 Importzeilen, Layer-ID-Konstanten (`:170-279`), Popup-/HTML-Helfer |
| State/Refs | 416–739 | 324 | 26 States, 64 Refs, 14 `install*Ref`-Handles |
| **Init-Mega-Effekt** | **740–1863** | **1.124** | Map-Konstruktion, 13 Custom-Layer-Instanzen, `addLayers`/`applyVisibility`, ALLE 14 `install*`-Closures, Radar-Loader, Popup-Handler |
| Layer-/Refresh-Effekte | 1865–2818 | 954 | ~40 Effekte, davon 12 fast identische „bei Aktivierung installieren" und ~14 fast identische „Slider → Frame setzen" |
| Ableitungen/UI-State | 2823–2967 | 145 | `forecastLabel`, `sliderMax`, Sheet-Snap, Embed-Sync |
| Render-Helfer | 2969–3442 | 474 | Sheet-Drag, `layerRowDeck`, Statuszeilen, Modell-Meta |
| **JSX** | 3443–3879 | **437** | Topbar · Rail · Dock · Bühne · Readout · Mobile-Bottom-Nav |
| Modul-Ende | 3880–3971 | 92 | `DECK_GROUPS`, `LAYER_BY_KEY`, `DeckSearch` |

### 2.3 Layer-Z-Ordnung — die duplizierten Sequenzen (Frage 2, präzise)

**Kanonische Einfüge-Reihenfolge** (`MapView.tsx:1040-1088`, `beforeId = 'boundary_3'` sofern vorhanden):

```
temp · gust · thunder · lightningfc · snow · rotation · precip-forecast · rain(nowcast)
  · flow-nowcast · pop · clouds        ← alle mit beforeId (UNTER Grenzen/Labels/Maske)
wind                                   ← OHNE beforeId (:1060) → ÜBER Grenzen/Labels
confidence                             ← mit beforeId (:1063)
snowline-casing · snowline-line        ← native GeoJSON-Linien (:1071, :1078)
```

**Die Duplikate — belegt:**

| # | Ort | Umfang | Befund |
|---|---|---|---|
| **1** | `MapView.tsx:1089-1136` (`applyVisibility`) | 48 Zeilen | Sichtbarkeits-Tabelle über 16 Layer + 4 `moveLayer`-Hebungen |
| **2** | `MapView.tsx:2764-2811` (`apply`) | 48 Zeilen | **Byte-identisch zu #1 bis auf den Funktionsnamen in Zeile 1** — per `diff` verifiziert (einziger Unterschied: `const applyVisibility = () => {` vs. `const apply = () => {`) |
| **3** | `MapView.tsx:845-859` (`initOverlays`) | Teil-Duplikat | Nach dem Setzen der Länder-Maske wird `STATIONS_LAYER_ID` erneut nach oben gehoben, mit einem 5-zeiligen Kommentar, der die Regressionsgeschichte erzählt |
| 4 | `MapView.tsx:1383-1387` (`hoistRain`) | Teil-Duplikat | Dieselbe Stations-Hebung, wieder mit erklärendem Kommentar |
| 5 | `MapView.tsx:1323` (Stations-Installer) | 1 Zeile | Dieselbe Hebung ein fünftes Mal |

⇒ **`map.moveLayer(STATIONS_LAYER_ID)` steht an fünf Stellen** (`:859`, `:1135`, `:1323`, `:1386`, `:2810`), die Vertrauens-/Schneegrenzen-Hebung an zweien. Genau das ist die von `architecture.md` §3 benannte Regressionsquelle — jetzt mit Zeilennummern.

**Zwei versteckte Kontrakte, die eine Registry erhalten MUSS:**

1. **Wind liegt bewusst über den Grenzen/Labels** (`:1060` ohne `beforeId`), alle anderen Raster darunter. Eine naiv „aufgeräumte" Registry würde Wind unter die Labels schieben = sichtbare Regression.
2. **Die Länder-Maske clippt die Scalars über den Tiefentest** (`architecture.md` §3; `src/countryMask.ts` erzeugt das Even-Odd-Loch). Die Maske muss über den Scalar-Layern liegen, die Stationen über der Maske. Kommentar `MapView.tsx:855-858` dokumentiert einen realen User-Report („Regen über Belgien/Slowenien"), der genau aus einer falschen Hebung entstand.

**Zusätzliche Fragilität, die bei der Extraktion auffällt:** `applyVisibility()` wird in `addLayers` bei `:1087` aufgerufen, aber erst bei `:1089` als `const` deklariert — das funktioniert nur, weil `addLayers` selbst erst bei `:1137` läuft (TDZ knapp gutgegangen). Und `:2812-2816` umhüllt `apply()` mit einem `styledata`-Retry, weil `map.once('load')` unter Request-Sättigung nicht feuert. Beide Eigenheiten sind bei jeder Umstrukturierung Pflicht-Erhalt.

### 2.4 Layer-Inventar: was ist gebaut, was ist erreichbar

`LayerKey` ist 16 breit (`MapView.tsx:297`). Im Layer-Dock (`DECK_GROUPS`, `MapView.tsx:3822-3878`) sind aber **5 Toggles auskommentiert** — auf Jans Vorgabe 2026-07-23, Funktion bewusst erhalten:

`flownowcast` (`:3844`), `poprob` (`:3845`), `snowline` (`:3846`), `clouds` (`:3862`), `confidence` (`:3876`).

Diese Layer werden weiterhin **konstruiert, hinzugefügt, kompiliert und per Effekt bedient**; erreichbar sind sie nur über `#m=`-Permalink-Bitmaske (`src/mapState.ts:24`) oder den Embed-Modus. Dazu kommt `precip-forecast` (`precipLayer`), das per `MapView.tsx:1106` / `:2781` **fest auf `false`** steht („stillgelegt → nie sichtbar", D-14/N1) und trotzdem bei jedem Karten-Init einen kompletten ScalarLayer aufbaut.

**Folge für den Init:** Beim Karten-Start werden **16 GLSL-Programme** kompiliert und gelinkt — 4 im WindLayer (`WindLayer.ts:794-797`), 7× ScalarLayer (`ScalarLayer.ts:161`), 3× RainLayer (`RainLayer.ts:159`), 1× CloudLayer (`CloudLayer.ts:107`), 1× ConfidenceLayer (`ConfidenceLayer.ts:119`) — plus 13× `getColorRamp()`, das je ein 256×1-Canvas anlegt und per `getImageData` zurückliest (`glUtil.ts:244-256`). Und das, obwohl der Default nur **einen** aktiven Layer hat (`MapView.tsx:425`: `new Set(['wind'])`). Die reale Kosten (Shader-Compile/Link ist auf mobilen Treibern oft 1–10 ms je Programm) sind 🔴 **nicht gemessen** — der Messweg steht in §3.5.

### 2.5 ⚠ Kernbefund: Die Karte läuft bereits auf **WebGL2** — und die Wind-Textur fällt dadurch still auf 8 bit

Dieser Fund beantwortet Frage 5 anders, als die Fragestellung erwartet.

**Belegkette (statisch, jeder Schritt am Code/Paket):**

1. MapLibre GL 5.24.0 fordert **WebGL2 zuerst** an:
   `node_modules/maplibre-gl/dist/maplibre-gl.js` — `…contextType ? getContext(contextType,e) : this._canvas.getContext("webgl2",e) || this._canvas.getContext("webgl",e)…`
2. Der Default für `contextType` ist **`void 0`**: `…canvasContextAttributes:{antialias:!1,preserveDrawingBuffer:!1,powerPreference:"high-performance",failIfMajorPerformanceCaveat:!1,desynchronized:!1,contextType:void 0}…`
3. `MapView.tsx:756-777` setzt **kein** `canvasContextAttributes` → der Default gilt. Gleiches im Globus (`GlobeMap.tsx:141-145`).
4. ⇒ Auf jedem WebGL2-fähigen Browser (Chrome/Edge/Firefox seit Jahren, Safari ≥ 15) bekommen **alle** Custom-Layer einen `WebGL2RenderingContext`. Die GLSL-ES-1.00-Shader laufen dort unverändert (WebGL2 akzeptiert ES-1.00-Quellen) — deshalb ist bisher nichts aufgefallen.
5. **Aber:** In WebGL2 sind `OES_texture_float` und `OES_texture_half_float` Kernfunktionalität und werden von `getExtension()` **nicht mehr zurückgegeben** (WebGL-Spezifikation: in Core aufgegangene Extensions werden nicht exponiert). `src/wind/glUtil.ts:114-118` fragt genau diese beiden ab, `:128-133` entscheidet daraus:
   ```ts
   if (halfExt && (!wantLinear || halfLinear)) return 'half-float';
   if (floatExt && (!wantLinear || floatLinear)) return 'float';
   return 'byte';
   ```
   ⇒ **beide null ⇒ `'byte'`.**
6. Damit läuft `WindLayer.ts:769` (`pickWindTextureKind(gl, true)`) und in der Folge jeder Wind-Textur-Upload (`:929`, `:975`) über den **RGBA8-Pfad** — die Windgeschwindigkeit wird auf 256 Stufen quantisiert. Genau das, was der Kommentar bei `WindLayer.ts:922-926` als Notfall-Fallback beschreibt („Fällt bei fehlender Float-Extension automatisch auf 8-bit zurück"), ist heute der **Regelfall**.

**Was das bedeutet — ehrlich eingeordnet:**
- Es ist **kein Fehler**, es ist ein stiller Qualitätsverlust: die weiche, kontinuierliche Strömung, für die `decodeAndRefine` (CPU-Upsample + 3×3-Glättung) extra Rechenzeit ausgibt, wird beim Upload wieder auf 8 bit gerundet. Der Aufwand für `floatToHalf` (`glUtil.ts:70-93`) und der Half-Float-Pfad im Worker (`windBlendRefine.ts:80`) laufen ins Leere.
- Es ist **latent gefährlich**: würde jemand die Extension-Abfrage „reparieren", wäre `uploadPackedTexture`s Float-Pfad (`glUtil.ts:181`: `texImage2D(…, gl.RGBA, gl.FLOAT, …)` mit **unsized** Internal-Format) in WebGL2 **ungültig** — WebGL2 verlangt `RGBA32F`/`RGBA16F`. Ein naiver Fix würde die Wind-Textur schwarz machen.
- Die CLAUDE.md-Regel „kein Verlass auf `EXT_color_buffer_float`" stammt aus der WebGL1-Welt. Unter WebGL2 ist `EXT_color_buffer_float` eine reguläre, breit verfügbare Extension — die Risiko-Landschaft hat sich verschoben, ohne dass die Doku es weiß.

**🔴 Verifikationsbedarf (emulator-belastbar, 30 Sekunden, kein Real-Device nötig):** In der laufenden App auf der Karte
```js
__map.painter.context.gl instanceof WebGL2RenderingContext   // Erwartung: true
__map.style._layers.wind.implementation.windTextureKind      // Erwartung: 'byte'
__map.painter.context.gl.getSupportedExtensions()            // Erwartung: kein OES_texture_half_float
```
Erst dieser Probe-Lauf macht aus der Belegkette eine Messung. **Ich habe ihn NICHT ausgeführt** (kein Dev-Server in der Planungsphase). Fällt er anders aus, ist die ganze §2.5-Analyse hinfällig — dann bitte diesen Abschnitt streichen statt ihn zu retten.

### 2.6 Globus (Frage 7) — was er wirklich rendert

**Die Alt-Doku-Behauptung „Sample-Daten" ist falsch, `architecture.md` §8 hat recht:** Der Globus rendert **Live-GFS**.

- `src/globe/gfs.ts:33` baut die reale NOAA-URL (`gfs.{date}/{hour}/atmos/gfs.t{hh}z.pgrb2.1p00.f{fff}`), `:50` listet den S3-Bucket, `:110-120` lädt per Byte-Range aus dem `.idx`-Sidecar und dekodiert client-seitig.
- `src/globe/GlobeMap.tsx:158` setzt explizit `windPngUrl: '', windJsonUrl: ''` → der Sample-Pfad ist **abgeschaltet**.
- Der Proxy `/_gfs` existiert dev **und** prod (`vite.config.ts:34-38` und laut `architecture.md` §10 in `netlify.toml`) — anders als `/_mf`/`/_ecmwf`/`/_cscs` (Defekt A1) ist der Globus in Produktion also funktionsfähig.

**Aber der Globus ist der ungovernte Ausreißer im Renderpark — vier belegte Asymmetrien zur 2D-Karte:**

| # | 2D-Karte | Globus | Beleg |
|---|---|---|---|
| 1 | DPR-Cap 1,5 mobil | **kein Cap** — volle DPR (auf iPhone 12 Pro = 3,0 ⇒ **4× Fillrate** ggü. der 2D-Karte) | `MapView.tsx:767` vs. `GlobeMap.tsx:141-145` (kein `pixelRatio`) |
| 2 | FrameGovernor regelt FPS | **Governor wird nie gefüttert** | `WindLayer.ts:1312`: `if (this.governor && !this.globeMode && …)` |
| 3 | FPS-Cap (mobil 30→24→20) | **kein Cap** — `maxParticleFps` bleibt 0 | `GlobeMap.tsx:154-159` übergibt keinen Cap; `WindLayer.ts:776` schließt Globe-Modus zusätzlich aus |
| 4 | Zoom-Ausdünnung der Partikel | **keine** — volle Zahl | `WindLayer.ts:1168`: `if (this.globeMode) return this._numParticles;` |

Dazu die Partikel-Budgets: `baseDensity: 18000, maxParticles: 48000` (`GlobeMap.tsx:155`), im HD-Modus zusätzlich `setDensityMultiplier(2.2)` (`:163`). Und ein **permanenter rAF-Loop**: `GlobeMap.tsx:184-189` ruft `requestAnimationFrame(spin)` **unbedingt** wieder auf, auch wenn `spinning === false` — der Loop läuft also immer, er dreht nur nicht.

⇒ **Der Globus ist auf Mobilgeräten der teuerste WebGL-Pfad der App und der einzige ohne jede Qualitätsregelung.** Die vier Fachmann-Hebel, die für die 2D-Karte in drei Phasen (P/P2/P3) umgesetzt wurden, greifen dort **null**. 🔴 Das ist eine Code-Diagnose; die tatsächliche Frame-Zeit auf einem Mittelklasse-Android ist nicht gemessen.

**Strategische Bewertung (Vorschlag, keine Entscheidung):** **Upgrade, nicht Retire.** Begründung: (a) D-05 nennt den Globus bewusst ein Kontext-/Deko-Feature — er trägt zum Visual-Benchmark gegen Windy/Ventusky bei, den `roadmap.md` §C als Messlatte setzt; (b) er ist das einzige Feature, das die Wind-Engine außerhalb DACH zeigt, und damit ein billiges Schaufenster; (c) er ist mit 1.350 LOC + 16,9 KB JS-Chunk (`dist/assets/GlobePage-DJKFxSsR.js`) extrem günstig; (d) er ist der letzte Nicht-Command-Deck-Screen (D-27/V-10) — ihn zu löschen und ihn zu migrieren kosten beide Arbeit, aber nur die Migration erhält Wert. **Löschung wäre ein STOPP-Punkt (§8)** und wird hier ausdrücklich nicht vorgeschlagen.

### 2.7 Bundle & Code-Splitting (Frage 8) — gemessen am vorhandenen `dist/`

> Basis: der im Repo liegende Build vom **2026-07-21** (`dist/assets`, 60 Dateien). Er ist ~10 Tage alt — die Größenordnungen sind belastbar, exakte Bytes bitte nach dem nächsten Build nachziehen.

**Eager (jeder Besucher, vor dem ersten Pixel):** `dist/index.html` referenziert genau **zwei** lokale Assets:

| Asset | roh | gzip |
|---|---|---|
| `index-DLZ0ulmr.js` | 383.225 B | **122.731 B** |
| `index-CFSaKL30.css` | 31.454 B | 7.074 B |
| **Summe eager (lokal)** | **414,7 KB** | **~129,8 KB** |

Dazu **render-blockierend und cross-origin**: `index.html:13` lädt drei Google-Font-Familien mit **13 Gewichten** von `fonts.googleapis.com` (plus `fonts.gstatic.com` für die Dateien). Zwei Fremd-Origins auf dem kritischen Pfad — trotz `preconnect` mindestens ein zusätzlicher RTT vor dem ersten Textrendering, und ein Datenabfluss (IP + User-Agent) an Google, der zur Positionierung „trackerfrei" (D-02) nicht passt. *(Der rechtliche Teil gehört der Rolle SEO/GEO & Recht — ich melde nur den Performance-Teil.)*

**Was im Eager-Chunk steckt, das dort nicht hingehört — belegt über eindeutige Marker-Strings:**

| Marker | in `index-*.js` | in `MapView-*.js` | Herkunft |
|---|---|---|---|
| `_cscs` | **1** | 0 | `src/sources/iconChEpsSource.ts` (CH-EPS) |
| `_mf` | **2** | 0 | `src/sources/aromeFranceSource.ts` (AROME-FR) |
| `_ecmwf` | **1** | 0 | `src/sources/ecmwfIfsSource.ts` (IFS/AIFS) |
| `Barnes` | **1** | 0 | `src/fusion/fusionEngine.ts` |
| `GRIB2: DRT … CCSDS-AEC` | **wörtlich vorhanden** | — | `src/sources/gribDecode.ts:248` |

Die Ursache ist eine einzige Zeile: **`src/SearchPage.tsx:33` importiert `warmMapData` statisch aus `src/fusion/loadFusedForecast.ts`.** Dieses Modul zieht statisch die **komplette Fusion-Engine plus 17 Quell-Adapter** nach (`loadFusedForecast.ts:21-43`: brightSky ×2, GeoSphere INCA/AROME/TAWES, ICON-D2-EPS, ICON-CH-EPS, AROME-France, ICON-EU, GFS-2D, ECMWF-IFS, ICON-Global, AICON, ARPEGE, MeteoSwiss-SMN, SMHI, DMI, IPMA, `FusionEngine`, `captureFixture`) — und über `iconD2EpsSource.ts:26` den handgeschriebenen **GRIB2-Decoder inkl. CCSDS-AEC**.

Und `warmMapData` selbst tut heute genau **eine** Sache (`loadFusedForecast.ts:135-145`): `prefetchElevation()`. Der Kommentar dort erklärt sogar, dass die Fusion-Vorwärmung längst entfernt wurde — der Import blieb.

⇒ **Jeder Besucher der Startseite lädt den GRIB2/CCSDS-AEC-Decoder, die Optimal-Interpolations-Fusion und 17 Wettermodell-Adapter, um ein Suchfeld zu sehen.** Grobe Schätzung des Anteils: die statisch gezogene Kette umfasst **5.311 LOC** (Summe der 22 Dateien), was minifiziert erfahrungsgemäß 130–180 KB roh / 40–55 KB gzip entspricht — also **rund ein Drittel bis die Hälfte des Eager-Chunks**. Die exakte Zahl braucht eine Bundle-Analyse (`rollup-plugin-visualizer` oder ein Probe-Build ohne den Import); **hier bewusst als Schätzung markiert**, weil ich nicht bauen darf.

**Lazy-Chunks (Auswahl, roh / gzip):**

| Chunk | roh | gzip | Bemerkung |
|---|---|---|---|
| `maplibre-*.js` | 1.055.235 B | **282.847 B** | Vendor, per `manualChunks` (`vite.config.ts:81`) korrekt geteilt |
| `MapView-*.js` | 190.587 B | 61.027 B | + `MapView-*.css` 85.097 B / 14.240 B |
| `maplibre-gl-*.css` | 69.940 B | 10.033 B | |
| `EventPage-*.js` | 120.110 B | — | + `EventPage-*.css` **94.769 B** / 15.006 B (größte CSS) |
| `NowcastPage-*.js` | 111.791 B | — | + CSS 72.306 B / 12.975 B |
| `pointForecast-*.js` | 85.245 B | 29.771 B | |
| `WindLayer-*.js` | 40.901 B | 12.960 B | |
| `meteostatStations-*.js` | 67.467 B | **27.084 B** | |
| **Summe alle JS** | **2.595.669 B** | — | 60 Assets |
| **Summe alle CSS** | **496.577 B** | — | |

**Korrektur zu V-08:** Die 77-KB-Stationstabelle ist **nicht** im Bundle — sie ist ein eigener, dynamisch geladener Chunk (`src/history/meteostatSource.ts:72`: `import('./meteostatStations')`), 67,5 KB roh / **27,1 KB gzip**, und lädt nur, wenn ein Historie-Nutzer Stationen braucht. Bleibt ein sinnvoller Optimierungskandidat (JSON statt TS-Literal), aber die Dringlichkeit ist deutlich geringer als V-08 nahelegt.

**Korrektur zur „~200 KB tote CSS"-These (ehrlich):** Die Quell-CSS im Repo summiert sich auf **670.969 B** über 26 Dateien. Eine Selektor-Analyse von `src/MapView.css` (258 Klassenselektoren) gegen alle `.ts`/`.tsx`-Tokens ergibt **81 unreferenzierte Selektoren (31 %)** — im Kern das alte Karten-Sheet (`map-sheet-*`, ~30 Klassen), der alte Modell-Switcher (`ms-*`, `mls-*`), alte Rails (`left-rails*`), `layer-switch*`, `wind-particle-switch`, `wpc-*`. `src/map/mapDeck.css` ist dagegen sauber (21/245, davon die meisten MapLibre-Built-ins). **Caveat:** einige Treffer sind dynamisch zusammengesetzte Namen (`sat-product-${…}`, `temp-label-rank-${…}`) und damit Fehlalarme — die belastbare Zahl liegt bei ~70 von 258.
**Wirkungs-Ehrlichkeit:** Der Netz-Gewinn ist klein. Die gebaute MapView-CSS liegt bei **14,2 KB gzip**; 30 % davon sind ~4 KB gzip. Der echte Gewinn liegt in **Style-Recalc, Klarheit und Wartbarkeit**, nicht im Download. V-08 („schnellerer Seitenaufbau durch weniger CSS") überschätzt den Effekt — das sollte im Masterplan korrigiert stehen.

**Weiteres totes Gewicht (klein, aber sauber belegt):** `public/wind/wind.png` (87.117 B) + `public/wind/wind.json` liegen im Deploy, werden aber von **keinem** Aufrufer geladen — beide `new WindLayer(...)`-Stellen setzen `windPngUrl: ''` (`MapView.tsx:889`, `GlobeMap.tsx:158`); die Defaults `/wind/wind.png` (`WindLayer.ts:756-757`) laufen nie.

### 2.8 Kaltlade-Restpfade: T2-7 und T2b-4 (Frage 4)

**Statusprüfung am Code — beide weiterhin offen:**

| Vorhaben | Status | Beleg |
|---|---|---|
| **T2-7** — Per-Layer-IndexedDB-„Jetzt"-Cache für Temp/Precip/Clouds/Gust | **nicht umgesetzt** | Eine einzige IndexedDB im ganzen `src/`: `src/wind/iconD2WindSource.ts:704-707` (`openWindDb`). Alle anderen Layer nutzen nur die Cache-API für dekomprimierte GRIB-Bytes (`src/sources/iconD2Precip.ts:174`) — die spart den **Download**, nicht den **Decode**, und überlebt keinen Textur-Aufbau. |
| **T2b-4** — EPS-Vor-Resampling im Cron | **nicht umgesetzt** | `audit/layer-transport.md:199` („T2b-4 (Vor-Resampling) NICHT umgesetzt — per Vorgabe erst auf Zuruf") und `:239` („Client-Decode … bleibt bis dahin unverändert teuer"). Kein Cron-Artefakt, kein Client-Konsument im Code. |

**Verbleibendes Gewinnpotenzial — mit den gemessenen Zahlen aus `audit/live-network-audit.md` §3.2:**

- **Temperatur-Toggle:** 397 Requests, **194,6 MB**, **~17 s** Wall — davon **EPS 191,98 MB in 17 Dateien** (11,5–15,3 MB je Step-Datei, 12,3–15,0 s/Datei, bandbreitenlimitiert bei ~11 MB/s Messleitung). Die Edge liefert dabei bereits **HITs** (T2b wirkt) — der Engpass ist reine Client-Bandbreite plus teures ikosaedrisches Client-Resampling.
- Zum Vergleich derselbe Toggle-Satz: Niederschlag 27,9 MB / 9,2 s · Wind 27,3 MB / 7,4 s · Böen 27,2 MB / 5,1 s · Wolken 23,7 MB / 36,5 s (329 Requests!) · Stationen 7,9 MB / 162 Requests.
- **Session-Gesamt des Audits: 1.320 Requests, ~354 MB.**

⇒ **T2b-4 ist der einzige Hebel mit Größenordnungs-Wirkung** (192 MB → vermutlich einstelliges MB, plus Wegfall des Client-Decodes). Auf einer mobilen 4G-Leitung (~2 MB/s) sind 192 MB rechnerisch **~96 Sekunden** — das ist keine Optimierung mehr, das ist ein Funktionsausfall. T2-7 wirkt orthogonal auf den **Wiederbesuch** (Frame 0 sofort aus IndexedDB, ohne Netz und ohne Decode) und ist deutlich billiger zu bauen, weil das Wind-Muster (`iconD2WindSource.ts:704-760`) 1:1 als Vorlage dient.

**⛔ STOPP-Vermerk (unverändert gültig):** Das **Lade-Timing** der Fusion ist der Multiplikator dahinter — heute zieht ausgerechnet der *Temperatur*-Toggle die volle EPS-Fusion (`MapView.tsx:2000-2004`: `if (active.has('temp') && !fusionRequestedRef.current …) reloadForecastRef.current?.()`), während der Bare-Load ohne EPS auskommt. Ob/wann Fusion EPS lädt, ist eine Fusion-Engine-**Verhaltens**änderung → **STOPP & FRAGEN Jan** (§8). Hier nur benannt, nicht vorgeschlagen.

**Wichtige Korrektur am Audit (Code hat sich seither geändert):** `audit/live-network-audit.md` §4 Punkt 6 („Near-Horizon-Staffelung", Baseline lädt t_2m 0–24 = 24,5 MB eager) ist **teilweise erledigt**. Am 2026-07-23 kam `START_NOW_ONLY` dazu (`MapView.tsx:160-168`), **Default `true`**, abschaltbar nur per `?startnow=0`. Alle nativen Grid-Loader bekommen dadurch `{ nowOnly: true, aheadHours: forecastAheadHRef.current }` (`MapView.tsx:1477, 1504, 1559, 1598, 1626`), und `fetchIconD2Temp` beschränkt sich dann auf `stepsForNowWindow(...)` (`src/sources/iconD2TempSource.ts:182`). Der Vollhorizont lädt erst, wenn der Nutzer den Slider bewegt. **Der Audit misst einen Zustand von vor dieser Änderung** — die Baseline muss neu gemessen werden, bevor jemand daraus Prioritäten ableitet.
Ungebrochen bleibt: das t_2m-Gitter lädt **auch bei ausgeschaltetem Temperatur-Layer**, weil die Stadt-Labels es brauchen — immerhin per `requestIdleCallback` hinter den Hero-Layer verschoben (`MapView.tsx:1990-1996`).

---

## 3. Lücken-Quantifizierung

### 3.1 Wartbarkeit (Feld 12)

| Lücke | Zahl | Beleg |
|---|---|---|
| MapView-Monolith | 3.971 LOC / 26 State / 56 Effekte / 64 Refs | §2.2 |
| Duplizierte Z-Ordnungs-/Sichtbarkeits-Logik | 1× 48 Zeilen **byte-identisch** + 3 Teil-Duplikate; `moveLayer(STATIONS)` 5× | §2.3 |
| Fast identische „bei Aktivierung installieren"-Effekte | 12 (`MapView.tsx:1894-1970`) | Alle mit Dep-Array `[active]` |
| Fast identische „Slider → Frame setzen"-Effekte | ~14 (`:2079-2560`) | Alle mit `[forecastHour, nowcastTick, active, …]` |
| `install*Ref`-Handles | 14 | `:603-680` |
| Unerreichbare, aber voll bediente Layer | 6 von 16 (5 auskommentiert + `precip-forecast` hart false) | §2.4 |

### 3.2 Bundle (Feld 3)

| Lücke | Zahl |
|---|---|
| Eager-Payload Startseite | 414,7 KB roh / **129,8 KB gzip** + 2 Fremd-Origins render-blockierend |
| Davon Fusion + 17 Quell-Adapter + GRIB2/AEC-Decoder | **5.311 LOC**, geschätzt 130–180 KB roh / 40–55 KB gzip (⚠ Schätzung) |
| Tote MapView.css-Selektoren | ~70 von 258 (~27 %), ≈ 4 KB gzip |
| Totes Deploy-Asset | `public/wind/wind.png` 87.117 B |

### 3.3 Kaltlade-Pfade (Feld 3)

| Layer | Requests | Bytes | Wall | Budget-Bewertung |
|---|---|---|---|---|
| Temperatur (⇒ EPS-Fusion) | **397** | **194,6 MB** | **~17 s** | 🚫 weit über jedem vertretbaren Budget |
| Wolken | **329** | 23,7 MB | 36,5 s | 🚫 Requestzahl + Wall |
| Stationen | 162 | 7,9 MB | ~4 s | ⚠ Requestzahl (158 CH-Einzel-CSVs) |
| Niederschlag | 40 | 27,9 MB | 9,2 s | ⚠ |
| Wind | 32 | 27,3 MB | 7,4 s | ⚠ (aber Edge-HIT, konstante 150–600 ms/Datei) |
| Böen | 27 | 27,2 MB | 5,1 s | ⚠ |
| Flow-Nowcast | 0 | **0 B** | — | ✅ perfekter Warm-Reuse |

### 3.4 Renderpark-Parität

| Fläche | DPR-Cap | Governor | FPS-Cap | Repaint-Pause |
|---|---|---|---|---|
| 2D-Karte | ✅ 1,5 | ✅ | ✅ 30/24/20 | ✅ (GP3) |
| **Globus** | ❌ | ❌ | ❌ | ⚠ nur WindLayer-intern; eigener rAF-Loop läuft immer (`GlobeMap.tsx:184-189`) |
| Nowcast-Radar / Route / Terrain | nicht geprüft (außerhalb dieser Session) | — | — | — |

### 3.5 Was **gar nicht** gemessen wird (die eigentliche Lücke)

Es existiert **keine einzige** kontinuierliche Performance-Messung: kein RUM (per D-02 bewusst), kein Lighthouse-Lauf in CI (es gibt gar keine CI, V-11), kein Bundle-Size-Gate, kein Long-Task-Budget. Die einzigen belastbaren Zahlen dieses Dokuments stammen aus **zwei manuellen Audits** (2026-07-18 und 2026-07-22) — beide inzwischen vom Code überholt (§2.8). Ohne wiederholbare Messung ist jedes Budget eine Absichtserklärung.

**Messwege, die ohne Verletzung von D-02 funktionieren und die ich vorschlage (aber jetzt nicht ausführe):**
1. **Bundle-Budget-Verifier**, netzunabhängig, passt exakt zu D-10: ein `scripts/verify-bundle-budget.mjs` liest nach dem Build `dist/assets`, gzippt jede Datei in-memory und prüft gegen eine versionierte Schwellenwert-Tabelle. Deterministisch, kein Framework, PR-blockierfähig.
2. **Synthetisches Lighthouse** gegen die Prod-URL (Chrome-DevTools-MCP `lighthouse_audit` oder Lighthouse-CI): LCP/TBT/CLS sind emulator-belastbar, INP und alles GPU-Nahe **nicht**.
3. **Per-Layer-Traffic-Regression:** die Methodik aus `audit/live-network-audit.md` §1-2 als wiederholbares Skript (Request-Zahl + Bytes je Toggle) statt als Einmal-Audit.
4. 🔴 **Real-Device-Matrix** für alles GPU-Nahe: iPhone 12 Pro (vorhanden) **+ mindestens ein schwaches Android** (Adreno 5xx/Mali-G5x). Fehlt heute komplett — `roadmap.md` §E nennt es als offene Frage. Ohne dieses zweite Gerät sind die Gates GP/GP2 dauerhaft nur „bis auf Real-Device grün".

---

## 4. Initiativen

Legende: Aufwand **S** ≤ 1 Tag · **M** = Tage · **L** = Wochen+. Wirkung 1–5 (5 = strategisch entscheidend).

| # | Initiative | Ziel | Aufwand | Wirkung | Abhängigkeiten | Definition of Success (messbar) |
|---|---|---|---|---|---|---|
| **R1** | **Eager-Bundle entschlacken** | Fusion + 17 Adapter + GRIB-Decoder aus dem Startseiten-Chunk | S | **4** | keine | Eager-JS gzip **< 90 KB** (heute 122,7); Marker `_cscs`/`_mf`/`_ecmwf`/`Barnes`/`CCSDS-AEC` in `dist/assets/index-*.js` = **0 Treffer**; Startseite funktional unverändert |
| **R2** | **MapView Schritt 1: Layer-Registry** | Die 48-Zeilen-Dopplung + 5 Stations-Hebungen durch **eine** deklarative Quelle ersetzen | M | **5** | R6 (Verifier-Harness) | `moveLayer`-Aufrufe von 17 → ≤ 3; `verify:layer-registry` grün gegen Golden-Order; Desktop-Screenshot-Diff = 0 px über alle 16 Layer einzeln |
| **R3** | **Performance-Budget + Gate** | Ein versioniertes Budget, das in CI bricht | S | 4 | V-11 (CI-Minimum) | `verify:bundle-budget.mjs` existiert, läuft offline, bricht bei Überschreitung; Budget-Tabelle in `tests.md` |
| **R4** | **WebGL2-Realität klären** | Beweisen/widerlegen, dass die Wind-Textur still auf 8 bit läuft | S (Diagnose) | **4** | — | Probe-Ergebnis (§2.5) dokumentiert; falls bestätigt → Entscheidungsvorlage an Jan (STOPP-Zone, §8) |
| **R5** | **Globus-Parität** | Die drei fehlenden Regel-Hebel auf den Globus ziehen | S–M | 3 | R4 (gleiche Datei) | Globus mobil mit DPR-Cap 1,5 + Governor-Feed + FPS-Cap; 🔴 Real-Device-Frame-Zeit vorher/nachher |
| **R6** | **Golden-Verifier für Layer-Zustand** | Sicherungsnetz **vor** jeder MapView-Änderung | S | **5** | — | `scripts/verify-layer-registry.mjs` reproduziert Z-Ordnung + Sichtbarkeits-Wahrheitstabelle des heutigen Codes deterministisch |
| **R7** | **T2-7 Per-Layer-Jetzt-Cache** | Wiederbesuch zeigt Frame 0 ohne Netz/Decode | M | 4 | keine (Wind-Muster kopierbar) | Zweiter Besuch: 0 Netz-Requests bis zum ersten Wetter-Pixel für Temp/Precip/Gust; Time-to-first-weather-pixel ≤ 500 ms |
| **R8** | **T2b-4 EPS-Vor-Resampling** | 192-MB-Fusion-Kaltlast brechen | L | **5** | Infra (Cron), Daten-Rolle (Äquivalenzbeweis), Jans Gate | EPS-Toggle **< 10 MB** und **< 3 s** auf 11 MB/s; Zell-für-Zell-Äquivalenz numerisch bewiesen |
| **R9** | **MapView Schritt 3–7** | Datei < 400 LOC, parallel-arbeitsfähig | L | 4 | R2, R6 | `MapView.tsx` ≤ 400 LOC; kein Modul > 500 LOC; alle 16 Layer einzeln funktionsgleich |
| **R10** | **Lazy Layer-Konstruktion** | 16 Shader-Programme nicht mehr eager | M | 2 | R2, D-11-Flag | 🔴 Real-Device: Init-Zeit bis erstes Wetter-Pixel messbar niedriger; Desktop byte-identisch |
| **R11** | **Referenzoptik-Ausbau** | Unsicherheit/Isochronen sichtbar machen | L | 3 | R2 (Registry), Fusion-Rolle | s. §6-Einträge; je Feature ein eigenes Gate |
| **R12** | **Google-Fonts selbst hosten** | Kritischen Pfad + Fremd-Origins entfernen | S | 3 | Infra (CSP, V-07) | 0 Requests an `fonts.googleapis.com`/`gstatic.com`; LCP-Delta gemessen |

**Empfohlene Reihenfolge:** R6 → R1 → R3 → R2 → R4 → R5 → R7 → R9 → R10/R12 → R8 → R11.
Begründung: R6 und R1 sind billig, risikoarm und liefern sofort messbaren Wert; R6 ist zudem die Voraussetzung dafür, dass R2/R9 überhaupt gate-fähig sind. R8 steht spät, weil es Infra + Daten-Rolle + Jans Gate koppelt.

---

## 5. MapView-Zerlegungsplan (O-04) — Inhalt für V-14

> Dies ist der Kern-Deliverable. Der Plan ist so geschnitten, dass **jeder Schritt einzeln gate-fähig, einzeln rückrollbar und einzeln desktop-pixel-diffbar** ist. `agents.md` §3 nennt `src/MapView.tsx` als Hochrisiko-Datei: **immer nur ein Agent, immer nur ein Schritt pro Phase** (CLAUDE.md „Ein Thema = eine Phase = ein Gate").

### 5.0 Leitprinzipien

1. **Funktionserhalt ist absolut.** Auch die 6 nicht im Dock erreichbaren Layer (§2.4) bleiben vollständig funktionsfähig — sie sind über `#m=`-Permalinks und den Embed-Modus erreichbar. Ausblenden ≠ Löschen.
2. **Kein Verhalten ändern, nur Ort.** Jeder Schritt ist eine reine Umlagerung. Verhaltensänderungen (Lazy-Konstruktion, Fusion-Timing) sind **eigene, flag-gegatete Vorhaben** (D-11) nach Abschluss der Zerlegung.
3. **Erst das Netz, dann der Sprung.** Schritt 0 baut das Sicherungsnetz; ohne es wird kein Code verschoben.
4. **Reine Module bevorzugen (D-12).** Alles, was ohne DOM/GL auskommt (Ordnung, Sichtbarkeits-Wahrheitstabelle, Frame-Auswahl), wandert in pure Module und wird headless verifiziert. Nur der dünne Applier fasst MapLibre an.

### 5.1 Zielbild der Modulstruktur

```
src/map/
  layerRegistry.ts        (pur)   Deklaration aller 16 Layer: id, kind, slot, insertBefore, visible(ctx)
  layerOrder.ts           (pur)   resolveOrder(registry) → string[]   (Golden-testbar)
  layerVisibility.ts      (pur)   resolveVisibility(registry, ctx) → Record<id, boolean>
  applyLayerState.ts      (DOM)   der EINZIGE Ort mit addLayer/moveLayer/setLayoutProperty
  createWeatherLayers.ts  (—)     Fabrik: die 13 GL-Layer-Instanzen + Optionen
  useWeatherLayerData.ts  (Hook)  Fetch-/Install-Orchestrierung, tabellengetrieben
  useLayerFrames.ts       (Hook)  Slider → setFrame, tabellengetrieben
  usePointForecastWiring.ts(Hook) Punkt-Panel, Lawinen, Open-Meteo-Consent
  MapDeck.tsx / MapDeckMobile.tsx  Deck-UI (Topbar · Rail · Dock · Readout · Sheet)
  DeckSearch.tsx                  (heute MapView.tsx:3881-3971)
src/MapView.tsx           Komposition, Ziel < 400 LOC
```

---

### **Schritt 0 — Sicherungsnetz (Aufwand S · Risiko: keins, es bewegt sich kein Produktionscode)**

**Was entsteht:**
- `scripts/verify-layer-registry.mjs` (Node-strip-types, kein Vitest — D-10) mit einer **eingefrorenen Golden-Datei** `scripts/fixtures/layer-order.golden.json`, die (a) die heutige Einfüge-Reihenfolge aus `MapView.tsx:1040-1083` und (b) die Sichtbarkeits-Wahrheitstabelle aus `:1090-1116` über eine Matrix von Eingaben enthält: alle 16 `active`-Einzelmengen + 6 typische Kombinationen × `precipFrameReady ∈ {true,false}` × `modelSourceRef.radar ∈ {true,false}`.
- Ein Dev-Probe `window.__mapLayerState()` (nur `import.meta.env.DEV`, analog dem bestehenden `__map` bei `MapView.tsx:1142`), der die **tatsächliche** MapLibre-Layer-Reihenfolge + Sichtbarkeiten als JSON liefert.
- MCP-Screenshot-Baseline: Desktop 1440×900 **und** iPhone 12 Pro 390×844 DPR 3, je Screenshot pro einzeln aktiviertem Layer (16) + 4 Kombinationen, abgelegt unter `audit/screenshots/o04-baseline/`.

**Was byte-identisch bleiben muss:** alles. Diff = nur neue Dateien + ein DEV-only-Export.
**Gate:** Golden-Datei reproduziert die aus dem Live-`__mapLayerState()` gelesene Ordnung exakt. Wenn nicht — Golden korrigieren, **nie** den Code.
**Was regressieren könnte:** nichts. Deshalb steht dieser Schritt vorn.

---

### **Schritt 1 — Deklarative Layer-Registry (Aufwand M · Risiko: mittel · der eigentliche Hebel)**

**Was sich bewegt:**
- `MapView.tsx:1040-1088` (`addLayers`), `:1089-1136` (`applyVisibility`), `:2764-2811` (`apply`, byte-identisches Duplikat), `:859`, `:1323`, `:1386` (Stations-Hebungen) → **eine** Registry + **ein** Applier.

**Skizze der Registry** (nur Skizze für dieses Dokument, kein Repo-Code):

```ts
// src/map/layerRegistry.ts — pur, kein DOM, kein GL, in Node testbar (D-12)
export type Slot = number;   // aufsteigend = weiter oben gezeichnet

export interface LayerCtx {
  active: ReadonlySet<LayerKey>;
  forecastHour: number;
  radarModelActive: boolean;      // modelSourceRef.current.radar
  precipFrameReady: boolean;      // precipFrameReady(forecastHour)
}

export interface LayerSpec {
  id: string;                     // MapLibre-Layer-ID
  key?: LayerKey;                 // Dock-Toggle, falls vorhanden
  /** 'boundary' = unter Grenzen/Labels (heutiges beforeId='boundary_3').
   *  'top'      = ÜBER Grenzen/Labels — heute NUR Wind (MapView.tsx:1060).
   *  'above-mask' = muss über der Länder-Maske bleiben (Stationen, Snowline). */
  band: 'boundary' | 'top' | 'above-mask';
  slot: Slot;                     // Reihenfolge innerhalb des Bands
  visible: (c: LayerCtx) => boolean;
}

export const LAYER_REGISTRY: readonly LayerSpec[] = [
  { id: 'temp',              key: 'temp',        band: 'boundary', slot: 10, visible: c => c.active.has('temp') },
  { id: 'gust',              key: 'gust',        band: 'boundary', slot: 20, visible: c => c.active.has('gust') },
  { id: THUNDER_LAYER_ID,    key: 'thunder',     band: 'boundary', slot: 30, visible: c => c.active.has('thunder') },
  { id: LIGHTNINGFC_LAYER_ID,key: 'lightningfc', band: 'boundary', slot: 40, visible: c => c.active.has('lightningfc') },
  { id: SNOW_LAYER_ID,       key: 'snow',        band: 'boundary', slot: 50, visible: c => c.active.has('snow') },
  { id: ROTATION_LAYER_ID,   key: 'rotation',    band: 'boundary', slot: 60, visible: c => c.active.has('rotation') },
  // Fusions-/Modell-Niederschlag: seit N1/D-14 stillgelegt — Spec bleibt, damit
  // Funktionserhalt und Historie sichtbar sind; Wiederbelebung = eine Zeile.
  { id: 'precip-forecast',                       band: 'boundary', slot: 70, visible: () => false },
  { id: NOWCAST_LAYER_ID,    key: 'nowcast',     band: 'boundary', slot: 80,
    visible: c => c.active.has('nowcast') && c.precipFrameReady && c.radarModelActive },
  { id: FLOW_NOWCAST_LAYER_ID, key:'flownowcast',band: 'boundary', slot: 90,
    visible: c => c.active.has('flownowcast') && c.radarModelActive },
  { id: POP_LAYER_ID,        key: 'poprob',      band: 'boundary', slot: 100,
    visible: c => c.active.has('poprob') && c.radarModelActive },
  { id: 'clouds',            key: 'clouds',      band: 'boundary', slot: 110, visible: c => c.active.has('clouds') },
  // ⚠ KONTRAKT: Wind liegt bewusst ÜBER Grenzen/Labels (heute: addLayer ohne beforeId).
  { id: 'wind',              key: 'wind',        band: 'top',      slot: 10, visible: c => c.active.has('wind') },
  { id: CONFIDENCE_LAYER_ID, key: 'confidence',  band: 'boundary', slot: 120, visible: c => c.active.has('confidence') },
  { id: SAT_LAYER_ID,        key: 'sat',         band: 'boundary', slot:   5, visible: c => c.active.has('sat') },
  { id: LIGHTNING_LAYER_ID,  key: 'lightning',   band: 'boundary', slot: 115, visible: c => c.active.has('lightning') },
  { id: SNOWLINE_CASING_ID,                      band: 'above-mask', slot: 10, visible: c => c.active.has('snowline') },
  { id: SNOWLINE_LAYER_ID,   key: 'snowline',    band: 'above-mask', slot: 20, visible: c => c.active.has('snowline') },
  { id: STATIONS_LAYER_ID,   key: 'stations',    band: 'above-mask', slot: 30, visible: c => c.active.has('stations') },
  { id: DIM_LAYER_ID,                            band: 'boundary', slot:   0, visible: () => true },
] as const;
```

```ts
// src/map/applyLayerState.ts — der EINZIGE Ort, der MapLibre anfasst.
export function applyLayerState(map: MapLibreMap, ctx: LayerCtx): void {
  const vis = resolveVisibility(LAYER_REGISTRY, ctx);
  for (const [id, on] of Object.entries(vis)) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  }
  // Genau EINE Hebe-Schleife, ersetzt die heutigen 5 verstreuten moveLayer-Aufrufe:
  for (const spec of resolveOrder(LAYER_REGISTRY, 'above-mask')) {
    if (map.getLayer(spec.id)) map.moveLayer(spec.id);  // ohne beforeId = ganz nach oben
  }
}
```

**Was byte-identisch bleiben MUSS:**
1. Die **finale** Z-Ordnung (nicht der Weg dorthin). Golden-Vergleich aus Schritt 0.
2. Die **finale** Sichtbarkeitsmenge über die gesamte Eingabematrix.
3. Wind ohne `beforeId` (`band: 'top'`).
4. Der `styledata`-Retry-Wrapper (`MapView.tsx:2812-2816`) — er ist keine Kosmetik, sondern die Antwort auf ein reales „`load` feuert nicht"-Problem unter Request-Sättigung.
5. Der Aufruf-**Zeitpunkt**: `applyVisibility()` läuft heute am Ende von `addLayers` (`:1087`); der Applier muss an derselben Stelle laufen, nicht früher.
6. Die Maske-über-Scalars-/Stationen-über-Maske-Beziehung (Depth-Test-Kontrakt, `architecture.md` §3).

**Was regressieren könnte — die konkreten Fallen:**
- **Falle A:** Naive Sortierung schiebt Wind unter die Labels → optische Regression, im Screenshot sofort sichtbar.
- **Falle B:** `above-mask`-Hebung zu früh (vor dem Setzen der Länder-Maske) → der dokumentierte „Regen über Belgien/Slowenien"-Bug kehrt zurück (`MapView.tsx:855-858`).
- **Falle C:** Die Registry sortiert *alle* Layer, auch die, die MapLibre noch nicht kennt (Satellit/Blitze/Stationen werden erst bei Aktivierung angelegt: `:1259`, `:1291`, `:1738`). Jeder Zugriff braucht weiter das `map.getLayer(id)`-Guard.
- **Falle D:** Der TDZ-Zufall bei `:1087`/`:1089` — beim Umbau darf die Reihenfolge nicht „glattgezogen" werden, ohne den Ausführungszeitpunkt zu prüfen.

**Verifikation / Gate G-O04-1:**
1. `node scripts/verify-layer-registry.mjs` grün gegen die Golden-Datei (Ordnung **und** Wahrheitstabelle).
2. `npm run typecheck` grün.
3. MCP-Screenshot-Diff gegen die Schritt-0-Baseline: **0 abweichende Pixel** für alle 16 Einzel-Layer + 4 Kombinationen, Desktop 1440×900.
4. Mobile 390×844: dieselben Screenshots, visuelle Gleichheit (kein Pixel-Diff-Zwang wegen DPR-Rundung).
5. `map.moveLayer`-Aufrufe im Diff: von 17 auf ≤ 3 gefallen.
6. Konsole error+warn leer.
7. Die fünf Selbstverifikations-Fragen schriftlich.

---

### **Schritt 2 — Layer-Fabrik (Aufwand S–M · Risiko: niedrig)**

**Was sich bewegt:** `MapView.tsx:888-1032` (die 13 `new WindLayer/ScalarLayer/RainLayer/CloudLayer/ConfidenceLayer`-Konstruktionen samt Farbrampen, Opazitäten, DEM-Optionen) → `src/map/createWeatherLayers.ts`, das ein typisiertes Record zurückgibt, das direkt in `layerRefs.current` passt (`:571`).

**Byte-identisch:** jede einzelne Konstruktor-Option. Die Konstruktoren fassen kein GL an (GL erst in `onAdd`) → reine Verschiebung.
**Regressionsrisiko:** ein vertippter Zahlenwert bei Opazität/`speedFactor`/`upsample`. Gegenmittel: der Diff muss ein reiner Move sein (`git diff --color-moved` prüfen), keine Zeile inhaltlich geändert.
**Gate G-O04-2:** Screenshot-Diff = 0 px (alle Layer einzeln), Typecheck grün, Diff enthält keine geänderte Literal-Zeile.

---

### **Schritt 3 — Fetch-/Install-Orchestrierung (Aufwand M–L · Risiko: HOCH — der heikelste Schritt)**

**Was sich bewegt:** die 14 `install*`-Closures aus dem Mega-Effekt (`:1489-1750` u. a. `installClouds`, `installWind`, `installTemp`, `installGust`, `installThunder`, `installLightningFc`, `installSnow`, `installRotation`, `installSatelliteLayer`, `installStationsLayer`, `installLightningLayer`, `loadRzc`/`loadRv`/`loadInca`) plus die 14 `install*Ref`-Handles (`:603-680`) plus die 12 fast identischen Aktivierungs-Effekte (`:1894-1970`) → **eine** Tabelle + **ein** Hook.

```ts
// src/map/useWeatherLayerData.ts (Skizze)
interface LayerDataSpec<T> {
  key: LayerKey;
  fetch(signal: AbortSignal, onPartial: (p: T) => void, opts: NowOpts): Promise<T>;
  assign(refs: LayerRefs, data: T): void;
  statusLabel: string;
  /** Temp ist Sonderfall: lädt auch ohne aktiven Toggle (Stadt-Labels), aber
   *  per requestIdleCallback HINTER dem Hero-Layer (MapView.tsx:1990-1996). */
  eager?: 'idle';
  /** Nur Temp: Doppel-Load-Guard (tempLoadingRef, MapView.tsx:1589). */
  singleFlight?: boolean;
}
```

**Was byte-identisch bleiben MUSS — die drei fragilsten Verhaltensweisen der Datei:**
1. **Der Abort-/StrictMode-Nachhol-Retry** (`MapView.tsx:1607-1613` bei Temp, `:1572` bei Wind): Läuft ein *abgebrochener* Installer aus, nachdem sein Guard den Neustart des Remounts geschluckt hat, wird der frische Installer per `setTimeout(…, 0)` nachgeholt — und `installTempRef` ist nach echtem Unmount genullt (`:1851`), damit das ein No-op wird. Diese Choreographie muss 1:1 überleben.
2. **`tempLoadingRef` als Single-Flight-Guard**, synchron **vor** jedem `await` gesetzt (`:1589-1590`) — sonst feuern Aktivierungs-Effekt und `requestIdleCallback` im selben Tick doppelt.
3. **Die `nowOnly`/`aheadHours`-Durchreichung** (`:1477, 1504, 1559, 1598, 1626`) inklusive des `embedded`-Sonderfalls.

**Was regressieren könnte:** doppelte Netz-Requests (Guard verloren), fehlende Requests (Guard zu scharf), hängende Layer nach Remount. **Deshalb ist die Gate-Bedingung hier eine Netz-Messung, nicht nur ein Screenshot.**

**Gate G-O04-3:**
1. Toggle-Matrix: jeder der 16 Layer einzeln an → aus → an; Requestzahl und Bytes je Toggle **≤** Baseline (Methodik `audit/live-network-audit.md` §1).
2. Doppel-Mount-Probe (React-StrictMode im Dev): kein Layer bleibt leer, keine doppelten Fetches.
3. Screenshot-Diff = 0 px.
4. Konsole leer, Typecheck grün.

---

### **Schritt 4 — Slider-/Frame-Effekte (Aufwand M · Risiko: mittel)**

**Was sich bewegt:** die ~14 Effekte `:2079-2560`, alle mit demselben Muster („Layer aktiv & Daten da → Frame zur Gültigkeitszeit wählen → `setFrame` → `reportValidAt`"), in einen tabellengetriebenen `useLayerFrames`.
**Byte-identisch:** die Interpolationen — Wolken-Byte-Lerp mit Pufferwiederverwendung (`:2313-2323`), Wind-Interpolation **im Geschwindigkeitsraum** (`:2333 ff.`), `bracketAtValidTime`-Semantik, `reportValidAt`-Aufrufzeitpunkte, die `fusionActiveFor(...)`-Vortritts-Regeln (`:2308`).
**Regressionsrisiko:** ruckelndes statt weiches Scrubbing (falscher Interpolationspfad), falscher „gültig ab"-Zeitstempel im Readout.
**Gate G-O04-4:** Slider von 0 bis `sliderMax` in Einzelschritten für Temp/Wind/Wolken/Niederschlag; Readout-Zeitstempel identisch zur Baseline; keine Long Task > 200 ms (Main-Thread-JS ist emulator-belastbar); Screenshot bei 3 festen Stunden je Layer = 0 px Diff.

---

### **Schritt 5 — Deck-UI (Aufwand M · Risiko: niedrig, Diff aber groß)**

**Was sich bewegt:** JSX `:3443-3879` + Render-Helfer `:2969-3442` + `DECK_GROUPS`/`LAYER_BY_KEY` (`:3818-3878`) + `DeckSearch` (`:3881-3971`) → `src/map/MapDeck.tsx`, `MapDeckMobile.tsx`, `DeckSearch.tsx`. Rein präsentational, props-getrieben.
**Byte-identisch:** jede Klasse, jede `aria-*`-Angabe, die Breakpoint-Logik (`useMediaQuery`), die Sheet-Snap-Mechanik (`:2969-2990`), die auskommentierten `DECK_GROUPS`-Einträge (als Kommentar **mitnehmen** — sie sind Jans dokumentierte Ausblendung, kein Müll).
**Regressionsrisiko:** Sheet-Drag-Verhalten, Fokus-Reihenfolge, Safe-Area.
**Gate G-O04-5:** Pixel-Diff Desktop 1440×900 **und** 1439/767-px-Breakpoint-Grenzen; Touch-Targets ≥ 44 px nachgemessen; Sheet-Snap collapsed/half/full je Screenshot.

---

### **Schritt 6 — Punkt-Forecast-Verdrahtung (Aufwand S · Risiko: niedrig)**

`PointForecastPanel`-Props, Lawinen-Linktabelle, Open-Meteo-Consent-Gate (D-18) und der Marker-/`ensureMarker`-Block (`:2639`) → `usePointForecastWiring.ts`.
**Gate G-O04-6:** Panel-Screenshot je Tab (Überblick/Diagramme/Tabelle) = 0 px; Consent-Gate verhält sich unverändert (Open-Meteo bleibt default aus).

---

### **Schritt 7 — Restfläche & Abschluss (Aufwand S)**

`MapView.tsx` ist danach Komposition: Props, `useWeatherLayerData`, `useLayerFrames`, `usePointForecastWiring`, `applyLayerState`, `<MapDeck … />`. **Zielmarke ≤ 400 LOC.**
**Abschluss-Gate G-O04-7:** vollständiger 16-Layer-Funktionsdurchlauf mit Beleg; `architecture.md` §3 aktualisiert; `agents.md` §3 Sperrzone von „`MapView.tsx`" auf „`src/map/applyLayerState.ts` + `layerRegistry.ts`" umgeschrieben (die neuen Engstellen).

### 5.8 Reihenfolge-Begründung in einem Satz je Schritt

| Schritt | Warum an dieser Stelle |
|---|---|
| 0 | Ohne Golden-Verifier ist jeder folgende Schritt unbelegbar. |
| 1 | Entfernt die **bekannte** Regressionsquelle zuerst und schafft die Struktur, an der alle späteren Schritte hängen. |
| 2 | Billig, risikoarm, macht Schritt 3 lesbar — und ist Voraussetzung für die spätere Lazy-Konstruktion (R10). |
| 3 | Der riskanteste Schritt — kommt erst, wenn Verifier und Struktur stehen. |
| 4 | Baut direkt auf 3 auf (dieselben Refs), aber mit anderem Gate (Slider statt Toggle). |
| 5 | Größter Diff, billigste Verifikation (Pixel-Diff) — bewusst nach den Logik-Schritten, damit ein UI-Diff nie mit einem Logik-Diff kollidiert. |
| 6 | Kleiner Rest, eigenes Gate. |
| 7 | Aufräumen + Doku nachziehen. |

### 5.9 Was dieser Plan **nicht** tut (bewusst)

- Er löscht **nichts** — auch nicht `precip-forecast` oder die 5 ausgeblendeten Layer (Löschung = STOPP, §8).
- Er ändert **kein** Lade-Timing, insbesondere nicht das Fusion-Timing (STOPP).
- Er fasst **keinen** Shader, kein RGBA8-Packing, keine Governor-Semantik an.
- Er führt **keine** neue Abhängigkeit ein (kein State-Manager, kein Router) — D-06 bleibt gewahrt.

---

## 6. Vorgeschlagene V-Einträge

> Nummerierung `V-RND-NN` für diese Session; die Zuordnung zu freien `V-NN`-Nummern in `improvements.md` (nächste freie: V-17) macht der Koordinator. **V-14 (MapView-Zerlegung) wird nicht dupliziert** — §5 dieses Dokuments ist der Inhalt für V-14; V-RND-02 ist ausdrücklich als dessen **erster gate-fähiger Schritt** formuliert. **V-08 (Alt-Ballast)** wird durch V-RND-11 **präzisiert und korrigiert**, nicht dupliziert.

### V-RND-01 · Fusion-Engine und GRIB-Decoder aus dem Startseiten-Bundle nehmen (Priorität P1 · Aufwand S · Status offen)
**Was:** `src/SearchPage.tsx:33` importiert `warmMapData` statisch aus `src/fusion/loadFusedForecast.ts`. Dieses Modul zieht statisch die komplette Fusion-Engine, **17 Wettermodell-Quell-Adapter** (`loadFusedForecast.ts:21-38`) und über `src/sources/iconD2EpsSource.ts:26` den handgeschriebenen **GRIB2-Decoder inkl. CCSDS-AEC** in den Eager-Chunk. Belegt durch eindeutige Marker im gebauten Bundle: `_cscs`, `_mf`, `_ecmwf`, `Barnes` und die wörtliche Fehlermeldung `"GRIB2: DRT "+E+" (nur simple packing / CCSDS-AEC)"` stehen in `dist/assets/index-DLZ0ulmr.js` — der einzigen JS-Datei, die `dist/index.html` eager lädt (383.225 B roh / **122.731 B gzip**). Dabei tut `warmMapData` heute nur noch eines: `prefetchElevation()` (`loadFusedForecast.ts:135-145`).
**Mehrwert:** Die Startseite wird spürbar schneller, besonders auf dem Handy im Mobilfunknetz. Heute lädt jeder Besucher erst einen kompletten Wetter-Daten-Decoder und 17 Modell-Anbindungen herunter, bevor er überhaupt ein Suchfeld sieht — obwohl davon auf der Startseite nichts gebraucht wird.
**Umsetzung:** Zwei Varianten, beide klein: (a) in `SearchPage.tsx` direkt `prefetchElevation` aus `src/fusion/elevation.ts` importieren statt `warmMapData`; (b) falls die Indirektion bleiben soll: `warmMapData` in ein eigenes winziges Modul ohne Fusions-Import ziehen, oder den Aufruf zu `void import('./fusion/loadFusedForecast').then(m => m.warmMapData())` machen. Risiko minimal (die Funktion hat keinen Rückgabewert und keine Aufrufer-Erwartung). Danach Marker-Gegenprobe im neuen Build (siehe V-RND-03). Keine Abhängigkeit zu O-01…O-06.
**Quelle:** Rendering & Performance (Agent-Team), 2026-07-31.

### V-RND-02 · MapView-Zerlegung Schritt 1: deklarative Layer-Registry (P1 · M · offen — konkretisiert V-14 / O-04)
**Was:** `src/MapView.tsx:1089-1136` und `:2764-2811` sind **48 Zeilen byte-identischer Code** (verifiziert per `diff`: einziger Unterschied ist der Funktionsname). Dazu kommen drei weitere Teil-Duplikate (`:845-859`, `:1383-1387`, `:1323`); `map.moveLayer(STATIONS_LAYER_ID)` steht insgesamt **fünfmal** in der Datei, `map.moveLayer` gesamt **17-mal**. Die Kommentare an diesen Stellen dokumentieren einen realen Nutzer-Bug („Regen über Belgien/Slowenien"), der genau aus einer falschen Hebung entstand.
**Mehrwert:** Änderungen an der Karte hören auf, ein Glücksspiel zu sein. Heute muss man dieselbe Reihenfolge an drei bis fünf Stellen gleich ändern — vergisst man eine, verschiebt sich ein Layer und ein Bug kehrt zurück, der schon einmal gemeldet war. Danach gibt es genau eine Liste, in der steht, was über was liegt, und ein Prüfskript, das sie gegen den heutigen Stand vergleicht.
**Umsetzung:** Vollständiger Plan mit Code-Skizze, Erhalt-Kontrakten, Fallen und Gate-Kriterien in `audit/strategie-2026-07-31/rendering-performance.md` §5, Schritte 0 und 1. Kern: pure Module `layerRegistry.ts`/`layerOrder.ts`/`layerVisibility.ts` (D-12, headless verifizierbar) plus ein einziger DOM-Applier `applyLayerState.ts`. Zwingend **vorher** Schritt 0 (Golden-Verifier + Screenshot-Baseline). Zwei Kontrakte dürfen nicht brechen: Wind liegt bewusst ÜBER Grenzen/Labels (`MapView.tsx:1060`, kein `beforeId`), und die Stationen müssen über der Länder-Maske bleiben. Abhängigkeit: O-04.
**Quelle:** Rendering & Performance (Agent-Team), 2026-07-31.

### V-RND-03 · Performance-Budget als versioniertes, prüfbares Artefakt (P1 · S · offen)
**Was:** Es gibt keinerlei laufende Performance-Messung — kein RUM (per D-02 bewusst), keine CI (V-11), kein Bundle-Size-Gate, kein Lighthouse-Lauf. Die einzigen belastbaren Zahlen stammen aus zwei manuellen Audits (2026-07-18, 2026-07-22), die vom Code inzwischen überholt sind (die Near-Horizon-Staffelung `START_NOW_ONLY`, `MapView.tsx:160-168`, kam erst am 2026-07-23 dazu). Regressionen fallen niemandem auf.
**Mehrwert:** Die Seite bleibt schnell, ohne dass jemand daran denken muss. Wird ein Import gesetzt, der das Startseiten-Paket um 80 KB aufbläht, meldet es sich beim Hochladen — statt Monate später bei einem manuellen Audit.
**Umsetzung:** (1) Budget-Tabelle nach `tests.md` (Vorschlag in §7 des Rendering-Audits): Eager-JS ≤ 90 KB gzip, Eager-CSS ≤ 8 KB gzip, Vendor-Chunk eingefroren ≤ 290 KB gzip, Feature-Chunk ≤ 80 KB gzip, LCP ≤ 2,5 s, TBT ≤ 200 ms, Bytes bis zum ersten Wetter-Pixel ≤ 8 MB, Requests je Layer-Toggle ≤ 60, Bytes je Layer-Toggle ≤ 15 MB. (2) `scripts/verify-bundle-budget.mjs` — netzunabhängig, kein Framework (passt exakt zu D-10): liest `dist/assets`, gzippt in-memory, vergleicht gegen die Tabelle, bricht bei Überschreitung. (3) Optional Lighthouse gegen die Prod-URL als nightly (nicht PR-blockierend, weil netzabhängig). Hängt an V-11 (CI-Minimum). **Wichtig:** INP und alles GPU-Nahe sind im Emulator **nicht** messbar — dafür bleibt der 🔴 Real-Device-Weg.
**Quelle:** Rendering & Performance (Agent-Team), 2026-07-31.

### V-RND-04 · WebGL2-Realität klären: die Wind-Textur läuft vermutlich still auf 8 bit (P1 · S Diagnose / M Umsetzung · offen — Umsetzung ist STOPP-Zone)
**Was:** MapLibre GL 5.24 fordert **WebGL2 zuerst** an (`node_modules/maplibre-gl/dist/maplibre-gl.js`: `getContext("webgl2",e) || getContext("webgl",e)`, Default `contextType: void 0`), und `MapView.tsx:756-777` setzt keine abweichenden `canvasContextAttributes`. In einem WebGL2-Kontext liefert `getExtension('OES_texture_half_float')` und `getExtension('OES_texture_float')` per Spezifikation **null** (beides ist dort Kernfunktionalität). `src/wind/glUtil.ts:128-133` fragt genau diese beiden ab und fällt sonst auf `'byte'` zurück ⇒ die Windgeschwindigkeit wird auf 256 Stufen quantisiert, obwohl `decodeAndRefine` vorher extra CPU-Zeit in ein weiches, kontinuierliches Feld investiert. Der Kommentar bei `WindLayer.ts:922-926` beschreibt das als Notfall-Fallback — es wäre der Regelfall. **Noch nicht durch einen Laufzeit-Test bestätigt.**
**Mehrwert:** Die Windanimation wird wieder so weich, wie sie technisch gemeint war — feinere Farbabstufungen und Geschwindigkeiten statt 256 Stufen, ohne dass ein einziges Byte mehr geladen wird. Und die Frage „Lohnt sich WebGL2?" beantwortet sich von selbst: wir sind längst dort, wir nutzen es nur nicht.
**Umsetzung:** **Zuerst reine Diagnose (S, ungefährlich):** in der laufenden App `__map.painter.context.gl instanceof WebGL2RenderingContext`, `__map.style._layers.wind.implementation.windTextureKind` (erwartet `'byte'`) und `getSupportedExtensions()` protokollieren; Ergebnis in `audit/` festhalten. **Fällt die Probe anders aus, ist dieser Eintrag hinfällig — dann bitte schließen statt reparieren.** *Erst danach*, und nur mit Jans Freigabe (Texturformat = RGBA8-/Packing-Zone, CLAUDE.md STOPP): `pickWindTextureKind` um eine WebGL2-Erkennung erweitern und `uploadPackedTexture` auf **sized internal formats** (`RGBA16F`/`HALF_FLOAT`) umstellen — Achtung, der heutige Float-Pfad (`glUtil.ts:181`, unsized `RGBA` + `FLOAT`) ist in WebGL2 **ungültig** und würde die Textur schwarz machen; ein naiver „Extension-Fix" ohne diesen Teil ist der schlimmste mögliche Ausgang. Default-off hinter einem Flag (D-11) mit dem bestehenden Byte-Pfad als benanntem Fallback. 🔴 Real-Device-Sichtprüfung Pflicht (iOS **und** Android).
**Quelle:** Rendering & Performance (Agent-Team), 2026-07-31.

### V-RND-05 · Globus auf die Renderpark-Parität der 2D-Karte heben (P1 · S–M · offen)
**Was:** Der Globus ist der einzige WebGL-Pfad ohne jede Qualitätsregelung. Vier belegte Lücken: (1) **kein DPR-Cap** — `GlobeMap.tsx:141-145` übergibt kein `pixelRatio`, die 2D-Karte cappt bei 1,5 (`MapView.tsx:767`); auf einem iPhone 12 Pro (DPR 3) bedeutet das die vierfache Pixelfläche pro Frame. (2) Der FrameGovernor wird nie gefüttert (`WindLayer.ts:1312`: `!this.globeMode`). (3) Kein FPS-Cap (`WindLayer.ts:776` schließt den Globe-Modus aus; `GlobeMap.tsx:154-159` übergibt keinen). (4) Keine Zoom-Ausdünnung (`WindLayer.ts:1168`). Dazu 18.000–48.000 Partikel (`GlobeMap.tsx:155`), im HD-Modus ×2,2 (`:163`), und ein rAF-Loop, der **unbedingt** weiterläuft, auch wenn nicht gedreht wird (`GlobeMap.tsx:184-189`).
**Mehrwert:** Der Globus wird auf dem Handy flüssig und hört auf, den Akku zu verheizen — heute ist er der mit Abstand teuerste Bildschirm der App. Er ist zugleich das beste Schaufenster der Wind-Engine gegenüber Windy/Ventusky; er soll beeindrucken, nicht das Gerät heiß machen.
**Umsetzung:** In drei kleinen, einzeln prüfbaren Änderungen, alle im Muster der bereits abgeschlossenen Phasen P/P2/P3: (a) `pixelRatio: coarsePointer ? Math.min(dpr, 1.5) : dpr` in `GlobeMap.tsx` — reine Konfiguration, kein Shader; (b) den rAF-Spin-Loop nur laufen lassen, wenn `spinning` (heute rekursiert er immer) und bei `visibilitychange` pausieren — reines Scheduling; (c) danach, separat und mit Real-Device-Beleg, die Governor-Kopplung im Globe-Modus prüfen (`WindLayer.ts:776/1312`) — **das ist Governor-Semantik und damit STOPP-pflichtig**, deshalb als eigenes Vorhaben nach (a)/(b). Passt zusätzlich zu V-10 (Globus ist der letzte Nicht-Command-Deck-Screen). 🔴 Frame-Zeit vorher/nachher nur real messbar.
**Quelle:** Rendering & Performance (Agent-Team), 2026-07-31.

### V-RND-06 · Wetter-Layer erst bei Bedarf bauen statt alle 16 beim Karten-Start (P2 · M · offen)
**Was:** Beim Öffnen der Karte werden **13 Custom-Layer** konstruiert und hinzugefügt (`MapView.tsx:1042-1063`), obwohl der Default nur einen aktiven Layer hat (`:425`: `new Set(['wind'])`). Das kompiliert und linkt **16 GLSL-Programme** (`WindLayer.ts:794-797` = 4, `ScalarLayer.ts:161` ×7, `RainLayer.ts:159` ×3, `CloudLayer.ts:107`, `ConfidenceLayer.ts:119`) und legt 13× ein 256×1-Canvas mit `getImageData`-Rückleseoperation an (`glUtil.ts:244-256`). Sechs der Layer sind über die Bedienoberfläche gar nicht erreichbar (5 Dock-Einträge auskommentiert seit 2026-07-23, `MapView.tsx:3844-3876`; `precip-forecast` hart auf `false`, `:1106`).
**Mehrwert:** Die Karte erscheint schneller, vor allem auf älteren Handys — Shader-Übersetzung ist dort messbar teuer und passiert heute 16-mal, bevor der erste Wettereindruck steht.
**Umsetzung:** Setzt V-RND-02 (Registry) voraus: dann ist „welche Layer brauche ich jetzt" eine Abfrage statt einer verstreuten Reihenfolge. Konstruktion + `addLayer` nur für Layer in `active` (plus Temp wegen der Stadt-Labels); bei Aktivierung nachträglich einfügen — die Registry kennt den Slot, also ist die Einfügeposition eindeutig. **Zwingend hinter einem Flag mit Default-off (D-11)**, weil es echtes Verhalten ändert. Vorher messen: 🔴 Real-Device-Trace der Init-Phase, sonst optimiert man ins Blaue. Der Aufräum-Teil (`precip-forecast` ganz entfernen) ist eine **Löschung → STOPP**.
**Quelle:** Rendering & Performance (Agent-Team), 2026-07-31.

### V-RND-07 · T2-7: Per-Layer-„Jetzt"-Cache in IndexedDB (P1 · M · offen)
**Was:** Nur der Wind hat einen echten Wiederbesuchs-Cache (`src/wind/iconD2WindSource.ts:704-707`, `loadWindNowCache`/`saveWindNowCache`). Temperatur, Niederschlag, Böen und Wolken nutzen ausschließlich die Cache-API für dekomprimierte GRIB-Bytes (`src/sources/iconD2Precip.ts:174`) — das spart den Download, aber nicht das Dekodieren und den Texturaufbau. Der als T2-7 spezifizierte Hebel (`audit/layer-transport.md:57`) ist ausdrücklich **vertagt** (`:75`) und im Code nirgends umgesetzt.
**Mehrwert:** Wer die Karte ein zweites Mal öffnet, sieht sofort ein Bild statt eines Ladebalkens — auch im Zug ohne Empfang. Der Wind macht das heute schon; die anderen Layer nicht.
**Umsetzung:** Das Wind-Muster generisch ziehen: ein `nowCache`-Modul mit versioniertem Schlüssel je (Layer, Gitter, Lauf), 24-h-Staleness-Guard und `rgbaToCanvas`-Rekonstruktion; die Grids sind wie beim Wind ortsunabhängig (feste ICON-D2-DACH-Domäne), also genügt ein globaler Schlüssel pro Layer. Speichern beim ersten erfolgreichen Frame, laden **vor** dem Fetch. Rein additiv, keine Änderung an Transport/Edge/Cron (also keine STOPP-Zone). Sinnvoll **nach** V-RND-02/03, damit der Effekt messbar ist.
**Quelle:** Rendering & Performance (Agent-Team), 2026-07-31.

### V-RND-08 · T2b-4: EPS-Vor-Resampling im Cron — der einzige Hebel gegen die 192-MB-Fusionslast (P2 · L · offen)
**Was:** Das Aktivieren des Temperatur-Layers löst die volle EPS-Fusion aus: **397 Requests, 194,6 MB, ~17 s** auf einer 11-MB/s-Leitung, davon **191,98 MB in 17 EPS-Dateien** (`audit/live-network-audit.md` §3.2). Die Edge liefert dabei bereits Cache-Treffer — T2b wirkt, aber 192 MB bleiben 192 MB. Auf mobilem 4G (~2 MB/s) sind das rechnerisch **rund 96 Sekunden**; dazu kommt das teure ikosaedrische Resampling im Browser. Das vorgesehene Gegenmittel T2b-4 (`audit/layer-transport.md:185`) ist **nicht umgesetzt** (`:199`, `:239`).
**Mehrwert:** Die Fusions-Temperatur wird auf dem Handy überhaupt erst benutzbar. Heute ist sie dort faktisch kaputt — nicht weil sie falsch rechnet, sondern weil niemand anderthalb Minuten wartet.
**Umsetzung:** Groß und mehrere Rollen: das ikosaedrische EPS einmal server-seitig im bestehenden `warm-grib`-Cron dekodieren (`decodeGrib2All` läuft in Node), Member-Mittel bilden, auf das Ausgabegitter resamplen und als kompaktes Artefakt ausliefern; der Client lädt es direkt. **Pflicht:** Output-**Äquivalenz** mit numerischem Zell-für-Zell-Beweis gegen die heutige Client-Berechnung (es ist ein abgeleitetes Artefakt, keine Byte-Identität). Berührt Cron-/Manifest-Mechanik ⇒ **STOPP & FRAGEN, Prod-Dispatch ist Jans Gate**; die Äquivalenz-Prüfung gehört zur Rolle Daten & Meteorologie. Die davon getrennte, aber verwandte Frage — *wann* die Fusion EPS überhaupt lädt — ist eine Fusion-Engine-Verhaltensänderung und hier ausdrücklich **nicht** vorgeschlagen (§8).
**Quelle:** Rendering & Performance (Agent-Team), 2026-07-31; Zahlen aus `audit/live-network-audit.md` (2026-07-22).

### V-RND-09 · Redundante Radar-Fetches koalieren und den „Sicherheit"-Layer auf den gecachten Pfad heben (P1 · S · offen)
**Was:** Drei belegte Doppelarbeiten je Aktualisierungs-Tick (`audit/live-network-audit.md` §3.3): (a) das RADOLAN-`rv/`-Verzeichnis-Listing (**157,7 KB, immer ungecacht**) und der zugehörige Tar (~510 KB) werden **je zweimal** geholt, weil zwei Konsumenten den Radarstand parallel auflösen und es kein geteiltes Promise gibt; (b) der Layer „Sicherheit"/Konfidenz lädt 5 `t_2m`-Dateien (~4,8 MB) erneut über das Netz, obwohl exakt dieselben URLs bereits in der Cache-API liegen — er nimmt einen anderen Fetch-Pfad ohne `fetchDecompressedCached`; (c) `PrecipCompositor.build()` (`src/scalar/precipComposite.ts:196-224`) rechnet den 600×512-Gather bei jedem Slider-Schritt neu, auch beim Zurückscrubben auf eine schon berechnete Stunde.
**Mehrwert:** Weniger Wartezeit und weniger Funk-Aufwachen auf dem Handy, ohne dass sich irgendetwas an den angezeigten Daten ändert — das ist reine Verschwendung, die man einfach abstellen kann.
**Umsetzung:** (a) Ein geteiltes Promise pro (Produkt, Zeitstempel) — das Muster existiert im Code bereits (`tempLoadingRef` als Single-Flight-Guard, `MapView.tsx:1589`); (b) den Lagged-Run-Vergleich auf `fetchDecompressedCached` umstellen; (c) kleiner LRU-Cache für `CompositeFrame`, Schlüssel = Frame-Identität je Quelle + `forecastHour`. **Ehrlichkeitshinweis:** (c) wurde in `audit/performance-2d.md` §5 bewusst *nicht* umgesetzt, weil der Gather mit ~2,2 ms Desktop-CPU unter dem Frame-Budget liegt — es ist ein Komfort-, kein Notfall-Hebel und sollte auch so priorisiert werden. Alle drei sind additiv, keine STOPP-Zone.
**Quelle:** Rendering & Performance (Agent-Team), 2026-07-31; Belege aus `audit/live-network-audit.md`.

### V-RND-10 · Schriftarten selbst ausliefern statt von Google laden (P1 · S · offen)
**Was:** `index.html:11-13` lädt drei Schriftfamilien mit **13 Gewichten** render-blockierend von `fonts.googleapis.com`, die Dateien selbst von `fonts.gstatic.com`. Zwei Fremd-Origins auf dem kritischen Pfad des ersten Bildaufbaus — trotz `preconnect` mindestens ein zusätzlicher Verbindungsaufbau, bevor Text erscheint.
**Mehrwert:** Die Seite zeigt ihren Text früher, unabhängig davon, wie schnell Google gerade antwortet — und die Besucher-IP verlässt die Seite nicht mehr. Letzteres passt zu dem, was buscosun über sich sagt („trackerfrei"): heute erfährt Google bei jedem einzelnen Seitenaufruf, wer die Seite besucht.
**Umsetzung:** Die tatsächlich verwendeten Schnitte als WOFF2 nach `public/fonts/` legen, `@font-face` mit `font-display: swap` in `src/designTokens.css` (bereits eager geladen), die Google-Links aus `index.html` entfernen, ungenutzte Gewichte streichen (13 Gewichte sind für ein Design-System viel — Bedarf gegen `designTokens.css` prüfen). Vorher die Lizenzlage bestätigen (alle drei sind SIL OFL, also unproblematisch — **formale Prüfung gehört zur Rolle SEO/GEO & Recht**). Vereinfacht zusätzlich die CSP aus V-07 (zwei Fremd-Origins weniger).
**Quelle:** Rendering & Performance (Agent-Team), 2026-07-31.

### V-RND-11 · Karten-Altlasten präzise entfernen — korrigiert und schärft V-08 (P2 · S · offen)
**Was:** Drei belegte Funde, plus zwei Korrekturen an V-08. **Funde:** (1) `src/MapView.css` (67.889 B) enthält **~70 von 258 Klassenselektoren ohne jede Referenz** in `.ts`/`.tsx` — im Kern das alte Karten-Sheet (`map-sheet-*`, ~30 Klassen), der alte Modell-Switcher (`ms-*`, `mls-*`), `left-rails*`, `layer-switch*`, `wind-particle-switch`, `wpc-*`; `src/map/mapDeck.css` ist dagegen sauber (21/245, überwiegend MapLibre-Built-ins). (2) `public/wind/wind.png` (87.117 B) + `wind.json` werden ausgeliefert, aber von niemandem geladen — beide `new WindLayer(...)`-Aufrufe setzen `windPngUrl: ''` (`MapView.tsx:889`, `GlobeMap.tsx:158`), die Defaults in `WindLayer.ts:756-757` laufen nie. (3) Der Layer `precip-forecast` wird bei jedem Karten-Init voll aufgebaut, steht aber seit N1/D-14 fest auf unsichtbar (`MapView.tsx:1106`, `:2781`). **Korrekturen an V-08:** Die „77-KB-Stationstabelle im Bundle" ist **kein** Bundle-Problem — sie ist ein dynamisch geladener eigener Chunk (`src/history/meteostatSource.ts:72`), 67,5 KB roh / 27,1 KB gzip, und lädt nur für Historie-Nutzer. Und der Netz-Gewinn der toten CSS ist klein: die gebaute MapView-CSS liegt bei 14,2 KB gzip, 30 % davon sind ~4 KB.
**Mehrwert:** Weniger Verwirrung für jeden, der später an der Karte arbeitet — heute steht dort ein komplettes zweites, totes Bedienkonzept im Stylesheet. Der Ladezeit-Gewinn ist ehrlich gesagt klein; der Klarheitsgewinn ist groß.
**Umsetzung:** Löschliste je Fund mit Import-/Referenz-Beleg erstellen (die dynamisch zusammengesetzten Klassennamen `sat-product-${…}` und `temp-label-rank-${…}` sind Fehlalarme und müssen bleiben). **Löschungen brauchen Jans Freigabe (STOPP)** — deshalb: Liste vorlegen, dann in einem Rutsch entfernen, danach Screenshot-Diff = 0 px als Gate. Die Stationstabelle bleibt als eigener, kleinerer Punkt (TS-Literal → lazy JSON, spart Parse-Zeit).
**Quelle:** Rendering & Performance (Agent-Team), 2026-07-31 (erweitert und korrigiert V-08).
### V-RND-12 · Unsicherheit sichtbar machen: das σ-Feld der Fusion auf die Karte bringen (P2 · L · offen — STOPP-Zone)
**Was:** Die Maschinerie ist gebaut, aber nicht angeschlossen. `src/fusion/uncertainty.ts` berechnet das kalibrierte σ-Feld (Analyse-Fehler + Multi-Modell-Spread, Paper-Gl. 15) und kann es als PNG kodieren (`encodeSigmaPng`) — der Modulkopf sagt aber ausdrücklich: „This module is PLUMBING only — the existing 4-layer output is untouched; nothing here is wired into `run()`'s emitted layers yet." Auf der Anzeigeseite existiert bereits ein voll funktionsfähiger Unsicherheits-Renderer: `src/scalar/ConfidenceLayer.ts` zeichnet eine Kreuzschraffur, deren Dichte mit der Unsicherheit wächst — er wird heute aus Heuristiken gespeist (`src/scalar/confidenceImage.ts`) und ist im Dock seit 2026-07-23 sogar ausgeblendet (`MapView.tsx:3876`).
**Mehrwert:** buscosuns wichtigstes Versprechen — „wir sagen ehrlich, wie sicher wir uns sind" — bekommt endlich ein Bild. Statt einer geschätzten Schraffur zeigt die Karte die *gerechnete* Unsicherheit: hier ist die Vorhersage belastbar, dort raten wir. Das ist genau die Differenzierung, die kein Wettbewerber im DACH-Raum flächig anbietet.
**Umsetzung:** Kein Neubau, sondern eine Verdrahtung in drei Etappen: (1) σ als fünfte Textur aus der Fusion emittieren — **das ändert den Textur-Kontrakt der Engine und ist laut Modulkopf ein ausdrücklicher „hard stop requiring explicit approval" ⇒ STOPP & FRAGEN Jan** (§8); (2) `ConfidenceLayer` optional aus dem σ-PNG statt aus der Heuristik speisen, hinter einem Flag mit der Heuristik als benanntem Fallback (D-11); (3) Legende + Formulierung nach D-04 (Unsicherheit ausweisen, nie kaschieren) und den Dock-Eintrag wieder einblenden. Setzt V-RND-02 (Registry) voraus, damit der Layer sauber einsortiert wird, und hängt am Fusion-v2-Cutover-Pfad (V-15/D-13). Abhängigkeit zur Rolle Daten & Meteorologie für die σ-Kalibrierung.
**Quelle:** Rendering & Performance (Agent-Team), 2026-07-31.

### V-RND-13 · Zugbahnen und Ankunftszeiten aus dem vorhandenen Bewegungsfeld zeichnen (P2 · M · offen)
**Was:** Das teure Stück existiert schon und wird bereits gerechnet: `src/ml/opticalFlowNowcast.ts` liefert ein Horn-Schunck-Bewegungsfeld aus zwei Radar-Frames, `advect` verschiebt damit den jüngsten Frame, `src/ml/flowEnsemble.ts` erzeugt daraus ein stochastisches Ensemble. Der Flow-Nowcast-Layer verbraucht das heute **ohne einen einzigen Netz-Request** (`audit/live-network-audit.md` §3.2: „Flow-Nowcast: 0 Dateien, 0 B — perfekter Warm-Reuse"). Sichtbar gemacht wird davon aber nur das verschobene Regenbild. Die Zellverfolgung inklusive Ankunftszeit-Trichter existiert bereits — allerdings nur auf der *Regenradar*-Seite (`src/radar/cellTracking.ts`, `etaToPoint`), nicht auf der 2D-Karte.
**Mehrwert:** Statt „hier regnet es gleich" zeigt die Karte, **woher** der Regen kommt und **wann** er da ist — die Frage, wegen der die meisten Menschen eine Wetter-App öffnen. Und es kostet praktisch keine Ladezeit, weil die Rechnung ohnehin läuft.
**Umsetzung:** Ein neuer Layer nach dem Muster der bestehenden ScalarLayer, gespeist aus dem bereits vorhandenen Flow-Feld: Isochronen-Linien (Zeit bis zum Eintreffen am angetippten Punkt) und/oder Zugbahn-Pfeile. `src/radar/cellTracking.ts` und `etaToPoint` sind wiederverwendbar; die Registry aus V-RND-02 liefert Einsortierung und Sichtbarkeit. Rein additiv, kein Eingriff in bestehende Layer, kein neues Datenpaket. Ehrlichkeitspflicht (D-04): jenseits des Radar-Horizonts (DE 2 h · AT 3 h · CH 0,5 h) endet die Aussage — das muss die Optik zeigen, nicht verstecken. Sinnvoll **nach** V-RND-02.
**Quelle:** Rendering & Performance (Agent-Team), 2026-07-31.

### V-RND-14 · Vertikalschnitt in die 2D-Karte holen (P3 · L · offen)
**Was:** Die komplette Vertikal-Maschinerie liegt als Bibliothek bereit — `src/threed/crossSection.ts` (Schnitt-Berechnung), `CurtainLayer.ts` (ein fertiger MapLibre-Custom-Layer für die vertikale „Vorhang"-Darstellung), `sectionGeometry.ts`, `soundingMath.ts` — und wird heute ausschließlich von der Atmosphäre-Seite konsumiert (`architecture.md` §8). `src/threed/ThreeDPage.tsx` ist tot. Auf der 2D-Karte gibt es keinerlei vertikalen Zugang: wer wissen will, wie es 1.500 m über dem angetippten Punkt aussieht, muss die Karte verlassen.
**Mehrwert:** Die Alpin-Tiefe — buscosuns stärkstes Unterscheidungsmerkmal gegen die großen Wetter-Apps — wird dort erreichbar, wo die Leute ohnehin sind. Ein Tipp auf den Berg, und man sieht Inversion, Föhn und Wind in der Höhe, ohne die Karte zu wechseln.
**Umsetzung:** Groß, deshalb P3: (1) Einstiegspunkt in der Karte definieren (zwei Punkte setzen → Schnitt, oder ein Punkt → Vertikalprofil); (2) `CurtainLayer` über die Registry (V-RND-02) einsortieren — er ist bereits ein MapLibre-Custom-Layer, muss also nicht portiert werden; (3) UI im Command-Deck-Standard (D-27), Zusammenspiel mit der Atmosphäre-Seite mit der Rolle UX klären, damit keine zwei Bedienkonzepte für dieselbe Sache entstehen; (4) Datenpfad ist ICON-EU-Drucklevel — Ladebudget vorher gegen V-RND-03 prüfen, sonst entsteht ein zweiter 192-MB-Fall. Setzt V-RND-02 voraus.
**Quelle:** Rendering & Performance (Agent-Team), 2026-07-31.

---

## 7. Bewertung gegen die vier Differenzierungs-Achsen (`roadmap.md` §C)

Achsen: **(1)** Entscheidungs- statt Datenprodukt · **(2)** Alpin-/Vertikal-Tiefe · **(3)** radikale Ehrlichkeit · **(4)** trackerfrei / ohne Account / **schnell**.

| Initiative | A1 | A2 | A3 | A4 | Bewertung |
|---|:--:|:--:|:--:|:--:|---|
| R1 / V-RND-01 Eager-Bundle | — | — | — | **★★★** | Zahlt direkt auf „schnell" ein, die einzige Achse, die man verlieren kann, ohne es zu merken. Höchste Wirkung pro Aufwand im ganzen Dokument. |
| R2 / V-RND-02 Layer-Registry | ○ | ○ | ○ | ★ | Keine direkte Nutzerwirkung — aber **Ermöglicher** für V-RND-12/13/14, die auf A2/A3 einzahlen. Wer die Karte nicht gefahrlos ändern kann, baut auch keine Referenzoptik. |
| R3 / V-RND-03 Budget | — | — | ★ | **★★★** | „Schnell" ohne Messung ist eine Behauptung. Passt zudem zu A3: eine Plattform, die Unsicherheit ausweist, sollte auch ihre eigene Leistung messen. |
| R4 / V-RND-04 WebGL2 | — | — | ★ | ★★ | Visuelle Qualität ohne Byte-Kosten; A3, weil die Doku heute etwas anderes behauptet als der Code tut. |
| R5 / V-RND-05 Globus | — | ○ | — | ★★ | Reine A4-Sache (Akku, Flüssigkeit). Der Globus selbst ist per D-05 bewusst Kontext, kein Kernversprechen. |
| R7 / V-RND-07 Jetzt-Cache | ★★ | — | — | **★★★** | A1: „Regnet es gleich?" wird zur Sofortantwort statt zur Ladeanzeige. |
| R8 / V-RND-08 EPS-Vor-Resampling | ★ | — | ★★ | **★★★** | A3: Ein Feature, das mobil 96 s lädt, ist de facto nicht vorhanden — es als vorhanden zu führen wäre unehrlich. |
| V-RND-12 σ-Layer | ★ | ★ | **★★★** | — | Die stärkste A3-Initiative überhaupt: gerechnete statt geschätzte Unsicherheit, flächig. |
| V-RND-13 Isochronen | **★★★** | ★ | ★★ | ★★ | Reinste A1-Initiative: beantwortet eine Entscheidung („losfahren oder warten?"), nicht eine Datenfrage — und kostet fast nichts, weil das Bewegungsfeld schon gerechnet wird. |
| V-RND-14 Vertikalschnitt in 2D | ★★ | **★★★** | ★ | — | Stärkste A2-Initiative; großer Aufwand, deshalb P3. |
| V-RND-10 Fonts | — | — | ★★ | ★★ | A4 doppelt: schneller **und** ohne Fremd-Origin. Heute erfährt Google jeden Seitenaufruf — das widerspricht der eigenen Positionierung. |
| V-RND-06 Lazy Layer | — | — | — | ★★ | A4, aber erst messen, dann bauen. |
| V-RND-09 Doppel-Fetches | — | — | ★ | ★★ | Reine Verschwendung abstellen. |
| V-RND-11 Altlasten | — | — | ○ | ★ | Ehrlicherweise: kaum Nutzerwirkung, hoher Klarheitsgewinn intern. |

**Achsen-Schluss:** Die Rendering-Ecke ist bei **A4 („schnell")** am stärksten gefordert und liefert dort auch die billigsten Siege (R1, R3, R7). Bei **A3 („Ehrlichkeit")** liegt der größte ungenutzte Schatz: das σ-Feld ist *fertig gerechnet* und wird nicht gezeigt. Bei **A1/A2** ist die Maschinerie ebenfalls vorhanden (Flow-Feld, Cross-Section-Bibliothek) — es fehlt jeweils nur die Karten-Anbindung, und die ist heute durch das MapView-Monolithrisiko blockiert. **Das ist das strategische Kernargument für O-04: Die MapView-Zerlegung ist keine Aufräumarbeit, sie ist die Voraussetzung für drei von vier Differenzierungs-Achsen.**

---

## 8. STOPP & FRAGEN an Jan

| # | Thema | Warum STOPP | Was entschieden werden muss |
|---|---|---|---|
| **S1** | **WebGL2-Texturformat** (V-RND-04) | Berührt Texturformat/Packing-Pfad — per CLAUDE.md tabu | Darf nach bestätigter Diagnose ein **flag-gegateter** WebGL2-Pfad (RGBA16F/HALF_FLOAT, sized internal formats) gebaut werden, mit dem heutigen Byte-Pfad als Default-Fallback? **Erst die Diagnose (§2.5) — die ist ungefährlich und braucht keine Freigabe.** |
| **S2** | **Fusion-Lade-Timing** | Fusion-Engine-Verhaltensänderung | Heute zieht der *Temperatur*-Toggle die volle EPS-Fusion (`MapView.tsx:2000-2004`, 192 MB / ~17 s). Soll das entkoppelt werden (On-Demand / Deferral)? **Hier ausdrücklich nur benannt, nicht vorgeschlagen** — Übernahme des STOPP-Vermerks aus `audit/live-network-audit.md` §4.10. |
| **S3** | **σ-Feld als fünfte Fusions-Textur** (V-RND-12) | `src/fusion/uncertainty.ts` Modulkopf: „hard stop requiring explicit approval" | Darf die Fusion eine fünfte Ausgabe-Textur emittieren? Ohne diese Freigabe bleibt der Unsicherheits-Layer bei der heutigen Heuristik. |
| **S4** | **T2b-4 EPS-Vor-Resampling** (V-RND-08) | Cron-/Manifest-Mechanik + abgeleitetes Artefakt statt Bytes | Freigabe für den Cron-Umbau **und** Abnahme des Äquivalenz-Beweisverfahrens (Zell-für-Zell numerisch). Prod-Dispatch bleibt Jans Gate. |
| **S5** | **Governor-Semantik im Globus** (V-RND-05, Teil c) | FrameGovernor-Semantik ist STOPP-pflichtig | Soll der Globus in die FPS-Governance einbezogen werden? Konsequenz: bei schwacher Hardware sinkt die Globus-FPS — heute ruckelt er stattdessen bei voller Rate. Teile (a) DPR-Cap und (b) rAF-Pause sind **keine** STOPP-Themen und können vorgezogen werden. |
| **S6** | **Löschungen** (V-RND-11, V-RND-06) | Löschen von Komponenten/Assets ist STOPP | Freigabe für: ~70 tote CSS-Selektoren in `MapView.css`, `public/wind/wind.{png,json}` (87 KB, nachweislich nie geladen), und — separat zu entscheiden — der dauerhaft unsichtbare Layer `precip-forecast`. |
| **S7** | **Real-Device-Testpark** | Blockiert seit Phase P/P2 die Gates | Die Gates GP und GP2 sind seit 2026-07-18/19 „bis auf Real-Device grün". Es fehlt **ein schwaches Android** (Adreno 5xx / Mali-G5x). Ohne dieses Gerät bleibt die Trail-Downscale-Sprosse dauerhaft unverifiziert und ihr visueller Sign-off offen. Anschaffen oder Sprosse als unverifiziert dokumentieren? |
| **S8** | **Ausgeblendete Layer** | Produktentscheidung, nicht technisch | 5 Dock-Toggles sind seit 2026-07-23 auskommentiert (`flownowcast`, `poprob`, `snowline`, `clouds`, `confidence`) und `precip-forecast` ist hart aus. Ist das ein Dauerzustand? Falls ja, lohnt sich V-RND-06 (Lazy-Konstruktion) deutlich mehr; falls nein, sollten sie vor der Zerlegung zurückkommen, damit die Gates sie mit abdecken. |

---

## 9. Gefundene Doku-Inkonsistenzen

| # | Aussage in der Doku | Befund am Code | Empfehlung |
|---|---|---|---|
| **D1** | `CLAUDE.md`/`decisions.md` D-08: **„WebGL1 + Format-Verhandlung"** | MapLibre 5.24 fordert **WebGL2 zuerst** an; `MapView.tsx` überschreibt `contextType` nicht ⇒ der Kontext ist real WebGL2, und die Verhandlung landet dadurch immer auf `'byte'` (§2.5) | D-08 nach der Laufzeit-Probe präzisieren: „WebGL2-Kontext, GLSL-ES-1.00-Shader, Format-Verhandlung faktisch wirkungslos". **Erst messen, dann schreiben.** |
| **D2** | `CLAUDE.md`: „kein Verlass auf `EXT_color_buffer_float`" | Unter WebGL2 ist das eine reguläre, breit verfügbare Extension; die Regel stammt aus der WebGL1-Ära | Regel beibehalten (konservativ ist richtig), aber die Begründung datieren, damit sie später bewusst neu bewertet werden kann |
| **D3** | `improvements.md` V-08: „77-KB-Stationstabelle **im Bundle**" | Ist ein **dynamisch geladener eigener Chunk** (`meteostatSource.ts:72`), 67,5 KB roh / 27,1 KB gzip, nur für Historie-Nutzer | V-08 korrigieren (V-RND-11 enthält den Text) |
| **D4** | `improvements.md` V-08: „~200 KB tote CSS → schnellerer Seitenaufbau" | Quell-CSS gesamt 671 KB; die gebaute MapView-CSS ist 14,2 KB gzip, ~30 % davon tot ≈ **4 KB gzip** | Mehrwert von „schneller" auf „klarer/wartbarer" umformulieren — sonst enttäuscht die Messung nach dem Aufräumen |
| **D5** | `audit/live-network-audit.md` §4.6: „Baseline lädt t_2m 0–24 (24,5 MB) eager" | Seit 2026-07-23 gilt `START_NOW_ONLY = true` (`MapView.tsx:160-168`); alle nativen Loader bekommen `nowOnly` (`:1477,1504,1559,1598,1626`) | Audit-Punkt als **teilweise erledigt** markieren; Baseline **neu messen**, bevor daraus priorisiert wird |
| **D6** | `architecture.md` §3: „~3 Stellen nahezu identisch dupliziert" | Präziser: **1× 48 Zeilen byte-identisch** (`:1089-1136` vs. `:2764-2811`) + 3 Teil-Duplikate; `moveLayer(STATIONS)` **5×**, `moveLayer` gesamt 17× | Zeilennummern aus §2.3 übernehmen |
| **D7** | Alt-Doku (laut Auftragsbeschreibung): Globus zeige **Sample-Daten** | Falsch. Live-GFS via `/_gfs` (`src/globe/gfs.ts:33,50,110`); Sample-Pfad explizit abgeschaltet (`GlobeMap.tsx:158`) | `architecture.md` §8 hat recht und bleibt; die Alt-Doku-Stelle als überholt markieren |
| **D8** | `architecture.md` §3: „`ScalarLayer`: 128×64-Mesh" | Bestätigt (`ScalarLayer.ts:186-187`) — hier stimmt die Doku | keine Aktion |
| **D9** | `audit/performance-2d.md` §2/§4 verweist auf `MapView.tsx:584` (DPR-Cap), `WindLayer.ts:1144/1167` | Zeilen sind gewandert: DPR-Cap heute `MapView.tsx:767`, Repaint-Gate `WindLayer.ts:1344-1369`, Governor-Feed `:1312` | Bei Gelegenheit nachziehen; grundsätzlich ist das ein Argument für Symbol- statt Zeilenreferenzen in Audits |

---

## 10. Offene Fragen / nicht verifizierbar

### 🔴 Braucht ein echtes Gerät (Emulator ist hier beweisfrei)

1. **WebGL2-Kontext + Texturformat (§2.5).** Der eine Punkt, der *kein* Real-Device braucht, aber einen laufenden Browser: die drei Konsolen-Zeilen aus §2.5. Ohne sie bleibt §2.5 eine sehr gut belegte Hypothese, keine Messung. **Höchste Priorität unter allen offenen Punkten dieses Dokuments.**
2. **Shader-Compile-Kosten beim Karten-Init.** 16 Programme (§2.4) — auf Desktop vernachlässigbar, auf schwachen mobilen Treibern potenziell dreistellig in Millisekunden. Ohne Messung ist V-RND-06 Spekulation.
3. **Globus-Frame-Zeit mobil.** Volle DPR × 18.000–48.000 Partikel × zwei Full-Screen-Trail-Pässe. Die Fillrate-Rechnung aus `audit/webgl-cross-device.md` §2 legt einen Faktor 4 gegenüber der 2D-Karte nahe — belegt ist das nicht.
4. **Trail-Downscale-Sprosse (Gate GP2).** Seit 2026-07-19 offen: das iPhone 12 Pro darf sie nie erreichen, ein schwaches Android soll sie erreichen und die volle Partikelzahl halten. **Es gibt kein schwaches Android im Testpark** (S7).
5. **Akku/Thermik-Gewinn der Repaint-Pause (Gate GP3).** Als „nice-to-have" eingestuft, nie gemessen.
6. **INP der Karte.** Der Emulator meldete 264 Sekunden (`audit/performance-2d.md` §1) — physikalisch unmöglich. Ohne Real-Device und ohne RUM (D-02) bleibt INP eine unbekannte Größe. **Das ist eine echte, nicht schließbare Lücke der aktuellen Strategie**, kein Versäumnis.

### Nicht ausgeführt, weil die Planungsphase es verbietet

7. **Exakter Bundle-Anteil der Fusion-Kette im Eager-Chunk.** Ich habe die *Anwesenheit* über eindeutige Marker bewiesen (`_cscs`, `_mf`, `_ecmwf`, `Barnes`, `CCSDS-AEC`) und die *Größenordnung* aus 5.311 LOC geschätzt (130–180 KB roh). Die exakte Zahl braucht einen Probe-Build ohne den Import oder eine Bundle-Analyse — beides sind Builds.
8. **Aktualität von `dist/`.** Der ausgewertete Build ist vom 2026-07-21. Alle Chunk-Größen sind damit ~10 Tage alt. Die Struktur-Aussagen (was eager, was lazy, welcher Marker wo) sind robust; die Bytes sind nachzuziehen.
9. **Netz-Baseline nach `START_NOW_ONLY`.** Der einzige Per-Layer-Traffic-Audit datiert auf 2026-07-22 — einen Tag vor der Near-Horizon-Änderung. Alle Zahlen in §3.3 sind deshalb **obere Schranken**, teils deutlich.

### Fragen an andere Rollen

10. **An UX & Design-System:** Sollen die 5 ausgeblendeten Dock-Toggles (§2.4) zurückkommen? Die Antwort ändert die Priorität von V-RND-06 erheblich.
11. **An Daten & Meteorologie:** Ist σ aus der Fusion v2 heute schon belastbar genug, um es flächig zu zeigen (V-RND-12) — oder wartet das zwingend auf das Trainings-Artefakt und das LOSO-Gate (D-13/V-15)?
12. **An QA & Teststrategie:** Der Golden-Verifier aus §5 Schritt 0 ist der erste Verifier, der **React-nahen** Zustand prüft (bisher explizit ungetestetes Terrain, `architecture.md` §11). Passt das ins O-02-Zielbild, oder soll dafür ein anderer Mechanismus her?
13. **An Infra & Betrieb:** V-RND-10 (Fonts selbst hosten) vereinfacht die CSP aus V-07 um zwei Fremd-Origins — bitte gemeinsam planen statt zweimal an `index.html`/`_headers` gehen.
14. **An SEO/GEO & Recht:** Die Google-Fonts-Einbindung (`index.html:11-13`) überträgt bei jedem Seitenaufruf die Besucher-IP an Google. Das ist im DACH-Raum ein bekanntes Thema und passt schlecht zu D-02 — ich melde es nur, die Bewertung gehört zu euch.
