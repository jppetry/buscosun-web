# Audit — 2D-Wetterkarte: Rendering-Performance (Laufzeit)

**Feature:** 2D-Wetterkarte (Overview `map2d`)
**Referenzgeräte:** iPhone 12 Pro (390×844, DPR 3, Touch) via Chrome DevTools MCP; Desktop-Profil.
**Ziel:** FPS / Frame-Zeit / Akku-Thermik verbessern — **ohne** angezeigte Daten/Layer/Funktion zu ändern und ohne die visuelle Korrektheit über ein vereinbartes Qualitätsbudget hinaus zu verschlechtern. Reine Render-Loop-/Qualitäts-Governance, **keine** Netz-Aufgabe.

---

## 1. Messmethodik & harte Grenze (ehrlich)

**Die MCP-Emulator-Umgebung liefert KEINE belastbaren Laufzeit-FPS/GPU-Zahlen.** Zwei unabhängige Belege:
- `requestAnimationFrame` ist auf **~1 fps gedrosselt** (Seite meldet `visibilityState:'visible'`, `hasFocus:true`, aber der Compositor ist verdeckt/headless). Der reale 60-fps-Repaint-Loop ist so **nicht live beobachtbar**.
- Der DevTools-Trace meldet für einen `pointerdown` eine **INP von 264 s** (Processing 210 s, Presentation 53 s) — physikalisch unmöglich, ein Artefakt der rAF-/Interaktions-Drosselung. Alle Trace-Zeitmetriken (INP, FPS, GPU-Zeit) sind hier **unbrauchbar**.

