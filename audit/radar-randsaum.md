# Phase RS — Hellblauer Saum am Rand der Niederschlagsgebiete

> Auftrag Jan 10.10.2026: „im Niederschlagsradar werden hellblaue Flächen angezeigt, obwohl dort eigentlich noch gar kein
> Regen fällt … meistens am äußeren Rand einer Niederschlagszelle" — Ziel: „die blauen Flächen wirklich an der Stelle, wo es
> regnet, wenn auch nur ganz leichter Regen". Betrifft die HD-Ebenen (Wetterkarte „Niederschlag" und `/regenradar`) und die
> 250-m-Kacheln (R250); die Komposit-Ebene (`?hd=0`) und die alte Regenradar-Karte (`?rr=legacy`) bleiben unberührt.

## §0 Kurzfassung

Der Saum ist kein Messwert, sondern entsteht beim Zeichnen: zwischen einem nassen und einem trockenen Radarpixel mischt die
Abtastung den Bytewert mit 0. Seit den Dual-Frames (HD-3, Voreinstellung seit E-HD-3) ist dieser Byte **logarithmisch** —
der halbe Weg zum trockenen Pixel ist dann nicht die halbe Regenrate, sondern ungefähr das geometrische Mittel aus 0,06 mm/h
und der Rate (5 mm/h ⇒ 0,55 mm/h, ¾ Weg ⇒ 0,18 mm/h). Gezeichnet wird bis `t < 0.002` (½ Byte), also fast bis zur Mitte des
trockenen Pixels. Jeder Rand bekommt so einen ≈ ½–1 km breiten Ring in genau den sechs Hellblaustufen 0,06 … 0,5 mm/h (E-HD-6,
Deckkraft 0,42–0,78). Gemessen an fünf echten Frames: **8,7 % der nassen Fläche (≈ 21 000 km² am RV-Slot 09.10. 22:05 UTC)**
werden eingefärbt, wo das nächste Radarpixel trocken ist, B-Spline 16,8 %, INCA 12,7 %. Dasselbe passiert in der Zeit: der
Morph (HD-4) und die lineare Mischung `lerpValues` blenden Regen, den nur eine der beiden Radarzeiten trägt, über Bytes > 0 ein —
an der Vorderkante einer Zelle erscheint Hellblau, bevor der Regen da ist.

## §1 Diagnose

### §1.1 Wo gemischt wird

| Stelle | Datei | Mischung | sichtbar |
|---|---|---|---|
| D1 räumlicher Filter | `src/scalar/RainLayer.ts` `sampleCatmull`/`sampleBicubic`/bilinear | Byte des nassen Texels mit 0 des trockenen; Catmull-Rom klemmt auf [min, max] der inneren 2×2 — min ist 0 | immer, an jedem Rand |
| D2 Morph | `RainLayer.ts` `main()`: `t = mix(ta, tb, u_frac)` | Regen nur in A oder nur in B wird mit 0 gemischt | Regenradar zwischen zwei Radarzeiten |
| D3 lineare Mischung | `src/map/mapProfile.ts` `lerpValues` (MapView: HD-Ebenen ohne fertigen Fluss, `?hdmorph=0`, 250-m-Kacheln ohne Fluss) | dasselbe auf der CPU, `| 0` | wie D2 |

Die Farbe kommt aus `precipRainRampLog`: Byte 1 = 0,06 mm/h mit Deckkraft 0,42, bis 0,5 mm/h sechs abgestufte Blautöne.
Der Kommentar über `sampleBicubic` („kein künstlicher Regen an Kanten") gilt nur auf dem linearen Byte (dort liegt der halbe Weg
bei der halben Rate, Hellblau nur im äußersten Zehntel); auf der Log-Ebene gilt er nicht.

`radarDrape.ts` (ZT-Bühne) tastet per `sampleRadarIndex` das nächste Pixel ab — kein Saum.

