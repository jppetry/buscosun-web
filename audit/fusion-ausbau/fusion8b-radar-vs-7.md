# Kandidat B „buscosun Fusion 8" (Radar-Stundenmittel, V-AX-23) gegen „buscosun Fusion 7" — Niederschlag an den Stationen (02.10.2026)

Karte `C:\dev\buscosun-hindcast\score\2026-10-02-f8r\scorecard.{json,md}` (Neu-Extraktion 12:25–12:48 UTC mit `stack-extract.mjs
--variants=F7a,F8r --slotsFrom=2026-09-16 --slotsTo=2026-09-30`, Karte 12:48–13:47 UTC mit `stack-score.mjs --refCard=…/2026-10-01-f7/
scorecard.json`). Dieselben 405 810 Zeilen wie die Karten vom 01./02.10. (16.–30.09., 14 Ausgabetage, 389 Stationspunkte), 30 025 DM-Tests
(BH über die Karte). Regel eingefroren 11:58 UTC vor dem Bau der Option (`audit/fusion-ausbau.md` §6l.4). Alles indikativ (n_eff ≤ 14 Tage,
6 Regentage).

**Kandidat:** F8r = Fusion 7, wie es läuft (F7a: Stufe fs + Wind-Anker 10 km), plus Motor-Option `nowcastHourMean` — der Radar-Member einer
Stunde t ist das Mittel der 5-min-Frame-Raten im Fenster (t − 60 min, t] bei ≥ 6 Frames, sonst der Einzelframe. Referenz `fusion7-anchorW`
= F7a derselben Extraktion.

## Verdikt

**GLEICHSTAND nach der Regel — primär 1 von 4 Tupeln signifikant besser (Modus L Brier +11,1 %*, p 0,048), 0 schlechter; Kontext 1 von 24
besser (L 0–6 h Brier +3,1 %*), 0 schlechter.** Das zweite primäre Tupel (Modus S Brier +9,0 %) liegt bei p 0,055 knapp über der Schwelle;
die Regel verlangt ≥ 2. Kontrollen: **K11 bestanden** (0/60 fremde Zellen bewegt), **K14 bestanden** (0/12 Niederschlagszellen außerhalb
der Radarstunden bewegt — Vorlauf 3–6 h und alle Bins ≥ 7 h byte-gleich), **K16 bestanden** (F7a der Neu-Extraktion = Karte vom 01.10. in
72/72 Zellen bis 1e-9: der Motor ohne Option ist unverändert). Nirgends eine Verschlechterung, auch nicht in einer Länderschicht.

## Primäre Zelle „Radarstunden" (Vorlauf 1–2 h, 8 526 Zeilen je Modus; * = BH-adjustiert p < 0,05)

| Modus | Brier | CRPS | MAE (Median, berichtet) | Brier DE | Brier AT | Brier CH |
|---|---|---|---|---|---|---|
| S (Punkt = Station) | +9,0 % (p 0,055) | +7,9 % (p 0,155) | +6,4 % | +13,8 % (p 0,077) | +0,8 % | +8,0 % |
| L (ohne Station) | **+11,1 %*** (p 0,048) | +8,9 % (p 0,165) | +6,8 % | +16,8 % (p 0,066) | +0,7 % | +7,6 % |

Kontext (Standard-Bins): 0–6 h Brier S +2,5 % (p 0,055), L **+3,1 %*** (verdünnt durch die unberührten Stunden 3–6 h); alle anderen Bins
und die Zelle 3–6 h exakt 0,0 % (K14). Die 24 Kontext-Tupel: nirgends schlechter.

## Absolut in den Radarstunden (Schicht all / DE; Treffer bei p_wet ≥ 0,5, Ereignis ≥ 0,1 mm/h)

