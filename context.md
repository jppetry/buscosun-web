# context.md — Session-Kontext: buscosun 2D-Wetterkarte (Desktop-Redesign)

## Projekt
buscosun.com ist eine DACH-fokussierte Wetter-Visualisierungsplattform.

**Stack:**
- React + Vite + TypeScript
- MapLibre GL JS (2D-Karten)
- Three.js, WebGL2 mit WebGPU-Pfad (3D Globus, volumetrische Wolken via Ray Marching)
- GPU-Ping-Pong-Windpartikel (RGBA8-packed Positions-Encoding, webgl-wind-Technik)
- RepaintScheduler-Architektur, FrameGovernor (Partikel-Dichte via EMA + Hysterese), FixedTimestepLoop
- Cloudflare R2 + PMTiles Tile-Pipeline, Netlify Functions
- Fusion-Forecast-Engine (Minimum-Variance/OI über DWD MOSMIX, GeoSphere AROME, INCA) mit Fusion⇄Native-Toggle
- Per-Country-Model-Switcher (DE/AT/CH)
- Browser-lokaler LLM-Meteorologe (WebLLM, Qwen2.5-3B, Web Worker)

## Aktuelles Vorhaben: Desktop-Redesign der 2D-Wetterkarte (Phase D1)

Nach den Mobile-Phasen wird jetzt die **Desktop-Ansicht** der 2D-Wetterkarte optisch und informationsarchitektonisch überarbeitet. Ziel: die heute ~6 frei über der Karte schwebenden Steuer-Cluster (Layer-Toggles, Modell-Rail, Wind-/Sat-Regler, Zeit-Slider, Legenden, Daten-Badge, Punkt-Vorhersage) werden in **drei bewusste Zonen** zusammengeführt:

- **Zone A (links) — „Ebenen & Modell":** alle 12 Layer gruppiert; der aktive Layer klappt seine Regler inline auf; Modell-Switcher (DE/AT/CH · Native⇄Fusion · Katalog · Radar) im Panel-Fuß.
- **Zone B (unten) — „Instrument-Ribbon" (Signatur):** vereint Vorhersage-Zeitachse + Trend-Verlauf am Punkt + **dauerhaft sichtbare Farblegende** des aktiven Layers. Das ist die zentrale Neuerung — „welche Farbe = welcher Wert" steckt heute nur im Hover.
- **Zone C (rechts) — „Punkt-Dossier":** Punkt-Vorhersage (PFC) mit Sub-Tabs, Warnungen, Vitals.

**Grundprinzip:** Informationsarchitektur ändern, **Marke und Funktion erhalten.** Kein Layer, keine Funktion, kein Datenpfad entfällt. Brand-Tokens (Sand/Cream/Ink + Terracotta/Steel/Sage) bleiben 1:1.

**Verbindliche Vorgabe:** `audit/mockups/wetterkarte-desktop-spec.md` (13 Abschnitte). **Visuelle Referenz:** `audit/mockups/wetterkarte-desktop.html`. Phase-Plan: `plan.md` (Phase D1). Gate: `checklist.md` (GD1).

**Auflage für die Umsetzung:** die `frontend-design`-Skill vor der visuellen Arbeit aufrufen und nach ihren Leitlinien arbeiten; die Instrument-Ribbon ist das Signatur-Element.

## Bekannte technische Randbedingungen (aus früheren Debugging-Sessions)
- Mobile GPUs: `EXT_color_buffer_float` häufig nicht verfügbar → RGBA8-Packing ist der stabile Pfad. **Nicht anfassen.**
- Alle relevanten Shader tragen explizite `highp`-Deklarationen (`mediump` kollabiert auf realer Hardware). Nicht ändern.
- Chrome-DevTools-Emulation ist für Layout/Interaktion/Netz verlässlich, für GPU-Verhalten **nicht** repräsentativ (Real-Device nötig).
- Perf-Tuning läuft über den FrameGovernor (Partikel-Dichte) und die vorhandenen Config-Knöpfe — keine neuen Sonderpfade. Es gibt keinen separaten AdaptiveQualityController im 2D-Pfad.

## Achsen-Inversion ggü. den Mobile-Phasen (wichtig)
Bisher war **Desktop eingefroren** und Mobile wurde geändert. Jetzt ist es **umgekehrt:** Desktop wird redesignt, die **Mobile-Ansicht (`@media max-width:767px` / Landscape) bleibt pixel- und funktionsgleich** und ist die neue „nicht regredieren"-Seite. Die Phase-1-C-Mobilarbeit (persistentes Bottom-Sheet, Segment-Switcher Layer·Modell·Vorhersage, drei Snap-Zustände) darf nicht beschädigt werden — sie ist die Mobile-Regressions-Baseline.

