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

## Session-Log
_(wird von Claude Code nach jeder Phase ergänzt — Datum, Phase, 3–5 Sätze Fazit, Link auf Audit-Datei und Screenshots)_

### 2026-07-08 — Phase 0 (Fundament & Baseline), Gate G0: bestanden
Emulation (Chrome DevTools MCP, iPhone 12 Pro 390×844 DPR 3) verifiziert; Breakpoint-Bestandsaufnahme ergab ~22 verstreute Ad-hoc-Werte, aber ein bereits sauberes 767/768–1024/1024px-Muster in `atmosphere.css`/`MapView.css` — als verbindliche Konvention bestätigt (deckt sich mit `CLAUDE.md`). Viewport-Meta fehlte `viewport-fit=cover` (nötig für echte Safe-Area-Insets auf iOS) — ergänzt. Baseline-Screenshots (mobil + Desktop 1440×900) und Konsolen-Baseline für alle 8 Features unter `audit/screenshots/baseline/` angelegt; ein vorbestehendes a11y-Konsolen-Issue auf 6/8 Seiten dokumentiert, damit spätere Phasen "neu" von "vorbestehend" unterscheiden können. Geteilte Mobile-Primitives (`BottomSheet`, `MobileToolbar`, Safe-Area-Utility, `useIsMobile`) unter `src/mobile/` angelegt und über die isolierte Testroute `#mobiletest` verifiziert, ohne bestehende Produktionsseiten zu berühren (`npm run typecheck` grün). Details, Konflikt-Check der sechs Dokumente und der Commit-Plan stehen in `audit/phase0-fundament.md`; Commits sind vorbereitet, aber noch nicht ausgeführt — warten auf Freigabe.

### 2026-07-08 — Phase 1 (Wetterkarte), Gate G1: bestanden
Diagnose ergab, dass MapView bereits ein vollwertiges mobiles Bottom-Sheet-/FAB-System hatte (Layer, Modell-Switcher, Punkt-Forecast) — die Hypothese in `plan.md` war überholt, die Maßnahmenliste wurde auf die tatsächlichen Lücken umgeschrieben: 23 Touch-Targets unter 44px (jetzt auf 4 begründete Footer-Attribution-Ausnahmen reduziert), `.map-sheet` war kein echtes Snap-Sheet (fix auf ~86vh mit blockierendem Vollflächen-Scrim) und ein Landscape-Bug bei 844×390 (Desktop-Rail-Overlap trotz nur 390px Höhe). Umgesetzt: Touch-Target-Fixes (scope-isoliert auf Sheet-Klassen), ein neues half(45vh)/full(86vh)-Snap-Sheet mit im half-Zustand weiterhin bedienbarer Karte (dokumentierte Abweichung von der 3-Stufen-Referenz — der dritte Zustand wird durch den bestehenden Layer-FAB abgedeckt), und eine erweiterte Mobile-Media-Query für kurze Querformat-Viewports. Alle 12 Layer + Regenradar-Toggle funktional verifiziert, Desktop-Screenshot pixelgleich zur Baseline, kein neuer Konsolenfehler, kein Long Task > 200ms; eine CLS-Beobachtung (vermutlich Testartefakt durch synthetische Pointer-Events) wurde als nicht-blockierendes Follow-up dokumentiert. User hat entschieden, ab jetzt ohne Rücksprache zwischen den Phasen fortzufahren, solange Gates grün bleiben; Commits erfolgen gesammelt am Ende durch den User selbst. Details in `audit/wetterkarte.md`.

### 2026-07-08 — Follow-up Wetterkarte (nach G1): getrennte Layer-/Modell-Buttons + Karte obere 2/3
Jan wollte statt des kombinierten FABs zwei separate, klar beschriftete Buttons für Layer und Modell sowie die Karte fest auf die oberen 2/3 des Viewports begrenzt. Diagnose zeigte, dass der Modell-Zugang bisher im Layer-Sheet versteckt war und die Karte per `inset:0` den kompletten Mobile-Viewport füllte. Umgesetzt: `mobileLayers`-Boolean zu `mobileSheet:'layer'|'model'|null` erweitert, zweiter FAB („Modell", mit Länderflagge) hinzugefügt, Sheet-Inhalt nach Modus verzweigt (Layer-Liste+Quellen vs. Land+ModelSwitcher+Quellen in eigenem Scroll-Container), `.map-container` in der mobilen Media-Query auf `height:66.6667vh` begrenzt und ein blickdichter Dock-Hintergrund fürs untere Drittel ergänzt — alles scope-isoliert in der bestehenden mobilen Media-Query, der vorhandene `ResizeObserver` übernimmt die MapLibre-Größenanpassung automatisch. Verify (Chrome DevTools MCP, iPhone 12 Pro + Landscape 844×390 + Desktop 1440×900): Karte exakt 66,67 % hoch, beide FABs ≥44px ohne Überlapp, alle 12 Layer und der komplette Modellkatalog weiterhin erreichbar, keine neuen Touch-Target- oder Konsolen-Regressionen, Desktop pixelgleich, Landscape-Fix aus Phase 1 bleibt intakt. Details in `audit/wetterkarte.md` §8.
