# diag-fx1 — Fehleranalyse von Scorecard 4 (Fit 4, `fusionFit@3`), out of fold — Zusammenfassung (25.09.2026)

**Was gerechnet wurde:** `audit/fusion-forschung/diag-fx1.mjs` (Modell: `diag-fl2.mjs`), ein Durchlauf über alle 39 Fallreihen
(13 Monate 2025-09…2026-09, drei Stufen), Stride 12: **3 402 690 von 40 824 885 Zeilen**, Durchlauf 7,2 min, gesamt 12,7 min
(Gitter-Refit D3 5 min), Log `diag-fx1.log`, Zahlen `diag-fx1.json`, Tabellen unten. Kandidaten exakt wie `score.mjs`: fl-K mit den
Falten-β des Dateimonats für Mittelwert **und** Hürde (**out of fold**); Varianzmodell, σ-Skala, Speed-Gesetz, Mengenmodell und
Klimatologie gepoolt über alle Monate (**in-sample für diese Teile**, wie im Scorer). Auswahl je Größe like-for-like (fl-K, Cube, Klima
Station, Klima gepoolt alle vorhanden; 0 Zeilen ohne Klimatologie). Reproduktion gegen Scorecard 4 (Stride 6): ws 0–6 h S/S 0,84 / PIT
0,208 gegen 0,847 / 0,209; clct 246–336 h 1,71 / 0,136 gegen 1,705 / 0,138; CRPS ws je Bin 0,754 / 0,753 / 0,782 / 0,901 / 1,011 / 1,065
gegen 0,754 / 0,752 / 0,783 / 0,899 / 1,005 / 1,061 — die Diagnose misst dieselben Verteilungen.

## Kernbefunde (Zahlen = out of fold, wo nicht anders gesagt)

**D1 — Kalibrier-Artefakte (V-FL-39/42).** Tobit- und TN-Momente geschlossen, gegen ein 20 000-Knoten-Quantilgitter auf 1e-4 geprüft.
- **Bewölkung (G-FL-2 ✗ bei 7–336 h): Scorer-Artefakt.** Latente σ / RMSE = 1,29 · 1,31 · 1,41 · 1,56 · 1,71 (Bins 1–5), aber Tobit-sd / RMSE
  = **0,93 · 0,93 · 0,94 · 0,95 · 0,95** bei PIT-Rand 0,167 · 0,178 · 0,170 · 0,160 · 0,136. Die Verteilung ist nach beobachtbarer Streuung
  kalibriert; das Gate liest die latente σ einer an 0/100 zensierten Größe. **Rest real:** in der Lauf-Route ist die Skala 1,75–2,0 bei
  126–336 h überdispers (PIT-Rand 0,110 / **0,051**, n 54 598 / 41 480 — V-FL-41 bestätigt), dyn-Route 0,176 / 0,161 in der Spanne.
- **Wind (G-FL-2 ✗ bei 0–6, 51–120, 246–336 h): gemischt, überwiegend real.** Der Scorer-Spread (q84−q16)/2 ist **nicht** zu klein — die wahre
  TN-sd ist sogar kleiner (0–6 h: 1,263 gegen 1,224): mean(sd)/RMSE 0,82 · 0,80 · 0,79, √(mean var)/RMSE **0,87 · 0,85 · 0,85** (Definition
  mean-sd gegen RMS-sd verschiebt um +0,05). Der Rest ist real und sitzt in den Bergen: ≥ 800 m sd/RMSE **0,73 · 0,63 · 0,59**, PIT-Rand
  0,25 · 0,32 · 0,31 (n 61 882 · 237 096 · 88 799); < 800 m 0,90 · 0,90 · 0,90, PIT 0,196 · 0,203 · 0,194 (grün). Die PIT-Dezile zeigen
  einen schweren oberen Rand (oberstes Dezil 12–14 %). **Umgekehrt war Scorecard 3 das Artefakt:** die u/v-Rice hatte S/S 0,97–1,11 mit
  σ je Komponente, wahr **0,76–0,83** bei PIT-Rand 0,26–0,33 — die Rice war unterdispers, nicht „kalibriert".
- **Wind-Klimatologie:** Scorer-S/S 1,21–1,26 (σ je Komponente), wahr 0,85–0,89, RMS 0,96–0,99 — in der Streuung kalibriert; der PIT-Rand
  0,22–0,26 ist Form (unterstes Dezil 15–16 %), nicht Streuung. **Cube-Wind 126–336 h:** Bias −0,3/−0,4 m/s, sd/RMSE **0,52–0,54**, PIT-Rand
  0,37 — der Motor ist dort massiv unterdispers.
- T/Td/Böe: Normal ⇒ latente = wahre sd; T 0–6 h 0,86 (Skala 0,9, V-FL-37, real, mild), Böe Tobit-sd/RMSE 0,86–0,94, PIT 0,15–0,19.

**D2 — Langer Vorlauf.** Erste Vorlaufstunde mit CRPS fl-K > Klima (Station): **Wind 105 h, Böe 156 h, Td 234 h, Bewölkung 246 h, T 264 h.**
- **Wind 246–336 h:** fl-K 1,065 · Cube 1,136 · Klima Station **0,916** · Klima gepoolt 1,219. ρ(μ_K−μ_c, y−μ_c) = **0,03**, b = 0,08 — die
  Anomalie trägt nichts mehr, und die *Punktvorhersage* ist schlechter als die Klima-Mitte (RMSE 2,10 gegen 1,81). Die Orakel-Mischung
  (b in-sample je Stunde, σ_b konstant) erreicht 1,005 (Station) / 1,138 (gepoolt): **auch mit optimaler Mittelwert-Mischung bleibt die
  TN mit konstanter σ_b 10 % hinter der Klima-Rice** — die Klimatologie gewinnt durch ihre stündliche/saisonale σ_c und die Rice-Form,
  nicht nur durch μ_c. 126–240 h: fl-K 1,011 · Klima 0,914 · Mischung 0,985, ρ 0,17, b 0,28. Je Land: der Verlust gegen die Klimatologie
  ist an AT/CH/≥ 800 m konzentriert (246–336 h: AT 0,948 gegen 0,776, CH 1,052 gegen 0,828, ≥ 800 m 1,367 gegen 1,025; DE 1,121 gegen 1,020).
  **Die gepoolte Klimatologie (Band|Land) ist als Ziel unbrauchbar** (1,22 gegen 0,92): E-FL-12 braucht die Punkt-Klimatologie.
- **T 246–336 h:** fl-K 2,337 · Cube 2,364 · Klima 2,191 · Mischung **2,133 (−8,7 %)** mit b = 0,36, σ_b 3,79 (ρ 0,26); 126–240 h b 0,81,
  Mischung 1,673 ≈ fl-K 1,678. **Td 246–336 h:** 2,387 → Mischung 2,113 (= Klima), b 0,20. **Böe:** 126–240 h 1,641 gegen Klima 1,567, Mischung
  1,606; 246–336 h 1,758 gegen 1,570, Mischung 1,634 (b 0,05) — wie beim Wind reicht die Mittelwert-Mischung nicht an die zensierte
  Klimatologie heran. **Bewölkung 246–336 h:** 20,95 gegen 20,74, Mischung 20,92 (ρ 0,04). Lesart: bei T/Td ist die fehlende Schrumpfung auf
  die **Stations**-Klimatologie das Plateau (die Ridge hält β_cube nahe 1, μ_c fehlt im Design — V-FL-23); bei Wind/Böe muss zusätzlich die
  Streuung σ_c(h, doy) übernommen werden (§6 der Mathematik-Spezifikation: Var = σ_c²(1−ρ²) — hier gemessen: σ_b 1,81 konstant ≈ RMSE Klima).

**D3 — Wind-Standortabhängigkeit (V-FL-38).** 1 600 000 gespeicherte ws-Zeilen. Gitter-Refit je Gruppe **in-sample (Obergrenze, kein
Ergebnis)**. Die globalen Optima je Bin liegen beim geschriebenen Gesetz (Δ −0,1 … −0,6 %), b = 1,2 am Gitterrand in 4 von 6 Bins.
- **Bias des Gesetzes je Land:** DE **−0,24 … −0,40 m/s** (zu niedrig), AT **+0,19 … +0,37** (zu hoch), CH +0,02 … +0,18 — in jedem Bin; das
  Gesetz (a −0,6/−0,9 für alle) kann einen Standort-Versatz nicht tragen. Gruppen-Optima: DE (−0,45, 1,1, 1,0–1,1) ⇒ −2,9 / −1,0 / −3,3 %
  gegen das Gesetz bei 0–6 / 7–24 / 25–48 h (= die V-FL-38-Regression); AT (−1,65, 1,2, 1,3–1,4) ⇒ −3,6 / −5,7 / −2,9 %; Höhe 300–800 m
  (−1,05 … −1,65) ⇒ −1,2 … −3,6 %; **≥ 1 500 m will a ≈ +0,3, b 0,7 (Rand)** ⇒ −5,9 / −7,5 / −9,2 % bei 51–336 h (Bias −0,53 … −0,76: der
  Rice-Mittelwert ist dort zu hoch, die Rice selbst schlägt das Gesetz um 1–4 %). tpi2000-Terzil 1 (Senken/Täler) −2,2 … −4,9 %.
- **Lineares Gesetz** a = a0 + a1·lnZ0 + a2·tpi + a3·h (b, c fest): nur **−0,2 … −1,2 %** gegen das Gesetz; a3 = 0 in jedem Bin — die
  Höhenabhängigkeit ist nicht monoton (300–800 m mehr Abzug, ≥ 1 500 m Zuschlag), ein lineares a trägt sie nicht. Skizze stattdessen:
  ein Gesetz je Höhenklasse (< 300 / 300–800 / 800–1 500 / ≥ 1 500) oder der Versatz in den u/v-Mittelwert (lnZ0/Land-Spalten im
  Mittelwertmodell — der Bias ist out of fold da, das Mittelwertmodell trägt ihn also nicht).
- PIT-Rand des Gesetzes: DE 0,17–0,18 (grün), AT 0,22–0,29, CH 0,20–0,32, ≥ 1 500 m 0,26–0,38 — die Unterdispersion der Berge (D1) ist eine
  Varianz-, keine Gesetzesfrage (c-Optimum 1,3–1,5 dort).

**D4 — T/Td-Plateau.** Residuum e = y − μ_K, Bins 0–3. **Flags und Vertikalfall sind im Hindcast konstant** (`stdLapseFallback` = 1,
`inversionBody`/`extrapolatedBelowModel`/`hmodelProxy` = 0, `verticalCase` = std in allen 3,4 M Zeilen — kein Profil im Hindcast) ⇒ diese
Gruppierungen sind nicht auswertbar (Beleg in den Tabellen).
- **Varianzverhältnis VR = mean e²/mean σ²** zeigt Struktur, die das Varianzmodell (9 Spalten, ohne Jahresgang, ohne dTsfc, ohne Wind,
  ohne Bewölkung) nicht trägt: T 0–6 h **DJF VR 1,38–1,93** je Sonnenstunde gegen MAM/JJA/SON 0,9–1,3 (n 5 400–6 000 je Zelle);
  **dTsfc-Quintil 1 (stark entkoppelt, < −4 K) VR 1,74** (0–6 h), 1,43 (25–48 h), 1,34 (51–120 h) gegen Q5 0,97–0,99; **Cube-Wind < 2 m/s
  VR 1,24–1,39** gegen Rest 0,93–1,07 (0–6 h); **klare Nacht (c_clct-Terzil 1) VR 1,58**, bedeckter Tag bei 25–48 h **1,81**, klarer Tag
  25–48 h 0,78. Nachmittag (Sonnenstunde 15–18) bei 51–120 h in allen Jahreszeiten VR 1,24–1,48, Abend (18–21) 0,67–1,09. Td: 0–6 h
  ≥ 800 m VR 1,19, dTsfc Q1 1,32; ab 25–48 h VR 0,86–1,06 (nahe kalibriert). **Bedingter Bias** ist klein (|Bias| ≤ 0,3 K bis auf
  MAM-Nachmittage 51–120 h +0,5 … +0,8 K und DJF 15–18 h −0,6 K).
- **Je-Standort-Obergrenze** (Bias je Punkt × Sonnenstunde 8 × Saison, leave-one-month-out, nur Zellen mit n_other ≥ 30; **braucht eine
  Station, nicht übertragbar**): T RMSE **−6,4 % (0–6 h) · −5,8 % (7–24) · −4,3 % (25–48) · −2,8 % (51–120)**, CRPS −6,5 / −5,5 / −4,4 / −2,3 %
  (n 296 k … 1,19 M; korrigierbarer Anteil 96 / 78 / 78 / 100 %); Td −4,3 / −1,9 / −0,4 / +0,1 %. In-sample −12 / −10 % (optimistisch). Das
  Mittelwertmodell mit 14 Standort×Tagesgang-Spalten lässt bei T einen standortfesten Rest von 4–6 % RMSE.
- **Tails:** z = e/σ_K: T Schiefe −0,1 … −0,6 (Tag negativer), Exzess-Kurtosis 0,6 (Nacht) … 2,9 (Tag); **Td 0–6 h Tag/Nacht Kurtosis 10,7–11,4,
  Schiefe −0,9** (Übergang 2,1; 7–120 h 1,4–3,1) — bei Td 0–6 h sitzt ein Ausreißer-Schwanz (Verdacht: abgeleitete Td-Wahrheit / Td ≤ T-Klemme;
  nicht geprüft). Ein Normal-CRPS ist dagegen robust; für die Quantile ist es sichtbar.

**D5 — Niederschlag** (Brier/CRPS je Bin × Route; KPC = fl-K vorhanden, PC = fl-K `no-skill`).
- **Lauf-Route 0–6 h (n 135 053):** Brier(0,1) K 0,0406 ≈ Cube 0,0405, **fl-P 0,0380 (−6 %)**, Mittel 0,0398. CRPS K 0,0663 **> Cube 0,0646**:
  trocken K besser (0,0046 gegen 0,0051), **nass K schlechter (0,980 gegen 0,946)**. **Tag-0-Route 0–6 h:** K 0,0458 gegen Cube 0,0538 (−15 %),
  P 0,0448; Reliability des Cube dort stark unterkonfident (Vorhersage 0,44 → beobachtet 0,74; 0,55 → 0,88), K nur teilweise korrigiert
  (0,45 → 0,53, 0,55 → 0,68). **7–24 h Lauf-Route (n 403 047):** Cube 0,0470, P 0,0460; Cube am oberen Ende überkonfident (0,75 → 0,62,
  0,84 → 0,66), P weniger (0,74 → 0,70). **dyn 51–120 h (n 827 516):** K 0,0807 gegen Cube 0,0831 (−2,9 %), P 0,0810; der Cube ist bei t3
  unterkonfident (0,23 → 0,40, 0,33 → 0,58), K behebt das (0,24 → 0,25, 0,34 → 0,38). Trocken-CRPS K 0,0066 gegen Cube 0,0033 (K legt in
  trockenen Stunden mehr Masse auf nass), nass 0,613 gegen 0,648.
- **Menge | nass:** fl-K PIT-Dezile 6 **20** 6 10 9 9 9 11 10 10 (Spitze im 2. Dezil = quantisierte 0,1-mm-Wahrheit), q90-Abdeckung
  **0,896** (Ziel 0,9); Cube 15 9 8 7 7 7 8 9 10 20 (U-Form, unterdispers) mit q90-Abdeckung 0,795 (Lauf) / 0,930 (Tag 0) / 0,936 (dyn).
  MAE des Medians K ≤ Cube (1,013 gegen 1,037).
- **Prädiktoren (punktbiserial mit nass):** 0–6 h **icon_d2 nass 0,641 > Cube-Hürde 0,636 > Member 0,622** > icon_eu 0,545/0,513 — Form P
  gewinnt, weil sie icon_d2 höher gewichten darf als das gleichgewichtete Member. 7–24 h Cube-Hürde 0,462 > icon_d2 0,433 ≈ Member 0,430.
  51–120 h Member 0,359 ≈ c_precip 0,355 > icon_eu 0,334 > ifs_hres 0,321 > icon_ch2 0,270 ≈ icon_global 0,252. **t3: ln1p(c_precip_q90)
  0,248 (126–240 h) / 0,100 (246–336 h) gegen Member 0,219 / 0,063 und σ_ens 0,203 / 0,066** — das Ensemble-q90 trägt am langen Ende mehr als
  der Mittelwert; es steht **nicht** im Hürden-Design (`O_NAMES`: lnP, wetShare, lnSigDiv — ohne q90, ohne σ_ens).

**D6 — Bewölkung (DE).** Beobachtete Atome P(0) 0,25 / P(100) 0,32 (Lauf-Route); fl-K legt bei 0–6 h nur **0,125 / 0,191** darauf (Skala
1,2), bei 246–336 h 0,227 / 0,338 (Skala 2,0); Cube 0,02–0,03 / 0,08–0,11, PIT-Rand Cube 0,38–0,65 (Motor-σ viel zu klein, Tobit-sd/RMSE
0,58–0,65). Die zensierte Normal erreicht die Atome erst mit großer σ — die Wahrheit ist bimodal (57 % an 0 oder 100), die Form passt
nur im Mittel. **Schichtbewölkung trägt Information, die das Gesamt-Prädiktor-Modell nicht hat:** bei c_clct > 67 %: MAE des fl-K-Medians
**8,6** (clcl > 80 %) / **7,8** (clcm > 80 %) / 9,7 (clch > 80 %) gegen 17,0 / 19,2 / 16,2 bei derselben Schicht < 20 % (0–6 h, n 21–42 k je
Zelle); bei 51–120 h 14,5 / 16,3 gegen 25,7 / 28,1. Und: **Gesamt 33–67 % nur aus Hochbewölkung (clch > 80 %) ⇒ Bias −26 %-Pkt** (n 8 711,
51–120 h; die Beobachtung ist viel klarer als das Modell-Gesamt). Skizze: c_clcl/c_clcm/c_clch (oder max Schicht) als Spalten im Mittel- und
Varianzdesign der Bewölkung.

## Verdikte je G-FL-2-Fehlschlag der Scorecard 4 (fl-K)

| Gate | S/S alt (latent/Scorer) | S/S korrigiert (wahre sd / RMS) | PIT-Rand | Verdikt |
|---|---|---|---|---|
| ws 0–6 h | 0,84 | 0,82 / 0,87 | 0,208 | gemischt — Definition +0,05, Rest real (≥ 800 m 0,73 / PIT 0,25) |
| ws 51–120 h | 0,83 | 0,80 / 0,85 | 0,227 | gemischt — ≥ 800 m 0,63 / PIT 0,32 real, < 800 m 0,90 / 0,203 grün |
| ws 246–336 h | 0,82 | 0,79 / 0,85 | 0,221 | gemischt — ≥ 800 m 0,59 / PIT 0,31 real |
| clct 7–24 h | 1,29 | 0,93 / 0,94 | 0,167 | Scorer-Artefakt |
| clct 25–48 h | 1,31 | 0,93 / 0,94 | 0,178 | Scorer-Artefakt |
| clct 51–120 h | 1,41 | 0,94 / 0,95 | 0,170 | Scorer-Artefakt |
| clct 126–240 h | 1,56 | 0,95 / 0,95 | 0,160 | Scorer-Artefakt (Lauf-Route PIT 0,110 leicht überdispers) |
| clct 246–336 h | 1,71 | 0,95 / 0,96 | 0,136 | gemischt — Artefakt im Maß, Lauf-Route PIT 0,051 real überdispers (V-FL-41) |

## Vorbehalte

- Klimatologie auf allen Wahrheitstagen 2023-05…2026-09 gefittet (schließt das Bewertungsfenster ein; 13 Parameter je Reihe);
  Varianz, σ-Skala, Speed-Gesetz, Menge gepoolt = in-sample; Orakel-Mischung (b, σ_b) und Gruppen-Refits in-sample (Obergrenzen).
- 7–48 h nur 95 Sommertage (Lauf-Route Juni–September); Winter fehlt dort; die LOMO-Obergrenze bei 7–48 h hat nur 78 % korrigierbare Zeilen.
- Kein Profil im Hindcast: Flags/Vertikalfall konstant, `stdLapseFallback` immer gesetzt — die Flag-Gruppierung sagt nichts über den Live-Pfad.
- Zensierte CRPS geschlossen (≤ 6e-6 vom Scorer-Integral); Rice-CRPS wie im Scorer (96 Zellen). Pooled Band|Land fehlt für CZ/SK/DK/NL/LU
  nur, wo es keine Reihe gibt — 0 übersprungene Zeilen, alle 405 Punkte tragen über `byPoint` oder pooled.
- D2 „CRPS Mischung" auf Reservoir-Stichproben je (Größe, Stunde) (n_S ≤ 4 000, deterministisch), b/σ_b aus den vollen Summen.
- Td 0–6 h Kurtosis 11 nicht auf die Ursache geprüft (Wahrheitsableitung `tdDerived`?).

---

# diag-fx1 — Fehleranalyse Scorecard 4 (Fit 4, fusionFit@3), out of fold

Erzeugt 2026-09-25T16:45:15.485Z; 40824885 Zeilen gelesen, 3402690 benutzt (Stride 12, alle Stufen, Monate 2025-09…2026-09); Tabellen `fit/2026-09-25-ap8c/fusion.hindcast.json`. Kandidaten wie `score.mjs`: fl-K mit den Falten-β des Dateimonats (Mittelwert und Hürde, out of fold); Varianz, σ-Skala, Speed-Gesetz, Menge und Klimatologie gepoolt (in-sample für diese Teile). Zensierte CRPS geschlossen (`crpsCensoredNormal`, ≤ 6e-6 vom Scorer-Integral). Auswahl je Größe like-for-like: nur Zeilen, an denen fl-K, Cube, Klima (Station = Scorer-Definition byPoint ?? pooled) UND Klima (gepoolt Band|Land) existieren (0 Zeilen×Größen ohne Klimatologie übersprungen).

## D1 Kalibrier-Artefakte (V-FL-39/42) — Spread des Scorers gegen die wahre Standardabweichung

Spread(Scorer) = latente σ (Normal, zensiert), σ je Komponente (Rice), (q84−q16)/2 (TN). sd(wahr) = geschlossen: TN-sd, Tobit-sd der zensierten Normal auf [lo, hi], Rice sd = √(2σ²+ν²−E²). Punktwert wie im Scorer (Mittel für Normal/Rice/TN, Median für zensiert). S/S₁ = mean(σ_Scorer)/RMSE, S/S₂ = mean(sd)/RMSE, S/S₃ = √(mean var)/RMSE. Alle Zahlen out of fold (fl-K-Mittelwert) bzw. gepoolt (σ). Momenten-Gegenprobe (geschlossen gegen 20 000-Knoten-Quantilgitter):

- censoredNormal μ 50 σ 20 [0, 100]: E 50.0000 / 50.0000 · sd 19.7743 / 19.7743 (Δsd 1.9e-6)
- censoredNormal μ 95 σ 25 [0, 100]: E 87.3281 / 87.3280 · sd 16.2706 / 16.2706 (Δsd -5.8e-5)
- censoredNormal μ 5 σ 30 [0, 100]: E 14.6278 / 14.6278 · sd 19.1679 / 19.1679 (Δsd 5.0e-6)
- censoredNormal μ 3 σ 2 [0, 90]: E 3.0586 / 3.0586 · sd 1.8851 / 1.8850 (Δsd 3.5e-5)
- truncatedNormal μ 2 σ 1.5: E 2.2707 / 2.2707 · sd 1.2788 / 1.2788 (Δsd 2.8e-5)
- truncatedNormal μ 0.5 σ 1.2: E 1.1635 / 1.1635 · sd 0.8173 / 0.8173 (Δsd 2.6e-5)
- truncatedNormal μ -0.5 σ 1: E 0.6411 / 0.6411 · sd 0.5182 / 0.5181 (Δsd 2.4e-5)

| Größe | Bin | Kandidat | Schicht | n | Bias | RMSE | σ Scorer | sd wahr | S/S₁ | S/S₂ | S/S₃ | PIT außen | PIT-Dezile (%) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| t | 0–6 | K | all | 295990 | -0.004 | 1.392 | 1.199 | 1.199 | 0.86 | 0.86 | 0.91 | 0.207 | 10.6 8.3 8.9 9.7 10.4 10.8 10.8 10.5 9.9 10.1 |
| t | 7–24 | K | all | 443653 | 0.055 | 1.523 | 1.504 | 1.504 | 0.99 | 0.99 | 1.00 | 0.170 | 9.8 8.8 9.6 10.5 11.3 11.6 11.3 10.6 9.3 7.3 |
| t | 25–48 | K | all | 586162 | 0.148 | 1.703 | 1.538 | 1.538 | 0.90 | 0.90 | 0.91 | 0.207 | 12.5 9.5 9.8 10.3 10.5 10.6 10.2 9.6 8.7 8.2 |
| t | 51–120 | K | all | 1187701 | 0.068 | 2.148 | 2.083 | 2.083 | 0.97 | 0.97 | 0.98 | 0.186 | 10.3 8.8 9.7 10.7 11.1 11.2 10.8 10.1 8.9 8.4 |
| t | 126–240 | K | all | 488115 | -0.028 | 3.074 | 3.008 | 3.008 | 0.98 | 0.98 | 1.00 | 0.188 | 9.6 9.3 9.6 9.9 10.2 10.6 10.8 10.7 10.2 9.1 |
| t | 246–336 | K | all | 385811 | -0.059 | 4.204 | 4.155 | 4.155 | 0.99 | 0.99 | 1.00 | 0.198 | 9.6 10.1 10.2 10.3 10.1 10.0 9.8 9.7 9.9 10.2 |
| td | 0–6 | K | all | 295799 | 0.027 | 1.405 | 1.232 | 1.232 | 0.88 | 0.88 | 0.96 | 0.186 | 10.1 8.6 9.4 10.4 11.2 11.5 11.1 10.2 9.0 8.4 |
| td | 7–24 | K | all | 443425 | 0.027 | 1.506 | 1.433 | 1.433 | 0.95 | 0.95 | 1.00 | 0.184 | 10.0 9.0 9.7 10.6 11.1 11.2 10.9 10.1 9.0 8.4 |
| td | 25–48 | K | all | 585858 | 0.034 | 1.707 | 1.697 | 1.697 | 0.99 | 0.99 | 1.02 | 0.170 | 9.1 9.0 10.1 10.9 11.4 11.6 11.0 10.2 8.9 8.0 |
| td | 51–120 | K | all | 1187209 | -0.022 | 2.183 | 1.964 | 1.964 | 0.90 | 0.90 | 0.92 | 0.199 | 10.3 8.4 9.1 9.9 10.4 11.0 11.0 10.6 9.8 9.5 |
| td | 126–240 | K | all | 487785 | 0.057 | 3.248 | 2.873 | 2.873 | 0.88 | 0.88 | 0.90 | 0.218 | 11.9 8.8 9.1 9.5 9.9 10.2 10.4 10.3 10.0 10.0 |
| td | 246–336 | K | all | 385547 | 0.248 | 4.297 | 4.196 | 4.196 | 0.98 | 0.98 | 0.98 | 0.196 | 11.6 9.9 10.1 10.0 10.1 10.1 10.2 10.2 9.7 8.0 |
| ws | 0–6 | clima | all | 296121 | 0.150 | 1.815 | 2.222 | 1.558 | 1.22 | 0.86 | 0.96 | 0.244 | 14.6 12.3 10.9 10.0 9.7 8.8 8.3 7.9 7.5 9.8 |
| ws | 0–6 | cube | all | 296121 | 0.051 | 1.641 | 1.664 | 1.278 | 1.01 | 0.78 | 0.81 | 0.289 | 17.0 11.4 9.8 8.7 8.7 8.4 8.1 7.9 8.0 11.9 |
| ws | 0–6 | cube | band:ge800 | 61882 | 0.244 | 2.377 | 2.429 | 1.770 | 1.02 | 0.74 | 0.78 | 0.349 | 23.4 13.1 9.5 8.0 7.4 6.9 6.6 6.6 7.1 11.5 |
| ws | 0–6 | cube | band:lt800 | 234239 | 0.000 | 1.382 | 1.462 | 1.148 | 1.06 | 0.83 | 0.84 | 0.273 | 15.3 11.0 9.9 8.9 9.0 8.8 8.5 8.3 8.2 12.0 |
| ws | 0–6 | cube | country:AT | 63717 | 0.526 | 1.712 | 1.820 | 1.313 | 1.06 | 0.77 | 0.81 | 0.363 | 29.3 14.8 11.3 8.5 7.1 6.1 5.7 5.2 4.8 7.0 |
| ws | 0–6 | cube | country:CH | 76598 | 0.556 | 1.796 | 2.044 | 1.467 | 1.14 | 0.82 | 0.86 | 0.339 | 27.1 15.1 11.0 9.1 8.0 6.7 5.8 5.3 5.1 6.9 |
| ws | 0–6 | cube | country:DE | 154841 | -0.398 | 1.528 | 1.411 | 1.172 | 0.92 | 0.77 | 0.78 | 0.233 | 6.8 8.2 8.7 8.7 9.7 10.1 10.3 10.4 10.7 16.5 |
| ws | 0–6 | cube | country:LI | 965 | 0.665 | 1.301 | 1.647 | 1.117 | 1.27 | 0.86 | 0.87 | 0.378 | 34.9 14.7 8.5 8.8 6.8 6.8 6.9 6.8 2.7 2.9 |
| ws | 0–6 | K | all | 296121 | -0.076 | 1.496 | 1.263 | 1.224 | 0.84 | 0.82 | 0.87 | 0.208 | 9.1 11.0 10.7 10.4 10.1 9.7 9.3 9.0 9.0 11.6 |
| ws | 0–6 | K | band:ge800 | 61882 | -0.129 | 2.194 | 1.668 | 1.609 | 0.76 | 0.73 | 0.80 | 0.251 | 10.6 13.8 11.8 9.8 8.8 8.0 7.4 7.3 8.0 14.5 |
| ws | 0–6 | K | band:lt800 | 234239 | -0.062 | 1.248 | 1.156 | 1.123 | 0.93 | 0.90 | 0.93 | 0.196 | 8.8 10.2 10.5 10.5 10.4 10.2 9.9 9.5 9.3 10.9 |
| ws | 0–6 | K | country:AT | 63717 | 0.201 | 1.571 | 1.230 | 1.185 | 0.78 | 0.75 | 0.82 | 0.252 | 15.5 15.6 12.5 10.7 8.9 7.8 6.8 6.3 6.1 9.7 |
| ws | 0–6 | K | country:CH | 76598 | 0.179 | 1.641 | 1.363 | 1.313 | 0.83 | 0.80 | 0.87 | 0.227 | 13.1 15.5 13.3 10.9 9.6 8.3 7.2 6.3 6.2 9.5 |
| ws | 0–6 | K | country:DE | 154841 | -0.319 | 1.387 | 1.229 | 1.198 | 0.89 | 0.86 | 0.90 | 0.180 | 4.5 6.7 8.7 9.9 10.8 11.2 11.5 11.5 11.6 13.5 |
| ws | 0–6 | K | country:LI | 965 | 0.415 | 1.087 | 1.118 | 1.071 | 1.03 | 0.98 | 1.01 | 0.219 | 18.9 18.0 14.0 8.4 9.4 8.0 7.5 7.7 5.2 3.0 |
| ws | 0–6 | K-rice | all | 296121 | 0.198 | 1.503 | 1.451 | 1.186 | 0.97 | 0.79 | 0.83 | 0.275 | 18.3 12.7 11.0 9.9 8.9 8.3 7.7 7.2 6.9 9.2 |
| ws | 7–24 | clima | all | 443403 | 0.015 | 1.609 | 2.021 | 1.428 | 1.26 | 0.89 | 0.99 | 0.217 | 11.4 11.6 10.7 10.2 10.2 9.5 9.1 8.8 8.3 10.3 |
| ws | 7–24 | cube | all | 443403 | 0.244 | 1.646 | 1.863 | 1.393 | 1.13 | 0.85 | 0.88 | 0.276 | 18.3 12.5 10.1 9.4 9.1 8.5 8.1 7.5 7.2 9.3 |
| ws | 7–24 | cube | band:ge800 | 91961 | 0.671 | 2.266 | 2.695 | 1.913 | 1.19 | 0.84 | 0.88 | 0.328 | 25.2 14.2 10.3 9.0 8.0 7.3 6.4 6.2 5.9 7.6 |
| ws | 7–24 | cube | band:lt800 | 351442 | 0.132 | 1.440 | 1.645 | 1.257 | 1.14 | 0.87 | 0.88 | 0.262 | 16.5 12.0 10.1 9.5 9.4 8.9 8.5 7.9 7.5 9.7 |
| ws | 7–24 | cube | country:AT | 95363 | 0.809 | 1.708 | 2.038 | 1.437 | 1.19 | 0.84 | 0.88 | 0.368 | 32.0 16.0 11.1 8.7 7.2 6.3 5.4 4.5 4.0 4.8 |
| ws | 7–24 | cube | country:CH | 115095 | 0.775 | 1.828 | 2.261 | 1.584 | 1.24 | 0.87 | 0.91 | 0.329 | 27.9 15.4 11.5 9.6 8.1 6.8 5.8 5.0 4.7 5.1 |
| ws | 7–24 | cube | country:DE | 231790 | -0.255 | 1.520 | 1.594 | 1.282 | 1.05 | 0.84 | 0.86 | 0.210 | 7.8 9.5 9.1 9.6 10.3 10.3 10.3 10.0 9.8 13.2 |
| ws | 7–24 | cube | country:LI | 1155 | 0.850 | 1.367 | 1.774 | 1.185 | 1.30 | 0.87 | 0.87 | 0.380 | 35.9 15.6 9.7 10.8 7.1 4.9 8.1 5.0 0.8 2.1 |
| ws | 7–24 | K | all | 443403 | -0.012 | 1.466 | 1.287 | 1.245 | 0.88 | 0.85 | 0.89 | 0.203 | 9.7 12.0 11.5 10.8 10.2 9.6 9.1 8.4 8.1 10.6 |
| ws | 7–24 | K | band:ge800 | 91961 | -0.144 | 2.039 | 1.561 | 1.503 | 0.77 | 0.74 | 0.79 | 0.251 | 9.9 13.5 11.6 9.9 9.0 8.2 7.6 7.3 7.9 15.2 |
| ws | 7–24 | K | band:lt800 | 351442 | 0.023 | 1.274 | 1.215 | 1.178 | 0.95 | 0.92 | 0.95 | 0.191 | 9.7 11.6 11.5 11.0 10.5 9.9 9.5 8.7 8.1 9.4 |
| ws | 7–24 | K | country:AT | 95363 | 0.327 | 1.491 | 1.247 | 1.201 | 0.84 | 0.81 | 0.86 | 0.255 | 17.2 16.9 12.9 10.8 8.9 7.2 6.5 5.8 5.4 8.3 |
| ws | 7–24 | K | country:CH | 115095 | 0.166 | 1.578 | 1.339 | 1.288 | 0.85 | 0.82 | 0.87 | 0.227 | 12.7 15.6 13.3 11.0 9.7 8.4 7.1 6.3 5.9 10.0 |
| ws | 7–24 | K | country:DE | 231790 | -0.242 | 1.398 | 1.278 | 1.243 | 0.91 | 0.89 | 0.92 | 0.170 | 5.1 8.2 10.0 10.7 10.9 11.2 11.1 10.6 10.3 12.0 |
| ws | 7–24 | K | country:LI | 1155 | 0.479 | 1.111 | 1.092 | 1.046 | 0.98 | 0.94 | 0.95 | 0.233 | 21.0 18.7 11.2 10.2 8.2 9.3 7.4 7.4 4.2 2.3 |
| ws | 7–24 | K-rice | all | 443403 | 0.147 | 1.477 | 1.485 | 1.197 | 1.01 | 0.81 | 0.84 | 0.264 | 16.8 12.5 11.0 9.9 9.0 8.7 7.9 7.5 7.1 9.7 |
| ws | 25–48 | clima | all | 585411 | 0.008 | 1.611 | 2.021 | 1.427 | 1.25 | 0.89 | 0.99 | 0.217 | 11.3 11.5 10.7 10.2 10.2 9.5 9.1 8.8 8.3 10.3 |
| ws | 25–48 | cube | all | 585411 | 0.484 | 1.805 | 2.149 | 1.570 | 1.19 | 0.87 | 0.90 | 0.287 | 21.3 13.3 10.5 9.8 9.1 8.1 7.5 6.9 6.1 7.4 |
| ws | 25–48 | cube | band:ge800 | 121403 | 1.139 | 2.511 | 3.133 | 2.184 | 1.25 | 0.87 | 0.90 | 0.348 | 29.6 14.9 10.9 9.1 7.7 6.8 6.0 5.5 4.3 5.2 |
| ws | 25–48 | cube | band:lt800 | 464008 | 0.313 | 1.569 | 1.891 | 1.409 | 1.21 | 0.90 | 0.91 | 0.271 | 19.1 12.9 10.4 10.0 9.5 8.5 7.9 7.2 6.6 8.0 |
| ws | 25–48 | cube | country:AT | 125896 | 1.122 | 1.930 | 2.334 | 1.619 | 1.21 | 0.84 | 0.88 | 0.399 | 36.2 16.7 11.0 8.3 7.0 5.5 4.5 3.9 3.2 3.7 |
| ws | 25–48 | cube | country:CH | 151948 | 1.134 | 2.060 | 2.592 | 1.787 | 1.26 | 0.87 | 0.91 | 0.358 | 32.3 16.2 11.8 9.3 7.5 6.3 5.1 4.5 3.4 3.6 |
| ws | 25–48 | cube | country:DE | 306043 | -0.104 | 1.607 | 1.853 | 1.442 | 1.15 | 0.90 | 0.91 | 0.204 | 9.5 10.4 9.6 10.6 10.8 10.2 10.0 9.3 8.7 10.9 |
| ws | 25–48 | cube | country:LI | 1524 | 1.162 | 1.613 | 2.028 | 1.349 | 1.26 | 0.84 | 0.84 | 0.444 | 42.7 14.2 12.7 8.4 5.5 7.1 5.6 1.7 0.3 1.7 |
| ws | 25–48 | K | all | 585411 | -0.162 | 1.528 | 1.327 | 1.280 | 0.87 | 0.84 | 0.88 | 0.195 | 7.1 10.6 10.8 10.7 10.4 10.0 9.7 9.3 9.2 12.3 |
| ws | 25–48 | K | band:ge800 | 121403 | -0.301 | 2.093 | 1.569 | 1.507 | 0.75 | 0.72 | 0.77 | 0.239 | 7.3 12.4 11.1 10.2 9.4 8.6 8.0 7.8 8.6 16.7 |
| ws | 25–48 | K | band:lt800 | 464008 | -0.126 | 1.341 | 1.264 | 1.221 | 0.94 | 0.91 | 0.94 | 0.183 | 7.1 10.1 10.7 10.8 10.6 10.4 10.1 9.6 9.3 11.2 |
| ws | 25–48 | K | country:AT | 125896 | 0.199 | 1.493 | 1.266 | 1.216 | 0.85 | 0.81 | 0.86 | 0.223 | 12.8 16.1 13.3 11.3 9.7 8.0 7.0 6.3 6.0 9.5 |
| ws | 25–48 | K | country:CH | 151948 | 0.024 | 1.599 | 1.347 | 1.292 | 0.84 | 0.81 | 0.86 | 0.208 | 9.6 14.0 12.8 11.4 10.1 9.0 7.9 7.1 6.8 11.2 |
| ws | 25–48 | K | country:DE | 306043 | -0.405 | 1.508 | 1.344 | 1.302 | 0.89 | 0.86 | 0.90 | 0.176 | 3.5 6.5 8.8 10.1 10.8 11.3 11.6 11.6 11.7 14.1 |
| ws | 25–48 | K | country:LI | 1524 | 0.401 | 1.151 | 1.103 | 1.056 | 0.96 | 0.92 | 0.93 | 0.229 | 19.6 16.1 12.5 9.1 7.6 9.8 8.5 7.7 5.8 3.3 |
| ws | 25–48 | K-rice | all | 585411 | 0.212 | 1.536 | 1.597 | 1.273 | 1.04 | 0.83 | 0.86 | 0.264 | 17.6 13.1 11.2 9.9 9.3 8.5 7.7 7.2 6.7 8.9 |
| ws | 51–120 | clima | all | 1178167 | 0.194 | 1.826 | 2.247 | 1.566 | 1.23 | 0.86 | 0.97 | 0.255 | 16.0 12.4 11.3 10.0 9.4 8.6 8.0 7.6 7.2 9.5 |
| ws | 51–120 | cube | all | 1178167 | 0.809 | 2.260 | 2.623 | 1.839 | 1.16 | 0.81 | 0.84 | 0.354 | 28.7 12.9 10.4 8.9 7.8 7.1 6.3 5.8 5.4 6.7 |
| ws | 51–120 | cube | band:ge800 | 237096 | 1.611 | 3.190 | 3.757 | 2.531 | 1.18 | 0.79 | 0.82 | 0.441 | 39.1 13.8 10.0 7.8 6.8 5.5 4.6 3.7 3.7 5.1 |
| ws | 51–120 | cube | band:lt800 | 941071 | 0.607 | 1.957 | 2.337 | 1.665 | 1.19 | 0.85 | 0.86 | 0.332 | 26.1 12.7 10.6 9.1 8.1 7.5 6.7 6.3 5.9 7.1 |
| ws | 51–120 | cube | country:AT | 254430 | 1.739 | 2.465 | 2.864 | 1.923 | 1.16 | 0.78 | 0.81 | 0.511 | 48.7 15.4 9.3 6.5 5.0 4.0 3.2 2.8 2.6 2.4 |
| ws | 51–120 | cube | country:CH | 311614 | 1.589 | 2.534 | 3.070 | 2.043 | 1.21 | 0.81 | 0.85 | 0.461 | 42.6 15.4 9.9 7.1 6.0 4.8 4.1 3.5 3.1 3.5 |
| ws | 51–120 | cube | country:DE | 612123 | 0.026 | 2.008 | 2.294 | 1.701 | 1.14 | 0.85 | 0.86 | 0.234 | 13.2 10.5 11.2 10.7 9.9 9.6 8.6 8.2 7.8 10.2 |
| ws | 51–120 | K | all | 1178167 | -0.042 | 1.754 | 1.460 | 1.407 | 0.83 | 0.80 | 0.85 | 0.227 | 10.1 12.7 11.7 10.3 9.5 9.1 8.4 7.9 7.8 12.7 |
| ws | 51–120 | K | band:ge800 | 237096 | -0.364 | 2.431 | 1.578 | 1.520 | 0.65 | 0.63 | 0.73 | 0.324 | 9.3 11.8 10.1 8.7 8.0 7.3 6.8 6.9 7.9 23.1 |
| ws | 51–120 | K | band:lt800 | 941071 | 0.039 | 1.537 | 1.431 | 1.379 | 0.93 | 0.90 | 0.93 | 0.203 | 10.3 12.9 12.1 10.7 9.8 9.5 8.7 8.1 7.8 10.0 |
| ws | 51–120 | K | country:AT | 254430 | 0.317 | 1.644 | 1.320 | 1.268 | 0.80 | 0.77 | 0.85 | 0.280 | 16.4 17.5 12.8 9.7 7.6 6.5 6.0 5.8 6.0 11.7 |
| ws | 51–120 | K | country:CH | 311614 | 0.039 | 1.905 | 1.388 | 1.331 | 0.73 | 0.70 | 0.76 | 0.294 | 14.5 15.3 11.9 9.5 8.4 7.3 6.3 5.9 6.0 14.8 |
| ws | 51–120 | K | country:DE | 612123 | -0.233 | 1.718 | 1.556 | 1.504 | 0.91 | 0.88 | 0.91 | 0.172 | 5.2 9.4 11.1 11.0 10.8 11.0 10.4 9.7 9.4 12.0 |
| ws | 51–120 | K-rice | all | 1178167 | 0.279 | 1.777 | 1.756 | 1.368 | 0.99 | 0.77 | 0.81 | 0.313 | 21.1 13.7 10.6 9.1 8.4 7.4 6.7 6.4 6.3 10.2 |
| ws | 126–240 | clima | all | 480962 | 0.207 | 1.805 | 2.194 | 1.534 | 1.22 | 0.85 | 0.97 | 0.258 | 16.4 12.6 11.6 9.8 9.4 8.5 7.9 7.5 6.8 9.4 |
| ws | 126–240 | cube | all | 480962 | -0.397 | 2.121 | 1.452 | 1.098 | 0.68 | 0.52 | 0.55 | 0.371 | 14.8 10.3 8.6 7.7 7.3 7.0 6.9 7.1 7.9 22.3 |
| ws | 126–240 | cube | band:ge800 | 112353 | -1.110 | 3.010 | 1.143 | 0.863 | 0.38 | 0.29 | 0.33 | 0.496 | 12.2 8.0 6.7 6.0 5.7 5.7 5.5 5.8 6.9 37.4 |
| ws | 126–240 | cube | band:lt800 | 368609 | -0.180 | 1.763 | 1.546 | 1.170 | 0.88 | 0.66 | 0.69 | 0.333 | 15.6 11.0 9.2 8.2 7.8 7.4 7.4 7.4 8.2 17.7 |
| ws | 126–240 | cube | country:AT | 103773 | -0.157 | 2.192 | 1.342 | 0.949 | 0.61 | 0.43 | 0.46 | 0.426 | 23.1 12.9 9.1 7.3 6.1 5.5 5.2 5.4 6.0 19.6 |
| ws | 126–240 | cube | country:CH | 128205 | -0.511 | 1.946 | 1.160 | 0.808 | 0.60 | 0.42 | 0.45 | 0.448 | 15.9 8.9 7.5 6.4 6.5 6.1 6.3 6.3 7.4 28.9 |
| ws | 126–240 | cube | country:DE | 248984 | -0.439 | 2.176 | 1.649 | 1.310 | 0.76 | 0.60 | 0.62 | 0.309 | 10.8 10.0 9.0 8.5 8.3 8.2 8.0 8.2 9.0 20.0 |
| ws | 126–240 | K | all | 480962 | -0.007 | 1.984 | 1.740 | 1.570 | 0.88 | 0.79 | 0.87 | 0.240 | 11.1 12.1 11.6 10.4 9.6 8.9 8.3 7.6 7.5 12.9 |
| ws | 126–240 | K | band:ge800 | 112353 | -0.239 | 2.649 | 1.811 | 1.628 | 0.68 | 0.61 | 0.75 | 0.327 | 12.3 10.9 9.9 9.1 8.3 7.6 7.5 6.9 7.2 20.3 |
| ws | 126–240 | K | band:lt800 | 368609 | 0.064 | 1.731 | 1.718 | 1.552 | 0.99 | 0.90 | 0.95 | 0.214 | 10.8 12.5 12.2 10.8 9.9 9.2 8.6 7.8 7.6 10.7 |
| ws | 126–240 | K | country:AT | 103773 | 0.382 | 1.875 | 1.604 | 1.430 | 0.86 | 0.76 | 0.90 | 0.290 | 17.5 16.4 12.2 9.2 7.9 7.0 6.3 6.0 6.1 11.5 |
| ws | 126–240 | K | country:CH | 128205 | 0.081 | 1.939 | 1.458 | 1.294 | 0.75 | 0.67 | 0.71 | 0.319 | 16.8 13.5 11.8 9.6 8.2 7.0 6.6 5.9 5.6 15.0 |
| ws | 126–240 | K | country:DE | 248984 | -0.214 | 2.049 | 1.941 | 1.770 | 0.95 | 0.86 | 0.92 | 0.180 | 5.5 9.6 11.3 11.3 11.0 10.6 10.0 9.1 9.1 12.4 |
| ws | 126–240 | K-rice | all | 480962 | 0.278 | 1.992 | 2.058 | 1.507 | 1.03 | 0.76 | 0.82 | 0.318 | 20.7 13.5 10.6 9.1 8.1 7.4 6.8 6.3 6.4 11.1 |
| ws | 246–336 | clima | all | 380161 | 0.206 | 1.810 | 2.197 | 1.536 | 1.21 | 0.85 | 0.96 | 0.259 | 16.4 12.6 11.6 9.8 9.4 8.5 7.9 7.5 6.8 9.4 |
| ws | 246–336 | cube | all | 380161 | -0.305 | 2.240 | 1.680 | 1.218 | 0.75 | 0.54 | 0.57 | 0.367 | 16.5 11.2 8.8 8.1 7.4 6.8 6.7 6.8 7.5 20.3 |
| ws | 246–336 | cube | band:ge800 | 88799 | -1.062 | 3.118 | 1.297 | 0.957 | 0.42 | 0.31 | 0.35 | 0.472 | 12.7 8.8 7.2 6.5 6.1 5.8 5.7 6.0 6.8 34.5 |
| ws | 246–336 | cube | band:lt800 | 291362 | -0.074 | 1.893 | 1.797 | 1.298 | 0.95 | 0.69 | 0.71 | 0.336 | 17.6 11.9 9.3 8.6 7.8 7.2 7.0 7.0 7.7 15.9 |
| ws | 246–336 | cube | country:AT | 82000 | 0.001 | 2.257 | 1.527 | 1.055 | 0.68 | 0.47 | 0.49 | 0.434 | 26.4 13.8 9.3 6.9 5.8 5.1 4.9 5.1 5.6 17.0 |
| ws | 246–336 | cube | country:CH | 101340 | -0.362 | 1.981 | 1.304 | 0.895 | 0.66 | 0.45 | 0.48 | 0.440 | 18.3 9.9 8.1 7.1 6.5 6.0 5.8 5.8 6.7 25.6 |
| ws | 246–336 | cube | country:DE | 196821 | -0.403 | 2.356 | 1.938 | 1.453 | 0.82 | 0.62 | 0.63 | 0.303 | 11.4 10.8 8.9 9.1 8.5 8.0 7.9 7.9 8.6 18.9 |
| ws | 246–336 | K | all | 380161 | -0.076 | 2.102 | 1.725 | 1.655 | 0.82 | 0.79 | 0.85 | 0.221 | 8.6 12.3 12.2 10.9 9.8 9.0 8.4 7.7 7.5 13.5 |
| ws | 246–336 | K | band:ge800 | 88799 | -0.420 | 2.793 | 1.717 | 1.648 | 0.61 | 0.59 | 0.72 | 0.311 | 9.3 9.8 9.7 9.1 8.6 8.4 8.0 7.5 7.7 21.8 |
| ws | 246–336 | K | band:lt800 | 291362 | 0.028 | 1.840 | 1.728 | 1.657 | 0.94 | 0.90 | 0.94 | 0.194 | 8.4 13.1 12.9 11.5 10.2 9.1 8.5 7.8 7.5 11.0 |
| ws | 246–336 | K | country:AT | 82000 | 0.368 | 1.922 | 1.576 | 1.514 | 0.82 | 0.79 | 0.92 | 0.253 | 13.7 17.6 13.2 9.8 8.0 7.0 6.5 6.0 6.6 11.6 |
| ws | 246–336 | K | country:CH | 101340 | 0.076 | 1.991 | 1.430 | 1.373 | 0.72 | 0.69 | 0.73 | 0.294 | 14.3 14.1 12.5 10.1 8.1 7.4 6.7 5.9 5.7 15.1 |
| ws | 246–336 | K | country:DE | 196821 | -0.340 | 2.225 | 1.940 | 1.859 | 0.87 | 0.84 | 0.88 | 0.171 | 3.6 9.2 11.6 11.8 11.4 10.5 10.1 9.4 8.9 13.5 |
| ws | 246–336 | K-rice | all | 380161 | 0.444 | 2.145 | 2.375 | 1.654 | 1.11 | 0.77 | 0.82 | 0.332 | 23.3 14.0 11.0 9.0 7.9 7.0 6.3 5.8 5.8 9.9 |
| gust | 0–6 | K | all | 277042 | 0.058 | 1.998 | 1.831 | 1.787 | 0.92 | 0.89 | 0.93 | 0.176 | 8.2 10.9 12.3 12.5 11.7 10.4 9.2 8.2 7.3 9.3 |
| gust | 7–24 | K | all | 415710 | 0.120 | 2.109 | 1.840 | 1.807 | 0.87 | 0.86 | 0.88 | 0.193 | 9.7 11.7 12.6 12.3 11.1 9.9 8.6 7.6 6.8 9.6 |
| gust | 25–48 | K | all | 549299 | 0.084 | 2.239 | 1.992 | 1.952 | 0.89 | 0.87 | 0.89 | 0.184 | 8.8 11.4 12.8 12.6 11.5 10.0 8.7 7.6 6.9 9.6 |
| gust | 51–120 | K | all | 1114404 | 0.089 | 2.532 | 2.298 | 2.225 | 0.91 | 0.88 | 0.89 | 0.188 | 8.7 11.3 13.1 12.7 11.4 9.7 8.4 7.5 7.0 10.1 |
| gust | 126–240 | K | all | 436062 | 0.032 | 3.066 | 3.024 | 2.868 | 0.99 | 0.94 | 0.95 | 0.160 | 6.0 11.7 14.6 14.1 11.8 9.7 8.2 7.1 6.7 10.1 |
| gust | 246–336 | K | all | 344765 | -0.043 | 3.285 | 3.251 | 3.064 | 0.99 | 0.93 | 0.95 | 0.151 | 4.2 12.9 15.9 13.9 11.4 9.3 7.9 6.9 6.8 10.8 |
| clct | 0–6 | cube | all | 147693 | 1.963 | 26.993 | 19.931 | 17.382 | 0.74 | 0.64 | 0.66 | 0.440 | 27.4 2.9 2.7 2.1 8.4 3.8 3.5 3.3 29.1 16.7 |
| clct | 0–6 | cube | band:ge800 | 11842 | 1.342 | 27.924 | 20.003 | 17.504 | 0.72 | 0.63 | 0.64 | 0.483 | 29.5 2.2 2.2 1.7 7.9 3.4 3.6 3.9 26.8 18.8 |
| clct | 0–6 | cube | band:lt800 | 135851 | 2.017 | 26.910 | 19.925 | 17.371 | 0.74 | 0.65 | 0.66 | 0.437 | 27.2 3.0 2.7 2.2 8.4 3.8 3.5 3.3 29.3 16.5 |
| clct | 0–6 | cube | country:DE | 147693 | 1.963 | 26.993 | 19.931 | 17.382 | 0.74 | 0.64 | 0.66 | 0.440 | 27.4 2.9 2.7 2.1 8.4 3.8 3.5 3.3 29.1 16.7 |
| clct | 0–6 | K | all | 147693 | -0.157 | 25.407 | 28.983 | 21.336 | 1.14 | 0.84 | 0.87 | 0.176 | 9.6 9.1 11.0 7.1 6.7 4.4 4.0 19.9 20.1 8.0 |
| clct | 0–6 | K | band:ge800 | 11842 | -0.492 | 26.406 | 29.957 | 21.849 | 1.13 | 0.83 | 0.85 | 0.185 | 9.4 11.5 10.6 7.1 5.4 4.3 4.1 22.3 16.1 9.1 |
| clct | 0–6 | K | band:lt800 | 135851 | -0.128 | 25.318 | 28.898 | 21.291 | 1.14 | 0.84 | 0.87 | 0.175 | 9.6 8.9 11.1 7.1 6.8 4.4 4.0 19.7 20.4 7.9 |
| clct | 0–6 | K | country:DE | 147693 | -0.157 | 25.407 | 28.983 | 21.336 | 1.14 | 0.84 | 0.87 | 0.176 | 9.6 9.1 11.0 7.1 6.7 4.4 4.0 19.9 20.1 8.0 |
| clct | 7–24 | cube | all | 220950 | 4.555 | 30.604 | 21.703 | 19.333 | 0.71 | 0.63 | 0.64 | 0.510 | 32.9 3.9 3.4 2.8 4.2 6.3 3.9 4.2 20.3 18.2 |
| clct | 7–24 | cube | band:ge800 | 18142 | 4.943 | 30.924 | 21.637 | 19.297 | 0.70 | 0.62 | 0.63 | 0.541 | 35.5 3.0 2.7 2.2 4.7 5.3 3.9 4.8 19.4 18.6 |
| clct | 7–24 | cube | band:lt800 | 202808 | 4.520 | 30.575 | 21.709 | 19.336 | 0.71 | 0.63 | 0.64 | 0.508 | 32.7 3.9 3.4 2.9 4.2 6.4 4.0 4.2 20.3 18.1 |
| clct | 7–24 | cube | country:DE | 220950 | 4.555 | 30.604 | 21.703 | 19.333 | 0.71 | 0.63 | 0.64 | 0.510 | 32.9 3.9 3.4 2.8 4.2 6.3 3.9 4.2 20.3 18.2 |
| clct | 7–24 | K | all | 220950 | -0.628 | 29.276 | 37.711 | 27.108 | 1.29 | 0.93 | 0.94 | 0.167 | 9.0 11.9 13.1 4.1 8.8 6.8 5.5 13.8 19.4 7.7 |
| clct | 7–24 | K | band:ge800 | 18142 | -0.012 | 29.243 | 37.894 | 27.201 | 1.30 | 0.93 | 0.94 | 0.164 | 9.3 13.9 13.2 3.8 7.6 6.5 5.4 14.1 19.0 7.1 |
| clct | 7–24 | K | band:lt800 | 202808 | -0.683 | 29.279 | 37.695 | 27.100 | 1.29 | 0.93 | 0.94 | 0.167 | 9.0 11.7 13.1 4.1 8.9 6.8 5.5 13.8 19.4 7.7 |
| clct | 7–24 | K | country:DE | 220950 | -0.628 | 29.276 | 37.711 | 27.108 | 1.29 | 0.93 | 0.94 | 0.167 | 9.0 11.9 13.1 4.1 8.8 6.8 5.5 13.8 19.4 7.7 |
| clct | 25–48 | cube | all | 291677 | 4.095 | 33.066 | 22.620 | 20.117 | 0.68 | 0.61 | 0.61 | 0.525 | 33.0 3.8 3.1 2.9 2.1 8.1 4.1 4.1 19.3 19.5 |
| clct | 25–48 | cube | band:ge800 | 23964 | 4.693 | 33.002 | 22.550 | 20.060 | 0.68 | 0.61 | 0.61 | 0.542 | 35.1 3.1 2.4 2.4 2.0 8.3 4.3 4.6 18.8 19.1 |
| clct | 25–48 | cube | band:lt800 | 267713 | 4.042 | 33.071 | 22.626 | 20.122 | 0.68 | 0.61 | 0.61 | 0.523 | 32.8 3.9 3.2 2.9 2.1 8.1 4.1 4.1 19.4 19.5 |
| clct | 25–48 | cube | country:DE | 291677 | 4.095 | 33.066 | 22.620 | 20.117 | 0.68 | 0.61 | 0.61 | 0.525 | 33.0 3.8 3.1 2.9 2.1 8.1 4.1 4.1 19.3 19.5 |
| clct | 25–48 | K | all | 291677 | -0.980 | 32.694 | 42.963 | 30.527 | 1.31 | 0.93 | 0.94 | 0.178 | 9.6 17.0 6.9 4.2 6.6 9.3 6.1 7.5 24.7 8.2 |
| clct | 25–48 | K | band:ge800 | 23964 | -0.424 | 32.321 | 42.560 | 30.361 | 1.32 | 0.94 | 0.94 | 0.180 | 10.1 19.2 6.4 3.4 5.9 8.9 6.3 8.7 23.2 7.9 |
| clct | 25–48 | K | band:lt800 | 267713 | -1.030 | 32.727 | 42.999 | 30.542 | 1.31 | 0.93 | 0.94 | 0.178 | 9.6 16.8 6.9 4.2 6.7 9.3 6.0 7.4 24.8 8.2 |
| clct | 25–48 | K | country:DE | 291677 | -0.980 | 32.694 | 42.963 | 30.527 | 1.31 | 0.93 | 0.94 | 0.178 | 9.6 17.0 6.9 4.2 6.6 9.3 6.1 7.5 24.7 8.2 |
| clct | 51–120 | cube | all | 510258 | -2.781 | 33.812 | 24.427 | 21.574 | 0.72 | 0.64 | 0.64 | 0.529 | 24.4 2.7 2.1 1.9 1.7 6.2 5.4 4.5 22.7 28.5 |
| clct | 51–120 | cube | band:ge800 | 41004 | -1.782 | 33.310 | 24.332 | 21.376 | 0.73 | 0.64 | 0.65 | 0.515 | 24.8 2.4 1.7 1.8 1.7 5.9 5.2 4.3 25.5 26.7 |
| clct | 51–120 | cube | band:lt800 | 469254 | -2.868 | 33.856 | 24.435 | 21.591 | 0.72 | 0.64 | 0.64 | 0.530 | 24.4 2.7 2.1 1.9 1.7 6.2 5.4 4.5 22.5 28.6 |
| clct | 51–120 | cube | country:DE | 510258 | -2.781 | 33.812 | 24.427 | 21.574 | 0.72 | 0.64 | 0.64 | 0.529 | 24.4 2.7 2.1 1.9 1.7 6.2 5.4 4.5 22.7 28.5 |
| clct | 51–120 | K | all | 510258 | -0.149 | 33.706 | 47.673 | 31.592 | 1.41 | 0.94 | 0.95 | 0.170 | 10.2 12.1 3.5 4.3 7.9 6.9 4.8 20.0 23.4 6.8 |
| clct | 51–120 | K | band:ge800 | 41004 | 0.772 | 32.825 | 46.721 | 30.999 | 1.42 | 0.94 | 0.95 | 0.161 | 10.6 12.4 3.2 3.7 7.0 6.4 5.0 22.9 23.2 5.4 |
| clct | 51–120 | K | band:lt800 | 469254 | -0.230 | 33.782 | 47.756 | 31.644 | 1.41 | 0.94 | 0.94 | 0.171 | 10.2 12.1 3.6 4.3 8.0 6.9 4.8 19.8 23.5 6.9 |
| clct | 51–120 | K | country:DE | 510258 | -0.149 | 33.706 | 47.673 | 31.592 | 1.41 | 0.94 | 0.95 | 0.170 | 10.2 12.1 3.5 4.3 7.9 6.9 4.8 20.0 23.4 6.8 |
| clct | 126–240 | cube | all | 231704 | -4.814 | 37.241 | 25.507 | 22.847 | 0.68 | 0.61 | 0.62 | 0.626 | 23.1 2.8 2.1 1.7 1.7 3.0 6.4 5.8 13.8 39.5 |
| clct | 126–240 | cube | band:ge800 | 22095 | -7.428 | 35.959 | 25.392 | 22.511 | 0.71 | 0.63 | 0.63 | 0.601 | 19.5 2.0 1.6 1.5 1.5 3.6 5.7 5.5 18.4 40.6 |
| clct | 126–240 | cube | band:lt800 | 209609 | -4.538 | 37.374 | 25.519 | 22.882 | 0.68 | 0.61 | 0.62 | 0.629 | 23.5 2.9 2.1 1.7 1.7 3.0 6.5 5.8 13.3 39.3 |
| clct | 126–240 | cube | country:DE | 231704 | -4.814 | 37.241 | 25.507 | 22.847 | 0.68 | 0.61 | 0.62 | 0.626 | 23.1 2.8 2.1 1.7 1.7 3.0 6.4 5.8 13.8 39.5 |
| clct | 126–240 | K | all | 231704 | -0.035 | 37.365 | 58.132 | 35.498 | 1.56 | 0.95 | 0.95 | 0.160 | 11.5 9.2 3.7 4.1 7.2 8.9 6.4 16.0 28.3 4.5 |
| clct | 126–240 | K | band:ge800 | 22095 | -1.417 | 35.982 | 55.566 | 34.258 | 1.54 | 0.95 | 0.96 | 0.160 | 11.6 6.2 2.9 3.2 7.0 7.5 6.0 21.7 29.4 4.4 |
| clct | 126–240 | K | band:lt800 | 209609 | 0.110 | 37.508 | 58.403 | 35.628 | 1.56 | 0.95 | 0.95 | 0.160 | 11.5 9.6 3.8 4.2 7.2 9.1 6.4 15.4 28.2 4.5 |
| clct | 126–240 | K | country:DE | 231704 | -0.035 | 37.365 | 58.132 | 35.498 | 1.56 | 0.95 | 0.95 | 0.160 | 11.5 9.2 3.7 4.1 7.2 8.9 6.4 16.0 28.3 4.5 |
| clct | 246–336 | cube | all | 183101 | -5.130 | 39.549 | 25.874 | 23.216 | 0.65 | 0.59 | 0.59 | 0.653 | 23.5 2.6 2.0 1.6 1.7 2.4 5.8 5.6 12.8 41.8 |
| clct | 246–336 | cube | band:ge800 | 17463 | -7.880 | 38.369 | 25.758 | 22.881 | 0.67 | 0.60 | 0.60 | 0.630 | 19.7 2.0 1.8 1.3 1.6 2.9 5.1 5.6 16.6 43.3 |
| clct | 246–336 | cube | band:lt800 | 165638 | -4.840 | 39.671 | 25.886 | 23.252 | 0.65 | 0.59 | 0.59 | 0.656 | 23.9 2.7 2.1 1.7 1.7 2.4 5.9 5.6 12.4 41.7 |
| clct | 246–336 | cube | country:DE | 183101 | -5.130 | 39.549 | 25.874 | 23.216 | 0.65 | 0.59 | 0.59 | 0.653 | 23.5 2.6 2.0 1.6 1.7 2.4 5.8 5.6 12.8 41.8 |
| clct | 246–336 | K | all | 183101 | 0.668 | 39.719 | 67.767 | 37.929 | 1.71 | 0.95 | 0.96 | 0.136 | 12.3 7.9 4.2 4.2 5.4 12.1 7.0 9.2 36.4 1.3 |
| clct | 246–336 | K | band:ge800 | 17463 | -1.119 | 38.226 | 65.695 | 37.042 | 1.72 | 0.97 | 0.97 | 0.132 | 11.8 5.5 3.3 3.5 5.7 10.7 5.9 13.7 38.5 1.4 |
| clct | 246–336 | K | band:lt800 | 165638 | 0.857 | 39.873 | 67.985 | 38.022 | 1.71 | 0.95 | 0.96 | 0.137 | 12.3 8.1 4.3 4.3 5.3 12.3 7.1 8.8 36.2 1.3 |
| clct | 246–336 | K | country:DE | 183101 | 0.668 | 39.719 | 67.767 | 37.929 | 1.71 | 0.95 | 0.96 | 0.136 | 12.3 7.9 4.2 4.2 5.4 12.1 7.0 9.2 36.4 1.3 |

## D2 Langer Vorlauf — je Vorlaufstunde (Schicht all, alle Routen)

CRPS/MAE von fl-K, Cube, Klima (Station, Scorer-Definition), Klima (gepoolt Band|Land). ρ = corr(μ_K − μ_c, y − μ_c), b = Steigung von (y − μ_c) auf (μ_K − μ_c) (b < 1 ⇒ Anomalie überkonfident), σ_b = Residuen-sd der Mischung μ_c + b(μ_K − μ_c) — b, σ_b in-sample je Vorlaufstunde (1 Parameter). CRPS Misch. = CRPS der Mischung (T/Td Normal, ws/Böe TN bei 0 auf den Erwartungswerten, Bewölkung zensiert [0,100] auf der latenten μ) auf einer Reservoir-Stichprobe je (Größe, Stunde) (n_S ≤ 4 000, deterministisch), Stat = Stations-μ_c, Pool = gepooltes μ_c. μ_K/μ_c: T/Td Mittel, ws/Böe Erwartungswert (K: Speed-Verteilung, Klima: Rice bzw. Tobit), Bewölkung latente μ.

### t

| Vorlauf h | n | CRPS K | Cube | Klima | Pool | MAE K | Cube | Klima | Pool | ρ | b | σ_b | RMSE K | RMSE Klima | RMSE Misch. | ρ Pool | b Pool | n_S | CRPS Misch. Stat | Pool |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 4000 | 0.710 | 0.870 | 2.198 | 2.421 | 0.977 | 1.183 | 3.120 | 3.412 | 0.93 | 0.98 | 1.40 | 1.402 | 3.944 | 1.400 | 0.95 | 1.00 | 4000 | 0.712 | 0.712 |
| 2 | 4000 | 0.696 | 0.903 | 2.177 | 2.436 | 0.962 | 1.231 | 3.086 | 3.418 | 0.94 | 0.98 | 1.36 | 1.359 | 3.914 | 1.356 | 0.95 | 0.99 | 4000 | 0.721 | 0.722 |
| 3 | 4000 | 0.750 | 1.083 | 2.228 | 2.603 | 1.044 | 1.512 | 3.155 | 3.639 | 0.93 | 1.00 | 1.40 | 1.400 | 4.025 | 1.400 | 0.95 | 1.01 | 4000 | 0.759 | 0.758 |
| 4 | 4000 | 0.767 | 0.981 | 2.262 | 2.591 | 1.068 | 1.374 | 3.199 | 3.629 | 0.93 | 0.99 | 1.42 | 1.423 | 4.078 | 1.423 | 0.94 | 1.01 | 4000 | 0.777 | 0.776 |
| 5 | 4000 | 0.751 | 0.990 | 2.226 | 2.522 | 1.046 | 1.382 | 3.154 | 3.530 | 0.93 | 0.97 | 1.39 | 1.391 | 4.012 | 1.388 | 0.95 | 1.00 | 4000 | 0.766 | 0.767 |
| 6 | 4000 | 0.777 | 1.101 | 2.229 | 2.604 | 1.079 | 1.537 | 3.156 | 3.639 | 0.93 | 0.99 | 1.45 | 1.446 | 4.026 | 1.446 | 0.95 | 1.00 | 4000 | 0.790 | 0.790 |
| 7 | 4000 | 0.801 | 1.009 | 2.263 | 2.591 | 1.109 | 1.414 | 3.200 | 3.629 | 0.92 | 0.98 | 1.48 | 1.485 | 4.079 | 1.483 | 0.94 | 1.01 | 4000 | 0.801 | 0.802 |
| 8 | 4000 | 0.779 | 1.013 | 2.227 | 2.522 | 1.081 | 1.415 | 3.155 | 3.530 | 0.93 | 0.97 | 1.44 | 1.440 | 4.013 | 1.435 | 0.95 | 1.00 | 4000 | 0.787 | 0.789 |
| 9 | 4000 | 0.803 | 1.109 | 2.229 | 2.604 | 1.109 | 1.549 | 3.157 | 3.640 | 0.92 | 0.99 | 1.49 | 1.487 | 4.027 | 1.486 | 0.94 | 1.00 | 4000 | 0.812 | 0.811 |
| 10 | 4000 | 0.818 | 1.028 | 2.263 | 2.592 | 1.135 | 1.441 | 3.202 | 3.630 | 0.92 | 0.98 | 1.51 | 1.514 | 4.081 | 1.512 | 0.94 | 1.00 | 4000 | 0.833 | 0.832 |
| 11 | 4000 | 0.792 | 1.027 | 2.227 | 2.522 | 1.100 | 1.435 | 3.156 | 3.530 | 0.92 | 0.97 | 1.46 | 1.462 | 4.015 | 1.458 | 0.94 | 1.00 | 4000 | 0.790 | 0.791 |
| 12 | 4000 | 0.811 | 1.117 | 2.230 | 2.605 | 1.121 | 1.559 | 3.159 | 3.640 | 0.92 | 0.98 | 1.50 | 1.501 | 4.029 | 1.500 | 0.94 | 1.00 | 4000 | 0.815 | 0.816 |
| 13 | 4000 | 0.830 | 1.041 | 2.264 | 2.591 | 1.152 | 1.458 | 3.202 | 3.629 | 0.92 | 0.98 | 1.53 | 1.536 | 4.081 | 1.534 | 0.94 | 1.00 | 4000 | 0.829 | 0.827 |
| 14 | 4000 | 0.805 | 1.038 | 2.227 | 2.522 | 1.119 | 1.447 | 3.156 | 3.529 | 0.92 | 0.97 | 1.48 | 1.486 | 4.015 | 1.480 | 0.94 | 1.00 | 4000 | 0.812 | 0.814 |
| 15 | 4000 | 0.818 | 1.121 | 2.230 | 2.604 | 1.131 | 1.565 | 3.158 | 3.639 | 0.92 | 0.98 | 1.51 | 1.513 | 4.029 | 1.511 | 0.94 | 1.00 | 4000 | 0.829 | 0.830 |
| 16 | 4000 | 0.841 | 1.048 | 2.263 | 2.591 | 1.167 | 1.467 | 3.201 | 3.628 | 0.92 | 0.98 | 1.55 | 1.554 | 4.081 | 1.552 | 0.93 | 1.00 | 4000 | 0.863 | 0.863 |
| 17 | 4000 | 0.818 | 1.050 | 2.228 | 2.522 | 1.138 | 1.464 | 3.156 | 3.530 | 0.92 | 0.96 | 1.50 | 1.510 | 4.015 | 1.504 | 0.94 | 1.00 | 4000 | 0.822 | 0.825 |
| 18 | 4000 | 0.827 | 1.132 | 2.230 | 2.604 | 1.144 | 1.580 | 3.158 | 3.639 | 0.92 | 0.98 | 1.53 | 1.529 | 4.029 | 1.527 | 0.94 | 1.00 | 4000 | 0.829 | 0.829 |
| 19 | 4000 | 0.854 | 1.059 | 2.263 | 2.591 | 1.186 | 1.480 | 3.200 | 3.627 | 0.91 | 0.97 | 1.57 | 1.577 | 4.081 | 1.573 | 0.93 | 1.00 | 4000 | 0.872 | 0.873 |
| 20 | 4000 | 0.830 | 1.058 | 2.228 | 2.523 | 1.152 | 1.474 | 3.156 | 3.530 | 0.92 | 0.96 | 1.52 | 1.532 | 4.016 | 1.524 | 0.94 | 0.99 | 4000 | 0.828 | 0.832 |
| 21 | 4000 | 0.836 | 1.144 | 2.231 | 2.604 | 1.157 | 1.597 | 3.158 | 3.639 | 0.92 | 0.98 | 1.54 | 1.544 | 4.030 | 1.543 | 0.94 | 1.00 | 4000 | 0.860 | 0.860 |
| 22 | 4000 | 0.867 | 1.066 | 2.263 | 2.591 | 1.202 | 1.490 | 3.200 | 3.627 | 0.91 | 0.97 | 1.60 | 1.603 | 4.082 | 1.598 | 0.93 | 0.99 | 4000 | 0.886 | 0.887 |
| 23 | 4000 | 0.847 | 1.071 | 2.228 | 2.523 | 1.175 | 1.492 | 3.156 | 3.531 | 0.91 | 0.96 | 1.55 | 1.564 | 4.017 | 1.555 | 0.93 | 0.99 | 4000 | 0.848 | 0.850 |
| 24 | 4000 | 0.847 | 1.154 | 2.231 | 2.605 | 1.175 | 1.613 | 3.158 | 3.640 | 0.91 | 0.98 | 1.56 | 1.563 | 4.031 | 1.561 | 0.94 | 1.00 | 4000 | 0.870 | 0.869 |
| 25 | 4000 | 0.891 | 1.085 | 2.264 | 2.591 | 1.233 | 1.515 | 3.200 | 3.628 | 0.91 | 0.97 | 1.63 | 1.638 | 4.083 | 1.633 | 0.93 | 1.00 | 4000 | 0.906 | 0.909 |
| 26 | 4000 | 0.878 | 1.089 | 2.228 | 2.523 | 1.218 | 1.517 | 3.155 | 3.529 | 0.91 | 0.96 | 1.60 | 1.613 | 4.017 | 1.604 | 0.93 | 0.99 | 4000 | 0.883 | 0.887 |
| 27 | 4000 | 0.868 | 1.168 | 2.230 | 2.604 | 1.199 | 1.632 | 3.157 | 3.639 | 0.91 | 0.98 | 1.59 | 1.596 | 4.030 | 1.595 | 0.94 | 1.00 | 4000 | 0.878 | 0.879 |
| 28 | 4000 | 0.910 | 1.055 | 2.262 | 2.589 | 1.255 | 1.466 | 3.197 | 3.625 | 0.90 | 0.96 | 1.67 | 1.678 | 4.080 | 1.670 | 0.92 | 0.98 | 4000 | 0.934 | 0.937 |
| 29 | 4000 | 0.899 | 1.070 | 2.226 | 2.521 | 1.245 | 1.480 | 3.152 | 3.527 | 0.90 | 0.95 | 1.64 | 1.653 | 4.014 | 1.642 | 0.93 | 0.98 | 4000 | 0.907 | 0.908 |
| 30 | 4000 | 0.880 | 1.187 | 2.228 | 2.602 | 1.217 | 1.657 | 3.154 | 3.636 | 0.91 | 0.98 | 1.62 | 1.619 | 4.027 | 1.617 | 0.93 | 1.00 | 4000 | 0.892 | 0.893 |
| 31 | 4000 | 0.925 | 1.089 | 2.260 | 2.587 | 1.275 | 1.510 | 3.194 | 3.622 | 0.90 | 0.96 | 1.70 | 1.704 | 4.078 | 1.698 | 0.92 | 0.99 | 4000 | 0.936 | 0.937 |
| 32 | 4000 | 0.913 | 1.089 | 2.224 | 2.520 | 1.262 | 1.507 | 3.149 | 3.525 | 0.90 | 0.95 | 1.67 | 1.681 | 4.012 | 1.669 | 0.93 | 0.98 | 4000 | 0.901 | 0.906 |
| 33 | 4000 | 0.919 | 1.216 | 2.227 | 2.601 | 1.275 | 1.693 | 3.151 | 3.633 | 0.90 | 0.97 | 1.69 | 1.698 | 4.025 | 1.695 | 0.93 | 1.00 | 4000 | 0.925 | 0.926 |
| 34 | 4000 | 0.937 | 1.090 | 2.259 | 2.586 | 1.293 | 1.511 | 3.192 | 3.620 | 0.90 | 0.96 | 1.72 | 1.723 | 4.076 | 1.715 | 0.92 | 0.98 | 4000 | 0.929 | 0.930 |
| 35 | 4000 | 0.915 | 1.091 | 2.223 | 2.518 | 1.265 | 1.510 | 3.147 | 3.523 | 0.90 | 0.95 | 1.67 | 1.679 | 4.009 | 1.670 | 0.93 | 0.98 | 4000 | 0.926 | 0.929 |
| 36 | 4000 | 0.919 | 1.206 | 2.225 | 2.599 | 1.275 | 1.682 | 3.148 | 3.630 | 0.90 | 0.98 | 1.69 | 1.696 | 4.022 | 1.694 | 0.93 | 1.00 | 4000 | 0.933 | 0.932 |
| 37 | 4000 | 0.944 | 1.114 | 2.256 | 2.583 | 1.302 | 1.542 | 3.187 | 3.615 | 0.89 | 0.96 | 1.73 | 1.739 | 4.071 | 1.734 | 0.92 | 0.99 | 4000 | 0.953 | 0.954 |
| 38 | 4000 | 0.927 | 1.108 | 2.220 | 2.515 | 1.282 | 1.531 | 3.142 | 3.517 | 0.90 | 0.95 | 1.70 | 1.709 | 4.004 | 1.697 | 0.92 | 0.98 | 4000 | 0.953 | 0.957 |
| 39 | 4000 | 0.930 | 1.226 | 2.222 | 2.595 | 1.287 | 1.707 | 3.143 | 3.625 | 0.89 | 0.97 | 1.71 | 1.717 | 4.016 | 1.714 | 0.92 | 0.99 | 4000 | 0.953 | 0.953 |
| 40 | 4000 | 0.955 | 1.111 | 2.253 | 2.580 | 1.314 | 1.536 | 3.183 | 3.611 | 0.89 | 0.96 | 1.75 | 1.759 | 4.066 | 1.750 | 0.91 | 0.98 | 4000 | 0.978 | 0.979 |
| 41 | 4000 | 0.933 | 1.112 | 2.218 | 2.514 | 1.289 | 1.535 | 3.139 | 3.516 | 0.90 | 0.95 | 1.70 | 1.716 | 4.002 | 1.705 | 0.92 | 0.98 | 4000 | 0.937 | 0.940 |
| 42 | 4000 | 0.930 | 1.224 | 2.221 | 2.594 | 1.289 | 1.707 | 3.142 | 3.624 | 0.89 | 0.98 | 1.71 | 1.717 | 4.015 | 1.715 | 0.92 | 1.00 | 4000 | 0.933 | 0.933 |
| 43 | 4000 | 0.963 | 1.134 | 2.251 | 2.578 | 1.327 | 1.568 | 3.180 | 3.608 | 0.89 | 0.96 | 1.76 | 1.768 | 4.064 | 1.760 | 0.91 | 0.98 | 4000 | 0.975 | 0.978 |
| 44 | 4000 | 0.942 | 1.124 | 2.217 | 2.513 | 1.302 | 1.554 | 3.138 | 3.515 | 0.89 | 0.94 | 1.72 | 1.731 | 4.001 | 1.717 | 0.92 | 0.98 | 4000 | 0.977 | 0.981 |
| 45 | 4000 | 0.944 | 1.250 | 2.219 | 2.593 | 1.309 | 1.740 | 3.139 | 3.622 | 0.89 | 0.97 | 1.74 | 1.742 | 4.013 | 1.739 | 0.92 | 0.99 | 4000 | 0.945 | 0.946 |
| 46 | 4000 | 0.971 | 1.126 | 2.250 | 2.576 | 1.335 | 1.558 | 3.178 | 3.607 | 0.89 | 0.95 | 1.77 | 1.781 | 4.062 | 1.770 | 0.91 | 0.98 | 4000 | 0.984 | 0.987 |
| 47 | 4000 | 0.953 | 1.132 | 2.216 | 2.513 | 1.317 | 1.563 | 3.136 | 3.514 | 0.89 | 0.94 | 1.73 | 1.747 | 4.000 | 1.733 | 0.92 | 0.97 | 4000 | 0.945 | 0.949 |
| 48 | 4000 | 0.951 | 1.250 | 2.219 | 2.593 | 1.319 | 1.743 | 3.138 | 3.622 | 0.89 | 0.97 | 1.75 | 1.751 | 4.013 | 1.748 | 0.92 | 1.00 | 4000 | 0.970 | 0.971 |
| 51 | 4000 | 1.097 | 1.271 | 2.162 | 2.513 | 1.514 | 1.761 | 3.065 | 3.517 | 0.86 | 0.95 | 2.01 | 2.015 | 3.883 | 2.007 | 0.90 | 0.99 | 4000 | 1.109 | 1.109 |
| 54 | 4000 | 0.984 | 1.192 | 2.179 | 2.398 | 1.350 | 1.657 | 3.093 | 3.378 | 0.89 | 0.99 | 1.79 | 1.793 | 3.911 | 1.793 | 0.91 | 1.01 | 4000 | 0.993 | 0.992 |
| 57 | 4000 | 1.109 | 1.292 | 2.160 | 2.511 | 1.533 | 1.794 | 3.063 | 3.514 | 0.85 | 0.95 | 2.03 | 2.035 | 3.880 | 2.026 | 0.89 | 0.98 | 4000 | 1.094 | 1.096 |
| 60 | 4000 | 0.998 | 1.218 | 2.179 | 2.398 | 1.371 | 1.692 | 3.093 | 3.378 | 0.89 | 0.99 | 1.82 | 1.819 | 3.910 | 1.819 | 0.91 | 1.01 | 4000 | 1.022 | 1.020 |
| 63 | 4000 | 1.127 | 1.317 | 2.161 | 2.512 | 1.558 | 1.829 | 3.064 | 3.516 | 0.85 | 0.94 | 2.06 | 2.065 | 3.881 | 2.055 | 0.89 | 0.98 | 4000 | 1.129 | 1.130 |
| 66 | 4000 | 1.014 | 1.247 | 2.179 | 2.399 | 1.395 | 1.734 | 3.095 | 3.379 | 0.88 | 0.99 | 1.85 | 1.850 | 3.912 | 1.849 | 0.90 | 1.01 | 4000 | 1.029 | 1.028 |
| 69 | 4000 | 1.154 | 1.350 | 2.162 | 2.513 | 1.596 | 1.875 | 3.067 | 3.518 | 0.84 | 0.94 | 2.10 | 2.113 | 3.884 | 2.101 | 0.88 | 0.98 | 4000 | 1.144 | 1.150 |
| 72 | 4000 | 1.033 | 1.276 | 2.180 | 2.400 | 1.425 | 1.776 | 3.096 | 3.381 | 0.88 | 0.98 | 1.88 | 1.886 | 3.914 | 1.885 | 0.90 | 1.01 | 4000 | 1.047 | 1.046 |
| 75 | 4000 | 1.180 | 1.380 | 2.163 | 2.515 | 1.634 | 1.917 | 3.068 | 3.519 | 0.83 | 0.93 | 2.15 | 2.163 | 3.886 | 2.147 | 0.88 | 0.97 | 4000 | 1.176 | 1.179 |
| 78 | 4000 | 1.056 | 1.307 | 2.181 | 2.400 | 1.462 | 1.823 | 3.096 | 3.381 | 0.87 | 0.98 | 1.93 | 1.927 | 3.915 | 1.925 | 0.89 | 1.00 | 4000 | 1.075 | 1.075 |
| 81 | 4000 | 1.212 | 1.415 | 2.163 | 2.514 | 1.680 | 1.967 | 3.067 | 3.518 | 0.83 | 0.91 | 2.19 | 2.215 | 3.885 | 2.194 | 0.87 | 0.96 | 4000 | 1.212 | 1.218 |
| 84 | 4000 | 1.080 | 1.339 | 2.181 | 2.401 | 1.496 | 1.869 | 3.097 | 3.382 | 0.86 | 0.97 | 1.97 | 1.971 | 3.915 | 1.968 | 0.89 | 1.00 | 4000 | 1.087 | 1.088 |
| 87 | 4000 | 1.240 | 1.444 | 2.163 | 2.515 | 1.721 | 2.008 | 3.068 | 3.519 | 0.82 | 0.91 | 2.24 | 2.264 | 3.886 | 2.240 | 0.87 | 0.95 | 4000 | 1.262 | 1.269 |
| 90 | 4000 | 1.102 | 1.367 | 2.181 | 2.400 | 1.530 | 1.908 | 3.097 | 3.381 | 0.86 | 0.96 | 2.01 | 2.010 | 3.914 | 2.005 | 0.88 | 0.99 | 4000 | 1.121 | 1.121 |
| 93 | 4000 | 1.271 | 1.475 | 2.164 | 2.515 | 1.764 | 2.050 | 3.069 | 3.519 | 0.81 | 0.90 | 2.29 | 2.315 | 3.887 | 2.287 | 0.86 | 0.95 | 4000 | 1.264 | 1.275 |
| 96 | 4000 | 1.129 | 1.400 | 2.182 | 2.402 | 1.570 | 1.955 | 3.098 | 3.384 | 0.85 | 0.96 | 2.05 | 2.060 | 3.917 | 2.054 | 0.88 | 0.98 | 4000 | 1.132 | 1.135 |
| 99 | 4000 | 1.312 | 1.511 | 2.165 | 2.516 | 1.819 | 2.102 | 3.070 | 3.522 | 0.80 | 0.88 | 2.35 | 2.385 | 3.889 | 2.350 | 0.85 | 0.94 | 4000 | 1.300 | 1.308 |
| 102 | 4000 | 1.160 | 1.435 | 2.183 | 2.403 | 1.615 | 2.006 | 3.099 | 3.384 | 0.84 | 0.95 | 2.11 | 2.115 | 3.918 | 2.107 | 0.87 | 0.98 | 4000 | 1.156 | 1.159 |
| 105 | 4000 | 1.350 | 1.545 | 2.164 | 2.515 | 1.870 | 2.149 | 3.069 | 3.520 | 0.78 | 0.87 | 2.41 | 2.450 | 3.887 | 2.408 | 0.84 | 0.93 | 4000 | 1.348 | 1.361 |
| 108 | 4000 | 1.191 | 1.468 | 2.184 | 2.403 | 1.659 | 2.052 | 3.100 | 3.385 | 0.83 | 0.94 | 2.16 | 2.173 | 3.919 | 2.162 | 0.86 | 0.97 | 4000 | 1.181 | 1.184 |
| 111 | 4000 | 1.394 | 1.581 | 2.166 | 2.516 | 1.929 | 2.197 | 3.071 | 3.522 | 0.77 | 0.85 | 2.47 | 2.528 | 3.889 | 2.475 | 0.83 | 0.92 | 4000 | 1.385 | 1.399 |
| 114 | 4000 | 1.229 | 1.503 | 2.183 | 2.402 | 1.711 | 2.100 | 3.099 | 3.384 | 0.82 | 0.92 | 2.23 | 2.241 | 3.917 | 2.226 | 0.85 | 0.96 | 4000 | 1.216 | 1.220 |
| 117 | 4000 | 1.437 | 1.615 | 2.165 | 2.516 | 1.985 | 2.242 | 3.070 | 3.521 | 0.76 | 0.84 | 2.54 | 2.597 | 3.889 | 2.536 | 0.82 | 0.91 | 4000 | 1.394 | 1.411 |
| 120 | 4000 | 1.264 | 1.537 | 2.183 | 2.404 | 1.758 | 2.148 | 3.100 | 3.386 | 0.81 | 0.92 | 2.28 | 2.302 | 3.918 | 2.283 | 0.85 | 0.95 | 4000 | 1.249 | 1.254 |
| 126 | 4000 | 1.237 | 1.303 | 2.116 | 2.312 | 1.728 | 1.794 | 2.997 | 3.246 | 0.81 | 0.98 | 2.24 | 2.238 | 3.810 | 2.237 | 0.84 | 1.01 | 4000 | 1.249 | 1.248 |
| 132 | 4000 | 1.386 | 1.507 | 2.246 | 2.490 | 1.939 | 2.075 | 3.197 | 3.517 | 0.78 | 0.93 | 2.51 | 2.518 | 4.018 | 2.507 | 0.82 | 1.00 | 4000 | 1.391 | 1.395 |
| 138 | 4000 | 1.304 | 1.370 | 2.114 | 2.310 | 1.827 | 1.888 | 2.994 | 3.244 | 0.79 | 0.95 | 2.36 | 2.361 | 3.806 | 2.357 | 0.82 | 0.99 | 4000 | 1.327 | 1.330 |
| 144 | 4000 | 1.455 | 1.604 | 2.248 | 2.492 | 2.041 | 2.210 | 3.201 | 3.520 | 0.76 | 0.92 | 2.62 | 2.637 | 4.022 | 2.622 | 0.80 | 0.99 | 4000 | 1.452 | 1.458 |
| 150 | 4000 | 1.372 | 1.461 | 2.115 | 2.311 | 1.929 | 2.013 | 2.995 | 3.245 | 0.76 | 0.94 | 2.48 | 2.486 | 3.809 | 2.478 | 0.80 | 0.97 | 4000 | 1.365 | 1.369 |
| 156 | 4000 | 1.547 | 1.689 | 2.249 | 2.492 | 2.179 | 2.325 | 3.200 | 3.521 | 0.72 | 0.88 | 2.78 | 2.814 | 4.022 | 2.783 | 0.77 | 0.96 | 4000 | 1.572 | 1.584 |
| 162 | 4000 | 1.466 | 1.551 | 2.115 | 2.312 | 2.065 | 2.135 | 2.995 | 3.246 | 0.72 | 0.89 | 2.65 | 2.675 | 3.808 | 2.655 | 0.77 | 0.94 | 4000 | 1.453 | 1.458 |
| 168 | 4000 | 1.647 | 1.811 | 2.250 | 2.493 | 2.318 | 2.488 | 3.202 | 3.522 | 0.68 | 0.84 | 2.96 | 3.005 | 4.025 | 2.960 | 0.74 | 0.93 | 4000 | 1.619 | 1.636 |
| 174 | 4000 | 1.554 | 1.649 | 2.116 | 2.313 | 2.188 | 2.265 | 2.996 | 3.247 | 0.68 | 0.87 | 2.80 | 2.831 | 3.811 | 2.803 | 0.73 | 0.92 | 4000 | 1.531 | 1.541 |
| 180 | 4000 | 1.728 | 1.892 | 2.249 | 2.493 | 2.435 | 2.595 | 3.202 | 3.522 | 0.64 | 0.81 | 3.09 | 3.149 | 4.023 | 3.091 | 0.71 | 0.91 | 4000 | 1.718 | 1.740 |
| 186 | 4000 | 1.634 | 1.729 | 2.114 | 2.311 | 2.301 | 2.374 | 2.994 | 3.246 | 0.64 | 0.82 | 2.92 | 2.964 | 3.805 | 2.916 | 0.70 | 0.88 | 4000 | 1.609 | 1.619 |
| 192 | 4000 | 1.807 | 1.989 | 2.250 | 2.494 | 2.543 | 2.726 | 3.203 | 3.523 | 0.60 | 0.77 | 3.21 | 3.286 | 4.025 | 3.208 | 0.68 | 0.88 | 4000 | 1.782 | 1.807 |
| 198 | 4000 | 1.714 | 1.814 | 2.116 | 2.313 | 2.415 | 2.485 | 2.997 | 3.249 | 0.60 | 0.79 | 3.04 | 3.105 | 3.810 | 3.042 | 0.67 | 0.85 | 4000 | 1.688 | 1.700 |
| 204 | 4000 | 1.900 | 2.069 | 2.251 | 2.495 | 2.675 | 2.825 | 3.204 | 3.525 | 0.56 | 0.72 | 3.33 | 3.443 | 4.024 | 3.335 | 0.64 | 0.84 | 4000 | 1.880 | 1.920 |
| 210 | 4000 | 1.795 | 1.887 | 2.117 | 2.314 | 2.529 | 2.579 | 2.998 | 3.250 | 0.56 | 0.74 | 3.15 | 3.240 | 3.809 | 3.151 | 0.64 | 0.82 | 4000 | 1.769 | 1.790 |
| 216 | 4000 | 1.981 | 2.153 | 2.251 | 2.495 | 2.790 | 2.937 | 3.205 | 3.526 | 0.52 | 0.68 | 3.45 | 3.586 | 4.026 | 3.448 | 0.61 | 0.81 | 4000 | 1.927 | 1.966 |
| 222 | 4000 | 1.858 | 1.944 | 2.117 | 2.314 | 2.626 | 2.656 | 2.998 | 3.250 | 0.53 | 0.70 | 3.23 | 3.344 | 3.812 | 3.233 | 0.61 | 0.79 | 4000 | 1.824 | 1.844 |
| 228 | 4000 | 2.064 | 2.222 | 2.249 | 2.494 | 2.906 | 3.024 | 3.203 | 3.524 | 0.47 | 0.62 | 3.54 | 3.722 | 4.021 | 3.538 | 0.58 | 0.76 | 4000 | 1.993 | 2.045 |
| 234 | 4000 | 1.957 | 2.018 | 2.116 | 2.314 | 2.761 | 2.753 | 2.999 | 3.251 | 0.48 | 0.62 | 3.34 | 3.518 | 3.807 | 3.341 | 0.57 | 0.73 | 4000 | 1.883 | 1.917 |
| 240 | 4000 | 2.147 | 2.289 | 2.250 | 2.494 | 3.020 | 3.112 | 3.204 | 3.525 | 0.43 | 0.56 | 3.63 | 3.873 | 4.024 | 3.631 | 0.54 | 0.71 | 4000 | 2.034 | 2.092 |
| 246 | 4000 | 2.018 | 2.070 | 2.118 | 2.317 | 2.835 | 2.819 | 3.002 | 3.255 | 0.43 | 0.59 | 3.44 | 3.628 | 3.814 | 3.443 | 0.53 | 0.71 | 4000 | 1.902 | 1.934 |
| 252 | 4000 | 2.234 | 2.341 | 2.250 | 2.494 | 3.148 | 3.177 | 3.205 | 3.525 | 0.37 | 0.50 | 3.73 | 4.018 | 4.019 | 3.728 | 0.49 | 0.67 | 4000 | 2.077 | 2.160 |
| 258 | 4000 | 2.090 | 2.115 | 2.117 | 2.316 | 2.940 | 2.877 | 3.001 | 3.255 | 0.38 | 0.52 | 3.51 | 3.760 | 3.806 | 3.514 | 0.49 | 0.66 | 4000 | 1.955 | 2.007 |
| 264 | 4000 | 2.299 | 2.407 | 2.252 | 2.497 | 3.244 | 3.264 | 3.208 | 3.529 | 0.33 | 0.45 | 3.80 | 4.129 | 4.027 | 3.797 | 0.46 | 0.64 | 4000 | 2.118 | 2.202 |
| 270 | 4000 | 2.135 | 2.150 | 2.121 | 2.319 | 3.008 | 2.924 | 3.004 | 3.258 | 0.35 | 0.49 | 3.57 | 3.837 | 3.817 | 3.569 | 0.47 | 0.64 | 4000 | 1.998 | 2.053 |
| 276 | 4000 | 2.357 | 2.430 | 2.255 | 2.499 | 3.332 | 3.293 | 3.211 | 3.531 | 0.30 | 0.40 | 3.85 | 4.234 | 4.030 | 3.845 | 0.43 | 0.59 | 4000 | 2.161 | 2.248 |
| 282 | 4000 | 2.202 | 2.193 | 2.123 | 2.322 | 3.110 | 2.982 | 3.007 | 3.262 | 0.31 | 0.43 | 3.63 | 3.951 | 3.819 | 3.625 | 0.43 | 0.59 | 4000 | 2.065 | 2.127 |
| 288 | 4000 | 2.417 | 2.492 | 2.257 | 2.501 | 3.426 | 3.374 | 3.213 | 3.534 | 0.26 | 0.36 | 3.90 | 4.328 | 4.035 | 3.900 | 0.39 | 0.56 | 4000 | 2.198 | 2.316 |
| 294 | 4000 | 2.266 | 2.249 | 2.124 | 2.323 | 3.210 | 3.063 | 3.007 | 3.262 | 0.26 | 0.37 | 3.68 | 4.063 | 3.823 | 3.684 | 0.40 | 0.55 | 4000 | 2.075 | 2.165 |
| 300 | 4000 | 2.516 | 2.556 | 2.260 | 2.505 | 3.579 | 3.458 | 3.218 | 3.539 | 0.19 | 0.27 | 3.96 | 4.516 | 4.041 | 3.963 | 0.34 | 0.48 | 4000 | 2.259 | 2.388 |
| 306 | 4000 | 2.336 | 2.298 | 2.128 | 2.328 | 3.321 | 3.123 | 3.012 | 3.268 | 0.21 | 0.30 | 3.74 | 4.198 | 3.830 | 3.737 | 0.35 | 0.49 | 4000 | 2.131 | 2.225 |
| 312 | 4000 | 2.550 | 2.596 | 2.261 | 2.505 | 3.622 | 3.504 | 3.218 | 3.539 | 0.17 | 0.24 | 3.98 | 4.558 | 4.043 | 3.982 | 0.32 | 0.46 | 4000 | 2.262 | 2.407 |
| 318 | 4000 | 2.370 | 2.331 | 2.127 | 2.327 | 3.361 | 3.166 | 3.011 | 3.267 | 0.19 | 0.27 | 3.76 | 4.256 | 3.829 | 3.756 | 0.33 | 0.46 | 4000 | 2.162 | 2.269 |
| 324 | 4000 | 2.574 | 2.604 | 2.263 | 2.508 | 3.647 | 3.514 | 3.222 | 3.543 | 0.16 | 0.22 | 3.99 | 4.613 | 4.046 | 3.994 | 0.31 | 0.44 | 4000 | 2.272 | 2.400 |
| 330 | 4000 | 2.388 | 2.333 | 2.130 | 2.330 | 3.385 | 3.168 | 3.015 | 3.272 | 0.18 | 0.26 | 3.77 | 4.295 | 3.833 | 3.765 | 0.33 | 0.45 | 4000 | 2.081 | 2.184 |
| 336 | 4000 | 2.618 | 2.633 | 2.263 | 2.507 | 3.716 | 3.555 | 3.222 | 3.542 | 0.13 | 0.18 | 4.01 | 4.685 | 4.046 | 4.009 | 0.29 | 0.40 | 4000 | 2.240 | 2.393 |

Erste Vorlaufstunde mit CRPS fl-K > Klima (Station): **264**; letzte Stunde mit fl-K < Klima: 258.

Je Bin (t) — Summen der Stunden, b/σ_b je Bin in-sample; CRPS Misch. auf den vereinigten Stichproben der Stunden:

| Bin | n | CRPS K | Cube | Klima | Pool | MAE K | Klima | ρ | b | σ_b | RMSE K | Klima | Misch. | n_S | CRPS Misch. Stat | Pool |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0–6 | 24000 | 0.723 | 0.938 | 2.204 | 2.479 | 0.999 | 3.124 | 0.94 | 0.98 | 1.39 | 1.392 | 3.965 | 1.390 | 24000 | 0.754 | 0.754 |
| 7–24 | 72000 | 0.823 | 1.071 | 2.240 | 2.573 | 1.142 | 3.171 | 0.92 | 0.97 | 1.52 | 1.523 | 4.042 | 1.519 | 72000 | 0.833 | 0.834 |
| 25–48 | 96000 | 0.925 | 1.140 | 2.234 | 2.566 | 1.278 | 3.160 | 0.90 | 0.96 | 1.70 | 1.703 | 4.033 | 1.696 | 96000 | 0.936 | 0.938 |
| 51–120 | 96000 | 1.172 | 1.395 | 2.172 | 2.458 | 1.623 | 3.082 | 0.84 | 0.93 | 2.14 | 2.148 | 3.900 | 2.135 | 96000 | 1.177 | 1.181 |
| 126–240 | 80000 | 1.678 | 1.798 | 2.183 | 2.404 | 2.361 | 3.101 | 0.64 | 0.81 | 3.02 | 3.074 | 3.919 | 3.015 | 80000 | 1.673 | 1.690 |
| 246–336 | 64000 | 2.337 | 2.364 | 2.191 | 2.413 | 3.307 | 3.112 | 0.26 | 0.36 | 3.79 | 4.204 | 3.931 | 3.790 | 64000 | 2.133 | 2.226 |

### td

| Vorlauf h | n | CRPS K | Cube | Klima | Pool | MAE K | Cube | Klima | Pool | ρ | b | σ_b | RMSE K | RMSE Klima | RMSE Misch. | ρ Pool | b Pool | n_S | CRPS Misch. Stat | Pool |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 4000 | 0.671 | 0.781 | 2.082 | 2.235 | 0.913 | 1.052 | 2.925 | 3.139 | 0.93 | 0.99 | 1.34 | 1.342 | 3.773 | 1.341 | 0.94 | 1.00 | 4000 | 0.705 | 0.705 |
| 2 | 4000 | 0.699 | 0.809 | 2.108 | 2.312 | 0.954 | 1.087 | 2.960 | 3.222 | 0.92 | 0.99 | 1.46 | 1.465 | 3.851 | 1.464 | 0.94 | 1.00 | 4000 | 0.754 | 0.754 |
| 3 | 4000 | 0.706 | 0.840 | 1.965 | 2.173 | 0.976 | 1.153 | 2.779 | 3.040 | 0.92 | 1.02 | 1.34 | 1.343 | 3.525 | 1.341 | 0.94 | 1.03 | 4000 | 0.710 | 0.708 |
| 4 | 4000 | 0.749 | 0.856 | 1.956 | 2.100 | 1.037 | 1.183 | 2.764 | 2.959 | 0.91 | 0.98 | 1.41 | 1.411 | 3.500 | 1.410 | 0.93 | 1.00 | 4000 | 0.759 | 0.759 |
| 5 | 4000 | 0.769 | 0.863 | 1.954 | 2.148 | 1.061 | 1.189 | 2.765 | 3.015 | 0.91 | 0.97 | 1.47 | 1.477 | 3.499 | 1.474 | 0.92 | 1.00 | 4000 | 0.778 | 0.778 |
| 6 | 4000 | 0.728 | 0.866 | 1.966 | 2.174 | 1.009 | 1.190 | 2.780 | 3.041 | 0.92 | 1.02 | 1.38 | 1.382 | 3.526 | 1.381 | 0.94 | 1.03 | 4000 | 0.734 | 0.733 |
| 7 | 4000 | 0.770 | 0.889 | 1.957 | 2.101 | 1.063 | 1.230 | 2.765 | 2.960 | 0.91 | 0.98 | 1.45 | 1.447 | 3.501 | 1.446 | 0.92 | 1.00 | 4000 | 0.771 | 0.771 |
| 8 | 4000 | 0.787 | 0.890 | 1.955 | 2.149 | 1.083 | 1.227 | 2.766 | 3.016 | 0.90 | 0.98 | 1.50 | 1.502 | 3.500 | 1.501 | 0.92 | 1.00 | 4000 | 0.779 | 0.779 |
| 9 | 4000 | 0.749 | 0.887 | 1.967 | 2.175 | 1.035 | 1.220 | 2.781 | 3.042 | 0.92 | 1.01 | 1.41 | 1.412 | 3.528 | 1.412 | 0.93 | 1.03 | 4000 | 0.753 | 0.751 |
| 10 | 4000 | 0.788 | 0.918 | 1.958 | 2.102 | 1.087 | 1.269 | 2.766 | 2.961 | 0.91 | 0.98 | 1.47 | 1.476 | 3.502 | 1.474 | 0.92 | 1.00 | 4000 | 0.792 | 0.792 |
| 11 | 4000 | 0.800 | 0.913 | 1.956 | 2.150 | 1.103 | 1.261 | 2.767 | 3.017 | 0.90 | 0.98 | 1.52 | 1.519 | 3.501 | 1.517 | 0.92 | 1.00 | 4000 | 0.827 | 0.827 |
| 12 | 4000 | 0.759 | 0.903 | 1.967 | 2.175 | 1.050 | 1.242 | 2.782 | 3.042 | 0.91 | 1.01 | 1.43 | 1.432 | 3.528 | 1.431 | 0.93 | 1.03 | 4000 | 0.766 | 0.763 |
| 13 | 4000 | 0.802 | 0.934 | 1.958 | 2.102 | 1.107 | 1.292 | 2.767 | 2.961 | 0.90 | 0.98 | 1.50 | 1.497 | 3.503 | 1.496 | 0.92 | 1.00 | 4000 | 0.835 | 0.835 |
| 14 | 4000 | 0.811 | 0.924 | 1.956 | 2.150 | 1.118 | 1.274 | 2.767 | 3.017 | 0.90 | 0.97 | 1.54 | 1.539 | 3.502 | 1.537 | 0.91 | 1.00 | 4000 | 0.830 | 0.830 |
| 15 | 4000 | 0.767 | 0.917 | 1.967 | 2.175 | 1.063 | 1.259 | 2.781 | 3.042 | 0.91 | 1.01 | 1.45 | 1.446 | 3.528 | 1.446 | 0.93 | 1.02 | 4000 | 0.792 | 0.791 |
| 16 | 4000 | 0.818 | 0.949 | 1.959 | 2.103 | 1.128 | 1.313 | 2.767 | 2.962 | 0.90 | 0.98 | 1.52 | 1.523 | 3.504 | 1.521 | 0.91 | 0.99 | 4000 | 0.843 | 0.844 |
| 17 | 4000 | 0.823 | 0.934 | 1.956 | 2.150 | 1.133 | 1.287 | 2.766 | 3.016 | 0.90 | 0.97 | 1.55 | 1.557 | 3.502 | 1.554 | 0.91 | 1.00 | 4000 | 0.820 | 0.822 |
| 18 | 4000 | 0.777 | 0.933 | 1.967 | 2.175 | 1.079 | 1.282 | 2.781 | 3.042 | 0.91 | 1.00 | 1.46 | 1.463 | 3.529 | 1.463 | 0.93 | 1.02 | 4000 | 0.789 | 0.787 |
| 19 | 4000 | 0.831 | 0.960 | 1.958 | 2.103 | 1.147 | 1.327 | 2.766 | 2.961 | 0.90 | 0.97 | 1.54 | 1.547 | 3.504 | 1.544 | 0.91 | 0.99 | 4000 | 0.850 | 0.851 |
| 20 | 4000 | 0.836 | 0.947 | 1.955 | 2.149 | 1.152 | 1.304 | 2.766 | 3.016 | 0.89 | 0.97 | 1.57 | 1.577 | 3.501 | 1.573 | 0.91 | 1.00 | 4000 | 0.840 | 0.841 |
| 21 | 4000 | 0.790 | 0.956 | 1.967 | 2.175 | 1.096 | 1.313 | 2.781 | 3.041 | 0.91 | 1.00 | 1.49 | 1.486 | 3.529 | 1.486 | 0.92 | 1.02 | 4000 | 0.815 | 0.813 |
| 22 | 4000 | 0.844 | 0.979 | 1.958 | 2.102 | 1.163 | 1.350 | 2.766 | 2.961 | 0.89 | 0.97 | 1.56 | 1.567 | 3.503 | 1.564 | 0.91 | 0.99 | 4000 | 0.875 | 0.876 |
| 23 | 4000 | 0.847 | 0.963 | 1.955 | 2.150 | 1.168 | 1.325 | 2.765 | 3.016 | 0.89 | 0.96 | 1.59 | 1.596 | 3.502 | 1.592 | 0.91 | 0.99 | 4000 | 0.860 | 0.862 |
| 24 | 4000 | 0.801 | 0.978 | 1.967 | 2.174 | 1.112 | 1.343 | 2.781 | 3.041 | 0.90 | 1.00 | 1.50 | 1.504 | 3.529 | 1.504 | 0.92 | 1.02 | 4000 | 0.796 | 0.796 |
| 25 | 4000 | 0.871 | 1.001 | 1.958 | 2.102 | 1.200 | 1.382 | 2.765 | 2.960 | 0.89 | 1.01 | 1.60 | 1.600 | 3.504 | 1.600 | 0.90 | 1.03 | 4000 | 0.869 | 0.869 |
| 26 | 4000 | 0.885 | 0.995 | 1.955 | 2.149 | 1.219 | 1.370 | 2.764 | 3.014 | 0.88 | 1.00 | 1.65 | 1.653 | 3.501 | 1.653 | 0.90 | 1.02 | 4000 | 0.885 | 0.883 |
| 27 | 4000 | 0.841 | 1.003 | 1.966 | 2.174 | 1.160 | 1.378 | 2.780 | 3.040 | 0.90 | 1.04 | 1.55 | 1.554 | 3.528 | 1.551 | 0.92 | 1.05 | 4000 | 0.843 | 0.840 |
| 28 | 4000 | 0.900 | 1.024 | 1.957 | 2.101 | 1.240 | 1.411 | 2.764 | 2.959 | 0.88 | 1.00 | 1.66 | 1.657 | 3.502 | 1.657 | 0.89 | 1.02 | 4000 | 0.892 | 0.891 |
| 29 | 4000 | 0.924 | 1.028 | 1.954 | 2.148 | 1.274 | 1.411 | 2.763 | 3.013 | 0.87 | 0.98 | 1.73 | 1.727 | 3.500 | 1.726 | 0.89 | 1.01 | 4000 | 0.920 | 0.920 |
| 30 | 4000 | 0.851 | 1.023 | 1.965 | 2.173 | 1.174 | 1.406 | 2.778 | 3.038 | 0.89 | 1.04 | 1.57 | 1.574 | 3.528 | 1.570 | 0.92 | 1.05 | 4000 | 0.848 | 0.845 |
| 31 | 4000 | 0.917 | 1.054 | 1.956 | 2.101 | 1.266 | 1.455 | 2.762 | 2.958 | 0.87 | 0.99 | 1.69 | 1.692 | 3.502 | 1.692 | 0.89 | 1.01 | 4000 | 0.923 | 0.923 |
| 32 | 4000 | 0.932 | 1.044 | 1.953 | 2.147 | 1.289 | 1.440 | 2.761 | 3.012 | 0.87 | 0.98 | 1.74 | 1.739 | 3.499 | 1.738 | 0.89 | 1.01 | 4000 | 0.933 | 0.931 |
| 33 | 4000 | 0.884 | 1.069 | 1.965 | 2.172 | 1.220 | 1.468 | 2.777 | 3.037 | 0.88 | 1.03 | 1.64 | 1.644 | 3.527 | 1.642 | 0.91 | 1.04 | 4000 | 0.892 | 0.890 |
| 34 | 4000 | 0.926 | 1.071 | 1.956 | 2.100 | 1.281 | 1.480 | 2.761 | 2.956 | 0.87 | 0.99 | 1.70 | 1.701 | 3.501 | 1.701 | 0.89 | 1.01 | 4000 | 0.938 | 0.938 |
| 35 | 4000 | 0.944 | 1.069 | 1.952 | 2.147 | 1.304 | 1.471 | 2.759 | 3.010 | 0.86 | 0.98 | 1.76 | 1.759 | 3.498 | 1.757 | 0.89 | 1.00 | 4000 | 0.950 | 0.951 |
| 36 | 4000 | 0.884 | 1.079 | 1.964 | 2.171 | 1.222 | 1.482 | 2.776 | 3.035 | 0.88 | 1.02 | 1.65 | 1.648 | 3.526 | 1.647 | 0.91 | 1.04 | 4000 | 0.897 | 0.895 |
| 37 | 4000 | 0.936 | 1.086 | 1.955 | 2.099 | 1.292 | 1.503 | 2.760 | 2.955 | 0.87 | 0.99 | 1.72 | 1.723 | 3.500 | 1.723 | 0.89 | 1.00 | 4000 | 0.945 | 0.946 |
| 38 | 4000 | 0.951 | 1.076 | 1.951 | 2.145 | 1.316 | 1.481 | 2.758 | 3.008 | 0.86 | 0.97 | 1.77 | 1.771 | 3.496 | 1.769 | 0.88 | 1.00 | 4000 | 0.970 | 0.970 |
| 39 | 4000 | 0.899 | 1.103 | 1.963 | 2.170 | 1.241 | 1.515 | 2.774 | 3.034 | 0.88 | 1.02 | 1.67 | 1.672 | 3.525 | 1.671 | 0.90 | 1.03 | 4000 | 0.917 | 0.915 |
| 40 | 4000 | 0.950 | 1.101 | 1.954 | 2.098 | 1.316 | 1.519 | 2.758 | 2.954 | 0.86 | 0.98 | 1.74 | 1.742 | 3.499 | 1.741 | 0.88 | 1.00 | 4000 | 0.933 | 0.932 |
| 41 | 4000 | 0.960 | 1.090 | 1.949 | 2.144 | 1.327 | 1.499 | 2.755 | 3.006 | 0.86 | 0.97 | 1.78 | 1.784 | 3.494 | 1.781 | 0.88 | 0.99 | 4000 | 0.967 | 0.968 |
| 42 | 4000 | 0.899 | 1.111 | 1.962 | 2.169 | 1.245 | 1.528 | 2.773 | 3.032 | 0.88 | 1.02 | 1.67 | 1.675 | 3.524 | 1.674 | 0.90 | 1.04 | 4000 | 0.899 | 0.898 |
| 43 | 4000 | 0.960 | 1.114 | 1.953 | 2.097 | 1.326 | 1.540 | 2.757 | 2.952 | 0.86 | 0.98 | 1.77 | 1.767 | 3.497 | 1.765 | 0.88 | 0.99 | 4000 | 0.979 | 0.979 |
| 44 | 4000 | 0.975 | 1.102 | 1.949 | 2.143 | 1.348 | 1.517 | 2.754 | 3.005 | 0.85 | 0.96 | 1.81 | 1.813 | 3.493 | 1.809 | 0.88 | 0.99 | 4000 | 0.968 | 0.970 |
| 45 | 4000 | 0.918 | 1.140 | 1.962 | 2.169 | 1.269 | 1.567 | 2.771 | 3.031 | 0.87 | 1.01 | 1.71 | 1.705 | 3.523 | 1.705 | 0.90 | 1.03 | 4000 | 0.927 | 0.925 |
| 46 | 4000 | 0.969 | 1.131 | 1.953 | 2.097 | 1.340 | 1.560 | 2.755 | 2.951 | 0.86 | 0.97 | 1.77 | 1.777 | 3.497 | 1.775 | 0.88 | 0.99 | 4000 | 0.962 | 0.963 |
| 47 | 4000 | 0.993 | 1.127 | 1.948 | 2.143 | 1.374 | 1.548 | 2.752 | 3.004 | 0.85 | 0.95 | 1.84 | 1.843 | 3.492 | 1.838 | 0.87 | 0.98 | 4000 | 0.982 | 0.983 |
| 48 | 4000 | 0.921 | 1.158 | 1.961 | 2.168 | 1.277 | 1.591 | 2.770 | 3.030 | 0.87 | 1.01 | 1.72 | 1.716 | 3.522 | 1.716 | 0.90 | 1.03 | 4000 | 0.918 | 0.917 |
| 51 | 4000 | 1.026 | 1.263 | 2.096 | 2.350 | 1.409 | 1.733 | 2.944 | 3.259 | 0.86 | 0.95 | 1.93 | 1.944 | 3.824 | 1.934 | 0.89 | 0.97 | 4000 | 1.028 | 1.028 |
| 54 | 4000 | 0.941 | 1.211 | 2.093 | 2.258 | 1.292 | 1.665 | 2.942 | 3.173 | 0.89 | 1.03 | 1.74 | 1.738 | 3.789 | 1.736 | 0.90 | 1.04 | 4000 | 0.944 | 0.943 |
| 57 | 4000 | 1.044 | 1.294 | 2.096 | 2.349 | 1.436 | 1.779 | 2.943 | 3.258 | 0.85 | 0.94 | 1.96 | 1.976 | 3.824 | 1.964 | 0.89 | 0.96 | 4000 | 1.047 | 1.047 |
| 60 | 4000 | 0.957 | 1.246 | 2.094 | 2.259 | 1.316 | 1.716 | 2.943 | 3.175 | 0.88 | 1.03 | 1.76 | 1.765 | 3.790 | 1.763 | 0.90 | 1.04 | 4000 | 0.960 | 0.959 |
| 63 | 4000 | 1.067 | 1.329 | 2.097 | 2.350 | 1.469 | 1.829 | 2.945 | 3.260 | 0.85 | 0.93 | 2.00 | 2.018 | 3.825 | 2.005 | 0.88 | 0.96 | 4000 | 1.067 | 1.066 |
| 66 | 4000 | 0.977 | 1.283 | 2.094 | 2.259 | 1.347 | 1.769 | 2.943 | 3.175 | 0.88 | 1.02 | 1.80 | 1.803 | 3.789 | 1.802 | 0.90 | 1.03 | 4000 | 0.985 | 0.983 |
| 69 | 4000 | 1.099 | 1.370 | 2.097 | 2.350 | 1.514 | 1.890 | 2.946 | 3.261 | 0.84 | 0.92 | 2.06 | 2.078 | 3.826 | 2.060 | 0.88 | 0.95 | 4000 | 1.109 | 1.111 |
| 72 | 4000 | 1.001 | 1.327 | 2.095 | 2.260 | 1.384 | 1.834 | 2.944 | 3.176 | 0.87 | 1.02 | 1.85 | 1.850 | 3.791 | 1.849 | 0.89 | 1.03 | 4000 | 1.003 | 1.002 |
| 75 | 4000 | 1.137 | 1.416 | 2.099 | 2.352 | 1.564 | 1.953 | 2.948 | 3.263 | 0.83 | 0.91 | 2.13 | 2.151 | 3.828 | 2.128 | 0.87 | 0.94 | 4000 | 1.157 | 1.159 |
| 78 | 4000 | 1.034 | 1.370 | 2.096 | 2.260 | 1.431 | 1.898 | 2.945 | 3.177 | 0.86 | 1.01 | 1.91 | 1.910 | 3.792 | 1.910 | 0.88 | 1.02 | 4000 | 1.030 | 1.030 |
| 81 | 4000 | 1.175 | 1.457 | 2.099 | 2.352 | 1.619 | 2.016 | 2.948 | 3.263 | 0.82 | 0.89 | 2.19 | 2.219 | 3.828 | 2.188 | 0.86 | 0.93 | 4000 | 1.151 | 1.155 |
| 84 | 4000 | 1.066 | 1.412 | 2.096 | 2.261 | 1.476 | 1.960 | 2.947 | 3.178 | 0.85 | 1.00 | 1.97 | 1.972 | 3.793 | 1.972 | 0.87 | 1.02 | 4000 | 1.058 | 1.057 |
| 87 | 4000 | 1.219 | 1.501 | 2.100 | 2.353 | 1.678 | 2.078 | 2.950 | 3.264 | 0.80 | 0.88 | 2.26 | 2.300 | 3.830 | 2.261 | 0.85 | 0.92 | 4000 | 1.190 | 1.194 |
| 90 | 4000 | 1.101 | 1.452 | 2.097 | 2.261 | 1.527 | 2.019 | 2.947 | 3.178 | 0.84 | 0.99 | 2.04 | 2.037 | 3.794 | 2.036 | 0.86 | 1.01 | 4000 | 1.091 | 1.091 |
| 93 | 4000 | 1.265 | 1.541 | 2.100 | 2.354 | 1.739 | 2.138 | 2.950 | 3.265 | 0.79 | 0.86 | 2.33 | 2.382 | 3.830 | 2.333 | 0.84 | 0.91 | 4000 | 1.251 | 1.259 |
| 96 | 4000 | 1.140 | 1.493 | 2.098 | 2.262 | 1.579 | 2.078 | 2.948 | 3.180 | 0.83 | 0.98 | 2.11 | 2.112 | 3.795 | 2.111 | 0.85 | 1.00 | 4000 | 1.176 | 1.176 |
| 99 | 4000 | 1.316 | 1.579 | 2.101 | 2.354 | 1.807 | 2.193 | 2.952 | 3.266 | 0.77 | 0.85 | 2.41 | 2.470 | 3.832 | 2.411 | 0.83 | 0.89 | 4000 | 1.299 | 1.307 |
| 102 | 4000 | 1.181 | 1.533 | 2.098 | 2.263 | 1.637 | 2.137 | 2.949 | 3.180 | 0.81 | 0.97 | 2.19 | 2.188 | 3.796 | 2.186 | 0.84 | 0.99 | 4000 | 1.178 | 1.178 |
| 105 | 4000 | 1.369 | 1.622 | 2.102 | 2.355 | 1.874 | 2.254 | 2.952 | 3.267 | 0.75 | 0.83 | 2.49 | 2.564 | 3.833 | 2.492 | 0.81 | 0.88 | 4000 | 1.308 | 1.309 |
| 108 | 4000 | 1.229 | 1.576 | 2.099 | 2.264 | 1.702 | 2.200 | 2.951 | 3.181 | 0.80 | 0.95 | 2.27 | 2.277 | 3.797 | 2.272 | 0.83 | 0.97 | 4000 | 1.245 | 1.245 |
| 111 | 4000 | 1.426 | 1.667 | 2.102 | 2.356 | 1.945 | 2.320 | 2.953 | 3.268 | 0.73 | 0.81 | 2.58 | 2.667 | 3.833 | 2.580 | 0.80 | 0.87 | 4000 | 1.395 | 1.402 |
| 114 | 4000 | 1.274 | 1.618 | 2.100 | 2.264 | 1.763 | 2.261 | 2.951 | 3.182 | 0.78 | 0.94 | 2.35 | 2.360 | 3.798 | 2.353 | 0.81 | 0.96 | 4000 | 1.310 | 1.311 |
| 117 | 4000 | 1.481 | 1.707 | 2.103 | 2.356 | 2.015 | 2.378 | 2.954 | 3.268 | 0.71 | 0.79 | 2.66 | 2.755 | 3.834 | 2.658 | 0.78 | 0.85 | 4000 | 1.415 | 1.421 |
| 120 | 4000 | 1.320 | 1.659 | 2.100 | 2.265 | 1.825 | 2.320 | 2.952 | 3.183 | 0.76 | 0.93 | 2.43 | 2.445 | 3.799 | 2.435 | 0.80 | 0.96 | 4000 | 1.332 | 1.334 |
| 126 | 4000 | 1.329 | 1.590 | 2.064 | 2.244 | 1.832 | 2.205 | 2.902 | 3.158 | 0.76 | 0.91 | 2.41 | 2.429 | 3.733 | 2.411 | 0.80 | 0.94 | 4000 | 1.341 | 1.344 |
| 132 | 4000 | 1.433 | 1.774 | 2.133 | 2.283 | 1.980 | 2.497 | 2.997 | 3.204 | 0.73 | 0.89 | 2.62 | 2.639 | 3.859 | 2.618 | 0.76 | 0.94 | 4000 | 1.430 | 1.436 |
| 138 | 4000 | 1.419 | 1.668 | 2.065 | 2.246 | 1.966 | 2.322 | 2.903 | 3.161 | 0.72 | 0.88 | 2.57 | 2.601 | 3.735 | 2.572 | 0.77 | 0.91 | 4000 | 1.418 | 1.421 |
| 144 | 4000 | 1.518 | 1.854 | 2.132 | 2.281 | 2.105 | 2.613 | 2.995 | 3.203 | 0.69 | 0.86 | 2.77 | 2.799 | 3.856 | 2.766 | 0.73 | 0.92 | 4000 | 1.481 | 1.489 |
| 150 | 4000 | 1.505 | 1.739 | 2.064 | 2.244 | 2.087 | 2.426 | 2.903 | 3.159 | 0.68 | 0.83 | 2.72 | 2.766 | 3.733 | 2.719 | 0.73 | 0.88 | 4000 | 1.527 | 1.539 |
| 156 | 4000 | 1.613 | 1.927 | 2.134 | 2.283 | 2.246 | 2.718 | 2.997 | 3.205 | 0.65 | 0.81 | 2.92 | 2.978 | 3.860 | 2.919 | 0.69 | 0.87 | 4000 | 1.588 | 1.605 |
| 162 | 4000 | 1.604 | 1.812 | 2.065 | 2.246 | 2.230 | 2.534 | 2.904 | 3.162 | 0.63 | 0.78 | 2.88 | 2.956 | 3.736 | 2.881 | 0.69 | 0.84 | 4000 | 1.602 | 1.613 |
| 168 | 4000 | 1.712 | 2.003 | 2.135 | 2.284 | 2.386 | 2.820 | 3.000 | 3.208 | 0.59 | 0.76 | 3.08 | 3.167 | 3.862 | 3.082 | 0.64 | 0.83 | 4000 | 1.668 | 1.689 |
| 174 | 4000 | 1.697 | 1.877 | 2.067 | 2.248 | 2.365 | 2.625 | 2.908 | 3.165 | 0.58 | 0.74 | 3.02 | 3.111 | 3.739 | 3.016 | 0.66 | 0.81 | 4000 | 1.651 | 1.664 |
| 180 | 4000 | 1.787 | 2.072 | 2.137 | 2.286 | 2.487 | 2.918 | 3.003 | 3.210 | 0.55 | 0.73 | 3.19 | 3.288 | 3.864 | 3.191 | 0.61 | 0.81 | 4000 | 1.749 | 1.774 |
| 186 | 4000 | 1.775 | 1.929 | 2.069 | 2.249 | 2.469 | 2.704 | 2.909 | 3.166 | 0.54 | 0.71 | 3.12 | 3.234 | 3.741 | 3.118 | 0.63 | 0.78 | 4000 | 1.713 | 1.730 |
| 192 | 4000 | 1.860 | 2.123 | 2.137 | 2.286 | 2.592 | 2.989 | 3.001 | 3.209 | 0.52 | 0.69 | 3.28 | 3.403 | 3.864 | 3.282 | 0.58 | 0.78 | 4000 | 1.801 | 1.825 |
| 198 | 4000 | 1.859 | 1.983 | 2.068 | 2.248 | 2.581 | 2.776 | 2.908 | 3.165 | 0.49 | 0.66 | 3.23 | 3.375 | 3.740 | 3.227 | 0.59 | 0.74 | 4000 | 1.788 | 1.806 |
| 204 | 4000 | 1.938 | 2.173 | 2.139 | 2.288 | 2.689 | 3.052 | 3.005 | 3.212 | 0.47 | 0.65 | 3.38 | 3.531 | 3.867 | 3.382 | 0.54 | 0.74 | 4000 | 1.836 | 1.869 |
| 210 | 4000 | 1.932 | 2.028 | 2.071 | 2.251 | 2.680 | 2.839 | 2.912 | 3.168 | 0.45 | 0.61 | 3.31 | 3.491 | 3.744 | 3.315 | 0.56 | 0.71 | 4000 | 1.821 | 1.846 |
| 216 | 4000 | 2.013 | 2.225 | 2.138 | 2.287 | 2.793 | 3.126 | 3.003 | 3.211 | 0.43 | 0.60 | 3.46 | 3.648 | 3.866 | 3.462 | 0.50 | 0.70 | 4000 | 1.899 | 1.943 |
| 222 | 4000 | 1.994 | 2.067 | 2.069 | 2.249 | 2.768 | 2.898 | 2.909 | 3.165 | 0.42 | 0.57 | 3.37 | 3.579 | 3.741 | 3.368 | 0.53 | 0.68 | 4000 | 1.892 | 1.931 |
| 228 | 4000 | 2.090 | 2.271 | 2.141 | 2.289 | 2.903 | 3.192 | 3.007 | 3.214 | 0.39 | 0.55 | 3.53 | 3.766 | 3.870 | 3.534 | 0.47 | 0.65 | 4000 | 1.987 | 2.037 |
| 234 | 4000 | 2.083 | 2.117 | 2.073 | 2.253 | 2.892 | 2.972 | 2.915 | 3.171 | 0.37 | 0.51 | 3.46 | 3.735 | 3.747 | 3.455 | 0.49 | 0.62 | 4000 | 1.949 | 1.998 |
| 240 | 4000 | 2.183 | 2.326 | 2.143 | 2.291 | 3.021 | 3.271 | 3.010 | 3.218 | 0.34 | 0.47 | 3.62 | 3.935 | 3.872 | 3.622 | 0.42 | 0.58 | 4000 | 2.015 | 2.064 |
| 246 | 4000 | 2.188 | 2.166 | 2.073 | 2.253 | 3.058 | 3.040 | 2.916 | 3.171 | 0.25 | 0.39 | 3.61 | 3.932 | 3.748 | 3.614 | 0.40 | 0.56 | 4000 | 2.040 | 2.105 |
| 252 | 4000 | 2.282 | 2.365 | 2.145 | 2.294 | 3.194 | 3.323 | 3.013 | 3.221 | 0.23 | 0.35 | 3.76 | 4.124 | 3.875 | 3.762 | 0.33 | 0.50 | 4000 | 2.089 | 2.148 |
| 258 | 4000 | 2.254 | 2.205 | 2.075 | 2.255 | 3.166 | 3.097 | 2.920 | 3.174 | 0.20 | 0.32 | 3.66 | 4.053 | 3.751 | 3.662 | 0.36 | 0.50 | 4000 | 2.061 | 2.132 |
| 264 | 4000 | 2.334 | 2.418 | 2.145 | 2.294 | 3.279 | 3.400 | 3.014 | 3.221 | 0.19 | 0.30 | 3.80 | 4.216 | 3.876 | 3.797 | 0.29 | 0.45 | 4000 | 2.130 | 2.210 |
| 270 | 4000 | 2.288 | 2.232 | 2.074 | 2.254 | 3.215 | 3.134 | 2.918 | 3.174 | 0.17 | 0.28 | 3.68 | 4.116 | 3.750 | 3.685 | 0.34 | 0.47 | 4000 | 2.070 | 2.141 |
| 276 | 4000 | 2.370 | 2.428 | 2.147 | 2.296 | 3.325 | 3.407 | 3.016 | 3.224 | 0.16 | 0.26 | 3.82 | 4.277 | 3.879 | 3.821 | 0.27 | 0.42 | 4000 | 2.122 | 2.210 |
| 282 | 4000 | 2.326 | 2.254 | 2.078 | 2.258 | 3.276 | 3.162 | 2.923 | 3.178 | 0.14 | 0.24 | 3.71 | 4.174 | 3.755 | 3.708 | 0.31 | 0.44 | 4000 | 2.026 | 2.121 |
| 288 | 4000 | 2.407 | 2.455 | 2.147 | 2.295 | 3.381 | 3.448 | 3.016 | 3.223 | 0.13 | 0.22 | 3.84 | 4.336 | 3.879 | 3.838 | 0.24 | 0.39 | 4000 | 2.146 | 2.232 |
| 294 | 4000 | 2.375 | 2.282 | 2.077 | 2.257 | 3.342 | 3.203 | 2.922 | 3.176 | 0.10 | 0.18 | 3.73 | 4.264 | 3.755 | 3.727 | 0.28 | 0.40 | 4000 | 2.101 | 2.200 |
| 300 | 4000 | 2.465 | 2.509 | 2.148 | 2.297 | 3.469 | 3.519 | 3.017 | 3.225 | 0.09 | 0.16 | 3.86 | 4.432 | 3.881 | 3.858 | 0.21 | 0.33 | 4000 | 2.199 | 2.297 |
| 306 | 4000 | 2.424 | 2.323 | 2.079 | 2.260 | 3.418 | 3.254 | 2.924 | 3.180 | 0.06 | 0.13 | 3.74 | 4.345 | 3.758 | 3.743 | 0.25 | 0.36 | 4000 | 2.089 | 2.200 |
| 312 | 4000 | 2.512 | 2.543 | 2.150 | 2.298 | 3.526 | 3.566 | 3.020 | 3.227 | 0.05 | 0.10 | 3.88 | 4.523 | 3.883 | 3.875 | 0.17 | 0.28 | 4000 | 2.146 | 2.250 |
| 318 | 4000 | 2.450 | 2.346 | 2.081 | 2.260 | 3.448 | 3.289 | 2.926 | 3.181 | 0.03 | 0.09 | 3.75 | 4.400 | 3.760 | 3.753 | 0.23 | 0.33 | 4000 | 2.115 | 2.218 |
| 324 | 4000 | 2.519 | 2.554 | 2.151 | 2.300 | 3.541 | 3.576 | 3.021 | 3.229 | 0.04 | 0.09 | 3.88 | 4.533 | 3.886 | 3.879 | 0.16 | 0.27 | 4000 | 2.146 | 2.246 |
| 330 | 4000 | 2.459 | 2.355 | 2.082 | 2.262 | 3.466 | 3.304 | 2.928 | 3.184 | 0.03 | 0.09 | 3.76 | 4.410 | 3.762 | 3.756 | 0.23 | 0.33 | 4000 | 2.072 | 2.193 |
| 336 | 4000 | 2.534 | 2.553 | 2.152 | 2.300 | 3.564 | 3.577 | 3.023 | 3.230 | 0.03 | 0.08 | 3.88 | 4.555 | 3.887 | 3.881 | 0.16 | 0.26 | 4000 | 2.167 | 2.277 |

Erste Vorlaufstunde mit CRPS fl-K > Klima (Station): **234**; letzte Stunde mit fl-K < Klima: 228.

Je Bin (td) — Summen der Stunden, b/σ_b je Bin in-sample; CRPS Misch. auf den vereinigten Stichproben der Stunden:

| Bin | n | CRPS K | Cube | Klima | Pool | MAE K | Klima | ρ | b | σ_b | RMSE K | Klima | Misch. | n_S | CRPS Misch. Stat | Pool |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0–6 | 24000 | 0.703 | 0.815 | 2.050 | 2.232 | 0.963 | 2.885 | 0.92 | 0.99 | 1.40 | 1.405 | 3.714 | 1.404 | 24000 | 0.741 | 0.740 |
| 7–24 | 72000 | 0.800 | 0.932 | 1.960 | 2.142 | 1.105 | 2.771 | 0.90 | 0.98 | 1.50 | 1.506 | 3.511 | 1.505 | 72000 | 0.814 | 0.814 |
| 25–48 | 96000 | 0.920 | 1.075 | 1.957 | 2.139 | 1.271 | 2.765 | 0.87 | 1.00 | 1.71 | 1.707 | 3.507 | 1.707 | 96000 | 0.924 | 0.924 |
| 51–120 | 96000 | 1.160 | 1.455 | 2.098 | 2.307 | 1.597 | 2.948 | 0.82 | 0.93 | 2.17 | 2.183 | 3.811 | 2.171 | 96000 | 1.165 | 1.166 |
| 126–240 | 80000 | 1.767 | 1.979 | 2.103 | 2.267 | 2.453 | 2.955 | 0.55 | 0.72 | 3.14 | 3.248 | 3.803 | 3.139 | 80000 | 1.727 | 1.748 |
| 246–336 | 64000 | 2.387 | 2.375 | 2.113 | 2.277 | 3.355 | 2.971 | 0.12 | 0.20 | 3.78 | 4.297 | 3.819 | 3.783 | 64000 | 2.113 | 2.204 |

### ws

| Vorlauf h | n | CRPS K | Cube | Klima | Pool | MAE K | Cube | Klima | Pool | ρ | b | σ_b | RMSE K | RMSE Klima | RMSE Misch. | ρ Pool | b Pool | n_S | CRPS Misch. Stat | Pool |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 4000 | 0.751 | 0.841 | 0.955 | 1.190 | 1.055 | 1.204 | 1.381 | 1.715 | 0.63 | 0.73 | 1.44 | 1.507 | 1.870 | 1.439 | 0.74 | 0.92 | 4000 | 0.767 | 0.783 |
| 2 | 4000 | 0.785 | 0.897 | 0.998 | 1.215 | 1.112 | 1.285 | 1.448 | 1.744 | 0.64 | 0.75 | 1.50 | 1.561 | 1.963 | 1.504 | 0.74 | 0.94 | 4000 | 0.813 | 0.827 |
| 3 | 4000 | 0.701 | 0.794 | 0.791 | 1.007 | 1.001 | 1.155 | 1.126 | 1.438 | 0.56 | 0.66 | 1.29 | 1.368 | 1.557 | 1.289 | 0.71 | 0.94 | 4000 | 0.684 | 0.723 |
| 4 | 4000 | 0.733 | 0.805 | 0.810 | 0.997 | 1.032 | 1.159 | 1.150 | 1.413 | 0.51 | 0.63 | 1.35 | 1.432 | 1.569 | 1.350 | 0.66 | 0.90 | 4000 | 0.726 | 0.756 |
| 5 | 4000 | 0.761 | 0.865 | 0.857 | 1.040 | 1.078 | 1.246 | 1.227 | 1.469 | 0.54 | 0.68 | 1.42 | 1.483 | 1.693 | 1.421 | 0.68 | 0.95 | 4000 | 0.776 | 0.801 |
| 6 | 4000 | 0.707 | 0.807 | 0.791 | 1.007 | 1.009 | 1.178 | 1.126 | 1.438 | 0.55 | 0.65 | 1.30 | 1.380 | 1.557 | 1.300 | 0.71 | 0.94 | 4000 | 0.724 | 0.763 |
| 7 | 4000 | 0.742 | 0.816 | 0.810 | 0.997 | 1.044 | 1.178 | 1.151 | 1.414 | 0.49 | 0.62 | 1.37 | 1.447 | 1.570 | 1.368 | 0.65 | 0.91 | 4000 | 0.757 | 0.786 |
| 8 | 4000 | 0.770 | 0.878 | 0.858 | 1.041 | 1.091 | 1.267 | 1.228 | 1.469 | 0.53 | 0.68 | 1.44 | 1.497 | 1.694 | 1.437 | 0.67 | 0.97 | 4000 | 0.781 | 0.805 |
| 9 | 4000 | 0.716 | 0.820 | 0.791 | 1.007 | 1.022 | 1.200 | 1.126 | 1.438 | 0.54 | 0.64 | 1.32 | 1.394 | 1.558 | 1.316 | 0.70 | 0.95 | 4000 | 0.718 | 0.763 |
| 10 | 4000 | 0.748 | 0.827 | 0.811 | 0.997 | 1.051 | 1.196 | 1.151 | 1.414 | 0.49 | 0.61 | 1.37 | 1.457 | 1.570 | 1.374 | 0.64 | 0.90 | 4000 | 0.745 | 0.780 |
| 11 | 4000 | 0.774 | 0.889 | 0.858 | 1.041 | 1.096 | 1.287 | 1.228 | 1.470 | 0.52 | 0.67 | 1.44 | 1.506 | 1.694 | 1.443 | 0.67 | 0.96 | 4000 | 0.797 | 0.826 |
| 12 | 4000 | 0.719 | 0.833 | 0.791 | 1.007 | 1.026 | 1.222 | 1.126 | 1.438 | 0.53 | 0.64 | 1.32 | 1.399 | 1.558 | 1.318 | 0.70 | 0.94 | 4000 | 0.739 | 0.780 |
| 13 | 4000 | 0.751 | 0.837 | 0.811 | 0.998 | 1.057 | 1.214 | 1.151 | 1.414 | 0.48 | 0.60 | 1.38 | 1.464 | 1.570 | 1.378 | 0.64 | 0.90 | 4000 | 0.752 | 0.781 |
| 14 | 4000 | 0.779 | 0.904 | 0.858 | 1.041 | 1.103 | 1.312 | 1.228 | 1.470 | 0.52 | 0.67 | 1.45 | 1.513 | 1.695 | 1.449 | 0.66 | 0.95 | 4000 | 0.778 | 0.809 |
| 15 | 4000 | 0.721 | 0.847 | 0.791 | 1.007 | 1.028 | 1.245 | 1.127 | 1.438 | 0.53 | 0.64 | 1.32 | 1.403 | 1.558 | 1.322 | 0.69 | 0.94 | 4000 | 0.718 | 0.760 |
| 16 | 4000 | 0.756 | 0.849 | 0.811 | 0.998 | 1.065 | 1.235 | 1.151 | 1.414 | 0.47 | 0.59 | 1.38 | 1.474 | 1.571 | 1.384 | 0.63 | 0.89 | 4000 | 0.767 | 0.806 |
| 17 | 4000 | 0.785 | 0.920 | 0.858 | 1.041 | 1.111 | 1.338 | 1.228 | 1.470 | 0.51 | 0.65 | 1.46 | 1.528 | 1.695 | 1.459 | 0.65 | 0.94 | 4000 | 0.802 | 0.831 |
| 18 | 4000 | 0.726 | 0.863 | 0.792 | 1.007 | 1.036 | 1.272 | 1.127 | 1.438 | 0.52 | 0.63 | 1.33 | 1.415 | 1.559 | 1.330 | 0.69 | 0.93 | 4000 | 0.726 | 0.759 |
| 19 | 4000 | 0.760 | 0.861 | 0.811 | 0.998 | 1.069 | 1.255 | 1.151 | 1.414 | 0.47 | 0.59 | 1.39 | 1.482 | 1.571 | 1.389 | 0.63 | 0.88 | 4000 | 0.773 | 0.813 |
| 20 | 4000 | 0.789 | 0.933 | 0.858 | 1.042 | 1.116 | 1.361 | 1.229 | 1.471 | 0.51 | 0.65 | 1.46 | 1.530 | 1.696 | 1.460 | 0.65 | 0.94 | 4000 | 0.792 | 0.817 |
| 21 | 4000 | 0.728 | 0.877 | 0.792 | 1.007 | 1.038 | 1.295 | 1.127 | 1.438 | 0.52 | 0.62 | 1.33 | 1.419 | 1.559 | 1.333 | 0.69 | 0.93 | 4000 | 0.729 | 0.773 |
| 22 | 4000 | 0.765 | 0.874 | 0.811 | 0.998 | 1.076 | 1.278 | 1.152 | 1.415 | 0.46 | 0.58 | 1.39 | 1.489 | 1.572 | 1.393 | 0.62 | 0.87 | 4000 | 0.761 | 0.801 |
| 23 | 4000 | 0.792 | 0.947 | 0.859 | 1.042 | 1.120 | 1.385 | 1.229 | 1.471 | 0.50 | 0.65 | 1.46 | 1.537 | 1.696 | 1.464 | 0.65 | 0.93 | 4000 | 0.798 | 0.825 |
| 24 | 4000 | 0.730 | 0.890 | 0.792 | 1.008 | 1.040 | 1.318 | 1.127 | 1.438 | 0.52 | 0.62 | 1.33 | 1.421 | 1.559 | 1.335 | 0.68 | 0.93 | 4000 | 0.731 | 0.775 |
| 25 | 4000 | 0.779 | 0.886 | 0.812 | 0.998 | 1.087 | 1.298 | 1.152 | 1.415 | 0.44 | 0.55 | 1.42 | 1.520 | 1.572 | 1.422 | 0.61 | 0.89 | 4000 | 0.784 | 0.819 |
| 26 | 4000 | 0.807 | 0.962 | 0.859 | 1.042 | 1.134 | 1.410 | 1.229 | 1.470 | 0.47 | 0.62 | 1.50 | 1.573 | 1.696 | 1.499 | 0.63 | 0.96 | 4000 | 0.812 | 0.843 |
| 27 | 4000 | 0.734 | 0.905 | 0.792 | 1.008 | 1.038 | 1.342 | 1.127 | 1.439 | 0.49 | 0.62 | 1.36 | 1.442 | 1.560 | 1.364 | 0.67 | 0.98 | 4000 | 0.727 | 0.755 |
| 28 | 4000 | 0.780 | 0.892 | 0.812 | 0.998 | 1.086 | 1.308 | 1.152 | 1.415 | 0.44 | 0.55 | 1.42 | 1.519 | 1.572 | 1.416 | 0.61 | 0.87 | 4000 | 0.776 | 0.816 |
| 29 | 4000 | 0.807 | 0.970 | 0.859 | 1.041 | 1.131 | 1.426 | 1.229 | 1.470 | 0.48 | 0.62 | 1.49 | 1.575 | 1.696 | 1.492 | 0.63 | 0.92 | 4000 | 0.811 | 0.848 |
| 30 | 4000 | 0.736 | 0.919 | 0.792 | 1.008 | 1.042 | 1.367 | 1.127 | 1.439 | 0.49 | 0.62 | 1.36 | 1.442 | 1.560 | 1.363 | 0.67 | 0.97 | 4000 | 0.744 | 0.773 |
| 31 | 4000 | 0.779 | 0.903 | 0.812 | 0.999 | 1.085 | 1.329 | 1.152 | 1.415 | 0.44 | 0.55 | 1.42 | 1.525 | 1.572 | 1.419 | 0.61 | 0.86 | 4000 | 0.764 | 0.809 |
| 32 | 4000 | 0.808 | 0.984 | 0.859 | 1.042 | 1.133 | 1.451 | 1.228 | 1.470 | 0.48 | 0.62 | 1.50 | 1.577 | 1.696 | 1.495 | 0.63 | 0.93 | 4000 | 0.824 | 0.854 |
| 33 | 4000 | 0.746 | 0.933 | 0.792 | 1.008 | 1.055 | 1.387 | 1.127 | 1.439 | 0.47 | 0.60 | 1.37 | 1.460 | 1.560 | 1.374 | 0.66 | 0.96 | 4000 | 0.753 | 0.792 |
| 34 | 4000 | 0.786 | 0.917 | 0.812 | 0.999 | 1.095 | 1.353 | 1.152 | 1.415 | 0.43 | 0.54 | 1.42 | 1.533 | 1.573 | 1.423 | 0.60 | 0.85 | 4000 | 0.775 | 0.815 |
| 35 | 4000 | 0.811 | 0.998 | 0.859 | 1.042 | 1.138 | 1.476 | 1.228 | 1.471 | 0.48 | 0.61 | 1.50 | 1.581 | 1.697 | 1.496 | 0.63 | 0.92 | 4000 | 0.818 | 0.856 |
| 36 | 4000 | 0.749 | 0.947 | 0.792 | 1.008 | 1.057 | 1.410 | 1.127 | 1.439 | 0.47 | 0.60 | 1.38 | 1.466 | 1.560 | 1.381 | 0.66 | 0.97 | 4000 | 0.752 | 0.788 |
| 37 | 4000 | 0.786 | 0.930 | 0.812 | 0.999 | 1.094 | 1.374 | 1.152 | 1.416 | 0.43 | 0.53 | 1.43 | 1.539 | 1.573 | 1.429 | 0.60 | 0.85 | 4000 | 0.766 | 0.811 |
| 38 | 4000 | 0.811 | 1.012 | 0.858 | 1.042 | 1.138 | 1.500 | 1.228 | 1.470 | 0.47 | 0.62 | 1.50 | 1.578 | 1.696 | 1.497 | 0.63 | 0.94 | 4000 | 0.823 | 0.854 |
| 39 | 4000 | 0.749 | 0.963 | 0.792 | 1.009 | 1.060 | 1.437 | 1.127 | 1.439 | 0.47 | 0.59 | 1.38 | 1.468 | 1.560 | 1.381 | 0.66 | 0.96 | 4000 | 0.732 | 0.771 |
| 40 | 4000 | 0.789 | 0.940 | 0.812 | 0.999 | 1.100 | 1.393 | 1.151 | 1.415 | 0.43 | 0.53 | 1.43 | 1.539 | 1.572 | 1.429 | 0.60 | 0.86 | 4000 | 0.776 | 0.821 |
| 41 | 4000 | 0.817 | 1.027 | 0.858 | 1.042 | 1.146 | 1.525 | 1.228 | 1.470 | 0.47 | 0.60 | 1.50 | 1.590 | 1.696 | 1.504 | 0.62 | 0.91 | 4000 | 0.823 | 0.853 |
| 42 | 4000 | 0.752 | 0.977 | 0.792 | 1.009 | 1.062 | 1.459 | 1.127 | 1.439 | 0.46 | 0.59 | 1.39 | 1.475 | 1.560 | 1.389 | 0.65 | 0.97 | 4000 | 0.764 | 0.800 |
| 43 | 4000 | 0.792 | 0.954 | 0.812 | 1.000 | 1.102 | 1.415 | 1.152 | 1.416 | 0.42 | 0.53 | 1.44 | 1.548 | 1.573 | 1.436 | 0.59 | 0.85 | 4000 | 0.787 | 0.831 |
| 44 | 4000 | 0.818 | 1.041 | 0.859 | 1.043 | 1.149 | 1.549 | 1.228 | 1.471 | 0.46 | 0.61 | 1.51 | 1.589 | 1.696 | 1.506 | 0.63 | 0.93 | 4000 | 0.815 | 0.854 |
| 45 | 4000 | 0.753 | 0.992 | 0.793 | 1.009 | 1.064 | 1.483 | 1.127 | 1.439 | 0.46 | 0.59 | 1.39 | 1.475 | 1.561 | 1.387 | 0.65 | 0.97 | 4000 | 0.759 | 0.799 |
| 46 | 4000 | 0.795 | 0.964 | 0.812 | 0.999 | 1.106 | 1.432 | 1.152 | 1.415 | 0.42 | 0.53 | 1.44 | 1.548 | 1.573 | 1.437 | 0.59 | 0.85 | 4000 | 0.777 | 0.822 |
| 47 | 4000 | 0.827 | 1.057 | 0.859 | 1.043 | 1.160 | 1.574 | 1.229 | 1.471 | 0.45 | 0.59 | 1.52 | 1.610 | 1.698 | 1.517 | 0.61 | 0.90 | 4000 | 0.820 | 0.858 |
| 48 | 4000 | 0.756 | 1.005 | 0.793 | 1.009 | 1.067 | 1.503 | 1.128 | 1.440 | 0.45 | 0.58 | 1.39 | 1.481 | 1.561 | 1.393 | 0.65 | 0.97 | 4000 | 0.733 | 0.777 |
| 51 | 4000 | 0.867 | 1.099 | 0.945 | 1.185 | 1.234 | 1.630 | 1.364 | 1.697 | 0.50 | 0.66 | 1.60 | 1.665 | 1.847 | 1.597 | 0.67 | 0.99 | 4000 | 0.880 | 0.905 |
| 54 | 4000 | 0.856 | 1.119 | 0.912 | 1.214 | 1.206 | 1.668 | 1.320 | 1.777 | 0.46 | 0.59 | 1.59 | 1.693 | 1.802 | 1.592 | 0.67 | 0.94 | 4000 | 0.890 | 0.924 |
| 57 | 4000 | 0.872 | 1.122 | 0.945 | 1.185 | 1.241 | 1.666 | 1.364 | 1.698 | 0.49 | 0.66 | 1.60 | 1.675 | 1.848 | 1.605 | 0.67 | 0.99 | 4000 | 0.872 | 0.903 |
| 60 | 4000 | 0.860 | 1.142 | 0.912 | 1.214 | 1.212 | 1.705 | 1.320 | 1.777 | 0.45 | 0.59 | 1.60 | 1.703 | 1.802 | 1.599 | 0.66 | 0.93 | 4000 | 0.898 | 0.942 |
| 63 | 4000 | 0.880 | 1.145 | 0.945 | 1.185 | 1.252 | 1.702 | 1.364 | 1.698 | 0.48 | 0.64 | 1.62 | 1.693 | 1.848 | 1.618 | 0.66 | 0.98 | 4000 | 0.891 | 0.924 |
| 66 | 4000 | 0.864 | 1.163 | 0.912 | 1.214 | 1.218 | 1.738 | 1.319 | 1.777 | 0.45 | 0.58 | 1.60 | 1.710 | 1.802 | 1.604 | 0.66 | 0.93 | 4000 | 0.900 | 0.949 |
| 69 | 4000 | 0.888 | 1.166 | 0.945 | 1.185 | 1.262 | 1.735 | 1.364 | 1.698 | 0.47 | 0.63 | 1.63 | 1.706 | 1.848 | 1.627 | 0.65 | 0.97 | 4000 | 0.929 | 0.956 |
| 72 | 4000 | 0.871 | 1.183 | 0.912 | 1.214 | 1.226 | 1.769 | 1.320 | 1.778 | 0.44 | 0.57 | 1.61 | 1.722 | 1.802 | 1.612 | 0.65 | 0.93 | 4000 | 0.884 | 0.926 |
| 75 | 4000 | 0.896 | 1.185 | 0.945 | 1.185 | 1.273 | 1.766 | 1.364 | 1.698 | 0.46 | 0.62 | 1.64 | 1.722 | 1.848 | 1.638 | 0.64 | 0.96 | 4000 | 0.925 | 0.952 |
| 78 | 4000 | 0.877 | 1.203 | 0.912 | 1.214 | 1.235 | 1.800 | 1.320 | 1.778 | 0.43 | 0.56 | 1.62 | 1.734 | 1.802 | 1.621 | 0.64 | 0.92 | 4000 | 0.876 | 0.915 |
| 81 | 4000 | 0.905 | 1.205 | 0.946 | 1.185 | 1.285 | 1.796 | 1.364 | 1.698 | 0.44 | 0.60 | 1.65 | 1.738 | 1.848 | 1.649 | 0.63 | 0.95 | 4000 | 0.913 | 0.946 |
| 84 | 4000 | 0.884 | 1.221 | 0.912 | 1.214 | 1.245 | 1.829 | 1.320 | 1.778 | 0.42 | 0.55 | 1.63 | 1.747 | 1.802 | 1.630 | 0.64 | 0.92 | 4000 | 0.934 | 0.980 |
| 87 | 4000 | 0.916 | 1.224 | 0.946 | 1.185 | 1.300 | 1.826 | 1.364 | 1.698 | 0.43 | 0.59 | 1.66 | 1.757 | 1.848 | 1.662 | 0.62 | 0.94 | 4000 | 0.913 | 0.956 |
| 90 | 4000 | 0.891 | 1.239 | 0.912 | 1.214 | 1.255 | 1.856 | 1.320 | 1.778 | 0.41 | 0.54 | 1.64 | 1.759 | 1.802 | 1.639 | 0.63 | 0.92 | 4000 | 0.912 | 0.964 |
| 93 | 4000 | 0.925 | 1.240 | 0.946 | 1.186 | 1.313 | 1.852 | 1.365 | 1.698 | 0.42 | 0.57 | 1.67 | 1.774 | 1.849 | 1.673 | 0.62 | 0.93 | 4000 | 0.939 | 0.985 |
| 96 | 4000 | 0.898 | 1.255 | 0.912 | 1.215 | 1.265 | 1.882 | 1.320 | 1.778 | 0.40 | 0.53 | 1.65 | 1.771 | 1.803 | 1.647 | 0.63 | 0.91 | 4000 | 0.903 | 0.946 |
| 99 | 4000 | 0.937 | 1.257 | 0.946 | 1.186 | 1.328 | 1.878 | 1.365 | 1.699 | 0.40 | 0.55 | 1.69 | 1.797 | 1.849 | 1.687 | 0.60 | 0.91 | 4000 | 0.944 | 0.995 |
| 102 | 4000 | 0.906 | 1.271 | 0.912 | 1.215 | 1.276 | 1.906 | 1.320 | 1.778 | 0.38 | 0.52 | 1.66 | 1.785 | 1.803 | 1.656 | 0.62 | 0.91 | 4000 | 0.913 | 0.969 |
| 105 | 4000 | 0.949 | 1.272 | 0.946 | 1.186 | 1.345 | 1.902 | 1.365 | 1.699 | 0.39 | 0.53 | 1.70 | 1.817 | 1.849 | 1.699 | 0.59 | 0.90 | 4000 | 0.941 | 1.001 |
| 108 | 4000 | 0.913 | 1.285 | 0.912 | 1.215 | 1.286 | 1.928 | 1.320 | 1.778 | 0.37 | 0.51 | 1.66 | 1.796 | 1.803 | 1.664 | 0.61 | 0.90 | 4000 | 0.921 | 0.977 |
| 111 | 4000 | 0.957 | 1.286 | 0.946 | 1.186 | 1.354 | 1.923 | 1.365 | 1.699 | 0.37 | 0.51 | 1.71 | 1.835 | 1.850 | 1.709 | 0.58 | 0.89 | 4000 | 0.960 | 1.013 |
| 114 | 4000 | 0.920 | 1.299 | 0.913 | 1.215 | 1.296 | 1.950 | 1.321 | 1.779 | 0.36 | 0.49 | 1.67 | 1.809 | 1.803 | 1.673 | 0.61 | 0.90 | 4000 | 0.949 | 1.004 |
| 117 | 4000 | 0.967 | 1.299 | 0.946 | 1.186 | 1.369 | 1.943 | 1.365 | 1.700 | 0.36 | 0.50 | 1.72 | 1.851 | 1.850 | 1.717 | 0.57 | 0.87 | 4000 | 0.969 | 1.029 |
| 120 | 4000 | 0.928 | 1.310 | 0.913 | 1.215 | 1.308 | 1.968 | 1.321 | 1.779 | 0.35 | 0.48 | 1.68 | 1.826 | 1.803 | 1.682 | 0.60 | 0.89 | 4000 | 0.921 | 0.981 |
| 126 | 4000 | 0.848 | 0.837 | 0.846 | 1.126 | 1.206 | 1.125 | 1.226 | 1.663 | 0.31 | 0.52 | 1.52 | 1.603 | 1.616 | 1.521 | 0.59 | 0.92 | 4000 | 0.852 | 0.885 |
| 132 | 4000 | 1.070 | 1.163 | 0.977 | 1.301 | 1.475 | 1.491 | 1.412 | 1.890 | 0.24 | 0.34 | 1.90 | 2.142 | 1.966 | 1.901 | 0.53 | 0.82 | 4000 | 1.045 | 1.134 |
| 138 | 4000 | 0.861 | 0.859 | 0.846 | 1.127 | 1.228 | 1.160 | 1.227 | 1.664 | 0.29 | 0.49 | 1.54 | 1.625 | 1.617 | 1.537 | 0.58 | 0.92 | 4000 | 0.848 | 0.880 |
| 144 | 4000 | 1.077 | 1.171 | 0.977 | 1.302 | 1.489 | 1.508 | 1.412 | 1.891 | 0.22 | 0.32 | 1.91 | 2.158 | 1.966 | 1.910 | 0.52 | 0.82 | 4000 | 1.041 | 1.135 |
| 150 | 4000 | 0.870 | 0.875 | 0.846 | 1.127 | 1.243 | 1.183 | 1.227 | 1.664 | 0.26 | 0.46 | 1.55 | 1.645 | 1.617 | 1.551 | 0.57 | 0.91 | 4000 | 0.878 | 0.920 |
| 156 | 4000 | 1.094 | 1.193 | 0.977 | 1.301 | 1.516 | 1.545 | 1.412 | 1.891 | 0.19 | 0.29 | 1.92 | 2.183 | 1.966 | 1.921 | 0.50 | 0.81 | 4000 | 1.055 | 1.158 |
| 162 | 4000 | 0.883 | 0.898 | 0.847 | 1.127 | 1.267 | 1.217 | 1.227 | 1.665 | 0.23 | 0.42 | 1.56 | 1.666 | 1.618 | 1.565 | 0.55 | 0.90 | 4000 | 0.888 | 0.939 |
| 168 | 4000 | 1.101 | 1.203 | 0.977 | 1.302 | 1.531 | 1.563 | 1.412 | 1.891 | 0.18 | 0.27 | 1.93 | 2.193 | 1.967 | 1.927 | 0.49 | 0.81 | 4000 | 1.055 | 1.159 |
| 174 | 4000 | 0.891 | 0.907 | 0.847 | 1.127 | 1.283 | 1.232 | 1.227 | 1.664 | 0.21 | 0.38 | 1.58 | 1.682 | 1.618 | 1.575 | 0.54 | 0.90 | 4000 | 0.902 | 0.950 |
| 180 | 4000 | 1.117 | 1.216 | 0.978 | 1.303 | 1.557 | 1.584 | 1.413 | 1.893 | 0.16 | 0.24 | 1.94 | 2.217 | 1.968 | 1.937 | 0.48 | 0.80 | 4000 | 1.089 | 1.229 |
| 186 | 4000 | 0.908 | 0.924 | 0.847 | 1.128 | 1.314 | 1.260 | 1.228 | 1.666 | 0.19 | 0.33 | 1.59 | 1.712 | 1.619 | 1.588 | 0.53 | 0.88 | 4000 | 0.910 | 0.975 |
| 192 | 4000 | 1.131 | 1.234 | 0.978 | 1.303 | 1.585 | 1.611 | 1.413 | 1.892 | 0.14 | 0.21 | 1.94 | 2.243 | 1.967 | 1.944 | 0.46 | 0.78 | 4000 | 1.068 | 1.187 |
| 198 | 4000 | 0.913 | 0.936 | 0.847 | 1.128 | 1.325 | 1.276 | 1.228 | 1.665 | 0.17 | 0.31 | 1.59 | 1.721 | 1.619 | 1.593 | 0.52 | 0.88 | 4000 | 0.931 | 1.006 |
| 204 | 4000 | 1.143 | 1.251 | 0.979 | 1.304 | 1.608 | 1.637 | 1.414 | 1.894 | 0.12 | 0.19 | 1.95 | 2.261 | 1.969 | 1.950 | 0.45 | 0.77 | 4000 | 1.078 | 1.227 |
| 210 | 4000 | 0.920 | 0.944 | 0.848 | 1.128 | 1.340 | 1.290 | 1.228 | 1.666 | 0.16 | 0.28 | 1.60 | 1.734 | 1.620 | 1.599 | 0.52 | 0.87 | 4000 | 0.915 | 1.003 |
| 216 | 4000 | 1.151 | 1.257 | 0.978 | 1.303 | 1.620 | 1.645 | 1.413 | 1.893 | 0.11 | 0.17 | 1.95 | 2.278 | 1.967 | 1.952 | 0.44 | 0.76 | 4000 | 1.067 | 1.227 |
| 222 | 4000 | 0.924 | 0.949 | 0.847 | 1.127 | 1.348 | 1.297 | 1.227 | 1.664 | 0.14 | 0.25 | 1.60 | 1.744 | 1.618 | 1.602 | 0.51 | 0.86 | 4000 | 0.912 | 0.986 |
| 228 | 4000 | 1.160 | 1.266 | 0.978 | 1.304 | 1.636 | 1.661 | 1.414 | 1.894 | 0.10 | 0.15 | 1.96 | 2.295 | 1.969 | 1.957 | 0.43 | 0.75 | 4000 | 1.077 | 1.249 |
| 234 | 4000 | 0.934 | 0.958 | 0.848 | 1.128 | 1.365 | 1.310 | 1.228 | 1.665 | 0.12 | 0.21 | 1.61 | 1.761 | 1.620 | 1.608 | 0.50 | 0.85 | 4000 | 0.922 | 1.020 |
| 240 | 4000 | 1.167 | 1.269 | 0.979 | 1.305 | 1.650 | 1.667 | 1.415 | 1.895 | 0.09 | 0.14 | 1.96 | 2.303 | 1.971 | 1.961 | 0.43 | 0.74 | 4000 | 1.070 | 1.234 |
| 246 | 4000 | 0.926 | 0.962 | 0.848 | 1.128 | 1.326 | 1.317 | 1.228 | 1.666 | 0.07 | 0.19 | 1.61 | 1.758 | 1.620 | 1.611 | 0.48 | 0.87 | 4000 | 0.907 | 0.983 |
| 252 | 4000 | 1.177 | 1.276 | 0.980 | 1.305 | 1.628 | 1.677 | 1.416 | 1.895 | 0.04 | 0.10 | 1.97 | 2.355 | 1.971 | 1.966 | 0.39 | 0.69 | 4000 | 1.078 | 1.252 |
| 258 | 4000 | 0.927 | 0.967 | 0.848 | 1.128 | 1.332 | 1.325 | 1.228 | 1.666 | 0.06 | 0.18 | 1.61 | 1.760 | 1.621 | 1.613 | 0.48 | 0.88 | 4000 | 0.914 | 0.984 |
| 264 | 4000 | 1.176 | 1.278 | 0.979 | 1.304 | 1.631 | 1.682 | 1.415 | 1.894 | 0.04 | 0.09 | 1.97 | 2.353 | 1.970 | 1.966 | 0.39 | 0.70 | 4000 | 1.104 | 1.254 |
| 270 | 4000 | 0.930 | 0.969 | 0.849 | 1.129 | 1.341 | 1.333 | 1.230 | 1.667 | 0.06 | 0.16 | 1.62 | 1.764 | 1.622 | 1.616 | 0.48 | 0.88 | 4000 | 0.911 | 0.986 |
| 276 | 4000 | 1.182 | 1.282 | 0.980 | 1.305 | 1.641 | 1.691 | 1.416 | 1.895 | 0.03 | 0.08 | 1.97 | 2.361 | 1.971 | 1.968 | 0.38 | 0.69 | 4000 | 1.105 | 1.281 |
| 282 | 4000 | 0.935 | 0.974 | 0.849 | 1.129 | 1.351 | 1.339 | 1.230 | 1.667 | 0.04 | 0.14 | 1.62 | 1.773 | 1.622 | 1.618 | 0.47 | 0.87 | 4000 | 0.928 | 1.013 |
| 288 | 4000 | 1.186 | 1.286 | 0.979 | 1.305 | 1.647 | 1.697 | 1.415 | 1.895 | 0.02 | 0.07 | 1.97 | 2.368 | 1.970 | 1.968 | 0.38 | 0.69 | 4000 | 1.061 | 1.231 |
| 294 | 4000 | 0.938 | 0.978 | 0.849 | 1.129 | 1.354 | 1.344 | 1.229 | 1.668 | 0.03 | 0.12 | 1.62 | 1.777 | 1.622 | 1.619 | 0.47 | 0.87 | 4000 | 0.907 | 0.987 |
| 300 | 4000 | 1.193 | 1.292 | 0.980 | 1.305 | 1.658 | 1.707 | 1.416 | 1.895 | 0.01 | 0.06 | 1.97 | 2.379 | 1.972 | 1.971 | 0.37 | 0.68 | 4000 | 1.088 | 1.274 |
| 306 | 4000 | 0.943 | 0.986 | 0.850 | 1.130 | 1.363 | 1.356 | 1.231 | 1.668 | 0.02 | 0.09 | 1.62 | 1.785 | 1.623 | 1.621 | 0.46 | 0.86 | 4000 | 0.907 | 1.004 |
| 312 | 4000 | 1.197 | 1.295 | 0.980 | 1.306 | 1.667 | 1.713 | 1.417 | 1.897 | 0.01 | 0.05 | 1.97 | 2.384 | 1.973 | 1.972 | 0.36 | 0.67 | 4000 | 1.107 | 1.278 |
| 318 | 4000 | 0.945 | 0.986 | 0.850 | 1.130 | 1.369 | 1.358 | 1.231 | 1.668 | 0.01 | 0.07 | 1.62 | 1.789 | 1.624 | 1.623 | 0.46 | 0.86 | 4000 | 0.914 | 1.013 |
| 324 | 4000 | 1.201 | 1.302 | 0.981 | 1.306 | 1.673 | 1.723 | 1.417 | 1.896 | 0.01 | 0.04 | 1.97 | 2.389 | 1.973 | 1.972 | 0.36 | 0.67 | 4000 | 1.075 | 1.263 |
| 330 | 4000 | 0.944 | 0.988 | 0.850 | 1.130 | 1.370 | 1.361 | 1.231 | 1.668 | 0.02 | 0.07 | 1.62 | 1.787 | 1.624 | 1.623 | 0.46 | 0.86 | 4000 | 0.927 | 1.013 |
| 336 | 4000 | 1.199 | 1.302 | 0.981 | 1.306 | 1.672 | 1.723 | 1.417 | 1.897 | 0.01 | 0.04 | 1.97 | 2.388 | 1.974 | 1.973 | 0.36 | 0.67 | 4000 | 1.110 | 1.298 |

Erste Vorlaufstunde mit CRPS fl-K > Klima (Station): **105**; letzte Stunde mit fl-K < Klima: 102.

Je Bin (ws) — Summen der Stunden, b/σ_b je Bin in-sample; CRPS Misch. auf den vereinigten Stichproben der Stunden:

| Bin | n | CRPS K | Cube | Klima | Pool | MAE K | Klima | ρ | b | σ_b | RMSE K | Klima | Misch. | n_S | CRPS Misch. Stat | Pool |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0–6 | 24000 | 0.754 | 0.852 | 0.921 | 1.139 | 1.065 | 1.328 | 0.61 | 0.72 | 1.43 | 1.496 | 1.815 | 1.431 | 24000 | 0.753 | 0.779 |
| 7–24 | 72000 | 0.753 | 0.870 | 0.820 | 1.015 | 1.066 | 1.169 | 0.51 | 0.63 | 1.39 | 1.466 | 1.609 | 1.388 | 72000 | 0.760 | 0.794 |
| 25–48 | 96000 | 0.782 | 0.962 | 0.821 | 1.017 | 1.097 | 1.169 | 0.46 | 0.58 | 1.44 | 1.528 | 1.611 | 1.437 | 96000 | 0.781 | 0.818 |
| 51–120 | 96000 | 0.901 | 1.216 | 0.929 | 1.200 | 1.274 | 1.342 | 0.42 | 0.57 | 1.65 | 1.754 | 1.826 | 1.648 | 96000 | 0.917 | 0.961 |
| 126–240 | 80000 | 1.011 | 1.069 | 0.914 | 1.217 | 1.432 | 1.322 | 0.17 | 0.28 | 1.77 | 1.984 | 1.805 | 1.773 | 80000 | 0.985 | 1.080 |
| 246–336 | 64000 | 1.065 | 1.136 | 0.916 | 1.219 | 1.505 | 1.325 | 0.03 | 0.08 | 1.81 | 2.102 | 1.810 | 1.807 | 64000 | 1.005 | 1.138 |

### gust

| Vorlauf h | n | CRPS K | Cube | Klima | Pool | MAE K | Cube | Klima | Pool | ρ | b | σ_b | RMSE K | RMSE Klima | RMSE Misch. | ρ Pool | b Pool | n_S | CRPS Misch. Stat | Pool |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 4000 | 1.029 | 1.206 | 1.636 | 1.891 | 1.425 | 1.590 | 2.323 | 2.678 | 0.78 | 0.91 | 1.97 | 1.988 | 3.140 | 1.971 | 0.83 | 0.98 | 4000 | 1.019 | 1.026 |
| 2 | 4000 | 1.041 | 1.259 | 1.666 | 1.903 | 1.442 | 1.670 | 2.366 | 2.707 | 0.78 | 0.91 | 2.00 | 2.016 | 3.196 | 1.999 | 0.83 | 0.98 | 4000 | 1.097 | 1.102 |
| 3 | 4000 | 0.988 | 1.141 | 1.376 | 1.600 | 1.369 | 1.509 | 1.923 | 2.243 | 0.71 | 0.86 | 1.87 | 1.890 | 2.639 | 1.867 | 0.78 | 1.02 | 4000 | 1.007 | 1.021 |
| 4 | 4000 | 1.052 | 1.246 | 1.408 | 1.628 | 1.452 | 1.649 | 1.965 | 2.279 | 0.68 | 0.80 | 1.99 | 2.042 | 2.700 | 1.989 | 0.75 | 0.92 | 4000 | 1.049 | 1.072 |
| 5 | 4000 | 1.078 | 1.303 | 1.440 | 1.646 | 1.490 | 1.732 | 2.015 | 2.304 | 0.68 | 0.80 | 2.02 | 2.068 | 2.759 | 2.017 | 0.75 | 0.93 | 4000 | 1.096 | 1.121 |
| 6 | 4000 | 1.005 | 1.160 | 1.377 | 1.600 | 1.389 | 1.533 | 1.923 | 2.243 | 0.69 | 0.85 | 1.91 | 1.933 | 2.639 | 1.906 | 0.77 | 1.01 | 4000 | 1.000 | 1.010 |
| 7 | 4000 | 1.075 | 1.260 | 1.409 | 1.628 | 1.484 | 1.666 | 1.966 | 2.280 | 0.66 | 0.80 | 2.03 | 2.082 | 2.701 | 2.034 | 0.73 | 0.94 | 4000 | 1.081 | 1.095 |
| 8 | 4000 | 1.106 | 1.317 | 1.440 | 1.647 | 1.531 | 1.749 | 2.016 | 2.304 | 0.67 | 0.80 | 2.06 | 2.112 | 2.760 | 2.064 | 0.74 | 0.94 | 4000 | 1.102 | 1.129 |
| 9 | 4000 | 1.020 | 1.173 | 1.377 | 1.601 | 1.416 | 1.548 | 1.923 | 2.244 | 0.68 | 0.86 | 1.94 | 1.962 | 2.640 | 1.941 | 0.76 | 1.03 | 4000 | 1.017 | 1.026 |
| 10 | 4000 | 1.091 | 1.271 | 1.409 | 1.628 | 1.505 | 1.681 | 1.967 | 2.281 | 0.65 | 0.79 | 2.06 | 2.115 | 2.702 | 2.061 | 0.73 | 0.93 | 4000 | 1.068 | 1.092 |
| 11 | 4000 | 1.119 | 1.328 | 1.440 | 1.647 | 1.549 | 1.764 | 2.016 | 2.305 | 0.66 | 0.79 | 2.09 | 2.139 | 2.760 | 2.086 | 0.73 | 0.93 | 4000 | 1.122 | 1.147 |
| 12 | 4000 | 1.029 | 1.186 | 1.377 | 1.601 | 1.428 | 1.563 | 1.923 | 2.245 | 0.67 | 0.85 | 1.95 | 1.978 | 2.640 | 1.954 | 0.76 | 1.02 | 4000 | 1.039 | 1.052 |
| 13 | 4000 | 1.103 | 1.283 | 1.409 | 1.629 | 1.521 | 1.695 | 1.967 | 2.282 | 0.64 | 0.78 | 2.08 | 2.138 | 2.703 | 2.081 | 0.72 | 0.92 | 4000 | 1.113 | 1.140 |
| 14 | 4000 | 1.133 | 1.342 | 1.440 | 1.648 | 1.565 | 1.782 | 2.017 | 2.305 | 0.65 | 0.78 | 2.11 | 2.166 | 2.761 | 2.107 | 0.72 | 0.91 | 4000 | 1.119 | 1.143 |
| 15 | 4000 | 1.039 | 1.199 | 1.377 | 1.601 | 1.443 | 1.578 | 1.923 | 2.244 | 0.67 | 0.85 | 1.97 | 1.993 | 2.641 | 1.967 | 0.75 | 1.02 | 4000 | 1.050 | 1.062 |
| 16 | 4000 | 1.116 | 1.295 | 1.409 | 1.629 | 1.538 | 1.708 | 1.967 | 2.282 | 0.63 | 0.76 | 2.10 | 2.162 | 2.703 | 2.097 | 0.71 | 0.90 | 4000 | 1.111 | 1.141 |
| 17 | 4000 | 1.147 | 1.356 | 1.440 | 1.647 | 1.585 | 1.802 | 2.016 | 2.305 | 0.64 | 0.77 | 2.13 | 2.194 | 2.761 | 2.130 | 0.72 | 0.91 | 4000 | 1.130 | 1.162 |
| 18 | 4000 | 1.048 | 1.213 | 1.377 | 1.601 | 1.456 | 1.596 | 1.923 | 2.244 | 0.66 | 0.84 | 1.98 | 2.013 | 2.641 | 1.985 | 0.75 | 1.01 | 4000 | 1.042 | 1.063 |
| 19 | 4000 | 1.123 | 1.304 | 1.409 | 1.629 | 1.547 | 1.721 | 1.967 | 2.282 | 0.62 | 0.76 | 2.11 | 2.175 | 2.703 | 2.108 | 0.71 | 0.90 | 4000 | 1.113 | 1.146 |
| 20 | 4000 | 1.161 | 1.367 | 1.441 | 1.648 | 1.602 | 1.820 | 2.017 | 2.305 | 0.63 | 0.76 | 2.14 | 2.213 | 2.762 | 2.145 | 0.71 | 0.90 | 4000 | 1.183 | 1.213 |
| 21 | 4000 | 1.054 | 1.225 | 1.377 | 1.601 | 1.463 | 1.609 | 1.924 | 2.244 | 0.66 | 0.83 | 2.00 | 2.026 | 2.642 | 1.996 | 0.74 | 1.01 | 4000 | 1.063 | 1.084 |
| 22 | 4000 | 1.135 | 1.316 | 1.410 | 1.630 | 1.562 | 1.733 | 1.968 | 2.282 | 0.62 | 0.75 | 2.12 | 2.198 | 2.704 | 2.125 | 0.70 | 0.89 | 4000 | 1.106 | 1.137 |
| 23 | 4000 | 1.169 | 1.374 | 1.441 | 1.648 | 1.614 | 1.830 | 2.018 | 2.306 | 0.63 | 0.75 | 2.16 | 2.229 | 2.763 | 2.156 | 0.71 | 0.89 | 4000 | 1.144 | 1.172 |
| 24 | 4000 | 1.062 | 1.236 | 1.378 | 1.602 | 1.472 | 1.621 | 1.924 | 2.245 | 0.65 | 0.83 | 2.01 | 2.037 | 2.642 | 2.006 | 0.74 | 1.00 | 4000 | 1.060 | 1.078 |
| 25 | 4000 | 1.146 | 1.329 | 1.410 | 1.630 | 1.577 | 1.751 | 1.968 | 2.283 | 0.60 | 0.77 | 2.16 | 2.213 | 2.705 | 2.160 | 0.69 | 0.94 | 4000 | 1.133 | 1.156 |
| 26 | 4000 | 1.173 | 1.388 | 1.442 | 1.648 | 1.618 | 1.847 | 2.018 | 2.305 | 0.62 | 0.78 | 2.18 | 2.233 | 2.763 | 2.181 | 0.70 | 0.93 | 4000 | 1.209 | 1.237 |
| 27 | 4000 | 1.073 | 1.248 | 1.378 | 1.602 | 1.478 | 1.637 | 1.925 | 2.245 | 0.63 | 0.87 | 2.04 | 2.060 | 2.643 | 2.044 | 0.73 | 1.07 | 4000 | 1.062 | 1.066 |
| 28 | 4000 | 1.175 | 1.351 | 1.411 | 1.631 | 1.612 | 1.782 | 1.968 | 2.284 | 0.59 | 0.73 | 2.19 | 2.263 | 2.706 | 2.188 | 0.68 | 0.90 | 4000 | 1.173 | 1.201 |
| 29 | 4000 | 1.185 | 1.402 | 1.442 | 1.649 | 1.626 | 1.860 | 2.018 | 2.305 | 0.60 | 0.76 | 2.20 | 2.267 | 2.764 | 2.203 | 0.69 | 0.91 | 4000 | 1.178 | 1.209 |
| 30 | 4000 | 1.090 | 1.263 | 1.379 | 1.603 | 1.507 | 1.659 | 1.925 | 2.246 | 0.63 | 0.84 | 2.06 | 2.088 | 2.644 | 2.064 | 0.72 | 1.04 | 4000 | 1.071 | 1.080 |
| 31 | 4000 | 1.173 | 1.360 | 1.411 | 1.631 | 1.610 | 1.790 | 1.969 | 2.284 | 0.59 | 0.74 | 2.18 | 2.257 | 2.706 | 2.185 | 0.68 | 0.90 | 4000 | 1.164 | 1.195 |
| 32 | 4000 | 1.194 | 1.426 | 1.442 | 1.649 | 1.645 | 1.895 | 2.017 | 2.305 | 0.60 | 0.75 | 2.20 | 2.276 | 2.764 | 2.204 | 0.69 | 0.89 | 4000 | 1.181 | 1.207 |
| 33 | 4000 | 1.121 | 1.283 | 1.379 | 1.603 | 1.559 | 1.695 | 1.925 | 2.246 | 0.61 | 0.81 | 2.10 | 2.132 | 2.644 | 2.097 | 0.71 | 1.02 | 4000 | 1.128 | 1.149 |
| 34 | 4000 | 1.193 | 1.371 | 1.411 | 1.632 | 1.635 | 1.806 | 1.969 | 2.284 | 0.58 | 0.72 | 2.21 | 2.292 | 2.707 | 2.210 | 0.67 | 0.88 | 4000 | 1.177 | 1.216 |
| 35 | 4000 | 1.203 | 1.425 | 1.442 | 1.649 | 1.650 | 1.893 | 2.017 | 2.305 | 0.59 | 0.74 | 2.22 | 2.297 | 2.764 | 2.224 | 0.68 | 0.90 | 4000 | 1.179 | 1.209 |
| 36 | 4000 | 1.129 | 1.295 | 1.379 | 1.603 | 1.568 | 1.711 | 1.925 | 2.246 | 0.60 | 0.80 | 2.12 | 2.156 | 2.644 | 2.118 | 0.70 | 1.01 | 4000 | 1.152 | 1.171 |
| 37 | 4000 | 1.181 | 1.371 | 1.411 | 1.632 | 1.622 | 1.803 | 1.968 | 2.284 | 0.58 | 0.73 | 2.20 | 2.272 | 2.707 | 2.199 | 0.68 | 0.89 | 4000 | 1.177 | 1.203 |
| 38 | 4000 | 1.204 | 1.438 | 1.441 | 1.649 | 1.659 | 1.916 | 2.017 | 2.305 | 0.60 | 0.74 | 2.22 | 2.290 | 2.764 | 2.220 | 0.68 | 0.89 | 4000 | 1.210 | 1.235 |
| 39 | 4000 | 1.127 | 1.301 | 1.378 | 1.603 | 1.566 | 1.714 | 1.924 | 2.246 | 0.60 | 0.81 | 2.11 | 2.149 | 2.644 | 2.114 | 0.70 | 1.02 | 4000 | 1.139 | 1.156 |
| 40 | 4000 | 1.204 | 1.384 | 1.411 | 1.632 | 1.651 | 1.820 | 1.968 | 2.284 | 0.56 | 0.71 | 2.23 | 2.315 | 2.707 | 2.231 | 0.66 | 0.88 | 4000 | 1.174 | 1.210 |
| 41 | 4000 | 1.209 | 1.435 | 1.441 | 1.649 | 1.661 | 1.906 | 2.016 | 2.305 | 0.59 | 0.75 | 2.23 | 2.301 | 2.764 | 2.233 | 0.68 | 0.90 | 4000 | 1.186 | 1.217 |
| 42 | 4000 | 1.136 | 1.314 | 1.378 | 1.603 | 1.570 | 1.732 | 1.923 | 2.246 | 0.59 | 0.79 | 2.13 | 2.172 | 2.644 | 2.134 | 0.70 | 1.01 | 4000 | 1.135 | 1.156 |
| 43 | 4000 | 1.195 | 1.388 | 1.411 | 1.632 | 1.639 | 1.825 | 1.968 | 2.285 | 0.57 | 0.73 | 2.22 | 2.297 | 2.707 | 2.222 | 0.67 | 0.89 | 4000 | 1.187 | 1.214 |
| 44 | 4000 | 1.224 | 1.461 | 1.442 | 1.649 | 1.685 | 1.946 | 2.016 | 2.305 | 0.58 | 0.73 | 2.25 | 2.328 | 2.765 | 2.251 | 0.67 | 0.88 | 4000 | 1.220 | 1.250 |
| 45 | 4000 | 1.140 | 1.322 | 1.379 | 1.603 | 1.580 | 1.742 | 1.924 | 2.246 | 0.59 | 0.80 | 2.13 | 2.172 | 2.645 | 2.135 | 0.70 | 1.01 | 4000 | 1.153 | 1.170 |
| 46 | 4000 | 1.215 | 1.398 | 1.411 | 1.632 | 1.665 | 1.841 | 1.968 | 2.285 | 0.56 | 0.71 | 2.24 | 2.327 | 2.707 | 2.243 | 0.66 | 0.88 | 4000 | 1.190 | 1.222 |
| 47 | 4000 | 1.240 | 1.466 | 1.442 | 1.650 | 1.700 | 1.952 | 2.017 | 2.306 | 0.57 | 0.72 | 2.28 | 2.359 | 2.766 | 2.277 | 0.66 | 0.88 | 4000 | 1.230 | 1.264 |
| 48 | 4000 | 1.150 | 1.335 | 1.379 | 1.604 | 1.591 | 1.762 | 1.925 | 2.247 | 0.58 | 0.79 | 2.15 | 2.192 | 2.646 | 2.152 | 0.69 | 1.01 | 4000 | 1.164 | 1.184 |
| 51 | 4000 | 1.229 | 1.391 | 1.614 | 1.867 | 1.702 | 1.860 | 2.284 | 2.643 | 0.67 | 0.88 | 2.29 | 2.308 | 3.092 | 2.292 | 0.75 | 1.03 | 4000 | 1.237 | 1.241 |
| 54 | 4000 | 1.231 | 1.404 | 1.564 | 1.842 | 1.706 | 1.874 | 2.211 | 2.642 | 0.63 | 0.86 | 2.31 | 2.326 | 2.973 | 2.306 | 0.73 | 1.01 | 4000 | 1.246 | 1.255 |
| 57 | 4000 | 1.242 | 1.412 | 1.615 | 1.867 | 1.721 | 1.888 | 2.284 | 2.643 | 0.66 | 0.88 | 2.31 | 2.333 | 3.093 | 2.315 | 0.75 | 1.02 | 4000 | 1.278 | 1.281 |
| 60 | 4000 | 1.244 | 1.423 | 1.564 | 1.842 | 1.723 | 1.902 | 2.211 | 2.642 | 0.62 | 0.85 | 2.33 | 2.353 | 2.973 | 2.331 | 0.72 | 1.00 | 4000 | 1.245 | 1.244 |
| 63 | 4000 | 1.261 | 1.434 | 1.614 | 1.866 | 1.746 | 1.921 | 2.284 | 2.642 | 0.65 | 0.86 | 2.35 | 2.373 | 3.092 | 2.351 | 0.74 | 1.01 | 4000 | 1.267 | 1.272 |
| 66 | 4000 | 1.256 | 1.441 | 1.564 | 1.842 | 1.739 | 1.929 | 2.211 | 2.642 | 0.61 | 0.84 | 2.35 | 2.378 | 2.972 | 2.353 | 0.72 | 0.99 | 4000 | 1.260 | 1.270 |
| 69 | 4000 | 1.280 | 1.459 | 1.614 | 1.867 | 1.773 | 1.962 | 2.284 | 2.643 | 0.64 | 0.85 | 2.38 | 2.404 | 3.092 | 2.380 | 0.73 | 1.01 | 4000 | 1.314 | 1.322 |
| 72 | 4000 | 1.276 | 1.465 | 1.564 | 1.843 | 1.768 | 1.970 | 2.211 | 2.642 | 0.60 | 0.83 | 2.38 | 2.413 | 2.974 | 2.384 | 0.71 | 0.98 | 4000 | 1.294 | 1.302 |
| 75 | 4000 | 1.301 | 1.483 | 1.615 | 1.867 | 1.802 | 2.002 | 2.285 | 2.643 | 0.62 | 0.84 | 2.42 | 2.445 | 3.093 | 2.415 | 0.72 | 0.99 | 4000 | 1.326 | 1.344 |
| 78 | 4000 | 1.297 | 1.486 | 1.564 | 1.843 | 1.796 | 2.007 | 2.211 | 2.642 | 0.58 | 0.81 | 2.41 | 2.450 | 2.973 | 2.414 | 0.70 | 0.96 | 4000 | 1.297 | 1.309 |
| 81 | 4000 | 1.322 | 1.506 | 1.615 | 1.867 | 1.831 | 2.038 | 2.285 | 2.643 | 0.61 | 0.82 | 2.45 | 2.482 | 3.094 | 2.447 | 0.71 | 0.98 | 4000 | 1.334 | 1.347 |
| 84 | 4000 | 1.320 | 1.508 | 1.565 | 1.843 | 1.829 | 2.043 | 2.212 | 2.643 | 0.57 | 0.79 | 2.45 | 2.490 | 2.974 | 2.447 | 0.69 | 0.95 | 4000 | 1.308 | 1.326 |
| 87 | 4000 | 1.360 | 1.537 | 1.615 | 1.867 | 1.885 | 2.089 | 2.285 | 2.643 | 0.59 | 0.79 | 2.50 | 2.544 | 3.094 | 2.495 | 0.69 | 0.94 | 4000 | 1.372 | 1.393 |
| 90 | 4000 | 1.351 | 1.540 | 1.564 | 1.843 | 1.875 | 2.099 | 2.211 | 2.642 | 0.55 | 0.75 | 2.48 | 2.541 | 2.974 | 2.484 | 0.67 | 0.92 | 4000 | 1.388 | 1.413 |
| 93 | 4000 | 1.382 | 1.557 | 1.616 | 1.868 | 1.912 | 2.120 | 2.286 | 2.644 | 0.58 | 0.77 | 2.53 | 2.587 | 3.095 | 2.529 | 0.68 | 0.93 | 4000 | 1.388 | 1.409 |
| 96 | 4000 | 1.374 | 1.562 | 1.565 | 1.843 | 1.906 | 2.136 | 2.212 | 2.643 | 0.53 | 0.73 | 2.52 | 2.583 | 2.974 | 2.517 | 0.66 | 0.90 | 4000 | 1.356 | 1.380 |
| 99 | 4000 | 1.414 | 1.581 | 1.616 | 1.868 | 1.954 | 2.158 | 2.287 | 2.645 | 0.56 | 0.74 | 2.57 | 2.643 | 3.095 | 2.573 | 0.66 | 0.91 | 4000 | 1.450 | 1.480 |
| 102 | 4000 | 1.396 | 1.581 | 1.565 | 1.843 | 1.933 | 2.166 | 2.212 | 2.643 | 0.52 | 0.71 | 2.55 | 2.622 | 2.974 | 2.547 | 0.65 | 0.89 | 4000 | 1.382 | 1.415 |
| 105 | 4000 | 1.442 | 1.604 | 1.616 | 1.868 | 1.989 | 2.192 | 2.287 | 2.645 | 0.53 | 0.71 | 2.62 | 2.698 | 3.095 | 2.615 | 0.65 | 0.89 | 4000 | 1.423 | 1.459 |
| 108 | 4000 | 1.416 | 1.598 | 1.564 | 1.843 | 1.958 | 2.192 | 2.211 | 2.643 | 0.50 | 0.69 | 2.58 | 2.661 | 2.974 | 2.578 | 0.63 | 0.88 | 4000 | 1.413 | 1.445 |
| 111 | 4000 | 1.469 | 1.625 | 1.616 | 1.868 | 2.026 | 2.224 | 2.287 | 2.645 | 0.51 | 0.69 | 2.65 | 2.747 | 3.096 | 2.652 | 0.63 | 0.87 | 4000 | 1.423 | 1.460 |
| 114 | 4000 | 1.440 | 1.618 | 1.565 | 1.843 | 1.990 | 2.223 | 2.212 | 2.643 | 0.48 | 0.67 | 2.61 | 2.705 | 2.974 | 2.610 | 0.62 | 0.86 | 4000 | 1.458 | 1.491 |
| 117 | 4000 | 1.500 | 1.647 | 1.616 | 1.868 | 2.066 | 2.260 | 2.287 | 2.645 | 0.49 | 0.66 | 2.69 | 2.800 | 3.096 | 2.689 | 0.61 | 0.85 | 4000 | 1.465 | 1.510 |
| 120 | 4000 | 1.462 | 1.634 | 1.565 | 1.843 | 2.018 | 2.248 | 2.212 | 2.644 | 0.46 | 0.64 | 2.64 | 2.745 | 2.974 | 2.637 | 0.61 | 0.84 | 4000 | 1.440 | 1.480 |
| 126 | 4000 | 1.459 | 1.560 | 1.512 | 1.802 | 1.996 | 2.098 | 2.128 | 2.584 | 0.34 | 0.68 | 2.68 | 2.721 | 2.862 | 2.681 | 0.57 | 1.08 | 4000 | 1.463 | 1.471 |
| 132 | 4000 | 1.563 | 1.737 | 1.614 | 1.883 | 2.175 | 2.388 | 2.291 | 2.700 | 0.35 | 0.67 | 2.88 | 2.927 | 3.076 | 2.878 | 0.55 | 1.01 | 4000 | 1.592 | 1.621 |
| 138 | 4000 | 1.491 | 1.611 | 1.515 | 1.804 | 2.046 | 2.186 | 2.132 | 2.587 | 0.31 | 0.61 | 2.72 | 2.778 | 2.868 | 2.719 | 0.54 | 1.03 | 4000 | 1.529 | 1.536 |
| 144 | 4000 | 1.592 | 1.791 | 1.615 | 1.885 | 2.218 | 2.466 | 2.292 | 2.703 | 0.32 | 0.60 | 2.92 | 2.988 | 3.078 | 2.916 | 0.53 | 0.96 | 4000 | 1.602 | 1.649 |
| 150 | 4000 | 1.510 | 1.677 | 1.514 | 1.803 | 2.093 | 2.313 | 2.130 | 2.585 | 0.29 | 0.59 | 2.74 | 2.803 | 2.867 | 2.740 | 0.53 | 1.05 | 4000 | 1.488 | 1.508 |
| 156 | 4000 | 1.632 | 1.869 | 1.615 | 1.884 | 2.283 | 2.598 | 2.292 | 2.702 | 0.27 | 0.52 | 2.96 | 3.057 | 3.077 | 2.958 | 0.50 | 0.91 | 4000 | 1.625 | 1.676 |
| 162 | 4000 | 1.545 | 1.717 | 1.515 | 1.804 | 2.140 | 2.375 | 2.132 | 2.586 | 0.24 | 0.50 | 2.78 | 2.871 | 2.868 | 2.779 | 0.49 | 0.99 | 4000 | 1.548 | 1.590 |
| 168 | 4000 | 1.653 | 1.891 | 1.615 | 1.884 | 2.314 | 2.634 | 2.291 | 2.701 | 0.25 | 0.47 | 2.98 | 3.099 | 3.077 | 2.979 | 0.48 | 0.88 | 4000 | 1.650 | 1.701 |
| 174 | 4000 | 1.559 | 1.735 | 1.514 | 1.803 | 2.154 | 2.402 | 2.131 | 2.586 | 0.22 | 0.45 | 2.79 | 2.902 | 2.868 | 2.794 | 0.48 | 0.96 | 4000 | 1.539 | 1.599 |
| 180 | 4000 | 1.672 | 1.917 | 1.616 | 1.886 | 2.341 | 2.672 | 2.293 | 2.704 | 0.22 | 0.43 | 3.00 | 3.137 | 3.079 | 3.000 | 0.46 | 0.85 | 4000 | 1.659 | 1.731 |
| 186 | 4000 | 1.608 | 1.782 | 1.516 | 1.805 | 2.232 | 2.491 | 2.134 | 2.588 | 0.20 | 0.37 | 2.81 | 2.977 | 2.870 | 2.813 | 0.44 | 0.85 | 4000 | 1.534 | 1.630 |
| 192 | 4000 | 1.737 | 1.991 | 1.616 | 1.886 | 2.445 | 2.797 | 2.293 | 2.704 | 0.18 | 0.33 | 3.03 | 3.238 | 3.079 | 3.028 | 0.43 | 0.75 | 4000 | 1.705 | 1.805 |
| 198 | 4000 | 1.636 | 1.820 | 1.516 | 1.804 | 2.272 | 2.545 | 2.133 | 2.587 | 0.16 | 0.30 | 2.83 | 3.029 | 2.870 | 2.832 | 0.42 | 0.81 | 4000 | 1.544 | 1.640 |
| 204 | 4000 | 1.761 | 2.032 | 1.618 | 1.888 | 2.472 | 2.848 | 2.295 | 2.706 | 0.15 | 0.28 | 3.05 | 3.283 | 3.082 | 3.046 | 0.41 | 0.72 | 4000 | 1.679 | 1.798 |
| 210 | 4000 | 1.655 | 1.853 | 1.516 | 1.805 | 2.295 | 2.597 | 2.134 | 2.589 | 0.14 | 0.26 | 2.84 | 3.061 | 2.871 | 2.842 | 0.40 | 0.78 | 4000 | 1.565 | 1.674 |
| 216 | 4000 | 1.782 | 2.068 | 1.617 | 1.887 | 2.495 | 2.889 | 2.294 | 2.705 | 0.13 | 0.23 | 3.06 | 3.329 | 3.080 | 3.056 | 0.38 | 0.68 | 4000 | 1.731 | 1.857 |
| 222 | 4000 | 1.667 | 1.878 | 1.513 | 1.803 | 2.309 | 2.633 | 2.129 | 2.585 | 0.12 | 0.22 | 2.85 | 3.085 | 2.866 | 2.846 | 0.38 | 0.76 | 4000 | 1.571 | 1.693 |
| 228 | 4000 | 1.794 | 2.081 | 1.617 | 1.887 | 2.504 | 2.905 | 2.294 | 2.705 | 0.11 | 0.20 | 3.06 | 3.354 | 3.080 | 3.061 | 0.37 | 0.66 | 4000 | 1.676 | 1.806 |
| 234 | 4000 | 1.674 | 1.881 | 1.516 | 1.805 | 2.314 | 2.637 | 2.133 | 2.588 | 0.10 | 0.19 | 2.85 | 3.107 | 2.870 | 2.855 | 0.37 | 0.74 | 4000 | 1.545 | 1.672 |
| 240 | 4000 | 1.802 | 2.088 | 1.619 | 1.889 | 2.515 | 2.923 | 2.297 | 2.707 | 0.09 | 0.17 | 3.07 | 3.374 | 3.085 | 3.071 | 0.36 | 0.65 | 4000 | 1.705 | 1.846 |
| 246 | 4000 | 1.677 | 1.887 | 1.516 | 1.806 | 2.334 | 2.648 | 2.132 | 2.589 | 0.03 | 0.09 | 2.87 | 3.114 | 2.871 | 2.868 | 0.35 | 0.82 | 4000 | 1.597 | 1.744 |
| 252 | 4000 | 1.803 | 2.092 | 1.620 | 1.889 | 2.530 | 2.932 | 2.297 | 2.707 | 0.04 | 0.09 | 3.08 | 3.374 | 3.085 | 3.082 | 0.34 | 0.68 | 4000 | 1.636 | 1.779 |
| 258 | 4000 | 1.681 | 1.899 | 1.517 | 1.805 | 2.341 | 2.666 | 2.133 | 2.589 | 0.03 | 0.08 | 2.87 | 3.120 | 2.871 | 2.870 | 0.34 | 0.81 | 4000 | 1.551 | 1.668 |
| 264 | 4000 | 1.804 | 2.111 | 1.619 | 1.888 | 2.532 | 2.962 | 2.296 | 2.707 | 0.04 | 0.08 | 3.08 | 3.374 | 3.084 | 3.081 | 0.34 | 0.68 | 4000 | 1.719 | 1.840 |
| 270 | 4000 | 1.684 | 1.909 | 1.517 | 1.806 | 2.348 | 2.685 | 2.134 | 2.590 | 0.02 | 0.07 | 2.87 | 3.123 | 2.872 | 2.871 | 0.34 | 0.80 | 4000 | 1.591 | 1.738 |
| 276 | 4000 | 1.812 | 2.136 | 1.620 | 1.889 | 2.542 | 2.998 | 2.298 | 2.708 | 0.03 | 0.07 | 3.08 | 3.387 | 3.086 | 3.085 | 0.33 | 0.67 | 4000 | 1.690 | 1.834 |
| 282 | 4000 | 1.692 | 1.928 | 1.517 | 1.807 | 2.358 | 2.712 | 2.135 | 2.591 | 0.01 | 0.05 | 2.87 | 3.138 | 2.873 | 2.872 | 0.33 | 0.78 | 4000 | 1.561 | 1.709 |
| 288 | 4000 | 1.817 | 2.141 | 1.619 | 1.889 | 2.552 | 3.002 | 2.296 | 2.708 | 0.02 | 0.06 | 3.08 | 3.396 | 3.084 | 3.083 | 0.33 | 0.66 | 4000 | 1.656 | 1.800 |
| 294 | 4000 | 1.698 | 1.937 | 1.517 | 1.806 | 2.365 | 2.722 | 2.134 | 2.590 | 0.00 | 0.03 | 2.87 | 3.150 | 2.872 | 2.872 | 0.32 | 0.76 | 4000 | 1.587 | 1.736 |
| 300 | 4000 | 1.825 | 2.161 | 1.620 | 1.889 | 2.564 | 3.026 | 2.297 | 2.707 | 0.02 | 0.05 | 3.09 | 3.414 | 3.087 | 3.086 | 0.32 | 0.64 | 4000 | 1.676 | 1.829 |
| 306 | 4000 | 1.709 | 1.953 | 1.518 | 1.807 | 2.387 | 2.751 | 2.136 | 2.591 | -0.01 | 0.01 | 2.87 | 3.167 | 2.875 | 2.875 | 0.31 | 0.74 | 4000 | 1.605 | 1.766 |
| 312 | 4000 | 1.833 | 2.175 | 1.621 | 1.890 | 2.574 | 3.047 | 2.299 | 2.710 | 0.01 | 0.03 | 3.09 | 3.426 | 3.089 | 3.088 | 0.31 | 0.63 | 4000 | 1.685 | 1.837 |
| 318 | 4000 | 1.705 | 1.958 | 1.519 | 1.807 | 2.381 | 2.764 | 2.137 | 2.592 | -0.00 | 0.01 | 2.88 | 3.162 | 2.876 | 2.875 | 0.32 | 0.75 | 4000 | 1.569 | 1.714 |
| 324 | 4000 | 1.830 | 2.172 | 1.621 | 1.890 | 2.571 | 3.047 | 2.299 | 2.708 | 0.01 | 0.04 | 3.09 | 3.419 | 3.089 | 3.088 | 0.32 | 0.63 | 4000 | 1.734 | 1.861 |
| 330 | 4000 | 1.705 | 1.950 | 1.518 | 1.807 | 2.379 | 2.749 | 2.136 | 2.591 | -0.00 | 0.01 | 2.87 | 3.162 | 2.874 | 2.874 | 0.32 | 0.74 | 4000 | 1.563 | 1.710 |
| 336 | 4000 | 1.830 | 2.176 | 1.622 | 1.891 | 2.572 | 3.051 | 2.301 | 2.711 | 0.01 | 0.04 | 3.09 | 3.422 | 3.091 | 3.090 | 0.32 | 0.63 | 4000 | 1.709 | 1.885 |

Erste Vorlaufstunde mit CRPS fl-K > Klima (Station): **156**; letzte Stunde mit fl-K < Klima: 150.

Je Bin (gust) — Summen der Stunden, b/σ_b je Bin in-sample; CRPS Misch. auf den vereinigten Stichproben der Stunden:

| Bin | n | CRPS K | Cube | Klima | Pool | MAE K | Klima | ρ | b | σ_b | RMSE K | Klima | Misch. | n_S | CRPS Misch. Stat | Pool |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0–6 | 24000 | 1.033 | 1.226 | 1.567 | 1.803 | 1.430 | 2.214 | 0.76 | 0.89 | 1.97 | 1.996 | 3.014 | 1.974 | 24000 | 1.048 | 1.060 |
| 7–24 | 72000 | 1.096 | 1.280 | 1.409 | 1.626 | 1.515 | 1.969 | 0.65 | 0.80 | 2.06 | 2.108 | 2.702 | 2.060 | 72000 | 1.093 | 1.118 |
| 25–48 | 96000 | 1.170 | 1.364 | 1.410 | 1.628 | 1.611 | 1.970 | 0.59 | 0.76 | 2.18 | 2.238 | 2.705 | 2.181 | 96000 | 1.167 | 1.193 |
| 51–120 | 96000 | 1.344 | 1.520 | 1.591 | 1.856 | 1.861 | 2.250 | 0.58 | 0.78 | 2.48 | 2.530 | 3.037 | 2.482 | 96000 | 1.352 | 1.371 |
| 126–240 | 80000 | 1.641 | 1.851 | 1.567 | 1.846 | 2.283 | 2.214 | 0.21 | 0.40 | 2.91 | 3.064 | 2.978 | 2.912 | 80000 | 1.606 | 1.684 |
| 246–336 | 64000 | 1.758 | 2.039 | 1.570 | 1.849 | 2.461 | 2.218 | 0.02 | 0.05 | 2.98 | 3.278 | 2.985 | 2.984 | 64000 | 1.634 | 1.781 |

### clct

| Vorlauf h | n | CRPS K | Cube | Klima | Pool | MAE K | Cube | Klima | Pool | ρ | b | σ_b | RMSE K | RMSE Klima | RMSE Misch. | ρ Pool | b Pool | n_S | CRPS Misch. Stat | Pool |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 4000 | 11.536 | 13.646 | 20.972 | 21.204 | 16.359 | 19.612 | 32.271 | 32.561 | 0.77 | 0.97 | 24.13 | 24.149 | 38.160 | 24.130 | 0.78 | 0.98 | 4000 | 11.954 | 11.929 |
| 2 | 4000 | 11.904 | 14.138 | 21.330 | 21.561 | 16.852 | 20.328 | 32.945 | 33.187 | 0.76 | 0.96 | 25.00 | 25.036 | 38.732 | 25.002 | 0.77 | 0.97 | 4000 | 12.138 | 12.104 |
| 3 | 4000 | 13.215 | 16.186 | 23.644 | 24.003 | 19.187 | 23.635 | 37.317 | 37.810 | 0.77 | 0.99 | 26.25 | 26.249 | 41.155 | 26.247 | 0.77 | 1.00 | 4000 | 13.692 | 13.662 |
| 4 | 4000 | 13.227 | 16.108 | 23.515 | 23.831 | 18.826 | 22.949 | 37.064 | 37.435 | 0.75 | 0.93 | 26.75 | 26.846 | 40.910 | 26.750 | 0.76 | 0.94 | 4000 | 13.906 | 13.891 |
| 5 | 4000 | 13.708 | 16.535 | 23.630 | 23.994 | 19.527 | 23.536 | 37.351 | 37.790 | 0.74 | 0.91 | 27.65 | 27.830 | 41.088 | 27.653 | 0.74 | 0.92 | 4000 | 14.444 | 14.414 |
| 6 | 4000 | 13.503 | 16.477 | 23.648 | 24.008 | 19.575 | 24.041 | 37.321 | 37.814 | 0.76 | 0.97 | 26.93 | 26.955 | 41.162 | 26.935 | 0.76 | 0.97 | 4000 | 13.885 | 13.855 |
| 7 | 4000 | 13.867 | 16.381 | 23.524 | 23.839 | 20.087 | 23.334 | 37.076 | 37.447 | 0.74 | 0.98 | 27.31 | 27.322 | 40.923 | 27.312 | 0.75 | 0.99 | 4000 | 14.058 | 14.022 |
| 8 | 4000 | 14.308 | 16.820 | 23.641 | 24.005 | 20.795 | 24.001 | 37.368 | 37.808 | 0.72 | 0.95 | 28.27 | 28.308 | 41.103 | 28.267 | 0.73 | 0.96 | 4000 | 14.683 | 14.635 |
| 9 | 4000 | 14.357 | 16.770 | 23.656 | 24.017 | 21.230 | 24.474 | 37.332 | 37.826 | 0.74 | 1.01 | 27.74 | 27.744 | 41.175 | 27.740 | 0.75 | 1.02 | 4000 | 14.619 | 14.581 |
| 10 | 4000 | 14.072 | 16.638 | 23.533 | 23.848 | 20.407 | 23.712 | 37.090 | 37.462 | 0.73 | 0.96 | 27.77 | 27.793 | 40.937 | 27.766 | 0.74 | 0.97 | 4000 | 14.732 | 14.703 |
| 11 | 4000 | 14.708 | 17.247 | 23.649 | 24.013 | 21.414 | 24.592 | 37.380 | 37.820 | 0.70 | 0.92 | 29.09 | 29.184 | 41.115 | 29.085 | 0.71 | 0.94 | 4000 | 15.093 | 15.053 |
| 12 | 4000 | 14.635 | 17.089 | 23.663 | 24.023 | 21.638 | 24.910 | 37.342 | 37.835 | 0.73 | 0.99 | 28.38 | 28.383 | 41.186 | 28.383 | 0.73 | 1.00 | 4000 | 15.028 | 14.993 |
| 13 | 4000 | 14.372 | 16.988 | 23.534 | 23.850 | 20.803 | 24.159 | 37.090 | 37.464 | 0.72 | 0.94 | 28.41 | 28.472 | 40.939 | 28.413 | 0.72 | 0.95 | 4000 | 14.900 | 14.870 |
| 14 | 4000 | 14.962 | 17.568 | 23.653 | 24.016 | 21.739 | 24.970 | 37.384 | 37.824 | 0.69 | 0.91 | 29.59 | 29.737 | 41.121 | 29.593 | 0.70 | 0.92 | 4000 | 15.331 | 15.284 |
| 15 | 4000 | 14.894 | 17.468 | 23.671 | 24.031 | 22.082 | 25.433 | 37.353 | 37.846 | 0.71 | 0.99 | 28.90 | 28.906 | 41.197 | 28.903 | 0.72 | 1.00 | 4000 | 15.172 | 15.134 |
| 16 | 4000 | 14.611 | 17.311 | 23.539 | 23.856 | 21.188 | 24.608 | 37.097 | 37.472 | 0.70 | 0.93 | 28.88 | 28.967 | 40.947 | 28.883 | 0.71 | 0.94 | 4000 | 14.908 | 14.878 |
| 17 | 4000 | 15.263 | 17.916 | 23.655 | 24.017 | 22.227 | 25.455 | 37.384 | 37.823 | 0.68 | 0.89 | 30.10 | 30.289 | 41.125 | 30.099 | 0.68 | 0.91 | 4000 | 15.912 | 15.878 |
| 18 | 4000 | 15.104 | 17.743 | 23.673 | 24.032 | 22.466 | 25.835 | 37.355 | 37.847 | 0.70 | 0.97 | 29.31 | 29.321 | 41.201 | 29.310 | 0.71 | 0.98 | 4000 | 15.553 | 15.519 |
| 19 | 4000 | 15.069 | 17.793 | 23.542 | 23.859 | 21.882 | 25.241 | 37.102 | 37.477 | 0.68 | 0.90 | 29.74 | 29.892 | 40.951 | 29.741 | 0.69 | 0.91 | 4000 | 15.635 | 15.614 |
| 20 | 4000 | 15.538 | 18.217 | 23.655 | 24.016 | 22.604 | 25.885 | 37.383 | 37.819 | 0.66 | 0.87 | 30.61 | 30.867 | 41.126 | 30.613 | 0.67 | 0.89 | 4000 | 16.021 | 15.992 |
| 21 | 4000 | 15.298 | 18.005 | 23.674 | 24.032 | 22.787 | 26.251 | 37.354 | 37.845 | 0.69 | 0.96 | 29.68 | 29.698 | 41.202 | 29.679 | 0.70 | 0.97 | 4000 | 15.713 | 15.678 |
| 22 | 4000 | 15.239 | 17.997 | 23.544 | 23.860 | 22.146 | 25.556 | 37.105 | 37.480 | 0.67 | 0.89 | 30.04 | 30.223 | 40.953 | 30.039 | 0.68 | 0.90 | 4000 | 15.541 | 15.523 |
| 23 | 4000 | 15.757 | 18.472 | 23.661 | 24.021 | 22.933 | 26.244 | 37.393 | 37.827 | 0.65 | 0.86 | 31.00 | 31.327 | 41.134 | 31.004 | 0.66 | 0.87 | 4000 | 16.690 | 16.660 |
| 24 | 4000 | 15.542 | 18.268 | 23.681 | 24.039 | 23.079 | 26.608 | 37.365 | 37.855 | 0.68 | 0.94 | 30.20 | 30.249 | 41.214 | 30.199 | 0.69 | 0.95 | 4000 | 16.080 | 16.050 |
| 25 | 4000 | 16.432 | 18.338 | 23.545 | 23.860 | 24.691 | 26.066 | 37.105 | 37.478 | 0.65 | 1.03 | 30.93 | 30.941 | 40.955 | 30.928 | 0.66 | 1.05 | 4000 | 16.938 | 16.875 |
| 26 | 4000 | 16.802 | 18.748 | 23.670 | 24.029 | 25.373 | 26.652 | 37.408 | 37.842 | 0.63 | 1.00 | 31.73 | 31.726 | 41.147 | 31.726 | 0.64 | 1.03 | 4000 | 17.210 | 17.133 |
| 27 | 4000 | 16.887 | 18.532 | 23.691 | 24.046 | 25.984 | 26.988 | 37.380 | 37.867 | 0.66 | 1.09 | 31.15 | 31.237 | 41.228 | 31.153 | 0.67 | 1.11 | 4000 | 16.707 | 16.627 |
| 28 | 4000 | 16.659 | 18.604 | 23.552 | 23.865 | 24.734 | 26.059 | 37.116 | 37.486 | 0.62 | 0.93 | 31.81 | 31.866 | 40.966 | 31.807 | 0.63 | 0.94 | 4000 | 17.320 | 17.285 |
| 29 | 4000 | 16.986 | 18.942 | 23.675 | 24.034 | 25.348 | 26.580 | 37.414 | 37.848 | 0.61 | 0.91 | 32.42 | 32.516 | 41.156 | 32.417 | 0.62 | 0.93 | 4000 | 17.471 | 17.424 |
| 30 | 4000 | 16.842 | 18.582 | 23.700 | 24.054 | 25.815 | 27.032 | 37.396 | 37.879 | 0.65 | 1.06 | 31.39 | 31.426 | 41.242 | 31.394 | 0.66 | 1.07 | 4000 | 16.941 | 16.881 |
| 31 | 4000 | 16.677 | 18.677 | 23.561 | 23.875 | 24.841 | 26.245 | 37.132 | 37.503 | 0.62 | 0.93 | 31.81 | 31.864 | 40.980 | 31.812 | 0.63 | 0.95 | 4000 | 16.963 | 16.925 |
| 32 | 4000 | 17.061 | 19.074 | 23.675 | 24.028 | 25.556 | 26.870 | 37.413 | 37.839 | 0.61 | 0.91 | 32.50 | 32.600 | 41.154 | 32.497 | 0.62 | 0.93 | 4000 | 17.763 | 17.717 |
| 33 | 4000 | 16.980 | 18.777 | 23.712 | 24.066 | 25.930 | 27.264 | 37.418 | 37.901 | 0.63 | 1.01 | 31.92 | 31.921 | 41.259 | 31.920 | 0.64 | 1.03 | 4000 | 17.645 | 17.593 |
| 34 | 4000 | 16.875 | 18.922 | 23.577 | 23.888 | 25.123 | 26.584 | 37.162 | 37.530 | 0.61 | 0.91 | 32.19 | 32.289 | 41.002 | 32.193 | 0.62 | 0.92 | 4000 | 17.561 | 17.526 |
| 35 | 4000 | 17.374 | 19.468 | 23.695 | 24.048 | 25.984 | 27.351 | 37.449 | 37.873 | 0.59 | 0.87 | 33.10 | 33.294 | 41.184 | 33.102 | 0.60 | 0.89 | 4000 | 18.311 | 18.283 |
| 36 | 4000 | 17.121 | 19.037 | 23.716 | 24.066 | 26.218 | 27.660 | 37.426 | 37.907 | 0.63 | 1.02 | 32.10 | 32.101 | 41.263 | 32.097 | 0.64 | 1.04 | 4000 | 17.776 | 17.720 |
| 37 | 4000 | 17.061 | 19.188 | 23.582 | 23.890 | 25.464 | 27.036 | 37.173 | 37.538 | 0.60 | 0.90 | 32.53 | 32.654 | 41.008 | 32.527 | 0.61 | 0.91 | 4000 | 17.695 | 17.665 |
| 38 | 4000 | 17.542 | 19.638 | 23.693 | 24.047 | 26.236 | 27.591 | 37.450 | 37.878 | 0.58 | 0.86 | 33.41 | 33.645 | 41.180 | 33.411 | 0.59 | 0.88 | 4000 | 18.203 | 18.185 |
| 39 | 4000 | 17.313 | 19.252 | 23.713 | 24.063 | 26.411 | 27.942 | 37.423 | 37.903 | 0.61 | 0.98 | 32.65 | 32.657 | 41.259 | 32.652 | 0.62 | 0.99 | 4000 | 17.679 | 17.628 |
| 40 | 4000 | 17.227 | 19.326 | 23.581 | 23.889 | 25.608 | 27.160 | 37.175 | 37.540 | 0.59 | 0.88 | 32.86 | 33.028 | 41.007 | 32.860 | 0.60 | 0.89 | 4000 | 17.772 | 17.745 |
| 41 | 4000 | 17.599 | 19.725 | 23.686 | 24.039 | 26.292 | 27.749 | 37.434 | 37.860 | 0.58 | 0.85 | 33.50 | 33.757 | 41.170 | 33.505 | 0.58 | 0.87 | 4000 | 18.279 | 18.256 |
| 42 | 4000 | 17.439 | 19.465 | 23.708 | 24.058 | 26.690 | 28.263 | 37.417 | 37.896 | 0.61 | 1.00 | 32.75 | 32.746 | 41.251 | 32.746 | 0.61 | 1.01 | 4000 | 17.946 | 17.893 |
| 43 | 4000 | 17.410 | 19.590 | 23.562 | 23.871 | 25.965 | 27.553 | 37.142 | 37.509 | 0.58 | 0.87 | 33.16 | 33.351 | 40.977 | 33.159 | 0.59 | 0.88 | 4000 | 18.135 | 18.115 |
| 44 | 4000 | 17.739 | 19.844 | 23.663 | 24.015 | 26.542 | 27.936 | 37.399 | 37.823 | 0.57 | 0.84 | 33.75 | 34.024 | 41.136 | 33.746 | 0.57 | 0.86 | 4000 | 18.666 | 18.657 |
| 45 | 4000 | 17.619 | 19.608 | 23.706 | 24.055 | 26.934 | 28.501 | 37.412 | 37.890 | 0.59 | 0.95 | 33.21 | 33.232 | 41.249 | 33.211 | 0.60 | 0.97 | 4000 | 18.213 | 18.167 |
| 46 | 4000 | 17.607 | 19.808 | 23.556 | 23.865 | 26.310 | 27.884 | 37.130 | 37.498 | 0.57 | 0.86 | 33.49 | 33.723 | 40.968 | 33.488 | 0.58 | 0.87 | 4000 | 18.066 | 18.043 |
| 47 | 4000 | 17.934 | 20.126 | 23.662 | 24.013 | 26.840 | 28.336 | 37.396 | 37.819 | 0.56 | 0.83 | 34.03 | 34.349 | 41.133 | 34.030 | 0.56 | 0.85 | 4000 | 18.470 | 18.436 |
| 48 | 4000 | 17.735 | 19.780 | 23.702 | 24.050 | 27.195 | 28.740 | 37.404 | 37.882 | 0.58 | 0.97 | 33.36 | 33.372 | 41.242 | 33.362 | 0.59 | 0.99 | 4000 | 18.274 | 18.229 |
| 51 | 4000 | 16.314 | 18.610 | 22.087 | 22.353 | 24.169 | 26.972 | 34.242 | 34.516 | 0.59 | 0.92 | 32.27 | 32.340 | 39.847 | 32.273 | 0.59 | 0.93 | 4000 | 16.772 | 16.738 |
| 54 | 4000 | 15.806 | 17.900 | 20.793 | 21.146 | 23.630 | 26.335 | 31.916 | 32.549 | 0.61 | 1.10 | 30.13 | 30.201 | 38.044 | 30.130 | 0.62 | 1.12 | 4000 | 15.735 | 15.643 |
| 57 | 4000 | 16.546 | 18.929 | 22.086 | 22.351 | 24.542 | 27.428 | 34.243 | 34.516 | 0.57 | 0.89 | 32.73 | 32.851 | 39.844 | 32.734 | 0.58 | 0.90 | 4000 | 17.120 | 17.094 |
| 60 | 4000 | 16.024 | 18.184 | 20.785 | 21.139 | 24.019 | 26.764 | 31.905 | 32.539 | 0.59 | 1.06 | 30.66 | 30.690 | 38.033 | 30.659 | 0.60 | 1.09 | 4000 | 16.494 | 16.420 |
| 63 | 4000 | 16.784 | 19.233 | 22.085 | 22.351 | 24.933 | 27.864 | 34.244 | 34.520 | 0.55 | 0.86 | 33.18 | 33.367 | 39.841 | 33.181 | 0.56 | 0.88 | 4000 | 17.655 | 17.643 |
| 66 | 4000 | 16.181 | 18.400 | 20.787 | 21.141 | 24.297 | 27.101 | 31.906 | 32.542 | 0.58 | 1.04 | 31.01 | 31.021 | 38.036 | 31.007 | 0.59 | 1.07 | 4000 | 16.305 | 16.229 |
| 69 | 4000 | 17.005 | 19.525 | 22.100 | 22.367 | 25.357 | 28.294 | 34.265 | 34.543 | 0.54 | 0.84 | 33.60 | 33.844 | 39.862 | 33.598 | 0.54 | 0.85 | 4000 | 18.280 | 18.264 |
| 72 | 4000 | 16.371 | 18.659 | 20.791 | 21.143 | 24.643 | 27.478 | 31.909 | 32.543 | 0.57 | 1.02 | 31.37 | 31.373 | 38.043 | 31.370 | 0.57 | 1.04 | 4000 | 16.905 | 16.848 |
| 75 | 4000 | 17.153 | 19.713 | 22.110 | 22.377 | 25.573 | 28.574 | 34.283 | 34.561 | 0.53 | 0.83 | 33.84 | 34.131 | 39.874 | 33.843 | 0.53 | 0.84 | 4000 | 18.118 | 18.099 |
| 78 | 4000 | 16.578 | 18.920 | 20.787 | 21.141 | 25.007 | 27.845 | 31.903 | 32.538 | 0.55 | 0.99 | 31.79 | 31.795 | 38.038 | 31.794 | 0.56 | 1.01 | 4000 | 17.245 | 17.191 |
| 81 | 4000 | 17.348 | 19.940 | 22.122 | 22.388 | 25.888 | 28.902 | 34.302 | 34.578 | 0.52 | 0.81 | 34.12 | 34.473 | 39.889 | 34.119 | 0.52 | 0.82 | 4000 | 17.807 | 17.780 |
| 84 | 4000 | 16.722 | 19.095 | 20.782 | 21.136 | 25.246 | 28.088 | 31.898 | 32.534 | 0.54 | 0.97 | 32.07 | 32.079 | 38.031 | 32.071 | 0.55 | 0.99 | 4000 | 17.319 | 17.273 |
| 87 | 4000 | 17.667 | 20.305 | 22.127 | 22.394 | 26.475 | 29.400 | 34.312 | 34.589 | 0.49 | 0.78 | 34.67 | 35.126 | 39.894 | 34.672 | 0.50 | 0.79 | 4000 | 18.795 | 18.807 |
| 90 | 4000 | 17.013 | 19.432 | 20.784 | 21.137 | 25.747 | 28.532 | 31.900 | 32.535 | 0.51 | 0.93 | 32.69 | 32.723 | 38.033 | 32.687 | 0.52 | 0.95 | 4000 | 17.718 | 17.686 |
| 93 | 4000 | 17.998 | 20.634 | 22.145 | 22.413 | 26.989 | 29.788 | 34.339 | 34.618 | 0.47 | 0.74 | 35.20 | 35.818 | 39.918 | 35.201 | 0.48 | 0.75 | 4000 | 18.742 | 18.743 |
| 96 | 4000 | 17.250 | 19.678 | 20.787 | 21.141 | 26.171 | 28.879 | 31.902 | 32.539 | 0.49 | 0.89 | 33.15 | 33.225 | 38.039 | 33.150 | 0.50 | 0.92 | 4000 | 18.147 | 18.130 |
| 99 | 4000 | 18.276 | 20.925 | 22.154 | 22.423 | 27.458 | 30.178 | 34.352 | 34.632 | 0.45 | 0.71 | 35.60 | 36.339 | 39.930 | 35.604 | 0.46 | 0.73 | 4000 | 19.553 | 19.571 |
| 102 | 4000 | 17.472 | 19.931 | 20.790 | 21.143 | 26.508 | 29.215 | 31.904 | 32.539 | 0.47 | 0.87 | 33.55 | 33.655 | 38.046 | 33.553 | 0.48 | 0.90 | 4000 | 17.951 | 17.936 |
| 105 | 4000 | 18.529 | 21.225 | 22.168 | 22.437 | 27.840 | 30.572 | 34.376 | 34.656 | 0.43 | 0.69 | 36.01 | 36.835 | 39.948 | 36.013 | 0.44 | 0.71 | 4000 | 19.481 | 19.499 |
| 108 | 4000 | 17.666 | 20.161 | 20.791 | 21.144 | 26.856 | 29.505 | 31.904 | 32.540 | 0.45 | 0.85 | 33.94 | 34.081 | 38.048 | 33.937 | 0.46 | 0.87 | 4000 | 18.606 | 18.605 |
| 111 | 4000 | 18.816 | 21.508 | 22.180 | 22.450 | 28.321 | 30.910 | 34.392 | 34.675 | 0.41 | 0.66 | 36.49 | 37.459 | 39.963 | 36.491 | 0.41 | 0.67 | 4000 | 19.659 | 19.693 |
| 114 | 4000 | 17.849 | 20.335 | 20.791 | 21.145 | 27.175 | 29.742 | 31.904 | 32.541 | 0.43 | 0.82 | 34.28 | 34.460 | 38.050 | 34.276 | 0.44 | 0.85 | 4000 | 18.624 | 18.634 |
| 117 | 4000 | 19.233 | 21.928 | 22.191 | 22.462 | 28.974 | 31.419 | 34.408 | 34.691 | 0.37 | 0.61 | 37.07 | 38.310 | 39.978 | 37.070 | 0.38 | 0.62 | 4000 | 20.010 | 20.054 |
| 120 | 4000 | 18.158 | 20.651 | 20.788 | 21.142 | 27.732 | 30.177 | 31.897 | 32.535 | 0.40 | 0.77 | 34.80 | 35.100 | 38.044 | 34.796 | 0.41 | 0.80 | 4000 | 18.875 | 18.901 |
| 126 | 4000 | 18.397 | 21.050 | 20.815 | 21.098 | 28.159 | 30.859 | 31.951 | 32.453 | 0.41 | 0.88 | 34.85 | 34.910 | 38.173 | 34.851 | 0.42 | 0.91 | 4000 | 18.952 | 18.939 |
| 132 | 4000 | 18.250 | 20.607 | 20.731 | 21.161 | 27.764 | 30.140 | 31.799 | 32.584 | 0.40 | 0.88 | 34.61 | 34.669 | 37.865 | 34.607 | 0.42 | 0.93 | 4000 | 18.814 | 18.794 |
| 138 | 4000 | 18.793 | 21.561 | 20.802 | 21.083 | 28.934 | 31.523 | 31.927 | 32.425 | 0.36 | 0.80 | 35.55 | 35.712 | 38.154 | 35.550 | 0.37 | 0.83 | 4000 | 19.551 | 19.565 |
| 144 | 4000 | 18.649 | 21.179 | 20.746 | 21.176 | 28.607 | 30.884 | 31.823 | 32.606 | 0.36 | 0.80 | 35.29 | 35.466 | 37.892 | 35.287 | 0.38 | 0.85 | 4000 | 19.756 | 19.770 |
| 150 | 4000 | 19.053 | 21.974 | 20.791 | 21.069 | 29.471 | 32.039 | 31.910 | 32.405 | 0.33 | 0.74 | 35.95 | 36.227 | 38.137 | 35.950 | 0.34 | 0.77 | 4000 | 19.772 | 19.807 |
| 156 | 4000 | 18.956 | 21.607 | 20.736 | 21.166 | 29.149 | 31.429 | 31.805 | 32.590 | 0.32 | 0.72 | 35.84 | 36.152 | 37.878 | 35.844 | 0.34 | 0.77 | 4000 | 19.844 | 19.899 |
| 162 | 4000 | 19.200 | 22.170 | 20.774 | 21.058 | 29.665 | 32.299 | 31.885 | 32.390 | 0.31 | 0.70 | 36.23 | 36.573 | 38.110 | 36.227 | 0.32 | 0.73 | 4000 | 19.749 | 19.794 |
| 168 | 4000 | 19.264 | 21.992 | 20.729 | 21.159 | 29.683 | 31.891 | 31.792 | 32.575 | 0.28 | 0.63 | 36.33 | 36.847 | 37.866 | 36.331 | 0.30 | 0.68 | 4000 | 20.086 | 20.174 |
| 174 | 4000 | 19.624 | 22.699 | 20.770 | 21.050 | 30.509 | 32.986 | 31.881 | 32.380 | 0.25 | 0.58 | 36.87 | 37.515 | 38.104 | 36.866 | 0.26 | 0.61 | 4000 | 20.606 | 20.687 |
| 180 | 4000 | 19.460 | 22.207 | 20.716 | 21.145 | 29.988 | 32.155 | 31.776 | 32.558 | 0.25 | 0.57 | 36.65 | 37.333 | 37.847 | 36.647 | 0.27 | 0.62 | 4000 | 20.135 | 20.268 |
| 186 | 4000 | 19.663 | 22.748 | 20.747 | 21.030 | 30.500 | 33.090 | 31.844 | 32.346 | 0.25 | 0.58 | 36.79 | 37.453 | 38.070 | 36.789 | 0.26 | 0.61 | 4000 | 19.924 | 20.019 |
| 192 | 4000 | 19.601 | 22.381 | 20.711 | 21.142 | 30.238 | 32.455 | 31.762 | 32.547 | 0.24 | 0.55 | 36.75 | 37.458 | 37.838 | 36.748 | 0.26 | 0.61 | 4000 | 20.204 | 20.293 |
| 198 | 4000 | 19.953 | 23.090 | 20.743 | 21.025 | 31.048 | 33.496 | 31.834 | 32.337 | 0.20 | 0.49 | 37.24 | 38.158 | 38.064 | 37.240 | 0.21 | 0.51 | 4000 | 20.372 | 20.480 |
| 204 | 4000 | 19.956 | 22.826 | 20.698 | 21.129 | 30.921 | 32.968 | 31.742 | 32.526 | 0.18 | 0.43 | 37.18 | 38.269 | 37.823 | 37.176 | 0.20 | 0.48 | 4000 | 20.479 | 20.645 |
| 210 | 4000 | 20.256 | 23.486 | 20.737 | 21.019 | 31.699 | 34.005 | 31.822 | 32.324 | 0.16 | 0.39 | 37.52 | 38.769 | 38.058 | 37.523 | 0.17 | 0.42 | 4000 | 20.561 | 20.729 |
| 216 | 4000 | 20.234 | 23.148 | 20.713 | 21.143 | 31.462 | 33.372 | 31.762 | 32.545 | 0.15 | 0.35 | 37.42 | 38.825 | 37.844 | 37.417 | 0.17 | 0.40 | 4000 | 20.575 | 20.807 |
| 222 | 4000 | 20.425 | 23.727 | 20.744 | 21.025 | 32.021 | 34.295 | 31.830 | 32.331 | 0.14 | 0.35 | 37.67 | 39.089 | 38.069 | 37.669 | 0.15 | 0.37 | 4000 | 21.005 | 21.143 |
| 228 | 4000 | 20.243 | 23.179 | 20.708 | 21.137 | 31.515 | 33.438 | 31.755 | 32.539 | 0.15 | 0.36 | 37.40 | 38.799 | 37.839 | 37.400 | 0.17 | 0.41 | 4000 | 20.704 | 20.913 |
| 234 | 4000 | 20.491 | 23.758 | 20.751 | 21.032 | 32.172 | 34.390 | 31.841 | 32.342 | 0.14 | 0.34 | 37.70 | 39.136 | 38.082 | 37.703 | 0.15 | 0.36 | 4000 | 20.738 | 20.882 |
| 240 | 4000 | 20.639 | 23.615 | 20.721 | 21.152 | 32.237 | 33.993 | 31.770 | 32.556 | 0.10 | 0.24 | 37.67 | 39.497 | 37.861 | 37.668 | 0.12 | 0.29 | 4000 | 20.600 | 20.868 |
| 246 | 4000 | 20.809 | 23.965 | 20.765 | 21.041 | 32.997 | 34.607 | 31.864 | 32.358 | 0.07 | 0.22 | 38.00 | 39.301 | 38.105 | 38.000 | 0.08 | 0.24 | 4000 | 20.988 | 21.176 |
| 252 | 4000 | 20.780 | 23.733 | 20.703 | 21.132 | 32.812 | 34.146 | 31.746 | 32.527 | 0.06 | 0.18 | 37.76 | 39.263 | 37.834 | 37.759 | 0.08 | 0.24 | 4000 | 20.673 | 20.995 |
| 258 | 4000 | 21.015 | 24.376 | 20.765 | 21.040 | 33.443 | 35.126 | 31.854 | 32.347 | 0.04 | 0.13 | 38.07 | 39.747 | 38.110 | 38.072 | 0.05 | 0.14 | 4000 | 21.116 | 21.308 |
| 264 | 4000 | 20.908 | 23.972 | 20.729 | 21.156 | 33.078 | 34.434 | 31.783 | 32.564 | 0.04 | 0.13 | 37.84 | 39.565 | 37.874 | 37.836 | 0.06 | 0.18 | 4000 | 21.038 | 21.328 |
| 270 | 4000 | 20.976 | 24.351 | 20.758 | 21.034 | 33.340 | 35.107 | 31.846 | 32.340 | 0.04 | 0.15 | 38.05 | 39.643 | 38.099 | 38.052 | 0.05 | 0.16 | 4000 | 20.940 | 21.154 |
| 276 | 4000 | 20.855 | 23.953 | 20.703 | 21.130 | 32.966 | 34.368 | 31.744 | 32.524 | 0.05 | 0.14 | 37.79 | 39.490 | 37.834 | 37.788 | 0.07 | 0.20 | 4000 | 20.775 | 21.122 |
| 282 | 4000 | 21.022 | 24.549 | 20.755 | 21.034 | 33.453 | 35.291 | 31.837 | 32.337 | 0.04 | 0.12 | 38.06 | 39.795 | 38.097 | 38.065 | 0.04 | 0.13 | 4000 | 20.958 | 21.182 |
| 288 | 4000 | 21.050 | 24.275 | 20.718 | 21.148 | 33.391 | 34.803 | 31.769 | 32.553 | 0.02 | 0.06 | 37.85 | 39.890 | 37.860 | 37.852 | 0.04 | 0.11 | 4000 | 20.834 | 21.183 |
| 294 | 4000 | 21.077 | 24.683 | 20.758 | 21.036 | 33.585 | 35.472 | 31.840 | 32.340 | 0.03 | 0.09 | 38.08 | 39.935 | 38.102 | 38.082 | 0.03 | 0.11 | 4000 | 20.716 | 20.966 |
| 300 | 4000 | 20.960 | 24.135 | 20.722 | 21.150 | 33.170 | 34.595 | 31.771 | 32.552 | 0.02 | 0.07 | 37.85 | 39.767 | 37.866 | 37.854 | 0.05 | 0.13 | 4000 | 20.891 | 21.227 |
| 306 | 4000 | 20.957 | 24.394 | 20.760 | 21.037 | 33.228 | 35.079 | 31.844 | 32.342 | 0.04 | 0.11 | 38.08 | 39.785 | 38.105 | 38.076 | 0.04 | 0.13 | 4000 | 20.778 | 20.960 |
| 312 | 4000 | 20.833 | 23.906 | 20.721 | 21.152 | 32.826 | 34.294 | 31.774 | 32.559 | 0.04 | 0.11 | 37.84 | 39.612 | 37.865 | 37.839 | 0.06 | 0.17 | 4000 | 21.163 | 21.457 |
| 318 | 4000 | 20.951 | 24.394 | 20.750 | 21.030 | 33.192 | 35.105 | 31.823 | 32.325 | 0.03 | 0.10 | 38.07 | 39.854 | 38.093 | 38.070 | 0.04 | 0.12 | 4000 | 21.111 | 21.276 |
| 324 | 4000 | 20.967 | 24.157 | 20.733 | 21.162 | 33.137 | 34.602 | 31.788 | 32.570 | 0.02 | 0.05 | 37.88 | 39.906 | 37.885 | 37.879 | 0.04 | 0.11 | 4000 | 20.855 | 21.205 |
| 330 | 4000 | 21.070 | 24.640 | 20.763 | 21.042 | 33.474 | 35.360 | 31.840 | 32.340 | 0.02 | 0.07 | 38.10 | 40.043 | 38.116 | 38.104 | 0.03 | 0.09 | 4000 | 20.848 | 21.090 |
| 336 | 4000 | 20.987 | 24.201 | 20.742 | 21.173 | 33.226 | 34.700 | 31.804 | 32.591 | 0.03 | 0.07 | 37.89 | 39.872 | 37.901 | 37.889 | 0.05 | 0.13 | 4000 | 21.057 | 21.389 |

Erste Vorlaufstunde mit CRPS fl-K > Klima (Station): **246**; letzte Stunde mit fl-K < Klima: 240.

Je Bin (clct) — Summen der Stunden, b/σ_b je Bin in-sample; CRPS Misch. auf den vereinigten Stichproben der Stunden:

| Bin | n | CRPS K | Cube | Klima | Pool | MAE K | Klima | ρ | b | σ_b | RMSE K | Klima | Misch. | n_S | CRPS Misch. Stat | Pool |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0–6 | 24000 | 12.284 | 14.702 | 21.969 | 22.240 | 17.495 | 34.157 | 0.76 | 0.96 | 25.38 | 25.416 | 39.342 | 25.381 | 24000 | 13.362 | 13.333 |
| 7–24 | 72000 | 14.865 | 17.482 | 23.619 | 23.965 | 21.746 | 37.275 | 0.70 | 0.94 | 29.22 | 29.282 | 41.085 | 29.216 | 72000 | 15.335 | 15.301 |
| 25–48 | 96000 | 17.204 | 19.210 | 23.649 | 23.988 | 25.916 | 37.324 | 0.60 | 0.93 | 32.64 | 32.694 | 41.129 | 32.640 | 96000 | 17.786 | 17.745 |
| 51–120 | 96000 | 17.243 | 19.692 | 21.389 | 21.704 | 25.937 | 32.984 | 0.50 | 0.86 | 33.57 | 33.733 | 38.884 | 33.570 | 96000 | 18.065 | 18.054 |
| 126–240 | 80000 | 19.554 | 22.454 | 20.745 | 21.098 | 30.287 | 31.828 | 0.25 | 0.58 | 36.72 | 37.365 | 37.984 | 36.724 | 80000 | 20.217 | 20.315 |
| 246–336 | 64000 | 20.952 | 24.237 | 20.741 | 21.091 | 33.212 | 31.809 | 0.04 | 0.11 | 37.96 | 39.719 | 37.989 | 37.960 | 64000 | 20.924 | 21.191 |

### D2 je Schicht und Bin (Land, Band, Route) — CRPS K / Cube / Klima / Pool, ρ, b, RMSE K / Klima / Misch. (in-sample)

| Größe | Bin | Schicht | n | CRPS K | Cube | Klima | Pool | ρ | b | σ_b | RMSE K | Klima | Misch. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| t | 0–6 | band:ge800 | 61903 | 0.949 | 1.469 | 2.311 | 3.082 | 0.90 | 0.96 | 1.75 | 1.762 | 4.128 | 1.753 |
| t | 0–6 | band:lt800 | 234087 | 0.663 | 0.797 | 2.175 | 2.320 | 0.95 | 0.99 | 1.28 | 1.277 | 3.920 | 1.276 |
| t | 0–6 | country:AT | 64707 | 0.845 | 1.090 | 2.145 | 2.438 | 0.91 | 0.96 | 1.60 | 1.610 | 3.852 | 1.604 |
| t | 0–6 | country:CH | 74747 | 0.883 | 1.288 | 2.192 | 2.669 | 0.90 | 0.95 | 1.64 | 1.657 | 3.921 | 1.644 |
| t | 0–6 | country:DE | 155571 | 0.594 | 0.706 | 2.234 | 2.407 | 0.96 | 1.00 | 1.13 | 1.128 | 4.031 | 1.128 |
| t | 0–6 | country:LI | 965 | 0.911 | 1.080 | 2.210 | 2.210 | 0.90 | 0.94 | 1.69 | 1.708 | 3.932 | 1.692 |
| t | 0–6 | route:1 | 148657 | 0.743 | 1.007 | 2.239 | 2.572 | 0.93 | 0.99 | 1.38 | 1.383 | 4.038 | 1.382 |
| t | 0–6 | route:2 | 147333 | 0.702 | 0.868 | 2.169 | 2.386 | 0.93 | 0.97 | 1.40 | 1.401 | 3.890 | 1.398 |
| t | 7–24 | band:ge800 | 91985 | 0.949 | 1.545 | 2.231 | 3.189 | 0.89 | 0.97 | 1.72 | 1.723 | 3.985 | 1.719 |
| t | 7–24 | band:lt800 | 351668 | 0.791 | 0.948 | 2.243 | 2.411 | 0.93 | 0.98 | 1.46 | 1.466 | 4.056 | 1.463 |
| t | 7–24 | country:AT | 96537 | 0.891 | 1.175 | 2.183 | 2.529 | 0.90 | 0.97 | 1.64 | 1.643 | 3.906 | 1.638 |
| t | 7–24 | country:CH | 112887 | 0.926 | 1.402 | 2.205 | 2.800 | 0.88 | 0.94 | 1.68 | 1.697 | 3.927 | 1.682 |
| t | 7–24 | country:DE | 233074 | 0.746 | 0.869 | 2.281 | 2.483 | 0.94 | 0.99 | 1.37 | 1.374 | 4.151 | 1.374 |
| t | 7–24 | country:LI | 1155 | 0.845 | 0.960 | 2.216 | 2.216 | 0.91 | 0.93 | 1.49 | 1.522 | 3.951 | 1.494 |
| t | 7–24 | route:1 | 443653 | 0.823 | 1.071 | 2.240 | 2.573 | 0.92 | 0.97 | 1.52 | 1.523 | 4.042 | 1.519 |
| t | 25–48 | band:ge800 | 121528 | 1.019 | 1.531 | 2.222 | 3.179 | 0.87 | 0.95 | 1.84 | 1.848 | 3.970 | 1.838 |
| t | 25–48 | band:lt800 | 464634 | 0.900 | 1.037 | 2.237 | 2.406 | 0.90 | 0.96 | 1.66 | 1.663 | 4.049 | 1.657 |
| t | 25–48 | country:AT | 127544 | 0.990 | 1.238 | 2.182 | 2.527 | 0.87 | 0.95 | 1.81 | 1.817 | 3.905 | 1.807 |
| t | 25–48 | country:CH | 149146 | 1.010 | 1.409 | 2.196 | 2.790 | 0.85 | 0.92 | 1.82 | 1.848 | 3.912 | 1.821 |
| t | 25–48 | country:DE | 307946 | 0.856 | 0.969 | 2.274 | 2.476 | 0.92 | 0.99 | 1.57 | 1.575 | 4.142 | 1.575 |
| t | 25–48 | country:LI | 1526 | 0.947 | 1.001 | 2.197 | 2.197 | 0.88 | 0.91 | 1.72 | 1.757 | 3.923 | 1.718 |
| t | 25–48 | route:1 | 586162 | 0.925 | 1.140 | 2.234 | 2.566 | 0.90 | 0.96 | 1.70 | 1.703 | 4.033 | 1.696 |
| t | 51–120 | band:ge800 | 237769 | 1.328 | 1.967 | 2.280 | 3.188 | 0.81 | 0.90 | 2.36 | 2.392 | 4.072 | 2.365 |
| t | 51–120 | band:lt800 | 949932 | 1.133 | 1.252 | 2.145 | 2.275 | 0.84 | 0.94 | 2.07 | 2.082 | 3.856 | 2.072 |
| t | 51–120 | country:AT | 255234 | 1.320 | 1.549 | 2.127 | 2.407 | 0.79 | 0.86 | 2.36 | 2.407 | 3.823 | 2.357 |
| t | 51–120 | country:CH | 311509 | 1.258 | 1.662 | 2.123 | 2.715 | 0.81 | 0.87 | 2.24 | 2.290 | 3.810 | 2.245 |
| t | 51–120 | country:DE | 620958 | 1.068 | 1.198 | 2.215 | 2.350 | 0.87 | 0.99 | 1.95 | 1.952 | 3.976 | 1.952 |
| t | 51–120 | route:1 | 289502 | 1.123 | 1.416 | 2.187 | 2.561 | 0.84 | 0.92 | 2.04 | 2.060 | 3.960 | 2.037 |
| t | 51–120 | route:3 | 898199 | 1.187 | 1.388 | 2.167 | 2.424 | 0.83 | 0.94 | 2.17 | 2.175 | 3.881 | 2.165 |
| t | 126–240 | band:ge800 | 112973 | 1.827 | 2.263 | 2.301 | 2.820 | 0.61 | 0.78 | 3.25 | 3.324 | 4.112 | 3.249 |
| t | 126–240 | band:lt800 | 375142 | 1.633 | 1.658 | 2.148 | 2.279 | 0.65 | 0.82 | 2.94 | 2.995 | 3.859 | 2.941 |
| t | 126–240 | country:AT | 104403 | 1.754 | 1.900 | 2.131 | 2.472 | 0.59 | 0.71 | 3.07 | 3.208 | 3.828 | 3.070 |
| t | 126–240 | country:CH | 128245 | 1.688 | 1.926 | 2.169 | 2.484 | 0.64 | 0.78 | 3.00 | 3.081 | 3.892 | 3.000 |
| t | 126–240 | country:DE | 255467 | 1.642 | 1.693 | 2.212 | 2.336 | 0.66 | 0.87 | 2.99 | 3.014 | 3.969 | 2.988 |
| t | 126–240 | route:1 | 114661 | 1.612 | 1.754 | 2.122 | 2.436 | 0.63 | 0.82 | 2.91 | 2.956 | 3.852 | 2.905 |
| t | 126–240 | route:3 | 373454 | 1.698 | 1.812 | 2.202 | 2.394 | 0.62 | 0.80 | 3.05 | 3.109 | 3.939 | 3.048 |
| t | 246–336 | band:ge800 | 89295 | 2.451 | 2.821 | 2.310 | 2.831 | 0.27 | 0.37 | 3.97 | 4.393 | 4.126 | 3.968 |
| t | 246–336 | band:lt800 | 296516 | 2.302 | 2.226 | 2.156 | 2.288 | 0.26 | 0.36 | 3.73 | 4.146 | 3.871 | 3.735 |
| t | 246–336 | country:AT | 82504 | 2.378 | 2.404 | 2.139 | 2.479 | 0.24 | 0.30 | 3.73 | 4.282 | 3.840 | 3.728 |
| t | 246–336 | country:CH | 101372 | 2.291 | 2.495 | 2.176 | 2.495 | 0.30 | 0.39 | 3.74 | 4.118 | 3.904 | 3.737 |
| t | 246–336 | country:DE | 201935 | 2.342 | 2.282 | 2.220 | 2.346 | 0.26 | 0.38 | 3.84 | 4.215 | 3.982 | 3.839 |
| t | 246–336 | route:1 | 87087 | 2.054 | 2.168 | 1.947 | 2.257 | 0.26 | 0.39 | 3.36 | 3.717 | 3.503 | 3.356 |
| t | 246–336 | route:3 | 298724 | 2.419 | 2.421 | 2.263 | 2.459 | 0.25 | 0.36 | 3.91 | 4.336 | 4.048 | 3.907 |
| td | 0–6 | band:ge800 | 61884 | 1.046 | 1.204 | 2.110 | 2.708 | 0.85 | 0.92 | 2.07 | 2.084 | 3.947 | 2.065 |
| td | 0–6 | band:lt800 | 233915 | 0.612 | 0.713 | 2.034 | 2.106 | 0.95 | 1.01 | 1.16 | 1.160 | 3.650 | 1.160 |
| td | 0–6 | country:AT | 64699 | 0.770 | 0.882 | 1.989 | 2.181 | 0.91 | 0.95 | 1.47 | 1.482 | 3.635 | 1.474 |
| td | 0–6 | country:CH | 74731 | 0.957 | 1.107 | 2.025 | 2.382 | 0.87 | 0.94 | 1.86 | 1.868 | 3.747 | 1.858 |
| td | 0–6 | country:DE | 155404 | 0.552 | 0.647 | 2.089 | 2.184 | 0.96 | 1.03 | 1.07 | 1.071 | 3.735 | 1.067 |
| td | 0–6 | country:LI | 965 | 0.884 | 0.870 | 1.674 | 1.674 | 0.86 | 0.89 | 1.55 | 1.582 | 3.028 | 1.552 |
| td | 0–6 | route:1 | 148581 | 0.730 | 0.842 | 1.958 | 2.140 | 0.92 | 1.00 | 1.39 | 1.392 | 3.508 | 1.392 |
| td | 0–6 | route:2 | 147218 | 0.675 | 0.789 | 2.142 | 2.324 | 0.93 | 0.98 | 1.42 | 1.417 | 3.912 | 1.416 |
| td | 7–24 | band:ge800 | 91961 | 0.992 | 1.097 | 1.840 | 2.438 | 0.83 | 0.90 | 1.87 | 1.892 | 3.357 | 1.869 |
| td | 7–24 | band:lt800 | 351464 | 0.750 | 0.889 | 1.992 | 2.065 | 0.92 | 1.00 | 1.39 | 1.387 | 3.550 | 1.387 |
| td | 7–24 | country:AT | 96513 | 0.842 | 0.985 | 1.861 | 2.061 | 0.89 | 0.94 | 1.54 | 1.554 | 3.385 | 1.543 |
| td | 7–24 | country:CH | 112869 | 0.994 | 1.140 | 1.911 | 2.297 | 0.84 | 0.92 | 1.83 | 1.851 | 3.459 | 1.834 |
| td | 7–24 | country:DE | 232888 | 0.687 | 0.809 | 2.027 | 2.104 | 0.93 | 1.03 | 1.28 | 1.281 | 3.590 | 1.277 |
| td | 7–24 | country:LI | 1155 | 1.000 | 0.964 | 1.555 | 1.555 | 0.81 | 0.84 | 1.72 | 1.768 | 2.816 | 1.718 |
| td | 7–24 | route:1 | 443425 | 0.800 | 0.932 | 1.960 | 2.142 | 0.90 | 0.98 | 1.50 | 1.506 | 3.511 | 1.505 |
| td | 25–48 | band:ge800 | 121496 | 1.081 | 1.170 | 1.840 | 2.437 | 0.80 | 0.91 | 2.02 | 2.039 | 3.358 | 2.021 |
| td | 25–48 | band:lt800 | 464362 | 0.878 | 1.050 | 1.987 | 2.061 | 0.89 | 1.02 | 1.61 | 1.609 | 3.545 | 1.608 |
| td | 25–48 | country:AT | 127512 | 0.935 | 1.100 | 1.859 | 2.060 | 0.86 | 0.94 | 1.70 | 1.713 | 3.385 | 1.704 |
| td | 25–48 | country:CH | 149122 | 1.085 | 1.250 | 1.916 | 2.300 | 0.81 | 0.93 | 2.00 | 2.010 | 3.467 | 2.000 |
| td | 25–48 | country:DE | 307698 | 0.833 | 0.979 | 2.019 | 2.096 | 0.90 | 1.05 | 1.53 | 1.534 | 3.579 | 1.528 |
| td | 25–48 | country:LI | 1526 | 1.111 | 1.132 | 1.561 | 1.561 | 0.74 | 0.80 | 1.93 | 1.997 | 2.827 | 1.931 |
| td | 25–48 | route:1 | 585858 | 0.920 | 1.075 | 1.957 | 2.139 | 0.87 | 1.00 | 1.71 | 1.707 | 3.507 | 1.707 |
| td | 51–120 | band:ge800 | 237769 | 1.444 | 1.670 | 2.264 | 3.054 | 0.75 | 0.88 | 2.76 | 2.793 | 4.217 | 2.761 |
| td | 51–120 | band:lt800 | 949440 | 1.089 | 1.401 | 2.056 | 2.120 | 0.84 | 0.94 | 1.99 | 2.002 | 3.703 | 1.993 |
| td | 51–120 | country:AT | 255186 | 1.219 | 1.504 | 2.074 | 2.288 | 0.80 | 0.89 | 2.22 | 2.257 | 3.795 | 2.224 |
| td | 51–120 | country:CH | 311269 | 1.324 | 1.651 | 2.088 | 2.590 | 0.76 | 0.88 | 2.51 | 2.535 | 3.876 | 2.505 |
| td | 51–120 | country:DE | 620754 | 1.053 | 1.336 | 2.113 | 2.173 | 0.85 | 0.97 | 1.95 | 1.949 | 3.785 | 1.947 |
| td | 51–120 | route:1 | 289370 | 1.077 | 1.419 | 1.941 | 2.147 | 0.82 | 0.97 | 1.99 | 1.992 | 3.491 | 1.989 |
| td | 51–120 | route:3 | 897839 | 1.186 | 1.466 | 2.149 | 2.358 | 0.82 | 0.92 | 2.22 | 2.242 | 3.909 | 2.225 |
| td | 126–240 | band:ge800 | 112973 | 1.993 | 2.072 | 2.179 | 2.707 | 0.49 | 0.62 | 3.51 | 3.710 | 4.022 | 3.508 |
| td | 126–240 | band:lt800 | 374812 | 1.699 | 1.951 | 2.079 | 2.135 | 0.58 | 0.76 | 3.01 | 3.096 | 3.734 | 3.012 |
| td | 126–240 | country:AT | 104363 | 1.837 | 1.996 | 2.085 | 2.383 | 0.52 | 0.66 | 3.25 | 3.416 | 3.824 | 3.247 |
| td | 126–240 | country:CH | 128045 | 1.798 | 1.991 | 2.051 | 2.330 | 0.53 | 0.67 | 3.16 | 3.312 | 3.748 | 3.158 |
| td | 126–240 | country:DE | 255377 | 1.722 | 1.965 | 2.136 | 2.188 | 0.58 | 0.78 | 3.08 | 3.144 | 3.821 | 3.076 |
| td | 126–240 | route:1 | 114631 | 1.667 | 1.988 | 1.925 | 2.092 | 0.51 | 0.72 | 2.95 | 3.033 | 3.458 | 2.946 |
| td | 126–240 | route:3 | 373154 | 1.798 | 1.976 | 2.157 | 2.321 | 0.56 | 0.72 | 3.20 | 3.312 | 3.903 | 3.196 |
| td | 246–336 | band:ge800 | 89295 | 2.523 | 2.428 | 2.191 | 2.716 | 0.13 | 0.18 | 4.01 | 4.606 | 4.040 | 4.009 |
| td | 246–336 | band:lt800 | 296252 | 2.346 | 2.360 | 2.090 | 2.145 | 0.11 | 0.21 | 3.71 | 4.200 | 3.750 | 3.712 |
| td | 246–336 | country:AT | 82472 | 2.415 | 2.367 | 2.093 | 2.390 | 0.13 | 0.19 | 3.80 | 4.379 | 3.838 | 3.804 |
| td | 246–336 | country:CH | 101212 | 2.329 | 2.338 | 2.062 | 2.339 | 0.14 | 0.24 | 3.71 | 4.194 | 3.765 | 3.715 |
| td | 246–336 | country:DE | 201863 | 2.405 | 2.398 | 2.147 | 2.200 | 0.10 | 0.19 | 3.81 | 4.315 | 3.838 | 3.807 |
| td | 246–336 | route:1 | 87063 | 2.077 | 2.309 | 1.890 | 2.056 | 0.11 | 0.11 | 3.40 | 3.715 | 3.407 | 3.402 |
| td | 246–336 | route:3 | 298484 | 2.477 | 2.395 | 2.178 | 2.342 | 0.13 | 0.21 | 3.89 | 4.453 | 3.931 | 3.886 |
| ws | 0–6 | band:ge800 | 61882 | 1.109 | 1.259 | 1.130 | 1.603 | 0.44 | 0.57 | 2.04 | 2.194 | 2.298 | 2.042 |
| ws | 0–6 | band:lt800 | 234239 | 0.660 | 0.744 | 0.866 | 1.017 | 0.69 | 0.78 | 1.21 | 1.248 | 1.665 | 1.207 |
| ws | 0–6 | country:AT | 63717 | 0.778 | 0.895 | 0.809 | 1.094 | 0.50 | 0.63 | 1.49 | 1.571 | 1.719 | 1.491 |
| ws | 0–6 | country:CH | 76598 | 0.824 | 0.956 | 0.900 | 1.129 | 0.49 | 0.65 | 1.57 | 1.641 | 1.804 | 1.567 |
| ws | 0–6 | country:DE | 154841 | 0.711 | 0.783 | 0.979 | 1.165 | 0.71 | 0.76 | 1.33 | 1.387 | 1.861 | 1.326 |
| ws | 0–6 | country:LI | 965 | 0.591 | 0.719 | 0.814 | 0.814 | 0.71 | 1.35 | 1.05 | 1.087 | 1.495 | 1.052 |
| ws | 0–6 | route:1 | 148571 | 0.729 | 0.819 | 0.819 | 1.014 | 0.54 | 0.66 | 1.35 | 1.422 | 1.608 | 1.350 |
| ws | 0–6 | route:2 | 147550 | 0.779 | 0.885 | 1.024 | 1.265 | 0.65 | 0.75 | 1.50 | 1.567 | 2.003 | 1.505 |
| ws | 7–24 | band:ge800 | 91961 | 1.042 | 1.224 | 0.952 | 1.324 | 0.27 | 0.37 | 1.82 | 2.039 | 1.901 | 1.823 |
| ws | 7–24 | band:lt800 | 351442 | 0.677 | 0.778 | 0.786 | 0.935 | 0.59 | 0.73 | 1.23 | 1.274 | 1.524 | 1.228 |
| ws | 7–24 | country:AT | 95363 | 0.768 | 0.930 | 0.706 | 0.943 | 0.39 | 0.46 | 1.36 | 1.491 | 1.458 | 1.358 |
| ws | 7–24 | country:CH | 115095 | 0.808 | 0.982 | 0.767 | 0.949 | 0.30 | 0.42 | 1.45 | 1.578 | 1.519 | 1.453 |
| ws | 7–24 | country:DE | 231790 | 0.720 | 0.791 | 0.895 | 1.080 | 0.63 | 0.73 | 1.34 | 1.398 | 1.710 | 1.345 |
| ws | 7–24 | country:LI | 1155 | 0.603 | 0.759 | 0.666 | 0.666 | 0.63 | 0.87 | 1.11 | 1.111 | 1.247 | 1.108 |
| ws | 7–24 | route:1 | 443403 | 0.753 | 0.870 | 0.820 | 1.015 | 0.51 | 0.63 | 1.39 | 1.466 | 1.609 | 1.388 |
| ws | 25–48 | band:ge800 | 121403 | 1.063 | 1.367 | 0.952 | 1.325 | 0.24 | 0.33 | 1.84 | 2.093 | 1.902 | 1.840 |
| ws | 25–48 | band:lt800 | 464008 | 0.708 | 0.855 | 0.787 | 0.936 | 0.54 | 0.69 | 1.29 | 1.341 | 1.526 | 1.290 |
| ws | 25–48 | country:AT | 125896 | 0.758 | 1.062 | 0.706 | 0.944 | 0.35 | 0.46 | 1.37 | 1.493 | 1.460 | 1.371 |
| ws | 25–48 | country:CH | 151948 | 0.810 | 1.114 | 0.767 | 0.950 | 0.26 | 0.38 | 1.47 | 1.599 | 1.520 | 1.468 |
| ws | 25–48 | country:DE | 306043 | 0.779 | 0.844 | 0.896 | 1.081 | 0.57 | 0.67 | 1.43 | 1.508 | 1.712 | 1.434 |
| ws | 25–48 | country:LI | 1524 | 0.604 | 0.902 | 0.668 | 0.668 | 0.51 | 0.79 | 1.14 | 1.151 | 1.250 | 1.143 |
| ws | 25–48 | route:1 | 585411 | 0.782 | 0.962 | 0.821 | 1.017 | 0.46 | 0.58 | 1.44 | 1.528 | 1.611 | 1.437 |
| ws | 51–120 | band:ge800 | 237096 | 1.246 | 1.767 | 1.099 | 1.709 | 0.27 | 0.37 | 2.14 | 2.431 | 2.244 | 2.143 |
| ws | 51–120 | band:lt800 | 941071 | 0.814 | 1.077 | 0.886 | 1.072 | 0.49 | 0.67 | 1.48 | 1.537 | 1.704 | 1.480 |
| ws | 51–120 | country:AT | 254430 | 0.842 | 1.397 | 0.717 | 1.113 | 0.25 | 0.31 | 1.46 | 1.644 | 1.496 | 1.456 |
| ws | 51–120 | country:CH | 311614 | 0.987 | 1.417 | 0.927 | 1.171 | 0.23 | 0.39 | 1.75 | 1.905 | 1.814 | 1.747 |
| ws | 51–120 | country:DE | 612123 | 0.882 | 1.039 | 1.018 | 1.251 | 0.54 | 0.68 | 1.64 | 1.718 | 1.952 | 1.644 |
| ws | 51–120 | route:1 | 288738 | 0.804 | 1.156 | 0.794 | 1.011 | 0.37 | 0.50 | 1.46 | 1.566 | 1.563 | 1.455 |
| ws | 51–120 | route:3 | 889429 | 0.933 | 1.236 | 0.973 | 1.261 | 0.43 | 0.58 | 1.70 | 1.811 | 1.903 | 1.705 |
| ws | 126–240 | band:ge800 | 112353 | 1.316 | 1.528 | 1.023 | 1.803 | 0.07 | 0.13 | 2.15 | 2.649 | 2.163 | 2.151 |
| ws | 126–240 | band:lt800 | 368609 | 0.917 | 0.929 | 0.881 | 1.039 | 0.24 | 0.42 | 1.63 | 1.731 | 1.682 | 1.628 |
| ws | 126–240 | country:AT | 103773 | 0.928 | 1.044 | 0.774 | 1.241 | 0.08 | 0.10 | 1.65 | 1.875 | 1.650 | 1.647 |
| ws | 126–240 | country:CH | 128205 | 1.024 | 1.023 | 0.826 | 1.131 | 0.04 | 0.08 | 1.58 | 1.939 | 1.586 | 1.583 |
| ws | 126–240 | country:DE | 248984 | 1.038 | 1.103 | 1.017 | 1.251 | 0.26 | 0.40 | 1.89 | 2.049 | 1.966 | 1.892 |
| ws | 126–240 | route:1 | 114450 | 0.914 | 0.946 | 0.776 | 1.008 | 0.10 | 0.14 | 1.52 | 1.754 | 1.527 | 1.520 |
| ws | 126–240 | route:3 | 366512 | 1.041 | 1.107 | 0.957 | 1.282 | 0.18 | 0.30 | 1.84 | 2.050 | 1.884 | 1.843 |
| ws | 246–336 | band:ge800 | 88799 | 1.367 | 1.554 | 1.025 | 1.805 | -0.02 | 0.03 | 2.17 | 2.793 | 2.168 | 2.168 |
| ws | 246–336 | band:lt800 | 291362 | 0.974 | 1.009 | 0.883 | 1.041 | 0.06 | 0.15 | 1.68 | 1.840 | 1.685 | 1.680 |
| ws | 246–336 | country:AT | 82000 | 0.948 | 1.094 | 0.776 | 1.244 | 0.01 | -0.02 | 1.65 | 1.922 | 1.654 | 1.654 |
| ws | 246–336 | country:CH | 101340 | 1.052 | 1.049 | 0.828 | 1.133 | -0.03 | 0.00 | 1.59 | 1.991 | 1.589 | 1.589 |
| ws | 246–336 | country:DE | 196821 | 1.121 | 1.199 | 1.020 | 1.253 | 0.07 | 0.15 | 1.96 | 2.225 | 1.971 | 1.963 |
| ws | 246–336 | route:1 | 86929 | 0.952 | 1.010 | 0.780 | 1.017 | -0.05 | -0.08 | 1.53 | 1.856 | 1.535 | 1.533 |
| ws | 246–336 | route:3 | 293232 | 1.099 | 1.174 | 0.956 | 1.279 | 0.03 | 0.11 | 1.88 | 2.169 | 1.883 | 1.878 |
| gust | 0–6 | band:ge800 | 61856 | 1.409 | 1.864 | 1.849 | 2.330 | 0.71 | 0.82 | 2.57 | 2.631 | 3.640 | 2.573 |
| gust | 0–6 | band:lt800 | 215186 | 0.925 | 1.042 | 1.486 | 1.652 | 0.78 | 0.92 | 1.76 | 1.772 | 2.809 | 1.760 |
| gust | 0–6 | country:AT | 63646 | 1.113 | 1.342 | 1.444 | 1.740 | 0.68 | 0.85 | 2.12 | 2.152 | 2.898 | 2.123 |
| gust | 0–6 | country:CH | 76595 | 1.271 | 1.517 | 1.569 | 1.845 | 0.67 | 0.77 | 2.33 | 2.416 | 3.115 | 2.335 |
| gust | 0–6 | country:DE | 135836 | 0.862 | 1.008 | 1.624 | 1.812 | 0.84 | 0.97 | 1.62 | 1.624 | 3.011 | 1.622 |
| gust | 0–6 | country:LI | 965 | 1.054 | 1.107 | 1.518 | 1.518 | 0.74 | 1.12 | 1.92 | 1.933 | 2.845 | 1.919 |
| gust | 0–6 | route:1 | 139292 | 1.032 | 1.226 | 1.408 | 1.624 | 0.69 | 0.83 | 1.95 | 1.986 | 2.699 | 1.947 |
| gust | 0–6 | route:2 | 137750 | 1.034 | 1.225 | 1.728 | 1.984 | 0.80 | 0.92 | 1.99 | 2.006 | 3.303 | 1.994 |
| gust | 7–24 | band:ge800 | 91895 | 1.408 | 1.812 | 1.579 | 1.980 | 0.57 | 0.71 | 2.52 | 2.619 | 3.058 | 2.517 |
| gust | 7–24 | band:lt800 | 323815 | 1.007 | 1.129 | 1.361 | 1.525 | 0.68 | 0.83 | 1.91 | 1.939 | 2.592 | 1.905 |
| gust | 7–24 | country:AT | 95171 | 1.158 | 1.364 | 1.318 | 1.577 | 0.57 | 0.73 | 2.16 | 2.229 | 2.625 | 2.162 |
| gust | 7–24 | country:CH | 115095 | 1.298 | 1.536 | 1.357 | 1.603 | 0.49 | 0.61 | 2.32 | 2.464 | 2.661 | 2.322 |
| gust | 7–24 | country:DE | 204289 | 0.952 | 1.097 | 1.481 | 1.662 | 0.76 | 0.90 | 1.80 | 1.813 | 2.759 | 1.799 |
| gust | 7–24 | country:LI | 1155 | 1.106 | 1.141 | 1.381 | 1.381 | 0.62 | 0.99 | 2.04 | 2.044 | 2.585 | 2.044 |
| gust | 7–24 | route:1 | 415710 | 1.096 | 1.280 | 1.409 | 1.626 | 0.65 | 0.80 | 2.06 | 2.108 | 2.702 | 2.060 |
| gust | 25–48 | band:ge800 | 121415 | 1.470 | 1.846 | 1.580 | 1.983 | 0.52 | 0.66 | 2.62 | 2.740 | 3.062 | 2.616 |
| gust | 25–48 | band:lt800 | 427884 | 1.084 | 1.228 | 1.362 | 1.527 | 0.62 | 0.80 | 2.03 | 2.074 | 2.595 | 2.035 |
| gust | 25–48 | country:AT | 125778 | 1.214 | 1.426 | 1.321 | 1.580 | 0.52 | 0.69 | 2.25 | 2.331 | 2.631 | 2.249 |
| gust | 25–48 | country:CH | 152062 | 1.342 | 1.594 | 1.358 | 1.605 | 0.45 | 0.57 | 2.39 | 2.542 | 2.664 | 2.386 |
| gust | 25–48 | country:DE | 269933 | 1.052 | 1.207 | 1.482 | 1.664 | 0.70 | 0.88 | 1.98 | 1.999 | 2.762 | 1.981 |
| gust | 25–48 | country:LI | 1526 | 1.200 | 1.211 | 1.387 | 1.387 | 0.52 | 0.85 | 2.23 | 2.238 | 2.595 | 2.226 |
| gust | 25–48 | route:1 | 549299 | 1.170 | 1.364 | 1.410 | 1.628 | 0.59 | 0.76 | 2.18 | 2.238 | 2.705 | 2.181 |
| gust | 51–120 | band:ge800 | 237072 | 1.677 | 1.884 | 1.817 | 2.351 | 0.52 | 0.70 | 3.04 | 3.142 | 3.565 | 3.036 |
| gust | 51–120 | band:lt800 | 877332 | 1.255 | 1.422 | 1.530 | 1.722 | 0.60 | 0.82 | 2.31 | 2.338 | 2.878 | 2.305 |
| gust | 51–120 | country:AT | 254214 | 1.324 | 1.522 | 1.382 | 1.725 | 0.48 | 0.65 | 2.39 | 2.489 | 2.709 | 2.390 |
| gust | 51–120 | country:CH | 311614 | 1.487 | 1.681 | 1.611 | 1.895 | 0.49 | 0.72 | 2.75 | 2.811 | 3.162 | 2.745 |
| gust | 51–120 | country:DE | 548576 | 1.273 | 1.428 | 1.676 | 1.894 | 0.65 | 0.85 | 2.35 | 2.377 | 3.108 | 2.349 |
| gust | 51–120 | route:1 | 273124 | 1.270 | 1.481 | 1.379 | 1.605 | 0.48 | 0.68 | 2.32 | 2.394 | 2.646 | 2.319 |
| gust | 51–120 | route:3 | 841280 | 1.369 | 1.533 | 1.660 | 1.937 | 0.59 | 0.80 | 2.53 | 2.573 | 3.154 | 2.530 |
| gust | 126–240 | band:ge800 | 112303 | 1.818 | 2.139 | 1.673 | 2.306 | 0.17 | 0.32 | 3.26 | 3.507 | 3.316 | 3.261 |
| gust | 126–240 | band:lt800 | 323759 | 1.579 | 1.751 | 1.530 | 1.686 | 0.22 | 0.44 | 2.78 | 2.895 | 2.852 | 2.778 |
| gust | 126–240 | country:AT | 103705 | 1.589 | 1.816 | 1.442 | 1.807 | 0.16 | 0.28 | 2.76 | 2.986 | 2.796 | 2.762 |
| gust | 126–240 | country:CH | 128171 | 1.608 | 1.823 | 1.473 | 1.793 | 0.16 | 0.29 | 2.83 | 2.995 | 2.857 | 2.828 |
| gust | 126–240 | country:DE | 204186 | 1.688 | 1.886 | 1.689 | 1.899 | 0.26 | 0.49 | 3.03 | 3.146 | 3.138 | 3.026 |
| gust | 126–240 | route:1 | 103800 | 1.534 | 1.735 | 1.370 | 1.599 | 0.13 | 0.24 | 2.60 | 2.848 | 2.624 | 2.597 |
| gust | 126–240 | route:3 | 332262 | 1.674 | 1.887 | 1.628 | 1.923 | 0.22 | 0.44 | 3.00 | 3.129 | 3.081 | 2.999 |
| gust | 246–336 | band:ge800 | 88783 | 1.903 | 2.341 | 1.677 | 2.309 | 0.03 | 0.07 | 3.32 | 3.695 | 3.325 | 3.322 |
| gust | 246–336 | band:lt800 | 255982 | 1.708 | 1.935 | 1.533 | 1.689 | 0.01 | 0.04 | 2.86 | 3.120 | 2.857 | 2.857 |
| gust | 246–336 | country:AT | 81968 | 1.671 | 1.951 | 1.446 | 1.812 | 0.00 | 0.00 | 2.80 | 3.136 | 2.804 | 2.804 |
| gust | 246–336 | country:CH | 101340 | 1.677 | 1.962 | 1.475 | 1.795 | 0.00 | -0.03 | 2.86 | 3.116 | 2.861 | 2.861 |
| gust | 246–336 | country:DE | 161457 | 1.853 | 2.133 | 1.693 | 1.902 | 0.04 | 0.10 | 3.14 | 3.443 | 3.145 | 3.141 |
| gust | 246–336 | route:1 | 78920 | 1.662 | 1.889 | 1.380 | 1.613 | -0.08 | -0.13 | 2.64 | 3.107 | 2.644 | 2.637 |
| gust | 246–336 | route:3 | 265845 | 1.787 | 2.084 | 1.627 | 1.919 | 0.04 | 0.11 | 3.07 | 3.327 | 3.079 | 3.075 |
| clct | 0–6 | band:ge800 | 11842 | 12.733 | 15.374 | 22.706 | 23.113 | 0.76 | 0.94 | 26.33 | 26.418 | 40.361 | 26.335 |
| clct | 0–6 | band:lt800 | 135851 | 12.245 | 14.644 | 21.905 | 22.164 | 0.76 | 0.96 | 25.29 | 25.326 | 39.252 | 25.295 |
| clct | 0–6 | country:DE | 147693 | 12.284 | 14.702 | 21.969 | 22.240 | 0.76 | 0.96 | 25.38 | 25.416 | 39.342 | 25.381 |
| clct | 0–6 | route:1 | 74039 | 13.316 | 16.202 | 23.596 | 23.942 | 0.76 | 0.95 | 26.78 | 26.839 | 41.049 | 26.780 |
| clct | 0–6 | route:2 | 73654 | 11.246 | 13.195 | 20.334 | 20.529 | 0.77 | 0.97 | 23.88 | 23.900 | 37.548 | 23.885 |
| clct | 7–24 | band:ge800 | 18142 | 14.855 | 17.783 | 23.963 | 24.406 | 0.71 | 0.95 | 29.21 | 29.249 | 41.709 | 29.208 |
| clct | 7–24 | band:lt800 | 202808 | 14.866 | 17.455 | 23.588 | 23.925 | 0.70 | 0.94 | 29.22 | 29.285 | 41.029 | 29.217 |
| clct | 7–24 | country:DE | 220950 | 14.865 | 17.482 | 23.619 | 23.965 | 0.70 | 0.94 | 29.22 | 29.282 | 41.085 | 29.216 |
| clct | 7–24 | route:1 | 220950 | 14.865 | 17.482 | 23.619 | 23.965 | 0.70 | 0.94 | 29.22 | 29.282 | 41.085 | 29.216 |
| clct | 25–48 | band:ge800 | 23964 | 17.029 | 19.212 | 23.990 | 24.425 | 0.62 | 0.96 | 32.30 | 32.321 | 41.744 | 32.304 |
| clct | 25–48 | band:lt800 | 267713 | 17.220 | 19.210 | 23.618 | 23.949 | 0.60 | 0.93 | 32.67 | 32.727 | 41.074 | 32.669 |
| clct | 25–48 | country:DE | 291677 | 17.204 | 19.210 | 23.649 | 23.988 | 0.60 | 0.93 | 32.64 | 32.694 | 41.129 | 32.640 |
| clct | 25–48 | route:1 | 291677 | 17.204 | 19.210 | 23.649 | 23.988 | 0.60 | 0.93 | 32.64 | 32.694 | 41.129 | 32.640 |
| clct | 51–120 | band:ge800 | 41004 | 16.648 | 19.257 | 21.295 | 22.059 | 0.53 | 0.93 | 32.82 | 32.857 | 38.788 | 32.816 |
| clct | 51–120 | band:lt800 | 469254 | 17.295 | 19.730 | 21.398 | 21.673 | 0.50 | 0.85 | 33.63 | 33.808 | 38.893 | 33.631 |
| clct | 51–120 | country:DE | 510258 | 17.243 | 19.692 | 21.389 | 21.704 | 0.50 | 0.86 | 33.57 | 33.733 | 38.884 | 33.570 |
| clct | 51–120 | route:1 | 140442 | 19.518 | 21.537 | 23.647 | 23.992 | 0.47 | 0.89 | 36.26 | 36.347 | 41.163 | 36.260 |
| clct | 51–120 | route:3 | 369816 | 16.378 | 18.992 | 20.532 | 20.836 | 0.52 | 0.85 | 32.49 | 32.685 | 37.984 | 32.486 |
| clct | 126–240 | band:ge800 | 22095 | 18.491 | 21.330 | 19.457 | 20.392 | 0.25 | 0.55 | 35.24 | 35.985 | 36.354 | 35.239 |
| clct | 126–240 | band:lt800 | 209609 | 19.666 | 22.572 | 20.881 | 21.172 | 0.25 | 0.59 | 36.88 | 37.508 | 38.152 | 36.876 |
| clct | 126–240 | country:DE | 231704 | 19.554 | 22.454 | 20.745 | 21.098 | 0.25 | 0.58 | 36.72 | 37.365 | 37.984 | 36.724 |
| clct | 126–240 | route:1 | 54598 | 21.650 | 24.059 | 23.312 | 23.661 | 0.23 | 0.58 | 39.47 | 40.087 | 40.680 | 39.469 |
| clct | 126–240 | route:3 | 177106 | 18.908 | 21.959 | 19.954 | 20.308 | 0.26 | 0.58 | 35.83 | 36.486 | 37.113 | 35.835 |
| clct | 246–336 | band:ge800 | 17463 | 19.900 | 23.131 | 19.440 | 20.380 | 0.02 | 0.07 | 36.33 | 38.226 | 36.337 | 36.327 |
| clct | 246–336 | band:lt800 | 165638 | 21.063 | 24.354 | 20.878 | 21.166 | 0.04 | 0.12 | 38.13 | 39.873 | 38.159 | 38.127 |
| clct | 246–336 | country:DE | 183101 | 20.952 | 24.237 | 20.741 | 21.091 | 0.04 | 0.11 | 37.96 | 39.719 | 37.989 | 37.960 |
| clct | 246–336 | route:1 | 41480 | 22.400 | 25.472 | 22.925 | 23.292 | 0.03 | 0.06 | 40.09 | 41.886 | 40.099 | 40.090 |
| clct | 246–336 | route:3 | 141621 | 20.528 | 23.876 | 20.101 | 20.447 | 0.04 | 0.13 | 37.31 | 39.061 | 37.349 | 37.311 |

## D3 Wind-Standortabhängigkeit (V-FL-38) — fl-K je Bin × Gruppe, Rice vor dem Gesetz, Gitter-Refit je Gruppe

Gespeicherte ws-Zeilen: 1600000 (jede 2. Stride-Zeile). „Gesetz" = die geschriebene Speed-Verteilung des Stratums (TN, oder die Rice wo `no-skill`: Anteil „Gesetz aktiv" in der Spalte); „Rice" = die u/v-Rice vor dem Gesetz (out-of-fold μ, gepoolte σ). Refit: Gitter a ∈ {−1,8 … 0,3 / 0,15} × b ∈ {0,7 … 1,2} × c ∈ {0,8 … 1,8 / 0,1} (990 Tripel) per geschlossenem TN-CRPS auf ≤ 20000 gleichmäßig gezogenen Zeilen der Gruppe, dann auf ALLEN Zeilen der Gruppe bewertet — **in-sample je Gruppe (keine Falten): eine Obergrenze für V-FL-38, kein Ergebnis.** Rand = Optimum am Gitterrand. Terzilgrenzen (Standortebene, 405 Punkte): lnZ0 -2.31 / -1.52, tpi2000 -11.7 / 2.3 m.

| Bin | Gruppe | n | Gesetz aktiv | Bias | MAE | CRPS Gesetz | CRPS Rice | PIT außen Gesetz | Rice | Optimum (a, b, c) | Rand | CRPS Opt | Δ vs Gesetz | Δ vs Rice | PIT außen Opt |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0–6 | all | 145477 | 1.00 | -0.083 | 1.062 | 0.753 | 0.774 | 0.209 | 0.275 | (-1.05, 1.2, 1.2) | b | 0.752 | -0.1 % | -2.8 % | 0.194 |
| 0–6 | country:DE | 76032 | 1.00 | -0.329 | 0.980 | 0.712 | 0.693 | 0.183 | 0.210 | (-0.45, 1.1, 1.1) | — | 0.691 | -2.9 % | -0.3 % | 0.180 |
| 0–6 | country:AT | 31441 | 1.00 | 0.195 | 1.114 | 0.771 | 0.839 | 0.251 | 0.363 | (-1.65, 1.2, 1.3) | b | 0.743 | -3.6 % | -11.4 % | 0.200 |
| 0–6 | country:CH | 37528 | 1.00 | 0.176 | 1.187 | 0.823 | 0.884 | 0.226 | 0.331 | (-1.35, 1.1, 1.3) | — | 0.806 | -2.1 % | -8.8 % | 0.182 |
| 0–6 | band:lt800 | 115026 | 1.00 | -0.069 | 0.929 | 0.658 | 0.679 | 0.197 | 0.262 | (-0.75, 1.1, 1.1) | — | 0.657 | -0.2 % | -3.2 % | 0.210 |
| 0–6 | band:ge800 | 30451 | 1.00 | -0.138 | 1.568 | 1.111 | 1.133 | 0.252 | 0.324 | (-1.2, 1.2, 1.3) | b | 1.106 | -0.4 % | -2.4 % | 0.211 |
| 0–6 | lnZ0:lnZ0 T1 | 50530 | 1.00 | -0.060 | 1.204 | 0.857 | 0.877 | 0.219 | 0.285 | (-0.75, 1.1, 1.2) | — | 0.857 | 0.1 % | -2.2 % | 0.204 |
| 0–6 | lnZ0:lnZ0 T2 | 48641 | 1.00 | -0.006 | 0.932 | 0.654 | 0.688 | 0.191 | 0.268 | (-1.05, 1.2, 1.1) | b | 0.650 | -0.6 % | -5.6 % | 0.203 |
| 0–6 | lnZ0:lnZ0 T3 | 46306 | 1.00 | -0.190 | 1.045 | 0.744 | 0.751 | 0.216 | 0.271 | (-0.9, 1.2, 1.2) | b | 0.731 | -1.8 % | -2.6 % | 0.196 |
| 0–6 | tpi2000:tpi T1 | 49881 | 1.00 | 0.149 | 0.994 | 0.687 | 0.750 | 0.240 | 0.355 | (-1.5, 1.2, 1.3) | b | 0.670 | -2.5 % | -10.6 % | 0.194 |
| 0–6 | tpi2000:tpi T2 | 49156 | 1.00 | -0.130 | 0.929 | 0.665 | 0.676 | 0.201 | 0.252 | (-0.6, 1.1, 1.1) | — | 0.663 | -0.3 % | -1.9 % | 0.210 |
| 0–6 | tpi2000:tpi T3 | 46440 | 1.00 | -0.283 | 1.278 | 0.917 | 0.903 | 0.183 | 0.213 | (-0.45, 1.1, 1.1) | — | 0.904 | -1.4 % | 0.1 % | 0.189 |
| 0–6 | height:<300 | 52877 | 1.00 | -0.163 | 0.925 | 0.665 | 0.667 | 0.185 | 0.232 | (-0.6, 1.1, 1.1) | — | 0.659 | -0.8 % | -1.2 % | 0.194 |
| 0–6 | height:300–800 | 62149 | 1.00 | 0.012 | 0.932 | 0.653 | 0.689 | 0.208 | 0.287 | (-1.05, 1.2, 1.1) | b | 0.645 | -1.2 % | -6.4 % | 0.214 |
| 0–6 | height:800–1500 | 17070 | 1.00 | -0.152 | 1.318 | 0.931 | 0.973 | 0.245 | 0.335 | (-1.2, 1.2, 1.3) | b | 0.917 | -1.5 % | -5.7 % | 0.200 |
| 0–6 | height:≥1500 | 13381 | 1.00 | -0.121 | 1.887 | 1.341 | 1.337 | 0.260 | 0.311 | (-0.45, 1, 1.3) | — | 1.337 | -0.3 % | -0.0 % | 0.219 |
| 0–6 | hour:night | 53085 | 1.00 | -0.049 | 1.054 | 0.742 | 0.784 | 0.243 | 0.334 | (-1.2, 1.2, 1.3) | b | 0.737 | -0.7 % | -6.0 % | 0.204 |
| 0–6 | hour:day | 49369 | 1.00 | -0.124 | 1.129 | 0.807 | 0.804 | 0.178 | 0.218 | (-0.6, 1.1, 1.1) | — | 0.805 | -0.3 % | 0.0 % | 0.191 |
| 0–6 | hour:trans | 43023 | 1.00 | -0.079 | 0.998 | 0.704 | 0.725 | 0.202 | 0.268 | (-1.05, 1.2, 1.2) | b | 0.700 | -0.5 % | -3.5 % | 0.187 |
| 7–24 | all | 201958 | 1.00 | -0.014 | 1.058 | 0.748 | 0.763 | 0.201 | 0.261 | (-0.9, 1.2, 1.1) | b | 0.745 | -0.3 % | -2.3 % | 0.212 |
| 7–24 | country:DE | 105551 | 1.00 | -0.240 | 0.982 | 0.710 | 0.707 | 0.168 | 0.206 | (-0.45, 1.1, 1.1) | — | 0.703 | -1.0 % | -0.6 % | 0.179 |
| 7–24 | country:AT | 43273 | 1.00 | 0.324 | 1.117 | 0.765 | 0.810 | 0.255 | 0.350 | (-1.65, 1.2, 1.4) | b | 0.721 | -5.7 % | -10.9 % | 0.172 |
| 7–24 | country:CH | 52608 | 1.00 | 0.157 | 1.162 | 0.809 | 0.837 | 0.223 | 0.299 | (-1.05, 1.1, 1.2) | — | 0.791 | -2.2 % | -5.5 % | 0.194 |
| 7–24 | band:lt800 | 160096 | 1.00 | 0.015 | 0.956 | 0.674 | 0.692 | 0.189 | 0.251 | (-0.9, 1.2, 1.1) | b | 0.671 | -0.5 % | -3.0 % | 0.199 |
| 7–24 | band:ge800 | 41862 | 1.00 | -0.125 | 1.449 | 1.028 | 1.035 | 0.247 | 0.302 | (-0.75, 1.1, 1.4) | — | 1.024 | -0.4 % | -1.1 % | 0.185 |
| 7–24 | lnZ0:lnZ0 T1 | 67319 | 1.00 | -0.010 | 1.191 | 0.843 | 0.856 | 0.213 | 0.272 | (-0.75, 1.1, 1.2) | — | 0.842 | -0.0 % | -1.5 % | 0.197 |
| 7–24 | lnZ0:lnZ0 T2 | 67853 | 1.00 | 0.012 | 0.966 | 0.680 | 0.699 | 0.185 | 0.250 | (-0.9, 1.2, 1) | b | 0.674 | -0.9 % | -3.6 % | 0.227 |
| 7–24 | lnZ0:lnZ0 T3 | 66786 | 1.00 | -0.045 | 1.017 | 0.720 | 0.734 | 0.205 | 0.263 | (-0.9, 1.2, 1.2) | b | 0.717 | -0.4 % | -2.3 % | 0.189 |
| 7–24 | tpi2000:tpi T1 | 69591 | 1.00 | 0.190 | 1.014 | 0.701 | 0.741 | 0.242 | 0.333 | (-1.35, 1.2, 1.3) | b | 0.678 | -3.4 % | -8.5 % | 0.187 |
| 7–24 | tpi2000:tpi T2 | 66828 | 1.00 | -0.081 | 0.952 | 0.679 | 0.690 | 0.184 | 0.239 | (-0.9, 1.2, 1.2) | b | 0.679 | -0.0 % | -1.7 % | 0.170 |
| 7–24 | tpi2000:tpi T3 | 65539 | 1.00 | -0.164 | 1.212 | 0.866 | 0.861 | 0.175 | 0.209 | (-0.45, 1.1, 1.1) | — | 0.863 | -0.3 % | 0.3 % | 0.189 |
| 7–24 | height:<300 | 74152 | 1.00 | -0.094 | 0.951 | 0.680 | 0.687 | 0.170 | 0.222 | (-0.6, 1.1, 1.1) | — | 0.680 | -0.0 % | -1.1 % | 0.185 |
| 7–24 | height:300–800 | 85944 | 1.00 | 0.109 | 0.960 | 0.669 | 0.696 | 0.206 | 0.276 | (-1.05, 1.2, 1.1) | b | 0.658 | -1.7 % | -5.4 % | 0.207 |
| 7–24 | height:800–1500 | 23566 | 1.00 | -0.170 | 1.239 | 0.880 | 0.903 | 0.232 | 0.300 | (-1.05, 1.2, 1.4) | b | 0.868 | -1.5 % | -4.0 % | 0.167 |
| 7–24 | height:≥1500 | 18296 | 1.00 | -0.068 | 1.720 | 1.217 | 1.205 | 0.265 | 0.305 | (0.15, 0.8, 1.4) | — | 1.198 | -1.6 % | -0.5 % | 0.198 |
| 7–24 | hour:night | 68235 | 1.00 | 0.029 | 1.041 | 0.730 | 0.767 | 0.253 | 0.339 | (-1.2, 1.2, 1.4) | b | 0.717 | -1.8 % | -6.5 % | 0.188 |
| 7–24 | hour:day | 67592 | 1.00 | -0.077 | 1.149 | 0.821 | 0.813 | 0.164 | 0.197 | (-0.15, 1, 1) | — | 0.818 | -0.4 % | 0.6 % | 0.209 |
| 7–24 | hour:trans | 66131 | 1.00 | 0.004 | 0.981 | 0.690 | 0.707 | 0.185 | 0.247 | (-0.9, 1.2, 1.1) | b | 0.687 | -0.4 % | -2.9 % | 0.196 |
| 25–48 | all | 273491 | 1.00 | -0.164 | 1.087 | 0.776 | 0.799 | 0.193 | 0.262 | (-1.05, 1.2, 1.1) | b | 0.771 | -0.6 % | -3.5 % | 0.204 |
| 25–48 | country:DE | 142936 | 1.00 | -0.402 | 1.057 | 0.771 | 0.751 | 0.175 | 0.202 | (-0.45, 1.1, 1) | — | 0.745 | -3.3 % | -0.8 % | 0.206 |
| 25–48 | country:AT | 58789 | 1.00 | 0.189 | 1.094 | 0.753 | 0.842 | 0.223 | 0.357 | (-1.8, 1.2, 1.3) | ab | 0.731 | -2.9 % | -13.2 % | 0.181 |
| 25–48 | country:CH | 71054 | 1.00 | 0.015 | 1.144 | 0.805 | 0.862 | 0.204 | 0.305 | (-1.5, 1.2, 1.3) | b | 0.799 | -0.8 % | -7.3 % | 0.173 |
| 25–48 | band:lt800 | 216762 | 1.00 | -0.129 | 0.988 | 0.703 | 0.730 | 0.181 | 0.251 | (-1.05, 1.2, 1.1) | b | 0.698 | -0.7 % | -4.5 % | 0.191 |
| 25–48 | band:ge800 | 56729 | 1.00 | -0.298 | 1.468 | 1.053 | 1.064 | 0.238 | 0.305 | (-1.2, 1.2, 1.4) | b | 1.044 | -0.9 % | -1.8 % | 0.179 |
| 25–48 | lnZ0:lnZ0 T1 | 91104 | 1.00 | -0.186 | 1.224 | 0.872 | 0.891 | 0.206 | 0.275 | (-1.05, 1.2, 1.2) | b | 0.870 | -0.3 % | -2.3 % | 0.192 |
| 25–48 | lnZ0:lnZ0 T2 | 91786 | 1.00 | -0.126 | 1.002 | 0.713 | 0.743 | 0.181 | 0.253 | (-1.05, 1.2, 1) | b | 0.708 | -0.7 % | -4.8 % | 0.220 |
| 25–48 | lnZ0:lnZ0 T3 | 90601 | 1.00 | -0.182 | 1.037 | 0.741 | 0.764 | 0.191 | 0.259 | (-1.05, 1.2, 1.1) | b | 0.735 | -0.8 % | -3.8 % | 0.201 |
| 25–48 | tpi2000:tpi T1 | 94310 | 1.00 | 0.073 | 0.994 | 0.693 | 0.768 | 0.214 | 0.336 | (-1.5, 1.2, 1.3) | b | 0.684 | -1.3 % | -10.9 % | 0.179 |
| 25–48 | tpi2000:tpi T2 | 90238 | 1.00 | -0.233 | 1.006 | 0.723 | 0.733 | 0.183 | 0.237 | (-0.9, 1.2, 1.1) | b | 0.714 | -1.3 % | -2.6 % | 0.190 |
| 25–48 | tpi2000:tpi T3 | 88943 | 1.00 | -0.347 | 1.268 | 0.916 | 0.900 | 0.180 | 0.210 | (-0.6, 1.1, 1.2) | — | 0.901 | -1.6 % | 0.1 % | 0.159 |
| 25–48 | height:<300 | 99869 | 1.00 | -0.256 | 1.011 | 0.729 | 0.732 | 0.172 | 0.219 | (-0.6, 1.1, 1) | — | 0.718 | -1.5 % | -1.9 % | 0.210 |
| 25–48 | height:300–800 | 116893 | 1.00 | -0.022 | 0.968 | 0.680 | 0.729 | 0.189 | 0.279 | (-1.2, 1.2, 1.1) | b | 0.676 | -0.7 % | -7.3 % | 0.197 |
| 25–48 | height:800–1500 | 31968 | 1.00 | -0.303 | 1.270 | 0.914 | 0.944 | 0.222 | 0.306 | (-1.2, 1.2, 1.4) | b | 0.900 | -1.5 % | -4.6 % | 0.166 |
| 25–48 | height:≥1500 | 24761 | 1.00 | -0.292 | 1.724 | 1.233 | 1.218 | 0.258 | 0.303 | (-0.15, 0.9, 1.4) | — | 1.213 | -1.7 % | -0.4 % | 0.194 |
| 25–48 | hour:night | 93206 | 1.00 | -0.130 | 1.044 | 0.741 | 0.796 | 0.233 | 0.342 | (-1.35, 1.2, 1.4) | b | 0.734 | -1.0 % | -7.9 % | 0.182 |
| 25–48 | hour:day | 90481 | 1.00 | -0.251 | 1.205 | 0.867 | 0.851 | 0.165 | 0.190 | (-0.15, 1, 1) | — | 0.854 | -1.5 % | 0.4 % | 0.203 |
| 25–48 | hour:trans | 89804 | 1.00 | -0.113 | 1.014 | 0.719 | 0.751 | 0.179 | 0.252 | (-1.05, 1.2, 1.1) | b | 0.716 | -0.4 % | -4.7 % | 0.190 |
| 51–120 | all | 561935 | 1.00 | -0.044 | 1.277 | 0.903 | 0.937 | 0.229 | 0.314 | (-1.35, 1.2, 1.3) | b | 0.902 | -0.2 % | -3.8 % | 0.201 |
| 51–120 | country:DE | 291915 | 1.00 | -0.230 | 1.225 | 0.880 | 0.889 | 0.172 | 0.229 | (-1.05, 1.2, 1.2) | b | 0.876 | -0.4 % | -1.5 % | 0.165 |
| 51–120 | country:AT | 121339 | 1.00 | 0.312 | 1.249 | 0.847 | 0.922 | 0.283 | 0.409 | (-1.5, 1, 1.3) | — | 0.810 | -4.3 % | -12.1 % | 0.236 |
| 51–120 | country:CH | 148681 | 1.00 | 0.030 | 1.402 | 0.996 | 1.043 | 0.298 | 0.404 | (-1.65, 1.1, 1.5) | — | 0.982 | -1.4 % | -5.9 % | 0.237 |
| 51–120 | band:lt800 | 448839 | 1.00 | 0.039 | 1.168 | 0.815 | 0.861 | 0.204 | 0.297 | (-1.35, 1.2, 1.1) | b | 0.808 | -0.9 % | -6.2 % | 0.219 |
| 51–120 | band:ge800 | 113096 | 1.00 | -0.372 | 1.709 | 1.254 | 1.240 | 0.329 | 0.382 | (-0.3, 0.9, 1.5) | — | 1.229 | -2.0 % | -0.9 % | 0.253 |
| 51–120 | lnZ0:lnZ0 T1 | 156624 | 1.00 | -0.129 | 1.504 | 1.069 | 1.091 | 0.255 | 0.336 | (-1.35, 1.2, 1.3) | b | 1.065 | -0.4 % | -2.4 % | 0.225 |
| 51–120 | lnZ0:lnZ0 T2 | 191504 | 1.00 | -0.123 | 1.235 | 0.881 | 0.909 | 0.220 | 0.297 | (-1.2, 1.2, 1.2) | b | 0.877 | -0.4 % | -3.5 % | 0.214 |
| 51–120 | lnZ0:lnZ0 T3 | 213807 | 1.00 | 0.090 | 1.149 | 0.802 | 0.850 | 0.219 | 0.313 | (-1.05, 1.1, 1.1) | — | 0.798 | -0.6 % | -6.1 % | 0.234 |
| 51–120 | tpi2000:tpi T1 | 199760 | 1.00 | 0.108 | 1.204 | 0.847 | 0.908 | 0.314 | 0.437 | (-0.9, 0.9, 1.3) | — | 0.828 | -2.2 % | -8.8 % | 0.270 |
| 51–120 | tpi2000:tpi T2 | 162402 | 1.00 | -0.155 | 1.132 | 0.809 | 0.830 | 0.177 | 0.245 | (-1.05, 1.2, 1.1) | b | 0.803 | -0.7 % | -3.2 % | 0.197 |
| 51–120 | tpi2000:tpi T3 | 199773 | 1.00 | -0.106 | 1.468 | 1.037 | 1.053 | 0.188 | 0.248 | (-1.2, 1.2, 1.2) | b | 1.037 | 0.0 % | -1.6 % | 0.183 |
| 51–120 | height:<300 | 201012 | 1.00 | -0.223 | 1.167 | 0.837 | 0.846 | 0.181 | 0.242 | (-0.75, 1.1, 1.1) | — | 0.833 | -0.5 % | -1.5 % | 0.201 |
| 51–120 | height:300–800 | 247827 | 1.00 | 0.251 | 1.169 | 0.797 | 0.873 | 0.223 | 0.342 | (-1.65, 1.2, 1.1) | b | 0.768 | -3.6 % | -12.0 % | 0.220 |
| 51–120 | height:800–1500 | 65129 | 1.00 | -0.253 | 1.507 | 1.090 | 1.110 | 0.299 | 0.371 | (-1.05, 1.1, 1.5) | — | 1.083 | -0.6 % | -2.4 % | 0.233 |
| 51–120 | height:≥1500 | 47967 | 1.00 | -0.534 | 1.983 | 1.476 | 1.416 | 0.369 | 0.396 | (0.3, 0.7, 1.7) | ab | 1.389 | -5.9 % | -1.9 % | 0.246 |
| 51–120 | hour:night | 155261 | 1.00 | -0.016 | 1.280 | 0.905 | 0.965 | 0.261 | 0.369 | (-1.5, 1.2, 1.3) | b | 0.894 | -1.2 % | -7.3 % | 0.229 |
| 51–120 | hour:day | 148826 | 1.00 | -0.169 | 1.385 | 0.995 | 0.990 | 0.211 | 0.263 | (-0.3, 1, 1.1) | — | 0.992 | -0.4 % | 0.2 % | 0.234 |
| 51–120 | hour:trans | 257848 | 1.00 | 0.012 | 1.213 | 0.849 | 0.890 | 0.221 | 0.311 | (-1.35, 1.2, 1.2) | b | 0.845 | -0.5 % | -5.0 % | 0.213 |
| 126–240 | all | 231715 | 0.79 | -0.024 | 1.431 | 1.011 | 1.037 | 0.238 | 0.318 | (-0.9, 1, 1.3) | — | 1.011 | 0.1 % | -2.5 % | 0.222 |
| 126–240 | country:DE | 119909 | 0.79 | -0.232 | 1.451 | 1.037 | 1.036 | 0.178 | 0.230 | (-0.45, 1, 1.2) | — | 1.034 | -0.3 % | -0.2 % | 0.179 |
| 126–240 | country:AT | 49999 | 0.79 | 0.366 | 1.374 | 0.929 | 0.996 | 0.287 | 0.408 | (-0.75, 0.7, 1.3) | b | 0.879 | -5.3 % | -11.7 % | 0.239 |
| 126–240 | country:CH | 61807 | 0.79 | 0.064 | 1.439 | 1.026 | 1.073 | 0.315 | 0.416 | (-0.45, 0.7, 1.3) | b | 1.003 | -2.3 % | -6.5 % | 0.286 |
| 126–240 | band:lt800 | 177558 | 0.79 | 0.045 | 1.319 | 0.917 | 0.952 | 0.212 | 0.298 | (-1.2, 1.1, 1.3) | — | 0.915 | -0.3 % | -3.9 % | 0.193 |
| 126–240 | band:ge800 | 54157 | 0.79 | -0.249 | 1.798 | 1.318 | 1.318 | 0.324 | 0.385 | (0, 0.7, 1.5) | b | 1.298 | -1.5 % | -1.5 % | 0.266 |
| 126–240 | lnZ0:lnZ0 T1 | 50273 | 0.79 | -0.302 | 1.823 | 1.331 | 1.311 | 0.311 | 0.364 | (0.15, 0.8, 1.3) | — | 1.313 | -1.4 % | 0.2 % | 0.292 |
| 126–240 | lnZ0:lnZ0 T2 | 79725 | 0.79 | -0.152 | 1.418 | 1.004 | 1.040 | 0.222 | 0.309 | (-1.65, 1.2, 1.5) | b | 0.992 | -1.2 % | -4.6 % | 0.175 |
| 126–240 | lnZ0:lnZ0 T3 | 101717 | 0.79 | 0.214 | 1.247 | 0.857 | 0.900 | 0.215 | 0.302 | (-0.15, 0.7, 1.2) | b | 0.837 | -2.3 % | -7.0 % | 0.210 |
| 126–240 | tpi2000:tpi T1 | 82620 | 0.79 | 0.213 | 1.364 | 0.956 | 1.014 | 0.332 | 0.442 | (-0.3, 0.7, 1.1) | b | 0.909 | -4.9 % | -10.3 % | 0.316 |
| 126–240 | tpi2000:tpi T2 | 55340 | 0.78 | -0.145 | 1.249 | 0.886 | 0.896 | 0.172 | 0.237 | (-1.05, 1.2, 1.1) | b | 0.879 | -0.8 % | -1.9 % | 0.194 |
| 126–240 | tpi2000:tpi T3 | 93755 | 0.79 | -0.161 | 1.597 | 1.132 | 1.141 | 0.194 | 0.257 | (-0.6, 1, 1.2) | — | 1.134 | 0.2 % | -0.6 % | 0.201 |
| 126–240 | height:<300 | 87692 | 0.79 | -0.137 | 1.347 | 0.954 | 0.959 | 0.184 | 0.249 | (-0.75, 1.1, 1.1) | — | 0.953 | -0.1 % | -0.6 % | 0.212 |
| 126–240 | height:300–800 | 89866 | 0.79 | 0.222 | 1.292 | 0.881 | 0.944 | 0.239 | 0.345 | (-1.65, 1.1, 1.4) | — | 0.862 | -2.1 % | -8.7 % | 0.197 |
| 126–240 | height:800–1500 | 32471 | 0.79 | 0.003 | 1.758 | 1.229 | 1.287 | 0.284 | 0.368 | (-1.8, 1.1, 1.5) | a | 1.207 | -1.8 % | -6.2 % | 0.236 |
| 126–240 | height:≥1500 | 21686 | 0.80 | -0.626 | 1.859 | 1.450 | 1.365 | 0.384 | 0.409 | (0.3, 0.7, 1.5) | ab | 1.341 | -7.5 % | -1.7 % | 0.313 |
| 126–240 | hour:night | 57671 | 0.78 | 0.018 | 1.473 | 1.044 | 1.095 | 0.278 | 0.373 | (-1.65, 1.1, 1.5) | — | 1.029 | -1.4 % | -6.0 % | 0.224 |
| 126–240 | hour:day | 61026 | 0.81 | -0.229 | 1.657 | 1.197 | 1.187 | 0.223 | 0.280 | (0.3, 0.8, 1.2) | a | 1.182 | -1.2 % | -0.4 % | 0.229 |
| 126–240 | hour:trans | 113018 | 0.79 | 0.065 | 1.288 | 0.893 | 0.927 | 0.226 | 0.310 | (-0.9, 1, 1.3) | — | 0.892 | -0.2 % | -3.8 % | 0.209 |
| 246–336 | all | 185424 | 1.00 | -0.078 | 1.505 | 1.066 | 1.126 | 0.220 | 0.331 | (-0.75, 0.7, 1.5) | b | 1.065 | -0.1 % | -5.4 % | 0.189 |
| 246–336 | country:DE | 95990 | 1.00 | -0.337 | 1.552 | 1.120 | 1.131 | 0.170 | 0.240 | (-0.9, 1, 1.3) | — | 1.114 | -0.6 % | -1.5 % | 0.158 |
| 246–336 | country:AT | 39987 | 1.00 | 0.363 | 1.417 | 0.951 | 1.083 | 0.252 | 0.425 | (-1.05, 0.7, 1.3) | b | 0.904 | -4.9 % | -16.5 % | 0.233 |
| 246–336 | country:CH | 49447 | 1.00 | 0.066 | 1.484 | 1.053 | 1.150 | 0.293 | 0.431 | (-0.6, 0.7, 1.2) | b | 1.029 | -2.3 % | -10.5 % | 0.291 |
| 246–336 | band:lt800 | 142102 | 1.00 | 0.024 | 1.403 | 0.974 | 1.051 | 0.193 | 0.316 | (-1.65, 1.1, 1.3) | — | 0.972 | -0.3 % | -7.6 % | 0.186 |
| 246–336 | band:ge800 | 43322 | 1.00 | -0.414 | 1.837 | 1.367 | 1.370 | 0.310 | 0.382 | (-0.15, 0.7, 1.5) | b | 1.339 | -2.0 % | -2.3 % | 0.262 |
| 246–336 | lnZ0:lnZ0 T1 | 40216 | 1.00 | -0.428 | 1.923 | 1.412 | 1.394 | 0.301 | 0.364 | (0.3, 0.7, 1.3) | ab | 1.374 | -2.7 % | -1.4 % | 0.287 |
| 246–336 | lnZ0:lnZ0 T2 | 63779 | 1.00 | -0.199 | 1.519 | 1.080 | 1.146 | 0.208 | 0.330 | (-1.8, 1.2, 1.3) | ab | 1.066 | -1.2 % | -7.0 % | 0.199 |
| 246–336 | lnZ0:lnZ0 T3 | 81429 | 1.00 | 0.189 | 1.288 | 0.884 | 0.978 | 0.190 | 0.316 | (-0.45, 0.7, 1.2) | b | 0.868 | -1.9 % | -11.2 % | 0.198 |
| 246–336 | tpi2000:tpi T1 | 66107 | 1.00 | 0.185 | 1.408 | 0.983 | 1.097 | 0.305 | 0.457 | (-0.6, 0.7, 1.1) | b | 0.942 | -4.2 % | -14.1 % | 0.309 |
| 246–336 | tpi2000:tpi T2 | 44307 | 1.00 | -0.178 | 1.333 | 0.947 | 0.984 | 0.157 | 0.249 | (-1.5, 1.2, 1.1) | b | 0.942 | -0.5 % | -4.2 % | 0.186 |
| 246–336 | tpi2000:tpi T3 | 75010 | 1.00 | -0.251 | 1.692 | 1.209 | 1.236 | 0.183 | 0.269 | (-1.05, 1, 1.3) | — | 1.207 | -0.1 % | -2.3 % | 0.175 |
| 246–336 | height:<300 | 70204 | 1.00 | -0.193 | 1.442 | 1.024 | 1.051 | 0.170 | 0.260 | (-0.9, 1, 1.2) | — | 1.022 | -0.1 % | -2.7 % | 0.181 |
| 246–336 | height:300–800 | 71898 | 1.00 | 0.236 | 1.366 | 0.926 | 1.052 | 0.216 | 0.370 | (-1.65, 0.8, 1.5) | — | 0.903 | -2.5 % | -14.1 % | 0.182 |
| 246–336 | height:800–1500 | 25983 | 1.00 | -0.184 | 1.802 | 1.282 | 1.361 | 0.262 | 0.370 | (-1.8, 1, 1.6) | a | 1.265 | -1.3 % | -7.1 % | 0.218 |
| 246–336 | height:≥1500 | 17339 | 1.00 | -0.759 | 1.890 | 1.494 | 1.384 | 0.382 | 0.400 | (0.3, 0.7, 1.4) | ab | 1.356 | -9.2 % | -2.0 % | 0.317 |
| 246–336 | hour:night | 46104 | 1.00 | -0.069 | 1.521 | 1.086 | 1.178 | 0.254 | 0.392 | (-1.8, 0.9, 1.6) | a | 1.076 | -1.0 % | -8.7 % | 0.208 |
| 246–336 | hour:day | 48861 | 1.00 | -0.286 | 1.775 | 1.285 | 1.288 | 0.217 | 0.287 | (0.3, 0.7, 1.2) | ab | 1.260 | -2.0 % | -2.2 % | 0.221 |
| 246–336 | hour:trans | 90459 | 1.00 | 0.029 | 1.351 | 0.937 | 1.012 | 0.205 | 0.324 | (-0.9, 0.8, 1.4) | — | 0.935 | -0.2 % | -7.5 % | 0.186 |

### D3 lineares Gesetz a = a0 + a1·lnZ0 + a2·tpi2000/100 + a3·h_true/1000 (b, c = Median der Gruppenoptima, Koordinatensuche in-sample je Bin)

| Bin | n | b, c | a0 | a1 (lnZ0) | a2 (tpi hm) | a3 (h km) | CRPS linear | CRPS Gesetz | CRPS Rice | CRPS bestes globales Tripel | Δ linear vs Gesetz | Δ vs globales Optimum | PIT außen linear |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0–6 | 145477 | 1.2, 1.2 | -0.90 | 0.10 | 0.05 | 0.00 | 0.749 | 0.753 | 0.774 | 0.752 | -0.5 % | -0.4 % | 0.193 |
| 7–24 | 201958 | 1.2, 1.2 | -1.05 | 0.00 | 0.00 | 0.00 | 0.746 | 0.748 | 0.763 | 0.745 | -0.2 % | 0.1 % | 0.185 |
| 25–48 | 273491 | 1.2, 1.2 | -1.05 | 0.05 | 0.05 | 0.00 | 0.771 | 0.776 | 0.799 | 0.771 | -0.6 % | -0.0 % | 0.179 |
| 51–120 | 561935 | 1.2, 1.2 | -1.35 | -0.05 | -0.10 | 0.00 | 0.899 | 0.903 | 0.937 | 0.902 | -0.5 % | -0.3 % | 0.223 |
| 126–240 | 231715 | 1, 1.3 | -1.20 | -0.25 | -0.05 | 0.00 | 1.002 | 1.011 | 1.037 | 1.011 | -0.9 % | -0.9 % | 0.220 |
| 246–336 | 185424 | 0.8, 1.3 | -0.90 | -0.25 | 0.05 | 0.00 | 1.054 | 1.066 | 1.126 | 1.065 | -1.2 % | -1.0 % | 0.212 |

## D4 T/Td-Plateau — Residuum e = y − μ_K (out of fold), Bins 0–3

(a) bedingter Bias mean(e), Varianzverhältnis VR = mean(e²)/mean(σ_K²) (VR > 1 ⇒ σ zu klein), n. Zeilen: fl-K, Cube und beide Klimatologien vorhanden (wie D1/D2).

**t · 0–6 · Sonnenstunde (8 × 3 h) × Saison**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| 0|DJF | 6025 | -0.145 | 1.727 | 1.331 | 1.68 |
| 1|DJF | 5379 | -0.058 | 1.661 | 1.377 | 1.45 |
| 2|DJF | 5652 | -0.023 | 1.510 | 1.287 | 1.38 |
| 3|DJF | 5931 | -0.030 | 1.794 | 1.295 | 1.92 |
| 4|DJF | 6025 | -0.081 | 1.531 | 1.158 | 1.75 |
| 5|DJF | 5381 | -0.266 | 1.619 | 1.166 | 1.93 |
| 6|DJF | 5651 | -0.069 | 1.383 | 1.149 | 1.45 |
| 7|DJF | 5933 | 0.209 | 1.595 | 1.300 | 1.50 |
| 0|MAM | 6132 | -0.167 | 1.412 | 1.334 | 1.12 |
| 1|MAM | 5493 | -0.097 | 1.534 | 1.392 | 1.21 |
| 2|MAM | 5776 | 0.276 | 1.219 | 1.294 | 0.89 |
| 3|MAM | 6053 | 0.131 | 1.266 | 1.295 | 0.96 |
| 4|MAM | 6134 | 0.117 | 1.249 | 1.199 | 1.08 |
| 5|MAM | 5497 | 0.324 | 1.190 | 1.203 | 0.98 |
| 6|MAM | 5774 | 0.158 | 1.312 | 1.165 | 1.27 |
| 7|MAM | 6050 | 0.140 | 1.405 | 1.307 | 1.16 |
| 0|JJA | 15988 | -0.082 | 1.487 | 1.364 | 1.19 |
| 1|JJA | 14636 | -0.074 | 1.474 | 1.363 | 1.17 |
| 2|JJA | 15262 | -0.046 | 1.203 | 1.192 | 1.02 |
| 3|JJA | 16020 | 0.015 | 1.227 | 1.130 | 1.18 |
| 4|JJA | 16194 | -0.166 | 1.307 | 1.130 | 1.34 |
| 5|JJA | 14824 | 0.052 | 1.427 | 1.260 | 1.28 |
| 6|JJA | 15387 | 0.057 | 1.428 | 1.302 | 1.20 |
| 7|JJA | 16079 | 0.198 | 1.544 | 1.372 | 1.27 |
| 0|SON | 10266 | -0.115 | 1.427 | 1.341 | 1.13 |
| 1|SON | 9280 | -0.048 | 1.455 | 1.364 | 1.14 |
| 2|SON | 9680 | -0.121 | 1.253 | 1.233 | 1.03 |
| 3|SON | 10118 | 0.031 | 1.212 | 1.198 | 1.02 |
| 4|SON | 10271 | 0.127 | 1.166 | 1.129 | 1.07 |
| 5|SON | 9281 | 0.001 | 1.135 | 1.182 | 0.92 |
| 6|SON | 9684 | -0.069 | 1.280 | 1.202 | 1.13 |
| 7|SON | 10134 | 0.114 | 1.368 | 1.326 | 1.06 |

**t · 0–6 · dTsfc-Quintile (Entkopplungs-Proxy, zeilengewichtet)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 -21.5 K…-4.0 K | 63731 | -0.052 | 1.537 | 1.166 | 1.74 |
| Q2 -4.0 K…-1.5 K | 63698 | -0.032 | 1.537 | 1.346 | 1.30 |
| Q3 -1.5 K…0.0 K | 51995 | 0.047 | 1.375 | 1.364 | 1.02 |
| Q4 0.0 K…2.5 K | 62253 | 0.027 | 1.334 | 1.320 | 1.02 |
| Q5 2.5 K…8.5 K | 54313 | 0.043 | 1.082 | 1.090 | 0.99 |

**t · 0–6 · Gesamtbewölkung c_clct Terzile × night**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 0 %…50 % | 43912 | -0.063 | 1.751 | 1.393 | 1.58 |
| Q2 50 %…95 % | 42817 | 0.045 | 1.427 | 1.337 | 1.14 |
| Q3 95 %…100 % | 39578 | 0.009 | 1.170 | 1.264 | 0.86 |

**t · 0–6 · Gesamtbewölkung c_clct Terzile × day**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 0 %…55 % | 43769 | 0.189 | 1.430 | 1.225 | 1.36 |
| Q2 55 %…95 % | 42680 | -0.002 | 1.292 | 1.184 | 1.19 |
| Q3 95 %…100 % | 40165 | -0.144 | 1.213 | 1.149 | 1.11 |

**t · 0–6 · Gesamtbewölkung c_clct Terzile × trans**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 0 %…45 % | 14480 | 0.111 | 1.508 | 1.300 | 1.35 |
| Q2 45 %…95 % | 16239 | -0.012 | 1.301 | 1.269 | 1.05 |
| Q3 95 %…100 % | 12350 | -0.181 | 1.192 | 1.199 | 0.99 |

**t · 0–6 · Cube-10-m-Wind (< 2 m/s ruhig / Rest) × Nacht/Tag**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| calm|day | 51423 | 0.023 | 1.562 | 1.328 | 1.39 |
| calm|night | 84390 | -0.024 | 1.595 | 1.393 | 1.31 |
| calm|trans | 26384 | -0.054 | 1.488 | 1.338 | 1.24 |
| rest|day | 75191 | 0.016 | 1.120 | 1.081 | 1.07 |
| rest|night | 41917 | 0.038 | 1.210 | 1.208 | 1.00 |
| rest|trans | 16685 | 0.036 | 1.082 | 1.125 | 0.93 |

**t · 0–6 · tpi2000-Terzil × Senke (sinkDepth > 0)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| 0|sink | 100511 | 0.001 | 1.728 | 1.555 | 1.23 |
| 1|nosink | 25192 | 0.017 | 1.014 | 0.967 | 1.10 |
| 1|sink | 75776 | -0.028 | 1.145 | 1.027 | 1.24 |
| 2|nosink | 89879 | 0.023 | 1.260 | 1.158 | 1.18 |
| 2|sink | 4632 | 0.153 | 1.123 | 1.018 | 1.22 |

**t · 0–6 · Höhenband**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| ge800 | 61903 | -0.028 | 1.762 | 1.600 | 1.21 |
| lt800 | 234087 | 0.012 | 1.277 | 1.157 | 1.22 |

**t · 0–6 · Route (1 run, 2 day0, 3 dyn)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| 1 | 148657 | -0.003 | 1.383 | 1.261 | 1.20 |
| 2 | 147333 | 0.011 | 1.401 | 1.264 | 1.23 |

**t · 0–6 · Motor-Flags (Bit gesetzt 1 / 0)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| extrapolatedBelowModel|0 | 295990 | 0.004 | 1.392 | 1.263 | 1.22 |
| hmodelProxy|0 | 295990 | 0.004 | 1.392 | 1.263 | 1.22 |
| inversionBody|0 | 295990 | 0.004 | 1.392 | 1.263 | 1.22 |
| stdLapseFallback|1 | 295990 | 0.004 | 1.392 | 1.263 | 1.22 |

**t · 0–6 · Vertikalfall (A/B/C/std)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| std | 295990 | 0.004 | 1.392 | 1.263 | 1.22 |

**t · 7–24 · Sonnenstunde (8 × 3 h) × Saison**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| 0|JJA | 44616 | -0.194 | 1.633 | 1.596 | 1.05 |
| 1|JJA | 41080 | -0.210 | 1.610 | 1.581 | 1.04 |
| 2|JJA | 42582 | -0.143 | 1.319 | 1.418 | 0.87 |
| 3|JJA | 44424 | -0.073 | 1.416 | 1.398 | 1.03 |
| 4|JJA | 44836 | -0.221 | 1.529 | 1.443 | 1.12 |
| 5|JJA | 41270 | 0.042 | 1.674 | 1.578 | 1.13 |
| 6|JJA | 42820 | -0.001 | 1.593 | 1.603 | 0.99 |
| 7|JJA | 44849 | 0.127 | 1.656 | 1.637 | 1.02 |
| 0|SON | 12588 | -0.175 | 1.564 | 1.583 | 0.98 |
| 1|SON | 11568 | 0.080 | 1.551 | 1.560 | 0.99 |
| 2|SON | 11964 | -0.099 | 1.231 | 1.405 | 0.77 |
| 3|SON | 12462 | 0.091 | 1.198 | 1.366 | 0.77 |
| 4|SON | 12588 | 0.128 | 1.326 | 1.405 | 0.89 |
| 5|SON | 11568 | 0.237 | 1.265 | 1.522 | 0.69 |
| 6|SON | 11970 | 0.027 | 1.455 | 1.571 | 0.86 |
| 7|SON | 12468 | 0.129 | 1.478 | 1.619 | 0.83 |

**t · 7–24 · dTsfc-Quintile (Entkopplungs-Proxy, zeilengewichtet)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 -16.0 K…-3.0 K | 90291 | -0.093 | 1.657 | 1.537 | 1.16 |
| Q2 -3.0 K…-0.5 K | 110169 | -0.009 | 1.532 | 1.583 | 0.94 |
| Q3 -0.5 K…1.5 K | 84816 | -0.084 | 1.613 | 1.590 | 1.03 |
| Q4 1.5 K…3.5 K | 75262 | 0.003 | 1.548 | 1.529 | 1.02 |
| Q5 3.5 K…8.5 K | 83115 | -0.094 | 1.206 | 1.369 | 0.78 |

**t · 7–24 · Gesamtbewölkung c_clct Terzile × night**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 0 %…35 % | 62921 | -0.094 | 1.733 | 1.616 | 1.15 |
| Q2 35 %…85 % | 64670 | -0.021 | 1.577 | 1.610 | 0.96 |
| Q3 85 %…100 % | 57467 | -0.085 | 1.480 | 1.567 | 0.89 |

**t · 7–24 · Gesamtbewölkung c_clct Terzile × day**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 0 %…45 % | 62648 | 0.095 | 1.162 | 1.430 | 0.66 |
| Q2 45 %…90 % | 69943 | -0.077 | 1.486 | 1.464 | 1.03 |
| Q3 90 %…100 % | 52347 | -0.172 | 1.736 | 1.465 | 1.40 |

**t · 7–24 · Gesamtbewölkung c_clct Terzile × trans**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 0 %…35 % | 24761 | 0.074 | 1.392 | 1.523 | 0.83 |
| Q2 35 %…85 % | 27454 | -0.045 | 1.429 | 1.543 | 0.86 |
| Q3 85 %…100 % | 21442 | -0.197 | 1.558 | 1.518 | 1.05 |

**t · 7–24 · Cube-10-m-Wind (< 2 m/s ruhig / Rest) × Nacht/Tag**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| calm|day | 68973 | -0.022 | 1.595 | 1.536 | 1.08 |
| calm|night | 133479 | -0.086 | 1.683 | 1.631 | 1.06 |
| calm|trans | 45913 | -0.062 | 1.575 | 1.583 | 0.99 |
| rest|day | 115965 | -0.059 | 1.382 | 1.401 | 0.97 |
| rest|night | 51579 | -0.013 | 1.377 | 1.512 | 0.83 |
| rest|trans | 27744 | -0.027 | 1.232 | 1.435 | 0.74 |

**t · 7–24 · tpi2000-Terzil × Senke (sinkDepth > 0)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| 0|sink | 151868 | -0.000 | 1.742 | 1.719 | 1.03 |
| 1|nosink | 34449 | -0.052 | 1.316 | 1.377 | 0.91 |
| 1|sink | 112703 | -0.120 | 1.398 | 1.406 | 0.99 |
| 2|nosink | 137706 | -0.072 | 1.415 | 1.440 | 0.97 |
| 2|sink | 6927 | 0.150 | 1.304 | 1.392 | 0.88 |

**t · 7–24 · Höhenband**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| ge800 | 91985 | -0.112 | 1.723 | 1.709 | 1.02 |
| lt800 | 351668 | -0.039 | 1.466 | 1.477 | 0.99 |

**t · 7–24 · Route (1 run, 2 day0, 3 dyn)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| 1 | 443653 | -0.055 | 1.523 | 1.528 | 0.99 |

**t · 7–24 · Motor-Flags (Bit gesetzt 1 / 0)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| extrapolatedBelowModel|0 | 443653 | -0.055 | 1.523 | 1.528 | 0.99 |
| hmodelProxy|0 | 443653 | -0.055 | 1.523 | 1.528 | 0.99 |
| inversionBody|0 | 443653 | -0.055 | 1.523 | 1.528 | 0.99 |
| stdLapseFallback|1 | 443653 | -0.055 | 1.523 | 1.528 | 0.99 |

**t · 7–24 · Vertikalfall (A/B/C/std)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| std | 443653 | -0.055 | 1.523 | 1.528 | 0.99 |

**t · 25–48 · Sonnenstunde (8 × 3 h) × Saison**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| 0|JJA | 58746 | -0.307 | 1.793 | 1.550 | 1.34 |
| 1|JJA | 54048 | -0.316 | 1.753 | 1.540 | 1.30 |
| 2|JJA | 56076 | -0.226 | 1.464 | 1.446 | 1.02 |
| 3|JJA | 58601 | -0.125 | 1.681 | 1.478 | 1.29 |
| 4|JJA | 59166 | -0.269 | 1.819 | 1.545 | 1.39 |
| 5|JJA | 54424 | 0.010 | 1.950 | 1.638 | 1.42 |
| 6|JJA | 56448 | -0.042 | 1.748 | 1.626 | 1.16 |
| 7|JJA | 59085 | 0.015 | 1.763 | 1.616 | 1.19 |
| 0|SON | 16784 | -0.234 | 1.684 | 1.542 | 1.19 |
| 1|SON | 15424 | -0.001 | 1.672 | 1.530 | 1.19 |
| 2|SON | 15952 | -0.279 | 1.352 | 1.437 | 0.89 |
| 3|SON | 16616 | -0.092 | 1.388 | 1.462 | 0.90 |
| 4|SON | 16784 | -0.110 | 1.537 | 1.523 | 1.02 |
| 5|SON | 15424 | 0.021 | 1.416 | 1.610 | 0.77 |
| 6|SON | 15960 | -0.181 | 1.517 | 1.608 | 0.89 |
| 7|SON | 16624 | -0.011 | 1.562 | 1.607 | 0.94 |

**t · 25–48 · dTsfc-Quintile (Entkopplungs-Proxy, zeilengewichtet)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 -16.0 K…-3.0 K | 119266 | -0.178 | 1.818 | 1.522 | 1.43 |
| Q2 -3.0 K…-1.0 K | 115378 | -0.096 | 1.696 | 1.564 | 1.18 |
| Q3 -1.0 K…1.0 K | 117407 | -0.152 | 1.751 | 1.596 | 1.20 |
| Q4 1.0 K…3.5 K | 125863 | -0.081 | 1.745 | 1.588 | 1.21 |
| Q5 3.5 K…8.5 K | 108248 | -0.242 | 1.457 | 1.483 | 0.97 |

**t · 25–48 · Gesamtbewölkung c_clct Terzile × night**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 0 %…35 % | 86927 | -0.217 | 1.827 | 1.575 | 1.35 |
| Q2 35 %…85 % | 79545 | -0.093 | 1.720 | 1.589 | 1.17 |
| Q3 85 %…100 % | 77715 | -0.204 | 1.635 | 1.541 | 1.13 |

**t · 25–48 · Gesamtbewölkung c_clct Terzile × day**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 0 %…45 % | 85704 | 0.012 | 1.347 | 1.523 | 0.78 |
| Q2 45 %…90 % | 85801 | -0.192 | 1.722 | 1.547 | 1.24 |
| Q3 90 %…100 % | 72790 | -0.204 | 2.062 | 1.534 | 1.81 |

**t · 25–48 · Gesamtbewölkung c_clct Terzile × trans**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 0 %…35 % | 33908 | -0.033 | 1.482 | 1.553 | 0.91 |
| Q2 35 %…80 % | 30976 | -0.142 | 1.553 | 1.575 | 0.97 |
| Q3 80 %…100 % | 32350 | -0.262 | 1.731 | 1.541 | 1.26 |

**t · 25–48 · Cube-10-m-Wind (< 2 m/s ruhig / Rest) × Nacht/Tag**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| calm|day | 87483 | -0.050 | 1.806 | 1.601 | 1.27 |
| calm|night | 171628 | -0.180 | 1.816 | 1.599 | 1.29 |
| calm|trans | 58773 | -0.157 | 1.702 | 1.598 | 1.13 |
| rest|day | 156812 | -0.166 | 1.664 | 1.497 | 1.24 |
| rest|night | 72559 | -0.155 | 1.518 | 1.495 | 1.03 |
| rest|trans | 38461 | -0.124 | 1.403 | 1.490 | 0.89 |

**t · 25–48 · tpi2000-Terzil × Senke (sinkDepth > 0)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| 0|sink | 200644 | -0.079 | 1.905 | 1.713 | 1.24 |
| 1|nosink | 45510 | -0.151 | 1.536 | 1.438 | 1.14 |
| 1|sink | 148896 | -0.232 | 1.610 | 1.461 | 1.22 |
| 2|nosink | 181960 | -0.165 | 1.587 | 1.470 | 1.17 |
| 2|sink | 9152 | 0.087 | 1.459 | 1.446 | 1.02 |

**t · 25–48 · Höhenband**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| ge800 | 121528 | -0.182 | 1.848 | 1.686 | 1.20 |
| lt800 | 464634 | -0.139 | 1.663 | 1.516 | 1.20 |

**t · 25–48 · Route (1 run, 2 day0, 3 dyn)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| 1 | 586162 | -0.148 | 1.703 | 1.553 | 1.20 |

**t · 25–48 · Motor-Flags (Bit gesetzt 1 / 0)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| extrapolatedBelowModel|0 | 586162 | -0.148 | 1.703 | 1.553 | 1.20 |
| hmodelProxy|0 | 586162 | -0.148 | 1.703 | 1.553 | 1.20 |
| inversionBody|0 | 586162 | -0.148 | 1.703 | 1.553 | 1.20 |
| stdLapseFallback|1 | 586162 | -0.148 | 1.703 | 1.553 | 1.20 |

**t · 25–48 · Vertikalfall (A/B/C/std)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| std | 586162 | -0.148 | 1.703 | 1.553 | 1.20 |

**t · 51–120 · Sonnenstunde (8 × 3 h) × Saison**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| 0|DJF | 35088 | -0.255 | 2.323 | 2.201 | 1.11 |
| 1|DJF | 34536 | -0.221 | 2.622 | 2.234 | 1.38 |
| 2|DJF | 34524 | 0.193 | 2.276 | 2.214 | 1.06 |
| 3|DJF | 35628 | -0.134 | 2.577 | 2.200 | 1.37 |
| 4|DJF | 35064 | -0.228 | 2.346 | 2.258 | 1.08 |
| 5|DJF | 34524 | -0.620 | 2.659 | 2.188 | 1.48 |
| 6|DJF | 34524 | -0.188 | 1.945 | 2.087 | 0.87 |
| 7|DJF | 35616 | 0.253 | 2.482 | 2.085 | 1.42 |
| 0|MAM | 36132 | -0.228 | 2.091 | 2.184 | 0.92 |
| 1|MAM | 35148 | -0.212 | 2.239 | 2.327 | 0.93 |
| 2|MAM | 35232 | 0.003 | 1.845 | 2.177 | 0.72 |
| 3|MAM | 36288 | 0.679 | 1.964 | 2.222 | 0.78 |
| 4|MAM | 36192 | 0.130 | 1.978 | 2.247 | 0.77 |
| 5|MAM | 35124 | 0.823 | 2.511 | 2.251 | 1.24 |
| 6|MAM | 35220 | 0.335 | 1.718 | 2.092 | 0.67 |
| 7|MAM | 36300 | 0.512 | 2.031 | 2.138 | 0.90 |
| 0|JJA | 36144 | -0.145 | 2.066 | 1.875 | 1.21 |
| 1|JJA | 34933 | -0.232 | 2.005 | 1.899 | 1.11 |
| 2|JJA | 35021 | -0.278 | 1.668 | 1.777 | 0.88 |
| 3|JJA | 36190 | -0.066 | 1.961 | 1.898 | 1.07 |
| 4|JJA | 36180 | -0.318 | 2.128 | 2.019 | 1.11 |
| 5|JJA | 34982 | 0.075 | 2.528 | 2.111 | 1.43 |
| 6|JJA | 34995 | -0.157 | 2.090 | 2.003 | 1.09 |
| 7|JJA | 36238 | 0.026 | 2.069 | 1.947 | 1.13 |
| 0|SON | 42720 | -0.426 | 2.029 | 2.108 | 0.93 |
| 1|SON | 41508 | -0.148 | 2.265 | 2.133 | 1.13 |
| 2|SON | 41388 | 0.001 | 1.836 | 2.092 | 0.77 |
| 3|SON | 42918 | -0.302 | 2.068 | 2.117 | 0.95 |
| 4|SON | 42936 | -0.406 | 2.104 | 2.185 | 0.93 |
| 5|SON | 41700 | -0.165 | 2.172 | 2.147 | 1.02 |
| 6|SON | 41568 | -0.294 | 1.743 | 2.047 | 0.73 |
| 7|SON | 43140 | 0.022 | 2.082 | 2.033 | 1.05 |

**t · 51–120 · dTsfc-Quintile (Entkopplungs-Proxy, zeilengewichtet)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 -22.5 K…-5.0 K | 262516 | -0.119 | 2.418 | 2.089 | 1.34 |
| Q2 -5.0 K…-2.5 K | 226557 | -0.020 | 2.194 | 2.118 | 1.07 |
| Q3 -2.5 K…-0.5 K | 253076 | -0.086 | 2.003 | 2.122 | 0.89 |
| Q4 -0.5 K…2.0 K | 242262 | -0.011 | 2.038 | 2.172 | 0.88 |
| Q5 2.0 K…11.0 K | 203290 | -0.098 | 2.021 | 2.051 | 0.97 |

**t · 51–120 · Gesamtbewölkung c_clct Terzile × night**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 0 %…45 % | 128140 | -0.099 | 2.339 | 2.084 | 1.26 |
| Q2 45 %…90 % | 131270 | -0.081 | 2.157 | 2.080 | 1.07 |
| Q3 90 %…100 % | 124754 | -0.060 | 2.069 | 2.114 | 0.96 |

**t · 51–120 · Gesamtbewölkung c_clct Terzile × day**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 0 %…55 % | 137807 | 0.070 | 2.290 | 2.142 | 1.14 |
| Q2 55 %…90 % | 119346 | -0.099 | 2.234 | 2.141 | 1.09 |
| Q3 90 %…100 % | 127258 | -0.002 | 2.278 | 2.167 | 1.10 |

**t · 51–120 · Gesamtbewölkung c_clct Terzile × trans**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 0 %…55 % | 108143 | -0.017 | 1.934 | 2.053 | 0.89 |
| Q2 55 %…90 % | 100094 | -0.096 | 1.905 | 2.063 | 0.85 |
| Q3 90 %…100 % | 84235 | -0.047 | 1.828 | 2.083 | 0.77 |

**t · 51–120 · Cube-10-m-Wind (< 2 m/s ruhig / Rest) × Nacht/Tag**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| calm|day | 205154 | -0.035 | 2.488 | 2.292 | 1.18 |
| calm|night | 284446 | -0.056 | 2.300 | 2.179 | 1.11 |
| calm|trans | 172057 | -0.051 | 2.038 | 2.144 | 0.90 |
| rest|day | 242572 | -0.072 | 2.034 | 2.032 | 1.00 |
| rest|night | 163057 | -0.150 | 1.998 | 1.952 | 1.05 |
| rest|trans | 120415 | -0.055 | 1.668 | 1.946 | 0.73 |

**t · 51–120 · tpi2000-Terzil × Senke (sinkDepth > 0)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| 0|sink | 419598 | -0.070 | 2.397 | 2.328 | 1.06 |
| 1|nosink | 54666 | -0.191 | 2.042 | 1.867 | 1.20 |
| 1|sink | 293074 | -0.087 | 1.935 | 1.946 | 0.99 |
| 2|nosink | 402009 | -0.047 | 2.049 | 2.032 | 1.02 |
| 2|sink | 18354 | 0.232 | 1.739 | 1.884 | 0.85 |

**t · 51–120 · Höhenband**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| ge800 | 237769 | -0.050 | 2.392 | 2.361 | 1.03 |
| lt800 | 949932 | -0.072 | 2.082 | 2.045 | 1.04 |

**t · 51–120 · Route (1 run, 2 day0, 3 dyn)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| 1 | 289502 | -0.277 | 2.060 | 1.861 | 1.22 |
| 3 | 898199 | -0.000 | 2.175 | 2.187 | 0.99 |

**t · 51–120 · Motor-Flags (Bit gesetzt 1 / 0)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| extrapolatedBelowModel|0 | 1187701 | -0.068 | 2.148 | 2.112 | 1.03 |
| hmodelProxy|0 | 1187701 | -0.068 | 2.148 | 2.112 | 1.03 |
| inversionBody|0 | 1187701 | -0.068 | 2.148 | 2.112 | 1.03 |
| stdLapseFallback|1 | 1187701 | -0.068 | 2.148 | 2.112 | 1.03 |

**t · 51–120 · Vertikalfall (A/B/C/std)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| std | 1187701 | -0.068 | 2.148 | 2.112 | 1.03 |

**td · 0–6 · Sonnenstunde (8 × 3 h) × Saison**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| 0|DJF | 6025 | -0.142 | 1.527 | 1.327 | 1.32 |
| 1|DJF | 5378 | -0.032 | 1.452 | 1.239 | 1.37 |
| 2|DJF | 5640 | 0.150 | 1.280 | 1.252 | 1.04 |
| 3|DJF | 5930 | -0.017 | 1.403 | 1.312 | 1.14 |
| 4|DJF | 6025 | -0.218 | 1.612 | 1.370 | 1.39 |
| 5|DJF | 5381 | -0.103 | 1.307 | 1.253 | 1.09 |
| 6|DJF | 5639 | 0.014 | 1.227 | 1.209 | 1.03 |
| 7|DJF | 5933 | -0.068 | 1.386 | 1.249 | 1.23 |
| 0|MAM | 6132 | -0.066 | 1.390 | 1.311 | 1.12 |
| 1|MAM | 5491 | -0.042 | 1.321 | 1.217 | 1.18 |
| 2|MAM | 5756 | 0.072 | 1.317 | 1.282 | 1.06 |
| 3|MAM | 6052 | 0.120 | 1.396 | 1.339 | 1.09 |
| 4|MAM | 6133 | 0.069 | 1.544 | 1.402 | 1.21 |
| 5|MAM | 5496 | 0.013 | 1.408 | 1.277 | 1.22 |
| 6|MAM | 5754 | -0.137 | 1.396 | 1.203 | 1.35 |
| 7|MAM | 6049 | -0.108 | 1.305 | 1.262 | 1.07 |
| 0|JJA | 15972 | -0.152 | 1.197 | 1.254 | 0.91 |
| 1|JJA | 14632 | 0.112 | 1.220 | 1.200 | 1.03 |
| 2|JJA | 15259 | -0.086 | 1.230 | 1.254 | 0.96 |
| 3|JJA | 16012 | -0.023 | 1.355 | 1.446 | 0.88 |
| 4|JJA | 16176 | 0.007 | 1.564 | 1.550 | 1.02 |
| 5|JJA | 14818 | 0.008 | 1.614 | 1.582 | 1.04 |
| 6|JJA | 15385 | -0.158 | 1.487 | 1.503 | 0.98 |
| 7|JJA | 16071 | -0.083 | 1.342 | 1.345 | 1.00 |
| 0|SON | 10266 | -0.025 | 1.481 | 1.305 | 1.29 |
| 1|SON | 9274 | 0.193 | 1.495 | 1.242 | 1.45 |
| 2|SON | 9679 | 0.046 | 1.327 | 1.236 | 1.15 |
| 3|SON | 10100 | -0.080 | 1.449 | 1.372 | 1.11 |
| 4|SON | 10269 | -0.258 | 1.605 | 1.424 | 1.27 |
| 5|SON | 9273 | 0.012 | 1.448 | 1.395 | 1.08 |
| 6|SON | 9684 | 0.126 | 1.327 | 1.315 | 1.02 |
| 7|SON | 10115 | 0.100 | 1.391 | 1.278 | 1.18 |

**td · 0–6 · dTsfc-Quintile (Entkopplungs-Proxy, zeilengewichtet)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 -21.5 K…-4.0 K | 63683 | -0.050 | 1.216 | 1.060 | 1.32 |
| Q2 -4.0 K…-1.5 K | 63669 | 0.066 | 1.445 | 1.329 | 1.18 |
| Q3 -1.5 K…0.0 K | 51960 | -0.021 | 1.404 | 1.403 | 1.00 |
| Q4 0.0 K…2.5 K | 62219 | -0.087 | 1.463 | 1.495 | 0.96 |
| Q5 2.5 K…8.5 K | 54268 | -0.047 | 1.493 | 1.417 | 1.11 |

**td · 0–6 · Gesamtbewölkung c_clct Terzile × night**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 0 %…50 % | 43879 | -0.058 | 1.647 | 1.370 | 1.45 |
| Q2 50 %…95 % | 42786 | -0.018 | 1.263 | 1.263 | 1.00 |
| Q3 95 %…100 % | 39556 | -0.007 | 1.068 | 1.188 | 0.81 |

**td · 0–6 · Gesamtbewölkung c_clct Terzile × day**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 0 %…55 % | 43726 | -0.103 | 1.766 | 1.519 | 1.35 |
| Q2 55 %…95 % | 42651 | -0.050 | 1.393 | 1.409 | 0.98 |
| Q3 95 %…100 % | 40143 | 0.013 | 1.224 | 1.306 | 0.88 |

**td · 0–6 · Gesamtbewölkung c_clct Terzile × trans**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 0 %…45 % | 14480 | -0.028 | 1.463 | 1.400 | 1.09 |
| Q2 45 %…95 % | 16234 | 0.037 | 1.272 | 1.317 | 0.93 |
| Q3 95 %…100 % | 12344 | 0.120 | 1.094 | 1.184 | 0.85 |

**td · 0–6 · Cube-10-m-Wind (< 2 m/s ruhig / Rest) × Nacht/Tag**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| calm|day | 51395 | -0.117 | 1.720 | 1.556 | 1.22 |
| calm|night | 84336 | -0.006 | 1.473 | 1.329 | 1.23 |
| calm|trans | 26378 | 0.033 | 1.392 | 1.392 | 1.00 |
| rest|day | 75125 | -0.002 | 1.301 | 1.314 | 0.98 |
| rest|night | 41885 | -0.073 | 1.087 | 1.171 | 0.86 |
| rest|trans | 16680 | 0.048 | 1.119 | 1.167 | 0.92 |

**td · 0–6 · tpi2000-Terzil × Senke (sinkDepth > 0)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| 0|sink | 100459 | 0.001 | 1.523 | 1.420 | 1.15 |
| 1|nosink | 25170 | -0.094 | 1.042 | 0.996 | 1.09 |
| 1|sink | 75703 | -0.046 | 1.075 | 1.043 | 1.06 |
| 2|nosink | 89835 | -0.034 | 1.600 | 1.559 | 1.05 |
| 2|sink | 4632 | 0.164 | 1.120 | 1.152 | 0.94 |

**td · 0–6 · Höhenband**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| ge800 | 61884 | -0.038 | 2.084 | 1.907 | 1.19 |
| lt800 | 233915 | -0.024 | 1.160 | 1.150 | 1.02 |

**td · 0–6 · Route (1 run, 2 day0, 3 dyn)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| 1 | 148581 | -0.063 | 1.392 | 1.401 | 0.99 |
| 2 | 147218 | 0.009 | 1.417 | 1.284 | 1.22 |

**td · 0–6 · Motor-Flags (Bit gesetzt 1 / 0)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| extrapolatedBelowModel|0 | 295799 | -0.027 | 1.405 | 1.344 | 1.09 |
| hmodelProxy|0 | 295799 | -0.027 | 1.405 | 1.344 | 1.09 |
| inversionBody|0 | 295799 | -0.027 | 1.405 | 1.344 | 1.09 |
| stdLapseFallback|1 | 295799 | -0.027 | 1.405 | 1.344 | 1.09 |

**td · 0–6 · Vertikalfall (A/B/C/std)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| std | 295799 | -0.027 | 1.405 | 1.344 | 1.09 |

**td · 7–24 · Sonnenstunde (8 × 3 h) × Saison**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| 0|JJA | 44568 | -0.127 | 1.347 | 1.374 | 0.96 |
| 1|JJA | 41068 | 0.132 | 1.381 | 1.302 | 1.13 |
| 2|JJA | 42582 | -0.103 | 1.315 | 1.343 | 0.96 |
| 3|JJA | 44400 | -0.055 | 1.475 | 1.532 | 0.93 |
| 4|JJA | 44782 | -0.038 | 1.660 | 1.652 | 1.01 |
| 5|JJA | 41252 | 0.068 | 1.787 | 1.709 | 1.09 |
| 6|JJA | 42820 | -0.154 | 1.649 | 1.634 | 1.02 |
| 7|JJA | 44825 | -0.043 | 1.494 | 1.470 | 1.03 |
| 0|SON | 12588 | -0.081 | 1.286 | 1.319 | 0.95 |
| 1|SON | 11550 | 0.215 | 1.570 | 1.323 | 1.41 |
| 2|SON | 11964 | 0.202 | 1.270 | 1.313 | 0.94 |
| 3|SON | 12462 | 0.186 | 1.496 | 1.499 | 1.00 |
| 4|SON | 12582 | -0.120 | 1.439 | 1.586 | 0.82 |
| 5|SON | 11544 | -0.078 | 1.670 | 1.689 | 0.98 |
| 6|SON | 11970 | -0.096 | 1.412 | 1.535 | 0.85 |
| 7|SON | 12468 | -0.014 | 1.437 | 1.417 | 1.03 |

**td · 7–24 · dTsfc-Quintile (Entkopplungs-Proxy, zeilengewichtet)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 -16.0 K…-3.0 K | 90248 | 0.016 | 1.311 | 1.277 | 1.05 |
| Q2 -3.0 K…-0.5 K | 110117 | 0.005 | 1.437 | 1.439 | 1.00 |
| Q3 -0.5 K…1.5 K | 84790 | -0.100 | 1.538 | 1.590 | 0.94 |
| Q4 1.5 K…3.5 K | 75226 | -0.066 | 1.666 | 1.686 | 0.98 |
| Q5 3.5 K…8.5 K | 83044 | -0.008 | 1.603 | 1.527 | 1.10 |

**td · 7–24 · Gesamtbewölkung c_clct Terzile × night**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 0 %…35 % | 62890 | -0.023 | 1.553 | 1.426 | 1.19 |
| Q2 35 %…85 % | 64638 | 0.007 | 1.398 | 1.405 | 0.99 |
| Q3 85 %…100 % | 57428 | -0.063 | 1.305 | 1.356 | 0.93 |

**td · 7–24 · Gesamtbewölkung c_clct Terzile × day**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 0 %…45 % | 62603 | -0.136 | 1.747 | 1.626 | 1.15 |
| Q2 45 %…90 % | 69897 | 0.032 | 1.533 | 1.599 | 0.92 |
| Q3 90 %…100 % | 52312 | -0.000 | 1.519 | 1.571 | 0.94 |

**td · 7–24 · Gesamtbewölkung c_clct Terzile × trans**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 0 %…35 % | 24761 | -0.137 | 1.498 | 1.509 | 0.98 |
| Q2 35 %…85 % | 27454 | 0.005 | 1.434 | 1.496 | 0.92 |
| Q3 85 %…100 % | 21442 | 0.097 | 1.394 | 1.451 | 0.92 |

**td · 7–24 · Cube-10-m-Wind (< 2 m/s ruhig / Rest) × Nacht/Tag**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| calm|day | 68932 | -0.106 | 1.776 | 1.735 | 1.05 |
| calm|night | 133396 | 0.002 | 1.497 | 1.433 | 1.09 |
| calm|trans | 45913 | -0.061 | 1.524 | 1.567 | 0.95 |
| rest|day | 115880 | 0.009 | 1.493 | 1.514 | 0.97 |
| rest|night | 51560 | -0.095 | 1.222 | 1.300 | 0.88 |
| rest|trans | 27744 | 0.058 | 1.302 | 1.346 | 0.94 |

**td · 7–24 · tpi2000-Terzil × Senke (sinkDepth > 0)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| 0|sink | 151832 | 0.043 | 1.626 | 1.594 | 1.04 |
| 1|nosink | 34443 | -0.088 | 1.340 | 1.269 | 1.11 |
| 1|sink | 112565 | -0.035 | 1.328 | 1.304 | 1.04 |
| 2|nosink | 137658 | -0.089 | 1.555 | 1.598 | 0.95 |
| 2|sink | 6927 | 0.101 | 1.251 | 1.376 | 0.83 |

**td · 7–24 · Höhenband**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| ge800 | 91961 | -0.098 | 1.892 | 1.867 | 1.03 |
| lt800 | 351464 | -0.009 | 1.387 | 1.387 | 1.00 |

**td · 7–24 · Route (1 run, 2 day0, 3 dyn)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| 1 | 443425 | -0.027 | 1.506 | 1.500 | 1.01 |

**td · 7–24 · Motor-Flags (Bit gesetzt 1 / 0)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| extrapolatedBelowModel|0 | 443425 | -0.027 | 1.506 | 1.500 | 1.01 |
| hmodelProxy|0 | 443425 | -0.027 | 1.506 | 1.500 | 1.01 |
| inversionBody|0 | 443425 | -0.027 | 1.506 | 1.500 | 1.01 |
| stdLapseFallback|1 | 443425 | -0.027 | 1.506 | 1.500 | 1.01 |

**td · 7–24 · Vertikalfall (A/B/C/std)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| std | 443425 | -0.027 | 1.506 | 1.500 | 1.01 |

**td · 25–48 · Sonnenstunde (8 × 3 h) × Saison**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| 0|JJA | 58682 | -0.053 | 1.502 | 1.553 | 0.94 |
| 1|JJA | 54032 | 0.179 | 1.557 | 1.450 | 1.15 |
| 2|JJA | 56076 | -0.036 | 1.458 | 1.505 | 0.94 |
| 3|JJA | 58569 | 0.007 | 1.683 | 1.751 | 0.92 |
| 4|JJA | 59094 | -0.003 | 1.909 | 1.922 | 0.99 |
| 5|JJA | 54400 | 0.091 | 2.076 | 1.988 | 1.09 |
| 6|JJA | 56448 | -0.134 | 1.913 | 1.903 | 1.01 |
| 7|JJA | 59053 | -0.000 | 1.694 | 1.732 | 0.96 |
| 0|SON | 16784 | -0.235 | 1.421 | 1.531 | 0.86 |
| 1|SON | 15400 | 0.014 | 1.706 | 1.460 | 1.36 |
| 2|SON | 15952 | 0.011 | 1.382 | 1.492 | 0.86 |
| 3|SON | 16616 | 0.013 | 1.610 | 1.738 | 0.86 |
| 4|SON | 16776 | -0.336 | 1.632 | 1.899 | 0.74 |
| 5|SON | 15392 | -0.294 | 1.889 | 1.983 | 0.91 |
| 6|SON | 15960 | -0.307 | 1.572 | 1.865 | 0.71 |
| 7|SON | 16624 | -0.218 | 1.579 | 1.711 | 0.85 |

**td · 25–48 · dTsfc-Quintile (Entkopplungs-Proxy, zeilengewichtet)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 -16.0 K…-3.0 K | 119208 | -0.005 | 1.498 | 1.493 | 1.01 |
| Q2 -3.0 K…-1.0 K | 115328 | 0.008 | 1.583 | 1.642 | 0.93 |
| Q3 -1.0 K…1.0 K | 117364 | -0.069 | 1.722 | 1.778 | 0.94 |
| Q4 1.0 K…3.5 K | 125806 | -0.096 | 1.842 | 1.906 | 0.93 |
| Q5 3.5 K…8.5 K | 108152 | 0.000 | 1.864 | 1.812 | 1.06 |

**td · 25–48 · Gesamtbewölkung c_clct Terzile × night**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 0 %…35 % | 86892 | -0.030 | 1.711 | 1.616 | 1.12 |
| Q2 35 %…85 % | 79500 | 0.005 | 1.570 | 1.628 | 0.93 |
| Q3 85 %…100 % | 77659 | -0.040 | 1.501 | 1.585 | 0.90 |

**td · 25–48 · Gesamtbewölkung c_clct Terzile × day**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 0 %…45 % | 85645 | -0.146 | 1.974 | 1.852 | 1.14 |
| Q2 45 %…90 % | 85734 | 0.019 | 1.734 | 1.872 | 0.86 |
| Q3 90 %…100 % | 72748 | -0.001 | 1.760 | 1.842 | 0.91 |

**td · 25–48 · Gesamtbewölkung c_clct Terzile × trans**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 0 %…35 % | 33908 | -0.175 | 1.729 | 1.707 | 1.03 |
| Q2 35 %…80 % | 30976 | -0.028 | 1.599 | 1.732 | 0.85 |
| Q3 80 %…100 % | 32350 | 0.102 | 1.603 | 1.694 | 0.90 |

**td · 25–48 · Cube-10-m-Wind (< 2 m/s ruhig / Rest) × Nacht/Tag**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| calm|day | 87431 | -0.133 | 1.949 | 1.934 | 1.02 |
| calm|night | 171532 | -0.007 | 1.665 | 1.636 | 1.04 |
| calm|trans | 58773 | -0.094 | 1.701 | 1.750 | 0.95 |
| rest|day | 156696 | 0.004 | 1.759 | 1.811 | 0.94 |
| rest|night | 72519 | -0.056 | 1.437 | 1.548 | 0.86 |
| rest|trans | 38461 | 0.052 | 1.560 | 1.649 | 0.89 |

**td · 25–48 · tpi2000-Terzil × Senke (sinkDepth > 0)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| 0|sink | 200596 | 0.031 | 1.784 | 1.781 | 1.00 |
| 1|nosink | 45502 | -0.040 | 1.599 | 1.564 | 1.04 |
| 1|sink | 148712 | -0.039 | 1.549 | 1.585 | 0.96 |
| 2|nosink | 181896 | -0.106 | 1.777 | 1.836 | 0.94 |
| 2|sink | 9152 | 0.088 | 1.518 | 1.637 | 0.86 |

**td · 25–48 · Höhenband**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| ge800 | 121496 | -0.075 | 2.039 | 2.039 | 1.00 |
| lt800 | 464362 | -0.023 | 1.609 | 1.644 | 0.96 |

**td · 25–48 · Route (1 run, 2 day0, 3 dyn)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| 1 | 585858 | -0.034 | 1.707 | 1.733 | 0.97 |

**td · 25–48 · Motor-Flags (Bit gesetzt 1 / 0)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| extrapolatedBelowModel|0 | 585858 | -0.034 | 1.707 | 1.733 | 0.97 |
| hmodelProxy|0 | 585858 | -0.034 | 1.707 | 1.733 | 0.97 |
| inversionBody|0 | 585858 | -0.034 | 1.707 | 1.733 | 0.97 |
| stdLapseFallback|1 | 585858 | -0.034 | 1.707 | 1.733 | 0.97 |

**td · 25–48 · Vertikalfall (A/B/C/std)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| std | 585858 | -0.034 | 1.707 | 1.733 | 0.97 |

**td · 51–120 · Sonnenstunde (8 × 3 h) × Saison**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| 0|DJF | 35064 | -0.501 | 2.480 | 2.154 | 1.33 |
| 1|DJF | 34536 | -0.075 | 2.831 | 2.026 | 1.95 |
| 2|DJF | 34524 | -0.044 | 2.164 | 1.999 | 1.17 |
| 3|DJF | 35628 | 0.286 | 2.507 | 1.963 | 1.63 |
| 4|DJF | 35040 | -0.073 | 2.198 | 2.082 | 1.11 |
| 5|DJF | 34524 | 0.291 | 2.653 | 2.010 | 1.74 |
| 6|DJF | 34524 | -0.044 | 2.016 | 1.984 | 1.03 |
| 7|DJF | 35616 | 0.235 | 2.514 | 1.988 | 1.60 |
| 0|MAM | 36132 | -0.264 | 2.094 | 2.083 | 1.01 |
| 1|MAM | 35148 | -0.171 | 2.477 | 2.198 | 1.27 |
| 2|MAM | 35172 | -0.118 | 1.851 | 1.931 | 0.92 |
| 3|MAM | 36288 | -0.094 | 1.959 | 2.052 | 0.91 |
| 4|MAM | 36192 | -0.288 | 2.261 | 2.087 | 1.17 |
| 5|MAM | 35124 | -0.219 | 2.577 | 2.161 | 1.42 |
| 6|MAM | 35172 | -0.407 | 2.240 | 1.999 | 1.26 |
| 7|MAM | 36300 | -0.159 | 2.091 | 2.090 | 1.00 |
| 0|JJA | 36132 | 0.144 | 1.862 | 1.898 | 0.96 |
| 1|JJA | 34933 | 0.371 | 1.975 | 1.861 | 1.13 |
| 2|JJA | 34913 | 0.103 | 1.587 | 1.727 | 0.84 |
| 3|JJA | 36178 | 0.139 | 1.856 | 1.972 | 0.89 |
| 4|JJA | 36156 | 0.069 | 2.185 | 2.122 | 1.06 |
| 5|JJA | 34982 | 0.296 | 2.344 | 2.253 | 1.08 |
| 6|JJA | 34899 | -0.091 | 2.173 | 2.137 | 1.03 |
| 7|JJA | 36238 | 0.151 | 1.978 | 1.999 | 0.98 |
| 0|SON | 42720 | -0.033 | 1.947 | 2.021 | 0.93 |
| 1|SON | 41472 | 0.071 | 2.495 | 1.951 | 1.63 |
| 2|SON | 41388 | 0.333 | 1.852 | 1.866 | 0.99 |
| 3|SON | 42918 | 0.176 | 1.995 | 1.939 | 1.06 |
| 4|SON | 42936 | -0.111 | 2.006 | 2.040 | 0.97 |
| 5|SON | 41652 | 0.041 | 2.453 | 2.026 | 1.47 |
| 6|SON | 41568 | 0.183 | 1.811 | 1.947 | 0.86 |
| 7|SON | 43140 | 0.340 | 2.032 | 1.949 | 1.09 |

**td · 51–120 · dTsfc-Quintile (Entkopplungs-Proxy, zeilengewichtet)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 -22.5 K…-5.0 K | 262485 | 0.098 | 2.307 | 1.952 | 1.40 |
| Q2 -5.0 K…-2.5 K | 226508 | 0.129 | 2.213 | 2.008 | 1.21 |
| Q3 -2.5 K…-0.5 K | 253007 | -0.035 | 2.099 | 2.000 | 1.10 |
| Q4 -0.5 K…2.0 K | 242040 | -0.087 | 2.117 | 2.064 | 1.05 |
| Q5 2.0 K…11.0 K | 203169 | 0.001 | 2.167 | 2.072 | 1.09 |

**td · 51–120 · Gesamtbewölkung c_clct Terzile × night**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 0 %…45 % | 128120 | -0.036 | 2.415 | 2.045 | 1.39 |
| Q2 45 %…90 % | 131236 | 0.056 | 2.131 | 2.026 | 1.11 |
| Q3 90 %…100 % | 124736 | -0.053 | 2.159 | 2.009 | 1.15 |

**td · 51–120 · Gesamtbewölkung c_clct Terzile × day**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 0 %…55 % | 137749 | -0.038 | 2.496 | 2.118 | 1.39 |
| Q2 55 %…90 % | 119318 | 0.064 | 2.106 | 2.081 | 1.02 |
| Q3 90 %…100 % | 127236 | 0.111 | 2.127 | 2.021 | 1.11 |

**td · 51–120 · Gesamtbewölkung c_clct Terzile × trans**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| Q1 0 %…55 % | 107967 | -0.145 | 2.059 | 1.997 | 1.06 |
| Q2 55 %…90 % | 99989 | 0.071 | 1.944 | 1.933 | 1.01 |
| Q3 90 %…100 % | 84204 | 0.105 | 1.870 | 1.908 | 0.96 |

**td · 51–120 · Cube-10-m-Wind (< 2 m/s ruhig / Rest) × Nacht/Tag**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| calm|day | 205101 | 0.024 | 2.427 | 2.190 | 1.23 |
| calm|night | 284415 | 0.076 | 2.350 | 2.105 | 1.25 |
| calm|trans | 171811 | 0.020 | 2.056 | 2.032 | 1.02 |
| rest|day | 242517 | 0.056 | 2.100 | 1.939 | 1.17 |
| rest|night | 163016 | -0.091 | 2.045 | 1.856 | 1.21 |
| rest|trans | 120349 | -0.026 | 1.832 | 1.826 | 1.01 |

**td · 51–120 · tpi2000-Terzil × Senke (sinkDepth > 0)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| 0|sink | 419190 | 0.010 | 2.261 | 2.065 | 1.20 |
| 1|nosink | 54666 | 0.016 | 1.993 | 1.745 | 1.30 |
| 1|sink | 292990 | 0.047 | 1.940 | 1.823 | 1.13 |
| 2|nosink | 402009 | 0.018 | 2.305 | 2.141 | 1.16 |
| 2|sink | 18354 | -0.038 | 1.827 | 1.777 | 1.06 |

**td · 51–120 · Höhenband**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| ge800 | 237769 | -0.213 | 2.793 | 2.354 | 1.41 |
| lt800 | 949440 | 0.080 | 2.002 | 1.923 | 1.08 |

**td · 51–120 · Route (1 run, 2 day0, 3 dyn)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| 1 | 289370 | -0.016 | 1.992 | 1.992 | 1.00 |
| 3 | 897839 | 0.034 | 2.242 | 2.025 | 1.23 |

**td · 51–120 · Motor-Flags (Bit gesetzt 1 / 0)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| extrapolatedBelowModel|0 | 1187209 | 0.022 | 2.183 | 2.017 | 1.17 |
| hmodelProxy|0 | 1187209 | 0.022 | 2.183 | 2.017 | 1.17 |
| inversionBody|0 | 1187209 | 0.022 | 2.183 | 2.017 | 1.17 |
| stdLapseFallback|1 | 1187209 | 0.022 | 2.183 | 2.017 | 1.17 |

**td · 51–120 · Vertikalfall (A/B/C/std)**

| Gruppe | n | Bias | RMSE | √mean σ² | VR |
|---|---|---|---|---|---|
| std | 1187209 | 0.022 | 2.183 | 2.017 | 1.17 |

### D4 (b) Je-Standort-Obergrenze: Bias je (Punkt, Sonnenstunde 8, Saison 4), leave-one-month-out (Mittel der übrigen Monate, nur wo n_other ≥ 30) und in-sample

RMSE aus den vollen Summen (exakt); CRPS (σ unverändert) auf der Stichprobe jeder 2. Zeile (n_S). „Alle" = unkorrigierte Zeilen behalten ihr Residuum; „nur korrigiert" = nur Zellen mit n_other ≥ 30. **Braucht eine Station am Punkt — nicht übertragbar.**

| Größe | Bin | n | Anteil korrigiert | RMSE vorher | LOMO alle | LOMO nur korr. (vorher → nachher) | in-sample alle | n_S | CRPS vorher | LOMO | in-sample |
|---|---|---|---|---|---|---|---|---|---|---|---|
| t | 0–6 | 295990 | 0.96 | 1.392 | 1.303 (-6.4 %) | 1.396 → 1.303 | 1.225 (-12.0 %) | 129677 | 0.725 | 0.678 (-6.4 %) | 0.643 (-11.2 %) |
| t | 7–24 | 443653 | 0.78 | 1.523 | 1.434 (-5.8 %) | 1.558 → 1.446 | 1.340 (-12.0 %) | 240128 | 0.821 | 0.776 (-5.5 %) | 0.725 (-11.7 %) |
| t | 25–48 | 586162 | 0.78 | 1.703 | 1.630 (-4.3 %) | 1.751 → 1.660 | 1.535 (-9.9 %) | 293097 | 0.926 | 0.885 (-4.4 %) | 0.830 (-10.4 %) |
| t | 51–120 | 1187701 | 1.00 | 2.148 | 2.088 (-2.8 %) | 2.148 → 2.088 | 1.985 (-7.6 %) | 593851 | 1.179 | 1.152 (-2.3 %) | 1.097 (-6.9 %) |
| td | 0–6 | 295799 | 0.96 | 1.405 | 1.345 (-4.3 %) | 1.407 → 1.345 | 1.268 (-9.7 %) | 129591 | 0.702 | 0.673 (-4.1 %) | 0.638 (-9.1 %) |
| td | 7–24 | 443425 | 0.78 | 1.506 | 1.478 (-1.9 %) | 1.521 → 1.485 | 1.361 (-9.6 %) | 240010 | 0.794 | 0.781 (-1.7 %) | 0.723 (-9.0 %) |
| td | 25–48 | 585858 | 0.78 | 1.707 | 1.701 (-0.3 %) | 1.735 → 1.728 | 1.579 (-7.5 %) | 292945 | 0.919 | 0.917 (-0.2 %) | 0.856 (-6.8 %) |
| td | 51–120 | 1187209 | 1.00 | 2.183 | 2.186 (0.1 %) | 2.183 → 2.186 | 2.086 (-4.4 %) | 593600 | 1.164 | 1.171 (0.7 %) | 1.113 (-4.4 %) |

### D4 (c) Standardisiertes Residuum z = e/σ_K — Momente je Bin × Nacht/Tag (Gauß: Schiefe 0, Exzess-Kurtosis 0)

| Größe | Bin | Klasse | n | mean z | sd z | Schiefe | Exzess-Kurtosis |
|---|---|---|---|---|---|---|---|
| td | 0–6 | day | 126520 | -0.055 | 1.107 | -0.87 | 11.37 |
| td | 0–6 | night | 126221 | -0.051 | 1.099 | -0.96 | 10.71 |
| td | 0–6 | trans | 43058 | 0.055 | 1.024 | -0.00 | 2.09 |
| td | 7–24 | day | 184812 | -0.038 | 1.029 | -0.20 | 1.95 |
| td | 7–24 | night | 184956 | -0.035 | 1.043 | -0.15 | 1.68 |
| td | 7–24 | trans | 73657 | 0.001 | 0.994 | 0.01 | 1.44 |
| td | 25–48 | day | 244350 | -0.033 | 0.986 | -0.18 | 1.74 |
| td | 25–48 | night | 244210 | -0.021 | 1.000 | -0.13 | 1.68 |
| td | 25–48 | trans | 97298 | -0.007 | 0.960 | -0.02 | 1.42 |
| td | 51–120 | day | 447618 | 0.010 | 1.120 | -0.19 | 3.07 |
| td | 51–120 | night | 447431 | -0.001 | 1.123 | -0.25 | 2.60 |
| td | 51–120 | trans | 292160 | -0.005 | 1.007 | -0.37 | 1.63 |
| t | 0–6 | day | 126614 | 0.019 | 1.102 | -0.35 | 2.82 |
| t | 0–6 | night | 126307 | 0.007 | 1.109 | -0.25 | 1.78 |
| t | 0–6 | trans | 43069 | -0.014 | 1.065 | -0.34 | 1.57 |
| t | 7–24 | day | 184938 | -0.043 | 0.991 | -0.57 | 2.86 |
| t | 7–24 | night | 185058 | -0.048 | 1.003 | -0.21 | 0.62 |
| t | 7–24 | trans | 73657 | -0.038 | 0.933 | -0.38 | 1.18 |
| t | 25–48 | day | 244518 | -0.094 | 1.109 | -0.36 | 2.90 |
| t | 25–48 | night | 244346 | -0.123 | 1.101 | -0.17 | 0.57 |
| t | 25–48 | trans | 97298 | -0.104 | 1.008 | -0.20 | 1.16 |
| t | 51–120 | day | 447726 | -0.033 | 1.037 | -0.28 | 1.42 |
| t | 51–120 | night | 447503 | -0.048 | 1.066 | -0.12 | 0.86 |
| t | 51–120 | trans | 292472 | -0.036 | 0.914 | -0.10 | 1.09 |

## D5 Niederschlag je Bin × Route — Brier, CRPS trocken/nass, Menge|nass, Reliability, Prädiktoren

Zeilen: Cube-Hürde und fl-P (Klasse der Zeile, `predictPrecip`) vorhanden; Satz KPC = zusätzlich fl-K (Falten-β, out of fold) vorhanden, PC = fl-K fehlt (`no-skill`/zu kurz). „Mittel" = Hürde mit dem ungewichteten Mittel der Nässewahrscheinlichkeiten von fl-K und Cube (CRPS: Menge von K bzw. Cube). Trocken/nass: y < 0,1 / ≥ 0,1 mm/h.

| Bin | Route | Satz | n | nass | Brier(0,1) K | Cube | P | Mittel | Brier(1) K | Cube | P | Mittel | CRPS K | Cube | P | Mittel(K-Menge) | Mittel(C-Menge) | CRPS trocken K / Cube / P | CRPS nass K / Cube / P |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0–6 | 1 | KPC | 135053 | 0.063 | 0.041 | 0.040 | 0.038 | 0.040 | 0.016 | 0.016 | 0.016 | 0.016 | 0.066 | 0.065 | 0.065 | 0.065 | 0.065 | 0.005 / 0.005 / 0.006 | 0.980 / 0.946 / 0.948 |
| 0–6 | 2 | KPC | 134058 | 0.108 | 0.046 | 0.054 | 0.045 | 0.049 | 0.015 | 0.016 | 0.015 | 0.016 | 0.048 | 0.051 | 0.048 | 0.049 | 0.048 | 0.004 / 0.004 / 0.005 | 0.405 / 0.442 / 0.402 |
| 7–24 | 1 | PC | 403047 | 0.063 | — | 0.047 | 0.046 | — | — | 0.019 | 0.019 | — | — | 0.074 | 0.074 | — | — | — / 0.006 / 0.005 | — / 1.079 / 1.088 |
| 25–48 | 1 | PC | 21666 | 0.062 | — | 0.047 | 0.048 | — | — | 0.022 | 0.022 | — | — | 0.086 | 0.088 | — | — | — / 0.007 / 0.005 | — / 1.282 / 1.335 |
| 51–120 | 1 | KPC | 263626 | 0.067 | 0.057 | 0.057 | 0.056 | 0.057 | 0.022 | 0.022 | 0.022 | 0.022 | 0.085 | 0.084 | 0.085 | 0.085 | 0.085 | 0.003 / 0.004 / 0.004 | 1.221 / 1.208 / 1.212 |
| 51–120 | 3 | KPC | 827516 | 0.105 | 0.081 | 0.083 | 0.081 | 0.081 | 0.023 | 0.023 | 0.023 | 0.023 | 0.070 | 0.071 | 0.070 | 0.070 | 0.070 | 0.007 / 0.003 / 0.007 | 0.613 / 0.648 / 0.607 |
| 126–240 | 1 | KPC | 101718 | 0.069 | 0.063 | 0.063 | 0.063 | 0.062 | 0.022 | 0.022 | 0.022 | 0.022 | 0.090 | 0.090 | 0.090 | 0.090 | 0.090 | 0.002 / 0.004 / 0.004 | 1.284 / 1.252 / 1.253 |
| 126–240 | 3 | PC | 332885 | 0.106 | — | 0.092 | 0.090 | — | — | 0.023 | 0.023 | — | — | 0.073 | 0.073 | — | — | — / 0.003 / 0.005 | — / 0.660 / 0.646 |

### D5 Menge | nass (Satz KPC): PIT-Histogramm der Log-Normal-Menge, MAE des Medians, Abdeckung q90

| Bin | Route | n nass | PIT K (Dezile %) | PIT Cube | MAE Median K | Cube | q90-Abdeckung K | Cube |
|---|---|---|---|---|---|---|---|---|
| 0–6 | 1 | 8542 | 6 20 6 10 9 9 9 11 10 10 | 15 9 8 7 7 7 8 9 10 20 | 1.013 | 1.037 | 0.896 | 0.795 |
| 0–6 | 2 | 14486 | 9 12 13 7 8 10 10 10 10 10 | 15 11 10 10 10 10 10 9 8 7 | 0.467 | 0.500 | 0.896 | 0.930 |
| 51–120 | 1 | 17635 | 7 18 10 7 8 8 10 11 11 10 | 12 11 8 8 7 7 9 11 12 15 | 1.117 | 1.128 | 0.895 | 0.854 |
| 51–120 | 3 | 86852 | 7 21 6 10 9 8 8 9 11 11 | 12 14 11 10 9 9 9 10 9 6 | 0.575 | 0.589 | 0.889 | 0.936 |
| 126–240 | 1 | 7018 | 6 18 10 8 8 8 10 9 10 12 | 11 14 10 7 8 8 10 9 10 13 | 1.130 | 1.135 | 0.884 | 0.872 |

### D5 Reliability bei 0,1 mm/h (10 Klassen der Vorhersagewahrscheinlichkeit: n / mittlere Vorhersage / beobachtete Rate)

| Bin | Route | Kandidat | 0–10 | 10–20 | 20–30 | 30–40 | 40–50 | 50–60 | 60–70 | 70–80 | 80–90 | 90–100 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0–6 | 1 | Mittel | 111826 / 0.01 / 0.01 | 3446 / 0.18 / 0.12 | 12205 / 0.24 / 0.20 | 3116 / 0.34 / 0.43 | 1559 / 0.44 / 0.57 | 1093 / 0.55 / 0.67 | 769 / 0.65 / 0.75 | 523 / 0.75 / 0.79 | 355 / 0.85 / 0.81 | 161 / 0.94 / 0.89 |
| 0–6 | 1 | cube | 111826 / 0.01 / 0.01 | 9 / 0.20 / 0.00 | 11786 / 0.27 / 0.16 | 5846 / 0.34 / 0.30 | 2140 / 0.44 / 0.51 | 1358 / 0.55 / 0.63 | 967 / 0.65 / 0.73 | 621 / 0.75 / 0.78 | 373 / 0.84 / 0.83 | 127 / 0.94 / 0.91 |
| 0–6 | 1 | fl-K | 113437 / 0.01 / 0.01 | 8684 / 0.15 / 0.17 | 6960 / 0.24 / 0.27 | 2194 / 0.34 / 0.47 | 1202 / 0.45 / 0.59 | 824 / 0.55 / 0.66 | 621 / 0.65 / 0.74 | 459 / 0.75 / 0.77 | 340 / 0.85 / 0.78 | 332 / 0.95 / 0.83 |
| 0–6 | 1 | fl-P | 115192 / 0.01 / 0.01 | 5841 / 0.15 / 0.15 | 5582 / 0.24 / 0.22 | 1946 / 0.35 / 0.35 | 1484 / 0.45 / 0.44 | 1228 / 0.55 / 0.54 | 1022 / 0.65 / 0.58 | 872 / 0.75 / 0.69 | 857 / 0.85 / 0.78 | 1029 / 0.95 / 0.89 |
| 0–6 | 2 | Mittel | 101537 / 0.01 / 0.01 | 841 / 0.19 / 0.09 | 15047 / 0.25 / 0.16 | 5859 / 0.34 / 0.40 | 3136 / 0.45 / 0.63 | 2258 / 0.55 / 0.77 | 1967 / 0.65 / 0.86 | 1809 / 0.75 / 0.93 | 1298 / 0.85 / 0.96 | 306 / 0.93 / 0.99 |
| 0–6 | 2 | cube | 101537 / 0.01 / 0.01 | 32 / 0.19 / 0.06 | 14257 / 0.27 / 0.16 | 9532 / 0.34 / 0.42 | 3952 / 0.44 / 0.74 | 2276 / 0.55 / 0.88 | 1388 / 0.65 / 0.94 | 745 / 0.74 / 0.97 | 275 / 0.84 / 0.99 | 64 / 0.93 / 0.98 |
| 0–6 | 2 | fl-K | 101563 / 0.01 / 0.01 | 6107 / 0.17 / 0.11 | 10145 / 0.24 / 0.20 | 4375 / 0.34 / 0.38 | 2576 / 0.45 / 0.53 | 1978 / 0.55 / 0.68 | 1610 / 0.65 / 0.77 | 1523 / 0.75 / 0.84 | 1660 / 0.85 / 0.90 | 2521 / 0.96 / 0.96 |
| 0–6 | 2 | fl-P | 103589 / 0.01 / 0.01 | 5973 / 0.15 / 0.12 | 7240 / 0.25 / 0.19 | 3076 / 0.35 / 0.32 | 3227 / 0.45 / 0.47 | 3224 / 0.55 / 0.60 | 2633 / 0.65 / 0.77 | 2116 / 0.75 / 0.90 | 1801 / 0.85 / 0.96 | 1179 / 0.94 / 0.99 |
| 7–24 | 1 | cube | 332563 / 0.01 / 0.02 | 834 / 0.19 / 0.19 | 43535 / 0.25 / 0.18 | 13105 / 0.34 / 0.33 | 5679 / 0.44 / 0.47 | 3438 / 0.55 / 0.56 | 2095 / 0.65 / 0.59 | 1158 / 0.75 / 0.62 | 522 / 0.84 / 0.66 | 118 / 0.93 / 0.68 |
| 7–24 | 1 | fl-P | 338255 / 0.02 / 0.02 | 25049 / 0.15 / 0.17 | 20250 / 0.24 / 0.25 | 8308 / 0.35 / 0.38 | 4847 / 0.45 / 0.50 | 2975 / 0.55 / 0.58 | 1812 / 0.65 / 0.64 | 981 / 0.74 / 0.70 | 480 / 0.84 / 0.72 | 90 / 0.93 / 0.77 |
| 25–48 | 1 | cube | 17375 / 0.01 / 0.02 | 313 / 0.19 / 0.16 | 2613 / 0.24 / 0.17 | 638 / 0.34 / 0.34 | 350 / 0.44 / 0.49 | 194 / 0.55 / 0.55 | 121 / 0.64 / 0.54 | 43 / 0.74 / 0.65 | 19 / 0.83 / 0.42 | — |
| 25–48 | 1 | fl-P | 18351 / 0.02 / 0.02 | 1606 / 0.15 / 0.20 | 762 / 0.24 / 0.29 | 444 / 0.35 / 0.40 | 259 / 0.45 / 0.45 | 131 / 0.55 / 0.56 | 63 / 0.64 / 0.54 | 36 / 0.75 / 0.42 | 13 / 0.83 / 0.38 | 1 / 0.91 / 0.00 |
| 51–120 | 1 | Mittel | 185864 / 0.03 / 0.03 | 64016 / 0.13 / 0.13 | 10240 / 0.24 / 0.28 | 2644 / 0.34 / 0.36 | 711 / 0.44 / 0.43 | 128 / 0.54 / 0.37 | 22 / 0.62 / 0.50 | 1 / 0.76 / 0.00 | — | — |
| 51–120 | 1 | cube | 164738 / 0.02 / 0.02 | 80144 / 0.15 / 0.12 | 15655 / 0.23 / 0.24 | 2665 / 0.34 / 0.39 | 389 / 0.43 / 0.47 | 33 / 0.53 / 0.67 | 2 / 0.64 / 0.00 | — | — | — |
| 51–120 | 1 | fl-K | 215582 / 0.03 / 0.04 | 35971 / 0.14 / 0.17 | 7907 / 0.24 / 0.28 | 2651 / 0.34 / 0.33 | 997 / 0.44 / 0.37 | 392 / 0.54 / 0.41 | 98 / 0.63 / 0.32 | 25 / 0.73 / 0.44 | 3 / 0.82 / 0.33 | — |
| 51–120 | 1 | fl-P | 216053 / 0.03 / 0.04 | 31240 / 0.14 / 0.16 | 9937 / 0.24 / 0.26 | 4206 / 0.34 / 0.33 | 1576 / 0.44 / 0.38 | 502 / 0.54 / 0.42 | 100 / 0.64 / 0.60 | 12 / 0.73 / 0.75 | — | — |
| 51–120 | 3 | Mittel | 498378 / 0.03 / 0.03 | 233918 / 0.15 / 0.16 | 64201 / 0.24 / 0.31 | 19288 / 0.34 / 0.45 | 8115 / 0.44 / 0.50 | 2797 / 0.54 / 0.60 | 738 / 0.63 / 0.63 | 79 / 0.73 / 0.90 | 2 / 0.80 / 0.50 | — |
| 51–120 | 3 | cube | 495527 / 0.02 / 0.03 | 279484 / 0.14 / 0.18 | 45562 / 0.23 / 0.40 | 6107 / 0.33 / 0.58 | 747 / 0.43 / 0.63 | 81 / 0.53 / 0.83 | 8 / 0.62 / 0.63 | — | — | — |
| 51–120 | 3 | fl-K | 513550 / 0.03 / 0.03 | 183376 / 0.14 / 0.16 | 77547 / 0.24 / 0.25 | 25684 / 0.34 / 0.38 | 12908 / 0.44 / 0.44 | 7380 / 0.55 / 0.47 | 4021 / 0.65 / 0.53 | 2036 / 0.74 / 0.58 | 850 / 0.84 / 0.63 | 164 / 0.93 / 0.73 |
| 51–120 | 3 | fl-P | 544752 / 0.04 / 0.03 | 140347 / 0.14 / 0.16 | 65881 / 0.24 / 0.23 | 35749 / 0.35 / 0.35 | 21415 / 0.44 / 0.41 | 10601 / 0.54 / 0.45 | 5111 / 0.64 / 0.49 | 2662 / 0.74 / 0.50 | 935 / 0.84 / 0.56 | 63 / 0.92 / 0.67 |
| 126–240 | 1 | Mittel | 84194 / 0.06 / 0.05 | 16811 / 0.12 / 0.13 | 669 / 0.23 / 0.27 | 43 / 0.33 / 0.51 | — | 1 / 0.51 / 0.00 | — | — | — | — |
| 126–240 | 1 | cube | 58706 / 0.07 / 0.04 | 41782 / 0.13 / 0.10 | 1204 / 0.22 / 0.21 | 26 / 0.33 / 0.69 | — | — | — | — | — | — |
| 126–240 | 1 | fl-K | 93802 / 0.04 / 0.06 | 7124 / 0.13 / 0.16 | 635 / 0.24 / 0.23 | 132 / 0.34 / 0.30 | 23 / 0.43 / 0.52 | 1 / 0.55 / 0.00 | 1 / 0.69 / 0.00 | — | — | — |
| 126–240 | 1 | fl-P | 75606 / 0.04 / 0.05 | 19800 / 0.14 / 0.11 | 4838 / 0.24 / 0.16 | 1186 / 0.34 / 0.21 | 247 / 0.44 / 0.28 | 32 / 0.54 / 0.41 | 8 / 0.64 / 0.88 | 1 / 0.75 / 0.00 | — | — |
| 126–240 | 3 | cube | 213983 / 0.06 / 0.07 | 115974 / 0.13 / 0.17 | 2806 / 0.22 / 0.29 | 121 / 0.32 / 0.43 | 1 / 0.40 / 1.00 | — | — | — | — | — |
| 126–240 | 3 | fl-P | 205003 / 0.06 / 0.06 | 93605 / 0.14 / 0.15 | 25865 / 0.24 / 0.25 | 6735 / 0.34 / 0.32 | 1435 / 0.44 / 0.33 | 221 / 0.53 / 0.39 | 17 / 0.65 / 0.29 | 4 / 0.71 / 0.00 | — | — |

### D5 Prädiktoren des Auftretens (punktbiseriale Korrelation von nass(y ≥ 0,1) mit dem Prädiktor; Quellen s0…s6 = icon_d2, icon_ch1_eps, icon_eu, ifs_hres, aifs_single, icon_ch2_eps, icon_global; nur Stufen t1/t2 für die Quellen)

| Bin | Prädiktor | n | r |
|---|---|---|---|
| 0–6 | c_precip_sd ln1p | 269111 | 0.485 |
| 0–6 | c_precip ln1p | 269111 | 0.617 |
| 0–6 | cubeHurdle pWet | 269111 | 0.636 |
| 0–6 | member ln1p | 269111 | 0.622 |
| 0–6 | icon_d2 ln1p | 269111 | 0.584 |
| 0–6 | icon_d2 wet | 269111 | 0.641 |
| 0–6 | icon_ch1_eps ln1p | 29549 | 0.396 |
| 0–6 | icon_ch1_eps wet | 29549 | 0.457 |
| 0–6 | icon_eu ln1p | 269111 | 0.545 |
| 0–6 | icon_eu wet | 269111 | 0.513 |
| 7–24 | c_precip_sd ln1p | 403047 | 0.365 |
| 7–24 | c_precip ln1p | 403047 | 0.427 |
| 7–24 | cubeHurdle pWet | 403047 | 0.462 |
| 7–24 | member ln1p | 403047 | 0.430 |
| 7–24 | icon_d2 ln1p | 403047 | 0.380 |
| 7–24 | icon_d2 wet | 403047 | 0.433 |
| 7–24 | icon_ch1_eps ln1p | 87975 | 0.337 |
| 7–24 | icon_ch1_eps wet | 87975 | 0.406 |
| 7–24 | icon_eu ln1p | 403047 | 0.374 |
| 7–24 | icon_eu wet | 403047 | 0.363 |
| 25–48 | c_precip_sd ln1p | 306652 | 0.290 |
| 25–48 | c_precip ln1p | 532502 | 0.323 |
| 25–48 | cubeHurdle pWet | 532502 | 0.378 |
| 25–48 | member ln1p | 532502 | 0.325 |
| 25–48 | icon_d2 ln1p | 532502 | 0.297 |
| 25–48 | icon_d2 wet | 532502 | 0.350 |
| 25–48 | icon_ch1_eps ln1p | 28733 | 0.301 |
| 25–48 | icon_ch1_eps wet | 28733 | 0.375 |
| 25–48 | icon_eu ln1p | 299585 | 0.325 |
| 25–48 | icon_eu wet | 299585 | 0.323 |
| 51–120 | c_precip_sd ln1p | 626209 | 0.297 |
| 51–120 | c_precip ln1p | 1091142 | 0.355 |
| 51–120 | cubeHurdle pWet | 1091142 | 0.356 |
| 51–120 | member ln1p | 1091142 | 0.359 |
| 51–120 | icon_eu ln1p | 626209 | 0.333 |
| 51–120 | icon_eu wet | 626209 | 0.334 |
| 51–120 | ifs_hres ln1p | 1091142 | 0.321 |
| 51–120 | ifs_hres wet | 1091142 | 0.311 |
| 51–120 | icon_ch2_eps ln1p | 171046 | 0.243 |
| 51–120 | icon_ch2_eps wet | 171046 | 0.270 |
| 51–120 | icon_global ln1p | 263626 | 0.247 |
| 51–120 | icon_global wet | 263626 | 0.252 |
| 126–240 | c_precip_q90 ln1p | 434603 | 0.248 |
| 126–240 | c_precip_sd_ens raw | 434603 | 0.203 |
| 126–240 | c_precip_sd ln1p | 434603 | 0.169 |
| 126–240 | c_precip ln1p | 434603 | 0.217 |
| 126–240 | cubeHurdle pWet | 434603 | 0.188 |
| 126–240 | member ln1p | 434603 | 0.219 |
| 246–336 | c_precip_q90 ln1p | 343499 | 0.100 |
| 246–336 | c_precip_sd_ens raw | 343499 | 0.066 |
| 246–336 | c_precip_sd ln1p | 343499 | 0.052 |
| 246–336 | c_precip ln1p | 343499 | 0.062 |
| 246–336 | cubeHurdle pWet | 343499 | 0.065 |
| 246–336 | member ln1p | 343499 | 0.063 |

## D6 Bewölkung (DE) je Bin × Route — Atome, PIT, Spread/Skill korrigiert, Schichtbewölkung

P(0)/P(100) der zensierten Normal (fl-K mit geschriebener Skala; Cube) gegen die beobachteten Atome P(y ≤ 0,5 %) / P(y ≥ 99,5 %). S/S₁ = latente σ / RMSE(Median), S/S₂ = Tobit-sd / RMSE.

| Bin | Route | n | obs 0 | obs 100 | P0 K | P100 K | P0 Cube | P100 Cube | RMSE K | S/S₁ K | S/S₂ K | RMSE Cube | S/S₁ Cube | S/S₂ Cube | PIT außen K | Cube | PIT K (Dezile %) | PIT Cube |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0–6 | 1 | 74039 | 0.251 | 0.317 | 0.125 | 0.191 | 0.027 | 0.110 | 26.82 | 1.19 | 0.88 | 28.78 | 0.72 | 0.64 | 0.182 | 0.500 | 10 10 15 6 8 5 5 16 17 8 | 33 4 3 3 7 4 4 4 21 17 |
| 0–6 | 2 | 73654 | 0.164 | 0.493 | 0.063 | 0.259 | 0.020 | 0.163 | 23.90 | 1.08 | 0.80 | 25.07 | 0.77 | 0.65 | 0.170 | 0.380 | 9 8 7 9 6 3 3 24 24 8 | 22 2 2 2 10 4 3 3 37 16 |
| 7–24 | 1 | 220950 | 0.252 | 0.316 | 0.133 | 0.199 | 0.026 | 0.108 | 29.28 | 1.29 | 0.93 | 30.60 | 0.71 | 0.63 | 0.167 | 0.510 | 9 12 13 4 9 7 5 14 19 8 | 33 4 3 3 4 6 4 4 20 18 |
| 25–48 | 1 | 291677 | 0.253 | 0.316 | 0.136 | 0.200 | 0.026 | 0.107 | 32.69 | 1.31 | 0.93 | 33.07 | 0.68 | 0.61 | 0.178 | 0.525 | 10 17 7 4 7 9 6 8 25 8 | 33 4 3 3 2 8 4 4 19 19 |
| 51–120 | 1 | 140442 | 0.252 | 0.329 | 0.165 | 0.228 | 0.020 | 0.102 | 36.35 | 1.48 | 0.96 | 36.06 | 0.69 | 0.62 | 0.159 | 0.575 | 9 17 6 5 6 9 8 8 26 7 | 32 4 3 2 2 5 6 5 15 26 |
| 51–120 | 3 | 369816 | 0.174 | 0.500 | 0.081 | 0.302 | 0.016 | 0.131 | 32.65 | 1.39 | 0.93 | 32.92 | 0.73 | 0.64 | 0.174 | 0.511 | 11 10 3 4 9 6 4 25 22 7 | 22 2 2 2 1 7 5 4 26 30 |
| 126–240 | 1 | 54598 | 0.242 | 0.319 | 0.203 | 0.282 | 0.018 | 0.093 | 40.09 | 1.73 | 0.97 | 39.17 | 0.67 | 0.61 | 0.110 | 0.629 | 8 17 5 6 6 11 10 7 27 3 | 31 4 3 2 2 3 6 7 10 32 |
| 126–240 | 3 | 177106 | 0.158 | 0.495 | 0.103 | 0.319 | 0.013 | 0.114 | 36.49 | 1.50 | 0.94 | 36.63 | 0.69 | 0.62 | 0.176 | 0.625 | 13 7 3 3 7 8 5 19 29 5 | 21 2 2 1 2 3 7 5 15 42 |
| 246–336 | 1 | 41480 | 0.226 | 0.327 | 0.227 | 0.338 | 0.019 | 0.082 | 41.89 | 2.02 | 0.98 | 40.70 | 0.65 | 0.60 | 0.051 | 0.654 | 5 18 5 7 8 14 9 6 28 0 | 29 4 3 2 2 3 5 7 9 36 |
| 246–336 | 3 | 141621 | 0.164 | 0.491 | 0.130 | 0.331 | 0.013 | 0.114 | 39.06 | 1.61 | 0.95 | 39.21 | 0.65 | 0.58 | 0.161 | 0.653 | 14 5 4 3 5 12 6 10 39 2 | 22 2 2 1 2 2 6 5 14 44 |

### D6 MAE/Bias des fl-K-Medians nach Klasse der Schicht-Bewölkung (c_clcl/c_clcm/c_clch < 20 / 20–80 / > 80 %) bei gleicher Klasse der Gesamtbewölkung c_clct (< 33 / 33–67 / > 67 %)

| Bin | c_clct-Klasse | Schicht | Schicht-Klasse | n | MAE | Bias (y − Median) |
|---|---|---|---|---|---|---|
| 0–6 | <33 | clch | <20 | 31007 | 16.14 | 1.52 |
| 0–6 | <33 | clch | 20–80 | 1218 | 32.59 | 7.67 |
| 0–6 | <33 | clcl | <20 | 28732 | 15.49 | 2.87 |
| 0–6 | <33 | clcl | 20–80 | 3493 | 27.17 | -7.44 |
| 0–6 | <33 | clcm | <20 | 29868 | 15.94 | 2.26 |
| 0–6 | <33 | clcm | 20–80 | 2357 | 27.13 | -4.61 |
| 0–6 | 33–67 | clch | <20 | 17718 | 32.19 | -3.07 |
| 0–6 | 33–67 | clch | 20–80 | 7163 | 33.53 | 2.23 |
| 0–6 | 33–67 | clch | >80 | 72 | 33.60 | -22.44 |
| 0–6 | 33–67 | clcl | <20 | 11142 | 33.38 | 1.43 |
| 0–6 | 33–67 | clcl | 20–80 | 13767 | 31.96 | -4.06 |
| 0–6 | 33–67 | clcl | >80 | 44 | 26.02 | -1.96 |
| 0–6 | 33–67 | clcm | <20 | 12928 | 33.36 | -3.59 |
| 0–6 | 33–67 | clcm | 20–80 | 11895 | 31.85 | 0.51 |
| 0–6 | 33–67 | clcm | >80 | 130 | 21.52 | 2.42 |
| 0–6 | >67 | clch | <20 | 33258 | 16.20 | 1.77 |
| 0–6 | >67 | clch | 20–80 | 24689 | 15.28 | 0.47 |
| 0–6 | >67 | clch | >80 | 32568 | 9.67 | -1.95 |
| 0–6 | >67 | clcl | <20 | 21227 | 17.01 | -1.59 |
| 0–6 | >67 | clcl | 20–80 | 42391 | 15.08 | -0.36 |
| 0–6 | >67 | clcl | >80 | 26897 | 8.57 | 2.07 |
| 0–6 | >67 | clcm | <20 | 17873 | 19.25 | -1.86 |
| 0–6 | >67 | clcm | 20–80 | 35578 | 16.80 | -0.54 |
| 0–6 | >67 | clcm | >80 | 37064 | 7.80 | 1.60 |
| 7–24 | <33 | clch | <20 | 57686 | 18.83 | 1.90 |
| 7–24 | <33 | clch | 20–80 | 2310 | 32.51 | 3.06 |
| 7–24 | <33 | clcl | <20 | 53564 | 18.19 | 2.53 |
| 7–24 | <33 | clcl | 20–80 | 6432 | 29.03 | -2.94 |
| 7–24 | <33 | clcm | <20 | 54557 | 18.33 | 2.47 |
| 7–24 | <33 | clcm | 20–80 | 5439 | 29.65 | -3.30 |
| 7–24 | 33–67 | clch | <20 | 33675 | 32.42 | 0.68 |
| 7–24 | 33–67 | clch | 20–80 | 14427 | 35.40 | -0.62 |
| 7–24 | 33–67 | clch | >80 | 293 | 42.58 | -33.22 |
| 7–24 | 33–67 | clcl | <20 | 23556 | 34.90 | -1.11 |
| 7–24 | 33–67 | clcl | 20–80 | 24691 | 31.94 | 1.27 |
| 7–24 | 33–67 | clcl | >80 | 148 | 30.20 | -8.01 |
| 7–24 | 33–67 | clcm | <20 | 22355 | 34.00 | -1.67 |
| 7–24 | 33–67 | clcm | 20–80 | 25755 | 32.90 | 1.63 |
| 7–24 | 33–67 | clcm | >80 | 285 | 27.44 | -1.53 |
| 7–24 | >67 | clch | <20 | 33640 | 20.68 | 3.58 |
| 7–24 | >67 | clch | 20–80 | 31202 | 20.75 | 0.49 |
| 7–24 | >67 | clch | >80 | 47717 | 14.37 | -2.47 |
| 7–24 | >67 | clcl | <20 | 37801 | 21.32 | -3.17 |
| 7–24 | >67 | clcl | 20–80 | 62607 | 17.43 | 1.51 |
| 7–24 | >67 | clcl | >80 | 12151 | 10.79 | 3.53 |
| 7–24 | >67 | clcm | <20 | 18074 | 25.90 | -7.57 |
| 7–24 | >67 | clcm | 20–80 | 56012 | 20.32 | -0.00 |
| 7–24 | >67 | clcm | >80 | 38473 | 10.97 | 4.02 |
| 25–48 | <33 | clch | <20 | 81094 | 26.18 | 0.98 |
| 25–48 | <33 | clch | 20–80 | 2932 | 35.30 | -0.14 |
| 25–48 | <33 | clch | >80 | 16 | 57.77 | -54.69 |
| 25–48 | <33 | clcl | <20 | 77036 | 25.90 | 1.08 |
| 25–48 | <33 | clcl | 20–80 | 7003 | 33.13 | -0.71 |
| 25–48 | <33 | clcl | >80 | 3 | 72.66 | -72.66 |
| 25–48 | <33 | clcm | <20 | 76994 | 25.80 | 1.35 |
| 25–48 | <33 | clcm | 20–80 | 7048 | 34.18 | -3.60 |
| 25–48 | 33–67 | clch | <20 | 43486 | 34.32 | 0.76 |
| 25–48 | 33–67 | clch | 20–80 | 14965 | 36.96 | -0.20 |
| 25–48 | 33–67 | clch | >80 | 2226 | 36.56 | -22.18 |
| 25–48 | 33–67 | clcl | <20 | 31362 | 36.82 | -2.49 |
| 25–48 | 33–67 | clcl | 20–80 | 28805 | 33.25 | 2.16 |
| 25–48 | 33–67 | clcl | >80 | 510 | 28.46 | -6.80 |
| 25–48 | 33–67 | clcm | <20 | 27858 | 35.78 | -0.82 |
| 25–48 | 33–67 | clcm | 20–80 | 30893 | 34.78 | 0.60 |
| 25–48 | 33–67 | clcm | >80 | 1926 | 29.12 | -7.84 |
| 25–48 | >67 | clch | <20 | 47959 | 23.98 | 2.59 |
| 25–48 | >67 | clch | 20–80 | 32238 | 23.92 | 3.02 |
| 25–48 | >67 | clch | >80 | 66761 | 19.23 | 0.08 |
| 25–48 | >67 | clcl | <20 | 53607 | 25.48 | -2.79 |
| 25–48 | >67 | clcl | 20–80 | 74182 | 20.92 | 3.65 |
| 25–48 | >67 | clcl | >80 | 19169 | 14.94 | 5.50 |
| 25–48 | >67 | clcm | <20 | 26446 | 28.63 | -6.97 |
| 25–48 | >67 | clcm | 20–80 | 64962 | 23.78 | 1.56 |
| 25–48 | >67 | clcm | >80 | 55550 | 16.25 | 5.57 |
| 51–120 | <33 | clch | <20 | 78361 | 33.60 | -6.30 |
| 51–120 | <33 | clch | 20–80 | 4085 | 39.88 | -10.28 |
| 51–120 | <33 | clch | >80 | 38 | 56.02 | -49.97 |
| 51–120 | <33 | clcl | <20 | 70299 | 33.08 | -6.22 |
| 51–120 | <33 | clcl | 20–80 | 12162 | 38.74 | -8.25 |
| 51–120 | <33 | clcl | >80 | 23 | 38.82 | -24.74 |
| 51–120 | <33 | clcm | <20 | 73777 | 33.30 | -6.14 |
| 51–120 | <33 | clcm | 20–80 | 8685 | 39.11 | -9.64 |
| 51–120 | <33 | clcm | >80 | 22 | 61.70 | -53.63 |
| 51–120 | 33–67 | clch | <20 | 62315 | 35.50 | 0.94 |
| 51–120 | 33–67 | clch | 20–80 | 17721 | 37.57 | -2.23 |
| 51–120 | 33–67 | clch | >80 | 8711 | 37.36 | -26.41 |
| 51–120 | 33–67 | clcl | <20 | 39242 | 38.89 | -6.19 |
| 51–120 | 33–67 | clcl | 20–80 | 46461 | 34.18 | 1.54 |
| 51–120 | 33–67 | clcl | >80 | 3044 | 29.27 | -12.99 |
| 51–120 | 33–67 | clcm | <20 | 41238 | 38.09 | -3.10 |
| 51–120 | 33–67 | clcm | 20–80 | 39878 | 35.37 | 0.74 |
| 51–120 | 33–67 | clcm | >80 | 7631 | 29.12 | -14.74 |
| 51–120 | >67 | clch | <20 | 58351 | 22.31 | 2.83 |
| 51–120 | >67 | clch | 20–80 | 29932 | 22.77 | 4.06 |
| 51–120 | >67 | clch | >80 | 69857 | 19.92 | -1.19 |
| 51–120 | >67 | clcl | <20 | 40805 | 25.71 | -3.54 |
| 51–120 | >67 | clcl | 20–80 | 88025 | 21.59 | 2.92 |
| 51–120 | >67 | clcl | >80 | 29310 | 14.49 | 3.11 |
| 51–120 | >67 | clcm | <20 | 27469 | 28.07 | -3.44 |
| 51–120 | >67 | clcm | 20–80 | 60610 | 24.16 | 2.39 |
| 51–120 | >67 | clcm | >80 | 70061 | 16.26 | 2.19 |
| 126–240 | <33 | clch | <20 | 5687 | 36.74 | -6.26 |
| 126–240 | <33 | clch | 20–80 | 389 | 39.94 | -16.40 |
| 126–240 | <33 | clch | >80 | 18 | 59.60 | -48.67 |
| 126–240 | <33 | clcl | <20 | 4833 | 36.52 | -6.48 |
| 126–240 | <33 | clcl | 20–80 | 1255 | 38.86 | -9.05 |
| 126–240 | <33 | clcl | >80 | 6 | 46.51 | -31.83 |
| 126–240 | <33 | clcm | <20 | 4944 | 36.17 | -4.58 |
| 126–240 | <33 | clcm | 20–80 | 1139 | 40.57 | -17.55 |
| 126–240 | <33 | clcm | >80 | 11 | 50.16 | -20.93 |
| 126–240 | 33–67 | clch | <20 | 7108 | 37.26 | 3.63 |
| 126–240 | 33–67 | clch | 20–80 | 1345 | 38.34 | -5.71 |
| 126–240 | 33–67 | clch | >80 | 2492 | 39.92 | -21.33 |
| 126–240 | 33–67 | clcl | <20 | 4427 | 40.09 | -6.17 |
| 126–240 | 33–67 | clcl | 20–80 | 6037 | 36.79 | -0.51 |
| 126–240 | 33–67 | clcl | >80 | 481 | 33.99 | -9.72 |
| 126–240 | 33–67 | clcm | <20 | 4842 | 39.32 | -0.66 |
| 126–240 | 33–67 | clcm | 20–80 | 4694 | 37.35 | -2.89 |
| 126–240 | 33–67 | clcm | >80 | 1409 | 35.63 | -12.98 |
| 126–240 | >67 | clch | <20 | 4349 | 29.27 | 8.66 |
| 126–240 | >67 | clch | 20–80 | 1362 | 29.79 | 8.75 |
| 126–240 | >67 | clch | >80 | 4960 | 28.31 | -0.95 |
| 126–240 | >67 | clcl | <20 | 2618 | 30.84 | 0.47 |
| 126–240 | >67 | clcl | 20–80 | 6663 | 28.85 | 5.43 |
| 126–240 | >67 | clcl | >80 | 1390 | 25.38 | 5.38 |
| 126–240 | >67 | clcm | <20 | 2287 | 32.09 | 3.02 |
| 126–240 | >67 | clcm | 20–80 | 4650 | 29.47 | 5.27 |
| 126–240 | >67 | clcm | >80 | 3734 | 26.20 | 3.61 |
