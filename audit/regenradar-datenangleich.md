# Regenradar — Karte und Daten wie die Wetterkarte (RR0 Diagnose · RR1 Plan und Umsetzung)

> Stand: 2026-10-03. Jans Auftrag (03.10.): „Schau dir mein Regenradar an und aktualisiere es visuell und
> datengetrieben. Das Regenradar soll sich komplett mit Niederschlag beschäftigen und Niederschlag, Zellbahnen,
> Schnee, Schneegrenze und Blitze – soweit vorhanden – anzeigen. Der einzige Unterschied: Die Daten sollen jetzt,
> genau wie in der Wetterkarte, aus buscosun-data kommen. Verwende dafür exakt dieselbe Karte und dieselbe Logik wie
> in der bereits vorhandenen Wetterkarte."
>
> Lieferform (Jan, 03.10.): **Diagnose + Plan + Kickoff-Prompt**, Umsetzung in der Claude Code CLI.
> Die Phase ist Teil 1 von „Regenradar 2.0" (Nachfolger von `/regenradar`, Jans Entscheidung 03.10.):
> Konzept als Claude-Doc <https://claude.ai/code/artifact/7f93924e-2bfd-446b-a2f6-0601f456da2c>,
> Kurzfassung im Repo `audit/niederschlagsplattform-konzept.md`, Vorlage `reference/regenradar2-*.dc.html`.
> Kickoff: `prompt-regenradar.md`.

## 0. Kurzfassung für Jan

1. **Das Radarbild kommt schon aus buscosun-data.** RV, INCA, rzc und KONRAD3D liest das Regenradar über denselben
   Spiegel `radar/img/v1/` wie die Wetterkarte (RD3), Schnee über dieselben Repack-PNG (BW-6), Zellbahnen über
   dieselben Layer-Module (RL1). Hier ist nichts umzuziehen.
2. **Abweichend sind vier Dinge:** (a) die **Karte** — `/regenradar` zeichnet mit einer eigenen MapLibre-Instanz
   (`radar/RadarMap.tsx`, Basiskarte liberty/Esri), die Wetterkarte mit `MapView.tsx` (positron); (b) die
   **Schneefallgrenze** — Regenradar: EIN Wert aus dem Live-Punktpfad als Höhenlinie über dem DEM, Wetterkarte:
   ICON-D2-Temperaturfeld (Repack) + DEM + ML #2, räumlich variierend; (c) der **Punkt-Streifen 2–6 h** — Regenradar:
   Live-Pfad `getPointForecast` (BrightSky/MOSMIX, GeoSphere AROME/INCA, Stationen direkt von Fremd-Origins), Wetterkarte:
   buscosun Fusion 8 auf dem Punkt-Cube (`buscosun-data/point/`); (d) der **Rückblick** existiert nur im Regenradar.
3. **Nicht in buscosun-data — in beiden Ansichten:** Blitze (DWD-GeoServer `Accumulated_Flash_Area`, live), Hagel-Fläche
   CH (MeteoSchweiz-STAC, live), Warnungen (Punkt: BrightSky `/alerts`; Layer: DWD CAP). Das ist „soweit vorhanden"
   ehrlich: dieselbe Logik wie die Wetterkarte heißt hier „live wie die Wetterkarte". Der Blitz-Spiegel ist Paket NP-0
   des Konzepts, nicht Teil dieser Phase.
4. **Plan RR1:** `NowcastDeck` bettet `MapView` mit einem neuen, additiven **Niederschlags-Profil** ein (nur die
   Niederschlags-Layer im Dock, Zeit von außen als absolute Gültigkeitszeit inkl. Rückblick), der Punkt-Streifen
   rechnet auf **buscosun Fusion 8**, die Schneegrenze ist die der Wetterkarte. Das heutige `RadarMap` bleibt hinter
   `?rr=legacy` als benannter Rückfall (Regel 2). Ohne Profil ist `MapView` byte-gleich.
5. **Jans Entscheidungen vor dem Start:** E-RR-1 (Karte = MapView, Konzept E-NP-1), E-RR-2 (Basiskarte),
   E-RR-3 (Funktionen ohne MapView-Gegenstück). Alles Weitere entscheidet die Phase selbst und belegt es.
6. **Stand nach RR0 (03.10.):** Anker §1 nachgeprüft, Datenwege per Mitschnitt gemessen (§2). Jan hat E-RR-1…3 entschieden
   (§6): `MapView` mit Niederschlags-Profil, nur positron, die seit dem Deck unerreichbaren Einstellungen werden nicht
   nachgebaut. Maßstab für den Punkt-Streifen ist **buscosun Fusion 8** wie in `CLAUDE.md` definiert; an buscosun Fusion
   ändert RR nichts. Das Gate-Kriterium „keine Fremd-Punktabrufe" war falsch formuliert — buscosun Fusion holt die
   **Messungen** absichtlich live (§2.4, §5 neu).
7. **Stand nach RR1 (03.10., uncommitted, §9, Gate §5.1):** `/regenradar` zeichnet auf der Karte der Wetterkarte
   (`MapView`, Profil `radar`, positron), Niederschlag als DACH-Komposit zur absoluten Zeit inkl. Rückblick und Morph,
   Schneefallgrenze der Wetterkarte, Streifen auf buscosun Fusion 8 (dieselbe Kette wie Panel/Dashboard). Die alte Karte
   bleibt hinter `?rr=legacy`. Wetterkarte ohne Profil pixelgleich zu HEAD (bis auf den animierten LIVE-Punkt),
   `verify:regenradar-profile` 34/34, Budget +3,4 KB lazy. **Einschränkung:** das Einschalten der Schneefallgrenze
   friert die Seite einige Sekunden ein — geerbt von der Wetterkarte (V-RR-15). **Neu gefunden und behoben:** Verlassen der
   Wetterkarte mit aktiven Zellbahnen, Hagel oder Warnungen stürzte in Produktion ab, schon an HEAD (V-RR-9, Fix 03.10.).

## 1. Befund je Baustein (gelesen am Arbeitsbaum 03.10.2026)

**RR0-Nachprüfung (03.10.):** Jede Zeilenangabe dieser Tabelle gegen den Arbeitsbaum gelesen — alle stimmen
(`NowcastRadarMap.tsx`, `RadarMap.tsx`, `radarFrames.ts`, `nowcastEngine.ts`, `precipPhase.ts`, `MapView.tsx`,
`PointForecastPanel.tsx`, `dwdAlerts.ts`). Abweichungen der *Aussagen* (nicht der Anker) stehen in §1.1.

| Baustein | Regenradar (`NowcastDeck` → `NowcastRadarMap` → `RadarMap`) | Wetterkarte (`MapView`) | Gleich? |
|---|---|---|---|
| Karte | eigene Instanz, `RadarMap.tsx:43` liberty, `:53` Esri Satellit/Topo, `patchLibertyRefLength` | `MapView.tsx:1152` positron | **nein** |
| Niederschlag | Landes-Stack `getRadarStack` (`NowcastRadarMap.tsx:236`) + Nachbarn (`:315–317`) → `PrecipCompositor`, Morphing über `framePos` | `PrecipCompositor.build(forecastHour, …)` (`MapView.tsx:3400`), kein Morphing | Daten ja, Karte nein |
| Rückblick | `seedDePastArchive(9)` (`:255`, `radarFrames.ts:119`) = 45 min aus `f000.png` + Sitzungs-Cache | gibt es nicht (Slider ab 0 h, 0,1-h-Schritte) | **nur Regenradar** |
| Zellbahnen | `fetchKonrad3d` (`:342`) → `buildCellFeatures` → `installCellLayers` | identisch (RL1) | ja |
| Schnee | `fetchIconD2Snow` (`:370`), `ScalarLayer` mit MapView-Optionen | identisch (RL1) | ja |
| Schneefallgrenze | `snowLineGeoJSON(terrain, pointNowcast.summary.snowLineM)` (`:443–444`, `precipPhase.ts:140`) — ein Punktwert als Höhenlinie | `buildSnowLine(frame, td.demImage, td.uvBounds, climaField)` (`MapView.tsx:2826`) | **nein** |
| Blitze | WMS `dwd:Accumulated_Flash_Area` (`RadarMap.tsx:253`) | identisch (`MapView.tsx:2378`), dazu `lightningfc` (LPI, Repack) | ja (beide live) |
| Punkt-Streifen 0–6 h | `buildNowcast` → Radar-Sampler + `getPointForecast({ …, hours: 8 })` (`nowcastEngine.ts:323`) = Live-Pfad | Punkt-Panel: `getPointForecast({ …, pointSource: 'cube' })` nach `import('./cubeSource')` (`PointForecastPanel.tsx:170`), Rückfall live bei Fehler, `?pf=live` | **nein** |
| Gewitter-Kontext | `fetchPeakCapeAtPoint` (Repack `cape`), `fetchDwdAlerts` (BrightSky, `dwdAlerts.ts:80`) | Panel ebenso BrightSky; Warn-Layer DWD CAP | ja / live |
| Hagel | Radar-Phase `hail` (Heuristik) | Layer `hail` (MESHS/POH CH + KONRAD-Hagel DE) | **nein** |
| Phasen Regen/Graupel/Hagel | Heuristik `classifyPhases` (Radar × DEM × Schneefallgrenze) | gibt es nicht | **nur Regenradar** |
| Summe, Radarsicht | `accumulate` (`:416`), `buildEdgeFalloffMask` (`:422`) | gibt es nicht | **nur Regenradar** |
| Palette, Deckkraft | `PALETTES` classic/viridis/mono, Deckkraft-Regler (nur über alten `localStorage`-Stand, Deck setzt `hideLayerbar`) | eine Rampe `precipRainRamp` | **nur Regenradar** |
| Punktwahl, Vergleichspunkt, Hover | `onPick`, `comparePoint`, `onHover` (mm/h unter dem Zeiger) | Punkt-Panel am Ort, Readout | teilweise |
| Warnungen am Punkt | `fetchDwdAlerts` (BrightSky `/alerts`) im Konvektions-Index | Punkt-Panel ebenso BrightSky `/alerts` | ja (beide live) |

