# Phase GL — eingefrorene Satellitenmethode für Gate B1

Eingefroren am **11.10.2026**, **vor** der Rückrechnung der Gate-Fenster (2023–2026) und vor jedem Vergleich mit GLAMOS-ELA und TSLA.
Ergänzt `claims-frozen.md` (dort stehen die Schwellen B1-1 … B1-6, sha256 in `audit/gletscher.md` §3): diese Datei legt fest, **wie** die
Endsaison-Schneegrenze gerechnet und verglichen wird. Eine spätere Änderung an Methode oder Parametern ist ein Befund (V-GL-…), kein Update.
Der Code-Stand ist der Commit, der diese Datei einführt (`scripts/glacier/lib/satcore.mjs`, `scripts/glacier/sat-scan.mjs`).

## Was an echten Szenen feststand, bevor die Gate-Daten angesehen wurden

Drei Entscheidungen fielen am Hintereisferner (UIBK, **nicht** Teil der GLAMOS-Gate-Menge) und an einem Waldfenster im Ötztal, nicht an GLAMOS-Gletschern:

1. **Kein Versatz der DN.** Der STAC nennt `offset: -0.1` (die +1 000 der Verarbeitungsbasis 04.00). Gemessen an sieben Szenen der Basen 04.00 … 05.12: das Rot der Waldpixel (SCL 4)
   hat p50 430–700 DN, p5 170–310 — mit dem Versatz wäre mehr als die Hälfte negativ; das SWIR von Schnee liegt bei 90–600 DN, und der NDSI der versatzkorrigierten Werte
   überschreitet 1. Reflexion = DN / 10 000. Ein Wächter prüft jede Szene gegen die Gegenannahme (`sceneEncodingSuspect`).
2. **Schnee gegen Eis.** NDSI trennt Schnee **und** Eis von Fels. Eis liegt im Sichtbaren bei 0,2–0,4, Schnee und Firn bei 0,5–0,9 (Profil Hintereisferner 25.08.2025: Eis 0,22–0,28 bis 3 000 m,
   Schnee 0,65–0,83 ab 3 200 m). Schnee = **NDSI > 0,4 und Grün ≥ 0,45** (`set`).
3. **Maskenregel** aus GL-0 (D-GL-4): SCL 0, 1, 2, 3, 8, 9, 10 ungültig, keine SWIR-Rettung, Szene gültig ab ≥ 70 % klaren Pixeln in der Gletschermaske.

## Die Methode (Parameter und Herkunft)

| Baustein | Festlegung | Herkunft |
| --- | --- | --- |
| Raster | 20-m-Raster der SCL; B03/B02/B04/B08 aus der ersten Übersichtsebene (20 m), B11/B12 nativ | D-GL-5 |
| Maske | Umriss L3 (4 m) des statischen Baums, Pixelmitte im Polygon | Plan |
| Höhe je Pixel | Copernicus DEM GLO-30, bilinear aus dem Gitter des statischen Baums (`dem/<region>.json`) | gemessen |
| Gültig | Maske ∧ SCL ∉ {0,1,2,3,8,9,10} ∧ Grün, B11 vorhanden; Szene ab ≥ 0,70 | `set` |
| Reflexion | DN / 10 000, negative Werte auf 0 (Rauschen der Atmosphärenkorrektur), DN 0 = keine Daten | gemessen |
| Schnee | NDSI = (B03 − B11)/(B03 + B11) > 0,4 und B03 ≥ 0,45 | Hall et al. / `set` |
| Zustand | Schneeanteil der klaren Pixel ≥ 0,98 ⇒ `snow-covered`, ≤ 0,02 ⇒ `snow-free`, sonst `snowline` | `set` |
| Schneegrenze (Klasse A) | die Höhe mit dem kleinsten Fehlbetrag „Schnee darunter + Nicht-Schnee darüber“ über die klaren Pixel (Mitte der Minima); Spanne = alle Schwellen innerhalb 2 % der klaren Pixel des Minimums | Plan (50-%-Kreuzung) in robuster Form |
| AAR (Klasse A) | Anteil der Maskenpixel (auch bewölkte) mit Höhe ≥ Schneegrenze; `snow-covered` ⇒ 1, `snow-free` ⇒ 0 | Plan |
| Albedo (Klasse A) | Liang (2001): 0,356·B02 + 0,130·B04 + 0,373·B08 + 0,085·B11 + 0,072·B12 − 0,0018, Mittel über Schnee- und über übrige klare Pixel, ≥ 20 Pixel | Literatur |
| Klasse B | nur Schneeanteil und Zustand (Ausaperung = 1 − Schneeanteil), weder Schneegrenze noch AAR noch Albedo | Plan |
| Klasse C, Deutschland | nie ein Satellitenwert | Plan |
| Quarantäne | Schneegrenze außerhalb [Höhe_min − 300 m, Höhe_max + 300 m] wird nicht geschrieben, sondern mit Grund im `skipped` | B1-5 |
| Marken | `schatten` (Sonnenhöhe < 30° oder ≥ 15 % SCL 2/3 in der Maske), `schutt` (Katalogklasse ≥ 2); `neuschnee` abgeleitet aus zwei Szenen (Schneegrenze −150 m oder Schneeanteil +0,30 innerhalb 10 Tagen, Juni–Oktober) | `set` |
| Szenenwahl | je Kachel und Tag alle Aufnahmen; ein Gletscher wird in der Aufnahme gelesen, die ihn am zentralsten sieht (Gleichstand: weniger No-Data, weniger Szenenbewölkung, Id); Szenen mit Szenenbewölkung ≥ 98 % entfallen; grobe SCL (160 m) um den Gletscher < 40 % gültig ⇒ nicht gelesen („bewölkt“) | `set` |

