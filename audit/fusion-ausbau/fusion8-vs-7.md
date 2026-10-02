# „buscosun Fusion 8" (Hürde nachkalibriert) gegen „buscosun Fusion 7" — Niederschlag an den Stationen (02.10.2026)

Karte `C:\dev\buscosun-hindcast\score\2026-10-02-f8\scorecard.{json,md}` (Lauf 09:50–11:14 UTC, `scripts/fusionfit/stack-score.mjs` mit
den neuen Niederschlagszellen), Zeilen `score\2026-10-01-f7\rows.jsonl.gz` (405 810 Zeilen, 16.–30.09., 14 Ausgabetage, 389
Stationspunkte; Kandidat offline aus der Fusion-7-Hürde, keine Neu-Extraktion). Regel eingefroren 09:32 UTC (`audit/fusion-ausbau.md`
§6l.1), Situationen präzisiert 09:50 UTC vor dem gültigen Lauf. Alles indikativ (n_eff ≤ 14 Tage, 6 Regentage).

## Verdikt

**Fusion 8 GLEICHSTAND (0 Tupel signifikant besser / 0 schlechter von 24).** Kontrollen: **K11 bestanden** (0 von 60 Nicht-Niederschlags-
Zellen bewegt), **K12 NICHT bestanden** (unterer Rand nicht in beiden Bins beider Modi näher an der Diagonale), **K13 NICHT bestanden**
(In-sample 0,9–1,5 % (S) bzw. 1,0–5,2 % (L) Brier besser als Leave-Day-out ⇒ die Parameter hängen am Tag). **Fusion 8 wird nicht
eingeschaltet, die Tabelle nicht veröffentlicht; die Motor-Option `precipCal` bleibt gebaut und aus.**

## Fusion 8 gegen Fusion 7 (Schicht all; * / ! = BH-adjustiert p < 0,05)

| Bin | S Brier | S CRPS | L Brier | L CRPS |
|---|---|---|---|---|
| 0–6 h | +0,3 % | 0,0 % | +2,8 % | +2,0 % |
| 7–24 h | −1,4 % | −0,4 % | +1,4 % | +0,6 % |
| 25–48 h | −0,8 % | +0,3 % | +3,8 % | +2,5 % |
| 51–120 h | −0,5 % | −0,4 % | +1,4 % | +0,8 % |
| 126–240 h | −0,9 % | −0,5 % | +9,4 % (p 0,09) | +5,6 % (p 0,10) |
| 246–336 h | 0,0 % | 0,0 % | +48 % (p 0,19, 4 d) | +50 % (p 0,17) |

Länder (nicht Teil der Regel): Modus S CH Brier 25–48 h **−3,4 %!**, 51–120 h **−74 %!** (sehr wenige Regenstunden, die Kurve kippt);
Modus L CH Brier 7–24 h **+19,7 %***, 25–48 h **+32,3 %***, 51–120 h **+52,4 %*** — die gelernte Hürde ohne Station war in CH deutlich zu
scharf/zu trocken, dort hilft die Karte; DE/AT ±3 % n.s.

## Absolut (Schicht all) — Brier-Skill gegen die Basisrate, Treffer/Fehlalarm bei p ≥ 0,5

| Bin | Modus | Basisrate | BSS Fusion 7 → 8 | POD / FAR Fusion 7 → 8 | Zum Vergleich |
|---|---|---|---|---|---|
| 0–6 h | S | 3,4 % | 0,286 → 0,288 | 0,33 / 0,41 → 0,26 / 0,36 | MOSMIX-Punktwert BSS −0,76, live −0,80, fl-K@5e 0,21 |
| 7–24 h | S | 2,8 % | 0,265 → 0,255 | 0,17 / 0,31 → 0,21 / 0,43 | fl-K@5e 0,19 |
| 25–48 h | S | 2,7 % | 0,149 → 0,142 | 0,02 / 0,53 → 0,08 / 0,59 | fl-K@5e 0,07 |
| 51–120 h | S | 2,4 % | 0,109 → 0,104 | 0,00 → 0,00 | fl-K@5e 0,11 |
| 126–240 h | S | 1,4 % | −0,007 → −0,016 | 0 → 0 | live −0,04 |
| 0–6 h | L | 3,4 % | 0,243 → 0,264 | 0,30 / 0,36 → 0,23 / 0,30 | fl-K@5e 0,21 |
| 7–24 h | L | 2,8 % | 0,193 → 0,204 | 0,14 / 0,36 → 0,11 / 0,40 | |
| 25–48 h | L | 2,7 % | 0,070 → 0,106 | 0,02 → 0,01 | |
| 51–120 h | L | 2,4 % | 0,103 → 0,116 | 0,01 → 0,04 | |
| 126–240 h | L | 1,4 % | −0,125 → −0,019 | 0 → 0 | fl-K@5e −0,15 |

