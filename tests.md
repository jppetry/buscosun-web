# tests.md — Verifikationsprotokolle (Chrome DevTools MCP, iPhone 12 Pro)

## Setup: Geräte-Emulation
Vor jedem Protokoll sicherstellen:
- Viewport **390×844**, Device-Pixel-Ratio **3**, Touch-Emulation **an**, mobiler User-Agent (iOS Safari-nah).
- Dev-Server läuft; getestete URL notieren.
- Optional pro Protokoll: Network-Throttling "Fast 4G" für Ladeverhalten-Checks.

**Wichtige Einschränkung:** Die Emulation ist verlässlich für Layout, Touch-Targets, Interaktionslogik, Netzwerk und JS-Performance. Sie ist **nicht** verlässlich für GPU-/Shader-Verhalten (bekannt aus dem Windpartikel-Debugging: Präzisions- und Float-Target-Probleme zeigen sich nur auf echter Hardware). GPU-kritische Befunde immer mit dem Vermerk "Real-Device-Check erforderlich" kennzeichnen.

---

## V-ALL — Basisprotokoll (für jede Phase, jedes Feature)

| # | Schritt | Erwartung | Beleg |
|---|---------|-----------|-------|
| 1 | Seite im 390×844-Viewport laden | Vollständig gerendert, kein Layout-Bruch | Screenshot |
| 2 | Konsole prüfen | Keine neuen Errors/Warnings ggü. Baseline (Phase 0) | Konsolen-Auszug |
| 3 | Horizontal-Scroll-Check: `document.documentElement.scrollWidth <= 390` per Script evaluieren | true | Ausgabe |
| 4 | Touch-Target-Audit: alle interaktiven Elemente per Script auf `getBoundingClientRect()` ≥ 44×44 prüfen | Liste leer oder begründete Ausnahmen | Audit-Liste |
| 5 | Safe-Area: Screenshot oben (Notch-Bereich) und unten (Home-Indicator) inspizieren | Keine verdeckten/abgeschnittenen Controls | Screenshots |
| 6 | Jede Funktion des Features einmal auslösen (Funktionsliste aus Diagnose abarbeiten) | Verhalten identisch zu Desktop | Protokoll-Tabelle |
| 7 | Performance-Trace während typischer Interaktion aufnehmen | Keine Long Tasks > 200 ms | Trace-Zusammenfassung |
| 8 | Desktop-Viewport (1440×900) laden, Screenshot gegen Baseline diffen | Pixelgleich / keine sichtbare Abweichung | Diff-Ergebnis |
| 9 | Orientierungswechsel-Stichprobe: 844×390 (Landscape) | Kein harter Bruch, Inhalte erreichbar | Screenshot |

---

## V-WETTERKARTE
1. Bottom Sheet: alle drei Snap-Zustände per Drag an der Griffleiste erreichbar; Scroll im Sheet bewegt die Karte nicht.
2. Jeden Layer einzeln an/aus schalten → sichtbare Kartenänderung pro Layer (Screenshot-Stichproben).
3. Model-Switcher: DE → AT → CH durchschalten; Whitelist-Verhalten korrekt, Datenwechsel sichtbar.
4. Fusion⇄Native-Toggle: umschalten, Fallback-Verhalten bei fehlenden Fusion-Daten prüfen (Netzwerk-Tab: erwartete Requests).
5. Windpartikel: Overlay aktivieren, 30 s Trace → Framerate stabil im aktiven Quality-Tier; Konsole ohne WebGL-Warnings. Vermerk: Richtung/Präzision nur auf Real-Device final beurteilbar.
6. Kartengesten: Pan, Pinch-Zoom, Two-Finger-Rotate (falls aktiv) funktionieren neben den neuen Controls.

## V-REGENRADAR
1. Scrubber langsam über die volle Timeline ziehen → jeder Zeitschritt rendert, kein Hängen (Trace).
2. Play/Pause → Animation startet/stoppt zuverlässig; Frame-Wechselrate konstant.
3. Schnelles Hin-und-her-Scrubben → keine Race-Conditions/Fehlframes, Konsole sauber.
4. Netzwerk: Frame-/Tile-Requests unter Fast-4G-Throttling → Ladeindikator statt eingefrorener UI.
5. Legende/Intensitätsskala erreichbar und lesbar.

## V-VORHERSAGE
1. Alle Vorhersage-Parameter durchgehen → jeder Wert/Chart erreichbar.
2. Chart-Datenpunkte per Tap → Detail-Popover erscheint und schließt sauber.
3. Modellvergleich: alle Modelle auswähl- und vergleichbar; horizontale Scroll-Container (falls vorhanden) mit sichtbarem Overflow-Hinweis.
4. Konfidenz-Anzeige: identischer Informationsgehalt wie Desktop (Abgleich gegen Desktop-Screenshot).
5. Scroll-Verhalten: Chart-Interaktion kapert das Seiten-Scrolling nicht.

## V-TOURENPLANUNG
1. GPX-Datei über den Datei-Dialog laden (Test-GPX bereithalten) → Route erscheint auf der Karte.
2. Tour-Detailpanel (Sheet): alle Segmente/Wegpunkte scrollbar erreichbar; Tap auf Segment ↔ Karten-Highlight funktioniert in beide Richtungen.
3. Abfahrtszeit-Optimierer: Zeit ändern → Prognose aktualisiert; Bedienelement daumentauglich.
4. Karte bleibt bei halb geöffnetem Sheet interaktiv.
5. Vermerk für Jan: iOS-Files-App-Upload auf echtem iPhone gegentesten.

