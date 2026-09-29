# Phase FV — Abschlussvalidierung von buscosun Fusion (Stand Fit 5e)

**Stand:** 2026-09-27 · **Status:** abgeschlossen (uncommitted) — Diagnose §1, Behauptungen eingefroren §2 (10:36:17Z), Protokoll §3,
Verdikt §4, Gates grün; Entscheidungen E-FV-1…5 = Jans Gates (§6) · **Linie:** Abschluss von FL (`audit/fusion-lernphase.md`) und FX (`audit/fusion-forschung.md`) · **Belege:**
`audit/fusion-validierung/` (Skripte, Entscheidungsdateien, Logs), Scorecards `C:\dev\buscosun-hindcast\score\<Datum>-fv-h` (Stufe 1)
und `…\score\<Datum>-fv-a` (Stufe 2).

> Jans Auftrag (27.09.): buscosun Fusion abschließen — eine INTENSIVE Validierung, die zeigt, wie gut sie wirklich ist: gegen die
> Tabellen der Scorecard 4, die Rohmodelle, MOSMIX und die heutigen Produkte. Ein ehrliches Urteil, kein Beweis: jede Behauptung steht
> vor dem Lesen der Scorecards fest, ein „schlechter" wird so sichtbar berichtet wie ein „besser", jede Zahl nennt ihre Zeilen, ihren
> Zeitraum und ihre Leckregel. Motor (`src/pointForecast/**`, `dist.ts`, `v2codec.ts`) unberührt; Fit/Scorer nur hinter Flags, ohne
> Option byte-gleich; kein Commit, kein Push, keine Kopie, kein Publisher-Lauf. Zuständigkeit: `scripts/punktarchiv/**` und
> `verify-pv-score.mjs` gehören AP9 — die Archivbewertung entsteht unter `scripts/fusionfit/`, das Archiv wird nur gelesen.

## 0 Kurzfassung — was buscosun Fusion heute ehrlich sagen kann (für Jan)

**Die Lernstufe ist gut, das Produkt noch nicht.**

**Was belegt ist (Hindcast, 13 Monate, 6,8 Mio. Fälle, alle 389 Stationen, an Stationspunkten, Provenienz `hindcast`):**
- Die gelernte Vorhersage (Fit 5e) ist **signifikant besser als jedes einzelne Wettermodell** (ICON-D2/-EU/-CH/global, IFS, AIFS) und als ihr Mittel —
  in jeder Größe und jedem Vorlauf (H2 gilt).
- Sie ist **besser als der heutige Cube-Motor** um 8–27 % in T, Td, Wind, Böe, Bewölkung; beim Niederschlag nur gleichauf (H3 bis auf zwei
  Niederschlagszellen).
- Sie ist **nirgends schlechter als die Tabellen der Scorecard 4** und am langen Ende klar besser (T +8 %, Td +11 %, Böe +5 %); es fehlt genau eine
  Pflichtzelle (Td 126–240 h, +1,4 % nicht signifikant) — daher formal „H1 gilt nicht".
- In keinem Land und keinem Höhenband bricht sie ein (H8 gilt). Temperatur und Taupunkt halten bis ≈ 300 h mit der Stationsklimatologie mit; **der
  Wind fällt ab ≈ 126 h hinter die Klimatologie** (bis −11,5 %).
- **Kalibrierung:** T/Td/Wind stimmen; **Bewölkung ist in jedem Vorlauf unkalibriert** (zu wenig Masse bei 0 und 100 %), Böe knapp.

**Was nicht belegt oder widerlegt ist (Archiv, 12 Ausgabetage im September, echte Eingaben, nur an MOSMIX-Stationen — indikativ):**
- Die **volle Produktkette** (Lernstufe + MOSMIX + Anker im Motor) ist als Wahrscheinlichkeitsvorhersage besser als MOSMIX, **ihr Punktwert aber
  schlechter als MOSMIX allein** (T 9–19 %, Wind 26–34 %, Böe 12–27 %) und **schlechter als das heutige Live-Produkt** bei T, Wind, Böe und
  Bewölkung. Besser als live nur beim Niederschlag (+23…+35 %).
- Ursache nach dem Befund: **der Motor verwässert die Lernstufe** — die Gewichte zwischen gelerntem Member und MOSMIX sind gesetzt, nicht gemessen, und die
  Bewölkung wird nachfusioniert (die Lernstufe allein ist bei der Bewölkung 0–6 h 24 % besser als die Kette).
- Das Archiv-Ergebnis ist ein **MOSMIX-Heimspiel** (Punkte = MOSMIX-Stationen). Ob die Kette an einem Punkt zwischen den Stationen MOSMIX schlägt, ist
  **nicht gemessen** — messbar in 15 min (E-FV-1).

**Was vor einer Produktaussage fehlt:** (1) Member-Gewichte aus dem Archiv statt gesetzt (V-FV-6, Motor); (2) der Client rechnet Langfrist mit
Sommer-Strata (V-FV-1); (3) Bewölkung als Zwei-Atome-Familie oder ohne Nachfusion (V-FV-10); (4) Winterdaten 7–48 h (E-FL-3) und ≥ 30 Archivtage je
Bin; (5) der stationslose Punkt gegen MOSMIX (E-FV-1). **Empfehlung:** die Lernstufe noch nicht einschalten (E-FV-2).

**Ein eigener Fehler, offengelegt:** der erste Archivlauf las die Radarraten roh (×100 zu nass); gefunden an den Zahlen, behoben, mit Verifier
abgesichert, neu gerechnet (V-FV-2). Alle anderen Größen waren nicht betroffen.

## 1 Diagnose (gemessen 27.09.2026, 10:15–10:35 UTC)

### 1.1 Kandidat und Referenzen (Dateien, sha256 der ersten 16 Zeichen)

