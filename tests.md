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

## V-WIND-TRANSPORT (Phase T1 — Transport-/Datenschicht)
**Abweichendes Setup:** Dieses Protokoll ist **nicht** iPhone-Emulations-zentriert, sondern netzwerk-/cache-/korrektheitszentriert. Zwei Umgebungen: **(L) lokal `netlify dev`** (Edge Function + Client + Warmer-Logik) für **Korrektheit**, **(N) Netlify-Deploy** für **Latenz/Cache-Wirkung**. Der Wind-Layer läuft in einem Vordergrund-Browser (In-App-Browser pausiert rAF / WebGL nicht repräsentativ).

**(L) Lokal — Korrektheit (`netlify dev`)**
1. Eine `.grib2.bz2` über die Edge Function vs. direkt von DWD holen → **Bytes identisch** (Größe/Hash). Beleg: Vergleichsausgabe.
2. Response-Header der Edge Function prüfen: `Netlify-CDN-Cache-Control` mit `durable, immutable` gesetzt; Cache-Key = URL (Lauf+Step). Beleg: Header-Auszug.
3. Wind-Layer lädt über die Edge Function → Frames erscheinen, Slider scrubbar, **Vektoren/Dichte unverändert** ggü. Baseline. Beleg: Screenshot + kurzer Verhaltensabgleich.
4. **Manifest-Gate:** Client fetcht `latest-wind.json`, danach **ausschließlich** die dort genannten (Lauf,Step)-URLs — kein Fallback auf DWD-Verzeichnis-Scan. Beleg: Netzwerk-Liste.
5. **Warmer idempotent:** Warm-Skript zweimal ohne neuen DWD-Lauf laufen lassen → zweiter Lauf ändert Manifest nicht (Early-Exit). Simulierter Fehllauf (DWD-URL blockiert) → Manifest bleibt auf letztem gutem Lauf, nächster Lauf heilt. Beleg: Log.
6. **Output-Gleichheit:** Zeit-Interpolation/Scrubbing über mehrere Stunden identisch zu vorher (`blendWindFrames`-Pfad unberührt). Beleg: Screenshot-Stichproben gleicher Slider-Positionen.

**(N) Netlify — Latenz & Cache**
7. Kalter (Lauf,Step): erster Request füllt Durable Cache (Miss), zweiter ist **Hit** (~150 ms). Beleg: Timing + Cache-Status-Header, vorher/nachher.
8. **Cross-Request-Warm:** zweiter Request aus anderer Session/anderem Client trifft warmen Cache (kein erneuter DWD-Fetch). Beleg: Timing.
9. **Kein Cold-Path für Besucher:** nach einem frischen Lauf ist der Cache durch den Warm-Cron gefüllt, **bevor** ein simulierter Erst-Besucher lädt → erster echter Load ist warm. Beleg: Reihenfolge Cron-Log ↔ Load-Timing.
10. **Kritischer Pfad:** Trace vorher/nachher — die ~1,9-s-Directory-Auflösung ist entfernt (Manifest-Fetch ~50 ms), erster Wind deutlich früher. Beleg: Trace-Zusammenfassung.
11. **Graceful degrade:** Manifest künstlich einfrieren/veraltet → Client serviert letzten gewärmten Lauf (stale), **nie kalt/kaputt**. Beleg: Verhalten + Screenshot.
12. Konsole frei von neuen Errors/Warnings; keine CORS-Regression (same-origin über Edge Function). Beleg: Konsolen-Auszug.

**Nicht-Regression (beide Umgebungen):** Windpartikel numerisch/visuell = Baseline (Richtung, Dichte, **FPS-Cap** mobil 30 unverändert); Fusion/Shader/IDB-Now-Cache-Pfade unangetastet.

---

## Beleg-Ablage
- Screenshots: `audit/screenshots/<feature>/{before,after}/`
- Traces: `audit/traces/<feature>/`
- Audit-Berichte: `audit/<feature>.md` (Diagnose + Verify-Protokoll + Selbstverifikations-Antworten)
