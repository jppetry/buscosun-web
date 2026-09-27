# Phase FX — buscosun Fusion jenseits des Lehrbuch-Post-Processings (Forschungsiteration)

**Stand:** 2026-09-26 · **Status:** Diagnose, Plan, Stufen FX-1…FX-3 fertig (uncommitted, Gates grün, §6); Motor-Punkte und Client-Produkt = Jans Gates (§8) · **Linie:** Fortsetzung von
FL (`audit/fusion-lernphase.md`, Referenz **Scorecard 4** = `fit\2026-09-25-ap8c` / `score\2026-09-25-ap8c`, `fusionFit@3`) ·
**Belege dieser Phase:** `audit/fusion-forschung/` (`diag-fx1.{mjs,json,md,log}` — Fehleranalyse out of fold über 3,4 M Fallzeilen;
Berichte der vier Rollen und der Adversarial-Review als Rohdaten in der Session-Ablage).

> Jans Auftrag (25.09.): Scorecard 4 messbar schlagen, mit Vorrang (1) langer Vorlauf 126–336 h, (2) Standortabhängigkeit,
> (3) Niederschlag jenseits 0–6 h, (4) T/Td-Plateau. Annahmen und etablierte Formeln hinterfragen und **nur mit Messung** ersetzen.
> Team: Mathematiker/Statistiker, Atmosphärenphysiker, Klimatologe, Adversarial-Reviewer, dazu ein Diagnose-Ingenieur (einziger
> Zugriff auf die Fallzeilen). Methode Diagnose → Plan → Implement → Verify → Gate; alles hinter Flags, ohne Option byte-gleich;
> Motor (`src/pointForecast/**`, `dist.ts`, `v2codec.ts`) = STOPP & FRAGEN.

## 0 Kurzfassung

- **Scorecard 4 selbst trägt drei Messfehler, keine Vorhersagefehler:** (a) der Spread der zensierten Normal wird als latente σ gelesen
  ⇒ die G-FL-2-Fehlschläge der Bewölkung ab 7 h sind **Scorer-Artefakte** (Tobit-sd/RMSE 0,93–0,96, PIT-Rand 0,14–0,18); (b) die
  Lauf-Route-Strata haben vier Monatsfalten, mit ±1-Monat-Purge trainiert die Juli-Falte auf 21 und die August-Falte auf 14 Tagen —
  **jede 7–48-h-Zahl** (Hürden-`no-skill`, V-FL-38 DE +2,8 %) ist damit gegen fl-K gehandicapt; (c) die Brier-Tabelle „Form P −6,0 %
  bei 25–48 h" verglich verschiedene Zeilenmengen — **like-for-like ist Form P dort nicht besser** (0,048 gegen 0,047).
- **Wind-Unterdispersion ist real, sitzt aber in den Bergen:** ≥ 800 m sd/RMSE 0,59–0,73 mit PIT-Rand 0,25–0,32; < 800 m 0,90 / 0,19–0,20.
  V-FL-42 ist widerlegt (der TN-Spread des Scorers war nicht zu klein, die wahre sd ist kleiner).
- **Langer Vorlauf:** fl-K fällt hinter die Stationsklimatologie beim Wind ab **105 h**, Böe 156 h, Td 234 h, Bewölkung 246 h, T 264 h.
  Mechanismus gemessen: die EMOS-Form schrumpft nicht auf die Klimatologie (T 246–336 h Steigung b der Anomalie 0,36 statt ≈ 1,
  Td 0,20; Wind ρ 0,03) — es fehlt die **Stationsklimatologie als Spalte** und das Ridge-Ziel β_cube = 1 hält sie fest. Die gepoolte
  Band|Land-Klimatologie taugt nicht als Ziel (Wind 1,219 gegen Station 0,916). Beim Wind reicht die Mittelwert-Mischung nicht: die
  Klimatologie gewinnt auch durch σ_c(h, doy) und die Familie.
- **Standortabhängigkeit des Windgesetzes:** ein konstantes a lernt zwei Dinge (Rice-Überschuss ∝ σ²/2ν und Talabschirmung); DE danach
  zu niedrig (−0,24…−0,40 m/s), AT zu hoch (+0,19…+0,37). Gruppen-Refits (Obergrenze) DE −1…−3 %, AT −3…−6 %, ≥ 1 500 m −6…−9 %; a UND
  b liegen am Gitterrand.
- **T/Td-Plateau ist ein Streuungs-, kein Mittelwertproblem:** bedingter Bias ≤ 0,3 K fast überall; Varianzverhältnis e²/σ² in DJF-Nächten
  1,4–1,9, bei starker Entkopplung 1,74, Windstille 1,24–1,39, klare Nacht 1,58, bedeckter Tag 1,81, klarer Tag 0,78. Dazu ein
  standortfester Rest (Je-Standort-Korrektur T −3…−6 % RMSE, braucht eine Station, enthält Regime-Persistenz).
- **Niederschlag:** die konvergierte K-Hürde ist in der Lauf-Route 0–6 h dem Cube gleich, in der Tag-0-Route −15 % Brier, bei t3 −3 %;
  das Mengenmodell ist kalibriert (q90-Abdeckung 0,896; Cube U-förmig). Am langen Ende trägt das Ensemble-q90 mehr als der Mittelwert.
  7–48 h: **kein Verdikt vor dem Winter-Nachfit** (95 Sommertage, 4 Falten).
- **Bauplan (Adversarial-Rang):** C1 Anomalieform mit Stationsklimatologie · C8 Halbmonatsfalten · M1+C5 Scorer-Maße · A1 Windgesetz
  (Gitter, Familie, Band-Verdikt) · M2 heteroskedastische σ per CRPS. Stufe 1 (C8, M1/C5) und Stufe 2 (C1 mit CV-gewähltem Ridge-Ziel, A1,
  Skalenregel) sind fit-/scorer-seitig gebaut (Flags, ohne Option byte-gleich; §6.1/§6.2); Motor-Berührungen (Anker-σ, neue Familien,
  Client-Kette) warten auf Jan (§8).
- **Ergebnis Scorecard 5b gegen Scorecard 4 (like-for-like, 6 805 912 Zeilen, §6.3):** T 246–336 h **−10,1 %** und erstmals signifikant besser als
  die Stationsklimatologie (+4,1 %*), Td −12,5 % (Klima-Niveau), Böe −4,8…−10,5 % je Bin (126–240 h gegen Klima +3,2 %*), Wind −3,6…−5,0 % je
  Bin mit DE −1,9…−5,7 % (V-FL-38 erledigt) und halbiertem Klima-Verlust am langen Ende (−4,1/−9,7 %!, Flachland gleichauf, ≥ 800 m −14/−17 %),
  T/Td 0–240 h −0,8…−3,5 %, Niederschlag ≥ Cube in jedem Bin (51–120 h +1,2 %*), Bewölkung 0–48 h **+1,0 %** (V-FX-25) und 246–336 h −2,4 %.
  Kreuzungsstunden: T keine, Td 312 h, Wind 144 h, Böe 222 h. Gilt an Stationspunkten; der Client braucht das Klimatologieprodukt (E-FX-1).
- **FX-4 (26.09., E-FX-1 gemessen, §6.4):** μ_c ist aus Standortmerkmalen schätzbar (Leave-Station-out an 389 Stationen: T 1,06 K, Td 0,68, Böe 1,31 m/s RMS gegen gepoolt 1,87 / 1,70 / 1,76; Wind 0,70 / 0,65 gegen 0,78 / 0,63 — Exposition steckt in keinem Merkmal). Fit 5c + Scorecard 5c mit GESCHÄTZTEM μ_c auf denselben 6 805 912 Zeilen, DM gegen fl-K@5a auf identischen Zeilen: T 246–336 h +4,7 %*, Td +8,5 %*, Böe +1,9/+2,8 %*, Wind +0,3…+1,6 %* (nur < 20 km), T/Td 126–240 h +0,3 % n.s., Bewölkung −1,1…−3,2 %! ⇒ **Regel verletzt, nicht gebaut**; Client-Wiring vorbereitet, geprüft (319/319, 167/167) und zurückgebaut. Was fehlt: Wind-Klimatologie mit Exposition (Modellzelle/ERA5-Land), Regel je Größe × Bin (E-FX-8).

## 1 Referenz und was an ihr steht

Scorecard 4 (`score\2026-09-25-ap8c\scorecard.{json,md}`, 6 805 912 bewertete Zeilen, Stride 6, 13 Monate 2025-09…2026-09, 2 906 Score-Zellen,
7 336 DM-Tests mit BH-FDR, Φ korrekt) gegen Fit 4 (`fusionFit@3`): Wind CRPS −2,1…−5,4 % je Bin (Speed-EMOS TN), Bewölkung −0,4…−3,6 %
(σ-Skala), Niederschlag 0–6 h −1,2 %* gegen Cube, T/Td/Böe ±0,3 %; **rot:** Wind gegen Klima 126–240 h +9,6 %!, 246–336 h +15,5 %!, DE
+2,8 % bei 0–6/25–48 h (V-FL-38), T 246–336 h +6,6 %!, Td +12,8 %!, Böe 126–336 h +4,6/+11,8 %!, Bewölkung 246–336 h −0,9 % n.s.

**Was an der Referenz nicht like-for-like oder in-sample ist (Adversarial-Review, mit Beleg):**

| # | Befund | Folge |
|---|---|---|
| S-1 | Lauf-Route-Strata (7–48 h, Hälfte von 0–6 h, 51–336 h `route:1`) haben nur die Zeitfalten 2026-06…09; mit Purge ±1 Monat trainiert die Falte für Juli allein auf September (21 Tage), die für August allein auf Juni (14 Tage) (`fit.mjs timeFolds`, `tables.mean[K|t|1|r1].folds`) | alle 7–48-h-Zahlen von fl-K/fl-P, die Hürden-Verdikte (−1,2/−1,3 %) und V-FL-38 sind mit 14–21 Trainingstagen und extrapolierten Jahresgang-Termen gerechnet — Handicap gegen fl-K, nicht gegen Cube/Klima ⇒ **V-FX-3** |
| S-2 | Brier-Tabelle „gelernt gegen Cube" (compare-score.md, §11.11) über verschiedene Zeilenmengen: 25–48 h fl-P n 43 339 gegen Cube n 1 064 925 („−6,0 %"), 126–240 h fl-K n 203 470 gegen 869 275 | like-for-like (DM-Paare, diag D5): fl-P 25–48 h −1,7 % (schlechter, n.s.), 7–24 h +0,2 % n.s. ⇒ die Niederschlags-Motivation „Form P gewinnt mehr" fällt ⇒ **V-FX-4** |
| S-3 | Spread/Skill mit latenter σ (zensiert), σ je Komponente (Rice), (q84−q16)/2 (TN); PIT am Atom als Mittelpunkt (`dist.ts pitOf`) | G-FL-2 der Bewölkung 7–336 h unlesbar (S/S 1,29–1,71 gegen Tobit-sd/RMSE 0,93–0,96); Bewölkungs-/Böen-/Niederschlags-Histogramme per Konstruktion strukturiert ⇒ **V-FX-1, V-FX-2** |
| S-4 | Wind-Klimatologie = Rice der u/v-Komponenten-Klimatologien: PIT unterstes Dezil 14,6–16,5 %, Bias +0,15…+0,21 m/s; Bewölkungs-Klimatologie zensierte Normal (P(0 %) 3 % gegen 18–25 % beobachtet) | „schlägt Klima bis 120 h" ist gegen eine weiche Baseline gemessen (synthetisch 2–4 % zu weich beim Wind, ≈ 8 % bei der Bewölkung) ⇒ **V-FX-10** |
| S-5 | Klimatologie auf allen Wahrheitstagen 2023-05…2026-09 inklusive Bewertungsfenster gefittet (13 Parameter je Reihe, Optimismus ≈ 0,05 % Varianz); Td-Klima im Fenster +0,43…+0,60 K zu feucht, T-Klima Lauf-Route −1,2 K | der Fenster-Pegel ist der Klima-Baseline teilweise bekannt (1–3 % beim Wind/Td möglich); Leave-Year-out fehlt ⇒ **V-FX-17** |
| S-6 | Speed-Gesetz: a = −0,9 am unteren Gitterrand in 8/10 K-Strata **und** b = 1,1 am oberen in 7/10 | das geschriebene Gesetz ist in zwei von drei Parametern ein Gitterrand-Artefakt ⇒ **V-FX-6** |
| S-7 | Varianzmodell, σ-Skala, Speed-Tripel, Mengenmodell gepoolt = in-sample (Optimismus klein: K\|ws\|5\|r3 in-sample 1,0949 gegen oof 1,0953); σ-Skala 0,9 an T/Td/Böe in 17 Strata Teil des bewerteten Artefakts | ⇒ **V-FX-7** |
| S-8 | Der Kandidat „cube" ist der Motor ohne Lernstufe zur Fallbau-Zeit; die Produktkette (gelerntes Member → windTerrainFactor / set-Prior / Anker in `fuseHour` → Speed-Gesetz auf der Motor-Rice, `cubeSource.ts` 1093) wird nie bewertet; bei T 246–336 h hat der Cube mit Prior die kleinere RMSE (4,06 gegen fl-K 4,21) | ⇒ **V-FX-9** (A6) |
| S-9 | Niederschlag t2/t3: Cube-Wert = Mittelrate über den Stufenschritt (`recompute.mjs sourceCellValue` Σ/dtH), Wahrheit = 1-h-Summe der letzten Stunde | absolute Brier/CRPS ab 51 h messen ein anderes Ziel als bei t1; Vergleiche bleiben like-for-like ⇒ **V-FX-14** (A5) |
| S-10 | Schicht `all` in den Bins 3–5 mischt Lauf-Route (Sommer, 4 Falten) und dyn-Route (ganzjährig); Länderstrata konfundieren Netz (CDC/TAWES/SMN) und Gelände; LI ein Punkt; λ auf allen Monaten gewählt und für die Falten-β wiederverwendet (kleines Leck); Σ-Prior gepoolt (V-FL-9) | ⇒ **V-FX-21**; Kreuzungen je Route × Land × Band (C7) |

## 2 Diagnose (gemessen; `audit/fusion-forschung/diag-fx1.md`, 3 402 690 Zeilen = Stride 12 aller 39 Fallreihen, 12,7 min; Reproduktion der Scorecard 4 auf 0,5 %: ws 0–6 h S/S 0,84/PIT 0,208 gegen 0,847/0,209, CRPS je Bin 0,754/0,753/0,782/0,901/1,011/1,065 gegen 0,754/0,752/0,783/0,899/1,005/1,061)

Alle fl-K-Zahlen mit den Falten-β des Zeilenmonats (out of fold für Mittelwert und Hürde), Varianz/Skala/Gesetz gepoolt wie im Scorer;
Klimatologie wie im Scorer (Station `byPoint`, Rückfall pooled: Böe 26, Bewölkung 188 Punkte ohne Reihe); like-for-like je Größe (nur
Zeilen mit fl-K, Cube, Klima Station und Klima gepoolt). Datenlücken gelten überall: 7–48 h nur 95 Sommertage, Bewölkung nur DE,
σ_ens nur t3, Tag-0-Vorlauf Annahme, Motor-Flags/Vertikalfall im Hindcast konstant (kein Profil) — D4 nach Flags war nicht auswertbar.

### 2.1 Kalibrier-Artefakte (D1) — welche G-FL-2-Fehlschläge sind echt?

| Gate (Scorecard 4) | S/S alt (latent) | S/S korrigiert (mean sd/RMSE · √mean var/RMSE) | PIT-Rand | Verdikt |
|---|---|---|---|---|
| Bewölkung 7–24 h (1,29) | 1,29 | 0,93 · 0,94 | 0,167 | **Scorer-Artefakt** |
| Bewölkung 25–48 h (1,31) | 1,31 | 0,93 · 0,94 | 0,178 | Scorer-Artefakt |
| Bewölkung 51–120 h (1,42) | 1,41 | 0,94 · 0,95 | 0,170 | Scorer-Artefakt |
| Bewölkung 126–240 h (1,55) | 1,56 | 0,95 · 0,95 | 0,160 (Lauf-Route 0,110) | Scorer-Artefakt |
| Bewölkung 246–336 h (1,70, PIT 0,138) | 1,71 | 0,95 · 0,96 | 0,136 (Lauf-Route **0,051** bei Skala 2,0) | gemischt — Lauf-Route real überdispers (V-FL-41 bestätigt) |
| Wind 0–6 h (0,85) | 0,84 | 0,82 · 0,87; < 800 m 0,90, ≥ 800 m **0,73** | 0,208 (< 800 m 0,196, ≥ 800 m 0,251) | gemischt — real in den Bergen |
| Wind 51–120 h (0,83) | 0,83 | 0,80 · 0,85; < 800 m 0,90, ≥ 800 m **0,63** | 0,227 (≥ 800 m 0,324) | gemischt — real in den Bergen |
| Wind 246–336 h (0,83) | 0,82 | 0,79 · 0,85; < 800 m 0,90, ≥ 800 m **0,59** | 0,221 (≥ 800 m 0,311) | gemischt — real in den Bergen |

Tobit-Momente gegen ein 20 000-Knoten-Quantilgitter auf 1e-4 geprüft. Die Rice der Form K vor dem Gesetz (Scorecard 3) hatte
Scorer-S/S 0,97–1,11 bei wahrem 0,76–0,83 und PIT-Rand 0,26–0,33 — **dort** war die Kalibrierung das Artefakt. Der Motor-Wind bei
126–336 h: sd/RMSE 0,52–0,54, PIT 0,37, Bias −0,3/−0,4 m/s. Für T/Td: S/S(k = 1) 0,95 ist der Jensen-Abschlag einer σ-Streuung
(CV ≈ 0,33; rms-Spread ≈ RMSE per Konstruktion des Momentenschätzers) — die 0,85-Schranke wurde an einer verzerrten Statistik gelesen.
Konsequenz: das Gate liest künftig den rms-Spread der beobachtbaren Verteilung und eine randomisierte PIT (§6 Stufe 1).

### 2.2 Langer Vorlauf (D2)

Kreuzungsstunde (erste Vorlaufstunde, ab der der fl-K-CRPS über der Stationsklimatologie liegt; Schicht `all`, Routen gemischt —
route- und ortsabhängig, s. u.): **Wind 105 h, Böe 156 h, Td 234 h, Bewölkung 246 h, T 264 h.**

| Größe · Bin | fl-K | Cube | Klima Station | Klima gepoolt | ρ (Anomalie) | b (Steigung) | Orakel-Mischung (in-sample) |
|---|---|---|---|---|---|---|---|
| Wind · 126–240 h | 1,011 | — | 0,914 | — | 0,17 | 0,28 | 0,985 |
| Wind · 246–336 h | 1,065 | 1,136 | 0,916 | 1,219 | 0,03 | 0,08 | 1,005 (Station) / 1,138 (gepoolt) |
| T · 126–240 h | 1,678 | — | — | — | — | 0,81 | 1,673 |
| T · 246–336 h | 2,337 | 2,364 | 2,191 | — | 0,26 | 0,36 | **2,133** (σ_b 3,79) |
| Td · 246–336 h | 2,387 | — | ≈ 2,11 | — | — | 0,20 | 2,113 |
| Böe · 126–240 h / 246–336 h | 1,641 / 1,758 | — | 1,567 / 1,570 | — | — / 0,05 | — | 1,606 / 1,634 |
| Bewölkung · 246–336 h | 20,95 | — | 20,74 | — | 0,04 | — | — |

Je Land, Wind 246–336 h (fl-K gegen Klima Station): AT 0,948 / 0,776 · CH 1,052 / 0,828 · ≥ 800 m 1,367 / 1,025 · DE 1,121 / 1,020.
Lesart: bei T/Td fehlt die **Schrumpfung** (b 0,36/0,20 statt ≈ 1 — die Mischung μ_c + b·(μ_K − μ_c) mit Residuen-σ gewinnt 8,7 % / 11,5 %
und erreicht das Klima-Niveau, nicht mehr); beim Wind trägt die Anomalie ab 246 h nichts (ρ 0,03), und selbst die optimale
Mittelwert-Mischung bleibt 10 % hinter der Klima-Rice — die Klimatologie gewinnt durch **σ_c(h, doy) und die Familie**, nicht nur durch
μ_c (Vorbehalt Adversarial: eine Mischung in Rice-Form mit σ_c·√(1 − ρ²) wurde nicht gerechnet). Die gepoolte Klimatologie ist als
Ziel unbrauchbar. Der Verlust konzentriert sich auf AT/CH/≥ 800 m (Exposition, Talwind). Mechanismus in den Tabellen: β_cube bei
246–336 h 0,95 (T) / 0,92 (Td) / 0,78 (u) bei ρ_f 0,29 / 0,22 / 0,20 — nur ȳ trägt das Ortsniveau, a(Z) ist gepoolt, und das Ridge-Ziel
β_cube = 1 (λ = 1 ⇒ ≈ 50 % Zug bei `gram.ts` λ·n) hält es fest.

### 2.3 Wind-Standortabhängigkeit (D3, V-FL-38)

fl-K-Bias nach dem Gesetz: DE −0,24…−0,40 m/s, AT +0,19…+0,37, CH +0,02…+0,18 — in jedem Bin. Gruppen-Refit der TN-Tripel auf der
Out-of-fold-Rice (in-sample je Gruppe, 990 Tripel, ≤ 20 000 Zeilen je Gruppe, Bewertung auf allen 1,6 M ws-Zeilen; **Obergrenze,
keine Falten**): globale Optima je Bin nur −0,1…−0,6 % (b 1,2 am Rand in 4/6 Bins); DE-Optimum (−0,45 · 1,1 · 1,0–1,1) −2,9 / −1,0 /
−3,3 % bei 0–6 / 7–24 / 25–48 h; AT (−1,65 · 1,2 · 1,3–1,4) −3,6 / −5,7 / −2,9 %; ≥ 1 500 m (+0,3 · 0,7 · 1,4–1,7) −5,9 / −7,5 / −9,2 %
bei 51–120 / 126–240 / 246–336 h — dort schlägt die Rice selbst das Gesetz. Ein in Standortmerkmalen lineares a (lnZ0, tpi2000, h_true)
bringt nur −0,2…−1,2 %, weil die Höhenabhängigkeit nicht monoton ist (a3 = 0 in jedem Bin; 300–800 m a −1,05…−1,65, ≥ 1 500 m +0,3).
PIT-Rand nach dem Gesetz DE 0,17–0,18, AT 0,22–0,29, CH 0,20–0,32. Physik (A1): der Rice-Überschuss E|V| − |EV| ≈ σ²/2ν ist bei
schwachem Wind groß — a konstant je Stratum mischt ihn mit der Talabschirmung; Länder sind zugleich Netze (CDC/TAWES/SMN).

