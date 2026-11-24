# GM-5 — eingefrorene Messregel (Verteilung aus Sentinel-2, Szenarien und Spannen)

Eingefroren am 23.11.2026 vor dem ersten gewerteten Lauf. Bis dahin waren nur Daten geladen und gezählt (`gm5-inventory.mjs` → `gm5-inventory.json`; Überschneidung GLAMOS ↔ Saisonzeilen gezählt: 24 Gletscher mit einem Muster aus einem anderen Jahr). Code-Stand jeder Messung: `dc982141` (Export nach `C:\dev\buscosun-glacier-cache\gm5\code`). Daten: Saisonzeilen aus `C:\dev\buscosun-glacier-cache\gm4\live\season` (Daten-Repo `c0f4686f`), Katalog und Hypsometrie aus dem Build `20261120-1` (`gs\view`), Wahrheit `C:\dev\buscosun-glacier-cache\gm3\truth\gy.json` (GLAMOS/WGMS je 100-m-Stufe, Format von GM-3). Verdikte rechnet das Skript, nicht der Autor.

## A — Verteilung aus der Reihenfolge des Ausaperns

### A.1 Saisonzeilen eines Gletschers und Jahres

- Zeilen vom 1.5. bis 30.9.; Zeilen mit der Marke `neuschnee` (Bit 1) fallen weg.
- Wirksame Schneegrenze der Zeile: Zustand 0 (schneebedeckt) ⇒ −∞; Zustand 2 (schneefrei) ⇒ +∞; Zustand 1 mit `sla` ⇒ `sla`; Zustand 1 ohne `sla` (Klasse B) ⇒ Zeile fällt weg.
- Eine Saison ist brauchbar ab 4 Zeilen.

### A.2 Tag des Ausaperns einer Höhe z

Zeilen nach Datum r₁ … rₙ. i* = kleinster Index mit Grenze(rᵢ) > z und (i = n oder Grenze(rᵢ₊₁) > z). Kein i* ⇒ nicht ausgeapert (kein Wert). i* = 1 ⇒ schon vor der ersten Zeile ausgeapert (kein Wert). Sonst D(z) = Mittel der Tage des Jahres von r_{i*−1} und r_{i*}.

### A.3 Muster einer Saison

Höhen mit D: mindestens 3, Spanne mindestens 150 m. Gerade D = α + β·z (kleinste Quadrate, ungewichtet) über diese Höhen; Rest r(z) = D(z) − α − β·z in Tagen; Höhen ohne D tragen keinen Rest. Ausgewertet an den Mitten der 50-m-Bänder der Hypsometrie (A2) bzw. an den Mitten der 100-m-Stufen der Wahrheit (A3).

### A.4 Frage A2 — Reihenfolge und Stabilität

- **A2-Reihenfolge:** Anteil der brauchbaren Saisons (50-m-Bänder), in denen D über der Höhe nie fällt; Spearman-ρ von D zwischen zwei Saisons desselben Gletschers (gemeinsame Bänder ≥ 4), Median. Urteil „Reihenfolge = Höhe“, wenn der Anteil 100 % ist und der Median ≥ 0,99.
- **A2-Stabilität des Rests:** Rest r je Saison auf zehn Punkte der normierten Höhe u = (z − z_Zunge)/(z_Oberkante − z_Zunge) ∈ {0,05; 0,15; …; 0,95} gelegt (linear zwischen Bändern mit Rest, nur innerhalb ihres Bereichs). Gleiche Gletscher: jedes Paar von Saisons eines Gletschers (gemeinsame Punkte ≥ 4), Spearman-ρ, Median ρ_gleich. Kontrolle: dieselben Jahrespaare, aber Saison y₁ von Gletscher i gegen Saison y₂ von Gletscher j (alle i ≠ j mit beiden Saisons, je Jahrespaar), Median ρ_fremd. Urteil: „stabil“ bei ρ_gleich ≥ 0,5 und ρ_gleich − ρ_fremd ≥ 0,2; „schwach“ bei ρ_gleich − ρ_fremd ≥ 0,1; sonst „nicht stabil“.

### A.5 Frage A3 — gegen die Wahrheit je Höhenstufe

