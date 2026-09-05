# Brandradar — Command-Deck-Redesign (Phase BR1, 2026-08-22)

> Vorlage (verbindlich): `references/brandradar.dc.html` + `desktop-1-karte.png`, `desktop-2-braende.png`,
> `tablet.png`, `mobile-1-karte.png`, `mobile-2-layer.png`, `mobile-3-braende.png`. Logo `public/buscosun-mark.svg`.
> Reine Darstellungsphase: Datenpfad, Zeitmodell, Registry, Playback, Permalink unverändert.

## 1. Was ersetzt wurde

| Alt (WBU1, „Wetterkarten-Optik") | Neu (Vorlage B1–B6) |
|---|---|
| `.fire-*`-Deck: Topbar mit Titel „Wie trocken ist der Wald?", Presets im Dock, Basemap in der Topbar | Topbar: Logo · „Brandradar · DACH-Flächenblick" · Presets-Segment (Überblick / Aktuelle Lage) · „Karte: Straßen" · **FIRMS LIVE** (Puls; ehrlich: lädt / Ausfall / GWIS-Notbetrieb / aus) |
| Dock-Zeilen `layerRowDeck` mit Sub-Ansichten/Fenster/Tiefen als Untersegmente | Dock 250 px, fünf Gruppen exakt wie Vorlage, Zeilen Icon·Label·Sub·Switch, blockierte EDO-Layer gestrichelt mit Schloss und Grund „EDO blockiert · ungültiges CORS"; Tiefen-Umschalter und Zeitkörbe bleiben IN der Zeile |
| Sub-Ansichten im Dock, Begleit-Notiz rechts oben auf der Karte | **Quellen-Pille** + **Sub-Ansichten-Chips** (Index / Einordnung / Trockenheit / Ausbreitung / Zündbereitschaft) links oben; Basemap + Zoom rechts oben; Ein-Klick-Wechsel Index ↔ Einordnung als Verweis im Steckbrief |
| Punktkurve als Balken-Karte im Readout | Punktkurve als Kästchen rechts auf der Karte (Linie + Stützpunkte, jetzt … +6 h, Pflichtsatz „Punkt (Fusion) ≠ Fläche (ICON-D2)"); mobil im Sheet |
| Zeit-Deck ohne Legende; Fenster 24 h / 7 d im Dock | Zeit-Deck: Play · **Tage | Stunden** (immer sichtbar, Nicht-Wählbares nennt den Grund) · Achse mit Tick-Knöpfen · **24 h | 7 d** · Legende mit allen 6 Klassen der gewählten Sub-Ansicht + Detektion/ortsfest/Ausbreitung + „Farben abgeleitet — nicht amtlich" |
| Readout: Steckbrief-Karten (Eyebrow/Titel/Langtext/Legende) + EU-Skala | Readout 340 px: Tabs **Layer | Brände · N**; Steckbrief mit EINHEIT / BEZUG / STAND, Kasten **Grenze**, Kasten **Rückfall**, Legende, Langtext einklappbar („Ausführlich", wortgleich erhalten); Detektionen mit Kacheln IM FENSTER / ORTSFEST / KARTIERT; **Nationale Skalen · nie umgerechnet** (DE·DWD 5 Stufen, CH·BAFU 5 Stufen, AT-Lücke) |
| Brandliste `fire-fprow` mit Filtersegmenten | B2: Dock ausgeblendet, Readout 400 px, Topbar „← Layer-Steckbriefe · Brandradar · Brände", „Markiert: …"-Pille, kompaktes Zeit-Deck; Karten je Brand mit Abzeichen AKTIV / KEIN SIGNAL / ERLOSCHEN / ORTSFEST, Fläche **mit Herkunft**, Detektionen, Ausbreitungsvektor (FBP, km/h), Landbedeckung (CORINE), EMS, GeoSphere-Kontext (Zitat); markierter Brand mit Kacheln + Detailkarte; „Weitere N Brände laden"; Vorbehalt |
| Mobil: Rail oben, Sheet mit Dock+Readout | B4–B6: Karte + Bottom-Sheet (Zeit-Deck, Legende, Kacheln, Steckbriefe), Layer-Seite, Brände-Seite, **sticky Bottom-Bar Karte · Layer · Brände · Zeit** (44-px-Ziele, Safe-Area) |

Neue Dateien: `src/fire/brandradarMeta.ts` (Label/Quelle/Farbe/Steckbrief-Felder je Layer),
`src/fire/fireIcons.tsx` (Vorlagen-SVG-Pfade, ersetzt die 14-px-Glyphen), Tokens `--br-*` in
`src/designTokens.css`. Neu geschrieben: `fireDeck.css`, `FireFootprintPanel.tsx`, Darstellungsteil
von `FirePage.tsx`, `FireLayerCard` (Komponente; `FIRE_LAYER_INFO`-Texte unverändert).
`FireMap.tsx`: eine Zeile — NavigationControl `top-right` statt `bottom-right`.

## 2. Bewusste Abweichungen von der Vorlage (Funktionserhalt / Ehrlichkeit)

1. **Rail** zeigt alle Werkzeuge der `FeatureRail` (Vorlage: vier) — Navigation ist Funktion.
2. **Basemap** hat drei Segmente (Straßen · Gelände · Satellit); „Gelände" ist Bestand.
3. **Kein Avatar „JK"** in der Topbar — es gibt keine Nutzerkonten; ein Platzhalter wäre eine Behauptung.
4. **Abzeichen „KEIN SIGNAL"** statt „BEOBACHTET": die Registry-Beschriftung (`STATUS_LABEL`) bleibt;
   „beobachtet" wäre eine Umdeutung (AF2: „kein Signal" ist keine Entwarnung).
5. **Nationale Skalen** tragen die amtlichen Stufennamen wortwörtlich („sehr geringe Gefahr", nicht „sehr gering").
6. Mobile Layer-Zeilen tragen zusätzlich ein kleines „i" (Steckbrief je Zeile) — sonst gäbe es mobil keinen
   Steckbrief für inaktive Layer.
7. Sortierung „Detektionen" (Vorlage) ist ergänzt, „Stärke" und „Status" (Bestand) bleiben; Mindestfläche/Status/Land
   stehen hinter „Filter".
8. Ehrlichkeits-Zeilen unter den Dock-Zeilen (Ladenotiz, Lag, EFFIS-Bestätigung, Deep-Links, Fehlerfall) bleiben —
   die Vorlage zeigt sie nicht, sie sind Produktprinzip.

## 3. Font-Entscheidung

League Spartan ist seit V-102 **selbst gehostet** (`src/fonts.css`, Google Fonts bewusst entfernt). Das Deck nutzt
diese Fassung (`font-family: 'League Spartan', var(--font-base)`), kein neuer Google-Fonts-Link.

## 4. Gate GBR1 — fünf Fragen

1. **Funktionserhalt:** alle 12 Layer schaltbar bzw. sichtbar-blockiert; Presets; 5 Sub-Ansichten; Tiefen;
   Zeitkörbe + Historienregler; Fenster 24 h/7 d; Tage/Stunden; Playback; Punktkurve (bei aktivem `fireSpread`);
   Registry mit Sortierung/Umfang/Filter/Deckel/Detail; Kartenauswahl ↔ Liste; Permalink (`b/d/w/v/sm/bb/bd/fp/h`)
   — Verifier `verify:fire-model` 126/126, `verify:fire-time` 127/127, `verify:fire-danger-views` 44/44
   (zwei Sonden auf die neuen Klassennamen umgestellt, Aussage unverändert).
2. **Desktop:** `audit/brandradar-command-deck/br-desktop-1.png` (B1), `br-desktop-2.png` + `br-desktop-2-sel.png` (B2),
   `br-desktop-hourly.png`, `br-desktop-pc2.png` (Stundenachse, Punktkurve). Tablet: `br-tablet.png`.
   Mobile: `br-mobile-map.png`, `br-mobile-layers.png`, `br-mobile-layers-soil.png`, `br-mobile-1.png` (Brände),
   `br-mobile-time.png`.
3. **Touch-Targets:** Bottom-Bar, Zeilen, Chips, Sub-Ansichten, Tick-/Einheiten-/Fenster-Knöpfe ≥ 44 px (mobil).
4. **Konsole:** nur vorbestehende externe 404 (GeoSphere `getWarningsForCoords`) und zwei MapLibre-Style-Warnungen
   des Windlayers — kein App-Fehler.
5. **Budget:** `npm run build` + `npm run budget` grün — totalJs 922,3/926,1 KB, eagerCss 8,7/8,9 KB.
   Long Tasks nicht neu gemessen (keine Änderung am Datenpfad).


---

## 5. Nachtrag BR2 (2026-09-05) — die Datengrundlage verlässt die Sidebar

**Jans Auftrag, in zwei Schritten:** zuerst „Detektionen", „Brandflächen je Brand", „Thermalanomalien" und
„Frühere Brandflächen" nicht mehr schaltbar machen (die Daten werden gebraucht, ein Schalter dafür ergibt
keinen Sinn) — danach: „die Layer von den besagten Layer entfernen, diese Informationen bringen uns nichts
mehr", also auch die Zeilen selbst aus dem Dock. **Kein Rückzug:** die vier Layer laufen unverändert
weiter, sie laufen nur immer und ohne Bedienelement.

**Befund, warum das stimmt:** Brandliste, Dossier und die Anomalien-Einordnung lesen diese vier ohnehin;
ein ausgeschalteter Layer machte die Karte leer, ohne dass die Liste daneben leerer wurde — die Seite
widersprach sich selbst. Der Ausschalter war auch kein Sparhebel: die Abrufe hängen an der Registry,
nicht am Schalter. Ohne Schalter blieb von der Zeile nur Text übrig, der in jedem Zustand dasselbe sagt.

**Was gebaut wurde**

| Stelle | Änderung |
|---|---|
| `fireModel.ts` | `FIRE_ALWAYS_ON` + `withFireAlwaysOn()` — die EINE Stelle, die die vier ergänzt (Hash, Sub-Route, Preset, Default) |
| `fireModel.ts` | `activeFirePresetId` ergänzt beide Seiten, sonst könnte kein Preset je wieder hervorgehoben sein |
| `FirePage.tsx` | `dockGroups` filtert die vier heraus; eine dadurch leere Gruppe entfällt ganz, statt als leere Überschrift stehen zu bleiben |
| `FirePage.tsx` | `burntBlock` — der Zeitkorb-Filter der früheren Brandflächen steht jetzt für sich („Frühere Brandflächen · Zeitraum") |
| `FirePage.tsx` | `readoutLayers` (mobiles Karten-Sheet) lässt die vier aus — sie stünden sonst in JEDEM Sheet |
| `FirePage.tsx` | der Zähler im Dock-Kopf zählt die SCHALTBAREN Layer (`switchableCount`), sonst nennt er mehr, als das Dock zeigt |
| `FirePage.tsx` | `toggle()` weist die vier ab (ein Aufruf wäre ein Fehler im Aufrufer) |
| `fireDeck.css` | `.br-layerwrap.is-standalone` + `.br-standalone-head` für den freistehenden Filter |
| `fireRouteView.ts` | `fireViewFromState` entschied an `fireHotspots`/`fireFootprints` — die stehen jetzt in JEDEM Zustand und hätten jeden Slug zu `aktive-braende` gemacht. Es entscheiden nur noch die schaltbaren Flächen; `aktive-braende` und `trockenheit` blenden dafür die Gefahrenfläche ab, sonst wären sie von `gefahrenindex` nicht zu unterscheiden |

**Was bewusst BLEIBT (Funktionserhalt):** der Zeitkorb-Filter der früheren Brandflächen
(7 Tage | Saison | Archiv + Tagesregler). Er ist kein Steckbrief, sondern bestimmt, WELCHE kartierten
Flächen die Karte zeigt — und ohne ihn wäre auch der Umfang „ganze Saison" der Brände-Liste gesperrt.
Verloren gehen ausschließlich die vier Schalter und ihre Steckbrief-Texte im Dock; die Ehrlichkeits-Sätze
zu Grenze und Rückfall stehen weiterhin in `brandradarMeta.ts` und damit im Dossier-/Karten-Pfad.

**Nebenwirkungen, ausgesprochen:** ein Alt-Link mit `fb: 0` (frühere Brandflächen bewusst aus) öffnet sie
jetzt trotzdem — das ist der Auftrag, nicht ein Fehler im Codec (`fireState.ts` liest `fb` unverändert).
Und „Gefahrenindex + Feuerwetter" ist jetzt derselbe Zustand wie das Preset „Aktuelle Lage".

**Belege (2026-09-05)**

- `npm run typecheck` grün, `npm run build` grün.
- `verify:routing` **111/111** (3 neue Rundlauf-Prüfungen je Sub-Route), `verify:fire-model` **123/123**,
  `verify:fire-anomalies` 56/56, `verify:fire-time`, `-detail`, `-events`, `-corroboration`, `-sources`,
  `-boden`, `-behoerden`, `-danger-views` je 0 Fehler.
- Unverändert gegenüber dem Stand VOR der Änderung (Altbestand, mit `git stash` gegengeprüft):
  `fire-footprint` 72/73, `fire-registry` 1, `fire-history` 1, `fire-zones` 1, `fire-activity` 3,
  `fire-clusters` 8. **Keine neue Fehlprüfung.**
- Ansicht Desktop 1440×900 und Mobil 390×844 (Layer-Seite, Accessibility-Snapshot): Dock trägt noch
  EU-Gefahrenindex, Feuerwetter-Treiber, Bodentrockenheit, Brennmaterial, Schutzgebiete und den
  Zeitraum-Block; Karte zeichnet Detektionen, Anomalien-Rauten, Brandflächen und die FWI-Fläche
  unverändert, Brände-Liste 134 Einträge. Kopfzeile „1 aktiv". Konsole nur die vorbestehenden externen
  Fehler (GeoSphere 404, EFFIS/EMS-CORS im Dev-Server ohne Netlify-Proxys).
