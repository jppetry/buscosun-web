# Brandradar — Brand-Dossier in der Mitte (Diagnose BD2-0 + Umsetzung BD2, 2026-08-29)

> Jans Auftrag: „Phase BD2 — Brand-Dossier in die Mitte. Vorlage (verbindlich)
> `reference/brandradar-detail.dc.html` + `br-detail-1a-{desktop,tablet,mobile}.png` (Variante 1a).
> Reine Darstellungsphase: Datenpfad, Zeitmodell, Registry, Playback, Permalink, alle Texte
> aus `FIRE_LAYER_INFO` und BD1 bleiben unverändert." Ein Thema, eine Phase, ein Gate (**GBD2**).

## 1. Befund — was heute steht (am Code gemessen)

**Der Ort der Detailkarte.** `FootprintDetail` (`FireFootprintPanel.tsx:616-861`) rendert INNERHALB der
markierten Listenkarte im Readout rechts (Desktop 480 px im Brände-Modus, Tablet 300 px, mobil im
Sheet). Sie ist seit BD1 gegliedert (Kennzahlen · Verlauf · Wetterlage · Einordnung · Merkmale),
aber sie steht in einer 480-px-Spalte: der Verlauf ist 380 × 118 SVG-Einheiten breit, die vier
Kennzahlen stehen in der Kachel darüber, die Wetter-Kacheln stapeln sich einspaltig. Die Karte
bleibt Bühne — und zeigt beim markierten Brand nur die Kontur, die Zahlen stehen daneben.

**Was die Vorlage 1a verlangt und was davon schon da ist.**

| Element der Vorlage | Bestand | Befund |
|---|---|---|
| Topbar-Segment „Karte \| Dossier" | `br-seg`/`br-presets` (Segment-Primitive) vorhanden; Topbar zeigt im Brände-Modus „← Layer-Steckbriefe · Brandradar · Brände" | Segment neu, Primitive wiederverwendet |
| Registry links 250 px mit vier Kennzahlen | `FireFootprintPanel` mit `compact` (Tablet-Modus: zwei Kennzahl-Spalten) | die Komponente kann es schon — nur ihr Ort ändert sich |
| Dossier in voller Restbreite | `FootprintDetail` — alle Inhalte, aber als eine Spalte mit `<dl>` | Inhalte werden in Karten umgruppiert; **keine Zeile fällt** |
| Kennzahlen 4er-Raster mit Untertitel | `Stat` (Kachel) + `.br-fire-stats` | dieselbe Komponente, größer |
| Verlauf auf voller Panelbreite, League Spartan auf den Achsen | `FirePassChart` 380/300 breit, `fontSize 8`, keine `font-family` auf den SVG-Texten ⇒ die Achsen erben die **Browser-Standardschrift des SVG** (Times/Serif), nicht League Spartan — im Readout durch die Kleinheit nicht aufgefallen | **B1:** `font-family` gehört an die SVG-Texte; ein `wide`-Maß (600 × 190 wie die Vorlage) kommt dazu |
| Wetterlage: Zusammenfassung + 4 Kacheln, Steel | `WeatherBlock` liefert bis zu **fünf** Kacheln (Erst, **Letzte Detektion**, Brandtag, Vortage, Jetzt) | die Vorlage zeigt vier — die fünfte (letzte Detektion) **bleibt** (Funktionserhalt), das Raster ist zweispaltig und nimmt sie auf |
| Einordnung & Bestätigung mit Konfidenz · Landbed. · Kartierung · EMS + Ursache-Kasten | BD1 hat **Konfidenz** und **Methode** unter „Kennzahlen" einsortiert, die Vorlage unter „Einordnung" | im Dossier stehen sie unter Einordnung (sortiert, nicht gestrichen); die alte Detailkarte bleibt, wie sie ist |
| Merkmale als Tabelle | `FeaturesRow` (`fire-fp-features`) | 1:1 |
| Minikarte rechts 300 px, markierte Fläche, Klick ⇒ Karte | **kein** zweiter Karten-Instanz-Pfad im Brandradar; `FireMap` ist EINE Instanz mit ~40 Layern und 11 Quellen | **B2:** eine zweite `FireMap` wäre ein zweiter Datenpfad (jede Quelle doppelt gebunden). Die Minikarte wird eine **eigene, leichte** MapLibre-Instanz — Basiskarte + EIN GeoJSON (die Fläche des markierten Brands aus dem vorhandenen `footprintFc`), nicht interaktiv |
| Legende · Detektion; „Nationale Skalen · nie umgerechnet" | `legendRow`, `scalesCard(compact)` in `FirePage` | Legende wird als kleine Karte nachgebaut (drei Zeilen der Vorlage), die Skalen-Zeile ist der `compact`-Satz von `scalesCard` |
| Zeit-Deck unten über die volle Breite | `timeDeck` liegt **absolut über der Karte** (`.br-timedeck { position:absolute }`) | im Dossier-Zustand als Leiste unter dem Body (`is-bar`), derselbe Knoten |

**B3 — die Hauptkarte darf beim Bühnenwechsel nicht sterben.** `FireMap` baut beim Mount Stil,
Quellen, Custom-Layer (ScalarLayer) und lädt Raster nach; ein Unmount beim Wechsel auf „Dossier"
und Remount beim Zurück kostete jedes Mal den kompletten Aufbau (gemessen in BR1: 0,8 s React-Mount
plus Layer-Nachladen) und verlöre Kamera und Layer-Zustand. Deshalb **bleibt die Karte montiert**
und geht nur aus dem Bild (`.fire-center.is-offstage`: `visibility:hidden`, keine Zeigerereignisse);
MapLibre rendert im Hintergrund weiter (V-BD2-1: ein Pausieren wäre ein Eingriff in `FireMap`,
außerhalb dieser Darstellungsphase).

**B4 — Permalink.** Der Bühnenzustand gehört in `#wb=` nach dem Muster `fp`/`ta` (nur die Abweichung
schreiben): `ds: 1` ⇔ Dossier offen. Alle bestehenden Links bleiben byte-gleich (Literal-Anker
in `verifyFireState` unverändert). Welcher Brand markiert ist, stand nie im Hash (die Registry-Kennung
ist sitzungsgebunden, `fireRegistry.ts`) — das bleibt so; ein Link mit `ds=1` öffnet das Dossier
mit dem ausgesprochenen Leerzustand „kein Brand markiert".

**B5 — Mobil.** Die Vorlage zeigt das Dossier als eigene Seite (Kartenstreifen oben, Segment
„Karte | Dossier", „← Brände"). Die Bottom-Bar (Karte · Layer · Brände · Zeit) bleibt; das Dossier ist
eine Seite des Bereichs „Brände" (`mobileTab === 'fires'` + Bühne Dossier). Der Kartenstreifen ist
dieselbe Minikarte (Tippen ⇒ Bühne Karte).

**B6 — Tablet.** Registry als 64-px-Spalte: je gezeigter Brand ein Quadrat (Statusfarbe, markiert
amber), darunter „+N" = der ausgesprochene Deckel (V-246) als Knopf, der die nächste Seite lädt — kein
stilles Kürzen.

