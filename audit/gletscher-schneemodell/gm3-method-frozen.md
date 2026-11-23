# GM-3 — Eichung des Schneemodells: Methode, eingefroren vor dem ersten gewerteten Lauf

Stand 22.11.2026. Diese Datei wird nach dem Einfrieren nicht mehr geändert; Änderungen kommen als Nachtrag mit eigenem Hash. Der Hash steht in
`gm3-method-frozen.sha256`. Zum Zeitpunkt des Einfrierens sind nur Daten gezählt und geladen (Wahrheit, Antrieb, Stationszuordnung); es gibt noch keinen
Fit, keinen Fehlerwert und keine Dichtezahl aus diesen Daten.

Zwei Eichungen, je mit eigener Auswahlregel: **A** Niederschlag (Höhe des Faktors und Verlauf mit der Höhe), **B** Neuschneedichte. Dazu drei Messungen ohne
Auswahl: **C** Brücke buscosun Fusion ↔ Niederschlagsanalyse, **D** Minderfang der Niederschlagsmesser, **E** Höhenverlauf aus Punktmessungen.

## A. Niederschlag je Region und Höhe

### A.1 Wahrheit

Winterbilanz **je Höhenstufe**, hydrologische Jahre 2012–2025 (`scripts/glacier/snowcal-truth.mjs`):

- Schweiz: GLAMOS, Release 2025, Stichtagssystem (`massbalance_fixdate_elevationbins.csv`), 1.10.–30.4.
- Österreich: WGMS FoG 2026-02-10 (`mass_balance_band`), Zeitraum = `begin_date` … `midseason_date` aus `mass_balance`.
- Verworfen wird ein Gletscherwinter ohne eines der zwei Daten, mit einer Stufe ohne Winterbilanz, mit einer Stufe ohne Fläche (wenn auch kein anderes Jahr
  desselben Gletschers die Fläche dieser Stufe nennt — sonst gilt die Fläche des nächstgelegenen Jahres) oder mit einem Winter unter 150 oder über 270 Tagen.
- Schweizer Gletscher kommen nur aus GLAMOS. Italienische und französische Gletscher bleiben außen vor.
- Stand vor dem Einfrieren: 488 Gletscherwinter, 44 Gletscher (Schweiz 398 / 36, Österreich 90 / 8).

Die Stufenwerte von GLAMOS sind aus Punktmessungen mit einem Verteilungsmodell auf die Fläche gebracht (Huss et al.); sie gelten hier als Wahrheit, die
Gegenprobe mit Punktmessungen ist Messung E.

### A.2 Antrieb

- **Niederschlag, Schweiz:** RhiresD (MeteoSchweiz, Tagesgitter 1 km), nächste Zelle zum Katalogpunkt des Gletschers. Der Tag D reicht von 06 UTC bis 06 UTC
  des Folgetags; die Tagessumme wird gleichmäßig auf diese 24 Stunden verteilt (`set`).
- **Niederschlag, Österreich:** INCA-Analyse stündlich (GeoSphere Austria, Datensatz `inca-v1-1h-1km`, Größe `RR`), nächste Zelle. Die Quellenliste nennt
  `inca-v2-1h-1km`; dieser Datensatz beginnt am 1.10.2026, die vergangenen Winter stehen nur unter der Kennung `v1` desselben Produkts.
- **Temperatur:** stündlich gemessen, nächste Station bis 30 km und höchstens 1 800 m Höhenunterschied zur Medianhöhe mit mindestens 90 % der Winterstunden
  (Regel von Gate C): SwissMetNet `tre200h0`, in Österreich `klima-v2-1h` `tl`. Auf die Stufenhöhe mit −6,5 K/km (`MELT.gamma`). Lücken bis 3 Stunden linear.
- Ein Gletscherwinter ist **nicht nutzbar**, wenn mehr als 15 % der Temperaturstunden oder mehr als 2 % der Niederschlagsstunden fehlen oder keine Station
  die Regel erfüllt. Er wird gezählt und genannt, nicht ersetzt.

### A.3 Modell

