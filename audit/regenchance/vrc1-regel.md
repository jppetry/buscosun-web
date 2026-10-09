# V-RC-1 — Regel vorab eingefroren (09.10.2026, vor der ersten Rechnung)

Frage: Welche Lesart von „Niederschlag ja/nein in dieser Stunde" trifft die Station besser — die des Felds und der Chance
(**A = 1 − pDry**) oder die des Regenbeginns (**B = exceedance(dist, 0,1 mm/h)**)?

- **Zeilen:** `C:\dev\buscosun-hindcast\score\2026-10-02-f8r-b\rows.jsonl.gz` (stack-extract, Ausgabe-Slots 16.09.–01.10.,
  389 DACH-Stationspunkte, Wahrheit aus allen Slots). Kandidat **F8r** = buscosun Fusion 8 (Fusion 9 ändert nur den Anker von
  T/u/v/Böe, der Niederschlag ist gleich). Beide Modi: **S** (Punkt = Station, `v.precip.S.F8r`) und **L** (ohne Station,
  `v.precip.Lm.F8r`). Nur Zeilen, deren Verteilung `hurdleLogNormal` ist.
- **Ausschnitt:** Stufe **t1** (1-h-Schritte — dort ist der Wert die Stundensumme, dieselbe Einheit wie die Station), Vorlauf
  **1–24 h** (der Bereich des Regenbeginns). Ereignis: Stationsstunde **y ≥ 0,1 mm**.
- **Maß:** Brier je Zeile; Vergleich B gegen A je Tupel als Tagespaar-Test (`PairAcc`: DM nach Harvey/Leybourne/Newbold auf den
  Ausgabetag-Mitteln) + Benjamini-Hochberg über die 4 Tupel.
- **Tupel (primär, 4):** Modus S/L × Vorlauf 1–6 h / 7–24 h.
- **Urteil:**
  - **B BESSER** ⇔ B in ≥ 2 Tupeln signifikant besser (BH p < 0,05) UND A in keinem ⇒ RB behält 0,1 mm/h, die Korrektur gehört
    in eine gemeinsame Nachkalibrierung (nicht zwei Definitionen).
  - sonst (**A besser oder gleichauf**) ⇒ **eine Definition: 1 − pDry**, der Regenbeginn wird umgestellt.
- **Berichtet, zählt nicht:** mittlere Vorhersage gegen Basisrate (Kalibrierung im Großen), Zuverlässigkeit in 10 Klassen, BSS,
  POD/FAR bei p ≥ 0,5, Länderschichten DE/AT/CH. Alles indikativ (15 Ausgabetage, wenige Regentage).
