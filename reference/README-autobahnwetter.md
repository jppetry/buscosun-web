# Vorlage Autobahnwetter (Phase AW)

Stand 13.10.2026 (Gefahren-Leiste ergänzt; Grundfassung 03.10.2026). Quelle: Design-Canvas „Autobahnwetter – UI-Mockup“ (claude.ai), von Jan als UI-Vorgabe für Phase AW festgelegt. Plan: `audit/autobahnwetter-plan.md`, Konzept: `audit/autobahnwetter-konzept.md`, Gefahren-Leiste und Detailansicht: `audit/autobahnwetter-gefahren.md`.

| Datei | Größe | Inhalt |
| --- | --- | --- |
| `autobahnwetter-desktop.dc.html` | 1440 × 900 | Desktop, **interaktiv**: Autobahnliste, Länderfilter, Messpunkte auf Karte und Streckenband, Zeitregler, Ebenen-Schalter, Reiter Station / Strecke / Quellen, Abfahrtszeit |
| `autobahnwetter-mobile.dc.html` | 390 × 844 | Mobil (iPhone 12 Pro), statisch: Karte vollflächig, Korridor-Pille, Zeitchips, Bottom-Sheet „Strecken-Briefing“ |
| `autobahnwetter-gefahren.dc.html` | 1440 × 900 | Desktop mit **Gefahren-Leiste** rechts (AW-8), interaktiv: Zeitraum Jetzt / Bis +6 h, Lage-Matrix (Zelle = Filter), Filter-Chips, Liste je Gefahr, Zeile öffnet die Detailansicht; Gefahren-Overlay auf der Karte |
| `autobahnwetter-gefahren-detail.dc.html` | 1440 × 900 | dieselbe Datei, startet in der **Detailansicht** (A 8 Weyarn – Irschenberg): Querschnitt, Gefahren-Fahrplan, Temperaturen, Messgrößen gegen Schwellen, Wind zur Fahrbahnachse, Ortsmerkmale, Messpunkte, Warnung, „Nicht messbar“ |

Alle Dateien laden `./support.js` aus diesem Ordner (dieselbe Laufzeit wie die übrigen `*.dc.html`-Vorlagen). Zum Rendern als PNG für den Pixelvergleich wie bei `dashboard.dc.html` vorgehen.

## Was verbindlich ist

- **Aufbau Desktop:** Rail 62 px (Ink) · Topbar 60 px · Dock links 250 px · Karte (Rest, 728 px bei 1440) · Readout rechts 400 px. Streckenband als Glas-Panel über dem Kartenfuß (16 px Rand). Overlays oben links (Korridor-Pille, Zeitregler, Hinweis „abgeleitet“), oben rechts (Legende, Zoom).
- **Aufbau Mobil:** Karte vollflächig, oben Korridor-Pille + Teilen (44 px), darunter Zeitchips (36 px hoch), Bottom-Sheet mit Griff, Briefing-Kopf, Mini-Band, drei kritische Punkte mit Ankunftszeit, zwei Aktionen (44 px).
- **Komponenten und Zustände:** Autobahnliste mit Schild(en), Titel, Zählzeile, Status-Punkt; Ebenen als Schalter-Zeilen; blockierte Quelle gestrichelt mit Schloss und Grund; Datenlage je Land; Readout-Karte (Eyebrow, Titel, Unterzeile, Status-Chip, Hero-Wert, Klassen-Badge, Wertegitter 2 × 4, Fahrer-Hinweis, Verlauf 24 h + 6 h, vier Prognose-Kacheln, amtliche Warnung, Qualität/Quelle); Reiter „Strecke“ (Abfahrt ± 30 min, Tabelle km · Messpunkt · an · Zustand); Reiter „Quellen“ (aktiv / blockiert). **Ab AW-8:** Die rechte Spalte startet mit der Gefahren-Leiste, der Reiter „Station“ geht in der Detailansicht auf (siehe unten).
- **Zeichensprache:** gefüllter Punkt = DWD-Fahrbahnmessung · Ring = Prognosepunkt AT/CH · schraffiert = keine gültige Messung. Im Band: voll = Messung, schraffiert farbig = Prognose (AT/CH), sand-schraffiert = keine Messung im 10-km-Umkreis. Prognosewerte tragen immer „abgeleitet“, nie Warnsprache.
- **Typografie und Maße:** wie das Brandradar-Deck (`src/fire/fireDeck.css`): Eyebrows 9 px / 1,5 px Laufweite / 700, Titel 12,5–20 px, Hero 44 px, Radien 8–13 px, Glasflächen `rgba(250,246,234,.95)` mit 1 px `#E0D6BE`. In der App die selbst gehosteten Schriften aus `src/fonts.css` und die Font-Tokens nutzen – **keine** Google-Fonts-Anfrage (die Vorlage lädt sie nur für die Canvas-Vorschau).

### Farb-Tokens (neu, Namensraum `--aw-*`, additiv in `src/designTokens.css`)