Je Gletscherwinter und Höhenstufe `b` (Mittelhöhe `z_b`, Flächenanteil `w_b` aus der Wahrheit), stündlich, mit der Rechnung des Schmelzkerns
(`simulate` in `scripts/glacier/lib/meltcore.mjs`, Modell `ddf`):

- Schneeanteil `fs = clip((2 − T_b) / 2, 0, 1)` (Regel `temperature` des Producers)
- Zuwachs `S = k_b · P · fs` mit `k_b = F · prof(z_b)`
- Schmelze: Gradtag `0,165 mm h⁻¹ K⁻¹` auf Schnee, × 1,6 auf Eis (Basislinie aus Gate C, dort gemessen), nur bei `T_b > 0`; Eisschmelze zählt negativ mit
- Vergleichsgröße: `Σ S − Schmelze` gegen die Winterbilanz der Stufe

Die Eichung rechnet mit einer schnellen Fassung derselben Rekursion; sie muss an echten Gletscherwintern mit `simulate()` auf 1e-6 mm übereinstimmen
(Prüfer), und alle genannten Fehlerwerte werden mit den gefundenen Parametern exakt nachgerechnet, nicht aus einer Tabelle interpoliert.

**Verlauf mit der Höhe** (`zMed` = flächengewichtete Medianhöhe aus den Stufen, `d = z_b − zMed` in Metern, `g` je 100 m):

| Form | `prof` | Parameter |
|---|---|---|
| P1 linear | `max(0,2; 1 + g · d / 100)` | `g` |
| P2 gedeckelt | `max(0,2; 1 + g · min(d, 0) / 100)` — Zunahme nur bis zur Medianhöhe | `g` |
| P3 zwei Steigungen | `max(0,2; 1 + g_u · min(d, 0) / 100 + g_o · max(d, 0) / 100)` | `g_u`, `g_o` |

Grenzen: `F` 0,3 … 5, jede Steigung −0,10 … +0,20 je 100 m.

**Zusammenfassung** für `F` und für die Steigungen getrennt: `G` alle, `C` je Land, `R` je Katalogregion. Eine Region bekommt einen eigenen Wert nur mit
mindestens zwei Gletschern in der Eichmenge; sonst gilt der Wert ihres Landes. Deutschland (keine Wahrheit) bekommt den Wert `G`.

**Ziel:** Summe über alle Gletscherwinter von `Σ_b w_b · (Modell_b − Wahrheit_b)²`; jeder Gletscherwinter zählt gleich.

### A.4 Rückhaltung und Kennzahlen

- **LGO** (ein Gletscher ausgelassen): alle Winter des Gletschers fehlen im Fit. Bleibt seiner Region dadurch weniger als zwei Gletscher, bekommt er den
  Landeswert — wie ein Gletscher ohne Wahrheit im Betrieb.
- **LYO** (ein Winter ausgelassen): alle Gletscher dieses hydrologischen Jahres fehlen im Fit.
- Kennzahlen, je Gletscherwinter gebildet und gemittelt: **s1** Stufenfehler `Σ_b w_b · |e_b|`; **s2** Fehler der Winterbilanz des Gletschers `|Σ_b w_b · e_b|`;
  **s3** Bias `Σ_b w_b · e_b`; **s4** Formfehler `Σ_b w_b · |e_b − Σ_b w_b · e_b|` (Stufenfehler nach Abzug des Gletscherfehlers).

### A.5 Auswahl (in dieser Reihenfolge, entschieden an s1 im LGO)

0. Vergleichswerte, nie Kandidat: **B0** die Konstanten von heute (`F = 1,289`, P1 mit `g = 0,04`); **B1** `F = 1`, kein Verlauf.
1. **Form** bei `F` und Steigung auf `G`: P1 bleibt, wenn keine andere Form im LGO-s1 um mindestens 3 % besser ist. P3 muss die bessere von P1 und P2 um
   mindestens 3 % schlagen.
2. **`F`** von `G` nach `C` nach `R`: ein Schritt gilt nur, wenn er LGO-s1 um mindestens 3 % verbessert.
3. **Steigung** von `G` nach `C` nach `R`: dieselbe Regel.
4. Ein Schritt wird verworfen, wenn LYO-s1 dabei um mehr als 1 % schlechter wird.

