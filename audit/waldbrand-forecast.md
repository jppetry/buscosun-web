# audit/waldbrand-forecast.md — Diagnose WF0: Waldbrand-Forecast 0…+12 h auf der Fusion

> **Phase WF0** (Auftrag Jan, 2026-08-18: „Analysiere die bestehende Codebase … und plane einen
> Waldbrand-Forecast mit Zeit-Slider von 0 bis +12h. GESETZT: baut auf dem Punkt-Forecast der
> Fusion auf … fehlende Parameter werden IN die Fusion aufgenommen … Kein Backend.
> Vorprozessierung als GitHub-Actions-Batch, Auslieferung über R2. NOCH KEINE IMPLEMENTIERUNG.").
> **Diagnose, kein Code.** Alles unter §3 ist am Arbeitsbaum gelesen (Datei:Zeile), alles unter §6
> heute gegen die DWD-Verzeichnisse, -Produktbeschreibungen und die Fachliteratur recherchiert
> (URL je Aussage, §12). Wo eine Aussage nicht am Code oder an der Quelle prüfbar war, steht
> **unverifiziert** dran.
>
> Deliverable dieser Phase ist ausschließlich diese Datei (plus die Landkarten-Zeile in `CLAUDE.md`).
> Nichts unter `src/`, kein Workflow, kein Bucket, kein Commit.

---

## 0. Kurzurteil

| | Befund |
|---|---|
| **Was die Fusion heute für 0…+12 h stündlich schon liefert** | Der **Punkt-Forecast** (`src/pointForecast/`) ist stündlich, DE 24 h / AT+CH 60 h, und trägt **Temperatur, relative Feuchte, Wind, Böen, Niederschlag** — exakt die vier Eingangsgrößen des kanadischen FWI-Systems (§5). Der Stundenanteil eines Feuerwetter-Index braucht **keinen einzigen neuen Parameter** im Punkt-Forecast. |
| **Was der Fusion für die Fläche fehlt** | Die **Raster-Fusion** (`src/fusion/fusionEngine.ts`, real 100×80 Zellen über DACH) rechnet nur **Temperatur, Wind, Wolken, Niederschlag** (+ optional σ). **Relative Feuchte** kommt bei den Beobachtungs-Adaptern zwar an (`ForecastHourPoint.relativeHumidity`), wird vom Engine aber **verworfen**; MOSMIX-Grid und AROME-Grid fragen sie gar nicht erst ab. **Böen** dito. Ohne RH in der Raster-Fusion gibt es keine Feuerwetter-**Fläche** aus der Fusion — das ist der eine harte Ingest-Punkt (§7). |
| **Was keine Fusion der Welt liefern kann** | Die kumulativen FWI-Codes **DMC/DC (→ BUI)** und der **Tages-Startwert der Feinstoff-Feuchte (FFMC₁₂)** brauchen **Vortagsgedächtnis** (Zeitkonstanten ~⅔ / 12 / 52 Tage). Punkt- und Raster-Fusion beginnen bei „jetzt", ICON-D2 liegt ~24 h auf opendata. `docs/DATA_SOURCES.md` §W.5 hat daraus 2026-08-14 geschlossen: „kein FWI, nur gedächtnisloser Treiber". **Der jetzt gesetzte GitHub-Actions-Batch mit Zustand in R2 hebt genau diese Grenze auf.** Und: DWD-CDC-Stundenbeobachtungen (`hourly/*/recent`, ~600 Stationen, ~500 Tage, heute geprüft) erlauben in DE einen **Kaltstart mit Historie** — die Einschwingzeit ist damit für DE keine Schwäche mehr (§8 B). |
| **Der Widerspruch, den ich nicht auflösen kann** | Der Brandradar hat **schon** meteorologische Layer — `fireWeather` (ICON-D2 `relhum_2m`), `fireSoilDryness` (ICON-D2 `smi`), `fireWind` (ICON-D2 u/v) — und alle drei sind **native 2,2-km-Raster an der Fusion vorbei**. Der Punkt-Forecast enthält **kein einziges ICON-D2-Feld**. „Kein paralleler zweiter Forecast-Pfad" ist im Brandradar **heute schon verletzt**, nur andersherum als befürchtet: der Bestand ist der native Pfad, die Fusion wäre der neue zweite. Man kann (a) beides nebeneinander tragen (Index aus der Fusion ~10 km, Treiber nativ 2,2 km, Auflösungssprung auf demselben Deck) oder (b) die Treiber-Layer auf die Fusion umziehen (Auflösungsverlust ⇒ Funktionserhalt-Frage). **Jans Entscheidung, §2 (d).** |
| **Der Vorbehalt, der schriftlich im Code steht** | Ein zusammengesetzter Feuerwetter-Score aus Feuchte/Temperatur/Wind/Niederschlag ist **zweimal ausdrücklich nicht gebaut** worden — `src/sources/iconD2Relhum.ts:27-34` („dessen Gewichte wären frei gewählt … Lehre aus F5 … Offen als Entscheidung") und `src/fire/fireAssessment.ts:19-21`. Ein FWI-System nach Van Wagner ist **kein** frei gewichteter Score, sondern ein publiziertes, seit 1970 operationelles Gleichungssystem mit öffentlichen Testvektoren — der Einwand trifft ihn nicht. Aber der Vorbehalt steht, und **nur Jan hebt ihn auf** (§2 (a)). |
| **Stündlicher Index — fachlich tragfähig?** | **Ja für FFMC/ISI/FWI, nein für DMC/DC — und der DWD selbst rechnet stündlich.** Stündliche FFMC (Van Wagner 1977; Lawson & Armitage 2008; `cffdrs::hffmc`), stündlicher ISI/FWI aus NWP (Rodell et al. 2024, *Weather and Forecasting*) und NG-CFFDRS 2025 (hFWI) sind Stand der Wissenschaft; der **DWD-WBI ist ein stündliches Bestandsmodell** („Die Berechnung des WBI erfolgt auf der Grundlage stündlicher Werte … wobei der höchste Stundenwert während der Tageslichtstunden verwendet wird"), veröffentlicht wird nur das Tagesmaximum. DMC/DC bleiben Tageskonten. Einen **eigenen** Index müssen wir **nicht** definieren: FWI-Gleichungen unverändert, Produktname **„Feuerwetter stündlich (FWI-Rechnung, buscosun) — kein amtliches Produkt"**, DWD-WBI/BAFU bleiben das amtliche Wort. Details §5. |
| **R2 / Speicherweg** | Existiert im Repo **nicht** (`architecture.md:14, :248, :378-380`; kein Paket, kein Client, kein Bucket). Batch-Weg des Repos ist Commit-back nach `public/` (D-20). R2 ist ein **neuer** Speicherweg (zweiter Provider, Secrets, CORS, Domain) ⇒ Transport-Zone ⇒ Jans Gate — vom Auftrag gesetzt, hier trotzdem als Entscheidung ausgewiesen (§2 (b)), weil `audit/brandflaechen-panel.md:100-106` fünf Gründe dagegen protokolliert hat und der Auftrag „Freemium ausgeschlossen" sagt (R2 = Free-Tier 10 GB, danach kostenpflichtig; die Freemium-Regel zielt auf Datenquellen, nicht Infrastruktur — trotzdem benannt). **Nachtrag (Jans Rückfrage):** GitHub Actions ist der bestehende Batch-Mechanismus; mit **Stations-JSON per Commit-back + Interpolation im Client** braucht der Weg **gar keinen** neuen Speicher — Default A in §2 (b). |

**Empfehlung in einem Satz:** Weg **B** (§8) — Tages-Codes (FFMC₁₂, DMC, DC → BUI) **an Stationen** einmal täglich per GitHub-Actions-Batch mit dem **Beobachtungs-Zweig und dem Raumkernel der Fusion** (dieselben Adapter wie `scripts/capture-fixture.mjs`, dieselbe `spatialInterp`), Kaltstart aus den DWD-CDC-Stundenreihen, Zustand als Stations-JSON per Commit-back (R2 nur noch Option, §2 b); **Stundenanteil im Client** (FFMC_h → ISI_h → FWI_h für h = 0…12) aus dem **Punkt-Forecast** (Klick/Panel) und aus der um **RH** erweiterten **Raster-Fusion** (Fläche); gestuft so, dass Stufe 1 (FFMC/ISI ohne Batch, ehrlich als „ohne Vortagsgedächtnis" beschriftet) **ohne** R2 und Cron ausrollbar ist und Stufe 2 den Batch nachzieht, ohne die UI zu ändern.

---

## 1. Gelesen (jede Position am Arbeitsbaum bzw. an der Quelle bestätigt)

| Bereich | Dateien / Quellen (Auszug; Zeilen in §3, URLs in §12) |
|---|---|
| Punkt-Forecast | `src/pointForecast/{types,pointForecast,sampleSources,leadTimeWeights,terrainPhysics,radarNowcast,gfsPoint,apparentTemperature}.ts`, `src/sources/{brightSkyCurrent,geosphereTawes,meteoSwissSmn,dwdUvForecast,openMeteoForecast}.ts`, `src/countryProfiles.ts` |
| Raster-Fusion | `src/fusion/{fusionEngine,loadFusedForecast,spatialInterp,elevation,oi,params,fixture,fixtureBuild,modelSource,modelCatalog,increment,uncertainty}.ts`, `src/scalar/ScalarLayer.ts`, `src/wind/openMeteoSource.ts`, `src/sources/{brightSkyForecast,geosphereArome}.ts`, `docs/fusion-forecast-{spec,overview}.md`, `docs/fusion-2d-integration.md`, `docs/fusionV2-plan.md`, `docs/reports/fusionV2-*.md`, `scripts/capture-fixture.mjs`, `fixtures/` (423 Sessions) |
| Brandradar | `src/fire/{fireModel,fireTime,firePlayback,fireState,FirePage,FireMap,FireLayerCard,fireAssessment,dangerViews,clcMask}.ts(x)`, `src/fire/sources/{dwdFireIndex,bafuFire,gwisFwi,euContext}.ts`, `src/sources/{iconD2Relhum,iconD2Smi,iconD2Precip,iconD2Thunder,iconD2Rotation,gribManifest,gribDecode,frameAtValidTime}.ts`, `src/radar/{thunderPotential,rotationPotential,convectiveIndex}.ts` |
| Batch/Deploy | `.github/workflows/{ci,health,nightly,warm-grib,warm-wind}.yml`, `scripts/{warm-grib,warm-wind,train-background,build-clc-mask,check-budget}.mjs`, `netlify/edge-functions/dwd-grib.ts`, `netlify.toml`, `vite.config.ts`, `budget.json` |
| Doku/Regeln | `CLAUDE.md`, `decisions.md` (D-01, D-04, D-06, D-10–D-14, D-16, D-18–D-21, O-01), `docs/DATA_SOURCES.md` §W.0–W.10, `docs/API.md` §7, `audit/waldbrand-{transport,layer,zeit,ausbau,wind,boden}.md`, `audit/aktivfeuer.md`, `audit/brandflaechen-panel.md`, `docs/zuglinien-radar-spec.md` (L5/L6 `layerTime`-Spec) |
| Extern (heute geholt) | `opendata.dwd.de/weather/nwp/icon-d2/grib/00/` (148 Verzeichnisse), `…/icon-d2-eps/grib/00/`, `…/CDC/derived_germany/fire_danger_index/…` (+ beide DESCRIPTION-PDFs), `…/CDC/grids_germany/{daily,monthly}/`, `…/CDC/observations_germany/climate/hourly/{…}/recent/`, DWD-WBI-Erläuterung (PDF 2020), MOSMIX-Elementeliste, GeoSphere-Datahub-Katalog + Rate-Limit-Seite, MeteoSwiss-OGD-Doku + Terms, EFFIS-Technical-Background + Data-License, NRCan/CFS-Publikationen, CRAN `cffdrs`, Rodell et al. 2024 |

---

## 2. STOPP & FRAGEN (Jan) — gehoben, nicht entschieden

| # | Zone | Worum es geht | Default, wenn unbeantwortet |
|---|---|---|---|
| (a) | Produktprinzip D-04/D-19 | **Composite-Vorbehalt aufheben?** `iconD2Relhum.ts:27-34` und `fireAssessment.ts:19-21` verbieten einen zusammengesetzten Treiber-Score, weil frei gewählte Gewichte eine unkalibrierte Modellaussage wären. FWI nach Van Wagner ist kein frei gewichteter Score (§5). Trotzdem: Der Vorbehalt steht im Code, die Aufhebung ist Jans Satz. | **Nicht bauen**, bis Jan „FWI-Gleichungen ja, eigene Gewichte nein" bestätigt. |
| (b) | Transport/Betrieb (D-20; `.github/workflows/*` = STOPP-Zone, `agents.md` §3) | **Neuer täglicher Cron** — kein neuer Mechanismus: GitHub Actions ist der Batch-Weg des Projekts (`warm-grib.yml`/`warm-wind.yml` alle 15 min mit Commit-back, `health.yml`, `nightly.yml`); neu ist nur die Workflow-Datei. **Speicherort** (Jans Rückfrage 2026-08-18 — Alternativen zu R2): **A** Commit-back nach `public/fire/fwi/` mit **nur Stations-JSON** (~1 000 Stationen × FFMC/DMC/DC ≈ 30 KB, gzip ~8 KB, + `latest.json`; **kein Raster** — der Client interpoliert selbst mit `spatialInterp`, das für die Fusion ohnehin im Bundle ist ⇒ ~3–4 MB/Jahr, keine neue Infrastruktur, +1 Deploy/Tag neben den ~96 Warm-Cron-Builds) · **B** Daten-Branch mit Orphan-Force-Push + GitHub Pages (null Wachstum auf `main`, CORS `*`, Pages aktivieren = Repo-Setting) · **C** GitHub-Release-Assets (CORS über Redirect **zu messen**) · **D** Netlify Blobs (Token + Function) · **E** R2 (Cloudflare-Konto, Bucket, Domain, CORS, `R2_*`-Secrets — funktioniert, aber ohne Not; `audit/brandflaechen-panel.md:100-106`). Das DWD-Raster existiert nicht; unsere Fläche ist so oder so eine Stations-Interpolation — ob im Batch (PNG) oder im Client (JSON → `spatialInterp`), ändert nur den Speicherort, im Client sogar konsistenter (derselbe Kernel + DEM-Höhenkorrektur wie das Fusions-Raster). | **A** (Commit-back, Stations-JSON, Client-Interpolation) — braucht nur Jans Go für die Workflow-Datei; R2 wird zur Option. Bis zum Go: Stufe 1 ohne Batch (§9). |
| (c) | Brandradar-Zeitvertrag | **Stundenregler im Brandradar.** `FIRE_LAYER_TIME` kennt nur `maxDay` (`fireTime.ts:31-42`); `sharedMaxDay` nimmt das Minimum über `forecast`-Layer (`:133-140`). Ein +12-h-Layer als `forecast/maxDay:0` würde den Tagesregler auf 0 kollabieren — der Grund, warum `fireWind` `instant` ist (`:68-85`). | Eine Achse, Einheit wechselt: ist ein Stunden-Layer aktiv, zeigt der Regler 0…12 h (heute); Tages-Layer klemmen auf Tag 0. |
| (d) | Funktionserhalt / zwei Meteo-Basen | `fireWeather`/`fireSoilDryness`/`fireWind` sind **native ICON-D2 2,2 km**. Der Index käme aus der Fusion (~10 km Raster, Punkt exakt). Nebeneinander = zwei Meteo-Basen auf einem Deck; Umzug der Treiber = Auflösungsverlust ⇒ Funktionserhalt-Verstoß ohne Freigabe. | **Nebeneinander**, ehrlich beschriftet („Index: Fusion ~10 km · Treiber: ICON-D2 2,2 km"); kein Umzug der Bestandslayer. |
| (e) | Warm-Cron-Budget | `relhum_2m` und `smi` sind **nicht** gewärmt (Jans Entscheidung 2026-08-14; `warm-grib.mjs:113-124`, `iconD2Relhum.ts:10-17`). Wenn ICON-D2 `relhum_2m` als Fusionsquelle dazukommt (§7 Variante), kostet der erste Abruf je Sitzung den Verzeichnis-Scan (~1,9 s). Wärmen = Cron-Änderung = STOPP. | Nicht wärmen; RH kommt primär aus MOSMIX/AROME/Obs, ICON-D2 nur optional. |
| (f) | Dependency (D-06) | Kein Runtime-Paket nötig: FWI-Gleichungen ≈ 250 Zeilen reines TS; PNG-Encoder handgeschrieben vorhanden (`build-clc-mask.mjs:82-106`); R2-Upload per S3-`PUT` mit SigV4 in Node ≈ 80 Zeilen **oder** `wrangler` nur im Workflow (kein Runtime-Paket). CDC-Stationsreihen liegen als ZIP — Node hat keinen ZIP-Leser (`node:zlib` kann nur den Deflate-Teil) ⇒ entweder ~60 Zeilen ZIP-Central-Directory selbst oder **BrightSky `/weather` mit Datumsbereich** (JSON, dieselbe DWD-Historie, schon Familie der Fusion) für den Kaltstart. | Kein Runtime-Paket; Kaltstart über BrightSky-Historie (JSON), Fallback ZIP-Parser im Skript. |

---

## 3. Ist-Zustand am Code

### 3.1 Punkt-Forecast — was er liefert, wie oft, wie weit

**Ausgabe** `src/pointForecast/types.ts:51-90` (`PointForecastHour`): `temperature`, `windSpeed`, `windDirection`, `gustSpeed`, `relativeHumidity`, `apparentTemperature`, `snowLineM` (nur AROME), `cloudCoverTotal/Low/Mid/High`, `precipitation` (mm/h), `uvIndex` (nur DE), je Variable `confidence` 0…1, `contributingSources`.

**Zeit:** stündlich, ganzzahlige Vorhersagestunde ab der aktuellen vollen Stunde (`pointForecast.ts:277-291`); INCA-15-min-Slots werden auf Stunden kollabiert (`sampleSources.ts:292-305`). Horizont = `opts.hours ?? profile.forecastHours`: **DE 24 h, AT 60 h, CH 60 h** (`countryProfiles.ts:76/92/108`); das Panel fragt standardmäßig 24 h (`PointForecastPanel.tsx:68`). Für 0…+12 h stündlich: **reicht in allen drei Ländern**, ohne Änderung.

**Quellen je Land** (`pointForecast.ts:203-237`, `sampleSources.ts`):

| Quelle | Familie | DE | AT | CH | Feuer-relevante Felder |
|---|---|---|---|---|---|
| MOSMIX via BrightSky | `mosmix` | ✓ | ✓ | ✓ | T, u/v, **Böe**, **RH** (BrightSky rechnet sie aus MOSMIX `TTT`/`Td`), Niederschlag, Wolken (55/30/15-Split) |
| AROME (GeoSphere `nwp-v1-1h-2500m`) | `highres` | — | ✓ | ✓ | T, u/v, Böe (`ugust/vgust`), **RH** (`rh2m`), Schneefallgrenze, Niederschlag |
| INCA (GeoSphere, ≤ 4 h) | `nowcast` | — | ✓ | — | T, u/v, Niederschlag (**keine RH**) |
| Stationen h0–5 (DWD/TAWES/SMN) | `obs` | ✓ | ✓ | ✓ | T, u/v, Böe, **RH**, Niederschlag |
| Radar h0–2 (RADOLAN RV / INCA / rzc) | `nowcast` | ✓ | (INCA) | ✓ | nur Niederschlag |
| DWD UV | `mosmix` | ✓ | — | — | nur UV-Index |
| GFS-Schwanz | `global` | > 240 h | | | T, u/v, Niederschlag, Wolken |

**Was der Punkt-Forecast nicht hat:** **kein ICON-D2-Feld** (Importgraph: `src/pointForecast/*` importiert keinen `iconD2*`-Loader), keinen Taupunkt (aus T/RH ableitbar), keine Schneehöhe, keine Bodenfeuchte, keine Strahlung, keinen Vortag.

**Blend** (`pointForecast.ts:497-642`, `leadTimeWeights.ts:36-148`): Familienkurven × Variablen-Multiplikator × räumliches Gewicht (Obs), Temperatur-Anker-QC (`:525-540`), Lapse-Korrektur nur Temperatur (`:571-574`), Wind-Speed-up nach Höhe (`:582-586`), Terrain-Mikroklima (`terrainPhysics.ts:167`), Konfidenz aus gewichteter Streuung / Toleranz × Lead-Decay (`:603-641`). **Eine neue Variable braucht 16 Berührpunkte** (`types.ts` 3×, `leadTimeWeights.ts` 2×, `pointForecast.ts` 4×, alle Fetcher/Sample-Literale, UI 3×, Konsumenten) — für den Stundenanteil des FWI ist **keine** nötig.

**`ModelSource` Punkt:** `'fusion'` (Default, Blend) vs. `'native'` (nur MOSMIX bzw. AROME + UV, `pointForecast.ts:67-71, :324-344`); Fallback auf den Blend, wenn die native Quelle nichts liefert. Ein Feuerwetter-Stundenwert am Punkt folgt automatisch derselben Achse.

### 3.2 Raster-Fusion — was sie liefert, und was auf der Karte davon ankommt

**Engine** `src/fusion/fusionEngine.ts`: pro Stunde `layers = { wind, temperature, clouds, precipitation, uncertainty? }` (`:142-167`, `:567-611`), Standard 40×32/24 h (`:119-127`), real über `loadFusedForecast` **80×64 / 6 h (Phase A)** und **100×80 / 24 h (Phase B)** über `DACH_VIEW.bounds` (`MapView.tsx:1968-2005`; `countryProfiles.ts:26`: lng 5,5–17,5 / lat 45,5–55,5 ⇒ **≈ 8,5 × 14 km je Zelle**). Interpolation IDW + Barnes-Gauß (`spatialInterp.ts:166-322`), Kernel je Variable (`fusionEngine.ts:294-302`), Lapse-Rate-Schätzung aus Stationen (`spatialInterp.ts:33`), DEM Terrarium z5 (`elevation.ts:16`, ≈ 2,5 km/px), Per-Pixel-Lapse im Shader über den G-Kanal (`ScalarLayer.ts:74-80`).

**Quellen der Raster-Fusion** (`loadFusedForecast.ts:460-497, :500-589`): DWD-Obs-Grid 10×8, **MOSMIX-Grid 16×13** (BrightSky, ~208 Punkte), INCA 12×8 (AT, ≤ 4 h), AROME 12×7, TAWES, SMN, **ICON-D2-EPS** (im `fusion`-Mix, DACH-weit; gewärmt nur `t_2m/u_10m/v_10m/clct/tot_prec` 0/3/6 h); alle globalen/regionalen Einzelmodelle nur als Einzelwahl; Open-Meteo opt-in (D-18). **Datendichte < Zellzahl** — die Fläche ist eine geglättete Interpolation von ~300 Stützstellen + zwei Modellgittern, im Modell-Switcher als „Vereinfachtes Raster — in Gebirgslagen weniger genau" ausgewiesen.

**Variablenachse:** hart **vier** breit an fünf Stellen — `SourceWeights` (`:129-135`), Gewichts-Arrays (`:281-291`), Wert-Abgriff je Stunde (`:382-388`), Kernel (`:294-302`), PNG-Encoder (`:730-810`); `FusedHour.layers` als `OpenMeteoBulkResult & {…}` (`:144`). **RH und Böe kommen an, werden aber verworfen:** `ForecastHourPoint` hat `gust?` und `relativeHumidity?` (`openMeteoForecast.ts:44-46`), die Obs-Adapter füllen beide (`brightSkyCurrent.ts:172-173`, `geosphereTawes.ts:127-128`, `meteoSwissSmn.ts:129-130`) — `fusionEngine.ts` referenziert keines der Wörter (grep leer). MOSMIX-Grid (`brightSkyForecast.ts`) trägt keine RH; das **AROME-Grid fragt `rh2m` nicht ab** (`geosphereArome.ts:82`: `parameters=t2m,u10m,v10m,tcc,rr_acc`), obwohl der Punkt-Fetcher es tut (`sampleSources.ts:360`). **Additiv-Präzedenz** für eine fünfte Größe: die σ-Schicht (`:588-605`) + Spec §9.1 (`docs/fusion-forecast-spec.md:308-333`).

**fusionV2** (`:57-82`): `oi`, `incrementPersist`, `uncertainty` verdrahtet (nur t2m wird OI-analysiert, `:419-470`), `bgMinVar`/`bgOffDiag` deklariert ohne Konsument; D-13: Cutover vertagt, prod-inaktiv. Für den Feuer-Forecast **irrelevant, welche Flag-Stufe** — er nimmt, was `run()` liefert.

**Was auf der Karte ankommt:** Temperatur-Erstbild bis natives ICON-D2 da ist, DEM-Bild, ein **dauerhaft unsichtbarer** `precip-forecast`-Layer (`MapView.tsx:1858, :4089`); Wind/Wolken-PNGs werden erzeugt und weitgehend verworfen (`docs/fusionV2-plan.md:38-48`). Die Fusion ist auf der Karte **selektierbar** (Modell-Switcher, `FUSION_CAPABLE_LAYERS = ['wind','temp','clouds','nowcast']`, `modelSource.ts:35`), aber **Native ist Default** (D-16). Kosten eines Raster-Fusion-Laufs: die ~200 MOSMIX-Punkte sind je ein BrightSky-Request (`loadFusedForecast.ts:136-143` spricht von „~1700 brightsky-Requests pro Suche", die das Vorwärmen sparte) — ein Feuerwetter-Raster aus der Fusion **erbt diese Kosten**, wenn der Nutzer nicht von der Wetterkarte kommt (Result-Cache 10 min, `:156-166`).

**Fusion in Node — vorhanden:** `scripts/capture-fixture.mjs` importiert die echten Adapter (`fetchBrightSkyCurrentGrid`, `fetchBrightSkyGrid`, `fetchGeoSphereAromeGrid`, `fetchTawesCurrentGrid`, `fetchSmnCurrentGrid`) + `assembleCapture` + Node-DEM; „BrightSky/GeoSphere/MeteoSwiss are CORS-open and directly Node-fetchable, so no dev proxy is needed" (Kopfkommentar). Das Fixture-Archiv (`fixtures/`, 423 Sessions) enthält **keine RH** (`fixture.ts:13`, `OiVariable` ohne Feuchte) — als Einschwing-Archiv unbrauchbar, als Batch-Skelett brauchbar.

### 3.3 Brandradar — Layer, Zeit, Vorbehalte

**Layer** (`fireModel.ts:44-57`, Zeitmodus `fireTime.ts:48-107`): `fireDanger` (GWIS-WMS-Bild, `forecast/maxDay 9`), `fireIndexNational` (DE Stations-CSV D0…+6, CH BAFU-Polygone; `forecast/maxDay 6`), `fireHotspots`/`fireFootprints` (`window`), **`fireWeather` (ICON-D2 `relhum_2m` **allein** — der Kommentar `:48` „relhum_2m, t_2m, vmax_10m, tot_prec" ist veraltet; `forecast/maxDay 1`)**, `fireSoilDryness` (ICON-D2 `smi` 9/81 cm; `forecast/maxDay 1`), `fireWind` (ICON-D2 u/v, **`instant`**), `fireBans` (BAFU), `fireDrought`/`fireVegetation` (EDO — **blockiert**, doppeltes ACAO), `fireFuel`/`fireBurnt`/`fireContext` (EFFIS/EEA-Bilder/-Polygone).

**Zeitregler = Tagesschritte.** `FireTimeState { day, windowH }` (`fireTime.ts:112-121`), `<input type="range" min=0 max={maxDay} step=1>` (`FirePage.tsx:1659-1669`), Playback in Tagen/s (`firePlayback.ts:39-41, :67-77`). Der Tag→Frame-Abgleich ist **zweimal handgerollt und auf 12 UTC verankert** (`FirePage.tsx:683-693` smi, `:703-715` relhum), statt `frameAtValidTime`/`bracketAtValidTime` (`src/sources/frameAtValidTime.ts:66-117`) zu nutzen. Permalink `#wb=` mit Bits, Tag `d`, Fenster `w`, … — Defaults werden **still** geschrieben (`fireState.ts:86-108`); ein Stundenfeld `h` müsste dieser Konvention folgen. Die Wetterkarte hat den Stundenregler bereits (`MapView.tsx:4656-4665`, `step=0.1`, rAF-koalesziert `:911-921`).

**Vorbehalte im Code:** `iconD2Relhum.ts:27-34` (kein Treiber-Score) · `fireAssessment.ts:19-21` (kein additiver Score) · `dangerViews.ts:211-212` (jede Ansicht trägt „kein amtliches Warnprodukt") · `dangerViews.ts:181-190` (`dc` heißt nie „Bodenfeuchte") · GWIS liefert **nur Bilder, keine Werte** (`gwisFwi.ts:4-11`) — EFFIS-Codes FFMC/DMC/DC/ISI/BUI sind sichtbar, aber **nicht als Zahl abgreifbar**.

**Amtliche Indizes:** DE **WBI/GLFI** als Stations-CSV, Tag 0…+6, ~04:20 UTC (`dwdFireIndex.ts:33-59, :116-138`; WB0 maß **484** Stationen, die heutige `stations_list.txt` zählt **645** — Zahl bei WF1 neu messen); **kein Raster** (`grids_germany/daily/fire_danger_index/` → 404, heute erneut bestätigt); CH BAFU-Stufen als GeoJSON (Fair-Use, `bafuFire.ts:12-18, :55-58`); AT **keiner** (`fireModel.ts:348-350`; GeoSphere hat den alten Index abgeschaltet, §6).

### 3.4 Ingest, Layer-Mechanik, Batch, Deploy — was wiederverwendbar ist

| Baustein | Fundstelle | Wiederverwendbar für den Feuer-Forecast |
|---|---|---|
| Reine Index-Mathematik + Loader (Muster) | `src/radar/thunderPotential.ts:84-92`, `rotationPotential.ts:73-79, :127-129`, `convectiveIndex.ts:52` (`ramp()`); Loader `iconD2Thunder.ts:131-173` | **Struktur 1:1**: DOM-freies Mathe-Modul mit `verify()`, `NaN` = außerhalb Domäne; Producer daneben |
| ScalarLayer-Vertrag | `src/scalar/ScalarLayer.ts:92-120, :208, :225`; RGBA8-Canvas R = Wert normiert, A = Maske; Ramp = `Record<number,string>` (`glUtil.ts:252-264`) | Ausgabe des Feuer-Rasters als `ScalarGridResult` (`openMeteoSource.ts:53-63`) — **derselbe Vertrag wie die Fusions-PNGs** |
| Frame-Zeitmodell | `frameAtValidTime.ts:66-117` (`bracketAtValidTime` mit `frac`) | Stundenregler-Auflösung im Brandradar |
| Fusions-PNG-Encoder | `fusionEngine.ts:730-810`, Sub-Stunden-Lerp `frameInterp.ts` | 6. Layer in `FusedHour.layers` |
| Statisches Raster offline → `public/` | `scripts/build-clc-mask.mjs` (0,01°, 1200×1000, 8-bit-PNG 25 KB, PNG-Encoder `:82-106`) → `src/fire/clcMask.ts:82-110` (Decode über `createImageBitmap`) | **Exakt das Format** für das Codes-Raster des Batches (Ziel R2 statt `public/`) |
| Fusion in Node | `scripts/capture-fixture.mjs`, `scripts/lib/register-ts.mjs`, `src/fusion/fixtureBuild.ts`, `scripts/lib/nodeElevation.mjs`, `spatialInterp.ts` (rein) | Der tägliche Batch **rechnet mit der Fusion** — Obs-Adapter + Raumkernel + DEM, kein zweiter Meteo-Pfad im Batch |
| Warm-Cron-Muster | `warm-grib.yml` (Cron, `contents: write`, Race-sicherer Commit-back), `warm-grib.mjs` (Fail-Safe je Familie) | Cron-Skelett; Ziel R2 statt Commit-back |
| ICON-D2-Zugriff (falls als Fusionsquelle) | `fetchStepField(run, param, step, signal, base)` (`iconD2Precip.ts:218-227`), Manifest-Gate (`gribManifest.ts:31, :122-123`), Edge-Whitelist nach Pfadpräfix (`dwd-grib.ts:32`) — **jede** Variable unter `weather/nwp/icon-d2/grib/` ohne Edge-Änderung | ICON-D2 `relhum_2m`, `h_snow`, `smi` als zusätzliche Fusionsquelle |
| Budget | `budget.json` totalJs **926,1 KB** gzip; FirePage-Chunk 186 KB raw; CI führt `npm run budget` | Mathe-Modul + Producer landen im FirePage-Chunk (lazy) |
| Deploy-Header | `netlify.toml` hat **keinen** `[[headers]]`-Block, keine CSP; R2-Origin braucht eigene CORS/Cache-Header **auf R2** | — |

**Was fehlt (nicht vorhanden, nicht ableitbar):** R2/S3-Client, `wrangler`, ein täglicher Cron, ein Zustandsspeicher, ein Stunden-Zeitvertrag im Brandradar, RH/Böe in der Raster-Fusion, ICON-D2 als Fusionsquelle, Hangneigung/Exposition auf dem Raster (nur im Punkt-Pfad: `terrainPhysics.ts:75-114`), ein FWI-Rechenmodul.

---

## 4. Vom Punkt zur Fläche

Der Punkt-Forecast ist **on demand je Koordinate** (mehrere Requests je Punkt, Memo 180 s, `pointForecast.ts:152-162`). Ihn auf ein Gitter „abzutasten" wäre 100×80 = 8 000 Punkt-Läufe — ausgeschlossen. Die **Raster-Fusion ist die Flächenform derselben Quellen** (MOSMIX/AROME/INCA/Obs, IDW+Barnes auf 100×80 mit DEM-Lapse); sie ist der einzige legitime Weg zur Fläche „auf der Fusion". Konsequenzen:

1. **RH muss in die Raster-Fusion** (5. Größe; Böe als 6. optional): `ForecastHourPoint.relativeHumidity` existiert; zu füllen in `brightSkyForecast.ts` (BrightSky liefert `relative_humidity`) und `geosphereArome.ts` (`rh2m` an die Parameterliste `:82`), im Engine als Kernel/Gewicht/Wert-Abgriff/Encoder additiv nach σ-Muster; `SourceWeights.humidity?`. ICON-D2-EPS `relhum_2m` existiert (§6.1) — als Modellquelle prüfen (nicht gewärmt ⇒ (e)).
2. **Der Index wird je Zelle je Stunde aus den fusionierten Feldern gerechnet** (T am Zellniveau — lapse-korrigiert —, RH, |Wind| aus u/v, Niederschlag mm/h) → `ScalarGridResult` (`variable: 'fire_fwi_h'`, R = FWI normiert, A = Maske) → `ScalarLayer` mit Feuer-Rampe im Brandradar. Punkt-Klick → derselbe reine Rechner auf `PointForecastHour` → Stundenkurve im Panel. **Ein Modul, zwei Aufrufer** (D-12), Paritäts-Verifier Punkt ↔ Zelle am selben Ort (Toleranz = Interpolationsdifferenz, ausgewiesen).
3. **Auflösung ehrlich benennen:** ~10 km Zelle ist die **Größenordnung von EFFIS** (ECMWF ~8–9 km, §6.5), aber gröber als der native `fireWeather` (2,2 km) daneben. Der Legenden-Satz gehört in den Steckbrief (§2 (d)). Ein 160×128-Lauf (Default in `loadFusedForecast.ts:281-282`) halbiert die Zelle bei ~2,6× Rechenzeit — Option, keine Pflicht.
4. **Zeitachse:** Raster-Fusion liefert 24 h stündlich; Sub-Stunde per Pixel-Lerp (`frameInterp.ts`) wäre zulässig (fester Wertebereich, Spec §10) — für den Feuer-Layer reicht **stündlich, kein Lerp** (12 Frames).
5. **Tages-Codes zur Fläche:** dieselbe `spatialInterp` im Batch — Stationen (Codes) → Gitter mit Höhenkorrektur; das Ergebnis ist ein PNG mit fester Skala, das der Client bilinear am Punkt/an der Zelle abtastet.

---

## 5. Fachlich: Lässt sich ein stündlicher Index rechtfertigen — oder brauchen wir einen eigenen?

**Das FWI-System (Van Wagner 1987)**: drei Feuchtecodes **FFMC** (Feinstoff, ~⅔ Tag), **DMC** (~12 Tage), **DC** (~52 Tage), daraus **ISI** (FFMC × Wind — Ausbreitung), **BUI** (DMC × DC — verfügbares Brennmaterial), **FWI** (ISI × BUI — Intensität). Standard: **einmal täglich 12 Uhr Ortszeit** aus T, RH, Wind, 24-h-Niederschlag; DMC/DC tragen den Vortag fort und werden **nur täglich** aktualisiert (tageslängenabhängige Konstanten).

**Stündliche Rechnung — Stand der Wissenschaft (Belege §12):**
- **Stündliche FFMC**: Van Wagner 1977 (PS-X-69) — Stundenform mit Vorstundenwert als Zustand; Lawson & Armitage 2008 (Weather Guide CFFDRS) — „Hourly/Diurnal FFMC" operationell; Referenzcode `cffdrs::hffmc` (Wang et al. 2015 NOR-X-424 / 2017 *Ecological Processes*).
- **Stündlicher ISI/FWI aus NWP**: Rodell et al. 2024, *Forecasting Hourly Wildfire Risk: Enhancing Fire Danger Assessment Using Numerical Weather Prediction*, WAF 39(6): hFFMC nach Van Wagner 1977, hISI aus hFFMC + Stundenwind, **BUI aus den täglichen DMC/DC übernommen**, Validierung an 917 Stationen; Begründung wörtlich: der Tages-FWI „provides a single numerical value … at an assumed midafternoon time for peak fire activity, an assumption that is not always valid." — das ist **exakt unser Vorhaben**.
- **NG-CFFDRS / FWI2025** (NRCan): „calculations of codes and indexes changing based on hourly weather observations" (hFFMC, hISI, hFWI).
- **DMC/DC** bleiben Tageskonten. Ein „stündlicher DC" wäre Erfindung; wir behaupten ihn nicht.

**Der DWD selbst rechnet stündlich.** WBI-Erläuterung (2020): „Die Berechnung des WBI erfolgt auf der Grundlage stündlicher Werte. Als Eingangsdaten … Lufttemperatur, relative Luftfeuchtigkeit, Windgeschwindigkeit, Niederschlagsmenge bzw. Schneemenge, sowie die kurz- und langwellige Strahlung der Atmosphäre." — „wobei der höchste Stundenwert während der Tageslichtstunden verwendet wird." — „besitzt die Feuerintensität ebenfalls eine 24-stündige Periode mit geringen nächtlichen und höheren nachmittäglichen Werten." **Aber:** der WBI ist **kein FWI mit deutschen Schwellen**, sondern ein eigenes Bestandsmodell („orientiert sich an der Struktur des kanadischen FWI und übernimmt einzelne Ideen des deutschen Baumgartner- und des M68-Indexes"; Byram-Intensität, 12-mm-Streuschicht, drei Bodenarten/Regionen, Kronen-/Streu-Interzeption, Strahlungsreduktion). Zahlenschwellen der fünf Stufen sind **nicht veröffentlicht**. Ein „WBI-Nachbau" ist damit **nicht möglich** und wird nicht behauptet; eine **statistische Zuordnung** FWI₁₂ ↔ WBI-Stufe an den Stationen ist möglich (§9 WF6).

**Für die Bewertung „stündlicher Index tragfähig?"** heißt das: **Ja** — als **FWI-Stundenrechnung** mit publizierten Gleichungen (FFMC_h → ISI_h → FWI_h mit Tages-BUI), in Kanada operationell, in der Literatur genau für NWP-Eingang validiert, vom DWD intern selbst so gehandhabt. **Nein** — als Tages-Gefahrenstufe („Waldbrandgefahrenstufe 4 um 15 Uhr"): die amtlichen Stufen (DWD WBI/GLFI, BAFU, EFFIS-Klassen) sind Tagesprodukte und **bleiben das amtliche Wort**. Ein Stundenwert **ergänzt** sie („wann heute die Spitze liegt, wie schnell es nach dem Regen wieder trocknet"), er **ersetzt** keine Stufe.

**Brauchen wir einen eigenen Index?** **Nein.** Wir übernehmen die FWI-Gleichungen unverändert (Präzedenz: `dangerViews.ts` nutzt EFFIS-Klassengrenzen wörtlich). Eigen sind nur (1) die **Eingangsdaten** (Fusion statt ECMWF-Mittag), (2) der **Startzustand** (Batch/R2 bzw. in Stufe 1 die Gleichgewichts-FFMC), (3) die **Klassenfarben** (EFFIS-Grenzen für FWI/ISI/FFMC, `dangerViews.ts:89-145`, oder — nach Kalibrierung an den DWD-Stationen — DWD-nahe Grenzen). Der Produktname sagt genau das: **„Feuerwetter stündlich (FWI-Rechnung, buscosun) — kein amtliches Produkt"**. Nie „WBI", nie „Gefahrenstufe".

**Gedächtnislose Alternativen** (falls Jan den Batch nicht will): **Fosberg Fire Weather Index (FFWI, 1978)** — stündlich aus T/RH/Wind, an US-RAWS-Stationen operationell; **Angström-Index** — stündlich, trivial. Beide publiziert, keine eigenen Gewichte. Schwäche: **kein Brennstoffgedächtnis** — nach Regen sofort wieder „trocken", im Frühjahr unplausibel. Sie tragen als „Feuerwetter", nicht als „Gefahr" (§8 A). Historische deutsche Indizes (Baumgartner: 5-Tage-Summe pot. Verdunstung − Niederschlag; M-68/Käse: Nesterov-Variante) sind Tagesindizes und vom WBI 2012 abgelöst — keine Option.

**Woran wir messen, ob es stimmt:** (1) Gleichungsparität gegen die publizierten Testvektoren von `cffdrs` — Verifier `verify:fire-fwi`; (2) Tages-FWI₁₂ des Batches an den DWD-WBI-Stationen gegen die amtliche Stufe (Rangkorrelation, Verwechslungsmatrix je Bundesland) — Verifier `verify:fire-fwi-anchor`, netzabhängig, nächtlich; (3) EFFIS-FWI-Bild als Sichtvergleich (kein Zahlenabgleich möglich, §3.3). Erst wenn (2) über eine Saison stabil ist, dürfen DWD-nahe Klassenfarben in die Legende; bis dahin EFFIS-Grenzen mit dem Satz „Klassengrenzen: EFFIS".

---

## 6. DWD-Lücken — Felder, die für Waldbrandgefahr relevant sind, aber nicht in der Fusion

Alle Listings **heute** geholt (Lauf 2026081800/03). Lizenz durchgehend **CC BY 4.0** mit Quellenvermerk (`dwd.de/copyright`), kein Key, keine Registrierung, kein dokumentiertes Ratelimit ⇒ **erlaubt**.

### 6.1 ICON-D2 (`weather/nwp/icon-d2/grib/{00,03,…,21}/`, 8 Läufe/Tag, stündlich 000–048, regular-lat-lon 0,02° ≈ 2,2 km + icosahedral; ICON-D2-EPS **nur icosahedral**)

Das Verzeichnis führt **148** Variablen (vollständige Liste §12). Feuer-relevant, **nicht in der Fusion** (weder Punkt noch Raster):

| Variable | Level | Einheit / Bedeutung | D2 | D2-EPS | Rolle | Status im Repo |
|---|---|---|---|---|---|---|
| `relhum_2m` | 2 m | % | ✓ | ✓ | FFMC/DMC/DC-Kern | native `fireWeather` (Fläche); Fusion: PF ✓ (aus MOSMIX/AROME/Obs), **RF ✗** |
| `td_2m` | 2 m | K Taupunkt | ✓ | ✓ | RH-Ableitung, Nesterov-Typ | nirgends; aus T/RH ableitbar |
| `vmax_10m` | 10 m | m/s Böe | ✓ | ✓ | Ausbreitungs-Spitze | native `gust` (Karte); PF ✓, **RF ✗** |
| `tot_prec` / `rain_gsp`+`rain_con` / `snow_gsp`+`snow_con` | sfc | kg/m² akkumuliert | ✓ | ✓ | Regen (FFMC/DMC/DC), Regen/Schnee trennen | `tot_prec` native precip; Fusion PF/RF ✓ (Rate) |
| `h_snow`, `w_snow`, `snowc` | sfc | m / kg/m² / % | ✓ | ✓ | Schneedecke ⇒ Index aussetzen; Saisonstart | native `snow` (F4, `h_snow` gewärmt); Fusion ✗ |
| `w_so` | soil 0…729 cm | kg/m² je Schicht | ✓ | ✓ | Bodenwasser-Proxy | nirgends |
| `smi` | soil 0…729 cm | – (Index) | ✓ | ✓ | Trockenheitsindikator | native `fireSoilDryness` (9/81 cm); Fusion ✗ |
| `t_so`, `t_g` | soil / sfc | K | ✓ | ✓ | Bodentemperatur | nirgends |
| `soiltyp`, `hsurf`, `fr_land`, `plcov`, `lai`, `rootdp` | time-invariant | – | ✓ | ✓ | Masken, Fuel-Proxy | `soiltyp` (Wassermaske in `iconD2Smi`), `hsurf` (Sondierung); Rest nirgends |
| `aswdir_s`, `aswdifd_s`, `asob_s`, `aswdifu_s`, `athb_s`, `alb_rad` | sfc | W/m² zeitgemittelt seit Start | ✓ | ✓ | **WBI-Eingang** (kurz-/langwellige Strahlung), Streu-Trocknung; **kein FWI-Eingang** | nirgends (Fusion hat keine Strahlung; MOSMIX `Rad1h` käme über BrightSky `solar`) |
| `alhfl_s`, `ashfl_s` | sfc | W/m² latent/sensibel | ✓ | ✓ | Verdunstungs-Proxy | nirgends |
| `w_i` | sfc | kg/m² Interzeption | ✓ | ✓ | Kronen-Interzeption (WBI-Konzept) | nirgends |
| `runoff_s`, `runoff_g` | sfc | kg/m² akk. | ✓ | ✓ | Nässe-Proxy | nirgends |
| `tqv` | col | kg/m² | ✓ | ✓ | Luftmassen-Trockenheit | nirgends |
| `cape_ml`, `cin_ml`, `lpi`, `lpi_max` | – | J/kg / – | ✓ | ✓ | Blitz-Zündung | native `thunder`/`lightningfc` (eigene Layer) |
| `ww` | sfc | WMO-Code | ✓ | **✗** | Regenart | nirgends |
| `tmax_2m`, `tmin_2m` | 2 m | K | ✓ | ✓ | – | nirgends |
| `qv_2m` | – | – | **✗** (nur ICON-EU) | ✗ | – | – |

**Fazit 6.1:** Alle Eingänge für hFFMC/hISI/hFWI liegen stündlich auf regular-lat-lon vor. **Für den Fusions-Weg wird davon nur `relhum_2m` (RF) und ggf. `h_snow` (Maske) gebraucht** — beides über die bestehende `fetchStepField`-Mechanik ohne Edge-Änderung; die Strahlungs-/Fluss-Felder sind WBI-, nicht FWI-Eingänge und werden nur relevant, falls je ein WBI-nahes Bestandsmodell gebaut würde (nicht Ziel).

### 6.2 DWD WBI / GLFI (`climate_environment/CDC/derived_germany/fire_danger_index/{woodland,grassland}/{forecast,recomputed}/{recent,historical}/`)

- **Stationen, Tag 0…+6, Klassen 1–5, tägliches Maximum, ~04:20 UTC**; `…_stations_list.txt` (heute **645** Zeilen; WB0 maß 484). **Kein Raster online** (dokumentiert als NetCDF 1 km EPSG:3035 unter `grids_germany/daily/fire_danger_index/…` — **404**, Verzeichnis fehlt im Listing). `recomputed/` = beobachtungsbasierte Rückrechnung.
- **Methodik:** s. §5 — stündliches Bestandsmodell in FWI-Struktur, Eingänge T/RH/Wind/Niederschlag-Schnee/kurz+langwellige Strahlung; Vorhersage aus „daily forecast data" (Modell nicht genannt); Saison März–Oktober; Zahlenschwellen nicht veröffentlicht. **GLFI**: eigenes Streumodell für abgestorbenes, unbeschattetes Wildgras (Wittich et al. 2023), Worst-Case ohne Ergrünung.
- **Ein stündliches DWD-Produkt gibt es nicht** (intern stündlich, publiziert Tagesmax).
- **Verdict:** erlaubt; **Referenz/Validierung** (§9 WF6) und Bestandslayer `fireIndexNational`, keine Slider-Quelle.

### 6.3 CDC-Raster (`climate_environment/CDC/grids_germany/{daily,monthly}/`)

| Produkt | Format | Takt/Latenz | Nutzen für 0…+12 h |
|---|---|---|---|
| `daily/soil_moist/` — AMBAV Bodenfeuchte unter Gras, % nFK, 1 km GK3, ASCII, monatliche `.tgz` | ASCII | täglich, **1–2 Monate** Latenz | keiner (Klimatologie) |
| `daily/soil_moisture/{pine,spruce,beech,oak,composite,…}/` — LWF-Brook90 v1, ‰ nFK, 20 Schichten, 1 km EPSG:31467 | **NetCDF** ~85 MB | „updated on the 3rd of each month" | Kontext/Anomaliebasis unter **Wald (Kiefer!)** — NetCDF ⇒ D-06; nicht stündlich |
| `daily/evapo_p`, `evapo_r`, `evaporation_fao` | ASCII / NetCDF | täglich, Latenz Tage–Wochen | Baumgartner-Proxy, nicht Ziel |
| `monthly/drought_index/` | ASCII | monatlich | keiner |
| `daily/fire_danger_index/` | (NetCDF angekündigt) | — | **404** |
| `derived_germany/soil/daily/recent/` (AMBETI, 1 061 Stationen) | Text | täglich | Punkt-Kontext |

### 6.4 CDC-Stationsbeobachtungen (`climate_environment/CDC/observations_germany/climate/hourly/{air_temperature,precipitation,wind,dew_point,moisture,extreme_wind,solar,…}/recent/`) — **heute verifiziert**

~600 Stationen `stundenwerte_TU_<id>_akt.zip` (T + RH), analog `RR` (Niederschlag), `FF` (Wind); `recent` ≈ 500 Tage, aktualisiert täglich (heute 08:40 UTC), plus `10_minutes/*/now/` für den laufenden Tag. **Das ist das Kaltstart-Archiv für die Tages-Codes in DE** (§8 B): FFMC/DMC/DC ab Saisonstart (1. März) an jeder Station nachrechnen — keine Einschwingphase. Format ZIP (⇒ (f)); Alternative mit identischem Inhalt: BrightSky `/weather` mit Datumsbereich (JSON).

### 6.5 Weitere DWD-Produkte und Nachbarn

- **MOSMIX_S/L** (`weather/local_forecasts/mos/`): `TTT`, `Td`, `FF/DD`, `FX1`, `RR1c`, `RRS1c`, `N/Neff`, **`Rad1h`** (Globalstrahlung), `RadS3/RadL3`, `SunD1`, `ww` — **keine RH** (BrightSky rechnet sie); stündlich +240 h, KML/KMZ. Bereits Fusionsquelle über BrightSky (Punkt + Raster-Grid). **Strahlung** wäre über BrightSky `solar` in die Fusion holbar (nur nötig für WBI-nahes Modell).
- **ICON-EU** (0,0625°, +78/+120 h): `relhum_2m`, `td_2m`, `qv_2m`, `w_so`, **kein `smi`** — Rand/Fallback AT/CH.
- **RADOLAN SF/RW, RADVOR RQ** — 24-h-/1-h-Summen gemessen, 1 km, DE — Option für den Batch-Regen (Weg B, Variante).
- **ICON-D2-EPS**: `relhum_2m`, `t_2m`, `u/v_10m`, `vmax_10m`, `tot_prec`, `h_snow`, `smi`, `w_so` vorhanden (icosahedral); gewärmt heute nur `t_2m/u_10m/v_10m/clct/tot_prec` 0/3/6 h ⇒ Feuerwetter-**Spread** möglich (V-WF-6), Cron = STOPP.
- **EFFIS/GWIS**: FWI aus ECMWF (~8 km) + Météo-France, 1–9 Tage, Mittagskonvention; Klassen Low <11,2 / Moderate 11,2–21,3 / High 21,3–38 / Very High 38–50 / Extreme 50–70 / Very Extreme >70; Lizenz **CC BY 4.0** (Commission Decision 2011/833/EU); WMS/WFS im Projekt; **numerischer Rasterdownload ohne Formular unklar**, ECMWF-CEMS-Fire im CDS = Registrierung ⇒ blockiert (V-WF-4 offen).
- **AT (GeoSphere)**: `nwp-v1-1h-2500m` (T, **RH2M**, Wind, Böen, RR, Globalstrahlung, 61 h), `inca-v1-1h-1km` (Analyse inkl. RH2M/TD2M/RR seit 2011), `klima-v2-1h` (Stationshistorie) — CC BY 4.0, **Rate-Limit 5 req/s · 240 req/h** (im Batch mit Multi-Station-Requests einhaltbar; clientseitig bereits genutzt). **Kein** FWI-/Waldbrand-Datensatz; alter Index abgeschaltet („erhebliche Schwächen", FAQ).
- **CH (MeteoSwiss OGD)**: ICON-CH1/CH2-EPS (icosahedral, RELHUM_2M/T_2M/Wind/TOT_PREC/W_SO, **Retention 24 h**), SMN-Stationen live + historisch (CSV) — CC BY 4.0, „even commercially", Quellenvermerk; **BAFU** Tagesstufen je Warnregion (bereits Bestandslayer), kein FWI-Wert, keine Stündlichkeit.
- **Statik**: BKG **CLC5-2018** (dl-de/by-2-0, DE, Vektor 5 ha — Wald/Grasland-Maske), EEA-CLC-WMS (bereits genutzt), **ESA WorldCover** 10 m (CC BY 4.0, AWS ohne Login), **Copernicus DEM GLO-30/90** (AWS ohne Login, Attribution) — Hangneigung/Exposition falls je Ausbreitung; European Fuel Map (Aragoneses 2023) — Datenlizenz **unklar**; CLMS-Downloads (CLC/HRL) — EU-Login ⇒ nur WMS.

---

## 7. Parameter-Matrix

Legende: **PF** = Punkt-Forecast · **RF** = Raster-Fusion · ✓ vorhanden · ◐ kommt an, wird verworfen · ✗ fehlt · ⛔ blockiert.

| Größe (Rolle im Index) | PF | RF | Quelle heute | Neu in die Fusion? | Woher | Anmerkung |
|---|---|---|---|---|---|---|
| **T 2 m** (FFMC/DMC/DC) | ✓ | ✓ | MOSMIX, AROME, INCA, Obs | nein | — | RF lapse-korrigiert am Zellniveau |
| **RH 2 m** (FFMC/DMC/DC) | ✓ | ◐ | PF: MOSMIX/AROME/Obs; RF: nur Obs-Adapter füllen es | **ja — RF** | MOSMIX (BrightSky `relative_humidity`), AROME `rh2m` (`geosphereArome.ts:82`), Obs; optional ICON-D2-EPS/ICON-D2 `relhum_2m` | **der eine harte Ingest-Punkt** |
| **Wind 10 m** (ISI) | ✓ | ✓ | s. o. | nein | — | ISI nach Definition Mittelwind |
| **Böe** (Ausbreitungs-Spitze, Zusatz) | ✓ | ◐ | PF: MOSMIX/AROME/Obs; RF: verworfen | optional — RF | wie RH | kein FWI-Eingang |
| **Niederschlag Stunde** (FFMC_h) | ✓ | ✓ | s. o. + Radar h0–2 | nein | — | — |
| **Niederschlag 24 h bis 12 UTC** (Tages-Codes) | ✗ | ✗ | — | **nein — Batch** | Stations-Obs (BrightSky-Historie DE, GeoSphere `klima-v2` AT, MeteoSwiss SMN CH); Variante RADOLAN SF/INCA/rzc; Fallback ICON-D2 `tot_prec` | Vergangenheit ⇒ nur der Batch |
| **FFMC₁₂ / DMC / DC (Vortag)** | ✗ | ✗ | — | **nein — Batch + R2** | Fortschreibung an Stationen; Kaltstart aus CDC-`hourly/recent` (DE) bzw. Stationshistorie AT/CH; FWI-Startwerte 85/6/15 nur wo keine Historie | die einzige echte neue Datenhaltung |
| **Schneedecke** (Index aussetzen; Saison) | ✗ | ✗ | Karte: nativer `snow` (ICON-D2 `h_snow`) | ja — RF **oder** Batch-Maske | ICON-D2 `h_snow`/`snowc` (gewärmt) | FWI-Regel: kein Index unter Schnee |
| **Bodenfeuchte** (Plausibilisierung) | ✗ | ✗ | Brandradar: nativer `fireSoilDryness` (`smi`) | nein | — | bleibt eigener Layer; DC ≠ Bodenfeuchte |
| **Taupunkt `td_2m`** | ✗ | ✗ | — | nein | aus T/RH | nur Nesterov-Typ |
| **Strahlung `aswdir_s`/`aswdifd_s`/`athb_s`** | ✗ | ✗ | — | nein (FWI-frei); **WBI-Eingang** | ICON-D2 ✓; via BrightSky `solar` in die Fusion holbar | nur für WBI-nahes Bestandsmodell — nicht Ziel |
| **Landbedeckung** (Maske Wald/Grasland) | — | — | CLC-Industriemaske (`clcMask.ts`); EFFIS `fuel_map` nur Bild | statisch, kein Fusionsfeld | BKG CLC5-2018 (dl-de/by-2-0) / EEA CLC 2018 → Offline-Maske (`build-clc-mask.mjs`-Muster) | Wald ↔ Grasland trennen (WBI/GLFI-Analogon) |
| **Hangneigung/Exposition** | Punkt ✓ (`terrainPhysics.ts`) | ✗ | DEM z5/z9 | nein (nicht FWI) | Copernicus DEM (offen) | nur Ausbreitungsmodelle — nicht Ziel |
| **Ensemble-Spread** (D-04) | ✗ | (σ nur t2m) | ICON-D2-EPS 0/3/6 h gewärmt | später | ICON-D2-EPS inkl. `relhum_2m` | Feuerwetter-Spread als Ehrlichkeitsangabe — Ausbau |

**Fazit der Matrix:** Für den **Stundenanteil** ist der Punkt-Forecast vollständig; die Raster-Fusion braucht **RH** (Pflicht) und **Böe** (optional). Für den **Tageszustand** braucht es den Batch — und der ist gesetzt. Neu **in** die Fusion kommen: RH (+ Böe) als Größe, ggf. ICON-D2 `relhum_2m`/`h_snow` als Quelle. Codes, 24-h-Regen, Masken sind Batch- oder Statik-Sache und gehören **nicht** in den Live-Blend.

---

## 8. Umsetzungswege

### A · Gedächtnisloser Stundentreiber aus der Fusion (FFWI/Angström oder FFMC-Gleichgewicht → ISI)
- **Datenbasis:** Punkt-Forecast (Punkt) + Raster-Fusion mit RH (Fläche). Kein Batch, kein R2, kein Cron.
- **Aufwand:** ≈ 2,5 Sitzungen (RH in RF 0,5 · Mathe-Modul + Verifier 0,5 · Stundenregler Brandradar 1 · Layer/Panel/Steckbrief 0,5).
- **Belastbarkeit:** publizierte Formeln, prüfbar; **ohne Brennstoffzustand** — kein Bezug zur amtlichen Stufe, nach Regen sofort „trocken", Frühjahrs-Fehlalarme.
- **Schwächen, direkt:** Ist **kein Waldbrand-Forecast**, sondern ein Feuerwetter-Treiber mit Uhrzeit — im Kern das, was `fireWeather` (relhum) schon leistet, plus T/Wind. Trägt als **Stufe 1** von B, nicht als Endzustand.

### B · FWI-Hybrid: Tages-Codes per Batch (Fusions-Obs-Zweig, Commit-back als Stations-JSON; R2/Pages nur als Variante), Stundenanteil im Client — **Empfehlung**
- **Datenbasis, Batch (täglich ~12:30 UTC):**
  1. **Stationen** = die Obs-Adapter der Fusion (`fetchBrightSkyCurrentGrid` DE ~600, `fetchTawesCurrentGrid` AT, `fetchSmnCurrentGrid` CH) → T/RH/Wind um 12 UTC; **24-h-Niederschlag** je Station aus der Stationshistorie (BrightSky `/weather` DE, GeoSphere `klima-v2-1h` AT — Multi-Station-Requests unter 240/h —, MeteoSwiss SMN CH); Fallback ICON-D2 `tot_prec` (Modell, DACH-einheitlich).
  2. **Codes je Station** (FFMC₁₂, DMC, DC, BUI) mit Vortag aus R2 (`fire/fwi/state.json`, ~1 000 Stationen ≈ 30 KB); **Kaltstart** einmalig aus CDC-`hourly/recent` bzw. BrightSky-Historie ab 1. März (DE ohne Einschwingphase; AT/CH aus deren Historie, sonst Startwerte 85/6/15 **mit** „Einschwingphase seit <Datum>"-Flag je Land).
  3. **Ablage** (Default A, §2 b): `public/fire/fwi/stations.json` (Codes je Station, ~30 KB) + `latest.json` (Datum, Quellenlage/Einschwing-Flag je Land, Datenalter) per Commit-back; **Fläche im Client** mit demselben `spatialInterp`-Kernel + DEM wie das Fusions-Raster. Variante (B/E): Fläche im Batch auf 0,05° (240×200) → `codes-YYYYMMDD.png` (R=FFMC₁₂, G=DMC, B=DC, ≤ 100 KB) nach Pages/R2.
  4. **Schneemaske** aus ICON-D2 `h_snow`/`snowc` (Batch, gewärmt) — Index unter Schnee = kein Wert.
- **Datenbasis, Client:** liest `latest.json` + PNG (bilinear am Punkt/an der Zelle); **h = 0**: FFMC nach Lawson-Diurnal aus FFMC₁₂ (heute nach dem Batch, davor gestern — die operationelle Konvention) + T/RH(h0); dann **stündliche Kette** (Van Wagner 1977) über Punkt-Forecast (Panel) bzw. Raster-Fusion (Fläche) für h = 1…12; ISI_h aus FFMC_h + Wind_h; FWI_h aus ISI_h + Tages-BUI (über das 12-h-Fenster konstant, wie Rodell et al. 2024).
- **Aufwand:** ≈ 6,5 Sitzungen (A: 2,5 · Batch-Skript + Fortschreibung + Kaltstart + Verifier 2 · R2/Workflow/Secrets/CORS 0,5 (nach Jans Go) · Anker-Verifier DWD-WBI 1 · Doku/Steckbrief 0,5).
- **Belastbarkeit:** vollständiges FWI-System mit Gedächtnis auf **Beobachtungen** (wie jedes operationelle FWI-System); DACH-einheitlich; **prüfbar** gegen `cffdrs`-Testvektoren und täglich gegen die DWD-WBI-Stationen; kein zweiter Meteo-Pfad im Batch (Fusions-Adapter, Fusions-Kernel).
- **Schwächen, direkt:** (1) **Zwei Meteo-Basen im Brandradar** (§2 (d)). (2) **Batch-Ausfall** ⇒ Codes veralten; Client zeigt Datenalter, ab > 36 h fällt der Layer auf Stufe 1 zurück und sagt es. (3) **BrightSky-Abhängigkeit** (Hobby-Proxy, kein SLA — schon heute Rückgrat des Punkt-Forecasts; der Batch addiert ~600–1 200 Requests/Tag, Kaltstart einmalig ~600 Bereichsrequests). (4) Raster-Fusion-Kosten je Sitzung (~200 BrightSky-Requests), wenn nicht von der Karte kommend. (5) 0,05°-Codes-Raster ist eine **Interpolation aus Stationen** (wie das DWD-Raster, das es nicht gibt) — Legende: „Codes: Stationen, interpoliert". (6) AT/CH-Einschwingphase, falls die Historie nicht geholt wird.

### C · Amtliche Tagesprodukte auf dem Regler (DWD WBI/GLFI D0…+6, EFFIS-Bild) + Stundenmodulation nur als Text
- **Datenbasis:** vorhanden (`dwdFireIndex.ts`, `gwisFwi.ts`). Kein Batch.
- **Aufwand:** ≈ 1 Sitzung.
- **Belastbarkeit:** amtlich, unangreifbar.
- **Schwächen, direkt:** **Es gibt keinen Stundenwert.** Der Regler 0…+12 h zeigt 12 × denselben Tageswert. Erfüllt den Auftrag nicht; als **Referenzschicht in B** unverzichtbar (Anker, §5), als eigenständiger Weg **trägt er nicht**.

### D · Batch rechnet die Stundenraster komplett aus ICON-D2 (an der Fusion vorbei) → R2 → Client zeigt Kacheln
- **Datenbasis:** ICON-D2 `t_2m/relhum_2m/u_10m/v_10m/tot_prec/h_snow` je 3-h-Lauf × 12 Schritte im Batch, 2,2 km, fertige FWI-PNGs in R2 (Codes-Fortschreibung dazu wie in B).
- **Aufwand:** ≈ 4 Sitzungen, aber **8 Läufe/Tag × 12 Frames** Batch-Zeit + R2-Traffic; kein Punkt-Panel-Bezug (Punkt-Fusion und Kachel widersprechen sich am Ort).
- **Belastbarkeit:** höchste Auflösung, konsistent mit den nativen Treiber-Layern.
- **Schwächen, direkt:** **verletzt das Gesetzte** („kein paralleler zweiter Forecast-Pfad, keine Roh-GRIB-Auswertung neben der Fusion"); DE-zentriert (ICON-D2-Domäne endet in den Südalpen); macht die Fusion für den Brandradar irrelevant. Aufgeführt, damit die Alternative benannt ist — **nicht empfohlen**.

### Bewertung auf einen Blick

| | A Treiber | **B Hybrid** | C Amtlich | D ICON-Batch |
|---|---|---|---|---|
| Stündlich 0…+12 h echt | ✓ | ✓ | ✗ | ✓ |
| Brennstoffgedächtnis | ✗ | ✓ | ✓ (amtlich) | ✓ |
| „Auf der Fusion" | ✓ | ✓ | — | ✗ |
| Ohne Cron/R2 | ✓ | ✗ (Stufe 1 ✓) | ✓ | ✗ |
| Prüfbar gegen Amt | ✗ | ✓ | = | ✓ |
| Zwei Meteo-Basen im Deck | ja | ja | nein | nein |
| Aufwand (Sitzungen) | 2,5 | 6,5 | 1 | 4 |

---

## 9. Empfehlung und Phasenplan

**B, gestuft — so, dass jede Stufe für sich ehrlich ist:**

| Phase | Inhalt | Gate | STOPP? |
|---|---|---|---|
| **WF0** | diese Diagnose; Jans Entscheidungen §2 (a)–(f), §10 | — | — |
| **WF1** Rechenkern | `src/fire/fwi/fwi.ts` (rein: FFMC/DMC/DC/ISI/BUI/FWI täglich, `hffmc` stündlich, Lawson-Diurnal-Start, Schnee-/Saisonregel), Testvektoren aus `cffdrs`, `npm run verify:fire-fwi`; Stationszahl WBI neu messen | GWF1: Parität ≤ 0,01 auf allen Vektoren | nein |
| **WF2** RH in der Raster-Fusion | `relativeHumidity` in MOSMIX-/AROME-Grid füllen; Engine: `SourceWeights.humidity`, Kernel, Abgriff, `layers.humidity` (σ-Muster additiv; kein Engine-Flag nötig — neue Größe, kein neuer Rechenpfad; Sichtbarkeit über den Layer); Spec §9.2 | GWF2: vier Bestandslayer byte-identisch (SHA), RH-PNG plausibel gegen Stationen | nein (kein Shader, kein Edge) |
| **WF3** Stundenregler Brandradar | `FireLayerTime` um `hourly?: { maxHour: 12 }`; `sharedMaxDay` unverändert, neue `sharedMaxHour`; Regler-Einheit wechselt bei aktivem Stundenlayer; `#wb=` bekommt `h` (nur ≠ 0); Tages-Layer klemmen auf Tag 0; beide 12-UTC-Anker auf `bracketAtValidTime` | GWF3: bestehende Permalinks byte-identisch; Tages-Slider ohne Stundenlayer unverändert | nein |
| **WF4** Layer + Panel (Stufe 1 = Weg-A-Ehrlichkeit) | Layer `fireForecast` (Bit 13, append-only), Fläche aus RF, Punktkurve aus PF, Steckbrief mit den drei Sätzen (kein amtliches Produkt · Fusion ~10 km · ohne Vortagsgedächtnis, bis WF5 live) | GWF4: 5 Selbstverifikationsfragen, Long Tasks am Prod-Build, Budget | nein |
| **WF5** Batch (Stufe 2) | `scripts/fire/fwi-daily.mjs` (Fusions-Obs-Adapter, Stationscodes, Kaltstart), Workflow `fwi-daily.yml` mit Commit-back `public/fire/fwi/{stations,latest}.json` (Default A; Variante PNG → Pages/R2); Client liest Codes, interpoliert mit `spatialInterp`, BUI ins FWI_h; Datenalter + Fallback auf Stufe 1 | GWF5: Batch 7 Tage stabil; Anker-Verifier gegen DWD-WBI nächtlich | **ja** — Workflow-Datei (Jans Gate); bei B/E zusätzlich Pages/R2 |
| **WF6** Kalibrierung Legende | Verwechslungsmatrix FWI₁₂ ↔ WBI über ≥ 1 Saison; erst dann DWD-nahe Klassenfarben | GWF6 | nein |

**Was ich direkt sage:** Ohne (a) bleibt alles stehen. Ohne (b) endet der Weg bei WF4 — das ist dann Weg A, ehrlich beschriftet, und **kein** Waldbrand-Forecast. Ohne (c) gibt es keinen Stundenregler im Brandradar, und dann gehört der Layer auf die Wetterkarte (Stundenregler existiert dort) statt in den Brandradar — auch das wäre eine Antwort, aber eine andere als der Auftrag.

---

## 10. Offene Fragen an Jan (nummeriert; Default gilt, wenn unbeantwortet)

1. **Composite-Vorbehalt** (§2 a): FWI-Gleichungen zugelassen, eigene Gewichte weiterhin nicht? *Default: nicht bauen.*
2. **Speicherweg** (§2 b): A Commit-back Stations-JSON (Default, keine neue Infrastruktur) · B Daten-Branch + Pages · E R2 (gesetzt, aber ohne Not)? *Default: A nach deinem Go für die Workflow-Datei, bis dahin Stufe 1.*
3. **Zeitregler** (§2 c): Einheitenwechsel auf einer Achse (Default) oder zweite Achse „Stunde"?
4. **Zwei Meteo-Basen** (§2 d): Index aus Fusion neben nativen Treibern (Default) — oder Treiber-Layer umziehen (Funktionserhalt-Freigabe)?
5. **Raster-Auflösung:** 100×80 (Bestand, Default) oder 160×128 für den Feuer-Layer?
6. **Batch-Meteorologie 12 UTC:** Stations-Obs über die Fusions-Adapter (Default, „auf der Fusion", Kaltstart möglich) oder ICON-D2-Analyse (DE-zentriert, verletzt das Gesetzte im Batch, kein Kaltstart)?
7. **24-h-Regen im Batch:** Stationshistorie (Default) — Radar-Summen (RADOLAN SF/INCA/rzc) oder ICON-D2 `tot_prec` als Fallback?
8. **Kaltstart AT/CH:** GeoSphere-/MeteoSwiss-Historie holen (Default) oder Startwerte + Einschwing-Flag?
9. **Legende:** EFFIS-Klassengrenzen (Default) bis zur Kalibrierung; danach DWD-nah?
10. **Wo lebt der Layer:** Brandradar (Auftrag) oder Wetterkarte (Stundenregler existiert)?
11. **Warm-Cron:** `relhum_2m` weiterhin nicht wärmen (Default)?

---

## 11. Verbesserungs-Kandidaten (D-28; Nummern folgen, sobald `improvements.md` existiert)

- **V-WF-1** `fireModel.ts:48` Kommentar zu `fireWeather` nennt vier Felder, geladen wird eines — korrigieren.
- **V-WF-2** Raster-Fusion verwirft `relativeHumidity`/`gust` der Obs-Adapter (`fusionEngine.ts`, kein Abgriff); AROME-Grid fragt `rh2m` nicht ab (`geosphereArome.ts:82`) — unabhängig vom Feuer-Forecast ein Datenverlust; als 5./6. Größe nachziehen (WF2).
- **V-WF-3** Zwei handgerollte 12-UTC-Anker in `FirePage.tsx:683-693, :703-715` → `frameAtValidTime` (Dopplung, Off-by-Frame-Risiko).
- **V-WF-4** GWIS-Codes (FFMC/DMC/DC/BUI) sind nur Bild — prüfen, ob EFFIS numerische Raster ohne Formular anbietet (Lizenz CC BY 4.0 wäre ok); wenn ja, zweite Anker-Quelle neben DWD-WBI.
- **V-WF-5** `netlify.toml` ohne `[[headers]]` — für `public/fire/*.png`/`.json` fehlt eine bewusste Cache-Aussage.
- **V-WF-6** ICON-D2-EPS `relhum_2m` in die EPS-Wärmliste ⇒ Feuerwetter-Spread als D-04-Ehrlichkeitsangabe (Cron = STOPP).
- **V-WF-7** `docs/DATA_SOURCES.md` §W.1: Stationszahl WBI 484 → heute 645 laut Stationsliste; §W.5 um den Batch-Befund ergänzen (FWI mit Zustand ist mit Batch möglich); §W.3 um `observations_germany/climate/hourly/*/recent` als Kaltstart-Quelle ergänzen.
- **V-WF-8** `docs/DATA_SOURCES.md` §W.0 (2): WBI ist **kein** FWI mit deutschen Schwellen, sondern ein Bestandsmodell in FWI-Struktur (DWD-Erläuterung 2020) — Formulierung „alle vier FWI-Eingangsgrößen" bleibt richtig, die implizite Gleichsetzung nicht.

---

## 12. Belege

**Code:** Zeilen wie zitiert (Arbeitsbaum 2026-08-18; `src/fire/` uncommitted seit 2026-07-30).

**Repo-Doku:** `docs/DATA_SOURCES.md` §W.0 (137 → heute 148 ICON-D2-Verzeichnisse, WBI-Raster 404), §W.1, §W.3, §W.5, §W.6; `decisions.md` D-01, D-04, D-06, D-10–D-14, D-16, D-18–D-21, O-01; `audit/brandflaechen-panel.md:100-106`; `audit/aktivfeuer.md` §2 S2.

**DWD (heute geholt):**
- ICON-D2 Listing: https://opendata.dwd.de/weather/nwp/icon-d2/grib/00/ (148 Verzeichnisse: `alb_rad, alhfl_s, apab_s, ashfl_s, asob_s, asob_t, aswdifd_s, aswdifu_s, aswdir_s, athb_s, athb_t, aumfl_s, avmfl_s, c_t_lk, cape_ml, ceiling, cin_ml, clat, clc, clch, clcl, clcm, clct, clct_mod, cldepth, clon, dbz_850, dbz_cmax, dbz_ctmax, depth_lk, echotop, elat, elon, fi, fr_ice, fr_lake, fr_land, freshsnw, grau_gsp, h_ice, h_ml_lk, h_snow, hbas_sc, hhl, hsurf, htop_dc, htop_sc, hzerocl, lai, lpi, lpi_max, mh, omega, p, plcov, pmsl, prg_gsp, prr_gsp, prs_gsp, ps, q_sedim, qc, qg, qi, qr, qs, qv, qv_s, rain_con, rain_gsp, relhum, relhum_2m, rho_snow, rootdp, runoff_g, runoff_s, sdi_2, smi, snow_con, snow_gsp, snowc, snowlmt, soiltyp, synmsg_bt_cl_ir10.8, synmsg_bt_cl_wv6.2, t, t_2m, t_bot_lk, t_g, t_ice, t_mnw_lk, t_snow, t_so, t_wml_lk, tch, tcm, tcond10_mx, tcond_max, td_2m, tke, tmax_2m, tmin_2m, tot_prec, tqc, tqc_dia, tqg, tqi, tqi_dia, tqr, tqs, tqv, tqv_dia, twater, u, u_10m, uh_max, uh_max_low, uh_max_med, v, v_10m, vis, vmax_10m, vorw_ctmax, w, w_ctmax, w_i, w_snow, w_so, w_so_ice, ww, z0`); EPS: https://opendata.dwd.de/weather/nwp/icon-d2-eps/grib/00/ ; Modelldoku: https://www.dwd.de/DE/leistungen/nwv_icon_d2_modelldokumentation/nwv_icon_d2_modelldokumentation.html ; Database Reference: https://www.dwd.de/DWD/forschung/nwv/fepub/icon_database_main.pdf
- WBI/GLFI: https://opendata.dwd.de/climate_environment/CDC/derived_germany/fire_danger_index/ ; DESCRIPTION woodland: https://opendata.dwd.de/climate_environment/CDC/derived_germany/fire_danger_index/woodland/forecast/DESCRIPTION_fire_danger_index_woodland_forecast.pdf ; grassland: https://opendata.dwd.de/climate_environment/CDC/derived_germany/fire_danger_index/grassland/forecast/DESCRIPTON_fire_danger_index_grassland_forecast.pdf ; WBI-Erläuterung (2020): https://www.dwd.de/DE/fachnutzer/landwirtschaft/dokumentationen/allgemein/wbx_erlaeuterungen.pdf ; DWD-Aktuell 2022: https://www.dwd.de/DE/Home/_functions/aktuelles/2022/20220620_gefahrenindizes.html
- CDC-Raster: https://opendata.dwd.de/climate_environment/CDC/grids_germany/daily/ (soil_moist, soil_moisture/{pine,…}, evapo_*, kein fire_danger_index); Beobachtungen: https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/hourly/ (air_temperature, cloud_type, cloudiness, dew_point, extreme_wind, moisture, precipitation, pressure, soil_temperature, solar, sun, visibility, weather_phenomena, wind, wind_synop; `…/air_temperature/recent/` ~600 `stundenwerte_TU_*_akt.zip`, 18-Aug-2026 08:40)
- MOSMIX: https://opendata.dwd.de/weather/local_forecasts/mos/ ; Elemente: https://www.dwd.de/DE/leistungen/opendata/help/schluessel_datenformate/kml/mosmix_elemente_xls.xlsx
- Lizenz: https://www.dwd.de/copyright ; https://opendata.dwd.de/climate_environment/CDC/Terms_of_use.txt

**Nachbarn/EU:** GeoSphere Datahub Docs https://dataset.api.hub.geosphere.at/v1/docs/ , Rate-Limit https://dataset.api.hub.geosphere.at/v1/docs/user-guide/request-limit.html , FAQ (Index abgeschaltet) https://www.geosphere.at/de/ueber-uns/faq ; MeteoSwiss OGD https://opendatadocs.meteoswiss.ch/e-forecast-data/e2-e3-numerical-weather-forecasting-model , Terms https://opendatadocs.meteoswiss.ch/general/terms-of-use ; EFFIS Fire Danger https://forest-fire.emergency.copernicus.eu/about-effis/technical-background/fire-danger-forecast , Lizenz https://forest-fire.emergency.copernicus.eu/about-effis/data-license ; BKG CLC5-2018 https://gdz.bkg.bund.de/index.php/default/open-data/corine-land-cover-5-ha-stand-2018-clc5-2018.html ; Copernicus DEM https://registry.opendata.aws/copernicus-dem/ ; ESA WorldCover https://esa-worldcover.org/en/data-access ; European Fuel Map https://doi.org/10.5194/essd-15-1287-2023

**Literatur:** Van Wagner 1977, PS-X-69 https://cfs.nrcan.gc.ca/publications?id=25591 · Van Wagner 1987, For. Tech. Rep. 35 https://cfs.nrcan.gc.ca/publications?id=19927 · Van Wagner & Pickett 1985, Rep. 33 https://cfs.nrcan.gc.ca/publications?id=19973 · Lawson & Armitage 2008 https://cfs.nrcan.gc.ca/publications?id=29152 · `cffdrs::hffmc` https://search.r-project.org/CRAN/refmans/cffdrs/html/hffmc.html ; Wang et al. 2017 https://doi.org/10.1186/s13717-017-0070-z · NG-CFFDRS https://natural-resources.canada.ca/forests-forestry/wildland-fires/canadian-forest-fire-danger-rating-system-generation ; GLC-X-26 https://publications.gc.ca/collections/collection_2021/rncan-nrcan/Fo123-2-26-2021-eng.pdf · Rodell et al. 2024, WAF https://doi.org/10.1175/WAF-D-23-0226.1 · Di Giuseppe et al. 2016 https://doi.org/10.1175/JAMC-D-15-0297.1 · Vitolo et al. 2020 https://doi.org/10.1038/s41597-020-0554-z · Fosberg 1978 (FFWI); Baumgartner-Index (WSL WikiFire) https://wikifire.wsl.ch/tiki-indexcd24.html?page=Baumgartner+index
