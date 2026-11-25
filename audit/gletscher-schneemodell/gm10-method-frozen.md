# GM-10, Schritt 0 — Lässt sich der Faktor eines Gletschers vorhersagen? Methode, eingefroren vor dem ersten gewerteten Lauf

Stand 25.11.2026. Diese Datei wird nach dem Einfrieren nicht mehr geändert; Änderungen kommen als Nachtrag mit eigenem Hash (`gm10-method-frozen.sha256`). Werkzeug `audit/gletscher-schneemodell/gm10-factor.mjs` (Modus `score` läuft nur bei passendem Hash dieser Datei; sein eigener Hash steht im Bericht). Urteile rechnet das Werkzeug, nicht der Autor.

**Bekannt beim Einfrieren** (und deshalb keine Vorhersage dieser Runde): die Zählung (Inventar, §2), die Prädiktoren aller Gletscher aus Gittern und Gelände (sie lesen keine Winterbilanz), der synthetische Wiederfindungstest (§8), die Zahlen von GM-5b (Landeswert 402,2 mm, eigener Faktor 233,0 mm Winterbilanzfehler; Faktor p10 / Median / p90 1,38 / 1,97 / 2,91). **Nicht angesehen:** irgendein Zusammenhang zwischen einem Prädiktor und dem Faktor oder der Winterbilanz eines Gletschers.

Fest steht (nicht neu verhandelt): die Gitter sind Analysen für offenes Gelände, keine Messung auf dem Eis. Sie können nur das Muster von Gletscher zu Gletscher liefern; das Niveau bleibt bei GLAMOS und WGMS.

## 1. Wahrheit, Antrieb, Schmelze

Wie GM-5b, unverändert importiert: `loadWinters` (`scripts/glacier/snowcal-fit.mjs`), `attachRadiation`, `tableOf`, `scoreOf` (`scripts/glacier/snowcal-fit2.mjs`), Schmelzkern des Betriebs (`simulate`, Modell `eti`, `TF` 0,12 / `SRF` 0,005455 aus `melt-calibration.json`). 481 nutzbare Gletscherwinter; gewertet werden nur die **43 Gletscher von GM-5b** (mindestens vier Winter; Schlüssel = `table` des Berichts von GM-5b) mit allen ihren nutzbaren Wintern 2012–2025.

Winterbilanz eines Gletscherwinters mit dem Multiplikator `F` (alle Stufen gleich): `T(F) = Σ_b w_b · bal_b(F)`, Wahrheit `BW = Σ_b w_b · bw_b`. **Kennzahl s2 = |T(F) − BW|** in mm Wasserwert, gemittelt über die Gletscherwinter — dieselbe Größe wie s2 in GM-5b.

## 2. Prädiktoren (Definition)

Für jeden Gletscher `g` (Gitterwinter = nutzbare Winter der Wahrheit, für die das Gitter t0 und t1 + 1 trägt):

- **ΔSWE_gy** = SWE(t1 + 1) − SWE(t0) (Werte des Tages um 06 UTC+1 bzw. des Tageswerts), gemittelt über die Gitterzellen des Gletschers. Schweiz: SLF-Schneedatensatz Q20 (Zenodo 10.5281/zenodo.17313889, Version 1.0, 250 m, Nordwert + 2 000 m nach dem Hinweis auf Zenodo), Zellmittelpunkte im L1-Umriss des Builds `20261120-1`, sonst die nächste Zelle (`gm10-q20.py`). Österreich: SNOWGRID Klima v2.1 `swe_tot` (1 km), Zellen aus der Zellendatei der Phase GN `20261120-1.1` (`gm10-snowgrid.mjs`). Ein Winter mit ΔSWE ≤ 0 zählt nicht.
- **x1 — Faktor, den das Gitter verlangt:** je Gitterwinter das `k`, für das die Tabelle des Kerns `T(k)` (dieselben Stufen, Antrieb und Schmelze wie die Eichung) ΔSWE_gy erreicht (linear auf der Tabelle, an 0,30 / 5,00 gekappt, gekappte gezählt); `x1_g` = Mittel von `ln k` über die Gitterwinter.
- **x2 — Schneewasser relativ zur Region:** `x2_g` = Mittel über die Gitterwinter von `ln(ΔSWE_gy / ΔSWE_Region,y)`; Region = alle Gitterzellen aller Katalog-Gletscher derselben Katalogregion (Schweiz: Q20-Zellen der 1 291 Schweizer Gletscher, jede Zelle einmal; Österreich: SNOWGRID-Zellen der Gletscher der fünf Regionen), ungewichtet. Ohne Höhenabgleich.
- `x1`, `x2` nur bei **mindestens 3 Gitterwintern**, sonst fehlt der Prädiktor und der Gletscher fällt aus der Form.
- **Gelände** (`gm10-terrain.py`, Build `20261120-1` und Copernicus GLO-30 der lokalen Kacheln): `zMed` (Medianhöhe des Katalogs), `zRange` (max − min), `lnArea` (ln km²), `slope` (mittlere Neigung im Umriss), `north` (Mittel von cos Exposition im Umriss), `tpi1k` (Mittel von z − Mittel des Quadrats ± 1 km, m), `aval` (Fläche der Hänge ≥ 30° außerhalb des Gletschers, deren D8-Fließweg den Gletscher erreicht, durch die Gletscherfläche; Fenster Umriss + 3 km; Näherung, kein Lawinenmodell).