## 2. Entscheidungen (Defaults, ohne Rückfrage — Jan kann jede kippen)

- **D1 Auslöser:** Klick auf einen Brand in Karte ODER Registry schaltet auf Dossier (Auftrag). Der
  Fokus-Zoom der Karte läuft trotzdem (unsichtbar), damit „Bühne zurück" den Brand im Bild hat.
- **D2 Dossier ohne Auswahl:** das Segment ist immer erreichbar; ohne markierten Brand steht ein
  benannter Leerzustand mit der Registry links — kein leerer Rahmen.
- **D3 Rückweg:** Minikarte (Klick), Segment „Karte", mobil zusätzlich „← Brände" (zurück zur Liste)
  und die Bottom-Bar „Karte". Die Auswahl bleibt dabei bestehen (die Karte zeigt die Kontur).
- **D4 Registry im Dossier** = dieselbe `FireFootprintPanel`-Instanz mit `compact` (250 px), inklusive
  Sortierung, Filter, Umfang, Deckel, Vorbehalt — nichts wird für die Breite gestrichen.
- **D5 Schrift:** Dossier-eigene Klassen (`.br-ds-*`) mit ≥ 12 px Desktop / ≥ 11 px mobil; Eyebrows
  uppercase, `letter-spacing .16em`; SVG-Achsen mit `font-family: League Spartan`.
- **D6 Konfidenz/Methode** stehen im Dossier unter „Einordnung & Bestätigung" (Vorlage); die alte
  Detailkarte im Readout bleibt unverändert BD1.

## 3. Umsetzung BD2

| Datei | Änderung |
|---|---|
| `src/fire/fireState.ts` | Feld `dossier` ⇔ `ds: 1`; Verifier-Checks (zu ⇒ byte-gleich, offen ⇒ Rundlauf, Fremdwert ⇒ zu) |
| `src/fire/FireFootprintPanel.tsx` | Detail-Bausteine exportiert (`DetailSubline`, `DetailKennzahlenRows`, `DetailConfidenceRows`, `DetailFrpRows`, `DetailVerlauf`, `WeatherBlock`, `DetailEinordnungRows`, `CauseText`/`causeHintsOf`, `FeaturesRow`, `RecordStats`, `Badge`, `Stat`, Beschriftungs-Helfer); `FootprintDetail` setzt sie unverändert zusammen; die Registry im Dossier bekommt `noDetail` |
| `src/fire/FirePassChart.tsx` | `wide` + `wideWidth` (380/560/340 × 160, Schrift 12 px — s. §4.1 (3)), entzerrte Beschriftungen, `font-family` auf allen SVG-Texten (B1) |
| `src/fire/FireMap.tsx` | `basemapStyle` exportiert (Minikarte nutzt dieselbe Basiskarte); `patchLibertyRefLength` auf `style.load` (§4.1 (1)) |
| `src/map/libertyStyle.ts` | additiv `patchRefLengthStyle` (reine Stil-Transformation für `transformStyle`) |
| `scripts/verify-fire-history.mjs` | Weichen-Sonde zählt den dritten Ort (Dossier-Registry) |
| `budget.json` | Ratsche totalJs 1 053,1 → 1 109,8 KB (der Brandradar-Chunk wächst um Dossier + Minikarte; eagerJs unverändert 102,7) |
| `src/fire/FireDossier.tsx` (neu) | das Dossier: Kopf → Kennzahlen (4er-Raster + Zeilen) → Verlauf → Wetterlage → Einordnung & Bestätigung + Ursache → Merkmale; Leerzustand |
| `src/fire/FireMiniMap.tsx` (neu) | leichte MapLibre-Instanz: Basiskarte des Brandradars, Fläche des markierten Brands, Mittelpunkt, `fitBounds`; nicht interaktiv, Klick ⇒ Rückruf |
| `src/fire/FirePage.tsx` | Bühne `stage` (`map`/`dossier`), Topbar-Segment, Dossier-Layout Desktop/Tablet, Mobil-Seite, Zeit-Deck als Leiste, Permalink `ds` |
| `src/fire/fireDeck.css` | Abschnitt „BD2 — Dossier" (Desktop, Tablet ≤ 1439, Mobil ≤ 767) |
| `scripts/verify-fire-detail.mjs` | Sonden: Bausteine geteilt, Dossier verdrahtet, `ds` im Codec, Schriftgrößen, Touch-Ziele |

## 4. Gate GBD2 — Belege

_(wird nach der Umsetzung ausgefüllt)_

**Verifier.** `verify:fire-detail` **59/59** (+15: die zehn Bausteine sind exportiert, die alte Detailkarte setzt
ALLE zusammen, das Dossier setzt dieselben in D6-Ordnung zusammen und hat keinen eigenen Ursache-Text, Ursache-Kasten
in `--br-warn-*`, Wetterlage in Steel `#EAF1F7`/`#C7D6E4`, SVG-Texte mit League Spartan und `wideWidth`-Maß, Minikarte
keine zweite `FireMap`, Segment + `openDossier` + Karten-Klick, Hauptkarte bleibt montiert, `ds` im Codec, Zeit-Deck als
Leiste, Tablet-Rail 64 px mit `+N`, Mobil-Seite mit 44-px-Segment, kleinste Schrift Desktop ≥ 12 / mobil ≥ 11 px aus dem
CSS gerechnet, keine fremden Hex-Farben im Dossier-Block), `verify:fire-model` **122/122** (+4 für `ds`: zu ⇒ byte-gleich,
offen ⇒ Rundlauf, alter Hash ⇒ Karte, Fremdwert ⇒ Karte), `verify:fire-time` **114/114**, `verify:fire-history` 112/113
(die Weichen-Sonde zählt jetzt drei Orte — Readout, mobil, Dossier-Registry; der eine Rest `spreadFc` ist Altbestand seit
dem SF1-Rückzug), `verify:fire-footprint` 72/73 (Altbestand: `fireZones={mapZones}` seit BH3), `verify:fire-clusters`
105/117 (Altbestand, s. BD1). `typecheck` grün.

**Browser (Playwright, Dev-Server :5173; der Chrome-DevTools-Browser war belegt).**

