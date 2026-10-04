# NP-0 — Datenprodukte für Regenradar 2.0: Rückblick 2 h + Blitz-Spiegel (NP-0a) · Vorhersage-Felder aus dem Cube (NP-0b)

> Stand: 2026-10-03 (Plan, vor Diagnose). Auftrag Jan 03.10. nach Abschluss von Phase RR: „aktualisiere dann die MD-Dateien
> für diese zwei Aufgaben: 2 · NP-0a · 2 h Rückblick, Blitz-Spiegel in buscosun-data · M · dein Push ins Daten-Repo /
> 3 · NP-0b · Vorhersage-Felder aus dem Cube für die Karte (läuft beim Punkt-Cron mit) · M · dein Push ins Daten-Repo".
> Konzept: `audit/niederschlagsplattform-konzept.md` §8/§9 (Claude-Doc
> <https://claude.ai/code/artifact/7f93924e-2bfd-446b-a2f6-0601f456da2c>). Teil 1: `audit/regenradar-datenangleich.md`
> (V-RR-1 Blitze ohne Zeitachse, V-RR-2 Rückblick 45 min, V-RR-12 Zellbahnen im Rückblick). Kickoff: `prompt-np0.md`.
> **Zwei Phasen, zwei Gates, zwei Commits** (ein Thema = eine Phase). Beide liefern **Daten**, keine Oberfläche: was der
> Nutzer sieht, ändert sich erst in NP-1 (Zeitachse 2.0) und NP-2 (Prognose-Stil). Push, Kopie ins Daten-Repo, Purge und
> Dispatch sind Jans Gate.

## 0. Kurzfassung für Jan

1. **NP-0a** legt im Radar-Spiegel (`radar/`, Job `radar.yml`) zwei Dinge ab: die **gemessenen Analysen der letzten 2 h**
   (RV `f000`, CH-rzc, KONRAD-Zellen — heute nur 1 h) und **Blitze mit Zeitachse** (DWD `Blitzdichte` für DE, EUMETSAT
   MTG-LI für DACH — heute live ohne Zeit). Kein neuer Job, kein zusätzlicher Push-Takt: der laufende Spiegel nimmt es mit.
2. **NP-0b** rechnet im Punkt-Cron (`point.yml`) nach jedem Stufenbau **Kartenfelder** aus dem fertigen Cube:
   Regen-Chance, Menge „wenn es regnet" und ungünstiger Fall (q90) je Stunde, dazu die Schneefallgrenze mit Spanne — als
   kleine PNGs unter `point/field/v1/`. Ein Feld-Fehler nimmt nur die Felder, nie den Cube.
3. **Zwei Korrekturen am Konzept** (§1.2): (a) Die 150-MB-Paketgrenze von jsDelivr ist für dieses Repo offenbar **nicht
   bindend** — `point/` allein ist größer und wird ausgeliefert; die Begründung „Tars bleiben 12 wegen 150 MB" fällt, die
   Entscheidung bleibt (der Rückblick braucht keine Tars). (b) „P(nass) = dieselbe zensierte Verteilung wie der Motor,
   `fusion/dist.ts`" war zu kurz: Der Motor baut die Regen-Hürde in einer Kette (K-2 in `fuse.ts`, gelernte Hürde,
   `precipCal`); `dist.ts` liefert nur die Quantile daraus. Was die Karte als „Chance" zeigt, ist deshalb **Jans
   Entscheidung auf Messbasis** (E-NP0-4).
4. **Vor dem Start:** Phase RR ist noch uncommitted. NP-0 fasst andere Dateien an, aber der Punkt-Cron und der Spiegel
   klonen `buscosun-web/main` — RR erst committen (eigener Commit), dann NP-0.
5. **Deine Pushes am Ende:** je Phase (i) `buscosun-web` pushen (die Jobs klonen den Producer von `main`), (ii) die Kopie
   ins Daten-Repo (`scripts/radar-mirror.mjs` bzw. `.github/workflows/point.yml`, README), (iii) den nächsten Job abwarten
   oder selbst auslösen, (iv) den Live-Verifier laufen lassen. Details §6.

## 1. Ausgangslage (gelesen am Arbeitsbaum 03.10.2026 — Anker prüfen, Zeilen wandern)

### 1.1 Befund

| Baustein | Heute | Anker |
|---|---|---|
| Spiegel-Retention | **eine** Zahl `KEEP = 12` für Roh-Tars, KONRAD-XML **und** alle Bild-Produkte; Workflow setzt `KEEP: '12'` | `scripts/radar-mirror/radar-mirror.mjs:47`, `storePut` :135, `imgPrune` :148; `workflow-radar.yml:73` |
| RV-Bild-Slots | alle 12 Slots **voll** (25 Frames + `meta.json` + Stundenmittel `m<lead>.png`); „volle Slots nur für die jüngsten 3" ist ein dokumentierter **Hebel** (`radar-datenrepo.md` §14.1), nicht der Stand | lokaler Klon 30.09.: `img/v1/rv` 12 Slots, 312 Dateien, 10,2 MB |
| Roh-RV | HDF5-Tar seit EX-3: **3,66 MB je Slot** ⇒ 12 × = 43,9 MB (nicht 1,4 MB wie in §3.4 von `radar-datenrepo.md` gerechnet) | `status.json` 30.09., `radar/rv/` |
| Push-Takt | je 5 min RV (DWD +3:13 → Push +3:26), KONRAD (+5:00), rzc (+0:50…1:10), dazu INCA je 15 min ⇒ ≈ 3–4 Pushes je 5 min | `radar/status.json` `recent[]` |
| Rückblick DE | `seedDePastArchive(DE_PAST_SEED_FRAMES = 9)` → `fetchRvAnalysisSequence` liest `rv/<slot>/f000.png`, aber nur solange `rvImgEligible` (≤ `RADAR_CDN_WINDOW_MS` = 55 min), sonst Tar | `radar/radarFrames.ts:119`, `sources/radolan.ts:359/519`, `sources/radolanRuns.ts:49/172` |
| Rückblick CH | nur aus dem Sitzungs-Cache (`pastFrames('meteoswiss_rzc')`) — der Spiegel hält 12 rzc-Slots, niemand liest sie rückwärts | `radar/radarFrames.ts` `loadCh` |
| Rückblick AT | keiner — INCA-Nowcast hat keine Analyse (Leads 15…180 min) | `sources/radarImg.ts` `INCA_IMG_LEADS` |
| Zellbahnen im Rückblick | aktueller KONRAD-Lauf (V-RR-12); `cells.json` liegt je Slot, 12 Slots | `radar/img/v1/konrad3d/<stamp>/cells.json` |
| Blitze | beide Karten live `dwd:Accumulated_Flash_Area` per WMS **ohne TIME** (V-RR-1); empfohlen sind L1 `dwd:Blitzdichte` (DE, WMS-T, 5 min, 15-min-Fenster, 0–127 nichtlinear, GeoNutzV) + L2 `mtg_fd:li_afa` (DACH, WMS-T, 2 km, CC BY 4.0, Parallaxe) | `sources/dwdLightning.ts`, `sources/wmsTime.ts`, `docs/DATA_SOURCES.md` §7 |
| Punkt-Cron | drei Stufen-Jobs + `stations-s`, eine Concurrency-Gruppe; t1 gemessen max. 14,2 min bei `JOB_MAX_MIN` 20, CDN-Budget 240 s; Regeln A–F gegen die Kartenlinie im Verifier | `scripts/repack-repo/workflow-point.yml`, `scripts/verify-point-data.mjs:837` |
| Publisher | `PUBLISH_PATHS = [point, .gitattributes]`; Lauf-Verzeichnisse nur `^\d{10}$` (`runsIn`) — ein `point/field/` wäre kein Lauf, muss aber in Prune und CDN-Sync | `scripts/point/sparseCover.mjs:23`, `prune.mjs`, `publish-point.mjs:141`, `cdnSync.mjs` |
| Cube-Niederschlag | Ebenen `precip` (Mittel), `_sd` (σ_div), `_sd_ens`, `_q10/_q90` (nur C-LAEF-EPS), `_ens` (t3); `snowlmt` mit `_sd` und Quantilen | `src/point/cubeFormat.ts:246`, `buscosun-data/README.md` |
| Regen-Hürde des Motors | K-2: Auftreten im Probit-Latentraum mit der Orts-Klimatologie (`wetProbDaily`), Menge lognormal; danach gelernte Hürde und `precipCal`. `precip_sd` wird **nicht** als σ benutzt | `pointForecast/fusion/fuse.ts:786–850`, `cubeSource.ts:958/1547–1564`, `fusion/dist.ts:253` |

### 1.2 Korrekturen am Konzept (03.10. Konzept §8 — hier richtiggestellt, im Konzept nachgezogen)

- **150 MB:** Im lokalen Klon (Stand 30.09., Listing nach 2 000 Einträgen abgeschnitten) liegen unter `point/` schon
  **≥ 276 MB** (t1 87–91 MB je Lauf), dazu `radar/` ≈ 55 MB und `runs/` — und jsDelivr liefert Chunks und Radarbilder aus
  (RR-Mitschnitte §2.7). Die Grenze bindet für GitHub-Einzeldateien also nicht in der dokumentierten Form. **D-NP0-1 misst
  das am Remote** (Baumgröße je Verzeichnis an `origin/main`, ein Abruf je Linie). Grund, die Roh-Tars bei 12 zu lassen, ist
  danach: niemand braucht sie für den Rückblick, sie kosten Kopierzeit je Push und Repo-Wachstum (V-RD-4).
- **P(nass) im Feld:** s. §1.1 letzte Zeile und E-NP0-4.
- **Ablage der Blitze:** statt `lightning/v1/…` (eigenes Wurzelverzeichnis) wird `radar/img/v1/lightning-*/…` empfohlen
  (E-NP0-2) — derselbe Job, Push, Seed, Prune, CDN-Basis und raw-Ausweichweg.

## 2. NP-0a — Rückblick 2 h + Blitz-Spiegel (Radar-Spiegel, `radar.yml`)

### 2.1 Ziel und Abgrenzung

- **Ziel:** 24 Slots (2 h) gemessener Analysen DE/CH + KONRAD-Zellen, und Blitze DE + DACH je 5 min, 24 Slots — im
  Daten-Repo, mit Vertrag, Verifier und Live-Beleg.
