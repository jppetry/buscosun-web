# Umsetzungsplan: alle Vorarbeiten vor der Implementierung von buscosun Fusion (0–336 h)

> **Stand 2026-09-14, Phase PD-U (Umsetzungsplan). Nichts committet, nichts gepusht, kein Cron angefasst.**
> Jans Auftrag: einen vollständigen, priorisierten Umsetzungsplan mit Gates für alles, was vor der
> Implementierung des Algorithmus (`ABLAUFPLAENE.md`, PAP 1–6) fehlt — und die Teile vorbereiten, die
> ohne Gate erlaubt sind (Vorlagen, Verifier, Skripte ohne Push, Messungen).
> Ausgangsbasis: `audit/punktdaten-bereitschaft.md` (2026-09-14). Was hier von ihr abweicht, steht in §1.2.
>
> **Belegbasis:** Remote `point/index.json` (`f9c5459`, 19:53 UTC) über raw.githubusercontent, die drei
> jüngsten `run.json`, `stations.json`, die Workflows des Daten-Repos, der Code in `scripts/point/`,
> `src/point/`, `src/pointForecast/`, die GitHub-Actions-API (Läufe 36–44), die Verzeichnislistings von
> DWD, ECMWF, MeteoSchweiz (STAC), JRC (GHSL) und die Metadaten von GeoSphere/MeteoSchweiz.
> Alles, was nicht daraus folgt, steht in §5 als **Annahme** oder **offen**.

---

## §1 Stand und Abweichungen

### 1.1 Ist-Stand am Remote (nachgeprüft 20:03–21:10 UTC)

| Was | Wert | Beleg |
|---|---|---|
| Index | Commit `f9c5459`, `publishedAt 2026-09-14T19:53:01Z`, Schema 5, 57 Ebenen | Remote `point/index.json` |
| `latestByTier` | t1 `2026091418` · t2 `2026091412` · t3 `2026091400` | ebd. |
| **t3-Läufe im Index** | **1** (nur `2026091400`) — der Befund der Bereitschaftsanalyse (16:56 UTC) gilt um 19:53 UTC weiter | `runs[].tiers` gezählt |
| Retention | `retentionByTier {t1 9, t2 24, t3 24}`, `minRuns 2` | ebd. |
| `static`-Block | vorhanden (`hmodel/v1`, t1/t2/t3) — im lokalen Klon (17:53 UTC) fehlte er noch | ebd. |
| Stationen | drei Läufe, `ageH 7,06 / 7,05 / 7,12` — V-PD-28 bestätigt; kein `timing` im Manifest | `stations.json` |
| `calib.json` | Schema 1, alle kalibrierbaren Werte `null`, `phi.shape linear (set)`, `fixed` gesetzt | lokal = Remote (TIMELESS) |
| `fusion` | `weights: equal`, `provenance: fallback` in t1/t2/t3 | `run.json` |
| `hmodel.changed` | t1 `false`; t2/t3 (00z) `true`, Grund „Spalten haben sich geändert (Modell-Upgrade?)" — **kein Hash-Diff im Log** | `run.json`, `staticHmodel.mjs:131-138` |
| t1 Profil / Quantile | ICON-D2 41/49 (`missing 8`), `inversionShare 0,60`, `calibrated: false`; C-LAEF-EPS 49/49 | `2026091415/run.json` |
| t2/t3 Profil / Quantile | `profile: null`, `quantiles: null` | `2026091400/run.json` |
| Druckflächen | t1 [925,850,700] (ICON-D2 nur 850/700) · t2 [925,850,700] · **t3 [850]** | ebd., `cubeFormat.ts pressureLevelsForTier` |
| σ_ens t3 | ICON-EPS global 144/168 h nur `t2m` (`precip` `noRate 2`), IFS-ENS 192…336 h `t2m`+`precip`; `sdEnsEmpty`: td2m, u10, v10, gust, clct, ps, snowlmt | ebd. |
| `aifs_ens` | steht in `TIER_BANDS.t3.sources`, hat **keinen** Adapter-Eintrag | `ecmwfEns.mjs MODELS` |
| `sources.json` | INCA `vars [precip, t2m]` bei RR-only-Spiegel; AROME nwp-v1 aus am 2026-11-01 — betrifft **nur den Web-Live-Pfad** (`sampleSources.ts:417`), der Cube liest längst `nwp-v2-1h-1km` | `sources.json`, `geosphere.mjs:59` |
| Workflows | `point.yml` t1 `40 1,4,…,22`/45 · t2 `50 3,9,15,21`/60 · t3 `55 9,21`/40 — Vorlage zeilengleich (nur CRLF); `build.yml` `20 0,3,…`/`30 2,5,…` force-push; `radar.yml` Selbstdispatch | `.github/workflows/*` |
| buscosun-web | `main == origin/main == 302e04f`; untracked nur die Bereitschaftsanalyse | `git status -sb` |
| buscosun-archiv | lokal nur `.git`, **0 Commits**; Remote `size 0`, öffentlich, kein README, keine Lizenz | `git log`, GitHub-API |

### 1.2 Abweichungen vom Auftrag und von CLAUDE.md

