# Diagnose WP1 — Windpartikel: Windy-Optik (Strichcharakter + Zoom-Verhalten)

> Stand: 2026-08-08 · Auftrag Jan: Die Windpartikel des Wind-Layers sollen optisch denen von
> windy.com entsprechen — Strichcharakter mit Schweif statt Einzelpunkte, Schwerpunkt
> Rein-/Rauszoom-Verhalten. **Nur Darstellung**: Datenquelle und Windfeld-Pipeline (Ingest,
> Tiles, Auflösung, Aktualisierung) bleiben unangetastet. Harte Randbedingung: die
> RGBA8-Positionskodierung und die expliziten `highp`-Deklarationen dürfen nicht gebrochen
> werden (bekannte Mobile-GPU-Fixes, s. `src/wind/shaders.ts` Kopfkommentare).

---

## 1. Methode & Belege

- **Referenz:** windy.com **v51.1.0** live via Chrome-Extension (`https://www.windy.com/?50.732,11.895,6`),
  Desktop 1214×765 CSS-px, DPR 1. Das Partikelsystem ist das lazy geladene Plugin
  **`gl-particles.js`** (31 409 B, unminifizierte Shader-Strings); der Quelltext wurde vollständig
  gesichtet und **alle relevanten Zahlen zusätzlich am laufenden Layer per Konsole verifiziert**
  (`maplibreMap.getLayer('gl-particles').implementation`). Werte unten sind daher *gemessen/aus
  Quelltext belegt*; die wenigen Schätzungen sind ausdrücklich als solche markiert.
- **Screenshots:** `audit/screenshots/windpartikel/windy-z{3,6,10}-1214x765.jpg` (identischer
  Ausschnitt Thüringen, drei Zoomstufen).
- **Grenze der Messung:** Der Analyse-Tab lief im Hintergrund → `requestAnimationFrame` pausiert,
  eine FPS-Messung war nicht möglich (deckt sich mit dem bekannten MCP/rAF-Vorbehalt in
  `CLAUDE.md` §Verifikation). Windys Frame-Logik ist aber im Quelltext eindeutig
  (60-fps-normiert, s. §2.4).
- **Zoom-Konvention (wichtig):** Windys URL-/Tabellen-Zoom = **MapLibre-Zoom + 1**. Alle
  Windy-Tabellen unten sind mit Windy-Zoom `z` indexiert; buscosun-Werte mit MapLibre-Zoom
  `z_ml`. Vergleichbar ist `z ≙ z_ml + 1` (URL-z6 ≙ unserem z_ml 5).
- Es wurde **kein Windy-Code übernommen** — die Parameter und Formeln unten sind als
  Re-Spezifikation dokumentiert; die Umsetzung erfolgt im bestehenden eigenen Renderer.

---

## 2. Befund windy.com (Soll-Referenz)

### 2.1 Architektur — dasselbe Grundgerüst wie bei uns

Windy rendert seit v50+ auf **MapLibre GL** (WebGL2, ein Canvas) mit einem Custom-Layer —
strukturell identisch zu unserem `WindLayer`. Partikelzustand in **zwei Ping-Pong-RGBA8-Texturen
256×256** (65 536 Slots), Position **2-Byte-fixed-point pro Achse** (Hi-Byte in `ba`, Lo-Byte in
`rg`, Dekodierung `pos = ba + rg/255.5`) — dieselbe Kodierungsidee wie unsere
`r/255 + b`-Packung. Update-Pass als Fragment-Shader über die Zustandstextur, Trail-Akkumulation
in einem RGBA8-Framebuffer. **Der Unterschied liegt nicht im Grundgerüst, sondern in vier
Darstellungsentscheidungen** (§2.2–2.6).

Wesentliche Abweichung im Koordinatenraum: Windys Partikelpositionen leben **bildschirmrelativ**
(fract im Screen-Space, Wrap am Rand), unsere **weltverankert** (Equirect [0,1]²). Beides kann
den Windy-Look erzeugen; unser Weltraum bleibt (kein Umbau nötig, s. §5).

### 2.2 Partikelform: Segment-Quad + Fade-Akkumulation (der „Strichcharakter")

Der sichtbare Strich entsteht aus **zwei überlagerten Mechanismen**:

1. **Pro Frame ein echtes Liniensegment:** Jedes Partikel ist ein **Quad (4 Vertices, 2 Dreiecke)**,
   das im Vertex-Shader zwischen **Position(t)** aus Zustandstextur A und **Position(t−1)** aus
   Zustandstextur B aufgespannt wird — Länge = die im letzten Frame zurückgelegte Strecke
   (bei 100 px/s @60 fps ≈ 1,7 px) plus eine minimale Längs-Extension (`glParticleLengthEx` 0,1 px;
   Wellen-Variante 1,0). Breite senkrecht zur Bewegungsrichtung (s. Tabelle §2.6), Kanten mit
   ~1 px weichem AA-Verlauf (`aa = clamp(maxWidth·0.8 − |quer|, 0, 1)`). Respawn-Schutz: ist
   `|posA − posB| > 0.5` (Screen-fract-Raum), wird das Quad aus dem Bild geschoben — kein
   „Blitz-Strich" quer über den Schirm.