### 1.1 Abweichungen von der Diagnose (RR0, gemessen 03.10.)

| # | Aussage der Diagnose | Befund | Folge (Jans Entscheidung 03.10.) |
|---|---|---|---|
| a | Gate GRR „keine BrightSky-/GeoSphere-Punktabrufe mehr im Streifen" | buscosun Fusion 8 holt die aktuellen **Stationsmessungen** selbst live (Anker und Stationswert): im Dashboard München 22 × BrightSky `/current_weather`, Innsbruck 2 × TAWES, Zürich 12 SMN-CSV + Stationsliste (§2.4) | Kriterium war falsch formuliert ⇒ §5 „Daten" neu; V-RR-4 korrigiert |
| b | §2 „RV/rzc aus buscosun-data" | stimmt nur außerhalb des Frischefensters: kurz nach jedem neuen 5-min-Slot nehmen die Lader absichtlich den Direktweg (rzc: data.geo.admin.ch STAC + HDF5; RV: Tar-CDN oder `/_dwd_opendata`), in Wetterkarte und Regenradar gleich (RD3) | nur dokumentieren (§2.5), in RR nichts ändern; V-RR-5 |
| c | Schneefallgrenze „DEM" ohne Ursprung | das Gelände kommt in **beiden** Ansichten von AWS Terrarium (Regenradar 49 Kacheln z7, Wetterkarte 90 Kacheln z7) | ok (statische Geodaten, keine Wetterdaten); nach RR lädt das Regenradar 90 Kacheln — im Gate mobil messen (§5) |
| d | Live-Pfad ohne Zahlen | Ausgangswerte im Produktions-Build gemessen: München 22 BrightSky-Punktabrufe (+ 1 `/alerts` des Konvektions-Index), Innsbruck 7 Abrufe bei GeoSphere/BrightSky, Zürich 80 SMN-CSV (§2.3) | als Ausgangswert festgehalten |
| e | §1 „Palette, Deckkraft — nur über alten `localStorage`-Stand" | gilt für **alle** Einstellungen des Kartenpanels: Palette, Deckkraft, Basiskarte, Summe (+ Fenster), Radarsicht, Phasen-Heuristik, Experten-dBZ; `comparePoint` ist im Deck immer `null` (`NowcastDeck` → `NowcastRadarMap comparePoint={null}`) | E-RR-3: in RR nicht übernommen (§3, §6) |
| f | §1 Niederschlag „Daten ja" | gleicher Lader `fetchIncaGrid`, aber im Mitschnitt der Wetterkarte (09:45Z) wurde der INCA-Stempelabruf `/metadata` unter der CDN-Frist abgebrochen ⇒ INCA als NetCDF direkt von GeoSphere (≈ 722 KB) statt 13 Spiegel-PNG; einmal beobachtet | V-RR-7; in RR nichts ändern |


## 2. Datenwege (wohin jeder Abruf geht)

### 2.1 Soll-Wege (Plan, nach RR0 korrigiert)

| Abruf | Ursprung | buscosun-data? | Rückfall / Ausnahme |
|---|---|---|---|
| RV-Frames, RV-Rückblick | `cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/radar/img/v1/rv/…` | ja | **Frischefenster** (§2.5): neuer Slot noch nicht als Bild ⇒ Tar-CDN `radar/rv/composite_rv_*.tar` oder `/_dwd_opendata` (Netlify); Hedge `raw.githubusercontent.com` (NL-1) |
| INCA | Stempel: GeoSphere `/metadata` **immer direkt**; Frames `radar/img/v1/inca/…` | Frames ja | NetCDF-Grid direkt von GeoSphere (≈ 722 KB), wenn `/metadata` scheitert oder die CDN-Frist reißt (§1.1 f) |
| rzc | `radar/img/v1/rzc/…` | ja | **Frischefenster** (§2.5): data.geo.admin.ch STAC + HDF5 direkt |
| KONRAD3D | `radar/img/v1/konrad3d/…/cells.json` | ja | Tar-CDN `radar/konrad3d/*.xml`, `/_dwd_opendata/weather/radar/konrad3d/`, älterer Slot |
| Schnee, CAPE, LPI, Temperatur | Repack-Familien `runs/<lauf>/*.png` (`repackSource.ts`) | ja | GRIB über `/_dwd_grib` |
| Gelände Schneefallgrenze | AWS Terrarium `s3.amazonaws.com/elevation-tiles-prod/terrarium` z7 (+ `hsurf-v1.png` aus buscosun-data in der Wetterkarte) | nein (statische Geodaten, beide Karten) | — |
| Punkt-Streifen 2–6 h heute | Live-Pfad: BrightSky, GeoSphere, TAWES, SMN, DWD-UV (§2.3) | **nein** | — |
| Punkt-Streifen nach RR1 | **Vorhersageteil** aus `point/` (Cube t1/t2/t3, Stationsprodukt MOSMIX-L, Lerntabellen, Klimatologie, `static/hmodel`/`urban`) + Radar-Member aus `radar/img/v1` inkl. Stundenmittel `m<lead>.png`; **live nur** die Messquelle des Landes (BrightSky DE / TAWES AT / SMN CH), AWS Terrarium (z11 + z8) und der WorldCover-Spiegel `jppetry/buscosun-worldcover` (z0) | Vorhersage ja | Live-Pfad bei Fehler oder `?pf=live` (Konsolenmeldung) |
| Blitze | `maps.dwd.de/geoserver` WMS | nein (beide Karten) | — |
| Warnungen | BrightSky `/alerts` (Punkt), DWD CAP (Layer) | nein (beide Karten) | — |
| Hagel CH | `data.geo.admin.ch` STAC | nein (beide Karten) | — |
| Basiskarte | heute OpenFreeMap liberty (`/regenradar`), positron (Wetterkarte); nach RR beide positron (E-RR-2) | — | — |

### 2.2 Mitschnitte RR0 (gemessen 03.10.2026)

Werkzeug `scripts/regenradar-netcapture.mjs` (neu, für das Gate wiederverwendbar): frischer Browser-Kontext (leerer Cache,
IndexedDB, localStorage = kalter Nutzer), headless Chromium, Desktop 1440×900, 30–40 s Wartezeit; jeder Abruf mit
Ursprungsklasse, auch aus dedizierten Workern (der Service Worker wird nicht gezählt, er reicht nur Seitenabrufe durch).
Gemessen gegen den **Produktions-Build** des Arbeitsbaums (`vite preview`, Port 5212), weil der Dev-Server in StrictMode
jeden Abruf doppelt startet (Dev-Läufe 09:25–09:32Z nur als Gegenprobe). Rohdaten als JSON im Session-Scratchpad;
die Tabelle ist daraus gezählt. Byte-Zahlen fremder Ursprünge sind wegen des Service Workers nicht lesbar (0), Zahl und URL schon.

