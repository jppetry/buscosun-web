# Phase EX — Expertenbericht vom 29.09.2026 zu buscosun Fusion: Prüfung und Umsetzung

> **Auftrag (Jan, 29.09.):** die 21 Vorschläge und die Fristen aus `fusion-verbesserungen-2026-09-29.md` prüfen und
> umsetzen, wo nötig. Volle Berechtigung für `buscosun-data` und `buscosun-archiv`; Push nach `buscosun-web/main` für
> den Cron-Fix am 29.09. einzeln freigegeben.
>
> **Grundlage des Experten:** nur der Programmablaufplan, nicht der Code. Deshalb ist jeder Befund hier zuerst am Code
> geprüft (Datei:Zeile), dann an den vorhandenen Messungen (Scorecards der Phasen FL/FX/FV/FS), dann an der Quelle selbst
> (DWD-, GeoSphere-, dynamical-Server am 29.09.).

## 0. Kurzfassung für Jan

1. **Die Fristen waren der wichtigste Teil des Berichts.** Eine davon hatte die Produktion schon getroffen, bevor der
   Bericht gelesen war: der Punkt-Cron schlug seit dem 29.09. 13:49 UTC in jedem Lauf fehl, weil das Gate den Termin
   „30.09. dynamical" als überfällig wertete — obwohl kein Leser den abgeschalteten Weg benutzt. Behoben und gepusht
   (`db1baa5`), §3.1.
2. **Drei weitere Fristen treffen uns wirklich:** 20.10. (Radar-Altformate: Spiegel, Cube-Nowcast und Client lesen nur
   das Altformat), 04.11. (GeoSphere `nwp-v1`: Live-Rückfallpfad und Kartenquelle), 30.11. (DWD: altes URL-Schema **und**
   reguläres Gitter von ICON-D2/ICON-EU entfallen — Producer und Kartenlinie). Der Gitterwechsel am 06.10. trifft uns
   nicht: der unveränderte Adapter liest den DWD-Testlauf, nur doppelt so teuer (§3.2).
3. **Von den 21 Vorschlägen beschreibt etwa die Hälfte einen Stand, den der Code nicht (mehr) hat** — der Plan ist älter
   als die Phasen FL/FX/FV/FS: Korrelationen in der Kombination (2), gefittete Varianz mit CRPS-Skala (1), gestutzte
   Normal für Wind (18), Feuchtkugel-Phase (19), Verifikation mit CRPS/PIT/DM-Test/Leave-Station-out (10),
   höhengewichteter 2×2-Block statt bilinear (11), BrightSky-Fallbackwerte (14) sind da.
4. **Was bleibt, ist überwiegend Daten- und Producer-Arbeit mit eigenem Gate**, keine Korrektur eines Fehlers: neue
   Quellen (RUC, MOSMIX_S, AIFS-ENS, E4, CH-Member), Ensemble-Mittel in t3, flächige MOS-Korrektur, Klimagitter,
   Niederschlagsfamilie. Jede davon ändert das Produkt und braucht nach den Regeln des Projekts Schalter + Backtest.
   Die Reihenfolge, die die Messungen nahelegen, steht in §5.
5. **Umgesetzt in dieser Phase** (§3, §4): Cron-Gate, Terminregister, Prüfwerkzeug für Gitterwechsel, Radar auf HDF5,
   zwei Korrekturen an den Scorern, Berichtigung einer falschen Größenangabe (MOSMIX_S).

## 1. Prüfung der 21 Vorschläge

Spalte **Befund im Plan**: trifft die Beschreibung des Experten auf den Code zu? Spalte **Urteil**: `da` = schon
umgesetzt · `teils` · `offen` · `gemessen-nein` = gemessen und verworfen · `Kalender` = wartet auf Daten.

