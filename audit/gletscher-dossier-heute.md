# Phase DK-H — Dossier-Ebene „Heute": Stationen in der Dossier-Karte (Desktop + Mobil)

Stand 22.11.2026. Auftrag: Jan, Vorlage „Variante B · Desktop · Heute mit Karte" und „Variante B · Mobil · Heute mit Karte"
(https://claude.ai/artifact/Fiuk3MwVPBJ4Kr7Xp8HjKr, Boards `D1b-Heute-Karte`, `M1b-Heute-Karte`). Ohne Schalter, an für alle.
Keine Sichtprüfung durch mich (Jans Vorgabe: er prüft das Aussehen selbst).

## 1 Diagnose (vor dem Code)

**Wo die Teile heute stehen**

- Dossier = `GlacierBrief.tsx` mit `layout="dossier"`, drei Ebenen (`LEVELS`). Die Kartenkarte (`gl-ds-mapcard`: Werkzeugleiste,
  `GlacierSheetMap`, Legende, Copernicus-Link) steht NUR auf der Ebene Heute. Darunter rendert `GlacierHeuteBoard` in dieser
  Reihenfolge: Kopf · Schmelzindex + drei Kacheln · `weatherCard` (= „Wetter am Gletscher" + „Gemessen in der Nähe") ·
  14-Tage-Schmelzbalken + Satellit · Tour. Quellen stehen nur auf der Ebene Langzeit (eingeklappt).
- Die Karte (`GlacierSheetMap.tsx`) rahmt in `fit()` nur den Umriss (`bboxOf(geometry)`, Innenabstand 48 px); 3D rechnet
  eigene Kameras mit `cameraForBounds` (gekippt mit −0,45 Zoom, zurück auf 2D flach). Gated im Dossier: kein Zoom/Pan, bis
  vergrößert. Ebenen-Knöpfe „Umriss ‹Jahr›" und „Schneegrenze" in `gl-ds-layers`, Zustand in der URL (`e`).
- Stationen: `GlacierStationCard.tsx` lädt Zuordnung (`loadStationMap`) und Slot (`loadStationHour`) und rendert
  `GlacierStationBlock` aus `stationView()` (`glacierStationView.ts`). `StnViewStation` trägt Name, Höhe, Netz, Betreiber, Abstand
  `km` (seit GI vom UMRISS, Abschnitt `ext`), `dz` (Station − Median), Alter `ms`, Werte — aber **keine Koordinaten**, obwohl die
  Zuordnung sie je Station trägt (`StnMapStation.lat/lon`). Für die Karte reicht also eine Zeile mehr in der Sicht; **keine neue
  Quelle, kein neuer Abrufweg**: dieselben zwei Dateien, derselbe Leser.
- Auf der Seite `/gletscher/<slug>` (`layout="page"`) steht dieselbe Stationskarte im Reiter Heute; diese Phase ändert dort nur die
  Betreiber-Zeile (Punkt 7).

**Messung an der echten Zuordnung** (`glacier/v1/stn/map/20261120-1.3.json`, gelesen 22.11. ≈ 10 UTC): Großer Aletschgletscher →
Jungfraujoch (MeteoSchweiz, 0,1 km, +424 m; t/wind/gust/rad) und Flesch (`imis:EGH2`, 1,9 km, −647 m; snow). Betreiberwort des SLF
in der Datei: „WSL-Institut für Schnee- und Lawinenforschung SLF" — ohne Punkt, ohne Leerzeichen am Rand.

**Punkt 7, „. ." vor dem SLF-Link:** Die Zeile wird in `Station` aus drei Stücken geklebt: `‹Abstand›, ‹Höhe›.{' '}‹Link›.` — der
Satz endet mit einem Punkt, dann kommt der Betreiber als Link, dann wieder ein Punkt. Ohne Browser gerendert (react-dom/server)
steht dort korrekt „… des Gletschers. <a>WSL-Institut … SLF</a>." — die Doppelung entsteht also nicht in den Daten, sondern dort,
wo der Link im Fließtext nicht als Wort gelesen wird (umbrechender oder nicht sichtbarer Link ⇒ es bleiben die zwei Punkte
um ihn herum stehen). Behebung an der Wurzel: der Betreiber steht nicht mehr im Satz, sondern in einer eigenen Zeile
„Betreiber: ‹Name›" ohne angeklebte Satzzeichen; der Prüfer rendert die Zeile für jedes Netz und verlangt, dass weder „. ." noch
„.." noch „ ." darin steht (mit Gegenprobe auf die alte Klebung).

**Was fehlt für die Vorlage**

1. Koordinaten in `StnViewStation` (aus der Zuordnung).
2. Der nächste Punkt des UMRISSES zu jeder Station (für die gestrichelte Linie) — der Umriss der Karte ist die Stufe L3 der Seite,
   die Zuordnung rechnete auf L1. Die Linie beginnt am nächsten Punkt des gezeichneten Umrisses; die Zahl an der Linie ist der Abstand
   der Zuordnung (`km`), damit Karte, Liste und Text dieselbe Zahl tragen.
3. Ein Rahmen „Umriss + alle Stationen" mit Innenabstand für die Wertekarten.
4. Drei Passungs-Striche je Station (Nähe, Höhe, Aktuell) als reine Regel mit Konstanten.
5. Liste neben der Karte, Höhenstreifen, Auswahl Liste ⇄ Marker; mobil Blatt unter der Karte.
6. 3D: Marker auf dem Gelände mit senkrechter Linie.

## 2 Plan

- **Rein (DOM-frei), neu `src/glacier/glacierStationMap.ts`:** `stnMatch()` (Striche mit Grenzen `set`), `stnBest()` (gefüllter
  Marker), `stnMainValues()` (1–3 Hauptwerte der Wertekarte), `nearestOnOutline()` (nächster Punkt des Umrisses in der lokalen
  Ebene, wie `stnOutlineKm`), `heuteFrame()` (Rahmen Umriss ∪ Stationen + Innenabstand), `stnLines()` (GeoJSON der Linien).
- **Laden:** Hook `useStationView()` aus `GlacierStationCard.tsx` (derselbe Ladeweg wie die Karte bisher); die Karte der Seite benutzt
  ihn ebenfalls, damit es nur EINEN Weg gibt.
- **Karte:** `GlacierSheetMap` bekommt einen optionalen Rahmen (`frame`: Punkte + Innenabstand), den `fit()` und beide 3D-Kameras
  benutzen; ohne `frame` alles wie bisher. Die Stationsebene selbst lebt im Lazy-Chunk `GlacierStationsHeute.tsx`: eine
  GeoJSON-Linienebene (gestrichelt, `line-dasharray`) und DOM-Marker (`maplibregl.Marker`) für Nummer, Wertekarte und
  Abstandsschild — kein Shader, keine eigene WebGL-Ebene. MapLibre setzt Marker bei gesetztem Gelände auf die Geländehöhe; in 3D
  trägt der Marker eine senkrechte Linie vom Boden zur Nummer und das Schild „‹n› m über/unter der Mitte".
- **Ebenen-Knopf „Stationen"** neben „Umriss" und „Schneegrenze", in Heute an (Zustand der Sitzung, nicht in der URL — die URL-Form `e`
  bleibt unverändert). Aus ⇒ keine Marker, keine Linien, Rahmen wie heute.
