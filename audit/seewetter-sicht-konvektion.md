# Seewetter — Sicht und Schauer-/Gewitter-Hinweis (Phase SG)

> Auftrag Jan 18.11.2026. Gelesen: `CLAUDE.md`, `audit/seewetter.md`, `audit/autobahnwetter.md` §20.3 und §20.12.
> Arbeit direkt auf `main`. Ohne Schalter an für alle (E-SG-1, Jans Entscheidung, Ausnahme von Rule 2).
> Das Kürzel SG trug bisher nur die Sounding-Absicherung (Zweig `fix/sounding-guard`, keine E-/V-Nummern) — hier
> heißen die Punkte E-SG-n und V-SG-n.

## 0. Kurzfassung für Jan

- **Gebaut, ohne Schalter, lokal committet (Push = Jan):** je Spot und Stunde zwei Hinweise in der Spot-Datei (Schauer/Gewitter
  möglich; Sicht gut / eingeschränkt möglich / Nebel möglich), geschrieben bei jeder Windrechnung; auf der Seite die Zeile
  „Sicht" und eine Marke in der Zeile „Böen" des Stundenbands, die Karte „Sicht, Schauer und Gewitter" (gemessene Sicht der
  Station, amtliche Zeile wörtlich, Hinweis mit Regel, Schauer-Hinweis mit Reichweite) und ein Eintrag im Planer.
- **Sichtbar wird es** nach dem Push mit der nächsten Windrechnung des Workflows. Bis dahin steht in Zeile und Karte
  „keine Daten"; die gemessene Sicht und die amtliche Zeile kommen sofort.
- **Was die Messung geändert hat:** die Sicht-Diagnose der Autobahnlinie trifft an der Küste mit Messwerten als Eingabe nur
  31 % der Sichtklassen, weil ihr Regen-Teil 5- bis 15-mal zu kurze Sichtweiten rechnet. Der Hinweis nennt deshalb keine
  Kilometer und der Regen-Teil sagt nur „unter 10 km möglich: ja/nein" (§2.4, E-SG-5).
- **Was der Hinweis nicht kann:** mit Vorhersagewerten ist er erst an 22 Stationsstunden geprüft, und dort war buscosun Fusion
  im Median 1,1 K trockener als die Messung — „Nebel möglich" erscheint seltener, als es sollte (§5.3, V-SG-3). Die Schwellen für
  Schauer und Gewitter sind gesetzt, der Messtag war ruhig (V-SG-1). Beides steht so auf der Seite.
- **Nebenbefund außerhalb der Phase:** der t1-Würfel von buscosun Fusion steht im Daten-Repo seit dem 17.11. 15 UTC, der
  Workflow `point` läuft grün. Seitdem gibt es keine Wind-Auffrischung am Spot mehr (V-SG-9).
- **Nicht gesehen:** die Oberfläche im Browser (Jans Entscheidung 18.11.). Gates §6.

## 1. Diagnose

### 1.1 Was die Seite heute hat