## Was auf Mobile bereits steht (nicht regredieren)
- **Phase 0 (G0):** Emulation iPhone 12 Pro verifiziert, Breakpoints (767/1024), `viewport-fit=cover`, Baselines, geteilte Primitives unter `src/mobile/`. Details: `audit/phase0-fundament.md`.
- **Phase 1 + 1-C (G1, G1-C):** Mobile 2D-Karte auf ein persistentes Bottom-Sheet mit Segment-Umschalter und drei Snap-Zuständen umgebaut; Timeline im Mockup-Stil; Legenden als Kapsel sichtbar; PFC als drittes Segment. Details: `audit/wetterkarte.md`.
- (Nebengleis) Diagnose-/Prompt-Dateien für spätere Mobile-Optimierungen: `audit/loading-optimization.md` + `prompt-loading.md` (Ladeoptimierung), `audit/performance-2d.md` (Rendering-Perf). Nicht Teil von Phase D1.

## Infrastruktur-Strang: Wind-Transport / Caching (Phase T1)

Parallel zu den Desktop-Redesign-Phasen (D1/R1) ein **reiner Transport-/Datenschicht-Umbau** — kein UI, keine Fusion, kein Shader. Anlass ist ein Netzwerk-Befund am Wind-Layer der 2D-Karte.

**Befund (Ist-Zustand).** Beim Kartenaufruf zieht der Client die rohen ICON-D2-GRIB-Dateien (`.grib2.bz2`, ~1,1 MB/Datei) **live** über den `/_dwd_opendata`-Rewrite (Netlify/`vite.config.ts`) direkt vom DWD-Fileserver. Ein Wind-Load = 5 Vorlauf-Schritte (0–4 h, naher Horizont) × 2 Komponenten (`u_10m` + `v_10m`) = **10 Requests**. Gemessener Trace (2026-07-12, 09z-Lauf): 1 Cache-Hit in 314 ms, die anderen 9 in ~5000–5230 ms. Die ~5 s sind **origin-gebunden** (HTTP/2-multiplexed auf einen Origin, DWD ist der Flaschenhals), nicht Bandbreite. Drei Kernprobleme: (1) DWD zur Request-Zeit auf dem kritischen Pfad → Latenz unkontrollierbar; (2) kein geteilter Cache — jeder Besucher fetcht neu; (3) zusätzlich Client-Decode (bz2 + GRIB, je off-main in Worker-Pools — kein Main-Thread-Jank, aber CPU/Akku auf Mobile).

**Wichtig — was schon existiert (nicht als Versäumnis fehldeuten):** Der Wind-Loader (`src/wind/iconD2WindSource.ts`) lädt bereits **gestaffelt** (naher Horizont kritisch, ferner im Hintergrund), **spekulativ** (erste Steps parallel zur Lauf-Auflösung) und hält einen **IndexedDB-„jetzt"-Cache** für Sofort-Erstpaint. Die 5-s-Wand ist damit primär ein **Kaltstart-/Cross-User-Problem**, für wiederkehrende Besucher ist der erste Frame schon schnell.

**Gewählter Ansatz (T1) — Precompute NICHT nötig, um die 5 s zu killen.** Die Wand stirbt schon eine Stufe früher, mit vernachlässigbarem Risiko und ohne Eingriff in Decode/`buildWindRgba`/`blendWindFrames`:
- **T1.1 Caching-Proxy:** `/_dwd_opendata` (für Wind) durch eine **Netlify Edge Function** ersetzen, die DWD server-seitig holt und die **immutablen** per-(Lauf,Step)-Dateien edge-cached (`Netlify-CDN-Cache-Control: public, durable, immutable`). Dateinamen tragen Lauf+Step → natürlich cache-korrekt und unveränderlich.
- **T1.2 Warm-Cron:** eine **GitHub Action** pollt DWD (~alle 10–15 min), erkennt den neuesten **vollständigen** Lauf, `curl`t die URLs durch den Proxy (füllt den Cache), und legt **erst danach** ein `latest-wind.json` um. Kein eccodes, kein Decode — nur Cache-Wärmen.
- **T1.3 Manifest-Gate im Client:** `resolveLatestRun` liest `latest-wind.json` statt das DWD-Verzeichnis zu scannen. Dadurch (a) kann der Client **nur bereits gewärmte Läufe** anfragen (Entdeckungs-Rennen strukturell weg → praktisch **kein** Besucher trifft die 5 s) und (b) entfällt die **~1,9 s Directory-Auflösung** vom kritischen Pfad.

