# agents.md — Betriebsmodell für Claude-Code-Agent-Teams

> Stand: 2026-07-31. Regelt, wie mehrere Claude-Code-Agenten parallel und koordiniert an buscosun arbeiten.
> Grundlage: `CLAUDE.md` (Verfassung), `architecture.md`, `decisions.md`, `roadmap.md`.
> In der aktuellen **Planungsphase** gelten zusätzlich die Einschränkungen aus `plan.md` §„Aktive Phase" (keine Implementierung).

## 1. Grundprinzipien

1. **Ein Agent = ein Zuständigkeitsbereich = klar abgegrenzte Dateien.** Kein zweiter Agent schreibt gleichzeitig in denselben Bereich.
2. **Dokumente sind der Koordinationskanal.** Agenten kommunizieren über die definierten Dateien (unten), nicht über implizites Wissen. Jeder Befund ohne Beleg (Dateipfad:Zeile, Screenshot, Verifier-Output) gilt als Behauptung.
3. **Code > Doku.** Bei Widerspruch entscheidet der Code; die Doku wird korrigiert (Fund in `context.md` §Session-Log notieren).
4. **STOPP & FRAGEN** (an Jan) ist eine gültige und erwünschte Ausgabe — Liste der Trigger in `CLAUDE.md` §Harte Regeln. Niemals „mutig interpretieren".
5. **Ehrlichkeit vor Vollständigkeit:** Lieber eine belegte Teilantwort als eine plausible Vollantwort.

## 2. Rollen (Planungs- und spätere Implementierungsphase)

| Rolle | Verantwortungsbereich (Dateien/Themen) | Liefert |
|---|---|---|
| **Koordinator/Architekt** | Gesamtbild, `architecture.md`, `decisions.md`, Konfliktauflösung, Masterplan-Synthese | Masterplan-Struktur, Entscheidungsvorlagen für Jan |
| **Daten & Meteorologie** | `src/sources`, `src/fusion`, `src/ml`, `src/pointForecast`, `docs/fusion-*`, Daten-SLO | Quellen-/Modell-Strategie, Fusion-v2-Cutover-Plan, AT/CH-Paritäts-Konzept |
| **Rendering & Performance** | `src/wind`, `src/scalar`, `src/map`, MapView-Zerlegung (O-04), FrameGovernor, Budgets | Perf-Budget, Zerlege-Plan, WebGL-Zukunft |
| **UX & Design-System** | Command-Deck-Konsolidierung, `designTokens.css`, Navigation/Router-Modell, `mobile-design-guidelines.md` | UX-Zielbild, Design-System-Abstraktionsplan |
| **A11y & i18n** | WCAG-Audit, Keyboard/Focus, Sprachstrategie (O-05) | A11y-Programm mit messbaren Stufen |
| **Infra & Betrieb** | `netlify/`, `.github/`, Warm-Crons, Monitoring (O-06), Security-Header, Domain (O-03) | Betriebs-Härtungsplan, §A-Defekt-Fixliste |
| **QA & Teststrategie** | `scripts/verify-*`, CI-Konzept (O-02), Playwright-Smoke | Teststrategie + CI-Blaupause |
| **Produkt & Wettbewerb** | `roadmap.md` §C, `docs/zielgruppen-dach.md`, Web-Recherche | Verifizierte Wettbewerbsanalyse, Priorisierungs-Empfehlung |
| **SEO/GEO & Recht** | `scripts/seo/`, `docs/seo-geo/`, Lizenz/Attribution, Datenschutz | SEO-Konsolidierung (Domain!), Rechts-/Lizenz-Checkliste |

Rollen können je nach Teamgröße gebündelt werden; die Dateizuständigkeit bleibt disjunkt.

## 3. Konflikt- und Sperrzonen

- **Hochrisiko-Dateien (nie parallel, Änderungen nur durch die zuständige Rolle):** `src/MapView.tsx`, `src/wind/WindLayer.ts`, `src/fusion/fusionEngine.ts`, `netlify/edge-functions/*`, `.github/workflows/*`, `src/event/EventResult.tsx`, `src/history/HistoryPage.tsx`.
- **Geteilte Dateien mit Append-Regel** (nur eigene Abschnitte anfügen, nie fremde editieren): `context.md` §Session-Log, `checklist.md`, `decisions.md` (neue Nummern), `roadmap.md`, `improvements.md` (fortlaufende V-Nummern, Duplikat-Check vor Anlage).
- **Tabu ohne Jans Freigabe:** Shader/RGBA8-Pfad, Fusion-Engine-Verhalten, Edge-Function-/Cron-Semantik, Dependency-Änderungen, Löschungen (Details `CLAUDE.md`).
- Bei Bereichs-Überschneidung: Koordinator entscheidet Zuschnitt **vor** Arbeitsbeginn, Ergebnis in `context.md` protokollieren.

