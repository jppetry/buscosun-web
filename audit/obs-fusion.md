# Phase OF — buscosun Fusion liest Stationsmessungen aus `buscosun-data/obs/v1` (08.10.2026)

> Auftrag: `prompt-obs-fusion.md` (Jan, 08.10.2026, am Ende der Phase OB). Auto-Modus: Jan sieht nicht zu; jede Entscheidung,
> die sonst seine wäre, steht als `A-OF-n` in §4 und in `MANUELLE-SCHRITTE.md` §48. Dieses Dokument ist Diagnose, Plan,
> Protokoll und Gate-Beleg der Phase (Diagnose-First, `CLAUDE.md`). Alle Zahlen tragen ihre Menge und ihren Zeitpunkt.
> Code dieser Phase liegt auf dem lokalen Branch `fusion-12` (Worktree `C:\dev\buscosun-web-wt\fusion-12`, §4 A-OF-3);
> nichts auf `main`, nichts gepusht.

## 0 Zeitprotokoll

| Zeit (UTC) | Was |
|---|---|
| 07:30 | Start. Orientierung: `CLAUDE.md`, `audit/stationsmessungen.md`, Register `fusionRelease.ts` (auf `main` Stand 9; Zweige `fusion-10`/`fusion-11` mit 10/11 als Kandidaten), `prompt-fusion11.md`, Prüfstand (README, Skill, `run.mjs`, `replay.mjs`, `wahrheit/*`), Motor-Ankerpfad (`cubeSource.ts`, `anchor.ts`, `sampleSources.ts`, `brightSkyCurrent.ts`, `geosphereTawes.ts`, `meteoSwissSmn.ts`, `dachStations.ts`), Archiv-Adapter, Spiegel `obs-mirror.mjs` |
| 07:31–07:40 | `obs/v1` live gelesen (`status.json`, `stations.json`, `latest.json` über raw.githubusercontent; §1.3), Größen und TTFB am CDN gemessen (§1.5) |
| 07:56 | Latenz-Poller BrightSky ↔ `obs/v1` gestartet (12 DE-Synop-Stationen, alle 5 min, 150 min; §1.4) |
| 07:55 | Prüfstand-Status gelesen (Champion `fusion-9`, 24 Archivtage 14.09.–07.10., W1 1 225 Tage); Archiv-Klon `git pull --ff-only` (Slot 07.10. dazu) |
| 07:58–08:01 | Branch `fusion-12` von `main` im Hauptarbeitsbaum angelegt, Merge `fusion-11` begonnen — **Kollision:** eine parallele Seewetter-Sitzung schreibt gerade in denselben Arbeitsbaum (`scripts/sea/build-spots.mjs` 09:59 Ortszeit, neue Dateien `shoreNormal.mjs`, `seaVerdicts.ts`); Merge abgebrochen, `main` wiederhergestellt, Branch gelöscht; fremde Änderungen unberührt (A-OF-3) |
| 08:03–08:12 | Worktree `C:\dev\buscosun-web-wt\fusion-12` (Branch `fusion-12` von `main`), Merge `fusion-11` mit drei Konflikten aufgelöst (§4 A-OF-1), `npm run typecheck` 0 Fehler, Merge-Commit |

## 1 Diagnose (OF-0)

### 1.1 Inventar — jeder Abruf aktueller Stationsmessungen in `src/`

Gefunden mit `grep` über `current_weather|brightsky|fetchNearestStationObs|tawes|meteoswiss|dachStations` (61 Dateien nennen eines
der Wörter; Messabrufe sind nur die folgenden — der Rest sind Texte, Quellenlisten, Vorhersagen):

