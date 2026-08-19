# Diagnose — Wind-Partikel: Treue zu den GRIB-Werten (Richtung & Geschwindigkeit)

> Auftrag (Jan, 2026-08-08): Die visualisierten Partikel sollen in **Geschwindigkeit und
> Richtung** den geladenen GRIB-Winddaten entsprechen. Zoom/Kartenausschnitt dürfen
> ausschließlich die **visuelle** Umrechnung beeinflussen, nie den physikalischen Wert.
>
> Methode: Code-Analyse des gesamten Pfads GRIB → Decode → Textur → Shader → Bildschirm,
> plus adversariale Gegenprüfung der beiden Kernbefunde durch je drei unabhängige Prüfer
> mit unterschiedlichen Linsen (mathematisch / code-lesend / konsequenz-prüfend).
> Ergebnis: **0 von 6 Widerlegungsversuchen erfolgreich.**

---

## 0. Kurzfassung

Der **Datenpfad ist sauber**: DWD ICON-D2 `u_10m`/`v_10m` kommen in m/s an, werden nicht
umgerechnet, nicht rotiert, linear normiert und im Shader exakt invertiert. Die
Zeit-Interpolation zwischen Stunden läuft korrekt im m/s-Raum.

Die Abweichung entsteht **vollständig in der Anzeige-Physik** des Advektions-Shaders
(`src/wind/shaders.ts`, `updateFrag`) — an drei Stellen:

| # | Befund | Wirkung | Schwere |
|---|---|---|---|
| **F1** | Equirect-Advektion ist um **Faktor 2 anisotrop** (X spannt 360°, Y nur 180°, der Shader benutzt für beide denselben Skalar) | **Richtungsfehler bis 19,5°**; Nordwind läuft halb so schnell wie gleich starker Ostwind | **kritisch** |
| **F2** | Potenz-Kennlinie `dispSpeed = (v/5)^0,6 · 5` | 20 m/s : 2 m/s wird als **3,98 : 1** statt 10 : 1 dargestellt | hoch |
| **F3** | Mindesttempo-Boden `speedMin = 2,35 m/s` | alles zwischen 0,05 und ~2,05 m/s läuft **exakt gleich schnell** | hoch |

F2 und F3 sind **keine Willkür**, sondern Symptombehandlung: die eigentliche Ursache ist
**F7 — die 16-Bit-Positionskodierung über die ganze Welt** erzeugt eine harte Totzone,
unterhalb derer Partikel komplett einfrieren. Ohne F7 zu beheben lassen sich F2/F3 nicht
ehrlich entfernen. Das ist in `MapView.tsx:1273-1286` als V-174/V-172 bereits dokumentiert.

---

## 1. Datenpfad bis zur GPU — verifiziert korrekt

| Stufe | Befund | Beleg |
|---|---|---|
| Quelle | `u_10m` / `v_10m`, DWD ICON-D2, **reguläres lat-lon 0,02°** (~2,2 km), nativ ~1215 Spalten | `iconD2WindSource.ts:2-8,278-281` |
| Einheit | **m/s, keine Umrechnung** im gesamten Windpfad (kein kn, kein km/h, kein Extra-Faktor). Einzige Skalierung ist die GRIB2-eigene R/E/D-Dekodierung | `gribDecode.ts:296`; die einzige `/3.6`-Umrechnung im Repo liegt in `brightSkySource.ts:104` (Stationsdaten, anderer Pfad) |
| Rotation | **findet nicht statt — und muss nicht.** Das `regular-lat-lon`-Produkt ist erdrelativ; ein rotiertes Pol-Gitter (GDT 1) würde vom Decoder gar nicht angenommen (nur GDT 0 und 101) | `windFrameBuild.ts:35-39` (u/v werden unverändert kopiert, kein sin/cos/atan2 im Pfad) |
| Normierung | linear, pro Frame, `uMin/uMax` = **echtes Min/Max** des subsampelten Feldes (keine festen Konstanten), Mindestspanne 0,5 gegen Division durch 0 | `windFrameBuild.ts:29-58` |
| Rück-Abbildung | exakte Inverse: `velocity = mix(u_wind_min, u_wind_max, texture.rg)` | `shaders.ts:144`, `WindLayer.ts:1606-1607` |
| `uvBounds` | linear aus den GRIB-Eckkoordinaten; kein separates Resampling nötig, weil ein reguläres lat-lon-Gitter bereits equirect ist | `iconD2WindSource.ts:285` |
| Zeit-Interpolation | **korrekt im m/s-Raum**: beide Nachbar-Frames werden mit ihren *eigenen* uMin/uMax nach m/s dekodiert, dort gelerpt, dann neu normiert. Ein naives Byte-Lerp wäre falsch und wird ausdrücklich vermieden | `iconD2WindSource.ts:401-403,430-459`; identisch im Worker-Pfad `windBlendRefine.ts:44-83` |