## 4. Arbeitsablauf pro Agent (jede Phase)

1. **Einlesen:** `CLAUDE.md` → `architecture.md` → eigener Bereich in `roadmap.md`/`decisions.md` → relevante `docs/`/`audit/`-Spezifikationen.
2. **Diagnose vor Aussage:** Eigene Behauptungen am Code verifizieren (die Alt-Doku enthält bekannte Fiktionen — Beispiele in `context.md` §Korrigierte Irrtümer).
3. **Arbeiten im eigenen Bereich**, Belege sammeln (`audit/<thema>.md` für neue Diagnosen).
4. **Verbesserungen registrieren (Pflicht, D-28):** Jede gefundene Verbesserung sofort als `V-NN`-Eintrag in `improvements.md` nach dem dortigen Template — mit **Mehrwert** in Alltagssprache (Jan muss ohne Kontext verstehen, was er davon hat) und konkreter **Umsetzungsskizze**. Erst registrieren, dann weiterarbeiten; nichts nur im Session-Log „erwähnen".
5. **Abschluss:** Ergebnis in die zuständige Zieldatei; 3–5-Satz-Fazit in `context.md` §Session-Log (Datum, Rolle, Ergebnis, offene Punkte); betroffene Checklisten-Punkte mit Beleg abhaken.
6. **Eskalation:** STOPP&FRAGEN-Punkte gesammelt an den Koordinator; der bündelt sie für Jan.

## 5. Standards

- **Doku:** Deutsch, präzise, belegt (`Datei:Zeile`), Datumsstempel bei Stand-Angaben; keine relativen Daten („letzte Woche"). Prompts Englisch.
- **Code (Implementierungsphasen):** TypeScript strikt, Purity-Grenze respektieren (D-12), Flag-Gating für neue Pfade (D-11), Conventional Commits (englisch, Scope = Bereich), kleine Commits. Kommentare nur für Nicht-Offensichtliches, englisch.
- **Verifikation:** `npm run typecheck` grün ist Minimalpflicht; betroffene `verify:*`-Skripte laufen lassen (Netzabhängigkeit dokumentieren, wenn ein Verifier upstream-bedingt scheitert); UI-Behauptungen nur mit MCP-Screenshot-Beleg.

## 6. Definition of Done

**Für die Planungsphase (jedes Teilergebnis):**
- [ ] Alle Aussagen am Code oder per belegter Recherche verifiziert (keine Übernahme aus Alt-Doku ohne Prüfung).
- [ ] Ergebnis in der zuständigen Zieldatei, verlinkt aus `roadmap.md` oder dem Masterplan.
- [ ] Jede gefundene Verbesserung als `V-NN` in `improvements.md` registriert — mit Mehrwert + Umsetzungsskizze (D-28).
- [ ] UI-bezogene Vorschläge folgen dem Command-Deck-Standard (D-27) — keine neuen Designsysteme, Alt-Theme-Migrationen als V-Einträge unter V-10 referenziert.
- [ ] Offene Fragen explizit als solche markiert (nicht wegentschieden).
- [ ] Priorisierung mit Begründung gegen die vier Differenzierungs-Achsen (`roadmap.md` §C) geprüft.
- [ ] Session-Log-Eintrag geschrieben; keine Quellcode-/Config-Änderung erfolgt; keine Commits.

**Für spätere Implementierungsphasen:** zusätzlich die fünf Selbstverifikations-Fragen aus `CLAUDE.md` mit Beleg, Desktop-Regression-Check, Gate in `checklist.md` vollständig grün.

## 7. Bekannte Fallen für Agenten

- Alt-Doku nennt nicht-existente Technik (Three.js, WebLLM/`src/assistant`, R2/PMTiles, AdaptiveQualityController) — nie ungeprüft zitieren.
- Verifier treffen teils Live-Server → Fehlschläge können Upstream-Churn sein (DWD-Publikationsfenster), nicht Code-Fehler.
- Chrome-DevTools-Emulation ist für WebGL-/FPS-Aussagen unbrauchbar (MCP drosselt rAF); In-App-Browser rendert WebGL-Karten nicht im Hintergrund.
- Dev-Ports in Alt-Doku (:5173…:5198) sind nicht reproduzierbar — Vite pinnt keinen Port.
- `fixtures/session-*.json` sind Trainings-Captures (Absicht, Constraint C3) — nicht „aufräumen".
- Die Warm-Bots committen auf `main` — vor eigenen Pushes immer frisch pullen; Manifest-Dateien nie manuell editieren.
