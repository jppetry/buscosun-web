# Phase SU — Bandbreite von Wind und Böen auf `/seewetter`

> Stand 18.11.2026. Auftrag: aus der Verteilung, die buscosun Fusion je Stunde ohnehin rechnet, die Spanne von Wind
> und Böen an den Spots zeigen und sagen, wie oft die Böen über der Grenze des Profils liegen. Kein Schalter (Jan
> 18.11., Ausnahme von Rule 2); Spot-Dateien ohne Quantile zeigen die Seite wie bisher.

## 1. Diagnose (18.11., vor dem Code)

**Was es gibt.** `scripts/sea/sea-derive.mjs` rechnet je Spot buscosun Fusion an der Wasserzelle (`spotWind` →
`getPointForecastFromCube`) und schreibt aus `step.vars.wind/gust/windDir` nur `mean` in `spots/<lauf>.json` bzw.
`spots/<lauf>-w<t1>.json` (0,1 m/s, ganzzahlig). Die Verteilung liegt an derselben Stelle schon vor:

- Stunde mit eigener Rechnung: `vars.wind.dist` / `vars.gust.dist` (`Dist`), daraus `quantiles()` in `fusion/dist.ts`
  (q10, q25, q50, q75, q90) — nur gelesen.
- Interpolierte Stunde (zwischen zwei Stützstunden, jenseits der stündlichen Stufe): `dist` ist `null`, die Ausgabe
  trägt p10/p50/p90 als lineare Interpolation der Nachbarstunden (`cubeSource.ts`, „Lineare Interpolation der Quantile
  zwischen den nächsten Schritten mit Verteilung“). q25/q75 gibt es dort nicht.

**Was fehlt.** Die Quantile im Datenprodukt, ihre Prüfung im Client, die Rechnung „Anteil über der Grenze“ und die
Anzeige (Diagramm, Stundenband, Readout).

**Was nicht angefasst wird.** Der Motor (`src/pointForecast/**`), Edge Functions, Abhängigkeiten, der Workflow im
Daten-Repo (er checkt `scripts` und `src` ganz aus — die Änderung am Producer wirkt mit dem Push von `buscosun-web`).

## 2. Schritt 0 — Abdeckung an Küstenstationen (gemessen 18.11.)

Werkzeug `audit/seewetter-bandbreite/coverage-coast.mjs`, Ergebnis `coverage-coast.json`. Regel vor dem Lauf
festgelegt (Kopf des Skripts): Konserve `fusion-12x` des Prüfstands (= buscosun Fusion 13; Wind und Böe von Fusion 14
sind byte-gleich), 38 Ausgaben 14.09.–21.10.2026 (Entwicklungsmenge), Rastervorläufe 1–78 h, Wahrheit W1, Stationen
des Prüfnetzes P1 in DE höchstens 10 km von einem der 56 Spots. Kein neuer Lauf.

14 Stationen (Helgoland, List/Sylt, St. Peter-Ording, Olpenitz, Kiel-Holtenau, Westermarkelsdorf, Arkona, Putbus,
Norderney, Cuxhaven, Pelzerhaken, Boltenhagen, Warnemünde, Ueckermünde; 8 mit eigener Messung in der Kette, 6 ohne):

| Größe | Vorlauf | Fälle | q10–q90 | q25–q75 | unter q10 | über q90 | Breite q10–q90 |
|---|---|---|---|---|---|---|---|
| Wind | 1–6 h | 3 168 | 75,4 % | 49,1 % | 14,3 % | 10,3 % | 4,7 kn |
| Wind | 7–24 h | 9 367 | 77,5 % | 49,9 % | 13,7 % | 8,8 % | 6,1 kn |
| Wind | 25–48 h | 11 623 | 74,4 % | 46,7 % | 14,4 % | 11,2 % | 5,8 kn |
| Wind | 49–78 h | 4 984 | 76,4 % | 48,3 % | 9,4 % | 14,2 % | 6,7 kn |
| Böe | 1–6 h | 3 168 | 76,6 % | 49,7 % | 7,0 % | 16,4 % | 5,6 kn |
| Böe | 7–24 h | 9 367 | 77,5 % | 49,4 % | 9,2 % | 13,3 % | 6,8 kn |
| Böe | 25–48 h | 11 623 | 76,4 % | 47,6 % | 10,3 % | 13,4 % | 7,3 kn |
| Böe | 49–78 h | 4 983 | 74,1 % | 46,9 % | 2,4 % | 23,5 % | 9,5 kn |

