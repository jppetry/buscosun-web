# Daten & Meteorologie — Strategie-Deep-Dive (2026-07-31)

> Rolle: **Daten & Meteorologie** (Agent-Team, `agents.md` §2) · Planungsphase, **keine Code-Änderung erfolgt**.
> Zuständige Handlungsfelder: `roadmap.md` §B 5 (Zuverlässige Wetterdaten), 6 (Intelligente Prognosen & Warnungen), 7 (Karten-/Radarfunktionen — Datenseite).
> Alle Aussagen sind am Code belegt (`Datei:Zeile`). Wo eine Aussage nicht am Repo verifizierbar war, steht **„zu verifizieren"**.

---

## 1. Auftrag & Abgrenzung

**Untersucht:** `src/sources` (53 Dateien), `src/fusion` (23), `src/ml` (22), `src/pointForecast` (17), `src/radar` (20), `src/nowcast/precipSource.ts`, `src/confidence`, `src/validation`, `scripts/warm-*.mjs`, `scripts/verify-*`, `netlify.toml` / `vite.config.ts` (nur lesend, Transport-Datenseite), `docs/high-end-radar-feature-catalogue.md`, `docs/zielgruppen-dach.md`, `src/fusion/modelCatalog.ts`.

**Nicht untersucht (fremde Rollen):** Rendering-/Shader-Pfad (`src/wind`, `src/scalar` — nur wo Datenkontrakt betroffen), Edge-Function-Mechanik selbst (Infra), UI-Design/Command-Deck (UX), A11y, SEO.

**Grenzen dieser Analyse:** Statische Code-Analyse + Manifest-/Fixture-Zustand auf der Platte. **Kein Live-Netz-Test gegen DWD/GeoSphere/MeteoSchweiz** (Planungsphase, kein `npm run verify:*` ausgeführt). Aussagen über Upstream-Verfügbarkeit sind daher Code-Aussagen, keine Betriebs-Messungen.

---

## 2. Ist-Stand am Code belegt

### 2.1 Quellen-Inventar (Handlungsfeld 5)

`src/sources` enthält 53 Dateien. Nach Import-Graph-Prüfung (`grep` auf `from '.../sources/<modul>'`):

**A · Aktiv verdrahtete Quellen**

| Modul | Provider / Produkt | Variable(n) | Konsumiert in | DE | AT | CH |
|---|---|---|---|---|---|---|
| `iconD2Precip.ts` | DWD ICON-D2 | `tot_prec` + zentrale GRIB-Pipeline (`resolveLatestRun`, `fetchStepField`) für **alle** D2-Layer | `MapView.tsx:41`, `scalar/precipComposite.ts:32`, 4 weitere D2-Module | ✔ | ✔ | ✔ |
| `iconD2TempSource.ts` | DWD ICON-D2 | `t_2m` | MapView-Temp-Layer, `pointForecast` | ✔ | ✔ | ✔ |
| `iconD2GustSource.ts` | DWD ICON-D2 | `vmax_10m` (`iconD2GustSource.ts:92`) | MapView-Böen-Layer | ✔ | ✔ | ✔ |
| `iconD2Clouds.ts` | DWD ICON-D2 | `clcl/clcm/clch/clct` (`iconD2Clouds.ts:102`) | MapView-Wolken-Layer | ✔ | ✔ | ✔ |
| `iconD2Cape.ts` | DWD ICON-D2 | `cape_ml`, `cin_ml` | Gewitter-Layer | ✔ | ✔ | ✔ |
| `iconD2Lpi.ts` | DWD ICON-D2 | `lpi`, `lpi_max` (`iconD2Lpi.ts:119`) | Blitz-Vorhersage-Layer | ✔ | ✔ | ✔ |
| `iconD2Thunder.ts` | DWD ICON-D2 | CAPE×CIN×LPI → Index | Gewitter-Layer | ✔ | ✔ | ✔ |
| `iconD2Snow.ts` | DWD ICON-D2 | `h_snow`, `snow_gsp` | Schnee-Layer (2 Modi) | ✔ | ✔ | ✔ |
| `iconD2Rotation.ts` | DWD ICON-D2 | `uh_max`, `uh_max_low`, `sdi_2` | Rotations-Layer (Experte) | ✔ | ✔ | ✔ |
| `iconD2EpsSource.ts` | DWD ICON-D2-EPS (ikosaedrisch) | `t_2m u_10m v_10m clct tot_prec` | `loadFusedForecast.ts:25` | ✔ | ✔ | ✔ |
| `wind/iconD2WindSource.ts` | DWD ICON-D2 | `u_10m/v_10m` (T1-Pfad `/_dwd_wind`) | WindLayer | ✔ | ✔ | ✔ |
| `radolan.ts` (+`radolanDecode`,`radolanWorker`) | DWD RADOLAN-RV | Regenrate, 25 Frames 5 min | `precipComposite`, `radarFrames.ts` | ✔ | — | — |
| `dwdRadar.ts` | DWD Radar | — | **KEIN Importeur** | — | — | — |
| `dwdSatellite.ts` | EUMETSAT/DWD WMS | Meteosat RGB/IR | MapView-Sat-Layer | ✔ | ✔ | ✔ |
| `dwdLightning.ts` | DWD GeoServer WMS `Accumulated_Flash_Area` | Blitzdichte 60 min | `MapView.tsx:34`, `radar/RadarMap.tsx:15` | ✔ | ? | ? |
| `dwdAlerts.ts` | **BrightSky** `/alerts` (`dwdAlerts.ts:80`) → DWD CAP | Amtliche Warnungen | `PointForecastPanel:17`, `NowcastRadarMap:33`, `EventResult:22`, `warningsCrossCheck:20` | ✔ | ✗ | ✗ |
| `dwdPollen.ts` | DWD OpenData `s31fg.json` | 8 Arten, 11 Regionen | `PointForecastPanel:24` | ✔ | ✗ | ✗ |
| `dwdUvForecast.ts` | DWD OpenData `uvi.json`, 38 Orte | UV-Tagesmax + Sonnenstands-Tagesgang | `pointForecast.ts:49` | ✔ | ✗ | ✗ |
| `openMeteoPollen.ts` | CAMS via Open-Meteo Air-Quality | 6 Pollenarten | `PointForecastPanel:25` | — | ✔ (Opt-in) | ✔ (Opt-in) |
| `brightSkyCurrent/Forecast.ts` | DWD via BrightSky | Obs + MOSMIX | `loadFusedForecast:21,22`, `sampleSources` | ✔ | — | — |
| `geosphereInca.ts` / `geosphereIncaGrid.ts` | GeoSphere INCA | Nowcast 12 Frames à 15 min | `loadFusedForecast:23`, `radarFrames` | — | ✔ | — |
| `geosphereArome.ts` | GeoSphere AROME | 2D-Raster, 60 h | `loadFusedForecast:24` | teilw. | ✔ | ✔ |
| `geosphereTawes.ts` | GeoSphere TAWES | Stationen | `sampleSources:10`, `loadFusedForecast:34` | — | ✔ | — |
| `meteoSwissRadar.ts` | MeteoSchweiz `rzc` (RR) | **Analyse, keine Vorhersage** (`meteoSwissRadar.ts:4-11`) | `precipComposite`, `radarFrames` | — | — | ✔ |
| `meteoSwissSmn.ts` | MeteoSchweiz SMN | Stationen | `sampleSources:11`, `loadFusedForecast:35` | — | — | ✔ |
| `iconChEpsSource.ts` | MeteoSchweiz ICON-CH1/CH2-EPS | 2D-Raster (Kontrolllauf) | `loadFusedForecast:26` | — | — | ✔ |
| `aromeFranceSource.ts` | Météo-France AROME 0,01° | Temp + Wind | `loadFusedForecast:27` | ✔ | teilw. | ✔ |
| `arpegeSource.ts` | Météo-France ARPEGE | Temp + Wind | `loadFusedForecast:33` | grob | grob | grob |
| `ecmwfIfsSource.ts` | ECMWF IFS / AIFS / AIFS-ENS (`ecmwfIfsSource.ts:36-40`) | T/Wind/Wolken/Precip | `loadFusedForecast:30` | grob | grob | grob |
| `iconEuRasterSource.ts` | DWD ICON-EU | 2D-Raster | `loadFusedForecast:28` | ✔ | ✔ | ✔ |
| `iconGlobalSource.ts` | DWD ICON global | 2D-Raster (ikosaedrisch) | `loadFusedForecast:31` | grob | grob | grob |
| `aiconSource.ts` | DWD AICON (KI) | T/Wind/Precip | `loadFusedForecast:32` | grob | grob | grob |
| `gfs2dSource.ts` | NOAA GFS | 2D-Raster | `loadFusedForecast:29` | grob | grob | grob |
| `openMeteoForecast.ts` | Open-Meteo | Grid-Typen + Fetch | 7 Importeure | ✔ | ✔ | ✔ |
| `dachStations.ts`, `dmiStations.ts`, `smhiStations.ts`, `ipmaStations.ts` | DWD/DMI/SMHI/IPMA | Randstationen | `loadFusedForecast:36-38` | Rand | Rand | Rand |
| `gribDecode.ts`, `gribGridDecode.ts`, `gribGridWorker.ts`, `decompress.ts`, `bz2Worker.ts`, `cloudBias.ts`, `frameAtValidTime.ts`, `wmsTime.ts`, `gribManifest.ts` | Infrastruktur | — | intern | — | — | — |

**B · Tote Module (kein Importeur im gesamten `src/`, `scripts/`, `netlify/`)**

