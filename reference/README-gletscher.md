# Vorlage Gletscher-Monitor DACH (Phase GL)

Stand 11.10.2026. Quelle: Design-Canvas „Gletscher-Monitor DACH – UI-Mockup“ (claude.ai, https://claude.ai/artifact/TWgwJKGeQ6eC3ksDWKsVEY, Version 9). Plan: `audit/gletscher-plan.md`, Konzept: `audit/gletscher-konzept.md`. Als UI-Vorgabe gilt sie, sobald Gate A sie bestätigt.

| Datei | Größe | Inhalt |
| --- | --- | --- |
| `gletscher-desktop-lage.dc.html` | 1440 × 900 | DACH-Lage, **interaktiv**: Suche, Land-Chips, „Karte färben nach“ (Schmelze heute / Verlust Saison / Ausaperung / Länge), Rangliste, Gletscher als Kreise nach Fläche, Auswahl-Pille mit Sprung in den Steckbrief, Saisonverlauf je Land, Readout mit Länderkarten und „Was sich verändert hat“ |
| `gletscher-desktop-steckbrief.dc.html` | 1440 × 900 | Steckbrief Hintereisferner, **interaktiv**: Reiter Heute / Saison / Langzeit / Tour / Quellen, Zeitpunkt „heute (Oktober)“ ↔ „Beispiel Hitzewelle (August)“, Karte oder 3D, Ebenen Umriss 2003 und Schneegrenze, Vergleichsregler 2003 ↔ 2026 im Reiter Langzeit |
| `gletscher-mobile-lage.dc.html` | 390 × 844 | Mobil, DACH-Lage: Karte oben, Größen-Chips, Länderkarten zum Wischen, Rangliste, Verlauf |
| `gletscher-mobile-steckbrief.dc.html` | 390 × 844 | Mobil, Steckbrief: Karte oder 3D oben, Zeitpunkt, Reiter Heute / Saison / Tour / Langzeit, Schmelze 7 Tage als Balken |
| `gletscher/dach_{728x470,390x330}.svg` | – | Länderkarte DACH (Natural Earth) mit Gletscherpunkten |
| `gletscher/hef_map_{708x780,390x430}_{aug,oct}.jpg`, `hef_map_708x780_2003.jpg` | – | Relief und Eis Hintereisferner (SRTM-Hillshade, Eis aus dem Umriss geschätzt) |
| `gletscher/hef_3d_{708x780,390x300}_{aug,oct}.jpg` | – | 3D-Ansicht (Voxel-Renderer der Vorlage, **nicht** das App-Verfahren) |
| `gletscher/hef_map_*_outl.svg`, `hef_map_*_sl_{aug,oct}.svg` | – | Umriss 2003 (RGI 7) und Schneegrenze als Ebenen |

Alle HTML-Dateien laden `./support.js` aus diesem Ordner, dieselbe Laufzeit wie die übrigen `*.dc.html`-Vorlagen. Die Bilder liegen unter `./gletscher/`. Die Verweise zwischen den vier Ansichten (Rail, Auswahl-Pille, Zurück) zeigen auf die Dateinamen hier. Zum Rendern als PNG für den Pixelvergleich wie bei `seewetter-desktop.dc.html` vorgehen.

## Was verbindlich ist

- **Aufbau Desktop:** Rail 62 px (Ink) · Topbar 60 px · Dock links 250 px · Karte 728 px (Steckbrief 708 px) · Readout rechts 400 px (Steckbrief 420 px). In der DACH-Lage liegt der Saisonverlauf unter der Karte.
- **Topbar:** Titel, je Herkunft ein Stand-Chip (Modell · Fusion-Lauf, Sentinel-2 · letzte Szene, Messung · letzte amtliche Zahl), Saisonstatus, Teilen. Im Steckbrief kommen Zeitpunkt und Folgen dazu.
- **Dock DACH:** Suche, Land (Alle / CH / AT / DE), „Karte färben nach“ mit Herkunftszeichen je Größe, Rangliste. **Dock Steckbrief:** Kennzahlen mit Herkunft, Ansicht Karte | 3D, Ebenen.
- **Karte DACH:** Kreise nach Fläche, Farbe nach der gewählten Größe. Ohne Wert erscheint ein gestrichelter Kreis mit Grund (zu klein, keine Messung). Rechts unten Legende, Auswahl-Pille mit Wert, Herkunft und Link in den Steckbrief.
- **Readout DACH:** Lage je Land mit der jüngsten amtlichen Zahl und deren Datum, „Was sich verändert hat“ (jede Zeile mit Quelle und Zeit), nächste Berichte.
- **Steckbrief-Reiter:**
  - **Heute:** Schmelze heute / 7 / 14 Tage mit Spanne, Temperatur an Zunge, Gleichgewichtslinie und Firn, Nullgradgrenze, nächste Hochstation.
  - **Saison:** Schneegrenze je Szene vor dem Band 2000–2025, AAR, Albedo-Anomalie, Saisonschätzung neben der amtlichen Bilanz.
  - **Langzeit:** Vergleichsregler, Längenreihe, Projektion als Band je Szenario.
  - **Tour:** Nullgradgrenze 48 h gegen die Gletscherhöhe, Nächte ohne Frost, Blankeis, Links, Vorbehalt.
  - **Quellen:** Herkunft, Stand und Lizenz je Kennzahl, gesperrte Quellen.
- **Zeichensprache:**
  - Herkunft als Kennzeichen an jedem Wert: gemessen = Salbei, Satellit = Violett, Modell = Amber, amtlich = Tinte.
  - Verlust in Terrakotta, Schnee und Schmelze in Gletscher-Cyan, je eine Rampe von hell nach dunkel.
  - Länderkurven: CH Cyan, AT Terrakotta, DE Violett (mit dem Palettenprüfer auf Farbfehlsichtigkeit geprüft).
  - Gestrichelter Kreis = kein Wert; gestrichelte Linie = Umriss eines früheren Jahres.
  - Kein Text sagt „begehbar“ oder „sicher“.
- **Mobil:** Karte oben, darunter Chips, wischbare Länderkarten (`flex: 0 0 auto`, Scrollleiste verborgen), Touch-Ziele ≥ 44 px.
- **Typografie und Maße** wie das Command-Deck (Brandradar, Autobahnwetter, Seewetter). In der App kommen die Schriften selbst gehostet aus `src/fonts.css`, **keine** Google-Fonts-Anfrage; die Vorlage lädt sie nur für die Canvas-Vorschau.

### Farb-Tokens (neu, Namensraum `--gl-*`, im lazy `src/glacier/glacierDeck.css` — nicht in `designTokens.css`, Muster `--sw-*` in `seaDeck.css`)

| Token | Wert | Bedeutung |
| --- | --- | --- |
| `--gl-accent` | `#1E87A8` | UI-Akzent „Gletscher-Cyan“ (aktive Segmente, Reiter, Schalter), Länderkurve CH |
| `--gl-accent-dark` | `#145A70` | Hover, Links, Text auf Tint |
| `--gl-tint` | `#E3F1F5` | Fläche aktiver Chips |
| `--gl-rail-icon` | `#8FD0E3` | aktives Rail-Icon (auf `#3A3833`) |
| `--gl-prov-measured` | Text `#4F6A3D`, Fläche `#EFF3E8`, Rand `#C3D2AF`, Punkt `#5F7A4C` | Herkunft gemessen |
| `--gl-prov-satellite` | Text `#4B3D96`, Fläche `#EEEBF8`, Rand `#CFC6EE`, Punkt `#6B5BB8` | Herkunft Satellit; Länderkurve DE |
| `--gl-prov-model` | Text `#7A5418`, Fläche `#FBF3E7`, Rand `#E7D3B4`, Punkt `#B8862F` | Herkunft Modell |
| `--gl-prov-official` | `#2C2A26` (Ink) | Herkunft amtlich |
| `--gl-loss` | `#8F4A22` | große Verlustzahlen |
| Rampe Verlust | `#F4DCC6` · `#E9B48C` · `#D68A55` · `#B5602C` · `#7E3C17` | Verlust / Länge (B5602C = Länderkurve AT) |
| Rampe Schnee/Schmelze | `#E3F1F5` · `#A9D4E2` · `#5FAFC9` · `#1E87A8` · `#145A70` | Schmelze, Ausaperung |

## Was nur Illustration ist

- **Echt** (Stand Recherche 11.10.2026):
  - GLAMOS 2025/26 (CH −5,5 % Volumen, −2,86 m w. e., 76 Tage Nullgrad > 4 000 m)
  - ÖAV 2024/25 (Ø −20,3 m, Werte Alpeiner Ferner, Stubacher Sonnblickkees, Krimmler Kees, Pasterze)
  - AGI 5 (285 km², rund 800 Gletscher), BAdW 2025 (4 Gletscher, 26,2 ha)
  - UIBK Hintereisferner 2024/25 (−1 793 mm w. e., Gleichgewichtslinie 3 302 m, AAR 0,24)
  - Umrisse RGI 7 (Stand 2003), Gelände SRTM 90 m, Länderkarte Natural Earth, Längenreihe Hintereisferner 1847–2003
- **Illustrativ:** Schmelze heute und Ausblick, Saisonkurven, Schneegrenzen-Verlauf, Ausaperung, Projektion, alle Feed-Einträge außer den amtlichen.
- **Fläche 2026:** aus dem Umriss 2003 geschätzt (Rand um 100 m erodiert, Zunge bei 2 630 m abgeschnitten), **keine** Messung.
- **Die 3D-Bilder** stammen aus einem Voxel-Renderer der Vorlage. In der App ist die 3D-Bühne eingebautes MapLibre-3D nach dem Muster `TowerStage.tsx` (Terrarium `raster-dem`, `setTerrain`, drapierte Ebenen), kein Custom Layer, kein Shader.
- **Die Rechenlogik im `<script>`** (Färbung, Ranglisten, Reiter) macht die Vorlage klickbar. Sie ersetzt weder `glacierContract.ts` noch dessen Prüfer.
