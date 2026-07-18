# plan.md — Phasenplan: Desktop-Redesign der 2D-Wetterkarte

Der Zyklus bleibt **Diagnose → Plan → Implement → Verify → Gate** (siehe CLAUDE.md). Aktueller Fokus ist die **Desktop**-Ansicht der 2D-Wetterkarte. Die Mobile-Phasen (Phase 0/1/1-C) sind abgeschlossen und bilden die Nicht-Regressions-Baseline (Details unten unter „Bereits erledigt (Mobile)").

---

## Phase D1 — Wetterkarte Desktop-Redesign (Gate GD1) · AKTIV

**Ziel:** Die ~6 frei schwebenden Desktop-Steuer-Cluster in **drei Zonen** zusammenführen, ohne Funktions-/Datenverlust und unter Erhalt der Brand-Identität.

**Verbindliche Umsetzungs-Spezifikation:** `audit/mockups/wetterkarte-desktop-spec.md` (13 Abschnitte: Sicherheitsrahmen §0, Ist-Code-Mapping §1, Ziel-Architektur §2, Zone A §3, Zone B/Ribbon §4, Zone C §5, Top-Kontext §6, Legenden-Datenmodell §7, Motion §8, CSS-Strategie §9, 12-Punkte-Preservation-Contract §10, frontend-design-Auflage §11, Verifikation §12, Umsetzungs-Reihenfolge §13). **Diese Datei ist maßgeblich — die Punkte unten sind Kurzfassung.**

**Visuelle Referenz:** `audit/mockups/wetterkarte-desktop.html` (1440×860, echte Tokens + IBM Plex Mono).

**Auflage:** Vor der visuellen Umsetzung die `frontend-design`-Skill aufrufen. Signatur-Element = die Instrument-Ribbon; dort Sorgfalt konzentrieren, restliche Zonen ruhig halten. Marke bleibt der Brief.

**Diagnose-First:** Vor Code das Ist-Code-Mapping (Spec §1) gegen den echten `MapView.tsx`/`MapView.css`-Stand verifizieren (Zeilen aktualisieren) und die 12 Preservation-Punkte im Ist-Zustand belegen → `audit/wetterkarte-desktop.md`. **Kein Code vorher.**

**Kern-Maßnahmen (Kurzfassung, Details in der Spec):**
1. **Gerüst:** additive Zonen-Container `.wx-panel` (links) / `.wx-ribbon` (unten) / `.wx-dossier` (rechts), desktop-gescopet; Mobile-Block unangetastet.
2. **Zone A:** 12 Layer gruppiert (visuell, keine Funktionsänderung) + Inline-Regler des aktiven Layers (Wind-Feinsteuerung, Sat-Produktwahl 1:1 umgezogen) + `ModelSwitcher` (ggf. additiv `variant="panel"`) + Quellen-Fuß.
3. **Zone C:** `PointForecastPanel` in die rechte Dock-Hülle docken, PFC-Logik/Sub-Tabs unverändert.
4. **Zone B (Signatur, zuletzt):** Zeitachse (State `forecastHour` + RAF-Coalescing unverändert) → persistente Live-Legende (Rampen-Registry §7) → Trend-Sparkline (an PFC-Daten, kein neuer Fetch). Die vier `.map-legends`-Blöcke wandern in den Legendenstreifen.
5. **Top-Kontext** (Marke/Ort/Zoom) optisch angleichen.
6. **CSS-Aufräumung:** nur eindeutig desktop-tote Regeln; alles, was der Mobile-Block referenziert, bleibt.

**Verify:** Spec §12 — Preservation-Contract §10 Punkt für Punkt; **Mobile-Regression** 390×844 identisch zur Phase-1-C-Baseline; Desktop-Performance-Trace (kein Long Task > 200 ms, keine neue Dauer-Repaint-Schleife); Vorher/Nachher-Screenshots aller drei Zonen unter `audit/screenshots/wetterkarte-desktop/`; Konsole sauber; Selbstverifikation aus CLAUDE.md schriftlich.

**Gate GD1:** Alle 12 Preservation-Punkte erreichbar, drei Zonen funktionsfähig, Mobile unverändert, Desktop-Performance ok, keine neuen Konsolenfehler.

---

## Phase R1 — Regenradar Desktop-Redesign „Der Anflug" (Gate GR1) · AKTIV

**Freigabe:** Jan, 2026-07-10 — Regenradar aus der Rückstellung geholt („direkt in den Code", Desktop zuerst). Richtung bestätigt anhand des Konzept-Mockups.

**Visuelle Referenz:** `audit/mockups/regenradar-desktop.html` (1440×864, echte Tokens + IBM Plex Mono).

**Thesis:** Das Regenradar vom gestapelten Karten-Dashboard zur **Karten-Bühne** mit schwebenden Cream-Glas-Instrumenten führen — gleiche Sprache wie das Wetterkarte-Desktop-Mockup. **Signatur = „Der Anflug"**: der ehrliche Messung↔Vorhersage-Bruch wird zum Blickfang — Regenprofil links scharf (gemessen/extrapoliert), das am **Skill-Horizont sichtbar in eine ausbleichende Prognose zerfällt**. Buscosuns Ehrlichkeits-Versprechen als Bild statt als Fußnote.

**Oberste Direktive: Funktionserhalt.** Alle 11 Ebenen + Presets, Palette/Basiskarte/Deckkraft/dBZ-Expert, Scrub·Play·Speed·Loop·Jetzt, Punkt-Nowcast, Zell-ETA, Blitze, Akkumulation, Datenqualität bleiben vollständig. Nur Darstellung/Anordnung ändert sich.

**Umsetzung — inkrementell, kleine Commits:**
1. **R1.1 — Signatur zuerst (contained):** Den Messung↔Vorhersage-Bruch in `RadarTimeline` zur Signatur verstärken — gemessene Fläche kräftig/solide, Prognose-Fläche jenseits von „jetzt" mit horizontalem Fade, der am **Skill-Horizont** (`stack.skillMin`) in einen ausbleichenden Nebel übergeht; beschriftete Skill-Horizont-Naht. Nur `RadarTimeline.tsx` + `radar.css`. Kein Layout-Umbau, alle Daten bereits vorhanden. **← dieser Commit.**
2. **R1.2 — Anflug-Instrument:** Punkt-Nowcast (`PointStrip`) + Zell-ETA + Richtungs-Kompass zu einem Hero-Instrument fusionieren (desktop).
3. **R1.3 — Karten-Bühne:** Desktop-Layout invertieren (Radarkarte Vollbild, Instrumente als Glas-Overlays), sauber per Breakpoint isoliert; Mobile-/Scroll-Layout unangetastet.
4. **R1.4 — Legende als Säule + Ebenen-Schiene**, Politur, Motion (reduced-motion respektiert).

**Verify je Schritt:** Funktionserhalt-Punkte belegen, Konsole sauber, Vorher/Nachher-Screenshots unter `audit/screenshots/regenradar/`, Selbstverifikation (CLAUDE.md 5 Fragen). Mobile-Ansicht bleibt bis R1.3 unberührt und wird dort explizit als Nicht-Regression geprüft.

**Gate GR1:** Signatur sichtbar, alle Funktionen erhalten, Desktop performant (kein Long Task > 200 ms), Mobile unverändert, keine neuen Konsolenfehler.

---

## Phase T1 — Wind-Transport: Caching-Proxy + Manifest-Warm (Gate GT1) · VORBEREITET

**Art:** Reiner **Transport-/Datenschicht-Umbau** (kein UI, keine Fusion, kein Shader, kein Decode-Eingriff). Erste konkrete, aktivierte Ausprägung des allgemeinen „Lade-/Cache-Optimierung"-Themas (früher als D3 skizziert), fokussiert auf das Wind-Layer-Problem.

**Problem (Diagnose liegt vor, siehe `context.md` → „Infrastruktur-Strang"):** Der Wind-Layer zieht 10 rohe `.grib2.bz2` (~1,1 MB) **live** von DWD über `/_dwd_opendata` — ~5 s origin-gebunden, kein geteilter Cache, DWD auf dem kritischen Pfad. Der Client hat bereits Staffelung/Prefetch/IDB-Now-Cache → die Wand ist primär Kaltstart + Cross-User.

**Thesis:** Die 5 s brauchen **keinen** RG8-WebP-Precompute. Sie sterben eine Stufe früher, risikoarm, ohne `buildWindRgba`/`blendWindFrames`/Norm anzufassen: DWD raus aus dem Request-Pfad durch **Edge-Caching der immutablen (Lauf,Step)-Dateien**, und „kein Besucher trifft die Wand" durch einen **manifest-gegateten Warm-Cron**.

**Oberste Direktive: Funktionserhalt + Output-Gleichheit.** Windpartikel müssen nach dem Umbau **numerisch und visuell identisch** rendern (gleiche Vektoren, gleiche Dichte, gleicher FPS-Cap). Der Umbau ändert nur, *woher* und *wie schnell* dieselben Bytes kommen.

**Umsetzung — inkrementell, klein, local-first:**
1. **T1.0 — Diagnose (Diagnose-First):** Befund + Trace-Beleg aus `context.md`/dieser Session in `audit/wind-transport.md` festhalten (Request-Muster 5×u/v, ~5 s origin-gebunden, bestehende Client-Mitigationen). Eine frische Messung als Baseline (kalt, Netzwerk-Tab). **Kein Code vorher.**
2. **T1.1 — Caching-Proxy (Netlify Edge Function):** Den `/_dwd_opendata`-Pfad **für Wind** durch eine Edge Function ersetzen, die DWD server-seitig fetcht und `Netlify-CDN-Cache-Control: public, durable, max-age=<retention>, immutable` setzt. Cache-Key = URL (trägt Lauf+Step → unveränderlich). **Lokal via `netlify dev`** auf Korrektheit prüfen (Hit/Miss-Header, Bytes identisch zum Direkt-Fetch), Latenzwirkung erst auf Netlify.
3. **T1.2 — Warm-Cron (GitHub Action):** Poll DWD (~alle 10–15 min) → neuester **vollständiger** Lauf? → `curl` der Wind-URLs **durch den Proxy** (füllt Edge-Cache) → **erst danach** `latest-wind.json` (Lauf + Steps) umlegen (atomar, zuletzt). Kein eccodes, kein Decode. Early-Exit wenn Manifest schon aktuell (kostet Sekunden). Idempotent → Fehlläufe heilen beim nächsten Tick.
4. **T1.3 — Manifest-Gate im Client:** `resolveLatestRun` liest `latest-wind.json` (winzig, edge-cached) statt das DWD-Verzeichnis zu scannen. Effekt: (a) Client fragt **nur gewärmte Läufe** an → praktisch kein Besucher trifft die 5 s; (b) die **~1,9 s Directory-Auflösung** fällt vom kritischen Pfad. Minimaler, isolierter Client-Eingriff — der restliche Loader (`fetchStepBytes`, Worker-Decode, Blend, Norm) bleibt **unangetastet**.
5. **Deploy:** Nach lokaler Korrektheits-Verifikation auf Netlify deployen; Durable-Cache-Hit/Miss + reale Latenz + Warm-Cron scharf schalten und messen.

**Graceful degrade (Design-Invariante):** Warmer aus / Manifest eingefroren → Client serviert den letzten gewärmten Lauf → **stale statt slow, nie kalt**. Alert auf Manifest-Alter (z. B. > 6 h).

**Bewusst zurückgestellt — Stufe 1 (NICHT T1, mess-gegatet):** RG8-WebP-Ingest (u+v → **lossless** WebP + per-Frame-Norm/Bounds-Sidecar + `manifest.json`-atomarer Publish; 1,1 MB → ~150 KB, kein Client-bz2/GRIB, nahen Horizont weiter eager von R2). **Nur** bauen, wenn eine Messung **auf echtem iPhone nach T1** Payload/Decode noch als Engpass zeigt. Präzision unkritisch (heutige Quell-Frames sind 8-bit RG; per-Frame-Norm ⇒ ~0,14 m/s/Stufe); einzige Falle = *lossy* WebP.

**Scope-Ehrlichkeit:** T1 fixt **nur Wind**. Radar (RADOLAN, 5-min-Takt) passt nicht in ein 3h-/Manifest-Muster → separater Weg (On-Demand-Cache oder unverändert); der `/_dwd_opendata`-Proxy bleibt dafür bestehen. „Proxy verschwindet" gilt nicht global.

**Verify:** Protokoll **V-WIND-TRANSPORT** in `tests.md` — lokal (`netlify dev`): Bytes identisch, Manifest-Gate greift, Warmer idempotent, Wind unverändert; auf Netlify: Cache-Hit-Latenz, Cross-Request-Warm, kein Cold-Path für Besucher, Konsole sauber, Wind numerisch/visuell = Baseline. Selbstverifikation (CLAUDE.md) schriftlich in `audit/wind-transport.md`.

**Gate GT1:** DWD nicht mehr im kritischen Pfad (Cache-Hit-Beleg), Manifest-Gate verhindert Cold-Requests, Warm-Cron läuft + heilt Fehlläufe, Wind rendert identisch (Vektoren/Dichte/FPS), ~1,9-s-Listing entfernt, lokal→Netlify verifiziert, keine neuen Konsolenfehler.

---

## Nächste mögliche Desktop-Phasen (nach GD1, noch nicht ausgearbeitet)
- **D2 — Desktop-Performance/Rendering** der 2D-Karte (Levers in `prompt-performance.md` / `audit/performance-2d.md`).
- **D3 — Lade-/Cache-Optimierung** (Levers in `prompt-loading.md` / `audit/loading-optimization.md`) — **T1 ist die erste konkrete Ausprägung dieses Themas** (Wind-Transport); weitere Quellen später.

Reihenfolge und Ausarbeitung nach Jans Freigabe.

---

## Bereits erledigt (Mobile) — Nicht-Regressions-Baseline

- **Phase 0 — Fundament & Baseline (G0):** Emulation iPhone 12 Pro (390×844 DPR 3), Breakpoint-Konvention (`max-width:767px` mobil / 768–1024 Tablet / >1024 Desktop), `viewport-fit=cover`, Baseline-Screenshots aller Seiten, geteilte Primitives `src/mobile/`. Details: `audit/phase0-fundament.md`.
- **Phase 1 — Wetterkarte Mobile (G1):** Touch-Targets ≥44px, half/full-Snap-Sheet, Landscape-Fix 844×390. Details: `audit/wetterkarte.md`.
- **Phase 1-C — Wetterkarte Mobile-Redesign „Variante C" (G1-C):** ein persistentes Bottom-Sheet mit Segment-Umschalter Layer·Modell·Vorhersage, drei Snap-Zustände (collapsed/half/full), vollflächige Karte, transform-basierte Motion (CLS≈0), Punkt-Vorhersage als drittes Segment, CSS auf einen Mobile-Block konsolidiert, Timeline im Mockup-Stil. Verbindliche Spec war `audit/mockups/wetterkarte-c-spec.md`. Details: `audit/wetterkarte.md` §9.

**Diese Mobile-Ergebnisse sind der Referenzzustand, gegen den Phase D1 auf Regressionen geprüft wird.** Die weiteren Mobile-Features (Regenradar, Vorhersage, Tourenplanung, Event, Historie, Atmosphäre, 3D Globus) aus der ursprünglichen Mobile-Roadmap sind vorerst zurückgestellt, bis der Desktop-Strang abgeschlossen ist oder Jan umpriorisiert.
