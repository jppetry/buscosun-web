# checklist.md — Gates & Fortschritt

Regel: Ein Kästchen wird nur mit Beleg abgehakt (Screenshot-Pfad, Trace-Datei oder Konsolen-Auszug in `audit/` referenzieren). Nächste Phase erst nach vollständigem Gate.

## Phase 0 — Fundament (G0)
- [x] Chrome DevTools MCP: iPhone-12-Pro-Emulation (390×844, DPR 3, Touch) verifiziert — `audit/screenshots/baseline/emulation-test-searchpage-mobile.png`, Details in `audit/phase0-fundament.md` §2
- [x] Breakpoint-Bestandsaufnahme dokumentiert, Konvention festgelegt (`max-width:767px` mobil / 768–1024px Tablet / >1024px Desktop) — `audit/phase0-fundament.md` §3
- [x] Viewport-Meta geprüft (`viewport-fit=cover`, kein `user-scalable=no`) — Befund: `viewport-fit=cover` fehlte, ergänzt in `index.html`; `audit/phase0-fundament.md` §4
- [x] Baseline-Screenshots mobil: alle 8 Seiten in `audit/screenshots/baseline/<feature>/mobile.png`
- [x] Baseline-Screenshots Desktop (1440×900): alle 8 Seiten in `audit/screenshots/baseline/<feature>/desktop.png`
- [x] Konsolen-Baseline pro Seite dokumentiert — `audit/phase0-fundament.md` §6 (vorbestehendes a11y-Issue auf 6/8 Seiten dokumentiert, keine Errors)
- [x] BottomSheet-, MobileToolbar-, Safe-Area-Primitives angelegt und sichtbar testbar — `src/mobile/*`, Testroute `#mobiletest`, Screenshots `mobile-primitives-test*.png`
- [x] Kein Eingriff ins Produktions-Layout erfolgt — nur additive Dateien/Route, `npm run typecheck` grün; `audit/phase0-fundament.md` §8

## Phase 1 — Wetterkarte (G1)
- [x] Diagnose in `audit/wetterkarte.md` abgeschlossen (vor jeder Code-Änderung)
- [x] Alle Layer auf Mobile schaltbar — 12/12 per Skript verifiziert, `audit/wetterkarte.md` §5 Punkt 6
- [x] Model-Switcher DE/AT/CH voll funktionsfähig — unverändert funktional, Touch-Targets vergrößert
- [x] Fusion⇄Native-Toggle voll funktionsfähig (inkl. Fallback-Verhalten) — nicht angefasst, `ms-offline`-Fallback intakt
- [x] Legenden erreichbar und lesbar — unverändert (conditional `.map-legends`, kein Eingriff)
- [x] Windpartikel: konservativer Quality-Tier auf Mobile aktiv, keine Shader-Änderung — WindLayer/Shader nicht berührt
- [x] Gesten: Karte vs. Sheet/Controls konfliktfrei — Sheet jetzt mit half/full-Snap, Karte im half-Zustand interaktiv (Scrim `pointer-events:none`)
- [x] Touch-Targets ≥ 44 px (Audit-Liste) — 23→4 begründete Ausnahmen (Footer-Attribution), `audit/wetterkarte.md` §3.1/§5
- [x] Selbstverifikations-Fragen 1–5 (CLAUDE.md) schriftlich mit Beleg beantwortet — `audit/wetterkarte.md` §6
- [x] Desktop-Screenshot-Diff: unverändert — `verify-desktop-after.png` vs. Baseline
- [x] Vorher/Nachher-Screenshots abgelegt — `audit/screenshots/wetterkarte/`
- [x] Zusatzfund behoben: Landscape 844×390 Overlap-Bug (nicht in ursprünglicher Checkliste, aus V-ALL Schritt 9 aufgedeckt), `audit/wetterkarte.md` §3.3/§4.3
- [x] Follow-up (2026-07-08, nach G1): Getrennte Layer-/Modell-FABs statt kombiniertem FAB + Karte fest auf obere 2/3 des Viewports begrenzt (Control-Dock im unteren Drittel) — `audit/wetterkarte.md` §8, Desktop/Landscape-Regression erneut geprüft (grün)

