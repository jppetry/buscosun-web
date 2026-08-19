# audit/waldbrand-ui.md — Diagnose Phase WBU1: Waldbrand-Deck in Wetterkarten-Optik

> Stand: 2026-08-14 · Phase WBU1 (Gate GWBU1) · reine Darstellungsphase (Z2-Präzedenz)
> Kickoff: `prompt-waldbrand-ui.md` (Mission in dieser Session) · Kein Code vor dieser Diagnose.

## 0. Lesebestätigung (Pflicht, in dieser Reihenfolge gelesen)

1. ✅ `CLAUDE.md` — harte Regeln, insbesondere D-27 (Command-Deck), Diagnose-First, Funktionserhalt, Breakpoints 767/1439.
2. ✅ `mobile-design-guidelines.md` — Bottom-Sheet-Pattern, Touch-Targets ≥ 44 px, Safe-Area, keine Long Tasks > 200 ms.
3. ✅ `src/fire/FirePage.tsx` + `src/fire/fireDeck.css` — der Ist-Zustand (WB1–WB5, `--fd-*`-Namensraum).
4. ✅ `src/MapView.tsx` — NUR die UI-Abschnitte per Symbol-Grep: `layerRowDeck` (Z. 4470–4504), Zeit-Deck (`timeDeck`, Z. 4624–4682), `DECK_GROUPS` (Z. 5551–5624), Dock-Markup (Z. 5224–5243), Readout-`layerReadout` (Z. 5090–5124).
5. ✅ `src/map/mapDeck.css` — die `.mdk-`-Optik komplett (Dock, Switch, Timedeck, Readout-Karten, Sheet, Tablet-/Mobile-Queries).
6. ✅ `src/components/LayerInfoPanel.tsx` + zugehöriges CSS (`.layer-info*` in `src/MapView.css:203-303`).
7. ✅ `src/components/LayerIcon.tsx` — 14×14 viewBox, strokeWidth 1.4, rounded caps, currentColor.
8. ✅ `src/designTokens.css` — Sand/Ink/Stone/Sage/Terracotta/Steel/Violet/Amber/Slate-Token, Shadows.
9. ✅ `checklist.md` §Phase WB — GWB-A/0/1/2/3/5 grün, **GWB4 teilblockiert (bleibt unangetastet)**.

## 1. Ausgangslage (Screenshots)

| Ansicht | Datei |
|---|---|
| Wetterkarte Desktop 1440×900 (Referenz-Optik) | `audit/waldbrand-ui/ref-map-desktop-1440.png` |
| Waldbrand Desktop 1440×900 (Ist) | `audit/waldbrand-ui/before-fire-desktop-1440.png` |
| Wetterkarte Mobil 390×844 (Referenz) | `audit/waldbrand-ui/ref-map-mobile-390.png` |
| Waldbrand Mobil 390×844 (Ist) | `audit/waldbrand-ui/before-fire-mobile-390.png` |
| Netz-Basislinie Waldbrand (Datenpfad, dedupliziert) | `audit/waldbrand-ui/before-fire-requests.json` |

Sichtbare Kernabweichungen von der Wetterkarten-Optik:

- **Rail:** Waldbrand hat eine helle Sand-Rail; die Wetterkarte eine **Ink-dunkle** Rail (`.mdk-rail`, #2C2A26, aktives Icon amber auf #3A3833, Terracotta-Indikator links).
- **Layer-Zeilen:** Waldbrand nutzt Punkt-Radiobuttons (`.fire-layer-dot`) mit „i"-Knopf und Inline-Steckbrief; die Wetterkarte weiße Karten-Zeilen mit **SVG-Icon + Label (+ Sub) + Switch-Knubbel**, `role="switch"`, Akzentfarbe je Gruppe (`data-accent`), Gruppen-Überschriften in Versal-Akzentfarbe.
- **Erklärtexte:** Waldbrand klappt `.fire-layer-note` unter der Zeile aus; die Wetterkarte zeigt die Erklärung **rechts** in der Readout-Spalte als Karte (`.mdk-ro-lcard` → `.layer-info`: Eyebrow → leichter Titel → Beschreibung → Legende → Quelle, Akzentbalken links, „Vorschau"-Chip bei Hover auf inaktiver Zeile).
- **Zeitregler:** Waldbrand hat ihn **rechts oben im Readout** als nackten `input[type=range]`; die Wetterkarte **unten mittig über der Karte** als Glass-Deck (`.mdk-timedeck mdk-glass`): Terracotta-Play-Kachel 44×44, Ticks-Zeile (JETZT + Viertelmarken), gefüllte Range-Spur (`--tl-fill`), „Stand"-Text rechts.
- **Topbar:** Waldbrand 12 px-Padding, kleiner Logo-Mark-Kasten; Wetterkarte 64 px hohe Cream-Topbar mit klaren Segmenten. Der Basiskarten-Umschalter entspricht funktional dem Länder-Segment (`.mdk-countries`: weißes Feld, aktive Taste Ink auf Cream).
- **Mobil:** Waldbrand stapelt Rail-oben + Sheet (BottomSheet-Default-Optik); die Wetterkarte fährt Vollkarte mit schwebenden Decks und Sheet in `.mdk-sheet`-Optik (22 px-Radius, Grab-Bar, Cream). Zeitleiste bleibt bei Waldbrand ÜBER dem Sheet sichtbar (bestehendes Verhalten, bleibt).

## 2. Element-Mapping (jedes `fire-*`-Element → Ziel-Optik)

| Ist (`fire-*`) | Ziel-Optik (Muster) | Umsetzung in `fireDeck.css` (Kopie, KEIN Import) |
|---|---|---|
| `.fire-rail`, `.fire-rail-btn` | `.mdk-rail`, `.mdk-rail-btn` (Ink-dunkel, aktiv #3A3833 + amber Icon + Terracotta-Balken) | gleiche Werte, `.fire-`-Präfix; aktives Icon in Ember-Ton statt `#E0A870`? → **nein**, exakt Wetterkarten-Werte (gleiche Optik ist das Gate) |
| `.fire-topbar`, `.fire-logo*`, `.fire-eyebrow`, `.fire-title` | `.mdk-topbar` (64 px, cream-50, Border sand-200), `.mdk-brand*`, `.mdk-eyebrow` | Höhe/Font-Größen/Abstände übernehmen |
| `.fire-basemap` | `.mdk-countries`-Segment (weiß, Radius 12, aktiv Ink-Fläche/Cream-Text) | 1:1 kopiert |
| `.fire-preset` | `.mlo-chip`-Optik (Pillen-Chips, aktiv Terracotta) — das Chip-Muster der Kartenseite | 1:1 kopiert |
| `.fire-dock` | `.mdk-dock` (240 px, cream-50, `mdk-dock-head` mit Eyebrow + Count-Chip) | Breite 240/206 px (≥1440/<1440), Count-Chip „n aktiv" |
| `.fire-layer-toggle` + `.fire-layer-dot` | `layerRowDeck`: `.mdk-layer` (weiße Karte, Radius 10, Icon + Label + Sub + `.mdk-switch`), `role="switch"`, `aria-checked`, `data-accent` je Gruppe | neue `.fire-layer`-Zeile; Sub-Zeile trägt Kurzquelle **und** Status-Stempel (Auftrag §1) |
| `.fire-layer-info` („i") + `.fire-layer-note` | Desktop: **entfällt als Ausklapp-Mechanik** — Erklärung steht rechts als Readout-Karte; Hover/Fokus auf inaktiver Zeile = „Vorschau"-Karte (Wetterkarten-Verhalten). Mobil: „i" bleibt (kein Hover) und öffnet die **gleiche Steckbrief-Karte** inline im Sheet | `.fire-ro-lcard` + `.fire-info*` (Kopie der `.layer-info`-Optik) |
| `.fire-layer-status` / `.is-error` / `.fire-layer-lag` | Stempel-Text in der Sub-Zeile (`mdk-layer-sub`-Optik, „⚠ Fehler"-Muster von `statusStamp`); der ausführliche Fehler-/Lag-Text bleibt als Zeile unter der Karte (Ehrlichkeit, gate-blockierend) | Schrift/Farben der `.mdk-`-Stempel, Fehlerfläche bleibt (Terracotta-Ton statt Alt-Rot #A32B1E → **bleibt #A32B1E**, denn er markiert Ausfall, nicht Design) |
| `.fire-dock-later*`, `.fire-later*` („Ausbaustufe 2") | **kein Wetterkarten-Gegenstück** → erbt die Optik als weitere Dock-Gruppe: `mdk-group-head` „AUSBAUSTUFE 2" (slate-Akzent) + `.mdk-layer`-Zeilen; blockierte Quellen: gestrichelter Rahmen + gedämpft, Switch bleibt sichtbar aber `disabled` (sichtbar-nicht-schaltbar, WB4-Ehrlichkeit) | s. §3.1 |
| `.fire-time*` (Regler, Play, Label, `lädt …`) | `.mdk-timedeck mdk-glass` unten mittig über der Karte: `.mdk-td-play` (Terracotta), `.mdk-td-ticks` (Heute-Taste + Tagesmarken), Range mit `--tl-fill`, Label + „· lädt …" als Pending in der Stand-Position | `.fire-timedeck` |
| `.fire-time-none` | Zeit-Deck-Fläche mit Hinweistext (gleiches Glass-Panel, kein Regler) | |
| `.fire-window` (24 h / 7 Tage) | `.mdk-subseg`-Untersegment **im Dock unter der Hotspot-Zeile** (Muster satSeg/snowSeg/hailSeg: erscheint nur bei aktivem Layer) | `.fire-subseg` |
| `.fire-readout` | `.mdk-readout` (348/300 px, cream, Border links) mit `mdk-ro-section-head` „Aktive Layer" + Count | `.fire-readout` behält Namen, neue Innen-Optik |
| `.fire-scales`, `.fire-scale*` | **kein Gegenstück** → erbt `.mdk-ro-lcard`-Kartenoptik (weiße Karte, Radius 14, Akzentbalken) unter eigenem Section-Head „Skalen"; Zeilen wie `.layer-info .li-row` | `.fire-scale` |
| `.fire-at-gap` | **kein Gegenstück** → `.mdk-ro-note`-Optik (gestrichelte Karte) — bleibt OHNE Steckbrief-Öffnen sichtbar in der Readout-Spalte (Auftrag: AT-Lücke sichtbar) | |
| `.fire-season`, `.fire-lag-hint` | `.mdk-ro-note`-Typo bzw. Terracotta-Hinweiszeile (wie `.mdk-src-warn`-Ton) | |
| `.fire-scaffold-note` | `.mdk-status-chip mdk-glass`-Optik (oben links auf der Bühne) | |
| `.fire-center` | `.mdk-stage` (#0B0E12, Attribution-Chip-Optik dunkel, eigener Zoom bleibt MapLibre-Zoom → nur umgefärbt wie `.mdk-zoom`-Glass) | Attribution wie `.mdk-stage .maplibregl-ctrl-attrib` |
| Mobil: BottomSheet-Inhalt | `.mdk-sheet`-Optik (Cream, Radius 22 oben, Grab-Bar 44×5, Titel 19 px fett) via scoped Overrides `.fire-root .bs-root` (BottomSheet.css bleibt unangetastet — geteilt) | |
| Mobil: `.fire-mobile-time` | `.mdk-m-timesolo`-Muster: Zeit-Deck schwebt über dem Sheet, volle Optik | bleibt über dem eingeklappten Sheet |

## 3. Elemente OHNE Wetterkarten-Gegenstück — Optik-Vererbung

1. **„Ausbaustufe 2"** (5 Einträge, 2 blockiert): wird eine reguläre Dock-Gruppe in `DECK_GROUPS`-Optik (Group-Head + Layer-Zeilen mit Icon/Switch). Blockierte Zeilen: `disabled`, gestrichelter Rahmen, Opacity .6, Sub-Zeile „Quelle derzeit nicht abrufbar"; ihr Steckbrief (WARUM: CORS-Defekt des EDO-Dienstes) bleibt über Hover/Fokus (Desktop) bzw. „i" (mobil) erreichbar — Karten dürfen als „Vorschau" erscheinen, obwohl der Layer nie aktiv sein kann.
2. **AT-Lücken-Kasten**: bleibt permanent in der Readout-Spalte (nicht in einem Steckbrief versteckt), Optik `.mdk-ro-note`.
3. **Skalen-Trio (DE/CH/EU)**: drei Karten in Readout-Karten-Optik, weiterhin NEBENEINANDER-stehend, nie umgerechnet; der Satz „Farbwerte sind unsere Wahl, nicht amtlich" bleibt in jeder Karte.
4. **Datenalter/Fehler je Layer**: Stempel in der Zeile (wie `statusStamp` der Wetterkarte) + bestehender Fehlerblock mit amtlichem Link unter der Zeile — Wortlaut unverändert.
5. **Interpolations-/Treiber-Hinweis** (`fire-scaffold-note`): bleibt auf der Bühne, Glass-Chip-Optik.

## 4. LayerInfoPanel — Entscheidungsregel angewandt: **Kopie nach `src/fire/`**

Der bevorzugte Weg (additive `info`-Prop) scheidet aus, und zwar strukturell, nicht aus Bequemlichkeit:

- Die `.layer-info`-Klassen sind in **`src/MapView.css`** gestylt. Der Waldbrand-Chunk lädt `MapView.css` nicht; das Panel wäre dort unstyled. Die Stile nach `fireDeck.css` zu kopieren, aber die Original-Klassennamen zu verwenden, würde **global** in die Wetterkarte zurückleaken, sobald beide Chunks geladen sind (SPA-Navigation Waldbrand → Wetterkarte) — genau die Pixel-Parität, die das Gate schützt, wäre nicht mehr beweisbar.
- `LayerInfoPanel` ist auf `LayerKey` typisiert; eine Generalisierung wäre ein Eingriff in eine von der Wetterkarte genutzte Datei (STOPP-Zone dieser Phase: `MapView.tsx` nicht anfassen, und die Komponente hängt an ihr).

Deshalb: **`src/fire/FireLayerCard.tsx` als Kopie des Panel-Musters** mit `.fire-info-*`-Klassen (Werte 1:1 aus `MapView.css:204-302` + `mapDeck.css:442-486`), Profile aus einer fire-eigenen Tabelle. Wetterkarte bleibt byte-identisch unberührt. (So verlangt es der Kickoff ausdrücklich als Fallback: „copy the component into `src/fire/` and say so in the audit".)

## 5. Präsentations-Metadaten in `fireModel.ts` (erlaubt, verhaltensneutral)

Neu (reine Daten, headless-verifizierbar): `FIRE_DECK_GROUPS` — Gruppen mit Titel, Akzent-Token und je Layer `{ id, accent?, icon }`:

- **Gefahrenlage** (terracotta): `fireDanger` (amber) · `fireIndexNational` (terracotta)
- **Aktuelle Lage** (steel): `fireHotspots` (terracotta) · `fireWeather` (steel) · `fireBans` (slate)
- **Ausbaustufe 2** (slate): `fireDrought` (slate) · `fireVegetation` (sage) · `fireFuel` (sage) · `fireBurnt` (terracotta) · `fireContext` (sage)

Akzent-Token sind die vorhandenen Design-Token-Familien (D-27, keine neuen Farben). `FIRE_MVP_LAYERS`/`FIRE_EXTENDED_LAYERS`/Presets/Z-Bänder bleiben unverändert; `verify:fire-model` bleibt gültig (nur Additionen).

Neu: `src/fire/fireIcons.tsx` — Icon je `FireLayerId` im `LayerIcon`-Zeichenstil (14×14, strokeWidth 1.4, currentColor, rounded); der `switch` in `LayerIcon.tsx` wird NICHT erweitert.

## 6. Harte Grenzen dieser Phase (Kontrolle)

- **Null neue Requests:** kein neuer Fetch, keine neue Quelle; Datenpfad (`src/fire/sources/*`, `fireTime.ts`, `firePlayback.ts`, `FireMap.tsx`-Datenlogik) unangetastet. Beweis: Request-Set-Vergleich vor/nach (dedupliziert, TIME-Datum normalisiert) — Basislinie liegt vor. Neue **Vite-Modul**-Requests im Dev (fireIcons.tsx, FireLayerCard.tsx) sind Präsentations-Code im selben Lazy-Chunk, kein Datenbyte.
- **Kein `mapDeck.css`-Import, keine `.mdk-`-Klasse im Fire-Markup**; alles unter `.fire-`-Präfix bzw. `.fire-root`-Scope (auch die `data-accent`-Auflösung: `.fire-root [data-accent=…] { --fd-accent: … }`).
- **Nicht anfassen:** `MapView.tsx`, `mapDeck.css`, `MapView.css`, `designTokens.css`-Werte, `BottomSheet.css`, `featureRail.tsx`, Edge Functions, Warm-Crons, GWB4.
- **Desktop-Wetterkarte pixelgleich:** strukturell garantiert (keine geteilte Datei geändert), zusätzlich per Screenshot-Diff belegt (animierte Kartenbühne wird beim Diff ausgenommen und als solche dokumentiert).
- Touch-Targets ≥ 44 px mobil, Breakpoints nur 767/1439, Safe-Area via `env()`.

## 7. Reihenfolge der Umsetzung

1. `fireModel.ts`: `FIRE_DECK_GROUPS` + Akzent-Typ (additiv).
2. `src/fire/fireIcons.tsx` (10 Icons).
3. `src/fire/FireLayerCard.tsx` (Steckbrief-Karte, `.fire-info-*`).
4. `FirePage.tsx`: Dock-/Readout-/Zeit-Deck-Markup neu verteilen (Toggles links, Steckbriefe rechts, Zeit unten mittig; mobil Sheet + schwebendes Zeit-Deck). Alle Texte wortgleich.
5. `fireDeck.css`: komplette Optik-Kopie in `.fire-`-Klassen.
6. Verifikation nach `tests.md` §V-WALDBRAND-UI.

## 8. Ergebnis (nach der Umsetzung, gleiche Session)

Alle Elemente aus §2/§3 sind umgesetzt; die Verifikation steht vollständig in `tests.md`
§V-WALDBRAND-UI. Kurzbilanz mit Belegen (alle unter `audit/waldbrand-ui/`):

| Nachweis | Ergebnis | Beleg |
|---|---|---|
| Optik Desktop 1440×900 | Dock/Readout/Zeit-Deck/Topbar/Rail in Wetterkarten-Optik | `after-fire-desktop-1440.png`, `after-fire-desktop-funktionen.png` |
| Hover-Vorschau (Wetterkarten-Muster) | dashed Karte + „Vorschau"-Chip | `after-fire-desktop-preview.png` |
| Mobil 390×844 | Vollkarte, Zeit-Deck über Sheet, Sheet-Optik, „i"-Steckbriefe | `after-fire-mobile-390.png`, `after-fire-mobile-sheet-half.png`, `after-fire-mobile-steckbrief.png` |
| Tablet-Stichprobe | 206/300-px-Spalten, 16-px-Zeit-Deck-Ränder | `after-fire-tablet-1024.png` |
| Null neue Requests | 73 = 73, Differenzmengen leer | `zero-request-proof.json` |
| Wetterkarte pixelgleich | 0 Diff-Pixel, maxChannelDelta 0 (Rail/Dock/Readout/Topbar ohne Uhr) | `map-pixel-parity.json`, `after-map-desktop-1440.png` |
| Headless/Budget | fire-Verifier 66+67+118 · typecheck · budget (eager unverändert) | Terminal-Log, `tests.md` |
| Performance | Prod-Build: 0 Long Tasks beim Scrubben (Dev-Overhead-Befund → V-217) | `tests.md` §V-WALDBRAND-UI Schritt 7 |

Zwei kleine Abweichungen von §2, beide begründet: (1) Der MapLibre-Zoom bleibt **unten rechts**
(er teilt den Container mit der Attributionszeile; ein CSS-Umzug nach oben riss die Attribution
mit — Container wird stattdessen über das Zeit-Deck gehoben, Glass-Optik wie `.mdk-zoom`).
(2) Die Fehlerfläche behält ihre Rottöne `#A32B1E`/`#F7E7E2` statt einer Terracotta-Angleichung —
sie markiert einen Ausfall, keine Gestaltung (D-04). Offen: V-215 (Fehler-Zustand live sichten).