Das ist exakt die in `prompt-performance.md`/CLAUDE.md dokumentierte Falle („emulator WebGL is not representative"). **Konsequenz:** Alle FPS-/GPU-/Thermik-Aussagen unten stammen aus **Code-Analyse** (geräteunabhängig) und sind mit **🔴 Real-Device-Check erforderlich** markiert. Belastbar gemessen wird nur reine Main-Thread-JS (deterministisches Scripting, drossel-unabhängig).

### Baseline der drei Szenarien
| Szenario | FPS / GPU | Messbar? | Befund |
|----------|-----------|----------|--------|
| (a) Idle, nur Wind sichtbar | 🔴 nicht messbar | Code | `WindLayer.render()` ruft **jede Frame** `map.triggerRepaint()` (`WindLayer.ts:1144`, nur `showParticles`) → **ungedeckelter 60-fps-Dauerloop**, solange Wind läuft. Idle-Repaints/s auf echtem Gerät ≈ Display-Rate (60/120). Akku/Thermik-Treiber Nr. 1. |
| (b) Alle schweren Layer (Wind+Temp+Niederschlag+Wolken), idle | 🔴 nicht messbar (GPU) | Code | Temp/Niederschlag/Wolken (`ScalarLayer`/`RainLayer`/`CloudLayer`) **self-triggern KEINE** Repaints — sie zeichnen nur bei Kamera-Move oder `setFrame`/`setData` (Repaint-Trigger `ScalarLayer.ts:217`, `RainLayer.ts:253`, `CloudLayer.ts:146`). Der **einzige** Dauerloop bleibt der Wind (a). Zusatzkosten der Scalars fallen nur pro „dirty" Frame an; `RainLayer` ist mit bikubischem 4-Tap (`RainLayer.ts:67-86`) der teuerste Fragment-Shader, `ScalarLayer` zeichnet ein 128×64-Mesh (49 152 Verts). Alle rendern in voller Framebuffer-Auflösung (nur global via DPR-Cap 1,5 gedämpft). **Kein** eigener Auflösungs-/Qualitäts-Regler. |
| (c) Slider-Scrub über den ganzen Bereich | build() ✅ gemessen | JS-Bench | Pro Vorlaufstunde läuft `PrecipCompositor.build()` (`precipComposite.ts:196-219`, Effekt-Aufruf `MapView.tsx:1865`): voller **600×512-Per-Zell-Gather** (307 200 Zellen) + `LUMINANCE`-`texImage2D`-Upload. Reiner Gather-Loop **≈ 2,2 ms Desktop-CPU** (Mikrobench, 30 Läufe), grob **~3–5 ms auf Mobile-CPU**; dazu Upload + React-Re-Render. **Nicht** memoisiert pro `(forecastHour, source)` — Hin-/Her-Scrubben rechnet jede Stunde neu. Slider-Input ist bereits rAF-coalesced (`MapView.tsx:337-347`), Index-Maps sind gecacht. → Kein >200-ms-Long-Task, aber vermeidbare wiederkehrende Kosten. |

---

## 2. Architektur der Render-/Qualitäts-Governance (Ist-Zustand)

- **`FrameGovernor`** (`perfGovernor.ts:129`) ist der einzige implementierte Adaptivregler. Er regelt **ausschließlich die gezeichnete Partikelzahl** (Qualitäts-Multiplikator `[0.4,0.6,0.8,1.0]` → `getEffectiveParticleCount()` `WindLayer.ts:1015`, `drawArrays(POINTS)` `WindLayer.ts:1250`). EMA + Hysterese (down 24 ms/42 fps, up 18 ms), gefüttert pro Frame (`feed` `WindLayer.ts:1089`, dt aus `WindLayer.ts:1070`). Top-Level = 1,0 → Desktop unverändert.
- **`AdaptiveQualityController` existiert NICHT im Code** — der Name steht nur in Doku/Prompts. Der reale Hebel ist `FrameGovernor`; es gibt **keinen** „RepaintScheduler"/„FixedTimestepLoop". „Route durch AdaptiveQualityController" ⇒ praktisch: **`FrameGovernor` erweitern / neue Knöpfe daran koppeln, keinen Bypass bauen.**
- **Advection ist bereits frame-raten-normalisiert:** `frameDtScale = clamp(dtMs,1,66)/16.667` (`WindLayer.ts:1072`) speist `u_dt_scale` (Advektionsschritt, `:1271`), Trail-Fade `pow(fade, dtScale)` (`:1187`) und Sub-Steps `round(dtScale·subSteps)`∈[1,4] (`:1301`). `dtMs` ist auf 66 ms (~15 fps) gedeckelt. **⇒ Ein FPS-Cap ändert Partikel-Geschwindigkeit/Trails NICHT** — die Maschinerie dafür ist schon gebaut (Kommentare: „desktop↔mobile parity").
- **Bestehende, nicht zu regressierende Knöpfe:** DPR-Cap 1,5 mobil (`MapView.tsx:584`), `reduceMotionOnMove`=coarsePointer (`MapView.tsx:710` → skip Partikel-Pässe beim Pan), `upsample`=coarsePointer?1:2 (`MapView.tsx:720`), Partikeldichte-Slider (User), `FrameGovernor`. bz2/GRIB-Decode + Wind-Blend in Workers.

---

## 3. Hebel-Bewertung & Priorisierung

| # | Hebel | Impact | Risiko | Priorität |
|---|-------|--------|--------|-----------|
| **1** | **Wind-Repaint auf ~30 fps deckeln (mobil)** via Frame-Zeit-Gate am `triggerRepaint` (`WindLayer.ts:1144`). Desktop ungedeckelt (identisch). | **Hoch** — halbiert Idle-GPU/Compositor-Last + Wind-Draw-Arbeit auf Mobile → direkter Akku/Thermik-Gewinn (das Kernziel). | **Niedrig** — Advection ist dt-normalisiert (§2), Geschwindigkeit/Trails bleiben; kein Shader-/Packing-Eingriff. | **PRIMÄR** |
| **4** | **`build()` memoisieren** pro `(Frame-Key, Quellen-Signatur)` → Scrub-Revisit rechnet 600×512-Gather + Upload nicht neu. | Mittel-niedrig (~2–5 ms/Tick nur bei Cache-Hit gespart). | Niedrig (reine Memoisierung, gleiche Ausgabe). | SEKUNDÄR |
| 2 | Scalar-Layer-Auflösung/Sampling governen (Temp/Niederschlag/Wolken gröber bei Low-Tier/Pan). | Unklar — Scalars self-repainten nicht (Idle-Kosten 0); Kosten nur pro dirty Frame, bereits DPR-gedeckelt. | **Höher** — braucht FBO-/Auflösungs-Umbau + visuelles Qualitätsbudget/Freigabe. | ZURÜCKGESTELLT (erst wenn Real-Device-Trace Scalar-Draw als Pan-Bottleneck zeigt) |
| 3 | Idle-Stop des Repaint-Loops. | — | — | **= #1** (der Wind-Loop ist der einzige Dauerrepaint; #1 IST der Idle-Fix) |

---

## 4. Plan (Umsetzung)

**#1 — Wind-FPS-Cap (mobil ~30 fps):**
- Neue WindLayer-Option `maxParticleFps` (Default **0 = ungedeckelt** → Desktop byte-identisch), in `MapView` gesetzt auf `coarsePointer ? 30 : 0` (mobil-isoliert, wie `reduceMotionOnMove`/`upsample`).
- In `render()` das unbedingte `triggerRepaint()` (`:1144`) durch ein **Frame-Zeit-Gate** ersetzen: bei Cap>0 nur repainten, wenn seit dem letzten angeforderten Repaint ≥ `1000/cap` ms vergangen sind; sonst **einen** `setTimeout` auf die Restzeit legen, damit der Loop bei der gedeckelten Rate weiterläuft (nicht stehen bleibt). Bei Cap=0 unverändert `triggerRepaint()`.
- Optional an `FrameGovernor` koppeln (Floor-Tier → 30, sonst 60) — zunächst statisch coarsePointer, Governor-Kopplung nur falls nötig.
- Verifizieren: Partikel bewegen sich gleich schnell (dt-Scale), Trails unverändert, keine neuen Konsolen-Fehler. 🔴 Real-Device-FPS/Thermik-Gegencheck.

**#4 — build()-Memoisierung:** Ergebnis-`CompositeFrame` cachen, Key = gewählte Frame-Identität pro Quelle (RV/INCA/rzc/D2-Frame-Zeitstempel) + `forecastHour`-Bucket; Cache-Hit → `setFrame` mit dem gecachten Grid, kein Re-Gather/Upload. Kleiner LRU (Scrub besucht wenige Stunden wiederholt).

**Zurückgestellt:** #2 (Scalar-Governance) — bei Bedarf nach Real-Device-Trace, mit dokumentiertem Qualitätsbudget + Idle-Rückkehr auf volle Qualität.

**Hard Rules eingehalten:** kein Shader-/RGBA8-Packing-Eingriff, kein `EXT_color_buffer_float`, kein Fusion-Eingriff. Nur Frame-Scheduling/Quality-Knöpfe. STOP&ASK, falls #1 wider Erwarten Shader-Änderung bräuchte (tut es laut §2 nicht).

---

## 5. Umsetzung & Vorher/Nachher

**Umgesetzt: nur #1** (Wind-FPS-Cap). **#4 (build()-Memoisierung) NICHT umgesetzt** — messgetriebene Entscheidung: der Gather misst **~2,2 ms Desktop-CPU** (≈3–5 ms Mobile) und liegt damit **unter** dem 16,7-ms-Frame-Budget; die Prompt-Bedingung „*if so* [exceeds the frame budget]" ist nicht erfüllt. Als dokumentierter optionaler Zukunfts-Win vermerkt, nicht spekulativ vorgezogen. **#2/#3** wie in §3 zurückgestellt.

| Metrik | Vorher | Nachher |
|--------|--------|---------|
| Wind-Idle-Repaint (mobil, coarse pointer) | ungedeckelt Display-Rate (Code, `WindLayer.ts:1144`) | Cap **30 fps** via Frame-Zeit-Gate 🔴 Real-Device |
| Partikel-Geschwindigkeit/Trails | Referenz | unverändert (`frameDtScale`-Kompensation, verifiziert im Code) |
| Desktop-Verhalten (fine pointer) | Referenz | **identisch** (`maxParticleFps = 0` → unveränderter `triggerRepaint`-Pfad) |
| Wind rendert / Konsole | — | rendert, **fehlerfrei** (mobil Overview, alle schweren Layer) |
| Layer/Daten/Funktion | — | unverändert |
| Longest Task / FPS / Thermik | 🔴 im Emulator nicht messbar (rAF-Drossel) | 🔴 **Real-Device-Check erforderlich** |

### Verifikations-Notizen
- **Regression:** Overview (mobil) lädt, Wind rendert, Canvas vorhanden, **keine** neuen Konsolen-Fehler/-Warnungen; Typecheck grün.
- **Cap-Logik:** Leading+Trailing-Throttle (sofort repainten, wenn ≥ `1000/cap` ms seit letztem Request; sonst genau EIN `setTimeout` auf die Restzeit → Loop läuft mit Cap-Rate weiter). Timer wird in `onRemove` gecleart. Im Emulator (rAF ~1 fps) greift der Cap nicht (elapsed ≫ 33 ms → sofort) → Verhalten dort identisch zu vorher; der Effekt tritt erst auf echten 60/120-Hz-Geräten auf → **🔴 dort FPS + Thermik gegenprüfen**.
- **Kein** Shader-/RGBA8-Packing-/`EXT_color_buffer_float`-Eingriff; nur Frame-Scheduling.