Zufallsband um 80 % bei ≈ 530 Stations-Ausgaben: 76,6–83,4 %. Zum Vergleich alle 179 DE-Stationen: Wind 82,7–85,3 %,
Böe 82,0–83,5 % (25 km um die Spots, 23 Stationen: wie 10 km, 73,9–77,7 %).

**Lesart.** An der Küste liegt die Messung in rund 3 von 4 Fällen in der Spanne q10–q90, nicht in 8 von 10 — die
Spanne ist dort eher zu schmal (2–6 Punkte unter dem Soll, in vier von acht Zellen unter dem Zufallsband), im
Binnenland eher zu breit. Die Böe liegt öfter über als unter der Spanne.

**Grenzen der Messung.** (a) Landstationen an der Küste, nicht die Wasserzelle der Spots (dort Höhe 0 m, kein
Messwert). (b) Nur Herbst, nur Abendausgaben (20/23 UTC) — 1–6 h ist Nacht (V-OF-24). (c) Böe 49–78 h: die Wahrheit ist
dort das 3-h-Maximum, die Vorhersage stündlich (Protokoll P1, „gemischte Definition“) — die 23,5 % über q90 sind zum
Teil diese Definition. (d) Entwicklungsmenge, kein Abnahme-Urteil.

## 3. Entscheidungen (gesetzt, Jan kann sie drehen)

- **E-SU-1 (Jan 18.11.):** kein Schalter, an für alle; ohne Quantile in der Datei bleibt die Seite wie heute.
- **E-SU-2:** Quantile als eigenes, optionales Feld `q` je Spot neben `v` (nicht als weitere Spalten in `v`): alte
  Clients lesen `v` und merken nichts, `schema` bleibt 1, der Pfad bleibt `sea/v1`.
- **E-SU-3:** interpolierte Stunden: q10/q50/q90 = p10/p50/p90 des Motors; q25/q75 linear zwischen den Nachbarstunden
  mit Verteilung — dieselbe Regel, die der Motor für p10/p50/p90 anwendet, im Producer (Motor unverändert). Fehlt ein
  Nachbar, bleibt die Stunde ohne Quantile.
- **E-SU-4:** die Legende sagt „meist = 8 von 10 Fällen“ (Soll der Spanne) UND die gemessene Zahl von §2 („an
  Küstenstationen im Herbst 2026 rund 3 von 4“). Ohne den zweiten Satz wäre die Legende an der Küste zu günstig.
- **E-SU-5:** zwei Bänder = Spanne q10–q90 des Winds und der Böen; das bisherige Böen-Band (Fläche zwischen den
  beiden Linien) bleibt. q25/q75 gehen in die Rechnung „über Grenze“ ein, nicht in ein eigenes Band.

## 4. Plan

1. Vertrag `seaContract.ts`: `SEA_Q_KEYS`, `SEA_Q_VARS`, Prüfung, Verwerfen ohne Mittelwert, Zusammenführen.
2. Producer `sea-derive.mjs`: `spotWindSeries` liefert `q`; Lauf und Wind-Auffrischung schreiben es; `sanitizeGust`
   nimmt die Quantile der verworfenen Böe mit. `sea-archive.mjs`: Index nennt Dateien mit Quantilen.