**Graceful degrade:** Fällt der Warmer aus (DWD down / GitHub-Schedule 60-Tage-Deaktivierung), rückt das Manifest nicht weiter → der Client serviert den **letzten gewärmten Lauf**: etwas älterer Wind, aber ~150 ms, **nie kalt**. Worst Case = *stale*, nie *slow*. Alert auf Manifest-Alter.

**Bewusst zurückgestellt (mess-gegatet, NICHT Teil von T1):** der **RG8-WebP-Ingest** (u+v → ein lossless-WebP + per-Frame-Norm-Sidecar + atomarer Publish; 1,1 MB → ~150 KB, kein Client-bz2/GRIB mehr). Erst bauen, wenn eine Messung **auf echtem iPhone nach T1** zeigt, dass Payload/Decode noch spürbar hakt. Präzision ist dabei unkritisch (Quell-Frames sind heute schon 8-bit RG; per-Frame-Norm ⇒ ~0,14 m/s/Stufe, unter Modell-Skill) — die einzige echte Falle wäre *lossy* WebP.

**Scope-Ehrlichkeit:** T1 fixt **nur den Wind-Layer**. Der `/_dwd_opendata`-Proxy bleibt für Radar (RADOLAN, 5-min-Takt — für ein 3h-/Manifest-Muster ungeeignet) und weitere DWD-Quellen. Der Proxy **schrumpft**, verschwindet nicht.

**Arbeitsweise:** **erst lokal** mit `netlify dev` (Edge Function + Client + Warmer-Logik) auf **Korrektheit** verifizieren, **dann** auf Netlify deployen für die reale Durable-Cache-/Latenz-Wirkung und die GitHub-Action. Details: `plan.md` (Phase T1), Gate `checklist.md` (GT1), Protokoll `tests.md` (V-WIND-TRANSPORT), Diagnose-Ablage `audit/wind-transport.md` (bei Kickoff aus diesem Befund + frischer Messung).

## Verifikations-Werkzeuge
- **Chrome DevTools MCP**: Desktop-Profil (≥1440×900, plus 1280×800 / 1680×1050 Stichprobe) für Phase D1; iPhone-12-Pro-Emulation (390×844, DPR 3) für die Mobile-Regressionsprüfung.
- **Context7 MCP** für aktuelle MapLibre/React-API-Referenzen bei Bedarf.

## Arbeitsmodus
Jan lässt zwischen grünen Gates ohne Rücksprache fortfahren; Commits erfolgen gesammelt durch Jan selbst. Doku Deutsch, Code/Commits Englisch.

## Session-Log

### 2026-07-18 — Phase T1 LOKAL umgesetzt + verifiziert (Wind-Transport / Caching, Gate GT1 lokal)
Der Transport-Umbau ist **local-first gebaut und grün** — Netlify-Deploy + Cron bewusst zurückgestellt. **T1.0** Diagnose (`audit/wind-transport.md`): frische Kalt-Baseline bestätigt den Befund und deckte zwei Hebel auf — Directory-Listing **1271 ms** auf dem kritischen Pfad **und** ein spekulativer Lauf-Fehlrat (06z geraten, 09z real) → **6 verschwendete ~1,05-MB-Fetches** pro Kaltload. **T1.1** Edge Function `netlify/edge-functions/dwd-wind.ts` auf **additivem** Pfad `/_dwd_wind/*` (netlify.toml/Radar-Rewrite unangetastet; Datei-basierte `config.path`): Bytes bewiesen **SHA-256-identisch** zum Direkt-DWD-Fetch, Header `public, durable, immutable`, Fehler `no-store`, Anti-Open-Proxy (`scripts/verify-wind-transport.mjs`, Node-Handler-Test ohne Netlify-CLI). **T1.2** Warmer `scripts/warm-wind.mjs`: poll→warm-durch-Proxy→atomar `latest-wind.json`; idempotent (Early-Exit), fail-safe (`FAIL_STEP`/DWD-down → Manifest bleibt letzter guter Lauf). YAML `audit/warm-wind.workflow.yml` **INAKTIV** (außerhalb `.github/workflows/`). **T1.3** Client: neue `resolveWindRunFromManifest` in `iconD2WindSource.ts` liest `/latest-wind.json`, Wind-Bytes über `/_dwd_wind` (optionaler `base`-Param an `fetchStepBytes`, Precip/Clouds unberührt); Fallback auf Directory-Scan wenn kein Manifest. **Effekt gemessen (Chrome DevTools MCP):** 26/26 Wind-Steps via `/_dwd_wind`, **0** via `/_dwd_opendata`, **0** Directory-Listings, **0** spekulative Fehl-Fetches, Manifest-Fetch **3 ms** statt 1271 ms; Wind rendert visuell identisch, Scrub ohne neue Requests, Konsole sauber, Typecheck grün. **Output-Gleichheit gewahrt** (Byte-Identität + unveränderter `buildWindRgba`/`blendWindFrames`/Norm/Shader-/IDB-Pfad). **`netlify dev`-Integration nachgezogen** (Jans Freigabe): netlify-cli 26.2.0 global installiert, Edge Function „Loaded", `/_dwd_wind` auf :8888 mit `server: Netlify` + `netlify-cdn-cache-control: durable, immutable`, Bytes SHA-256-identisch, Wind 26/26 via Edge, Konsole sauber (§F.8) — Routing/Bytes/Header bewiesen, Latenz weiter Deploy-Sache. Offen (Jans Gate): Netlify-**Deploy** (braucht `netlify login`; Durable Cache-Miss→Hit/Latenz), Cron scharfschalten, Prod-Manifest-Persistenz (Commit-back vs. Blobs). Belege: `checklist.md` GT1 (lokale Kästen), `audit/wind-transport.md` §A–§G.