- Gletscherwinter der Wahrheit (alle Jahre 2012–2025, beide Länder) mit Katalogeintrag Klasse A, Stufen mit Fläche > 0 und endlichem `bw`, mindestens 3 Stufen, Flächenmittel `bw̄` > 100 mm.
- Form der Wahrheit: d(b) = bw(b)/bw̄ − 1. Drei Stützen: Mitte der tiefsten Stufe, `zMed` des Winters (in den Bereich geklemmt, d dort linear zwischen Stufenmitten), Mitte der höchsten Stufe. L3(z) = linear zwischen den drei Stützen.
- Muster für Winter Y (hydrologisches Jahr mit Ende im Jahr Y): Mittel der Reste r_y der Stufenmitten über die Saisons y ∈ {2023 … 2026}, **y ≠ Y** (ein Jahr ausgelassen); eine Stufe ohne Rest bekommt 0. Ein Winter zählt nur, wenn mindestens 3 Stufen einen Rest tragen.
- Zuschlag: s̃(b) = s(b) − Σ a·s / Σ a (flächengewichtet mittelwertfrei: **nur Umverteilung, das Mittel des Gletschers bleibt**).
- Varianten:
  - **V0** (die triviale Alternative „linear zwischen drei Höhen“): L3. Die Stützen sind die der Wahrheit selbst — V0 misst nur, was ZWISCHEN den drei Höhen liegt.
  - **V1** Zuschlag aus Sentinel-2: L3 + k·s̃, k aus allen Wintern der ANDEREN Gletscher (Gletscher ausgelassen) per kleinsten Quadraten durch den Ursprung, flächengewichtet, auf (d − L3) gegen s̃.
  - **V2** Negativkontrolle: wie V1 mit dem k von V1, aber das Muster des nächsten Gletschers der nach Kennung geordneten Liste (zyklisch), auf die normierte Höhe des Empfängers gelegt.
  - **V3** Referenz (nutzt die Wahrheit selbst): L3 + mittelwertfreies Mittel von (d − L3) desselben Gletschers über seine ANDEREN Winter (mindestens 3), k = 1 — was ein beständiges Muster je Stufe höchstens bringt.
  - Zum Einordnen: **C0** flach (d = 0), **C1** linear zwischen Zunge und Oberkante.
- Fehler eines Gletscherwinters: E = bw̄ · √(Σ a·(Vorhersage − d)² / Σ a) in mm. Kennzahl: Mittel über die Gletscherwinter. Gewinn = 1 − Ē(V)/Ē(V0).
- Unsicherheit: 1 000 Ziehungen der Gletscher mit Zurücklegen (Zufallszahl fest, Startwert 42), Gewinn von V1 je Ziehung, p10 und p90.
- **Urteil A3:** „trägt“, wenn Gewinn(V1) ≥ 5 %, p10 des Gewinns > 0, Gewinn(V2) < Gewinn(V1)/2 und das gemeinsame k (alle Gletscher) > 0. Sonst „trägt nicht“, mit dem Grund. Daneben, ohne Urteil: dasselbe nur für Y ∈ {2023, 2024, 2025}, und je Land.
- Sondierungen (Q18) liegen lokal nicht vor; A3 misst nur gegen die Stufenwerte (Q17/Q19). Das wird so berichtet.

## B — Szenarien und Spannen

### B.1 Lauf