3. Client `seaClient.ts`: `q` lesen, prüfen, mit der Auffrischung zusammenführen. `windBand.ts`: Anteil über der Grenze.
4. UI: Bänder in `WindChart`, Zeile „über Grenze“ in `SeaBand`, „meist a–b“ und zehn Punkte im Readout.
5. Gate: `verify:sea-wind-band`, lokaler Producer-Lauf, typecheck, build, budget, `verify:sea-*`, Bilder.

## 5. Umsetzung (18.11.)

| Teil | Datei | Was |
|---|---|---|
| Vertrag | `src/sea/seaContract.ts` | `SEA_Q_KEYS` (q10 … q90), `SEA_Q_VARS` (wind, gust), `spotQuantileProblems` (Wertesperre), `dropQuantilesWithoutMean`, `mergeSpotQuantiles`, `decodeSpotQuantiles`, `hasQuantiles` |
| Producer | `scripts/sea/sea-derive.mjs` | `stepQuantiles` (liest `dist` über `quantiles()`; interpolierte Stunden nach E-SU-3), `spotWindSeries` liefert `q`, `spotBand` (verwirft mit dem Mittelwert, prüft, schreibt sonst ohne Spanne); Lauf und Wind-Auffrischung schreiben `q` je Spot und `quantiles` am Dokument |
| Archiv | `scripts/sea/sea-archive.mjs` | Dateien werden ganz archiviert (Quantile inbegriffen); der Index nennt unter `band` die Dateien mit Quantilen |
| Client | `src/sea/seaClient.ts` | `parseSpotsDoc` (reiner Teil von `loadSpots`), `readSpotQuantiles`, `mergeWindDoc` führt die Spanne mit der Auffrischung zusammen; `SeaSpotsDoc.quantiles` nur, wenn mindestens ein Spot eine Spanne trägt |
| Rechnung | `src/sea/windBand.ts` | `overLimit` (Anteil über der Grenze, Zehntel, Ränder nur als Seite), `mostText`, Wortlaute, Legende |
| Anzeige | `SeaCharts.tsx`, `SeaBand.tsx`, `SeaReadout.tsx`, `SeaGustOdds.tsx`, `SeaPage.tsx`, `seaDeck.css` | zwei Bänder hinter den Linien, Zeile „über Grenze“, „meist a–b“ an Wind und Böen, zehn Punkte mit Satz; mobil in der unteren Leiste |

**Datenvertrag (geändert, abwärtsverträglich).** `sea/v1/spots/<lauf>.json` und `sea/v1/spots/<lauf>-w<t1>.json`:
je Spot neben `v` optional `q: { wind: { q10, q25, q50, q75, q90 }, gust: { … } }`, jede Spalte 79 Werte, ganzzahlig in
0,1 m/s, `null` = keine Spanne; am Dokument optional `quantiles` (Schlüssel, Größen, Einheit, Zahl der Spots, Herkunft).
`schema` 1 und Pfad `v1` bleiben; ein Client vor dieser Phase liest `v` und übersieht `q`. Archiv-Index: `band` je Tag.

**Regeln der Anzeige.** Je Stunde, nie für ein Fenster. Innerhalb q10–q90 „in etwa n von 10 vergleichbaren Lagen“
(n = 1 … 9), darüber „seltener als 1 von 10“, darunter „häufiger als 9 von 10“. Keine Prozentwerte, keine Ampel (ein
Farbton, der der Grenzlinie), nie „sicher“. passt/knapp/außerhalb und die Fenster rechnen weiter mit dem Mittelwert.
Ohne Böen-Grenze im Profil gibt es keine Zeile und keine Punkte; die Bänder und „meist“ bleiben.

