# checklist.md — Gates & Fortschritt

Regel: Ein Kästchen wird nur mit Beleg abgehakt (Screenshot-Pfad, Trace-Datei oder Konsolen-Auszug in `audit/` referenzieren). Nächste Phase erst nach vollständigem Gate.

Aktueller Fokus: **Desktop-Redesign der 2D-Wetterkarte (Phase D1 / Gate GD1).** Die Mobile-Gates G0/G1/G1-C sind bestanden und bilden die Nicht-Regressions-Baseline (Historie in `plan.md` und den `audit/`-Dateien).

## Phase D1 — Wetterkarte Desktop-Redesign (GD1) · AKTIV
Maßgebliche Vorgabe: `audit/mockups/wetterkarte-desktop-spec.md`. Visuelle Referenz: `audit/mockups/wetterkarte-desktop.html`. Auflage: `frontend-design`-Skill vor der visuellen Umsetzung aufrufen.

- [x] `frontend-design`-Skill aufgerufen und Design-Leitlinien angewandt (Signatur = Instrument-Ribbon; Marke = Brief; Instrument-Mono-Typografie `--font-mono`)
- [x] Diagnose in `audit/wetterkarte-desktop.md` abgeschlossen: Ist-Code-Mapping (Spec §1) gegen echten Code verifiziert (eine Korrektur: `.sat-product-switch` liegt im `.left-rails`) + 12 Preservation-Punkte + Baseline-Screenshots vor jeder Code-Änderung
- [x] Zone A „Ebenen & Modell": 12 Layer gruppiert schaltbar, aktiver Layer klappt Inline-Regler auf (Wind-Feinsteuerung + Sat-Produktwahl 1:1 umgezogen) — `after-desktop-1440-zoneA-controls.png`
- [x] Zone A: ModelSwitcher DE/AT/CH + Native/Fusion + Katalog + Radar-Toggle voll funktionsfähig im Panel-Fuß (Fusion-Logik unangetastet, nur verschoben)
- [x] Zone B „Instrument-Ribbon": Zeitachse funktionsfähig (State `forecastHour` + `scheduleForecastHour` + RAF **unverändert**), ganzer Bereich scrubbar, `<input>` für Tastatur erhalten
- [x] Zone B: persistente Live-Legende sichtbar (Rampen-Registry `map/legendModel` aus ScalarLayer/RainLayer/mapRamps/WindLayer) + Cursor-Bubble am Punktwert; 4 Spezial-Legenden als Ribbon-Note + volltext im Hover-`LayerInfoPanel` → **kein Legenden-Verlust**
- [x] Zone B: Trend-Sparkline am Punkt (an PFC-Daten via additivem `onData`-Callback, **kein neuer Fetch**), Min/Max/Aktuell-Marker
- [x] Zone C „Punkt-Dossier": PFC vollständig integriert (`display:contents`-Hülle, Komponente unverändert), Sub-Tabs/Warnungen/Vitals — kein Informationsverlust
- [x] Daten-/Quellen-Badge (Land · Modell · Stand) im Zone-A-Fuß erhalten; Zurück/Ort + Karten-Zoom (Gesten) funktionsfähig
- [x] Windpartikel rendern unverändert (kein Shader-/WindLayer-/Fusion-Eingriff; nur `defaultColorRamp` additiv exportiert für die Legende)
- [x] Transform-basierte Motion (**CLS 0.00** im Trace), `prefers-reduced-motion` respektiert, **keine neue Dauer-Repaint-Schleife** (Idle 0 Long Tasks)
- [x] CSS desktop-gescopet (`@media (min-width:768px)`, neue `.wx-*`-Klassen), Mobile-Media-Query **unangetastet**; inerte Altregeln konservativ belassen (matchen kein DOM mehr) — optionaler Cleanup später
- [x] **Mobile-Regression** 390×844 DPR 3: `after-mobile-390-temp.png` = `before-mobile-390-temp.png`; Sheet öffnet, Segmente Layer/Modell/Vorhersage, Snap funktionieren
- [~] Desktop-Performance-Trace: **Timeline-Scrub max 149 ms (0 > 200 ms), Idle 0 Long Tasks, CLS 0.00** ✓ · **Layer-Load-Decode bis ~548 ms = vorbestehende GRIB-Pipeline (kein D1-Regress, D2-Scope)** — ehrlich vermerkt in `audit/wetterkarte-desktop.md` §E/§F
- [x] Selbstverifikations-Fragen 1–5 (CLAUDE.md) schriftlich mit Beleg — `audit/wetterkarte-desktop.md` §E
- [x] Vorher/Nachher-Screenshots (Desktop 1280/1440/1680 + Mobile 390) unter `audit/screenshots/wetterkarte-desktop/`
- [x] Konsole frei von neuen Errors/Warnings (einziger 404 = vorbestehende externe Daten-Frame-Verfügbarkeit)

