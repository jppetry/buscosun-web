# FUSION_VERIFICATION — Wie stark ist buscosun Fusion wirklich? (Phase 4)

> Stand **2026-09-07**. Ergänzt `audit/punktvorhersage-14tage/verifikation.md` und
> `retro-verifikation.md` (beide 2026-09-05) um das, was das Audit (`FUSION_AUDIT.md`)
> konkret verlangt: welche Vergleiche **heute** möglich sind, was dafür im Repo liegt, welche
> Stichprobe für eine belastbare Aussage nötig ist — und wo die Engine voraussichtlich
> **nicht** gewinnt. Alles Umsetzbare ist als Harness-Schritt formuliert (D-10: kein
> Test-Framework, `scripts/verify-*.mjs`).

---

## 0. Die Antwort vorweg

> **Nachtrag 2026-09-07 — V-A₁ ist gebaut und gelaufen** (`npm run verify:pv-score`, §9.2). Erster
> Schnappschuss über 111 DE-Stationen, 8 MOSMIX_L-Läufe, 25 Zielstunden eines trockenen Tages:
> Fusion-T = MOSMIX ± 3 % MAE, aber **zweifach überkonfident** (Spread/Skill 0,5–0,6, PIT-Ränder
> 0,42–0,51) ⇒ Kalibrierungs-Gate verletzt; Wind **+0,23…+0,35 m/s Bias**, schlechter als MOSMIX;
> Td/Böe zu breit; K-1-Fix an 435 Fällen belegt (0,13–0,15 K); **Altpfad bei 1–6 h 2,3× schlechter
> als rohes MOSMIX** (Produktdefekt V-PV-19). Zahlen und Lesart:
> `audit/punktvorhersage-14tage/implementierung-pv3.md` §11.

**Aus dem Code allein ist der Skill nicht bestimmbar.** `verify:pv-fusion` (167/167) prüft
die Kette gegen ihre eigenen Priors, nicht gegen die Atmosphäre. Was gemessen werden kann,
sobald PV2 läuft, in drei Stufen:

| Stufe | Frage | Wahrheit | Referenzen | Verfügbar ab |
|---|---|---|---|---|
| **V-A Nachrechnen** | Ist die Engine bei 0–24 h besser als ihre eigenen Quellen? | Stationsmessung (DWD POI/CDC, GeoSphere, SMN) | rohes MOSMIX, AROME, INCA, Radar, Persistenz, **heutige `getPointForecast`** | **sofort** — Quellen sind 15–48 h rückwirkend abrufbar, die Rechnung ist pur (D-12) |
| **V-B Hindcast** | Schlägt sie Klimatologie, Persistenz, IFS/GEFS bei 24–336 h? | dito | ECMWF Open Data (S3 ab 2023-01-18), GEFS (S3 ab 2024-01-01), Klimatologie, Persistenz | **sofort**, ≥ 2 Jahre — aber **ohne MOSMIX/ICON** als Eingang (kein Archiv) ⇒ nur der GFS/IFS-Zweig der Engine ist so testbar |
| **V-C Prospektiv** | Schlägt sie MOSMIX an und abseits der Station? | dito | MOSMIX_S/L, ICON-D2 DMO | **frühestens 12 Monate** nach Start einer Scorecard-Speicherung (J-7); ohne Archiv nie |

Die ehrliche Reihenfolge: **V-A zuerst**, weil sie ohne ein gespeichertes Byte die Befunde
K-1 (Obs-Anker), K-2 (Niederschlag) und H-5 (Messalter) in Zahlen übersetzt.

---

## 1. Wahrheit

**Ausschließlich Stationsmessungen**, nie ein anderes Modell, nie eine Reanalyse, nie der
Modell-Analysen-Konsens (der heute in `src/confidence/hitRate.ts:8-10` als „Ground Truth"
dient — für eine Engine, die bei h = 0 auf Messungen verankert ist, systematisch verzerrt).