| Baustein | Ort | Befund |
|---|---|---|
| Stundenreihe je Spot | `sea/v1/spots/<lauf>.json`, Wind neu je t1-Würfel in `spots/<lauf>-w<t1>.json` (`sea-derive.mjs` `buildRun`/`windRefresh`) | buscosun Fusion wird je Spot an der Wasserzelle gerechnet (`spotWind`); gelesen werden nur Wind, Böe, Richtung und deren Quantile. Temperatur, Taupunkt, Niederschlag und Regenchance fallen in derselben Rechnung an und werden verworfen |
| Optionale Spalten | `q` je Spot (Phase SU) | Muster für diese Phase: eine Datei ohne die Spalten bleibt gültig, alter Client liest sie nicht |
| Amtlicher Text | `seaText.ts` `parseReport` → `sightWeather` je Seegebiet (FQDL50) und Küstenabschnitt (FQDL51) | liegt geparst vor, wird im Kapitel „Amtlich" gezeigt, aber nicht bei der Stunde |
| Messung der Station | `seaClient.ts` `loadStationObs` (obs/v1, sonst POI über `/_dwd_opendata`; DMI metObs für dänische Spots) | nur Wind, Richtung, Böe. Die POI-Datei trägt auch `horizontal_visibility` |
| Sicht-Diagnose | `src/road/vs/roadVsVis.ts` (§20.12): `hazeVisibilityM` (Feuchte), `precipVisibilityM` (Koschmieder über Regen/Schnee), `fogVisibilityM` (braucht QC der Modellfläche) | Gewichte und Feuchte-Stützen `set`, „calibrated: false"; POI-Sicht war dort nie im Bestand (V-VS-14). Für das Seewetter gibt es kein QC ⇒ nur Feuchte- und Niederschlagsteil |
| Gewitterpotenzial | Repack `runs/<lauf>/thunder-NNN.png` (608 × 373, Grau + Alpha, 0–100 aus `thunderScore`: CAPE × CIN-Deckel + LPI), `cape-NNN.png` (1215 × 746, Grau, J/kg ÷ 4000 · 255) | stündliche Schritte 0–12 (thunder) und 0–27 (cape), neuer Lauf alle 3 h, 4 Läufe liegen im Daten-Repo. `index.json` nennt Lauf, Gitter und Dateien |
| Planer | `seaPlanner.ts` `planFindings`/`planEvents` | Befunde nur aus Stundenwerten; kein Wetter außer Wind |
| Archiv | `sea-archive.mjs` | Spot-Dateien ganz, POI nur `ff dd fx` |

### 1.2 Was fehlt und wie es gebaut wird

1. **Producer:** `spotWind` gibt je Spot zusätzlich die Stundenwerte T, Taupunkt, Niederschlag, Schneeanteil und Regenchance
   (1 − pDry) zurück; ein neues Modul `scripts/sea/sea-sight.mjs` liest Index und Bilder des Repack, tastet `thunder` und
   `cape` an der Wasserzelle ab und bildet die zwei Klassenreihen. Geschrieben als optionale Spalten `s` je Spot (E-SG-2).
2. **Client:** Zeile „Sicht" im Stundenband, Marke in der Zeile „Böen", Karte „Sicht" im Dossier (Messung, amtliche Zeile,
   Hinweis, Schauer-/Gewitter-Hinweis), ein Eintrag im Planer.
3. **Archiv:** Spot-Dateien tragen die Spalten ohnehin; POI-Zeilen bekommen Sicht, Temperatur, Taupunkt, Niederschlag; die
   Sicht der DMI-Stationen eine eigene Tagesdatei.

Nicht angefasst: Fusion-Engine (nur gelesen, wie Phase SU), `roadVsVis.ts` (nur importiert), Repack-Producer, Edge Functions,
Abhängigkeiten.

## 2. Schritt 0 — Messungen (18.11.2026, 19:30–19:45 UTC)

Werkzeug: `scripts/sea/spike/sight-probe.mjs` (`--part=poi,dmi,repack,fusion,pair`), Ergebnisse in
`audit/seewetter-sicht-konvektion/spike/`.

### 2.1 Sicht in den POI-Dateien der Katalog-Stationen

Spalte `horizontal_visibility`, Einheit **km** (Zeile 2 der Datei), stündlich, 25 Zeilen (25 h); die jüngste Zeile war zur
Messung 98 min alt (18:00 UTC um 19:38 UTC).

| | Stationen |
|---|---|
| Katalog (deutsche Spots) | 24 DWD-Stationen |
| Sicht in **allen** 25 Stunden | 21 |
| Sicht in 24 von 25 Stunden | 1 (Elpersbüttel 10130, eine Zeile ganz leer) |
| **keine Sicht** | 2: List/Sylt 10020 (3 Spots), Leuchtturm Alte Weser 10124 (3 Spots; dort auch kein Niederschlag, kein Wetter) |
| Wertebereich | 0,6 km (Putbus) … 75 km (Deckel, drei Stationen) |

Temperatur und Taupunkt: 24 von 24 (Elpersbüttel 96 %). Sechs deutsche Spots haben also keine gemessene Sicht.

### 2.2 Sicht an den DMI-Stationen der dänischen Spots (metObs, letzte 24 h)

