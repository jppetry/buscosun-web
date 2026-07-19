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

---

## Beleg-Ablage
- Screenshots: `audit/screenshots/<feature>/{before,after}/`
- Traces: `audit/traces/<feature>/`
- Audit-Berichte: `audit/<feature>.md` (Diagnose + Verify-Protokoll + Selbstverifikations-Antworten)
