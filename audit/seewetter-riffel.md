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

## 7. Diagnose 19.11.2026: „soll flüssig bewegt sein wie die Windpartikel“ — im Browser gemessen

Jans Auftrag (19.11.): die Strömung soll sich flüssig bewegen wie die Windpartikel der Wetterkarte; erst ansehen und
analysieren. Kein Code in diesem Abschnitt. Damit ist V-SR-3 (Bildrate ungemessen) am Desktop beantwortet.

**Aufbau.** Produktions-Build hinter `vite preview`, eigenes Chromium 1223 mit echter GPU (`--headless=new`, Intel UHD
über ANGLE/D3D11), 1440 × 900, Live-Daten (BSH-Lauf 00 UTC vom 19.11., Stunde 08:00 MEZ). `requestAnimationFrame`
umhüllt: Abstand der Bilder und Dauer aller Rückrufe je Bild. Bewegung ausdrücklich gesetzt
(`Emulation.setEmulatedMedia`), einmal `no-preference`, einmal `reduce`. Der Browser des Playwright-Werkzeugs taugt
dafür nicht: er drosselt auf 1 Bild/s (verdecktes Fenster). Zahlen: `seewetter-riffel/sr7-messung.json`.

| Messung | Ergebnis |
|---|---|
| Ebene „Strömung“, Bewegung erlaubt | **60 Bilder/s**, Abstand p95 16,8 ms; Rechnen + Zeichnen je Bild 4–5 ms (p95 7 ms), keine Long Tasks. Nach einem Mausrad-Schub einmal 77 ms |
| Ebene „Strömung“, `prefers-reduced-motion: reduce` | **0 Bilder/s, 0 % des Canvas ändern sich in 1 s** — das Standbild (`sr7-stroemung-standbild.png`) |
| Windpartikel `/wetterkarte/wind`, `reduce` | 60 Bilder/s, das Bild ändert sich wie ohne die Einstellung (1,24 % gegen 1,29 % der Pixel in 1 s) — **die Windebene beachtet die Einstellung nicht** |
| Gezeichnete Fläche | 6–8 % der Pixel des Canvas tragen Farbe (`sr7-stroemung-bewegt.png`): einzelne Bogen-Gruppen, Fäden mit Deckkraft ≤ 0,2 kaum zu sehen |
| Tempo am Bildschirm (`pxPerFrame` 0,75 ⇒ 45 px/s je m/s, linear) | echtes Feld (31 066 Wasserzellen): Median 0,30 m/s = **13 px/s**, unteres Viertel < 0,13 m/s = unter 6 px/s, 90 %-Wert 0,67 m/s = 30 px/s. 10 % des Wassers liegen unter 0,05 m/s und zeigen gar nichts, 37 % unter 0,2 m/s (unter 9 px/s) |
| Tempo der Windpartikel (Preset: 100 px/s · (v/30)^0,7, Boden 1,5 m/s) | 2 / 5 / 8 / 12 m/s ⇒ 15 / 29 / 40 / 53 px/s — unterlinear, auch schwacher Wind läuft sichtbar |

**Befund.**
1. **Jans Chrome meldet `reduce`** (gemessen am 03.10., Windows „Animationen anzeigen“ aus) ⇒ er sieht auf dieser Ebene
   ein Standbild, auf der Wetterkarte daneben bewegte Partikel. Das ist die größte einzelne Ursache — und kein
   Leistungsproblem: die Ebene hält 60 Bilder/s mit 4–5 ms je Bild.
2. **Auch bewegt ist es eine andere Art Bild.** Die Riffel sind wenige, abgesetzte Zeichen (≈ 220 Pakete mit bis zu
   drei Bögen QUER zum Strom auf dieser Kartengröße); das Auge liest Symbole, die langsam wandern. Die Windpartikel sind
   viele kurze Striche LÄNGS der Strömung mit ausklingender Spur; das Auge liest ein Feld, das fließt.
3. **Das Tempo ist linear und niedrig.** Die Hälfte des Wassers bewegt sich unter 13 px/s, ein Viertel unter 6 px/s —
   an der Grenze dessen, was man als Bewegung wahrnimmt. Der Wind hat eine unterlineare Kurve mit Boden.
4. Die Fäden (Teil B), die das Fließen zwischen den Bögen tragen sollten, sind mit 1 px und Deckkraft ≤ 0,2 im Bild
   praktisch nicht da.

