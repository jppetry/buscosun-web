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

## V-WIND-GRIB — Wind-Partikel: Treue zu den GRIB-Werten (Phase WG1)
Vorgabe: `audit/wind-partikel-grib-treue.md`. Vertrag: `px/s = A(z) · |V|`, streng linear, keine Kennlinie, kein Mindesttempo, kein Gerätefaktor. Der Zoom verändert ausschließlich `A(z)`. Mathematik: `src/wind/advection.ts`.
1. **Headless-Harness:** `npm run verify:wind-advection` → **50/50 grün**. Prüft die Shader-Formel gegen eine *unabhängige* Referenz (Luftpaket-Advektion nach Kugelgeometrie + dieselbe Mercator-Projektion), nicht gegen sich selbst. Enthält T7 als Regressionswächter: die ALTE Formel muss reproduzierbar 0,500 (Nord/Ost) bzw. 26,565° (45°-NO) erzeugen — sonst misst der Verifier nicht mehr, was er soll.
2. **Richtung (Isotropie):** Nord/Ost-Verhältnis = **1,000** (± 0,002) bei 45/48/51/55°N. **Vorher exakt 0,500** — der Faktor-2-Fehler. Live-Gegenprobe: `nsEwGainRatio` 0,925–1,005.
3. **Betrag (Linearität):** Verhältnis 20 m/s : 2 m/s = **10,000** (headless, 1e-9). Live je Windstärke-Band 5,92–6,09 gegen Soll 6,00 (**±1,5 %**); unter der alten γ-Kennlinie hätten dieselben Bänder um Faktor 6,3 auseinandergelegen.
4. **Zoom ändert nur die Darstellung:** 10 m/s ⇒ 60,0 px/s auf z2…z11 konstant (headless); live über z4/5,3/7/9/11 breiten-normiert 5,88–5,97 (**±0,75 %**). Richtung zoom-invariant < 0,01°.
5. **Ende-zu-Ende gegen echte GRIB-Werte:** `__bsSample.wind(lon,lat)` liefert die Wahrheit am Punkt, `__map.style._layers.wind.implementation.windMotionDiag({ sampler, frames })` misst die tatsächliche Partikelbewegung per `readPixels`. Konsolen-Einzeiler:
   `await __map.style._layers.wind.implementation.windMotionDiag({ count: 2400, frames: 10, sampler: (a,b) => __bsSample.wind(a,b) })`
   ⚠️ **`frames` MUSS gerade sein.** Auf manchen GL-Stacks zerfällt das Ping-Pong-Paar in zwei frameweise alternierende Populationen (vorbestehend, s. `shaders.ts` §segDrawVert und V-178) — bei ungerader Frame-Zahl misst man zwei verschiedene Partikelmengen und erhält reines Rauschen. `windMotionDiag` rundet deshalb selbst auf gerade.
6. **Richtungs-Restfehler richtig einordnen:** `bearingErrBySpeed` muss **mit steigender Windstärke fallen** (gemessen: <1 m/s 10,4° → >8 m/s 1,1°). Das ist die Signatur der Feld-Quantisierung. Ein *stärkeunabhängiger* Fehler wäre ein echter Advektions-Richtungsfehler (so wie der alte: 19,47°, konstant).
7. **Totzone:** `stalledPct` — Partikel, deren Schritt unter der Rundungsschwelle der Positionskodierung liegt. Headless: 0,5 m/s liegt auf **jeder** Zoomstufe 4,2× darüber (welt-relativ war es bei z9 0,02×). Live verbleiben ~10 % stehende Partikel in richtungsvariablem Gelände — Ursache ist die getrennte u/v-Glättung, **nicht** die Kodierung (Nachweis: Glättung nachgebildet ⇒ 0,34 → 0,22 m/s an genau diesen Punkten, bei bewegten Partikeln 1,245 → 1,227). Erfasst als V-177.
8. **Geräte-Unabhängigkeit:** 390×844 muss dieselbe Verstärkung liefern wie 1440×900 (gemessen 5,906 gegen 5,946). Die frühere Dämpfung `viewportSpeedRefPx` ist bewusst aus — s. V-180.
9. **Funktionserhalt + Konsole:** Trail, FrameGovernor, dt-Normierung, Sub-Steps, Farbrampe/Heatmap, Dichte-/Punktgröße-Regler, Höhen-Umschalter, Globus, Segment-Stil (default-off) unverändert; Konsole 0 Fehler; `npm run typecheck` grün.
10. 🔴 **Real-Device (offen):** Der Testbrowser fiel auf ein `byte`-Windfeld zurück (kein Half-Float). Auf echter GPU sollten Winkelfehler und Standrate niedriger liegen — **nicht belegt**, Gegenprobe steht aus. Ebenso ungesichtet: die Globus-Ansicht (Tempo rechnerisch kalibriert, `speedRefZoom: 2`).

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

## V-KDR — Layer-Beschreibungen in der Readout-Spalte (Phase KD-R)
Vorgabe: `audit/karten-readout.md`. Die Beschreibungen der Wetter-Layer wandern aus der Kartenfläche in die Readout-Spalte am rechten Rand (Desktop/Tablet); Mobile bleibt unverändert. **Reine UI-/Layout-Phase — emulator-belastbar; rAF-/FPS-Messungen sind es nicht (`agents.md` §7).**
1. **Alle 16 LayerKeys:** je Layer erscheint bei Aktivierung genau eine Beschreibungs-Karte in der Spalte und verschwindet beim Deaktivieren; 11 gedockte per UI, 5 nicht gedockte per `#m=`-Permalink (Bitmaske 1928).
2. **Karte frei:** `.mdk-stage .mdk-legends` und `.mdk-stage .layer-info` sind auf Desktop/Tablet in **jedem** Zustand 0.
3. **Reihenfolge + Leerzustand:** Stapel folgt der Dock-Reihenfolge; ohne aktiven Layer ist der Abschnitt vollständig aus dem DOM.
4. **Dynamik erhalten:** Schnee-Modus, Sicherheit Regen/Temperatur und der Experten-Zusatz wechseln in Titel **und** Detailtext.
5. **Scroll:** mit Punktforecast in der Spalte deckelt der Stapel (46 vh) und scrollt in sich; ohne ihn nutzt er die volle Spalte.
6. **Funktionserhalt Vorschau:** Hover/Fokus auf einer inaktiven Dock-Zeile zeigt die Beschreibung transient als Vorschau-Karte — kein Overlay über der Karte.
7. **Kartenelemente unberührt:** Zeit-Deck-Farbrampen-Legende, Zeit-Slider, Quellen-Pille, Status-Chip, Wind-Deck, Zoom, MapLibre-Attribution, Punktforecast/7-Tage.
8. **Mobile 390×844 unverändert** (Geometrie-Messung vorher/nachher), `embedded`-Modus strukturell unberührt, Konsole sauber, `npm run typecheck` grün.

