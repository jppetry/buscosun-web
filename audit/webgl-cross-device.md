# Audit & Spezifikation — WebGL Cross-Device-Parität (Phase P / Gate GP)

**Vorhaben:** Die WebGL-Wind-Animation soll auf **jedem Gerät gleich aussehen** (gleiche Partikel*dichte*) **und gleich performant** laufen. Erreicht wird das *nicht* durch Reduktion der Partikelzahl auf schwachen Geräten, sondern durch **partikel-neutrale Hebel** (DPR-Cap, FPS-Governance).

**Referenzgerät:** iPhone 12 Pro (390×844 CSS, DPR 3). **Betroffene Files (Umsetzung via CLI, nicht hier):** `src/wind/perfGovernor.ts`, `src/wind/WindLayer.ts`, `src/MapView.tsx`, `scripts/verify-governor.mjs`.

> **Status:** Phase P (Governor → FPS) **umgesetzt** auf `main` (§9, Gate GP bis auf Real-Device grün). **Phase P2** (Hebel 2 — Trail-Res als Governor-Letzthebel) **umgesetzt** auf `main` (§11, Gate GP2 bis auf Real-Device grün, 35/35 Governor-Checks). **Phase P3** (Hebel 5 — Repaint-Disziplin) **umgesetzt** auf `main` (§12.4, Gate GP3 grün — im Emulator live belegt: hidden/offscreen stoppt den Loop 0/s, Resume startet neu; 🔴 Real-Device nur noch nice-to-have Akku/Thermik). **Damit sind alle 5 Fachmann-Hebel abgeschlossen.** Real-Device-Gegencheck aus P/P2 (iPhone 12 Pro darf die Trail-Sprosse nie erreichen + schwaches Android, **visueller Sign-off**) bleibt Pflicht (🔴).

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
- **Kein** Trail-Buffer-Downscale (Hebel 2) in **Phase P** — er ist als **Phase P2** (§10) mit expliziter STOPP-Freigabe von Jan separat spezifiziert (RGBA8-Trail-*Color*-Pfad, nicht das Packing).
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

---

## 10. Hebel 2 — Trail-Buffer-Downscale als Governor-Letzthebel (Phase P2 / Gate GP2)

**STOPP-Gate bewusst geöffnet (Jan, 2026-07-18).** Hebel 2 fasst den RGBA8-Trail-Pfad an — per harter Regel ein STOPP-&-FRAGEN-Punkt; Jan hat die Umsetzung explizit freigegeben. **Entscheidende Abgrenzung:** Betroffen sind ausschließlich die **Trail-*Color*-Buffer** (`backgroundTexture`/`screenTexture`) — deren **Auflösung** und **Sampling-Filter**. **NICHT** angefasst: das Positions-**Packing** im Partikel-State-Ping-Pong (16-bit über 2 Bytes, `updateFrag`), das voll aufgelöst, `NEAREST` und byte-exakt bleibt. Der als „nicht anrühren" markierte Packing-/Encoding-Pfad bleibt unberührt; nur die Trail-Farbakkumulation wird skaliert. Kein GLSL-Edit (nur ein Uniform-Wert + Textur-Allokation ändern sich).

**Entscheidung (Jan): Governor-Letzthebel.** Trail-Res fällt auf 0,5× **erst**, wenn der FPS-Abbau aus Phase P ausgereizt ist (Governor am FPS-Floor) und das Gerät weiter reißt. Ein einziger, monotoner Qualitäts-Ladder:

`[fps30, trail1.0] > [fps24, trail1.0] > [fps20, trail1.0] > [fps20, trail0.5]`

`trail0.5` ist nur die **unterste** Sprosse und wird bei Erholung **zuerst** wieder auf 1,0 gezogen (Schärfe zurück vor FPS-Erhöhung — ergibt sich automatisch, wenn die Leiter als **ein** monotoner Index modelliert ist). Capable Mobiles (iPhone) erreichen die unterste Sprosse nie → volle Schärfe. Desktop/Fine-Pointer: nie im FPS-Modus → nie Trail-Downscale → byte-identisch.