## Phase 1-C — Wetterkarte Redesign „Variante C" (G1-C)
Maßgebliche Vorgabe: `audit/mockups/wetterkarte-c-spec.md`. Visuelle Referenz: `audit/mockups/wetterkarte-c-detail.html` (Zustände Z1–Z5) + `audit/mockups/wetterkarte-mobile.html` (A/B/C-Vergleich). Bewusste Abweichung vom §8-Follow-up (zwei getrennte FABs → ein Sheet mit Segment-Switcher Layer·Modell·Vorhersage), von Jan durch Wahl der Variante C freigegeben.
- [x] Diagnose in `audit/wetterkarte.md` gegen Spec abgeschlossen (Ist-Code-Mapping §1, vor jeder Code-Änderung) — `audit/wetterkarte.md` §9.1–§9.4 inkl. Diagnose-Fund: Wind-/Sat-Steuerung im Sheet war im Ist verdeckt gebrochen (§9.2.6)
- [x] Alle 13 Preservation-Punkte (Spec §12) einzeln geprüft und erhalten — §9.6 Punkt 3 + §9.7 Frage 1 (12/12 Layer-Toggles skriptverifiziert, Rest einzeln ausgelöst; Punkte 6+7 durch den Umbau sogar repariert)
- [x] Drei Snap-Zustände (`collapsed`/`half`/`full`) + Segment-Wechsel (`layer`/`model`/`fc`) funktionsfähig (Spec §2/§3) — §9.6 Punkt 9, Screenshots Z1–Z5
- [x] Layer-Segment: alle 12 Layer + Wind-Detailsteuerung (Aus/Normal/Intensiv, Dichte, Höhe) schaltbar (Spec §7) — §9.6 Punkt 3, `c-nachher-z3-full-wind.png`
- [x] Modell-Segment: DE/AT/CH + Native/Fusion + Katalog + Radar-Toggle voll funktionsfähig (Spec §8) — §9.6 Punkt 3, `c-nachher-z4-half-model.png`
- [x] Vorhersage-Segment: Punkt-Vorhersage (PFC) vollständig integriert, kein Informationsverlust ggü. Desktop (Spec §9, preservation-kritisch) — Wrapper-Umzug, Sub-Tabs Übersicht/Diagramme/Tabelle skriptverifiziert, `c-nachher-z5-half-fc.png`
- [x] Transform-basierte Sheet-Motion (`translateY`, nicht `max-height`), CLS ≈ 0 (Spec §10) — CLS 0.002 (auch Timeline auf transform umgestellt), kein Long Task > 200 ms; §9.6 Punkt 5
- [x] CSS konsolidiert: tote `.left-rails`-Regeln + doppelte Media-Queries bereinigt (Spec §11) — ein Mobile-Block, Dock/FAB/PFC-Mobil-Altregeln entfernt; §9.5 Punkt 6
- [x] Touch-Targets ≥ 44 px im gesamten neuen Sheet (Spec §13) — nur die 4 bekannten Attribution-Ausnahmen; §9.6 Punkt 1
- [x] Selbstverifikations-Fragen 1–5 (CLAUDE.md) schriftlich mit Beleg beantwortet — §9.7
- [x] Desktop-Screenshot-Diff: pixelgleich zur Baseline — `c-verify-desktop-after.png` vs. `c-baseline-desktop-location.png`; §9.6 Punkt 6
- [x] Vorher/Nachher-Screenshots aller 5 Zustände (Z1–Z5) unter `audit/screenshots/wetterkarte/` — `c-vorher-*` (5) + `c-nachher-z1…z5` + Overview/Landscape

## Phase 2 — Regenradar (G2)
- [ ] Diagnose in `audit/regenradar.md` abgeschlossen
- [ ] Scrubber daumentauglich (≥ 44 px, volle Breite)
- [ ] Alle Zeitschritte erreichbar, Play/Pause funktioniert
- [ ] Scrubbing ohne Stottern (Performance-Trace als Beleg)
- [ ] Touch-Targets ≥ 44 px
- [ ] Selbstverifikation 1–5 beantwortet
- [ ] Desktop-Diff unverändert, Screenshots abgelegt