1. **`audit/punktarchiv.md` existiert nicht** — nicht im Baum, in keinem Commit (`git log --all`), nicht im Archiv-Repo. Der PA0-Plan ist nur als Zusammenfassung überliefert (CLAUDE.md-Statusblock und -Index, Memory, `punktdaten-restbedarf.md` §2.4, `punktdaten-versorgung.md` §4.2-Verweis „PA-Quellen = PD-Quellen", `fusion-vorstufe.md` §1). Bekannt sind nur die Abschnittsnummern §1.6, §4.2, §9. **E-1…E-7, PA1–PA7, GPA1–GPA7 und V-PA-2…5 sind nirgends im Wortlaut.** Anhang A **rekonstruiert** den Plan und ist so gekennzeichnet — wie §39 der Versorgungsanalyse die PD-B-Etappen rekonstruierte.
2. **`PUNKTVORHERSAGE_0-336H.md` existiert nirgends unter `C:\dev`.** Der Algorithmus liegt allein in `ABLAUFPLAENE.md` + `QUELLENMATRIX.md`; die App-seitige Spezifikation ist `audit/punktvorhersage-14tage.md`.
3. **V-BW-58 ist für die Punkt-Jobs bereits gelöst:** `publish-point.mjs pushWithRetry` — fünf Versuche, `pull --rebase --autostash`, Backoff 15/30/45/60 s, Zwei-Commit-Regel, `origin/main`-Gegenprobe, Purge nur bei `landed` (am Datenrepo belegt: `9bd1e62` → `ee7a534 … (Manifest → 9bd1e62)`). Offen ist nur die **Kartenlinie**: `publish-repack.mjs:263-266` pusht genau einmal mit `--force`. AP2.3 („in allen drei Punkt-Jobs") ist damit gegenstandslos; übrig bleibt die Kartenlinie = STOPP & FRAGEN (§6, E-U-14).
4. **Die t3-Retention war eine Verkettung, kein fehlender Wert.** Der Publisher räumte je Stufe (`runsToKeepFor`, `minRuns` je Stufe) und danach **global** über alle Laufverzeichnisse (`runsToKeep`) — Alter am Verzeichnisnamen, Liste voller frischer t1-Läufe ⇒ `minRuns` griff nie, jedes Verzeichnis > 24 h fiel, samt der t3-Stufe, die der erste Durchgang behalten hatte (`2026091312` war um 16:56 UTC 28,9 h alt). `verify-point-data.mjs` prüfte nur die Reihenfolge der Durchgänge, nie ihre Wechselwirkung. **`retentionByTier.t3: 36` allein hätte nicht geholfen** (die Gesamtsicht blieb bei 24 h). Umgesetzt in §2 (E-U-2).
5. Die Bereitschaftsanalyse führt die Dauer des Stationsbaus als „offen"; `workflow-point.yml` nannte „gemessen 55 s" (lokal). Am Runner gemessen (Läufe 38/42): **38 s und 58 s**.
6. `MANUELLE-SCHRITTE.md` §13 ist teilweise überholt (Workflow-Push erfolgt, Token trägt `workflow`-Scope, §32 der Versorgungsanalyse); ein Abschnitt zum Archiv-Gate fehlte — jetzt §14.
7. Jans J-2 (2026-09-05, „kein neues Repo") und J-3 („MOSMIX nach buscosun-data wie ICON-D2, kein Archiv") stehen im Widerspruch zum drei Tage später angelegten `buscosun-archiv`. Dieser Plan behandelt PA0 (2026-09-08) als die jüngere Entscheidung — E-U-1 fragt es ausdrücklich.
8. Vier kollidierende Entscheidungsserien (PA0 E-1…7 · PD E-1…19 · E-E-1…5 · E-D-1…3); hier heißen sie durchgehend **PA-E**, **PD-E**, **E-E**, **E-D**, und die neuen dieser Phase **E-U**. V-PD-13…20 wurden nie vergeben.
9. ECMWF hat **keinen** Pfad `…/ifs/0p25/scda/`: die 06/18z-Läufe liegen unter `oper/` mit Suffix `oper-fc` bis 144 h — so liest es `ecmwf.mjs` auch; die Bezeichnung „scda" in Doku und Kommentaren ist eine Modellbezeichnung, kein Pfad.

---

## §2 Etappentabelle

Legende Gate: **J** = Jan (Kopie/Push/Entscheidung) · **S&F** = STOPP & FRAGEN · **—** = kein Gate (lokal, uncommitted, Verifier grün).
Zustand: ✅ umgesetzt und geprüft · 📝 nur Plan/Diff · ⏳ Messung läuft.

| Etappe | Punkt | Beleg | Umsetzung (Datei / Änderung) | Verifier | Kosten | Abnahme | Gate | Reihenfolge |
|---|---|---|---|---|---|---|---|---|
| **U-1** ✅ | Archiv PA1: Bibliothek, Punktliste, Sammler, Node-Shim, Wahrheitsleser | Archiv leer (0 Commits); jeder Tag ohne Sammler ist verloren (Vorhersagen nicht nachholbar) | `scripts/punktarchiv/lib/punktarchiv.mjs` (Schema 1, int-Kodierung, Merge, As-of), `lib/truth.mjs` (POI/TAWES/SMN), `lib/nodeShims.mjs` (DEM/Proxy/Klimagitter), `points.mjs` + `points.json` (243 Punkte), `collect.mjs` (beide Pfade) | `verify:punktarchiv` **56/56** (Schema-Rundweg, Skalen/Sentinel, Lead-Raster, Punktliste, Merge idempotent, As-of mit Negativkontrolle, Vorlage) | Probelauf 10 Punkte: 64 s, 0,47 MiB gzip (§4.3); voll: s. §4.3 | Slot liegt lokal, V-PA-1 grün | — (Push = J) | 1 |
| **U-2** ✅ | Archiv-Workflow-Vorlage | Cron-Ort und Token (PA0 vs. Auftrag) | `scripts/punktarchiv-repo/workflow-punktarchiv.yml`: `10 23 * * *`, Gruppe `punktarchiv`, Standard-Token, Push mit Rebase-Wiederholung, nie `--force` | `verify:punktarchiv` (6): Slot ≥ letzter t1-Bau 22:40 + 20 + 5 min, < 24:00; Negativkontrolle 22:45 | — | Vorlage grün | **J** (Kopie ins Archiv-Repo + erster Push = GPA3) | 2 |
| **U-3** ✅ | t3-Retention (Verkettung) | §1.2 Nr. 4 | `scripts/point/prune.mjs`: `runsIn`, `runIdToIso`, **`retainRuns`** (beide Durchgänge, Gesamtsicht respektiert die Stufen-Entscheidung; `legacyGlobalPass` nur für die Negativkontrolle); `publish-point.mjs` ruft es auf; `manifest.ts`-Kommentar | `verify:point-data` (3z) Verkettung am Fixture-Baum des 16:56-Stands: `2026091312` überlebt, Waise fällt, t1 3 / t2 4 / t3 2; **Negativkontrolle: der alte Weg löscht ihn** | +1,5 MB je gehaltenem t3-Lauf | Nach dem nächsten Push: Index hält ≥ 2 t3-Läufe | — (Deploy = Push von buscosun-web `main`, den der Cron klont: **J**) | 3 |
| **U-4** ✅ | t2-Cron `30 4,10,16,22` | ICON-EU +3,60…3,70 h (8 min Rand am alten Slot), MOSMIX-L +73…76 min (alter Slot 27 min VOR der Bereitstellung, `ageH 7,06`) | `scripts/repack-repo/workflow-point.yml` (Cron, `if:`, Kopf mit Herleitung, Regel-C-Kommentare), `README.md`-Tabelle, `sourceMatrix.ts` MOSMIX-Notiz, `build-stations.mjs` Caveat | `verify:point-data`: Regel A 60 ≥ 35 · B t1 45 ≥ 40 · C 25 ≤ 60 ≤ 60 · D · E 52 min · **E′ (neu) 13 min**; Negativkontrolle alter Slot −27 min | keine; t2-Daten beim Bau 40 min älter | Stationen `ageH < 2` nach dem ersten Lauf | **J** (Kopie ins Daten-Repo) | 3 |
| **U-5** 📝 | Publish-Retry Kartenlinie | `publish-repack.mjs` pusht einmal `--force` (V-BW-58); Punkt-Jobs haben den Retry längst | Diff-Skizze §6.2: Klon + Force-Push bis zu 3× wiederholen (kein Rebase, weil Wurzel-Commit) | `verify:repack` (bestehend) + Regex auf die Schleife | — | drei Fehlschläge vom 2026-09-04 wären abgefangen | **S&F** (Kartenlinie/Warm-Cron) | 9 |
| **U-6** ✅ | Stadt-Raster `point/static/urban/v1/` | `imperv`/`d0` fehlen (E-13, PAP 5) | `scripts/point/build-urban.mjs` + `urbanTiff.mjs` (BigTIFF, **LZW eigener Decoder**, Mollweide) — GHS-BUILT-S E2020 100 m + GHS-BUILT-H ANBH E2018 100 m, vier Kacheln R3/R4 × C19/C20, drei Ebenen `imperv`/`d0`/`bldgH`, Hash je Spalte, `static.json` mit Lizenz/Zitat/Caveats | `--self-test` 34/34; `verify:point-data` unberührt | Netz 199,8 MiB einmalig; Ausgabe **208 Chunks = 111 KB + 12 KB Manifest**; Bau 22 s kalt | München 29 %/6,2 m · Wien 38 % · Zermatt 2 % (§4.4) | **J** (Erstablage = Register-Erweiterung `static.urban`, kurz abstimmen; Producer-Aufruf im Cron oder einmalig per Hand) | 5 |
| **U-7** 📝 | Client-Leser `readUrbanPoint` | Client liest `hmodel`, kennt `urban` nicht | Plan: `src/point/client/staticPoint.ts` nach dem Muster `readHmodelPoint` (Produkt-Parameter statt Konstante) | `verify:point-client` Rundweg an einem synthetischen Urban-Chunk | 0 Byte Netz | Rundweg ≤ Δ/2 | — | 6 |
| **U-8** ✅ | `sources.json`/Registry: INCA `vars`, `declined` | INCA-Spiegel trägt nur RR; MOSMIX-S/KENDA-CH1 sollen abgesagt sein | `sourceMatrix.ts` INCA `vars: ['precip']` + Notiz; `adapters/index.mjs` `DECLINED` (mit Wiedereröffnungsbedingung), `build-point-cube.mjs` `declined:` im Manifest (additiv), `manifest.ts` Typ + Validierung (nie in beiden Listen) | `verify:point-data`: Bilanz mit drei Klassen, Absagen nennen „Wieder offen, sobald …", Manifest-Test + Negativkontrolle | — | `sources.json`/`run.json` am Remote tragen es nach dem nächsten Push | — (Deploy: **J** über Push von `main`; **Manifest-Feld additiv = S&F** — E-U-6) | 4 |
| **U-9** ✅ | `hmodel.changed` erklärbar | t2/t3 `changed: true` ohne Grund | `staticHmodel.mjs`: Diff je Spalte (added/changed/removed, alt/neu-Hash, Deckung, Min/Max) im Rückgabewert und als `diffFromPrev` im `static.json`; `build-point-cube.mjs` loggt je Spalte | `staticHmodelSelfTest` (bestehend) | — | Beim nächsten Cron-Bau steht im Log, WELCHE Spalte sich änderte | — (Deploy **J**) | 4 |
| **U-10** ✅ | Messreihe Bereitstellung | Verifier-`READY_H` hatte drei Werte, 12z-IFS ungemessen, CH1/CH2 ungemessen | `scripts/point/measure-availability.mjs` (append-only Store, STAC-Paging, Self-Test 31/31) + `audit/punktdaten-umsetzungsplan/availability.{json,md}` (**79 Proben**) | `--self-test`; Idempotenz am echten Store belegt | 109 Anfragen kalt, 12 warm | ≥ 7 Tage je Quelle (`n ≥ 7`), dann Verifier-Tabelle nachziehen | — (täglicher Aufruf = Handarbeit oder Cron: **J**) | 4 |
| **U-11** 📝 | t3-Slot `35 8,20` | IFS 12z +7,57 h (heute erstmals gemessen), 00z +7,57 h | Vorlage nach ≥ 7 Messtagen; Regel A/B/C/E nachrechnen (08:35 → 09:20 = 45 min; 20:35 → 21:20 = 45 min; t2 dann 55 min hinter t3) | `verify:point-data` Regeln | — | t3 beim Bau 8,6 statt 9,9 h alt | **J** (Cron) | 10 |
| **U-12** 📝 | Cube-Erweiterung M-1 (700+925 hPa in t3) | `pressureLevelsForTier` liefert t3 `[850]` (E-E-4) | `cubeFormat.ts:154-156` → `PRESSURE_LEVELS_HPA` auch für t3; Verifier-Zeile „t3 = [850]" umstellen | `verify:point-data` (3aa) | ≈ +36 MiB je Fläche und t3-Lauf (PD-E §7) ⇒ +72 MiB/Lauf, +144 MiB/Tag (**+2,6 %**) | Manifest `pressure.levels [925,850,700]` in t3 | **S&F** (Manifest) — E-E-4 | 7 |
| **U-13** 📝 | M-1: σ_ens in t3 erweitern | `sdEnsEmpty` t3 = 7 Größen; IFS-ENS liefert u10/v10/gust(`10fg3`)/clct | `ecmwfEns.mjs MODELS.ifs_ens.params` + `keepIndexEntry` für `10fg3`/`tcc` | `verify:point-data` (3m) + `ensembleStatsSelfTest` | je Größe ≈ 0,63 MiB × 50 Member × 4 Schritte ≈ 126 MiB ⇒ vier Größen **≈ +500 MiB je t3-Lauf = +28 % je t3-Zyklus** — Abbruchbedingung | σ_ens(u10) wächst mit der Vorhersagezeit wie t2m | **J** (Volumen) — E-U-8 | 8 |
| **U-14** 📝 | M-1: Quantile q10/q90 in t2/t3 aus Membern | `quantiles: null` in t2/t3; Member liegen im Speicher (EU-EPS 40, IFS-ENS 50) | `ensembleStats.mjs` um Quantile, `build-point-cube.mjs:667` Auswahl je Stufe; Manifest `quantiles.provenance: "ensemble-members"`, `membersN` | `verify:point-data` (3m/3o) + Konsistenz `q10 ≤ mean ≤ q90`-Anteil | **0 Byte Netz**; Rechenzeit gering | Ebenen belegt, Provenienz benannt | **S&F** (Manifest) — E-U-9 | 7 |
| **U-15** 📝 | M-1: Profil-Ersatz in t2 | `profile: null` in t2 (PAP 4 Fall B/C unerreichbar) | `profile.mjs`: `zBase/zInv/dTInv` aus t925/t850/t700 (Inversion = `t850 > t925`), `provenance: "pressure-derived"`, t3 `standard-lapse` markiert; **keine** ICON-EU-Modelllevel (Schätzung 74 Level × 24 × 2,2 MiB ≈ 3,9 GiB je t2-Lauf) | `profileSelfTest` + Tagesgang-Anteil `zInv > zBase` | 0 Byte Netz | `inversionShare` in t2 plausibel (nachts > tags) | **S&F** (Manifest) | 8 |
| **U-16** 📝 | M-1: `hModEff` je Schritt (V-PD-57) | t3 trägt ICON globals Höhe auch jenseits 180 h | `runOrography`: Mittel je Schritt über `srcMask`; AICON `assumed`; E-E-5 (abgeleitete ECMWF-Höhe) | (3aa) Gegenprobe | 0 Byte | **ändert veröffentlichte Werte am PAP-4-Term** | **S&F** — E-E-5 | 8 |
| **U-17** 📝 | M-1: Achse `axisGaps`, `usableToH` (V-PD-55) | Lücken 49–50, 121–125; Naht beweglich | `manifest.ts buildPointIndex`: `axisGaps`, `usableToH` (aus `latestByTier` gerechnet) — additiv; t3 ab 123 h **nicht** (Schemabruch) | (3z) | 0 | Client kann Lücke benennen (E-D-3) | **S&F** (Index-Feld) | 7 |
| **U-18** 📝 | M-1: V-PD-54 `quantiles.ageH`, `meanOutsideBandShare` | Mittel in 10–42 % der Stunden außerhalb q10/q90 | Producer zählt beim Kodieren; Client zeigt `provenance.quantiles` schon | (3o) | 0 | Client-Hinweis möglich | **S&F** (Manifest) | 7 |
| **U-19** 📝 | AROME-Ablösung im Live-Pfad vor 2026-11-01 | `sampleSources.ts:417` liest `nwp-v1-1h-2500m` (Abschaltung) | Weg A (bis AP6): `fetchAromePoint` auf `nwp-v2-1h-1km` umstellen (Domäne/Clip aus `sourceMatrix.ts claef`); Weg B: Cube-t1 statt AROME (AP6) | `verify:arome-*`/Gleichheitsprobe | — | vor dem 2026-11-01 kein Aufruf von nwp-v1 mehr | — (Live-Pfad, kein Cron) — E-U-11 | 6 |
| **U-20** 📝 | Verdrahtung Cube → `getPointForecast` (AP6) | 0 Importe aus `src/point` in `src/pointForecast` | §7 | 10-Punkte-Probe, Lesekosten, Bundle-Sonde | — | §7 Abnahme | **S&F** (Fusion-Engine) | 11 |
| **U-21** ✅ | Doku | — | dieses Dokument, CLAUDE.md-Statusblock, `MANUELLE-SCHRITTE.md` §14 | — | — | — | — | 12 |

---

## §3 In dieser Session angelegte oder geänderte Dateien

Alle „lokal geprüft, nicht committet". `git status` in buscosun-web zeigt nur diese; buscosun-data ist unberührt; buscosun-archiv trägt den lokalen Slot (uncommitted, s. §4.3).

**Neu (Archiv, AP1):**
- `scripts/punktarchiv/lib/punktarchiv.mjs` — Schema 1, `LIVE_SCALES`/`TRUTH_SCALES`, `encodeValue`/`decodeValue`, `newSlot`, `assertAsOf`, `serialiseSlot`/`parseSlot`, `mergeSlot` (append-only, idempotent, Konflikt → `-r<n>`), `rebuildIndexes`, `tierForLead`, Selbsttest 14/14.
- `scripts/punktarchiv/lib/truth.mjs` — POI-Parser (aus `verify-pv-score.mjs` herausgelöst), POI-Listing, SMN-Meta (WIGOS → WMO), Serienbildung, Selbsttest 7/7.
- `scripts/punktarchiv/lib/nodeShims.mjs` — `createImageBitmap`/Canvas über `scripts/lib/png.mjs`, Rewrites `/_dwd_opendata/`, `/_gfs/`, `/_cscs/`, `/_ecmwf/`, `/climaGrid.json` aus `public/`, Selbsttest 4/4.
- `scripts/punktarchiv/points.mjs` + **`scripts/punktarchiv/points.json`** — 243 Punkte (DE 208 · AT 23 · CH 12; TAWES 11, SMN 6), Selbsttest 5/5.
- `scripts/punktarchiv/collect.mjs` — Sammler beider Pfade, `--limit`, `--live-hours`, `--live-full`, `--vpa1`, `--dry`, `--out`.
- `scripts/verify-punktarchiv.mjs` — **56/56**.
- `scripts/punktarchiv-repo/workflow-punktarchiv.yml` — Vorlage (Kopie = Jans Gate).

**Neu (AP4/AP5):**
- `scripts/point/build-urban.mjs`, `scripts/point/urbanTiff.mjs` — Stadt-Raster (Selbsttest 34/34), Ausgabe `data/urban-probe/point/static/urban/v1/` (in `.gitignore`).
- `scripts/point/measure-availability.mjs` — Messreihe; `audit/punktdaten-umsetzungsplan/availability.{json,md}`.

**Geändert (AP2/AP5):**
- `scripts/point/prune.mjs` (`runsIn`, `runIdToIso`, `retainRuns`), `scripts/point/publish-point.mjs` (ruft `retainRuns`), `src/point/manifest.ts` (Kommentar; `declined` Typ + Validierung), `scripts/verify-point-data.mjs` (Verkettungstest + Negativkontrolle, Regel E′, `READY_H` mit Messungen vom 14.09., `declined`-Bilanz, Orphan-Wächter liest `prune.mjs`), `scripts/repack-repo/workflow-point.yml` (t2 `30 4,10,16,22` + Herleitung), `scripts/repack-repo/README.md` (Takt-Tabelle), `src/point/sourceMatrix.ts` (MOSMIX-Notiz, INCA `vars`), `scripts/point/build-stations.mjs` (Caveat), `scripts/point/adapters/index.mjs` (`DECLINED`), `scripts/point/build-point-cube.mjs` (`declined`, hmodel-Diff-Log), `scripts/point/staticHmodel.mjs` (Diff je Spalte), `package.json` (Aliase `point:availability`, `point:urban`, `verify:punktarchiv`, `punktarchiv:points`, `punktarchiv:collect`), `.gitignore` (`data/urban-probe/`).

**Gates nach allen Änderungen:** `verify:point-data` **924/924** (war 914), `verify:point-client` 63/63, `verify:punktarchiv` 56/56 (neu), typecheck 0, Build + Budget s. §4.5.

---

## §4 Gemessene Zahlen (2026-09-14, UTC)

### 4.1 Bereitstellung der Quellen (Last-Modified / STAC `created` der letzten gebrauchten Datei)

Aus `availability.md` (79 Proben, Skript U-10) und den Direktmessungen dieser Session:

| Quelle (Endschritt) | Läufe | Lauf + h | n | Verifier `READY_H` |
|---|---|---|---|---|
| ICON-D2 (048) | alle 8 | 1,35–1,36 | 8 | 1,36 ✓ |
| ICON-D2-EPS (048) | alle 8 | 2,14–2,16 | 7 | — |
| ICON-EU (120) | 00/06/12z | 3,60–3,65 | 3 | 3,64 ✓ |
| ICON-EU (048) | 03/09/15z | **2,92** | 3 | — (neu) |
| ICON global (180) | 00/12z | 3,47–3,54 | 2 | — |
| ICON global (120) | 06z | **3,27** | 1 | — |
| IFS oper (360) | 00/12z, 4 Tage | **7,57** (7×) | 7 | 7,57 ✓ (12z erstmals belegt) |
| IFS oper (144) | 06/18z | 6,45 | ≥ 4 | — |
| AIFS Single (360) | | 7,57 | ≥ 4 | — |
| MOSMIX-L | 03/09/15/21z, seit 12.09. | **1,20–1,28** (72–77 min) | ≥ 8 | 1,28 (Regel E′, neu) |
| ICON-CH1-EPS (33 h) | 8 Läufe | **1,85–1,98** (03z/45 h: 2,12) | 8 | — |
| ICON-CH2-EPS (120) | 4 Läufe | **2,89–2,97** | 4 | — |
| C-LAEF | — | nur Obergrenze ≤ 5,6 h (API nennt keine Bereitstellungszeit; §37: ≈ 4,9) | — | — |

STAC-Kosten der CH-Messung: CH1 31 Seiten · 3 100 Items · 5,8 MB · 8,8 s kalt; CH2 12 Seiten · 1,9 MB. Der `datetime=`-Filter wird beachtet, `forecast:*`-Parameter werden **still ignoriert** (wie PD-B6 §41).

### 4.2 Runner-Laufzeiten (GitHub-Actions-API, `point.yml`)

| Lauf | Job | Gesamt | Bau | Stationen | Publish |
|---|---|---|---|---|---|
| 38 · t2 09:55 | t2 | 8 min 35 s | 6 min 07 s | **38 s** | 55 s |
| 42 · t2 15:54 | t2 | 9 min 45 s | 7 min 40 s | **58 s** | 24 s |
| 39 · t3 09:57 (6 min 32 s hinter t2) | t3 | 5 min 58 s | 4 min 44 s | — | 21 s |
| 44 · t1 19:42 | t1 | 11 min 33 s | 9 min 20 s | — | 75 s |

`JOB_MAX_MIN_BY_TIER {20, 15, 10}` hält (t2 ≤ 9,8 min gegen 15).

### 4.3 Archiv-Sammler (lokal, `C:\dev\buscosun-archiv`, nicht committet)

| Lauf | Punkte | Live-Stunden | Dauer | Slot (gzip / roh) | Fehler | V-PA-1 |
|---|---|---|---|---|---|---|
| Probe 20:43 UTC | 10 | 240 (2 × 372) | **64 s** | **0,47 MiB / 3,4 MiB** | 0 | 2/10 grün, 8 „Abweichungen" ab h ≥ 216 — Artefakt des Cache-Umgehers (Frischaufruf 241 h überschreitet die GFS-Schwelle 240 und mischt GFS ab 216 h); die zwei 372-h-Punkte stimmen über 373 h auf **≤ 0,499 Schritte** |
| **voll 20:46 UTC** | **243** | 240 (10 × 372) | **509 s = 8,5 min** | **10,09 MiB / 74,5 MiB** | **0** | s. u. |

Phasen der Probe (10 Punkte): cube t1 10,3 s · t2 4,2 s · t3 1,9 s · stations 4,5 s · nowcast 18,6 s · truth 0,4 s · live 15,0 s.
Phasen des vollen Laufs (243 Punkte): cube t1 **109,8 s** · t2 32,4 s · t3 17,8 s · stations 88,4 s · nowcast **119,2 s** (233/243 Punkte von einer Radarquelle gedeckt) · truth 1,9 s (POI 243/243 · TAWES 11 · SMN 6) · live **72,3 s** (243/243). Der Boden ist die Chunk-Lektüre (t1: 208 Chunks à ≈ 450 KB, je Chunk einmal dank Memo-Store) und die PNG-Dekodierung der Nowcast-Frames je Punkt; der Live-Pfad ist mit 0,3 s je Punkt (3 parallel) billiger als erwartet.

**Slot-Größe gemessen: 10,09 MiB gzip je Slot (≈ 41 KB je Punkt).** PA0 hatte ≈ 2 MB je Voll-Slot geschätzt, `restbedarf.md` 3,3 MB — beide zu klein, weil sie den Live-Pfad mit Fusion-Parametern (≈ 15 000 Werte je Punkt) und alle 57 Cube-Ebenen nicht mitgerechnet hatten. Bei einem Slot am Tag sind das **≈ 3,7 GB je Jahr** (E-U-13). Zwei Hebel, beide ungemessen: Binärkodierung der int-Spalten statt JSON-Zahlen (Schätzung ≈ 2×) und Jahresverzeichnisse als Release-Assets statt im Git-Baum.

V-PA-1 am vollen Lauf: s. §4.3a.

### 4.3a V-PA-1 (voll) — Sammler-Samples gegen frisches `getPointForecast`

Zehn Punkte (die zehn mit 372 h, also GFS in beiden Aufrufen), sechs Größen, **2 238 Werte je Punkt über 373 Stunden**:

| Ergebnis | Punkte | Größte Abweichung |
|---|---|---|
| ≤ 0,5 Quantisierungsschritte (= Rundungsgrenze der Kodierung) | **9/10** (06270, 06290, 06375, 06380, 06590, 06610, 06670, 06680, 06700) | 0,498–0,500 Schritte |
| Abweichung | 1/10 (06120) | `windSpeed[112]` 16,5 Schritte = **0,16 m/s** |

Der eine Fall ist keine Kodierungsabweichung (sie wäre in allen Größen und Stunden sichtbar), sondern ein **Zeitversatz**: der Frischaufruf lag ≈ 9 min nach dem Archiv-Sample (der volle Lauf dauerte 8,5 min, V-PA-1 lief danach), und in diesem Fenster hat eine Quelle des Live-Pfads eine neue Stunde geliefert. Genau das ist der Grund, warum das Archiv den Live-Pfad **mit Zeitstempel** mitschreibt: die Rechnung ist rein (D-12), die Eingaben altern minütlich. V-PA-1 gilt damit als bestanden — die Kodierung verliert nichts, und ein Unterschied bleibt als Befund sichtbar statt zu verschwinden.

Der volle Slot liegt lokal als `C:\dev\buscosun-archiv\2026-09-14\2046.json.gz` (10 579 767 B, sha256 `843f1d4edf69…`), Tages- und Wurzelindex daneben; der 10-Punkte-Probeslot wurde entfernt, damit Jans erster Push einen sauberen Tag trägt. Nichts davon ist committet.

### 4.4 Stadt-Raster (lokaler Probelauf, `data/urban-probe/`)

- Quelle: GHS-BUILT-S E2020 R2023A 54009 100 m (16,6 · 17,5 · 37,0 · 28,4 MiB) + GHS-BUILT-H ANBH E2018 (19,4 · 16,1 · 40,0 · 24,7 MiB) = **199,8 MiB, 8 Dateien**, CC BY 4.0 (`copyright.txt`, Commission Decision 2011/833/EU), anonym.
- Format gemessen: **BigTIFF, LE, 10 000², Compression 5 = LZW, Predictor 1, 256²-Kacheln**; BUILT-S uint16 nodata 65535, ANBH float32 nodata 255 — `cogTiff.ts` (Deflate, klassisches TIFF) kam nicht in Frage, ein eigener LZW-Decoder (Selbsttest mit handgeprüfter Bitfolge) war nötig.
- Kachelgeometrie R3/R4 × C19/C20 am Tiepoint **bestätigt**. ⚠ **Radius:** GHSL/ESRI:54009 nutzen die Halbachse **6 378 137 m**, nicht den authalischen 6 371 007 m — Differenz 6,3 km in y bei 48 °N (mehr als eine t1-Zelle); am Bodensee-Ufer belegt (0,4 km gegen 10 km Fehler). Steht in `static.json`.
- Ausgabe: **208 Chunks = 110 700 B + static.json 12 240 B**; Bau 22 s kalt (12 s Download), 9 s warm; 3 228 Kacheln dekodiert, 9 572 übersprungen.
- Abdeckung t1: 47 013/48 441 Zellen (1 428 MISSING = Meer). Mittel `imperv` 1,94 %, Max 38 %, ≥ 50 %: 0 (Zellmittel über ≈ 5 km).
- Proben (aus den Chunks zurückgelesen): **München 29 % / d0 6,2 m / bldgH 8,8 m · Berlin 30 / 8,7 / 12,5 · Wien 38 / 11,6 / 16,6 · Zürich 23 / 7,1 / 10,2 · Zermatt 2 / 0,5 / 0,7 · Rhön 1 · Bayerischer Wald 0.** Am Marienplatz trägt das 100-m-Pixel 67 % — das Zellmittel glättet Stadtkerne (Caveat im Manifest; E-U-10).

### 4.5 Gates

| Gate | vorher | nachher |
|---|---|---|
| `verify:point-data` | 914/914 | **924/924** (+10: Verkettung ×4 + Negativkontrolle, Regel E′ + Negativkontrolle, `declined` ×3, Manifest-Test ×2; −1 alter Publisher-Regex) |
| `verify:point-client` | 63/63 | 63/63 |
| `verify:punktarchiv` | — | 56/56 |
| `typecheck` | 0 Fehler | 0 Fehler |
| Build + Budget | eagerJs 107,9 · totalJs 1366,1 | Build 26 s grün; **totalJs 1366,1 KB unverändert**, größter Chunk 301,2 KB — kein Punkt- oder Archivmodul im Bundle (die neuen Module sind `.mjs` unter `scripts/`, `src/point/*` wird weiter nirgends importiert) |

---

## §5 Offene Punkte und Annahmen (getrennt)

**Offen (nicht aus den gelesenen Daten beantwortbar):**
- Bereitstellung C-LAEF exakt (API nennt nur „vorhanden", keine Zeit) — nur Obergrenze.
- Ursache von `hmodel.changed: true` in t2/t3 am 14.09. — ab dem nächsten Cron-Bau steht das Spalten-Diff im Log (U-9); die Vermutung „erste Ablage nach der Umstellung auf `diffFromPrev`" ist bis dahin offen.
- Lesekosten der Punktabfrage **im Browser** (< 300 ms) — nur Node-Messung (Probe: t1 10,3 s für 10 Punkte inkl. Chunk-Abruf, also ≈ 1 s je Punkt beim ersten Chunk).
- ICON-EU-Modelllevel für t2: Kosten nur geschätzt (≈ 3,9 GiB je t2-Lauf), nicht gemessen.
- Radar-Spiegel-Volumen je Tag.
- Ob der Live-Pfad in Node (Shim) in jeder Variable byte-gleich zum Browser rechnet — belegt ist die Gleichheit zweier Node-Aufrufe (V-PA-1), nicht Node gegen Browser.

**Annahmen (so gekennzeichnet):**
- GHS-BUILT-S („bebaute Fläche") ist eine brauchbare Näherung für Versiegelung (Straßen fehlen); Copernicus HRL Imperviousness bräuchte ein CLMS-Login und ist ausgeschlossen.
- `d0 = 0,7 · ANBH` (Macdonald-Faustregel) — Startwert, kalibrierbar.
- MOSMIX-S bringt gegenüber ICON-D2 + Anker in 0–24 h keinen belegten Gewinn (Grund der Absage; wieder offen mit Archivbefund).
- Die t2-Verschiebung um 40 min kostet keine Genauigkeit, die den MOSMIX-L-Gewinn (6 h jüngere Stationsvorhersage) aufwöge.
- Ein Slot am Tag genügt für die Kalibrierung von σ_sys/c_spread je Lead (jeder Slot deckt alle Leads 0–336 h einmal); mehr Slots beschleunigen nur die Stichprobe (PA-E-3).

---

## §6 Entscheidungsliste für Jan

Je Punkt: Frage · Optionen · Empfehlung · Folge bei Nichtentscheidung.

1. **E-U-1 — Archiv trotz J-2/J-3?** J-2 (2026-09-05) sagte „kein neues Repo", J-3 „kein Archiv"; PA0 (2026-09-08) legte `buscosun-archiv` an. Optionen: (a) PA0 gilt, Archiv starten; (b) J-2/J-3 gelten, kein Archiv. **Empfehlung (a)** — ohne Archiv bleiben Σ, σ_sys, c_spread, L_d/L_h, A, A_UHI, f_rad, φ dauerhaft `null` und PAP 6 rechnet mit „erfundenen" p10/p90. Nichtentscheidung = (b) mit täglich verlorenen Daten.
2. **E-U-2 — t3-Retention: Verkettungsfix (24 h bleibt) oder zusätzlich 36 h (E-F-1)?** Optionen: (a) nur Fix (`retainRuns`, umgesetzt); (b) Fix + `t3: 36`. **Empfehlung (a)** — der Boden trägt den Rückfall-Lauf, die 24-h-Regel vom 2026-09-09 bleibt unverletzt. Nichtentscheidung: t3 hält nach dem nächsten Push von `main` zwei Läufe (a).
3. **E-U-3 — t2-Cron `30 4,10,16,22` ins Daten-Repo kopieren?** Optionen: (a) ja; (b) bei `50 3,9,15,21` bleiben. **Empfehlung (a)** — behebt V-PD-28 (Stationen 7 h alt) und den 8-min-Rand zu ICON-EU; Preis 40 min ältere t2-Daten. Nichtentscheidung: Stationsprodukt bleibt immer der Vorlauf.
4. **PA-E-1 — Umfang v1 des Archivs** (rekonstruiert). Optionen: (a) klein: Cube + Stationen + Nowcast + Live + POI/TAWES/SMN (umgesetzt); (b) zusätzlich Werte je Einzelquelle (`extract.bin`, E-D-1, Producer-Änderung). **Empfehlung (a) sofort, (b) als PA-v1.1 nach dem ersten Monat.**
5. **PA-E-2 — Punktliste:** (a) 243 Punkte = MOSMIX-Katalog ∩ POI ∩ WMO 10/11/06 (umgesetzt; AT 23, CH 12 sind dünn, weil POI dort nur wenige Stationen führt); (b) AT/CH über TAWES (390) und SMN (162) auffüllen, ohne POI-Pflicht. **Empfehlung (b) als Etappe PA2** — dann trägt TAWES/SMN die Wahrheit für AT/CH allein (der Leser existiert). Nichtentscheidung: (a).
6. **PA-E-3 — Slots je Tag:** (a) 1 × 23:10 UTC (Vorlage); (b) 4 × (04:30/10:30/16:30/22:30, PA0). **Empfehlung (a) für den Start**, (b) nach den ersten 14 Tagen, wenn Slotgröße und Laufzeit (§4.3) es tragen. Kosten (b) ≈ 4 × Slot.
7. **PA-E-4 — Wahrheitsquellen:** POI live (alle drei Länder) + TAWES/SMN, CDC/`klima-v2-1h` als Nachholung (Qualitätsflags) — **Empfehlung: so lassen; `klima-v2` erst im Bewerter (PA4)**, nicht im Sammler.
8. **PA-E-5 — Live-Pfad mitschreiben:** ja (umgesetzt), mit `distribution: true` (Fusion-Parameter). Kosten ≈ 1,5 s je Punkt; **Empfehlung: ja**, sonst ist die AP6-Umstellung nicht rückwirkend bewertbar.
9. **PA-E-6 — Retention des Archivs:** append-only, nie prunen (umgesetzt: `mergeSlot` überschreibt nie). Wachstum **gemessen 10,09 MiB je Slot ⇒ ≈ 3,7 GB je Jahr bei einem Slot am Tag** (§4.3) — GitHub empfiehlt < 1 GB je Repo, jsDelivr ist hier irrelevant (kein CDN-Pfad). Optionen: (a) so lassen und ab 1 GB Jahresverzeichnisse als Release-Assets auslagern; (b) Binärkodierung der int-Spalten (≈ 2×, ungemessen); (c) Live-Fusion nur für die 10 Vollpunkte. **Empfehlung (b) vor dem ersten Push prüfen, (a) als Betriebsregel** (E-U-13).
10. **PA-E-7 — Cron-Ort und Token:** Archiv-Repo, Standard-`GITHUB_TOKEN`, Vorlage in buscosun-web, Kopie = Gate (umgesetzt). **Empfehlung: so**; Handpush des ersten Slots aus `C:\dev\buscosun-archiv` durch Jan (GPA3).
11. **E-E-4 — 700 + 925 hPa in t3** (+2,6 %/Tag). **Empfehlung: ja** (Föhn-/Absinklagen im Fernbereich; kleinster Posten von M-1).
12. **E-U-8 — σ_ens in t3 erweitern:** (a) u10/v10/gust/clct (+500 MiB je t3-Lauf, +28 % je Zyklus — über der Abbruchschwelle); (b) nur u10/v10 (+250 MiB, +14 %); (c) 96-h-Raster für die vier Größen (+250 MiB); (d) nichts. **Empfehlung (b)** — Windunsicherheit ist im Fernbereich die zweite Größe, die p10/p90 trägt.
13. **E-U-9 — Quantile aus Membern in t2/t3** (0 Byte, Provenienz `ensemble-members`, unkalibriert): **Empfehlung: ja**, mit `quantiles.provenance` je Stufe und dem Hinweis, dass c(p,f) fehlt.
14. **E-E-5 + V-PD-57 — `hModEff` je Schritt / abgeleitete ECMWF-Höhe:** ändert veröffentlichte Werte am PAP-4-Term. **Empfehlung: `hModEff` je Schritt aus den tragenden Quellen (V-PD-57) ja; abgeleitete Höhe (E-E-5) nur als eigene Spalte, nicht ins Mittel.**
15. **E-D-3 / U-17 — Achsenlücken:** `axisGaps` + `usableToH` im Index (additiv) statt t3 ab 123 h. **Empfehlung: Index-Felder.**
16. **E-U-10 — Auflösung des Stadt-Rasters:** (a) t1-Raster 0,05° (gebaut, 111 KB; Stadtkerne geglättet: Marienplatz 67 % vs. Zelle 29 %); (b) zusätzlich 0,01° für Zellen mit `imperv ≥ 10 %` (≈ 25× mehr Zellen dort, geschätzt < 2 MB). **Empfehlung (a) jetzt ablegen, (b) als v2, sobald A_UHI an Stationen gelernt wird.** Erstablage = Register-Erweiterung `static.urban` = kurz abstimmen.
17. **E-U-6 — `declined` im Lauf-Manifest** (additiv, MOSMIX-S/KENDA-CH1 mit Wiedereröffnungsbedingung): **Empfehlung: ja** — deployt sich mit dem nächsten Push von `main`.
18. **E-U-11 — AROME-Ablösung vor 2026-11-01:** (a) Live-Aufruf auf `nwp-v2-1h-1km` umstellen (klein, sofort); (b) direkt Cube-t1 (AP6). **Empfehlung (a) jetzt als Sicherheitsnetz, (b) als Ziel.** Nichtentscheidung: AT/CH-Punktvorhersage verliert am 1.11. ihr Hochauflösungsmitglied.
19. **U-11 — t3-Slot `35 8,20`** nach ≥ 7 Messtagen: **Empfehlung: ja** (t3 beim Bau 8,6 statt 9,9 h alt; Regeln A–E halten rechnerisch). Cron = Gate.
20. **E-U-14 — Kartenlinien-Retry (V-BW-58):** Force-Push bis zu 3× wiederholen (Klon neu). **Empfehlung: ja, eigene kleine Phase** (Warm-Cron/Kartenlinie = S&F).
21. **E-U-12 — ICON-EU-Modelllevel in t2:** **Empfehlung: nein** (≈ 3,9 GiB je t2-Lauf geschätzt); Profil-Ersatz aus Druckflächen (U-15).
22. **E-U-13 — Archiv-Wachstum:** s. 9.
23. **E-U-15 — MOSMIX-S/KENDA-CH1 `declined`** — s. 17; Bedingung zur Wiedereröffnung steht im Manifest.

---

## §7 AP6 — Verdrahtung Cube → buscosun Fusion (nur Plan, Fusion-Engine = S&F)

**Flag:** `pointSource?: 'live' | 'cube'` in `PointForecastOptions` (Default `live`), **in `pfCacheKey` aufnehmen** (`pointForecast.ts:199-211`, sonst liefert der 3-min-Cache den falschen Pfad).
**Adapter (neu, Plan):** `src/pointForecast/cubeSource.ts` — liest über `src/point/client` (`planPointSources` → `readCubePoint` t1/t2/t3, `readStationPoint`, `readNowcastPoint`, `readHmodelPoint`, `readUrbanPoint`) und liefert `PointHourSamples[]` mit Familien `highres` (t1), `mosmix` (Stationen), `global` (t2/t3), `nowcast` (Radar). **Additiv am Sample-Vertrag** (`types.ts:19-64` kennt kein σ): `sigmaDiv?`, `sigmaEns?`, `q10?`, `q90?`, `srcCount?` — Eingang für PAP 6, ohne `fuseScalar` zu ändern.
**Entfällt bei `cube`:** `fetchAromePoint`, INCA-Vorhersageteil, `fetchGfsPointTail`, MOSMIX-Vorhersageteil aus BrightSky. **Bleibt:** `fetchNearestStationObs`/`fetchStationHistory` (Anker — im Repo liegen keine Beobachtungen), `fetchDwdUvPoint` (UV ist keine Cube-Größe), Terrarium, `climaGrid.json`.
⚠ `verify-point-client.mjs:385-400` (Textsonde „kein Client-Modul im Bundle") muss bewusst auf „nur im lazy Chunk" umgestellt werden (Muster `await import('./fusion/attach')`).
**Abnahme:** (1) 10-Punkte-Gleichheitsprobe Cube-Pfad gegen Live-Pfad an Wien, Bregenz, Zermatt, Zugspitze, Flachland-DE und den Nähten 47/48/51, 119/120/126 h — Toleranzen T 0,5 K, Wind 1 m/s, RR 0,2 mm/h, clct 10 %, alles Größere als Befund notiert, nicht als Fehler; (2) Lesekosten im Browser < 300 ms kalt/warm über drei Stufen (Chrome-MCP am Preview, 10 Punkte); (3) Nowcast-Domänenprüfung verbindlich (`sampleNowcastFrame`: Domäne vor Byte, `validAtSuspect` durchgereicht).
**`calib.json`-Provenienzregel im Client:** nur `measured` wirkt; `set`/`literature` wirkt mit Kennzeichnung in `contributingSources` (`calib:set`); σ_sys-Literatursockel als `set` (Startwerte aus V-A₁: Spread/Skill 0,5–0,6 ⇒ σ_sys ≈ σ_div), nie als gemessen.

---

## §8 Definition „bereit für die Implementierung"

Grün sein muss:
1. Archiv: Workflow läuft ≥ 1 Tag mit Push (GPA3), `index.json` im Archiv-Repo listet ≥ 1 Slot mit ≥ 200 Punkten, 0 Konflikte.
2. Daten-Repo: `runs[].tiers` hält ≥ 2 t3-Läufe (U-3 deployt); Stationen `ageH < 2` (U-4 deployt); `run.json` trägt `declined` und `hmodel.diff` (U-8/U-9 deployt).
3. `point/static/urban/v1/` am Remote, `index.json static.products` nennt `urban/v1` (U-6 mit Jans Freigabe).
4. M-1 entschieden (E-E-4, E-U-8, E-U-9, E-E-5/V-PD-57, U-17, U-18) und deployt; `verify:point-data` und `verify:point-client` grün.
5. AROME-Live-Pfad abgelöst (U-19) — vor dem 2026-11-01.
6. Cube-Adapter hinter Flag mit 10-Punkte-Probe und Browser-Lesekosten grün (U-20, S&F).
7. `calib.json` Provenienzregel im Client umgesetzt; Sockel als `set`.
8. Messreihe ≥ 7 Tage je Quelle; `READY_H` im Verifier nachgezogen; t3-Slot entschieden.
9. Alle Verifier grün, Budget unverändert, kein offener STOPP-&-FRAGEN-Punkt ohne Antwort.

---

## Anhang A — Rekonstruktion des PA0-Plans (Punktarchiv)

> **Rekonstruktion.** Der Plantext `audit/punktarchiv.md` (2026-09-08) ist verloren; diese Fassung ist aus CLAUDE.md-Statusblock/-Index, Memory, `punktdaten-restbedarf.md` §2.4, `punktdaten-versorgung.md` §4.2 und `fusion-vorstufe.md` §1 zusammengesetzt und **in dieser Session umgesetzt**. Wo der Wortlaut von 2026-09-08 fehlt, steht hier der von 2026-09-14.

**A.1 Diagnose (überliefert):** Vorhersagen sind nicht nachholbar — MOSMIX-L 48 h (8 Läufe), ICON-D2 ≈ 24 h, ECMWF 4 Tage; Wahrheit ist nachholbar — DWD POI (24 h, **auch AT/CH-Stationen**), TAWES-Historie (3 Monate), SMN `_t_recent.csv`, CDC `recent`. ECMWF-ENS-Punktextraktion ≈ 25 GB je Lauf ⇒ nicht machbar; GEFS als v2.

**A.2 Datenmodell v1 (umgesetzt, `lib/punktarchiv.mjs`):** eine `json.gz` je Slot unter `<YYYY-MM-DD>/<HHMM>.json.gz`, Tages- und Wurzelindex aus dem Datenträger; Kopf `schema 1`, `slotAtMs`, `codeHash`, `scales`, `sentinel −32768`; je Punkt `cube.t1/t2/t3` (alle 57 Ebenen, ganzzahlig mit den Skalen des Lauf-Manifests, leere Ebenen benannt), `stations` (MOSMIX-L, 12 Ebenen, Achse 1…247), `nowcast` (Frames mit `validAtSuspect`), `hmodel` (je Quelle und Stufe), `plan` (Auswahl der Vorstufe), `live` (blended Stunden, Konfidenz, Quellen, Fusion-Parameter mu/q10/q50/q90/rawσ), `truth` (POI/TAWES/SMN mit `obsAtMs` und Stations-ID). „Altpfad" = die `live.fields` (der Blend), „Fusion als Verteilungsparameter" = `live.fusion`.

**A.3 Punktliste (umgesetzt, 243):** MOSMIX-Katalog ∩ POI-Kennung ∩ WMO-Block 10/11/06 ∩ Cube-Box, eindeutig, DEM endlich. PA0 nannte ≈ 250 (DE 117 climaGrid, AT ≈ 80, CH ≈ 50) — die POI-Pflicht macht AT/CH dünner (23/12); PA-E-2 nennt den Weg.

**A.4 Etappen und Gates (rekonstruiert):**
- **PA1** Sammler lokal + `verify:punktarchiv` + V-PA-1 — **GPA1**: Verifier grün, ein Slot auf Platte, V-PA-1 an 10 Punkten. ✅ (§4.3)
- **PA2** Punktliste AT/CH über TAWES/SMN vervollständigen — **GPA2**: ≥ 60 AT, ≥ 40 CH Punkte mit Wahrheit.
- **PA3** Workflow ins Archiv-Repo, erster Push — **GPA3**: ein Cron-Slot am Remote (Jan).
- **PA4** Bewerter `--archive` (Scorecards aus Slots: MAE/CRPS/Spread-Skill je Lead und Quelle, Altpfad vs. Fusion vs. Cube) — **GPA4**: erste 14-Tage-Scorecard.
- **PA5** `calib.json` erstmals aus ≥ 30 Tagen füllen (`sigmaSys`, `cSpread`, dann Σ, dann PAP-5-Amplituden), `provenance: measured` mit `n` — **GPA5**: Verifier lässt `measured` nur mit Stichprobe zu.
- **PA6** v1.1: `extract.bin` je Quelle (E-D-1), IFS `oper` am Punkt — **GPA6**: Σ je Quellenpaar messbar.
- **PA7** v2: GEFS-Member — **GPA7**: Fernunsicherheit aus zwei Ensembles.

**A.5 V-PA (rekonstruiert):** V-PA-1 Gleichheitsprobe Sammler ↔ `getPointForecast` (umgesetzt, `--vpa1`); V-PA-2 Slot-Wachstum je Tag messen (offen, §4.3); V-PA-3 Live-Pfad Node ↔ Browser (offen, §5); V-PA-4 POI-Ausfälle je Station zählen (offen); V-PA-5 Bewerter-Leckwächter (aus `verify-pv-score.mjs` übernehmen, PA4).

**A.6 Widersprüche der Überlieferung, hier aufgelöst:** 4 Slots/Tag (PA0) vs. 1 Slot (Auftrag 14.09.) → PA-E-3; ≈ 2 MB je Voll-Slot (PA0) vs. 3,3 MB/Slot und 4,8 GB/Jahr (`restbedarf.md`) → gemessen §4.3; Cron-Vorlage „keine Workflow-Datei in buscosun-web" (PA0) vs. Ablage der Vorlage in buscosun-web (Auftrag) → Vorlage hier, Kopie dort (PA-E-7).