| Station | Spot | `visibility` | `visib_mean_last10min` |
|---|---|---|---|
| 06096 Rømø/Juvre | Rømø | 144 Werte, 5,0–50 km | 144, 5,0–50 km |
| 06080 Esbjerg Lufthavn | Fanø | 142, 3,3–75 km | 142, 3,3–50 km |
| 06058 Hvide Sande | Hvide Sande | 144, 5,2–50 km | 144, 6,5–50 km |
| 06119 Kegnæs Fyr | Als Kegnæs | 144, 3,0–50 km | 144, 3,8–46,8 km |
| 06124 Elvira Madigan Airport | Ærø Marstal | 144, 2,3–50 km | 144, 2,4–49,3 km |
| 06138 Langø | Langeland Bagenkop | **0** | **0** |
| 06108 Kolding Lufthavn | Middelfart | **0** | **0** |
| 06149 Gedser | Gedser | **0** | **0** |

Einheit Meter, 10-Minuten-Takt, jüngster Wert 8 min alt. Fünf von acht liefern; genommen wird das 10-Minuten-Mittel.

### 2.3 `thunder` und `cape` eines Laufs an jedem Spot (Repack 2026111815)

| | thunder (0–100) | cape (J/kg) |
|---|---|---|
| Schritte | 0 … 12, stündlich | 0 … 27, stündlich |
| Gitter | 608 × 373 (jede zweite Zelle) | 1215 × 746 (volle Auflösung, Stufe 15,7 J/kg) |
| Wert an den 64 Wasserzellen, alle Schritte | **0 … 1** | **0 … 47** |
| Spots außerhalb des Bilds (Alpha 0) | 0 | — (kein Alpha) |
| größte Abweichung Strand-Lage gegen Wasserzelle | 1 | 16 (eine Stufe) |
| Seekasten 53,3–57,5° N, 6–15° E, alle Zellen | p99 1–2, Maximum 3 | p99 16–63, Maximum 125 |
| ganzes Bild | p99 11–19, Maximum 24–51 | — |

Der Lauf ist eine ruhige Lage: an keinem Spot und in keiner Stunde liegt der Index über 1 oder CAPE über 47 J/kg. **Die
Schwellen der Klassen lassen sich an diesem Lauf nicht messen** — sie sind `set` (E-SG-4) und warten auf Lagen mit Schauern
im Archiv (V-SG-1). Land- und Seezellen: zwischen der Strand-Lage und der Wasserzelle (0,1–2,2 km, bei `cape` höchstens
eine Zelle Unterschied) weichen die Werte um höchstens eine Quantisierungsstufe ab; gelesen wird an der Wasserzelle, wo auch
der Wind gerechnet ist. Alle 64 Spots (auch Hvide Sande) liegen im ICON-D2-Bild.

### 2.4 Diagnose gegen gemessene Sicht an den Küstenstationen

**(a) Die Regel allein** — Diagnose auf den GEMESSENEN Werten derselben Station und Stunde (T, Taupunkt, Niederschlag der
letzten Stunde), 22 Stationen × 25 h = **549 Paare**, alle über +2,5 °C (kein Schnee), 340 davon mit Niederschlag (ein
Regentag — eine Wetterlage, kein Jahr).

Diagnose wie gebaut (`min(Feuchte, Niederschlag)`, Klassen ≥ 10 / 4–10 / < 4 km): **gleiche Klasse in 31,1 %**. Der Grund
ist der Niederschlagsteil:

| Niederschlag letzte Stunde | Stunden | gemessene Sicht Median | unter 10 km | unter 4 km | Diagnose sagt |
|---|---|---|---|---|---|
| 0,01–0,2 mm | 38 | 16,2 km | 32 % | 3 % | 5,8–10 km |
| 0,2–0,5 mm | 68 | 14,1 km | 31 % | 7 % | 2,9–5,8 km |
| 0,5–1 mm | 84 | 12,3 km | 32 % | 5 % | 1,7–2,9 km |
| 1–2 mm | 99 | 12,9 km | 35 % | 8 % | 1,0–1,7 km |
| 2–4 mm | 49 | 12,2 km | 41 % | 8 % | 0,6–1,0 km |

Die Regen-Extinktion der Autobahn-Linie (β = 2,24 · C^0,75) ergibt an der Küste Sichtweiten, die um das 5- bis 15-Fache
unter der Messung liegen; die gemessene Sicht hängt in dieser Lage kaum an der Menge. Der Feuchte-Teil trennt dagegen:

| Taupunktdifferenz (trockene Stunden) | Stunden | gemessene Sicht Median | unter 10 km | unter 4 km |
|---|---|---|---|---|
| unter 0,3 K | 16 | 9,0 km | 63 % | 13 % |
| 0,3–0,6 K | 31 | 12,9 km | 35 % | 6 % |
| 0,6–1,0 K | 35 | 22,0 km | 11 % | 0 % |
| 1,0–2,0 K | 84 | 24–27 km | 0 % | 0 % |
| über 2 K | 43 | 33 km | 7 % | 0 % |

Daraus die Klassenregel des Hinweises (E-SG-5, fünf Varianten gerechnet, gewählt A):

| Klasse des Hinweises | Regel | Stunden | gemessen ≥ 10 km | unter 10 km | unter 4 km |
|---|---|---|---|---|---|
| „gut" | weder Feuchte- noch Niederschlagsteil unter 10 km | 128 | 124 | **3 %** | 0 % |
| „eingeschränkt möglich" | Feuchte- oder Niederschlagsteil unter 10 km | 371 | 263 | **29 %** | 4 % |
| „Nebel möglich" | Feuchte-Teil unter 4 km (Taupunktdifferenz unter 0,32 K) | 50 | 18 | **64 %** | 24 % |

Von den 144 Stunden mit gemessener Sicht unter 10 km tragen 97 % eine der beiden unteren Klassen, von den 26 unter 4 km alle.
Die Klassen sagen also, wo eingeschränkte Sicht vorkommt, nicht, dass sie eintritt: in der mittleren Klasse lag die Sicht in
sieben von zehn Stunden trotzdem über 10 km. Genau so heißen sie.

**(b) Der Hinweis wie gebaut** — dieselbe Regel auf Temperatur, Taupunkt und Niederschlag von buscosun Fusion an den
Stationen: Reihen von 24 Stationen um 19:38 UTC gespeichert (`fusion-stations-2026111819.json`), gepaart mit den Messungen
der Stunden danach. Ergebnis in §5.3.

## 3. Entscheidungen

| Nr. | Frage | Entscheidung | Beleg |
|---|---|---|---|
| E-SG-1 | Schalter | keiner, an für alle | Jan, Auftrag |
| E-SG-2 | Ablage | optionale Spalten `s: { conv, vis }` je Spot in `spots/<lauf>.json` und `spots/<lauf>-w<t1>.json`, dazu ein Block `sight` im Dokument (Repack-Lauf, Reichweiten, Schwellen, Grund bei Ausfall). Kein neues Produkt, kein Zeiger, `schema` bleibt | Muster `q` (Phase SU); der Hinweis entsteht in der Rechnung, die den Wind schreibt („with each wind refresh") |
| E-SG-3 | Weg zum Repack | der Producer liest `index.json` und die 13 + 28 Bilder des neuesten Laufs über `raw.githubusercontent` (≈ 2 MB, nur bei einer Wind-Auffrischung) — **kein Eingriff in `sea.yml`**. Ein Lesefehler oder ein Lauf älter als 12 h ⇒ Spalte `conv` leer mit Grund, der Wind wird trotzdem geschrieben | der Würfel-Checkout des Workflows trägt `runs/` nicht (Sparse), `--wind-check` liest den Würfel-Index schon heute roh; Lehre V-SW-18: nie still `null`, immer ein Grund |
| E-SG-4 | Klassen Schauer/Gewitter | „Gewitter möglich": Index ≥ 30 (Stufe „erhöht" der Wetterkarte) **und** Regenchance ≥ 30 %; „Schauer möglich": (CAPE ≥ 100 J/kg **oder** Index ≥ 8) **und** Regenchance ≥ 30 %; sonst „kein Hinweis". Alle vier Schwellen `set`, benannt in `seaContract.ts`. Stunden jenseits +12 h des Repack-Laufs kennen nur CAPE ⇒ höchstens „Schauer möglich"; jenseits +27 h keine Aussage | §2.3: nicht messbar an einer ruhigen Lage; 30 % = Regen-Kante der Anzeigen (`RAIN_GATE_P`), 8/30 = Stufen von `thunderLevelOf`, 100 J/kg = erster Stützpunkt von `capeScore` |
| E-SG-5 | Klassen Sicht-Hinweis | drei Klassen nach §2.4, Regel A. Der Niederschlagsteil entscheidet nur Ja/Nein unter 10 km, seine Kilometer werden nie gezeigt; „Nebel möglich" kommt allein aus dem Feuchte-Teil; ohne Temperatur oder Taupunkt keine Klasse | §2.4 |
| E-SG-6 | Zelle | nächste ICON-D2-Zelle zur Wasserzelle des Spots, kein Umkreis-Maximum | §2.3; Umkreis = V-SG-2 |
| E-SG-7 | gemessene Sicht | deutsche Spots: POI-Datei der Station über `/_dwd_opendata` (jüngste Zeile mit Sicht, höchstens 3 h alt, `set`); dänische: DMI `visib_mean_last10min`, höchstens 60 min alt (wie der Wind). Älter oder leer ⇒ „keine Daten" | §2.1 (Datei hinkt bis ≈ 100 min), §2.2 |
| E-SG-8 | Archiv | POI-Zeilen um `vv` (km), `tt`, `td`, `rr` erweitert (nur neue Zeilen); DMI-Sicht je Tag in `vis-dmi.json.gz`; die Spot-Dateien tragen `s` ohnehin, der Index nennt sie unter `sight` | Auftrag; mit T/Td/RR lässt sich später trennen, ob ein Fehler aus der Regel oder aus der Eingabe kommt |
| E-SG-9 | Planer | ein Eintrag im Zeitstrahl: die erste Stunde im Fenster mit „Schauer möglich" oder „Gewitter möglich"; reicht der Hinweis nicht bis zur Rückkehr, sagt das eine Zeile der Zusammenfassung | Auftrag |
| E-SG-10 | Daten-Repos | kein Push in dieser Phase nötig (kein Workflow geändert, die Spalten entstehen mit Jans Push von `main` bei der nächsten Wind-Auffrischung, ≤ 3 h) | E-SG-3 |