- **Nicht Teil:** jede Oberfläche (Zeitachse −2 h, Blitz-Frames im Slider, Farbe nach Alter, Blitze ≤ 10 km = NP-1);
  Radar v2 (NP-5a); Warm-up im Spiegel (V-RR-5/E-NL-2, gleiche Datei — eigene Phase, s. E-NP0-6); AT-Rückblick (keine
  Analyse im Spiegel, V-NP0-2).
- **Funktionserhalt:** jede heutige Datei unter `radar/` entsteht byte-gleich wie heute (Roh-Tars, XML, volle RV-Slots,
  `m<lead>.png`, INCA, rzc, KONRAD) — der neue Code fügt nur hinzu und hält Älteres länger.

### 2.2 Diagnose (vor Code, Ergebnis in §8)

| # | Frage | Wie |
|---|---|---|
| D-NP0-1 | Baumgröße an `origin/main` je Wurzel (`runs/`, `radar/`, `point/`) und ob jsDelivr in diesem Zustand Einzeldateien liefert | `git ls-tree -r -l origin/main` in einem **Scratch-Klon** (sparse/blobless), Summen; je Linie ein GET über jsDelivr |
| D-NP0-2 | Wer liest ältere Slots unter `radar/img/v1/`? (Rückblick, Stundenmittel `m<lead>` in buscosun Fusion 8, Verifier, Dashboard) | Code-Suche nach `rvImgDir`, `incaImgDir`, `rzcImgDir`, `konrad…`, `RADAR_CDN_WINDOW_MS`, `point/nowcastFormat.ts` |
| D-NP0-3 | Push-Kette heute: Lag DWD→Push, Push-Dauer, Versuche, Pushes/Tag, Repo-Größe (GitHub-API `size`), Naht zwischen zwei Jobs | `radar/status.json` live lesen (GET), Actions-Läufe lesen |
| D-NP0-4 | Blitzquellen live: TIME-Ausdehnung beider Layer, **Latenz** (jüngste TIME gegen Wanduhr, ≥ 60 min Stichprobe), GetMap-Dauer und -Bytes für einen festen Ausschnitt in EPSG:3857, Rückgriff auf vergangene TIME-Werte (Backfill 2 h) | `GetCapabilities` (Per-Layer-Dienst wie `wmsTime.ts`), GetMap mit `TIME=` |
| D-NP0-5 | **Werte statt Farben:** liefert ein Weg Zahlen? Reihenfolge prüfen: WCS `GetCoverage` (GeoTIFF), WMS `format=image/geotiff`, Stil `raster`, Legende/SLD (`GetLegendGraphic`, `GetStyles`) für eine **exakte** Rückabbildung Farbe → Klasse. Für `li_afa`: Einheit und Zeitfenster aus dem Layer-Abstract | Proben, Rundlauf Farbe→Klasse→Farbe auf echten Frames |
| D-NP0-6 | Lizenz-Wortlaut heute: GeoNutzV-Quellenvermerk (DWD), EUMETSAT CC BY 4.0 + Datenpolitik; Hinweis „NowCastMix verarbeitet kommerzielle Bodennetzdaten, das Raster ist offen" | Quellen lesen, wörtlich zitieren |
| D-NP0-7 | Verträgt der Takt die Blitz-Abrufe? Das 11-s-Budget DWD→Push für RV darf nicht leiden | GetMap-Dauern aus D-NP0-4 gegen die Schleife in `main()` |
| D-NP0-8 | Trägt der Force-Push der Kartenlinie (`publish-repack.mjs`) neue Unterverzeichnisse unter `radar/` unverändert weiter? Wie seedet der Nachfolger-Job (`storeSeed`) neue Quellen? | Code lesen, Test gegen Bare-Repo (Muster `radar-datenrepo.md` §11.2) |

### 2.3 Plan (nach Jans Entscheidungen E-NP0-1…3)

| Schritt | Inhalt |
|---|---|
| NP-0a-1 Vertrag Rückblick | In `src/sources/radarImg.ts` (Primitiven in `radolanRuns.ts`): Pfad der Rückblick-Ablage (E-NP0-1), `RV_PAST_KEEP = 24`, eigenes Zeitfenster `RADAR_PAST_WINDOW_MS` (24 Slots minus Reserve, aus D-NP0-3 hergeleitet), `rvPastEligible(ts, now)`; rzc und KONRAD erhalten `KEEP 24` im Vertrag. `RADAR_CDN_WINDOW_MS` und alle heutigen Gates bleiben |
| NP-0a-2 Vertrag Blitze | Neue Datei `src/sources/lightningImg.ts` (eine Vertragsadresse für Producer, Client, Verifier — Muster `radarImg.ts`): Pfade je Quelle, Bild-Raster (EPSG:3857-Ausschnitt, Breite × Höhe, Ecken), Kodierung (E-NP0-3), `meta.json` mit `validAtMs`, `windowMin` (Blitzdichte 15, MTG aus D-NP0-5), Klassen-Tabelle/Einheit, Quelle, Lizenz-Text, Parallaxe-Hinweis (MTG), Bauer + Prüfer, Gate `LIGHTNING_GATE_MS` (aus D-NP0-4 gemessen), Kill-Switch Client `?ltg=0` (Muster `radarImgFlagFrom`) |
| NP-0a-3 Producer Retention | `radar-mirror.mjs`: Retention **je Quelle** (Roh 12, RV-Bild 12, Rückblick 24, rzc 24, KONRAD-Bild 24, INCA 12, Blitze 24); Schalter `PAST_KEEP` (Voreinstellung 24, `12` = alter Stand); `status.json` Schema 3 mit der Keep-Tabelle |
| NP-0a-4 Producer Blitze | `pollLightning()` in der Schleife (Muster `pollInca`): je Quelle jüngste TIME lesen, fehlende Slots holen (Backfill bis 24 beim Start), ableiten (Kindprozess wie `derive`, eigene Quelle im Derive-Skript oder `lightning-derive.mjs`), **ohne eigenen Push** — die Dateien fahren beim nächsten Produkt-Push mit; nur wenn 5 min lang nichts gepusht wurde, eigener Push. Fehler nimmt nur die Blitze. Schalter `LIGHTNING=0` |
| NP-0a-5 Kopien | Vorlage `scripts/radar-mirror/radar-mirror.mjs` = Daten-Repo `scripts/radar-mirror.mjs` (Verifier vergleicht CRLF-normalisiert); `workflow-radar.yml` nur ändern, wenn eine neue Variable nötig ist; README-Vorlage `scripts/repack-repo/README.md` (Abschnitt Radar-Spiegel, Aufbewahrung) |
| NP-0a-6 Lokaltest | Bare-Repo + simulierter Force-Push + Naht (Neustart ⇒ Seed): echte Quellen, verkürzte Keeps (z. B. 3/6), ≥ 30 min Laufzeit; danach dieselbe Logik mit Voreinstellung im Trockenlauf |
| NP-0a-7 Verifier | `scripts/verify-np0-radar.mjs` + `npm run verify:np0-radar`: netzfrei (Vertrag-Rundlauf, Prüfer mit Negativkontrollen, Prune je Quelle an einem synthetischen Bestand, Blitz-Dekodierung an aufgezeichneten Fixtures, Byte-Gleichheit der heutigen Derive-Ausgabe gegen HEAD + Negativkontrolle) und `--live` (nach Jans Push: 24 Rückblick-Slots DE/CH/KONRAD, 24 Blitz-Slots je Quelle, Metas bestehen den Prüfer, Lag aus `status.json`) |

### 2.4 Gate G-NP0a

| Frage | Beleg |
|---|---|
| 1 Funktionserhalt | Derive-Ausgabe der heutigen Produkte byte-gleich zu HEAD (echter Tar/XML/HDF5/NetCDF, + Negativkontrolle); heutige Client-Gates und Fenster unverändert (`git diff` der Konstanten); `verify:radar-repack`, `verify:radar-runs`, `verify:radar-fallback`, `verify:precip-source`, `verify:cells` grün |
| 2 Takt | RV-Lag DWD→Push im Lokaltest nicht schlechter als `status.json` heute (Median, Maximum); Pushes je Stunde nicht mehr als heute + 1 |
| 3 Größe | Zuwachs `radar/` gemessen (trocken + nass hochgerechnet aus Bytes je Slot), Baumgröße D-NP0-1 dazu |
| 4 Ehrlichkeit | Meta trägt Fenster, Einheit, Lizenz, Parallaxe; Blitzdichte-Frames als **überlappend** gekennzeichnet (nie aufsummieren); AT ohne Rückblick, CH/AT ohne Bodennetz-Blitze benannt |
| 5 Rückweg | `PAST_KEEP=12` und `LIGHTNING=0` stellen den heutigen Spiegel her (Lokaltest belegt); Client-Kill-Switch `?ltg=0` vorhanden |
| Verifier | `typecheck`, `verify:np0-radar` (neu), die fünf Radar-Verifier aus Frage 1, `build`, `budget` |
| Live (nach Jans Push) | `verify:np0-radar --live` grün, nachdem der Spiegel ≥ 2 h mit dem neuen Stand lief |

Ausgefüllt mit Belegen: §8.5 (Gate G-NP0a, 03.10.).

## 3. NP-0b — Vorhersage-Felder aus dem Cube (Punkt-Cron, `point.yml`)

### 3.1 Ziel und Abgrenzung

- **Ziel:** je Stufe und Vorlauf ein Kartenfeld Niederschlag (Chance, Menge | nass, q90) und Schneefallgrenze (Mitte +
  Spanne + Herkunft), gerechnet aus **genau dem Cube**, der veröffentlicht wird, im selben Job, mit eigenem Manifest.
- **Etikett:** „Modell · Cube" — nie „buscosun Fusion 8" (dem Feld fehlen Stationen, Radar und Gelände am Ort; Konzept §2).
- **Nicht Teil:** Darstellung (Punktraster, Konturen, Gürtel = NP-2/NP-3), Fusion 8 je Zelle, neue Quellen im Cube,
  Änderungen an buscosun Fusion (Motor, Tabellen, Optionen).
- **Funktionserhalt:** Chunks, `run.json`, `point/index.json`, Stationsprodukte entstehen byte-gleich mit und ohne Felder.

### 3.2 Diagnose (vor Code, Ergebnis in §8)

