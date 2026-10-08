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
