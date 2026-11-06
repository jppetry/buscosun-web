# Autobahnwetter — „Fahrerblick" für „Was auf der Fahrbahn liegt" (Phase DV)

> Stand: 2026-11-06 · Auftrag: Jan, 06.11. (Startprompt „Phase DV") · Vorlage: `reference/fahrerblick/FahrerblickSzene.dc.html` (Design-Canvas-Mock, kein Produktionscode)
> Phase **DV**, Entscheidungen `E-DV-n`, Setzungen `S-DV-n`, Befunde `V-DV-n`. Stand: **umgesetzt 06.11., uncommitted, Schalter AN seit 06.11. (E-DV-1)** (§6 Umsetzung und Gate, §8 Einschalten; Jans Schritte `MANUELLE-SCHRITTE.md` §87).

## 0. Auftrag

In der Detailansicht eines Abschnitts („Was auf der Fahrbahn liegt", `RoadHazardDetail.tsx`) soll es neben dem schematischen
Querschnitt eine zweite, realistischere Darstellung geben: den Blick aus dem Auto auf die Autobahn. Die **Fahrbahn** zeigt den
gemessenen Zustand (Sensor), das **Wetter** zeigt die führende Gefahr. Der Querschnitt (`RoadCrossSection.tsx`) bleibt
unangetastet und bleibt die Voreinstellung; die neue Ansicht kommt hinter einem Schalter, voreingestellt aus.

## 1. Diagnose — was der Querschnitt heute zeigt und was er nicht zeigen kann

Am Code gelesen (`RoadCrossSection.tsx`, `roadHzView.ts`, `roadDeck.css`, Stand `522c982c`):

| Baustein | Ist | Stelle |
|---|---|---|
| Bild | ein SVG `viewBox 0 0 338 118`: Himmel 0–64, Deckschicht 2–9 Einheiten über der Kante bei 64, Asphalt 64–98, Unterbau 98–118 | `RoadCrossSection.tsx:26–60` |
| Zustand (8 Arten) | als dünnes Band über dem Asphalt: nass = blaue Schicht `filmMm × 22` (2–9 Einheiten), feucht = 2 Einheiten, Reif = Zackenlinie, Eis = 6 Einheiten, Schnee = Wellenkontur, unbekannt = Schraffur + „?", nicht gemessen = gestrichelter Rahmen | `:49–56` |
| Wetter | je Gefahr eine Szene im Himmel (`sky()`), je Element eine eigene CSS-Animation mit `--y0/--y1`; auf der Oberfläche `surfaceFx()` | `:110–266`, `roadDeck.css:1019–1067` |
| Texte | im SVG: Luft, Taupunkt · Feuchte, Quelle, Gefahren-Marke, Zustand, Fahrbahntemperatur, Fußnote „Querschnitt schematisch, Schichtdicke überhöht" | `:37–60` |
| Gefahr voraus | Szene mit `is-ahead` auf 0,7 gedimmt, Marke „ab HH:MM · Prognose" | `:22`, `roadDeck.css:1020` |
| Wahl der Szene | stärkste Gefahr jetzt, sonst die erste im Fenster; Dev-Schalter `?xsfx=<gefahr>:<stufe>[:ab]` / `localStorage.awxsfx` | `RoadHazardDetail.tsx:132–154` |

**Befund 1 — Der Schnitt zeigt Schichten, nicht die Lage des Fahrers.** Sieben der sechzehn Gefahren sind im Schnitt nur ein
Symbol, weil ihnen die Tiefe fehlt:

- **Nebel:** ein Schleier aus Ellipsen. Dass die Sicht mit der Entfernung fällt, ist nicht darstellbar.
- **Gischt:** graue Kreise auf der Oberfläche. Der Lkw, hinter dem sie entsteht, fehlt.
- **Tiefe Sonne:** eine Sonne rechts oben. Dass sie in Fahrtrichtung steht und auf nasser Fahrbahn blendet, fehlt.
- **Seitenwind:** waagerechte Striche. Kein Maß für die Stärke außer der Strichzahl.
- **Bäume, Teile:** fliegende Blätter. Auf der Fahrbahn liegt nichts.
- **Blow-up:** Hitzelinien. Die Betonfuge und die aufgewölbte Platte fehlen.
- **Hagel:** fallende Körner. Liegender Hagel fehlt.

**Befund 2 — Die Zustände unterscheiden sich um wenige Einheiten.** „feucht" (2 Einheiten) und „nass" bei 0,1 mm Film
(2,2 Einheiten) sind praktisch gleich. Spiegelung, Pfützen in den Fahrspuren, weniger Reif in den Rollspuren und Schneespuren
gibt es im Schnitt nicht.

**Befund 3 — Text im SVG schrumpft mit der Breite.** Die Marke hat 8,6 Einheiten, die Fußnote 9, die Quelle 9,5. Bei einer
Spaltenbreite von 340 px (Mobil) ist eine Einheit ≈ 1 px, also 8,6–9,5 px Schrift. Die neue Ansicht legt den Text deshalb als
HTML über das Bild (≥ 12 px), statt ihn mitzuskalieren.

**Befund 4 — Bewegung läuft je Element auf dem Hauptthread.** Bis zu 44 Regenlinien, 42 Flocken und 34 Staubkörner tragen je
eine eigene Animation innerhalb eines SVG; jede Bewegung malt das SVG neu. Bei der kleinen Fläche heute unkritisch, bei einem
Bild mit Rauschfiltern nicht.

**Befund 5 — Zwei feste ids im Schnitt.** `awSky` und `awXsHatch` sind nicht je Instanz eindeutig (die übrigen vier sind es über
`useId`). Bei zwei Schnitten auf einer Seite stehen sie doppelt im DOM; der Inhalt ist gleich, sichtbar wird es nicht. Nicht
Teil dieser Phase (V-DV-1).

**Was bleiben muss (Funktionserhalt):** jede Angabe des Schnitts — Luft, Taupunkt, Feuchte, Quelle, Marke mit exakt demselben
Wortlaut, Zustand, Fahrbahntext, Ehrlichkeitsnote —, die Regeln „unbekannt wird nicht als Zustand gemalt" und „nicht gemessen
wird nicht als Zustand gemalt", die Dimmung einer Gefahr voraus, der Stillstand unter `prefers-reduced-motion`.

## 2. Plan

1. **Schalter** `ROAD_XS_VIEW: 'schematic' | 'driver'` in `roadFlag.ts`, Voreinstellung `'schematic'`; `?xsview=driver|schematic`
   schlägt `localStorage.xsview`, das schlägt die Konstante (dieselbe Reihenfolge wie `?road`, `?roadhz`, `?rsfc`, `?roadvs`).
2. **Komponente** `src/road/RoadDriverView.tsx`, dieselben Props wie der Schnitt (`{ xs, fx }`), reines SVG + CSS, keine
   neue Abhängigkeit, kein WebGL. Geometrie einmal auf Modulebene; `rnd` wird aus `RoadCrossSection.tsx` exportiert und
   wiederverwendet (einzige Änderung an der Datei: das Wort `export`).
3. **Aufbau in drei Ebenen:**
   - *Standbild* (ein SVG, `role="img"`): Himmel, Hügel, Bankett, Fahrbahn mit Zustand, Leitplanken, stehende Teile der Gefahr
     (Sonne, Wolkenwalze, Fugen, liegender Hagel, Ast, Lkw). Es enthält keine Animation und wird je Szene einmal gemalt —
     die Rauschfilter (`feTurbulence`) laufen damit nicht in jedem Frame.
   - *Wetter* (darüber, `aria-hidden`): je Niederschlags-, Wind- und Staubschicht ein eigenes kleines SVG mit einem
     `<pattern>`-gefüllten Rechteck; bewegt wird das SVG-Element selbst um genau eine Kachel je Zyklus (`transform` in
     Prozent der eigenen Größe). Das ist eine reine Compositor-Animation. Blitz und Nebelbänke ebenso.
   - *HUD* (HTML über dem Bild, ≥ 12 px): Luft / Taupunkt · Feuchte, Quelle, Marke, Fahrbahntext + Zustands-Chip, Note
     „Fahrerblick stilisiert, kein Kamerabild". Ab ≤ 767 px rückt das untere Feld unter das Bild.
4. **CSS** in `roadDeck.css` unter `aw-dv-*`; `aw-xs-*` bleibt unberührt.
5. **Einbau:** `RoadHazardDetail.tsx` wählt die Komponente; der Fahrerblick ist ein eigener Lazy-Chunk, solange der
   Schalter aus ist, lädt ihn niemand. `?xsfx=` gilt für beide Ansichten.
6. **Verifier** `verify:road-driver` (ohne Browser): rendert die echte Komponente für 8 Zustände ohne Gefahr und alle
   16 Gefahren in jeder Stufe, jetzt und „ab".
7. **Belege:** Screenshots 1440 × 900 und 390 × 844 (DPR 3), Long-Task-Messung beim Abschnittswechsel, Budget.

## 3. Schalter und Rückfall

| Schalter | Voreinstellung | Wirkung | Rückfall |
|---|---|---|---|
| `ROAD_XS_VIEW` (`roadFlag.ts`) | `'schematic'` bis zum Gate, **`'driver'` seit E-DV-1 (§8)** | welche Darstellung unter „Was auf der Fahrbahn liegt" steht | `'schematic'` = die Seite von vorher |
| `?xsview=driver` / `?xsview=schematic` | — | je Besucher; wird in `localStorage.xsview` gemerkt, weil die Seite ihre Query neu schreibt | `?xsview=schematic` |

Kein Datenvertrag, kein Datenprodukt, kein Schalter einer anderen Linie ändert sich.

## 4. Gate-Liste

1. `npm run typecheck`, `npm run build`, `npm run budget` — eagerJs unverändert gegen die Basis vor der Änderung.
2. `verify:road-driver` grün, Zahl neu gezählt.
3. Screenshots: 8 Zustände ohne Gefahr, 16 Gefahren (Stufe 2, Staub 1), ein Fall „ab", Schalter aus = Schnitt unverändert.
4. Die fünf Selbstverifikations-Fragen (Funktionserhalt, Desktop pixelgleich mit Schalter aus, Touch-Ziele, Konsole,
   Long Tasks).
5. Hinweis an Jan: Real-Device-Prüfung der Filter auf einem Mittelklasse-Android.

## 5. Setzungen und Abweichungen von der Vorlage (Jan darf jede umstoßen)

| Nr | Setzung | Grund |
|---|---|---|
| S-DV-1 | Der Fahrerblick ist ein **eigener Lazy-Chunk** (`lazy(() => import('./RoadDriverView'))`), nicht Teil des Detail-Chunks. | Solange der Schalter aus ist, lädt ihn niemand (9,3 KB gzip). |
| S-DV-2 | **Bewegung über den Compositor:** jede Regen-, Schnee-, Hagel-, Wind-, Staub- und Blätterschicht ist ein eigenes SVG mit einem `<pattern>`-gefüllten Rechteck; bewegt wird das SVG-Element (`transform` in Prozent seiner Größe = ganze Kacheln). Nebelbänke, Aufblitzen, Blitz und Gischtfahne ebenso als eigene Elemente. Die Vorlage bewegt Rechtecke *im* SVG (SMIL). | Das Standbild mit den Rauschfiltern wird je Szene einmal gemalt, nicht je Frame (§6.4). |
| S-DV-3 | „unbekannt" und „nicht gemessen" bekommen den **neutralen Himmel** (grau-weiß), die Vorlage den klaren blauen. | Ohne Messung weiß die Seite auch nichts über das Wetter; Blau über grünem Bankett sähe nach „alles gut" aus. |
| S-DV-4 | **Glasfeld 0,66** Deckkraft (Vorlage 0,52 / 0,42 / 0,6), Chip „Wasserfilm" `#2B66A8` (Vorlage `#5E97D1`). | Kontrast ≥ 4,5 : 1 auch über Schnee und Sonnenkranz: Weiß auf `#5E97D1` hätte 3,1 : 1, die Schrift auf Glas 0,52 über Weiß ≈ 3,9 : 1. |
| S-DV-5 | Der **Blitz** steht zwischen den HUD-Feldern und reicht bis zum Horizont (Vorlage: x 150, unter dem Luft-Feld). | Im HTML-HUD läge er sonst verdeckt. |
| S-DV-6 | Bei einer **Gefahr voraus** sind auch die stehenden Teile der Gefahr auf 0,7 gedimmt (Gefahren-Himmel, Sonne, Wolkenwalze, liegender Hagel, Ast, Lkw), nicht nur die Wetterebene. | Regel des Querschnitts: was erst später beginnt, wird blass gezeichnet. |
| S-DV-7 | Die **Blätterschicht** wandert (−240, +80) je Zyklus, die Vorlage (−120, +40). | 40 ist keine ganze Kachelhöhe (80) — die Schleife hätte gesprungen. |
| S-DV-8 | **Stufen** wirken auch dort, wo die Vorlage nur ein-/ausschaltet: Spritzringe 10/18/26, liegender Hagel 24/48/70 Körner, Plattenhub 2/3/4,5 Einheiten, Windgeschwindigkeit, Sonnenkranz. | Auftrag: „density/intensity grows with level". |
| S-DV-9 | **HUD-Farben als Konstanten** (`DV_HUD`, `DV_CHIP`) in der Komponente, an das CSS über Custom Properties gereicht. | Der Verifier rechnet den Kontrast an den Konstanten, nicht an Stichworten im CSS. |
| S-DV-10 | Ohne Gefahr ist das Bild **völlig still** (der Querschnitt zeigt dann ziehende Wolken bzw. Glitzern). | Kein Wetter behaupten, wo keine Gefahr erkannt ist; null Laufzeitkosten. |

Außerhalb der im Auftrag genannten Dateien angefasst (je mit Grund):

- `src/router/pages/RoadRoute.tsx` — ein Aufruf `rememberRoadXsView(loc.search)` neben den vier bestehenden `remember…`-Aufrufen
  (die Seite schreibt ihre Query neu, bevor die Detailansicht montiert; ohne das wäre `?xsview=` wirkungslos) und, nur im
  Dev-Build, `rememberRoadXsFx(loc.search)` (V-DV-2).
- `scripts/lib/cdpBrowser.mjs` — optionaler Parameter `gpu` (lässt `--disable-gpu` weg); Voreinstellung unverändert (V-DV-4).

## 6. Umsetzung und Gate (06.11.2026)

### 6.1 Dateien

| Datei | Änderung |
|---|---|
| `src/road/RoadDriverView.tsx` | neu — Komponente, Geometrie auf Modulebene, Rezepte je Zustand und Gefahr, `DV_HUD`/`DV_CHIP`/`DV_NOTE`/`driverTag` |
| `src/road/RoadCrossSection.tsx` | ein Wort: `export const rnd` |
| `src/road/roadFlag.ts` | `RoadXsView`, `ROAD_XS_VIEW = 'schematic'`, `roadXsViewFrom`, `rememberRoadXsView`, `rememberRoadXsFx` (Dev) |
| `src/road/RoadHazardDetail.tsx` | Lazy-Import, `xsView`, Auswahl der Komponente (`?xsfx=`-Logik unberührt) |
| `src/road/roadDeck.css` | 65 Zeilen angehängt, 0 entfernt; 59 Selektoren, alle mit `.aw-dv`, 9 `@keyframes awDv*` |
| `src/router/pages/RoadRoute.tsx` | zwei Aufrufe (s. §5) |
| `scripts/verify-road-driver.mjs`, `package.json` | neuer Verifier `verify:road-driver` |
| `audit/autobahn-fahrerblick/shots.mjs`, `page.mjs` | Werkzeuge für Bilder und die Prüfung in der echten Seite |
| `scripts/lib/cdpBrowser.mjs` | Parameter `gpu` |

### 6.2 Prüfläufe

| Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` | grün (Exit 0) |
| `npm run build` | grün (Exit 0; SEO-Prüfung 277/277) |
| `npm run budget` | **rot — schon vor der Änderung** (Basis-Build desselben Arbeitsbaums vor dem ersten Edit): eagerJs 115,6 KB > 115 KB, totalJs 1 987,2 KB > 1 985 KB. Nach DV: eagerJs **unverändert** (118 332 → 118 331 Bytes gzip, die zwei Eager-Dateien), totalJs 1 997,9 KB (+10 881 Bytes: `RoadDriverView` 9 323, `roadFlag` +91, `RoadHazardDetail` +69, Rest Verweise), largestChunk unverändert 278,4 KB. Grenze nicht angehoben (V-DV-6). |
| `verify:road-driver` | **26/26** (neu gezählt; 220 gerenderte Szenen, 84 Fälle Gefahr × Stufe × jetzt/ab, 128 Paare Zustand × Gefahr, 304 bewegte Schichten, 1 962 `url(#…)`-Verweise, 15 Kontrastpaare, kleinster Kontrast 4,77 : 1) |
| `audit/autobahn-fahrerblick/page.mjs` gegen den Dev-Server, echte GPU, Bewegung an | **15/15** (P1–P8, P10) |
| dasselbe gegen den Produktions-Build (`vite preview`), `--only=tasks,idle,scene` | **8/8** (P9 × 2, P9b, P11 × 3, P12, P10) |
| `verify:road-ui` gegen den Produktions-Build | s. §6.6 |

### 6.3 Bilder

Erzeugt mit `verify:road-driver --dump` (echte Komponente, echtes CSS, selbst gehostete Schriften) und
`audit/autobahn-fahrerblick/shots.mjs`; Ablage `%TEMP%\dv-shots\` (nicht im Repo, 2 × 115 PNG ≈ 50 MB):

- `png\` — **mit Bewegung** (`prefers-reduced-motion: no-preference` ausdrücklich gesetzt), `png-reduce\` — **Stillstand**.
  Je Satz: `zustaende-desktop*` / `zustaende-mobil-*` (8 Zustände ohne Gefahr), `gefahren-desktop*` / `gefahren-mobil-*`
  (16 Gefahren, Stufe 2, Staub 1), `stufen-desktop*` (alle 42 Stufen), `voraus-*` („ab 14:00"), `querschnitt-desktop*`
  (dieselben 16 Szenen im Querschnitt, zum Vergleich). Desktop 1440 × 900 (DPR 1), Mobil 390 × 844 (DPR 3).
- `page\` — die **echte Seite** (Dev-Server, Live-Daten, A 71 Gräfenroda): `p1-desktop-schalter-aus*`, `p2-desktop-schalter-an*`,
  `p6-driver-ab`, `p6-schematic-ab`, `p7-desktop-<gefahr>-<stufe>` (16), `p8-mobil-schematic*`, `p8-mobil-driver*`,
  `p8-mobil-driver-gischt-2`, `p8-mobil-driver-nebel-2-ab`.
- Gemessen in den Galerien: Bühne 440 × 247 px (Desktop-Dossier) bzw. 366 × 206 px, kleinste Schrift 12 px, League Spartan
  geladen, kein HUD-Feld außerhalb der Karte, keine zwei HUD-Felder überlappen (alle Seiten, beide Sätze).

Die acht Zustände kommen aus der Galerie, nicht aus `?xsfx=`: der Dev-Schalter erzwingt eine Gefahr, den Sensorzustand kann er
nicht erzwingen. Die Galerie baut die Zustände mit der echten `crossSectionOf()` aus je einem Messpunkt-Fixture.

### 6.4 Leistung

Gemessen mit `page.mjs` am **Produktions-Build**, Chromium 148 mit der GPU des Rechners (Intel UHD, Direct3D 11), Bewegung an,
beide Ansichten im Wechsel innerhalb eines Laufs (2 Sitzungen × 16 Abschnittswechsel je Ansicht, Abschnitt mit echter Gefahr):

| Messung | Querschnitt | Fahrerblick |
|---|---|---|
| Klick „Nächster Abschnitt" → nächster Frame, Median / p90 / max | 156 / 183 / 209 ms | 137 / 180 / 289 ms |
| Hauptthread-Aufgaben > 200 ms beim Wechsel | keine | keine |
| dasselbe ohne Bewegung (reduced motion): Median / p90 / max | 109 / 131 / 176 ms | 111 / 131 / 146 ms |
| in Ruhe, 3 s in der echten Seite: Malzeit auf dem Hauptthread | 467 ms | 0 ms |
| in Ruhe, jede der 16 Szenen allein: Paint-Ereignisse je Sekunde (Summe) | 11 | 0 |
| eine Szene neu einsetzen → nächster Frame (42 Stufen, Desktop) | — | Median 64, max 94 ms |
| dasselbe mit Mobil-Emulation 390 × 844, DPR 3 (24 Szenen) | — | Median 17, max 19 ms |

Der Wechsel selbst ist in beiden Ansichten JavaScript der Seite (`FunctionCall`: React und die Auswertung des neuen
Abschnitts); der Fahrerblick fügt dem Median nichts Messbares hinzu. In Ruhe malt der Fahrerblick nicht — die Bewegung
läuft auf dem Compositor, wie geplant. Der einzelne Höchstwert 289 ms ist die Zeit bis zum Frame, keine einzelne Aufgabe.

**Was diese Messung nicht ist:** kein Telefon, keine schwache GPU. Mobil-Emulation skaliert die Pixel, nicht die Hardware.

### 6.5 Die fünf Selbstverifikations-Fragen

1. **Funktionserhalt, einzeln.** Luft, Taupunkt, Feuchte, Quelle, Fahrbahntext, Zustand, Ehrlichkeitsnote: je Zustand im
   Markup (B1). Marke Wort für Wort wie im Querschnitt, auch „· Prognose" bei Nachweis p und „ab HH:MM" (C1, C2: beide
   Komponenten gerendert und verglichen). Farbe der Marke = `AW_SEV_TINT` (C3). Gefahr voraus gedimmt (C4). „unbekannt" und
   „nicht gemessen" nicht als Zustand gemalt (B2). Stillstand unter reduced motion, Blitz 0,9, Aufblitzen aus (F3; Bilder
   `png-reduce\`). `?xsfx=` in beiden Ansichten (P6). Der Querschnitt selbst: `git diff` = das Wort `export`; rendert wie
   bisher (H2). Die Fußnote „Querschnitt schematisch, Schichtdicke überhöht" heißt im Fahrerblick „Fahrerblick stilisiert,
   kein Kamerabild" — so beauftragt.
2. **Desktop pixelgleich mit Schalter aus.** Ohne Parameter steht im Dossier ein `.aw-hz-xs` und kein `.aw-dv`, nichts in
   `localStorage` (P1; Bild `p1-desktop-schalter-aus`). Das CSS gewinnt nur Regeln mit `.aw-dv` (65 Zeilen dazu, 0 entfernt).
   **Nicht gemacht:** ein Pixelvergleich gegen einen Build von HEAD. Mit Schalter **an** stehen Artikel, Kacheln,
   Richtungsschalter, Überschrift und Textspalte pixelgleich (x, y, Breite); nur die Bildspalte wird höher (440 × 185 →
   440 × 278 px; die Textspalte daneben war im Test ohnehin höher, die Artikelhöhe blieb gleich) (P3).
3. **Touch-Ziele ≥ 44 px.** Das Bild hat kein bedienbares Element (0 Links, Buttons, Tabindex) — es kommen keine Ziele hinzu (P4).
4. **Konsole sauber.** Keine ungefangene Ausnahme, kein `console.error` in allen Abläufen von `page.mjs` (P10), Dev- und
   Produktions-Build.
5. **Keine Long Tasks > 200 ms.** Mit echter GPU am Produktions-Build: keine, in beiden Ansichten (§6.4). Im
   Software-Renderer (SwiftShader) gibt es sie in **beiden** Ansichten (Querschnitt bis 2 256 ms, Fahrerblick bis 1 311 ms,
   Streuung über das Zehnfache) — dort ist keine Aussage möglich (V-DV-4). Real-Device steht aus (V-DV-7).

### 6.6 `verify:road-ui` (Bestand)

Lauf gegen den Produktions-Build dieser Phase (`--base=http://127.0.0.1:4188`): **abgebrochen, kein Ergebnis** — eine Ausnahme in
Block D (`verify-road-ui.mjs:300`, `.aw-band-tick[3]` gibt es nicht): die Seite ohne Gefahren-Leiste (`roadhz=0`) zeigte auf dem
eingefrorenen Datenbestand binnen 30 s keine Bandmarken. Der Abbruch liegt vor jedem Schritt, der die Detailansicht öffnet; die
Dateien dieser Phase liegen nicht auf diesem Pfad (Route: zwei `remember…`-Aufrufe; CSS: nur `.aw-dv`). **Nicht gegengeprüft:** ob
der Verifier an HEAD ebenso abbricht (die Seite wurde nach seinem letzten Stand `a934c572` mehrfach umgebaut: `ce351049`,
`65d420f9`, `fc182e18`, `394ae786`). Damit ist `verify:road-ui` für diese Phase **kein Beleg, weder dafür noch dagegen** (V-DV-12).

## 7. Befunde (V-DV)

| Nr | Befund | Mehrwert | Skizze |
|---|---|---|---|
| V-DV-1 | Der Querschnitt trägt zwei feste ids (`awSky`, `awXsHatch`); bei zwei Schnitten auf einer Seite stehen sie doppelt im DOM. | Sauberes DOM, kein Risiko, falls je zwei Abschnitte nebeneinander stehen. | `useId` wie bei den übrigen vier ids. Nicht in dieser Phase (Datei bleibt unangetastet). |
| V-DV-2 | `?xsfx=` in der Adresse wirkte beim Einstieg über einen Abschnittslink nicht — auch im Querschnitt nicht: die Route räumt die Query weg, bevor die Detailansicht montiert (gemessen: P6 zeigte in beiden Ansichten die echte Szene). **Behoben, nur Dev-Build:** die Route merkt sich die Stimme in `localStorage.awxsfx` (den Schlüssel, den die Detailansicht ohnehin liest); `?xsfx=off` löscht sie. | Sichtprüfung per Adresse statt per Konsole. | erledigt (`rememberRoadXsFx`, im Produktions-Bundle nicht enthalten: kein `awxsfx` in `dist/`). |
| V-DV-3 | Auf diesem Rechner sind die Windows-Animationseffekte aus; Chromium meldet dann `prefers-reduced-motion: reduce` — auch das eigene headless Chromium. Die ersten Bilder und Messungen dieser Phase zeigten deshalb unbemerkt den **Stillstand** (`document.getAnimations()` = 0). Aufgefallen an der Gegenprobe: auch der alte Querschnitt „malte" in Ruhe 0 ms. | Prüfungen bewegter Szenen sind sonst wertlos, ohne rot zu werden. | `shots.mjs` und `page.mjs` setzen die Media-Eigenschaft ausdrücklich (`no-preference` bzw. `--reduce=1`). Für andere Verifier mit Animationen gilt dasselbe. |
| V-DV-4 | Long-Task-Messung im Software-Renderer (SwiftShader) ist unbrauchbar: bei beiden Ansichten Aufgaben bis über 2 s, drei gleiche Läufe zwischen 52 und 1 067 ms; mit Bewegung braucht schon die Seite ohne Fahrerblick 11 Minuten bis zum ersten Prüfschritt. | Ein Leistungs-Gate, das am Bestand rot ist, sagt nichts über die Änderung. | `openBrowser(…, { gpu: true })` mit dem vollen Chromium aus ms-playwright (`--headless=new --use-angle=d3d11`), Produktions-Build, Ansichten im Wechsel, Median/p90. So in `page.mjs --gpu=1`. |
| V-DV-5 | Im Dossier bei 1440 px ist die Textspalte neben dem Bild 178 px breit (Bild 440 + Abstand 20 in ≈ 640 px). Das war schon so; neben dem höheren Fahrerblick wird die schmale Spalte länger. | Lesbarkeit des Detailtexts. | Unter ≈ 1 600 px Bild und Text untereinander (wie schon ≤ 1439 px), oder das Bild auf 360 px begrenzen. Eigene Entscheidung, nicht Teil von DV. |
| V-DV-6 | `npm run budget` ist am Arbeitsbaum schon ohne DV rot (eagerJs +0,6 KB, totalJs +2,2 KB über der Grenze). DV legt 10,6 KB auf totalJs. | Die Ratsche schützt erst wieder, wenn sie grün ist. | Mit den offenen Linien gemeinsam anheben (Notiz in `budget.json`), nicht je Phase. |
| V-DV-7 | Real-Device steht aus: zwei bis drei `feTurbulence`-Flächen, ein Weichzeichner für Spiegelung/Gischt/Nebel, drei bis sechs bewegte Compositor-Ebenen. Gemessen ist nur Desktop mit integrierter Intel-Grafik. | Mittelklasse-Android ist die Zielhardware der mobilen Nutzung. | Jan: `/autobahnwetter?xsview=driver` auf dem Gerät, Abschnittswechsel und Scrollen. Wenn es ruckelt: Rauschfilter durch eine vorgerechnete Kachel (PNG/`<pattern>`) ersetzen. |
| V-DV-8 | „trocken" ohne Gefahr malt einen klaren Himmel, obwohl die Bewölkung nicht bekannt ist (die Vorlage will es so; der Querschnitt malt dort Schönwetterwolken). | Ehrlichkeit des Bilds. | Bewölkung des Abschnitts aus buscosun Fusion (liegt im Lauf der Streckenprognose) als Himmelsschlüssel; bis dahin neutraler Himmel auch für „trocken"? Jans Entscheidung. |
| V-DV-9 | Der Dev-Schalter `?xsfx=` begrenzt die Stufe auf 3, nicht auf die höchste Stufe der Gefahr (`gischt:3`, `staub:3` sind erzwingbar, in den Daten gibt es sie nicht). Der Fahrerblick fängt das ab. | Sichtprüfung zeigt nur Szenen, die es geben kann. | `Math.min(ROAD_HAZARD_BY_ID[id].max, …)` in `RoadHazardDetail.tsx`. |
| V-DV-10 | `verify:road-ui` (Browser, eingefrorener Datenbestand) kennt den Fahrerblick nicht; die Prüfung in der Seite läuft über `audit/autobahn-fahrerblick/page.mjs` mit Live-Daten und steht nicht in `package.json`. | Regression beim Umlegen des Schalters würde der Dauerprüfer nicht sehen. | Vor dem Umlegen einen Block „X" in `verify:road-ui`: Detail mit `?xsview=driver` auf dem Fixture-Abschnitt A8-034 (Reif Stufe 3) — ein `.aw-dv`, Marke, kein `.aw-hz-xs`. |
| V-DV-11 | In der echten Seite malt der Querschnitt in Ruhe 467 ms je 3 s auf dem Hauptthread (Szene Aquaplaning Stufe 2), der Fahrerblick 0 ms. | Akku und Flüssigkeit auf dem Telefon, solange der Querschnitt Voreinstellung bleibt. | Die Technik von S-DV-2 auf den Querschnitt übertragen — oder den Schalter umlegen. |
| V-DV-12 | `verify:road-ui` bricht am Produktions-Build in Block D ab (Seite ohne Leiste, keine Bandmarken im Fixture-Lauf) und liefert keine Zahl. Ob das an HEAD schon so ist, ist nicht geprüft. | Der Dauerprüfer der Autobahn-Seite ist blind, solange er abbricht. | An sauberem HEAD laufen lassen; wenn dort rot: Block B–F an die heutige Seite anpassen (Voreinstellung der Strecke, Startabdeckung). Eigene kleine Phase. |

## 8. Einschalten (E-DV-1, Jan 06.11.2026)

Jan nach dem Gate-Bericht, wörtlich: „1. passt so 2. passt auch 3. aktiv udn schlate das komplette feature deafault aktiv".

| Nr | Entscheidung |
|---|---|
| E-DV-1 | `ROAD_XS_VIEW = 'driver'` — der Fahrerblick ist die Voreinstellung für alle; `?xsview=schematic` bleibt der Rückweg je Besucher, `'schematic'` + Push der Rückweg für alle. **Vor der Real-Device-Prüfung eingeschaltet** (V-DV-7 bleibt offen). |
| E-DV-2 | S-DV-3 bestätigt: neutraler Himmel bei „unbekannt" und „nicht gemessen". |
| E-DV-3 | S-DV-4 bestätigt: Glasfeld 0,66 und dunklerer Chip „Wasserfilm" für 4,5 : 1. |

Nach dem Umlegen neu gelaufen: `typecheck` grün, `build` grün, `verify:road-driver` 26/26 (A1 nennt `'driver'`),
`page.mjs --only=switch,mobile --gpu=1` gegen den Dev-Server **11/11** (P0: ohne Parameter steht der Fahrerblick, nichts in
`localStorage`; P1/P5: `?xsview=schematic` bringt den Querschnitt zurück, auch gegen eine gemerkte Stimme; Mobil 390 × 844).
`budget` unverändert rot wie vorher (eagerJs 118 340 Bytes gegen 118 332 an der Basis, totalJs 1 998 KB).

Was sich mit dem Einschalten ändert:

- Jeder Besucher eines Abschnitts lädt den Chunk `RoadDriverView` (9,3 KB gzip) nach; bis er da ist, steht ein leerer
  sandfarbener Kasten im Seitenverhältnis des Bilds (kein Sprung im Layout).
- Die Bildspalte im Dossier ist 93 px höher (185 → 278 px); bei wenig Text daneben wird der Artikel entsprechend länger.
- `verify:road-ui` Block U5 liest das aria-label jetzt von `.aw-dv-scene, .aw-hz-xs` (der geprüfte Wortlaut „trocken (Sensor),
  Fahrbahn +18,4" steht in beiden). Der Verifier bricht weiterhin vorher ab (V-DV-12) — die Anpassung ist **nicht gelaufen**.
- V-DV-10 und V-DV-11 sind damit anders gewichtet: der Dauerprüfer sollte den Fahrerblick kennen, bevor gepusht wird; der
  Querschnitt malt nur noch für Besucher mit `?xsview=schematic`.
- Die Abschnitte §3, §5 und §6 beschreiben den Stand am Gate (Schalter aus); die Messungen dort gelten unverändert.
