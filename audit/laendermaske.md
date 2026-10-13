# Phase LM — Ländermaske ohne Lücken (Liechtenstein, Grenznähte, Bodensee)

> Stand 2026-10-13. Auftrag (Jan, 13.10.): „prüfen, dass die Wetterkarte und das Regenradar an den Grenzregionen keine
> leeren Felder zeigen. Meine Entscheidung ist, einfach Liechtenstein anzuzeigen, ohne es wegzuschneiden." Kürzel **LM**.

## 1 Diagnose

### 1.1 Wo die Maske entsteht

Die Wetterkarte (`MapView.tsx`, `addCountryMask` ab Zeile ≈ 1359) legt eine **deckende** Sandfläche (`#E0D6BE`,
`fill-opacity: 1`) über alles außerhalb von DE ∪ AT ∪ CH. Die Fläche ist EIN Polygon: Weltring als Außenring, die Ringe von
`public/countries/{DE,AT,CH}.geojson` als Löcher (`countryMask.ts`, `loadDachMask()`). Alle Datenschichten außer Wind werden
mit `beforeId = firstBoundaryLayerId` **unter** diese Maske gelegt (Temperatur, Böen, Gewitter, Schnee, Niederschlag,
Komposit, HD-Radar, 250 m, Wolken, Schleier). Das Regenradar zeichnet auf derselben `MapView` (Profil `radar`), die alte
Radarkarte (`?rr=legacy`, `radar/RadarMap.tsx`) und die Brandkarte (`fire/FireMap.tsx`) laden dieselbe `loadDachMask()`.

Die drei Umrisse stammen aus Nominatim (`polygon_threshold=0.01`, ≈ 1 km Vereinfachung) und sind **je Land einzeln**
vereinfacht. Die gemeinsame Grenze zweier Länder liegt deshalb in den beiden Dateien an verschiedenen Stellen.

### 1.2 Messung am Geojson (`scratchpad/dach-gaps2.mjs`, `area.mjs`, 13.10.)

| Befund | Wert |
|---|---|
| Liechtenstein (Vaduz, Schaan, Balzers, Ruggell, Malbun, Triesenberg) in DE/AT/CH | **nein** — in keinem Ring, also Sand |
| Lücke zwischen CH-Ostrand und AT-Westrand auf Liechtenstein-Breite | 4,1 … 9,9 km |
| Nahtlücke (kein Land, zwei Länder < 3 km) entlang AT–CH / AT–DE / CH–DE | 23 / 21 / 36 km Grenzlänge, max. ≥ 3 km breit (Rheintal, Bodensee) |
| Fläche der Nahtlücken (ohne Liechtenstein, ohne Bodensee-Mitte) | ≈ 69 km² |
| Überlappung (Punkt in ZWEI Ringen ⇒ Even-Odd füllt wieder = Sand auf Land) | ≈ 22 km² (DE–CH 12, DE–AT 7, AT–CH 2) — Schaffhausen, Salzburg |
| Bodensee | in keinem Umriss (Kondominium) ⇒ Sand |

### 1.3 Bildbeweis (Dev-Server 5199, headless CDP, 1440 × 900, `scratchpad/shots/`)

| Bild | Befund |
|---|---|
| `wk-li-temp.png` Wetterkarte z9,5 um Vaduz | Liechtenstein komplett Sand, ohne Basiskarte; dazu Sandkeil im Rheintal bis Klosters |
| `wk-li-z8.png` z8 | Liechtenstein, Bodensee und ein Sandstreifen Lindau–Oberstaufen (DE–AT-Naht) |
| `wk-bodensee-temp.png` z9 | Bodensee als Sandfläche, Rheinmündung bis Götzis als Sandkeil |
| `wk-schaffhausen-temp.png` z10 | Kanton Schaffhausen / Hegau teils Sand (Überlappung DE–CH, Even-Odd) |
| `wk-salzburg-temp.png` z10 | Sandkeil nördlich Salzburg (Überlappung DE–AT) |
| `rr-vaduz.png` Regenradar Vaduz | **die ganze Kartenfläche ist Sand**, nur die Nadel sichtbar |
| `rr-bregenz.png` Regenradar Bregenz | Bodensee + Rheintal Sand; Radar-Echos bei Rorschach außerhalb sichtbar |

### 1.4 Was NICHT die Ursache ist

- Das Radar hat Daten über Liechtenstein: `fastCountryPicker` (HD-Besitzmaske, = `pickCountry`) gibt Vaduz/Balzers/Ruggell
  **CH**, Bodensee-Mitte **DE** — das rzc-Gitter wird dort gezeichnet, liegt aber unter der Maske.
- Die Komposit-/HD-Pfade, `countryBorders.ts` und buscosun Fusion sind nicht betroffen. `stackCountryOf('LI') = 'CH'`
  und `obsCountriesOf('CH') = ['CH','LI']` behandeln Liechtenstein bereits als Teil des Schweizer Netzes.