**Nicht gemessen:** Telefon / Real-Device, Zoomstufen (das Mausrad griff im Test nicht), die Zahl der Windpartikel in
dieser Ansicht, die Bildrate am Deckel (× 4 Fläche).

**Offen (Jan):** E-SR-15 Umgang mit `prefers-reduced-motion` (wie die Windebene bewegen · Standbild mit Schalter ·
wie bisher); E-SR-16 Art der Bewegung (Partikel mit Spur statt Bögen · beides · Bögen schneller und dichter).

## 8. Phase SR-B (19.11.2026): die Riffel bewegen sich wie die Windpartikel — Aussehen unverändert

Jans Wort (19.11.): „es soll nicht visuell so aussehen wie die Windpartikel, aber das flüssige Bewegen auf der Karte
soll genauso sein. Als Aussehen können gerne die aktuellen Riffel bleiben“ — und zum Entwurf: „ja starte erstmal so“.

### 8.1 Entscheidungen

| Nr. | Frage | Entscheidung |
|---|---|---|
| **E-SR-15** | `prefers-reduced-motion` | Die Ebene bewegt sich immer, wie die Windebene (die liest die Einstellung nicht, §7). Grund: Jans Chrome meldet `reduce`, er sah bisher ein Standbild. Rückfall: `?srstill=1` ⇒ das Standbild wie bisher (feste Saat, eingeschwungen), mit Hinweis in der Legende. **Weniger als zuvor:** wer am Gerät reduzierte Bewegung wünscht, bekommt sie auf dieser Ebene nur noch über den Link |
| **E-SR-16** | Tempo | Kurve der Windpartikel statt linear: `px/s = 60 · (max(v, 0,05) / 1 m/s)^0,7` (`set`; Exponent 0,7 wie `SEGMENT_PRESET.speed.gamma`). 0,1 m/s ⇒ 12 px/s (vorher 4,5), 0,3 ⇒ 26 (13), 1 ⇒ 60 (45), 2 ⇒ 97 (90). Stehendes Wasser (v = 0) bewegt nichts; unter 0,05 m/s bleibt ein Paket verborgen (E-SR-7 unverändert). Rückfall: `?srtempo=lin` ⇒ 0,75 px je Bild je m/s. **Preis:** das Tempo am Bildschirm ist nicht mehr proportional zur Stärke — die Stärke bleibt an Größe und Helligkeit der Bögen und in der Legende ablesbar; der Satz „Die Bewegung zeigt Richtung und Stärke“ bleibt wahr (monoton) |
| **E-SR-17** | Fäden | Ein Faden zeichnet weiter die letzten 56 Positionen; mit dem höheren Tempo ist er am Bildschirm länger (bei 0,3 m/s ≈ 24 statt 13 px). Hingenommen: Länge = Zeit, wie die Spur der Windpartikel |

Unverändert: Bögen (Geometrie, Farben, Zahl, Abstand), Farbfläche, Zähler je Wasserfläche, Regelung der Bildrate,
Daten, „keine Daten“. Kein WebGL.

### 8.2 Plan

| Datei | Was |
|---|---|
| `src/sea/seaRipples.ts` | `RIPPLE_TEMPO` (`pxPerSec` 60, `refMs` 1, `gamma` 0,7, `minMs` 0,05), `rippleStepPx(v, linear = false)` = px je 60-Hz-Bild (0 bei v ≤ 0), `rippleMotionFrom(search)` ⇒ `{ still, linear }` aus `srstill=1` / `srtempo=lin`; `RIPPLE_STILL_NOTE` nennt den Link statt des Geräts |
| `src/sea/seaRippleSim.ts` | `new RippleSim(seed, linear = false)`; beide Schritte nehmen `rippleStepPx(f.v, this.linear) * dtN` |
| `src/sea/SeaRippleLayer.ts` | liest die zwei Rückfälle einmal aus dem Link; `still()` = der Rückfall; kein `matchMedia('(prefers-reduced-motion …)')` mehr |
| `src/sea/SeaPage.tsx` | `stillMotion` aus `rippleMotionFrom` statt aus der Media Query (Hinweis der Legende) |
| `scripts/verify-sea-ripples.mjs` | D7–D12 prüfen den Rückfall (linear); neu H1–H5 (Kurve gegen eine zweite Rechnung, Sim an beiden Partikelarten und bei halber Bildrate, stehendes Wasser, Rückfälle aus dem Link mit Gegenproben); G1, G13, G19 auf den neuen Stand |