2. **Schweif durch Framebuffer-Fade:** Ein Akkumulations-Framebuffer (RGBA8, Canvas-Auflösung;
   bei DPR > 1,5 ×0,8, Kante max 2048 px) wird pro Frame **multiplikativ** abgedunkelt:
   `blendFunc(ZERO, CONSTANT_ALPHA)` mit `fadeScale = min(0.9 + 0.5·(blending − 0.92), 0.98)` →
   **Desktop-Default 0,94** (live bestätigt), Mobil `blending ×1.06` → **0,97** (längere Schweife
   auf dem Handy!). Halbwertszeit des Schweifs: ~11 Frames (Desktop) bzw. ~23 (mobil).
3. **Ghosting-Floor-Trick:** RGBA8-Fade konvergiert nie exakt auf 0 → der Anzeige-Pass zieht
   pauschal **−0,1** von allen Kanälen ab. (Wir lösen dasselbe Problem heute über
   `floor(255·c·o)/255` im screenFrag — bleibt.)
4. Partikel-Alpha über die Lebensdauer aus einer **128-Stufen-Alters-LUT**: Fade-in über die
   ersten 20 % (Kurve `t^0.9`), Fade-out über die letzten 30 % (`t^0.8`) → kein Popping.

### 2.3 Bewegung: sublineare Kennlinie, bildschirmkonstantes Tempo

- **Kennlinie:** Anzeige-Geschwindigkeit ∝ **|v|^0,7**, normiert auf **30 m/s** (Bodenwind;
  pro Druckfläche ein Reduktionsfaktor `level2reduce`, z. B. 850 hPa 0,8 ≙ Norm 37,5 m/s).
  Mindest-Anzeigetempo ≈ **5 %** der Normgeschwindigkeit (≙ 1,5 m/s) für jeden Wind > 0 —
  nichts „steht", echte Flaute (Bewegung < Kodier-Schwelle) friert die Position ein und das
  Partikel wird über einen Zustands-Sentinel unsichtbar (kein Stau, kein Gewusel bei Flaute).
- **Tempo-Skala:** `Screen-px/s = 100 · zoom2speed[z] · DPR · normSpeed(|v|)` mit
  `zoom2speed = [0.5, 0.5, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1, 1, …]` (Index Windy-z). Live bestätigt:
  z3 → 60 px/s-Skala, z6 → 90, z10 → 100. **Das Bildschirmtempo ist ab z7 konstant** und wird
  zur Übersicht hin nur moderat (bis ×0,5) gedämpft — Partikel bewegen sich also auf JEDER
  Zoomstufe ähnlich schnell über den Schirm. Beispiele (Desktop, Boden): 5 m/s ≈ 26 px/s,
  10 m/s ≈ 46 px/s, 30 m/s ≈ 90–100 px/s.
- **Frameraten-Unabhängigkeit:** gemessene Frame-Zeit (geklemmt ≤ 0,1 s) skaliert den Schritt;
  interne Zeitbasis „60-fps-Frames" (`frames60`), bei niedriger echter FPS werden mehrere
  Zeit-Frames pro Render-Frame verbraucht.
- **Interpolation:** Windtextur LINEAR-gesampelt (Kachel-Mosaik 256 px/Tile), ein Euler-Schritt
  pro Frame (keine Sub-Steps).

### 2.4 Lebensdauer & Respawn: deterministisch in Blöcken

Kein stochastisches Drop-out: die 256×256-Zustandstextur ist in **16 Blöcke à 4 096 Partikel**
geteilt; alle **8 Zeit-Frames (~133 ms)** wird genau ein Block neu zufällig gewürfelt
(Round-Robin). Jedes Partikel lebt damit **exakt 128 Zeit-Frames ≈ 2,1 s**, die Population ist
perfekt gestaffelt, und die Alters-LUT (§2.2) kennt das Alter ohne Zusatz-Speicher (Alter =
Block-Abstand zum Schreib-Cursor). Bei Flaute s. §2.3 (einfrieren + unsichtbar statt Respawn-Sturm).

### 2.5 Dichte: Fläche ÷ exponentielle Zoom-Staffel

`N = min(15 000, W·H / (50 · 1.6^(z−2)))` (W·H = Karten-CSS-Fläche in px; Nutzer-Multiplier 1;
**mobil ×0,5**). Live bestätigt bei 1214×765:

| Windy-z | 3 | 4* | 5* | 6 | 7* | 8* | 9* | 10 | 12 |
|---|---|---|---|---|---|---|---|---|---|
| Partikel | 11 609 | 7 256 | 4 535 | 2 834 | 1 772 | 1 107 | 692 | 432 | 169 |

\* aus der Formel interpoliert (Formel selbst live an z3/z6/z10/z12 bestätigt).
Pro Zoomstufe rein also **÷1,6** — die Übersicht ist ein dichtes Filament-Feld, die Detailkarte
fast leer. Gezeichnet wird ein `relativeAmount`-Anteil jedes Blocks (Zustandstextur bleibt 256²).

### 2.6 Breite & Größe über den Zoom

`Breite_px = max(1, lineWidth[z] · 1.3 · DPR)` mit
`lineWidth = [0.6, 0.6, 0.6, 1, 1.2, 1.6, 1.8, 2, 2.2, 2.4, 2.4, 2.4, 2.4, 2.6, 2.8, 3, 3, …]`.
Live bestätigt: z3 → **1,3 px**, z6 → **2,34 px**, z10 → **3,12 px**. Dünne Fäden in der
Übersicht, kräftige Striche in der Detail-Ansicht — gegenläufig zur Dichte.

### 2.7 Zoom- und Pan-Verhalten (Schwerpunkt des Auftrags)

Aus Quelltext **und** live beobachtet (Screenshot-Serie während `zoomTo` 9→6):

- **`zoomstart` → Pause:** der selbstgetriebene rAF-Loop stoppt; während der Zoom-Animation
  werden keine neuen Segmente gezeichnet.
- **Während des Zooms:** der vorhandene Trail-Buffer ist über eine **Mercator-Bounds-Transform**
  an der Welt verankert (der Composite-Pass skaliert/verschiebt den alten Buffer auf die neue
  Kamera) — Schweife „kleben" an der Karte und skalieren mit, bis sie ausgeblendet sind.
- **`zoomend` → Clear + Neustart + globales Fade-in:** der Buffer wird geleert, die Partikel
  starten frisch, und der ganze Layer blendet mit `alpha += dt·1.8` (~**0,55 s** bis Vollstärke)
  weich ein. Empirisch: ~1 s nach Zoom-Ende steht das volle Strichbild wieder.
- **Pannen:** KEIN Clear — Trails bleiben stehen und werden per Bounds-Transform re-verankert;
  nach `moveend` kommen neue Kacheln, das Feld läuft nahtlos weiter.
- **Dichte/Breite/Tempo** wechseln beim Zoomwechsel auf die Tabellenwerte (§2.5/2.6/2.3).

### 2.8 Farbe

Monochrom, **kein** Speed-Farbverlauf im Partikel selbst (die Geschwindigkeit farbcodiert der
darunterliegende Heatmap-Layer):

- **z < ~11,5** (grauer Übersichts-Stil): premultipliziertes Grauweiß — RGB ≈ **0,44**, α ≈ **0,44**
  (Default-Opacity 1; `mulRGB = opacity·0.7 + 0.4`).
- **z ≥ ~11,5** (Wechsel auf die helle Detail-Basemap, `grayMapZoomEnd = 11`): Trail ×
  **(0,5, 0, 0,4)** − 0,1, α **0,74** → **dunkles Magenta** für Kontrast auf hellem Grund
  (live bestätigt, Nordsee-Screenshot).
- Mobil: Blending ×1,06 (längere Schweife) als Ausgleich für die halbierte Partikelzahl.

### 2.9 Performance-Rahmen

Trail-Buffer in Canvas-Auflösung (DPR > 1,5 → ×0,8; Kante ≤ 2048), Zustand fix 256², Zielrate
60 fps mit 60-fps-normierter Zeitbasis; mobil halbe Partikelzahl + längere Schweife. Bei
verstecktem Tab/`partikelanimation=off` wird der Loop angehalten und der Layer unsichtbar
geschaltet (entspricht unserer P3-Repaint-Disziplin).

---

## 3. Ist-Zustand buscosun (`src/wind/`)