| # | Befund im Plan trifft zu? | Was der Code tut (Beleg) | Urteil | Folge |
|---|---|---|---|---|
| 1 | **teils** | Rohe σ_ens nur im Rückfall PAP 6 (`uncertainty.ts:144`, `C_SPREAD = 1` gesetzt). Mit den gelernten Tabellen (Produktion, Stufe `fs`) ersetzt die gefittete σ den Zweig ganz (`cubeSource.ts:1207`): σ² = c₀ + c₁σ_div² + c₂σ_ens² + Gelände + Tagesgang je Größe × Vorlauf-Bin (`fitVariance.ts:4`), darauf eine per CRPS gewählte Skala (`fitScale.ts`). β = 1 nur mit `priorShrink: false` UND wenn jeder Member eine explizite σ trägt (`fuse.ts:508`). Spread/Skill in den Fit-Scorern als √(mittlere Varianz) (`lib/stats.mjs:169`) | da (EMOS-Form), **ein Scorer falsch** | `verify-pv-score.mjs:451` rechnete Mittel der σ — behoben, §4.2. Offen: MOSMIX-Member-σ ist gesetzt (V-FV-6a), wartet auf ≥ 30 Ausgabetage |
| 2 | **nein** | `combine.ts:8` rechnet mit voller Σ_ij = ρ_ij σ_i σ_j, Gewichte aus der geschrumpften Matrix, Varianz wᵀΣw mit ungeschrumpften ρ (`combine.ts:209`). ρ aus `familyErrorCorrelation`/`pointPairCorrelation` (`priors.ts:447/465`) — **gesetzt, nicht gemessen**. Gelerntes Stacking: Lernstufe (EMOS mit Σ-Gewichten als Prior) und Stationswert `M + b + w·I + c·(L − M)` | da; ρ gemessen = Kalender | Gemessene ρ und Member-σ aus dem Archiv, sobald es trägt (mit V-FV-6a) |
| 3 | **ja** | t3 mittelt vier deterministische Läufe gleichgewichtet; ICON global/AICON enden bei 180 h (`sourceMatrix.ts:352/380`). IFS-ENS liefert σ_ens + q10/q90 im 48-h-Raster (`ecmwfEns.mjs`), AIFS-ENS nur Kontrolllauf und übersprungen. **Ensemble-Mittel wird nirgends als Zentralwert benutzt — Jans Entscheidung V-PD-9** (es ließe σ_div schrumpfen) | offen, **E-EX-1** | Größter inhaltlicher Hebel des Berichts. Im Hindcast messbar, ohne den Producer anzufassen: die 50 IFS-ENS-Member liegen ab 2024-04 im Cache (§5.1) |
| 4 | **teils** | ICON-D2 8 Läufe: ja. Radar „hart 0–3 h": im Cube-Pfad ein Fenster (`NOWCAST_HORIZON_H = 3`), im Live-Pfad ein abklingendes Gewicht. RUC am Server geprüft: stündlich, +27 h, nur Dreiecksgitter (542 040 Zellen), 0,8 MB je Feld, RUC-EPS 20 Member als Einzeldateien | offen, **E-EX-2** | Bringt nur etwas mit stündlichem t1-Cron (heute 3-stündlich). Adapter klein (AICON-Muster), Entscheidung ist der Takt |
| 5 | **ja** | Nur MOSMIX_L. MOSMIX_S ist registriert und **abgelehnt** (`adapters/index.mjs:78`) — mit der Begründung „24 KMZ à ≈ 80 MiB". Gemessen 29.09.: **36,4–36,9 MB** je Datei; 80 MiB ist die Größe von MOSMIX_L | offen, **E-EX-3**; Text berichtigt (§4.3) | Beantwortet zugleich V-FS-15 (im Browser fehlt die Innovation meist) zum Teil: MOSMIX_S trägt die Messung der letzten Stunde schon in sich |
| 6 | **ja** | `StackTable.range { maxKm: 5, maxDElevM: 50 }`, harter Schalter (`stationValue.ts:132`), kein Übergang | offen, Kalender | Flächige Korrektur braucht ein Producer-Produkt, einen Fit und Leave-Station-out; die Tabelle hat 13 Ausgabetage. Kleiner Schritt vorab: V-FS-15 |
| 7 | **teils** | Fälle A/B/C stehen auf dem Modelllevel-Profil der untersten 500 m (nur t1), nicht auf 925/850/700. t2/t3: Standardgradient. Der REDCAPP-Term (ΔT = t2m − T850) ist als Merkmal `dTsfc` in der Lernstufe, mit `tpi500`, `sink`, `svf` und Wechselwirkungen (`features.ts:71`, `design.ts:21`) — in Produktion aktiv | teils da; Rest **gemessen-nein** | AP15 hat das Druckflächenprofil gemessen: bei \|Δh\| > 300 m MAE 1,94 gegen 1,39 K (nachts 2,79 gegen 1,64) — der entkoppelte 2-m-Punkt kippt den Gradienten. Eine Regression T2m gegen Nachbar-Orographie hat dasselbe Problem und ist mit dem 2×2-Block des Archivs nicht rückrechenbar |
| 8 | **teils** | Niederschlag ist zweistufig (K-2): Auftreten im Probit-Raum, Menge lognormal (`hurdleLogNormal`); gelernte Hürde mit CV-Schranke. Keine Gamma/GEV-Familie. Wahrheit nur an Stationen | offen, groß | Neue Familie = Codec-Version (geteilt mit AP9). Flächige Wahrheit (RADOLAN RW, INCA, CombiPrecip) ist der wertvollere Teil: 7–48 h ist heute `no-skill` |
| 9 | **ja** | 13 Ausgabetage (Stationswert), 95 Sommertage für 7–48 h, Hindcast aus nachgebauten Vorhersagen. Pooling ist schon global: eine Koeffizientenmenge je (Größe, Bin, Route), linear in 33 Standortmerkmalen; einzig μ_c ist stationslokal | Kalender | E-FL-3 (Nachfit ab Dezember), E-FS-3 (Neufit ab ≥ 30 Ausgabetagen) stehen. Der Bericht bestätigt die Planung |
| 10 | **nein** | CRPS, PIT, Spread/Skill, Brier, ETS; Baselines Rohmodelle, Mittel, Klimatologie, Persistenz, MOSMIX, Live-Pfad; Diebold-Mariano mit Newey-West + Benjamini-Hochberg (`lib/stats.mjs:45`); Leave-Station-out, Leave-Region-out | da; **zwei Schwächen** | DM-Test ohne Kleinstichproben-Korrektur (bei 13 Tagen zu großzügig) — behoben, §4.2. EUPPBench nicht im Repo (Wunsch, kein Mangel) |
| 11 | **nein** | Kein bilineares Mittel: Gewicht exp(−(d/L_d)²)·exp(−(Δh/L_h)²), L_h = 200 m (`grid.ts:101`); eine Zelle 600 m daneben bekommt < 0,1 %. Das ist die weiche Form von `nearest_minimum_dz`, auf den 2×2-Block beschränkt | da | Offen bleibt der Chunk-Rand (`crossChunk`, gebaut, aus — E-F-18) |
| 12 | **ja** | Kein Zeitgewicht, keine Modellversion als Merkmal, kein Nachfit-Auslöser. Die Tabellen tragen `builtAt`, `period`, `fitVersion`; kein Leser prüft das Alter | offen, **V-EX-6** | Klein und sicher wäre eine Altersprüfung im Leser (benannt, nie still). Modellversion als Merkmal = Refit |
| 13 | **teils** | Der Motor-Prior ist `climaGrid.json` (Meteostat, 178 Stationen, nur T und Nasstag-Wahrscheinlichkeit). Die Lernstufe hat ihr eigenes Produkt aus 389 Stationen (13 Koeffizienten je Größe). FX-4 gemessen: T-Klimatologie RMS 2,14 K (Motor) gegen 1,02–1,06 K (Merkmalsregression) | offen, **E-EX-4** | Der Ersatz des Motor-Priors ist schon als V-FX-30 / E-FX-4 geführt. HYRAS/SPARTACUS sind dafür der bessere Rohstoff als eine Stationsregression |
| 14 | **teils, ein Teil überholt** | Anker = Innovations-Persistenz; mit Tabellen die gemessene Kurve w(τ) (`fitAnchor.ts`). BrightSky: geliehene Werte werden seit `b27e068` der Station zugeschrieben, von der sie stammen — nicht verworfen, aber richtig verortet. INCA-Analyse nicht als Anker | teils da | Gleitender Stationsbias je Tagesstunde steht schon als Skizze in V-FS-4; braucht eine Historie je Station (Producer-Produkt) |
| 15 | **ja** | Stufen überlappen im Vorlauf nicht; in der Gültigzeit nur 3–6 h durch den Laufversatz. Nähte werden markiert, nie geglättet (Regel R7). Gemessen: Naht t1/t2 −0,6 K | offen, klein mit Backtest | Eine Rampe über die vorhandene Überlappung kostet keine Daten; ohne Backtest nicht einschalten |
| 16 | **ja** | Lineare Interpolation von p10/p50/p90 für jede Größe gleich (`cubeSource.ts:1366`). Die Tagesgang-Vorlage liegt im Client schon vor (μ_c mit zwei Harmonischen) | offen, klein mit Backtest | Anomalie interpolieren statt Wert. Messbar am Hindcast (stündliche Wahrheit) |
| 17 | **ja** | ICON-CH nur Kontrolllauf; ICON-D2-EPS σ sechsstündlich, 5 von 11 Größen | offen | Reine Mengenfrage (23 MB je Größe und Schritt bei CH). RUC-EPS mit Einzeldateien je Member wäre der billigere Weg zu stündlicher σ |
| 18 | **teils** | Wind: Rice (Motor) bzw. gestutzte, renormierte Normal (`learnedSpeed`, in Produktion). Wo der Stationswert greift, schreibt `stackDist` Wind und Böe als zensierte Normal (`stationValue.ts:68`). Böe: immer zensiert. Kein Expositionsmerkmal (Sx) | teils da; am Stationswert **gemessen-nein** (§4.4) | Die gestutzte Normal ist am Stationswert für Wind 1,6–5,0 % schlechter, für die Böe gleichauf ⇒ bleibt zensiert. Exposition: FX-4 hat die Windklimatologie mit Exposition gemessen und verneint (E-FX-9); als Merkmal der Lernstufe offen |
| 19 | **nein** | Phase aus der Feuchtkugeltemperatur am Punkt, als Wahrscheinlichkeit über die T-Verteilung (`meteo.ts:44–113`, T_w50 = 0,6 °C). Die Schneefallgrenzen-Regel steht nur in `precipType.ts` (Tour, Nowcast) | da | Offen V-FS-9 (nach dem Stationswert werden RH und pSnow nicht neu abgeleitet) |
| 20 | **ja** | Ein Lauf je Quelle (`chooseRun`), kein Altersgewicht | offen, P3 | Download × Zahl der Läufe; V-PD-9 gilt sinngemäß |
| 21 | **ja** | Weder Strahlung noch Sicht im Cube; auch keine Wahrheit dafür | offen, P3 | DWD stellt VIS in der ICON-Kette nach dem 30.11. ein (Newsletter 02.09.) — Sicht nur noch aus RUC oder MOSMIX |