| # | Frage | Wie |
|---|---|---|
| D-NP0-9 | Einheit und Bedeutung von `precip` je Stufe (Rate mm/h als Intervallmittel? Summe über 3/6 h?) und von `snowlmt` (m ü. NN? Modellgrenze?); welche Ebenen wo belegt sind (`_q10/_q90` nur C-LAEF-EPS-Gebiet, `_ens` nur t3) | `cubeFormat.ts`, Manifest `planes`, ein echter Chunk je Stufe aus einem Scratch-Klon |
| D-NP0-10 | Wie rechnet buscosun Fusion 8 am Punkt **ohne** Station und Radar die Regen-Hürde aus der Cube-Zelle (K-2 → gelernte Hürde → `precipCal`)? Welche Eingaben braucht die Kette je Zelle (Klimatologie `wetProbDaily`, Lerntabellen aus `fusion.client.json`, `precip-cal.client.json`), und lässt sie sich **ohne Änderung** am Motor je Zelle aufrufen? | `fuse.ts` (`fuseHour`, Niederschlagsblock), `cubeSource.ts` (Lernhürde, `precipCal`), `point/fusionFit/predict` |
| D-NP0-11 | Wie bildet Fusion 8 die Spanne der Schneefallgrenze am Punkt (q10/q90 gemessen, σ_div, σ_ens)? Das Feld folgt derselben Regel | `output.ts`, `uncertainty.ts`, `cubeSource.ts` |
| D-NP0-12 | **Messung für E-NP0-4** (§4): drei Kandidaten für die Chance an den Scorer-Punkten des Archivs (`buscosun-archiv`, Ausgabetage 14.09.–01.10., Vorlauf 3–48 h, gemessen = Radar-Analyse ≥ 0,1 mm/h wie im Scorer): Brier, Zuverlässigkeit (10 Klassen), Abstand zu Fusion 8 am selben Punkt. Reicht das Archiv nicht, so weit wie möglich und den Rest benennen — **kein neuer Sammler in dieser Phase** | Werkzeuge der Phasen FL/FV/AX wiederverwenden |
| D-NP0-13 | Laufzeit und Größe: Feldschritt je Stufe lokal (× 2 Runner-Faktor, CLAUDE.md), Bytes je Lauf und Stufe, Wirkung auf `JOB_MAX_MIN`, CDN-Budget und die Regeln A–F | lokaler Lauf gegen einen echten Lauf im Scratch-Klon |
| D-NP0-14 | Publisher, Prune, CDN-Sync, Index: was muss `point/field/` kennen (Altersregel je Stufe, Purge veränderlicher Dateien, Wärmen unveränderlicher, `timeless`-Liste)? Lesen die heutigen Leser `point/index.json` tolerant gegenüber Unbekanntem? | `publish-point.mjs`, `prune.mjs`, `cdnSync.mjs`, `src/point/manifest.ts`, `read-point.mjs` |

### 3.3 Plan (nach Jans Entscheidungen E-NP0-4…5)

| Schritt | Inhalt |
|---|---|
| NP-0b-1 Vertrag | Neue Datei `src/point/fieldFormat.ts` (rein, Muster `radarImg.ts`/`cubeFormat.ts`): Pfade `point/field/v1/<lauf>/<stufe>/precip-<lead>.png`, `snowlmt-<lead>.png`, `field.json` je Stufe und Lauf, `point/field/v1/index.json` (jüngster Lauf je Stufe, veränderlich ⇒ Purge); Raster = `TIERS` aus `cubeFormat.ts` (Ecken, Schritt, nx × ny); Kodierung als Konstanten mit Kodierer **und** Dekodierer; Bauer + Prüfer; Etikett `label: "Modell · Cube"`, `provenance: "cube"`; Version `v1` (Formatwechsel ⇒ `v2`) |
| NP-0b-2 Kodierung (Vorschlag, D-NP0-9/13 bestätigen) | **precip** RGBA: R = Chance P(nass) 0…1 linear; G = Menge, wenn es regnet (Median \| nass); B = q90 unbedingt („ungünstig"); G/B log-kodiert (`1 + round(254·ln(1 + x/x₀)/ln(1 + xMax/x₀))`, 0 = trocken, x₀/xMax aus D-NP0-9); A = 255 gültig, 0 fehlt (**fehlt ≠ 0**). **snowlmt** RGBA: R = Mitte, G = untere, B = obere Grenze (20-m-Schritt, Sättigung benannt), A = Herkunft der Spanne (0 fehlt, 1 Quantile einer Quelle, 2 σ_div, 3 σ_ens — nie gemischt, CLAUDE.md „Quantile einer Quelle nie mit σ verrechnen") |
| NP-0b-3 Producer | `scripts/point/build-point-fields.mjs`: liest die eben gebaute Stufe mit **demselben Leser wie die Clients** (`read-point.mjs`/`cubeFormat.ts`), rechnet je Zelle und Vorlauf nach E-NP0-4, Quantile über `fusion/dist.ts` (`quantileOf`), schreibt PNG (`scripts/lib/png.mjs`) + `field.json`, aktualisiert den Feld-Index. Kein Eingriff in `build-point-cube.mjs` außer einem optionalen Aufrufpunkt; **ein Feld-Fehler beendet den Schritt mit Log, der Cube wird trotzdem veröffentlicht** |
| NP-0b-4 Workflow | Vorlage `scripts/repack-repo/workflow-point.yml`: je Stufen-Job ein Schritt zwischen Build und Publish (`POINT_FIELDS: '1'`, `continue-on-error`), Kopf-Kommentar und Zeitbudget nach D-NP0-13; Regeln A–F in `verify-point-data.mjs` neu gerechnet (E-NP0-5 b) |
| NP-0b-5 Publisher/Prune/CDN | `point/field/` in Prune (gleiche Altersregel je Stufe wie der Cube, mindestens zwei Läufe), CDN-Sync (Feld-Index purgen, Feld-PNGs nur wärmen — wie viele, aus dem Budget), Wächter „kein Feld ohne Manifesteintrag" |
| NP-0b-6 Verifier | `scripts/verify-np0-fields.mjs` + `npm run verify:np0-fields`: Kodierung Rundlauf mit Fehlerschranke; **Konsistenz-Probe** (Feldwert an ≥ 50 Zellen = Rechnung der gewählten Kette am Zellmittelpunkt, innerhalb der Quantisierung); Negativkontrollen (fehlende Ebene ⇒ A = 0, falsches Raster ⇒ Prüfer lehnt ab); Cube-Byte-Gleichheit mit `POINT_FIELDS=1` gegen `0` (+ Negativkontrolle); Laufzeit und Bytes; `--live` nach Jans Push |
| NP-0b-7 README | Vorlage `scripts/repack-repo/README.md`: Abschnitt „Kartenfelder — `point/field/v1/`" (Inhalt, Kodierung, Etikett, Aufbewahrung) |

### 3.4 Gate G-NP0b

| Frage | Beleg |
|---|---|
| 1 Funktionserhalt | Chunks, `run.json`, Index und Stationsprodukte byte-gleich mit/ohne Felder (+ Negativkontrolle); `verify:point-data`, `verify:point-client`, `verify:fusion-fit` wie an HEAD (bekannte Rotstellen an HEAD benannt, z. B. `verify:point-client` (10s)) |
| 2 Zeit | Feldschritt je Stufe gemessen; Regeln A–F grün mit den neuen Zahlen; CDN-Budget je Stufe nachgerechnet |
| 3 Größe | Bytes je Lauf und Stufe, Summe über die Aufbewahrung |
| 4 Ehrlichkeit | Etikett „Modell · Cube" im Manifest; Chance-Definition (E-NP0-4) mit Messwerten D-NP0-12 im Manifest-Text benannt; Spannen-Herkunft je Pixel; fehlt ≠ 0 |
| 5 Rückweg | `POINT_FIELDS=0` ⇒ Job wie heute (Lokaltest), alte Leser unberührt |
| Verifier | `typecheck`, `verify:np0-fields` (neu), `verify:point-data`, `build`, `budget` |
| Live (nach Jans Push) | `verify:np0-fields --live` nach je einem t1-, t2- und t3-Lauf |

Ausgefüllt mit Belegen: §8.6 (Gate G-NP0b, 04.10.).

## 4. Entscheidungen (Jan) — die Phase legt sie mit Messwerten vor und wartet

| # | Frage | Optionen | Empfehlung |
|---|---|---|---|
| **E-NP0-1** | Wo liegen die älteren Rückblick-Analysen? | (A) eigene Ablage `radar/img/v1/rv-past/<stamp>/f000.png` (unveränderlich, 24 Slots; die vollen Slots bleiben 12) · (B) RV-Slots ab dem 13. im Ort ausdünnen (nur `f000.png` bleibt; `meta.json` nennt dann Frames, die fehlen) · (C) alles auf 24 | **A** — ein Leseweg für alle 24, keine veränderte Datei unter festem Pfad, kein lügendes Meta; Doppelablage der jüngsten 12 `f000` kostet < 2 MB |
| **E-NP0-2** | Wo liegen die Blitze? | (A) `radar/img/v1/lightning-de/` + `lightning-mtg/` (derselbe Spiegel-Push) · (B) eigenes `lightning/v1/` (Konzept-Pfad, `publish()` muss zweites Wurzelverzeichnis führen) | **A** |
| **E-NP0-3** | Was steht im Blitz-Bild? | (A) **Werte** (Klassenindex/Wert als Grau + Klassen-Tabelle im Meta) — nur wenn D-NP0-5 einen exakten Weg findet · (B) das gestylte RGBA der Quelle unverändert | **A**, sonst B mit Hinweis: eigene Farben (`--np-flash-*`) und „Blitze ≤ 10 km" gehen dann nicht |
| **E-NP0-4** | Was zeigt die Karte als „Chance"? | (F1) die Niederschlags-Hürde der Fusion-Kette **mit dem Cube als einziger Quelle** (K-2 → gelernte Hürde → `precipCal`, Motor unverändert aufgerufen) · (F2) Spread der Quellen (σ_div/σ_ens) als zensierte Verteilung über `dist.ts` · (F3) keine Chance, nur Menge (Mittel, q90 wo vorhanden) | **F1**, wenn D-NP0-12 sie mindestens so gut wie F2 zeigt und D-NP0-13 die Laufzeit trägt — dann sagen Karte und Ort dieselbe Chance, bis auf Ort, Station und Radar. **F2 nicht ohne Messung:** der Motor selbst lehnt `precip_sd` als σ ab. F3 ist der Rückfall |
| **E-NP0-5** | Ablage und Zeitbudget der Felder | Ablage: (a) `point/field/v1/…` mit eigenem Index (keine Änderung an `run.json`/`point/index.json`) · (a′) unter `point/<lauf>/<stufe>/field/` im `run.json`. Zeit: (b) `JOB_MAX_MIN` t1 anheben (Regel A: 50 min Abstand trägt bis 30) · (b′) Felder nur für t2/t3 und t1 jeden zweiten Lauf | **(a)** und **(b)**, wenn der Feldschritt t1 ≤ 4 min (Runner) misst |
| **E-NP0-6** | Warm-up neuer Radar-Slots am CDN (V-RR-5/E-NL-2) im selben Umbau? | ja (dieselbe Datei) · nein (eigene Phase) | **nein** — ein Thema je Phase; eigener Antrag nach NP-0a |

