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

*(leer — D-NP0-1…14 mit Belegen, E-NP0-1…6 mit Jans Antworten, Umsetzung NP-0a / NP-0b, Gate-Tabellen §2.4/§3.4
ausgefüllt, neue V-Einträge)*
