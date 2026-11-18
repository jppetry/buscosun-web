# Phase SR — Strömungs-Riffel auf der Karte von `/seewetter`

> **Auftrag Jan, 2026-11-18:** fünfte Hauptebene „Strömung“: die Oberflächenströmung des BSH als bewegte Riffel-Fronten
> auf dem Wasser — geordnete Bögen quer zum Strom mit Relief, keine dünnen Zufallsstriche wie die Windpartikel.
> 2D-Canvas über der Karte, kein WebGL, kein Shader. Ohne Schalter an für alle (Jans Entscheidung, Ausnahme zu Rule 2),
> wählbar, nicht Voreinstellung. Die Sichtprüfung macht Jan selbst (Entscheidung 18.11.) — hier gibt es **keine** Bilder,
> keinen Browser-Beleg und **keine gemessene Bildrate**.

## 1. Diagnose (vor dem Code, 18.11.2026)

### 1.1 Was da ist (Phase ST, `audit/seewetter-stroemung.md`)

| Stück | Stand |
|---|---|
| Producer `scripts/sea/sea-current.mjs` | liest je Lauf 1 152 Nachrichten (u und v, 15 min, Pakete `db`/`wb` = CWAM-Gitter), schreibt `current/<lauf>.json` (Spots) und ein **ausgedünntes** Stundenfeld `current/<lauf>/f/<hhh>.png` (90 × 55, jede siebte Zelle ≈ 6,3 km, R = Betrag, G = Richtung, **Alpha = Maske**) |
| Seite | Schalter „Strömung“ unter „Auf der Karte“ (Pfeile als Symbol-Layer `sw-current`, ab Werk aus), Zeile im Stundenband, Abschnitt im Dossier |
| Hauptebenen | `SEA_LAYERS = hs · ws · sw · per` (Link `l=`, Dock-Kacheln, Legende); die Fläche ist ein CPU-gefärbtes Bild in der Image-Source `sw-field` |
| Workflow | Schritt „Currents“ in `sea.yml` ruft den Producer von `main` (Sparse `scripts src`), Publish nimmt `sea/` ganz ⇒ ein weiteres Verzeichnis im Lauf braucht **keine** Workflow-Änderung |
| Stand im Daten-Repo | `status.current` fehlt noch: der Producer liegt nicht auf `origin/main` (12 Commits lokal). Die Ebene hat deshalb bis zu Jans Push und dem nächsten BSH-Lauf **„keine Daten“** |

### 1.2 Warum das vorhandene Feld für Riffel nicht reicht

- 6,3 km Maschenweite: bei Zoom 9 ist eine Zelle ≈ 70 px breit — Fronten, die sich „mit dem Feld biegen“, bögen sich
  an Kacheln, nicht an der Strömung; Priele und Seegatten (1–3 Zellen des 0,9-km-Gitters) fehlen ganz.
- Betrag und Richtung statt Komponenten: zwischen zwei Stunden gemittelt dreht ein kenternder Strom mit vollem Betrag
  über den Kompass, statt durch null zu gehen. Der Auftrag verlangt die lineare Mischung von **u und v**.
- Daten im Alpha-Kanal: die Maske im Alpha verliert beim Lesen über ein Canvas die Farbwerte (Vormultiplikation), wenn
  Alpha ≠ 255 — beim ausgedünnten Feld gewollt (Alpha 0 = kein Wert), für ein Rechenfeld der falsche Weg.

### 1.3 Die Basiskarte

OpenFreeMap „dark“ (Stil gelesen am 18.11.): Wasser `rgb(27,27,29)`, Hintergrund `rgb(12,12,12)`. Die Referenz braucht
helle Front + dunkle Linie stromauf auf **mitteldunklem** Wasser; die dunkle Linie `rgb(3,38,46)` ist auf fast schwarzem
Wasser unsichtbar. Die Karte ist also nicht zu hell, sondern zu dunkel für das Relief ⇒ die Ebene bringt ihren eigenen
Wasserton unter die Farbfläche A (wie die Seegangsfläche heute ihr eigenes Dunkelblau).

### 1.4 Schritt 0 — Messregel, **vor** der Messung festgelegt