## Phase 3 — Vorhersage (G3)
- [ ] Diagnose in `audit/vorhersage.md` abgeschlossen
- [ ] Alle Parameter/Panels ohne horizontales Seiten-Scrollen erreichbar
- [ ] Modellvergleich vollständig nutzbar
- [ ] Konfidenz-Anzeigen erhalten und lesbar
- [ ] Chart-Details per Tap (keine Hover-Only-Infos)
- [ ] Selbstverifikation 1–5 beantwortet
- [ ] Desktop-Diff unverändert, Screenshots abgelegt

## Phase 4 — Tourenplanung (G4)
- [ ] Diagnose in `audit/tourenplanung.md` abgeschlossen
- [ ] GPX-Upload in Emulation funktionsfähig; Real-iOS-Check als TODO an Jan notiert
- [ ] Karte + Tour-Details gleichzeitig nutzbar (Sheet-Pattern)
- [ ] Abfahrtszeit-Optimierer voll bedienbar
- [ ] Wegpunkt-/Segmentinfos vollständig erreichbar
- [ ] Selbstverifikation 1–5 beantwortet
- [ ] Desktop-Diff unverändert, Screenshots abgelegt

## Phase 5 — Event-Planung (G5)
- [ ] Diagnose in `audit/event.md` abgeschlossen
- [ ] Formulare ohne iOS-Auto-Zoom (font-size ≥ 16 px) und mit passenden inputmodes
- [ ] Kompletter Flow Eingabe → Best-Day-Ergebnis durchführbar
- [ ] Ergebnisdarstellung vollständig (kein Informationsverlust ggü. Desktop)
- [ ] Selbstverifikation 1–5 beantwortet
- [ ] Desktop-Diff unverändert, Screenshots abgelegt

## Phase 6 — Historie (G6)
- [ ] Diagnose in `audit/historie.md` abgeschlossen
- [ ] Alle Zeiträume/Vergleiche erreichbar
- [ ] Charts lesbar, Datenpunkte per Tap explorierbar
- [ ] Kein Gestenkonflikt Chart vs. Seiten-Scroll
- [ ] Selbstverifikation 1–5 beantwortet
- [ ] Desktop-Diff unverändert, Screenshots abgelegt

## Phase 7 — Atmosphäre (G7)
- [ ] Diagnose in `audit/atmosphaere.md` abgeschlossen
- [ ] Alle 3 Linsen × alle 3 Disclosure-Tiefen per Touch erreichbar
- [ ] Inhaltsumfang je Tiefe unverändert (Abgleich gegen Desktop)
- [ ] Linsen-Wechsel ohne Layout-Sprünge
- [ ] Selbstverifikation 1–5 beantwortet
- [ ] Desktop-Diff unverändert, Screenshots abgelegt

## Phase 8 — 3D Globus (G8)
- [ ] Diagnose in `audit/globus.md` abgeschlossen
- [ ] Touch-Orbit/Zoom funktioniert, kein Konflikt mit Seiten-Scroll
- [ ] Mobile-Quality-Default über AdaptiveQualityController (keine Shader-Änderung)
- [ ] Pixel-Ratio-Handling auf DPR 3 geprüft
- [ ] Kein neuer Konsolen-Error, kein WebGL-Context-Loss im Test
- [ ] Real-Device-Stichprobe als expliziter TODO für Jan notiert
- [ ] Selbstverifikation 1–5 beantwortet
- [ ] Desktop-Diff unverändert, Screenshots abgelegt

