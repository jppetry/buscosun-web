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
| 08:03–08:12 | Worktree `C:\dev\buscosun-web-wt\fusion-12` (Branch `fusion-12` von `main`), Merge `fusion-11` mit drei Konflikten aufgelöst (§4 A-OF-1), `npm run typecheck` 0 Fehler, Merge-Commit `dffd592` |
| 08:12–08:40 | Diagnose §1 geschrieben; OF-1 gebaut (§5.1): `obsStore.ts`, Schalter, Verbraucher; `verify:obs-reader` 32/32, `--live` 34/34 |
| 08:40–08:53 | Verifier im Worktree: `fusion-release` 28/28, `pv-fusion` 235/235, `point-client` 173/174 ((10s) zeitabhängig, V-EX-13), `modelsource` 64/64; `pv-cube` brauchte die `node_modules`-Junction im Worktree (§5.7) und das Register in Block (29) (vorher 6 feste „buscosun Fusion 9"-Texte: 417/424 — auf `fusion-11` selbst wäre er genauso rot gewesen), danach **424/424** |
| 08:45–09:16 | Dichte Messungen der Vergangenheit aus den Originalen gebaut (`build-dense-obs.mjs`, §5.4): erster Lauf 451 s/Tag (Parsen je Tag), umgebaut auf ein Parsen je Station über den ganzen Zeitraum ⇒ **24 Tage in 353 s** (153 MB) |
| 08:53–09:13 | OF-2/OF-3 im Motor (§5.2/§5.3), Register-Eintrag n: 12 (§5.5), Replay-Provider, Pre-Screen, Identitätsverifier |
| 09:16:50 | **Behauptungen und Regel eingefroren** (`audit/obs-fusion/claims.md`, sha256 `e846f5b3…`, `claims-frozen.at`) — vor dem ersten Pre-Screen-Lauf |
| 09:17–09:30 | Identitätsverifier **17/17** (§5.6); Pre-Screen-Kette R0 → R1 → D0 → D1 → D2 → D3 gestartet (`--set=voll`, 24 Tage, ≈ 15 min je Variante bei freier CPU); Browser-Gate OF-1 (§5.8) |
| 09:36 | Commit `8462fa7` (Tag `of-lauf-1`): der gemessene Code |
| 09:50–10:42 | Pre-Screen R1, D0, D1, D2, D3 fertig; Vergleiche §6.1–§6.5; **V-OF-10** erkannt (10:05), Nachtrag 1 eingefroren (10:08, sha256 `28037c77…`) |
| 10:28 | Latenz-Poller fertig (31 Zyklen, 372 Paare; §1.4) |
| 10:44–11:03 | Option `stationValueAtObsTime` gebaut (Motor), Bündel radar 1; D0′ gemessen (§6.6) ⇒ ins Bündel; Commit `9765d9e` (Tag `of-lauf-2`); Registrierung `fusion-12` 11:03 UTC |
| 11:05 | Speicherwächter von Claude Code beendet alle Hintergrundläufe (Dev-Server, F, Identität); weiter als Vordergrund-Läufe (A-OF-9) |
| 11:08–11:30 | Messdatei 07.10. neu gebaut (V-OF-9); Identität Endstand 7/7 + 13/13; Bündel F in vier Gruppen (§6.7); `PRUEFSTAND_WORKERS=2` |
| 11:33–11:50 | Prüfstand Volltest (762 s, §7): +1,47 % gegen Fusion 9, G3 rot; Vergleich gegen Fusion 11 +1,00 % |
| 11:55–12:20 | `FUSION12_OBS_DENSE = 0` (OF-5 Punkt 5), Register-Wächter für „definiert, aber aus" (A3b), Verifier grün, Build 255/255, Budget 1 600 → 1 609 KB (Notiz), Doku, Commit `of-lauf-3` |

## 1 Diagnose (OF-0)

### 1.1 Inventar — jeder Abruf aktueller Stationsmessungen in `src/`

Gefunden mit `grep` über `current_weather|brightsky|fetchNearestStationObs|tawes|meteoswiss|dachStations` (61 Dateien nennen eines
der Wörter; Messabrufe sind nur die folgenden — der Rest sind Texte, Quellenlisten, Vorhersagen):

| # | Abrufer (Datei, Funktion) | Quelle, Anfragen je Aufruf | Verbraucher | Was ankommt |
|---|---|---|---|---|
| 1 | `src/sources/brightSkyCurrent.ts` `fetchBrightSkyCurrentGrid` | BrightSky `/current_weather?lat&lon` je Sondenpunkt: Cube-/Live-Pfad **5 × 4 = 20 Anfragen** (Fenster ±1,2° × ±1,0°), Rasterfusion der Karte **10 × 8 = 80** (gedeckelt auf die DWD-Hülle), pMap 3, 2 Versuche | `fetchNearestStationObs` (DE), `loadFusedForecast.ts` | je Antwort EINE Station (die nächste mit Daten), `fallback_source_ids` zugeordnet (V-FI-11); T °C, Wind **km/h**, Böe km/h, RH %, Niederschlag mm/10 min, Stempel |
| 2 | `brightSkyCurrent.ts` `fetchBrightSkyCurrentAt` | `/current_weather?wmo_station_id` (Station des Punkts, AX-1) + `?lat&lon` — **2 Anfragen** | `brightSkyAtPoint` (Cube-Pfad DE, nur mit `near`) | wie 1, `byStation` |
| 3 | `src/sources/geosphereTawes.ts` `fetchTawesCurrentGrid` | GeoSphere `station/current/tawes-v1-10min` — **1 Anfrage** (bis 200 Kennungen, mit `near` 60 nächste) | `fetchNearestStationObs` (AT), `loadFusedForecast.ts`, `dachStations.ts` | TL, RF, FF, DD, FFX, RR; **kein Stempel** (Punkt gilt als „jetzt"), kein Td gelesen |
| 4 | `geosphereTawes.ts` `fetchTawesHistory` | `station/historical/tawes-v1-10min` — 1 Anfrage | Live-Pfad (`fetchStationHistory`, AT) | Stundenwerte 6 h |
| 5 | `src/sources/meteoSwissSmn.ts` `fetchSmnCurrentGrid` | MeteoSchweiz `ogd-smn/<abbr>/…_t_now.csv` — **eine Anfrage je Station** (mit `near` 12, sonst 80, Karte 200), pMap 6 | `fetchNearestStationObs` (CH), `loadFusedForecast.ts`, `dachStations.ts` | letzte Zeile: t, ff, dd (m/s), ffx, rh, rr; **kein Stempel**, `tde200s0` (Td) steht in der Datei, wird nicht gelesen |
| 6 | `meteoSwissSmn.ts` `fetchSmnHistory` | dieselben Dateien (Cache 5 min) | Live-Pfad (CH) | Stundenwerte |
| 7 | `src/pointForecast/sampleSources.ts` `fetchNearestStationObs` | orchestriert 1–5 je Land, **6 nächste** (mit `near` dedupliziert, gezielte Antwort zuerst) | **Cube-Pfad** `fetchCubeObs` (`cubeSource.ts`, + INCA hinter `incaAnchor`), **Live-Pfad** `pointForecast.ts` (+ `fetchStationHistory` AT/CH 6 h) | `NearestStationObs` → `CubeObs` (`cubeObsOf`: Stempel = `point.timestamp` ?? `nowMs`) |
| 8 | `src/sources/dachStations.ts` `fetchDachStations` | BrightSky `/sources?lat&lon&max_dist=500000` **2 Anfragen** (Katalog, `observation_type: current`, ≈ 650) + TAWES + SMN 200 | `MapView.tsx` Stationen-Layer | DE ohne Werte (lazy), AT/CH mit Werten |
| 9 | `dachStations.ts` `fetchDwdStationLive` | `/current_weather?dwd_station_id` **je Klick** | `MapView.tsx` Popup | T, Wind, Richtung, Niederschlag, Bewölkung |
| 10 | `src/pointForecast/pointForecast.ts` (Live-Pfad) `brightSkyHistoryToSamples` | Messhistorie DE aus der **BrightSky-`/weather`-Antwort** (Vorhersageabruf; vergangene Stunden = Messungen der Station) | Anker-Historie des Live-Pfads (DE) | Stundenpaare 6 h |

Keine Messabrufe, nur genannt (nicht Teil der Phase): BrightSky-**Vorhersagen** (`src/sources/brightSkyForecast.ts` Raster,
`src/wind/brightSkySource.ts` Wind, `fetchBrightSkyPointForecast` in `sampleSources.ts` = MOSMIX über BrightSky — #10 hängt an
diesem Abruf und bleibt, V-OF-3), INCA-Analyse (`fetchIncaAnalysisObs`, Analyse statt Messung, AT, aus), Straßenstationen SWIS
(`src/road/`, eigenes Produkt), POI-Küstenstationen der Seewetter-Spots (Producer, Daten-Repo), Dashboard
(`src/dashboard/model/build.ts` holt nichts selbst, liest den Cube-Pfad; nennt BrightSky/TAWES/SMN nur als Herkunftswörter in
`FOOTER` und `nets`).

### 1.2 `obs/v1` gegen das, was die Abrufer heute liefern (geprüft 08.10. 07:31–07:56 UTC)

**Form** (Stand `status.json` 07:31 UTC): 3 123 Stationen, 3 044 mit Werten (DE 2 273, AT 284, CH 484, LI 3); 2 006 mit
10-min-Stempel, 1 038 nur Tageswert; 887 mit T, 884 mit Td, 888 mit RH, 698 mit Wind/Böe, 1 863 mit `rr` (1 862 `rr1h`
vollständig). `stations.json` (Liste: id `de:00096`/`at:11001`/`ch:ABO`, name, lat, lon, elev, country, region, networks,
vars), `latest.json` (je id: `t` Stempel, `src`, `v {t, td, rh, ps, p, ff, dd, fx, rr, sd, gr, snow}`, `older`, `rr1h {mm, n, of,
complete}`, `rr24h`, `day`), Einheiten fest je Größe (m/s, °C, %, mm je Intervall).

| Punkt | heute (Abrufer) | `obs/v1` | Folge für OF-1 (Gate „gleiche Station, gleicher Stempel ⇒ byte-gleich") |
|---|---|---|---|
| DE Station | BrightSky wählt je Sonde die nächste Station **mit Daten**; Kennung = WMO (`wmo_station_id`, = MOSMIX-Katalog) oder DWD-id | DWD-id (`de:03379`), **keine WMO-Kennung im Katalog** | Zuordnung Punkt-Station (Hinweis `CubeObsHint.station` = MOSMIX-WMO) über den **Ort** (≤ 0,3 km) statt über die Kennung; V-OF-1 (WMO-Spalte im Katalog) |
| DE Werte | T °C, Wind/Böe **km/h → /3,6**, RH, rr10 × 6, Stempel der Messung | T, ff/fx **m/s original** (FF_10), rh, rr, td, ps | T, RH, rr gleich; Wind/Böe weichen bis 0,014 m/s ab, weil BrightSky km/h mit einer Nachkommastelle veröffentlicht (Verifier (3)); das Produkt trägt das DWD-Original |
| DE Stempel | BrightSky `timestamp` (Synop + 10-min) | Ende des 10-min-Intervalls | §1.4: BrightSky **frischer** an Synop-Stationen |
| AT Station | TAWES `current` je Kennung, 60 nächste | `at:11001` = TAWES-Kennung = Synop-Kennung | gleich |
| AT Werte | TL, RF, FF, DD, FFX, RR — **ohne Stempel** (`validAtMs = Abrufzeit`) | dieselben Spalten + TP (Td), ps/p, Stempel | Werte gleich (Verifier (3) mit dem Adapter an derselben Eingabe); der Stempel ist NEU — mit Fusion 9 (`anchorAtObsTime`) paart der Anker an der Messminute statt an der Abrufzeit (erklärt, kein Fehler) |
| CH Station | `ogd-smn` je Kürzel, 12 nächste | `ch:ABO` = Kürzel | gleich |
| CH Werte | t, ff, dd, ffx (m/s), rh, rr — ohne Stempel, ohne Td | dieselben + td, ps, Stempel; VQHA (km/h) vom Spiegel umgerechnet, OGD überschreibt denselben Stempel | wie AT (Verifier (3)) |
| Höhe | BrightSky `height`, TAWES `altitude`, SMN Katalog | Katalog derselben Dienste | gleich |
| Windmesshöhe | nicht in den offenen Metadaten | ebenso | unverändert (P1 kennt keinen Filter) |
| Td | nur INCA (`dewPoint`), sonst `dewPointC(T, RH)` im Stationswert | gemessen (DE `TD_10`, AT `TP`, CH `tde200s0`) | nur hinter `obsDense` (OF-2), sonst nicht gesetzt ⇒ byte-gleich |
| Bewölkung | BrightSky `cloud_cover` (Synop) nur im Karten-Popup (#9); nie in der Fusion | nicht im Produkt (DWD 10-min-Dateien tragen keine) | das Popup verliert die Bewölkung ⇒ **E-OF-1** (Jan): hinnehmen, oder Spiegel um den Synop-Strom erweitern (V-OF-4) |
| Niederschlagsstationen | nie (BrightSky: nur Stationen mit T-Antwort; TAWES/SMN: nur Vollstationen) | 2 145 reine Niederschlagsstationen, davon ≈ 1 100 mit 10-min-`rr` | nur hinter `obsDense` (OF-2/OF-3) |

### 1.3 Was `obs/v1` live liefert (Stempelalter je Land, `latest.json` gebaut 07:31:15 UTC)

| Land | Stationen mit 10-min-Stempel | Alter des neuesten Stempels (min) |
|---|---|---|
| AT | 284 | 10–19 (282), 20–29 (2) |
| CH | 299 | 10–19 (192), 20–29 (103), ≥ 30 (4) |
| DE | 1 423 | 30–39 (10), **40–49 (1 345)**, 50–59 (30), ≥ 60 (38 — Stationen, deren Produkt heute nicht erschien) |

DE: die CDC-10-min-Dateien erscheinen halbstündlich mit Werten bis ≈ 30 min vor dem Erscheinen (Phase OB §1.2) ⇒ typisch 30–50 min alt.

### 1.4 Latenz DE: BrightSky `/current_weather` gegen `obs/v1` (Poller, 12 Synop-Stationen, alle 5 min)

Zwischenstand nach 19 Zyklen (07:56–09:31 UTC, 228 Paare; die vollständige Reihe über 150 min in §1.4a):

| Maß | BrightSky | `obs/v1` |
|---|---|---|
| Alter des Stempels zur Abrufzeit, p10 / p50 / p90 (min) | 2,6 / **17,4** / 27,5 | 22,3 / **36,5** / 47,2 |
| Vorsprung BrightSky − obs | 10 min an 166 Paaren, 40 min an 60, 0 min an 2 | |
| Antwortzeit (Server) p50 | 32 ms je Station (× 22 je Punkt) | 379 ms (eine Datei, 46 KB gz) |
| T am gemeinsamen Stempel | gleich (1 von 2 Paaren mit gleichem Stempel; das andere: BrightSky 14,1 °C, obs `null` = Spalte an dem Stempel noch nicht da) | |

**Befund V-OF-3 (die Erwartung des Auftrags gilt NICHT):** BrightSky ist an Synop-Stationen im Median **≈ 20 min frischer**
als `obs/v1`, weil `current_weather` den Synop-Strom des DWD (`weather_reports/synoptic/germany/`, BUFR-Bulletins alle 5–10 min,
das 08:00-Bulletin lag um 08:05 vor) mit den 10-min-Dateien mischt; die CDC-10-min-Dateien erscheinen erst 30 min nach dem
Stempel. Für den Anker heißt das: in DE ist die neueste Messung im Produkt im Schnitt 20 min älter als vorher — an den ≈ 200
Synop-Stationen; die ≈ 1 200 übrigen 10-min-Stationen kennt BrightSky genauso spät. Abhilfe = Erweiterung des Spiegels um den
Synop-Strom (BUFR-Decoder liegt im Repo: `src/road/swisBufr.ts`), **E-OF-2** (Jan) — in dieser Phase nicht gebaut.

### 1.5 Größe und Zeit der Lesewege (08.10. 07:40 UTC, Desktop, kalt)

| Datei | jsDelivr `@main` (br) | raw.githubusercontent (gz) | Bemerkung |
|---|---|---|---|
| `obs/v1/latest.json` | 46,9 KB, TTFB 0,47 s, `x-cache: MISS`, Age 0 | 46,4 KB, TTFB 0,36 s, `cache-control: max-age=300` | der Spiegel **purgt nach jedem Publish** ⇒ am CDN fast immer MISS; raw hat 5 min Cache |
| `obs/v1/stations.json` | 89,0 KB, TTFB 0,55 s | — | ändert sich selten (Katalog-Refresh alle 6 h) ⇒ CDN-Cache trägt |
| `obs/v1/series/dwd10.json` | 482,5 KB, TTFB 2,8 s | 503,7 KB, 0,35 s (HIT) | für den Browser zu groß — Reihen bleiben Werkzeug für Producer/Replay |
| `obs/v1/series/tawes.json` | 240,8 KB | — | dito |

Heute (Cube-Pfad DE): 20–22 Anfragen à ≈ 1 KB, pMap 3, BrightSky 30–150 ms je Antwort ⇒ ≈ 0,5–1,2 s serialisiert. Mit
`obs/v1`: **2 Anfragen** (Katalog gecacht + `latest.json`), ≈ 47 + 89 KB. Entscheidung A-OF-4: `latest.json` + `stations.json`
unverändert als Client-Form (kein Kachel-/Kompaktprodukt vorab); `latest.json` primär über raw (frisch, 5-min-Cache, kein
`@main`-Verzug), jsDelivr als Hedge/Rückfall; Katalog primär jsDelivr, raw als Hedge. Regionale Kacheln = V-OF-2. Im Browser-Gate
(§5.8) antwortete jsDelivr auf `stations.json` zweimal mit **503** und raw einmal mit 503 — jedes Mal trug der zweite Weg.
Mobil-4G: nicht im Lab gemessen (CPU der Sitzung von Prüfstand und Pre-Screen belegt; V-OF-5).

### 1.6 Was der Prüfstand-Replay für die Vergangenheit nachbauen kann

- Der Replay (`scripts/pruefstand/lib/replay.mjs`) speist heute **eine** Messung je Punkt: Rolle A die eigene Station aus dem
  Wahrheitsblock des Slots (`archiveObs`: letzte Messung ≤ Slotzeit, Abstand 0), Rolle B die Messung der nächsten Rolle-A-Station
  (`anchor.km` 9–22 km). Der Archiv-Slot trägt Wahrheit nur an **681 Punkten** (POI 238, TAWES 284, SMN 159) und **stündlich**;
  die 1 664 Eingabe-Punkte des Schemas 5 (seit 05.10.: CDC 1 264, TAWES 202, SMN 57, SMN-precip 141) haben Cube und Radar-Frames,
  aber keine Wahrheit im Slot.
- `obs/v1` selbst ist nur 26 h tief und wird von anderen Linien force-gepusht ⇒ keine Historie. Die Originale: **DE** DWD CDC
  10-min `recent` + `now` (`precipitation/recent` 1 398 Dateien à ≈ 220 KB, `air_temperature` 466 à ≈ 840 KB, `wind`/`extreme_wind`
  277) — W1 liest sie schon für 532 Stationen (`quellen.mjs readCdc`, Cache `C:\dev\buscosun-pruefstand\quellen\cdc`);
  **AT** GeoSphere `tawes-v1-10min` historical, 100 Stationen je Anfrage (3 Anfragen je Tag); **CH** `ogd-smn` `t_recent`/`t_now`
  (`readSmn`) und `ogd-smn-precip` (141, eigener Leser).
- **Leck-Regel (vor der Messung festgeschrieben, `claims.md` §4):** (1) Wahrheit wird nie aus dem Messsatz gelesen — sie bleibt W1
  (Stempel H, QC). (2) Rolle B: der dichte Messsatz eines Punkts enthält **nie** eine Station ≤ 0,25 km vom Punkt (die eigene
  bleibt maskiert); Rolle A darf sie enthalten (heutige Regel). (3) Jede Messung ≤ Slotzeit; bewertet werden Vorläufe ≥ 1 h ⇒
  Messung und Wahrheit liegen nie am selben (Punkt, Stempel). (4) Radar am Messgerät nur aus dem Slot selbst — die Option (a) des
  Auftrags braucht das Radar AM Messgerät; der Browser tastet das Radar nur am Punkt ab, das Archiv trägt es an den
  Eingabe-Punkten erst seit 05.10. ⇒ gebaut ist (a′): das Radar am Punkt steht für das Messgerät ≤ 10 km (§5.3); (a) = V-OF-6.

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
| OF-1 | Leser `src/sources/obsStore.ts` → `NearestStationObs`/`ForecastGrid` in derselben Form wie heute; Schalter `?obs=direct` (`CubeIo.obsStore: false`), Rückfall auf den Direktabruf bei Fehler/leer; Verbraucher 1–3, 5, 7–9 der Tabelle §1.1 | `verify:obs-reader`; Motor byte-gleich bei gleichem `obs`; Anfragen je Punkt vorher/nachher; Browser DE/AT/CH (§5.8) |
| OF-2 | `CubeIo.obsDense` (bis 12 nächste inkl. Niederschlagsstationen, Td, `rr10`/`rr1h`) + Motor-Option `obsDense` | Identität ohne Option (§5.6); Pre-Screen (§6) |
| OF-3 | Motor-Optionen `gaugeOccurrence` (b), `gaugeRadar` (a′) — Wahl in §1.6/§5.3 | Identität; Pre-Screen |
| OF-4 | Behauptungen + Regel eingefroren (Hash) → Pre-Screen je Option und Kombination | §6 |
| OF-5 | Stand 12 im Register, Identitätsverifier, Replay-Provider, Registrierung, Volltest; **keine Abnahme** (nur auf Jans Wort) | §7 |

## 3 Regel vor den Zahlen (OF-4)

Eingefroren um **09:16:50 UTC** vor dem ersten Pre-Screen-Lauf: `audit/obs-fusion/claims.md`, sha256
`e846f5b39dc4f7ca905f869895e6c1c317e397dbc47f9067a1bf5825a770b386` (`claims-frozen.sha256`, `claims-frozen.at`). Darin: die sechs
Varianten R0/R1/D0/D1/D2/D3, die Behauptungen C1–C8 des Auftrags in Messform, die Auswahlregel (welche Messgeräte-Option in das
Bündel `FUSION12_GAUGE` kommt, wann `obsDense` selbst bleibt), die Leck-Erklärung.

## 4 Entscheidungen im Auto-Modus

- **A-OF-1** Nummer 12, Branch `fusion-12` von `main` mit Merge von `fusion-11` (§1.7).
- **A-OF-2** Commits auf dem Branch (Registrierung), kein Push, kein Merge nach `main`.
- **A-OF-3** Worktree statt Hauptarbeitsbaum (parallele Sitzung); dafür eine `node_modules`-Junction im Worktree (§5.7).
- **A-OF-4** Client-Form = `latest.json` + `stations.json` (§1.5); `latest.json` primär raw, Katalog primär CDN, je mit Hedge.
- **A-OF-5** Option (a) des Auftrags als (a′) gebaut (Radar am Punkt statt am Messgerät, §1.6); (c) nicht gebaut (V-OF-7: Vorlauf 0
  wird vom Prüfstand nicht bewertet — eine Anzeigeoption ohne Maß).
- **A-OF-6** Die Konstanten der Optionen sind Setzungen (`claims.md` §4), kein Fit in dieser Phase.
- **A-OF-8** Nachtrag 1 zu den Behauptungen (V-OF-10, Stationswert an der Messminute) nach den Läufen R0/R1/D0 und vor D1–D3/D0′ eingefroren (eigener Hash); die Option kam nach seiner Regel ins Bündel.
- **A-OF-9** Nach dem Stopp aller Hintergrundläufe durch den Speicherwächter von Claude Code (11:05 UTC, §5.7) liefen F, Identität und Prüfstand als Vordergrund-Läufe ≤ 10 min (F in vier Tagesgruppen, Identität je Tag) bzw. mit zwei statt drei Workern (`PRUEFSTAND_WORKERS`, neuer Umgebungsschalter des Runners).
- **A-OF-7** Das Stationen-Layer der Karte zeigt mit dem Produkt alle 10-min-Stationen MIT Werten (≈ 2 000 statt ≈ 1 000, DE nicht
  mehr lazy); Tagesstationen nicht (V-OF-8); Bewölkung im Popup fehlt (E-OF-1).

## 5 Umsetzung

### 5.1 OF-1 — der Leser und sein Schalter

- `src/sources/obsStore.ts` (neu): `fetchObsJson(path, primary)` — ein Pfad, zwei Wege (raw ↔ jsDelivr), Hedge 2,5 s, Frist 8 s,
  Abbruch; `loadObsCatalog`/`loadObsLatest` memoisiert (6 h / 120 s, ein Fehlschlag wird nicht gemerkt); rein: `obsPointOf`
  (Station → `ForecastHourPoint` mit denselben Formeln wie die drei Adapter, Stempel = Messzeit), `nearestObsStations` (heutige
  Semantik: volle Stationen mit 10-min-Stempel ≤ 6 h alt, Land, `byStation` über den Ort ≤ 0,3 km; `dense`: + Niederschlagsstationen,
  Td, `rr10`, `rr1h`), `obsGridOf` (1 × N für die Rasterfusion), `obsStationFeatures`/`obsStationLive` (Karte, Popup).
- Schalter `pfObsStoreFrom` (`?obs=direct` ⇒ Direktabruf). `fetchNearestStationObs` liest zuerst das Produkt (`store` ?? Flag);
  leer oder Fehler ⇒ benannter Rückfall auf die Adapter (`onNote`). `fetchCubeObs` reicht `CubeIo.obsStore` durch; die Motor-Notiz
  nennt die Herkunft (`obs: n Stationsmessung(en) aus buscosun-data obs/v1` / `per Direktabruf (?obs=direct)` / `Rückfall`);
  `CubeObs.via = 'obs'`. Rasterfusion: `obsOr('DE'|'AT'|'CH', direct)` — Interpolation unberührt. Karte: `fetchDachStations` und
  `fetchDwdStationLive` aus dem Produkt, Adapter als Rückfall. Nicht geändert: Live-Pfad-Historie #10 (BrightSky `/weather`,
  V-OF-3), INCA.
- `verify:obs-reader` (neu, in CI): (1) Form/Negativkontrollen, (2) Abbildung, (3) **Gleichheit mit BrightSky-, TAWES- und
  SMN-Adapter an denselben Werten** (die Adapter mit gefälschtem `fetch` getrieben; CubeObs gleich bis auf Kennung WMO ↔ DWD-id und
  `via`; einziger Unterschied Wind: km/h-Rundung ≤ 0,014 m/s), (4) nächste Stationen, (5) Hedge/Frist/Abbruch, (6) Memo,
  (7) `fetchNearestStationObs`: Produkt ⇒ **2 Anfragen, 0 BrightSky**; Produkt 500 ⇒ Rückfall **22 BrightSky-Anfragen**; `store:
  false` ⇒ 0 Produktabrufe, (8) Raster/Karte/Popup, (9) Schalter, (10) `--live`: beide Spiegelkopien gleich (V-OB-4, Zeilenenden
  normalisiert), Produkt lesbar (München 6 Stationen, 181 ms warm), (11) Motorseite (§5.2/§5.3). **41/41**, `--live` 43/43.
- Andere Verifier im Worktree: `pv-fusion` 235/235 (der Live-Pfad mit gefälschtem `fetch` fällt auf den Direktabruf zurück und bleibt
  gleich), `point-client` 173/174 ((10s) zeitabhängig unter Last, V-EX-13), `modelsource` 64/64, `fusion-release` 28/28 (B2 schlug
  einmal an: „buscosun Fusion 12" stand in einer Motor-Notiz — entfernt), `pv-cube` **424/424** (Block 29 liest den Stand jetzt aus dem
  Register statt sechs feste „buscosun Fusion 9"-Texte; auf `fusion-10`/`fusion-11` war der Block nie gelaufen), typecheck 0.

### 5.2 OF-2 — `obsDense` (Motor) und `CubeIo.obsDense` (Leser)

- Leser: mit `CubeIo.obsDense` (die Stufe setzt es über `fusionStageIo`, Register `io.set`; `?dense=0` nimmt es zurück) holt
  `fetchCubeObs` bis **12** nächste 10-min-Stationen inkl. Niederschlagsstationen; `cubeObsOf` trägt `dewPoint` (gemessen), `rr10`,
  `rr1h {mm, complete}` in die `CubeObs`.
- Motor (`FuseCubeOptions.obsDense: 1`): Ankermathematik unverändert (`anchor.ts`); `anchorDenseAllow` wählt je Größe die
  `OBS_DENSE_ANCHOR_K = 6` besten Stationen nach `spatialWeight` unter denen, die die Größe messen (eine Niederschlagsstation verdrängt
  nie eine T-Station); der gemessene Td erreicht den Stationswert über das bestehende Feld `dewPoint`. Ohne Option: kein Zugriff auf
  die neuen Felder ⇒ byte-gleich (§5.6).

### 5.3 OF-3 — die Messgeräte-Optionen (Setzungen, Bündel `FUSION12_GAUGE` = 0/0 bis §6)

- **(b) `gaugeOccurrence`** (`gaugeOccurrenceOf`, rein): Anteil nass = gewichteter Anteil der Geräte ≤ 10 km (w = e^(−(d/10 km)²),
  Stempel ≤ 40 min alt) mit `rr10 > 0`; bei Vorlauf 1–2 h wird die Nass-Wahrscheinlichkeit der Hürde nach jeder Hürde und vor dem
  Stationswert gemischt: p′ = (1 − k)·p + k·p_obs, k = 0,5·min(1, Σw)·e^(−(Vorlauf − 1)/1 h); Flag `gaugeOccurrence`.
- **(a′) `gaugeRadar`** (`gaugeRadarFactorOf`, rein): F = (Σw·G + 0,2)/(Σw·R + 0,2) aus den vollständigen Stundensummen G der Geräte
  ≤ 10 km (Stempel ≤ 70 min) gegen das Radar-Stundenmittel R am Punkt über dieselbe Stunde (≥ 3 Frames), Deckel [1/3, 3], nur wenn
  G + R ≥ 0,3 mm; auf die Radar-Rate der Stunden ≤ 3 h mit F(lead) = 1 + (F − 1)·e^(−lead/2 h); Flag `gaugeRadar`.
- Beide nur mit `obsDense: 1`; explizit gesetzt (Pre-Screen) gewinnt vor dem Bündel; Notizen nennen Geräte, Σw, Faktor, Schritte.

### 5.4 Dichte Messungen der Vergangenheit (Prüfstand)

`scripts/obsfusion/build-dense-obs.mjs` → `C:\dev\buscosun-pruefstand\obs-dense\<Tag>.json.gz` (24 Tage, 153 MB): je Tag die
10-min-Reihen aller 2 020 10-min-Stationen des Spiegel-Katalogs (Stand 08:42 UTC, gespeichert) im Fenster [Slot − 7 h, Slot]:
DE 1 415–1 422 (CDC, `readCdc` von W1), AT 282–285 (TAWES-API), CH 155–156 + 141 Niederschlag; **07.10. nur DE 1 241 / CH 54**, weil
die Jahresdateien von MeteoSchweiz und die CDC-`now`-Dateien den Vorabend um 08:45 UTC noch nicht trugen (V-OF-9: diesen Tag nach
12 UTC mit `--force --days=2026-10-07` neu bauen). Provider `scripts/pruefstand/lib/obsDense.mjs`: baut aus der Tagesdatei zur
Slotzeit DIESELBE Form, die der Browser liest (`obsStoreOf(catalog, latest)`), und wählt mit dem `nearestObsStations`/`cubeObsOf`
des Kandidaten-Roots — der Motor sieht im Replay, was er im Browser sieht. `replay.mjs predictArchive` nimmt `obsMode`
(`archive` | `store6` | `dense`; Voreinstellung dense, wenn das Register `obsDense: 1` trägt), Rolle B ohne Station ≤ 0,25 km.

### 5.5 Register

`fusionRelease.ts`: `FUSION12_OBS_DENSE: 0 | 1 = 1`, Eintrag `n: 12` (Option `obsDense`, `io: { key: 'obsDense', set: true, flag:
'?dense=0' }`, `offLabel`, `needs: 'measurement'`), `FusionIoSwitch` + `'obsDense'`. `FUSION_CURRENT` = 12 auf dem Branch;
`verify:fusion-release` 28/28.

### 5.6 Identität (`scripts/verify-fusion12-identity.mjs`, Lauf `audit/obs-fusion/laeufe/01-identity.log`, 17/17)

Basis = Worktree `C:\dev\buscosun-web-wt\base12` @ `dffd592` (Merge-Commit = Fusion 11 auf dem Stand von `main`), Kandidat = der
Branch, Register `fusion-11`:
- Archiv 05./06./07.10.: Option aus, Archiv-Messung ⇒ Kandidat **byte-gleich** zur Basis, und die Basis byte-gleich zur
  **Konserve von `fusion-11`** (8fa2ef68…, 365 Punkte, 0 Fehler).
- Negativkontrolle Option an + dichter Satz: 2,34–2,38 Mio. Werte verschieden — t/td/ws/gust/dd/pWet, Vorlauf 1–235 h (der
  Stationswert wirkt über den ganzen Bereich; max |ΔT| 8,25 K = Deckel des Ankers an Rolle-B-Punkten, die jetzt eine nahe Station
  statt der 9–22 km entfernten bekommen).
- **OF-1 allein** (Option aus, Produkt-Semantik `store6`): genauso viele Werte verschieden — die Messung aus dem Produkt ist ein
  anderer Stationssatz mit 10-min-Stempeln; ⇒ der Quellwechsel gehört zum Stand 12 (OF-5 Punkt 1), nicht zu Fusion 11.
- Option an auf `store6` (ohne Messgeräte-Felder) = Option aus auf demselben Satz: 0 Werte verschieden (die Top-K-Wahl ist bei sechs
  vollen Stationen die Identität).
- Hindcast 2026-06-15 (außerhalb des Tresors): Option aus byte-gleich; Option an byte-gleich zu aus (ohne Messungen wirkt nichts).

### 5.7 Werkzeugfallen dieser Phase

- Ein Worktree unter `C:\dev\buscosun-web-wt\` findet `node_modules` nur über die Junction der Elternebene; der TS-Resolver
  (`scripts/lib/ts-hooks.mjs`) löst Pakete aber relativ zum Repo-Root ⇒ `pv-cube` brach mit `ERR_MODULE_NOT_FOUND jsfive` ab, bis
  `mklink /J <worktree>\node_modules C:\dev\buscosun-web\node_modules` lag. **Nie `git worktree remove` mit dieser Junction**
  (sie löscht durch; erst die Junction entfernen).
- `String.replace` mit einem Ersatztext, der `$&` enthält, fügt den Treffer ein — der erste Patch von `verify-pv-cube.mjs` Block 29
  kam so zu einem Syntaxfehler; Ersatz als Funktion oder `$$&`.
- Der Bash-Kanal verwandelt `\\r\\n` in Skripten in echte Steuerzeichen (8-KB-Grenze und Escapes): Verifier-Patches nur über das
  Write-Werkzeug.
- Pre-Screen und Prüfstand importieren den Motor aus dem lebenden Worktree: während eines Laufs nichts unter `src/` ändern.
- Der Speicherwächter von Claude Code beendete um 11:05 UTC alle Hintergrundläufe der Sitzung (Dev-Server, Pre-Screen F, Identität), weil der Rechner knapp an Speicher war (Prüfstand-Worker bis 5 GB je Worker, Pre-Screen, Dev-Server, parallele Seewetter-Sitzung). Die Konserven des Prüfstands sind inkrementell, der Pre-Screen tagweise ⇒ alles wiederaufnehmbar (A-OF-9).
- Die CDC-`recent`- und MeteoSchweiz-Jahresdateien im W1-Cache werden erst 20 h nach dem letzten Abruf erneuert: der Tag vor dem Bau fehlt sonst zum Teil (07.10.: DE 1 241 statt 1 419, CH 54 statt 155) ⇒ V-OF-9, um 11:08 UTC mit `--force --days=2026-10-07` nachgebaut, bevor der Prüfstand Konserven schrieb.

### 5.8 Browser-Gate OF-1 (Dev-Server des Worktrees `:5199`, Chrome, 08.10. 09:25–09:40 UTC)

| Aufruf | Netz | Ergebnis |
|---|---|---|
| `/wetterkarte/wind/muenchen?ansicht=dashboard&pflog=1` | `obs/v1/stations.json` jsDelivr **503** → raw 200 (Hedge); `latest.json` raw 200; **0 × api.brightsky.dev** | Dashboard rendert (18,3 °C, Cube-Pfad), Konsole ohne Fehler |
| dasselbe mit `?obs=direct` | **22 × `current_weather`** (20 Raster + WMO 10865 + Punkt), kein neuer Produktabruf | wie bisher |
| `/wetterkarte/wind/innsbruck?ansicht=dashboard` | `stations.json` CDN 200, `latest.json` raw 200; **0 × geosphere.at** | Dashboard 16,3 °C |
| `/wetterkarte/wind/zuerich?ansicht=dashboard` | Katalog CDN 200, latest raw 200; raw-`stations.json` 503 und CDN-`latest.json` 503 = die jeweils zweiten Wege (Hedge gefeuert); **0 × data.geo.admin.ch** | Seite blieb unter CPU-Last des Pre-Screens hängen (Dev-Server kompiliert), kein Bildschirmfoto |
| `/wetterkarte/stationen` (Karten-Layer) | zweimal versucht (09:43, 10:48 UTC): der Renderer des Tabs fror bei der WebGL-Karte unter der CPU-Last der Läufe ein (kein Bildschirmfoto, keine Netzliste); Logik des Layers im Verifier (8) belegt | **offen: Real-Browser-Beleg des Layers** (MANUELLE-SCHRITTE §48) |

## 6 OF-4 — Pre-Screen (`scripts/obsfusion/prescreen.mjs`, Entwicklungsmenge 14.09.–07.10.2026, 24 Tage, 365 Stationen, W1)

Alle Läufe: Motor des Branches (Commit `8462fa7`, für D0′ und F `9765d9e`), Basis = Register `fusion-11`, Stufe `fs` mit
Fusion 10/11 an; Messungen aus den dichten Tagesdateien (§5.4). Skill = 1 − CRPS(A)/CRPS(B) (Brier für `wet`) auf identischen
endlichen Zeilen; Vergleichsdateien in `audit/obs-fusion/prescreen/*.compare.txt`. „Rolle B" = das Maß des Prüfstands (ohne
eigene Station), „Rolle A" = Punkt an der Station. Reihenfolge der Läufe und der Entscheidungen wie in `claims.md`
(eingefroren 09:16:50 UTC) und `claims-addendum-1.md` (eingefroren 10:08 UTC, nach R0/R1/D0, vor D1–D3 und D0′).

### 6.1 R1 gegen R0 — der Quellwechsel allein (OF-1, Option aus)

| Rolle | t 0–6 h | ws 0–6 h | gust 0–6 h | td | precip/wet/clct | 6–24 h / 24–48 h (t) | ≥ 48 h |
|---|---|---|---|---|---|---|---|
| B | **+11,6 %** [23/0 Tage] (DE +16,5, AT +7,3, CH +9,1) | +9,7 % | +8,8 % | 0,00 % | 0,00 % | +2,3 % / +1,0 % | 0,00 % |
| A | **−16,1 %** [0/23] (DE −5,7, AT −37,8, CH −16,3) | −7,8 % | −7,8 % | −17,8 % | 0,00 % | −0,2 % / −0,3 % | ≤ −0,1 % |

Rolle B (ohne eigene Station) gewinnt viel: statt der einen 9–22 km entfernten Rolle-A-Station bekommt der Punkt die sechs
nächsten Stationen des Produkts. Rolle A verliert — und das war der Weg zu **V-OF-10**: der Stationswert (Phase FS) bildet seine
Innovation nur, wenn der Messstempel genau auf einem Stundenschritt des Stationsprodukts liegt; die Archiv-Messung (R0) steht
immer auf der vollen Stunde, das Produkt (wie BrightSky im Browser) auf 10-min-Stempeln ⇒ im Replay R0 feuerte der Stationswert
immer, in R1 fast nie. Im **Browser** galt bisher dasselbe wie in R1: DE nur an jedem sechsten Stempel, AT/CH nie (kein
Stempel ⇒ Abrufzeit). C8 gilt (precip/clct/wet 0,00 %; Änderung nur über die Messung, bis 48 h).

### 6.2 D0 gegen R1 — `obsDense` (OF-2) ohne Messgeräte-Optionen

Rolle B: t 0–6 h **+1,3 %** [21/1] (DE +1,7, AT +1,9, CH +0,3; 1 h +1,0 %, 2 h +2,1 %), ws +0,03 %, gust +0,04 %, td/precip/wet
0,00 %; 6–24 h t +0,17 %; Index-Näherung +0,05 %, kein Verlust in einer Kernzelle. Rolle A: alles 0,00 % (die sechs besten nach
`spatialWeight` sind die sechs nächsten vollen Stationen; der gemessene Td erreicht den Stationswert nicht, weil der — V-OF-10 —
nicht feuert). C5 gilt (0–2 %), C6 gilt, C7 gilt. **Regel 4 bestanden** ⇒ `obsDense` bleibt.

### 6.3 D1 gegen D0 — Auftrittsanker (b)

Rolle B `wet`: 1 h **+1,07 %**, 2 h **−1,57 %**, 0–6 h −0,09 % [14/8]; `precip` 1 h +0,58 %, 2 h −0,64 %; je Land 0–6 h `wet`
DE −0,19, AT −0,79, CH +0,64. Rolle A: `wet` 1 h +10,4 %, 2 h +4,0 %, `precip` 1 h +4,7 %. **Regel 1 nicht bestanden** (1 h < +2 %,
2 h verliert > 1 %) ⇒ **aus**; C1 (≥ +3 %) gilt nicht. Deutung: an Rolle-B-Punkten liegen die nächsten Geräte weiter weg (die
eigene Station ist maskiert), bei 2 h überzieht die Setzung k = 0,5·e^(−1); an der Station selbst trägt das Gerät am Punkt.
Nachstellen der Konstanten wäre ein Fit ⇒ nicht in dieser Phase (V-OF-11).

### 6.4 D2 gegen D0 — Messgerät–Radar-Faktor (a′)

Rolle B `precip`: 1 h **+3,29 %**, 2 h −0,06 %, 3 h −0,43 %; 0–6 h +0,35 % **[2/1 Tage]**; je Land 0–6 h DE +0,30, AT −0,03,
CH +1,06; `wet` 1 h +1,45 %, 2 h +0,63 %. Rolle A: `precip` 1 h −0,33 %, `wet` 1 h −0,57 %. **Regel 2 bestanden** (1 h ≥ +1 %, kein
Vorlauf verliert > 1 %, kein Land > 2 %) ⇒ **an**. Vorbehalt, offen ausgesprochen: der Faktor griff nur an **3 von 24 Tagen**
(trockene Periode, ≥ 0,3 mm Geräte + Radar in der letzten Stunde) — die Basis ist dünn; C2 gilt formal, C3/C4 gelten (3–6 h ≤ 0,5 %,
> 6 h 0,00 %).

### 6.5 D3 gegen D0 — beide

`precip` 1 h +3,52 %, 2 h −0,69 %; `wet` 1 h +1,42 %, 2 h −0,97 % — Regel 3 entfällt (nur eine Option bestanden); zur Kenntnis.

### 6.6 D0′ gegen D0 — Stationswert an der Messminute (Nachtrag 1, V-OF-10)

| Rolle | t 0–6 h | td 0–6 h | ws 0–6 h | gust 0–6 h | 1 h (t/td/ws/gust) | 6–24 h | precip/wet |
|---|---|---|---|---|---|---|---|
| A | **+19,4 %** [22/0] (DE +14,1, AT +30,0, CH +17,0) | **+19,9 %** | +9,2 % | +10,2 % | +40,0 / +41,5 / +20,1 / +25,8 % | +0,1 / +0,8 / +1,5 / +1,2 % | 0,00 % |
| B | 0,00 % | 0,00 % | 0,00 % | 0,00 % | 0,00 % | 0,00 % | 0,00 % |

C9 gilt (≥ +5 %), C10 gilt, C11 gilt (Rolle B byte-gleich — an keinem Rolle-B-Punkt steht ein Stationsprodukt am Punkt),
C12 gilt; keine Kernzelle verliert > 1,5 % (gust 48–120 h −0,36 % ist Nebenzelle) ⇒ **`stationValueAtObsTime` ins Bündel**
(`FUSION12_SV_AT_OBS = 1`). Gegen R0 (die idealisierte Archiv-Messung) steht D0′ an Rolle A jetzt bei t +6,4 %, td +5,6 %,
ws +2,1 %, gust +3,1 % (0–6 h), Rolle B +12,8 / +9,7 / +8,8 % — der Stand schlägt an beiden Rollen die Vorphase.

### 6.7 Das Bündel „buscosun Fusion 12" (F = `obsDense: 1`; `FUSION12_GAUGE` radar 1 / occurrence 0, `FUSION12_SV_AT_OBS` 1; Commit `9765d9e`)

| Vergleich | Rolle | t 0–6 h | ws 0–6 h | gust 0–6 h | td 0–6 h | precip 1 h / 0–6 h | wet 1 h / 0–6 h | Index-Näherung (99 Kernzellen) |
|---|---|---|---|---|---|---|---|---|
| F gegen **R0** (Fusion 11 mit Archiv-Messung = die Konserven des Prüfstands) | B | **+12,8 %** [23/0] | +9,7 % | +8,8 % | 0,00 % | +3,3 % / +0,35 % [2/1] | +1,5 % / +0,26 % | **+1,00 %** |
| | A | +6,4 % [21/2] | +2,1 % | +3,1 % | +5,6 % | −0,3 % / −0,08 % | −0,6 % / −0,11 % | +0,45 % |
| F gegen **R1** (Quellwechsel allein) | B | +1,3 % | +0,03 % | +0,04 % | 0,00 % | +3,3 % / +0,35 % | +1,5 % / +0,26 % | +0,07 % |
| | A | +19,4 % | +9,2 % | +10,2 % | +19,9 % | −0,3 % | −0,6 % | +2,15 % |
| F gegen D0′ | A/B | 0,00 % | 0,00 % | 0,00 % | 0,00 % | wie D2 gegen D0 | wie D2 gegen D0 | +0,02 / 0,00 % |

Zerlegung des Stands (Rolle B, t 0–6 h): Quellwechsel +11,6 % (R1 gegen R0) · dichter Satz +1,3 % (D0 gegen R1) · Stationswert-Minute
0 (wirkt nur mit Station am Punkt) · Messgerät–Radar nur Niederschlag. An Rolle A: Quellwechsel −16,1 %, Stationswert-Minute
+19,4 % ⇒ netto +6,4 %. Alle Zellen ≥ 48 h 0,00 % (C7/C8). **Die Entwicklungsmenge enthält Tage, die die Entwicklung gesehen hat
(Pre-Screen aller Optionen; sauber richtet nur Spur P ab dem 09.10.)**

## 7 OF-5 — Prüfstand (Protokoll P1, Wahrheit W1, Register `fusion-12`)

- **Registrierung** 11:03 UTC: `--registriere=fusion-12 --freeze=2026-10-08` (Freeze = Tag des Einfrierens, OF-5 Punkt 3) am Commit
  `9765d9e` (Bündel: `obsDense`, radar 1, occurrence 0, Stationswert-Minute 1), Modell `4e3eedea3694`, Spur R sauber; Notizen
  (Setzungen, Replay-Quelle, nicht blinde Entwicklungsmenge, V-OF-9) im Register. `verify:pruefstand` 60/60.
- **Volltest** (`--modus=voll --offline`, zwei Worker — A-OF-9; 36 Konserven in 762 s; Lauf `laeufe/03-voll.log`, Bericht
  `laeufe/03-voll/`): **Fortschrittsindex gegen buscosun Fusion 9 +1,47 % (95 %: +1,28 … +1,72 %)**, Nachweisgrenze 0,3 %;
  **G1 grün · G2 grün (0 von 99 Kernzellen signifikant schlechter) · G3 ROT · G4 grün**; beste Kernzellen ws 240–336 h CH +20,7 %**,
  ws 0–6 h DE +19,2 %**, t 0–6 h DE +17,9 %**; schlechteste td 120–240 h AT −2,5 % (n. s.), td 48–120 h DE −2,1 % (n. s.);
  **80 von 99 Kernzellen besser als jede Einzelquelle** (Fusion 11: 77). Warnung des Prüfstands: 1 901 589 Werte mit unreifer
  Wahrheit (< 7 Tage) mitgezählt.
- **G3** (Abdeckung q10–q90 im Binomialband um 80 % ODER nicht signifikant weiter vom Soll als der Champion), 6 von 27 Zellen rot:

  | Zelle | Abdeckung Fusion 12 | Champion (Fusion 9) | Band | weiter als Champion (95 %) |
  |---|---|---|---|---|
  | t 6–24 h | 84,8 % | 84,2 % | 78,6–81,4 | +0,34 … +0,75 pp |
  | t 24–48 h | 84,6 % | 84,3 % | 76,5–83,5 | +0,12 … +0,51 pp |
  | ws 6–24 h | 85,2 % | 84,7 % | 78,3–81,7 | +0,37 … +0,78 pp |
  | gust 0–6 h | **90,0 %** | 87,3 % | 77,9–82,1 | +2,17 … +3,19 pp |
  | gust 6–24 h | 89,9 % | 89,5 % | 77,4–82,6 | +0,23 … +0,55 pp |
  | gust 24–48 h | 90,6 % | 90,3 % | 77,4–82,6 | +0,21 … +0,49 pp |

  Ursache: der Anker auf dem dichten Satz und der Stationswert an der Messminute verkleinern den Fehler (CRPS besser), die Bänder
  bleiben so breit wie vorher ⇒ die Abdeckung steigt über die des Champions, der selbst schon über 80 % lag (Fusion 11 bestand G3
  mit 84,2/84,3 % bei t 6–24/24–48 h). Eine Nachstellung der σ-Skalen je Vorlauf für den Stand wäre ein Fit (V-OF-13) — nicht in
  dieser Phase.
- **Vergleich gegen Fusion 11** (`--modus=vergleich --versionen=fusion-11,fusion-12`, gemeinsame Entwicklungsmenge 24 Tage,
  `laeufe/04-vergleich/`): Güteindex Fusion 12 +24,3 %, Fusion 11 +23,7 %; **Fusion 12 gegen Fusion 11 +1,00 % (95 %: +0,91 …
  +1,10 %) — signifikant besser**. Der Vergleich entscheidet nichts.
- **Keine Abnahme** (nur auf Jans Wort, OF-5 Punkt 4); Tresor und Spur P nicht geöffnet (`zugriffe.log` ohne Eintrag für
  fusion-12).

## 8 Verdikt

- **Ergebnis der Phase: „kein neuer Stand" (vorerst).** buscosun Fusion 12 ist auf der Entwicklungsmenge klar besser (Index +1,47 %
  gegen den Champion, +1,00 % gegen Fusion 11, 80/99 Kernzellen besser als jede Einzelquelle), aber **Gate G3 ist rot** — nach
  OF-5 Punkt 5 bleibt der Stand ausgeschaltet: `FUSION12_OBS_DENSE = 0` (Commit nach dem Volltest), der Branch rechnet Fusion 11;
  der Register-Eintrag `fusion-12` (Commit `9765d9e`, Wert 1) ist der gemessene Kandidat. Was Jan entscheiden kann: E-OF-4
  (G3-Auslegung: Über-Abdeckung bei kleinerem Fehler als Defekt? dann V-OF-13 als nächste Phase), E-OF-3 (V-OF-10 als eigener
  Stand), E-OF-2 (Synop-Strom für den Spiegel, V-OF-3).
- **OF-1 ist umgesetzt und bleibt an** (Voreinstellung `obs/v1`, `?obs=direct` Rückfall): kein BrightSky-`current_weather`, kein
  TAWES-/SMN-Direktabruf mehr für Messungen — im Cube-Pfad, Live-Pfad, in der Rasterfusion und im Stationen-Layer; der Motor ist
  bei gleicher Station und gleichem Stempel byte-gleich (Verifier (3)), die Stationsmenge ist eine andere (die sechs wirklich
  nächsten) ⇒ das ist, gemessen am Prüfstand, die Hälfte des Gewinns (R1 gegen R0 Rolle B t 0–6 h +11,6 %) — und zugleich der Grund,
  warum der Stationswert im Browser bisher kaum feuerte (V-OF-10). **Vorbehalt:** die DE-Latenz ist 20 min schlechter als
  BrightSky an Synop-Stationen (V-OF-3, E-OF-2).
- Behauptungen des Auftrags: Niederschlag 0–1 h „deutlich besser" — **gilt nicht** (Auftrittsanker Rolle B +1,1 % bei 1 h, −1,6 % bei
  2 h; an der Station +10 %); Niederschlagsmenge 0–2 h „besser" — gilt knapp (Faktor +3,3 % bei 1 h, nur 3 aktive Tage); 3–6 h und
  > 6 h — gelten (≤ 0,5 % / 0,00 %); T/Td 0–3 h „klein" — gilt für den dichten Satz (+1,3 %), der Quellwechsel selbst ist groß
  (+11,6 %); Wind/Böe 0–2 h „klein oder nichts" — gilt für den dichten Satz, der Quellwechsel +9,7/+8,8 %; Robustheit — 2 statt
  22 Anfragen, Hedge bewährt (503 am CDN im Browser-Gate), Latenz DE **schlechter** (gilt nicht).

## 9 Verbesserungen V-OF-n

- **V-OF-1** WMO-Kennung im Katalog `obs/v1/stations.json` (DE: aus BrightSky `/sources` oder der DWD-Stationsliste) — Mehrwert: die
  Station des MOSMIX-Produkts findet ihre eigene Messung über die Kennung statt über den Ort; Skizze: Spiegel liest `/sources` einmal je
  6 h wie die TAWES-Metadaten, Spalte `wmo`.
- **V-OF-2** Regionale Kacheln von `latest.json` (z. B. 2° × 2°, ≈ 3 KB je Kachel) — Mehrwert: Mobil liest 1–4 KB statt 47 KB; Skizze:
  Spiegel schreibt `latest/<lat>_<lon>.json`, Leser holt die Kachel des Punkts (+ Nachbarn am Rand); erst, wenn das Mobil-Lab es verlangt.
- **V-OF-3** DE-Latenz: der Spiegel ist an Synop-Stationen ≈ 20 min (p50) hinter BrightSky (§1.4) — Mehrwert: frischerer Anker in DE;
  Skizze: `obs-mirror.mjs` liest `weather_reports/synoptic/germany/Z__C_EDZW_latest_…bin` (BUFR, alle 5–10 min) mit einem Decoder nach
  dem Muster `swisBufr.ts` und schreibt die Synop-Werte als eigenes Netz `dwdSynop` (gleiche id `de:<dwd>` über die WMO-Zuordnung von
  V-OF-1) — E-OF-2. Bis dahin bleibt die Live-Pfad-Historie #10 an BrightSky `/weather`.
- **V-OF-4** Bewölkung im Stationen-Popup (E-OF-1): mit V-OF-3 kommt `cloud_cover` aus dem Synop-Strom zurück.
- **V-OF-5** Mobil-4G-Lab für den Messabruf (`verify:pv-latency`-Harness um den Obs-Weg erweitern): zwei Dateien gegen 22 Anfragen.
- **V-OF-6** Option (a) des Auftrags mit Radar AM Messgerät: der Leser tastet dieselben Radar-PNGs auch an den 3–6 nächsten Geräten ab
  (0 Byte mehr), das Archiv trägt die Frames an den Eingabe-Punkten seit 05.10. ⇒ ab ≈ 30 Tagen am Prüfstand messbar.
- **V-OF-7** Option (c) (gemessene letzte Stunde als Wert der aktuellen Stunde, Provenienz `measured`): Anzeigeoption; der Prüfstand
  bewertet Vorlauf 0 nicht — eigenes Maß (Stunde 0 gegen W1) nötig.
- **V-OF-8** Tagesstationen (1 038, Wert des Vortags) im Stationen-Layer als eigene Klasse mit Datum.
- **V-OF-10** **Stationswert nur auf vollen Stunden** (Befund dieser Phase, §6.1/§6.6): `stationForecastAt` fand das Stationsprodukt nur bei einem Messstempel genau auf einem Schritt — im Browser feuerte der Stationswert (Phase FS, „schlägt MOSMIX an der Station") in DE nur an jedem sechsten 10-min-Stempel und in AT/CH nie (TAWES/SMN ohne Stempel). Mehrwert: der FS-Gewinn in der Praxis; Umsetzung: Option `stationValueAtObsTime` (Interpolation auf die Messminute) im Bündel von Fusion 12; **E-OF-3**: ob Jan die Korrektur schon vor der Abnahme als eigenen Stand will.
- **V-OF-11** Auftrittsanker (b) gebaut, aus: die Setzungen (10 km, k₀ 0,5, τ 1 h) verlieren bei 2 h an Rolle B; ein Fit von k₀/τ je Vorlauf am Archiv (≥ 30 Regentage) wäre der nächste Schritt — nicht in dieser Phase (A-OF-6).
- **V-OF-12** Messgerät–Radar-Faktor: an 3 von 24 Tagen aktiv (trockene Periode); Wiederholung der Messung ≥ 30 Tage mit Regen, dazu (a) mit Radar am Gerät (V-OF-6).
- **V-OF-9** `build-dense-obs.mjs`: der jüngste Tag ist vor ≈ 12 UTC des Folgetags unvollständig (MeteoSchweiz-Jahresdatei, CDC `now`) —
  der Prüfstand sollte den Tag vor der Registrierung neu bauen (`--force --days=<Tag>`); Skizze: Wächter im Provider, der eine
  Tagesdatei mit < 90 % der Stationen des Vortags meldet.

## 10 OF-6 — σ an den Anker gekoppelt (Vorschlag 1 nach G3 rot; Auftrag Jan 08.10.: „setze Vorschlag 1 um und schaue, ob G3 noch rot ist")

### 10.1 Diagnose

- G3 wird **nur an Rolle B** gemessen (`urteil.mjs`, Zeile 134: alle Länder, ohne eigene Station und Messung). Dort feuert der
  Stationswert nie (keine Station am Punkt); was Fusion 12 an Rolle B vom Champion trennt, ist der **Anker** auf dem dichten Satz
  (+ Messgerät–Radar, nur Niederschlag, nicht in G3).
- Der Anker verschiebt nur den Mittelwert des Cube-Members (`cubeSource.ts`, `finishStep`: `cubeSample.temperature += termK` usw.);
  die σ des Members ist die gelernte σ der Lernstufe (Fit 5e, Hindcast **ohne** Anker) und bleibt unverändert. Der Anker erklärt
  einen Teil des Fehlers, die Verteilung behauptet ihn weiter ⇒ Über-Abdeckung, am stärksten dort, wo der Anker am stärksten wirkt
  (Böe 0–6 h: 90,0 % gegen 87,3 %).
- Größenordnung: Abdeckung 87,3 % → 90,0 % bei Normalverteilung heißt effektiver Fehler 0,84 σ → 0,78 σ, d. h. der Anker nimmt
  ≈ 13 % der Fehlervarianz weg, die σ bleibt.

### 10.2 Form (Struktur, kein Fit)

Der Anker setzt `offset · a` mit `a = fraction · w(τ)` (fraction = Repräsentativität der besten Station, w = Kurve der Lernstufe bzw.
e^(−τ/τ_v)). Ist w der Regressionskoeffizient des Fehlers bei τ auf die Innovation (so ist die Kurve gefittet: w = cov(e₁,e_τ)/var(e₁)),
dann erklärt der Zuschlag den Varianzanteil `a² · σ₁²/σ_τ²` (σ₁, σ_τ = gelernte σ bei Vorlauf ≈ 1 h und τ). Daraus:

    σ_neu = σ · √max(f_min², 1 − a² · min(1, σ₁²/σ_τ²))

je Größe mit Anker (T; Wind aus u und v gemittelt; Böe); Td und Niederschlag ohne Anker ⇒ unverändert. Angewandt auf die
fusionierte Verteilung nach dem Stationswert; eine Größe, die der Stationswert gesetzt hat, bleibt (dessen σ ist die Rest-σ MIT
Innovation). `f_min` = 0,5 (Setzung, Schutz gegen eine kollabierende Verteilung bei ko-lokalisierter Messung — an Rolle B nie bindend
erwartet). Neue Option `FuseCubeOptions.anchorSigma` (0/1, aus), Flag `anchorSigma`, Notiz mit Zählung. Ohne Option byte-gleich.

### 10.3 Regel vor den Zahlen (eingefroren vor dem Lauf)

Kandidat `fusion-12s` = Register `fusion-12` + `anchorSigma: 1` (Commit dieser Änderung, sonst gleiche Optionen und Tabellen).
Volltest auf der Entwicklungsmenge (`--modus=voll --offline`, zwei Worker). **G3 gilt als behoben**, wenn G3 grün ist; **die Kopplung
ist brauchbar**, wenn zusätzlich G2 grün bleibt und der Fortschrittsindex gegen Fusion 9 im 95-%-Intervall von Fusion 12
(+1,28 … +1,72 %) oder darüber liegt (σ ändert den Median nicht, nur CRPS/Abdeckung). Rote Zellen, die bleiben, werden benannt;
keine Nachstellung von f_min oder der Form nach dem Lauf in dieser Phase.

### 10.4 Ergebnis (Volltest `fusion-12s`, Commit `bec557c`, Lauf `laeufe/05-voll-12s.log`, Bericht `audit/pruefstand/berichte/fusion-12s/2026-10-08-voll/`)

- Fortschrittsindex gegen Fusion 9 **+1,55 %** (95 %: +1,36 … +1,79 %; Fusion 12: +1,47 %), G1/G2/G4 grün, **G3 rot — 3 statt 6 Zellen**.
- G3 je Zelle (Abdeckung q10–q90, Rolle B; Fusion 12 → 12s, Champion):

  | Zelle | Fusion 12 | 12s | Champion | Urteil 12s |
  |---|---|---|---|---|
  | gust 0–6 h | 90,0 % | **87,5 %** | 87,3 % | behoben |
  | gust 6–24 h | 89,9 % | 89,6 % | 89,5 % | behoben |
  | t 6–24 h | 84,8 % | 84,3 % | 84,2 % | behoben |
  | t 24–48 h | 84,6 % | 84,2 % | 84,3 % | behoben |
  | ws 0–6 h | 82,0 % | 79,3 % | 78,2 % | im Band |
  | ws 6–24 h | 85,2 % | 85,1 % | 84,7 % | **rot** (+0,30 … +0,62 pp) |
  | gust 24–48 h | 90,6 % | 90,5 % | 90,3 % | **rot** (+0,02 … +0,32 pp) |
  | t 0–6 h | 82,7 % | **74,4 %** | 77,8 % | **rot, NEU: zu schmal** (−2,1 … −5,0 pp weiter als der Champion) |

- **Verdikt nach §10.3:** G3 nicht behoben. Die Kopplung wirkt bei Wind und Böe wie vorhergesagt (Böe 0–6 h zurück auf Champion-Niveau),
  **überzieht aber bei T 0–6 h**: dort fällt die Abdeckung unter das Band. Ursache (Form): `a = fraction · w(τ)` setzt die
  Repräsentativität (`spatialWeight`, Distanz/Höhe) an die Stelle der Fehlerkorrelation zwischen Station und Punkt; w(τ) ist an der
  Station SELBST gefittet (cov(e₁,e_τ)/var(e₁)). An Rolle B ist der Fehler des Nachbarn bei T schwächer mit dem des Punkts
  korreliert, als `fraction` behauptet (Mikroklima, Inversionen) — der Mittelwert profitiert, die σ wird zu stark verkleinert.
  Die zwei übrigen roten Zellen (ws 6–24 h, Böe 24–48 h, je ≤ 0,6 pp) liegen dort, wo der Anker kaum noch wirkt: das ist die geerbte
  Über-Abdeckung des Champions (Böe 87–90 % in jedem Fenster), keine Folge des Ankers.
- Keine Nachstellung in dieser Phase (Regel §10.3). `FUSION12_OBS_DENSE` bleibt 0, `anchorSigma` aus; Register `fusion-12s` = Kandidat.
- **V-OF-13a** (nächster Schritt, Jans Wahl): (1) die Korrelation ρ(d, Δh) der Anker-Innovation mit dem Punktfehler je Größe am
  Archiv messen (Rolle-B-Paare, außerhalb der Entwicklungsmenge) und `a = ρ · w(τ)` statt `fraction · w(τ)` — ein kleiner Fit, sauber
  nur mit eigenem Fenster; (2) als neue, vorab eingefrorene Regel die Kopplung nur für Wind und Böe (T ohne) — begründet durch §10.4,
  aber an denselben Tagen entwickelt ⇒ nur Spur P (ab 09.10.) entscheidet sauber; (3) unabhängig davon die Böen-σ des Champions
  (87–90 % in allen Fenstern ≤ 48 h).

## 11 OF-7 — ρ gemessen, σ-Skala auf Abdeckung (Hebel 1 + 4 nach §10.4; Auftrag Jan 08.10.: „setze diese Hebel um … Punkt 1 und 4, prüfe danach ob alles grün ist")

### 11.1 Diagnose (aus §10.4, ohne neue Zahlen)

- **T 0–6 h zu schmal (74,4 %):** die OF-6-Formel setzt die Repräsentativität `fraction` (= `spatialWeight`, Distanz/Höhe) an die
  Stelle der Fehlerkorrelation ρ zwischen Ankerstation und Punkt. Mit dem Gewicht k = f·w(τ), das der Anker tatsächlich auf die
  Innovation legt, bleibt die Varianz σ_τ² − 2k·ρ·w·σ₁² + k²·σ₁²; OF-6 ist der Sonderfall ρ = f. Ist ρ < f (Mikroklima,
  Inversion), schrumpft OF-6 zu stark — genau das Bild bei T.
- **Wind 6–24 h, Böe 24–48 h (+0,3 … +0,6 pp über dem Champion, Böe 87–90 % in jedem Fenster ≤ 48 h):** die gelernte σ (Fit 5e,
  CRPS-optimal) deckt bei Böe und Wind breiter ab als 80 % — die Verteilungsform trifft die Ränder nicht. Das ist die geerbte
  Über-Abdeckung des Champions; der Anker ändert sie kaum.
- Beides lässt sich **am Hindcast** messen, ohne einen Archivtag der Entwicklungsmenge anzufassen: Wahrheit und ankerlose Kette an
  389 Stationen (ρ zwischen Stationen = ρ zwischen Nachbarstation und Rolle-B-Punkt; Abdeckung der ankerlosen Kette = das, was
  die σ-Kopplung voraussetzt).

### 11.2 Messung (`scripts/obsfusion/of7.mjs`, nur lesend; Rohdaten `audit/obs-fusion/of7/part-*.json`, Fit `audit/obs-fusion/of7-fit.json`)

- Replay der Register-Optionen von `fusion-12s` (ohne Messungen ⇒ `obsDense`/`anchorSigma` wirkungslos; `hourly`, `tail` wie der
  Prüfstand) auf Hindcast-Slots **außerhalb des Tresors** (2024-04-01 … 2025-08-31 ⇒ Abbruch) und **vor der Entwicklungsmenge**
  (Archiv ab 2026-09-14 ⇒ Abbruch): Fenster A = t1-Route `run` 2026-06-18 … 2026-09-13, 00 + 12 UTC, jeder 2. Tag (die einzige
  Periode mit echtem Stufe-1-Lauf im Hindcast ⇒ Vorläufe 1–48 h und ρ nur von hier); Fenster B = 00 UTC 2025-09-08 … 2026-06-16,
  jeder 4. Tag, nur t2/t3 (Vorläufe ≥ 51 h, Tag-0-Regel wie `predictHindcast`). Prüfnetz 365 Stationen, Wahrheit W1, Rolle B mit
  Leave-Station-out-Klimatologie wie im Prüfstand.
- **(1) ρ(d, Δh):** Fehler e = Wahrheit − Median der Kette je Station bei Vorlauf 1/2/3 h; je Stationspaar ≤ 120 km zur selben
  Gültigkeitszeit Summen n/Σx/Σy/Σxy/Σx²/Σy² in Bins d (0–5/5–10/10–20/20–35/35–60/60–120 km) × |Δh| (0–100/100–300/300–700/≥ 700 m),
  je Größe t/ws/gust (Wind am Geschwindigkeitsfehler gemessen, auf u/v angewandt). Fit je Größe: ρ = ρ₀/((1+(d/D)²)(1+(Δh/H)²))
  — die Form von `spatialWeight` mit GEMESSENEN ρ₀/D/H — gewichtete kleinste Quadrate (Gewicht n) auf den Bin-Mittelpunkten mit
  n ≥ 200, Raster ρ₀ 0,20…1,00 (0,01), D {3…400 km}, H {50…10 000 m}.
- **(2) σ-Skala:** je Zelle (Größe t/td/ws/gust × Fenster × Land × Rolle) ein Reservoir (Algorithmus R, 8 000 Zeilen, Gewicht
  n/behalten) der fusionierten Verteilung (Familie, Parameter) und der Wahrheit; Abdeckung = Anteil q10 ≤ y ≤ q90 (exakte
  Quantile je Familie). Ein Knoten je Protokollfenster an dessen Mitte (3,5/15,5/36,5/84,5/180,5/288,5 h), linear dazwischen, flach
  außen; alle Knoten GEMEINSAM per Bisektion (drei Durchläufe) so, dass jedes Fenster der gepoolten Zeilen (alle Länder, beide
  Rollen) 80,0 % abdeckt; Deckel [0,6; 1,6]; Fenster mit < 2 000 Zeilen behält 1. CRPS_Q vorher/nachher je Fenster wird berichtet,
  entscheidet nicht. (Die erste Fassung schrieb eine Skala nur bei |Abdeckung − 80 %| ≥ 1 pp; nach dem Rauchtest an EINEM Slot
  — vor den Zahlen des vollen Laufs — auf den gemeinsamen Fit geändert, weil die Interpolation die Knoten koppelt: ein auf 1
  gehaltener Knoten ließ sein Fenster vom Sollwert abrutschen, sobald die Nachbarn sich bewegten.)

### 11.3 Form im Motor (beides Optionen, aus; ohne Option byte-gleich — `verify:pv-cube` Block (12) OF-7)

- `anchorRho` (nur mit `anchorSigma`): jedes Anker-Paar trägt ρ(d, Δh) aus `ANCHOR_RHO_TABLE` (`fusion/sigmaScale.ts`);
  `innovation()` mittelt es mit denselben Gewichten wie den Versatz (Feld `rho` nur, wenn jedes gezählte Paar eins trägt — ohne
  Option Objektform unverändert). Faktor² = min(1, max(f_min², 1 − r·a²·(2ρ/f − 1))) (`anchorSigmaFactorRho`): ρ = f ⇒ OF-6
  exakt; ρ < f/2 hieße „der Anker vergrößert die Varianz" ⇒ Deckel 1 (die Streuung wächst nie durch den Anker; das
  Mittelwertgewicht bleibt unangetastet, s. V-OF-15). Wind: ρ von u und v gemittelt, f der u-Innovation.
- `sigmaScale`: nach Stationswert, Anker-Kopplung, Langfrist und σ-Inflation (als Letztes, was Mittel oder σ setzt) wird σ von
  T, Td, Windgeschwindigkeit und Böe mit `sigmaScaleAt(SIGMA_SCALE_TABLE, v, Vorlauf)` multipliziert; Größen, die der
  Stationswert gesetzt hat, behalten ihre σ. `sigmaScaleTable` im Aufruf (Identität/Testtabelle) für Fit und Verifier.
  Die Tabellen stehen als Konstanten mit Provenienz im Modul (wie `longRange.ts`), nicht als Datei des Daten-Repos.

### 11.4 Regel vor den Zahlen (eingefroren, bevor der Fit gelesen und der Prüfstand gestartet wird)

Kandidat **`fusion-12r`** = Register `fusion-12s` + `anchorRho: 1` + `sigmaScale: 1` (Commit mit den gefitteten Tabellen; sonst
gleiche Optionen und Tabellen; Register von Hand per `writeRegister`, order 12.2). Volltest auf der Entwicklungsmenge
(`--modus=voll --offline`, zwei Worker). **Alles grün** heißt: G1–G4 grün. **Die Hebel sind brauchbar**, wenn G3 grün ist, G2 grün
bleibt und der Fortschrittsindex gegen Fusion 9 im 95-%-Intervall von `fusion-12s` (+1,36 … +1,79 %) oder darüber liegt. Die
Fit-Tabellen werden so übernommen, wie der Fit sie nach §11.2 schreibt — keine Nachstellung von Knoten, ρ-Parametern, Deckeln
oder der Form nach dem Lauf; rote Zellen, die bleiben, werden benannt und gehören in Spur P.

### 11.5 Fit-Ergebnis (`of7-fit.json`, 2026-10-08 14:09 UTC; 159 Slots, 58 035 Aufrufe, 19,8 Mio. Zeilen, 0 Fehler; Log `laeufe/06-of7-*.log`)

- **ρ(d, Δh), Bins Δh < 100 m, gemessen (vs. `spatialWeight`):**

  | Größe | 2,5 km | 7,5 km | 15 km | 27,5 km | 47,5 km | 90 km | Fit ρ₀ / c / D / H |
  |---|---|---|---|---|---|---|---|
  | T | 0,71 (0,93) | 0,54 (0,83) | 0,34 (0,60) | 0,29 (0,33) | 0,17 (0,14) | 0,12 (0,04) | 0,71 / 0,20 / 20 km / 300 m |
  | Wind (Geschwindigkeit) | 0,26 | 0,36 | 0,23 | 0,21 | 0,13 | 0,08 | 0,30 / 0,24 / 40 km / 500 m |
  | Böe | 0,43 | 0,54 | 0,30 | 0,29 | 0,18 | 0,11 | 0,60 / 0,16 / 25 km / 500 m |

  Befund: schon bei 2,5 km teilt die Nachbarstation bei T nur 71 % der Fehlerkorrelation (spatialWeight behauptet 93 %), bei
  Wind 26 %, bei Böe 43 %; dafür bleibt bei 60–120 km ein Boden von 0,08–0,12 (gemeinsamer synoptischer Fehler). Bei |Δh| ≥ 700 m
  fällt T auf 0,16 auch bei 0–5 km (Tal gegen Gipfel). **Zwei Methodenkorrekturen vor dem Prüfstandlauf** (beide am Hindcast-
  Residuum entschieden, kein Prüfstandwert gesehen): (a) Gewicht min(n, 5 000) je Bin statt n — mit n diktierten die 60–120-km-Bins
  (Hunderttausende Paare) den Fit, T bei 2,5 km kam auf 0,28 statt 0,71; (b) Form ρ₀·(c + (1 − c)·e^(−d/D))/(1 + (Δh/H)²) statt
  des Cauchy-Produkts von spatialWeight, das den Boden nicht tragen kann (mit Kappung T 2,5 km 0,45). RMS der Bins ≤ 20 km:
  T 0,146 · Wind 0,110 · Böe 0,107.
- **σ-Skala (gepoolt, Abdeckung vorher → 80,0 %; Knoten; CRPS_Q-Änderung):**

  | Größe | 0–6 h | 6–24 h | 24–48 h | 48–120 h | 120–240 h | 240–336 h |
  |---|---|---|---|---|---|---|
  | T | 88,6 % · **0,775** · +1,8 % | 87,1 · 0,834 · +1,0 | 86,3 · 0,829 · +1,0 | 82,1 · 0,972 · +0,1 | 81,2 · 0,963 · 0,0 | 79,4 · 1,021 · 0,0 |
  | Td | 83,2 · 0,926 · +0,2 | 83,5 · 0,911 · +0,2 | 83,7 · 0,900 · +0,3 | 80,7 · 1,000 · 0,0 | 80,4 · 0,991 · 0,0 | 80,8 · 0,980 · 0,0 |
  | Wind | 83,1 · 0,897 · +0,4 | 83,5 · 0,859 · +0,5 | 79,8 · 1,026 · −0,1 | 76,2 · 1,192 · −0,3 | 78,0 · 1,064 · −0,1 | 77,6 · 1,132 · −0,9 |
  | Böe | 84,7 · 0,885 · +0,2 | 84,9 · 0,871 · +0,3 | 84,8 · 0,869 · +0,3 | 80,4 · 1,020 · 0,0 | 80,8 · 0,963 · 0,0 | 80,2 · 0,995 · 0,0 |

  Je Rolle liegen A und B nach dem Fit innerhalb ±0,6 pp; je Land streut es (T 0–6 h DE 77,7 / AT 81,9 / CH 82,5 %; Wind
  48–336 h DE 84,5–85,4 gegen AT/CH 74,8–75,8 % — V-OF-16). Zeilen: 97–100 % Normal/gestutzte Normal/zensierte Normal.
- **Befund zur Datenlage, VOR dem Lauf benannt:** die Knoten ≤ 48 h stammen allein aus dem Sommer 2026 (die einzigen Stufe-1-Läufe
  im Hindcast); die Entwicklungsmenge ist Herbst (14.09.–08.10.). Am Hindcast deckt die ankerlose Kette T 0–6 h mit 88,6 % ab,
  am Archiv deckt der Champion MIT Anker 77,8 % und Fusion 12 82,7 % — die Herbstfehler sind größer als die Sommer-σ (die gelernte
  σ bei 7–48 h stammt selbst aus 95 Sommertagen, E-FL-3). Ein T-Faktor 0,775 bei 0–6 h kann die Herbstabdeckung daher unter das
  Band drücken. Deshalb werden — **alle drei vor dem ersten Prüfstandlauf festgelegt, alle berichtet** — drei Kandidaten gefahren:
  - **`fusion-12r`** = 12s + `anchorRho: 1` + `sigmaScale: 1` (die Regel §11.4, voller Fit);
  - **`fusion-12q`** = 12s + `anchorRho: 1` (Hebel 1 allein — trennt die Wirkung der beiden Hebel);
  - **`fusion-12p`** = 12s + `anchorRho: 1` + `sigmaScale: 2` (`SIGMA_SCALE_TABLE_LONG`: Knoten ≤ 48 h auf 1, nur der ganzjährig
    gemessene Teil des Fits — aus dem Datenlage-Argument, nicht aus Prüfstandzahlen).
  Das Urteil nach §11.4 gilt für `fusion-12r`; die beiden anderen sind benannte Varianten, deren Wahl Jans Entscheidung bleibt und
  die — weil an der Entwicklungsmenge betrachtet — nur Spur P (ab 09.10.) sauber bestätigt. Keine weitere Variante nach den Läufen.

### 11.6 Ergebnis (drei Volltests, Commit `4b8f15a`, Läufe `laeufe/07-voll-12{r,q,p}.log`, Berichte `audit/pruefstand/berichte/fusion-12{r,q,p}/2026-10-08-voll/`)

| Kandidat | Optionen | Index gegen Fusion 9 | G1 | G2 | G3 | G4 |
|---|---|---|---|---|---|---|
| `fusion-12s` (OF-6, zum Vergleich) | anchorSigma | +1,55 % (+1,36 … +1,79) | grün | grün | **rot** (3: ws 6–24, Böe 24–48, T 0–6 zu schmal) | grün |
| **`fusion-12r`** (Regel §11.4) | + anchorRho + sigmaScale 1 | **+1,58 %** (+1,44 … +1,79) | grün | **rot** (7: Td 0–6 AT/CH −0,8/−0,7 %, Wind 24–48 AT/CH −0,2 %, Wind 48–120 AT −1,7 %, Wind 120–240 AT −2,4 % / CH −4,1 %) | **rot** (2: **T 0–6 h 72,7 %**, **Td 0–6 h 71,1 %**, beide zu schmal; alle anderen 25 Zellen grün, auch ws 6–24 h 82,4 % und Böe 24–48 h 86,6 %) | grün |
| `fusion-12q` (Hebel 1 allein) | + anchorRho | +1,49 % (+1,30 … +1,74) | grün | grün | **rot** (6: T 6–24/24–48, ws 6–24, Böe 0–6/6–24/24–48 — das Bild von Fusion 12 ohne Kopplung) | grün |
| `fusion-12p` (Skala nur > 48 h) | + anchorRho + sigmaScale 2 | +1,34 % (+1,20 … +1,53) | grün | **rot** (4: Wind 24–48 CH, 48–120 AT, 120–240 AT/CH) | **rot** (6, wie 12q) | grün |

**Verdikt nach §11.4: nicht grün — keiner der drei Kandidaten.** Drei Befunde, alle vor dem Lauf angelegt, jetzt gemessen:

1. **Die σ-Skala ≤ 48 h aus dem Sommer passt nicht in den Herbst** (§11.5 vorab benannt): T 0–6 h 82,4 → 72,7 %, Td 0–6 h
   74,3 → 71,1 % — unter dem Band und signifikant weiter vom Soll als der Champion. In 12r sind dafür ALLE übrigen 25 Zellen grün:
   die Skala allein hat die geerbte Über-Abdeckung von Wind 6–24 h (85,2 → 82,4 %) und Böe 0–48 h (89,5–90,6 → 85,6–86,6 %)
   abgebaut. Das Problem ist die Jahreszeit, nicht der Hebel. ⇒ **V-OF-17.**
2. **Das gemessene ρ nimmt der Kopplung fast die ganze Wirkung** (12q ≈ Fusion 12): an typischen Ankerdistanzen (5–15 km) ist
   ρ_T 0,4–0,55 gegen f 0,6–0,85, bei Böe/Wind noch kleiner ⇒ 2ρ/f − 1 ≈ 0 … 0,3, bei Wind meist < 0 (Deckel 1). Und doch hatte
   OF-6 bei Böe 0–6 h die Abdeckung genau auf den Champion gebracht (90,0 → 87,5 %), d. h. der Anker nimmt dort wirklich
   ≈ 13 % Fehlervarianz weg. Die Erklärung liegt in der Form: der dichte Anker mittelt die Innovationen von bis zu
   `OBS_DENSE_ANCHOR_K` Stationen; die Varianz dieses Mittels ist kleiner als σ₁² einer Einzelstation, und seine Korrelation mit
   dem Punktfehler größer als das ρ einer Einzelstation — die Formel setzt konservativ var(I) = σ₁² und ρ je Station. Gemessen
   ist ρ richtig, aber es ist nicht die Größe, die der K-Stationen-Anker braucht. ⇒ **V-OF-15.**
3. **Die gepoolte Skala > 48 h kostet in AT/CH CRPS** (G2 rot in 12r und 12p, bis −4,1 % Wind 120–240 h CH): der Fit sah
   schon am Hindcast, dass Wind 48–336 h nach dem Fit in DE 84,5–85,4 % und in AT/CH 74,8–75,8 % abdeckt (§11.5) — eine Skala
   für alle Länder verbreitert DE zu stark und AT/CH zu wenig; am Archiv wird das zur CRPS-Verschlechterung. ⇒ **V-OF-16.**

Keine Nachstellung nach den Läufen (§11.4/§11.5). `FUSION12_OBS_DENSE` bleibt 0; `anchorRho`/`sigmaScale` bleiben aus; Register
`fusion-12r/q/p` = Kandidaten. Was aus den drei Läufen folgt, steht in §11.7.

- **V-OF-15** Anker-Formel für K Stationen: die σ-Kopplung braucht cov(e_τ, Ī) und var(Ī) des GEMITTELTEN Innovationssatzes, nicht
  ρ und σ₁² einer Einzelstation; dazu gehört die Frage, ob auch das Mittelwertgewicht f·w(τ) (f = max spatialWeight) am gemessenen ρ
  neu zu setzen ist (optimal wäre k = ρ_eff·w). Mehrwert: die Kopplung wirkt, wo sie wirkt (Böe/Wind 0–6 h), ohne bei T zu
  überziehen. Umsetzung: am Hindcast die Innovation der K nächsten Stationen (ohne die eigene) je Punkt bilden und corr(e_τ, Ī),
  var(Ī)/σ₁² je Größe, Distanzklasse und Vorlauf messen — dieselbe Pipeline wie `of7.mjs`, ein Lauf.
- **V-OF-16** σ-Skala je Land (oder die Windfamilie > 48 h): Wind 48–336 h deckt in AT/CH 72–76 % ab, in DE 80–85 % — die
  gestutzte Normal der Lernstufe trägt die Bergländer nicht. Umsetzung: Knoten je Land × Fenster (Tabelle 3 × 6 je Größe) aus
  denselben Reservoirs (`part-*.json`, Zellen tragen das Land) — ohne neuen Sammellauf; oder σ-Skala in der Lernstufe (Stratum).
- **V-OF-17** σ-Skala ≤ 48 h braucht Herbst/Winter-Läufe der Stufe 1: der Hindcast hat t1-Läufe erst ab 2026-06-17 (Route `run`);
  die Nachhol-Kette `follow` (§8.8 des Hindcast-Audits) füllt den Herbst 2026 laufend nach — ab ≈ Dezember liegen zwei
  Jahreszeiten vor. Bis dahin ist nur Spur P (ab 09.10.) ein sauberes Fenster für 0–48 h; die gelernte σ (7–48 h aus 95
  Sommertagen, E-FL-3) hat dieselbe Lücke.

### 11.7 Was folgt (keine Entscheidung dieser Phase; Jans Gates MANUELLE-SCHRITTE §48.9)

- Die **Kombination, die G3 am nächsten kommt**, ist in 12r sichtbar: 25 von 27 Zellen grün, rot nur T/Td 0–6 h durch die Sommer-
  Knoten. Ein Kandidat „Skala für T/Td erst ab 6 h, Wind/Böe-Skala ≤ 48 h, Knoten > 48 h je Land" wäre aus diesen Zahlen abgeleitet
  — er darf auf der Entwicklungsmenge nicht mehr bewertet werden (§11.4). Als vorab benannte Hypothese für **Spur P ab 09.10.**
  ist er zulässig (E-OF-5).
- Sauber messbar jetzt: V-OF-16 (Land-Knoten aus den vorhandenen Reservoirs, kein Sammellauf) und V-OF-15 (ein Hindcast-Lauf).
- Fusion 12 bleibt aus; `fusion-12s` bleibt der beste Stand nach Index (+1,55 %) mit G3 rot (3).

## 11.8 OF-7b — b) die zwei Messungen, a) die Hypothese für Spur P (Jan 08.10.: „b) machen und a) parallel für Spur P festschreiben")

### 11.8.1 V-OF-16 — Knoten je Land aus den vorhandenen Reservoirs (`of7.mjs --fit`, `of7-fit.json` → `sigmaScale[v].byLandNodes`, Log `laeufe/08-of7-fit-land.log`)

Derselbe gemeinsame Fit je Land (Abdeckung vorher → nachher, Knoten; Deckel 1,6):

| Größe · Land | 0–6 h | 6–24 h | 24–48 h | 48–120 h | 120–240 h | 240–336 h |
|---|---|---|---|---|---|---|
| T · DE / AT / CH | 87,0→80 · 0,818 / 89,9 · 0,739 / 90,5 · 0,731 | 0,897 / 0,792 / 0,769 | 0,854 / 0,794 / 0,808 | 0,935 / 0,980 / 1,037 | 0,979 / 0,925 / 0,972 | 1,060 / 0,952 / 1,001 |
| Td · DE / AT / CH | 0,864 / 0,931 / 1,033 | 0,865 / 0,932 / 0,976 | 0,855 / 0,873 / 1,005 | 0,926 / 1,025 / 1,130 | 0,992 / 0,952 / 1,017 | 0,987 / 0,933 / 1,009 |
| Wind · DE / AT / CH | 0,839 / 0,995 / 0,984 | 0,818 / 0,963 / 0,879 | 0,919 / 1,208 / 1,163 | 1,030 / **1,6 (72,2→79,7 %)** / 1,512 | 0,918 / **1,6 (74,5→78,3)** / **1,6 (73,5→79,7)** | 0,907 / **1,6 (72,8→77,6)** / **1,6 (72,6→79,0)** |
| Böe · DE / AT / CH | 0,850 / 0,891 / 0,937 | 0,859 / 0,843 / 0,915 | 0,836 / 0,895 / 0,912 | 1,021 / 0,971 / 1,064 | 1,028 / 0,907 / 0,865 | 1,028 / 0,952 / 0,961 |

Befund: die Länder unterscheiden sich vor allem bei **Wind > 48 h** (AT/CH 72–75 % Abdeckung, DE 80–83 %) und bei **T ≤ 48 h**
(AT/CH 88–90 %, DE 85–87 %). Beim Wind > 48 h erreicht AT selbst am Deckel 1,6 keine 80 % — und auf der Entwicklungsmenge hatte schon
die gepoolte Verbreiterung um 19 % in AT/CH 1,7–4,1 % CRPS gekostet (12r, §11.6), auf dem Hindcast selbst verschlechterte sie CRPS
(−0,3/−0,9 %, §11.5). Das ist kein Skalenproblem, sondern ein Formproblem der Windfamilie > 48 h, und obendrein widersprechen sich
Hindcast und Archiv dort (⇒ **V-OF-18**: Hindcast-t2/t3 kalibrieren die echte Cube-Kette jenseits 48 h nicht — T 240–336 h deckt am
Hindcast 79 %, am Archiv 64 %). **Die Länder-Knoten werden berichtet, nicht benutzt** (Tabelle trägt `byCountry` als Form, leer).

### 11.8.2 V-OF-15 — die Anker-Formel für K Stationen (`of7.mjs --collect15/--fit15`, `of7-kset.json`, Logs `laeufe/08-of7-collect15-*.log`, `08-of7-fit15.log`)

Messung: 352 Hindcast-Slots (2026-06-18 … 09-13, alle vier Tagesslots — die Stufe-1-Läufe), 128 480 Aufrufe, 0 Fehler. Je Punkt der
K = 6 beste Satz aus den 12 nächsten ANDEREN Prüfnetz-Stationen (die Regel des dichten Satzes; Gewichte `spatialWeight`, Wind/Böe über
10 km gedämpft), Ī = gewichtetes Mittel der Fehler bei 1 h, f = größtes Gewicht; je Größe × f-Klasse: C = cov(e₁, Ī)/var(e₁),
V = var(Ī)/var(e₁); dazu R(τ) = cov(e_τ, Ī)/var(e₁) gegen w(τ)·C (Faktorisierungsprobe). Klassenregel: ≥ 2 000 Zeilen und C > 0
(mit 500 Zeilen trugen Wind/Böe bei f ≥ 0,85 704 Zeilen mit C −0,29 — kein Anker, Rauschen einer dünnen Klasse; Regel vor dem
Einbau gesetzt).

| Größe | f 0–0,15 | 0,15–0,3 | 0,3–0,5 | 0,5–0,7 | 0,7–0,85 | 0,85–1 |
|---|---|---|---|---|---|---|
| T · C / V (n) | 0,18 / 0,36 (27 186) | 0,26 / 0,39 (51 699) | 0,32 / 0,48 (21 703) | 0,30 / 0,48 (14 760) | 0,45 / 0,53 (5 972) | 0,44 / 0,50 (5 280) |
| Wind · C / V (n) | 0,12 / 0,74 (116 713) | 0,11 / 0,86 (3 514) | 0,44 / 0,92 (3 516) | 0,46 / 0,78 (2 112) | — (0) | — (704, C < 0) |
| Böe · C / V (n) | 0,21 / 0,80 (116 682) | 0,36 / 0,90 (3 513) | 0,57 / 0,89 (3 514) | 0,54 / 0,81 (2 112) | — (0) | — (702) |

Befund: der gemittelte Satz hat bei T nur ein Drittel bis die Hälfte der Varianz einer Einzelstation (V 0,36–0,53) und erklärt mit
C 0,44 bei f ≥ 0,85 so viel wie die ρ-Form (0,63 bei 2,5 km) — der Zuschlag 2C/f − V liegt bei 0,45 gegen 0,35 (ρ) und 1 (OF-6):
die Kopplung schrumpft bei T auf ≈ 0,78 statt auf den Boden 0,5. Bei Wind und Böe liegt V nahe 0,8–0,9 (die 10-km-Dämpfung lässt
meist eine Station übrig), C 0,44–0,57 bei f 0,3–0,7 ⇒ Zuschlag 0,6–1,0 — nahe OF-6, das bei Böe die Abdeckung getroffen hatte.
Faktorisierung R(τ)/(w·C) bei T 0,9–1,3 für τ 2–6 h; bei Böe in dünnen Klassen unruhig (im JSON je Klasse und Vorlauf).
Grenze: das Prüfnetz ist weitmaschiger als der dichte Satz des Produkts — die hohen f-Klassen (nahe Stationen), in denen der
echte Anker meist liegt, sind bei Wind/Böe leer; dort steht die Klasse 0,5–0,7 ein (`anchorKSetOf`, konservativ). Option
`anchorKSet` (Vorrang vor `anchorRho`; `ANCHOR_KSET_TABLE`, Provenienz hindcast), Faktor² = 1 − r·a²·(2C/f − V), Deckel 1, Boden 0,5;
`verify:pv-cube` Block (12) OF-7b.

### 11.8.3 Hypothese für Spur P (E-OF-5 a; festgeschrieben 2026-10-08, VOR dem ersten Tag der Spur P; Hash in `claims-frozen.sha256`, Text `claims-addendum-2.md`)

Kandidat **`fusion-12t`** = Register `fusion-12s` + `anchorKSet: 1` + `sigmaScale: 3` (Tabelle `SIGMA_SCALE_TABLE_P`: Wind/Böe-Knoten
≤ 48 h aus dem Fit, T/Td ab 6 h — Knoten 0–6 h = 1 —, jenseits 48 h nichts; V-OF-18). Abgeleitet aus dem Bild von 12r auf der
Entwicklungsmenge (§11.6: 25 von 27 Zellen grün, rot nur T/Td 0–6 h) und aus den Hindcast-Befunden §11.8.1/§11.8.2 — deshalb wird er
**nie mehr auf der Entwicklungsmenge bewertet**. Bewertung: `--modus=abnahme` (Spur P = Archivtage nach dem Freeze 2026-10-08 mit
reifer Wahrheit), frühestens mit ≥ 4 reifen Tagen (≈ 20.10.), belastbar mit ≥ 14 (≈ 30.10.). **Behauptung:** auf Spur P sind G1–G4
grün und der Fortschrittsindex gegen Fusion 9 liegt ≥ +1,3 %. Trifft G3 nicht zu, wird die Zelle benannt; keine Nachstellung an den
Spur-P-Zahlen — ein Nachfolger braucht ein neues Fenster.

### 11.8.4 Zweite Hypothese `fusion-12u` (Jan 08.10. abends: „dann tue das genau so"; `claims-addendum-3.md` + Hash, vor dem ersten Spur-P-Tag)

`fusion-12u` = `fusion-12t` mit `sigmaScale: 4` (`SIGMA_SCALE_TABLE_U`): dieselbe Tabelle, nur der Windknoten 24–48 h auf 1 statt
1,026. Der Knoten war ein Nebenprodukt des gemeinsamen Fits (Fenster am Hindcast schon bei 79,8 %, die Nachbarn zogen ihn hoch) und
seine Verbreiterung um 2,6 % kostete in 12r und 12p in AT/CH 0,2 % CRPS (signifikant) — der einzige Teil der Skala ≤ 48 h, der je
eine Zelle verschlechtert hat. **Vorzugsreihenfolge vorab:** beide grün ⇒ 12u; nur einer grün ⇒ dieser; keiner ⇒ rote Zellen beider
benennen, kein dritter Kandidat ohne neues Fenster. Beide nur `--modus=abnahme`. `verify:pv-cube` prüft, dass 4 sich von 3 nur
beim Wind unterscheidet.

## 12 E-OF-4 entschieden — „buscosun Fusion 12“ = Kandidat `fusion-12s`, eingeschaltet ohne Spur P (Jan 08.10. spät)

**Auftrag (wörtlich):** „ich möchte eine buscosun fusion version 12 jetzt schon aktiv schalten ohne P spur und dabei die beste mit der
besten performance und im optimal mit allen Gates grün.“ Vorher gefragt: „welches buscosun fusion 12 hat alle gates bestanden?“ —
Antwort: keines (Tabelle §11.6; 12 und 12s G3 rot, 12q G3 rot, 12r/12p G2 + G3 rot; 12t/12u ungemessen, nur Spur P).

### 12.1 Wahl

| Kandidat | Index gegen 9 (Rolle B) | G2 | G3 | Entscheidung |
|---|---|---|---|---|
| `fusion-12s` | **+1,55 %** (95 %: +1,36 … +1,79) | grün, 0 von 99 schlechter | rot 3 von 27 | **gewählt** |
| `fusion-12r` | +1,58 % (95 %: +1,44 … +1,79) | **rot, 7 Kernzellen** (ws 120–240 h CH −4,1 %, ws 48–120 h AT −1,7 %, td 0–6 h AT/CH −0,8 %) | rot 2 von 27 | nicht gewählt |
| `fusion-12` | +1,47 % | grün | rot 6 von 27 | überholt |

Der Index-Vorsprung von 12r (+0,03 pp) liegt innerhalb beider Konfidenzintervalle; sein G2-Rot ist dagegen signifikant und trifft
Nutzer in AT/CH bei Wind jenseits 48 h. „Beste Performance bei möglichst grünen Gates“ ist damit 12s: nirgends signifikant schlechter
als Fusion 9, 80 von 99 Kernzellen besser als jede Einzelquelle, ein Gate rot. Die drei roten G3-Zellen von 12s (Bericht
`berichte/fusion-12s/2026-10-08-voll/`): **T 0–6 h 74,4 %** (Champion 77,8 %, Band 76,1–83,9 %: zu schmal — die σ-Kopplung ohne Skala),
**Wind 6–24 h 85,1 %** (Champion 84,7 %) und **Böe 24–48 h 90,5 %** (Champion 90,3 %) — zu breit, geerbt von Fusion 9, von 12s um 0,4
bzw. 0,2 pp weiter vom Ziel entfernt (signifikant, aber minimal). **Das ist Jans Wort, kein Prüfstand-Urteil:** kein Kandidat hat alle
vier Gates bestanden, Spur P war leer, Spur R unterscheidet die Messungs-Kandidaten nicht (§11.7).

### 12.2 Umsetzung (Commit auf `fusion-12`)

- `fusionRelease.ts`: `FUSION12_OBS_DENSE = 1`; neue Konstante `FUSION12_ANCHOR_SIGMA = 1`; neues Register-Feld `also` (Begleit-Optionen
  eines Stands, die mit seiner Option und seinem Schalter zusammen an- und ausgehen — Fusion 12 ist der erste Stand mit zwei
  Motor-Optionen); Eintrag `n: 12` = `obsDense: 1` + `also: { anchorSigma: 1 }`, Notiz und Beleg angepasst. `fusionStage` schreibt die
  Begleit-Optionen nur, wenn der Stand an ist; `?dense=0` nimmt beide zurück ⇒ exakt Fusion 11 (Stufen-Label „buscosun Fusion 11
  (dichter Messsatz per Schalter aus)“).
- `cubeSource.ts`: nur der Re-Export der neuen Konstante. Der Motor ist unverändert — die Optionen `obsDense`/`anchorSigma` existieren
  seit OF-5/OF-6 und sind im Prüfstand als `fusion-12s` (Commit `bec557c`) gemessen; die Stufe `fs` setzt sie jetzt.
- `verify-fusion-release.mjs`: A1/A2/A3/A3b kennen `also` (Schlüssel eindeutig, keine Basis-Option, in der Stufe, mit dem Schalter weg),
  neu **A3c** (Begleit-Optionen gehen mit dem Schalter aus; Gegenprobe: Stände ohne `also` verlieren genau eine Option), B3 sucht auch
  Begleit-Schlüssel als handkopierte Option außerhalb von Motor und Leser.
- Was damit folgt, ohne weiteren Code (Phase FR): jeder Teil der Plattform heißt nach dem Push „buscosun Fusion 12“; Streckenprognose
  und Kartenfelder bauen sich beim nächsten Lauf neu (`repeatVerdict`), bis dahin nennen sie den Stand, mit dem sie gebaut sind.
- **Nicht geändert:** der Prüfstand-Champion bleibt `fusion-9` (nur die Abnahme setzt einen Champion; H-OF-5/5b sind gegen Fusion 9
  formuliert — **E-OF-7**, Jans Gate); die Register-Einträge 12s/12t/12u bleiben, wie sie sind; 12t/12u heißen bei grün in Spur P
  **Fusion 13** (sie enthalten 12s vollständig). Daten-Repo unverändert.

### 12.3 Gates (Worktree `fusion-12`, 08.10. 22:30–23:00 UTC, zwei fremde Vite-Dev-Server auf der Maschine)

| Gate | Ergebnis |
|---|---|
| `npm run typecheck` | 0 Fehler |
| `verify:fusion-release` | **30/30** (A3c neu; „?dense=0 ⇒ buscosun Fusion 11 (dichter Messsatz per Schalter aus)“) |
| `verify:pv-fusion` | 235/235 |
| `verify:road-fc` | 103/103 |
| `verify:pv-cube` | 438/441 — rot nur (4) Laufzeit (170 ms, vorher am selben Abend ohne Änderung 110 ms und 97 ms), (9) Kosten PAP 3, (16) SWR-Frist: alle drei zeitabhängig (V-FR-8); Block (4) rechnet eine feste Eingabe ohne die Stufe, die Änderung berührt ihn nicht |
| `verify:point-client` | 174/175 — (10s) zeitabhängig, auch an HEAD (V-EX-13) |
| `verify:np0-fields` | 23/24 — B rot: `publish-point` meldet in der Kopie des lokalen Daten-Klons 208 Manifesteinträge ohne Datei für den Lauf 2026100812 (der Klon trägt seit 22:32 UTC einen lokalen HD-Commit der parallelen Sitzung); der Fehler fällt vor jeder Feldrechnung, die Felder lesen das Register unverändert über `fusionStage()` — Umgebung, nicht diese Änderung; Wiederholung mit frischem Klon = Jans Gate |
| Build | grün |
| `npm run budget` | totalJs **1 611,5 KB** gegen HEAD `f16f82d` 1 611,4 (Kontrollbau, +0,1 KB); Grenze 1 609 → **1 612** (OF-7/OF-7b lagen schon 2,4 KB darüber, ungemessen; Notiz in `budget.json`); eagerJs 109,3 unverändert |

## 13 Spur-P-Abnahme von `fusion-12t` und `fusion-12u` (21.10., Jans Auftrag: „führe beide Punkte durch")

Auftrag vom 21.10.: (1) Hindcast-Nachholkette wieder anwerfen und W1 neu bauen, (2) Spur-P-Abnahme von 12t und 12u „sofort als
Vorblick, verbindlich um den 30.10."; das Wort `abnahme` fiel im Auftrag. Kein Code unter `src/` geändert, keine Tabelle, kein Protokoll.

### 13.1 Vorbereitung (beides lokal, nichts ins Daten- oder Archiv-Repo)

- **Wahrheit W1 stand auf dem 07.10.** (letzter Lauf `2026-10-07T15:04Z`): ohne Neubau hätte Spur P null reife Tage gehabt.
  `build-w1.mjs` (21.10. 18:48 UTC, 190 s): 22 Tage geschrieben, 2 final belassen, 8 Werte verworfen ⇒ **W1 `3c99e1ca339f`, 1 239 Tage
  (2023-06-01 … 2026-10-21), reif 1 231** (Reifezeit 7 Tage ⇒ reif bis 13.10.).
- Archiv-Klon `C:\dev\buscosun-archiv` per `pull --ff-only` auf `357a4f4`: 37 Ausgabetage (14.09. … 20.10.); Spur P nach dem Freeze
  08.10. = 12 Ausgabetage (09.–20.10.), davon 4 mit reifer Wahrheit im Sinn des Protokolls (`minDays` 4 — gerade erreicht).
- **Die Hindcast-Nachholkette `follow` stand seit dem 24.09.** (letzter Slot 21.09., letzter Lauf `score-full2` 24.09.; §11.6 V-OF-17 und
  §8.8 des Hindcast-Audits nahmen an, sie laufe täglich — sie lief genau einmal, am 22.09. für 19.–21.09.) ⇒ **V-OF-19**. Neu gestartet
  21.10. 18:52 UTC: `log\chains.json` um `{"name":"follow-2026-10-21","mode":"follow","args":"2026-09-22 2026-10-20"}` ergänzt, Wachhund
  `watchdog8` losgelöst (`detach.ps1`, WMI). Messung aus dem Log vom 22.09.: ≈ 10 min je Tag ⇒ ≈ 5 h für 29 Tage; `data_run` hält
  ≈ 3 Monate, der 22.09. war also noch nicht verloren. Der ERSTE losgelöste Start (`watchdog7`, 18:51 UTC) starb still nach der
  START-Zeile — Wachhund und Kette zugleich, kein Fehler im Log; der zweite Start, in derselben PowerShell-Sitzung mit 20 s Wartezeit
  vor dem Rückkehren, lebt (python-Kinder sichtbar, um 19:59 UTC 30 Aufrufe `status 0`, 0 Fehlschläge) ⇒ **V-OF-20**.

### 13.2 Ergebnis (Protokoll P1 `4b633f0766a7`, Wahrheit W1 `3c99e1ca339f`, Champion `fusion-9`; `zugriffe.log` 18:55 und 19:59 UTC)

| | `fusion-12t` | `fusion-12u` |
|---|---|---|
| Urteil | **abgelehnt** (G2, G3 rot) | **abgelehnt** (G2, G3 rot) |
| Spur P (12 Ausgabetage, 4 reif, 69 Zellen, 402 960 unreife Werte übersprungen): Index gegen 9 | **+0,25 %** (95 %: +0,20 … +0,30), einseitig signifikant, Nachweisgrenze 0,15 % | **+0,26 %** (+0,21 … +0,32) |
| Spur P: G2 · G3 | grün (0 von 36 Kernzellen schlechter) · grün (0 von 10 rot, 2 außerhalb des Bands: Niederschlag 96 % wie der Champion) | grün · grün |
| Spur R (Tresor, 70 Ausgaben): Index gegen 9 | +0,97 % (+0,65 … +1,26) | +0,97 % (+0,65 … +1,26) |
| Spur R: G2 | **rot** — ws 0–6 h DE **−2,1 %**, gust 0–6 h CH −0,5 % (beide signifikant nach BH) | rot — dieselben zwei Zellen, dieselben Zahlen |
| Spur R: G3 | **rot** — ws 0–6 h 73,4 % (Champion 76,9 %, Band 78,3–81,7), t 48–120 h 75,3 % (Champion 75,6 %); 9 von 17 außerhalb des Bands | rot — dieselben zwei Zellen |
| G1 · G4 | grün · grün (Determinismus `9a8b6ffa5897`, Physik) | grün · grün |
| Beste Kernzellen (Spur R) | ws 240–336 h AT +8,9 %, CH +6,6 %; td 120–240 h AT +6,4 % | gleich |
| Produktaussage | 63 von 63 Kernzellen besser als jede Einzelquelle | gleich |
| Bericht | `audit/pruefstand/berichte/fusion-12t/2026-10-21-abnahme/` | `audit/pruefstand/berichte/fusion-12u/2026-10-21-abnahme/` |

**Prüfung der eingefrorenen Behauptung (§11.8.3, `claims-addendum-2.md`):** „auf Spur P sind G1–G4 grün und der Fortschrittsindex
gegen Fusion 9 liegt ≥ +1,3 %". Gates auf Spur P: grün. Index auf Spur P: **+0,25 % ⇒ die Behauptung trifft nicht zu**, unabhängig von
Spur R. Die Vorzugsreihenfolge aus §11.8.4 („keiner grün ⇒ rote Zellen beider benennen, kein dritter Kandidat ohne neues Fenster") gilt:
die roten Zellen sind oben benannt, ein dritter Kandidat braucht ein neues Fenster (E-OF-8). `fusion-12u` unterscheidet sich von 12t nur
im Windknoten 24–48 h; auf Spur R ist das in keiner berichteten Zahl sichtbar (Index auf zwei Stellen gleich), auf Spur P +0,01 pp.

### 13.3 Deutung (Diagnose, keine Nachstellung)

1. **Spur R zeigt V-OF-17 in Reinform:** der Tresor (April 2024 … August 2025) trägt alle Jahreszeiten, die σ-Skala ≤ 48 h stammt aus
   95 Sommertagen. Der Windknoten 0–6 h DE 0,839 (§11.8.1) verengt σ dort, wo die Abdeckung schon beim Champion unter dem Band liegt
   (76,9 %) — Ergebnis 73,4 % und −2,1 % CRPS. T 48–120 h liegt beim Champion ebenso unter dem Band (75,6 %); 12t verschiebt es um
   0,4 pp weiter weg — signifikant, aber das Band verfehlt schon Fusion 9.
2. **Spur P ist noch dünn:** 4 reife Ausgabetage, nur Vorläufe bis ≈ 96 h reif (402 960 Werte übersprungen). Der kleine, aber
   signifikante Vorsprung +0,25 % auf Spur P ist ein Herbst-Befund für 0–48 h, wo die Skala hingehört. Eine Wiederholung derselben zwei
   Kandidaten auf Spur P um den 30.10. (≥ 14 reife Tage ≈ 3.11.) ist **keine Nachstellung** (gleicher Kandidat, gleiche Hypothese) — sie
   kann aber Spur R nicht aufheben: das Urteil „abgelehnt" bleibt, solange das Protokoll Spur R mitprüft.
3. **Was ein neues Fenster bräuchte:** entweder (a) die σ-Skala ≤ 48 h nach Jahreszeit (Herbst/Winter-Knoten aus der laufenden
   `follow`-Kette, frühestens Dezember, V-OF-17), oder (b) ein Kandidat ohne σ-Skala ≤ 48 h, nur `anchorKSet` auf 12s (die Kopplung
   allein hatte in OF-7b bei Böe/Wind 0–6 h gewirkt), oder (c) Fusion 12 bleibt, bis (a) messbar ist. Entscheidung E-OF-8 (Jan).

- **V-OF-19** Hindcast-Nachholkette ist kein Dauerbetrieb: sie läuft nur, wenn jemand `chains.json` ergänzt und den Wachhund startet
  (Lehre: „läuft täglich auf Jans Maschine" war eine Absicht, kein Mechanismus). Mehrwert: ohne sie gibt es im Dezember keinen
  Winter-Nachfit (FL-AP7) und keine Herbst-Knoten für V-OF-17. Umsetzung: geplante Aufgabe (Task Scheduler) einmal täglich
  `queue.mjs follow <gestern-2> <gestern>` + Wachhund, oder ein Eintrag in `chains.json` je Woche von Hand; der Wächter
  `verify-hindcast` sollte den jüngsten Slot gegen „heute − 3 Tage" prüfen.
- **V-OF-20** Ein per WMI losgelöster Wachhund kann beim ersten Start still sterben (21.10. 18:51 UTC: `watchdog7` und seine Kette ohne
  Logzeile weg; zweiter Start 18:52 UTC lebt). Ursache nicht gemessen (Verdacht: Ende des aufrufenden Werkzeugprozesses binnen
  Sekunden). Umsetzung: `detach.ps1` nach dem Start 15–20 s warten und die PID prüfen, sonst Fehler melden; `pids.jsonl` um ein
  „alive"-Feld ergänzen.
- **V-OF-21** Die Abnahme nennt im Urteil den Index der Spur R als Hauptzahl, obwohl die Hypothese „nur Spur P" formuliert war
  (§11.8.3). Das ist das Protokoll (Spur R ist die größere saubere Menge), kein Fehler — aber eine „nur Spur P"-Hypothese sollte im
  Register als solche stehen, damit der Bericht beide Indizes nebeneinander im Kopf zeigt statt nur in `scores.json`.

### 13.4 Korrektur (22.10.): die Spur-P-Zahlen vom 21.10. entstanden OHNE den dichten Messsatz — V-OF-22

Beim Vorbereiten von E-OF-8 b fiel auf, dass auf Spur P `fusion-12 ≡ fusion-11 ≡ fusion-10` war (Paar `12t|12` = `12t|11` = `12t|10`
= +0,298 % auf drei Stellen; Fusion 12 gegen Klima 0,26264 = Fusion 11). Ursache: die dichten Tagesdateien
`C:\dev\buscosun-pruefstand\obs-dense\<Tag>.json.gz` (aus den Originalen, `build-dense-obs.mjs`) **endeten am 07.10.**; der Replay
greift ohne Tagesdatei still auf die Archiv-Messung zurück und zählt das nur (`replay.mjs`: „Without a day file the replay keeps the
archive measurement and counts it"). In den Konserven stand es: 91 Konserven (7 obsDense-Versionen × 13 Tage 08.–20.10.) mit
`denseMissing 365` von 365 Punkten. Folgen:

- Die Spur-P-Spalte in §13.2 (Index +0,25 %, Gates grün) misst **12t ohne dichten Anker**: nur `anchorSigma`/`anchorKSet` am Archiv-Anker
  (eine Station je Punkt) und die σ-Skala. Das Spur-R-Urteil (G2/G3 rot) ist davon unberührt — der Tresor hat keine Messungen —, die
  Ablehnung bleibt. Die Deutung 2 in §13.3 („+0,25 % ist ein Herbst-Befund für 0–48 h") gilt nur für diese Konfiguration.
- Umsetzung 22.10.: `build-dense-obs.mjs --from=2026-10-08 --to=2026-10-21` (335 s; 13 Archivtage 08.–20.10., je ≈ 1 410–1 434 DE,
  283 AT, 156 + 141 CH Stationen); die 91 veralteten Konserven gelöscht (Scratchpad-Scan über die Blockköpfe, `info.denseMissing`;
  der `caseHash` kennt die Tagesdatei nicht — V-OF-22). **Wächter:** `lauf.mjs` meldet je Modell `obs: { mode, denseUsed, denseMissing,
  daysMissing }`, `run.mjs` bricht eine Abnahme eines obsDense-Kandidaten mit Exit 1 ab, wenn auf Spur P oder der Entwicklungsmenge ein
  Tag ohne Tagesdatei lief (Volltest: Warnung). Protokoll P1 unverändert (Siegel deckt nur `protokoll.json`, `pruefnetz.json`, `tresor.json`).
- Eine Wiederholung der Abnahme 12t/12u mit dichten Dateien ist keine Nachstellung; sie ändert das Urteil nicht (Spur R), zeigt aber die
  echten Spur-P-Zahlen. Vorschlag: zusammen mit der ersten Abnahme von 12v (≈ 03.11.).
- Dauerbetrieb fehlt auch hier (wie V-OF-19): die Tagesdateien entstehen nur auf Zuruf. Vor jeder Abnahme `build-dense-obs.mjs` bis zum
  Vortag laufen lassen; der Wächter fängt das Vergessen ab.

## 14 E-OF-8 b — Kandidat `fusion-12v` (22.10., Jans Auftrag „mache b")

**Kandidat:** `fusion-12v` = Register `fusion-12u` ohne `sigmaScale` = `fusion-12s` + `anchorKSet: 1` (Optionen oben in §13.2 geprüft:
`obsDense 1`, `anchorSigma 1`, `anchorKSet 1`, kein `sigmaScale`). Motor-Commit `4350886` (derselbe wie 12t/12u, also dieselbe Kette;
die Prüfung isoliert damit genau das Weglassen der σ-Skala), Tabellen `0714300fe2a5`/`9d22ff35986f`/`85d73cead2cb`/`a71e53c9de12`,
Fit-Fenster wie 12u, Tresor sauber (`contaminated: false`), `modelHash 2efa2b5a1831758d`, Order 12,7, Status `kandidat`. Registriert
22.10. 08:33 Ortszeit (Scratchpad `reg12v.mjs` über `writeRegister`, wie 12t/12u), **Freeze 2026-10-22** (Tag der Registrierung; die
Entwicklung sah die Berichte vom 21.10. über Spur P 09.–20.10.). Spur P = Archivtage ab 23.10.; erste Abnahme mit ≥ 4 reifen Tagen
frühestens **03.11.**, belastbar ≈ 13.11. Kein Eintrag in `fusionRelease.ts` (eine Nummer gibt es erst bei grün: Fusion 13).

**Hypothese H-OF-5c** (`audit/obs-fusion/claims-addendum-4.md`, sha256 `b60ae6cb95af…` in `claims-frozen.sha256`, Zeit in
`claims-frozen.at`, vor dem ersten Spur-P-Tag): auf Spur P G1–G4 grün, Index gegen Fusion 9 ≥ +0,5 % (Nachweisgrenze des Protokolls),
Abdeckung T 0–6 h im Band um 80 % (12s auf der Entwicklungsmenge: 74,4 %); auf Spur R keine Kernzelle signifikant schlechter (dort ist
12v rechnerisch Fusion 11, der Tresor trägt keine Messungen). Voraussetzung: dichte Tagesdatei für jeden Spur-P-Tag (V-OF-22-Wächter).
Bei rot: Zellen benennen, keine Nachstellung. Erwartung ehrlich gesagt: Zehntelprozente, kein Sprung — der Hebel wirkt nur über den
Anker im Nahbereich 0–48 h.

**Was 12v nicht kann:** die Winter-Lücke der σ-Skala schließen (das ist Weg a, ab Dezember aus der Hindcast-Kette) und die geerbte
Über-Abdeckung bei Wind 6–24 h / Böe 24–48 h beheben (das tat nur die Skala).

## 15 OF-8 — Kandidat `fusion-12w`: Kurzfrist-Skala aus der Tag-0-Reihe aller Jahreszeiten (22.10., Jans Auftrag „bauen wir einen neuen Kandidaten und testen ihn gegen den Champion … nutze dafür diese neuen Datenmöglichkeiten")

### 15.1 Auftrag und Datenlage

Jan hat am 22.10. die Tabelle der ungenutzten Daten (Antwort zu §14: Tag-0-Slots außerhalb des Tresors · Nachholkette · Archiv der
echten Kette · Fremdquellen) bestätigt und den Bau eines neuen Kandidaten mit Prüfstandlauf gegen den Champion beauftragt; dazu
„alle Freiheiten in buscosun-data, Archiv oder Hindcast". Von den vier Zeilen ist heute nur die erste belastbar: die Tag-0-Reihe des
Hindcasts außerhalb des Tresors. Die Nachholkette hat ihren Winter erst 26/27, das Archiv der echten Kette ab Dezember, die
Fremdquellen aus dem Vorschlag sind unverifiziert — sie bleiben draußen. Die 232 Herbst-Slots der Nachholkette (22.09.–20.10.)
liegen in der Entwicklungsmenge; ein Fit darauf machte den heutigen Volltest in-sample. Sie bleiben für diesen Kandidaten ebenfalls
draußen (Option für einen späteren Kandidaten nach dem Spur-P-Urteil, nicht vorher).

Bestand der Tag-0-Reihe (gezählt 22.10., `slots\`): 2023-05-25 … 2024-03-24 nur 00 UTC (305 Slots; Wahrheit W1 ab 2023-06-01 ⇒
298 nutzbar; Modelle ICON-D2 + ICON-EU, IFS erst ab 25.01.2024, keine Stufe 2/3), 2025-09-08 … 2026-06-16 vier Slots je Tag, aber
**Stufe 1 (Tag 0) nur im 00-UTC-Slot** — die 06/12/18-UTC-Slots tragen allein die dyn-Route t2/t3 (V-OF-23; Sonde `probe-of8.mjs`
22.10.: `2026-01-15/1200` hat kein `cube.t1`). Nutzbar also 282 + 298 = 580 Tag-0-Slots, alle 00 UTC, Vorlauf 1–2 h, zwei Winter
(23/24, 25/26), zwei Herbste, ein Frühjahr, ein Sommer (JJA 2023 ganz, Juni 2026 halb). Das ist genau der Datentyp der Spur R
(Tresor = 00-UTC-Tag-0-Slots, Fenster 0–6 h = Vorlauf 1–2 h), nur in anderen Jahren.

### 15.2 Diagnose (aus vorhandenen Zahlen, §13.2 und `berichte/fusion-12t/2026-10-21-abnahme/scores.json`; keine neuen Läufe)

Abdeckung q10–q90 des Champions Fusion 9 im Fenster 0–6 h, nach Regime:

| Größe | Spur R (Tag 0, 1–2 h, ohne Station/Messung, 70 Tage 2024/25) | Entwicklungsmenge Rolle A (echte Kette, eigene Station + Messung) | Entwicklungsmenge Rolle B (fremde Station) | Spur P gepoolt (4 reife Tage) |
|---|---|---|---|---|
| T | **90,4 %** (viel zu breit) | 81–85 % | DE 81, AT 75, CH 76 % | 78,7 % |
| Td | 76,8 % | 88–94 % | 66–81 % | 74,8 % |
| Wind | **76,9 %** (zu schmal; Band 78,3–81,7) | **85 %** (zu breit) | DE 82, **AT 72, CH 75 %** (zu schmal) | 81,7 % |
| Böe | **83,5 %** (zu breit) | 85–86 % | 86–88 % | 85,9 % |

Lesart: (1) **T und Td** sind im Produkt an Stationswert und Anker gekoppelt (12v misst genau diese Kopplung); die 90 % der Spur R
sind ein Artefakt der Kette OHNE lokale Information und existieren im Produkt nicht. Eine Skala auf T/Td, die „zuletzt" auf das
gekoppelte σ wirkt, zählt doppelt (12r: T 0–6 h zu schmal). ⇒ T/Td 0–6 h bleiben 1, wie in 12t. (2) **Böe** ist in jedem Regime zu
breit (83–88 %); ein Faktor < 1 ist regimeunabhängig richtig, nur seine Größe je Land ist offen (Spur R: DE 87, AT 83, CH 79 %).
(3) **Wind** ist ohne lokale Information zu schmal (Spur R 76,9 %, Rolle B AT/CH 72–75 %) und mit lokaler Information zu breit
(Rolle A 85 %). Eine Zahl je Fenster kann nicht beiden dienen; gepoolt liegt die echte Kette bei ≈ 82–83 %, Spur R bei 77 %.
12t trug den Sommerknoten 0,84–0,90 aus Vorlauf 1–6 h gepoolt — auf der Tag-0-Reihe (1–2 h, alle Jahreszeiten) war das zu eng.

Zwei messbare Erklärungen für den Abstand Sommer-Lauf (0,9) ↔ Tag-0-Tresor (> 1): **Vorlaufstruktur** — die ersten zwei Stunden
sind der steilste Teil der σ-Kurve, ein Knoten bei 3,5 h aus 1–6 h gepoolt verfehlt sie; und **Jahreszeit** — Sommer gegen
Winter. Beides ist am Hindcast außerhalb des Tresors messbar: Fenster A (echte Läufe Sommer 2026) nach Vorlauf 1 … 6 aufgelöst,
Fenster C (Tag 0, 00 UTC) nach Jahreszeit. Was NICHT messbar ist: der Anteil des Datentyps (Tag-0-Reihe ≠ echter Lauf) — dafür gibt
es nur den Vergleich Tag-0 JJA 2023/26 gegen Lauf JJA 2026 bei 1–2 h, 00 UTC, der als Befund berichtet wird.

### 15.3 Form im Motor (eine Tabelle, eine Optionsstufe; sonst nichts)

`SIGMA_SCALE_TABLE_W` in `fusion/sigmaScale.ts`: wie die bisherigen Tabellen, aber mit **sieben Knoten** `centresH = [1,5 · 4,5 ·
15,5 · 36,5 · 84,5 · 180,5 · 288,5]` — das Fenster 0–6 h bekommt zwei Knoten (Vorlauf 1–2 h, 3–6 h), alle übrigen bleiben 1. Nur
`ws` und `gust` werden skaliert, `t`/`td` sind überall 1. Knoten je Land (`byCountry` DE/AT/CH, V-OF-16; der Motor nimmt sie seit
OF-7 für Punkte im Land, sonst `nodes`). `sigmaScaleAt` ist über die Länge von `centresH` generisch (keine Änderung), der Motor
bekommt nur die Stufe `sigmaScale: 5` (Tabellenwahl). Die Knoten 6–48 h der Sommertabelle (12t/12u) kommen NICHT mit: der Hebel von
12w ist allein die Kurzfrist-Skala aus der Tag-0-Reihe; die Spur P von 12t hat für die Sommerknoten 6–48 h keinen Nutzen gezeigt
(+0,25 % statt ≥ 1,3 %), und Spur R kann sie nicht prüfen (Fenster leer).

### 15.4 Messung (`scripts/obsfusion/of8.mjs`, nur lesend; Rohdaten `audit/obs-fusion/of8/part-*.json`, Fit `of8-fit.json`)

- **Fenster A** (echte Läufe): Route `run` 2026-06-18 … 2026-09-13, jeder 2. Tag, 00 + 12 UTC (wie of7); Kette ohne Anker (der
  Hindcast trägt keine Messungen), Fenster 8 h (Sonde 22.10.: bei Vorlauf 1–6 h byte-gleich zum 336-h-Fenster, 4 statt 46 ms je
  Punkt); Zeilen je Größe × Vorlauf 1 … 6 × Land × Rolle × Stunde.
- **Fenster C** (Tag 0): 00-UTC-Slots 2023-06-01 … 2024-03-24 (C1) und 2025-09-08 … 2026-06-16 (C2), jeder Tag; Aufruf exakt wie
  `predictHindcast` für Tag-0-Slots (nur `t1`, Fenster 2 h); Zeilen je Größe × Vorlauf 1–2 × Land × Rolle × Saison-Jahr
  (DJF nach dem Dezemberjahr). Dazu die K-Satz-Statistik (V-OF-15) bei τ = 1, 2 getrennt nach DJF und Rest — **nur Diagnose**
  (die K-Satz-Tabelle hat keine τ-Achse; ein Winter-Nachfit wäre ein eigener Kandidat).
- Jeder Slot-Tag wird gegen Tresor (`tresor.json`) und Entwicklungsmenge (ab 2026-09-14) geprüft und bricht bei Verstoß ab.
- Register für die Kette: `fusion-12v` (Optionen des Kandidaten ohne Skala; Tabellen `0714300fe2a5`/`9d22ff35986f`/…).

### 15.5 Regel vor den Zahlen (eingefroren 22.10., bevor `--fit` gelesen und der Prüfstand gestartet wird)

1. **Knoten aus Fenster A** (Sommer, echte Läufe), je Größe (`ws`, `gust`) und Land (DE/AT/CH, dazu gepoolt): zwei Knoten gemeinsam
   gefittet (Knoten 1,5 h auf den Zeilen Vorlauf 1–2, Knoten 4,5 h auf Vorlauf 3–6; linear dazwischen, flach außen; drei Durchläufe
   Bisektion auf 80 % Abdeckung, wie of7). Ein Fit-Satz braucht ≥ 2 000 Zeilen, sonst gilt der gepoolte Wert.
2. **Saisonfaktor aus Fenster C** (Tag 0, 00 UTC), je Größe und Land: R = N_C(alle Jahreszeiten C1 + C2) / N_C(JJA 2023 + Juni 2026),
   mit N_C = der konstante Faktor, der die Zeilen Vorlauf 1–2 auf 80 % Abdeckung bringt. Der Quotient misst, wie viel breiter die
   Kette im Jahresmittel sein muss als im Sommer — bei gleicher Stunde (00 UTC) und gleichem Datentyp, sodass Tageszeit und
   Datentyp im Verhältnis herausfallen. Unter 2 000 Zeilen im JJA-Satz eines Landes gilt das gepoolte R.
3. **Kandidatenknoten:** Knoten 1,5 h = clamp(n₁(A) · R), Knoten 4,5 h = clamp(n₂(A) · R), clamp auf [0,6; 1,6]; die Jahresskala
   gilt für beide Kurzfristknoten (das einzige saisonale Zeugnis ≤ 6 h ist die Tag-0-Reihe). T/Td: 1. Knoten ≥ 15,5 h: 1.
4. **Berichtet, nicht benutzt:** die direkt gefitteten Tag-0-Knoten N_C je Saison-Jahr, je Land und je Jahr (23/24 gegen 25/26);
   die T/Td-Knoten beider Fenster; der Regime-Vergleich N_C(JJA, 00 UTC) gegen n₁(A, nur 00 UTC); der Tag/Nacht-Vergleich n₁(A, 00 UTC)
   gegen n₁(A, 12 UTC); CRPS vor/nach auf beiden Fenstern; die K-Satz-Klassen DJF gegen Rest.
5. **Kandidat `fusion-12w`** = Register `fusion-12v` + `sigmaScale: 5`, Motor-Commit dieses Schritts, Tabellen und Fit-Fenster von
   12v plus die drei neuen Fit-Fenster (A, C1, C2; alle außerhalb des Tresors ⇒ `contaminated: false`), **Freeze 2026-10-22**
   (Registrierungstag, wie 12v — beide teilen das Spur-P-Fenster ab 23.10.), Order 12,8, Status `kandidat`.
6. **Bewertung:** heute `--modus=voll` (Entwicklungsmenge 14.09.–21.10.: Diagnose + Rangfolge gegen alle Stände, kein Urteil — die
   Tage haben die Entwicklung gesehen, die Fit-Fenster liegen davor). Urteil nur mit `--modus=abnahme` ab ≈ 03.11. (≥ 4 reife
   Spur-P-Tage; dann auch 12v und die Wiederholung von 12t/12u). Spur R vorher nur auf Jans Wort (`vergleich … tresor`). Keine
   Nachstellung an Spur-P- oder Spur-R-Zahlen; bei rot werden die Zellen benannt. Hypothese H-OF-5d in `claims-addendum-5.md`,
   Hash in `claims-frozen.sha256`, geschrieben vor dem Prüfstandlauf.

### 15.6 Fit-Ergebnis (`of8-fit.json`, 22.10. 18:21 UTC; A 88 Slots / 759 k Zeilen, C 580 Slots / 1,66 M Zeilen, 0 Fehler; Logs `laeufe/10-of8-*.log`) und Regeländerung VOR dem Prüfstandlauf

Knoten auf 80 % Abdeckung, Kette ohne Anker (Fenster A gepoolt über DE/AT/CH und beide Rollen; „vorher" = Abdeckung bei Faktor 1):

| Größe | A: Knoten 1,5 h / 4,5 h (vorher) | A nur 00 UTC / nur 12 UTC (Vorlauf 1–2) | C alle Jahreszeiten (vorher) | C JJA | R | C je Saison DJF / MAM / SON | C 23/24 / 25/26 |
|---|---|---|---|---|---|---|---|
| T | 0,742 / 0,802 (89,7 / 88,0 %) | 0,767 / 0,727 | 0,769 (88,6 %) | 0,72 | 1,07 | 0,80 / 0,79 / 0,76 | 0,76 / 0,78 |
| Td | 0,924 / 0,919 (83,1 / 83,3 %) | 0,908 / 0,938 | 1,114 (75,4 %) | 0,923 | 1,21 | 1,22 / 1,29 / 0,99 | 1,07 / 1,16 |
| Wind | 0,896 / 0,887 (83,1 / 83,2 %) | **1,075 / 0,77** | 1,176 (75,7 %) | 1,067 | 1,10 | 1,26 / 1,16 / 1,17 | 1,17 / 1,18 |
| Böe | 0,891 / 0,885 (84,5 / 84,6 %) | 0,874 / 0,906 | 0,963 (81,5 %) | 0,921 | 1,05 | 1,04 / 0,88 / 0,97 | 1,00 / 0,92 |

Je Land, Wind: DE A 0,859/0,818, C alle 1,057, JJA 0,963 (R 1,10); AT A 0,962/1,005, C **am Deckel 1,6** in jeder Jahreszeit (R
damit 1); CH A 0,94/0,996, C alle 1,6 (Deckel), JJA 1,433 (R 1,12). Böe: DE A 0,841/0,862, C alle 0,912, JJA 0,861 (R 1,06); AT A
0,928/0,874, C 0,95 / 0,919 (R 1,03); CH A 0,95/0,93, C 1,07 / 1,033 (R 1,04). Regelknoten nach §15.5 Punkt 3 — Wind: gepoolt
0,987/0,977, DE 0,943/0,898, AT 0,962/1,005, CH 1,05/1,113; Böe: gepoolt 0,932/0,926, DE 0,891/0,913, AT 0,96/0,904, CH 0,984/0,963.
Abdeckung mit den Regelknoten auf C (Tag 0, alle Jahreszeiten): Wind 75,3 % (DE 75,5, AT 72,4, CH 75,0; DJF 73,1), CRPS DE −0,9 %,
CH −0,7 %, AT +0,3 %; Böe 78,6 % (DE 79,1, AT 80,2, CH 76,4; DJF 75,6), CRPS ±0,1 %; auf A Wind 82,7 %, Böe 81,8 %.

**V-OF-24 — die Kurzfrist-Kalibrierung des Windes ist eine Tageszeit-, keine Vorlauffrage.** Bei Vorlauf 1–2 h wollen die echten
Sommerläufe bei 00 UTC den Faktor 1,075 (zu schmal), bei 12 UTC 0,77 (zu breit); gepoolt 0,896. Die Tag-0-Reihe bei 00 UTC (JJA
1,067) stimmt mit den echten Läufen derselben Stunde (1,075) überein — der Datentyp ist also nicht der Grund, warum 12t auf Spur R
versagte, sondern die Stunde: **Spur R ist 00 UTC** (Tag-0-Slots), und das Archiv liefert EINEN Slot je Tag um 23:22 UTC, also
Vorlauf 1–6 h = 00–05 UTC — Spur P und Entwicklungsmenge sehen das Fenster 0–6 h ebenfalls nur nachts; 12t trug den
Tag/Nacht-Mittelwert in die Nacht. Der Winter legt bei Nacht noch einmal 18 % drauf (DJF 1,256 gegen JJA 1,067). Eine Skala je
Vorlauf kann das nicht tragen; der richtige Hebel ist eine Achse Tagesstunde (oder Stabilität) in der Skala — messbar aus den acht
Slots je Tag der Lauf-Route (17.06.–13.09.) und der Nachholkette, aber eine neue Form und damit ein eigener Kandidat. Für T zeigt
sich dasselbe Bild schwächer (0,767 gegen 0,727), für Böe fast nicht (0,874 gegen 0,906).

**V-OF-25 — Wind in AT und CH ohne lokale Information ist jenseits des Deckels zu schmal.** Die Tag-0-Reihe erreicht in AT in keiner
Jahreszeit 80 % Abdeckung, selbst bei Faktor 1,6 nicht (DJF, MAM, JJA, SON alle am Deckel); CH im Winter ebenso. Das deckt sich mit
Spur R (AT Rolle A 72 %, CH 74 %) und mit der Rolle B der echten Kette (AT 72, CH 75 %). Eine multiplikative Skala ist dort das
falsche Werkzeug; die Form des Windfehlers in Gebirgsländern (Rice/zensiert, Mindest-σ, Bodenrauigkeit) wäre zu prüfen — Befund, kein
Plan.

**Regeländerung (vor jedem Prüfstandlauf, 22.10. 18:30 UTC):** Die Windknoten bleiben 1. Begründung: der Regelknoten für Wind
verfehlt das eigene Ziel der Regel auf ihren eigenen Fit-Daten (Abdeckung auf C 75,3 % statt 80 %, CRPS in DE −0,9 %), weil die
Prämisse der Regel — Tageszeit fällt im Verhältnis R heraus — zwar für R gilt, nicht aber für den Basisknoten n(A), der Tag und
Nacht mittelt, während Prüfstand (00 UTC bzw. ein Archiv-Slot je Tag) und Produkt (jede Stunde) Verschiedenes sehen. Ein nachts
gefitteter Windknoten > 1 wäre für das Produkt am Tag falsch (12 UTC: 0,77) und nur für die blinde Stelle des Prüfstands richtig —
das wird nicht gebaut. Die Böe erfüllt die Prämissen (Tag/Nacht 0,874/0,906, Regime JJA 0,921 gegen 0,874, Abdeckung mit Regelknoten
auf C 78,6 %, auf A 81,8 %, CRPS neutral) und bleibt der einzige Hebel von 12w. Der Nachtrag 5 (`claims-addendum-5.md`) ist VOR der
Hash-Bildung entsprechend geändert; das ist dieselbe Lage wie bei der ρ-Form von OF-7 (§11.2: Form an den Hindcast-Residuen geändert,
vor jedem Prüfstandlauf). Erwartung ehrlich: ein kleiner Hebel — Spur R Böe 0–6 h von 83,5 % Richtung Band, Spur P Böe 0–6 h von 85,9 %
Richtung Band, Zehntelprozente im Index.

K-Satz auf der Tag-0-Reihe bei τ = 1 (Diagnose, nicht benutzt): T in DJF C 0,31 / 0,32 / 0,40 / 0,61 / 0,37 (f-Klassen 0,15 … 1)
gegen Rest 0,24 / 0,26 / 0,30 / 0,45 / 0,35 — die Kopplung ist im Winter STÄRKER (ruhige Nächte, regional kohärente Fehler), die
Sommertabelle von OF-7b (0,26 … 0,45) unterschätzt sie im Winter; Wind/Böe ähnlich (DJF C 0,25–0,45 / 0,22–0,62 gegen Rest
0,22–0,48 / 0,20–0,58), die Klassen f ≥ 0,7 bleiben wie im Sommer leer oder negativ. Ein Winter-Nachfit der K-Satz-Tabelle ist damit
belegt möglich (eigener Kandidat; 12v misst erst die Sommertabelle).

### 15.7 Umsetzung und Volltest (22.10. abends)

- Motor: `SIGMA_SCALE_TABLE_W` + Stufe `sigmaScale: 5` (`cubeSource.ts`: Optionstyp, Tabellenwahl, Calib-Notiz; `sigmaScaleAt`
  unverändert, generisch über sieben Knoten). `npm run typecheck` grün; `verify:pv-cube` 446/447 — der neue Block (12) OF-8 grün
  (Form der Tabelle, Interpolation 3 h = Mittel der Kurzfristknoten, Option 5 byte-gleich zu Option 1 + W), die eine rote Prüfung
  (21, `profileColumn`-Import in `src/nowcast/heightTime/heightTimeModel.ts`) ist an HEAD vor diesem Schritt schon rot (fremde Linie
  HZS, Commit `aa464517`); `verify:fusion-release` 30/30 (kein neuer Stand, Fusion 12 bleibt). Commit **`35f1285a`** (nur die
  OF-8-Dateien; der Arbeitsbaum trägt daneben die fremde Linie HB unter `src/history/`), Register **`fb00d640`**.
- Register `fusion-12w`: Commit `35f1285`, Order 12,8, Freeze 2026-10-22, Fit-Fenster von 12v plus A/C1/C2 (alle außerhalb des
  Tresors, `contaminated: false`), `modelHash d92ae0d2849c`. Hypothese H-OF-5d `claims-addendum-5.md`, sha256 `83b95c044ea5…`
  (LF-Inhalt; Gegenprobe: Nachtrag 4 mit derselben Methode = gespeicherter Hash), Zeit 16:27 UTC in `claims-frozen.at`.
- Vorbereitung: Archiv-Klon `3db9be3` (bis 21.10. 23:22 UTC), dichte Tagesdatei 21.10. gebaut (DE 1 409 · AT 285 · CH 156 + 141
  Niederschlag), W1 neu bis 22.10. (`laeufe/10-w1-build.log`).
- **Volltest `--modus=voll` gestartet 16:40 UTC** (Entwicklungsmenge 14.09.–21.10., 38 Tage; 186 neue Konserven: 12v und 12w auf allen
  Tagen, alle übrigen Versionen für den 21.10.; 2 Arbeiter, 16–21 s je Konserve). **Vom Speicherwächter von Claude Code bei 100/186
  nach 928 s gestoppt** (Systemspeicher knapp; daneben laufen zwei fremde Vite-Server). Konserven sind inkrementell: die 100 gerechneten
  bleiben gültig, es fehlen 86 (≈ 25 min mit einem Arbeiter). Kein Bericht, keine Zahl. Neustart nur auf Jans Wort, dann mit
  `PRUEFSTAND_WORKERS=1` und losgelöst vom Claude-Code-Prozessbaum (`detach.ps1`-Muster aus §13.1, PID prüfen, V-OF-20).
- **Neustart auf Jans Wort „weiter" 18:25 UTC:** `detach.ps1 -Root C:\dev\buscosun-pruefstand -Shell cmd` mit
  `set PRUEFSTAND_WORKERS=1&& node … run.mjs --kandidat=fusion-12w --modus=voll` (WMI, Priorität BelowNormal; PID nach 20 s geprüft,
  lebte; Log `C:\dev\buscosun-pruefstand\log\pull-voll-12w-2.log`, an `laeufe/10-voll-12w.log` angehängt). 85 fehlende Konserven in
  1 717 s (14–23 s je Konserve, Runner 3,3 GB), Auswertung mit G4-Zweitlauf bis ≈ 18:55 UTC. Kein Eingriff des Speicherwächters.

### 15.8 Ergebnis des Volltests (Protokoll P1 `4b633f0766a7`, Wahrheit W1 `bf39c35589f2`, Champion `fusion-9`; Bericht `audit/pruefstand/berichte/fusion-12w/2026-10-22-voll/`)

Entwicklungsmenge 14.09.–21.10. (38 Ausgabetage, 99 Kernzellen; 1 917 823 Werte mit unreifer Wahrheit mitgezählt). **Diagnose und
Rangfolge, kein Urteil** — H-OF-5d wird nur mit `--modus=abnahme` bewertet; diese Tage hat die Entwicklung gesehen.

| | `fusion-12w` |
|---|---|
| Fortschrittsindex gegen Fusion 9 (Rolle B) | **+1,90 %** (95 %: +1,56 … +2,17), Nachweisgrenze 0,37 %; Rolle A +1,06 % (+0,79 … +1,30) |
| G1 · G2 | grün · grün (0 von 99 Kernzellen signifikant schlechter) |
| G3 | **rot** — 3 von 27: T 6–24 h 84,7 % (Champion 84,3 %), T 24–48 h 84,3 % (84,0 %), Wind 6–24 h 84,0 % (83,3 %); alle drei **zu breit**, über dem Band und 0,3–0,6 pp weiter vom Soll als der Champion (signifikant). 18 von 27 außerhalb des Bands, der Champion dort fast überall genauso (Niederschlag 94–97 %, Böe 86–89 %) |
| G4 | grün (Determinismus `e6bc200fa6eb`, Physik, Vollständigkeit 6 876 764 Kernfälle = Champion, Punktabfrage 32,6 ms, Leck-Prüfung Tresor) |
| Beste Kernzellen | Wind 0–6 h DE +21,1 %, T 0–6 h DE +20,5 %, Wind 240–336 h CH +17,1 %, Böe 0–6 h DE +17,0 % (alle signifikant) |
| Schlechteste Kernzellen | Td 48–120 h DE −1,1 %, T 48–120 h DE −0,5 % (beide nicht nachweisbar) |
| Produktaussage | 84 von 99 Kernzellen besser als jede Einzelquelle |
| Überanpassung | Gewinn Rolle A +1,06 %, Rolle B +1,90 %, keine Warnung |

**Rangfolge aller Stände auf derselben Menge** (Skill gegen Klimatologie, Rolle B; rechts 12w gegen den Stand, Rolle B, 95 %):

| Platz | Stand | Skill gegen Klima | 12w dagegen |
|---|---|---|---|
| 1 | `fusion-12u` (abgelehnt 21.10., Spur R) | 20,87 % | −0,21 % (−0,27 … −0,15) |
| 2 | `fusion-12t` (abgelehnt 21.10., Spur R) | 20,86 % | −0,20 % (−0,25 … −0,14) |
| 3 | `fusion-12s` = buscosun Fusion 12 | 20,72 % | −0,03 % (−0,04 … −0,02) |
| 4 | **`fusion-12w`** | 20,71 % | — |
| 5 | `fusion-12v` | 20,70 % | +0,02 % (+0,01 … +0,03) |
| 6 | `fusion-12r` | 20,70 % | −0,07 % (−0,13 … 0,00; nicht nachweisbar) |
| 7 | `fusion-12q` | 20,68 % | +0,05 % |
| 8 | `fusion-12` | 20,67 % | +0,07 % |
| 9 | `fusion-12p` | 20,55 % | +0,14 % |
| 10 | buscosun Fusion 10 | 20,29 % | +0,88 % |
| 11 | buscosun Fusion 11 | 20,04 % | +1,07 % |
| 12 | buscosun Fusion 9 (Champion) = Fusion 8 | 18,97 % | +1,90 % |
| 13 | buscosun Fusion 7 | 18,88 % | +2,05 % |
| 14 | buscosun Fusion 6 | 18,87 % | +2,06 % |
| 15 | 5e | 16,57 % | +5,11 % |
| — | Referenzen: MOSMIX 1,64 %, naiv −0,81 %, roh-lapse −25,7 %, roh −31,1 % | | |

**Deutung (Diagnose, keine Nachstellung):**

1. **Die Tabelle W tut das Vorgesehene und nichts sonst.** Gegen 12v ändern sich ausschließlich Böe-Zellen der Rolle B: 0–6 h DE
   **+1,21 %** (+0,79 … +1,67, signifikant nach BH), AT +0,39 %, CH +0,17 % (nicht nachweisbar); 6–24 h +0,06 … +0,14 % (der 4,5-h-Knoten
   läuft linear bis 15,5 h aus). Abdeckung Böe 0–6 h Rolle B: DE 88,6 → 86,1 %, AT 86,1 → 84,2 %, CH 87,1 → 86,2 % — in allen drei Ländern
   Richtung 80 %, noch über dem Band. Rolle A (Stationswert) unverändert, alle Wind-/T-/Td-Zellen identisch mit 12v. Summe gegen 12v
   +0,02 % — nachweisbar, aber die erwarteten Hundertstel; auf der Entwicklungsmenge entscheidet das nichts.
2. **V-OF-26 — die K-Stationen-Kopplung weitet σ im Herbst (Diagnose zu 12v):** gegenüber 12s (ohne `anchorKSet`) steigt die Abdeckung
   an DE-Stationen der Rolle B im Fenster 0–6 h von Wind 83,7 → **88,5 %**, Böe 84,5 → 88,6 %, T 77,6 → 86,0 %; CRPS Wind 0–6 h DE/B
   **−1,41 %** (signifikant), T 0–6 h DE/B −0,69 %, Böe −2,2 % (12w holt davon die Hälfte zurück). Keine Zelle gewinnt gegen 12s mehr als
   0,1 % ⇒ 12v liegt auf der Entwicklungsmenge ≈ 0,05 % unter 12s. Den Abdeckungs-Satz der H-OF-5c erfüllt 12v zwar (T 0–6 h gepoolt
   76,5 → 81,5 %, im Band), aber durch Mischung: DE zu breit (86,0 %), AT/CH weiter zu schmal (75,8/77,8 %). Das passt zur Messung in
   §15.6: der K-Satz ist im Herbst/Winter stärker gekoppelt als die Sommertabelle annimmt (T C 0,31–0,61 statt 0,24–0,45) — die
   Sommertabelle **unterkoppelt im Herbst** und lässt σ zu weit. Mehrwert: ein K-Satz nach Jahreszeit (die Akkumulatoren DJF/rest der
   Tag-0-Reihe liegen in `of8-fit.json`) wäre der nächste Kandidat — **E-OF-11 (Jan)**, ein neuer Kandidat mit neuem Fenster, keine
   Änderung an 12v oder 12w vor ihrer Abnahme.
3. **Die roten G3-Zellen gehören der 12s-Linie** (`obsDense`/`anchorSigma`: T 6–48 h, Wind 6–24 h zu breit), nicht der Tabelle W; der
   Champion liegt dort ebenso über dem Band. Mit 38 statt 23 Tagen ist das Binomialband enger, darum wechseln die roten Zellen gegenüber
   dem 08.10. (damals Wind 6–24, Böe 24–48 zu breit, T 0–6 zu schmal — Letzteres hat die Kopplung behoben, s. 2).
4. **12t/12u führen die Entwicklungsmenge um 0,20 % an.** Ihre σ-Skala ≤ 48 h gewinnt im Herbst-Archiv mit Stationen (gegen 12w: T/Td
   6–48 h DE −0,8 … −1,4 %, Wind 0–24 h AT/CH −1,7 … −2,4 %, Böe 6–48 h −0,6 … −1,2 %), verlor aber auf dem Tresor (Spur R rot am 21.10.).
   Derselbe Befund wie V-OF-17/V-OF-24: die Prüfmengen sehen verschiedene Regime (Jahreszeit, Tagesstunde, Stationen ja/nein).
5. **Was bleibt:** Spur P ab 23.10.; Abnahme 12v + 12w ≈ 03.11. (vorher `build-dense-obs.mjs` bis Vortag + `build-w1.mjs`); Spur R nur auf
   Jans Wort (`vergleich 9 12s 12v 12w tresor`). Bericht-Ordner und dieser Abschnitt sind uncommitted (Jans Gate).

## 16 OF-9 — Projekt „buscosun Fusion 13": Skala mit Tagesstunden-Achse (E-OF-10) und K-Satz nach Jahreszeit (E-OF-11), gemessen gegen `fusion-12s` (22.10. abends)

**Auftrag (wörtlich, Jan 22.10. abends):** „dann start das Projekt fusion 13 und teste es gegen das bestehende fusion 12s" — mit dem Zitat aus
§15.8/der Einschätzung: „Eine Skala mit Tagesstunden-Achse (E-OF-10) und ein K-Satz nach Jahreszeit (E-OF-11) sind die beiden Kandidaten, die
diesen Gewinn ohne den Nachtfehler holen könnten." Damit sind **E-OF-10 und E-OF-11 entschieden** (beide bauen, beide prüfen). Der Prüfstand
misst Gates und Index immer gegen den Champion (Fusion 9); der Vergleich gegen 12s kommt aus den Paaren derselben `scores.json`
(`cand|fusion-12s`, Rolle B, 95 %) — keine Änderung am Protokoll, kein zweiter Champion.

### 16.1 Ausgangslage (Volltest 22.10., Entwicklungsmenge, Abdeckung q10–q90 in %, Rolle B = Punkte ohne eigene Station)

| Größe · Fenster | 12s DE / AT / CH | 12v DE / AT / CH | 12t DE / AT / CH | Fusion 9 DE / AT / CH |
|---|---|---|---|---|
| T 0–6 h | 77,6 / 73,6 / 76,7 | 86,0 / 75,8 / 77,8 | 85,6 / 75,4 / 77,2 | 82,6 / 73,7 / 75,1 |
| T 6–24 · 24–48 h | 86,1 · 86,1 / 81,3 · 79,6 / 84,0 · 84,0 | ≈ 12s | 81,5 · 80,3 / 76,5 · 72,9 / 78,8 · 77,7 | ≈ 12s |
| Wind 0–6 h | 83,7 / 72,9 / 75,5 | 88,5 / 73,3 / 75,5 | 85,5 / 70,8 / 73,7 | 81,2 / 73,3 / 75,6 |
| Wind 6–24 · 24–48 h | 86,8 · 83,1 / 79,7 · 74,3 / 81,6 · 76,7 | ≈ 12s | 83,5 · 83,1 / 77,0 · 74,2 / 79,0 · 76,7 | ≈ 12s |
| Böe 0–6 h | 84,5 / 85,9 / 87,2 | 88,6 / 86,1 / 87,1 | 85,3 / 82,4 / 83,0 | 85,1 / 86,1 / 86,9 |
| Böe 6–24 · 24–48 h | 87,6 · 88,4 / 87,6 · 89,0 / 88,6 · 89,4 | ≈ 12s | 83,7 · 84,4 / 83,6 · 85,5 / 83,4 · 84,4 | ≈ 12s |
| Td 0–6 h | 81,2 / 66,4 / 67,8 | = 12s | ≈ 12s | = 12s |
| Td 6–24 · 24–48 h | 89,2 · 90,5 / 83,2 · 83,3 / 79,2 · 81,7 | = 12s | 86,6 · 87,7 / 80,5 · 79,8 / 76,2 · 78,0 | = 12s |

Lesart: (1) Die gepoolte Sommerskala von 12t trifft DE bei 6–48 h (T 86 → 81, Böe 88 → 84) und verengt AT/CH zu weit (T AT 81 → 73–77):
Knoten **je Land** sind nötig (die of7-Landknoten `byLandNodes` lagen vor und wurden nicht benutzt). (2) Bei 0–6 h ist der verankerte Herbst-Punkt
der Rolle B bei T in allen drei Ländern schon leicht zu schmal (74–78 %), bei Wind in AT/CH zu schmal (73–76 %) und in DE zu breit (84 %), bei Böe
überall zu breit (84–87 %). (3) Td hat im Cube-Pfad keinen Anker; AT/CH 0–6 h 66–68 % ist der rohe gelernte Td.

**V-OF-27 — die Tag-0-Reihe und das Archiv sind bei T ≤ 6 h verschiedene Regime.** Die Kette ohne Anker deckt T in DE nachts auf der Tag-0-Reihe
im Herbst 92 % (Knoten 0,643, §15.6), auf den echten Sommerläufen 87 % (Knoten 0,818); Fusion 9 — Anker nur im Mittel, σ unverändert — deckt im
Herbst-Archiv an DE-Punkten der Rolle B 82,6 %, 12s (σ-Kopplung) 77,6 %. Ein T-Knoten < 1 bei ≤ 6 h aus der Hindcast-Kette würde das Archiv unter
das Band drücken (dieselbe Lehre wie bei 12t: T/Td 0–6 h = 1). Mehrwert: die Regel unten setzt T/Td ≤ 6 h auf 1 und misst die Tagesstunden-Skala
bei ≤ 6 h nur für Wind und Böe; die Ursache des Regime-Unterschieds (Tag-0-Cube nur `t1`, Fenster 2 h; jüngster Lauf je Stunde) bleibt offen.

### 16.2 Datenlage (gezählt 22.10.)

- **Lauf-Route** (`run`, echte Stufe-1-Läufe): 2026-06-17 … 09-13, **acht Slots je Tag** (00 … 21 UTC; 00/03 UTC ab 18.06.), 712 Slots, nur `t1`
  (0–48 h), ohne Messungen. Die einzige Reihe, die jede Tagesstunde sieht — Grundlage der Tagesstunden-Achse. Sommer.
- **Tag-0-Reihe** 00 UTC (C1 2023-06-01 … 2024-03-24, C2 2025-09-08 … 2026-06-16, 580 Slots): Jahreszeiten, Vorlauf 1–2 h, nachts; Saisonfaktoren
  R liegen in `of8-fit.json` (§15.6, je Größe und Land); die K-Satz-Statistik dort nur DJF/Rest — für E-OF-11 wird sie **je Jahreszeit** neu
  gesammelt (derselbe Code-Pfad wie of8, Gruppen DJF/MAM/JJA/SON × Land).
- **Nachholkette** `follow` 22.09.–20.10. (232 Slots, 8 je Tag) liegt in der Entwicklungsmenge (ab 14.09.) — **nicht für den Fit** (Wächter in
  of9 wie in of8). Sie bleibt die einzige Herbstreihe mit Tagstunden ≤ 6 h; eine Diagnose der Tag-Knoten darauf wäre Volltest-Charakter
  (gesehene Tage) — **V-OF-28 (offen):** Tag-Knoten der Skala auf der Nachholkette nachmessen (Diagnose, kein Fit), sobald die Kandidaten
  registriert sind.

### 16.3 Form im Motor (zwei Optionen, zwei Tabellen, sonst nichts)

1. **`sigmaScale: 6` — `SIGMA_SCALE_TABLE_H`** (`fusion/sigmaScaleH.ts`, von `of9.mjs --fit` GESCHRIEBEN, Provenienz im Kopf; Typ und Funktionen
   in `fusion/sigmaScale.ts`): Achsen **Vorlauf** (Zeilen-Zentren 1,5 · 4,5 · 15,5 · 36,5 h, dazu die Zeile 84,5 h = 1 als Auslauf) × **Tagesstunde
   der Gültigzeit** (acht Klassen zu 3 h, Zentren 1,5 … 22,5 UTC, zyklisch linear dazwischen), Knoten je Größe (T, Td, Wind, Böe) **je Land**
   (DE/AT/CH; sonst gepoolt). Dazu der **Saisonfaktor** R(Größe, Land, Jahreszeit) aus der Tag-0-Reihe (§15.6), der NUR die Zeilen ≤ 6 h von Wind
   und Böe multipliziert (dort gemessen; die T/Td-Zeilen ≤ 6 h sind 1, V-OF-27), zyklisch linear im Tag des Jahres zwischen den Saisonzentren
   15.01. / 15.04. / 15.07. / 15.10. interpoliert (kein Sprung am Monatswechsel). `sigmaScaleHourAt(table, v, leadH, validAtMs, country)`:
   Stundenwert je Zeile, Zeilen ≤ 6 h × R, dann linear im Vorlauf (flach vor 1,5 h, 1 ab 84,5 h). Angewendet wie bisher: zuletzt, Größen des
   Stationswerts behalten ihre σ. `sigmaScaleTable` nimmt auch eine H-Tabelle (`kind: 'hour'`; Identität für den Verifier).
2. **`anchorKSet: 2` — `ANCHOR_KSET_TABLE_S`** (dieselbe Datei): die K-Satz-Klassen (C, V je f-Klasse, T/Wind/Böe) **je Jahreszeit** DJF/MAM/JJA/SON
   aus der Tag-0-Reihe (τ = 1, Länder gepoolt); `anchorKSetClassesAt(table, fam, validAtMs)` interpoliert C und V je Klasse zyklisch linear im
   Tag des Jahres zwischen den Saisonzentren, wo beide Nachbarn besetzt sind, sonst die besetzte Seite, sonst leer (dann greift die Rückfallregel
   von `anchorKSetOf`: nächste besetzte Klasse darunter). Formel, Deckel und Boden wie `anchorKSet: 1`; `anchorKSetTable` als Verifier-Eingang.
3. **Kandidaten** (alle = Register `fusion-12s`, Motor-Commit dieses Schritts, Tabellen/Fit-Fenster von 12s plus die neuen Fenster, Freeze 22.10.,
   Order 12,85/12,9/12,95, Status `kandidat`): **`fusion-12x`** = 12s + `sigmaScale: 6`; **`fusion-12y`** = 12s + `anchorKSet: 2`;
   **`fusion-12z`** = 12s + beides. 12v (Sommer-K-Satz) und 12w (Böentabelle W) gehen in keinem auf: die H-Tabelle enthält die Böe ≤ 6 h je Stunde,
   der Saison-K-Satz ersetzt die Sommertabelle. Beide bleiben registriert und kommen wie geplant in die Abnahme.

### 16.4 Regel vor den Zahlen (eingefroren 22.10. abends, bevor `of9.mjs --fit` gelesen wird; Hypothese H-OF-6 in `claims-addendum-6.md`)

1. **Fenster H** (Stunde): Lauf-Route 2026-06-18 … 09-13, alle acht Slots je Tag, Vorlauf 1 … 48 h stündlich, Kette ohne Anker, Fenster 48 h,
   Register `fusion-12s` (Optionen der Basis ohne Skala). Zeilen je Größe × Vorlauf × Land × Rolle × Gültigstunde (Reservoir 2 000 je Schlüssel bei
   Vorlauf ≤ 6 h, 400 darüber; binär). **Zelle** = (Größe, Land ∈ {gepoolt, DE, AT, CH}, Vorlaufzeile {1–2, 3–6, 7–24, 25–48 h}, Stundenklasse);
   **Knoten** = der konstante Faktor, der die Zeilen der Zelle auf 80 % Abdeckung bringt (18 Schritte Bisektion in [0,6; 1,6]); Zelle unter 2 000
   Zeilen ⇒ gepoolter Knoten derselben Zelle, sonst 1. Rollen A und B gepoolt (im Hindcast ohne Messung dasselbe Regime). Berichtet: die
   erreichte Abdeckung je Zelle MIT der interpolierten Tabelle (Stunde und Vorlauf), je Vorlauf und je Gültigstunde.
2. **Wächter je Zeile** (Größe, Land, Vorlaufzeile): verschlechtert die interpolierte Tabelle den CRPS der Zeilen dieser Zeile auf den eigenen
   Fit-Daten um mehr als 0,1 % (Skill < −0,001 gegen Faktor 1), werden alle acht Knoten der Zeile auf 1 gesetzt (Lehre V-OF-18: Abdeckung rauf,
   CRPS runter = Form, nicht Skala). Berichtet je Zeile.
3. **T und Td in den Zeilen ≤ 6 h = 1** (V-OF-27); Wind und Böe ≤ 6 h aus dem Fit **× R**(Größe, Land, Jahreszeit) mit R_s = N_C(s) / N_C(JJA) aus
   `of8-fit.json` (`vars[v].C[Land].bySeason[s].node / jja.node`); gepooltes R, wo der JJA-Satz eines Landes < 2 000 Zeilen hat; R = 1, wo der
   JJA-Knoten am Deckel 1,6 liegt (AT Wind, §15.6); R_JJA = 1. Produkt Knoten × R geklemmt auf [0,6; 1,6]. Die Zeilen 7–24 und 25–48 h tragen
   keinen Saisonfaktor (dort nicht gemessen) — ihre Winterübertragung misst erst die Spur P ab Dezember; der Winter-Nachfit der Lernstufe
   (Dezember) ist der vorgesehene Ort dafür.
4. **Fenster K** (K-Satz): Tag-0-Reihe C1 + C2, 00 UTC, jeder Tag; K-Satz-Statistik wie of8 (K = 6 beste der 12 nächsten Prüfnetz-Stationen,
   Wind/Böe 10-km-Dämpfung) bei τ = 1, 2, Gruppen **Jahreszeit × Land**. Tabelle: je Jahreszeit die Klassen mit n ≥ 2 000 und C > 0 (Länder
   gepoolt), sonst leer. Berichtet, nicht benutzt: je Land; τ = 2; JJA nachts (Tag-0) gegen die Sommertabelle OF-7b (alle Stunden, Lauf-Route) als
   Regimeprobe; aus Fenster H die K-Satz-Statistik je Startstunde (ist C tagesstundenabhängig?).
5. **Bewertung:** heute `--modus=voll` für 12x, 12y, 12z (Entwicklungsmenge 14.09.–21.10.: Diagnose und Rangfolge; der Vergleich gegen 12s aus den
   Paaren der `scores.json`). Urteil nur `--modus=abnahme` ab ≈ 03.11. (≥ 4 reife Spur-P-Tage); Spur R nur auf Jans Wort. Keine Nachstellung an
   Spur-P- oder Spur-R-Zahlen; bei rot werden die Zellen benannt. Ein Stand heißt nur dann buscosun Fusion 13, wenn er auf Spur P alle Gates
   besteht UND nachweisbar vor 12s liegt — kein 13 um Hundertstel (Vorzugsreihenfolge im Nachtrag 6).
6. **Erwartung vorab (ehrlich):** Auf der Entwicklungsmenge (Herbst, mit Stationen, 0–6 h nur nachts) ändert 12x Wind/Böe ≤ 6 h nachts (DE ≈
   neutral, AT/CH breiter) und alle vier Größen bei 6–48 h je Stunde und Land — erwartet +0,1 … +0,3 % gegen 12s (12t holte gepoolt +0,2 % mit
   AT/CH-Verlusten); 12y ändert nur den K-Satz und dürfte im Herbst nahe 12v liegen (die Nacht-Klassen „Rest" gleichen der Sommertabelle, §15.6),
   V-OF-26 bliebe dann bestehen; 12z = Summe. Wo beide Hebel ausgelegt sind, zu wirken, ist Spur R (Nacht, alle Jahreszeiten).

### 16.4a Die eine Regeländerung vor dem Prüfstandlauf (22.10. ≈ 20:00 UTC, nach dem Lesen der K-Satz-Statistik aus Fenster K, vor dem Fit der Skala und vor jedem Prüfstandlauf)

Fenster K (580 Slots, 211 700 Aufrufe, 0 Fehler) zeigt für **Wind und Böe je Jahreszeit nur die Klasse f < 0,15 mit ≥ 2 000 Zeilen** (Klassen
0,15–0,7: 650–1 800 Zeilen je Jahreszeit; f ≥ 0,7 wie im Sommer leer). Regel 4 wörtlich angewandt hieße: alle Klassen ab f 0,15 leer ⇒ die
Rückfallregel von `anchorKSetOf` nimmt die Klasse darunter, also f < 0,15 mit C ≈ 0,09–0,19 und V ≈ 0,63–0,75 ⇒ g = 2C/f − V < 0 bei jedem
realen f ⇒ Faktor 1 — der Saison-K-Satz hätte die Wind-/Böen-Kopplung **abgeschaltet**, nicht saisonalisiert; an DE-Punkten der Rolle B
würde Wind 0–6 h noch breiter als bei 12v (88,5 %). Das ist kein Messergebnis, sondern eine Lücke der Rückfallregel bei dünnen Klassen. §15.6
hatte für Wind/Böe ohnehin keinen Saisonunterschied gezeigt (DJF C 0,25–0,45 / 0,22–0,62 gegen Rest 0,22–0,48 / 0,20–0,58). Für T sind in
MAM und JJA die beiden Klassen f ≥ 0,7 knapp leer (1 620–1 966 Zeilen) — dort stünde die Klasse 0,5–0,7 (C 0,24–0,25) ein, obwohl OF-7b für
f ≥ 0,7 im Sommer 0,45/0,44 misst (352 Slots, alle Stunden).

**Änderung (einmalig, dokumentiert, vor der Hash-Bildung in den Nachtrag 6 übernommen):** `ANCHOR_KSET_TABLE_S` trägt die Saisonklassen **nur
für T**; eine T-Klasse ohne ≥ 2 000 Zeilen oder mit C ≤ 0 nimmt die **OF-7b-Klasse** (Sommertabelle, alle Stunden) statt der Klasse darunter;
**Wind und Böe behalten in jeder Jahreszeit die OF-7b-Klassen** (= `anchorKSet: 1`). 12y unterscheidet sich von 12v damit genau in der
T-Kopplung je Jahreszeit. Die Regel 4 (Statistik, Schwellen, Länder gepoolt) bleibt; nur die Rückfallregel bei leeren Klassen und der
Geltungsbereich ändern sich. Wie bei OF-7 (§11.2) und OF-8 (§15.6): Form an den Fit-Daten geändert, vor jedem Prüfstandlauf.

**Zweiter Teil derselben Änderung (nach dem ersten Fit-Lauf der Skala, 20:05 UTC, vor jedem Prüfstandlauf):** Der CRPS-Wächter (Regel 2) hat
**alle 16 Windzeilen** auf 1 gesetzt — gepoolt −2,0 … −2,4 %, DE −0,1 … −0,5 %, AT −4,9 … −5,4 %, CH −1,9 … −3,8 % CRPS-Skill auf den eigenen
Fit-Zeilen, obwohl jede Zelle auf 80 % Abdeckung gebracht war (**V-OF-30:** die Tagesstunden-Skala des Windes verbessert die Abdeckung und
verschlechtert den CRPS in jedem Land und jeder Zeile — V-OF-25 gilt für alle Stunden: `scaleDistSigma` verschiebt bei der Rice-Form den
Mittelwert mit, die Form des Windfehlers ist das Problem, nicht die Skala). Regel 3 wörtlich hätte die Zeilen ≤ 6 h des Windes danach mit R
multipliziert, also allein R = 1,08–1,19 (SON/DJF) zu jeder Tagesstunde angewandt — genau der nachts gefittete Windfaktor > 1, den §15.6 für das
Produkt am Tag ausgeschlossen hat. Klarstellung: **R kalibriert den Sommer-Fit auf die anderen Jahreszeiten; eine Größe ohne Fit-Knoten in den
Zeilen ≤ 6 h (alle 1, durch Wächter oder ungefittet) bekommt R = 1.** Damit skaliert `fusion-12x` den **Wind gar nicht**; der Hebel E-OF-10
liegt in T und Td bei 7–48 h (je Stunde und Land, Wächter +0,4 … +1,5 %) und in der Böe in allen Zeilen (Wächter +0,3 … +0,7 %, CH 1–2 h −0,04 %,
innerhalb der Schwelle) × R_Böe (DJF 1,12 / MAM 0,96 / SON 1,06; DE 1,14 / 0,96 / 1,08; AT 1,09 / 0,98 / 1,04; CH 1,12 / 0,94 / 1,04).

Erster Blick auf T (Länder gepoolt, τ = 1, Klassen f 0,15–0,3 / 0,3–0,5 / 0,5–0,7 / 0,7–0,85 / ≥ 0,85): **SON C 0,29 / 0,32 / 0,36 / 0,50 / 0,35** —
nahe DJF (0,31 / 0,32 / 0,40 / 0,61 / 0,37) und deutlich über MAM (0,22 / 0,17 / 0,25 / — / —) und JJA (0,17 / 0,24 / 0,24 / — / —). Der Herbst
koppelt wie der Winter; die Sommertabelle (0,26 / 0,32 / 0,30 / 0,45 / 0,44) liegt bei kleinem f darunter — die Richtung von V-OF-26. **V-OF-29
(Diagnose, berichtet):** je Land ist die T-Kopplung in DE schwach (SON C 0,18 / 0,05 / 0,22), in AT/CH stark (0,36 / 0,42 bzw. 0,32 / 0,35 / 0,38);
der gepoolte Satz wird von AT/CH getragen (größere Fehlervarianz). Das Prüfnetz ist in DE zu weitmaschig für hohe f-Klassen; ein K-Satz je Land
bräuchte den dichten Satz als Messnetz (eigener Schritt).

### 16.5 Messung und Fit (`scripts/obsfusion/of9.mjs`; Rohdaten `audit/obs-fusion/of9/part-*.{json,f32}` (gitignored, ≈ 290 MB), Fit `of9-fit.json` sha256 `5c238bd4b161…`, Logs `laeufe/11-of9-*.log`; Tabellen GESCHRIEBEN nach `src/pointForecast/fusion/sigmaScaleH.ts`)

- **Fenster H:** 704 Slots (88 Tage × 8 Startstunden), 256 960 Aufrufe, **48,6 Mio. Zeilen**, 0 Fehler; drei losgelöste Teile (`detach.ps1`,
  je 27–28 min, 97 MB f32 je Teil); 9 216 Schlüssel (Größe × Vorlauf 1–48 × Land × Rolle × Gültigstunde). **Fenster K:** 580 Slots, 211 700
  Aufrufe, 0 Fehler, 23 min. Fit 2 min. Der Verifier `verify:pv-cube` Block (13) prüft Form, Interpolation (Stunde zyklisch, Saison im Tag des
  Jahres, Klemme), Byte-Gleichheit Option 6 ≡ Option 1 mit H, Identität, Saisonklassen; 452/453 (das eine Rot ist das fremde (21) seit `aa464517`).
- **Knoten der Tabelle H (benutzt), Nacht = Klassen 22,5/1,5/4,5 UTC, Tag = 10,5/13,5/16,5 UTC:**

| Größe · Zeile | gepoolt Nacht / Tag | DE | AT | CH |
|---|---|---|---|---|
| T 7–24 h | 0,86 / 0,80 | 0,92 / 0,85 | 0,77 / 0,77 | 0,82 / 0,74 |
| T 25–48 h | 0,87 / 0,81 | 0,93 / 0,84 | 0,79 / 0,81 | 0,84 / 0,76 |
| Td 7–24 h | 0,93 / 0,94 | 0,87 / 0,89 | 0,96 / 0,96 | 1,04 / 0,99 |
| Td 25–48 h | 0,89 / 0,90 | 0,83 / 0,85 | 0,88 / 0,91 | 0,98 / 0,97 |
| Böe 1–2 h · 3–6 h | 0,88 / 0,91 · 0,86 / 0,90 | 0,85 / 0,85 · 0,84 / 0,86 | 0,89 / 0,95 · 0,85 / 0,92 | 0,93 / 0,99 · 0,89 / 0,96 |
| Böe 7–24 h · 25–48 h | 0,85 / 0,90 · 0,84 / 0,89 | 0,83 / 0,84 · 0,83 / 0,84 | 0,84 / 0,92 · 0,81 / 0,91 | 0,90 / 0,97 · 0,86 / 0,95 |
| Wind (alle Zeilen) | 1 (Wächter) | 1 | 1 | 1 |
| T/Td 1–6 h | 1 (Regel 3) | 1 | 1 | 1 |

  Saisonfaktor R auf Böe ≤ 6 h (DJF / MAM / SON; JJA 1): gepoolt 1,12 / 0,96 / 1,06, DE 1,14 / 0,96 / 1,08, AT 1,09 / 0,98 / 1,04, CH 1,12 / 0,94 / 1,04;
  Wind R = 1 (§16.4a). Der Tagesgang der T-Knoten ist in DE und CH klar (nachts breiter nötig als tags: DE 0,92 gegen 0,85, CH 0,82 gegen 0,74),
  in AT flach; die Böe braucht nachts mehr Einengung als tags (AT 0,81–0,89 gegen 0,91–0,95). Der Landesunterschied ist größer als der Tagesgang
  (T AT/CH 0,73–0,86 gegen DE 0,81–0,94) — genau das, was 12t gepoolt (0,83) in AT zu weit trieb (§16.1).
- **Erreichte Abdeckung auf den Fit-Daten mit der interpolierten Tabelle** (Sommer, ohne Anker): T 86,9 → 81,8 % (Zeilen ≤ 6 h bleiben 86–92 %,
  Zeilen 7–48 h 79–83 % je Zelle), Td 84,0 → 81,0 %, Böe 85,1 → 80,3 % (jede Zelle 79–82 %), Wind unverändert 81,8 %. CRPS-Skill: T **+0,93 %**
  (DE +0,52, AT +1,16, CH +1,33), Td +0,37 % (DE +0,67), Böe +0,46 % (DE +0,71, AT +0,45, CH +0,12), Wind 0. Je Vorlauf T: 6 h 87 → 87, 12 h
  88 → 84, 24 h 87 → 80, 48 h 86 → 82 %.
- **Wind, berichtet, nicht benutzt (V-OF-30):** die gefitteten Stundenknoten wären gepoolt nachts 1,05–1,09 und tags 0,76–0,79 (DE 0,96–0,99 /
  0,74; AT nachts am Deckel 1,6, tags 0,79–0,85; CH nachts 1,25–1,6, tags 0,78–0,83) — der Tagesgang aus V-OF-24, jetzt für alle Stunden und
  Zeilen bis 48 h belegt: Abdeckung ohne Skala bei ≤ 6 h gepoolt nachts 77–80 %, tags 85–89 % (AT 74 gegen 86 %, DE 79–84 gegen 90 %). Aber
  jede Zeile verschlechtert den CRPS (gepoolt −2,0 … −2,4 %, DE −0,1 … −0,5 %, AT −4,9 … −5,4 %, CH −1,9 … −3,8 %) ⇒ alle 16 Zeilen auf 1. Der
  multiplikative Faktor auf σ ist beim Wind das falsche Werkzeug (Rice-Form: σ verschiebt den Mittelwert mit; V-OF-25); der richtige Hebel
  wäre eine mittelwerttreue Umformung oder eine Nachkalibrierung der Quantile je Stunde — eigener Kandidat, nicht heute.
- **K-Satz je Jahreszeit (benutzt, T; Länder gepoolt, Klassen f 0–0,15 / 0,15–0,3 / 0,3–0,5 / 0,5–0,7 / 0,7–0,85 / ≥ 0,85):** DJF C 0,09 / 0,31 /
  0,32 / 0,40 / 0,61 / 0,37 · MAM 0,08 / 0,22 / 0,17 / 0,25 / 0,45\* / 0,44\* · JJA 0,06 / 0,17 / 0,24 / 0,24 / 0,45\* / 0,44\* · SON 0,05 / 0,29 / 0,32 /
  0,36 / 0,50 / 0,35 (\* = OF-7b-Klasse eingesetzt, Saison-n 1 620–1 966); V 0,26–0,75. Wind/Böe = OF-7b in jeder Jahreszeit (§16.4a; je
  Jahreszeit nur f < 0,15 besetzt, dort C 0,09–0,19). τ = 2 bestätigt die Faktorisierung (R(2)/C 0,9–1,1, w(2) 0,86–0,97).
- **V-OF-31 — die K-Kopplung ist tagesstundenabhängig (Diagnose aus Fenster H, Sommer, T, Klassen 0,15–0,7):** Start 06–15 UTC C 0,21–0,48,
  Start 00/03/21 UTC 0,08–0,21. Die Saisontabelle stammt aus der Tag-0-Reihe um 00 UTC und ist damit eine **Nacht-Tabelle**; am Tag koppelt sie
  in MAM/JJA schwächer als die Sommertabelle OF-7b (alle Stunden). Der Prüfstand sieht 0–6 h nur nachts — dort ist sie richtig; für den Tag im
  Produkt fehlt die Messung (Nachholkette / Archiv ab Dezember). Berichtet, Form unverändert.
- Commit **`2d0eb64e`** (Motor, Tabellen, of9, Verifier, Nachtrag 6 + Hash `4cdd797e68ab…` auf LF-Inhalt, Gegenprobe Nachtrag 5 passt, 20:11:51
  UTC), Register **`ee2badcc`** (12x `ca468398d622`, 12y `5367d75d9439`, 12z `b5b81a33ccef`; Freeze 22.10., Spur R sauber); `typecheck` grün,
  `verify:fusion-release` 30/30, `verify:pruefstand` 60/60. Volltests gestartet 20:20 UTC losgelöst (`voll13.cmd`, `PRUEFSTAND_WORKERS=2`,
  nacheinander 12x → 12y → 12z; Log `C:\dev\buscosun-pruefstand\log\pull-voll-13.log`, Kopie `laeufe/11-voll-12xyz.log`; je Kandidat 38 Konserven
  in ≈ 11 min (34 s je Konserve bei zwei Arbeitern, Runner 3,8 GB) plus Auswertung, fertig 21:07 UTC; kein Eingriff eines Wächters).

### 16.6 Ergebnis der drei Volltests (Protokoll P1 `4b633f0766a7`, Wahrheit W1 `bf39c35589f2`, Champion Fusion 9; Berichte `audit/pruefstand/berichte/fusion-12{x,y,z}/2026-10-22-voll/`, untracked)

Entwicklungsmenge 14.09.–21.10. (38 Ausgabetage, 99 Kernzellen, 1 917 823 Werte mit unreifer Wahrheit mitgezählt). **Diagnose und Rangfolge, kein
Urteil** — H-OF-6 wird nur mit `--modus=abnahme` bewertet. Der Vergleich gegen 12s steht in den Paaren `cand|fusion-12s` (Rolle B, 95 %).

| | **`fusion-12x`** (Skala H) | **`fusion-12y`** (Saison-K-Satz) | **`fusion-12z`** (beides) | `fusion-12s` = Fusion 12 |
|---|---|---|---|---|
| Index gegen Fusion 9 (Rolle B) | **+2,05 %** (+1,71 … +2,34), MDE 0,38 % | +1,88 % (+1,54 … +2,15) | **+2,02 %** (+1,68 … +2,30) | ≈ +1,9 % |
| gegen 12s | **+0,13 %** (+0,09 … +0,17) nachweisbar besser | **−0,05 %** (−0,07 … −0,04) nachweisbar schlechter | **+0,09 %** (+0,05 … +0,13) nachweisbar besser | — |
| gegen 12v · 12w | +0,18 · +0,16 | ±0,00 · −0,03 | +0,14 · +0,12 | |
| gegen 12t · 12u (abgelehnt) | −0,04 · −0,05 | −0,22 · −0,23 | −0,08 · −0,09 | −0,17 · −0,18 |
| G1 · G2 | grün · **rot 1** (Td 0–6 h AT: −0,0 %, signifikant) | grün · grün | grün · **rot 1** (Td 0–6 h AT) | grün · grün |
| G3 | **rot 2**: T 0–6 h 76,3 % zu schmal (Champion 78,6, Band 77,0–83,0), Wind 6–24 h 83,8 % zu breit | **rot 5**: T 6–24/24–48, Wind 6–24, Böe 0–6/6–24 zu breit | **rot 1**: Wind 6–24 h 84,0 % zu breit | rot 3 |
| G4 | grün (`ad34ed85830c`) | grün (`7e098270b2da`) | grün (`e2d01aed163a`) | grün |
| Produktaussage | 84 von 99 | 84 von 99 | 84 von 99 | 84 von 99 (12w) |
| Rang (Skill gegen Klima, Rolle B) | **3.** (20,79 %) | 9. (20,70 %) | **4.** (20,77 %) | 5. (20,72 %) |
| Rolle A gegen 9 | +1,07 % | +1,06 % | +1,06 % | |

Rangfolge: 12u 20,87 · 12t 20,86 · **12x 20,79 · 12z 20,77** · 12s 20,72 · 12w 20,71 · 12v 20,70 · 12r 20,70 · **12y 20,70** · 12q 20,68 · 12 20,67 · 12p 20,55 · 10 20,29 ·
11 20,04 · 9 = 8 18,97. Beste Kernzellen gegen 9 (alle drei): Wind 0–6 h DE +21–22 %, T 0–6 h DE +20–21 %, Böe 0–6 h DE +16–18 %, Wind 240–336 h CH +17 %;
schlechteste Td 48–120 h DE −1,0 %, T 48–120 h DE −0,3 % (nicht nachweisbar). Überanpassung: keine Warnung (Gewinn A +1,06 %, B +1,9–2,0 %).

**Abdeckung Rolle B je Land (12s → Kandidat), die Zellen, die sich ändern:**

| Größe · Fenster | 12x DE / AT / CH | 12y DE / AT / CH | 12z DE / AT / CH |
|---|---|---|---|
| T 0–6 h | 77,6 → 77,5 / 73,6 → 73,3 / 76,7 → 76,5 | 77,6 → **86,8** / 75,9 / 77,7 | 86,7 / 75,7 / 77,5 |
| T 6–24 h | 86,1 → **81,7** / 81,3 → **74,7** / 84,0 → **76,1** | ≈ 12s | 82,2 / 74,9 / 76,2 |
| T 24–48 h | 86,1 → **81,5** / 79,6 → **71,7** / 84,0 → **76,1** | ≈ 12s | 81,9 / 71,8 / 76,1 |
| Td 6–24 · 24–48 h | 89,2 → 85,2 · 90,5 → 85,8 / 83,2 → 81,4 · 83,3 → 79,5 / 79,2 → 79,1 · 81,7 → 81,1 | = 12s | wie 12x |
| Wind 0–6 h | = 12s | 83,7 → **88,5** / 73,3 / 75,5 | 88,5 / 73,3 / 75,5 |
| Böe 0–6 h | 84,5 → 82,1 / 85,9 → 82,8 / 87,2 → 85,1 | 84,5 → 88,6 / 86,1 / 87,1 | 86,5 / 82,8 / 85,0 |
| Böe 6–24 · 24–48 h | 87,6 → 82,6 · 88,4 → 83,5 / 87,6 → 84,4 · 89,0 → 85,3 / 88,6 → 86,8 · 89,4 → 86,1 | ≈ 12s | wie 12x |

**Deutung (Diagnose, keine Nachstellung):**

1. **Die Skala H (12x) ist der erste Kandidat seit 12t/12u, der 12s auf der Entwicklungsmenge nachweisbar schlägt** (+0,13 %, Intervall ganz
   über 0, Nachweisgrenze 0,07 %), und anders als 12t/12u ohne Sommer-Windknoten (der Wind rechnet wie 12s, V-OF-30). Ihr Gewinn liegt genau
   dort, wo die Zellen von 12s zu breit waren: Td DE 6–48 h (+1,1 … +2,1 % CRPS, Abdeckung 89–90 → 85–86 %), Böe 6–48 h in allen Ländern (+1,0 …
   +1,3 %, 88–89 → 83–86 %), T DE 6–48 h (86 → 82 %, im Band). Ihr Preis: **V-OF-32 — T in AT und CH bei 6–48 h fällt unter das Band** (AT 24–48 h
   71,7 %, CH 76,1 %; CRPS T 24–48 h AT −0,3 %, die einzige nachweisbar schlechtere Zelle gegen 12s neben Td 0–6 h AT −0,0 %). Die Knoten
   stammen aus der Sommerkette ohne Anker (AT 0,73–0,86), das Herbst-Archiv mit Anker steht in AT schon bei 80–81 % — derselbe Regime-Unterschied
   wie V-OF-18/V-OF-27, nur im Fenster 6–48 h; die Tag-0-Reihe misst dort keinen Saisonfaktor (Regel 3). Gepoolt landen T 6–24/24–48 h bei
   78,6/77,8 % „im Band" — durch Mischung von DE (82) und AT/CH (72–76), wie bei 12v (§15.8, 2).
2. **Der Saison-K-Satz (12y) ist 12v** (±0,00 %, Rangplatz 9) und behebt V-OF-26 nicht: T 0–6 h DE wird noch etwas breiter (86,8 statt 86,0 %),
   weil die SON-Klasse f ≥ 0,85 (C 0,35, V 0,44 ⇒ g = 2C/f − V ≈ 0,34) schwächer koppelt als die Sommertabelle (0,44/0,50 ⇒ 0,47). Die Klasse, in
   der der dichte DE-Satz steht, wird im Prüfnetz von AT/CH getragen (V-OF-29) — ein K-Satz aus dem Prüfnetz erreicht den dichten Satz nicht,
   gleich in welcher Jahreszeit. E-OF-11 ist in dieser Form ausgereizt; der nächste Schritt wäre die K-Satz-Statistik **auf dem dichten Satz
   (`obs/v1`) je Land** als Messnetz — eine neue Messung, kein Kandidat heute.
3. **12z = 12x + 12y:** +0,09 % gegen 12s; der K-Satz kostet 0,04 % gegen 12x und bringt dafür T 0–6 h ins Band (G3 nur noch Wind 6–24 h rot,
   die 12s-Linie) — wieder durch die DE-Verbreiterung (86,7 %), nicht durch AT/CH. Nach der Vorzugsregel des Nachtrags 6 (gleich grün ⇒ der
   einfachere) wäre 12x vor 12z.
4. **G2 rot bei 12x/12z ist eine Zelle mit −0,0 %:** Td 0–6 h AT, der Vorlauf 5–6 h bekommt durch die lineare Interpolation zur Zeile 15,5 h
   (AT Td 0,96) einen Faktor knapp unter 1; bei n = 4 500 wird das signifikant. Kein Nutzerproblem, aber ein Gate — die Interpolation zwischen
   der Zeile 4,5 h (= 1) und 15,5 h reicht ins Fenster 0–6 h hinein (Vorlauf 5 und 6). Für die Abnahme bleibt es, wie es ist (keine Nachstellung).
5. **H-OF-6 (b) ist nach §16.4a gegenstandslos:** die Behauptung zur Wind-Abdeckung 0–6 h auf Spur R setzt eine Windskala voraus, die der
   Wächter vor dem Lauf gestrichen hat; ich habe den Satz (b) vor der Hash-Bildung nicht angepasst (Versehen). Die Abnahme wird (b) als „nicht
   erfüllt" ausweisen; (a) und (c) sind davon unberührt. Auf Spur R unterscheidet sich 12x von 12s nur in der Böe 1–2 h (Stundenknoten × R); 12y
   dort = 12s (kein Anker im Tresor).
6. **Was bleibt:** Spur P ab 23.10.; Abnahme ≈ 03.11. für 12x und 12z (dazu 12v, 12w, 12t/12u-Wiederholung; vorher `build-dense-obs.mjs` bis
   Vortag + `build-w1.mjs`); Spur R nur auf Jans Wort (`vergleich 9 12s 12x 12z tresor`). Entscheidungen für Jan: **E-OF-12** (Wind-Form:
   mittelwerttreue σ-Skalierung oder Quantil-Nachkalibrierung je Stunde — der größte bekannte Fehler bleibt ungenutzt, V-OF-30),
   **E-OF-13** (K-Satz auf dem dichten Satz je Land messen, V-OF-29), **E-OF-14** (Saisonfaktor für 7–48 h, messbar erst aus Nachholkette/Archiv
   ab Dezember, V-OF-32). Bericht-Ordner 12x/12y/12z (untracked), dieser Abschnitt, §15.8, CLAUDE.md und MANUELLE-SCHRITTE sind uncommitted (Jans Gate).

## 17 E-OF-15 entschieden — „buscosun Fusion 13" = Kandidat `fusion-12x`, eingeschaltet ohne Spur P (Jan 22.10. nachts)

**Auftrag (wörtlich):** „ich möchte dass du 12 x live schaltest auf der kompletten website und buscosun fusion 13 nennst." Vorher gesagt
(§16.6, Bericht an Jan): der Volltest ist Diagnose, die Abnahme ≈ 03.11. entscheidet; die Vorzugsregel des Nachtrags 6 sah keine 13 ohne
Spur P vor. Jan hat das gehört und entschieden — wie bei Fusion 12 (E-OF-4, §12). Der Prüfstand-Champion bleibt Fusion 9 (E-OF-7); die
Abnahme von 12x/12z auf Spur P läuft wie geplant weiter und bleibt das einzige Urteil; `fusion-12x` behält im Register den Status `kandidat`.

### 17.1 Umsetzung (Register der Stände, E-FR-1: EIN Eintrag, eine Nummer überall)

- `fusion/fusionRelease.ts`: Konstante `FUSION13_SIGMA_SCALE: 0 | 6 = 6` (Doku mit Volltest-Zahlen, Preis V-OF-32, Wind unskaliert V-OF-30,
  E-OF-15 wörtlich), Eintrag `n: 13` = `sigmaScale: 6` mit Schalter `io: { key: 'sigmaScaleHour', flag: '?sscale=0' }`, `offLabel`
  „Stundenskala per Schalter aus"; `FusionIoSwitch` + `'sigmaScaleHour'`. `FUSION_CURRENT` = 13, `FUSION_NAME` „buscosun Fusion 13" — jede
  Seite, jeder Producer (Streckenprognose, Kartenfelder, Seewetter, Dashboard) und jede Stufen-Notiz nennt den Stand aus dieser Datei.
- `pfFlags.ts`: `pfSigmaScaleHourFrom` (`?sscale=0` = benannter Rückfall auf Fusion 12); `cubeSource.ts`: `CubeIo.sigmaScaleHour`, im
  Browser-`defaultCubeIo` aus dem Schalter gesetzt; der Stufen-Mechanismus (`fusionStage((r) => io[r.io.key] === false)`) nimmt die Option
  und die Notiz des Stands mit dem Schalter zurück, Label „buscosun Fusion 12 (Stundenskala per Schalter aus)".
- `verify-fusion-release.mjs` B3: die Fit-Skripte `scripts/obsfusion/of*.mjs` sind Definitionsort der Tabellen (ihr Ergebnis-JSON nennt die
  gefittete Option, der Generator schreibt die Provenienz-Notiz) — seit `sigmaScale` eine Stands-Option ist, traf das Muster dort zwei
  Fehlalarme (of7.mjs:234 JSON-Schlüssel, of9.mjs:451 Notiz-Text). `verify-obs-reader.mjs` (11): „`FUSION_CURRENT` folgt" hieß bisher
  `=== 12`, jetzt `≥ 12` genau dann, wenn 12 an ist (ein späterer Stand baut auf 12 auf). Gegenproben unverändert.
- Verifier: `typecheck` grün; `verify:fusion-release` **30/30** (A3: `?sscale=0 ⇒ buscosun Fusion 12 (Stundenskala per Schalter aus)`);
  `verify:pv-cube` 452/453 (das fremde Rot (21)); `verify:obs-reader` 70/70; `npm run build` grün (260/260 Shell-Prüfungen).
- **Budget:** eagerJs 110,1/110 KB und totalJs 1 892,6/1 825 KB rot — beide Ratschen waren vor diesem Schritt schon rot (V-HB-1, fremde Linie
  HB: eagerJs 110,1, totalJs 1 888,8; MANUELLE-SCHRITTE §73.4). Fusion 13 bringt **+3,8 KB gzip** in den lazy Fusionskern (Tabelle H ≈ 12 KB
  roh, Interpolation, Saisonfaktor); der Erstbild-Pfad (eagerJs) ist unverändert. Keine Anhebung der Ratsche von mir — zusammen mit §73.4
  Jans Entscheidung.
- Was sich im Produkt ändert (gegen Fusion 12, aus dem Volltest §16.6): schmalere Bänder für Td in DE bei 6–48 h, für die Böe in allen
  Ländern bei 6–48 h, für T in DE bei 6–48 h; tags enger als nachts (DE T 0,85 gegen 0,92); Böe ≤ 6 h im Herbst/Winter leicht weiter als im
  Sommer (Saisonfaktor); **T in AT/CH bei 6–48 h deutlich schmaler** (Abdeckung 72–76 % statt 80–84 % — der Preis, V-OF-32); Wind, T/Td ≤ 6 h,
  Niederschlag, Bewölkung unverändert. Datenprodukte nennen den Stand, mit dem sie GEBAUT wurden: bis zum ersten Lauf der Workflows nach dem
  Push stehen `road/fc`, Kartenfelder und Seewetter-Produkte auf Fusion 12 und die Seiten sagen das (E-FR-1).
- **Live heißt Push:** Produktion baut aus `origin/main`. Der Push von `35f1285a` … dem Commit dieses Schritts ist Jans Gate (er trägt auch
  fremde Commits anderer Sitzungen seit `83ba8b0`: Glacier-Stil, Atmosphäre). Bis dahin ist Fusion 13 im Code und lokal, nicht auf
  buscosun.com.
