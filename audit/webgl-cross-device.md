# Audit & Spezifikation — WebGL Cross-Device-Parität (Phase P / Gate GP)

**Vorhaben:** Die WebGL-Wind-Animation soll auf **jedem Gerät gleich aussehen** (gleiche Partikel*dichte*) **und gleich performant** laufen. Erreicht wird das *nicht* durch Reduktion der Partikelzahl auf schwachen Geräten, sondern durch **partikel-neutrale Hebel** (DPR-Cap, FPS-Governance).

**Referenzgerät:** iPhone 12 Pro (390×844 CSS, DPR 3). **Betroffene Files (Umsetzung via CLI, nicht hier):** `src/wind/perfGovernor.ts`, `src/wind/WindLayer.ts`, `src/MapView.tsx`, `scripts/verify-governor.mjs`.

> **Status:** Diagnose abgeschlossen (Code-Analyse, geräteunabhängig). Umsetzung offen — erfolgt separat über die Claude-Code-CLI. Real-Device-Gegencheck (iPhone + schwaches Android) ist Pflicht vor Gate GP (🔴).

---

## 1. Auslöser & Verifikation der Fachmann-Einschätzung

Jan hat eine externe Experten-Einschätzung zur Cross-Device-Performance vorgelegt (5 Hebel + WebGPU/Diagnose-Hinweise). Prüfung Aussage-für-Aussage gegen den Ist-Code:

| # | Aussage | Befund im Code | Status |
|---|---------|----------------|--------|
| 1 | DPR auf ~1,5 cappen | `MapView.tsx:584` `pixelRatio: coarsePointer ? Math.min(dpr,1.5) : dpr`; Trail-Buffer folgen `gl.drawingBufferWidth` (`WindLayer.ts:945`) | ✅ **bereits umgesetzt** (1,5) |
| 2 | Trail-/Fade-Pass bei halber Auflösung | Trail-Buffer laufen auf **voller** gecappter Res (`WindLayer.ts:958`); Fade-Quad ist full-screen/Frame | ❌ **offen** — stärkster verbleibender Fillrate-Win, aber RGBA8-Pfad → STOPP-Regel |
| 3 | Partikelbudget an gecappte Pixel koppeln | `targetParticleCount()` (`WindLayer.ts:289`) koppelt an **CSS-Fläche** (`baseDensity 3600 × MPix`), DPR-unabhängig | ✅ **besser gelöst** — umgeht die „an native DPR koppeln"-Falle ganz |
| 4 | Adaptiv-Loop: Frame-Zeit messen, Tier + Hysterese | `FrameGovernor` (`perfGovernor.ts:129`): EMA + asymmetrische Hysterese + Cooldown/Warmup, inkl. Thermal-Abfang | ✅ **existiert** — aber zieht nur **einen** Hebel (Partikelzahl) statt Trail-Res/DPR/FPS |
| 5 | Nur repainten wenn nötig; `visibilitychange`-Pause | FPS-Cap (`WindLayer.ts:1167`) + `reduceMotionOnMove` vorhanden; **kein** `visibilitychange`/map-idle/offscreen-Pause | ⚠️ **teilweise** |

**Stack-Fehler der Einschätzung (dokumentiert, damit sie nicht in die Umsetzung durchsickern):** Der Fachmann spricht von *„Three.js-Custom-Layer"*, *„WebGPU im Stack"*, *„RepaintScheduler"* und einem *„WebGL2-Pfad"*. **Keins davon existiert:** einziger Renderer ist **MapLibre GL, WebGL1** (GLSL ES 1.00), alle Wetter-Layer sind MapLibre-CustomLayer; kein Three.js, kein WebGPU. „RepaintScheduler/AdaptiveQualityController/FixedTimestepLoop" sind Doku-Artefakte ohne Code-Entsprechung (bestätigt in `audit/performance-2d.md` §2). Die Einschätzung ist generisch fachlich stark, wurde aber **ohne Blick auf den Code** verfasst.

**Fazit:** Von 5 Hebeln sind 1 + 3 bereits (gut) gelöst, 4 im Kern vorhanden. Das eigentliche „auf jedem Gerät"-Herz ist **nicht Neubau, sondern Umwidmung** des vorhandenen `FrameGovernor`.