## Phase T1 — Wind-Transport: Caching-Proxy + Manifest-Warm (GT1) · VORBEREITET
Transport-/Datenschicht-Umbau (kein UI/Fusion/Shader/Decode). Vorgabe: `plan.md` (Phase T1), Diagnose `audit/wind-transport.md`, Protokoll `tests.md` (V-WIND-TRANSPORT). **Local-first (`netlify dev`) → Netlify.** Belegregel gilt (Header-Auszug, Trace, Screenshot, Konsolen-Log).

**Diagnose & Baseline**
- [x] T1.0: Befund + Trace-Beleg (10 Live-Requests, ~5 s origin-gebunden, bestehende Client-Mitigationen) in `audit/wind-transport.md`; frische Kalt-Baseline-Messung (Netzwerk-Tab) — §A/§B; **Neu-Befund:** spekulativer Lauf-Rat ging daneben (06z geraten, 09z real) → 6 verschwendete ~1,05-MB-Fetches; Directory-Listing 1271 ms lokal auf kritischem Pfad. Screenshot `before/baseline-wind-1440.png`
- [x] Bestätigt: `buildWindRgba` / `blendWindFrames` / per-Frame-Norm / Shader werden in T1 **nicht** angefasst (nur Transport) — `audit/wind-transport.md` §D

**T1.1 — Caching-Proxy (Netlify Edge Function)** — lokal (Node-Handler-Test + Vite-Dev)
- [x] Edge Function `netlify/edge-functions/dwd-wind.ts` frontet Wind über **additiven** Pfad `/_dwd_wind/*` (DWD server-seitig gefetcht); `/_dwd_opendata` bleibt für Radar unverändert (netlify.toml unangetastet, Datei-basierte `config.path`)
- [x] Ausgelieferte Bytes **identisch** zum Direkt-Fetch — `scripts/verify-wind-transport.mjs`: Länge 1.062.522==1.062.522, **SHA-256 identisch** (§F.1)
- [x] `Netlify-CDN-Cache-Control: public, durable, max-age=21600, immutable` gesetzt; Cache-Key = URL (Lauf+Step); Fehler → `no-store` (§F.2)
- [x] Wind-Layer lädt lokal über den Pfad unverändert (26/26 Frames, Slider scrubbar) — §F.3/F.4
- [x] Unter echtem **`netlify dev`** gefahren (netlify-cli 26.2.0 global installiert): „Loaded edge function dwd-wind", `/_dwd_wind` auf :8888 → `server: Netlify` + `netlify-cdn-cache-control: public, durable, immutable`, Bytes **SHA-256-identisch**, Wind lädt 26/26 via Edge Function, Manifest-Gate greift, Konsole sauber — §F.8

