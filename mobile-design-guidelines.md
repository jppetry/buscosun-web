# mobile-design-guidelines.md — Verbindliche Mobile-UI-Patterns

Diese Datei definiert das einheitliche Ziel-Erscheinungsbild. Jede Phase misst ihre Maßnahmen an diesen Regeln. Abweichungen nur mit dokumentierter Begründung.

## 1. Layout-Grundregeln
- Referenz-Viewport: **390×844 CSS-px** (iPhone 12 Pro), DPR 3. Alles muss aber ab 360 px Breite funktionieren.
- **Kein horizontales Scrollen** auf Seitenebene. `overflow-x` nur innerhalb bewusst scrollbarer Container (z.B. Chip-Reihen) mit sichtbarem Overflow-Hinweis.
- **Safe-Area**: `padding` via `env(safe-area-inset-top/bottom/left/right)` auf fixierte Elemente (Header, Bottom Sheets, FABs). `viewport-fit=cover` im Meta-Tag prüfen/setzen.
- Einspaltiges Layout als Default. Mehrspaltige Desktop-Layouts werden vertikal gestapelt oder in Tabs/Sheets überführt — nie durch Verkleinern "reingequetscht".

## 2. Karten-Features (Wetterkarte, Regenradar, Tourenplanung)
- **Bottom Sheet** als zentrales Steuer-Pattern: Layer-Auswahl, Model-Switcher, Fusion-Toggle, Legenden wandern vom Seitenpanel in ein snappendes Bottom Sheet (Zustände: collapsed ~64 px Griffleiste / half ~45 % / full ~90 %).
- Karte bleibt immer sichtbar und interaktiv, solange das Sheet nicht "full" ist.
- Gesten-Konflikte auflösen: Sheet-Drag nur an der Griffleiste bzw. am Sheet-Header; Scroll im Sheet-Inhalt darf die Karte nicht bewegen (Touch-Event-Propagation stoppen).
- Floating Controls (Zoom, Standort, Nordung) rechts unten in der Daumenzone, vertikal gestapelt, ≥ 44 px, mit 8 px Abstand.
- Zeit-/Timeline-Scrubber (Regenradar): volle Breite über dem Bottom Sheet, Grifffläche mindestens 44 px hoch, große Play/Pause-Taste, Zeitstempel groß und lesbar.

## 3. Touch & Interaktion
- **Touch-Targets ≥ 44×44 px** (Apple HIG), Mindestabstand 8 px zwischen Targets.
- Keine Hover-abhängigen Funktionen: Tooltips → Tap-Popover oder Info-Zeile; Hover-Reveals → immer sichtbar oder per Tap.
- Primäre Aktionen in die untere Bildschirmhälfte (Daumenzone), destruktive Aktionen nie direkt neben primären.
- Charts (Vorhersage, Historie): Tap statt Hover für Datenpunkt-Details; Pinch-Zoom in Diagrammen nur, wenn er das Seiten-Scrolling nicht kapert (Alternative: Zeitraum-Chips).
- Native iOS-Verhalten respektieren: kein `user-scalable=no`-Zwang, Formularfelder mit `font-size ≥ 16px` (verhindert iOS-Auto-Zoom), korrekte `inputmode`/`autocomplete`-Attribute.

## 4. Typografie & Dichte
- Fließtext ≥ 15–16 px, Sekundärtext ≥ 13 px, nichts unter 12 px.
- Tabellen mit mehr als 3 Spalten: auf Mobile als Karten-Stapel oder horizontal scrollbarer Bereich mit fixierter erster Spalte — nie durch Schriftverkleinerung lösen.
- Zeilenhöhe in Listen ≥ 48 px.

## 5. Progressive Disclosure (Atmosphäre)
- Die drei Disclosure-Tiefen bleiben erhalten, werden aber als vertikale Expansion (Akkordeon/„Mehr anzeigen") oder als Sheet-Stufen umgesetzt — nicht als Hover- oder Breiten-abhängiges Muster.
- Linsen-Auswahl (Fliegen / Berg & Weg / Himmel) als segmentierte Kontrolle oder horizontale Chip-Reihe oben, sticky.

## 6. Performance-Budget Mobile
- Interaktionen: keine Long Tasks > 200 ms; Ziel INP < 200 ms.
- GPU-Features starten auf Mobile im konservativen Quality-Tier des AdaptiveQualityControllers; Hochstufung nur durch den Controller selbst.
- 3D Globus: reduzierte Ray-March-Steps / Auflösungs-Scale als Mobile-Default über bestehende Quality-Tiers; Pixel-Ratio-Cap prüfen (`Math.min(devicePixelRatio, 2)` ist auf DPR-3-Geräten üblich — gegen bestehende Controller-Logik abgleichen, nicht doppelt cappen).
- Lazy-Load schwerer Module (Three.js-Globus, WebLLM) erst bei Feature-Aufruf — prüfen, ob bereits gegeben; falls nicht, als Maßnahme aufnehmen.

## 7. Was ausdrücklich NICHT passieren darf
- Funktionen entfernen oder hinter "Desktop only" verstecken.
- Desktop-Layout verändern (außer sauber isolierte Refactorings ohne visuelle Änderung, per Screenshot-Diff belegt).
- Neue Farb-/Designsysteme einführen — bestehende Tokens/Styles weiterverwenden.
- Shader-Logik, Fusion-Engine, Datenpipelines oder Tile-Pipeline verändern.