## V-EVENT
1. Kompletten Flow durchspielen: Ort eingeben → Zeitraum wählen → Ergebnis.
2. Fokus auf ein Textfeld → kein iOS-Auto-Zoom (font-size ≥ 16 px), passende Tastatur (inputmode).
3. Datumsauswahl per Touch vollständig bedienbar.
4. Best-Day-Ranking: alle Ergebnis-Infos vorhanden (Abgleich Desktop), Hervorhebung klar.

## V-HISTORIE
1. Jeden Zeitraum-/Vergleichsmodus einmal aktivieren → Chart aktualisiert korrekt.
2. Langen Zeitraum laden → Chart bleibt responsiv (Trace), Achsen lesbar.
3. Datenpunkt-Tap → Detailanzeige.
4. Chart-Gesten vs. Seiten-Scroll: vertikales Wischen über dem Chart scrollt die Seite (oder bewusst dokumentierte Alternative).

## V-ATMOSPHAERE
1. Matrix-Test: 3 Linsen × 3 Disclosure-Tiefen = 9 Zustände, jeden einmal ansteuern, Screenshot je Zustand.
2. Inhaltsabgleich: pro Zustand identischer Informationsumfang wie Desktop (Stichproben-Diff).
3. Linsen-Wechsel: sticky Kontrolle bleibt erreichbar, kein Layout-Sprung/CLS im Trace.
4. Disclosure-Übergänge: Animation < 300 ms, kein Scroll-Position-Verlust.

## V-GLOBUS
1. Globus laden → Init ohne WebGL-Errors; verwendeten Renderer/Quality-Tier aus Logs notieren.
2. Ein-Finger-Orbit, Zwei-Finger-Zoom → flüssig, Seite scrollt dabei nicht (touch-action geprüft).
3. 60 s Idle + 60 s Interaktion tracen → stabile Frametimes im Mobile-Tier, kein Speicherwachstum (Heap-Snapshot-Vergleich), kein Context-Loss.
4. UI-Overlays des Globus: erreichbar, ≥ 44 px.
5. **Pflicht-Vermerk:** GPU-Verhalten (Wolken-Ray-Marching, Präzision) final nur auf echtem Gerät beurteilbar → Real-Device-TODO an Jan.

## V-PARITY — WebGL Cross-Device-Parität (Querschnitt-Phase P)
Vorgabe: `audit/webgl-cross-device.md`. Ziel: gleiche Partikeldichte überall, Performance über FPS-Governance statt Partikel-Reduktion. **Emulator-Warnung gilt verschärft** — FPS/Thermik nur real belastbar.
1. **Partikelzahl-Gleichstand:** Bei identischem Viewport/Zoom die effektive Partikelzahl auf Desktop und (emuliertem) Mobile per Skript loggen (`getEffectiveParticleCount`/`_numParticles`) → **gleich** (bzw. nur über CSS-Fläche skaliert, nicht über den Governor). Beleg: Zahlenpaar.
2. **FPS-statt-Partikel:** Unter künstlicher Last (synthetische Render-Dauer / gedrosseltes Profil) fällt die **FPS-Rate** (30→24→20), die **Partikelzahl bleibt konstant**. Beleg: `maxParticleFps`-Verlauf + konstante Zahl.
3. **Bewegungs-Parität:** Partikel-Geschwindigkeit und Trail-Länge über einen FPS-Wechsel hinweg unverändert (dt-Normalisierung greift). Beleg: visueller Vergleich / `frameDtScale`-Prüfung.
4. **Desktop-Referenz:** Fine-Pointer → Top-Tier gepinnt, `maxParticleFps = 0`, ungedeckelt; Verhalten/Screenshot byte-identisch zur Baseline.
5. **Governor-Harness:** `node scripts/verify-governor.mjs` grün (FPS-Ziel-Semantik, alle Checks PASS).
6. **Konsole/Typecheck:** keine neuen WebGL-Warnings, Typecheck grün.
7. 🔴 **Real-Device (Pflicht):** iPhone 12 Pro + schwaches Android — hält die volle Partikelzahl bei geregelter FPS; thermisches Verhalten über ≥ 90 s beobachten (Governor soll FPS senken, nicht die Zahl).