### 1b. Präzisionsverluste im Datenpfad (real, aber zweitrangig)

Diese verfälschen den Wert leicht, erklären aber **nicht** die beobachtete Abweichung.
Sie werden hier vollständigkeitshalber festgehalten (→ `improvements.md`):

* **8-Bit-Quantisierung beim Frame-Bau**: 1/255 der Spanne ≈ **0,157 m/s** bei 40 m/s Spanne.
  Das ist die dominante Quantisierung der ganzen Kette — 16× gröber als der Half-Float-Upload
  (0,0098 m/s). `windFrameBuild.ts:54-55`
* **Zweite 8-Bit-Requantisierung im Blend-Pfad** (Slider-Zwischenstunden): `blendNormalizedUV`
  schreibt trotz Float-Header in ein `Uint8ClampedArray` → nochmals ~0,078 m/s.
  `windBlendRefine.ts:44`
* **Nearest-Subsampling** 1215 → 608 Spalten (keine Mittelung). `windFrameBuild.ts:23-34`
* **3×3-Binomialglättung** (nur bei `upsample > 1`, also **nur Desktop**): dämpft Spitzen —
  Ein-Zellen-Spitze auf 39 % der Quellamplitude, 4-Zellen-Welle auf 87,5 %. Auf
  Touch-Geräten (`upsample: 1`) findet sie gar nicht statt → **Desktop und Mobil zeigen aus
  identischen Daten unterschiedliche Amplituden.** `windRefine.ts:74-95`, `MapView.tsx:1305`
* **X-Wrap in der Glättung ist für ein regionales Gitter geometrisch falsch**: der Ostrand
  blutet in den Westrand (gemessen 0,688 statt 1,000). `windRefine.ts:48`
* `uMin/uMax` werden **nach** der Glättung nicht neu bestimmt → `speed_t` erreicht nie 1,0,
  die Farbrampe schöpft ihr oberes Ende nie aus.

---

## 2. F1 — Faktor-2-Anisotropie: der Richtungsfehler

### Der Code

```glsl
// src/wind/shaders.ts:563-566 (updateFrag)
float distortion = cos(radians(pos.y * 180.0 - 90.0));
vec2 offset = vec2(dispVel.x / distortion, -dispVel.y)
    * 0.0001 * u_speed_factor * u_dt_scale * u_zoom_speed / steps;
pos = fract(1.0 + pos + offset);
```

`pos` ist equirektangular: `X = (lng+180)/360`, `Y = (90−lat)/180`.

### Die Rechnung

Für Bodengeschwindigkeit (u = Ost, v = Nord) in m/s gilt

```
dX/dt = u / (2·π·R·cos φ)        ← X spannt 360°
dY/dt = −v / (π·R)               ← Y spannt nur 180°
```

Der **Y-Koeffizient ist exakt doppelt so groß wie der X-Koeffizient**. Der Shader benutzt
für beide Achsen denselben Skalar. `distortion = cos φ` ist korrekt und behebt nur die
Meridiankonvergenz in X — nicht die 360°/180°-Asymmetrie.

### Mercator hebt das nicht auf