| Punkt | Festlegung |
|---|---|
| Was | ein stündliches u/v-Feld des ganzen Laufs (72 Stunden) auf dem CWAM-Gitter mit Schrittweite 1 (630 × 387, ≈ 0,9 km) und 2 (315 × 194, ≈ 1,8 km); abgetastet, nie gemittelt (zwei gegenläufige Ströme höben sich auf) |
| Kodierung | PNG RGBA: R = u, G = v als vorzeichenbehaftete Werte (Byte − 128) × Stufe, Stufe **0,02 m/s** (`set`: ± 2,54 m/s, gemessenes Maximum 1,84 m/s; 0,04 kn Auflösung), B = Marke (0 = Wert, 255 = kein Wert), Alpha immer 255 |
| Grenze | **höchstens 4 MB zusätzlich je Lauf** (`set`: knapp ein Drittel eines Seegangslaufs von 13,5 MB; zwei Läufe am Tag, zwei bleiben liegen) |
| Wahl | die feinste Schrittweite, deren Lauf unter der Grenze bleibt |
| Dazu gemessen | Größe je Stunde (min/Mittel/max), Lesezeit eines Bilds (PNG → u/v in Node; die Lesezeit im Browser ist **nicht** gemessen — keine Browser-Prüfung) |
| Werkzeug | `scripts/sea/spike/current-uv-measure.mjs` gegen die echten Tagesdateien des neuesten BSH-Laufs |

Ergebnis: §2.

### 1.5 Risiken, die ohne Browser offen bleiben

- **Bildrate ungemessen.** Die Last je Bild ist abschätzbar (Zähler je 680 × 380 px Wasser mit Deckel), ob ein
  Mittelklasse-Telefon sie hält, nicht. Regelung nur über das `FrameGovernor`-Muster (Bildraten-Leiter, dann kürzere
  Fäden, zuletzt weniger Pakete). Hält 2D-Canvas die Rate nicht, ist das ein Befund für Jan — kein Wechsel zu WebGL.
- **Aussehen ungesehen.** Formeln und Farben sind die des Auftrags; Kontrast, Dichte und Ruhe bei Stauwasser hat
  niemand gesehen.
- **Jans Chrome meldet `prefers-reduced-motion: reduce`** — dort steht nach Auftrag EIN Standbild.

## 2. Schritt 0 — gemessen am 18.11.2026, 20:45–21:10 UTC

Lauf **2026111812** des BSH (sechs Tagesdateien `_01 _02 _03`, 78,2 MB über die Filebox; 1 152 Nachrichten), Werkzeug
`scripts/sea/spike/current-uv-measure.mjs`. Regel und Grenze standen vorher fest (§1.4).

| Schrittweite | Gitter | Maschenweite O–W × N–S | Lauf (72 Bilder) | je Stunde min · Mittel · max | Lesen eines Bilds (Node, PNG → u/v) |
|---|---|---|---|---|---|
| 1 | 630 × 387 | 0,89 × 0,93 km | **6,98 MB** | 91 318 · 96 963 · 105 258 B | 19,2 ms |
| **2** | **315 × 194** | **1,77 × 1,86 km** | **2,47 MB** | 32 503 · 34 352 · 36 815 B | **5,2 ms** |
| 3 | 210 × 129 | 2,66 × 2,78 km | 1,32 MB | 17 561 · 18 369 · 19 526 B | 2,1 ms |

- Grenze 4 MB je Lauf ⇒ **Schrittweite 2** ist die feinste, die sie hält (62 % der Grenze). Schrittweite 1 läge 75 % darüber.
- Kein Wert gekappt (schnellste Zelle des Laufs 2,04 m/s, Grenze der Kodierung 2,54 m/s); größte Rundung 0,01 m/s.
- Der Producer selbst (§5) schreibt für denselben Lauf **2 468 697 B** in 72 Bildern — 4,7 KB weniger als die Messung,
  weil Wasserpunkte ohne Strom dort der Wert 0 / 0 sind und nicht „kein Wert“ (E-SR-3).
- Lesezeit im Browser (`createImageBitmap` + Canvas): **nicht gemessen**.
- Nebenbefund zu **V-ST-1** (Phase ST): der 12-UTC-Lauf von `db`/`wb` heißt `_01 _02 _03` und beginnt am **Folgetag**
  00:15 UTC (erste volle Stunde 19.11. 01:00 UTC). Zwischen seinem Erscheinen (≈ 17:30 UTC) und Mitternacht UTC liegt
  „jetzt“ **vor** dem Lauf ⇒ V-SR-1.

