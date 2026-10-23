# Phase HB — Historie: Plattform-Angleich + Bühne

> Stand 2026-10-22. Auftrag Jan: „mache das Historie-Feature visuell moderner und passender zur buscosun-Plattform,
> designe es neu, verifiziere es im Browser". Umfang per Rückfrage gewählt: **„Angleich + Bühne"** — Hülle 1:1 wie
> Wetterkarte/Dashboard, Klimastreifen als große Bühne, Aufbau Dock | Mitte | Readout bleibt; alle Funktionen bleiben.
> Vorgänger: Command-Deck-Umbau der Historie (Juli, `historyDeck.css`, Vorlage `references/historie.dc.html`).

## §1 Diagnose (Ist-Stand, Screenshots 1440×900 und 390×844 vom 22.10.)

| # | Befund | Ursache | Wirkung |
|---|---|---|---|
| D-1 | **Rail fast leer**: von 13 Werkzeug-Icons ist nur das aktive sichtbar | `.hd-root a { color: inherit }` (0,1,1) schlägt `.hd-rail-btn { color }` (0,1,0); die Rail-Knöpfe sind `<a>` (FeatureRail → `Link`) und erben Ink auf Ink | Navigation zu den anderen Werkzeugen praktisch unsichtbar — Funktionsfehler, nicht nur Optik |
| D-2 | Logo als grauer Kasten mit Rahmen | `rt-nav-logo-mark` aus `tourTheme.css` statt `/buscosun-mark.svg` wie Karte/Dashboard | Kopf sieht anders aus als auf jeder anderen Seite |
| D-3 | Topbar 60 px, Ort als weiße Pille mit „Ort wechseln" nur in der Modus-Wahl | eigene `.hd-topbar`-Werte | Höhe und Suchfeld weichen von `.mdk-topbar` (64 px, Suchfeld 40 px) ab; Ortswechsel aus den Diagrammen nur über „Modus wechseln" → „Ort wechseln" |
| D-4 | Diagrammwahl als 12 Mini-Chips (11 px) in einer Box | — | Hauptwahl der Seite ist das kleinste Bedienelement; die Karte zeigt ihre Wahl als Zeilen mit Icon + Unterzeile in farbigen Gruppen |
| D-5 | Klimastreifen 150 px hoch in einer Karte, darunter Legende, Slider und Satz als drei weitere Karten | Diagramme behalten ihre Mindestgröße; Mitte endet bei ≈ 60 % der Höhe | Leere untere Bildhälfte; das bekannteste Motiv der Seite wirkt klein |
| D-6 | Modus-Wahl mit schwarzem „KLIMA-LEITSTAND · ARCHIV BEREIT"-Streifen und erfundener Kachel-Grafik (fester Farbverlauf) | Vorlage Juli | Die Kachel „Veränderung" zeigt Streifen, die nicht vom gewählten Ort stammen |
| D-7 | Schriftgrößen 9–11 px für Werte und Labels (Readout, Rekorde) | — | schwer lesbar, gegenüber Karte (13 px Zeilen) zu klein |

Nicht Teil dieser Phase (Datenquelle): Berlin endet 2011 (Station Alexanderplatz), Wind (max) teils unplausibel (Memory Historie).

## §2 Plan

**Prinzip:** Die Klimastreifen sind die „Karte der Zeit". Die Mitte wird gebaut wie die Kartenbühne der Wetterkarte:
eine große Bühne mit Glas-Pille oben links (was sehe ich, wo, welcher Zeitraum), Werkzeugen oben rechts und einem
Zeit-Deck unten (Zeitraum-Schieber + Legende) — dieselbe Grammatik wie Kartenbühne + Zeitleiste, nur mit Jahren statt Stunden.
Alles drumherum bleibt ruhig und 1:1 Plattform.

- **Farben** (bestehende Tokens, keine neuen Grundfarben): Sand `#EDE6D3` (Fläche), Cream `#FAF6EA` (Dock/Readout/Karten),
  Ink `#2C2A26` (Rail, Text), Terracotta `#C97B47` (Veränderung, Akzent), Steel `#3A6FA8` (Rückblick), Rot `#C0492F` (Rekord heiß).