### 2.4 T/Td-Plateau (D4)

- **Bedingter Bias klein** (|Bias| ≤ 0,3 K in fast allen Klassen; Ausnahme MAM-Nachmittag 51–120 h +0,5…+0,8 K).
- **Varianzverhältnis VR = mean e² / mean σ_K²** (T 0–6 h): DJF 1,38–1,93 je Sonnenstunde (n 5 400–6 000) gegen MAM/JJA/SON 0,9–1,3;
  dTsfc-Quintil 1 (< −4 K, stark entkoppelt) 1,74 (0–6 h), 1,43 (25–48 h), 1,34 (51–120 h) gegen Q5 0,97–0,99; Cube-Wind < 2 m/s
  1,24–1,39 gegen Rest 0,93–1,07; klare Nacht 1,58, bedeckter Tag 25–48 h 1,81, klarer Tag 0,78; Nachmittag 15–18 h bei 51–120 h
  1,24–1,48. Das Varianzmodell (9 Spalten ohne Jahresgang, dTsfc, Wind, Bewölkung) lässt diese Struktur liegen ⇒ M2.
- **Standortfester Rest:** Bias je (Punkt, Sonnenstunde 8, Saison 4), leave-one-month-out (n_other ≥ 30): T RMSE −6,4 / −5,8 / −4,3 /
  −2,8 % (0–6 / 7–24 / 25–48 / 51–120 h), CRPS −6,5 / −5,5 / −4,4 / −2,3 %; Td −4,3 / −1,9 / −0,4 / +0,1 %; in-sample T −12 %, Td −10 %.
  Braucht eine Station; Adversarial: ohne Purge innerhalb einer 3-Monats-Saison enthält die Zahl Regime-Persistenz — Obergrenze für
  Standort + persistente Regimefehler, keine Zielgröße (V-FX-22).
- **Tails:** z = e/σ_K bei T Schiefe −0,1…−0,6, Exzess-Kurtosis 0,6 (Nacht) … 2,9 (Tag); **Td 0–6 h Kurtosis 10,7–11,4** (Ausreißer-
  schwanz; Ursache — abgeleitete Td-Wahrheit `truthFlags`, Td ≤ T-Klemme, Netz — ungeprüft, V-FX-17).

### 2.5 Niederschlag (D5)

| Route · Bin | Brier(0,1) fl-K | Cube | fl-P | Mittel K/Cube | n |
|---|---|---|---|---|---|
| Lauf 0–6 h | 0,0406 | 0,0405 | **0,0380** | 0,0398 | 135 053 |
| Tag 0 0–6 h | **0,0458** | 0,0538 | 0,0448 | — | — |
| Lauf 7–24 h | (no-skill) | 0,0470 | 0,0460 | — | 403 047 |
| Lauf 25–48 h | (no-skill) | 0,047 | 0,048 | — | 21 666 |
| dyn 51–120 h | **0,0807** | 0,0831 | — | — | 827 516 |

CRPS Lauf 0–6 h: K 0,0663 > Cube 0,0646 (trocken 0,0046 gegen 0,0051, nass 0,980 gegen 0,946). Cube-Reliability Tag 0: 0,44 → 0,74,
0,55 → 0,88 (unterkonfident), dyn 0,23 → 0,40 (K behebt das). Menge | nass: PIT fl-K 6/20/6/10/9/9/9/11/10/10 (q90-Abdeckung 0,896),
Cube 15/9/8/7/7/7/8/9/10/20 (q90 0,795 Lauf / 0,930 Tag 0 / 0,936 dyn). Prädiktoren (punktbiserial, nur indikativ): nass 0–6 h icon_d2
0,641 > Cube-Hürde 0,636 > Member 0,622 > icon_eu 0,545; 126–240 h ln1p(q90) 0,248 gegen Member 0,219, σ_ens 0,203; 246–336 h q90 0,100
gegen Member 0,063 — q90 steht nicht im Hürden-Design. Like-for-like ist Form P bei 25–48 h **nicht** besser als der Cube (S-2).

### 2.6 Bewölkung DE (D6)

Wahrheit bimodal (57 % an 0 oder 100 %; obs P(0) 0,25 / P(100) 0,32 in der Lauf-Route). fl-K erreicht die Atome bei 0–6 h nur halb
(0,125 / 0,191), bei 246–336 h mit Skala 2,0 (0,227 / 0,338); Cube fast gar nicht (0,02–0,03 / 0,08–0,11; PIT-Rand 0,38–0,65,
Tobit-sd/RMSE 0,58–0,65). Schichtplanen tragen Information, die dem Gesamt-Prädiktor fehlt — belastbar die Bias-Zeile: c_clct 33–67 %
mit clch > 80 % ⇒ Bias **−26 %-Pkt** (n 8 711); die MAE-Vergleiche nach Schichtdeckel konditionieren auf leichte Fälle (Adversarial).

## 3 Hypothesen der Spezialisten und Adversarial-Urteile

37 Hypothesen (M1–M13 Mathematiker, A1–A12 Physiker, C1–C12 Klimatologe), jede mit angegriffener Annahme, Herleitung, erwartetem
Effekt je Größe × Bin × Schicht, falsifizierbarem Test, Datenlage, Client-Kosten und Berührung (fit-only / `predict.ts` / Motor /
`dist.ts` / Codec / neues statisches Produkt). Der Adversarial-Reviewer hat jede auf Leck (je Faltenachse), Überanpassung
(n_eff ≈ 2 200 je Bin·Jahr), Mehrfachtests, Φ-Fehler, unkonvergierte Fits, nicht-monatstreue Stichproben, Zeilenmengen, Artefakte und
Datenlücken geprüft. Rang = Adversarial-Rang über alle 37.

### 3.1 Angenommen (Bauplan)

