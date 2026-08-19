# QA & Teststrategie — Strategie-Deep-Dive (2026-07-31)

> Rolle: **QA & Teststrategie** (Agent-Team, `agents.md` §2) · Stand 2026-07-31
> Zuständigkeitsbereich: `scripts/verify-*`, CI-Konzept (O-02), UI-Regressionsnetz
> Alle Aussagen sind am Code belegt (`Datei:Zeile`). **Kein Skript wurde ausgeführt** (Session-Regel) —
> wo Laufzeiten genannt sind, sind sie als Schätzung markiert.

---

## 1. Auftrag & Abgrenzung

**Auftrag:** Vollständiges Inventar der Verifikations-Infrastruktur, Prüfung ihrer Integrität,
Abdeckungs-Landkarte, CI-Blaupause (Ausbau von V-11), UI-Regressionskonzept,
Härtung des Fusion-v2-Cutover-Gates (Ausbau von V-15) und eine Entscheidungsvorlage zu **O-02**.

**Abgrenzung:**
- Reine Analyse. Keine Code-, Build- oder Config-Datei wurde verändert; kein Test, Verifier, Build
  oder npm-Skript wurde ausgeführt; kein Commit.
- Einzige geschriebene Datei ist dieses Dokument.
- **O-02 wird nicht entschieden**, sondern als Vorlage mit Empfehlung aufbereitet (§8).
  Jede Option mit neuer Dependency ist ein **STOPP & FRAGEN** an Jan (§12).
- Nicht behandelt (andere Rollen): A11y-Programm-Inhalt (V-12), MapView-Zerlegungs-Design (V-14/O-04),
  Betriebs-Monitoring-Inhalt (V-03) — hier nur die jeweiligen QA-Schnittstellen.

**Kernthese dieses Berichts:** Die Datenschicht von buscosun ist überdurchschnittlich gut verifiziert.
Das Problem ist nicht die Abdeckung, sondern die **Integrität** der Prüfmittel: mehrere zentrale Gates
können nicht fehlschlagen. Eine Prüfung, die nicht fehlschlagen kann, ist schlechter als keine — sie
erzeugt Vertrauen ohne Grundlage und widerspricht damit direkt dem Produktprinzip D-04 (Ehrlichkeit).

---

## 2. Verifier-Inventar (vollständige Tabelle)

### 2.1 Zahlen zuerst — die Doku ist zu optimistisch

| Größe | Doku-Behauptung | Belegte Realität |
|---|---|---|
| `verify-*.mjs`-Dateien | „~30" (`CLAUDE.md:58`, `architecture.md:105`, `decisions.md:29`) | **25** — 24 in `scripts/`, 1 in `scripts/seo/` |
| davon per npm erreichbar | — | **23** (nicht: `verify-aec.mjs`, `verify-wind-transport.mjs`) |
| npm-Einträge `verify:*` / `fusion:*` | „~30" | **26** (20 + 6) |
| davon mit **wirksamer** Assertion + Exit-Code | — | **20** (6 sind Reports oder tautologisch, s. §3) |
| davon **netzfrei** (PR-tauglich) | — | **12** npm-Kommandos |
| `src`-Module mit `verify()`-Selbsttest | „~68" (`architecture.md:105`) | **76 Exporte in 69 Dateien** |
| davon an ein npm-Skript angebunden | — | **8** — die übrigen ~68 laufen nur, wenn jemand sie in der Dev-Konsole aufruft |

### 2.2 Netzfreie Verifier (CI-fähig, PR-blockierend)

| npm-Skript | Datei | Was tatsächlich assertiert wird | Laufzeit (geschätzt) | Status |
|---|---|---|---|---|
| `verify:governor` | `scripts/verify-governor.mjs` (232 Z.) | `FrameGovernor` am echten Modul: 27 Checks — FPS-Leiter runter/rauf, Totband, Anti-Oszillation, Cooldown, GPU-Klassifikation, Tier-Init, Trail-Letzthebel + Wiederherstellungs-Reihenfolge (`:178-229`) | < 1 s | **Vorbildlich.** Bester Verifier des Repos |
| `verify:precip-source` | `verify-precip-source.mjs` (64 Z.) | `precipSource.ts` echt: In-App-`verifyPrecipSource()` + 8 externe Checks — Radar-Fenster DE 2 / AT 3 / CH 0,5 h, keine Modellverlängerung, DACH-OR, Slider-Horizont | < 1 s | OK (30 Checks) |
| `verify:rotation` | `verify-rotation.mjs` (79 Z.) | `rotationPotential.ts` echt: In-App-Selbsttest + Rampen-Anker, `levelOf`-Schwellen, Glättung dämpft Einzelpixel, NaN-Maske erhalten | < 1 s | OK (30 Checks) |
| `verify:thunder` | `verify-thunder.mjs` (20 Z.) | Spiegelt `verifyThunderPotential()` aus `src/radar/thunderPotential.ts` | < 1 s | OK |
| `verify:lpi` | `verify-lpi.mjs` (20 Z.) | Spiegelt `verifyLpiRisk()` aus `src/radar/lightningPotential.ts` | < 1 s | OK |
| `verify:snow` | `verify-snow.mjs` (57 Z.) | `freshSnowCmFromSwe` echt (Checks a–d); **Checks e–g rechnen auf lokal duplizierten Konstanten** (`:11`) | < 1 s | **teil-vakuös** (H4) |
| `fusion:verify` → 1 | `verify-oi.mjs` | `verifyOi()` aus `src/fusion/oi.verify.ts` (Gl. 3/7/8, SOAR-B) | < 2 s | OK |
| `fusion:verify` → 2 | `verify-background.mjs` | `verifyBackground()` (Gl. 2/4, C1-Lizenzsplit) | < 2 s | OK |
| `fusion:verify` → 3 | `verify-phase45.mjs` | `verifyPhase45()` (Gl. 10/14/15) | < 2 s | OK |
| `fusion:verify` → 4 | `verify-modelsource.mjs` | `verifyModelSource()` — Fusion⇄Native-Resolver, Per-Layer schlägt Global | < 2 s | OK |
| `fusion:loso` | `verify-loso.mjs` (81 Z.) | **ohne Argument:** synthetische Fixture, OI schlägt IDW/ICON-D2/Background + kein Drift + Spread-Skill > 0 (`:69-76`). **mit Fixture-Argument: keine Assertion** (`:77-79`) | 2–5 s | **halb-blind** (H2) |
| `verify:seo` | `scripts/seo/verify-seo.mjs` (142 Z.) | Roh-HTML in `dist/`: H1, `<title>`, meta description, OG, og:image kein SVG, canonical, Lead ≥ 25 Wörter, JSON-LD parsebar + Typ | < 2 s (nach Build) | OK — **läuft aber in keinem Build automatisch** (`package.json:8`) |
| `verify:simradar` | `verify-simradar.mjs` (64 Z.) | **nichts aus `src/`** — importiert kein einziges Modul; prüft ein selbst definiertes Oracle gegen sich selbst | < 1 s | **tautologisch + Feature gelöscht (D-15)** (H3) |

### 2.3 Netzabhängige Verifier (nur nightly geeignet)