| # | Abrufer (Datei, Funktion) | Quelle, Anfragen je Aufruf | Verbraucher | Was ankommt |
|---|---|---|---|---|
| 1 | `src/sources/brightSkyCurrent.ts` `fetchBrightSkyCurrentGrid` | BrightSky `/current_weather?lat&lon` je Sondenpunkt: Cube-/Live-Pfad **5 × 4 = 20 Anfragen** (Fenster ±1,2° × ±1,0°), Rasterfusion der Karte **10 × 8 = 80** (gedeckelt auf die DWD-Hülle), pMap 3, 2 Versuche | `fetchNearestStationObs` (DE), `loadFusedForecast.ts` | je Antwort EINE Station (die nächste mit Daten), `fallback_source_ids` zugeordnet (V-FI-11); T °C, Wind **km/h**, Böe km/h, RH %, Niederschlag mm/10 min, Stempel |
| 2 | `brightSkyCurrent.ts` `fetchBrightSkyCurrentAt` | `/current_weather?wmo_station_id` (Station des Punkts, AX-1) + `?lat&lon` — **2 Anfragen** | `brightSkyAtPoint` (Cube-Pfad DE, nur mit `near`) | wie 1, `byStation` |
| 3 | `src/sources/geosphereTawes.ts` `fetchTawesCurrentGrid` | GeoSphere `station/current/tawes-v1-10min` — **1 Anfrage** (bis 200 Kennungen, mit `near` 60 nächste) | `fetchNearestStationObs` (AT), `loadFusedForecast.ts`, `dachStations.ts` | TL, RF, FF, DD, FFX, RR; **kein Stempel** (Punkt gilt als „jetzt“), kein Td gelesen |
| 4 | `geosphereTawes.ts` `fetchTawesHistory` | `station/historical/tawes-v1-10min` — 1 Anfrage | Live-Pfad (`fetchStationHistory`, AT) | Stundenwerte 6 h |
| 5 | `src/sources/meteoSwissSmn.ts` `fetchSmnCurrentGrid` | MeteoSchweiz `ogd-smn/<abbr>/…_t_now.csv` — **eine Anfrage je Station** (mit `near` 12, sonst 80, Karte 200), pMap 6 | `fetchNearestStationObs` (CH), `loadFusedForecast.ts`, `dachStations.ts` | letzte Zeile: t, ff, dd (m/s), ffx, rh, rr; **kein Stempel**, `tde200s0` (Td) steht in der Datei, wird nicht gelesen |
| 6 | `meteoSwissSmn.ts` `fetchSmnHistory` | dieselben Dateien (Cache 5 min) | Live-Pfad (CH) | Stundenwerte |
| 7 | `src/pointForecast/sampleSources.ts` `fetchNearestStationObs` | orchestriert 1–5 je Land, **6 nächste** (mit `near` dedupliziert, gezielte Antwort zuerst) | **Cube-Pfad** `fetchCubeObs` (`cubeSource.ts`, + INCA hinter `incaAnchor`), **Live-Pfad** `pointForecast.ts` (+ `fetchStationHistory` AT/CH 6 h) | `NearestStationObs` → `CubeObs` (`cubeObsOf`: Stempel = `point.timestamp` ?? `nowMs`) |
| 8 | `src/sources/dachStations.ts` `fetchDachStations` | BrightSky `/sources?lat&lon&max_dist=500000` **2 Anfragen** (Katalog, `observation_type: current`, ≈ 650) + TAWES + SMN 200 | `MapView.tsx` Stationen-Layer | DE ohne Werte (lazy), AT/CH mit Werten |
| 9 | `dachStations.ts` `fetchDwdStationLive` | `/current_weather?dwd_station_id` **je Klick** | `MapView.tsx` Popup | T, Wind, Richtung, Niederschlag, Bewölkung |
| 10 | `src/pointForecast/pointForecast.ts` (Live-Pfad) `brightSkyHistoryToSamples` | Messhistorie DE aus der **BrightSky-`/weather`-Antwort** (Vorhersageabruf; vergangene Stunden = Messungen der Station) | Anker-Historie des Live-Pfads (DE) | Stundenpaare 6 h |