**T1.2 — Warm-Cron (Skript + INAKTIVES YAML)**
- [x] `scripts/warm-wind.mjs` pollt DWD, erkennt neuesten **vollständigen** Lauf; Early-Exit wenn Manifest aktuell (§F.5, Lauf #2)
- [x] Warmt alle Wind-URLs **durch den Proxy** (`SITE_URL/_dwd_wind`, Cache-Fill), **dann** `latest-wind.json` umlegen (atomar temp+rename, zuletzt)
- [x] Idempotenz: #2 ohne neuen Lauf = No-op; simulierter Fehllauf (#3 `FAIL_STEP`, #4 DWD down) → Manifest bleibt letzter guter Lauf, heilt nächsten Tick (§F.5)
- [x] Manifest-Alter überwachbar: `updatedAt`-Feld im Manifest (Alarm-Verdrahtung deploy-seitig)
- [x] YAML `audit/warm-wind.workflow.yml` **INAKTIV** (außerhalb `.github/workflows/`), Aktivierung dokumentiert = STOPP&FRAGEN

**T1.3 — Manifest-Gate im Client**
- [x] Wind-Lauf-Auflösung liest `/latest-wind.json` (neu `resolveWindRunFromManifest` in `iconD2WindSource.ts`) statt DWD-Verzeichnis; restlicher Loader (fetchStepBytes/Decode/Blend/Norm) unverändert; **Fallback** auf Directory-Scan wenn kein Manifest
- [x] Client fragt **nur** manifestierten Lauf an → **{2026071809: 26}**, **0** spekulative 06z-Fetches (§F.4)
- [x] ~1,9-s-Directory-Auflösung entfernt: **0** Directory-Listings, stattdessen `/latest-wind.json` **3 ms** (Baseline 1271 ms) — Netzwerk-Trace §F.4

**Deploy & Netlify-Verifikation** — _bewusst zurückgestellt (nächster Run, Jans Gate — §G)_
- [ ] Auf Netlify deployt; Durable-Cache **Miss→Hit** belegt (erster Fetch füllt, folgende ~150 ms — Header/Timing)
- [ ] Cross-Request-Warm: zweiter „Besucher" (anderer Request/Session) trifft warmen Cache
- [ ] Warm-Cron scharf; nach Lauf ist der Cache **vor** dem ersten echten Besucher gefüllt
- [ ] **Graceful degrade** auf Netlify geprüft: Manifest eingefroren → letzter Lauf wird serviert (stale, nicht kalt) _(Logik lokal bereits belegt, §F.5)_

**Funktionserhalt & Gate**
- [x] Windpartikel **numerisch/visuell identisch** zur Baseline (Byte-Identität + gleicher Lauf/Steps + unveränderter Frame-Pfad + Screenshot-Abgleich) — §E.2
- [x] Zeit-Interpolation/Scrubbing unverändert (`blendWindFrames`-Pfad unberührt; Scrub ohne neue Netz-Requests) — §F.6
- [x] Konsole frei von neuen Errors/Warnings; keine CORS-Regression (same-origin `/_dwd_wind`) — §F, §E.4
- [x] Selbstverifikations-Fragen 1–5 (CLAUDE.md, sinngemäß auf Transport) schriftlich in `audit/wind-transport.md` §E

## Bestanden (Mobile-Baseline)
- [x] Phase 0 — Fundament (G0) — `audit/phase0-fundament.md`
- [x] Phase 1 — Wetterkarte Mobile (G1) — `audit/wetterkarte.md`
- [x] Phase 1-C — Wetterkarte Mobile-Redesign „Variante C" (G1-C) — `audit/wetterkarte.md` §9; Spec `audit/mockups/wetterkarte-c-spec.md`

## Rückgestellt (nach GD1 bzw. nach Jans Umpriorisierung)
- [ ] D2 — Desktop-Performance/Rendering (`prompt-performance.md`, `audit/performance-2d.md`)
- [ ] D3 — Lade-/Cache-Optimierung (`prompt-loading.md`, `audit/loading-optimization.md`) — T1 ist die erste konkrete Ausprägung
- [ ] Stufe 1 (mess-gegatet, NICHT T1): RG8-WebP-Ingest — nur nach Real-iPhone-Messung post-T1 (lossless WebP + per-Frame-Norm-Sidecar + atomarer Publish)
- [ ] Mobile-Roadmap Rest: Regenradar, Vorhersage, Tourenplanung, Event, Historie, Atmosphäre, 3D Globus