## 5. Harte Grenzen (STOPP & FRAGEN)

- Kein Push, kein Commit ins Daten-Repo, keine Workflow-Datei im Daten-Repo, kein Purge, kein Dispatch gegen Produktion —
  Warm-up per GET ist erlaubt. Den lokalen Klon `C:\dev\buscosun-data` **nicht** verändern; Proben in einem Scratch-Klon.
- Keine Änderung an buscosun Fusion (`src/pointForecast/**` inkl. `fusion/*`, Tabellen, Optionen, `FUSION*`-Schalter) —
  nur aufrufen. Muss die Kette für F1 umgebaut werden, STOPP.
- Keine neue Abhängigkeit (PNG-Dekodierung, GeoTIFF, WCS: mit `node:zlib` und vorhandenen Modulen oder STOPP).
- Keine Änderung an Shadern, `MapView`, Router, Edge Functions; keine Oberfläche in NP-0.
- Vertrags-Konstanten der heutigen Produkte (`vMax`, Gates, Fenster, Pfade `v1`) bleiben.

## 6. Jans Gates (vorgezeichnet — die Phase schreibt sie als neuen Abschnitt in `MANUELLE-SCHRITTE.md`)

**NP-0a:** (1) Durchsicht + Commit (Scope `radar-mirror`), Push `buscosun-web` (der Spiegel klont `radar-derive.mjs` und
`src/` beim Jobstart von `main`). (2) `scripts/radar-mirror.mjs` ins Daten-Repo kopieren (+ README — die Vorlage ist der Kopie schon voraus: drei Zeilen
zum Stundenmittel `m<lead>.png`, E-AX-16), ggf.
`.github/workflows/radar.yml` (nur mit Nutzer-Token). (3) Der laufende Job liest das Skript nur beim Start — Nachfolger
abwarten (≤ 5 h 45) oder den Lauf abbrechen und `radar.yml` selbst auslösen. (4) Nach ≥ 2 h: `node --experimental-strip-types
--import ./scripts/lib/register-ts.mjs scripts/verify-np0-radar.mjs --live` (`npm run` schluckt `--`-Argumente, CLAUDE.md). (5) Rückweg: `PAST_KEEP=12`, `LIGHTNING=0` im Workflow.

**NP-0b:** (1) Durchsicht + Commit (Scope `point`), Push `buscosun-web` (der Punkt-Cron klont den Producer von `main`).
(2) `.github/workflows/point.yml` aus der Vorlage ins Daten-Repo kopieren (Nutzer-Token) + README. (3) Nächste Slots
abwarten (t1 `:40`, t2 `:30`, t3 `:55`) oder `point.yml` mit `tiers=t1` auslösen. (4) `verify-np0-fields.mjs --live` je Stufe (direkter `node`-Aufruf).
(5) Rückweg: `POINT_FIELDS: '0'`.

## 7. V-Katalog (Start)

- **V-NP0-1** Die Rechnung „Tars bleiben 12 wegen 150 MB" (Konzept 03.10.) hielt dem Baum nicht stand (§1.2); Mehrwert:
  Retention-Entscheidungen auf gemessener Grundlage. Skizze: D-NP0-1 in `radar-datenrepo.md` §14 nachtragen.
- **V-NP0-2** AT ohne Rückblick: der Spiegel hält nur den INCA-Nowcast. Mehrwert: Rückblick DACH-weit. Skizze: stündliche
  INCA-Analyse der GeoSphere (Datensatz-Name und Verzug erst prüfen) — eigener Antrag.
- **V-NP0-3** Die HDF5-Tars sind 2,6× so groß wie in `radar-datenrepo.md` §3.4 gerechnet (3,66 statt 1,4 MB). Mehrwert:
  ehrliche Budgetrechnung. Skizze: Tabelle §3.4/§14.1 mit `status.json`-Werten nachziehen.

## 8. Diagnose-Ergebnis und Umsetzung (füllt die Phase)

### 8.1 Diagnose (03.10., Arbeitsbaum nach dem RR-Commit, `main` ab `5bb8af1`)

Vier Diagnose-Stränge, je mit Belegen, Befehlen und Skripten in einer eigenen Datei unter `audit/np0-datenprodukte/`:
`diag-a-spiegel.md` (D-NP0-1/2/3/8), `diag-b-blitze.md` (D-NP0-4…7, Fixtures in `fixtures/`, Werkzeuge in
`blitz-werkzeuge/`), `diag-c-cube.md` (D-NP0-9/11/13/14, Prototyp `field-proto.mjs`), `diag-d-chance.md` (D-NP0-10/12,
Rohzahlen `diag-d-chance.json`, Skripte `diag-d-np0-chance.mjs`/`diag-d-np0-cost.mjs`). Laufzeiten der Stränge B–D wurden
unter gegenseitiger Last gemessen (CPU bis 100 %) — sie sind obere Schranken.

**Radar-Spiegel (NP-0a)**

| # | Ergebnis | Beleg |
|---|---|---|
| D-NP0-1 | Baum `origin/main` (`7b7d90b`) **336,7 MiB** in 4 777 Dateien (Trees-API, nicht abgeschnitten): `point/` 272,6 · `runs/` 38,6 · `road/` 16,3 · `radar/` 8,9 MiB (trockener Tag); GitHub `size` 433 MiB (Historie). jsDelivr liefert **jede Einzeldatei** (10/10 × 200, `@main` und `@<commit>`); nur Verzeichnis-/Paketabrufe antworten nach 15 s **403 „Package size exceeded the configured limit of 50 MB"**. Die Paketgrenze trifft also nur Listings, die kein Client nutzt (V-NP0-1 bestätigt) | diag-a §2 |
| D-NP0-2 | **Kein Leser fasst heute einen Slot älter als 55 min an:** DE-Rückblick 9 × `f000`, ML-Hindcast 4 × `f000`, rzc-Notweg ≤ 6 Slots, alle anderen nur den jüngsten. **Falle:** `src/point/nowcastFormat.ts` schreibt `keptSlots: 12` und „hält 12 Slots" ins veröffentlichte Punkt-Manifest (`manifest.ts:506`) — mit rzc 24 muss der Text mit | diag-a §3 |
| D-NP0-3 | DWD→Push RV Median 10 s / max 16 s, KONRAD 7 / 15 s (Slot→Push RV 3,9–4,0 min, KONRAD 5,5–5,7, rzc 1,4, INCA 17–21 min = Quellverzug); Push 0,9–1,4 s, 24/24 im ersten Versuch; ≈ 53 Commits/h auf `main` (road ≈ 10); Job-Nähte lückenlos (−2…−10 s), 1 Ausfall 47 min in 39 Läufen (26.09.). Seit 03.10. 12:47Z läuft das **Autobahnwetter** im selben seriellen Strang (`road.poll()`) | diag-a §4 |
| D-NP0-8 | Der Force-Push der Kartenlinie trägt neue `radar/img/v1/<quelle>/`, `road/` und `.tmp-`-Reste unverändert weiter (Code + Bare-Repo-Test). **Aber** `storeSeed()` und `imgPrune()` kürzen **jede** Quelle, auch unbekannte, auf das eine globale `KEEP` — im Test fiel `lightning-de` an einer Naht von 30 auf 3 Slots. ⇒ Retention je Quelle muss **im Kern** von `radar-mirror.mjs` stehen; ein Haken-Modul allein genügt nicht. Nach einem Ausfall holt der Spiegel nur `KEEP−1` Slots nach (Lücken im Rückblick, bis sie herausaltern — benannt) | diag-a §5 |
| Größe | Je Slot trocken/nass: RV `f000` + rzc + KONRAD bei 24 statt 12 Slots ⇒ **+0,1 MB trocken, +1,0 MB nass, +3,9 MB extrem**; Blitze 24 × 2 Quellen ≈ 0,2 MB ruhig, ≈ 0,6 MB Gewittertag. Gegen 337 MiB vernachlässigbar. Der Roh-Tar ist **0,69–0,71 MB** heute (trocken), 3,66 MB war ein Nass-Wert (V-NP0-3 umformuliert) | diag-a §5, diag-b §1.3 |
| Haken | Die Autobahnwetter-Linie hat ein Haken-Muster eingeführt (`ROAD_HOOK` → `scripts/road/road-mirror.mjs` aus dem Web-Klon: `seed`/`poll`/`copyInto`, Fehler nimmt nie den Radar-Push). Für Blitze empfohlen: **Haken-Modul im Web-Klon**, das in `MIRROR/img/lightning-*` schreibt ⇒ `publish()`/`storeSeed()` tragen die Dateien ohne `copyInto`; „kein eigener Push" = `poll()` liefert `null`, die Dateien fahren beim nächsten Produkt-Push mit. Der Kern-Eingriff (Retention je Quelle, Haken, `rv-past`-Kopie, `status.json` Schema 3) ist **einmalig**; spätere Blitz-Änderungen kommen über den Web-Push. `status.json` liest kein Code nach Schema (reine Telemetrie) | diag-a §6 |
| README | Die Kartenlinie legt die Daten-Repo-README bei jedem Lauf aus der Vorlage im Web-Klon neu aus (`publish-repack.mjs:183`) ⇒ **keine README-Kopie als Jans Gate** nötig. Die README nennt das Prinzip „Alter statt Anzahl" ⇒ für den Rückblick eine Altersregel (≤ 2 h, mindestens 2 Slots) statt einer Zahl | diag-a §7 |

**Blitze (NP-0a)**