| Land | Quelle | Takt | Reichweite | Lizenz | Zugang | Beleg |
|---|---|---|---|---|---|---|
| DE | DWD POI `weather_reports/poi` (974 Stationen, 42 Parameter inkl. Wolken, Böen, Sonnenschein) | 1 h | 24-h-Rollfenster | CC BY 4.0 | kein Key, kein CORS ⇒ Actions | `datenquellen-matrix.md` §2 (M-06) |
| DE | DWD CDC stündlich `recent`/`historical` (503 Stationen T; Wind, RR, RH, Bewölkung getrennt) + 10-min `now` | 1 h / 10 min | 500 Tage / seit 1881 | CC BY 4.0 | kein Key ⇒ Actions | M-07 |
| AT | GeoSphere `klima-v2-1h` (823 Stationen, `*_flag`) und `tawes-v1-10min` | 1 h / 10 min | 1880 → jetzt | CC BY 4.0 | kein Key; 5 req/s · 240 req/h je IP ⇒ Batch | M-18 |
| CH | MeteoSchweiz OGD-SMN (STAC, `_h_now/_h_recent/_h_historical`) | 1 h (+10 min) | ab 1980er | CC-BY | CORS `*`, kein Key | M-19 |

**Zwei Stände** (as-of vs. final, `retro-verifikation.md` §3) sind Pflicht, sobald die
Engine Messungen als **Eingang** nutzt: Eingang = ungeprüfter Rollfenster-Stand, Wahrheit =
qualitätsgeprüfter Endstand. Für V-A ist das automatisch erfüllt (Eingang = POI/TAWES/SMN
zum Zeitpunkt t₀, Wahrheit = dieselben Netze ≥ 6 h später, geprüft).