### §1.2 Messung

Werkzeug: `scripts/verify-radar-edge.mjs` Block B (Node-Nachbau des Shaders, 4 × 4 Abtastpunkte je Texel auf der Log-Ebene der
echten Frames; Rohmessung vorab mit demselben Algebra-Nachbau). „Saum" = Abtastpunkt gezeichnet, nächstes Texel trocken;
„Abschwächung innen" = Abtastpunkt in einem nassen Texel, gezeichnet mindestens Faktor 2 schwächer als das Texel selbst.

| Frame | Filter | Saum (km²) | Saum (% der nassen Fläche) | davon < 0,5 mm/h | Abschwächung innen |
|---|---|---:|---:|---:|---:|
| RV 09.10. 22:05 `g000` (240 244 nasse Texel) | Catmull-Rom (Voreinstellung) | 20 976 | 8,7 % | 100 % | 0,1 % |
| | B-Spline (`?hd=bspline`) | 40 363 | 16,8 % | 100 % | 0,2 % |
| RV 21:50 / 21:55 / 22:00 | Catmull-Rom | 20 626 / 20 938 / 20 966 | 8,7–8,8 % | 100 % | 0,1 % |
| INCA 09.10. 21:45 `g015` (14 936) | Catmull-Rom | 1 890 | 12,7 % | 100 % | 0,2 % |

Der Saum liegt fast vollständig **außerhalb** der nassen Pixel; innen zeichnet der Filter die Messung (Abschwächung ≤ 0,2 %).

### §1.3 Was NICHT die Ursache ist

- Messwerte: das Radar trägt die Werte nicht — die trockenen Texel sind 0 (Log- und v1-Ebene haben dieselbe Maske, `precipToU8Log`).
- Die 250-m-Kacheln: sie zeichnen mit demselben Shader und erben D1/D2/D3, erzeugen den Saum aber nicht selbst.
- Nebenbefund **V-RS-1** (nicht Ursache): die Farbtabelle wird mit `rp = (fract(16t), floor(16t)/16)` aus einer 16 × 16-Textur
  mit LINEAR gelesen; `y` liegt auf der Zeilengrenze ⇒ ab Byte 16 ist jede Farbe das Mittel aus dem eigenen Eintrag und dem
  16 Byte tieferen (Log-Ebene: Faktor ≈ 1,7 schwächer). Gilt für alle `RainLayer` seit jeher; der Pixel-Orakel
  (`radar-hd-pixelcheck.mjs`) bildet es bewusst nach.

## §2 Plan (Randregel, Schalter `?hdedge`)

Rule 2: neuer Pfad hinter einem Schalter, ohne Schalter byte-gleich.

- **Nass/trocken entscheidet die Messung.** Je Bildpunkt aus den vier umgebenden Texeln: `round` = bilinearer Anteil nasser
  Texel ≥ ½ (an geraden Kanten exakt die Grenze des nächsten Pixels, Ecken abgerundet), `nearest` = das Texel unter dem Punkt
  (Treppenkante, exakt). Trocken ⇒ nichts zeichnen.
- **Innen ohne Abfall zum Rand.** Vor dem Filter ersetzt der bilinear gewichtete Mittelwert der nassen inneren Texel jedes
  trockene Texel der 4 × 4-Umgebung; Catmull-Rom klemmt auf [min, max] der **nassen** inneren Texel. Der Rand zeigt dann die
  Stufe des Randpixels bis an seine Grenze.
- **Morph:** beide Frames mit der Randregel abtasten; nass, wenn der gemischte Anteil `mix(i_A, i_B, frac)` ≥ ½ (die Kontur
  wandert stetig von A nach B); Wert = Mischung, wo beide nass, sonst der Wert der nassen Seite — kein Einblenden über kleine Bytes.
