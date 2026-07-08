# Phase 0 — Fundament & Baseline

Diagnose- und Umsetzungsprotokoll für Gate G0 (Mobile-Optimierung buscosun.com).
Referenz: `prompt.md` (Session Kickoff), `plan.md` Phase 0, `CLAUDE.md`.

## 1. Gelesene Dokumente & Konflikt-Check

Gelesen: `CLAUDE.md`, `context.md`, `mobile-design-guidelines.md`, `plan.md`, `checklist.md`, `tests.md`.

Ein Punkt wurde geprüft und als unkritisch eingestuft: `CLAUDE.md` wurde vor dieser Session komplett auf die Mobile-Session-Regeln umgeschrieben; die vorherige Fassung enthielt Architektur-/Command-Dokumentation (App-Routing, Datenschicht, Build). Diese Information ist **nicht verloren** — sie liegt weiterhin vollständig in `architecture.md` und `package.json`. Kein inhaltlicher Widerspruch zwischen den sechs Dokumenten gefunden; die Breakpoint-Konvention aus `CLAUDE.md` (`max-width: 767px`) deckt sich mit dem bereits im Code dominanten Muster (siehe §2).

## 2. Chrome DevTools MCP — Emulation verifiziert

- Viewport `390x844x3,mobile,touch`, User-Agent iOS-Safari-nah, gegen `http://localhost:5173/` (laufender Dev-Server) verifiziert.
- Testscreenshots: `audit/screenshots/baseline/emulation-test-searchpage-mobile.png` (390×844, DPR 3) und `emulation-test-searchpage-desktop.png` (1440×900).
- Emulation funktionsfähig, Rendering korrekt (siehe Screenshot-Inhalt: SearchPage vollständig, keine Layout-Brüche).

## 3. Breakpoint-Bestandsaufnahme & Konvention

Codebase-weite Analyse (`src/**/*.css` + TS/TSX-Runtime-Checks):

- **~22 verschiedene px-Werte** in `@media`-Regeln über 14 Dateien verstreut — kein einheitliches System, keine exportierte Breakpoint-Konstante.
- Häufigste Werte (720px, 640px, 900px) sind Ad-hoc-Grid-Kollaps-Schwellen einzelner Komponenten, keine bewussten Geräte-Stufen.
- **`src/atmosphere/atmosphere.css`** verwendet bereits eine bewusste Dreier-Stufung: `max-width:767px` (mobil) / `768–1024px` + `orientation` (Tablet) / `min-width:1024px` (Desktop) — auch in `MapView.css` gespiegelt.
- Einzige Laufzeit-Erkennung: `src/threed/SectionView.tsx` (`useIsNarrow`, `matchMedia('(max-width:760px)')`); sonst nur `matchMedia('(pointer: coarse)')` für Touch-Erkennung (kein Breakpoint). Keine bestehende `useIsMobile`/`useBreakpoint`-Hook.

**Konvention (bestätigt, siehe `CLAUDE.md`):** `max-width: 767px` = mobil, `768–1024px` = Tablet, `>1024px` = Desktop — deckungsgleich mit dem bereits saubersten Muster im Code (Atmosphäre/MapView). Kein neuer Ad-hoc-Breakpoint eingeführt.

## 4. Viewport-Meta

`index.html` hatte `<meta name="viewport" content="width=device-width, initial-scale=1.0">` — **ohne** `viewport-fit=cover`. Das ist ein Diagnosebefund: ohne `viewport-fit=cover` werden `env(safe-area-inset-*)`-Werte auf iOS nicht mit echten Notch-/Home-Indicator-Maßen befüllt (Fallback 0px), was die in `CLAUDE.md` geforderte Safe-Area-Behandlung unmöglich macht.

**Maßnahme umgesetzt:** `viewport-fit=cover` ergänzt (`initial-scale=1.0, viewport-fit=cover`). Kein `user-scalable=no` vorhanden — bereits konform. Isolierte Änderung, keine Layout-Auswirkung außerhalb Safe-Area-Handling.

## 5. Baseline-Screenshots (alle 8 Features, mobil + Desktop)

Unter `audit/screenshots/baseline/<feature>/{mobile,desktop}.png`:

| Feature | Mobil (390×844×3) | Desktop (1440×900) |
|---|---|---|
| Wetterkarte | ✅ | ✅ |
| Regenradar | ✅ | ✅ |
| Vorhersage | ✅ | ✅ |
| Tourenplanung | ✅ | ✅ |
| Event-Planung | ✅ | ✅ |
| Historie | ✅ | ✅ |
| Atmosphäre | ✅ | ✅ |
| 3D Globus | ✅ | ✅ |

Alle 8 Seiten wurden über die SearchPage-Feature-Kacheln geöffnet (keine Hash-Permalinks für alle Features vorhanden — nur Atmosphäre/Historie/Globus/Validierung haben `#atm=`/`#h=`/`#g=`/`#val`).