- **Schrift:** League Spartan wie überall; Stufen 11 (Gruppenkopf, versal wie `.mdk-group-head`) / 13 (Zeilen) / 15–19 (Werte) / 28 (Bühnen-Kennzahl).
- **Hülle:** `.hd-topbar`/`.hd-rail*` auf die Werte von `.mdk-topbar`/`.mdk-rail` (64 px, 58 px, gleiche Farben, Logo-SVG);
  Ortsfeld im Stil `.mdk-search-box` mit Klick = „Ort wechseln" in allen Ansichten; D-1 behoben über die Spezifität.
- **Dock:** Gruppen wie `.mdk-group` mit farbigem Kopf. Diagramme als Zeilen (Icon + Name + Unterzeile) in vier Gruppen:
  *Über die Jahre* (Streifen, Anomalie, Verlauf, Kenntage, Rekorde), *Innerhalb eines Jahres* (Tagesband, Kalender, Overlay),
  *Verteilung* (Bänder, Box, Windrose), *Nachschlagen* (Datum). Größe/Auflösung/Zeitraum/Referenz als Segmentreihen.
- **Bühne (Mitte):** füllt die Höhe. Streifen ohne Beschriftung strecken sich über die Bühne; Zeiger über einem Streifen
  zeigt Jahr, Wert und Abweichung in einer Glas-Pille (neue optionale Prop `onHover` in `Stripes`, `stretch` für die Höhe;
  Embed und Mobil unverändert). Andere Diagramme sitzen in derselben Bühne auf Cream. Zeit-Deck unten: Zeitraum-Schieber, Legende.
  Satz (Zusammenfassung) und Herkunft darunter.
- **Readout:** Karten im Stil der „Aktive Layer"-Karte (Akzentkante links), Werte 15–19 px.
- **Modus-Wahl:** schwarzer Streifen entfällt zugunsten eines ruhigen Kopfs; die Kachel „Veränderung" zeigt die **echten**
  Klimastreifen des Orts (aus den geladenen Tagen), statt einer festen Grafik.
- **Mobil (≤ 767):** eigener Baum, nur Kopf (Logo-SVG); Desktop-Regeln greifen dort nicht.
- **Dunkel:** jede neue Fläche bekommt ihren `[data-theme="dark"]`-Eintrag.