## V-PARITY-2 — Trail-Res-Governance / Hebel 2 (Querschnitt-Phase P2)
Vorgabe: `audit/webgl-cross-device.md` §10. Trail-0,5× ist der **letzte** Governor-Hebel (nach FPS-Floor). **GPU-visuell → Emulator nicht belastbar, Real-Device Pflicht.**
1. **Letzthebel-Ordnung:** Governor-Harness — synthetische Render-Dauer treibt erst die FPS-Leiter (30→24→20), **dann** `trailScale`→0,5; bei Erholung kommt `trailScale`→1,0 **zuerst** zurück, dann FPS hoch. Beleg: `node scripts/verify-governor.mjs` grün inkl. neuer Trail-Checks.
2. **Partikel-Parität bleibt:** Auf der Trail-Sprosse ist `_numParticles`/`getEffectiveParticleCount` **unverändert** (nur die Trail-Auflösung sinkt). Beleg: Zahl vor/auf der Sprosse gleich.
3. **Point-Size-Kompensation:** Bei `trailScale=0.5` bleibt die sichtbare CSS-Partikeldicke gleich wie bei 1,0 (Uniform × trailScale). Beleg: visueller Vergleich real-device.
4. **Filter:** Trail-Texturen `gl.LINEAR` → Upscale weich, nicht blockig (Screenshot Zoom-In auf Partikel).
5. **Abgrenzung:** Diff zeigt kein GLSL-Edit, kein Float-Target; Partikel-State-Textur weiterhin `NEAREST`/voll aufgelöst; Trail-Targets RGBA8. Beleg: Diff + `WindLayer.diagnose()`/`glDiag` (Framebuffer-Completeness auf jeder GPU).
6. **Desktop:** Fine-Pointer nie im FPS-/Trail-Modus → `trailScale` immer 1,0, byte-identisch.
7. 🔴 **Real-Device (Pflicht + visueller Sign-off):** iPhone 12 Pro → Trail-Sprosse wird **nie** erreicht (Partikel scharf). Schwaches Android → Sprosse wird erreicht, volle Partikelzahl gehalten, **Weichheit bewerten** (akzeptabel? Jan entscheidet). Thermik ≥ 90 s beobachten.

## V-PARITY-3 — Repaint-Disziplin / Hebel 5 (Querschnitt-Phase P3)
Vorgabe: `audit/webgl-cross-device.md` §12. **Anders als V-PARITY/-2 grösstenteils emulator-belastbar** — der Loop-Stopp ist JS-beobachtbar.
1. **Hidden-Pause:** Wind sichtbar, dann Tab verstecken (`visibilitychange`, `document.hidden=true` — via DevTools/Script). Repaint-Anforderungen enden (kein weiteres `triggerRepaint`; `repaintCapTimer` gecleart). Beleg: Instrumentierung/Spy oder ausbleibende Frames.
2. **Resume:** Wieder sichtbar → Loop startet neu (ein `triggerRepaint`), Partikel laufen weiter, kein eingefrorener Alt-Trail (P3-4 `clearOnNextFrame`). Beleg: Screenshot vor/nach.
3. **Offscreen-Pause:** Karten-Canvas aus dem Viewport scrollen (falls Layout es zulässt) → `IntersectionObserver ratio 0` → Pause; zurück → Fortsetzung.
4. **Sichtbar+aktiv unverändert:** Bei sichtbarer, aktiver Karte identisches Verhalten wie vorher (Loop läuft, FPS-Cap/Governor unberührt). Desktop byte-identisch.
5. **Abgrenzung:** Diff berührt nur Event-Listener/Scheduling in `WindLayer` (`onAdd`/`onRemove`/`scheduleParticleRepaint`); kein Shader/RGBA8/Trail-Ladder/Fusion. `onRemove` entfernt Listener + `IntersectionObserver.disconnect()` (kein Leak).
6. **Konsole/Typecheck:** keine neuen Errors/Warnings; `npm run typecheck` grün.
7. 🔴 **Real-Device (nice-to-have, nicht gate-blockierend):** Akku-/Thermik-Gewinn bei Hintergrund/Standby beobachten.

## V-TRANSPORT-2 — Layer-Transport / Caching (Infrastruktur-Phase T2)
Vorgabe: `audit/layer-transport.md`. Transport-only, Output-identisch. **Latenz erst nach Netlify-Deploy belastbar** (Dev-Proxy nicht repräsentativ, wie T1); Struktur (Request-Anzahl/-Reihenfolge) lokal 1:1 gültig.
1. **Byte-Gleichheit je Param:** `node scripts/verify-layer-transport.mjs` — für `t_2m`, `vmax_10m`, `tot_prec`, `clcl/clcm/clch/clct` die Bytes über `/_dwd_grib` vs. direkt DWD SHA-256 + Länge identisch. Grün.
2. **Durable-Header:** Antwort trägt `Netlify-CDN-Cache-Control: public, durable, …immutable`; fehlender/unpublizierter Step = `no-store` (nie durable gecacht); Pfad außerhalb `weather/nwp/icon-d2/grib/` = 400.
3. **Manifest-Gate:** Kaltload je Layer im Network-Waterfall — **keine** Directory-Listings (`GET …/<param>/`) und **keine** spekulativen Fehl-Fetches mehr; Steps kommen aus `latest-grib.json`. Fallback: Manifest leeren → Scan-Pfad greift einmalig (kein Dauer-404).
4. **Output-Gleichheit:** Temp/Gust/Precip/Clouds rendern visuell/numerisch identisch vor/nach (Screenshot-Stichprobe + Konsole ohne Decode-Fehler).
5. **Abgrenzung:** Diff berührt Edge-Function/Manifest/Source-`base`/Vite-Proxy/Warm-Cron — **kein** Decode/Norm/Shader/Fusion; `/_dwd_opendata` (Radar) und `/_dwd_wind` (Wind) unverändert.
6. **Konsole/Typecheck:** keine neuen Errors/Warnings; `npm run typecheck` grün.
7. 🔴 **Prod (nach Deploy, Jan):** Durable-Cache-`Cache-Status: … hit` je Param, Kaltload-Latenz vs. T1-Baseline; Warm-Cron `workflow_dispatch` → success/early-exit.