Reihenfolge: Prüfer zuerst (rot), dann Code. Gate: typecheck, `verify:sea-ripples`, `verify:sea-current`, build,
budget; im Browser dieselbe Messung wie §7 (mit `reduce`: 60 Bilder/s und ein Bild, das sich ändert; `?srstill=1`:
Standbild), dazu Verschieben der Karte gegen die Windebene (E des Entwurfs: nur ändern, wenn es ruckt oder springt).

### 8.3 Umsetzung (19.11.)

Wie geplant (§8.2), fünf Dateien. `SeaMap.tsx`, `seaDeck.css`, Daten und Producer sind unberührt. Der Rumpf des
Zeichnens (`paint`) ist unverändert — das Aussehen der Bögen kommt aus denselben Formeln mit der echten Stärke in m/s.

### 8.4 Gate (19.11.)

| Prüfung | Ergebnis |
|---|---|
| `verify:sea-ripples` | **116/116** (111 + H1–H5; G1, G13, G19, G24 auf den neuen Stand, D7–D12 prüfen jetzt den Rückfall). Am Stand vor dem Code rot (die Tempo-Funktion fehlte) |
| Mutationen | **12 von 12 bemerkt** (Exponent 1 · kein Boden · stehendes Wasser bewegt sich · 45 statt 60 px/s · Rückfall = Kurve · Zustand ohne Rückfall · Pakete im alten Tempo · Ebene liest das Gerät wieder · Ebene reicht das Rückfall-Tempo nicht weiter · jeder Wert von `srstill` · `srtempo` lose gelesen · Seite fragt das Gerät) |
| `npm run typecheck` · `npm run build` | grün · grün (281/281) |
| `npm run budget` | grün ohne Anheben: totalJs 2 045,9 / 2 046; Anteil mit dem Zähler aus `seewetter-ausfahrt.md` §10.4: 2 099 189 → 2 099 166 Byte = **−23 Byte gzip** |
| Nicht gelaufen | `verify:sea-ui` (Browser, an HEAD rot, V-TF-5); die übrigen `verify:sea-*` lesen keine der fünf Dateien außer `SeaPage.tsx` an Stellen, die diese Phase nicht berührt (eine Zeile `stillMotion`, ein Import) |

**Im Browser gemessen** (Aufbau wie §7: Produktions-Build, Chromium 1223 mit echter GPU, Intel UHD, 1440 × 900,
Live-Daten; Zahlen `seewetter-riffel/sr8-messung.json`):

| Messung | Ergebnis |
|---|---|
| Gerät meldet `prefers-reduced-motion: reduce` (Jans Chrome) | **60 Bilder/s**, Abstand p95 16,8 ms, 5 ms je Bild, keine Long Tasks; 93 % der gezeichneten Pixel ändern sich in 100 ms (`sr8-bewegt-trotz-reduce.png`). Vorher: 0 Bilder/s |
| Rückfall `?srstill=1` | 0 Bilder/s, 0 % Änderung in 1 s; die Legende sagt „Standbild: die Bewegung ist über „srstill=1“ im Link abgeschaltet.“ (`sr8-rueckfall-standbild.png`) |
| Rückfall `?srtempo=lin` | 60 Bilder/s |
| Karte ziehen und mit dem Rad hineinzoomen, Sekunde für Sekunde, zwei Durchgänge | **59–60 Bilder/s** davor, dabei und danach; einzelne ausgelassene Bilder (größter Abstand 33–117 ms, ein bis zwei in zehn Sekunden). Hineingezoomt 1 900–2 000 Striche je Bild statt 1 300, 7 statt 5 ms (`sr8-hineingezoomt.png`) |
| Windebene, dieselbe Probe | 60 Bilder/s beim Ziehen und Zoomen, größter Abstand 17–33 ms |
| Telefon-Größe 390 × 844 mit Touch-Emulation | Seite 60 Bilder/s, 1 ms je Bild; die Ebene zeichnet dort nach ihrer Leiter mit 30 (nicht eigens gezählt). Bild: `sr8-mobil-390.png` (der Kartenhinweis liegt noch darüber) |