### 2026-07-18 — Phase T1 vorbereitet (Wind-Transport / Caching, Gate GT1)
Neuer Infrastruktur-Strang aufgesetzt, ausgelöst durch den Netzwerk-Befund am Wind-Layer (10 Live-DWD-Requests, ~5 s origin-gebunden). Die sieben Session-Doku-Dateien (`context/plan/checklist/tests/prompt/mobile-design-guidelines/CLAUDE`) wurden **auf den Umbau vorbereitet — noch keine Implementierung.** Entschieden: **Caching-Proxy (Netlify Edge Function, durable/immutable) + Warm-Cron (GitHub Action, poll→warm→`latest-wind.json`) + Manifest-Gate im Client** — killt die 5 s ohne Precompute, ohne Decode-/Fusion-Eingriff, mit graceful degrade (stale statt slow). RG8-WebP-Ingest bewusst **mess-gegatet zurückgestellt** (erst nach Real-iPhone-Messung post-T1). Vorgehen **local-first (`netlify dev`) → Netlify**. Scope ehrlich: nur Wind; Proxy bleibt für Radar/übrige DWD-Quellen. Offen: Diagnose in `audit/wind-transport.md` bei Kickoff festhalten (Trace-Beleg liegt vor), dann T1.1 beginnen.

### 2026-07-10 — Phase D1 (Wetterkarte Desktop-Redesign, Gate GD1)
Die ~6 schwebenden Desktop-Cluster wurden in drei Zonen zusammengeführt: **Zone A** `.wx-panel` (12 Layer visuell gruppiert, aktiver Layer klappt Wind-/Sat-Regler + Skala-Vorschau inline auf, ModelSwitcher + Quellen-Fuß unten im Panel), **Zone C** `.wx-dossier` (bestehende PFC via `display:contents` unverändert eingedockt), **Zone B** `.wx-ribbon` — das Signatur-Element: Trend-Sparkline am Punkt + Zeitachse (State/RAF unverändert) + **dauerhaft sichtbare Live-Legende** des aktiven Layers mit Cursor-Bubble am Punktwert. Legenden-SSoT = neue Registry `src/map/legendModel.ts` aus den echten Render-Rampen (Ramps nach `src/scalar/mapRamps.ts` ausgelagert, `defaultColorRamp` aus WindLayer exportiert); Sparkline speist sich additiv per `onData`-Callback aus den PFC-Daten (kein zweiter Fetch). Alle Zonen rendern nur `!isMobileMap` + CSS `@media (min-width:768px)`; **Mobile (Phase-1-C-Sheet) ist byte-identisch und live als nicht-regrediert bestätigt.** Perf: Timeline-Scrub max 149 ms, Idle 0 Long Tasks, CLS 0.00; die > 200 ms-Blocks bei datenladenden Layer-Wechseln sind die vorbestehende GRIB-Decode-Pipeline (D2-Scope), kein D1-Regress. Details/Belege: `audit/wetterkarte-desktop.md` (§A–§F), Screenshots unter `audit/screenshots/wetterkarte-desktop/`. Offen: IBM Plex Mono bewusst als System-Mono-Stack (tracker-frei); inerte Alt-CSS konservativ belassen; Commit durch Jan.