**Zählung:** 6 Befunde treffen den Code nicht (2, 10, 11, 19 ganz; 14, 18 zum Teil überholt), 7 treffen teilweise, 8 ganz.
Kein Vorschlag deckt einen Rechenfehler im Produkt auf; zwei decken Schwächen in Scorern auf (1, 10), einer eine falsche
Zahl in einer Ablehnungsbegründung (5). Einer wurde in dieser Phase gemessen und verworfen (18, am Stationswert).

## 2. Prüfung der Fristen

| Datum | Behauptung | An der Quelle geprüft (29.09.) | Betrifft uns? |
|---|---|---|---|
| 30.09. | `data.dynamical.org` wird abgeschaltet | Hinweis steht auf dynamical.org; als Ersatz nennt die Seite `s3://dynamical-ecmwf-ifs-ens/…icechunk/` | **Nein.** `extract_dynamical.py:103` liest `icechunk.s3_storage(bucket=…, region='us-west-2', anonymous=True)`. Alle drei Stores geöffnet, jüngster Lauf 29.09., keine virtuellen Chunk-Container, je ein Wert gelesen. **Aber:** der Termin stand im Register und hielt das Cron-Gate an (§3.1) |
| 06.10. | ICON-EPS 26 → 20 km, ICON-EU-EPS 13 → 10 km | DWD-Newsletter 28.07.; Testlauf 2026071500 unter `/test/weather/nwp/` | **Lesbar ohne Änderung**, doppelt so teuer (§3.2). Gelernte Varianz benutzt σ_ens als Merkmal, gefittet auf IFS-ENS — der Unterschied zu ICON-EPS besteht schon heute und wächst (V-EX-8) |
| 20.10. 08 UTC | Radar-Altformate enden | Newsletter 29.09. + 04.08.2025: „alle älteren Formate von Komposits mit HDF5-Produktion"; RV liegt in beiden Formen nebeneinander | **Ja, ganz.** Spiegel (`radar-mirror.mjs:71`), Ableitung, Client-Rohweg (`radolanRuns.ts:180`), Nowcast-Leser (`nowcastReader.mjs:94`), `fetchRyLatest` — alle lesen `DE1200_RV*.tar.bz2` bzw. `…-bin.bz2`. KONRAD3D (XML) ist nicht genannt |
| 04.11. | GeoSphere `nwp-v1-1h-2500m` endet | Hinweis auf der Datensatzseite: „Anfang 04. November 2026" (Register: 01.11.) | **Ja:** `sampleSources.ts:427` (Live-Rückfallpfad) und `geosphereArome.ts:81` (Karte). Producer liest schon v2. `ensemble-v1` lesen wir nicht. Zusätzlich im Live-Pfad: `nowcast-v1-15min-1km` — kein Hinweis auf der Seite |
| 30.11. | Altes URL-Schema ICON/ICON-EU/ICON-D2 endet | Newsletter 02.09.: neues Schema `/weather/nwp/v1/m/…`, **nur Dreiecksgitter**, CCSDS statt bz2, Member einzeln, 15-min-Felder einzeln | **Ja, groß.** Producer: `dwdRegular.mjs:31/82`, `dwdIcosahedral.mjs:34`, `dwdEps.mjs:69/87/101`. Karte: `iconD2Precip.ts`, `iconD2EpsSource.ts`, `iconEuRasterSource.ts`, `iconEuSounding.ts`, `iconEuPressureWind.ts`, `iconGlobalSource.ts`, `repack-icon-d2.mjs`, `warm-grib.mjs`, Edge Functions `dwd-wind`/`dwd-grib`. ICON-D2 und ICON-EU verlieren das reguläre Gitter ⇒ eigene Phase (E-EX-5) |
| laufend | Open-Meteo kostenlos nur nicht-kommerziell | — | buscosun Fusion ruft Open-Meteo zur Laufzeit nicht. Andere Funktionen tun es (Konfidenz, Historie, Brandwetter, Pollen AT/CH, Wind-Punktgitter): 14 Aufrufstellen, im Register als `open_meteo_free` blockiert (D-18). Der Hindcast liest den S3-Bestand (CC BY 4.0). Für die Monetarisierung ist die Liste in §6 der Ausgangspunkt |

## 3. Umsetzung — Fristen

### 3.1 Cron-Gate und Terminregister (V-EX-1, V-EX-5) — **gepusht `db1baa5`**

**Befund.** `GET /repos/jppetry/buscosun-data/actions/runs`: vier Läufe des Workflows `point` am 29.09. (13:49, 16:41,
16:49, 19:44 UTC) mit `failure` nach 0,9 min, Schritt 8 „Gate — Form der Punktdaten"; letzter Erfolg 10:48 UTC.
Nachgestellt im frischen Sparse-Klon nach der Vorschrift des Workflows (`scripts src package.json QUELLENMATRIX.md`,
nur `bz2`): 975/977, beide Fehlschläge derselbe Termin:

```
FAIL  Quellenmatrix: Termin nicht überfällig: data.dynamical.org ändert den Zugriffsweg…  — 0 Tage
FAIL  Termin offen: data.dynamical.org ändert den Zugriffsweg  — 0 Tage
```

