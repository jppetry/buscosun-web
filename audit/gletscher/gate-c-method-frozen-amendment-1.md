# Nachtrag 1 zur eingefrorenen Methode der Eichung (11.10.2026, nach einem Entwicklungslauf, vor dem Lauf der Gate-C-Prüfung)

Ein Entwicklungslauf der Eichung (Python, Schnellmodus: zwei Starts weniger, 25 statt 60 Schritte; nur der Gesamtfit, keine Hold-outs ausgewertet) zeigte zwei Dinge, die vor dem eigentlichen Lauf korrigiert werden:

1. **Fehler (Einheit):** die Grenzen des Gradtagfaktors der Basislinie BL-C waren in der falschen Einheit gesetzt ([0,0005; 0,02] mm h⁻¹ K⁻¹ = 0,01–0,5 mm d⁻¹ K⁻¹); der Fit lag an der Obergrenze. Literatur (Hock 2003): 2,5–11,6 mm d⁻¹ K⁻¹ = 0,10–0,48 mm h⁻¹ K⁻¹. **Neu: [0,02; 0,5].**
2. **Grenze des Temperaturfaktors:** TF lag mit 0,06 an der Obergrenze von `gate-c-method-frozen.md`. Die Literaturspanne stündlicher TF-Werte reicht bis 0,11 (Gabbi et al. 2012: 0,01–0,11 mm h⁻¹ K⁻¹). **Neu: TF ∈ [0,002; 0,12].**
   Das ist keine Anpassung an die Hold-out-Zahlen (sie wurden nicht angesehen), aber eine, die ich nach dem Blick auf den Gesamtfit vornehme — sie wird hier so benannt.

Unverändert: Wahrheit, Eingaben, Stationsregel, Modell (alle festen Konstanten), Reihenfolge der Eichung, Fall-Gruppen, Kennzahlen, Schwellen. **Umsetzung:** die Eichung läuft in Node mit derselben Funktion `simulate()` (`scripts/glacier/lib/meltcore.mjs`), die auch der Schmelzlauf benutzt
(`scripts/glacier/gate-c.mjs`); der Python-Aufbau (`gate_c.py`) bleibt als unabhängige Gegenrechnung: auf einem echten Gletscherjahr (Rhone 2024, Eingaben Grimsel) stimmen beide auf 1e-12 überein (`verify:glacier-melt`).
Die Warmstarts der Hold-out-Fits (ein Simplex ab den Parametern des Gesamtfits) sind ein Rechenaufwand-Mittel; das Ergebnis eines Folds hängt von der Fit-Menge ab, nicht vom Start.