Lesart: die Hürde von Fusion 7 ist probabilistisch deutlich besser als jeder Punktwert (MOSMIX und der Live-Pfad liegen mit ihrer 0/1-
Aussage unter der Klimatologie); der Punktwert (Median) sagt bei 3 % Basisrate fast nie Regen — das ist die MAE-Optimalität, kein Fehler.

## Reliability am unteren Rand (Vorlauf ≤ 48 h, Schicht all; n · vorhergesagt · beobachtet)

| Modus | Bin | Fusion 7 | Fusion 8 |
|---|---|---|---|
| S | 0–10 % | 206 968 · 0,006 · 0,013 | 206 264 · 0,010 · 0,012 |
| S | 10–20 % | 1 460 · 0,135 · 0,242 | 2 144 · 0,134 · 0,248 |
| L | 0–10 % | 199 701 · 0,029 · 0,010 | 199 861 · 0,011 · 0,010 |
| L | 10–20 % | 614 · 0,121 · 0,101 | 8 239 · 0,165 · 0,204 |

Der 0–10-%-Bin wird in beiden Modi besser (S 0,006 → 0,010 gegen 0,012; L war zu NASS: 0,029 → 0,011 gegen 0,010), der 10–20-%-Bin
nicht: dort bleiben 24–25 % Regenstunden bei 13 % Vorhersage (S) — die Zeilen, die eine affine Karte auf der Probit-Skala nicht
trennen kann (gleiche Vorhersage, andere Ausgänge). In S verschiebt die Karte Masse von 20–30 % in 40–60 % (dort jetzt zu nass: 0,44
→ 0,35 beobachtet). Die Hälfte aller Regenstunden liegt weiter bei p < 10 %: kein Kalibrierproblem, ein Informationsproblem.

## Parameter (In-sample, alle Tage; k2 = Station/Radar-Kette, learned = gelernte Hürde)

| Situation | 1–3 h | 4–6 h | 7–24 h | 25–48 h | 51–120 h | 126–336 h |
|---|---|---|---|---|---|---|
| k2 (a · b) | −0,22 · 0,82 | −0,16 · 0,85 | +0,10 · 0,99 | +0,21 · 0,96 | −0,03 · 0,85 | Identität (727 nass) |
| learned (a · b) | — (keine Zeilen: Radar hält K-2) | −0,43 · 0,92 | −0,15 · 1,15 | −0,13 · 1,27 | +0,30 · 1,53 | −0,28 · 1,30 |

k2 liegt nahe der Identität (b 0,82–0,99); die gelernte Hürde (Modus L ohne Station) ist zu unscharf (b > 1 schärft) — passend zu den
L-Gewinnen. K13: Leave-Day-out-Parameter streuen mit dem Tag (6 Regentage).

## Nebenbefund an derselben Karte

Fusion 7 gegen Fusion 6 steht hier mit **3 besser / 0 schlechter** (01.10.: 4 / 0) — dieselben Zahlen, aber die BH-Korrektur läuft jetzt
über 47 702 statt der früheren Tests (die Brier-Paare kommen dazu), ein Tupel verliert die Signifikanz. Nach der Regel weiter BESSER
(≥ 3), aber am Rand — der Fusion-7-Gewinn ist, wie am 01.10. gesagt, klein.

## Folgen

- Fusion 8 als Nachkalibrierung: **nein** (GLEICHSTAND, K12/K13 rot). Option `FuseCubeOptions.precipCal` + Leser + Tabelle bleiben
  gebaut und aus (Verifier `verify:pv-cube` Block 39, `verify:fusion-fit` Block 18); Wiederholung erst mit ≥ 30 Ausgabetagen
  (mehr Regentage, dann je Land möglich — CH-Signal im Modus L).
- Der eigentliche Hebel ist Information, nicht Kalibrierung: **V-AX-23** (Radar-Stundenmittel statt Einzelframe, POD 0,37 → 0,49 bei
  FAR 0,69 → 0,47; §6l.2) als nächster Kandidat mit Neu-Extraktion; danach die Frage, ob der Member-Spread (`precip_sd`, ENS-Mittel
  `precip_ens` seit Schema 6) in die Hürde gehört.
- Die Niederschlagszellen (Brier, Reliability, POD/FAR) bleiben im Scorer — jede weitere Änderung am Niederschlag wird damit sichtbar.
