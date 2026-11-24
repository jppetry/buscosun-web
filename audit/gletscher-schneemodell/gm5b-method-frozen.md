# GM-5b — Eichrunde 2: Methode, eingefroren vor dem ersten gewerteten Lauf

Stand 24.11.2026. Diese Datei wird nach dem Einfrieren nicht mehr geändert; Änderungen kommen als Nachtrag mit eigenem Hash (`gm5b-method-frozen.sha256`). Zum Zeitpunkt des Einfrierens sind nur Daten geladen und gezählt: die Strahlung der 26 Temperaturstationen (`snowcal-radiation.mjs` → `gm3\rad-*.json`, `radiation.json`: fehlt in mehr als 2 % der Stunden an 50 von 488 Gletscherwintern, in mehr als 15 % an 26, in mehr als 50 % an 14). Es gibt noch keinen Fit und keinen Fehlerwert mit der Schmelze des Betriebs. Bekannt aus der ersten Runde und aus GM-5 A3 (und deshalb keine Vorhersage dieser Runde): N1-a (Faktor je Gletscher, Gradtag-Schmelze, ohne Schrumpfung: Winterbilanz 227 statt 399 mm), N1-c (weniger Winterschmelze trifft besser), V3 (beständige Form: 21 % weniger Formfehler auf `bw/bw̄`). Urteile rechnet das Werkzeug (`scripts/glacier/snowcal-fit2.mjs`), nicht der Autor.

Jans Entscheidungen (24.11.): E-GM-9 Faktor je Gletscher ja; E-GM-10 Winterschmelze wie im Betrieb, nicht mit-eichen; E-GM-11 `inca-v1-1h-1km` bestätigt; E-GM-31 Verteilung je Band aus den Stufenwerten in derselben Runde.

## 1. Wahrheit und Antrieb

- Wahrheit, Temperatur, Niederschlag und die Regel „nutzbar“ **wie in der ersten Runde** (`gm3-method-frozen.md` A.1, A.2; `loadWinters` aus `snowcal-fit.mjs`, unverändert): Winterbilanz je Höhenstufe 2012–2025, Stationstemperatur mit −6,5 K/km, RhiresD täglich (gleichmäßig auf 24 h) bzw. INCA stündlich.
- **Strahlung (neu):** stündlich gemessen an derselben Station wie die Temperatur — SwissMetNet `gre000h0`, in Österreich `klima-v2-1h` `cglo` (W m⁻²; negative Nachtwerte = 0, Werte über 1 400 verworfen). Auf den Gletscher mit dem Höhenzuschlag des Klarhimmels des Betriebs: `G = G_Station · (1 + 6·10⁻⁵ · zMed) / (1 + 6·10⁻⁵ · z_Station)`. Eine Stunde ohne Messung bekommt die Regel des Betriebs für unbekannte Bewölkung: `clearSky(cosZenith(Breite, Länge, Stundenmitte), zMed) · 0,55`. Kein Winter fällt wegen fehlender Strahlung aus der Wertung; der Anteil solcher Stunden wird je Winter gezählt und in §6 als Empfindlichkeit geprüft.

## 2. Modell

Je Gletscherwinter EIN Aufruf des Schmelzkerns des Betriebs je Multiplikator `k` (`simulate` in `scripts/glacier/lib/meltcore.mjs`, `model: 'eti'`): Bänder = die Höhenstufen der Wahrheit (Mittelhöhe, Flächenanteil), `zT` = Stationshöhe, `zP` beliebig mit `pGrad = 0`, `pf = k`, `TF` und `SRF` aus `scripts/glacier/melt-calibration.json` (0,12 und 0,005455 — die Zahlen des Betriebs, nicht mit-geeicht), `ela = zMed` des Winters, Start ohne Schnee (`emptyState`), Fenster `t0` 00 UTC bis `t1` 24 UTC. Vergleichsgröße je Stufe: `bal` (fester Niederschlag − Schmelze; Eisschmelze zählt negativ) gegen die Winterbilanz der Stufe.

Tabelle über `k`: 0,30 … 5,00 in Schritten von 0,02, dazwischen linear. **Jeder berichtete Fehlerwert wird mit den gefundenen Multiplikatoren exakt mit `simulate` nachgerechnet**, nicht aus der Tabelle gelesen. Eine Stufe mit eigenem Multiplikator `k_b` wird als eigener Aufruf mit `pf = k_b` gerechnet (ein Band).

## 3. Schätzer

Gewertet werden Gletscher mit mindestens **4 nutzbaren Wintern**; jeder Winter `y` eines Gletschers `g` wird mit Werten vorhergesagt, die ihn nicht gesehen haben („ein Winter ausgelassen“).