## Auswertung für Gate B1 (Festlegung vor der Rückrechnung)

**Fenster.** Endsaison = 25.08.–10.10. (B1-1, B1-3), 20.08.–10.10. (B1-4). Gescannt werden: 2023 und 2024 nur die Gletscher der GLAMOS-Vergleichsmenge (alle Klassen), 2025 und 2026 alle Gletscher der
Klasse A im Fenster 20.08.–10.10.; zusätzlich 2025 und 2026 die Leitgletscher von Juni bis Oktober (Saisonkurven) und alle Gletscher der Klassen A und B in den letzten drei Wochen vor dem 10.10.2026.

**B1-1 Endsaison-Schneegrenze.** Je Gletscher und Jahr: Median der `sla` aller gültigen Szenen im Fenster 25.08.–10.10. mit Zustand `snowline`, **ohne** Szenen mit der abgeleiteten Marke `neuschnee`;
mindestens 2 solche Szenen, sonst wird der Fall nicht gezählt. Wahrheit: GLAMOS-ELA (Release 2025) von Gletschern der Klasse A oder B mit GLAMOS-AAR zwischen 5 und 95 %, Jahre 2023, 2024, 2025,
Zuordnung über die GLAMOS-/SGI-Kennung des Katalogs. Kennzahlen: Median |Δ|, P90 |Δ|, Median Δ (Versatz), Anzahl gezählter Gletscherjahre. Der Vergleich nennt den Versatz getrennt.

**B1-2 Basislinie.** Mittel der TSLA-Endsaison-Schneegrenze 2000–2022 je Gletscher (Zuordnung über RGI 6) als Schätzer für 2023–2025; Median |Δ| gegen dieselbe GLAMOS-ELA an denselben Gletscherjahren.

**B1-3 TSLA 2025.** TSLA-Endsaison 2025 gegen unsere Endsaison-Schneegrenze 2025 (gleiche Definition wie B1-1) je Gletscher der Klasse A mit TSLA-Wert; Median |Δ|.

**B1-4 Vollständigkeit.** Anteil der Klasse-A-Gletscher mit mindestens einer gültigen Szene im Fenster 20.08.–10.10., getrennt für 2025 und 2026; jede übersprungene Szene trägt ihren Grund im Bericht (`skipped`).

**B1-5 Unmöglichkeiten.** Anzahl der geschriebenen Werte außerhalb der Regeln von `obsProblems` (0 verlangt); Zahl der Quarantänen je Grund.

**B1-6 Fixtures.** `verify:glacier-sat` (26 Prüfungen) an sechs gespeicherten echten Szenen, Prüfsumme in der Fixture.

**Empfindlichkeit (Information, kein Gate, nicht zum Anpassen).** Die Auswertung wird zusätzlich mit Grün-Schwelle 0,40 und 0,50 und mit Einschluss der `neuschnee`-Szenen gerechnet und im Bericht genannt.

**Wenn ein Kriterium rot ist,** gilt B1 als nicht bestanden; die Anzeige der Schneegrenze bleibt gesperrt und die Abweichung wird als V-Eintrag benannt. Es wird nicht an den Gate-Daten nachgestellt.