| # | Ergebnis | Beleg |
|---|---|---|
| D-NP0-4 | 80 min, je 60 s, 79 Proben je Quelle, 0 Fehler, keine Slot-Lücke: **DWD Blitzdichte** erscheint 6,6–7,8 min nach Fensterende (Median 6,8), Quelle nie älter als 11,7 min; **MTG `li_afa`** 5,6–10,7 min nach Fensterende (Median 7,9), höchstens 14,7 min — der MTG-Stempel ist der **Fensterbeginn** (Katalog EO:EUM:DAT:0687), gegen den Stempel also 11–16 min. GetMap/WCS je Frame DACH (5,5–17,5 °E, 45,5–55,5 °N, 2 000 m Mercator, **668 × 880**): Blitzdichte 0,30 s Median / 0,64 max, 17 KB; MTG 0,48 / **7,0 s**, 5–16 KB; dazu 0,1–0,2 s CPU. Backfill 2 h geht (BD 26/26 in 8,5 s — davon ein erfundener Slot, s. Falle; MTG 24/26 in 26 s, die zwei jüngsten korrekt 404) | diag-b §1 |
| D-NP0-5 | **Werte sind exakt möglich, beide nur über WCS** mit nativem Ausschnitt + eigener Nearest-Abbildung auf das feste EPSG:3857-Raster (serverseitige Umprojektion rastet die Ränder ein). **BD:** WCS liefert das Rohfeld `GRAY_INDEX` (Float64, Nodata 9999); WMS auch als GeoTIFF nur Palette. **MTG:** die Quelle ist selbst ein RGB-Mosaik aus genau 20 Farben + Schwarz, Grünkanal streng fallend ⇒ Farbe ↔ Klasse 1…20 exakt (5 echte Frames, davon 4 DACH-Gewitter, 0 unbekannte Pixel). Styled WMS dagegen geglättet: 41 % der belegten Pixel ohne Klasse (DACH 01.08.2025). MTG-Klassen-Bedeutung nur ±1 belegt („Count / 5 min", 20 gleich breite Klassen, 20 = 20+). BD-Ganzzahligkeit 0…127 offen (in 24 h kein Blitz über DE) ⇒ `fractionalPx` im Meta | diag-b §2 |
| Fallen | **BD-WCS antwortet für jede Zeit (Zukunft, Zwischenzeit) 200 mit einem Null-Frame ohne 9999-Maske** — „fehlt" würde als „keine Blitze" gespeichert ⇒ Existenz nur über das TIME-Ende der Capabilities + Maskenprüfung. WMS meldet fehlende Zeit mit 200 + XML-Ausnahme. MTG zeitweise 503/500, Einzelabruf bis 7 s; MTG-Nil = keine Blitze **oder** keine Messung. BD deklariert 13 Monate Bestand, liefert ≈ 24 h | diag-b §3 |
| D-NP0-6 | DWD: „… dürfen unter den Bedingungen der Lizenz CC BY 4.0 unter Beigabe eines Quellenvermerks weiterverwendet werden" + Veränderungshinweis ⇒ „Datenbasis: Deutscher Wetterdienst (NowCastMIX-Blitzdichte), Werte auf eigenes Raster umgesetzt"; Blitzrohdaten von nowcast GmbH, für das Raster keine Beschränkung genannt. EUMETSAT: Core Data CC BY 4.0, Katalog `rights: NoConditions` ⇒ „Contains modified EUMETSAT Meteosat data 2026" — **Wortlaut aus dem Suchindex, gegen das Policy-PDF von Hand prüfen** | diag-b §4 |
| D-NP0-7 | Die Schleife ist seriell; ein Blitzabruf im `await`-Strang kostet typisch 1–2 s, schlimmstenfalls ≈ 8 s — gegen das ≈ 11-s-Budget DWD→Push **nicht tragbar**, wenn er in den RV-Durchlauf fällt. ⇒ Abruf als Hintergrund-Promise (höchstens einer zugleich, Frist 20 s), Capabilities je Quelle alle 30–60 s, Backfill ≤ 2 Slots je Durchlauf, kein `execFileSync`, Mitfahrt im nächsten Produkt-Push. Vorschlag **`LIGHTNING_GATE_MS` = 25 min** ab Fensterende (Quelle ≤ 14,7 + Abfrage ≤ 1 + Mitfahrt ≤ 5 + Push 0,5 + CDN ≤ 3), nach dem Live-Lauf nachschärfen | diag-b §5–§6 |

**Cube-Felder (NP-0b)**

| # | Ergebnis | Beleg |
|---|---|---|
| D-NP0-9 | `precip` = **mittlere Rate mm/h über (t − Δ, t]**, Δ = 1/3/6 h je Stufe (`build-point-cube.mjs:428`) ⇒ eine t3-„Rate" ist ein 6-h-Mittel, das Feld nennt `stepH`. `snowlmt` in m ü. NN; ICON-CH maskiert ohne Niederschlag (fehlt, nicht 0). Abdeckung (Läufe t1 `2026093018`, t2/t3 `2026093012`): Mittel 100 % überall; σ_div t1 82 %, t2/t3 100 %; σ_ens t1 nur 8/49 Schritte, t2 bis 60/72 h, t3 4/36 Schritte; q10/q90 t1 nur C-LAEF-EPS ≤ 51,45° N (60 %), t2 bis 60/72 h, t3 4/36; **`snowlmt` t1/t2 100 %, t3 0 %** (keine t3-Quelle führt sie), `snowlmt_sd_ens` 0 %. Max: Mittel 17,5 mm/h, q90 29,3; `snowlmt` 891…3 789 m | diag-c D-NP0-9 |
| D-NP0-10 | **F1 ist ohne Motor-Änderung aufrufbar:** `fuseCubePoint` je Zelle mit der Cube-Reihe der Zelle, `station: null`, `nowcast: []`, `obs: null`, `ClimaField` + `fusion.client.json`, Optionen der Stufe fs (`learned`, `learnedPrecip`, `learnedAtPoint`, `learnedClouds`, `priorShrink: false`, `anchorWindKm: 10`, `nowcastHourMean`). Gegenprobe: an 98,9 % von 191 529 Archivzeilen gleich Fusion 8 ohne eigene Station (bis auf Rundung), Brier-Differenz 0,0–0,3 %. **`precipCal` ist in Fusion 8 aus** ⇒ die Kette ist K-2 → gelernte Hürde (§1.1/§4 korrigiert, V-NP0-16). Pflicht-Eingänge, die eine Zelle nicht mitbringt: `elevationM` und ein Gelände-Block mit `scales.sampledCount > 0` (sonst keine Verteilung); neutrales Gelände ändert die Chance um Median 0,0001 / p99 0,0074, Brier gleich. **Kosten** (unter 84 % Fremdlast): t1 9,9 ms je Zelle (48 441 Zellen ⇒ ≈ 8 min lokal, **≈ 16 min Runner einfädig**), t2 3,8 ms (≈ 1,5 min Runner), t3 7,3 ms (≈ 0,5 min) | diag-d §1 |
| D-NP0-11 | Fusion 8 nimmt am Punkt den rohen Zellwert und das Band Wert ∓ 1,2816·σ mit σ = σ_ens, sonst σ_div (`output.ts:284–299`); die C-LAEF-Quantile q10/q90 benutzt es **nicht** (`cubeSource.ts:2063`). ⇒ Das Feld folgt dieser Regel: symmetrisches Band, Herkunft σ_ens/σ_div; die im Plan vorgesehene Herkunft „1 = Quantile einer Quelle" entfällt (wo beide vorliegen, läge sie unten im Median 382 m, oben 88 m neben dem σ-Band) | diag-c D-NP0-11 |
| D-NP0-12 | Archiv-Slots 16.09.–01.10. (15 Ausgabetage, 389 Stationspunkte, t1, Vorlauf 3–48 h, 219 538 Zeilen). **Wahrheit = Stationsstunde ≥ 0,1 mm** (wie der Scorer; Radar liegt im Archiv nur einmal je Slot — der Plan nahm die Radar-Analyse an). Tabelle unten. Nach Benjamini-Hochberg mit 15 Tagen kein Paar signifikant; die Bootstrap-Intervalle geben die Richtung | diag-d §2 |
| D-NP0-13 | Prototyp (F2/F3 + Schneefallgrenze, Dekodieren dominiert): lokal t1 8,4–13,9 s, t2 2,1 s, t3 0,9 s ⇒ Runner ×2 t1 ≈ 17–28 s. PNG je Lauf t1 3,66 MB (precip 28 KB, snowlmt 47 KB je Schritt), t2 0,43, t3 0,13 MB; ständig im Repo ≈ 13–18 MB, ≈ 31 MB neue Daten je Tag (+4 % gegen die Chunks). **F1 dominiert die Laufzeit** (D-NP0-10). t1-Job heute (Actions-API, 11 Läufe 02.–03.10.): **Median 11,4 min, max 16,5 min**, Bauschritt Median 9,0 / max 11,6 min (t2 max 19,3, t3 max 7,5). Regel B bindet zweimal (t1 hinter t2 ⇒ ≤ 25, `stations-s` hinter t1 ⇒ ≤ 24) ⇒ `JOB_MAX_MIN.t1` höchstens **24**, nicht 30 wie im Plan | diag-c D-NP0-13, Actions-API |
| D-NP0-14 | `git add` und der Sparse-Checkout decken `point/field/` schon ab (+ `*.png -text -diff` in `.gitattributes` empfohlen). `retainRuns` beschneidet nur `^\d{10}$` ⇒ Felder brauchen eine eigene Runde **im Publisher** (damit `POINT_FIELDS=0` den Altbestand trotzdem abbaut): ein Feld lebt, solange seine Cube-Stufe lebt. `classifyPointPath` ordnet `point/field/…` als „other" ein (weder Purge noch Warm-up) ⇒ Klassen `field-index` (purgen) und `field` (wärmen, nach `chunk`). Die heutigen Leser greifen per Schlüssel zu und vertragen Unbekanntes; `point/index.json`/`run.json` bleiben unberührt. Workflow-Schritt nach „Build point cube", `continue-on-error` **und** eigenes `timeout-minutes`; Bau-Ablage → Umbenennen → `field.json` zuletzt; überspringen, wenn das Feld für den Lauf schon da ist | diag-c D-NP0-14 |

**D-NP0-12 — Chance-Kandidaten** (Brier, in Klammern Skill gegen die Orts-Klimatologie; t1, 389 Stationspunkte, 15 Ausgabetage)

| Kandidat | 3–6 h | 7–24 h | 25–48 h | mittl. \|p − p_F8 ohne Station\| |
|---|---|---|---|---|
| **F1** Fusion-Kette, nur Cube (K-2 → gelernte Hürde) | 0,0268 (0,18) | 0,0256 (0,30) | 0,0281 (0,17) | 0,004–0,007 |
| F0 K-2 allein (ohne gelernte Hürde) | 0,0256 (0,22) | 0,0255 (0,30) | 0,0267 (0,21) | 0,017–0,035 |
| F2 Spread-Verteilung (σ_div/σ_ens, `dist.ts`) | 0,0326 (0,01) | 0,0306 (0,16) | 0,0350 (−0,03) | 0,040–0,066 |
| F3 nur Menge (0/1) | 0,0468 (−0,43) | 0,0430 (−0,18) | 0,0464 (−0,37) | — |
| Klimatologie | 0,0328 | 0,0365 | 0,0339 | — |
| Fusion 8 an der Station | 0,0246 | 0,0236 | 0,0258 | — |
| Fusion 8 ohne Station | 0,0266 | 0,0256 | 0,0280 | 0 |

F1 schlägt F2 um 19–25 % und die Klimatologie um 17–30 % Brier. F2 ist grob überkonfident (bei p ≥ 0,9 regnet es in
38–60 %; σ an 88 % der Zeilen 0). **F0 ist 0,5–4,8 % besser als F1** und besser kalibriert — F1 ist im Mittel zu nass
(p̄ 5,6–6,9 % bei 3,3–3,7 % Regenstunden; roh p 0,02–0,03, nach BH n.s.) ⇒ das ist ein Befund über buscosun Fusion
(V-NP0-17), kein NP-0-Thema.

### 8.2 Änderungen am Plan aus der Diagnose

- **§1.1 korrigiert:** Regen-Hürde = K-2 → gelernte Hürde (ohne `precipCal`); Roh-Tar 0,7 MB trocken / 3,66 MB nass;
  t1-Job heute Median 11,4 / max 16,5 min.
- **NP-0a-3 (Retention):** muss in den **Kern** von `radar-mirror.mjs` (`storeSeed`/`imgPrune` je Quelle), als
  Altersregel; `rv-past/<stamp>/f000.png` entsteht im Spiegel als **Kopie** der eben abgeleiteten `rv/<stamp>/f000.png`
  (Derive und jede heutige Datei bleiben byte-gleich); `RADAR_PAST_WINDOW_MS` = **115 min** (Herleitung wie die
  heutigen 55 min). `src/point/nowcastFormat.ts` `keptSlots`/Text ziehen mit (kein Fusion-Code).
- **NP-0a-4 (Blitze):** Haken-Modul im Web-Klon nach dem road-Muster, Abruf im Hintergrund (D-NP0-7), Werte über WCS
  (D-NP0-5), Existenz nur über Capabilities (BD-Falle); kein eigenes Derive-Kindprozess-Skript.
- **NP-0a-5:** README-Kopie entfällt (die Kartenlinie legt sie aus); die Kern-Datei wird **einmal** kopiert.
- **NP-0b-2 (Kodierung):** precip R = Chance `round(254 p)`, G = Median | nass, B = q90 unbedingt, beide
  log mit x₀ = 0,1 und x_max = 100 mm/h (0 = kein nasser Teil, 1 = 0 mm/h); **Alpha nur 0/255** (Canvas
  vormultipliziert); `stepH` im Manifest. snowlmt R = Mitte in 25-m-Schritten (0…6 350 m), G = halbe Bandbreite
  (symmetrisch, D-NP0-11), B = Herkunft (0 kein Band, 2 σ_div, 3 σ_ens), A 0/255; t3 ohne Schneefallgrenze (keine Quelle).
- **NP-0b-3 (Producer):** Chance nach E-NP0-4; bei F1 je Zelle `fuseCubePoint` mit neutralem, benanntem Gelände-Block
  (V-NP0-19), Worker-Threads (4 vCPU).
- **NP-0b-4/5:** `JOB_MAX_MIN.t1` höchstens 24 (Regel B); Felder-Retention im Publisher; neue Pfadklassen im CDN-Sync.

### 8.3 Neue V-Einträge

- **V-NP0-4** Verwaiste Derive-Reste auf `main`: `radar/img/v1/inca/20260920T0030.tmp-3300/` (13 Dateien) seit 20.09.;
  `imgSlots` filtert `.tmp-` (⇒ `imgPrune` räumt nie), `publish`/`storeSeed` kopieren es weiter. Mehrwert: sauberer Baum.
  Skizze: `.tmp-`-Verzeichnisse > 10 min in `imgPrune` löschen bzw. nicht kopieren — ändert die Ablage ⇒ E-NP0-8.
- **V-NP0-5** Zwei Linien im Kern `scripts/radar-mirror.mjs` (Autobahnwetter hat Rechte, Hook produktiv). Mehrwert: kein
  Überschreiben fremder Änderungen bei der Kopie. Skizze: NP-0a baut auf dem Stand mit road-Hook auf, Eingriff klein und
  getrennt kommentiert, vor der Kopie `diff` gegen die Daten-Repo-Kopie ⇒ E-NP0-7.
- **V-NP0-6** DWD-Blitzdichte deklariert 13 Monate, liefert ≈ 24 h — Rückblick > 24 h nur aus dem eigenen Spiegel;
  `DATA_SOURCES.md` §7 / `API.md` berichtigen.
- **V-NP0-7** BD-Werte an einer Gewitterlage unbelegt (Ganzzahligkeit 0…127, Sättigung) — `fractionalPx` + Histogramm im
  Live-Verifier nach dem ersten Gewitter.
- **V-NP0-8** MTG-Klasse ↔ Zählung nur ±1 (schiefe Legende) — einmal ein LI-L2-AFA-NetCDF (EUMETSAT Data Store, Konto)
  gegen denselben Frame zählen.
- **V-NP0-9** `src/sources/dwdLightning.ts` nennt für ein MTG-Produkt „Sferics/Linet" — falsche Attribution in der Karte
  (kleine UI-Phase).
- **V-NP0-10** EUMETSAT-Attributionstext stammt aus dem Suchindex — vor Veröffentlichung gegen das Policy-PDF prüfen.
- **V-NP0-11** MTG-Latenz „~5 min" in `DATA_SOURCES.md`/`API.md` zu knapp (gegen Fensterende 6–11, gegen Stempel 11–16 min,
  Stempel = Fensterbeginn); auch der heutige Live-Layer.