## 3. Inventar (gezählt vor dem Einfrieren)

| Land | Gletscher GM-5b | mit x1/x2 | Gletscherwinter gewertet | davon Gitterwinter | Quelle |
|---|---|---|---|---|---|
| CH | 35 | **32** (ohne Vorab, Segnas: je 1, Tiefen: 2 Gitterwinter) | 377 | 283 | Q20 2016–2025 |
| AT | 8 | **8** | 87 | 86 | SNOWGRID 2012–2025 |

Acht Gletscher hängen an EINER Gitterzelle (Jöri, Pizol, Schwarzwasserfirn [nächste], Alphubel N; Goldberg [nächste], Hallstätter, Kleinfleiß, Seekarles). In Österreich sind die meisten Gletscher kleiner als eine 1-km-Zelle. Mont Collon (Faktor von GM-5b an der Obergrenze 5) bleibt gewertet wie in GM-5b.

## 4. Formen (wenige, einfach)

Jede Form sagt `ln F̂_g = c_Land + Σ_j β_j · z_jg` voraus, `z` = Prädiktor zentriert und durch die Streuung der TRAININGS-Gletscher geteilt. `c_Land` und `β` werden **auf der gewerteten Größe** angepasst: kleinster Mittelwert von s2 über die Gletscherwinter der Trainings-Gletscher, auf der Tabelle über `k` (Nelder–Mead, zwei Neustarts; `F̂` an 0,30 / 5,00 gekappt). `β = 0` ist der Landeswert — die Anpassung schrumpft also von selbst zum Landeswert.

| Form | Prädiktoren | Länder (Training) | Rolle |
|---|---|---|---|
| **G1-CH** | x1 (Q20) | CH | **primär für die Schweiz** |
| **G1-AT** | x1 (SNOWGRID) | AT | **primär für Österreich** |
| G2-CH, G2-AT | x2 | je Land | sekundär |
| **T3** | zMed, north, lnArea | CH + AT gemeinsam, je Land ein `c` | **primär für Gelände allein** (Deutschland) |
| T2w | tpi1k, aval | CH + AT gemeinsam | sekundär |

Dazu beschreibend, ohne Urteil: jeder einzelne Prädiktor (x1, x2 je Land; zMed, zRange, lnArea, slope, north, tpi1k, aval für CH + AT) als Form mit einem `β`.

## 5. Wertung und Grundlinien