## 3. Entscheidungen

| Nr. | Frage | Entscheidung |
|---|---|---|
| **E-SR-1** | Schalter | keiner — an für alle (Jan, Ausnahme zu Rule 2). Die Ebene ist eine der wählbaren Hauptebenen, Voreinstellung bleibt „Seegang gesamt“. Rückfall ohne Deploy: `SEA_CURRENT_UV: '0'` unter `env:` in `sea.yml` ⇒ der Producer schreibt kein u/v-Feld, die Ebene sagt „keine Daten“; ganz: den Commit zurücknehmen |
| **E-SR-2** | Schrittweite und Stufe | Schrittweite 2 (gemessen, §2), Stufe 0,02 m/s (`set`), Grenze 4 MB je Lauf (`set`). Ein Lauf über der Grenze wird trotzdem veröffentlicht und im Status vermerkt (`uvOver`) — die Schrittweite ändert niemand hinter dem Vertrag |
| **E-SR-3** | „kein Wert“ | B-Kanal als Marke (0 = Wert, 255 = kein Wasserpunkt des Modells), Alpha immer 255. Ein Wasserpunkt ohne Strom (unter 1 mm/s, Regel der Phase ST) ist der **Wert 0 / 0**: stehendes Wasser, kein Loch in der Fläche. Im Watt trockengefallene Zellen sind davon nicht zu unterscheiden — dort steht glattes Wasser ohne Riffel (V-SR-4) |
| **E-SR-4** | Zwischen zwei Stunden | Die Zeitsteuerung der Seite läuft in ganzen Stunden. Wechselt die Stunde (Chip, Stundenband, „Fenster abspielen“), mischt die Ebene **u und v linear** vom Feld davor ins neue, über 800 ms (`set`, unter den 900 ms eines Abspiel-Schritts). Bei benachbarten Stunden ist das die Interpolation der Zeit; ein kenternder Strom geht durch null. Die **Farbfläche** wechselt dabei in einem Schritt (V-SR-2) |
| **E-SR-5** | Wo die Farbfläche A liegt | in der Image-Source der Seegangsfläche (`sw-field`, unter Beschriftung, Gebietsumrissen und allen Symbolen) — „unter allem“ heißt auch unter den Spots. Auf dem 2D-Canvas läge sie über der ganzen Karte. Linear statt „nearest“ abgetastet, damit das 1,8-km-Gitter nicht als Kacheln erscheint |
| **E-SR-6** | Eigener Wasserton | `rgb(28,80,102)` (`set`) unter A, weil das Wasser der Basiskarte fast schwarz ist (§1.3). Gewählt nach gerechnetem Kontrast aus fünf Tönen, **nicht gesehen**: bei 0,3–0,6 m/s helle Front 4,8–3,9 : 1, dunkle Linie 2,5–3,1 : 1; bei 1,3 m/s Front 2,6 : 1, Mitte 3,3 : 1, Linie 4,5 : 1. Der erste Versuch `rgb(20,58,79)` ließ der dunklen Linie bei schwachem Strom nur 1,4 : 1; auf dem Wasser der Basiskarte hätte sie 1,08 : 1 |
| **E-SR-7** | Ausblenden bei Stauwasser (E des Auftrags) | Unter 0,05 m/s (Pakete) bzw. 0,04 m/s (Fäden) sind Partikel verborgen, wie verlangt. Damit sie beim Unterschreiten **ausblenden** statt abzureißen, läuft ihre Sichtbarkeit über 30 Bilder gegen 0 (und zurück). Im eingeschwungenen Zustand ist das genau die Formel des Auftrags |
| **E-SR-8** | Fäden bei weniger Bildern | „die letzten 56 Positionen“ gilt bei 60 Bildern; bei 30 Bildern zeichnet der Faden 28 (dieselbe Zeit, dieselbe Länge). Tempo, Alter und Blenden rechnen in 60-Hz-Bildern, eine niedrigere Bildrate ändert nur die Flüssigkeit |
| **E-SR-9** | Deckel der Fläche | Zähler × sichtbares Wasser / (680 × 380 px), höchstens × 4 (`set`: 520 Fäden, 760 Pakete = bis zu 2 280 Fronten). Sichtbares Wasser = Anteil eines 34 × 19-Rasters über der Karte auf Wasserpunkten |
| **E-SR-10** | Regelung | `FrameGovernor` der Windebene, unverändert importiert, FPS-Ziel-Modus, gefüttert mit der Renderdauer. EINE Stufe, drei Hebel: Maus 60 → 45 → 30 Bilder, dann Fäden halb so lang, zuletzt 60 % der Pakete; Touch 30 → 24 → 20 |
| **E-SR-11** | Spots unter dem Canvas | Der Canvas liegt über der Kartenfläche, also über Spots, Pegeln und Stationen (Marker wie Sprechblase und Boot liegen darüber). Um jeden davon bleibt ein Kreis frei (ausgestanzt, 7–13 px) |
| **E-SR-12** | Name des Pfeil-Schalters | „Strömung“ → **„Strömungspfeile“**, damit er nicht wie die neue Hauptebene heißt. Funktion, Voreinstellung (aus) und Daten unverändert. Der Prüfer der Phase ST (F10) hing am alten Wort und ist an dieser einen Stelle nachgezogen |
| **E-SR-13** | Seegangspfeile | sind Teil der Seegangsfläche und stehen bei gewählter Ebene „Strömung“ nicht auf der Karte (sie wären von den Bögen nicht zu trennen). In den vier Seegangsebenen unverändert |
| **E-SR-14** | Daten-Repo | kein Push in dieser Phase. Der Workflow ruft denselben Producer und veröffentlicht `sea/` ganz; das Feld entsteht mit dem ersten BSH-Lauf nach Jans Push von `buscosun-web` |

