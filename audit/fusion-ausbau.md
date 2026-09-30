# Phase AX — Ausbau von buscosun Fusion nach dem Expertenbericht (offene Punkte, Reihenfolge nach Gewinn je Aufwand)

> **Auftrag (Jan, 30.09.2026):** alle offenen Punkte des Expertenberichts vom 29.09. (`fusion-verbesserungen-2026-09-29.md`,
> Prüfung in `audit/fusion-expertenbericht-2026-09-29.md`) nacheinander umsetzen, dazu zwei Hebel, die nicht im Bericht stehen:
> die Bewölkung als Zwei-Atome-Familie (V-FV-10) und die CH-Windparameter je Land (V-FS-5). Reihenfolge = die Einschätzung
> vom 30.09. (Gewinn je Aufwand). Jedes Arbeitspaket AX-n: Diagnose → Plan → Umsetzung → Verify → Gate, hinter Schalter oder
> ohne Verhaltensänderung des Live-Pfads; Commit, Push und Kopien ins Daten-Repo bleiben Jans Gate.
>
> **Erweiterung (Jan, 30.09. mittags):** „ich gebe dir die Berechtigung, das buscosun-data-Repo auch vollumfänglich zu ändern
> und Jobs zu starten" — seitdem gehen Kopien, Pushes und Cron-Läufe im Daten-Repo ohne Gate (§6a–§6e: `7115d708`,
> `3869297b`, `d058317c`, `2b916aa1`); Pushes von `buscosun-web/main` bleiben Jans Gate, und der Punkt-Cron klont genau
> diesen Zweig — jede Producer-Änderung dieser Phase wirkt dort erst nach dem Push (V-AX-8).
>
> **Regeln dieser Phase:** kein Eingriff in den Live-Pfad ohne Byte-Gleichheitsbeweis (`verify:pv-fusion`); jede Wirkung im
> Cube-Pfad mit Negativkontrolle im Verifier; jede Messung mit Datum, Uhrzeit und Datenstand; Schätzungen heißen Schätzungen.

## 0 Kurzfassung (wächst je Arbeitspaket)