```
d(merc_x)/dX = 1
d(merc_y)/dY = 1/(2·cos φ)      (numerisch bestätigt: 0,5000 bei 0°, 0,7472 bei 48°, 1,0000 bei 60°)
```

Bildschirm-Versatz des Shaders: `(k·u/cos φ , −k·v/(2·cos φ))` = `(k/cos φ)·(u, −v/2)`.
Korrekt (konform) wäre `(k/cos φ)·(u, −v)`. Das Verhältnis ist **exakt 2 auf jeder
Breite** — Mercator ist konform und skaliert beide Richtungen gleich, kann eine
Anisotropie im Parameterraum also prinzipiell nicht reparieren.

### Konsequenz (gemessen am Code, φ = 51°, z 5,5)

| Wind | heute dargestellt | korrekt |
|---|---|---|
| 5 m/s aus West (rein zonal) | ≈ **47 px/s** | 47 px/s |
| 5 m/s aus Süd (rein meridional) | ≈ **23 px/s** | 47 px/s |
| 45° Nordost | Schirmwinkel **26,57°** (= atan 0,5) | 45° |

Maximaler Winkelfehler **arcsin(1/3) = 19,47°** bei Bodenrichtung 54,74°.

**Reichweite:** derselbe Ausdruck steht dreimal im Repo — `updateFrag` (Advektion) sowie
`segDrawVert`/`segDrawVertProjected` (`advectStep`, Schwanzende des Segment-Stils,
`shaders.ts:237-238` und `:328-329`). Der Fehler ist damit in sich kohärent (die Trails
schmieren nicht), was erklärt, warum er bisher unbemerkt blieb. Der Farbkanal
(`drawFrag`, `heatmapFrag`) rechnet mit `length(velocity)` und ist **korrekt** — d. h.
Farbe und Bewegung widersprechen einander heute.

**Herkunft:** Das ist die unveränderte Formel aus `webgl-wind` (mapbox), geschrieben für
eine Plate-carrée-Leinwand — dort ist sie ebenso anisotrop. Nichts im Repo korrigiert sie.

---

## 3. F2/F3 — die Betragsverzerrung

```glsl
// src/wind/shaders.ts:536-539 (updateFrag → dispVelocity)
hasWind = step(0.05, speed);
float dispSpeed = hasWind > 0.5
    ? max(u_speed_min, pow(speed / u_speed_ref, u_speed_gamma) * u_speed_ref)
    : 0.0;
```

Aktiv sind die **`points`-Werte** aus `MapView.tsx:1289-1290`
(`speedGamma 0,6 · speedRef 5 · speedMin 2,35`) — `MapView` übergibt kein `particleStyle`,
`WindLayer.ts:849` defaultet auf `'points'`, also greift der `else`-Zweig
`WindLayer.ts:1813-1839`. Der Segment-Zweig (γ 0,7 / ref 30 / min 1,5) ist tot.

Nachgerechnet, `max(2,35 , (v/5)^0,6 · 5)`:

| GRIB (m/s) | 1 | 2 | 5 | 10 | 20 | 30 |
|---|---|---|---|---|---|---|
| dargestellt als | 2,350 | 2,885 | 5,000 | 7,579 | **11,487** | 14,651 |

* Die Elastizität `d ln(disp)/d ln(v)` ist konstant **0,6 statt 1** → Verhältnis 20 : 2
  erscheint als **3,98 : 1** statt 10 : 1.
* Der Boden bindet für **jeden** Wind unter ~2,05 m/s — 0,1 m/s und 2,0 m/s laufen exakt
  gleich schnell.
* Unter 0,05 m/s: harte Totzone auf 0.

### F6 — zusätzliche Gerätekopplung

`viewportSpeedFactor()` (`WindLayer.ts:1351-1357`) skaliert das Tempo mit
`√(Kartenbreite/800)`, geklemmt auf 0,72…1,15. `u_speed_min` wird durch denselben Faktor
**geteilt** (`:1838`), damit der Boden geräteunabhängig bleibt — Nettoeffekt: gedämpft
wird nur der Bereich **über** dem Boden, die Kennlinie ist also zusätzlich
gerätebreiten-abhängig.