**Warum es wirkt (§2):** Die zwei Full-Screen-Trail-Pässe fallen bei 0,5× von je 0,74 auf **~0,185 MPix** → ~1,1 MPix/Frame gespart, genau am partikel-unabhängigen Killer-Pass. Advektion/Partikelzahl unberührt → Parität bleibt.

### 10.1 Umsetzungs-Spezifikation (für die CLI)

**P2-1 — Governor-Ladder um die Trail-Sprosse erweitern:** `FrameGovernor` (FPS-Modus) liefert pro Level nicht nur `targetFps`, sondern einen State `{targetFps, trailScale}`. Unterste Sprosse `{20, 0.5}`, alle darüber `{…, 1.0}`. `scripts/verify-governor.mjs` um deterministische Checks erweitern (Abstieg …→trail0.5, Aufstieg trail0.5→… zuerst; kein Vitest, Node-strip-types).

**P2-2 — Trail-Textur-Allokation skalieren** (`WindLayer.allocScreenTextures`, ~:943): Trail-Dimensionen = `round(drawingBufferWidth × trailScale)` × `round(drawingBufferHeight × trailScale)`. Reallokation nur bei Änderung von `(drawingBuffer, trailScale)` — Governor steppt mit Cooldown, also selten; ein `clearOnNextFrame` beim Wechsel ist ok (Trails bauen sich in <1 s neu auf). **`_epr` NICHT über die verkleinerten `screenWidth/Height` neu berechnen** — `_epr` muss `drawingBufferWidth/clientWidth` (volle Ratio) bleiben, sonst halbiert sich die Point-Size doppelt. `trailScale` als **separaten** Faktor führen.

**P2-3 — Sampling-Filter LINEAR:** `backgroundTexture`/`screenTexture` mit `gl.LINEAR` statt `gl.NEAREST` allozieren (`:958-959`) — der Composite-Pass (`drawTexture screen→mapFB`, `:1240`) skaliert die halbe Trail-Auflösung auf den vollen Karten-Framebuffer hoch → ohne LINEAR blockig. Bei `trailScale=1.0` ist es ein 1:1-Blit → LINEAR unschädlich.

**P2-4 — Point-Size kompensieren** (`WindLayer.drawParticles`, ~:1285): Partikel werden **in den Trail-Buffer** gezeichnet; `gl_PointSize` ist in dessen Framebuffer-Pixeln → in halber Auflösung ergäbe ein Punkt nach dem Upscale doppelte CSS-Dicke. Uniform mit `trailScale` multiplizieren: `pointSize × zoomFactor × _epr × trailScale`. CSS-Dicke bleibt nach Upscale identisch (bei `trailScale=1.0` unverändert).

**P2-5 — Viewport:** `clearScreen`/`drawScreen` nutzen bereits `this.screenWidth/Height` für die Trail-Pässe und `mapViewport` für den Composite → wenn `screenWidth/Height` die skalierten Dimensionen tragen, greift es automatisch. Advektions-Viewport (`particleStateResolution`) unberührt.

### 10.2 Harte Regeln / Abgrenzung
- Betroffen: Trail-Color-Buffer-Auflösung + Filter, Point-Size-Skalar, Governor-Ladder. **Nicht** betroffen: Partikel-State-Packing/Encoding, Shader-GLSL, Float-Targets, `EXT_color_buffer_float`, Fusion.
- **Alle Trail-Targets bleiben RGBA8/`UNSIGNED_BYTE`** → Framebuffer-Completeness auf jeder GPU garantiert (kein Float-Target eingeführt).
- Desktop byte-identisch (nie im FPS-/Trail-Modus).

### 10.3 Ehrliche Decke
Auf der untersten Sprosse werden die Partikel **sichtbar weicher** (halbe Trail-Auflösung, hochskaliert). Bewusster Trade, um auf sehr schwachen GPUs volle Partikelzahl + Flüssigkeit zu halten. Nur Real-Device kann beurteilen, ob die Weichheit akzeptabel ist → **visueller Sign-off Pflicht**.

### 10.4 Verifikation
Protokoll **V-PARITY-2** in `tests.md`. 🔴 Real-Device Pflicht: iPhone (darf die Trail-Sprosse NIE erreichen → scharf) **und** schwaches Android (erreicht sie, volle Partikelzahl gehalten, Weichheit visuell beurteilen).