| AP | Thema | Stand | Gate |
|---|---|---|---|
| AX-1 | Messung der Station am Punkt (V-FS-15; Bericht #5, der Teil ohne MOSMIX_S) | **fertig (uncommitted)** — an 8 Stadtpunkten kam vorher **0** Messung ≤ 5 km / 50 m an, jetzt **4** (die übrigen 4 sind strukturell: Interpolationspunkte, Stationen ohne Messung); die „sechs nächsten Stationen" sind jetzt die nächsten (vorher 6,6–31,8 km); DE-Messungen tragen die Messzeit; Browser-Beleg München (§1.6) | `verify:pv-cube` Block 30 (6 Prüfungen) · `verify:point-client` 167/167 · `verify:pv-fusion` **229/229** (Live-Pfad byte-gleich) · typecheck 0 |
| AX-2 | Route der Lernstufe je Stufe (E-FV-3) · Alter der Tabellen (V-EX-6, #12) | **gebaut, gemessen — Route 3 am Archiv SCHLECHTER** (stationslos T 51–120 h −11 %!, Td −8 %!, Wind 126–240 h −17 %!) ⇒ `learnedRoute` bleibt Voreinstellung 1, nicht in der Stufe; Altersnotizen der drei Tabellen benannt, nie stumm | Block 31 (6 Prüfungen) · Archivkarte `score\2026-09-30-ax2` (370 129 Zeilen, 15 Slots) |
| AX-3 | Anomalie-Interpolation für T (#16; #15 Rampe nicht messbar, V-AX-6) | **fertig, in der Stufe fs (E-AX-3)** — Orakel auf der Wahrheit (389 Stationen, 129 Tage): 6-h-Schritte MAE 1,12 → 0,95 K (**−15,5 %***), 3-h −4,1 %*, Tagesmaximum-Stunden −26 %; Td und Böe ohne Gewinn ⇒ bleiben linear, Td auf T gekappt | Block 32 (5 Prüfungen) · `score\2026-09-30-ax3` |
| AX-4 | Bewölkung als Zwei-Atome-Mischung (V-FV-10, nicht im Bericht) | **fertig, gemessen — Einbau = E-AX-4/5** — Familie `cloudMix`, Atome je Stratum logistisch gelernt (16 von 20 geschrieben, Sommer-Strata 126–336 h der Lauf-Route no-skill); out of fold **CRPS +5,7 %*** (0–6 h +10,7 %*, 51–120 h +6,7 %*), MAE −9 %, **PIT-Rand 0,280 → 0,195**, Atome kalibriert; Codec Version 3 | Block 33 (5 Prüfungen) · `verifyDist` 54/54 · `fit\2026-09-30-ax4\fusion.ax4.json`, `score\2026-09-30-ax4` |
| AX-5 | Stationswert mit Parametern je Land (V-FS-5, nicht im Bericht) | **fertig, gemessen — H15 GILT** (Archiv, Leave-Day-out): CH Wind 7–120 h +1,3…+3,7 %*, Böe +3,2…+7,0 %*, AT Wind +4,7…+5,6 %*, DE Böe +1,5…+2,5 %*, nirgends schlechter; die CH-Lücke gegen MOSMIX (V-FS-5) schließt sich; Tabelle `fit\2026-09-30-ax5\stack.archive.json` (863 Einträge, 28,7 KB gz) = E-AX-7 | Block 34 (3 Prüfungen) · `stationValue.ts` 10/10 · Karte `score\2026-09-30-ax5` |
| AX-7 | Ensemble-Mittel in den Cube (E-AX-6; Auftrag Jan 30.09.: Daten-Repo und Jobs freigegeben) | **fertig — Schema 6 (61 Ebenen: `t2m/u10/v10/precip_ens`), Producer aus denselben Member-Bytes, Leser liest 5 und 6 (Übergang mit echtem Schema-5-Chunk geprüft), Client-Option `ensMember` (Voreinstellung aus, σ = 1,5·σ_ens set); lokaler Producer-Lauf gegen den echten 00z-Lauf: Ebenen an genau der Rasterstunde 144 gefüllt, Abstand zum HRES 0,3–1,7 K (§6a.3)** — läuft im Cron erst nach dem Push von `buscosun-web/main` | Block 35 (7 Prüfungen) · `verify:point-data` 999/999 · `%TEMP%\ax7-build` |
| AX-8 | MOSMIX-S als zweites Stationsprodukt (#5, zweiter Teil; `DECLINED.mosmix_s`) | **fertig — gemessen am echten File (alle zehn Größen, dieselben 3 071 Stationen, 240 h, Lauf + 39…41 min); Produkt `point/stations-s/`, eigene Aufbewahrung 6 h, Index `stationsS`, Leser-Option `stationSource` (L bleibt Voreinstellung, `?st=s`), vierter Cron-Job `:50` (20 Stunden, in den t2-Stunden im t2-Job) mit Leerlauf-Schutz; Ende-zu-Ende lokal (Bau 36 s, Publisher, Leser)** — Vorlage + README ins Daten-Repo kopiert (§6b) | `verify:point-data` (F3b/3n/3z) · `verify:point-client` **171/171** (10s) · `verify:pv-cube` (19) · `%TEMP%\ax8` |
| AX-9 | Klimagitter 1991–2020 als Temperatur-Prior (#13, E-EX-4) | **fertig, gemessen, Produkt im Daten-Repo (`3869297b`)** — Producer aus DWD-CDC/SPARTACUS/MeteoSwiss (GK3 selbst, SPARTACUS-Normale aus Wert − Anomalie mit exakter Gegenprobe, CH-Sonne relativ → Stunden), 208 Chunks 1,87 MiB, 53 % der Zellen (DE/AT/CH/LI); Client `CubeIo.climaGrid` (`?cg=1`) ersetzt das Tagesmittel T des Priors mit Lapse gegen `elev_src`; **Messung an 14 762 Punkt-Monaten:** Alpen −28 %, CH −16 %, Δh > 200 m −23 %, DE-Flachland +10 %; beide Prioren ≈ 1,2 K zu kalt ⇒ `climaTrend` (0,45 K/Dekade, set): Stationsfeld 1,63 → 1,36, Gitter 1,57 → **1,22 K**; alles voreingestellt aus = E-AX-9 | Block 36 (6 Prüfungen) · `clima-grid-check.mjs` · `%TEMP%\ax9` |
| AX-10 | INCA-Analyse als Anker in Österreich (#14, zweiter Teil) | **gebaut, nicht gemessen** — `CubeObs.weight` (Analyse ≠ Messung), INCA-Zeitreihe am Punkt (Latenz ≈ 1–1,5 h gemessen) parallel zu den Stationen, nur AT, nur mit `CubeIo.incaAnchor` (`?inca=1`), Gewicht 0,6 set; Ausbleiben benannt; Produktwirkung braucht das Archiv (E-AX-10) | Block 37 (4 Prüfungen) |
| AX-11 | Globalstrahlung, Sonnenscheindauer, Sichtweite im Stationsprodukt (#21) | **fertig, lokal geprüft** — drei Ebenen hinter den 61 Cube-Ebenen (MOSMIX `Rad1h`/`SunD1`/`VV`, in S und L), Manifest nennt sie, Leser unverändert (München 30.09. 15 UTC 342 W/m², 60 min, 51 km); +1,66 MiB je Lauf; Dashboard kann sie aus der Stationsreihe nehmen (Phase DB) | `verify:point-data` (3n, 3 Prüfungen) · `%TEMP%\ax8\repo` |
| AX-6 | Ensemble-Mittel in t3 (E-EX-1, #3) — die Messung | **gemessen (roh, 13 Monate, 129 Läufe)** — gegen jeden Einzellauf bei 126–336 h T +14/+23 %*, Wind +13/+16 %*, Böe +10/+12 %*; gegen das Mittel zweier Läufe bei T erst ab 246 h (+10 %*); bei 246–336 h gleichauf mit der Klimatologie ⇒ Gewinn vor allem Wind/Böe; Producer-Schritt = E-AX-6 | `score\2026-09-30-ax6`, `fusion-ausbau/ax6-ens.md` |
| — | Nicht gebaut (Entwürfe §6f) | #17 CH-Member, #18 Exposition, #20 zeitversetztes Ensemble (heute nicht messbar), #4 RUC (E-EX-5: Phase 30.11.), #6 flächige MOS-Korrektur und #8 flächige Niederschlagswahrheit (Datenprogramme); Kalender #1/2 (≥ 30 Ausgabetage), #9 (Winter) | — |

## 1 AX-1 — Die Messung der Station am Punkt erreicht den Cube-Pfad (V-FS-15)

### 1.1 Diagnose (30.09., 09:56 UTC, `fusion-ausbau/ax1-obs-check.mjs`, Live-Netz)

Der Stationswert `M + b + w·I + c·(L − M)` braucht die Innovation I = Messung − Stationsvorhersage **an einer Station am
Punkt** (≤ 5 km, |Δh| ≤ 50 m, `StackTable.range`). H9 hat gemessen, was I bringt (0–6 h: T +12,4 %, Wind +4,8 %, Böe +6,1 %;
AT +14…+24 %). V-FS-15 nannte den Verdacht, dass im Browser die Messung meist von einer anderen Station kommt. Gemessen an
acht Stadtpunkten (Tabelle in `fusion-ausbau/ax1-obs-check.md`): **an keinem einzigen** lag eine Messung im Umkreis der
Tabelle; die nächste stand 6,6–31,8 km entfernt. Drei Ursachen, jede im Abrufer, keine im Motor:

| Land | Abrufer | Fehler | Beleg |
|---|---|---|---|
| DE | `fetchBrightSkyCurrentGrid` (`sampleSources.ts:524`) | 5 × 4 Sonden über ±1,2° / ±1,0° um den Punkt; jede Sonde liefert die Station, die IHR am nächsten ist. Der Punkt selbst ist keine Sonde, die nächste Sonde liegt bis zu 0,3° (≈ 25–35 km) entfernt | München: 29,3 km (Flughafen) statt 3,8 km (München-Stadt) |
| AT | `fetchTawesCurrentGrid` (`geosphereTawes.ts:68`) | `stations.slice(0, 200)` der Betreiberliste — die ersten 200, nicht die nächsten | Wien: 13,7 km statt 1,3 km (Innere Stadt fehlte) |
| CH | `fetchSmnCurrentGrid` (`meteoSwissSmn.ts:232`) | jede (158/80)-te Station des Alphabets, 80 Dateien | Zürich: 6,6 km statt 2,4 km (Fluntern fehlte); 611 ms |

Dazu zwei Nebenbefunde: (a) DE-Messungen trugen keine Messzeit (`fetchCubeObs` setzte `Date.now()`, V-DB-2 „Stations-Adapter
liefern keine Messzeit"), obwohl BrightSky sie liefert; (b) die BrightSky-Antwort trägt `wmo_station_id` = die Kennung des
MOSMIX-Katalogs (geprüft: `?wmo_station_id=10865` ⇒ Muenchen-Stadt, `dwd_station_id` 03379).

### 1.2 Plan

1. Ein reines Hilfsmodul `src/sources/stationSelect.ts`: die `cap` nächsten Stationen zu einem Punkt (`nearestSubset`).
2. TAWES und SMN bekommen die Option `near` (Punkt): dann die nächsten `cap` statt der ersten bzw. jeder k-ten. Ohne Option
   byte-gleich (der Live-Pfad und die Karte rufen ohne).
3. BrightSky: `fetchBrightSkyCurrentAt` — EINE Abfrage nach Koordinaten (BrightSky wählt die nächste Station mit Daten) oder
   nach WMO-Kennung; dieselbe Zuschreibung wie im Raster (V-FI-11, jetzt als reine Funktion `brightSkyPointsOf`); Punkte
   tragen `stationId` (WMO, sonst DWD), `stationName`, `timestamp`.
4. `fetchNearestStationObs(…, options)`: mit `near` die Optionen an die Adapter, in DE zusätzlich die Station des Punkts
   nach Kennung und die Station am Punkt; eine Zeile je Station, gezielte Antwort gewinnt (`nearestStationList`, rein).
5. Cube-Pfad: `CubeIo.obs` bekommt einen optionalen Hinweis (`CubeObsHint` = die Station des Stationsprodukts), im
   progressiven Modus aus dem Bündel; `fetchCubeObs` ruft mit `near` + Hinweis; `CubeObs` trägt `stationId`/`byStation`;
   der Motor nimmt bei gleicher Messzeit die gezielt abgefragte Station, die Notiz nennt Kennung, Name, Abstand.

### 1.3 Umsetzung (30.09.)

| Datei | Änderung |
|---|---|
| `src/sources/stationSelect.ts` **neu** | `nearestSubset`, `distanceKmBetween` (rein) |
| `src/sources/geosphereTawes.ts` | `TawesOptions.near`; mit Option die nächsten `maxStations` (Cube-Pfad: 60) |
| `src/sources/meteoSwissSmn.ts` | `SmnOptions.near`; mit Option die nächsten `maxStations` (Cube-Pfad: 12 Dateien statt 80) |
| `src/sources/brightSkyCurrent.ts` | `brightSkyPointsOf` (Zuschreibung als reine Funktion, das Raster benutzt sie — gleiche Reihenfolge, gleiche Regeln), `fetchBrightSkyCurrentAt` (Koordinaten oder Kennung, 404 ⇒ leer), Punkte mit `stationId`/`stationName`/`timestamp`; `SourceEntry` mit `wmo_station_id`/`dwd_station_id` |
| `src/pointForecast/sampleSources.ts` | `NearestObsOptions { near, station }`, `brightSkyAtPoint` (Kennung + Punkt parallel), `nearestStationList` (Dedupe, rein); ohne Optionen exakt der alte Weg; `NearestStationObs.byStation` |
| `src/pointForecast/cubeSource.ts` | `CubeObs.stationId/byStation`, `CubeObsHint`, `CubeIo.obs(…, hint?)`, `fetchCubeObs(…, hint?)` → `cubeObsOf` (rein), `obsHintOf(bundle)`; progressiver Abruf mit Hinweis; Auswahl der Innovation (jüngste; bei gleicher Zeit gezielt vor nah); Notiz mit Kennung/Name/Abstand, ohne Innovation mit Zahl und Abstand der Messungen |
| `scripts/verify-pv-cube.mjs` | Block (30): `nearestSubset` (mit Negativkontrolle `slice`), `brightSkyPointsOf` (eigene/geborgte Felder, Kennung, Messzeit), `nearestStationList` (Dedupe gegen den alten Weg), `cubeObsOf`, `obsHintOf`, Motor (gezielte Station trägt I, Notizen) |
| `audit/fusion-ausbau/ax1-obs-check.{mjs,md}` | die Messung vorher/nachher |

Nicht geändert: der Live-Pfad (`pointForecast.ts:341` ruft ohne Optionen), die Karte (`loadFusedForecast.ts`), der Motor
außer der Auswahl unter mehreren Messungen gleicher Zeit und den Notizen.

### 1.4 Gemessen (30.09., 10:10 UTC, `ax1-obs-check.md`)

- **4 von 8 Stadtpunkten** haben jetzt eine Messung ≤ 5 km / 50 m (München 3,8 km per Kennung 10865, Frankfurt 2,0 km,
  Wien 1,3 + 4,4 km, Zürich 2,4 km); vorher 0 von 8. In allen acht sind die sechs Stationen jetzt die nächsten.
- Die vier übrigen sind an der Quelle geprüft strukturell: Hamburg P0489 und Stuttgart Q358 sind MOSMIX-Interpolationspunkte
  ohne Messung; Berlin 10389 und Dresden 10487 führt BrightSky nur historisch (`No sources match`). Die nächste messende Station
  liegt dort 5,5–9,3 km entfernt — außerhalb der Tabelle. Das ist V-FS-1 (σ des Stationsmembers je Abstand, ≥ 30 Ausgabetage),
  nicht dieser Abruf.
- Kosten: SMN 611 → 141–206 ms, TAWES 1 161 → 459–519 ms, DE +1–2 parallele Abfragen (422–645 ms gegen 170–434 ms; der Abruf
  läuft neben dem Kern, nie auf dem kritischen Pfad).
- **Nicht gemessen:** die Wirkung auf den Fehler. H9 (Phase FS) hat sie am Archiv gemessen (0–6 h T +12,4 %, Wind +4,8 %,
  Böe +6,1 %); dieser AP bringt die Voraussetzung in den Browser. Eine Archivmessung dieses APs ist nicht möglich (das Archiv
  trägt die POI-Messung am Punkt schon). Browser-Prüfung: §1.6.

### 1.5 Gates

`verify:pv-cube` **344/344** (338 + 6, Block 30) · `verify:point-client` **167/167** · `verify:pv-fusion` **229/229**
(Live-Pfad byte-gleich) · `tsc -p tsconfig.app.json` 0 Fehler in dieser Linie (der Arbeitsbaum trägt die parallele
Dashboard-Phase; Build/Budget am Ende der Phase).

### 1.6 Browser (30.09., 12:30 UTC, Dev-Server :5199, Desktop, Ort München, `?startnow=0&pflog=1`, ohne `?pf=cube`)

Der Block „pflog · Zeiten und Herkunft" zeigt: `stationValue: MUENCHEN STADT steht am Punkt (5.0 km, Δh -10 m); Innovation aus
dwd_obs 10865 Muenchen-Stadt (3.8 km, gezielt abgefragt) 2026-09-30T10:00Z (T 0.50 K)` — vorher stand dort „keine (…) ⇒ Formen
ohne w·I" (V-FS-15). Dazu die Altersnotizen der Tabellen aus AX-2 (`learned: … 0 Tage alt (Grenze 120)`, `stationValue: … 2 Tage
alt (Grenze 45)`). Konsole ohne Fehler aus diesem Pfad.

### 1.7 Befunde und Entscheidungen

| ID | Befund / Verbesserung | Mehrwert | Skizze | Stand |
|---|---|---|---|---|
| V-AX-1 | Die drei Messungs-Abrufer lieferten nicht die nächsten Stationen (DE Sondenraster, AT `slice(0, 200)`, CH jede k-te) — auch der **Live-Pfad** (`pointForecast.ts:341`) und die Karte rufen so | Stunde 0 des Live-Pfads könnte dieselbe Korrektur bekommen | `fetchNearestStationObs(…, { near: true })` im Live-Pfad — ändert das Live-Produkt ⇒ Jans Gate (E-AX-1) | offen |
| V-AX-2 | DE-Messungen tragen jetzt die Messzeit (P04 des Dashboards, V-DB-2 für DE beantwortet); TAWES/SMN noch nicht | Anker und Innovation altern richtig | TAWES: Zeitstempel der Features; SMN: `reference_timestamp` der Zeile — je ein Feld im Punkt | offen, klein |
| V-AX-3 | Vier von acht Stadtpunkten haben keine messende Station ≤ 5 km / 50 m (Interpolationspunkte, historische Stationen) | — | V-FS-1: σ des Stationsmembers je Abstand/Δh aus dem Archiv (≥ 30 Ausgabetage) | Kalender |

| ID | Entscheidung für Jan | Empfehlung |
|---|---|---|
| E-AX-1 | `near` auch im Live-Pfad (`?pf=live`, Stunde 0 aus den wirklich nächsten Stationen)? Ändert das Live-Produkt | ja, als eigener Commit nach dem Muster von Commit B |

## 2 AX-2 — Route der Lernstufe je Stufe (E-FV-3) und Alter der Tabellen (V-EX-6, Bericht #12)

### 2.1 Diagnose

- **Route:** der Client setzte `route: 1` für jeden Schritt (`cubeSource.ts`, `PredictSituation`). Die Client-Tabelle
  (`fusion.client.json`, Fit 5e) trägt 42 Strata der Route 1 (Bins 0–5), 21 der Route 3 (Bins 3–5) und 7 der Route 2 (Bin 0).
  Route 1 = Lauf-Route des Hindcasts (Open-Meteo `data_run`, ab 17.06.2026: für 51–336 h nur 87–95 Sommertage); Route 3 = dyn
  (AIFS + IFS-ENS-Kontrolllauf, 289 Tage ganzjährig, ¾ der Langfrist-Zeilen jeder Karte — V-FV-1). E-FV-3 empfahl Route 3 für
  t2/t3, ungemessen auf dem echten Cube.
- **Alter:** kein Leser sah `period`/`builtAt` an (V-EX-6); `period.to` der Client-Tabelle lautet `2026-09-31` (kein Datum,
  Date.parse liest es tolerant als 1.10.).

### 2.2 Umsetzung

| Datei | Änderung |
|---|---|
| `src/pointForecast/cubeSource.ts` | `FuseCubeOptions.learnedRoute: 1 \| 3 \| 'tier'` (Voreinstellung 1, byte-gleich); `'tier'` = t1 Route 1, t2/t3 Route 3 **wo der Bin ein geschriebenes Route-3-Stratum hat**, sonst Route 1 (ein t2-Schritt mit Vorlauf ≤ 48 h bliebe sonst ohne Lernstufe — Loch in der Kurve); calib `learnedRoute:tier`, die `learned:`-Notiz zählt die Route je Stufe; die Leser bekommen die Uhr des Motors (`nowMs`) |
| `src/point/client/tableAge.ts` **neu** | `tableAgeOf(label, {builtAt, period}, nowMs, staleAfterDays)` (rein): Alter in vollen Tagen seit `period.to` (sonst `builtAt`), Notiz, `stale`; Grenzen `LEARNED_STALE_DAYS` 120 (Winter-Nachfit ab Dezember, E-FL-3), `STACK_STALE_DAYS` 45 (Neufit je ≥ 30 Ausgabetage, E-FS-3) |
| `src/point/client/learnedPoint.ts`, `stackPoint.ts` | Notiz je Tabelle (`learned: Tabelle Fit-Zeitraum bis 01.10.2026, gebaut 26.09.2026, 0 Tage alt (Grenze 120)`; veraltet: `… VERALTET — …, Nachfit fällig, die Tabelle wirkt weiter (V-EX-6)`), Feld `age`; die Tabelle wirkt immer weiter (nie stumm, nie blockierend) |
| `src/pointForecast/fusion/output.ts` | `learnedRoute` in `CALIB_KEYS_OF` (T, Td, RH, Wind, Böe, Niederschlag, Bewölkung) |
| `scripts/fusionfit/stack-extract.mjs` | Variante `P4` = Stufe fs mit `learnedRoute: 'tier'`; `--slotsTo` (das Archiv schreibt seit 29.09. Schema 3 — V-AX-4) |
| `scripts/fusionfit/stack-score.mjs` | Kandidat `product-FS-r3`, Tabellen „AX-2" (Modus S und L, Bins 51–336 h) mit Regel und Verdikt |
| `scripts/verify-pv-cube.mjs` | Block (31): Route (byte-gleich ohne Option; `tier` verschiebt t2/t3-Schritte der Bins 3–5 um genau den Route-3-Unterschied, t1 und kurze t2-Schritte unverändert; `3` in jeder Stufe), `tableAgeOf`, Leser mit eingespeister Uhr, Notizen im Produkt |

### 2.3 Messung (Archiv, 15 Slots 14.–28.09., 370 129 Zeilen, Modus S und L; `score\2026-09-30-ax2`, `fusion-ausbau/ax2-decision.md`)

Extraktion 12:22–12:40 UTC (63 071 Motorläufe, 17 min), Karte 12:45–13:16 UTC (7 713 Zellen, 38 438 DM-Tests, HLN-Form und
BH). `product-FS-r3` = die Stufe fs mit `learnedRoute: 'tier'` gegen `product-FS` (Route 1), Bins 51–336 h:

| Zelle | Modus S (Station) MAE / CRPS | Modus L (stationsloser Punkt) MAE / CRPS |
|---|---|---|
| T 51–120 h | −1,4 % / −1,8 % (n.s.) | **−12,0 %! / −10,9 %!** |
| T 126–240 h | −2,7 % / −3,0 % (n.s.) | −5,9 % / −4,4 % (n.s.) |
| Td 51–120 h | +1,5 % / +0,8 % (n.s.) | **−8,7 %! / −8,0 %!** |
| Td 126–240 h | −0,1 % / −0,1 % | −6,8 %! / −6,0 % |
| Wind 51–120 h | −0,5 % / −0,2 % (AT −1,0 %!, CH −2,0 %!) | −6,3 % / −4,5 % (n.s.) |
| Wind 126–240 h | −2,4 % / −2,7 % (AT −3,9 %!) | **−14,8 %! / −17,1 %!** |
| Böe 51–120 h | +0,2 % / −0,0 % | **−2,5 %! / −2,8 %!** |
| Böe 126–240 h | −0,6 % / −1,1 % (AT −1,5 %!) | −7,9 % / −12,0 % (n.s.) |
| Bewölkung, Niederschlag | ≈ 0 (Niederschlag 246–336 h CRPS −32 %!, 4 Tage) | ≈ 0 |

**Verdikt AX-2: SCHLECHTER** (Regel §2.2 des Scorers). An der Station deckt der Stationswert den Unterschied zu; am
stationslosen Punkt — dort trägt die Lernstufe allein — verlieren die Route-3-Strata bei T, Td, Wind und Böe in 51–240 h
deutlich. Lesart: Route 3 ist auf dyn-Eingaben gefittet (AIFS + IFS-ENS-Kontrolllauf), der echte Cube trägt in t2/t3 die
Modelle der Lauf-Route (ICON-EU, ICON, AICON, IFS, AIFS) — die Modellmischung wiegt schwerer als die längere Datenbasis. Das
widerlegt E-FV-3 für den September; die Winterfrage (Route 1 hat für 51–336 h nur Sommer) bleibt und wird erst im Dezember
messbar. **Folge:** `learnedRoute` bleibt gebaut, Voreinstellung 1, nicht in der Stufe (E-AX-2).

**Zur Kenntnis (dieselbe Karte, 15 statt 13 Slots, korrigierte Teststatistik aus Phase EX):** H10 fällt von GILT auf
GLEICHSTAND (6 statt 10 Zellen signifikant, keine schlechter; T +13/+7/+5 %*, Td +19/+13 %*, Wind 0–6 h +5 %*), H9 auf
GILT NICHT (2 von 3), E2 auf GLEICHSTAND (7 besser, 0 schlechter). Die Skills sind unverändert positiv — die Sterne sind
seltener, wie in EX §4.2 vorhergesagt. V-FS-5 bestätigt: CH Wind 7–120 h −2,0…−4,7 %!, Böe −4,4…−8,7 %! (AX-5).

| ID | Entscheidung für Jan | Empfehlung |
|---|---|---|
| E-AX-2 | `learnedRoute: 'tier'` (Route 3 in t2/t3) — gebaut, gemessen, **nicht** in der Stufe | bei Route 1 bleiben; im Dezember mit Winterzeilen neu messen (zusammen mit E-FL-3) |

### 2.4 Befunde

| ID | Befund / Verbesserung | Mehrwert | Skizze | Stand |
|---|---|---|---|---|
| V-AX-4 | Das Punktarchiv schreibt seit dem 29.09. **Schema 3** (PA4); `archiveAdapter.mjs` liest 1/2 und wirft bei 3 | jede künftige Archiv-Messung (Neufit des Stationswerts, V-FS-1, AX-5) braucht den Leser | `readArchiveSlot`/`archiveLive` um Schema 3 erweitern (`live.fusion` spaltenweise, `live.asOf`, `elevationM`) — Zuständigkeit: dieses Repo (`scripts/fusionfit/lib/`), vor AX-5 | offen |
| V-AX-5 | `period.to` der Client-Tabelle ist `2026-09-31` (kein Datum) | — | der Fit schreibt das Monatsende richtig (`fit.mjs`), die Leser lesen tolerant | offen, kosmetisch |

## 3 AX-3 — Interpolation zwischen den nativen Schritten: Temperatur als Anomalie gegen den Tagesgang (Bericht #16)

### 3.1 Diagnose

Der Cube-Pfad füllt Stunden ohne nativen Schritt linear aus den Quantilen der Nachbarschritte (AP7): t2 alle 3 h, t3 alle 6 h.
An einem Punkt ohne Station sind das **232 von 337 Stunden** (Verifier Block 7); mit Station nur die Stunden jenseits 240 h und
die Lücken. Lineare Interpolation kappt Tagesmaximum und -minimum. Kein Scorer hat das je bewertet: die Scorecards bewerten
nur native Schritte. Bericht #15 (Rampe an den Nähten) ist ohne Daten nicht umsetzbar: t1 endet bei 48 h, t2 beginnt bei 51 h,
t3 bei 126 h — die Stufen überlappen im Vorlauf nicht, ein Versatz an der Naht ist zu keiner gemeinsamen Zeit messbar (E-F-19
hält die t2-Schritte ≤ 48 h aus dem Cube). Das bleibt Producer-Arbeit (V-AX-6).

### 3.2 Messung — Orakel auf der Wahrheit (`scripts/fusionfit/interp-score.mjs`, `fusion-ausbau/ax3-interp.md`)

Der Zusatzterm der Anomalie-Interpolation, μ_c(t) − lerp(μ_c(t_a), μ_c(t_b)), hängt nur von der Vorlage ab, nicht von den
Vorhersagewerten — die Differenz der beiden Verfahren ist deshalb auf der Wahrheit selbst messbar: Stundenreihe der Station alle
3 h / 6 h abtasten, beide Verfahren zurückfüllen, Fehler an den gefüllten Stunden. μ_c = Leave-Station-out-Koeffizienten der
Fit-5e-Tabellen (dieselbe Form, die der Client aus dem Klimatologieprodukt schätzt). 389 Stationen, 129 Tage (01.09.2025 bis
21.09.2026, jeder dritte), 4,36 Mio. Zeilen; DM auf Tagesmitteln (HLN), * signifikant.

| Größe | Δ | MAE linear | MAE Anomalie | Skill | Maximum-Stunden (12–16 UTC) | Minimum-Stunden (3–6 UTC) | Tage besser / schlechter |
|---|---|---|---|---|---|---|---|
| T | 6 h | 1,122 K | 0,949 K | **+15,5 %*** | +25,9 % | +16,3 % | 113 / 16 |
| T | 3 h | 0,609 K | 0,584 K | **+4,1 %*** | +6,8 % | +9,1 % | — |
| Td | 6 h | 0,847 | 0,841 | +0,7 % (n.s.) | +0,9 % | +1,3 % | 75 / 54 |
| Td | 3 h | 0,579 | 0,579 | +0,1 % (n.s.) | | | |
| Böe | 6 h | 1,420 | 1,410 | +0,7 %* | +2,0 % | −0,6 % | |
| Böe | 3 h | 1,101 | 1,104 | −0,2 %! | | | |

Nach Ländern (T, 6 h): AT +18,3 %, CH +15,5 %, DE +14,3 %; nach Monaten: Juli +23,4 %, Dezember −0,4 % (n.s.), Januar +3,5 %
— der Gewinn folgt der Amplitude des Tagesgangs. **Verdikt:** Temperatur als Anomalie (beide Schrittweiten), Taupunkt und
Böe bleiben linear (kein Gewinn; Böe bei 3 h signifikant schlechter). Td wird an interpolierten Stunden auf T gekappt.

### 3.3 Umsetzung

| Datei | Änderung |
|---|---|
| `src/pointForecast/cubeSource.ts` | `FuseCubeOptions.anomalyInterp` (Voreinstellung aus, byte-gleich); μ_c(T) wird auch ohne Lernstufe geschätzt, wenn die Option es braucht (dieselbe Schätzung wie für die μ_c-Spalte); an interpolierten Stunden T-Quantile + Zusatzterm, Td auf T gekappt; calib `interpolation:anomaly` (oder `interpolation:set` mit Grund, wenn kein μ_c am Punkt), Notiz mit Stundenzahl, mittlerer und maximaler |Korrektur|; **Stufe `fs` schaltet die Option ein, sobald das Klimatologieprodukt geladen ist (E-AX-3)** |
| `scripts/fusionfit/interp-score.mjs` **neu** | das Orakel (Zeilen, Karte `.json`/`.md`, Schichten Monat/Stunde/Land, DM, Tage besser) |
| `scripts/verify-pv-cube.mjs` | Block (32): ohne Option und ohne Produkt byte-gleich (benannt); mit Produkt an jeder der 229 geprüften Stunden exakt linear + Zusatzterm in allen vier Quantilen, native Schritte und übrige Größen byte-gleich; Positivkontrolle der Kappung (30-K-Vorlage); ohne `hourly` wirkungslos; Produktpfad über `climaSource` + `fuse.anomalyInterp` |

Der Codec ist unberührt (kein neues Flag, keine neuen Felder: der Schritt bleibt `interpolated`, die Herkunft steht in `calib`).

### 3.4 Gates

`verify:pv-cube` **355/355** (Blöcke 30–32) · typecheck 0 · Browser: s. §1.6 (die Stufe zeigt die neue calib-Zeile).

### 3.5 Befunde und Entscheidungen

| ID | Befund / Verbesserung | Mehrwert | Skizze | Stand |
|---|---|---|---|---|
| V-AX-6 | Rampe an den Stufennähten (Bericht #15) ist ohne überlappende Vorläufe nicht messbar und nicht baubar | — | Producer: t2 ab 45 h, t3 ab 117 h behalten (je 2 Schritte, ≈ +8 % t2-/t3-Bytes), dann Versatz messen und Rampe mit Backtest | offen, Producer (Jans Gate) |
| V-AX-7 | Die Scorecards bewerten nur native Schritte; die Fehler an interpolierten Stunden (232 von 337 am Punkt ohne Station) sind unsichtbar | die Produktgüte wird an der stündlichen Achse sichtbar | `verify:pv-score --archive` und `score-archive.mjs` mit stündlicher Wahrheit an interpolierten Stunden (AP9) | offen |
| V-AX-8 | Der Punkt-Cron klont `buscosun-web/main` — jede Producer-Änderung (AX-7 Schema 6, AX-8 MOSMIX-S, POINT_Z0MOD) wirkt dort erst nach dem Push dieses Repos; bis dahin sind die neuen Jobs benannte Leerläufe | keine stillen Doppelbauten, kein Cron-Bruch vor dem Push | Leerlauf-Schutz in der Vorlage (`grep -q mosmix_s`), Push = Jans Gate | gebaut (Schutz), Push offen |
| V-AX-9 | `SnormM9120` (MeteoSwiss) ist die RELATIVE Sonnenscheindauer in %, nicht Stunden — die Doku nennt nur „Sonnenscheindauer" | ohne Umrechnung stünden 66 h statt 320 h im Juli im Produkt | Umrechnung über die astronomische Tageslänge (ohne Horizont), in `static.json` benannt; Stichprobe Zürich 61/251 h | behoben (AX-9) |
| V-AX-10 | Beide Klimatologie-Prioren (Stationsfeld 1995–2024, Gitter 1991–2020) sind an 2023–2026 ≈ 1,2 K zu kalt — die Referenzperioden liegen hinter der Erwärmung; die Schrumpfung bei langen Vorläufen und der Klimatologie-Schwanz ziehen deshalb zu kalt | −17 % (Stationsfeld) bzw. −22 % (Gitter) Prior-MAE mit einem Trendversatz | `FuseCubeOptions.climaTrend` (0,45 K/Dekade ab Periodenmitte, set); Fit des Trends aus der Wahrheit wäre der nächste Schritt (AP10) | gebaut, aus (E-AX-9) |
| V-AX-11 | Das Klimagitter trägt nur die Länder DE/AT/CH/LI (53 % der Cube-Zellen); Nachbarländer (FR, IT, PL, CZ, DK, NL, BE, LU) bleiben beim Stationsfeld | benannt statt still: Provenienz `grid` dort, `clima-grid` hier | E-OBS/ERA5-Land-Normale für den Rand wären ein zweites Produkt | offen |
| V-AX-12 | Der erste Leerlauf-Schutz des `stations-s`-Jobs suchte `mosmix_s` — ein TEILSTRING von `mosmix_stationskatalog` im alten Bauer auf `main`: der Lauf 14:03 UTC (30.09.) baute MOSMIX-L neu (byte-gleiche Bündel, nur `ageH`/`updatedAt`/Index geändert — harmlos, aber 76 MiB je Stunde) | ein Schutz, der wirklich schützt, und eine Gegenprobe im Verifier | Marker `POINT_STATIONS_SOURCE` mit `grep -qF` (vor AX-8 nirgends), Daten-Repo `d058317c` 14:35 UTC; Verifier prüft Marker + Teilstring-Fall; **Runner-Beleg:** Lauf 14:58 UTC (Slot 14:50) — Bau-Schritt endet als Leerlauf, Publish `skipped`, keine Änderung im Daten-Repo | behoben, am Runner belegt |

| ID | Entscheidung für Jan | Empfehlung |
|---|---|---|
| E-AX-3 | `anomalyInterp` in der Stufe `fs` (eine Zeile in `forecastFromBundle`) | ja — Orakel eindeutig, nur T, nur interpolierte Stunden, ohne Produkt unverändert |

## 4 AX-4 — Bewölkung als Zwei-Atome-Mischung (V-FV-10, V-FX-15; nicht im Bericht)

### 4.1 Diagnose

Die gelernte Bewölkung ist eine zensierte Normal auf [0, 100]: ihre Masse an den Rändern ist, was die Flanken erreichen.
Die Wahrheit liegt zu 57 % genau bei 0 oder 100 % (0 bzw. 8 Achtel) — im Hindcast PIT-Rand 0,26–0,30 in jedem Bin (Soll
0,20, H4 verletzt, V-FV-10). Basisraten in den Fällen (DE, 13 Monate): klar 25 %, bedeckt 32 % (Lauf-Route), dyn-Route
17 % / 49 %.

### 4.2 Plan

Eine Familie `cloudMix` = pClear·δ(0) + pOvercast·δ(100) + (1 − pClear − pOvercast)·TN(μ, σ; 0, 100). Die Atome werden je
Stratum als Logistik gelernt (`fitAtoms.ts`, Design `AT_NAMES`: Cube-Bedeckung c, c², ln σ_div, Tages- und Stundenharmonik,
svf, Bin-Anteil), auf demselben Reservoir/Newton-Weg wie die Niederschlagshürde, mit exakten Falten-β; Referenz je Zeile =
die Atommasse der zensierten Normal mit den Out-of-fold-μ/σ der Tabellen; kein Out-of-fold-Gewinn ⇒ `no-skill`. μ/σ der
Mitte bleiben die gelernten. Die Tabellen bekommen den optionalen Abschnitt `atoms` (fusionFit@3 bleibt lesbar; die
veröffentlichte Tabelle trägt keinen ⇒ byte-gleich), der Codec die Familie (Version 3, liest 1–3).

### 4.3 Umsetzung (30.09.)

| Datei | Änderung |
|---|---|
| `src/pointForecast/fusion/dist.ts` | Familie `cloudMix` (cdf, Quantil, Mittel, PIT mittig in den Atomen, Aufweitung der Mitte), Hilfen `cloudMixParts/MiddleMean/MiddleVar`; 6 neue Modulprüfungen (`verifyDist` 54/54) |
| `src/pointForecast/fusion/v2codec.ts` | `cloudMix` am Ende von `DIST_KINDS` (vier Spalten mu/sigma/pClear/pOvercast), **Version 3, liest 1, 2, 3** |
| `src/point/fusionFit/design.ts` | `AT_NAMES`, `atomsDesign` |
| `src/point/fusionFit/fitAtoms.ts` **neu** | `AtomsEntry`, `fitAtomsRows` (Reservoir, gedämpfter Newton, Falten-β, oof Brier gegen die zensierte Atommasse), `atomMasses` (Summe ≤ 0,98) |
| `src/point/fusionFit/tables.ts` | optionaler Abschnitt `atoms` mit Prüfung (Schlüssel, β-Länge) |
| `src/point/fusionFit/predict.ts` | `cloudsDist`: Mischung, wo BEIDE Atome eines Stratums geschrieben sind (Form K), sonst zensiert; `PredictOptions.cloudAtoms: false` für die A/B-Messung |
| `scripts/fusionfit/lib/stats.mjs` | `sdOf`, `pitRandomOf` für `cloudMix` |
| `scripts/fusionfit/atoms.mjs` **neu** | Fit (Durchgang 1) und Out-of-fold-Karte (Durchgang 2) auf den Hindcast-Fällen |
| `scripts/verify-pv-cube.mjs` | Block (33): Modul, Tabellenprüfung, Motor (`learnedClouds` reicht die Mischung durch; ohne Abschnitt, eine Seite, no-skill ⇒ zensiert; ohne `learnedClouds` keine Mischung), Vorhersager-Schalter, Produktpfad + Codec Version 3 (exakter Rundweg); Codec-Fremdversion im Verifier jetzt 4 |

Kein neues Flag, kein neues Feld im Schritt — nur die Familie. Der Motor kombiniert die Bewölkung nicht mit der Mischung
(sie erreicht den Schritt nur über `learnedClouds`, wie die zensierte Lernstufe heute).

### 4.4 Messung — Fit (30.09., 12:56–13:05 UTC, `fit\2026-09-30-ax4\fusion.ax4.json`, Reservoir ≤ 250 000 je Stratum, Stride 4)

| Stratum | Anteil klar / bedeckt | oof Brier klar: Atom gegen zensiert | oof Brier bedeckt: Atom gegen zensiert | Status |
|---|---|---|---|---|
| 0–6 h r1 | 25,0 / 31,5 % | 0,100 gegen 0,137 (**+27 %**) | 0,151 gegen 0,176 (+15 %) | geschrieben |
| 7–24 h r1 | 25,2 / 31,5 % | 0,113 gegen 0,143 (**+21 %**) | 0,160 gegen 0,180 (+12 %) | geschrieben |
| 25–48 h r1 | 25,2 / 31,7 % | 0,134 gegen 0,152 (+12 %) | 0,176 gegen 0,189 (+7 %) | geschrieben |
| 51–120 h r1 / r3 | 25,3 / 31,5 % · 17,4 / 48,9 % | +1 % · +16 % | +3 % · +18 % | geschrieben |
| 126–240 h r1 / r3 | — · 16,8 / 49,2 % | **−25 %** (r1) · +6 % (r3) | −5 % · +13 % | r1 **no-skill**, r3 geschrieben |
| 246–336 h r1 / r3 | — · 17,4 / 48,9 % | **−38 %** (r1) · +3 % (r3) | −7 % · +11 % | r1 **no-skill**, r3 geschrieben |
| Tag 0 r2 | 16,6 / 49,4 % | +31 % | +28 % | geschrieben |

Die Sommer-Strata der Lauf-Route bei 126–336 h (7 Zeitfalten, 87–95 Tage) verlieren out of fold — dieselbe Lücke wie in
V-FV-1 — und fallen als `no-skill` heraus; dort bleibt die zensierte Normal.

### 4.5 Messung — Karte (30.09., 13:09 UTC; `score\2026-09-30-ax4\atoms.{json,md}`, `fusion-ausbau/ax4-atoms.md`)

Out of fold (Falten-β der Mittel-, Hürden- und Atom-Tabellen ohne die Halbmonatsgruppe der Zeile), 2 422 547 Zeilen an 386
Tagen (Score-Stride 8, Hash), DE-Stationen mit Bewölkungswahrheit. `zens.` = die zensierte Normal der Lernstufe (fl-K heute),
`mix` = dieselben μ/σ mit den gelernten Atomen (2 273 052 Zeilen tragen die Mischung, der Rest — Sommer-Strata 126–336 h der
Lauf-Route — bleibt zensiert).

| Schicht | n | CRPS zens. → mix | Skill | MAE zens. → mix | PIT-Rand zens. → mix (Soll 0,20) | Brier klar / bedeckt zens. → mix |
|---|---|---|---|---|---|---|
| **alle** | 2 422 547 | 17,15 → 16,17 | **+5,7 %*** | 25,9 → 23,6 | 0,280 → **0,195** | 0,141 → 0,124 / 0,225 → 0,198 |
| 0–6 h | 221 592 | 12,38 → 11,06 | **+10,7 %*** | 17,7 → 15,5 | 0,295 → 0,186 | 0,118 → 0,084 / 0,209 → 0,163 |
| 7–24 h | 331 956 | 14,94 → 13,96 | +6,6 %* | 21,9 → 19,9 | 0,275 → 0,192 | 0,142 → 0,112 / 0,181 → 0,160 |
| 25–48 h | 438 017 | 16,84 → 16,40 | +2,7 %* | 24,9 → 23,5 | 0,279 → 0,198 | 0,152 → 0,134 / 0,189 → 0,176 |
| 51–120 h | 783 323 | 17,06 → 15,92 | +6,7 %* | 25,7 → 23,2 | 0,285 → 0,189 | 0,135 → 0,121 / 0,242 → 0,206 |
| 126–240 h | 361 713 | 19,71 → 18,66 | +5,3 %* | 30,6 → 28,0 | 0,278 → 0,204 | 0,145 → 0,138 / 0,257 → 0,230 |
| 246–336 h | 285 946 | 20,93 → 19,91 | +4,9 %* | 33,3 → 30,1 | 0,268 → 0,203 | 0,151 → 0,148 / 0,261 → 0,237 |
| Route 1 (Lauf, Client) / 3 (dyn) | 1,24 M / 1,07 M | +2,6 %* / +8,6 %* | | | 0,268 → 0,199 / 0,293 → 0,191 | |
| Monate | | Okt +17,0 %*, Feb +20,7 %*, Nov +13,5 %*, Jan +13,7 %*, Dez +10,5 %*, Mär +3,6 % (n.s.), Jun +1,9 % (n.s.), **Sep 2026 −2,2 % (n.s.)** | | | | |

**Zuverlässigkeit der Atome (Schicht alle):** die zensierte Normal sagt bei 30–40 % Klar-Wahrscheinlichkeit 61 % beobachtet,
bei 40–50 % 78 % — systematisch zu wenig Atommasse; die Mischung liegt in jeder Klasse auf der Diagonale (35 → 32 %,
45 → 44 %, 65 → 65 %, 83 → 83 %). Bedeckt ebenso (zens. 35 → 54 %; mix 35 → 38 %, 74 → 72 %).

**Verdikt:** die Mischung ist in jedem Bin signifikant besser (CRPS +2,7…+10,7 %, MAE −5…−13 %), der PIT-Rand fällt von
0,27–0,30 auf 0,19–0,20 (H4 der Phase FV wäre für die Bewölkung erfüllt), die Atome sind kalibriert. Einziger Ausreißer ist der
September 2026 (−2,2 %, n.s., 35 Tage — Randmonat mit Halbmonatsfalte). Die Schätzung „+5…+10 %" vom 30.09. trifft.

### 4.6 Gates und Paket

`verify:pv-cube` Block 33 (5 Prüfungen) · `verifyDist` 54/54 · typecheck 0. **Paket für E-AX-5:** `fit\2026-09-30-ax4\fusion.ax4.client.json`
— die Client-Fassung (`lib/clientTables.mjs`, jetzt mit `atoms`) der Tabelle: 16 geschriebene Atome, 30,3 KB gz (veröffentlicht
29,0); mean, variance, occurrence, amount und speed sind byte-gleich zur veröffentlichten `fusion.client.json` (Fit 5e) — nur
der Abschnitt `atoms` kommt hinzu, `validateTables` besteht.

### 4.7 Entscheidungen

| ID | Entscheidung für Jan | Empfehlung |
|---|---|---|
| E-AX-4 | Codec Version 3 (Familie `cloudMix`) — der Codec ist mit AP9 geteilt; der Sammler schreibt ab dem Deploy Version 3, die Leser lesen 1–3 | bestätigen; ohne die Familie bleibt die Mischung eine Hindcast-Zahl |
| E-AX-5 | die Tabelle mit `atoms` (`fusion.ax4.json` → `fusion.client.json`) ins Daten-Repo — erst nach der Karte §4.5 und nur zusammen mit E-AX-4 | nach der Karte |

## 5 AX-5 — Stationswert: Parameter je Land (V-FS-5; nicht im Bericht)

### 5.1 Diagnose

Der Stationswert ist über DACH gepoolt; in der Schweiz ist er bei Wind und Böe ab 7 h 2–10 % schlechter als MOSMIX (V-FS-5:
Wind −2,0…−4,6 %!, Böe −4,3…−9,3 %!), in AT +4…+15 %*, in DE gleichauf. Die Archivzeilen tragen das Land (`row.cc`, LI = CH).

### 5.2 Vorab eingefrorene Behauptung (30.09., vor dem Lauf; Regel im Code von `stack-score.mjs`)

**H15:** Der Kandidat `stack-cc` (Parameter b, w, c und σ je Land, wo der Landesfit ≥ 200 Zeilen nach der Sperre hat, sonst
die gepoolten) ist in Modus S bei Wind und Böe 7–120 h in der Schweiz in ≥ 2 Zellen (MAE oder CRPS) signifikant besser als
`stack` und nirgends signifikant schlechter, und in DE und AT nirgends signifikant schlechter ⇒ **GILT**. Keine Zelle
signifikant schlechter um mehr als 2 % ⇒ GLEICHSTAND. Sonst GILT NICHT. Leave-Day-out mit Sperre ±1 Gültigtag wie in FS;
DM auf Tagesmitteln (HLN), BH über die Karte; 15 Slots (14.–28.09.), indikativ.

### 5.3 Umsetzung

| Datei | Änderung |
|---|---|
| `src/pointForecast/fusion/stationValue.ts` | Einträge mit viertem Teil Land (`ws\|3\|S\|CH`), `STACK_COUNTRIES`, `stackCountryOf` (LI = CH); `stationValueOf` nimmt den Landeseintrag, wo geschrieben, sonst den gepoolten — nie gemischt; `StationValue.country`; Prüfung der Schlüssel; 2 neue Modulprüfungen (10/10) |
| `src/pointForecast/cubeSource.ts` | `CubeFusionInput.country` (aus `opts.country`), Notiz zählt Landeseinträge |
| `scripts/fusionfit/lib/archiveAdapter.mjs` | `country` im Motor-Eingang des Archivs |
| `scripts/fusionfit/stack-score.mjs` | Summen je Land, Kandidat `stack-cc`, Tabellen „AX-5", Verdikt nach §5.2, Landeseinträge in der Tabelle |

### 5.4 Messung (30.09., 13:20–14:05 UTC; `score\2026-09-30-ax5`, `fusion-ausbau/ax5-decision.md`; dieselben 370 129 Zeilen wie AX-2)

`stack-cc` gegen `stack` (beide Leave-Day-out mit Sperre ±1 Gültigtag), Modus S; 2 771 040 Kandidatenzeilen mit Landesparametern,
165 mit gepoolten (Rückfall unter 200 Zeilen):

| Zelle | MAE alle | CRPS alle | MAE DE | MAE AT | MAE CH |
|---|---|---|---|---|---|
| T 0–6 h | +1,6 %* | +1,5 %* | +0,6 % | +2,6 % | +2,7 % |
| Wind 0–6 h | +2,9 %* | +3,3 %* | +2,0 %* | +5,6 % | +2,2 % |
| Wind 7–24 h | +1,9 % | +2,2 %* | +0,6 % | +5,4 % | **+1,3 %*** |
| Wind 25–48 h | +2,2 %* | +2,4 %* | +0,7 % | +5,6 %* | **+2,0 %*** |
| Wind 51–120 h | +1,7 %* | +1,8 %* | −0,2 % | +4,7 %* | **+3,7 %*** |
| Böe 0–6 h | +2,0 %* | +2,0 %* | +2,5 %* | +0,2 % | **+3,2 %*** |
| Böe 7–24 h | +2,5 %* | +2,6 %* | +1,6 %* | +3,6 %* | **+3,2 %*** |
| Böe 25–48 h | +2,5 %* | +2,4 %* | +1,5 %* | +3,1 % | **+3,9 %*** |
| Böe 51–120 h | +2,0 %* | +1,6 %* | −0,1 % | +2,1 % | **+7,0 %*** |
| Td (alle Bins) | −1,0…−0,1 % (n.s.) | 0,0…+1,7 % (n.s.) | | | CH −1,7…−3,5 % (n.s.) |

Wind/Böe 7–120 h je Land: **CH 12 Zellen signifikant besser, 0 schlechter; DE + AT 9 besser, 0 schlechter** ⇒ **H15 GILT**.
Keine Zelle irgendeiner Größe signifikant schlechter. Gegen MOSMIX schließt sich die Lücke in der Schweiz (Kontexttabelle
„stack-cc gegen mosmix"): Wind CH 7–120 h von −2,0…−4,7 %! auf −0,6…−0,8 % (n.s.), Böe CH von −4,4…−8,7 %! auf −0,7…−1,1 %
(n.s.); AT bleibt +8,5…+22,8 %* (Wind) und +9,3…+26,2 %* (Böe).

**Tabelle:** `fit\2026-09-30-ax5\stack.archive.json` — 863 Einträge (220 gepoolt wie bisher + 643 mit Land: CH 215, AT 220,
DE 208), 28,7 KB gz (bisher 8,1 KB), Provenienz `archive`, 14 Ausgabetage 14.–28.09. Der Client nimmt den Landeseintrag, wo
einer geschrieben ist, sonst den gepoolten (AX-5, `stationValueOf`). Einbau ins Daten-Repo = E-AX-7 (ersetzt
`point/stack.client.json`; Purge wie in §24.1).

| ID | Entscheidung für Jan | Empfehlung |
|---|---|---|
| E-AX-7 | `stack.archive.json` mit Landeseinträgen als `point/stack.client.json` ins Daten-Repo | ja — H15 gilt, nirgends schlechter; 14 Ausgabetage, indikativ wie die ganze FS-Linie; Neufit ab ≥ 30 Tagen (E-FS-3) dann mit Land |
| E-AX-8 | MOSMIX-S (`stationSource: 'mosmix_s'` / `freshest`) als Voreinstellung des Stationsmembers | nein, bis gemessen — Stationswert und Lernstufe sind an MOSMIX-L gefittet; Messweg: der Sammler (AP9) liest die S-Reihe mit, nach ≥ 14 Ausgabetagen S gegen L + Anker (der Beleg, den `DECLINED.mosmix_s` verlangte) |
| E-AX-9 | Klimagitter + Trendversatz (`CubeIo.climaGrid`, `FuseCubeOptions.climaTrend`) in die Stufe `fs` | ja, nach der Produktmessung durch AP9 (Prior-MAE 1,63 → 1,22 K; Wirkung im Produkt nur über Schrumpfung und Schwanz); konservativ zuerst nur `climaTrend` (wirkt ohne Gitter, −17 %) |
| E-AX-10 | INCA-Analyse als Anker in AT (`CubeIo.incaAnchor`, Gewicht 0,6 set) in die Stufe | erst nach der Messung: der Sammler schreibt die INCA-Zeile mit, der Fit misst das Gewicht (leave-station-out ist mit der Analyse nicht möglich) |

## 6 AX-6 — Ensemble-Mittel als Zentralwert in t3 (E-EX-1, Bericht #3): die Messung

### 6.1 Diagnose

t3 (126–336 h) mittelt heute deterministische Einzelläufe gleichgewichtet (ICON, AICON, IFS HRES, AIFS; ab 180 h nur noch
zwei); das IFS-ENS liefert nur σ_ens und q10/q90. V-PD-9 hatte das Ensemble-Mittel als Zentralwert verworfen, weil es σ_div
schrumpfen ließe. Der Hindcast-Cache trägt die 51 IFS-ENS-Member (dynamical.org, 00z, 0,25°, 85 Vorläufe bis 360 h) für jeden
Tag seit 2024-04-01, den AIFS-Lauf der dyn-Route, und für das Lauf-Fenster (17.06.–21.09.2026) IFS HRES und AIFS. Die
Vorfrage von E-EX-1 — „schlägt das Ensemble-Mittel bei 126–336 h die Einzelläufe und ihr Mittel?" — ist damit ohne
Producer-Eingriff messbar; die Nachfrage „was bleibt nach der Lernstufe?" braucht einen Fit mit dem Mittel als Prädiktor.

### 6.2 Messung — roh am 0,25°-Punkt (`scripts/fusionfit/ens-mean-check.mjs`, `fusion-ausbau/ax6-ens.md`; 30.09., 13:19–13:22 UTC)

389 Stationspunkte, 129 Läufe (jeder dritte Tag 01.09.2025–21.09.2026, 32 davon im Lauf-Fenster), 1,74 Mio. T-Zeilen; jeder
Kandidat an der Zelle des t3-Blocks, T mit Standardgradient auf die Stationshöhe, MAE gegen die Stundenwahrheit; DM auf
Tagesmitteln (HLN), BH.

| Größe · Bin | Kontrolllauf | **ENS-Mittel** | ENS-Median | dyn: (Kontrolle + AIFS)/2 | Klimatologie μ_c | ENS-Mittel gegen Kontrolle / dyn-Mittel / Klima |
|---|---|---|---|---|---|---|
| T 126–240 h | 2,896 K | **2,500** | 2,510 | 2,473 | 3,245 | **+13,7 %*** / −1,1 % (n.s.) / +23,0 %* |
| T 246–336 h | 4,124 | **3,172** | 3,157 | 3,511 | 3,263 | **+23,1 %*** / **+9,7 %*** / +2,8 % (n.s.) |
| Wind 126–240 h | 1,724 m/s | **1,502** | | | | **+12,8 %*** |
| Wind 246–336 h | 1,889 | **1,592** | | | | **+15,7 %*** |
| Böe 126–240 h | 3,445 m/s | **3,104** | | | | **+9,9 %*** |
| Böe 246–336 h | 3,847 | **3,404** | | | | **+11,5 %*** |

Lauf-Fenster (32 Läufe, T): ENS-Mittel gegen (HRES + AIFS)/2 bei 126–240 h +1,3 % (n.s.), bei 246–336 h +16,5 % (n.s.);
gegen HRES allein +13,8 %* / +28,2 %*; gegen AIFS allein +4,9 % / +22,7 %*. Nach Ländern bei 246–336 h: DE ENS 3,06 gegen
Klima 3,28 (+7 %), AT 3,22 gegen 3,15 (−2 %), CH 3,36 gegen 3,32 (−1 %). Nach Monaten gewinnt das ENS-Mittel gegen den
Kontrolllauf in jedem Monat (126–240 h +4…+21 %, 246–336 h +10…+35 %).

### 6.3 Lesart

1. **Gegen jeden Einzellauf** ist das ENS-Mittel bei 126–336 h klar besser (T +14/+23 %, Wind +13/+16 %, Böe +10/+12 %) — die
   WeatherBench-Aussage des Berichts hält an den DACH-Stationen.
2. **Gegen das Mittel zweier Einzelläufe** (Kontrolle + AIFS, HRES + AIFS) ist es bei 126–240 h gleichauf (AIFS ist bei T
   stark) und erst bei 246–336 h besser (+10 %* über 13 Monate). Das heutige t3 mittelt vier Läufe — der Gewinn des
   ENS-Mittels bei T liegt deshalb realistisch bei 126–240 h nahe 0, bei 246–336 h bei +5…+10 % roh.
3. **Gegen die Klimatologie** liegt bei 246–336 h auch das ENS-Mittel nur gleichauf (+2,8 %, n.s.; DE +7 %, AT/CH −1…−2 %)
   — dieselbe Grenze, an der die Lernstufe heute steht (FV-H: T 246–336 h +1,3 % gegen Klima). Für T ist bei 246–336 h wenig zu
   holen; die Bänder (σ_ens) sind dort wichtiger als der Zentralwert.
4. **Wind und Böe** sind der eigentliche Gewinn: +13…+16 % gegen den Kontrolllauf, und das in dem Bereich, in dem die
   Lernstufe heute hinter der Klimatologie liegt (−6/−11,5 %). Ein ENS-Mittel für u/v und Böe als t3-Member dürfte das
   schließen — Schätzung im Produkt +5…+10 % nach der Lernstufe (Prädiktor im Fit), gemessen erst mit einem Fit.

**Nicht gemessen:** die Wirkung nach der Lernstufe (braucht das Mittel als Spalte in den Fällen und einen Nachfit) und im
Client (braucht das Mittel im Cube = Producer, V-PD-9). Beides ist der nächste Schritt, wenn E-AX-6 „ja" sagt.

| ID | Entscheidung für Jan | Empfehlung |
|---|---|---|
| E-AX-6 | Ensemble-Mittel (T, u, v, Böe) des IFS-ENS als t3-Member bzw. -Ebenen in den Cube (Producer: `ecmwfEns.mjs` liest heute σ_ens + q10/q90; kehrt V-PD-9 für t3 um), danach Fit mit dem Mittel als Prädiktor | ja für Wind und Böe (der belegte Gewinn), T mit; erst nach der Schema-Phase NS |

## 6a AX-7 — Ensemble-Mittel in den Cube: Schema 6 und das Member `ifs-ens-mean` (E-AX-6; Auftrag Jan 30.09.: Daten-Repo und Jobs freigegeben)

### 6a.1 Diagnose

Der IFS-ENS-Adapter (`ecmwfEns.mjs`) liest je Rasterstunde 50 Member für 2t/tp und 24 für 10u/10v, rechnet σ_ens und q10/q90
und trägt nichts zum Mittel bei (V-PD-9). Das Member-Mittel liegt in denselben Bytes — null Byte mehr. Der Cube hatte dafür
keine Ebene (Schema 5, 57 Ebenen); der Chunk-Leser lehnt fremde Schemata ohne Manifest ab, das Manifest prüft die
Schemanummer strikt. Nach einem Wechsel liegen bis zu 24 h Chunks des alten Schemas im Repo (Aufbewahrung je Stufe).

### 6a.2 Umsetzung

| Datei | Änderung |
|---|---|
| `src/point/cubeFormat.ts` | `CubeVar.ensMean` (t2m, u10, v10, precip), Ebene `<id>_ens` (`kind: 'ens'`, Skala und Versatz der Größe, am Ende der Größe), **`CUBE_SCHEMA` 5 → 6, 57 → 61 Ebenen**; `CUBE_PLANES_V5`/`CUBE_SCHEMA_V5` (die alte Liste), `CUBE_SCHEMAS_READABLE` [5, 6], `CUBE_ENS_MEAN_VARS`; Selbstprüfungen |
| `src/point/client/cubePoint.ts` | `planesForChunkHeader` liest Schema 5/57 mit der V5-Liste ohne Manifest (Übergang) |
| `src/point/manifest.ts` | Manifestprüfung nimmt 5 und 6 |
| `scripts/point/adapters/ensembleStats.mjs`, `ecmwfEns.mjs` | `memberMean` (Momentangrößen und Raten wie σ_ens); `ensemble()` liefert `mean` |
| `scripts/point/build-point-cube.mjs` | schreibt `<var>_ens` aus `r.mean` (Versatz Kelvin → °C wie die Quantile), Manifest `ensemble.mean { vars, steps, byHour, note }` |
| `src/pointForecast/cubeSource.ts` | `cubeSample.ensMean` (nur mit Ebenen), `FuseCubeOptions.ensMember` (Voreinstellung aus): an t3-Schritten mit Ebenen ein zweites Sample `ifs-ens-mean` (Höhe wie das Stufenmittel, σ = 1,5·σ_ens mit Boden — set, unkalibriert), calib `ensMember:set`, Notiz; `_ens` nicht in `CUBE_ANSWER_PLANES` (Erstantwort unverändert) |
| `scripts/lib/pvCubeFixtures.mjs`, `verify-point-data.mjs`, `verify-pv-cube.mjs`, `scripts/repack-repo/README.md` | Fixture mit `_ens` in t3; Zählanker 61/Schema 6, Import-Sonde; Block (35): Schema-6-Liste, Übergang mit einem ECHTEN Schema-5-Chunk aus dem Daten-Repo (`2026091515/t1/00_00.bin`: 57 Ebenen, T lesbar), Schema-Byte 5 mit 61 Ebenen und Schema 7 ⇒ null, `ensMember` mit/ohne Ebenen, byte-gleich ohne Option; README des Daten-Repos „61 Ebenen … 4 Member-Mittel" |

**Nicht geändert:** die `mean`-Ebene (V-PD-9 gilt für sie weiter), die Lernstufe (sie liest das Stufenmittel; der Fit mit dem
Member-Mittel als Prädiktor ist der nächste Schritt, E-AX-6), der Codec (Member sind Text-Tags).

### 6a.3 Lokaler Testlauf des Producers (30.09., 15:18 UTC)

`build-point-cube.mjs --tiers=t3 --only=ifs_hres,ifs_ens --steps=126-174` mit 10 ENS-Membern (statt 50/24, Zeit) gegen den
echten Lauf 2026-09-30 00z, Ablage `%TEMP%\ax7-build\point` (Log `build.log`, Prüfskript `check-ens.mjs`): Exit 0, 12 Chunks,
0,31 MiB, Netz 129,6 MiB (38 Dateien), ENS 45,9 MB in 15,6 s. Manifest `run.json`: `schema: 6`,
`tiers[0].ensemble.mean = { vars: [t2m, precip, u10, v10], steps: 1, missing: 8, cellsWritten: 8036, byHour: { 144: ifs_ens },
provenance: ensemble-members }` — genau die eine Rasterstunde 144 im Fenster (Raster 48 h), die anderen 8 Schritte tragen
kein Member-Mittel (V-PD-9 unverändert für die Mean-Ebene).

Chunks dekodiert (`decodeCubeChunk`, 61 Ebenen, `nt = 9`): `<var>_ens` ist in jedem Chunk an **genau `nx·ny` Zellen** gefüllt
(= ein Schritt), sonst MISSING. Abstand Member-Mittel gegen das HRES-Stufenmittel an derselben Zelle:

| Chunk | Zellen | T bias / MAD / max (K) | u10 MAD (m/s) | v10 MAD (m/s) | Niederschlag MAD (mm/h) |
|---|---|---|---|---|---|
| 00_00 | 256 | −0,08 / 0,52 / 1,99 | 0,23 | 0,23 | 0,007 |
| 01_01 | 256 | −0,60 / 1,01 / 3,13 | 0,48 | 0,37 | 0,007 |
| 02_02 | 144 | +0,18 / 0,30 / 1,38 | 0,38 | 0,61 | 0,030 |
| 00_03 | 16 | −1,66 / 1,66 / 2,74 | 0,31 | 0,33 | 0,058 |

Die Abstände sind die eines 10-Member-Mittels bei +144 h gegen den deterministischen Lauf (Größenordnung 0,3–1,7 K, keine
Vorzeichen- oder Skalenfehler; Niederschlag als Rate, nie negativ, Versatz Kelvin → °C stimmt — sonst stünden hier 273 K).
Mit 50 Membern im Cron wird der Abstand kleiner, nicht größer. **Gate AX-7 grün:** Ebenen entstehen aus echten Daten, der
Leser benennt sie, das Manifest zählt sie. Was nur der Cron zeigen kann (Laufzeit mit 50/24 Membern, 24 h Übergang mit
Schema-5-Chunks im Repo), steht in MANUELLE-SCHRITTE §28 — der Cron klont `buscosun-web/main`, das neue Schema läuft dort erst
nach dem Push von buscosun-web (Jans Gate; das Daten-Repo allein kann es nicht auslösen).

## 6b AX-8 — MOSMIX-S als zweites Stationsprodukt (Bericht #5, zweiter Teil; E-AX-8; Auftrag Jan 30.09.: Daten-Repo und Jobs freigegeben)

### 6b.1 Diagnose

`DECLINED.mosmix_s` (Adapter-Register) lehnte MOSMIX-S mit der Annahme ab, neben ICON-D2 und dem Stationsanker sei in 0–24 h
kein Gewinn belegt, und verlangte den Beleg aus dem Archiv. Das Archiv kann ihn nicht liefern, solange niemand S erzeugt —
ein Zirkel. Der Bauer `build-stations.mjs` kannte nur MOSMIX-L (URL, Verzeichnis, Manifest-Quelle fest), der Index nur eine
Laufliste, der Leser nur `index.stations.runs[0]`.

**Am echten File gemessen (30.09., `MOSMIX_S_LATEST_240.kmz` = Lauf 12z, `fusion-ausbau/`-Sonde `survey.mjs`):**

| Größe | MOSMIX-S | MOSMIX-L (Vergleich) |
|---|---|---|
| Läufe | **stündlich**; Datei erscheint Lauf + 39…41 min (Last-Modified 09z 09:39:52 · 10z 10:40:47 · 11z 11:39:37 · 12z 12:39:20) | 03/09/15/21z, Lauf + 72…77 min |
| Datei | 37,2 MB, 5 648 Stationen, davon **3 071 im Ausschnitt** | 76 MiB, 3 071 im Ausschnitt |
| Achse | 240 Schritte, 1…240 h stündlich | 247 Schritte |
| Cube-Größen | **alle zehn** (TTT Td DD FF FX1 N Nl Nm Nh RR1c), Füllung 99,8–100 % in 0–24 h | dieselben zehn |
| Stationssatz | identisch mit dem L-Katalog: 0 fehlende, 0 zusätzliche, **0 Abweichungen** in Lage/Höhe | — |
| Parsen | 7,5 s (Rest-Puffer 0,11 MiB) | ≈ 55 s |

Also: dieselbe Pipeline trägt beide Produkte ohne Sonderweg. Nicht dasselbe Verzeichnis, weil ein 09z-Lauf von S und einer
von L denselben Namen `2026093009` hätten.

### 6b.2 Umsetzung

| Datei | Änderung |
|---|---|
| `src/point/cubeFormat.ts` | `STATIONS_S_DIR = point/stations-s`, `StationSource`, `STATION_SOURCES`, `stationsDirOf()`, `stationBundlePath/stationManifestPath(…, source = 'mosmix_l')` (ohne Argument byte-gleich), Selbstprüfung |
| `scripts/point/build-stations.mjs` | `--source=mosmix_s` / `POINT_STATIONS_SOURCE`; URL-Tabelle je Quelle, Ausgabe nach `stations-s/`, Manifest `source`, S-Caveat mit der gemessenen Bereitstellung; **Katalog schreibt nur der L-Lauf** (S trägt dieselben Stationen — zwei Schreiber wären zwei Wahrheiten) |
| `scripts/point/publish-point.mjs`, `src/point/manifest.ts` | zweite Aufbewahrungsrunde `stations-s/` mit **eigener Grenze** `STATIONS_S_RETENTION` = 6 h (24 h hielten 24 Läufe à ≈ 7 MiB), Boden `MIN_RUNS`; Index `stationsS { dir, runs, source, retention, axis, note }` — `stations` unverändert |
| `scripts/point/cdnSync.mjs` | `stations-s/` in denselben Klassen (`stations-bundle`/`-manifest`), `CDN_BUDGET_S_BY_TIER['stations-s'] = 60`, `JOB_MEASURED_MAX_MIN['stations-s'] = 3,2` (geschätzt, s. u.) |
| `src/point/client/readPoint.ts`, `stationPoint.ts` | `ReadPointOptions.stationSource` `mosmix_l` (Voreinstellung, byte-gleich) · `mosmix_s` (ohne S-Lauf **benannt** zurück auf L: `skips`) · `freshest` (jüngerer Lauf nach `runAt`); `StationPointSeries.source` |
| `src/pointForecast/cubeSource.ts`, `pfFlags.ts` | `CubeIo.stationSource` → Leser; im Cache-Schlüssel (`\|st:mosmix_s`, V-FI-80); Provenienz `station.source`, Member `station.source`, Notiz „Stationsprodukt mosmix_s … Stationswert und Lernstufe sind an MOSMIX-L gefittet"; `?st=s` / `?st=fresh` (`pfStationSourceFrom`) in `defaultCubeIo` |
| `scripts/repack-repo/workflow-point.yml` | vierter Job **`stations-s`**: `50 0,1,2,3,5,6,7,8,9,11,12,13,14,15,17,18,19,20,21,23` (nicht in den t2-Stunden — dort wäre er der dritte Job im Fenster, Regel D; der **t2-Job baut S dort selbst** als zweiten Schritt, `continue-on-error`), `needs: [t3]` + `always()`, timeout 20, kein Cube-Bau, Publish nur nach Bau; `workflow_dispatch tiers=stations-s`. Regeln nachgerechnet: A :50 → :20 = 30 ≥ 6 + 20 · B hinter t1 40 − (20 − 10) = 30 ≥ 26 · C 16 ≤ 20 ≤ 30 · D 20 Slots, nie drei im Fenster. **Leerlauf-Schutz:** solange `buscosun-web/main` den Bauer ohne `--source` trägt, prüft der Job das per `grep` und beendet sich ohne Publish — der alte Bauer würde `--source` still ignorieren und stündlich MOSMIX-L neu bauen (76 MiB) |
| `scripts/repack-repo/README.md` | Baum, Abschnitt „MOSMIX-S daneben", Aufbewahrungszeile 6 h, Taktzeile mit der gemessenen Bereitstellung |
| `scripts/verify-point-data.mjs` | (F3b) vier Jobs, vier Timeouts, Kette bis `stations-s`, L nur in t2 / S in t2 und `stations-s`, Leerlauf-Schutz, Push-Stelle je Job, vier sparse-Blöcke, Regel F mit `stations-s`; (3n) 8 AX-8-Anker (Quellenschalter, URLs, Pfade, Katalog, Bereitstellung, Aufbewahrung, CDN-Klasse, README); (3z) Repo-Rechnung + 7 × 6,84 MiB |
| `scripts/verify-point-client.mjs` (10s), `scripts/verify-pv-cube.mjs` (19) | Leser: ohne Option/`mosmix_l` byte-gleich zum Bündel ohne `stationsS`; `mosmix_s` liest `stations-s/` in derselben Spalte; `freshest`; Gegenproben (älterer S-Lauf verliert, ohne S-Lauf benannter Rückfall); Cache-Schlüssel |

**Voreinstellung bleibt MOSMIX-L (Rule 2):** der Stationswert (Phase FS, `stack.archive.json`) und die Lernstufe sind an
MOSMIX-L-Werten gefittet; S als Voreinstellung wäre ein anderes Produkt ohne Messung. Die Messung, die die Ablehnung im
Register verlangte, wird jetzt möglich: der Sammler (AP9, `scripts/punktarchiv/**`) kann je Slot zusätzlich die S-Reihe lesen
(`readStationPoint` mit `stationSource: 'mosmix_s'`, eine Zeile) — E-AX-8.

### 6b.3 Lokaler Ende-zu-Ende-Lauf (30.09.)

Scratch-Klon des Daten-Repos (`point/` vom 15.09., 236 MB, `%TEMP%\ax8\repo`): `build-stations.mjs --source=mosmix_s` →
Abruf 35,5 MiB in 3,2 s, Parsen 7,1 s, Lauf 2026093012 (Alter 1,6 h), 240 Schritte, 3 071 Stationen, 12 Bündel, Böe auf den
Wind gehoben 165, **Wall 36 s**, Katalog nicht geschrieben (benannt). `publish-point.mjs --repo=…` ohne `POINT_PUSH`: Aufbewahrung
`stations/` wie bisher, **`stations-s/: 1 Lauf, 6,84 MiB`**, Index mit `stationsS.runs[0] = 2026093012` (stationCount 3 071,
leadHours 240, bytes 7 175 316), Datencommit lokal, nicht gepusht. Leser gegen den Klon (`read-check.mjs`, München-Stadt 10865,
1,2 km): `mosmix_l` → L-Lauf 2026091509, 247 Schritte, `point/stations/…`; `mosmix_s` → S-Lauf 2026093012, 240 Schritte,
`point/stations-s/…`, T 25,3/25,0/24,3 °C; `freshest` → S. Cron-Laufzeit: kein Runner-Lauf möglich, bevor `buscosun-web/main`
gepusht ist (der Job klont `main`); die Schätzung 3,2 min (36 s × 2 + 2,5 min Rand) steht mit Herkunft in `cdnSync.mjs` und
ist nach den ersten Runner-Läufen nachzutragen.

## 6c AX-9 — Klimagitter 1991–2020 als Temperatur-Prior (Bericht #13, E-EX-4; E-AX-9)

### 6c.1 Diagnose

Der Motor-Prior (`ClimaRef.tempMeanC`) kommt aus `public/climaGrid.json`: 178 DWD-Stationen (Meteostat, 1995–2024),
harmonisch je Tag des Jahres, am Punkt mit Abstandsgewicht und Lapse 0,0065 K/m gemischt. Der Bericht schlug die nationalen
1-km-Gitter vor, die Höhe und Relief schon enthalten. **Quellen vermessen (30.09.):**

| Quelle | Form | Gemessen |
|---|---|---|
| DWD CDC `grids_germany/multi_annual/<var>/…_1991_2020_<MM>.asc.gz` | ESRI-ASCII 1 km, Gauß-Krüger 3 (DHDN), 654 × 866, NODATA −999, T in 1/10 °C, RR mm, SD h; CC BY 4.0 | 60 Dateien (5 Größen × 12 Monate), 13,3 MB; Namensfalle: `air_temp_mean` mit `1991_2020`, die übrigen mit `1991-2020` |
| GeoSphere `spartacus-v3-1m-1km` (API, NetCDF4) | 329 × 584, EPSG:3416 mit lat/lon-Feldern; Wert + Anomalie gegen 1991–2020 je Monat (`TMa` 1/10 K, `RRa`/`SAa` %); Ints × 0,1; Limit 10 M Werte je Anfrage (⇒ 5 Anfragen à 12 Monate × 2 Parameter); CC BY 4.0 | **Gegenprobe:** Normale aus Januar 2019 und Januar 2020 EXAKT gleich (Wien 1,2 · Sonnblick −11,1 · Innsbruck −0,2 °C) |
| MeteoSwiss OGD `ch.meteoschweiz.ogd-climate-normals-grid` (STAC) | NetCDF4, LV95 1 km mit lat/lon, 240 × 370, Fehlwert −999,99, `TnormM9120` … `SnormM9120`; CC BY 4.0 | 5 Dateien à 5 MB; **`SnormM9120` ist die RELATIVE Sonnenscheindauer (%)** (Maximum 66; Stunden wären ≈ 320) ⇒ in Stunden über die astronomische Tageslänge |

Gauß-Krüger → WGS84 (Bessel, 7-Parameter-Helmert des BKG) selbst gebaut und geprüft: die kälteste Januarzelle Deutschlands
(−9,6 °C) liegt 0,5 km von der Zugspitze.

### 6c.2 Umsetzung

| Datei | Änderung |
|---|---|
| `scripts/point/staticClimaGrid.mjs` (neu) | Producer des statischen Produkts `point/static/clima-grid/v1/` (nur Stufe 1, 208 Chunks, **1,87 MiB**): 63 Ebenen `t_mean/t_max/t_min/rr/sun_01…12` (Skala 0,1), `elev_src` (Mittel der Terrarium-z8-Höhe an den Zentren der Quellzellen — die Bezugshöhe der Normale), `n_src`, `src` (Bitmaske DE 1/AT 2/CH 4); Aggregation = arithmetisches Mittel der 1-km-Zellen je Cube-Zelle (Zuordnung wie `cellOf`); `static.json` mit Quellen, Lizenzen, Ableitungen, Wertebereichen. Lokal gebaut in 55 s: DE 358 303 · AT 106 610 · CH 46 718 Quellzellen, **25 814 von 48 441 Cube-Zellen** (53 %, der Rest liegt außerhalb DE/AT/CH/LI — MISSING, benannt). Stichproben Januar: München 0,7 (Station 0,5) · Wien 1,1 (1,2) · Zürich 0,9 (0,9) °C; Sonne Zürich 61/251 h |
| `src/point/cubeFormat.ts`, `src/point/client/readPoint.ts` | `CLIMA_GRID_PRODUCT/VERSION`; `ReadPointOptions.climaGrid` (mit den statischen Produkten, `low`, progressiv in der Nachlieferung), `PointBundle.climaGrid`, `late.static.climaGrid` |
| `src/pointForecast/cubeSource.ts`, `output.ts`, `pfFlags.ts` | `CubeFusionInput.climaGrid`, `CubeIo.climaGrid` (`?cg=1`), Cache-Schlüssel `\|cg`; `climaGridMonthlyAt` (linear zwischen Monatsmitten, Dez → Jan), `CLIMA_GRID_LAPSE_PER_M` 0,0065 (set = Stationsfeld); im `climaAt`-Prior ersetzt das Gitter das **Tagesmittel** T (`T = t_mean(doy) − Γ·(h_true − elev_src)`), Tagesgang, σ_c und Nasstag bleiben vom Stationsfeld; Provenienz `clima: 'clima-grid'`, calib `climaGrid:set`, Notiz mit Δh/ΔT und den drei Werten; ohne Option byte-gleich |
| `scripts/fusionfit/clima-grid-check.mjs` (neu) | Messung (§6c.3) |
| `scripts/verify-pv-cube.mjs` (36) | Interpolation, Rechnung mit/ohne/`null`, Produktweg in Producer-Form, Cache-Schlüssel |
| `scripts/repack-repo/README.md` | Baum und Abschnitt „Klimanormale" |

### 6c.3 Messung: Gitter gegen Stationsfeld an der Wahrheit (405 Punkte, 2023-06…2026-08)

`clima-grid-check.mjs --point=%TEMP%\ax9\point`: Monatsmittel der stündlichen Wahrheit (≥ 80 % der Stunden) gegen
**S** (Stationsfeld, Mittel über die Tage des Monats), **G** (Gitter + Γ·(elev_src − h)), **G0** (Gitter ohne Höhenkorrektur),
**R** (Reliefregel: G bei h ≥ 500 m oder |Δh| > 200 m, sonst S) und je Kandidat **+** = Trendversatz 0,45 K/Dekade ab der
Periodenmitte (S 2009,5 · G 2005,5). 14 762 Punkt-Monate; 22 Punkte ohne Gitterzelle (Nachbarländer). |Δh| Punkt − elev_src:
p50 32 m, p90 429 m, max 1 083 m.

| Gruppe | n | S bias / MAE | G bias / MAE | G0 MAE | R MAE | S+ / G+ / R+ MAE | G näher als S (p) |
|---|---|---|---|---|---|---|---|
| alle | 14 762 | −1,24 / 1,63 | −1,25 / **1,57** | 1,78 | **1,50** | 1,36 / **1,22** / 1,23 | 45 % (< 1e−9) |
| DE | 7 635 | −1,09 / **1,34** | −1,27 / 1,47 | 1,42 | 1,35 | 1,08 / 1,08 / 1,07 | 38 % (< 1e−9) |
| AT | 3 270 | −0,95 / 1,78 | −0,97 / **1,58** | 2,03 | 1,56 | 1,55 / **1,32** / 1,35 | 52 % (0,07) |
| CH | 3 818 | −1,79 / 2,10 | −1,43 / **1,76** | 2,29 | 1,73 | 1,76 / **1,42** / 1,43 | 56 % (5e−13) |
| < 500 m | 8 931 | −1,00 / **1,33** | −1,21 / 1,45 | 1,50 | 1,33 | 1,10 / 1,09 / 1,10 | 39 % |
| 500–1 500 m | 4 472 | −1,21 / 1,83 | −1,14 / **1,63** | 2,17 | 1,63 | 1,55 / **1,34** / 1,34 | 52 % (3e−3) |
| ≥ 1 500 m | 1 359 | −2,86 / 2,99 | −1,85 / **2,15** | 2,34 | 2,15 | 2,48 / **1,68** / 1,68 | **69 %** |
| \|Δh\| > 200 m | 3 113 | −1,74 / 2,38 | −1,20 / **1,83** | 2,82 | 1,83 | 2,04 / **1,57** / 1,57 | **62 %** |

**Lesart.** (1) Das Gitter gewinnt, wo Höhe und Relief zählen (Alpen −28 %, Schweiz −16 %, Δh > 200 m −23 %), und verliert
im flachen Deutschland (+10 %), wo das Stationsfeld mit seiner jüngeren Periode (1995–2024) die warmen Jahre 2023–2026
besser trifft. (2) Die Höhenkorrektur trägt (G0 → G −12 %). (3) **Beide Kandidaten sind ≈ 1,2 K zu kalt** — die
Referenzperioden liegen hinter der Erwärmung; ein Trendversatz von 0,45 K/Dekade (Literaturwert DACH, set) nimmt den
gemeinsamen Anteil fast ganz heraus: G+ 1,22 K ist der beste Kandidat in jeder Gruppe außer DE-Flachland (dort gleich).
Der Vorzeichentest ist zweiseitig, die Punkt-Monate sind nicht unabhängig (derselbe Punkt, benachbarte Monate) — die p-Werte
sind indikativ. **Verdikt:** Gitter + Trendversatz (`climaGrid` + `climaTrend`) ist der bessere Prior; Reliefregel ohne
Trend (R 1,50) wäre der konservative Zwischenschritt. Der Prior wirkt im Produkt nur über die Schrumpfung bei langen
Vorläufen und den Klimatologie-Schwanz — der Produktgewinn ist damit kleiner als der Prior-Gewinn und wird erst der
Backtest (AP9) zeigen. Entscheidung E-AX-9 (MANUELLE-SCHRITTE §28).

## 6d AX-10 — INCA-Analyse als Anker in Österreich (Bericht #14, zweiter Teil; E-AX-10)

### 6d.1 Diagnose

Der Anker (AP7) paart Messungen der sechs nächsten Stationen mit dem Cube-Wert zur Messzeit; die Repräsentativität
(`spatialWeight`: Abstand, Höhendifferenz) skaliert die Innovation. An Punkten ohne Station im Umkreis (AX-1: 4 von 8
Stadtpunkten strukturell ohne) gibt es keinen Anker. GeoSphere stellt die **INCA-Analyse** (1 km, stündlich; T2M, TD2M,
RH2M, UU, VV, GL, RR, P0) als Punkt-Zeitreihe bereit — gemessen 30.09. 14:27 UTC: die Stunde 13:00 lag vor, 14:00 noch nicht
(Latenz ≈ 1–1,5 h), eine Anfrage 0,46 s, 970 Byte für vier Stunden. INCA zieht die Analyse an den Stationen auf die Messung;
abseits davon bleibt ein Teil des Modellfehlers (≈ 1 K) — die Analyse ist am Punkt, aber keine Messung.

### 6d.2 Umsetzung

| Datei | Änderung |
|---|---|
| `src/pointForecast/cubeSource.ts` | `CubeObs.weight` (0…1, multiplikativ auf die Repräsentativität; fehlt = 1), `INCA_ANCHOR_WEIGHT` 0,6 (set), `incaObsOf` (rein), `fetchIncaAnalysisObs` (nur im INCA-Raster, Fenster 4 h auf volle Stunden, HTTP-Fehler ⇒ leer), `fetchCubeObs(…, opts)` holt INCA parallel zu den Stationen (nur AT, nur mit Option; ein Scheitern kostet keine Messung), `CubeIo.incaAnchor` (`?inca=1`) → `CubeObsFetchOptions` an beiden Abrufstellen, Cache-Schlüssel `\|inca`, Notiz „incaAnchor: Option an, aber keine INCA-Analyse erhalten …" (nur AT), calib `incaAnchor:set` (T, Wind; keine Böe — INCA führt keine) |
| `src/sources/geosphereInca.ts`, `pfFlags.ts`, `output.ts` | `INCA_BOUNDS` exportiert; `pfIncaAnchorFrom`; `CALIB_KEYS_OF` |
| `scripts/verify-pv-cube.mjs` (37) | Abbildung, Abrufweg mit falschem `fetch` (URL, Raster, Fehler), Gewicht im Anker (Repräsentativität 1 / 0,6 / 0, Wirkung monoton), Produktweg mit Notiz/calib/Schlüssel |

**Nicht gemessen:** die Wirkung auf das Produkt. Eine Leave-Station-out-Messung ist mit der INCA-Analyse nicht möglich (sie
enthält die Stationen), und lokal liegt kein INCA-Archiv. Das Gewicht 0,6 ist eine Setzung; der Sammler (AP9) kann die
INCA-Zeile mitschreiben (`fetchIncaAnalysisObs`, eine Zeile) und der Fit (AP10) das Gewicht messen — E-AX-10.

## 6e AX-11 — Globalstrahlung, Sonnenscheindauer und Sichtweite im Stationsprodukt (Bericht #21)

### 6e.1 Diagnose

Der Cube trägt weder Globalstrahlung noch Sichtweite (Bericht #21); C-LAEF v2 führt Strahlung, MOSMIX führt `Rad1h`
(Globalstrahlung der letzten Stunde, kJ/m²), `SunD1` (Sonnenscheindauer der Stunde, s) und `VV` (Sichtweite, m) — am
MOSMIX-S-File vom 30.09. 12z ausgezählt: 40 Elemente, darunter alle drei; MOSMIX-L führt sie ebenso. Der Stationsleser
(`readStationPoint`) nimmt die Ebenenliste aus dem Lauf-Manifest — das Produkt war also schon selbstbeschreibend, nur an
die Cube-Liste gebunden (`CUBE_PLANES`, 61). Eine Erweiterung um Ebenen, die nur die Station trägt, braucht keinen Schemabruch
des Cubes: die drei Ebenen stehen HINTER den 61, die Cube-Stellen bleiben.

### 6e.2 Umsetzung

| Datei | Änderung |
|---|---|
| `src/point/cubeFormat.ts` | `STATION_EXTRA_PLANES` (`radGlob` W/m² Skala 1, `sunDur` min Skala 1, `vis` m Skala 10 ⇒ bis 327 km), `STATION_PLANES` = Cube + Extras (64) |
| `scripts/point/mosmix.mjs` | `MOSMIX_PARAMS` + `Rad1h`, `SunD1`, `VV`; `mosmixToCube`: `radGlob = Rad1h ÷ 3,6`, `sunDur = min(60, SunD1 ÷ 60)`, `vis = VV`; negative Werte fallen weg |
| `scripts/point/build-stations.mjs` | schreibt mit `STATION_PLANES` (eigener Index statt `planeIndex`, Encoder zählt 64 nach), Manifest `planes` (64) + `stationPlanes`, Bericht nennt die Stationsebenen |
| `scripts/verify-point-data.mjs` (3n) | Liste = Cube + 3, Umrechnung mit Gegenprobe, Bauer/Manifest |
| `scripts/repack-repo/README.md` | Absatz „Drei Ebenen nur im Stationsprodukt" |

**Der Client ändert sich nicht:** `readStationPoint` liest die 64 Ebenen aus dem Manifest, `station.steps[].values` trägt
`radGlob`/`sunDur`/`vis`, `filledPlanes` nennt sie; buscosun Fusion nimmt aus der Reihe nur die Cube-Größen (byte-gleich).
Alte Läufe mit 61 Ebenen bleiben lesbar (das Manifest sagt 61). Das Dashboard (Phase DB, parallele Session) kann die drei
Werte aus der Stationsreihe nehmen — hier nicht angefasst (Zuständigkeit).

### 6e.3 Lokaler Lauf (30.09., 14:45 UTC)

`build-stations.mjs --source=mosmix_s` in den Scratch-Klon: Lauf 2026093014, 179 Bündel, 8,50 MiB (vorher 6,84 — die drei
Ebenen kosten 1,66 MiB je Lauf, die Sichtweite allein 1,1 MiB: viele verschiedene Werte), belegt 15/64 Ebenen. Leser
(`read-check2.mjs`, München-Stadt, `stationSource: 'mosmix_s'`): 64 Ebenen, `radGlob`/`sunDur`/`vis` gefüllt — 30.09. 15 UTC
342 W/m², 60 min, 51,3 km; Nacht 0 / 0 / 18,7–42,5 km; 01.10. 12 UTC 578 W/m², 56 min, 42,3 km. Läuft im Cron nach dem
Push von `buscosun-web/main` (V-AX-8) für MOSMIX-L (t2) und MOSMIX-S.

## 6f Nicht gebaut — Entwürfe, Kosten und Gründe (#17, #18, #20, #4, #6, #8)

Nach AX-7…AX-11 bleiben sechs Vorschläge. Jeder ist hier so weit entworfen, dass die nächste Session ihn ohne neue Diagnose
beginnen kann; gebaut wurde er nicht, weil das Ergebnis heute nicht messbar wäre oder eine frühere Entscheidung ihn sperrt.

| # | Vorschlag | Entwurf | Kosten | Warum heute nicht |
|---|---|---|---|---|
| 17 | CH-Member (ICON-CH1/CH2-EPS perturbed) | `meteoswiss.mjs` bekommt `ensemble()` nach dem Muster von `ecmwfEns.mjs` (`ensembleStats.mjs`: σ_ens, q10/q90, Mittel): zuerst **CH2-EPS in Stufe 2** (20 Member, 284 k Zellen, `perturbed`-GRIB ≈ 5 MB je Größe und Schritt; 4 Größen × 12 Sechs-Stunden-Schritte ≈ 300 MB, ≈ 960 dekodierte Felder), hinter `POINT_CH_MEMBERS=1` (Vorlage aus); CH1 (10 Member, 1,15 M Zellen, 23 MB je Datei) erst nach der Laufzeitmessung von t2 | 2–3 h + Runner-Messung (t2 gemessen 10,7 min, JOB_MAX 15: die Luft ist knapp) | der Nutzen zeigt sich erst im Fit (σ_ens als Spalte, FL) und der Cron läuft den neuen Code erst nach dem Push (V-AX-8) |
| 18 | Exposition (Sx/Helbig) als Merkmal der Lernstufe | die Merkmalstabelle trägt schon `terrain.horizonDeg[8]` je Punkt und der Client dasselbe Feld — ein Merkmal `hzUpwind` (Horizontwinkel im Sektor der Cube-Windrichtung) und `hzMax` in `Z_NAMES`/`buildZ` (`fusionFit/features.ts`), dann in `M_NAMES` für u/v/Böe; Neufit A–E (`fit.mjs`), out of fold gegen Fit 5e für Wind/Böe | 3–4 h + Fit (≈ 1 h) + Scorecard (≈ 45 min) | ändert das z-Layout ⇒ alle Tabellen neu, Client-Layout mit `Z_DIM` verkoppelt — eine eigene Fit-Etappe, nicht ein Nachmittag |
| 20 | Zeitversetztes Ensemble (letzte 2 Läufe) | Leser: `index.runs` (Aufbewahrung hält ≥ 2 t1-Läufe) ⇒ zweiter Chunk des Vorläufers (`ReadCubeOptions.pointer`-Override in `readCubePoint`), Bündel `cube.t1Lag`; Motor: zweites Sample je Schritt mit Tag `lag:<Lauf>`, Gewicht nach Alter, der Abstand geht über die Kombination in σ_div | ≈ 2 h; +75 KB je Abfrage (t1) | nicht messbar ohne Archiv mit Vorläufern (der Hindcast trägt je Tag einen Lauf); P3 im Bericht |
| 4 | ICON-D2-RUC (+EPS) stündlich | eigene Quelle in `TIER_BANDS` t1 mit stündlichem Cron (24 Jobs/Tag, Regeln A–F neu), Überblendung Radar → RUC-EPS (Rampe) im Nowcast-Teil des Motors | Phase (Tage) | E-EX-5: mit dem DWD-URL-Schema am 30.11. und dem Wegfall des regulären Gitters in EINER Phase (Beschluss 29.09.) |
| 6 | Flächige MOS-Korrektur (gridded MOS) | Differenz MOSMIX − Cube an den 3 071 Stationen je Stunde, mit Abstands- und Höhenterm aufs Stufe-1-Gitter (BCDG) als **statisches Produkt je Lauf** im t2-Job; der Stationswert (FS) bleibt an der Station, das Gitter ersetzt die harte 5-km/50-m-Schwelle | 1–2 Tage + Archivmessung an zurückgehaltenen Stationen | braucht die Archivkarte (≥ 30 Ausgabetage, E-FS-3) als Maß; ohne sie wäre es eine zweite ungemessene Korrektur neben dem Stationswert |
| 8 | Flächige Niederschlagswahrheit (RADOLAN RW/RADKLIM, INCA-Analyse, CombiPrecip) + zensierte Gamma/GEV | Wahrheitspfad des Hindcasts um Rasterwahrheit an den 405 Punkten (RADKLIM 2001–2025 als Jahresdateien ≈ 1 GB/Jahr), dann Fit der Niederschlagsverteilung als eigene Familie (`dist.ts`, Codec-Version 4) | Datenprogramm (Tage) + Fit | K-2 („no-skill" 7–48 h) ist eine Datenfrage — erst mit Winterzeilen und Rasterwahrheit; Familienwechsel = Codec-Bump = Jans Gate |

## 7 Gates der Phase (Arbeitsbaum mit der parallelen Dashboard-Phase; Stand nach AX-11, 30.09. 14:50 UTC)

| Gate | Stand |
|---|---|
| `verify:pv-cube` | **379/379** (338 + Blöcke 30–37; Kostenprüfungen (8)/(9) nur im Leerlauf grün, V-EX-13) |
| `verify:point-data` | **1018/1018** (vier Cron-Jobs, Regeln A–F und E′ nachgerechnet, Leerlauf-Schutz mit Gegenprobe, AX-8/AX-11-Anker) |
| `verify:fusion-fit` | **124/124** |
| `verify:pv-fusion` | **249/249** — der Live-Pfad ist byte-gleich |
| `verify:point-client` | **171/171** ((10s) zeitabhängig: ein Lauf unter Last 170/171, im Leerlauf grün) |
| `verifyDist` / `verifyStationValue` | 54/54 · 10/10 |
| `npm run typecheck` | 0 Fehler (ganzer Baum) |
| `npm run build` | 249/249 |
| `npm run budget` (AX-7…AX-11) | eagerJs 108,6 / 108,7 (unverändert), largestChunk 278,4 / 302, **totalJs 1 508,6 / 1 510** (Grenze um den gemessenen Zuwachs +2,2 KB angehoben, Notiz in `budget.json`) |
| Daten-Repo | `7115d708` Cron-Vorlage + README · `3869297b` Klimagitter · `d058317c` Leerlauf-Schutz; Runner: t1 13:48 UTC (neue Vorlage, `POINT_Z0MOD`) 15 min grün, `stations-s` 14:03 UTC grün (Leerlauf fehlgeschlagen ⇒ V-AX-12, harmlos) |

### 7.1 Gates der ersten Hälfte (AX-1…AX-6, vor der Freigabe des Daten-Repos)

| Gate | Stand |
|---|---|
| `verify:pv-cube` | **363/363** (338 + Blöcke 30–34) |
| `verify:fusion-fit` | **124/124** |
| `verify:pv-fusion` | **229/229** — der Live-Pfad ist byte-gleich |
| `verify:point-client` | 167/167 (ein Lauf 166/167: (10s) zeitabhängig unter Last, V-EX-13; im Leerlauf grün) |
| `verifyDist` / `verifyStationValue` | 54/54 · 10/10 |
| `npm run typecheck` | 0 Fehler (ganzer Baum) |
| `npm run build` | 249/249 |
| `npm run budget` | eagerJs 108,6 / 108,7 (unverändert), largestChunk 278,4 / 302, **totalJs 1 504,0 / 1 505** (Grenze um den gemessenen Zuwachs +3,5 KB angehoben, Notiz in `budget.json`; Jan 30.09.: Grenzen dürfen angehoben werden) |
| Browser | AX-1/AX-2 an München geprüft (§1.6); AX-3 nur im Verifier (der Dev-Server zeigt die calib-Zeile, nicht geschnappschossen) |

### 7.2 Selbstverifikation AX-7…AX-11 (die fünf Fragen)

1. **Funktionserhalt einzeln:** jede neue Option ist voreingestellt aus (`ensMember`, `stationSource`, `climaGrid`, `climaTrend`,
   `incaAnchor`) und der Verifier belegt je Option Byte-Gleichheit ohne sie (Blöcke 35–37); der Live-Pfad ist unberührt
   (`verify:pv-fusion` 249/249); alte Schema-5-Chunks und 61-Ebenen-Stationsläufe bleiben lesbar.
2. **Desktop pixelgleich:** keine UI-Änderung — das Panel rechnet ohne Schalter wie vorher (dieselben Schlüssel, derselbe Cache).
3. **Touch-Targets:** nicht berührt.
4. **Konsole sauber:** neue Netzabrufe nur hinter Option (`?st=s`, `?cg=1`, `?inca=1`); ihr Ausbleiben ist eine Notiz, nie ein Fehler.
5. **Keine Long Tasks:** der Klimagitter-Chunk (≤ 15 KB) und die INCA-Zeitreihe (970 Byte) reisen mit den späten Produkten; die
   Monatsinterpolation ist O(1) je Schritt. Nicht am Gerät gemessen (Real-Device offen wie in AP11).

## 8 Selbstverifikation

1. **Funktionserhalt:** kein Aufrufer entfernt; der Live-Pfad (`?pf=live`) und die Karte rufen die Messungs-Adapter ohne
   die neuen Optionen und sind byte-gleich (`verify:pv-fusion`); jede neue Motor-Option ist voreingestellt aus und ohne
   Option byte-gleich (Blöcke 31–34 mit Negativkontrollen); die Stufe `fs` trägt neu nur `anomalyInterp` (E-AX-3).
2. **Desktop pixelgleich:** keine UI-Datei angefasst (kein CSS, keine Komponente); das Panel zeigt neue Notizzeilen im
   pflog-Block, sonst nichts Neues.
3. **Touch-Targets:** nicht berührt.
4. **Konsole:** im Browser-Lauf (München, Dev-Server) keine Fehler aus dem Cube-Pfad.
5. **Long Tasks:** die zusätzlichen Abfragen (BrightSky nach Kennung und am Punkt, SMN 12 statt 80 Dateien) laufen neben dem
   Kern; die Anomalie-Interpolation kostet je Stunde eine μ_c-Auswertung (13 Multiplikationen) — nicht messbar in headless.

**Nicht gemessen:** Real-Device; die Wirkung von AX-1 auf den Fehler (H9 ist die Referenz, die Voraussetzung ist jetzt im
Browser gegeben); AX-3 und AX-4 im Archiv (die Archivkarte bewertet native Schritte bzw. trägt die Atome noch nicht — AX-4
ist out of fold am Hindcast gemessen, das ist die stärkere Zahl); AX-6 nach der Lernstufe.

## 9 Befunde und Entscheidungen — Übersicht

| ID | Befund | Stand |
|---|---|---|
| V-AX-1 | Live-Pfad und Karte holen nicht die nächsten Stationen | offen (E-AX-1) |
| V-AX-2 | TAWES/SMN-Messungen ohne Messzeit im Punkt | offen, klein |
| V-AX-3 | 4 von 8 Stadtpunkten ohne messende Station ≤ 5 km | Kalender (V-FS-1) |
| V-AX-4 | Archiv-Schema 3 seit 29.09., `archiveAdapter.mjs` liest 1/2 | offen, vor dem Neufit |
| V-AX-5 | `period.to` der Client-Tabelle „2026-09-31" | offen, kosmetisch |
| V-AX-6 | Rampe an den Nähten ohne überlappende Vorläufe nicht baubar | Producer (Jans Gate) |
| V-AX-7 | Scorecards bewerten keine interpolierten Stunden | offen (AP9) |
| V-AX-8 | Cron klont `main` — Producer-Wirkung erst nach dem Push | Leerlauf-Schutz gebaut, Push = Jans Gate |
| V-AX-9 | MeteoSwiss-Sonne ist relativ (%) | behoben (Umrechnung, benannt) |
| V-AX-10 | Klimatologie-Prioren ≈ 1,2 K zu kalt (Referenzperioden) | `climaTrend` gebaut, aus (E-AX-9) |
| V-AX-11 | Klimagitter nur DE/AT/CH/LI | offen (Rand = Stationsfeld, benannt) |
| V-AX-12 | Leerlauf-Schutz traf den Teilstring `mosmix_stationskatalog` | behoben (`POINT_STATIONS_SOURCE`, `d058317c`) |
| E-AX-10 | INCA-Anker (Gewicht 0,6) in die Stufe | nach AP9/AP10-Messung (§6d) |

| ID | Entscheidung | Empfehlung |
|---|---|---|
| E-AX-1 | `near` im Live-Pfad | ja, eigener Commit |
| E-AX-2 | `learnedRoute: 'tier'` | nein (gemessen schlechter), Dezember neu |
| E-AX-3 | `anomalyInterp` in der Stufe fs | gesetzt, ja |
| E-AX-4 | Codec Version 3 | bestätigen |
| E-AX-5 | Tabelle mit Atomen ins Daten-Repo | ja, mit E-AX-4 |
| E-AX-6 | ENS-Mittel als t3-Member (Producer) | ja, nach NS |
| E-AX-7 | Landeseinträge des Stationswerts ins Daten-Repo | nach der Karte §5.4 |
| E-AX-8 | MOSMIX-S als Voreinstellung | nein, bis gemessen (§6b) |
| E-AX-9 | Klimagitter + Trendversatz in die Stufe | ja nach AP9-Messung; zuerst `climaTrend` (§6c.3) |
