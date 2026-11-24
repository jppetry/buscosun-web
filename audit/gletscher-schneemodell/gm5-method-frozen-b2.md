# GM-5 — Nachtrag zur eingefrorenen Messregel, Teil B (Wiederholung der Kostenmessung, E-GM-32 A)

Eingefroren am 24.11.2026 vor dem ersten gewerteten Lauf des Werkzeugs `gm5-cost.mjs`. Die Regel `gm5-method-frozen.md` (sha256 `a9964eb9…`) bleibt unverändert und gilt weiter; dieser Nachtrag ändert nur, WIE §B.3–§B.6 gerechnet werden, und fügt zwei Größen hinzu. Anlass: der erste Messprozess hielt die Eingänge aller Gletscher im Speicher und wurde vom System gestoppt (V-GM-77). Jans Wort zur Wiederholung: 24.11. („wir machen es so“, E-GM-32 A).

## N.1 Rechnen und verwerfen

Die Szenarien eines Gletschers werden in dem Augenblick gerechnet, in dem der Producer der Kopie `dc982141` seinen Schneedecken-Schritt für diesen Gletscher aufruft (derselbe Lade-Haken, `gm5-hook-*.mjs`, unverändert); behalten werden je Gletscher nur Quantile und Zeiten. Lauf wie §B.1, Ausgabe unter `gm5\out-cost` und `gm5\patch-cost`.

## N.2 Reihenfolge der Kostenmessung (ersetzt die Reihenfolge in §B.3)

Je Gletscher, in dieser Reihenfolge: Erwartungswert E, EIN Durchgang mit 40 Szenarien (Startwert wie §B.2), Erwartungswert E noch einmal. Die Spanne für K = 10 und K = 20 sind die Quantile der ersten 10 bzw. 20 Szenarien dieses Durchgangs — dieselben Zahlen wie in getrennten Durchgängen, weil der Startwert je Gletscher derselbe ist. Zeit für K = Summe der Szenario-Zeiten bis zum K-ten Szenario plus die Zeit der Quantile für K. Zeiten nur innerhalb dieses Laufs vergleichen: Kennzahl ist das **Verhältnis** Zeit(K) / Zeit(E), dazu die Sekunden dieser Maschine.

## N.3 Teilmenge (§B.4, §B.5 unverändert im Inhalt)

Jeder zehnte Gletscher in der Reihenfolge des Laufs: Referenz K = 100 (Startwert-Zusatz `gm5ref`), „nur zufällig“ und „nur systematisch“ mit K = 40. Urteil kleinstes K wie §B.4.

## N.4 Zusätzliche Größen (neu, vor dem Lauf festgelegt)

- **Summe Tage 8–14 (E-GM-34 A):** je Szenario die Summe des Neuschnees der Tage 8–14 in der Medianhöhe; je Gletscher p10 / Median / p90 dieser Summen (K = 40) neben der Summe der Erwartungswerte. Berichtet: Median über die Gletscher, und der Anteil der Gletscher mit p10 ≥ 0,5 cm. Kein Urteil.
- **Speicher:** `rss` des Prozesses beim ersten Gletscher, alle 100 Gletscher und am Ende, dazu der Höchstwert des Betriebssystems (`maxRSS`). Er gilt für Producer UND Messung zusammen; ein Wert nur für den Szenario-Schritt wird nicht behauptet.
- **Gegenprobe des Nachrechnens:** der Erwartungswert-Schritt des Werkzeugs gegen die Zeile, die der Producer im selben Lauf schreibt (`hsd`, `hnd` in der Medianhöhe): Zahl der Gletscher mit Abweichung und die größte Abweichung. Weicht mehr als 1 % der Gletscher um mehr als 0,1 cm ab, gilt die Messung als nicht bestanden und wird so berichtet.

## N.5 Zwischenstände

Alle 200 Gletscher schreibt das Werkzeug die bisherigen Zeiten nach `gm5\cost-partial.json`. Wird der Prozess wieder gestoppt, wird der Zwischenstand als Zwischenstand berichtet (Zahl der Gletscher dabei), nicht als Messung.

## N.6 Probelauf

Vor dem gewerteten Lauf ist ein Probelauf mit `limit` oder `only` (höchstens 60 Gletscher) erlaubt, nur um Fehler des Werkzeugs zu finden; seine Zahlen werden nicht berichtet und ändern diesen Nachtrag nicht.

## N.7 Nachtrag nach dem abgebrochenen ersten Lauf (24.11. 05:36 UTC, vor dem zweiten gewerteten Lauf festgelegt)

Der erste gewertete Lauf (Start 05:23 UTC) wurde vom Autor bei 600 von 2 084 Gletschern gestoppt: der Prozess war von 1 065 MB (400 Gletscher) auf 2 387 MB (600 Gletscher) gewachsen, die Maschine hatte 3 GB frei. Gesehen waren dabei nur der Zwischenstand der Zeiten (Verhältnis K = 40 zu E: 20,2 bei 600 Gletschern; `gm5\cost-partial-run1-aborted.json`) und der Speicher — keine Spanne, kein Urteil. Dieser Zwischenstand wird als Zwischenstand berichtet (N.5).

Zweiter Lauf, sonst unverändert: Start mit `--max-old-space-size=1700 --expose-gc`. Die Grenze ändert keine gerechnete Zahl (alle Größen sind durch den Startwert je Gletscher bestimmt), nur wann der Prozess aufräumt; sie ist vom Autor gesetzt, nicht am Runner gemessen. Bei jedem Zwischenstand (alle 200 Gletscher, außerhalb jeder gemessenen Zeit) räumt der Prozess vollständig auf und schreibt, was er danach hält (`heapUsed`, `external`, `rss`) — berichtet als Verlauf über die Gletscher, für Producer und Messung zusammen. Bricht der Prozess an der Grenze ab, ist das der Befund.

## N.8 Nachtrag nach dem zweiten Lauf (24.11. 05:55 UTC, vor dem dritten festgelegt)

Der zweite Lauf (Start 05:36 UTC, Grenze 1 700 MB) endete nach rund 16 Minuten mit „JavaScript heap out of memory“ kurz nach 800 von 2 084 Gletschern. Zwischenstand bei 800 (`gm5\cost-partial-run2-oom.json`): nach vollständigem Aufräumen hält der Prozess 1 456 MB (rund 1,8 MB je Gletscher mit eigenem Antrieb); Verhältnis K = 40 zu E: 18,8. Gesehen sind wieder nur Zeiten und Speicher. Der Producer hält die Antworten aller Gletscher mit eigenem Antrieb selbst fest (`forcings` in `melt.mjs`, gelesen nach dem Abbruch); ob die 1,8 MB je Gletscher ihm gehören oder der Messung, ist damit offen.

Deshalb zwei Läufe, in dieser Reihenfolge, beide mit `--max-old-space-size=3072 --expose-gc`:
1. **Vergleichslauf** `--baseline`: derselbe Producer, derselbe Haken, dieselben Zwischenstände — aber kein Szenario wird gerechnet. Er sagt, was der Producer allein hält und wie hoch sein Speicher steigt (`gm5-cost-baseline.json`).
2. **Dritter gewerteter Lauf** wie N.7 mit der höheren Grenze.

Speicher des Szenario-Schritts = Differenz der beiden Verläufe an denselben Zwischenständen (gehalten nach dem Aufräumen) und der Höchstwerte. Die Grenze 3 072 MB ist vom Autor gesetzt; ob der Runner sie hat, ist nicht gemessen.