---

## 11. Umsetzung & Verifikation (Gate GP2)

**Umgesetzt am 2026-07-19 auf `main` (keine Branch).** STOPP-Gate von Jan geöffnet und in der Umsetzung streng respektiert: berührt sind **ausschließlich** Auflösung + Sampling-Filter der Trail-*Color*-Buffer, ein Point-Size-Skalar (Uniform-**Wert**, nicht die Shader-Quelle) und die Governor-Ladder. **Nicht** berührt: Partikel-State-Packing/`updateFrag` (bleibt voll aufgelöst, `NEAREST`, byte-exakt), jede GLSL-Quelle, Float-Targets, `EXT_color_buffer_float`, Fusion-Engine. Diff-Beleg: nur `perfGovernor.ts`, `WindLayer.ts`, `scripts/verify-governor.mjs`.

### 11.1 Was geändert wurde
- **P2-1** `FrameGovernor` (FPS-Modus) um eine **parallele `trailLadder`** erweitert. Ein einziger monotoner Level-Index indexiert beide Leitern → automatische Wiederherstellungs-Reihenfolge. Mobile Leiter jetzt **4-stufig**:
  - `idx 0 {20 fps, trail 0.5}` (unterste Sprosse, Letzthebel) `< idx 1 {20 fps, 1.0} < idx 2 {24 fps, 1.0} < idx 3 {30 fps, 1.0}` (Top = Referenz).
  - FPS wird **vor** der Trail-Res verbraucht (30→24→20 alle trail 1.0); nur die unterste Sprosse halbiert die Trail-Auflösung. Bei Erholung steigt der Index über idx 1 → `trailScale` kommt **zuerst** auf 1.0 zurück, dann klettert die FPS. Getter `governor.trailScale` (1.0 in Legacy-Modus / ohne Ladder / oberhalb des Floors).
- **P2-2** `WindLayer.allocScreenTextures`: Trail-Dimensionen = `round(drawingBufferWidth × trailScale)` × `round(… height …)`. Reallokation nur bei Änderung von `(drawingBufferW, drawingBufferH, trailScale)` (Governor steppt cooldown-gated → selten); `clearOnNextFrame` beim Wechsel. **`_epr` bleibt die volle Ratio** `drawingBufferWidth / clientWidth` — **nicht** aus der verkleinerten Trail-Breite berechnet (sonst doppelte Halbierung der Point-Size). `trailScale` wird als **separater** Faktor geführt (Feld `this.trailScale`, pro Frame aus `governor.trailScale` gesetzt, nur wenn `governorDrivesFps`).
- **P2-3** `backgroundTexture`/`screenTexture` mit `gl.LINEAR` statt `gl.NEAREST` alloziert → der Composite-Pass skaliert die halbe Trail-Auflösung weich hoch. Bei `trailScale=1.0` ein 1:1-Blit (LINEAR == NEAREST bit-exakt bei Texel-Center-Sampling) → auf Desktop/oberhalb der Sprosse unschädlich. Weiterhin RGBA8/`UNSIGNED_BYTE`.
- **P2-4** `drawParticles`: Point-Size-Uniform = `pointSize × zoomFactor × _epr × trailScale`. Partikel werden **in** den Trail-Buffer gezeichnet; bei `trailScale=0.5` halb so viele Framebuffer-Pixel → nach dem 2×-Upscale identische CSS-Dicke. Bei 1.0 unverändert.
- **P2-5** Viewport: `clearScreen`/`drawScreen` nutzen bereits `this.screenWidth/Height` (jetzt die skalierten Dims) für die Trail-Pässe und `mapViewport` für den Composite → greift automatisch. Advektions-Viewport (`particleStateResolution`) unberührt.