---

## 4. F7 — die Wurzel: 16-Bit-Positionskodierung über die ganze Welt

```glsl
// src/wind/shaders.ts:591-593
gl_FragColor = vec4(fract(pos * 255.0), floor(pos * 255.0) / 255.0);
```

Zwei Bytes je Achse ⇒ Quantum = **1/65 025 der ganzen Welt** (≈ 0,00554° Länge ≈ 615 m am
Äquator, ~385 m bei 51°N) — **unabhängig vom Zoom**.

Ein RGBA8-Render-Target rundet zum nächsten Wert. Damit gilt: **jeder Schritt kleiner als
ein halbes Quantum lässt das Partikel vollständig stehen** (der Rundungsfehler wird nicht
zurückgeführt, es entsteht eine echte Totzone, kein Dithering).

Schwelle: `δ_min = 0,5/65 025 = 7,69·10⁻⁶` equirect-Einheiten pro Frame.

| Fall (φ 51°, 60 fps) | Schritt δ | Verhältnis zur Schwelle |
|---|---|---|
| 5 m/s Ost, z 5,5 (heute) | 3,38·10⁻⁵ | 4,4× ✓ |
| 5 m/s Nord, z 5,5 (heute) | 2,12·10⁻⁵ | 2,8× ✓ |
| **1 m/s, z 9, ohne γ/Boden** | 3,68·10⁻⁶ | **0,48× ✗ eingefroren** |

Das ist exakt die in `MapView.tsx:1273-1286` beschriebene Beobachtung (V-174/V-172) und der
Grund, weshalb `speedZoomDamping` auf 0,25 gedeckelt wurde und γ/`speedMin` existieren.

**Konsequenz für den Auftrag: F2 und F3 lassen sich nicht ehrlich entfernen, solange F7
steht.** Der Fix ist strukturell möglich, ohne das RGBA8-**Format** anzufassen: kodiert man
die Position relativ zum aktuellen Spawn-Rechteck `u_bounds` (bereits als Uniform vorhanden)
statt relativ zur ganzen Welt, wächst die Auflösung mit dem Zoom mit:

| Zoom | Quantum heute (Welt-relativ) | Quantum bounds-relativ (1000-px-Karte) |
|---|---|---|
| z 2 | 385 m | ~330 m (praktisch unverändert) |
| z 5,5 | 385 m | ~20 m |
| z 9 | 385 m | ~1,8 m |
| z 11 | 385 m | ~0,45 m |

Bei z 9 liegt der 1-m/s-Schritt dann **105×** über der Schwelle statt 0,48× — die Totzone
verschwindet auf allen Zoomstufen, und γ/`speedMin` werden entbehrlich.

---

## 5. F5 — Zoom-Verhalten heute

```ts
// WindLayer.ts:1820-1828
let zoomSpeed = Math.pow(2, -(z - this.speedRefZoom) * this.speedZoomDamping); // k = 0,25
```

Der geografische Schritt schrumpft mit `2^(−0,25·Δz)`, der Bildschirmmaßstab wächst mit
`2^Δz` ⇒ **Bildschirmtempo ∝ 2^(0,75·Δz)**. Über fünf Zoomstufen sind das **≈ 13,5×**.

Das ist keine Verfälschung der Daten (der Windwert bleibt unangetastet), aber die
Umrechnung m/s → px/s ist damit **weder konstant noch dokumentiert** — genau der Punkt aus
Auftrag §2/§3. `k = 0,25` war nicht frei gewählt, sondern der größte Wert, bei dem schwacher
Wind unter F7 bis z 9 noch driftete.

---

## 6. Was heute stimmt (Funktionserhalt-Basis)

* Einheiten, Rotation, Normierung, Rück-Abbildung, Zeit-Interpolation — alles korrekt (§1).
* `distortion = cos φ` ist die **richtige** Meridiankonvergenz-Korrektur für X.
* Die Vorzeichen stimmen: `Δlng ↔ u`, `Δlat ↔ +v` (durch `windMotionDiag`'s
  `advectionMatchesWind` bereits messbar).