**Abweichung, nicht geklärt (V-SR-11):** im ERSTEN Messlauf lief die Seite während des Zoomens und in den 5 Sekunden
danach mit 33–38 Bildern/s (Abstand der Bilder 33 ms, Rechnen 7 ms — also nicht das Skript der Ebene). In drei
weiteren Aufzeichnungen derselben Probe trat das nicht auf (59–60). Die Windebene blieb in ihrem einen Lauf bei 60.

**Die fünf Fragen.**
1. *Funktionserhalt:* nichts entfernt. **Weniger als zuvor:** das Standbild kommt nicht mehr von selbst, wenn das
   Gerät reduzierte Bewegung wünscht (E-SR-15, Jans Wort) — nur noch über `?srstill=1`.
2. *Desktop pixelgleich:* **nein, gewollt** — die Riffel wandern schneller, die Fäden sind dadurch länger (E-SR-17).
   Kein CSS, kein Markup berührt; die Bögen selbst (Form, Größe, Farbe, Zahl) sind unverändert.
3. *Touch-Ziele:* kein Bedienelement berührt.
4. *Konsole:* keine Ausnahme in den drei Messsitzungen (`Runtime.exceptionThrown` mitgeschrieben).
5. *Long Tasks:* 0 in Ruhe und beim Ziehen; beim Zoomen im ersten Lauf einer mit 56–58 ms.

**Nicht geprüft:** Jans Chrome selbst und ein echtes Telefon; das Tempo mit dem Auge (die drei Zahlen der Kurve sind
gesetzt und nur im Partikelzustand nachgerechnet, H1–H4 — am Bildschirm nicht ausgemessen); Zoomen mit zwei Fingern;
„Fenster abspielen“ bei laufender Ebene; die Ebene am Deckel (× 4 Wasserfläche, großer Schirm).

### 8.5 Befunde

V-SR-3 (Bildrate ungemessen): am Desktop **beantwortet** (60 Bilder/s), am Telefon offen.

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| **V-SR-11** | Einmal in vier Aufzeichnungen fiel die Seite beim Hineinzoomen für mehrere Sekunden auf rund 30 Bilder/s, ohne dass das Skript der Ebene länger rechnete | Jans Blick beim Zoomen. Tritt es bei ihm auf: Bildabstand statt Rechenzeit messen (V-SR-12) und die Zahl der Striche senken (Fronten gleicher Deckkraft in EINEM Pfad zeichnen) |
| **V-SR-12** | Die Regelung der Ebene bekommt die Rechenzeit des Skripts, nicht den Abstand der Bilder. Bremst die Grafikkarte (wie in V-SR-11), merkt sie es nicht und nimmt nichts zurück | Den Governor mit dem größeren der beiden Werte füttern (Rechenzeit, geglätteter Bildabstand) — Änderung nur in `SeaRippleLayer.ts`, der Governor selbst bleibt |
| **V-SR-13** | Während die Karte bewegt wird, zeichnet die Ebene zweimal je Bild: in der eigenen Schleife und noch einmal auf `move` | Halbe Zeichenlast beim Ziehen: das Bild der Schleife auslassen, wenn im selben Bild schon auf `move` gezeichnet wurde |
| **V-SR-14** | Weder die Windebene noch (seit dieser Phase) die Riffel beachten den Wunsch nach reduzierter Bewegung; es gibt auf der Seite auch keinen sichtbaren Knopf zum Anhalten (nur den Link) | Für Menschen, denen Bewegung zusetzt: ein kleiner Schalter „Bewegung anhalten“ an der Legende der Ebene, gemerkt im Gerät; Voreinstellung bleibt „bewegt“. Jans Wort |

## 9. Phase SR-C (19.11.2026): Tempo etwas langsamer, ein Bild je Bildschirmbild beim Bewegen der Karte

Jans Blick auf SR-B (19.11.): „1. das Tempo etwas langsamer 2. minimal [Ruckeln beim Hineinzoomen], verbessere es
vielleicht noch leicht 3. lass es erstmal so [kein Schalter „Bewegung anhalten“]“.

### 9.1 Diagnose zu Punkt 2 (vor dem Code gemessen)

