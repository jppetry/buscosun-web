# Vorlage Regenradar 2.0 (Phasen RR, NP-1 … NP-5)

Stand 03.10.2026. Quelle: Design-Canvas „Regenradar 2.0 – UI-Mockup" (claude.ai, <https://claude.ai/artifact/3AR1HAJw7iJk8KGhUGnZgz>).
Konzept: `audit/niederschlagsplattform-konzept.md`, Teil 1: `audit/regenradar-datenangleich.md`. Verbindlich wird die
Vorlage erst mit Jans Freigabe der jeweiligen Phase.

| Datei | Größe | Inhalt |
| --- | --- | --- |
| `regenradar2-desktop.dc.html` | 1440 × 900 | Desktop, **interaktiv**: Ebenen-Schalter, Darstellung Intensität/Chance/Summe, Phase einfärben, Ansicht Karte / Karte + 3D / 3D, 3D-Modi Relief / Höhen-Zeit-Schnitt, Zeitachse mit Zoomstufen 4 h · 12 h · 48 h · 14 T und Play, Zellwahl, Regenfahrplan-Reiter 2 h / 48 h / 14 Tage |
| `regenradar2-mobile.dc.html` | 390 × 844 | Mobil (iPhone 12 Pro), statisch: Karte, Suchpille, kompakte Zeitachse, Bottom-Sheet „Jetzt" mit fünf Reitern |
| `regenradar2-zeichensprache.dc.html` | 880 × 900 | Zeitzonen, Rampen, Phasen-Töne, Prognose-Stil, Schneegrenze, Zellen, Blitze, neue Tokens |

Die Dateien laden `./support.js` aus diesem Ordner wie die übrigen `*.dc.html`-Vorlagen.

## Was verbindlich ist (nach Freigabe)

- **Aufbau Desktop:** Rail 62 px (Ink, Regenradar aktiv mit Steel-Indikator `#5E97D1`) · Topbar 60 px · Dock 250 px (in
  „Karte + 3D" 64 px, nur Symbole) · Bühne (Rest) · Readout 380 px · Zeitachse als Glas-Panel unten über der Bühne
  (16 px Rand, 132 px hoch).
- **Zeitzonen-Grammatik:** gemessen = gefüllt + durchgezogener Zellumriss; Nowcast = schraffiert + gestrichelter Umriss;
  Modell = gepunktet, Karte nur Punktraster + Konturen, Etikett „Modell · Cube". Kein Modell im Radarstil.
- **Phase als Farbton, nie als Symbol.** Schneeregen mit feiner weißer Schraffur.
- **Schneefallgrenze:** Linie p50 mit weißem Rand, Gürtel p10–p90 halbtransparent, Beschriftung „Schneefallgrenze … m · Band … m".
- **Readout:** Regenfahrplan mit „Regen ab HH:MM" und Spanne (80 %), Zell-Steckbrief mit Trend-Chip und Hinweis-Satz,
  Schnee am Ort, Herkunft am Ort.
- **Typografie und Maße** wie Brandradar- und Autobahnwetter-Deck: Eyebrows 9 px / 1,5 px / 700, Titel 15–34 px,
  Radien 8–13 px, Glasflächen `rgba(250,246,234,.95)` mit 1 px `#E0D6BE`. In der App die selbst gehosteten Schriften aus
  `src/fonts.css` — **keine** Google-Fonts-Anfrage (die Vorlage lädt sie nur für die Canvas-Vorschau).

### Farb-Tokens (neu, Namensraum `--np-*`, additiv in `src/designTokens.css`)

| Token | Wert | Bedeutung |
| --- | --- | --- |
| `--np-mix` | `#A47DC9` | Schneeregen (mit Schraffur) |
| `--np-snow-1` / `-2` / `-3` | `#E8EEFC` / `#9EAEE8` / `#5E6CC0` | Schnee leicht / mäßig / stark |
| `--np-snowline` | `#4F5FB8` | Schneefallgrenze (Linie) |
| `--np-snowbelt` | `#8C9BE0` bei 28 % | Unsicherheitsgürtel p10–p90 |
| `--np-flash-0` / `-5` / `-10` | `#E3B23C` / `#D9822B` / `#9A5A2A` | Blitz 0–5 / 5–10 / 10–15 min |
| `--np-hail` | `#C0307A` | Hagel-Umriss |
| `--np-model` | `#7A9466` | Modell-Zone der Zeitachse |

Bestand bleibt Bestand: Regen-Rampe `precipRainRamp` (`src/scalar/RainLayer.ts`), Zell-Farben `CELLS_SEVERITY_COLOR`
(`src/radar/cellLayers.ts`), Nowcast-Steel `--nc-blue`.

## Was nur Illustration ist

- **Die Karte** ist eine gezeichnete SVG-Skizze Oberbayern/Tirol. In der App ist es `MapView` (positron, Phase RR).
- **Die 3D-Bühne** ist eine SVG-Skizze. In der App: MapLibre-Terrain + `fill-extrusion` + gedrapte Bilder (Relief) bzw.
  SVG (Höhen-Zeit-Schnitt), s. Konzept §7.
- **Alle Werte, Zellen, Zeiten** sind Beispieldaten (Szenario Sa 03.10. 14:00, Garmisch-Partenkirchen). Die Rechenlogik im
  `<script>` der Desktop-Vorlage (Zellbahnen linear, Schneefallgrenzen-Kurve, Chance-Felder) macht das Mockup nur
  klickbar und ist **keine** Vorlage für Daten oder Algorithmen.