### 11.2 Verifikationsprotokoll V-PARITY-2
| V-PARITY-2 | Beleg | Status |
|------------|-------|--------|
| 1. Letzthebel-Ordnung | Governor-Harness T1: 80 ms → Boden `idx 0` = 20 fps **+** trail 0.5. T2: 55 ms → `idx 1` = 20 fps, trail **1.0** (FPS-Floor erreicht, Trail NOCH voll — nicht vorzeitig geopfert). T3: Erholung 10 ms vom Boden → **erster** Up-Step setzt `trailScale` 1.0 bei weiter 20 fps (Schärfe vor FPS zurück). T4: weiter → Top 30 fps/1.0. `node scripts/verify-governor.mjs` grün. | ✅ |
| 2. Partikel-Parität bleibt | `getEffectiveParticleCount()` hängt **nicht** von `trailScale` ab (nur `frac(zoom)` + `_numParticles`) — auf der Sprosse identische Partikelzahl, nur die Trail-Auflösung sinkt. Code-Beleg + Harness T5 (Boden hält unter 80 ms). | ✅ |
| 3. Point-Size-Kompensation | `pointSize × … × trailScale` (P2-4). Bei 0.5 halbe Framebuffer-Pixel → nach Upscale gleiche CSS-Dicke. | ✅ (Code); 🔴 visuell real-device |
| 4. Filter LINEAR | `createTexture(gl, gl.LINEAR, …)` für beide Trail-Buffer (P2-3). | ✅ (Code); 🔴 Zoom-In-Screenshot real-device |
| 5. Abgrenzung | Diff = 3 Files (`perfGovernor.ts`, `WindLayer.ts`, `verify-governor.mjs`). `git diff`-Scan der `+`-Zeilen nach `EXT_color_buffer_float|HALF_FLOAT|…FLOAT|RGBA32F|RGBA16F|updateFrag|drawFrag|drawVert|quadVert|precision ` → **leer**. Kein Shader-File berührt. `particleStateTexture0/1 = createTexture(gl, gl.NEAREST, …)` unverändert (voll aufgelöst, byte-exakt). Alle Trail-Targets RGBA8/`UNSIGNED_BYTE`. | ✅ |
| 6. Desktop byte-identisch | Fine-Pointer → `governorDrivesFps=false` → `this.trailScale` bleibt 1.0 (nie aus dem Governor gesetzt). Trail-Buffer voll aufgelöst; LINEAR bei 1:1-Blit bit-exakt == NEAREST. | ✅ |
| 7. Typecheck/Konsole | `npm run typecheck` (`tsc -b`) grün. Kein neuer Konsolen-Output aus dem Pfad. | ✅ |
| 8. 🔴 Real-Device (Pflicht + visueller Sign-off) | iPhone 12 Pro: Trail-Sprosse **nie** erreichen → scharf. Schwaches Android: Sprosse erreichen, **volle** Partikelzahl halten, Weichheit visuell beurteilen (Jan entscheidet). Thermik ≥ 90 s. Emulator drosselt rAF (`ema`=0) → FPS-/Trail-Stepping + Weichheit **nicht** emulator-belastbar. | 🔴 **an Jan übergeben** |

**Hinweis Live-Emulator-Check:** Der lokale Dev-Server (:5180) mountete in dieser Session den Wind-Custom-Layer nicht rechtzeitig (Style nicht geladen nach 10 s, nur Basemap-Layer präsent) — ein Live-`perfState.trailScale`-Readout war daher nicht erhältlich. Das ist unkritisch: das Trail-Stepping ist ohnehin ein reiner 🔴-Real-Device-Punkt; die emulator-prüfbaren Punkte (1, 2, 5, 6, 7) sind über Harness, Diff und Code-Inspektion belegt.