| Token | Wert | Bedeutung |
| --- | --- | --- |
| `--aw-ice` | `#B5321F` | Glätte gemessen (Eis, Schnee, Reif) |
| `--aw-frost` | `#E39A3B` | Frostgefahr |
| `--aw-wet` | `#5E97D1` | Nass |
| `--aw-dry` | `#8DB07A` | Trocken |
| `--aw-nodata` | `#8B8474` | keine gültige Messung (immer schraffiert, nie flächig) |
| `--aw-accent` | `#1F5FAE` | UI-Akzent „Autobahn-Blau“ (aktive Segmente, Reiter, Schalter) |
| `--aw-shield-de` / `--aw-shield-at` | `#1F4E9E` | Autobahnschild DE/AT |
| `--aw-shield-ch` | `#C1272D` | Autobahnschild CH |
| `--aw-rail-icon` | `#8FB4E3` | aktives Rail-Icon (Indikator `#5E97D1`) |
| `--aw-corridor` | `#F3EDDF` (Kern) · `#FAF6EA` 16 % (Glow) | gewählter Korridor auf der dunklen Karte |

Hinweis-Kästen je Klasse (Fläche / Rahmen / Text): Glätte `#FBE9E4 / #E8C9BD / #8A1C1C` · Frost `#FBF3E7 / #E3C39A / #7A4520` · Nass `#EAF1F7 / #C7D6E4 / #28507A` · Trocken `#EFF3E8 / #C3D2AF / #4D6A3B` · keine Daten `#F4F0E4 / #D9D0B8 / #5C5447`.

## Was nur Illustration ist

- **Die Karte** ist eine gezeichnete SVG-Skizze von Oberbayern/Salzburg. In der App ist es eine echte MapLibre-Karte (Basiskarte und Steuerung wie `FireMap.tsx`), Korridore aus `road/v1/static/corridors.json`.
- **Alle Werte, Stationen, Kilometer, Zeiten** sind Beispieldaten (Szenario Novembermorgen 06:15). Die Stationsnamen sind real, ihre Werte nicht.
- **Die Rechenlogik im `<script>` der Desktop-Vorlage** (Tagesgang per Kosinus, Klassen-Ableitung) dient nur dazu, das Mockup klickbar zu machen. Sie ist **keine** Vorlage für die Prognose (AW-6) und keine Plausibilitätsregel (AW-1).
- Der amtliche Warntext ist ein Platzhalter; echte Warnungen werden wörtlich aus dem DWD-CAP-Feed zitiert.

## Gefahren-Leiste und Detailansicht (AW-8)

**Verbindlich**

- **Rechte Spalte** (400 px): Reiter Gefahren · Strecke · Quellen, „Gefahren“ voreingestellt. Der Reiter „Station“ der Grundfassung entfällt; seine Inhalte stehen im Detail unter „Messpunkte und Anker“, ein Klick auf einen Messpunkt öffnet das Detail seines Abschnitts. Inhalt scrollt unter dem fest stehenden Reiter; im Detail bleibt die Leiste mit Zurück und Vor/Zurück oben stehen.
- **Lage:** Eyebrow „Gefahrenlage DACH“, Titel mit Zahl der Abschnitte, Zeitraum-Schalter, Karte „Abschnitte je Gefahr und Stunde“ (7 × 7 Zellen, Höhe 24 px, Zahl = Abschnitte, Farbe = höchste Stufe, Legende darunter), Filter-Chips (Pillen), Gruppen mit Icon, Großbuchstaben-Titel und Zähler, Zeilen mit 5-px-Stufenbalken links.
- **Detail:** Reihenfolge der Karten wie in der Vorlage. Der Querschnitt ist eine Illustration (Schichtdicke überhöht, so beschriftet), keine Messgrafik.
- **Zeichensprache:** Farbe = Stufe 1–3 (`--aw-sev-*`), gefüllter Kreis = gemessen, halber Kreis = aus Messwerten abgeleitet, Ring = Prognose, Schraffur = unbekannt. Diese Formen sind CSS-Formen, keine Unicode-Zeichen (League Spartan hat keine Glyphen dafür). Stufen nie nur über Farbe: „Stufe n“ steht im Chip.
- **Karte:** Abschnitte als 6-px-Linie in Stufenfarbe mit dunkler 9-px-Kontur über dem Korridor, unbekannt grau gepunktet, gewählter Abschnitt mit hellem 16-px-Saum (35 %). Zweite Legende „Gefahren jetzt / bis +6 h“ unter der Fahrbahn-Legende.
- **Tokens:** siehe `audit/autobahnwetter-gefahren.md`, Abschnitt „Neue Tokens“.

**Nur Illustration**

- Diagramme sind in der Vorlage handgezeichnetes SVG bzw. HTML. In der App kommen sie aus nivo, Zuordnung siehe `audit/autobahnwetter-gefahren.md`, Abschnitt „nivo“: Lage-Matrix und Gefahren-Fahrplan `@nivo/heatmap`, Temperaturen `@nivo/line`, Messgrößen `@nivo/bullet`, Wind `@nivo/polar-bar`. Maße, Farben und Beschriftung der Vorlage gelten, das Rendering darf nivo-typisch abweichen (Tooltip, Animation, Kantenglättung); der Pixelvergleich bewertet Aufbau und Zeichensprache, nicht Pixelgleichheit der Diagramme.
- Abschnitte, Stufen, Texte und Zeiten sind Beispieldaten (Szenario Novembermorgen 06:15). Abschnitte außerhalb der gezeichneten Karte (A 7, A 9 Nord, A 10, A 2) haben keine Kartenlinie; in der App springt die Karte hin.
- Die Logik im `<script>` (Stufen als feste Arrays, Bullet- und Windwerte aus Stationsdaten, Polar-Keulen) macht nur das Mockup klickbar und ist **keine** Vorlage für `roadHazards.ts`.