Funktionserhalt: Modus-Wahl, Ortssuche/-wechsel, Favorit, Profi-Panel, Teilen, Hell/Dunkel, alle 12 Diagramme mit ihren
Werkzeugen (Beschriftung, Trendlinie, Jahr-Stepper, Kenntag-Wahl + Schwelle, „Wie lese ich das?", Tabelle), Zeitraum-Schieber,
Tagesdetail, Kenntage/Rekorde, Explore-Drill, Embed, URL-Zustand. Kein Rechenpfad ändert sich (kein Flag nötig: reine Darstellung).

## §3 Umsetzung (22.10., uncommitted)

Geänderte Dateien: `src/history/HistoryPage.tsx`, `src/history/historyDeck.css`, `src/history/charts/Stripes.tsx`.

- **D-1 behoben:** Rail-Regeln mit `.hd-root .hd-rail-btn` (Spezifität 0,2,0) — alle 13 Icons sichtbar (`rgb(139,115,85)` gemessen).
- **Topbar** wie `.mdk-topbar`: Logo `/buscosun-mark.svg`, Seitenname „Historie", Ortsfeld (Klick = Ort wechseln, in allen
  Ansichten), Favorit/Profi, **Modus-Umschalter** Rückblick | Veränderung (wechselt direkt; der ‹-Knopf führt wie früher
  „Modus wechseln" zur Modus-Wahl), Hell/Dunkel, Teilen.
- **Dock:** oben Größe + Zeitraum, dann „Ansicht" mit den 12 Diagrammen als Zeilen (Icon, Name, Unterzeile) in vier farbigen
  Gruppen, unten Auflösung + Referenz. Reihenfolge so gewählt, dass die Hauptwahl (Größe) ohne Scrollen sichtbar bleibt.
- **Bühne:** `ChangeCenter` hat die Prop `stage` (Desktop/Tablet). Streifen ohne Beschriftung füllen die Bühne (`Stripes`:
  neue optionale Props `stretch`, `onHover`); Glas-Pille oben links (Diagramm · Ort · Zeitraum), Werkzeuge oben rechts,
  Ablese-Pille unten (Jahr, Wert, Abweichung zum Mittel des gezeigten Zeitraums), Jahresachse darunter. Andere Diagramme in
  derselben Bühne in natürlicher Höhe. Zeit-Deck: Zeitraum-Schieber + Legende. Pillentitel für alle 12 Diagramme (`chartTitle`).
- **Readout:** Karten mit Akzentkante, Werte 18 px. Kenntage-Satz rechnet jetzt das Mittel aus („im Mittel 45 je Jahr")
  statt der festen Behauptung „deutlich über dem langjährigen Mittel".
- **Modus-Wahl:** Kopf „‹Ort› · ‹n› Jahre Wetter" mit Zeitraum/Tage/Station; Kachel „Veränderung" zeigt die echten
  Klimastreifen des Orts (Jahresmittel) statt der festen Grafik.
- **Einstieg:** Karte; zeigt „Zuletzt angesehen" aus `getRecents()` — die Liste wurde seit jeher gespeichert, aber nirgends angezeigt.
- **Mobil:** eigener Baum unverändert bis auf das Logo-SVG; gemeinsame Bausteine (`ChangeCenter` ohne `stage`) liefern dieselbe
  Ausgabe wie vorher, die Satz-Karte bleibt per `.hd-m-root .hd-summary` erhalten.
- **Embed** (`?embed=1`) unverändert (Screenshot geprüft).

## §4 Gate

Belege (Screenshots, headless-shell über CDP, Dev-Server :5231, Ort Berlin): Ordner
`C:\Users\User\AppData\Local\Temp\claude\C--dev-buscosun-web\340e37d3-b348-499d-b069-9b02ccd8ecf7\scratchpad\shots\`
— `b-*` vorher, `a-*` nachher (onboard, modus, change, change-hover, anomaly, kenntage, calendar, records, explore,
tablet 1024×768, m-change 390×844, dark), `f-*` Funktionsprüfung (howto, embed).

Funktionsprüfung per Klickpfad (Skript `func.json`): Rail 13 Knöpfe sichtbar · Klick auf Streifen → Tagesband des Jahres
(`?diagramm=tagesband&jahr=2002`) · „Wie lese ich das?" öffnet nach links innerhalb der Bühne · Tabelle (39 Zeilen) ·
Profi-Panel öffnet · Ortsfeld → Einstieg, URL geräumt · Rückblick ↔ Veränderung direkt, Drill da · Größe Tmax + 30 J →
Pille „Klimastreifen · Temperatur max · Berlin · 1982–2011", URL `?groesse=tmax&zeitraum=30j` · Embed unverändert.

| Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` | grün |
| `npm run build` | grün (Shell-Verifier 260/260) |
| `npm run budget` | **rot, nicht durch HB:** eagerJs 110,1 > 110 KB (Historie ist Lazy-Chunk, `router.tsx:131`), totalJs 1 888,8 > 1 825 KB. HB-Anteil gemessen (esbuild + gzip je Datei gegen HEAD): HistoryPage +1,9 KB, Stripes +0,3 KB ⇒ ohne HB rechnerisch ≈ 1 886,6 KB, also schon vorher über der Grenze. Grenze NICHT angehoben. |
| `verify:share` | 527/528; rot ist SH6 (Edge-Bündel ≠ Quelle) — das Bündel enthält keine der geänderten Dateien (esbuild-Metafile geprüft), also fremd |
| Konsole | keine Fehler/Warnungen in allen Läufen der Historie |

Fünf Fragen:
1. **Funktionserhalt:** jede Funktion aus §2 einzeln geklickt bzw. im Screenshot belegt (s. o.); „Modus wechseln" lebt als ‹-Knopf weiter.
2. **Desktop pixelgleich:** entfällt — der Auftrag ist die Desktop-Neugestaltung. Embed und Mobil-Baum sind unverändert (bis Logo/Rekord-Akzentkante).
3. **Touch-Targets:** Diagramm-Zeilen ≥ 44 px; mobile Zuletzt-Knöpfe 44 px; übrige Mobil-Ziele unverändert.
4. **Konsole sauber:** ja (s. o.).
5. **Long Tasks > 200 ms:** nicht gemessen (headless-shell liefert keine `longtask`-Einträge, CLAUDE.md). Hover setzt nur
   einen State in `ChangeCenter`; die Diagramm-Daten sind `useMemo`.

**Offen (Jan):** Sichtprüfung im eigenen Chrome (Hover auf den Streifen, Dunkelmodus), Real-Device mobil nicht nötig
(Mobil-Baum unverändert), Commit. Budget-Überschreitung ist eine eigene Baustelle (V-HB-1).

## §5 Befunde

- **V-HB-1 Budget schon vor HB rot.** Mehrwert: die Ratsche schützt wieder, statt bei jeder Phase rot zu sein. Skizze: die
  Commits seit `a3697853` (Grenzen-Straffung) einzeln bauen und die Zunahme von eagerJs/totalJs zuordnen, dann bewusst
  anheben (mit Notiz) oder abbauen.
- **V-HB-2 Explore-Startdatum hinter dem Archivende.** Berlin endet 2011, der Rückblick startet mit `2025-7-14` und klemmt
  erst in der Anzeige. Mehrwert: kein „leerer" erster Blick bei Stationen, die geschlossen wurden. Skizze: beim Laden
  `exploreYear` auf `available.max` klemmen.
- **V-HB-3 „Sonnigster Monat 0 h" / Sonne „–"** bei Stationen ohne Sonnenmessung (Rekorde). Mehrwert: kein falscher Rekord.
  Skizze: Rekordkarte ausblenden, wenn alle Sonnenwerte fehlen oder 0 sind.

## 6. Nachtrag HB-2 — Modus-Wahl kleiner (22.10.)

**Anlass (Jan):** „diese seite gefällt mir überhaupt nicht kannst du die kacheln kleiner und moderner anzeigen?" — gemeint ist die Modus-Wahl (Rückblick | Veränderung) nach der Ortswahl.

**Diagnose:** Die zwei Kacheln liefen über die volle Breite (je ≈ 640 px), jede mit 168 px hohem Grafik-Kopf (Kalender-Zeichnung bzw. Streifen), Versal-Eyebrows, Schlagwort-Chips, die die Beschreibung wiederholten, und einem eigenen „Zeitpunkt wählen"-Block mit großem Tag-Knopf. Höhe je Kachel ≈ 456 px.

**Umsetzung (nur Desktop/Tablet, `ModeTiles` + `.hd-tile*`; Mobil hat eigene `hd-m-tile`):**
- Spalte `.hd-modepage` max. 1000 px, mittig; Kopf 30 px statt 34 px.
- Kacheln weiß, ohne Grafik-Kopf: Icon-Chip + Modusname (Satzschreibung), Titel 20 px, ein Satz Beschreibung. Höhe jetzt 269 px (gemessen), Breite 492 px bei 1440.
- Rückblick: „Heißester Tag seit Messbeginn" bleibt als Zeile; Tag/Monat/Jahr als eine Knopfreihe (je 44 px hoch, Tag hervorgehoben).
- Veränderung: echte Klimastreifen des Orts als 40-px-Band, darunter Trend (+x °C, Zeitraum, „jedes Jahr ein Streifen") und „Öffnen"; „Empfohlen" als kleines Schild im Kopf.
- Entfallen nur Schmuck: Kalender-Zeichnung, Schlagwort-Chips (stehen wörtlich in der Beschreibung), Versal-Eyebrow. Keine Funktion entfällt.

**Belege:** Screenshots `t-modus.png` (1440), `t-tablet.png` (1024), `t-dark.png`, `t-month.png` im Scratchpad-Ordner `shots\`. Klickwege: „Ganzer Monat" → `?modus=zeitpunkt&zeitpunkt=monat:…` mit Monatsansicht; Veränderungs-Kachel → Dock. Konsole ohne Fehler. `typecheck` grün, `build` 260/260, `budget` unverändert rot wie in §4 (totalJs 1 888,7 KB statt 1 888,8 KB).