| Modus | Schicht | Kandidat | Basisrate | Brier | BSS | POD | FAR | Freq-Bias | Treffer / Fehlalarm / verpasst |
|---|---|---|---|---|---|---|---|---|---|
| S | all | Fusion 7 (F7a) | 3,8 % | 0,0220 | 0,390 | 0,51 | 0,39 | 0,83 | 162 / 103 / 158 |
| S | all | **Kandidat B** | 3,8 % | **0,0201** | **0,445** | **0,60** | 0,36 | 0,94 | 192 / 109 / 128 |
| S | all | MOSMIX-Punktwert | 3,8 % | 0,0550 | −0,52 | 0,69 | 0,63 | 1,84 | 220 / 369 / 100 |
| S | all | Live-Pfad | 3,8 % | 0,0554 | −0,53 | 0,77 | 0,62 | 2,01 | 246 / 398 / 74 |
| S | DE | Fusion 7 (F7a) | 3,0 % | 0,0223 | 0,231 | 0,33 | 0,49 | 0,64 | 48 / 46 / 98 |
| S | DE | **Kandidat B** | 3,0 % | **0,0192** | **0,337** | **0,52** | 0,41 | 0,88 | 76 / 53 / 70 |
| L | all | Fusion 7 (F7a) | 3,8 % | 0,0226 | 0,375 | 0,45 | 0,30 | 0,65 | 145 / 63 / 175 |
| L | all | **Kandidat B** | 3,8 % | **0,0201** | **0,445** | **0,57** | 0,27 | 0,79 | 183 / 69 / 137 |
| L | DE | Fusion 7 (F7a) | 3,0 % | 0,0241 | 0,170 | 0,19 | 0,48 | 0,37 | 28 / 26 / 118 |
| L | DE | **Kandidat B** | 3,0 % | **0,0201** | **0,309** | **0,42** | 0,34 | 0,63 | 61 / 31 / 85 |

Lesart: der Kandidat findet in DE bei 1–2 h gut die Hälfte statt ein Drittel der Regenstunden, bei weniger Fehlalarmen (FAR 0,49 → 0,41)
— genau das, was die Member-Diagnose (§6l.2: POD 0,37 → 0,49) vorhergesagt hat, im Produkt sogar etwas mehr (die Hürde gewinnt am Radar-
Member). AT (INCA-Frames im 15-min-Takt ⇒ < 6 Frames ⇒ Einzelframe; RV nur im Westen) und CH (CombiPrecip nur Analyse) bewegen sich kaum.

## Reliability in den Radarstunden (Modus S; n · vorhergesagt · beobachtet)

| Bin | Fusion 7 (F7a) | Kandidat B |
|---|---|---|
| 0–10 % | 7 903 · 0,3 · 0,8 | 7 788 · 0,3 · 0,6 |
| 10–20 % | 183 · 14,4 · 25,1 | 172 · 14,8 · 9,9 |
| 20–30 % | 86 · 23,9 · 18,6 | 99 · 25,3 · 13,1 |
| 40–50 % | 43 · 45,5 · 39,5 | 116 · 45,9 · 29,3 |
| 50–60 % | 91 · 54,3 · 35,2 | 114 · 54,8 · 36,8 |
| 90–100 % | 53 · 95,9 · 96,2 | 52 · 96,0 · 100 |

Der untere Rand wird besser (0–10 %: 0,8 → 0,6 % beobachtet; der zu trockene 10–20-%-Bin verschwindet), dafür ist der Kandidat in
20–60 % jetzt zu nass (das Mittel hebt Nieselstunden in die Mitte, die dann doch trocken bleiben) — ein Kalibrierrest, der mit mehr
Regentagen zu prüfen ist (Nachkalibrierung nur der Radarstunden, §6l-Werkzeug `precipCal` liegt bereit).

## Folgen

