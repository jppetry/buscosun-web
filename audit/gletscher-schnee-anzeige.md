# Phase GV — Dossier-Ebene „Heute": Schneeanalyse (GN) und Schneefelder des Modells (GS) anzeigen

Stand 22.11.2026. Auftrag: Jan, Vorlage `mockups_glacier/dossier-neue-parameter.html`, **Variante A „Höhenleiter"** (Jans Wahl in
dieser Sitzung). Neuschnee bleibt in **mm Wasserwert** (Jans Wahl). Ohne Schalter, an für alle. Keine Sichtprüfung durch mich (Jan
prüft das Aussehen selbst).

## 1 Diagnose (vor dem Code)

**Was schon geladen wird**

- Das Dossier (`GlacierBrief.tsx`, `layout="dossier"`) rendert auf der Ebene Heute `GlacierHeuteBoard` mit `weather` = Karte
  „Wetter am Gletscher" (`GlacierWeatherCard.tsx`). Die Karte lädt das Tagesdokument `melt/wx/<lauf>.json` (`loadWeather`) und den
  Stunden-Chunk der Region (`loadWeatherHourly`); beide Leser sind in `glacierClient.ts` je Lauf bzw. Region gemerkt (`once`) — ein
  zweiter Leser derselben Dateien holt nichts neu.
- Die Schneefelder von GS stehen in genau diesen zwei Dateien: Tagesdokument `pq`, `snq` (je Höhe), `gq`, Regel `rules.spread`;
  Stunden-Chunk `sl` (120 Werte ab Laufstunde, `null` wo keiner) und `sn` (48 h je Höhe). Der Vertrag verlangt von einem Leser der
  Schneefelder `weatherSnowProblems` / `weatherHourlySnowProblems` zusätzlich zu den Prüfern der Karte. Gemessen am Lauf
  `2026112211` (Fusion 14): Hintereisferner `z` = 2 425 / 3 066 / 3 675 m, `f: own`, alle Felder da; Diem Ferner E1 läuft auf
  dem Antrieb des Nachbarn (nur Temperatur, `omit`).
- Die Stationen (DK-H) lädt `useStationView` im Brief; die Sicht `stnView` liegt dort schon vor — die Leiter kann sie ohne neuen Abruf
  benutzen. Die Stationsebene der Karte bleibt unverändert.
- SNOWGRID (GN): Zeiger `index.snow` = `{ day, builtAt, n, cells, clim }` (gelesen 22.11.: Tag `20261121`, 799 Gletscher, Zellen
  `20261120-1.1`). Tagesdokument je Tag 30 KB roh (≈ 7,7 KB gepackt), unveränderlich nach Veröffentlichung (E-GN-11) ⇒ CDN zuerst.
  Zellendatei 106 KB roh / 18 KB gepackt. Kein Leser im Client; `GlacierIndex` kennt `snow` nicht; `verify:glacier-snow` H2 verlangt,
  dass keine Datei der Seite das Produkt nennt.
- An den echten Tagen 15.–21.11. fehlt kein Gletscher (`missing` leer); Hintereisferner 26 → 38 cm, Lage 0 → 3 (bis 18.11. unter jedem
  Referenzjahr, Kennzeichen −1); 14 Zellen im Umriss, Diem Ferner E1 = nächste Zelle 0,18 km, die er mit einem Nachbarn teilt.

**Was fehlt**

1. Ein Leser für Tagesdokument und Zellendatei (durch `snowDayProblems` / `snowCellsProblems`) und der Zeiger `snow` im Index.
2. Reine Regeln der Anzeige (DOM-frei, damit der Prüfer dieselben liest): Abdeckung, „Keine Daten" mit Grund, Alter, Lage in Worten,
   Herkunft der Zelle in Worten, die letzten 7 Tage; Modell: Schneefallgrenze ab jetzt, Neuschnee und Böe je Tag mit Spanne.
3. Die Leiter (Variante A) als Lazy-Chunk unter der Karte „Wetter am Gletscher".
4. Eine Herkunftsfarbe „Analyse" (Schiefer). `GlacierOrigin` wird NICHT erweitert: `isGlacierOrigin` prüft Herkunften in Reihen und
   Quellen anderer Linien — eine vierte Herkunft dort würde Dokumente durchlassen, die heute verworfen werden. Die Leiter setzt
   `data-origin="analysis"` und den Chip selbst.

**Die Lage gegen 1991–2020 als Balken:** die Stützwerte in cm stehen nur in der Klimatologie je Region (bis 1,7 MB, V-GN-3). Für einen
Gletscher lädt die Leiter sie nicht; der Balken zeigt die Lage 0–100 mit den Bändern 10/25/75/90 % und die Worte, keine cm an den
Stützwerten (V-GV-1).

## 2 Plan

