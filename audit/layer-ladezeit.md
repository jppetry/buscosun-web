# Layer-Ladezeit nach dem Klick (LZ0) — Diagnose und Maßnahmen

> **Stand 2026-09-07, Phase LZ0 = Diagnose, keine Implementierung.** Jans Auftrag: „Nach dem Klick auf
> einen Layer dauert es 2 bis mehrere Sekunden, bis er sichtbar ist" — den Ladepfad vom Klick bis zum
> ersten gerenderten Frame zerlegen, je Stufe Millisekunden messen (Desktop und iPhone 12 Pro), den
> dominanten Anteil benennen, dann Maßnahmen nach Zeitgewinn ÷ Aufwand. Constraints: kein Backend,
> nichts Kostenpflichtiges, Netlify-Bandbreite bleibt bei ≈ 0, Datenquellen und Fachrechnung unangetastet.
> Implementierung erst nach Jans Freigabe.

## 0. Der Befund in sechs Sätzen

1. **Dekodieren, Textur-Upload und erstes Rendern kosten zusammen 20–60 ms** (Desktop 15–25 ms, CPU-4×-
   Emulation 40–60 ms) — sie sind nicht das Problem. Es gibt keinen Three.js-Pfad; jeder Layer ist ein
   MapLibre-Custom-Layer, dessen `texImage2D` unter 3 ms liegt.
2. **Der dominante Anteil ist die Wartezeit auf das erste Byte (TTFB) von jsDelivr bei einem Cache-MISS:**
   Median **0,60 s**, p90 **1,43 s**, Maximum **2,52 s** (n = 39). Ein HIT antwortet in **0,07 s** (p50, n = 27).
3. **Fast jeder Klick ist ein MISS.** Der Publish force-pusht alle 3 h eine neue Historie; jede Bild-URL
   trägt den Commit-SHA und ist damit an jedem CDN-Knoten neu — auch die lauf-invariante `hsurf-v1.png`.
   Nachgeprüft 2,75 h nach dem Publish des 12z-Laufs am Frankfurter Fastly-Cluster: die Jetzt-Schritte
   von Böen, Niederschlag, CAPE, Blitzprognose und Schnee waren **alle MISS**, die von Wind und
   Temperatur erst durch meine eigenen Messläufe gefüllt (Age 101 s). Die Seite hat zu wenig Verkehr,
   um den Edge selbst warm zu halten.
4. **Der Index kommt nach 60 s wieder vor das erste Bild:** `cdnIndex()` hält das Promise 60 s; danach
   holt jeder Klick `index.json` mit `cache: 'no-store'` neu — warm +100 ms, nach einem Purge (jeder
   Publish) **+1,36 s** seriell vor dem ersten Bild.
5. **Auf dem Handy kommen zwei Posten dazu:** die Bytes (Wind: 2 × 245 KB = **1,0 s** reine Übertragung
   bei 4 Mbit/s) und ein **Long Task von 300–460 ms direkt am Klick** (React-/MapLibre-Re-Render), der
   auf langsamer CPU den Fetch-Start um bis zu **530 ms** verzögert.
6. **Rechnung eines typischen Klicks heute (Desktop, Edge kalt, > 60 s nach dem letzten Index):**
   Index 0,1–1,4 s + Bild-TTFB 0,6–1,4 s + Rest 0,1 s = **0,8–2,9 s**. Das ist genau der gemeldete
   Bereich. Mit warmem Edge sind es **0,3 s** (gemessen).

## 1. Der Ladepfad, wie er im Code steht

Klick auf eine Zeile im Dock (`layerRowDeck` → `toggle(key)`, `MapView.tsx:4249`) → `active` ändert
sich → React-Commit → der Lazy-Effekt der Familie feuert (`installGustRef.current?.()`,
`MapView.tsx:2481`) → `fetchIconD2Gust()` (bzw. Wind/Temp/Thunder/…):

| Schritt | Code | Abrufe |
|---|---|---|
| Lauf + Schritte auflösen | `resolveLatestRun` → `resolveRunFromRepackIndex` → `cdnIndex()` (`repackSource.ts:877`) | 0 innerhalb 60 s, sonst `index.json` (`no-store`, 116 KB roh / **9,6 KB br**) |
| Abschnitt der Familie | `resolveRepackForRun` — aus demselben Index-Promise | 0 |
| Jetzt-Fenster | `stepsForNowWindow` (`START_NOW_ONLY`) → **2 Schritte** (Stunde ⌊h⌋ und ⌈h⌉) | 2 PNG parallel (`REPACK_CONCURRENCY` 12) |
| Bild → Pixel | `loadRgba`: `fetch` → `blob` → `createImageBitmap` → Canvas `drawImage` → `getImageData` (`repackSource.ts:548`) | — |
| Frame | `composeScalarRgba`/`composeTempRgba` → `rgbaToCanvas` (`putImageData`) → `frames.push` → `onProgress` beim **ersten** Frame → `setNowcastTick` | — |
| Textur | Slider-Effekt → `bracketAtValidTime` → `ScalarLayer.setData` → `createTexture` (`texImage2D` vom Canvas) → `triggerRepaint` (`ScalarLayer.ts:209`) | — |
| Wind zusätzlich | `windFrameAtValidTimeAsync` (Blend/Upsample/Pack im `windBlendWorker`) → `setWindDataPacked` (`texImage2D` `Uint8Array`, Desktop 1216×746, mobil 608×373) | — |