- **Landeswert** `F_L(−g)`: der Multiplikator, der über alle Winter aller ANDEREN Gletscher des Landes `Σ_Winter Σ_b w_b · (bal_b(F) − bw_b)²` minimiert (ein Gletscher ausgelassen, wie LGO der ersten Runde; ohne Höhenverlauf — der Betrieb rechnet ohne).
- **Faktor des Gletschers** `F_g(−y)`: derselbe Verlust über die anderen Winter von `g`. Geschrumpft: `F̂ = w · F_g(−y) + (1 − w) · F_L(−g)`, `w = n / (n + n₀)`, `n` = Zahl der anderen Winter.
- **Form je Stufe:** je anderem Winter `y'` und Stufe `b` der Multiplikator `k*_b`, der `bal_b(k) = bw_b` löst (aus der Tabelle; an den Grenzen 0,30 und 5,00 gekappt, gekappte gezählt); Form `r_y'(b) = k*_b / k̄* − 1` mit `k̄* = Σ w_b · k*_b`. Beständige Form an der Höhe `z` = Mittel über die anderen Winter von `r_y'`, linear in der Höhe zwischen den Stufenmitten jenes Winters, außerhalb der Wert der nächsten Stufe. Auf den Stufen des vorherzusagenden Winters flächengewichtet mittelwertfrei gemacht (`s̃ = s − Σ w·s`) und geschrumpft: `c_b = max(0,2; 1 + m · s̃_b)`, `m = n / (n + n₀ˢ)`.
- `n₀` und `n₀ˢ` je aus {0, 1, 2, 4, 8}: gewählt wird der Wert mit dem kleinsten Stufenfehler s1 der Variante, in der er steht (V1 für `n₀`, V2 für `n₀ˢ` bei schon gewähltem `n₀`); bei Gleichstand (unter 0,5 %) der größere. Alle fünf werden berichtet. Die zwei Zahlen sind an denselben Wintern gewählt, an denen gewertet wird — das wird so genannt.

## 4. Varianten und Kennzahlen

| Variante | Multiplikator der Stufe `b` |
|---|---|
| **V0** Landeswert (der Betrieb heute) | `F_L(−g)` |
| **V1** Faktor je Gletscher (E-GM-9) | `F̂` |
| **V2** Faktor + Form (E-GM-31) | `F̂ · c_b` |
| **V3** Landeswert + Form | `F_L(−g) · c_b` |
| **N** Negativkontrolle | `F̂ · c'_b`, `c'` = die Form des nächsten gewerteten Gletschers in der nach Kennung geordneten Liste (zyklisch), über die normierte Höhe `(z − z_min) / (z_max − z_min)` auf die Stufen gelegt, sonst wie V2 |

Kennzahlen je Gletscherwinter wie in der ersten Runde (mm Wasserwert, `e_b` = Modell − Wahrheit): **s1** `Σ w_b·|e_b|`, **s3** `Σ w_b·e_b`, **s2** `|s3|`, **s4** `Σ w_b·|e_b − s3|`; gemittelt über die Gletscherwinter, dazu je Land. Unsicherheit: 1 000 Ziehungen der Gletscher mit Zurücklegen (Startwert 42), je Ziehung der relative Gewinn; p10 und p90.

## 5. Urteile

| Nr. | Frage | Regel |
|---|---|---|
| K-5 | Trifft der Landeswert mit der Schmelze des Betriebs besser als mit der Gradtag-Schmelze der ersten Runde? | LGO-s1 des Landeswerts mit ETI gegen LGO-s1 derselben Stellung (F je Land, ohne Verlauf) mit Gradtag an denselben Wintern (neu gerechnet). „besser“ ab 3 % weniger, „schlechter“ ab 3 % mehr, sonst „gleich“. Kein Gate — die Schmelze ist entschieden (E-GM-10) |
| K-6 | Trägt der Faktor je Gletscher? | s2 von V1 mindestens **20 %** unter V0 UND p10 des Gewinns > 0 |
| K-7 | Trägt die Form je Stufe? | s4 von V2 mindestens **10 %** unter V1 UND p10 des Gewinns > 0 UND der Gewinn von N gegen V1 kleiner als die Hälfte des Gewinns von V2 |
| K-8 | Erreicht die Winterbilanz die Grenze von Gate C? | s2 der besten tragenden Variante ≤ 350 mm (zum Einordnen; die erste Runde lag bei 403) |

In die Tabelle (`snow-calibration.json`) kommen Werte je Gletscher nur für Urteile, die tragen: der Faktor bei K-6, die Form bei K-7. Ein Abschnitt, dessen Urteil nicht trägt, wird mit `gate: false` und dem Grund geschrieben und von keinem Producer gelesen.

**Werte für die Tabelle** (kein Winter ausgelassen): `F̂_g` aus allen nutzbaren Wintern des Gletschers mit dem gewählten `n₀` gegen den Landeswert aus allen Gletschern; die Form als Stützstellen alle 50 m über die Höhenspanne aller Winter des Gletschers (Mittel über alle Winter, mit `m` aus dem gewählten `n₀ˢ`), die Zahl der Winter, der Zeitraum. Gletscher mit weniger als 4 nutzbaren Wintern bekommen keinen Eintrag.

## 6. Empfindlichkeiten (ändern weder Auswahl noch Urteil)

Jeweils die Kennzahlen von V0, V1, V2 und die Landeswerte: (a) `TF` und `SRF` × 0,5 und × 1,5; (b) Strahlung überall `clearSky · 0,55` statt der Messung; (c) nur Gletscherwinter mit höchstens 2 % Stunden ohne gemessene Strahlung; (d) Gradtag-Schmelze der ersten Runde (0,165 mm h⁻¹ K⁻¹, Eis × 1,6).

## 7. Nicht Teil der Runde

Der Winter 2025/26 (GLAMOS veröffentlicht ihn 2027); die Temperatur des Betriebs (buscosun Fusion gab es in diesen Wintern nicht — Formel und Konstanten sind die des Betriebs, Temperatur und Strahlung kommen von einer Station, V-GM-85); die Brücke Analyse ↔ buscosun Fusion (bleibt `1`, `set`); die rund 2 050 Gletscher ohne Stufenwerte (benannte Regel: Landeswert, keine Form); die Schneedecke an drei Höhen (V-GM-86).
