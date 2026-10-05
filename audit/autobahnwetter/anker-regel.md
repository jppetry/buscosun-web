# V-AW-21 — Entscheidungsregel, festgelegt vor der ersten Auswertung

Festgelegt am 04.10.2026 gegen 19:00 UTC, nach einem Probelauf an 12 Stationen (nur Lauffähigkeit, keine Fehlermaße gesehen).

**Frage:** Wird die Streckenprognose besser, wenn buscosun Fusion 8 die gemessene Luft der Glättemeldeanlagen als
Anker bekommt (`CubeObs`, Eingang des Motors — der Motor selbst bleibt unverändert)?

**Läufe:** sechs Ausgabezeiten am 04.10.2026 — 03:10, 06:25, 09:05, 14:10, 16:10, 18:55 UTC. 09:05 und 18:55 sind
echte Schnappschüsse des Daten-Repos; die anderen sind nachgestellt (Zeiger des Cubes auf den damals jüngsten Lauf,
Messung aus dem 24-h-Ring bzw. der Obs-Datei). Wahrheit: die spätere Luftmessung derselben Station. Vergleich
immer gepaart gegen „ohne Anker" (N) im selben Lauf, an derselben Station.

**Varianten:** S1 eigene Messung, nur Temperatur · S6 eigene + bis zu 5 Nachbarn · L nur Nachbarn (≤ 6 in 30 km,
Station selbst ausgelassen — steht für Achspunkte zwischen Stationen) · S1w / Lw zusätzlich Wind und Böe.

**Regel**

1. **Stationspunkte (S1) werden eingeschaltet**, wenn die Luft-MAE bei Vorlauf 1, 2 und 3 h je für sich kleiner ist
   als ohne Anker mit p < 0,05 (gepaart je Station über alle Läufe), in keinem einzelnen Lauf bei 1–3 h größer, und
   in keinem Vorlauf-Bin bis 12 h signifikant größer.
2. **S6 statt S1** nur, wenn S6 bei 1–3 h in allen drei Vorläufen die kleinere MAE hat.
3. **Achspunkte (L) werden eingeschaltet**, wenn dieselbe Bedingung wie in 1 für L gilt. Sonst bleiben Achspunkte
   ohne Anker, und das wird benannt.
4. **Wind (S1w / Lw)** nur, wenn die Wind-MAE bei 1–3 h in jedem Lauf mit Wind-Messung kleiner ist und die Böe nicht
   signifikant schlechter. Sonst nur Temperatur.
5. Der Taupunkt wird berichtet, nicht entschieden: der Motor verankert ihn nicht (eine Änderung dort wäre ein Eingriff
   in buscosun Fusion — Jans Gate).

**Grenze der Aussage:** ein Tag, eine Wetterlage (mild, trocken), ≈ 1 200 Stationen. Die Stationen eines Laufs sind
räumlich korreliert, der p-Wert ist deshalb zu optimistisch; die Bedingung „in keinem Lauf schlechter" ist die härtere.
Kein Frost im Zeitraum — der Fall, für den die Seite gebaut ist, ist damit nicht gemessen.