Die Tabelle ist der Voll-Fit der gewählten Stellung. Jeder Wert trägt `measured` (eigene Wahrheit) oder `transferred` (Landes- oder Gesamtwert) und die Zahl
der Gletscher und Winter.

### A.6 Urteil

| Nr. | Kriterium | Schwelle |
|---|---|---|
| K-1 | LGO-s1 der gewählten Stellung gegen B0 | mindestens 10 % besser |
| K-2 | LGO-s2 (Winterbilanz des Gletschers) | ≤ 0,35 m w. e. (die Schwelle von C-5) |
| K-3 | \|LGO-s3\| je Land | ≤ 0,10 m w. e. |
| K-4 | LGO-s4 (Form) gegen dieselbe Stellung ohne Verlauf (`g = 0`) | mindestens 10 % besser |

Rot heißt: die Tabelle wird trotzdem geliefert, trägt aber `gate: false` und den Grund; ob sie in den Producer geht, entscheidet Jan.

### A.7 Empfindlichkeit (berichtet, ändert die Auswahl nicht)

- S1: Gradtagfaktor × 0,5 und × 1,5
- S2: Schwelle des Schneeanteils um −1 K und +1 K verschoben
- S3: nur Stufen, deren Schmelze im Modell unter 50 mm bleibt (reiner Zuwachs)
- S4: Temperaturgradient −5,5 K/km statt −6,5 K/km

Für jede: die Parameter des Voll-Fits der gewählten Stellung und LGO-s1.

### A.8 Was die Tabelle ist und was nicht

Der Faktor gilt gegenüber der genannten Niederschlagsanalyse. Der Betrieb speist den Niederschlag von buscosun Fusion ein. Der Faktor für den Betrieb ist
`F × Brücke`; die Brücke wird in GM-3 gemessen (C), aber **nicht angewandt** (`Brücke = 1`, Herkunft `set`), bis mindestens 30 Tage mit Niederschlag vorliegen.

## B. Neuschneedichte

### B.1 Daten

- SLF-Messfelder (`measurement-data.slf.ch/study-plot`, CC BY 4.0): je Tag 06 UTC Neuschneehöhe `HN_1D` (cm) und Wasserwert des Neuschnees `HNW_1D` (mm),
  beides auf demselben Brett gemessen.
- Je Messfeld die nächste SwissMetNet-Station bis 3 km und höchstens 200 m Höhenunterschied; ohne solche Station entfällt das Messfeld. Von ihr stündlich
  Temperatur (`tre200h0`, mit −6,5 K/km auf die Höhe des Messfelds), Wind (`fkl010h0`) und Niederschlag des Messers (`rre150h0`).
- Ereignistage, 1.11.–30.4. der hydrologischen Jahre 2012–2025: `HN_1D ≥ 3 cm`, `HNW_1D ≥ 2 mm`, mindestens 20 der 24 Stunden vor dem Termin mit Temperatur,
  höchste Stundentemperatur ≤ +1 °C, gemessene Dichte `HNW / HN` zwischen 20 und 400 kg/m³ (außerhalb: als Messfehler gezählt und verworfen).

### B.2 Rechnung

Je Ereignistag der Schneekern (`stepPack` aus `scripts/glacier/lib/snowcore.mjs`) auf leerem Brett: 24 Stundenschritte, `HNW / 24` je Stunde (`set`),
Stundentemperatur der Station, am Ende die Dicke des Pakets gegen `HN_1D`.

| Regel | Neuschneedichte | frei |
|---|---|---|
| D0 | 68 kg/m³ (heute) | – |
| D1 | Vionnet et al. 2012 aus Temperatur und Wind, wie im Kern | – |
| D2 | eine Konstante `ρ` | `ρ` 40 … 140, Schritt 1 |
| D3 | `clip(a + b · T; 40; 200)`, `T` = Stundentemperatur in °C | `a` 40 … 160 Schritt 2, `b` 0 … 8 Schritt 0,25 |

Die Setzung des Kerns bleibt in allen vier Regeln dieselbe. Fehlt unter D1 der Wind einer Stunde, entfällt der Ereignistag für D1 und wird gezählt.