- **CPU-Mischung:** `lerpValuesWet` — beide nass ⇒ Mischung, nur eine Seite nass ⇒ deren Wert bis zur Hälfte bzw. ab der Hälfte.
- Schalter `?hdedge=1|round|nearest|0`, `localStorage.radarhdedge`, Voreinstellung aus (`RADAR_EDGE_DEFAULT`); wirkt auf die drei
  HD-Ebenen und die 250-m-Kacheln. Shader-Änderung = Jans Gate (STOPP-Regel) — Auftrag 10.10.

**Gate GRS:** (1) Node-Nachbau an echten Frames: Saum `round` ≤ 1 % der nassen Fläche, `nearest` 0, Abschwächung innen ≤ 1 %;
CPU-Mischung: kein Byte > 0 in einem Texel, das auf der näheren Seite trocken ist. (2) Shader-Text trägt die Regel, ohne Schalter
derselbe Pfad wie vorher (Pixel-Diff HEAD ↔ Arbeitsbaum ohne Schalter 0 px). (3) Browser: Bild mit `?hdedge=1` sichtbar, Konsole
sauber. (4) typecheck, Build, Budget, Nachbar-Verifier grün.

## §3 Umsetzung (10.10.2026, uncommitted)

| Datei | Änderung |
|---|---|
| `src/scalar/radarHd.ts` | `RainEdge` (`off`/`round`/`nearest`), `RAIN_EDGE_CODE`, `RADAR_EDGE_DEFAULT = 'off'`, `radarEdgeFlagFrom` (`?hdedge=0\|1\|round\|nearest\|off`, `localStorage.radarhdedge`) |
| `src/scalar/RainLayer.ts` | Shader: `uniform int u_edge`, `sampleWet` (Anteil nasser Texel, Füllwert für trockene Texel, Catmull-Rom auf den nassen Bereich geklemmt), Kantenzweig in `main()` VOR dem unveränderten alten Zweig (Morph: `mix(ia, ib, frac) ≥ ½`, trockene Seite nie im Wert); Option `edge` (Voreinstellung `off`), `setEdge`, Uniform im `render` |
| `src/map/mapProfile.ts` | `lerpValuesWet` (nur ergänzt; `lerpValues` unverändert) |
| `src/MapView.tsx` | `hdEdgeRef`; die drei HD-Ebenen und die 250-m-Kacheln bekommen `edge`; die HD-Mischungen nehmen `mixHd` (= `lerpValuesWet` mit Schalter); die Komposit-Mischung bleibt `lerpValues` |
| `scripts/lib/rainEdgeAlgebra.mjs` | Node-Nachbau des Shaders (alter Pfad, Randregel, Morph) — geteilt von Verifier und Browser-Orakel |
| `scripts/verify-radar-edge.mjs`, `package.json` | `verify:radar-edge` (neu) |
| `scripts/radar-hd-pixelcheck.mjs` | `--edge=1`: drei Varianten gegen den Live-Slot mit dem Orakel der jeweiligen Regel, Gegenprobe mit der anderen Regel, Saum direkt auf dem Canvas |

Nicht angefasst: Farbskalen, Daten-Repo, Spiegel, buscosun Fusion, die Komposit-Ebene, `?rr=legacy`, `radarDrape.ts`.

## §4 Gates GRS (10.10.2026)

1. **`verify:radar-edge` 30/30** (mit `RADAR_EDGE_RAW` = 4 RV-Slots 09.10. 21:50–22:05 UTC + INCA 21:45, aus dem Daten-Repo
   per GET): Catmull-Rom alt 8,7–8,8 % Saum (RV) / 12,7 % (INCA) — `round` 0,39 % / 0,58 %, `nearest` 0; Abschwächung innen
   `round` 0,45–0,76 %, `nearest` 0,05–0,07 %; CPU-Mischung 22:00 → 22:05: 80 616 Texel nur auf einer Seite nass, mit
   `lerpValuesWet` 0 Texel auf der fernen Seite, alt überall dort Hellblau. Negativkontrollen B1/C1/C3/F (alter Pfad muss den
   Saum zeigen) grün.