- **Reihenfolge unter der Karte (nur Ordnung und Größe):** Kopf · Wetter am Gletscher (Modell an drei Höhen, darin die Tage) ·
  Schmelze und Frost (Schmelzindex, Kacheln, 14-Tage-Balken, Satellit; im Winter kleiner) · Tour · Quellen (eingeklappt, dieselbe
  Quellenliste wie in Langzeit). „Gemessen in der Nähe" wandert vollständig in Liste und Blatt.
- **Mobil** (dieselbe Media Query wie das übrige Dossier: `(max-width: 767px), (max-width: 1439px) and (pointer: coarse)`): Karte
  volle Breite mit Nummer und EINEM Wert je Station; Antippen öffnet das Blatt unter der Karte mit allen Werten und Strichen, die übrigen
  Stationen als Zeilen darunter; Ebenen-Chips scrollen waagrecht; jede Trefferfläche ≥ 44 px.

## 3 Entscheidungen (E-DKH)

- **E-DKH-1 (Jan, Auftrag):** ohne Schalter an für alle; Vorlage Variante B.
- **E-DKH-2 (`set`, Jan im Auftrag):** Striche — Nähe ≤ 1 km drei, ≤ 3 km zwei, ≤ 5 km einer; Höhe innerhalb der Höhenspanne des
  Gletschers drei, ≤ 300 m außerhalb zwei, sonst einer; Aktuell < 1 h drei, < 3 h zwei, älter einer (älter als drei Stunden wird schon
  verworfen; genau drei Stunden zeigt die Seite noch); ohne gezeigten Wert null.
