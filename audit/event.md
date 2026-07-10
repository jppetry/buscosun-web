# Diagnose — Event-Planung (Phase 5, vorgezogen)

**Datum:** 2026-07-08
**Hinweis:** Diese Phase wurde auf ausdrücklichen Wunsch von Jan vor Abschluss von Phase 2–4 vorgezogen (siehe `context.md` Session-Log, `plan.md` Phase 5). Zusätzlicher Auftrag: Formular auf Mobile in getrennte Schritte/Seiten aufteilen, damit der Nutzer nicht überfordert wird.

## 1. Setup
- Chrome DevTools MCP, Emulation iPhone 12 Pro (390×844, DPR 3, Touch, iOS-Safari-UA).
- Ein verwaister Chrome-Prozess (dediziertes Automatisierungsprofil `chrome-devtools-mcp`) blockierte die Verbindung — nach Rückfrage bei Jan beendet (kein Einfluss auf reguläres Browserprofil).
- Route: Startseite → „Event-Planung" → Ort „München" eingeben → Formular.

## 2. Ist-Zustand (Code, `src/event/EventPage.tsx` + `EventPage.css`)
Der Flow hat bereits **einen** eigenen ersten Schritt: Solange kein Ort gewählt ist, zeigt die Seite ausschließlich die Ortssuche (`!location`-Zweig, Zeile 142–167) — das ist die Vorlage für „eigene Seite pro Eingabe-Gruppe".

Sobald ein Ort gewählt ist, rendert die Seite **alle vier verbleibenden Abschnitte auf einmal, gestapelt**, unabhängig vom Viewport:
1. `1 · Anlass` (Kachel-Grid, 10 Presets + „Eigener Anlass", danach Preset-Faktoren + Feinjustierung-Panel, per `<details open>` **standardmäßig aufgeklappt**)
2. `2 · Zeitfenster` (Zeitraum/Einzeltermine-Toggle + Datumsfelder)
3. `3 · Phasen` (Vorlagen-Chips + Phasen-Zeilen, editierbar)
4. `4 · Plan B` (optional, Checkbox + bei Aktivierung: Metrik-Select, Schwellwert-Slider, Ausweich-Kacheln, Wunschtag-Select)

Danach folgt der CTA „Beste Tage finden".

## 3. Befund — Screenshots
- `audit/screenshots/event/diag-step1-location.png` — Schritt 1 (Ort), sauber, kein Problem.
- `audit/screenshots/event/diag-step2-fullform-before.png` — volle Seite direkt nach Ortswahl, kein Anlass gewählt.
- `audit/screenshots/event/diag-step3-activity-selected.png` — nach Anlass-Wahl („Grillen"): Preset-Faktoren + aufgeklapptes Feinjustierungs-Panel kommen zusätzlich dazu.

### 3.1 Scroll-Länge (390×844)
| Zustand | `scrollHeight` | Bildschirme (à 844px) |
|---|---|---|
| Ort gewählt, kein Anlass | 2518px | **~3,0** |
| Anlass gewählt (Feinjustierung offen) | 2994px | **~3,5** |

Mit „Hochzeit" (3 Phasen-Vorlage) oder aktiviertem Plan B wird die Seite noch länger. Der Nutzer muss vor dem CTA "Beste Tage finden" durch 3–4 Bildschirmlängen unzusammenhängender Formularabschnitte scrollen — das ist der Kern des von Jan beschriebenen "Überforderungs"-Problems.

### 3.2 iOS-Auto-Zoom-Risiko (Formularfelder < 16px)
Verstößt gegen `mobile-design-guidelines.md` §3 ("Formularfelder mit font-size ≥ 16px"):

| Feld | computed font-size |
|---|---|
| `.ev-date` (Von/Bis, Zeitfenster) | 14.72px |
| `.ev-phase-name` (Phasenname) | 15.04px |
| `.ev-tune-hr` (Wohlfühl-Temperatur von/bis) | 14.4px |
| `.ev-phase-hr` (Phasen-Stunden von/bis) | 14.72px |

Fokussiert der Nutzer eines dieser Felder auf echtem iOS-Safari, zoomt die Seite automatisch hinein (kein Emulator-Artefakt, bekanntes WebKit-Verhalten unterhalb 16px).

### 3.3 Touch-Target-Audit (`.ev-page button/input/select/[role=tab]/[role=radio]`)
36 interaktive Elemente gefunden, **24 unter 44×44px**. Relevante Fälle (Rest sind Slider-Eingaben, bei denen die Spur bewusst schlank ist, Tune-Bereich):

| Element | Maße | Einschätzung |
|---|---|---|
| `.ev-loc-change` ("Ändern") | 70×28 | zu klein, echter Tap-Ziel |
| `.ev-tune-hr` (Zahlen-Input ×2) | 54×34 | zu klein |
| `.ev-seg-btn` (Zeitraum/Einzeltermine) | 93×31 / 119×31 | zu klein |
| `.ev-date` (Von/Bis) | 144×43 | knapp unter 44px Höhe |
| `.ev-preset-btn` (Phasen-Vorlagen ×6) | ~32px hoch | zu klein |
| `.ev-phase-name` | 295×30 | zu klein |
| `.ev-phase-hr` (Stunden ×2) | 53×33 | zu klein |
| `.ev-add-btn.ev-phase-add` | 155×37 | zu klein |
| `nf-bell` (Notification-Glocke, Topbar) | 32×36 | zu klein (vorbestehend, nicht Teil dieser Diagnose) |

Slider (`.ev-tune-slider`, `.ev-planb-thr` Range) und die Anlass-/Ausweich-Kacheln (≥44px durch Padding) sind bereits ausreichend groß — keine Änderung nötig.

### 3.4 Konsole
Ein vorbestehendes a11y-Issue (`msgid=8`, „form field element should have an id or name attribute", count 2) — deckt sich mit der in Phase 0 dokumentierten Baseline, keine neue Regression.

### 3.5 Bereits vorhandene Bausteine, die wiederverwendbar sind
- `useIsMobile()` / `MOBILE_BREAKPOINT_QUERY` (`src/mobile/useIsMobile.ts`) — exakt der 767px-Konvention.
- `.safe-pad-bottom` (`src/mobile/safeArea.css`) — für eine sticky Footer-Navigation am unteren Rand.
- Der bestehende `!location`-Zweig ist der De-facto-Präzedenzfall für „ein Eingabe-Thema = eine Seite" und liefert das visuelle Vorbild (Eyebrow + Headline + Intro-Text pro Schritt).
- `isWindowValid()`, `isQueryComplete()` (`eventModel.ts`) — vorhandene Validierung, wiederverwendbar als Gate zwischen den Schritten.

## 4. Zusammenfassung
Kern-Problem ist nicht fehlende Funktion, sondern **Informationsdichte pro Bildschirm**: vier inhaltlich getrennte Themen (Anlass, Zeitfenster, Phasen, Plan B) laufen ineinander auf einer 3+ Bildschirmlängen langen Seite, ohne Zwischenschritt oder Fortschrittsanzeige. Dazu kommen echte, unabhängige Mobile-Bugs (Auto-Zoom-Schriftgrößen, mehrere Touch-Targets unter 44px), die im Zuge der Umstellung mit behoben werden, da ohnehin dieselben Komponenten angefasst werden.

Maßnahmen siehe `plan.md` Phase 5.
