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

> **Stand 2026-08-19 — Jan hat entschieden (§13):** (a) Composite-Vorbehalt aufgehoben · (b) GitHub Actions + Weg A · (c) Stundenregler: eine Achse, Einheitenwechsel · **(d) Punkt = Fusion, Fläche = ICON-D2 nativ 2,2 km** (Revision der „Fusion überall"-Vorgabe). Phasenplan §9 revidiert, WF1 + WF2 umgesetzt (§14), **WF3 umgesetzt (§15, Gate GWF3; §15.5: Achse 0…6 h, Wind folgt)**. §0–§8 bleiben als Diagnose-Stand vom 2026-08-18 stehen; wo sie „Fläche aus der Fusion" sagen, gilt §13 (d).

**Empfehlung in einem Satz (Stand 2026-08-18):** Weg **B** (§8) — Tages-Codes (FFMC₁₂, DMC, DC → BUI) **an Stationen** einmal täglich per GitHub-Actions-Batch mit dem **Beobachtungs-Zweig und dem Raumkernel der Fusion** (dieselben Adapter wie `scripts/capture-fixture.mjs`, dieselbe `spatialInterp`), Kaltstart aus den DWD-CDC-Stundenreihen, Zustand als Stations-JSON per Commit-back (R2 nur noch Option, §2 b); **Stundenanteil im Client** (FFMC_h → ISI_h → FWI_h für h = 0…12) aus dem **Punkt-Forecast** (Klick/Panel) und aus der um **RH** erweiterten **Raster-Fusion** (Fläche); gestuft so, dass Stufe 1 (FFMC/ISI ohne Batch, ehrlich als „ohne Vortagsgedächtnis" beschriftet) **ohne** R2 und Cron ausrollbar ist und Stufe 2 den Batch nachzieht, ohne die UI zu ändern.

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

**B, gestuft — revidiert nach Jans Entscheidungen 2026-08-19 (§13): Punkt = Fusion, Fläche = ICON-D2 nativ.**
(Die Fassung vom 2026-08-18 hatte „RH in die Raster-Fusion" als WF2 und die Fläche aus der Fusion; das ist mit §13 (d) vom kritischen Pfad genommen und lebt als V-WF-2 weiter.)

| Phase | Inhalt | Gate | STOPP? |
|---|---|---|---|
| **WF0** | Diagnose (2026-08-18) + Entscheidungsprotokoll §13 (2026-08-19) | — | — |
| **WF1** Rechenkern | `src/fire/fwi/fwi.ts` (rein: FFMC/DMC/DC/ISI/BUI/FWI täglich, `hffmc` stündlich, Gleichgewichts-Start für Stufe 1, Schneeregel), Testvektoren aus `cffdrs` (`scripts/fixtures/fire-fwi-vectors.json`), `npm run verify:fire-fwi`; Kommentare `iconD2Relhum.ts` / `fireAssessment.ts` auf §13 (a) umgeschrieben; Lawson-Diurnal-Start folgt mit WF5 | GWF1: Parität ≤ 4 signifikante Stellen auf allen Vektoren; `typecheck` grün | nein |
| **WF2** Raster-Producer ICON-D2 | `src/fire/fwi/fireWeatherGrid.ts` (rein: Zellkette, Masken, Scheiben) + `src/sources/iconD2FireWeather.ts` nach `iconD2Thunder`-Muster: `relhum_2m` (Anker), `t_2m`, `u_10m`/`v_10m` (gewärmter Wind-Pfad), `tot_prec` (Δ), `h_snow`; Schritte = Jetzt-Fenster (`stepsForNowWindow`, +12 h) plus Vorgänger-`tot_prec`; je Zelle stündliche FFMC-Kette → ISI (Stufe 1) bzw. FWI (mit BUI-Gitter, WF5); RGBA-Frames; DACH-Maske bleibt Aufgabe der Karte (WF4) | GWF2: Zell-Verifier gegen `fwi.ts` am Punkt (`verify:fire-weather-grid`), Browser-Smoke (Frames, Konsole, Long Tasks), Budget | nein (kein Edge, kein Shader; `relhum_2m` bleibt ungewärmt — Q11) |
| **WF3** Stundenregler Brandradar ✅ (§15) | `FireLayerTime` um `hourly?: { maxHour: 12 }`; `sharedMaxDay` unverändert, neue `sharedMaxHour`; **eine Achse, Einheit wechselt** bei aktivem Stundenlayer (0…12 h heute), Tages-Layer klemmen auf Tag 0; `#wb=` bekommt `h` (nur ≠ 0); beide 12-UTC-Anker auf `bracketAtValidTime`; Playback in Stunden/s | GWF3: bestehende Permalinks byte-identisch; Tages-Slider ohne Stundenlayer unverändert; Touch ≥ 44 px | nein |
| **WF4** Layer + Panel (Stufe 1) | Layer `fireForecast` (Bit 13, append-only, eigene Dock-Gruppe), **Fläche** aus WF2 (ICON-D2), **Punktkurve** aus dem Punkt-Forecast der Fusion via `fwi.ts` (Klick), Steckbrief mit den Sätzen: kein amtliches Produkt · Fläche ICON-D2 2,2 km · Punkt buscosun-Fusion · Stufe 1: ISI ohne Vortagsgedächtnis · Klassengrenzen EFFIS | GWF4: 5 Selbstverifikationsfragen, Long Tasks am Prod-Build, Budget (totalJs 926,1) | nein |
| **WF5** Batch (Stufe 2, Weg A) | `scripts/fire/fwi-daily.mjs`: Fusions-Obs-Adapter (BrightSky/TAWES/SMN) → T/RH/Wind 12 UTC + 24-h-Regen je Station (Historie), Codes je Station mit Vortag, Kaltstart aus CDC-`hourly/recent`/BrightSky-Historie ab 1. März (AT/CH aus deren Historie, sonst Einschwing-Flag); Workflow `fwi-daily.yml` mit Commit-back `public/fire/fwi/{stations,latest}.json` (Race-sicherer Loop wie `warm-grib.yml`); Client interpoliert Codes mit `spatialInterp` + DEM (Raster **und** Punkt), `ffmcDiurnalStart` (Lawson & Armitage 2008), Datenalter sichtbar, > 36 h ⇒ Rückfall auf Stufe 1 mit Hinweis | GWF5: Batch 7 Tage stabil; `verify:fire-fwi-anchor` (FWI₁₂ ↔ DWD-WBI-Stufe je Station) nächtlich | **ja** — neue Workflow-Datei (Jans Go liegt vor, §13 b; Prod-Dispatch bleibt Jans Gate) |
| **WF6** Kalibrierung Legende | Verwechslungsmatrix FWI₁₂ ↔ WBI über ≥ 1 Saison; erst dann DWD-nahe Klassenfarben | GWF6 | nein |

**Aufwand revidiert:** ≈ 6 Sitzungen (WF1 0,5 · WF2 1,5 · WF3 1 · WF4 1 · WF5 1,5 · WF6 0,5).

**Was ich direkt sage (Stand 2026-08-19):** (a)–(d) sind entschieden (§13); WF1+WF2 sind ohne STOPP-Zone gebaut (§14). Was Stufe 1 (WF1–WF4) **nicht** ist: ein Waldbrand-Forecast mit Gedächtnis — das wird es erst mit WF5, und bis dahin steht „ohne Vortagsgedächtnis" im Steckbrief. Punkt (Fusion) und Fläche (ICON-D2) werden am selben Ort **nicht** identisch sein — das ist auf der Wetterkarte heute schon so (native Raster, Fusions-Punktpanel) und wird im Steckbrief gesagt, nicht kaschiert.

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
- **V-WF-9** `relhum_2m` 0…12 h wärmen (Cron = STOPP): spart `fireWeather` **und** `fireForecast` je Sitzung den Verzeichnis-Scan (§13 Q11).
- **V-WF-11** ✅ erledigt (§15.5, Jans Entscheidung): Stundenachse allgemein 6 h, `fireWind` `maxHour: 6`, Zielzeit `jetzt + h`, zu kurzer Lauf wird gesagt (`windClamped`).
- **V-WF-12** (vorbestehend, mobil) `.fire-td-now` („heute"/„jetzt") misst 37 px statt 44 (Padding-Trick 13 px auf 11-px-Schrift) — `padding: 17px 8px; margin: -17px -8px` behebt es; in WF3 nicht angefasst (Bestand, Desktop-unverändert-Regel).
- **V-WF-10** `src/sources/bz2Worker.ts`: nach dem 4-s-WASM-Init-Timeout bleibt `wasmBz2Promise` für die Sitzung `null` ⇒ dauerhaft pure-JS-bz2 (~100×) — im Smoke 28 min statt 11 s (§14). Mehrwert: kein „langsames Gerät bleibt langsam"; Skizze: Timeout anheben + Retry beim nächsten Aufruf statt Endzustand. Decoder-Zone ⇒ Jans Entscheidung.
- **V-WF-13** (app-weit, vorbestehend — in WF4 **gemessen**) **GRIB-Dekode läuft auf dem Hauptthread** (`fetchStepField` → bz2 + GRIB2/AEC je Feld, ~906 k Punkte). Am Prod-Build kostet das beim Kaltstart Long Tasks von 200–700 ms: RH-Treiber allein 418 ms, `fireForecast` 700 ms — Letzteres, weil dieser Layer **sechs** Felder je Schritt holt statt einem (§16.3). Die FWI-Kette ist es NICHT: sie rechnet in 40 k-Scheiben (15–30 ms) mit Yield dazwischen, und Scrubben/Leerlauf/Abspielen sind long-task-frei. Mehrwert: der Kaltstart jedes ICON-D2-Layers wird ruckelfrei, nicht nur dieser. Skizze: Dekode in den bestehenden Worker-Pfad verlagern (Muster `windFrameWorker`) oder je Feld nach dem Dekode yielden; die genaue Zuordnung der 700 ms braucht Messmarken im Dekodepfad (heute per Vergleichsmessung zugeordnet, nicht per Profil). Decoder-Zone ⇒ Jans Entscheidung.

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

---

## 13. Entscheidungsprotokoll (Jan, 2026-08-19)

| Frage (§2/§10) | Entscheidung | Konsequenz |
|---|---|---|
| **(a) Composite-Vorbehalt** | **Aufgehoben** für publizierte Gleichungssysteme (FWI nach Van Wagner). Eigene, frei gewählte Gewichte bleiben unzulässig (D-19-Linie). | `src/fire/fwi/fwi.ts` (WF1); die beiden Kommentare (`iconD2Relhum.ts`, `fireAssessment.ts`) sind auf diese Entscheidung umgeschrieben, nicht gelöscht. |
| **(b) Batch/Speicher** | **GitHub Actions** (bestehender Mechanismus: `warm-grib`/`warm-wind`/`health`/`nightly`) + **Weg A**: Commit-back `public/fire/fwi/{stations,latest}.json`, Fläche im Client per `spatialInterp`. Kein R2, kein Bucket, kein Secret. | WF5 = eine neue Workflow-Datei nach `warm-grib.yml`-Muster; Prod-Dispatch bleibt Jans Gate. Die R2-Vorgabe des Auftrags ist zurückgenommen. |
| **(c) Stundenregler** | Default: **eine Achse, Einheit wechselt** (0…12 h, heute) bei aktivem Stundenlayer; Tages-Layer klemmen auf Tag 0. | WF3. |
| **(d) Meteo-Basis** | **Punkt = buscosun-Fusion** (Punkt-Forecast) · **Fläche = ICON-D2 nativ 2,2 km** („möglichst genau"). Revision der Vorgabe „Fusion als einzige Basis, kein Roh-GRIB daneben": sie gilt jetzt **für den Punkt**; das Raster folgt den bestehenden Brandradar-Treibern. | Alter WF2 (RH in die Raster-Fusion) entfällt vom kritischen Pfad (bleibt V-WF-2); neuer WF2 = ICON-D2-Raster-Producer. Zwei-Basen-Frage gelöst: Fläche teilt die Basis mit `fireWeather`/`fireSoilDryness`/`fireWind`; die Fusion arbeitet am Punkt, wo sie obs-verankert und terrain-korrigiert ist. Steckbrief nennt beides (WF4). |
| **Umfang nächste Session** | **WF1 + WF2** (Rechenkern + Raster-Producer, kein sichtbarer Layer, kein Regler, kein Batch). | umgesetzt, §14. |
| Q5 Raster-Auflösung | entfällt — ICON-D2 2,2 km, `TARGET_WIDTH 700` wie alle Bestandslayer | — |
| Q6/Q7 Batch-Meteorologie, 24-h-Regen | Defaults (Fusions-Obs-Adapter an Stationen; Regen aus Stationshistorie, Fallback `tot_prec`) | WF5 |
| Q8 Kaltstart AT/CH | Default (Historie holen, sonst Einschwing-Flag) | WF5 |
| Q9 Legende | Default (EFFIS-Grenzen bis WF6) | WF4/WF6 |
| Q10 Ort des Layers | Brandradar | WF3/WF4 |
| Q11 Warm-Cron `relhum_2m` | Default (nicht wärmen); **V-WF-9**: `relhum_2m` 0…12 h zu wärmen würde `fireWeather` **und** `fireForecast` je Sitzung den Verzeichnis-Scan sparen — Cron-Entscheidung für später | — |

---

## 14. Gate GWF1 + GWF2 — Umsetzung WF1 + WF2 (2026-08-19)

**Gebaut (kein UI, kein bestehender Pfad berührt — Rule 2, default-off durch Nichtverdrahtung):**

| Datei | Inhalt |
|---|---|
| `src/fire/fwi/fwi.ts` (neu, rein) | `ffmcDaily`/`dmcDaily`/`dcDaily`/`isi`/`bui`/`fwi`/`dsr`/`dailyFwi`, `hffmc` (Van Wagner 1977, cffdrs-Form mit `time.step`), `hffmcChain`, `ffmcEquilibriumBand`/`ffmcEquilibrium` (Startwert ohne Vortag), `hourlyIndices`, `snowMasked` (`SNOW_MASK_M = 0,01 m`), `FWI_STARTUP` 85/6/15, Le/Lf-Tabellen, `verifyFwi()`. Ehrlichkeitsregeln: NaN durchreichen, Kelvin-Fehleingabe ⇒ NaN, kein FWI ohne BUI. **Befund beim Bau:** cffdrs rechnet Tages-FFMC, ISI **und** hFFMC mit der exakten FF-Skalen-Konstante `250·59,5/101 = 147,2772…`, nicht mit dem 1985 gedruckten 147,2 — mit 147,2 lagen die Vektoren um 0,04 FFMC / 0,07 ISI daneben; übernommen und im Kopf dokumentiert. |
| `scripts/fixtures/fire-fwi-vectors.json` (neu, 25 KB) | Testvektoren aus `github.com/cffdrs/cffdrs_r` (main, 2026-08-19): `fwi(test_fwi)` 48 Tage × 7 Größen (`tests/testthat/data/fwi_01.csv`) + je 80–120 Punkte aus den Paket-Sweeps für FFMC/DMC/DC/ISI/BUI/FWI/hFFMC (auf physikalisch gültige Bereiche gefiltert; 4 signifikante Stellen). |
| `scripts/verify-fire-fwi.mjs` (neu) · `npm run verify:fire-fwi` | Selbsttest + Tageskette 1985 (Zustand fortgeschrieben) + 7 Sweeps + Invarianten (Gleichgewichtsband, Monotonie RH/Regen/Wind/BUI, NaN, Kelvin, Schnee) + Quell-Sonde (keine Imports, DOM-/Netz-/Zeit-frei, exakte Konstante). **43/43.** |
| `src/fire/fwi/fireWeatherGrid.ts` (neu, rein) | `initFfmcState`, `stepFireWeather` (Zellkette je Schritt, in Scheiben `from`/`to` mit geteilten Puffern; Masken: RH-NaN, Schnee, kein Wind; Regen-Δ ≥ 0; `rain-unknown`/`no-wind`-Notizen; `fwi` nur mit BUI-Gitter), `allocFireWeatherBuffers`, `verifyFireWeatherGrid()`. |
| `scripts/verify-fire-weather-grid.mjs` (neu) · `npm run verify:fire-weather-grid` | Zelle == Punkt (`hffmcChain`) auf 4×3 und 608×373 × 13 Schritten, Masken, Scheiben == Durchlauf, Kosten-Anker (Node ~90 ms je vollem Schritt), Producer-Selbsttest, Quell-Sonden. **39/39.** |
| `src/sources/iconD2FireWeather.ts` (neu) | Producer nach `iconD2Thunder`-Muster: `resolveLatestRun('relhum_2m')`, Schritte = `stepsForNowWindow(steps, runAt, 12)` + Vorgänger-`tot_prec`, je Schritt 6 Felder (u/v über `D2_WIND_PROXY_BASE`, Rest `/_dwd_grib`), Grid-Mismatch-Guard, Kette in Reihenfolge hinter einem Cursor trotz parallelem Laden, Scheiben à 40 k Zellen mit `setTimeout(0)`-Yield, RGBA-Frames R = ISI/30 (Stufe 1) bzw. FWI/80, A = Maske, `mode`/`start`/`notes` im Ergebnis, `verifyIconD2FireWeather()`. |
| `src/sources/iconD2Precip.ts` · `src/wind/iconD2WindSource.ts` | `D2_WIND_PROXY_BASE` als **einzige** Quelle des Wind-Pfad-Strings (bisher privat im Windloader; jetzt importiert — byte-identisches Verhalten, `verify:wind-transport` grün). |
| `src/sources/iconD2Relhum.ts:27-34` · `src/fire/fireAssessment.ts:19-24` | Vorbehalts-Kommentare auf §13 (a) umgeschrieben. |
| `package.json` | zwei `verify:*`-Einträge (Verifier-Zahl 51 → 53). |

**Belege:**
- `npm run typecheck` grün · `verify:fire-fwi` 43/43 · `verify:fire-weather-grid` 39/39 · Bestand unverändert grün: `verify:fire-time` 75/75, `verify:fire-model` 100/100, `verify:fire-boden` 52/52, `verify:wind-transport` alle Checks.
- `npm run build && npm run budget`: totalJs **906,7 / 926,1 KB** (unverändert — die Module sind noch nicht in den FirePage-Chunk importiert; das kommt mit WF4), eagerJs 124 KB, largestChunk 278,4 KB.
- **Browser-Smoke** (headless Chrome 1440×900 per CDP gegen den Dev-Server, Brandradar-Route, `import('/src/sources/iconD2FireWeather.ts')` + `fetchIconD2FireWeather({ aheadHours: 12 })`, Lauf `2026081906`, „jetzt" ≈ 07:30 UTC): **14 Frames (Schritte 1…14) in 11,1 s, erster Frame nach 3,5 s**, 85 GRIB-Felder, `mode: 'isi'`, `start: 'equilibrium'`, 608×373, keine Konsolenfehler, keine Exceptions, **5 Long Tasks, max 72 ms** (Gate 200 ms), sichtbarer Anteil 83,1 % (ICON-D2-Domäne im Rechteck), keine `notes` (Vorgänger-`tot_prec` und Wind lagen für alle Schritte vor). **Tagesgang messbar:** mittlerer R-Kanal 22,7 (07 UTC) → 34,8 (15 UTC) → 23,6 (20 UTC); das Maximum erreicht ab 14 UTC den Deckel (ISI ≥ 30 auf Alpenkämmen bei starkem Wind — physikalisch plausibel, EFFIS-Oberklasse). Selbsttest 7/7 im Browser. Die Browser-MCPs (Extension, chrome-devtools) waren in dieser Sitzung nicht verbunden; der CDP-Weg misst dieselbe Seite mit derselben Konsole.
- **Fünf Fragen:** (1) Funktionserhalt — kein bestehender Layer/Loader verändert, Windloader byte-identisch (Verifier); (2) Desktop pixelgleich — kein UI berührt; (3) Touch — n/a; (4) Konsole sauber — ja (Smoke); (5) Long Tasks — max 72 ms.

**Zwei Befunde nebenbei (Ehrlichkeit):**
1. **V-WF-10 (App-weit, vorbestehend):** Der erste Smoke lief mit `--disable-gpu` in **28 Minuten** statt 11 s. Ursache: `src/sources/bz2Worker.ts` initialisiert `bzip2-wasm` mit **4-s-Timeout**; unter Last (Pool-Worker starten gleichzeitig, Seite lädt) läuft der Timeout ab und `wasmBz2Promise` bleibt **für die Sitzung** `null` ⇒ pure-JS-bz2 (~100× langsamer) für alle folgenden Felder — Log: „still waiting on run dependencies: wasm-instantiate". Mit einem Warm-up-Decompress vor der Last: 11 s. Betrifft jeden GRIB-Layer auf langsamen Geräten; Vorschlag: Timeout hochsetzen **und** nach Fehlschlag später erneut versuchen statt dauerhaft zu degradieren. Nicht in dieser Phase geändert (Decoder-Zone).
2. `ISI_VMAX = 30` klemmt Alpenkämme; für die Legende (EFFIS-Oberklasse > 26,8) ist das richtig, für den Punktwert (WF4) wird der ungeklemmte Wert aus `fwi.ts` genommen.

**Nächster Schritt:** WF3 (Stundenregler Brandradar) — eigene Phase, eigenes Gate.

---

## 15. WF3 — Stundenregler im Brandradar: Diagnose + Plan (2026-08-19)

**Auftrag (Jan, §13 c):** eine Achse, Einheit wechselt — 0…12 h (heute) bei aktivem Stundenlayer; Tages-Layer klemmen auf Tag 0; `#wb=` bekommt `h`; beide 12-UTC-Anker auf `frameAtValidTime`; Playback in Stunden/s. Gate GWF3: bestehende Permalinks byte-identisch, Tages-Slider ohne Stundenachse unverändert, Touch ≥ 44 px.

### 15.1 Einhängepunkte (am Code gemessen)

| Was | Wo | Befund |
|---|---|---|
| Zeitmodell | `src/fire/fireTime.ts` | `FireTimeMode` = `instant`/`window`/`forecast`, `FireLayerTime { mode, maxDay, windowsH? }`, `FireTimeState { day, windowH }`, `sharedMaxDay` = Minimum über `forecast`-Layer (instant/window übergangen — die WW1-Falle), `reconcileFireTime`, `followsSlider`/`laggingLayers`, `dayLabel`, `dayToIsoDate` (UTC). Rein, `verify:fire-time` 75/75. |
| Permalink | `src/fire/fireState.ts` | `encodeFireState` schreibt `b`/`d`/`w` immer, alles Weitere **nur bei Abweichung vom Standard** (Links bleiben byte-gleich). Ein Stundenfeld muss dieser Konvention folgen. |
| Playback | `src/fire/firePlayback.ts` | `stepPlayback(pos, dt, perSecond, max)` ist **einheitenfrei** (Float-Uhr, ganzzahlige Ausgabe, dt-Deckel 0,25 s) — für Stunden 1:1 wiederverwendbar; nur die Geschwindigkeit ist tagesspezifisch (`daysPerSecondForTier` 0,7/0,9/1,1 — „eine Kachelrunde je Tag beim Fremdserver"). Stundenframes liegen **im Speicher** (relhum/smi je 25 Canvases) ⇒ schneller darf sein. |
| Zeit-Deck | `FirePage.tsx:1637-1697` | `showSlider = hasForecastSlider`; `<input type=range min=0 max={maxDay} step=1>`, Ticks „heute · +N T · +maxDay Tage", Stand `dayLabel` + „lädt …"-Pending (entprellter `committedDay`, 140 ms), Play-Kachel. Mobil: `.fire-mobile-time` schwebt über dem Sheet, Range-Höhe 44 px, `fire-td-now` mit Padding-Trick auf 44 px. |
| 12-UTC-Anker (2×) | `FirePage.tsx:683-698` (smi) · `:703-720` (relhum) | handgerollte Nächster-Frame-Suche auf `Date.UTC(heute, 12) + day·86 400 000` — semantisch exakt `frameAtValidTime(frames, targetMs)` (`frameAtValidTime.ts:66-81`, nächster `validAt`). Die Frames sind **stündlich** 0…+24 h ab Lauf (`iconD2Relhum.ts:52`, `iconD2Smi.ts:85` `MAX_STEP 24`, `MIN_STEP 0`) — von 25 geladenen Frames zeigt der Tagesregler heute **zwei**. |
| Wind | `FireMap.tsx:979-1020` | Zielzeit **immer `Date.now()`**, bewusst (WW1, `audit/waldbrand-wind.md` §2): `windFrameAtValidTimeAsync` klemmt still auf den letzten Frame, Gitter reicht +12 h **ab Lauf** (`iconD2WindSource.ts:30`), Lauf 2–5,5 h alt ⇒ „jetzt + 12 h" liegt außerhalb. |
| Tages-Layer | `FirePage.tsx:969` (DE-Stationen `[time.day]`), `FireMap` `isoDate` (GWIS-WMS `TIME`), `committedIso`/`prefetchIso` | alle hängen an **einem** Tagesschritt; `dayToIsoDate(day, nowMs)` rechnet UTC-Kalendertage. |
| Ehrlichkeitstexte | `FirePage.tsx:1172` „gilt für heute — folgt dem Tagesregler nicht", `:1576-1580` Sammelhinweis, `:1693` „kein Tagesregler"; `FireLayerCard.tsx:260` Wind: „der Regler hier zählt in Tagen" | werden mit einer Stundenachse **falsch** (der Regler zählt dann nicht mehr nur in Tagen) ⇒ Texte einheitenabhängig, Wind-Steckbrief-Satz präzisieren. |
| Wetterkarte als Muster | `MapView.tsx:4640-4665` | Ticks „jetzt · +N h", `step=0.1` mit Lerp — hier **nicht** übernommen: die Brandradar-Frames sind Stundenstützen ohne Blend-Pfad im `ScalarLayer`; ganze Stunden sind ehrlich (keine interpolierten Felder) und teilen die Ganzzahl-Logik von `stepPlayback`. |

### 15.2 Die eine offene Designfrage — und die Antwort

**Was schaltet die Stundenachse ein, solange es den Stundenlayer (`fireForecast`, WF4) noch nicht gibt?** Ohne Antwort wäre WF3 ein Mechanismus, den im Produkt niemand erreicht — nicht verifizierbar (GWF3 verlangt Touch ≥ 44 px an sichtbarer UI) und ohne Nutzen.

**Entscheidung WF3 (Default, Jan kann widersprechen):** Die Einheit wird an **zwei** Stellen bestimmt:
1. **Erzwungen** durch einen Layer mit `mode: 'hourly'` (ab WF4 `fireForecast`) — dann Stunden, kein Wahlknopf.
2. **Wählbar** („Tage | Stunden"-Umschalter im Zeit-Deck), sobald ein aktiver Layer **stündliche Frames** hat (`maxHour` gesetzt): heute `fireWeather` und `fireSoilDryness`. Standard bleibt **Tage** ⇒ ohne Handgriff ist nichts anders als heute (Funktionserhalt, Rule 2). Produktwert sofort: die 25 geladenen RH-/SMI-Frames werden als Tagesgang bedienbar (Nachmittagsminimum der Feuchte ist die feuerwetterrelevante Größe), ohne dass ein neuer Layer nötig ist.

Verfeinerung von „Tages-Layer klemmen auf Tag 0": Tages-Layer zeigen den **Kalendertag, in den `jetzt + h` fällt** (`dayOfHour`). Bis Mitternacht UTC ist das Tag 0 — identisch zur Vorgabe; abends springt EU-Index/DWD-Stufe bei `jetzt + h` nach Mitternacht auf „morgen" statt den falschen Tageswert zu behaupten. Die Zeile sagt es: „Tageswert · gilt für morgen — keine Stundenauflösung".

**Nicht in WF3 (V-WF-11):** `fireWind` der Stundenachse folgen lassen. Möglich bis `jetzt + (12 − Laufalter)` ≈ +6 h garantiert — ein eigener `maxHour: 6` zöge die gemeinsame Achse beim Zuschalten des Winds auf 6 zusammen (korrekte Horizont-Logik) und bräuchte eine Frame-Nähe-Prüfung in `FireMap` (kein stilles Klemmen). Eigene Phase; bis dahin sagt die Wind-Zeile „gilt für jetzt — folgt dem Stundenregler nicht".

### 15.3 Plan (eine Session)

| Schritt | Datei | Inhalt |
|---|---|---|
| 1 | `fireTime.ts` | `FireTimeMode` + `'hourly'`; `FireLayerTime.maxHour?` (Stundenhorizont **ab jetzt**, aus jedem Lauf erreichbar: relhum/smi 12 — nicht 24, damit die Achse beim Layerwechsel nie springt und identisch zu WF4 ist); `HOUR_AXIS_MAX = 12`; `FireTimeUnit = 'days' \| 'hours'`; `FireTimeState += { hour, unit }`; `sharedMaxHour`, `hourlyAvailable`, `timeUnit` (erzwungen > gewählt > Tage), `clampHour`, `reconcileFireTime` (Stunde klemmen, Einheit zurück auf Tage ohne Stundenlayer), `hasTimeSlider(active, unit)`, `dayOfHour(hour, nowMs)` (UTC-Tagesdifferenz), `hourLabel`, `hourFollow(layer, hour)` → `'hourly' \| 'daily' \| 'none'`, `laggingLayers(active, pos, unit = 'days')` abwärtskompatibel. `verifyFireTime` erweitert. |
| 2 | `fireState.ts` | `FireState.hour?: number` — **vorhanden ⇔ Stundenachse aktiv** (auch 0); `encode` schreibt `h` nur dann; alte Links ohne `h` bleiben **byte-identisch** (Anker-Check mit Literal-Hash). |
| 3 | `firePlayback.ts` | `hoursPerSecondForTier` (2,2/1,8/1,4 h/s — Frames im Speicher, ~0,45 s Standzeit je Stunde lesbar). |
| 4 | `FirePage.tsx` | `unit`/`pos`/`sliderMax`; Zeit-Deck: Ticks „jetzt · +3 h · +6 h · +9 h · +12 h", Stand „+h h · HH:MM", Umschalter `fire-td-unit` (nur mit `hourlyAvailable`, stumm bei erzwungener Einheit); beide Anker → `frameAtValidTime(frames, targetMs)` mit `targetMs = Stunden ? jetzt + h : Mittag(Tag)`; `dayForLayers` → `committedDay`/`isoDate`/Stationsindex; Lag-Texte je Einheit; Permalink `hour`. |
| 5 | `fireDeck.css` | `.fire-td-unit` (Pill wie `.fire-subseg`, 11 px), mobil 44 px Trefferfläche via Padding-Trick wie `.fire-td-now`. |
| 6 | Texte | `FireLayerCard.tsx:260` Wind-Satz; `iconD2Relhum.ts:51`/`iconD2Smi.ts:82` Kommentar „Regler in Tagesschritten" aktualisieren. |
| 7 | Verifier | `verify:fire-time` (+ Quell-Sonde: keine handgerollte 12-UTC-Schleife mehr in `FirePage.tsx`, `frameAtValidTime` importiert), `verify:fire-model` (Permalink-Anker). |
| 8 | Gate | Browser 1440×900 + 390×844: Tage-Modus pixelgleich (Screenshot-Vergleich vor/nach), Stunden-Modus mit RH-Layer (Frame wechselt je Stunde — `__fireWeatherLayer`-Gegenprobe), Touch ≥ 44 px (`getBoundingClientRect`), Konsole sauber, Long Tasks; Permalink-Round-Trip. |

### 15.4 Gate GWF3 — Umsetzung (2026-08-19)

**Gebaut (additiv; Tagesachse ohne Stundenlayer unverändert):**

| Datei | Inhalt |
|---|---|
| `src/fire/fireTime.ts` | `FireTimeMode` + `'hourly'`; `FireLayerTime.maxHour?`; `HOUR_AXIS_MAX = 12`; `FireTimeUnit`; `FireTimeState += { hour, unit }`; `sharedMaxHour`, `hourlyAvailable`, `hourlyForced`, `timeUnit` (erzwungen > gewählt > Tage), `clampHour`, `reconcileFireTime` (Stunde klemmen, Einheit fällt ohne Stundenlayer auf Tage zurück — kein totes `h`), `hasTimeSlider`, `dayOfHour` (UTC-Kalendertag von jetzt + h, Mitternacht = morgen wie `dayToIsoDate`), `hourLabel`, `hourFollow` (`hourly`/`daily`/`none`), `dailyOnlyLayers`, `laggingLayers(active, pos, unit = 'days')` abwärtskompatibel. `fireWeather`/`fireSoilDryness` tragen `maxHour: 12` (Frames stündlich bis +24 h ab Lauf; 12 h ab jetzt aus jedem Lauf erreichbar und identisch zum WF4-Layer ⇒ die Achse springt beim Layerwechsel nie). +26 Selbstprüfungen. |
| `src/fire/fireState.ts` | `FireState.hour?: number \| null` — **vorhanden ⇔ Stundenachse** (auch 0); `h` wird nur dann geschrieben; **Literal-Anker** im Selbsttest: `encode({b:1,d:0,w:24})` ist byte-gleich `#wb=%7B%22b%22%3A1%2C%22d%22%3A0%2C%22w%22%3A24%7D` (Stand vor WF3). +6 Prüfungen. |
| `src/fire/firePlayback.ts` | `hoursPerSecondForTier` = 2 × Tage (2,2/1,8/1,4 h/s — Frames im Speicher, kein Kachel-Roundtrip); `stepPlayback` unverändert einheitenfrei. +2 Prüfungen. |
| `src/fire/FirePage.tsx` | `unit`/`hourly`/`maxHour`/`sliderMax`/`pos`/`unitChoice`/`dayForLayers`; **beide 12-UTC-Anker** (smi, relhum) durch `frameAtValidTime(frames, frameTargetMs)` ersetzt — `frameTargetMs` = Stunden ? jetzt + h : Mittag(Tag) (auf der Tagesachse semantisch identisch zur alten Schleife: nächster `validAt`); Stationsfarben/`committedDay`/`isoDate` folgen `dayForLayers`; Playback in der geltenden Einheit (`setPos`, `unitsPerSecond`); Zeit-Deck: Ticks „jetzt · +3 h · +6 h · +9 h · +12 h", Stand „+6 h · 16:26" (Ortszeit), `aria-label` Stundenschritt, Rücksetzer „jetzt", Umschalter `fire-td-unit` (Tage \| Stunden; nur mit `hourlyAvailable && !hourlyForced`); Lag-Texte je Einheit + Zeile „Tageswert · gilt für heute/morgen — keine Stundenauflösung" für Tages-Layer; Permalink `hour: hourly ? time.hour : null`. |
| `src/fire/fireDeck.css` | `.fire-td-unit` (Pill wie `.fire-subseg`, 26 px Desktop); mobil: `.fire-td-row { flex-wrap: wrap }`, Umschalter als eigene Zeile, Knöpfe 44 px (ohne Umschalter ändert das Wrap nichts — Spur hat `flex-basis 0`). |
| Texte | `FireLayerCard.tsx` Wind-Satz („folgt weder dem Tages- noch dem Stundenregler … ein stillschweigend geklemmter Frame wäre eine Falschaussage"); `iconD2Relhum.ts`/`iconD2Smi.ts` Horizont-Kommentare. |
| `scripts/verify-fire-time.mjs` | +8 Quell-Sonden an `FirePage.tsx`/`fireDeck.css` (Anker über `frameAtValidTime`, keine `zielMs`-Schleife, `timeUnit`/`hasTimeSlider`, `dayOfHour` → Stationen/`committedDay`, Permalink-`h`, `stepPlayback(…unitsPerSecond, sliderMax)`, Umschalter-Bedingung, Lag-Texte, mobil 44 px). |

**Belege:**
- `npm run typecheck` grün · `verify:fire-time` **105/105** (vorher 75) · `verify:fire-model` **106/106** (vorher 100) · unverändert grün: `fire-boden` 52/52, `fire-fwi` 43/43, `fire-weather-grid` 39/39, `fire-danger-views` 44/44.
- `npm run build && npm run budget`: totalJs **907,6 / 926,1 KB** (+0,9 KB gz), eagerJs 124 KB, largestChunk 278,4 KB — alle Budgets eingehalten.
- **Browser (headless Chrome per CDP, `scratchpad/cdp-wf3.mjs`, Dev-Server :5173 und Prod-Preview :4173):**
  - **Tagesachse unverändert:** Standardzustand `b=3` ⇒ `.fire-timedeck`-Markup byte-gleich zum Stand vor WF3 (Play „Tage abspielen", „heute · +2 T · +3 T · +5 T · +6 Tage", `max=6`, `aria-label` Tagesschritt, Stand „heute", **kein** Umschalter), Hash unverändert `#wb={"b":3,"d":0,"w":24}`. Screenshots `before-desk-td.png` ↔ `wf3-desk-default-td.png`, `before-mob-td.png` ↔ `wf3-mob-default-td.png`.
  - **RH-Treiber zu (`b=9`), Tagesachse:** Umschalter erscheint (Tage aktiv), Regler `max=1`, Stand „heute", Hash ohne `h` — byte-gleich `#wb={"b":9,"d":0,"w":24}`.
  - **Stunden:** Klick „Stunden" ⇒ `max=12`, Ticks „jetzt +3 h +6 h +9 h +12 h", Stand „jetzt · 10:26", Hash `…"h":0`, Deck `is-hourly`; +6 h ⇒ Stand „+6 h · 16:26", EU-Index-Zeile „Tageswert · gilt für heute — keine Stundenauflösung", **RH-Frame wechselt** (`__fireWeatherLayer.data.image`, mittlerer R-Kanal 59,2 (jetzt, 08 UTC) → 88,6 (+6 h, 14 UTC) → 56,3 (+12 h, 20 UTC) — der Nachmittag ist trockener, wie es sein muss; Tagesachse-Mittag 85,3); Füllung 100 % bei 12.
  - **Playback:** 2,5 s ⇒ Stunde 5 (2,2 h/s, Desktop-Tier), endet bei 12 mit `aria-pressed=false`; mobil 1,4 h/s (Tier) ⇒ 3 nach 2,5 s, 10 nach 7,5 s.
  - **Rücksetzer „jetzt"** ⇒ 0, Knopf `disabled`; **zurück auf Tage** ⇒ `max=1`, Hash byte-gleich zum Ausgangszustand (kein `h`).
  - **Permalink-Round-Trip:** `#wb={"b":9,"d":0,"w":24,"h":4}` geladen ⇒ Stundenachse, Regler 4, Stand „+4 h · 14:26".
  - **Touch (390×844, DPR 3):** Umschalter-Knöpfe **164 × 44 px**, Range 44 px, Play 46 px; `.fire-td-now` 37 px (vorbestehend, V-WF-12). Mobil wird der Umschalter zur eigenen Zeile unter dem Regler (`wf3-mob-hour6-full.png`).
  - **Konsole:** keine Fehler, keine Exceptions, keine Warnungen (Desktop, Mobil, Prod-Preview).
  - **Long Tasks beim Scrubben 0…12:** Dev 5 × 50–60 ms (Dev-Overhead), **Prod-Preview 0** (Framewechsel = ein `setData`); Gate 200 ms.
- **Fünf Fragen:** (1) Funktionserhalt — Tagesachse, Fenster, Playback, Permalinks unverändert (Markup- und Hash-Anker), kein Layer entfernt; (2) Desktop pixelgleich ohne Stundenlayer — Markup byte-gleich ⇒ ja; mit RH-Treiber kommt der Umschalter additiv ans Zeilenende; (3) Touch ≥ 44 px — Umschalter, Range, Play ja; (4) Konsole sauber — ja; (5) Long Tasks — 0 am Prod-Build.

**Befund nebenbei:** Navigiert man per CDP nur den Hash um (`Page.navigate` auf dieselbe Seite mit anderem `#wb=`), lädt die App **nicht** neu — der Zustand bleibt, das Permalink-Effect schreibt den alten Hash zurück. Für Smokes: über `about:blank` gehen. Kein Produktfehler (die Seite reagiert bewusst nicht auf `hashchange`; die Rail-Navigation setzt den Zustand).

**Nächster Schritt:** WF4 — Layer `fireForecast` (`mode: 'hourly'`, `maxHour: 12`, Bit 13), Producer aus WF2 einhängen, Steckbrief, Punktkurve via Punkt-Forecast. Eigene Phase, eigenes Gate.

### 15.5 Revision (Jan, 2026-08-19): „Stundenregler allgemein nur bis 6 h, auch okay" — Wind läuft mit

**Entscheidung:** Die Stundenachse ist **0…+6 h** (nicht 12), und zwar für alles — RH-Treiber, Boden, Wind, Producer (WF2) und der spätere Layer `fireForecast` (WF4). Grund: das Windgitter reicht +12 h **ab Lauf**, der Lauf ist beim Abruf 2–6 h alt ⇒ +6 h ab jetzt liegen aus jedem Lauf im Gitter; V-WF-11 ist damit erledigt statt vertagt. Kürzere Achse, aber alle drei Treiber auf einer Zeit — das ist für die Brandlage die bessere Achse.

**Geändert:**

| Datei | Inhalt |
|---|---|
| `src/fire/fireTime.ts` | `HOUR_AXIS_MAX = 6` (Kommentar nennt den Grund); `fireWind` trägt `maxHour: HOUR_AXIS_MAX` (Modus bleibt `instant` — auf der Tagesachse unverändert WW1); Selbsttests auf 6 (Wind allein: Tagesachse nein, Stundenachse ja; alter Link `h:12` → 6; `hourFollow('fireWind', 6) === 'hourly'`; `laggingLayers` nennt den Wind nicht mehr). |
| `src/sources/iconD2FireWeather.ts` | `FIRE_WEATHER_AHEAD_H = 6` — der Producer lädt nicht mehr, als die Achse zeigt (nicht aus `fire/` importiert: Quellen bleiben UI-frei; der Verifier prüft die Gleichheit). |
| `src/fire/FireMap.tsx` | Prop `windTargetMs?: number \| null` — Zielzeit des Windframes: `windTargetMs ?? Date.now()`; Effekt-Deps + `windTargetMs`. Tagesachse: `null` ⇒ byte-gleiches Verhalten (Wind = jetzt). |
| `src/fire/FirePage.tsx` | `windTargetMs = hourly ? frameTargetMs : null` → FireMap; `windHorizonH`/`windClamped`: reicht der **geladene** Lauf nicht bis zur Zielzeit (nur nach Ladeende bewertet, sonst Flackern), steht an der Wind-Zeile „Modellfeld reicht bis +X h — zeigt den letzten verfügbaren Schritt" — gesagt, nicht still geklemmt; **Wind allein** hat keine Tagesachse, aber eine Stundenachse ⇒ der Umschalter steht auch im „kein Tagesregler"-Deck (Text: „… genau einen Zeitpunkt — Stundenachse wählbar."). |
| `src/fire/firePlayback.ts` | Selbsttest Horizont 6. |
| `src/fire/FireLayerCard.tsx` | Wind-Steckbrief: folgt der Stundenachse bis +6 h, und warum die Achse dort endet. |
| `src/fire/fireDeck.css` | Hinweiszeile ohne Regler als Flex-Item, Umschalter rechts. |
| `scripts/verify-fire-time.mjs` | +5 Sonden: `windTargetMs` in FirePage/FireMap, `windClamped`, **`HOUR_AXIS_MAX + 5,5 ≤ Wind-MAX_STEP`** (die Achse ist so lang, wie der Wind aus jedem Lauf reicht), `FIRE_WEATHER_AHEAD_H === HOUR_AXIS_MAX`. |

**Belege:** typecheck grün · `verify:fire-time` **111/111** · `fire-model` 106/106 · `fire-weather-grid` 39/39 · `fire-fwi` 43/43 · Budget 907,9/926,1 KB. **Browser (CDP, Desktop + Mobil, `scratchpad/cdp-wf3b.mjs`):** EU + RH + Wind ⇒ Achse `max=6`, Ticks „jetzt +2 h +3 h +5 h +6 h"; **Wind folgt messbar** — `__fireWindLayer.setWindDataPacked` (gehookt) wird je Stundenschritt mit neuem Frame-Schlüssel gerufen: jetzt `5|6|0.71` (Lauf 5,7 h alt), +3 h `8|9`, +6 h `11|12` — der letzte Schritt des Gitters, genau am Rand, kein Klemmen (`windClamped` blieb aus); Lag-Zeilen: nur „Tageswert · gilt für heute" am EU-Index, der Wind steht nicht mehr als stehend; alter Link `h:12` ⇒ geklemmt auf 6 und so zurückgeschrieben; **Wind allein:** Deck „… genau einen Zeitpunkt — Stundenachse wählbar." + Umschalter → Stunden ⇒ Regler 0…6; Touch mobil 164 × 44 / 46 / 44 px; Konsole sauber, keine Exceptions.

**Randnotiz (Ehrlichkeit):** Im Smoke war der Lauf 5,7 h alt — +6 h lagen bei Schritt 11,7 von 12. Ist der Lauf älter als 6 h (Warm-Cron hinkt, Publikation verzögert), greift `windClamped` und die Zeile sagt „reicht bis +5 h"; die Achse bleibt 6, weil sie am Normalfall und nicht am Ausnahmefall hängt.

**Nächster Schritt:** WF4 — Layer `fireForecast` (`mode: 'hourly'`, `maxHour: HOUR_AXIS_MAX`, Bit 13), Producer (6 h) einhängen, Steckbrief, Punktkurve.

## 16. WF4 — Layer `fireForecast` (Stufe 1): Diagnose + Plan (2026-08-19, vor dem Code)

**Was WF4 ist:** der erste Layer mit `mode: 'hourly'` — er erzwingt die Stundenachse (§15.2 Punkt 1), zeigt die WF2-Fläche (ICON-D2 2,2 km, ISI stündlich aus der hFFMC-Kette, Start Gleichgewichtsfeuchte, 0…+6 h) als `ScalarLayer` und auf Klick die Punktkurve aus dem Punkt-Forecast der Fusion (§13 d: Punkt = Fusion, Fläche = ICON-D2 — die beiden werden am selben Ort **nicht** identisch sein; das steht im Steckbrief). Kein WBI, keine Gefahrenstufe, kein amtliches Produkt — Stufe 1 heißt „ohne Vortagsgedächtnis" (WF5 bringt die Tages-Codes).

### 16.1 Einhängepunkte (gemessen am Code)

| Datei | Befund | Änderung |
|---|---|---|
| `src/fire/fireModel.ts` | `FireLayerId`-Union, vier Herkunftslisten, `FIRE_LAYER_ORDER` = Bitquelle (Bit 12 = `fireFootprints`), `FIRE_Z_BAND`, `FIRE_DECK_GROUPS`; `verifyFireModel` zählt „nichts Fünftes" | `'fireForecast'` + fünfte Liste `FIRE_FORECAST_LAYERS` HINTEN (**Bit 13**), Z-Band **52** (Rasterfläche über dem RH-Treiber 50, unter Boden 55), eigene Dock-Gruppe „Feuerwetter stündlich" (Plan §9), Verifier „nichts Sechstes" + Bit-13-Anker |
| `src/fire/fireTime.ts` | `sharedMaxDay` zählt nur `forecast` ⇒ ein `hourly`-Layer klemmt die Tagesachse nicht; `hourlyForced` ⇒ Einheit erzwungen, Umschalter stumm; Selbsttest Z. 490 sagt „kein aktiver Layer erzwingt heute die Stundenachse" | `fireForecast: { mode: 'hourly', maxDay: 0, maxHour: HOUR_AXIS_MAX }`; Selbsttest umschreiben (`hourlyForced(['fireForecast'])`, `sharedMaxHour(['fireForecast','fireWind']) === 6`, mit EU-Index: Stunden erzwungen, Tages-Layer `daily`) |
| `src/fire/fireState.ts` | Bitmaske aus `FIRE_LAYER_ORDER`, nichts handgeschrieben | nichts; `verify:fire-model` prüft Bit 13 und alte Links byte-gleich |
| `src/fire/FirePage.tsx` | RH-Loader Z. 603–625 (Muster), `frameTargetMs` + `frameAtValidTime` (WF3), `isBuilt`, `infoFor`, Scaffold-Note Z. 1889, `LayerStatus`-Fehlerlink | `isBuilt` + Forecast-Liste; State `fireWx`; Lade-Effekt `fetchIconD2FireWeather({ signal, onProgress })`, Notiz „N Stundenschritte · ISI ohne Vortagsgedächtnis"; Memo `forecast = frameAtValidTime(fireWx.frames, frameTargetMs)` → Prop; Karten-Note „Feuerwetter stündlich (ISI) — Modellwert, kein amtliches Produkt"; Klick-Punkt: `onPointForecast(lng,lat)` → `import('../pointForecast/pointForecast')` (eigener Chunk, Budget!) → `getPointForecast({lat,lng,country,hours:12})` → `ffmcEquilibrium(T0,RH0)` + `hffmcChain` (Wind m/s·3,6, Regen mm/h) + `isi` je Stunde → Readout-Karte „Punkt (Fusion)" mit Stunden 0…+6, Hinweis Punkt ≠ Fläche |
| `src/fire/FireMap.tsx` | `LAYER_GL`, `ATTRIB_CARRIERS` (Lizenzträger für Custom-Layer), `CUSTOM_GL_LAYERS` (kein Platzhalter!), RH-`ScalarLayer` Z. 536–569, Klick-Kette Z. 720 ff. | `fireForecast: ['fire-forecast-attrib','fire-forecast-scalar']`, Träger mit `ICON_D2_FIRE_WEATHER_ATTRIBUTION`, `forecastLayerRef` mit **ISI-Rampe in EFFIS-Klassen** (harte Gradient-Stops bei 3,2/5/7,5/13,4/26,8 ÷ `ISI_VMAX` 30 — `getColorRamp` ist ein Canvas-Gradient, doppelte Offsets ergeben harte Kanten), `setData(image,{vMin:0,vMax:1,uvBounds})` (R = ISI/30 kommt aus dem Producer), DEV `__fireForecastLayer`, Klick vor der Popup-Kette ohne `return` |
| `src/fire/FireLayerCard.tsx` | `FIRE_LAYER_INFO` je Layer, `DangerClasses`-Muster mit `DANGER_VIEWS.isi.classes` | Steckbrief mit den Pflichtsätzen (§9): kein amtliches Produkt · Fläche ICON-D2 2,2 km · Punkt buscosun-Fusion · Stufe 1 ISI ohne Vortagsgedächtnis · Klassengrenzen EFFIS · Schnee/Außengebiet leer; Legende = ISI-Klassen |
| `src/fire/fireIcons.tsx` | `switch(layer)` | Icon `fireForecast` |
| `src/sources/iconD2FireWeather.ts` | fertig (WF2), `FIRE_WEATHER_AHEAD_H 6`, DEV-Haken | unverändert; Aufruf aus `FirePage` |
| Verifier | `verify:fire-model` (Bits), `verify:fire-time` (Sonden) | + Bit 13, `hourlyForced`, Sonden `fire-forecast-scalar` in `CUSTOM_GL_LAYERS` + `ATTRIB_CARRIERS`, `fetchIconD2FireWeather` in FirePage, `import(` für den Punkt-Forecast |

### 16.2 Plan (eine Session) und Gate GWF4

1. rein: `fireModel` (Bit 13, Z 52, Gruppe), `fireTime` (hourly), `FireLayerCard`, `fireIcons` → `verify:fire-model`/`fire-time` grün.
2. Seite + Karte: Loader, Frame-Memo, ScalarLayer + Träger, Karten-Note, Erzwungene Stundenachse sichtbar (Umschalter verschwindet, Ticks 0…+6 h).
3. Punktkurve: Klick → dynamischer Import → Kurve im Readout (Desktop) / Sheet (mobil); Leerzustand benennt Grund (kein Wind ⇒ kein ISI).
4. Gate GWF4: fünf Selbstverifikationsfragen mit Beleg; `typecheck`; Build + Budget (heute 907,9/926,1 KB — Punkt-Forecast nur per `import()`); CDP-Smoke Desktop 1440×900 + Mobil 390×844 (`b` mit Bit 13 = 8192: Frames, `__fireForecastLayer`, Achse erzwungen, Punktkurve, Touch ≥ 44 px, Konsole); Prod-Preview Long Tasks beim Scrubben mit Layer an; alte Links byte-gleich.

**Risiken (benannt):** Budget-Ratsche (FWI-Kern + Grid + Producer wandern in den FirePage-Chunk); Punktkurve braucht Wind aus dem Punkt-Forecast (MOSMIX trägt ihn, fehlt er ⇒ kein ISI, gesagt); Startphase der Kette (Gleichgewicht) ist in den ersten Stunden glatter als die Wirklichkeit — Steckbrief sagt es.

### 16.3 Gate GWF4 — Umsetzung und Belege (2026-08-19)

**Gebaut (additiv; ohne den neuen Layer ist die Ansicht unverändert):**

| Datei | Inhalt |
|---|---|
| `src/fire/fireModel.ts` | `FireLayerId` + `'fireForecast'`; fünfte Herkunftsliste `FIRE_FORECAST_LAYERS` HINTEN ⇒ **Bit 13** (Bits 0…12 unangetastet); `FIRE_Z_BAND.fireForecast: 52` (Rasterfläche über dem RH-Treiber 50, unter dem Boden 55); eigene Dock-Gruppe **„Feuerwetter stündlich"** (amber); Verifier: „nichts Sechstes", fünf Listen überschneidungsfrei, Bit-13-Anker, Z-Ordnung, Gruppe. |
| `src/fire/fireTime.ts` | `fireForecast: { mode: 'hourly', maxDay: 0, maxHour: HOUR_AXIS_MAX }` — der **erste** `hourly`-Layer. Selbsttests: erzwingt die Stundenachse (`timeUnit` ⇒ `hours`), klemmt die **Tagesachse nicht** (EU-Index behält 9 Tage, weil `sharedMaxDay` nur `forecast` zählt), teilt die 6-h-Achse mit dem Wind, EU-Index folgt als Tageswert, `reconcile` behält die Einheit. |
| `src/fire/fwi/isiRamp.ts` *(neu)* | Sechs EFFIS-ISI-Klassen als Rampe: **harte Kanten** durch Doppel-Stops an jeder Grenze (`getColorRamp` ist ein Canvas-Gradient — zwei Stops auf derselben Position ergeben den Sprung), Positionen = `ISI / ISI_VMAX` (dieselbe Normierung, mit der der Producer den R-Kanal füllt), unterste Klasse halbtransparent (kein Vollflächen-Grün ohne Aussage), `isiClassIndex` (`−1` statt Klasse 0 für nicht bestimmbar). 11 Selbstprüfungen. |
| `src/fire/FireMap.tsx` | `LAYER_GL.fireForecast`, Lizenzträger `fire-forecast-attrib` (Custom-Layer tragen keine Source-Attribution), `CUSTOM_GL_LAYERS` + `fire-forecast-scalar` (**kein** Platzhalter in `installLayers` — sonst käme der echte Layer nie in die Karte), `forecastLayerRef` mit `visRange {0,0}` (die Ausblendung sitzt in der Rampe, nicht in einer zweiten Schwelle daneben), `setData(vMin 0, vMax 1)`, DEV `__fireForecastLayer`, `forecast` in beiden `stateRef`-Literalen **und** den `applyState`-Deps, Klick-Haken `onPointForecast` vor der Popup-Kette ohne `return`. |
| `src/fire/FirePage.tsx` | `isBuilt` + Forecast-Liste; State `fireWx` + lazy/progressiver Loader (`onProgress` je fertigem Stundenschritt); Notiz „N Stundenschritte · **ISI ohne Vortagsgedächtnis**"; Memo `forecast = frameAtValidTime(fireWx.frames, frameTargetMs)`; Karten-Note; **Punktkurve** `requestPointCurve` mit dynamischem `import('../pointForecast/pointForecast')`, `ffmcEquilibrium` → `hffmcChain` → `isi`, vier Zustände (`loading`/`ok`/`gap` **mit Grund**/`error`), Generationszähler gegen veraltete Antworten. |
| `src/fire/FireLayerCard.tsx` · `fireIcons.tsx` · `fireDeck.css` | Steckbrief mit den Pflichtsätzen (kein amtliches Produkt · Fläche ICON-D2 2,2 km · Punkt buscosun-Fusion · Stufe 1 ISI ohne Vortagsgedächtnis · Klassengrenzen EFFIS · Schnee/Außengebiet leer) + ISI-Klassenlegende aus `DANGER_VIEWS.isi`; Icon (Flamme auf Stundenkurve); `.fire-pc-*` in Readout-Optik, Leerzustand in derselben Terracotta-Auszeichnung wie `fire-lag-hint`, Schließen-Knopf mobil 44 px. |
| `scripts/verify-fire-model.mjs` · `verify-fire-time.mjs` | `verifyIsiRamp()` eingehängt **plus** zwei unabhängige Gegenproben, die die **Legende gegen die Fläche** lesen (Klassengrenzen aus `DANGER_VIEWS.isi.classes` geparst ↔ `ISI_CLASS_BOUNDS`); neun WF4-Quell-Sonden (Custom-GL-Set, Lizenzträger, `vMin/vMax`, `stateRef`+Deps, Producer-Aufruf, `frameAtValidTime`, **Punkt-Forecast nur dynamisch importiert**, gemeinsamer Rechenkern, Leerzustand mit Grund, Pflichtsatz, 44 px). |

**Belege**

- `npm run typecheck` grün. `verify:fire-model` **123/123** (vorher 110), `verify:fire-time` **127/127** (vorher 116), `verify:fire-fwi` 43/43, `verify:fire-weather-grid` 39/39 unverändert.
- `npm run build && npm run budget`: totalJs **914,1 / 926,1 KB** gzip (+6,2 gegenüber 907,9 — 12 KB Luft), eagerJs 124 KB, largestChunk 278,4 KB. **`pointForecast-DCJYS1tn.js` fällt als eigener Chunk** (86,4 KB roh / **30,4 KB gzip**) — der dynamische Import greift; statisch importiert hätte jeder Waldbrand-Kaltstart diese 30 KB bezahlt, auch ohne Klick. `FirePage` 214,3 KB roh / 73,05 KB gzip (vorher 66) = FWI-Kern + Zellgitter + Producer + Punktkurve.
- **Browser (CDP, Dev-Server, `scratchpad/cdp-wf4.mjs`), Desktop 1440×900 und Mobil 390×844, `b: 8192` (Bit 13 allein):** Layer bereit in 12,1 s bzw. 12,8 s, Statuszeile „8 Stundenschritte · ISI ohne Vortagsgedächtnis". Achse `max=6`, Ticks „jetzt +2 h +3 h +5 h +6 h", **Umschalter „Tage | Stunden" verschwindet** (`unitSwitch: false`) — die Einheit ist erzwungen, wie in §15.2 entworfen. Permalink führt `h` mit (0 → 3 → 6), Stand „+6 h · 19:31". Der gehookte `setData` bekommt beim Scrubben neue Frames (92 → 246 → 399 Aufrufe): das Bild folgt dem Regler messbar. Dock-Zeile „Feuerwetter stündlich (ISI)" steht in der eigenen Gruppe.
- **Punktkurve (Klick auf die Karte):** 50,759° N · 10,520° O · DE · 517 m ⇒ „ISI 6,2 · High · jetzt", sechs Balken in den EFFIS-Klassenfarben (`rgb(233,163,60)` High · `rgba(214,210,78,0.72)` Moderate · `rgba(143,191,107,0.3)` Low — exakt `ISI_CLASS_COLORS`), Tooltips mit den Eingängen („+2 h · ISI 3,4 (Moderate) · 19 °C · 72 % rF · 25 km/h"), Quellen `dwd_obs, mosmix, dwd_uv`. Der Pflichtsatz „Punkt (Fusion) ≠ Fläche (ICON-D2)" steht darunter; die Zeile „Eine Stunde wurde übersprungen — dort fehlten Wind oder Feuchte" griff **live** (Beleg, dass der Leerzustand nicht bloß Theorie ist).
- **Touch mobil:** Play 46 px, Regler 44 px, Schließen-Knopf der Punktkurve 44 px. **Konsole in allen vier Läufen ohne Fehler, Warnungen und Exceptions.**

**Long Tasks am Prod-Build** (`vite preview`, `scratchpad/cdp-wf4-perf.mjs`, mit **zwei Kontrollen**, damit die Zahlen zugeordnet sind statt behauptet):

| Lauf | bereit | Long Tasks Kaltstart | größte | Scrubben (0→6→0) | Leerlauf 20 s | Abspielen 18 s |
|---|---|---|---|---|---|---|
| **`fireForecast`** (`b: 8192`) | 12,6 s | 6 | **700 ms** | **0** | **0** | **0** |
| Kontrolle RH-Treiber (`b: 8`, seit WB2) | 19,8 s | 8 | 418 ms | 0 | 0 | 0 |
| Kontrolle Standard-Deck (`b: 3`) | 1,6 s | 4 | 203 ms | 4 (max 242 ms) | 0 | 0 |

Lesart: Die ~200-ms-Task bei ~0,5 s tritt in **allen drei** Läufen auf (App-/Kartenstart). Die großen Brocken haben ihr Gegenstück im bestehenden RH-Treiber (418 ms) — es ist der **GRIB-Dekode auf dem Hauptthread**, den jeder ICON-D2-Layer teilt; `fireForecast` liegt darüber, weil er **sechs Felder je Schritt** holt statt einem (**V-WF-13**). Die FWI-Kette ist es nicht: eine 40 k-Scheibe kostet 15–30 ms, und genau deshalb sind Scrubben, Leerlauf und Abspielen long-task-frei. Das `setData`-je-`idle`-Muster (im DEV-Lauf 399 Aufrufe in ~60 s, geteilt mit RH-Treiber und Boden) erzeugt in der Leerlaufphase **keine** Task > 50 ms. Die 242 ms beim Tageswechsel der Kontrolle sind ein vorbestehender GWIS-Raster-Effekt, den dieser Layer nicht hat.

**Ein Defekt gefunden und behoben (im Smoke, nicht in der Theorie):** Die Punktkurve beschriftete **zwei** Balken mit „jetzt". Die Stützstellen des Punkt-Forecasts sind volle Stunden; gegen `Date.now()` (13:31) gerundet fielen 13:00 und 14:00 auf denselben Schritt. Bezug ist jetzt der **Beginn der laufenden Stunde** — danach „jetzt, +1 … +5" (der letzte Schritt fehlt, weil dem Punkt-Forecast dort der Wind fehlt, und die Karte sagt das).

**Die fünf Selbstverifikationsfragen**

1. **Funktionserhalt — einzeln geprüft.** Nichts entfernt, nichts umgehängt: `fireForecast` ist Bit 13 hinter allen bestehenden (`verify:fire-model`-Anker für Bits 0…12 unverändert grün), eigene Dock-Gruppe statt Einschub, eigenes Z-Band 52 zwischen zwei bestehenden Werten. `sharedMaxDay` zählt `hourly` nicht ⇒ der Tagesregler der anderen Layer bleibt, was er war (Selbsttest: EU-Index behält mit aktivem Forecast seine 9 Tage). Die Kontrollläufe `b: 3` und `b: 8` verhalten sich wie vorher. Die Zeit- und Modell-Verifier (127/127, 123/123) enthalten die alten Prüfungen unverändert.
2. **Desktop pixelgleich.** Ohne den neuen Layer wird kein bestehendes Markup angefasst: der ScalarLayer-Block hängt hinter `if (s.forecast)`, die Karten-Note hinter `active.has('fireForecast')`, die Punktkurven-Karte hinter `pointCurve != null`. Der Kontrolllauf mit dem Standard-Deck zeigt dieselbe Oberfläche wie vor WF4; neu ist ausschließlich die zusätzliche Dock-Zeile in der neuen Gruppe.
3. **Touch ≥ 44 px.** Mobil gemessen: Play 46, Regler 44, Schließen-Knopf der Punktkurve 44 px (Padding-Trick, ohne die Karte auseinanderzuziehen). Vorbestehend bleibt `.fire-td-now` mit 37 px (V-WF-12, in dieser Phase nicht angefasst).
4. **Konsole sauber.** Vier Läufe (Desktop/Mobil Dev, Prod-Preview, Kontrollen): keine Fehler, keine Warnungen, keine Exceptions aus `fire/`. Die „Failed to fetch"-Meldungen im Standard-Deck-Kontrolllauf stammen aus MapLibre/GWIS-Kacheln und sind Bestand.
5. **Keine Long Tasks > 200 ms im Betrieb.** Scrubben, Leerlauf und Abspielen: null Long Tasks (Tabelle oben). Beim Kaltstart 700 ms — zugeordnet auf den vorbestehenden Hauptthread-Dekode (Kontrolle: 418 ms für einen einzigen ICON-D2-Layer), als **V-WF-13** notiert und nicht in dieser Phase geändert (Decoder-Zone).

**Nächster Schritt:** WF5 — Tages-Codes (DMC/DC/BUI) per GitHub-Actions-Batch mit Commit-back (§13 b, Jans Go liegt vor; **Prod-Dispatch bleibt Jans Gate**). Damit wird aus dem ISI der volle FWI (`buiGrid` ⇒ `mode: 'fwi'`), der Kettenstart wird der Lawson-Tagesgang statt der Gleichgewichtsfeuchte, und „Stufe 1: ohne Vortagsgedächtnis" verschwindet aus dem Steckbrief.
