# CLAUDE.md — buscosun: Projekt-Verfassung für Claude-Code-Agenten

> **Stand: 2026-09-30.** Dieser Block trägt nur den AKTUELLEN Stand. Die Chronik der Phasen bis
> hierher liegt wortgleich in `audit/chronik-statusblock-2026-09-16.md` (ausgelagert am 16.09., weil der
> Statusblock zur Chronik geworden war) und je Linie in `audit/<thema>.md`.

## Aktueller Stand

**Phase FI — buscosun Fusion auf dem Punkt-Cube, 0–336 h, Antwort < 2 s** (`audit/fusion-implementierung.md`;
Plan von Jan freigegeben 16.09., Entscheidungen E-F-1…10 in §7.4). Architektur: **Integration** — der Cube
ist Hauptmember der bestehenden Fusion (`src/pointForecast/fusion/`, combine/dist/anchor bleiben); Zeitachse
109 native Cube-Schritte + markierte Interpolation; Gelände zur Laufzeit am Punkt, kein Terrain-Produkt im
Daten-Repo (307 MiB, kein Platz).

| Etappe | Stand | Beleg (Phasendokument) |
|---|---|---|
| AP0 Messbasis | fertig | §9.0 — Harness `verify:pv-latency` (esbuild-Lab + CDP, App-Bundle unberührt); heutiger Leser 3,0 s Desktop / 13,6 s Mobil-4G / 38,9 s 3G; kalter Chunk-TTFB p90 2,6 s |
| AP1 paralleler Leser | fertig, Gate grün | §9.2 — `readPointBundle` (`src/point/client/readPoint.ts`), IndexedDB-Cache je Pfadregel, Worker-Pool, Zwei-Skalen-DEM z11 + z8, Chunk-Adresse aus dem Index, `run.json@commit` nur für Provenienz, raw-Ausweichweg mit 2,5-s-Hedge; Kern warm 168 ms Desktop / 325 ms Mobil-4G, kalt 0,8–1,5 s / 2,2–2,3 s (bytes-gebunden); `verify:point-client` 112/112 |
| AP-PA2 AT/CH-Archivpunkte | fertig | §9.3 — Position = Messstelle, `rr1h` Stundensumme; seit PA3 **405 Punkte** (DE 203, AT 84, CH 101, LI 1, Nachbarn 16 — 5 leere POI-Stationen entfernt) |
| AP-PA3 Archiv-Befunde des Experten | **fertig (uncommitted), Push = Jans Gate vor 23:10 UTC** | §9.12 — 17 Befunde geprüft, 11 behoben: Schema **2** (Historie in `punktarchiv.mjs`, Schema 1 lesbar), Plan mit Stationshöhe (10 Gipfelstationen nahmen sich selbst nicht an), RV-Abdeckung als **Standortregel** 150 km um 17 DWD-Standorte (`sourceMatrix.ts`, an der rohen NaN-Maske gemessen: 99,53 %; der Kasten bis 14,1 °E lag an 36/410 Punkten falsch), Wahrheitsfenster ab Stundenboden (die 23-UTC-Stunde fehlte täglich), TAWES/SMN aus eigenen 10-min-Spalten + `fxh`, `ageAtSlotH`, `stepsCoverage`, `skipped`/`assignedAbsent`, Nowcast „außerhalb des Rasters" benannt, `stats.warnings`, `pointsFrom.rules`, `live.axis`; `toSegments` lückenlos (`resolve.ts`). **Jans Entscheidungen 17.09. umgesetzt (§9.12.5):** V-FI-25 MOSMIX-Taupunkt in die Live-Fusion (`sampleSources.ts`; gemessen 0/240 statt ~230/240 Klimatologie-Stunden an DE-Punkten) und V-FI-26 SMN-Böenspalte `fkl010z1` — **eigener Commit 2**; E-F-11 DE-Profil für DK/NL/BE/LU; E-F-12 Stationshöhe als h_true bei ≤ 250 m (`SELECTION.stationAtPointKm`, `elevationFrom`, `hTrue:station`). Gates: `verify:punktarchiv` **103/103**, `verify:point-data` **974/974**, `verify:point-client` **118/118**, `verify:pv-cube` **204/204**, `verify:pv-fusion` **227/227**, Build 241/241, Budget unverändert |
| AP-PA4 zweiter Expertenbericht (Slot 21.09.) | **fertig (uncommitted), Push = Jans Gate vor 23:10 UTC** | §9.17 — 19 Befunde geprüft, alle bestätigt oder erklärt; **Archiv-Schema 3**: Live-Pfad läuft zuerst + `live.asOf` (Ausgabezeit = Abrufzeit, Stunde 0 = Analyse), `finishedAt`, `elevationM: points[].elev` an beiden Live-Aufrufen (V-FI-24 erledigt, Reihenbruch am codeHash), `live.fusion` spaltenweise (**Slot 17,8 → 10,7 MB gz**, Rundweg exakt), `truth.*.ps` Stationsdruck (TAWES `PRED` ist an Bergstationen auf 1 500/3 000 m reduziert — gemessen; SMN QFF an 56/102 leer), Plan-Achse 56 statt 57 Schritte, `stations.nearest` (Zell am See), `stations.mapped/absent`, `cube.notes` (Bezugshöhe, gammaEff-Vorzeichen, Rate), `hmodel.absentBySlot`, `live.products/keys`, Caveats aktuell. **Nicht geändert, Jans Gate:** V-FI-104 Sägezahn im Producer-Mix (bleibt nach Höhenreduktion: 0,76 gegen 0,33 K), V-FI-105 CLAEF/AICON ohne Höhe ⇒ `hModEff` zu hoch, V-FI-106 t1-Quantile fremd, **V-FI-107 Wind-Drift im Motor** (Rice-Mittel σ√(π/2) ⇒ 5,1 m/s bei 150–240 h, Live UND Cube), V-FI-108 Einzelquellen. `verify:punktarchiv` **125/125**; AP9-Kickoff baut Schema 4 |
| AP12a Purge + Warm-up im Publisher | fertig, Abnahme (b) offen | §9.4 — `scripts/point/cdnSync.mjs`: jede geänderte Datei purgen (run.json zuerst), Index-Frischeprüfung, Warm-up mit 403/Frist als Fehlschlag, Budget je Job (Regel F); `verify:point-data` 969/969 |
| AP2–AP8 Algorithmus | **fertig (uncommitted), Desktop-Gate grün, Mobil-4G rot** | §9.5–§9.11 — `src/pointForecast/cubeSource.ts` hinter `pointSource: 'cube'` (Registrierung statt Import ⇒ App-Bundle unverändert, eagerJs 107,9), `fusion/{vertical,grid,uncertainty,terrainTerms,output}.ts`; `fuseCubePoint` = reine Funktion (Bündel, calib, nowMs, options): PAP 3 (2×2-Block, Nachbarn aus demselben Chunk) · PAP 4 (Fall A/B/C, Γ_inv-Deckel V-FI-15) · PAP 6 (σ_ens/σ_div/sys-only ⊕ Quantisierung ⊕ Höhenrest, Konfidenz-Score) · PAP 5 (Geometrie, Terme inaktiv bis A/A_uhi gemessen) · AP7 (Anker aus Messungen mit Frist, Radar-Flags `nowcastFallbackModel`/`stale`, Klimatologie-Schwanz, stündliche Achse: Station füllt, sonst markierte Interpolation, Nähte ungeglättet) · AP8 (`PointForecastV2`: je Stunde je Größe p10/p50/p90/σ, Verteilung, σ-Art, Konfidenz, Member mit Gewicht, Setzungen — Live-Pfad byte-gleich, `verify:pv-fusion` 222/222). Motor nur additiv angefasst (`errorSigma`, `cloudTotal`, lesender Hook `onWeights`). Gates: `verify:pv-cube` **201/201** (13 Blöcke, in CI), `verify:point-client` 112/112, Build 241/241, Budget unverändert. Lab (`--gate`, 4 Orte): **Desktop kalt p50 ≈ 1,0 s / p95 1,9 s, warm 0,4 s — §6 grün; Mobil-4G kalt 2,5 s — rot, Kern allein 2,1–2,4 s (bytes ⇒ AP12)**. Fristen (set): progressive Produkte 1 800 ms ab Start, Obs 1 500 ms + 500 ms Gnade. **Keine Genauigkeitsaussage** (kein Backtest) — Vergleich Cube gegen Live-Pfad an 10 Orten in §9.5.4 (T 57/100 innerhalb 0,5 K, Flachland 29/30; Bergorte: Station trägt, V-FI-13) |
| AP12 Mobil-Härtung | **fertig (uncommitted), Gate grün (Jan 18.09.: erste Darstellung zählt)** | §9.14 — V-FI-40 (Frist/Hedge: auf 3G kam t1 nie an), progressive Ausgabe `onUpdate` (erste Antwort ab dem Kern, V-FI-22), t1 zuerst (E-F-3), Rechnung/Ausgabe schneller (byte-gleich), Index-SWR; Ebenen-Bereiche gebaut, **aus** (V-FI-42). Gleicher Tag: Mobil-4G kalt 2 518 → **erste Darstellung 1 812** / ganzes Fenster 2 478 ms, warm 1 310 → **193** ms; Desktop kalt 1 655 → 779; 3G jetzt vollständig. `verify:pv-cube` 230/230, `verify:point-client` 129/129 |
| AP11 Punkt-Panel hinter `?pf=cube` | **fertig (uncommitted), Gate grün** | §9.15 — `PointForecastPanel` lädt mit `?pf=cube` den Cube-Pfad per dynamischem Import (336 h, `onUpdate`), neuer Tab „Bandbreite" (`PointForecastBands.tsx`, Lazy-Chunk: p10–p90/p50, Flags, Klimatologie-Schwanz, Member/Konfidenz, Setzungen, „vorläufige Bandbreite"), `?pflog=1` Zeiten/Herkunft; Voreinstellung live. Ohne Schalter Desktop + Mobil pixelgleich in allen drei Tabs; eagerJs 107,9 unverändert, totalJs 1 424,1 (Grenze 1 372 → 1 430, alles lazy, `cubeSource` 47,2 KB). `verify:point-client` 132/132. Offen: Real-Device (V-FI-50), sichtbar nur mit `?startnow=0` (V-FI-53) |
| Befunde V-FI-21 · 17 · 24 · 11 | **fertig (uncommitted)** | §9.16 — Kodierer `fusion/v2codec.ts` (v2 1 156 → **34 KB gz** je Punkt stündlich, Rundweg exakt bis auf Verteilungs-/Ankerzahlen ≤ ½ Schritt; Archiv +13,5 MiB/Slot stündlich, +6,6 nur nativ = Jans Entscheidung V-FI-55); z0 aus WorldCover (`point/client/z0Point.ts`) schaltet die zweistufige Windkorrektur des Cube-Pfads ein (nur mit `CubeIo.z0`, Browser an; Mobil-4G ohne Regression, z0 als eigene späte Ausgabe); `getPointForecast({ elevationM })` im Live-Pfad (Sammler-Zeile = AP9); V-FI-11 Ursache: BrightSky-Fallbackwerte (Garmisch an der Zugspitze) — Leser `sources/brightSkyCurrent.ts` behoben = **Commit B, ändert das Live-Produkt**. Gates: `verify:point-client` 136/136, `verify:pv-cube` 246/246, `verify:pv-fusion` 229/229, `verify:punktarchiv` 103/103, Build 241/241, totalJs 1 427,6 / 1 430 |
| AP9 Backtest | **startet parallel** (eigene Session, Kickoff `prompt.md` vom 18.09., am 22.09. auf Schema 4 angepasst) | Sammler → Archiv-Schema 4 (3 = PA4): Cube-Pfad kompakt (`v2codec`), gekürzter 2×2-Block je Stufe (E-F-19), POI-Wetterspalten (V-FI-76), Options-/calib-Hash; Nachlauf + Scorer (`verify:pv-score --archive`). Gehört AP9: `scripts/punktarchiv/**`, `verify-pv-score.mjs`, §9.13, V-FI-32…39. 0–48 h bewertbar ab jetzt, 30 Fälle je t3-Bin ≈ Ende Oktober |
| Vollform AP13–AP17 | **Plan freigegeben, E-F-13…22 entschieden; AP13 + AP14 + AP16 fertig (uncommitted), Gates grün; AP15 Abnahme-Gate ROT ⇒ nicht verdrahtet; AP17 Diff gebaut und geprüft — wartet auf Jans Freigabe (E-F-15)** | `audit/fusion-vollform.md` (Phasendokument, Protokoll §9, Findings V-FI-62…103). AP13 (§9.1): Optionen erreichen das Produkt (`CubeIo.fuse`, V-FI-79), Cache-Schlüssel mit Optionen und eingespeister Uhr (V-FI-80, Nachlauf-Falle), `calibSource: 'json'` liest calib.json (Schema 2 nur mit Beleg, `calibDoc.ts`), Fit-Kern `calibFit.ts` (0 Bundle) + `verify:calib-fit` 14/14; alles voreingestellt aus, Produkt byte-gleich zum Stand vor AP13 bis auf `calibByVar` (V-FI-68). AP14 (§9.2): `CubeIo.crossChunk` holt den Nachbar-Chunk desselben Laufs für den 2×2-Block (Leser `crossChunk`, progressiv eigene Ausgabe; Graz 68 → 0 Schritte mit `chunkBorderTruncated`; erste Darstellung unverändert, voller Block Mobil-4G kalt ≈ +0,7 s nach dem ganzen Fenster, +406–781 KB nur an Randorten); voreingestellt aus, Einschalten erst nach dem Randbefund (E-F-18). AP15 (§9.3): Druckflächen-Profil gegen Standard-Lapse am t1-Schatten (405 Archivpunkte, Referenz t1-Modelllevel-Profil) bei \|Δh\| > 300 m MAE 1,94 gegen 1,39 K (nachts 2,79 gegen 1,64, tags 0,87 gegen 1,23) — Ursache der entkoppelte 2-m-Punkt nachts, keine Variante besser als Rauschen ⇒ Option nicht verdrahtet (0 Byte, kein `v2codec`-Eingriff); gebaut nur die reinen Bausteine `src/point/profileColumn.ts` (Portierung = Producer) und `extendBelowBase` in `vertical.ts` (ohne Option bitgleich zu HEAD) für den AP9-Stationsvergleich. AP16 (§9.4): `CubeIo.landCover` lädt statt z0 die Landbedeckung aus DENSELBEN WorldCover-Kacheln (0 Byte mehr; `point/client/landCover.ts`): d_water (Ringsuche, A_min 10 px, zensiert statt 20 000; an 42 Orten 42/42 Treffer, p50 1 030 m, meist Teiche/Fluss-Stücke ⇒ V-FI-94), κ je Zelle t1/t2 (`FuseCubeOptions.kappa`, λ 1: Spreizung ≥ 1,5 an 7/42 Orten), Modellzell-Box (`z0CellBox`, V-FI-65: Faktor p50 1,19 / p90 2,0); alles voreingestellt aus, ohne Option byte-gleich zum Stand vor AP16 (Scratch-Kopie im selben Prozess); tpiSigma gemessen (V-FI-85: DE 22,6 · AT 117,1 · CH 135,0 · gepoolt 104,6 m, nur in `audit/fusion-vollform/tpi-sigma.fit.json`; der Leser nimmt nur `default` ⇒ V-FI-98). AP17 (§9.5): RV12 gemessen — ICON-z0 ohne Orographie-Anteil (über 2 500 m p50 0,06 m; ICON-CH1 über 1 500 m unabhängig von SSO_STDH), aber 1,5–5× über der WorldCover-Näherung (V-FI-100) und über Land eine Größe je Lauf (16 % der Landpunkte > 10 % zwischen 00z/12z, V-FI-101); Producer-Diff `scripts/point/staticZ0mod.mjs` + `roughness()` in dwdRegular/dwdIcosahedral/meteoswiss (ICON-D2/-EU/global/-CH1/-CH2, ln-Blockmittel, Neubau nur bei > 1 % Landzellen mit Faktor > 1,65 oder monatlich), nur mit `POINT_Z0MOD=1` (Zeile in der Cron-Vorlage), Publisher unverändert; lokal aus echtem GRIB gebaut (265 KiB, +1,7–4,3 MB Download je Job), Producer ohne Schalter byte-gleich; Client `CubeIo.z0mod` + `FuseCubeOptions.z0Model` (voreingestellt aus, ohne Option byte-gleich zum Stand vor AP17) — an 42 Orten stiege der korrigierte Wind im Median um 3–5 % (max 10 %) ⇒ aus bis zum Stationsvergleich; V-FI-102 `run.json` nennt je Quelle nur die Zahl der Stunden. Gates: `verify:pv-cube` 290/290, `verify:point-client` 165/165, `verify:point-data` 990/990, `verify:calib-fit` 14/14, `verify:punktarchiv` 103/103, totalJs 1 437,4 / 1 438 (E-F-21), eagerJs 107,9. Nächste: Jans Freigabe des AP17-Diffs; danach ist die Vollform ohne Archiv abgeschlossen, der Rest ist AP9/AP10. Gehört dieser Linie: `src/point/**`, `src/pointForecast/**`, `verify-pv-cube`/`verify-point-client`/`verify-calib-fit`; geteilt nur additiv: `v2codec.ts`-Tabellen (Änderung ⇒ `V2C_VERSION`), `pvCubeFixtures.mjs` |
| AP10 Kalibrierung | kalendarisch | Fit schreibbar je Vorlauf-Bin ab ≈ 14.10. (0–6 h) … 28.10. (246–336 h); A/A_uhi/φ/meltOffset wetterabhängig (Winter) |
| AP10a Hindcast | **fertig und abgenommen (V1–V8 grün über das GANZE Archiv, 23.09., uncommitted)** | `audit/kalibrierung-fremdarchive.md` §8 — lokales Archiv `C:\dev\buscosun-hindcast\` (kein Repo) in Cube-Slot-Form, Provenienz `hindcast` (E-F-23): **4 314 Slots an 1 216 Tagen (7,24 GiB)**, Wahrheit 1 217 Tage, Cache 39 GiB. Lauf-Route 2026-06-17…09-21 (Open-Meteo `data_run`, läuft nach ≈ 3 Monaten aus), davor Tag 0 (t1, ab 2023-05-24) und dyn (t2/t3 aus dynamical AIFS + IFS-ENS-Kontrolllauf, ab 2024-04-01; t3-σ_ens aus 50 Membern). Abnahme 23.09. (§8.3b, Stempel in `index.json`): **V1 8 · V2 6 · V3 11 · V4 31 · V5 7 · V6 3 · V7 6 · V8 8**, jede Prüfung mit Gegenprobe. V4 exakte Ebenen 99,8–100 % in der Speicherschranke (Open-Meteo speichert Druckflächen-T in 0,11–0,15 K, V-HC-5), σ_ens 99,9–100 %, Stellvertreter ENS-Kontrolllauf = HRES auf 0,02 K. Befunde V-HC-1…30 (§8.5); zuletzt V-HC-30: **ein kaputter Quellwert** (AIFS-Bewölkung 21.–29.11.2025 auf 0…10000-Skala ⇒ 2 573 % im Slot) ⇒ Plausibilitätsgrenze nur für Bewölkung + Dauerprüfung über alle Slots. `codeHash` = `911dff6-hindcast-dirty` (Nacharbeiten uncommitted). Nachholen des wachsenden Randes: Kette `follow <von> <bis>` (§8.8). Offen E-F-27…30 (§8.6; E-F-26 = E-FL-3 entschieden), Commit = Jans Gate (MANUELLE-SCHRITTE §19). Gehört: `scripts/hindcast/**` |
| **Phase FL — Lernphase** (Bias, Σ, Varianz, Verifikation gegen jede Einzelquelle) | **FL-AP1…AP5, AP8a (V-FL-26, §11.9), AP8b (V-FL-20, §11.10) und AP8c (V-FL-15/22/18/28, §11.11) fertig (uncommitted). `fusionFit@3`:** σ-Skala je Stratum per CRPS (`VarianceEntry.scale`, Bewölkung Pflicht, T/Td/Böe nur bei oof-Gewinn), Speed-EMOS als **gestutzte Normal** TN(a + b·E_Rice, c·sd_Rice) hinter dem u/v-Modell (`tables.speed`, neue Dist-Familie `truncatedNormal`, `v2codec` Version 2 liest 1 und 2 — Codec geteilt mit AP9, Jans Gate), Hürde mit Spalte logit(1 − pDry_Cube) + CV-Schranke, im Speicher mit gedämpftem Newton (die Durchlauf-IRLS seit FL-AP3 divergierte, **V-FL-36**; Reservoir nach Algorithmus R, **V-FL-40**), Client-Optionen `learnedSpeed`/`learnedPrecip` (voreingestellt aus, nur mit `learned`; `verify:pv-cube` Block 26), schlanke Client-Tabelle `lib/clientTables.mjs` (**24,8 KB gz** statt 39). Fit 4 + **Scorecard 4** (`fit\2026-09-25-ap8c`, `score\2026-09-25-ap8c`; Mittelwert/Varianz byte-gleich zu Fit 3): **Wind CRPS −2,1 … −5,4 %, PIT-Rand 0,27–0,33 → 0,20–0,24** (G-FL-1 gegen Klima bis 120 h, G2 bei 7–48/126–240 h grün; DE +2,8 % bei 0–6/25–48 h, V-FL-38); **Bewölkung −0,4 … −3,6 %, PIT-Rand 0,22–0,35 → 0,14–0,18** (S/S mit latenter σ 1,1–1,7 — Scorer-Maß, V-FL-39); Niederschlag 0–6 h −1,2 %* gegen Cube (G1 ✓), 7–48 h `no-skill` (K-2 bleibt); T/Td/Böe ±0,3 % (Skala 0,9 senkt S/S auf 0,86–0,92, V-FL-37). Befunde V-FL-36…42. Nicht gebaut: V-FL-27/23/32 (= @4)/35/29–31. Gates (final): `verify:fusion-fit` 68/68, `verify:pv-cube` 314/314, `verify:point-client` 165/165, `verify:calib-fit` 14/14, `verify:pv-fusion` 229/229, Build 241/241, eagerJs 107,9, totalJs **1 443,8 KB > 1 438** (E-FL-11). Jans Gates §21: Codec-Bump bestätigen, Publisher-Weg `fusion.client.json` (Fit 4), `learnedSpeed`/`learnedPrecip` einschalten, V-FL-37 Skala nur Bewölkung, E-FL-5…13 | `audit/fusion-lernphase.md` — Anspruch: CRPS je Größe und Bin kleiner als jede Einzelquelle (auf den Punkt heruntergerechnet), MMM, Klimatologie, Persistenz; Anspruch B (Leave-Region-out). Stufen A–G: Downscaling je Quelle mit eigener Modellhöhe (V-FI-104/105), Γ nur aus der freien Atmosphäre (AP15-Lehre), 2-m-Entkopplung als Merkmal, **Lernstufe in EMOS-Form linear in Standortmerkmalen** (E-FL-2) mit Σ-Gewichten als Prior, Varianzmodell per CRPS (Rice-σ gefittet = V-FI-107), Klimatologie σ_c/ρ gefittet (V-PV-18), Anker-τ gefittet. **Zwei Formen:** P (Einzelquellen, nur Backtest) und K (Cube-Member, Client, E-FL-1); P − K = Zahl für V-FI-108. Datenlage: Hindcast 4 314 Slots, Wahrheit 389 Punkte; **7–48 h nur 95 Sommertage** (E-FL-3: Nachfit ab Dezember), MOSMIX/C-LAEF/INCA/Radar/E4 nicht im Hindcast (E-FL-4: nur Archiv-Fenster), σ_ens nur t3, Bewölkung nur DE. Doku aktualisiert: `ABLAUFPLAENE.md` (Abweichungstabelle, PAP 7–9), `QUELLENMATRIX.md` §1a, Audits. APs: AP1 Fundament (`hindcast`-Provenienz, Merkmalstabelle 405 Punkte) · AP2 Fallbau (`scripts/fusionfit/`, CAS1, ≈ 85 M Zeilen) · AP3 Fit (`src/point/fusionFit/`) · AP4 Scorer + Scorecard (G-FL-1…4) · AP5 Client hinter `FuseCubeOptions.learned` · AP6 Archiv-Fenster · AP7 Winter. Jans Gates §21: E-FL-5…9 |
| **Phase FV — Abschlussvalidierung von buscosun Fusion** (Stand Fit 5e; Auftrag 27.09.; davor FX-1…5 in `audit/fusion-forschung.md`, Jans Gates §22) | **fertig (uncommitted), Gates grün; Verdikt: Lernstufe gut, Produktkette noch nicht** | `audit/fusion-validierung.md` (§0 Kurzfassung für Jan, §4 Verdikt, V-FV-1…11, E-FV-1…5). Behauptungen H1–H8 vor den Läufen eingefroren (10:36:17Z, Hash in `fusion-validierung/claims-frozen.sha256`), Verdikte gerechnet von `fv-decision.mjs`. **FV-H** (Hindcast; `--thin=hash` = alle 389 Stationen in jeder Stufe statt 65/130 bei t3/t2, V-FX-44; Fits 4′/5a′/5e′, `score\2026-09-27-fv-h`, 6 802 581 Zeilen): **H2 gilt** (jedes Rohmodell und das Mittel), **H8 gilt**, H1 knapp nicht (nur Td 126–240 h +1,4 % n.s.; T/Td/Böe 246–336 h +8,3/+11,3/+5,1 %*, keine Zelle schlechter als Fit 4′), H3 knapp nicht (Niederschlag 7–24/246–336 h gleichauf; sonst +8…+27 %* gegen den Motor), H4 nicht (Bewölkung PIT-Rand 0,26–0,30 in jedem Bin); Kreuzung gegen Klima T 312 · Td 294 · Wind 126 · Böe 162 h; Regel fx5 hält auf 389 Stationen. **FV-A** (Archiv 14.–26.09., echte Eingaben, volle Client-Kette in `score-archive.mjs`, 294 835 Zeilen, nur an MOSMIX-Stationen, indikativ): **H6/H7 gelten nicht** — CRPS besser als MOSMIX, Punkt-MAE schlechter als MOSMIX (T −9…−19 %, Wind −26…−34 %) und als live (außer Niederschlag +23…+35 %*); die Kette verwässert die Lernstufe (V-FV-6: gesetzte Member-Gewichte, Bewölkung nachfusioniert); L2/L3 bestanden, L1 nicht (V-FV-8); Lauf 1 verworfen (Radarraten ×100 roh gelesen, V-FV-2). Client rechnet immer Route 1 = Sommer-Strata bei 51–336 h (V-FV-1). Gebaut (Flags/neue Dateien, ohne Option byte-gleich auf echten Zeilen, nichts unter `src/`): `lib/thin.mjs`, `fit.mjs`/`score.mjs --thin`, `score.mjs --mdReliability/--mdHoldout`, `lib/{archiveAdapter,distScore}.mjs`, `score-archive.mjs`, Verifier Blöcke 15/16. Gates: `verify:fusion-fit` **115/115**, `verify:pv-cube` 320/320, `verify:point-client` 167/167, `verify:calib-fit` 14/14, `verify:pv-fusion` 229/229, Build 241/241, eagerJs 107,9, totalJs 1 447,6 KB > 1 438 (E-FL-11, unverändert). **Jans Gates §23:** E-FV-1 H6b (stationsloser Punkt gegen MOSMIX, nachträglich), E-FV-2 Lernstufe noch NICHT einschalten (berührt E-FX-10/11), E-FV-3 Route 3 im Client (Motor), E-FV-4 Hash als Voreinstellung (berührt E-FX-12), E-FV-5 Client-Tabelle behalten |
| **Phase FS — Stationswert gegen MOSMIX** (Stand Fit 5e; Auftrag 28.09.) | **fertig (uncommitted), Gates grün; neueste Stufe FREIGESCHALTET (29.09.): drei Dateien im Daten-Repo (Commit `3dd7475`), Cube-Pfad ist die Voreinstellung des Panels, `?pf=live` der Rückfall; offen nur Commit/Push/Deploy von buscosun-web** | `audit/fusion-stationswert.md` (§0 Kurzfassung, §4 Verdikt, V-FS-1…11, E-FS-1…6). Behauptungen vorab eingefroren (17:43:58Z), zwei Läufe auf 331 594 Archivzeilen (14 Slots, 13 Ausgabetage, indikativ), Modi S (Punkt = Station) und L (Leave-Station-out). **Zwei Fehler der Kette:** V-FS-2 das gelernte Mittel wurde vom Motor ein zweites Mal höhen- und geländekorrigiert (ohne Station T 24–30 % schlechter als die Lernstufe allein) ⇒ `learnedAtPoint`; V-FS-3 doppelte Schrumpfung kalibrierter Member (D2 bestätigt, 14/16 Zellen) ⇒ `priorShrink: false`. **Stationswert** M + b + w·I + c·(L − M) (`fusion/stationValue.ts`, Tabelle `fit\2026-09-28-fs\stack.archive.json`, Provenienz `archive`) schlägt MOSMIX an der Station: H9/H10 gelten (Leave-Day-out mit Sperre ±1 Gültigtag; T +13/+6/+5/+3 %, Td +18…+10 %, Wind/Böe 0–6 h +5/+8 %, keine Zelle schlechter), als Motor-Option 13/16 Zellen besser (E2); H14 Bewölkung durchgereicht ⇒ `learnedClouds`; stationsloser Punkt H12/E4 gelten (Heimvorteil der Lernstufe benannt, V-FS-7). Offen: Schweiz Wind/Böe −2…−10 % (V-FS-5), Client ohne `lake`-Merkmal und Band (V-FS-6), kein Leser für die Tabelle (V-FS-10). Ohne Option byte-gleich zu HEAD (312/312 Läufe auf echten Eingaben). **Einschalten (§7):** Leser `stackPoint.ts`, `defaultCubeIo` mit `learnedSource`/`climaSource`/`stackSource` = json und `stage: fs` (ohne Tabellen byte-gleich wie ohne Schalter, benannt); Formen ohne Messung auf jeder Zeile gefittet (V-FS-12, E5 Gleichstand gegen MOSMIX); Paket `C:\dev\buscosun-hindcast\publish\2026-09-28-fs\` (3 Dateien, 49 KB gz); Ende-zu-Ende gegen den echten Cube geprüft (`fs-live-check.md`); das Panel rechnet seit 29.09. ohne Schalter auf dem Cube (`pfFlags.ts`, Rückfall auf live bei Fehler; im Browser geprüft). Gates: `verify:pv-cube` **338/338** (Blöcke 28/29), `verify:fusion-fit` **119/119** (Block 17), `verify:point-client` 167/167, `verify:calib-fit` 14/14, `verify:pv-fusion` 229/229, Build 241/241, eagerJs 107,9, totalJs **1 451,2 KB > 1 438**. **Jans Gates §24/§24.1:** Kopie der drei Dateien ins Daten-Repo + Purge + Push/Deploy, E-FS-7 Panel-Voreinstellung, E-FS-1 `learnedAtPoint` als Voreinstellung von `learned`, E-FS-2 `priorShrink: false`, E-FS-3 Stationswert (Leser + Publisher-Weg, Neufit ab ≥ 30 Ausgabetagen), E-FS-4 `learnedClouds`, E-FS-5 berührt E-FV-2 |
| **Phase DB — Wetter-Dashboard** (Umschalten Dashboard ⇄ Karte; Auftrag 29.09.) | **Phase 2 gepusht (`377a73a`); E-DB-20 „erst das Dashboard, dann die Karte" commitet (`ccfd3cd`, nicht gepusht, §11); E-DB-23 „punktuell innovativer" (Bandbreite + Trichter, Leitsatz, Nächte + Marken, §12) und E-DB-24 Reiter „Überblick | Details" (§13) umgesetzt, uncommitted, Gates grün; offen E-DB-21/22, Jans Durchsicht, Real-Device, Push/Deploy-Prüfung** | `audit/dashboard.md` (§0 Kurzfassung, §4 Abdeckungsmatrix, §7 E-DB entschieden, §10 Umsetzung, §11 E-DB-20). **E-DB-20:** Ortswahl der Startseite ⇒ `?ansicht=dashboard`; `MapView` ist eigener Lazy-Chunk (`router/mapViewLoader.ts`), Karten-Links holen ihn per Route-`loader` parallel zum Route-Chunk, das Dashboard erst nach dem ganzen Vorhersagefenster im Leerlauf (Montage beim Umschalten); Wetterkarten-Shells laden per Inline-Skript (vor dem Stylesheet) je Ansicht vor; kein Karten-Frühstart für das Dashboard. Gemessen mit Shell über HTTP/2 (`dashboard-latency.mjs --h2`): Dashboard-Link mobil-4G erste Ausgabe 3,76 → 3,44 s, ganzes Fenster 4,41 → 3,88 s, JS 741 → 304 KB; Karte mobil gleich, Desktop gepoolt +15 ms; < 2 s nicht erreicht (V-DB-19). `verify-routing` 249/249, `verify:dashboard-switch` 38/39, Budget eagerJs 108,6 / **108,7**, totalJs 1 500,5 / **1 502**. Phase 2: Dashboard = Ansicht derselben Route `/wetterkarte/…?ansicht=dashboard[&zeitraum=heute\|7-tage\|14-tage]` (Umschalter push, Zeitraum replaceState), Lazy-Chunk `src/dashboard/` (Kacheln nach `reference/dashboard.dc.html`, Diagramme `@nivo/line` mit eigenen Ebenen, Breakpoints 767/1279 nur im Dashboard-CSS, E-DB-1); Werte aus buscosun Fusion Stufe fs (`getPointForecastFromCube`, kein Rückfall auf live), Rest aus `buscosun-data`/bestehenden Pfaden, sonst „n. v." mit Grund; Herkunft je Wert `data-origin` P01–P88 (`src/dashboard/origin.ts`). Karte wird beim ersten Bedarf montiert und nie abgebaut, hinter dem Dashboard `suspended` (unsichtbar + inert, `WindLayer.setSuspended`): **0 WebGL-Draws, dasselbe Canvas beim Zurückwechseln**. Umschalter in der Karte nach der Marke, mobil in der Schwebeleiste (E-DB-2). `cubeSource.ts` nur additiv (`cells`, Re-Exporte — Punkt-Module bleiben im Cube-Chunk). Pixel-Diff (CDP, `dashboard:pixeldiff`): ganze Seite 15–30 % durch Versatz, Kacheln ausgerichtet 0,1–7,9 %, Stundenverlauf 26–34 % (echte Zeitachse gegen schematische Vorlage), jede Abweichung in §10.4 begründet; Zustände ohne Vorlage in `audit/dashboard/states/`. Latenz Dashboard-Link erste Ausgabe Desktop 1,5 s ✓, Mobil-4G 4,7 s ✗ (Karten-JS auf demselben Weg); Karte 780 → 794 ms / 2 722 → 2 780 ms (Rauschen). Gates: `verify:dashboard` **56/56** (`--dist` 59/59), `verify:dashboard-switch` **26/26**, `verify:share` 528/528, `verify:wind-advection` 59/59, `verify:point-client` 167/167, Build 241/241, `verify:pv-cube` 337/338 (Kostenprüfung unter Fremdlast, HEAD gleich), `npm run budget` grün: eagerJs 107,922 / **108,0**, totalJs 1 492,0 / **1 495** (Jan 30.09.: Budget-Grenzen dürfen angehoben werden). `generate-seo.mjs` toleriert `.then(…)` für die Kartenrouten (V-DB-12). **Jans Gates §25.** |
| **Phase EX — Expertenbericht vom 29.09.** (21 Vorschläge + Fristen zu buscosun Fusion) | **Cron-Fix gepusht (`db1baa5`); Radar-HDF5 gebaut und am 30.09. eingeschaltet (`cdc9a9b`, Daten-Repo `a506f2e`), Scorer-Korrekturen und Messung gebaut, Gates grün** | `audit/fusion-expertenbericht-2026-09-29.md` (§0 Kurzfassung, §1 Urteil je Vorschlag, §2 Fristen, §5 Reihenfolge, V-EX-1…13, E-EX-1…8). Der Punkt-Cron schlug am 29.09. ab 13:49 UTC viermal fehl: das Gate wertete den Termin „30.09. dynamical" als überfällig, obwohl der Hindcast die AWS-Buckets direkt liest ⇒ `SCHEDULED_CHANGES` mit `resolved { on, evidence }` und `informational`. Fristen an der Quelle geprüft: 06.10. ICON-EPS-Gitter (unveränderter Adapter liest den DWD-Testlauf, Dateien doppelt so groß; `scripts/point/probe-eps-grid.mjs`), **20.10. Radar-Altformate** (RV aus `composite_rv_*.tar`, ODIM-HDF5: `src/sources/rvHdf5.ts`, HDF5 zuerst und RADOLAN als Rückfall, `?rvfmt=`; Werte in RADOLAN-Einheiten nachgebildet, Maske Zelle für Zelle gleich, 1–1,5 % der nassen Zellen ± eine Einheit), **04.11. GeoSphere nwp-v1** (vermessen, E-EX-7), **30.11. DWD-URL-Schema + Wegfall des regulären Gitters** (eigene Phase, E-EX-5). Von den 21 Vorschlägen treffen 6 den Code nicht (Korrelationen, EMOS-Varianz, Feuchtkugel-Phase, Verifikation, höhengewichteter Block sind da); Scorer korrigiert (Spread = √ mittlere Varianz, DM nach Harvey/Leybourne/Newbold mit Student-t, gleitende Blöcke); gestutzte Normal am Stationswert gemessen und verworfen (Wind CRPS +1,6…+5,0 %). Gates (sauberer Arbeitsbaum): `verify:radar-repack` 48/48, `verify:radar-runs` 56/56, `verify:layer-erstbild` 38/38, `verify:fusion-fit` 124/124, `verify:point-data` 998/998, `verify:pv-cube` 338/338, `verify:pv-fusion` 229/229, `verify:punktarchiv` 125/125, eagerJs 107,9, totalJs 1 455,5 > 1 438; `verify:point-client` 166/167 — (10s) zeitabhängig, fällt unter Last auch an HEAD (V-EX-13). **Jans Gates §26.** |
| **Phase GS — GeoSphere v1 → v2** (C-LAEF 1 km im Live-Pfad und in der Karte; Auftrag 30.09.) | **fertig (uncommitted), Gates grün; Push = Jans Gate (E-GS-3)** | `audit/geosphere-v2.md`. GeoSphere stellt `nwp-v1-1h-2500m` am 04.11. ein; der Producer las schon v2, der Live-Rückfallpfad (`sampleSources.ts`) und die Rasterfusion (`geosphereArome.ts`) nicht. EINE Zuordnung `src/sources/geosphereNwp.ts` (v1: `t2m/u10m/v10m/ugust+vgust/rh2m/tcc 0…1/rr_acc` Differenz · v2: `2t/10u/10v/10fg/2r/tcc %/tp` Stundensumme, Stunde 0 null), Voreinstellung v2, `?nwp=v1` bis zum Stichtag. Neuer Quell-Tag `claef` (Footprint 1 000 m, Familie highres, Länder-Sets AT/CH), Katalog `arome-at` bleibt URL-Schlüssel mit Name „C-LAEF“ (E-GS-1), Beschriftungen und SEO-Texte umgestellt, Termin im Register `resolved`. Gates: `verify:geosphere-nwp` **26/26** (neu, in CI), `verify:model-source` 64/64, `verify:pv-fusion` 229/229, `verify:share` 528/528, `verify:routing` 231/231, `verify:point-data` 997/997, `verify:seo` 803, typecheck 0, Build grün, Budget unverändert; Browser: Rasterfusion AT fragt v2 (v1 mit Schalter), Live-Pfad Innsbruck `tawes, mosmix, inca, claef`. Offen V-GS-1…3. |
| **Phase AX — Ausbau nach dem Expertenbericht** (offene Punkte nacheinander; Auftrag 30.09.) | **AX-1…AX-11 gebaut und von Jan committed/gepusht (`a02f2b5`, 30.09.), AX-12 = Messung heute gegen 5e (uncommitted), Gates grün; seit Jans Freigabe 30.09. (Daten-Repo + Jobs) liegen Cron-Vorlage + README (`7115d708`, Leerlauf-Schutz korrigiert `d058317c`) und das Klimagitter (`3869297b`) im Daten-Repo; mit dem Push von `main` baut der Punkt-Cron ab dem nächsten Slot Schema 6, MOSMIX-S und die Stationsebenen (§28)** | `audit/fusion-ausbau.md` (§0 Tabelle je AP, V-AX-1…7, E-AX-1…6). **AX-1** (V-FS-15): die Messungs-Abrufer lieferten nie die nächsten Stationen (BrightSky-Sondenraster, TAWES `slice(0, 200)`, SMN jede k-te) — an 8 Stadtpunkten kam 0 Messung ≤ 5 km an, jetzt 4 (Rest strukturell); `near` in den Adaptern, BrightSky nach WMO-Kennung, Live-Pfad byte-gleich, Browser-Beleg München. **AX-2:** `learnedRoute` (E-FV-3) am Archiv **schlechter** (stationslos T −11 %!, Wind −17 %!) ⇒ Route 1 bleibt; Altersnotizen der Tabellen (V-EX-6, `tableAge.ts`). **AX-3:** T zwischen den nativen Schritten als Anomalie gegen μ_c — Orakel 6-h-Schritte MAE 1,12 → 0,95 K (−15,5 %), 3-h −4,1 %, Td/Böe ohne Gewinn ⇒ nur T, **in der Stufe fs** (E-AX-3). **AX-4:** Bewölkung als Zwei-Atome-Mischung `cloudMix` (Atome logistisch gelernt, `fitAtoms.ts`, Codec **Version 3**): out of fold CRPS +5,7 %* (0–6 h +10,7 %*), MAE −9 %, PIT-Rand 0,28 → 0,195, Atome kalibriert — Tabelle `fit\2026-09-30-ax4\fusion.ax4.json`, Einbau = E-AX-4/5. **AX-5:** Stationswert mit Parametern je Land (`ws\|3\|S\|CH`, Kandidat `stack-cc`, H15 vorab eingefroren) — **H15 GILT:** CH Wind 7–120 h +1,3…+3,7 %*, Böe +3,2…+7,0 %*, nirgends schlechter, die CH-Lücke gegen MOSMIX schließt sich; Tabelle `fit\2026-09-30-ax5\stack.archive.json` = E-AX-7. **AX-6:** ENS-Mittel roh bei 126–336 h gegen Einzellauf T +14/+23 %, Wind +13/+16 %, Böe +10/+12 %; gegen das Mittel zweier Läufe bei T erst ab 246 h; bei 246–336 h gleichauf mit der Klimatologie ⇒ Gewinn vor allem Wind/Böe (E-AX-6, Producer). **AX-7:** Cube-**Schema 6** (61 Ebenen: `t2m/u10/v10/precip_ens` = Member-Mittel aus denselben ENS-Bytes; Leser liest 5 und 6, Übergang mit echtem Schema-5-Chunk geprüft), Client-Option `ensMember` (aus, σ = 1,5·σ_ens set); lokaler Producer-Lauf gegen den echten 00z-Lauf: Ebenen an der Rasterstunde 144, Abstand zum HRES 0,3–1,7 K (§6a.3). **AX-8:** MOSMIX-S als zweites Stationsprodukt `point/stations-s/` (stündlich, Lauf + 39…41 min gemessen, dieselben 3 071 Stationen, alle zehn Größen), Aufbewahrung 6 h, Index `stationsS`, Leser-Option `stationSource` (L bleibt Voreinstellung, `?st=s`), vierter Cron-Job `:50` (20 Stunden, in den t2-Stunden im t2-Job) mit Leerlauf-Schutz bis zum Push; Ende-zu-Ende lokal (§6b.3) = E-AX-8. **AX-9:** Klimagitter `point/static/clima-grid/v1` (DWD CDC GK3 selbst projiziert, SPARTACUS Wert − Anomalie mit exakter Gegenprobe, MeteoSwiss LV95 — Sonne dort relativ, umgerechnet; 208 Chunks 1,87 MiB, 53 % der Zellen), `CubeIo.climaGrid` (`?cg=1`) ersetzt das Tagesmittel T des Priors mit Lapse gegen `elev_src`; Messung an 14 762 Punkt-Monaten: Alpen −28 %, CH −16 %, DE-Flachland +10 %; **beide Prioren ≈ 1,2 K zu kalt (V-AX-10)** ⇒ `climaTrend` (0,45 K/Dekade, set): Gitter 1,57 → **1,22 K** (§6c.3) = E-AX-9. **AX-10:** INCA-Analyse (GeoSphere, 1 km, stündlich, Latenz ≈ 1–1,5 h) als Anker-„Messung“ in AT mit Gewicht 0,6 (set; `CubeObs.weight`, `CubeIo.incaAnchor`, `?inca=1`) — gebaut, ohne Archiv nicht messbar = E-AX-10. **AX-11:** Globalstrahlung, Sonnenscheindauer, Sichtweite als drei Ebenen hinter den 61 Cube-Ebenen im Stationsprodukt (MOSMIX `Rad1h`/`SunD1`/`VV`, S und L; Leser unverändert, das Manifest nennt die Liste; München 342 W/m², 60 min, 51 km). **V-AX-12:** der erste Leerlauf-Schutz traf den Teilstring `mosmix_stationskatalog` — der Lauf 14:03 UTC baute MOSMIX-L einmal neu (byte-gleich), behoben mit dem Marker `POINT_STATIONS_SOURCE`. **AX-12 (Messung heute gegen Fit 5e, Archiv 16.–28.09., 365 513 Zeilen, 13 Ausgabetage, 389 Stationspunkte, §6g):** Modus S (Punkt = Station) MAE **22 von 36 Zellen signifikant besser, 0 schlechter** (T +17…+29 %*, Td +10…+22 %*, Wind +20…+27 %*, Böe +16…+28 %*, Bewölkung +11…+18 %*, PIT-Rand 0,62–0,75 → 0,28–0,33; Niederschlag unverändert); gegen MOSMIX T +3…+14 %*, Td +13…+19 %*, Wind/Böe 0–6 h +6/+10 %* sonst gleichauf, **CH Wind/Böe −2…−10 %! (E-AX-7 offen)**; stationslos (Modus L) 15 besser / 2 schlechter — Wind 0–6 h −1,2 %!, 126–240 h −4,1 %!, 0–120 h unter der Lernstufe allein (V-AX-13, E-AX-11); V-AX-4 behoben (Archiv-Schema 3 lesbar, `--slotsFrom`). **Schaltkandidaten am Archiv (§6g.5):** Wolkenatome (AX-4) Bewölkung CRPS +6…+10 %*, PIT-Rand 0,3 → 0,2, K7 bestanden ⇒ BESSER; Landesparameter (E-AX-7) Wind/Böe +2…+3 %*, CH gegen MOSMIX von −2…−10 %! auf −0,6…−1,1 % (n.s.), Td −0,1…−1,0 % (V-AX-15 ⇒ ohne Td-Landeseinträge); zusammen gegen 5e 23 / 0 / 13 — **mit Jans Go am 30.09. 18:25 UTC eingespielt (Daten-Repo `1aaec969`, gepurgt, CDN geprüft) = „buscosun Fusion 6"** (Bezeichnung, s. Sprache & Konventionen). Gates: `verify:pv-cube` **379/379** (Blöcke 30–37, Leerlauf), `verify:point-data` **1018/1018** (vier Cron-Jobs, Regeln A–F nachgerechnet), `verify:point-client` **171/171**, `verify:fusion-fit` **125/125** (16i), `verify:pv-fusion` 249/249, Build 249/249, `npm run budget` grün (totalJs 1508,6 / **1510** mit Notiz angehoben, eagerJs 108,6 unverändert), typecheck 0. Fallen: Archiv seit 29.09. Schema 3 (V-AX-4, `--slotsTo`), Truth-Sentinel −32768, HCV1-Header ohne `dtype`. |

**Jans Gates (`MANUELLE-SCHRITTE.md` §15/§16):** Push von `buscosun-web/main` mit AP1 + PA2 + AP12a + **PA3 +
E-F-11/12** als Commit 1 **vor 23:10 UTC** (der Archiv-Cron klont `main` täglich 23:10 UTC; der Punkt-Cron fährt danach
den neuen Publisher), **V-FI-25/26 als Commit 2** direkt danach (Live-Pfad: MOSMIX-Taupunkt, SMN-Böe); Kopie von
`scripts/repack-repo/workflow-point.yml` ins Daten-Repo (optional, +11 Zeilen); Abnahme (b) mit
`npm run verify:pv-latency -- --only=bundle --profiles=desktop-none` nach dem ersten Cron-Job mit neuem
Publisher (Basis kalt Kern p50 1 458 ms). **§17 (AP12/AP11/§9.16):** Gate-Maß entschieden (erste Darstellung); offen V-FI-42 (Publisher wärmt
identity ⇒ Ebenen-Bereiche an), Archivform des Cube-Pfads (V-FI-55), z0-Näherung (V-FI-58), Commit A + **Commit B
(V-FI-11, Live-Produkt)**, V-FI-24-Zeile an AP9, Real-Device mit `?startnow=0&pf=cube&pflog=1`. **§18 (Vollform):**
Slot-Wachstum vor dem Einfrieren von Schema 3 (E-F-19 b), AP17-Diff (E-F-15), Publisher-Weg calib (E-F-20),
totalJs je AP (E-F-21, AP16: 1 437, AP17: 1 438), `crossChunk` erst nach dem Randbefund; AP15: Gate rot — bestätigen, dass erst AP9 gegen Stationen misst; AP16 ansehen und committen; **AP17-Diff freigeben (E-F-15: Push, dann Kopie der Cron-Vorlage mit `POINT_Z0MOD`) und committen**. **§20 (PA4, 22.09.):** Push von `main` **vor 23:10 UTC** (Slot mit Schema 3), Entscheidungen V-FI-104/105/106 (Producer), V-FI-107 (Motor), V-FI-108 (Einzelquellen). **§22 (FX, 26.09.):** E-FX-1 Klimatologieprodukt im Client (Stationstabelle / Merkmalsregression / nur T), E-FX-2 Skalenregel nur Bewölkung, E-FX-3 Fallbau mit `learned` (Client-Kette messen, 6–10 h), E-FX-4 Motor-Liste (Anker-σ, Familien Weibull/Zwei-Atome/Flaute, Client von C1/A1), E-FX-5 Niederschlags-Produkt t2/t3, E-FX-6 Codec-Version 2, E-FX-7 keine Client-Tabelle aus Fit 5 vor Scorecard 5b und E-FX-1; **FX-4 (26.09.):** E-FX-1 durch Messung beantwortet (nicht gebaut), E-FX-8 Regel je Größe × Bin / Fit 5e nur T/Td/Böe, E-FX-9 Windklimatologie mit Exposition (Producer). **FX-5 (27.09.):** E-FX-8 gebaut (Regel bestanden), E-FX-9 durch A3 beantwortet (nein), **E-FX-10 Kopie Produkt + Fit-5e-Tabelle ins Daten-Repo (nur gemeinsam), E-FX-11 `learnedSource`/`climaSource` hinter `?pf=cube`, E-FX-12 Neuvermessung nach V-FX-44 (65 Stationen in den Bins 4/5), E-FL-11 totalJs 1 447,6.** **§23 (FV, 27.09.):** E-FV-1 H6b messen, E-FV-2 Lernstufe noch nicht einschalten, E-FV-3 Route 3 im Client, E-FV-4 `--thin=hash` als Voreinstellung, E-FV-5 Client-Tabelle behalten. **§24 (FS, 28.09.):** E-FS-1 `learnedAtPoint`, E-FS-2 `priorShrink: false`, E-FS-3 Stationswert (Leser, Publisher-Weg, Neufit), E-FS-4 `learnedClouds`, E-FS-5 Neubewertung von E-FV-2, E-FS-6 totalJs 1 451,2; **§24.1:** drei Dateien ins Daten-Repo, Purge, Push/Deploy, E-FS-7 Panel ohne `?pf=cube`.

**Offene Befunde der Phase:** V-FI-5 (jsDelivr antwortet vorübergehend 403 nach 1–8 s, auch statt 404;
Leser: kein Retry, Sonde = „nicht da", Hedge + raw), V-FI-6 (statische Produkte `@main` + 12 h statt
gepinnt), V-FI-7 (Radar-Slots am Edge immer MISS — Warm-up im Spiegel-Workflow wäre S&F; bis dahin trägt
München kalt in 0–3 h das Modell, benannt), V-FI-9 (kosmetisch; V-FI-8 in AP8 behoben), V-FI-11 (Live-Pfad
Zugspitze +0 h zu warm — Ursache BrightSky-Fallbackwerte, Leser behoben, Commit B, §9.16.4), V-FI-13 (Bergorte: Cube-Member < 5 % — der Motor-Prior 0,0035 K/m
Höhenrest dominiert, AP10 misst), V-FI-17 (z0 aus WorldCover, hinter `?pf=cube` aktiv, §9.16.2), V-FI-20 (stündliche
Achse +100–200 ms auf Mobil), V-FI-21 (Kodierer da, §9.16.1),
V-FI-22 (statische Produkte auf dem kritischen Pfad) — V-FI-20/22 in AP12 erledigt (§9.14). **Aus AP12 (§9.14.4):**
V-FI-42 (identity-Variante ungewärmt), V-FI-44 (18 Ebenen ungelesen, verschränkt), V-FI-46, V-FI-47 (t1 zuerst kostet das
ganze Fenster eine RTT), V-FI-49 (3G erste Darstellung 7,3 s), V-FI-50 (Rechnung ≈ 300 ms synchron auf Mobil ⇒ Long Task,
Real-Device). **Aus AP11 (§9.15.4):** V-FI-53 (Panel in Produktion nur mit `?startnow=0` sichtbar), V-FI-54 (Lauf-Kennungen
roh). **Aus §9.16:** V-FI-55 (Archivgröße), V-FI-57 (WorldCover-Bereiche am Edge kalt), V-FI-58 (GRIB-z0 in den Cube),
V-FI-59 (`/weather`-Fallbacks), V-FI-60 (6 nächste Stationen je Größe wählen), V-FI-61 (Rasterfusion nach V-FI-11 ansehen). **Aus PA3 (§9.12.4; V-FI-25/26 am 17.09. behoben, §9.12.5):**
V-FI-24 (Live-Pfad nimmt seit §9.16.3 `elevationM`; der Sammler setzt es noch nicht — AP9), V-FI-27 (Registry ordnet ICON-CH2-EPS
t1 und CLAEF t2 zu, der Producer liest sie dort nie), V-FI-28 (ICON-CH1 STAC-500 ohne Rückfall), V-FI-29
(INCA/RZC-Hüllen größer als das Raster), V-FI-31 (Legacy-Feld `relativeHumidity` des Live-Pfads an DE-Punkten nur in
Stunde 0 belegt — MOSMIX hat keine RH; `fusion.humidity` ist seit V-FI-25 da, das Feld füllt sich daraus nicht: Jans
Gate). AP9-Regel: die 23-UTC-Stunde von TAWES/SMN steht in zwei Slots — nach Punkt und Stempel deduplizieren. Long
Tasks sind in headless-shell nicht messbar (AP11 Real-Device).

**Nebenlinie HZ1 (18.09., uncommitted):** Windpartikel bei hohem Zoom ausgedünnt (`zoomInThinExp 0,75` ab z7,
nur gezeichnete Zahl; `audit/windpartikel-hochzoom.md`, `verify:wind-advection` 59/59); offen V-HZ-1…4 und Real-Device.

**Weitere offene Linien:** FL-Datenlücken (Winter 7–48 h bis zum Nachfit ab Dezember; MOSMIX ohne Archiv; dynamical-Zugriffsweg ab 30.09. für t3-σ_ens); E-FL-5…9 (`MANUELLE-SCHRITTE.md` §21); AROME-Ablösung im Live-Rückfallpfad vor 2026-11-01 (U-19); V-PD-62 (`hmodel.changed`
feuert bei jedem ECMWF-Laufwechsel); E-U-13 Archivgröße (≈ 6,7 GB/Jahr bei 410 Punkten); SEO/GEO Stufe 2
wartet auf Freigabe (`SEO-PLAN.md`, Etappe 0 fasst die bekannten Text-Defekte); Teilen SH7 (Vorschaubild zur
Laufzeit) freiwillig; Punkt-Vorstufe E-D-1…3, PD-E E-E-1…3 offen (je im Audit).

**Betrieb:** Punkt-Cron im Daten-Repo im Drei-Stunden-Takt (t1 `40 1,4,…,22`, t2 `30 4,10,16,22`, t3 `55 9,21`,
`JOB_MAX_MIN_BY_TIER` {20, 15, 10}); Archiv-Cron in `buscosun-archiv` täglich 23:10 UTC; Kartenlinie (Repack,
Radar-Spiegel) unverändert. Publikationslauf ≠ Quell-Lauf (§26), Bau-Ablage `point/.build`, Aufbewahrung je
Stufe {9, 24, 24 h}.

## Dauerhafte Lehren und Werkzeugfallen

Verkürzt aus den Phasen seit Juli; Herkunft, Messwerte und Belege stehen in den `audit/*.md`.

**Messen und belegen**
- Ein Format-Selbsttest beweist nichts über den Baum, den der Producer schreibt; ein Verifier gegen selbst
  erfundene Werte ist grün und trotzdem falsch — Fixtures tragen die echte Datenform, Gate-Zahlen werden neu
  gezählt statt fortgeschrieben (BW-1).
- Eine Prüfung, die eine Abwesenheit behauptet, braucht eine Gegenprobe auf ihr eigenes Muster; ein
  Byte-Gleichheitsbeweis braucht eine Negativkontrolle.
- Ein Leistungsanker misst die Maschine mit: nur innerhalb eines Laufs vergleichen, ein Isolat je Variante,
  der erste Abruf eines Browser-Prozesses ist Verbindungsaufbau (im Lab `prime`).
- Eine Hochrechnung aus einem Fall ist keine Messung; quellenweise Messungen sind blind für das Zusammenspiel
  (Speicher, Laufzeit) — der volle Lauf muss einmal gemessen sein.
- Zeitliches Verhalten ist oft rückwirkend lesbar (DWD-Verzeichnisse, Actions-Läufe, Git); aber die Kartenlinie
  force-pusht das Daten-Repo — Dateilisten sofort lesen oder vorher/nachher schnappschießen.
- Was in den Daten liegt, entscheidet, nicht die Doku: Registry-Angaben (Läufe, Horizonte, Einheiten, Level)
  sind am Verzeichnis zu messen; ein 404 ist ein Befund, ein Abbruch keiner (`AbortError` ≠ absent).

**Daten-Repo und CDN**
- Ein SHA ist erst unveränderlich, wenn er auf dem Remote steht (ein Rebase schreibt Commits neu); `--amend`
  macht Manifest-SHAs ungültig ⇒ Datencommit → Push → SHA lesen → Manifest → zweiter Push.
- `git add` in einem sparse Checkout verwirft außerhalb der Muster still mit Exit 0; ein Pfad, den es nicht
  gibt, bricht `git add` ab; `.gitattributes` mit `*.bin -text` vor dem ersten `add`.
- jsDelivr: ein Cache-Eintrag je `Accept-Encoding`-Variante; `@main` löst bis ~3 min nach dem Push auf den
  alten Commit auf; eine 404 hängt am Edge (purgen); 403 kommt vorübergehend nach Sekunden (V-FI-5);
  veränderliche Dateien unter festem Pfad nur `@<commit>` lesen, unveränderliche `@main`; purgen nur, was
  wirklich auf `origin/main` liegt.
- Nie ein Purge oder Cron-Dispatch gegen Produktion von der lokalen Maschine — Jans Gate. Warm-up (GET) ist
  erlaubt.
- Streuungen werden nur mit dem Faktor skaliert, nie mit dem Versatz; Quantile einer Quelle nie mit σ
  verrechnen; Profilfelder nie mitteln; MOSMIX nie ins Gitter.

**Werkzeuge**
- Der Bash-Kanal schneidet Kommandos bei ≈ 8 KB ab — große Dateien nur per Write-Werkzeug; `\b` und `[^\n]`
  in Python-in-Bash werden zu echten Bytes (Backspace, Zeilenumbruch) — Edit-Werkzeug benutzen.
- PowerShell: Verifier nie mit `2>&1` starten (ErrorRecords ⇒ Exit 1); `Set-Content -Encoding utf8` kodiert
  BOM-lose UTF-8 doppelt; `npm run` schluckt `--`-Argumente ⇒ Skripte direkt mit
  `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs …` aufrufen.
- `chrome-headless-shell --screenshot` tut nichts mehr; CDP über `scripts/lib/headlessShot.mjs` bzw.
  `cdpBrowser.mjs`; Chrome-MCP drosselt rAF (FPS-Traces unbrauchbar); In-App-Browser rendert WebGL nur im
  Vordergrund; `window.print()` blockiert die Prüfsitzung; `PerformanceObserver('longtask')` liefert in
  headless-shell nichts.
- `decompressBz2` ist asynchron; reines JS-bz2 liefert bei manchen Läufen richtige Länge und falsche Bytes ⇒
  Binary bevorzugen, jede Dekodierung verifizieren; `spawnSync` blockiert einen In-Process-HTTP-Nachbau.
- Verifier prüfen Listen statt Zahlen (Dependencies), Texte hängen an Konstanten statt an Stichworten;
  V-Einträge landen bis zur Wiederherstellung von `improvements.md` im jeweiligen Phasendokument.

## Projekt

**buscosun** (Produktion: buscosun.com; die Kanonik ist seit 2026-09 durchgängig `.com` — Canonicals,
Sitemap, OG, `llms.txt`, robots) ist eine DACH-fokussierte Wetter-Visualisierungsplattform: reine
Frontend-Web-App ohne Backend, alle Wetterdaten werden **client-seitig** geholt und dekodiert
(handgeschriebener GRIB2-Decoder inkl. CCSDS-AEC).

**Mission:** buscosun zur führenden Wetterplattform im DACH-Raum ausbauen — Referenz in Qualität,
Nutzererlebnis, Geschwindigkeit, Genauigkeit, Innovation und Zuverlässigkeit. Zielgruppen-Fundament:
`docs/zielgruppen-dach.md`.

**Bereits umgesetzte Feature-Linien** (Details je in eigenem `audit/*.md`, s. Tabelle unten): Wetterkarte
mit 19 Layern + Fusion/Modell-Switcher; pfadbasiertes Routing (RT1); Regenradar auf denselben Layer-Modulen
wie die Wetterkarte (RL1); Bandbreiten-Linie BW-0…BW-13 (Netlify-Traffic für Wetterkarte + Regenradar über
jsDelivr-Repack + eigenes Daten-Repo praktisch auf 0, inkl. Radar-/KONRAD-Spiegelung RD0–RD3, Windlayer
vollständig aus dem Daten-Repo); Layer-Ladezeit (LE0–LE2, LZ0–LZ1); komplette Waldbrand-/Brandradar-Linie
(FIRMS/EFFIS-Grundlage, Brandflächen-Panel BP1–BP5, Aktiv-Feuer-Dynamik AF1–AF4, Ausbreitungsrichtung SF1,
Thermalanomalien-Trennung TA, Brand-Historie BH1–BH6, Brand-Dossier BD1/BD2, Satellitenbilder SAT0–SAT2h
vorher/nachher inkl. 10-m-COG-Viewer/SWIR/dNBR/SCL/WorldCover); Geo-Versatz aller Kartenlayer auf ≤ 1 m
korrigiert (KL0–KL11); 3D-Tourenansicht mit Schnitt- und Geländebühne (R3D); Event-Fläche + Terrain-Bühne für
die Eventplanung (EZ, ET); „Auswahl teilen" SH0–SH6 (Zustand lesbar in der URL, Share-Sheet, Open Graph je
Zustand über die Edge Function `og-meta`); Punktdaten-Linie PD-A…PD-E (Punkt-Cube `point/` im Daten-Repo,
Schema 5, 57 Ebenen, drei Stufen bis 336 h, Stationsprodukt MOSMIX-L, `static/hmodel` + `static/urban`,
Drei-Job-Cron) und Punktarchiv PA1/PA2 (`buscosun-archiv`, täglicher Slot). **Nicht mehr im Code** (bewusste
Rückzüge mit Jans Freigabe): Feuerwetter/`fireSpread`-Rasterfläche, `fireWind`/`fireDrought`/`fireVegetation`,
„Amtliche Stufe" (`fireIndexNational`) — betroffene Bits bleiben `null` reserviert.

> **Sonderregel für den Warn-Layer:** `warnings` ist der einzige Layer, der ein **amtliches Warnprodukt IST**;
> alle anderen verweisen darauf. Dort ist Warnsprache korrekt — aber **ausschließlich als wörtliches Zitat**,
> nie zusammengefasst, umformuliert, verschärft oder abgeschwächt. Zusätzlich gelten die Lizenzauflagen in
> `docs/API.md` §7. Dieselbe Zitatregel gilt für GeoSphere-Warntexte im Waldbrand-Kontext.

**Repo-weite Lehren aus der Waldbrand-Linie (gelten überall):**
1. **WFS-`maxfeatures` schneidet die jüngsten Datensätze ab**, nicht die ältesten — nie serverseitig deckeln;
   im Client nach dem BBox-Filter, jüngste zuerst.
2. **Der MapServer spiegelt die BBox-Achsenreihenfolge in die Ausgabe-Geometrie** — Anker prüfen die
   zurückgegebenen Koordinaten, nie Zählstände (`src/fire/sources/wfsAxis.ts`).
3. **`setData` auf `idle` ist eine Endlosschleife** — nur bei geänderter Referenz setzen.
4. **„Bestätigt"** braucht immer eine Quelle im selben Satz (EFFIS-Kartierung, EMS-Aktivierung). MoWaS wird
   nicht ausgewertet, nur verlinkt. „Unbestätigt" ist der Normalfall und wird so gesagt.
5. **Keine unklare Lizenz, keine NC-Klausel, kein Scraping** — Quellen ohne klare Lizenz oder mit NC-Klausel
   sind reine Deep-Links.

## Stack (verifiziert am Code, Stand 2026-07-31)

- React 19 + Vite 6 + TypeScript 5.7, MapLibre GL 5.6. Runtime-Dependencies nur: `maplibre-gl`, `react`,
  `react-dom`, `bz2`, `bzip2-wasm`, `jsfive`. Kein Router-Package außer `react-router` (seit RT1), keine
  State-, HTTP-, Chart-Bibliothek. (Die Brandradar-Linie führt zusätzlich `@nivo/*`; der Verifier prüft die
  Liste der Laufzeit-Abhängigkeiten, nicht ihre Zahl.)
- **Nicht (mehr) im Code, auch wenn Alt-Doku es behauptet:** kein Three.js, **kein WebGPU** (nur WebGL —
  alle 3D-Ansichten sind MapLibre-Custom-Layer mit eigenen Shadern), kein WebLLM/KI-Meteorologe
  (`src/assistant` existiert nicht), kein Cloudflare R2/PMTiles, kein „AdaptiveQualityController" (real:
  `FrameGovernor` in `src/wind/perfGovernor.ts`).
- Hosting: Netlify (statisch + 4 Edge Functions: `/_dwd_wind`, `/_dwd_grib`, `/_firms` als gehärtete
  Cache-/Schlüssel-Proxys, dazu seit SH6 `og-meta` auf den neun teilbaren Routen — sie schreibt NUR
  für Vorschau-Crawler die `og:*`-Tags je Zustand und lässt jeden Browser unverändert durch **+ 6 offene Rewrites** `/_dwd_opendata`, `/_meteoalarm`, `/_gfs`, `/_cscs`,
  `/_mf`, `/_ecmwf` auf DWD, MeteoAlarm, NOAA-S3, CSCS, Météo-France, ECMWF — sie reichen auch
  Verzeichnislistings der Upstream-Server durch, s. `SEO-AUDIT.md`). Der Repack-Cron pflegt den
  Radar-/Repack-Spiegel im Daten-Repo `buscosun-data` (ausgeliefert über jsDelivr; die Warm-Crons für
  `public/latest-*.json` sind seit BW-12/13 still, `warm-wind.yml` gelöscht); zweites Spiegel-Repo
  `jppetry/buscosun-worldcover` für dNBR; Punkt-Cron und Archiv-Cron s. „Betrieb". Daneben laden viele Quellen
  weiterhin **direkt** von Fremd-Origins (GeoSphere, geo.admin.ch, BrightSky, Open-Meteo, Nominatim,
  AWS/Element84, NASA GIBS, Planetary Computer).
- Vollständige Architektur: `architecture.md`. Entscheidungs-Log (`decisions.md`) fehlt im Baum — Grundsatzentscheidungen
  stehen bis zur Wiederherstellung in den `audit/*.md` (je Linie als E-…-Punkte mit Jans Entscheidung).

## Dokumenten-Landkarte

| Datei | Rolle |
|---|---|
| `CLAUDE.md` | Diese Verfassung: Stand, Regeln, Konventionen, Doku-Landkarte |
| `README.md` | Repo-Einstieg: Was ist buscosun, Funktionsumfang, Schnellstart, Doku-Index |
| `architecture.md` | Repo-weite Architektur (App-Shell, Layer-System, Quellen, Fusion, Transport, Deployment) |
| `agents.md` | Agent-Teams-Betriebsmodell: Rollen, Zuständigkeiten, Arbeitsabläufe, Definition of Done |
| `CONTRIBUTING.md` | Arbeitsweise, Gates, Ehrlichkeitsregeln, Definition of Done (für Menschen **und** Agenten) |
| `MANUELLE-SCHRITTE.md` | Was nur Jan tun kann (Pushes, Kopien in die Daten-/Archiv-Repos, Deploy-Prüfungen), je Phase nummeriert |
| `prompt.md` | Kickoff-Prompt für die nächste Session (aktuell: AP9, neu geschrieben 18.09.) |
| `ABLAUFPLAENE.md`, `QUELLENMATRIX.md` | Design-Dokumente von buscosun Fusion (PAP 1–6; Primärquellen je Land und Stunde) |
| `plan.md`, `context.md`, `checklist.md`, `roadmap.md`, `improvements.md`, `mobile-design-guidelines.md`, `decisions.md`, `DEVELOPMENT.md`, `tests.md` | **Fehlen im Arbeitsverzeichnis** (die ersten sechs seit 2026-08-17; die letzten drei sind nicht getrackt, am 16.09. nachgeprüft). Bis zur Wiederherstellung gelten die `audit/*.md` als Gate-Belege und ADR-Ort; V-Einträge (D-28) landen im jeweiligen Phasendokument |
| `docs/` | Fachspezifikationen (s. Tabelle unten) |
| `audit/*.md` | Diagnose-/Phasen-Befunde je Linie, mit Messwerten und Gate-Belegen |

**Phasen-Audits** (jeweils Diagnose → Umsetzung → Gate, mit Messwerten und Fallstricken):

| Datei | Linie |
|---|---|
| `audit/geosphere-v2.md` | **GS:** GeoSphere `nwp-v1` → `nwp-v2` (C-LAEF 1 km) im Live-Pfad und in der Rasterfusion — Zuordnung der Größen, Quell-Tag `claef`, Schalter `?nwp=v1`, E-GS-1…3, V-GS-1…3 |
| `audit/fusion-expertenbericht-2026-09-29.md` | **EX:** Prüfung des Expertenberichts vom 29.09. (21 Vorschläge, Fristen), Cron-Gate und Terminregister, Radar RV aus ODIM-HDF5, Scorer-Korrekturen, Messung Windfamilie am Stationswert, V-EX-1…13, E-EX-1…8 |
| `audit/dashboard.md` | **DB:** Wetter-Dashboard neben der Wetterkarte — Inventar der Vorlagen, Parameterliste P01–P88, Abdeckungsmatrix (Fusion / `buscosun-data` / buscosun-web / nicht verfügbar), Architektur (URL-Zustand, Lazy-Chunk, Kartenpause), Vorlagen-Lücken, E-DB-1…20, V-DB-1…15; §10 Umsetzung mit Pixel-Diff (`dashboard/pixel/`), Zuständen ohne Vorlage (`dashboard/states/`), Latenz und Gates |
| `audit/fusion-stationswert.md` (+ `fusion-stationswert/`) | **FS:** Stationswert gegen MOSMIX — Diagnose der Kette (Gewichte, doppelte Korrektur, doppelte Schrumpfung), eingefrorene Behauptungen D1/D2/H9–H14/E1–E4, Archiv-Karten Modus S und L, vier Motor-Optionen, V-FS-1…11, E-FS-1…6 |
| `audit/fusion-validierung.md` (+ `fusion-validierung/`) | **FV:** Abschlussvalidierung Fit 5e — Hindcast FV-H und Archiv FV-A, H1–H8, V-FV-1…11, E-FV-1…5 |
| `audit/fusion-lernphase.md` (+ `fusion-lernphase/`) | **FL (laufend):** Design und Protokoll der Lernphase — Diagnose der Datenbasis (Hindcast, Archiv, Wahrheit, Lücken), Stufen A–G, Formen P/K, Fit-Protokoll, Verifikation G-FL-1…4, PAP 7–9, Bauplan FL-AP1…7, E-FL-*, V-FL-* |
| `audit/fusion-vollform.md` (+ `fusion-vollform/`) | **FI-Vollform (laufend):** AP13–AP17 ohne Archiv (d_water, Profil t2/t3, Chunk-Rand, κ, z0 aus GRIB, Kalibrier-Werkzeug), E-F-13…22, Befunde V-FI-62…79 und ab V-FI-80 |
| `audit/fusion-implementierung.md` (+ `latency/`) | **FI (laufend):** Plan §0–§8, Etappenprotokoll §9 (AP0 Messbasis, AP1 Leser, PA2, AP12a, ab AP2 der Algorithmus), Befunde V-FI-* |
| `audit/chronik-statusblock-2026-09-16.md` | Der frühere Statusblock dieser Datei, wortgleich (PD-A…PD-U, SH, LZ1, BW-13, PA0 …) |
| `audit/punktvorhersage-14tage.md` (+ `audit/punktvorhersage-14tage/`) | PV0/PV3: buscosun Fusion (`src/pointForecast/fusion/`) — Verteilungsalgebra, Minimum-Varianz-Kombination, Klimatologie-Prior, Feuchtkugel-Phase, 0–336 h (GPV3b), K-1/K-2 (Niederschlag zweistufig), Stationsanker als Innovations-Persistenz (§12), V-A₁-Scorecard (`verify:pv-score`: Spread/Skill 0,5–0,6 überkonfident); `verify:pv-fusion` 222/222; offen V-PV-14/17/18 |
| `audit/punktdaten-umsetzungsplan.md` | PD-U: Umsetzungsplan vor FI, Punktarchiv PA1 (`scripts/punktarchiv/*`, Repo `buscosun-archiv`), Retention-Korrektur, Stadt-Raster `urban/v1`, M-1 (Windmember, σ_ens bis 336 h), Bereitschaft §8.1 |
| `audit/punktdaten-druckflaechen.md` | PD-E: Druckflächen 925/850/700 im Cube (Schema 5), `static/hmodel` je Quelle, E-E-1…5, V-PD-57…60 |
| `audit/punktdaten-versorgung.md` | PD0/PD-A…PD-C, Block F: Punkt-Cube `point/` (Format, Adapter der acht Zugriffsfamilien, Aufbewahrung, Publikationslauf ≠ Quell-Lauf §26, Cron im Drei-Stunden-Takt), E-1…18, V-PD-1…56 |
| `audit/fusion-vorstufe.md` | PD-D: Leser + Auswähler für `buscosun-data` (`src/point/client/*`, `point:read`), Auswahl auf Produktebene, V-PD-52…56 |
| `audit/datenrepo-beschreibungen.md` | README des Daten-Repos an Konstanten gebunden; Backspace-Fund in einer Verneinungsprüfung |
| `audit/teilen-share.md` | SH0–SH6: „Auswahl teilen" — URL-Schema, Share-UI, Open Graph (Edge Function `og-meta`, 50 Karten), V-SH-1…13 erledigt, SH7 offen |
| `audit/layer-ladezeit.md` | LZ0/LZ1: Ladezeit am Layer-Klick (kalter jsDelivr-TTFB, Index-SWR, `@main`-URLs, Publisher-Warm-up, Prefetch; `?lz=0`) |
| `audit/windpartikel-hochzoom.md` (+ `windpartikel-hochzoom/`) | HZ1: Windpartikel-Ausdünnung beim Reinzoomen (Schweife wachsen mit `screenTempoZoomExp`), Sättigung durch Überschreiben ohne Blending, Mess-Lab mit eigenem Chromium (MCP-Browser drosseln rAF auf 1 Hz) |
| `audit/brandradar-satellitenbilder.md` | SAT0–SAT2h: Satellitenbilder vorher/nachher, 10-m-COG-Viewer, SWIR/dNBR/SCL-Maske/WorldCover-Dämpfung |
| `audit/route-3d.md` | R3D-1…R3D-8: 3D-Tourenansicht (Schnitt + Geländekarte, Zeitplan) |
| `audit/bandbreite.md` | BW-0…BW-13: Netlify-Bandbreite auf ≈ 0 (jsDelivr-Repack, PNG-Familien, Radar-/KONRAD-Spiegel, Index-Weg, V-BW-58 Push-Wiederholung) |
| `audit/radar-datenrepo.md` | RD0–RD3: Radar/KONRAD-Spiegel im Daten-Repo als fertige Bilder |
| `audit/layer-erstbild.md` | LE0–LE2: Erstbild Regenradar/Wetterkarte (Parser im Worker, Frühstart) |
| `audit/karten-layer-verortung.md` | KL0–KL11: Geo-Versatz aller Layer auf ≤ 1 m korrigiert |
| `audit/radar-punktverortung.md` | RP0: Punktabfrage vs. Kartenposition DE/AT/CH-Radar |
| `audit/event-terrain.md`, `audit/event-zone.md` | ET0–ET5 Terrain-Bühne + Readout; EZ0–EZ3 Event-Fläche |
| `audit/brandradar-detail-mitte.md`, `audit/brand-detail.md` | BD2 Dossier in der Mitte; BD0/BD1 Detailkarte mit FRP-Verlauf |
| `audit/regenradar-layer-angleich.md` | RL0/RL1: Regenradar auf den Layer-Modulen der Wetterkarte |
| `audit/routing.md` | RT0/RT1: Pfadbasiertes Client-Routing (React Router) |
| `audit/brand-historie.md`, `audit/thermalanomalien.md`, `audit/aktivfeuer.md`, `audit/brandflaechen-panel.md`, `audit/brandflaeche-vorlaeufig.md` | BH0–BH6, TA0–TA5, AF0–AF4, BP0–BP5, VB0 (Brandradar-Linie) |
| `audit/waldbrand-ausbreitung.md`, `audit/waldbrand-forecast.md`, `audit/waldbrand-cluster.md`, `audit/waldbrand-behoerden.md`, `audit/waldbrand-boden.md`, `audit/waldbrand-wind.md`, `audit/waldbrand-firms.md`, `audit/waldbrand-effis.md` | SF0/SF1, WF0–WF5, BC1, Behördendaten DACH, WT1, WW1, F0–F2, E0–E3 (Waldbrand-Linie) |

**Achtung Alt-Doku:** `docs/reports/*`, `docs/seo-geo/*`, `buscosun-atmosphaere-*.md`, `buscosun_seo_geo_*.md`,
`FUSION_*.md` (externes Audit vom 07.09.) und `SEO-*.md`/`KEYWORDS.md`/`GEO-TESTSET.md`/`VERIFY.md`
(SEO-Linie, wartet auf Freigabe) sind Session-Artefakte — als Historie
wertvoll, nicht als Ist-Beschreibung. Bei Widerspruch gilt: **Code > `architecture.md`/`decisions.md` > Alt-Doku.**

**Fachspezifikationen unter `docs/`**

| Datei | Rolle |
|---|---|
| `docs/MAP.md` | 2D-Karte: Komponenten, Renderpipeline, Datenfluss, State, Konfiguration, Caching, Fehlerbehandlung, Performance |
| `docs/LAYER_SYSTEM.md` | Layer-Vertrag: die zwei Mechanismen, `LayerKey`-Verdrahtung, Z-Ordnung, Zielbild „Layer-Registry" |
| `docs/WEATHER.md` | Meteorologischer Layer-Katalog: bestehende + geplante Layer, Paletten-Ordnung, Länder-Abdeckungsmatrix |
| `docs/DATA_SOURCES.md` | Quellenbewertung DACH (DWD, GeoSphere, MeteoSchweiz, EUMETSAT, EUMETNET/OPERA, Copernicus) |
| `docs/API.md` | Externe Endpunkt-Kontrakte: URLs, Formate, Projektionen, Lizenz- und CORS-Lage |
| `docs/2d-layer-erweiterung.md` | Integrationskonzept + Umsetzungsplan für neue 2D-Layer |
| `docs/zuglinien-radar-spec.md` | Umsetzungsreife Spec: Zeitmodell, Playback, Frame-Budget, Prefetch, Verifier-Verträge |
| `docs/niederschlag-architektur.md` | Niederschlags-Ansicht „jetzt–2 h" im Detail (D-14) |
| `docs/high-end-radar-feature-catalogue.md` | Funktionskatalog Radar (Referenzspezifikation) |
| `docs/fusion-*.md` | Fusions-Engine (Spec, Paper, v2-Plan, 2D-Integration) |
| `docs/zielgruppen-dach.md` | Zielgruppen-Fundament |
| `docs/model-switcher-gate0.md` | Per-Land-Modell-Switcher |
| `docs/aktivfeuer-merkmale.md` | Merkmalsschema `FireFeatures` v1 + Kalibrierung |

## Harte Regeln (gelten für jede Session)

- **Oberste Direktive: Funktionserhalt.** Keine bestehende Funktion wird entfernt, versteckt oder
  „vereinfacht". Umgruppieren ja, Weglassen nein — Ausnahmen nur mit expliziter Freigabe durch Jan.
- **Diagnose-First:** Diagnose → Plan → Implement → Verify → Gate. Kein Code vor schriftlicher Diagnose
  (`audit/<thema>.md`). Gates werden nur mit Beleg (Screenshot-Pfad, Trace, Konsolen-Auszug,
  Verifier-Output) abgehakt.
- **Ein Thema = eine Phase = ein Gate.** Keine zwei Features parallel in einer Session anfassen. (Für
  parallele Agent-Teams gelten die Zuständigkeits- und Konfliktregeln in `agents.md`.)
- **Desktop-Regression = Phase fehlgeschlagen.** Mobile-Änderungen nur per Media Query isoliert.
  Breakpoints: 767 px (mobil) / 1439 px (Desktop-Groß) — keine Ad-hoc-Breakpoints. Safe-Area via
  `env(safe-area-inset-*)`.
- **STOPP & FRAGEN (Jan) bei:** Shader-/WebGL-Pipeline-Änderungen, Fusion-Engine-Änderungen, Löschen von
  Komponenten, Dependency-Upgrades, Änderungen an Edge Functions/Warm-Crons/Manifest-Mechanik, allem
  Irreversiblen. Prod-Dispatch der Crons, Purges gegen das CDN, Pushes und Kopien in die Daten- und
  Archiv-Repos sind Jans Gate.
- **Mobile-GPU-Fallen:** kein Verlass auf `EXT_color_buffer_float`; explizite `highp`-Deklarationen;
  RGBA8-Packing-Pfad nicht anrühren. Performance-Regelung ausschließlich über den `FrameGovernor`
  (FPS-Leiter zuerst, Trail-0,5× als letzter Hebel, Partikelzahl ist **kein** Hebel).
- **Ehrlichkeit ist Produktprinzip:** Unsicherheiten, Datenlücken und Länder-Asymmetrien (z. B.
  UV/Pollen/Warnungen DE-only) werden ausgewiesen, nie kaschiert. Experten-Layer (z. B. Rotation) tragen
  konservative Formulierungen — nie „Tornado"-Sprache. Kein Wert ohne Herkunft: nur `measured` wirkt
  stillschweigend, `set`/`literature` wird gekennzeichnet (Provenienzregel der Punktlinie).
- **Flag-Gating („Rule 2"):** Neue Rechenpfade ersetzen alte nie direkt; sie kommen default-off hinter
  Flags mit benanntem Fallback.
- **Design-Standard Command-Deck (D-27):** Alle neue UI entsteht im Command-Deck-System (hell, Sand/Ink,
  League Spartan, Topbar+Rail+Dock, Feature-Token-Namespaces); Alt-Themes werden migriert, nie erweitert.
- **Verbesserungs-Pflicht (D-28):** Jede gefundene Verbesserung wird als `V-NN`-Eintrag in
  `improvements.md` festgehalten — immer mit Mehrwert (für Jan verständlich) und Umsetzungsskizze
  (bis zur Wiederherstellung der Datei: im Phasendokument).
- **Historie gehört nicht in diese Datei.** Was wann umgesetzt wurde, steht in den `audit/*.md` (und in
  `audit/chronik-statusblock-2026-09-16.md` für die Zeit bis zum 16.09.) — der Statusblock oben hält nur den
  aktuellen Stand fest, keine Chronik. Beim Etappenwechsel wird er ersetzt, nicht verlängert.

## Verifikation

- **Kein Test-Framework** (bewusste Grundsatzentscheidung): stattdessen Headless-Verifier `npm run verify:*`
  (ein `.mjs`-Skript je Thema unter `scripts/`, teils gegen echte Module/Live-Server importiert). Stand
  zuletzt ausgezählt (2026-08-28): **56 npm-Aliase / 57 Harnische**, seither dazu `verify:point-data`,
  `verify:point-client`, `verify:punktarchiv`, `verify:pv-score`, `verify:pv-latency` — Einzelzahlen je Phase
  stehen im jeweiligen `audit/<thema>.md`; bei Bedarf neu zählen statt fortschreiben (BW-1).
  `npm run typecheck` muss vor jedem Gate grün sein; `npm run build` + `npm run budget` (Ratsche eagerJs /
  largestChunk / totalJs) bei jeder Änderung an `src/`.
- **UI-Verifikation:** Chrome DevTools MCP (Desktop 1440×900, iPhone 12 Pro 390×844 DPR 3). Emulation ist
  für WebGL **nicht** repräsentativ — GPU-kritische Aussagen brauchen Real-Device (scrcpy/ADB), Jan
  informieren. In-App-Browser pausiert rAF → WebGL-Karten nur im Vordergrund-Browser verifizieren.
- Vor jedem Gate: die fünf Selbstverifikations-Fragen schriftlich mit Beleg beantworten (1 Funktionserhalt
  einzeln, 2 Desktop pixelgleich, 3 Touch-Targets ≥ 44 px, 4 Konsole sauber, 5 keine Long Tasks > 200 ms).
- Verifier laufen ohne Rückfrage, im Repo per PowerShell, nie mit `2>&1`.

## Sprache & Konventionen

- Dokumentation auf **Deutsch**, Prompts an Claude Code auf **Englisch**, Code/Kommentare/Commits auf
  Englisch (Bestand ist gemischt — bei Neuanlage Englisch).
- **Namensregel „buscosun Fusion" (Jans Festlegung 2026-09-06):** Der Punkt-Algorithmus in
  `src/pointForecast/fusion/` heißt im Projekt **immer „buscosun Fusion"** — in Doku, Code-Kommentaren,
  Commits und UI. Keine Umschreibungen („Punkt-Fusion", „point engine", „die Fusion", „der Algorithmus").
  Der Ordner bleibt `fusion/`; die erwogene Umbenennung nach `predictive/` ist damit erledigt.
  **Abgrenzung:** `src/fusion/` ist etwas anderes — der IDW-Rasterisierer der 2D-Karte, Name historisch
  (s. `audit/rasterfusion-rueckbau.md` §2). Wo beides gemeint sein könnte: „buscosun Fusion" für den Punkt,
  „Rasterfusion" für die Karte. Der Cube in `buscosun-data/point/` ist die vorgerechnete Hälfte von buscosun
  Fusion (PAP 2), die Laufzeit-Hälfte (PAP 1, 3–6) macht daraus die Punktvorhersage.
- **Bezeichnung „buscosun Fusion 6" (Jans Festlegung 2026-09-30, `audit/fusion-ausbau.md` §6g.6):** Wer im Projekt
  „buscosun Fusion 6" sagt, meint **genau diesen eingefrorenen Stand** und nichts Neueres: Client `a02f2b5` (30.09.), Cube-Pfad
  in der Stufe `fs` (Lernstufe Fit 5e mit `learnedSpeed`/`learnedPrecip`/`learnedAtPoint`/`learnedClouds`, `priorShrink: false`,
  Stationswert, Anomalie-Interpolation, Route 1; `ensMember`/`climaGrid`/`incaAnchor` aus, Stationsmember MOSMIX-L) mit den
  Tabellen des Daten-Repo-Commits **`1aaec969`**: `point/fusion.client.json` (Fit 5e + 16 Wolkenatome, sha256 `0714300fe2a5…`),
  `point/stack.client.json` (701 Einträge: Landesparameter für T/Wind/Böe, Td gepoolt, sha256 `9d22ff35986f…`),
  `point/static/clima/v1` unverändert seit FS; Cube-Schema 6. Gemessen am Archiv 16.–28.09. (Spalte F in
  `audit/fusion-ausbau/now-vs-5e-b.md`): gegen Fit 5e MAE 23 von 36 Zellen signifikant besser, 0 schlechter. **Vorgänger:**
  „buscosun Fusion 5e" = `product@5e` (Kette der Validierung FV, 27.09.). Jede Änderung an Tabellen, Stufen-Optionen oder Kette
  ergibt eine **neue Nummer** (7, 8, …) — die 6 wird nie umgehängt.
- Commits: Conventional Commits, Scope = Feature-/Themenname. Keine Commits ohne Auftrag.
- Nach jeder Phase: Statusblock oben ersetzen, Phasendokument mit Gate-Belegen abschließen, `MANUELLE-SCHRITTE.md`
  um Jans Gates ergänzen (bis `checklist.md`/`context.md` wiederhergestellt sind).