**Lokaler Producer-Lauf (17.11. 23:57 UTC, Kopie des Live-Speichers, Cube über das CDN):**
`sea-derive.mjs --wind --data=cdn` auf Lauf 2026111712, t1 2026111715: 56 von 56 Spots mit Spanne, 0 abgelehnt, 12 s.
3 808 Stunden mit Mittelwert, jede mit Spanne, kein Mittelwert außerhalb q10–q90, keine verworfene Böe in diesem Lauf.
Datei 207 571 Bytes (gzip 49 323) statt 49 590 Bytes der veröffentlichten Auffrischung desselben Laufs. Beispiel
St. Peter-Ording +20 h: Wind 11,4 m/s [10,3 / 10,8 / 11,4 / 12,1 / 12,6], Böe 16,9 m/s [15,3 / 16,0 / 16,9 / 17,7 / 18,4].
Drei Spots dieses Laufs sind unverändert die Fixtures `scripts/lib/fixtures/sea/su-*.json`.

## 6. Gate (18.11.)

| Prüfung | Ergebnis |
|---|---|
| `verify:sea-wind-band` (neu, 5 s, netzfrei) | **41/41** — A Vertrag an der echten Datei + 8 Negativkontrollen · B Producer (Quantile = `quantiles()`, interpolierte Stunde, verworfene Böe mit Gegenprobe, Auffrischung mit und ohne Verteilung, Archiv) · C Client (zwei alte Dateien wie bisher, kaputter Spot verliert nur seine Spanne, Zusammenführen) · D Rechnung (28 764 echte Fälle monoton, Ränder, Wortlaut ohne Prozent) · E Anzeige (Stundenband HEAD = dieser Baum auf alter Datei, Byte für Byte; Zeile, Punkte, Band-Läufe) |
| `verify:sea-derive` | **70/70** (69 + A6b: der ganze Lauf auf den CWAM-Ausschnitten trägt `q` neben `v`; an der Stunde der verworfenen Böe sind ihre fünf Quantile `null`, die des Winds bleiben) |
| `verify:sea-contract` · `-decode` · `-text` · `-waterlevel` · `-tide-window` · `-seo` | 30/30 · 13/13 · 35/35 · 63/63 · 49/49 · 23/23 |
| `verify:sea-ui` | **rot, wie an HEAD** (V-TF-5): bricht auf diesem Baum an derselben Stelle ab — B0 „Deck nicht bereit“ auf `/seewetter?sea=1` (der Selektor `.sw-spot-title` existiert seit dem Dossier-Umbau nicht), Seitenfehler `[]`, 270 s. Keine Prüfung dieser Phase wird erreicht; HEAD selbst wurde dafür nicht eigens gebaut |
| `npm run typecheck` | grün |
| `npm run build` | grün (280/280 Shell-Prüfungen) |
| `npm run budget` | grün: eagerJs 114,4 / 115 KB · eagerCss 2,4 / 2,5 KB · largestChunk 278,4 / 302 KB · totalJs 1 966,9 / 1 985 KB (Zuwachs gegen HEAD nicht einzeln gemessen) |
| Lokaler Producer-Lauf | §5: 56 von 56 Spots mit Spanne |
| Bilder | `audit/seewetter-bandbreite/shots/` (Werkzeug `shots.mjs`, Zählung `report.json`): Desktop 1440 × 900 und Mobil 390 × 844 (DPR 3), je mit der neuen Datei (`*-neu-*`) und mit der heutigen Datei ohne Quantile (`*-alt-*`). Im mobilen Kartenbild liegt der Erstbesuch-Hinweis „Karte erkunden“ über der Spot-Kachel; die Punkte-Leiste darunter ist zu sehen |

**Die fünf Fragen.**
1. *Funktionserhalt:* mit der heutigen Datei steht in keiner der drei Ansichten (Desktop-Dossier, Mobil-Karte,
   Mobil-Dossier) ein Element dieser Phase (`report.json`: 0 Punkte-Zeilen, 0 Zellen, 0 Bänder, 0 „meist“), das
   Stundenband ist Byte für Byte das von HEAD (E1), alte Dateien werden wie bisher gelesen (C1). Mit Quantilen bleibt
   das Böen-Band zwischen den Linien, tritt aber zurück (Deckkraft 0,2 → 0,09, Fläche unter dem Wind 0,14 → 0,08),
   damit die zwei Spannen lesbar sind — E-SU-5.
