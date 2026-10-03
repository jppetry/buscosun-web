# NP-0a Diagnose A — Radar-Spiegel: D-NP0-1, -2, -3, -8 (+ Anker §1.1, Autobahnwetter-Haken)

> Fork A der NP-0-Diagnose, 2026-10-03 14:20–14:35 UTC. Nur gelesen und gemessen; kein Code im Repo geändert, Daten-Repo
> nicht angefasst (lokaler Klon `C:\dev\buscosun-data` nur gelesen). Proben in
> `…/scratchpad/forkA/` (Baum-JSON, `status.json`, Commit- und Lauf-Listen, Bare-Repo-Test `bt/`).
> Stand des Daten-Repos: `main` = `7b7d90bc` („radar: composite_rv_20261003_1420.tar", 14:23:59Z), Baum `c8b5be53`.
> Kein `gh` auf der Maschine ⇒ GitHub-API unauthentifiziert per `curl` (5 Abrufe von 60/h).

## 0. Kurzfassung

| # | Ergebnis |
|---|---|
| D-NP0-1 | Baum an `origin/main` **336,7 MiB** in 4 777 Dateien (`point/` 272,6 · `runs/` 38,6 · `road/` 16,3 · `radar/` 8,9 MiB, trockener Tag). GitHub-`size` 443 425 KB (= 433 MiB, Historie mit). jsDelivr liefert **jede Einzeldatei** am Commit und `@main` (alle 10 Abrufe 200); **Paket- und Verzeichnisabrufe** antworten nach 15 s mit **403 „Package size exceeded the configured limit of 50 MB"**. Die 150-MB-Grenze bindet also nicht für Dateien, nur für Listings/Metadaten (die der Client nie nutzt). |
| D-NP0-2 | **Niemand liest heute einen Bild-Slot älter als 55 min.** Leser älterer Slots: DE-Rückblick (9 × `f000`, ≤ 55 min), ML-Hindcast (4 × `f000`), rzc-Notweg bei Quellausfall (≤ 6 Slots = 30 min). Alles andere liest nur den jüngsten Slot. Der Punkt-Vertrag nennt `keptSlots: 12` je Quelle **im veröffentlichten Punkt-Manifest** (`nowcastManifest()` → `point/…`) — ändert NP-0a die rzc-Aufbewahrung, wird dieser Text falsch. |
| D-NP0-3 | RV DWD→Push **Median 10 s, max 16 s** (Slot→Push 3,74–4,01 min); KONRAD 7 / 15 s (Slot→Push 5,5–5,7 min); rzc Slot→Push 1,35–1,48 min; INCA 17–21 min. Push 0,9–1,4 s, **Versuch 1 in allen 24 Zeilen**. ≈ **50 Pushes/h** auf `main` (RV 12, KONRAD 12, rzc 12, INCA 4–5, road ≈ 10, dazu point/Karte). Nähte nahtlos (−2…−10 s), **ein Ausfall von 47 min** (Lauf 26.09. 00:54 `failure`) in 39 Läufen. |
| D-NP0-8 | Force-Push der Kartenlinie trägt `radar/img/v1/<neu>/`, `.tmp-`-Reste und `road/` unverändert weiter (Code + Bare-Repo-Test). **Aber:** `storeSeed()`/`imgPrune()` kürzen **jede** Quelle unter `img/` — auch unbekannte — auf das EINE `KEEP` (Test: `lightning-de` 30 → 3 Slots). Eine 24er-Quelle braucht deshalb Retention je Quelle **im Kern** von `radar-mirror.mjs`, sonst schneidet jede Naht sie auf 12. |
| Neu | **V-NP0-4** verwaistes `radar/img/v1/inca/20260920T0030.tmp-3300/` liegt seit 13 Tagen auf `main` (wird nie aufgeräumt, aber immer mitkopiert). **V-NP0-5** zwei Linien in einer Datei: die Autobahnwetter-Linie hat Rechte an `scripts/radar-mirror.mjs` (`audit/autobahnwetter.md` §1.2) und hängt dort schon einen Haken ein. |

## 1. Anker §1.1 nachgeprüft (Arbeitsbaum `5bb8af1`)

| Anker im Plan | heute | Befund |
|---|---|---|
| `radar-mirror.mjs:47` `KEEP = 12` | :47 | ✓ |
| `storePut` :135 | **:142** | gewandert (+7 durch den road-Block :61–66) |
| `imgPrune` :148 | **:155** | gewandert |
| `workflow-radar.yml:73` `KEEP: '12'` | :73 | ✓ |
| `radarFrames.ts:119` `DE_PAST_SEED_FRAMES = 9` | :119 | ✓ |
| `radolan.ts:359/519` | :359 `fetchRvAnalysisFromImg`, :519 `fetchRvAnalysisSequence` | ✓ |
| `radolanRuns.ts:49/172` | :49 `RADAR_CDN_WINDOW_MS = 55 min`, :172 `rvImgEligible` | ✓ |
| `radarImg.ts` `INCA_IMG_LEADS` | :52 (15…180 min) | ✓ |
| „Roh-RV 3,66 MB je Slot" | **0,69–0,71 MB heute (trocken)**, 3,50–3,66 MB am 30.09. 21–22 UTC (Regen, lokaler Klon) | wetterabhängig; die Zahl ist ein Nass-Wert, kein Mittel ⇒ V-NP0-3 umformulieren |
| „volle RV-Slots, 25 Frames + meta + `m<lead>`" | 28–29 Dateien je Slot (25 + meta + 2–3 Stundenmittel) | ✓ |
| „≈ 3–4 Pushes je 5 min" | RV + KONRAD + rzc je 5 min, INCA + road je 15 min ⇒ ≈ 3,6–4,2 je 5 min | ✓ |
| Neu seit Plan | `radar-mirror.mjs:61–66, 222–226, 332–338, 391–396`: road-Haken (`seed`/`poll`/`copyInto`, `ROAD=0`), Commits `a2bb63a…ef6d7af` | **Daten-Repo-Kopie = Vorlage** (CRLF-normalisiert identisch, ebenso `radar.yml`) ⇒ der Haken ist **produktiv** (13 `road:`-Commits in 78 min) |

## 2. D-NP0-1 — Baumgröße und jsDelivr

**Weg:** `GET api.github.com/repos/jppetry/buscosun-data/git/trees/c8b5be53…?recursive=1` (1,45 MB JSON,
`truncated: false`, 4 777 Einträge; Größen aus dem Baum, ohne Blobs — ein `blob:none`-Klon mit `ls-tree -l` hätte jeden
Blob nachgeladen). `size` aus `GET /repos/…`.

| Wurzel | Dateien | MiB |
|---|---|---|
| `point/` | 3 032 | 272,6 |
| `runs/` | 828 | 38,6 |
| `road/` | 204 | 16,3 |
| `radar/` | 567 | 8,9 |
| Rest (`index.json`, `hsurf-v1.png`, `.github`, README, `scripts`, `.gitattributes`) | 9 | 0,2 |
| **Summe** | **4 777** | **336,7** |

`radar/` aufgeschlüsselt (trocken, 03.10. 14:24 UTC): `rv/` 12 Tars 8,13 MiB (je 0,69–0,71 MB) · `img/v1/rv` 12 Slots
0,58 MiB (`f000` 1,8 KB) · `img/v1/rzc` 12 Slots 0,07 MiB · `img/v1/konrad3d` 12 Slots je 92 B (keine Zellen) ·
`konrad3d/` 12 XML je 3,9 KB · `img/v1/inca` **13** Verzeichnisse (12 + V-NP0-4) 0,11 MiB · `status.json` 8 KB.
Zum Vergleich der lokale Klon vom 30.09. 22:07 UTC (Regen): `rv/` 12 × 3,50–3,66 MB = 42,3 MB, `img/v1/rv` 10,5 MiB
(`f000` 33,1–35,5 KB), `rzc` `frame.png` 13,0–15,0 KB, KONRAD ohne Zellen.

GitHub `size` **443 425 KB** (433 MiB) gegen 337 MiB Baum — der Rest ist abgehängte Historie bis zur GitHub-GC
(V-RD-4 stand am 30.08. bei 98 MiB).

**jsDelivr, je Linie ein GET** (14:25 UTC, `@main` und `@7b7d90b`):

| Datei | Bytes | `@main` | `@commit` |
|---|---|---|---|
| `point/2026100309/t1/00_02.bin` | 628 469 | 200 MISS 2,23 s | 200 MISS 1,27 s |
| `radar/img/v1/rv/2610031325/f000.png` | 1 787 | 200 MISS 0,92 s | 200 MISS 0,36 s |
| `road/v1/obs/2610031400.json` | 475 414 | 200 MISS 0,96 s | 200 MISS 1,06 s |
| `road/v1/static/stations.json` | 342 732 | 200 HIT 0,27 s | 200 MISS 2,09 s |
| `runs/2026100312/wind-009.png` | 245 813 | 200 MISS 1,09 s | 200 MISS 0,42 s |

Gegenprobe: `GET cdn.jsdelivr.net/gh/…@7b7d90b/radar/` (Verzeichnis) und `data.jsdelivr.com/v1/packages/gh/…@7b7d90b`
⇒ **403 nach 15,2 s**, Text „Package size exceeded the configured limit of 50 MB". **Folgerung:** Die Paketgrenze gilt
für Listings und Paket-Metadaten, nicht für Einzeldateien von GitHub (die Grenze „20 MB je Datei" bleibt). Der Client
braucht keine Listings (gerechnete Stempel seit BW-5/RD2). Gründe, die Roh-Tars bei 12 zu lassen, sind nur noch:
niemand liest sie älter als 55 min (D-NP0-2), Kopierzeit je Push, GitHub-Größe (V-RD-4). Die 15-s-403 passt zum Muster
V-FI-5 (403 nach Sekunden) — Vermutung, nicht geprüft: einige der vorübergehenden 403 könnten Paketabrufe sein.

## 3. D-NP0-2 — wer liest ältere Slots unter `radar/img/v1/`

| Leser | Was / wie alt | Anker |
|---|---|---|
| DE-Rückblick Regenradar (Seed) | 9 × `rv/<ts>/f000.png`, nur solange `rvImgEligible` (Gate … **55 min**), sonst Tar | `radarFrames.ts:119/127`, `radolan.ts:359/519`, `radolanRuns.ts:172–175`; Aufruf `NowcastRadarMap.tsx:286` |
| Regenradar-Karte (RR, Profil) | `radarPast` = die `measured`-Frames des Stacks (Sitzungs-Cache + Seed), nicht direkt vom CDN | `NowcastRadarMap.tsx:497`, `MapView.tsx:3481`, `precipComposite.ts:242/271` |
| ML-Hindcast | 4 × `f000` über `fetchRvAnalysisSequence` | `ml/radarHindcast.ts:19/97` |
| rzc-Notweg (Quelle weg) | bis 6 Slots (30 min), sonst 2 | `meteoSwissRadar.ts:60/75–76` |
| RV-Tar über CDN | `radar/rv/*.tar` ≤ 55 min (`rvCdnEligible`) | `radolanRuns.ts:101–105` |
| RV voller Slot, KONRAD, INCA, rzc | nur der jüngste gegatterte Slot (2 Kandidaten) | `radolan.ts:328`, `dwdKonrad3d.ts:48/66`, `geosphereIncaGrid.ts:145`, `meteoSwissRadar.ts:76` |
| buscosun Fusion 8 (Punkt) | jüngster Slot je Quelle (Suche ≤ 180 min rückwärts, jüngster zuerst), dort Frames bzw. `m<lead>.png` | `point/client/nowcastPoint.ts:63/192/205`, `point/nowcastFormat.ts:199`, `cubeSource.ts:1491–1531` |
| Punktarchiv-Sammler | `findLatestSlot` je Quelle | `scripts/punktarchiv/collect.mjs:405` |
| Dashboard | Punkt-Nowcast, Hinweis bei Slot > 30 min | `dashboard/data/extras.ts:143` |
| Verifier | `verify-radar-runs.mjs:253–265` (Fenster < 60 min, 9 × 5 min im Fenster), `verify-radar-repack.mjs:141/154` (Gates im 55-min-Fenster) | — |

**Vertragstext mit Aufbewahrung, der veröffentlicht wird:** `point/nowcastFormat.ts:133/145/151` `keptSlots: 12` je
Quelle und `:290` „Der Spiegel hält 12 Slots je Quelle (RV/RZC ≈ 1 h, INCA ≈ 3 h)" gehen über `nowcastManifest()` in
`src/point/manifest.ts:506` ins Punkt-Manifest. Bleibt der volle RV-Slot bei 12 und kommt der Rückblick in eine eigene
Ablage (E-NP0-1 A), stimmt der Text für RV weiter; bei rzc 24 (Plan NP-0a-3) wird `combiprecip.keptSlots` falsch —
entweder Text/Zahl im Punkt-Vertrag nachziehen (ändert eine Punkt-Producer-Ausgabe, Jans Gate NP-0b-nah) oder rzc
ebenfalls über eine Rückblick-Ablage führen.

## 4. D-NP0-3 — Push-Kette heute

`radar/status.json` live (14:25:32Z, Schema 2, `keep: 12`, Job 37123997416 seit 12:47:46Z, `derive: true`, 24 Zeilen ≈
37 min):

| Produkt | n | DWD→Push (s) Median / max | Slot→Push (min) Median / max | Push (ms) Median / max | Derive (ms) Median |
|---|---|---|---|---|---|
| RV (HDF5-Tar) | 8 | 10,1 / 15,6 | 3,89 / 4,01 | 1 125 / 1 314 | 1 865 |
| KONRAD3D | 7 | 6,9 / 14,9 | 5,63 / 5,73 | 1 005 / 1 402 | 215 |
| rzc | 7 | — | 1,35 / 1,48 | 966 / 1 127 | 353 |
| INCA | 2 | — | 19,3 / 21,4 (reftime-Verzug der Quelle) | 937 / 986 | 818 |

Alle Pushes im ersten Versuch. **Commits auf `main`** (`GET /commits?per_page=100`, 70 seit dem Wurzel-Commit der
Kartenlinie 13:07:05Z, 78,5 min): RV 16, KONRAD 16, rzc 15, road 13 (12 Slots + 1 Korridore), INCA 6, point 2, Karte
1 + Index 1 ⇒ **≈ 53,5 Commits/h**. Die Kartenlinie setzt die Historie alle 3 h auf einen Wurzel-Commit zurück.

**Läufe `radar.yml`** (`GET /actions/workflows/radar.yml/runs?per_page=40`, 173 insgesamt): 39 abgeschlossene, alle
`workflow_dispatch` (Selbst-Dispatch), Dauer 341–349 min, 38 `success`, 1 `failure` (26.09. 00:54, 341 min). Naht
(Start Nachfolger − Ende Vorgänger): **−2…−10 s** in 38 Fällen (der Nachfolger wartet in der Gruppe und startet sofort),
**+2 822 s (47 min)** nach dem Fehlschlag (Wachhund). Gleichzeitig läuft immer genau ein Lauf (concurrency
`radar-mirror`).

**Für NP-0a heißt das:** Das 11-s-Budget DWD→Push hält mit Reserve (max 16 s). Eine weitere Quelle, die in der
Schleife synchron wartet, verlängert jede Runde — die road-Linie hat genau dafür Fristen und ein Zeitbudget je Poll
eingebaut (`road-mirror.mjs:14–18, 34`). Blitzabrufe brauchen dasselbe (Frist je Abruf, Budget je Runde); die Dauer der
GetMap-Abrufe misst Fork B (D-NP0-4/7).

## 5. D-NP0-8 — Force-Push, Seed, Prune

**Code:** `publish-repack.mjs:150` klont `--depth=1` den ganzen Bestand, legt frische `runs/` darüber (:167), prunt
**nur** `runs/` (:82–86, :177), legt README + `build.yml` aus der Vorlage aus (:183–212) und pusht den ganzen Baum als
neuen Wurzel-Commit (:216–265). Alles außerhalb von `runs/` (also `radar/**`, `road/**`, `point/**`) fährt unverändert
mit. Der Spiegel (`radar-mirror.mjs:207–237`) setzt bei jedem Push neu auf, löscht `radar/` und kopiert den lokalen
Bestand (`MIRROR`) komplett hinein; `road/` kopiert der Haken (:222–224). Beim Start seedet `storeSeed()` (:185–199)
Roh-Dateien je Produkt und **das ganze `radar/img/v1/`** in den Bestand und prunt **jede** Quelle mit `imgPrune(source)`
= ein `KEEP` (:155–158, :197).

**Bare-Repo-Test** (scratch `bt/`, unverändertes Vorlagenskript, echter DWD, `KEEP=3`, `RUN_MINUTES=0`, ohne `APP_DIR`):

| Schritt | Ergebnis |
|---|---|
| Bestand auf `main`: `img/v1/lightning-de` 30 Slots, `img/v1/rv` 5 Slots, `img/v1/inca/…tmp-3300/`, `road/v1/obs/…`, `runs/…` | — |
| Spiegel-Job 1 (Push RV 1415 + KONRAD 1415) | `lightning-de` **30 → 3** (die drei jüngsten), `rv` 5 → 3, `.tmp-3300` **bleibt**, `road/` unverändert, `runs/` unverändert |
| Force-Push wie die Kartenlinie (frischer Klon, `.git` weg, `init`, ein Commit, `push --force`) | Historie = 1 Wurzel-Commit; `lightning-de`, `rv`, `.tmp-`, `road/` vollständig da |
| Naht: neuer Job, leerer Bestand (neuer Runner), seedet von `main` | Bestand `rv:1 konrad3d:1 img rv:3`; Push RV 1420 + KONRAD 1420 auf dem neuen Wurzel-Commit; Baum danach 2 Tars, `lightning-de` 3 Slots |

**Folgerungen für NP-0a-3:**
1. Neue Unterverzeichnisse unter `radar/img/v1/` überleben Force-Push und Naht ohne Zutun.
2. Retention je Quelle muss in **`imgPrune` UND `storeSeed`** wirken (beide rufen `imgPrune`). Eine Tabelle
   `KEEP_BY_SOURCE` mit `KEEP` als Rückfall für unbekannte Quellen; Roh-Produkte (`storePut`, Zeiger-Rückholung :349)
   bleiben bei `KEEP`.
3. **Nachholen nach einem Ausfall** reicht über `pending` nur `KEEP − 1` Slots zurück (:349) — nach dem 47-min-Ausfall
   fehlen in einem 24er-Rückblick die älteren Slots, bis sie herausaltern (2 h). Für `rv-past` kann man das in Kauf
   nehmen (benennen) oder den Zeiger für RV auf 23 Slots stellen (holt dann Tars nach, die nur für `f000` gebraucht
   werden).
4. Bei E-NP0-1 A entsteht `rv-past/<stamp>/f000.png` am besten **im Spiegel als Kopie** der eben abgeleiteten
   `rv/<stamp>/f000.png` (`copyFileSync`, byte-gleich per Konstruktion) — `radar-derive.mjs` und damit jede heutige
   Datei bleibt unberührt.
5. Zeitfenster für den Client, gleiche Herleitung wie die 55 min: jüngster Slot liegt 3,9 min nach dem Slot ⇒ der
   älteste von N Slots ist zwischen (N−1)·5 + 3,9 und (N−1)·5 + 8,9 min alt; bei N = 24 ⇒ garantiert bis
   **115 min** (= 55 + 60; Reserve wie heute 3,9 min). Unveränderliche Dateien unter Stempel-Pfad ⇒ `@main` zulässig
   (Lehre „unveränderliche `@main`").

**Wachstum `radar/` bei 24 Slots (Rückblick nach E-NP0-1 A, ohne Blitze):**

| Teil | trocken (03.10.) | nass (30.09.) | Extrem (§14.1: 2,9 MB/25 Frames) |
|---|---|---|---|
| `rv-past` 24 × `f000` | 43 KB | 0,84 MB | ≈ 2,8 MB |
| rzc +12 Slots | 72 KB | 0,18 MB | ≈ 0,4 MB (Annahme ×2) |
| KONRAD-Bild +12 Slots | 1 KB | 0 (keine Zellen) | 0,66 MB (55 KB je aktivem Slot, §14.1) |
| **Summe** | **≈ 0,1 MB** | **≈ 1,0 MB** | **≈ 3,9 MB** |

Gegen 337 MiB Baum vernachlässigbar; Kopierzeit je Push (`cpSync` des ganzen `img/`) wächst um dieselben Bytes.

## 6. Blitze: im Kern oder als Haken? (zu E-NP0-2 und NP-0a-4)

| | **(i) im Kern** (`pollLightning` wie `pollInca` in `radar-mirror.mjs`) | **(ii) als Haken** (`scripts/lightning/lightning-mirror.mjs` im Web-Klon, geladen wie road) |
|---|---|---|
| Wo lebt die Logik | Daten-Repo-Kopie; jede Änderung = neue Kopie durch Jan | buscosun-web `main`; der Job klont sie beim Start (wie `radar-derive.mjs`) — nach dem einmaligen Kern-Eingriff wirkt jede Änderung mit dem Web-Push |
| Vertrag (`lightningImg.ts`) | der Spiegel läuft ohne TS-Lader ⇒ Kindprozess nötig | Kindprozess wie `road-derive.mjs --plan` (bewährt) |
| Zwei Linien in einer Datei | Blitz-Code mitten im Kern, den die road-Linie ebenfalls ändert ⇒ Konfliktfläche (agents.md Regel 1) | Kern bekommt nur Haken-Zeilen; jede Linie besitzt ihr Modul |
| Fehler-Isolation | try/catch je Poll | wie road: Modul nicht ladbar ⇒ aus; `LIGHTNING=0` |
| Ablage unter `radar/img/v1/lightning-*` (E-NP0-2 A) | direkt im Bestand | der Haken schreibt in **`MIRROR/img/lightning-*`** — dann tragen `publish()`/`storeSeed()` die Dateien ohne `copyInto`, und „kein eigener Push" heißt: `poll()` liefert `null`, die Dateien fahren mit dem nächsten Produkt-Push; nur nach 5 min ohne Push eine eigene Meldung |
| Ablage `lightning/v1/` (E-NP0-2 B) | `publish()` muss zweite Wurzel führen | `copyInto` + Pfadliste wie road — der Kern kennt heute nur `road` fest verdrahtet (:224) |
| Unvermeidlicher Kern-Eingriff | Retention je Quelle + Poll | Retention je Quelle (am besten vom Haken gemeldet, z. B. `keepBySource()`) + ein zweiter Haken (sauberer: Haken-Liste statt fester `road`-Variable — berührt Zeilen der road-Linie ⇒ abstimmen) |
| Byte-Gleichheit der heutigen Dateien | gegeben, solange `radar-derive.mjs` und Roh-Retention unberührt | ebenso |

**Empfehlung aus Sicht der Mechanik:** (ii) + E-NP0-2 A. Der Kern ändert sich einmal (Retention je Quelle, Haken für
Blitze, `rv-past`-Kopie, `status.json` Schema 3), danach entwickelt sich die Blitz-Logik ohne weitere
Daten-Repo-Kopie. `status.json` hat keinen Code-Leser (nur Telemetrie; der Wachhund prüft Läufe, `verify-health.mjs`
liest nur `road/v1/status.json`) ⇒ Schema 3 ist risikolos.

## 7. Weitere Befunde

- **V-NP0-4 (neu) — verwaiste Derive-Reste auf `main`:** `radar/img/v1/inca/20260920T0030.tmp-3300/` (13 Dateien,
  5 KB) seit 20.09. `imgSlots()` filtert `.tmp-` aus (:154) ⇒ `imgPrune` räumt nie auf; `publish()` (`cpSync` des ganzen
  `img/`, :219) und `storeSeed()` (:196) tragen das Verzeichnis aber in jedem Push und jeder Naht weiter. Ursache
  vermutlich ein abgebrochener Derive (Timeout/Jobende zwischen `mkdir tmp` und `rename`). Mehrwert: sauberer Baum,
  kein Wachstum bei weiteren Abbrüchen. Skizze: in `imgPrune` `.tmp-`-Verzeichnisse älter als 10 min löschen bzw. beim
  Kopieren auslassen. Ändert die heutige Ablage (entfernt Müll) ⇒ im NP-0a-Kern-Eingriff mit Jans Freigabe.
- **V-NP0-5 (neu) — zwei Linien in `scripts/radar-mirror.mjs`:** Autobahnwetter (`audit/autobahnwetter.md` §1.2:
  Rechte an `scripts/radar-mirror.mjs` im Daten-Repo, Push „nie force") und NP-0a ändern denselben Kern. Mehrwert: kein
  Überschreiben fremder Änderungen bei Jans Kopie. Skizze: NP-0a baut auf dem Stand `ef6d7af` auf, Kern-Eingriff klein
  und getrennt kommentiert; vor der Kopie ins Daten-Repo `diff` gegen die Daten-Repo-Kopie (heute identisch).
- **README:** Die Daten-Repo-README ist identisch mit `scripts/repack-repo/README.md` — und **die Kartenlinie legt sie
  bei jedem Lauf aus der Vorlage im Web-Klon neu aus** (`publish-repack.mjs:183–184`). Eine README-Änderung erreicht das
  Daten-Repo also mit dem Web-Push automatisch (≤ 3 h), ein eigener Kopierschritt ist nicht nötig. Die Notiz in §6 des
  Plans („Vorlage der Kopie voraus: drei Zeilen zum Stundenmittel") ist erledigt. Die README nennt schon das Prinzip
  „**Alter statt Anzahl**" (Aufbewahrungstabelle, road `obs` ≤ 3 h) — für NP-0a ist eine Altersregel (z. B. Rückblick
  ≤ 2 h, mindestens 2 Slots) die zum Repo passende Form.
- INCA-Slot `20261003T1215` hat 11 statt 12 Frames (`f015` fehlt) — die `meta.json` nennt dieselben 11 ⇒ Lieferung der
  Quelle, kein Spiegel-Defekt.
- `radarFrames.ts:115–118` Kommentar „jeder Lauf ist ein eigener ~1,6-MB-Tar" ist seit RD3 überholt (Rückblick liest
  `f000.png`) — kosmetisch.