---

## 2. Eigene Diagnose — Fillrate-Bilanz (der Kern)

Per animiertem Frame zeichnet `render()`→`drawScreen()` (`WindLayer.ts:1217-1247`). iPhone 12 Pro, DPR-gecappt auf 1,5 → Drawing-Buffer **585×1266 ≈ 0,74 MPix** pro Full-Screen-Pass; Wind mobil auf **30 fps** gedeckelt.

| Pass | Ziel | Kosten |
|------|------|--------|
| `clear` screenTexture | Trail-Buffer 585×1266 | 0,74 MPix |
| **Fade** (`drawTexture` bg→screen) | Trail-Buffer | **0,74 MPix, texturiert** |
| Partikel (`drawArrays POINTS`) | Trail-Buffer | N × ~5 px² (klein) |
| **Composite** (`drawTexture` screen→MapLibre-FB) | Bildschirm | **0,74 MPix, texturiert** |
| **Advektion** (`updateParticles`) | State-Textur ~67×67 | **≈ 0,005 MPix** |

**Schlüsselbefund:** Die zwei Full-Screen-Trail-Pässe (~2,2 MPix/Frame) sind **partikel-unabhängig**. Die Advektion — der einzige Pass, der mit der Partikelzahl skaliert — kostet **~440× weniger**. **Die Partikelzahl ist damit der schwächste denkbare Perf-Hebel.** Der Governor drosselt heute ausgerechnet diesen.