| Ort, Zustand, Zeit (UTC) | aus buscosun-data | direkt / fremd |
|---|---|---|
| `/regenradar/muenchen`, Voreinstellung (Niederschlag, Zellen, Blitze), 09:37:41 | RV meta + 25 Frames, INCA meta + 12, KONRAD `cells.json`, CAPE `runs/2026100306/cape-000…003`, `index.json` | rzc STAC + HDF5 (data.geo.admin.ch, Frischefenster), GeoSphere INCA `/metadata`; **Punkt-Streifen live:** BrightSky `/weather` × 2, `/current_weather` × 20, Terrarium z9 × 2, DWD-UV `uvi.json` (Netlify-Proxy); BrightSky `/alerts` × 1 (Konvektions-Index); DWD-WMS × 12 (6 abgebrochen); OpenFreeMap liberty (Stil, Sprites, 5 Fonts, 6 Kacheln) |
| dto., alle Deck-Layer (+ Schnee, Schneegrenze), 09:39:22 | RV über **Tar-CDN** `radar/rv/composite_rv_20261003_0935.tar` (neuer Slot noch nicht als Bild), rzc meta + Frame, INCA 13, KONRAD 1, `runs/` 29 (CAPE 4 + `snowdepth-000…024`) | wie oben; dazu **Terrarium z7 × 49** (Gelände der Schneefallgrenze) |
| `/regenradar/innsbruck`, Voreinstellung, 09:41:03 | RV 26 (1 Bild über den raw-Hedge), INCA 13, rzc 2, KONRAD 1 | **Punkt-Streifen live:** GeoSphere TAWES current × 2 + historical × 1, Nowcast-Zeitreihe × 1, `nwp-v2`-Zeitreihe × 1, BrightSky `/weather` × 2, Terrarium z9 × 2; GeoSphere INCA `/metadata`; WMS × 4; OpenFreeMap |
| `/regenradar/zuerich`, Voreinstellung, 09:42:44 | RV 26, INCA 13, KONRAD 1 | rzc STAC + HDF5 direkt; **Punkt-Streifen live:** **80 × SMN `…_t_now.csv`** + Stationsliste, `nwp-v2`-Zeitreihe × 1, BrightSky `/weather` × 2, Terrarium z9 × 4; WMS × 8; OpenFreeMap |
| Wetterkarte `/wetterkarte/niederschlag/muenchen?l=zellbahnen,blitze,schnee,schneegrenze`, 09:45:39 | RV 26, rzc 2, KONRAD (neuester Slot 404, Tar-XML 404, dann 09:35), `runs/` 15 (Temperatur, Schnee, Böe, Gewitter, Rotation, LPI, Niederschlag), `hsurf-v1.png`, `index.json` | **INCA NetCDF direkt** (`/metadata` unter der CDN-Frist abgebrochen, §1.1 f), **Terrarium z7 × 90** (Schneefallgrenze), WMS × 5, OpenFreeMap **positron** |
| Dashboard München (Cube-Pfad, buscosun Fusion 8), 09:49:53 | `point/index.json`, `run.json` × 3 (t1 06z, t2 00z, t3 12z), je Stufe 1 Chunk, `fusion.client.json`, `stack.client.json`, `static/clima`, `static/hmodel` × 4, `static/urban` × 2, `stations/catalog.json` + MOSMIX-L-Lauf × 2; Radar-Member RV 7, INCA 8 (1 × 404 neuester Slot), rzc 5 | **Messungen:** BrightSky `/current_weather` × 22; Terrarium z11 × 2 + z8 × 2; WorldCover-Spiegel × 2 (Range 206); Dashboard-eigene Extras (Pollen, UV, CAP) |
| Dashboard Innsbruck (Cube-Pfad), 09:52:09 | wie München (Chunk-Adressen des Orts); Radar-Member RV 7 (1 × 404), INCA 8 (1 × 404), rzc 5 + 1 raw-Hedge | **Messungen:** GeoSphere TAWES `metadata` + `current` (2); Terrarium z11 × 4 + z8 × 2; WorldCover × 5; Dashboard-Extra ZAMG-Warnungen |
| Dashboard Zürich (Cube-Pfad), 09:53:51 | wie München; Radar-Member RV 7, INCA 8 (1 × 404), rzc 5 | **Messungen:** **12 × SMN `…_t_now.csv`** + Stationsliste; Terrarium z11 × 2 + z8 × 2; WorldCover × 3; Dashboard-Extra MeteoAlarm |

### 2.3 Ausgangswert: der heutige Live-Pfad des Streifens

Gezählt im Produktions-Build (§2.2), nur die Abrufe des Punkt-Streifens (`getPointForecast` live):

| Ort | Abrufe | davon |
|---|---|---|
| München | 22 BrightSky + 2 Terrarium + 1 DWD-UV | `/weather` × 2 (MOSMIX + Station), `/current_weather` × 20 (Sondenraster) |
| Innsbruck | 7 GeoSphere/BrightSky + 2 Terrarium | TAWES current × 2, historical × 1, Nowcast-Zeitreihe, `nwp-v2`-Zeitreihe, BrightSky `/weather` × 2 |
| Zürich | 84 + 4 Terrarium | 80 × SMN `…_t_now.csv`, SMN-Stationsliste, `nwp-v2`-Zeitreihe, BrightSky `/weather` × 2 |

**Korrektur einer Zahl aus dem RR0-Bericht an Jan:** „München 28 BrightSky-Abrufe" war im **Dev-Server** gezählt
(StrictMode startet jeden Abruf zweimal, die ersten werden abgebrochen: `/current_weather` 23 davon 3 abgebrochen,
`/weather` 3, `/alerts` 2). Im Produktions-Build sind es **23** (22 Punktabrufe + 1 `/alerts`). Zürich „rund 80"
stimmt im Produktions-Build (80); der Dev-Server zeigte 160.

### 2.4 Cube-Pfad (buscosun Fusion 8): was live bleibt — und warum

buscosun Fusion 8 holt die **aktuellen Stationsmessungen** absichtlich live, nur Messungen, keine Vorhersagen: Sie sind
Anker und Stationswert (`fetchCubeObs` in `defaultCubeIo`). Messquelle je Land des Orts: **BrightSky** (DE), **GeoSphere
TAWES** (AT), **MeteoSchweiz SMN** (CH) — dazu **AWS Terrarium** (Zwei-Skalen-DEM z11 + z8 am Punkt) und der eigene
**WorldCover-Spiegel** (`jppetry/buscosun-worldcover`, z0). Der gesamte **Vorhersageteil** kommt aus buscosun-data (Cube,
MOSMIX-L-Stationsprodukt, Lerntabellen, Radar inkl. Stundenmittel `m<lead>.png`). Das bleibt so; RR baut **keinen**
Spiegel für Messungen (Jan, 03.10.).

| Ort | Live-Pfad heute (§2.3) | Cube-Pfad (Dashboard, §2.2) |
|---|---|---|
| München | BrightSky 22, Terrarium 2, DWD-UV 1 | BrightSky `/current_weather` 22, Terrarium 4, WorldCover 2 |
| Innsbruck | GeoSphere 5, BrightSky 2, Terrarium 2 | TAWES 2, Terrarium 6, WorldCover 5 |
| Zürich | SMN 81, GeoSphere 1, BrightSky 2, Terrarium 4 | SMN 13, Terrarium 4, WorldCover 3 |

Lesart: In München gleich viele BrightSky-Abrufe (22 : 22), in Zürich 81 → 13 SMN (AX-1 wählt die nächsten Stationen
statt jeder k-ten), in Innsbruck keine Vorhersage-Zeitreihen mehr. Der Gewinn liegt nicht in der Zahl der Abrufe,
sondern darin, dass der Vorhersageteil aus einer Hand kommt und Streifen, Punkt-Panel und Dashboard dieselben Zahlen
zeigen (V-RR-4). Das Radar-Stundenmittel `m<lead>.png` wirkt erst nach Jans Push und dem nächsten Spiegel-Job; bis dahin
rechnet der Streifen exakt Fusion 7 (`CLAUDE.md`, „buscosun Fusion 8") — kein Blocker für RR.

### 2.5 Frischefenster: rzc und RV kurz nach jedem Slot direkt (gewollt)

Kurz nach jedem neuen 5-min-Slot führt der Spiegel das Bild noch nicht. Damit das Bild frisch bleibt, nehmen die Lader
dann absichtlich den Direktweg (RD3, `audit/radar-datenrepo.md`): rzc über data.geo.admin.ch STAC + HDF5
(`meteoSwissRadar.ts` nimmt den Spiegel nur, wenn gegatterter und aggressiver Stempel übereinstimmen), RV über das
Tar-CDN `radar/rv/composite_rv_*.tar` oder `/_dwd_opendata`. Beobachtet: 09:37 rzc direkt, 09:39 RV über das Tar-CDN,
im Dev-Lauf 09:28 RV über `/_dwd_opendata` (Netlify, 710 KiB). Wetterkarte und Regenradar nutzen dieselben Lader ⇒
nach RR identisch. **In RR nichts geändert** (Jan, 03.10.); V-RR-5.

### 2.6 Gelände der Schneefallgrenze

AWS Terrarium in **beiden** Ansichten — statische Geodaten, keine Wetterdaten, daher ok (Jan, 03.10.). Heute lädt das
Regenradar 49 Kacheln z7 (Bbox des Radar-Stacks), die Wetterkarte 90 Kacheln z7 (Bbox des Temperatur-Repacks, `demGrid.ts`
seit RK-1). Nach RR lädt das Regenradar wie die Wetterkarte **90 Kacheln** — Gate GRR misst das mobil (§5).

### 2.7 Datenwege nach RR1 (Gate-Mitschnitte 03.10.2026, Produktions-Build, 11:31–11:59 UTC)

Werkzeug wie §2.2 (`scripts/regenradar-netcapture.mjs`), Build des Arbeitsbaums mit RR1 (`vite preview`, Port 5212).

| Ort, Zustand, Zeit (UTC) | aus buscosun-data | live (benannt) |
|---|---|---|
| `/regenradar/muenchen`, Voreinstellung, 11:31:36 | **Streifen (buscosun Fusion):** `point/index.json`, `run.json` + t1-Chunk, `fusion.client.json`, `stack.client.json`, `static/clima`, `static/hmodel` × 2, `static/urban` × 2, `stations/catalog.json` + MOSMIX-L-Lauf × 2; **Karte:** RV meta + Frames + Stundenmittel (`m080/m140.png`), INCA, rzc, KONRAD, Repack `runs/` | **Messungen:** BrightSky `/current_weather` × 22; Terrarium z11 × 2 + z8 × 2; WorldCover × 2 · Konvektions-Index: BrightSky `/alerts` × 1 · Frischefenster: rzc STAC + HDF5 · INCA `/metadata` · WMS-Blitze × 7 · OpenFreeMap **positron** |
| dto., alle Deck-Layer, 11:33:17 | dazu `hsurf-v1.png`, `runs/` 11 (Temperatur, Schnee, ICON-D2-Niederschlag) | dazu **Terrarium z7 × 90** (Schneefallgrenze der Wetterkarte); BrightSky `/current_weather` × 14 (3 nach Frist abgebrochen) |
| `/regenradar/innsbruck`, 11:35:04 | Streifen wie oben (Chunks des Orts), Karte wie oben | **Messungen:** GeoSphere TAWES × 2; Terrarium z11 × 4 + z8 × 2; WorldCover × 5 · KONRAD über Listing + `/_dwd_opendata` × 4 (V-RR-8) |
| `/regenradar/zuerich`, 11:36:46 | wie oben | **Messungen:** SMN `…_t_now.csv` × 12 + Stationsliste; Terrarium z11 × 2 + z8 × 2; WorldCover × 3 · rzc STAC + HDF5 (Frischefenster) |
| `?pf=live`, 11:38:27 | Karte wie oben | Live-Pfad wie §2.3 (BrightSky `/weather` × 2 + `/current_weather` × 20, Terrarium z9 × 2), Konsole: „[buscosun Fusion] Regenradar-Streifen: ?pf=live — Live-Pfad statt Cube-Pfad" |
| `?rr=legacy`, 11:40:09 | Streifen über buscosun Fusion (der Streifen hängt nicht an der Karte) | alte Karte: OpenFreeMap **liberty**; Konsole „[buscosun] Regenradar-Karte → eigene Radarkarte (?rr=legacy)" |

**Gegen den Ausgangswert §2.3** (nur Abrufe des Streifens): München 22 BrightSky-Punktabrufe → 22 BrightSky-**Mess**abrufe
(keine Vorhersage mehr, `/weather` entfällt); Innsbruck 7 GeoSphere/BrightSky → 2 TAWES; Zürich 84 → 13 SMN. Jeder
verbliebene Live-Abruf ist eine Messung (Anker/Stationswert), Gelände (Terrarium) oder der WorldCover-Spiegel — das
neue Kriterium §5 „Daten" hält. Das Radar-Stundenmittel `m<lead>.png` liegt bereits im Spiegel (Slot `2610031040`
trägt `m080.png`/`m140.png`) ⇒ der Streifen rechnet schon **buscosun Fusion 8**, nicht erst nach dem nächsten Job.