**Repräsentativität der Wahrheit:** eine Station misst 2 m über Rasen im Messfeld, 10 m Wind
auf freiem Gelände. Für Anspruch B („abseits der Station") ist das die einzige Wahrheit, die
es gibt — deshalb stationsweise Kreuzvalidierung (§5.3), keine „Punkte ohne Station".

---

## 2. Referenzen (Baselines)

Pflicht in **jedem** Bin. Ein Skill Score gegen den Durchschnitt ist wertlos; verglichen
wird gegen die **jeweils beste Einzelquelle des Bins** (§6).

| Referenz | Was genau | Fairness-Regel | Verfügbar |
|---|---|---|---|
| **heutige `getPointForecast` (Altpfad)** | derselbe Aufruf ohne `distribution`; deterministisch ⇒ CRPS = MAE | Amtsinhaber; Pflicht laut `verifikation.md` §7.0 | sofort |
| **rohes MOSMIX** | nächste Station, MOSMIX_S (stündlich) **und** MOSMIX_L; an der Station selbst (Anspruch A) und höhenkorrigiert interpoliert (Anspruch B) | dieselbe Lapse-Korrektur wie die Engine, sonst Strohmann | live 48 h rückwirkend; Archiv nur prospektiv |
| **ICON-D2 DMO** | nächster Gitterpunkt, höhenkorrigiert mit `hsurf` | dito; **im Punktpfad nicht verdrahtet** — der Vergleich zeigt, was das Weglassen kostet | live 24 h (8 Läufe); Repack-Spiegel im Daten-Repo |
| **ICON-EU DMO** | 7 km, 120 h | dito | live |
| **IFS HRES 0,25°** (ECMWF Open Data) | bilinear + Lapse | dito | S3 ab 2023-01-18 |
| **AROME / INCA** (AT/CH) | wie im Pfad | — | live 15 h (AROME) / jetzt (INCA) |
| **RADOLAN-RV / INCA-Grid / rzc** | Nowcast 0–2(3) h Niederschlag | — | live; `radarHindcast.ts` als Muster |
| **Persistenz** | letzter Messwert; **Anomaliepersistenz** (Klimatologie(h) + [Obs − Klimatologie(t₀)]) getrennt — das ist die Referenz, die K-1 entlarvt | — | sofort |
| **Klimatologie** | (a) der Engine-Prior selbst (`climaGrid` + Kosinus-Tagesgang), (b) eine stündliche Klimatologie aus CDC/`klima-v2-1h` | (a) misst den Prior, (b) misst das Ende | (a) sofort, (b) Bau nötig |
| **GEFS-Mittel + Spread** | 0,5°, `geavg`/`gespr` | Ensemble-Referenz am langen Ende | S3 ab 2024 |

---

## 3. Metriken

| Größe | Metrik | Warum |
|---|---|---|
| alle stetigen | **MAE, RMSE, Bias** (getrennt!) je Bin | Bias ist die Diagnose für K-1/H-1/H-3; RMSE versteckt ihn |
| alle mit Verteilung | **CRPS** (`dist.ts:298-305` `crpsOf`, für normal geschlossen `crpsNormal`) + **CRPSS** gegen die beste Einzelquelle | strikt proper; für Punktvorhersagen = MAE, also vergleichbar |
| Kalibrierung (**gate-blockierend**) | **PIT-Histogramm** (`dist.ts:313-326` `pitOf`, mit Atomen) je Variable × Bin, Cramér-von-Mises gegen Gleichverteilung; **Spread-Skill** σ̄/RMSE ∈ [0,85; 1,20]; **Reliability** für P(Schnee), P(nass) | ein CRPS-Gewinn bei kaputter Kalibrierung wird nicht ausgeliefert (D-04) |
| Niederschlag | **Brier + BSS** an 0,1 / 1 / 5 / 10 mm/h (und 6-h-Summen), **Reliability-Diagramm** mit Zerlegung, **ROC/AUC** je Schwelle; zusätzlich **Mengen-Quantil-Score** (Pinball q50/q90 nur an nassen Stunden) | K-2 zeigt sich als Reliability-Kurve unter der Diagonale bei hohen Vorhersagewahrscheinlichkeiten und als negativer Bias der Mengen |
| Wind/Böe | wie stetig + Brier an 10/15/20 m/s Böe | Sicherheitsbezug |
| Bewölkung | MAE + Brier an < 25 % / > 75 % | bimodal, MAE allein täuscht |
| Phase | Brier + Reliability für P(Schnee) gegen Beobachtung (`ww`/Schneehöhe-Zuwachs, DWD POI `present_weather`) | eigene Aussage der Engine |
| Signifikanz | **Diebold-Mariano** auf den paarweisen Score-Differenzen mit **HAC** (Newey-West, Bandbreite ⌊1,5·n^{1/3}⌋); **Block-Bootstrap** über ganze Tage/Läufe (Block ≥ 3 Tage), gepaart; **Benjamini-Hochberg FDR 5 %** über alle Bins | Score-Reihen sind über Leads und Tage autokorreliert |

**Im Repo vorhanden:** `crpsOf`/`crpsNormal`/`pitOf`/`quantileOf` (`dist.ts`), `brier`,
`reliabilityBins`, `expectedCalibrationError`, `crpsEnsemble`, `rmse`, `mae`, `csi`
(`src/ml/metrics.ts:25-136`), `isotonic.ts` (PAV), LOYO-CV der Klimatologie
(`climatology.ts:139-165`), `radarHindcast.ts`.
**Fehlt:** Diebold-Mariano/HAC, Block-Bootstrap, PIT-Histogramm-Statistik, Spread-Skill,
Stratifikator, Bin-Aggregation, Manifest — das ist `verify:pv-metrics` (WP 2.1 in
`implementierungsplan.md`), mit analytischen Fällen und ≥ 3 Negativkontrollen.

---

## 4. Aufschlüsselung

| Achse | Bins | Herkunft |
|---|---|---|
| Lead | **0–6 h · 6–48 h · 2–7 d · 7–14 d**, zusätzlich fein 0/1/2/3/6/12/24/48/72/120/168/240/336 für die Übergänge (Station→MOSMIX bei 2–5 h, Radar→Modell bei 1–3 h, MOSMIX-Auslauf 222–246 h) | Vorgabe + Regimegrenzen aus `FUSION_AUDIT.md` §1.3 |
| Variable | T, Td/RH, Wind, Böe, RR-Wahrscheinlichkeit, RR-Menge, Bewölkung, P(Schnee) | `FusedPoint` |
| Höhenband | < 300 · 300–800 · 800–1500 · > 1500 m (**≥ 15 Stationen je Band**; `climaGrid` hat nur 6 über 1500 m — die Wahrheit muss aus CDC/GeoSphere kommen, nicht aus dem Prior-Netz) | `verifikation.md` §5 |
| Geländeklasse | Talboden / Hang / Kamm / Flachland aus TPI (`terrainScale.ts:138-148`, dieselbe Rechnung wie in der Engine — Zirkularität ist hier erwünscht: die Klasse ist Prädiktor **und** Stratum) | DEM |
| Tageszeit | Nacht (Sonne < −6°) / Morgen (Anstieg) / Tag / Abend (Abfall) aus `solarPosition` | K-1 ist ein Tageszeit-Effekt |
| Jahreszeit | DJF / MAM / JJA / SON | — |
| Land | DE / AT / CH (verschiedene Quellensätze!) | `pointForecast.ts:229-263` |
| **Wetterlage** | s. u. | — |

**Wetterlagen-Stratifizierung, operationalisiert aus Beobachtungen (nie aus der Engine selbst):**

| Regime | Erkennung | Datenbasis |
|---|---|---|
| **Föhn** | Alpen-Nordseite (lat ≤ 48,2°): Stationswind aus 135–225°, FF ≥ 5 m/s, RH ≤ 40 %, N–S-Druckdifferenz (Innsbruck–Bozen bzw. Altdorf–Lugano) ≥ 4 hPa — ohne `foehnDetector.ts` (der ist Teil der Engine) | GeoSphere/SMN-Stunden + Druck |
| **Inversion / Kaltluftsee** | Tal–Berg-Stationspaar (Δz ≥ 500 m, Distanz ≤ 30 km) mit T_Tal < T_Berg − Δz·0,002 (d. h. Gradient < 2 K/km oder negativ), Nacht, FF_Tal < 2 m/s | Paare aus CDC/`klima-v2-1h` |
| **Konvektion** | ICON-D2 `cape_ml` ≥ 500 J/kg (Repack-Familie vorhanden) **und** beobachtete Stunde mit RR ≥ 2 mm/h oder `present_weather` Gewitter | ICON-D2-Spiegel + POI |
| **Nebel/Hochnebel** (nicht verlangt, aber der größte DACH-Winterfehler laut `implementierung-pv3.md` §7.4) | Sicht < 1 km oder Bewölkung 8/8 tief + RH ≥ 95 % | POI |
| **Sturm** | Böe ≥ 20 m/s beobachtet | POI/TAWES/SMN |

Regel: **das Gesamtergebnis wird nie ohne Stratifikation berichtet**; ein Gewinn im Mittel
mit Verlust im Föhnfall ist ein Verlust.

---

## 5. Splits — Trainings- und Verifikationszeiträume

Solange die Engine **nichts fittet** (heute: alle Parameter Priors), gibt es keinen
Trainingszeitraum und der ganze Rückblick ist Test. Sobald PV2/PV3 Parameter fitten
(ρ(τ), α, σ_rep-Koeffizienten, Korrelationen), gilt:

1. **Zeitlich**: zusammenhängende Blöcke Train/Validation/Test, Test ≥ 12 Monate (alle
   Jahreszeiten), ≥ 5 Tage Puffer, **walk-forward** monatlich (`retro-verifikation.md` §1).
   Kein Shuffle über Stunden.
2. **Stationsweise (Anspruch B)**: k-fach Kreuzvalidierung mit **räumlich geblockten**
   Folds (zusammenhängende Regionen, sonst misst man Interpolation), plus **Höhen-Fold**
   (alle Stationen > 1500 m raus, dort testen).
3. **As-of**: nur Läufe mit Publikationszeit ≤ t₀ (S3 `LastModified`; für Live-Quellen die
   in `audit/bandbreite.md` §31.18 gemessenen Latenzen: ICON-D2 Schritt 004 bei Lauf+50 min,
   MOSMIX_L +73 min), Messungen nur mit Zeitstempel < t₀ **im damaligen Stand**.
4. **Negativkontrolle Pflicht**: ein Lauf, der absichtlich Messungen von t₀ + 1 h einspeist,
   **muss** einen unplausibel guten h = 1-Score liefern; sonst prüft der Leck-Wächter nichts.
5. **Klimatologie**: nur aus Jahren vor dem Testzeitraum; `climaGrid.json` (1995–2024)
   überlappt mit jedem Test ab 2023 ⇒ für den Hindcast neu bauen bis 2022.
6. **Modellversionen**: Versionswechsel (ICON, IFS, AIFS, MOSMIX-Verfahren) sind
   Blockgrenzen; Ergebnisse je Version stratifizieren.

---

## 6. Skill Score gegen die beste Einzelquelle

$$\mathrm{CRPSS}_{\text{Bin}} = 1 - \frac{\overline{\mathrm{CRPS}}_{\text{Fusion}}}{\min_m \overline{\mathrm{CRPS}}_m}$$

mit $m$ über **alle** Referenzen des Bins (§2), jede mit derselben Höhenkorrektur. Für
deterministische Referenzen ist CRPS = MAE; dann wird **zusätzlich MAE gegen MAE** berichtet,
weil eine kalibrierte Verteilung gegen einen Punktwert bei Nullskill **allein aus der
Verteilung** 29,3 % CRPS gewinnt (`mathematik-spezifikation.md` §1.3, im Verifier
nachgerechnet: 0,70710). Ein CRPSS > 0 bei MAE-Verlust ist kein Vorsprung des
Algorithmus, sondern der Darstellung.

Zwei Ansprüche getrennt (`verifikation.md` §1): **A** an der MOSMIX-Station gegen MOSMIX
derselben Station; **B** abseits (Stationen-CV) gegen interpoliertes MOSMIX.

---

## 7. Stichprobengröße — ab wann ist ein Unterschied signifikant?

Score-Differenzen sind stark autokorreliert; unabhängig sind grob **Wetterlagen** (≈ 1 je
2,5 Tage) × **räumlich unabhängige Stationscluster** in DACH (≈ 15; Dekorrelation der
T-Anomalie ≈ 60 km, `priors.ts:299`). Daraus:

$$n_{\text{eff}} \approx \frac{\text{Tage}}{2{,}5}\times 15 \quad\Rightarrow\quad \text{1 Monat} \approx 180,\; \text{1 Jahr} \approx 2\,200 \text{ je Lead-Bin}$$

Für die paarweise CRPS-Differenz $d$ mit Variationskoeffizient $c = \mathrm{sd}(d)/\overline{\mathrm{CRPS}}$
(empirisch für T2m ≈ 0,3–0,5) ist ein CRPSS $\Delta$ auf 5 % zweiseitig nachweisbar, wenn

$$n_{\text{eff}} \;\ge\; \left(\frac{1{,}96\,c}{\Delta}\right)^2 .$$

| Ziel-CRPSS | c = 0,3 | c = 0,5 | Bedeutung |
|---|---|---|---|
| 10 % | 35 | 96 | **1–3 Wochen** — reicht für V-A (Übergänge 0–6 h, K-1) |
| 5 % | 138 | 384 | **1–2 Monate** |
| 3 % | 384 | 1 070 | **2–6 Monate** |
| 1 % | 3 460 | 9 600 | **1,5–4,5 Jahre** — realistische Größenordnung eines Gewinns gegen MOSMIX an der Station |

Konsequenzen: (1) **Bins nach Jahreszeit × Höhenband × Lead** vervielfachen die Tests — ohne
FDR-Korrektur „gewinnt" man bei 200 Bins zufällig in zehn; (2) ein Gewinn von 1–2 % gegen
MOSMIX (Anspruch A) ist **mit einem Jahr Daten nicht belegbar** und wird in diesem Zeitraum
weder behauptet noch dementiert; (3) Extremklassen (Föhn ~ 30–60 Ereignistage/Jahr an der
Alpennordseite, Sturm ~ 10–20) haben je Jahr $n_{\text{eff}} \lesssim 50$ — dort sind nur grobe
Effekte (≥ 15 %) nachweisbar, und genau dort muss die Engine **nicht verlieren**
(Nicht-Unterlegenheits-Test mit Schranke, nicht Überlegenheitstest).

---

## 8. Was heute im Repo dafür existiert — und was fehlt

| Baustein | Vorhanden | Fehlt |
|---|---|---|
| Metriken | `metrics.ts` (Brier, Reliability, ECE, CRPS-Ensemble, RMSE, MAE, CSI), `dist.ts` (CRPS je Familie, PIT mit Atomen, Quantile) | DM/HAC, Block-Bootstrap, PIT-Teststatistik, Spread-Skill, FDR |
| Harness-Konvention | `scripts/verify-*.mjs`, `register-ts.mjs`, Exit ≠ 0, Negativkontrollen (SAT2h-Lehre); **`verify:pv-score` (V-A₁, 2026-09-07)** mit DM/HAC, Block-Bootstrap, PIT, Spread-Skill, Brier/Reliability, Leck-Wächtern, Scorecard-JSON | `verify:pv-metrics` (analytische Selbstprüfung der Statistik), Manifest mit Daten-Hashes, Lückenanteil |
| Wahrheitsleser | **DWD POI (24 h, 111 DE-Stationen mit WMO-Kennung aus `climaGrid`)** in `verify-pv-score.mjs` | CDC-Stundenleser (WMO↔DWD-Kennung), GeoSphere `klima-v2-1h`, SMN, zwei Stände |
| Referenzleser | `ecmwfIfsSource.ts` (`.index`-Range), `gfs.ts`/`gfsPoint.ts` (`.idx`-Range), ICON-D2-Repack-Spiegel, `radarHindcast.ts`; **MOSMIX_L-KMZ-Leser (8 Läufe, as-of)** | ICON-D2-Punktleser mit `hsurf`, AROME-Reftime-Leser |
| Engine-Rechnung rückwirkend | `fuseHour`/`computeDistributions` sind pur und laufen im Harness mit echtem DEM und Klimatologie; der **Altpfad wird repliziert** (`blendVariable` + Terrainzuschlag), weil `getPointForecast` `Date.now()` an 8 Stellen trägt | t₀-Parameter durch die Adapter, damit auch Radar/INCA/AROME as-of laufen |
| Kalibrierprüfung der Engine | `verifyFuse` mit fester Klimatologie | Fixtures mit **stundenvariabler** Klimatologie (macht K-1 im Gate sichtbar) |
| Archiv | keines; Daten-Repo pruned (`REPACK_KEEP`) | Scorecard-Speicher (J-7): je Lauf ≈ 220 KB Vorhersagen an ~250 Stationen, 4 Tage Haltezeit, Noten dauerhaft (~0,7 MB/Jahr) — **STOPP & FRAGEN** (neuer Cron) |
| Ground Truth im Produkt | `hitRate.ts` = Modell-Analysen-Konsens (Open-Meteo, NC) | Umstellung auf Messungen (PV4.2) — ohne sie darf buscosun Fusion dort nicht erscheinen |

---

## 9. Konkretes Setup, umsetzbar

### 9.1 `verify:pv-metrics` (WP 2.1) — Werkzeugprüfung, netzfrei

- CRPS-Normal = `crpsOf` (existiert, `dist.ts` Verifier) · 1/√2-Identität · PIT flach für
  N(0,1)-Ziehungen, **nicht** flach für σ×1,5 (Negativkontrolle) · DM/HAC: zwei AR(1)-Reihen
  mit bekannter Differenz ⇒ p-Wert im Sollband; gleiche Reihen ⇒ p ≈ U(0,1) · Bootstrap:
  Intervallüberdeckung 95 % ± 2 % auf 500 Wiederholungen · FDR: 200 Nullbins ⇒ ≤ 5 % Entdeckungen.
- Deterministischer Seed (D-12: kein `Math.random` ohne Seed-Parameter).

### 9.2 `verify:pv-score --mode nachrechnen` (V-A) — sofort

1. Für jede volle Stunde t₀ der letzten 15 h (AT/CH) bzw. 24 h (DE): Eingaben **as-of t₀**
   holen — MOSMIX (Verzeichnis, 48 Läufe), AROME (`available_forecast_reftimes`), ICON-D2
   (8 Läufe), POI/TAWES/SMN-Stand ≤ t₀, Radar-Analysen ≤ t₀ (`radarHindcast`-Muster).
2. `getPointForecast`-Kette **mit t₀-Parameter** an N Stationen (Start: 60 DE + 30 AT + 30 CH,
   je Höhenband ≥ 10) rechnen: Altpfad, Fusion, rohe Einzelquellen, Persistenz,
   Anomaliepersistenz, Klimatologie.
3. Wahrheit: dieselben Stationen, Endstand, t₀ + h für h = 1…15/24.
4. Scores je Bin, DM-Test gepaart, Bootstrap über t₀-Tage; Ausgabe als Tabelle + Manifest.
5. Negativkontrollen: (a) Leck-Kontrolle (§5.4), (b) Engine mit `clima: null` muss sichtbar
   schlechter werden (K-3), (c) Obs-Anker mit vertauschter Tageszeit (K-1) muss auffallen.

**Erwartete erste Ergebnisse** (Vorhersage aus dem Audit, nicht Messung): Fusion T bei
h = 1–3 **schlechter** als Anomaliepersistenz + MOSMIX (K-1, Bias mit Tageszeitvorzeichen);
Fusion RR-Menge bei h = 3–24 **schlechter** als rohes MOSMIX/AROME, P(nass) unterkalibriert
(K-2); Fusion T bei h = 6–24 ≈ MOSMIX (Ein-Quellen-Fall), an Talstationen bei Nacht evtl.
besser (Mikroklima); Wind in Tälern besser (Abschirmung), auf Kämmen unklar.

### 9.3 `verify:pv-score --mode hindcast` (V-B) — 2023-01-18 bis heute

Nur der Zweig mit archivierten Eingängen: IFS HRES (statt GFS) + GEFS-Mittel/Spread +
Klimatologie + Stationen. Misst (a) das lange Ende (7–14 d), (b) ob die ρ-Kurven der
`global`-Familie stimmen (ACC direkt aus den Paaren schätzen ⇒ erster gefitteter Parameter),
(c) den Prior-Fehler der Klimatologie (M-2: stündliche vs. Tagesmittel-σ, Kosinus-Tagesgang).
Leseweg in Actions (kein Kopieren, nur DACH-Extraktion cachen, `implementierungsplan.md` WP 2.3).

### 9.4 Scorecard prospektiv (V-C) — nur nach J-7

Je MOSMIX-Lauf (4×/Tag): Fusion + Altpfad + rohe Quellen an ~250 DACH-Stationen für die
Leads 1…246 h als kompaktes Binärformat (~220 KB), 4 Tage Haltezeit, danach nur Noten.
Nach 12 Monaten: Anspruch A und B gegen MOSMIX, stratifiziert; vorher nur „vorläufig".

---

## 10. Wo die heutige Konstruktion voraussichtlich **nicht** gewinnt

Ehrliche Prognose aus dem Code, zu falsifizieren durch §9:

| Bin / Fall | Warum die Engine dort nicht besser sein kann | Beleg |
|---|---|---|
| **T an MOSMIX-Stationen, 6–246 h (Anspruch A)** | Einzige Quelle ist MOSMIX selbst (DE); die Engine addiert nur Schrumpfung (H-1: doppelt) und Geometrie (an der Station ≈ 0). Bestenfalls Gleichstand, vor der H-1-Korrektur systematisch **schlechter** im Mittelfristbereich. | `FUSION_AUDIT.md` §1.3, H-1, Sonde K |
| **T 0–5 h mit nahem Stationsanker** | K-1 erzeugt einen tageszeitabhängigen Bias von 0,5–1,4 K — mehr als der MAE von MOSMIX bei +3 h. Bis zur Korrektur verliert die Engine gegen „MOSMIX + Anomaliepersistenz". | Sonde A |
| **RR-Menge, alle Leads; P(nass) ab 3 h** | K-2: lineare Schrumpfung zur Trockenheit. Rohes MOSMIX/AROME/ICON-D2 gewinnt bei Mengen; Radar gewinnt bei 0–2 h (die Engine dämpft sogar das Radar: 5 mm/h ⇒ Median 2,3). | Sonde B |
| **7–14 d gegen IFS HRES / ENS-Mittel** | Einzige Quelle ist GFS 1° ohne Höhenkorrektur (H-3); IFS 0,25° ist deterministisch besser, das ENS-Mittel deutlich. Der einzige Gewinn ist die Verteilung (29 % CRPS gegen Punktwert), die ein Ensemble ebenfalls hat. | `gfsPoint.ts`; `datenquellen-matrix.md` §1 |
| **Bewölkung** | keine Beobachtung (BrightSky-Wolken bewusst `null`), kein Satellit, erfundene Schichten; nur MOSMIX-Gesamtbedeckung mit ρ-Prior. | `brightSkyCurrent.ts:153-162` |
| **Föhn** | nur Aufweitung, keine Bimodalität; Score aus dem **Altpfad-Blend** (`attach.ts:133-140`), nicht aus einem Modell. Gegen AROME/ICON-CH1 (die Föhn explizit rechnen) keine Chance. | `implementierung-pv3.md` §7.3 |
| **Wind auf Kämmen / in Tälern (AT/CH) gegen ICON-CH1** | 1-km-Modell mit eigener Orografie schlägt eine TPI-Faustformel auf einem 2,5-km-Modell. | `priors.ts:334-338` |
| **Hochnebel/Nebel im Winter** | kein Term. | `implementierung-pv3.md` §7.4 |

Wo sie gewinnen **kann** (und der Test das zeigen müsste): T an **stationslosen** Punkten in
komplexem Gelände (σ_rep, Lapse aus Stationen, Kaltluftsee) gegen interpoliertes MOSMIX;
T bei 0–5 h **nach** K-1-Korrektur; Wind in tiefen Tälern (Abschirmung auf dem Mittel);
das lange Ende gegen deterministische Referenzen via Verteilung; die Phase (Feuchtkugel
über die Verteilung) gegen Trockentemperatur-Schwellen.
