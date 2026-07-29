# Gewitterpotenzial-Layer (F1) — Screenshots

Aufgenommen 2026-07-24, ICON-D2-Lauf `2026072406`. MCP-Emulation, Dev :5193, nur „Gewitter" aktiv.

## Wichtiger Befund (User-Rückmeldung „Karte bleibt dunkel")

Der **24.07. ist eine extrem schwache Konvektionslage über DACH**: über ALLE Frames (0–12 h) erreichen nur **0,03 %** aller DACH-Zellen überhaupt Score 8 (Untergrenze „gering"); max. Score = 19; Zellen ≥14 = 0 %. **99,97 % der Fläche liegen den ganzen Tag unter der Gewitter-Schwelle** → die Karte bleibt **korrekt** dunkel (keine Gewitterlage wird bewusst nicht eingefärbt). Der Layer lädt und rendert sauber (`hasData`, `visible`), es ist **kein Fehler**.

## Kalibrierungs-Fix (durch diese Rückmeldung ausgelöst)

Der ursprüngliche `visRange {0.08, 0.14}` machte Score 8 (Anfang „gering") zu **0 % deckend** und zeigte erst ab Score 14 — das untere „gering"-Band war unsichtbar, der Layer wirkte an schwachen Tagen „aus". Neu: **`visRange {0.05, 0.09}`** → „gering" (Score ≥ 8) ist ~84 % deckend sichtbar, „keine" (< 5) transparent. Ändert die heutige (leere) Ansicht nicht, macht den Layer aber an marginalen Lagen korrekt sichtbar (Spec §3).

| Datei | Inhalt |
|---|---|
| `step10-nachmittag-default.png` | Reale Ansicht (Nachmittags-Frame, Höchstpotenzial des Tages). Über DE fast leer — **korrekt**, weil das Potenzial heute unter der „gering"-Schwelle liegt. |
| `verify-A-echte-zelle-swfrankreich.png` | **Verifikation mit ECHTEN Daten.** Der heutige ICON-D2-Lauf hat seine stärkste Zelle (Score 42 = „erhöht") in SW-Frankreich (bei Agen), außerhalb der DACH-Maske. Karte dorthin geflogen + Länder-Maske temporär ausgeblendet → der Layer färbt die echte Modellzelle als sauberen Gelb→Amber→Orange-Verlauf. Belegt: echte Daten → korrekte, abgestufte Farbe. |
| `verify-B-render-testmuster-synthetisch.png` | **Verifikation des Render-Pfads (SYNTHETISCH).** Ein kontrolliertes Score-Feld (5 Gauss-Zellen, Peaks 18/36/55/76/96) wurde in den ECHTEN `ScalarLayer` injiziert (`impl.setData`). Zeigt alle fünf Bänder Gelb→Amber→Orange→Rot→Magenta über DACH und die saubere Clipping an der Länder-Maske. Kein echtes Wetter — reiner Beweis, dass Rampe + `visRange {0.05,0.09}` + WebGL-Layer die volle Skala korrekt darstellen. |

**Warum synthetisch für die oberen Bänder?** Der gesamte verfügbare ICON-D2-Lauf (DWD hält nur ~24–48 h) ist über ganz Mittel-/Westeuropa ruhig: domänenweiter Max = 42, **null** Zellen ≥45, null ≥60. Eine echte Rot/Magenta-Lage (Score 60–100) gibt es aktuell nirgends zu laden → Band A (echt, bis „erhöht") + Band B (synthetisch, volle Skala) zusammen decken die Verifikation ab. Die Fusionsmathematik selbst ist unabhängig via `scripts/verify-thunder.mjs` (13/13) belegt.

Hinweis: Ein früheres „Vollfeld-Diagnose"-Bild (erzwungenes `visRange {0,0}`) wurde entfernt — es färbte auch die „keine"-Zellen (Score 1–7) gelb ein und war damit irreführend („so soll es NICHT aussehen").