| Rang | ID | Hypothese (angegriffene Annahme) | Erwartung nach Review | Kontrollen | absorbiert | berührt |
|---|---|---|---|---|---|---|
| 1 | **C1** (+ M4, A3) | Anomalieform μ = μ_c^obs(s, t) + β(τ)·(ȳ − μ_c) — die Stationsklimatologie als Regressor; Ridge-Ziel β_cube → ρ_f statt 1; σ² → σ_c²(1 − ρ²) (die EMOS-Form „dämpft von selbst" tut es nicht) | T 246–336 h −5…−7 % (Klima-Niveau, nicht darunter), Td −8…−11 %, Böe 0–120 h −4 %, 246–336 h −7 %, Wind 126–336 h an Stationspunkten −8…−13 % **nur mit σ_c und Familie**; an stationslosen Punkten unbekannt (gepoolte Klima ±0,1 %) — ohne Leave-Station-out-Beleg kein Produktversprechen | Ein-Zeilen-Probe Ridge-Ziel mit λ-Neuwahl; Negativkontrolle μ_c des Nachbarpunkts; Leave-Station-out-Regression der Klimakoeffizienten auf Z (Anspruch B); Band-/Region-Holdout; C8 zuerst; Windklima als Blend-Partner (C4); A6 | V-FL-23, V-FL-24, E-FL-12 | `predict.ts`, neues Produkt (Client) |
| 2 | **C8** | Halbmonatsfalten mit Purge ±1 Halbmonat (Monatsfalten lassen Jahreszeiten aus; Lauf-Route 14–21 Trainingstage) | 51–336 h −1…−3 % CRPS; 7–48 h möglicherweise mehr; no-skill-Verdikte der Hürde und V-FL-38 danach neu lesen | 8e′ bleibt grün; Trainingstage je Falte; Vergleich auf denselben Zeilen | V-FL-27 | fit-only |
| 3 | **M1** (+ C5) | Scorer-Kalibriermaße: rms-Spread der beobachtbaren Verteilung (Tobit-/TN-/Rice-sd), randomisierte PIT am Atom, RPS auf Oktas (die latente σ und die Mittelpunkt-PIT sind keine Kalibriermaße) | 0 CRPS; G-FL-2 Bewölkung lesbar (0,93–0,96, PIT 0,14–0,18); Wind ≥ 800 m bleibt real rot | CRPS/MAE/Bias byte-gleich; Normal ohne Atom: randomisierte = deterministische PIT; konstante σ ⇒ rms = mean | V-FL-14, 39, 41, 42 | Scorer |
| 5 | **A1** (+ M3, C3) | Windgesetz: Rice-Überschuss (∝ σ²/2ν) und Standortabschirmung trennen — a ∝ sd_Rice bzw. Lage auf ν, Gitter in a und b öffnen, Band-/Netz-Verdikt (no-skill je Band); multiplikative Standortmodulatoren im u/v-Modell | DE 0–48 h +2,8 % → ≤ 0 (Obergrenze −1…−3 %), all −0,5…−1,5 %, AT/CH −1…−3 % zusätzlich; ≥ 1 500 m Gesetz aus oder a ≥ 0; Sommer-Verdikt 7–48 h | Gitter a −2…+0,6, b 0,7–1,3, c 0,8–1,8 mit Zeitfalten; Varianten (i) a·sd_Rice, (ii) a + b·ν + d·(E−ν) oof je Land/Band/Netz; PIT-Dezile DE flach ohne AT/CH-Verlust; Band-Holdout der u/v-Modulatoren; **A6 vor dem Einschalten von `learnedSpeed`** (das Gesetz liegt im Client auf der Motor-Rice) | V-FL-38, V-FL-22 (Rest) | `predict.ts` |
| 6 | **M2** | Heteroskedastisches log-lineares σ-Modell per CRPS mit Regime-Prädiktoren (ln σ_div, ln σ_ens, \|ȳ − μ_c\|, Bewölkung, Wind, Γ, Standort × Tageszeit) statt LS-auf-e² × Skala (D4: VR 1,4–1,9 in DJF-Nächten) | T/Td 0–120 h −0,5…−1,5 %, Böe −0,3…−1 %; PIT-Rand 0,18–0,21 bei Skala 1; Hauptgewinn Kalibrierung; ersetzt die Skala 0,9 (V-FL-37) | γ mit x = [1] reproduziert die heutige Skala; permutierte Regime-Spalten ⇒ kein Gewinn; Kurtosis vorher/nachher; Konvergenz per Log-Likelihood je Schritt | V-FL-37, V-FL-15 (T/Td/Böe) | `predict.ts` (γ statt c) |
| 7 | **A6** | Die Client-Kette messen: Kandidat `fl-K+engine` (Fallbau mit `learned` und Falten-Tabellen je Monat), gelerntes Member ohne windTerrainFactor/set-Prior, Windgesetz vor `fuseHour` als momentengleiche Rice | Zahl unbekannt — genau deshalb messen; T 126–336 h möglicherweise besser als fl-K (set-Prior dämpft), Wind ≥ 800 m zwischen Cube und fl-K | ohne Lernstufe ≡ cube byte-gleich; Falten-Tabellen im Fallbau (Zirkularität) | V-FI-107, V-FL-42, Codec-Version 2 (könnte entfallen) | Motor, Fallbau (6–10 h Maschine) |
| 9 | **C7** | Verifikation je Vorlaufstunde und Saison, τ*(v, Land, Band) mit CI90 statt Bin-Einheit; Leave-Year-out-Klimatologie | 0 CRPS; liefert τ* und den Winter/Sommer-Vergleich bei 0–6 und 51–120 h | DM auf Tagesmitteln; τ* mit CI; route-getrennt; BH-Power (Vorlaufstunden-Paare vermehren die Tests ⇒ Kreuzung der Punktschätzer mit Bootstrap statt Signifikanz) | V-FL-24 (Messung), V-FL-29 (Diagnose) | Scorer |
| 10 | **M9** | Anker senkt σ: σ_τ'² = σ_τ² − w(τ)²·var(e₁)·r² (r = Repräsentativität), Kurve bis 72 h und je Zeitfalte | −0,4…−1 % CRPS auf angerten Zeilen 0–6 h, S/S 1,04–1,13 → ≈ 1,0 | σ' auf nicht angerten Zeilen unverändert; Kurve je Falte; im Client mit r² skaliert (sonst unterdispers) | V-FL-35, 29, 31 | **Motor** (`anchor.ts`, `cubeSource.ts`) |
| 11 | **M6** | Nichtlineare Decke messen: `HistGradientBoosting` (sklearn 1.6.1) auf den fl-K-Residuen und als Quantilmodell — Diagnose, nicht Client | Zahl für das Plateau: erwartet R² 0,02–0,05 (DE), 0,05–0,10 (AT/CH ≥ 800 m); entscheidet über M5/A7/A12 | Purge ±1 Monat von Hand; permutierte Ziele; Region-Holdout | — | Diagnose (Python) |
| 22 | **A5** | Niederschlags-Wahrheit im Schrittfenster: bei t2/t3 ist der Cube-Wert die Mittelrate über 3/6 h, die Wahrheit die 1-h-Summe | 0 Vorhersagegewinn; absolute Zahlen 51–336 h ändern sich; Produktdefinition = Jans Entscheidung | t1: obs_rrWin ≡ obs_rr; validAt am Fensterende prüfen | — | Fallbau (Spalte) |
| 37 | **C12** | Was die Sommerdaten 7–48 h nicht tragen (E-FL-3): Alpen-Kreuzung bei 7 h, DE +2,8 %, Hürde 7–48 h, Inversion/Nebel/Schnee sind JJA/SON-Befunde; belastbar 0–6 h (Tag-0-Annahme) und 51–336 h | keine Zahl vor Dezember für 7–48 h | Saison-Strata 0–6/51–120 h | E-FL-3 | — |

### 3.2 Überarbeiten (in den Bauplan aufgenommen, Erwartung gesenkt oder Vorstufe verlangt)

- **M8/A4 Niederschlag (Rang 8/14):** Nässe-Anteil-Rekonstruktion k/n = P̄²/(P̄² + σ_div²), q90-Spalte (t3), Rekalibrierung je Bin, CSGD erst danach. Die
  Motivationszahl (P −6 % bei 25–48 h) war ein Zeilenmengen-Effekt (S-2); like-for-like ist der P−K-Abstand 0–2 %. Erwartung: 0–6 h Brier −0,5…−2 %
  (unsicher), Tag-0-Route bleibt −15 %; 7–48 h kein Verdikt vor Dezember; 51–336 h q90 ±0…−1 %; A5 zuerst. Kontrolle r(wetFrac_est, wahrer Anteil) > 0,7.
- **A2/C6/M11 Böe (Rang 12/23/24):** rechtsschiefe Familie (TN/LN) bzw. niveauabhängige σ und Böenfaktor-Modell — aber zuerst ohne den Rice-Boden ν testen
  (der linke Schwanz ist durch den Boden abgeschnitten); Erwartung Böe 0–120 h −1…−2 %, Brier ≥ 14 m/s −2…−5 %; Skala 0,9 fällt.
- **A8/M10 Bewölkung (Rang 13/25):** Zwei-Atome-Mischung / ordinal auf Oktas; Vorstufe ohne neue Familie: clcl/clcm/clch als Spalten (geschachtelt, oof).
  D6: bei 246–336 h reproduziert die CN mit k 2,0 die Atome — der Familienfehler sitzt bei 0–48 h. Erwartung Vorstufe −1…−2 %, Familie −1…−3 % bei
  0–48 h; Codec-Bump nur mit Beleg; PIT-Argumente erst nach M1 lesbar.
- **M3 (Rang 15):** glattes Gesetz a(Z, λ) per Nelder–Mead — in A1 aufgehen (Gitter zuerst öffnen; 10 Parameter bei 4 Falten überanpassen).
- **C3 (Rang 16):** Gesetz je Land = Netzschlüssel (Anspruch B verletzt); je Band zulässig — als Rückfall in A1.
- **A3 (Rang 17):** Zell-Klimatologie ȳ − μ_c^mod (t1 nur Juni–September ⇒ nur Bins 3–5 baubar) und Talachse × Tagesgang — in C1 als Variante; Talachse
  neues Merkmal ohne Messung.
- **M4 (Rang 18):** in C1 aufgegangen (Blend-Schranke gilt nur bivariat-normal; für Wind indikativ; Zieländerung nur mit λ-Neuwahl).
- **C4 (Rang 19):** Klimatologie je Größe in der richtigen Familie (Wind Weibull/TN auf ff, Böe LN, Bewölkung Zwei-Atome) — härterer Benchmark und
  Kollaps-Ziel; Erwartung Klima-CRPS Wind −1…−3 %, Bewölkung −5…−8 %; Leave-Year-out; Weibull fehlt in `dist.ts`/Codec (STOPP).
- **M5 (Rang 20), A7 (21), A12 (30), C10 (31):** Regime-Prädiktoren im Mittelwert (Schichtbewölkung, rh850, Wind × Entkopplung, T850-Anomalie, PAP-5-Geometrie
  × Strahlungsproxy, Γ_block aus den Blockzellen, Td-Kopplung, Schneeproxy, Windsektor) — D4 zeigt kleine bedingte Bias ⇒ die Struktur sitzt eher in σ (M2);
  Spaltenwahl nach der M6-Importanz; Erwartung T 0–48 h ≥ 800 m −1…−2 %, all −0,3…−0,8 %.
- **A9 (Rang 28):** Windstille als Hürde — erst nach A1 prüfen (AT/CH-Unterdezile weitgehend durch das AT-Optimum behebbar); Codec-Bump.
- **M7 (Rang 29):** Student-t für T/Td — Kurtosis mild (0,6–2,9); Td-Ausreißer sind Wahrheit; nach M2 muss die Kurtosis fallen.
- **C11 (27), M12 (34), A11 (35):** Nässeklima je Station als Hürdenspalte (Sommer −0…−2 %); Schaake-Shuffle für Tmin/Tmax (Produktfrage, später);
  Tagesaggregate ab 126 h als ehrlicheres Produkt (Stride-1-Scorer, V-FL-24-Produktregel).

### 3.3 Verworfen

- **C2** (harter Umschalter auf die Klimatologie ab τ*): die Erwartung ist der Scorer-Klima-CRPS an Stationspunkten; im Client gibt es nur `ClimaField`
  (Meteostat, 1°, nur T); für stationslose Punkte ist die gepoolte Klimatologie schlechter als fl-K (1,22 gegen 1,07); harte Umschaltung erzeugt Sprünge —
  als weicher Blend in C1 aufgehoben.
- **C9** (Vorwärts-Validierung/Recency-Gewicht): 13 Monate trennen Modellzyklus und Interannualität nicht; Intercept-Streuung je Falte nicht von den
  Harmonischen identifizierbar; das Archiv-Fenster ist der Ort.
- **A10** (Aufhang-Komponente, Schnee-Undercatch): 10-m-Wind statt 850 hPa; β_slope vorzeichenschwankend = Rauschen; Gerätetyp unbekannt.
- **M13** (BMA/Stacking): BMA nur Backtest (Form P nicht im Client); die Negativkontrolle „w_cube ≈ 0" ist bei 246–336 h falsch — der Motor-Prior trägt
  (A6/C1).

## 4 Urteile je etablierter Formel (Synthese der drei Fachsichten und der Review)

| Formel | Urteil | Begründung (gemessen) | Was fehlt |
|---|---|---|---|
| EMOS-Linearität μ = a(Z) + b(Z)·ȳ (Ridge, Σ-/Cube-Ziel, 14 Wechselwirkungen) | **behalten — Koordinatensystem ersetzen** | Falten-β stabil (sd 0,002–0,02), Region-CV = Zeit-CV, P − K 1–4 %: in DE nahe der Decke. Aber ohne μ_c-Spalte hält β_ȳ 0,93–0,97 (T) / 0,76–0,82 (u) bei 246–336 h (ρ_f 0,29 / 0,20): dieselbe lineare Form im Anomalie-Koordinatensystem (C1). Struktur bleibt in Gelände × Regime (Band-CV 0,26 gegen 0,51) = fehlende Spalten, kein Formwechsel; Wind/Böe brauchen multiplikative Standortmodulatoren (A1/A2) | Punktklimatologie je Größe im Client (E-FL-12); nichtlineare Decke (M6); Halbmonatsfalten |
| Rice(ν, σ_komp) → TN(a + b·E_Rice, c·sd_Rice) je Stratum | **ersetzen (Parametrisierung), Familie behalten** | TN gewinnt real (oof −1,6…−5,8 %), aber a und b am Gitterrand, DE −0,32 gegen AT +0,20…+0,35, rechter Schwanz zu dünn (Dezil 10 12,5–13,4 %). Ersatz: a ∝ sd_Rice / Lage auf ν, Gitter geöffnet, Band-Verdikt (A1). Als Klimatologie ist die Rice der Komponenten zu ersetzen (C4) | Anemometerhöhe/Exposition je Station; Client-Transfer (A6) |
| Zensierte Normal (Bewölkung [0,100] mit Skala 1,1–2,0; Böe [0,90] mit Rice-Boden) | **unentschieden** | Bewölkung: der CRPS-Gewinn der Skala ist echt und numerisch ein Mischungs-Ersatz (σ×2 22,84 gegen exakte Atome 22,75); Familienfehler bei 0–48 h (Atome halb erreicht); PIT-Inneres in Oktas per Konstruktion klumpig. Böe: PIT-Dezil 1 bei 4–9 % — Boden und Familie verschränkt | randomisierte PIT / RPS (M1); Vorstufe Schichtspalten; Zwei-Atome nur mit Beleg (Codec) |
| Standard-Lapse 6,5 K/km (Stufe A), dTsfc mit z850 = 1 457 m | **behalten** | AP15: Γ frei 1,37 gegen 1,39 K — gleichwertig; die gelernten dh-/dh·hCos1-Terme (β_dh −1,2…−2,1 K/km, +0,6…+1,4 tags) tragen den tageszeitabhängigen Rest; Γ gehört eher ins σ-Modell (Inversion ⇒ größere σ) | Γ_block aus den Blockzellen und hypsometrischer Proxy (A7/A12) — erst messen; Winterfälle mit Profil |
| Anker-Persistenz w(τ) = cov(e₁,e_τ)/var(e₁) | **behalten** | gemessen −13,7 % (T), −14,4 % (Td), −9,7 % (Wind), −11,4 % (Böe) bei 0–6 h; die Wiederkehr bei 24/48 h ist der nächtliche Ortsversatz | σ-Absenkung (S/S 1,04–1,13 nach dem Anker, M9 — Motor), Kurve > 48 h, je Falte, je Messstunde, Td-Anker |
| Klimatologie-Blend (implizit über a(Z) + β·ȳ; Motor-Prior set) | **ersetzen** | β_cube 0,95/0,92/0,78 bei ρ_f 0,29/0,22/0,20; Schranke des expliziten Blends T −10 %, Td −13 % gegen fl-K (bei 126–240 h liegt fl-K schon darunter); Wind-Klimatologie verzerrt (Bias +0,2, PIT-Steigung); der Motor legt den set-Prior und windTerrainFactor auf das gelernte Member (ungemessen) | μ_c/σ_c je Größe im Client; ρ_f je Land/Band/Saison; Leave-Year-out |
| Hürde (logistisch, 11 Spalten) + Log-Normal-Menge | **behalten** | konvergiert (V-FL-36), CV-Schranke schützt, 0–6 h Tag 0 −15 % Brier, Menge kalibriert (q90 0,896); Grenze ist die Information (Quellanteil/Nachbarschaft nicht im Cube), nicht die Form; CSGD erst nach A5 | Cube-Plane Nässeanteil (Producer); Fensterwahrheit t2/t3 (A5); Winter 7–48 h; Radar/INCA |

## 5 Bauplan

Reihenfolge nach Adversarial-Rang × Datendeckung × Berührung. **Fit-/Scorer-seitig (diese Session, hinter Flags, ohne Option byte-gleich):**

| Stufe | Inhalt | Flags (Voreinstellung = Fit-4-Verhalten) | Beleg |
|---|---|---|---|
| FX-1 | C8 Halbmonatsfalten (V-FX-3); M1+C5 Scorer-Maße: rms-Spread der beobachtbaren Verteilung, randomisierte PIT, Strata je Vorlaufstunde und Saison, Kreuzungsstunde je Größe (V-FX-1/2/11) | `fit.mjs --folds=month\|half`; Scorer folgt `tables.inputs.foldScheme`; `spreadSkillLatent` bleibt für den Vergleich mit alten Karten | `verify:fusion-fit` Block 11; Zwei-Monats-Rauchfit byte-gleich ohne Option, `--folds=half` als Positivkontrolle |
| FX-2 | C1 μ_c-Spalte (Station, Rückfall pooled) + Ridge-Ziel ρ_f (V-FX-5); A1 Gitter geöffnet, Familie a·sd_Rice, Band-Verdikt (V-FX-6); Skalenregel nur Bewölkung (V-FX-7) | `--clima=none\|station --rhoTarget=0\|1 --speedGrid=v3\|v4 --speedBands=0\|1 --scaleVars=…`; `tables.design.mean.clima`; `predict` gibt ohne μ_c `absent` (Client fällt zurück, benannt) | Block 12; Negativkontrollen: Nachbarpunkt-μ_c, gepoolte μ_c ±0,1 %, gepooltes Gesetz reproduziert Fit 4 |
| FX-3 | Fit 5a (nur C8) + Scorecard 5a; Fit 5b (C8 + C1 + A1 + Skalenregel) + Scorecard 5b; `compare.mjs` gegen Scorecard 4 und 5a — like-for-like je Größe × Bin × Land/Band, DM/BH, Kreuzungsstunden | eigener Prozess je Lauf, Maschine frei (V-FL-12) | §6 |
| FX-4 | Klimatologieprodukt für den Client (E-FX-1, Client-Seite von C1; Auftrag 26.09.): Leave-Station-out-Diagnose der μ_c-Schätzer (`climaProduct.ts`, `diag-fx4.mjs`), Fit 5c/5d mit GESCHÄTZTEM μ_c in Spalte und ρ_f, Scorecard 5c/5d mit Referenzkandidaten `fl-K@5a/5b` und Strata `dnn:`; Entscheidungsregel vor dem Lauf; Produkt + Client nur nach bestandener Regel | `fit.mjs --climaMu=<LOSO-Dokument>` (nur mit `--climaCols=station`), `score.mjs --refTables=<label>=<pfad>,…`; `tables.climaMu` (Client-Tabelle ohne); Verifier Block 13 | §6.4 |

**Motor-Berührungen (STOPP & FRAGEN, `MANUELLE-SCHRITTE.md` §22):** M9 Anker-σ (`anchor.ts`/`cubeSource.ts`), A6 Client-Kette (Fallbau mit
`learned`, `fuseHour`-Reihenfolge, momentengleiche Rice statt TN ⇒ Codec-Frage), C4/A8/A9 neue Familien in `dist.ts`/Codec, C1-Client
(Klimatologieprodukt E-FL-12, `cubeSource.ts` reicht μ_c), A1-Client (Band-Schlüssel in `cubeSource.ts`). **Nächste Iteration (fit-seitig):**
M2 σ-Modell per CRPS (gespeicherte Teilstichprobe, BFGS mit Log-Likelihood-Beleg), M6 GBM-Decke (Python, Export der Stride-24-Zeilen),
A8-Vorstufe Schichtspalten, A2/C6 Böe ohne Boden, M8/A4 Nässeanteil/q90, C7 τ* mit CI, Leave-Year-out-Klimatologie, Leave-Station-out-
Regression der Klimakoeffizienten (Anspruch B), A5 Fensterwahrheit; Winter-Nachfit ab Dezember (E-FL-3).

## 6 Umsetzung (Protokoll)

### 6.1 Stufe FX-1 — Halbmonatsfalten (C8) und Scorer-Maße (M1/C5), 25.09.2026 abends — Gate grün

**Gebaut (alles hinter Flags, ohne Option byte-gleich; nichts unter `src/pointForecast/`):**
- `src/point/fusionFit/strata.ts`: `FoldScheme`, `halfMonthOf` (UTC-Tag ≤ 15 ⇒ `YYYY-MMa`, sonst `b`), `foldKeyOf`; `timeFolds` bleibt
  indexbasiert (mit Halbmonatsschlüsseln ist der Purge ±1 Halbmonat ≥ 13 d; Februar-Hälften 15 + 13/14 d, benannt); `foldsOverGroups`
  liest nur die erste Komponente. `tables.ts`: `inputs.foldScheme?` (fehlend = Monat). `rowFeatures.mjs`: `ctx.half`.
- `fit.mjs`: `--folds=month|half` (Voreinstellung month, fremder Wert wirft), `foldOf(ctx)` an allen sechs Zeitschlüssel-Stellen
  (Gram-Monatsachse, Σ-Fehlerstatistik, Hürden-Reservoir, `ScaleAcc`, `SpeedAcc`, `muOf`); `inputs.foldScheme` und eine Notiz nur
  unter half (sonst wäre der Standardfit nicht byte-gleich).
- `score.mjs`: Faltenschlüssel je ZEILE unter `foldScheme === 'half'` (`tablesForFold(ctx.half)`, je Schlüssel gecacht; Anker-Residuen
  mit den Tabellen der Vorlauf-1-Zeile), sonst je Datei-Monat wie bisher (Fit-4-Tabellen bewerten byte-gleich). Spread = `sdOf`
  (Normal σ; TN geschlossen; zensierte Normal Tobit-sd der beobachtbaren Variablen; Rice √(2σ² + ν² − E²); Hürde null) plus latente σ;
  PIT = `pitRandomOf` mit u aus `lcg` (Saat Punkt, validAt, Größenindex; erster Zug verworfen), ein u je (Zeile, Größe) für alle Kandidaten;
  `ScoreAcc` führt `spreadSkill` (rms = √mean var / RMSE, **Gate-Maß**), `spreadSkillMean`, `spreadSkillLatent` (alte Definition, für den
  Vergleich mit alten Karten); Strata nur für die Scores: `lead:<h>` und `season:<DJF|MAM|JJA|SON>`; je Größe die Zeile „Kreuzungsstunde
  fl-K gegen Klima"; Notizen benennen die Definitionen. `compare.mjs`: „S/S vor → nach" like-for-like (latent), Spalte „S/S rms (nach)".
- `scripts/verify-fusion-fit.mjs` **Block 11 (9 Prüfungen, je mit Negativkontrolle):** 11a Schlüssel (2026-02-15 ⇒ a, 02-16 ⇒ b, 01-31 ⇒ b);
  11b `timeFolds` auf Halbmonatsschlüsseln (gehalten `2026-02b` purgt genau `2026-02a`, `2026-03a`; kleinster Abstand gehalten ↔ Training
  13 d, ohne Purge 0 d); 11c Leck-Negativkontrolle wie 8e′ auf 16 Halbmonatsfalten (ehrlich MSE 7,85 gegen sauber 2,20, leck 4,96);
  11c′ Purge-Kontrolle (Faltenspezifikation mit Purge = `fitStratum`-CV auf 1e-9; ohne Purge sinkt der Verlust 7,852 → 6,621);
  11d `sdOf` gegen 20 000-Knoten-Quantilgitter (zensiert 50/40/0/100, 95/60/0/100, 5/3/0/90 auf 1e-3: 32,551 · 32,671 · 2,876; TN drei
  Sätze; Rice 1,4337/1,4336); 11d′ latente σ 60 gegen Tobit 38,254; 11e `pitRandomOf` (Normal = cdf; y = lo 2 000 Züge in [0, F(lo)],
  Mittel 0,0587 gegen 0,0576; y = hi gespiegelt; Hürde u·pDry); 11e′ `pitOf` deterministisch gegen randomisiert; 11f drei S/S-Formen bei
  konstanter sd gleich (1,0172), rms 0,7582 > mean 0,6781 = latent bei sd 0,5/1,5.

**Gates (Maschine frei):** `npm run typecheck` grün; `verify:fusion-fit` **77/77**; `verify:pv-cube` **314/314**; `verify:point-client`
**165/165**; `verify:calib-fit` **14/14**; `verify:pv-fusion` **229/229**; Build **241/241**; Budget eagerJs **107,9** unverändert,
largestChunk 301,2, totalJs **1 443,8 KB** byte-gleich (1 478 470 B gz; `halfMonthOf`/`foldKeyOf` werden vom Bundler entfernt, der
`tables.ts`-Import ist typ-only) — weiter über 1 438 (E-FL-11, unverändert).

**Byte-Gleichheit (Zwei-Monats-Rauchfit 2026-07/08, Stride 48, nmin 200/1, Vorher-Lauf auf dem unberührten Code):** `fusion.hindcast.json`
und `fusion.client.json` nachher **identisch bis auf `builtAt`** (1 663 510 B / 75 268 B); Scorecard: alle 2 684 alten Score-Zellen
n/MAE/Bias/RMSE/CRPS identisch, `spreadSkillLatent`(nachher) = `spreadSkill`(vorher) in allen 2 684 Zellen, 6 771 Paare, Brier, ETS,
G1/G4 identisch; erwartete Unterschiede: PIT-Histogramme in 231 Zellen (nur Niederschlag 90, Böe 21, Bewölkung 120 — Atome; T/Td/Wind 0),
rms-S/S in 1 025 Zellen, **G2 kippt 6/66, alle Bewölkung:** 0–6 h fl-K ✓ → ✗ (S/S 1,163 → rms 0,897, PIT 0,189 → **0,284** — die Atome
werden bei 0–6 h nur halb erreicht, D6), 51–120 h ✗ → ✓ (1,483 → 0,910, PIT 0,246), 126–240 h ✗ → ✓ (1,737 → 0,948, 0,217; fl-P ebenso),
246–336 h ✗ → ✓ (2,002 → 0,973, 0,199; fl-P ebenso). Übrige fl-K rms gegen latent: T 1,00–1,05 gegen 0,99–1,03; Td 0,92–1,02; **Wind
rms 0,82–0,92** (mean 0,79–0,88) — die Unterdispersion des Windes ist real; Böe 0,87–1,00; Niederschlag PIT-Rand 0,04–0,06 → 0,20
(randomisiertes Atom), S/S null. Neue Zellen 6 230 `lead:` + 766 `season:` (JSON 2,49 → 4,98 MB bei Stride 48).

**Positivkontrolle `--folds=half` (dieselben zwei Monate):** Tabellen verschieden (`foldScheme half`, Schlüssel 2026-07a…2026-09a; `cv.time.folds`
5 in 203 Strata statt 2 in 125 / 1 in 80); Status written/no-skill/too-short 187/18/36 → 205/0/36; Hürde 9 → 7 geschrieben; Speed 27 → 32;
Skalen 52 → 80; Scorer mit Zeilenschlüsseln, 276 943 Zeilen in beiden. **Kein C8-Maß:** mit zwei Fallmonaten hat die Monatsfalte für
2026-08 nach dem Purge keine Trainingsdaten und fällt auf das gepoolte β zurück (gemessen: Falten-β = gepooltes β in 205/205 Strata für
2026-08, 80/205 für 2026-07; half nur 4 Rückfälle) — die Monatskarte bewertet August in-sample, die Halbmonatskarte out-of-sample.
Lehre (V-FX-23): Rauchfits brauchen ≥ 4 Monate und `--folds=half`, sonst messen sie in-sample. Das Verdikt liefert Fit 5a.

**Abweichungen von der Vorgabe:** `foldScheme`/Notiz nur unter half (Byte-Gleichheit); `ScoreAcc.add(…, sigma, sd = sigma)` (4-Argument-
Aufrufer bleiben, explizites `null` lässt die sd-Summen aus); 11c verschiebt einen ganzen Monat (eine verschobene Hälfte wäre durch den
Purge unsichtbar), 11c′ prüft den Purge; `--folds` mit fremdem Wert wirft.

### 6.2 Stufe FX-2 — μ_c-Spalte mit ρ_f-Ziel (C1), Windgesetz (A1), Skalenregel (V-FX-7), 25./26.09.2026 — Gate grün

**Gebaut (hinter Flags, Voreinstellung byte-gleich zu Fit 4; nichts unter `src/pointForecast/`):**
- `design.ts`: `ClimaColumns = 'none' | 'station'`, `CLIMA_NAMES = ['muC']`; `meanDesignK/P(…, clima = 'none', muC = null)` hängen unter
  `station` EINE Spalte μ_c ans Ende (alle Offsets unverändert; `station` ohne μ_c wirft), `none` byte-gleich zum alten Aufruf.
- `fitMean.ts`: `designNames(form, cls, clima)`, `MeanFitOptions { clima, rhoTarget }`, **eine** Definition des Ridge-Ziels `ridgeTarget(…)`
  (K: ρ bzw. 1 auf ȳ; P: w_m·ρ bzw. w_m; μ_c: 1 − ρ bzw. 0; Bias auf dem Intercept — unpenalisiert), von `fitStratum` UND dem Falten-β-
  Wiederaufbau in `fit.mjs` benutzt (der duplizierte das Ziel bisher); `MeanEntry.clima/rhoTarget` nur wenn gesetzt.
- `fitSpeed.ts` neu geschrieben: Gitter `v3` (75 Tripel, Reihenfolge von fusionFit@3) / `v4` (`add` 270 + zweite Familie `sd` 180:
  TN(a·sd_Rice + b·E_Rice, c·sd_Rice)); `speedLaw(rice, {a, b, c, law?})` (`law` fehlend = `add` ⇒ Fit-4-Tabellen lesbar); `SpeedAcc(grid)`;
  `fitSpeedStratum` je Familie bestes Tripel + oof, die Familie mit dem kleineren Out-of-fold-CRPS wird geschrieben (Gleichstand ⇒ add),
  `no-skill` wenn keine die Rice schlägt; Einträge `law/grid/edge` (welche Achse am Gitterrand) und `cv.byLaw` nur unter v4; Band-Einträge
  (`…|lt800`, `…|ge800`) mit `cv.crpsPooledLaw`. `fitScale.ts`: `scaleForVar(v, cv, vars)` (Schreibregel). `predict.ts`: `PredictSituation.muC?`,
  `.band?`; `designOf` liest `tables.design.mean.clima` (station + fehlendes μ_c ⇒ `absent`); `speedEntryOf(…, band?)` nimmt einen
  geschriebenen Band-Eintrag vor dem gepoolten (der Client übergibt kein Band ⇒ gepoolt wie heute). `tables.ts`: `design.mean.clima?`,
  `inputs.rhoTarget?/climaFallback?/climaShuffle?/scaleVars?`; `validateTables`: `clima` ∈ {fehlend, none, station}; in einer station-
  Tabelle enden geschriebene Mittelwert-Einträge mit `muC`; Speed-Schlüssel `^[KP]|ws|\d+|cls(|lt800|ge800)?$`, `law` ∈ {fehlend, add, sd}.
- `fit.mjs`: `--climaCols=none|station` (Voreinstellung none; `--clima=<Pfad>` bleibt das Klimatologie-Dokument), `--rhoTarget=0|1` (0 = Ziel 1
  wie heute; 1 = ρ_f aus dem Durchlauf-A-Akkumulator je (Größe, Bin), auf [0,05; 1] geklemmt, fehlend ⇒ 1 benannt), `--climaShuffle=1`
  (Negativkontrolle: μ_c des nächsten Punkts mit Reihe, an DESSEN Länge), `--speedGrid=v3|v4`, `--speedBands=0|1`, `--scaleVars=<Liste>`
  (Voreinstellung `t,td,gust,clct` = heutige Regel); `muCOf` (Station ?? pooled, gezählt), Designs in A/B/E inkl. Anker-Residuen; Log je
  Stratum Familie/Tripel/Rand/oof-Δ, Bänder gegen gepooltes Gesetz, Randzähler, Rückfallzähler, ρ-Ziele. `score.mjs`: `sitK` baut die
  Klima-Designzeile selbst und liefert `muC` (Station ?? pooled) und `band`. `compare.mjs`: Speed-Tabelle mit Band/Familie/Gitter/Rand,
  Abschnitt „μ_c-Spalte und ρ_f-Ziel" (β_cube vorher → nachher, β_μc, ρ, Status).
- `scripts/verify-fusion-fit.mjs` **Block 12 (13 Prüfungen, je mit Negativkontrolle):** 12a Design (p_K 51 → 52, p_P 53 → 54, letzte Spalte μ_c;
  `none` byte-gleich; station + null wirft; `clima: 'foo'` verworfen); 12a″ `ridgeTarget` K 0,3/0,7 (ohne ρ 1/0), P 0,3/0,2 an den Quell-
  Offsets, μ_c 0,5; 12b Rückgewinnung an 24 synthetischen Standorten (Wahrheit y = μ_c + 0,3·(ȳ − μ_c) + N(0,1)): **β_cube 0,300, β_μc 0,700**,
  größter sonstiger Effekt 0,000 K; Kontrolle y = 0,7 + ȳ + Rauschen: β_cube 1,000, ohne clima/rhoTarget-Felder; 12b″ falsches Ziel ρ 0,8 ⇒
  β_cube 0,338 bei λ 0,01 (die Daten identifizieren die Spalte); 12b′ Zeit-CV MSE Station 0,998 (Skill 0,923) gegen ohne μ_c 5,072 (0,610)
  gegen verwürfelt 5,110 (0,607, β_μc −0,054); 12c predict: station-Tabelle ohne μ_c ⇒ alle 7 Größen `absent`, μ_c NaN ⇒ absent, none-Tabelle
  unverändert; 12d v3 = fusionFit@3 (75 Kandidaten in Gitterreihenfolge, TN-Wahrheit ⇒ (−0,6, 1, 1,3), Rice-Wahrheit no-skill); 12d′ v4:
  sd-Wahrheit ⇒ `sd` (−0,6, 1, 1,25), oof sd 0,8597 < add 0,8720 < Rice 0,9302; add-Wahrheit ⇒ `add`; 12d″ ferne Wahrheit ⇒ a = −1,8 Rand [a];
  `speedEdge('v3', Fit-4-Gesetz −0,9/1,1/1)` = [a, b]; 12d‴ `law` fehlend = add byte-gleich; 12e Band-Eintrag gewinnt (μ 5,398 gegen 4,501),
  no-skill/unbekannt/fehlend ⇒ gepoolt, falscher Schlüssel/law verworfen; 12f Skalenregel.

**Gates (Maschine frei):** `npm run typecheck` grün; `verify:fusion-fit` **90/90**; `verify:pv-cube` **314/314** (dritter Lauf; zwei Läufe
davor 313/314 nur an Zeit-Ankern (4)/(11) — Motor unberührt, Blöcke 24–26 in allen drei Läufen grün); `verify:point-client` **165/165**;
`verify:calib-fit` **14/14**; `verify:pv-fusion` **229/229**; Build **241/241**; Budget eagerJs **107,9** unverändert, largestChunk 301,2,
**totalJs 1 444,5 KB** (+0,7 KB gz gegen 1 443,8: `speedLaw`-Zweig, `predict.ts` clima/band, `meanDesignK/P`-Parameter — alles im lazy
`cubeSource`-Chunk; Gitter werden entfernt) > 1 438 (E-FL-11, Jans Ratsche).

**Byte-Gleichheit (Zwei-Monats-Rauchfit wie Stufe 1):** `fusion.hindcast.json` und `fusion.client.json` identisch bis auf `builtAt`, Scorecard
identisch bis auf builtAt/codeHash/tables.sha256/path; auf dem t3-Mini lassen `--speedGrid=v4 --speedBands=1` Mittelwert/Varianz/Hürde/Menge/
Anker/ρ_f byte-gleich (nur `speed` 5 → 15 Einträge) ⇒ die A1-Tabelle dient als C1-Kontrolle (i).

**Kontrolle C1 (2026-06…09, Stride 48, nmin 200/1, Halbmonatsfalten; Form K, Zeit-CV-MSE n-gewichtet über die Routen; (i) ohne μ_c, (ii) Station +
ρ_f-Ziel, (iii) Station + ρ_f verwürfelt):**

| Größe · Bin | MSE (i) | (ii) Δ | (iii) Δ′ gegen (ii) | Skill i / ii / iii |
|---|---|---|---|---|
| T · 0–6 / 7–24 / 25–48 | 1,781 / 2,131 / 2,700 | +1,1 / +1,2 / +0,1 % | −0,8 / −0,9 / 0,0 % | 0,535/0,530 · 0,490/0,484 · 0,427/0,427 |
| T · 51–120 / 126–240 | 3,969 / 8,506 | −2,9 / −3,3 % | +4,2 / +9,9 % | 0,340/0,359 · 0,153/0,181 |
| **T · 246–336** | 14,022 | **−20,9 %** (11,096) | +28,9 % | 0,191/**0,360**/0,175 |
| Td · 0–48 / 51–240 | 1,757…2,789 / 4,001, 8,570 | 0,0…+2,1 % / +3,1, +3,2 % | −1,1…+0,1 % / −1,1, +3,8 % | — |
| **Td · 246–336** | 12,507 | **−11,6 %** | +21,7 % | 0,140/0,240/0,075 |
| u · alle Bins | 2,287…6,156 | −3,9…−5,9 % | +4,8…+8,0 % | 0,065…0,108 / 0,086…0,160 |
| v · alle Bins | 1,991…4,300 | −3,2…−7,7 % | +3,4…+7,2 % | 0,037…0,133 / 0,069…0,200 |
| Böe · 0–120 / 126–240 / **246–336** | 3,823…5,367 / 7,672 / 8,695 | −6,0…−7,7 / −12,1 / **−18,3 %** | +6,5…+8,4 / +13,6 / +23,6 % | 0,151…0,265 / 0,407 / 0,483 → 0,216…0,309 / 0,478 / 0,577 |
| Bewölkung · 0–336 | 701,6…1 774 | −0,8…−7,3 % | +0,4…+0,8 % (μ_c-Rest trägt: DE-only) | — |
| Niederschlag (ln1p) · 0–336 | 0,0301…0,0517 | −0,1…−4,2 % | 0,0…+0,6 % | — |

Region-/Band-CV von (ii) meist ebenso besser (T 246–336 h Region −29 %, Band −24 %; Böe 7–48 h Band −40 %; Gegenbeispiel u 0–6 h Band +10 %).
Koeffizienten r1 (i) → (ii) [(iii)]: T 246–336 h β_cube 0,905 → **0,319** [0,340], β_μc 0,689 [0,539], ρ-Ziel 0,317, λ 1/10/1; Td 246–336 h 0,842 →
0,217, β_μc 0,781; u 246–336 h 0,839 → 0,251, β_μc 0,835; Böe 246–336 h 0,584 → 0,092, β_μc 0,909; T 0–6 h 0,999 → 0,979, β_μc 0,093 (ρ 0,880).
**Lesart:** die Erwartung aus §2.2/§3.1 ist getroffen — der Gewinn ist am langen Ende am größten und die Verwürfelung nimmt ihn überall zurück
(iii ≈ i auf ±1 %), außer bei der Bewölkung (DE-only-Klimatologie trägt wenig Ortsinformation, 0,4–0,9 % bleiben). **Kosten:** T/Td 0–48 h
+0,1…+2,1 %, Td 51–240 h +3 % — das ρ-Ziel 0,55–0,88 drückt β_cube, wo die Daten ≈ 1 wollen ⇒ Nachtrag `--rhoTarget=cv` (Ziel je Stratum per
Zeitfalten-CV zwischen 1 und ρ_f, s. u.). Rückfall-Zeilen (Station ohne Reihe ⇒ pooled): (ii) nur Niederschlag 672.

**Kontrolle A1 (dieselben vier Monate, `--folds=half --speedGrid=v4 --speedBands=1`, oof gegen die Rice):** gepoolt Form K r1 0–6 / 7–24 / 25–48 /
51–120 h `add` (−0,9 · 1,15 · 1,1) **ohne Rand**, oof −2,94 / −2,86 / −3,81 / −2,66 % (sd −1,2…−2,3 %); 126–240 / 246–336 h `sd` (−1,2 · 1,3 · 1,25)
am Rand [a, b], −1,64 / −1,93 % (add −0,74 / −1,77 %); r2 0–6 und r3 51–336 h ohne Falten-Verdikt (wie Stufe 1, vier Monate). Randzähler gepoolt
Form K: a 2/10, b 3/10, c 0/10 (v3 auf denselben Monaten: b am Rand in 36/38 Strata, a 6/38). Bänder (75 mit Verdikt): 55 geschrieben, 20
no-skill; < 800 m gegen gepoolt nur −0,0…−1,4 %; **≥ 800 m 51–120 h `sd` (0 · 0,85 · 1,45) no-skill (+0,32 % gegen die Rice — die Rice
gewinnt in den Bergen, wie D3 für ≥ 1 500 m)**, ≥ 800 m 126–336 h `sd` (−1,2 · 1,3 · 1,45) [a, b] −1,0…−1,6 %; PIT-Rand nach dem Gesetz
0,19–0,25 (≥ 800 m) / 0,20–0,22 (< 800 m). Lesart: das offene Gitter holt a und b für r1 0–120 h ins Innere; die sd-Familie gewinnt ab 126 h,
sitzt aber an ihren Achsenrändern ⇒ Nachtrag: B bis 1,45, sd-A-Achse bis −1,8. Bänder helfen unter 800 m kaum und skalieren über 800 m
vor allem c.

**Nachtrag (`--rhoTarget=cv`, breiteres v4-Gitter):** `fitMean.ts` `MeanFitOptions.rhoSelect: 'fixed' | 'cv'` — unter `cv` baut `fitStratum` BEIDE Ziele
(heutiges β_ȳ = 1 / μ_c 0 und das ρ_f-Ziel), wählt je Stratum das kleinere Held-out-MSE je Zeile (Gleichstand ⇒ heutiges Ziel) mit dessen
eigenem λ; `MeanEntry.rhoTargetChosen` (1 oder ρ_f) und `rhoTargetCv { one, rho }`; der Falten-β-Wiederaufbau nimmt das gewählte Ziel;
`inputs.rhoChosen` je Form|Bin. v4-Achsen: B bis 1,45, sd-A-Achse bis −1,8 ⇒ 324 `add` + 288 `sd` = 612 Kandidaten (v3 unberührt). Verifier
12b‴ (cv wählt ρ auf der ρ-0,3-Wahrheit mit β/λ byte-gleich zum festen Aufruf; wählt 1 auf der Steigungs-1-Kontrolle; fester Aufruf ohne
cv-Felder), 12d 612/324. Gates: typecheck grün, `verify:fusion-fit` **91/91**, `verify:pv-cube` **314/314** (erster Lauf), `verify:point-client`
**165/165**, Build 241/241, Budget eagerJs 107,9, totalJs **1 444,5 KB** (unverändert gegen Stufe 2). Byte-Gleichheit des Standardfits gegen
`fx2-bytes` erneut identisch bis auf `builtAt`. **Kontrolle C1 mit cv (dieselben vier Monate):** die Kosten des festen Ziels sind weg — cv ≤ (i) + 0,2 %
überall außer Td 51–120 h (+0,5 %) und 126–240 h (+0,8 %; dort von der μ_c-Spalte bei λ 0,01–0,3, nicht vom Ziel), alle Langfrist-Gewinne bleiben
(T 246–336 h −20,9 %, Td −11,6 %, Böe −18,3 %, u/v −3…−8 %, Bewölkung −0,8…−7,3 %, Niederschlag −0,1…−4,2 %); T 0–48 h Band-CV −22…−24 %.
Zielwahl Form K r1: Ziel 1 für T/Td/u bei 0–48 h und Td bei 51–240 h; ρ_f für v, Böe, Niederschlag, Bewölkung in jedem Bin, für T/u bei 51–240 h
und **für alle Größen bei 246–336 h** (z. B. K|t|5|r1 MSE 13,52 gegen 11,10). Strata ohne Zeitfalten-Verdikt (r2/r3 im Vier-Monats-Rauch)
zählen als Ziel 1. Gitter: auf dem t3-Mini liegt K|ws|5|r1 `add` (−1,5 · 1,3 · 1,1) jetzt im Inneren; ob die 126–336-h-sd-Optima in den neuen
Achsen liegen, zeigt Fit 5b.

**Abweichungen:** `law/grid/edge`, `cv.byLaw`, `MeanEntry.clima/rhoTarget`, `inputs.*` nur unter den Flags (Byte-Gleichheit); `inputs.rhoTarget`
ist die Map der tatsächlich benutzten geklemmten ρ; Band-Akkumulatoren ohne LN-Teilstichprobe; 12b variiert `srcCount` je Zeile (sonst ist
ȳ·srcCount/5 = ȳ und die Ridge teilt die identifizierte Summe nach den Zielen); `fit.mjs` nimmt Stride 6 als Voreinstellung (Kopf sagt 4 —
V-FX-24, Stride immer explizit übergeben). **Offen:** Client — `cubeSource.ts` baut die Situation ohne `muC`, eine station-Tabelle schaltet die
gelernte Mitte im Browser ab (benannt `absent`) ⇒ keine Fit-5b-Client-Tabelle vor E-FX-1; ρ_f-Ziele nahe 0 (Niederschlag 246–336 h Klemme 0,05,
Böe 0,092); Rückfallzähler nur in Durchlauf A.

### 6.3 Stufe FX-3 — Fit 5a/5b, Scorecard 5a/5b, Vergleich (25./26.09.2026, 20:27–01:34 UTC, Kette in einem Prozess) — Gate grün

**Läufe (Stride 6 wie Fit 4, Klimatologie `fit\2026-09-23\clima.hindcast.json`):** **Fit 5a** = nur `--folds=half` (`fit\2026-09-25-fx5a`, 57 min;
258 Mittelwert-Strata geschrieben, 37 zu kurz, **0 no-skill** — Fit 4: 257/1/37; Hürde 24 geschrieben/1 no-skill — Fit 4: 16/9; Speed 39/1;
Skalen 112); **Scorecard 5a** (`score\2026-09-25-fx5a`, 76 min); **Fit 5b** = `--folds=half --climaCols=station --rhoTarget=cv --speedGrid=v4
--speedBands=1 --scaleVars=clct` (`fit\2026-09-25-fx5b`, 97 min; Speed 105 geschrieben/9 no-skill inkl. Bänder; Skalen 41 = nur Bewölkung;
μ_c-Rückfall auf pooled nur Niederschlag 5 312 Zeilen; ρ-Ziel per CV: Form K je Bin ρ_f/heutiges 5/9 · 4/3 · 4/3 · 9/5 · 11/3 · **14/0**);
**Scorecard 5b** (`score\2026-09-25-fx5b`, 77 min). Beide Scorecards: **6 805 912 bewertete Zeilen = Scorecard 4** (like-for-like), 10 505
Score-Zellen (mit `lead:`/`season:`), 7 548 DM-Tests mit BH-FDR; G2 mit rms-Spread und randomisierter PIT (S/S-Spalte „vor → nach" latent =
like-for-like). Vergleichstabellen `compare-score.md` (4 → 5a, 5a → 5b), `compare-score-vs4.md` (4 → 5b), `compare-fit*.md`.

**Scorecard 5b gegen Scorecard 4, Form K, Schicht `all` (CRPS; * BH-signifikant, ! signifikant schlechter):**

| Größe · Bin | CRPS 4 → 5b (Δ) | davon 5a (C8 allein) | vs Cube 4 → 5b | vs Klima 4 → 5b | G1 G2 G4 4 → 5b |
|---|---|---|---|---|---|
| T · 0–6 / 7–24 / 25–48 | 0,726 → 0,716 (−1,4 %) / 0,828 → 0,814 (−1,8 %) / 0,929 → 0,907 (−2,4 %) | −1,3 / −1,6 / −2,4 % | 22,5 → 23,6 %* / 22,4 → 23,8 %* / 18,2 → 20,1 %* | 67,5 / 63,7 / 59,4 %* | ✓✓✓ |
| T · 51–120 / 126–240 | 1,176 → 1,135 (−3,5 %) / 1,683 → 1,637 (−2,8 %) | −2,7 / −1,7 % | 16,0 → 19,0 %* / 6,4 → 9,0 %* | 47,8 / 25,1 %* | ✓✓✓ |
| **T · 246–336** | **2,339 → 2,103 (−10,1 %)** | −2,9 % | 1,0 → **11,0 %*** | **−6,6 %! → +4,1 %*** | ✗✓✓ → **✓✓✓** |
| Td · 0–6 … 126–240 | −1,6 / −1,3 / −0,8 / −1,7 / −1,9 % | −2,0 / −1,8 / −1,1 / −1,9 / −1,2 % | 14,0 → 15,4 … 10,6 → 12,3 %* | 66,4 … 17,6 %* | ✓✓✓ |
| **Td · 246–336** | **2,382 → 2,084 (−12,5 %)** | −3,4 % | −0,5 → **12,0 %*** | **−12,8 %! → +1,3 % (n.s.)** | ✗✓✓ (Klima-Niveau) |
| Wind · 0–6 / 7–24 / 25–48 | 0,754 → 0,727 (−3,6 %) / 0,752 → 0,724 (−3,7 %) / 0,783 → 0,753 (−3,8 %) | −0,6 / −0,8 / −0,6 % | 11,5 → 14,7 / 13,6 → 16,8 / 18,7 → 21,8 %* | 21,2 / 12,0 / 8,7 %* | 0–6 h G2 ✗ → ✓ (rms 0,87, PIT 0,227) |
| Wind · 51–120 | 0,899 → 0,856 (−4,8 %) | −0,8 % | 26,1 → 29,6 %* | 3,6 → 8,2 %* | G2 ✗ → ✓ (rms 0,95, PIT 0,190) |
| Wind · 126–240 / 246–336 | 1,005 → 0,954 (−5,0 %) / 1,061 → 1,008 (−5,0 %) | −1,1 / −0,5 % | 6,6 → 11,3 / 7,2 → 11,8 %* | **−9,6 → −4,1 %!** / **−15,5 → −9,7 %!** | ✗✓✓ / ✗✗✓ → ✗✓✓ |
| Böe · 0–6 / 7–24 / 25–48 / 51–120 | −4,8 / −6,3 / −5,7 / −5,6 % | −1,1 / −1,7 / −1,8 / −1,5 % | 15,2 → 19,3 … 11,4 → 16,4 %* | 37,3 / 27,2 / 21,8 / 20,4 %* | 7–24/25–48 h G2 ✓ → ✗ (PIT-Rand **0,149 / 0,146**, rms 0,98/0,99) |
| **Böe · 126–240 / 246–336** | 1,645 → 1,522 (−7,5 %) / **1,763 → 1,577 (−10,5 %)** | −1,1 / −2,6 % | 11,5 → 18,1 / 14,0 → 23,0 %* | **−4,6 %! → +3,2 %*** / **−11,8 %! → −0,1 % (n.s.)** | 126–240 h G1 ✗ → ✓ |
| Bewölkung (DE) · 0–6 / 7–24 | 12,306 → 12,444 (**+1,1 %**) / 14,865 → 15,010 (**+1,0 %**) | +0,4 / +0,1 % | 16,2 → 15,3 / 14,6 → 13,8 %* | 43,3 / 36,2 %* | 0–6 h G2 ✓ → ✗ (PIT **0,297** randomisiert — real, D6) |
| Bewölkung · 25–48 / 51–120 / 126–240 | +0,2 / +0,1 / +0,3 % | **−2,5 / −1,1 / −0,3 %** | 10,1 → 9,9 / 12,4 → 12,3 / 12,8 → 12,5 %* | 26,9 / 19,5 / 5,5 %* | G2 ✗ (PIT 0,28–0,29) |
| Bewölkung · 246–336 | 20,980 → 20,471 (−2,4 %) | −1,1 % | 13,5 → 15,6 %* | −0,9 → +1,6 % (n.s.) | ✗✗✓ |
| Niederschlag · 0–6 / 7–24 / 25–48 / 51–120 / 126–240 / 246–336 (like-for-like **vs Cube**) | +2,2 %* / +0,1 / +0,4 / **+1,2 %*** / +0,4 / +0,2 % | identisch (5a = 5b) | — | — | 51–120 h G1 ✗ → ✓; 7–48 h jetzt geschrieben (Halbmonatsfalten), = K-2 |

Wind je Land/Band (4 → 5b): **DE −4,9 / −1,9 / −5,7 / −3,2 / −2,6 / −3,4 %** (V-FL-38 „DE +2,8 %" mehr als ausgeglichen), AT −2,9 / −7,0 / −1,9 / −7,0 /
−7,8 / −6,6 %, CH −1,9 / −4,3 / −1,7 / −5,9 / −7,8 / −7,1 %, ≥ 800 m −4,5 / −4,7 / −4,8 / −6,5 / −9,0 / −10,1 %, < 800 m −2,9…−4,1 %. Wind gegen Klima
je Schicht (4 → 5b): 126–240 h DE −1,7 % (n.s.) → **+1,0 % (n.s.)**, < 800 m −3,9 → −0,4 % (n.s.), AT −18,9 → −9,7 %!, CH −21,5 → −12,1 %!,
≥ 800 m −25,7 → −14,4 %!; 246–336 h all −15,5 → −9,7 %!, ≥ 800 m −30,4 → −17,3 %!. Böe gegen Klima 126–240 h: DE +0,4 → +4,9 %*, AT −10,6 →
+1,0 %, CH −8,8 → +2,0 %*; 246–336 h alle Schichten −0,1…+0,6 % (n.s.). T 246–336 h gegen Klima je Land: DE +4,1 %*, AT +3,2 % (p 0,07), CH +4,9 %*;
Td 246–336 h +0,4…+1,8 % (n.s., Klima-Niveau). **Kreuzungsstunden fl-K gegen Klima (Zellen `lead:`, pooled über Routen; Scorecard 4 aus der
Diagnose → 5a → 5b):** T 264 → 276 → **keine**, Td 234 → 240 → 312 h, Wind 105 → 117 → 144 h, Böe 156 → 162 → 222 h, Bewölkung/Niederschlag keine.
Anspruch B (Region-Holdout des Fits 5b gegen Fit 4, Form K): T −1,2…−22,6 %, Td −0,9…−19,0 %, u/v −2,1…−12,5 %, Böe −9,3…−28,1 %, Bewölkung
−0,5…−8,6 %; **Band-Holdout (Training nur im anderen Höhenband) gemischt:** T 25–48 h +9,4 %, 51–120 h +19,6 %, 126–336 h −11,6/−22,5 %, Td und
Böe −6…−39 % — die Halbmonatsfalten allein (Fit 5a) wählen kleinere λ und verschlechtern den Band-Holdout deutlich (T 7–48 h +17…+21 %, Böe
+42…+160 %) bei neutralem Region-Holdout (V-FX-26); die μ_c-Spalte holt ihn zurück.

**Regressionen > 1 % (Schicht `all`, fl-K):** nur Bewölkung 0–6 h +1,1 % (und 7–24 h +1,0 %) — in Scorecard 5a (C8 allein) war die Bewölkung
±0…−2,5 %, der Rückschritt kommt aus Fit 5b: die CV-Zielwahl entscheidet nach MSE und wählte für **alle** K-Bewölkungs-Strata das ρ_f-Ziel
(MSE 709,7 → 708,6 bei 0–6 h, 1 058 → 1 043 bei 25–48 h), der CRPS der zensierten, bimodalen Größe verschlechtert sich dabei um +0,7…+2,8 %
(5a → 5b) — MSE-optimale Schrumpfung Richtung μ_c ≈ 70 % zieht die Masse von den Atomen weg (V-FX-25). fl-P: Td 7–24 h +1,2 %, Bewölkung
25–48/126–240 h +1,1 %. In den Schichten: fl-K Td DE 0–6/7–24 h +1,1/+1,4 % (aus 5a → 5b, μ_c-Spalte bei λ 0,01–0,3 — die Vier-Monats-Kontrolle
hatte Td 51–240 h genannt), Bewölkung wie oben; LI (ein Punkt) ±2 %.

**Gate-Wechsel (fl-K, 4 → 5b, alle erklärt):** ✗ → ✓: T 246–336 h G1 (gegen Klima +4,1 %*), Wind 0–6/51–120/246–336 h G2 (rms-Spread 0,87–0,95,
PIT 0,19–0,23 — M1-Maß; die Rice-Unterdispersion ≥ 800 m bleibt in den Schichten sichtbar), Böe 126–240 h G1 (gegen Klima +3,2 %*), Niederschlag
51–120 h G1 (gegen Cube +1,2 %*); ✓ → ✗: Böe 7–24/25–48 h G2 (PIT-Rand 0,149/0,146 knapp unter 0,15 — mit Skala 1 statt 0,9 leicht überdispers am
Rand; CRPS −6,3/−5,7 %), Bewölkung 0–6 h G2 (randomisierte PIT 0,297: die Atome werden bei 0–6 h nur halb erreicht — der alte Wert 0,176 war das
Mittelpunkt-Artefakt, V-FX-2). Kein Gate-Verlust durch eine Vorhersage-Verschlechterung außer der Bewölkung 0–48 h (+1 %).

**Niederschlag like-for-like (V-FX-4-Regel):** die Brier-Tabelle des Vergleichs mischt weiter Zeilenmengen (126–240 h „0,0630 → 0,0838" = Lauf-
Route-Zeilen gegen alle Routen; 246–336 h fl-K nur r3-Zeilen) — gültig sind nur die Paare: fl-K gegen Cube +2,2 %* (0–6 h, n 538 217), +0,1 %
(7–24 h, 806 028), +0,4 % (25–48 h, 1 064 925), +1,2 %* (51–120 h, 2 182 407), +0,4 % (126–240 h, p 0,064), +0,2 % (246–336 h, 532 611); Hürden-CV
Fit 5b (Form K, oof Brier gegen Cube): Tag 0 0–6 h 0,0450/0,0533, Lauf 0–6 h 0,0410/0,0419, 7–24 h 0,0463/0,0467, 25–48 h 0,0521/0,0523,
51–120 h 0,0562/0,0567, 126–240 h 0,0626/0,0631, 246–336 h no-skill (0,0673/0,0664); dyn 51–120 h 0,0795/0,0831, 126–240 h 0,0906/0,0924,
246–336 h 0,0935/0,0939. Mit Halbmonatsfalten ist die Hürde bei 7–48 h jetzt `written`, gewinnt aber nichts (gleich K-2) — das Datenurteil
aus §2.5 bleibt: 7–48 h kein Verdikt vor dem Winter.

**Windgesetz in Fit 5b (Form K, alle 30 Einträge geschrieben, 0 no-skill):** gepoolt r1 0–6/7–24 h `add` (−0,9 · 1,15 · 1,25) ohne Rand, oof
−1,56/−1,52 %, PIT-Rand 0,255 → 0,192; 25–48/51–120 h `add` (−1,2 · 1,3 · 1,1) −2,31/−1,98 %; r3 51–120 h `add` (−1,8 · 1,3 · 1,25) Rand [a] −4,01 %,
126–240/246–336 h r3 `sd` (−1,5 · 1,45 · 1,25) Rand [b] −3,25/−3,93 %; Bänder: < 800 m `add` bis −6,89 % (r3 51–120 h), ≥ 800 m durchweg `sd`
(−1,2…−1,5 · 1,45 · 1,1–1,7) am b-Rand (1,45), −0,33…−3,09 % (r1 51–120 h ≥ 800 m nur −0,33 %; `add` dort +1,73 % — die Rice-Nähe der Berge
aus D3). Randzähler K: a 6, **b 12** (alle ≥ 800 m-Einträge), c 1; sd 11/30. Der Client nimmt weiter den gepoolten Eintrag (kein Band im
`PredictSituation`).

**Kosten/Größen:** Client-Tabellen 5a 117 KB / **25,5 KB gz**, 5b 132 KB / **28 KB gz** (Fit 4: 24,8; +Band-Einträge, +μ_c-Spalte) — 5b ist eine
`station`-Tabelle und rechnet im Client ohne Lernstufe (E-FX-1/E-FX-7). Code-Gates unverändert seit §6.2 (91/91, 314/314, 165/165, 14/14, 229/229,
Build 241/241, totalJs 1 444,5 KB); Nachprüfung 26.09. früh: `verify:fusion-fit` 91/91, typecheck grün.

**Lesart gegen die vier Prioritäten:**
1. **Langer Vorlauf:** T 246–336 h −10,1 % CRPS und erstmals signifikant besser als die Stationsklimatologie (+4,1 %*, Kreuzung „keine"); Td −12,5 %
   auf Klima-Niveau; Böe −10,5 % auf Klima-Niveau (126–240 h +3,2 %*); Wind −5,0 % je Bin, Verlust gegen Klima halbiert (−4,1/−9,7 %), im Flachland
   gleichauf (DE 126–240 h +1,0 % n.s., < 800 m −0,4 % n.s.) — der Rest sitzt ≥ 800 m (−14/−17 %: Talwind/Exposition, σ_c(h, doy) und Familie, §2.2).
   Der Gewinn kommt aus der μ_c-Spalte mit CV-Ziel (5a → 5b: T −7,4 %, Td −9,4 %, Böe −8,2 % bei 246–336 h) **auf Stationspunkten** — Anspruch B
   dafür nur über den Region-Holdout (−19…−28 % bei 246–336 h) belegt, nicht an stationslosen Punkten (E-FX-1).
2. **Standortabhängigkeit:** V-FL-38 erledigt — DE gewinnt jetzt in jedem Bin (−1,9…−5,7 %), AT/CH −1,7…−7,8 %; Wind-G2 grün in `all`, ≥ 800 m
   bleibt unterdispers (Schichten). Bänder skalieren ≥ 800 m vor allem c; b am Rand 1,45 (V-FX-28).
3. **Niederschlag:** kein Gewinn jenseits 0–6 h — die Hürde ist bei 7–48 h jetzt geschrieben und dem Cube gleich; 51–120 h +1,2 %*; Winter-Verdikt offen.
4. **T/Td-Plateau:** −1,4…−3,5 % (T) und −0,8…−1,9 % (Td) bei 0–240 h aus Halbmonatsfalten und μ_c-Spalte; die Streuungsstruktur (D4) ist nicht
   angefasst (M2 = nächste Iteration); Spread/Skill rms 1,00 in jedem Bin, PIT-Rand 0,167–0,203.
**Verworfen/zurückgestellt aus den Läufen:** ρ_f-Ziel für die Bewölkung (V-FX-25 — nächster Fit: CRPS-basierte Zielwahl oder Bewölkung vom Ziel
ausnehmen), Skalenregel bleibt (Böe-PIT 0,146–0,149 als Preis benannt).

### 6.4 Stufe FX-4 — Klimatologieprodukt für den Client (E-FX-1, Client-Seite von C1), 26.09.2026 — Protokoll VOR dem Lauf

**Auftrag (Jan, 26.09.):** E-FX-1 und die Client-Seite von C1 (μ_c in `cubeSource.ts`, additiv, nur hinter `FuseCubeOptions.learned`) sind
freigegeben; Anker-σ (M9), neue Familien in `dist.ts`/Codec (C4/A8/A9) und der A1-Band-Schlüssel im Client bleiben STOPP & FRAGEN. Kein Commit,
kein Push, kein Publisher-Lauf. Außerhalb des Auftrags (nur benannt): V-FX-25 (CRPS-Zielwahl Bewölkung), M2 σ-Modell, E-FX-3/5/6, Winterdaten 7–48 h.

**Kernproblem:** Scorecard 5b misst μ_c der Station AM bewerteten Punkt — eine Oberschranke. Ein Browser-Punkt hat keine Reihe; μ_c muss
aus den ANDEREN Stationen geschätzt werden. Ob der Langfrist-Gewinn (T −10,1 %, Td −12,5 %, Böe −4,8…−10,5 %, Wind −3,6…−5,0 %) das überlebt,
ist ungemessen; die gepoolte Klimatologie (Band|Land) brachte ±0,1 % (§6.2). Erst messen, dann bauen.

**Stufe 1 — Diagnose (Leave-Station-out, `audit/fusion-forschung/diag-fx4.mjs`, Schätzer in `src/point/fusionFit/climaProduct.ts` = EINE
Definition für Diagnose, Produktbau und Client):** an jeder der 389 Stationen wird μ_c (die 13 Koeffizienten je Größe der Stationsklimatologie
`fit\2026-09-23\clima.hindcast.json`) aus den übrigen 388 geschätzt — die Station selbst geht nie in ihre Schätzung ein (Leck-Prüfung: die
Schätzer geben die benutzten Stationen zurück; Verifier mit absichtlich leckender Kontrolle). Kandidaten: **(a)** k nächste andere Stationen
(k 1…3, IDW 1/(d² + 1 km²)) — für T/Td mit Höhenkorrektur je Koeffizient aus der Klimatologie selbst (Steigung des Koeffizienten über die
Stationshöhe, an den übrigen Stationen gefittet, keine Setzung), für Wind/Böe/Bewölkung/Niederschlag ohne (Variante a3h: Höhensteigung für alle
Größen — nur, wenn sie misst); **(b)** Ridge-Regression der Koeffizienten auf Standortmerkmale (dieselben `buildZ`-Spalten wie der Client:
TPI, svf, Senke, Hang, ln z0, Landbedeckung, d_water, See, imperv, d0, dazu Höhe, Höhe², Breite, Länge), λ je Größe × Koeffizient per
Leave-Region-out-CV (12 stärkste 1°-Kacheln + Rest, wie der Fit); **(a+b)** (b) als Trend + IDW k 3 der (a)-Residuen der Nachbarn (Kriging-light);
**(c)** nur T aus `ClimaField` (Meteostat, k 3, Lapse 6,5 K/km set) als Referenz. **Kontrollen:** eigene Stations-μ_c (Oberschranke = Fit 5b,
Fehler 0), gepoolte μ_c Band|Land (Unterschranke), verwürfelte Nachbar-μ_c (Derangement der Stationen, an der eigenen Länge ausgewertet —
Negativkontrolle). **Maß:** RMSE von μ̂_c − μ_c über ein Jahr Stunden (zweites Moment der Klima-Designzeile an der Stationslänge) und der
Jahresmittel-Fehler, je Größe × Land × Band (≥ 800 m getrennt) und nach Abstand zur nächsten anderen Station (Kovariate d_nn, Bins < 10 /
10–20 / 20–35 / > 35 km). **X** = mittlerer Abstand eines DACH-Landpunkts zur nächsten Station, gemessen auf einem 0,05°-Gitter in den
Landesgrenzen (`public/countries/*.geojson`), nicht geschätzt. Ergebnis `diag-fx4.{json,md,log}`; die LOSO-Klimatologiedokumente je Kandidatin
(`fit\2026-09-26-fx4\clima.loso.<kand>.json`, Schema der Stationsklimatologie, `byPoint[id][v].mu` = Schätzung OHNE die Station) sind die
Eingabe der Stufe 2.

**Stufe 2 — die entscheidende Messung:** Fit 5c = Flags von Fit 5b (`--stride=6 --folds=half --climaCols=station --rhoTarget=cv --speedGrid=v4
--speedBands=1 --scaleVars=clct`) plus `--climaMu=<LOSO-Dokument>`: μ_c-Spalte UND ρ_f-Akkumulator lesen das geschätzte μ_c; `tables.clima` und der
Referenzkandidat `clima` bleiben die Stationsklimatologie (like-for-like zu 5a/5b); die Tabellen tragen das geschätzte μ_c je Station
(`tables.climaMu`), damit der Scorer dieselbe Definition liest wie der Fit (ein Fit auf wahrem μ_c, bewertet mit geschätztem, wäre der falsche
Test). Scorecard 5c auf denselben 6 805 912 Zeilen (Stride 6) mit den neuen Scorer-Optionen `--refTables=<5a>,<5b>` (Kandidaten `fl-K@5a`,
`fl-K@5b` aus den Falten-β der Referenztabellen auf DENSELBEN Zeilen ⇒ DM/BH-Paare gegen fl-K) und Strata `dnn:<Bin>` (Abstand der Station zur
nächsten anderen Station — die Zahl, die sagt, was ein stationsloser Punkt bekommt). Vergleich 4 → 5a → 5b → 5c mit `compare.mjs`.

**Entscheidungsregel (festgelegt vor dem Lauf):** gebaut wird nur, wenn in Scorecard 5c (fl-K, Schicht `all`, DM mit BH-FDR auf denselben Zeilen)
1. das Paar fl-K gegen fl-K@5a für **T, Td, Böe und Wind in beiden Langfrist-Bins 126–240 h und 246–336 h** einen signifikanten Gewinn zeigt
   (Skill > 0, p_adj < 0,05);
2. **keine Größe × Bin in `all` mehr als 1 % CRPS gegen fl-K@5a verliert** — Ausnahme Bewölkung: dort ist fl-K@5b die Referenz (V-FX-25 liegt
   außerhalb des Auftrags und kostet in 5b schon +1,0 %; die Schätzung darf nicht mehr als 1 % obendrauf kosten);
3. **in keiner Land-/Band-Schicht (DE, AT, CH, < 800 m, ≥ 800 m; LI = ein Punkt, ausgenommen) eine Größe × Bin mehr als 2 % gegen fl-K@5a
   verliert** (Bewölkung wie 2.).
Fällt keine Kandidatin durch alle drei Bedingungen: STOPP, dokumentieren, benennen, was fehlen würde (mehr Stationen, Reanalyse-Klimatologie
je Zelle, Leave-Year-out) — nichts bauen. **Kandidatenwahl für Stufe 2:** die beste Schätzerin der Stufe 1 nach μ_c-RMSE (T/Td/Böe/Wind);
eine zweite nur, wenn sie innerhalb von 10 % des RMSE liegt UND im Client einfacher ist (weniger Eingaben, kleineres Produkt). Ein Lauf
Fit + Scorecard kostet ≈ 3 h auf 4 Kernen (Fit 5b 97 min, Scorecard 5b 77 min) — ein Prozess je Variante, Maschine frei (V-FL-12).

**Stufe 3 (nur nach bestandener Regel):** Produkt lokal (`scripts/fusionfit/clima-product.mjs` → `C:\dev\buscosun-hindcast\product\<Datum>\`),
Form nach der Messung (Stationstabelle ≤ 110 KB gz, lazy, nie auf dem kritischen Pfad — oder Kacheln im Chunk-Raster ≈ 1 KB je Punkt), mit
Provenienz (Quellstationen und Lizenz je Land: DWD CDC CC BY 4.0/GeoNutzV, GeoSphere Austria CC BY 4.0, MeteoSwiss OGD CC BY 4.0 — keine NC,
keine unklare Lizenz), Fit-Version, Koeffizientendefinition; nichts ins Daten-Repo (Publisher-Weg `point/static/clima/` = Jans Gate, analog
E-F-20). Client: Leser in `src/point/client/` (Store, Cache, Frist, benannte Abwesenheit), `cubeSource.ts` reicht μ_c additiv nur mit `learned`
UND Produkt; ohne Produkt heutiges Verhalten, benannt; Provenienz `hindcast` mit Schätzername. Fit-5c-Client-Tabelle (Form K, schlank nach
V-FL-28, mit anchor-Block); die Fit-4-Tabelle bleibt lesbar (E-FX-7). Der Band-Schlüssel (A1) wird NICHT übergeben (STOPP & FRAGEN, E-FX-4).
Gates in dieser Reihenfolge auf freier Maschine: typecheck → `verify:fusion-fit` (neuer Block: Schätzer-Rückgewinnung an synthetischen Stationen
der echten Datenform + verwürfelte Nachbarn; Leck-Prüfung mit absichtlich leckender Kontrolle) → `verify:pv-cube` (neuer Block: ohne `learned`
byte-gleich; `learned` ohne Produkt = heutiger Lernpfad; `learned` + Produkt ⇒ μ_c erreicht `predict` und die Provenienz sagt es; je mit
Negativkontrolle) → `verify:point-client` (Leser, Cache, Frist, Abwesenheit) → `verify:calib-fit` → `verify:pv-fusion` 229/229 → Build → Budget
(eagerJs 107,9, totalJs nicht anheben — E-FL-11 ist Jans) → Mobil-4G erste Darstellung mit `?pf=cube&pflog=1` ohne Regression.

**Ergebnis Stufe 1 (26.09., `diag-fx4.{md,json,log}`, 389 Stationen, 102 s; Leck-Prüfung im Skript: keine Schätzung enthält die ausgelassene Station):**

| Kandidatin | T [K] | Td [K] | u [m/s] | v [m/s] | Böe [m/s] | Bewölkung DE [%] | Rang (RMS/pooled über T/Td/Böe/u/v) |
|---|---|---|---|---|---|---|---|
| **ridge** (Trend auf allen Merkmalen, λ Leave-Region-out je Größe × Koeffizient) | **1,02** / p90 1,51 | 0,67 | **0,71** | 0,64 | **1,27** | 5,01 (≥ 800 m **12,6**) | **0,716** |
| **ridgeT** (Trend nur Höhe/Lage/Gelände — was der Browser im Kern hat) | 1,06 | 0,68 | 0,70 | 0,65 | 1,31 | 4,58 (≥ 800 m 10,6) | 0,727 |
| krig3 (ridge-Trend + IDW k 3 der Nachbar-Residuen) | 1,03 | **0,59** | 0,76 | 0,68 | 1,35 | 5,16 | 0,744 |
| ridgeG (nur Höhe, Höhe², Breite, Länge) | 0,93 | 0,71 | 0,77 | 0,64 | 1,50 | 4,19 | 0,755 |
| idw3h (3 Nachbarn, Höhensteigung alle Größen) | 1,18 | 0,68 | 0,93 | 0,74 | 2,07 | 3,94 | 0,917 |
| idw3 (3 Nachbarn, Höhensteigung nur T/Td) | 1,18 | 0,68 | 0,97 | 0,72 | 2,48 | **3,86** | 0,966 |
| idw1 | 1,40 | 0,83 | 1,12 | 0,84 | 2,94 | 4,63 | 1,138 |
| idw3n (ohne Höhensteigung) | 3,00 | 2,80 | 0,97 | 0,72 | 2,48 | 3,86 | 1,408 |
| cf (`ClimaField`, nur T) | 2,14 | — | — | — | — | — | — |
| pooled (Band\|Land, Unterschranke) | 1,87 | 1,70 | 0,78 | 0,63 | 1,76 | 4,10 | 1,000 |
| shuffle (Negativkontrolle) | 4,17 | 4,16 | 1,23 | 1,05 | 3,07 | 6,37 | 1,932 |

Lesart: **(1)** die Höhenkorrektur aus der Klimatologie selbst ist für T/Td alles (idw3n 3,0 K → idw3 1,18 K; die gefittete Steigung des
Jahresmittels ≈ −5,6 K/km, kein Setzwert); **(2)** der Merkmals-Trend schlägt die Nachbarn für T, Böe, u — die Standortinformation
steckt in Höhe, TPI, Hangneigung und Rauhigkeit, nicht in der Nähe (Kriging-Residuen helfen nur Td); **(3)** **Wind bleibt schwer:** u/v des
Trends liegen nur 9 % / 0 % unter der gepoolten Klimatologie (Exposition und Talwind sind lokal, in keinem Merkmal) — genau dort, wo
Fit 5b −3,6…−5,0 % gewann; **(4)** die Bewölkung (nur DE, 16 Bergstationen) sprengt jeden Trend (≥ 800 m RMS 10,6–12,6 % gegen idw3 5,0 %) ⇒
Bewölkung nimmt idw3; **(5)** der Fehler wächst NICHT mit dem Stationsabstand (T ridge: < 10 km 1,26 K, 10–20 km 1,11, 20–35 km 0,87,
> 35 km 0,91 — die Nahen sind die Alpenstationen; das Gelände dominiert, nicht die Distanz) ⇒ die LOSO-Messung an den Stationen ist für
den Browser-Punkt konservativ bis neutral; **(6)** `ClimaField` (heutige Motor-Referenz, Meteostat) ist mit 2,14 K schlechter als die
gepoolte Stationsklimatologie (1,87 K). **X gemessen:** DACH-Landgitter 0,05° (25 631 Punkte) — mittlerer Abstand zur nächsten Station
**17,7 km** (p50 17,0, p90 29,2; DE 19,0 · AT 15,1 · CH 9,6 km; > 20 km 38 %, > 35 km 3 %); die Stationen untereinander d_nn p50 21,6 km
(DE 29,4 · AT 19,5 · CH 13,0).

**Kandidatenwahl für Stufe 2 (nach der Regel oben, vor dem Lauf):** **5c = ridgeTx** — der Gelände-Trend (`TREND_SETS.terrain`: Höhe, Höhe²,
Breite, Länge, TPI 500/2000, svf, Senke, Hang, Hang·cos/sin Aspekt; alles, was jede Cube-Antwort schon im Kern trägt) für T/Td/u/v/Böe/
Niederschlag, **Bewölkung idw3** (Regel 4); **5d = ridgex** — derselbe Aufbau mit dem vollen Merkmalssatz (dazu ln z0, Landbedeckung, d_water,
See, imperv, d0, die im Browser spät oder nur mit `landCover` kommen): ridge ist die beste Schätzerin (0,716), ridgeT liegt 1,5 % dahinter
und ist im Client einfacher ⇒ beide laufen, 5c zuerst. Nicht gelaufen: krig3 (nicht einfacher, +4 %), idw-Familie (+28 % und mehr).
Die LOSO-Dokumente `fit\2026-09-26-fx4\clima.loso.{ridgeTx,ridgex}.json` tragen je Station und Größe die Schätzung OHNE die Station
(Trend und Höhensteigung je Station neu gefittet, λ je Station per Leave-Region-out ohne sie); `byVar`-Selbstkontrolle im Skript
(Bewölkung = idw3, Rest = Trend) bestanden. Kette `fx5c-chain.sh`: Fit 5c → Scorecard 5c (`--refTables=5a,5b`, `dnn:`) → Fit 5d → Scorecard 5d.

**Ergebnis Stufe 2 (26.09., Fit 5c `fit\2026-09-26-fx5c` 08:12–10:26 UTC = 2 h 14 min bei paralleler Arbeit; Scorecard 5c `score\2026-09-26-fx5c`
10:26–13:25 UTC = 2 h 59 min, 6 805 912 Zeilen = Scorecard 4/5a/5b, 14 441 Score-Zellen, 12 411 DM-Tests mit BH-FDR — die zwei Referenzkandidaten
und die vier `dnn:`-Strata verdoppeln die Scorer-Zeit, V-FX-36; Regel angewandt mit `audit/fusion-forschung/fx4-decision.mjs` →
`fx4-decision-5c.md`):** Fit 5c schreibt 258/37/0 Strata wie 5a/5b, kein Rückfall auf pooled, ρ-Ziel per CV bei 246–336 h 13/1 (5b 14/0: u nimmt mit
geschätztem μ_c wieder Ziel 1, β_cube 0,24 → 0,76); Zeitfalten-MSE gegen Fit 5b: T 246–336 h +5,7 %, Td +2,1 %, u/v +4,4…+7,3 % in jedem Bin, Böe
+7,9…+11,8 %, Bewölkung +0,5…+1,2 %, Niederschlag ±0. Client-Tabelle 5c 133 KB / 28,9 KB gz (station-Design).

| fl-K, Schicht `all` | 5c gegen fl-K@5a (%, DM/BH) | 5b gegen 5a (aus CRPS) | 5c gegen fl-K@5b | 5c gegen Klima |
|---|---|---|---|---|
| T 126–240 / **246–336 h** | +0,3 (p 0,36) / **+4,7*** | +1,1 / +7,4 | −0,8 / −2,9 ! | +24,5* / +1,3 (n.s.) |
| Td 126–240 / **246–336 h** | +0,3 (p 0,78) / **+8,5*** | +0,7 / +9,4 | −0,4 ! / −1,1 ! | +17,3* / +0,2 (n.s.) |
| Wind je Bin 0–6 … 246–336 h | +0,4* · +0,3* · +0,4* · +1,6* · +1,1* · +0,6* | +2,9 · +2,8 · +3,2 · +3,9 · +4,0 · +4,5 | −2,5…−4,1 ! | 126–240 h −7,1 !, 246–336 h −14,2 ! (5b −4,1 / −9,7) |
| Böe 0–48 / 126–240 / 246–336 h | −0,1…−0,3 (0–6, 25–48 h !) / **+1,9*** / **+2,8*** | −3,7…−4,6 / +6,4 / +8,2 | −4,1…−5,8 ! | 126–240 h −1,4 (n.s.; 5b +3,2*), 246–336 h −5,9 ! |
| Bewölkung DE 0–6 … 246–336 h | −1,1 ! · −2,1 ! · −3,2 ! · −1,1 ! · −1,0 · +0,8 | −0,7 · −0,9 · −2,8 · −1,2 · −0,7 · +1,3 | −0,4 ! · **−1,1 !** · −0,4 ! · +0,2 · −0,3 ! · −0,5 ! | +43…+1 % |
| Niederschlag | 0,0 in jedem Bin (die Hürde liest kein μ_c) | 0,0 | 0,0 | +40…+58* |
| T/Td 0–120 h | T −0,1…−0,2 (0–6 h !), Td −0,4…−0,8 (0–6/51–120 h !) | T +0,0…+0,8, Td −0,2…−0,4 | | |

Schichten (Regel 3, gegen 5a): keine Zelle unter −2 %; an der Grenze Wind DE 7–24 h −2,0 %!, Td DE 25–48 h −1,7 %!, Böe DE 0–6 h −1,2 %!; AT/CH
gewinnen beim Wind +2,0…+4,5 %*, DE verliert −0,2…−2,0 %. **Nach Abstand zur nächsten anderen Station (`dnn:`, gegen 5a):** T 246–336 h +3,4 / +3,3 /
+5,7 / +6,3 %* (< 10 / 10–20 / 20–35 / > 35 km) und Td +8,0 / +7,2 / +8,9 / +10,0 %* — der Trend trägt fern der Alpen am meisten; **Wind nur nah:**
51–120 h +4,5* / +2,4* / +0,9* / **−1,3 %!**, 246–336 h +1,5* / +1,3* / −0,4 ! / +0,2 — jenseits 20 km (38 % der DACH-Landpunkte, V-FX-32) bleibt
vom Windgewinn nichts; Böe +1,9…+4,2 %* in jedem Abstand. Kreuzungsstunden gegen Klima 5c: T 312 h (5b keine), Td 300 h (312), Wind 126 h (144),
Böe 174 h (222). G1 bei 246–336 h nirgends (Klima nicht signifikant geschlagen: T +1,3 %, Td +0,2 %).

**Verdikt nach der Regel von oben: NICHT bauen.** Regel 1 verletzt — T und Td gewinnen bei 126–240 h gegen 5a nur +0,3 % (p 0,36 / 0,78; mit wahrem
μ_c waren es +1,1 / +0,7 %); Regel 2 verletzt — Bewölkung 7–24 h −1,1 %! gegen 5b (und −1,1…−3,2 %! gegen 5a); Regel 3 erfüllt. Was überlebt die
Schätzung: der **T/Td-Gewinn bei 246–336 h zu 63 / 90 %** (+4,7 / +8,5 %*), der **Böen-Gewinn ab 126 h zu ≈ 30 %** (+1,9 / +2,8 %*), vom **Wind ein
Fünftel** (+0,3…+1,6 %*, nur < 20 km); verloren: T/Td 126–240 h, die Klima-Überlegenheit bei T 246–336 h (Kreuzung 312 h statt keine), Böe 126–240 h
gegen Klima, jede Bewölkungszelle. **Fit 5d (ridgex, voller Merkmalssatz) abgebrochen** (13:41 UTC, Verzeichnisse entfernt): der Bewölkungs-Schätzer
ist derselbe (idw3) ⇒ Regel 2 identisch verletzt, T/Td 126–240 h können mit μ_c-RMS 1,02 statt 1,06 K nicht signifikant werden — 6 Maschinenstunden
ohne Entscheidungsgehalt. **Nicht gebaut** (kein Client-Produkt, keine Client-Tabelle aus Fit 5c — E-FX-7 bleibt).

**Was fehlen würde (benannt, nicht gebaut):** (1) **Wind:** eine Klimatologie, die Exposition trägt — μ_c^mod je Zelle aus dem Modellwind (Producer:
Monatsmittel u/v/Böe je Cube-Zelle als statisches Produkt; im Fit die Anomalieform μ = μ_c^mod + β(ȳ − μ_c^mod), Hypothese A3) oder eine
Reanalyse-Klimatologie je Zelle (ERA5-Land, CC BY 4.0, 9 km: u10/v10/T/Td stündlich) als Kachelprodukt — beides erst gegen die Stationen zu messen;
Anemometerhöhe/Exposition je Station als Merkmal. (2) **T/Td 126–240 h:** dort gewann auch das wahre μ_c nur 0,7–1,1 % — die Forderung ist mit
keiner Klimatologie erfüllbar; erfüllbar ist ein Produkt, das **nur bei 246–336 h für T/Td/Böe** trägt (μ_c-Spalte je Größe, `--climaVars=t,td,gust`,
Bewölkung/Wind ohne): es bestünde Regel 2 und 3, Regel 1 nur in der 246–336-h-Hälfte ⇒ **E-FX-8** (Jan: Regel je Größe × Bin lockern oder nicht).
(3) **Bewölkung:** vom μ_c-Ziel ausnehmen (V-FX-25/31). (4) **Stationen:** DE ≥ 800 m nur 16, die Alpen tragen den Fehler (T-RMS ≥ 800 m 1,4 K gegen
0,9 K < 800 m); mehr Bergstationen (DWD-Nebenstationen, GeoSphere-Nachbarn) senken den LOSO-Fehler dort, wo der Gewinn am größten wäre.

**Stufe 3 — vorbereitet und zurückgebaut:** während der Kette war die Client-Seite gebaut und geprüft (`POINT_CLIMA_PATH = point/static/clima/v1/stations.json`,
Leser `src/point/client/climaPoint.ts` nach dem Muster `learnedPoint.ts`, `CubeIo.climaSource: 'json'`, μ_c EINMAL je Abfrage aus dem Produkt am Punkt und je
Schritt in `PredictSituation.muC` — nur mit `learned` + Tabellen; Provenienz in der Zeile `learned:hindcast` mit Schätzer/Stationen/nächster Station und
Notiz `learnedClima`; kein Band-Schlüssel, E-FX-4; Cache-Schlüssel `|clima:json`): typecheck grün, `verify:pv-cube` **319/319** (neuer Block 27: ohne
`learned` byte-gleich; none-Tabelle mit Produkt byte-gleich zum heutigen Lernpfad und benannt; station-Tabelle + Produkt μ = 0,5·ȳ + 0,5·μ_c exakt; station-
Tabelle ohne Produkt = Basis, benannt absent; Produktpfad/Cache-Schlüssel/fehlende Datei), `verify:point-client` **167/167** (Block 10r Leser: Hash,
Priorität low, nie still), Build 241/241, Budget eagerJs 107,9, **totalJs 1 447,4 KB (+2,9 KB gz im lazy `cubeSource`-Chunk)**. Nach dem Verdikt
zurückgebaut auf den Stand vor FX-4 (`cubeSource.ts`, `cubeFormat.ts`, `learnedPoint.ts`, beide Verifier byte-gleich zur Arbeitskopie davor; `climaPoint.ts`
gelöscht) — gemäß Auftrag „nicht bauen". **Geblieben (fit-seitig, 0 Bundle-Byte):** `src/point/fusionFit/climaProduct.ts` (Schätzer, vom Client nicht
importiert), `scripts/fusionfit/clima-product.mjs` + `lib/climaCandidates.mjs` (Produktbau lokal; `product\2026-09-26\clima\v1\stations.json` 77 KB /
24,9 KB gz, 389 Stationspositionen, Bewölkungskoeffizienten 201 Stationen, Trend 12 Merkmale × 13 × 7, Lizenzen DWD/GeoSphere/MeteoSwiss CC BY 4.0 —
nichts kopiert), `fit.mjs --climaMu`, `score.mjs --refTables`/`dnn:`, `tables.climaMu`, Verifier Block 13, `diag-fx4.*`, `fx4-decision.*`. Mobil-4G erste
Darstellung: nicht gemessen — ohne Client-Änderung gibt es nichts zu messen (`defaultCubeIo` setzt weder `learnedSource` noch `climaSource`).
**Gates nach dem Rückbau (Maschine frei, 26.09. nachmittags, Reihenfolge des Auftrags):** typecheck grün · `verify:fusion-fit` **99/99** (Block 13 neu, 8 Prüfungen) · `verify:pv-cube` **314/314** (= Stand vor FX-4) · `verify:point-client` **165/165** · `verify:calib-fit` **14/14** · `verify:pv-fusion` **229/229** (Live-Pfad unberührt) · Build **241/241** · Budget eagerJs **107,9** unverändert, largestChunk 301,2, **totalJs 1 444,7 KB** (+0,2 KB gz gegen 1 444,5: die `climaMu`-Prüfung in `validateTables`, lazy `cubeSource`-Chunk; weiter über der 1 438-Ratsche, E-FL-11 = Jans). `git status`: nichts unter `src/pointForecast/`, `dist.ts`, `v2codec.ts`; neu `climaProduct.ts`, `clima-product.mjs`, `lib/climaCandidates.mjs`, `diag-fx4.*`, `fx4-decision.*`; kein Commit.

### 6.5 Stufe FX-5 — schmales Klimatologieprodukt T/Td/Böe (E-FX-8) und die Windklimatologie-Frage (E-FX-9), 27.09.2026 — Protokoll VOR dem Lauf

**Auftrag (Jan, 26./27.09.):** E-FX-8 — die μ_c-Spalte nur für T, Td und Böe (`--climaVars=t,td,gust`); u/v, Bewölkung und Niederschlag behalten das
fusionFit@3-Design; Regel je Größe × Bin (unten). E-FX-9 — zuerst fit-seitig messen (kein Producer, kein Motor), ob eine Klimatologie des EIGENEN Cube-Windes
je Punkt (Hypothese A3, μ_c^mod aus den Fallzeilen m_u/m_v) den Wind dort trägt, wo die Stationsklimatologie es nicht kann (V-FX-29/37). Client-Seite von C1
für T/Td/Böe (μ_c nur hinter `FuseCubeOptions.learned` + Produkt) erst NACH bestandener Scorecard 5e; neue Familien in `dist.ts`/Codec, der A1-Band-Schlüssel
und jeder Motor-Eingriff bleiben STOPP & FRAGEN; kein Commit, kein Push, kein Purge, keine Kopie ins Daten-Repo, kein Publisher-Lauf.

**Stufe 1 — fit-seitig gebaut (Flags, ohne Option byte-gleich):**
1. `fit.mjs --climaVars=t,td,gust` (nur mit `--climaCols=station`): μ_c-Spalte, ρ_f-Ziel und cv-Probe NUR für die genannten Größen; jede andere Größe
   bekommt das `none`-Design und das fusionFit@3-Ziel — ihre Mittelwert- und Varianz-Strata müssen byte-gleich zu einem Fit ohne `--climaCols` sein
   (Negativkontrolle des Schalters, geprüft mit `audit/fusion-forschung/fx5-negcheck.mjs`). `tables.design.mean.climaVars` trägt die Liste (fehlend =
   alle Größen ⇒ Fit 5b/5c bleiben lesbar); EINE Entscheidung `tables.ts climaColumnsFor(design, v)` für `predict.ts`, Fit und Verifier; `validateTables`
   verlangt die μ_c-Spalte genau bei den gelisteten Größen und verbietet sie bei den anderen; `parseClimaVars` prüft die Liste (FIT_VARS, keine Dublette).
   Der Scorer folgt den Tabellen (`predict` je Größe), nennt die Liste im Kopf (`inputs.climaVars`). Verifier Block 14 (`verify:fusion-fit` **104/104**,
   5 Prüfungen): Entscheidung je Tabellenform, `validateTables` beide Richtungen (u MIT μ_c benannt, t OHNE μ_c benannt; Negativkontrolle: ohne Liste kippt
   die u-Meldung), `predict` — t braucht μ_c (0,7·ȳ + 0,3·μ_c exakt), u/v byte-gleich zur none-Tabelle mit denselben β, station-Tabelle ohne Liste meldet u/v absent.
2. `clima-product.mjs --vars=t,td,gust`: Trend, Höhensteigungen und Stationskoeffizienten nur für die genannten Größen; jede Stationsposition bleibt
   (Provenienz, nächste Station); `validateClimaProduct` benennt Trend/lapse/Stationskoeffizient einer Größe außerhalb `vars` (Block 14d).
3. A3-Messskript `audit/fusion-forschung/diag-fx5-a3.mjs` (Beschreibung und Leck-Regel unten).

**Rauchtest (t1, 2025-09…12, Stride 60 — V-FX-24 explizit, `--nmin=300,10`):** Fit A (`--folds=half`) gegen Fit B (Flags von 5b + `--climaMu` + `--climaVars`),
`fx5-negcheck`: Ergebnis unten; Scorer-Rauch ein Monat mit `--refTables=A`.

**Stufe 2 — die Messung (Maschine frei, Kette vom Werkzeugprozess gelöst — V-FX-34):** **Fit 5e** = Flags von Fit 5b (`--stride=6 --folds=half
--climaCols=station --rhoTarget=cv --speedGrid=v4 --speedBands=1 --scaleVars=clct`) + `--climaMu=fit\2026-09-26-fx4\clima.loso.ridgeTx.json` (geschätztes μ_c,
Kandidat ridgeTx wie 5c) + `--climaVars=t,td,gust` → `fit\2026-09-27-fx5e`; danach `fx5-negcheck` 5e gegen 5a (die u/v/clct/precip-Strata müssen byte-gleich zu
Fit 5a sein — 5a = nur `--folds=half`, gleiche Zeilen, gleicher Stride); **Scorecard 5e** auf denselben 6 805 912 Zeilen mit `--refTables=5a=…,5c=…` (5b entfällt:
jede Referenz kostet ≈ 1 h Scorer-Zeit, V-FX-36; die Regel liest nur 5a, 5c zeigt, was die Verengung kostet), Strata `dnn:`; `compare.mjs` 5a → 5e und 5c → 5e;
`fx4-decision.mjs --rule=fx5` mit der Regel unten.

**Entscheidungsregel (festgelegt vor dem Lauf; fl-K, Schicht `all`, DM mit BH-FDR auf identischen Zeilen gegen fl-K@5a):**
1. **T, Td und Böe bei 246–336 h** schlagen fl-K@5a signifikant (Skill > 0, p_adj < 0,05);
2. **keine Größe × Bin in `all` verliert mehr als 1 % CRPS** gegen fl-K@5a — das schließt Wind, Bewölkung und Niederschlag ein: Bewölkung und Niederschlag
   müssen bei exakt 0,0 % liegen (ihr Form-K-Pfad ist byte-gleich zu 5a: Mittelwert, Varianz, Skalenregel Bewölkung Pflicht in beiden, Hürde ohne μ_c);
   der Wind liegt NICHT bei 0 — sein Mittelwert-/Varianzmodell ist gleich 5a, das Speed-Gesetz aber auf dem geöffneten Gitter v4 mit Band-Verdikt (5b-Flag):
   die Wind-Zelle 5e gegen 5a misst damit den A1-Anteil des 5b-Gewinns allein, ohne μ_c (erstmals getrennt), und darf nicht unter −1 % liegen;
3. **keine Größe × Bin in DE/AT/CH/< 800 m/≥ 800 m verliert mehr als 2 %** gegen fl-K@5a; die `dnn:`-Strata werden berichtet (was ein stationsloser Punkt bekommt).
Fällt die Regel: STOPP, dokumentieren, nichts bauen. Besteht sie: Stufe 3 (Produkt lokal, Client-Wiring wie §6.4 „Stufe 3", Gates in der Auftragsreihenfolge).

**A3-Messung (E-FX-9, fit-seitig, `diag-fx5-a3.mjs`) — Aufbau vor dem Lauf:** je (Punkt, Stufe t1/t2/t3) die 13-Koeffizienten-Klimatologie (`C_NAMES`: Jahres-
und Tagesgang) des Cube-Members u/v/Böe aus den Fallzeilen (m_u, m_v, m_gust) — der Modellwind hat die Exposition der ZELLE, nicht der Station, und braucht
keine Station: er ist an jedem Cube-Punkt verfügbar. **Leck-Regel:** eine Klimatologie, die die bewertete Zeit enthält, ist ein Leck (dieselbe Wetterlage in
Referenz und Zeile) ⇒ μ_c^mod einer Zeile kommt aus den Halbmonatsgruppen OHNE die eigene Gruppe und ihre Nachbarn (Purge ±1 Halbmonat, wie die Zeitfalten);
Grams je (Punkt, Stufe, Größe, Halbmonat), Lösung je gehaltener Gruppe. **Vergleich** (Form K, u/v/Böe, alle Bins × Routen, Stride 12, Zeitfalten `half`,
λ per CV, Ridge-Ziel β_ȳ = ρ_f / β_μc = 1 − ρ_f mit cv-Probe wie 5b — `fitStratum` selbst): Design `none` (= 5a) gegen die μ_c-Spalte aus (a) `obs` =
Stationsklimatologie (3,3 Jahre, wie 5b; Oberschranke, V-FX-21-Leck benannt), (b) `obs1y` = Stationsklimatologie aus DENSELBEN Fallzeilen mit derselben
Leck-Regel (gleiche Stichprobenlänge wie mod ⇒ trennt Exposition von Reihenlänge), (c) `est` = ridgeTx-LOSO-Schätzung (= 5c, was der Browser heute bekäme),
(d) `mod` = μ_c^mod out of fold, (e) `shuf` = μ_c^mod des Nachbarpunkts (pointIdx + 1, an dessen Länge; Negativkontrolle — der Gewinn muss verschwinden).
**Maß:** Out-of-fold-MSE je Komponente (Zeitfalte des Mittelwertmodells, `cv.time`) je Größe × Bin n-gewichtet über die Routen, dazu aus den Falten-β je Zeile
der oof-Fehler nach Schicht (all, Land, Band, `dnn:`) mit DM/BH auf Tagesmitteln der quadrierten Fehler gegen `none`; für den Wind zusätzlich der MAE der
Vektor-Geschwindigkeit |μ_u, μ_v| gegen ff (deterministischer Stellvertreter — ohne Varianzmodell kein CRPS; der CRPS-Gewinn folgt erst aus einem Fit mit Produkt).
**Datengrenzen (benannt):** Fallzeilen 2025-09…2026-09 = 13 Monate ⇒ die Jahresharmonischen von `obs1y`/`mod` stammen aus ≈ 11,5 Monaten je Falte und tragen die
Anomalie DIESES Jahres; Lauf-Route t1 nur 2026-06…09 (Bins 0–2 der Lauf-Route = Sommer), day0-Route t1 alle Monate (Bins 0–2), dyn t2/t3 (Bins 3–5) alle Monate;
Böe je Stufe; an 405 Punkten = Stationspunkte (die Aussage „stationsloser Punkt" kommt über `dnn:` und darüber, dass `mod` keine Station liest).
**Entscheidungslesart (vorab):** E-FX-9 lohnt ein Producer-Produkt (Monatsmittel u/v/Böe je Zelle), wenn `mod` bei u/v out of fold gegen `none` in den Bins 3–5
signifikant gewinnt UND mindestens die Hälfte des `obs`-Gewinns hält UND `est` schlägt (insbesondere `dnn:20-35km` und `> 35 km`, wo `est` nichts trägt) UND `shuf`
nichts gewinnt. Sonst: E-FX-9 als ERA5-Land-Frage weiterreichen oder schließen.

**Kosten (Plan):** Fit 5e ≈ 2,2 h, Scorecard 5e mit zwei Referenzen ≈ 3 h, A3 ≈ 1 h (drei Durchläufe über die Fallzeilen); Kette `fit\fx5e-chain.sh`
(Fit 5e → negcheck → Scorecard 5e → compare → Entscheidung → A3), Log `fit\fx5e-chain.log`; gestartet mit PowerShell `Start-Process bash -WindowStyle Hidden`.

**Rauchtest (27.09., 22:02–22:05 UTC, `fit\smoke-fx5e-{A,B}`, `score\smoke-fx5e-B`):** Fit A 53 s, Fit B 62 s; `fx5-negcheck`: 8 Mittelwert-Strata außerhalb
der Liste byte-gleich zu A, 6 gelistete mit μ_c-Spalte, 6 Varianz-Strata gleich — **bestanden**; Scorer-Rauch (2025-09, `--refTables=A`): Bewölkung und Niederschlag
gegen fl-K@A exakt 0,00 %, `inputs.climaVars` im Kopf.

**Ergebnis Stufe 2 (27.09., Kette `fit\fx5e-chain.sh`, Log `fit\fx5e-chain.log`; Fit 5e `fit\2026-09-27-fx5e` 22:12–00:38 UTC = 2 h 26 min; `fx5-negcheck`
5e gegen 5a: **180 Mittelwert- und 121 Varianz-Strata von u/v/Bewölkung/Niederschlag byte-gleich zu Fit 5a, 112 gelistete Strata mit μ_c-Spalte — bestanden**;
dazu sind die 115 Mittelwert- und 112 Varianz-Einträge von T/Td/Böe **byte-gleich zu Fit 5c** (ein Stratum wird je Größe gefittet, die Spaltenentscheidung der
anderen Größen berührt es nicht — V-FX-42); ρ-Ziel per CV bei 246–336 h Form K 6/0; Client-Tabelle 128 KB / **28,3 KB gz** (`design.mean.climaVars` = [t, td, gust]);
Scorecard 5e `score\2026-09-27-fx5e` 00:38–03:25 UTC = 2 h 47 min, 6 805 912 Zeilen = Scorecard 4/5a/5b/5c, 14 441 Zellen, 12 411 DM-Tests mit BH-FDR;
Regel angewandt mit `fx4-decision.mjs --rule=fx5` → `audit/fusion-forschung/fx5-decision-5e.md`):**

| fl-K, Schicht `all` | 5e gegen fl-K@5a (%, DM/BH) | 5e gegen fl-K@5c | Lesart |
|---|---|---|---|
| T 246–336 h | **+4,7*** (126–240 h +0,3 n.s.; 0–6 h −0,2 !) | 0,0 | = 5c (byte-gleiche Strata); gegen Klima +1,3 % (n.s.), Kreuzung 312 h |
| Td 246–336 h | **+8,5*** (0–6/51–120 h −0,4 !) | 0,0 | = 5c; gegen Klima +0,2 % (n.s.), Kreuzung 300 h |
| Böe 126–240 / 246–336 h | **+1,9* / +2,8*** (0–6/25–48 h −0,2/−0,3 !) | 0,0 | = 5c; gegen Klima −1,4 (n.s.) / −5,9 % !, Kreuzung 174 h |
| Wind je Bin 0–6 … 246–336 h | **+0,4* · +0,3* · +0,7* · +1,7* · +1,1* · +1,0*** | 0,0 · 0,0 · **+0,3*** · **+0,1*** · 0,0 · **+0,4*** | = A1 allein (Gitter v4 + Band-Verdikt auf dem 5a-u/v-Modell): der GANZE Windgewinn von 5c; die u/v-μ_c-Spalte trug nichts oder kostete (V-FX-40) |
| Bewölkung DE je Bin | **0,0 exakt** (Negativkontrolle bestanden) | **+1,0* · +2,0* · +3,1* · +1,1* · +1,0 · −0,8** | die geschätzte Bewölkungs-μ_c (idw3) kostete in 5c bis 240 h (V-FX-41) |
| Niederschlag je Bin | 0,0 exakt | 0,0 | Hürde liest kein μ_c |

Schichten (Regel 3, gegen 5a): keine Zelle unter −2 %; Rand: **Wind DE 7–24 h −1,9 %!**, Td DE 25–48 h −1,7 %!, Wind DE 126–240 h −1,3 %!, AT 25–48 h −1,3 %!,
Böe DE 0–6 h −1,2 %!; AT/CH gewinnen beim Wind +2,1…+4,2 %*, ≥ 800 m +2,4…+3,0 %* (das Band-Gesetz trägt die Alpen, DE verliert bei 7–24 h — V-FX-40). `dnn:` (gegen 5a):
T 246–336 h +3,4 / +3,3 / +5,7 / +6,3 %*, Td +8,0 / +7,2 / +8,9 / +10,0 %* (< 10 / 10–20 / 20–35 / > 35 km — der Trend trägt fern der Stationen am meisten), Böe
126–336 h +1,0…+4,2 %* in jedem Abstand; Wind (A1) nur nah: 51–120 h +4,3 / +2,4 / +1,0 / **−0,7 %!**. G1 bei 246–336 h weiter nirgends (T/Td gegen Klima n.s.
besser); G2 T/Td 246–336 h ✓ (S/S 1,00, PIT 0,19–0,20), Böe 246–336 h ✗ (PIT 0,150).

**Verdikt nach der Regel von oben: BAUEN — alle drei Bedingungen erfüllt** (1: T/Td/Böe 246–336 h signifikant; 2: keine Zelle in `all` unter −1 %, Bewölkung/Niederschlag
exakt 0,0; 3: keine Schicht unter −2 %). Was der Browser damit bekäme (hinter `learned` + Produkt, nur T/Td/Böe): den Klimatologie-Anteil bei 246–336 h (T +4,7 %,
Td +8,5 %, Böe +2,8 %) und den Böen-Anteil ab 126 h; der Wind holt seinen Gewinn aus dem Speed-Gesetz allein.

**Stufe 3 — gebaut (27.09., 03:30–04:00 UTC; Client-Wiring exakt in der Form von §6.4 „Stufe 3"):**
- **Produkt** lokal `C:\dev\buscosun-hindcast\product\2026-09-27\clima\v1\stations.json` (`clima-product.mjs --estimator=ridgeTx --vars=t,td,gust --fitTables=<5e>`):
  **48 KB / 12,0 KB gz** (Vollprodukt 24,9 KB gz), Trend `terrain` (12 Merkmale) × 13 Koeffizienten × 3 Größen, 389 Stationspositionen ohne Koeffizienten
  (Provenienz, nächste Station), Lizenzen DWD CDC / GeoSphere / MeteoSwiss CC BY 4.0, `source.fitTables` = Fit 5e; **nichts kopiert** (Publisher-Weg
  `point/static/clima/v1/` = Jans Gate, E-FX-10). `clima-product.mjs` war seit dem FX-4-Rückbau nicht mehr lauffähig (Import von `CLIMA_PRODUCT`/`CLIMA_VERSION`
  aus `cubeFormat.ts`, die der Rückbau entfernt hatte — V-FX-39); die zwei Konstanten stehen wieder in `cubeFormat.ts` (vom Client unbenutzt, Bundle byte-gleich).
- **Client:** `POINT_CLIMA_PATH = point/static/clima/v1/stations.json` (`cubeFormat.ts`); Leser `src/point/client/climaPoint.ts` (Muster `learnedPoint.ts`: Store,
  Priorität low, sha256, `validateClimaProduct`, nie blockierend, nie still); `CubeIo.climaSource: 'json'` (Voreinstellung aus, Cache-Schlüssel `|clima:json`),
  Entscheidung EINMAL je Abfrage wie `calib.json`/Tabellen; `CubeFusionInput.learnedClima`; in `fuseCubePoint` wird μ_c EINMAL je Abfrage am Punkt geschätzt
  (`estimateCoefficients` mit `trendVector` aus den Geländemerkmalen des Kerns + h_true + Lage) und je Schritt in `PredictSituation.muC` gereicht — nur mit `learned`
  + Tabellen, deren Design die Spalte für die Größe erklärt (`climaColumnsFor`); Provenienz `learnedClima:hindcast — μ_c-Spalte für t, td, gust aus dem
  Klimatologieprodukt (Kandidat · Trend n Merkmale · Weg · nächste Station · Stationen · Lizenzen)` bzw. `learnedClima:absent — … <Ursache>` (kein Produkt, kein
  Gelände, Produkt ohne Schätzung für die Größe); kein Band-Schlüssel (E-FX-4). `defaultCubeIo` setzt weder `learnedSource` noch `climaSource` ⇒ Produktion byte-gleich.
- **Gates (Auftragsreihenfolge, Maschine mit laufender A3-Messung — die Verifier messen keine Zeit):** typecheck grün · `verify:fusion-fit` **104/104** (Block 14:
  `climaColumnsFor`, `parseClimaVars`, `validateTables` beide Richtungen mit Negativkontrolle, `predict` per Größe, Produktverengung) · `verify:pv-cube` **320/320**
  (Block 27: `climaSource` ohne `learned` byte-gleich + Cache-Schlüssel; none-Tabelle + Produkt = heutiger Lernpfad; station-Tabelle [t] + Produkt ⇒ Cube-Member
  T an 102/102 nativen Schritten exakt 0,5·ȳ + 0,5·μ_c, Provenienz pur und über den Produktpfad; station-Tabelle ohne Produkt / Datei fehlt / kein JSON / Produkt
  ohne T-Trend ⇒ byte-gleich zur Basis, `learnedClima:absent` mit Ursache; Tabelle + Produkt im Eingang ohne Option byte-gleich) · `verify:point-client` **167/167**
  (Block 10r: Pfad, Hash, Priorität low, nie still) · `verify:calib-fit` 14/14 · `verify:pv-fusion` 229/229 (Live-Pfad unberührt) · Build 241/241 · Budget eagerJs
  **107,9** unverändert, largestChunk 301,2, **totalJs 1 447,6 KB** (+2,9 KB gz: `climaProduct.ts` im lazy `cubeSource`-Chunk; weiter über der 1 438-Ratsche, E-FL-11 = Jans)
  · **Mobil-4G erste Darstellung** (Lab `verify:pv-latency --profiles=mobile-4g --places=muenchen --only=cubep`, Maschine frei, 04:04 UTC, Lab-Bündel 744 KB mit dem
  neuen `cubeSource`; `defaultCubeIo` ohne `learnedSource`/`climaSource` — die Änderung kann nur Bundle-Bytes kosten): cube-cold-prog **erste Darstellung 1 588 ms
  / total 1 797 ms**, ganzes Fenster 2 826 ms, final 5 309 ms; warm 180 / 237 ms; 24 h kalt 1 597 / 1 769 ms (AP12-Referenz 18.09.: erste Darstellung 1 812 ms, warm 193 ms —
  andere Leitung, anderer Tag: keine Regression erkennbar, kein Like-for-like). `audit/fusion-implementierung/latency/2026-09-27T04-04-42-197Z.json`.

**Ergebnis A3 (E-FX-9; `diag-fx5-a3.{md,json,log}`, dritter Lauf 04:41–05:21 UTC = 40 min; der erste Lauf `diag-fx5-a3.run1.*` und ein zweiter verloren die
Bins 4/5 an die Zeilenverdünnung — V-FX-44; jetzt Hash-Mischer `mix32`, alle 389 Punkte, Stride 12 / Klimatologie-Durchlauf 2: 4 638 Klimatologiereihen
(389 × {t1, t2, t3, obs} × 3 Größen, je ≥ 2 000 Zeilen je Falte), 3 374 525 Zeilen mit allen sechs Varianten, 180 Mittelwertmodelle, 2 128 Zellen, 1 824 DM-Tests):**

| Out-of-fold gegen `none` (Form K, Schicht `all`; * BH-signifikant) | obs (Station 3,3 J, wie 5b) | obs1y (Station aus denselben Zeilen, leckfrei) | est (ridgeTx LOSO = 5c) | **mod (Cube-Member-Klimatologie)** | shuf (Nachbar-mod) |
|---|---|---|---|---|---|
| u · 126–240 / 246–336 h (MSE) | +3,9* / +4,9* | +0,8* / +2,3 | +0,2* / +0,7 | **−0,2 / −0,3** | −0,2 / −0,3 |
| v · 126–240 / 246–336 h (MSE) | +5,4* / +8,2* | +1,3 / +2,2 | +0,3 / +1,8* | **−0,0 / +0,5** | −0,1 / −0,1 |
| Wind ws · 126–240 / 246–336 h (MAE der Vektorgeschwindigkeit) | +2,4* / +3,9* | +1,5* / **+8,6*** | −0,4 ! / **−3,3 !** | **+0,1 / −0,0** | 0,0 / −0,5 |
| Böe · 126–240 / 246–336 h (MSE) | +12,6* / +15,2* | +8,6* / +11,4* | +2,5* / +3,9* | **+2,1* / +4,4*** | +0,5* / +0,8* |
| u/v/ws 0–120 h | +4,1…+6,0* | +0,6…+2,7* | −0,7…+0,5 | −0,5…+0,3 | −0,5…+0,4 |

Schichten (`mod`, 246–336 h): u/v in jeder Land-/Band-/`dnn:`-Schicht zwischen −1,3 und +1,6 % (nichts signifikant), Böe +2,2…+7,8 %* überall (AT +7,8, CH +5,2,
DE +2,2 %*), ws AT/CH/≥ 800 m **−2,8…−5,5 %!** — dieselbe Signatur wie `shuf` (−2,4…−4,2 %!). ρ_f(mod, u) 0,82 → 0,22 über die Bins wie bei obs/est; das
CV-Ziel wählte für `mod` fast nie ρ_f, **β_μc(mod) 0,02–0,10** (obs 0,49–0,85, est 0,07–0,66). Exposition: Jahresmittel |u,v| der Modellklimatologie gegen die
Stationsklimatologie derselben Zeilen über 387 Punkte corr **0,53 (t1) · 0,40 (t2) · 0,34 (t3)**, Bias −0,19…−0,29 m/s, RMS Δu 0,68–0,78 m/s.

**Lesart (E-FX-9): NEIN — kein Producer-Produkt einer Modellwind-Klimatologie.** Die Vorab-Regel ist in jedem Punkt verletzt: `mod` gewinnt bei u/v in den Bins 3–5
nichts (−0,3…+0,5 %, = `shuf`), hält nichts vom `obs`-Gewinn, schlägt `est` nicht. Der Grund ist strukturell: in der Anomalieform μ = μ_c + β(ȳ − μ_c) mit β ≈ 1 ist
die Klimatologie des Members SELBST ein Nullterm (β_μc → 0) — der Gewinn der Stationsklimatologie ist das Feld „Station minus Modell" (die lokale Niveaukorrektur),
und das trägt nur eine Reihe, die die Station kennt; die Exposition der Zelle steckt schon in ȳ. Nur die Böe profitiert (+2,1/+4,4 %*, ≈ est) — dort schrumpft jede
Klimatologie das bei 246–336 h wilde Member (MSE des rohen Members −106 % gegen `none`), auch die verwürfelte (+0,8 %*). Damit ist E-FX-9 als Producer-/Motor-Frage
geschlossen; offen bleibt eine Reanalyse-Klimatologie mit Stationsassimilation (ERA5-Land) — sie ist das „Station minus Modell"-Feld in Kachelform, nur gegen Stationen
zu messen (V-FX-45). **Zwei Nebenbefunde:** `obs1y` (Stationsklimatologie aus DENSELBEN 13 Monaten, leckfrei je Halbmonat) schlägt bei der Vektorgeschwindigkeit 246–336 h
mit +8,6 %* die 3,3-Jahres-Klimatologie (+3,9 %*) — das Regime des laufenden Jahres trägt am langen Ende (Vorsicht: die Halbmonate DERSELBEN Saison stehen der Falte zur
Verfügung, in Echtzeit nur die Vergangenheit ⇒ rollende 12-Monats-Klimatologie messen, V-FX-46); und das rohe Member ist bei der Geschwindigkeit 246–336 h **7,9 %* besser
als das u/v-Mittelwertmodell** (`cube` gegen `none`; bei u/v-MSE −15 % schlechter) — die Komponenten-Ridge schrumpft u/v gegen 0 und drückt |μ| unter ff (V-FX-47; das
Speed-Gesetz A1 fängt es auf der Rice nur teilweise). Datengrenzen wie vorab benannt (13 Monate, Lauf-Route t1 nur Sommer, nur Stationspunkte).

## 7 Befunde dieser Phase (V-FX-NN — Mehrwert und Skizze)

- **V-FX-1 — Scorer-Spread ist die latente σ (V-FL-39/42 Lesart):** G-FL-2 der Bewölkung ab 7 h war ein Artefakt (Tobit-sd/RMSE 0,93–0,96), die
  Wind-Unterdispersion ist real und sitzt ≥ 800 m. *Mehrwert:* das Gate misst wieder Kalibrierung. *Skizze:* `stats.mjs sdOf` je Familie, rms-Spread
  (E[σ²] = E[e²]) als Gate-Maß, `spreadSkillLatent` für alte Karten — **Stufe FX-1.**
- **V-FX-2 — PIT am Atom deterministisch (Mittelpunkt):** Bewölkung/Böe/Niederschlag-Histogramme per Konstruktion strukturiert (fl-K clct 246–336 h
  36,4 % im 9., 1,3 % im 10. Dezil). *Skizze:* randomisierte PIT mit gesätem u je (Zeile, Größe) im Scorer, `pitOf` in `dist.ts` unberührt — **FX-1.**
- **V-FX-3 — Lauf-Route-Falten mit 14–21 Trainingstagen:** ±1-Monat-Purge auf vier Monaten. *Mehrwert:* ehrliche 7–48-h-Zahlen, gemessen 1–3 % oof
  (§11.8). *Skizze:* Halbmonatsgruppen `YYYY-MMa|b`, Purge ±1 Halbmonat (≥ 13 d; Februar-Hälften 15 + 13/14 d), Scorer mit Zeilen-Schlüssel — **FX-1.**
- **V-FX-4 — Brier-Vergleich über verschiedene Zeilenmengen** (§11.11 „Form P −6,0 %"): like-for-like P ≈ Cube bei 25–48 h. *Skizze:* `compare.mjs`
  Brier-Tabelle auf Paar-Zeilen; die Aussage in §11.11 gilt als widerlegt.
- **V-FX-5 — Anomalieform mit Stationsklimatologie und Ridge-Ziel ρ_f** (absorbiert V-FL-23/24): b 0,36/0,20 statt ≈ 1 bei T/Td 246–336 h; Mischung
  −8,7/−11,5 %. *Skizze:* μ_c-Spalte (Station `byPoint`, Rückfall pooled), Ziel β_cube = ρ_f(v, bin), β_μc = 1 − ρ_f, λ neu per CV; Client braucht ein
  Klimatologieprodukt (E-FX-1) — **FX-2** (Fit/Scorer), Client offen.
- **V-FX-6 — Speed-Gesetz am Gitterrand und je Stratum:** a in 8/10, b in 7/10 K-Strata am Rand; DE/AT entgegengesetzte Bias. *Skizze:* Gitter a
  −1,8…+0,6, b 0,7–1,3, c 0,8–1,7; zweite Familie TN(a·sd + b·E, c·sd); Verdikt je Band mit no-skill-Rückfall auf die Rice — **FX-2**; Client-Bandschlüssel
  und A6 offen.
- **V-FX-7 — σ-Skala 0,9 an T/Td/Böe ist die Signatur unerklärter Heteroskedastizität** (synthetische Sonde: jede leptokurtische Residualverteilung gibt
  k* 0,85–0,9 mit 0,1–0,6 % Gewinn und PIT-Rand 0,20–0,25). *Skizze:* Regel nur Bewölkung (`--scaleVars=clct`) bis M2 — **FX-2**, Entscheidung E-FX-2.
- **V-FX-8 — Heteroskedastisches σ per CRPS mit Regime-Prädiktoren (M2):** D4 misst VR 1,4–1,9 in DJF-Nächten, 1,74 bei starker Entkopplung, 1,24–1,39 bei
  Windstille. *Skizze:* ln σ = γᵀx auf einer gespeicherten Teilstichprobe (≈ 1 M Zeilen je Größe), BFGS mit Log-Likelihood je Schritt, Ridge auf γ,
  permutierte Spalten als Kontrolle; `predictSigma` mit exp — nächste Iteration.
- **V-FX-9 — Die Client-Kette ist ungemessen (A6):** Gesetz auf der Motor-Rice, set-Prior und windTerrainFactor auf dem gelernten Member; Cube mit Prior
  bei T 246–336 h besser als fl-K. *Skizze:* Fallbau mit `learned` und Falten-Tabellen je Monat ⇒ Kandidat `fl-K+engine`; momentengleiche Rice vor
  `fuseHour` prüfen (Codec-Version 2 könnte entfallen) — Jans Gate (Maschine 6–10 h, Motor-Reihenfolge).
- **V-FX-10 — Klimatologie in der falschen Familie (C4):** Wind-Rice der Komponenten (ν/σ p50 0,46 ⇒ Rayleigh; PIT 14,6 → 7,6 %), Bewölkung zensiert
  (P(0) 3 % gegen 18–25 %), Böe PIT 3,1/13,3/17,5 %. *Skizze:* Weibull/TN auf ff, LN Böe, Zwei-Atome Bewölkung in `fit-clima.mjs`; Leave-Year-out; als
  Benchmark im Scorer ohne Motor, als Kollaps-Ziel mit Familie in `dist.ts` (STOPP).
- **V-FX-11 — Bins verdecken Kreuzungen (C7):** Wind kreuzt pooled bei 105 h, in AT/≥ 800 m ab 7 h, DE zwischen 126 und 240 h. *Skizze:* `lead:`- und
  `season:`-Strata im Scorer (FX-1), τ* je Route × Land × Band mit CI90, Produktregel V-FL-24 danach.
- **V-FX-12 — Anker senkt σ nicht (M9, absorbiert V-FL-35/29/31):** S/S 1,04–1,13 nach dem Anker, PIT-Mitte 13–14,5 %. *Skizze:* σ'² = σ² − w²·var(e₁)·r²,
  Kurve bis 72 h und je Falte — Motor.
- **V-FX-13 — Nichtlineare Decke (M6):** sklearn 1.6.1 `HistGradientBoosting` auf den oof-Residuen, Monatsfalten mit Purge von Hand, permutierte Ziele,
  Region-Holdout; Export der Stride-24-Zeilen aus dem Diagnose-Skript — Diagnose, keine Client-Änderung.
- **V-FX-14 — Niederschlag t2/t3 gegen Fenstermittel (A5):** Code-Befund `recompute.mjs`; Produktfrage (E-FX-5); Spalte `obs_rrWin` im Fallbau.
- **V-FX-15 — Schichtbewölkung als Prädiktor, Zwei-Atome-Familie (A8/M10):** Bias −26 %-Pkt bei c_clct 33–67 % mit clch > 80 %. *Skizze:* geschachtelte
  Regression clct ~ ȳ + clcl/clcm/clch oof (nur Lauf/Tag-0-Route); Familie nur mit Beleg (Codec).
- **V-FX-16 — Böe: Boden und Familie verschränkt (A2/C6/M11):** PIT-Dezil 1 bei 4–9 %. *Skizze:* Pass-E-Variante ohne Boden, TN/LN gegen CN, Varianz mit
  Niveau-Term (μ̂, μ̂²), Brier ≥ 14 m/s.
- **V-FX-17 — Td-Klimatologie +0,43…+0,60 K zu feucht im Fenster; Td 0–6 h Kurtosis 10,7–11,4:** vor jeder Td-Spalte klären (`truthFlags derived`, Netz,
  Monat; Leave-Year-out-Klimatologie).
- **V-FX-18 — Form-K-Hürde ohne Nässeanteil (M8/A4):** like-for-like P − K 0–2 %; Spalte k/n-Rekonstruktion und q90 (t3) im Reservoir-Fit; Kontrolle
  r > 0,7 gegen den wahren Quellanteil.
- **V-FX-19 — Regime-Spalten im Mittelwert (M5/A7/A12/C10):** bedingter Bias klein ⇒ erst nach M6-Importanz; Effektgrößen β·sd (V-FL-34).
- **V-FX-20 — Kreuzung Wind ab 105 h pooled, AT/≥ 800 m ab 7 h:** harte Umschaltung (C2) verworfen — weicher Blend über C1; Produktregel V-FL-24 je
  Route × Land × Band nach C7.
- **V-FX-21 — Kleine Lecks der Referenz:** λ auf allen Monaten gewählt und für die Falten-β wiederverwendet; Σ-Prior der Form P gepoolt (V-FL-9);
  Klimatologie inklusive Fenster. *Skizze:* λ je Falte (teuer, klein), Leave-Year-out-Klimatologie als zweiter Kandidat.
- **V-FX-23 — Rauchfits auf zwei Monaten messen in-sample:** die Monatsfalte hat nach dem ±1-Purge keine Trainingsdaten und fällt auf das
  gepoolte β zurück (2026-08: 205/205 Strata). *Regel:* Rauchfits ≥ 4 Monate und `--folds=half`; der Rückfall wird im Eintrag gezählt
  (offen: `folds`-Einträge, die dem gepoolten β gleichen, als solche kennzeichnen — Skizze `entry.foldsPooled: string[]`).
- **V-FX-25 — CV-Zielwahl nach MSE schadet der Bewölkung im CRPS:** in Fit 5b wählte `--rhoTarget=cv` für alle K-Bewölkungs-Strata das ρ_f-Ziel
  (MSE −0,2…−1,5 %), die Scorecard verliert dort +0,7…+2,8 % CRPS (5a → 5b) — MSE-Schrumpfung Richtung μ_c ≈ 70 % nimmt den Atomen 0/100 Masse.
  *Skizze:* Zielwahl per CRPS der zensierten Verteilung (Pass-E-Akkumulator je Ziel) oder Bewölkung vom ρ-Ziel ausnehmen (`--rhoVars`); die
  Halbmonatsfalten allein brachten der Bewölkung −0,3…−2,5 %.
- **V-FX-26 — Halbmonatsfalten wählen kleinere λ und verschlechtern den Band-Holdout:** Fit 5a gegen Fit 4 (Form K) T 7–48 h Band +17…+21 %, Böe
  +42…+160 % bei neutralem Region-Holdout und −3…−6 % Zeitfalte; die μ_c-Spalte (Fit 5b) holt Böe/Td zurück (−6…−39 %), T 25–120 h bleibt +9…+20 %.
  *Skizze:* λ-Wahl mit Region-/Band-Falten als Nebenbedingung (max über die Achsen) oder Band-Holdout als Abbruchregel für Anspruch B.
- **V-FX-27 — Brier-Tabelle von `compare.mjs` mischt weiter Zeilenmengen** (126–240 h fl-K Lauf-Route gegen Cube alle Routen; 246–336 h fl-K nur r3).
  *Skizze:* Brier je Paar auf den gemeinsamen Zeilen (BrierAcc je Kandidat × Referenz) — bis dahin nur die DM-Paare lesen.
- **V-FX-28 — Windgesetz ≥ 800 m: b am oberen Rand 1,45 in allen Band-Einträgen** (`sd`-Familie, a −1,2…−1,5, c 1,1–1,7). *Skizze:* B-Achse bis 1,75 nur
  für die sd-Familie; prüfen, ob der Effekt die zu niedrige Rice-Lage der Berge (Cube-Bias −1,15 m/s bei 126–240 h ≥ 800 m) trägt, die eigentlich in
  das u/v-Mittelwertmodell gehört (multiplikative Modulatoren, A1 Teil 2).
- **V-FX-24 — `fit.mjs`: Stride-Voreinstellung 6 im Code, 4 im Kopfkommentar** (Fit 4 und alle FX-Läufe: 6). *Skizze:* Kopf berichtigen; Stride
  in jedem Aufruf explizit übergeben und im Tabellenkopf notieren (`inputs.stride` fehlt heute — nachtragen).
- **V-FX-22 — Je-Standort-Obergrenze (LOMO) T −3…−6 % enthält Regime-Persistenz** (Purge fehlt innerhalb der Saison): Diagnose, keine Zielgröße; die 14
  Standort × Tagesgang-Spalten schöpfen den Standort nicht aus — Online-Bias je Station (Mathe-Spec §4.1) im Archiv-Fenster als Vergleich.

- **V-FX-29 — Die Stationsklimatologie ist aus Standortmerkmalen schätzbar, die Windexposition nicht (Stufe 1 von FX-4, `diag-fx4.md`):** Leave-Station-out
  an 389 Stationen — ein Ridge-Trend auf Höhe/Lage/Gelände holt T auf 1,02–1,06 K, Td 0,67, Böe 1,27–1,31 m/s RMS des Stundenklimas (gepoolt 1,87 / 1,70 /
  1,76; verwürfelt 4,2 / 4,2 / 3,1), u/v aber nur auf 0,70 / 0,65 m/s gegen gepoolt 0,78 / 0,63 — die Ortsinformation des Windes (Exposition, Talwind,
  Anemometer) steckt in keinem der 22 Merkmale und nicht in den Nachbarn (idw3 0,97 / 0,72). Erwartung für Fit 5c: T/Td/Böe behalten einen Teil des
  5b-Gewinns, Wind kaum. *Skizze:* Wind-Klimatologie je Zelle aus dem Hindcast-Cube (Modellwind hat die Exposition der Zelle, nicht der Station) oder
  Anemometer-Metadaten je Station; erst nach Scorecard 5c entscheiden.
- **V-FX-30 — `ClimaField` (Meteostat, 178 Stationen, Lapse 6,5 K/km set) ist als T-Klimatologie schlechter als die gepoolte Stationsklimatologie:** 2,14 K
  gegen 1,87 K (gepoolt Band|Land) und 1,02 K (Trend) RMS des Stundenklimas an den 386 T-Stationen. Der Motor nimmt `ClimaField` als Prior der Schrumpfung
  und für den Klimatologie-Schwanz (K-3). *Skizze:* das Klimatologieprodukt aus FX-4 (wenn gebaut) als Prior des Motors für T — Motor-Berührung, Jans Gate
  (E-FX-4); Wind/Böe/Td hätten damit erstmals überhaupt einen Punkt-Prior.
- **V-FX-31 — Der Merkmals-Trend extrapoliert die Bewölkung an den 16 DE-Bergstationen** (≥ 800 m RMS 12,6 % `ridge`, 10,6 % `ridgeT` gegen 5,0 % `idw3`,
  gepoolt 5,9 %): DE-only-Reihe, wenige Stationen über 800 m, Höhe² läuft weg. Regel im Produkt: `estimator.byVar` — Bewölkung nimmt idw3 (Verifier 13d/13f).
  *Skizze:* Schranke der Trend-Extrapolation (Merkmalsraum der Trainingsstationen) als Rückfall auf idw, für alle Größen.
- **V-FX-32 — Der Schätzfehler hängt am Gelände, nicht am Stationsabstand:** T `ridge` < 10 km 1,26 K, 10–20 km 1,11, 20–35 km 0,87, > 35 km 0,91 (die nahen
  Stationen sind die alpinen); **X gemessen:** ein DACH-Landpunkt liegt im Mittel 17,7 km von der nächsten Station (p50 17,0, p90 29,2; DE 19,0 · AT 15,1 ·
  CH 9,6 km; 38 % > 20 km, 3 % > 35 km), die Stationen untereinander 21,6 km (p50) ⇒ die LOSO-Messung ist für den Browser-Punkt konservativ bis neutral.
  Die Scorecard-Strata `dnn:` tragen die Gewinne je Abstand.
- **V-FX-33 — Werkzeug: Referenztabellen als Scorer-Kandidaten (`--refTables`)** — bisher waren Deltas zwischen Scorecards (4 → 5b) Differenzen zweier
  Karten ohne Test; jetzt rechnet der Scorer die Form K der Referenzfits auf DENSELBEN Zeilen mit (`fl-K@5a`, `fl-K@5b`) und testet fl-K dagegen mit
  DM/BH — die Entscheidungsregel von §6.4 liest diese Paare. *Skizze:* dasselbe für `compare.mjs` rückwirkend nicht möglich (keine Zeilenscores gespeichert);
  künftige Scorecards immer mit der Vorgänger-Tabelle als Referenz laufen lassen.
- **V-FX-34 — Rauchtests mit dem Hintergrund-Werkzeug sterben nach 10 min:** eine Fit/Score-Kette (≈ 3 h je Kandidatin) muss vom Werkzeugprozess gelöst
  starten (PowerShell `Start-Process bash -WindowStyle Hidden`, Log in `fit\fx5c-chain.log`); ein erster Start der Kette wurde deshalb nach 4 min gestoppt
  und neu gestartet (Fit 5c ab 08:11:52 UTC).

- **V-FX-35 — Was der geschätzte μ_c vom Fit-5b-Gewinn behält (Scorecard 5c gegen fl-K@5a, identische Zeilen):** T 246–336 h 63 % (+4,7 von +7,4 %),
  Td 90 % (+8,5 von +9,4 %), Böe ab 126 h ≈ 30 % (+1,9/+2,8 von +6,4/+8,2 %), Wind ≈ 20 % (+0,3…+1,6 von +2,8…+4,5 %); T/Td 126–240 h nichts (+0,3 % n.s.),
  Bewölkung verliert (−1,1…−3,2 %!). Die Regel von §6.4 (vor dem Lauf) ist damit verletzt — nicht gebaut. *Skizze:* μ_c-Spalte je Größe (`--climaVars`)
  und Regel je Größe × Bin als Jans Entscheidung (E-FX-8); Wind braucht eine andere Klimatologie (V-FX-29).
- **V-FX-36 — Scorer mit Referenztabellen kostet das Doppelte:** Scorecard 5c 179 min gegen 77 min (5b) — zwei weitere `predict`-Aufrufe je Zeile (mit
  je eigener Falten-Tabelle) und vier `dnn:`-Strata mit Paaren (12 411 statt 7 548 DM-Tests). *Skizze:* Referenzkandidaten nur in den Schichten der Regel
  (`all`, Land, Band, `dnn:`) und ohne `lead:`/`season:`; die Falten-Tabellen der Referenzen einmal je Halbmonat vorbereiten statt je Zeile prüfen.
- **V-FX-37 — Der Windgewinn der Klimatologie ist ein Nahfeld-Effekt:** gegen 5a +4,5 %* (< 10 km), +2,4 %* (10–20 km), +0,9 %* (20–35 km), −1,3 %!
  (> 35 km) bei 51–120 h; T/Td dagegen fern der Alpen am größten (246–336 h > 35 km +6,3 / +10,0 %*). Die `dnn:`-Strata sind das Maß dafür, was ein
  stationsloser Punkt bekommt — für den Wind im Mittel (17,7 km) ≈ +1 %, jenseits 20 km (38 % der Landpunkte) nichts. *Skizze:* Windprodukt nur mit einer
  Klimatologie, die die Zelle kennt (V-FX-29); der Trend liefert die Stationsschätzung, nicht die Exposition des Punkts.
- **V-FX-38 — Die Alpenstationen tragen den Schätzfehler, nicht der Abstand:** T-RMS `ridgeT` ≥ 800 m 1,38 K gegen < 800 m 0,90 K; DE hat 16 Bergstationen
  mit Bewölkungsreihe (Trend extrapoliert, V-FX-31) und 187 unter 800 m. *Skizze:* zusätzliche Bergstationen (DWD-Nebennetz, GeoSphere-TAWES-Nachbarn außerhalb
  der 405 Punkte) in die Klimatologie — die Wahrheit dafür liegt im CDC/GeoSphere-Archiv, nicht im Hindcast-Cube (Merkmale per `features.mjs` nachziehbar).

- **V-FX-39 — `clima-product.mjs` war seit dem FX-4-Rückbau nicht lauffähig:** der Rückbau der Client-Seite (§6.4) entfernte `CLIMA_PRODUCT`/`CLIMA_VERSION` aus
  `cubeFormat.ts`, der (geblieben gemeldete) Produktbau importierte sie weiter — `SyntaxError` beim Laden, kein Verifier deckte es (Block 13 prüft den Schätzer, nicht
  den Bau). *Mehrwert:* „geblieben" heißt lauffähig. *Skizze:* die zwei Konstanten stehen wieder in `cubeFormat.ts` (27.09.); Block 14d prüft die Produktform, ein
  Rauchlauf des Baus (`--vars`, synthetische Klimatologie) fehlt noch als Verifier-Block — offen.
- **V-FX-40 — Der Windgewinn der Phase FX steckt allein im Speed-Gesetz (A1), nicht in der μ_c-Spalte:** Scorecard 5e (u/v ohne Spalte, Gesetz v4 + Band) gegen 5a
  +0,4 · +0,3 · +0,7 · +1,7 · +1,1 · +1,0 %* je Bin = der ganze Gewinn von 5c (+0,4 · +0,3 · +0,4 · +1,6 · +1,1 · +0,6 %*); 5e gegen 5c auf identischen Zeilen
  +0,3*/+0,1*/+0,4* bei 25–48/51–120/246–336 h — die geschätzte u/v-Klimatologie kostete leicht. Das Band-Gesetz trägt AT/CH/≥ 800 m (+2,1…+4,2 %*), DE verliert bei
  7–24 h −1,9 %! und 126–336 h −1,0…−1,3 %! (5c: −2,0/−1,1/−0,5). *Skizze:* Speed-Gesetz je Land × Band prüfen (C3 als Rückfall, §3.2) oder DE-Zeilen im Band-Verdikt
  getrennt gewichten; die μ_c-Spalte für u/v bleibt aus, bis eine Klimatologie mit Exposition existiert (A3, §6.5).
- **V-FX-41 — Die geschätzte Bewölkungs-μ_c (idw3) kostete in Fit 5c in jedem Bin bis 240 h:** 5e (ohne Spalte) gegen 5c +1,0* · +2,0* · +3,1* · +1,1* · +1,0 · −0,8 %.
  Bestätigt V-FX-25/31 (MSE-Zielwahl und Trend-Extrapolation) auf identischen Zeilen. *Regel:* `clct` nie in `--climaVars`; CRPS-Zielwahl (V-FX-25) bleibt die
  nächste Iteration.
- **V-FX-42 — Ein Stratum hängt nur an seiner eigenen Spaltenentscheidung:** die 115 Mittelwert- und 112 Varianz-Einträge von T/Td/Böe in Fit 5e sind byte-gleich zu
  Fit 5c (dort trugen alle Größen die Spalte), die 180/121 von u/v/Bewölkung/Niederschlag byte-gleich zu Fit 5a. *Mehrwert:* eine Spaltenliste braucht keinen neuen
  Vollfit für die unveränderten Größen — nur Speed-Gesetz (u/v-Modell) und Skalenregel koppeln. *Skizze:* `fit.mjs --reuse=<tables>` könnte Strata mit gleicher
  Spaltenentscheidung übernehmen (≈ 2 h je Variante gespart); der Scorer braucht trotzdem den vollen Lauf.
- **V-FX-43 — Tabelle und Produkt gehören zusammen:** eine station-Tabelle mit `climaVars` rechnet T/Td/Böe OHNE Produkt gar nicht gelernt (die Größe ist `absent`,
  u/v/Bewölkung bleiben gelernt) — schlechter als die Fit-4-Tabelle, die T/Td/Böe ohne Spalte lernte. *Mehrwert:* kein stiller Rückfall auf eine halbe Lernstufe.
  *Skizze:* `learnedSource` und `climaSource` nur gemeinsam einschalten (E-FX-11); im Leser sagt `learnedClima:absent` die Ursache; ein späterer Fit könnte je Größe
  einen zweiten (none-)Eintrag als Rückfall tragen (`fusionFit@4`).
- **V-FX-44 — Die Zeilenverdünnung `(validAtH + pointIdx) % stride` von `fit.mjs` und `score.mjs` ist bei groben Stufen eine PUNKT-Auswahl:** t3 hat nur
  6-stündige Gültigkeiten (validAtH ≡ 0 mod 6), t2 3-stündige ⇒ bei Stride 6 überleben je Stufe nur die Punkte mit passendem Rest — gemessen (2026-05):
  **t3 65 von 389 Punkten, t2 130, t1 259** (Zeilenanteil je 16,7 % — die Menge stimmt, die Fläche nicht). Folgen: jeder Fit seit Fit 4 lernt die Bins 4/5
  an 65 Stationen (mit ALLEN ihren Zeilen), Bin 3 an 130, Bins 0–2 an 259; jede Scorecard bewertet dieselben Teilmengen (like-for-like zwischen den Karten
  bleibt gültig — alle lesen dieselben Zeilen; die Region-/Band-/`dnn:`-Schichten der Bins 4/5 tragen aber nur 65 Stationen, und n_eff der Zeitfalten ist
  kleiner als gedacht). In `diag-fx5-a3.mjs` nahm dieselbe Regel den Varianten `mod`/`shuf` jede 126–336-h-Zeile (der Verwürfelungs-Nachbar pointIdx + 1
  hat nie t3-Zeilen) — erster Lauf ohne Bins 4/5, Skript auf eine Hash-Auswahl umgestellt und neu gelaufen. *Skizze:* Auswahl `hash(validAtH, pointIdx) % stride`
  in `fit.mjs`/`score.mjs` (eine Zeile je Skript) — danach ist KEINE alte Scorecard mehr like-for-like: Referenzkette 5a → 5e neu fahren (≈ 8 h Maschine), bevor
  die nächste Iteration darauf misst; die Fit-Aussagen dieser Phase (Vorzeichen, Größenordnung) bleiben, die Schicht-Zahlen der Bins 3–5 sind auf 65/130
  Stationen zu lesen. **Jans Gate E-FX-12** (Zeitpunkt der Neuvermessung).
- **V-FX-45 — Die Klimatologie des Cube-Members ist als μ_c-Spalte ein Nullterm (A3 gemessen, §6.5):** out of fold u/v 126–336 h −0,3…+0,5 % gegen `none` = die
  verwürfelte Kontrolle, β_μc 0,02–0,10; Stationsklimatologie +3,9…+8,2 %*, LOSO-Schätzung +0,2…+1,8 %*. In μ = μ_c + β(ȳ − μ_c) trägt μ_c nur, was das Member
  nicht kennt: das Feld „Station minus Modell". *Mehrwert:* E-FX-9 ohne Producer-Diff beantwortet (kein `point/static/windclim`). *Skizze:* ERA5-Land (Assimilation
  von Stationen) als Kachel-μ_c wäre dieses Feld in Rasterform — nur gegen die 389 Stationen zu messen (Leave-Station-out gilt dort nicht: die Station steckt in der
  Reanalyse), CC BY 4.0, 9 km; vorerst nicht gebaut.
- **V-FX-46 — Das laufende Jahr trägt am langen Ende mehr als 3,3 Jahre:** `obs1y` (Stationsklimatologie aus den 13 Fallmonaten, je Halbmonat leckfrei) schlägt bei
  der Vektorgeschwindigkeit 246–336 h `none` um +8,6 %* (obs 3,3 J: +3,9 %*), in jeder Schicht +7…+10 %*; bei u/v/Böe liegt sie unter obs. Vorsicht: die Falte kennt
  die Nachbar-Halbmonate DERSELBEN Saison (Vergangenheit UND Zukunft) — in Echtzeit nur die Vergangenheit. *Skizze:* rollende 12-Monats-Klimatologie (nur zurück)
  als μ_c-Kandidatin im Scorer; wenn sie trägt: Produkt monatlich neu aus dem Archiv/Hindcast (Publisher-Weg wie `clima/v1`).
- **V-FX-47 — Das u/v-Mittelwertmodell drückt die Geschwindigkeit bei 246–336 h unter das rohe Member:** MAE |μ_u, μ_v| gegen ff `cube` +7,9 %* besser als `none`
  (bei 126–240 h +1,4 %), obwohl `none` je Komponente 15 % weniger MSE hat — die Ridge schrumpft u und v gegen 0, der Betrag fällt. Das Speed-Gesetz (A1) korrigiert auf
  der Rice nur teilweise (Wind kreuzt die Klimatologie bei 126 h). *Skizze:* Geschwindigkeit als eigene Zielgröße (ff-Modell mit ln oder Weibull, C4) oder ein
  Betrags-Term im Ziel der u/v-Ridge; Prüfung im Scorer als Kandidat `fl-K|ff`.

## 8 Entscheidungen für Jan (E-FX-*, in `MANUELLE-SCHRITTE.md` §22)

- **E-FX-1 Klimatologieprodukt im Client (E-FL-12 neu gestellt):** (a) Stationstabelle 389 × 7 Größen × 27 Koeffizienten (≈ 90–110 KB gz, oder ≈ 1 KB je
  Punkt für die drei nächsten Stationen per Bounding-Box), (b) Merkmalsregression der Koeffizienten (≈ 8 KB gz; Anspruch B braucht den Leave-Station-out-
  Beleg — bisher negativ: gepoolt ±0,1 %), (c) nur T über `ClimaField` (Meteostat, lizenzseitig zu ersetzen). Ohne Produkt bleibt C1 eine Scorer-Zahl.
- **E-FX-1 — gemessen (FX-4, §6.4):** Antwort (b) Merkmalsregression ist die beste Schätzung (T 1,06 K RMS), (a) Stationstabelle schlechter (1,18 K), (c)
  `ClimaField` am schlechtesten (2,14 K); Scorecard 5c mit geschätztem μ_c verletzt die vorab festgelegte Regel (T/Td 126–240 h n.s., Bewölkung −1,1 %) ⇒
  **nicht gebaut**, kein Produkt, keine Client-Tabelle (E-FX-7 bleibt). Vorbereitete Client-Seite zurückgebaut; Bausteine fit-seitig geblieben.
- **E-FX-8 Regel je Größe × Bin?** Ein Produkt, das nur bei 246–336 h für T/Td/Böe wirkt (T +4,7 %*, Td +8,5 %*, Böe +2,8 %*; Wind < 20 km +1 %; Bewölkung
  und Wind ohne μ_c-Spalte) bestünde Regel 2 und 3 und Regel 1 nur zur Hälfte — bauen (Fit 5e mit `--climaVars=t,td,gust`, ≈ 2,5 h + 3 h Scorecard) oder
  E-FX-1 schließen, bis eine Windklimatologie mit Exposition existiert. Dein Gate; ich habe nicht entschieden.
- **E-FX-9 Windklimatologie mit Exposition (Producer/Motor):** Monatsmittel u/v/Böe je Cube-Zelle als statisches Produkt (`point/static/…`, Producer-Diff,
  analog `hmodel`) oder ERA5-Land-Kacheln (CC BY 4.0); der Fit misst zuerst A3 (μ_c^mod-Anomalieform) an den 405 Punkten aus den Fallreihen (m_u/m_v),
  bevor ein Produkt entsteht.
- **E-FX-2 V-FL-37:** Skala per Regel nur für die Bewölkung (Fit 5b läuft so; ≤ 0,4 % CRPS gegen Kalibrierverlust).
- **E-FX-3 A6:** Fallbau mit `learned` und Falten-Tabellen je Monat (6–10 h Maschine) ⇒ Kandidat `fl-K+engine`; danach Reihenfolge Gesetz vor `fuseHour`.
- **E-FX-4 Motor-Liste (STOPP & FRAGEN):** M9 Anker-σ; C4/A8/A9 Familien in `dist.ts`/Codec; Client-Seite von C1/A1 (`cubeSource.ts`).
- **E-FX-5 Niederschlags-Produkt bei t2/t3:** Fenstermittel (heute) oder Stundensumme — Wahrheit und Hürde folgen der Definition (A5).
- **E-FX-6 Codec-Version 2 (TN):** bleibt, oder momentengleiche Rice nach A6 (2) — dann entfiele der Bump.
- **E-FX-7 Publisher-Kandidat:** keine Client-Tabelle aus Fit 5 vor Scorecard 5b und E-FX-1; die Fit-4-Tabelle (`fusionFit@3`) bleibt lesbar (kein
  Versionsbump: die neuen Designfelder sind optional, `clima: none` = heutiges Design).
- **E-FX-8 — entschieden und gemessen (FX-5, §6.5):** μ_c-Spalte nur für T/Td/Böe (`--climaVars=t,td,gust`); Scorecard 5e besteht die Regel je Größe × Bin (T +4,7 %*,
  Td +8,5 %*, Böe +2,8 %* bei 246–336 h gegen 5a; Bewölkung/Niederschlag exakt 0,0; keine Schicht unter −2 %) ⇒ **gebaut**: Produkt lokal (12,0 KB gz), Client-Wiring
  hinter `CubeIo.climaSource: 'json'` + `learnedSource: 'json'` (beides voreingestellt aus, Produktion byte-gleich), Fit-5e-Client-Tabelle (28,3 KB gz).
- **E-FX-10 Publisher-Weg des Klimatologieprodukts und der Fit-5e-Tabelle (Jans Gate):** Kopie `product\2026-09-27\clima\v1\stations.json` → Daten-Repo
  `point/static/clima/v1/stations.json` (zeitloses statisches Produkt, Lizenzzeilen im Dokument) UND `fit\2026-09-27-fx5e\fusion.client.json` → `point/fusion.client.json`
  — nur gemeinsam (V-FX-43): die station-Tabelle rechnet T/Td/Böe ohne Produkt nicht gelernt. Alternativ die Fit-4-Tabelle behalten (E-FX-7) und nichts kopieren.
- **E-FX-11 Einschalten hinter `?pf=cube`:** `defaultCubeIo` setzt `learnedSource: 'json'` und `climaSource: 'json'` gemeinsam (heute beides aus); erst nach E-FX-10 und
  einem Real-Device-Blick auf die erste Darstellung (das Produkt liegt nie auf dem kritischen Pfad: Priorität low, Entscheidung bei der ersten Ausgabe, danach zeitlos im Cache).
- **E-FX-9 — beantwortet durch A3 (§6.5, `diag-fx5-a3.md`): NEIN.** Die Klimatologie des Cube-Members ist als μ_c-Spalte ein Nullterm (u/v 126–336 h −0,3…+0,5 % =
  verwürfelte Kontrolle; Böe +2,1/+4,4 %* ≈ LOSO-Schätzung) — kein Producer-Produkt, kein Motor-Eingriff; die Windklimatologie mit Exposition bleibt eine Reanalyse-Frage
  (ERA5-Land, V-FX-45) oder eine rollende Stationsklimatologie (V-FX-46).
- **E-FX-12 Neuvermessung nach V-FX-44 (Zeilenverdünnung = Punktauswahl bei t2/t3):** Hash-Auswahl in `fit.mjs`/`score.mjs` und Referenzkette 5a → 5e neu fahren
  (≈ 8 h Maschine) — vor der nächsten Iteration oder erst mit dem Winter-Nachfit (E-FL-3)? Bis dahin gelten die Schicht-Zahlen der Bins 3–5 für 130/65 Stationen.