Aufbau wie §7, drei Durchgänge in je frischem Kontext, fünf Rad-Schritte hinein; je Bild gezählt: Striche auf dem
Canvas der Ebene und wie oft er geleert wurde (= wie oft gezeichnet). **Vorher:** in Ruhe 1 300 Striche und 5 ms je
Bild; während des Zoomens wurden **36–38 von rund 142 Bildern zweimal gezeichnet** (einmal von der eigenen Schleife,
einmal auf `move` der Karte — V-SR-13), Rechenzeit je Bild p95 **12–15 ms** bei einem Budget von 16,7 ms. Die Bildrate
hielt auf dieser Maschine trotzdem 60; auf einer schwächeren ist genau das der Rand, an dem Bilder ausfallen.

### 9.2 Entscheidungen

| Nr. | Frage | Entscheidung |
|---|---|---|
| **E-SR-18** | Tempo (Jan: „etwas langsamer“) | `RIPPLE_TEMPO.pxPerSec` 60 → **48** (`set`, −20 %): 0,1 m/s ⇒ 10 px/s, 0,3 ⇒ 21, 1 ⇒ 48, 2 ⇒ 78; Boden 5,9 px/s. Kurve, Exponent und Boden-Stärke unverändert. Gegenüber dem linearen Tempo vor SR-B: bei 0,3 m/s das 1,5-Fache, bei 0,1 m/s das 2,1-Fache, ab 1,3 m/s langsamer als damals |
| **E-SR-19** | Zeichnen, während die Karte sich bewegt | **Ein Bild je Bildschirmbild.** Die Karte zeichnet die Ebene auf jedem `move` selbst (mit der Sicht genau dieses Bildes); die Schleife rechnet die Partikel weiter und lässt ihr Bild aus, solange das letzte Kartenbild jünger ist als das 1,5-Fache des Abstands der letzten zwei (mindestens 25, höchstens 100 ms — `set`, `RIPPLE_MOVE`). Bei 60 Bildern heißt das: nach dem Ende einer Bewegung entfällt EIN Bild, dann zeichnet die Schleife wieder; ein mitten im Ziehen stillgehaltener Zeiger friert die Riffel nicht ein. Die Regelung bekommt die Dauer des Kartenbilds statt des ausgelassenen |
| **E-SR-20** | Schalter „Bewegung anhalten“ (V-SR-14) | **nein, vorerst** (Jan). Der Rückfall bleibt der Link `?srstill=1` |

### 9.3 Umsetzung

| Datei | Was |
|---|---|
| `src/sea/seaRipples.ts` | `RIPPLE_TEMPO.pxPerSec` 48; `RIPPLE_MOVE`, `loopPaints(nowMs, movedAtMs, moveEveryMs)` (rein) |
| `src/sea/SeaRippleLayer.ts` | Schleife: rechnen immer, zeichnen nur, wenn `loopPaints`; `onMove` merkt Zeit, Abstand und Dauer seines Bilds (nur bei laufender Schleife) |
| `scripts/verify-sea-ripples.mjs` | H1–H4 auf 48 px/s; neu H6 (Regel mit Grenzfällen), H7 (eine Sekunde Bewegung + eine Sekunde Ruhe durchgerechnet), G25 (Verdrahtung); G6 nachgezogen |

### 9.4 Gate (19.11.)

| Prüfung | Ergebnis |
|---|---|
| `verify:sea-ripples` | **119/119** (116 + H6, H7, G25); am Stand vor dem Code rot |
| Mutationen | **8 von 8 bemerkt** (60 px/s · Schleife zeichnet immer · keine Obergrenze · feste 25 ms · kaputter Abstand hält die Schleife an · Ebene zeichnet trotz Regel · Kartenbild auch im Standbild gemerkt · Regelung ohne das Kartenbild) |
| `npm run typecheck` · `npm run build` · `npm run budget` | grün · grün (281/281) · grün ohne Anheben, totalJs 2 045,9 / 2 046 (−3 Byte gzip gegen §8.4) |
| Beim Zoomen, dieselbe Probe wie §9.1 (`seewetter-riffel/sr9-zoom-vorher.json`, `-nachher.json`) | doppelt gezeichnete Bilder **36–38 → 1–2** (das erste der Bewegung, wie gerechnet), ein Bild ohne eigenes Zeichnen am Ende; Rechenzeit je Bild p95 **12–15 → 10–11 ms**, Median 8 → 7 ms; 60 Bilder/s, kein Bildabstand über 20 ms in allen drei Durchgängen (vorher einer von 33 ms) |
| In Ruhe und nach dem Zoomen | unverändert: 60 Bilder/s, 5 bzw. 6 ms je Bild |

