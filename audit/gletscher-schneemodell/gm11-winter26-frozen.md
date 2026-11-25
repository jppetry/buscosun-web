# GM-11 Schritt 1.4 — der ungesehene Winter 2025/26: eingefrorene Regel

Eingefroren am 25.11.2026 vor dem Lauf; sha256 in `gm11-winter26-frozen.sha256`. Kein Faktor, keine Form und keine Regel wird neu angepasst.

## Was gerechnet wird

- **Wahrheit:** GLAMOS, Swiss Glacier Mass Balance, Release 2026 (doi:10.18750/massbalance.2026.r2026; Nutzung von GLAMOS am 25.11.2026
  bestätigt), Datei `massbalance_fixdate_elevationbins_2026_r2026.csv`, gelesen mit `snowcal-truth.mjs` unverändert (Regeln von GM-3:
  Stufen mit Winterbilanz, Winterdauer 150–270 Tage). Gewertet: jeder **Schweizer Gletscherwinter des hydrologischen Jahres 2026**
  (1.10.2025 … Ende der Winterbeobachtung 2026).
- **Antrieb wie in der Eichung:** Stationsregel von GM-3 (`STATION_RULE`: nächste SwissMetNet-Station bis 30 km, |Δh| ≤ 1 800 m, ≥ 90 % der
  Stunden), Temperatur `tre200h0`, Globalstrahlung `gre000h0` (`snowcal-radiation.mjs`), Niederschlag RhiresD an der nächsten 1-km-Zelle
  (`py/snowcal_grid.py`; für Januar–Mai 2026 die Monatsdateien „last“ der Sammlung `ch.meteoschweiz.ogd-surface-derived-grid`), Schmelze des
  Betriebs (`eti`, TF/SRF aus `melt-calibration.json`), Kern `scoreOf` von `snowcal-fit2.mjs`. Ein Winter mit mehr Lücken als in GM-3
  (`CAL.gapT`, `CAL.gapP`) wird nicht gewertet und genannt.
- **Grundlagen, Tabellen wie sie stehen:**
  - **Landeswert:** F = Landesfaktor der Schweiz aus `snow-calibration.json` (der Faktor des Betriebs), ohne Form.
  - **Eigener Faktor:** F aus `snow-calibration-glaciers.json` (Gletscher mit Zeile, nicht `atBound`), ohne Form.
  - **Eigener Faktor + Form:** dazu die Form je Stufe der Zeile (`shapeCorrOf`, wie der Producer sie anlegt).
  - **Vorhergesagt:** Form C der Tabelle `snow-factor-predicted-ch.json` (Modell, Kappung an der Eichspanne der eigenen Faktoren) mit den
    Prädiktoren des Builds (x1, Medianhöhe, Exposition) — für jeden gewerteten Gletscher mit x1, auch wenn er eine eigene Zeile hat.
  - **Vorhergesagt, geschrumpft:** derselbe Wert halb zum Landeswert, ln F = ½ ln F_C + ½ ln F_Land (Regel E-GM-44).
  - Dazu informativ „wie gebaut“: der Faktor, den die Tabelle dem Gletscher gibt (Grundlage `own`/`predicted`/`predicted-shrunk`/`country`).
- **Fehlermaß:** je Gletscherwinter `s2` = |Σ_b w_b · e_b| (gletscherweite Winterbilanz, mm w. e.), dazu `s3` (mit Vorzeichen) und `s1`
  (je Stufe) zum Einordnen.

## Gegenprobe vor der Wertung

Derselbe Werkzeugweg auf dem Winter 2025 (Release 2025, gleiche Gletscher) mit dem neu gebauten Antriebsspeicher gegen den Speicher von GM-3
(`gm3`): `s2` mit dem eigenen Faktor muss je Gletscherwinter bis auf 0,1 mm gleich sein. Sonst wird nicht gewertet und der Unterschied genannt.

## Wann „die Regeln halten“

Je Grundlage b: Referenz R_b = die Fehler `s2` derselben Grundlage, als ein Winter (Landeswert, eigener Faktor, eigener Faktor + Form:
`perWinter` von `report-fit2.json`, V0/V1/V2, Schweizer Zeilen, Winter ausgelassen) bzw. ein Gletscher ausgelassen wurde (Vorhergesagt und
geschrumpft: Faktor `FC` je Eichgletscher aus dem GM-10b-Bericht `table-src-report.json`, mit demselben Kern an den Wintern 2012–2025
gerechnet). n_b = Zahl der 2026 gewerteten Gletscherwinter dieser Grundlage. 10 000 Ziehungen (Seed 2026) von n_b Werten aus R_b mit
Zurücklegen ergeben die Verteilung des Mittels.

- **Die Regel hält**, wenn das mittlere `s2` von 2026 höchstens am **p90** dieser Verteilung liegt.
- **Die Regel hält nicht**, wenn es darüber liegt.
- Das Urteil rechnet das Skript. Ein Winter ist ein Winter: das Ergebnis wird als eine Ablesung berichtet, nicht als Eichung; es ändert
  keine Tabelle.
