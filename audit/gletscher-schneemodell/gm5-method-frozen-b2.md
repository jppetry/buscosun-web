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
