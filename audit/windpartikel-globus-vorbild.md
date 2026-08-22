# WG-0 — Diagnose: Warum die Windpartikel auf dem Globus besser aussehen als auf der Wetterkarte

> Stand: 2026-08-22 · Auftrag Jan: „Windpartikel der Wetterkarte nach dem Vorbild des
> Globus in Performance und Visualisierung anpassen, Datengrundlage bleibt gleich."
> Status: **Diagnose fertig, nichts umgesetzt** (Wind-Pipeline = STOPP & FRAGEN, CLAUDE.md §Harte Regeln).

## 1. Kernbefund

Es gibt **keinen zweiten Renderer**. Globus und Wetterkarte instanziieren dieselbe Klasse
`src/wind/WindLayer.ts` — derselbe Advektions-Shader, dieselbe Trail-Pipeline, derselbe
`FrameGovernor`:

- `src/globe/GlobeMap.tsx:157`
- `src/MapView.tsx:1393`
- `src/fire/FireMap.tsx:644` (Brandradar, Optionen 1:1 wie die Wetterkarte)

Der Unterschied ist **ausschließlich Parametrierung**. Das ist die gute Nachricht: es
braucht keinen Shader- und keinen Pipeline-Eingriff, und die Datengrundlage
(ICON-D2 auf der Karte, GFS auf dem Globus) bleibt unberührt.

## 2. Gemessener Optionen-Diff (am Code, nicht geschätzt)

| Option | Wetterkarte | Globus | Wirkung |
|---|---|---|---|
| `baseDensity` | 2200 (Default) | **18000** | Partikelzahl je Megapixel, Faktor **8,2** |
| `minParticles` | 400 (Default) | **7000** | greift auf dem Handy (s. §3) |
| `maxParticles` | 22000 (Default) | **48000** | Deckel |
| `densityMultiplier` | `windCfg.density` × (intensiv 2,1) — `MapView.tsx:3678` | 1 bzw. 2,2 (HD) | UI-Regler |
| `pointSize` | **2,5** / intensiv 2,9 — `MapView.tsx:3679` | **1,7** | dicke Punkte vs. feine Filamente |
| `fadeOpacity` | 0,972 / intensiv 0,982 — `MapView.tsx:3690` | 0,97 | Schweiflänge, praktisch gleich |
| `subSteps` | **1** (Default) | **3** | Integrationsschritte je Frame ⇒ glatte Bahnen vs. Polygonzug |
| `speedTint` | **0** (Default) | **0,62** | Globus färbt nach Tempo (`colorRamp`), Karte ist einfarbig weiß |
| `particleColor` | `[1, 1, 1, 0.85]` (Default) | `[0.86, 0.92, 1.0, 0.84]` | Globus leicht kühl, weniger Blendung |
| `showHeatmap` | **true** (Default) | **false** | Karte zeichnet zusätzlich den Wind-Heatmap-Pass je Frame |
| `zoomDropBoost` | **0,42** | 0 (Default) | Karte tötet beim Rauszoomen bis 2,6× mehr Partikel ⇒ Flimmern/Lücken |
| `screenTempoZoomExp` | 0,35 | 0 (Default) | Tempo-Kennlinie, Jans Entscheid 2026-08-09 |
| `speedPxPerMs` / `speedRefZoom` | 6 / 5,5 | 6 / **2** | identische GRIB-Treue, anderer Bezugszoom |
| `upsample` | 2 (Desktop) / 1 (Touch) | 2 (Default) | CPU-Refine je Frame-Wechsel |
| `maxParticleFps` | **30 auf Touch**, 0 Desktop | 0 | Governor regelt auf der Karte FPS + `trailScale` |
| `reduceMotionOnMove` | true auf Touch | false | Partikel-Aussetzer beim Pannen (nur Floor-Tier) |

## 3. Was die Zahlen konkret bedeuten

`targetParticleCount()` (`WindLayer.ts:530`) = `baseDensity × CSS-Megapixel × densityMultiplier`,
geklemmt auf `[minParticles, maxParticles]`.

| Viewport | Wetterkarte | Globus |
|---|---|---|
| Desktop 1440×900 (1,30 MP) | **2 851** Partikel (intensiv 5 988) | **23 328** (HD 48 000, Deckel) |
| iPhone 12 Pro 390×844 (0,33 MP) | **724** Partikel | **7 000** (Untergrenze greift) |

