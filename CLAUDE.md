# CLAUDE.md — buscosun

## Konventionen
- Implementierungscode + Kommentare auf Englisch; alle nutzersichtbaren Texte Deutsch.
- v1.8-Design-System adoptieren (`src/designTokens.css` + `rt-*`-Shell aus
  `src/route/tourTheme.css`). Kein neues Farbsystem, keine hardcodierten Hex-Werte.
- Statisches Gate: `npm run typecheck` + `npm run build`. (Kein Lint-Skript.)

## ATMOSPHÄRE-LEITPLANKEN
- In jeder Aufgabe vor dem Schreiben diagnostizieren; nach dem Schreiben via MCP verifizieren.
- AUTO-FORTSCHRITT: Bei grüner Verifikation automatisch zum nächsten Schritt, ohne
  Rückfrage. STOP nur bei rotem Check oder einem der drei Entscheidungs-Gates:
  (1) neue schwere Dependency, (2) Datenbedarf außerhalb bestehender Pipelines,
  (3) unauflösbarer Konflikt mit Design-System/Architektur.
- NUR BESTEHENDE DATEN-PIPELINES (v. a. ICON-D2-Blend, ICON-EU-Sounding, GFS, DEM).
  Keine neue externe Quelle, kein neuer Fetch-/Ingest-Pfad, kein neuer Fremd-Adapter.
  Fehlt ein Datum → Feature reduzieren/ausblenden und STOP, statt eine Pipeline zu bauen.
- VERIFIKATIONS-SUITE: typecheck + build (+ Tests wo vorhanden) → Context7 (API-
  Konsistenz) → Chrome DevTools (Laufzeit, 3 Breakpoints, Perf) → atomarer Commit
  + checklist.md aktualisieren.
- LAYOUT: Mobile / Tablet hoch+quer / Desktop; Split bei Desktop & Tablet-Quer,
  sonst gestapelt; Profil-Cap 0–4000 m + „ganze Höhe"-Toggle.
- Meter + km/h + lineare Skalen für Vertikaldaten. Meteorologie in reinen,
  getesteten Modulen; das LLM erklärt nur, rechnet nie.
- Probabilistische Vorhersagen kennzeichnen, mit Modelllauf-Alter; dünne Inversionen
  (<200 m) als unteraufgelöst markieren.
- 3D = MapLibre Custom-WebGL-Layer (kein Three.js); pro Linse mounten, sauber
  unmounten; Mobile/Tablet/WebGPU-Fallbacks; Perf via Chrome-DevTools verifizieren.
- Sieben-Datei-Doku nach jeder Phase aktuell halten: CLAUDE.md, plan.md, checklist.md,
  prompt.md, context.md, architecture.md, tests.md.

## Atmosphäre — Schlüsselbefunde (P0)
- Rendering = MapLibre GL 5.6 (kein Three.js). Browser-LLM voll gebaut in `src/assistant/*`.
- Keine nativen ICON-D2-Druckflächen → Vertikalquelle ICON-EU-Sounding + abgeleiteter
  3D-Schnitt. Keine Aerosol-/Staub-Pipeline (Staub-Card entfällt).
- Charts = handgerolltes SVG (keine Charting-Lib).