Keine Messabrufe, nur genannt (nicht Teil der Phase): BrightSky-**Vorhersagen** (`src/sources/brightSkyForecast.ts` Raster,
`src/wind/brightSkySource.ts` Wind, `fetchBrightSkyPointForecast` in `sampleSources.ts` = MOSMIX über BrightSky — #10 hängt an
diesem Abruf), INCA-Analyse (`fetchIncaAnalysisObs`, Analyse statt Messung, AT, aus), Straßenstationen SWIS (`src/road/`,
eigenes Produkt), POI-Küstenstationen der Seewetter-Spots (Producer, Daten-Repo), Dashboard (`src/dashboard/model/build.ts`
holt nichts selbst, liest den Cube-Pfad; nennt BrightSky/TAWES/SMN nur als Herkunftswörter in `FOOTER` und `nets`).

### 1.2 `obs/v1` gegen das, was die Abrufer heute liefern (geprüft 08.10. 07:31–07:56 UTC)

**Form** (Stand `status.json` 07:31 UTC): 3 123 Stationen, 3 044 mit Werten (DE 2 273, AT 284, CH 484, LI 3); 2 006 mit
10-min-Stempel, 1 038 nur Tageswert; 887 mit T, 884 mit Td, 888 mit RH, 698 mit Wind/Böe, 1 863 mit `rr` (1 862 `rr1h`
vollständig). `stations.json` (Liste: id `de:00096`/`at:11001`/`ch:ABO`, name, lat, lon, elev, country, region, networks,
vars), `latest.json` (je id: `t` Stempel, `src`, `v {t, td, rh, ps, p, ff, dd, fx, rr, sd, gr, snow}`, `older`, `rr1h {mm, n, of,
complete}`, `rr24h`, `day`), Einheiten fest je Größe (m/s, °C, %, mm je Intervall).