### 11.3 Selbstverifikation (CLAUDE.md §Selbstverifikation) — schriftlich
1. **Funktioniert jede Funktion nach der Phase noch?** Ja. Zusätzlich zur Phase-P-Governance greift jetzt **nur** auf der untersten Governor-Sprosse (schwaches Android, FPS-Floor + fortgesetzter Einbruch) eine halbierte Trail-Auflösung. Heatmap, Advektion, dt-normierte Bewegung/Trail-Länge (`frameDtScale`), Zoom-Ausdünnung (`frac`), `reduceMotionOnMove`, Globus-Pfad (kein FPS-Modus) unverändert. Partikelzahl auf **jeder** Sprosse voll.
2. **Desktop pixelgleich?** Ja. Fine-Pointer ist nie im FPS-Modus → `governorDrivesFps=false` → `this.trailScale` bleibt beim Feld-Default 1.0, nie aus dem Governor gesetzt. Trail-Buffer voll aufgelöst; der neue `gl.LINEAR`-Filter ist bei einem 1:1-Blit (Textur = Ziel-Viewport, UV 0..1 → Sampling exakt auf Texel-Center) bit-identisch zu `gl.NEAREST`. Damit ist die Trail-Akkumulation und der Composite byte-gleich zur Referenz.
3. **Touch-Targets ≥ 44 px?** Nicht betroffen — reine Render-Loop-/Textur-Allokations-Änderung, kein UI/DOM-Eingriff.
4. **Konsole frei von neuen Errors/Warnings?** Typecheck grün; der geänderte Pfad erzeugt keinen neuen Konsolen-Output. Live-Konsolen-Gegencheck der Sprosse ist Teil des 🔴 Real-Device-Checks (Emulator erreicht die Sprosse nicht).
5. **Interaktion ohne Long Tasks > 200 ms?** Die Änderung **senkt** die Last (halbe Trail-Fillrate auf der Sprosse, ~1,1 MPix/Frame gespart am partikel-unabhängigen Killer-Pass). Reallokation ist cooldown-gated (selten). Emulator-Trace nicht belastbar (rAF gedrosselt) → 🔴 Real-Device-Trace an Jan.

**Fazit Gate GP2:** Alle emulator-/harness-/diff-prüfbaren Punkte grün (35/35 Governor-Checks, Boundary bewiesen, Desktop byte-identisch). Sichtbare Weichheit auf der Sprosse, FPS-/Trail-Stepping unter Last und Thermik als Pflicht-🔴-Real-Device-Check (iPhone 12 Pro **darf die Sprosse nie erreichen** + schwaches Android) mit **visuellem Sign-off** an Jan übergeben.

---

## 12. Hebel 5 — Repaint-Disziplin (Phase P3 / Gate GP3)