- **V-NP0-12** Stufenraten sind Intervallmittel (1/3/6 h) — eine gemeinsame Legende „mm/h" verwässert Schauer jenseits
  48 h um Faktor 3–6; `stepH` im Feld, Darstellung in NP-2.
- **V-NP0-13** ICON-EU-EPS liefert in t2 bei 84–120 h keine Niederschlagsrate (`noRate`) — σ_ens/q90 dort fehlen
  (Producer, eigener Antrag).
- **V-NP0-14** `JOB_MEASURED_MAX_MIN.t1` 14,2 min ist von vor Schema 6; gemessen 02.–03.10. max 16,5 (Median 11,4); **t2
  max 19,3 min über dem Planwert 15** — Regeln A–F mit den echten Zahlen nachrechnen (in NP-0b-4).
- **V-NP0-15** σ_div der Schneefallgrenze enthält die Auflösungsdifferenz (p90 831 m in t1) — Gürtel breit und
  unkalibriert; Etikett „Spanne der Modelle, unkalibriert" bis zur Messung.
- **V-NP0-16** Plan nannte `precipCal` als Kettenglied — in Fusion 8 aus (korrigiert in §1.1/§4).
- **V-NP0-17** Am Archiv ist K-2 allein (F0) 0,5–4,8 % Brier besser als mit gelernter Hürde (F1), F1 im Mittel zu nass —
  an die Fusion-Linie: Wiederholung mit ≥ 30 Ausgabetagen, Regel vorab einfrieren; ändert buscosun Fusion ⇒ Jans Gate.
- **V-NP0-18** 1,1 % der Zeilen von „Fusion 8 ohne Station" weichen von F1 ab (max |Δp| 0,45), Ursache offen (Nachbar-Messung
  als `obs`?).
- **V-NP0-19** Der Motor verlangt `terrain.scales` auch für Größen, die ihn nicht lesen — im Producer ein neutraler,
  benannter Block mit Gleichheitsprobe auf den Niederschlag (Konsistenz-Probe in `verify:np0-fields`), kein Motor-Eingriff.

### 8.4 Entscheidungen (Jan)

Vorgelegt am 03.10. mit den Zahlen aus §8.1; Jan hat jeweils die Empfehlung gewählt.

| # | Entscheidung |
|---|---|
| E-NP0-1 | **A** — eigene Ablage `radar/img/v1/rv-past/<stamp>/f000.png` (Kopie der abgeleiteten `f000` im Spiegel), 24 Slots per Altersregel, `RADAR_PAST_WINDOW_MS` 115 min; volle RV-Slots bleiben 12; rzc und KONRAD-Bilder 24 |
| E-NP0-2 | **A** — `radar/img/v1/lightning-de/` + `lightning-mtg/`, Logik als Haken-Modul im Web-Klon (road-Muster), Abruf im Hintergrund, Mitfahrt im nächsten Produkt-Push |
| E-NP0-3 | **A** — Werte über WCS auf festem EPSG:3857-Raster 668 × 880 (2 km), Existenz nur über Capabilities, Gate 25 min ab Fensterende |
| E-NP0-4 | **F1** — Fusion-Kette mit dem Cube als einziger Quelle (`fuseCubePoint` unverändert, Worker-Threads); V-NP0-17 geht an die Fusion-Linie |
| E-NP0-5 | **(a) + (b)** — `point/field/v1/…` mit eigenem Index, Schritt in jedem Stufen-Job (`continue-on-error`, eigenes Timeout), `JOB_MAX_MIN.t1` 20 → 24; misst der Runner den t1-Feldschritt > 5 min, fällt t1 auf jeden zweiten Lauf (b′) |
| E-NP0-6 | **nein** — Warm-up neuer Radar-Slots eigene Phase |
| E-NP0-7 (neu) | NP-0a baut auf dem Stand mit road-Haken auf, road-Zeilen bleiben unverändert, Eingriff getrennt kommentiert, vor Jans Kopie `diff` gegen die Daten-Repo-Kopie |
| E-NP0-8 (neu) | **ja** — `.tmp-`-Reste (> 10 min) mit dem Kern-Eingriff aufräumen bzw. nicht mehr kopieren |

### 8.5 Umsetzung NP-0a (03.10., uncommitted) und Gate G-NP0a

**Gebaut** (additiv; road-Zeilen im Kern unverändert, E-NP0-7):