## 4. Gestaltung (Skill `frontend-design`, im Command-Deck-System)

Farben, Schrift und Raster gibt das Command-Deck vor (Sand/Ink, League Spartan, Tokens `--sw-*`); frei war nur, wie drei
Sichtklassen und eine Marke aussehen. Plan vor dem Bau:

- **Ein gezeichnetes Mittel, der Schleier.** Je weniger ein Hinweis zu sehen erwartet, desto dichter die Zelle: ein
  Haarstrich am unteren Rand für „gut" (freier Horizont), ein halber Schleier für „eingeschränkt möglich", ein dichter für
  „Nebel möglich". Dasselbe Zeichen steht in der Karte neben der Klasse. Ton Dunstgrau-Blau `--sw-sg: #5B6E7E`.
- **Keine Klassenfarbe.** Grün, Bernstein und Rot gehören passt / knapp / außerhalb; die Hinweise ändern diese Urteile nicht
  und sehen auch nicht so aus. Ohne Aussage steht die Schraffur der Seite („keine Daten").
- **Das Band wächst um eine dünne Zeile.** „Sicht" ist eine Balkenzeile wie „Profil" (12 px, im Dossier 16 px). Die Marke
  sitzt in der Ecke der Böen-Zelle (Regenstriche = Schauer, Blitz = Gewitter, Tinte), die Zahl behält ihren Platz.
- **Vier Aussagen verschiedenen Rangs, in dieser Reihenfolge:** gemessen, amtlich, Hinweis, Schauer-Hinweis. Messung und
  Hinweis stehen links und rechts einer gestrichelten Naht (wie die Wassertemperatur), nie in einer Zahl. Die amtliche
  Zeile steht über die ganze Breite, im Satz der anderen amtlichen Texte.
- **Verworfen bei der Durchsicht:** eine gemeinsame Kilometer-Skala für Messung und Hinweis (hätte dem Hinweis eine
  Genauigkeit gegeben, die er nach §2.4 nicht hat) und eine eigene Farbe je Klasse (wäre als Urteil gelesen worden).

Mobil: nur in der Media Query der Seite (`max-width: 767px` bzw. Touch bis 1439 px) — die Naht wird waagerecht, die
Marke 9 px, der Aufklapper 44 px hoch. Der Fuß des Bands bricht jetzt um, wenn seine Hinweise nicht in eine Zeile passen
(`flex-wrap`); vorher liefen sie über den Rand (V-SG-10).

## 5. Umsetzung

### 5.1 Dateien

| Datei | Inhalt |
|---|---|
| `src/sea/seaContract.ts` | Abschnitt „Sight hint and shower/thunderstorm hint": Spalten `s.conv` (0–2) und `s.vis` (0–4), Schwellen `SEA_CONV` und `SEA_VIS`, Regeln `convClassOf` und `visCodeOf`, Wertsperre, Zusammenführen ab der Auffrischungsstunde, Dokumentblock `sight`, `seaConvStale` |
| `scripts/sea/sea-sight.mjs` (neu) | Leser des Repack (`httpRepack` über raw, `dirRepack`), Wahl des Laufs, Abtasten an den Wasserzellen, Regenchance aus der Verteilung von buscosun Fusion, die zwei Spalten je Spot, Block `sight`. Importiert `hazeVisibilityM`/`precipVisibilityM` aus `roadVsVis.ts` |
| `scripts/sea/sea-derive.mjs` | `spotWind` gibt die Fusion-Werte je Spot mit zurück (`sightIn`), `buildRun` und `windRefresh` schreiben `s` und `sight`; `--repack=<Verzeichnis>`, Producer-Schalter `SEA_SIGHT=0` |
| `scripts/sea/sea-archive.mjs` | POI-Zeilen mit `vv tt td rr`, `vis-dmi.json.gz`, Index `sight` |
| `src/sea/seaSightObs.ts` (neu) | Leser der POI-Datei und der DMI-Kennung, ohne Import (Archiv-Workflow, Route-Chunk) |
| `src/sea/seaSight.ts` (neu) | amtliche Zeile, Worte, Regeltexte, Zustand der gewählten Stunde („keine Daten" mit Grund) |
| `src/sea/seaClient.ts` | liest `s` und `sight` (Sperre je Spot), führt die Auffrischung zusammen, `loadStationVisibility` |
| `src/sea/SeaBand.tsx`, `SeaSightPanel.tsx` (neu), `SeaReadout.tsx`, `SeaPage.tsx`, `seaDeck.css` | Zeile, Marke, Karte, drei Zeilen in „Quellen", Verdrahtung |
| `src/sea/seaPlanner.ts` | `PlanFindings.conv`, Eintrag `conv` im Zeitstrahl, eine Zeile der Zusammenfassung |
| `scripts/verify-sea-sight.mjs`, `scripts/lib/fixtures/sea/sight/` | Prüfer und echte Ausschnitte |

### 5.2 Lokaler Producer-Lauf (18.11. 19:49 UTC)

`sea-derive.mjs --wind --data=cdn` auf einer Kopie des Live-Speichers (Lauf 2026111812; in der Kopie den t1-Stempel der
Laufdatei zurückgesetzt, damit die Auffrischung fällig ist — der echte Würfel steht, V-SG-9): Wind an 63 von 64 Spots
(Hvide Sande bekommt seinen Wind vom DMI), **Hinweise an 63 Spots, Schauer/Gewitter aus Repack 2026111818**, 90 s
insgesamt; Index und 40 Bilder des Repack über raw einzeln gemessen 12 s (nacheinander gelesen). Geschrieben
`spots/2026111812-w2026111715.json` mit 56 Spots (der Live-Lauf kennt die dänischen noch nicht): 229 908 B, davon 29 617 B
die Hinweise (gzip 49,1 KB statt 47,0 KB). Inhalt: `conv` 1 456 × „kein Hinweis",
sonst leer (Stunden vor der Rechnung und hinter +27 h); `vis` 2 904 × gut, 1 086 × eingeschränkt möglich (934 davon aus
Niederschlag), 42 × Nebel möglich. Nicht veröffentlicht (E-SG-10).

### 5.3 Der Hinweis wie gebaut gegen die Messung (Schritt 0 b)

`sight-probe.mjs --part=hint`: Reihen von buscosun Fusion an 24 Stationen, gerechnet 19:38 UTC, gegen die POI-Zeilen von
19:00 UTC (um 20:25 UTC die jüngsten; die Datei hinkt 86–98 min). **22 Paare, alle in der Stunde der Rechnung.**

| Hinweis | Stunden | gemessen ≥ 10 km | 4–10 km | < 4 km |
|---|---|---|---|---|
| „gut" | 17 | 15 | 2 | 0 |
| „eingeschränkt möglich" | 5 | 4 | 0 | 1 |
| „Nebel möglich" | 0 | — | — | — |

Taupunktdifferenz von buscosun Fusion minus gemessene: Median **+1,13 K** (p10 +0,52, p90 +1,77). Die Rechnung ist an den
Stationen trockener als die Messung; die Grenzen des Feuchte-Teils liegen bei 0,95 K und 0,32 K, also spricht er kaum an.
Zwei der drei Stunden mit gemessener Sicht unter 10 km trugen „gut". Das sind 22 Paare einer Stunde an Land — über dem
Wasser (wo die Seite rechnet) ist nichts gemessen. Die Seite nennt diese Zahlen (`VIS_CHECK_NOTE`), der Prüfer bindet sie
an `hint-check.json`.

## 6. Gate

| Prüfung | Ergebnis |
|---|---|
| `verify:sea-sight` | **76/76** — Klassenregeln an den Schwellen, Schwellen an ihren Konstanten, Fixtures byte-genau (SHA-256), Wert an der Zelle gegen eine unabhängige Dekodierung mit zwei Negativkontrollen, Stunden vor/in/hinter der Reichweite, fehlende Bilder, Skalen-Drift, alter Lauf, unlesbarer Index, Station ohne Sicht, Einheit ≠ km, nie ein alter Wert, amtliche Zeile wörtlich, Planer, Klassen unberührt, Worte, Markup von Band und Karte ohne Browser, Archiv |
| bestehende `verify:sea-*` | contract 30/30 · decode 13/13 · text 35/35 · derive 70/70 · waterlevel 63/63 · tide-window 49/49 · wind-band 41/41 (Band auf einer alten Datei weiter byte-gleich zu HEAD) · planner 46/46 · dk 70/70 · current 108/108 · watertemp 136/136 · seo 23/23 |
| `verify:sea-ui` | **nicht gelaufen** — Browser-Prüfer (Jans Entscheidung: keine Browser-Checks; bricht an HEAD ohnehin in B0 ab, V-TF-5) |
| lokaler Producer-Lauf | §5.2 |
| `typecheck`, `build`, `budget` | im sauberen Baum (zuletzt der Index des Commits per `git checkout-index`, `node_modules` als Junction): typecheck grün, build grün (280/280), budget grün nach Anhebung: totalJs **2 009,2** (drei Baue davor 2 009,0 bis 2 009,4; HEAD im selben Verfahren gemessen 2 003,4 ⇒ **+5,8 KB gzip**: SeaPage 73,4 → 78,1, SeaRoute 15,6 → 16,9), Grenze von Hand 2 004 → 2 010 mit Notiz; eagerJs 114,6, eagerCss 2,4, largestChunk 278,4 unverändert |
| im Arbeitsbaum | `typecheck` war dort um 20:10 UTC rot in `src/sources/repackSource.ts` (Zeilen 576/577) — eine fremde Linie (RN-2) änderte die Datei gerade, uncommitted — und am Ende der Sitzung wieder grün. Deshalb die Gates im sauberen Baum |

Selbstverifikation: (1) Funktionserhalt — das Band ohne `sight` ist byte-gleich zu HEAD (`verify:sea-wind-band` E1), die
Windspalten der Datei sind die der Rechnung (E3), Urteile unverändert (I3), alte Dateien werden gelesen wie bisher (F1).
(2) Desktop pixelgleich, (3) Touch-Ziele am Gerät, (4) Konsole, (5) Long Tasks: **nicht gemessen** (kein Browser, Jans
Entscheidung). Aus dem Code: neue Zeile und Karte kommen dazu, der Fuß des Bands kann umbrechen (V-SG-10).

Pushes in die Daten-Repos: **keine** (E-SG-10).

## 7. Offene Punkte (V-SG)

| Nr. | Befund | Mehrwert | Skizze |
|---|---|---|---|
| V-SG-1 | Schwellen für Schauer und Gewitter sind gesetzt; der Messtag war ruhig (Index ≤ 1, CAPE ≤ 47 J/kg an allen Spots) | der Hinweis wird belegbar statt geschätzt | nach den ersten Schauerlagen aus dem Archiv: Klasse je Stunde gegen `present_weather` der POI-Dateien und die Blitze des Radar-Spiegels; Schwellen danach `measured` |
| V-SG-2 | gelesen wird die eine Zelle am Spot; Schauer treffen selten genau sie | weniger verpasste Schauer | Maximum im Umkreis (≈ 10 km), nur Wasserzellen; an denselben Lagen wie V-SG-1 messen |
| V-SG-3 | Hinweis mit Vorhersagewerten nur an 22 Stationsstunden geprüft; buscosun Fusion dort 1,1 K zu trocken ⇒ „Nebel möglich" zu selten | eine Zahl, die den Namen verdient; ggf. Grenzen des Feuchte-Teils auf die Vorhersage zuschneiden | `sea-gate-d.mjs` um Sicht erweitern: `s.vis` der Spot-Dateien gegen `vv` in `poi.json.gz` (Spot ↔ Station ≤ 10 km), nach 14 Tagen; `tt/td` daneben trennt Regel und Eingabe |
| V-SG-4 | Regen-Teil von `roadVsVis.ts` (β = 2,24 · C^0,75) rechnet an der Küste 5–15-mal zu kurze Sicht | betrifft auch die Sicht des virtuellen Fahrbahnsensors (Zweig AW-6.2) | an die Autobahn-Linie: gegen CDC-Stundensicht prüfen (V-VS-15), bevor P(V < x) angezeigt wird. Modul hier nicht geändert |
| V-SG-5 | List/Sylt und Leuchtturm Alte Weser melden keine Sicht (6 Spots), drei DMI-Stationen auch nicht (Langø, Kolding, Gedser) | gemessene Sicht an allen Spots | nächste Station MIT Sicht als zweite Wahl, mit ihrer Entfernung (Muster E-WL-10) |
| V-SG-6 | die POI-Datei hinkt 86–98 min und läuft je Spotwechsel über `/_dwd_opendata` (7 KB) | frischerer Wert, ein Abruf weniger | Sicht in `obs/v1` aufnehmen (10-min-Werte des DWD), dann `obsStore` wie beim Wind |
| V-SG-7 | Hvide Sande (Wind vom DMI) hat keine Hinweise | Lücke an einem Spot | DMI HARMONIE trägt Temperatur, Taupunkt, Niederschlag; ICON-D2 deckt den Ort ab |
| V-SG-8 | die Hinweise entstehen nur bei einer Windrechnung; ein neuer Repack-Lauf allein löst keine aus | der Gewitter-Hinweis wäre nie älter als 3 h | zweiter Auslöser in `--wind-check`: Repack-Lauf neuer als `sight.conv.run` |
| V-SG-9 | **t1-Würfel steht:** `point/index.json` nennt für t1 seit dem 17.11. 15 UTC den Lauf 2026111715 (t2 2026111812), der Workflow `point` endet grün; `status.wind` der Seelinie ist vom 17.11. 17:38 UTC | Wind am Spot (und die Hinweise) werden nur noch zweimal täglich mit dem Wellenlauf gerechnet statt alle 3 h; die Kurzfrist von buscosun Fusion überall ruht auf einem 29 h alten t1 | Punkt-Cron ansehen (nicht diese Phase): warum t1 nicht veröffentlicht wird, obwohl der Lauf grün ist |
| V-SG-10 | der Fuß des Stundenbands bricht jetzt um | keine abgeschnittenen Hinweise | Sichtprüfung auf der Karten-Bühne bei 1440 px mit Strom-, Pegel- und Planer-Zeile |
| V-SG-11 | `verify:sea-sight` steht nicht in `.github/workflows/ci.yml` | Regressionen fallen in CI auf | eine Zeile hinter „Verifier — Wassertemperatur" (Workflows von `buscosun-web` nicht angefasst) |
| V-SG-12 | Schneefall: der Niederschlagsteil nimmt den Schneeanteil `pSnow` von buscosun Fusion; ungeprüft (Messtag über +2,5 °C) | im Winter stimmt die Klasse | mit V-SG-3 im Dezember/Januar auswerten |