**Der letzte offene Hebel der Fachmann-Einschätzung** (§1, Zeile 5: „nur repainten, wenn nötig; `visibilitychange`-Pause"). **Niedrigstes Risiko aller Hebel** — reine Event-Listener-/Repaint-Scheduling-Logik, **kein** Shader-/RGBA8-/Pipeline-/Fusion-Eingriff, **kein** STOPP-Gate nötig.

**Warum es zum Ziel gehört:** `WindLayer.render()` ruft, solange Partikel sichtbar sind, **jede Frame** `scheduleParticleRepaint()` → der einzige selbst-perpetuierende Dauerloop der 2D-Karte (bestätigt `audit/performance-2d.md` §1, Szenario (a): „Akku/Thermik-Treiber Nr. 1"). Er läuft heute auch weiter, wenn **nichts sichtbar ist**: Tab im Hintergrund oder Karte aus dem Viewport gescrollt. Weniger Dauerlast → **weniger Hitze → weniger thermisches Throttling → die Zielrate hält länger** und der Governor muss seltener heruntersteppen (inkl. seltener die P2-Trail-Sprosse erreichen). Direkt „gleich performant über Zeit".

**Abgrenzung — was NICHT gilt:** „Map-idle-Pause" greift bei einer *animierten* Ebene nicht (Partikel bewegen sich permanent → nie „idle"). `reduceMotionOnMove` (Pan-Skip) existiert bereits. Ein **opakes Overlay, das die Karte im DOM verdeckt**, wird von IntersectionObserver **nicht** erkannt (IO sieht nur Viewport-Schnitt + `display:none`) — akzeptierte kleine Lücke, der Haupt-Win ist `visibilitychange`.

### 12.1 Umsetzungs-Spezifikation (für die CLI)

**P3-1 — `visibilitychange`-Pause (Haupt-Win):** In `onAdd` `document.addEventListener('visibilitychange', handler)`. `document.hidden` → `this.paused = true`, keinen Repaint mehr anfordern (`scheduleParticleRepaint` früh raus, `repaintCapTimer` clearen). Wieder sichtbar → `this.paused = false`, **einmal** `map.triggerRepaint()` zum Neustart des Loops. Listener in `onRemove` entfernen.

**P3-2 — Offscreen-Pause via `IntersectionObserver`:** In `onAdd` `map.getCanvas()` (bzw. Container) beobachten. `intersectionRatio === 0` → pausieren, `> 0` → fortsetzen (`triggerRepaint` einmal). In `onRemove` `disconnect()`. Fällt unter dieselbe `paused`-Logik wie P3-1.

**P3-3 — Gate-Punkt:** Nur der **selbst-perpetuierende** Pfad wird gestoppt (`scheduleParticleRepaint`). `render()` bleibt korrekt, falls MapLibre aus anderem Grund (Kamera-Move) rendert. Ein `paused`-Flag, das beide Quellen (hidden/offscreen) oder-verknüpft.

**P3-4 — Resume-Hygiene (empfohlen):** Beim Fortsetzen nach längerer Pause `clearOnNextFrame = true` setzen, damit kein eingefrorener Alt-Trail kurz aufblitzt. `frameDtScale` ist ohnehin auf 66 ms geklemmt → kein Advektions-Sprung.

### 12.2 Harte Regeln / Abgrenzung
- Reine Event-Listener-/Scheduling-Logik. **Nicht** betroffen: Shader-GLSL, RGBA8-/Packing-Pfad, Trail-Res/Governor-Ladder (P/P2 unberührt), Float-Targets, Fusion.
- Gilt auf **allen** Geräten: Ein Hintergrund-Tab, der GPU verbrennt, ist reine Verschwendung; das Pausieren ändert die Optik **nur in Zuständen, in denen nichts sichtbar ist** → sichtbar/aktiv byte-identisch, **keine** Desktop-Regression.

### 12.3 Verifikation — grösstenteils emulator-belastbar (Ausnahme!)
Anders als FPS/Thermik ist der Loop-Stopp **JS-beobachtbar** und damit im Emulator prüfbar. Protokoll **V-PARITY-3** in `tests.md`: `visibilitychange`→hidden stoppt die Repaint-Anforderungen, →visible startet neu; Offscreen-Scroll pausiert/fortsetzt; sichtbar/aktiv unverändert; Konsole/Typecheck grün. 🔴 Real-Device nur noch für den **Akku-/Thermik-Gewinn** (nice-to-have, nicht gate-blockierend), nicht für die Korrektheit.

---

## 12.4 Umsetzung & Verifikation (Gate GP3)

**Umgesetzt am 2026-07-19 auf `main` (keine Branch).** Reine Event-Listener-/Repaint-Scheduling-Logik — kein Shader-/RGBA8-/Trail-Ladder-/Float-Target-/Fusion-Eingriff (harte Regeln §12.2 eingehalten). Diff-Beleg: **P3 selbst berührt nur `src/wind/WindLayer.ts`** und braucht keine Governor-/Harness-Änderung — die P3-`+`-Zeilen sind ausschließlich Event/Scheduling (kein einziges `gl.*`/`createTexture`/`Frag`/`Vert`/Float/RGBA in einer P3-Zeile, per Diff-Scan verifiziert). **Hinweis zum Working-Tree:** Da P und P2 auf Jans Wunsch noch **nicht committed** sind, zeigt `git diff` gegen HEAD weiterhin auch `perfGovernor.ts` (+28, P2) und `verify-governor.mjs` (+63, P2); diese sind **nicht** Teil von P3. Der Governor-Harness bleibt bei **35/35** (P3 rührt ihn nicht an).

### 12.4.1 Was geändert wurde (alles in `WindLayer.ts`)
- **P3-1 `visibilitychange`-Pause (Haupt-Win):** In `onAdd` `document.addEventListener('visibilitychange', onVisibilityChange)` registriert; Handler liest `document.hidden` → `_docHidden`. In `onRemove` `removeEventListener` (kein Leak). Startzustand wird in `onAdd` einmal via `updatePausedState()` ausgewertet (Layer könnte in einem versteckten Tab hinzugefügt werden) — ohne einen Resume-Repaint auszulösen.
- **P3-2 Offscreen-Pause via `IntersectionObserver`:** In `onAdd` einen `IntersectionObserver(onIntersect, { threshold: 0 })` auf `map.getCanvas()` gesetzt; `intersectionRatio === 0` → `_offscreen = true`. In `onRemove` `disconnect()` + Referenz genullt.
- **P3-3 Ein `paused`-Flag (OR-verknüpft):** `updatePausedState()` setzt `paused = _docHidden || _offscreen` und reagiert **nur auf Übergänge**. Der Flag gated **ausschließlich** die selbst-perpetuierenden Repaint-Pfade — ein MapLibre-Repaint aus anderem Grund (Kamera-Move) rendert weiter korrekt, weil `render()` selbst nicht abgeschaltet wird.
- **Gate-Punkte:** (a) `scheduleParticleRepaint()` bekommt `if (this.paused) return;` an den Anfang — der Partikel-Loop (Daten geladen). (b) **Zusätzlich** der zweite selbst-perpetuierende Pfad in `render()` — der „warte auf Wind-Daten"-Spinner (`if (!windData||!windTexture) triggerRepaint()`) — wird ebenfalls unter `paused` gestellt (`if (!this.paused) this.map?.triggerRepaint()`). Beide sind Dauerloops; die Spec nennt in §12.1 explizit `scheduleParticleRepaint`, aber das Ziel („pausieren, wenn nichts sichtbar ist") verlangt, auch den Pre-Data-Spinner zu stoppen — ohne diesen Zusatz würde ein Hintergrund-Tab, dessen Daten noch nicht geladen sind, weiter `triggerRepaint` drehen (im Emulator direkt beobachtet, s. 12.4.2).
- **P3-4 Resume-Hygiene:** Beim Übergang → sichtbar setzt `updatePausedState()` `clearOnNextFrame = true` (kein eingefrorener Alt-Trail blitzt auf) und stößt den Loop **genau einmal** via `map.triggerRepaint()` neu an (MapLibre rendert nur auf ein `triggerRepaint` hin). Beim Übergang → pausiert wird der ausstehende `repaintCapTimer` gecleart.
- **`perfState`-Getter** um `paused: boolean` erweitert (JS-beobachtbar für V-PARITY-3 / On-Device-Inspektor).