- **Ein GLETSCHER ausgelassen:** für jeden gewerteten Gletscher `g` werden Zentrierung, Skalierung, `c` und `β` nur aus den anderen Gletschern der Form bestimmt; dann werden ALLE Winter von `g` mit `F̂_g` **exakt mit dem Kern** (`scoreOf`) gerechnet.
- **(a) Landeswert wie GM-5b** (V0, `F_L(−g)` auf dem Stufenverlust, alle anderen Gletscher des Landes) und **(b) eigener Faktor** (V1, ein Winter ausgelassen) — beide als s2 je Winter aus den Zeilen `perWinter` des gewerteten Laufs von GM-5b, nicht neu gerechnet. Die Zeilen stehen nur im lokalen Original `C:\dev\buscosun-glacier-cache\gm3\report-fit2.json` (die Fassung `gm5b-report.json` im Repo trägt sie nicht); das Werkzeug verlangt dort den Hash der Regel von GM-5b (`c5242e51…`). Gemittelt über die 478 Winter ergeben sie 402,2 und 233,0 mm wie in GM-5b.
- **(a′) Landeswert auf derselben Größe:** nur `c_Land` (β = 0), auf s2 angepasst, dieselben Trainings-Gletscher wie die Form, exakt gerechnet. Das ist der faire Vergleich (V-GM-103).
- Kennzahlen je Land und gesamt: s2 von Form, a′, a, b; Gewinn gegen a′ und gegen a; **geschlossener Anteil der Lücke** `(a − Form) / (a − b)`.
- **Streuung des Vorhersagefehlers:** je Gletscher `ln(F̂_g / F_own,g)` mit `F_own` = eigener Faktor aus allen Wintern (`table.Fown` von GM-5b; ein Gletscher, dessen eigener Faktor an einer Grenze des Suchbereichs liegt — 0,30 oder 5,00, heute Mont Collon —, ist ausgenommen); Standardabweichung, p10, p90, daneben dieselbe Zahl für a′.
- **Unsicherheit:** 1 000 Ziehungen der Gletscher mit Zurücklegen (Startwert 42), Gewinn gegen a′ je Ziehung; p10.
- **Negativkontrolle:** die Prädiktoren werden zwischen den Gletschern desselben Landes vertauscht. (i) Eine Vertauschung (Startwert 42) wird wie die Form gewertet und berichtet. (ii) **200 Vertauschungen** (Startwerte 1000 …) geben die Verteilung des Gewinns gegen a′ (auf der Tabelle); `p` = (1 + Zahl der Vertauschungen mit Gewinn ≥ beobachtetem Gewinn auf der Tabelle) / 201.

## 6. Urteil „trägt“ (vom Werkzeug)

Je Land für die primäre Form (G1-CH, G1-AT) und für T3 (gesamt und je Land):

1. mindestens **10 gewertete Gletscher**, sonst **„nicht entscheidbar“** (Zahlen werden trotzdem berichtet);
2. Gewinn gegen a′ **≥ 10 %** (s2);
3. p10 des Gewinns aus den Ziehungen **> 0**;
4. Vertauschungs-`p` **≤ 0,05**;
5. die Form ist auch besser als (a) (Gewinn gegen a > 0).

Alle fünf ⇒ „trägt“, sonst „trägt nicht“. **Gesamt (Gitter):** CH aus G1-CH und AT aus G1-AT zusammengelegt (nach Wintern gewichtet); „trägt“, wenn der Gewinn gegen a′ gesamt ≥ 10 % ist UND jedes Land mit eigener Entscheidung „trägt“. Sekundäre und einzelne Formen tragen kein Urteil; sie sagen, welche Prädiktoren etwas tragen.

## 7. Empfindlichkeit (ändert kein Urteil)

Nach dem Lauf wird berichtet, wie die primären Zahlen ohne Mont Collon aussehen (aus den Zeilen je Gletscher des Berichts).

## 8. Synthetischer Wiederfindungstest (vor dem Einfrieren gelaufen)

Mit dem echten Prädiktor x1 der 32 Schweizer Gletscher und den echten Tabellen, aber erfundenen Winterbilanzen: `F_true,g = 1,8 · exp(β · z_g)`, je Winter `BW = T(F_true · e^ε)`, ε ~ N(0; 0,2). Zwei Fälle: `β = 0,3` (Wiederfinden) und `β = 0` (nichts zu finden). Gewertet wie §5 auf der Tabelle, 100 Vertauschungen. Erwartung: bei 0,3 findet das Werkzeug `β` wieder und trägt; bei 0 trägt es nicht und die Vertauschung gewinnt nichts. Ergebnis im Diagnosedokument `gm10-diagnose.md`.

## 9. Nicht Teil dieses Schritts

Kein Producer-Code, keine Tabelle für den Runner, kein Lauf des Producers, keine Mutationsrunde, nichts in `buscosun-data` oder `buscosun-archiv`; keine abgeleitete Tabelle je Gletscher im Repo (Lizenzfrage GLAMOS offen) — Faktoren je Gletscher stehen nur im lokalen Bericht. Die Form je Stufe (GM-5b V2) wird hier nicht vorhergesagt. Gletscher ohne Messung werden nicht gerechnet.