*Desktop 1440 × 900* (`bd2-desktop-map.png`, `bd2-desktop-dossier.png`, `bd2-desktop-dossier-unten.png`): Segment
„Karte | Dossier" in der Topbar; Klick auf den ersten Brand der Registry ⇒ Bühne Dossier, Hash trägt `"ds":1`; Breiten
gemessen **Registry 250 · Dossier 828 · Seite 300 · Zeit-Deck-Leiste 1 378 px**; Hauptkarte `visibility: hidden` mit
weiterhin vorhandenem Canvas (kein Remount); im Dossier alle 19 `<dt>`-Zeilen der Detailkarte (Status · Fläche · Schätzung ·
Erst-/Letztdetektion · Hotspots · ΣFRP · FRP je Überflug · Tendenz · Ausbreitung · FRE · Überflüge · Je Überflug · Konfidenz ·
Methode · Ort · Landbedeckung · Anlage? · Merkmalsatz; Kartierung/EMS/GeoSphere sind bedingt und bei diesem Brand leer wie
vorher), fünf Eyebrows (Verlauf · Wetterlage am Brandort · Einordnung & Bestätigung · Ursache · Merkmale), Wetterlage live
(„feuchte Luft (RH 83 %) · Böen 30 km/h aus SW · 1,8 mm in den 24 h davor"); **kleinste Schrift im Dossier 12 px**, einzige
Nicht-League-Spartan-Familie ist `monospace` für die Kennung (`<code>`); Chart `viewBox 0 0 380 160` in 344 px ⇒ SVG-Text
**12 px** (Faktor 0,90). Minikarte mit MapLibre-Canvas, markierte Fläche amber, Mittelpunkt; Klick ⇒ Bühne Karte, `ds` aus
dem Hash, Auswahl bleibt (Readout zeigt die Zeile markiert **mit** Detailkarte — Funktionserhalt), Segment „Dossier" ⇒ zurück
mit demselben Brand. Registry im Dossier: markierte Zeile im sichtbaren Bereich, keine doppelte Detailkarte.

*Tablet 1024 × 768* (`bd2-tablet-dossier.png`): Rail **64 px**, 50 Quadrate **44 × 44 px** + „+5" (der ausgesprochene
Deckel), Dossier 906 px, Raster `607px 250px`, Minikarte-Spalte 250 px, Einordnung/Merkmale über beide Spalten (871 px —
in 250 px bräche die Zeilentabelle, Abweichung von der Vorlage), Chart `viewBox 0 0 560 160` ⇒ SVG-Text 12,3 px.

