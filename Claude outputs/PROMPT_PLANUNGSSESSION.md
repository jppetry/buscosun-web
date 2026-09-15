# Planungssession: Alle Vorarbeiten vor der Implementierung von buscosun Fusion (0–336 h)

## Kontext

Drei Repositories, alle lokal:

- `C:\dev\buscosun-web` — App, Producer-Skripte (`scripts/point/`), Cube-Leser (`src/point/client`), buscosun Fusion (`src/pointForecast/`), Audits (`audit/`), Regeln (`CLAUDE.md`).
- `C:\dev\buscosun-data` — Daten-Repo (Punkt-Cube `point/`, Stationen, Nowcast-Spiegel `radar/img/v1`, Workflows). Wird über jsDelivr ausgeliefert. `build.yml` force-pusht, Retention 24 h — dieses Repo ist auf Vergessen gebaut.
- `C:\dev\buscosun-archiv` — https://github.com/jppetry/buscosun-archiv, existiert, ist leer. Ziel: append-only Verifikationsarchiv (Plan `audit/punktarchiv.md`, Stand PA0).

Der Algorithmus ist `buscosun-web/ABLAUFPLAENE.md` (PAP 1–6, DIN 66001) mit Design-Doc `PUNKTVORHERSAGE_0-336H.md` und Quellenmatrix `QUELLENMATRIX.md`. Es gibt genau eine Fassung.

Vorarbeit liegt vor und ist die Ausgangsbasis dieser Session — **erst lesen, dann handeln**, in dieser Reihenfolge:

1. `buscosun-web/CLAUDE.md` — Regeln, Statusblock, offene Befunde (V-PD-*, V-BW-*, E-*).
2. `buscosun-web/audit/punktdaten-bereitschaft.md` (2026-09-14) — Bereitschaftsanalyse: Tabelle A (Bedarf/Vorhanden/Takt/Retention), Tabelle B (Lücken), §5.8 Takt je Quelle, §5.9 Retention, §6 Urteil, §7 offene Punkte und Annahmen.
3. `buscosun-web/audit/punktarchiv.md` — Plan PA0 für das Archiv (Etappen PA1…, Entscheidungen E-1…E-7).
4. `buscosun-web/ABLAUFPLAENE.md`, `PUNKTVORHERSAGE_0-336H.md`, `QUELLENMATRIX.md`.
5. `buscosun-data/point/index.json`, `point/sources.json`, `point/calib.json`, jüngstes `point/<run>/run.json` je Stufe, `.github/workflows/{point,build,radar}.yml`.
6. `buscosun-web/audit/punktdaten-versorgung.md` und `audit/punktdaten-restbedarf.md` — ältere Stände; wo sie der Bereitschaftsanalyse widersprechen, gilt die Bereitschaftsanalyse (dort §7 „Korrekturen").

## Ziel dieser Session

Einen vollständigen, priorisierten und mit Gates versehenen **Umsetzungsplan** für alles erstellen, was vor der Implementierung des Algorithmus fehlt — und die Teile davon vorbereiten, die ohne Gate erlaubt sind (Vorlagen, Verifier, Skripte ohne Push, Messungen). **Nicht Ziel:** den Algorithmus selbst implementieren, die Fusion-Engine ändern, Crons produktiv schalten, irgendetwas committen oder pushen.

Ergebnis ist die Datei `buscosun-web/audit/punktdaten-umsetzungsplan.md`. Sie enthält für jeden Punkt: Beleg, Umsetzung (Datei, Änderung, Verifier), Abnahmekriterium, Gate, Reihenfolge, und am Ende eine nummerierte Liste der Entscheidungen, die nur ich treffen kann.

## Regeln (gelten zusätzlich zu CLAUDE.md, im Konflikt gilt CLAUDE.md)

- **Diagnose vor Plan, Plan vor Code.** Jede Behauptung über den Ist-Stand steht mit Beleg (Datei, Feld, Wert, Zeitstempel). Was nicht belegbar ist, heißt ausdrücklich „offen". Annahmen stehen getrennt von Belegen.
- **Primärdaten vor CLAUDE.md.** Manifeste, Workflows und Code sind die Wahrheit; der Statusblock in CLAUDE.md kann veraltet sein. Bei Widerspruch: Primärdaten, und den Widerspruch notieren.
- **Kein Commit, kein Push, kein Dispatch ohne Auftrag.** Vorlagen für Workflow-Dateien werden in buscosun-web abgelegt; die Kopie ins Daten-Repo ist mein Gate.
- **STOPP & FRAGEN** bei: Fusion-Engine, Edge Functions, Crons, Manifest-/Schema-Änderungen, Radar-Linie, Dependency-Upgrades, allem Irreversiblen. Frage sammeln, nicht raten — aber vorher alles erledigen, was ohne die Antwort geht.
- Quellen-Regeln bleiben: nur offene Daten, keine API-Keys, keine NC-Klausel, kein Freemium, kein Backend, R2 existiert nicht (CDN = buscosun-data via jsDelivr).
- Dokumente auf Deutsch, Name „buscosun Fusion", Code > architecture.md > Alt-Doku.
- Jede Änderung an Producer, Schema oder Workflow braucht einen Verifier-Lauf (`verify:point-data`, `verify:point-client`, ggf. neu `verify:punktarchiv`) und eine Kostenmessung (MiB je Zyklus, Minuten je Job), bevor sie im Plan als „bereit" steht.

## Arbeitspakete — in dieser Reihenfolge abarbeiten

### AP0 — Ist-Stand nachprüfen (30 Minuten, nicht mehr)

Lies `buscosun-data/point/index.json` und die jüngsten `run.json` und prüfe, ob sich seit dem 2026-09-14 (Commit `9bd1e62`, publishedAt 16:56 UTC) etwas geändert hat: Schema, Ebenen, Stufen, Retention, Anzahl t3-Läufe zur aktuellen Uhrzeit, `fusion.provenance`, `calib.json`-Werte, Stationen-`ageH`. Streiche aus Tabelle B der Bereitschaftsanalyse, was erledigt ist; ergänze, was neu aufgefallen ist. Notiere den Stand als Kopf des Umsetzungsplans.

### AP1 — Archiv (buscosun-archiv, Priorität 1)

Das Archiv ist der einzige Weg, Σ, σ_sys, c_spread, L_d/L_h, A, A_uhi, f_rad, φ und Δz_min zu messen. Jeder Tag ohne Sammler ist ein verlorener Datenpunkt.

- Nimm `audit/punktarchiv.md` und bringe PA1 auf Umsetzungsreife: Sammler `scripts/punktarchiv-collect.mjs`, Bibliothek `lib/punktarchiv.mjs` (Kodierung, Merge, As-of-Wächter), Punktliste `punktarchiv-points.mjs` (Stationen mit offener Messwahrheit in DE/AT/CH, DACH-BBox, DEM endlich, eindeutig), Verzeichnislayout `buscosun-archiv/<YYYY-MM-DD>/`, Schema mit Version.
- Der Sammler liest **beide** Pfade: den Cube (t1/t2/t3 + Stationen + Nowcast über `src/point/client`) und den heutigen Live-Pfad (`getPointForecast`), damit spätere Versionen des Algorithmus über die ganze Historie neu bewertet werden können. Messwahrheit: BrightSky/TAWES/SMN mit Zeitstempel und Stations-ID.
- Verifier `verify:punktarchiv` netzfrei: Schema-Roundtrip, Skalen/Sentinel, Lead-Raster, Punktliste eindeutig, Merge idempotent, As-of-Wächter, Negativkontrolle „Slot mit Zukunftsmessung wird abgewiesen".
- Ein **lokaler** Probelauf ohne Push: echter Slot auf Platte, gemessene Größe (MB) und Laufzeit (min). Gleichheitsprobe V-PA-1: 10 Punkte Sammler-Samples gegen `getPointForecast` live.
- Workflow-Vorlage `workflow-punktarchiv.yml` (täglicher Slot, Zeitpunkt begründet: nach dem letzten t1-Bau des Tages und vor Mitternacht UTC, Concurrency getrennt vom Daten-Repo). Ablage in buscosun-web; Kopie ins Archiv-Repo und erster Push = **mein Gate**.
- Entscheidungen E-1…E-7 aus dem PA0-Plan als Fragen an mich formulieren, mit deiner Empfehlung je Frage.

### AP2 — Daten-Repo: die drei Pflichtkorrekturen (Priorität 1)

1. **t3-Retention.** Beleg: Index 16:56 UTC hielt nur einen t3-Lauf; `minRuns 2` griff nicht je Stufe. Vorschlag `retentionByTier.t3: 36` und `minRuns` je Stufe im Producer durchsetzen. Zeige die Änderung als Diff-Vorschlag im Plan, nicht als Commit. Kosten nennen.
2. **t2-Cron.** Beleg: `50 3,9,15,21` liegt 22–26 min vor der MOSMIX-L-Bereitstellung (Stationen `ageH 7,06`) und hat gegen ICON-EU (+3,53–3,70 h) 8 min Rand. Vorschlag `30 4,10,16,22`. Prüfe mit `verify:point-data` die Regeln A–D gegen `build.yml` (Kartenlinie :20 der Stunden 0/3/6/…, :30 der Stunden 2/5/8/…): 60 min Abstand ⇒ JOB_MAX_MIN(t2) ≤ 40. Miss die Dauer des Stationsbaus (`build-stations.mjs`) aus den letzten Läufen oder lokal — sie ist offen. Vorlage aktualisieren; Kopie ins Daten-Repo = **mein Gate**.
3. **Publish-Retry (V-BW-58).** Commit-back-Loop (fetch → rebase → push, 3 Versuche) im Publish-Schritt aller drei Punkt-Jobs, weil der Radar-Spiegel alle 1–2 min ins selbe Repo pusht. Vorlage; Workflow = **STOPP & FRAGEN**.

### AP3 — Cube-Erweiterungen (Priorität 2, jede einzeln mit Kostenmessung)

Für jede Erweiterung: Ist-Beleg aus `run.json`, geplante Änderung im Producer, MiB je Zyklus vorher/nachher, Schema-Folge (Schema 6?), Verifier-Anpassung, Client-Folge.

- 700 hPa (und 925) in t3 aus IFS/AIFS (E-E-4). Heute `pressure.levels: [850]` in t3.
- σ_ens-Größen in t3 erweitern (heute nur `t2m` aus ICON-EPS global 144/168 h): u10/v10/gust/precip/clct primär aus IFS-ENS.
- Quantile q10/q90 in t2 (ICON-EU-EPS) und t3 (IFS-ENS); heute `quantiles: null` außerhalb t1.
- Profil-Ersatz in t2: `zInv`/`dTInv`/`gammaEff` aus 925/850/700 mit `provenance: "pressure-derived"`; t3 bleibt Standard-Lapse, ausdrücklich markiert. **Keine** ICON-EU-Modelllevel ohne Kostenmessung — wenn du sie misst, nenne die Zahl und empfiehl.
- `hModEff` je Schritt aus den tragenden Quellen (V-PD-57); AICON-Höhe als `assumed` kennzeichnen.
- Achse: t3 ab 123 h statt 126 h (schließt die 121–125-h-Lücke) oder `axisGaps` im Index — Empfehlung mit Begründung; Ende 328 h (V-PD-55) benennen.
- V-PD-54: `quantileRun` je Stufe im Manifest, damit der Client das Band als älteren Lauf ausweisen kann.

Alle Schema-Änderungen gebündelt als **ein** Vorschlag „Schema 6" mit Migrationsnotiz für `cubeFormat.ts` und `verify:point-client`. Schema = **STOPP & FRAGEN**.

### AP4 — Statisches Stadt-Raster `imperv` / `d0` (Priorität 2)

- Quelle prüfen: GHS-BUILT-S (10 m, Versiegelung) und GHS-BUILT-H (Bauhöhe) vom JRC. Belegen: Lizenz (CC BY 4.0?), Zugriff ohne Schlüssel, Dateiformat, Kachelung, Größe für die DACH-Box. Wenn eine Bedingung nicht hält: Alternative nennen (z. B. Copernicus Imperviousness — Lizenz prüfen) oder als blockiert eintragen.
- Bauplan `scripts/point/build-urban.mjs`: Ausgabe `point/static/urban/v1/{static.json,t1/<cy>_<cx>.bin}` im t1-Chunk-Raster, u8 (imperv in %, d0 in dm), gleiche Container-Kodierung wie `point/static/hmodel/v1/`, Hash, Quelle und Lizenz in `static.json`, Eintrag in `index.json timeless` und `static.urban`. Der Client liest es wie hmodel.
- Lokaler Probelauf ohne Push, Größe messen. Erstablage = Schema-Erweiterung im Index = kurz abstimmen.

### AP5 — `sources.json`, Fristen, Messungen (Priorität 2–3)

- **C-LAEF nwp-v1 → nwp-v2-1h-1km** (Abschaltung 2026-11-01, `scheduledChanges`): Adapter-Änderung planen, Domäne/Clip neu messen, `sources.json` nachziehen. Frist im Plan mit Datum.
- INCA: `vars` nennt `t2m`, der Spiegel trägt nur RR — korrigieren oder T2m als zweites PNG planen (Empfehlung: erst korrigieren).
- MOSMIX-S, KENDA-CH1: von `pending` auf `declined` mit Grund, wieder öffnen, wenn das Archiv Bedarf zeigt.
- Messungen aus den Manifesten (`timing.phases.discover`, `runAt` je Quelle) über mindestens sieben Tage: Bereitstellung IFS 12z, ICON-CH1/CH2-EPS, MOSMIX-L. Danach: t3-Slot auf ≈ `35 8,20` vorziehbar? Nur Empfehlung, Cron = mein Gate.
- `hmodel.changed: true` in t2/t3 am 2026-09-14: Hash-Diff beim nächsten Bau loggen, Ursache benennen.

### AP6 — Web-Seite: Verdrahtung vorbereiten, nicht ausführen (Priorität 2)

- Plan, wie `src/point/client` (Store, `planPointSources`, `SELECTION`) hinter einem Flag in `getPointForecast` eingehängt wird, welche Live-Abrufe dadurch entfallen (AROME nwp-v1 vor 2026-11-01, INCA-Punkt, GFS-Schwanz) und welche bleiben (Beobachtungen für den Anker, DWD-UV bis zur Entscheidung). Fusion-Engine = **STOPP & FRAGEN** — nur planen.
- Abnahmekriterien festlegen: Gleichheitsprobe an 10 Punkten (Cube-Pfad vs. Live-Pfad, Toleranzen je Größe), Lesekosten im Browser über alle drei Stufen (< 300 ms, kalter und warmer Cache, 10 Punkte), Domänenprüfung des Nowcasts (Byte 0, `leadMinutes`, V-PD-56) im Leser verbindlich.
- `calib.json`: Provenienz-Regel für den Client (nur `measured` wirkt; `set`/`literature` wirkt mit Kennzeichnung in der Herkunft); Literatur-Sockel für σ_sys als `set` vorschlagen, nie als gemessen.

### AP7 — Umsetzungsplan schreiben

`buscosun-web/audit/punktdaten-umsetzungsplan.md`, deutsch, mit:

1. Stand (AP0) und Abweichungen zur Bereitschaftsanalyse.
2. Etappentabelle: `| Etappe | Punkt | Beleg | Umsetzung (Datei/Änderung) | Verifier | Kosten | Abnahme | Gate | Reihenfolge |`.
3. Vorlagen und Skripte, die diese Session angelegt hat (Pfad, Zustand: „lokal geprüft, nicht committet").
4. Gemessene Zahlen (Laufzeiten, MiB, Bereitstellungszeiten) mit Datum.
5. Offene Punkte und Annahmen, getrennt.
6. **Entscheidungsliste für mich**, nummeriert, je Punkt: Frage, Optionen, deine Empfehlung, Konsequenz bei Nichtentscheidung.
7. Definition „bereit für die Implementierung": die Prüfliste, die nach Abschluss aller Etappen grün sein muss.

Aktualisiere den Statusblock in `CLAUDE.md` mit einem kurzen Eintrag (Phase, Stand, Gates offen) — nichts anderes dort.

## Was du am Ende meldest

Kurz: was erledigt, was lokal vorbereitet (Dateien), welche Messungen laufen, welche Gates offen sind, und die Entscheidungsliste. Keine Zusammenfassung des Algorithmus, keine Wiederholung der Bereitschaftsanalyse.

## Abbruchbedingungen

Halte an und frage, wenn: ein Verifier nach einer Änderung rot bleibt und die Ursache nicht in der Änderung liegt; eine Quelle sich als lizenz- oder zugriffsseitig blockiert erweist; eine Änderung ein Force-Push-, Radar- oder Fusion-Engine-Thema berührt; die Kostenmessung einer Cube-Erweiterung mehr als +25 % je Zyklus ergibt.