## V-TRANSPORT-2b — EPS/icosahedral-Transport (Infrastruktur-Phase T2b)
Vorgabe: `audit/layer-transport.md` §H. Transport-only (T2b-1…3); Output-identisch. Latenz erst nach Deploy belastbar.
1. **EPS-Byte-Gleichheit:** `node scripts/verify-layer-transport.mjs` — EPS-Params (t_2m, tot_prec, u_10m/v_10m, clct, clat/clon) über `/_dwd_grib` vs. direkt DWD SHA-256 + Länge identisch; Whitelist akzeptiert `icon-d2/grib/` **und** `icon-d2-eps/grib/`, lehnt Fremdpfade (400) weiter ab. Grün.
2. **EPS raus aus `/_dwd_opendata`:** Kaltload mit aktiver Fusion/Punkt-Vorhersage im Network-Waterfall — die `icon-d2-eps_…icosahedral_…grib2.bz2`-Byte-Fetches laufen über `/_dwd_grib` (Directory-Listing darf auf `/_dwd_opendata` bleiben); bei warmem Edge verschwinden die 4–15-s-Fetches.
3. **Fusion-Ergebnis unverändert:** die Fusion-/Punkt-Vorhersage rechnet numerisch identisch (Ensemble-Mittel/Blend unberührt) — Stichprobe vor/nach.
4. **Abgrenzung:** Diff berührt `dwd-grib.ts` (Whitelist), `iconD2EpsSource.ts` (Byte-Base), `warm-grib.mjs`, Verifier — **kein** Decode/Member-Mittel/Resampling/Fusion-Blend; `/_dwd_opendata`+`/_dwd_wind` unverändert; Fusion-Lade-Timing nicht angefasst.
5. **Konsole/Typecheck:** keine neuen Errors/Warnings; `npm run typecheck` grün.
6. **(Optional T2b-4):** vor-resampelte EPS-Grid numerisch == aktuelle Client-Berechnung (Zell-für-Zell-Diff unter Toleranz), bevor der Client-Pfad umgestellt wird.
7. 🔴 **Prod (nach Deploy, Jan):** Durable-`Cache-Status: … hit` je EPS-Param; EPS-Kaltload-Latenz vs. 4–15-s-Baseline.

## V-AUDIT — Live-Netzwerk-Audit pro Layer (Diagnose-Phase T-AUDIT)
Vorgabe + Ergebnis-Ablage: `audit/live-network-audit.md`. Reine Diagnose gegen Prod, kein Code. **Netzwerk ist emulator-belastbar** (kein Real-Device).
1. **Setup:** Chrome DevTools MCP, frisches Profil; IndexedDB (`buscosun-wind`), Cache-API (`icon-d2-grib-decompressed-v1`, `radolan-rv-tar-v1`), HTTP-Cache **vor** der Baseline leeren; Service-Worker-Status notieren.
2. **Bare Cold-Load** der Ziel-URL → Waterfall aufzeichnen (`list_network_requests`); je Request voller Pfad, Bytes, Dauer und **Response-Header** (`Cache-Status`/`Netlify-CDN-Cache-Control`/`age`) via `get_network_request`.
3. **Per Layer einzeln:** jeden UI-Layer nacheinander aktivieren, Delta-Traffic erfassen; zwischen den Layern Zustand notieren (nicht Client-Cache leeren — reale Warm-Wiederverwendung ist Teil des Befunds).
4. **Klassifikation:** je Request Route (`/_dwd_wind`/`/_dwd_grib`/`/_dwd_opendata`/Tiles/brightsky/…) + Edge-HIT vs. Origin-MISS.
5. **Auffälligkeiten:** Top-10 langsamste Requests, Origin-MISS trotz Warm-Cron (Warm-Lücke), Directory-Listings auf dem kritischen Pfad, Doppel-Fetches; T2b-Deploy-Status (EPS-Route).
6. **Analyse:** priorisierte Verbesserungen je Layer (§4) mit Beleg. **Kein Code**; Fusion-Lade-Timing nur benennen.