| Punkt | heute (Abrufer) | `obs/v1` | Folge für OF-1 (Gate „gleiche Station, gleicher Stempel ⇒ byte-gleich") |
|---|---|---|---|
| DE Station | BrightSky wählt je Sonde die nächste Station **mit Daten**; Kennung = WMO (`wmo_station_id`, = MOSMIX-Katalog) oder DWD-id | DWD-id (`de:03379`), **keine WMO-Kennung im Katalog** | Zuordnung Punkt-Station (Hinweis `CubeObsHint.station` = MOSMIX-WMO) über den **Ort** (≤ 0,3 km) statt über die Kennung; V-OF-1 (WMO-Spalte im Katalog) |
| DE Werte | T °C, Wind/Böe **km/h → /3,6**, RH, rr10 × 6, Stempel der Messung | T, ff/fx **m/s original** (FF_10), rh, rr, td, ps | T, RH, rr gleich; Wind/Böe können in der 3. Stelle abweichen, wenn BrightSky km/h rundet — wird am Poller gemessen (§1.4) |
| DE Stempel | BrightSky `timestamp` (Synop + 10-min) | Ende des 10-min-Intervalls | §1.4: BrightSky **frischer** an Synop-Stationen (erster Poll 07:56: BrightSky 07:30, obs 07:20) |
| AT Station | TAWES `current` je Kennung, 60 nächste | `at:11001` = TAWES-Kennung = Synop-Kennung | gleich |
| AT Werte | TL, RF, FF, DD, FFX, RR — **ohne Stempel** (`validAtMs = Abrufzeit`) | dieselben Spalten + TP (Td), ps/p, Stempel | Werte gleich; der Stempel ist NEU — mit Fusion 9 (`anchorAtObsTime`) paart der Anker dann an der Messminute statt an der Abrufzeit (Unterschied erklärt, kein Fehler) |
| CH Station | `ogd-smn` je Kürzel, 12 nächste | `ch:ABO` = Kürzel | gleich |
| CH Werte | t, ff, dd, ffx (m/s), rh, rr — ohne Stempel, ohne Td | dieselben + td, ps, Stempel; VQHA (km/h) vom Spiegel umgerechnet, OGD überschreibt denselben Stempel | wie AT |
| Höhe | BrightSky `height`, TAWES `altitude`, SMN Katalog | Katalog derselben Dienste | gleich |
| Windmesshöhe | nicht in den offenen Metadaten | ebenso | unverändert (P1 kennt keinen Filter) |
| Td | nur INCA (`dewPoint`), sonst `dewPointC(T, RH)` im Stationswert | gemessen (DE `TD_10`, AT `TP`, CH `tde200s0`) | nur hinter Option (OF-2), sonst nicht gesetzt ⇒ byte-gleich |
| Niederschlagsstationen | nie (BrightSky: nur Stationen mit T-Antwort; TAWES/SMN: nur Vollstationen) | 2 145 reine Niederschlagsstationen, davon ≈ 1 100 mit 10-min-`rr` | nur hinter Option (OF-2/OF-3) |

### 1.3 Was `obs/v1` live liefert (Stempelalter je Land, `latest.json` gebaut 07:31:15 UTC)

| Land | Stationen mit 10-min-Stempel | Alter des neuesten Stempels (min) |
|---|---|---|
| AT | 284 | 10–19 (282), 20–29 (2) |
| CH | 299 | 10–19 (192), 20–29 (103), ≥ 30 (4) |
| DE | 1 423 | 30–39 (10), **40–49 (1 345)**, 50–59 (30), ≥ 60 (38 — Stationen, deren Produkt heute nicht erschien) |

DE: die CDC-10-min-Dateien erscheinen halbstündlich mit Werten bis ≈ 30 min vor dem Erscheinen (Phase OB §1.2) ⇒ typisch 30–50 min alt.

### 1.4 Latenz DE: BrightSky `/current_weather` gegen `obs/v1` (Poller, 12 Synop-Stationen, alle 5 min, 150 min)

Erster Poll 07:56:30 UTC: BrightSky Stempel **07:30** an 12/12 Stationen, `obs/v1` **07:20** (gebaut 07:54); T am gemeinsamen
Stempel gleich (z. B. 10865 München-Stadt 17,1 / 17,1; 10384 Berlin-Tempelhof 12,5 / 12,5). BrightSky ist damit an Synop-Stationen
**≈ 10 min frischer** als die CDC-10-min-Dateien — Ursache: BrightSky mischt in `current_weather` den Synop-Strom
(`opendata.dwd.de/weather/weather_reports/synoptic/germany/`, BUFR alle 5–10 min, das 08:00-Bulletin lag um 08:05 vor) mit den
10-min-Dateien. Die vollständige Reihe (Verteilung des Vorsprungs, Wertgleichheit T/Wind/Böe am gemeinsamen Stempel) steht nach
dem Lauf in §1.4a.

### 1.5 Größe und Zeit der Lesewege (08.10. 07:40 UTC, Desktop, kalt; Mobil-4G-Lab in OF-1)

| Datei | jsDelivr `@main` (br) | raw.githubusercontent (gz) | Bemerkung |
|---|---|---|---|
| `obs/v1/latest.json` | 46,9 KB, TTFB 0,47 s, `x-cache: MISS`, Age 0 | 46,4 KB, TTFB 0,36 s, `cache-control: max-age=300` | der Spiegel **purgt nach jedem Publish** ⇒ am CDN fast immer MISS; raw hat 5 min Cache |
| `obs/v1/stations.json` | 89,0 KB, TTFB 0,55 s | — | ändert sich selten (Katalog-Refresh alle 6 h) ⇒ CDN-Cache trägt |
| `obs/v1/series/dwd10.json` | 482,5 KB, TTFB 2,8 s | 503,7 KB, 0,35 s (HIT) | für den Browser zu groß — Reihen bleiben Werkzeug für Producer/Replay |
| `obs/v1/series/tawes.json` | 240,8 KB | — | dito |

Heute (Cube-Pfad DE): 20–22 Anfragen à ≈ 1 KB, pMap 3, BrightSky 30–150 ms je Antwort (Poller: 32–153 ms) ⇒ ≈ 0,5–1,2 s
serialisiert. Mit `obs/v1`: **2 Anfragen** (Katalog gecacht + `latest.json`), ≈ 47 KB. Mobil-4G: 47 KB ≈ 0,1–0,2 s Übertragung.
Entscheidung A-OF-4: `latest.json` + `stations.json` unverändert als Client-Form (kein Kachel-/Kompaktprodukt vorab);
`latest.json` primär über raw (frisch, 5-min-Cache, kein `@main`-Verzug), jsDelivr als Hedge/Rückfall; Katalog primär jsDelivr.
Regionale Kacheln = V-OF-2, nur falls das Mobil-Lab es verlangt.

### 1.6 Was der Prüfstand-Replay für die Vergangenheit nachbauen kann

- Der Replay (`scripts/pruefstand/lib/replay.mjs`) speist heute **eine** Messung je Punkt: Rolle A die eigene Station aus dem
  Wahrheitsblock des Slots (`archiveObs`: letzte Messung ≤ Slotzeit, Abstand 0), Rolle B die Messung der nächsten Rolle-A-Station
  (`anchor.km` 9–22 km). Der Archiv-Slot trägt Wahrheit nur an **681 Punkten** (POI 238, TAWES 284, SMN 159); die 1 664 Eingabe-Punkte
  des Schemas 5 (seit 05.10.: CDC 1 264, TAWES 202, SMN 57, SMN-precip 141) haben **Cube und Radar-Frames, aber keine Wahrheit** im Slot.
- `obs/v1` selbst ist nur 26 h tief und wird von anderen Linien force-gepusht ⇒ keine Historie. Die Originale: **DE** DWD CDC
  10-min `recent` (500 Tage; `precipitation/recent` 1 398 Dateien à ≈ 220 KB ≈ 300 MB, `air_temperature` 466 à ≈ 840 KB, `wind`/
  `extreme_wind` 277) — W1 liest sie schon für 532 Stationen (`quellen.mjs readCdc`, Cache `C:\dev\buscosun-pruefstand\quellen\cdc`);
  **AT** TAWES: der Archiv-Slot trägt alle 284 TAWES-Stationen mit 24-h-Fenster (10 min, inkl. `rr1h`) ⇒ keine Originale nötig;
  **CH** SMN 159 im Slot; `ogd-smn-precip` (141) über `…_t_recent.csv` (Jahresdatei) wie `readSmn`.
- **Leck-Regel (vor der Messung festgeschrieben):** (1) Wahrheit wird nie aus dem Messsatz gelesen — sie bleibt W1 (Stempel H, QC).
  (2) Rolle B: der dichte Messsatz eines Punkts enthält **nie** die eigene W1-Station (gleiche Kennung oder ≤ 0,25 km) — der Punkt bleibt
  „ohne eigene Messung"; Rolle A darf sie enthalten (heutige Regel). (3) Jede Messung ≤ Slotzeit; bewertet werden Vorläufe ≥ 1 h ⇒ Messung
  und Wahrheit liegen nie am selben (Punkt, Stempel). (4) Radar am Messgerät (OF-3 a) nur aus dem Slot selbst (Schema 5, ab 05.10.) — nie
  nachträglich aus dem Spiegel (keine Historie, force-push).

### 1.7 Nummer des Stands, Branch, Commits (Auto-Modus)

- Register auf `main`: Stände 7, 8, 9 (`FUSION_CURRENT` 9, Champion `fusion-9`); auf den lokalen Zweigen `fusion-10`/`fusion-11`
  die Kandidaten 10 und 11 (Prüfstand-Register nur dort). `verify:fusion-release` A1 verlangt **lückenlose** Nummern ⇒ ein Stand 12
  braucht 10 und 11 im Register ⇒ **A-OF-1:** Branch `fusion-12` von `main`, `fusion-11` hineingemergt (drei Konflikte: `budget.json`
  beide Notizen, Grenze 1 600; `MANUELLE-SCHRITTE.md` §45/§46 vor §47/§47; `cubeSource.ts` F10/F11-Langfristblock vor dem V-SW-3-
  Böenboden, beide Notizzeilen). Fusion 12 = Fusion 11 + diese Phase; der Prüfstand vergleicht 12 gegen den Champion 9 **und** gegen 11.
- **A-OF-2:** Commits nur auf `fusion-12` (nie `main`, kein Push): der Prüfstand registriert eine Version an einem Commit mit sauberem
  `src/` (OF-5 Schritt 3 des Auftrags) — ohne Commit keine Registrierung.
- **A-OF-3:** eigener Worktree, weil eine parallele Seewetter-Sitzung im Hauptarbeitsbaum schreibt (§0 07:58).

## 2 Plan

| AP | Inhalt | Gate |
|---|---|---|
| OF-1 | Leser `src/sources/obsStore.ts` (Katalog + `latest.json`, Frist, Hedge raw ↔ CDN, Memo) → `NearestStationObs`/`ForecastGrid` in derselben Form wie heute; Schalter `?obs=direct` (`CubeIo.obsStore: false`), Rückfall auf den Direktabruf bei Fehler/leer; Verbraucher 1–3, 5, 7–9 der Tabelle §1.1 | Verifier `verify:obs-reader`: Abbildung `obs → CubeObs` gegen die BrightSky-/TAWES-/SMN-Abbildung an gleichen Werten byte-gleich; Motor byte-gleich bei gleichem `obs`; Anfragen je Punkt vorher/nachher; Browser DE/AT/CH |
| OF-2 | Reader-Erweiterung `CubeIo.obsDense` (bis 12 nächste inkl. Niederschlagsstationen, Td, `rr10`/`rr1h`) + Motor-Option `obsDense` (Anker: je Größe die 6 besten nach `spatialWeight`; Td gemessen in den Stationswert) | Identität ohne Option; Pre-Screen |
| OF-3 | Motor-Optionen `gaugeOccurrence` (b), `gaugeRadar` (a), `gaugeHour0` (c) — Wahl in §3 | Identität ohne Option; Pre-Screen |
| OF-4 | Behauptungen + Regel eingefroren (Hash) → Pre-Screen je Option und Kombination auf den Prüfstand-Fällen mit dichten Messungen aus den Originalen | Tabelle je Zelle |
| OF-5 | Stand 12 im Register, Identitätsverifier, Replay-Adapter neue Generation, Registrierung, Volltest; **keine Abnahme** (nur auf Jans Wort) | Prüfstand-Bericht |

## 3 Regel vor den Zahlen (OF-4) — wird vor dem ersten Pre-Screen eingefroren (Hash in `audit/obs-fusion/claims-frozen.sha256`)

(folgt in §3 vor dem ersten Lauf)

## 4 Entscheidungen im Auto-Modus

- **A-OF-1** Nummer 12, Branch `fusion-12` von `main` mit Merge von `fusion-11` (§1.7).
- **A-OF-2** Commits auf dem Branch (Registrierung), kein Push, kein Merge nach `main`.
- **A-OF-3** Worktree statt Hauptarbeitsbaum (parallele Sitzung).
- **A-OF-4** Client-Form = `latest.json` + `stations.json` (§1.5); `latest.json` primär raw.

## 5 Umsetzung (folgt)

## 9 Verbesserungen V-OF-n

- **V-OF-1** WMO-Kennung im Katalog `obs/v1/stations.json` (DE: aus BrightSky `/sources` oder der DWD-Stationsliste) — Mehrwert: die
  Station des MOSMIX-Produkts findet ihre eigene Messung über die Kennung statt über den Ort; Skizze: Spiegel liest `/sources` einmal je
  6 h wie die TAWES-Metadaten, Spalte `wmo`.
- **V-OF-2** Regionale Kacheln von `latest.json` (z. B. 2° × 2°, ≈ 3 KB je Kachel) — Mehrwert: Mobil liest 1–4 KB statt 47 KB; Skizze:
  Spiegel schreibt `latest/<lat>_<lon>.json`, Leser holt die Kachel des Punkts (+ Nachbarn am Rand); erst, wenn das Mobil-Lab es verlangt.