Zusatz-Einordnung fürs Referenzgerät: iPhone 12 Pro = Apple A14 → `classifyGpu` (`perfGovernor.ts:49`) bucketet als **strong** (bzw. „weak"-Fallback über `apple a[0-9]` — Heuristik prüfen). 2,2 MPix × 30 fps = 66 MPix/s liegt weit unter dem, was ein A14 leistet. **Fillrate ist auf dem iPhone kaum der Flaschenhals — Hebel 2 zieht v. a. auf schwachem Android (Adreno 5xx, Mali).**

---

## 3. Entscheidung (Jan)

**Ziel:** Partikel*dichte* auf jedem Gerät identisch (Desktop = Mobile). Performance-Parität über Hebel, die die Partikelzahl **nicht** anfassen.

**Gewählter Ansatz (Jans Freigabe, Option „Governor regelt FPS statt Partikel"):**
1. **Partikel-Multiplikator des Governors aus dem Partikelpfad entfernen** → jedes Gerät rendert die volle, flächen-gleiche Partikelzahl. `autoScale` (CSS-Flächen-Kopplung) bleibt und ist genau der Grund, warum die *Dichte* geräteübergreifend gleich ist.
2. **Governor-Ausgang auf die FPS-Rate umhängen:** Bricht ein Gerät unter Budget ein, senkt der Governor die Wind-FPS (z. B. 30 → 24 → 20) statt der Partikelzahl. Der Governor bleibt aktiv → die harte Regel „Governor **nutzen, nicht umgehen**" ist erfüllt; es wird kein Bypass gebaut.
3. **DPR-Cap 1,5 bleibt** unverändert (bereits umgesetzt, partikel-neutral).

**Bewusst NICHT gewählt:** Governor als Partikel-Notfallboden (würde die Zahl auf schwacher Hardware doch wieder ungleich machen) und „Drossel komplett aus ohne Ersatz".

---

## 4. Umsetzungs-Spezifikation (für die CLI)

> Diese Datei ist die maßgebliche Vorgabe. Reihenfolge kleiner Commits, Scope = `wetterkarte`/`wind`.

**P-1 — Partikelzahl parität-neutral machen**
- `getEffectiveParticleCount()` (`WindLayer.ts:1015`): den Faktor `q = governor.quality` **entfernen**. Ergebnis = `min(_numParticles, floor(_numParticles × frac(zoom)))`. `frac(zoom)` bleibt (zoom-abhängig, geräte-unabhängig → bricht Parität nicht).
- Der Governor wird weiter pro Frame gefüttert (s. P-2), steuert aber nicht mehr die Zahl.

**P-2 — Governor steuert FPS statt Partikel** *(die eigentliche Arbeit)*
- Governor-Level → **FPS-Leiter** mappen, z. B. mobil `{30, 24, 20}` je Tier; Desktop/Fine-Pointer bleibt auf Top-Tier gepinnt → `maxParticleFps = 0` (ungedeckelt = byte-identische Referenz, keine Desktop-Regression).
- Das Mapping-Ergebnis auf das bestehende `maxParticleFps`/`scheduleParticleRepaint`-Gate (`WindLayer.ts:1167`) legen — dieser Mechanismus existiert bereits, wird nur dynamisch statt statisch gesetzt.
- **KRITISCH — Messgröße:** Der Governor darf für die FPS-Regelung **nicht** das gedeckelte Wall-Clock-Intervall bekommen (das ist mit Cap künstlich ~33 ms und triebe den Governor immer nach unten → selbst-sabotierend). Er muss die **tatsächliche Frame-Render-Dauer** bzw. „hält das Gerät die Zielrate?" bewerten. → `feed()`-Eingabe entsprechend umstellen.
- **KRITISCH — Schwellen re-basieren:** `downMs`/`upMs` (heute fix 24/18 ms, ~60-fps-Annahme) müssen relativ zum **aktiven FPS-Ziel** rechnen (z. B. down bei EMA > ~1,3×`1000/zielFps`, up bei < ~0,9×). Sonst kann ein 30-fps-Cap nie „gesund" sein.
- Hysterese/Cooldown/Warmup-Logik bleibt (gegen Oszillation), nur relativ zum Ziel.

**P-3 — Governor-Verifikationsharness anpassen**
- `scripts/verify-governor.mjs` auf die FPS-Ziel-Semantik erweitern (synthetische Render-Dauer-Sequenzen → erwartete FPS-Tier-Schritte). Konvention beibehalten: **kein Vitest**, Node-strip-types-Harness, deterministisch.

**P-4 — DPR-Cap bestätigen** (kein Code): `MapView.tsx:584` bleibt bei 1,5.

---

## 5. Einhaltung der harten Regeln
- **Kein** Shader-Eingriff, **kein** RGBA8-Packing-Pfad, **kein** `EXT_color_buffer_float`, **kein** Float-Render-Target, **kein** Fusion-Eingriff. Reine Frame-Scheduling-/Governance-Logik.
- **Kein** Trail-Buffer-Downscale (Hebel 2) in diesem Vorhaben — falls Real-Device später zeigt, dass ein schwaches Android trotz FPS-Abbau reißt, wird Hebel 2 als **separates** Vorhaben mit expliziter STOPP-Freigabe geplant (RGBA8-Trail-Pfad).
- Desktop (Fine-Pointer): Top-Tier gepinnt → ungedeckelt → **pixel-/byte-identisch** zur Referenz.

## 6. Ehrliche Decke (Grenzen des Ziels)
„Exakt gleiches Bild auf jedem Gerät" ist mit WebGL physikalisch nicht vollständig erreichbar (Präzision `highp` vs. `mediump`, Float→Byte-Wind-Fallback, mediump-Heatmap-Banding). Erreichbar ist **gleiche Partikeldichte + gleiche Bewegung** (dt-normalisiert, s. `performance-2d.md` §2) + **konsistente Flüssigkeit**. Auf wirklich schwacher GPU (Adreno 3xx, Mali-400) hält selbst der niedrigste FPS-Tier die volle Partikelzahl evtl. nicht bei 30 fps → dort thermisches Ruckeln bei voller Zahl möglich. Das ist der bewusst akzeptierte Trade der Entscheidung (Parität der Zahl > Parität der Framerate).

## 7. Verifikation
Protokoll **V-PARITY** in `tests.md` (Partikelzahl-Gleichstand Desktop↔Mobile, FPS-Abbau statt Partikel-Abbau, dt-normalisierte Bewegung unverändert, Desktop byte-identisch, Governor-Harness grün). 🔴 Real-Device-Pflichtcheck: iPhone 12 Pro **und** ein schwaches Android.

## 8. Doku-Altlast (Nebenbefund)
`context.md` (Stack-Abschnitt) nennt „Three.js, WebGPU-Pfad, RepaintScheduler, AdaptiveQualityController, FixedTimestepLoop" — sämtlich ohne Code-Entsprechung für die 2D-Karte. Die governor-bezogenen Falschangaben werden im Zuge dieses Vorhabens korrigiert; die Three.js/WebGPU-Angaben bleiben zur Klärung mit Jan markiert (betreffen die 3D-Globus-Doku, nicht dieses Vorhaben).

---

## 9. Umsetzung & Verifikation (Gate GP)

**Umgesetzt am 2026-07-18 auf `main` (keine Branch).** Reine Frame-Scheduling-/Governance-Logik — kein Shader-/RGBA8-/Float-Target-/Fusion-Eingriff (harte Regeln §5 eingehalten, Diff-Beleg: nur `perfGovernor.ts`, `WindLayer.ts`, `scripts/verify-governor.mjs` berührt; `MapView.tsx` unverändert außer P-4-Bestätigung).

### 9.1 Was geändert wurde
- **P-1** `WindLayer.getEffectiveParticleCount()`: `governor.quality`-Multiplikator entfernt. Ergebnis = `min(_numParticles, floor(_numParticles × frac(zoom)))`. `frac(zoom)` (zoom-abhängige, geräte-unabhängige Ausdünnung) bleibt → bricht die Parität nicht.
- **P-2** `FrameGovernor` um einen **FPS-Ziel-Modus** erweitert (`fpsLadder`, `downFactor`/`upFactor`). Level → FPS-Tier statt Partikel-Multiplikator; Schwellen **relativ zum aktiven FPS-Ziel** (down > 1,3×`1000/zielFps`, up < 0,9×). Hysterese/Cooldown/Warmup unverändert. In `WindLayer`:
  - Mobil (coarse pointer / `maxParticleFps > 0`): Governor im FPS-Modus, Leiter `[20, 24, 30]`, Start am Top-Tier (30). `governorDrivesFps = true`.
  - Desktop (fine pointer / uncapped): Legacy-Governor, gepinnt; `maxParticleFps` bleibt 0. `governorDrivesFps = false`.
  - **Messgröße korrigiert:** Der Governor wird **nach** den Partikel-Pässen mit der **tatsächlich gemessenen Render-Dauer** (`performance.now()` um Heatmap+Trail+Advektion) gefüttert — **nicht** mehr mit dem gecappten Wall-Clock-Intervall `dtMs`. Damit kann der aktive FPS-Cap den Governor nicht selbst nach unten treiben (Pitfall 1 vermieden).
  - Pro Frame wird `maxParticleFps = governor.targetFps` gesetzt (dynamischer Cap statt statischem `coarsePointer?30:0`).
- **P-3** `scripts/verify-governor.mjs`: 8 neue deterministische Checks für den FPS-Ziel-Modus (F1–F7), kein Vitest, Node-strip-types. Legacy-Checks unverändert.
- **P-4** `MapView.tsx:584` DPR-Cap 1,5 **bestätigt unverändert**.

### 9.2 Verifikationsprotokoll V-PARITY
Setup: `npm run dev` (Port 5180), Chrome DevTools MCP. Desktop-Viewport 1600×717 DPR 1 (fine pointer) vs. iPhone 12 Pro emuliert 390×844 DPR 3 (coarse pointer, unter Emulation neu geladen, damit `MapView` `coarsePointer=true` bei Konstruktion liest). Beide Sessions bei Zoom 5,3.

| V-PARITY | Beleg | Status |
|----------|-------|--------|
| 1. Partikelzahl-Gleichstand (Dichte) | Desktop `_numParticles`=4225 @1,1472 MPix → **3683 Part./MPix**; Mobile `_numParticles`=1225 @0,3292 MPix → **3722 Part./MPix**; Verhältnis **1,011** (~1 %, Rundung/Clamp). Beide ≈ baseDensity 3600. **Wichtig:** beide Geräte klassifizieren als GPU „weak" (Intel UHD via ANGLE) — vor Phase P hätte der Governor auf „weak" die Zahl gedrosselt; jetzt nicht mehr. `getEffectiveParticleCount()` = `floor(_numParticles × 0,867)` auf beiden (Desktop 3663, Mobile 1062), GPU-klassen-unabhängig. | ✅ |
| 2. FPS-statt-Partikel | Mobile perfState: `drivesFps=true`, `targetFps=30`, `maxParticleFps=30`, Top-Tier (level 2/2). Governor-Harness F1/F3: Render-Dauer 45 ms → 24 fps, 80 ms → 20 fps, **`_numParticles` in beiden Fällen unangetastet**. Der Einbruch senkt nachweislich die FPS-Leiter, nicht die Zahl. | ✅ (Mechanik); 🔴 Live-Stepping real-device |
| 3. Bewegungs-Parität (dt-normalisiert) | `frameDtScale`-Pfad (`WindLayer:1085`, Advektion + Trail-Fade) unverändert — kein Eingriff. Trail-Länge/Tempo bleiben über FPS-Wechsel konstant (per Konstruktion). | ✅ (Code); 🔴 visuell real-device |
| 4. Desktop-Referenz byte-identisch | perfState Desktop: `drivesFps=false`, `maxParticleFps=0`, `targetFps=0`, Level 3 (Top, quality 1.0). `getEffectiveParticleCount` ohne `q`-Faktor. Cap-Pfad inaktiv → Verhalten unverändert. | ✅ |
| 5. Governor-Harness | `npm run verify:governor` → **27/27 PASS** (19 Legacy + 8 FPS-Modus). | ✅ |
| 6. Konsole/Typecheck | Desktop + Mobile: **keine** neuen Errors/Warnings. `npm run typecheck` grün. | ✅ |
| 7. Real-Device (Pflicht) | iPhone 12 Pro **und** schwaches Android: volle Partikelzahl bei geregelter FPS, thermisches Verhalten ≥ 90 s. Emulator-`ema`=0 bestätigt: rAF gedrosselt → FPS-Stepping/Thermik **nicht** emulator-belastbar. | 🔴 **an Jan übergeben** |

### 9.3 Selbstverifikation (CLAUDE.md §Selbstverifikation) — schriftlich
1. **Funktioniert jede Funktion nach der Phase noch?** Ja. Geändert wurde nur die *Governance*: (a) Partikel-Ausdünnung durch GPU-Tier entfällt (bewusst, Parität), (b) der Wind-FPS-Cap wird dynamisch statt statisch gesetzt. Heatmap, Trails, Advektion, `reduceMotionOnMove`, Globus-Pfad (`globeMode` → kein FPS-Modus), Zoom-Ausdünnung (`frac`) unverändert. Beleg: Wetterkarte lädt und rendert Wind auf Desktop & Mobile ohne Fehler.
2. **Desktop pixelgleich?** Ja. Fine-Pointer bleibt im Legacy-Modus gepinnt, `maxParticleFps=0` (ungedeckelt), Partikelzahl ohne `q`-Faktor = volle Zahl. Der einzige desktop-wirksame Pfad (der alte `quality`-Multiplikator) lag im Referenzzustand ohnehin bei 1.0. Beleg: perfState `drivesFps=false/maxParticleFps=0/level 3`.
3. **Touch-Targets ≥ 44 px?** Nicht betroffen — reine Render-Loop-/Governance-Änderung, kein UI/DOM-Eingriff.
4. **Konsole frei von neuen Errors/Warnings?** Ja, Desktop und Mobile (MCP `list_console_messages` leer).
5. **Interaktion ohne Long Tasks > 200 ms?** Im Emulator nicht belastbar (rAF gedrosselt, `ema`=0). Die Änderung *reduziert* Last (dynamischer FPS-Cap ≤ statischer 30). 🔴 Real-Device-Trace an Jan.

**Fazit Gate GP:** Alle emulator-prüfbaren Punkte grün; FPS-Stepping/Thermik als Pflicht-Real-Device-Check (iPhone 12 Pro + schwaches Android) an Jan übergeben. Screenshot-Beleg: `audit/screenshots/wetterkarte/parity/mobile-iphone12pro-fps-mode.png`.