Erste optische Eindrücke (nur Baseline, keine Phase-1-Diagnose):
- **Wetterkarte**: Layer-Button + Zeitleiste bereits unten fixiert, überlappt nicht kritisch — detaillierte Diagnose folgt in Phase 1.
- **3D Globus**: Das Kontrollpanel (Overlay/Höhe/Partikel/Projektion/Vorlauf) nimmt auf 390px fast zwei Drittel der Bildhöhe ein und überlagert den Globus stark — erwartungsgemäß hohes Mobile-Risiko, wie in `context.md` vermerkt.

## 6. Konsolen-Baseline pro Seite

| Feature | Konsolen-Befund (mobil) |
|---|---|
| Wetterkarte | keine Meldungen |
| Regenradar | `[issue] A form field element should have an id or name attribute (count: 2)` |
| Vorhersage | dito (count: 2) |
| Tourenplanung | dito (count: 1) |
| Event-Planung | dito (count: 2) |
| Historie | dito (count: 2) |
| Atmosphäre | dito (count: 1) |
| 3D Globus | keine Meldungen |

**Vorbestehender Befund:** Das a11y-Issue "form field element should have an id or name attribute" tritt auf 6 von 8 Seiten auf (vermutlich das Standort-Suchfeld im Seiten-Header) und ist **nicht** Teil dieser Mobile-Session — als Baseline dokumentiert, damit spätere Phasen "neu" von "vorbestehend" unterscheiden können. Keine Errors, keine WebGL-Warnungen in der Emulation.

## 7. Geteilte Mobile-Primitives (Scaffold)

Neu angelegt unter `src/mobile/` (nur Gerüst, kein Eingriff in Produktions-Seiten):

- **`useIsMobile.ts`** — `useMediaQuery`/`useIsMobile`-Hook auf Basis von `matchMedia('(max-width: 767px)')`, SSR-sicher, mit `change`-Listener.
- **`BottomSheet.tsx` + `.css`** — snappender Bottom Sheet mit drei Zuständen (`collapsed` ~64px / `half` 45vh / `full` 90vh), Drag ausschließlich über Griffleiste/Header (Pointer Events), Inhalt scrollt unabhängig (`overflow-y:auto`, `overscroll-behavior:contain`) ohne die Karte zu bewegen.
- **`MobileToolbar.tsx` + `.css`** — vertikal gestapelte Floating-Controls, rechts unten, ≥44×44px pro Button, Safe-Area-Padding.
- **`safeArea.css`** — Utility-Klassen (`.safe-pad-top/bottom/x`, `.safe-inset`) auf Basis von `env(safe-area-inset-*)`.
- Alle Farben/Radien/Schatten aus bestehenden Tokens (`designTokens.css`) übernommen — kein neues Farbsystem.

**Sichtbare Testroute:** `#mobiletest` (nur per Hash erreichbar, keine UI-Verlinkung) → `src/mobile/MobilePrimitivesTestPage.tsx`. Verifiziert in Emulation: `useIsMobile()` liefert `true` bei 390px; Drag-Test per simuliertem Pointer-Event bestätigt Snap-Wechsel half → collapsed (Sheet-Höhe 844×0.45≈380px → 64px). Screenshots: `mobile-primitives-test.png` (half), `mobile-primitives-test-collapsed.png` (collapsed).

**Bekannter Folgepunkt für Phase 1 (kein Bug, Kompositionsdetail):** Im Collapsed-Zustand überlappt der untere MobileToolbar-Button (`bottom:12px`) knapp mit der Griffleiste des Sheets, da beide denselben unteren Rand adressieren. Bei der Wetterkarten-Integration muss der Toolbar-Offset relativ zur aktuellen Sheet-Höhe berechnet werden (z. B. `bottom: calc(var(--sheet-height) + 12px)`), statt eines festen Werts.

`npm run typecheck` grün nach allen Änderungen (siehe unten).

## 8. Kein Eingriff ins Produktions-Layout

Geänderte/neue Dateien in dieser Phase:
- `index.html` (nur Meta-Tag-Ergänzung)
- `src/App.tsx` (nur additive Route `#mobiletest`, keine bestehende Zeile verändert außer Typ-Union-Erweiterung)
- `src/mobile/*` (komplett neu, wird von keiner Produktionsseite importiert)

Keine bestehende Feature-Seite, kein bestehender Style wurde verändert. Desktop-Verhalten unverändert (Screenshot-Baseline dient als Referenz für spätere Diffs).

## 9. Verifikation

- `npm run typecheck` → grün (keine Fehler).
- Emulation (Chrome DevTools MCP) für alle 8 Feature-Seiten + Testroute durchlaufen, Screenshots + Konsolen-Ausgabe dokumentiert.

## Gate G0 — Status

Alle Punkte aus `checklist.md` Phase 0 erfüllt (siehe dort für die abgehakte Liste mit Beleg-Pfaden). **Gate G0: bestanden.**

Offen für Jan: Freigabe zum Start von Phase 1 (Wetterkarte). Commits liegen noch nicht vor — werden erst nach expliziter Freigabe erstellt (Conventional Commits, siehe Commit-Plan unten).

**Geplante Commits (noch nicht ausgeführt):**
1. `fix(viewport): add viewport-fit=cover for safe-area support`
2. `feat(mobile): scaffold BottomSheet/MobileToolbar/safe-area primitives`
3. `docs(mobile): Phase 0 baseline audit, checklist and session log`