**Die fünf Fragen.** 1 *Funktionserhalt:* nichts entfernt. 2 *Desktop pixelgleich:* nein, gewollt (Tempo); kein CSS,
kein Markup. 3 *Touch-Ziele:* keine berührt. 4 *Konsole:* nicht eigens mitgeschrieben in dieser Messung (in §8.4
sauber; der Code der Phase wirft nichts). 5 *Long Tasks:* nicht eigens gemessen; die Rechenzeit je Bild blieb unter
12 ms.

**Nicht geprüft:** Jans Chrome und ein echtes Telefon; ob das Ruckeln, das Jan „minimal“ sah, damit weg ist (seine
Maschine, sein Blick); Ziehen mit der Maus in Echtzeit (die Messbrücke schickt Mausbewegungen zu langsam — gemessen
ist das Zoomen, das dieselbe Stelle im Code trifft); zwei Finger; das Bild selbst habe ich nach dieser Änderung nicht
neu angesehen (die Zeichenroutine ist unverändert).

### 9.5 Befunde

V-SR-13: **umgesetzt**. V-SR-14: **entschieden** (E-SR-20). V-SR-11, V-SR-12 bleiben offen.

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| **V-SR-15** | Auch mit einem Bild je Bildschirmbild kostet ein Bild beim Zoomen 7–11 ms statt 5: jede Front ist ein eigener Strich (bis 2 500 je Bild) | Reicht es Jan noch nicht: Fronten gleicher Deckkraft-Stufe in EINEM Pfad zeichnen (drei Durchgänge × etwa 16 Stufen statt 2 000 Striche). Ändert das Bild dort minimal, wo sich Fronten überlagern — deshalb Jans Blick |

## 10. Phase SR-D (19.11.2026): nochmals langsamer, beim Hineinzoomen ein Viertel weniger Bögen

Jans zweiter Blick (19.11.): „nochmal etwas langsamer alle Strömungsbewegungen, zudem sind es beim Reinzoomen etwas zu
viele Wellen, das können etwas weniger sein (−25 %)“.

### 10.1 Entscheidungen

| Nr. | Frage | Entscheidung |
|---|---|---|
| **E-SR-21** | Tempo | `RIPPLE_TEMPO.pxPerSec` 48 → **38** (`set`, derselbe Schritt von −20 % wie E-SR-18): 0,1 m/s ⇒ 8 px/s, 0,3 ⇒ 16, 1 ⇒ 38, 2 ⇒ 62; Boden 4,7 px/s. Gilt für Fäden und Pakete (eine Funktion). Gegen das lineare Tempo vor SR-B: bis etwa 0,57 m/s schneller (bei 0,3 m/s das 1,2-Fache, bei 0,1 m/s das 1,7-Fache), darüber langsamer |
| **E-SR-22** | „beim Reinzoomen −25 %“ | Gelesen als: die **Startansicht bleibt, wie sie ist**; weiter hinein sinkt die Zahl der Pakete gleitend auf **75 %**, erreicht eine Zoomstufe hinter der Startansicht, dort und tiefer konstant (`RIPPLE_ZOOM`: `levels` 1 `set`, `packets` 0,75 Jans Zahl). „Wellen“ = die Bögen (Pakete); die Fäden behalten ihre Zahl. Die Dichte je Wasserfläche und der Deckel × 4 bleiben; der Faktor multipliziert sich mit dem letzten Hebel der Regelung. Gezählt wird wie bisher am Ende jeder Kartenbewegung |
| **E-SR-23** | Woran „hineingezoomt“ gemessen wird | An der Sicht der Ebene selbst: Maßstab der Karte geteilt durch den, bei dem die Startansicht (`SEA_START_BOUNDS`) mit 10 px Rand in die Kartenfläche passt — so, wie die Karte beim Start angelegt wird. Damit gilt auf jedem Schirm dessen eigene Startansicht (Telefon, breite Fenster). **Nicht** die Kamera-Hilfe der Karte (`cameraForBounds`): die zählt den Innenabstand mit, den die Seite für Legende und Leisten setzt — der erste Versuch nahm damit schon der Startansicht 17 % der Striche (gemessen, §10.3) |

### 10.2 Umsetzung