- **E-DKH-3 (meine Wahl, offen für Jan):** „beste Station" = größte Summe der Striche, bei Gleichstand die nähere — gefüllter Marker.
- **E-DKH-4 (meine Wahl):** der Ebenen-Knopf „Stationen" ist ein Zustand der Sitzung, kein URL-Teil.
- **E-DKH-5 (meine Wahl):** „im Winter kleiner" = November bis April (`set`), nur die Größe der Schmelz-Zeile ändert sich.

## 4 Umsetzung (22.11.2026)

| Datei | Was |
|---|---|
| `src/glacier/glacierStationMap.ts` (neu, rein) | Striche `stnMatch` mit `STN_MATCH_NEAR_KM` = 1/3/5 km, `STN_MATCH_DZ_M` = 300 m, `STN_MATCH_AGE_MS` = 1 h/3 h (alle `set`); `stnBest`; `stnMainValues` (Reihenfolge Temperatur, Wind, Böe, Schneehöhe, Niederschlag, Strahlung; höchstens drei; die Änderung der Schneehöhe nie auf der Karte); `nearestOnOutline` + `stnLines` (Linie vom nächsten Punkt des Umrisses, Zahl = Abstand der Zuordnung; keine Linie unter 0,05 km oder auf dem Eis); `heuteFrame` + `HEUTE_FRAME_PADDING`; `isHeuteWinter` (November–April) |
| `glacierStationView.ts` | `StnViewStation.lat/lon` aus der Zuordnung; der Satz „Betreiber: …“ in `stationViewTexts` |
| `GlacierStationCard.tsx` | Hook `useStationView` = der eine Ladeweg (Zuordnung, dann Slot nur für einen Gletscher mit Station), von der Karte des Steckbriefs und vom Dossier benutzt; `StnOperator` (eigene Zeile „Betreiber: ‹Name›“, Punkt 7); Kleingedrucktes und Quellenzeile als `StnFinePrint` / `StnSources` |
| `GlacierSheetMap.tsx` | optionaler Rahmen `frame` (Box + Innenabstand) für `fit()`, die gekippte 3D-Kamera und den Rückweg auf 2D; Innenabstand wird auf die Bildgröße gestutzt (`fitPadding`); neuer Rahmen ⇒ neu einpassen; ohne `frame` alles wie bisher |
| `GlacierStationsHeute.tsx` + `glacierStations.css` (neu, Lazy-Chunk) | GeoJSON-Linie (dunkler Saum + weiße Strichelung), DOM-Marker mit Portal (Nummer: gefüllt = beste Station, Ring = übrige; Wertekarte; mobil eine Wert-Pille; in 3D Stiel 46 px vom Bodenpunkt), Abstandsschilder; Liste mit allen Werten, „Keine Daten“ mit Grund, Strichen, Abstand und Höhe in Worten, Betreiber; Höhenstreifen; Kleingedrucktes und Quellen je Netz; mobil das gewählte Element als Blatt (Griff, „Schließen“), die übrigen als Zeilen |
| `GlacierBrief.tsx` | Dossier: Hook, Ebenen-Knopf „Stationen“ (ab Werk an, aus ⇒ keine Marker und Rahmen wie bisher), Rahmen nur auf Heute, Raster Karte + Liste, Legendenzeilen, ein Satz ohne Station; „Gemessen in der Nähe“ nicht mehr unter dem Modell; Quellen eingeklappt am Ende von Heute |
| `GlacierHeuteBoard.tsx` | Reihenfolge Wetter am Gletscher → Schmelze und Frost → 14 Tage + Satellit → Tour → Quellen; `is-winter` macht die Schmelz-Zeilen kleiner (Inhalt gleich) |
| `glacierSheet.css` | Raster, Nummernkreis der Legende, Winter-Größe, Betreiber-Zeile; mobil: Raster als Block, Ebenen-Chips scrollen waagrecht |
| `scripts/verify-glacier-dossier-heute.mjs` (neu) + Fixture `dossier-heute-extract.json` | 21 Prüfungen auf echtem Auszug (Zuordnung `20261120-1.3`, Slot `2026112209`) |
| `scripts/verify-glacier-stations.mjs` | G6 (Betreiber in eigener Zeile) und G9 (im Dossier über den Hook, Karte nur im Blatt) an die neue Form angepasst |
| `budget.json` | totalJs 2 103 → 2 109 mit Notiz |

## 5 Gate (22.11.2026)