Der Globus zeigt also das **8- bis 10-fache** an Partikeln bei **kleinerem** Punkt — genau die
Optik, die als „besser" wahrgenommen wird: dichtes, feines Strömungsfeld statt weniger
fetter Punkte. Dazu `subSteps 3` (weiche Kurven) und `speedTint 0,62` (Tempo wird als
Farbe lesbar, nicht nur als Länge).

## 4. Warum die Karte sich trotz WENIGER Partikel zäher anfühlt

Die Karte rendert nicht weniger Arbeit, sondern **andere**:

1. **Heatmap-Pass je Frame** (`WindLayer.ts:1873`) — auf dem Globus aus.
2. **CPU-Refine** (bilinear ×2 + 3×3-Glättung + HALF_FLOAT-Upload) bei jedem echten
   Frame-Wechsel (`WindLayer.ts:1392`) — auf dem Globus dieselbe Option, aber ohne
   Zeitregler/Scrubbing praktisch nie ausgelöst.
3. **Governor greift nur auf der Karte durch**: `!this.globeMode` in `WindLayer.ts:1889`.
   Auf Touch fällt der FPS-Deckel 30 → 24 → 20 und zuletzt `trailScale` auf 0,5× — das ist
   der halbaufgelöste Trail-Buffer, also **sichtbar** matschiger. Der Globus wird nie
   heruntergeregelt, unabhängig davon, wie schwer er zu rechnen wäre.
4. **`zoomDropBoost 0,42`** killt beim Rauszoomen bis 2,6× mehr Partikel je Frame — die
   Bahnen reißen ab, was als Unruhe/Ruckeln gelesen wird, obwohl die FPS stimmen.
5. Die Karte trägt außerdem Basemap, Labels, Scalar-Layer und Radar im selben Frame; der
   Globus hat einen minimalen Natural-Earth-Style.

Punkt 3 und 4 sind die eigentlichen Performance-**Wahrnehmungs**treiber, Punkt 1/2 die
echten Kosten.

## 5. Offene Konflikte mit früheren Entscheidungen (deshalb STOPP & FRAGEN)