| Teil | Inhalt |
|---|---|
| `glacierClient.ts` | `GlacierIndex.snow`; `loadSnowDay(day)`, `loadSnowCells(file)` gemerkt, durch die Vertragsregeln |
| `glacierSnowView.ts` (neu, rein) | `snowAnalysisView` (außerhalb AT · kein Zeiger · zu alt · Tag nicht ladbar · Gletscher fehlt mit Grund · Wert), `snowPlaceWords`, `snowCellsWords`, `snowModelView` (Schneefallgrenze ab jetzt bis +120 h, Neuschnee je Tag und Höhe mit p10/p90, stärkste Böe je Tag mit p10/p90, Gründe), Texte als Konstanten |
| `GlacierSnowLadder.tsx` + `glacierSnow.css` (neu, Lazy-Chunk) | Karte „Am Gletscher, nach Höhe": Sprossen Oberkante · Mitte · Zunge (Neuschnee je Tag, Spanne), Schneefallgrenze an ihrer Höhe (Linie über 120 h vor dem Höhenband), Stationen an ihrer Höhe (Nummer, Name, Hauptwerte, gemessen); darunter abgesetzt „Im Gebiet, ohne Höhe" (SNOWGRID, Analyse) |
| `GlacierHeuteBoard.tsx` | neuer Platz `snow` NACH der Karte „Wetter am Gletscher" |
| `GlacierBrief.tsx`, `GlacierPage.tsx` | Zeiger durchreichen, Lazy-Import |
| `glacierDeck.css` | Tokens `--gl-prov-analysis-*`, Chip `.gl-chip.is-analysis` |
| `verify-glacier-snow.mjs` H2 | bewusst angepasst: genau die Dateien der Anzeige dürfen das Produkt nennen |
| `verify-glacier-snow-view.mjs` (neu) | echter Auszug Schneetage 15.–21.11. + Lauf `2026112211` |

## 3 Entscheidungen (E-GV)

- **E-GV-1 (Jan, diese Sitzung):** Variante A „Höhenleiter“.
- **E-GV-2 (Jan, diese Sitzung):** Neuschnee in mm Wasserwert, keine Dichte.
- **E-GV-3 (`set`, meine Wahl):** die Schneeanalyse wird gezeigt, solange ihr Tag höchstens 4 Tage zurückliegt (`SNOW_VIEW_MAX_AGE_DAYS`; der Vortag erscheint gegen 10:30 UTC, ein ausgefallener Lauf wird toleriert).
- **E-GV-4 (meine Wahl):** Lage in Worten nach den gespeicherten Stützwerten: unter/über jedem Winter (Kennzeichen), < 10 „weniger als in 9 von 10 Wintern“, < 25 „… 3 von 4“, 25–75 „mittlere Hälfte“, ≤ 90 „mehr als in 3 von 4“, darüber „9 von 10“. Beschreibend, ohne Urteil; der Vertrag selbst bleibt bei der Zahl.
- **E-GV-5 (meine Wahl, wie in Variante A):** die Leiter zeigt auch die Stationen der Karte (Nummer, Name, bis zu drei Werte, gemessen) an ihrer Höhe; Liste und Marker von DK-H bleiben unverändert.
- **E-GV-6 (meine Wahl):** fünf Modelltage ab dem Block von „jetzt“ (so weit reicht die Schneefallgrenze); die Summe der fünf Tage nur der Erwartungswerte, mit „ohne Spanne“.

## 4 Umsetzung (22.11.2026)

| Datei | Was |
|---|---|
| `src/glacier/glacierClient.ts` | `GlacierIndex.snow`; `loadSnowDay` (CDN zuerst, `'absent'` bei 404, `null` bei Regelverstoß) und `loadSnowCells`, beide gemerkt |
| `src/glacier/glacierSnowView.ts` (neu, rein) | Texte `SNOW_VIEW_TEXT`, `snowAnalysisView`, `snowPlaceWords`, `snowCellsWords` (mit geteilten Zellen), `snowModelView` (Tage, Summe nur Erwartung, Schneefallgrenze ab jetzt, Gründe; ruft `weatherSnowProblems` / `weatherHourlySnowProblems` und wertet nur die Verstöße dieses Gletschers), `ladderRungs` |
| `src/glacier/GlacierSnowLadder.tsx` + `glacierSnow.css` (neu, Lazy-Chunk) | Lader (dieselben gemerkten Wetterleser wie die Karte darüber, 7 Schneetage + Zellen nur für AT) und `SnowLadderBody`: Leiter, Tagesbalken mit Strich, Böe je Tag, Linie der Schneefallgrenze vor dem Band, Stationssprossen, Block „Im Gebiet, ohne Höhe“ mit Lage-Balken und Woche, Quellenzeile mit Lizenz, DOI und „bearbeitet“ |
| `GlacierHeuteBoard.tsx` | Platz `snow` direkt nach `gl-hb-wx` |
| `GlacierBrief.tsx`, `GlacierPage.tsx` | Zeiger `snowPointer`, Lazy-Import, nur Dossier/Heute |
| `glacierDeck.css` | Tokens `--gl-prov-analysis-*`, `--gl-ice*`, Chip `.gl-chip.is-analysis` |
| `scripts/verify-glacier-snow.mjs` | H2 bewusst umgestellt: genau Leser, Regeln, Leiter, Steckbrief und Seite dürfen das Produkt nennen (Gegenprobe: ein Kommentar „SNOWGRID“ in `glacierView.ts` macht H2 rot) |
| `scripts/verify-glacier-snow-view.mjs` (neu) + Fixture `scripts/lib/fixtures/glacier/snow/view-extract.json` | 19 Prüfungen auf echtem Auszug (Schneetage 15.–21.11., Zellen `20261120-1.1`, Lauf `2026112211`, Prüfsummen der Quelldateien im Fixture); `package.json`, CI |
| `budget.json` | totalJs 2 109 → 2 118 mit Notiz |