| Rolle | Pfad unter `C:\dev\buscosun-hindcast\` | sha256 | Flags |
|---|---|---|---|
| **Kandidat Fit 5e** | `fit\2026-09-27-fx5e\fusion.hindcast.json` (Client `fusion.client.json` 0739ead7…) | a71e53c9… | `--stride=6 --folds=half --climaCols=station --rhoTarget=cv --speedGrid=v4 --speedBands=1 --scaleVars=clct --clima=fit\2026-09-23\clima.hindcast.json --climaMu=fit\2026-09-26-fx4\clima.loso.ridgeTx.json --climaVars=t,td,gust` |
| Fit 4 (Scorecard 4) | `fit\2026-09-25-ap8c\fusion.hindcast.json` | 5c76e94e… | Voreinstellungen, Stride 6, Monatsfalten, `--clima=…09-23…` (tables.clima = das Dokument, byte-gleich geprüft) |
| Fit 5a | `fit\2026-09-25-fx5a\fusion.hindcast.json` | b5dcb424… | `--folds=half`, Stride 6 |
| Stationsklimatologie | `fit\2026-09-23\clima.hindcast.json` | 5bd999d5… | Wahrheitstage 2023-05-24 … 2026-09-21 (V-FX-17: enthält das Fenster) |
| μ_c-Schätzung LOSO | `fit\2026-09-26-fx4\clima.loso.ridgeTx.json` | 965e7408… | ridgeTx, je Station OHNE die Station gefittet; `tables.climaMu` von 5e trägt dieselben Koeffizienten |
| Klimatologieprodukt | `product\2026-09-27\clima\v1\stations.json` | 85d73cea… | Trend auf ALLEN 389 Stationen — an einer Station selbst ein Leck (s. §1.8) |

Alle drei Fits: 13 Fallmonate 2025-09 … 2026-09, `fusionFit@3`, 40 824 885 Fallzeilen; die Scorecards 4/5a/5e bewerten je
**6 805 912 Zeilen** (Stride 6, Zeilen mit irgendeiner Wahrheit; `inputs.scored`, nachgelesen).

### 1.2 Hindcast

`C:\dev\buscosun-hindcast\cases\v1\<Monat>\t{1,2,3}.cas.gz`, 39 Dateien, 40 824 885 Zeilen (t1 16 079 480 · t2 14 248 025 · t3 10 497 380),
Wahrheit und Slots bis 2026-09-21; Fallzeilen tragen Wahrheit, Cube-Member (`m_*`), den heutigen Motor (`f_*`) und die Einzelquellen auf
Modellhöhe (`s<k>_*`, in `rowFeatures.mjs` höhenkorrigiert) — der Rohmodellvergleich lebt hier. Kein MOSMIX im Hindcast (E-FL-4). Netze
der Wahrheit je Punkt (gemessen `truth\2026-09-20.json.gz`): DE `cdc` 203, AT `tawes` 84, CH+LI `smn` 102, 16 Nachbarpunkte ohne.

### 1.3 Zeilenverdünnung (V-FX-44) — alle 13 Monate, `diag-fv0-thin.{mjs,md,json}`

| Stufe | Regel / Stride | Zeilen (Anteil) | Punkte mit ≥ 1 Zeile | Zeilen je Punkt min / p50 / max |
|---|---|---|---|---|
| t1 | alt / 6 | 2 679 352 (16,66 %) | **389** | 5 504 / 7 284 / 7 292 |
| t1 | hash / 6 | 2 679 117 (16,66 %) | **389** | 5 953 / 6 911 / 7 917 |
| t2 | alt / 6 | 2 382 094 (16,72 %) | **130** | 17 382 / 18 342 / 18 354 |
| t2 | hash / 6 | 2 376 520 (16,68 %) | **389** | 5 493 / 6 113 / 6 808 |
| t3 | alt / 6 | 1 754 304 (16,71 %) | **65** | 25 596 / 27 036 / 27 036 |
| t3 | hash / 6 | 1 750 734 (16,68 %) | **389** | 3 821 / 4 528 / 5 148 |
| t2 / t3 | alt / 12 → hash / 12 | 8,36 → 8,35 % / 8,35 → 8,35 % | 130 → 389 / 65 → 389 | |

Bestätigt: die alte Regel `(validAtH + pointIdx) % stride` wählt bei t2 130, bei t3 **65 von 389 Stationen** (mit ALLEN ihren Zeilen);
t1 über alle Monate 389 (die Tag-0-Route allein — V-FX-44 maß 2026-05 — 259, weil ihre Gültigzeiten nur zwei Reste mod 3 treffen). Die
Hash-Auswahl `mix32(validAtH, pointIdx) % stride` (`scripts/fusionfit/lib/thin.mjs`, der Mischer von A3) hält den Zeilenanteil auf 0,03 %
und nimmt jede Station in jeder Stufe mit.

### 1.4 Archiv `C:\dev\buscosun-archiv` (nur gelesen; `git pull` 27.09. „Already up to date", HEAD a30c804) — `diag-fv0.{mjs,md,json}`

| Slot | Schema | Punkte (DACH) | codeHash | t1 / t2 / t3 Lauf (Alter zur Slotzeit h) | MOSMIX-L Lauf (Alter h) | live nach Slot |
|---|---|---|---|---|---|---|
| 2026-09-14 20:46 | 1 | 243 (222) | 302e04f-dirty | 14 18 (2,8) / 14 12 (8,8) / 14 00 (20,8) | 14 09 (7,1) | +8–9 min |
| 2026-09-15 23:20 | 1 | 243 (222) | f13661c | 15 21 (2,3) / 15 18 (5,3) / 15 12 (11,3) | 15 21 (1,7) | +10–12 min |
| 2026-09-16 23:20 | 1 | 410 (389) | 8212dda | 16 21 / 16 18 / 16 12 | 16 21 (1,7) | +7–12 min |
| 2026-09-17 23:19 | 1 | 410 (389) | 9f4403e | **17 18 (5,3)** / 17 12 (11,3) / 17 12 (11,3) | 17 15 (1,7) | +6–8 min |
| 2026-09-18 … 26 ≈ 23:20 | 2 | 405 (389) | 36f2bbb | meist 21 (2,3) / 18 (5,3) / 12 (11,3); t1 = 18 UTC am 19. und 21.09. | 21 (2,3) | +5–17 min |

- **Schema:** 1 am 14.–17.09. (14./15.09. nur 243 Punkte: DE 203, AT 11, CH 5, LI 1 — PA1; 16./17.09. 410 Punkte inkl. 5 leerer POI-Stationen),
  2 ab 18.09. (405 Punkte); PA4-Schema 3 ist nicht im Archiv (`origin/main` = 36f2bbb, lokal 4 Commits voraus). Schema-1-Slots nennen für 17
  Nachbarpunkte ein falsches Land (06120 „CH" statt DK …) ⇒ **Land, Band, Höhe, Gelände kommen aus der Merkmalstabelle**, nie aus dem Slot.
- **Cube je Slot:** `cube.{t1,t2,t3}` mit `runAt`, `leadHours`, je Punkt `cell`, `hModEffM`, `belowGroundHPa`, `planes` (int, Skalen in
  `scales.cube[t]`), `empty`; **kein 2×2-Block** (Schema 4 = AP9) ⇒ PAP 3 rechnet im Archiv mit der nächsten Zelle (N = 1), benannt.
  **Keine Einzelquellen** (V-FI-108): im Archiv gibt es nur das Mittel (Cube-Ebene) und MOSMIX als einzelne Quelle.
- **Native Achse** (t1 vor t2 vor t3, Vorlauf ab dem Stundenboden der Slotzeit): t1 1…46 h (46 Schritte; 43 bei 18-UTC-Lauf), t2 49…115 h
  (3-stündlich), t3 121…325 h (6-stündlich). Bins nach `calibBinOf` (`from_i ≤ lead < from_{i+1}`): 49/50 h ⇒ Bin 25–48, 121–125 h ⇒ Bin 51–120.
- **MOSMIX-L** (`stations`): 405/405 Punkte (Schema 1: 243/410) mit Katalogstation, Abstand DACH p50 **0 km**, p90 1,23, max 4,56 km;
  |Δh| Schema 2 p50 0 / p90 6 / max 48 m (Schema 1 gegen DEM: max 577 m). Plan nimmt die Station an 405/405 (Schema 1: 237/243 bzw. 400/410
  angenommen); Plan-Kandidat ≠ Katalogstation an 1 Punkt (Zell am See, V-PA-Befund; im Schema 2 ohne eigene Reihe). **Belegte Ebenen: t2m, td2m,
  u10, v10, gust, precip (mm/h), clct, clcl/m/h, hModEff, srcCount** — **keine Wahrscheinlichkeitsebene** (kein PoP, kein R101): MOSMIX wird
  nur deterministisch bewertet (CRPS = MAE), eine Brier-Zahl aus eigenen MOSMIX-Wahrscheinlichkeiten gibt es nicht. Vorläufe 1…247 h ab dem
  Stationslauf.
- **live** (`getPointForecast`, Schema ≤ 2): Abruf 5–17 min NACH der Slotzeit (Live läuft im Schema 2 als letzter Block), 240 h (die
  ersten Punkte 373 h), `t0Ms` = Stundenboden der Abrufzeit (Stunde 0 = Analyse mit Anker), `fields` (Altfeld-Blend = was das Panel heute
  zeigt; **ohne Taupunkt**, RH jenseits Stunde 0 leer, V-FI-31) und `fusion` je Stunde als Objekt (`mu`, `q10`, `q50`, `q90`, `rawMu`,
  `rawSigma`) — keine Verteilungsparameter, nur drei Quantile. Höhe: codeHash 36f2bbb ⇒ der Live-Pfad rechnet mit der **DEM-Höhe**, nicht
  der Stationshöhe (V-FI-24 erst in PA4) — 31 Punkte mit |DEM − Station| > 50 m (`stats.warnings.liveElevation`).
- **Wahrheit:** 25-h-Fenster (Schema 2) bzw. 24 h ohne die 23-UTC-Stunde (Schema 1); Netze DE `poi` 203, AT `tawes` 84 (Schema 1 vom 14./15.:
  11), CH `smn` 101, LI `smn` 1; zusätzlich POI an 13 AT- und 5 CH-Punkten (vom Hindcast nie bewertet ⇒ nicht benutzt). **`fxh`** (Stundenmaximum
  der Böe) erst ab Schema 2 (18.09.) — Schema 1 trägt für TAWES/SMN nur die 10-min-Spitze `fx` ⇒ Böen-Wahrheit AT/CH aus Schema-1-Fenstern
  fehlt (benannt); POI `fx` ist das Stundenmaximum. **`rr1h`** (TAWES/SMN-Stundensumme) ab 16.09. Deduplikation (Punkt, Stempel): 112 497
  Paare, **672 doppelte Stunden, 0 mit abweichendem Wert**; letzte Wahrheitsstunde 2026-09-26 23:00 UTC.

**Abdeckung (native Schritte mit Wahrheit T, DACH, alle Ausgabetage 14.–26.09.; `diag-fv0.md` hat die Matrix je Tag × Bin × Land):**
0–6 h 25 102 · 7–24 h 76 800 · 25–48 h 86 947 · 51–120 h 70 970 · **126–240 h 29 969 (7 Ausgabetage, 14.–20.09.)** · **246–336 h 2 195
(2 Ausgabetage: 14./15.09., nur 222 Punkte, DE 203 / AT 11 / CH 5 + LI 1, Vorlauf 246–291 h)**. Ausgabetage je Bin mit Wahrheit: 12 · 12 ·
11 · 10 · 7 · 2 — n_eff eines DM-Tests auf Tagesmitteln ist **höchstens 12**, am langen Ende 7 bzw. 2. Je Größe: T 291 983, Td 290 899,
ff 291 939, Böe (fxh) 259 767, Niederschlag 259 469, Bewölkung (nur DE) 162 177 von 488 025 nativen Schritten.

### 1.5 Überlappung mit den Fitmonaten

Der Hindcast (Fitdaten) endet 2026-09-21 23:00 UTC. Ausgabetage 22.–26.09. liegen außerhalb jedes Fits. 14./15.09. liegen in der
Halbmonatsgruppe `2026-09a`, 16.–21.09. in `2026-09b`; beide Gruppen tragen Falten-β (`entry.folds['2026-09a' | '2026-09b']`): die Falte
`2026-09b` purgt ihren Nachbarn `2026-09a` (und `2026-10a` gibt es nicht), die Falte `2026-09a` purgt `2026-08b` und `2026-09b` — **beide
Falten schließen jeden Tag vom 1. bis 21.09. aus**, also jeden Ausgabetag 14.–21.09. und jede Gültigzeit bis 30.09. Fit 4 (Monatsfalten):
Falte `2026-09` purgt `2026-08` (und `2026-10` gibt es nicht). In-sample bleiben (wie im Hindcast-Scorer, benannt): Varianzmodell, σ-Skala,
Speed-Gesetz, Hürden-Menge, Anker-Kurve (über alle Gruppen gepoolt), die Stationsklimatologie (Wahrheit bis 21.09.) und die LOSO-Trends der
anderen Stationen (Wahrheit bis 21.09.).

### 1.6 Wie ein Archiv-Slot zur Motor-Eingabe wird (Entscheidung, gebaut als neue Datei, der Hindcast-Pfad bleibt unberührt)

`slotAdapter.mjs` liest einen Hindcast-Slot (`cube[t].validAtMs`, Skalen aus `CUBE_PLANES`); ein Archiv-Slot hat stattdessen
`runAt` + `leadHours`, eigene Skalen (`scales.cube[t]`), `belowGroundHPa` je Schritt und keinen Block. Neu `scripts/fusionfit/lib/archiveAdapter.mjs`
(Schema 1 und 2): Reihe je Stufe (`validAtMs = runAt + lead`, Skalen des Slots, `neighbours: []`), **Stationsreihe** (MOSMIX-L der
Plan-Station, nur wenn der Plan sie annimmt; `elev = Punkthöhe + dElevM`, Name aus `points[]`), **Nowcast** (Frames je Quelle aus
`nowcast.byPoint[].bySource`, `covering`), **Anker-Messung** (die jüngste Wahrheit des Punkt-Netzes ≤ slotAt, eine `CubeObs` mit Abstand 0 und
der Stationshöhe), Gelände/Landbedeckung/urban/h_true aus der Merkmalstabelle (wie `build-cases.mjs`), Klimatologie `ClimaField`
(`public/climaGrid.json`, wie der Hindcast). Fenster wie der Client: ab dem Stundenboden der Slotzeit bis +336 h, native Schritte
(`hourly: false`, `tail: false` — wie der Fallbau). Folgen, benannt: (a) PAP 3 nur N = 1; (b) **DE ohne Anker** — die POI-Messung 23:00
erscheint erst nach dem Slot, 22:00 liegt vor dem Fenster und paart nicht (der Client verwirft sie genauso); AT/CH ankern mit 23:00; (c)
Vorlauf ab jetzt (V-FI-10): ein t2-Lauf von 18 UTC liefert im 23:20-Slot Vorläufe ab 46 h, die das Bin-2-Stratum rechnen — genau wie im Client.

### 1.7 Kandidaten und Leckregeln

**Stufe 1 (FV-H, Hindcast):** fl-K (Fit 5e′), fl-K@4 (Fit 4′), fl-K@5a (Fit 5a′), fl-P, cube (heutiger Motor im Fallbau), mmm, `src:<Modell>`
(7 Quellen), clima, persist, apersist — wie `score.mjs`; fl-K/fl-P und die Referenztabellen je Zeile mit den Falten-β OHNE die
Zeitgruppe der Zeile (5e′/5a′ Halbmonat, 4′ Monat). Negativkontrollen: die Hash-Auswahl im Verifier (jede Station überlebt; die alte Regel
verliert Stationen in t3), `fx5-negcheck` (5e′ gegen 5a′: u/v/Bewölkung/Niederschlag byte-gleich).

**Stufe 2 (FV-A, Archiv 14.–26.09.)** — je Slot, Punkt (389 DACH) und nativer Gültigzeit mit Wahrheit, Vorlauf ≥ 1 h ab Stundenboden der Slotzeit:

| Kandidat | Was | Leckregel |
|---|---|---|
| **product@5e** | volle Client-Kette `fuseCubePoint` mit `learned` + `learnedSpeed` + `learnedPrecip` (Tabellen 5e), μ_c = **LOSO-Schätzung des Punkts** (die 13 Koeffizienten aus `tables.climaMu`, als Ein-Stations-Produkt am Punkt übergeben — nie das Produkt, dessen Trend die Station selbst enthält), MOSMIX-Stationsmember, Nowcast, Anker aus Messungen ≤ slotAt | Ausgabetag ≤ 21.09.: Falten-β **2026-09a**, wenn die Gültigzeit ≤ 15.09., sonst **2026-09b** (auch für Gültigzeiten im Oktober); ab 22.09.: volle Tabellen. Die Kette rechnet je Faltenschlüssel einen eigenen Motorlauf |
| product@4 | dieselbe Kette mit den Tabellen von Fit 4 (Scorecard 4, kein μ_c) | Ausgabetag ≤ 21.09.: Falte **2026-09**; ab 22.09. volle Tabellen |
| cube | dieselbe Kette ohne Lernstufe (heutiger Cube-Pfad hinter `?pf=cube`) | — |
| cube-hc | der Motor wie im Fallbau (ohne Station, Nowcast, Anker) = der Kandidat „cube" des Hindcasts | — |
| fl-K@5e | die Lernstufe allein (`predict`, Form K, Route 1 wie der Client) auf dem Cube-Member von cube-hc — dieselbe Situation wie `score.mjs sitK` | wie product@5e |
| mosmix | MOSMIX-L an der Katalogstation, T/Td mit `sourceToPoint` von der Stationshöhe auf h_true (|Δh| ≤ 48 m) | Lauf ≤ slotAt |
| live / live-fusion | `live.fields` (deterministisch; ohne Td) / `live.fusion` (drei Quantile) | Ausgabe = Abrufzeit (5–17 min nach dem Slot — ein kleiner Vorteil, benannt) |
| mmm | Cube-Ebene der nächsten Zelle, T/Td mit `sourceToPoint` von hModEff auf h_true (= Mittel der höhenkorrigierten Quellen, linear) | — |
| clima | Stationsklimatologie (`tables.clima`) | Fit enthält die Wahrheit bis 21.09. (V-FX-17) |
| persist / apersist | jüngste Messung ≤ slotAt (DE 22:00, AT/CH 23:00) und ihre Anomalie auf der Klimatologie | — |

Rohmodelle am Punkt gibt es im Archiv NICHT (der Cube trägt keine Einzelquellen, V-FI-108) — die Rohmodell-Aussage (H2) kommt allein aus
dem Hindcast. Leck- und Negativkontrollen der Stufe 2: **L1** product@5e mit vollen Tabellen statt Falten-β auf Zeilen mit Ausgabetag ≤ 21.09.
UND Gültigzeit ≤ 21.09. 23:00 (dort hat der volle Fit dieselbe Wahrheit gesehen) muss im CRPS besser aussehen als mit Falten-β; **L2** eine um
+1 h verschobene Wahrheit muss persist bei Vorlauf 1 verschlechtern, eine um −1 h verschobene muss persist bei AT/CH (Anker 23:00) auf
|Fehler| ≈ 0 bringen; **L3** keine Eingabe trägt einen Zeitstempel > slotAt außer live (Abrufzeit), gezählt.

## 2 Vorab festgelegte Behauptungen und Entscheidungsregeln

### 2.0 Einfrieren

**Eingefroren: 2026-09-27T10:36:17Z** (sha256 des Texts von „### 2.1" bis vor „### 2.9" in `fusion-validierung/claims-frozen.sha256`) —
vor jedem Fit, jeder Scorecard und jedem Archivlauf dieser Phase. Danach wird §2 nur um
Ergebnisse ergänzt (§4), nie geändert; eine Präzisierung, die sich beim Bauen als nötig erweist, steht mit eigenem Zeitstempel und Grund in
§2.9 und gilt nur, wenn sie vor der betroffenen Scorecard liegt.

### 2.1 Wortwahl und Signifikanz

- Skill = 1 − Score_Kandidat / Score_Referenz auf **identischen Zeilen** (Paare), Score = CRPS (deterministisch: MAE), zusätzlich MAE des
  Punktwerts (Normal: μ; Rice/TN: Erwartungswert; zensiert/Hürde: Median — die Definition von `score.mjs`). Live-Fusion: **QS3** (mittlerer
  Pinball-Score an 0,1/0,5/0,9 ×2, für jeden verglichenen Kandidaten aus seinen eigenen Quantilen; deterministisch = MAE).
- Test: Diebold–Mariano mit HAC auf Tagesmitteln (Tag = Ausgabetag), Benjamini–Hochberg über **alle** DM-Tests einer Scorecard (q = 0,05);
  90-%-Intervall aus dem Tages-Block-Bootstrap (200 Züge, feste Saat).
- Worte: **„signifikant besser"** (Skill > 0, p_adj < 0,05) · **„gleichauf (n.s.)"** (p_adj ≥ 0,05; das Vorzeichen wird genannt) ·
  **„signifikant schlechter"** (Skill < 0, p_adj < 0,05). Ein Effekt ohne Signifikanz heißt nie „besser". Im Archiv zusätzlich
  **„indikativ"**: n_eff ≤ 12 Ausgabetage.
- Geltungsbereich jeder Zahl: „an Stationspunkten", Stationszahl je Stufe, „Bewölkung nur DE", Hindcast-Provenienz (nie `measured`).

### 2.2 Stufe 1 — FV-H (Hindcast, alle 389 Stationen, 13 Monate, Hash-Auswahl Stride 6)

Läufe: Fit 4′ (Voreinstellungen), Fit 5a′ (`--folds=half`), Fit 5e′ (Flags von Fit 5e) — alle mit `--thin=hash --stride=6
--clima=fit\2026-09-23\clima.hindcast.json`; Scorecard FV-H = `score.mjs` auf 5e′ mit `--thin=hash --stride=6
--refTables=4=<4′>,5a=<5a′>`. Die alten Karten 4/5a/5e sind danach nur Kontext (andere Zeilen), like-for-like sind nur die Paare in FV-H.

- **H1 (5e′ gegen die Tabellen der Scorecard 4):** Paar fl-K gegen fl-K@4, Schicht `all`, je Größe (T, Td, Wind, Böe, Bewölkung, Niederschlag)
  × Bin (6). **Gilt**, wenn (a) keine der 36 Zellen signifikant schlechter ist mit Skill < −1 % und (b) T, Td und Böe in 126–240 h UND 246–336 h
  (6 Zellen) signifikant besser sind. Jede Zelle wird mit ihrem Wort berichtet.
- **H2 (G-FL-1 gegen Rohmodelle und Mittel):** fl-K gegen jedes vorhandene `src:<Modell>` und mmm, Schicht `all`, je Größe × Bin. Eine Zelle
  **besteht**, wenn fl-K gegen JEDE dieser Referenzen signifikant besser ist; H2 **gilt**, wenn alle Zellen bestehen — sonst wird jede
  durchfallende Zelle mit der Referenz genannt, die sie reißt.
- **H3 (gegen den heutigen Cube-Motor):** fl-K gegen cube, je Größe × Bin; **gilt**, wenn jede Zelle signifikant besser ist; Fehlschläge einzeln.
- **H4 (Kalibrierung, G-FL-2):** fl-K, rms-Spread/Skill 0,85–1,20 UND randomisierter PIT-Rand 0,15–0,25 je Größe × Bin (Niederschlag ohne G2:
  Brier-Reliability berichtet). **Gilt**, wenn alle Zellen im Band liegen; jede Abweichung wird mit beiden Zahlen gelistet.
- **H5 (Klimatologie):** die Kreuzungsstunde fl-K gegen die Stationsklimatologie je Größe (Zellen `lead:`) — berichtet, kein Bestehen/Durchfallen.
- **H8 (Schichten):** in keiner Schicht Land (DE, AT, CH; LI = ein Punkt, ausgenommen) oder Höhenband (< / ≥ 800 m) ist fl-K gegen die
  Referenz von H1 (fl-K@4), H2 (mmm) oder H3 (cube) **signifikant schlechter mit Skill < −2 %**; Zellen mit Skill < −2 % ohne Signifikanz werden
  als Hinweis gelistet. **Gilt**, wenn keine Verletzung.
- **Kontext (keine neue Behauptung):** die Regel `fx5` (FX §6.5: T/Td/Böe 246–336 h signifikant besser als fl-K@5a; keine Zelle `all` < −1 %;
  keine Land-/Bandschicht < −2 %) wird auf FV-H wiederholt (`fx4-decision.mjs --rule=fx5`) — hält das FX-5-Verdikt auf 389 statt 65 Stationen?
  Ebenso berichtet: Anspruch B als Tabelle (Region-/Band-Holdout-Skill je Mittelwert-Stratum, `entry.cv.region/band`, MSE — kein CRPS),
  Reliability-Diagramme je Schwelle, `dnn:`-Schichten.

### 2.3 Stufe 2 — FV-A (Archiv, echte Eingaben, 14.–26.09.; indikativ, n_eff ≤ 12 Ausgabetage)

- **H6 (gegen MOSMIX):** product@5e gegen mosmix für T, Td, Wind, Böe in den Bins 0–6, 7–24, 25–48 und 51–120 h, Schicht `all` (Land DE/AT/CH
  berichtet), **CRPS UND MAE**. **Gilt (indikativ)**, wenn in allen 16 Zellen beide Skills > 0 sind und keine Zelle signifikant schlechter ist;
  **gilt nicht**, wenn eine Zelle signifikant schlechter ist; sonst **teilweise** mit Zellliste.
- **H7 (gegen die heutigen Produkte):** product@5e gegen live (Altfelder, MAE; T, Wind, Böe, Bewölkung, Niederschlag), gegen live-fusion (QS3;
  T, Td, Wind, Böe, Bewölkung, Niederschlag) und gegen product@4 (CRPS, alle sechs Größen), je Bin mit Zeilen (live reicht 240 h). Dieselbe Regel
  wie H6 je Referenz (gilt indikativ / gilt nicht / teilweise). Für live zusätzlich die Schicht ohne die Punkte mit |DEM − Station| > 50 m
  (der Live-Pfad rechnet bei 36f2bbb mit dem DEM).
- **Kontext:** product@5e gegen cube, cube-hc, mmm, clima, persist; fl-K@5e gegen cube-hc (die Brücke zu H3 im Hindcast); Spread/Skill und PIT
  von product@5e; 246–336 h nur mit den 2 Ausgabetagen 14./15.09. an 222 Punkten — so benannt.
- **Kontrollen (Erwartung vorab):** L1 volle Tabellen besser als Falten-β auf der Überlappung (sonst ist der Faltenschalter zu prüfen, nicht das
  Ergebnis umzudeuten); L2 wie §1.7; L3 Zeitstempelzählung = 0 außer live.

### 2.9 Präzisierungen nach dem Einfrieren

- **2026-09-27T10:55Z** (vor jeder Scorecard dieser Phase; Grund: beim Bau der Kontrolle bzw. des Anpassers festgelegt, ohne ein
  Ergebnis zu kennen): (1) **L1 operationalisiert:** „volle Tabellen besser" heißt CRPS-Skill (voll gegen Falten-β) > 0 in mehr als der
  Hälfte der Größe × Bin-Zellen der Überlappung mit ≥ 200 Zeilen UND in allen T-Zellen dieser Art; sonst ist der Faltenschalter zu prüfen.
  (2) **Faltenschlüssel für Gültigzeiten nach dem 30.09.** bei Ausgabetag ≤ 21.09. = `2026-09b` (die Falte schließt 1.–30.09. aus; ein
  Schlüssel `2026-10a` hätte keine Falten-β und gäbe die vollen Tabellen = Leck) — `foldKeyFV`, Verifier 16e. (3) **Stationsmember:** die
  heutige Auswahlregel des Clients (`SELECTION`: ≤ 15 km und |Δh| ≤ 100 m, oder ≤ 0,25 km) statt der im Slot gespeicherten Plan-
  Entscheidung (Schema-1-Pläne urteilten mit der DEM-Höhe). (4) H7 gegen live-fusion nur auf Zeilen, an denen live-fusion alle drei
  Quantile trägt; der QS3 des Kandidaten auf denselben Zeilen.
- **2026-09-27T11:45Z — nach FV-A Lauf 1 (Befund V-FV-2), vor Lauf 2:** (5) **L2 präzisiert:** die Kontrolle „−1 h bringt persist bei AT/CH auf
  ≈ 0" gilt genau an den Zeilen, deren Messung bei V − 1 h liegt (23:00); über alle AT-Zeilen mischt sie ältere Messungen, wo 23:00 fehlt
  (Lauf 1: AT 0,051 K). Geprüft wird jetzt: +1 h verschlechtert persist UND an den Zeilen mit Messung bei V − 1 h ist |persist −
  Wahrheit(V − 1 h)| = 0 (Ausrichtungsbeweis). Das ist eine Kontrolle, keine Behauptung; der Lauf-1-Wert wird in §3 berichtet.
  (6) **FV-A Lauf 1 ist ungültig** (V-FV-2: Radarraten des Archivs sind ganzzahlig ×100 kodiert, der Anpasser las sie roh) und wird durch
  Lauf 2 mit der Korrektur ersetzt; die Regeln H6/H7 bleiben unverändert.

## 3 Protokoll

### 3.1 Gebaut (27.09., alles hinter Flags bzw. neue Dateien; nichts unter `src/`)

- `scripts/fusionfit/lib/thin.mjs` — `mix32` (der Mischer von A3), `thinSelect(mode, stride)`, `parseThin`; `legacy` = die alte Regel Bit für Bit.
- `fit.mjs --thin=legacy|hash` (Durchläufe A, B, E; unter `hash` `inputs.thin` + Notiz, sonst byte-gleich);
  `score.mjs --thin=legacy|hash`, `--mdReliability=1` (Reliability-Diagramme je Schwelle × Bin für fl-K, Referenztabellen, cube),
  `--mdHoldout=1` (Region-/Band-Holdout-Skill je Form-K-Mittelwert-Stratum, alle Tabellen der Karte); `inputs.thin` nur unter `hash`.
- `scripts/fusionfit/lib/archiveAdapter.mjs` (neu; `slotAdapter.mjs` unberührt): Reihen, Station (heutige `SELECTION`), Nowcast, Wahrheit
  je Netz des Hindcasts, Anker-Messung ≤ slotAt, `foldKeyFV` (Faltenregel §1.7/§2.9), `losoClimaProduct` (LOSO-μ_c als Ein-Stations-Produkt),
  Live-Pfad; `lib/distScore.mjs` (die Score-Definitionen von `score.mjs` + QS3); `scripts/fusionfit/score-archive.mjs` (Stufe 2).
- `audit/fusion-validierung/{diag-fv0,diag-fv0-thin,fv-decision,fv-bytes-check}.mjs`.
- `scripts/verify-fusion-fit.mjs` **Block 15** (15a–c: `legacy` = alte Regel an 648 000 Schlüsseln; Hash hält 389/389 Stationen je Stufe bei
  Stride 6/12, Negativkontrollen alte Regel 65/130 und naives Produkt/XOR (t3 195/389); beide Skripte wählen nur über `thin.mjs`) und
  **Block 16** (16a–g: Reihe mit Slot-Skalen gegen fremde Skala; Stationsregel inkl. Schema-1-Höhe; Wahrheitsnetz AT = TAWES, die POI-Reihe
  des AT-Punkts nie gelesen; Anker nie nach dem Slot; Faltenregel mit Oktober-Deckel gegen die naive Regel `2026-10a`; LOSO-Produkt gibt den
  LOSO-Vektor exakt zurück gegen die eigene Klimatologie; Score-Definitionen = `dist.ts`-Primitive, QS3 eigentlich) — **114/114**.
- **Byte-Gleichheit auf echten Fallzeilen** (`fit\fv-bytes.sh`, Zwei-Monats-Rauchfit 2026-07/08, Stride 48, nmin 200/1; HEAD-Kopien
  `fit.head.tmp.mjs`/`score.head.tmp.mjs` im selben Ordner, danach gelöscht): `fusion.hindcast.json` 1 668 307 B und `fusion.client.json`
  **identisch bis auf `builtAt`** (1 663 547 B), `fusion.client.json` ebenso (75 305 B); Scorecard (2026-08, Stride 48) JSON 6 399 291 B
  identisch bis auf `builtAt`/`codeHash`, Markdown identisch bis auf die Kopfzeile; Positivkontrolle `--thin=hash`: Fit 1 658 705 B, Karte
  anders (138 584 statt 138 552 bewertete Zeilen), `inputs.thin`, Reliability- und Holdout-Abschnitt vorhanden (`fv-bytes-check.mjs`, 7/7).

### 3.2 Läufe (Kette `C:\dev\buscosun-hindcast\fit\fv-chain.sh`, Log `fit\fv-chain.log`, gestartet 27.09. ≈ 11:13 UTC, vom Werkzeugprozess gelöst)

Reihenfolge: FV-A (Archiv, bestehende Tabellen Fit 5e und Fit 4) → Entscheidung Stufe 2 → Fit 4′ → Fit 5a′ → Fit 5e′ → `fx5-negcheck` 5e′ gegen
5a′ → Scorecard FV-H → Entscheidung Stufe 1 → `compare.mjs` (Kontext). Ein Prozess zur Zeit.

| Schritt | Zeit (UTC, 27.09.) | Ergebnis |
|---|---|---|
| FV-A Lauf 1 | 11:12–11:27 | **ungültig** (V-FV-2, Radarraten roh gelesen) — `score\2026-09-27-fv-a-run1-void`, `fv-decision-a-run1-void.md` |
| Fit 4′ (Voreinstellungen, `--thin=hash`) | 11:27–12:44 (77 min) | `fit\2026-09-27-fv-4h` (sha256 97bec8cb…) |
| Fit 5a′ (`--folds=half --thin=hash`) | 12:44–13:41 (56 min) | `fit\2026-09-27-fv-5ah` (21553e78…) |
| Fit 5e′ (Flags von 5e, `--thin=hash`) | 13:41–15:22 (101 min) | `fit\2026-09-27-fv-5eh` |
| `fx5-negcheck` 5e′ gegen 5a′ | 15:22 | **bestanden**: 180 Mittelwert- und 121 Varianz-Strata von u/v/Bewölkung/Niederschlag byte-gleich, 112 gelistete Strata mit μ_c-Spalte |
| Scorecard FV-H | 15:22–17:45 (143 min) | `score\2026-09-27-fv-h`: **6 802 581** bewertete Zeilen von 40 824 885 (Hash, Stride 6), 14 465 Zellen, 12 778 Paare, BH über die Karte; Reliability- und Holdout-Abschnitt im Markdown |
| Entscheidung Stufe 1 | 17:45 | `fv-decision-h.md` |
| FV-A Lauf 2 (Radar dekodiert, L2 exakt) | 17:45–17:56 (11 min) | `score\2026-09-27-fv-a`: **294 835** Zeilen (je Bin 25 332 · 77 550 · 87 788 · 71 670 · 30 275 · 2 220), 4 723 Punkt-Slots, 21 892 Motorläufe, 0 Motorfehler, 5 206 DM-Tests; `fv-decision-a.md` |

FV-A Lauf 2 unterscheidet sich von Lauf 1 nur beim Niederschlag (0–6 h: product@5e gegen live −160 %! → **+35 %***) und in L2 (exakte Form);
T/Td/Wind/Böe/Bewölkung sind byte-gleich — der Nowcast trägt nur Niederschlag. Stationsmember an 4 723/4 723 Punkt-Slots (heutige `SELECTION`),
Anker-Messung ≤ slotAt an 4 680 (43 ohne); **Anker tatsächlich gesetzt: DE 202 von 2 639 Läufen (die POI-Messung 23:00 erscheint erst nach dem
Slot), AT 756/950, CH 1 082/1 134** (V-FV-7).

**Gates (Maschine frei, 27.09. 18:40–19:05 UTC):** typecheck grün · `verify:fusion-fit` **115/115** (Blöcke 15/16 neu, 16h nach V-FV-2) ·
`verify:calib-fit` 14/14 · `verify:pv-fusion` 229/229 · `verify:pv-cube` **320/320** · `verify:point-client` **167/167** · Build **241/241** ·
Budget eagerJs 107,9, largestChunk 301,2, **totalJs 1 447,6 KB > 1 438** (unverändert seit FX-5 — diese Phase hat unter `src/` nichts geändert,
`git status -- src/` leer; E-FL-11 bleibt Jans Ratsche).

## 4 Verdikt je Behauptung

Gerechnet von `fv-decision.mjs` nach §2 (vollständige Tabellen: `fusion-validierung/fv-decision-h.md`, `fv-decision-a.md`). Skill = CRPS-Skill
auf identischen Zeilen, * signifikant besser, ! signifikant schlechter (DM auf Tagesmitteln, BH über die ganze Karte).

### 4.1 Stufe 1 — FV-H (Hindcast, an Stationspunkten, alle 389 Stationen, 13 Monate, Provenienz `hindcast`)

| Behauptung | Verdikt | Beleg |
|---|---|---|
| **H1** 5e′ gegen die Tabellen der Scorecard 4 | **GILT NICHT (knapp)** | 24 von 33 Zellen signifikant besser, 9 gleichauf, **keine schlechter** — (a) erfüllt. (b) verletzt an genau einer Zelle: **Td 126–240 h +1,4 % (n.s.)**. Langes Ende T +8,3 %*, Td +11,3 %*, Böe +5,1 %* (246–336 h); Wind +0,7…+1,8 %* in jedem Bin; Bewölkung 25–48/51–120 h +2,5/+1,4 %*, sonst gleichauf; Niederschlag 51–120 h +0,7 %*, sonst gleichauf oder ohne Zeile (Hürde `no-skill` ⇒ fl-K ohne Niederschlag bei 25–48 h) |
| **H2** gegen jedes Rohmodell und das Mittel (G-FL-1) | **GILT** | jede Zelle gegen jedes `src:*` und mmm signifikant besser |
| **H3** gegen den heutigen Cube-Motor | **GILT NICHT (knapp)** | T +8…+23 %*, Td +11…+22 %*, Wind +9…+27 %*, Böe +13…+19 %*, Bewölkung +12…+16 %*; Niederschlag 7–24 h −0,1 % und 246–336 h +0,3 % gleichauf (n.s.) — die zwei durchfallenden Zellen |
| **H4** Kalibrierung (G-FL-2) | **GILT NICHT** | 8 Zellen außerhalb: **Bewölkung in allen sechs Bins** (rms-S/S 0,87–0,96 im Band, PIT-Rand 0,26–0,30 zu hoch — die Masse bei 0/100 % wird nicht erreicht, V-FX-15), Böe 25–48 h (PIT 0,145) und 246–336 h (0,143) knapp unter 0,15; T/Td/Wind in jedem Bin im Band |
| **H5** Kreuzung gegen die Stationsklimatologie | berichtet | **T 312 h · Td 294 h · Wind 126 h · Böe 162 h** · Bewölkung/Niederschlag keine. 246–336 h: T fl-K 2,164 gegen Klima 2,194 (+1,4 %), Wind 1,073 gegen 0,962 (**−11,5 %**) |
| **H8** keine Schicht (DE/AT/CH/Band) signifikant < −2 % gegen fl-K@4/mmm/cube | **GILT** | keine Verletzung, kein Hinweis |
| Kontext: Regel fx5 (5e′ gegen 5a′) | **erfüllt** | T/Td/Böe 246–336 h signifikant besser, keine Zelle < −1 %, Bewölkung/Niederschlag exakt 0,0 %, keine Schicht < −2 % — das FX-5-Verdikt hält auf 389 statt 65 Stationen |
| Kontext: Route 1 (die Route des Clients) | berichtet | 51–336 h trägt Route 1 ≈ ¼ der Zeilen (T 246–336 h: 171 050 gegen 594 618); Skill-Muster ähnlich (T 246–336 h gegen fl-K@4 +7,3 %* r1 / +8,5 %* r3), gegen Klima bei Wind und Böe in Route 1 schlechter (Wind 246–336 h −14,4 %! gegen −10,8 %!) |

**Lesart Stufe 1:** Die Lernstufe ist an Stationspunkten die beste Form, die buscosun Fusion heute kennt — besser als jedes Rohmodell, das Mittel und
der heutige Motor in praktisch jeder Zelle, bei Schichten ohne Einbruch, mit einer Kalibrierlücke bei der Bewölkung. Die zwei „gilt nicht" der Regeln
H1/H3 hängen an je einer bzw. zwei Zellen nahe null. Beim Wind bleibt sie ab 126 h hinter der Stationsklimatologie (bis −11,5 %).

### 4.2 Stufe 2 — FV-A (Archiv 14.–26.09., echte Eingaben, an MOSMIX-Stationen; indikativ, n_eff ≤ 12 Ausgabetage)

| Behauptung | Verdikt | Beleg |
|---|---|---|
| **H6** product@5e gegen MOSMIX-L | **GILT NICHT** | **CRPS** gegen MOSMIX-MAE signifikant besser in 13 von 16 Zellen (T +14…+21 %*, Td +20…+31 %*, Wind 0–24 h +11/+13 %*, Böe 0–48 h +9…+18 %*; Wind 25–120 h, Böe 51–120 h n.s.), **Punkt-MAE signifikant schlechter in 13 von 16**: T −8,6…−18,9 %!, Wind −25,5…−34,3 %!, Böe −11,5…−27,2 %!, Td 25–48 h −8,0 %! (Td 51–120 h +6,8 %*). DE/AT/CH gleiches Bild, AT beim CRPS am stärksten |
| **H7** gegen live (Altfelder, MAE) | **GILT NICHT** | T −4,8…−11,6 %!, Wind −16,6…−32,1 %!, Böe −10,3…−28,8 %!, Bewölkung 0–120 h −10,8…−18,0 %!; **Niederschlag +23…+35 %*** (0–120 h). Ohne die 31 Punkte mit DEM-Abweichung (Schicht `lelev:ok`) dasselbe Bild |
| **H7** gegen live-fusion (QS3) | **GILT NICHT** | T −7,7…−20,7 %!, Bewölkung −11,1…−14,4 %!; **Wind +9…+44 %***, **Böe +6…+12 %***, Td 51–240 h +24/+35 %*; Niederschlag gleichauf |
| **H7** gegen product@4 (dieselbe Kette mit den Tabellen der Scorecard 4) | **GILT NICHT** | Böe −1,7…−14,9 %! (126–240 h), Td 0–48 h −1,4…−2,7 %!, T 25–48 h −2,1 %!; T 0–6/126–240 h +1,3/+5,0 %*, Td 51–120 h +1,9 %*, Wind 25–120 h +0,5/+2,3 %*; Bewölkung/Niederschlag ≈ 0 |
| Kontext: product@5e gegen cube (heutiger Cube-Pfad) | berichtet | T −1,3…−12,4 %! (die Lernstufe kostet in der Kette), Wind +8…+18 %*, Böe 0–24 h +3/+5 %*, 51–240 h −5/−11 %!, **Bewölkung −4…−6 %!** |
| Kontext: fl-K@5e (Lernstufe allein) gegen cube-hc | berichtet | Wind +16…+27 %*, Böe +4…+15 %*, **Bewölkung +11…+17 %***, Td +7…+17 %*, T 25–120 h +6/+14 %* — die Brücke zu H3 hält im Archiv |
| **L1** volle Tabellen gegen Falten-β | **nicht bestanden** | 19/30 Zellen positiv (Wind, Böe, Bewölkung durchweg), aber T 0–6 h −0,7 %! und T 7–24 h −1,1 % — s. V-FV-8 |
| **L2** Zeitausrichtung | **bestanden** | persist T Vorlauf 1: 0,816 K; gegen +1 h 1,167 K; an 1 649 Zeilen mit Messung bei V − 1 h \|persist − Wahrheit(V − 1 h)\| max **0,000000** |
| **L3** kein Eingang nach slotAt | **bestanden** | Cube 0, Station 0, Nowcast 0, Messung 0; live 5–17 min danach (benannt) |

**Lesart Stufe 2:** Die volle Client-Kette ist als Verteilung besser als MOSMIX, aber ihr Punktwert ist an MOSMIX-Stationen deutlich schlechter als MOSMIX
selbst und bei T/Wind/Böe/Bewölkung schlechter als das heutige Live-Produkt. Die Lernstufe allein gewinnt im Archiv wie im Hindcast (fl-K@5e gegen
cube-hc); **die Kette verwässert sie** — besonders sichtbar bei der Bewölkung (0–6 h: fl-K@5e CRPS 14,1, product@5e 18,5, PIT-Rand 0,66) und beim Punktwert
von T und Wind, wo die gesetzten Member-Gewichte MOSMIX an seiner eigenen Station zu wenig Gewicht geben (V-FV-6). Einschränkungen: 12 Ausgabetage im
September, alle Punkte sind MOSMIX-Stationen (Abstand p50 0 km — MOSMIX' Heimspiel; die Frage „stationsloser Punkt" ist nicht gemessen, E-FV-1),
DE fast ohne Anker, PAP 3 nur mit der nächsten Zelle.

## 5 Befunde (V-FV-NN — Mehrwert und Skizze)

- **V-FV-1 — Der Client rechnet immer Route 1; deren Strata sind bei 51–336 h nur auf dem Sommer 2026 gefittet.** `cubeSource.ts` setzt
  `route: 1` (Lauf-Route); in Fit 5e tragen `K|t|3..5|r1` 579 128 / 229 374 / 174 209 Zeilen an **95 / 92 / 87 Tagen (17.06.–21.09.)**, die
  Route-3-Strata (dyn, ganzjährig) 1,80 M / 0,75 M / 0,60 M Zeilen an **289 Tagen** — und die Schicht `all` jeder Hindcast-Karte besteht in
  51–336 h zu ≈ ¾ aus Route-3-Zeilen, die der Client nie rechnet. *Mehrwert:* die Langfrist-Zahlen der Scorecards beschreiben nicht die Tabellen,
  die der Browser benutzt; im Winter rechnet der Client mit Sommer-Strata. *Skizze:* (a) Scorecards berichten `route:1` neben `all` (FV-H:
  Kontexttabelle in `fv-decision-h.md`); (b) der Client nimmt bei t2/t3 die Route-3-Strata (ganzjährig), solange Route 1 < 1 Jahr trägt —
  eine Zeile in `cubeSource.ts` (Motor-Berührung ⇒ Jans Gate); (c) Winter-Nachfit (E-FL-3) schließt die Lücke von selbst erst im Sommer 2027.
- **V-FV-2 — Bewertungsfehler, gefunden und behoben: Radarraten des Archivs sind ganzzahlig kodiert.** `nowcast.scale.mmh` = 0,01 mm/h (16 =
  0,16 mm/h, Maximum 1 859 = 18,6 mm/h); `archiveAdapter.mjs` las die Frames in FV-A Lauf 1 roh ⇒ jede Kette mit Nowcast-Member war bei 0–3 h
  100× zu nass (Niederschlag 0–6 h CRPS 0,130 gegen 0,034 ohne Nowcast). Lauf 1 ist ungültig (`score\2026-09-27-fv-a-run1-void`,
  `fv-decision-a-run1-void.md`), Lauf 2 dekodiert mit der Skala des Slots und bricht ohne Skala ab (Verifier 16h mit Negativkontrolle). *Mehrwert:*
  kein Archiv-Leser liest eine Spalte ohne ihre Kopf-Skala. *Skizze:* AP9-Scorer und jeder künftige Leser übernehmen `archiveAdapter.mjs` statt
  eigener Dekodierung; `parseSlot` könnte die Dekodierung zentral anbieten (AP9s Datei — Vorschlag, nicht angefasst).
- **V-FV-3 — V-FX-44 bestätigt und behoben (Flag):** die alte Zeilenauswahl hält über alle 13 Monate t1 389, t2 **130**, t3 **65** von 389 Stationen;
  `--thin=hash` hält 389/389 in jeder Stufe bei gleichem Zeilenanteil (§1.3). Ohne Flag byte-gleich (§3.1). *Skizze:* Hash als Voreinstellung erst
  nach Jans Entscheidung (jede alte Karte wäre danach nicht mehr reproduzierbar ohne Flag).
- **V-FV-4 — Das MOSMIX-Stationsprodukt trägt keine Wahrscheinlichkeiten.** Belegt sind t2m, td2m, u10, v10, gust, precip, clct, clcl/m/h, hModEff,
  srcCount — kein PoP (wwP, R101 …) ⇒ MOSMIX nur deterministisch bewertbar, keine Brier-Zahl gegen MOSMIX. *Skizze:* R101/R105/R110/wwP ins
  Stationsprodukt (Producer, Jans Gate) — dann Brier/Reliability gegen MOSMIX im Archiv.
- **V-FV-5 — Schema-1-Slots nennen für 17 Nachbarpunkte ein falsches Land** (06120 „CH" statt DK …; PA1). Die Bewertung liest Land/Band/Höhe
  aus der Merkmalstabelle. *Skizze:* AP9-Leser ebenso (Zuständigkeit AP9, nur benannt).
- **V-FV-6 — Die Motor-Kette verwässert die Lernstufe (A6 erstmals gemessen, V-FX-9).** Im Archiv gewinnt fl-K@5e (Lernstufe allein) gegen den Motor
  ohne Station deutlich (Bewölkung +11…+17 %*, Wind +16…+27 %*), die volle Kette product@5e verliert davon viel: Bewölkung 0–6 h CRPS 18,5 gegen 14,1
  (fl-K@5e) und 17,0 (cube-hc), PIT-Rand 0,66, rms-S/S 0,54 (zu schmal und zu weit weg von den Atomen); T/Wind-Punktwert an der Station schlechter als
  MOSMIX allein (T-MAE 0,98 gegen 0,82 K, Wind 0,85 gegen 0,68 m/s bei 0–6 h). Mechanismus (Stand des Codes, nicht einzeln gemessen): `fuseHour`
  kombiniert gelerntes Member und MOSMIX mit GESETZTEN σ (MOSMIX: V-A₁-Boden + Skill-Prior, `stationSigma:set`) und schrumpft zur Klimatologie
  (`ClimaField`); die Bewölkung wird als zensierte Normal nachfusioniert. *Mehrwert:* das ist der größte Hebel zwischen „gute Lernstufe" und „gutes
  Produkt". *Skizze:* (a) σ bzw. Gewichte von MOSMIX- und gelerntem Member aus dem Archiv fitten (FL-AP6), sobald ≥ 30 Ausgabetage je Bin da sind;
  (b) bis dahin für Bewölkung die gelernte Verteilung durchreichen statt nachzufusionieren; (c) jede Änderung zuerst mit `score-archive.mjs` gegen
  product@5e messen — alles Motor ⇒ Jans Gate (E-FV-2).
- **V-FV-7 — Im Archiv ankert DE fast nie:** 202 von 2 639 DE-Läufen mit Anker (AT 756/950, CH 1 082/1 134) — die POI-Messung 23:00 erscheint
  erst nach dem 23:20-Slot, 22:00 liegt vor dem Fenster (der Client verwirft sie genauso). Die DE-Zahlen 0–6 h der Kette sind damit ohne Anker
  gerechnet; im Browser liefert BrightSky meist eine frischere Messung. *Skizze:* AP9 archiviert die BrightSky-Messung zur Slotzeit (Schema 4) — dann
  ist der DE-Anker nachstellbar.
- **V-FV-8 — L1 nicht bestanden: der In-sample-Vorteil des Hindcast-Fits überträgt sich nicht vollständig auf den echten Cube.** Die Umschaltung
  wirkt technisch (Route-1-Strata: β der Falte `2026-09b` gegen volle β relativ p50 18,5 %, min 4,8 %, max 138 %; product@5e und product@5e-full
  unterscheiden sich in jeder Zelle); die vollen Tabellen, die die Wahrheit 1.–21.09. gesehen haben, sind auf der Überlappung bei Wind, Böe und Bewölkung
  besser (19/30 Zellen), bei T 0–24 h und Td 0–6 h aber schlechter. Lesart: Hindcast-Cube (Open-Meteo-Rekonstruktion) und echter Cube sind verschiedene
  Eingaben; was der Fit an Tagesrauschen des Hindcasts lernt, hilft auf dem echten Cube nicht. *Mehrwert:* Hindcast-Scorecards sind eine Obergrenze für
  das Produkt, keine Vorhersage seiner Güte. *Skizze:* Nachfit bzw. Rekalibrierung am Archiv (Schema 4, AP9), sobald es trägt.
- **V-FV-9 — Fit 5e ist in der Kette nicht besser als die Tabellen der Scorecard 4** (Böe −1,7…−14,9 %!, Td 0–48 h −1,4…−2,7 %!), obwohl im Hindcast 5e′
  gegen 4′ in 24/33 Zellen gewinnt und in keiner verliert. Ursache ungeklärt; Kandidaten: die LOSO-μ_c-Spalte auf dem echten Cube (Route-1-Strata mit
  87–95 Sommertagen), das Speed-Gesetz v4 in der Kette nach `fuseHour`, 7 Ausgabetage bei 126–240 h. *Skizze:* dieselbe Archivkarte mit 5e ohne μ_c-Produkt
  (Größen `absent`) und mit 5a-Tabellen — trennt Klimatologie, Gesetz und Falten.
- **V-FV-10 — Bewölkung bleibt in jedem Bin unkalibriert (H4):** rms-S/S 0,87–0,96 (gut), PIT-Rand 0,26–0,30 — die bimodale Wahrheit (57 % bei 0/100 %)
  wird von der zensierten Normal nicht getroffen (V-FX-15). *Skizze:* Zwei-Atome-Familie (Codec/`dist.ts` ⇒ Jans Gate) oder RPS auf Oktas.
- **V-FV-11 — Werkzeug: die Scorer-Zeile „N Halbmonatsgruppen je Zeile" zählt seit FX-4 Tabellenobjekte, nicht Gruppen** (FV-H: „3" = Haupt- + 2 Referenztabellen).
  Kosmetisch, die Faltenwahl selbst ist richtig (Verifier 11/16e). *Skizze:* Zähler über alle Schlüssel der Caches summieren.

## 6 Entscheidungen für Jan (E-FV-NN, auch in `MANUELLE-SCHRITTE.md` §23)

- **E-FV-1 Stationsloser Punkt gegen MOSMIX messen (H6b, nachträglich):** H6 ist an MOSMIX-Stationen gemessen (Heimspiel, Abstand p50 0 km). Die
  Produktfrage „besser als MOSMIX irgendwo in DACH" braucht Leave-Station-out: Wahrheit an A, MOSMIX von der nächsten ANDEREN Station B
  (höhenkorrigiert), das Produkt ohne A's eigene MOSMIX-Reihe (Stationsmember B nur nach `SELECTION`). Mit vorhandenen Archivdaten ≈ 15 min. Wird als
  nachträglich formulierte Behauptung mit eigenem Zeitstempel eingetragen; H6 bleibt „gilt nicht (an Stationen)".
- **E-FV-2 Keine Lernstufe im Produkt vor der Gewichtsfrage (Empfehlung):** E-FX-10/11 (Tabelle + Klimatologieprodukt kopieren, `learnedSource`/
  `climaSource` hinter `?pf=cube` einschalten) **jetzt nicht** — die Kette ist im Punktwert schlechter als live und MOSMIX (§4.2). Zuerst V-FV-6 (a)/(b)
  (Motor), dann erneut mit `score-archive.mjs` messen. Dein Gate.
- **E-FV-3 Route im Client (V-FV-1):** t2/t3 mit den ganzjährigen Route-3-Strata statt Route 1 (Sommer 2026) — eine Zeile in `cubeSource.ts` (Motor).
- **E-FV-4 `--thin=hash` als Voreinstellung (V-FV-3)?** Dann sind alle alten Karten nur noch mit `--thin=legacy` reproduzierbar; FV-H ist die neue
  Referenz (4′/5a′/5e′ liegen vor).
- **E-FV-5 Publisher-Kandidat:** Hindcast sagt 5e′ > 4′ (H1 knapp nicht erfüllt, keine Zelle schlechter), die Archiv-Kette sagt 5e ≤ 4 (V-FV-9) — kein
  Wechsel der Client-Tabelle, bis V-FV-9 geklärt ist und das Archiv ≥ 30 Ausgabetage je Bin trägt (≈ Ende Oktober für 0–48 h).
- **E-FL-11 totalJs** unverändert 1 447,6 KB (diese Phase: 0 Byte).