| Modul | LOC | Status |
|---|---|---|
| `src/sources/dwdPrecipForecast.ts` | 70 | 0 Referenzen |
| `src/sources/dwdRadar.ts` | 151 | 0 Referenzen |
| `src/sources/gfsSounding.ts` | 149 | nur Kommentar-Erwähnung in `iconEuSounding.ts:9` („bleibt als Fallback/Referenz") |

= **370 LOC toter Quellcode** in `src/sources` (7 % der Dateien).

**C · Prod-defekte Quellen (Proxy-Lücke, V-01) — quantifiziert**

`vite.config.ts:38-62` definiert `/_cscs`, `/_mf`, `/_ecmwf`. `netlify.toml` enthält **nur** `/_dwd_opendata` und `/_gfs`. Betroffene Client-Konstanten:

- `aromeFranceSource.ts:31` → `'/_mf/pnt'`
- `arpegeSource.ts:27` → `'/_mf/pnt'`
- `ecmwfIfsSource.ts:28` → `'/_ecmwf/forecasts'` (bedient **drei** Modelle: `ecmwfIfsSource.ts:36-40` `ifs`, `aifs-single`, `aifs-ens`)
- `iconChEpsSource.ts:99` → `href.replace(/^https:\/\/rgw\.cscs\.ch/, '/_cscs')` (bedient `icon-ch1-eps` + `icon-ch2-eps`)

`MODEL_CATALOG` (`src/fusion/modelCatalog.ts:105-283`) führt **24 Einträge**, davon **19 mit `ingested: true`**. Prod-defekt sind: `arome-fr`, `arpege`, `ifs`, `aifs`, `aifs-ens`, `icon-ch1-eps`, `icon-ch2-eps` = **7 von 19 ingestierten Modellen (37 %)**.

**Der schwerwiegende Teil:** `icon-ch1-eps` (`modelCatalog.ts:136`) und `icon-ch2-eps` (`modelCatalog.ts:159`) sind die **einzigen** Katalogeinträge mit `coverage.CH === 'full'` außer `native`, `fusion` und `arome-at`. Die Schweiz verliert damit in Produktion ihre beiden landeseigenen Hochauflösungs-Modelle. Der Modell-Switcher zeigt sie trotzdem als wählbar an (`canRasterIn`, `modelCatalog.ts:318-324`, prüft nur `ingested && rasterCapable && coverage`), der Fetch scheitert still (`loadFusedForecast.ts:475-478` `.catch(() => null)`).

**D · Modell-Switcher-UI ist verdrahtet** (widerspricht `decisions.md` D-16 „Phase 3 UI offen"): `MapView.tsx:97` importiert `ModelLibraryOverlay`, gerendert `MapView.tsx:3434`; Zustand `MapView.tsx:491`, Land-Umschalter `MapView.tsx:3460`, Quellen-Pill `MapView.tsx:3532`.

### 2.2 Fragilität reverse-engineerter Kontrakte

Die App hängt an mindestens **sechs** hart kodierten Upstream-Kontrakten. Keiner davon wird überwacht.

| # | Kontrakt | Beleg | Bruch-Symptom |
|---|---|---|---|
| K1 | **DWD-Verzeichnislayout + Dateiname** — Listing wird per Regex aus HTML geparst: `icon-d2_germany_regular-lat-lon_single-level_<run>_<SSS>_2d_<param>.grib2.bz2` | `iconD2Precip.ts:83-92` (Regex), `:215` (Bau), `:258` (time-invariant) | `fetchRunSteps` liefert `[]` → Rückwärtssuche über 6 Läufe (`iconD2Precip.ts:139`) → `throw new Error('ICON-D2: kein publizierter Lauf gefunden')` (`:155`). **Alle** D2-Layer fallen gleichzeitig aus. |
| K2 | **Lauf-Rhythmus 3 h + Vollständigkeits-Heuristik `max(steps) >= 24`** | `iconD2Precip.ts:134-137`, `:148` | Ein Lauf mit kürzerem Horizont (DWD-Störung) wird nie akzeptiert → Endlos-Fallback bis zum `throw`. |
| K3 | **RADOLAN-Header-Semantik** — ASCII-Header wird zeichenweise geparst (`PR E-02`, `INT 5`, `GP1200x1100`), `mmPerHourPerUnit = prFactor * (60/intervalMin)` | `radolanDecode.ts:40-62` | Falsche Regenraten **ohne Fehler** — stiller Skalierungsfehler, der visuell plausibel bleibt. Gefährlichster Bruch. |
| K4 | **DE1200-Eckkoordinaten + polar-stereografische Parameter** hart kodiert (`lat_0=90, lat_ts=60, lon_0=10`, 4 Ecken auf 8 Nachkommastellen) | `radolan.ts:47-52` (`DE1200_CORNERS`), `:57-59` (`PS_A/PS_E/PS_LON0/PS_PHIC`) | Gitterwechsel bei DWD → Regen wird geografisch verschoben gerendert, ohne Fehlermeldung. |
| K5 | **GRIB2-Template-Whitelist** GDT 0/101, DRT 0/1/42 | `gribDecode.ts:230`, `:248` | Wirft sauber (`GRIB2: DRT n`) — der gutartigste Fall. |
| K6 | **Fremdkataloge:** MeteoSchweiz-STAC-Item-Pfad (`meteoSwissRadar.ts:25`), ECMWF-Pfadschema `${date}/${hh}z/${m.path}/${date}${hh}0000-${step}h-${m.suffix}` (`ecmwfIfsSource.ts:53-56`), CSCS-Presigned-Host (`iconChEpsSource.ts:99`) | s. Beleg | Stiller `null`-Fallback (`loadFusedForecast.ts:475+` `.catch(() => null)`) → Modell „lädt ewig". |

**Es existiert kein Kontrakt-Monitoring.** `scripts/verify-*.mjs` prüfen die Kontrakte gegen Live-Server, laufen aber **nur manuell** — es gibt keinen CI-/Cron-Aufruf. Die einzigen automatischen Läufe sind `warm-grib`/`warm-wind` (`.github/workflows/warm-grib.yml:26-27`), und die decken nur K1/K2 für **7 Parameter** ab (`warm-grib.mjs:72-79`).

### 2.3 Daten-SLO / Staleness-UX (Handlungsfeld 5, D-04)

**Was es gibt:**
- Manifest-Staleness-Guard: `MAX_MANIFEST_RUN_AGE_H = 24` (`gribManifest.ts:34`), Prüfung `gribManifest.ts:70-71`. Zu altes Manifest → `null` → Fallback auf Directory-Scan.
- „Stand · HH:MM"-Zeile am Zeit-Deck: `MapView.tsx:3272-3276`, gespeist aus `dataValidAtMs` (Gültigkeitszeit des gerenderten Frames, `MapView.tsx:478` `reportValidAt`).
- Lag-bewusstes Slider-Label: `MapView.tsx:2828-2833` — bei `forecastHour === 0` und `lagH > 0.75` steht „Stand ·" statt „jetzt ·".
- Per-Layer-Stempel im Dock: `MapView.tsx:3100`, `:3034`.
- Radar-Quellen-/Alters-Badge: `radar/coverageMask.ts:64` `sourceAgeBadge()`, gerendert `nowcast/NowcastRadarMap.tsx:416`.
- Modell-Lauf im Vertikalschnitt: `atmosphere/NerdPanel.tsx:84`, `atmosphere/VerticalProfile.tsx:230`.

**Die ehrliche Lücke:**
1. **Der Per-Layer-Stempel zeigt in 15 von 17 Fällen `Date.now()`, nicht das Datenalter.** Beleg: `MapView.tsx:1496, 1564, 1602, 1629, 1648, 1667, 1692, 1712, 1748, 2033, 2050, 2133, 2157, 2190, 2387, 2409, 2751` setzen alle `fetchedAt: Date.now()`. Nur zwei Pfade setzen echtes Capture-Datum mit `captured: true` (`MapView.tsx:1272` Satellit, `:1751` Blitze). Die UI schreibt bei `captured` das Präfix „Stand ", sonst nur die Uhrzeit (`MapView.tsx:3100`) — der Nutzer sieht also **die Uhrzeit seines eigenen Abrufs** und liest sie als Datenaktualität. Bei einem 6 h alten ICON-D2-Lauf steht dort trotzdem die aktuelle Minute.
2. **Der Manifest-Zustand wird nie angezeigt.** `runAt`/`updatedAt` sind clientseitig vorhanden (`gribManifest.ts:83-85`), werden aber nirgends an die UI durchgereicht.
3. **Aktueller, messbarer Betriebsschaden:** `public/latest-grib.json` steht auf `"run": "2026072921"`, `"updatedAt": "2026-07-29T22:52:43Z"`; letzter Bot-Commit `0768567` vom 2026-07-29 22:52. Bei Analyse-Datum 2026-07-31 ist der Lauf **> 45 h** alt ⇒ der Staleness-Guard (`gribManifest.ts:70`) verwirft das Manifest **seit ca. 2026-07-30 21:00 UTC**. Der komplette T2-Warm-Cache-Nutzen ist damit derzeit **wirkungslos**; alle Layer laufen über den Directory-Scan (`iconD2Precip.ts:126-155`) = Kaltlade-Verhalten. Das ist der stille Failure-Mode, den `roadmap.md` A3 / V-03 beschreibt — hier erstmals in seiner Datenwirkung quantifiziert.
4. **Nicht gewärmte Parameter:** `warm-grib.mjs:72-79` wärmt `t_2m, vmax_10m, tot_prec, clcl, clcm, clch, clct` (7) + EPS `t_2m,u_10m,v_10m,clct,tot_prec` (`:87`). **Nicht** gewärmt: `cape_ml, cin_ml, lpi, lpi_max, h_snow, snow_gsp, uh_max, uh_max_low, sdi_2` (9 Parameter). Die Layer Gewitter, Blitz-Vorhersage, Schnee und Rotation laufen also **immer** über den Scan und immer kalt — auch bei gesundem Manifest.

### 2.4 AT/CH-Parität (V-13) — exakte Code-Befunde

| Feature | DE | AT | CH | Beleg |
|---|---|---|---|---|
| **Amtliche Warnungen (CAP)** | ✔ BrightSky/DWD | ✗ | ✗ | `dwdAlerts.ts:80` (BrightSky-Endpoint); `warningsCrossCheck.ts:16-17` („Coverage: aktuell **nur DE**"), `:40` `if (country !== 'DE')` → No-op-Checker |
| **UV-Index (Punkt-Forecast)** | ✔ | ✗ | ✗ | `pointForecast.ts:209-211`: `const uv$ = country === 'DE' ? fetchDwdUvPoint(...) : Promise.resolve([])` |
| **UV-Index (Route-Enrichment)** | ✔ | ✔ (Klarhimmel-Modell) | ✔ (Klarhimmel-Modell) | `weatherEnrichment.ts:207` nutzt `uvClearSky(...)` als Fallback; `uvClearSky.ts:1-20` ist ausdrücklich für AT/CH gebaut |
| **Pollen (amtlich)** | ✔ DWD | ✗ | ✗ | `PointForecastPanel.tsx:148` `if (country !== 'DE') { setPollen(null); return; }` |
| **Pollen (CAMS-Ersatz)** | — | ✔ Opt-in | ✔ Opt-in | `PointForecastPanel.tsx:159-166`, ehrlicher Hinweis `:310-317` |
| **Blitze (Messung)** | ✔ | ? | ? | `dwdLightning.ts:10` WMS-Layer `dwd:Accumulated_Flash_Area`; die Domänen-Ausdehnung ist im Code **nicht** begrenzt und **nicht** dokumentiert → **zu verifizieren** gegen die WMS-Capabilities |
| **Radar-Nowcast-Horizont** | 2 h | 3 h | **0,5 h** | `precipSource.ts:48-51` `RADAR_HORIZON_H = { DE: 2, AT: 3, CH: 0.5 }` |
| **Radar-Analyse („jetzt"-Frame)** | ✔ | ✗ | ✔ | `radarFrames.ts:186-190` (AT INCA hat keinen Lead-0-Frame); `geosphereInca.ts:65` (Leads ab +0,25 h) |
| **Punkt-PoP (Flow-Ensemble)** | ✔ | ✗ | ✗ | `radar/pointPoP.ts:10` („Nur DE") |
| **Flow-Nowcast-Layer / Regen-Chance** | ✔ | ✗ | ✗ | `MapView.tsx:2146` (`err: 'zu wenige RADOLAN-Frames (nur DE)'`), `components/LayerInfoPanel.tsx:134, 141` |
| **Punkt-Radar-Nowcast im Blend** | ✔ | ✗ | ✔ | `pointForecast.ts:225` `(country === 'DE' \|\| country === 'CH')` — **AT ist ausgeschlossen, obwohl INCA den längsten Horizont hat** |
| **Konvektions-Index** | ✔ (CAPE + Warnstufe) | degradiert | degradiert | `radar/convectiveIndex.ts:16-17` (`capeBased = false` ohne DWD-Warnung) |

**Der gefährlichste Einzelbefund:** `PointForecastPanel.tsx:134-143` holt Warnungen **für jedes Land** ohne Country-Gate. Für AT/CH liefert BrightSky eine leere Liste; die Render-Bedingung `alerts && alerts.alerts.length > 0` (`PointForecastPanel.tsx:246`) blendet den Block dann einfach aus. **Ein Nutzer in Innsbruck oder Chur sieht bei aktiver Unwetterwarnung exakt dasselbe wie bei ruhigem Wetter: nichts.** Das verletzt D-04 (Ehrlichkeits-Prinzip) im sicherheitskritischsten Feature der App. Der einzige Ort, an dem die Lücke benannt wird, ist die Landing-Page (`SearchPage.tsx:658`) — nicht dort, wo sie wirkt.

**Recherche AT/CH-Quellenlage** (Code-extern, **alles „zu verifizieren"** — Lizenz und URL konnten aus dem Repo nicht belegt werden):

| Kanal | Kandidat | Einschätzung | Aufwand |
|---|---|---|---|
| Warnungen AT + CH | **MeteoAlarm (EUMETNET)** CAP/ATOM-Feeds pro Land | Ein Adapter deckt **beide** Länder + Rest-EU; CAP-Struktur passt fast 1:1 auf `DwdAlert` (`dwdAlerts.ts:19-32`). Lizenz-/Nutzungsbedingungen **zu verifizieren**; CORS **zu verifizieren** (evtl. Netlify-Rewrite nötig). | M |
| Warnungen AT | GeoSphere Data Hub (`data.hub.geosphere.at`), CC BY 4.0 | Ob Warnungen als Datensatz publiziert werden: **zu verifizieren**. | S–M |
| Warnungen CH | MeteoSchweiz OGD (`data.geo.admin.ch`) bzw. Naturgefahrenportal / Alertswiss | Ob ein offener maschinenlesbarer Warn-Feed existiert: **zu verifizieren**. MeteoSchweiz-OGD wird bereits erfolgreich für `rzc` genutzt (`meteoSwissRadar.ts:25`) — dieselbe STAC-Infrastruktur wäre der erste Suchort. | M |
| UV AT/CH | **CAMS via Open-Meteo Air-Quality** (`uv_index`) | **Billigster Hebel im ganzen Paritäts-Thema:** derselbe Endpoint, den `openMeteoPollen.ts:13` schon nutzt, derselbe Opt-in-Mechanismus (`optIn.ts`). Alternativ: `uvClearSky.ts` (existiert, physikalisch, kein Netz) im Punkt-Forecast aktivieren — dann sofort und ohne Fremdquelle. | S |
| Pollen AT | polleninformation.at (MedUni Wien) | Registrierungspflicht/Lizenz **zu verifizieren**. Der CAMS-Weg ist bereits gebaut und ausreichend. | — |
| Pollen CH | MeteoSchweiz automatische Pollenmessung (OGD) | Verfügbarkeit **zu verifizieren**. | M |
| Blitze AT/CH | ALDIS (AT) ist kommerziell; blitzortung.org ist crowdsourced/nicht-kommerziell | Kein offener amtlicher Kanal bekannt. **Realistischste Option: prüfen, wie weit der bereits genutzte DWD-WMS nach Süden reicht** — falls er AT/CH abdeckt, ist die Lücke eine reine Beschriftungsfrage. | S (Prüfung) |

### 2.5 Fusion v2 (D-13/V-15) — Cutover-Reife

Verifiziert (Detailbelege s. Anhang-Zitate im Text):

- **Flags:** `FusionV2Flags` in `src/fusion/fusionEngine.ts:57-82`, fünf optionale Booleans, **kein Default-Objekt** ⇒ effektiv alle `undefined`/aus. `DEFAULT_CONFIG` (`fusionEngine.ts:119-127`) lässt `fusionV2` bewusst weg.
- **Aktivierung nur im DEV-Build:** `loadFusedForecast.ts:288-291` liest `options.fusionV2` oder `window.__fusionV2` **nur unter `import.meta.env.DEV`**. `MapView.tsx:1185-1194` und `:1204+` übergeben **kein** `fusionV2`. ⇒ In Produktion existiert **kein** Weg, v2 einzuschalten.
- **Cache-Key:** `loadFusedForecast.ts:297-299` kodiert die Flags als Buchstaben-Präsenz. Eine spätere **per-Variable**-Flagform würde von diesem Key **nicht** unterschieden ⇒ latente Stale-Cache-Falle.
- **`oi` ist temperatur-only:** `fusionEngine.ts:336` `useOI`, Anwendung nur auf das Temperaturgitter `fusionEngine.ts:419-462`; u/v/Wolken/Precip bleiben IDW/Barnes (`fusionEngine.ts:471+`). Priors hart auf `OI_PRIORS.t2m` (`fusionEngine.ts:364, 532, 533`); Beobachtungsfehler ein einziger Skalar `OI_OBS_VAR_RATIO_PRIOR = 0.1` (`fusionEngine.ts:91`).
- **`bgMinVar` / `bgOffDiag` sind nicht verdrahtet:** außer ihrer Deklaration (`fusionEngine.ts:78, 81`) und dem Cache-Key (`loadFusedForecast.ts:297`) gibt es keinen Leser. `loadJsonArtifact` (`params.ts:109`) hat **null Aufrufer** — `public/params/background-v1.json` wird zur Laufzeit **nie geladen**.
- **Drei unterschiedliche Variablen-Vokabulare:** `OiVariable` (6, `fixture.ts:13`), trainierte/bewertete Menge (4, `background.ts:19` / `loso.ts:93` / `desroziers.ts:31`), Engine-Ausgabe (Temp, u, v, 3× Wolken, Precip, `fusionEngine.ts:304-326`). Ein per-Variable-Cutover muss diese drei zuerst aufeinander abbilden.
- **Trainings-Artefakt existiert, ist aber veraltet:** `public/params/background-v1.json` (einzige Datei in `public/params/`) trägt `trainedWindow 2026-07-02T14:00…15:00, sessions: 2`, `effN = 2` (cloud `effN = 0`), Gewichte ≈ 0,45/0,55 (prior-dominiert). **Das Archiv ist längst reif:** 278 Einträge in `fixtures/`, Spanne 2026-07-02 … 2026-07-31 (694 h), `fusion:status` meldet `effN 272`, `regimes 4`, `VERDICT: READY`. Der Refit wurde nie ausgeführt.
- **Das Phase-3-Gate kann nicht bestehen oder scheitern:** `scripts/phase3-gate.mjs:82-87` druckt ein unbedingtes `⛔ STOP — ARCHIVE TOO SHORT` und hat **kein** `process.exit` ⇒ Exit 0 unabhängig vom Ergebnis. `scripts/verify-loso.mjs:78` verzichtet bei **echten** Fixtures auf jede Assertion (Schwellen greifen nur für synthetische Daten, `:73-74`).
- **Kein OI-Artefakt:** weder `oi-v1.json` noch ein Desroziers-Destillat; `R_PRIOR_BY_NETWORK` (`params.ts:70`) ungenutzt.
- **Nur Lead `'0'` trainiert:** `background.ts:176-177`, weil Captures `hours: 1` sind (`fixtureBuild.ts:21`). Ein per-Lead-Cutover braucht mehrstündige Captures.
- **σ-Layer ohne Renderer:** `fusionEngine.ts:600-609` erzeugt `uncertainty_t2m`, `wind/brightSkySource.ts:64-69` transportiert es — in `MapView` ist kein Renderer daran gebunden.

### 2.6 Nowcast / ML — was lebt, was schläft (Handlungsfeld 6)

`src/ml` = 22 Dateien, 3.760 LOC.

**Erreichbar aus der UI:**

| Modul | Einstieg | Gate |
|---|---|---|
| `opticalFlowNowcast.ts` (Horn-Schunck + Advektion) | `MapView.tsx:75` → `:2155`; `radar/pointPoP.ts:15` → `NowcastRadarMap.tsx:317` | Layer `flownowcast`/`poprob`, bzw. Nowcast-Seite; DE-only |
| `flowEnsemble.ts` (15 Member, PoP) | `MapView.tsx:78` → `:2067`; `pointPoP.ts:16` | dito |
| `climaField.ts` + `climatology.ts` (Fourier-Klimatologie) | `MapView.tsx:68` → `:2030` | Layer `confidence` **oder** `snowline` |
| `confidenceField.ts` | `scalar/confidenceImage.ts:17` → `MapView.tsx:2092+` | Layer `confidence` |
| `mosModel.ts` (`leadWeight`) | `scalar/confidenceImage.ts:18` | Layer `confidence` |
| `mosTrain.ts`, `analogEnsemble.ts`, `isotonic.ts`, `snowModel.ts` | `ml/MosPanel.tsx:16-17` → `confidence/ForecastDeck.tsx:31` → gerendert `:298` (Desktop) / `:512` (Mobil) | **Opt-in:** `<details>` „KI-Selbsttest" muss aufgeklappt werden (`MosPanel.tsx:42`) |
| `radarHindcast.ts` + `metrics.ts` (Brier/BSS/Reliability) | `validation/ValidationPage.tsx:13-14`, Auto-Start `:25-40`; Einstieg `SearchPage.tsx:87`/`:719`, Hash `App.tsx:84` | keins; DE-only |

**Schlafend / tot:**

| Modul | Status |
|---|---|
| `KiNowcastCard.tsx` | **tot** — repo-weit keine Referenz außerhalb der eigenen Datei |
| `radarNowcastNet.ts` | dormant — im Prod-Bundle nicht vorhanden (vom Subagenten gegen `dist/` geprüft) |
| `convNet.ts` | nur `zeros()` überlebt; der Trainings-Stack (Conv2D/ReLU/Adam/Sequential) ist im Browser tot |
| `nowcasterWeights.json` (12,5 KB) | wird nach `dist/` deployt, aber nie gefetcht — einziger `fetch` (`nowcasterInference.ts:28`) hängt an `loadNowcaster`, dessen einziger Aufrufer `KiNowcastCard.tsx:40` tot ist |
| `_buildClimaGrid.ts`, `_trainNowcaster.ts`, `_verify.ts` | DEV-only Node-Skripte (beabsichtigt) |

**Strategische Einordnung — schlafendes Hochwert-Kapital:** Nicht das CNN ist der Verlust (der wurde bewusst zugunsten Optical Flow verworfen, D-17), sondern **`analogEnsemble.ts` + `mosTrain.ts` + `isotonic.ts`** (686 LOC). Sie liefern **kalibrierte** Punkt-Prognosen mit gelernter Ortskorrektur — genau das Produktversprechen von Achse 3 (radikale Ehrlichkeit) — und stecken hinter einem zugeklappten `<details>`-Element mit dem Titel „KI-Selbsttest". Das ist ein Positionierungs-, kein Technikproblem.

### 2.7 Radar-Katalog gegen D-14 (Handlungsfeld 7)

`docs/high-end-radar-feature-catalogue.md` (241 Zeilen) hat **keine Item-IDs und keine Aufwandsangaben** — es ist eine 16-teilige Fähigkeits-Tabelle mit Prioritätsklassen `[Core]/[Diff]/[Expert]/[Trap]` (Legende `:12`). *Jede Doku, die „Katalog-Item-IDs" oder „geschätzte Aufwände" zitiert, erfindet sie.*

**Der Katalog ist weit stärker umgesetzt als angenommen.** `src/radar` ist voll live: `App.tsx:18/123` → `NowcastPage.tsx:18/121` → `NowcastDeck.tsx:21/90/151` → `NowcastRadarMap.tsx:404/493/501` rendert `RadarMap` + `RadarTimeline` + `PointStrip`. `src/nowcast` ist die Schale, `src/radar` die Engine — **keine konkurrierenden Implementierungen.**

Bereits gebaut (Auswahl mit Beleg): mm/h-Bänder + 3 Paletten inkl. 2 CVD-sicher (`radarModel.ts:43,144-154`), harter Mess-/Vorhersage-Bruch in der Timeline (`RadarTimeline.tsx:148-171`), Niederschlagsphase inkl. Schneelinie per Marching Squares (`precipPhase.ts:119,140`), Akkumulation 1/3/6/24 h (`accumulation.ts:37,81`), Coverage-/Range-Falloff-Maske (`coverageMask.ts:27`), Quellen-/Alters-Badge (`coverageMask.ts:64`), **komplettes Zellen-Tracking mit Bewegungsvektor, Projektionskegel und ETA-zu-mir** (`cellTracking.ts:148,30-46,231`; gerendert `RadarMap.tsx:165-166,352`; ETA-Banner `NowcastRadarMap.tsx:410-414`), dBZ-Experten-Umschalter (`radarModel.ts:161-180`).

**Zellen-Tracking und Zugbahnen sind also bereits fertig** — die Frage „noch valide und billig?" ist bei ihnen gegenstandslos.

**Neubewertung gegen D-14 (radar-only, jetzt–2 h):**

| Katalog-Fähigkeit | D-14-Verträglichkeit | Zustand | Neue Priorität |
|---|---|---|---|
| Zellen-Tracking / Zugbahn / ETA | ✔ Kern von D-14 | **fertig** | erledigt |
| Warnpolygone (§3) | ✔ | **Toggle existiert und tut nichts** — `NowcastRadarMap.tsx:85,90` bietet `warnings` an, `RadarMap.tsx:294-299` kennt es nicht | **P0 — sichtbar kaputt** |
| Alert-Engine + Panel (§8) | ✔ (In-App-Alerts, kein Push nötig) | `nowcastAlerts.ts` (Schwellen `:50`, Ruhezeiten `:114`, `evaluateAlert` `:131`) + `NowcastAlertsPanel.tsx` — **beide ohne Importeur** | **P1 — reine Verdrahtung** |
| Deep-Link/Teilen (§6) | ✔ | `radarState.ts:40,52,72` Encoder/Decoder existieren, **keine Aufrufer** (deckt sich mit `roadmap.md` A5 / V-05) | P1 (an V-05 anhängen) |
| Layer-Presets (§3) | ✔ | `radarModel.ts:320,327` definiert, nur im Selbsttest referenziert | P2 |
| Zwei-Punkt-Vergleich (§4) | ✔ | verdrahtet, aber `comparePoint={null}` hart (`NowcastRadarMap.tsx:408`) | P2 |
| Wind-Layer in der Radar-Ansicht | ✔ | `LAYER_META.wind` definiert, aus `LAYER_ORDER` ausgeschlossen (`NowcastRadarMap.tsx:88,90`) | P3 (bewusst?) |
| Hagel | ✔ ehrlich beschriftet | Heuristik `HAIL_MMH = 15` (`precipPhase.ts:104,115-116`), als Heuristik ausgewiesen (`:92`, `NowcastRadarMap.tsx:453`) | erledigt |
| **Echotop** | ✗ **physikalisch unmöglich** aus RADOLAN-RV/INCA/rzc (2D-QPE ohne Vertikaldimension) | 0 Treffer im Repo | **streichen** |
| Bright-Band-Warnung, echte Beam-Blockage-Klimatologie | ✔ wünschenswert | nicht gebaut; Beam-Blockage ausdrücklich abgelehnt (`coverageMask.ts:4-6`) | P3 |
| Modell-Overlays 2–12 h (§11) | ✗ **durch D-14 revidiert** | — | **streichen** |
| Bild-/GIF-Export, Vollbild, Tastatur-Shortcuts (§6) | ✔ | nicht gebaut | P2 (überlappt A11y-Rolle) |

**Zwei ehrliche Radar-Defekte, die niemand bisher notiert hat:**
1. `radarFrames.ts:169` ruft `assemble('AT', 'inca_grid', …, 15, 120)` — der Skill-Horizont für Österreich ist auf **120 min** geklemmt, während `precipSource.ts:50` `AT: 3` (180 min) erlaubt. Die Ehrlichkeits-Notiz (`NowcastRadarMap.tsx:481`) behauptet damit für AT einen kürzeren Horizont, als der Kompositor zeichnet.
2. Für AT existiert kein Analyse-Frame (`radarFrames.ts:186-190`) ⇒ das „gemessen"-Segment der Timeline ist leer, der stolze Mess/Vorhersage-Bruch degeneriert genau in dem Land, das den längsten Nowcast hat.

### 2.8 Genauigkeit als Produkt — was schon messbar ist

| Baustein | Was er misst | Wo | Öffentlich sichtbar? |
|---|---|---|---|
| `validation/ValidationPage.tsx` + `ml/radarHindcast.ts` + `ml/metrics.ts` | **Live-Hindcast** des Flow-Ensembles gegen echte RADOLAN-Analysen: Brier, BSS, Reliability, CSI | `#val`, `SearchPage.tsx:87` (Kachel 10), `:719` | ja, aber unter „Kachel 10" versteckt; Alt-Chrome (nicht Command-Deck) |
| `confidence/hitRate.ts` + `hitRateModel.ts` + `HitRatePanel.tsx` | 30-Tage-Rückblick Vorhersage vs. „Ist" je Modell × Variable × Lead 1/3 d | Vorhersage-Seite | ja |
| `fusion/loso.ts`, `crps.ts`, `desroziers.ts` | LOSO-MAE/CRPS nach Geländeklasse, Spread-Skill, PIT, Beobachtungsfehler-Schätzung | nur `npm run fusion:loso` | **nein** |
| `qa/layerQA.ts` | Layer-Stichproben gegen Open-Meteo `dwd-icon` | Dev-QA-Harness | nein |

**Zwei Ehrlichkeits-Defekte in genau dem Feature, das Ehrlichkeit verkauft:**
1. **`SearchPage.tsx:552` zeigt eine hart kodierte „78% · Trefferquote 3 Tage"** samt passend gezeichnetem Donut (`strokeDasharray="138 138" strokeDashoffset="34"`, `:550`). Diese Zahl stammt aus keiner Messung. Auf der Startseite einer App, deren Kernversprechen „wir zeigen unsere Trefferquote ehrlich" ist, ist das der teuerste denkbare Fehler.
2. **Die Hit-Rate-Ground-Truth sind Modell-Analysen, keine Beobachtungen** (`hitRate.ts:46` „Konsens-Ist (Mittel der Modell-Analysen) … = Ground Truth"). Der Kommentar `hitRate.ts:8-10` benennt das intern korrekt; in der UI wird es dem Nutzer nicht gesagt. Modelle gegen den Modellkonsens zu prüfen ist strukturell milder als gegen Stationen — die Trefferquoten sind systematisch zu gut.

**Zusatzbefund (Lizenz/Prinzip):** D-18 („Open-Meteo nur opt-in") ist **nicht durchgesetzt**. `optIn.ts` wird ausschließlich von `PointForecastPanel.tsx:26` gelesen, und dort nur für CAMS-Pollen (`:161`). Ohne jede Zustimmung rufen Open-Meteo auf: `confidence/hitRate.ts:66`, `confidence/forecastHistory.ts:41`, `confidence/ensemble.ts:34`, `confidence/precipGrid.ts:46`, `confidence/multiModel.ts:70`, `history/historySource.ts:69,101`, `history/meteostatSource.ts:114`, `pointForecast/sampleSources.ts:68`, `sources/openMeteoForecast.ts:126`, `wind/openMeteoSource.ts:134,356,465`, `qa/layerQA.ts:55,134`. Das sind **zwei komplette Feature-Verticals** (Vorhersage/Konfidenz und Historie), die auf einem Free-Tier mit Rate-Limit und nicht-kommerzieller Nutzungsbedingung stehen.

---

## 3. Lücken-Quantifizierung

| Kennzahl | Wert | Beleg |
|---|---|---|
| Quell-Module gesamt | 53 | `src/sources/*.ts` |
| davon ohne jeden Importeur | **3** (370 LOC) | `dwdPrecipForecast.ts`, `dwdRadar.ts`, `gfsSounding.ts` |
| Katalog-Modelle gesamt / ingestiert | 24 / **19** | `modelCatalog.ts:105-283` |
| ingestierte Modelle **prod-defekt** durch Proxy-Lücke | **7 (37 %)** | `/_mf` 2, `/_ecmwf` 3, `/_cscs` 2 |
| CH-Modelle mit `coverage.CH='full'` prod-defekt | **2 von 4** (`icon-ch1-eps`, `icon-ch2-eps`) | `modelCatalog.ts:136,159` |
| Manifest-Alter am Analysetag | **> 45 h** (Guard: 24 h) ⇒ Warm-Cache seit ~30.07. 21:00 UTC wirkungslos | `public/latest-grib.json`, `gribManifest.ts:34` |
| ICON-D2-Parameter gewärmt / genutzt | **7 von 16** (+5 EPS) — 9 nie gewärmt | `warm-grib.mjs:72-79,87` vs. Quell-Grep |
| Layer, die **immer** kalt laden | 4 (Gewitter, Blitz-Vorhersage, Schnee, Rotation) | s. o. |
| Per-Layer-Stempel mit echtem Datenalter | **2 von 17** (`captured: true`) | `MapView.tsx:1272,1751` vs. 15× `Date.now()` |
| Hart kodierte Upstream-Kontrakte ohne Monitoring | **6** (K1–K6) | §2.2 |
| Automatisierte Kontrakt-Prüfungen im CI | **0** | keine CI außer den beiden Warm-Crons |
| Radar-Nowcast-Horizont DE / AT / CH | 2 h / 3 h / **0,5 h** | `precipSource.ts:48-51` |
| AT-Skill-Horizont-Widerspruch | 120 min (`radarFrames.ts:169`) vs. 180 min (`precipSource.ts:50`) | s. o. |
| Sicherheitsrelevante DE-only-Kanäle | **4** (Warnungen, UV-Punkt, Pollen amtlich, Blitz-Messung*) | *AT/CH-Abdeckung des DWD-WMS zu verifizieren |
| AT/CH-Lücken bereits still geschlossen | **2** (CAMS-Pollen produktiv; `uvClearSky.ts` gebaut, aber nur in der Route aktiv) | `PointForecastPanel.tsx:159`, `weatherEnrichment.ts:207` |
| Fusion-Fixtures / Spanne | **278 Dateien**, 2026-07-02 … 2026-07-31 (694 h), ~36 MB | `fixtures/` |
| Trainings-Artefakt-Stand | `sessions: 2`, Fenster 2026-07-02 14:00–15:00, `effN 2` | `public/params/background-v1.json` |
| Fusion-v2-Flags in Produktion aktivierbar | **nein** (DEV-only) | `loadFusedForecast.ts:288-291` |
| Fusion-v2-Flags mit echtem Konsumenten | **1 von 5** (`oi`; `incrementPersist`/`uncertainty` teilweise, `bgMinVar`/`bgOffDiag` gar nicht) | `fusionEngine.ts:336`, Grep |
| OI-abgedeckte Variablen | **1 von 6** (`t2m`) | `fusionEngine.ts:419-462` |
| Variablen mit Stations-Wahrheit für LOSO | **3 von 4** (`cloud` hat `effN 0`) | `archive-status.mjs:57-61` |
| `src/ml` LOC gesamt / tot bzw. dormant | 3.760 / **~700** (`KiNowcastCard` 0 Ref., `radarNowcastNet` 247, `convNet`-Trainingsteil) + 12,5 KB toter Deploy-Asset | s. §2.6 |
| Radar-Fähigkeiten „gebaut, aber nicht verdrahtet" | **6** | §2.7 |
| Erfundene Kennzahl in der UI | **1** („78 %") | `SearchPage.tsx:552` |
| Open-Meteo-Aufrufstellen ohne Opt-in-Prüfung | **15** in 9 Modulen | §2.8 |

---

## 4. Initiativen

### I-1 · Daten-SLO sichtbar machen („Wie alt ist das, was ich sehe?")
**Ziel:** Jeder Layer und jede Zahl trägt ein ehrliches, echtes Datenalter; das Manifest-Alter ist im Betrieb sichtbar.
**Aufwand:** M · **Wirkung:** 5/5 · **Abhängigkeiten:** keine (V-03 profitiert, ist aber nicht Voraussetzung)
**Definition of Success:** ≥ 15 von 17 Layern melden `captured: true` mit echtem `runAt`/`validAt`; ein Staleness-Badge erscheint, sobald das gerenderte Feld > 3 h alt oder das Manifest verworfen ist; ein Verifier prüft headless, dass kein `updateStatus` mehr `Date.now()` als Datenalter ausgibt.

### I-2 · Prod-Proxy-Lücke schließen und Modell-Versprechen härten
**Ziel:** Die 7 prod-defekten Modelle funktionieren live; kein Katalogeintrag ist wählbar, dessen Transport in Prod fehlt.
**Aufwand:** S (Rewrites) + S (Katalog-Gate) · **Wirkung:** 5/5 · **Abhängigkeiten:** V-01, Infra-Rolle, **STOPP&FRAGEN** (Transport)
**Definition of Success:** `verify:arome-fr`, `verify:ifs`, `verify:aifs`, `verify:aifs-ens`, `verify:arpege`, `verify:ch-eps` laufen **gegen die Prod-Domain** grün; `canRasterIn` liefert `false`, solange ein Transportpfad fehlt.

### I-3 · Kontrakt-Monitoring (Canary)
**Ziel:** Ein Bruch bei DWD/GeoSphere/MeteoSchweiz wird binnen ≤ 1 h erkannt statt vom Nutzer.
**Aufwand:** M · **Wirkung:** 5/5 · **Abhängigkeiten:** V-11 (CI), V-03
**Definition of Success:** Ein täglicher Workflow prüft K1–K6 (Listing-Regex trifft ≥ 1 Datei, RADOLAN-Header parst mit erwarteten `PR/INT/GP`, DE1200-Ecken stabil, GDT/DRT unverändert, STAC-/ECMWF-Pfade auflösbar) und schlägt bei Abweichung fehl; jeder Fehlschlag benennt den betroffenen Kontrakt im Klartext.

### I-4 · AT/CH-Warnkanal (größte ehrliche Lücke)
**Ziel:** Amtliche Warnungen für AT und CH; wo keine Quelle existiert, sagt die UI es an der Stelle, wo es zählt.
**Aufwand:** L (Quelle) + S (Ehrlichkeits-Hinweis) · **Wirkung:** 5/5 · **Abhängigkeiten:** V-13, Lizenzklärung (SEO/Recht-Rolle)
**Definition of Success:** Ein Punkt in Innsbruck und einer in Chur liefern bei aktiver Landeswarnung eine Warnkarte; **sofort und unabhängig davon** zeigt die App in AT/CH statt der leeren Fläche den Satz „Für AT/CH liegt uns kein amtlicher Warn-Feed vor" mit Link zur Landesbehörde.

### I-5 · UV-Parität AT/CH (Sofort-Hebel)
**Ziel:** UV-Index in AT/CH statt `null`.
**Aufwand:** S · **Wirkung:** 3/5 · **Abhängigkeiten:** keine (`uvClearSky.ts` existiert)
**Definition of Success:** `getPointForecast` liefert für AT/CH einen UV-Wert; die Quelle wird als „Klarhimmel-Modell, kein Messwert" ausgewiesen; Route und Punkt-Panel zeigen denselben Wert (heute divergieren sie).

### I-6 · Fusion-v2-Cutover-Leiter (per Variable)
**Ziel:** OI produktiv für die erste Variable, mit belastbarem Gate und benanntem Rückfall.
**Aufwand:** L · **Wirkung:** 4/5 · **Abhängigkeiten:** V-09 (Capture-Ausfallsicherheit), V-15
**Definition of Success:** s. Gate-Leiter unten; Erfolgskriterium der Stufe G3 ist eine LOSO-MAE-**und**-CRPS-Verbesserung gegen IDW mit Bootstrap-CI, die die Null nicht schneidet.

**Vorgeschlagene Gate-Leiter (konkret):**

| Stufe | Inhalt | Bestehensschwelle | Rückfall |
|---|---|---|---|
| **G0** | `scripts/phase3-gate.mjs` reparieren: echtes `process.exit(1)` bei Nichterfüllung, Verdikt aus den Zahlen statt hart kodiert (`phase3-gate.mjs:82-87`); `verify-loso.mjs:78` erhält auch für echte Fixtures Assertions | Gate kann nachweislich rot werden | — |
| **G1** | Refit von `background-v1.json` auf dem 694-h-Archiv (`npm run fusion:train`) | `effN ≥ 30` je Variable **außer** `cloud`; `regimes ≥ 4` | Artefakt bleibt Version `-1`, nicht ausgeliefert |
| **G2** | Artefakt-Ladepfad bauen: `loadJsonArtifact` (`params.ts:109`) in `loadFusedForecast.ts` verdrahten, `bgMinVar` an `sourceWeightsFromBackground` (`params.ts:95`) binden | Bei Flag **aus** byte-identisch zu heute (Determinismus-Sonde wie T2b) | Flag aus |
| **G3** | **Variable 1 = `t2m`** (einzige mit OI-Kernel + dichtester Stationswahrheit). LOSO: MAE **und** CRPS besser als IDW **und** als ICON-D2, paariger Block-Bootstrap-CI (`loso.ts:152-167`) schließt 0 aus; getrennt für flach/hügelig/alpin (`loso.ts:50-52`) | alle drei Geländeklassen ≥ 0, alpin nicht schlechter | `oi: false` |
| **G4** | Produktions-Schalter: Flags aus dem DEV-Zweig lösen (`loadFusedForecast.ts:288-291`) → explizite, per-Variable-Flagform; **Cache-Key erweitern** (`loadFusedForecast.ts:297`), sonst stale Caches | A/B-Sichtprüfung Desktop + Mobil, Konsole sauber | ein Klick zurück auf v1 |
| **G5** | **Variable 2 = `windSpeed`** — erst nach Klärung der u/v-vs-Speed-Abbildung (`increment.ts`, `fusionEngine.ts:471-472`) | wie G3 | per-Variable-Flag aus |
| **G6** | `precip` (nicht-gaußsch ⇒ `crps.ts:51` gilt nicht) und `cloud` (`effN 0` ⇒ **keine Stationswahrheit**) sind **gesperrt**, bis eine Wahrheitsquelle existiert | — | dauerhaft v1 |

### I-7 · „Wir messen uns öffentlich" zum Produktmerkmal machen
**Ziel:** Die Ehrlichkeits-Infrastruktur wird sichtbares Alleinstellungsmerkmal statt Kachel 10.
**Aufwand:** M · **Wirkung:** 5/5 · **Abhängigkeiten:** D-27 (Command-Deck), V-10
**Definition of Success:** Die erfundene „78 %" ist ersetzt; die Validierungs-Seite zeigt Brier/BSS **und** benennt die Ground-Truth-Basis; die Hit-Rate weist aus, dass ihr „Ist" ein Modellkonsens ist; LOSO-Ergebnisse aus `fusion:loso` sind als statisches Artefakt öffentlich.

### I-8 · Radar-Verdrahtungspaket
**Ziel:** Die sechs gebauten, aber unverbundenen Radar-Fähigkeiten aktivieren; der tote `warnings`-Toggle verschwindet oder funktioniert.
**Aufwand:** M · **Wirkung:** 4/5 · **Abhängigkeiten:** I-4 (Warnpolygone brauchen AT/CH-Ehrlichkeitstext)
**Definition of Success:** Kein Bedienelement in `NowcastRadarMap` ohne Wirkung; Alert-Panel erreichbar; AT-Skill-Horizont-Widerspruch aufgelöst.

### I-9 · Nicht gewärmte Layer in den Warm-Pfad heben
**Ziel:** Gewitter, Blitz-Vorhersage, Schnee und Rotation laden nicht mehr immer kalt.
**Aufwand:** M · **Wirkung:** 3/5 · **Abhängigkeiten:** **STOPP&FRAGEN** (Cron-/Manifest-Mechanik), Bandbreitenkosten
**Definition of Success:** Manifest führt die zusätzlichen Parameter; Kaltladezeit dieser vier Layer sinkt messbar auf das Niveau von Temp/Böen.

---

## 5. Vorgeschlagene V-Einträge

> Nummerierung `V-DAT-NN` provisorisch — der Koordinator vergibt die fortlaufenden `V-NN`. Bezüge auf bestehende Einträge sind explizit ausgewiesen; **keiner** der folgenden Einträge dupliziert V-01…V-16.

### V-DAT-01 · Warnungen in AT/CH: Schweigen wird als „keine Gefahr" gelesen (Priorität P0 · Aufwand S · Status offen)
**Was:** `PointForecastPanel.tsx:134-143` holt Warnungen für **jedes** Land ohne Länderprüfung; die Datenbasis (BrightSky/DWD, `dwdAlerts.ts:80`) kennt nur Deutschland. Der Render-Block ist an `alerts.alerts.length > 0` gebunden (`:246`) und verschwindet in AT/CH still. `warningsCrossCheck.ts:40` macht es in der Tour-Ansicht korrekt (No-op-Checker) — aber ebenfalls ohne sichtbaren Hinweis.
**Mehrwert:** Wer in Innsbruck oder Chur auf die App schaut, sieht heute bei einer laufenden Unwetterwarnung genau dasselbe wie bei blauem Himmel: nichts. Ein einziger Satz an der richtigen Stelle verhindert, dass Nutzer eine Lücke für Entwarnung halten — und macht das Ehrlichkeitsversprechen dort wahr, wo es zählt.
**Umsetzung:** In `PointForecastPanel` und `NowcastRadarMap` bei `country !== 'DE'` eine ruhige Hinweiskarte rendern („Für AT/CH liegt uns kein amtlicher Warn-Feed vor — bitte GeoSphere Austria bzw. MeteoSchweiz prüfen", mit Link). Muster existiert bereits für Pollen (`PointForecastPanel.tsx:310-317`). Vorstufe zu V-DAT-02; völlig unabhängig davon umsetzbar. Risiko: keins (rein additiv). Abhängigkeit: keine.
**Quelle:** Daten & Meteorologie (Agent-Team), 2026-07-31.

### V-DAT-02 · Amtliche Warnungen für AT und CH einbinden (P1 · L · offen — erweitert V-13)
**Was:** V-13 nennt „GeoSphere-Warnungen (AT) + MeteoSwiss/NatWarn (CH)" als Ziel. Diese Analyse präzisiert: die CAP-Datenstruktur in `dwdAlerts.ts:19-32` (Headline, Event, Severity, Urgency, Level 1–5, effective/onset/expires) ist **bereits die CAP-Struktur** — ein zweiter Provider braucht keinen neuen Datentyp, nur einen Parser und eine Quellen-Kennzeichnung.
**Mehrwert:** Der Anspruch „DACH-Referenz" wird für zwei Drittel der Länder überhaupt erst einlösbar; Warn-Nutzer in AT/CH werden gleich behandelt statt schlechter.
**Umsetzung:** Erste Prüfung: **MeteoAlarm/EUMETNET-CAP-Feeds** — ein Adapter für beide Länder statt zwei (Lizenz + CORS **zu verifizieren**, ggf. Netlify-Rewrite ⇒ STOPP&FRAGEN Transport). Fallback: GeoSphere Data Hub (AT) und MeteoSchweiz-OGD/`data.geo.admin.ch` (CH — dieselbe STAC-Infrastruktur, die `meteoSwissRadar.ts:25` schon nutzt). Neues Modul `src/sources/capAlerts.ts` mit Provider-Achse; `dwdAlerts.ts` bleibt unverändert (Funktionserhalt); `warningsCrossCheck.ts` bekommt `coverage: 'cap-at' | 'cap-ch'`. Rechtliche Prüfung gehört der SEO/Recht-Rolle. Abhängigkeit: V-DAT-01 als Zwischenschritt.
**Quelle:** Daten & Meteorologie (Agent-Team), 2026-07-31.

### V-DAT-03 · UV-Index für AT/CH freischalten (P1 · S · offen — erweitert V-13)
**Was:** `pointForecast.ts:209-211` liefert UV **nur** für DE. Ein physikalisches Klarhimmel-Modell für genau diesen Fall **existiert bereits** (`uvClearSky.ts:1-20`, ausdrücklich „Fallback, wo keine gemessene UV-Quelle vorliegt — AT/CH") und wird heute nur in der Tour-Anreicherung genutzt (`weatherEnrichment.ts:207`). Punkt-Panel und Route zeigen damit **unterschiedliche** UV-Werte für denselben Ort.
**Mehrwert:** Familien, Badegäste und Läufer in Österreich und der Schweiz bekommen endlich einen UV-Wert statt eines leeren Feldes — mit vorhandenem Code, an einem Tag.
**Umsetzung:** In `pointForecast.ts` bei `country !== 'DE'` `uvClearSky(...)` als Sample-Quelle einhängen (Tag `uv_clearsky`), damit `blendVariable` (`pointForecast.ts:355`) es sieht. UI kennzeichnet die Quelle als Modell, nicht Messung (D-04). Optional später CAMS-`uv_index` über den bereits genutzten Open-Meteo-Air-Quality-Endpoint (`openMeteoPollen.ts:13`) unter demselben Opt-in. Risiko: gering; Klarhimmel-Modell ignoriert Ozon/Aerosol (im Modulkopf dokumentiert) ⇒ Beschriftung ist gate-relevant.
**Quelle:** Daten & Meteorologie (Agent-Team), 2026-07-31.

### V-DAT-04 · Datenalter ehrlich anzeigen statt Abrufzeit (P0 · M · offen)
**Was:** 15 von 17 `updateStatus`-Aufrufen in `MapView.tsx` setzen `fetchedAt: Date.now()` (u. a. `:1496, 1564, 1602, 1629, 1648, 1667, 1692, 1712, 2033, 2133, 2157, 2190, 2409, 2751`). Nur Satellit (`:1272`) und Blitze (`:1751`) setzen `captured: true` mit echtem Capture-Zeitpunkt. Die UI (`MapView.tsx:3100`) zeigt in beiden Fällen eine Uhrzeit — der Nutzer liest den Zeitpunkt seines eigenen Abrufs als Datenaktualität. Ein 6 h alter ICON-D2-Lauf sieht damit taufrisch aus.
**Mehrwert:** „Wie alt ist das, was ich sehe?" ist die erste Frage jedes skeptischen Nutzers — und das Fundament der Ehrlichkeits-Marke. Heute beantwortet die App sie falsch, ohne es zu wollen.
**Umsetzung:** `resolveLatestRun` liefert bereits `runAt` (`iconD2Precip.ts:101-155`); dieser Wert wandert in `updateStatus({ ok: { …, fetchedAt: runAt.getTime(), captured: true } })`. Für Fusionsquellen analog aus `loadFusedForecast`. Danach headless-Verifier, der `Date.now()` als Datenalter verbietet. Abhängigkeit: keine; Voraussetzung für V-DAT-05.
**Quelle:** Daten & Meteorologie (Agent-Team), 2026-07-31.

### V-DAT-05 · Staleness-Badge aus dem Warm-Manifest (P1 · S · offen — ergänzt V-03)
**Was:** V-03 fordert Cron-Alarmierung auf der Betriebsseite. **Nutzerseitig fehlt die Anzeige komplett:** `gribManifest.ts:83-85` kennt `run`, `runAt`, `updatedAt`, reicht aber nur `{runStr, runAt, steps}` an den Aufrufer (`:120`) und nichts an die UI. Aktuell messbar: `public/latest-grib.json` steht auf `runAt 2026-07-29T21:00Z` und wird vom 24-h-Guard (`gribManifest.ts:34,70`) seit ca. 2026-07-30 21:00 UTC **verworfen** — der komplette T2-Warm-Cache-Nutzen ist derzeit wirkungslos, ohne jedes Signal.
**Mehrwert:** Nutzer erfahren, wenn die Karte gerade auf Notversorgung läuft, statt sich über plötzliche Ladezeiten zu wundern — und Jan sieht denselben Zustand ohne Log-Zugriff.
**Umsetzung:** `resolveRunFromManifest` gibt `updatedAt` mit zurück; MapView zeigt bei Manifest-`null` oder Alter > 6 h eine dezente Zeile („Schnellzugriff nicht aktuell — Daten kommen direkt von der Quelle"). Rein additiv, keine Cron-Änderung ⇒ **kein** STOPP&FRAGEN. Abhängigkeit: V-DAT-04 (gemeinsame Anzeigefläche).
**Quelle:** Daten & Meteorologie (Agent-Team), 2026-07-31.

### V-DAT-06 · Kontrakt-Monitoring für die sechs reverse-engineerten Upstream-Kontrakte (P1 · M · offen)
**Was:** Sechs Kontrakte sind hart kodiert und unbeobachtet: DWD-Listing-Regex (`iconD2Precip.ts:83-92`), Lauf-Rhythmus + `max(steps)>=24` (`:134-148`), RADOLAN-Header-Semantik (`radolanDecode.ts:40-62`), DE1200-Ecken + PS-Parameter (`radolan.ts:47-59`), GRIB-Template-Whitelist (`gribDecode.ts:230,248`), Fremdkataloge STAC/ECMWF/CSCS (`meteoSwissRadar.ts:25`, `ecmwfIfsSource.ts:53-56`, `iconChEpsSource.ts:99`). Ein Bruch von K3 (Header) verändert die Regenraten **ohne Fehlermeldung** — visuell plausibel, inhaltlich falsch.
**Mehrwert:** Wenn der DWD ein Dateinamensschema ändert, merkt es künftig ein Roboter um 6 Uhr morgens statt ein Nutzer im Gewitter. Für ein Produkt, dessen Alleinstellung „gemessene Daten, ehrlich" ist, ist das die günstigste Versicherung überhaupt.
**Umsetzung:** Täglicher GitHub-Workflow „contract-canary": pro Kontrakt eine Mini-Prüfung (Listing-Regex trifft ≥ 1 Datei · RADOLAN-Header enthält erwartete `PR`/`INT`/`GP`-Felder · `DE1200_CORNERS` gegen ODIM-`/where` der aktuellen RY-Datei · GDT/DRT der jüngsten Datei in der Whitelist · STAC-/ECMWF-/CSCS-Pfad auflösbar). Die dafür nötige Logik existiert verstreut in `scripts/verify-*.mjs`. Fehlschlag ⇒ GitHub-Failure-Mail. **Kein** Eingriff in Warm-Cron oder Edge-Functions ⇒ kein STOPP&FRAGEN. Abhängigkeit: V-11 (CI-Fundament).
**Quelle:** Daten & Meteorologie (Agent-Team), 2026-07-31.

### V-DAT-07 · Erfundene „78 % Trefferquote" von der Startseite entfernen (P0 · S · offen)
**Was:** `SearchPage.tsx:552` zeigt „78%" mit der Unterzeile „Trefferquote 3 Tage" und einem passend gezeichneten Donut (`:550`, `strokeDashoffset="34"`). Die Zahl stammt aus keiner Messung; die echte Hit-Rate-Pipeline (`confidence/hitRate.ts`) rechnet erst nach dem Öffnen der Vorhersage-Seite und liefert Werte je Modell/Variable/Lead.
**Mehrwert:** Eine Wetter-App, die mit „radikaler Ehrlichkeit" wirbt, darf auf ihrer Startseite keine erfundene Kennzahl zeigen. Das ist kein Schönheitsfehler, sondern der einzige Punkt, an dem ein kritischer Nutzer das Kernversprechen als gebrochen erleben kann.
**Umsetzung:** Entweder echten Wert nachladen (teuer für die Landing-Page) oder Kachel auf eine qualitative Aussage umstellen („Hit-Rate-Rückblick: 30 Tage, je Modell") ohne Zahl. Reine Textänderung in einer Datei. Achtung Funktionserhalt: die Kachel bleibt, nur die Zahl geht.
**Quelle:** Daten & Meteorologie (Agent-Team), 2026-07-31.

### V-DAT-08 · Ground-Truth der Hit-Rate ehrlich benennen (P1 · S · offen)
**Was:** `hitRate.ts:46` definiert das „Ist" als „Konsens-Ist (Mittel der Modell-Analysen)". Der Modulkopf sagt es korrekt (`:8-10`), die UI (`HitRatePanel.tsx`) nicht. Modelle gegen einen Modellkonsens zu prüfen fällt systematisch milder aus als gegen Stationsmessungen.
**Mehrwert:** Der Rückblick behält seinen Wert, verliert aber den falschen Anschein einer Messung. Genau diese Art Fußnote unterscheidet buscosun von Anbietern, die ihre Trefferquote schönrechnen.
**Umsetzung:** Ein Satz im `HitRatePanel`-Kopf; mittelfristig Vergleich gegen die bereits vorhandenen Stationsquellen (`brightSkyCurrent`, `geosphereTawes`, `meteoSwissSmn`) als zweite, härtere Referenz anbieten.
**Quelle:** Daten & Meteorologie (Agent-Team), 2026-07-31.

### V-DAT-09 · D-18 durchsetzen: Open-Meteo-Nutzung inventarisieren und gaten (P1 · M · offen)
**Was:** D-18 („Open-Meteo nur opt-in") ist nicht implementiert. `optIn.ts` wird ausschließlich von `PointForecastPanel.tsx:26` gelesen, und dort nur für CAMS-Pollen (`:161`). Ohne Zustimmung rufen Open-Meteo auf: `confidence/hitRate.ts:66`, `forecastHistory.ts:41`, `ensemble.ts:34`, `precipGrid.ts:46`, `multiModel.ts:70`, `history/historySource.ts:69,101`, `history/meteostatSource.ts:114`, `pointForecast/sampleSources.ts:68`, `sources/openMeteoForecast.ts:126`, `wind/openMeteoSource.ts:134,356,465`, `qa/layerQA.ts:55,134` — 15 Stellen in 9 Modulen, darunter **zwei komplette Feature-Verticals** (Vorhersage/Konfidenz, Historie).
**Mehrwert:** Zwei Kernfeatures hängen heute unbemerkt an einem Free-Tier mit Rate-Limit und nicht-kommerzieller Nutzungsbedingung. Entweder wird das bewusst entschieden — oder es fällt irgendwann unter Last aus, ohne dass jemand weiß warum.
**Umsetzung:** Erst Inventar + Entscheidungsvorlage für Jan (D-18 präzisieren: Welche Nutzung ist zulässig?), dann entweder (a) zentrale `openMeteoFetch()`-Hülle mit Consent-/Rate-Limit-Guard, oder (b) D-18 formal auf „Punkt-Forecast-Zusatzquellen" einschränken und den Rest dokumentiert freistellen. Berührt keine Rechenlogik. Abhängigkeit: Rechts-/Lizenz-Checkliste (SEO/Recht-Rolle).
**Quelle:** Daten & Meteorologie (Agent-Team), 2026-07-31.

### V-DAT-10 · Fusion-v2-Gate reparierbar machen und Artefakt refitten (P1 · M · offen — konkretisiert V-15)
**Was:** V-15 nennt „Trainings-Artefakt + LOSO-Gate" als Voraussetzung. Beide sind heute nicht funktionsfähig: `scripts/phase3-gate.mjs:82-87` druckt ein **unbedingtes** `⛔ STOP — ARCHIVE TOO SHORT` und hat kein `process.exit` (Exit immer 0); `scripts/verify-loso.mjs:78` verzichtet bei echten Fixtures auf jede Assertion. Gleichzeitig ist das Archiv reif (278 Fixtures, 694 h, `fusion:status` meldet `READY`), während das ausgelieferte `public/params/background-v1.json` noch auf `sessions: 2` / `effN 2` vom 2026-07-02 steht.
**Mehrwert:** Das Fundament für messbar bessere Flächenprognosen liegt seit vier Wochen fertig herum und wird von einem Gate blockiert, das gar nicht prüfen kann. Ein reparierter Gate-Lauf plus Refit macht den Fortschritt zum ersten Mal überhaupt bewertbar.
**Umsetzung:** (1) `phase3-gate.mjs` Verdikt aus den berechneten Zahlen ableiten + `process.exit(1)`; (2) `verify-loso.mjs` Assertions auch für echte Fixtures; (3) `npm run fusion:train` mit dem aktuellen Archiv, Artefakt-Version hochziehen; (4) Ergebnis in `tests.md` protokollieren. **Kein** Eingriff in Engine-Verhalten (Flags bleiben aus) ⇒ kein STOPP&FRAGEN. Abhängigkeit: V-09 (Capture-Ausfallsicherheit) für die Zukunft, nicht für diesen Schritt.
**Quelle:** Daten & Meteorologie (Agent-Team), 2026-07-31.

### V-DAT-11 · Per-Variable-Flagform + Cache-Key vor dem Cutover (P2 · M · offen — Voraussetzung von V-15)
**Was:** Der Cutover ist laut D-13 „per Variable" geplant, aber `FusionV2Flags` (`fusionEngine.ts:57-82`) sind fünf **globale** Booleans, `useOI` ist ein einzelner Zweig (`fusionEngine.ts:336`), OI wirkt nur auf Temperatur (`:419-462`), und der Cache-Key kodiert nur Flag-**Präsenz** (`loadFusedForecast.ts:297-299`). Zusätzlich existieren drei unterschiedliche Variablenlisten (`fixture.ts:13` 6 Stück, `background.ts:19` 4, `fusionEngine.ts:304-326` 7) — ohne Abbildung dazwischen. Und: die Flags sind **nur im DEV-Build** aktivierbar (`loadFusedForecast.ts:288-291`) — es gibt in Produktion keinen Schalter.
**Mehrwert:** Ohne diese Vorarbeit kann der geplante schrittweise Rollout gar nicht stattfinden — und ein naiver Versuch würde alte Ergebnisse aus dem Cache mit neuen Einstellungen mischen, was als „zufällige" Fehlprognose auffiele.
**Umsetzung:** (1) Variablen-Abbildung als eine benannte Tabelle; (2) `FusionV2Flags` auf `Partial<Record<OiVariable, {...}>>` erweitern (alte Form als Alias erhalten — Funktionserhalt); (3) Cache-Key erweitern; (4) Produktions-Schalter definieren (URL-Parameter oder localStorage, Entscheidung Jan). **STOPP&FRAGEN: Fusion-Engine.**
**Quelle:** Daten & Meteorologie (Agent-Team), 2026-07-31.

### V-DAT-12 · Toter `warnings`-Toggle in der Radar-Ansicht (P0 · S · offen)
**Was:** `NowcastRadarMap.tsx:85,90` bietet einen Layer-Schalter `warnings` an; `RadarMap.tsx:294-299` kennt ihn nicht — es gibt keine einzige `warnings`-Referenz in `RadarMap.tsx`. DWD-Warnungen werden zwar geholt (`NowcastRadarMap.tsx:33,245`), aber nur zu einem Skalar `warnLevel` (`:131`) für den Konvektions-Index reduziert (`:298`). Es werden **keine** Warnpolygone gezeichnet.
**Mehrwert:** Ein Schalter, der nichts tut, beschädigt das Vertrauen mehr als ein fehlendes Feature — besonders bei Warnungen. Entweder er zeichnet Polygone oder er verschwindet.
**Umsetzung:** Kurzfristig aus `LAYER_ORDER` nehmen (Funktionserhalt gewahrt: es geht keine Funktion verloren, weil keine existiert — Jan bestätigen lassen). Mittelfristig echte Warnpolygone; erfordert Polygon-Geometrien, die BrightSky nicht liefert ⇒ hängt an V-DAT-02 (CAP mit `area`/`polygon`).
**Quelle:** Daten & Meteorologie (Agent-Team), 2026-07-31.

### V-DAT-13 · Gebaute, aber unverbundene Radar-Fähigkeiten aktivieren (P1 · M · offen)
**Was:** Fünf fertige Fähigkeiten ohne UI-Anschluss: Alert-Engine `nowcastAlerts.ts` (Schwellen `:50`, Ruhezeiten `:114`, `evaluateAlert` `:131`) + `NowcastAlertsPanel.tsx` — **beide ohne Importeur**; Layer-Presets `radarModel.ts:320,327` (nur im Selbsttest referenziert); Deep-Link-Encoder `radarState.ts:40,52,72` (keine Aufrufer); Zwei-Punkt-Vergleich (`RadarMap.tsx:65,328-331`, aber `comparePoint={null}` hart in `NowcastRadarMap.tsx:408`); Wind-Layer (`LAYER_META.wind` definiert, aus `LAYER_ORDER` ausgeschlossen, `NowcastRadarMap.tsx:88,90`).
**Mehrwert:** Fünf fertige Features, für die niemand mehr Meteorologie programmieren muss — nur Verkabelung. Das beste Verhältnis von Aufwand zu spürbarem Gewinn im gesamten Radar-Bereich. Der Alert-Teil funktioniert sogar ohne Backend, solange die App offen ist (unabhängig von V-16/O-01).
**Umsetzung:** Je Fähigkeit ein kleiner, gate-gesicherter Schritt; Deep-Link-Teil mit V-05 bündeln (dort steckt bereits `#r=`). Command-Deck-Standard (D-27) gilt für jede neue Fläche.
**Quelle:** Daten & Meteorologie (Agent-Team), 2026-07-31.

### V-DAT-14 · AT-Radar: Skill-Horizont-Widerspruch und fehlender „Jetzt"-Frame (P1 · S · offen)
**Was:** `radarFrames.ts:169` klemmt den Skill-Horizont für Österreich auf **120 min**, während `precipSource.ts:50` `AT: 3` (180 min) erlaubt — die Ehrlichkeits-Notiz (`NowcastRadarMap.tsx:481`) behauptet damit für AT einen kürzeren Horizont, als der Kompositor zeichnet. Zusätzlich liefert GeoSphere INCA keinen Lead-0-Frame (`geosphereInca.ts:65`, Leads ab +0,25 h), worauf `radarFrames.ts:186-190` auf Frame 0 zurückfällt: das „gemessen"-Segment der Timeline ist für Österreich leer, der harte Mess-/Vorhersage-Bruch degeneriert.
**Mehrwert:** Österreichische Nutzer bekommen die volle Stunde Vorhersage, die ihr Landesradar hergibt — und die Timeline sagt für alle drei Länder die Wahrheit über das, was gemessen und was gerechnet ist.
**Umsetzung:** Eine der beiden Zahlen ist Quelle der Wahrheit (Vorschlag: `precipSource.RADAR_HORIZON_H`); `radarFrames.ts` daraus ableiten. Für den fehlenden Analyse-Frame: entweder INCA-Analyse separat holen (**zu verifizieren**, ob GeoSphere sie publiziert) oder die Timeline für AT ehrlich als „ab +15 min" beschriften. Betrifft `radarFrames.ts` und Beschriftung, nicht den Kompositor.
**Quelle:** Daten & Meteorologie (Agent-Team), 2026-07-31.

### V-DAT-15 · Nicht gewärmte ICON-D2-Parameter (Gewitter/Blitz/Schnee/Rotation) (P2 · M · offen)
**Was:** `warm-grib.mjs:72-79` wärmt 7 Parameter (`t_2m, vmax_10m, tot_prec, clcl/clcm/clch/clct`) + 5 EPS-Variablen (`:87`). Nicht gewärmt: `cape_ml, cin_ml` (`iconD2Cape.ts`), `lpi, lpi_max` (`iconD2Lpi.ts:119`), `h_snow, snow_gsp` (`iconD2Snow.ts`), `uh_max, uh_max_low, sdi_2` (`iconD2Rotation.ts`). Alle Layer laufen über `resolveLatestRun` (`iconD2Precip.ts:101`), das für Parameter ohne Manifest-Eintrag auf den Directory-Scan fällt (`:126-155`) — die vier Feature-Layer laden damit **immer** kalt.
**Mehrwert:** Genau die vier Layer, die Nutzer in Unwetterlagen anschalten (Gewitter, Blitzvorhersage, Rotation) und im Winter (Schnee), sind die langsamsten der App — ausgerechnet dann, wenn Geduld am geringsten ist.
**Umsetzung:** `PARAMS` in `warm-grib.mjs` erweitern, Manifest-Schema deckt es bereits ab (`gribManifest.ts:73-79` liest beliebige Param-Keys). Bandbreiten-/Laufzeitkosten vorher abschätzen (9 zusätzliche Parameter × Steps). **STOPP&FRAGEN: Warm-Cron-/Manifest-Mechanik ist Jans Gate.** Abhängigkeit: V-03 (sonst wärmt man in einen Cron, der stillsteht).
**Quelle:** Daten & Meteorologie (Agent-Team), 2026-07-31.

### V-DAT-16 · Modellkatalog: Transport-Verfügbarkeit als Gate (P1 · S · offen — härtet V-01 ab)
**Was:** `canRasterIn` (`modelCatalog.ts:318-324`) prüft `ingested && rasterCapable && coverage` — **nicht**, ob der Transportpfad in Produktion existiert. Deshalb sind `arome-fr`, `arpege`, `ifs`, `aifs`, `aifs-ens`, `icon-ch1-eps`, `icon-ch2-eps` (7 von 19 ingestierten Modellen) im Switcher wählbar, obwohl ihr Fetch in Prod die SPA-Shell erhält; `loadFusedForecast.ts:475-488` schluckt den Fehler (`.catch(() => null)`) und das Modell „lädt ewig".
**Mehrwert:** Selbst nachdem V-01 die Proxys nachgerüstet hat, verhindert dieses Gate, dass künftig wieder ein Modell wählbar wird, dessen Transport fehlt. Und bis dahin sieht der Nutzer eine ehrliche Kennzeichnung statt eines Modells, das nie fertig lädt.
**Umsetzung:** `ModelEntry` um `transport: 'same-origin' | 'proxy:<prefix>'` erweitern; `canRasterIn` prüft die Prefix-Liste gegen eine aus `netlify.toml`/Edge-Functions abgeleitete Konstante; Verifier hält beide Listen synchron (Muster: `verify-modelsource.mjs`). Alternativ übergangsweise ein `pipelineNote` „in Produktion derzeit nicht verfügbar" (das Feld existiert bereits, `modelCatalog.ts:88`).
**Quelle:** Daten & Meteorologie (Agent-Team), 2026-07-31.

### V-DAT-17 · Tote Quell- und ML-Module (P2 · S · offen — ergänzt V-08)
**Was:** V-08 listet CSS-/Asset-Ballast. Auf der Datenseite kommen dazu: `src/sources/dwdPrecipForecast.ts` (70 LOC), `src/sources/dwdRadar.ts` (151), `src/sources/gfsSounding.ts` (149) — **null Importeure**; `src/ml/KiNowcastCard.tsx` (repo-weit keine Referenz), `src/ml/radarNowcastNet.ts` (247 LOC, im Prod-Bundle nicht vorhanden), der Trainings-Teil von `convNet.ts` (nur `zeros()` überlebt), sowie `nowcasterWeights.json` — 12,5 KB, die nach `dist/` deployt werden, deren einziger `fetch` (`nowcasterInference.ts:28`) aber an der toten `loadNowcaster`/`KiNowcastCard.tsx:40`-Kette hängt.
**Mehrwert:** Jeder künftige Agent (und Jan) verliert heute Zeit damit, zu prüfen, ob `dwdRadar.ts` oder das KI-Nowcast-Netz noch relevant sind. Weniger Code, den man erst als tot beweisen muss.
**Umsetzung:** Löschliste mit Import-Graph-Beleg (oben), **STOPP&FRAGEN: Löschungen brauchen Jans Freigabe**. `gfsSounding.ts` ist ein Grenzfall — `iconEuSounding.ts:9` bezeichnet es ausdrücklich als „Fallback/Referenz"; hier Jan fragen statt entscheiden.
**Quelle:** Daten & Meteorologie (Agent-Team), 2026-07-31.

### V-DAT-18 · Punkt-Radar-Nowcast für Österreich (P2 · S · offen)
**Was:** `pointForecast.ts:225` aktiviert den Radar-Nowcast-Sampler nur für `DE` und `CH` — Österreich ist ausgeschlossen, obwohl INCA mit 3 h den **längsten** Nowcast-Horizont der drei Länder hat (`precipSource.ts:50`) und die CH-Quelle mit 0,5 h den kürzesten (`:51`). Die Asymmetrie ist im Code nicht begründet.
**Mehrwert:** Österreichische Nutzer bekommen im Punkt-Forecast dieselbe „gleich regnet's"-Präzision wie deutsche — mit Daten, die die App bereits lädt.
**Umsetzung:** Erst prüfen, ob `createRadarNowcastSampler` (`pointForecast/radarNowcast.ts`) AT-Frames verarbeiten kann (INCA-Grid liegt via `geosphereIncaGrid.ts` vor); ggf. Adapter. Falls es einen technischen Grund für den Ausschluss gibt, muss er im Code dokumentiert werden.
**Quelle:** Daten & Meteorologie (Agent-Team), 2026-07-31.

---

## 6. Bewertung gegen die vier Differenzierungs-Achsen (`roadmap.md` §C)

| Initiative / V-Eintrag | (1) Entscheidungsprodukt | (2) Alpin-/Vertikal-Tiefe | (3) Radikale Ehrlichkeit | (4) Trackerfrei/schnell | Gesamturteil |
|---|---|---|---|---|---|
| V-DAT-01 Warn-Schweigen AT/CH | mittel | — | **sehr hoch** | — | **Sofort machen.** Kleinster Aufwand, größter Ehrlichkeitsgewinn. |
| V-DAT-07 „78 %" entfernen | — | — | **sehr hoch** | — | **Sofort machen.** Einzelner Textblock, größter Reputationsschutz. |
| V-DAT-04 Datenalter ehrlich | mittel | — | **sehr hoch** | mittel | Fundament der Achse 3. |
| V-DAT-12 toter Warn-Toggle | — | — | **hoch** | — | Sofort; kaputte Bedienelemente kosten mehr Vertrauen als fehlende. |
| V-DAT-02 AT/CH-Warnungen | **hoch** | mittel | **hoch** | — | Schließt die im Zielgruppen-Papier benannte größte Lücke. |
| V-DAT-03 UV AT/CH | hoch | mittel | mittel | — | Bestes Aufwand/Wirkung-Verhältnis der Paritäts-Familie. |
| V-DAT-06 Kontrakt-Monitoring | mittel | — | **hoch** | hoch | Schützt die Substanz aller vier Achsen. |
| I-6 / V-DAT-10/11 Fusion-Cutover | **hoch** | **hoch** (Höhenkorrektur/alpin) | hoch (LOSO öffentlich) | mittel | Strategisch, aber erst nach G0–G2. |
| V-DAT-13 Radar-Verkabelung | **sehr hoch** (ETA, Alerts) | mittel | mittel | hoch | Bestes Aufwand/Wirkung im Radar. |
| I-7 „Wir messen uns öffentlich" | mittel | — | **sehr hoch** | — | Das eigentliche Marken-Asset; Rohstoff liegt bereits vor. |
| V-DAT-09 Open-Meteo-Gating | — | — | mittel | **hoch** (Lizenz/Verfügbarkeit) | Risiko-, kein Feature-Thema. |
| V-DAT-15 fehlende Warm-Params | mittel | mittel | — | **hoch** | Nach V-03. |
| V-DAT-16 Katalog-Transport-Gate | hoch | mittel (CH-Modelle) | **hoch** | — | Macht V-01 dauerhaft. |
| V-DAT-14 AT-Radar-Horizont | hoch | mittel | **hoch** | — | Klein, ehrlichkeitsrelevant. |
| V-DAT-17 toter Code | — | — | — | mittel | Hygiene. |
| V-DAT-18 AT-Punkt-Nowcast | hoch | mittel | mittel | — | Kleine Asymmetrie mit realem Nutzen. |

**Keine der vorgeschlagenen Initiativen verstößt gegen Achse 4** (kein Tracking, kein Account, kein Backend-Zwang). V-DAT-02 ist die einzige mit potenziellem Transport-Bedarf (CORS-Rewrite) — das bleibt statisch/Edge und berührt D-01 nicht.

---

## 7. STOPP & FRAGEN an Jan

1. **Warm-Cron erweitern (V-DAT-15)** — 9 zusätzliche ICON-D2-Parameter im Warm-Manifest. Cron-/Manifest-Mechanik ist ausdrücklich Jans Gate. Frage: Ist der zusätzliche Bandbreiten-/Laufzeitverbrauch akzeptabel, und soll die Erweiterung überhaupt vor V-03 (Cron-Health) passieren?
2. **Fusion-Engine: per-Variable-Flagform + Cache-Key (V-DAT-11)** — berührt `fusionEngine.ts` und `loadFusedForecast.ts`. Reine Struktur-Erweiterung ohne Verhaltensänderung bei Flags aus, aber Fusions-Engine ist STOPP-Zone. Freigabe nötig, bevor irgendein Cutover-Schritt geplant wird.
3. **Fusion-v2-Cutover: erste Variable und Schwelle** — Vorschlag: `t2m` zuerst (einzige mit OI-Kernel und dichtester Stationswahrheit), Schwelle „LOSO-MAE **und** CRPS besser als IDW und ICON-D2, Bootstrap-CI schneidet 0 nicht, in allen drei Geländeklassen". `cloud` ist mangels Stationswahrheit (`effN 0`) **dauerhaft gesperrt** — bestätigen?
4. **Produktions-Schalter für Fusion v2** — heute existiert **keiner** (DEV-only, `loadFusedForecast.ts:288-291`). URL-Parameter, localStorage oder Build-Flag? Berührt D-11 (Flag-Gating) und die Cache-Semantik.
5. **Löschungen (V-DAT-17)** — `dwdPrecipForecast.ts`, `dwdRadar.ts`, `KiNowcastCard.tsx`, `radarNowcastNet.ts`, `nowcasterWeights.json` (src + public). Sonderfall `gfsSounding.ts`: `iconEuSounding.ts:9` bezeichnet es als absichtlichen Fallback — behalten oder streichen?
6. **`warnings`-Toggle in der Radar-Ansicht (V-DAT-12)** — der Schalter existiert, tut aber nichts. Vorübergehendes Ausblenden ist formal ein Funktions-Entzug (Oberste Direktive). Freigabe für „ausblenden bis echte Polygone da sind"?
7. **Wind-Layer in der Radar-Ansicht** — `LAYER_META.wind` existiert, ist aber aus `LAYER_ORDER` ausgeschlossen (`NowcastRadarMap.tsx:88,90`). War das Absicht (D-14-Fokussierung) oder ein Versehen?
8. **D-18 Reichweite (V-DAT-09)** — „Open-Meteo nur opt-in" wird an 15 Stellen umgangen, darunter zwei komplette Feature-Verticals. Soll D-18 durchgesetzt (Consent-Gate für Vorhersage + Historie) oder präzisiert werden (Beschränkung auf Punkt-Forecast-Zusatzquellen)? Das ist eine Lizenz-/Risiko-Entscheidung, keine technische.
9. **AT/CH-Warnquelle: MeteoAlarm vs. Landesbehörden (V-DAT-02)** — ein Adapter für beide Länder (MeteoAlarm/EUMETNET) versus zwei Adapter näher an der Amtsquelle. Lizenzlage beider Wege ist **nicht** aus dem Repo belegbar und muss vor der Implementierung geklärt werden. Wer klärt: SEO/Recht-Rolle oder Jan direkt?
10. **CH-Nowcast-Horizont 0,5 h** — `meteoSwissRadar.ts:4-11` stellt fest, MeteoSchweiz publiziere das INCA-Nowcasting nicht als Grid. Soll geprüft werden, ob sich das seither geändert hat (die Schweiz hat damit heute faktisch **keinen** Regen-Nowcast — der Kern-Use-Case „regnet es gleich?" ist für ein Drittel des Namensraums leer)?

---

## 8. Gefundene Doku-Inkonsistenzen (für `context.md` §Session-Log)

| # | Behauptung | Realität am Code | Beleg |
|---|---|---|---|
| DI-1 | `decisions.md` D-16: Modell-Switcher „Phase 3 UI offen" | UI ist verdrahtet und gerendert | `MapView.tsx:97` (Import), `:3434` (Render), `:491` (State), `:3460` (Land-Umschalter), `:3532` (Quellen-Pill) |
| DI-2 | `improvements.md` V-13 / `zielgruppen-dach.md` Grenze 1: „Pollen … AT/CH = Lücke" | AT/CH-Pollen sind **umgesetzt** (CAMS via Open-Meteo, Opt-in) inkl. ehrlichem Hinweistext | `sources/openMeteoPollen.ts:1-11`, `PointForecastPanel.tsx:159-166`, `:310-317` |
| DI-3 | `zielgruppen-dach.md` (2026-06-09): „UV … AT/CH bekommen das nicht" | Für die **Tour** existiert ein UV-Klarhimmel-Fallback; nur der Punkt-Forecast lässt AT/CH leer — die Aussage ist zu pauschal und die App in sich inkonsistent | `uvClearSky.ts:1-20`, `weatherEnrichment.ts:207` vs. `pointForecast.ts:209-211` |
| DI-4 | `zielgruppen-dach.md`: KI-Meteorologe / `src/assistant`, Globus = Sample-Daten, Nowcast „2–6 h ICON-D2" | `src/assistant` existiert nicht (bekannte Fiktion); Globus nutzt GFS live (`globe/gfs.ts:20`, `/_gfs`-Rewrite in `netlify.toml`); Nowcast ist seit D-14 radar-only (`precipSource.ts:5-9`) | s. Spalte |
| DI-5 | `decisions.md` D-18: „Open-Meteo nur opt-in … Consent-Gate im PointForecastPanel" | Gate greift **nur** für CAMS-Pollen; 15 weitere Aufrufstellen in 9 Modulen sind ungegatet | `optIn.ts` (einziger Leser `PointForecastPanel.tsx:26`, Nutzung `:161`) vs. §2.8-Liste |
| DI-6 | `architecture.md` §5: Fusion v2 „fünf gestaffelte Flags" | Nur **einer** (`oi`) hat einen echten Konsumenten; `bgMinVar`/`bgOffDiag` existieren nur als Deklaration + Cache-Key-Buchstabe | `fusionEngine.ts:78,81` vs. `:336`; `params.ts:109` ohne Aufrufer |
| DI-7 | `architecture.md` §5: „Cutover ist vertagt … Trainings-Artefakt entsteht aus `fixtures/`" | Artefakt **existiert bereits** (`public/params/background-v1.json`), ist aber vom 2026-07-02 mit `sessions: 2`, während das Archiv 278 Fixtures / 694 h umfasst und `fusion:status` `READY` meldet | s. Spalte |
| DI-8 | `roadmap.md` §B 7: Radar-Katalog „neu priorisieren … Zugbahn-/Zellen-Tracking" als Chance | Zellen-Tracking inkl. Bewegungsvektor, Projektionskegel und ETA-zu-mir ist **fertig und gerendert** | `cellTracking.ts:148,30-46,231`; `RadarMap.tsx:165-166,352`; `NowcastRadarMap.tsx:410-414` |
| DI-9 | Implizite Annahme, `docs/high-end-radar-feature-catalogue.md` habe Item-IDs und Aufwände | Das Dokument hat **weder** IDs **noch** Aufwandsangaben — nur Prioritätsklassen `[Core]/[Diff]/[Expert]/[Trap]` | `high-end-radar-feature-catalogue.md:12` (Legende) |
| DI-10 | `architecture.md` §10 / D-20: „24-h-Staleness-Guard + Scan-Fallback" (als Stärke) | Korrekt beschrieben — aber **derzeit aktiv ausgelöst**: das Manifest ist > 45 h alt, der Warm-Cache damit seit ca. 2026-07-30 21:00 UTC wirkungslos | `public/latest-grib.json` vs. `gribManifest.ts:34,70` |
| DI-11 | `architecture.md` §4: `src/sources` „53 Dateien" als Aktiv-Inventar | 3 Module (370 LOC) haben null Importeure | `dwdPrecipForecast.ts`, `dwdRadar.ts`, `gfsSounding.ts` |

---

## 9. Offene Fragen / nicht verifizierbar

1. **Reicht der DWD-Blitz-WMS über AT/CH?** `dwdLightning.ts:10` nutzt `dwd:Accumulated_Flash_Area` ohne Bbox-Beschränkung. Ob die Layer-Domäne Österreich und die Schweiz abdeckt, ist **nur** aus den WMS-Capabilities zu klären — im Repo steht dazu nichts. Falls ja, wäre die vielfach dokumentierte „Blitz DE-only"-Aussage schlicht falsch (Beschriftungsfrage statt Datenlücke). **Zu verifizieren, hohe Hebelwirkung.**
2. **Lizenz- und CORS-Lage MeteoAlarm/EUMETNET** — nicht aus dem Repo belegbar. **Zu verifizieren** vor jeder Planung von V-DAT-02.
3. **Publiziert MeteoSchweiz das INCA-Nowcasting inzwischen als Grid?** `meteoSwissRadar.ts:4-11` stellt das Gegenteil fest, aber ohne Datumsstempel. Falls sich das geändert hat, springt der CH-Nowcast-Horizont von 0,5 h auf mehrere Stunden — der größte Einzelgewinn der CH-Parität. **Zu verifizieren.**
4. **Publiziert GeoSphere einen INCA-Analyse-Frame (Lead 0)?** Betrifft V-DAT-14. **Zu verifizieren.**
5. **Warum ist AT vom Punkt-Radar-Nowcast ausgeschlossen** (`pointForecast.ts:225`)? Kein Kommentar, kein ADR. Möglicherweise ein Grid-Adapter-Problem — **nicht statisch entscheidbar**.
6. **Zustand der Prod-Quellen** — diese Analyse hat **keinen** `verify:*`-Lauf durchgeführt. Ob die 7 proxy-betroffenen Modelle heute tatsächlich scheitern, ist am Code hergeleitet, nicht gemessen. Ein Prod-Lauf der Verifier wäre der erste Schritt jeder Umsetzung.
7. **Bandbreiten-/Kostenwirkung von V-DAT-15** — nicht abschätzbar ohne Netlify-Bandbreitendaten (Infra-Rolle).
8. **Ist die Hit-Rate-Ground-Truth bewusst ein Modellkonsens?** `hitRate.ts:8-10` argumentiert „quellenunabhängig, faire Referenz". Das ist verteidigbar, aber es ist eine Produktentscheidung ohne ADR-Nummer. Sollte als D-NN aufgenommen oder revidiert werden.
9. **Warum ist `cloud` in `fixtureBuild.ts` ohne Stationswahrheit erfasst?** (`effN 0`, `archive-status.mjs:57-61`). Entweder fehlt ein Bewölkungs-Observationskanal (DWD liefert `cloud_cover` über BrightSky), oder die Variable gehört gar nicht in die Trainingsmenge. **Nicht aus dem Code entscheidbar.**
10. **Aktualität von `docs/high-end-radar-feature-catalogue.md`** — kein Datumsstempel im Dokument gefunden; die Einordnung „prädatiert D-14" stammt aus dem Auftrag, nicht aus dem Dokument selbst.