## 3. Funktionserhalt-Liste (was das heutige Regenradar kann)

Jede Zeile braucht in RR1 einen Ort — vorhanden in `MapView`, additiv nachgebaut, oder Jans Freigabe (E-RR-3).

| Funktion | Heute | In RR1 |
|---|---|---|
| DACH-Komposit, 5-min-Frames | `RadarMap` | `MapView` (vorhanden) |
| Frame-Morphing zwischen 5-min-Frames | `RadarMap` `framePos` + `lerpU8` | **additiv**: `MapView` mischt im Profil zwei Komposit-Frames (`lerpFrameImage` existiert in `fusion/frameInterp.ts`) |
| Rückblick 45 min + Sitzungs-Cache | `radarFrames.ts` | **additiv**: `CompositeSources.rvPast` (Analysen nach Gültigkeitszeit) → `build()` wählt für Zeiten < Laufzeit die Analyse; ohne `rvPast` byte-gleich |
| Zeitachse mit Messung↔Nowcast-Bruch, Play | `RadarTimeline`, Deck-Play | bleibt im Deck, steuert `MapView` über die neue Zeit-Prop |
| Zellbahnen, Steckbrief, Standortbezug | RL1-Module | `MapView` (vorhanden); Standortbezug-Banner bleibt im Deck |
| Schnee Decke / Neuschnee | RL1 | `MapView` (vorhanden) |
| Schneefallgrenze | Punktwert-Höhenlinie | `MapView` `snowline` (Wetterkarten-Logik) — **ersetzt** (Jans Auftrag „dieselbe Logik") |
| Blitze | WMS | `MapView` (vorhanden) |
| Punkt-Streifen „Regen in X min", PoP, Bar-Chart | `PointStrip`, `pointPoPSeries`, `NowcastBarChart` | bleiben; Quelle 2–6 h = Fusion 8 |
| Konvektions-Index | CAPE + Warnungen + Zellen | bleibt |
| Palette classic/viridis/mono | `PALETTES` — **seit dem Deck nicht erreichbar** (nur alter `localStorage`-Stand) | **in RR nicht übernommen** (E-RR-3, Jans Freigabe 03.10.); farbsichere Palette kommt in NP-1/NP-2 zurück; Code bleibt |
| Deckkraft | Regler — seit dem Deck nicht erreichbar | in RR nicht übernommen (E-RR-3); Code bleibt |
| Basiskarte Straßen/Satellit/Topo | `RadarMap` — seit dem Deck nicht erreichbar | **nur positron** (E-RR-2, Jan 03.10.); `RadarMap` mit liberty/Esri bleibt hinter `?rr=legacy` |
| Phasen Regen/Graupel/Hagel (Heuristik) | `classifyPhases` — seit dem Deck nicht erreichbar | in RR nicht übernommen (E-RR-3); Phasen-Tönung = NP-3; Code bleibt |
| Summe (Akkumulation) | `accumulate` — seit dem Deck nicht erreichbar | in RR nicht übernommen (E-RR-3); Summe kommt in NP-1/NP-2 zurück; Code bleibt |
| Radarsicht (Rand-Abfall) | `buildEdgeFalloffMask` — seit dem Deck nicht erreichbar | in RR nicht übernommen (E-RR-3); Code bleibt |
| Experten-dBZ, Summenfenster | Einstellungsfeld — seit dem Deck nicht erreichbar | in RR nicht übernommen (E-RR-3); Code bleibt |
| Vergleichspunkt | `comparePoint` — im Deck immer `null` (tot) | in RR nicht übernommen (E-RR-3); Code bleibt |
| Punktwahl + Hover-mm/h | `onPick`, `onHover` | **additiv**: `MapView` meldet Klick/Hover im Profil (`onPointPick`, `onPointHover`) |
| Kamera in der URL, Teilen | `onViewChange`, `ShareButton` | `MapView` hat `initialView`/`onViewChange` (vorhanden) |
| Mobile Bottom-Sheet, Tabs | `NowcastDeck` | bleibt (nur die Karte darin wechselt) |

## 4. Plan RR1 (ein Thema, ein Gate)

**Regel: importieren, nicht kopieren** (RL1). Jede Änderung an `MapView.tsx` ist additiv hinter einer Prop; ohne die
Prop ist die Wetterkarte pixelgleich (Gate-Frage 2). `MapView` ist Sperrzone — so klein wie möglich anfassen.

| Schritt | Datei(en) | Was |
|---|---|---|
| RR-a Profil | `src/MapView.tsx`, neu `src/map/mapProfile.ts` | Prop `profile?: 'radar'`. Im Profil: Dock zeigt nur `nowcast, cells, lightning, snow, snowline` (+ `hail`, `lightningfc` nach E-NP-8), keine Modell-Rail, kein Punkt-Panel, kein eigener Zeit-Slider, `FeatureRail active="nowcast"`; Layer-Set kommt von außen (`routeLayers`/`onLayersChange` existieren). Reine Profil-Tabelle in `mapProfile.ts` (headless prüfbar). |
| RR-b Zeit | `src/MapView.tsx`, `src/scalar/precipComposite.ts` | Prop `timeMs?: number` (absolute Gültigkeitszeit). Im Profil führt sie statt `forecastHour`; Zeiten vor der RV-Laufzeit lesen `CompositeSources.rvPast` (neu, optional). `build()` ohne `rvPast` byte-gleich (Verifier mit echtem Frame). Nachbarländer im Rückblick wie heute: nur ab „jetzt" −2,5 min. Zellen im Rückblick: KONRAD-Lauf zur Zeit (nur soweit der Spiegel ihn führt — 12 Slots). |
| RR-c Morphing | `src/MapView.tsx` | im Profil zwei Komposit-Frames mischen (5-%-Quantisierung wie RL1), sonst wie bisher |
| RR-d Einbettung | `src/nowcast/NowcastDeck.tsx`, `src/nowcast/NowcastRadarMap.tsx` | Center = `MapView` (lazy über `router/mapViewLoader.ts`, wie die Wetterkarte), Dock-Toggles → `routeLayers`, Deck-Zeitachse → `timeMs`, Klick/Hover → Punkt-Streifen. `RadarMap` bleibt im Code hinter `?rr=legacy` (Rückfall, Regel 2). |
| RR-e Punkt-Streifen auf Fusion 8 | `src/nowcast/nowcastEngine.ts` | `buildNowcast` lädt wie das Punkt-Panel `import('../pointForecast/cubeSource')` und ruft `getPointForecast({ …, pointSource: 'cube', includeRadarNowcast: true })`; bei Fehler oder `?pf=live` Live-Pfad (Konsole benennt den Rückfall). `assembleNowcast` bleibt rein. Radar-Sampler 0–2 h unverändert. |
| RR-f Schneefallgrenze | `src/nowcast/NowcastRadarMap.tsx` | Deck-Layer `snowline` = `MapView` `snowline`; `snowLineGeoJSON` nicht mehr verdrahtet (Datei bleibt, Löschen = STOPP & FRAGEN). Die Hinweiszeile im Deck nennt die Quelle „ICON-D2-Temperatur + Gelände + ML #2". |
| RR-g Funktionen ohne Gegenstück | — | **E-RR-3 entschieden: nicht nachgebaut** (seit dem Deck unerreichbar, Jans Freigabe); nur die Dokumentation in §3, die Dateien bleiben, `RadarMap` mit seinen Einstellungen unter `?rr=legacy` |
| RR-h Verifier + Belege | `scripts/verify-regenradar-profile.mjs` (neu) + Bestand | s. Gate GRR |

**Nicht angefasst:** Shader (`RainLayer`, `ScalarLayer`, `WindLayer`), buscosun Fusion (Motor, Tabellen, Optionen),
Edge Functions, Crons, Daten-Repo, Retention. Ein Bedarf dort ⇒ STOPP & FRAGEN.

**Budget:** Das Regenradar lädt künftig den `MapView`-Chunk (heute nur Wetterkarte) und den Cube-Chunk
(heute nur Panel/Dashboard). `npm run budget` messen; Anhebung nur mit Notiz (Jan 30.09.: erlaubt).

## 5. Gate GRR

| Frage | Beleg |
|---|---|
| 1 Funktionserhalt | Tabelle §3 Zeile für Zeile: Screenshot oder Verifier je Zeile; Gestrichenes nur mit E-RR-3 |
| 2 Desktop pixelgleich | `/wetterkarte` und `/wetterkarte/nowcast` ohne Profil: Pixel-Diff gegen HEAD (CDP, wie `dashboard:pixeldiff`) |
| 3 Touch-Targets ≥ 44 px | Deck-Toggles, Zeitachse, Play |
| 4 Konsole sauber | Regenradar DE-, AT-, CH-Ort; Fehlerbilder benannt (INCA 0 Frames, jsDelivr 403) |
| 5 Long Tasks | Abspielen 30 s mit Komposit + Zellen + Schnee; Erstaufruf mit Cube-Pfad |
| Daten (neu gefasst 03.10., Jan) | Der Streifen rechnet **exakt dieselbe Kette** wie Punkt-Panel und Dashboard: `getPointForecast` mit `pointSource: 'cube'`, `defaultCubeIo` und denselben URL-Schaltern `?pf` und `?hm`. Der **Vorhersageteil** kommt nur aus buscosun-data. **Live** gehen nur die Messquelle des Landes (BrightSky DE / TAWES AT / SMN CH), AWS Terrarium und der WorldCover-Spiegel — im Mitschnitt (`scripts/regenradar-netcapture.mjs`, Produktions-Build, DE/AT/CH) wird jede davon benannt. Rückfall auf den Live-Pfad nur bei Fehler oder mit `?pf=live`, mit Konsolenmeldung. **Keine Zielzahl für Abrufe.** Frischefenster rzc/RV (§2.5) und INCA-`/metadata` bleiben wie in der Wetterkarte |
| Gelände mobil | Regenradar mit Schneefallgrenze, 390×844 DPR 3: Zahl, Bytes und Dauer der Terrarium-Kacheln (erwartet 90 statt 49) dokumentiert, größte Frame-Lücke dabei |
| Verifier | `typecheck`, `verify:cells`, `verify:snow`, `verify:precip-source`, `verify:radar-sampling`, `verify:layer-geometry`, `verify:radar-fallback`, `verify:routing`, `verify:share`, `verify:point-client`, neu `verify:regenradar-profile` (Profil-Tabelle, `build()` byte-gleich ohne `rvPast`, `timeMs` → Frame-Wahl im Rückblick), `build`, `budget` |
| Real-Device | iPhone 12 Pro: Abspielen, Rückblick, Zellen (WebGL ist in der Emulation nicht repräsentativ) |

### 5.1 Ergebnis Gate GRR (03.10.2026)

Belege: Produktions-Builds (Arbeitsbaum Port 5212, HEAD `07cc7cf` als Worktree-Build Port 5213), headless Chromium über
CDP (`scripts/lib/cdpBrowser.mjs`, Software-WebGL), Rohdaten im Session-Scratchpad.

| Frage | Ergebnis | Beleg |
|---|---|---|
| **1 Funktionserhalt** | **erfüllt**, je Zeile §3: DACH-Komposit (Verifier C1, D6, D7; Bild Profil gegen alte Karte DACH-weit gleich, 03.10. 10:52Z) · Morph (A7/A8, E3; Abspielen gemessen) · Rückblick (D2–D5, B1–B5; im Browser **nicht sichtbar prüfbar** — trockener Tag, der Seed-Weg des Decks ist unverändert) · Zeitachse + Play (Deck unverändert; „Abspielen" gedrückt, 200 Frames in 32 s) · Zellbahnen mit Standortbezug (Banner „KONRAD3D: aktuell keine konvektiven Zellen erkannt"; Steckbrief mangels Zellen nicht sichtbar, Modul RL1 = `verify:cells`) · Schnee Decke/Neuschnee (Repack geladen, Legende, Modus über `profileSnowMode`) · Schneefallgrenze = Wetterkarte (Terrarium z7 × 90, `hsurf-v1.png`, ML #2 gerechnet — JS-Profil `snowT50`) · Blitze (WMS `Accumulated_Flash_Area`) · Punkt-Streifen + PoP + Konvektions-Index (Probe: Klick → „München · 525 m" → „Oberschweinbach · 539 m", 1 Reverse-Geocode, 3 Cube-Dateien, 22 Messabrufe, **0** Live-Vorhersageabrufe) · Hover-mm/h („trocken") · Kamera in der URL (Mausrad → `z=8.5`) · Teilen, Mobile-Sheet/Tabs (Deck unverändert, Bild 390×844). Palette, Deckkraft, Basiskarte, Summe, Radarsicht, Phasen, Experten-dBZ, Vergleichspunkt: **nicht übernommen (E-RR-3, Jans Freigabe)**, alle unter `?rr=legacy` erhalten |
| **2 Desktop pixelgleich** | **erfüllt** — Wetterkarte ohne Profil = HEAD bis auf den animierten LIVE-Punkt der Topbar (Abweichungen nur in x 1232–1243 / y 26–37) | `scripts/regenradar-wk-pixeldiff.mjs` (|ΔRGB| > 12): `/wetterkarte/wind/muenchen` Daten blockiert Desktop 30 px (0,002 %), mobil 0 px; `/wetterkarte` Übersicht Desktop 54 px (0,004 %), mobil 0 px (je 2 Läufe); `/warnungen/muenchen` Desktop 0 px in einem von zwei Läufen, im anderen 1,67 % = ein noch ungezeichneter Kachel-Quadrant der DACH-Maske (Bild `pixw-cur2`); `/wetterkarte/niederschlag/muenchen?l=zellbahnen,blitze,schnee,schneegrenze` **live** Desktop 28 px, mobil 0 px. Gegenprobe HEAD gegen HEAD: Übersicht Desktop 29,26 % in Lauf 1 (DACH-Maske, V-RR-10), 0 px in Lauf 2; `/warnungen` 90 / 46 px (LIVE-Punkt). Datenblockade wirkt in Seite, Workern und Service Worker (erster Lauf ohne Worker-Blockade verworfen, §9.3) |
| **3 Touch-Targets ≥ 44 px** | **erfüllt** — RR fügt mobil kein Bedienelement hinzu: Deck-Toggles, Zeitachse, Play, Tab-Leiste unverändert; Zoom = Deck-Knöpfe `.rm-zoom` (50 px hoch); die MapLibre-Knopfgruppe ist mobil ausgeblendet (`.rm-map .maplibregl-ctrl-group`); Marker ziehbar wie die alte Karte | `nowcastMobile.css:120/163`, Bild `g-de-mobile.png` |
| **4 Konsole sauber** | **erfüllt** — DE/AT/CH, `?pf=live`, `?rr=legacy`: keine App-Fehler, keine Ausnahme; übrig nur Chrome-Netzzeilen „Failed to load resource 404" für den neuesten, noch nicht gespiegelten Slot (`rv|inca|rzc/<stamp>/meta.json`, Stempel-Sonde, wie in Wetterkarte und Dashboard) und Headless-WebGL-Hinweise. Benannte Fehlerbilder: INCA 0 Frames ⇒ Komposit ohne AT (Lader-Warnung), jsDelivr 403 ⇒ raw-Hedge (NL-1). Im Dev-Modus war der StrictMode-Absturz D8 der einzige Fehler — behoben im Profil | Mitschnitte `g-*.json` (Konsole), Probe Interaktion |
| **5 Long Tasks > 200 ms** | **bedingt** — Ersatzmaß größte rAF-Lücke (headless kennt keine Long Tasks, Software-WebGL ⇒ zu hoch). Laden Voreinstellung DE 0,90 s · AT 0,60 s · CH 0,58 s. **Mit Schneefallgrenze 5,3 s** (mobil 5,7–5,8 s) = die Iso-Kontur ML #2 der Wetterkarte (`climaField` `x` 3 023 ms + `snowT50` 1 743 ms Selbstzeit); die Wetterkarte mit denselben Layern 5,65 s, die alte Karte 0,65 s ⇒ geerbt, nicht neu (V-RR-15). Abspielen 30 s: Desktop höchstens 200 ms (0 Frames > 200 ms; alte Karte 283 ms, 136/136 > 200 ms), mit Schneefallgrenze 317 ms (9/191) dank Wiederverwendung je Temperatur-Frame, mobil DPR 3 ohne Kappung 483 ms (alte Karte 550 ms) | `--frames`, `--jsprofile`, `--play` in `regenradar-netcapture.mjs`; `perf/p-*.txt` |
| **Daten** (neu gefasst) | **erfüllt** — dieselbe Kette wie Panel/Dashboard (`pointSource: 'cube'`, `defaultCubeIo`, `?pf`, `?hm`); Vorhersageteil nur aus buscosun-data; live nur Messquelle des Landes, Terrarium, WorldCover, je benannt (§2.7); Rückfall mit Konsolenmeldung (`?pf=live` geprüft; Fehlerrückfall per Code + Verifier E5) | §2.7, Verifier E5 |
| **Gelände mobil** | 390×844 DPR 3, alle Deck-Layer (Dev-Server, ohne Service Worker ⇒ Bytes lesbar): **90 Kacheln z7, 5,28 MiB, Median 191 ms je Kachel, langsamste 4,46 s, 0 Fehler**; alte Karte 49 Kacheln / 2,84 MiB (RR0, Desktop). Größte Frame-Lücke dabei 5,73 s (die ML-#2-Rechnung, Zeile 5) | `perf/m-dev-snowline.json` |
| **Verifier** | `typecheck` 0 · `verify:regenradar-profile` **34/34** (neu) · `verify:precip-source` grün · `verify:radar-sampling` grün · `verify:layer-geometry` grün · `verify:snow` grün · `verify:cells` grün · `verify:radar-fallback` 22/22 · `verify:radar-runs` 56/56 · `verify:radar-repack` 55/55 (+1 ⊘; im Sammellauf B2c Geschwindigkeitsvergleich unter Last rot, allein grün) · `verify:routing` 249/249 · `verify:share` 528/528 · `verify:layer-erstbild` 38/38 · `verify:dashboard` 80/80 · `verify:point-client` 170/171 — (10s), **an HEAD ebenso** (V-EX-13) · `verify:dashboard-switch` 49/50 — (B) „0 WebGL-Draws hinter dem Dashboard", **an HEAD ebenso** (3 276 Draws in 3 s; Voreinstellung `127.0.0.1:5211` erreicht den nur auf `localhost` hörenden Dev-Server nicht ⇒ `--base=http://localhost:5212`) · `build` grün (Routing 249/249) · `budget`: eagerJs 108,6 / 108,7, eagerCss 2,4, largestChunk 278,4, **totalJs 1 521,9 / 1 523** (angehoben mit Notiz, RR +3,4 KB lazy) | Logs `verify/*.log` |
| **Real-Device** | **offen — Jans Gate:** iPhone 12 Pro (oder Android über scrcpy): Abspielen, Rückblick (Schritt zurück), Zellbahnen, Schneefallgrenze einschalten (ML-#2-Block spürbar?), Bildrate gegen `?rr=legacy` | MANUELLE-SCHRITTE §33 |

**Verdikt GRR:** bestanden mit einer benannten Einschränkung — Frage 5 ist nur mit der Schneefallgrenze rot, und dort
ist es die unveränderte Wetterkarten-Logik (Auftrag „dieselbe Logik"); Abhilfe V-RR-15 ist Jans Entscheidung.

## 6. Entscheidungen (Jan, 03.10.2026 — entschieden)

- **E-RR-1** Karte: ~~`MapView` eingebettet mit Profil (Empfehlung, = E-NP-1) oder `RadarMap` behalten und nur die Logik
  angleichen.~~ **Entschieden: `MapView`, eingebettet mit Niederschlags-Profil (wie im Plan).**
- **E-RR-2** Basiskarte: ~~positron wie die Wetterkarte, Satellit/Topo als Profil-Option oder nur positron.~~
  **Entschieden: vorerst nur positron.** Der Basiskarten-Umschalter ist heute ohnehin nicht erreichbar.
- **E-RR-3** Funktionen ohne `MapView`-Gegenstück: **Entschieden: Palette, Deckkraft, Basiskarte, Summe, Radarsicht,
  Phasen-Heuristik und Vergleichspunkt werden in RR nicht nachgebaut** — sie sind im heutigen Deck nicht bedienbar (nur
  über einen alten `localStorage`-Stand, `comparePoint` immer `null`). Die Dateien bleiben, nichts wird gelöscht.
  Dokumentiert als „seit dem Deck nicht erreichbar, in RR nicht übernommen" (§3). **Jans ausdrückliche Freigabe im Sinne
  des Funktionserhalts.** Summe und eine farbsichere Palette kommen im Konzept in NP-1/NP-2 zurück.
- **Rahmen (Jan, 03.10.):** Maßstab ist buscosun Fusion 8 wie in `CLAUDE.md` definiert (Stufe `fs`,
  `FUSION7_ANCHOR_WIND_KM`, `FUSION8_NOWCAST_HOUR_MEAN`). An buscosun Fusion ändert RR nichts: keine Optionen, keine
  Tabellen, keine Kette. Kein Spiegel für Messungen.

## 7. V-Katalog

- **V-RR-1** Blitze in beiden Karten ohne Zeitachse (`Accumulated_Flash_Area`, TIME nicht bestätigt) — `docs/DATA_SOURCES.md`
  §7 empfiehlt `dwd:Blitzdichte` (DE, WMS-T) + MTG-LI `li_afa` (DACH, WMS-T). Mehrwert: Blitze laufen mit dem Slider.
  Skizze: Spiegel in buscosun-data (Konzept NP-0) oder zuerst WMS-T mit `TIME` je Frame.
- **V-RR-2** Rückblick nur 45 min (Retention 12 Slots, `audit/radar-datenrepo.md`). Mehrwert: Zellen 2 h zurück verfolgen.
  Skizze: Retention 24 nur für `f000.png` + `cells.json` (Konzept NP-0, Jans Gate).
- **V-RR-3** Radar v1 sättigt bei ≥ 19,96 mm/h und Byte 0 = trocken **oder** keine Abdeckung (`point/nowcastFormat.ts`).
  Mehrwert: Starkregen-Kerne und ehrliche Radarlücken. Skizze: `radar/img/v2` (Konzept NP-5a), v1 unverändert.
- **V-RR-4** ~~Der Punkt-Streifen fragt heute bis zu fünf Fremd-Origins je Ort; nach RR-e liest er `point/` aus dem
  Daten-Repo. Mehrwert: weniger Fremdabrufe, dieselben Zahlen wie Panel und Dashboard.~~ **Überschätzt (korrigiert
  03.10.):** buscosun Fusion 8 holt die Messungen selbst live (§2.4). München: Live-Pfad 22 gegen Cube-Pfad 22
  BrightSky-Abrufe (Jans Vorlage nannte 28 gegen 22 — die 28 war meine Dev-Server-Zählung mit StrictMode-Doppelabrufen,
  §2.3); Zürich 81 → 13 SMN; Innsbruck 7 → 2 GeoSphere. Mehrwert: Der Vorhersageteil kommt aus einer Hand, Streifen,
  Panel und Dashboard zeigen dieselben Zahlen — nicht weniger Abrufe.
- **V-RR-5** Frischefenster rzc/RV (§2.5): Kurz nach jedem Slot holen beide Karten das Bild direkt von der Quelle
  (rzc STAC + HDF5, RV Tar oder `/_dwd_opendata`). Mehrwert: kürzere Kaltaufrufe und weniger Fremdabrufe, ohne Frische zu
  verlieren. Skizze: Warm-up im Spiegel-Job (E-NL-2, `audit/niederschlag-ladezeit.md`), damit der neue Slot schneller am
  Edge liegt; Daten-Repo/Cron = Jans Gate. In RR nicht angefasst.
- **V-RR-6** Die Einstellungen des alten Kartenpanels (Palette, Deckkraft, Basiskarte, Summe, Radarsicht, Phasen,
  Experten-dBZ, Vergleichspunkt) waren seit dem Command-Deck unerreichbar, ohne dass es auffiel. Mehrwert: kein toter Code
  mit scheinbarer Funktion. Skizze: Summe und farbsichere Palette in NP-1/NP-2 neu (im Profil, kein Shader-Eingriff);
  danach `RadarMap`-Einstellungen mit Jans Freigabe zurückbauen.
- **V-RR-7** INCA in der Wetterkarte einmal als 722-KB-NetCDF direkt statt 13 Spiegel-PNG (§1.1 f): der Stempelabruf
  GeoSphere `/metadata` läuft unter derselben CDN-Frist wie die Bilder und wurde abgebrochen. Mehrwert: kein
  Zehnfach-Download, wenn GeoSphere langsam antwortet. Skizze: eigene Frist für `/metadata` oder gerechneter Stempel als
  zweiter Bild-Versuch **vor** dem NetCDF-Weg (Frische prüfen). Erst messen (wie oft?).
- **V-RR-8** KONRAD3D in der Wetterkarte: der neueste Slot steht noch nicht im Spiegel ⇒ 404 auf `cells.json` und auf
  das Tar-XML, dann älterer Slot (Konsole zeigt zwei „Failed to load resource 404"). Nach RR erbt das Regenradar diesen
  Weg. Mehrwert: saubere Konsole, ein Abruf weniger. Skizze: Stempel aus dem Spiegel-Index statt Raten (wie RV-`meta.json`).
  Im Gate (§5.1) holte das Regenradar KONRAD3D in Innsbruck zweimal über das Listing + `/_dwd_opendata` (Netlify) statt
  aus dem Spiegel — derselbe geteilte Lader, zeitabhängig.
- **V-RR-9** `MapView` räumt beim Abbau die Karte ab, bevor der Zellbahnen-Effekt seine Quelle leert ⇒ `getSource` auf
  entfernter Karte wirft. In RR nur im Profil abgesichert (D8). **In der Wetterkarte ein Produktionsfehler, schon an HEAD
  `07cc7cf`:** Probe 03.10. (Produktions-Build, `/wetterkarte/niederschlag/muenchen?l=zellbahnen`, 20 s, dann Rail →
  „Regenradar") ⇒ `TypeError: Cannot read properties of undefined (reading 'getSource')` und „React Router caught the
  following error during render" — an HEAD und am Arbeitsbaum gleich (die Wetterkarte ist ohne Profil unverändert); Dev
  zusätzlich beim Mount mit `?l=zellbahnen` (StrictMode). **Hohe Priorität.** Mehrwert: kein Absturz beim Verlassen der
  Karte mit Zellbahnen. Skizze: dieselbe Zeile ohne Profil-Bedingung (`if (mapRef.current === map)`), Pixel unverändert;
  dasselbe Muster prüfen für Hagel (`HAIL_DE_SOURCE_ID`, Zeilen der Bereinigung) und Warnungen (`WARN_SOURCE_ID`) —
  Jans Freigabe, weil es `MapView` ohne neue Prop ändert.
  **Behoben 03.10. (Jans Freigabe „ja fix es"):** Die Absicherung `mapRef.current === map` steht jetzt ohne
  Profil-Bedingung an allen vier Bereinigungen, die die Karte anfassen: Zellbahnen (`CELLS_SOURCE_ID`), Hagel DE
  (`HAIL_DE_SOURCE_ID`), Hagel CH (`getLayer`/`setLayoutProperty` auf `HAIL_CH_LAYER_ID`) und Warnungen
  (`WARN_SOURCE_ID`). Die übrigen Bereinigungen rufen nur `map.off`, das nach `remove()` unbedenklich ist. Solange die
  Karte lebt, ist die Bedingung immer wahr ⇒ Abschalten eines Layers leert die Quelle wie bisher (D-04), Pixel
  unverändert. **Beleg** (Produktions-Builds über `vite preview`, HEAD `07cc7cf` im Worktree gegen den Arbeitsbaum, je
  `/wetterkarte/niederschlag/muenchen?l=…`, 20 s, dann Klick auf den Link `/regenradar`; Sonde
  `vrr9-probe.mjs` im Session-Scratchpad): HEAD **4 von 4 Abstürze** — Zellbahnen, Warnungen je `getSource`; Hagel
  `getSource` **und** `getLayer` (Hagel und Warnungen waren also ebenfalls betroffen); alle drei zusammen 4 Fehler +
  4 „React Router caught". Arbeitsbaum: **0 von 4**, keine einzige Konsolenmeldung vom Typ Fehler nach dem Verlassen.
  `verify:regenradar-profile` 35/35 (neue Prüfung E3b nagelt die vier Absicherungen fest), `verify:cells`,
  `verify:hail`, `verify:warnings` grün, `verify:routing` 249/249, `verify:share` 528/528, `verify:dashboard-switch`
  49/50 an HEAD und am Fix gleich (Prüfung (B), unabhängig), typecheck 0, Build 249/249, Budget eingehalten.
- **V-RR-10** Unter fehlschlagenden Abrufen erscheint die DACH-Maske (Sandfläche außerhalb DE/AT/CH) nicht immer:
  `initOverlays` hängt am MapLibre-`load`-Ereignis. Gemessen im Pixel-Diff: HEAD gegen HEAD 29,3 % Abweichung in einem von
  zwei Läufen. Mehrwert: die Karte sieht bei schlechtem Netz nicht „kontinental" aus. Skizze: Maske auch auf `styledata`
  nachziehen (Muster `safeApply`).
- **V-RR-11** Die alte Radarkarte ließ am „jetzt"-Frame die Nachbarländer weg: sie verglich die Frame-Zeit mit der Uhr,
  und die RV-Analyse ist 5–10 min alt. Im Profil behoben (D2: Rückblick ab „neueste Messung − 2,5 min"). Mehrwert schon
  geliefert; unter `?rr=legacy` bleibt das alte Verhalten.
- **V-RR-12** Zellbahnen im Rückblick zeigen den aktuellen KONRAD-Lauf (beide Karten). Mehrwert: Zellen wandern mit dem
  Rückblick. Skizze: `cells.json` des Slots zur Zeit lesen (Spiegel führt 12 Slots), nur im Rückblick, sonst wie heute.
- **V-RR-13** Beide Karten laden beim Einschalten des Niederschlags den ICON-D2-Niederschlag (Repack `precip-*`), zeichnen
  ihn aber seit N1 nicht (das Komposit läuft ohne `d2`; nur der Vertrauens-Schleier liest ihn als Rückfall). Mehrwert:
  weniger Bytes je Aufruf. Skizze: `installIconD2` nur mit aktivem Schleier oder Flow-Nowcast — Wetterkarte und Regenradar
  zugleich, eigene Messung.
- **V-RR-14** `regenradar.html` lädt `MapView` nicht vor (`verify:routing`: „lädt NowcastRoute und maplibre vor, nicht
  MapView") — die Karte kommt eine Chunk-Runde nach dem Deck. Mehrwert: schnelleres Erstbild. Skizze: `mapFirst(false)`
  auch für `/regenradar` (Router-Loader) bzw. Modulepreload in der Shell; misst `verify:layer-erstbild`.
- **V-RR-15** Die Schneefallgrenze der Wetterkarte (ML #2, `buildSnowLine` → `ClimaField.snowT50` je Pixel) rechnet
  synchron im Hauptthread: gemessen headless 4,8–4,9 s Selbstzeit je Rechnung, größte Frame-Lücke 5,3–5,8 s — in der
  Wetterkarte (5,65 s) wie im Regenradar-Profil; die alte Radarkarte (Punktwert als Höhenlinie) 0,65 s. Im Profil läuft sie
  nur noch je neuem Temperatur-Frame (D10, Abspielen danach ≤ 317 ms), in der Wetterkarte bei jeder
  Slider-Bewegung. Mehrwert: kein Einfrieren beim Einschalten der Schneefallgrenze, flüssiger Slider. Skizze: Rechnung in
  einen Worker (Muster `precipIndexWorker`; Eingaben sind Typed Arrays + die Stationstabelle), Ergebnis-GeoJSON zurück;
  danach in beiden Karten nur je Temperatur-Frame — `MapView` ohne neue Prop ⇒ Jans Freigabe.

## 8. Nicht Teil von RR (→ Konzept-Phasen)

Zeitachse bis 14 Tage, Prognose-Stil der Karte, Regenfahrplan, Phasen-Tönung, Schneegrenze-Gürtel, 3D-Bühne,
Blitz-Spiegel, Radar v2, HymecNG — `audit/niederschlagsplattform-konzept.md` §Phasen.

## 9. Umsetzung RR1 (03.10.2026, uncommitted)

### 9.1 Was gebaut ist

| Schritt | Datei(en) | Umsetzung |
|---|---|---|
| RR-a Profil | `src/map/mapProfile.ts` (neu, rein), `src/MapView.tsx` | Prop `profile: 'radar'` mit der Tabelle `RADAR_PROFILE`: eigener Render-Zweig vor `embedded`, der **nur** den Kartencontainer rendert (keine Topbar, Rail, Dock, Zeit-Deck, Punkt-Panel). Layer über `routeLayers`/`initialActive` aus `radarProfileLayers()` (precip → `nowcast`, `cells`, `lightning`, `snow`, `snowline`; alles andere fällt weg). Start am Ort mit Zoom 8 (wie die alte Karte, Kamera aus der URL gewinnt), Marker ziehbar, Klick oder Zug → `onPointPick`, Zeiger → `onPointHover`, Zoom- und Standortknopf unten rechts, kompakte Attribution, keine Maßstabsleiste, keine Stadt-Temperaturen, kein Vorab-Abruf fremder Layer, `onMapReady` für die Zoom-Knöpfe des Decks |
| RR-b Zeit | `MapView.tsx`, `src/scalar/precipComposite.ts`, `mapProfile.ts` | `timeMs` (absolute Gültigkeitszeit) → `forecastHour` = Stunden ab jetzt für Schnee, Schneefallgrenze und Zellen-Horizont. Niederschlag über `radarProfileComposite()`: RV nach **Gültigkeitszeit** (neues Feld `CompositeSources.rvPast`; mit dem Feld wählt `build()` unter Rückblick-Analysen und Laufframes den nächsten Frame ≤ 5 min, ohne das Feld byte-gleich zu HEAD), INCA nach Vorlauf ab jetzt wie in der Wetterkarte, im Rückblick nur Messungen (RV-Analysen, CH-rzc aus dem Sitzungs-Cache, AT nichts) |
| RR-c Morph | `MapView.tsx` | `timeBracket` (zwei Nachbar-Radarzeiten des Stacks + Anteil) → zwei Komposite, gemischt in 5-%-Schritten (`morphStep`, `lerpValues`); Frame-Speicher je Gültigkeitszeit (6 Einträge, geleert bei neuen Quelldaten oder neuem Rückblick); EIN Mesh für alle Profil-Frames |
| RR-d Einbettung | `src/nowcast/NowcastRadarMap.tsx`, `src/radar/radar.css` | Die Bühne ist `MapView` (eigener Lazy-Chunk über `router/mapViewLoader.ts`, wie die Kartenrouten). Der Radar-Stack des Decks liefert weiter Zeitachse, Punkt-Streifen und PoP — und jetzt der Karte Zeit, Morph und Rückblick (`radarPast`). Hover-mm/h rechnet das Deck wie die alte Karte aus dem Landes-Frame (`sampleRadarPoint`). Nachbarquellen, Schnee und Gelände-DEM lädt das Deck nur noch für die alte Karte (`MapView` lädt selbst, dieselben Lader). `?rr=legacy` = alte Karte (Regel 2); dieselbe greift als Rückfall, wenn der Chunk nicht lädt (Konsolenmeldung) |
| RR-e Streifen | `src/nowcast/nowcastEngine.ts`, `nowcastModel.ts`, `nowcastView.ts`, `NowcastPage.tsx`, `NowcastDeck.tsx` | `buildNowcast` lädt `import('../pointForecast/cubeSource')` und ruft `getPointForecast({ …, hours: 8, pointSource: 'cube', includeRadarNowcast: true, onUpdate })` — die Kette von Panel und Dashboard (`defaultCubeIo`, `?hm`, `?st`, `?inca`, `?cg`). Rückfall Live-Pfad (derselbe Aufruf wie vor RR) bei Fehler oder `?pf=live`, jeweils mit Konsolenmeldung. Die Nachlieferung (`onUpdate`, Messungs-Anker) ersetzt die erste Antwort wie im Panel. `nwpSource` wird von `assembleNowcast` nur durchgereicht (rein). Beschriftungen „buscosun Fusion (Punkt-Cube)" statt „ICON-D2 (2,2 km)" in Datenlage, Quellenblock, Fußzeile, Diagramm, Quellen-Pille, Idle-Seite; der Rückfall behält den alten Text |
| RR-f Schneefallgrenze | `NowcastRadarMap.tsx` | Deck-Layer `snowline` = Wetterkarten-`snowline` (ICON-D2-Temperatur + Gelände + ML #2, räumlich). `snowLineGeoJSON` läuft nur noch unter `?rr=legacy` (Datei bleibt). Die Hinweiszeile nennt die Quelle und den Punktwert |
| RR-g | — | E-RR-3: nichts nachgebaut (seit dem Deck nicht erreichbar), Dateien bleiben |
| RR-h | `scripts/verify-regenradar-profile.mjs` + `npm run verify:regenradar-profile`, `scripts/regenradar-wk-pixeldiff.mjs`, `scripts/regenradar-netcapture.mjs` (`--shot`, `--frames`, `--play`, `--jsprofile`) | Gate-Belege §5.1 |

**Nicht angefasst:** Shader (`RainLayer`, `ScalarLayer`, `WindLayer`), buscosun Fusion (`src/pointForecast/**`, `src/point/**`:
`git diff HEAD` leer, Verifier E7/E8), Daten-Repo, Edge Functions, Crons, Router, Abhängigkeiten.

### 9.2 Entscheidungen der Phase (ohne Jan, mit Begründung)

| # | Entscheidung | Begründung |
|---|---|---|
| D1 | Im Profil keine Stadt-Temperaturen; das t_2m-Gitter lädt nur, solange `snowline` aktiv ist | Das Regenradar zeigt Niederschlag (Auftrag). Mit Stadt-Temperaturen lüde jede Regenradar-Sitzung Temperatur-Repack + 90 Terrarium-Kacheln + den Höhenbild-Bau, auch ohne Schneefallgrenze |
| D2 | Zeitbezug: RV nach Gültigkeitszeit, INCA nach Vorlauf ab jetzt, Rückblick nur Messungen; der „jetzt"-Frame zeigt alle drei Länder | Die alte Karte rechnete die Nachbarländer gegen die Uhr und ließ sie am „jetzt"-Frame weg (der RV-Lauf ist 5–10 min alt ⇒ „Vergangenheit") — Befund V-RR-11. Gemessen gleich der Wetterkarte bei Stunde 0 (Verifier D6) |
| D3 | Zellbahnen im Rückblick: der aktuelle KONRAD-Lauf wie in der alten Karte und der Wetterkarte | „KONRAD-Lauf zur Zeit" (Plan RR-b) wäre neues Verhalten mit eigenem Abruf je Slot; ohne Gegenstück in beiden Karten ⇒ V-RR-12 |
| D4 | Kompakte Attribution, keine Maßstabsleiste, Zoom- und Standortknopf | So hatte es die alte Karte; die Legende des Decks liegt unten links (Überdeckung im ersten Screenshot) |
| D5 | Legende und Streifen im Profil mit Palette „classic" | Sie ist `precipRainRamp` der Wetterkarte; die Palettenwahl war unerreichbar (E-RR-3) |
| D6 | Hover-mm/h aus dem Landes-Frame des Stacks | Exakt die Rechnung der alten Karte, ins Deck verlegt — `MapView` meldet nur die Position |
| D7 | Globale MapLibre-Stile von `MapView.css` (Attribution, Knopfgruppe in Creme) wirken jetzt auch im Regenradar | Dieselbe Karte, dieselbe Optik; vorher galt das nur nach einem Besuch der Wetterkarte |
| D8 | Zellbahnen-Bereinigung abgesichert (`mapRef.current === map`) — zuerst nur im Profil, seit dem V-RR-9-Fix (03.10., Jans Freigabe) überall und auch für Hagel DE/CH und Warnungen | Regel „MapView nur hinter neuen Props"; die Ausweitung auf die Wetterkarte ist V-RR-9 |
| D9 | ICON-D2-Niederschlag lädt im Profil wie in der Wetterkarte mit, obwohl beide Karten ihn seit N1 nicht zeichnen | „dieselbe Logik"; Rückbau in beiden Karten zugleich ⇒ V-RR-13 |
| D10 | Die Schneefallgrenze rechnet im Profil nur neu, wenn sich der Temperatur-Frame ändert (Referenzvergleich Frame + Höhenbild + Klimafeld) | Gemessen: jede Rechnung ≈ 4,8 s Hauptthread; beim Abspielen ändert sich die Zeit 2,5-mal je Sekunde, das stündliche Feld fast nie ⇒ Abspielen mit Schneefallgrenze ≤ 317 ms statt wiederholter 5-s-Blöcke. Ergebnis gleich (dieselbe Funktion, dieselben Eingaben) |
| D11 | Mobile Ecksteuerungen im Profil am Bühnenrand (Gegenregel in `radar.css`, gleiche Media Query wie die aufgehobene Regel aus `MapView.css`) | Die Wetterkarten-Regel hebt ALLE MapLibre-Ecken mobil um 152 px über ihr Sheet; im Regenradar stand die Attribution damit mitten auf der Karte (Bild `g-de-mobile`) |

### 9.3 Fallen dieser Phase

- **StrictMode-Abbau mit aktiven Zellbahnen:** Der Mount-Effekt räumt die Karte vor dem Zellbahnen-Effekt ab ⇒ `getSource`
  auf entfernter Karte ⇒ React-Router-Fehlerseite (Dev). Im Profil sind die Zellbahnen ab dem Mount an — deshalb sofort
  sichtbar (D8, V-RR-9).
- **Pixel-Diff mit blockierten Daten:** Eine Blockade nur auf der Seite lässt Worker- und Service-Worker-Abrufe durch
  (erster Lauf 5–69 % „Abweichung" = Ankunftszeit, nicht Code). Auch mit Blockade überall erscheint die DACH-Maske unter
  fehlschlagenden Abrufen nicht immer — HEAD gegen HEAD wich im selben Szenario um 29,3 % ab (Gegenprobe, V-RR-10).
- **Shell-Fallen (CLAUDE.md, wieder getroffen):** Backticks in `node -e "…"` werden zur Kommandosubstitution; `cat > datei`
  ohne Quelle hängt den Bash-Kanal; ein mit TaskStop beendeter `npx vite preview` ließ seinen Node-Prozess am Port.
