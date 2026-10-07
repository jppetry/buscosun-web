# Vorlage Seewetter (Phase SW)

Stand 07.10.2026. Quelle: Design-Canvas „Seewetter – UI-Mockup“ (claude.ai, https://claude.ai/artifact/D1nvnMEM4AgET93ocaG3b1). Plan: `audit/seewetter-plan.md`, Konzept: `audit/seewetter-konzept.md`, Datenlage: `audit/seewetter-datenpruefung.md`. Als UI-Vorgabe gilt sie erst, wenn Jan sie an Gate A bestätigt.

| Datei | Größe | Inhalt |
| --- | --- | --- |
| `seewetter-desktop.dc.html` | 1440 × 900 | Desktop, **interaktiv**: Spotliste und Kartenpunkte, Revier-Chips, Profil-Chips mit „Grenzen anzeigen“, Ebenen, Zeit-Chips und Stundenband, Einheit kn/Bft/km/h, Reiter Spot / Seegebiet / Quellen |
| `seewetter-mobile.dc.html` | 390 × 844 | Mobil (iPhone 12 Pro), statisch: Karte vollflächig, Spot-Pille, Zeit-Chips, Bottom-Sheet „Spot-Briefing“ (Zustand + 24 h, Do 12:00) |
| `seewetter/map_d_{10,22,34,58}.png` | 728 × 840 | Kartenbilder Desktop für die vier hinterlegten Zeitstufen (Vorlauf + 10, + 22, + 34, + 58 h des Laufs 07.10. 00 UTC = Mi 12, Do 00, Do 12, Fr 12 Uhr MESZ) |
| `seewetter/map_m_34.png` | 390 px breit | Kartenbild Mobil (+ 34 h) |

Beide HTML-Dateien laden `./support.js` aus diesem Ordner (dieselbe Laufzeit wie die übrigen `*.dc.html`-Vorlagen). Zum Rendern als PNG für den Pixelvergleich wie bei `autobahnwetter-desktop.dc.html` vorgehen.

## Was verbindlich ist

- **Aufbau Desktop:** Rail 62 px (Ink) · Topbar · Dock links 250 px · Karte 728 px bei 1440 · Readout rechts 400 px. Das Stundenband liegt als Glas-Panel über dem Kartenfuß. Über der Karte oben links Spot-Pille und Zeit-Chips, oben rechts Legende.
- **Dock:** Suche, Revier-Chips (Alle / Nordsee / Ostsee), Profil-Chips mit „Grenzen anzeigen“, Spotliste mit Profilstatus je Spot, Ebenen-Gitter (Seegang gesamt / Windsee / Dünung / Periode), Schalter (Wind-Partikel, Warnstatus Küste, Messstationen), gesperrte Quelle „Wasserstand-Vorhersage“ gestrichelt mit Schloss und Grund, Datenlage.
- **Readout, Reiter Spot:** Kopf mit Spot und Profil, Spot-Kompass (Uferlinie, Wind- und Wellenpfeil), Urteil mit Gründen, Karte „Im Fenster“, Verlauf (Wind/Böe oben, Seegang unten, nicht gestapelt), Karte „Amtlich“ mit wörtlichem Text, Ausgabezeit und Nummer, Karte „Gemessen“, Vorbehalt.
- **Readout, Reiter Seegebiet:** Seewetterbericht wörtlich (heute/morgen), Mittelfrist mit Wassertemperatur, Lesehilfe Beaufort ↔ Knoten. **Reiter Quellen:** Läufe, Ausgaben, Lizenzen, gesperrte Quellen.
- **Stundenband:** Zeilen Wind (kn mit Pfeil), Böe, Seegang, Periode, Urteil; Spalten dreistündlich in der Vorlage (in der App stündlich bis + 48 h), Tagestrenner, Nacht schattiert, Klick setzt die Zeit.
- **Zeichensprache:** gefüllter Punkt = Spot mit Modellreihe · Ring = Messstation · schraffiert = keine Daten. Klassenfarben sind auch in der Helligkeit unterscheidbar. Amtliches steht immer in eigenem Kasten mit Quelle, Nummer und Ausgabezeit. Kein Text sagt „sicher“.
- **Mobil:** Karte vollflächig, oben Spot-Pille und Teilen (44 px), Zeit-Chips, Bottom-Sheet mit Griff: Urteil und nächstes Fenster, Kennzahlen, Mini-Band, Warnstatus gekürzt mit „ganzen Text lesen“, zwei Aktionen (44 px).
- **Typografie und Maße:** wie das Command-Deck (Brandradar, Autobahnwetter). In der App die selbst gehosteten Schriften aus `src/fonts.css` – **keine** Google-Fonts-Anfrage (die Vorlage lädt sie nur für die Canvas-Vorschau).

### Farb-Tokens (neu, Namensraum `--sw-*`, additiv in `src/designTokens.css`)

| Token | Wert | Bedeutung |
| --- | --- | --- |
| `--sw-accent` | `#0F6E7A` | UI-Akzent „Seewetter-Petrol“ (aktive Segmente, Reiter, Schalter) |
| `--sw-accent-dark` | `#0B5560` | Hover, Text auf Tint |
| `--sw-tint` | `#E3F0F1` | Fläche aktiver Chips |
| `--sw-rail-icon` / `--sw-rail-ind` | `#7FC4CC` / `#2A9AA6` | aktives Rail-Icon und Indikator |
| `--sw-ok` | `#8DB07A` | passt zu deinen Grenzen |
| `--sw-tight` | `#E39A3B` | knapp (innerhalb 10 % einer Grenze) |
| `--sw-out` | `#B5482E` | außerhalb deiner Grenzen |
| `--sw-nodata` | `#8B8474` | keine Daten (immer schraffiert, nie flächig) |
| `--sw-land` | `#161C24` | Land unter der Seegangsfläche |

**Skala Seegang Hs** (dunkle Karte, Helligkeit steigt gleichmäßig): 0 m `#11283A` · 0,5 `#164B64` · 1 `#1B6F7F` · 1,5 `#3E9284` · 2 `#86AE6F` · 2,5 `#C8B75B` · 3 `#E39A3B` · 4 `#C9572E` · 5 `#A33A4F` · ab 6 m `#7A2E6E`. Linear zwischen den Stufen.

## Was nur Illustration ist

- **Die Kartenbilder** sind aus dem echten CWAM-Lauf vom 07.10.2026 00 UTC selbst dekodiert und gerendert (Seegang, Landmaske aus der GRIB-Bitmap). In der App ist es eine echte MapLibre-Karte; die Fläche wird auf der CPU eingefärbt (kein neuer Shader ohne Freigabe).
- **Spot-Reihen** (Seegang, Richtung, Periode, Windsee, Dünung) stammen aus demselben Lauf. Der Wind im Mockup ist der Antriebswind des Wellenlaufs, **in der App kommt er aus buscosun Fusion**; die Böen sind im Mockup geschätzt (Faktor 1,25 + 1 kn).
- **Messwerte an Küstenstationen** sind Beispielwerte.
- **Amtliche Texte** sind echte DWD-Bulletins (FQDL50/FQDL51 08:00 UTC, WODL45 09:00 UTC, FXDL40 vom 06.10.), nur der Fernschreib-Umbruch ist aufgelöst. Die Rohdateien liegen in `audit/seewetter/fixtures/`.
- **Die Rechenlogik im `<script>`** (Klassen, Fenster, Uferwinkel) macht das Mockup klickbar. Sie folgt den Regeln aus SW-6, ersetzt aber weder `seaProfiles.ts` noch dessen Prüfer.
- **Seegebietsgrenzen** sind bewusst nicht gezeichnet: Geometriequelle und Lizenz sind offen.
