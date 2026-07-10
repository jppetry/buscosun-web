# Umsetzungs-Spezifikation — Wetterkarte Mobile, Variante C

> **Zweck:** Präzise, umsetzbare Vorgabe für eine Claude-Code-CLI-Session, die die Mobilansicht der 2D-Wetterkarte auf **Variante C** („ein Sheet mit Segment-Umschalter") umbaut. Diagnose-First-Workflow aus `CLAUDE.md` gilt unverändert: **kein Code vor abgeschlossener Diagnose** — diese Spec ist die Plan-Grundlage, nicht der Ersatz für die Diagnose.
>
> **Visuelle Referenz:** `audit/mockups/wetterkarte-c-detail.html` (fünf Zustände, iPhone 12 Pro 390×844). Zustandsnummern (Z1–Z5) unten verweisen darauf.

---

## 0. Harte Randbedingungen (aus CLAUDE.md + mobile-design-guidelines.md)

- **Funktionserhalt absolut.** Jede in §9 gelistete Funktion bleibt erreichbar. Umgruppieren erlaubt, Weglassen nicht.
- **Desktop pixelgleich.** Alle Änderungen scope-isoliert in der bestehenden Mobile-Media-Query `@media (max-width: 767px), (max-height: 430px) and (orientation: landscape)`. Beleg per Screenshot-Diff 1440×900 gegen Baseline.
- **Nicht anfassen:** `WindLayer.ts`/Shader, Fusion-Engine (`modelSource.ts`), Tile-Pipeline, bestehende Design-Tokens. Kein neues Farb-/Designsystem.
- **Breakpoint-Konvention** unverändert (767px + Landscape-Kurzformat).
- **Bewusste Abweichung ggü. §8-Follow-up:** Variante C führt die zwei getrennten FABs („Layer"/„Modell") wieder in **ein** Sheet zusammen und integriert die Punkt-Vorhersage als drittes Segment. Das kehrt die §8-Entscheidung um — **von Jan mit der Wahl von Variante C freigegeben.** Im Audit dokumentieren.

---

## 1. Ausgangszustand im Code (Ist)

| Baustein | Ort | Ist-Verhalten |
|---|---|---|
| Sheet-State | `MapView.tsx:2348` | `mobileSheet: 'layer' \| 'model' \| null` |
| Snap-State | `MapView.tsx` (`sheetSnap`) | `'half' \| 'full'`, half=45vh / full=86vh |
| Row-Expand | `MapView.tsx` (`sheetExpanded`) | eine aufgeklappte Layer-Zeile |
| Zwei FABs | `MapView.tsx:2633` `.mobile-dock-fabs` | `.map-layer-fab` + `.map-model-fab` |
| Sheet | `MapView.css:1702` `.map-sheet` | `max-height`-Animation, Scrim `.map-sheet-scrim` |
| Karte | `MapView.css:1648` | `.map-container { height:66.6667vh }` + `.mobile-dock-bg` blickdicht |
| PFC (separates System) | `MapView.css:1453–1527` `.pfc-panel/.pfc-body` | eigener FAB + eigenes Sheet, Snap peek 50vh / full 90vh |
| Modell | `ModelSwitcher variant="sheet"` | Land-Tabs, Native/Fusion, Katalog, Radar-Toggle |
| Doppelte Media-Query | `MapView.css:1412` **und** `:1638` | beide matchen `max-width:767px`; im ersten Block **tote** `.left-rails`-Regeln (durch `display:none !important` im zweiten überschrieben) |

**Zwei getrennte Sheet-Systeme** (`.map-sheet` + `.pfc-body`) mit unterschiedlichen Snaps/Griffen/Animationen sind der Kern des unprofessionellen Eindrucks. Variante C vereinheitlicht sie zu **einem**.

---

## 2. Ziel-Architektur (Soll)

**Ein** persistentes Bottom-Sheet, Karte vollflächig, Steuerung über Segment-Control.

### 2.1 React-State (ersetzt `mobileSheet`)
```ts
type SheetSnap = 'collapsed' | 'half' | 'full';
type SheetSegment = 'layer' | 'model' | 'fc';
const [sheetSnap, setSheetSnap] = useState<SheetSnap>('collapsed');
const [sheetSegment, setSheetSegment] = useState<SheetSegment>('layer');
// sheetExpanded (Layer-Row-Expand) bleibt unverändert bestehen.
```
- `mobileSheet`-State und beide FABs (`.map-layer-fab`, `.map-model-fab`, `.mobile-dock-fabs`) **entfernen**.
- PFC-FAB + separates `.pfc-body`-Sheet **entfernen**; PFC-Inhalt wandert in Segment `fc`.

### 2.2 Persistentes Sheet
Das Sheet ist **immer gerendert** (nicht mehr `mobileSheet && …`). Höhe rein über `sheetSnap`:
- `collapsed` → **64px** (nur Griff + Chip-Strip)
- `half` → **46vh** (Default beim Aufziehen)
- `full` → **88vh**

---

## 3. Zustandsautomat (siehe Z1–Z3)

```
collapsed --tap/swipe-up--> half --swipe-up--> full
   ^                          |                  |
   |<------swipe-down---------|<---swipe-down/scrim-tap
```
- **collapsed (Z1):** Griff (`.grab`) + `.chip-strip`. Karte voll bedienbar. **Kein** Scrim.
- **half (Z2/Z4/Z5):** Griff + Segment-Control + Body. Karte dahinter sichtbar/bedienbar. **Kein** Scrim (`pointer-events:none`, transparent).
- **full (Z3):** wie half, mehr Body. **Blockierender Scrim** (`rgba(20,18,12,0.34)`), Tap darauf → `half`. `aria-modal="true"` nur hier.
- **Segment-Wechsel** ändert **nur** `sheetSegment` (Body), **nie** `sheetSnap`.
- Öffnen aus collapsed → immer `half`.

---

## 4. Layout & Maße (Mobile-Media-Query)

| Element | Regel |
|---|---|
| `.map-container` | zurück auf **`inset:0`** (vollflächig). Die 66,67vh-Begrenzung + `.mobile-dock-bg` **entfernen**. `ResizeObserver` (`MapView.tsx:2323`) übernimmt `map.resize()` automatisch. |
| Topbar | unverändert: Back-Icon 44×44 + Location-Pill, `top` mit `env(safe-area-inset-top)`. |
| Legende-Kapsel | `position:absolute; right:14px; top:96px; z-index:55`, **nur wenn** aktiver Layer eine Legende hat (Sicherheit/Schneegrenze/Flow-Nowcast/Regen-Chance). Ersetzt das heutige `.map-legends{display:none}`. |
| Timeline (`.forecast-slider`) | `position:absolute; left:14px; right:14px; z-index:56`, schwebt **direkt über der Sheet-Oberkante**: `bottom = <sheet-höhe> + 10px`. In `collapsed` also `bottom:86px`; in `half` `bottom:calc(46vh + 10px)`. In `full` ausblenden (Scrim deckt Karte ab). Grifffläche ≥44px (bereits erfüllt). |
| Sheet | `left:0; right:0; bottom:0; z-index:100`, Radius `22px 22px 0 0`, `env(safe-area-inset-bottom)`-Padding im Footer/Body. |

Alle fixierten Elemente: `env(safe-area-inset-*)` respektieren.

---

## 5. Sheet-Kopf & Segment-Control

- `.grab` — 38×5px, `var(--sand-300)`, zentriert. Drag-Fläche = **ganzer Kopfbereich** (Griff + evtl. Segmentleiste-Rand), `touch-action:none`, damit ≥44px-Trefferziel (wie heute bei `.map-sheet-head`).
- **Segment-Control** (nur in half/full): drei gleich breite Buttons `Layer · Modell · Vorhersage` in einem `--sand-100`-Track, aktives Segment `--cream-50` + `--shadow-card`. Höhe 40px.
- **Segment „Vorhersage" nur im Location-Modus** rendern (mit gewähltem Ort). Im DACH-Overview (`overview=true`) das Segment weglassen → Control zeigt nur `Layer · Modell`.

---

## 6. Chip-Strip (collapsed, Z1)

Horizontal scrollbarer Streifen (`overflow-x:auto`, Scrollbar versteckt), zeigt:
1. **Je aktivem Layer** ein Chip: Farbpunkt (8px) + Kurzname (z.B. „Wind", „Niederschlag", „Temperatur").
2. Ein **Modell-Badge-Chip**: Länderflagge + Modellkürzel (z.B. „🇩🇪 ICON-D2").

- Chip aktiv = `--ink-900`-Grund. Tap auf Strip/Chip → `sheetSnap='half'`, `sheetSegment='layer'`.
- Quelle der aktiven Layer: bestehendes `active`-Set (`LAYER_OPTIONS`). Farbpunkt = pro-Layer-Akzentfarbe (kleine Zuordnungstabelle, keine neuen Tokens nötig — Kartenfarben wiederverwenden).

---

## 7. Segment „Layer" (Z2/Z3)

**Identisch zum bestehenden `.map-sheet-list`** — nur unter das neue Segment gehängt. Pro Zeile (`LAYER_OPTIONS.map`):
- Toggle-Button 44×44 (`role="switch"`, `aria-checked`), `LayerIcon`, on = `--ink-900`.
- Textblock (Name 0.95rem + „Stand …"-Stempel), `aria-expanded`, Tap → `sheetExpanded`.
- Chevron 44×44, rotiert bei offen.
- Aufgeklappt (`sheetExpanded===key`): `LayerInfoPanel` +
  - `key==='wind' && on` → Wind-Feinsteuerung: **Aus/Normal/Intensiv**, **Dichte-Slider** (0.3–2.5), **Höhe** 10 m/850/700/500 hPa (bestehende `wind-particle-switch`-Logik, Buttons ≥38px).
  - `key==='sat' && on` → **Satellit-Produktwahl** (`sat-product-switch`, `SATELLITE_PRODUCTS`).

Alle 12 Layer (Wind, Niederschlag, Temperatur, Böen, Wolken, Satellit, Blitze, Stationen, Sicherheit, Schneegrenze, Flow-Nowcast, Regen-Chance) + Regenradar bleiben schaltbar.

---

## 8. Segment „Modell" (Z4)

**1:1 der bestehende Sheet-Inhalt** aus dem heutigen Modell-Sheet, ohne Logikänderung:
- Land-Zeile (Flagge + Name).
- `<ModelSwitcher variant="sheet" … />` — DE/AT/CH-Tabs (≥44px), Native ⇄ buscosun-Fusion, vollständiger Modellkatalog (aktiv/wählbar/„bald verfügbar" deaktiviert), **Regenradar-RADOLAN-RV-Toggle**, `fusionError`-Hinweis (`ms-offline`).
- Quellen-Footer (`.map-sheet-sources`).

Props unverändert durchreichen: `onSelectCountry`, `onSelectModel`, `onToggleRadar`, `fusionError`.

---

## 9. Segment „Vorhersage" (Z5) — Preservation-kritisch

Der bisher **separate** Punkt-Forecast (`.pfc-panel`/`.pfc-body`, eigener FAB) wird als Segment integriert.
- Bestehende `PointForecast`-Komponente/Inhalt **wiederverwenden** (nicht neu bauen): Übersicht/Diagramme/Tabelle-Sub-Tabs bleiben erhalten.
- Nur im Location-Modus. Im Overview-Modus Segment gar nicht anbieten.
- **Empfehlung zur Risiko-Reduktion:** In Schritt 1 die PFC-Komponente unverändert in einen `fc`-Segment-Container einhängen (Wrapper-Umzug, kein Refactor der PFC-Interna). Falls das zu tief greift, als dokumentierte Zwischenlösung PFC vorerst als eigenes Sheet belassen und das `fc`-Segment in einer Folge-Iteration integrieren — **aber** dann ist Baustein „ein einheitliches Sheet-System" noch nicht vollständig; im Audit vermerken.

---

## 10. Motion & Performance

- Snap-Übergänge über **`transform: translateY()`** statt `max-height`/`height` (behebt die dokumentierte CLS-0.68-Beobachtung, Audit §7). Sheet auf voller Zielhöhe rendern, per `translateY` in collapsed/half/full-Position schieben. `will-change: transform`.
- Kein Long Task > 200 ms; INP-Ziel < 200 ms.
- Scroll-Isolation: Body `overflow-y:auto` + `overscroll-behavior:contain`; Drag nur am Kopf (`touch-action:none`), Karten-Pan im half-Zustand nicht durch Sheet-Scroll auslösen.

---

## 11. CSS-Aufräumen (Teil der Aufgabe)

- Die **zwei** Mobile-Media-Query-Blöcke (`:1412`, `:1638`) zu **einem** zusammenführen.
- **Tote** `.left-rails`-Mobilregeln (`:1426–1442`) entfernen — durch `display:none !important` ohnehin wirkungslos.
- `.mobile-dock-bg`, `.mobile-dock-fabs`, `.map-layer-fab`, `.map-model-fab`, alte `.pfc-panel`-FAB/Sheet-Mobilregeln entfernen, soweit durch Variante C ersetzt.
- Beleg: Desktop-Screenshot-Diff unverändert.

**Verwendete Tokens (nur diese, keine neuen):** `--ink-900 #2C2A26`, `--cream-50 #FAF6EA`, `--sand-50/100/200/300`, `--stone-400/500/600`, `--terracotta-700 #A85E2E`, `--border-default #E0D6BE`, `--border-strong #C4B896`, `--surface-glass(-strong)`, `--shadow-card`, `--shadow-float`, `--font-base`.

---

## 12. Preservation Contract (muss nach Umbau alles noch gehen)

1. Zurück-Button · 2. Standort-Label · 3. Zeit-Regler (0–23h) + „jetzt"-Reset + „Stand…" · 4. Alle **12 Layer** einzeln schaltbar · 5. Pro Layer „Details & Legende" (`LayerInfoPanel`) · 6. Wind-Feinsteuerung (Aus/Normal/Intensiv, Dichte, Höhe) · 7. Satellit-Produktwahl · 8. Modell-Switcher (DE/AT/CH, Native⇄Fusion, Katalog, Radar-Toggle, Fallback-Hinweis) · 9. Kartenlegenden bei aktivem Layer · 10. Stations-Marker · 11. **Punkt-Forecast (Übersicht/Diagramme/Tabelle)** · 12. Datenquellen/Attribution · 13. Kartengesten (Pan/Pinch/Rotate).

---

## 13. Verifikation (vor Gate, MCP-gestützt)

1. **Touch-Target-Audit** (Skript über `button/a/input/switch/tab/slider` @390×844): alle ≥44×44 außer den 4 bekannten Footer-Attribution-Ausnahmen.
2. **`scrollWidth ≤ 390`** (portrait) — kein horizontales Scrollen.
3. **Funktionsliste §12** einmal komplett auslösen (12 Layer-Toggles per Skript, Segmente durchschalten, Modell-Tabs, Radar-Toggle, PFC-Sub-Tabs).
4. **Konsole** frei von neuen Errors/Warnings (BrightSky-404 sind vorbestehend/extern).
5. **Performance-Trace** Sheet-Snap-Zyklus + Segment-Wechsel: kein Long Task > 200 ms; **CLS ≈ 0** dank `transform`.
6. **Desktop-Diff 1440×900** pixelgleich zur Baseline.
7. **Landscape 844×390** — Sheet/Segment-Darstellung greift, kein Rail-Overlap (§3.3-Fix intakt).
8. **Screenshots** Vorher/Nachher aller fünf Zustände → `audit/screenshots/wetterkarte/`.
9. **Real-Device-Hinweis für Jan:** Windrichtung/-Präzision + Safe-Area-Insets nur auf echtem iOS final beurteilbar.

---

## 14. Empfohlene Umsetzungsreihenfolge

1. State-Umbau (`sheetSnap`/`sheetSegment`), Sheet persistent, Karte `inset:0`, alte FABs/Dock weg. (Z1/Z2)
2. Segment-Control + Chip-Strip. (Z1/Z2)
3. Segmente „Layer" & „Modell" einhängen (bestehende Inhalte umziehen). (Z2/Z3/Z4)
4. `transform`-Motion + Scrim-Logik. (Z3)
5. Segment „Vorhersage" (PFC-Integration, §9). (Z5)
6. CSS-Konsolidierung (§11) + Legende-Kapsel (§4).
7. Verifikation (§13) + Audit-Nachtrag.

Jeder Schritt einzeln verifizierbar; Desktop nach jedem Schritt pixelgleich.