`melt.mjs` der Kopie `dc982141`, Arbeitsverzeichnis die Kopie, `--data=<Ansicht unter gm5>` (Ansicht = `gs\view\glacier\v1` als Verweise, dazu eigene Kopien von `melt/state.json` und dem Startzustand `gm3c-snowpack\seed-1121\snowpack\state.json`), `--cube=C:\dev\buscosun-glacier-cache\gs\cube`, `--out`/`--patch` unter `gm5\`, `--now=2026-11-21T17:50:00Z --always --snowpack=shadow`. Ein Lade-Haken (nur im Prozess der Messung, keine Datei der Kopie geändert) zeichnet die Eingänge von `driveOf`, `snowpackOfGlacier` und `weatherOfGlacier` auf und reicht sie unverändert durch. Kein Abruf außer dem, was der Producer selbst tut (lokaler Cube).

### B.2 Szenario s eines Gletschers

Startwert je Gletscher: FNV-1a von `<lauf>|<id>|gm5`. Wie die Regel des Wetterteils (`sumSpreads`):
- ein Pfad zP und ein Pfad zT, je AR(1) mit ρ = 0,9 je Stunde, unabhängig;
- Niederschlag der Stunde = Quantil der Verteilung der Antwort (des Antriebs-Eigners) bei Φ(zP), zwischen zwei Verteilungen linear, ohne Verteilung im Abstand ≤ 6 h der Erwartungswert;
- Temperatur je Höhe = Erwartung + σ_T·zT (σ_T der eigenen Antwort je Höhe, sonst die der Medianhöhe);
- Schneeanteil: mit Kontext der drei Antworten `shareAtElevation` auf den um σ_T·zT verschobenen Temperaturen, dann „unten nie mehr als oben“; ohne Kontext `solidFraction`;
- **systematisch, fest je Szenario:** Faktor F_s = F · exp(σ_F·ζ_F) und Neuschneedichte ρ_s = 96 · exp(σ_ρ·ζ_ρ), ζ ~ N(0, 1).
- σ_F = (ln p90 − ln p10)/(2 · 1,2816) der Verhältnisse „Faktor des Gletschers / Faktor des Landes“ aus GM-3 N1-a (`gm3\report-A-explore.json`, `perGlacier.factors`).
- σ_ρ = dasselbe aus den Medianen der Messfelder mit mindestens 20 Ereignissen (`gm3\report-B.json`, `data.perSite`). Daneben berichtet: die Spanne je Ereignis (65–148).
- Jedes Szenario läuft mit `snowpackOfGlacier` der Kopie (Drive aus `driveOf` mit F_s, Konstanten mit ρ_s) vom selben Zustand der Laufstunde. Spannen: p10 und p90 der Szenarien je Größe (Schneehöhe und Wasserwert am Tagesende, Neuschnee je Tag) — die Spanne einer Summe ist die der Szenario-Summen.

### B.3 Kosten

Im selben Prozess nach dem Lauf, in dieser Reihenfolge: Erwartungswert E (ein Aufruf je Gletscher), K = 10, 20, 40 (alle Gletscher), E noch einmal (Drift). Zeit je Schritt mit `performance.now()`. Größe: das Dokument des Laufs und dasselbe mit p10/p90 je Höhe für `hsd` und `hnd` (14 Tage), roh und gzip.

### B.4 Wie viele Szenarien

Teilmenge jeder zehnte Gletscher der Aufzeichnung; Referenz K = 100. Je K ∈ {10, 20, 40}: Median über die Gletscher von |Breite(K) − Breite(100)| / Breite(100) der Spanne p10–p90 der Schneehöhe in der Medianhöhe am Ende von Tag 14 (Breite(100) ≥ 1 cm). Urteil: kleinstes K mit ≤ 10 %.

### B.5 Zerlegung (Teilmenge, K = 40)

Nur zufällig (Niederschlag und Temperatur, F und ρ fest) gegen nur systematisch (F und ρ gezogen, Niederschlag und Temperatur = Erwartung): Median der Breite der Schneehöhe in der Medianhöhe an Tag 1, 7, 14.

### B.6 V-GM-41

Tage 8–14 an der Medianhöhe, alle Gletscher, K = 40: Anteil der Tage mit erwartetem Neuschnee ≥ 0,5 cm; Anteil mit p10 ≥ 0,5 cm; mit Median ≥ 0,5 cm; mit p90 ≥ 0,5 cm. Kein Urteil, nur die Zahlen.

### B.7 „Jetzt“

Der Zustand trägt keine Vorhersage-Spanne. Die Spanne „jetzt“ ist eine **Schätzung**, nicht gerechnet: Wasserwert und Schneehöhe multiplikativ mit exp(±1,2816·σ_F) (der Faktor wirkt seit dem 1.10. auf den Zuwachs; die Schmelze seither ist klein), Neuschnee-Fenster zusätzlich mit σ_ρ. Auf die Zeilen des Laufs angewandt, Median der Breite.

### B.8 Nicht Teil der Messung

Kein Lauf auf dem Runner, keine Prüfung der Spanne an Stationen (die Schattenpaare von GM-4 gibt es noch nicht), keine Sondierungen (Q18).