### 1.5 Ursache (Wurzel)

Drei unabhängig vereinfachte Landesumrisse als Even-Odd-Löcher in einer deckenden Fläche: jede Lücke zwischen zwei Ringen
und jede Überlappung zweier Ringe wird Sand; ein viertes Land und ein Kondominium fehlen ganz. V-HD-4 (Campione) war
derselbe Mechanismus.

## 2 Entscheidung

**E-LM-1 (Jan, 13.10.):** Liechtenstein wird gezeigt, nicht weggeschnitten. Daraus folgt für die Maske: die Fläche
DE ∪ AT ∪ CH ∪ LI wird als EIN aufgelöster Umriss (Vereinigung) maskiert, Innenlöcher der Vereinigung (Bodensee, Nahtlücken,
Enklaven) werden gefüllt — es gibt keine „Felder" mehr zwischen den Ländern.

## 3 Plan

1. `public/countries/LI.geojson` — Nominatim-Umriss Liechtenstein (OSM-Relation 1155955, `polygon_threshold=0.01`,
   13 Stützpunkte), gleiches Dateiformat wie DE/AT/CH.
2. `scripts/gen-dach-mask.mjs` — Rasterverfahren ohne Abhängigkeit: Scanline-Rasterung der vier Umrisse auf 0,002°,
   Flood-Fill von außen (alles nicht Erreichbare ist innen ⇒ Löcher gefüllt), Kantenverfolgung der Außenkonturen,
   Douglas–Peucker 0,002°, Ausgabe `public/countries/DACH.geojson` (MultiPolygon, nur Außenringe; Inseln bleiben eigene Ringe).
3. `src/countryMask.ts` — `loadDachMask()` lädt `DACH.geojson`; Rückfall `?mask=legacy` = der alte Drei-Ringe-Bau
   (Regel 2, benannter Rückfall). Alle drei Aufrufer (Wetterkarte, Regenradar/alte Radarkarte, Brandkarte) folgen.
4. `scripts/verify-dach-mask.mjs` (`verify:dach-mask`) — Punkte innen/außen, Teilmengen-Eigenschaft, Reproduzierbarkeit des
   Generators, Schalter-Grammatik.
5. Gates: typecheck, build, budget, verify:dach-mask, verify:fusion-release (C6), Bildbeweis an denselben Stellen.

## 4 Umsetzung (13.10., uncommitted)

| Datei | Änderung |
|---|---|
| `public/countries/LI.geojson` (neu) | Nominatim OSM-Relation 1155955, `polygon_threshold=0.01`, 14 Stützpunkte, Format wie DE/AT/CH |
| `scripts/gen-dach-mask.mjs` (neu) | Scanline-Rasterung 0,001° (≈ 70–110 m) der vier Umrisse, Flood-Fill von außen, Kantenverfolgung (Innenseite links), Douglas–Peucker 0,002°; `--check` = Byte-Vergleich mit der Datei. 5,7 s, 64 M Zellen |
| `public/countries/DACH.geojson` (neu) | 2 Außenringe (Festland + Helgoland), 1 162 Punkte, 18 KB; 27 km² Innenlöcher gefüllt (Nähte, Jungholz, Büsingen, Campione, Bodensee-Nähte). Die Vennbahn-Taschen (DE, ≈ 100 m breit) verschmelzen mit dem Festland — bei 0,002° verloren sie jede Zellmitte (verify C1) |
| `src/countryMask.ts` | `loadDachMask()` lädt `DACH.geojson` (Außenringe als Löcher im Weltring); `dachMaskLegacyFrom('?mask=legacy')` oder ein fehlgeschlagener Abruf ⇒ die drei Einzelumrisse wie vorher (Konsolenwarnung). `ringsOfFeature` exportiert |
| `scripts/verify-dach-mask.mjs`, `package.json` | `verify:dach-mask` A1–E2 (s. u.) |

Nicht geändert: `MapView.tsx` (gleiche Ebene `country-mask-fill`, gleiche Schichtreihenfolge), `fire/FireMap.tsx`,
`radar/RadarMap.tsx` (rufen `loadDachMask()` unverändert), `countryBorders.ts`/`pickCountry`, HD-Besitzmaske, Producer.

### 4.1 Gate (13.10.)

| Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` | grün |
| `npm run build` + `npm run budget` | grün — eagerJs 109,9/110 KB, largestChunk 278,4/302 KB, totalJs 1 768/1 772 KB (unverändert, nur `public/`) |
| `verify:dach-mask` | **11/11**: A1 Datei = Neuerzeugung · A2 nur Außenringe · A3 geschlossen/CCW · A4 Mitglieder + LI · B1 13 Punkte innen (Vaduz, Balzers, Ruggell, Malbun, Bodensee, Rheintal-Naht, Schaffhausen- und Salzburg-Überlappung, Büsingen, Helgoland, Bregenz, Basel, Konstanz) · B2 7 Nachbarstädte außen · C1 Obermenge 1 698 Quellpunkte 300 m einwärts (Generator-Toleranz; Vennbahn-Spitze liegt < 300 m am Rand) · D1 241/241 Überlappungspunkte innen · D2 221/291 Nahtpunkte innen, die 70 offenen liegen ausnahmslos in den Bins der Dreiländerecken Nauders (23), Passau (24), Basel (23) · E1 Schalter-Grammatik · E2 Client-URL = Datei |
| `verify:fusion-release` | 30/30 (C6 liest `public/countries` weiter unverändert) |
| Bildbeweis `audit/laendermaske/` | `nachher-wetterkarte-liechtenstein.png`: Vaduz/Schaan/Triesen mit Basiskarte und Wind · `nachher-regenradar-vaduz.png`: Karte statt Sand · `nachher-wetterkarte-bodensee.png`: See durchgehend · `nachher-wetterkarte-schaffhausen.png`: Hegau/Schaffhausen ohne Sand · `nachher-wetterkarte-uebersicht.png`: DACH-Übersicht mit Liechtenstein-Beschriftung · `nachher-mask-legacy-liechtenstein.png`: `?mask=legacy` = Vorher-Bild |

### 4.2 Selbstverifikation

1. **Funktionserhalt:** jede Fläche, die die drei Einzelumrisse zeigten, zeigt die Vereinigung weiter (C1); Alt-Bild per
   `?mask=legacy` (E1, Bildbeleg). Brandkarte und alte Radarkarte nutzen dieselbe Funktion, kein eigener Pfad.
2. **Desktop pixelgleich:** nicht pixelgleich und nicht gewollt — die Maske ändert sich genau dort, wo Sand lag; außerhalb
   der Nähte liegt der Rand ≤ 0,002° (≈ 150–220 m) neben dem alten (DP-Toleranz).
3. **Touch-Targets:** keine UI-Änderung.
4. **Konsole:** der neue Pfad warnt nur beim Rückfall; die Nachher-Bilder zeigen die aufgelöste Maske, also keinen Rückfall.
   Eine Konsolenaufzeichnung aus dem Headless-Lauf liegt nicht vor (der Shooter liest keine Konsole) — V-LM-6.
5. **Long Tasks:** die Maske ist dieselbe `fill`-Ebene mit weniger Stützpunkten (1 162 statt 1 716); ein Abruf (18 KB)
   statt drei (40 KB). Nicht gemessen.

## 5 Befunde (D-28)

- **V-LM-1** Die Flächensummen (`scripts/precipsum/precipsum-derive.mjs`, Maske „Zellmitte in DE, AT oder CH") lassen
  Liechtenstein-Zellen aus. Mehrwert: Summenkarte ohne Loch bei Vaduz. Skizze: LI.geojson in die Sparse-Liste und die
  Maskenliste des Producers aufnehmen (Daten-Repo-Workflow, Jans Gate).
- **V-LM-2** Die Vereinigung füllt auch Enklaven, die kein DACH sind (Campione d'Italia in CH) — sichtbar als normale
  Fläche. Mehrwert: kein Even-Odd-Artefakt mehr (V-HD-4). Nachteil: ein italienischer Ort bekommt DACH-Daten gezeigt; das
  ist bei 2,6 km² vertretbar und ehrlicher als ein weißes Dreieck.
- **V-LM-3** Nominatim liefert Liechtenstein mit 13 Stützpunkten (Vereinfachung 0,01°); seine Außengrenze deckt sich nicht
  mit den AT/CH-Ringen — nur die Vereinigung mit Lochfüllung macht das unsichtbar.
- **V-LM-4** Dreiländerecken mit Nicht-DACH-Nachbarn (Basel DE–CH–FR, Passau DE–AT–CZ, Nauders AT–CH–IT) behalten kleine
  Kerben, weil die Lücke dort nicht umschlossen ist. Skizze: die vier Umrisse vor der Rasterung um ≈ 0,5 km nach außen
  puffern, nur an diesen drei Ecken.
- **V-LM-5** Der Wind-Layer liegt bewusst ÜBER der Maske und läuft bis in die Nachbarländer (Altstand) — kein Thema dieser Phase.
- **V-LM-6** `scripts/lib/headlessShot.mjs` liefert keine Konsole; für Gate-Frage 4 fehlt damit der Beleg aus dem
  Headless-Lauf. Skizze: `Runtime.consoleAPICalled` im Shooter mitschneiden und als Teil der `probe`-Antwort zurückgeben.
- **V-LM-7** Die Vennbahn-Taschen (fünf DE-Flächen ≈ 0,5 km² bei Aachen) verschmelzen im Raster mit dem Festland, weil der
  belgische Bahnstreifen schmaler als eine Zelle ist — korrekt gezeigt, aber der belgische Streifen dazwischen auch.