*Mobil 390 × 844* (`bd2-mobile-dossier.png`): Auswahl in der Liste ⇒ eigene Seite „Dossier" mit „← Brände" (62 × 44 px),
Titel + Abzeichen, Region, Segment **2 × 44 px**, Kartenstreifen 351 × 150 px, Kennzahlen `156px 156px`, kleinste Schrift
**11 px**, kein horizontaler Überlauf, Bottom-Bar **4 × 44 px**, „Brände" aktiv; „← Brände" ⇒ Liste (bei einem Anlagen-
Eintrag das Segment „Thermalanomalien", TA4); Segment „Karte" ⇒ Karte + Sheet, `ds` aus dem Hash; Chart `viewBox 0 0 340 160`
⇒ SVG-Text 11,3 px.

**Konsole.** Beim Laden 19 Fehler = Altbestand (EMS-CORS, 17 × GeoSphere-404 `getWarningsForCoords`), **0 Warnungen**;
nach dem Öffnen des Dossiers weiterhin 0 Warnungen — s. §4.1.

### 4.1 Drei Befunde aus dem laufenden Bild

1. **Vier Worker-Warnungen „Expected value to be of type number, but found null"** erschienen beim ersten Dossier — zuerst
   der Minikarte zugeschrieben, per `transformStyle` dort korrigiert, und trotzdem blieben zwei. Die Quelle war die
   **Hauptkarte**: der Fokus-Zoom auf einen Brand lädt zum ersten Mal Zoom-12-Kacheln, und der positron-Stil hat dieselben
   drei `ref_length`-Shield-Layer wie liberty (V-RL-3, per Stil-Analyse belegt: die einzigen Zahlenvergleiche mit
   möglichem `null`). ⇒ `patchLibertyRefLength` auf `style.load` in `FireMap` — danach 0 Warnungen. Lehre: eine Warnung,
   die mit einer neuen Komponente auftaucht, kommt nicht deshalb aus ihr.
2. **SVG-`<text>` ohne `font-family`** erbte die Browser-Standardschrift für SVG — im 118-px-Readout-Chart war es nie
   aufgefallen. Jetzt trägt jeder Text `font-family` (B1).
3. **Die Vorlage skaliert 600 SVG-Einheiten auf eine 380-px-Spalte** — 10,5 px Achsenschrift würden als 6,5 px rendern
   und die 12-px-Regel brechen, obwohl das CSS 12 px sagt. ⇒ `wideWidth` je Spalte (380 Desktop, 560 Tablet, 340 mobil),
   damit 12 px auch 12 px sind; und die Beschriftungen entzerren sich (drei Überflüge in 20 min: nur der erste trägt
   Zeitstempel und ☾, die MW-Zahl nur mit Platz; die Tageslinie schweigt neben einem Überflug-Zeichen).

**Fünf Fragen.** (1) Funktionserhalt: jede Zeile der Detailkarte ist ein exportierter Baustein, den Readout UND Dossier
rendern (Verifier-Sonde), Sortierung/Filter/Umfang/Deckel der Registry sind dieselbe `FireFootprintPanel`-Instanz,
Kartenauswahl ↔ Liste (Karten-Klick öffnet das Dossier und markiert die Zeile, Minikarte zurück zeigt die Kontur),
Permalink-Parameter unverändert plus `ds`; (2) Desktop: die Karten-Bühne ist pixelgleich bis auf das Segment in der Topbar
(Auftrag); (3) Touch-Ziele mobil ≥ 44 px gemessen; (4) Konsole ohne neue Fehler und ohne Warnungen; (5) Long Tasks nicht
gemessen (Dev-Server, wie BD1) — der Bühnenwechsel montiert eine leichte MapLibre-Instanz; **V-BD2-1:** die Hauptkarte
rendert offstage weiter (Pausieren wäre ein Eingriff in `FireMap`, nicht Teil der Darstellungsphase). **V-BD2-2:** die
kompakte MapLibre-Attribution steht auf der Minikarte ausgeklappt (Lizenzpflicht, nicht verkleinert — 300 px sind unter der
Klappschwelle).

**Permalink-Leerzustand** (`bd2-desktop-dossier-leer.png`, echter Reload über `about:blank` — ein Hash-Wechsel auf demselben
Pfad lädt die App NICHT neu, WF3-Lehre): `ds=1` ohne markierten Brand öffnet die Bühne Dossier mit dem benannten Leerzustand
„Kein Brand markiert …", die Registry links (50 Zeilen) und rechts „Kein Brand markiert — die Karte zeigt den DACH-Überblick".

## 5. Nachtrag BD2a (2026-08-31) — jeder Brand-Klick auf der Karte öffnet das Dossier

> Jans Auftrag: „ich möchte, dass auch wenn man auf einen Brand klickt auf der Karte,
> dann die Detailansicht geöffnet wird."

**Befund.** BD2 öffnete das Dossier nur über den Brandflächen-Klick (`selectFootprintFromMap`) — der Layer
`fireFootprints` ist aber **standardmäßig aus** (`FIRE_DEFAULT_LAYERS` = Gefahrenindex · Detektionen · Frühere
Brandflächen). Ein Klick auf einen Brand traf im Normalzustand die **Cluster-Hülle** (`selectFromMap`), die nur
markierte. Zwei Nebenbefunde am selben Weg: (1) beide Karten-Rückrufe standen hinter einem **Gleichheits-Wächter**
(`id !== s.selected…`) — der wiederholte Klick auf den schon markierten Brand (nach „Bühne zurück" der Normalfall)
wäre folgenlos geblieben; (2) die Popup-Kette lief nach der Auswahl weiter — ein Klick, der die Bühne wechselt,
hätte sein Popup auf der **versteckten** Karte geöffnet, wo es auf die Rückkehr wartet.

**Umgesetzt.** `selectFromMap` löst den Brand der Hülle auf (BP5-Regel unverändert) und öffnet sein Dossier;
beide Rückrufe geben `boolean` zurück („dieser Klick hat das Dossier geöffnet"), `FireMap` bricht dann die
Popup-Kette ab und räumt ein offenes Popup weg; die Gleichheits-Wächter entfallen für den Treffer-Fall (die Setter
sind idempotent), die Abwahl (`null`) behält ihren. **Anlagen-Einträge (TA4, `anomaly.kind === 'site'`) öffnen wie
bisher KEIN Dossier** — der Klick führt zum Reiter „Thermalanomalien" und der Detektions-Steckbrief (Popup) bleibt;
dieselbe Weiche wie beim Flächen-Klick, jetzt auch am Hüllen-Klick. Damit bleibt der Steckbrief für die dichten
Anlagen-Nester voll erreichbar; für echte Brände ersetzt ihn das Dossier, das dieselben Aussagen je Brand trägt.

**Belege (Playwright, Dev-Server, DEV-Haken `__fireMap`/`__fireRecords` — Muster `window.__verifyRadarModel`).**
Synthetischer Klick in die Hülle des einzigen Nicht-Anlagen-Brands im Überblick (`48.274,14.336…`, „bei Steyregg
ABWEICHUNG"): Bühne **Dossier**, Titel gesetzt, **0 Popups**, Hash trägt `ds:1`; „Karte" ⇒ zurück, **derselbe** Klick
erneut ⇒ Dossier wieder offen (der frühere Wächter hätte ihn verschluckt); Klick in die Hülle des Anlagen-Standorts
(`52.159,10.412…`, Salzgitter): Bühne bleibt **Karte**, Reiter „Thermalanomalien · 50", **1 Popup**
(Detektions-Steckbrief), kein `ds`. Konsole unverändert (nur Altbestand, 0 Warnungen). Messfalle des ersten
Anlaufs: die zwei anderen Hüllen des Überblicks waren beide Anlagen-Standorte — „öffnet nicht" war dort das
**gewollte** Verhalten, kein Fehler; erst der Abgleich Hülle ↔ Registry (`__fireRecords`) hat die Fälle getrennt.

**Verifier.** `verify:fire-detail` **63/63** (+4: Hüllen-Klick gibt `boolean` zurück und setzt die Bühne, die
site-Weiche bleibt ohne Dossier, kein Gleichheits-Wächter mehr an beiden Rückrufen, der Dossier-Klick öffnet kein
Popup und räumt ein offenes weg). `typecheck`, `npm run build`, `npm run budget` grün (totalJs 1 057,0/1 109,8 KB).

### 5.1 Nachtrag BD2b/BD2c (2026-08-31) — „öffnet sich nur ein kleines Panel"

Jans Rückmeldung nach BD2a: der Klick auf einen Brand öffnete weiter nur den Steckbrief. **Zwei Ursachen, am
laufenden Bild gemessen:** (1) die BD2a-Ausnahme für Anlagen-Einträge (site ⇒ Steckbrief statt Dossier) traf genau
die Brände, die im DACH-Überblick sichtbar sind; (2) schwerer: **die Hülle ist am Übersichts-Zoom oft nur wenige
Pixel groß** — `queryRenderedFeatures` am Hüllen-Schwerpunkt traf sie nicht einmal (hitTest leer, gemessen an
Salzgitter), was Nutzer wirklich anklicken, ist der **Detektionspunkt**, und der öffnete nur das Popup.

**Umgesetzt (BD2b + BD2c):** JEDER Klick, der einen Brand der Registry trifft, öffnet sein Dossier und unterdrückt
das Popup dieses Klicks — vier neue Auflösungswege neben der Hülle: Anlagen-Einträge (site) öffnen jetzt AUCH das
Dossier (Reiter und Registry bleiben „Thermalanomalien"); `openDossierForEffis` (EFFIS-Fläche → Brand über
Kartierungs-Kennung/Geometrie-Referenz), `openDossierForZone` (Detektionsraster → Brand über seine Zonen) und
`openDossierForDetection` (**Punkt → Brand über die Bbox, kleinste gewinnt** — die spezifischere Aussage; Polster
0,02°, der Punkt ist die Pixelmitte). Der Steckbrief (Popup) bleibt nur, wo KEIN Brand der Registry dahintersteht
(historische EFFIS-Flächen des Saison-/Archiv-Korbs, Raster ohne Eintrag) — er verschwindet nicht, er hat Vorrang
verloren.

**Belege (Playwright, Dev-Server, `__fireMap`/`__fireRecords`):** die ersten drei gerenderten Detektionspunkte
des Überblicks — ortsfest („bei Steyregg ABWEICHUNG"), Anlage („bei Biberist ANLAGE"), aktiver Brand außerhalb
DACH („45.64° N · 11.78° E AKTIV") — öffnen alle das Dossier (Bühne Dossier, Titel gesetzt, **0 Popups**, `ds:1`),
„Karte" dazwischen setzt sauber zurück. Konsole unverändert (Altbestand, 0 Warnungen). `verify:fire-detail`
**65/65** (+2: site öffnet das Dossier; Punkt-/Flächen-/Raster-Auflösung verdrahtet, Popup nur ohne Eintrag),
typecheck grün. **Mess-Lehre:** ein Klick-Test auf die Hülle prüft die Hülle, nicht den Klickweg des Nutzers —
erst der Treffer-Test am Schwerpunkt (leer!) zeigte, dass der Punkt der wirkliche Weg ist.

### 5.2 Nachtrag BD2d (2026-08-31) — die Sidebars bleiben, das Dossier ersetzt nur die Karte

Jans Auftrag: „die Sidebar links und rechts bleibt unverändert, alle Informationen der Detailansicht in den
Bereich, wo vorher die Karte war." Damit ist die 1a-Aufteilung (Registry links, Seitenspalte rechts) **zugunsten
des Bestands revidiert**: das Layer-Dock links und das Readout rechts (Reiter Layer/Brände/Thermalanomalien samt
Registry und Inline-Detailkarte) rendern jetzt in JEDER Bühne unverändert — nur die Mitte wechselt zwischen Karte
und Dossier. Minikarte, Legende und „Nationale Skalen" stehen in der zweiten Rasterspalte des Dossiers; das
Zeit-Deck liegt als Leiste unter dem Dossier-Scrollbereich im Zentrum (`.br-ds-main` = Rahmen, `.br-ds-scroll` +
`.br-ds-foot`). **Entfallen:** die Dossier-Registry (250 px), die Tablet-Rail (`DossierRegistryRail`) und das
rechte Seitenpanel `.br-ds-side` — der `noDetail`-Sonderweg des Panels ist zurückgebaut, die
`verify:fire-history`-Weichen-Sonde zählt wieder zwei Orte. Die Mitte ist schmaler geworden ⇒ Chart-`wideWidth`
360 (Desktop) / 420 (Tablet, dort EINE Spalte — mit beiden Sidebars bleiben ~456 px) / 340 (mobil), Kennzahl-Wert
22 px ohne Abschneiden (`overflow-wrap`; „abklingend" war als „abklinger" gekappt, am Bild gefunden).

**Gemessen (Playwright, Dev-Server):** Desktop 1440 — Rail 62 · **Dock 250 (Layer-Gruppen unverändert)** ·
Zentrum 648 (Grid 341 + 250, Minikarte/Legende/Skalen und Zeit-Deck im Zentrum, kein Voll-Breite-Foot mehr) ·
**Readout 480 unverändert** (Tabs, markierte Zeile MIT Inline-Detailkarte); Tablet 1024 — Dock 214 · Zentrum 456
(EINE Spalte 421, Chart 420 Einheiten ⇒ ≈ 12 px) · Readout 300; mobil unverändert (eigene Seite, Bottom-Bar 4 × 44,
kein Überlauf); Konsole nur Altbestand, 0 Warnungen. `verify:fire-detail` **65/65** (Sonde [bd2d] ersetzt die
Rail-Sonde), `verify:fire-history` 112/113 (Rest = Altbestand `spreadFc`), typecheck grün.

### 5.3 Nachtrag BD2e (2026-08-31) — „Probleme beim Klicken auf die Karte"

Jans Rückmeldung nach BD2d: der Brand-Klick auf der Karte öffnet das Dossier nicht (mehr) zuverlässig.
**Mit echten Maus-Klicks (Playwright `page.mouse`, nicht synthetische Events) reproduziert:** drei von fünf
Klicks auf gerenderte Detektionspunkte taten GAR nichts — kein Dossier, kein Popup, und das mitgeschriebene
`map.on('click')` feuerte nie. `elementFromPoint` zeigte den Täter: **MapLibre öffnet die kompakte Attribution
beim Start AUSGEKLAPPT** (`details[open]`, Klasse `maplibregl-compact-show`) — bei 648 px Kartenbreite ein
**612 × 62-px-Block** über der unteren Kartenhälfte (bottom: 128 px wegen des Zeit-Decks), der jeden Klick
darunter schluckte. Das war schon beim ersten Laden so, nicht erst nach einem Bühnenwechsel — aufgefallen ist es
erst, seit der Brand-Klick etwas tut.

**Umgesetzt:** Haupt- und Minikarte klappen die Attribution nach `load` zu (`details[open]` → zu) — der
ⓘ-Knopf bleibt, die Quellenangabe ist einen Klick entfernt, nichts wird entfernt (Lizenzpflicht gewahrt; die
zugeklappte Kompaktform ist der MapLibre-Standard nach der ersten Interaktion). Damit ist auch **V-BD2-2
erledigt** (die ausgeklappte Attribution verdeckte die 150–300-px-Minikarte fast ganz).

**Belege:** nach dem Fix ist die Attribution beim Laden 12 × 22 px (ⓘ), und **fünf von fünf echten Maus-Klicks**
auf die ersten gerenderten Detektionspunkte öffnen das Dossier (0 Popups; „bei Dillingen ANLAGE" 3× — drei Punkte
desselben Anlagen-Clusters —, „bei Sondershausen AKTIV", „bei Großengottern AKTIV"); Minikarten-Attribution
ebenfalls zu. Konsole nur Altbestand, 0 Warnungen. `verify:fire-detail` **66/66** (+1: beide Karten klappen die
Start-Attribution zu). **Mess-Lehre:** die BD2a/c-Belege liefen mit synthetischen `dispatchEvent`-Klicks direkt
auf dem Canvas — die gehen an der DOM-Überdeckung vorbei; erst `page.mouse` klickt wie ein Nutzer und fand sie.

### 5.4 Nachtrag BD2f (2026-08-31) — das Dossier auch im Historie-Modus (Monat/Saison)

Jans Rückmeldung: der Brand-Klick auf der Karte „funktioniert nicht, wenn die Detektionen für die letzten
30 Tage und Saison eingeschaltet sind" — das ist der **Historie-Modus** (Zeit-Deck „Monat | Saison", BH3). Dort
zeigt die Karte die statischen Ereignispunkte, und deren Klick-Handler (`selectHistory`) stammte aus der
Vor-Dossier-Zeit: er markierte nur die Zeile im Readout, die Mitte blieb Karte.

**Umgesetzt:** `selectHistory` (Karte UND Liste) öffnet jetzt das **Ereignis-Dossier** in der Mitte. Der
Detailkörper ist herausgelöst (`HistoryDetailBody` in `FireHistoryPanel.tsx`: Index-Zeilen Zeitraum ·
Detektionen · Stärke · Fläche · Herkunft · Einordnung + das BH4-Detail mit Wetterlage am Brandtag,
Landbedeckung, Evidenz, Merkmalen) — **EINE Quelle** für die Inline-Detailkarte im Readout und die Mitte,
dasselbe Muster wie die BD2-Bausteine der Live-Detailkarte. Die Minikarte nimmt jetzt ein strukturelles Ziel
(`MiniMapTarget` — Kennung, Ort, Kasten) statt `FireRecord` und zeigt das Ereignis als Punkt mit
Umgebungskasten (Text sagt: keine Brandfläche). Kopf mit Abzeichen (EFFIS kartiert / Anlage / Abweichung /
vorläufig NRT), rechts in der Dossier-Spalte Minikarte + „Nationale Skalen"; Leerzustand benannt. Der Hash
trägt `bh` und `ds` zusammen.

**Belege (echte `page.mouse`-Klicks, Dev-Server):** Fenster „Monat" (1 231 Ereignispunkte im Überblick),
Klick auf einen Punkt ⇒ Dossier „Oberharz am Brocken, Stadt (Harz)" mit Zeitraum/Detektionen/Stärke/Fläche/
Herkunft UND Wetterlage am Brandtag (Tag 13.08.2026 · Stunde 13:00 · Trockenphase), Minikarte mit Canvas,
0 Popups, Hash `{"bh":"month","ds":1}`; nach „Bühne zurück" (Kamera steht dann auf dem Ereignis) öffnet der
nächste Punkt-Klick wieder das Dossier; Auswahl schließen + Segment „Dossier" ⇒ Leerzustand „Kein Ereignis
markiert". Konsole nur Altbestand, 0 Warnungen. **Testfalle:** nach der Auswahl zoomt die Karte zum Ereignis —
ein Wiederholungs-Klick auf die ALTEN Bildschirmkoordinaten zeigt ins Leere; erst die frische Projektion
klickt das, was der Nutzer sieht. `verify:fire-detail` **67/67** (+1: `HistoryDetailBody` geteilt,
`selectHistory` öffnet die Bühne, `MiniMapTarget`), `verify:fire-history` 112/113 (Rest `spreadFc` =
Altbestand), typecheck grün.

### 5.5 Nachtrag BD2g (2026-08-31) — das Ereignis-Dossier in voller Form

Jans Rückmeldung zum BD2f-Stand: „bei älteren Detektionen ist der Informationsgehalt sehr gering und die
Formatierung stimmt noch nicht." **Beides bestätigt:** (1) der Detailkörper der Inline-Karte nutzt
`.br-detail-dl`, dessen Raster-Styles an `.br-history` hängen — im Dossier ohne diesen Vorfahren fielen
dt/dd als ungestylte Blockzeilen untereinander (genau Jans Paste); (2) die Mitte spielte das vorhandene
Material nicht aus — der Shard führt je Ereignis die **vollen Detektionen** (`HistoryDetection[]`: Zeit, FRP,
Satellit, Tag/Nacht, Pixelmaß), aus denen sich mit der EINEN Überflug-Regel des Projekts (`groupPasses`,
10 min je Satellit) derselbe **FRP-Verlauf wie im Live-Dossier** rechnen lässt — ohne neuen Abruf.

**Umgesetzt:** `HistoryDossierBody` (in `FireHistoryPanel.tsx`, geteilter Hook `useHistoryEventData` mit der
Inline-Karte — ein Ladeweg, kein zweiter): Kopf mit **vier Kennzahl-Kacheln** (`historyStatTiles`: Fläche mit
Herkunft · Detektionen mit Überflügen/Tagen · ΣFRP mit Max · Zeitraum mit Status) → **Verlauf** als
`FirePassChart` aus den Shard-Detektionen (`nowMs` = letzte Detektion, damit kein wochenlanger
„Nachlauf"-Schraffur-Balken entsteht; bei einem einzigen Überflug sagt ein Satz, dass es keinen Verlauf gibt) →
**Wetterlage am Brandtag** als Steel-Karte (Tag/Stunde/Trockenphase als Kacheln, Quellen als Satz) →
**Einordnung & Evidenz** (Ort mit GeoNames-Distanz, Herkunft SP/NRT, Sensoren, Konfidenz, Status, frühere
Kennung, Ausgewertet, EFFIS-Kartierung + Landbedeckung, Anomalie-Gründe) → **Merkmale** als Tabelle
(`fire-fp-features`) mit „JSON kopieren" statt des eingeklappten `<details>`. Die Inline-Karte im Readout
bleibt unverändert (`HistoryDetailBody`). `source` der FirmsRow-Form ist nur die Typform — `groupPasses`
liest sie nicht, die echte Herkunft steht in `provenance` und wird gesagt.

**Belege (Playwright, Dev-Server, Monat):** „Hürtgenwald (Düren)" — Kacheln 319 ha (EFFIS kartiert) · 159 ·
4 410 MW · 14.–15.08.; Verlauf mit **10 Balken** (10 Überflüge, 3 ☀ / 7 ☾, N + N20), Wetterlage 3 Kacheln
(Tag 14.08. max 35,1 °C · Feuchte 26 % · 10 Tage seit Regentag), Einordnung mit Landbedeckung 92 % Nadelwald,
Merkmale 11 Werte als Tabelle, Minikarte; `fire-fp-dl`-Raster greift (112 px + 1fr), **keine Schrift < 12 px**;
Screenshot `bd2g-history-dossier.png`. Nachbesserung am Bild: die MW-Zahl des ersten Balkens lief in die
Y-Achse (`x ≥ L + 30`-Wächter). `verify:fire-detail` **67/67** (Sonde erweitert: geteilter Hook, Kacheln,
`groupPasses(shardRows(ev))`), `verify:fire-history` 112/113 (Rest `spreadFc` = Altbestand), typecheck grün.
Bei Einzeldetektions-Ereignissen (Jans Beispiel Niederstetten) bleibt der Gehalt **strukturell** klein — ein
Überflug, eine Zahl —, aber die Form sagt es jetzt („ein einziger Überflug — kein Verlauf") statt dünn auszusehen.

---

## 6. Diagnose BD3 (2026-09-03) — Inline-Detailkarte im Readout streichen, Layer-Steckbrief ins Dock

**Jans Auftrag.** (a) Die Detailansicht rechts beim Klick auf einen Brand ist seit dem Dossier
überflüssig — streichen, und was dort Wichtiges steht, das dem Dossier fehlt, vorher hinübertragen.
(b) Die Layer-Beschreibung wandert in die linke Sidebar und steht dort **unter dem Layer**.

### 6.1 Befund (a) — die Inline-Karte ist heute wirklich redundant

`FootprintDetail` (`FireFootprintPanel.tsx:633`) rendert im Readout unter der markierten Zeile, sobald
`sel && p.detail`. Sie ist seit BD2 aus **denselben Bausteinen** gebaut wie das Dossier
(`FireFootprintPanel.tsx:675 ff.` — „EINE Quelle für Detailkarte und Dossier"). Bausteinvergleich:

| Baustein | Inline-Karte | Dossier |
|---|---|---|
| `DetailSubline`, `Badge`, `recordName` | ✓ | ✓ |
| `DetailKennzahlenRows`, `DetailFrpRows` | ✓ | ✓ |
| `DetailConfidenceRows` | unter „Kennzahlen" | unter „Einordnung" |
| `DetailVerlauf` | ✓ (compact) | ✓ (wide, 360/420/340) |
| `WeatherBlock` | ✓ | ✓ (Steel-Karte) |
| `DetailEinordnungRows` + `CauseText` | ✓ | ✓ (Ursache im eigenen Kasten) |
| `FeaturesRow` | ✓ | ✓ |
| `RecordStats` (4 Kennzahl-Kacheln) | nur in der Listenzeile | ✓ zusätzlich im Kopf |
| Methoden-/Bewertungs-Chips | nur in der Listenzeile | ✓ zusätzlich im Kopf |
| `SatImageryBlock` (SAT1) | — | ✓ |
| Minikarte + Legende + `DossierMapNote` | — | ✓ (`aside`) |

**Ergebnis: das Dossier ist eine echte Obermenge.** Es gibt keine Zeile, die nur in der Inline-Karte
steht — zu übertragen ist nichts. Das ist keine Vermutung, sondern folgt aus der BD2-Regel, dass beide
Ansichten dieselben exportierten Bausteine benutzen; der Verifier `verify:fire-detail` hält das fest.

**Zweiter Befund: die Inline-Karte ist heute doppelt sichtbar.** Jeder Auswahlweg setzt bereits
`setStage('dossier')` — Karte (`selectFootprintFromMap:1033`), EFFIS-Fläche (`openDossierForEffis`),
Detektionspunkt (`openDossierForDetection`), Raster (`openDossierForZone`), Registry-Zeile
(`openDossier:1073`), Hülle (`selectFromMap:630`). Wer einen Brand markiert, sieht die Angaben also
**gleichzeitig** in der Mitte (groß, mit Satellitenbild und Minikarte) und rechts in der Liste (klein).
Die Inline-Karte schiebt dabei die Nachbarzeilen der Registry auseinander und erzwingt den
Scroll-Ins-Bild-Effekt (`FirePage.tsx:1191`).

**Abgrenzung — was NICHT gemeint ist** (eigene Inline-Karten, anderer Auftrag, bleiben unberührt, bis
Jan es sagt): `HistoryDetailBody` im Historie-Readout (BD2g hat dafür bewusst das
`HistoryDossierBody`-Gegenstück gebaut und die Inline-Karte ausdrücklich stehen lassen) und die
Standort-Karte in `FireAnomalyPanel.tsx:225`.

### 6.2 Befund (b) — wo die Layer-Beschreibung heute steht

Zwei Orte, beide `FireLayerCard`:

1. **Readout, Reiter „Layer"** (`readoutLayersContent`, `FirePage.tsx:1978`): zeigt Karten für alle Layer
   aus `readoutLayers = FIRE_LAYER_ORDER.filter(aktiv || layerHover)` — also für jeden **aktiven** Layer
   plus den gerade **überfahrenen** (Hover auf der Dock-Zeile, `layerRow` setzt `setLayerHover`).
   Darunter im selben Reiter: `scalesCard` (nationale Skalen DE/CH) und `sourcesLine` (Quellenzeile),
   sowie oben der Hinweiskasten `is-lag` für Layer, die dem Regler nicht folgen.
2. **Mobiles Layer-Sheet** (`layerRow(inSheet=true)`, `FirePage.tsx:1405-1419`): pro Zeile ein
   `i`-Knopf, der die Karte **unter der Zeile** aufklappt (`openInfo`-State). **Das ist exakt die Form,
   die Jan jetzt auch für Desktop/Tablet will** — der Mechanismus existiert also schon und muss nur auf
   das Dock ausgedehnt werden.

Das Dock ist 250 px breit (Tablet 214 px, `fireDeck.css:160/609`); die `compact`-Variante der Karte ist
für Sheet-Breite gebaut und passt dort hinein — Maße sind am Gerät zu prüfen, nicht zu behaupten.

**Offene Frage, die Jan entscheiden muss** (Funktionserhalt, oberste Direktive): Wenn die
Layer-Steckbriefe ins Dock wandern, bleibt der Readout-Reiter „Layer" mit `scalesCard`, `sourcesLine`
und dem Lag-Kasten zurück. Diese drei sind **keine** Layer-Beschreibungen und dürfen nicht wegfallen.
Varianten: Reiter „Layer" behalten (nur ohne die Layer-Karten) — oder Reiter streichen und die drei
Inhalte ans Ende des Docks hängen. Zweite offene Frage: ob die Karte im Dock **immer** unter einem
aktiven Layer steht (mehr Text, kein Klick nötig) oder wie mobil **auf `i`** aufklappt (ruhiges Dock).

### 6.3 Was zu tun ist (Skizze, nach Jans Antworten)

1. `FootprintDetail`-Aufruf in `FireFootprintPanel.tsx:472` entfernen; die Funktion selbst bleibt
   exportiert, solange kein anderer Ort sie braucht — geprüft wird das vor dem Löschen.
   Die markierte Zeile behält Markierung (`is-sel`) und Kennzahlen; das Dossier ist der Detailort.
   `onClearSelect`/`p.detail` bleiben Vertrag der Registry (Abwählen per zweitem Klick).
2. `layerRow` bekommt den `i`-Knopf und den `openInfo`-Zweig **auch ohne `inSheet`** (oder die Karte
   ungefragt unter aktiven Zeilen — je nach Antwort); Hover-Steckbrief im Readout entfällt damit,
   `layerHover` wird nur noch für die Karten-Hervorhebung gebraucht (prüfen, ob dort verwendet).
3. `readoutLayersContent` verliert die Layer-Karten; Skalen/Quellen/Lag-Kasten je nach Antwort.
4. Gate GBD3: `verify:fire-detail`, `verify:fire-clusters` (Altbestand-Zahlen unverändert), typecheck,
   Budget, Desktop 1440×900 / Tablet / iPhone 12 Pro 390×844, fünf Selbstverifikations-Fragen.

### 6.4 Jans Entscheidungen (2026-09-03)

1. **Steckbrief im Dock: auf „i" aufklappen** — dasselbe Muster wie das mobile Layer-Sheet, immer nur
   einer offen. (Alternativen „immer unter aktiven Layern" / „nur Text ohne Legende" verworfen: das
   Dock wäre bei mehreren aktiven Layern sehr lang geworden.)
2. **Readout-Reiter „Layer" streichen, seine Reste ans Dock-Ende.**
3. **Inline-Detail auch in Historie UND Thermalanomalien streichen** — nicht nur in der Registry.

### 6.5 Umsetzung BD3

**(a) Registry.** Der Aufruf von `FootprintDetail` in der Zeile ist weg, die Funktion selbst gelöscht
(sie hatte keinen zweiten Aufrufer); mit ihr der Abschnittskopf `Sec` und die Prop `detail` des Panels.
Die Bausteine (`DetailKennzahlenRows` u. a.) bleiben unverändert exportiert — das Dossier baut sich
weiter aus ihnen. Übertragen werden musste **nichts**: der Bausteinvergleich in §6.1 zeigt das Dossier
als echte Obermenge, und jeder Auswahlweg öffnete es schon vorher (`setStage('dossier')`).

**(b) Historie.** `HistoryDetailBody` + `HistoryEventDetail` (nur von ihm benutzt) sind gelöscht; das
Ereignis-Dossier der Mitte (BD2g) ist die Obermenge. **Eine** Zeile fehlte ihm und ist übernommen: die
Einzeldetektion („keine Bestätigung durch einen weiteren Überflug") — sie hing an `hotspots === 1`,
während das Dossier nur `passes.length === 1` kannte.

**(c) Thermalanomalien — der Fall, der wirklich Arbeit war.** Die Standort-Angaben (Kennung, Klasse,
Anlage samt Quelle und Abstand, Betreiber, Archiv-Signatur, Tage je Jahr, FRP-Muster, Landbedeckung,
Im Fenster, Signaturprüfung) standen **nur** in der Inline-Karte — anders als bei Brand und Historie gab
es dafür in der Mitte nichts. Ohne Ersatz hätte das Streichen sie gelöscht, nicht verschoben. Gebaut
wurde deshalb `AnomalySiteCards` (drei Dossier-Karten mit **wortgleichen** Zeilen) plus `siteStatTiles`,
und zwei Aufrufer teilen sich den Baustein:

* **Standort ohne Eintrag im Fenster** → eigenes **Standort-Dossier** in der Mitte (Kopf + vier Kacheln
  + die drei Karten + Minikarte/Legende). Damit der Klick nicht folgenlos bleibt, setzen `focusSite` und
  `selectSiteFromMap` jetzt auch ohne Eintrag `stage = 'dossier'`.
* **Standort MIT Eintrag** → dieselben Karten hängen als neue Prop `extra` im Brand-Dossier, das wie
  bisher den Brand zeigt. Nichts konkurriert, nichts fehlt.

**(d) Layer-Steckbrief ins Dock.** `layerRow` rendert den „i"-Knopf und die aufgeklappte `FireLayerCard`
jetzt auf **jeder** Breite (vorher `inSheet &&`); die Hotspot-Kacheln und der Detektions-Vorspann, die
der Readout-Stapel trug, kommen mit. Der Reiter „Layer" ist gestrichen (`readoutTab` ist nur noch
`'fires' | 'anomalies'`), die Hover-Vorschau (`layerHover`) mit ihm.

**Was sonst still verschwunden wäre — und wohin es gegangen ist.** Der Reiter war nicht nur ein
Reiter: `firesMode` (= „das Readout zeigt eine Liste") schaltete die halbe Karten-Möblierung ab. Da das
Readout jetzt IMMER eine Liste zeigt, wäre alles Folgende ersatzlos weg gewesen. Nichts davon ist
gestrichen, jedes Stück hat einen neuen Ort:

| Bisher im breiten Modus | Jetzt |
|---|---|
| Einheit Tage \| Stunden (`unitSeg`) | bleibt in der kompakten Zeit-Zeile |
| Legende (FWI + Detektionspunkte) | Dock-Fuß |
| Basiskarte (Straßen/Gelände/Satellit) | Dock-Fuß (Desktop/Tablet); mobil unverändert im Layer-Sheet |
| Ansicht-Chips des EU-Index (`viewChips`) | im Dock unter der Zeile `fireDanger` (mobil weiter über der Karte) |
| Treiber-Notiz Feuerwetter (`mapNotes`) | im Dock unter der Zeile `fireWeather` (mobil weiter über der Karte) |
| Quellen-Pille der Karte | bleibt — die Markierungs-Pille kommt jetzt **dazu** statt sie zu ersetzen |
| „Karte: …" + FIRMS-Live-Anzeige in der Topbar | dauerhaft sichtbar |
| Presets in der Topbar | dauerhaft sichtbar (nur im Dossier ausgeblendet) |
| Nationale Skalen + Quellenzeile + Lag-Hinweis | Dock-Fuß |

**Nebenbefund Routing.** `fireViewFromState` entschied den Pfad-Slug am Reiter — mit nur noch zwei
Reitern hätte **jeder** Zustand `aktive-braende` ergeben. Er entscheidet jetzt an den **Layern**
(Hotspots/Brandflächen ⇒ `aktive-braende`, Trockenheit ohne Index ⇒ `trockenheit`, sonst
`gefahrenindex`); nur der Anomalien-Reiter bleibt eine eigene Aussage. Das ist zugleich ehrlicher: der
Slug beschreibt, was die Karte zeigt, nicht welche Liste offen ist.

### 6.6 Gate GBD3 — Belege

* `npm run typecheck` grün. `npm run verify:fire-detail` **297/297** (die BD2-Sonde „die alte Detailkarte
  setzt alle Bausteine zusammen" ist durch zwei BD3-Sonden ersetzt: die Inline-Karte ist **weg**, und das
  Dossier setzt **alle** Bausteine zusammen). `verify:routing` 105/105. `verify:fire-history` 112/113
  (Rest `spreadFc` = Altbestand). `verify:fire-clusters` **109/117** — vorher 105/117; die drei
  reparierten Sonden beschrieben den gestrichenen Reiter, die verbleibenden 8 sind derselbe Altbestand
  wie vor BD3 (**gegengeprüft an einem HEAD-Worktree**: dort exakt dieselben 12 Fehlschläge, also keiner
  von BD3 verursacht).
* Browser (Dev :5199, Chrome DevTools MCP): **Desktop 1440×900** — Steckbrief klappt unter der
  Layer-Zeile auf (`bd3-info.png`), Dock ohne Querlauf (`scrollWidth === clientWidth`), Trefferfläche des
  „i" **44 × 44 px** gemessen, Dock-Fuß trägt Legende, Basiskarte, nationale Skalen, Quellenzeile
  (`bd3-dockfoot.png`); Brand-Klick öffnet das Dossier, in der Registry **0** Inline-Karten
  (`.br-fires .br-detail` = 0, `bd3-dossier.png`). **Thermalanomalien:** Standort mit Eintrag ⇒
  Brand-Dossier + die drei Standort-Karten; Standort ohne Eintrag ⇒ „Standort-Dossier" mit Kopf, vier
  Kacheln und denselben Karten (`bd3-site.png`). **Tablet 1024×800** ohne Querlauf, „i" 44 × 44
  (`bd3-tablet.png`). **Mobil** Layer-Seite unverändert plus Chips unter dem Index (`bd3-mobile.png`);
  Karten-Sheet trägt die Ansicht-Chips weiter über der Karte. Konsole ohne Fehler und Warnungen.
  *Messfalle (bekannt, `audit/event-terrain.md`): `resize_page` bleibt bei 500 px stehen — die gemeldete
  „Überbreite" bei 390 px ist das Werkzeug, nicht die Seite.*
* Budget: `totalJs` **1089,1 KB** (Grenze 1109,8) — unverändert gegenüber dem Stand vor BD3, keine
  Ratsche; `eagerJs` 103,4 KB, größter Chunk 278,4 KB. Build grün.
* Fünf Selbstverifikations-Fragen: (1) **Funktionserhalt** — jede gestrichene Fläche hat einen benannten
  neuen Ort (Tabelle §6.5), die einzige Zeile ohne Gegenstück (Einzeldetektion) ist übertragen;
  (2) **Desktop** ist absichtlich verändert (der Auftrag), Tablet/Mobil mitgeprüft; (3) **Touch-Targets**
  „i" 44 × 44 px gemessen, Desktop wie Tablet; (4) **Konsole** ohne Fehler/Warnungen; (5) **Long Tasks**
  nicht neu gemessen — BD3 verschiebt Knoten, rechnet nichts: die Steckbrief-Karte rendert wie vorher,
  nur an einem anderen Ort, und es entfällt sogar der Hover-getriebene Stapel im Readout.

### 6.7 Verbesserungen aus BD3 (D-28)

`improvements.md` fehlt im Arbeitsverzeichnis (bekannter Repo-Zustand, s. CLAUDE.md-Kopf) — die
V-Einträge stehen deshalb hier und gehören beim Wiederherstellen in den Katalog übertragen.

* **V-BD3-1 · Legende des Steckbriefs im Dock offen zeigen.** Die Karte läuft im Dock in der
  `compact`-Fassung; dort steht die Farblegende hinter „Ausführlich". *Mehrwert:* Wer einen Layer
  einschaltet, sieht sofort, was welche Farbe bedeutet, ohne zweiten Klick. *Skizze:* in `FireLayerCard`
  eine Option `legendOpen`, die im Dock für den **aktiven** Layer gesetzt wird (für ausgeschaltete
  bleibt es kompakt, sonst wird das Dock lang).
* **V-BD3-2 · Acht Altfehler in `verify:fire-clusters` aufräumen.** Sie prüfen auf Klassennamen aus der
  Zeit vor dem Command-Deck (`fire-ro-layerinfo`, `fire-scales`, `fire-fplist`) und schlugen schon vor
  BD3 fehl. *Mehrwert:* Ein Harnisch, der dauerhaft rot ist, verliert seine Warnwirkung — echte
  Regressionen fallen darin nicht mehr auf. *Skizze:* je Sonde entscheiden, ob die geprüfte Zusage noch
  gilt (dann Selektor nachziehen) oder mit dem Redesign entfallen ist (dann Sonde löschen, mit Vermerk).