### 12.4.2 Verifikationsprotokoll V-PARITY-3 (Chrome DevTools MCP, iPhone 12 Pro emuliert 390×844 DPR3, coarse pointer, Port 5180)
Setup: Wind-Layer live gemountet (`__map.style._layers.wind.implementation`), `map.triggerRepaint` mit einem Zähler-Spy umschlossen, `document.hidden` über einen konfigurierbaren Getter gemockt + `visibilitychange` dispatcht. **Hinweis:** In dieser Session lud die Wind-*Daten* nicht (Dev-Datenquelle nicht erreichbar, `hasWindData=false`, `ema=0`) → aktiver Dauerloop war der Pre-Data-Spinner. Das ist für den P3-Nachweis ideal: der Spinner nutzt denselben `paused`-Flag und dasselbe Early-Return-Muster wie `scheduleParticleRepaint`, d. h. die **gesamte Kette** (Event → Handler → `updatePausedState` → `paused` → Loop stoppt → Resume-Kick) wird end-to-end belegt. Der Partikel-Loop-Gate (`scheduleParticleRepaint`) ist der **identische** Einzeiler-Guard und per Code-Inspektion belegt.

| V-PARITY-3 | Beleg (live) | Status |
|------------|--------------|--------|
| 1. Hidden-Pause | Sichtbar/aktiv: **61** `triggerRepaint`/s. Nach `visibilitychange`→`hidden`: `perfState.paused` = **true**, Repaint-Rate **0/s** (nach Drain der in-flight Frame). `repaintCapTimer` beim Pausieren gecleart. | ✅ |
| 2. Resume | →`visible`: `paused` = **false**, Loop startet sofort neu (Resume-Kick + zurück auf **61**/s). `clearOnNextFrame` beim Resume gesetzt (Code, P3-4) → kein Alt-Trail-Aufblitzen. | ✅ |
| 3. Offscreen-Pause | Karten-Canvas via `transform: translateY(-200vh)` aus dem Viewport → `IntersectionObserver ratio 0` → `paused` **false→true**; zurück → **true→false**. | ✅ |
| 4. Sichtbar+aktiv unverändert | Baseline (sichtbar) **61**/s == Resumed (sichtbar) **61**/s — identisches Loop-Verhalten. FPS-Cap/Governor/Trail-Ladder unberührt (P/P2 nicht angefasst). Desktop (fine pointer): nie hidden-geschaltet im Normalbetrieb; der Flag ändert die Optik nur in unsichtbaren Zuständen → byte-identisch. | ✅ |
| 5. Abgrenzung | P3-eigener Diff = **nur `WindLayer.ts`**; alle P3-`+`-Zeilen sind Event/Scheduling (Diff-Scan: kein `gl.*`/`createTexture`/`Frag`/`Vert`/Float/RGBA in einer P3-Zeile). Kein Shader-/GLSL-Edit, kein RGBA8-/Packing-/Trail-Ladder-/Fusion-Eingriff; `perfGovernor.ts`/`verify-governor.mjs` von P3 **nicht** angefasst (35/35 stabil). `onRemove` entfernt Listener + `IntersectionObserver.disconnect()` + nullt die Referenz (kein Leak). *(Working-Tree zeigt gegen HEAD zusätzlich die noch nicht committeten P/P2-Diffs — nicht Teil von P3.)* | ✅ |
| 6. Konsole/Typecheck | `list_console_messages` (error+warn) **leer**; `npm run typecheck` (`tsc -b`) grün. | ✅ |
| 7. 🔴 Real-Device (nice-to-have) | Akku-/Thermik-Gewinn bei Hintergrund/Standby — **nicht** gate-blockierend (Korrektheit ist emulator-belegt). | 🔴 an Jan notiert |