### Ergebnis 2026-08-01 (Gate G-KDR grün) — MCP-belegt, Dev :5300
1. ✅ **16/16.** Skript-Durchlauf über alle 11 Dock-Zeilen: je Layer `onCards` = genau die eigene Karte, `offCount` = 0, `mapOverlay` = 0 — Niederschlag · Gewitter · Rotation · Schnee · Wind · Böen · Temperatur · Satellit · Blitze · Blitzprognose · Stationen. Die 5 nicht gedockten (`clouds`, `confidence`, `snowline`, `flownowcast`, `poprob`) per `#m=`-Permalink `b=1929`: alle fünf mit Karte inkl. `trust`-Zeile („✓ Reliability/Brier headless kalibriert · Seite Validierung") — `after-desktop-1440-hidden5.png`.
2. ✅ **Karte frei.** In allen Durchläufen und Screenshots 0 Overlay-Treffer im Stage. Vorher-Beleg der Fehlwirkung: `before-desktop-1440-legends.png` (drei Karten verdecken die Karte, die dritte abgeschnitten) und `before-desktop-1440-hoverinfo.png` (Hover-Panel bei x=297 über der Bühne, gemessen).
3. ✅ **Reihenfolge/Leerzustand.** Gemessene Titelfolge = Dock-Reihenfolge. Alle Layer aus ⇒ `sectionInDom: false`.
4. ✅ **Dynamik.** Schnee: „Schnee · Schneedecke" + `h_snow`-Text ⇄ „Schnee · Neuschnee" + `snow_gsp+snow_con`-Text. Sicherheit mit aktivem Niederschlag: „Sicherheit · Regen" + Ensemble-Spread-Text (`b=130`). Rotation: „· Experten-Layer".
5. ✅ **Scroll.** `?startnow=0` + Ort: Abschnitt 413 px (= 46 vh), Stapel `clientHeight 374 / scrollHeight 1647` → scrollt in sich, Punktforecast sichtbar (`after-desktop-1440-with-pointforecast.png`). Übersichts-Modus: `is-solo`, voller Stapel (`after-desktop-1440-6layers.png`).
6. ✅ **Vorschau.** Fokus auf „Böen" (inaktiv) ⇒ Karte mit gestricheltem Rahmen + Chip „Vorschau" an Position 6 der Ordnung, ohne die aktiven Karten zu verschieben (`after-desktop-1440-preview.png`).
7. ✅ **Kartenelemente.** Zoom-Klick, Slider 0 → +3 h („+3 h · Sa 16:38"), Modellseiten-Overlay öffnet/schließt, Punktforecast lädt (München, 26°, Konfidenz 85 %). Zeit-Deck-Legende/Status-Chip/Quellen-Pille/Wind-Deck in allen After-Screenshots vorhanden. Bühne 1280: **716 px vorher = nachher**; 1440: 818 → 794 px (Readout 324 → 348 px, dokumentierter Desktop-Groß-Zuschlag).
8. ✅ **Mobile identisch.** `.mdk-legends`-Rechteck vorher **und** nachher `x:178, y:192.41, w:200, h:337.59`; `.mdk-readout` nicht gerendert, 0 Readout-Karten (`before-/after-mobile-390-legends.png`). `embedded` kehrt bei `MapView.tsx:3157` zurück, neuer Code ab `:3160`. Konsole über 1440/1280/390 **0 Errors, 0 Warnings**. React-Commit für eine Beschreibungs-Karte 0,4–8,6 ms (11 Messungen), Toggle 0,4–1,1 ms → weit unter der 200-ms-Grenze. `npm run typecheck` grün.

## V-DATENALTER — Datenalter, Datenlage, Ground-Truth (Phase R2, V-19/V-20/V-21)
Vorgabe: `audit/datenalter-und-datenlage.md`. Die Statusflächen zeigen die **Referenzzeit der Daten** statt des Abrufzeitpunkts; der Zustand der Warm-Manifeste wird sichtbar; der Hit-Rate-Rückblick benennt seine Referenz. **Reine Anzeige-/Datenherkunfts-Phase — kein Renderpfad, keine GPU-Aussage nötig.**
1. **Drei Formate:** Modelllauf → „Lauf HHz · vor N h"; Messung → „Stand HH:MM · vor N min"; **ohne** Referenzzeit → „abgerufen HH:MM" (kein behauptetes Alter).
2. **Vollständigkeit:** jeder `ok`-Status in `MapView.tsx` trägt entweder eine `ref` oder eine ausdrückliche Begründung im Kommentar davor.
3. **Eine Quelle:** alle drei Statusflächen (`.data-badge`, Layer-Zeile im Dock, `.mdk-status-chip`) formatieren über denselben Helfer.
4. **Stale-Hinweis:** ab 9 h `⚠` + Klasse `is-stale` + erklärender Tooltip; **keine** Fehlerfarbe, **kein** neuer Farb-Token.
5. **Komposit:** DACH-Niederschlag erbt die **älteste** Messzeit; Quellen ohne Zeitangabe (AT-INCA) gehen nicht ein und erfinden keine.
6. **Manifest-Zustand:** `absent`/`stale` erzeugen je eine eigene, zutreffende Zeile — auf Desktop **und** Mobil; ein gesundes Manifest ohne den angefragten Param erzeugt **keine**.
7. **V-21:** Der Rückblick benennt den Analyse-Konsens als Referenz und weist den Absolutwert als Untergrenze aus.
8. Konsole sauber, `typecheck` + `build` grün, `verify:datenalter` grün, Red-Test belegt.

### Ergebnis 2026-08-01 (Gate GR2 grün) — Playwright-MCP belegt, Dev :5201
> Hinweis: Der Chrome-DevTools-MCP-Browser war durch die parallele KD-R-Session belegt (Profil-Lock) — verifiziert wurde mit Playwright-MCP bei identischen Viewports (1440×900 / 390×844).

1. ✅ **Alle drei Formate gleichzeitig gemessen** (DOM-Auslesung, 14:31): Wind/Temperatur/Gewitter „Lauf 09z · vor 3 h" · Niederschlag „DACH-KOMPOSIT · DE RADOLAN · AT INCA · CH RZC · **Stand 14:25 · vor 6 min**" · Satellit „**Stand 14:00 · vor 31 min**" (echte WMS-`TIME`, vorher wurde hier die Abrufzeit gezeigt) — `desktop-karte.png`.
2. ✅ **24 `ok`-Aufrufe, 0 unbelegt** (Quell-Sonde im Verifier). Vier Stellen dauerhaft ohne Referenzzeit: Fusions-Temperatur (mischt mehrere Läufe) · Stationsnetz (Zeit je Station) · Klima-MOS (statisches Asset) · dazu drei provisorische WMS-Stellen bis zum `TIME`-Fetch.
3. ✅ **3 Aufrufstellen** von `statusStamp`, `fmtTime`-Anzeige entfernt (per Verifier gesperrt).
4. ✅ **Stale-Optik belegt** durch temporäres Absenken der Schwelle auf 1 h: „⚠ Wind · … · Lauf 09z · vor 3 h", Klasse `stale`, Tooltip „Dieser Datensatz ist ungewöhnlich alt (vor 3 h)." — `desktop-stale-erzwungen.png`; Schwelle danach zurückgebaut, Verifier wieder 54/54.
5. ✅ **Komposit** zeigte 14:25 (CH rzc) statt der jüngeren Teilquelle — älteste Messzeit gewinnt.
6. ✅ **Manifest-Zeile live**: „Schnellzugriff nicht aktuell — Daten kommen direkt von der Quelle." mit Tooltip, der beide Manifeste nennt. Sachlage geprüft: `latest-grib.json` und `latest-wind.json` tragen Lauf `2026072921`, **63,5 h alt** ⇒ 24-h-Guard verwirft sie ⇒ Directory-Scan (daher der frische `09z`-Lauf). Mobil im Layer-Screen sichtbar (`mobil-manifest-hinweis.png`), Sublabels im Detail-Modus tragen das Alter (`mobil-layer-detail.png`). 🔴 Arbeitsbaum, **keine** Prod-Aussage (Masterplan R3).
7. ✅ **V-21** live: Block „Woran gemessen wird … Konsens der Modell-Analysen … nicht eine Stationsmessung … die absoluten Werte sind eine Untergrenze"; Überschrift „… WIE NAH LAGEN DIE VORHERSAGEN AM ANALYSE-KONSENS?" — `desktop-hitrate-groundtruth.png`.
8. ✅ Konsole **0 Errors / 0 Warnings** (Desktop, Mobil, Vorhersage-Seite). `npm run typecheck` grün · `npm run build` grün · `npm run verify:datenalter` **54/54** · **Red-Test**: `STALE_RUN_H` 9 → 24 ⇒ Exit **1**, Rückbau ⇒ Exit **0**.

## V-VERIFIER-HYGIENE — tote und unreproduzierbare Harnesses (Phase H1, V-91)
Vorgabe: `audit/verifier-hygiene-und-fusionsgate.md` §1–3. **Reine Werkzeug-/Doku-Phase — kein App-Code, kein Renderpfad, keine UI.**
1. Kein Prüfmittel in `package.json` prüft eine Kopie seiner selbst.
2. Keine Doku-Aussage behauptet eine Absicherung, die im Arbeitsbaum nicht herstellbar ist.
3. Jedes Skript mit echter Assertion ist per npm erreichbar.

### Ergebnis 2026-08-03 (Gate GH1 grün)
1. ✅ **`verify-simradar.mjs` gelöscht** + Alias aus `package.json` entfernt (`grep -c simradar package.json` → **0**). Begründung am Code: `:20-21` re-implementierte `mmhToDbz`/`dbzToMmh` und `:31-36` prüfte den Rundlauf dieser Kopie gegen sich selbst — eine algebraische Identität, die für **jede** Parametrisierung wahr ist. Feature seit D-15 gelöscht, `tests.md` V-SIMRADAR war bereits „⛔ STILLGELEGT". Jans Freigabe 2026-08-03.
2. ✅ **D-07 korrigiert** statt Golddaten einzuchecken (Jans Entscheidung — `.git` ist mit ~350 MB bereits ein Problem, V-08). `decisions.md` D-07 und `architecture.md` §Decoding sagen jetzt „**historisch verifiziert (erstmals grün 2026-06), derzeit nicht wiederholbar**". Vollständige Erzeugungsanleitung (eccodes/numpy, Feld für Feld) im Kopf von `verify-aec.mjs`.
3. ✅ **`npm run verify:aec` existiert und endet ehrlich**: ohne `<datadir>` bzw. ohne `ref_meta.json` **Exit 2** mit der ausdrücklichen Zeile „Exit 2 = „kann nicht laufen" (KEIN bestandener Test)". Belegt: `EXIT=2`.
4. ✅ **Zwei Aliase ergänzt**: `verify:wind-transport` (Byte-Identität + Durable-Cache-Header von `dwd-wind.ts` — der Wind-Transport hatte zuvor **kein** verdrahtetes Prüfmittel) und `fusion:equivalence` (schreibt `fixtures/.equivalence-passed`, das Ship-Gate von `train-background.mjs:54`).
5. ✅ **Zahlen berichtigt** (D-04): `architecture.md` §11 und `CLAUDE.md` §Verifikation sagen statt „~30 Verifier" jetzt **25**, und benennen, dass von 76 `verify()`-Exporten nur **8** an einem npm-Skript hängen (V-95).

## V-FUSION-GATE — das Gate urteilt wieder (Phase H1, V-29)
Vorgabe: `audit/verifier-hygiene-und-fusionsgate.md` §4. **Kein Eingriff in `fusionEngine.ts`, keine Flag-Änderung, kein Cutover — die Flags bleiben aus (D-11).**
1. `fusion:gate` liefert drei unterscheidbare Exit-Codes, jeder aus den Daten berechnet.
2. Bewertung **out-of-sample**; kein hart kodiertes Verdikt.
3. Variablen ohne Stationswahrheit blockieren das Urteil über die anderen nicht.
4. `fusion:loso` assertiert auch auf Realdaten.
5. Artefakt auf dem aktuellen Archiv refittet.
6. Red-**und** Green-Test belegt.

### Ergebnis 2026-08-03 (Gate GH1 grün)
1. ✅ **Drei Exit-Codes an drei echten Archiven belegt** — das ist der geforderte Red-/Green-Test:

   | Archiv | maturity | Verdikt | Exit |
   |---|---|---|---|
   | 24 synthetische Sessions (Modelle unterschiedlich gut) | MATURE, 4 Regime | **✓ PASS**, alle 4 Variablen ≤ heuristik | **0** |
   | `fixtures/` (305 reale Sessions) | MATURE, effN 305, 4 Regime | **✗ FAIL**, t2m + windSpeed nicht ≤ heuristik | **1** |
   | 3 synthetische Sessions | TOO SHORT (effN 3, 1 Regime) | **⛔ CANNOT JUDGE** | **2** |

   Vorher: **immer Exit 0**, Verdikt hart kodiert (`:82-88`), `ok` je Variable berechnet und nie aggregiert (`:78`).
2. ✅ **Out-of-sample statt in-sample.** Stationsblockierte 5-fache Kreuzvalidierung: eine Station wird nur von Gewichten bewertet, die **ohne** sie gefittet wurden. Der alte Kopf behauptete „LOSO τ=0", tatsächlich trainierte `:27` auf allen Fixtures und bewertete `:57-67` dieselben Stationen. `--insample` druckt die alte Tabelle weiterhin als Diagnose.
3. ✅ **`cloud` sauber ausgeschlossen.** Es hat strukturell keine Stationswahrheit (BrightSky führt keine Bewölkung). Vorher setzte sein effN=0 die globale Meldung „ARCHIVE TOO SHORT (effN < 10)", während jede andere Variable bei effN=305 stand. Dieselbe Fehlmeldung steckte in `train-background.mjs:92` und ist mitkorrigiert.
4. ✅ **`fusion:loso` diskriminiert auf Realdaten**: PASS auf `session-2026-07-05T12` (corr 0,261) · **FAIL** auf `session-2026-08-03T21` (corr **−0,019** ⇒ σ trägt dort keine Information). Vorher druckte der Realdaten-Zweig „no synthetic sanity assertion applied" und ließ alles durch. `--strict` fordert zusätzlich die synthetische Diskriminierung.
5. ✅ **Artefakt refittet**: `public/params/background-v1.json` von `sessions: 2` (Fenster 2026-07-02 14:00–15:00Z) auf **`sessions: 305`** (2026-07-02 … 2026-08-03T21:00Z). Wirkungsneutral für Produktion — `loadJsonArtifact` hat **keinen Aufrufer** (V-129), das Artefakt wird deployt, aber nie geladen.
6. ✅ `npm run typecheck` grün.

**Fachliches Ergebnis, das das reparierte Gate sichtbar macht (kein Umsetzungsfehler, sondern der Befund):** Auf 305 realen Sessions ist die gefittete Minimum-Varianz-Gewichtung out-of-sample bei **t2m** (MAE 2,0666 vs. 2,0590) und **windSpeed** (1,3577 vs. 1,3573) **schlechter** als Gleichgewichtung, beides mit Konfidenzintervall vollständig unter null; nur **precip** gewinnt deutlich (0,2226 vs. 0,2750). Erklärungsansatz aus dem Code: `minVarWeights` minimiert die Varianz der **bias-korrigierten** Fehler, das Gate misst den **rohen** MAE — gefittet wird gegen ein anderes Ziel als gemessen. **Constraint C2 bleibt bindend: das wird nicht nachjustiert, bis es passt.** Konsequenz: der Cutover für t2m ist derzeit **nicht** gerechtfertigt, für precip wäre er zu prüfen — Entscheidung je Variable liegt bei Jan (V-31).

## V-BETRIEBSWAECHTER — Warm-Manifeste von außen prüfbar (Phase B1, V-79/V-81)
Vorgabe: `audit/betriebs-waechter-und-wind-horizont.md`. **Kein App-Code, keine UI. Kein Eingriff in die Warm-Skript-Semantik außer der V-81-Early-Exit-Bedingung.**
1. Der Wind-Cron wärmt neu publizierte Steps nach, statt auf dem ersten Tick einzufrieren.
2. Innerhalb eines Laufs gehen nie Steps verloren.
3. Ein blockierter Manifest-Advance wird von außen sichtbar.
4. Beide neuen Prüfmittel können nachweislich rot werden.

### Ergebnis 2026-08-03 (Gate GB1 grün)
1. ✅ **V-81 am Code belegt und behoben.** `warm-wind.mjs:144` prüfte nur den Lauf. Beleg im Repo: `public/latest-wind.json` trägt Lauf `2026072921` mit **nur Steps 0–4**, geschrieben **51 min nach Referenzzeit** — während `latest-grib.json` beim selben Lauf `t_2m` mit 25 und `tot_prec` mit 28 Steps führt. Da der Client die Liste autoritativ übernimmt (`iconD2WindSource.ts:340-343`), reichte der Wind-Slider 4 statt 12 h voraus. `manifestCovers()` aus `warm-grib.mjs:246` übernommen.
2. ✅ **Kein Step-Verlust.** Neue reine Funktion `mergeSteps()`; ein Teilfehler beim Nachwärmen kann das Manifest nicht mehr schrumpfen lassen (`[0..4]` + frisch `[0,1,2,5,6]` → `[0..6]`, **nicht** `[0,1,2,5,6]`). Bei anderem Lauf wird nichts übernommen.
3. ✅ **`npm run verify:warm-wind` 13/13**, netzfrei, importiert die **echten** Funktionen aus `warm-wind.mjs` (kein Oracle-Nachbau — Lehre aus V-91/V-94). Dafür ist `main()` hinter eine `isMain`-Prüfung gezogen. **Erstmals steht ein Warm-Skript unter Verifikation.**
4. ✅ **Red-Test V-81:** `manifestCovers` auf die alte Logik zurückgesetzt ⇒ **4 Checks rot** („DER V-81-FALL", Lücken-Fall, zwei Robustheitsfälle), Exit **1**; zurückgebaut ⇒ 13/13, Exit 0.
5. ✅ **V-79 als unabhängiger Wächter** (Jans Variante, kein Eingriff in die Crons): `.github/workflows/health.yml` (stündlich, cron `25 * * * *`, versetzt zu den Warm-Ticks) + `scripts/health-manifests.mjs`. Prüft über HTTPS **H1** Erreichbarkeit/JSON · **H2** Lauf-Alter < 9 h · **H3** Advance-Alter < 6 h · **H4** `warmedThroughProxy` == geprüfte Origin · **H5** Step-Vollständigkeit lückenlos ab 0.
6. ✅ **`npm run verify:health` 15/15**, netzfrei — enthält je Prüfung einen konstruierten Rot-Fall, u. a. „H3 rot bei 7 h ohne Advance (DER V-79-FALL)", „H4 rot bei localhost-Proxy", „H4 rot bei Alt-Domain (V-02/V-100)", „H5 rot bei Lücke in der Step-Liste". Der Workflow ruft diesen Selbsttest **vor** der Prod-Prüfung.
7. ✅ **Wächter greift sofort** — gegen den Arbeitsbaum **4 von 8 Prüfungen rot**: beide Manifeste Lauf `2026072921`, **121,5 h** alt, seit **119,6 h** kein Advance, Exit 1 mit `::error::`-Zeilen. 🔴 Arbeitsbaum, **keine** Prod-Aussage (Masterplan R3 — genau die A3-Fehldiagnose).
8. ✅ `npm run typecheck` grün. **🔴 Prod-Dispatch und Repo-Variable `SITE_URL` sind Jans Gate** — ohne `SITE_URL` endet der Wächter mit Exit **2** („nicht lauffähig"), ausdrücklich nicht mit grün.

## V-FAVORITEN — Orte speichern, toter Toggle weg (Phase F1, V-04/V-22)
Vorgabe: `audit/favoriten-und-toter-toggle.md`. Verifiziert mit **Playwright-MCP** (Chrome-DevTools-MCP-Profil war durch eine Parallel-Session gesperrt), Dev :5215, Desktop 1440×900 + iPhone 12 Pro 390×844.
1. Ein Ort lässt sich anlegen und ist nach Reload noch da.
2. Speichern navigiert nicht.
3. Ein Favoriten-Speicher statt zwei; Alt-Einträge gehen nicht verloren.
4. Touch-Targets ≥ 44 px, keine Überläufe auf Desktop und Mobil.
5. Der `warnings`-Toggle ist weg.

### Ergebnis 2026-08-03 (Gate GF1 grün)
1. ✅ **Anlegen belegt** — 8 Suchtreffer, je ein Stern (`aria-pressed`, sprechendes `aria-label`, **kein Button-im-Button**). Klick schreibt `buscosun.favorites.v1`, Stern → ★, Label wechselt auf „… aus gespeicherten Orten entfernen". Nach Reload als Chip auf der Startseite. Vorher hatten `addFavorite`/`toggleFavorite`/`isFavorite` **keinen einzigen Aufrufer**.
2. ✅ **Kein Fehlklick** — Dropdown bleibt offen, `location.hash` unverändert (`stopPropagation`).
3. ✅ **Konsolidierung + Migration** — `historyState` delegiert an `favorites.ts`. Test mit vorbereitetem Alt-Key: „Zermatt" (CH) übernommen, **kaputter Eintrag ohne Koordinate verworfen**, Alt-Key erhalten, `migrated`-Flag gesetzt, beide Chips sichtbar. **Faktenkorrektur zum Katalog:** die Historie war **kein funktionierendes** Parallelsystem — `historyState.getFavorites()` hatte ebenfalls keinen Konsumenten; sie konnte anlegen, aber nie anzeigen.
4. ✅ **Maße** — Suchergebnis-Stern **44×44**, Punktforecast-Stern **96×44**. Desktop 1440: Dropdown und alle 8 Zeilen ohne Überlauf, Zeilenhöhe 46 px. Mobil 390: kein Überlauf, Ortsname ellipsiert, kein horizontaler Seiten-Scroll.
5. ✅ **Zwei eigene Fehler im Test gefunden und behoben** (beide durch den neuen Flex-Kontext): mobiles Dropdown lief 44 px über und der Ortsname verlor die Ellipse (`row.scrollWidth 381 > 337`) → `flex:1; min-width:0; width:auto`; Punktforecast-Kopf lief 6 px über (`306 > 300`) → negativer Margin entfernt. Beide nachgemessen: `scrollWidth <= clientWidth`.
6. ✅ **V-22** — „Warnungen" kommt im gesamten Text der Radar-Seite nicht mehr vor; `grep -c warnings src/radar/RadarMap.tsx` → **0** (es gab dort nie eine Implementierung). `LAYER_META.warnings` bleibt für die Rückkehr über V-24 stehen.
7. ✅ `npm run typecheck` grün · `npm run build` grün.
8. ⚠️ **Einschränkung, ausdrücklich benannt:** Der Punktforecast-Stern ist heute an beiden Einbaustellen nicht regulär sichtbar (Desktop hinter `START_NOW_ONLY`, Default an; mobil im Sheet ausgeblendet). Codepfad mit `?startnow=0` verifiziert — **wirksamer Einstieg ist die Suchseite**. Mobiler Sheet-Auslöser als V-132 vorgemerkt.
9. ⚠️ **Konsole:** Startseite/Suche 0 Errors. Zwei **nicht** aus dieser Phase stammende Befunde registriert: BrightSky-Warn-404 für AT (**V-130**) und sechs maplibre-interne Tile-Fehler auf der Radarkarte — beide außerhalb der geänderten Pfade, **nicht** per Rückbau gegengeprüft.

Belege: `audit/screenshots/favoriten/desktop-1440-suchergebnisse-mit-stern.png`, `mobil-390-suchergebnisse-mit-stern.png`.

## V-CI — PR-Gate, Edge-Typecheck, Budget (Phase C1, V-92/V-39/V-93)
Vorgabe: `audit/ci-minimum.md`. **Reihenfolge-Bedingung O-02 eingehalten:** V-91 und V-29 (Phase H1) sind abgeschlossen — die CI zementiert kein falsches Grün.
1. Der Typecheck erreicht die Edge Functions.
2. Das Budget kann rot werden.
3. Im PR-Gate läuft nur Netzfreies — und zwar belegbar.
4. Das Gate ist grün und schnell.

### Ergebnis 2026-08-03 (Gate GC1 grün)
1. ✅ **V-92** — `tsconfig.edge.json` als drittes Projekt. **Red-Test:** `const __redtest: number = "kein number";` in `dwd-wind.ts` ⇒ `netlify/edge-functions/dwd-wind.ts(111,7): error TS2322`, Exit **2**; zurückgebaut ⇒ Exit **0**. Vorher lagen die beiden Cache-Proxys — die Bauteile, über die jedes Wetterdatenbyte fließt — in **keinem** tsconfig. Deno-Globals bewusst **nicht** deklariert, damit ihre Einführung auffällt statt durchzugehen.
2. ✅ **V-39** — `budget.json` + `npm run budget`. IST (gzip): eagerJs **123,4 KB** / eagerCss 8,1 / largestChunk 278,4 (maplibre-gl) / totalJs 801,3. **Red-Test:** Grenze auf 50 KB ⇒ `::error::Budget überschritten … 123.4 KB > 50 KB`, Exit **1**; zurückgebaut ⇒ Exit 0.
3. ✅ **Netzfreiheit empirisch belegt statt geschätzt** — globales `fetch` per Node-Preload durch einen werfenden Stub ersetzt, jeder Kandidat damit gefahren: **14 npm-Einträge netzfrei, alle Exit 0** (der Katalog nannte 12). Der naive `grep -c "fetch("`-Weg wäre falsch gewesen: die Verifier importieren echte App-Module, die selbst laden.
4. ✅ **Kompletter PR-Gate-Durchlauf lokal: 17/17 Schritte grün in 82 Sekunden** (ohne `npm ci`). Ziel GV1 „< 4 min" damit realistisch — auf dem echten Runner aber **noch nicht belegt**.
5. ✅ **YAML** aller drei Workflows (`ci.yml`, `nightly.yml`, `health.yml`) mit `js-yaml` fehlerfrei geparst.
6. ✅ **Nightly getrennt** — 13er-Matrix netzabhängiger Quellenprüfungen, `fail-fast: false`, Sammel-Issue statt dreizehn Mails. Upstream-Churn darf `main` nie rot färben. `fusion:gate` läuft dort `continue-on-error`: sein Exit 1 ist ein **Befund**, kein Build-Fehler (C2).
7. ⚠️ **ESLint bewusst nicht eingeführt** — Dependency-Entscheidung (STOPP & FRAGEN) und ohne vereinbartes Regelwerk hunderte Befunde.
8. 🔴 **Prod-Dispatch ist Jans Gate** — `.github/workflows/*` ist Hochrisiko-Zone; die Workflows wirken erst nach dem Push auf `main`.

## V-WARMBUDGET-LIZENZEN — Warm-Budget, Quellenverzeichnis, AT-Warnungen (Phase P1, V-80/V-104/V-24)
Vorgabe: `audit/warmbudget-lizenzen-at-warnungen.md`.
1. Gewärmt wird, was sichtbar ist — und das kann nicht wieder auseinanderlaufen.
2. Jede Quelle steht an einem Ort, aus dem Code erzeugt statt abgetippt.
3. AT-Warnungen: erschließen, und bei fehlender Faktenlage **aufhören statt raten**.

### Ergebnis 2026-08-03 (Gate GP1 grün für V-80/V-104 · V-24 gestoppt)
1. ✅ **V-80** — `PARAMS` in `BASE_PARAMS` + `FEATURE_PARAMS` geteilt; vier Wolken-Params entfernt (Toggle seit 2026-07-23 auskommentiert), elf Params der Layer Gewitter/Blitz-Prognose/Schnee/Rotation ergänzt. Step-Caps aus dem `MAX_STEP` des jeweiligen Quellmoduls, nicht geschätzt. `WARM_FEATURE_LAYERS=0` als Rücknahme ohne Code-Änderung. EPS-Baum wärmt `clct` weiterhin (Fusion, unabhängig vom Karten-Toggle).
2. ✅ **`npm run verify:warm-budget` 30/30** — liest aktive Layer aus `DECK_GROUPS` (auskommentierte zählen **nicht**), Params aus `warm-grib.mjs`, Caps aus den Quellmodulen. **Red-Test:** `clcl` zurück in die Liste ⇒ `FAIL … (noch in der Warm-Liste: clcl)`, Exit **1**; entfernt ⇒ 30/30.
3. ✅ **Step-0-Prüfung an DWD**: alle elf neuen Params liefern Step 0 ⇒ die von V-79/H5 geprüfte Lückenlosigkeit bleibt erhalten.
4. 🔴 **Kostenkorrektur zum Katalog** — an echten DWD-Dateigrößen gemessen (HEAD, Lauf 2026080321): entfernt **−25,4 MB/Lauf**, neu **+90,8 MB/Lauf**, **netto +65,4 MB/Lauf ≈ +15 GB/Monat**. Die im Eintrag versprochene Ersparnis („~12 GB/Monat werden frei") stimmt für sich, wird aber übertroffen. Treiber: cape_ml 25,2 · cin_ml 23,3 · sdi_2 17,7 · snow_gsp 17,3. **Vor dem Prod-Dispatch V-85 (Netlify-Usage) prüfen** — Risiko R6.
5. ✅ **V-104** — `/lizenzen/` mit **24 Modellen build-seitig aus `src/fusion/modelCatalog.ts`**; bei < 15 gelesenen Einträgen **bricht der Build ab**, statt eine unvollständige Quellenliste auszuliefern. Nicht-Modell-Quellen in drei Gruppen, je mit Betreiber, Lizenz, Pflichttext und Belegstelle im Code.
6. ✅ **Gerendert geprüft** (Playwright-MCP auf `vite preview`): canonical `/lizenzen/`, **kein** `noindex`, JSON-LD `CreativeWork` mit `sourceOrganization`, 24 Modellzeilen, DWD genannt, GeoSphere-Wortlaut wörtlich, OpenFreeMap-Pflichttext, **Esri als 🔴 „in Klärung"** (V-106). Verlinkt aus Fuß aller statischen Seiten, App-Footer und Modellbibliothek; `llms.txt` ergänzt; sitemap 153 URLs (vorher 152). `verify:seo` **63 Checks, 0 Fehler**.
7. 🔴 **V-24 GESTOPPT — bewusst.** Erschlossen: Endpunkt liefert 200 + FeatureCollection, **CORS `*`** (⇒ **kein Edge-Proxy nötig**, der STOPP-&-FRAGEN-Punkt „CORS-Rewrite" entfällt), Geometrien in **EPSG:31287**. Blocker: die Properties sind **ausschließlich** `warnid, wtype, wlevel, start, end, gemeinden` — **kein Text**, `wtype` ohne abrufbare Legende, **14 geprüfte Endpunkte antworten mit 404**. Eine Bezeichnung zu raten wäre eine erfundene Angabe im sicherheitskritischsten Feature — schlimmer als V-18. Als **V-133** mit drei Entscheidungswegen registriert.
8. ✅ **Gesamtlauf am Ende der Session: 18/18 Schritte grün in 83 s** (typecheck, build, verify:seo, budget + 14 netzfreie Verifier).

## V-2D-LAYER — Verifikationsplan für die 2D-Layer-Erweiterung (Phasen L0–L13)

> **Stand 2026-08-05: Plan, noch nicht ausgeführt.** Erstellt in Phase GL0. Vollständige Herleitung:
> `docs/2d-layer-erweiterung.md` §15 und §16. Konsistent mit D-10 (kein Test-Framework) und den
> Empfehlungen aus O-02.

### Ebene 1 — Headless-Verifier (Pflicht, netzfrei, Gate-blockierend)

| Verifier | Prüft | Phase |
|---|---|---|
| `verify:layer-registry` | jeder `LayerKey` hat **genau ein** Permalink-Bit; Bits lückenlos und stabil; jeder Key hat Label/Info/Icon/Loader/Coverage; **kein Key ohne Bit** (schließt V-134 strukturell) | L1 |
| `verify:layer-time` | die vier Zeitmodi; Slider-Bereichsberechnung; **Grenz-Inklusivität wie heute** (DE/AT inklusiv, CH strikt `< 0,5`) | L5 |
| `verify:frame-budget` | LRU-Verdrängung; Tier-Budgets; Mindestkontingent je aktivem Layer | L5 |
| `verify:composite-equivalence` | **byte-identisches Ergebnis** für die Bestandsquellen `{rv, inca, rzc, d2}` nach der Kompositor-Generalisierung | L6 |
| `verify:timeline` | Playback-Zustandsmaschine; Auto-Advance **nur** bei „jetzt"; Mess-/Prognose-Grenze korrekt gesetzt | L5 |
| `verify:warnings-de` | Feldabbildung; Stufenlogik 1–5; Ausblenden über `EXPIRES`; Farbzuordnung = DWD-Skala | L3 |
| `verify:warnings-at` | `wtype`-Legende **vollständig** (1–7); `wlevel` 1–3; Reprojektion 31287→4326 gegen bekannte Referenzpunkte | L4 |
| `verify:radolan-re` | Header-Parsing; **Bit-13-Maske**; **900×900**-Gitter; Wertebereich 0–1000; gzip statt bz2 | L8 |
| `verify:meteoswiss-hail` | HDF5-Pfade; `/where`-Ecken; **Saisonerkennung 01.04.–30.09.** | L8 |
| **`verify:coverage-honesty`** | für **jede** Kombination Layer × {DE, AT, CH} existiert entweder Abdeckung **oder** ein Hinweistext | L2 ff. |

`verify:coverage-honesty` ist der wichtigste neue Verifier: Er macht D-04 aus einer Haltung eine
maschinelle Abnahmebedingung und verhindert, dass eine neue Länder-Lücke unbemerkt entsteht.

**Regel (aus V-95):** Jeder neue `verify*()`-Export bekommt ein npm-Skript. Ohne Skript zählt der
Selbsttest nicht. Jeder neue Verifier muss außerdem einen **Red-Test-Nachweis** liefern — also
belegt fehlschlagen können.

### Ebene 2 — Kontrakt-Sonden (netzabhängig, **nicht** Gate-blockierend)

Je Quelle eine nächtliche Sonde nach dem V-87-Muster: Erreichbarkeit · **Format-Signatur**
(Header-Bytes, HDF5-Pfadnamen, GeoJSON-Property-Liste, WMS-Dimension vorhanden) · **Frische**
(Referenzzeit nicht älter als der erwartete Takt) · CORS. Registriert als **V-142**.

### Ebene 3 — UI-Verifikation (Chrome DevTools MCP)

Je Phase in beiden Viewports (Desktop 1440×900, iPhone 12 Pro 390×844 DPR 3):
Screenshot-Diff gegen die **Golden-Baseline aus L0** · Konsole sauber · keine Long Tasks > 200 ms ·
Touch-Targets ≥ 44 px.
⚠️ Emulation ist für WebGL **nicht** repräsentativ — FPS-, Speicher- und Shader-Aussagen brauchen ein
Real-Device (scrcpy/ADB), Jan informieren.

### Ebene 4 — die fünf Selbstverifikations-Fragen

Vor jedem Gate schriftlich mit Beleg: (1) Funktionserhalt **einzeln je Layer**, (2) Desktop
pixelgleich, (3) Touch-Targets ≥ 44 px, (4) Konsole sauber, (5) keine Long Tasks > 200 ms.

### Validierungsschritte je Phase (Kurzfassung)

| Phase | Gate-Bedingung |
|---|---|
| **L0** | Baseline-Screenshots aller 16 Layer liegen vor; CORS aller 12 Zielendpunkte im Browser geprüft und protokolliert; Matrix-Verifier läuft **und kann fehlschlagen** |
| **L1** | Registry-Verifier grün; **kein** Verhaltenswechsel gegenüber dem Bestand |
| **L2** | **Pixel-Diff aller 16 Layer = 0**; `LAYER_ORDER` vollständig; die vier bisher fehlenden Layer (`thunder`, `lightningfc`, `snow`, `rotation`) sind permalink-fähig |
| **L3** | Warnungen erscheinen bei aktiver Lage; Stufenfarben = DWD-Skala; `EXPIRES` blendet aus; Klick zeigt Klartext; Lizenzhinweis + Deep-Link sichtbar; **kein Durable-Cache** |
| **L4** | Reprojektion gegen bekannte Gemeindegrenzen geprüft; `wtype`-Legende vollständig; **keine geratene Bezeichnung**; Hochalpin-Einschränkung ausgewiesen |
| **L5** | Alle vier Zeitmodi funktionieren; **Mess-/Prognose-Bruch sichtbar**; Auto-Advance stört das Scrubben nicht; tastaturbedienbar; `prefers-reduced-motion` respektiert; **AT-Zeitversatz behoben (V-144)**; `verify:precip-source` mit unveränderter Prüfnamen-Liste. **Volles Protokoll: §V-TIMELINE** |
| **L6** | Loop ≥ 30 FPS auf Real-Device; Zugvektoren stimmen mit der Frame-Folge überein (visuelle Kreuzprüfung); Speicher im Budget; **§0-Ehrlichkeit gate-blockierend**. **Volles Protokoll: §V-ZUGLINIEN** |
| **L7** | TIME-Extent korrekt gelesen; „letzte 15 Minuten" in der Legende; Parallaxe-Hinweis bei der Satellitenquelle; Bodennetz- und Satellitenquelle unterscheidbar |
| **L8** | POH/MESHS plausibel gegen ein reales Hagelereignis; **Saisonzustand zeigt Saisonhinweis, nicht leere Fläche**; AT zeigt „keine amtliche Quelle" |
| **L9** | Phasenanteil und `snowline` widersprechen sich nicht; SNOWGRID-Alter (1 Tag) sichtbar |
| **L10/L11** | Messung und Prognose getrennt **oder** Vermischung ausdrücklich benannt; Zellattribute belegt, nicht geraten; **keine Warnsprache** (D-19) |
| **L12** | Regionen-Join `regionID` ↔ EAWS-Polygone korrekt; Bulletin-Gültigkeit sichtbar; verlinkt statt bewertet |
| **L13** | Presets laden die richtigen Layer; Permalink überlebt einen Preset; Dock bleibt auf Mobil bedienbar |

---

## V-TIMELINE — Zeitmodell und Playback (Phase L5, Gate GL5)

Spec: `docs/zuglinien-radar-spec.md` Teil II. Desktop **1440 × 900** und iPhone 12 Pro
**390 × 844 DPR 3**, beide vollständig durchlaufen.

**A · Headless (netzfrei, vor jedem UI-Schritt)**

| # | Kommando | Erwartung | Beleg |
|---|---|---|---|
| 1 | `npm run typecheck` | grün | Konsole |
| 2 | `npm run verify:layer-time` | 9/9 Assertions (§14.1) | Konsole |
| 3 | `npm run verify:timeline` | 8/8 (§14.2) | Konsole |
| 4 | `npm run verify:mapstate` | 7/7 (§5.3) | Konsole |
| 5 | `npm run verify:frame-budget` | 6/6 (§14.5) | Konsole |
| 6 | **Red-Test:** einen `LayerKey` aus `LAYER_ORDER` entfernen → `verify:mapstate` **muss rot werden**; danach zurücknehmen | Exit ≠ 0 | Konsole |
| 7 | `npm run verify:precip-source` | grün **und** die Liste der 22 Prüfnamen ist identisch zum Stand vor der Phase | `diff` der Namensliste |
| 8 | `npm run verify:governor` | grün (Shader-/Governor-Bereich unberührt) | Konsole |

**B · Zeitachse**

| # | Schritt | Erwartung | Beleg |
|---|---|---|---|
| 9 | Nur Bestands-Layer aktiv (alle 16 durchprobieren) | Slider beginnt bei **0**, Obergrenze wie vor der Phase | Screenshots |
| 10 | `rainradar` aktivieren | Slider beginnt bei **−1 h**, Beschriftung „vor 60 min" | Screenshot |
| 11 | `rainradar` deaktivieren | Slider springt zurück auf 0…N, Position wird geklemmt (kein Sprung ins Leere) | Screenshot |
| 12 | Slider auf −45 min, dann Layer wechseln | keine leere Karte ohne Erklärung; Grund im Readout (`out-of-retention` / `no-frame-near`) | Screenshot |
| 13 | **AT-Kontrolle (V-144):** Ort in Österreich, Slider auf 0 | Uhrzeit-Chip zeigt die **echte** Gültigkeitszeit des INCA-Frames, nicht „jetzt + Lead" | Screenshot + Vergleich mit `last_forecast_reftime` aus dem Netzwerk-Tab |

**C · Playback**

| # | Schritt | Erwartung | Beleg |
|---|---|---|---|
| 14 | Play | läuft mit 2,5 Frames/s bei 1× | Trace |
| 15 | Geschwindigkeit 2×, Seite neu laden | 2× ist **gemerkt** | Screenshot |
| 16 | Frame-Schritt ±1 an beiden Enden | klemmt, kein Überlauf, Playback stoppt | Screenshot |
| 17 | Loop an/aus, bis zum Ende laufen lassen | mit Loop → zurück an den Anfang; ohne → stoppt am Ende | Screenshot |
| 18 | Scrubben, dann 5 min warten (neuer Frame trifft ein) | **kein** Auto-Advance (`atNow === false`) | Protokoll |
| 19 | „Zurück zu jetzt", dann 5 min warten | Auto-Advance folgt dem neuen Frame | Protokoll |
| 20 | **Mess-/Vorhersage-Bruch** | drei Signale gleichzeitig: Farbwechsel **und** Strichelung **und** Textmarke; Chip sagt „gemessen"/„Vorhersage" | Screenshot (Ausschnitt) |
| 21 | Konfidenz-Abklingen | Ticks werden nach rechts blasser, Minimum 25 % | Screenshot |

**D · A11y**

| # | Schritt | Erwartung | Beleg |
|---|---|---|---|
| 22 | Tab durch das Zeit-Deck | Reihenfolge Track → Play → Schritt− → Schritt+ → Jetzt → Speed → Loop; Fokusring sichtbar | Screenshots |
| 23 | `←`/`→`, `Home`/`End`, `Bild↑`/`Bild↓` | ±1 · erster/letzter · ±6 Frames | Protokoll |
| 24 | `Leertaste` bei Fokus im Zeit-Deck / außerhalb | togglet Play / **tut nichts** (kein globaler Hotkey) | Protokoll |
| 25 | `aria-valuetext` auslesen | enthält Uhrzeit **und** „gemessen"/„Vorhersage" | DOM-Auszug |
| 26 | `prefers-reduced-motion: reduce` erzwingen | Playback rastet ganzzahlig, kein Tween, kein Auto-Scroll | Trace + Screenshot |

**E · Mobil 390 × 844**

| # | Schritt | Erwartung | Beleg |
|---|---|---|---|
| 27 | Scrub am Track ziehen | Sheet bleibt stehen, nur der Regler bewegt sich | Video/Screenshots |
| 28 | Alle Bedienelemente messen | ≥ 44 × 44 px | Audit-Liste |
| 29 | Speed-Chip antippen | schaltet 0,5× → 1× → 2× → 0,5× durch | Screenshots |

---

## V-ZUGLINIEN — Regenradar-Rückblick und Niederschlagszuglinien (Phase L6, Gate GL6)

Spec: `docs/zuglinien-radar-spec.md` Teil III. **§0 zuerst** — die Ehrlichkeitsprüfungen sind
gate-blockierend und werden vor der Funktionsprüfung abgearbeitet.

**§0 · Ehrlichkeit (blockierend)**

| # | Schritt | Erwartung | Beleg |
|---|---|---|---|
| 1 | Legende des `motion`-Layers lesen | nennt km/h, „Pfeil zeigt, **wohin** der Niederschlag zieht" und dass die Pfeile **berechnet** sind | Screenshot |
| 2 | Attribution prüfen | `Datenbasis: Deutscher Wetterdienst, eigene Elemente ergänzt` | Screenshot |
| 3 | Ort in Österreich wählen | Zusatz „aus der INCA-Analyse abgeleitet"; **nirgends** „Radar" für AT | Screenshot |
| 4 | Ort in der Schweiz wählen | **keine Pfeile**, Lückentext + Deep-Link auf MeteoSchweiz | Screenshot |
| 5 | Diff nach „Warnung", „Unwetter", „Gefahr", „trifft", „Tornado" durchsuchen | keine Treffer in nutzersichtbaren Strings | `grep`-Ausgabe |
| 6 | ETA-Text lesen | „~35 min" (5-min-Raster), nie minutengenau | Screenshot |

**A · Headless**

| # | Kommando | Erwartung | Beleg |
|---|---|---|---|
| 7 | `npm run verify:motion-field` | 9/9 (§14.3) — inkl. Nordrichtungs-Vorzeichenfalle und Konvexität von `blendU8` | Konsole |
| 8 | `npm run verify:composite-equivalence` | grün **+ Red-Test** (DE-Grenze absichtlich auf `<` ändern → muss rot werden) | Konsole |
| 9 | `npm run verify:radar` | grün (bindet `src/radar/_verify.ts` an npm; schließt V-143) | Konsole |
| 10 | alle L5-Verifier erneut | weiterhin grün | Konsole |

**B · Funktion**

| # | Schritt | Erwartung | Beleg |
|---|---|---|---|
| 11 | `rainradar` einschalten, Rückblick abspielen | 60 min Vergangenheit + Land-Horizont, flüssig, kein Stroboskop | Video/Trace |
| 12 | Crossfade prüfen (langsam scrubben) | weiche Übergänge, **keine** Aufhellung/Abdunkelung des Rasters an den Zwischenpositionen | Screenshots |
| 13 | Drei aufeinanderfolgende Frames vergleichen | die Pfeile zeigen in die Richtung, in die sich das Niederschlagsgebiet tatsächlich verschiebt | 3 Screenshots nebeneinander |
| 14 | Zoom 5 → 8 → 10 → 12 | Pfeildichte nimmt in vier Klassen zu; Labels erst ab z ≥ 9 (Mobil ≥ 10) | Screenshots |
| 15 | Flächendeckende Lage bei z = 12 | ≤ 1 200 Features; die Zahl der ausgelassenen wird **geloggt** | Konsolen-Auszug |
| 16 | Pfeil antippen | „zieht mit ~X km/h nach …" + ETA **oder** „zieht an … vorbei" | Screenshot |
| 17 | Leerzustände auslösen (kalter Start / trockene Lage / außerhalb DACH) | drei **unterschiedliche** Texte, keiner davon „kein Niederschlag" bei fehlenden Daten | Screenshots |
| 18 | `nowcast` und `rainradar` gemeinsam aktivieren | weicher Ausschluss mit sichtbarem Hinweis; **kein** Layer wird gesperrt oder aus dem Dock entfernt | Screenshot |
| 19 | Länderbänder auf der Zeitleiste | DE endet +2 h, AT +3 h, CH bei „jetzt"; Legendenzeile darunter | Screenshot |
| 20 | Offline gehen (DevTools), neu scrubben | Letztstand + **Stale-Badge** + echte Referenzzeit | Screenshot |

**C · Performance**

| # | Schritt | Erwartung | Beleg |
|---|---|---|---|
| 21 | Trace beim ersten Aktivieren von `motion` | kein Long Task > 200 ms (Horn-Schunck läuft im Worker) | Trace |
| 22 | `frameBudget.stats()` bei `rainradar` + `motion` + `wind` | `used` unter dem Tier-Budget; `evicted` plausibel | Konsolen-Auszug |
| 23 | 🔴 **Playback-FPS** | ≥ 30 FPS — **nur auf Real-Device gültig.** MCP-Emulation drosselt rAF; ohne Gerät bleibt der Punkt **offen**, nicht bestanden | Real-Device-Messung |

**D · Mobil 390 × 844**

| # | Schritt | Erwartung | Beleg |
|---|---|---|---|
| 24 | Zugvektoren auf Mobil | eine Zoomklasse gröber als Desktop, lesbar, nicht überladen | Screenshot |
| 25 | Pfeil-Trefferfläche bei z ≥ 10 | ≥ 22 px | Audit-Liste |
| 26 | Vollständigkeit | **keine** Funktion fehlt gegenüber Desktop — nur umgruppiert | Funktionsliste abgehakt |

---

## V-ZELLBAHNEN — Zellbahnen aus DWD KONRAD3D (Phase Z1, Gate GZ1) — ✅ durchgeführt 2026-08-05

Diagnose: `audit/zellbahnen.md`. Belege: `audit/screenshots/zellbahnen/`.

**Z-1 · Quelle live (PowerShell, vor jeder Code-Änderung).** Listing
`https://opendata.dwd.de/weather/radar/konrad3d/` → **576** Dateien, 5-min-Takt, **kein** `latest`-Alias.
Jüngste Datei 645 376 B, `Content-Type: text/xml`, `Last-Modified` 20:44:54Z bei Referenzzeit
20:40:00Z ⇒ Latenz **4 min 54 s**, **kein** `Access-Control-Allow-Origin`. Inhalt: 38 Features,
je 1 Umriss, 12 Prognosepunkte (456), `cell_speed` 19,5…60,9 km/h, `hail_flag` {0:30, 1:8},
**567** × `-1000000000`, **117** × `not-a-date-time`. ✅

**Z-2 · `npm run verify:cells` — 64/64 PASS** gegen `scripts/fixtures/konrad3d-sample.xml`
(Kopf + 3 unveränderte Features aus der echten Datei; 43 Sentinel-Werte, 12 `not-a-date-time`).
Gruppen: Parser-Pfade verbatim · exakte Tag-Trennung (`<latitude>` ≠ `<latitudes>`) · 12
Prognosepunkte +5…+60 · monoton wachsende Ellipse · abgeleitete Peilung · Sentinel-Filter
(Einzelfunktion **und** end-to-end an mutiertem XML) · Ellipsen-/Hüllen-Geometrie · Trichter
umschließt alle Stützstellen · Trichterfläche **und** -reichweite stammen aus der amtlichen Ellipse ·
geschlossene GeoJSON-Ringe · keine Sentinel-Zahl in der Geometrie · ETA · Warnsprach-Sperre. ✅

**Z-3 · Rot-Test (V-99-Pflicht).** `SENTINEL_LIMIT = -9e8` → `-Infinity` ⇒ **4 von 64 FAIL**,
Exit **1**, Kurzzeile „Zelle 12 · 59 dBZ · zieht mit **-1000000000 km/h** nach NO". Zurückgebaut
⇒ 64/64, Exit 0. ✅

**Z-4 · Lazy-Load + Poll-Budget (Chrome DevTools MCP, Desktop 1440×900).** Vor Aktivierung
**0** `konrad3d`-Datenrequests. Nach dem Toggle **genau zwei**: `…/weather/radar/konrad3d/` (Listing)
und `KONRAD3D_20260805T210500.xml`. Konsole: `[buscosun] Zellbahnen-Layer → KONRAD3D-Datei … 47 Zellen`.
Gerendert: 46 Punkte, 47 Umrisse, 52 Spuren, 54 Trichter (`queryRenderedFeatures`). ✅

**Z-5 · Zeitfenster.** Slider +1 h → `storm-cells-hull` `visible` (2 Punkte) · +2 h → `none`
(0 Punkte) · zurück auf 0 h → `visible` (2 Punkte). ✅

**Z-6 · Steckbrief (Klick auf den Schwerpunkt).** „Zelle 127 · 47 dBZ · zieht mit 19 km/h nach NO",
Zeilen Zuggeschwindigkeit/Radarintensität/Echotop/Fläche/Blitzrate, Fuß „Messzeit 23:05 Uhr ·
kein amtliches Warnprodukt — maßgeblich sind die DWD-Warnungen". Keine Warnsprache.
Beleg: `desktop-cell-popup.png`. ✅

**Z-7 · Mobile (iPhone 12 Pro 390×844 DPR 3).** Toggle-Zeile **358 × 56 px** (≥ 44), Legendenkarte
vollständig lesbar, Karte rendert Zellen, Attribution „Zellbahnen: DWD KONRAD3D · CC BY 4.0".
Belege: `mobile-layer-screen.png`, `mobile-map-legend.png`. ✅

**Z-8 · Keine Regression.** `npm run typecheck` grün · `verify:precip-source` 30/30 ·
`verify:governor` grün · `verify:rotation` 30/30 · Konsole (Desktop **und** Mobile) ohne
Errors/Warnings. ✅

**Offen (nicht „bestanden"):** FPS-/Long-Task-Messung — die MCP-Emulation drosselt rAF, belastbar
nur am Real-Device (`agents.md` §7).
## V-HAGEL — Hagel: MeteoSchweiz MESHS/POH + KONRAD3D-Hagelzellen (Phase HA1, Gate GHA1) — ✅ durchgeführt 2026-08-06

Diagnose: `audit/hagel.md`. Belege: `audit/screenshots/hagel/`.

**H-1 · Quellenvergleich live (vor jeder Code-Änderung).** Vier Kandidaten an der Datei gemessen:
CH POH/MESHS ✅ · KONRAD3D-`hymec` ✅ · RE Bit 13 ⚠️ · HyMeC-`CLASS` ⚠️ · VII = **VIL** ⚠️.
Ergebnis und Begründung der Auswahl in `audit/hagel.md` §§2–6. ✅

**H-2 · `npm run verify:hail` — 55/55 PASS**, netzfrei, gegen drei echte Fixtures
(`meteoswiss-poh-bzc.h5`, `meteoswiss-meshs-mzc.h5`, `konrad3d-sample.xml`).
Gruppen: POH-Decode (Gitter 710×640, 101 335 NaN-Zellen, Werte 0…1, Maximum 0,73, Ecken aus
`/where`, Trapez-Nachweis Δlon 0,479°) · MESHS-Decode (gleiches Gitter, max 0 = hagelfrei) ·
**Einheiten-Sperre** (Stufen in mm, `meshsLabel(20)="2,0 cm"`, `pohLabel(0,81)="81 %"`) ·
Palette (Monotonie, Schwelle, NaN nie eingefärbt, hagelfreies Raster vollständig transparent) ·
KONRAD3D-`hymec` (area_hail 5,5 km², area_large_hail 0, echo_top_hail 6250 m, class 9) ·
**Sentinel** (−1000000000 → `null`) · GeoJSON (nur die Hagelzelle, geschlossener Ring, keine
Sentinel-Zahl in der Geometrie) · Wortwahl D-19 · Saisongrenzen 1. April/30. September. ✅

**H-3 · Rot-Test (V-99-Pflicht).** `MESHS_STOPS[0].v` von 20 (mm) auf 2 (cm) gesetzt ⇒
„EINHEIT: MESHS-Stufen sind mm" **FAIL**, Exit **1**; zurückgebaut ⇒ 55/55, Exit 0. ✅

**H-4 · Lazy-Load (Chrome DevTools MCP, Desktop 1440×900).** Vor Aktivierung **0** Requests auf
`ogd-radar-hail` und `konrad3d`. Nach dem Toggle: CH-Rasterquelle entsteht, DE-Quelle gefüllt
(8 Source-Features). Poll 5 min nur bei aktivem Layer und `visibilityState === 'visible'`. ✅

**H-5 · Statuszeile mit beiden Quellen einzeln.**
„Hagel · METEOSCHWEIZ MESHS (CH) · KEIN HAGEL ERKANNT · DWD KONRAD3D (DE) · 1 HAGELZELLE ·
Stand 23:50 · vor 7 min" — nach Umschalten auf POH: „… POH (CH) · MAX 36 % · …".
Referenzzeit = ältere der beiden Messzeiten (`oldestRef`, V-19). ✅

**H-6 · Steckbrief DE (Klick auf die Hagelzelle).** „Zelle 22 · Radar erkennt Hagel in der Zelle" ·
„DWD KONRAD3D · Radarerkennung, keine Bodenmeldung" · Hagelfläche 1 km² · Hagel-Obergrenze 4,9 km ·
Radarintensität 61 dBZ · Fuß „Messzeit 23:50 Uhr · kein amtliches Warnprodukt — maßgeblich sind die
DWD-Warnungen". Keine Warnsprache. Beleg: `desktop-de-hagelzelle.png`. ✅

**H-7 · Raster-Verortung end-to-end.** Bild der `image`-Source ausgelesen: MESHS **0 gemalte
Pixel** (hagelfrei = korrekt), POH **25 gemalte Pixel**. Stärkstes Pixel (541,160) über die vier
Eckkoordinaten zurückgerechnet ⇒ **10,07 °E / 47,93 °N (Bayern)** — dasselbe Konvektionsgebiet wie
die KONRAD3D-Hagelzelle bei 10,82/47,50. Zwei unabhängige nationale Radarprodukte stimmen überein.
Beleg: `desktop-ch-poh-signal.png`. ✅
⚠️ **Daraus folgte eine Textkorrektur:** Die Produkte hängen an **Radarverbünden**, nicht an
Staatsgrenzen — die Layer-Texte sagen jetzt „Fläche (Schweizer Verbund) / Zellen (deutscher
Verbund)" statt „CH/DE".

**H-8 · Mobile (iPhone 12 Pro 390×844 DPR 3).** Toggle-Zeile **358 × 56 px**, Produktumschalter
„Korngröße/Chance" **44 px** hoch im Detail-Modus. Beleg: `mobile-layer-detail.png`. ✅

**H-9 · Keine Regression.** `npm run typecheck` grün · `npm run build` grün · `verify:cells`
**64/64 unverändert** (gemeinsamer KONRAD3D-Pfad, additiv erweitert) · Konsole Desktop **und**
Mobile ohne Errors/Warnings. ✅

**Offen (nicht „bestanden"):** MESHS mit echten Werten — in der Prüfnacht war die Schweiz
hagelfrei; der Wertpfad ist über POH und den Verifier belegt, **nicht** an einer MESHS-Hagellage.
## V-WARNUNGEN — Amtliche Wetterwarnungen aus DWD CAP (Phase W1, Gate GW1) — ✅ durchgeführt 2026-08-06

**Harness:** `npm run verify:warnings` — netzfrei, prüft die echten App-Module
(`src/warnings/capAlerts.ts`, `src/warnings/warnField.ts`) gegen eine eingefrorene echte
Fixture (`scripts/fixtures/dwd-cap-district.zip`, 112 476 B, `DISTRICT_DWD_STAT/…_DE.zip`,
publiziert 2026-08-06 14:34:45 UTC, 27 Meldungen / 95 Gebiete / 136 Ringe).

**Ergebnis: 101/101 PASS.** Gliederung: (1) ZIP-Leser, (2) CAP-Feldschema, (3) Geometrie,
(4) amtliche Farbe, (5) Höhenband, (6) Zeitfilter, (7) Zulassung, (8) Karten-Features,
(9) Legende, (10) Texte.

**Die drei Prüfungen, auf die es ankommt**

| # | Prüfung | Warum sie zählt |
|---|---|---|
| 3 | Koordinatenreihenfolge | CAP liefert `lat,lon`, GeoJSON braucht `lon,lat`. Vertauscht wirkt nichts kaputt — die Warnung liegt nur in Zentralasien. Geprüft an der Bounding-Box (6,20–14,27 °O / 47,39–55,06 °N) **und** an einer bekannten Ortslage (Regensburg-Polygon muss in Ostbayern liegen). |
| 5 | Höheneinheit Fuß → Meter | `ceiling` 1968,50394 ft = **exakt 600 m**. Ungewandelt läse sich „gilt nur unterhalb 600 m" als „unterhalb 1968 m" — die Einschränkung kehrte sich um. |
| 8 | Zitat-Treue | Überschrift, Beschreibung und Handlungshinweis müssen im Karten-Feature **byte-gleich** zur amtlichen Meldung stehen. Drei Checks, einer je Textfeld. |

**Rot-Test (V-99).** `FEET_TO_M` in `capAlerts.ts` auf `1` gesetzt ⇒ **4 Checks FAIL**
(3× Einheit, 1× Höhenband-Text), Exit-Code 1, die übrigen 97 bleiben grün. Nach dem
Zurücksetzen wieder 101/101. Beim ersten Durchlauf brach der Harness dabei mit einer
`TypeError` ab statt sauber FAIL zu melden — der betroffene Block ist seitdem null-sicher,
damit der Rot-Test zeigt, **welche** Prüfung greift.

**Live-Verifikation (Chrome DevTools MCP, Desktop 1440×900 + iPhone 12 Pro 390×844 DPR 3)**

| Prüfung | Messwert |
|---|---|
| Requests vor Aktivierung | **0** |
| Requests nach Aktivierung | **1** (98 KB, 115 ms) |
| Layer aus | Quelle geleert, 0 Requests, `visibility: none` |
| Geladene Warnlage | 22 Meldungen / 197 Flächen |
| Bounding-Box live | 6,20–14,27 °O / 47,46–55,06 °N · **0** Flächen östlich 15 °O |
| Amtliche Farben live | `#ffeb3b` 16× · `#fb8c00` 5× · `#cc99ff` 4× (alle aus `AREA_COLOR`) |
| Zeitregler (Standard) | 22 (jetzt) → 14 (+2 h) |
| Zeitregler (`?startnow=0`) | 22 / 12 / 11 / 9 / 9 / 9 über 0…+23 h |
| Bei +23 h | alle 9 verbliebenen sind `expires == null` → „ohne festes Ende" |
| Konsole | 0 Fehler, 0 Warnungen (Desktop **und** mobil) |
| Steckbrief mobil | 291×378 px, vollständig im Viewport |

**Unabhängige Bestätigung der Höheneinheit.** Der Steckbrief errechnete „gilt nur unterhalb
**600 m** Höhe"; der amtliche Meldungstext derselben Warnung (Kreis Freyung-Grafenau) sagt
wörtlich „bis zu einer Höhe von **600m**". Die Fuß-Umrechnung ist damit nicht nur gerechnet,
sondern von der Quelle selbst bestätigt.

**Bei der Prüfung gefunden und behoben.** Die Legendenskala lief stark → schwach, die
Beschriftung darunter schwach → stark — Orange stand über „Wetterwarnung". Nach der Korrektur
live nachgemessen: Felder `#ffeb3b` → `#fb8c00`, Labels „Wetterwarnung" → „markantes Wetter".

**Offen (nicht „bestanden"):**
- **Leerfall** nur im Harness belegt (3 Checks), nicht am Bildschirm — an diesem Tag lagen zu
  jeder Slider-Stunde Warnungen vor.
- **`Severe`/`Extreme`** traten nicht auf; ihre Farben sind ungemessen (**V-156**).
- **Gleichzeitige Überlappung** nur im Harness belegt (Kreis Traunstein, 14:12–15:00 UTC).

**Keine Regression:** `verify:cells` 64/64 · `verify:hail` 55/55 · `verify:precip-source` 30/30 ·
`verify:datenalter` 54/54 · `npm run typecheck` grün · `npm run build` grün.

---

## V-WARNUNGEN-CH — Amtliche Warnungen Schweiz (Phase W2, Gate GW2) — ✅ durchgeführt 2026-08-08

Erweitert **V-WARNUNGEN** (W1), ersetzt es nicht. Die dortigen 101 Checks sind **unverändert**
geblieben und alle grün — das ist der Regressionsbeweis.

**Harness:** `npm run verify:warnings` — netzfrei, gegen die echten App-Module und **echte,
unveränderte** Fixtures: `dwd-cap-district.zip` (W1) plus neu `meteoalarm-ch-atom.xml`
(268 509 B, 33 Einträge) und drei je-Meldung-CAP-Dokumente
(`…-heat-severe.xml`, `…-heat-extreme.xml`, `…-thunder-severe.xml`), Mitschnitt derselben
Minute, 2026-08-08 18:11–18:16 UTC.

**Ergebnis: 175/175 PASS** (101 aus W1 + 47 neu).

**Die vier Prüfungen, auf die es ankommt**

| # | Prüfung | Warum sie zählt |
|---|---|---|
| 13 | Höheneinheit **pro Quelle** | CH schreibt runde **Meter** in ein Feld, das CAP normativ als Fuß definiert. `600.0` muss 600 m bleiben. Eigener Check schlägt fehl, sobald ein CH-Ceiling mit 0,3048 multipliziert wird — genau wie im Kickoff verlangt. |
| 12 | Sprachauswahl | Fünf `<info>`-Blöcke, `en` steht vorn. Ohne Auswahl über `language` zeigt der Steckbrief „Heat wave" statt „Markante Hitzewelle". Gegengeprüft: `severity`, `ceiling`, `areaDesc` sind über alle fünf Blöcke identisch (0 von 306 Meldungen weichen ab) — die Auswahl ändert **nur Text**. |
| 13b | **V-176** | Der amtliche Text sagt „unterhalb von 800 m", das Feld `ceiling` sagt `3000.0`. 32 von 97 deutschsprachigen Meldungen betroffen. Der Höhenhinweis darf für CH deshalb **nicht** aus dem Feld kommen. |
| 16 | Quellenreinheit | Ohne Verzweigung liefe CH in `SEVERITY_FALLBACK_COLOR` — und dessen `Severe`/`Extreme`-Werte sind **ungemessene DWD**-Behelfsfarben. Schweizer Flächen trügen dann eine deutsche Farbe, die niemand je gemessen hat. |

**Rot-Tests (V-99), beide durchgeführt und zurückgesetzt**

| Rot-Test | Eingriff | Ergebnis |
|---|---|---|
| 1 | `altitudeM()` ignoriert die Einheit (immer Fuß) | **4 Checks FAIL**, Exit 1 — u. a. „600.0 ist bereits METER" (182.88) und „NIEMALS mit 0,3048 gerechnet" |
| 2 | `selectInfo()` nimmt immer den ersten Block | **9 Checks FAIL** — und die Meldungen zeigen den echten Defekt im Klartext: „Warning valid below 800 m a.s.l.", „Drink at least 1.5 litres per day" |

Danach jeweils wieder **175/175**.

**Live-Verifikation (Chrome DevTools MCP, Desktop 1440×900 + iPhone 12 Pro 390×844 DPR 3)**

| Prüfung | Messwert |
|---|---|
| Requests vor Aktivierung | **0** |
| Kaltstart | **25** Requests · **1,32 MB** (1 Atom-Index + 24 CAP; 9 abgelaufene Einträge gar nicht geholt) |
| Nach Wiedereinschalten | **1** Request · 263 kB — der Cache je Kennung greift |
| Proxy `/_meteoalarm` im Browser | `200`, 268 493 B, 230 ms, 33 Einträge |
| Warnlage DE + CH bei +15 h | **30** — Deutschland 23 (Wetterwarnung) · Schweiz 7 (Gefahrenstufe 3 · erhebliche Gefahr) |
| DE-Fläche gegen Baseline | **23 Warnungen, identisch** (`before/desktop-de-23-warnungen-plus15h.png`) |
| CH-Geometrie, Stichprobe | Klick auf die orange Fläche im Tessin ⇒ Gebiet **„Bellinzonese"** — die Region liegt dort, wo geklickt wurde (ein `lat,lon`-Tausch hätte sie nach Somalia gelegt) |
| CH-Steckbrief, Sprache | „**Markante Hitzewelle**" · „BELLINZONESE · GEFAHRENSTUFE 3 · ERHEBLICHE GEFAHR · METEOSWISS" |
| CH-Steckbrief, Höhe | Höhe steht **im zitierten Text** („- Warnung gilt unterhalb von 600 m ü.M."), **keine** eigene „Höhe"-Zeile aus `ceiling` (V-176) |
| CH-Steckbrief, Fußzeile | „AMTLICHE WARNUNG — METEOSCHWEIZ, TEXT UNVERÄNDERT ÜBERNOMMEN · **FARBE AUS DER AMTLICHEN GEFAHRENSTUFE ABGELEITET**" |
| CH-Farbfeld | `#fb8c00` (aus `awareness_level` „3; orange; Severe"), **nicht** der DWD-Fallback |
| DE-Steckbrief (Regression) | „Amtliche WARNUNG vor HITZE · KREIS DONAU-RIES · **Wetterwarnung**" · Zeile „**Höhe**" weiterhin vorhanden · Farbe `#cc99ff` (amtliche `AREA_COLOR`) · Lizenz „© GeoBasis-DE / BKG 2021" · **keine** „abgeleitet"-Fußnote |
| Ausfall nur CH | „⚠ Warnungen · … 23 FÜR IN 15 H · DEUTSCHLAND: 23 — **⚠ DIE SCHWEIZ KONNTE NICHT GELADEN WERDEN, HIER FEHLEN WARNUNGEN**" |
| Ausfall nur DE | „… 7 FÜR IN 15 H · SCHWEIZ: 7 — **⚠ DEUTSCHLAND KONNTE NICHT GELADEN WERDEN, HIER FEHLEN WARNUNGEN**" · Datenalter springt korrekt auf den CH-Stand („Stand 10:57 · vor 9 h") |
| Legende mobil | je Land getrennt: „Deutschland / amtliche Farbe" gegen „Schweiz / **Farbe abgeleitet**" |
| Touch-Targets mobil | **kein** Ziel < 44 px (Layer-Screen + Bottom-Nav gemessen) |
| Konsole | 0 Fehler, 0 Warnungen nach sauberem Reload (die zwischenzeitlichen 500er stammten aus Vite-HMR während der Bearbeitung) |

**Messfallstrick, protokolliert.** Ein Ausfall-Test scheitert stumm, wenn man ihn innerhalb von
60 s wiederholt: **beide** Quellen haben einen 60-Sekunden-Speichercache, ein Aus/Ein-Zyklus holt
dann gar nichts. Die ersten beiden Gegenproben zeigten deshalb fälschlich „alles da". Erst nach
Aussitzen der TTL (bzw. mit frischer Seite) greift die Sperre. **Wer diesen Test wiederholt, muss
zwischen den Läufen > 60 s warten.**

**Offen (nicht „bestanden"):**
- **Long Tasks > 200 ms — nicht entscheidbar.** Dieselbe Konfiguration lieferte über mehrere
  Läufe 216 ms und 10 333 ms; die *DE-only*-Variante (von W2 unberührt) fiel dabei **schlechter**
  aus als beide Quellen zusammen (854/526/428 ms). Das ist die in `agents.md` §7 dokumentierte
  MCP-Verzerrung, kein Messwert. Real-Device-Messung nötig.
- **Leerfall CH** nicht am Bildschirm gesehen — an diesem Tag lagen durchgehend Schweizer
  Hitzewarnungen vor. (Der **deutsche** Leerfall wurde erstmals live gesehen: „JETZT KEINE FÜR
  DEUTSCHLAND · Stand 09:20", `before/desktop-de-leerfall-jetzt.png` — der in W1 offene Punkt.)
- **Mehrgebiets-Meldung** im Atom-Index unbelegt (alle 33 Einträge trugen Index `0,0,0`).

---

## V-WALDBRAND — Waldbrand DACH (Phase WB, Gates GWB0–GWB5)

> Verifikationsplan zur Analyse vom 2026-08-14. Quellen: `docs/DATA_SOURCES.md` §W ·
> Architektur: `architecture.md` §14 · Plan: `plan.md` §Phase WB.
> Basisprotokoll **V-ALL** gilt zusätzlich und vollständig.

### WB-T0 — Transport und CORS (Gate GWB0, **vor** allem anderen)

| # | Schritt | Erwartung | Beleg |
|---|---|---|---|
| T0-1 | `node scripts/l0/probe-cors.mjs --json audit/l0/cors-waldbrand.json` mit Prod-Origin | Jede Waldbrand-Zeile mit `acao`-Wert und `verdict` | JSON + Konsolentabelle |
| T0-2 | `GetMap` gegen `maps.effis.emergency.copernicus.eu/gwis` (Layer `ecmwf.fwi`, DACH-BBox) | HTTP 200, PNG, `Access-Control-Allow-Origin` gesetzt | Header-Auszug |
| T0-3 | `GetFeature` gegen `…/effis?…typename=ms:viirs.hs&outputformat=geojson` | HTTP 200, gültiges GeoJSON, Feature-Anzahl > 0 in der Saison | Antwortausschnitt |
| T0-4 | `data.geo.admin.ch/…/gefahren-waldbrand_warnung_2056.geojson` | HTTP 200, `application/geo+json`, ACAO gesetzt | Header + erstes Feature |
| T0-5 | WBI-CSV über `/_dwd_opendata/climate_environment/CDC/derived_germany/fire_danger_index/woodland/forecast/recent/` | Listing erreichbar, eine CSV.gz entpackbar, Spalten `Stationsid;Termin;wbi_0…wbi_6` | Rohausgabe |
| T0-6 | `grids_germany/daily/fire_danger_index/` erneut prüfen | Erwartung **404** — falls der DWD das Raster nachliefert, ist der Plan zu ändern | Statuscode |
| T0-7 | **Negativkontrolle:** ein Endpunkt ohne CORS im selben Lauf | wird als `no-cors` erkannt ⇒ Lauf ist aussagekräftig | Tabellenzeile |

**Abbruchbedingung:** T0-2 negativ ⇒ Phase stoppt, Eskalation an Jan (Rewrite = STOPP-Zone).

### WB-T1 — Gerüst und Funktionserhalt (Gate GWB1) — ✅ durchgeführt 2026-08-14

Dev-Server `:5199`, Chrome DevTools MCP. Belege: `audit/screenshots/waldbrand/after/`.
Diagnose: `audit/waldbrand-geruest.md`.

| # | Gemessen | Urteil |
|---|---|---|
| T1-1 | `LayerKey` nach `src/map/layerTypes.ts` verschoben, `MapView.tsx:638` re-exportiert. **Nachgeholt am 2026-08-14 mit einem stärkeren Verfahren als dem Pixel-Diff: Byte-Identität des ausgelieferten Chunks.** Bauen mit zurückgenommener Änderung → `MapView-CLWobWZw.js`, 290.612 B, `sha256 9c36eb49…afad08`; bauen mit der Änderung → **derselbe Dateiname, dieselbe Größe, derselbe SHA-256**. Rollup benennt Chunks nach Inhalts-Hash; gleicher Name ⇒ gleiches Byte für Byte ausgeliefertes JavaScript | ✅ **belegt** |
| T1-1b | **Warum kein Pixel-Diff:** Die Wetterkarte rendert animierte Wind-Partikel in WebGL und zeigt Uhrzeit, Lauf-Alter und Live-Messwerte. Gemessen: ein normalisierter DOM-Fingerabdruck (Canvas entfernt, Uhr/Alter/Lauf maskiert) ergab bei **identischem Code** in vier Läufen **drei verschiedene Hashes** — `300d30b0` / `aa7eaeb1` (zweimal) / `8e6a2f58` — bei jedes Mal exakt 33.289 Zeichen Länge. `Page.captureScreenshot` lief auf derselben Seite zweimal in einen Timeout. **Ein „pixelgleicher" Screenshot ist auf dieser Seite nicht herstellbar**, und ein Vergleich, der ohnehin rauscht, belegt nichts (V-206) | ✅ **Befund** |
| T1-2 | Layer-Schalter der Wetterkarte vollzählig und beschriftet (Warnungen, Niederschlag, Zellbahnen, Hagel, Rotation, Schnee, Wind, Böen, Temperatur, Satellit, Blitze, Blitzprognose, Stationen, Gewitter) | ✅ |
| T1-3 | Lazy-Chunk `FirePage-*.js` **14,4 KB** + `FirePage-*.css` 7,2 KB; Sonde auf MapView-Marker (`LAYER_OPTIONS`, `initialActive`) im Chunk: **false**. Zusätzlich `verify:fire-model`-Sonde: kein Modul in `src/fire` importiert aus `MapView.tsx` | ✅ |
| T1-4 | `eagerJs` 123,1 → **123,6 KB** (+0,5 KB, die zehnte Kachel), `eagerCss` **8,5 KB** (auf der Grenze), `largestChunk` 278,4 KB und `totalJs` 838,4 KB im Budget | ⚠️ **grün, aber `eagerJs` nicht unverändert** |
| T1-5 | `#wb=`-Permalink wird laufend geschrieben (`{"b":3,"d":0,"w":24}`) und beim Laden gelesen; Layer-Set, Tag und Fenster stellen sich wieder her | ✅ |
| T1-6 | `verify:fire-model` **64/64**, `verify:fire-time` **52/52** | ✅ |
| T1-7 | **Zeitregler-Klemmung im UI nachgemessen:** nur EU ⇒ max 9 · + Treiber ⇒ **1** · + amtliche Stufe ⇒ bleibt 1 · Treiber aus ⇒ **6** · nur Zeitpunkt-Layer ⇒ **kein Regler** | ✅ |
| T1-8 | Touch-Targets 390×844 DPR 3: nach Korrektur **alle** Bedienelemente ≥ 44 px. Einzige Ausnahme: MapLibres eigene Zoom-Knöpfe (29×29) — Bibliotheks-Default, identisch in allen Decks | ✅ mit benannter Ausnahme |
| T1-9 | **Risiko G2 (Rail-Höhe in sechs Decks):** entkräftet. Die Rails tragen einen `flex`-Spacer, der den zehnten Eintrag absorbiert — Historie-Deck gemessen bei 1440×900 (Rail 839 px, Home-Knopf endet bei 886) **und** 1366×768 (Rail 713 px, Home bei 756). Kein Überlauf, kein Scrollbalken. Wetterkarte und Historie zeigen mobil ohnehin keine Rail | ✅ |
| T1-10 | **Risiko G3 (SA1-Raster):** DOM-Reihenfolge der neun bestehenden Kacheln unverändert (`nowcast, forecast, karte, tour, event, history, threed, globus, feedback`), Waldbrand ist die zehnte und letzte; Zähler liest **„10 WERKZEUGE"** statt hartcodiert 09 | ✅ |
| T1-11 | Konsole auf Startseite, Waldbrand-Deck und Wetterkarte: **keine Errors, keine Warnings** | ✅ |

**Während des Laufs gefunden und behoben:** Gerüst-Notiz verdeckte mobil die Attributionszeile der
Basiskarte (Lizenzpflicht) ⇒ nach oben verlegt · aktiver Rail-Knopf lag mobil außerhalb des
sichtbaren Bereichs ⇒ `scrollIntoView` beim Mount, nur in `FirePage`, nicht in der geteilten Rail ·
Kachel-Icon war dunkel auf dunkel ⇒ Farben inline im SVG (CSS hatte kein Budget) · CSS-Syntaxfehler
durch einen zerrissenen Kommentar ⇒ gefixt, Build wieder ohne Warnung.

**Zwei Fallstricke fürs Protokoll:** `npm run typecheck | tail` liefert den Exit-Code von `tail`,
nicht von `tsc` — Fehler sehen dabei wie Erfolg aus. Und ein Batch-Klicktest über zwischengespeicherte
DOM-Knoten meldete die Layer-Schalter fälschlich als defekt; die Einzelmessung über `aria-pressed`
zeigte, dass sie korrekt arbeiten.

#### Ursprünglicher Prüfplan (unverändert, zur Nachvollziehbarkeit)

| # | Schritt | Erwartung | Beleg |
|---|---|---|---|
| T1-1 | `LayerKey`-Verschiebung: Wetterkarte auf 1440×900 laden, gegen Baseline diffen | **pixelgleich** | Screenshot-Diff |
| T1-2 | Alle 19 bestehenden Layer einzeln toggeln | Verhalten unverändert, keine neue Konsolenmeldung | Protokolltabelle |
| T1-3 | Import-Graph des Waldbrand-Chunks prüfen | **kein** `MapView.tsx` im Chunk | Bundle-Analyse |
| T1-4 | `npm run budget` | `eagerJs` unverändert, Waldbrand ist Lazy-Chunk | Ausgabe |
| T1-5 | `#wb=`-Permalink laden | Ansicht stellt Ort, Layer und Tag wieder her | Screenshot |
| T1-7 | Startseite Desktop 1440×900 gegen SA1-Baseline | zehnte Kachel eingefügt, **keine bestehende verschoben**, Raster 4-spaltig intakt | Screenshot-Diff |
| T1-8 | Startseite 390×844 und Tablet-Breite | 1–2 bzw. 3 Spalten, kein Umbruch-Bruch, kein Überlauf | Screenshots |
| T1-9 | Werkzeug-Zähler ablesen | zeigt **10**, nicht 09 | Screenshot |
| T1-10 | Filter-Chips durchklicken | Waldbrand-Kachel dimmt in der richtigen Kategorie mit, kein Reflow | Screenshots |
| T1-11 | Command-Palette öffnen | Waldbrand-Eintrag vorhanden, Nummerierung lückenlos, Sprung funktioniert | Screenshot |
| T1-12 | **Rail-Höhe in allen sechs Decks** (Route, Event, Regenradar, Konfidenz, Historie, Atmosphäre), Desktop **und** 390×844 | zehntes Icon passt, kein Deck bricht um, Home-Knopf bleibt erreichbar | 12 Screenshots gegen Baseline |
| T1-13 | Kachel, Palette-Eintrag, Rail-Knopf nacheinander | alle drei landen auf derselben Ansicht | Protokolltabelle |
| T1-6 | `verify:fire-model`, `verify:fire-time` | grün, Anzahl Checks im Beleg | Konsolenausgabe |

### WB-T2 — Zwischenstand 2026-08-14 (4 von 5 Layern live gemessen)

Dev-Server `:5199`, Chrome DevTools MCP, 1440×900. Diagnose `audit/waldbrand-layer.md`.

| # | Gemessen | Urteil |
|---|---|---|
| T2-1 | Datenalter je Layer echt aus der Quelle: CH-Stufe **„Stand 12:09 · vor 1 T 2 h"** (gestriger BAFU-Stand) · Feuerverbote **„vor 2 T 2 h"** · Hotspots **„vor 8 h"** · EU-Index ohne Referenzzeit (WMS liefert keine) | ✅ |
| T2-2 | **Risiko R4 belegt sich von selbst:** BAFU publiziert Mo–Fr nach Mittag, am Messtag war der Stand vom Vortag — die Anzeige sagte **Alter**, nicht „aktuell". Ein Wochenend-Fixture steht noch aus | ⚠️ teilweise |
| T2-4 | Netzwerk-Tab: **genau 1** Abruf `data.geo.admin.ch`, **1** Stationsliste, **exakt 60** Stations-CSVs (Deckel, V-200) | ✅ **gezählt, nicht behauptet** |
| T2-6 | Fehlerfall trat im Test **echt** ein (s. u.): Layer zeigte „Keine Daten — der Layer zeigt nichts an (nicht: keine Gefahr)" + Deep-Link auf den DWD | ✅ |
| T2-7 | Alle fünf Steckbriefe enthalten wörtlich „kein amtliches Warnprodukt" | ✅ |
| T2-9 | Hotspots: **1500** Detektionen, **alle 1500 geometrisch in DACH** (5,60–17,37° / 45,50–55,43°), `acq_at` 13.–14.08.; Kappung als „(Anzeige begrenzt)" ausgewiesen. Kein `frp` — wie in V-199 festgelegt | ✅ |
| T2-10 | Attributionszeile führt **alle vier** Quellen: „© BAFU · © Data: swisstopo \| © European Union, Copernicus EMS — GWIS (CC BY 4.0) \| Datenbasis: Deutscher Wetterdienst, Waldbrandgefahrenindex · CC BY 4.0 \| OpenFreeMap © OpenMapTiles Data from OpenStreetMap" | ✅ |
| T3-1 | EU-Fläche läuft **durchgehend** über DE, AT und CH — kein Sprung an den Grenzen (Screenshot `wb2-desktop-daten.jpeg`) | ✅ |
| — | Zeitachse Ende-zu-Ende: Regler auf +3 ⇒ WMS-`TIME` wechselt **2026-08-14 → 2026-08-17** | ✅ |
| — | Gerenderte Features: 143 CH-Flächen · 60 DE-Punkte · 143 Verbotsgebiete · 20 GWIS-Kacheln | ✅ |
| — | Konsole auf der Datenansicht: **leer** | ✅ |

**Vier Fehler, die erst die Live-Prüfung gezeigt hat** — alle vier waren am grünen Verifier vorbei:

1. **BAFU liefert EPSG:2056, nicht WGS84.** Das STAC-Item führt genau ein Asset (`…_2056.geojson`),
   eine 4326-Fassung antwortet mit **403**. Ungewandelt landen die Polygone bei `[2607356, 1185118]`
   und sind unsichtbar: Daten geladen, Karte leer, **keine Fehlermeldung**. Behoben mit der amtlichen
   swisstopo-Näherungsformel (`src/fire/sources/swissProjection.ts`, keine neue Abhängigkeit).
2. **Geteilter Promise-Cache am Abbruch-Signal.** React 19 ruft Effekte unter `StrictMode` doppelt
   auf; das Aufräumen des ersten Laufs brach den Abruf ab, und der zweite Lauf erbte den vergifteten
   Promise aus dem Cache. Sah aus wie ein Netzwerkfehler, war ein Entwurfsfehler. Behoben: die
   geteilten, gecachten Loader nehmen **kein** `AbortSignal` mehr.
3. **Sichtbarkeit ging lautlos verloren.** Die erste Fassung reihte Kartenänderungen in eine
   Warteschlange ein und leerte sie beim `styledata`-Ereignis — das feuert aber mehrfach und schon
   **bevor** die eigenen Layer existieren. Ergebnis: alle Layer auf `visibility: none`, Raster-Quelle
   gar nicht angelegt, keine Meldung. Ersetzt durch **idempotentes Nachziehen** (`applyState`).
4. **Der Basiskarten-Effekt lief beim Mounten mit** und setzte den gerade geladenen Stil zurück.
   Behoben durch einen Erstlauf-Wächter.

**Zwei Fallstricke fürs Protokoll:** Vier Quell-Sonden im neuen Verifier haben zunächst **korrekten
Code angeklagt** — sie trafen Doku-Kommentare und die Prüf-Strings der Selbstverifikation. Gelöst
über einen `productionCode()`-Helfer, der Kommentare und `verify*`-Rümpfe entfernt; Klammernzählen
scheitert dabei an der Rückgabetyp-Annotation. Und ein Referenzpunkt („Chur") in der
Projektionsprüfung lag um 1 km daneben — **nicht die Formel war falsch, sondern mein
auswendig gegriffener Eingabewert**; entfernt statt die Toleranz aufzuweiten.

**Restliste am selben Tag abgearbeitet — sechs weitere Messungen:**

| # | Gemessen | Urteil |
|---|---|---|
| T2-11 | `fireWeather` rendert: ICON-D2 `relhum_2m`, 25 Stundenschritte, „Lauf 09z · vor 3 h" (Referenzart `run`, nicht `measured`). Textur 608×373, **188.731 gültige Zellen**, Trockenheit 0…0,91, Feuchtespanne 9–100 %, **70,6 %** über der Sichtbarkeitsschwelle | ✅ |
| T2-12 | `/lizenzen/` enthält die Gruppe „Waldbrand DACH" mit GWIS, DWD-WBI, `relhum_2m` und BAFU — inkl. der FSDI-Begründung für das STAC-Feld „proprietary" | ✅ |
| T2-13 | Mobile 390×844 DPR 3: **alle eigenen Bedienelemente ≥ 44 px** (Fenster-Umschalter von 36 auf 44 korrigiert), kein seitliches Scrollen, Karte 439 px. Ausnahmen: MapLibre-Zoomknöpfe und Attributionslinks (bibliotheksseitig) | ✅ mit benannten Ausnahmen |
| T3-2/3 | **Grenze DE/CH bei Basel, Zoom 7** (`wb2-grenze-de-ch.jpeg`): EU-Fläche läuft **blockig durchgehend** über die Grenze; 162 CH-Warnregionen enden bei 47,81° N; die DE-Stationen beginnen dort. Beide Skalen stehen mit eigenem Label nebeneinander, keine gemeinsame Legende | ✅ |
| T3-7 | Landesmaske über allen Fachlayern (`moveLayer` idempotent) — der Treiber färbte zuvor die ICON-D2-Domäne bis Polen ohne Abdunklung. Reichweite steht jetzt zusätzlich im Steckbrief | ✅ |
| T2-2 | **Wochenend-Fixture:** Freitagsstand 12:05 UTC, gelesen am Sonntag 10:00 ⇒ „Stand 14:05 · **vor 1 T 21 h**". Kein „aktuell", keine Abrufzeit (Risiko R4) | ✅ |
| T2-6 | Fehlerfall künstlich erzwungen (503 auf alle Fremdquellen): Layer sagt „Keine Daten — der Layer zeigt nichts an (nicht: keine Gefahr)" und verlinkt die **passende** Quelle | ✅ |

**Ein Fehlverweis dabei gefunden und behoben:** Der Ausfall der Satelliten-Hotspots schickte den
Nutzer zum **DWD-Waldbrandgefahrenindex** — eine völlig andere Aussage, und das ausgerechnet in dem
Moment, in dem er dem Link am ehesten folgt. Jetzt sagt der Layer, dass es für aktive Brände in DE,
AT und CH **keine offene behördliche Echtzeitquelle** gibt (§W.2), statt auf ein fremdes Produkt zu
zeigen. Die Landesstufen verlinken länderrichtig (CH → naturgefahren.ch, DE → DWD).

**Zwei weitere Fehler, die erst das Rendern zeigte:** (5) `installLayers` legte für `fireWeather`
einen Platzhalter mit **derselben Id** an — der echte `ScalarLayer` kam nie in die Karte, sein
`onAdd` nie zum Zug, die Daten lagen dauerhaft in `_pending`. Werte korrekt geladen, nichts sichtbar,
keine Meldung. (6) Die DACH-Maske lag **unter** den Fachlayern statt darüber.

#### Ursprüngliches Kernprotokoll (unverändert)

### WB-T2 — Datenaktualität und Ehrlichkeit (Gate GWB2) — **das Kernprotokoll**

| # | Schritt | Erwartung | Beleg |
|---|---|---|---|
| T2-1 | Jeden Layer aktivieren, `dataAge` ablesen | Alter je Layer sichtbar, Einheit korrekt | Screenshots |
| T2-2 | **CH am Wochenende** (oder Fixture mit Freitags-Timestamp) | Anzeige sagt **„Stand Freitag, X Tage alt"** — nicht „aktuell" | Screenshot + Fixture |
| T2-3 | DWD-WBI nach 04:20 UTC und davor | Vor dem Lauf: Vortagesstand mit Alter; **kein** stiller Leerstand | zwei Screenshots |
| T2-4 | Netzwerk-Tab bei aktivem CH-Layer, 10 min Sitzung | **genau ein** Abruf, kein Polling (Fair Use) | HAR/Netzwerk-Auszug |
| T2-5 | Response-Header der amtlichen Landesstufen | **kein** `durable`, kurzes TTL | Header-Auszug |
| T2-6 | Layer künstlich auf Fehler zwingen (Offline/404) | Layer schaltet ab **und** verlinkt die amtliche Quelle; **kein** stiller Leerstand, keine alten Daten | Screenshot |
| T2-7 | Steckbrief jedes Layers lesen | enthält wörtlich **„kein amtliches Warnprodukt"**, Quelle, Auflösung, Grenzen | Screenshots |
| T2-8 | Interpolierte WBI-Fläche (falls gebaut) | Stützstellen sichtbar **und** Vermerk „eigene Interpolation" | Screenshot |
| T2-9 | Hotspot antippen | zeigt **Erfassungszeit (`acq_at`)** und den Satz „Thermalanomalie, keine Einsatzmeldung" **plus** den Hinweis, dass die Feuerstrahlungsleistung von der offenen Schnittstelle nicht geliefert wird. ⚠️ **Geändert 2026-08-14 (V-199):** `frp`/`satellite` waren hier gefordert, liegen an den live abrufbaren GWIS-Fensterlayern aber **nicht** an (nur `id, acq_at, CLASS`) — sie zu zeigen hieße, sie zu erfinden | Screenshot |
| T2-9b | Quelle des Hotspot-Layers im Netzwerk-Tab | Aufruf geht an **GWIS `ms:viirs.hs.today`/`.week`**, **nicht** an den EFFIS-Endpunkt; jüngste `acq_at` liegt im gewählten Fenster (V-198) | HAR-Auszug |
| T2-9c | DE-Stationen: Netzwerk-Tab beim Zoomen | `stations_list.txt` **genau einmal**; Wert-CSVs nur für sichtbare Stationen, **≤ 60 gleichzeitig** — **nicht** 484 Requests | HAR-Auszug |
| T2-10 | Attributionszeile und `/lizenzen/` | alle neuen Quellen gelistet, DWD-Formel für abgeleitete Daten korrekt | Screenshot + HTML |

### WB-T3 — Grenzübergänge DE/AT/CH (Gate GWB2/GWB3)

| # | Schritt | Erwartung | Beleg |
|---|---|---|---|
| T3-1 | Auf die Grenze DE/AT zoomen, nur `fireDanger` aktiv | EU-Fläche **durchgehend**, kein Sprung, keine Naht | Screenshot |
| T3-2 | Zusätzlich `fireIndexNational` aktivieren | DE-Stationen enden an der Grenze, AT bleibt leer — **erkennbar gewollt**, mit Hinweistext | Screenshot |
| T3-3 | Grenze DE/CH: DE-Stufe und CH-Stufe nebeneinander ablesen | **beide mit eigener Skala und eigenem Quellenlabel**; keine gemeinsame Legende | Screenshot |
| T3-4 | Legende prüfen: DE-Stufe 2 vs. CH-Stufe 1 (beide „geringe Gefahr") | Farben/Positionen sind **nicht** gleichgesetzt; Erläuterung sichtbar | Screenshot |
| T3-5 | Ort in AT wählen, Punktabfrage | zeigt EU-Modellwert **und** den Satz „für Österreich gibt es keine offene amtliche Stufe" + Deep-Link | Screenshot |
| T3-6 | `npm run verify:official-sources` | grün, AT-Waldbrand-Zweig abgedeckt | Konsolenausgabe |
| T3-7 | Landesmaske: `ScalarLayer`-Treiber am DACH-Rand | Layer wird von der Maske sauber geclippt (Depth-Kontrakt intakt) | Screenshot |

### WB-T4/T5 — Playback, Scrubben, Mobile — ✅ durchgeführt 2026-08-14

Dev-Server `:5199`, Chrome DevTools MCP. Diagnose `audit/waldbrand-zeit.md`.

| # | Gemessen | Urteil |
|---|---|---|
| T4-4 | Regler über die volle Spanne: jeder Tagesschritt beschriftet, WMS-`TIME` folgt (2026-08-14 → 2026-08-23) | ✅ |
| T4-6 | **Play/Pause + schnelles Scrubben:** Playback läuft `morgen → übermorgen → Mo +3 → … → So +9` und **endet am Horizont** (`aria-pressed=false`, Beschriftung zurück auf „Tage abspielen"). Neun Scrub-Schritte in Folge lösen **0** Kachel-Anfragen aus; nach 140 ms Ruhe **ein** Quellenwechsel. Konsole leer | ✅ |
| — | **Prefetch:** Folgetag wird im Leerlauf über `new Image()` gewärmt. Ein unsichtbarer Layer wäre der naheliegende, aber falsche Weg — MapLibre fragt bei `visibility: none` null Kacheln an (WB2 gemessen) | ✅ |
| — | **Geräteklasse:** `initialTier(readDeviceCaps(gl))` → 0,7 / 0,9 / 1,1 Tage je Sekunde. Gemessen 10 Tage in ~9 s auf `high` | ✅ |
| T5-2 | **30-s-Fenster mit Playback: null Long Tasks** (PerformanceObserver `longtask`), INP 99 ms. Trace: `audit/traces/waldbrand/wb3-playback.json.gz` | ✅ |
| T5-3 | Touch-Target-Audit 390×844 DPR 3: **alle eigenen Bedienelemente ≥ 44 px**. Ausnahmen: MapLibre-Zoomknöpfe (29×29) und die Attributionslinks — bibliotheksseitig | ✅ mit benannten Ausnahmen |
| T5-4 | **Bottom-Sheet** (`src/mobile/BottomSheet.tsx` wiederverwendet): Start `collapsed`, Karte vollflächig 682 px, Zeitregler mit Abspielknopf schwebt **über** dem Sheet und bleibt bedienbar, während die Karte sichtbar ist | ✅ |
| — | Kein seitliches Scrollen auf 390 px | ✅ |

**Zwei Dinge, die die Messung erzwungen hat:**

1. **Die Attributionszeile lag unter der mobilen Zeitleiste** — abgeschnitten und damit unlesbar.
   Das ist eine **Lizenzpflicht** (GWIS, BAFU, DWD, OpenFreeMap), keine Kosmetik; die MapLibre-
   Steuerleisten sind auf 390 px jetzt über die Zeitleiste gehoben (gegengemessen: kein Überlapp,
   vollständig im Bild).
2. **CLS 0,19** beim Laden — über der „gut"-Schwelle von 0,1. Ursache: die Statuszeilen wachsen
   nach, sobald die Layer-Daten eintreffen, und schieben die Blöcke darunter. Für dieses Gate waren
   Long Tasks gefordert (null), der Wert bleibt aber ein echter Befund und steht als **V-210** im
   Katalog statt in einer Fußnote.

**Ein Fallstrick fürs Protokoll:** Die erste Zusicherung im Playback-Modell („ein Sekundenschritt
bei 1,1 T/s ⇒ Tag 1") war **falsch, nicht der Code** — sie hatte den bewussten `dt`-Deckel von
0,25 s vergessen. Korrigiert und um eine Messung über 240 rAF-Schritte ergänzt, die zeigt, dass die
Uhr bei echter Bildrate exakt mit der eingestellten Geschwindigkeit läuft.

#### Ursprünglicher Prüfplan (unverändert)

### WB-T4 — Layer-Umschaltung und Zeitregler (Gate GWB3)

| # | Schritt | Erwartung | Beleg |
|---|---|---|---|
| T4-1 | Jeden Layer einzeln an/aus | sichtbare Kartenänderung je Layer, kein Einfrieren | Screenshot-Stichproben |
| T4-2 | Vier Layer gleichzeitig | Z-Ordnung stabil, Beschriftungen lesbar, keine Flackerer | Screenshot |
| T4-3 | Layer **vor** dem Stil-Load toggeln | Sichtbarkeit friert **nicht** ein (V-164 in der Wetterkarte — hier von Anfang an vermeiden) | Screenshot + Konsole |
| T4-4 | Zeitregler über die volle Spanne ziehen | jeder Tagesschritt rendert; WMS-`TIME` wechselt; kein Hängen | Trace |
| T4-5 | Layer mit kürzerem Horizont aktivieren | Regler klemmt korrekt, springt nicht ins Leere | Screenshot |
| T4-6 | Play/Pause, dann schnelles Hin-und-her-Scrubben | keine Race-Condition, keine Fehlframes, Konsole sauber | Trace + Konsole |
| T4-7 | Preset umschalten (falls gebaut) | Layer-Set wechselt vollständig, Zeitregler passt sich an | Screenshot |

### WB-T5 — Mobile-Performance (Gate GWB3)

| # | Schritt | Erwartung | Beleg |
|---|---|---|---|
| T5-1 | 390×844 DPR 3, kalter Start | erster sinnvoller Karteninhalt < 3 s auf Fast 4G | Trace |
| T5-2 | 30-s-Trace bei aktivem Playback mit drei Layern | **keine Long Tasks > 200 ms**, Framerate stabil im aktiven Tier | Trace |
| T5-3 | Touch-Target-Audit über alle Bedienelemente | alle ≥ 44×44 px oder begründete Ausnahme | Audit-Liste |
| T5-4 | Bottom-Sheet-Snaps, Scroll im Sheet | Karte bewegt sich dabei nicht | Screenshots |
| T5-5 | Speicher nach 5 min Playback | kein monotoner Anstieg (Frame-Puffer wird freigegeben) | Heap-Snapshots |
| T5-6 | Landscape 844×390 | kein harter Bruch, alles erreichbar | Screenshot |
| T5-7 | Real-Device-Stichprobe (scrcpy/ADB) | `ScalarLayer`-Treiber korrekt eingefärbt — Emulation ist für GPU **nicht** repräsentativ | Foto/Aufnahme |

### WB-T6 — Regression auf die Wetterkarte (jedes Gate)

| # | Schritt | Erwartung | Beleg |
|---|---|---|---|
| T6-1 | Wetterkarte Desktop 1440×900 gegen Baseline | pixelgleich | Diff |
| T6-2 | Wetterkarte: alle Layer durchtoggeln | unverändert | Protokolltabelle |
| T6-3 | `npm run typecheck` + alle `verify:*` | grün wie vor der Phase | Konsolenausgabe |
| T6-4 | Warm-Cron-Manifest | unverändert, **außer** `relhum_2m` wurde von Jan freigegeben | `latest-grib.json` |

---

## Beleg-Ablage
- Screenshots: `audit/screenshots/<feature>/{before,after}/`
- Traces: `audit/traces/<feature>/`
- Audit-Berichte: `audit/<feature>.md` (Diagnose + Verify-Protokoll + Selbstverifikations-Antworten)

---

## V-ZELLBAHNEN-KARTE — Zellbahnen: Lesbarkeit und Standortbezug (Phase Z2, Gate GZ2) — ⏳ geplant

Diagnose: `audit/zellbahnen-karte.md`. Kickoff: `prompt-zellbahnen-v2.md`.
Belege gehören nach `audit/screenshots/zellbahnen-karte/`.
Setup wie oben: Desktop 1440×900 **und** iPhone 12 Pro 390×844 DPR 3, Dev-Server, Konsole offen.

> **Voraussetzung für dieses Protokoll:** eine Lage mit erkannten Zellen. An einem
> konvektionsfreien Tag liefert KONRAD3D **0 Zellen** — das ist der Normalfall, kein Fehler
> (`audit/zellbahnen.md` §5). Ohne Zellen ist das Protokoll **nicht** durchgeführt, sondern
> **vertagt**; ein leerer Screenshot ist kein Beleg.

**ZK-0 · Baseline vor der Phase.** Layer `cells` an, Desktop und Mobile, bei konvektiver Lage.
Ablage `audit/screenshots/zellbahnen-karte/before/`. Erwartung: verwertbare Referenz für den
Pixel-Diff aus ZK-9. Beleg: zwei Screenshots.

**ZK-1 · Richtungspfeil.** Eine Zelle auswählen, `bearing` aus dem Popup ablesen und die
gezeichnete Pfeilrichtung dagegen halten. Erwartung: Pfeil zeigt entlang der Spur, Abweichung zur
Peilung < 5°. Beleg: Screenshot + notierte Peilung.

**ZK-2 · Zeitmarken.** Erwartung: genau drei Marken (+15/+30/+60) auf der Spur, in dieser
Reihenfolge, keine jenseits des Spurendes. Bei einer **langsamen** Zelle (< 20 km/h) prüfen, ob sie
sich überlagern. Beleg: Screenshot einer schnellen **und** einer langsamen Zelle.

**ZK-3 · Trichter-Verlauf.** Erwartung: die Stufen werden nach hinten sichtbar transparenter; die
+60-Stufe ist deutlich größer als die +5-Stufe (am Fixture Faktor 7,3 der Hauptachse). Beleg:
Screenshot mit sichtbarem Verlauf, Ausschnitt +5 und +60.

**ZK-4 · Standortbezug — Treffer.** Ort so wählen, dass er im Pfad einer Zelle liegt. Erwartung:
die Zelle ist ausgezeichnet, es erscheint eine **Spanne** („erreicht dich in 20–35 min"), kein
Punktwert. Beleg: Screenshot + notierte Werte.

**ZK-5 · Standortbezug — Vorbeizug.** Ort querab wählen. Erwartung: formulierte Aussage
(„zieht ~X km nördlich an dir vorbei"), **kein** leeres Feld und **keine** ETA. Beleg: Screenshot.

**ZK-6 · Standortbezug — Übersichts-Modus.** Karte im `overview`-Modus öffnen. Erwartung: **weder**
Auszeichnung **noch** ETA **noch** Platzhalter — ersatzlos. Beleg: Screenshot.

**ZK-7 · Netzdisziplin.** CDP-Netzwerkmitschnitt, Layer an/aus. Erwartung: **null zusätzliche
Requests gegenüber dem Z1-Stand** — vor Aktivierung 0 `konrad3d`-Requests, danach genau zwei
(Listing + eine XML), wie in V-ZELLBAHNEN Z-6. Beleg: Request-Liste.

**ZK-8 · Ausdünnung.** Zoom über die Schwelle hinaus herauszoomen. Erwartung: Zusatzgeometrie
verschwindet, **der Umriss bleibt**; die Zahl der gezeichneten Features wird vor/nach **gemessen**
(nicht geschätzt) und die Ausdünnung geloggt. Beleg: zwei Screenshots + Feature-Zahlen + Logzeile.

**ZK-9 · Desktop-Pixel-Diff.** 1440×900 gegen ZK-0. Erwartung: außerhalb des `cells`-Layers keine
sichtbare Abweichung. Beleg: Diff-Ergebnis.

**ZK-10 · Mobile.** 390×844 DPR 3. Erwartung: Karte bei aktivem Layer noch lesbar (nicht
Trichter-Teppich), Touch-Targets ≥ 44 px, kein Horizontal-Scroll. Beleg: Screenshots +
Touch-Target-Audit.

**ZK-11 · Konsole und Long Tasks.** Desktop und Mobile. Erwartung: keine neuen Errors/Warnings,
keine Long Tasks > 200 ms beim Ein-/Ausschalten und beim Zoomen. Beleg: Konsolen-Auszug + Trace.

**ZK-12 · Wortlaute.** Popup, Legende, Readout, Toggle-Titel gegenlesen. Erwartung: keine
Warnsprache (nie „trifft", „Warnung", „Gefahr", „Unwetter", „Tornado"); der Satz „kein amtliches
Warnprodukt, kein Warnersatz — maßgeblich sind die DWD-Warnungen" steht an allen vier Stellen.
Beleg: Screenshots der vier Stellen.

---

### Durchführung 2026-08-07 — **so, wie es lief**

Umgebung: Dev-Server `localhost:5178`, Chrome DevTools MCP, Desktop 1440×900 (Pixel-Diff zusätzlich
1440×769) und iPhone 12 Pro 390×844 DPR 3. Belege unter `audit/screenshots/zellbahnen-karte/`.

> ⚠️ **Datenlage — gate-relevant und ausdrücklich benannt.** Am 2026-08-07 lieferte KONRAD3D
> **null Zellen** (`KONRAD3D_20260807T075000.xml`: 3 891 B, 0 `<feature>`). Das ist der Normalfall
> an einem ruhigen Morgen, kein Fehler. Die Punkte, die eine Zelle **brauchen** (ZK-1…ZK-5, ZK-8),
> wurden deshalb über einen **Fixture-Replay** geprüft: `window.fetch` wurde so umgeleitet, dass
> die KONRAD3D-Anfragen `scripts/fixtures/konrad3d-sample.xml` beantworten. Der **gesamte
> App-Pfad** bleibt dabei echt (Transport → Parser → `buildCellFeatures` → Standortbezug →
> Legende); ersetzt ist nur die Netzantwort. **Das ist kein Live-Beleg** und wird hier auch nicht
> als solcher geführt. **Nachzuholen bei der nächsten konvektiven Lage: ZK-1, ZK-2, ZK-3, ZK-4,
> ZK-5 gegen echte Zellen.** ZK-6…ZK-12 liefen live bzw. sind vom Replay unabhängig.

| # | Ergebnis | Beleg |
|---|---|---|
| **ZK-0** | ✅ Baseline aufgenommen, **vor** jeder Codeänderung. Zusätzlich zur leeren Live-Lage ein Z1-Fixture-Replay als Vergleichsbild | `before/00`, `before/01`, `before/10`, `before/20`, `before/21` |
| **ZK-1** | ✅ *(Replay)* Pfeilpeilung **62,11°** gegen Popup-Peilung **61,94°** → **Δ 0,17°** (< 5°). Sprite vorhanden, 1 Pfeil gerendert | `after/31`, `after/33` |
| **ZK-2** | ✅ *(Replay)* genau drei Marken +15/+30/+60, in dieser Reihenfolge auf der Spur, keine jenseits des Spurendes. Langsame Zelle = Zelle 12 (18,1 km/h), schnellere = 231/126 (23,1/22,9 km/h) — bei allen dreien lesbar. **Zwei Korrekturen nötig**, s. u. | `after/32`, `after/35`, `after/51` |
| **ZK-3** | ✅ *(Replay)* Trichter wird nach hinten sichtbar transparenter; Hauptachse 2,322 km (+5) → 16,884 km (+60), Deckkraft 0,20 → 0,04 | `after/30`, `after/32` |
| **ZK-4** | ✅ *(Replay)* Ort im Pfad (47,04726/11,98457) ⇒ **„Zelle 12 erreicht dich in 15–50 min."** — eine Spanne, kein Punktwert; Zelle über `affects` ausgezeichnet | `after/30` |
| **ZK-5** | ✅ *(Replay)* Ort querab (46,92736/12,07708) ⇒ **„Zelle 12 zieht ~15 km nordwestlich an dir vorbei (am nächsten in ~30 min)."** — Aussage, kein leeres Feld, keine ETA | `after/34` |
| **ZK-6** | ✅ **live** Übersichts-Modus: kein Ortsmarker, **kein** Standortsatz, **kein** `affects` an irgendeinem Feature, kein Platzhalter | `after/35` |
| **ZK-7** | ✅ **live** Vor Aktivierung **0** KONRAD3D-Requests, nach Aktivierung genau **2** (Listing + eine XML) — **identisch zum Z1-Stand**, gemessen über einen `fetch`-Zähler (der `performance`-Puffer läuft bei 250 Einträgen über und ist hier untauglich) | s. Gate GZ2, Z2-V4 |
| **ZK-8** | ✅ **gemessen, nicht geschätzt** — Tabelle unten | s. u. |
| **ZK-9** | ✅ Pixel-Diff Z1→Z2 bei gleichem Rahmen/Ausschnitt/Fixture: **Rail+Dock 0 abweichende Pixel**. Topbar 321 px = Uhr (Box x1293–1418/y17–38), Zeitleiste 58 px = Minutenziffern, Statuszeile 1 567 px = Datenalter-Text. Kartenbühne 2,03 % und Readout 33,5 % sind die **beabsichtigten** Z2-Änderungen | `before/10` vs `after/41` |
| **ZK-10** | ✅ 390×844 DPR 3: kein Horizontal-Scroll (`scrollWidth` 390 = `innerWidth`). Touch-Targets < 44 px: nur **vorbestehende** Elemente (MapLibre-Attribution, „jetzt"-Knopf 37 px, Slider 20 px) — **Z2 fügt kein einziges interaktives DOM-Element hinzu** (Pfeil/Marken sind Canvas-Sprites). Der zu kleine Zell-Punkt stammt aus Z1 und ist als **V-166** registriert | `after/50`, `after/51` |
| **ZK-11** | ✅ Konsole **ohne Error/Warning** (Desktop und Mobil). Long Tasks im engen Messfenster um das Einschalten: Desktop **max 109 ms**, Mobil **max 133 ms** — keiner > 200 ms. ⚠️ Eine frühere Messung zeigte bis 31 710 ms; die lief in einer durch Viewport-Wechsel und MCP-Overhead verseuchten Sitzung und ist **nicht** verwertbar (`agents.md` §7). Zusätzlich direkt gemessen: der Z2-Rechenanteil kostet **5,3 ms** bei 3 Zellen (Standortbezug 0,5 ms + Feature-Bau 4,8 ms), hochgerechnet **~67 ms** bei 38 Zellen | s. Gate GZ2 |
| **ZK-12** | ✅ Alle vier Pflichtstellen tragen den Satz: Popup (`MapView.tsx:229`), Toggle-Titel (`:659`), Readout (`:4545`), Legende (`:4709`). Keine Warnsprache in Popup, Legende, Readout, Toggle-Titel oder den neuen Textbausteinen (im Verifier zusätzlich gesperrt) | `after/30`, `after/51` |

**ZK-8 · Ausdünnung, gerenderte Features je Zoomstufe** (`queryRenderedFeatures`, Fixture mit
3 Zellen; Werte sind gerenderte Feature-**Instanzen**, kachelübergreifende Geometrie zählt mehrfach):

| Zoom | cone | cone-step | hull | hull-line | path | mark | arrow | dot |
|---|---|---|---|---|---|---|---|---|
| 4 | 3 | **0** | 3 | 3 | 3 | **0** | **0** | 3 |
| 4,9 | 3 | **0** | 3 | 3 | 3 | **0** | **0** | 3 |
| **5** | 5 | 0 | 3 | 3 | 5 | 0 | **3** | 3 |
| 5,9 | 5 | **0** | 3 | 3 | 5 | 0 | 3 | 3 |
| **6** | 5 | **12** | 3 | 3 | 5 | 0 | 3 | 3 |
| 7 | 6 | 22 | 4 | 4 | 6 | **0** | 3 | 3 |
| 7,9 | 6 | 22 | 4 | 4 | 6 | **0** | 3 | 3 |
| **8** | 6 | 22 | 4 | 4 | 6 | **9** | 3 | 3 |
| 9 | 6 | 30 | 4 | 4 | 5 | 5 | 3 | 1 |

Die drei Schwellen greifen exakt (Pfeil z5, Trichterstufen z6, Zeitmarken z8) — und **Umriss,
Umrisslinie, Spur, Punkt und die Trichterhülle sind auf jeder Zoomstufe durchgehend vorhanden**.
Das ist der Funktionserhalts-Nachweis für die Ausdünnung. Bei z6 sind es **12** Stufen, nicht 36:
die `sev`-Schwelle 0,5 lässt nur Zelle 12 (0,77) den Verlauf behalten, 231 (0,19) und 126 (0,17)
fallen auf die Z1-Hülle zurück. Genau das steht auch in der Logzeile der App.

**Logzeile (kein stilles Weglassen):**

```
[buscosun] Zellbahnen gezeichnet → 3 Zellen, 60 Features
({"cone":3,"cone-step":36,"hull":3,"path":3,"mark":9,"arrow":3,"dot":3})
· Ausdünnung: Trichterstufen erst ab z6 und ab sev 0.5 (2 Zelle(n) darunter — deren Umriss,
  Spur und Trichterhülle bleiben), Zeitmarken ab z8, Pfeile ab z5 · Standortbezug: Zelle 12
```

**Zwei Korrekturen, die erst am Bildschirm auffielen** (Details in `audit/zellbahnen-karte.md` §9):

1. Pfeilkopf und +60-Marke saßen auf **demselben Pixel** (523/372) — beide hängen am Spurende.
   Behoben über `icon-anchor: 'bottom'` + `icon-offset`.
2. `icon-allow-overlap: false` ließ MapLibre **alle drei** Marken verwerfen (0 von 3 gerendert),
   weil die Basemap-Labels zuerst platziert werden. Umgestellt auf `allow-overlap: true`; das
   Restrisiko der Überlagerung ist als **V-167** registriert.

**Harness am Ende der Sitzung:** `verify:cells` **133/133** (die 64 Z1-Checks isoliert nachgefahren:
**64/64**, Ausgabe byte-gleich zu den ersten 64 Zeilen) · `verify:hail` **55/55** · `verify:warnings`
**101/101** · `typecheck` grün · `build` grün.

**Rot-Test (V-99/O-02), zweimal ausgelöst:**

```
# 1 — Vorzeichen in der Rückdrehung von pointInEllipse verdreht
FAIL  pointInEllipse: alle 24 Randpunkte leicht nach innen liegen DRIN
FAIL  pointInEllipse: alle 24 Randpunkte leicht nach außen liegen DRAUSSEN
2 von 133 CHECK(S) FEHLGESCHLAGEN

# 2 — ETA-Spanne auf einen Punktwert zusammengezogen
FAIL  etaWindowToPoint: earliestMin < latestMin — IMMER eine Spanne, nie ein Punktwert  (15 < 15)
FAIL  etaWindowToPoint: die Spanne schließt die tatsächliche Stützstelle (+30) ein
2 von 133 CHECK(S) FEHLGESCHLAGEN
```

---

## V-WINDPARTIKEL-SEGMENTE — Phase WP1 (2026-08-08, Gate GWP1)

Diagnose: `audit/windpartikel-windy-paritaet.md` (inkl. §8 Umsetzungs-Addendum).
Dev-Server :5199, Karte via `#m=`-Permalink (Referenz 50.732/11.895, Layer nur `wind`).
Wetterlage der Sitzung: schwachwindig (~5 kt) — Striche entsprechend kurz; Referenz-Screenshots
von windy.com stammen vom selben Tag (gleiche Lage, fairer Vergleich).

| # | Prüfpunkt | Ergebnis | Beleg |
|---|---|---|---|
| 1 | Zoom-Matrix Desktop 1440×900, z_ml 2/5/9: Strichcharakter, Dichte-Staffel, Breite | PASS — Partikelzahl 400 / 1 764 / 400 (Staffel ÷1,6 + Datenanteil-Faktor + Floor 400); gerichtete Strich-Segmente statt Punkte | `after/desktop-zml{2,5,9}.png`, Detail `after/desktop-zml5-detail.png`; Vorher: `before/desktop-zml{2,5,9}.png` |
| 2 | Zoom-Übergang: zoomend → Re-Count + Clear + globales Fade-in | PASS — layerAlpha gemessen 0 → 0,78 (416 ms) → 1,0 (820 ms) | Messreihe im Session-Log (Konsole) |
| 3 | Konsole (Karte, Globus, Mobile-Emulation) | PASS — 0 Errors/Warnings | list_console_messages je Kontext |
| 4 | Funktionserhalt einzeln: Wind aus/an, „Intensiv" (Dichte ×2,1 → 3 600 Partikel, Fade 0,965, Breite ×1,17), Dichte-Regler, Heatmap | PASS — alle Pfade über die unveränderte Layer-API | Messwerte im Session-Log |
| 5 | iPhone 12 Pro 390×844 DPR 3 (Emulation): Rendering, FPS-Cap 30, Governor, trailScale, _epr 1,5 | PASS — Segments aktiv, Governor-Leiter unangetastet. **Real-Device-Check erforderlich** (GPU-Vorbehalt s. Setup oben) | `after/iphone12pro-zml5.png` |
| 6 | Long Tasks während 5 s Animation + Zoom-Re-Init | PASS — 0 Tasks > 50 ms | PerformanceObserver-Ausgabe |
| 7 | Globus-Smoke (`#g=`): Fallback `points` unverändert, GFS-Globus rendert | PASS — 0 Konsole-Errors | `after/globe-smoke.png` |
| 8 | `npm run typecheck` | PASS (grün, mehrfach) | Terminal |
| 9 | Tempo-Formel: Zielgleichung px/s ↔ Equirect-Schritt gegen `map.project` verifiziert (Weltbreite 512·2^z_ml exakt bestätigt) | PASS — 45,51 px/°Lng bei z_ml 5 ≙ worldSize 16 384 | Konsolen-Messung |

**Selbstverifikations-Fragen (CLAUDE.md):**
1. *Funktionserhalt einzeln?* Ja — Zeile 4 + 7 (Toggle, Intensiv, Dichte, Heatmap, Globus-points).
2. *Desktop pixelgleich?* Bewusst NEIN für den Wind-Layer selbst (Optik-Redesign ist der Auftrag);
   alle anderen Layer/UI unberührt (Screenshots), Fallback `points` = alter Codepfad hinter Flag.
3. *Touch-Targets ≥ 44 px?* Keine UI-Änderung in WP1 (nur Rendering) — unverändert.
4. *Konsole sauber?* Ja — Zeile 3.
5. *Keine Long Tasks > 200 ms?* Ja — Zeile 6 (0 > 50 ms).

**Bekannte Einschränkungen:** (a) Schwachwind-Lage — die volle Streak-Optik bei Starkwind
(90–100 px/s) ist rechnerisch belegt, aber visuell erst bei der nächsten windigen Lage nachzuprüfen
(GWP1-Nachhol-Punkt, analog ZK-1…ZK-5-Muster). (b) WebGL-Emulation ≠ Real-Device — iPhone-Real-Check
steht aus. (c) Vorbestehende Ping-Pong-Anomalie der Zustandstexturen dokumentiert als **V-171**
(WP1 ist durch das Rückwärts-Advektions-Design dagegen immun).

---

## V-WINDPARTIKEL-SCHWEIF — Phase WS1 (2026-08-08, Gate GWS1)

Diagnose: `audit/windpartikel-schweif.md`. Auftrag Jan: „Die Windpartikel haben keinen großen
Schweif … zudem lassen sich keine Strömungen erkennen." Referenz: `referenze_windpartikel.PNG`.
Freigabe H2 (Shader) durch Jan am 2026-08-08 (STOPP-&-FRAGEN-Vorlage mit drei Hebeln).
Dev-Server :5199, Kartenausschnitt Nordseeküste 8,5° O / 53,5° N, Zoom 8, Layer nur `wind`.
Wetterlage der Sitzung: schwachwindig über Land (Median 2,24 m/s), 3–6 m/s über See.

**Ein-Anweisungs-Diff** in `src/wind/shaders.ts` (`screenFrag`): nur noch den Alpha-Kanal
abblenden statt aller vier. Kein Parameter, keine Zahl in `MapView.tsx` geändert.

| # | Prüfpunkt | Ergebnis | Beleg |
|---|---|---|---|
| 1 | Ursache belegt: sichtbare Abblendung war `fadeOpacity²` (0,972 wirkte wie 0,9448) | PASS — Herleitung am Code (§2) + Gegenprobe: 0,986 **ohne** Fix ≡ 0,972 **mit** Fix | `01…04`, `audit/windpartikel-schweif.md` §2 |
| 2 | Schweif bei unveränderten 0,972 | PASS — parallele Kometenstriche über See statt Punktfeld | `04-nach-h2-fade-0972.png` vs. `01-ist-fade-0972.png` |
| 3 | **Partikel-Physik unverändert** (Tempo/Richtung dürfen sich NICHT ändern) | PASS — `cssPxPerSec` 14,3 → 14,4 (~1 % Rauschen, gleiches Feld), `screenTempoGain` 6, `stalledPct` 0 | `windMotionDiag` vorher/nachher |
| 4 | Framebuffer-Vollständigkeit | PASS — `fb_background`/`fb_screen`/`fb_particleState` `COMPLETE` | `glDiag` |
| 5 | Funktionserhalt: Regler „Aus/Normal/Intensiv", Dichte, Höhe, Heatmap | PASS — unveränderte Layer-API; „Intensiv" (0,982) wirkt jetzt spürbar statt effektiv 0,964 | `07-intensiv-nach-h2.png` |
| 6 | Globus (`GlobeMap.tsx`, derselbe Shader, `fadeOpacity: 0.97`) | PASS — lange, saubere Strömungsfäden, kein Bruch | `05-globus-nach-h2.png` |
| 7 | DACH-Überblick z5,3 | PASS mit Einschränkung — bei 1–2,5 m/s nur 6–15 px Strich (gewollte Folge von „Länge = Windstärke") | `06-uebersicht-z53-nach-h2.png` |
| 8 | Mobil 390×844 | PASS — identisches Verhalten, keine Layout-/Layer-Regression | `08-mobil-390x844-nach-h2.png` |
| 9 | Konsole (Karte Desktop **und** mobil) | PASS — 0 Errors / 0 Warnings | `list_console_messages` je Kontext |
| 10 | `npm run typecheck` | PASS (grün) | Terminal |
| 11 | Befund B gegengeprüft: „verschiedene Richtungen im kleinsten Raum" = Daten oder Darstellung? | PASS — **Darstellung.** Zirkuläre Richtungsstreuung des Windfelds auf 0,3°-Kästen: 2,7° / 6,3° / 7,4° | `audit/windpartikel-schweif.md` §3 |

**Selbstverifikations-Fragen (CLAUDE.md):**
1. *Funktionserhalt einzeln?* Ja — Zeile 5 + 6 (Toggle, Normal/Intensiv, Dichte, Höhe, Heatmap, Globus).
2. *Desktop pixelgleich?* Bewusst NEIN für den Wind-Schweif — das *ist* der freigegebene Auftrag.
   Alles andere (Basemap, übrige Layer, Bedienelemente, Heatmap) unberührt: der Diff liegt
   ausschließlich im Fragment-Shader des Trail-Puffers.
3. *Touch-Targets ≥ 44 px?* Keine UI-Änderung (reines Rendering) — unverändert.
4. *Konsole sauber?* Ja — Zeile 9. Auf der **Globus**-Seite erscheint eine Chrome-Warnung
   („READ-usage buffer … fenced", 171×) aus dem GFS-Readback-Pfad; diese Änderung liest nichts
   zurück, ein Vorher-Vergleich auf der Globus-Seite wurde aber **nicht** gemessen (s. V-183).
5. *Keine Long Tasks > 200 ms?* Kein neuer Rechenweg — identische Pass-Zahl, identische Uniform-Zahl,
   eine Multiplikation weniger je Trail-Pixel. Kein Trace aufgenommen; die Aussage ist hergeleitet,
   nicht gemessen.

**Bekannte Einschränkungen:** (a) Schwachwind-Lage der Sitzung — die volle Strichoptik über Land
ist bei der nächsten windigen Lage nachzuprüfen (Nachhol-Punkt WS1-N1). (b) WebGL-Emulation ≠
Real-Device — iPhone-Real-Check steht aus. (c) Länge ∝ Windstärke bleibt bewusst erhalten
(Jans Entscheidung 2026-08-08); die gleichförmigen Striche der Referenz sind damit **nicht** das Ziel.

---

## V-WINDPARTIKEL-ZOOM — Phase WZ1 (2026-08-08, Gate GWZ1)

Diagnose: `audit/windpartikel-zoom.md`. Auftrag Jan: „Was noch nicht so gut funktioniert, ist das
Reinzoomen und Rauszoomen … dass die Schweife auch beim Reinzoomen zu erkennen sind und dass die
Windpartikel von der Anzahl nie zu viel oder zu wenig sind."
Dev-Server :5199, Nordseeküste 8,2° O / 54,0° N (3–6 m/s), Layer nur `wind`, Regler „Normal".
Reine TypeScript-Änderung in `src/wind/WindLayer.ts` — kein Shader, keine Pipeline-Berührung.

> **Messfallen dieser Sitzung, beide protokolliert:** (a) Chrome-DevTools-MCP drosselte rAF
> zwischenzeitlich auf 1–2 Hz — jede Messung unten hat die reale Rate direkt vorher geprüft
> (60,1–66 fps); ein neuer Tab stellte die volle Rate wieder her. (b) `prefers-reduced-motion` ist
> im Automations-Profil AN, MapLibre macht `easeTo` dann zum Sprung — Gestenmessungen laufen mit
> `essential: true`.

| # | Prüfpunkt | Ergebnis | Beleg |
|---|---|---|---|
| 1 | Partikelzahl über z2…z13 gemessen (vorher) | FAIL vorher — Zeltkurve mit Scheitel z6: 2 025 (z6) gegen 607 (ab z11), **Faktor 3,3** | `audit/windpartikel-zoom.md` §2 |
| 2 | Partikelzahl über z2…z13 (nachher) | PASS — mittlerer Abstand **17–21 px über den gesamten Bereich**; 1 296 ab z5, darunter proportional zur sichtbaren Datenfläche | §5-Tabelle |
| 3 | Kopf-zu-Schweif-Verhältnis (vorher) | FAIL vorher — Kopf 2,1 → 8,5 px bei zoom-unabhängigem Schweif ⇒ 9 : 1 → **2,2 : 1** | §3 |
| 4 | Kopf-zu-Schweif (nachher) | PASS — Kopf 2,1–3,8 px, Schweif 19–45 px ⇒ mindestens 5 : 1 auf jeder Stufe | §5 |
| 5 | Detailzoom optisch z13 / z10 / z6 | PASS — Striche statt Kleckse | `neu-z13/z10/z6.png` gegen `ist-*.png` |
| 6 | **Kein Partikel-Neustart beim Zoomen** | PASS — `reinitParticles` **0×** über eine 3-s-Fahrt z7→z12; gezeichnete Zahl konstant 1 296, kein Sprung | Instrumentierung §4 |
| 7 | Funktionserhalt: Aus/Normal/Intensiv, Dichte-Regler, Höhenwahl 10 m/850/700/500 | PASS — unveränderte Layer-API, alle Pfade durchgespielt | Interaktions-Skript |
| 8 | Globus unberührt | PASS — eigene `baseDensity`/`minParticles`, `globeMode` umgeht beide geänderten Zweige, Punktgröße bei z0–2 weiterhin auf 0,85 geklemmt | Codepfad |
| 9 | Mobil 390×844 | PASS — 900 Partikel, gleiche Optik über alle Zoomstufen | `neu-mobil-z11.png` |
| 10 | Konsole (frisches Laden + normales Rein-/Rauszoomen) | PASS — 0/0 | `list_console_messages` |
| 11 | `npm run typecheck` | PASS (grün) | Terminal |
| 12 | Alt-Verhalten als „Rule 2"-Fallback erhalten | PASS — `zoomThinBase` ausdrücklich gesetzt ⇒ alte Zeltkurve wieder aktiv; nicht gelöscht | `WindLayer.ts`, `legacyZoomThinning` |
| 13 | **Z-A: Trail-Verwurf während der Geste (vorher)** | gemessen **173 Löschungen in 189 Bildern** über eine 3-s-Zoomfahrt; während der Geste kein Schweif | §4 |
| 14 | Z-A nach ZA-1: Zoomfahrt 3 s | PASS — **0 Löschungen in 168 Bildern**, 151 nachgeführt | Instrumentierung §6 |
| 15 | Z-A nach ZA-1: Schwenk 2,5 s | PASS — **0 Löschungen in 108 Bildern**, 93 nachgeführt | Instrumentierung §6 |
| 16 | Z-A nach ZA-1: mobil 390×844, Zoomfahrt | PASS — **0 Löschungen in 138 Bildern**, 115 nachgeführt | Instrumentierung §6 |
| 17 | **Bild mitten in der Geste** | PASS — parallele Kometenstriche statt nacktem Punktfeld; A/B am selben Ort, Zoom 9,15 gegen 9,16, gleiche Windlage (das „vorher" durch Laufzeit-Abschaltung der Nachführung erzeugt) | `za1-vorher-waehrend-zoom.png` gegen `za1-waehrend-zoom.png`, mobil `za1-mobil-waehrend-zoom.png` |
| 18 | **Stehende Kamera unverändert** | PASS — 0 Löschungen, **0 Nachführungen** in 91 Bildern ⇒ Identitätspfad; Komposit-Pass benutzt immer die Identität | Instrumentierung §6 |
| 19 | **Fallback bei Drehung (bearing 35°)** | PASS — **91 Löschungen / 150 Bilder, 0 Nachführungen** ⇒ altes Verhalten, kein Geisterbild; zurück auf 0° greift die Nachführung wieder (0 / 87) | Instrumentierung §6 |
| 20 | Maßstabswerte plausibel | PASS — beim Zoomen isotrop und symmetrisch (z. B. 0,9819/0,9819 mit Versatz 0,0090/0,0090) | Stichprobe |
| 21 | Konsole bei **echter** Rad-Bedienung (8× rein, 5× raus, frischer Tab) | PASS — 0 Fehler / 0 Warnungen | `list_console_messages` |

**Selbstverifikations-Fragen (CLAUDE.md):**
1. *Funktionserhalt einzeln?* Ja — Zeile 7 + 8 + 12 (inkl. Rule-2-Fallback statt Löschung).
2. *Desktop pixelgleich?* Bewusst NEIN für Dichte und Punktgröße des Wind-Layers — das ist der
   Auftrag. Alles andere unberührt; der Diff liegt in zwei Methoden von `WindLayer`.
3. *Touch-Targets ≥ 44 px?* Keine UI-Änderung (reines Rendering) — unverändert.
4. *Konsole sauber?* Ja bei frischem Laden und normalem Zoomen (Zeile 10). In einem Tab nach
   Dutzenden Skript-`jumpTo`/`resize` plus rAF-Drosselung erschien 3× eine MapLibre-Warnung
   („Expected value to be of type number"); nicht reproduzierbar, nicht zugeordnet → **V-187**.
5. *Keine Long Tasks > 200 ms?* Kein Trace aufgenommen. Hergeleitet: die Zahl der gezeichneten
   Partikel sinkt gegenüber vorher auf jeder Zoomstufe außer z11+ (dort 1 296 statt 607), die
   Pass-Zahl ist unverändert, `reinitParticles` läuft beim Zoomen 0×. Gemessen ist das nicht.

**Bekannte Einschränkungen:** (a) Der Trail wird während einer Geste je Bild neu abgetastet
(LINEAR); eine daraus theoretisch summierte Weichzeichnung ist nicht sichtbar, wurde aber auch
**nicht gemessen**. (b) Schwachwind über Land bleibt kurz (WS1-Grenze, Jans Entscheidung „Länge =
Windstärke"). (c) Real-Device-Check steht weiterhin aus. (d) Kein Long-Task-Trace aufgenommen.

---

## V-WALDBRAND-EFFIS — Phase E0–E3: EFFIS/GWIS als Sekundär- und Kontextquelle (2026-08-15)

**Setup:** Chrome DevTools MCP · Desktop 1440×900 DPR 1 · Mobil 390×844 DPR 3 mit Touch
(`emulate`) · Dev :5205 · **Prod-Build** via `vite preview` :5206 für alle Performance-, Netz- und
Konsolen-Aussagen (V-217). Diagnose: `audit/waldbrand-effis.md`. Sonde
`scripts/l0/probe-waldbrand-effis.mjs` (Teile `wfs`, `wfs2`, `wms`, `ba`), Belege
`audit/l0/waldbrand-effis-*.json|.log`, `audit/l0/effis/*.png`.

### E0 — Sonden (kein Produktcode)

| # | Frage | Ergebnis |
|---|---|---|
| 1 | Satelliten-Parität | `viirs.hs.today` 2 736 = suomi 1 133 + n20 864 + n21 739 (jede enthalten); Typnamen `ms:viirs.hs.{suomi,n20,n21}.*`; `CLASS`-Suffix `_N/_1/_2` = Plattform, über alle Features geprüft |
| 2 | Fenster-Parität | „today" 08-14 00:33 → 08-15 03:00 (Vortag 00:00 UTC → jetzt); „week" 08-08 00:07 → 08-15 03:00, 7 352 Features (`hits`); FIRMS 5 + 2 = 7 577 Zeilen im selben Zeitraum |
| 3 | Match-Toleranz | Treffer koordinatengleich (p50/p90 = 0 m), minutengleich (Δt = 0 s); Quoten 24 h: N 99,2 % / N20 99,9 % / N21 99,3 %; 7 d: 99,3 / 99,1 / 97,8 %; 0 GWIS ohne FIRMS-Partner |
| 3b | Die Fehlstellen | 18 (24 h): FRP 0,5–11,7 MW, alle `nominal`, 12 aus **einem** SNPP-Überflug 12:02 Z, N21-Überflug 23:37 Z komplett fehlend ⇒ Granulat-Lücken, kein Kriterium |
| 3c | Stahlwerke in GWIS? | Duisburg 125/129 · Linz 73/74 · Salzgitter 118/119 · Dillingen 50/51 · Eisenhüttenstadt 19/20 · Bremen 60/62 ⇒ **GWIS ist ungefiltert** ⇒ Abzeichen verworfen (Kickoff-Abbruchregel, sinngemäß) |
| 3d | Erster Lauf mit `maxfeatures=5000` | `.week` auf 5 000 abgeschnitten, Quoten 62–81 % — **Sonden-Artefakt**, mit 20 000/ohne Deckel behoben (Lehre: den Deckel des Werkzeugs kennen, bevor man die Quelle beurteilt) |
| 4 | Index-Layer rendern | fwi/ranking/dc/isi/ffmc/anomaly/anomaly_sigm/dmc/bui + mf025.fwi + nasa_geos5.fwi: PNG 512² RGBA, 6 Farben, 89–91 % Landpixel; `anomaly_day` ohne TIME ⇒ Exception |
| 4b | Horizont | ecmwf.*: 08-13 … 08-23 (heute + 8, um 08 UTC) · mf025 + 2 · geos5 + 6 |
| 4c | Legenden | Grenzen je Code aus `GetLegendGraphic` (Audit §4.3), Farbfolge identisch ⇒ eigene Legende je Ansicht Pflicht |
| 4d | GetFeatureInfo | **kein** Layer `queryable`; 4 Formate × 7 Layer ⇒ ServiceException ⇒ E4 entfällt |
| 4e | Referenzperiode | EFFIS/GWIS-Seite: „historical series of approximately 40 years", keine Jahre; Vitolo et al. 2020 (ERA5, GWIS): 1980–2018 — so beschriftet, mit Unschärfe (Audit §4.5, Jan markiert) |
| 5 | Brandflächen live? | `/effis`: `modis.ba.poly` DACH **1 270** (2016-04-21 … 2026-08-13, LASTUPDATE 2026-08-14 14:38) · `.week` 26 · `.month` 74 · `.season` 293 · Jahreslayer; `/gwis` `nrt.ba.poly.*` global (arm); alle `ACAO: *`; Größen 0,10 / 1,44 / 4,83 MB **unkomprimiert** |
| 5b | „Eingefroren 2016/2022"? | **Nein — `maxfeatures=800` wirkt vor dem BBox-Filter** (800 kleinste ids europaweit ⇒ 46 bzw. 716 alte in DACH); `hits` = 1 270 (V-224) |
| 5c | Kartierschwelle | min `AREA_HA` je Jahr 52/34/22/21 (2016–19) → 2/0/1/0/0/0/0 (2020–26); Saison 2026 Median 5 ha, 231/293 < 30 ha |
| 6 | Reiche Attribute | `ndvi/cci_class/flag_lc/mask_flag/checked/frp/confidence/satellite`: auf keinem Live-Layer; `.query`-Varianten „terminated" |

### E1–E3 — Umsetzung (V-ALL)

| # | Schritt | Ergebnis | Beleg |
|---|---|---|---|
| 1 | 390×844 laden | Sheet mit Sub-Segmenten (Index-Ansichten 3 + 2 umbrechend, Fenster, Körbe), alle 44 px hoch; Begleit-Notiz oben; Wechsel-Knopf erst 15 px → auf 44 px korrigiert | `ui-mobile-sheet.png` |
| 2 | Konsole | **leer** — Dev + Prod, Desktop + Mobil, alle fünf Ansichten, beide Körbe, Popups | `list_console_messages` |
| 3 | Horizontal-Scroll | unverändert keiner | Screenshots |
| 4 | Touch-Targets | Sub-Segmente 104/158 × 44, Wechsel-Knopf 150 × 44 (mobil), Layer-Zeilen ≥ 44 | DOM-Messung |
| 5 | Safe-Area | unverändert | — |
| 6 | Jede Funktion einmal | Sub-Ansichten: Index → Einordnung → Trockenheit → Ausbreitung → Zündbereitschaft je mit `LAYERS=ecmwf.*` (Netz 26 + 26 Kacheln; `getSource().tiles` für dc/isi/ffmc), Begleit-Notiz „Einordnung ansehen"/„Index ansehen", Steckbrief mit beiden Legenden (fwi/ranking) bzw. eigener (dc/isi/ffmc), `dc`-Karte ohne „Bodenfeuchte" außer als Name des blockierten Layers · Körbe: Saison (293) + Archiv (977, 4,8 MB, „KEINE aktuelle Lage") · Flächen-Popup Saison (Oberharz 3 ha, 100 % Nadelwald, 100 % Natura 2000, Stand 14.08.) und Archiv (Montemezzo IT 2023, „frühere Saison") · Detektions-Popup **mit** Bestätigung („… kartiert (bestätigt): 3 ha, 100 % Nadelwald · Branddatum 13.08.2026 · Stand 14.08.2026") · Detektions-Popup **ohne** (Duisburg, grau): keine Bestätigungszeile, kein Negativ-Etikett · Statuszeile „538 Detektionen liegen in … (bestätigt)" · Permalink `v`/`bb` | `ui-desktop-overview.png`, `-ranking.png`, `-dc.png`, `-isi.png`, `-ffmc.png`, `-oberharz.png`, `-burnt-popup.png`, `-archive-popup.png`, `-hotspot-mapped-popup.png` |
| 7 | **Netz (Prod-Build)** | Hotspots 7 d + Saison: `/_firms/*` **6** · `ms:modis.ba.poly.week` **1** · `.season` **1** · GetMap `ecmwf.fwi` 16 — **kein** GWIS-Hotspot-Abruf (E1-Vergleich nicht verdrahtet). Dev zeigt das Doppelte (StrictMode-Doppeleffekt, abgebrochene Erstabrufe) | `performance.getEntriesByType('resource')` |
| 8 | **Long Tasks (Prod-Build)** | ⚠️ **Fund:** mit Archiv 200–400 ms **jede Sekunde** im Leerlauf — `applyState` (läuft auf `idle`) rief `setData` je Quelle bei jedem Durchlauf, `setData` löst `idle` aus ⇒ Schleife. Nach der Referenz-Sperre je Quellinstanz: Grundlinie (2 Standard-Layer) **0** > 200 ms, max 143 ms (vorher 3 / 352 ms) · Hotspots 7 d **0**, max 162 ms (vorher 1–2 / 246–374 ms) · Hotspots + Saison + Archiv: 2 beim Laden (207 / 222 ms), **0** in 8 s Leerlauf (vorher 8) — **V-220 damit gelöst** | PerformanceObserver (`initScript`, echter Reload — Hash-Navigation reicht nicht, s. Fallstricke) |
| 9 | Fünf Fragen | (1) Funktionserhalt einzeln: alle Toggles/Presets/Fenster, `fireDanger` startet mit `ecmwf.fwi`, F1/F2-Verifier grün ✓ · (2) Desktop pixelgleich: Wetterkarte nicht berührt (keine Datei außerhalb `src/fire`/Verifier/Sonde/Lizenzen/Doku editiert; `fireDeck.css` wird von ihr nicht geladen) ✓ · (3) Touch ≥ 44 px ✓ (nach Korrektur) · (4) Konsole sauber ✓ · (5) Long Tasks: s. 8 ✓ | ebd. |
| 10 | Kreuzprobe Bestätigung | offline (Node, echte Daten 7 577 Zeilen, 26 Wochenflächen): 545 in 20 Flächen (Piedimulera 162, Cravagliana 109, Amaro 101, Calasca 76, Varallo 25, Tignale 15, **Oberharz 14**, Como 13, …, **Sundern 10**, **Rodenbach 5**, **Neustadt a. d. Waldnaab 3**); UI 538 (Dedup + Fensterschnitt) · graue davon **24 (Varallo)** ⇒ Kartierung hebt Grau auf: 2 395 → 2 371 im UI | Skript-Ausgabe im Session-Log |
| 11 | Verifier | `fire-corroboration` 81/81 · `fire-danger-views` 43/43 · `fire-sources` 134/134 · `fire-model` 72/72 · `fire-time` 67/67 · `fire-firms` 86/86 · `fire-events` 41/41 = **524/524** · `typecheck` grün · Bundle: 0 × Schlüssel, `firms.modaps` nur in der Attributions-URL | npm-Ausgabe |

**Fallstricke dieser Verifikation:** (a) `navigate_page` mit nur geändertem Hash erzeugt **kein
neues Dokument** — der alte Bundle-Stand und der alte `PerformanceObserver` laufen weiter; für
Prod-Messungen nach einem Rebuild `type: 'reload'` + `ignoreCache` benutzen. (b) `resize_page`
verändert offenbar auch andere Tabs/das Fenster (ein Screenshot kam mit 2000 × 705 zurück) — vor
jedem Screenshot Größe setzen. (c) Die Sonde selbst kann täuschen: `maxfeatures=5000` schnitt
`.week` ab und hätte eine 20–40-%-Lücke „gemessen" (E0 3d).

**Nicht geprüft (ehrlich ausgewiesen):** Ausfall des Wochenlayers (Bestätigung fehlt dann still,
Layer meldet keinen Fehler — abgeleitet, nicht ausgelöst); Verhalten bei einem `.season`-Korb
> 6 000 Flächen (Notbremse `truncated`, nur im Verifier gegen synthetische Daten). **Geprüft:**
Basiskarten-Wechsel (Straße → Gelände) mit Hotspots + Saison + Archiv geladen — alle Layer wieder
da, keine erneuten WFS-/FIRMS-Abrufe (9 = 9), die WeakMap-Sperre greift je neuer Quellinstanz
(`ui-desktop-terrain-after-switch.png`).

## V-WALDBRAND-FIRMS — Phase F0/F1/F2: `fireHotspots` auf NASA FIRMS (2026-08-14)

**Setup:** Chrome DevTools MCP · Desktop 1440×900 DPR 1 · Mobil 390×844 DPR 3 mit Touch
(CDP-Geräteemulation — `resize_page` allein reicht nicht, Chrome hält eine Mindest-Fensterbreite
von ~500 px) · Dev-Server :5203 · **Prod-Build** via `vite preview` :5204 für alle
Performance- und Konsolen-Aussagen (V-217). Diagnose: `audit/waldbrand-firms.md`.
Schlüssel aus `.env.local`, in **jeder** Ausgabe redigiert.

### F0 — Schlüssel und Sonde (kein Produktcode)

| # | Prüfung | Ergebnis |
|---|---|---|
| 1 | `.env.local` gitignoriert | `git check-ignore -v` ⇒ `.gitignore:4 (*.local)`; `git status` sieht die Datei nicht |
| 2 | Schlüsselform | 32 Zeichen `[0-9a-z]` ✓ (Datei hat UTF-8-**BOM** und CRLF — vom Loader und von Vites `loadEnv` abgefangen, gemessen) |
| 3 | Schutzregeln netzfrei | **26/26** — `world`, Europa-BBox, vertauschte lat,lon-Box, MODIS/`_SP`/LANDSAT, `days` 0/6/2,5, Traversal, 5. Segment, Query-String, Schlüsselform |
| 4 | Spaltensatz der NRT-Antwort | **14 Spalten**, `instrument` neu, **`type` fehlt** ⇒ STOPP-Fall, Jans Entscheidung eingeholt |
| 5 | BBox-Reihenfolge | vertauschte Box ⇒ `HTTP 200` mit **0 Zeilen** — stille Leerantwort, kein Fehler |
| 6 | Tagesspanne | `days=5` ⇒ 200 · `days=6/7/10` ⇒ `400 Invalid day range. Expects [1..5].` |
| 7 | Größe/Zeit je Quelle (DACH, 1 Tag) | SNPP 67.288 B / 966 ms · NOAA-20 33.434 B / 441 ms · NOAA-21 26.201 B / 273 ms |
| 8 | Transaktionspreis | Zähler 0 → 22 → 52; beide Deltas gehen ohne Rest auf ⇒ **`2 × DAY_RANGE`** je Erfolg, abgelehnte kostenlos |
| 9 | CORS | Area-API-**Erfolg** sendet `ACAO: *`; Fehlerantwort und statische Regions-CSV **nicht** (⇒ V-218). Frühere Verallgemeinerung korrigiert |
| 10 | Route ohne Schlüssel | jede `/_firms/*`-Anfrage ⇒ `503 · no-store`, **ohne Upstream-Anfrage**; `/_dwd_grib/…` unverändert 200 |

### F1/F2 — Darstellung, Ereignisse, Ehrlichkeit

| # | Schritt (V-ALL) | Ergebnis | Beleg |
|---|---|---|---|
| 1 | 390×844 laden | vollständig gerendert, Bottom-Sheet + Rail intakt, Punkte mit FRP-Größenstaffel sichtbar | MCP-Screenshot Mobil |
| 2 | Konsole (Errors/Warnings) | **leer** — Dev UND Prod, 24-h- UND 7-Tage-Fenster, Normal- UND Notbetrieb | `list_console_messages` |
| 3 | Horizontal-Scroll | unverändert kein Seiten-Scroll (Layout nicht angefasst) | Screenshots |
| 4 | Touch-Targets | keine neuen Bedienelemente; Popup ist Anzeige, Schließknopf = MapLibre-Standard | — |
| 5 | Safe-Area | unverändert (kein Eingriff ins Layout) | — |
| 6 | Jede Funktion einmal | 24 h ⇒ 1.503 Detektionen, 3 Abrufe `days=2` ✓ · 7 Tage ⇒ 6.068, 6 Abrufe `days=5`+`days=3/2026-08-07` ✓ · Popup mit allen 8 Messwerten ✓ · Sonnenreflexions-Hinweis nur bei `low` ✓ · Mehrfachbelegung („2 Detektionen an dieser Stelle") ✓ · Footprints ab Zoom 7 ✓ · Ausgrauung 2.380 ortsfest ✓ · Notbetrieb ✓ | Screenshots Desktop/Mobil/Zoom-11/Notbetrieb |
| 7 | **Long Tasks (Prod-Build)** | ⚠️ Grundlinie **ohne Layer** 3 Tasks > 200 ms (max 352 ms) — **vorbestehend, V-220**. 24 h: 1 Task (248 ms). 7 Tage erste Fassung: 12 Tasks (595 ms) → nach Aufteilung 1–2 Tasks (374 / 246 ms). Aufschlüsselung an echten Daten: Dedup 29 · Ereignisse 170 · Zuordnung 31 · GeoJSON 46 · Serialisierung 78 ms | PerformanceObserver, Bench im Session-Log |
| 8 | Desktop gegen Baseline | Wetterkarte unberührt: `fireDeck.css` wird von ihr nicht geladen, alle neuen Klassen `fire-`-präfixiert, `.maplibregl-popup-content` **nicht** angefasst | Diff der geänderten Dateien |
| 9 | Schlüssel im Bundle | `dist/` 304 Dateien byteweise ⇒ **0 Treffer**; Variablenname ebenfalls nicht vorhanden; Negativkontrolle „buscosun" in 196 Dateien | Grep-Ausgabe im Session-Log |
| 10 | Schlüssel in Antworten | Body **und** Header-Satz dreier Live-Antworten (Erfolg / Hüllen-Ablehnung / Whitelist-Ablehnung) ⇒ kein Treffer | MCP-Skript |
| 11 | Notbetrieb (Proxy blockiert) | Statuszeile „Notbetrieb: NASA FIRMS nicht erreichbar, Anzeige ohne Intensität" · Attribution NASA → GWIS · 0 Footprints · **eigene Steckbrief-Fassung ohne FRP-Skala** (beim Prüfen gefunden und behoben) | Screenshot + DOM-Auslesung |
| 12 | Ausgrauung kreuzgeprüft | Clustering **39,2 %** (2.380/6.068) gegen F0-Rasteranalyse **39,3 %** — zwei unabhängige Verfahren, 0,1 pp Abstand; angeklickter grauer Punkt 51,49/6,70 = ThyssenKrupp Duisburg | Statuszeile + Popup-Auslesung |
| 13 | Verifier | `fire-firms` 86/86 · `fire-events` 41/41 · `fire-sources` 120/120 · `fire-model` 66/66 · `fire-time` 67/67 = **380/380** · `typecheck` grün | npm-Ausgabe |

**Nicht geprüft (ehrlich ausgewiesen):** Das Verhalten bei erschöpftem Transaktionslimit ließ sich
nicht auslösen — der Proxy behandelt es wie jeden Upstream-Fehler (502, kein Durable-Cache,
Rückfall auf GWIS), das ist abgeleitet, nicht gemessen. Ebenso ungeprüft: eine echte konvektive
Großbrandlage in DACH; der Gegentest „wachsender Brand wird nicht ausgegraut" läuft gegen
konstruierte Daten.

## V-WALDBRAND-UI — Phase WBU1: Waldbrand-Deck in Wetterkarten-Optik (2026-08-14)

**Setup:** Chrome DevTools MCP · Desktop 1440×900 DPR 1 · Tablet-Stichprobe 1024×768 · Mobil
390×844 DPR 3 mit Touch · Dev-Server :5199 (Vergleiche/Netz) und **Prod-Build** via
`vite preview` :5299 (Performance/Konsole). Diagnose: `audit/waldbrand-ui.md` · Belege:
`audit/waldbrand-ui/`.

| # | Schritt (V-ALL) | Ergebnis | Beleg |
|---|---|---|---|
| 1 | 390×844 laden | vollständig gerendert, Ink-Rail oben, Karte vollflächig, Sheet + Zeit-Deck | `after-fire-mobile-390.png` |
| 2 | Konsole (Errors/Warnings) | leer — Dev UND Prod, Desktop UND Mobil | MCP `list_console_messages` |
| 3 | Horizontal-Scroll | kein Seiten-Scroll (Root `overflow:hidden`, Spalten scrollen intern) | Screenshot ohne H-Scrollbar |
| 4 | Touch-Targets gemessen | Rail 44×44 · Preset h44 · Basemap h44 · Sheet-Zeile h75 · „i" 44×44 · Play 46×46 · Slider h44 (nach Fix; Messreihe davor h36) | Messausgabe im Session-Log |
| 5 | Safe-Area | `env(safe-area-inset-bottom)` an Rail-Padding, Sheet-Body, Zeit-Deck-Anker, Attribution-Anker | CSS + Screenshots |
| 6 | Jede Funktion einmal | Presets ✓ · alle 8 schaltbaren Toggles ✓ · 2 blockierte sichtbar+disabled ✓ · Rückblick-Segment erscheint bei aktiven Hotspots ✓ · Lag-Hinweis global + je Zeile ✓ (`2 Layer folgen dem Regler nicht …`) · Datenalter-Stempel in der Zeile + Zähl-Notiz darunter ✓ (`1500 Detektionen (Anzeige begrenzt)`, `143 Gebiete`) · Steckbrief-Karten rechts in Dock-Reihenfolge ✓ · Hover-Vorschau (dashed + Chip) ✓ · mobiler „i"-Steckbrief ✓ · Playback-Knopf ✓ · „heute"-Rücksetzer ✓ · Permalink läuft mit (`#wb={"b":23,"d":2,…}`) ✓ | `after-fire-desktop-funktionen.png`, `after-fire-desktop-preview.png`, `after-fire-mobile-steckbrief.png` |
| 7 | Long Tasks beim Scrubben | **Prod-Build: 0 Long Tasks**, React-Dispatch 3–12 ms je Tagesschritt (18 Schritte). Dev-Build unter Emulation zeigte 100–580-ms-Tasks — Dev-React + DevTools-Protokoll-Overhead, auch OHNE WMS-Layer vorhanden, daher nicht der Darstellung zuzurechnen; maßgeblich ist die Prod-Messung. | PerformanceObserver-Ausgaben im Session-Log |
| 8 | Desktop 1440×900 gegen Baseline | Waldbrand: Ziel-Optik erreicht (Soll = Wetterkarte, kein Pixel-Soll). **Wetterkarte selbst: pixelgleich** — Canvas-Diff Rail/Dock/Readout/Topbar-ohne-Uhr = 0 Diff-Pixel, maxChannelDelta 0 (animierte Kartenbühne + Uhr prinzipbedingt ausgenommen) | `map-pixel-parity.json`, `ref-map-desktop-1440.png` vs `after-map-desktop-1440.png` |
| 9 | Landscape-Stichprobe | über Tablet 1024×768 abgedeckt (Dock 206 / Readout 300, Zeit-Deck 16-px-Ränder) | `after-fire-tablet-1024.png` |

**Null-Request-Beweis:** Datenpfad-Request-Sets vor/nach der Phase (dedupliziert; WMS-`TIME`,
BBOX, Kachel-/Glyph-Koordinaten normalisiert, Vite-Module/Fonts ausgenommen): **73 = 73,
beide Differenzmengen leer** → `zero-request-proof.json`. Headless: `verify:fire-model` 66/66
(inkl. „kein src/fire-Import aus MapView.tsx" — greift auch für die neuen Dateien),
`verify:fire-time` 67/67, `verify:fire-sources` 118/118 · `typecheck` grün · `budget` grün — eagerCss 8,5 KB und eagerJs 123,7 KB unverändert (alles Neue
liegt im Lazy-Chunk); totalJs-Ratsche wegen +~2 KB gzip bewusst 850 → 855 KB angehoben
(budget.json; erste Messung lief versehentlich gegen ein veraltetes dist/ und war deshalb
fälschlich grün — am frischen Build nachgemessen und korrigiert).

**Die fünf Selbstverifikations-Fragen (CLAUDE.md):**
1. **Funktionserhalt einzeln?** Ja — Funktionsliste aus der Diagnose komplett ausgelöst (Schritt 6);
   der ausführliche Fehlertext mit amtlichem Link und alle Ehrlichkeitsinhalte („kein amtliches
   Warnprodukt" je Profil, AT-Lücke permanent sichtbar, Datenalter je Layer, „lädt …"-Pending,
   Interpolations-/Treiber-Notiz) stehen wortgleich im neuen Markup.
2. **Desktop pixelgleich?** Für die Wetterkarte ja (0 Diff-Pixel, s. o.); für das Waldbrand-Deck ist
   die Änderung der Auftrag. Diese Phase änderte ausschließlich `src/fire/*`, Doku/Audit und `budget.json` — maßgeblicher Beweis ist der Pixel-Diff, da der Arbeitsbaum schon vorher aus früheren uncommitteten Phasen dirty war.
3. **Touch-Targets ≥ 44 px?** Ja, gemessen (Schritt 4); Slider-Grifffläche auf 44 px nachgezogen.
4. **Konsole sauber?** Ja, Dev und Prod, beide Viewports (Schritt 2).
5. **Keine Long Tasks > 200 ms?** Im Prod-Build ja (0 beim Scrubben); die Dev-Messung ist als
   Overhead-Artefakt dokumentiert statt verschwiegen (Schritt 7).

**Bekannte Einschränkungen:** (a) Fehler-Zustand (`is-error`-Block) war mangels Quellen-Ausfall
nicht live auslösbar — Markup/Logik unverändert übernommen, Sichtprüfung steht bei nächstem
echten Ausfall aus. (b) Real-Device-Check (GPU-unkritisch, reine DOM-UI) nicht durchgeführt.
(c) Mobile Long-Task-Messung nur Desktop-Prod; mobile Emulation misst CPU nicht repräsentativ.

## V-WIND-RAUSZOOM — Phase Z3: Partikeldichte beim Rauszoomen (2026-08-15, Gate GZ3)

Diagnose: `audit/windpartikel-rauszoom.md`. Auftrag Jan (2026-08-15): beim Rauszoomen bleibt die
Dichte im zuvor vergrößerten Bereich zu lange zu hoch — schneller UND nahtlos, mobil flüssig,
bestehende Schutzmechanismen prüfen. Dev-Server :5199, München, Layer nur `wind`, „Normal".
Änderung: `updateFrag` (additiv, Uniform `u_redistribute`, Alt-Pfad bei 0 rechnerisch identisch)
+ `WindLayerOptions.zoomRedistribute` (default true) + Auffrisch-Puls nur noch als Fallback.

| # | Prüfpunkt | Ergebnis | Beleg |
|---|---|---|---|
| 1 | Überdichte im alten Ausschnitt nach Rauszoom z7,5→z5,3 (Soll 1,0) | ALT **11,8× (+0,25 s) … 7,8× (+3,5 s)**; NEU **0,93× … 1,11×** — nach dem ersten Bild gleichverteilt | audit §3 Tabelle |
| 2 | Mobil-Pfad (Partikel-Pässe während Geste ausgesetzt, ein Update auf `moveend`) | ALT 11,7×→8,5×; NEU **0,99×** im ersten Bild | audit §3 |
| 3 | Schwenken: neu sichtbarer Streifen gefüllt | NEU links `284/239` (ALT `80/63`), oben `264/252`, unten `218/217` je 10-%-Klasse (Soll ≈250); Ostseite physikalisch dünner (auch stehend) | audit §3 |
| 4 | Reinzoomen unverändert gleichverteilt | linke Hälfte 47,9 % ALT / 50,7 % NEU | audit §3 |
| 5 | Bildrate Zoomfahrt | 29 fps ALT / 30 fps NEU (MCP-Umgebung, identisch) | audit §3 |
| 6 | Sichtbarer Übergang | keiner: kein Neustart, kein Puls (Schweife bleiben), Neupartikel nur im neuen Ring | Screenshots `audit/screenshots/wind/rauszoom-*.jpg` |
| 7 | Schutzmechanismen | dt-Normierung/Sub-Steps, RGBA8-Kodierung, FrameGovernor, P3-Pause, ZA-1, `maxParticleFps`, `zoomDropBoost` unangetastet; Puls als Fallback bei `zoomRedistribute:false` | `git diff src/wind/` |
| 8 | Konsole frisches Laden + Zoomen | 0/0 | `read_console_messages` |
| 9 | Verifier | `verify:wind-advection` 50/50; `typecheck` ohne neue Fehler (14 vorbestehende in `src/fire/*`) | Terminal |
| 10 | Real-Device | **offen** (Emulation für WebGL nicht repräsentativ) | — |

## V-WALDBRAND-BEHOERDEN — Behördendaten DACH (2026-08-15, Gate GWBA1)

Diagnose: `audit/waldbrand-behoerden.md`. Sonde `scripts/l0/probe-behoerden.mjs`, Belege
`audit/l0/waldbrand-behoerden-{axis,nina,rest}.json`. Verifier `npm run verify:fire-behoerden` (76/76).

| # | Prüfpunkt | Ergebnis | Beleg |
|---|---|---|---|
| 1 | Koordinaten-Anker: vertauschte BBox macht den Verifier rot | PASS — `bboxIsLatLon` auf 5 URLs; `assertDachAxis` verwirft `[lat,lon]` (Fixture = echte /gwis-Antwort bei vertauschter BBox); je Endpunkt gemessen (`/gwis` spiegelt mit Restmenge, `/effis` liefert 0) | audit §1, wfsAxis.ts |
| 2 | `maxfeatures`-Anker (V-224) | PASS — GWIS-Fallback 1 500 → 12 000 (live 7 835 statt 1 500), Brandflächen 6 000, Sonde ohne `maxfeatures=` | verify:fire-behoerden |
| 3 | `verify:fire-mowas` | **NICHT GEBAUT** — A1 wartet auf Jans Lizenzentscheidung (STOPP & FRAGEN); Vertrag `OfficialWarning` + Flag `MOWAS_ENABLED=false` vorbereitet | audit §3/§8 |
| 4 | Signal-Rangfolge (Varallo) | PASS — statisch + kartiert ⇒ bestätigt, nicht grau; statisch ohne Bestätigung ⇒ grau + unbestätigt | fireAssessment.ts Selbsttest |
| 5 | GeoSphere: Koordinaten in AT, Rate-Limit dokumentiert | PASS — Geometrien EPSG:31287 (x 112 553…685 409), Bereich = Österreich; keine RL-Header; nur `getWarningsForCoords` (kein Umprojizieren), Deckel 20/Sitzung | audit §4 |
| 6 | EMS: erzwungener Parse-Fehler ⇒ kein Abzeichen, kein sichtbarer Fehler | PASS — `parseEmsResponse('{not json')`/`'<html>502'`/fremdes Schema ⇒ `[]`; live EMSR920 ⇒ „bestätigt" | Screenshot bestaetigt-ems |
| 7 | statische Maske: null Netzanfragen | **NICHT GEBAUT** (Jans Entscheidung zum Umfang, audit §8) | — |
| 8 | bestehende `verify:fire-*` grün | PASS — sources 149, corroboration 82, events 41, firms 86, model 72, time 67, danger-views 43, behoerden 76 = **616/616** (Ausgang 524) | Terminal |
| 9 | `typecheck` | PASS 0 Fehler | Terminal |
| 10 | `npm run budget` | **FAIL — totalJs 867,6 KB > 865 KB**; Anteil dieser Phase ≈ 4,2 KB gzip gemessen (esbuild-Bündel der neuen Module) ⇒ nicht vorbestehend, keine Anhebung ohne Jan | audit §8 |
| 11 | Screenshots: bestätigt / plausibel / unbestätigt, AT-Deep-Link, degradiert ohne MoWaS | bestätigt (EMS Hürtgenwald), unbestätigt+AT-Kontext+statisch (Linz), AT-Deep-Links; plausibel im Text belegt („PLAUSIBEL — 11 Überflüge"); „ohne MoWaS" = aktueller Zustand | `audit/screenshots/waldbrand-behoerden-*.jpg` |
| 12 | Konsole | 0/0 (nur HMR-Debug) | read_console_messages |
| 13 | Selbstverifikation (5 Fragen) | 1 Funktionserhalt: alle Fire-Layer/Popups/Buckets unverändert, Kartierungszeile bleibt · 2 Desktop Wetterkarte unberührt (`MapView.tsx` unangetastet) · 3 Touch-Targets: keine neuen Bedienelemente außer Links in Statuszeile · 4 Konsole 0/0 · 5 Long Tasks: nur klick-zeitige Bewertung (µs), Fetches asynchron; Seite reißt 200 ms vorbestehend (V-220) | — |

## V-WALDBRAND-WIND — Phase WW1: Windlayer der Wetterkarte im Brandradar (2026-08-15, Gate GWW1)

Diagnose: `audit/waldbrand-wind.md`. Umgebung: Dev-Build, Chrome, Desktop 1920×897,
`http://localhost:5201/#wb=…`. Gemessen an der laufenden Seite über die DEV-Handles
`window.__fireMap` und `window.__fireWindLayer`.

### WW-1 — Der Layer hängt wirklich in der Karte (nicht nur in der Liste)

Der Fehler, gegen den das prüft, ist der aus WB2 dokumentierte: Ein Platzhalter mit derselben Id
in `installLayers` fängt die Existenzprüfung ab, der echte Custom-Layer kommt nie in die Karte,
und die Daten liegen für immer in `_pending` — sichtbar ist dann **nichts**, gemeldet wird **nichts**.

```
getLayer('fire-wind-particles') → true      showParticles      → true
visibility                      → 'visible' windTexture gesetzt → true
windTextureKind                 → 'byte'    upsampleFactor     → 2
```

Reihenfolge in der Karte (`getStyle().layers`, Custom-Layer erscheinen dort erwartungsgemäß nicht):
… `fire-national-points` → **`fire-wind-attrib`** → `fire-hotspots-foot-*` → `fire-hotspots-points`
→ `fire-dach-mask-fill`. Der Custom-Layer wurde mit `beforeId = 'fire-hotspots-foot-fill'`
eingehängt, liegt also zwischen den beiden — **über** den Flächen, **unter** den Punkten und
**unter** der Maske. Genau das war die Vorgabe aus der Diagnose §3.

### WW-2 — Ein-/Ausschalten: der Loop endet wirklich

| Zustand | Repaints in 2 s | `showParticles` | `visibility` | Lizenzleiste |
|---|---|---|---|---|
| Wind **an** | 60 | `true` | `visible` | „Wind: DWD ICON-D2 · CC BY 4.0" enthalten |
| Wind **aus** (Klick auf die Zeile) | 60 | `false` | `none` | Wind-Zeile **weg** |
| **Gegenprobe:** Windlayer nie gebaut (nur EU-Index) | 60 | — | — | — |

Die dritte Zeile ist der Punkt: Die Karte repaintet auch **ohne** jeden animierten Layer mit
~30 fps. Der Windlayer fügt im ausgeschalteten Zustand **null** hinzu. Die vorbestehende Schleife
ist getrennt aufgenommen als **V-233** (Teilspur gefunden: 43 `moveLayer`-Aufrufe in 2 s aus
`applyState` auf `idle` — dasselbe Muster wie V-220; eine zweite Quelle ist noch offen).

### WW-3 — Funktionserhalt: der Tagesregler bleibt der alte

Der Regressionspfad, den die Diagnose §2 ausschließt: Wäre `fireWind` ein `forecast`-Layer mit
`maxDay: 0`, zöge `sharedMaxDay()` den gemeinsamen Regler auf 0 und `hasForecastSlider()` würde
`false` — **das Zuschalten des Windes ließe den 9-Tage-Regler des EU-Index verschwinden.**

- EU-Index + Wind aktiv ⇒ Regler zeigt weiterhin `+9 Tage` (im Bild), Verifier-Anker
  `sharedMaxDay(['fireDanger','fireWind']) === 9`.
- Wind allein ⇒ „Die aktiven Layer zeigen genau einen Zeitpunkt — kein Tagesregler." (korrekt:
  ICON-D2 reicht +12 h, der kleinste Reglerschritt ist ein Tag).

### WW-4 — Ehrlichkeit ab Tag 1

Auf Tag +2 („übermorgen") trägt die Wind-Zeile im Dock die hervorgehobene Zeile
**„gilt für heute — folgt dem Tagesregler nicht"**. Kein neuer Text und kein neuer Mechanismus:
`followsSlider('fireWind', ≥1) === false` speist die bestehende `laggingLayers`-Anzeige, dieselbe,
die die Feuerverbote und die Hotspots benutzen.

Gegenprobe im Code: der Frame-Effekt in `FireMap.tsx` hat `day` **nicht** in den Abhängigkeiten und
ruft `windFrameAtValidTimeAsync(wind, Date.now(), …)` — es gibt keinen Pfad, auf dem ein geklemmter
+12-h-Frame als „übermorgen" gezeigt würde.

### WW-5 — Lizenz hängt an der Sichtbarkeit

Ein `CustomLayerInterface` hat keine MapLibre-Source, und die Attributionsleiste sammelt
ausschließlich `source.attribution` **benutzter** Quellen ein — die DWD-Zeile wäre also lautlos
weggefallen. Träger ist deshalb `fire-wind-attr`: eine dauerhaft leere GeoJSON-Quelle mit einem
Layer (`fire-wind-attrib`, `circle-radius: 0`), der nichts zeichnet und dessen Sichtbarkeit über
dieselbe Schleife läuft wie die der Partikel. Gemessen: an ⇒ Zeile da, aus ⇒ Zeile weg
(s. Tabelle WW-2).

### WW-6 — Basiskartenwechsel (die Falle, die man erst nach dem Klick sieht)

`setStyle` verwirft alle Custom-Layer und ruft `onRemove` — dabei werden die GL-Ressourcen inklusive
der Windtextur gelöscht. `applyState` hängt die Instanz zwar wieder ein, aber der zuletzt gesetzte
Frame ist weg; ohne erneutes Setzen bliebe die Fläche nach dem Wechsel partikellos. Deshalb der
Zähler `windEpoch`, der den Frame-Effekt beim Wiedereinhängen erneut auslöst.

Nach Klick auf „Satellit":

```
getLayer('fire-wind-particles') → true   visibility → 'visible'
showParticles                   → true   windTexture gesetzt → true
Attributionsleiste → "Esri World Imagery | Wind: DWD ICON-D2 · CC BY 4.0 | © European Union, Copernicu…"
```

### WW-7 — Harness und Konsole

`npm run typecheck` grün · `verify:fire-model` **76/76** (darunter die neuen Anker „fireWind steht an
Bit 10", „Bit 5..9 sind unverändert die Ausbau-Layer", „Windpartikel liegen über den Flächen, aber
unter den Hotspots") · `verify:fire-time` **70/70** (darunter „Wind (instant) klemmt den Regler NICHT
auf 0", „Wind folgt nur auf Tag 0 und sagt das ab Tag 1") · `verify:fire-sources` 149/149 ·
`verify:fire-corroboration` 82/82 · `verify:fire-events` 41/41.

Konsole über einen vollständigen Seitenaufbau: 6 Meldungen, alle vom Werkzeug
(`[vite] connecting/connected`, React-DevTools-Hinweis) — **keine Warnung, kein Fehler**.

### Offen

**Mobil 390×844 nicht verifiziert.** Chrome nahm die Fenstergröße in dieser Session nicht an
(`innerWidth` blieb 1920 nach zwei Versuchen), und die DevTools-MCP-Instanz war von einem anderen
Prozess belegt. Nicht als „geprüft" gebucht. Risikoeinschätzung: gering — die Zeile entsteht aus
derselben `layerRow(...)`-Funktion wie die zehn bestehenden Layer und bringt **keine einzige Zeile
neues CSS** mit; nachzuholen, bevor Temperatur und Niederschlag folgen.

### Nachtrag 2026-08-15 (Jans Entscheidungen) — V-WALDBRAND-BEHOERDEN

| # | Prüfpunkt | Ergebnis | Beleg |
|---|---|---|---|
| 14 | MoWaS: keine Route, kein Fetch, Deep-Link `warnung.bund.de/meldungen`, Flag bleibt `false` | PASS (Verifier f2) | verify:fire-behoerden |
| 15 | GWIS-Deckel: vor/nach BBox gemessen | **nach** BBox, aber älteste zuerst (1 500 ⇒ bis 14.08. 12:04); URL jetzt ohne `maxfeatures`, Client-Deckel jüngste zuerst | audit §9 |
| 16 | V-222: 24 h rendert zuerst, 7 Tage danach, Worker, neutral bis dahin | PASS — Sequenz „1 573 Detektionen · Einordnung läuft …" → „… davon 395 ortsfest (grau) · Einordnung aus 7 Tagen Vorgeschichte"; 7-Tage-Requests nach dem ersten Paint; kein „(kein Worker)"-Zusatz ⇒ Worker-Pfad | Screenshot v222-24h-grau |
| 17 | CORINE-Maske ≤ 100 KB, CORINE-only, kein OSM; Urteil an bekannten Fällen unverändert | PASS — 24,8 KB; Duisburg/Linz industrial, Varallo/Hürtgenwald other ⇒ V-231 erledigt | `scripts/l0/check-clc-mask.mjs` |
| 18 | `eagerJs` unverändert (Budget-Bedingung) | PASS — 123,6 KB vor/nach; officialSources im lazy Chunk | audit §10 |
| 19 | Verifier gesamt | `verify:fire-behoerden` **97/97**; fire-Verifier gesamt 149+82+41+86+72+67+43+97 = **637** | Terminal |
| 20 | Konsole nach dem letzten Reload | ⚠️ Crash `layerRow … reading 'label'` — **fremde WT1-Änderung** (`fireSoilDryness` ohne `FIRE_LAYER_INFO`-Eintrag), nicht GWBA1; vor dieser Änderung 0/0 | read_console_messages |

## V-WALDBRAND-BODEN — Phase WT1: Bodentrockenheit aus ICON-D2 `smi` (2026-08-15, Gate GWT1)

Diagnose: `audit/waldbrand-boden.md`. Messbelege: `audit/l0/waldbrand-boden-smi{,-2,-3}.json`,
erzeugt von `scripts/l0/probe-waldbrand-boden{,2,3}.mjs` gegen den echten Lauf **2026081515** —
dekodiert mit **unserem** GRIB2-Decoder, nicht mit eccodes. UI-Prüfung: Dev-Build, Chrome,
Desktop 1920×897.

### WB-1 — Liest unser Decoder den Boden-Baum überhaupt?

Der `soil-level`-Baum hat ein anderes Dateimuster als `single-level` (keine `2d`-Marke, dafür
eine Ebene zwischen Schritt und Parameter). Ergebnis: **ja, ohne Anpassung am Decoder.**

```
Gitter          1215 × 746   — IDENTISCH zu relhum_2m
Schritte        0 … 48 (49)
Ebenen          0 · 1 · 3 · 9 · 27 · 81 · 243 · 729
Nachrichten/Datei  1
```

### WB-2 — Der Befund, der eine Klemmung verhindert hat

`smi` verlässt den Bereich 0..1 **in beide Richtungen**: gemessen **−0,93 … +2,15**. Sonde 2
suchte gezielt nach Füllwerten (die F1-Lehre: −999,9-Sentinels sehen wie gültige Werte aus) und
fand **keinen**; über echte Böden liegt der Anteil exakter Nullen bei **0,0 %**.

Hätte der Loader den Rohwert auf 0..1 geklemmt, wäre genau das abgeschnitten worden, wofür der
Layer da ist — Boden **unter** dem Welkepunkt. Geklemmt wird deshalb nur die Anzeigeachse.
Verifier-Anker: `(b) der Rohwert wird NICHT vorab auf 0..1 geklemmt`.

### WB-3 — Wasserzellen tragen Werte (die Maske, ohne die das Meer trocken wäre)

Gegenprobe gegen `fr_land` und `soiltyp`:

```
NaN über Wasser    151 528        NaN über Land            0
Wert über Land     531 415        Wert auf soiltyp = 9   212 735   ← ohne Maske eingefärbt
Bodenarten: Eis 170 · Fels 70 · Sand 68 817 · sand. Lehm 74 964 · Lehm 293 672
            · ton. Lehm 93 402 · Ton 5 936 · Torf 5 096 · Wasser 212 735
```

Die NaN-Maske der Datei deckt **nur** den Modellrand. Gezeichnet wird deshalb ausschließlich auf
wasserführenden Böden (`soiltyp` 3…8); Wasser, Fels und Eis bleiben transparent. Auf der Karte
live bestätigt: Nord- und Ostsee ungefärbt.

### WB-4 — Die tiefen Ebenen sind nicht unabhängig

Werte-Prüfsummen bei Schritt 0 — verschiedene Dateien, teils gleiche Werte:

| Ebene | 9 | 27 | 81 | 243 | 729 |
|---|---|---|---|---|---|
| Werte-Hash | `a0c783f6` | `936ff5a6` | `80011c68` | `766bb606` | `766bb606` |

**243 und 729 sind wertgleich.** Sie als getrennte Auswahl anzubieten wäre eine Unterscheidung,
die es in den Daten nicht gibt — die Wurzelzone nimmt 81 cm. Verifier-Anker: `(d) keine der
angebotenen Tiefen ist eine der wertgleichen Ebenen 243/729`.

### WB-5 — Die Verteilung, die über die Skala entschied

Über echte Böden (n = 541 887), Schritt 0:

| Ebene | p5 | p25 | p50 | p75 | p95 | < 0 |
|---|---|---|---|---|---|---|
| 0 cm | −0,62 | −0,30 | −0,19 | 0,00 | 0,50 | 403 934 |
| 3 cm | −0,10 | −0,03 | 0,00 | 0,15 | 0,56 | 264 226 |
| **9 cm** | 0,00 | 0,03 | **0,13** | 0,29 | 0,63 | 34 608 |
| 27 cm | 0,13 | 0,27 | 0,47 | 0,62 | 0,87 | 546 |
| **81 cm** | 0,62 | 0,77 | **0,85** | 0,97 | 1,19 | 650 |

Der Tiefengradient ist der physikalisch erwartete. Die Skala wurde **nicht** an dieser
Tagesverteilung kalibriert (das sähe kontrastreicher aus und wäre im Winter eine Lüge), sondern
an den definierten Punkten Welkepunkt (0) und Feldkapazität (1).

### WB-6 — Zeitverhalten

Zwischen +0 h und +24 h ändern sich **508 802 von 754 862** Zellen der 9-cm-Ebene (**67,4 %**).
Der Layer ist damit ein echter Vorhersage-Layer, kein Standbild — der Tagesregler bewegt etwas.
`maxDay: 1` (nicht 2, obwohl `smi` +48 h reicht): der Regler zielt auf den Mittag, aus einem
00z-Lauf läge Tag 2 bei +60 h. Live bestätigt: `input.max === "1"`.

### WB-7 — In der laufenden Anwendung

| Prüfung | Ergebnis |
|---|---|
| Layer eingehängt | `getLayer('fire-soil-scalar')` → true, `visibility: visible` |
| Z-Position | `fire-soil-attrib` zwischen `fire-burnt-*` und `fire-bans-fill`; `fire-dach-mask-fill` zuletzt |
| Statuszeile Oberboden | „25 Stundenschritte · Oberboden · **6 %** der Bodenfläche am oder unter dem Welkepunkt" |
| Statuszeile Wurzelzone | „25 Stundenschritte · Wurzelzone · **0 %** …" |
| Karte Oberboden | breit ockerbraun mit räumlicher Struktur |
| Karte Wurzelzone | fast leer — nur einzelne Flecken |
| Modus-Umschalter | Klick auf „Wurzelzone" ⇒ Hash sofort `"sm":"rootzone"`, Titel/Text/Quellzeile ziehen mit |
| Attribution | „Datenbasis: Deutscher Wetterdienst, ICON-D2 (smi), Rasterdaten bildlich wiedergegeben · CC BY 4.0" |
| Drei Layer auf Tag 1 | alle sichtbar, Regler `max=1`, **genau ein** Lag-Hinweis (der Wind) |
| Konsole | 3 Meldungen, alle vom Werkzeug — keine Warnung, kein Fehler |

Der Kontrast 6 % ↔ 0 % ist das Ergebnis, auf das es ankommt: oben nahe am Welkepunkt, unten
feucht. Ein Layer, der in beiden Modi gleich aussähe, hätte die Tiefenwahl nicht verdient.

### WB-8 — Harness

`typecheck` grün · `build` grün (exit 0) · **neu** `verify:fire-boden` **52/52** ·
`fire-model` 85/85 · `fire-time` 74/74 · `fire-danger-views` **44/44** · `fire-sources` 151/151 ·
`fire-corroboration` 82/82 · `fire-events` 41/41 · `fire-firms` 86/86 · `fire-behoerden` 97/97.

**Zwei Verifier-Mängel unterwegs behoben:**

1. `verify:fire-danger-views` prüfte `FIRE_LAYER_ORDER.length === 10` — eine fest eingetragene
   Zahl an Stelle der gemeinten Aussage. Sie schlug bereits **nach WW1** fehl; ich hatte den
   Verifier dort nicht mitlaufen lassen. Jetzt prüft sie, was E3 wirklich zusicherte: keine
   Sub-Ansicht ist ein Layer geworden (aus `DANGER_VIEW_ORDER` abgeleitet, nicht als Regex
   daneben), und die zehn E3-Layer stehen unverändert vorne.
2. `verifyIconD2Relhum()` existierte seit WB2, wurde aber von **keinem** Skript aufgerufen — eine
   Selbstverifikation, die nie lief. Läuft jetzt in `verify:fire-boden` mit (**V-236**).

### Offen

* **Budget rot:** `totalJs` 875,1 KB > 865 KB. Vor WT1 waren es 869,8 KB (V-234), vor WW1
  867,6 KB (V-232) — die Ratsche war bereits gerissen. WT1 trägt ≈ 5,3 KB bei (**V-235**).
  Nicht angehoben; Jans Entscheidung.
* **Mobil 390×844 nicht verifiziert** — dieselbe Blockade wie in WW1 (Chrome nahm die
  Fenstergröße nicht an). Nicht als geprüft gebucht.

---

## V-WALDBRAND-CLUSTER — Phase BC1: Brand-Cluster, Liste + Hülle (2026-08-16, Gate GBC1)

Umgebung: Prod-Build (`vite preview`, :4188) und Dev (:5205), Desktop-Chrome, Viewport **1920×953**
— die Vorgabe 1440×900 nahm Chrome nicht an (dieselbe Blockade wie in WW1/WT1/GBF1). Datenlage:
FIRMS-Lauf vom 16.08., 24-h-Fenster 1 486 Detektionen, 7-Tage-Fenster 7 484.

### BC-1 — Die Liste entsteht aus dem angezeigten Fenster

| # | Schritt | Erwartung | Ergebnis |
|---|---|---|---|
| 1 | Waldbrand öffnen, „Aktive Brände" einschalten, Readout auf „Brände" | Kopfzeile nennt Clusterzahl | **232 Cluster aus 1.486 Detektionen der letzten 24 h** ✅ |
| 2 | Auf „7 Tage" umschalten | Liste wird geleert, Grund steht da, dann neue Liste | „0 Cluster" + **„Cluster werden gebildet …"**, danach **1 111 Cluster aus 7.484 Detektionen** ✅ |
| 3 | Sortierung prüfen | absteigend nach ΣFRP | 21 577,5 → 6 116,7 → 2 842 → 2 155,7 … ✅ |
| 4 | Zeileninhalt | Rang · Stärke · Detektionen · Fläche · Land · letzte Detektion | „**1 · 6.206,2 MW · 725 Detektionen · 34,1 km² · außerhalb DE/AT/CH · 05:17 · vor 8 h**" ✅ |
| 5 | Cluster mit 1–2 Detektionen | Fläche „—", kein Polygon auf der Karte | Rang 18: „34,5 MW · 2 Detektionen · **—** · DE" ✅ |

### BC-2 — Der Befund, der die Phase erweitert hat

| # | Schritt | Erwartung | Ergebnis |
|---|---|---|---|
| 1 | Erste Fassung, Liste sichten | — | **Rang 7: „150,7 MW · 51 Detektionen · DE"** = Duisburg-Bruckhausen (ThyssenKrupp). Die Karte zeichnete dieselben Punkte grau ⇒ Liste widersprach der Karte ❌ |
| 2 | Nach der Korrektur erneut | ortsfeste Cluster grau + beschriftet, **in der Rangfolge** | Ränge 3, 4, 7, 9, 11, 12 tragen „**ORTSFEST**" mit grauem Punkt, Position unverändert ✅ |
| 3 | Vor der Einordnung | keine Zeile behauptet einen Vorbehalt | während „Einordnung läuft …" trägt keine Zeile das Abzeichen ✅ (V-222) |
| 4 | Quelle des Vorbehalts | dieselbe Schlüsselmenge wie die grauen Punkte | `keys` speist `toRun` **und** `computeFireClusters` — Verifier-Anker ✅ |

### BC-3 — Kopplung Liste ↔ Karte

| # | Schritt | Erwartung | Ergebnis |
|---|---|---|---|
| 1 | Klick auf Listenzeile (Rang 7) | Karte zoomt auf den Cluster, Hülle hervorgehoben | Karte sprang auf Duisburg, **dunkle Hüllenkontur** um die Detektionen, Zeile markiert ✅ |
| 2 | Klick auf eine Hülle auf der Karte (Readout stand auf „Layer") | Zeile markiert, Readout schaltet auf „Brände" | Rang 1 markiert, Reiter sprang um ✅ |
| 3 | Popup-Verhalten dabei | unverändert | Detektions-Steckbrief öffnete wie bisher („Thermalanomalie … PLAUSIBEL — 16 Überflüge … Detektionsraster: 3.367 ha aus 719 Pixeln") ✅ |
| 4 | Fensterwechsel | Markierung fällt weg (gehört zum alten Fenster) | ✅ |
| 5 | Cluster **jenseits** des Deckels auf der Karte anklicken | Liste klappt bis zu seiner Zeile auf | **nicht live geprüft** — am Sitzungsende lud die Basiskarte nicht mehr (s. u.); Verifier-Anker vorhanden ⚠️ |

### BC-4 — Leistung (der Grund für den Deckel)

| Messung | Wert | Bemerkung |
|---|---|---|
| Clustering 6 000 Detektionen (headless, Node) | **35–56 ms** | Worst Case: jede Detektion ein eigener Cluster |
| Klick → 1 111 Zeilen im DOM (Prod-Build) | **253 ms** | über der 200-ms-Grenze, auf dem Desktop |
| dito mit `content-visibility: auto` | **303–366 ms** | **schlechter** — die Kosten stecken in ~9 000 Knoten, nicht im Zeichnen |
| dito mit Deckel `CLUSTER_PAGE = 50` | **19–41 ms** | Kopfzeile nennt weiter 1 111, die Liste sagt „gezeigt: die 50 stärksten von 1 111" |
| „50 weitere anzeigen" | 50 → 100 Zeilen, Text zieht nach | ✅ |

**Long Tasks: nicht gemessen.** Long-Task- und Event-Timing-API lieferten über den verfügbaren
Browser-Kanal keine Einträge — auch nicht für eine absichtlich erzeugte **260-ms-Blockade**. Das
Instrument ist unbrauchbar, das Ergebnis ist **nicht** „null Tasks". Ersatzmessungen s. o.

### BC-5 — Ehrlichkeit und Leerzustände

| # | Schritt | Erwartung | Ergebnis |
|---|---|---|---|
| 1 | Pflichthinweis | steht **über** der Liste, in jedem Zustand | „…Leistung, keine Fläche und keine Energie, summiert über Pixel und Überflüge … nicht die verbrannte Fläche und nicht die vom Satelliten abgedeckte …" ✅ |
| 2 | GWIS-Notbetrieb (auf einem Server ohne FIRMS-Schlüssel gesehen) | keine Rangliste, sondern der Grund | „**Notbetrieb:** … liefert weder Feuerstrahlungsleistung noch Einzelwerte. Eine Rangfolge ‚nach Stärke' wäre in diesem Zustand erfunden" ✅ |
| 3 | Land außerhalb DACH | „außerhalb DE/AT/CH", nicht „DE" | Rang 1 (50,53 N / 6,10 E, Belgien) ✅ — macht **V-221** sichtbar |
| 4 | Hülle gegen Raster | kein fester Faktor | 34,1 km² Hülle gegen 33,67 km² Raster am selben Cluster — die Hülle ist dort **größer**; die erste Fassung der Diagnose behauptete das Gegenteil und wurde korrigiert ✅ |
| 5 | Konsole über einen vollen Lauf | 0 Fehler, 0 Warnungen | nur Vite-/React-Dev-Meldungen ✅ |

### Offen

- **Mobil 390×844** nicht verifiziert (Chrome nahm die Fenstergröße nicht an; Viewport blieb 1920×953).
- **BC-3/5** (Aufklappen jenseits des Deckels) nur im Code belegt: am Sitzungsende lieferte
  `map.isStyleLoaded()` dauerhaft `false` — auch in einem frischen Tab und mit Raster-Basiskarte,
  während der Style-Host aus derselben Maschine mit HTTP 200 antwortete. Ohne Karte kein Kartenklick.