| Prüfung | Ergebnis |
|---|---|
| `verify:glacier-dossier-heute` | **21/21**; Gegenproben: drei eingebaute Fehler (Rahmen ohne Stationen, Linie nicht vom Umriss, Kante 1 km mit `<`) machen je genau B1, C1, D1 rot, Datei danach byte-gleich zurück |
| `verify:glacier-stations` | **77/77** (vorher 75/77 im halb umgebauten Baum — G6/G9 prüften die alte Klebung bzw. Einbindung) |
| `verify:glacier-contract` 64/64 · `-static` 7/7 · `-publish` 34/34 · `-sat` 28/28 · `-melt` 41/41 · `-weather` 33/33 · `-sheet` 45/45 · `-feed` 22/22 · `-hugonnet` 41/41 · `-snow` 37/37 | grün |
| `verify:glacier-ui` (Browser) | bricht wie vor der Phase bei D4 ab (Suchfeld der Lageseite, `Illegal invocation`, V-GH-6) — an diesem Stand und in der Ausgangsmessung gleich |
| `npm run typecheck` | grün |
| `npm run build` | grün; Chunk `GlacierStationsHeute` 8,44 KB roh / 3,49 KB gzip (+ 6,8 KB CSS) |
| `npm run budget` | grün nach Anhebung totalJs 2 103 → 2 109 (IST 2 108; eagerJs 116,2 / 117, largestChunk 278,4 / 302 unverändert) |

**Fünf Fragen:** 1 Funktionserhalt — der Inhalt der Karte „Gemessen in der Nähe“ steht vollständig in Liste/Blatt (jeder Wert, „Keine Daten“ mit Grund, fester Satz, Abstand, Höhe, Alter, Betreiber, Kleingedrucktes, Quellen mit Lizenz; G1); die Seite `/gletscher/<slug>` behält ihre Karte (nur die Betreiber-Zeile ist neu gesetzt). 2 Desktop pixelgleich außerhalb — nicht im Browser geprüft (Jans Vorgabe); die Änderungen hängen an Klassen des Dossiers, einzige Ausnahme ist die Betreiber-Zeile der Stationskarte. 3 Trefferflächen ≥ 44 px — Marker 30 + 2 × 9 px, Zeilen 48/52 px, „Schließen“ 44 px, Chips 44 px (H5). 4 Konsole — nicht geprüft (kein Browser). 5 Long Tasks — nicht gemessen.

## 6 Befunde (V-DKH)

- **V-DKH-1** Punkt 7 („. .“ am Flesch) war ohne Browser nicht nachzustellen; die Zeile ist an der Wurzel umgebaut (Betreiber in eigener Zeile). Jans Blick auf den Großen Aletschgletscher bestätigt es oder nicht.
- **V-DKH-2** Wertekarten zweier naher Stationen können sich überdecken (keine Kollisionsregel). Mehrwert: alle Zahlen lesbar. Skizze: bei Überlappung die hintere Karte zur Pille verkleinern oder seitlich versetzen.
- **V-DKH-3** Der Stiel in 3D hat eine feste Länge (46 px); die echte Höhe zeigt das Gelände. Skizze: Länge nach `dz` gestuft, mit Höhenangabe am Stiel.
- **V-DKH-4** Die Ebene „Stationen“ steht nicht in der Adresse (E-DKH-4): ein geteilter Link zeigt sie immer an.
- **V-DKH-5** Die Linie beginnt am gezeichneten Umriss (Stufe L3 der Seite), die Zahl stammt aus der Zuordnung (Stufe L1): Länge und Zahl können um wenige zehn Meter auseinanderliegen. Der Prüfer misst auf L1 (≤ 0,1 km).
- **V-DKH-6** Das Blatt am Telefon steht unter der Karte im Fluss der Seite, nicht als schwebende Ebene; bei langer Seite springt die Ansicht beim Antippen zum Blatt (`scrollIntoView`, `block: nearest`).
- **V-DKH-7** Die Vorlage zeigt „Die nächsten 7 Tage“ als eigenes Bild; gebaut ist die bestehende Tagestabelle (14 Tage) in „Wetter am Gletscher“, weil Inhalt und Wortlaut bleiben sollten. Ein 7-Tage-Bild wäre eine Inhaltsänderung — Jans Entscheidung.
- **V-DKH-8** Nicht im Browser gesehen, kein Real-Device (Jans Vorgabe); Marker auf dem Gelände in 3D und das Verhalten beim Vergrößern (Karte wechselt das Elternelement) sind nur im Code belegt.
- **V-DKH-9** totalJs +5,9 KB (Lazy-Chunk 3,5 KB, Rest im lazy Steckbrief-Chunk).