## V-TRANSPORT-2c — Prod-Manifest-Advance-Fix (Infrastruktur-Phase T2c)
Vorgabe: `audit/layer-transport.md` §J. Ops-/Transport-Fix an der Commit-Back-Kette; output-identisch. Verifikation grösstenteils in Prod = Jans Gate.
1. **Ursache belegt (T2c-1):** GitHub-Actions-Log des `warm-grib`-Commit-Steps zitiert (Race „non-fast-forward" / „protected branch" / „nothing to commit" / Step nie erreicht).
2. **Fix lokal geprüft:** die geänderte Commit-Back-Sequenz (`fetch`+`rebase`+Retry) ist syntaktisch korrekt; Trockenlauf/Erklärung, dass Wind+Grib disjunkte Dateien sind → Rebase konfliktfrei.
3. **Abgrenzung:** Diff berührt nur `.github/workflows/warm-grib.yml` (+ ggf. `warm-wind.yml`, Zeitplan); **kein** Client-/Decode-/Fusion-Eingriff. `npm run typecheck` grün.
4. 🔴 **Prod (nach Fix + Live-Cron, Jan):** `curl https://<prod>/latest-grib.json` → **aktueller** Lauf (== Wind-Lauf) + `warmedThroughProxy`=Prod-URL (nicht `localhost:5196`).
5. 🔴 **Prod-Kaltload:** 2D-Layer (Temp/Böen/Niederschlag/Wolken) → `Cache-Status: … hit` statt `fwd=stale`; Kaltload-Latenz je Datei ~150–600 ms (wie Wind), nicht mehr Origin.
6. 🔴 **Regression:** keine `git push`-Rejects mehr in den `warm-grib`- und `warm-wind`-Logs über mehrere Läufe.

## V-GEWITTER — Gewitterpotenzial-Layer (Feature-Phase F1)
Vorgabe: `audit/gewitterpotenzial.md`. Neuer, standardmäßig inaktiver Layer aus `cape_ml` × `cin_ml` × `lpi`. **Netzwerk/Interaktion emulator-belastbar; Feld-Plausibilität braucht eine echte Konvektionslage.**
1. **Fusion-Harness:** `node scripts/verify-thunder.mjs` grün — ruhig (kein CAPE) → „keine"; hohes CAPE + offener Deckel (kleines |CIN|) + LPki>0 → „hoch"; hohes CAPE + starker Deckel (großes |CIN|) → gedämpft unter die offene Lage; Score monoton & clamped 0..100.
2. **Lazy-Load (kritisch):** Kartenstart im Network-Waterfall → **keine** `cape_ml`/`cin_ml`/`lpi`-Requests. Erst der Layer-Toggle „Gewitter" löst genau diese drei Grid-Fetches aus (über `/_dwd_grib`). Beleg: Waterfall vor/nach Toggle.
3. **Rendering:** bei einer realen Konvektionslage plausibles Muster (hoher Index dort, wo CAPE hoch UND Deckel offen UND LPI>0); Domänenrand **transparent** maskiert (kein 0-Wert-Einfärben); Legende fünfstufig lesbar (keine/gering/erhöht/deutlich/hoch).
4. **Slider/Refresh:** Zeit-Slider bewegt den Layer über die verfügbaren Steps; 30-min-`refreshIconD2Layers` zieht bei aktivem Layer nach; kein Hängen (Trace).
5. **Abgrenzung:** `git diff` berührt nur `iconD2Thunder.ts`/`thunderPotential.ts`/Rampe + additive `MapView.tsx`-Seams; **kein** Wind-Shader/RGBA8/Fusion/EPS/Radar/Decode-Eingriff (Diff-Beleg).
6. **Mobile (390×844):** Toggle im Sheet-Layer-Segment erreichbar, Touch-Target ≥ 44 px, Legende sichtbar, keine neuen Konsolenfehler; Desktop mit aktivem **und** inaktivem Layer sauber; `npm run typecheck` grün.
7. **Ehrlichkeit:** Tooltip/Legende benennen Domänengrenze, ~0–12-h-Horizont und „Potenzial ≠ Auslösung"; keine Falsch-Sicherheit über den Horizont hinaus.

## V-BLITZ-VORHERSAGE — Blitz-Vorhersage-Layer / LPI (Feature-Phase F2)
Vorgabe: `audit/blitz-vorhersage.md`. Neuer, standardmäßig inaktiver Einfeld-Layer aus `lpi_max`. Eigenständig neben „Blitze" (Messung). **Netzwerk/Interaktion emulator-belastbar; Feld-Plausibilität braucht eine echte Konvektionslage.**
1. **Lazy-Load (kritisch):** Kartenstart im Network-Waterfall → **keine** `lpi_max`-Requests. Erst der Toggle „Blitzprognose" löst den Grid-Fetch aus (über `/_dwd_grib`). Beleg: Waterfall vor/nach Toggle.
2. **t+0 nicht leer:** bei Slider „jetzt" ist der Layer **nicht** flächig leer (Intervall-Maximum `lpi_max` → `minStepHours=1` greift, wie Böen); Domänenrand transparent maskiert (kein 0-Einfärben).
3. **Slider/Vorausschau:** Zeit-Slider bewegt den Layer über die verfügbaren Steps (0–12 h voraus); 30-min-`refreshIconD2Layers` zieht bei aktivem Layer nach; kein Hängen (Trace).
4. **Abgrenzung zur Messung:** „Blitze" (`Accumulated_Flash_Area`, Vergangenheit) und „Blitzprognose" (LPI, Zukunft) gleichzeitig aktiv → optisch unterscheidbar (andere Palette/Legende); Tooltips benennen Prognose ≠ Messung und verweisen aufeinander.
5. **Rendering:** bei einer realen Konvektionslage plausibles Risikomuster (hoher LPI dort, wo das Modell Konvektion erzeugt); ruhiger Tag erwartungsgemäß fast leer (korrekt, kein Fehler).
6. **Diff/Abgrenzung:** `git diff` berührt nur `iconD2Lpi.ts` + Rampe + additive `MapView.tsx`-Seams; **kein** `dwdLightning.ts`/Wind-Shader/RGBA8/Fusion/EPS/Radar/Decode-Eingriff (Diff-Beleg).
7. **Mobile (390×844):** Toggle im Sheet-Layer-Segment erreichbar, Touch-Target ≥ 44 px, Legende sichtbar, keine neuen Konsolenfehler; Desktop mit aktivem **und** inaktivem Layer sauber; `npm run typecheck` grün.

## V-SIM-RADAR — Simuliertes-Radar-Layer / dbz_cmax (Feature-Phase F3) — ⛔ STILLGELEGT ZUGUNSTEN N1 (2026-07-24)
> **Stillgelegt.** Layer in Phase N1 restlos entfernt; dieses Protokoll ist Historie. Aktuell gilt **V-NIEDERSCHLAG** (unten).
Vorgabe: `audit/simuliertes-radar.md`. Neuer, standardmäßig inaktiver Layer aus `dbz_cmax` in der bestehenden Radar-Optik. Verlängert den Nowcast über 2 h hinaus. **Netzwerk/Interaktion emulator-belastbar; Feld-Plausibilität braucht eine echte Konvektionslage.**
1. **Lazy-Load (kritisch):** Kartenstart im Network-Waterfall → **keine** `dbz_cmax`-Requests. Erst der Toggle „Sim-Radar" löst den Grid-Fetch aus (über `/_dwd_grib`). Beleg: Waterfall vor/nach Toggle.
2. **Optik-Konsistenz:** die simulierte Reflektivität rendert in **derselben** Radar-Farbskala wie Regenradar/Niederschlag (dBZ→mm/h via `radarModel.ts`); t+0 plausibel gefüllt (kein `minStepHours` nötig); Domänenrand transparent maskiert.
3. **Horizont-Mehrwert:** Slider über 2 h hinaus (z. B. +6 h) → Layer zeigt weiter ein Radarbild, wo der Nowcast endet; Vorwärtsschau bis Step-Cap; 30-min-`refreshIconD2Layers` zieht bei aktivem Layer nach; kein Hängen (Trace).
4. **Abgrenzung zur Messung:** „Sim-Radar" (Modell) und „Niederschlag"/Regenradar (Messung) gleichzeitig nachvollziehbar; Tooltip/Legende benennen „simuliert" und die 0–2-h-Präferenz fürs echte Radar.
5. **Diff/Abgrenzung:** `git diff` berührt nur `iconD2Dbz.ts` + additive `MapView.tsx`-Seams; **kein** `nowcast`/RainLayer/RADOLAN/`radarModel.ts`-Verhalten/Wind-Shader/RGBA8/Fusion/EPS-Eingriff (Diff-Beleg).
6. **Mobile (390×844):** Toggle im Sheet-Layer-Segment erreichbar, Touch-Target ≥ 44 px, Legende sichtbar, keine neuen Konsolenfehler; Desktop mit aktivem **und** inaktivem Layer sauber; `npm run typecheck` grün.

## V-SCHNEE — Schneehöhe-&-Neuschnee-Layer (Feature-Phase F4)
Vorgabe: `audit/schnee.md`. Neuer, standardmäßig inaktiver Layer „Schnee" mit zwei Modi (Schneedecke `h_snow` / Neuschnee cm). **Netzwerk/Interaktion emulator-belastbar; cm-Plausibilität braucht eine echte Schneelage.**
1. **`freshsnw`-Semantik belegt:** in der Diagnose dokumentiert, dass Neuschnee **nicht** aus `freshsnw` (Frische-/Albedo-Faktor 0..1), sondern aus `snow_gsp`(+`snow_con`)/`h_snow`-Δ kommt (GRIB-shortName/Einheit geprüft).
2. **Lazy-Load (kritisch):** Kartenstart im Waterfall → **keine** `h_snow`/`snow_gsp`-Requests. Erst der Toggle „Schnee" löst den Fetch aus (über `/_dwd_grib`); Modus-Wechsel Schneedecke↔Neuschnee lädt das jeweils andere Feld lazy nach. Beleg: Waterfall.
3. **t+0-Verhalten:** Schneedecke (`h_snow`, instantan) bei „jetzt" plausibel gefüllt (kein `minStepHours`); Neuschnee (Akkumulation) nutzt `minStepHours=1`, ist bei t+0 nicht künstlich leer; Domänenrand transparent.
4. **cm-Plausibilität:** in einer Schneelage plausible Werte (Schneedecke Alpen > Flachland; Neuschnee-Summe wächst mit dem Horizont); SWE→cm über die `alpineSplit.ts`-Konstante (`rho_snow` bevorzugt) nachvollziehbar.
5. **Abgrenzung:** `snowline` (ML-Linie, bestehend) + `snow` (Raster, neu) gleichzeitig nutzbar, klar getrennt; Schnee-Palette optisch ≠ Regen-Palette.
6. **Diff/Abgrenzung:** `git diff` berührt nur `iconD2Snow.ts` + additive `MapView.tsx`-Seams; **kein** `snowline`/`climaField`/`alpineSplit.ts`-Verhalten/Wind-Shader/RGBA8/Fusion/EPS/Radar-Eingriff (Diff-Beleg).
7. **Mobile (390×844):** Toggle + Modus-Switch im Sheet-Layer-Segment, Touch-Targets ≥ 44 px, Legende sichtbar, keine neuen Konsolenfehler; Desktop mit aktivem **und** inaktivem Layer sauber; `npm run typecheck` grün.

## V-ROTATION — Superzellen-/Rotationspotenzial-Layer (Feature-Phase F5)
Vorgabe: `audit/rotationspotenzial.md`. Neuer, standardmäßig inaktiver **Experten**-Layer aus `uh_max`(+`uh_max_low`)+`sdi_2`. **Netzwerk/Interaktion emulator-belastbar; Feld-Plausibilität braucht eine echte Schwergewitter-Lage. Ehrlichkeits-Leitplanken §0 sind gate-blockierend.**
1. **Fusion-Harness:** `node scripts/verify-rotation.mjs` grün — ruhig→„keine"; hohe UH + SDI-Signatur→„hoch"; nur schwache UH→„gering"; Nachbarschafts-Glättung dämpft Einzelpixel; Score monoton & clamped 0..100.
2. **Lazy-Load (kritisch):** Kartenstart im Waterfall → **keine** `uh_max`/`sdi_2`-Requests. Erst der Toggle „Rotation" löst die Fetches aus (über `/_dwd_grib`). Beleg: Waterfall vor/nach Toggle.
3. **Feld-Semantik/t+0:** `minStepHours=1` greift (t+0 nicht künstlich leer trotz Intervall-Maximum); SDI-Vorzeichen/Wertebereich im Decode dokumentiert; Domänenrand transparent.
4. **Ehrlichkeit (gate-blockierend):** Tooltip/Legende benennen „kein amtliches Warnprodukt" (Verweis DWD-Warnungen), „Verdacht ≠ Ereignis", „hohe Fehlalarmrate", „Experten-Layer"; Sprache **nie** „Tornado"; Darstellung sichtbar geglättet (kein Einzelpixel-Alarmismus).
5. **Rendering:** bei einer echten Schwergewitter-Lage plausible Verdachtsflächen; ruhige Lage erwartungsgemäß leer.
6. **Diff/Abgrenzung:** `git diff` berührt nur `iconD2Rotation.ts`/`rotationPotential.ts` + Rampe + additive `MapView.tsx`-Seams; **kein** `dwdAlerts`/`convectiveIndex.ts`-Verhalten/Wind-Shader/RGBA8/Fusion/EPS/Radar-Eingriff (Diff-Beleg).
7. **Mobile (390×844):** Toggle im Sheet-Layer-Segment erreichbar, Touch-Target ≥ 44 px, Legende (inkl. Experten-Hinweis) sichtbar, keine neuen Konsolenfehler; Desktop mit aktivem **und** inaktivem Layer sauber; `npm run typecheck` grün.

### Ergebnis 2026-07-24 (Gate GF5 grün) — MCP-belegt, Dev :5198
1. ✅ `npm run verify:rotation` → **30/30 PASS** (inkl. der 12 in-App-Checks via `window.__verifyRotationPotential`, im Browser 12/0 bestätigt): ruhig→keine · schwache UH (8)→gering · hohe UH (45)+SDI→hoch · SDI korroboriert/senkt nie · SDI allein (5e-4) unter Schwelle · monoton & clamped 0..100 · vorzeichen-invariant · NaN→NaN · Glättung dämpft Einzelpixel (100→36) · breite Fläche erhalten · NaN-Maske erhalten.
2. ✅ **Lazy-Load im CDP-Waterfall belegt:** Kartenstart + vor Toggle **0** `uh_max`/`uh_max_low`/`sdi_2`-Requests (Cache geleert, sauberer Reload). Nach Toggle „Rotation": Directory-Probe `/_dwd_opendata/…/uh_max/` + **je 12 Steps (001–012) × 3 Felder = 36 Requests** über `/_dwd_grib/…/icon-d2/grib/12/{uh_max,uh_max_low,sdi_2}/` (Lauf 2026072412), alle 200. Generischer Proxy → **kein** `dwd-grib.ts`/`warm-grib`-Eingriff nötig.
3. ✅ **`minStepHours=1`:** Steps beginnen bei **001** (kein 000 geladen). **SDI-Sign/Range im Decode dokumentiert** (Konsole-Debug: `sdi_2 decode min=-2.01e-4 max=1.99e-4` — winzig, signiert, betrags-invariant fusioniert, wie Diagnose §8.2). Domänenrand transparent (NaN-Anker `uh_max`).
4. ✅ **Ehrlichkeit (gate-blockierend):** Tooltip **und** Legende (Desktop+Mobile) tragen alle §0-Aussagen — „Kein amtliches Warnprodukt, kein Warnersatz — maßgeblich sind die DWD-Warnungen (Layer „Blitze"/amtliche Unwetterwarnung)", „Verdacht ≠ Ereignis", „hohe Fehlalarmrate", „Experten-Layer", „bewusst geglättet". **Wort „Tornado" nirgends in UI-Copy** (§4.2-Vorschlag bewusst zugunsten §0.2 überschrieben → „Superzellen: Großhagel, organisierte Schwergewitter"). Darstellung geglättet (3×3-Max→5×5-Mittel).
5. ✅ **Rendering:** 24.07. ist ein **rotationsschwacher** Tag (Diagnose §8.2: |uh_max| einstellig, sdi_2 ~0) → Layer nach Glättung **erwartungsgemäß transparent** über DACH (ehrlicher Under-Paint, §0.4). Renderpfad belegt: 36 Frames geladen/dekodiert/fusioniert (Konsole-Decode), `ScalarLayer.setData` je Slider-Tick; Harness beweist, dass eine Score-33-Zelle (t=0,33 > visRange 0,24) rendern **würde**.
6. ✅ **Diff additiv:** F5 = 3 neue Dateien (`iconD2Rotation.ts`, `rotationPotential.ts`, `verify-rotation.mjs`) + additive Seams in `MapView.tsx`/`LayerIcon.tsx`/`LayerInfoPanel.tsx` + `package.json`-Script. `convectiveIndex.ts` nur **gelesen** (`import { ramp }`; die `M`-Markierung stammt aus F1). `dwdAlerts`/Wind-Shader/RGBA8/Fusion/EPS/Radar unberührt.
7. ✅ **Mobile 390×844:** Toggle im „Layer"-Sheet (Gruppe Niederschlag, neben „Gewitter"), Touch-Target **358×56 px** (≥44), violette Aktiv-Optik + Spiral-Icon; Legende inkl. Experten-Hinweis voll sichtbar auf der Karte. Desktop mit Layer **aus** = Standardkarte (additiv, Default inaktiv). Konsole (Desktop+Mobile) **leer** (error/warn). `npm run typecheck` grün.