## 4. Umsetzung

| Datei | Rolle |
|---|---|
| `src/sea/seaCurrent.ts`, `seaContract.ts` | Vertrag des u/v-Felds: `SEA_CURRENT_UV` (Schrittweite, Stufe), Grenze, `encodeUvPixel` / `decodeUvPixel`, `decodeUvField` (lehnt Alpha ≠ 255, fremde Marke, falsche Größe ab), `currentUvHour`, `doc.uv`, Zeiger `status.current.uv`, Pfad `current/<lauf>/uv/<hhh>.png` |
| `scripts/sea/sea-current.mjs` | schreibt je voller Stunde das u/v-Bild neben das Pfeilfeld, `doc.uv`, `status.current.uv / uvBytes`, Producer-Schalter `SEA_CURRENT_UV=0` |
| `src/sea/seaRipples.ts` (neu) | **rein**: Zahlen des Auftrags, Farben, Alpha-Formeln, lineare Mischung zweier Stunden, bilineares Abtasten mit Landregel, Mercator-Sicht, **Geometrie einer Front**, Weg hinter einem Paket, Zähler nach Fläche, Leitern der Regelung, Farbfläche, Legende, Texte |
| `src/sea/seaRippleSim.ts` (neu) | **rein**: Zustand der Fäden und Pakete (Float64 in Kartenkoordinaten), Setzen neuer Positionen, Schritt je Bild, Standbild |
| `src/sea/SeaRippleLayer.ts` (neu) | 2D-Canvas über der Kartenfläche, Schleife mit `FrameGovernor`, Zeichnen (Fäden; je Front Relief, Front, mittlere Hälfte), Standbild, Stopp bei verborgenem Tab — eigener, träge geladener Baustein |
| `src/sea/seaClient.ts` | `loadCurrentUv` (Zwischenspeicher für sechs Stunden) |
| `src/sea/SeaMap.tsx` | Props `ripple`, `rippleOn`, `fieldSmooth`; lädt die Ebene beim ersten Bedarf, reicht Feld, Bühne und die freizuhaltenden Kreise weiter |
| `src/sea/SeaPage.tsx` | Ebene `cur`: u/v der Stunde (und die danach), Farbfläche statt Seegangsfläche, Legende, „keine Daten“ mit Grund, Quellenliste |
| `src/sea/SeaDock.tsx`, `seaState.ts`, `seaView.ts` | fünfte Kachel „Strömung“ über die ganze Breite, `RippleKey`, `SEA_LAYERS`, Name; Schalter „Strömungspfeile“ |
| `src/sea/seaDeck.css` | Abschnitt „Phase SR“ vor dem Planer; mobil nur per Media Query |
| `scripts/verify-sea-ripples.mjs` (neu), `scripts/lib/fixtures/sea/ripples/`, `.gitattributes`, `package.json` | Prüfer, zwei echte Stundenbilder des Laufs 2026111812 (71 KB), Eintrag `verify:sea-ripples` |
| `scripts/sea/spike/current-uv-measure.mjs` (neu) | Messwerkzeug von Schritt 0 (kein Produktcode) |
| `scripts/verify-sea-current.mjs` | F10 auf den neuen Namen des Schalters nachgezogen (E-SR-12) |
| `scripts/repack-repo/README.md` | Beschreibung der neuen Dateien `current/<lauf>/uv/<hhh>.png` für das README des Daten-Repos |