* Die Farbgebung (`speed_t = |v|/|u_wind_max|`) ist unverzerrt.
* `u_dt_scale` + `simSubSteps` machen die Advektion bildratenunabhängig und
  trajektorien-deterministisch — dieser Mechanismus bleibt unangetastet.

---

## 7. Vorhandene Mess-Instrumente (für die E2E-Validierung)

| Handle | Was es liefert | Ort |
|---|---|---|
| `window.__bsSample.wind(lon, lat)` | **GRIB-Wahrheit** am Punkt: `{u, v, speed, dir}` in m/s (dir = meteorologisch, „kommt aus") | `MapView.tsx:3679`, `qa/layerSampler.ts:67` |
| `__map.style._layers.wind.implementation.windMotionDiag({count, ms})` | **gemessene Partikelbewegung**: `degPerSec {lng, lat}`, `cssPxPerSec`, `dirSign`, `advectionMatchesWind`, `measuredFps`, `zoom` | `WindLayer.ts:696-784` |
| `…implementation.glDiag` | Texturformat, Framebuffer-Status, highp-Support | `WindLayer.ts:555` |
| `npm run qa:layers` | Playwright-Harness, aktiviert Wind und ruft `__bsQA()` | `scripts/qa-layers.mjs` |

`windMotionDiag` vergleicht heute nur **Vorzeichen** (`advectionMatchesWind`), nicht
Beträge oder Winkel — für den Nachweis von F1 muss es um einen **Winkel- und
Betragsvergleich** erweitert werden (dev-only, null Kosten pro Frame).

**Kein wind-physikalischer Verifier vorhanden**: `verify:wind-transport` prüft
Byte-Identität des Proxys, `verify:warm-wind` die Cron-Logik, `verify:governor` die
FPS-Leiter. Ein `verify:wind-advection` (headless, gegen die reine Mathematik) fehlt und
sollte im Zuge dieser Phase entstehen.

---

## 8. Abgeleitete Anforderungen an den Fix

1. **Isotropie herstellen** (F1) — die einzige Änderung, die zwingend und unstrittig ist.
2. **Betrag linear in |V|** (F2/F3) — setzt die Behebung von F7 voraus.
3. **Zoom-Abbildung als ein einziger, benennbarer Faktor** (F5): pro Zoomstufe gilt
   `px/s = A(z) · |V|`, mit dokumentiertem `A(z)`. Innerhalb einer Zoomstufe strikt linear.
4. **Keine verdeckten Gerätefaktoren** (F6).
5. Funktionserhalt: Trail, Governor, dt-Normierung, Farbgebung, Segment-Stil, Globus-Modus,
   Punktgröße/Dichte-Regler bleiben unverändert.

---

## 9. Umsetzung (2026-08-08)

Jans Entscheidung: **voller Umfang** (F1 + F7, γ/Boden raus) und **konstantes
Bildschirmtempo** über alle Zoomstufen.

### 9.1 Der neue Vertrag

```
px/s = A(z) · |V|            |V| = GRIB-Windgeschwindigkeit in m/s
A(z) = speedPxPerMs · speedFactor · 2^(screenTempoZoomExp · (z − speedRefZoom))
```

Produktiv: `speedPxPerMs 6`, `speedFactor 1`, `screenTempoZoomExp 0` ⇒ **A ist konstant**.
10 m/s ⇒ 60 CSS-px/s auf jeder Zoomstufe. Die gesamte Mathematik liegt in der neuen,
DOM-/GL-freien Datei `src/wind/advection.ts` und ist damit headless prüfbar.

### 9.2 Was geändert wurde

| Datei | Änderung |
|---|---|
| `src/wind/advection.ts` | **neu** — `screenTempoGain`, `advectionStepScale`, `screenSpeedPxPerSec`, `positionQuantum`, `deadBandStep`, `NS_ASPECT`, `LAT_REF_DEG`. Der Vertrag steht dort im Kopfkommentar. |
| `src/wind/shaders.ts` `updateFrag` | **F1:** `-dispVel.y` → `-NS_ASPECT · dispVel.y`. **F2/F3:** `dispSpeed = speed` (γ/Boden nur noch, wenn ausdrücklich gesetzt). **F7:** Position wird bounds-relativ kodiert (`u_bounds_prev` → advektieren → `u_bounds`). Drei Tempo-Uniforms (`u_speed_factor`, `u_dt_scale`, `u_zoom_speed`) durch **ein** `u_step_scale` ersetzt. |
| `src/wind/shaders.ts` `drawVert` / `drawVertProjected` | Dekodieren bounds-relativ (`u_bounds`). |
| `src/wind/shaders.ts` `segDrawVert` / `segDrawVertProjected` | Dieselben drei Korrekturen im Schwanz-`advectStep`; Tempo kommt jetzt auch hier aus `speedPxPerMs`, damit Kopf und Schweif nicht auseinanderlaufen. |
| `src/wind/WindLayer.ts` | Neue Optionen `speedPxPerMs` / `screenTempoZoomExp`; `speedZoomDamping` entfernt; Defaults auf neutral (γ 1, Boden 0, `viewportSpeedRefPx` 0); `encodeBounds`-Nachführung; `latticeParticleCap` an das neue Raster angepasst; `advectedSeconds`; `windMotionDiag` zur echten GRIB-Treue-Probe ausgebaut. |
| `src/MapView.tsx`, `src/globe/GlobeMap.tsx` | Neue Optionen. Globus auf `speedRefZoom: 2` (ganze Erde im Bild) — hält sein bisheriges Tempo. |
| `scripts/verify-wind-advection.mjs` | **neu**, `npm run verify:wind-advection`. |

### 9.3 Warum die Position bounds-relativ wird

Die 2 Byte je Achse spannen jetzt das Spawn-Rechteck (Sichtfeld + 10 % ∩ Datenregion) statt
der ganzen Welt. Beim Schwenken/Zoomen wird exakt umgerechnet: dekodieren mit dem alten
Rechteck → advektieren in absoluten equirect-Koordinaten → kodieren mit dem neuen.
Partikel, die aus dem Rechteck laufen, werden sofort recycelt (außerhalb ist nicht
kodierbar) — sie waren ohnehin ≥ 10 % außerhalb des Bildes.

**Das RGBA8-Format ist unangetastet** (mobil-kritischer Pfad, `CLAUDE.md`), nur seine
Bezugsfläche ändert sich. Auflösungsgewinn: z5,5 385 m → 19 m, z9 385 m → 1,4 m,
z11 385 m → 0,36 m (gemessen, s. §10).

### 9.4 Bewusste Verhaltensänderungen

* **Sturm sieht nach Sturm aus.** Bei 20 m/s laufen die Partikel jetzt 120 px/s statt 69 —
  die zwangsläufige Folge der Proportionalität. Typischer DACH-Wind (5–6 m/s) läuft mit
  30–36 px/s, also etwas ruhiger als vorher (47 px/s bei 5 m/s).
* **Mobile läuft nicht mehr gedämpft.** `viewportSpeedRefPx` (√(Kartenbreite/800), 0,72–1,15)
  war ein gerätespezifischer Faktor auf der Geschwindigkeit und widerspricht dem Vertrag —
  jetzt Default 0 (aus). Dieselben m/s ergeben auf jedem Gerät dieselben px/s.
  Rückholbar mit einer Konstruktor-Option, falls die Optik auf dem Telefon zu hektisch wirkt.
* **Die Detailansicht läuft nicht mehr leer.** `latticeParticleCap` griff, weil das
  Positionsraster bei hohem Zoom sichtbar wurde; bounds-relativ liegt es überall bei
  ~0,02 px, die Klammer ist damit praktisch inaktiv (bei z11 rechnerisch ~990 statt ~213
  Partikel). Die zoomabhängige Ausdünnung (`zoomThinBase`) bleibt unverändert.
* **Alt-Optik als benannter Fallback (Rule 2):** `speedGamma: 0.6, speedRef: 5, speedMin: 2.35,
  viewportSpeedRefPx: 800, screenTempoZoomExp: 0.75` stellt das frühere Verhalten wieder her.

---

## 10. Verifikation

### 10.1 Headless — `npm run verify:wind-advection` (**50/50 grün**)

Der Verifier prüft die Shader-Formel gegen eine **unabhängige Referenz** (Advektion eines
Luftpakets nach Kugelgeometrie, danach dieselbe Mercator-Projektion) — nicht gegen sich selbst.

| Test | Ergebnis |
|---|---|
| T1 Richtung/Isotropie, 16 Peilungen × 4 Breiten × 6 Zooms | Richtungsfehler **< 0,01°**, Betragsfehler **< 0,2 %** |
| T1.3 Nord/Ost-Verhältnis bei 45/48/51/55°N | **1,000** (vorher exakt 0,500) |
| T2 Linearität, 0,2–35 m/s | px/s ∝ \|V\| auf 1e-6; Verhältnis 20:2 m/s = **10,000** |
| T3 Zoom z2…z11 | px/s **konstant**; 10 m/s ⇒ **60,0 px/s**; Richtung zoom-invariant < 0,01° |
| T4 Breite | folgt exakt cos φ_ref/cos φ (die Dehnung der Karte selbst) |
| T5 Totzone | 0,5 m/s liegt auf **jeder** Zoomstufe 4,2× über der Rundungsschwelle (welt-relativ: 3,18× bei z2, **0,79× bei z4, 0,28× bei z5,5, 0,02× bei z9** → eingefroren) |
| T6 Alt-Kennlinie | neutral bei γ=1/Boden 0; Fallback reproduziert 11,487 m/s bei 20 m/s exakt |
| T7 Regressionswächter | die alte Formel erzeugt reproduzierbar 0,500 bzw. 26,565° — der Verifier misst also wirklich, was er soll |

### 10.2 Im Browser — Ende-zu-Ende gegen echte GRIB-Werte

Aufbau: Vite-Dev (`:5200`), Playwright-Chromium 1440×900, DACH-Übersicht, **echter
ICON-D2-Lauf 18z** (sehr ruhige Lage, 1,4–2,3 m/s über DACH, Maximum ~10,5 m/s).
Kette: `__bsSample.wind(lon,lat)` liefert die **GRIB-Wahrheit** am Punkt,
`windMotionDiag({sampler})` misst die **tatsächliche Partikelbewegung** per
`readPixels` auf der Zustandstextur und vergleicht beides.

Stufe 1 — was aus dem GRIB kommt (Auszug):

| Ort | u | v | \|V\| | Richtung (met.) |
|---|---|---|---|---|
| Hamburg | −1,435 | +0,862 | 1,674 | 121° |
| Köln | −0,935 | −1,988 | 2,197 | 25° |
| Wien | −2,273 | −0,541 | 2,336 | 77° |
| Zürich | −1,368 | −0,002 | 1,368 | 90° |

Stufe 2–7 — was die Partikel daraus machen (breiten-normierte Verstärkung, **Soll 6,000**):

| Zoom | Verstärkung | Δ zum Soll | Winkelfehler (Median) | Nord/Ost | Quantum |
|---|---|---|---|---|---|
| 4 | 5,922 | −1,3 % | 3,81° | 0,980 | 26,6 m |
| 5,3 | 5,946 | −0,9 % | 3,32° | 0,925 | 18,8 m |
| 7 | 5,971 | −0,5 % | 2,51° | 0,979 | 5,7 m |
| 9 | 5,962 | −0,6 % | 2,52° | 1,005 | 1,4 m |
| 11 | 5,883 | −1,9 % | 3,12° | — | 0,36 m |

* **Zoom ändert nur die Darstellung:** über z4…z11 schwankt die Verstärkung um **±0,75 %**.
  Der Windwert selbst wird nirgends angefasst.
* **Isotropie:** Nord/Ost 0,925–1,005 (**vorher exakt 0,500**).
* **Linearität** (Verstärkung je Windstärke-Band, z4): 5,97 / 5,92 / 6,09 / 6,05 für
  1–2 / 2–4 / 4–8 / >8 m/s — Spanne **±1,5 %** um 6,0. Unter der alten γ-Kennlinie hätten
  dieselben Bänder um den **Faktor 6,3** auseinandergelegen.
  (`linearityR2` ist bei dieser extrem homogenen Windlage kein taugliches Maß — fast alle
  Werte liegen im 1–2-m/s-Band, die Varianz des Prädiktors geht gegen null.)
* **Richtung:** der Restfehler **fällt monoton mit der Windstärke**
  (<1 m/s: 10,4° · 1–2: 3,3° · 2–4: 2,8° · 4–8: 1,5° · >8: **1,1°**). Genau das ist die
  Signatur eines *absoluten* Fehlers in den Komponenten, also der Feld-Quantisierung —
  ein Richtungsfehler der Advektion wäre stärkeunabhängig, so wie der alte
  (dort 19,47°, unabhängig von der Windstärke).
* **Mobile 390×844:** Verstärkung 5,906 (Soll 6), Winkel 3,4° — **identisch zum Desktop**,
  wie es der Vertrag verlangt.
* Konsole ohne Fehler; 58–65 fps; Screenshot `audit/screenshots/wind-grib-treue/wind-grib-treue-z53.png`.

### 10.3 Zwei ehrliche Einschränkungen

1. **~10 % der Partikel stehen still.** Gemessen bei z5,3: 256 von 2 201. Ihre GRIB-Windstärke
   liegt im Median bei 0,34 m/s. Ursache ist **nicht** die Positionskodierung (die verlangt
   nur 0,118 m/s), sondern die **Feldaufbereitung**: bildet man die 3×3-Glättung nach, sinkt
   die Geschwindigkeit an genau diesen Punkten von 0,34 auf **0,22 m/s** (bei den bewegten
   Partikeln von 1,245 auf 1,227 — praktisch unverändert), weil u und v *getrennt* geglättet
   werden und sich bei wechselnder Richtung gegenseitig auslöschen. Dazu kommt die 8-Bit-
   Quantisierung (§1b). Betroffen sind fast nur Alpen-/Mittelgebirgspunkte mit stark
   wechselnder Richtung. **Zum Vergleich der Altstand: dort lief alles unter 2,35 m/s mit
   exakt demselben Tempo** — sichtbar, aber falsch.
2. **Der Testbrowser hatte kein Half-Float.** Headless Chromium fiel auf ein `byte`-Windfeld
   zurück (`windTexFormat: "byte"`), also eine zweite 8-Bit-Stufe. Auf echter GPU
   (half-float, Fehler 0,0098 m/s statt 0,078 m/s) sollten Winkelfehler und Standrate
   niedriger liegen — **das ist hier nicht belegt**, sondern eine Erwartung. Real-Device-
   Gegenprobe steht aus.

### 10.4 Nebenbefund (vorbestehend, nicht durch diese Phase verursacht)

Auf diesem GL-Stack zerfällt das **Ping-Pong-Paar in zwei Populationen, die sich frameweise
abwechseln**: Frame N und N+1 zeigen verschiedene Partikel, Frame N und N+2 dieselben.
Das ist exakt das Verhalten, das der Kommentar über `segDrawVert` in `shaders.ts` seit
Phase WP1 dokumentiert („measured on ANGLE/D3D11: the pair decorrelates into two independent
populations") — es existierte vor dieser Phase und keine ihrer Änderungen berührt die
Ping-Pong-/FBO-Logik. Auf die Physik wirkt es sich nicht aus (jede Population advektiert mit
der vollen, korrekten Schrittweite, gemessen in §10.2); **jede Messung an der Zustandstextur
muss aber über eine GERADE Frame-Zahl laufen** — `windMotionDiag` erzwingt das jetzt. Als
Verbesserung erfasst: **V-178**.