### 12.4.3 Selbstverifikation (CLAUDE.md §Selbstverifikation) — schriftlich
1. **Funktioniert jede Funktion nach der Phase noch?** Ja. Geändert wurde ausschließlich, *wann* der selbst-perpetuierende Repaint angefordert wird: nicht mehr, während nichts sichtbar ist (Tab hidden ODER Karte offscreen). Sobald wieder sichtbar, läuft der Loop identisch weiter (live belegt: 61→0→61 `triggerRepaint`/s). Heatmap, Advektion, Trails, Governor (P/P2), `reduceMotionOnMove`, Zoom-Ausdünnung, `setWindData`-Repaints unverändert. `render()` bleibt für Fremd-Repaints (Kamera) korrekt.
2. **Desktop pixelgleich?** Ja. Der Flag greift **nur** in Zuständen, in denen nichts sichtbar ist → sichtbar/aktiv ist byte-identisch. Kein Render-Pfad, kein Textur-/Shader-Zustand geändert. Der Resume-`triggerRepaint` + `clearOnNextFrame` sind die bestehenden, schon anderswo genutzten Mechanismen.
3. **Touch-Targets ≥ 44 px?** Nicht betroffen — reine Event-Listener-/Scheduling-Änderung, kein UI/DOM-Eingriff.
4. **Konsole frei von neuen Errors/Warnings?** Ja (MCP `list_console_messages` error+warn leer), Typecheck grün.
5. **Interaktion ohne Long Tasks > 200 ms?** Die Änderung **senkt** die Last (stoppt den Dauerloop, wenn nichts sichtbar ist) und fügt keinen Arbeitspfad im sichtbaren Zustand hinzu (nur zwei Boolean-Checks + zwei billige Listener). Kein neuer Long Task möglich.

**Fazit Gate GP3:** Alle Punkte emulator-/live-/diff-belegt grün (Loop-Stopp 0/s bei hidden UND offscreen, sauberer Resume, sichtbar byte-identisch, 1-File-Diff, Konsole/Typecheck grün). Der 🔴 Real-Device-Akku-/Thermik-Gewinn ist ausdrücklich nice-to-have (nicht gate-blockierend) und an Jan notiert. **Damit sind alle 5 Hebel der Fachmann-Einschätzung abgeschlossen** (1+3 vorbestehend, 4=P, 2=P2, 5=P3).