| Datei | Inhalt |
|---|---|
| `src/sources/radolanRuns.ts` | `RV_PAST_KEEP` 24, `RADAR_PAST_WINDOW_MS` 115 min, `rvPastDir`, `rvPastEligible` (Gate wie der Bild-Slot) — heutige Konstanten unverändert |
| `src/sources/radarImg.ts` | `RADAR_IMG_KEEP` (rv/inca 12; rv-past, rzc, konrad3d, lightning-de/-mtg 24), `RADAR_IMG_AGE_RULE`, `RADAR_IMG_MIN_KEEP` 2; Re-Exporte |
| `src/sources/lightningImg.ts` (neu) | Blitz-Vertrag: Raster 668 × 880 (2 000 m, EPSG:3857), Quellen DE/MTG, WCS-URL nativ, `capsTimeEnd` (einziger Existenzbeweis), BD-Klassen = SLD der Quelle, MTG-Palette exakt, Kodierer/Dekodierer (DE: Wert × 100 als 16 bit über R/G — exakt bis 2 Nachkommastellen, statt `round(v)` aus diag-b, damit 0,1…0,9 nicht auf 0 fallen; MTG: R = Klasse), `rasterizeLightning`, `lightningFrameProblem` (BD ohne Nodata = erfundener Null-Frame, MTG fremde Farbe ⇒ verworfen), Meta-Bauer/-Prüfer, Gate 25 min / Fenster 120 min, `?ltg=0` |
| `src/point/nowcastFormat.ts` | rzc `keptSlots` 24, Text des Punkt-Manifests nennt die Zahlen je Quelle und rv-past (D-NP0-2-Falle) |
| `scripts/lib/tiff.mjs` (neu) | GeoTIFF-Leser nur mit `node:zlib` (Strips/Tiles, Deflate, 8–64 bit) + Geo-Transformation |
| `scripts/lightning/lightning-derive.mjs` (neu) | Kindprozess: `auto` liest beide Capabilities, holt fehlende Slots der letzten 2 h (≤ 3 je Quelle und Lauf, jüngster zuerst), prüft, schreibt atomar |
| `scripts/lightning/lightning-mirror.mjs` (neu) | Haken (reines JS): `poll()` < 1 ms, Kindprozess **asynchron**, single-flight, Prüffrist 45 s, **kein Start im RV-Fenster** (`quiet`, s. Takt) |
| `scripts/radar-mirror/radar-mirror.mjs` | Retention je Bild-Quelle (Zähl-/Altersregel, `imgSlotsToDrop`), `rv-past`-Kopie nach dem RV-Derive und beim Seed, Blitz-Haken + Mitfahrt im nächsten Push (eigener Push nach 5 min ohne Produkt-Push), `.tmp-`-Reste nicht kopieren und nach 10 min löschen (E-NP0-8), `status.json` Schema 3, `PAST_KEEP`/`LIGHTNING` (Rückweg), als Modul importierbar |
| `scripts/repack-repo/README.md` | Radar-Abschnitt (rv-past, Blitze, Werte-Kodierung, Ehrlichkeit), Aufbewahrungstabelle, Lizenzzeilen |
| `scripts/verify-np0-radar.mjs` (neu, `verify:np0-radar`) | A Vertrag 19 · B Retention + Haken 10 · C Ende-zu-Ende gegen Bare-Repo 10 · D `--derive-head` 7 · E `--live` |

**Lokaltest NP-0a-6** (Bare-Repo mit echtem `radar/`+`road/` von `main`, echte Quellen, Arbeitsbaum als APP_DIR; Skripte und
Logs im Session-Scratchpad `np0a-local/`):

| Lauf | Einstellung | Ergebnis (Bestand auf main danach) |
|---|---|---|
| A 20 min, Force-Push nach 8 min | KEEP 3 / PAST 6 | rv 3, inca 3, rzc 6, konrad3d 6, rv-past 6, Blitze 24 je Quelle; der `.tmp-3300`-Rest von main weg; road 204 / point 1 Datei unverändert; Pushes nach dem Force-Push normal weiter |
| B 12 min, Naht (frischer Bestand) | KEEP 3 / PAST 6 | Seed aus main: dieselben Zahlen — **Blitze 24 an der Naht nicht gekürzt** (vorher: auf KEEP) |
| C 10 min | Voreinstellung 12 / 24 | rzc/konrad3d/rv-past wachsen (8), rv 5 |
| D 6 min | `PAST_KEEP=12 LIGHTNING=0` | rv-past 0, lightning 0 — der Altbestand fiel mit dem ersten Push weg; Log „Rückblick AUS · Blitze AUS" |

In A/B stieg der RV-Lag in den ersten Jobminuten auf 19/22 s: Erkennung sofort, aber der RV-Derive lief unter dem parallelen
Blitz-Backfill 5,7–7,2 s statt 3,0–3,6 s (CPU). ⇒ Der Haken startet zwischen +2:50 und +5:30 nach dem erwarteten RV-Slot
keinen Kindprozess (`quiet: rvQuiet`). Danach **A/B-Messung gleichzeitig** (HEAD-Spiegel `581f83c` gegen NP-0a, je eigenes
Bare-Repo, gleicher echter Seed, Voreinstellung, `ROAD=0` bei beiden, 25 min, `np0a-local/ab/`):

| | HEAD | NP-0a |
|---|---|---|
| RV DWD→Push (n = 6) | Median 5 s · max 10 s | **Median 4 s · max 6 s** |
| RV-Derive | Median 3,7 s · max 5,4 s | Median 3,1 s · max 4,1 s |
| KONRAD DWD→Push (n = 5) | Median 3 s · max 6 s | Median 0 s · max **58 s** (s. V-NP0-20) |
| Commits in 25 min | 19 | 20 (+1: Blitz-Push beim Start, vor dem ersten Produkt-Push) |
| Dateien unter `radar/` | 567 | 682 (rzc/konrad3d 17, rv-past 18 — wachsen auf 24; Blitze 24 + 24) |

**Gate G-NP0a** (Plan §2.4):