2. **Browser** (`radar-hd-pixelcheck.mjs --edge=1`, Vite-Dev 127.0.0.1:5231, Fenster DE 6,29 °E / 51,15 °N, Zoom 10,
   Live-Slot mit Log-Ebene; `radar-randsaum/pixelcheck-report.json`): GPU = Orakel **99,996 % (`round`) / 99,997 % (`nearest`) /
   99,993 % (aus)**; Gegenprobe mit der jeweils anderen Regel 97,96–97,97 %. **Saum auf dem Canvas: aus 10 848 px (2,0 % der
   gezeichneten Pixel) über trockenem Radarpixel → `round` 844 px (0,16 %, abgerundete Ecken) → `nearest` 7 px.** Innenfarben
   der drei Varianten an Stichpunkten byte-gleich. Bild: `radar-randsaum/vergleich-kante.png` (links aus, Mitte `round`,
   rechts `nearest`; 3-fach vergrößert).
3. Ohne Schalter: der alte Shader-Zweig ist textgleich (`verify:radar-edge` D3), das Orakel des alten Pfads trifft den Canvas
   zu 99,993 % (wie HD-Gate G2). **Nicht gelaufen:** der Pixel-Diff zweier Produktions-Builds HEAD ↔ Arbeitsbaum
   (`regenradar-wk-pixeldiff.mjs`) — braucht einen HEAD-Worktree mit eigenen `node_modules`.
4. typecheck 0, Build 255/255, `npm run budget` grün (totalJs 1 696,4 / 1 697, eagerJs unverändert); `verify:radar-hd` 53/53
   (1 ⊘), `verify:radar-250m` 21/21 (2 ⊘), `verify:layer-geometry` 76/76, `verify:precip-source` 30/30, `verify:radar-sampling`
   25/25; `verify:regenradar-profile` 34/36 — **E8** („kein Shader-Diff zu HEAD", Phasenwache aus RR) rot, weil diese Phase den
   Shader mit Auftrag ändert, grün nach dem Commit; **C1b** = bekannte Phasenwache V-FR-11.
5. Real-Device offen (V-RS-3).

## §5 Befunde und Entscheidungen

- **V-RS-1** Farbtabelle wird auf der Zeilengrenze gelesen (§1.3) — Farben ab Byte 16 sind das Mittel mit dem 16 Byte
  tieferen Eintrag. Mehrwert: Farben exakt nach Skala. Skizze: `rp = vec2((mod(floor(255t), 16) + 0.5)/16, (floor(floor(255t)/16) + 0.5)/16)`
  bzw. die Rampe als 256 × 1-Textur; ändert alle `RainLayer`-Bilder ⇒ eigenes Gate mit Pixel-Diff.
- **V-RS-2** Am 09.10. 22:00 → 22:05 wechselten 80 616 km² zwischen nass und trocken — fast alles an der 0,06-mm/h-Schwelle
  (Flackern schwacher Echos). Mit der Randregel springen solche Flächen beim Abspielen statt zu verblassen. Mehrwert: ruhigeres
  Bild. Skizze: Hysterese oder Mindestfläche erst nach Rücksprache (das wäre ein Eingriff in die Messung).
- **V-RS-3** Real-Device: 4 zusätzliche Abrufe + 16 Abtastungen je Fragment im Kantenzweig (Morph doppelt) — auf schwachen
  Telefonen GPU-Zeit messen.
- **E-RS-1 (Jan):** Schalter einschalten — `RADAR_EDGE_DEFAULT = 'round'` (Empfehlung: glatte Kontur, 0,4 % Restfläche in
  Ecken) oder `'nearest'` (exakt pixelgenau, Treppenkante bei Zoom ≥ 9 sichtbar); `?hdedge=0` bleibt der Rückweg.