Kein Wechsel an Datenvertrag, Pfad oder Format: gelesen werden nur schon veröffentlichte Dateien. `GlacierOrigin` ist nicht erweitert.

## 5 Gate (22.11.2026)

| Prüfung | Ergebnis |
|---|---|
| `verify:glacier-snow-view` | **19/19**; Gegenproben im Code (je ein Lauf, danach byte-gleich zurück): Chip mit `measured` → E1 rot; Abdeckung aus → C1 rot; Summe der p10 im Text → F2 rot; Band-Kante 10 → 5 → B3 rot |
| `verify:glacier-snow` | **37/37** (H2 neu, Gegenprobe s. o.) |
| `verify:glacier-weather` 33/33 · `-dossier-heute` 21/21 · `-contract` 64/64 · `-static` 7/7 · `-publish` 34/34 · `-sat` 28/28 · `-melt` 41/41 · `-sheet` 45/45 · `-feed` 22/22 · `-hugonnet` 41/41 · `-stations` 77/77 | grün |
| `verify:glacier-ui` | nicht gelaufen (Browser, bricht an HEAD ab, V-GH-6) |
| `npm run typecheck` | grün |
| `npm run build` | grün (281/281); Chunk `GlacierSnowLadder` 20,5 KB roh / 7,6 KB gzip + 6,7 KB CSS |
| `npm run budget` | grün nach Anhebung: totalJs 2 117,2 / 2 118; eagerJs 116,2 / 117, largestChunk 278,4 / 302 unverändert |

**Fünf Fragen:** 1 Funktionserhalt — die Karte „Wetter am Gletscher“ ist unverändert (nicht im Diff), die Stationsebene und Liste von DK-H unverändert; die Leiter kommt nur hinzu. 2 Desktop pixelgleich außerhalb — nicht im Browser geprüft (Jans Vorgabe); geändert sind nur die Dossier-Ebene Heute (neuer Block) und zwei neue Tokens/eine Chip-Klasse. 3 Trefferflächen — die Leiter hat keine Knöpfe; die Quellenlinks sind mobil 44 px hoch. 4 Konsole — nicht geprüft. 5 Long Tasks — nicht gemessen; die Leiter rechnet nur über 5 Tage und 120 Stunden.

## 6 Befunde (V-GV)

- **V-GV-1** Der Lage-Balken zeigt die Bänder 0–100, aber keine cm an den Stützwerten: die stehen nur in der Klimatologie je Region (bis 1,7 MB). Mehrwert: „Median an diesem Tag 74 cm“ wie in der Vorlage. Skizze: Klimatologie je Gletscher schneiden (V-GN-3), dann die sieben Stützwerte des Kalendertags laden.
- **V-GV-2** Die Woche kostet 7 Abrufe à ≈ 8 KB gepackt (jeder Tag trägt alle 799 Gletscher). Skizze: eine Saisondatei je Region (V-GN-4).
- **V-GV-3** Die Zellendatei (106 KB roh, 18 KB gepackt) wird nur für den Satz „Mittel aus n Zellen“ geladen. Skizze: `how`/`n` in das Tagesdokument schreiben (Vertrag GN, Jans Entscheidung).
- **V-GV-4** Die Schneefallgrenze ist nach +46 h lückenhaft und endet bei +115 h (V-GS-3); die Sprosse steht nur, wenn es „jetzt“ einen Wert gibt, sonst steht die Linie unter der Leiter mit „—“.
- **V-GV-5** Liegt die Schneefallgrenze genau auf einer Gletscherhöhe, steht die Eissprosse zuerst (feste Reihenfolge). Die Leiter ist nicht maßstäblich (so beschriftet).
- **V-GV-6** Nicht im Browser gesehen, kein Real-Device (Jans Vorgabe); die Ecken der Eissäule hängen an `:has()` (in aktuellen Browsern vorhanden; ohne `:has` bleibt die Säule unten gerade).