Wichtig für die Deutung: **das erste Bild erscheint, sobald EINE der zwei Dateien da ist** —
`bracketAtValidTime` liefert bei nur einem Frame `a === b`. Gemessen (Gewitter, Desktop): erster Frame
bei 255 ms, die zweite Datei kam erst bei 934 ms. Wind ist die Ausnahme: liegen beide Frames vor, wartet
das gepackte Blend-Bild auf den Worker (Desktop +270 ms nach Bildankunft).

Nicht im Daten-Repo und deshalb hier nicht gemessen: `clouds` (im Dock auskommentiert,
`MapView.tsx:5370`) und `relhum_2m` (Feuerwetter) — beide gehen weiter über GRIB/Netlify.

## 2. Messmethodik und Fallen

- **Browser:** Playwright-core 1.58 + Chromium 148 (headless, SwiftShader), Produktion `buscosun.com`,
  je Lauf ein frischer isolierter Kontext (kalte Browser-Caches). Der Chrome-DevTools-MCP und die
  Chrome-Erweiterung waren nicht verbunden (Profilkonflikt bzw. Extension nicht aktiv) — Playwright über
  CDP ersetzt sie, wie schon in BW-12 (§31.13).
- **Instrumentierung nach dem Laden, vor dem Klick** (`scratchpad/measure-layer.mjs`): `fetch`,
  `createImageBitmap`, `getImageData`/`putImageData`/`drawImage`, `texImage2D` (+ `requestAnimationFrame`
  danach = „nächster gezeichneter Frame") und `PerformanceObserver('longtask')` gepatcht; dazu die
  Resource-Timings (jsDelivr sendet `Timing-Allow-Origin: *`, also volle Zerlegung DNS/Connect/TTFB/Body).
  Alle Zeiten in ms **ab dem Klick**. Der Klick trifft den echten Dock-Button (`button.mdk-layer`,
  mobil `button.mdk-m-layer` nach dem Tab „Layer").
- **Mobil = Emulation:** Playwright-Gerät „iPhone 12 Pro" (390×844, DPR 3, Safari-UA) in **Chromium**,
  CPU-Drossel 4× und „Fast 4G" (4 Mbit/s ↓, 20 ms Latenz) bzw. „Slow 4G" (1,6 Mbit/s, 150 ms) über CDP.
  Das ist Lighthouse-Klasse „mittleres Android"; ein A14 liegt zwischen den 1×- und 4×-Zeilen. Safari
  dekodiert anders als Chromium. **Ein Real-Device-Lauf (iPhone, Safari) fehlt** — Jans Hand (V-LZ-8).
- **CDN:** `curl` gegen `cdn.jsdelivr.net` (Fastly, Frankfurt), dazu `gcore.jsdelivr.net`,
  `testingcf.jsdelivr.net`, `fastly.jsdelivr.net` und `raw.githubusercontent.com`.
- **Fallen, die diese Messung selbst gefunden hat:**
  1. `Vary: Accept-Encoding` — jsDelivr hält **getrennte Varianten** für `identity` (curl ohne Header)
     und `gzip/br` (Browser). Ein Test ohne Browser-`Accept-Encoding` füllt einen Cache, den kein
     Browser je liest; Node-`fetch` (`gzip, deflate, br`) teilt sich die Browser-Variante (V1/V2 in §4.3).
  2. Meine eigenen Messläufe wärmen den Edge — nach dem ersten Lauf ist jede weitere Messung derselben
     Schritte „warm". Kalt-Werte stammen deshalb aus dem jeweils ERSTEN Lauf und aus curl gegen noch
     nie angefragte Schritte.
  3. `curl -w "@…"` liest eine Datei statt eines Formats — Ausgabezeilen mit `@main` fehlten deshalb
     in einem Block, die Header waren trotzdem da.
  4. SwiftShader macht WebGL-Aufrufe teurer als eine echte GPU — die `getParameter`-Kosten in §5.3 sind
     ein Verdacht, kein Real-GPU-Wert.
  5. Der Temperatur-Layer wird am Mount **immer** im Leerlauf vorgeladen (Stadt-Labels,
     `MapView.tsx:2559–2571`); im 9-s-Messfenster landeten sein DEM-Upload (1141×700) und seine Bilder
     manchmal noch **während** des Klick-Fensters (Einträge bei +10…14 s in den Rohdaten sind das, nicht
     der geklickte Layer).

## 3. Zeitleisten je Stufe (ms ab Klick)

### 3.1 Desktop 1440×900, Produktion, ohne Drossel

| Layer | Edge | Fetch-Start | Header (TTFB) | Body da | Bitmap | getImageData | texImage2D | **erster Frame** |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Böen (2 × 131 KB) | **beide MISS** | 82 | 815 / 819 (TTFB 725 / 733) | 819 / 842 | 13,0 / 13,5 | 1,4–7 | 849 (0,0) | **868** |
| Gewitter (45 / 43 KB) | MISS (schnell) / MISS | 88 | 173 / 934 | 200 / 935 | 21 / 2,5 | 1,5 | 238 | **255** |
| Rotation (39 KB) | MISS / MISS | 78 | 174 / 389 | 184 / 399 | 3,8 / 3,5 | 1,2 | 205 | **217** |
| Schnee (3 KB) | MISS / MISS | 92 | 377 / 380 | 378 / 381 | 5,5 / 11 | 1 | 436 | **448** |
| Blitzprognose (4 KB) | MISS / MISS | 142 | 554 / 603 | 554 / 626 | 2,3 / 12,5 | 1 | 575 | **602** |
| Böen, Klick **65 s** nach Laden | Index HIT, Bilder HIT | Index 55 → 148, Bilder 150 | 182 | 215 | 3,9 / 10,6 | 1,5 | 295 | **305** |
| Wind (2 × 245 KB, von `/wetterkarte/temperatur`) | HIT | 145 | 182 | 215 | 5,7 / 9,2 | 2 | Canvas 265, gepackt 1216×746 @531 | **580** |
| Temperatur (am Mount vorgeladen) | — | — | — | — | — | — | 74 | **108** |

Long Tasks nach dem Klick: Böen 91 ms @523 · Wind **292 ms @241** und 242 ms @1022 · Temperatur
**460 ms @220** (nach dem Frame; §5.3). Konsole in allen Läufen: 0 Fehler, 0 Warnungen.

**Lesart.** Zwischen „Body da" und „erster Frame" liegen bei jedem Layer **13–35 ms**. Zwischen Klick
und Fetch-Start liegen 80–145 ms (React-Commit + Effekt). Alles andere ist TTFB.

### 3.2 iPhone 12 Pro (Emulation, Chromium), Produktion

| Layer · CPU · Netz | Edge | Fetch-Start | Header | Body da | Bitmap | texImage2D | **erster Frame** |
|---|---|---:|---:|---:|---:|---:|---:|
| Böen · 4× · Fast 4G | HIT / MISS | 154 | 212 / 592 | 439 / 851 | 16 / 3,7 | 476 | **490** |
| Gewitter · 4× · Fast 4G | HIT / MISS | 60 | 121 / 488 | 199 / 585 | **48** / 3,4 | 290 | **314** |
| Böen · 4× · ohne Drossel | HIT / HIT | **529** (Long Task 408 ms @72) | 565 / 589 | 610 / 623 | 29 / 45 | 728 | **750** |
| Böen · 1× · Fast 4G | HIT / HIT | 39 | 114 | 571 (260 KB parallel) | 4,3 / 9 | 603 | **610** |
| Wind · 4× · Fast 4G | HIT / HIT | 292 | 335 | **1 261 / 1 266** (490 KB) | 21 / 32 | Canvas 1387, gepackt @1549 | **1 621** |
| Schnee · 4× · Slow 4G | — | (keine Fetch-Ereignisse im 7-s-Fenster erfasst — nicht gemessen, V-LZ-9) | | | | | |

**Lesart.** Bei 4 Mbit/s zählt die Dateigröße: 130 KB ≈ 230 ms, 2 × 245 KB (Wind) ≈ 930 ms reine
Übertragung. Die CPU-Drossel verdoppelt bis vervierfacht das Dekodieren (Bitmap bis 48 ms), bleibt aber
unter 60 ms je Bild — der größere CPU-Posten ist der Long Task **am Klick** (408 ms), der den Fetch erst
bei 529 ms starten lässt. Wind ist auf dem Handy der langsamste Layer: Bytes + Worker-Blend.

### 3.3 Dekodieren isoliert (`scratchpad/decode-bench.mjs`, Median aus 6, Chromium)

| Datei | Bytes | Bitmap 1× | getImageData 1× | Bitmap 4× | getImageData 4× |
|---|---:|---:|---:|---:|---:|
| wind-003.png (608×373×3) | 248 848 | 5,0 | 0,8 | 6,0 | 2,2 |
| temp-003.png (Grau+Alpha) | 93 544 | 3,4 | 1,4 | 6,1 | 5,0 |
| gust-003.png | 131 679 | 3,3 | 1,5 | 4,2 | 1,6 |
| thunder-003.png | 44 994 | 2,5 | 1,5 | 5,3 | 5,9 |
| cape-003.png (1215×746) | 125 042 | 6,8 | 3,6 | 11,2 | 10,3 |

Die Werte in der laufenden Karte (§3.1/3.2) liegen 2–4× darüber, weil Partikel-Animation, MapLibre-
Placement und der Temperatur-Vorlader denselben Hauptthread teilen. Auch dann: **< 60 ms je Bild.**

## 4. jsDelivr — was das CDN wirklich tut

### 4.1 Antwortzeiten (TTFB, Sekunden, Frankfurt)

| Fall | n | min | p50 | p90 | max |
|---|---:|---:|---:|---:|---:|
| **MISS, Origin kalt** (Datei noch nie irgendwo angefragt) | 39 | 0,17 | **0,60** | **1,43** | **2,52** |
| MISS am Edge, **Origin warm** (Datei vorher über einen anderen jsDelivr-Provider geholt) | 14 | 0,11 | **0,17** | 0,56 | 0,62 |
| **HIT** | 27 | 0,05 | **0,07** | 0,13 | 0,13 |
| `index.json` MISS nach Purge | 1 | | 1,36 | | |
| `raw.githubusercontent.com` direkt (Vergleich) | 2 | 0,26 | | | 0,48 |

Die MISS-Zeit hängt an der Dateigröße (jsDelivr holt die Datei vollständig vom Origin, bevor das erste
Byte fließt): 93 B → 0,25 s, 13 KB → 0,39 s, 131 KB → 0,84 s, 250 KB → 0,97 s in derselben Serie —
mit großer Streuung (temp-004: 2,52 s bei 92 KB).

### 4.2 Warum der Edge kalt bleibt

- **Jeder Publish = neue Historie = neue URLs.** `publish-repack.mjs:265` force-pusht; `index.json`
  nennt den Daten-Commit, der Client baut `…@<sha>/runs/<lauf>/<datei>` (`stepUrl`). Nach jedem der
  8 Publishes am Tag ist **jede** Bild-URL an jedem Knoten unbekannt — auch `hsurf-v1.png`, deren Inhalt
  sich nie ändert, und die drei älteren Läufe, die unverändert im Repo liegen. Die Radar-Commits
  (~1/min) ändern daran nichts: der Index bleibt auf den Publish-Commit gepinnt.
- **Header:** `@<sha>`-Dateien tragen `max-age=31536000, immutable` (Browser-Cache perfekt, aber nur
  innerhalb einer Sitzung/3 h nützlich); `@main/…`-Dateien `max-age=86400` (24 h);
  `@main/index.json` `s-maxage=43200` (12 h) — vom Publisher gepurgt.
- **Verkehr reicht nicht zum Warmhalten.** Stichprobe am 2026-09-07 15:56 UTC (2,75 h nach dem
  Publish, Browser-`Accept-Encoding`): `gust-002`, `precip-003`, `cape-003`, `lightningfc-003`,
  `snowDepth-003` **MISS**; `wind-003/004`, `temp-003`, `thunder-003/004`, `rotation-003` HIT mit
  Age 20–101 s = **meine eigenen Läufe**. Fastly-Frankfurt verteilt auf ~200 Knoten
  (`cache-fra-etou8220xxx`), teilt aber Treffer (6 Verbindungen → 6 HITs auf 6 Knoten).
- **Kein `Age`-Vorsprung durch den Publisher:** `purgeIndexUntilFresh` purgt Zeiger und Index und liest
  sie nach — die **Bilder** fasst nach dem Push niemand an. Der erste Nutzer je Datei, Variante und
  Provider zahlt den kalten Origin (0,6 s p50).
- **Retention (`keep: 4`) ist unschädlich** für die Ladezeit: gelöschte Läufe werden nicht mehr
  angefragt; der Force-Push ist es, der schadet (nicht das Löschen).

### 4.3 Drei Belege, die die Maßnahmen tragen

- **V1** — Füllung mit Node-`Accept-Encoding: gzip, deflate, br` → Browser-Variante **HIT** (wind-006:
  0,40 s MISS, dann 0,13 s HIT). **V2** — Füllung ohne `Accept-Encoding` → Browser-Variante **MISS**
  (gust-006: 0,85 s, dann 0,47 s MISS). ⇒ Ein Warm-up muss die Browser-Variante anfragen; Node-`fetch`
  tut das.
- **V3** — Datei zuerst über `gcore.jsdelivr.net` (Origin wird warm), dann `cdn.jsdelivr.net`:
  wind-007 1,19 → **0,18 s**, gust-007 0,73 → **0,30 s**, temp-007 1,57 → **0,17 s**. ⇒ Ein Warm-up von
  **irgendwo** (auch vom US-Runner) nimmt jedem MISS weltweit den Origin-Anteil; nur der Edge-Anteil
  (~0,1–0,2 s) bleibt, bis jemand aus der Region die Datei holt.
- **Parallelität:** zwei kalte Wind-Dateien gleichzeitig (curl, 2 Verbindungen): 0,55 s / 0,94 s, Wand
  1,13 s. Der Browser nutzt EINE HTTP/3-Verbindung (`nextHopProtocol h3`, DNS/Connect 0 ms dank
  Preconnect) — Parallelität kostet nichts, hilft aber auch nicht gegen den TTFB.

## 5. Weitere Befunde

### 5.1 Der Index nach 60 s

`INDEX_TTL_MS = 60 000` (`repackSource.ts:770`). Klick > 60 s nach dem letzten Index-Abruf: `fetch(…,
{cache: 'no-store'})` → gemessen **+93 ms** seriell (HIT, 9,6 KB br) — nach einem Purge **+1,36 s**.
`no-store` ist richtig (jsDelivr setzt `max-age=604800`, der Browser hielte sonst 7 Tage einen alten
Lauf), aber der Abruf muss nicht VOR dem Bild stehen: der Index von vor 5 min zeigt in 99 % der Fälle
denselben Lauf (Publish-Takt 3 h). Der Inhalt für den Client (nur der jüngste Lauf) wäre **2 KB br**
statt 9,6 KB; parsen kostet 1–2 ms — irrelevant, der Round-Trip ist der Posten.

### 5.2 Formate und Bytes (`scratchpad/fmt.mjs`, `sharp`)

| Datei | PNG heute (Z_RLE, adaptiv) | PNG `sharp` L9 | **WebP lossless** (effort 6) | roh + Brotli |
|---|---:|---:|---:|---:|
| wind-003 | 248 848 | 250 074 | **185 898 (−25 %)** | 349 557 |
| temp-003 | 93 544 | 110 000 | **62 414 (−33 %)** | 117 600 |
| gust-003 | 131 679 | 159 805 | **89 834 (−32 %)** | 166 817 |
| thunder-003 | 44 994 | 61 265 | **32 814 (−27 %)** | 47 737 |
| cape-003 | 125 042 | 192 936 | 115 572 (−8 %) | 182 258 |
| precip-003 | 13 026 | 23 807 | 11 504 (−12 %) | 16 307 |

Der eigene PNG-Encoder ist bereits besser als `sharp`/libpng. WebP lossless spart bei den Layer-Bildern
ein Viertel bis ein Drittel; dekodiert gleich schnell (±3 ms). **Vorsicht:** bei `temp`/`gust`
(Grau+Alpha) unterscheidet sich das WebP-Roundtrip in Pixeln mit A = 0 (libwebp verwirft RGB unter
transparentem Alpha, sofern nicht `exact`) — die sichtbaren Werte sind gleich (Prüfsumme über A > 0
identisch), `verify:repack` müsste die Maske kennen. Auf Desktop bringt das nichts (130 KB = 30 ms), auf
4 Mbit/s **−80 ms je Böen-Datei, −130 ms je Wind-Datei.**

### 5.3 CPU nach dem Klick (CDP-Profiler, 3-s-Fenster, `scratchpad/profile-click.mjs`)

| Lauf | Self-Time gesamt | davon `getParameter` (WebGL) | MapLibre | eigene Layer |
|---|---:|---:|---:|---:|
| Temperatur, Desktop | 3 404 ms (idle 1 287) | **1 045** | 402 | 24 (WindLayer) |
| Wind, Desktop | 3 521 (idle 1 023) | **959** | 385 | 249 (WindLayer) + 49 (quadWarpMesh) |
| Böen, iPhone-Emulation 4× | 3 733 (idle 1 800) | 231 | 614 | 45 |

`ScalarLayer.render` fragt **je Frame** fünf `gl.getParameter` plus `MAX_VERTEX_ATTRIBS` und bis zu
16 `getVertexAttrib` ab (`ScalarLayer.ts:250–283`), der WindLayer ähnlich — bei laufender Partikel-
Animation (jeder Frame ein Repaint) sind das > 1 000 synchrone GL-Zustandsabfragen je Sekunde.
**Unter SwiftShader** sind das ~30 % des Hauptthreads; auf einer echten GPU sind es IPC-Round-Trips in den
GPU-Prozess, deren Kosten hier NICHT gemessen sind (Falle 4). Die Long Tasks am Klick (292–460 ms) sind
MapLibre-Placement/Render + `(program)` — nicht das Dekodieren. Kein Hebel für das erste Bild, aber
einer für die Reaktion auf den Klick und für jede Slider-Bewegung (V-LZ-6).

## 6. Was dominiert — die Rechnung

| Anteil am Klick → erstes Bild | Desktop, Edge kalt | Desktop, Edge warm | iPhone-Emu 4×, Fast 4G, warm |
|---|---:|---:|---:|
| Klick → Fetch-Start (React-Commit, Effekt) | 80–145 ms | 80–150 | 150–530 |
| `index.json` (nur wenn > 60 s her) | +93 warm … **+1 360 kalt** | +93 | +150 (geschätzt) |
| TTFB erstes Bild | **600 (p50) … 1 430 (p90)** | 70 | 60–120 |
| Body-Übertragung (Böen 130 KB / Wind 490 KB) | 5–25 | 5–25 | 230 / **930** |
| Bitmap + getImageData + putImageData | 15–25 | 15–25 | 40–60 |
| Wind: Worker-Blend + gepackte Textur | +270 | +270 | +280 |
| `texImage2D` + nächster Frame | 10–35 | 10–35 | 15–90 |
| **Summe (Scalar-Layer / Wind)** | **0,9–2,9 s** | **0,3 / 0,58 s** | **0,5 / 1,6 s** |

**Dominant ist der kalte jsDelivr-TTFB (Origin-Anteil), verstärkt durch den Index-Round-Trip nach
60 s. Auf dem Handy kommen die Wind-Bytes und der Long Task am Klick hinzu.** Dekodieren und GPU sind
zusammen unter 5 % (Desktop) bzw. unter 10 % (Handy).

## 7. Maßnahmen — gereiht nach Zeitgewinn ÷ Aufwand

| # | Maßnahme | Gewinn je Klick (gemessen/hergeleitet) | Aufwand | Gate |
|---|---|---|---|---|
| **M1** | **Edge-Warm-up nach dem Publish:** im Publish-Schritt (nach `purgeIndexUntilFresh`) jede Datei des jüngsten Laufs + `index.json` + `hsurf-v1.png` einmal über `cdn.jsdelivr.net` mit Browser-`Accept-Encoding` abrufen (Node-`fetch`, Concurrency 8, ~13 MB je Publish, 8×/Tag → ~100 MB/Tag von jsDelivr, 0 von Netlify). Optional zusätzlich `gcore.`/`testingcf.jsdelivr.net`, damit auch die anderen Provider-Origins warm sind. | Kalter TTFB **0,60 → 0,17 s (p50), 1,43 → 0,56 s (p90)**: −0,4 … −0,9 s bei jedem ersten Klick je Datei/Region; der US-Edge des Runners wird HIT. | klein: ~40 Zeilen in `publish-repack.mjs`, Fehler nicht fatal | **Warm-Cron-/Publish-Mechanik ⇒ Jans Freigabe** (Datenrepo-Workflow) |
| **M2** | **Index vom kritischen Pfad:** in-memory stale-while-revalidate — Klick nutzt den vorhandenen Index sofort, wenn er < 15 min alt ist, und stößt die Erneuerung im Hintergrund an; erster Index-Abruf bleibt wie heute. Dazu die Bild-URLs auf **`@main/runs/<lauf>/…`** statt `@<sha>` umstellen (Lauf-Pfade sind inhaltlich unveränderlich, `keep: 4` hält sie 12 h): ein 15 min alter Index bleibt auflösbar, `hsurf-v1.png` und die älteren Läufe **überleben den Publish** (24 h Edge-TTL), und M1/M3-Füllungen gelten über Force-Pushes hinweg. Kill-Switch `?repackidx…` bleibt. | **−93 ms** (warm) bis **−1,36 s** (nach Purge) bei jedem Klick > 60 s nach Laden; hsurf/Vorläufe: −0,5 s je Publish und Region | klein–mittel: `cdnIndex`/`resolveRunFromRepackIndex` + `stepUrl`/`repoUrl` + Verifier `verify:repack` (URL-Form) | Rule 2: hinter Flag mit Fallback; 404-Klebrigkeit von `@main` prüfen (Client fragt nur gelistete Pfade) |
| **M3** | **Prefetch der wahrscheinlich nächsten Layer** nach dem Hero-Layer (`onSettled` + `requestIdleCallback`): die Jetzt-Schritte von Böen, Gewitter, Rotation, Schnee, Blitzprognose (zusammen ≈ **0,45 MB**, `priority: 'low'`, nur bei `!navigator.connection?.saveData`); die Bilder landen im `immutable`-HTTP-Cache. | Klick → erstes Bild **≈ 0,1–0,15 s Desktop / 0,2–0,3 s Handy** für vorgeladene Layer (nur Dekodieren + Render); wärmt zugleich den Edge für andere Nutzer der Region | klein–mittel: `warmLayerNow()` neben `warmPlanFor` in `prefetch.ts`, URL-Bau aus dem Index; darf den Hero-Layer nicht bremsen (gemessen in LE2: Priorität verteilt keine Bandbreite — deshalb erst NACH `onSettled`) | Entscheidung Jan: +0,45 MB je Sitzung (mobil?) — Vorschlag: Desktop immer, mobil nur bei WLAN/`effectiveType === '4g'` |
| **M4** | **Fetch vor dem Render starten:** `toggle(key)` ruft den Installer (`installXRef.current`) synchron VOR `setActive`; die Ref-Guards verhindern den Doppelstart. | **−80 … −150 ms Desktop, −150 … −530 ms Handy** (Long Task 408 ms am Klick lag vor dem Fetch) | klein: 10 Zeilen in `toggle`/`layerRowDeck` | keins |
| **M5** | **Wind auf dem Handy sequenzieren:** Frame `a` (näher) mit `'high'` zuerst, `b` erst nach dem ersten Frame; das Blend wartet ohnehin auf beide. | Handy Fast 4G: erster Frame nach 245 statt 490 KB ⇒ **−0,45 s**; Desktop 0 | klein: `pump`-Reihenfolge in `fetchIconD2Wind` (nowOnly) | keins |
| **M6** | **WebP lossless** für Wind/Temp/Böen/Gewitter (−25…−33 %); PNG bleibt Fallback (`createImageBitmap` kennt WebP ab Safari 14). | Handy 4G: **−80 ms je Böen-Datei, −130 ms je Wind-Datei** (Wind gesamt −260 ms); Desktop ≈ 0 | mittel–hoch: Encoder braucht `sharp` (native) im Runner = **Dependency-Änderung**; `exact`-Alpha für Grau+Alpha; `verify:repack` auf maskierte Gleichheit erweitern; Familie mit zwei Endungen im Index | **Dependency ⇒ Jans Freigabe**; nach M1–M5 |
| **M7** | **GL-Zustand cachen statt je Frame abfragen** (`getParameter`/`getVertexAttrib` in `ScalarLayer.render`/`WindLayer.render` einmal beim `onAdd` bzw. über MapLibres eigenen Context-Tracker). | Unter SwiftShader ~30 % Hauptthread; Real-GPU-Wert offen — zuerst messen | mittel | **Shader-/WebGL-Pipeline ⇒ STOPP & FRAGEN**; Real-Device-Messung vor jeder Änderung |
| **M8** | **Letztes Bild je Familie aus IndexedDB sofort zeigen** (wie der Wind-`localStorage`-Jetzt-Cache), klar als „vorheriger Lauf" markiert, bis das frische Bild da ist. | Wiederkehrende Nutzer: wahrgenommen **0 ms**; Erstbesuch 0 | mittel: IDB-Schreiben je Frame, Ehrlichkeits-Stempel im Readout | Ehrlichkeitsregel: Alter sichtbar |
| **M9** | Kleiner Index (`latest.json`, nur jüngster Lauf, 2 KB br) | −7 KB je Abruf ≈ 0–20 ms; sinnvoll nur als Beifang von M2 | klein | keins |

**Nicht empfohlen, mit Begründung:**
- *Bündelung beider Schritte in eine Datei:* das erste Bild braucht heute nur die ERSTE Datei
  (§1); eine Bündelung ließe es auf beide warten, und der zweite Abruf kostet auf HTTP/3 keine Zeit.
- *Progressives Rendering (grob zuerst):* die Bilder sind schon 608×373; 130 KB sind auf Desktop
  30 ms, auf 4G 230 ms — ein Vorschau-Bild spart weniger, als sein eigener TTFB kostet. M8 ist die
  bessere „sofort etwas zeigen"-Variante.
- *Service Worker / eigener Cache für CDN-Bilder:* der HTTP-Cache mit `immutable` tut das bereits;
  ein zweiter Cache verdrängt Wetterdaten (V-BW-7-Lehre, `sw.js:64` reicht das CDN bewusst durch).
- *Anderer Host statt jsDelivr* (`raw.githubusercontent.com` 0,26–0,48 s kalt): kein Vorteil gegenüber
  M1 (0,17 s), und ohne die Purge-/Immutable-Semantik.

**Erwartete Summe** (Desktop, Edge kalt, Klick nach > 60 s): heute 0,9–2,9 s → mit M1 + M2 + M4
**≈ 0,3–0,6 s**; für per M3 vorgeladene Layer **≈ 0,1–0,15 s**. Handy (Fast 4G, 4×): Böen 0,5–0,9 s →
**≈ 0,3–0,5 s** (M4 + M1), Wind 1,6 s → **≈ 1,0 s** (M5), mit M6 **≈ 0,8 s**.

**Vorgeschlagene Reihenfolge:** M4 + M2 (Client, klein, sofort messbar) → M1 (Publisher, Jans Gate) →
M3 (Jans Byte-Entscheidung) → M5 → M6/M7/M8 nach Real-Device-Messung.

## 8. V-Einträge

- **V-LZ-1** Edge-Warm-up nach dem Publish fehlt (§4.2/§4.3) — M1.
- **V-LZ-2** `cdnIndex()` steht nach 60 s wieder vor dem ersten Bild (§5.1) — M2.
- **V-LZ-3** Bild-URLs tragen den Commit-SHA; jeder Force-Push macht auch unveränderte Dateien
  (`hsurf-v1.png`, drei ältere Läufe) am Edge kalt — M2 (`@main`-Pfade).
- **V-LZ-4** Klick → Fetch-Start 80–530 ms, weil der Installer erst im Effekt nach dem Commit feuert — M4.
- **V-LZ-5** Wind lädt auf dem Handy beide Bracket-Frames vor dem ersten Bild (490 KB) — M5.
- **V-LZ-6** `ScalarLayer.render`/`WindLayer.render` fragen je Frame > 20 GL-Zustände ab; unter
  SwiftShader ~1 s je 3 s Hauptthread (§5.3) — Real-GPU-Messung nötig, dann M7.
- **V-LZ-7** WebP lossless spart 25–33 % bei vier Familien; Grau+Alpha braucht `exact` — M6.
- **V-LZ-8** Keine Real-Device-Messung (iPhone/Safari) — alle Handy-Werte sind Chromium-Emulation.
- **V-LZ-9** Schnee-Lauf unter Slow 4G ohne erfasste Fetch-Ereignisse — nachmessen (längeres Fenster).
- **V-LZ-10** `Vary: Accept-Encoding` trennt Cache-Varianten; Verifier und Warm-up müssen Browser-
  `Accept-Encoding` senden (§2 Falle 1).

## 9. Werkzeuge dieser Messung (Scratchpad, nicht im Repo)

`measure-layer.mjs` (Klick-Wasserfall, Desktop/iPhone, CPU-/Netz-Drossel, JSONL-Ausgabe),
`decode-bench.mjs` (PNG vs. WebP dekodieren), `fmt.mjs` (Formatvergleich mit `sharp`),
`profile-click.mjs` (CDP-Profiler nach dem Klick). Rohdaten: `prod-desktop.jsonl`, `prod-iphone.jsonl`,
`desktop-chain.log`, `mobile-chain.log`, `profile.log`. Bei Bedarf nach `scripts/` überführen (V-LZ-11:
ein `verify:layer-ladezeit`-Harnisch, der Fetch-Start, TTFB und erstes Bild je Layer protokolliert).

## 10. LZ1 — M4 + M2 + M1 + M3 umgesetzt (2026-09-07, Jans „ja starte damit"; uncommitted)

### 10.1 Was gebaut wurde

| Maßnahme | Code | Rückfall |
|---|---|---|
| Schalter | `src/sources/loadTuning.ts` — `lzEnabled()`: `?lz=0` / `localStorage.lz = '0'` stellt für M2/M3/M4 das Verhalten vor LZ1 her; ohne DOM (Verifier) an | — |
| **M4** Fetch vor dem Render | `MapView.tsx`: `startLazyInstall(key)` (In-Flight-Guard je Layer) — aus `toggle()` VOR `setActive` **und** aus den fünf Lazy-Effekten (Böen, Gewitter, Blitzprognose, Schnee, Rotation); Wind/Temp über ihre eigenen Guards | `?lz=0`: Installer nur im Effekt |
| **M2a** Index stale-while-revalidate | `repackSource.ts`: `cdnIndex()` bedient einen Aufruf nach dem 60-s-TTL sofort aus dem Speicher, solange der Index < 15 min alt ist und ein Dokument geliefert hat (`INDEX_STALE_MAX_MS`); die Erneuerung läuft daneben und ersetzt ihn, sobald sie ein Dokument hat. `warmCdnIndex()` gibt DASSELBE Dokument an die Abschnitts-Auflösung (Lauf und Abschnitt aus einer Datei, §32.2). Gescheiterte Abrufe werden nie als „alt" weitergereicht | `?lz=0`: TTL 60 s hart |
| **M2b** `@main`-Pfade | `stepUrl`/`repoUrl` (Client **und** `scripts/lib/repackManifest.mjs`, `URL_REF`) nennen die Branch-Ref; `stepUrlPinned`/`repoUrlPinned` die Commit-Form. `loadRgba` versucht bei 404 EINMAL die gepinnte URL. Der `hsurf`-Cache-Schlüssel ist damit publish-stabil | 404 → gepinnte URL; `?lz=0`: gepinnt |
| **M1** Edge-Warm-up | `repackManifest.mjs`: `warmUrlsFor(index)` (Index, hsurf, jede Datei des jüngsten Laufs, beide Formen, Schritte aufsteigend — **413 URLs**) + `warmCdnFiles()` (Concurrency 8, Chromes `Accept-Encoding`, Body gelesen, 404 unter `@main` → Purge + ein Wiederholungsversuch, nie fatal). `publish-repack.mjs` Schritt 8 nach Push + Purge; `@main` nur bei frischem Zeiger; `REPACK_NO_WARM=1` lässt es aus; `published.json` trägt `cdn.warm` | Fehler = nur ein kalter Eintrag |
| **M3** Prefetch | `src/sources/layerPrefetch.ts`: nach dem ersten Bild des Hero-Layers (Wind/Temp-Ref gesetzt), im `requestIdleCallback`, einmal je Mount, nie eingebettet: Jetzt-Bracket von Böen → Gewitter → Rotation → Schnee → Blitzprognose, sequenziell, `priority: 'low'`, Body gelesen (sonst kein Cache-Eintrag). Nicht bei `saveData`, nicht auf 2g/3g; Safari (keine `connection`-API) lädt | `?lz=0` |

Live geprüft: `warmCdnFiles` gegen vier echte URLs — 4/4 ok, 2 HIT / 2 MISS, 0,9 MB in 0,86 s.

### 10.2 Gemessen — A/B, lokale Prod-Previews gegen das echte CDN (alt `dist-old` :5220 = Stand vor LZ1, neu :5221; je Lauf ein frischer isolierter Kontext; Lauf 15z, Commit `0e446b0`)

Desktop 1440×900, Klick 12 s nach dem Laden (ms ab Klick bis erster Frame):

| Layer | alt (Edge) | neu (Edge) | Bemerkung |
|---|---:|---:|---|
| Böen, Runde 1 | **765** (MISS 720 / 2 083) | **156** (HIT / MISS 852) | neu: `gust-003` lag schon im Browser-Cache (Prefetch), das erste Bild braucht nur eine Datei |
| Gewitter, Runde 1 | **431** (MISS 397 / 464) | **200** (MISS 21 / 21) | `@main`-MISS mit warmem Origin |
| Böen, Runde 2 (Edge warm) | 198 (HIT) | 198 (Browser-Cache) | gleich — mit warmem Edge trägt M4 nur ~15 ms |
| Gewitter, Runde 2 (Edge warm) | 234 | 250 | Rauschen |
| Böen, Klick **65 s** nach Laden | **502** (Index 268→368, dann Bilder 370→434) | **386** (Index 205→302 **parallel** zu den Bildern 222→312) | M2a: der Index steht nicht mehr vor dem Bild; −116 ms warm, nach einem Purge bis −1,36 s |

Prefetch-Nachmessung (neuer Build nach dem Abort-Fix, Klick 20 s nach dem Laden, alle Bilder aus dem Browser-Cache — `transferSize 0`):

| Layer | erster Frame neu | Vergleich alt (warmer Edge) |
|---|---:|---:|
| Böen Desktop | **184** | 198–305 |
| Gewitter Desktop | **220** | 234 |
| Rotation Desktop | **204** | 217 |
| Böen iPhone-Emu 4× Fast 4G | **394** (Bitmap 71/92 ms unter Drossel) | **665** (HIT, Body 623) |
| Rotation iPhone-Emu 4× Fast 4G (Runde 1) | **433** (HIT, vom Prefetch eines früheren Laufs gewärmt) | **1 133** (MISS 1 028 / 1 130) |

Was übrig bleibt (Desktop, alles im Cache): Klick → Fetch-Start 55–65 ms, Cache-Lesen ~50 ms,
Bitmap 10–20 ms, Tick bis `texImage2D` ~40 ms, Frame ~10 ms = **≈ 180–220 ms** — davon ist nichts
mehr Netz. Ein erster A/B-Lauf zeigte nur `gust-003` im Cache: der Prefetch-Effekt hing an `nowcastTick`
und sein Cleanup brach den laufenden Prefetch bei jedem Tick ab — behoben (Abbruch nur beim Unmount).

**Nebenbefund:** ein `@main`-MISS antwortete in 21 ms (Gewitter, Runde 1) — jsDelivr kennt den Inhalt
am Origin offenbar je Commit+Pfad, unabhängig von der Ref. Und `x-cache: HIT, MISS` zeigt zwei
Cache-Schichten (Shield + Edge).

### 10.3 Verifikation

| Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` | grün |
| `verify:repack` | **348/348** (vorher 325) — neu 18 Prüfungen + 5 Rahmenprüfungen: Schalter, Prefetch-Erlaubnis/-Familien/-Dateien, URL-Regel `@main` Client == Publisher, gepinnte Form, Warm-up-Liste (Form, Reihenfolge, Vollständigkeit), SWR mit gestellter Uhr (sofort bei 70 s, Abschnitt aus demselben Dokument, frisch nach Erneuerung, Warten jenseits 15 min, gescheiterter Abruf nie „alt", `?lz=0` = altes Verhalten), Quelltext-Verträge M1/M3/M4. Eine Alt-Prüfung („Schritt-URL enthält Commit UND Lauf") folgt der neuen Regel |
| `verify:layer-erstbild` | **37/37** (eine Regex an die neue `loadRgba`-Signatur angepasst) |
| `verify:health` | **20/20** |
| `verify:routing` (im Build) | **153/153** |
| `npm run budget` | alle Budgets eingehalten |
| Konsole in allen A/B-Läufen | 0 Fehler, 0 Warnungen |

Fünf Selbstverifikationsfragen: (1) Funktionserhalt — jeder Layer lädt wie zuvor, Rückfall je Maßnahme
benannt, `?lz=0` stellt den Stand vor LZ1 her; (2) Desktop pixelgleich — keine UI-Änderung, nur Reihenfolge
und URLs; (3) Touch-Targets unverändert; (4) Konsole sauber (oben); (5) Long Tasks: keine neuen — die
Prefetch-Abrufe laufen mit `'low'` im Leerlauf; ein 53-ms-Task beim Rotation-Klick war schon vorher da.

### 10.4 Offen / Jans Hand

- **M1 wird erst mit dem nächsten Push von `publish-repack.mjs` + `repackManifest.mjs` wirksam** — der
  Datenrepo-Workflow zieht diese Skripte aus `buscosun-web` (`workflow-build.yml`). Kein Commit ohne
  Auftrag; Prod-Dispatch ist Jans Gate. Bis dahin wärmt nur der Prefetch der Nutzer den Edge.
- Die Zahlen sind lokale Previews gegen das echte CDN; nach dem Deploy in Prod nachmessen (V-LZ-12).
- M5 (Wind mobil sequenzieren), M6 (WebP), M7 (GL-Zustand), M8 (IDB-Bild) unverändert offen.
- V-LZ-13: der Prefetch lädt auf iPhone/Safari immer (keine `connection`-API) — ≈ 0,45 MB je Sitzung;
  wenn Jan das nicht will: `isMobileMap` als zusätzliche Sperre (eine Zeile).