2. *Desktop pixelgleich:* **nicht gemessen.** Es gibt keinen Pixelvergleich gegen einen Build von HEAD; belegt sind die
   Abwesenheit im DOM und die Byte-Gleichheit des Stundenbands (V-SU-5).
3. *Touch-Ziele:* die vier Knöpfe der unteren Leiste messen 44 px, mit und ohne Punkte-Leiste; die neuen Elemente sind
   nicht bedienbar.
4. *Konsole:* sechs Ansichten, keine Ausnahme, kein `console.error`.
5. *Long Tasks:* **nicht gemessen** (headless-shell liefert keine; die Rechnung ist je Stunde eine Interpolation über
   fünf Zahlen). Real-Device offen.

## 7. Befunde

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| **V-SU-1** | An Küstenstationen deckt q10–q90 nur 74–78 % (Soll 80 %), im Binnenland 82–85 % | „meist“ hielte, was es sagt. Skizze: σ-Skala mit einer Küstenklasse (Abstand zur Küste) in der Tabelle H — Motor, also Jans Entscheidung und ein neuer Stand von buscosun Fusion |
| **V-SU-2** | Schritt 0 misst Landstationen, nicht die Spots | Nach ≥ 14 Tagen Archiv: Spanne der Spots gegen die POI-Messung ihrer Station (`poi.json.gz`, Index `band`), Skript nach dem Muster `sea-gate-d.mjs`; ersetzt „rund 3 von 4“ durch die Zahl an den Spots |
| **V-SU-3** | Die Dateien wachsen: Auffrischung 49,6 → 207,6 KB roh (gzip ≈ 49 KB), Lauf-Datei ≈ +160 KB; im Speicher bei 18 Dateien ≈ +2,9 MB | Kleiner ginge es mit Quantilen als Abstand zum Median — ein Formatwechsel, lohnt erst, wenn der Speicher drückt |
| **V-SU-4** | `verify:sea-wind-band` steht nicht in `.github/workflows/ci.yml` (Workflows nicht angefasst) | Eine Zeile `node scripts/ci-run.mjs verify:sea-wind-band` hinter „Verifier — Tidenfenster“ |
| **V-SU-5** | Kein Pixelvergleich HEAD ↔ dieser Baum auf alter Datei; `verify:sea-ui` ist an HEAD rot (V-TF-5) | Den Selektor in `verify:sea-ui` B0 auf das Dossier heben, dann trägt er auch diese Seite; bis dahin gelten DOM-Zählung und E1 |
| **V-SU-6** | Nach dem Push tragen die schon veröffentlichten Lauf-Dateien keine Quantile: die Spanne erscheint mit der nächsten Wind-Auffrischung (≤ 3 h) ab deren Stunde, ganz mit dem nächsten Lauf (≤ 12 h) | Kein Handgriff nötig; steht in MANUELLE-SCHRITTE §90 |
| **V-SU-7** | Spot-Liste und Karten-Punkte zeigen die Spanne nicht (nur die Karten-Kachel: „meist“ an den Böen) | Später ein kleiner Hinweis in der Liste für die gewählte Stunde |
| **V-SU-8** | Böe 49–78 h: 23,5 % der Messungen über q90 — die Wahrheit ist dort das 3-h-Maximum, die Vorhersage stündlich | Für diese Seite die Böe 49–78 h gegen das Stundenmaximum der Station messen (liegt im POI-Archiv) |
| **V-SU-9** | Am 18.11. 00:33 UTC stand `point/index.json` bei t1 `2026111715` (t2 `2026111718`) — die t1-Läufe 18 und 21 UTC fehlten | Nicht Teil dieser Phase und nicht untersucht; bitte den Punkt-Cron ansehen |