**Gestaltung** (Command-Deck, Skill `frontend-design`). Plan vor dem Bau: Farben sind die des Auftrags plus der eigene
Wasserton; Schrift und Raster bleiben die des Seewetter-Decks. Das Auffällige ist allein die Bewegung auf der Karte —
alles darum bleibt still. Verworfen: ein Farbbalken als Legende wie bei den Seegangsebenen (er zeigte die Fläche, nicht
das, was sich bewegt). Stattdessen EIN Schlüssel, gezeichnet mit der Geometrie der Ebene selbst (`legendFront` →
`RippleKey`): vier Bögen bei 0,2 · 0,5 · 1 · 2 kn auf dem Farbverlauf der Fläche, Spitze nach rechts — „größer und
heller = stärker“ steht nicht nur da, man sieht es. Derselbe Schlüssel trägt die Kachel im Dock; sie nimmt als fünfte die
ganze Breite, statt eine sechste Lücke zu lassen. Texte nennen, was die Bewegung ist und was nicht („keine Wellen“).

## 5. Gates (18.11.2026)

| Gate | Beleg |
|---|---|
| `verify:sea-ripples` | **111/111** — A u/v-Feld: Hin und zurück auf eine halbe Stufe, Alpha immer 255, Kappen statt Umbrechen, Ablehnungen des Lesers; **zwei echte Stundenbilder** des Laufs 2026111812 (sha256 im Manifest: 31 066 Wasserpunkte, dieselbe Maske, nur die Marken 0 und 255); der Producer am echten GRIB-Ausschnitt der Phase ST: u und v an den Zellen der Spots = **ecCodes** auf eine halbe Stufe, dazu gegen das Pfeilfeld desselben Laufs (über 300 gemeinsame Zellen); ganzer Producer in einen Speicher (Bild, `doc.uv`, Zeiger, `SEA_CURRENT_UV=0`, Aufbewahrung). B Mischung zweier Stunden: Komponenten linear, durch null am Kentern — an künstlichen Feldern und am echten (202 drehende Zellen zwischen 07 und 10 UTC, jede wird dazwischen schwächer; Gegenprobe: Betrag und Richtung gemischt hielte die volle Stärke); Landregel, Küste, Wasser nur in einer Stunde. C eine Front: Zahlen des Auftrags, Spitze stromab in jeder Richtung, **biegt sich mit dem Feld** (Strom von einem Punkt weg; Gegenprobe gerade Front), endet am Land, mittlere Hälfte, Kurve, Relief 1,8 px stromauf, Weg hinter dem Paket („bis zu 3“). D Partikel: Annahmeregel, nie an Land, folgt dem Strom (1 : 0,146), ruhiges Wasser leer, 0,75 px je Bild je m/s unabhängig von der Bildrate, Ausblenden über 30 Bilder bei Stauwasser, Lebensdauern, Kartenrand, gleiche Saat = gleiche Partikel. E Zähler je Fläche mit Deckel, sichtbares Wasser, drei Hebel in ihrer Reihenfolge, `FrameGovernor` mit dieser Leiter hinunter und wieder hinauf. F Farbfläche (Formel, Farben des Auftrags, gerechneter Kontrast, Bildform, Land durchsichtig, Mercator-Zeilen). G Quelltext: Standbild bei reduzierter Bewegung, Stopp bei verborgenem Tab und außerhalb der Bühne, 2D-Canvas ohne WebGL (mit Gegenprobe), Regelung, aus `src/wind/` nur der Governor, Link `l=cur`, kein Schalter, Fläche ersetzt die Seegangsfläche, „keine Daten“ mit Grund, Legende, keine neue Abhängigkeit |
| Mutationsprobe am Prüfer | 12 von 12 bemerkt: Spitze stromauf (C3 C4 C5 C15) · gerade Front (C6 C7) · kein Schnitt am Land (C8 C9 C10) · Daten im Alpha (A3 A12 A13 A14) · neue Position an Land (D2) · Annahme ohne Strom (D4) · u und v im Producer vertauscht (A13 A14) · keine Mischung der Komponenten (B3 B4 B5) · harter Schnitt bei Stauwasser (D13) · kein Deckel (E2) · Tempo an der Bildzahl (D7) · Schleife trotz reduzierter Bewegung (G1) |
| ein lokaler Producer-Lauf | `sea-current.mjs --files=<Tagesdateien> --force` gegen die echten Dateien des Laufs **2026111812** (78,2 MB, vorher über die Filebox geladen): 1 152 Nachrichten, 64/64 Spots, 72 h ab 19.11. 01:00 UTC, Datei 37 067 B, Pfeilfeld 413 955 B, **u/v-Feld 2 468 697 B in 72 Bildern** (62 % der Grenze von 4 MB), `status.current.uv: true`, 64 s gesamt (ohne das u/v-Feld in Phase ST 58–67 s) |
| bestehende `verify:sea-*` | contract 30/30 · decode 13/13 · text 35/35 · waterlevel 63/63 · tide-window 49/49 · wind-band 41/41 · planner 46/46 · dk 70/70 · watertemp 136/136 · sight 76/76 · seo 23/23 · derive 70/70 (1 063 s unter Last) · **current 108/108 nach EINER nachgezogenen Prüfung**: F10 verlangte den Schalter-Namen „Strömung“, er heißt jetzt „Strömungspfeile“ (E-SR-12); mit dem alten Wortlaut stand der Prüfer 107/108. `verify:sea-ui` (Browser) **nicht gelaufen** — Jans Entscheidung |
| `npm run typecheck` | 0 |
| `npm run build` | grün, 281/281 Prüfungen des SEO-Baus (im Arbeitsbaum, der daneben die uncommittete Radar-Linie trägt) |
| `npm run budget` | **Phase allein, sauber gemessen** (derselbe Bau aus `git archive HEAD`, nur `vite build`): HEAD 2 009,2 → HEAD + Dateien der Phase **2 018,6** ⇒ **+9,4 KB gzip** (am gestagten Stand des Commits nachgemessen, samt `tsc -b` 0; ein Bau davor 2 018,7): 4,2 im neuen, träge geladenen Chunk `SeaRippleLayer`, +5,0 im lazy `SeaPage`, +0,4 im lazy `SeaRoute`; eagerJs 114,6 / 115, eagerCss 2,4 / 2,5, largestChunk 278,4 / 302 unverändert. Grenze von Hand mit Notiz: 2 010 → **2 019** (im Commit). Im Arbeitsbaum misst der Bau 2 023,2 / 2 024, weil die Radar-Linie dort ihre eigene, uncommittete Anhebung auf 2 015 trägt |
| `verify:share` | 516/517 wie an HEAD — rot nur SH6 (Edge-Bündel, Jans `npm run edge:share` aus Phase DK); der neue Wert `l=cur` ändert daran nichts |
| Sichtprüfung, Bildrate | **keine** — weder Bild noch Browser (Jans Entscheidung 18.11.). **Die Bildrate ist ungemessen.** Von den fünf Selbstverifikations-Fragen sind 2 (Desktop pixelgleich), 3 (Touch-Ziele), 4 (Konsole) und 5 (Long Tasks) **unbeantwortet**; Frage 1 (Funktionserhalt) nur am Quelltext und an den Prüfern: keine Ebene, kein Schalter, keine Karte ist entfernt; neu ist eine fünfte Kachel, umbenannt ein Schalter (E-SR-12), und unter der neuen Ebene stehen die Seegangspfeile nicht (E-SR-13) |

