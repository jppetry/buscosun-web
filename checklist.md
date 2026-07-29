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

## Feature-Phase F1 — Gewitterpotenzial-Layer (GF1)
Maßgebliche Vorgabe: `audit/gewitterpotenzial.md`. Funktionserweiterung (von Jan beauftragt, außerhalb der Mobile-Mission). Neuer, **standardmäßig inaktiver** Layer aus `cape_ml` × `cin_ml` × `lpi`. Zwingend: Lazy-Load wie alle anderen Layer (erst bei Aktivierung). Umsetzung via CLI.
- [x] Diagnose in `audit/gewitterpotenzial.md` (§8) abgeschlossen: reguläres Gitter bestätigt (GDT 0, Decode wie Temp/Böen), CIN-Vorzeichen **am echten Feld** belegt (positiver Betrag 0..322 J/kg **+ −999,9-Fill** auf ~236 k Zellen → `cinGate` sentinel-fest), Domänenmaske (NaN→transparent, 151 k Rand-Zellen), Reuse-Entscheidung `fetchStepField` statt `fetchIconD2Grid` (§8.4) — vor jeder Code-Änderung
- [x] F1-1: `src/sources/iconD2Thunder.ts` lädt `cape_ml`/`cin_ml`/`lpi` als rohe Grids (Reuse `resolveLatestRun`/`fetchStepField`/`gribCorners` — dieselbe Pipeline wie Temp, §8.4), je Step alle drei parallel → gemeinsame Gültigkeitszeit; MCP: 13 Frames über DACH in ~1,7 s
- [x] F1-2: `src/radar/thunderPotential.ts` — reine Fusion (CAPE-Potenzial × CIN-Deckel + LPI-Realisierung + Synergie), headless-testbar; `ramp`/`capeScore` aus `convectiveIndex.ts` reused (additiv exportiert)
- [x] F1-3: `thunderRamp` + `visRange {0.08,0.14}` fünfstufig (Gelb→Amber→Orange→Rot→Magenta); < Score ~8 transparent (MCP: volle Rampe rendert bei visRange {0,0}, sonst transparent = ehrlich)
- [x] F1-4: `MapView.tsx` additive Seams — `LayerKey 'thunder'`, `LAYER_OPTIONS`-Eintrag, `statuses`-Init, `layerRefs.thunder`, `THUNDER_LAYER_ID`+Init-ScalarLayer, `addLayers`, **beide** Sichtbarkeits-Blöcke, `refreshIconD2Layers`-Zweig, Slider-`setData`-Effekt, `DECK_GROUPS`-Toggle, `LayerIcon`-Case
- [x] **F1-4 (kritisch): Lazy-Load-Effekt** `active.has('thunder') && !iconD2ThunderRef.current → installThunderRef` (Muster Clouds/Gust) — Netzwerk-Beleg (MCP, kalt-Cache, Buffer entkappt): **0** `cape_ml`/`cin_ml`/`lpi`-Requests vor Aktivierung; nach Toggle alle drei via `/_dwd_grib` (Lauf 2026072406, regular-lat-lon single-level)
- [x] F1-5: Legende (5 Stufen, `mdk-legends`-Karte) + Tooltip (`LAYER_INFO.thunder`) mit Ehrlichkeits-Hinweisen (Domänenrand transparent, ~0–12-h-Horizont, Potenzial ≠ Auslösung) — Desktop + Mobile MCP-sichtbar
- [x] F1-6: `scripts/verify-thunder.mjs` (Node strip-types, kein Vitest) grün — **13/13 CHECKS PASS** (inkl. CIN-Fill −999,9 = kein Deckel); `npm run verify:thunder` registriert
- [x] Rendering plausibel: 24.07. ist eine schwache Konvektionslage über DACH (max Score 19 = „gering"); Diurnalzyklus korrekt (Nachmittag Step 10 max 42); Domänenrand transparent (17 % maskiert); Zeit-Slider bewegt den Layer (MCP: +8 h/+9 h), `refreshIconD2Layers`-Zweig ergänzt
- [x] Abgrenzung belegt: Diff nur neue Dateien (`iconD2Thunder.ts`/`thunderPotential.ts`/`verify-thunder.mjs`) + additive Seams (`MapView.tsx`, `convectiveIndex.ts` = nur 2× `export`, `LayerIcon.tsx`, `LayerInfoPanel.tsx`, `package.json`); Wind-Shader/RGBA8/Fusion/EPS/Radar/Decode **unberührt** (die übrigen `M`-Dateien im Tree waren vor F1 modifiziert)
- [x] Mobile (390×844): Toggle im Sheet-Layer-Segment (Gruppe Niederschlag), Touch-Target **358×56 px** (≥44), Legende voll sichtbar/lesbar; Desktop mit inaktivem Layer unverändert (additiv, off im Default)
- [x] Keine neuen Konsolen-Errors/-Warnings (MCP Desktop + Mobile leer); `npm run typecheck` grün
- [ ] (Optional, vertagt) `warm-grib.mjs` wärmt `cape_ml`/`cin_ml`/`lpi` vor — erst wenn der Layer sich bewährt (bewusst nicht Teil von F1, §6)

## Feature-Phase F2 — Blitz-Vorhersage-Layer / LPI (GF2)
Maßgebliche Vorgabe: `audit/blitz-vorhersage.md`. Funktionserweiterung (von Jan beauftragt, außerhalb der Mobile-Mission). Neuer, **standardmäßig inaktiver** Einfeld-Layer aus `lpi_max`. Eigenständig neben dem bestehenden „Blitze"-Layer (Messung) — Prognose vs. Beobachtung, klar getrennt. Zwingend: Lazy-Load wie alle anderen Layer. Umsetzung via CLI. **Unabhängig von F1.**
- [x] Diagnose in `audit/blitz-vorhersage.md` (§8) abgeschlossen: reguläres Gitter (GDT 0, `lpi_max` = `regular-lat-lon` single-level, Decode wie Temp/Böen; `lpi` läuft als F1-Zutat bereits live über den Pfad), Feld-Wahl `lpi_max` + `minStepHours=1` (t+0-Intervallmaximum), `lpi`-Fallback dokumentiert, Domänenmaske (NaN→transparent), Reuse `fetchStepField` statt nicht existierendem `fetchIconD2Grid(kind:'max')` (§8.4) — vor jeder Code-Änderung; **kein STOPP**
- [x] F2-1: `src/sources/iconD2Lpi.ts` lädt `lpi_max` als rohes Grid (Reuse `resolveLatestRun`/`fetchStepField`/`gribCorners` — dieselbe Pipeline wie Böen, Ein-Feld); Schritte 1–12 (t+0 als strukturell 0 ausgelassen), `lpi`-Fallback dokumentiert; MCP: 12 Frames (Steps 001–012) über DACH geladen
- [x] F2-2: `lpiRamp` + `visRange {0.02,0.045}` fünfstufig (Gelb→Amber→Rot-Orange→Magenta→Elektrik-Violett); < ~1 J/kg transparent; Palette **bewusst violett-forciert** → klar von der Blitzortung (amber Bolt) UND der Gewitter-Rampe getrennt
- [x] F2-3: `MapView.tsx` additive Seams — `LayerKey 'lightningfc'`, `LAYER_OPTIONS`-Eintrag (Label „Blitzprognose", Titel grenzt gegen „Blitze" ab), `statuses`-Init, `layerRefs.lightningfc`, `LIGHTNINGFC_LAYER_ID`+Init-ScalarLayer, `addLayers`, **beide** Sichtbarkeits-Blöcke, `refreshIconD2Layers`-Zweig, Slider-`setData`-Effekt (`minStepHours=1`), `DECK_GROUPS`-Toggle, `LayerIcon`-Case
- [x] **F2-3 (kritisch): Lazy-Load-Effekt** `active.has('lightningfc') && !iconD2LightningFcRef.current → installLightningFcRef` (Muster Clouds/Gust) — Netzwerk-Beleg (MCP): Kartenstart **194** fetch/xhr, **0** `lpi_max`; nach Toggle Directory-Probe `/_dwd_opendata/…/06/lpi_max/` + Steps **001–012** via `/_dwd_grib` (Lauf 2026072406), alle 200
- [x] F2-4: Legende (5 Stufen, `mdk-legends`-Karte) + Tooltip (`LAYER_INFO.lightningfc`) mit Ehrlichkeits-Hinweisen (Domänenrand transparent, ~0–12-h-Horizont, **Prognose ≠ Messung**, Verweis auf „Blitze" als Gegenstück) — Desktop + Mobile MCP-sichtbar
- [x] „Blitze" (Messung) + „Blitzprognose" (Modell) gleichzeitig aktiv (MCP, „3 aktiv", keine Konsolenfehler), optisch unterscheidbar (violetter Toggle/Icon vs. amber Bolt); t+0 nicht flächig leer (Status „DWD ICON-D2 LPI_MAX · 2,2 km" geladen, `minStepHours=1`); Slider 0–12 h voraus; `refreshIconD2Layers`-Zweig ergänzt
- [x] Abgrenzung belegt: Diff nur neue Dateien (`iconD2Lpi.ts`/`lightningPotential.ts`/`verify-lpi.mjs`) + additive Seams (`MapView.tsx`, `LayerIcon.tsx`, `LayerInfoPanel.tsx`, `package.json`); `dwdLightning.ts`/`gribDecode.ts`/`ScalarLayer.ts`/Wind-Shader/RGBA8/Fusion/EPS/Radar **unberührt** (leerer Diff belegt; übrige `M`-Dateien im Tree waren vor F2 modifiziert)
- [x] Mobile (390×844): Toggle im Sheet-Layer-Segment (Gruppe „Punkte & Vertrauen", neben „Blitze"), Touch-Target **56 px** hoch (≥44), Legende sichtbar; Desktop mit inaktivem Layer unverändert (additiv, off im Default)
- [x] Keine neuen Konsolen-Errors/-Warnings (MCP Desktop + Mobile leer); `npm run typecheck` grün
- [x] (Optional) `lpiRisk()`/`lpiLevelOf()`-Rampe (`src/radar/lightningPotential.ts`) + `scripts/verify-lpi.mjs` grün — **6/6 CHECKS PASS**; `npm run verify:lpi` registriert
- [ ] (Optional, vertagt) `warm-grib.mjs` wärmt `lpi_max` vor — erst wenn der Layer sich bewährt (bewusst nicht Teil von F2, §6)

## Feature-Phase F3 — Simuliertes-Radar-Layer / dbz_cmax (GF3) — ⛔ STILLGELEGT ZUGUNSTEN N1 (2026-07-24)
> **Stillgelegt.** In Phase N1 restlos entfernt (2–12 h = Fusion-/Modell-Niederschlag mm/h, nicht `dbz_cmax`). Historie unten erhalten; aktuelle Vorgabe: `audit/niederschlag-vereinheitlichung.md`.
Maßgebliche Vorgabe: `audit/simuliertes-radar.md`. Funktionserweiterung (von Jan beauftragt, außerhalb der Mobile-Mission). Neuer, **standardmäßig inaktiver** Layer aus `dbz_cmax`, gerendert in der **bestehenden Radar-Optik** (dBZ→mm/h via `radarModel.ts`). Verlängert das Regenradar über den 2-h-Nowcast-Horizont hinaus (0–12 h). Simuliert, nicht gemessen. Zwingend: Lazy-Load. Umsetzung via CLI. **Unabhängig von F1/F2.**
- [x] Diagnose in `audit/simuliertes-radar.md` (§8) abgeschlossen: `dbz_cmax` als **regular-lat-lon** publiziert (Steps 000–048, Live-Sonde) → Decode-Pfad wie Temp/Böen; **Step 000 vorhanden → t+0 gültig, KEIN `minStepHours`** (instantanes Säulen-Max, anders als `lpi_max`); dBZ→mm/h-Reuse via **additivem `dbzToMmh`**-Export in `radarModel.ts` (Verhalten unberührt); `fetchStepField` statt `fetchIconD2Grid` (kein `'cmax'`-Kind); Abgrenzung zu `nowcast`/Regenradar — vor jeder Code-Änderung; **kein STOPP**
- [x] F3-1: `src/sources/iconD2Dbz.ts` lädt `dbz_cmax` als rohes Grid (Reuse `resolveLatestRun`/`fetchStepField`/`gribCorners` — Böen/LPI-Muster, Ein-Feld); dBZ→mm/h über `radarModel.dbzToMmh` (reused, nicht dupliziert); Steps 000–012, MCP: 13 Frames via `/_dwd_grib`
- [x] F3-2: Rendering an die **bestehende Radar-Palette** `precipRainRamp` (== `nowcast`) gehängt — keine neue Palette; R = `clamp01(dbzToMmh(dbz)/PRECIP_VMAX)`; `visRange {0.004,0.011}` → < ~5–10 dBZ transparent
- [x] F3-3: `MapView.tsx` additive Seams — `LayerKey 'simradar'`, `LAYER_OPTIONS`-Eintrag (Label „Sim-Radar", Titel labelt „SIMULIERT" + grenzt gegen echtes Radar ab), `statuses`-Init, `layerRefs.simradar`, `SIMRADAR_LAYER_ID`+Init-ScalarLayer, `addLayers`, **beide** Sichtbarkeits-Blöcke, `refreshIconD2Layers`-Zweig, Slider-`setData`-Effekt (kein `minStepHours`), `DECK_GROUPS`-Toggle, `LayerIcon`-Case, `LAYER_INFO`-Eintrag
- [x] **F3-3 (kritisch): Lazy-Load-Effekt** `active.has('simradar') && !iconD2SimRadarRef.current → installSimRadarRef` (Muster Clouds/Gust) — Netzwerk-Beleg (MCP, Desktop): Kartenstart **126** fetch/xhr, **0** `dbz_cmax`; nach Toggle Directory-Probe `/_dwd_opendata/…/dbz_cmax/` + Steps **000–012** via `/_dwd_grib` (Lauf 2026072409, regular-lat-lon), alle 200
- [x] F3-4: Legende (`mdk-legends`-Karte „Sim-Radar · simuliert") + Tooltip (`LAYER_INFO.simradar`) mit „simuliert/Modell", 0–12-h-Horizont, Domänenrand transparent + Verweis auf echtes Radar/„Niederschlag" als präzisere 0–2-h-Quelle — Desktop + Mobile MCP-sichtbar
- [x] Optik konsistent zur bestehenden Radar-Skala (`precipRainRamp`, geteilt mit `nowcast`); t+0 geladen (Step 000, kein `minStepHours`); Slider zeigt Layer **jenseits 2 h** (+6 h MCP-verifiziert); `refreshIconD2Layers`-Zweig ergänzt; **24.07. trocken → flächig transparent = korrekt** (kein Fehler, wie F1/F2); `verify-simradar.mjs` **21/21 PASS**
- [x] Abgrenzung belegt: Diff nur neue Dateien (`iconD2Dbz.ts`/`verify-simradar.mjs`) + additive Seams (`MapView.tsx`/`LayerIcon.tsx`/`LayerInfoPanel.tsx`/`package.json`) + **additiver** `radarModel.dbzToMmh`-Export (Bestand byte-identisch); `nowcast`/RainLayer/RADOLAN/`radarModel.ts`-Verhalten/`ScalarLayer.ts`/`gribGridDecode.ts`/Wind-Shader/RGBA8/Fusion/EPS **unberührt** (`iconD2WindSource.ts` „M" war vor F3 modifiziert)
- [x] Mobile (390×844): Toggle im Sheet-Layer-Segment (Gruppe Niederschlag) erreichbar, Touch-Target **453×56 px** (≥44), Legende „Sim-Radar · simuliert" sichtbar; Desktop mit aktivem **und** inaktivem Layer sauber (additiv, off im Default)
- [x] Keine neuen Konsolen-Errors/-Warnings (MCP Desktop + Mobile leer); `npm run typecheck` grün
- [ ] (Optional/vertagt) `echotop`-Punkt-Readout (Gewitter-Schwere); `warm-grib.mjs` wärmt `dbz_cmax` vor — beides erst wenn der Layer sich bewährt (bewusst nicht Teil von F3, §6)

## Feature-Phase F4 — Schneehöhe-&-Neuschnee-Layer (GF4)
Maßgebliche Vorgabe: `audit/schnee.md`. Funktionserweiterung (von Jan beauftragt, außerhalb der Mobile-Mission). Neuer, **standardmäßig inaktiver** Layer „Schnee" mit zwei Modi (Schneedecke `h_snow` + Neuschnee cm) als Flächen-Raster — nicht die Schneegrenzen-Linie (die bleibt der bestehende `snowline`-Layer). Zwingend: Lazy-Load. Umsetzung via CLI. **Unabhängig von F1/F2/F3.**
- [x] Diagnose in `audit/schnee.md` (§8) abgeschlossen — **`freshsnw`-Semantik im ECHTEN Decode verifiziert** (temporärer Decode mit App-Decoder, Ergebnis §8.1-Tabelle: `freshsnw` ∈ [0,00…1,00] = Frische-/Albedo-Faktor cat/num 1/203, NICHT cm → Neuschnee aus `snow_gsp` 1/56 (+`snow_con` 1/55)); alle Schnee-Felder **regular-lat-lon** GDT 0 (Steps 000–048); `h_snow` 1/11 instantan (t+0 gültig, kein `minStepHours`); `snow_gsp` Step 0 = 0 (akkumuliert → `minStepHours=1`); SWE→cm-Reuse via **additivem `freshSnowCmFromSwe`** (alpineSplit-Konstante) — vor jeder Code-Änderung; **kein STOPP**
- [x] F4-1: `src/sources/iconD2Snow.ts` lädt `h_snow` als rohes Grid (Reuse `resolveLatestRun`/`fetchStepField` — Böen-Muster; Schneedecke, m→cm ×100, t+0 gültig **ohne** `minStepHours`); MCP: Steps 000–024 via `/_dwd_grib`
- [x] F4-2: Neuschnee-Modus aus `snow_gsp`(+`snow_con`) akkumuliert → mm SWE → cm via `freshSnowCmFromSwe` (`rho_snow` im Frischschnee-Bereich 30–250 bevorzugt, sonst ~10:1 = alpineSplit-Konstante); Loader lässt Step 0 aus + Slider-`minStepHours=1`; MCP: `snow_gsp`+`snow_con`+`rho_snow` Steps 001–024 lazy nachgeladen
- [x] F4-3: Rendering über die vorhandene `snowRamp` (Reuse `precipPhase.ts`, nur gelesen); R = cm/VMAX (Decke 150 / Neu 50), `visRange` (< ~1 cm) modusabhängig; Schnee-Palette (Weiß→Blau) ≠ Regen-Palette
- [x] F4-4: `MapView.tsx` additive Seams — `LayerKey 'snow'`, `LAYER_OPTIONS`-Eintrag, `SnowMode`-State + `SNOW_MODE_LABELS`/-`FULL_LABELS` (analog `SAT_PRODUCT`), `snowModeRef`+`snowSeqRef`, `statuses`-Init, `layerRefs.snow`, `SNOW_LAYER_ID`+Init-ScalarLayer(`snowRamp`), `addLayers`, **beide** Sichtbarkeits-Blöcke, `refreshIconD2Layers`-Zweig, Slider-`setData`-Effekt (modusabhängig `minStepHours`), Modus-Wechsel-Effekt, `snowSeg`-UI (Desktop-Dock + Mobile-Sheet), Legende, `DECK_GROUPS`, `LayerIcon`-Case, `LAYER_INFO`-Eintrag (+`SNOW`-Gradient)
- [x] **F4-4 (kritisch): Lazy-Load-Effekt** `active.has('snow') && !iconD2SnowRef.current → installSnowRef` (Muster Clouds/Gust); Modus-Wechsel lädt das jeweilige Feld lazy — Netzwerk-Beleg (MCP): Kartenstart **0** `h_snow`/`snow_gsp`; Toggle → `h_snow` 000–024 via `/_dwd_grib`; Modus→Neuschnee → `snow_gsp`+`snow_con`+`rho_snow` 001–024 (Seq-Guard gg. Stale)
- [x] F4-5: Legende (`mdk-legends`-Karte, modusabhängig „Schneedecke"/„Neuschnee", cm-Enden) + Tooltip (`LAYER_INFO.snow`) mit cm-Angabe, Modus-Label, Domänen-/Horizont-Hinweisen, **Schnee-Wasser-Verhältnis als Näherung** (rho_snow bevorzugt) — Desktop + Mobile MCP-sichtbar
- [x] Schneedecke t+0 geladen (Step 000); Neuschnee-Summe wächst mit Horizont (kumulatives `snow_gsp`, minStepHours=1); cm-Werte plausibel — **Ostalpen-Gletscher blau (h_snow bis 261 cm) > Flachland transparent** (MCP-Recenter, `after-desktop-depth-alps.png`); 24.07. sommertrocken → Neuschnee flächig 0 = korrekt; `refreshIconD2Layers`-Zweig ergänzt
- [x] Abgrenzung belegt: Diff nur neue Dateien (`iconD2Snow.ts`/`verify-snow.mjs`) + additive Seams (`MapView.tsx`/`LayerIcon.tsx`/`LayerInfoPanel.tsx`/`package.json`) + **additiver** `alpineSplit.ts`-`freshSnowCmFromSwe` (0 geänderte Bestandszeilen); `snowline`/`climaField`/`precipPhase.ts`-Verhalten/`ScalarLayer.ts`/`gribGridDecode.ts`/Wind-Shader/RGBA8/Fusion/EPS/Radar **unberührt** (`git status` leer)
- [x] Mobile (390×844): Toggle **453×56 px** + Modus-Switch „Decke"/„Neuschnee" je **209×44 px** (≥44) im „Layer"-Sheet (Detail-Tab, Gruppe Niederschlag), kein Horizontal-Scroll, Legende sichtbar; Desktop mit aktivem **und** inaktivem Layer sauber (additiv, off im Default)
- [x] Keine neuen Konsolen-Errors/-Warnings (MCP Desktop + Mobile leer); `npm run typecheck` grün; `npm run verify:snow` **20/20 PASS**
- [ ] (Optional/vertagt) `freshsnw` als optische Anreicherung; `warm-grib.mjs` wärmt `h_snow`/`snow_gsp` vor — erst wenn der Layer sich bewährt (bewusst nicht Teil von F4, §6)

## Feature-Phase F5 — Superzellen-/Rotationspotenzial-Layer (GF5)
Maßgebliche Vorgabe: `audit/rotationspotenzial.md`. Funktionserweiterung (von Jan beauftragt, außerhalb der Mobile-Mission). Neuer, **standardmäßig inaktiver** Experten-Layer aus `uh_max`(+`uh_max_low`)+`sdi_2` → Superzellen-/Rotations-Verdachtsflächen. **⚠️ Ehrlichkeits-Leitplanken (§0) sind gate-blockierend.** Zwingend: Lazy-Load. Umsetzung via CLI. **Unabhängig von F1–F4.**
- [x] Diagnose in `audit/rotationspotenzial.md` (§8) abgeschlossen — Gitter regulär GDT 0 (nicht EPS), Feld-Identität/Einheiten via echtem Decode (uh_max=2–5 km, uh_max_low=0–3 km, sdi_2 cat7/num193, signiert→|·|); **Spec-Schwellen als ~100× zu hoch entlarvt**, an gemessener ICON-D2-Skala neu verankert; **kein echter Schwergewitter-Lauf verfügbar → STOPP & FRAGEN, Jan gab „konservativ bauen" frei** — vor jeder Code-Änderung
- [x] F5-1: `src/sources/iconD2Rotation.ts` lädt `uh_max`(+`uh_max_low`,`sdi_2`) via `fetchStepField`/`/_dwd_grib` (wie F1–F4 bewusst nicht `fetchIconD2Grid` — Rohfusion braucht Float); Steps 1–12, `minStepHours=1` (Intervall-Maxima)
- [x] F5-2: `src/radar/rotationPotential.ts` — reine Fusion (|UH|-Stärke + SDI-Korroboration `max(uhS,0.6uhS+0.4sdiS)`) **+ Nachbarschafts-Glättung** (3×3-Max→5×5-Mittel, NaN-erhaltend); headless-testbar + `window.__verifyRotationPotential`
- [x] F5-3: `rotationRamp` + `visRange {0.18,0.24}` — nüchterne, desaturierte Violett/Indigo-Palette (≠ Regen/Radar/Gewitter/Blitzprognose), großzügige Aktivierungsschwelle ~Score 20 (Under-Paint)
- [x] F5-4: `MapView.tsx` additive Seams — `LayerKey 'rotation'`, `LAYER_OPTIONS` (Label „Rotation", Titel: Experten-Layer + „kein Warnersatz"), `statuses`, `layerRefs.rotation`, `ROTATION_LAYER_ID`+Init-ScalarLayer, addLayers, 2× Sichtbarkeit, `installRotation`+Ref, `refreshIconD2Layers`-Zweig, Slider-Effekt `minStepHours=1`, DECK_GROUPS; + `LayerIcon`/`LayerInfoPanel`
- [x] **F5-4 (kritisch): Lazy-Load-Effekt** `active.has('rotation') && !iconD2RotationRef.current → installRotationRef` — CDP-Waterfall belegt **0** `uh_max`/`uh_max_low`/`sdi_2`-Requests vor Aktivierung, 36 (12×3) via `/_dwd_grib` danach
- [x] **F5-5 (gate-blockierend): Ehrlichkeits-Leitplanken §0 im UI** — Tooltip/Legende (Desktop+Mobile): „kein amtliches Warnprodukt, kein Warnersatz" (Verweis DWD-Warnungen), „Verdacht ≠ Ereignis", „hohe Fehlalarmrate", „Experten-Layer"; Sprache **nie** „Tornado" (§4.2-Titel bewusst umformuliert); Darstellung geglättet
- [x] F5-6: `scripts/verify-rotation.mjs` (Node strip-types, kein Vitest) grün — **30/30** (Fusion + Glättung + Clamp + Monotonie + Vorzeichen + SDI-boost-only + NaN-Maske)
- [x] Rendering: 24.07. rotationsschwach → nach Glättung erwartungsgemäß transparent (ehrlicher Under-Paint); Renderpfad über 36 Frames + `ScalarLayer.setData` belegt; Slider 0–12 h; `refreshIconD2Layers`-Zweig greift bei aktivem Layer
- [x] Abgrenzung belegt: Diff nur 3 neue Dateien + additive `MapView`/`LayerIcon`/`LayerInfoPanel`-Seams + `package.json`; `convectiveIndex.ts` nur gelesen (`import ramp`); `dwdAlerts`/Wind-Shader/RGBA8/Fusion/EPS/Radar unberührt
- [x] Mobile (390×844): Toggle im „Layer"-Sheet (Gruppe Niederschlag), Touch-Target **358×56 px**, Legende (inkl. Experten-Hinweis) sichtbar; Desktop mit aktivem/inaktivem Layer sauber
- [x] Keine neuen Konsolen-Errors/-Warnings (Desktop+Mobile leer); `npm run typecheck` grün
- [ ] (Optional/vertagt) `uh_max_med`/`w_ctmax`-Anreicherung; `warm-grib.mjs` wärmt `uh_max`/`sdi_2` vor; **oberen Rampen-Anker gegen einen echten Superzellen-Lauf nachkalibrieren** — erst wenn der Layer sich bewährt

## Konsolidierungs-Phase N1 — Niederschlags-Ansicht „jetzt–2 h" (gemessenes Radar/Nowcast) (GN1) — ✅ GATE GRÜN (2026-07-24, revidiert)
Maßgebliche Vorgabe: `audit/niederschlag-vereinheitlichung.md` (+ §11). Konsolidierung/Refactor + SIM-Radar-Stilllegung (von Jan beauftragt). **Jan-Revision 2026-07-24: „auf 2 h verkürzen" — nur gemessene Radar-/Nowcast-Hälfte (DE ≤2 h · AT ≤3 h · CH <0,5 h), Modell-/Fusionshälfte (2–12 h) DRAUSSEN (kürzer & ehrlicher).** Umsetzung via CLI. Verify: **V-NIEDERSCHLAG** (tests.md), Harness 30/30, typecheck grün, uncommitted (Jans Commit-Gate).
- [x] Diagnose abgeschlossen: Spec-Addendum §10 (Code-Lesung) — der 2-h-Seam liegt bereits IM Kompositor (`precipComposite.ts`, per-Zelle Radar→ICON-D2); zwei Render-Pfade über Fusion⇄Native (nicht Stunde); `precipFrameReady`+Visibility-Logik als Zentralisierungs-Ziel identifiziert; SIM-Radar-Seams (§5) verifiziert
- [x] N1-1: `src/nowcast/precipSource.ts` — **radar-only** (Revision §11): reine `resolvePrecipSource(hour,country,avail)→{kind:'radar',ready}` + `precipCompositeReady` + `precipRadarHorizonHours` + `verifyPrecipSource()`; `RADAR_HORIZON_H` DE 2/AT 3/CH 0,5 (CH strikt `<0,5`); jenseits Horizont `ready:false` (keine Modellverlängerung); keine WebGL-Imports → headless
- [x] N1-2: `scripts/verify-precip-source.mjs` (Node strip-types, kein Vitest) → **30/30 PASS** — Radar-Fenster+Grenzen, KEINE Modellverlängerung >Horizont, DACH-OR (2,5 h nur AT), Slider-Horizont; `npm run verify:precip-source`
- [x] N1-3: `MapView.tsx` — `precipFrameReady` gekapselt (Wrapper → `precipCompositeReady(precipAvailability())`); Kompositor OHNE `d2`; `NOWCAST_LAYER_ID` einzige Precip-Quelle (auch Fusion-Modus), `precip-forecast` fest `false`
- [x] N1-4: **Modellhälfte raus** — jenseits des Land-Horizonts blendet der Layer aus (kein Seam/Crossfade/Modell); `sliderMax` nutzt für Niederschlag `precipRadarHorizonHours` (≤3 h) statt 12-h-ICON-D2 (MCP Testmodus `valuemax="3"` = AT INCA); `installIconD2`-nowOnly-Änderung zurückgenommen
- [x] N1-5: SIM-Radar restlos entfernt (alle Seams + `src/sources/iconD2Dbz.ts` **gelöscht** + `LayerIcon`/`LayerInfoPanel`); `git grep simradar` in `src/` **leer**; keine toten Imports (`typecheck` grün); `radarModel.ts` (`dbzToMmh`) bleibt (Regenradar `expertDbz`); F3-Doku „stillgelegt zugunsten N1"
- [x] N1-6: `nowcast`-Label/Tooltip/Info-Panel/Deck-Sub → **„Niederschlag · jetzt–2 h"** (gemessenes Radar/Nowcast, keine Modell-Verlängerung); keine „Radar/Modell"-Wahl in der UI (MCP-Snapshot)
- [x] N1-7: Doku `docs/niederschlag-architektur.md` (radar-only 2 h neu geschrieben) + Verweis im Radar-Feature-Katalog; Spec §10 (Diagnose) + §11 (Revision)
- [x] Radar-only belegt: Datenlage „DACH-KOMPOSIT · DE RADOLAN · AT INCA · CH RZC" **ohne** „+ ICON-D2"; `precip-forecast` stillgelegt; Screenshots in `audit/screenshots/niederschlag/` (WebGL-Emulator nicht pixel-repräsentativ, CLAUDE.md)
- [x] Layer blendet jenseits des Land-Horizonts sauber aus (kein Leer-/Pop-Bruch im sichtbaren Fenster); Slider kurz (jetzt–2/3 h) im Default-Testmodus
- [x] Erhalt belegt: `flownowcast`/`poprob` (unverändert), Model-Switcher DE/AT/CH (Tabs MCP), Fusion⇄Native-Selektor (wirkt auf Temp/Wind/Wolken; Niederschlag ohne Modellhälfte), `confidence`-PoP-Heuristik behält `iconD2Ref`; **`git diff -- src/fusion/` leer**
- [x] Keine neuen Konsolen-Errors/-Warnings (MCP leer); `npm run typecheck` grün; Niederschlag-Toggle+Slider auf 390×844 sauber (Touch-Target 358×56); Desktop bis auf gewollte Änderungen unverändert (SIM-Radar weg, „Niederschlag · jetzt–2 h", kurzer Slider)

## Phase 9 — Gesamtregression (G9)
- [ ] Kurzprotokoll V-ALL für alle 8 Features grün
- [ ] Desktop-Diff aller 8 Seiten gegen Phase-0-Baseline: keine Abweichung
- [ ] Konsolen-Abgleich: keine neuen Errors/Warnings ggü. Baseline
- [ ] Stichprobe 360×800 und 430×932: Layout stabil
- [ ] Abschlussbericht im Session-Log (context.md) geschrieben
- [ ] Liste empfohlener Real-Device-Tests (iPhone Safari) an Jan übergeben