`daysUntil` rundet — der Termin zählt ab 12:00 UTC des Vortags als überfällig. Seit dem 29.09. ist der Cube-Pfad die
Voreinstellung des Panels; ohne Cron altert der Cube.

**Ursache im Entwurf.** Das Register kannte nur „Termin offen" und „Termin überfällig". Für „geprüft, betrifft uns
nicht" gab es keinen Zustand; der Eintrag sagte selbst „nur relevant, falls …". Dieselbe Falle lag für den 31.12.
(„MeteoSchweiz kündigt eine API an" — eine Chance, kein Wegfall) bereit.

**Änderung.** `ScheduledChange.resolved { on, evidence }` und `informational`. Das Gate verlangt für `resolved` ein
Datum und einen Beleg (≥ 40 Zeichen); Gegenprobe: ein verstrichener Termin ohne `resolved` fällt weiter durch. Neue
Einträge für 06.10. (erledigt, mit Beleg), 20.10., 30.11.; GeoSphere-Datum auf das gemessene 04.11.

**Beleg.** Lokal `verify:point-data` **998/998**; im Sparse-Klon auf `db1baa5` **986/986** (dort ohne lokalen
Datenbaum). `npm run typecheck` grün.

### 3.2 Gitterwechsel ICON-EPS / ICON-EU-EPS am 06.10. (V-EX-2)

`scripts/point/probe-eps-grid.mjs` fährt den **unveränderten** Adapter `dwdEps.mjs` gegen den DWD-Testlauf und gegen
die Produktion:

| Modell | Basis | Zellen | Zellen ohne Nachbar | Abstand Stufenzelle → Modellzelle p50 / p90 / max | Member | Datei t_2m | Dekodieren + Abtasten |
|---|---|---|---|---|---|---|---|
| ICON-EU-EPS | Produktion (13 km) | 164 984 | 0 / 12 221 | 5,3 / 8,6 / 11,6 km | 40 | 9,5 MB | 4,8 s |
| ICON-EU-EPS | Test (10 km, #63) | 342 428 | 0 / 12 221 | 4,0 / 6,5 / 8,7 km | 40 | 19,5 MB | 10,8 s |
| ICON-EPS global | Produktion (26 km) | 737 280 | 0 / 2 009 | 10,6 / 17,1 / 22,8 km | 40 | 37,2 MB | 23,6 s |
| ICON-EPS global | Test (20 km, #39) | 1 310 720 | 0 / 2 009 | 8,1 / 12,9 / 17,2 km | 40 | 62,7 MB | 39,2 s |

Niederschlag (entakkumuliert, Member gepaart über die Nummer) auf dem neuen Gitter gelesen: ICON-EU-EPS +60 h, 40
Member. σ_ens(T) im Test p50 0,88 K / 1,33 K — plausibel für einen Julilauf.

**Warum es ohne Änderung geht:** der Nachbarindex entsteht je Prozess aus `clat`/`clon` des Laufs selbst, die
Eimerkante aus der gemessenen Dichte (`sample.mjs:233`); nirgends steht eine Zellzahl. Die EPS-Quellen liefern keine
Orographie ⇒ `hmodel` bleibt.

**Was sich ändert:** Download und Rechenzeit der EPS-Anteile verdoppeln sich. t2 liest je Lauf 6 Schritte × 5 Größen
(+ Vorschritte für den Niederschlag) ≈ 36 Dateien ⇒ ≈ +360 MB und lokal ≈ +3,5 min Rechenzeit (sequenziell; der
Runner rechnet im Pool). Gemessene Job-Dauern am 28./29.09.: t2 8,3 min bei einer Grenze von 15, t1 14,4 min bei 20 —
t2 hat 6,7 min Luft, das reicht nach dieser Rechnung, ist aber am ersten Lauf nach dem 06.10. anzusehen
(MANUELLE-SCHRITTE §26).

**Restrisiko, benannt:** ein Job, der für dieselbe Quelle zwei Läufe mit verschiedenen Gittern mischte, würde still
falsch zuordnen (Index-Schlüssel `id|tier`, keine Längenprüfung in `sampleUnstructuredToTier`). Heute wählt
`chooseRun` einen Lauf je Quelle und Job; die Prüfung wird mit der Umstellung auf das neue URL-Schema (E-EX-5)
eingebaut, weil dieselben Dateien angefasst werden.

### 3.3 Radar: RV aus der HDF5-Lieferung (V-EX-3) — gebaut, Gates grün, **eingeschaltet am 30.09.** (`cdc9a9b`, Daten-Repo `a506f2e`)

**Diagnose.** Alles, was RV liest, las das RADOLAN-Binärformat: der Spiegel (`radar-mirror.mjs`), die Ableitung der
Bild-Slots (`radar-derive.mjs`), der Rohweg des Clients (`radolan.ts`, CDN und DWD), der Nowcast-Leser des Producers
(`nowcastReader.mjs`). Nach dem 20.10. 08 UTC gäbe es keinen neuen RV-Slot mehr: Regenradar DE, Niederschlag-Layer und
der Nowcast-Member von buscosun Fusion fielen aus. KONRAD3D (XML), INCA und rzc sind nicht betroffen.

**Das neue Format, am Objekt gemessen** (Slots 29.09. 20:00, 20:45, 21:00 UTC; beide Formen desselben Laufs):

| | RADOLAN-Binär | ODIM-HDF5 |
|---|---|---|
| Datei | `DE1200_RV<JJMMTTHHMM>.tar.bz2` | `composite_rv_<JJJJMMTT>_<HHMM>.tar` (nacktes Tar, 25 Einträge `…_<PPP>-hd5`) |
| Ablage beim DWD nach dem Slot | 3:18–3:44 min | 3:12–3:40 min (gleichzeitig bis 16 s früher) |
| Größe über 48 h (576 Läufe) | 0,10–0,53 MB, Mittel 0,26 | 0,75–2,41 MB, Mittel 1,35 |
| Gitter | 1100 × 1200, Zeile 0 = Süden | 1100 × 1200, Zeile 0 = Norden |
| Wert | uint16, 0,01 mm je 5 min | uint32, gain 0,001 / offset −0,001 mm je 5 min, `nodata` 4294967295, `undetect` 0 |
| Zeit | Kopfzeile = Laufzeit, `VV` = Vorlauf | `/what` = Laufzeit, `dataset1/what` end = Gültigzeit |
| Speicherform | — | ein Chunk, deflate 6 |

Die Radarmaske ist in allen 25 Feldern Zelle für Zelle dieselbe (0 von 33 000 000 Zellen verschieden). Die Werte sind
**nicht** dieselben: HDF5 ist zehnmal feiner, und das Altformat ist dessen abgeschnittene Fassung mit einer Einheit
als Untergrenze — Einheit = max(1, ⌊mm / 0,01⌋). Die Regel trifft 98,5–99,0 % der nassen Zellen exakt; der Rest liegt
auf einer Einheitengrenze und weicht um eine Einheit (0,12 mm/h) ab.

**Entscheidung in der Umsetzung (E-EX-6 zur Bestätigung).** Der Leser bildet die RADOLAN-Einheiten nach
(`units: 'radolan'`, Voreinstellung). Mit den feinen Werten fielen die schwächsten Echos unter die Schwelle der
Farbskala (0,06 mm/h): im Messlauf 27 % der nassen Zellen. Das wäre eine sichtbare Änderung des Regenradars und eine
Änderung des Nowcast-Members — beides gehört nicht in eine Formatumstellung. `units: 'native'` ist gebaut und geprüft.

**Gebaut.**

| Datei | Änderung |
|---|---|
| `src/sources/rvHdf5.ts` (neu) | `decodeRvHdf5`, `decodeRvHdf5Tar`: dasselbe `RadolanGrid` bzw. dieselben Frames wie der Altleser. Schneller Weg (der eine Chunk über `DecompressionStream`, `Uint32Array`), jsfive als Rückfall |
| `src/sources/radolanDecode.ts` | `isBz2`, `rvTarIsHdf5` (Signatur statt Name), `rvFileNameOf`, `rvStampFromFileName`, `rvFormatOrder` |
| `src/sources/radolanRuns.ts` (Start-Chunk) | nur die Adresse: `rvFileName`, `rvTarUrl`, `rvTarCdnUrl` nennen die HDF5-Form |
| `src/sources/radolan.ts` | `fetchRvDecoded`: HDF5 zuerst, RADOLAN als benannter Rückfall; der Leser wird am Inhalt gewählt; Listing-Rückfall kennt beide Namen |
| `src/sources/hdf5Worker.ts`, `hdf5OffMain.ts` | Auftrag `rv` (jsfive ist in diesem Worker schon geladen), Hauptthread-Rückfall |
| `scripts/radar-mirror/radar-mirror.mjs` | spiegelt die HDF5-Lieferung; Retention und Nachholen nach dem **Slot** statt nach dem Namen; `RV_FORMAT=radolan` als Rückweg |
| `scripts/radar-mirror/radar-derive.mjs` | `rv` erkennt beide Formen am Inhalt |
| `scripts/point/nowcastReader.mjs` | `readRvExact` liest beide Formen |

**Schalter (Rule 2).** `?rvfmt=radolan` bzw. `localStorage.rvfmt` legt den Client auf das Altformat fest (bis zum
Stichtag), `?rvfmt=hdf5` auf HDF5 ohne Rückfall. Der Bild-Weg (RD3, Normalweg) ist unberührt: gleiche Pfade, gleiche
`meta.json`.

**Belege.**

- `verify:radar-repack` **48/48** (vorher 41): B1 25 PNGs der Ableitung byte-gleich zum Client-Leser; B2b Laufzeit und
  Vorläufe aus der Datei; B2c schneller Leser byte-gleich zum jsfive-Weg; **B1h beide Lieferformen am selben Lauf** —
  Maske 0 Abweichungen, 406 von 39 658 bzw. 438 von 29 746 nassen Zellen um höchstens 2 Byte-Stufen verschieden;
  Gegenprobe mit den feinen Werten (18 751 bzw. 29 836 abweichende Zellen). B1h wird ab dem 20.10. übersprungen (⊘).
- `verify:radar-runs` **56/56**: beide Formen nennen dieselben Slots; Adressen, Rundlauf Name ↔ Stempel, Schalter.
- `verify:layer-erstbild` **38/38** (Textsonden auf den neuen Aufrufweg umgestellt, `rvHdf5.ts` DOM-frei).
- `verify:radar-sampling` 25/25, `verify:point-data` 986/986 (sauberer Arbeitsbaum), `verify:punktarchiv` 125/125.
- Spiegel lokal gegen ein Bare-Repo mit zwei Altformat-Slots als Bestand, 7 min: drei HDF5-Slots abgelegt und
  abgeleitet, Altformat-Slots nach dem Slot verdrängt, kein Slot doppelt. Ableitung 6,2–7,4 s mit dem jsfive-Weg
  (vorher 1,8–1,9 s); mit dem schnellen Leser im Verifier 4,1 s gegen 8,4 s (Maschine unter Last, 86 % CPU).
- Browser (Chromium, Dev-Server, `?radarimg=0&radarcdn=0`): `fetchRvNowcast` liefert 25 Frames 0…120 min aus
  `composite_rv_20260929_2100.tar` über den `hdf5Worker`; drei Läufe HDF5 4,6 s gegen drei Läufe RADOLAN 7,6 s,
  gleiche Zahl nasser Zellen (1 847 / 1 593 / 1 549).
- Bundle, im sauberen Arbeitsbaum gegen `db1baa5` gebaut: eagerJs **107,9 → 107,9** (Ratsche gehalten; der erste
  Entwurf lag 0,2 KB darüber, die Altformat-Adressen stehen deshalb nicht im Start-Chunk), totalJs 1 451,2 → **1 455,5**
  (+4,3 KB: `hdf5Worker` 58,6 → 63,5 KB roh, Rest im Radar-Chunk), largestChunk 301,2 unverändert.

**Einschalten — Reihenfolge ist Pflicht.**

1. `buscosun-web/main` pushen. Ab dann liest jeder neu geladene Client HDF5 zuerst (am CDN liegt die Form noch
   nicht ⇒ der Rohweg geht über den DWD; der Bild-Weg wie bisher) und die Ableitung versteht beide Formen.
2. Danach `scripts/radar-mirror/radar-mirror.mjs` nach `buscosun-data/scripts/radar-mirror.mjs` kopieren und pushen.
   Jeder Spiegel-Job klont `buscosun-web` beim Start; ein Job, der das neue Skript hat, hat deshalb auch die neue
   Ableitung. Umgekehrt gälte das nicht: neues Skript mit alter Ableitung ⇒ Slots ohne Bild-Ablage.
3. Nicht in das Publish-Fenster des Repack-Crons pushen (`:20` und `:30` der 3-Stunden-Slots, Force-Push).

**Offen.** V-EX-9 `fetchRyLatest` (exportiert, ohne Aufrufer) liest `…-bin.bz2` und endet am 20.10.; die HDF5-Form
von RY ist ein anderes Produkt (Größe `RATE`, gain 0,01, `/where` leer) — nicht geraten, nicht portiert.
V-EX-10 Altformat-Rückfall und `B1h` nach dem 20.10. entfernen. V-EX-11 Bild-Gate: die Ableitung dauert länger als
bei RD3 gemessen; `RV_IMG_GATE_MS` (270 s) nach dem ersten Tag am Runner gegen `radar/status.json` prüfen.

### 3.4 GeoSphere `nwp-v1-1h-2500m` (04.11.) — vermessen, nicht umgestellt (E-EX-7)

Beide Datensätze am selben Punkt und Lauf abgefragt (Innsbruck, Lauf 29.09. 15 UTC, 55 Zeitschritte):

| Größe | v1 (`nwp-v1-1h-2500m`, AROME 2,5 km) | v2 (`nwp-v2-1h-1km`, C-LAEF 1 km) |
|---|---|---|
| Temperatur | `t2m` °C | `2t` °C |
| Wind | `u10m`, `v10m` | `10u`, `10v` |
| Böe | `ugust`, `vgust` (Komponenten) | `10fg` (Betrag) |
| Feuchte | `rh2m` % | `2r` % |
| Schneefallgrenze | `snowlmt` m | `snowlmt` m |
| Bewölkung | `tcc` 0…1 | `tcc` 0…100 % |
| Niederschlag | `rr_acc` seit Laufbeginn | `tp` Stundensumme, Stunde 0 ohne Wert (Füllwert −1000, im Producer gemessen) |
| Druck | `sp` | nur `msl` |

Die Umstellung ist klein (zwei Leser, eine Zuordnungstabelle), aber sie tauscht im Live-Rückfallpfad das Modell hinter
der Kennung `arome_at` — mit eigenen Fehler-Priors, eigener Auflösung (`priors.ts:288`) und einer Beschriftung im
Panel, die „AROME" sagt. Das ist eine Änderung am Motor-Eingang und an der Rasterfusion der Karte
(`loadFusedForecast.ts`) und damit Jans Entscheidung. Bis zum 04.11. nötig; das Gate des Punkt-Crons schlägt sonst ab
dem 03.11. 12 UTC fehl (genau der Mechanismus aus §3.1 — diesmal zu Recht).

### 3.5 DWD: neues URL-Schema und Wegfall des regulären Gitters (30.11.) — eigene Phase (E-EX-5)

Am Server gemessen: `/weather/nwp/v1/m/icon-d2/p/T_2M/r/<ISO>/s/PT…H.grib2` liegt neben dem alten Schema; nur
Dreiecksgitter, CCSDS im GRIB statt bz2, Ensemble-Member und 15-Minuten-Felder als Einzeldateien.

| Betroffen | Heute | Nach dem 30.11. nötig |
|---|---|---|
| Producer ICON-D2, ICON-EU (`dwdRegular.mjs`) | reguläres Gitter, bz2 | Dreiecksgitter über den Nachbarindex (`buildUnstructuredIndex`, vorhanden), CCSDS (Decoder vorhanden) |
| Producer ICON global, AICON (`dwdIcosahedral.mjs`) | AICON schon neu | URL-Muster wie AICON |
| Producer EPS (`dwdEps.mjs`) | eine Datei = alle Member | je Member eine Datei ⇒ Teilmengen werden möglich (E-U-8 neu rechnen) |
| Kartenlinie: Repack ICON-D2 (`repack-icon-d2.mjs`), Wind, Niederschlag, EPS, ICON-EU-Raster, Sounding, Druckflächenwind | reguläres Gitter als Bild | Regridding im Repack oder Dreiecksgitter im Client — die größere Hälfte der Arbeit |
| Edge Functions `dwd-wind`, `dwd-grib`, `warm-grib.mjs` | altes Schema | neue Pfade |

Zwei Monate Vorlauf, aber die Kartenlinie ist der größere Teil und berührt Shader-Eingänge und Manifest-Mechanik
(beides STOPP & FRAGEN). Vorschlag: Phase „NS" mit Diagnose in der ersten Oktoberwoche, Producer zuerst.

## 4. Umsetzung — Scorer, Texte, Messung

### 4.1 Was nicht geändert wurde und warum

Kein Eingriff in `src/pointForecast/fusion/`, `cubeSource.ts`, die gelernten Tabellen oder den Codec: keiner der 21
Befunde ist ein Fehler im Produkt, und jede Änderung dort braucht Schalter und Backtest. `cubeSource.ts` ist im
Arbeitsbaum von der parallelen Dashboard-Phase geändert — nicht von dieser.

### 4.2 Zwei Korrekturen an den Scorern (Befunde 1 und 10)

| | Vorher | Jetzt | Beleg |
|---|---|---|---|
| Spread/Skill der V-A₁-Scorecard (`verify-pv-score.mjs`) | Mittel der σ / RMSE | √(Mittel der σ²) / RMSE; die alte Zahl fährt als `spreadSkillMean` mit | In FX gemessen liegt die Mittel-Form etwa 0,05 tiefer (0,82 gegen 0,87): die Karten vom 07.09. (0,5–0,6 „überkonfident") bleiben im Urteil gleich, die Zahl rückt ein Stück nach oben |
| Diebold-Mariano (`lib/stats.mjs`, jetzt auch von `verify-pv-score.mjs` benutzt) | Normalverteilung | Korrektur nach Harvey/Leybourne/Newbold und Student-t mit n − 1 Freiheitsgraden; alte Werte als `statNormal`/`pNormal` | Bei 13 Ausgabetagen Faktor 0,730, bei 120 Tagen 0,9375. Gegenprobe im Verifier: eine 13-Tage-Reihe mit p 0,043 (normal) hat p 0,165 |
| Bootstrap des Skill-Intervalls | einzelne Tage unabhängig gezogen | gleitende Blöcke (zirkulär, Länge L + 1) | Zusammenhängende Tage geben ein breiteres Intervall als dieselben Tage gemischt (0,090 gegen 0,055) |

`verify:fusion-fit` **124/124** (119 + 5 neue Prüfungen in Block 9).

**Folge für die vorhandenen Karten (nicht neu gerechnet):** die Sterne der Archiv-Karten FV-A und FS stehen auf 13
Ausgabetagen und der Normalform. Mit der Korrektur schrumpft jede Statistik dort auf 73 % und die Schwelle steigt von
1,96 auf 2,18 — Zellen mit einem knappen Stern verlieren ihn. Die Hindcast-Karten (Hunderte Tage) ändern sich kaum.
Beide Archiv-Karten hießen schon „indikativ". Neu rechnen: mit dem Neufit ab ≥ 30 Ausgabetagen (E-FS-3), nicht vorher.

### 4.3 MOSMIX_S: Ablehnungsbegründung berichtigt (Befund 5)

`scripts/point/adapters/index.mjs`: „24 KMZ à ≈ 80 MiB" → gemessen 36,4–36,9 MB; 80 MiB ist MOSMIX_L. Die Ablehnung
selbst bleibt (Jans Entscheidung, V-PD-30) — aber ihr Kostenargument ist halb so groß wie angenommen (E-EX-3).

### 4.4 Messung zu Befund 18: gestutzte statt zensierte Normal am Stationswert

`scripts/fusionfit/ex-wind-family.mjs`, 331 594 Archivzeilen, Modus S, dieselben Leave-Day-out-Parameter wie
`stack-score.mjs`; gepaart nach Ausgabetag, DM in der Kleinstichproben-Form. `gestutzt*` = σ mit einem Faktor je Zelle,
gewählt per CRPS auf den anderen Tagen.

| Größe | Bin (h) | n | Messung = 0 | CRPS zensiert | CRPS gestutzt | Δ | p | CRPS gestutzt* (s) | Δ* | PIT-Rand zens. / gest. / gest.* |
|---|---|---|---|---|---|---|---|---|---|---|
| Wind | 0–6 | 27 064 | 3,7 % | 0,474 | 0,486 | +2,6 % | 0,000 | 0,479 (0,8) | +1,2 % | 0,156 / 0,203 / 0,268 |
| Wind | 7–24 | 83 391 | 1,8 % | 0,553 | 0,561 | +1,6 % | 0,002 | 0,556 (0,8) | +0,6 % | 0,158 / 0,190 / 0,258 |
| Wind | 25–48 | 95 097 | 2,1 % | 0,562 | 0,574 | +2,1 % | 0,003 | 0,568 (0,8) | +0,9 % | 0,157 / 0,195 / 0,260 |
| Wind | 51–120 | 79 284 | 2,3 % | 0,660 | 0,679 | +2,9 % | 0,007 | 0,670 (0,8) | +1,5 % | 0,157 / 0,200 / 0,266 |
| Wind | 126–240 | 36 411 | 3,5 % | 0,830 | 0,871 | +5,0 % | 0,060 | 0,853 (0,7) | +2,9 % | 0,158 / 0,232 / 0,322 |
| Böe | 0–6 | 23 284 | 0,1 % | 0,672 | 0,671 | −0,0 % | 0,994 | 0,665 (0,8) | −1,0 % | 0,143 / 0,148 / 0,216 |
| Böe | 7–24 | 74 220 | 0,0 % | 0,826 | 0,828 | +0,3 % | 0,000 | 0,827 (0,8) | +0,1 % | 0,153 / 0,157 / 0,224 |
| Böe | 25–48 | 86 500 | 0,1 % | 0,852 | 0,856 | +0,5 % | 0,003 | 0,851 (0,8) | −0,1 % | 0,148 / 0,154 / 0,226 |
| Böe | 51–120 | 71 773 | 0,0 % | 1,041 | 1,050 | +0,9 % | 0,030 | 1,045 (0,8) | +0,4 % | 0,158 / 0,167 / 0,234 |
| Böe | 126–240 | 32 322 | 0,1 % | 1,408 | 1,428 | +1,4 % | 0,274 | 1,425 (0,8) | +1,2 % | 0,161 / 0,188 / 0,255 |

**Verdikt: nicht umstellen.** Die zensierte Normal ist am Stationswert in jeder Wind-Zelle besser und bei der Böe
gleichauf; der PIT-Rand liegt mit 0,14–0,16 unter dem Soll von 0,20 (leicht zu breit), die gestutzte Form träfe ihn,
bezahlt das aber mit einem verschobenen Mittel (MAE Wind 0,636 → 0,685). Grund: 2–4 % der Windmessungen sind exakt 0 —
die Masse bei 0 ist an Stationen echt. Das widerspricht dem Ergebnis der Lernstufe nicht (dort gewann die gestutzte
Normal gegen die **Rice**-Verteilung, mit eigenen, per CRPS gefitteten Parametern). Grenze der Messung: 13 Ausgabetage
im September, nur Stationen mit MOSMIX.

## 5. Was als Nächstes lohnt — Reihenfolge nach Messlage

| Rang | Schritt | Warum jetzt | Aufwand | Gate |
|---|---|---|---|---|
| 1 | Radar-HDF5 einschalten (§3.3) | Frist 20.10. | Push + Kopie | Jan: Push, Kopie ins Daten-Repo |
| 2 | GeoSphere v2 im Live-Pfad und in der Karte (§3.4) | Frist 04.11. | klein | E-EX-7 |
| 3 | DWD-Schema, Phase „NS" (§3.5) | Frist 30.11., größte Arbeit | groß | E-EX-5 |
| 4 | **Ensemble-Mittel in t3 messen** (Befund 3) | größter inhaltlicher Hebel des Berichts; ohne Producer-Eingriff im Hindcast messbar: IFS-ENS mit 50 Membern liegt ab 2024-04 im Cache. Frage: schlägt das Ensemble-Mittel bei 126–336 h das Mittel der vier Einzelläufe, und was bleibt davon nach der Lernstufe? | mittel (Fallbau + Scorecard, ≈ 1 Tag Maschine) | E-EX-1; berührt V-PD-9 |
| 5 | MOSMIX_S im Stationsprodukt für 0–24 h (Befund 5) | schließt V-FS-15 (Innovation fehlt im Browser) ohne Client-Arbeit; Kosten halb so groß wie angenommen | mittel (Parser vorhanden; Takt des Stationsprodukts) | E-EX-3 |
| 6 | Anomalie-Interpolation für T/Td (Befund 16) und Rampe über die Stufennaht (Befund 15) | klein, am Hindcast messbar (stündliche Wahrheit), keine neuen Daten | klein + Backtest | Schalter, voreingestellt aus |
| 7 | Altersprüfung der gelernten Tabellen im Leser (Befund 12, V-EX-6) | billig; ein Modellwechsel (IFS 50r1 am 12.05. liegt im Fit-Zeitraum) wird sonst nie sichtbar | klein | benannt, nie still |
| 8 | Flächige Wahrheit für den Niederschlag (Befund 8: RADOLAN RW, INCA, CombiPrecip) | 7–48 h ist heute `no-skill`; mehr Stationstage ändern das kaum | groß | eigene Phase |
| 9 | ICON-D2-RUC (Befund 4), CH-Member (17), zeitversetztes Ensemble (20), Strahlung (21) | hängen am Takt bzw. an der Größe des Cubes | groß | nach Rang 3 |

Nicht weiterverfolgen: Druckflächen- bzw. Nachbarzellen-Gradient am 2-m-Punkt (Befund 7, AP15 gemessen), bilinear →
kleinstes Δh (Befund 11, schon weicher umgesetzt), gestutzte Normal am Stationswert (Befund 18, §4.4).

## 6. Open-Meteo zur Laufzeit (Hinweis des Berichts zur Lizenz)

buscosun Fusion ruft Open-Meteo nicht. Die kostenlose API wird an 14 Stellen anderer Funktionen benutzt:
`src/wind/openMeteoSource.ts`, `src/sources/openMeteoForecast.ts`, `src/confidence/{multiModel,ensemble,precipGrid,hitRate,forecastHistory}.ts`,
`src/history/{historySource,meteostatSource}.ts`, `src/fire/detail/{fireWeatherAtPoint,fireProfileLoad}.ts`,
`src/sources/openMeteoPollen.ts` (Opt-in), `src/pointForecast/sampleSources.ts` (Opt-in), `src/qa/layerQA.ts` (nur Dev).
Welche davon ohne Opt-in laufen, ist nicht einzeln nachverfolgt (V-EX-12). Für eine Monetarisierung ist das die Liste.

## 7. Befunde und Entscheidungen

| ID | Befund / Verbesserung | Mehrwert | Skizze | Stand |
|---|---|---|---|---|
| V-EX-1 | Terminregister ohne Zustand „erledigt"; ein verstrichener Termin hielt den Punkt-Cron an | der Cube altert nicht mehr wegen eines Kalendereintrags | `resolved { on, evidence }`, Gate verlangt beides | **erledigt, gepusht** |
| V-EX-2 | Gitterwechsel ICON-EPS / ICON-EU-EPS | σ_ens bleibt nach dem 06.10. da | `probe-eps-grid.mjs` gegen den DWD-Testlauf | **erledigt** (lesbar); Job-Dauer ansehen |
| V-EX-3 | RV nur im Altformat gelesen | Regenradar DE und Nowcast-Member überleben den 20.10. | §3.3 | **erledigt, eingeschaltet 30.09.** (Jans Freigabe) |
| V-EX-4 | DWD-URL-Schema und reguläres Gitter enden am 30.11. | Wetterkarte und Cube überleben den 30.11. | §3.5 | offen (E-EX-5) |
| V-EX-5 | „MeteoSchweiz kündigt API an" hätte das Cron-Gate am 30.12. angehalten | — | `informational: true` | **erledigt, gepusht** |
| V-EX-6 | gelernte Tabellen ohne Altersprüfung | ein veralteter Fit wird genannt statt still benutzt | Leser vergleicht `period.to` mit der Uhr, Notiz im Produkt | offen |
| V-EX-7 | Spread/Skill als Mittel der σ; DM ohne Kleinstichproben-Korrektur; Bootstrap ohne Blöcke | Sterne und Bandbreiten-Urteile halten bei 13 Tagen | §4.2 | **erledigt** |
| V-EX-8 | gelernte Varianz benutzt σ_ens, gefittet auf IFS-ENS; der Client speist ICON-EPS | — | im Nachfit je Quelle ein eigener Koeffizient oder σ_ens je Quelle normieren | offen |
| V-EX-9 | `fetchRyLatest` endet am 20.10. | — | entfernen oder portieren, sobald es einen Aufrufer gibt | offen |
| V-EX-10 | Altformat-Rückfall nach dem 20.10. entfernen | zwei Anfragen weniger je Fehlgriff | `rvFormatOrder` auf `['hdf5']` | offen, nach dem Stichtag |
| V-EX-11 | Bild-Gate gegen die längere Ableitung prüfen | kein 404 am CDN-Rand | `radar/status.json` lesen (`deriveMs`, `pushedAt`) | offen, nach dem Einschalten |
| V-EX-12 | Open-Meteo-Aufrufe ohne Opt-in nicht einzeln belegt | Lizenzlage vor Monetarisierung | je Aufrufstelle den Auslöser nachlesen | offen |
| V-EX-13 | zwei zeitabhängige Prüfungen in `verify:point-client` — (10r) Ringsuche ≤ 30 ms, (10s) „z0mod kommt nach dem Kern" — fallen unter Last durch, auch an unverändertem HEAD (2/2 Läufe bei 86 % CPU) | ein roter Verifier bedeutet wieder etwas | (10s) an der Reihenfolge der Ausgaben festmachen statt an 120 ms Wartezeit | offen |

| ID | Entscheidung für Jan | Empfehlung |
|---|---|---|
| E-EX-1 | Ensemble-Mittel als Zentralwert in t3 messen (kehrt V-PD-9 für t3 um, wenn es trägt) | ja, zuerst nur messen |
| E-EX-2 | ICON-D2-RUC: stündlicher t1-Cron? | erst nach der Schema-Umstellung |
| E-EX-3 | MOSMIX_S für 0–24 h ins Stationsprodukt | ja, nach den Fristen |
| E-EX-4 | Klimagitter (HYRAS, SPARTACUS, MeteoSwiss) statt `climaGrid.json` als Motor-Prior | mit E-FX-4 zusammen entscheiden |
| E-EX-5 | Phase „NS" (DWD-Schema): Start und Reihenfolge | Diagnose Anfang Oktober, Producer zuerst |
| E-EX-6 | RV in RADOLAN-Einheiten (wie bisher) oder in den feinen Werten | RADOLAN-Einheiten; die feinen Werte als eigene Änderung mit Bildvergleich |
| E-EX-7 | GeoSphere v2 unter eigener Kennung (`claef`) im Live-Pfad und in der Karte | ja, vor dem 04.11. |
| E-EX-8 | totalJs 1 451,2 → 1 455,5 (mit E-FL-11/E-FS-6) | bestätigen |

## 8. Selbstverifikation

1. **Funktionserhalt:** kein Aufrufer geändert, keine Funktion entfernt; der Bild-Weg des Radars unberührt; der
   Rohweg liefert dieselben 25 Frames (Browser, §3.3); das Altformat bleibt bis zum Stichtag der Rückfall.
2. **Desktop pixelgleich:** keine UI-Datei angefasst (kein CSS, keine Komponente). Die Radar-Frames sind in 98,5–99 %
   der nassen Zellen byte-gleich, sonst ±2 Byte-Stufen — gemessen, nicht pixelverglichen (kein Real-Device-Lauf).
3. **Touch-Targets:** nicht berührt.
4. **Konsole:** die Log-Zeile des Niederschlag-Layers nennt jetzt den Dateinamen der gelesenen Lieferform; keine neuen
   Warnungen im Browser-Lauf.
5. **Long Tasks:** die HDF5-Dekodierung läuft im Worker; in headless nicht messbar (bekannte Grenze).

**Nicht gemessen:** Real-Device; der Spiegel am GitHub-Runner; die Job-Dauer nach dem Gitterwechsel; `npm run build`
als Ganzes im Hauptarbeitsbaum (dort schlägt `tsc` an Dateien der parallelen Dashboard-Phase fehl — im sauberen
Arbeitsbaum `tsc` 0 Fehler, `vite build` grün).