- `screenTempoZoomExp 0,35` und `speedRefZoom 5,5` sind **Jans Entscheid vom 2026-08-09**
  („beim Rauszoomen wirkten die Partikel zu schnell"). Der Globus fährt exp 0. Tempo
  anzufassen hieße, diesen Entscheid zu revidieren.
- `pointSize 2,5/2,9` und `fadeOpacity 0,972/0,982` stammen aus der Referenzoptik
  `audit/windkarte-vorbild-wetteronline.md`.
- Der WP1-Segment-Stil (windy-artige Striche) ist bereits gebaut und auf Jans Auftrag
  2026-08-08 **deaktiviert** worden — er ist ausdrücklich NICHT Teil dieses Vorschlags.
- `maxParticleFps 30` auf Touch war eine bewusste Akku-/Thermik-Maßnahme (Phase P).
- Die Heatmap ist eine bestehende Funktion ⇒ Funktionserhalt, sie wird nicht entfernt.

## 6. Vorschlag (WG-1, noch nicht umgesetzt)

Rein parametrisch, kein Shader-, kein Pipeline-Eingriff, Datengrundlage unverändert:

1. **Dichte an den Globus heran**: `baseDensity` 2200 → 12000–18000, `minParticles`
   400 → 2500 (Handy), `maxParticles` 22000 → 48000. Der UI-Dichteregler bleibt und wirkt
   weiter multiplikativ.
2. **Punktgröße runter**: 2,5/2,9 → 1,7/2,0 — feine Filamente statt fetter Punkte.
   (Dichte hoch + Punkt klein ist EIN Paar; einzeln kippt die Optik.)
3. **`subSteps` 1 → 3** auf Desktop (Touch 2): glatte Bahnen. Kostet Advektionsarbeit,
   aber keine zusätzlichen Draw-Passes.
4. **`speedTint` 0 → 0,6** + kühlere `particleColor`: Tempo wird lesbar.
5. **`zoomDropBoost` 0,42 → 0** prüfen: der Boost war gegen „Wind-Klumpen weit draußen"
   — bei 8× Dichte ist die Ursache weg, das Abreißen bleibt.
6. **Tempo unangetastet** (`speedPxPerMs 6`, `speedRefZoom 5,5`, `screenTempoZoomExp 0,35`)
   — es sei denn, Jan revidiert 2026-08-09 ausdrücklich.
7. Gegenrechnung Performance: Punkt 1–3 erhöhen die GPU-Last. Der Governor fängt das auf
   Touch ab, aber genau das wollen wir ja vermeiden. Deshalb **Messung vor Gate**:
   Partikelzahl, Long Tasks und `perfState` (Tier/FPS-Deckel/`trailScale`) am **Prod-Build**
   auf Desktop 1440×900 UND iPhone 12 Pro 390×844, gegen den Ist-Zustand als Kontrolllauf.
   Kriterium: `trailScale` bleibt 1,0 und der FPS-Deckel bleibt auf der obersten Sprosse.
   Fällt er, wird die Dichte auf Touch getrennt gedeckelt statt global reduziert.

## 7. Gate GWG1 (Vorschlag)

Fünf Selbstverifikations-Fragen + Vorher/Nachher-Screenshots Desktop/Mobil +
`perfState`-Auszug + Kontrolllauf. Verifier: `npm run typecheck`, `verify:wind*`, Budget.

---

## 8. Umsetzung WG-1 + Gate GWG1 (2026-08-22)

**Jans Entscheidungen (2026-08-22):** (a) **nur Optik**, Tempo bleibt unangetastet —
`speedPxPerMs 6`, `speedRefZoom 5,5`, `screenTempoZoomExp 0,35` und `zoomDropBoost 0,42`
stehen unverändert; (b) **eine Dichte für alle Geräte**, kein getrennter Touch-Deckel —
wo sie nicht trägt, regelt der `FrameGovernor`.

### 8.1 Was gebaut wurde

| Datei | Änderung |
|---|---|
| `src/wind/particlePreset.ts` | **`GLOBE_PARTICLE_RAMP`** — die bisher lokale Globus-Rampe, jetzt EINE Definition (Werte unverändert) |
| `src/globe/GlobeMap.tsx` | benutzt diese Definition statt der eigenen Kopie (verhaltensgleich) |
| `src/wind/WindLayer.ts` | neue Option **`particleColorRamp`** — eigene Rampe NUR für die Partikel; ohne die Option binden die Draw-Passes wie bisher `colorRampTexture` (Altverhalten, keine zweite Textur) |
| `src/MapView.tsx` | `baseDensity` 2200 → **18000**, `minParticles` 400 → **2500**, `maxParticles` 22000 → **48000**, `subSteps` 1 → **3**, `speedTint` 0 → **0,62**, `particleColor` → `[0.86, 0.92, 1.0, 0.84]`, `particleColorRamp` = `GLOBE_PARTICLE_RAMP`, `pointSize` 2,5/2,9 → **1,7/2,0** |
| `src/fire/FireMap.tsx` | dieselben sechs Werte — GWW1 verlangt „der Windlayer der Wetterkarte 1:1"; zwei Optiken desselben GRIB-Werts wären eine zweite Wahrheit |

**Warum eine EIGENE Partikel-Rampe:** Heatmap und Partikel teilen sich im Shader dieselbe
16×16-Rampentextur. Die Heatmap-Rampe der Wetterkarte beginnt bei `rgb(20,30,55)` — mit
`speedTint 0,62` wären langsame Fäden im dunklen Untergrund verschwunden. Die neue Option
trennt beides; **die Heatmap-Farben bleiben unverändert** (Funktionserhalt).

### 8.2 Messung — gemessen, nicht geschätzt

Gerät: Intel UHD 630 (`gpuClass: "weak"`), 4 Kerne, DPR 1. Karte auf DACH, Zoom 4,52,
Canvas 794×705 (0,56 MP).

**Partikelzahl** (Dev-Handle `__map.style._layers.wind.implementation`):

| | vorher | nachher |
|---|---|---|
| Desktop-Canvas 794×705 | **1 296** | **10 201** (7,9×) |
| Mobil-Emulation 390×844 | 724 (gerechnet) | **5 929** (gemessen) |

**Kosten, A/B in derselben Sitzung** (Werte zur Laufzeit umgeschaltet, zwei Durchgänge
je Zustand, je 3 s):

| | fps | p50 | p95 | Governor-EMA |
|---|---|---|---|---|
| alt | 60,1 / 59,9 | 16,8 ms | 18,9 / 19,0 ms | 4 ms |
| neu | 60,0 / 59,0 | 16,6 ms | 19,3 ms | 4 ms |

**Prod-Build gegen Kontrollbuild** (`dist` = neu, `dist-baseline` = alter Zustand, beide
frisch gebaut, Service Worker abgemeldet + Caches geleert vor jeder Messung):

| | Leerlauf-fps | p95 | Long Tasks beim Laden | im Leerlauf |
|---|---|---|---|---|
| Kontrolle (alt) | 60,0 | 19,3 ms | 127 · 215 · **1 875** ms | **keine** |
| neu | 60,0 | 19,1 ms | 51 · 128 · 174 · **1 914** ms | **keine** |

Der ~1,9-s-Task beim Kaltstart steht **im Kontrolllauf genauso** — er ist der vorbestehende
Hauptthread-GRIB-Dekode (V-WF-13), nicht diese Phase. Im Leerlauf gibt es in beiden
Zuständen **keinen** Long Task.

Unter **4× CPU-Drossel** (Dev-Build) kostet die Änderung sichtbar: 51,7 fps / p95 23,0 ms
gegen 60,0 fps / p95 20,9 ms. Auf einem ungedrosselten Gerät ist der Unterschied nicht
messbar; auf einem langsamen ist er es. Genau dafür ist der Governor da — er blieb in
allen Läufen auf der obersten Sprosse (`trailScale 1`, `targetFps` = angeforderter Deckel).

### 8.3 Die fünf Selbstverifikations-Fragen

1. **Funktionserhalt** — „Aus / Normal / Intensiv", Dichteregler (0,3…2,5), Höhenwahl
   10 m/850/700/500 und die Heatmap samt Legende „schwach → Sturm" arbeiten unverändert;
   einzeln geklickt, Beleg `audit/screens/wg1-prod-funktionserhalt.png`. Der Globus rendert
   nach dem Rampen-Umzug unverändert (`audit/screens/wg1-globus-unveraendert.png`).
2. **Desktop-Regression** — die Änderung IST beabsichtigt sichtbar (Auftrag); alles außerhalb
   der Partikel ist pixelgleich, s. Vorher/Nachher.
3. **Touch-Targets** — keine UI-Änderung.
4. **Konsole** — sauber, 0 Fehler/Warnungen am Prod-Build.
5. **Long Tasks > 200 ms** — im Leerlauf keine; der Kaltstart-Task ist im Kontrolllauf belegt.

**Belege:** `audit/screens/wg1-vorher-desktop.png` · `wg1-nachher-desktop.png` ·
`wg1-prod-desktop.png` · `wg1-prod-funktionserhalt.png` · `wg1-globus-unveraendert.png`.
Verifier: `npm run typecheck` grün, `verify:wind-advection` **50/50**,
Budget **915,0 / 926,1 KB** (vorher 918,2).

### 8.4 Offen / ehrlich benannt

- **Real-Device fehlt.** Die Mobil-Zahlen stammen aus der Chrome-Emulation, die auf der
  Desktop-GPU läuft — für WebGL laut CLAUDE.md **nicht** repräsentativ. Die 4×-Drossel zeigt,
  dass die Dichte auf schwacher Hardware Geld kostet. Ob der Governor das auf einem echten
  Telefon auffängt oder auf `trailScale 0,5` durchfällt, ist **ungemessen** und braucht
  scrcpy/ADB. Fällt er durch, ist der nächste Hebel ein getrennter Touch-`baseDensity` —
  bewusst nicht vorweggenommen, weil Jan „gleiche Dichte überall" entschieden hat.
- **V-WG-1:** `zoomDropBoost 0,42` bleibt bestehen. Er war gegen „Wind-Klumpen weit draußen"
  gedacht; bei 8× Dichte ist die Ursache weitgehend weg, das Abreißen der Bahnen beim
  Rauszoomen bleibt. Mehrwert einer Prüfung: ruhigeres Bild in der Übersicht. Umsetzung:
  Wert auf 0 setzen, Partikelzahl und p95 beim Rauszoomen gegenmessen.
- **V-WG-2:** Die Wetterkarte zeichnet den Heatmap-Pass in jedem Frame mit, auch wenn die
  Heatmap durch andere Layer verdeckt ist. Mehrwert: ein Vollbild-Pass weniger auf
  schwachen Geräten. Umsetzung: `showHeatmap` an die tatsächliche Sichtbarkeit koppeln.