### B.3 Auswahl und Urteil

- Kennzahl: mittlerer Betrag des Fehlers der Neuschneehöhe in cm über die Ereignistage, mit jeweils einem Messfeld ausgelassen (LSO); dazu Bias und der Fehler
  in Klassen der gemessenen Neuschneehöhe (3–10, 10–25, über 25 cm).
- D0 bleibt, wenn keine Regel im LSO um mindestens 5 % besser ist. D3 muss D2 um mindestens 5 % schlagen. D1 hat keine freien Werte und tritt mit seinem
  Fehler an allen Tagen mit Wind an.
- Die Spanne p10–p90 der Dichte wird aus den gemessenen Dichten der Ereignistage neu bestimmt (Quantile, keine Normalverteilung) und neben die heutige
  (56–80) gestellt.
- **Übertragung nach Österreich (keine Anpassung):** GeoSphere `klima-v2-1d`, Stationen ab 1 000 m, Tage mit `shneu_manu ≥ 3 cm`, `rr ≥ 2 mm`,
  `tl_mittel ≤ −1 °C` und `vv_mittel ≤ 2 m/s`, Winter 2016–2025; Tagesniederschlag gleichmäßig auf 24 Stunden, Tagesmittel als Temperatur. Berichtet werden
  Bias und mittlerer Fehler von D0 und der gewählten Regel. Der Messer unterschätzt Schnee; die Zahl ist deshalb keine zweite Eichung.

## C. Brücke buscosun Fusion ↔ Niederschlagsanalyse (Messung, nicht angewandt)

Aus den Wetterläufen im Daten-Repo (`glacier/v1/melt/wx/<lauf>`, vier je Tag seit 15.11.2026): je Gletscher mit eigenem Antrieb die Niederschlagssumme
über die Tage, die beide Seiten ganz abdecken, aus den jeweils ersten Stunden jedes Laufs bis zum nächsten Lauf. Dagegen dieselbe Summe aus INCA
(Österreich, stündlich) und aus RprelimD/RhiresD (Schweiz, Tage 06–06 UTC). Berichtet: Verhältnis der Summen je Land (alle Gletscher zusammen), Median und
p10–p90 der Verhältnisse je Gletscher mit mindestens 5 mm auf einer der zwei Seiten, Zahl der Tage. Kein Wert geht in die Tabelle.

## D. Minderfang der Messer (Messung)

An den Paaren Messfeld–Station aus B: Summe `rre150h0` der 24 Stunden vor dem Termin geteilt durch Summe `HNW_1D`, über alle Ereignistage aus B.1, in
Windklassen (unter 2, 2–4, über 4 m/s Mittel der 24 Stunden). Berichtet, nicht angewandt.

## E. Höhenverlauf aus Punktmessungen (Gegenprobe zu A)

WGMS `mass_balance_point`, Winterpunkte (`balance_code = winter`) der Gletscher aus A, 2012–2025: je Gletscherwinter mit mindestens 8 Punkten über
mindestens 200 m Höhenspanne eine Gerade Winterbilanz gegen Höhe; relative Steigung = Steigung / Mittel der Punkte, je 100 m. Berichtet: Median und p10–p90
je Land und über alle. Die Gegenprobe gilt als bestanden, wenn der Median der Punktsteigungen im selben Vorzeichen und innerhalb des Faktors 2 der
Steigung unter der Medianhöhe aus A liegt; sonst steht der Widerspruch im Bericht.

## Reihenfolge und Werkzeuge

1. `snowcal-truth.mjs`, `snowcal-forcing.mjs`, `py/snowcal_grid.py` (vor dem Einfrieren gelaufen: nur Daten)
2. diese Datei hashen
3. `snowcal-fit.mjs` (A, E), `snowcal-density.mjs` (B, D), `snowcal-bridge.mjs` (C)
4. Tabellen `scripts/glacier/snow-calibration.json`, Bericht `audit/gletscher-schneemodell/gm3-report.json`, Prüfer `verify:glacier-snowcal`

Kein Wert aus dieser Eichung geht in GM-3 in den Producer; das ist ein eigener Schritt mit eigenem Schalter.