## Querschnitt-Phase P — WebGL Cross-Device-Parität (GP)
Maßgebliche Vorgabe: `audit/webgl-cross-device.md`. Entscheidung (Jan): Governor regelt FPS statt Partikel. **Status: umgesetzt (§9), alle emulator-prüfbaren Punkte grün; offen nur 🔴 Real-Device.**
- [x] Diagnose in `audit/webgl-cross-device.md` abgeschlossen (Fillrate-Bilanz + Verifikation der Fachmann-Einschätzung, vor jeder Code-Änderung) — **erledigt** (dieses Dokument)
- [x] P-1: `governor.quality` aus `getEffectiveParticleCount()` entfernt — Partikelzahl Desktop↔Mobile bei gleichem Viewport/Zoom nachweislich gleich (Beleg: Dichte Desktop 3683 vs. Mobile 3722 Part./MPix, Verhältnis 1,011; `effectiveCount = floor(_numParticles × 0,867)` GPU-klassen-unabhängig — Audit §9.2)
- [x] P-2: Governor-Ausgang auf FPS-Leiter umgehängt (`maxParticleFps` dynamisch); Einbruch senkt FPS (30→24→20), **nicht** Partikelzahl (Beleg: Mobile perfState `drivesFps=true/targetFps=30`; Harness F1/F3: 45 ms→24 fps, 80 ms→20 fps bei konstanter Partikelzahl)
- [x] P-2: Governor mit echter Render-Dauer gefüttert (nicht gecapptes Wall-Clock-Intervall); `downMs`/`upMs` relativ zum FPS-Ziel re-basiert (kein Selbst-Runterregeln bei aktivem Cap) (Beleg: Harness F5 „cheap render under an active cap stays at 30fps"; feed nach den Pässen mit `performance.now()`-Delta)
- [x] Desktop (Fine-Pointer): Top-Tier gepinnt → ungedeckelt → byte-identisch zur Referenz (Beleg: perfState `drivesFps=false/maxParticleFps=0/targetFps=0/level 3`, `q`-Faktor entfernt)
- [x] Bewegung/Trails dt-normalisiert unverändert (Partikel-Geschwindigkeit + Trail-Länge über FPS-Änderung konstant) (`frameDtScale`-Pfad nicht angefasst) — 🔴 visueller Real-Device-Gegencheck an Jan
- [x] P-3: `scripts/verify-governor.mjs` auf FPS-Ziel-Semantik erweitert und grün (kein Vitest, Node-strip-types) — **27/27 PASS** (19 Legacy + 8 FPS-Modus)
- [x] Harte Regeln eingehalten: kein Shader-/RGBA8-/Float-Target-/Fusion-Eingriff (Diff-Beleg: nur `perfGovernor.ts`, `WindLayer.ts`, `verify-governor.mjs`)
- [x] Selbstverifikation 1–5 (CLAUDE.md) schriftlich mit Beleg beantwortet (Audit §9.3)
- [x] Keine neuen Konsolen-Errors/-Warnings (Desktop + Mobile, MCP); Typecheck grün
- [ ] 🔴 Real-Device-Stichprobe iPhone 12 Pro **und** schwaches Android an Jan übergeben (Emulator-FPS nicht belastbar — `ema`=0 unter Emulation bestätigt rAF-Drosselung; FPS-Stepping/Thermik nur real messbar)

## Querschnitt-Phase P2 — Trail-Res-Governance / Hebel 2 (GP2)
Maßgebliche Vorgabe: `audit/webgl-cross-device.md` §10. STOPP-Gate von Jan geöffnet (RGBA8-Trail-*Color*-Pfad, nicht das Packing). Umsetzung separat über die CLI.
- [x] Diagnose/Spec in `audit/webgl-cross-device.md` §10 abgeschlossen — **erledigt** (dieses Dokument)
- [x] P2-1: Governor-Ladder um Sprosse `{targetFps:20, trailScale:0.5}` erweitert; Trail-Res ist der **letzte** Hebel (greift nur am FPS-Floor + fortgesetztem Einbruch) — 4-stufiger monotoner Index `[20/0.5, 20/1.0, 24/1.0, 30/1.0]`, s. §11.1
- [x] P2-1: `scripts/verify-governor.mjs` +Checks (Abstieg …→trail0.5, Aufstieg trail0.5→… zuerst) grün; kein Vitest — **35/35 PASS** (T1–T6), s. §11.2
- [x] P2-2: `allocScreenTextures` skaliert Trail-Dims mit `trailScale`; `_epr` bleibt volle `drawingBufferWidth/clientWidth`-Ratio (kein Doppel-Cap) — `trailScale` separater Faktor
- [x] P2-3: Trail-Texturen auf `gl.LINEAR` (Upscale beim Composite nicht blockig)
- [x] P2-4: Point-Size × `trailScale` — CSS-Partikeldicke nach Upscale konstant (bei trailScale=1.0 unverändert)
- [x] Abgrenzung belegt: **kein** GLSL-Edit, **kein** Float-Target, Partikel-State-Packing/`NEAREST` unberührt, Trail-Targets bleiben RGBA8 (Diff-Beleg) — 3 Files, Token-Scan leer, s. §11.2 Zeile 5
- [x] Desktop byte-identisch (nie im FPS-/Trail-Modus) — `governorDrivesFps=false` → `trailScale` immer 1.0 → 1:1-Blit (LINEAR==NEAREST bit-exakt), s. §11.3 Q2
- [x] Selbstverifikation 1–5 (CLAUDE.md) schriftlich mit Beleg beantwortet — §11.3
- [x] Keine neuen Konsolen-Errors/-Warnings; Typecheck grün — `tsc -b` clean
- [ ] 🔴 Real-Device: iPhone bleibt scharf (Trail-Sprosse nie erreicht) **und** schwaches Android hält volle Partikelzahl auf der Sprosse — **visueller Sign-off** an Jan übergeben

## Querschnitt-Phase P3 — Repaint-Disziplin / Hebel 5 (GP3)
Maßgebliche Vorgabe: `audit/webgl-cross-device.md` §12. Letzter der 5 Fachmann-Hebel; niedrigstes Risiko (Event-Listener/Scheduling, kein STOPP-Gate). Umsetzung separat über die CLI.
- [x] Spec in `audit/webgl-cross-device.md` §12 abgeschlossen — **erledigt** (dieses Dokument)
- [x] P3-1: `visibilitychange` → `document.hidden` stoppt `scheduleParticleRepaint` (Loop-Anforderungen enden); sichtbar → einmal `triggerRepaint`; Listener in `onAdd`/`onRemove` — *live belegt: 61→0 Repaints/s bei hidden, Resume-Kick zurück auf 61/s (§12.4.2 V-PARITY-3 #1/#2)*
- [x] P3-2: `IntersectionObserver` auf Karten-Canvas → `ratio===0` pausiert, `>0` setzt fort; `disconnect()` in `onRemove` — *live belegt: `paused` false→true→false beim Offscreen/Onscreen (§12.4.2 #3)*
- [x] P3-3: `paused`-Flag (hidden ∨ offscreen) gated **nur** den Self-Repaint-Pfad; `render()` bei MapLibre-Repaints weiter korrekt — *zusätzlich der Pre-Data-Spinner in `render()` unter denselben Flag gestellt (§12.4.1)*
- [x] P3-4: Resume-Hygiene (`clearOnNextFrame`) — kein Alt-Trail-Aufblitzen beim Fortsetzen
- [x] Sichtbar + aktiv byte-identisch (keine Desktop-Regression; Pause greift nur, wenn nichts sichtbar ist) — *Baseline 61/s == Resumed 61/s (§12.4.2 #4)*
- [x] Abgrenzung belegt: kein Shader-/RGBA8-/Trail-Ladder-/Fusion-Eingriff (Diff-Beleg, P/P2 unberührt) — *P3-eigener Diff = nur `WindLayer.ts`, alle P3-`+`-Zeilen reine Event/Scheduling (kein GL/Float/RGBA); Governor-Harness 35/35 (P3 rührt ihn nicht an). Working-Tree zeigt gegen HEAD zusätzlich die noch nicht committeten P/P2-Diffs — nicht Teil von P3 (§12.4.2 #5)*
- [x] Selbstverifikation 1–5 (CLAUDE.md) schriftlich mit Beleg beantwortet — *§12.4.3*
- [x] Keine neuen Konsolen-Errors/-Warnings; Typecheck grün; `visibilitychange`/Offscreen-Verhalten im Emulator verifiziert (JS-beobachtbar) — *`list_console_messages` leer, `tsc -b` grün (§12.4.2 #6)*
- [ ] 🔴 Real-Device Akku-/Thermik-Gewinn (nice-to-have, **nicht** gate-blockierend) an Jan notiert

## Infrastruktur-Phase T2 — Layer-Transport / Caching (GT2)
Maßgebliche Vorgabe: `audit/layer-transport.md`. Muster aus T1 (Wind) auf Temp/Gust/Precip/Clouds ausrollen. Output-identisch, additiv. Umsetzung via CLI; Prod-Deploy+Cron = Jans Gate.
- [x] Diagnose in `audit/layer-transport.md` abgeschlossen (Fit/No-Fit-Tabelle, wiederverwendbare Hebel) — **erledigt** (dieses Dokument)
- [x] T2-1: generische Edge-Route `/_dwd_grib/*` (`netlify/edge-functions/dwd-grib.ts`), Durable-Header; `/_dwd_opendata`+`/_dwd_wind` unangetastet — Beleg Audit §G.2/§G.7
- [x] T2-2: Temp (`t_2m`+`hsurf`)/Gust (`vmax_10m`)/Precip (`tot_prec`)/Clouds (`clcl/clcm/clch/clct`) mit eigenem `base` durch den Proxy geroutet — **kein** Decode-/Norm-/Shader-Eingriff — Beleg §G.3/§G.7
- [x] T2-3: kombiniertes `public/latest-grib.json` (per-Param Step-Listen); Client-Resolver generalisiert (`src/sources/gribManifest.ts`, 24h-Staleness-Guard + Directory-Scan-Fallback pro Layer) — Fallback-Beleg §G.4
- [x] T2-4: `scripts/warm-grib.mjs` + `.github/workflows/warm-grib.yml` (poll→warm-durch-Proxy→atomares Manifest→commit-back; idempotent/fail-safe; `SITE_URL`-Var) — Probeläufe §G.6
- [x] T2-5: Vite-Dev-Proxy `/_dwd_grib`-Eintrag (`vite.config.ts`)
- [x] T2-6: `scripts/verify-layer-transport.mjs` grün (43/43) — Bytes je Param SHA-256-identisch (Proxy vs. direkt), Durable-Header, Whitelist-Rejection, fehlender Step = `no-store`; als `npm run verify:layer-transport` registriert — §G.1/§G.2
- [x] Output-Gleichheit je Layer belegt (visuell/numerisch identisch vor/nach, gleicher Lauf 2026072215) — §G.5 + `audit/screenshots/layer-transport/`
- [x] Manifest-Gate eliminiert Directory-Listings + spekulative Fehl-Fetches je Layer (Network-Beleg: 0 Listings, 0 `/_dwd_opendata`-GRIB-Requests, Manifest 4 ms) — §G.3
- [x] Abgrenzung belegt: Radar/Confidence/Wind/Decode/Fusion unberührt (Diff-Beleg: `git diff` über wind/scalar/fusion/radolan/Decode/dwd-wind.ts/netlify.toml/MapView leer) — §G.7
- [x] Keine neuen Konsolen-Errors/-Warnings; `npm run typecheck` grün — §G.8
- [ ] 🔴 Prod nach Deploy: Durable-Cache-`hit`-Header je Param + Latenz an Jan (wie T1; Repo-Var + Cron-Aktivierung = Jans Gate, Branch-Protection-Bot-Push beachten)

## Infrastruktur-Phase T2b — EPS/icosahedral-Transport (GT2b)
Maßgebliche Vorgabe: `audit/layer-transport.md` §H. Auslöser: EPS-Dateien (Fusion, icosahedral) mit 4–15 s je Datei über `/_dwd_opendata` ohne Durable-Cache. Umsetzung via CLI; Prod-Deploy = Jans Gate.
- [x] Diagnose §H abgeschlossen (Traffic-Befund, Wurzel = ALLOWED_PREFIX deckt `icon-d2-eps` nicht) — **erledigt** (dieses Dokument)
- [x] T2b-1: `dwd-grib.ts` `ALLOWED_PREFIX` → Liste inkl. `weather/nwp/icon-d2-eps/grib/`; `resolveDwdUrl` `.some(...)`; Rest (Suffix/`..`/Header) unverändert (§I.1/§I.5)
- [x] T2b-1: `scripts/verify-layer-transport.mjs` um EPS-Byte-Identität (Proxy vs. direkt) + Whitelist-Akzeptanz beider Bäume erweitert, grün (73/73 Checks, §I.1)
- [x] T2b-2: `iconD2EpsSource.ts` Byte-Fetches (Steps + clat/clon) über `/_dwd_grib`-EPS-Base; Directory-Listing bleibt auf `/_dwd_opendata`; **kein** Decode-/Member-/Resampling-Eingriff (+13/−2, §I.5)
- [x] T2b-3: `warm-grib.mjs` warmt die EPS-Params (eigener EPS-Lauf, bis Cap 6) durch `/_dwd_grib` (realer Lauf 2026072218 + 4 Fail-Safe-/Early-Exit-Proben, §I.4)
- [x] EPS-Kaltload nicht mehr über `/_dwd_opendata` (17 Byte-Fetches via `/_dwd_grib`, nur das Listing verbleibt — §I.2); Fusion-Ergebnis unverändert (Byte-Identität + Determinismus-Beweis, §I.3; Durable-`hit`-Verschwinden der 4–15 s = Prod/🔴)
- [x] Abgrenzung belegt: `/_dwd_opendata`+`/_dwd_wind`+Fusion-Blend-Logik unberührt (Diff-Beleg §I.5); Fusion-Lade-Timing NICHT angefasst (STOPP-Vermerk)
- [ ] (Optional T2b-4) Vor-Resampling im Cron: vor-resampelte Grid numerisch == Client-Berechnung (Äquivalenz-Beweis) — NICHT umgesetzt, nur auf Zuruf
- [x] Keine neuen Konsolen-Errors/-Warnings; `npm run typecheck` grün (§I.6)
- [ ] 🔴 Prod nach Deploy: Durable-`hit` je EPS-Param + Kaltload-Latenz an Jan

## Diagnose-Phase T-AUDIT — Live-Netzwerk-Audit pro Layer (GT-AUDIT)
Maßgebliche Vorgabe + Ergebnis-Ablage: `audit/live-network-audit.md`. Reine Diagnose gegen Prod (`https://buscosun.com/#m=…` DACH-Ort), kein Code. CLI via Chrome DevTools MCP.
- [x] Client-Kaltzustand hergestellt: frischer isolierter Browser-Context, IndexedDB/Cache-API/Storage leer verifiziert, kein SW registriert (§3 Setup-Protokoll) — **2026-07-22**
- [x] Bare-Cold-Load der Ziel-URL erfasst → Waterfall §3.1 (215 Requests, ~32 MB + DEM; je Request Route/Bytes/Dauer/Cache-Status; Edge-HIT-Quote `/_dwd_grib` 0/26)
- [x] ALLE 12 UI-Toggles der realen Rail einzeln durchgeschaltet (Niederschlag/Flow-Nowcast/Regen-Chance/Schneegrenze/Wind/Böen/Temperatur/Wolken/Satellit/Blitze/Stationen/Sicherheit) + Punkt-Forecast-Tabs, Delta-Traffic §3.2 gefüllt (Fusion-EPS-Zeile: feuert beim Temperatur-Toggle, 191,98 MB)
- [x] Je Request Route klassifiziert + Edge-HIT vs. Origin-MISS aus `cache-status`/`age` (Header-Samples je Route dokumentiert)
- [x] Top-Auffälligkeiten §3.3: Top-10-Langsamste, **Warm-Lücke = Manifest-Advance** (Cron wärmte 18z = HITs, Clients folgen localhost-Seed auf 15z = 117× fwd=stale), rv-Listing auf kritischem Pfad, Duplikate (rv-Tar ×2, brightsky-Sweep 288/Toggle, Sicherheits-Refetch)
- [x] T2b-Deploy verifiziert: **deployt + wirksam** — EPS-Bytes via `/_dwd_grib` (Edge-HITs), Listing designgemäß auf `/_dwd_opendata`, EPS-Proxy-Base im Bundle (§3.3)
- [x] Verbesserungs-Analyse §4: 9 Maßnahmen nach Wirkung÷Aufwand mit §3-Belegen + STOPP-Vermerk Fusion-Timing
- [x] Keine Code-/Deploy-/Account-Aktion auf der Live-Site (nur Navigation, Layer-Toggles, Lese-Sonden per GET); Fusion-Lade-Timing nur benannt (STOPP, §4 Nr. 10)

## Infrastruktur-Phase T2c — Prod-Manifest-Advance-Fix (GT2c)
Maßgebliche Vorgabe: `audit/layer-transport.md` §J. Top-Hebel aus dem Live-Audit: `warm-grib`-Manifest erreicht Prod nicht (Clients auf localhost-Seed 15z → alle 2D-Loads `fwd=stale`). CLI = Code-Seite; Prod-Verifikation = Jans Gate.
- [x] T2c-1: Ursache aus GitHub-Actions-Logs bestätigt — Ergebnis dreiteilig statt Push-Race: Push-Kette funktioniert (Run 20:31 → Commit 7bb272d GELANDET); Jans Merge e4e888c setzte den Seed zurück (1b334bd enthielt latest-grib.json); Selbstheilung scheiterte an transienten Fetch-Fehlern ohne Retry (3/4 Runs, je Near-Horizon-Step betroffen → Fail-Safe) (§J.4.1)
- [x] T2c-2: Commit-Back beider Workflows race-sicher — Sichern→`fetch --depth=1`→`reset --hard FETCH_HEAD`→Drüberlegen→Push, 3 Versuche (shallow-sicheres Rebase-Äquivalent, begründet: depth-1-Checkout hat keine Merge-Base; disjunkte Dateien → konfliktfrei per Konstruktion; heilt auch Merge-Regressionen) + `warmUrl`-Retry in `warm-grib.mjs` (2×, nur transiente Fehler/5xx — per Ausnahme-Klausel durch Log-Beweis autorisiert) (§J.4.2, Trockenlauf §J.4.3: Race + Regression nachgestellt, alter Push rejected, neuer Loop landet/heilt)
- [x] (optional) Cron-Zeitpläne entzerrt: Wind `2,17,32,47 * * * *`, Grib `*/15` — kein gleichzeitiges Feuern
- [x] Abgrenzung belegt: Diff = exakt warm-grib.yml + warm-wind.yml + warm-grib.mjs(`warmUrl`); Client-Code/Decode/Shader/Fusion unberührt; output-identisch (§J.4.4)
- [x] `npm run typecheck` grün; `node --check` grün; keine neuen Konsolen-Errors (Client unverändert)
- [ ] 🔴 Jans Gate: Branch-Protection erlaubt Bot-Push; `workflow_dispatch` von `warm-grib` ausgeführt
- [ ] 🔴 Prod-Verifikation: `latest-grib.json` zeigt **aktuellen** Lauf + `warmedThroughProxy`=Prod-URL (nicht localhost); 2D-Kaltload = `Cache-Status: hit` statt `fwd=stale`; 2D-Lauf == Wind-Lauf; keine `git push`-Rejects mehr in den Logs

## Phase 9 — Gesamtregression (G9)
- [ ] Kurzprotokoll V-ALL für alle 8 Features grün
- [ ] Desktop-Diff aller 8 Seiten gegen Phase-0-Baseline: keine Abweichung
- [ ] Konsolen-Abgleich: keine neuen Errors/Warnings ggü. Baseline
- [ ] Stichprobe 360×800 und 430×932: Layout stabil
- [ ] Abschlussbericht im Session-Log (context.md) geschrieben
- [ ] Liste empfohlener Real-Device-Tests (iPhone Safari) an Jan übergeben
