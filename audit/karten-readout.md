# audit/karten-readout.md — Wetterkarte: Layer-Beschreibungen in die Readout-Spalte

> Stand: 2026-08-01 · Phase **KD-R „Karten-Readout"** · Gate **G-KDR**
> Auftrag (Jan): Die Beschreibungen/Erklärungen der Wetter-Layer der 2D-Karte (`src/MapView.tsx`)
> rendern heute **innerhalb der Kartenfläche** als Overlays. Sie sollen in eine saubere Spalte am
> **rechten Rand außerhalb der Karte** wandern (Command-Deck-„Readout"-Muster, D-27).
> Diagnose-First nach `CLAUDE.md`. Belege: Datei:Zeile + Screenshots unter
> `audit/screenshots/karten-readout/`.

---

## §1 Diagnose — Ist-Stand am Code

### §1.1 Layout der Kartenseite (Command-Deck)

`src/MapView.tsx:3443–3814` rendert die Desktop-/Tablet-Ansicht als Flex-Zeile
(`.mdk-body`, `src/map/mapDeck.css:125`):

| Region | Klasse | Breite | Quelle |
|---|---|---|---|
| Icon-Rail | `.mdk-rail` | 58 px | `mapDeck.css:127` · `MapView.tsx:3484` |
| Layer-Dock | `.mdk-dock` | 240 px (≥1440) / 206 px (768–1439) | `mapDeck.css:148`, `:633` · `MapView.tsx:3508` |
| Karten-Bühne | `.mdk-stage` | `flex: 1` | `mapDeck.css:201` · `MapView.tsx:3527` |
| **Readout-Spalte** | `.mdk-readout` | **324 px (≥1440) / 300 px (768–1439)** | `mapDeck.css:375`, `:634` · `MapView.tsx:3606` |

Die Readout-Spalte **existiert also bereits** und liegt genau dort, wo Jan die Beschreibungen haben
will: am rechten Viewport-Rand, außerhalb der Kartenfläche. Sie enthält heute Punktforecast +
7-Tage-Forecast (`MapView.tsx:3607–3634`) und ist **im Übersichts-Modus (`overview`) komplett leer**
— das ist genau der Einstieg „01 · WETTERKARTE" von der Startseite (`App.tsx:121`).
Beleg: `before-desktop-1440-default.png` (rechte Spalte leer, Beschreibungen fehlen dort).

Ein **fünfte Spalte** wurde geprüft und **verworfen**: bei 1440 px blieben der Bühne statt 818 px nur
noch ~518 px (−37 %), bei 1280 px sogar nur ~398 px. Das wäre eine Desktop-Regression an der
Kernfunktion (Karte) — verboten nach `CLAUDE.md` §Harte Regeln. Die Beschreibungen ziehen deshalb in
die **bestehende** Readout-Spalte (= das Command-Deck-Readout-Muster Dock | Center | Readout, exakt
wie in event/route/atmosphere).

### §1.2 Inventar: Was rendert heute Beschreibungen IN der Karte?

**(A) `legendsBlock` — Erklärkarten im Stage-Overlay.**
`MapView.tsx:3289–3411`, gerendert bei `MapView.tsx:3553` **innerhalb** von `<main class="mdk-stage">`.
CSS: `.mdk-legends { position:absolute; right:16px; top:100px; width:236px; max-height:calc(100% - 220px); overflow-y:auto }`
(`mapDeck.css:259–272`). Jede Karte ist ein `.confidence-legend` mit
`.cl-title` + Mini-Skala (`.cl-scale`/`.cl-ends`/`.sl-swatch`/`.pop-scale`) + **`.cl-note`** —
der `.cl-note` ist der eigentliche Erklär-/Ehrlichkeitstext.

Belegte Fehlwirkung im Ist-Zustand (`before-desktop-1440-legends.png`): drei aktive Layer erzeugen
einen Stapel, der die Karte verdeckt, in sich scrollt (Scrollbar sichtbar) und dessen dritte Karte
**abgeschnitten** ist — während 324 px Readout-Spalte daneben leer stehen.

Abdeckung — genau **8 der 16** LayerKeys erzeugen so eine Karte:

| LayerKey | Zeile | dynamischer Titel-Zusatz |
|---|---|---|
| `snow` | 3293–3313 | `· Schneedecke` / `· Neuschnee` (aus `snowMode`) |
| `lightningfc` | 3314–3332 | — |
| `thunder` | 3333–3351 | — |
| `rotation` | 3352–3372 | `· Experten-Layer` |
| `confidence` | 3373–3388 | `Sicherheit · Regen` / `· Temperatur` (aus `active.has('nowcast')`), Notiztext ebenfalls variabel |
| `snowline` | 3389–3395 | — |
| `flownowcast` | 3396–3401 | — |
| `poprob` | 3402–3409 | — |

**(B) `LayerInfoPanel` — Hover-Panel über der Karte.**
`src/components/LayerInfoPanel.tsx:148–161`, gerendert bei `MapView.tsx:3810–3812`.
CSS `.layer-info { position: fixed; z-index: 15; width: 300px }` (`MapView.css:204–215`).
Positioniert wird per `showLayerInfo()` (`MapView.tsx:431–434`) auf `rect.right + 12` der Dock-Zeile
— das Panel schwebt damit **über der Karten-Bühne**. Messbeleg: Hover „Temperatur" →
`getBoundingClientRect() = {x: 297, width: 300}`, die Bühne beginnt bei x≈298
(`before-desktop-1440-hoverinfo.png`).

Datenquelle: `LAYER_INFO` (`LayerInfoPanel.tsx:45–146`) — deckt **alle 16 LayerKeys** ab, jeweils mit
`eyebrow · title · desc · legend · source` und optional `trust`.

**(C) Mobile.** Bei ≤767 px (bzw. kurzem Landscape) ist `.layer-info` per CSS ausgeblendet
(`MapView.css:303`) und wird ohnehin nicht gerendert (`!isMobileMap`-Guard, `MapView.tsx:3810`).
`.mdk-legends` dagegen rendert mobil weiter im Stage, rechts über dem Sheet
(`mapDeck.css:694–698`), Beleg `before-mobile-390-legends.png`. **Mobile ist tabu in dieser Phase.**

### §1.3 Die 16 LayerKeys — wer erzeugt was, wer ist überhaupt schaltbar?

`LayerKey` (`MapView.tsx:297`) hat 16 Werte. Das Dock (`DECK_GROUPS`, `MapView.tsx:3822–3877`)
zeigt davon **11**; 5 sind auf Jans Vorgabe (2026-07-23 / 2026-07-24) auskommentiert, ihre Funktion
bleibt erhalten und sie sind über den `#m=`-Permalink (`src/mapState.ts:24`, Bitmaske) aktivierbar.

| # | LayerKey | im Dock? | Beschreibung heute | dyn. Zusatz |
|---|---|---|---|---|
| 1 | `nowcast` | ja (Niederschlag) | nur Hover (A: nein) | — |
| 2 | `thunder` | ja | Hover **+** Stage-Karte | — |
| 3 | `rotation` | ja | Hover **+** Stage-Karte | `· Experten-Layer` |
| 4 | `snow` | ja | Hover **+** Stage-Karte | Modus |
| 5 | `wind` | ja (Wind & Böen) | nur Hover | — |
| 6 | `gust` | ja | nur Hover | — |
| 7 | `temp` | ja (Temperatur & Himmel) | nur Hover | — |
| 8 | `sat` | ja | nur Hover | — |
| 9 | `lightning` | ja (Punkte & Vertrauen) | nur Hover | — |
| 10 | `lightningfc` | ja | Hover **+** Stage-Karte | — |
| 11 | `stations` | ja | nur Hover | — |
| 12 | `clouds` | nein (auskommentiert 3861) | nur Hover | — |
| 13 | `confidence` | nein (3874) | Hover **+** Stage-Karte | Regen/Temperatur |
| 14 | `snowline` | nein (3846) | Hover **+** Stage-Karte | — |
| 15 | `flownowcast` | nein (3844) | Hover **+** Stage-Karte | — |
| 16 | `poprob` | nein (3845) | Hover **+** Stage-Karte | — |

Verifikationszugang für die 5 nicht-gedockten Layer: `#m=`-Permalink mit Bitmaske
`clouds(8)+confidence(128)+snowline(256)+flownowcast(512)+poprob(1024) = 1928`
(`mapState.ts:24`, `LAYER_ORDER`).

### §1.4 Split-Entscheidung: was zieht um, was bleibt (mit Begründung)

**ZIEHT UM (= „Beschreibung"):**

1. **`legendsBlock` (A)** — Titel + Mini-Skala + `.cl-note`. Der Kern ist der Erklär-/
   Ehrlichkeitstext („Potenzial ≠ Auslösung", „kein Warnersatz", „am Modellrand ohne Wert").
   Er erfüllt bereits heute Jans Anforderungen 1 + 2 (erscheint nur bei aktivem Layer, stapelt sich)
   — nur am falschen Ort.
2. **`LayerInfoPanel` (B)** — von Jan im Auftrag explizit als Beispiel für „Beschreibung" genannt.
   Es ist das einzige Element, das **alle 16** Layer erklärt, und liefert damit die Grundlage für
   Anforderung „jeder aktive Layer bekommt eine Karte".

**BLEIBT IN DER KARTE (kein Beschreibungselement):**

| Element | Ort | Warum es bleibt |
|---|---|---|
| Farbrampen-Legende `.mdk-td-legend` | `MapView.tsx:3278–3285` (im Time-Deck) | Kartenweite Ableselegende (Temp/Regen/Wind/Stationen/Radargrenze), kein Layer-Text — von Jan explizit ausgenommen |
| Zeit-Deck / Slider `.mdk-timedeck` | `MapView.tsx:3229–3287` | Steuerelement |
| Quellen-Pille `.mdk-source-pill` | `MapView.tsx:3532–3540` | Modell-/Quellenwahl, kein Layer-Text |
| Status-Chip `.mdk-status-chip` | `MapView.tsx:3413–3431` | **Datenlage** je Layer (Modell, Stand, Fehler) — Status, nicht Erklärung; ändert sich sekündlich und gehört zum Kartenzustand |
| Wind-Deck `.mdk-winddeck` | `MapView.tsx:3546–3548` | Steuerelement |
| Zoom `.mdk-zoom`, MapLibre-Attribution/Scale | `MapView.tsx:3541` / `mapDeck.css:207` | Kartensteuerung + Lizenz-Attribution (rechtlich in der Karte zu führen) |
| Punktforecast + 7-Tage | `MapView.tsx:3613–3632` | Von Jan explizit ausgenommen; bleibt an seiner Stelle in der Readout-Spalte |
| Stations-Popups | MapLibre-Popup | Ortsbezogene Messwerte, kein Layer-Text |

**Nicht-ambiges Grenzelement (dokumentiert, kein STOPP-Fall):** die **Mini-Skala innerhalb der
`legendsBlock`-Karten** ist eine Farbrampe. Sie zieht **mit** um, weil sie untrennbarer Bestandteil
der Erklärkarte ist (Skala + Endpunkte + Notiz sind ein Sinnzusammenhang) und weil `LAYER_INFO`
für denselben Layer ohnehin dieselbe Rampe führt. Jans Ausnahme „Farbrampen-Legenden bleiben"
zielt auf die **kartenweite** Ableselegende im Time-Deck (`.mdk-td-legend`) — die bleibt unangetastet.
Damit geht keine in-Karte-Ableseinformation verloren.

### §1.5 Funktionserhalt-Falle: die Vorschau vor dem Aktivieren

Das Hover-Panel (B) erklärt heute auch **inaktive** Layer — man kann vor dem Einschalten lesen, was
ein Layer tut. Würde man es ersatzlos entfernen und Beschreibungen nur noch für aktive Layer zeigen,
verlöre man diese Funktion (Verstoß gegen die Oberste Direktive „Funktionserhalt", `CLAUDE.md`).
Lösung ohne Overlay über der Karte: Der Hover/Fokus auf eine **inaktive** Dock-Zeile blendet deren
Karte **in der Readout-Spalte** an ihrer Ordnungsposition als *Vorschau* ein (gestrichelter Rahmen +
Chip „Vorschau"); Hover auf eine **aktive** Zeile hebt die zugehörige Karte hervor.
Damit gilt weiterhin: **persistent** sichtbar ist eine Beschreibung ausschließlich, solange der Layer
aktiv ist (Anforderung 1) — die Vorschau ist ein rein transienter Interaktionszustand.

---

## §2 Plan — Zielzustand

### §2.1 Spalten-Spezifikation

- **Ort:** neuer Abschnitt `.mdk-ro-layerinfo` als **erstes** Kind von `.mdk-readout`
  (`MapView.tsx:3606`), also rechter Viewport-Rand, außerhalb von `.mdk-stage`.
- **Breite:** erbt die Spaltenbreite — 324 px bei ≥1440 px, 300 px bei 768–1439 px
  (`mapDeck.css:375` / `:634`). Zusätzlich **Desktop-Groß**: `.mdk-readout` wächst bei ≥1440 px von
  324 px auf **348 px**, damit die Erklärkarten in der Zielbreite ruhiger stehen (die Bühne verliert
  24 px von 818 px = 2,9 % — kein Funktionsverlust, per Screenshot belegt).
- **Kopf:** `Aktive Layer` (`.mdk-eyebrow`, League Spartan) + Zähler-Chip `N aktiv` — dieselbe
  Kopfzeilen-Typografie wie `.mdk-ro-section-head`/`.mdk-dock-head`.
- **Reihenfolge:** exakt die Dock-Reihenfolge (`DECK_GROUPS` flach), danach aktive Layer, die nicht im
  Dock stehen (Permalink-Fall), in `LAYER_OPTIONS`-Reihenfolge.
- **Scroll:** Der Abschnitt bekommt `max-height: 46vh; overflow-y: auto`, solange der Punktforecast
  in derselben Spalte steht — so kann kein Layer-Stapel den Punktforecast aus der Spalte drücken.
  Steht der Punktforecast nicht in der Spalte (Übersichts-Modus / `START_NOW_ONLY`), entfällt die
  Kappung (`.is-solo`) und der Stapel nutzt die volle Spaltenhöhe; die Spalte selbst scrollt.
- **Leerzustand:** kein aktiver Layer und keine Vorschau → der **gesamte Abschnitt** (Kopf,
  Trennlinie, Karten) rendert nicht. Die **Spalte selbst** bleibt bestehen, weil sie im
  Nicht-Übersichts-Modus den Punktforecast trägt (Jans Anforderung 3: der darf sich nicht bewegen)
  und weil ihr Ein-/Ausblenden die Bühnenbreite ändern und ein MapLibre-Resize auslösen würde.
  Dokumentierte Präzisierung von „empty state = column hidden entirely" → **Abschnitt** statt Spalte.
- **Mobile (≤767 px / kurzes Landscape):** unverändert. `.mdk-readout` ist dort `display:none`
  (`mapDeck.css:651`), `legendsBlock` rendert weiterhin im Stage.

### §2.2 Karten-Aufbau (`.mdk-ro-lcard`)

```
<article class="mdk-ro-lcard [is-preview|is-hot]" data-accent="…">
  <LayerInfoPanel layer={key} suffix={…} />   ← unverändertes Bestandsmarkup, nur entkoppelt positioniert
  {ext && <div class="mdk-ro-lext">{ext}</div>}  ← der bisherige .cl-note-Text, wortgleich
</article>
```

- `LayerInfoPanel` wird **wiederverwendet**, nicht nachgebaut → Inhaltsgleichheit ist strukturell
  garantiert. Ergänzt wird nur eine optionale Prop `suffix` für die dynamischen Titel-Zusätze
  (Schnee-Modus, Sicherheit Regen/Temperatur, Experten-Layer) — additiv, bestehende Aufrufe
  unverändert.
- Die acht Ehrlichkeitstexte werden in **eine** Quelle gezogen (`layerExtNote(key)` in `MapView.tsx`),
  die **sowohl** der mobile `legendsBlock` **als auch** die Readout-Karte konsumiert. Damit ist
  ausgeschlossen, dass Desktop und Mobile auseinanderlaufen, und der Mobile-Text bleibt wortgleich.

### §2.3 Änderungen an `MapView.tsx` (minimal-invasiv, kein Refactoring)

1. `layerHover`-State: `{key, top, left}` → `LayerKey | null`; `showLayerInfo()` entfällt
   (Positionsberechnung wird gegenstandslos). Handler an der Dock-Zeile bleiben.
2. `legendsBlock`: Notiztexte durch `layerExtNote(key)` ersetzt (identischer Text), sonst unverändert.
3. Renderbedingung `MapView.tsx:3553`: `(!isMobileMap || mobileTab === 'karte')` →
   `isMobileMap && mobileTab === 'karte'` — Stage-Overlay nur noch mobil.
4. `MapView.tsx:3810–3812`: fixiertes `<LayerInfoPanel>` entfällt.
5. Neuer Baustein `layerReadout` + Einbau als erstes Kind von `.mdk-readout`.
6. `LAYER_ACCENT`-Map (Dock-Akzent je Layer) für `data-accent` der Karte — aus `DECK_GROUPS`
   abgeleitet, keine neue Farbdefinition.

**Nicht angefasst:** Shader/`WindLayer`, Fusion-Engine, Layer-z-Order, Fetch-Orchestrierung,
`toggle()`-Logik, Zeit-Deck, Punktforecast, Modell-Switcher, mobiles Sheet/Screen-System,
`embedded`-Pfad (eigener früher Return, `MapView.tsx:3071`).

### §2.4 Preservation-Contract (vor dem Gate einzeln zu prüfen)

| # | Muss erhalten bleiben | Prüfung |
|---|---|---|
| P1 | Alle 16 `LAYER_INFO`-Beschreibungen (eyebrow/title/desc/legend/source/trust) wortgleich erreichbar | Komponente wiederverwendet; MCP-Textvergleich je Layer |
| P2 | Alle 8 Ehrlichkeits-/`cl-note`-Texte wortgleich | gemeinsame Quelle `layerExtNote()`; Textvergleich |
| P3 | Dynamische Titel-Zusätze (Schnee-Modus, Sicherheit Regen/Temp, Experten) | Screenshot je Fall |
| P4 | Vorschau inaktiver Layer per Hover/Fokus | Screenshot |
| P5 | Farbrampen-Legende im Time-Deck | Screenshot-Vergleich |
| P6 | Punktforecast + 7-Tage-Forecast an Ort und Stelle | Screenshot-Vergleich `#m=`-Ansicht |
| P7 | Status-Chip, Quellen-Pille, Zoom, Wind-Deck, Attribution | Screenshot-Vergleich |
| P8 | Mobile 390×844 pixelgleich | Before/After-Screenshots |
| P9 | Karten-Interaktion (Pan/Zoom/Slider/Modell-Switcher/Punktforecast) | manuell per MCP |
| P10 | `toggle()`-Verhalten und Layer-Ladeverhalten unverändert | Konsole + Status-Chip |
| P11 | Tastaturbedienung: Fokus auf Dock-Zeile zeigt weiterhin die Beschreibung | Fokus-Test |
| P12 | `embedded`-Modus (Event-Ergebnisseite) unverändert | Code-Pfad separat, Sichtprüfung |

---

## §3 Umsetzung

Siehe Commits mit Scope `wetterkarte` (Conventional Commits). Dateien:

- `src/components/LayerInfoPanel.tsx` — additive Prop `suffix`.
- `src/MapView.tsx` — §2.3.
- `src/map/mapDeck.css` — neuer `--mdk-*`-Namespace-Block `.mdk-ro-layerinfo` / `.mdk-ro-lcard` /
  `.mdk-ro-lext` inkl. Entkopplung des wiederverwendeten `.layer-info`-Markups
  (`position: static`, volle Spaltenbreite).

---

## §4 Verifikation

Protokoll siehe §5 und `tests.md` → V-KDR. Screenshots: `audit/screenshots/karten-readout/`.

### §4.1 Baseline (vorher)

| Datei | Inhalt |
|---|---|
| `before-desktop-1440-default.png` | 1440×900, nur Wind aktiv — Readout-Spalte leer |
| `before-desktop-1440-legends.png` | 1440×900, Gewitter+Rotation+Schnee — Erklärkarten verdecken die Karte, dritte Karte abgeschnitten |
| `before-desktop-1440-hoverinfo.png` | Hover „Temperatur" — Panel schwebt bei x=297 über der Bühne |
| `before-desktop-1280-legends.png` | 1280×800, dieselben drei Layer |
| `before-mobile-390-karte.png` | 390×844, Ausgangszustand |
| `before-mobile-390-legends.png` | 390×844, Gewitter+Schnee — Stage-Karten (Sollzustand, bleibt so) |

### §4.2 Nachher

| Datei | Inhalt |
|---|---|
| `after-desktop-1440-default.png` | Nur Wind — Karte „Aktive Layer · 1 aktiv" in der vorher leeren Spalte |
| `after-desktop-1440-6layers.png` | Sechs Layer — Stapel in Dock-Reihenfolge, Kartenfläche frei |
| `after-desktop-1440-preview.png` | Fokus auf inaktivem „Böen" — Vorschau-Karte an Ordnungsposition |
| `after-desktop-1440-hidden5.png` | `#m=`-Permalink `b=1929` — die fünf nicht gedockten Layer inkl. `trust`-Zeile |
| `after-desktop-1440-with-pointforecast.png` | `?startnow=0` — Stapel bei 46 vh gedeckelt, Punktforecast darunter sichtbar |
| `after-desktop-1280-legends.png` | 1280×800 — Bühne unverändert 716 px |
| `after-mobile-390-karte.png`, `after-mobile-390-legends.png` | 390×844 — unverändert |

### §4.3 Ergebnis

Vollständiges Protokoll mit Messwerten: `tests.md` → **V-KDR** (Gate G-KDR grün, 2026-08-01).
Kurzfassung: 16/16 Layer belegt · 0 Beschreibungs-Overlays auf der Karte · Reihenfolge = Dock ·
Leerzustand entfernt den Abschnitt · Mobile geometrisch identisch · Konsole 0/0 ·
React-Commit je Karte 0,4–8,6 ms · `npm run typecheck` grün.

**Preservation-Contract (§2.4) — Abnahme:** P1 ✅ (Komponente wiederverwendet, Text je Layer geprüft) ·
P2 ✅ (gemeinsame Quelle `layerExtNote`) · P3 ✅ (Schnee-Modus/Sicherheit/Experten belegt) ·
P4 ✅ (`after-…-preview.png`) · P5 ✅ · P6 ✅ (`after-…-with-pointforecast.png`) · P7 ✅ ·
P8 ✅ (identische Geometrie) · P9 ✅ (Zoom/Slider/Modellseite/Punktforecast) ·
P10 ✅ (Status-Chip lädt/meldet wie zuvor, Konsole leer) · P11 ✅ (Tastatur-Fokus getestet) ·
P12 ✅ (früher Return bei `MapView.tsx:3157`, neuer Code ab `:3160`).

---

## §5 Selbstverifikation (fünf Fragen, `CLAUDE.md`)

1. **Funktionserhalt — jede Funktion einzeln geprüft?** Ja. Die 16 `LAYER_INFO`-Beschreibungen sind
   erhalten, weil die **Komponente selbst** wiederverwendet wird (kein Nachbau). Die acht
   ausführlichen Ehrlichkeitstexte sind erhalten, weil Desktop und Mobile jetzt **dieselbe** Quelle
   lesen. Die Vorschau inaktiver Layer wäre die einzige Funktion gewesen, die ein reines
   „Entfernen des Hover-Overlays" gekostet hätte — sie ist als Vorschau-Karte in der Spalte
   erhalten (§1.5). Toggles, Sat-/Schnee-Modus-Schalter, Zeit-Deck, Punktforecast, Modellseite,
   mobiles Sheet: unverändert. **Nichts entfernt.**
2. **Desktop pixelgleich?** Bei **1280×800 ja** — Bühne 716 px vorher wie nachher, Readout 300 px.
   Bei **1440×900 bewusst nicht**: die Readout-Spalte wächst um 24 px (324 → 348), die Bühne
   verliert 2,9 %. Das ist der im Auftrag ausdrücklich erlaubte Desktop-Groß-Zuschlag
   (Anforderung 4) und in §2.1 begründet. Alle übrigen Kartenelemente stehen unverändert.
   Die Kartenfläche verliert die Beschreibungs-Overlays — das **ist** der Auftrag.
3. **Touch-Targets ≥ 44 px?** Die Phase fügt **kein** interaktives Element hinzu (die Karten sind
   `<article>`, der Vorschau-Chip ist ein `<span>`). Die vorhandenen Dock-Zeilen sind unverändert.
   Mobile wurde nicht angefasst. → nicht anwendbar, keine Verschlechterung.
4. **Konsole sauber?** Ja — 0 Errors, 0 Warnings über die gesamte Verifikation (1440, 1280, 390).
5. **Keine Long Tasks > 200 ms?** Ja, soweit im Emulator belastbar messbar: der React-Commit für
   das Rendern einer Beschreibungs-Karte liegt bei 0,4–8,6 ms (11 Messungen), ein Layer-Toggle bei
   0,4–1,1 ms, ein erzwungenes Layout der Spalte bei 0,4 ms. **Ehrliche Einschränkung:**
   rAF-gestützte Frame-Messungen sind unter Chrome-DevTools-MCP unbrauchbar (`agents.md` §7) —
   die dort gemessenen 1–5 s sind Drossel-Artefakte, keine Renderkosten. Die Long Tasks, die der
   Observer sieht, stammen aus GRIB-Dekodierung und dem Wind-Repaint-Loop und sind vorbestehend.

---

## §6 Offene Punkte für Jan

1. **Nicht committet.** `src/MapView.tsx` trägt umfangreiche **fremde, unfertige Arbeit aus
   vorangegangenen Phasen**. Ein `feat(wetterkarte)`-Commit der Datei würde diese Arbeit
   mit einschließen und falsch zuordnen; ein Commit ohne die Datei wäre unvollständig.
   Deshalb liegt die Phase — wie die anderen abgeschlossenen Phasen im Arbeitsbaum —
   uncommitted vor. Jan entscheidet über die Commit-Strategie.
2. **Textdopplung bewusst stehen gelassen.** Für acht Layer stehen Kurzbeschreibung und
   ausführlicher Ehrlichkeitstext jetzt untereinander und sagen teils dasselbe. Zusammenführen
   heißt Formulierungen löschen → Jans Freigabe nötig. Vorlage: **V-126**.
3. **V-127** (Vorschau ohne Maus auslösbar) als Folgeverbesserung registriert.

