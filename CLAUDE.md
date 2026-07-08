# CLAUDE.md — Session: Mobile-Optimierung buscosun.com

## Mission
Alle acht Kern-Features der buscosun-Plattform werden **einzeln, nacheinander** analysiert und für den mobilen Gebrauch optimiert. Referenzgerät: **iPhone 12 Pro (390×844 CSS-px, DPR 3)**.

**Oberste Direktive: Funktionserhalt.** Jede Funktion, die aktuell auf Desktop existiert, bleibt vollständig erhalten. Es wird ausschließlich die Darstellung, Bedienung und Performance für Mobile optimiert. Kein Feature-Cut, kein "auf Mobile blenden wir das aus" ohne explizite Freigabe durch Jan.

## Feature-Reihenfolge (fix, nicht umsortieren)
1. Wetterkarte
2. Regenradar
3. Vorhersage
4. Tourenplanung
5. Event-Planung
6. Historie
7. Atmosphäre
8. 3D Globus

Begründung der Reihenfolge: Wetterkarte zuerst, weil dort die geteilten Layout-Primitives (BottomSheet, MobileToolbar, Safe-Area-Handling) entstehen, die alle anderen Features wiederverwenden. 3D Globus zuletzt, weil GPU-lastig und mit dem höchsten Regressionsrisiko.

## Arbeitsmodus: Diagnose-First
Pro Feature gilt zwingend diese Sequenz — keine Ausnahme:

1. **DIAGNOSE** — Feature im iPhone-12-Pro-Viewport laden (Chrome DevTools MCP), Screenshots, Konsole, Touch-Target-Audit, Performance-Trace. Befund schriftlich in `audit/<feature>.md` festhalten. **Kein Code vor abgeschlossener Diagnose.**
2. **PLAN** — Konkrete Maßnahmenliste aus der Diagnose ableiten, gegen `mobile-design-guidelines.md` prüfen, in `plan.md` unter der Phase eintragen.
3. **IMPLEMENT** — Umsetzung in kleinen Commits (Conventional Commits, Scope = Feature-Name, z.B. `feat(wetterkarte): bottom sheet layer controls`).
4. **VERIFY** — Verifikationsprotokoll aus `tests.md` vollständig durchlaufen. MCP-gestützt, nicht "sieht gut aus".
5. **GATE** — Checkliste in `checklist.md` abhaken. Erst wenn ALLE Punkte grün sind, beginnt das nächste Feature.

## Harte Regeln
- **NIEMALS** zwei Features parallel anfassen. Ein Feature = eine Phase = ein Gate.
- **NIEMALS** Desktop-Layout verändern, außer die Änderung ist per Media Query / Breakpoint sauber isoliert. Desktop-Regression = Phase gilt als fehlgeschlagen.
- **NIEMALS** bestehende Funktionen entfernen, verstecken oder "vereinfachen". Umgruppieren (z.B. in Bottom Sheet, Tabs, Akkordeon) ist erlaubt; Weglassen nicht.
- **STOPP & FRAGEN** bei: Änderungen an Shadern/WebGL-Pipeline, Änderungen an der Fusion-Engine, Löschen von Komponenten, Abhängigkeits-Upgrades, allem was irreversibel wirkt.
- Bekannte Mobile-GPU-Fallen respektieren: kein Verlass auf `EXT_color_buffer_float`, explizite `highp`-Deklarationen in Shadern, RGBA8-Packing-Pfad nicht anrühren. Der AdaptiveQualityController ist die zentrale Stellschraube für Mobile-Performance — nutzen, nicht umgehen.
- Breakpoint-Konvention: Mobile-Styles gelten für `max-width: 767px` (bzw. bestehende Projekt-Breakpoints, falls definiert — zuerst prüfen). Keine neuen Ad-hoc-Breakpoints einführen.
- Safe-Area beachten: `env(safe-area-inset-*)` für Notch und Home-Indicator (iPhone 12 Pro hat beides).

## Verifikations-Setup
- **Chrome DevTools MCP** ist das primäre Verifikationswerkzeug: Device-Emulation iPhone 12 Pro (390×844, DPR 3, Touch aktiviert, UA iOS Safari-nah), Screenshots, Console-Log-Prüfung, Performance-Traces, Netzwerk-Inspektion.
- Emulation ist notwendig, aber nicht hinreichend: WebGL-Verhalten im Emulator ist NICHT repräsentativ (bekannt aus dem Wind-Partikel-Debugging). Für GPU-kritische Phasen (Wetterkarte, Regenradar, 3D Globus) zusätzlich Real-Device-Check via scrcpy/ADB einplanen und Jan informieren.
- Jede Phase produziert Vorher/Nachher-Screenshots unter `audit/screenshots/<feature>/`.

## Dokumentation & Sprache
- Alle Session-Dokumente auf Deutsch, Prompts an Claude Code auf Englisch.
- Nach jeder Phase: `checklist.md` aktualisieren, kurzes Phasen-Fazit (3–5 Sätze) in `context.md` unter "Session-Log" anhängen.
- Commits: Conventional Commits, englisch.

## Selbstverifikation vor Phasenabschluss
Vor dem Gate stellt Claude Code sich selbst diese Fragen und beantwortet sie schriftlich:
1. Funktioniert jede einzelne Funktion des Features, die vor der Phase existierte, nach der Phase noch? (Liste durchgehen, nicht pauschal bejahen.)
2. Ist die Desktop-Ansicht pixelgleich unverändert? (Screenshot-Vergleich.)
3. Sind alle Touch-Targets ≥ 44×44 px?
4. Ist die Konsole frei von neuen Errors/Warnings?
5. Läuft die Interaktion im Performance-Trace ohne Long Tasks > 200 ms?

Nur wenn alle fünf mit "ja + Beleg" beantwortet sind: Gate passiert.
