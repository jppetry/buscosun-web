# Vorlage Seewetter · Ausfahrt planen in drei Modi

Stand 19.11.2026. Quelle: Design-Canvas „Seewetter · Ausfahrt planen (Desktop, Tablet, Mobil)“ (claude.ai, https://claude.ai/artifact/5sQVFERowgDCz6UTH5kWwW). Baut auf Phase SP auf (`audit/seewetter-planer.md`). Jan hat die Entwürfe am 18.11. gesehen und die Umsetzung beauftragt; sie sind die Vorgabe für Aufbau, Reihenfolge und Tonfall, nicht für Werte.

| Datei | Größe | Inhalt |
| --- | --- | --- |
| `seewetter-ausfahrt-desktop-etappe.dc.html` | 1440 × 980 | Desktop, Modus **Etappe** (Segeln, Motorboot): Laboe → Marstal mit zwei Wegpunkten |
| `seewetter-ausfahrt-tablet-vor-ort.dc.html` | 834 × 1112 | Tablet, Modus **Vor Ort** (Kite, Wing, Surf): St. Peter-Ording, Fenster 12 bis 15 Uhr |
| `seewetter-ausfahrt-mobile-vor-ort.dc.html` | 390 × 844 | Mobil, Modus **Vor Ort** (Boot, Kajak, Angeln): Laboe, Werte in Beaufort |
| `seewetter-ausfahrt-mobile-strand.dc.html` | 390 × 844 | Mobil, Modus **Strand** (Brandungsangeln): fünf Strände am Abend |

Alle vier laden `./support.js` aus diesem Ordner (dieselbe Laufzeit wie die übrigen `*.dc.html`). Statisch, ohne Rechenlogik. Für Etappe gibt es keinen Mobil-Entwurf und für Strand keinen Desktop-Entwurf.

## Was verbindlich ist

- **Drei Modi, ein Planer.** Das Profil setzt den Modus beim Öffnen, der Umschalter „Art der Ausfahrt“ (Vor Ort | Etappe | Strand) ändert ihn jederzeit.
  - **Etappe:** von A nach B mit Wegpunkten von Hand, feste Fahrt in Knoten, Abfahrtszeit. Keine automatische Routenwahl.
  - **Vor Ort:** Spot, Boot im Umkreis, Fenster Start → Rückkehr. Das ist der Planer der Phase SP, wie gebaut.
  - **Strand:** mehrere Strände nach Windrichtung zum Ufer, Abendstunden mit hell / Dämmerung / dunkel.
- **Gemeinsamer Rahmen:** Karte, Zeitfenster, zwei Karten (Start bzw. Abfahrt gegen Rückkehr bzw. Ankunft), Liste der Befunde, Fuß mit „Amtliche Warnungen gehen vor.“
- **Etappe, Desktop:** links Eingabe (Start, Wegpunkte, Ziel, Fahrt, Strecke und Dauer, „Abfahrt vergleichen“ mit drei Zeiten und der Zahl der Hinweise, deine Grenzen), Mitte Karte mit Route und Boot zur gewählten Stunde, darunter die Tabelle „Entlang der Etappe“ (Uhr, Ort, Wind zum Kurs, Wind, Böen, Welle, Strom, Wetter), rechts Karten Abfahrt und Ankunft, Befunde, amtlicher Block.
- **Farbe:** Rot nur für „über deiner Grenze“. Die Route ist dunkel innerhalb der Grenzen und rot darüber. Sonst die Töne des Command-Decks und `--sw-*`; keine neuen Tokens ohne Not.
- **Wortlaut:** „Hinweis“, „über deiner Grenze“, „möglich“. Kein „sicher“, keine eigene Warnung, keine Fangprognose. Amtliches steht wörtlich in eigenem Kasten.
- **Einheit:** die gewählte Einheit der Seite gilt überall (kn, Bft, km/h); die Mobil-Entwürfe für Angler zeigen Beaufort.
- **Schrift:** in der App die selbst gehosteten Schriften aus `src/fonts.css`. Die Vorlage lädt Google Fonts nur für die Canvas-Vorschau.

## Was nur Illustration ist

- **Alle Werte, Orte und Zeiten sind erfunden.** Kein Lauf, keine Messung steckt dahinter.
- **Die Karten sind gezeichnete SVG**, keine MapLibre-Karte. Küstenform und Lage der Orte sind grob.
- **Fünf Chips „Wer fährt?“** (Segeln, Motorboot, Kite · Wing · Surf, Boot · Kajak, Brandung) stehen für die Zielgruppen. Die App hat sieben Profile mit eigenen Grenzen (`seaProfiles.ts`); sie bleiben. „Brandung“ ist in der App der Modus Strand, kein achtes Profil.
- **Gefärbte Uferlinie im Strand-Entwurf:** die Daten tragen je Spot eine Ufernormale, keine Küstenlinie (E-SP-5). In der App wird die Marke des Spots gefärbt, nicht ein Stück Küste.
- **„Drift aus Wind und Strom nach Nordost“** (Mobil, Vor Ort): eine gemeinsame Drift rechnet die Seite nicht. Wind und Strom stehen getrennt, je mit ihrer Richtung.
- **Dauer und Ankunft der Etappe** folgen aus Strecke und eingegebener Fahrt. Der Strom steht in der Tabelle, verändert die Ankunft aber nicht.
- **„[Warnstatus des DWD für Belte und Sund, wörtlich]“** ist ein Platzhalter für den amtlichen Text.
- **Tablet 834 px** liegt zwischen den Breakpoints 767 und 1439 des Projekts. Der Entwurf zeigt, wie der Desktop-Aufbau dort umbrechen soll, nicht einen dritten Breakpoint.