| Datei | Was |
|---|---|
| `src/sea/seaRipples.ts` | `pxPerSec` 38; `RIPPLE_ZOOM`, `zoomPacketScale(zoomIn)`, `rippleZoomIn(view, home, padPx = 10)` (alle rein) |
| `src/sea/SeaRippleLayer.ts` | zweites Argument `home` (die Startansicht); `recount` zählt die Pakete mit `zoomPacketScale(rippleZoomIn(view, this.home))` |
| `src/sea/SeaMap.tsx` | `new m.SeaRippleLayer(map, SEA_START_BOUNDS)` — eine Zeile |
| `scripts/verify-sea-ripples.mjs` | H1–H4 auf 38 px/s; neu H8 (Faktor mit Gegenproben und Zählern), H9 (Zoom hinter der Startansicht gegen eine zweite Rechnung: Desktop, Telefon, breite flache Karte, ohne Startansicht), G26 (Verdrahtung, ohne Kamera-Hilfe) |
| `budget.json` | totalJs 2 046 → 2 047, von Hand, mit Notiz |

### 10.3 Gate (19.11.)

| Prüfung | Ergebnis |
|---|---|
| `verify:sea-ripples` | **122/122** (119 + H8, H9, G26); am Stand vor dem Code rot |
| Mutationen | **10 von 10 bemerkt** (48 px/s · kein Abzug · ein Drittel statt ein Viertel · Abzug schon in der Startansicht · Sprung statt Gleiten · Passung ohne Rand · Passung nur aus der Breite · Ebene zählt ohne Zoom · Karte reicht die Startansicht nicht weiter · Ebene fragt wieder die Kamera). „Nur aus der Breite“ blieb zuerst unbemerkt ⇒ Fall „breite, flache Karte“ in H9 ergänzt |
| `npm run typecheck` · `npm run build` | grün · grün (281/281) |
| `npm run budget` | **zuerst rot** (2 046,3 > 2 046), nach dem Anheben von Hand grün: totalJs 2 046,2 / 2 047. Anteil der Phase mit demselben Zähler: 2 099 163 → 2 099 498 Byte = **+335 Byte gzip** |
| Striche je Bild, drei Durchgänge (`seewetter-riffel/sr10-zoom.json`; Aufbau wie §9.1) | **Startansicht 1 288–1 333** (vor der Phase 1 285–1 343: unverändert) · **hineingezoomt 1 356–1 400** (vorher 1 787–1 835: **−24 %**, darin die Fäden, die bleiben) · 60 Bilder/s, Rechenzeit je Bild 5 ms in Ruhe, p95 12 ms beim Zoomen, doppelt gezeichnet 1–2 Bilder wie in §9.4 |
| Erster Versuch mit `cameraForBounds` (verworfen, E-SR-23) | Startansicht 1 091–1 115 Striche = −17 % gegen vorher — gemessen, bevor es jemand sah |
| Bild | `seewetter-riffel/sr10-hineingezoomt.png` (Nordfriesland, nach fünf Rad-Schritten): Bögen und Fäden wie zuvor, lockerer |

**Die fünf Fragen.** 1 *Funktionserhalt:* nichts entfernt. 2 *Desktop pixelgleich:* nein, gewollt (Tempo; weniger
Bögen hinter der Startansicht); kein CSS, kein Markup. 3 *Touch-Ziele:* keine berührt. 4 *Konsole:* in dieser Messung
nicht mitgeschrieben. 5 *Long Tasks:* nicht eigens gemessen; Rechenzeit je Bild höchstens 12 ms (p95 beim Zoomen).

**Nicht geprüft:** Jans Chrome und ein echtes Telefon; das Tempo mit dem Auge; wie weit Jan hineingezoomt hatte, als
es ihm zu viele waren (der volle Abzug gilt ab EINER Stufe — liegt sein Eindruck tiefer oder flacher, ist `levels` die
Zahl); ob beim Herauszoomen das Zurückkehren der vollen Zahl auffällt (die Plätze füllen sich über 30 Bilder).

### 10.4 Befunde

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| **V-SR-16** | Der Abzug hängt an der Zoomstufe, nicht daran, wie viele Bögen wirklich zu sehen sind. Hineingezoomt in ruhiges Wasser (Ostsee, Förden) stehen ohnehin wenige; dort nimmt die Regel noch ein Viertel weg | Falls es dort zu leer wirkt: statt der Zoomstufe die Zahl der SICHTBAREN Pakete (Stärke über der Grenze) deckeln — Jans Blick |
| **V-SR-17** | `cameraForBounds` der Karte rechnet den gesetzten Innenabstand der Karte mit (`setPadding` für Legende und Leisten) — wer daraus „die Startansicht“ ableitet, bekommt eine andere als die, mit der die Karte startet | Merker für jede künftige Regel „relativ zur Startansicht“ auf dieser Karte: aus Kartengröße und Grenzen selbst rechnen (`rippleZoomIn`) |