**Daten-Repos:** kein Commit, kein Push in `buscosun-data` oder `buscosun-archiv` in dieser Phase. Gelesen wurde die
öffentliche Filebox des BSH (sechs Dateien, einmal).

**Geteilter Arbeitsbaum:** während der Phase arbeitete eine zweite Sitzung an der Radar-Linie im selben Baum (u. a.
`src/wind/iconD2WindSource.ts`, `package.json`, `budget.json`, `CLAUDE.md`). Diese Phase hat `src/wind/` nicht verändert;
gestagt sind nur ihre eigenen Dateien und in den geteilten Dateien nur ihre eigenen Hunks.

## 6. Befunde

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| **V-SR-1** | **Abends liegt „jetzt“ vor dem Lauf.** Der 12-UTC-Lauf von `db`/`wb` (gemessen 2026111812, Antwort auf V-ST-1) beginnt am Folgetag 00:15 UTC. Von seinem Erscheinen (≈ 17:30 UTC) bis 01:00 UTC hat „Jetzt“ keine Strömung — die Ebene sagt „Keine Daten“ mit dem Zeitraum des Laufs, und die Zeile „Strom“ der Phase ST ist in diesen Stunden leer | Mehrwert: die Strömung fehlt genau am Abend, täglich ≈ 7,5 h. Skizze: der Speicher hält zwei Läufe; `status.current` nennt zusätzlich den Lauf davor (`prev: { run, t0, hours }`), Seite und Ebene lesen die Stunden vor `t0` dort und nennen den Lauf. Gehört in die Linie ST (Vertrag der Spot-Datei), deshalb hier nicht gebaut |
| **V-SR-2** | Die Farbfläche wechselt beim Stundenwechsel in einem Schritt, während die Riffel 0,8 s mischen. Beim Abspielen springt die Fläche alle 0,9 s | Skizze: zweite Image-Source und beide Raster-Ebenen über `raster-opacity` kreuzblenden, oder eine Canvas-Source, die während der Mischung nachgefärbt wird (12–22 ms je Bild, V-SR-5) |
| **V-SR-3** | **Bildrate ungemessen**, auf keinem Gerät. Last am Deckel: bis 520 Fäden à 56 Punkte und 2 280 Fronten à drei Strichen je Bild | Jans Blick am Desktop und an einem Mittelklasse-Android. Hält 2D-Canvas die Rate nicht: anhalten und berichten (Auftrag). Stellschrauben ohne Umbau: `RIPPLE.areaCap`, `RIPPLE_LADDER` |
| **V-SR-4** | Eine im Modell trockengefallene Wattzelle und eine Zelle mit stehendem Wasser sind im u/v-Feld dasselbe (0 / 0): beide zeigen glattes Wasser im Ton der Ebene | Skizze: die Trocken-Maske des Seegangslaufs (V-SW-20) als dritte Marke im B-Kanal und solche Zellen wie Land behandeln |
| **V-SR-5** | Die Farbfläche wird im Hauptthread gefärbt: 12–22 ms je Stunde (Node, echtes Feld; im Browser ungemessen) | Skizze: in den vorhandenen `seaFieldWorker` |
| **V-SR-6** | Schrittweite 2 (1,8 km) löst Priele, Seegatten und die Unterelbe (≈ 2 km breit) kaum auf; Schrittweite 1 kostete 7 MB je Lauf | Skizze: Schrittweite 1 nur in einem Küstenstreifen (zweites, kleineres Bild je Stunde) — erst nach Jans Blick, ob es fehlt |
| **V-SR-7** | Wechselt die Stunde, während die vorige Mischung noch läuft (schnelles Wischen im Stundenband), beginnt die neue Mischung am vorigen ZIEL, nicht am gezeigten Zwischenstand — ein kleiner Sprung | Skizze: den Zwischenstand als eigenes Gitter festhalten (0,55 MB) |
| **V-SR-8** | `verify:sea-ripples` steht nicht im CI-Workflow von `buscosun-web` (Workflows dort sind Jans Schritt) | `MANUELLE-SCHRITTE.md` §97.7 |
| **V-SR-9** | Das Standbild (reduzierte Bewegung) wird nach jedem Verschieben der Karte neu gesetzt: dieselbe Saat, aber ein anderer Ausschnitt ⇒ ein anderes Bild | So gewollt (Partikel leben nur im sichtbaren Wasser). Skizze, falls es stört: Saat an Kartenkacheln binden |
| **V-SR-10** | Die Riffel liegen über den Ortsnamen der Basiskarte und über den Strömungs- und Windpfeilen (nur Spots, Pegel und Stationen sind ausgestanzt) | Jans Blick; Skizze: Pfeile ebenfalls ausstanzen oder bei gewählter Ebene dünner zeichnen |
