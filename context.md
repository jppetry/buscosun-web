# context.md — Session-Kontext: Mobile-Optimierung buscosun

## Projekt
buscosun.com ist eine DACH-fokussierte Wetter-Visualisierungsplattform.

**Stack:**
- React + Vite + TypeScript
- MapLibre GL JS (2D-Karten)
- Three.js, WebGL2 mit WebGPU-Pfad (3D Globus, volumetrische Wolken via Ray Marching)
- GPU-Ping-Pong-Windpartikel (RGBA8-packed Positions-Encoding, webgl-wind-Technik)
- RepaintScheduler-Architektur, AdaptiveQualityController (EMA-Smoothing, Warmup-Gating, asymmetrische Hysterese), FixedTimestepLoop
- Cloudflare R2 + PMTiles Tile-Pipeline, Netlify Functions
- Fusion-Forecast-Engine (Minimum-Variance/OI über DWD MOSMIX, GeoSphere AROME, INCA) mit Fusion⇄Native-Toggle
- Per-Country-Model-Switcher (DE/AT/CH)
- Browser-lokaler LLM-Meteorologe (WebLLM, Qwen2.5-3B, Web Worker)

## Die acht Features dieser Session

| # | Feature | Kern-Funktionalität | Mobile-Risiko |
|---|---------|--------------------|---------------|
| 1 | Wetterkarte | MapLibre-Hauptkarte, Layer-Steuerung, Model-Switcher DE/AT/CH, Fusion-Toggle, Windpartikel-Overlay | Hoch: Bedienelemente konkurrieren mit Karten-Gesten; GPU-Last |
| 2 | Regenradar | 6h-DACH-Nowcast (RADOLAN/SINFONY-Blend), Zeit-Scrubber/Timeline | Mittel: Timeline-Scrubbing mit dem Daumen; Frame-Preloading |
| 3 | Vorhersage | Punkt-Vorhersage, Modellvergleich, Konfidenz-Anzeige | Mittel: dichte Datenpanels, Tabellen/Charts auf 390 px |
| 4 | Tourenplanung | Route/Tour-Forecast, GPX-Upload, Abfahrtszeit-Optimierer | Hoch: mehrspaltiges Layout, Datei-Upload auf iOS, Karteninteraktion + Panel |
| 5 | Event-Planung | Best-Day-Planer für ortsfeste Anlässe | Niedrig–Mittel: Formulare, Datumswahl, Ergebnisliste |
| 6 | Historie | Historischer Klima-Explorer | Mittel: Charts, lange Zeitreihen, Zoom/Pan in Diagrammen |
| 7 | Atmosphäre | Linsen "Fliegen" / "Berg & Weg" / "Himmel", drei Progressive-Disclosure-Tiefen | Mittel: Disclosure-Ebenen brauchen mobiles Interaktionsmuster |
| 8 | 3D Globus | Three.js-Weltkugel, volumetrische Wolken | Sehr hoch: GPU/Thermik, Touch-Orbit-Controls, Speicher |

## Bekannte technische Randbedingungen (aus früheren Debugging-Sessions)
- Mobile GPUs: `EXT_color_buffer_float` häufig nicht verfügbar → Float-Render-Targets tabu, RGBA8-Packing ist der stabile Pfad. **Nicht anfassen.**
- `mediump` kollabiert auf realer Hardware (Präzisionsverlust bis hin zu invertierter Windrichtung auf iOS) → alle relevanten Shader tragen explizite `highp`-Deklarationen. Bei neuen/geänderten Shadern gleiches Muster.
- Software-Rendering (SwiftShader/Lavapipe) im Emulator ist für WebGL-Aussagen unbrauchbar → Chrome-DevTools-Emulation nur für Layout/Interaktion/Netz verlässlich, GPU-Verhalten braucht echtes Gerät.
- AdaptiveQualityController existiert und funktioniert — Mobile-Performance-Probleme zuerst über dessen Quality-Tiers lösen, nicht über neue Sonderpfade.

## Ziel dieser Session
Jede der acht Feature-Seiten soll auf dem iPhone 12 Pro:
1. **vollständig bedienbar** sein (alle Desktop-Funktionen erreichbar, Touch-Targets ≥ 44 px, keine Hover-Only-Interaktionen),
2. **visuell aufgeräumt** wirken (kein abgeschnittener Content, kein horizontales Scrollen, Safe-Area respektiert),
3. **flüssig laufen** (keine Long Tasks > 200 ms bei Standardinteraktionen, GPU-Features im angemessenen Quality-Tier).

Explizites Nicht-Ziel: neue Features, Redesign der Desktop-Ansicht, Änderungen an Datenpipelines oder der Fusion-Engine.