## 11. Phase SR-E (19.11.2026): Tempo nochmals 15 % langsamer

Jans dritter Blick (19.11.): „die Strömung jetzt nochmal etwas langsamer, 15 % langsamer“.

**E-SR-24:** `RIPPLE_TEMPO.pxPerSec` 38 → **32,3** (= 38 − 15 %, Jans Zahl). 0,1 m/s ⇒ 6 px/s, 0,3 ⇒ 14, 1 ⇒ 32,
2 ⇒ 52; Boden 4,0 px/s. Verlauf der einen Zahl am 19.11.: 60 → 48 → 38 → 32,3.

**Was das heißt (gegen das lineare Tempo vor SR-B):** bei mittlerem Strom (0,3 m/s, der Median des Felds vom 19.11.)
ist es praktisch wieder das Tempo von vorher (13,9 gegen 13,5 px/s). Geblieben ist die Form der Kurve: schwacher
Strom läuft sichtbar (0,1 m/s: 6,4 statt 4,5 px/s, das 1,4-Fache), starker rast nicht (1 m/s: 32 statt 45 px/s, das
0,72-Fache); der Schnittpunkt liegt bei 0,33 m/s. Der große Unterschied zu vorher bleibt E-SR-15: die Ebene bewegt
sich in Jans Chrome überhaupt.

| Prüfung | Ergebnis |
|---|---|
| `verify:sea-ripples` | **122/122**; H1–H4 auf 32,3 px/s nachgezogen (vier Prüfungen am alten Wert rot), H2 nennt den Schnittpunkt |
| `npm run typecheck` · `npm run build` · `npm run budget` | grün · grün (281/281) · grün, totalJs unter 2 047 |
| Im Browser | **nicht neu gemessen** — geändert ist eine Zahl in der Tempo-Funktion; Bildrate, Zählung und Zeichnen sind die aus §10.3 |
| Mutationen | nicht neu gelaufen; „Tempo des Standes davor“ ist dieselbe Gegenprobe wie in §9.4 und §10.3 (H1–H4 bemerken sie) |

**Nicht geprüft:** das Tempo mit dem Auge, Jans Chrome, ein echtes Telefon.

## 12. Phase SR-F (19.11.2026): Tempo ein viertes Mal langsamer (−15 %)

Jan (19.11.): „kannst du nochmal um 15 % langsamer machen?“

**E-SR-25:** `RIPPLE_TEMPO.pxPerSec` 32,3 → **27,455** (= 32,3 − 15 %). 0,1 m/s ⇒ 5,5 px/s, 0,3 ⇒ 11,8, 1 ⇒ 27,5,
2 ⇒ 44,6; Boden 3,4 px/s. Verlauf der einen Zahl am 19.11.: 60 → 48 → 38 → 32,3 → 27,455.

**Was das heißt (gegen das lineare Tempo vor SR-B):** jetzt **langsamer als vor allen Änderungen**, sobald der Strom
über 0,19 m/s liegt — bei 0,3 m/s (Median des Felds vom 19.11.) 11,8 statt 13,5 px/s (das 0,88-Fache), bei 1 m/s 27
statt 45 (das 0,61-Fache). Nur schwacher Strom läuft noch schneller als damals (0,1 m/s: 5,5 statt 4,5 px/s). Rund
ein Viertel des Wassers bewegt sich damit unter 6,6 px/s.

| Prüfung | Ergebnis |
|---|---|
| `verify:sea-ripples` | **122/122**; H1–H4 auf 27,455 px/s nachgezogen (am alten Wert rot), H2 nennt den neuen Schnittpunkt |
| `npm run typecheck` · `npm run build` · `npm run budget` | s. Lauf dieser Phase (grün, totalJs unter 2 047) |
| Im Browser · Mutationen | **nicht neu** — eine Zahl in der Tempo-Funktion; Bildrate, Zählung und Zeichnen wie §10.3 |

**Nicht geprüft:** das Tempo mit dem Auge, Jans Chrome, ein echtes Telefon.