| Frage | Beleg | Ergebnis |
|---|---|---|
| 1 Funktionserhalt | `verify:np0-radar --derive-head=<HEAD-Worktree>`: RV ×2 (je 28 Dateien), KONRAD, rzc, INCA aus HEAD und Arbeitsbaum byte-gleich (INCA-`meta.json#fetchedAtMs` = Wanduhr, als einziges Feld genullt), Negativkontrolle zwei RV-Läufe verschieden; C9 Rückweg = unabhängig gerechneter Stand vor NP-0a Blob für Blob (72/72), C10 Negativkontrolle; A1 Gates/Fenster unverändert; `verify:radar-repack` 55/55 (+1 ⊘ CDN-Stichprobe wie an HEAD), `verify:radar-runs` 56/56, `verify:radar-fallback` 22/22, `verify:precip-source` grün, `verify:cells` grün, `verify:road-derive` 32/32 (die road-Haken im Kern), `verify:point-data` 1022/1022 | ✓ |
| 2 Takt | A/B gleichzeitig: RV Median 4 / max 6 s gegen HEAD 5 / 10 s; Pushes +1 in 25 min (nur beim Start) | ✓ |
| 3 Größe | gemessen: ruhiger Tag +115 Dateien unter `radar/`; Blitze ≈ 3,8 KB je Frame ohne Aktivität, 11,4 KB am DACH-Gewitter-Fixture (01.08.2025); rv-past/rzc/KONRAD 24 statt 12: +0,1 MB trocken / +1,0 MB nass (D-NP0-1/§8.1); Baum 336,7 MiB | ✓ |
| 4 Ehrlichkeit | Meta: Fenster, `timePos`, `overlapping` (BD „nie aufsummieren"), Klassen, Lizenzzeilen, Parallaxe, Nil zweideutig, AT/CH ohne Bodennetz (A17); fehlt = kein Verzeichnis bzw. A 0, nie 0 (A6, A12) | ✓ — EUMETSAT-Wortlaut von Jan gegen das PDF zu prüfen (V-NP0-10) |
| 5 Rückweg | `PAST_KEEP=12 LIGHTNING=0`: Lokaltest D + C8/C9; Client `?ltg=0` (A19) | ✓ |
| Verifier | typecheck 0, `verify:np0-radar` **39/39** (offline) bzw. 44/44 mit `--derive-head`, Build 252/252, `npm run budget` grün (eagerJs unverändert, `lightningImg.ts` noch von keinem Client importiert) | ✓ |
| Live (nach Jans Push) | `verify:np0-radar --live` nach ≥ 2 h | offen — Jans Gate §35 |

Nicht geprüft: `verify:road-ui` (Browser-Verifier der AW-Linie, braucht einen laufenden `vite preview`; NP-0a fasst keine
Oberfläche an).

**Neue V-Einträge aus der Umsetzung:**
- **V-NP0-20** Die Spiegel-Schleife ist seriell; ein INCA-Abruf (719 KB NetCDF + Derive ≈ 30–40 s gesamt) kann eine gleichzeitig
  erscheinende KONRAD-/RV-Datei um bis zu ≈ 50 s verzögern — im A/B-Lauf traf es NP-0a (KONRAD 58 s), HEAD hatte dieselbe INCA-Dauer
  (Push 17:16:42) und KONRAD zufällig vorher. Mehrwert: gleichmäßiger Lag. Skizze: INCA-Download wie die Blitze asynchron, Derive erst
  im nächsten Durchlauf; eigene kleine Phase (betrifft den Kern).
- **V-NP0-21** `LIGHTNING_GATE_MS` 25 min ist konservativ (ein Frame ist typisch nach ≈ 13 min da) — der Client sähe Blitze erst
  25 min nach Fensterende. Mehrwert: aktuellere Blitze in NP-1. Skizze: nach dem Live-Lauf aus `status.json` nachschärfen oder im
  Client jüngere Slots über raw.githubusercontent (keine hängende 404 am Edge, Muster `radarRawUrl`) anfragen.
- **V-NP0-22 (behoben 03.10.)** Der eigene Blitz-Push beim Jobstart („5 min ohne Produkt-Push") entstand, weil `lastPushAt` mit 0
  beginnt (+1 Commit je Job im A/B-Lauf). Jetzt zählt die 5-min-Frist ab dem Jobstart (`loopStartedAt`); `lastPushAt` und die
  Ende-Bedingung des Jobs bleiben unverändert.

### 8.6 Umsetzung NP-0b (04.10., uncommitted) und Gate G-NP0b

**Gebaut** (buscosun Fusion nur aufgerufen, nicht geändert — `git diff src/pointForecast` leer):

| Datei | Inhalt |
|---|---|
| `src/point/fieldFormat.ts` (neu) | Vertrag: Pfade `point/field/v1/<lauf>/<stufe>/{precip,snowlmt}-LLL.png` + `field.json`, Index; Raster = Gitter der Stufe (Zeile 0 = Norden); Kodierer **und** Dekodierer (precip R Chance · G Median \| nass · B q90 unbedingt, Log-Code x₀ 0,1 / x_max 100 mm/h; snowlmt R Mitte · G halbe Bandbreite in 25 m · B Herkunft 2 σ_div / 3 σ_ens; A nur 0/255, fehlt ≠ 0); Manifest-Bauer/-Prüfer mit Etikett „Modell · Cube", Chance-Definition F1 samt Messwerten D-NP0-12 und Einschränkung (V-NP0-17), `stepH`/Rate; Index-Bauer/-Prüfer |
| `scripts/point/build-point-fields.mjs` (neu) | Producer: je Zelle `cubeSeriesFrom` (Client-Leser) → `fuseCubePoint` **unverändert** mit den Optionen der Stufe fs ohne Station/Radar (`FIELD_FUSE_OPTIONS`, dieselbe Menge wie D-NP0-10), Gelände flach in Modellhöhe (`terrainScales` mit konstanter Höhe, V-NP0-19), h_true = `hModEff`; Worker-Threads; Bau-Ablage `point/.build/` → Umbenennen → `field.json` zuletzt → Index; Frist = min(360 s, Restzeit bis `FIELD_END_MIN`), b′ über `field/v1/budget.json` |
| `scripts/point/fieldStore.mjs` (neu) | jüngster Lauf je Stufe, Aufbewahrung („ein Feld lebt, solange seine Cube-Stufe lebt", unvollständige Bauten und Müll fallen), Index aus den Manifesten |
| `scripts/point/publish-point.mjs` | Feld-Runde nach den Stationsprodukten (Aufbewahrung + Index, auch mit `POINT_FIELDS=0`) |
| `scripts/point/cdnSync.mjs` | Klassen `field-index` (purgen, auch beim Anlegen) und `field` (nur wärmen, nach den Chunks); `JOB_MEASURED_MAX_MIN.t1` 14,2 → 16,5 (V-NP0-14); `FIELD_END_MIN_BY_TIER` {18, 10, 10} |
| `scripts/point/sparseCover.mjs` | `timeoutMinutesOf` zählt nur Job-Timeouts (Schritt-Timeouts der Feldschritte verfälschten Regel C) |
| `scripts/repack-repo/workflow-point.yml` | je Stufen-Job: „Job-Start merken" (`JOB_T0`), `public/climaGrid.json` im Sparse-Klon, Schritt „Build map fields — tX (NP-0b)" zwischen Bau und Publish (`continue-on-error`, Timeout 8/5/5 min, `POINT_FIELDS: '1'`, `FIELD_END_MIN` 18/10/10); Kommentare zu Regel C/F/F′ |
| `scripts/verify-point-data.mjs` | `JOB_MAX_MIN.t1` 20 → 24 (E-NP0-5 b), Regel F′ je Stufen-Job + Negativkontrolle, climaGrid im Sparse-Klon, MOSMIX-Zählung um den Feldschritt erweitert |
| `scripts/repack-repo/README.md` | Abschnitt „Kartenfelder — `point/field/v1/`", Zeile in der Aufbewahrungstabelle |
| `scripts/verify-np0-fields.mjs` (neu, `verify:np0-fields`) | A Vertrag 9 · B echte Läufe 20 (s. Gate) · C `--live` |

**Zwei Hebel ohne Motor-Eingriff** (gemessen, D-NP0-13 sah t1 ≈ 16 min Runner einfädig):
1. **Ebenen-Teilmenge** wie der progressive Client-Leser (`cubeSeriesFrom(…, { wanted })`: nur `precip*`, `snowlmt*`,
   `hModEff`) — der Motor rechnet die übrigen Größen dann nicht: t1 17,1 → 10,8 ms je Zelle; Niederschlag und Schneefallgrenze
   **exakt** gleich (3 920 / 3 920 Zell·Schritte, und je Stufe in B3).
2. **Kein `toPointForecastV2`** für 14 Größen, sondern dieselben Regeln nur für die zwei Größen (`fieldValuesFromResult`) — ≈ 3 ms
   je Zelle; gegen V2 geprüft in B2.
Dazu: Zellen ohne Cube-Niederschlag (Motor: reine Klimatologie, `climatologyOnly`) bekommen A = 0 — die Klimatologie stünde sonst
unter dem Etikett „Modell · Cube" (B5).

**Laufzeit und Größe** (lokal, i3-1005G1 2 Kerne/4 Threads, 4 Worker, echter Lauf aus dem Daten-Klon 30.09.):

| Stufe | Zellen × Schritte | Dauer | Fehler | Bytes je Lauf | vorgehalten (Läufe) |
|---|---|---|---|---|---|
| t1 | 48 441 × 49 | **188 s** | 0 | 2,86 MiB (98 PNG + Manifest) | ≈ 3 ⇒ ≈ 9 MiB |
| t2 | 12 221 × 24 | 32 s | 0 | 0,38 MiB | ≈ 4 ⇒ ≈ 1,5 MiB |
| t3 | 2 009 × 36 | 12 s | 0 | 0,08 MiB (keine Schneefallgrenze) | 2 ⇒ 0,2 MiB |

Der Runner-Faktor für reine Rechnung ist nicht gemessen (die ×2 aus CLAUDE.md stammen vom I/O-lastigen Bau). Deshalb keine feste
Zahl im Job, sondern **Regel F′**: der Feldschritt endet spätestens `FIELD_END_MIN` nach dem Jobstart (t1 18 min) — dahinter
bleiben Publish 1 + CDN 4 + 1 min bis `JOB_MAX_MIN.t1` 24. Ist der Bau langsam, entfällt das Feld dieses Laufs (der Cube wartet
nie); dauert das t1-Feld selbst > 300 s oder bricht es an seiner Frist ab, rechnet nur jeder zweite t1-Lauf (E-NP0-5 b′).

**Gate G-NP0b** (Plan §3.4):

| Frage | Beleg | Ergebnis |
|---|---|---|
| 1 Funktionserhalt | B7 Builder fasst außerhalb `field/` nichts an (280 Dateien Hash-gleich, + Negativkontrolle B8); B14 Publisher mit/ohne Felder: `index.json` (ohne `publishedAt`), `run.json`, Chunks, Tabellen byte-gleich (282 Dateien); `verify:point-data` **1027/1027**, `verify:fusion-fit` **131/131**, `verify:point-client` 170/171 — rot nur (10s), zeitabhängig, an HEAD gleich (V-EX-13); `git diff src/pointForecast` leer | ✓ |
| 2 Zeit | t1 188 s / t2 32 s / t3 12 s lokal (4 Worker); Regeln A–F grün mit `JOB_MAX_MIN.t1` 24 und gemessenem t1-Maximum 16,5; Regel F′ je Stufe (18/10/10 + Publish + CDN + 1 = 24/15/15) + Negativkontrolle | ✓ — Runner-Zeit misst erst der Live-Lauf (`field.json#timing`, `budget.json`) |
| 3 Größe | Bytes je Lauf s. Tabelle; ständig ≈ 11 MiB, ≈ 26 MiB neue Daten je Tag (8 × 2,86 + 4 × 0,38 + 2 × 0,08) | ✓ |
| 4 Ehrlichkeit | Etikett „Modell · Cube" im Manifest und Prüfer (A6 lehnt „buscosun Fusion 8" ab); Chance-Definition mit Brier/Skill und „zu nass" (A9); Spannen-Herkunft je Pixel (B-Kanal); fehlt ≠ 0 (A4, B5); Rate = Intervallmittel mit `stepH` | ✓ |
| 5 Rückweg | `POINT_FIELDS=0` ⇒ Schritt tut nichts (B9); Publisher baut den Altbestand ab (B12); alte Leser unberührt (B14) | ✓ |
| Konsistenz | B2 je Stufe an **60 Zellen**: Feld (PNG dekodiert) = volle Kette am Zellmittelpunkt über `toPointForecastV2`, innerhalb der Quantisierung — t1 5 880, t2 2 880, t3 2 160 Werte, **0 daneben**; B3 Teilmengen-Weg = voller Weg exakt; Negativkontrolle B6: ohne Lernstufe (K-2 allein) 23 von 24 Schritten anders ⇒ die Probe sieht eine falsche Kette | ✓ |
| Verifier | typecheck 0, `verify:np0-fields` **29/29**, `verify:np0-radar` 39/39, Build 252/252, `npm run budget` grün (kein Client importiert die Felder) | ✓ |
| Live (nach Jans Push) | `verify:np0-fields --live` nach je einem t1-, t2- und t3-Lauf | offen — Jans Gate §36 |

**Neue V-Einträge:**
- **V-NP0-23** Der Runner-Faktor für reine Rechnung ist unbekannt — die Feldzeit t1 auf dem Runner kann zwischen ≈ 2 und ≈ 6 min
  liegen. Mehrwert: Gewissheit, ob t1 jeden Lauf ein Feld bekommt. Skizze: nach den ersten Läufen `field/v1/budget.json` und
  `field.json#timing` lesen; ggf. `FIELD_BUDGET_S` oder Zellmaske (nur DACH-Zellen) nachziehen.
- **V-NP0-24** Das Feld ist in Grad regulär; eine MapLibre-`image`-Source mit vier Ecken verzerrt es in der Breite (bei 10°
  Spannweite sichtbar). Mehrwert: lagerichtige Felder in NP-2. Skizze: Mesh wie die Radar-Ebenen (`quadWarpMesh`) oder
  Umprojektion beim Bau.
- **V-NP0-25** `JOB_MEASURED_MAX_MIN.t2` (10,7) ist ebenfalls veraltet: am 02./03.10. maß ein t2-Job 19,3 min (Bau 15,8) — über
  `JOB_MAX_MIN.t2` 15 (Regel F rot mit dieser Zahl). Mehrwert: ehrliche Zeitregeln. Skizze: t2-Läufe über eine Woche lesen;
  Ursache (ICON-EU-Abruf?) vor einer Grenzänderung klären — Jans Gate, nicht NP-0b.