| npm-Skript | Datei | Was assertiert wird | Netz-Ziel | Laufzeit (geschätzt) | Status |
|---|---|---|---|---|---|
| `verify:layer-transport` | `verify-layer-transport.mjs` (169 Z.) | Edge-Handler `dwd-grib.ts` in Node: Byte-Identität SHA-256 + Länge je Param (7 × 2D + hsurf + 5 EPS + clat/clon), Durable-Header, Whitelist/Listing/Traversal-Abwehr, Fehlerpfad `no-store` | opendata.dwd.de, ~15 GRIB-Dateien | 1–3 min | OK; einziger Transport-Beweis. Netzfehler = FAIL (H11) |
| `verify:eps` | `verify-eps.mjs` (105 Z.) | GDT 101 + Multi-Message am echten `decodeGrib2All`: 542.040 Zellen, ≥ 10 Member, Ensemble-Mittel plausibel, Member unterscheiden sich | DWD-Directory-Listing + Bytes | 30–90 s | OK |
| `verify:icon-eu` | `verify-icon-eu.mjs` (78 Z.) | `decodeGrib2` echt; **`sampleField` ist eine Kopie** aus `iconEuRasterSource` (`:6`, `:20-34`) | opendata.dwd.de | 30–60 s | teil-vakuös (H5) |
| `verify:gfs-2d` | `verify-gfs-2d.mjs` (40 Z.) | `fetchGfs2dGrid` echt: Gitterform 24×20, ≥ 1 Schritt, DACH-Bounds, t/Wind/Wolken > 90 % + plausibel | NOAA-S3 | 20–60 s | OK |
| `verify:ifs` / `:aifs` / `:aifs-ens` | `verify-ifs.mjs` (36 Z.) | `fetchEcmwfGrid` echt, Modell per Argument | ECMWF Open Data | je 30–90 s | OK — **prüft nicht den Prod-Pfad** (§2.5) |
| `verify:arome-fr` | `verify-arome-fr.mjs` (38 Z.) | `fetchAromeFranceGrid` echt: 20×18, Bounds AROME∩DACH, t/Wind > 50 %, Wolken bewusst leer | Météo-France | 30–90 s | OK — **prüft nicht den Prod-Pfad** |
| `verify:arpege` | `verify-arpege.mjs` (35 Z.) | `fetchArpegeGrid` echt; Header-Walk über 264-MB-Bundle (`:4-5`: „bewusst langsam, ~200 Byte-Range-Reads") | Météo-France | **2–6 min** | OK, aber der langsamste Verifier |
| `verify:ch-eps` | `verify-ch-eps.mjs` (52 Z.) | `fetchIconChEpsGrid` echt für CH1 + CH2: Gitterform, Bounds über CH, Werte | MeteoSwiss/CSCS | 1–3 min | OK — **prüft nicht den Prod-Pfad** |
| `verify:icon-global` | `verify-icon-global.mjs` (77 Z.) | `decodeGrib2` echt, icosahedral ~2,9 M Zellen, Nearest-Cell an 4 DACH-Städten | DWD | 2–5 min | **externe `python`-Binary** (`:24`) |
| `verify:aicon` | `verify-aicon.mjs` (64 Z.) | AICON teilt ICON-global-Zellordnung, Werte plausibel | DWD | 2–5 min | **externe `python`-Binary** (`:17`) |

### 2.4 Skripte unter `verify:`/`fusion:`, die **keine** Verifier sind

| npm-Skript | Datei | Was es wirklich tut | Exit-Code |
|---|---|---|---|
| `fusion:gate` | `phase3-gate.mjs` (88 Z.) | Druckt LOSO-τ=0-Tabelle **und ein hart kodiertes STOP** (`:82-88`) | **immer 0** (H1) |
| `fusion:loso` (mit Pfad) | `verify-loso.mjs` | druckt Tabellen, „no synthetic sanity assertion applied" (`:78`) | 0, sofern CRPS-Selbstcheck + `corr>0` (H2) |
| `fusion:desroziers` | `desroziers.mjs` (36 Z.) | Artefakt-Generator, **keine Assertion, kein `process.exit`** | immer 0 (H6) |
| `fusion:status` | `archive-status.mjs` (71 Z.) | Reifebericht; druckt „⛔ NOT READY" (`:64`) | immer 0 (H7) |
| `fusion:train` | `train-background.mjs` (97 Z.) | Fit-Produzent; Equivalence-Gate-Marker gut gelöst (`:54-61`) | 0 auch bei „nichts zu tun" (`:45`, H8) |
| `qa:layers` | `qa-layers.mjs` (67 Z.) | Playwright-Browser-QA gegen laufenden Dev-Server | **exit 2 — `playwright` fehlt in `devDependencies`** (H9) |
| `capture` | `capture-fixture.mjs` | Fixture-Produzent | — |

### 2.5 Nicht per npm erreichbare Skripte

| Datei | Zweck | Warum unerreichbar |
|---|---|---|
| `verify-aec.mjs` (74 Z.) | GRIB2-CCSDS-AEC bit-genau gegen eccodes | Braucht `<datadir>` mit `ref_meta.json`/`ref_*.npy` — **nicht im Repo** (`git ls-files` leer), kein npm-Alias (H10) |
| `verify-wind-transport.mjs` (84 Z.) | T1-Pendant für `dwd-wind.ts` | Kein npm-Alias — `dwd-wind.ts` hat damit **keinen** verdrahteten Verifier |
| `equivalence-check.mjs` (94 Z.) | Browser-vs-Node-Capture-Äquivalenz; schreibt den Ship-Marker | Kein npm-Alias; Marker ist gitignored (`fixtures/.gitignore:4`) |
| `perf-oi.mjs` (151 Z.) | Rechenkosten-Gate v2 ≤ 1,5× Baseline | Kein npm-Alias |
| `probe-ch.mjs`, `probe-eps.mjs` | Diagnose-Proben | Bewusst manuell |

**Prod-Blindspot:** `verify:arome-fr`, `verify:arpege`, `verify:ifs/aifs/aifs-ens`, `verify:ch-eps` rufen
die Adapter **in Node ohne Proxy** (Kommentare `verify-arome-fr.mjs:3`, `verify-ifs.mjs:3`,
`verify-arpege.mjs:3-4`). Genau diese vier Quellen sind in Produktion defekt (`/_mf`, `/_ecmwf`, `/_cscs`
fehlen in `netlify.toml` — Defekt A1/V-01). **Alle vier Verifier sind grün, während das Feature live kaputt ist.**
Das ist der teuerste blinde Fleck des Inventars: die Prüfmittel testen einen Pfad, den kein Nutzer geht.

---

## 3. Harness-Integrität — Befunde (Assertions, Exit-Codes, stille Fehlschläge)

Bewertung: **P0** = Gate kann nicht fehlschlagen oder produziert falsches Grün · **P1** = Assertion prüft
nicht, was sie behauptet · **P2** = Reibung/Reproduzierbarkeit.

| # | Ort | Befund | Schwere |
|---|---|---|---|
| **H1** | `scripts/phase3-gate.mjs:78,82-88` | Das Gate **kann weder bestehen noch fehlschlagen.** Das per-Variable-`ok`-Flag (`:78`) wird nur gedruckt, nie aggregiert; das Skript endet nach `console.log` → Exit 0. Zusätzlich ist das Verdikt **hart kodierter Text** („⛔ STOP — DIAGNOSIS: ARCHIVE TOO SHORT", `:86`) und wird unabhängig von den Daten ausgegeben — auch jetzt, wo `fixtures/` **273 Session-Captures** enthält (bis `session-2026-07-31T13`). Der gesamte D-13-Cutover hängt an diesem Skript. | **P0** |
| **H2** | `scripts/verify-loso.mjs:68-79` | Mit Fixture-Argument wird die diskriminierende Assertion **abgeschaltet**: `:78` druckt „(real fixture — tables printed; no synthetic sanity assertion applied)". Es bleiben `crpsOk` (ein Selbsttest der Formel gegen zwei Konstanten, `:20-23`) und `ss.corr > 0`. Der Lauf gegen **echte** Daten — der, der den Cutover rechtfertigen soll — prüft praktisch nichts. Die bereits berechneten `ciLow/ciHigh/significant` (`:48-51`) fließen in **kein** Urteil ein. | **P0** |
| **H3** | `scripts/verify-simradar.mjs` (ganze Datei) | **Null Imports aus `src/`.** `:20-21` re-implementiert Marshall-Palmer, `:32-35` prüft die Re-Implementierung gegen sich selbst. Der Verifier kann durch keine Code-Änderung rot werden. Das getestete Feature ist seit D-15/N1-5 gelöscht (`src/sources/iconD2Dbz.ts` existiert nicht mehr). | **P0** |
| **H4** | `scripts/verify-snow.mjs:11` | `const DEPTH_VMAX = 150, FRESH_VMAX = 50; // == iconD2Snow.ts` — dupliziert statt importiert. Die echten Werte sind exportiert: `src/sources/iconD2Snow.ts:53` (`SNOW_DEPTH_VMAX_CM`) und `:54` (`SNOW_FRESH_VMAX_CM`). 9 der 20 Checks (`:40-51`) prüfen nur die Kopie. | **P1** |
| **H5** | `scripts/verify-icon-eu.mjs:6,20-34` | `sampleField` ist laut Header „gespiegelt aus `iconEuRasterSource.sampleField`". Bricht die bilineare Interpolation im Produktionscode, bleibt der Verifier grün. | **P1** |
| **H6** | `scripts/desroziers.mjs` (ganze Datei) | Keine einzige Assertion, kein `process.exit`. Firmiert unter `fusion:*` und wirkt damit wie ein Gate. | **P1** |
| **H7** | `scripts/archive-status.mjs:20,64` | Druckt „⛔ NOT READY — archive too short" und beendet mit 0. Als Report legitim, im `fusion:*`-Namensraum irreführend. | **P2** |
| **H8** | `scripts/train-background.mjs:45` | `process.exit(0)`, wenn kein Fixture gefunden wird → „nichts zu tun" ist von „Erfolg" nicht unterscheidbar. | **P2** |
| **H9** | `scripts/qa-layers.mjs:20-25` | `playwright` ist **nicht** in `devDependencies` (`package.json:49-55`) → das Skript beendet heute mit Exit 2. Gleichzeitig berufen sich drei Verifier-Header auf diesen Präzedenzfall: „Exit != 0 … gate-bar wie `qa:layers`" (`verify-oi.mjs:8-9`, `verify-modelsource.mjs:10`, `verify-eps.mjs:8`). **Der zitierte Goldstandard ist tot.** | **P1** |
| **H10** | `scripts/verify-aec.mjs:17-20` | Braucht ein externes `<datadir>` mit eccodes-Referenzdumps, die nicht im Repo liegen, und hat keinen npm-Alias. Die Behauptung „bit-verifiziert gegen eccodes" (`architecture.md:52`, `decisions.md:23` / D-07) ist ein **historisches Einmal-Ergebnis**, kein wiederholbares Gate. | **P1** |
| **H11** | `scripts/verify-layer-transport.mjs:89` | Schlägt der Direkt-Fetch fehl, wird `ok(false, …)` gesetzt **und per `return` werden die vier restlichen Checks der Datei übersprungen**. Ein Netz-Aussetzer reduziert damit still die Anzahl der Assertionen. Grundsätzlich gilt für alle 12 Live-Verifier: **Netzfehler und Code-Fehler sind ununterscheidbar** — `agents.md:69` nennt das als bekannte Falle, es ist aber im Harness nicht abgebildet (kein eigener Exit-Code für „upstream nicht verfügbar", außer in `verify-layer-transport.mjs:105`/`verify-wind-transport.mjs:49`, die korrekt `exit 2` verwenden). | **P1** |
| **H12** | `scripts/warm-grib.mjs` (Fail-Safe-Zweige, Ende) + `:388`; `scripts/warm-wind.mjs:182` | Jeder Fail-Safe-Zweig gibt `return 0` zurück: „Nichts umzulegen (Fail-Safes). Exit 0." und „Kein gültiger 2D-Abschnitt verfügbar → Manifest NICHT geschrieben … Exit 0." Der Workflow (`\.github/workflows/warm-grib.yml`, Schritt „Commit manifest if changed") verlässt sich darauf und meldet dann „Manifest unverändert … kein Commit" mit `exit 0`. **Ein Warmer, der zwei Tage nichts tut, meldet zwei Tage lang Erfolg.** Das ist der belegte Mechanismus hinter Defekt A3 / V-03 — und gehört als Harness-Integritätsproblem in diesen Bericht: eine Prüfung, die nicht fehlschlagen kann. | **P0** |
| **H13** | `tsconfig.app.json` (`include: ["src"]`), `tsconfig.node.json` (`include: ["vite.config.ts"]`) | **`netlify/edge-functions/*.ts` liegt in keinem tsconfig.** `npm run typecheck` prüft die beiden gehärteten Cache-Proxys — die sicherheitskritischsten Dateien des Repos (Open-Proxy-Abwehr) — **nicht**. Ebenso wenig `scripts/**`. | **P1** |
| **H14** | alle `scripts/*.mjs` | Die Verifier sind JavaScript. Ein umbenannter Export in `src/` bricht sie erst zur Laufzeit — und nur, wenn jemand sie startet. Ohne CI ist das faktisch „nie". | **P1** |
| **H15** | `scripts/qa-layers.mjs:32-41` | Selektiert `.layer-switch button` und filtert per Textinhalt („Temperatur", „Wind", „Böen", „Wolken"). `.layer-switch` existiert nur noch in `src/MapView.css:128`; nach dem Command-Deck-Redesign (D-27) ist der Selektor-Vertrag unbelegt. Lehrbuchbeispiel für die Brüchigkeit selektorbasierter UI-Tests. | **P2** |
| **H16** | `fixtures/.gitignore:4` | `.equivalence-passed` ist gitignored → in CI oder einem frischen Klon schreibt `train-background.mjs` immer nur `fixtures/background-provisional.json`, nie nach `public/params/`. Als Sicherheitsdesign richtig, für CI aber ein bewusst zu dokumentierender Zustand. | **P2** |
| **H17** | `verify-icon-global.mjs:24`, `verify-aicon.mjs:17` | `execFileSync('python', …)` — eine **nicht deklarierte externe Abhängigkeit**. Auf `ubuntu-latest` heißt das Binary in vielen Images `python3`; ohne `actions/setup-python` scheitern beide Verifier in CI. Schlimmer: die App entpackt mit **`bzip2-wasm`** (Runtime-Dependency, `package.json:43`) — die Verifier testen also einen **anderen** Dekomprimierungspfad als die App. | **P1** |
| **H18** | `package.json` (kein `engines`), kein `.nvmrc` | 21 der 26 Verifier brauchen `--experimental-strip-types` (Node ≥ 22.6). Nirgends gepinnt; nur die beiden Warm-Workflows setzen `node-version: '22'`. | **P2** |

**Zusammenfassung §3:** Von 26 npm-Einträgen unter `verify:`/`fusion:` tragen **6 keine wirksame
Assertion** (`fusion:gate`, `fusion:desroziers`, `fusion:status`, `fusion:train`, `verify:simradar` und
`fusion:loso` im Realdaten-Modus). Zwei davon — `fusion:gate` und `fusion:loso` — sind ausgerechnet die
beiden Gates, an denen der wichtigste offene Datenschritt des Projekts (Fusion-v2-Cutover, D-13) hängt.

---

## 4. Abdeckungs-Landkarte + Risiko×Abdeckung-Matrix

### 4.1 Quantifizierung (`find src -name "*.ts*" | xargs wc -l`)

| Bereich | Umfang | Automatisierte Abdeckung |
|---|---|---|
| **`src` gesamt** | 367 Dateien, **75.510 LOC** | — |
| davon `.tsx` (React-Oberfläche) | 119 Dateien, **27.815 LOC** | **0** |
| davon `.ts` (Logik) | 248 Dateien, 47.695 LOC | teilweise |
| CSS | 11.729 LOC (`src` + `public`) | 0 |
| Service Worker `public/sw.js` | 96 LOC | 0 |
| Warm-Skripte `warm-grib.mjs` + `warm-wind.mjs` | 570 LOC Betriebslogik | 0 — **und sie können nicht fehlschlagen** (H12) |
| Edge Functions `netlify/edge-functions/*.ts` | 2 Dateien | gut abgedeckt (`verify-layer-transport`) — aber **nur netzabhängig** und **ohne Typecheck** (H13); `dwd-wind.ts` ohne npm-Anschluss |

**Netzfrei am echten App-Code verifiziert** (die belastbare Zone):
`src/wind/perfGovernor.ts` (282 LOC) · `src/fusion/{oi, background, phase45, modelSource, loso, crps, fixture, predictors}` ·
`src/nowcast/precipSource.ts` · `src/nowcast/alpineSplit.ts` (eine Funktion) ·
`src/radar/{thunderPotential, rotationPotential, lightningPotential}`
→ Größenordnung **3.500–4.000 LOC = rund 5 % von `src`**.

**Nur live verifiziert:** `src/sources` (53 Dateien, 8.661 LOC) — 12 Verifier decken ca. 12 der 53 Quellen,
und vier davon prüfen einen Pfad, den es in Produktion nicht gibt (§2.5).

**Die größte ungenutzte Ressource:** **76 exportierte `verify*()`-Selbsttests in 69 `src`-Dateien**,
davon nur **8** an ein npm-Skript angebunden. Die übrigen hängen an `window.__verify*`
(z. B. `src/atmosphere/foehn.ts:120`, `src/ml/isotonic.ts:156`, `src/confidence/hitRateModel.ts:217`,
`src/route/movementModels.ts`) und laufen nur, wenn jemand sie in der Dev-Konsole aufruft. Sie sind
bereits geschrieben, bereits gepflegt, und liefern heute **null** Regressionsschutz.

### 4.2 Risiko × Abdeckung

Risiko 1–5 (Wahrscheinlichkeit × Schadenshöhe bei stiller Regression). Abdeckung 0–5.

| # | Einheit | LOC | Risiko | Abdeckung | Begründung |
|---|---|---|---|---|---|
| 1 | `src/MapView.tsx` | **3.971** | **5** | **0** | 26 useState, 56 useEffect, 64 useRef, 16 Layer; Z-Ordnung an ~3 Stellen dupliziert (`architecture.md:30`). Jede Änderung ist ein Blindflug. Sperrzone für Parallelarbeit (`agents.md:33`) — **weil** kein Netz existiert |
| 2 | `src/sources` (ohne die 12 verifizierten) | ~6.500 | **5** | 1 | Reverse-engineerte Konstanten (DWD-Layout, RADOLAN-Header, DE1200-Ecken); brechen bei Upstream-Änderung still (`architecture.md:54`) |
| 3 | `src/wind` ohne `perfGovernor` | 4.301 | **5** | 0 | WebGL-Shader/RGBA8-Pfad; auf Emulator strukturell nicht prüfbar (`CLAUDE.md:59`); Real-Device-Park = 1 Gerät |
| 4 | `netlify/edge-functions` | klein | **5** | 3 | Open-Proxy-Abwehr gut getestet — aber netzabhängig, `dwd-wind.ts` ohne npm-Anschluss, **kein Typecheck** (H13) |
| 5 | Warm-Skripte + Workflows | 570 | **4** | 0 | A3 hat bewiesen, dass ein 2-Tage-Ausfall unbemerkt bleibt; Skripte melden Erfolg im Fehlerfall (H12) |
| 6 | `public/sw.js` | 96 | **4** | 0 | Ein falsch cachender SW liefert Nutzern dauerhaft eine kaputte App aus; kein Rollback ohne Version-Bump |
| 7 | `src/route` | 6.677 | 3 | 0 | Alleinstellungs-Feature (Ankunftszeit, E-Bike-Akku); Timing-/Scoring-Logik ist pur und wäre testbar |
| 8 | `src/history` | 5.341 | 3 | 0 | 12 Chart-Typen; `historyVerify.ts` existiert (4 `verify`-Exporte!), ist aber an kein Skript angebunden |
| 9 | `src/event` | 3.811 | 3 | 0 | `EventResult.tsx` 1.663 LOC; Phasen-Scoring pur und testbar |
| 10 | `src/App.tsx` + `src/mapState.ts` | 205 | 3 | 0 | Routing/Permalinks; **`mapState.ts` ist pur (D-12 nennt es als Beispiel) und hat trotzdem keinen `verify()`** — 20 Zeilen Arbeit für einen Rundlauf-Test |
| 11 | `src/fusion` v2-Pfad | 5.436 | **5** | 3 | Gute Einzel-Gates, aber das **Cutover-Gate ist funktionsunfähig** (H1/H2) |
| 12 | A11y / Kontrast / Keyboard | quer | 3 | 0 | V-12; heute kein einziger maschineller Check |

**Die vier Felder mit Risiko ≥ 4 UND Abdeckung 0:** `MapView.tsx` · `src/wind`-Rendering ·
`src/sources`-Kontrakte · Warm-Betrieb + `sw.js`. Das sind zusammen rund **15.000 LOC** an
höchstriskantem, völlig ungeprüftem Code — plus ein Cutover-Gate, das strukturell nicht urteilen kann.

---

## 5. CI-Blaupause (konkreter Job-Entwurf, PR vs. nightly)

Ausbau von **V-11**. Heute existiert **keine** CI: `.github/workflows/` enthält ausschließlich
`warm-grib.yml` und `warm-wind.yml`. `tsc` und `vite build` laufen erstmals beim Netlify-Deploy.

### 5.1 `ci.yml` — PR-blockierend

```
on:
  pull_request:
  push: { branches: [main] }
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      1  actions/checkout@v4
      2  actions/setup-node@v4  (node-version: 22, cache: npm)
      3  npm ci
      4  npm run typecheck                       # tsc -b --noEmit
      5  npx tsc --noEmit -p tsconfig.edge.json  # NEU — schließt H13
      6  npm run build                           # tsc -b && vite build && generate-seo
      7  npm run verify:seo                      # gegen dist/ — heute rein manuell
      8  node scripts/check-bundle-budget.mjs    # NEU (§5.4)
      9  Verifier-Batch (netzfrei):
           npm run verify:governor
           npm run verify:precip-source
           npm run verify:thunder
           npm run verify:lpi
           npm run verify:snow
           npm run verify:rotation
           npm run fusion:verify
           npm run fusion:loso                   # ohne Argument = synthetisch, assertiert
           npm run verify:selftests              # NEU (V-QA-08)
```

**Warum diese Reihenfolge:** Schritte 4–5 sind die billigsten (Sekunden) und fangen das Häufigste.
Der Build (6) ist Voraussetzung für 7 und 8. Der Verifier-Batch (9) ist zusammen < 15 s und steht
zuletzt, weil er am seltensten bricht.

**Laufzeit-Schätzung** (nicht gemessen — Session-Regel):
`npm ci` ~20–30 s (nur 6 Runtime- + 5 Dev-Dependencies, kein Browser-Download) ·
`typecheck` ~15–30 s (367 Dateien, `skipLibCheck: true`) · `vite build` ~40–80 s ·
`generate-seo.mjs` ~5–20 s (246 Zeilen, erzeugt hunderte Seiten) · `verify:seo` ~2 s ·
Budget-Check < 1 s · Verifier-Batch ~10–15 s → **rund 2–3 min**. Für einen Ein-Personen-Betrieb
mit parallelen Agenten ist das genau richtig.

**Bewusst NICHT im PR-Job:** alles Netzabhängige. `agents.md:69` hält bereits fest, dass Live-Verifier
an DWD-Publikationsfenstern scheitern können — ein rotes PR wegen Upstream-Churn zerstört das
Vertrauen in die CI schneller als gar keine CI.

### 5.2 `nightly.yml` — Live-Quellen

```
on:
  schedule: [{ cron: '0 3 * * *' }]
  workflow_dispatch: {}

jobs:
  live:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        target: [eps, icon-eu, gfs-2d, ifs, aifs, aifs-ens, icon-global,
                 aicon, arpege, arome-fr, ch-eps, layer-transport]
    steps:
      - checkout / setup-node 22 / npm ci
      - (nur icon-global, aicon:) actions/setup-python@v5   # H17 — besser: V-QA-13
      - npm run verify:${{ matrix.target }}
  report:
    needs: live
    if: always()
    # fasst die Matrix zusammen; öffnet/aktualisiert EIN Issue statt 12 Mails
```

**Laufzeit:** `arpege` dominiert (2–6 min); alle Zellen parallel → **~10 min Wanduhr**.
`fail-fast: false` ist Pflicht, sonst verdeckt der erste Upstream-Aussetzer alles andere.

**Wichtige Ergänzung:** Nach Behebung von A1/V-01 muss die Matrix die **Prod-Pfade** prüfen
(`/_mf`, `/_ecmwf`, `/_cscs` gegen `SITE_URL`), nicht nur die Node-Direktpfade — sonst bleibt der
Blindspot aus §2.5 bestehen.

### 5.3 `cron-health.yml` — Betriebs-Gate (QA-Anteil von V-03)

```
on: { schedule: [{ cron: '17 */3 * * *' }] }
jobs:
  freshness:
    - curl -s $SITE_URL/latest-grib.json | jq -r .updatedAt
    - Alter > 90 min  → exit 1  (GitHub schickt die Failure-Mail an Jan)
    - dasselbe für latest-wind.json
```

Bewusst **von außen** gegen die Prod-URL, ohne `warm-grib.mjs`/`warm-wind.mjs` anzufassen —
die sind STOPP-&-FRAGEN-Zone (`CLAUDE.md:49`). Das schließt H12 ohne die Warm-Semantik zu berühren.

### 5.4 Bundle-Budget-Gate (dependency-frei)

`scripts/check-bundle-budget.mjs`: liest `dist/assets/*.{js,css}`, summiert roh + gzip
(`node:zlib.gzipSync` — Standardbibliothek, keine Dependency), vergleicht gegen
`budgets.json` (eingecheckte Baseline pro Bucket: Entry-Chunk, Vendor, CSS gesamt, Summe).
Toleranz +5 %, darüber Exit 1 mit Aufschlüsselung „welcher Chunk ist gewachsen".
Das macht V-08 (200 KB tote CSS, 77-KB-Stationstabelle) und die Achse „schnell" (§11)
erstmals **messbar** statt behauptet.

### 5.5 ESLint — Bewertung, keine Empfehlung zur sofortigen Einführung

`tsconfig.app.json` ist bereits ordentlich streng: `strict: true`, `noUnusedLocals`,
`noUnusedParameters`, `noFallthroughCasesInSwitch`, `isolatedModules`.

Was `tsc` **nicht** fängt und im Repo real vorkommt:
- `react-hooks/exhaustive-deps` — bei **56 `useEffect` in einer Datei** (`MapView.tsx`) ist das die
  wahrscheinlichste Fehlerklasse überhaupt;
- schwebende Promises (braucht typed linting);
- `jsx-a11y` — würde V-12 direkt unterstützen;
- tote Exporte (nach V-08 relevant).

**Bewertung:** ESLint kostet 4–6 devDependencies (`eslint`, `typescript-eslint`,
`eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, ggf. `globals`, `@eslint/js`) und widerspricht
dem Geist von D-06. **Empfehlung: Stufe 1 ohne ESLint.** Stattdessen zuerst kostenlos nachschärfen —
`noUncheckedIndexedAccess`, `noImplicitReturns`, `noImplicitOverride`, `exactOptionalPropertyTypes`
(jeweils erst die Fehlerzahl messen, dann einzeln aktivieren; null neue Dependencies).
**Stufe 2:** ESLint einführen, wenn V-12 (A11y-Programm) startet — dann zahlt dieselbe Dependency
zweimal (Hooks-Regeln + jsx-a11y). Beides ist Jans Entscheidung (§12).

---

## 6. UI-Regressions-Konzept (inkl. „Logik hinter die Purity-Grenze ziehen")

**Ausgangslage:** Jede UI-Aussage braucht heute einen Chrome-DevTools-MCP-Screenshot von Hand.
Der Emulator ist für WebGL/FPS ungültig (`CLAUDE.md:59`, `tests.md:9`). Die
Selbstverifikations-Frage 2 („Desktop pixelgleich") wird faktisch per Augenmaß beantwortet.
Zwölf Feature-Einstiege × drei Viewports × sieben Gate-Fragen = der manuelle Aufwand ist der
eigentliche Grund, warum Gates in der Praxis Stichproben sind.

Dreistufiger Vorschlag, aufsteigend nach Kosten:

### (c) Zuerst und am billigsten: Logik hinter die Purity-Grenze ziehen (D-12)

Das ist der Hebel mit dem besten Verhältnis — er erzeugt **keine** Dependency, senkt gleichzeitig das
Regressionsrisiko der größten Dateien und ist die Vorarbeit für O-04/V-14. Konkrete Module:

| Neu | Quelle | Was danach headless prüfbar ist | Nebennutzen |
|---|---|---|---|
| `src/appRoute.ts` | `src/App.tsx:1-142` | `parseHash(h) → {view, featureId, params}` und `buildHash(state)`; Rundlauf über alle 12 `FeatureId`s | Löst **A5/V-05** (`#r=` unerreichbar, kein `hashchange`) im selben Schnitt |
| `verify()` in `src/mapState.ts` | bereits pur (63 LOC) | Layer-Bitmaske ↔ `LayerKey`-Set, Ort+Stunde, Rundlauf | ~20 Zeilen; D-12 nennt das Modul als Beispiel, es hat trotzdem keinen Selbsttest |
| `src/map/layerOrder.ts` | die ~3× duplizierte `addLayer`/`moveLayer`-Sequenz (`architecture.md:30`) | „aktive Layer → erwartete `beforeId`-Kette"; deklarativ statt imperativ | Entschärft die **bekannteste Regressionsquelle** des Repos; erster risikoarmer Schnitt für V-14 |
| `src/map/layerFetchPlan.ts` | MapView-Fetch-Orchestrierung, `refreshIconD2Layers`, `minStepHours` je Layer | „aktive Layer + Slider-Stunde + Manifest → Liste der URLs" | Macht die **Lazy-Load-Gates headless**, die heute je Feature einen Network-Waterfall-Screenshot kosten (`tests.md`: V-GEWITTER §2, V-BLITZ §1, V-SCHNEE §2, V-ROTATION §2) — der teuerste manuelle Check im Repo |
| `public/swPolicy.mjs` | `public/sw.js` (96 LOC) | `routeFor(url) → 'network-first' \| 'cache-first' \| 'bypass'` + FIFO-Cap-Logik | Erstes Prüfmittel überhaupt für den Service Worker |
| `src/favorites.ts` + Historie-Parallelsystem | 51 LOC + Duplikat | add/toggle/remove/Migration | Deckt **A4/V-04** ab |
| Anbindung bestehender `verify()` | 69 Dateien, 76 Exporte | siehe V-QA-08 | Null neuer Code, sofortiger Zugewinn |

### (b) Screenshot-Diff im bestehenden MCP-Workflow — dependency-frei

Kein neues Werkzeug, nur eine Konvention plus ein kleines Skript:
- Ablage `audit/screenshots/<feature>/{baseline,current}/<viewport>.png` (die Struktur existiert
  schon, `tests.md:224`).
- `scripts/diff-png.mjs`: PNG selbst dekodieren (zlib aus der Standardbibliothek; PNG-Dekodierung ist
  im Repo bereits Kernkompetenz — `gribDecode.ts`, `src/imageExport.ts`), Ausgabe „% abweichende
  Pixel + Bounding-Box der Abweichung + Diff-Maske als PNG".
- Damit wird Selbstverifikations-Frage 2 („Desktop pixelgleich") **belegbar** statt behauptet, und die
  Gate-Protokolle in `tests.md` bekommen eine Zahl statt eines Adjektivs.
- Einschränkung ehrlich benennen (D-04): für WebGL-Flächen ist Pixelgleichheit **nicht** erwartbar
  (Treiber-/Emulator-Varianz) — der Diff gilt für Chrome/UI-Flächen; WebGL-Canvas werden maskiert.

### (a) Playwright-Smoke über die 12 Einstiege — eine devDependency, **STOPP & FRAGEN**

- Umfang: 12 Tests (`route event forecast nowcast atmosphere history globe map2d feedback validation
  mobiletest` + `search`), je: navigieren → auf ein feature-spezifisches Ankerelement warten →
  Konsole auf `error` prüfen → Screenshot ablegen.
- **Fängt:** weiße Seiten, fehlgeschlagene Lazy-Chunks, Mount-Fehler, kaputte Deep-Links, tote
  Hash-Routen (A5) — genau die Klasse, die bei 12 unabhängigen Verticals und parallel arbeitenden
  Agenten am wahrscheinlichsten ist.
- **Fängt nicht:** WebGL-Korrektheit, FPS, Thermik. Das bleibt Real-Device (§12, Punkt 9).
- **Kosten:** 1 devDependency + ~250 MB Browser-Download je CI-Lauf (`--with-deps` cachebar),
  +2–4 min Laufzeit, laufende Selektor-Pflege. **H15 ist der Beweis, dass diese Pflege real ist.**
- **Wichtig für die Entscheidung:** `scripts/qa-layers.mjs` setzt Playwright bereits voraus
  (`:20-25`). Die Entscheidung wurde faktisch schon einmal getroffen und nur nie vollzogen —
  heute liegt ein totes Skript im Repo, das mit einer Zeile in `devDependencies` wieder lebte.

**Empfohlene Reihenfolge: (c) → (b) → (a).** (c) und (b) brauchen keine Freigabe außerhalb der
normalen Arbeit; (a) braucht Jans Ja.

---

## 7. Fusion-v2-Gate-Härtung

Grundlage: D-13 (Cutover vertagt, **per Variable**), V-15, und die Befunde H1/H2.
Diese Sektion speist die V-15-Erweiterung des Daten-Agenten.

**Vorbedingung:** Solange `fusion:gate` nicht fehlschlagen kann (H1) und `fusion:loso` auf echten
Daten nicht assertiert (H2), ist jede Schwellendiskussion Dekoration. **H1 und H2 zuerst.**

Ein vertrauenswürdiges Cutover-Gate muss je Variable folgendes assertieren:

| Aspekt | Vorgabe | Beleg im Bestand |
|---|---|---|
| **Primärmetrik** | MAE-Gewinn (Baseline − OI) unter LOSO auf dem **realen** Archiv, gegen **alle drei** Baselines (`idw`, `icond2`, `background`) — nicht nur eine | `runLoso` liefert das bereits (`verify-loso.mjs:71-73` nutzt es nur im synthetischen Zweig) |
| **Signifikanz-Schwelle** | **`ciLow > 0`** des 95-%-Block-Bootstrap-CI — nicht der Punktschätzer | `res.comparisons[].ciLow/ciHigh/significant` existiert und wird heute nur **gedruckt** (`verify-loso.mjs:48-51`) |
| **Stichprobengröße** | `effN ≥ 10` je Variable **und** ≥ 2 diurnale Regime | Beide Schwellen stehen bereits in `archive-status.mjs:62` — sie sind nur nicht gate-wirksam |
| **Unsicherheits-Kalibrierung** | `corr(σ,|e|) > 0` **und** `coverage@1σ ∈ [0,60; 0,75]` (Ziel 0,683) | `spreadSkill` liefert `corr`, `coverage68`, `inflation`, `rankHist` (`verify-loso.mjs:61-65`); nur `corr` wird heute gewertet (`:68`) |
| **Kein Drift** | `res.driftFlags === 0` | heute nur im synthetischen Zweig (`:74`) |
| **Regressionsanker** | „alle v2-Flags aus ⇒ **byte-identisch** zu v1" als eigener, netzfreier Verifier (`verify-v2-noop.mjs`) | Die Eigenschaft ist dokumentiert (`architecture.md:60`, D-11) — hat aber **keinen** Harness |
| **Rechenkosten** | v2 ≤ 1,5× Baseline | `perf-oi.mjs` prüft das bereits (`:13`), hat aber keinen npm-Alias und ist nicht Teil des Gates |
| **Per-Variable-Rollout** | `fusion:gate --var t2m\|windSpeed\|precip\|cloud` mit **eigenem Exit-Code je Variable**; Sammel-Exit 0 nur, wenn (a) mindestens eine Variable besteht und (b) keine bereits freigeschaltete Variable regrediert | heute eine Sammel-Tabelle ohne Exit-Code |
| **Fallback-Trigger** | Flag pro Variable, benannter Rückfallpfad (v1-IDW), Flag geht in den Cache-Key ein (D-11); Rückfall-Kriterium schriftlich: fällt der LOSO-Gewinn einer freigeschalteten Variable im nächsten Nightly unter `ciLow ≤ 0`, wird das Flag zurückgesetzt | — |
| **Protokoll** | Neues `tests.md`-Protokoll **V-FUSION-CUTOVER** mit einer Zeile je Variable + Datum + Archivstand | Muster: V-TRANSPORT-2 |

**Ehrlichkeits-Befund, der ins Gate gehört (D-04):**
`archive-status.mjs:54-58` hält fest, dass **`cloud` keine Stationswahrheit hat** („BrightSky current
carries no cloud") und deshalb aus der Reifemetrik ausgeschlossen wird. Konsequenz: Für `cloud` ist ein
LOSO-Gate **strukturell unmöglich** — nicht „noch nicht erreicht", sondern nie erreichbar mit dieser
Wahrheitsquelle. Das Gate muss das **ausweisen** statt es zu verschweigen: `cloud` bleibt auf v1, oder
es braucht eine andere Wahrheit (Satelliten-CLCT). Das ist eine Frage an Jan (§12, Punkt 8).

**Zweiter Befund:** Das Archiv ist inzwischen reif — `fixtures/` enthält **273 `session-*.json`**
(bis `session-2026-07-31T13-00-00-000Z.json`), und `capture.log` wurde am 2026-07-31 15:59
geschrieben, der Capture-Job läuft also. Die Begründung „archive too short" in `phase3-gate.mjs:83-86`
ist ein **eingefrorener Textbaustein aus der Zeit einer einzelnen Capture** und beschreibt den
heutigen Zustand nicht mehr. Der Fusion-v2-Cutover ist damit möglicherweise seit Wochen bereit und
wird von einem kaputten Prüfmittel blockiert. Das ist der wertvollste Einzelbefund dieses Berichts.

---

## 8. Entscheidungsvorlage O-02 (Optionen A–D, Empfehlung)

| | **A** D-10 unverändert | **B** D-10 + CI + gehärtete Verifier (0 neue Deps) | **C** B + Playwright-Smoke (1 devDep) | **D** Vitest-Migration |
|---|---|---|---|---|
| **Aufwand** | 0 | **2–3 Tage** (H1–H18 ≈ 1 Tag · 3 Workflows ≈ 0,5 Tag · Bundle-Budget + Edge-tsconfig + `verify:selftests` ≈ 1 Tag) | B + 1–2 Tage | **Wochen** — ~25 Harnesses portieren |
| **Fängt zusätzlich** | nichts | Typfehler · Build-Bruch · Edge-Function-Typfehler · Regression in aller reinen Logik · SEO-HTML-Regression · Bundle-Wachstum · Cron-Stillstand · ~68 verwaiste `verify()` | weiße Seiten · Lazy-Chunk-404 · Mount-Konsolenfehler auf allen 12 Einstiegen · kaputte Deep-Links | **nichts**, was B/C nicht fängt — die Harnesses importieren bereits echten App-Code |
| **Wartung (1 Maintainer)** | heutige, hoch (alles manuell) | **minimal** — keine Browser-Downloads, keine Lockfile-Churn, kein Config-Ökosystem | mittel — Selektoren brechen bei Redesigns (**H15 ist der Beweis**) | hoch — neue Transform-/Config-Oberfläche dauerhaft zu pflegen |
| **Agent-Team-Wirkung** (`agents.md`) | **negativ** — parallele Agenten können sich still gegenseitig brechen | **entscheidend** — jeder Agent bekommt in ~3 min ein maschinelles Urteil; Sperrzonen bleiben Sperrzonen, sind aber überwacht | zusätzlich wertvoll bei UI-Parallelarbeit (V-10-Migrationen) | keine Wirkung über B hinaus |
| **Verträglichkeit** | — | D-06 ✅ D-10 ✅ D-12 ✅ | D-06 ⚠ (1 devDep) | **verletzt D-06 und D-10** |
| **Risiko** | steigend | gering | gering–mittel (Flake) | hoch (Migrationsfenster ohne Netz) |

**Warum A ausscheidet:** „Unverändert fortführen" bedeutet heute konkret: ein Cutover-Gate, das nicht
urteilen kann (H1), ein Realdaten-LOSO ohne Assertion (H2), ein tautologischer Verifier (H3) und Warm-Crons,
die im Fehlerfall Erfolg melden (H12). A ist keine Fortführung, sondern die Konservierung eines Defekts.

**Warum D ausscheidet:** Der entscheidende Wert der bestehenden Harnesses ist, dass sie über
`register-ts.mjs` **den echten Produktionscode** importieren („was hier grün ist, ist exakt das, was
der Browser ausführt" — `verify-oi.mjs:7-8`, `verify-modelsource.mjs:8-9`). Vitest würde das nicht
verbessern, sondern nur ein Framework darum legen — bei direktem Konflikt mit D-06.

> ### 📌 Empfehlung
> **Option B jetzt, Option C als Stufe 2 gemeinsam mit V-10/V-12** (dann zahlt Playwright doppelt:
> Smoke-Tests plus `axe`-Läufe für das A11y-Programm).
> Formal: **D-10 bleibt gültig und wird nicht revidiert**, sondern um zwei Sätze ergänzt —
> *„Verifier müssen fehlschlagen können (Red-Test-Nachweis) und laufen in CI"*.
> Vorschlag: neuer ADR **D-29** mit Verweis auf D-10, kein Überschreiben (Format-Regel `decisions.md:5`).
> Die Entscheidung selbst trifft Jan.

---

## 9. Initiativen

| # | Ziel | Aufwand | Wirkung (1–5) | Abhängigkeiten | Definition of Success |
|---|---|---|---|---|---|
| **I-1** | Harness-Integrität herstellen (H1–H4, H6, H12-Ersatz) | S–M | **5** | keine (H12 nur extern lösen → STOPP-Zone meiden) | Jeder `verify:*`/`fusion:*`-Eintrag hat einen Exit-Code, der von einer echten Assertion abhängt; für jeden ist ein Red-Test dokumentiert |
| **I-2** | CI-Minimum `ci.yml` (V-11 konkret) | M | **5** | I-1 (sonst zementiert CI falsches Grün) | Jeder PR bekommt in < 4 min ein Urteil; typecheck + build + 12 netzfreie Verifier + SEO + Bundle-Budget grün |
| **I-3** | Nightly-Matrix für Live-Quellen | S | 3 | I-2, `setup-python` bzw. I-6 | 12 Quellen täglich geprüft; Fehlschlag → **ein** gesammeltes Issue, nie ein rotes `main` |
| **I-4** | Cron-Health-Check von außen | S | **4** | keine (kein Eingriff in Warm-Skripte) | Manifest älter als 90 min → Failure-Mail an Jan; A3 kann sich nicht wiederholen |
| **I-5** | `verify:selftests` — die ~68 verwaisten `verify()` anbinden | M | **4** | keine | Ein Kommando fährt alle headless-fähigen Selbsttests; Bericht listet die nicht-importierbaren mit Grund |
| **I-6** | GRIB-Verifier auf `bzip2-wasm` statt `python` | S | 3 | keine | `verify:icon-global`/`:aicon` laufen ohne externes Binary — **und testen denselben Dekomprimierungspfad wie die App** |
| **I-7** | Purity-Extraktion: `appRoute`, `layerOrder`, `layerFetchPlan`, `swPolicy`, `mapState.verify` | M | **5** | O-04-Abstimmung mit Rendering-Rolle | Lazy-Load- und Z-Ordnungs-Gates laufen headless; MapView schrumpft ohne Verhaltensänderung |
| **I-8** | Fusion-Cutover-Gate spezifizieren + implementieren | M | **5** | I-1, V-09 | `fusion:gate --var X` urteilt je Variable mit Exit-Code; Ergebnis als V-FUSION-CUTOVER in `tests.md` |
| **I-9** | Bundle-Budget-Gate | S | 3 | I-2 | `budgets.json` eingecheckt; > +5 % blockiert den PR mit Chunk-Aufschlüsselung |
| **I-10** | Screenshot-Diff-Protokoll | S–M | 3 | keine | „Desktop pixelgleich" wird mit einer Zahl belegt statt behauptet |
| **I-11** | Playwright-Smoke + `qa:layers` reaktivieren | M | 4 | **Jans Freigabe** (Dependency) | 12 Einstiege im PR geprüft; `qa:layers` läuft wieder |
| **I-12** | DoD auf 8 Fragen härten + Red-Test-Pflicht | S | **4** | I-9, I-10 | `CLAUDE.md`/`agents.md` tragen Bundle-, Netz- und A11y-Frage; jeder neue Verifier weist einen Fehlschlag nach |

**Reihenfolge:** I-1 → I-4 → I-2 → I-5/I-6 → I-8 → I-3/I-9 → I-7 → I-10/I-12 → I-11.
I-1 vor allem anderen: CI ohne Harness-Integrität automatisiert die Selbsttäuschung.

---

## 10. Vorgeschlagene V-Einträge

> Für `improvements.md`. Nächste freie Nummer dort ist **V-17** (`improvements.md:126`) —
> der Koordinator mappt `V-QA-01…14` beim Eintragen auf `V-17…V-30`.
> **Bestehende Einträge werden nicht dupliziert:** V-11 (CI-Minimum) wird durch V-QA-06 konkretisiert,
> V-15 (Fusion-Cutover) durch V-QA-12, V-08 (Alt-Ballast) durch V-QA-03, V-03 (Cron-Health) durch V-QA-04.

### V-QA-01 · Fusion-Gate reparieren: `fusion:gate` kann weder bestehen noch fehlschlagen (Priorität P0 · Aufwand S · Status offen)
**Was:** `scripts/phase3-gate.mjs:78` berechnet je Variable ein `ok`-Flag, druckt es — und aggregiert es nie. Das Skript endet nach `console.log` (`:88`), Exit-Code ist immer 0. Zusätzlich ist das Verdikt hart kodierter Text („⛔ STOP — DIAGNOSIS: ARCHIVE TOO SHORT", `:86`) und wird unabhängig von den Daten gedruckt — obwohl `fixtures/` inzwischen **273 Session-Captures** enthält (bis 2026-07-31T13). Erweitert V-15.
**Mehrwert:** Der Schritt, der buscosuns Flächenprognose messbar genauer machen soll (Fusion v2), wird heute von einem Prüfmittel blockiert, das gar nicht mehr prüft, sondern nur noch einen alten Satz wiederholt. Nach dem Fix beantwortet ein Kommando ehrlich, ob die neue Methode besser ist — und Jan sieht schwarz auf weiß, ob der lange vorbereitete Umstieg endlich möglich ist.
**Umsetzung:** In `phase3-gate.mjs` das per-Variable-`ok` sammeln; Reifekriterien aus `archive-status.mjs:62` (`effN ≥ 10`, ≥ 2 diurnale Regime) programmatisch auswerten statt zu behaupten; drei Ausgänge: `0` = Gate bestanden (mind. eine Variable), `1` = fachlicher Fehlschlag, `2` = Archiv objektiv zu kurz. Der Textbaustein wird durch das berechnete Ergebnis ersetzt. Risiko: berührt die Fusions-Bewertung → Abstimmung mit der Daten-Rolle; Änderung an der Cutover-Semantik ist **STOPP & FRAGEN**. Abhängig von O-02.
**Quelle:** QA & Teststrategie (Agent-Team), 2026-07-31.

### V-QA-02 · LOSO-Verifier assertiert auf echten Daten nicht (P0 · S · offen)
**Was:** `scripts/verify-loso.mjs:77-79` schaltet mit Fixture-Argument die diskriminierende Prüfung ab („no synthetic sanity assertion applied"); es bleiben ein Formel-Selbsttest (`:20-23`) und `corr > 0` (`:68`). Die bereits berechneten Konfidenzintervalle (`:48-51`) und `driftFlags` (`:74`) fließen in kein Urteil ein.
**Mehrwert:** Genau der Lauf, der beweisen soll, dass die neue Prognosemethode auf **echten** Messdaten besser ist, prüft heute nichts. Nach dem Fix ist „grün" wieder eine Aussage über die Prognosequalität statt über die Existenz des Skripts.
**Umsetzung:** Realdaten-Zweig mit denselben Gates ausstatten wie den synthetischen: OI schlägt alle drei Baselines, `ciLow > 0`, `driftFlags === 0`, `coverage@1σ` im Zielband; zusätzlich `--strict`-Flag, damit reine Explorationsläufe weiter ohne Gate möglich bleiben. Abhängigkeit: V-QA-01 (gleiche Codestelle), O-02.
**Quelle:** QA & Teststrategie (Agent-Team), 2026-07-31.

### V-QA-03 · Verifier-Hygiene: tote, tautologische und unreproduzierbare Harnesses (P0 · S · offen)
**Was:** Drei Befunde. (1) `scripts/verify-simradar.mjs` importiert **kein einziges Modul aus `src/`**; `:20-21` re-implementiert die Physik und `:32-35` prüft sie gegen sich selbst — der Verifier kann durch keine Code-Änderung rot werden, und das Feature ist seit D-15 gelöscht. (2) `scripts/verify-aec.mjs:17-20` braucht Golddaten (`ref_meta.json`, `ref_*.npy`), die nicht im Repo sind (`git ls-files` leer) und hat keinen npm-Alias — die Behauptung „bit-verifiziert gegen eccodes" (`architecture.md:52`, D-07) ist nicht reproduzierbar. (3) `scripts/verify-wind-transport.mjs` und `scripts/equivalence-check.mjs` haben keinen npm-Alias; `netlify/edge-functions/dwd-wind.ts` hat damit kein verdrahtetes Prüfmittel. Erweitert V-08.
**Mehrwert:** Aufräumen schafft Ehrlichkeit: Die Liste der Prüfungen sagt dann die Wahrheit darüber, was tatsächlich abgesichert ist. Ein Prüfmittel, das immer grün leuchtet, ist gefährlicher als gar keines — es verhindert, dass jemand hinschaut.
**Umsetzung:** (1) `verify:simradar` + `verify-simradar.mjs` entfernen (**Löschung = Jans Freigabe**, V-08). (2) Erzeugungsskript für die eccodes-Referenz beilegen (`scripts/gen-aec-reference.py` + README-Absatz) oder die Golddaten klein genug zuschneiden und einchecken; `verify:aec`-Alias ergänzen, sonst D-07 im ADR als „historisch verifiziert, nicht wiederholbar" markieren. (3) `verify:wind-transport` und `fusion:equivalence` als npm-Aliase ergänzen.
**Quelle:** QA & Teststrategie (Agent-Team), 2026-07-31.

### V-QA-04 · Warm-Crons können nicht fehlschlagen — Health-Check von außen (P0 · S · offen)
**Was:** `scripts/warm-grib.mjs` gibt in jedem Fail-Safe-Zweig `return 0` zurück („Nichts umzulegen (Fail-Safes). Exit 0.", „Kein gültiger 2D-Abschnitt verfügbar → Manifest NICHT geschrieben … Exit 0."; Einstieg `:388`), `warm-wind.mjs:182` identisch. Der Workflow-Schritt „Commit manifest if changed" (`.github/workflows/warm-grib.yml`) beendet bei unverändertem Manifest ebenfalls mit 0. Ein Warmer, der zwei Tage nichts bewirkt, meldet zwei Tage lang Erfolg — der belegte Mechanismus hinter Defekt A3. Ergänzt V-03 um die QA-Sicht.
**Mehrwert:** Die Karte bleibt schnell, weil ein Stillstand des Vorwärmens sofort auffällt statt tagelang unbemerkt zu bleiben. Nutzer merken den Unterschied als Ladezeit von Sekunden statt Millisekunden.
**Umsetzung:** **Bewusst ohne Eingriff in die Warm-Skripte** (Cron-/Manifest-Mechanik ist STOPP-Zone, `CLAUDE.md:49`): neuer Workflow `cron-health.yml`, alle 3 h, holt `$SITE_URL/latest-{grib,wind}.json`, prüft `updatedAt`-Alter gegen 90 min, Exit 1 → GitHub-Failure-Mail an Jan. Optional Stufe 2 (mit Jans Freigabe): Fail-Safe-Zweige der Warm-Skripte auf einen unterscheidbaren Exit-Code umstellen. Abhängig von V-03.
**Quelle:** QA & Teststrategie (Agent-Team), 2026-07-31.

### V-QA-05 · Edge Functions und Skripte stehen außerhalb des Typechecks (P1 · S · offen)
**Was:** `tsconfig.app.json` enthält nur `include: ["src"]`, `tsconfig.node.json` nur `["vite.config.ts"]`. `netlify/edge-functions/dwd-grib.ts` und `dwd-wind.ts` sind damit in **keinem** tsconfig — `npm run typecheck` prüft die beiden Cache-Proxys nicht, obwohl sie die Open-Proxy-Abwehr des gesamten Datentransports tragen. `scripts/**` ebenso wenig.
**Mehrwert:** Die Bauteile, über die jedes einzelne Wetterdatenbyte fließt, werden endlich mitgeprüft. Ein Tippfehler in der Pfad-Whitelist fällt beim Speichern auf, nicht nachdem er live ist.
**Umsetzung:** Neues `tsconfig.edge.json` (`include: ["netlify/edge-functions"]`, `lib: ["ES2023","DOM"]`, `strict: true`, `noEmit: true`) als drittes Projekt in `tsconfig.json` referenzieren, damit `tsc -b` es mitzieht. Risiko: minimal, rein additiv; Deno-Globals ggf. als Ambient-Deklaration. Optional zusätzlich `checkJs` für `scripts/**` via JSDoc — separat bewerten.
**Quelle:** QA & Teststrategie (Agent-Team), 2026-07-31.

### V-QA-06 · CI-Workflow konkret: `ci.yml` + `nightly.yml` (P1 · M · offen)
**Was:** Es existiert keinerlei CI — `.github/workflows/` enthält nur `warm-grib.yml` und `warm-wind.yml`; `tsc` und `vite build` laufen erstmals beim Netlify-Deploy. Konkretisiert **V-11** mit einem implementierbaren Job-Entwurf (Details `audit/strategie-2026-07-31/qa-teststrategie.md` §5).
**Mehrwert:** Fehler fallen in Minuten statt beim Deploy oder in Produktion auf. Das ist die Voraussetzung dafür, dass mehrere Agenten parallel liefern können, ohne sich gegenseitig unbemerkt kaputtzumachen — und dafür, dass Jan Änderungen ohne bange Vorahnung durchwinken kann.
**Umsetzung:** `ci.yml` (PR + push auf main): `npm ci` → `typecheck` → Edge-Typecheck (V-QA-05) → `build` → `verify:seo` → Bundle-Budget (V-QA-09) → die 12 netzfreien Verifier. Geschätzt 2–3 min. `nightly.yml` (3:00 UTC, `workflow_dispatch`): 12er-Matrix der Live-Verifier, `fail-fast: false`, Sammel-Job öffnet **ein** Issue statt zwölf Mails — Upstream-Churn darf `main` nie rot färben (`agents.md:69`). Node auf 22 pinnen (`engines` + `.nvmrc`, wegen `--experimental-strip-types`). Voraussetzung: V-QA-01…04, sonst zementiert CI falsches Grün. `.github/workflows/*` ist Hochrisiko-Zone (`agents.md:33`) → **STOPP & FRAGEN**.
**Quelle:** QA & Teststrategie (Agent-Team), 2026-07-31.

### V-QA-07 · Duplizierte Oracles importieren statt kopieren (P1 · S · offen)
**Was:** Zwei Verifier prüfen Kopien statt des Produktionscodes. `scripts/verify-snow.mjs:11` deklariert `DEPTH_VMAX = 150, FRESH_VMAX = 50` mit dem Kommentar „== iconD2Snow.ts", obwohl `src/sources/iconD2Snow.ts:53-54` beide Werte exportiert (`SNOW_DEPTH_VMAX_CM`, `SNOW_FRESH_VMAX_CM`) — 9 der 20 Checks (`:40-51`) prüfen nur die Kopie. `scripts/verify-icon-eu.mjs:20-34` spiegelt `sampleField` aus `iconEuRasterSource` (Header `:6`) — bricht die bilineare Interpolation in der App, bleibt der Verifier grün.
**Mehrwert:** Die Prüfungen messen wieder das, was Nutzer tatsächlich sehen. Heute könnte die Schneeskala oder die Kartenwert-Interpolation in der App kaputtgehen, während der Test zufrieden meldet, alles sei in Ordnung.
**Umsetzung:** In `verify-snow.mjs` die beiden Konstanten aus `iconD2Snow.ts` importieren (Modul ist DOM-frei — Import-Probe nötig; falls nicht, Konstanten in ein eigenes reines Modul ziehen, D-12). In `verify-icon-eu.mjs` `sampleField` aus `iconEuRasterSource.ts` importieren statt spiegeln. Gleiche Prüfung für alle übrigen Verifier durchführen („importiert dieser Verifier den Code, den er testet?").
**Quelle:** QA & Teststrategie (Agent-Team), 2026-07-31.

### V-QA-08 · `verify:selftests` — 68 vorhandene Selbsttests headless anbinden (P1 · M · offen)
**Was:** `src/` enthält **76 exportierte `verify*()`-Funktionen in 69 Dateien** (u. a. `src/atmosphere/foehn.ts:120`, `src/ml/isotonic.ts:156`, `src/confidence/hitRateModel.ts:217`, `src/history/historyVerify.ts` mit 4 Exporten). Nur **8** hängen an einem npm-Skript; alle übrigen sind an `window.__verify*` gebunden und laufen nur, wenn jemand sie in der Dev-Konsole aufruft. `architecture.md:105` zählt sie als Abdeckung — faktisch liefern sie null Regressionsschutz.
**Mehrwert:** Der größte Zugewinn an Sicherheit im ganzen Projekt, ohne eine einzige neue Testzeile: Föhn-Erkennung, Schneefallgrenze, Hit-Rate, E-Bike-Modell, Isotonik, Analog-Ensemble — alles bereits selbst geprüft, nur nie automatisch ausgeführt. Ein Kommando, und dieser Schatz wirkt.
**Umsetzung:** `scripts/verify-selftests.mjs`: Modulliste (generiert per Glob über `export function verify…`), jedes Modul in einem `try` importieren, `verify*()`-Exporte aufrufen, `{checks,passed,failed}` bzw. `{ok}`-Formen normalisieren, Summe + Exit-Code. Nicht importierbare Module (DOM/WebGL/maplibre-Transitiv) werden **mit Grund gelistet** statt still übersprungen — die Liste ist zugleich die Arbeitsliste für V-QA-10 (Purity-Grenze). Läuft über `register-ts.mjs`, keine Dependency.
**Quelle:** QA & Teststrategie (Agent-Team), 2026-07-31.

### V-QA-09 · Bundle-Budget-Gate (P1 · S · offen)
**Was:** Es gibt keine Messung der Auslieferungsgröße. `roadmap.md` §B-3 nennt „messbares Budget (LCP/INP)" als Chance; V-08 beziffert ~200 KB tote CSS und eine 77-KB-Stationstabelle im Bundle — beides kann heute unbemerkt wachsen, und niemand merkt es vor dem nächsten manuellen Audit.
**Mehrwert:** „Schnell" wird zu einer Zahl, die jeder Pull Request einhalten muss, statt zu einer Absicht. Wächst die Seite um mehr als 5 %, sagt es das System sofort — mit der Angabe, welcher Teil gewachsen ist.
**Umsetzung:** `scripts/check-bundle-budget.mjs` (dependency-frei, `node:zlib.gzipSync`): summiert `dist/assets/*.{js,css}` roh + gzip je Bucket (Entry, Vendor, CSS, Summe), vergleicht gegen eine eingecheckte `budgets.json`, Exit 1 bei > +5 %. Läuft nach `npm run build` in `ci.yml`. Baseline einmalig aus `main` erzeugen. Abhängig von V-QA-06.
**Quelle:** QA & Teststrategie (Agent-Team), 2026-07-31.

### V-QA-10 · Reine Logik hinter die Purity-Grenze ziehen, damit UI prüfbar wird (P1 · M · offen)
**Was:** 119 `.tsx`-Dateien mit **27.815 LOC** sind zu 100 % ungeprüft, weil die Entscheidungslogik in Komponenten steckt. D-12 (Purity-Grenze) ist die vorhandene, bewährte Antwort — sie wurde für Neues konsequent angewandt, für den Bestand nie nachgezogen. Auffällig: `src/mapState.ts` wird in D-12 selbst als Purity-Beispiel genannt und hat trotzdem **keinen** `verify()`.
**Mehrwert:** Die teuersten manuellen Prüfungen des Projekts verschwinden. Heute kostet jeder Beweis „der Layer lädt erst beim Einschalten Daten" einen Screenshot des Netzwerk-Wasserfalls von Hand (viermal in `tests.md` so protokolliert); danach ist es ein Kommando in Sekunden. Gleichzeitig wird die Karte wieder gefahrlos änderbar.
**Umsetzung:** Fünf Schnitte, aufsteigend nach Risiko: (1) `verify()` in `src/mapState.ts` (Bitmasken-Rundlauf, ~20 Zeilen). (2) `src/appRoute.ts` aus `src/App.tsx:1-142` — `parseHash`/`buildHash` für alle 12 `FeatureId`s; löst gleichzeitig A5/V-05. (3) `src/map/layerOrder.ts` — die an ~3 Stellen duplizierte Z-Ordnungs-Sequenz (`architecture.md:30`) deklarativ; entschärft die bekannteste Regressionsquelle und ist der erste risikoarme Schnitt für V-14/O-04. (4) `src/map/layerFetchPlan.ts` — „aktive Layer + Stunde + Manifest → URL-Liste"; macht die Lazy-Load-Gates headless. (5) `public/swPolicy.mjs` — `routeFor(url)`; erstes Prüfmittel für den Service Worker. Jeder Schritt einzeln, mit Funktionserhalt-Gate und Desktop-Diff. Abhängig von O-04; Abstimmung mit der Rendering-Rolle zwingend (MapView ist Sperrzone, `agents.md:33`).
**Quelle:** QA & Teststrategie (Agent-Team), 2026-07-31.

### V-QA-11 · UI-Regressionsnetz: Screenshot-Diff, dann Playwright-Smoke (P2 · M · offen)
**Was:** Jede UI-Aussage braucht heute einen MCP-Screenshot von Hand; „Desktop pixelgleich" (Selbstverifikations-Frage 2, `CLAUDE.md:60`) wird per Augenmaß beantwortet. Zwölf Feature-Einstiege × drei Viewports = der manuelle Aufwand ist der Grund, warum Gates in der Praxis Stichproben bleiben. Der bereits vorhandene Browser-QA-Runner `scripts/qa-layers.mjs` läuft nicht, weil `playwright` nicht in `devDependencies` steht (`:20-25`).
**Mehrwert:** Stufe 1 macht „sieht unverändert aus" zu einer belegten Zahl statt zu einer Behauptung. Stufe 2 fängt die peinlichste Fehlerklasse überhaupt ab: eine Seite, die nach einem Umbau schlicht weiß bleibt — bei zwölf eigenständigen Bereichen und parallel arbeitenden Agenten ein realistisches Szenario.
**Umsetzung:** **Stufe 1 (ohne Freigabe machbar):** `scripts/diff-png.mjs` — PNG selbst dekodieren (zlib aus der Standardbibliothek; PNG-Kompetenz existiert bereits in `src/imageExport.ts`), Ausgabe „% abweichende Pixel + Bounding-Box + Diff-Maske"; Ablage nach der bestehenden Konvention `audit/screenshots/<feature>/{baseline,current}/`. WebGL-Flächen werden maskiert und die Einschränkung ehrlich benannt (D-04). **Stufe 2 (Dependency → STOPP & FRAGEN):** `playwright` als devDependency; 12 Smoke-Tests (navigieren → Ankerelement → Konsole ohne `error` → Screenshot) plus Reaktivierung von `qa:layers` — dessen Selektoren (`.layer-switch button` + Textfilter, `:32-41`) sind nach dem Command-Deck-Redesign zu prüfen. Sinnvoll gebündelt mit V-12 (dann trägt dieselbe Dependency auch `axe`-Läufe).
**Quelle:** QA & Teststrategie (Agent-Team), 2026-07-31.

### V-QA-12 · Fusion-Cutover-Gate spezifizieren (P1 · S · offen)
**Was:** D-13 sieht einen Cutover „per Variable nach LOSO-Gate" vor, aber **welche Metrik, welche Schwelle, welche Stichprobengröße** nirgends definiert sind. Die Zutaten liegen ungenutzt herum: Konfidenzintervalle (`verify-loso.mjs:48-51`), `driftFlags` (`:74`), `coverage@1σ` (`:64`), Reifekriterien (`archive-status.mjs:62`), Rechenkosten-Gate (`perf-oi.mjs:13`). Erweitert **V-15** um die konkrete Spezifikation (Volltext §7 dieses Berichts).
**Mehrwert:** Der Umstieg auf die genauere Prognosemethode wird zu einer nachvollziehbaren Entscheidung mit Zahlen statt zu einem Bauchgefühl — und lässt sich Variable für Variable risikoarm ausrollen und im Zweifel genauso zurückdrehen.
**Umsetzung:** Gate-Definition je Variable: alle drei Baselines geschlagen · `ciLow > 0` · `effN ≥ 10` · ≥ 2 diurnale Regime · `driftFlags === 0` · `coverage@1σ ∈ [0,60; 0,75]` · v2 ≤ 1,5× Rechenkosten · neuer netzfreier `verify-v2-noop.mjs` („alle Flags aus ⇒ byte-identisch v1", D-11-Anker). `fusion:gate --var <name>` mit Exit-Code je Variable; Ergebnis als neues Protokoll **V-FUSION-CUTOVER** in `tests.md`. **Ehrlichkeits-Punkt (D-04):** `cloud` hat laut `archive-status.mjs:54-58` keine Stationswahrheit und ist per LOSO **strukturell nicht gate-bar** — das muss ausgewiesen werden (bleibt auf v1 oder braucht Satelliten-CLCT als Wahrheit; Frage an Jan). Setzt V-QA-01 + V-QA-02 voraus.
**Quelle:** QA & Teststrategie (Agent-Team), 2026-07-31.

### V-QA-13 · GRIB-Verifier von `python` auf `bzip2-wasm` umstellen (P1 · S · offen)
**Was:** `scripts/verify-icon-global.mjs:24` und `scripts/verify-aicon.mjs:17` rufen `execFileSync('python', …)` zum Entpacken — eine nirgends deklarierte externe Abhängigkeit, die auf CI-Runnern typischerweise `python3` heißt. Gravierender: die App entpackt mit **`bzip2-wasm`** (Runtime-Dependency, `package.json:43`). Die Verifier testen damit einen **anderen** Dekomprimierungspfad als die Nutzer erleben — genau die Drift, die D-12 („was hier grün ist, ist exakt der Browser-Pfad") verhindern soll.
**Mehrwert:** Die Prüfung testet endlich denselben Weg, den die App geht — ein Fehler beim Entpacken großer Modelldateien fällt dann auf, statt sich hinter einem Ersatzwerkzeug zu verstecken. Nebeneffekt: die Verifier laufen auf jedem Rechner und in CI ohne Python-Installation.
**Umsetzung:** `bzip2-wasm` in beiden Skripten statt `execFileSync` verwenden (das Paket ist bereits Runtime-Dependency, also **keine** neue Abhängigkeit). Der Header von `verify-icon-global.mjs:3-5` begründet die Python-Krücke damit, dass das reine-JS-`bz2`-Paket Multi-Block-Streams korrumpiert — `bzip2-wasm` ist genau die Lösung, die die App dafür schon verwendet. Nach der Umstellung entfällt `actions/setup-python` in `nightly.yml`.
**Quelle:** QA & Teststrategie (Agent-Team), 2026-07-31.

### V-QA-14 · Definition of Done härten: 8 Fragen + Red-Test-Pflicht (P2 · S · offen)
**Was:** `CLAUDE.md:60` verlangt fünf Selbstverifikations-Fragen (Funktionserhalt, Desktop pixelgleich, Touch ≥ 44 px, Konsole sauber, keine Long Tasks > 200 ms). Alle fünf sind rein manuell; drei davon (Bundle-Größe, Netzverhalten, Barrierefreiheit) fehlen ganz — obwohl `tests.md` (V-TRANSPORT-2 §3, V-AUDIT) den Netz-Check faktisch schon als Muster kennt.
**Mehrwert:** Was gemessen wird, wird gepflegt. Drei zusätzliche Fragen verhindern die drei schleichenden Verschlechterungen, die niemand einzeln bemerkt: die Seite wird jeden Monat ein bisschen schwerer, lädt ein bisschen mehr Daten und wird für Tastaturnutzer ein bisschen unbedienbarer.
**Umsetzung:** Drei Fragen ergänzen — **6. Bundle-Budget:** JS/CSS-Delta ≤ +5 % gegenüber `main` (Beleg: V-QA-09-Ausgabe). **7. Netz-Regression:** Requests + Bytes beim Kaltload der berührten Ansicht ≤ Baseline, keine neuen Directory-Listings auf dem kritischen Pfad (Beleg: MCP-Wasserfall). **8. A11y-Mindestmaß:** neue interaktive Elemente mit zugänglichem Namen, per Tastatur erreichbar, Fokus sichtbar, Kontrast ≥ 4,5:1 (Beleg: MCP-Snapshot; koppelt an V-12). Zusätzlich Frage 1 einen Beleg-Typ geben („Diff-Abgrenzung + betroffene `verify:*` grün" — die Gate-Protokolle machen das faktisch bereits, `CLAUDE.md` fordert es nicht). Und eine Meta-Regel: **jeder neue Verifier muss einen Fehlschlag nachweisen** (einmal eine Konstante verbiegen, FAIL zeigen, zurückdrehen, Ausgabe ins Gate-Protokoll) — genau das hätte V-QA-03 (1) verhindert. Ändert `CLAUDE.md` + `agents.md` §6 → Koordinator/Jan.
**Quelle:** QA & Teststrategie (Agent-Team), 2026-07-31.

---

## 11. Bewertung gegen die 4 Differenzierungs-Achsen (`roadmap.md` §C)

| Achse | Wirkung | Begründung mit Beleg |
|---|---|---|
| **(3) Radikale Ehrlichkeit** | **★★★★★** | Direkter Treffer. Ein Gate, das nicht fehlschlagen kann (`phase3-gate.mjs:82-88`), ein Realdaten-LOSO ohne Assertion (`verify-loso.mjs:78`) und ein Cron, der im Fehlerfall Erfolg meldet (`warm-grib.mjs`), sind das exakte Gegenteil von D-04. Wer Unsicherheit gegenüber Nutzern ausweist, darf sie gegenüber sich selbst nicht kaschieren. Dazu gehört auch, `cloud` als per LOSO **nicht** gate-bar auszuweisen (§7) statt es stillschweigend mitlaufen zu lassen |
| **(2) Alpin-/Vertikal-Tiefe** | **★★★★☆** | Genau hier liegt der ungenutzte Schatz: `alpineSplit`, `foehn`, `isentropes`, `thermalField`, `soundingMath`, `crossSection`, `goNoGo` haben alle einen `verify()` — und **keiner** hängt an einem npm-Skript (V-QA-08). Die Kernkompetenz gegen bergfex/MeteoSwiss ist heute unbewacht |
| **(4) Trackerfrei / ohne Account / schnell** | **★★★★☆** | Das Bundle-Budget (V-QA-09) und die Netz-Regressionsfrage (V-QA-14) machen „schnell" erstmals messbar; die Cron-Health-Prüfung (V-QA-04) schützt die Kaltladezeit. D-02 bleibt vollständig unberührt — CI misst zur Bauzeit, kein RUM, keine Nutzerdaten. Der gesamte Vorschlag kommt mit **null neuen Runtime-Dependencies** und in Option B mit null neuen Dev-Dependencies (D-06) |
| **(1) Entscheidungs- statt Datenprodukt** | **★★★☆☆** | Indirekt: Die Alleinstellungs-Features (Route zur Ankunftszeit, Event-Phasen, E-Bike-Akku) liegen zu 100 % in ungeprüften Bereichen (`src/route` 6.677 LOC, `src/event` 3.811 LOC, Abdeckung 0). Die Purity-Extraktion (V-QA-10) und die Selbsttest-Anbindung (V-QA-08) machen Timing- und Scoring-Logik direkt prüfbar |

**Gesamtbewertung:** Der Vorschlag zahlt am stärksten auf Achse 3 ein — die Achse, die buscosuns
Identität ausmacht. Kein Vorschlag verletzt D-01, D-02, D-03 oder D-06.

---

## 12. STOPP & FRAGEN an Jan

1. **Neue GitHub-Actions-Workflows** (`ci.yml`, `nightly.yml`, `cron-health.yml`). `.github/workflows/*`
   ist Hochrisiko-Zone (`agents.md:33`), Prod-Dispatch ist Jans Gate (`CLAUDE.md:49`). → Freigabe für
   drei rein lesende/prüfende Workflows, die nicht committen?
2. **`playwright` als devDependency** (V-QA-11 Stufe 2 + Reaktivierung von `qa:layers`).
   Dependency-Änderung = STOPP. Hinweis: `scripts/qa-layers.mjs:20-25` setzt sie bereits voraus —
   die Entscheidung wurde faktisch schon einmal getroffen, nur nie vollzogen.
3. **ESLint (+ 4–6 Pakete)** — Empfehlung: **jetzt nicht**; stattdessen `tsc`-Strenge nachziehen
   (0 Dependencies), ESLint erst gemeinsam mit V-12. Bestätigung erbeten.
4. **Exit-Codes der Warm-Skripte** (V-QA-04, Stufe 2). Cron-/Manifest-Mechanik ist Tabu-Zone.
   Vorschlag: Stufe 1 (externer Health-Check) ohne Freigabe, Stufe 2 nur mit.
5. **Semantik von `fusion:gate`/`fusion:loso` ändern** (V-QA-01/02/12) — Fusions-nahe Änderung.
   Darf das Cutover-Verdikt automatisiert werden, oder soll es Handarbeit bleiben?
6. **`verify:simradar` löschen** (V-QA-03) — Löschungen brauchen Jans Freigabe (V-08).
7. **Neues `tsconfig.edge.json`** (V-QA-05) — berührt Build-/Edge-Konfiguration; klein, aber im
   Grenzbereich der Transport-Tabu-Zone.
8. **Grundsatzfrage `cloud`:** Für die Variable `cloud` gibt es keine Stationswahrheit
   (`archive-status.mjs:54-58`) — ein LOSO-Gate ist dafür **strukturell unmöglich**, nicht nur
   „noch nicht erreicht". Bleibt `cloud` dauerhaft auf Fusion v1, oder wird eine andere Wahrheitsquelle
   (Satelliten-CLCT) erschlossen? Betrifft D-13 direkt.
9. **Real-Device-Testpark:** WebGL/FPS bleibt ohne ein zweites, schwaches Android strukturell
   unverifizierbar (`tests.md:91,101`; `roadmap.md:71` nennt es bereits). Budget für ein Gerät?
10. **Node-Version pinnen** (`engines` + `.nvmrc` auf ≥ 22.6, wegen `--experimental-strip-types`) —
    kleine Config-Änderung, aber build-relevant.
11. **Eccodes-Golddaten** (V-QA-03 (2)): einchecken (Größe?), ein Erzeugungsskript beilegen, oder D-07
    ehrlich als „historisch verifiziert, nicht wiederholbar" markieren?

---

## 13. Gefundene Doku-Inkonsistenzen

| Ort | Behauptung | Belegte Realität |
|---|---|---|
| `CLAUDE.md:58`, `architecture.md:105`, `decisions.md:29` (D-10) | „~30 `scripts/verify-*.mjs`" | **25 Dateien** (24 in `scripts/`, 1 in `scripts/seo/`); 26 npm-Einträge unter `verify:`/`fusion:`, davon **6 ohne wirksame Assertion** |
| `architecture.md:105` | „~68 `src`-Module exportieren `verify()`-Selbsttests" (als Abdeckung gezählt) | **76 Exporte in 69 Dateien** — aber nur **8** an ein npm-Skript angebunden; die übrigen laufen nur per Dev-Konsole und liefern **null** Regressionsschutz |
| `architecture.md:52`, `decisions.md:23` (D-07) | „DOM-frei und in Node bit-verifiziert gegen eccodes (`scripts/verify-aec.mjs`)" | Nicht reproduzierbar: Golddaten (`ref_meta.json`, `ref_*.npy`) nicht im Repo, kein npm-Alias. Historisches Einmal-Ergebnis |
| `verify-oi.mjs:8-9`, `verify-modelsource.mjs:10`, `verify-eps.mjs:8` | „gate-bar wie `qa:layers`" (als Goldstandard zitiert) | `qa:layers` beendet heute mit Exit 2 — `playwright` fehlt in `devDependencies` |
| `package.json:35` vs. `tests.md:171-179` + D-15 | `verify:simradar` ist aktiv | Das Protokoll ist korrekt als „⛔ STILLGELEGT" markiert und das Feature gelöscht — das Skript steht trotzdem noch in `package.json` |
| `improvements.md:103` (V-11) | netzfreie Verifier „(Governor, OI, **mapState** …)" | **`src/mapState.ts` hat keinen Verifier** — kein `verify()`-Export, kein Skript. D-12 nennt es als Purity-Beispiel; ein Selbsttest fehlt trotzdem |
| `architecture.md:101` | „Keine CI auf Push/PR … kein ESLint" | ✅ bestätigt; **zu ergänzen:** auch `netlify/edge-functions/*.ts` steht in keinem tsconfig und wird von `npm run typecheck` nicht erfasst |
| `roadmap.md:42` (Feld 13) | „nichts für UI/Hooks/SW; keine CI auf PR" | ✅ bestätigt; **zu ergänzen:** auch die Warm-Skripte (570 LOC) sind ungeprüft **und können nicht fehlschlagen** |
| `phase3-gate.mjs:83-86` | „A single analysis capture … archive too short" | `fixtures/` enthält **273 Session-Captures** bis 2026-07-31T13; der Text ist ein eingefrorener Baustein und beschreibt den Zustand nicht mehr |
| `verify-icon-global.mjs:3-5` | Python-`bz2` als „zuverlässiger Node-Ersatz" | Die App nutzt `bzip2-wasm` (Runtime-Dependency) — der Verifier testet einen anderen Pfad als die App |

---

## 14. Offene Fragen / nicht verifizierbar

1. **Alle Laufzeitangaben sind Schätzungen.** Die Session verbietet das Ausführen von Skripten
   (§1). Grundlage der Schätzungen: Dateigrößen, Anzahl der Netz-Requests und Kommentare im Code
   (z. B. `verify-arpege.mjs:4-5` „bewusst langsam … ~200 kleine Byte-Range-Reads"). Vor der
   CI-Einführung einmal real messen.
2. **Wie viele der 76 `verify()`-Selbsttests headless laufen**, ist ohne Ausführung nicht sicher.
   Die Purity-Grenze (D-12) macht es für `src/ml`, `src/confidence`, `src/atmosphere`, `src/route`
   wahrscheinlich, aber jeder Kandidat braucht eine Import-Probe (transitive `maplibre-gl`-Importe
   sind der Killer — vgl. die Begründung in `verify-simradar.mjs:6-8`). V-QA-08 liefert die Liste
   als Nebenprodukt.
3. **Ob `qa-layers.mjs` nach dem Command-Deck-Redesign noch die richtigen Elemente trifft**, ist nur
   indirekt belegbar: `.layer-switch` existiert weiterhin in `src/MapView.css:128`, die Textlabels
   („Temperatur", „Wind", „Böen", „Wolken") wurden nicht gegen die aktuelle Deck-UI geprüft.
4. **Ob die 273 Fixtures den `effN ≥ 10`-Schwellenwert je Variable erreichen**, konnte nicht
   ermittelt werden — `fusion:status` durfte nicht laufen. Das ist die erste Messung nach dem Fix
   von V-QA-01 und entscheidet, ob der Fusion-v2-Cutover sofort möglich ist.
5. **CI-Laufzeiten** (`npm ci`, `vite build`, `generate-seo.mjs`) sind geschätzt; die tatsächliche
   PR-Dauer entscheidet, ob der Verifier-Batch komplett in den PR-Job gehört oder teilweise ins Nightly.
6. **Flake-Rate der Live-Verifier** ist unbekannt — es gibt keine Historie. Das DWD-Publikationsfenster
   ist als Risiko dokumentiert (`agents.md:69`), aber nie quantifiziert. Erste vier Wochen Nightly
   liefern die Zahl; erst danach lässt sich sagen, ob ein Live-Verifier je PR-blockierend sein darf.
7. **Bundle-Baseline** existiert nicht; V-QA-09 braucht einen einmaligen Referenzlauf auf `main`.
8. **Ob `bzip2-wasm` in Node (außerhalb des Browsers) die Multi-Block-Streams korrekt entpackt**
   (V-QA-13), ist nicht geprüft — eine kurze Probe entscheidet, ob der Python-Ersatz möglich ist.