Grundgerüst identisch (Ping-Pong-RGBA8-Zustand, Fragment-Update, Trail-Akkumulation,
MapLibre-Custom-Layer, Mercator + Globe). Produktions-Parameter: `MapView.tsx:1262` ff. +
Defaults in `WindLayer.ts` (Konstruktor) + UI-Effekt `MapView.tsx:3496` ff.
(„Intensiv": Dichte ×2,1, Punktgröße 1,75, Fade 0,972).

**Warum unsere Partikel wie Punkte wirken — die vier Kernbefunde:**

1. **`gl.POINTS` statt Segmente** (`drawParticles` → `gl.drawArrays(gl.POINTS, …)`,
   `drawFrag` zeichnet einen runden Soft-Dot über `gl_PointCoord`). Es gibt pro Frame **keine
   Linie**, nur einen Punkt; der „Schweif" ist ausschließlich die Fade-Spur dieser Punkte.
   Sichtbarer Strichcharakter entsteht so nur, wenn sich ein Partikel pro Frame um mehr als
   seinen eigenen Durchmesser bewegt — genau das passiert auf der Übersicht nicht (Befund 2).
2. **Bildschirmtempo skaliert mit 2^Zoom statt konstant.** Prod setzt `speedFactor 0.02` und
   **`speedZoomDamping 0`** (der Layer-Default 1,15 ist überschrieben; die Option war als
   „windy-artig" gedacht, ist aber in der Karte deaktiviert). Der geografische Schritt ist damit
   zoomunabhängig → Screen-Tempo verdoppelt sich pro Zoomstufe. Für 5 m/s Wind:
   **z_ml 2,5 ≈ 1,7 px/s (Kriechen — reine Punkte)**, z_ml 5,5 ≈ 14 px/s,
   **z_ml 9 ≈ 157 px/s (Rasen)**. Windy: 26 px/s auf praktisch jeder Zoomstufe (§2.3).
   Zusätzlich ist die Kennlinie anders geankert: `γ 0.5 / Referenz 5 m/s / Min 2 m/s` staucht
   Starkwind (30 m/s → Anzeige 12,2 m/s ≈ Faktor 3 unter Windys 90–100 px/s).
3. **Dichte konstant pro CSS-Fläche statt zoom-gestaffelt** (`baseDensity 3600/MP`,
   [1 200, 22 000], Ausdünnung nur unterhalb z_ml 6 auf minimal 5 %). Bei 1214×765: ~3 364
   Partikel auf **jeder** Zoomstufe ≥ z_ml 6 und ~1 446 bei z_ml 3. Windy: 11 609 → 432 über
   dieselbe Spanne. Ergebnis: unsere Übersicht ist ~8× dünner als Windy, die Detail-Ansicht
   ~8× voller.
4. **Trail-Clear bei jeder Kamerabewegung** (`onMove` → `clearOnNextFrame` auf move/zoom/rotate/
   pitch, feuert pro Frame während der Geste): Beim Pannen und Zoomen verschwinden die Schweife
   sofort und vollständig — es bleiben nackte Punkte. Windy: Pan behält Trails (re-verankert),
   Zoom pausiert + leert einmalig am Ende + blendet weich ein (§2.7).

Sekundäre Unterschiede: Punktgröße wächst mit Zoom (`1.5 · zoomFactor(0.85–3.4)`) statt
Windys Breiten-Tabelle; Alpha konstant 0,85 mit Speed-Anhebung statt Alters-LUT (Partikel
poppen — wird vom Fade teils maskiert); stochastisches Respawn (`dropRate 0.003 + speed·0.01 +
Flaute-Boost`) statt deterministischer Block-Staffel; Fade 0,955^dt (t½ ≈ 15 Frames, ähnlich
Windy 0,94 → kein Haupt-Hebel); Farbe reines Weiß 0,85 (auf unserer dunklen Wind-Heatmap gut —
Windys Magenta-Wechsel betrifft nur seine helle Detail-Basemap).

**Was bereits Windy-Niveau hat und NICHT angefasst wird:** RGBA8-Positionspackung + `highp`
(Pflicht-Randbedingung), dt-Normierung von Advektion UND Fade (`frameDtScale` — Windys
frames60-Äquivalent), Ghosting-Floor-Behandlung, Viewport-adaptive Partikelzahl-Basis,
FrameGovernor-FPS-Leiter + Trail-Halbierung als Mobile-Hebel, P3-Repaint-Disziplin
(hidden/offscreen-Pause), Sub-Step-Advektion (haben wir, Windy nicht), Half-Float-Windfeld +
CPU-Upsample (unser Feld ist glatter als Windys 8-bit-Kacheln), Globe-Modus.

---

## 4. Parametertabelle Ist (buscosun) ↔ Soll (Windy)

Zoomspalten in Windy-z; unsere Werte bei z ≙ z_ml + 1. Viewport-Beispiele: 1214×765, DPR 1.

| Parameter | buscosun IST | windy.com SOLL (gemessen/Quelltext) |
|---|---|---|
| Primitive | `gl.POINTS`, runder Soft-Dot | **Quad-Segment** Position(t)→Position(t−1), 2 Dreiecke |
| Segmentlänge/Frame | — (Punkt) | zurückgelegte Strecke (~0,4–1,7 px) + 0,1 px Extension |
| Breite/Größe | Ø `1.5 · clamp(1+(z_ml−5)·0.3, 0.85, 3.4)` px (z3: 1,3 · z6: 1,7 · z10: 3,5) | `max(1, lineWidth[z]·1.3·DPR)` px (z3: **1,3** · z6: **2,34** · z10: **3,12**) |
| Kantenglättung | radialer smoothstep (0,5→0,18) | ~1 px linearer AA-Saum quer, harte Enden |
| Trail-Mechanik | Fade-Akkumulation, `fadeOpacity^dt` = 0,955 (t½ ≈ 15 Frames) | Fade-Akkumulation, **0,94** Desktop / **0,97** mobil (t½ ≈ 11 / 23) |
| Ghost-Floor | `floor(255·c·o)/255` im Composite | −0,1-Bias im Composite |
| Trail-Buffer | DrawingBuffer × trailScale (Governor 1,0/0,5) | Canvas-Auflösung; DPR > 1,5 → ×0,8; Kante ≤ 2048 |
| Partikel-Alpha | konstant 0,85 · (0,7 + speed·0,4) | **Alters-LUT 128 Stufen**: In 20 % (^0,9), Out 30 % (^0,8) |
| Lebensdauer | stochastisch, E ≈ 4 s (dropRate 0,003 + speed·0,01, Flaute ×4-Boost, OOB ≥ 0,07) | deterministisch **128 Zeit-Frames ≈ 2,1 s**, 16 Blöcke round-robin à ~133 ms |
| Tempo-Kennlinie | `max(2, (v/5)^0.5·5)` m/s Anzeige (Referenz 5 m/s) | `max(0.05, (v/30)^0.7)` normiert (Referenz **30 m/s**, Min ≙ 1,5 m/s) |
| Tempo-Skala | geograf. konstant (`speedFactor 0.02`, damping **0**) → **px/s ∝ 2^z_ml**: 1,7 → 14 → 157 px/s (5 m/s, z3/z6/z10) | **bildschirmkonstant**: `100 · zoom2speed[z] · DPR` px/s; zoom2speed 0,5…1 (z3: 60 · z6: 90 · z≥7: 100); 5 m/s ≈ 26 px/s überall |
| dt-Normierung | `frameDtScale` (≙) + Sub-Steps 1–4 | frames60, 1 Euler-Schritt |
| Dichte | `3600/CSS-MP` konstant ab z_ml 6 (~3 364); < z_ml 6 Ausdünnung bis 5 % (z_ml 3: ~1 446); [1 200, 22 000]; Intensiv ×2,1 | `Fläche/(50·1.6^(z−2))`, Cap 15 000, **mobil ×0,5**: z3 **11 609** · z6 **2 834** · z10 **432** · z12 169 |
| Respawn-Ort | sichtbare Bounds (Equirect, gepuffert +10 %) | ganzer Screen (fract-Wrap) |
| Zoomen | Trail-Clear **jeden Move-Frame**, kein Fade-in, Tempo/Dichte wechseln stetig | zoomstart **Pause** → Trails welt-verankert mitskaliert → zoomend **einmalig Clear** + globales **Fade-in ~0,55 s** |
| Pannen | Trail-Clear jeden Move-Frame | **Trails bleiben** (Mercator-Re-Anchor im Composite) |
| Farbe | Weiß (1,1,1) α 0,85, optional speedTint (Prod 0) | Grauweiß RGB/α ≈ 0,44 (z < 11,5) · Magenta (0,5, 0, 0,4) α 0,74 (z ≥ 11,5); nie speed-gefärbt |
| Flaute | Min-Tempo 2 m/s + aggressives Respawn | Position einfrieren + unsichtbar (Sentinel) |
| Mobile | volle Dichte (CSS-Parität), FPS-Leiter 30→20, trailScale 0,5 als Letzthebel | Dichte ×0,5, Fade 0,97, Breite ×DPR, Buffer ×0,8 |
| Zustandstextur | dynamisch `ceil(√N)²` (≈ 58²) | fix 256², gezeichneter Anteil `relativeAmount` |

---

## 5. Zielbild & geplante Änderungen (Phase 3, nach Freigabe)

**Zielbild:** Partikel = kurzes, kräftiges Kopf-Segment mit weichem Schweif; Bildschirmtempo und
-dichte folgen Windys Zoom-Staffeln (Übersicht: viele feine, ruhig ziehende Fäden; Detail: wenige
breite Striche in gleichem Tempo); beim Zoomen Pause → Clear → weiches Fade-in statt hartem
Punkte-Flackern. Alles zentral parametrisiert und nachjustierbar.

### 5.1 Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/wind/particlePreset.ts` **(neu)** | Zentrale Konfiguration: alle Tabellen/Kurven aus §4 als benanntes Preset (`segments`-Stil) + Legacy-Werte (`points`) als benannter Fallback |
| `src/wind/shaders.ts` | Neuer Segment-Vertex-Shader (liest BEIDE Zustandstexturen, `highp` + RGBA8-Decode **wortgleich** übernommen) + schlanker Segment-Fragment-Shader; bestehende Shader bleiben als Fallback |
| `src/wind/WindLayer.ts` | Segment-Vertexbuffer (4 Verts + 6 Indizes/Partikel), Draw-Pass auf `drawElements`, Zoom-Kurven (Tempo/Dichte/Breite) aus dem Preset, zoomstart/zoomend-Übergang + globales Fade-in, Flag `particleStyle: 'segments' \| 'points'` |
| `src/MapView.tsx` | Preset aktivieren (ersetzt die Einzel-Options `speedFactor/…`); „Intensiv"-Mapping auf die neuen Regler |
| `src/globe/GlobeMap.tsx` | Kompatibilität prüfen — Globus behält sein eigenes Preset (voller Erdball, eigene Dichte), Stil-Flag zunächst `points` (STOPP-Punkt s. u.) |

### 5.2 Änderungen im Einzelnen

- **A — Segment-Quads (Kern):** Pro Partikel 4 Vertices `(index, corner)`; der Vertex-Shader
  holt Position(t) aus `u_particles` und Position(t−1) aus einem zweiten Sampler
  `u_particles_prev` — **beide Texturen existieren bereits** (Ping-Pong `particleStateTexture0/1`,
  nach dem Swap ist Textur 1 exakt der Vorzustand; null zusätzliche GPU-Arbeit). Beide Positionen
  werden wie bisher projiziert (Mercator-Formel bzw. `projectTile` — Globe-tauglich), dann im
  Screen-Space senkrecht zur Segmentrichtung um `±Breite/2` px extrudiert (Viewport-Uniform,
  perspektivisch korrekt über `clip.w`). Respawn-Guard: `|Δpos| > 0.02` Equirect → Quad
  degenerieren. RGBA8-Decode und alle `highp`-Deklarationen unverändert.
- **B — Tempo:** Kennlinie auf `(|v|/30)^0.7`, Min 5 %; Skala `pxPerSec = 100 · zoom2speed(z)`
  (Tabelle aus §2.3, Windy-z = z_ml + 1); Umrechnung px/s → Equirect-Schritt pro Frame im JS
  (Weltbreite 512·2^z_ml px) als ein Uniform — ersetzt das Trio
  `speedFactor/speedRefZoom/speedZoomDamping` funktional (bleibt als Fallback-Pfad erhalten).
- **C — Dichte:** `N(z) = CSS-Fläche/(50·1.6^(z−2))`, geklemmt [400, 15 000] — ersetzt im
  Segments-Stil die flache `baseDensity`-Skalierung; `targetParticleCount` wird zoomabhängig
  (Re-Init nur bei Resolution-Änderung, wie heute; Hysterese über die `ceil(√N)`-Stufung).
- **D — Breite:** `lineWidth(z)·1.3·_epr·trailScale` (Tabelle §2.6) ersetzt `pointSize·zoomFactor`.
- **E — Zoom-Übergang:** `zoomstart` → Advektion/Draw pausieren (Trail bleibt stehen und wird von
  MapLibre ohnehin nicht mit-transformiert → er wird währenddessen schnell ausgeblendet:
  Fade-Pass läuft weiter, zeichnet aber keine neuen Köpfe); `zoomend` → einmalig Clear +
  globaler Alpha-Ramp 0→1 über ~0,55 s. Das heutige Clear-pro-Move-Frame entfällt für Zoom;
  für **Pan** bleibt es zunächst (ehrlicher Ist-Zustand; Windys Re-Anchor → **V-169**).
  Rotate/Pitch/Globe: Verhalten wie heute (Clear).
- **F — Alpha:** Kopf-Segment mit fester Deckkraft (~0,9) — die Alters-LUT (Windys Anti-Popping)
  ist mit unserem stochastischen Respawn nicht direkt abbildbar und wird als **V-170** geführt;
  das Fade-Akkumulat maskiert das Popping bereits weitgehend.
- **G — Zentrale Konfiguration:** alle neuen Zahlen in `particlePreset.ts`, zur Laufzeit
  nachjustierbar (Dev-Handle analog `windMotionDiag`), „Intensiv" mappt auf Dichte-Multiplier
  und Fade wie bisher.

**Rule-2-Absicherung:** `particleStyle: 'segments'` (neu, default in der 2D-Karte nach Gate) mit
benanntem Fallback `'points'` = exakt heutiger Codepfad; ein Umschalter, kein Löschen.

### 5.3 Nicht-Ziele / Erhaltenes

Kein Eingriff in Windfeld-Pipeline, Quellen, `windFrameBuild/Worker`, Heatmap, Fusion;
RGBA8-Packung + `highp` unangetastet (Pflicht); FrameGovernor-Leitern, P3-Repaint-Disziplin,
dt-Normierung, Mobile-Paritätsprinzip (CSS-flächengleiche Dichte — **bewusst anders als Windys
mobiles ×0,5**, s. offene Frage 2) bleiben.

### 5.4 Risiken & STOPP-Punkte

- **Shader-/WebGL-Pipeline-Änderung = STOPP & FRAGEN laut CLAUDE.md** → genau dafür ist diese
  Vorlage da; Umsetzung erst nach Jans Freigabe.
- Vertex-Texture-Fetch auf 2 Samplern: heute schon 1 Sampler im Vertex-Shader
  (`MAX_VERTEX_TEXTURE_IMAGE_UNITS ≥ 4` auf allen relevanten GPUs — im Gate per `glDiag` belegen).
- Vertexdaten wachsen ×4 (bei 15 000 Partikeln: 60 000 Verts ≈ 0,5 MB — unkritisch, aber
  Re-Init-Pfad `reinitParticles` muss die neuen Buffer mitziehen).
- Globus: Segment-Extrusion über die Projektions-Prelude ist mehr Neuland → GlobeMap bleibt in
  WP1 auf `points` (eigene Folgephase, wenn gewünscht).
- Real-Device-Vorbehalt: MCP-Emulation ist für WebGL nicht repräsentativ — GPU-kritische
  Gate-Punkte brauchen das iPhone 12 Pro real (Jan informieren, wie gehabt).

---

## 6. Offene Entscheidungen für Jan (vor Phase 3)

1. **Zoom-Dichte-Staffel übernehmen?** Windys ÷1,6-pro-Zoomstufe macht die Detail-Ansicht sehr
   leer (432 Partikel bei z10 auf Laptop-Fläche). Empfehlung: übernehmen (mit Floor 400) — das
   IST der Windy-Look; unsere heutige Detail-Dichte (~3 400) wirkt daneben wie Schneegestöber.
2. **Mobile-Dichte:** Windy halbiert mobil; unser Paritätsprinzip (Phase P) hält die
   CSS-Dichte gerätegleich und regelt über FPS. Empfehlung: **Parität behalten** (Governor
   deckt Schwachgeräte), Windys ×0,5 nicht kopieren.
3. **Farbe:** Weiß auf unserer dunklen Heatmap belassen (Empfehlung), oder Windys
   Hoch-Zoom-Farbwechsel (dunkle Striche auf heller Karte, relevant wenn Heatmap aus/abgeschwächt
   ab z9) als Preset-Option mitnehmen?
4. **V-169 (Trail-Erhalt beim Pannen)** direkt in WP1 oder als Folgephase?

---

## 7. Verifikationsplan (Gate GWP1, Auszug — vollständig in `checklist.md`)

Typecheck; Desktop 1440×900 pixelvergleichende Zoom-Matrix z_ml 2/5/9 gegen die
Windy-Referenz-Screenshots; Fallback-Flag `points` = byte-identischer Alt-Pfad; iPhone 12 Pro
390×844 DPR 3 (Emulation + Real-Device-Hinweis); Konsole sauber; keine Long Tasks > 200 ms;
`perfState`-Governor-Regression; Globus-Smoke (unverändert `points`); die 5
Selbstverifikations-Fragen schriftlich.

---

## 8. Umsetzungs-Addendum (2026-08-08, nach Jans Freigabe)

Umgesetzt wie in §5 geplant — mit **drei belegten Abweichungen**, alle im Protokoll
`tests.md` §V-WINDPARTIKEL-SEGMENTE verifiziert:

1. **Schwanzende per Rückwärts-Advektion statt aus der zweiten Zustandstextur (Änderung an
   §5.2-A).** Der geplante Weg — Kopf aus Zustand t, Ende aus Zustand t−1 (Ping-Pong-Partner) —
   scheiterte an einem **vorbestehenden** Verhalten der Pipeline: Die beiden
   Ping-Pong-Texturen halten auf dem Test-Stack (Chrome/ANGLE/D3D11) nachweislich KEINE
   benachbarten Zeitschritte. Messung (Readback, dekodierte Positionen): Median-Distanz
   gleicher Partikel-Indizes zwischen Textur 0 und Textur 1 ≈ **541 px** (≈ Zufallsabstand);
   innerhalb EINES Update-Aufrufs gilt zwar exakt `tex1_nachher ≡ tex0_vorher` (100 %
   byte-gleich, Swap korrekt), aber der neu geschriebene Zustand entspricht
   `advect(tex1_vorher)` statt `advect(tex0_vorher)` (80 % vs. 2 % Übereinstimmung) — es
   existieren **zwei unabhängige, alternierende Populationen**. Uniforms, Unit-Bindings,
   VAO-/Scissor-Zustand und GL-Fehler wurden einzeln geprüft und sind unauffällig; die
   Ursache liegt unterhalb der WebGL-Semantik (Treiber/ANGLE). Für den Punkte-Stil war das
   immer unsichtbar (er liest nur Textur 0); Segmente zwischen beiden Texturen wurden
   dadurch viewport-lange Geisterstriche. **Lösung:** Der Segment-Vertex-Shader advektiert
   das Schwanzende **rückwärts aus dem Windfeld** (ein 60-fps-Schritt, exakt dieselbe
   Kennlinie/Skala wie der Update-Pass, JS-seitig als ein `u_step_scale`-Uniform gefaltet).
   Damit ist jeder Vertex selbst-konsistent, Respawn-Geisterstriche sind strukturell
   unmöglich (der geplante `maxSegment`-Guard entfiel ersatzlos), und die Segmentlänge ist
   framerate-stabil. Die Anomalie selbst ist als **V-171** registriert (nicht WP1-Scope).
2. **Dichte × Datenanteil (Ergänzung zu §5.2-C).** Windys Formel bezieht sich auf den ganzen
   Viewport — windy hat globale Daten. Unser Feld deckt nur die D2-Region; die Partikel
   spawnen ausschließlich in Sicht∩Daten. Ohne Korrektur stopfte die Übersicht (z_ml 2) die
   volle Viewport-Zahl (~7 000) in den kleinen Datenausschnitt (weißer Klumpen über DACH).
   Die Zielzahl wird jetzt mit dem **Sichtflächen-Anteil der Datenregion** multipliziert
   (`dataViewFraction()`, Equirect-Näherung); bei Datenankunft wird einmal nachgezogen.
   Gemessene Staffel bei 1440×900: z_ml 2 → 400 (Floor) · z_ml 5 → 1 764 · z_ml 9 → 400.
3. **Shader-Präzisions-Verträge.** Zwei Link-Fehlerquellen, die der Plan nicht vorhersah:
   Uniforms, die Vertex- UND Fragment-Stufe teilen, brauchen identische Präzision — die
   geteilten Skalare/Vektoren sind im Vertex-Shader explizit `mediump` deklariert (Fragment-
   highp-Floats sind auf alten Mobile-GPUs nicht garantiert), der geteilte Wind-Sampler in
   BEIDEN Stufen `highp sampler2D` (Präzedenz: `updateFrag` shippt Fragment-highp-Sampler
   seit jeher). Die RGBA8-Decode-`highp`-Pflicht aus `drawVert` ist wortgleich übernommen.

**Neue/geänderte Dateien:** `src/wind/particlePreset.ts` (neu, alle Stellschrauben inkl.
Laufzeit-Dev-Handle `…wind.implementation.segPreset`), `src/wind/shaders.ts`
(`segDrawVert[Projected]` + `segDrawFrag`, additiv), `src/wind/WindLayer.ts` (Stil-Flag,
Segment-Buffer, Kurven, zoomend-Übergang + Fade-in, `segmentZoomSpeed()`,
`dataViewFraction()`), `src/wind/glUtil.ts` (`createIndexBuffer`), `src/MapView.tsx`
(`particleStyle: 'segments'`, Intensiv-Werte aus dem Preset). Fallback `'points'` =
unangetasteter Alt-Pfad hinter dem Flag (Rule 2); Globus bleibt `points`.

**Offen (Gate-Nachhol-Punkte):** Starkwind-Lage visuell nachprüfen (Sitzung war ~5 kt);
iPhone 12 Pro Real-Device (WebGL-Emulationsvorbehalt).

---

## 9. Rückbau (2026-08-08, Auftrag Jan)

Nach Sichtung der umgesetzten Optik entschied Jan: **gefällt nicht → zurück zum vorherigen
Stand.** Rückbau über das dafür vorgesehene Rule-2-Flag: `MapView.tsx` wieder auf
`particleStyle: 'points'` (Default) und die alten Intensiv-Fade-Literale 0,955/0,972 — die
einzigen zwei aktivierenden Stellen; der Punkte-Pfad war zu keinem Zeitpunkt verändert.
Wiederherstellung verifiziert: Layer meldet `points` / fade 0,955 / pointSize 1,5 /
2 025 Partikel (identisch zu den Vorher-Messwerten), keine Segment-Buffer alloziert, Optik
deckungsgleich zum Before-Stand, Konsole 0 Errors, `typecheck` grün · Beleg
`audit/screenshots/windpartikel/after/desktop-zml5-reverted.png`.

Der Segment-Stil (Preset, Shader, WindLayer-Pfade) bleibt **default-off** im Repo —
Reaktivierung wäre eine Ein-Zeilen-Option, Löschung nur auf expliziten Auftrag. Die
Nachhol-Punkte aus §8 sind bis dahin gegenstandslos. Bleibender Ertrag der Phase: die
Windy-Referenzanalyse (§2), die Parametertabelle (§4) und der V-171-Befund (§8.1).