## V-NIEDERSCHLAG — Niederschlags-Ansicht „jetzt–2 h" (gemessenes Radar/Nowcast) (Konsolidierungs-Phase N1)
Vorgabe: `audit/niederschlag-vereinheitlichung.md` (+ §11 Revision). **Jan-Entscheidung 2026-07-24: nur die gemessene Radar-/Nowcast-Hälfte (DE ≤2 h · AT ≤3 h · CH <0,5 h); Modell-/Fusionshälfte (2–12 h) draußen — kürzer & ehrlicher. SIM-Radar bleibt stillgelegt.** Verifiziert 2026-07-24, Dev :5204.
1. ✅ **Abstraktions-Harness:** `npm run verify:precip-source` → **ALLE 30 CHECKS PASS** — Radar-Fenster + Grenzen (DE 2 / AT 3 inkl., CH 0,5 strikt), **keine Modellverlängerung** jenseits des Horizonts (`ready:false`), DACH-OR-Sichtbarkeit (bei 2,5 h führt nur AT INCA), Slider-Horizont = max geladener Radar-Horizont.
2. ✅ **Slider kurz (jetzt–2/3 h):** Im Testmodus „Nur-Jetzt" (Default-Landing) mit aktivem Niederschlag ist der Slider auf **max 3 h** (AT INCA) begrenzt (`sliderMax` nutzt `precipRadarHorizonHours`), MCP `valuemax="3"`. Jenseits des Land-Horizonts blendet der Layer aus (kein Modell). Beleg: `audit/screenshots/niederschlag/de-desktop-2h-radaronly.png`. (WebGL-Emulator nicht pixel-repräsentativ, CLAUDE.md.)
3. ✅ **Radar-only belegt:** Datenlage „Niederschlag · DACH-KOMPOSIT · DE RADOLAN · AT INCA · CH RZC" — **ohne** „+ ICON-D2"; der Kompositor wird ohne `d2` aufgerufen, `precip-forecast` fest unsichtbar. Der `RainLayer` (nur gemessenes Landesradar) ist die einzige Precip-Quelle.
4. ✅ **SIM-Radar restlos weg:** kein `simradar`-Toggle/-Legende/-Deck-Eintrag (MCP Desktop+Mobile); `git grep simradar` in `src/` **leer** (nur `Sim-Radar`-Historie im `radarModel.ts`-Kommentar + `audit/`); `src/sources/iconD2Dbz.ts` gelöscht; keine toten Imports (`typecheck` grün); `radarModel.ts`/Regenradar (`expertDbz`) unberührt.
5. ✅ **Erhalt:** `flownowcast`/`poprob` unverändert; Model-Switcher DE/AT/CH (Tabs MCP, Komposit bleibt DACH); Fusion⇄Native-Selektor da (wirkt auf Temp/Wind/Wolken; auf Niederschlag bewusst nicht mehr, da keine Modellhälfte); der `confidence`-Schleier behält seine ICON-D2-PoP-Heuristik (AT/CH), da `iconD2Ref` weiter geladen wird; **`git diff -- src/fusion/` leer**.
6. ✅ **UI-Entkopplung:** kein „Radar/Modell"-Wahlschalter; Verfügbarkeit zentral über `precipCompositeReady`. Titel/Tooltip/Info-Panel/Deck-Sub: „Niederschlag · jetzt–2 h" (MCP-Snapshot bestätigt Beschreibung „…gemessenes Landesradar/Nowcast … keine Modell-Verlängerung").
7. ✅ **Doku:** `docs/niederschlag-architektur.md` (radar-only 2 h neu geschrieben) + Verweis im Radar-Feature-Katalog; Spec §10 (Diagnose) + §11 (Revision); F3-Doku „stillgelegt zugunsten N1".
8. ✅ **Konsole/Typecheck/Mobile:** Konsole (Desktop) **leer** (error/warn, MCP); `npm run typecheck` **grün**; Mobile-Belege aus der Vorrevision weiter gültig (Niederschlag-Toggle im „Layer"-Sheet, Touch-Target 358×56 px, kein Sim-Radar) — `audit/screenshots/niederschlag/mobile-*`, `at-desktop.png`, `ch-desktop.png`. Desktop bis auf die gewollten Änderungen unverändert (SIM-Radar weg, Label „jetzt–2 h", Slider kurz).

---

## Beleg-Ablage
- Screenshots: `audit/screenshots/<feature>/{before,after}/`
- Traces: `audit/traces/<feature>/`
- Audit-Berichte: `audit/<feature>.md` (Diagnose + Verify-Protokoll + Selbstverifikations-Antworten)