- **Nach der Regel GLEICHSTAND ⇒ nicht einschalten; Option `nowcastHourMean` bleibt gebaut und aus.** Der Befund ist aber der stärkste
  Niederschlags-Hebel bisher: nirgends schlechter, alle Kontrollen bestanden, Effekt +9…+17 % Brier in der Zelle, die Nutzer am ehesten
  sehen („regnet es in der nächsten Stunde"), Treffer in DE +19 Punkte. Mit 14 Tagen fehlt die Signifikanz des zweiten Tupels (p 0,055).
- **Wiederholung ab ≥ 30 Ausgabetagen (≈ 15.10.)** mit derselben Regel — dann entscheidet die Karte, nicht die Erwartung.
- **E-AX-16 (Jan, unabhängig vom Verdikt vorzubereiten):** der Live-Pfad holt je Stunde EINEN Frame (V-AX-24). Einschalten hieße entweder
  elf weitere PNG je Radarstunde im Browser (≈ 1,8 MB für 1–2 h, Mobil-4G) oder ein Stundenmittel-Bild je Stunde im Radar-Spiegel (Producer,
  eine Datei je Slot-Stunde, Client liest es wie einen Frame). Ohne diese Entscheidung ist der Kandidat auch bei BESSER nicht deploybar.


## Zwischenstand 02.10. 16:34 UTC — dieselbe Regel auf allen Slots bis 01.10. (15 Ausgabetage; `score\2026-10-02-f8r-b`, nach dem Bau von E-AX-16)

Neu-Extraktion F7a + F8r auf 16 Slots (`--slotsFrom=2026-09-16 --slotsTo=2026-10-01`, 446 141 Zeilen; der jüngste Slot trägt noch keine Wahrheit
⇒ 15 Ausgabetage), Karte ohne `--refCard` (K16 gilt nur bei gleichen Slots; am 15-Slot-Lauf bestanden). **Das ist ein Zwischenstand, nicht die
vorregistrierte Wiederholung bei ≥ 30 Ausgabetagen** — dieselbe Datenbasis wie oben plus EIN Regentag (30.09.).

**Verdikt: BESSER nach §6l.4** — primär 2 von 4 Tupeln signifikant besser, 0 schlechter; Kontext 2 von 24 besser, 0 schlechter; K11 0/60, K14 0/12.

| Modus | Brier | CRPS | MAE (berichtet) | Brier DE | Brier AT | Brier CH |
|---|---|---|---|---|---|---|
| S (Punkt = Station) | **+9,8 %*** (p 0,021) | +8,3 % (p 0,118) | +6,7 % | **+15,0 %*** (p 0,030) | +0,8 % | +7,6 % |
| L (ohne Station) | **+11,8 %*** (p 0,022) | +9,4 % (p 0,125) | +7,1 % | **+17,7 %*** (p 0,032) | +0,7 % | +7,0 % |

Kontext: 0–6 h Brier S **+2,7 %***, L **+3,1 %***; alle anderen Bins und 3–6 h exakt 0,0 % (K14). Absolut in den Radarstunden (9 135 Zeilen je Modus,
Basisrate 3,6 %): S all BSS 0,384 → **0,444**, POD 0,50 → **0,59**, FAR 0,39 → 0,37, Treffer/Fehlalarm/verpasst 165/107/163 → 195/114/133;
**DE S POD 0,33 → 0,52, FAR 0,50 → 0,42** (51/50/102 → 79/58/74); L DE POD 0,20 → 0,42; AT 0,67 → 0,68 (INCA 4 Frames/h ⇒ Einzelframe);
MOSMIX-Punktwert und Live-Pfad bleiben bei BSS −0,5. Reliability: 10–20 % von 25,4 → 9,4 % beobachtet (zu trocken behoben), 40–60 % zu nass
(46 → 31 %, 55 → 36 %) — derselbe Kalibrierrest wie am Mittag.

**Lesart:** der eine Regentag mehr hebt das zweite Brier-Tupel von p 0,055 auf 0,021; das Verdikt kippt damit von GLEICHSTAND auf BESSER. Die
Richtung ist seit heute Mittag unverändert (nirgends schlechter, alle Kontrollen grün), die Effektgröße bleibt mit 7 Regentagen unscharf (+9…+12 %
Brier, DE +15…+18 %). Mit E-AX-16 (§6m) ist der Kandidat jetzt **deploybar**: das Einschalten in die Stufe fs ist **E-AX-17 (Jan)** — jetzt oder nach der
Wiederholung ≈ 15.10. Ohne Entscheidung bleibt die Option aus.