## Verifikations-Werkzeuge
- **Chrome DevTools MCP**: Device-Emulation (iPhone 12 Pro: 390×844, DPR 3, Touch), Screenshots, Console, Performance-Traces, Network.
- **scrcpy + ADB** (Android-Realgerät) für GPU-kritische Stichproben; iOS-Realgeräte-Check durch Jan manuell (Safari, iPhone).
- **Context7 MCP** für aktuelle MapLibre/Three.js-API-Referenzen bei Bedarf.

## Aktueller Stand (Stand 2026-07-08)

**Abgeschlossen:**
- **Phase 0 — Fundament & Baseline (G0 bestanden):** Emulation (iPhone 12 Pro 390×844 DPR 3) verifiziert, Breakpoint-Konvention 767/1024 bestätigt, `viewport-fit=cover` ergänzt, Baseline-Screenshots + Konsolen-Baseline aller 8 Features unter `audit/screenshots/baseline/`, geteilte Primitives unter `src/mobile/`. Details: `audit/phase0-fundament.md`.
- **Phase 1 — Wetterkarte (G1 bestanden):** Touch-Target-Fixes, half/full-Snap-Sheet, Landscape-Bug 844×390 behoben. Follow-up (§8): zwei getrennte Layer-/Modell-FABs + Karte auf obere 2/3 begrenzt. Details: `audit/wetterkarte.md`.

- **Phase 1-C — Wetterkarte Redesign „Variante C" (G1-C bestanden, 2026-07-08):** Von Jan aus drei Mockup-Varianten gewählt (`audit/mockups/`). Ein persistentes Bottom-Sheet mit Segment-Umschalter Layer·Modell·Vorhersage, drei Snap-Zustände (collapsed 64px / half 46vh / full 88vh), Karte vollflächig, transform-basierte Motion (CLS ≈ 0), Punkt-Vorhersage als drittes Segment integriert (Wrapper-Umzug, `useMediaQuery`-Weiche), CSS auf einen Mobile-Block konsolidiert. Führt die zwei FABs des §8-Follow-ups bewusst wieder zusammen — von Jan freigegeben, keine Regression. Details: `audit/wetterkarte.md` §9.

**Offene Phasen 2–8:** Regenradar, Vorhersage, Tourenplanung, Event-Planung (von Jan bewusst vorgezogen — getrennter Formular-Flow; Diagnose + Maßnahmenliste liegen vor, EventPage-Änderungen im Working Tree), Historie, Atmosphäre, 3D Globus. Reihenfolge ansonsten wie in `CLAUDE.md`.

**Arbeitsmodus:** Jan lässt zwischen grünen Gates ohne Rücksprache fortfahren; Commits erfolgen gesammelt durch Jan selbst.

## Session-Log
_(wird von Claude Code nach jeder Phase ergänzt — Datum, Phase, 3–5 Sätze Fazit, Link auf Audit-Datei und Screenshots. Historie der abgeschlossenen Phasen 0/1 steht in den jeweiligen `audit/`-Dateien und in `checklist.md`.)_

**2026-07-08 · Phase 1-C — Wetterkarte „Variante C" (G1-C bestanden).** Die Mobilansicht der 2D-Wetterkarte wurde auf ein einziges persistentes Bottom-Sheet mit Segment-Umschalter (Layer · Modell · Vorhersage) und drei Snap-Zuständen umgebaut; Karte wieder vollflächig, Timeline schwebt synchron über der Sheet-Oberkante, Snap-Motion komplett transform-basiert (CLS 0.002, kein Long Task > 200 ms, max. 103 ms). Der Punkt-Forecast ist per Wrapper-Umzug als drittes Segment integriert (Sub-Tabs Übersicht/Diagramme/Tabelle erhalten, Render-Ort per `useMediaQuery`-Weiche — nie doppelt gemountet). Nebenbefund aus der Diagnose behoben: Wind-Feinsteuerung und Satellit-Produktwahl im Sheet waren seit dem §8-Follow-up durch ein zu breites `display:none !important` unsichtbar (Preservation-Punkte 6+7) — jetzt korrekt gescopet und wieder bedienbar; zusätzlich sind die Kartenlegenden mobil erstmals als Kapsel sichtbar statt ausgeblendet. Alle 13 Preservation-Punkte einzeln verifiziert, Desktop pixelgleich, Landscape 844×390 intakt; Audit: `audit/wetterkarte.md` §9, Screenshots: `audit/screenshots/wetterkarte/c-vorher-*` / `c-nachher-*`. Real-Device-TODO für Jan: Safe-Area-Insets (collapsed-Höhe/Footer-Padding) auf echtem iPhone prüfen.
