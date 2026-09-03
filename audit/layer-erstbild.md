# Layer-Erstbild — Diagnose LE0 (2026-08-28)

**Anlass (Jan):** „Mir dauert es teilweise zu lange, bis ein Layer dargestellt wird — sowohl beim
Regenradar als auch bei der Wetterkarte. Kannst du mögliche Verbesserungen recherchieren?"

**Auftrag dieser Phase:** Diagnose, kein Code. Gemessen wurde in **Produktion** (buscosun.com) mit dem
Stand vom 2026-08-28, dazu CPU-Kosten in Node am echten Datenmaterial. Hebel sind gereiht, mit
erwarteter Wirkung, Aufwand und STOPP-Kennzeichnung; gebaut wird erst nach Jans Wahl (§7).

---

## 0. Der Befund in fünf Sätzen

1. **Wetterkarte, Kaltstart:** der Wind steht nach **≈ 4,2 s**, die Temperatur erst nach **≈ 18,5 s** —
   die 14 s Differenz sind ausschließlich das Höhenmodell: **90 Terrarium-Kacheln von S3** (11,5 s,
   TTFB bis 2,4 s je Kachel, sechs parallel) plus **2,9–3,4 s Hauptthread** für `buildDemImage`, und
   `fetchIconD2Temp` fragt die zwei Temperaturbilder (je 94 KB, 0,36 s) erst **danach** an (V-BW-42).
2. **Wetterkarte, Niederschlag:** erstes Radarbild nach **≈ 11–12 s** — RADOLAN-RV-Tar 2,4 MB durch den
   Netlify-Proxy (0,9 s TTFB, **8,4 s Download** im Wettlauf mit INCA 1,4 MB, Kacheln, Fonts), danach
   bz2 (1,3–1,6 s) und Tar-Dekode (0,5 s) in Workern; parallel blockieren INCA-Parsen (0,8 s) und das
   DEM (3,2 s) den Hauptthread.
3. **Regenradar (DE):** Karte nach **≈ 8–12 s, obwohl der RV-Tar schon im Cache lag** — die Kette
   Tar → bz2-Worker → Dekode-Worker → React-Mount → Stil/Fonts läuft strikt nacheinander, und das
   **INCA-NetCDF eines Nachbarlands blockiert den Hauptthread 2,5 s** (jsfive + 3,3 Mio. Zellen), noch
   bevor die eigene DE-Karte steht.
4. **Struktur, nicht Bytes:** die Datenanfragen starten erst **2,4 s nach dem Aufruf** (nach Boot,
   Route-Chunk, MapView-Mount), die Manifeste kosten 0,4–0,75 s TTFB, und vor dem ersten Bild steht
   Arbeit, die das erste Bild nicht braucht (DEM, Nachbarländer, 25 Frames für 1, 22 Punkt-Abrufe).
5. **Latenter Ausfall:** fällt die WASM-bzip2-Initialisierung über 4 s (langsames Netz, belastete CPU),
   läuft die **ganze Sitzung** auf pure-JS-bz2 — **33 s je RV-Tar** (Node), lokal einmal beobachtet
   (radolanWorker erst 52 s nach dem Download). V-WF-10 gilt auch fürs Regenradar.

---

## 1. Messmethodik und Fallen

- **Werkzeug:** Chrome DevTools MCP, Desktop, 4 Kerne (kein Mobile-Real-Device — Vorbehalt §5).
  Resource Timing (`setResourceTimingBufferSize(3000)` — der Standardpuffer von 250 Einträgen läuft
  durch 90 DEM-Kacheln + Fonts + Kartenkacheln über, dann fehlen die späten Datenabrufe), Long Tasks
  über `PerformanceObserver({type:'longtask', buffered:true})` **nach** dem Laden abgefragt (der
  `initScript` des MCP läuft auf Prod-Seiten nicht in der Hauptwelt), ein Trace mit Thread-Zuordnung
  (`scratchpad/trace-longtasks.mjs`).
- **Prod statt Preview:** die lokale Preview war für die Netzphase unbrauchbar — `public/latest-*.json`
  sind zwei Tage alt (Lauf 2026082609 → Staleness-Guard → Verzeichnis-Scan über den Vite-Proxy, 3,4 s je
  Listing, Wind über GRIB 4 × 1 MB). Für die Netzkette zählt nur Prod.
- **Messfalle 1 — zwei vergessene Dev-Server:** `vite.js` (PID 18476, seit 25.08.) und
  `vite.js --port 5201` (PID 29056, seit 25.08.) liefen mit **100–150 % CPU** und verlängerten jede
  Hauptthread-Aufgabe um das 2–4-Fache (DEM-Bau 8,1 s statt 2,9 s; Regenradar-Erstbild lokal
  **130 s**). Beide beendet; alle Zahlen unten stammen aus Läufen **danach** oder sind als „unter Last"
  markiert.
- **Messfalle 2 — warme Caches:** der Regenradar-Tab frischt alle 5 min den jüngsten RV-Lauf nach und
  legt ihn in die Cache-API (`radolan-rv-tar-v1`); ein zweiter Tab derselben Origin bekommt den Tar dann
  ohne Netzabruf (kein Resource-Timing-Eintrag). Kalt heißt: neuester Lauf, den noch niemand angefragt hat.
- **Messfalle 3 — der SW ist network-first:** `public/sw.js` bedient Wetterdaten erst aus dem Netz und
  legt jede Antwort (auch 2,4-MB-Tars und 1,4-MB-NetCDFs) in `bsc-data-v4` ab; „aus dem SW" heißt also
  nie „schnell", nur „offline-fähig".
- **Node-Benches** (`scratchpad/bz2-time2.mjs`, `parse-time.mjs`, `compositor-bench.mjs`) am echten
  Material dieses Tages: RV-Tar `DE1200_RV2608281200` (2,40 MB → 66,0 MB), INCA-NetCDF 1,28 MB
  (11 × 431 × 701), rzc-HDF5 182 KB (710 × 640).

---

## 2. Zeitleisten (Produktion, ms ab Navigationsstart)

### 2.1 Wetterkarte, Kaltstart `/wetterkarte` (Wind + Temperatur, Nur-Jetzt-Fenster)

| Schritt | Start | Ende | Bemerkung |
|---|---:|---:|---|
| Dokument (Route-Shell, über SW network-first) | 0 | 930 | TTFB 930 ms — Netlify + SW-Umweg; DevTools-Insight: „Server responded quickly: FAILED", −788 ms möglich |
| `index.js` 320 KB | 516 | 715 | |
| Route-Chunk · `MapView` 258 KB · `maplibre` 1 055 KB · 20 Nebenchunks | 744 | 1 309 | ein Round-Trip nach `index.js`; nicht vorgeladen |
| Boot (Module-Eval 535 ms + GC, MapView-Mount, Stil) | 1 300 | 2 400 | Long Tasks 122/149/127 ms |
| `/latest-grib.json` · `/latest-wind.json` | 2 433 · 2 632 | 3 197 · 3 270 | **TTFB 748 / 566 ms**; erst nach dem Mount angefragt |
| Wind: Zeiger `runs/2026082806/index.json` → 2 PNG (je 233 KB) | 3 272 | **4 105** | das **Prod-Wind-Manifest trägt keinen `repack`-Abschnitt** (06z, 08:03 UTC) ⇒ der Zeiger-Fallback aus BW-9 rettet den Weg, +1 Round-Trip |
| **Wind sichtbar** | | **≈ 4 200** | |
| Temperatur: `hsurf-v1.png` | 3 202 | 3 562 | |
| Temperatur: **90 Terrarium-Kacheln z7** (S3, 6 parallel, TTFB 8 ms … 2 429 ms) | 3 574 | **15 065** | 11,5 s — die ICON-D2-Domäne (−3,9 … 20,3 E) braucht 10 × 9 Kacheln, nicht „~50" wie der Kommentar sagt |
| Temperatur: `buildDemImage` (700 Zeilen × 3 × 3 Abtastungen) | 15 077 | 17 973 | **Long Task 2 896 ms** (Wiederholung mit warmen Kacheln: 3 245 ms) |
| Temperatur: 2 PNG (je 94 KB) | 17 972 | 18 331 | erst nach dem DEM angefragt (`iconD2TempSource.ts:224`) |
| **Temperatur sichtbar** | | **≈ 18 500** | |

Die Wiederholung mit warmen HTTP-Caches (Kacheln 1,3 s) ergibt Temperatur ≈ 9 s — der DEM-Bau bleibt.

### 2.2 Wetterkarte, Niederschlag `/wetterkarte/niederschlag` (sauberer Lauf, Kacheln warm, RV-Tar kalt)

| Schritt | Start | Ende | Bemerkung |
|---|---:|---:|---|
| INCA-NetCDF 1,37 MB (GeoSphere) | 680 | 3 461 | TTFB 1 013 ms; **Long Task 769 ms** direkt danach = HDF5-Parsen auf dem Hauptthread |
| rzc STAC-Item 153 KB → HDF5 168 KB | 682 | 3 976 | Parsen 0,17 s (Node) |
| **RADOLAN-RV-Tar 2,40 MB** über `/_dwd_opendata` | 751 | **9 129** | TTFB 899 ms, **Download 7,5 s** — im Wettlauf mit INCA, rzc, Kacheln, Fonts (allein per curl: 2,0–2,5 s, `Cache-Status: fwd=miss` bei jedem Abruf) |
| `hsurf` → DEM-Kacheln (warm) → `buildDemImage` | 4 253 | 8 786 | **Long Task 3 245 ms** (5 541–8 786) — belegt den Hauptthread, während der Tar herunterlädt |
| bz2-Worker (WASM) + Dekode-Worker | 9 130 | ≈ 11 200 | 1,3–1,6 s + 0,5 s (isoliert gemessen, §2.4) |
| **Niederschlag sichtbar** | | **≈ 11 500–12 000** | ohne Resource-Marker; belegt über Konsolenzeile und Worker-Zeiten |

Die Compositor-Vorbereitung (`primeDe/primeAt/primeCh`, Index-Maps im `precipIndexWorker`) kostet
0,18 s (RADOLAN) und 0,08 s (lon/lat) je Quelle im Worker (Node) und liegt nicht auf dem kritischen Pfad,
**außer** wenn ein Tick zwischen `nowcastRef.current = await …` und `await primeDe` fällt — dann rechnet
`build()` die Index-Map synchron nach (`MapView.tsx:1980–1981`, dasselbe für INCA/rzc).

### 2.3 Regenradar `/regenradar?ort=Kassel&land=de` (Prod, Trace mit Thread-Zuordnung, RV-Tar **warm**)

| Zeit | Thread | Dauer | Was |
|---:|---|---:|---|
| 394–613 | — | | Dokument TTFB (zwei Läufe) |
| 491 → 1 075 | Netz | | `index.js`, `NowcastRoute` 111 KB, `maplibre` 1 055 KB (Background-Parse 406 ms) |
| 1 075 | Hauptthread | **735 ms** | Module-Eval 535 ms + MinorGC 381 ms |
| 2 125 · 2 743 · 3 046 | Hauptthread | 266 · 243 · 246 ms | Layout/Stil des Decks |
| 2 425 | Netz | | **erst jetzt** starten alle Datenabrufe: Manifest, INCA, rzc-STAC, KONRAD3D-Listing (79 KB) + XML (828 KB), 22 × Brightsky (`buildNowcast`-Fächer), UV |
| 2 986 → 3 948 | Worker | | bz2-Worker-Isolate + WASM-Init (≈ 1 s bis zur ersten Arbeit) |
| 3 948 | bz2-Worker | **6 689 ms** (unter Last; isoliert 1 302–1 582 ms, §2.4) | WASM-Entpacken 2,4 → 66 MB |
| 5 727 → 8 205 | Hauptthread | **2 477 ms** | **INCA-NetCDF parsen** (jsfive `rr.value` + 3,3 Mio. Zellen `precipToU8`) — für einen DE-Ort, bevor dessen eigene Karte steht |
| 10 675 | radolanWorker | 469 ms | 25 Frames untar + dekodieren |
| 11 152 | Hauptthread | **773 ms** | React-Render des Stacks (`RadarMap` + Zeitachse + Punkt-Streifen) |
| 12 179 → 12 802 | MapLibre-Worker | 395 + 188 ms | Stil `liberty`, Fonts, Kacheln |
| 12 416 | Netz | | Ländermasken |
| **≈ 12 500** | | | **Radarbild sichtbar** (LCP „Radar wird geladen …" bei 2,4 s) |

Zweiter, weniger belasteter Lauf derselben Seite: Mount ≈ 8 s (INCA-Parse 820 ms, weitere Long Tasks
559/177/290 ms). **Kalt** kommen 2,0–3,0 s Tar-Download hinzu (per Browser gemessen 2 993 ms für
2,39 MB, 12:5x UTC).

Die lokale Preview (mit den zwei Alt-Servern) brauchte **130 s** bis zum ersten Radarbild: der
radolanWorker startete 52 s nach dem Tar-Download — konsistent mit dem pure-JS-Rückfall (§2.4, V-WF-10),
den der 4-s-WASM-Timeout unter CPU-Last auslöst. Nicht als Prod-Zahl gewertet, aber als Mechanismus belegt.

### 2.4 CPU-Kosten je Baustein (gemessen, nicht geschätzt)

| Baustein | Wo | Kosten | Quelle |
|---|---|---:|---|
| bz2 WASM, RV-Tar 2,40 → 66,0 MB | Worker (Browser, frischer Worker inkl. Init) | **1 582 / 1 574 / 1 302 ms** | `bz2Worker` direkt angesprochen |
| dito | Node | 1 673–1 919 ms + **325 ms verschenkt** für den ersten 8-MB-Versuch (`WASM_DEST_STEPS`, `bz2Worker.ts:43`) | `bz2-time2.mjs` |
| **bz2 pure-JS** (Rückfall nach 4-s-WASM-Timeout, `bz2Worker.ts:29`) | Worker | **33 141 ms** | `bz2-time2.mjs` — 20× WASM |
| `decodeRvTar` (25 × 1100 × 1200) | Worker | 469 ms (Browser) / 818 ms (Node) | Trace / Node |
| INCA-NetCDF parsen (`geosphereIncaGrid.ts:100`) | **Hauptthread** | **2 477 ms** (Browser) / 1 015 ms (Node: `rr.value` 818 + lat/lon 197) | Trace / `parse-time.mjs` |
| rzc-HDF5 parsen (`meteoSwissRadar.ts:79`) | **Hauptthread** | 168 ms (Node) | `parse-time.mjs` |
| `buildDemImage` (Terrarium z7, 700 Zeilen, 3 × 3-Max) | **Hauptthread** | **2 896–3 245 ms** | Long Tasks, auf die Millisekunde vor dem Temperatur-Abruf |
| `PrecipCompositor` Konstruktor (`gridLatLon` + `pickCountry` × 307 200) | Hauptthread | 41 ms | `compositor-bench.mjs` |
| `buildIndexMap` radolan / lonlat | Worker (Rückfall Hauptthread) | 178–194 / 77 ms | `compositor-bench.mjs` |
| Module-Eval Boot (MapView/Nowcast + maplibre) | Hauptthread | 535 ms + GC 381 ms | Trace |
| React-Mount des Radar-Stacks | Hauptthread | 773 ms | Trace |

---

## 3. Warum es lange dauert — vier Ursachen, die sich addieren

**A — Serielle Ketten mit spätem Start.** Daten werden erst angefragt, wenn React die Karte gemountet
hat (2,4 s nach dem Aufruf, beide Seiten). Danach hängt alles an Manifest (0,4–0,75 s TTFB) → Zeiger →
Bild bzw. Tar → bz2 → Dekode → Mount. Kein Schritt überlappt mit dem vorigen, obwohl die meisten
voneinander unabhängig sind (Manifest und Shell, Temperaturbilder und DEM, Tar-Download und
Worker-Start).

**B — Arbeit vor dem Erstbild, die das Erstbild nicht braucht.** 90 DEM-Kacheln + 3 s Bau, bevor die
Temperatur ein einziges Bild anfragt; INCA und rzc (1,5 MB + 2,6 s Hauptthread) für einen DE-Ort,
bevor dessen Karte steht; 25 RV-Frames dekodiert für das eine Frame „jetzt"; 22 Brightsky-Abrufe des
Punkt-Nowcasts und 0,9 MB KONRAD3D im selben Moment wie der Tar.

**C — Hauptthread-Blockaden im Ladefenster.** DEM 2,9–3,4 s, INCA 0,8–2,5 s, Boot 0,7 s, Mount 0,8 s.
Sie kosten nicht nur ihre Dauer: jeder `setState`/Tick, der ein fertiges Bild zeichnen würde, wartet
hinter ihnen (GBW10 hatte den DEM-Bau als „vorbestehend" markiert; er ist der größte einzelne Posten).

**D — Netz.** RV-Tar 2,4 MB je Aufruf durch einen Proxy, der nie trifft (`fwd=miss`; bewusst, §26.3);
Terrarium-S3 mit 0,8–2,4 s TTFB je Kachel; Netlify-Dokument 0,6–0,9 s; GeoSphere-Grid-API 1–36 s TTFB
(am 28.08. per curl 7,5 s und 36 s gesehen — die Quelle selbst ist unzuverlässig, V-RL-2).

---

## 4. Hebel — gereiht nach Wirkung ÷ Aufwand

Alle Hebel erhalten jede Funktion, jeden Wert und jede Verortung (KL9–KL11 bleiben unberührt). Erwartete
Wirkung ist aus den Zeitleisten hergeleitet, nicht gemessen — Messung ist Teil des jeweiligen Gates.

| # | Hebel | Erwartete Wirkung | Aufwand | Eingriff / Gate |
|---|---|---|---|---|
| **H1** | **DEM als vorgerechnetes Bild** — `buildDemImage` einmal in Node ausführen (dieselbe Funktion, dieselben Terrarium-Kacheln, Zellmitten wie KL6) und als `dem-v1.png` (Grau, 700 × ~530, ≈ 150–250 KB) neben `hsurf-v1.png` ablegen; der Client lädt das Bild statt 90 Kacheln zu holen und zu rechnen. Byte-Gleichheit gegen den Browser-Weg im Verifier belegbar (Muster BW-1); heutiger Weg bleibt benannter Fallback (Rule 2) | **Temperatur 18,5 → ≈ 4,5 s** (parallel zum Wind); −90 Requests, −2,9…3,4 s Long Task auf JEDER Wetterkarten-Sitzung (der DEM-Bau blockiert heute auch Niederschlag/Wind-Ticks); die Fusion-Punktforecasts behalten ihren eigenen `loadElevationLookup` | 1 Tag | Producer-Skript + Loader; Ablage im Daten-Repo = Publisher-Erweiterung (BW-2-Mechanik, **Jans Gate**); Alternative `public/` (kein Gate, 250 KB im Repo) |
| **H1b** | V-BW-42 allein: Temperaturbilder parallel zum DEM anfragen, Layer erst zeichnen, wenn beide da sind | Temperatur −0,4 s (die Bilder liegen dann schon vor); ohne H1 bleibt das DEM der Deckel | ½ Tag | Loader-Reihenfolge; ohne H1 kaum spürbar — **nur als Teil von H1** |
| **H2** | **Datenabrufe vor dem Mount starten** — Manifeste (`getManifest`) und, auf dem Regenradar, `getRadarStack` beim Laden des Route-Chunks anstoßen (Modul-Ebene, geteiltes Promise, das der Effekt später aufnimmt); dazu `<link rel="modulepreload">` für Route-Chunk, `MapView`/`NowcastRoute` und `maplibre` in den Route-Shells (`generate-seo.mjs` kennt die Hashes nach dem Build) | **−1,1…1,7 s auf jedem Layer** beider Seiten (Manifest steht, wenn der Mount kommt); Boot −1 Round-Trip (≈ 0,25–0,5 s) | 1 Tag | Router/Route-Shells; kein SW-Eingriff. Manifeste bleiben `no-store` + Minutenstempel (BW-11) |
| **H3** | **HDF5/NetCDF im Worker** — INCA- und rzc-Parsen in einen Worker (jsfive ist DOM-frei; Muster `radolanWorker`), Ergebnis als transferierte `Uint8Array`s | −2,5 s (INCA) −0,2 s (rzc) Hauptthread auf beiden Seiten; das DE-Radarbild wartet nicht mehr hinter dem Nachbarland | ½ Tag | neue Worker-Datei; keine Shader, kein SW |
| **H4** | **Eigenes Land zuerst** — Regenradar: Nachbarquellen (INCA/rzc bzw. RV) erst anfragen, wenn der eigene Stack gesetzt ist; Wetterkarte: `loadNowSource` lädt DE/AT/CH nacheinander in Reihenfolge Viewport-Land → Nachbarn (Komposit bleibt vollständig, nur später) | Regenradar-DE: INCA (1,4 MB, TTFB 1–36 s) und rzc raus aus dem Startfenster ⇒ Tar-Download ohne Wettlauf (8,4 → ≈ 2,5 s auf der Wetterkarte); Komposit-Nachbarn erscheinen 2–4 s nach dem eigenen Bild | ½ Tag | Effekt-Reihenfolge; Verhaltensänderung sichtbar (Nachbarland kommt nach) — **Jan entscheidet** |
| **H5** | **RV-Kette kürzen** — (a) `WASM_DEST_STEPS`: für den RV-Tar direkt 96 MB (−0,3 s, die Größe ist bekannt); (b) bz2 + Tar-Dekode in EINEM Worker (spart Worker-Start ≈ 1 s beim Kaltstart: heute wird der `radolanWorker` erst nach dem bz2 gestartet, `radolan.ts:248` → `decodeRvTarOffMain`); (c) den Worker beim Route-Laden vorab starten (WASM-Init 0,3 s + Isolate 0,3 s parallel zum Download); (d) **dekodierte Frames der Sitzung cachen** (IndexedDB, 25 × 1,32 MB je Lauf, 2 Läufe) ⇒ Warm-Start ohne bz2 + Dekode | (a)+(b)+(c): kalt **−1,5…2 s** auf Regenradar und Wetterkarte-Niederschlag; (d): warm **−2 s** (Reload, Tab-Wechsel, 5-min-Refresh desselben Laufs) | 1 Tag | Worker-Code + Cache; kein SW |
| **H6** | **V-WF-10 entschärfen** — 4-s-Timeout nur auf den WASM-Abruf, nicht auf die Sitzung: bei Timeout erneut versuchen, und pure-JS nur je Datei, nie als Sitzungsschalter; pure-JS-Rückfall laut in der Konsole | verhindert 33 s je Tar (× 9 im Rückblick) auf langsamen Leitungen/CPUs — die Ursache, wenn es „manchmal" ewig dauert | ½ Tag | `bz2Worker.ts`; kein SW |
| **H7** | **Netz-Priorität** — Terrarium (falls H1 nicht kommt), INCA/rzc-Nachbarn, KONRAD3D, Brightsky-Fächer mit `priority: 'low'`; RV-Tar und Repack-Bilder `priority: 'high'`; Brightsky-Fächer (22 Abrufe) erst nach dem Stack-Abruf absetzen | Tar-Download auf der Wetterkarte 8,4 → ≈ 2,5 s (die Bytes sind heute im Wettlauf); Wirkung nur bei geteilter Leitung | ½ Tag | `fetch`-Optionen, Effekt-Reihenfolge |
| **H8** | **Regenradar: erstes Frame vor dem vollen Stack** — der Tar liegt in Lead-Reihenfolge; ein streamender bzip2-Dekoder (blockweise, 900 KB) könnte `_000` liefern, sobald ~3 MB entpackt sind. `bzip2-wasm` kann das nicht (Buffer → Buffer), ein eigener Streaming-Dekoder ist eine eigene Bibliothek | erstes Bild −1,5…2 s zusätzlich zu H5 | 3+ Tage, Risiko | **nicht empfohlen** vor H5; RY-Latest (900 × 900, Legacy-Gitter) als Sofort-Frame wäre ein zweites Gitter mit eigener Verortung (RP1) — ebenfalls nicht empfohlen |
| **H9** | **Dokument-TTFB** — die Route-Shell läuft durch den SW network-first (0,6–0,9 s); stale-while-revalidate für die Shell brächte ≈ 0,5 s, kostet aber die Frische-Garantie nach einem Deploy (BW-11!) | −0,5 s LCP; kein Layer-Hebel | ½ Tag | **SW = STOPP & FRAGEN**, nach BW-11 mit Vorsicht |
| **H10** | **Wind-Manifest ohne `repack`** — das Prod-`latest-wind.json` (06z) trug am 28.08. keinen Abschnitt; der Zeiger-Fallback fängt es (+163 ms), aber das ist nicht der Normalfall aus §29 | +1 Round-Trip je Wind-Start; Diagnose im Warm-Cron (`carryRepack`/`fetchSection` gegen den jsDelivr-Index, der stundenlang alt sein kann, §28.9) | ¼ Tag | Warm-Cron = **Manifest-Mechanik, Jans Gate** |

**Empfohlene Reihenfolge:** H1 → H2 → H3 + H4 → H5 + H6 → H7. Erwartetes Bild danach (hergeleitet):

| Seite / Layer | heute | nach H1–H7 |
|---|---:|---:|
| Wetterkarte Wind (kalt) | 4,2 s | ≈ 2,5–3 s |
| Wetterkarte Temperatur (kalt) | 18,5 s | ≈ 3–4,5 s |
| Wetterkarte Niederschlag (kalt) | 11–12 s | ≈ 5–6 s (Tar 2,5 s + bz2 1,5 s + Dekode 0,5 s hinter einem früheren Start) |
| Regenradar DE (kalt / warm) | 10–14 s / 8–12 s | ≈ 5–6 s / ≈ 2,5–3 s |

Was **nicht** hilft (gemessen oder aus §29 bekannt): kleinere Repack-Bilder (die zwei Jetzt-Bilder kosten
0,36 s), mehr Concurrency im Kaltstart (2 Dateien), ein Repack der RV-Tars (Jans Entscheidung §26.3, und
der Tar-Download ist nach H4/H7 mit 2,5 s nicht mehr der Deckel).

---

## 5. Was diese Messung nicht deckt

- **Mobile Real-Device:** Emulation ist für WebGL nicht repräsentativ; die CPU-Posten skalieren aber
  linear — auf einem Mittelklasse-Telefon (≈ 3–4× langsamer) wären DEM-Bau 9–12 s und INCA-Parse 7–10 s
  auf dem Hauptthread; genau die Posten, die H1 und H3 abräumen.
- **Jans Leitung:** die Tar- und Kachel-Zeiten hängen an der Bandbreite; die Reihenfolge der Hebel nicht.
- **Der 6,7-s-Worker im Trace** (§2.3) war unter Last (Tracing + INCA-Parse parallel); isoliert 1,3–1,6 s.
  Beide Zahlen stehen, weil Jans „manchmal" genau solche Lastfenster sind.
- **GeoSphere-TTFB 36 s** (einmal per curl): nicht reproduziert; als Quelle bekannt unzuverlässig (V-RL-2).

---

## 6. V-Einträge

- **V-LE-1** `buildDemImage` blockiert 2,9–3,4 s und lädt 90 statt „~50" Kacheln; Temperatur wartet
  darauf (erweitert V-BW-42). Hebel H1.
- **V-LE-2** INCA- und rzc-HDF5 werden auf dem Hauptthread geparst (2,5 s / 0,2 s), auf beiden Seiten,
  auch für DE-Orte. Hebel H3/H4.
- **V-LE-3** Datenabrufe starten erst nach dem React-Mount (2,4 s); Manifeste sind nicht vorgeladen;
  Route-Shells tragen kein `modulepreload`. Hebel H2.
- **V-LE-4** `bz2Worker` versucht für jeden Tar zuerst 8 MB (0,3 s verschenkt) und startet den
  Dekode-Worker erst nach dem bz2 (≈ 1 s Isolate + WASM beim Kaltstart). Hebel H5.
- **V-LE-5** 4-s-WASM-Timeout degradiert die Sitzung dauerhaft auf pure-JS (33 s je RV-Tar) —
  V-WF-10 gilt fürs Regenradar (lokal reproduziert: 52 s bis zum Dekode). Hebel H6.
- **V-LE-6** `nowcastRef.current = await …` vor `await primeXx` (`MapView.tsx:1980/1992/1965`): ein Tick
  dazwischen holt die Index-Map synchron nach (0,18 s RADOLAN). Reihenfolge tauschen.
- **V-LE-7** Prod-`latest-wind.json` ohne `repack`-Abschnitt (28.08., 06z) — Zeiger-Fallback trägt, Ursache
  im Warm-Cron offen. Hebel H10.
- **V-LE-8** Regenradar: 22 Brightsky-Abrufe, KONRAD3D-Listing + XML (0,9 MB) und INCA laufen im selben
  Startfenster wie der Tar; keine `priority`-Hinweise. Hebel H7.
- **V-LE-9** Resource-Timing-Puffer (250) läuft auf der Wetterkarte über — jede künftige Messung braucht
  `setResourceTimingBufferSize`.
- **V-LE-10** Zwei vergessene Dev-Server liefen drei Tage mit 100–150 % CPU (25.08. → 28.08.); Sessions
  sollen ihre Server beim Ende stoppen (Notiz für die Arbeitsweise, kein Code).

---

## 7. Entscheidungen für Jan (Defaults, unter denen gebaut würde)

1. **H1 Ablage:** `dem-v1.png` ins Daten-Repo neben `hsurf-v1.png` (Publisher-Erweiterung, Jans Gate)
   **oder** nach `public/` (kein Gate, +250 KB im Repo, über Netlify). Default: **Daten-Repo** — derselbe
   Weg wie `hsurf`, kein Netlify-Traffic.
2. **H4 Sichtbarkeit:** darf das Nachbarland im Komposit 2–4 s nach dem eigenen Land erscheinen?
   Default: **ja** (mit Statuszeile „Komposit wird vervollständigt").
3. **Reihenfolge:** H1 → H2 → H3+H4 → H5+H6 → H7 (je ein Gate, Messung Prod-Preview mit Prod-Manifesten
   in `dist/`). H8 und H9 nicht in dieser Linie.
4. **Messbasis:** Gate-Messungen brauchen die Prod-Manifeste in `dist/` (die `public/`-Stände sind zwei
   Tage alt) — Vorschlag: `npm run preview:prod-manifests` als Skript, das sie vor der Preview holt.

---

# 8. LE1 — H2 umgesetzt (2026-08-28, Jans „setze H2 um und messe die Verbesserung")

## 8.1 Was gebaut wurde

| Datei | Änderung |
|---|---|
| `src/sources/liveManifest.ts` (neu, abhängigkeitsfrei) | `MANIFEST_TTL_MS`, `liveManifestUrl` (BW-11, aus `gribManifest.ts` hierher gezogen), **`warmLiveManifest(path)`** startet den Abruf eines Live-Manifests vor (`no-store`, Minutenstempel), **`takeWarmManifest(path)`** gibt das Promise genau EINMAL und nur innerhalb des TTL heraus |
| `src/sources/radolanRuns.ts` (neu, abhängigkeitsfrei) | `RV_DIR`, `RV_TAR_CACHE`, `rvStamp`, `guessRvRuns`, `rvTarUrl` (aus `radolan.ts` hierher gezogen), **`warmRvTar()`** startet den jüngsten gerechneten RV-Tar vor (Cache-API zuerst, sonst `fetch` mit `priority: 'high'`), **`takeWarmRvTar(url)`** einmalig, 5-min-Fenster |
| `src/router/prefetch.ts` (neu) | `warmPlanFor(routeId, pathname, search)` = die reine Entscheidung (Wetterkarte/Warnungen: beide Manifeste, RV-Tar nur bei Slug oder `l=` aus der Nowcast-Familie; Regenradar: GRIB-Manifest + RV-Tar; sonst nichts) und `warmRouteData(…)`, die sie anstößt |
| `src/router/router.tsx` | `page(load, warm?)`: der `lazy.Component`-Loader ruft `warmRouteData` auf, **bevor** er den Seiten-Chunk importiert — also parallel zu dessen Download; verdrahtet für `wetterkarte`, `warnungen`, `regenradar` |
| `src/sources/gribManifest.ts` · `src/wind/iconD2WindSource.ts` · `src/sources/radolan.ts` | die drei Verbraucher nehmen die vorgestartete Antwort mit `takeWarm…` entgegen, sonst holen sie wie bisher selbst; `liveManifestUrl`/`guessRvRuns` werden re-exportiert (bestehende Importeure und Verifier unverändert) |
| `scripts/generate-seo.mjs` | je Route-Shell `<link rel="modulepreload">` für den Route-Chunk und alle seine statischen Abhängigkeiten sowie `<link rel="preload" as="style" crossorigin>` für deren CSS — **aus Vites eigener Liste** (`__vite__mapDeps` in `index-*.js`, Zuordnung Route → Chunk aus `router.tsx`), plus `preconnect` je Seite (Wetterkarte/Warnungen: openfreemap, jsDelivr, S3; Regenradar: openfreemap, GeoSphere, geo.admin, jsDelivr) |
| `scripts/verify-routing.mjs` | +24 Prüfungen (§6): Plan je Route, Frühstart-Mechanik mit gezähltem `fetch` (einmal starten, einmal nehmen, TTL, Stempel, `no-store`, `priority`, Fehlschlag bleibt beim Verbraucher), Re-Export-Identität, Router-Verdrahtung, erzeugte Shells (Chunks, CSS, `preconnect`, keine Doppelverlinkung) — **95/95** |

Nicht angefasst: Shader, Service Worker, Warm-Crons, Manifest-Inhalte, Lade-Reihenfolge innerhalb der
Seiten. Ohne Frühstart (andere Route, SSR, TTL abgelaufen, Frühstart fehlgeschlagen) läuft jeder Verbraucher
den alten Weg — verlustfrei.

**Eine Korrektur unterwegs:** der erste Build setzte die CSS-Preloads ohne `crossorigin`; Vites Laufzeithelfer
legt seine Stylesheet-Links mit `crossOrigin = ''` an, der Browser verwarf deshalb die Preloads und lud doppelt
(Konsole: „preloaded … but not used", 4 Warnungen). Mit `crossorigin` auf dem Preload: 0 Warnungen.

## 8.2 Gemessen — vorher/nachher (lokale Prod-Preview `vite preview`, Prod-Manifeste in `dist/`, je Lauf ein frischer isolierter Browser-Kontext = kalte Caches; ms ab Navigationsstart)

Lokal fehlen die Netzlatenzen von Netlify (Dokument 0,6–0,9 s, Manifest 0,4–0,75 s) — der Mount kam hier
nach 0,7–1,25 s statt 2,4 s in Prod. Die Differenzen unten sind deshalb die **Untergrenze** dessen, was Prod
gewinnt (§8.3).

**Wetterkarte `/wetterkarte`** (Vorher 1 Lauf · Nachher 2 Läufe):

| Schritt | vorher | nachher |
|---|---:|---:|
| Route-Chunk · MapView · maplibre — Start | 191 | **17 / 18** (parallel zu `index.js`, `modulepreload`) |
| maplibre — Ende | 816 | **162 / 161** |
| Manifeste — Start → Ende | 1 252 → 1 272 | **206 → 244 / 133 → 145** |
| Wind-PNG — Ende | 1 956 (2. Bild 2 557) | **1 401 / 1 316** |
| `hsurf` — Ende | 1 865 | 1 156 |
| Terrarium (90) — letzte Kachel | 6 327 | 4 761 / 4 871 |
| Temperatur-PNG — Ende | 8 711 | **6 857 / 6 815** |

⇒ Wind **−0,6…−1,2 s**, Temperatur **−1,9 s** (der DEM-Bau bleibt der Deckel, H1).

**Regenradar `/regenradar?…&land=de`** (je 1 Lauf):

| Schritt | vorher | nachher |
|---|---:|---:|
| NowcastRoute-Chunk — Ende | 535 | **134** |
| GRIB-Manifest — Start | 950 | **302** |
| RV-Tar — Start → Ende | 1 045 → 4 500 | **362 → 3 854** |
| Dekode-Worker — Start | 7 861 | **6 384** |
| Kartenstil — Start | 9 210 | **7 553** |
| Ländermasken (= Karte gemountet) | 9 915 | **8 127** |

⇒ Karte **−1,8 s**.

**Wetterkarte Niederschlag `/wetterkarte/niederschlag`** (Vorher 1 Lauf · Nachher 2 Läufe):

| Schritt | vorher | nachher |
|---|---:|---:|
| Manifeste — Start | 730 | **243 / 124** |
| RV-Tar — Start → Ende | 729 → 3 523 | **298 → 3 168 / 179 → 3 198** |
| bz2-Worker — Start | 3 573 | 3 338 / 3 262 |
| Dekode-Worker — Start | 5 427 | 9 807 (Ausreißer) / **5 099** |
| ICON-D2-Niederschlag-PNG — Ende | 7 859 | 10 826 / **7 633** |

⇒ **−0,3…−0,5 s**; der Tar-Download (3 s über den lokalen Proxy) und das Entpacken dominieren hier. Der
Ausreißer im ersten Nachher-Lauf ist gemessene Kern-Kontention: der bz2-Worker brauchte 6,4 s statt 1,9 s,
weil DEM-Bau (Long Task 1,7–3,2 s), INCA-Parse (0,7 s) und zwei Index-Map-Worker gleichzeitig liefen — auf
vier Kernen. **V-LE-11:** der Frühstart lässt mehr Arbeit überlappen; auf schwachen Geräten zahlt sich erst
H3/H7 (Parse im Worker, Prioritäten) voll aus.

Konsole (finaler Build, kalte Läufe): **0 Fehler, 0 Warnungen**. Long Tasks ≥ 200 ms auf der Niederschlagsseite:
217 (Boot), 675 (INCA-Parse), 1 740 (DEM) — dieselben wie vor LE1 (§2.2), keine neue.

## 8.3 Was Prod daraus macht (hergeleitet, nach dem Deploy nachzumessen)

In Prod lag die erste Datenanfrage bei **2 433 ms** (§2.1) — Dokument 930 ms + `index.js` + Chunk-Runde +
Mount. Mit LE1 gehen die Manifeste raus, sobald `index.js` die Route auflöst (≈ 1,0 s), und der Chunk-Round-Trip
entfällt (Route-Chunk, MapView, maplibre kommen mit dem Dokument). Erwartung: Manifest-Antwort bei ≈ 1,6 s
statt 3,2 s, Wind bei ≈ 2,5–3 s statt 4,2 s, Regenradar-Tar-Start bei ≈ 1,0 s statt 2,4 s (Karte ≈ −1,5…−2 s),
Niederschlag ≈ −1,5 s. Deploy = Jans Gate; danach dieselbe Messung gegen buscosun.com (§1: Resource-Timing-
Puffer, Long Tasks `buffered`).

## 8.4 Gate GLE1

`npm run typecheck` grün · `verify:routing` **95/95** (71 + 24) · `verify:radar-runs` **22/22** (`guessRvRuns` als
Re-Export) · Budget eagerJs **102,5 / 106,5 KB** (+1,0 KB für die drei Frühstart-Module im index-Chunk),
largestChunk 278,4 KB, totalJs 989 KB — alle eingehalten · Build + Shell-Generator grün.

1. **Funktionserhalt** — dieselben URLs, dieselben Bytes, dieselben Verbraucher; `take` liefert genau einmal,
   sonst der alte Weg (Verifier: Zähl-`fetch`, TTL, Fehlschlag beim Verbraucher); Manifest-Frische unverändert
   (`no-store` + BW-11-Stempel auch im Frühstart); RV-Kandidatenkette und Listing-Fallback unverändert (ein 404
   des Frühstarts fällt in dieselbe Schleife).
2. **Desktop pixelgleich** — keine UI-Änderung; Shell-Head um Link-Hinweise ergänzt, `#root`-Inhalt unverändert.
3. **Touch-Targets** — nicht berührt.
4. **Konsole** — 0/0 (nach der `crossorigin`-Korrektur; der Zwischenstand mit 4 Preload-Warnungen ist oben belegt).
5. **Long Tasks** — keine neue; DEM (H1) und INCA-Parse (H3) bleiben die bekannten.

**Offen:** Prod-Nachmessung nach dem Deploy (Jans Gate); V-LE-11 (Überlappung auf 4 Kernen ⇒ H7 vorziehen);
`public/latest-*.json` sind weiterhin zwei Tage alt (Preview ohne kopierte Prod-Manifeste läuft in den Scan).

---

## 9. LE2 — H3 + H7 umgesetzt (2026-08-28, Jans Auftrag „setze jetzt H3 und H7 um und messe danach")

### 9.1 Was gebaut wurde

**H3 — HDF5/NetCDF im Worker.** Das Parsen von INCA (AT, NetCDF-4) und rzc (CH, ODIM-HDF5) lief bis LE1 auf dem
Hauptthread (`jsfive`): gemessen 2,5 s in Prod (§2.4), 0,6 s ungedrosselt / 2,6 s bei CPU 4× lokal — und
jeder fertige Radar-Frame, jeder Mount-Tick wartete dahinter.

- `src/sources/incaParse.ts` · `src/sources/rzcParse.ts` — die **reinen Parser**, wortgleich aus
  `geosphereIncaGrid.ts`/`meteoSwissRadar.ts` herausgelöst (Format-Eigenheiten, Zellmitten → Außenkanten,
  Süd→Nord-Flip, `precipToU8`), DOM-frei. Der Verifier baut die alte Schleife als Referenz nach und prüft
  **Byte-Gleichheit** an einer echten INCA-NetCDF (11 × 701 × 431) und rzc-HDF5 (710 × 640).
- `src/sources/hdf5Worker.ts` — der Worker (Muster `radolanWorker`): Bytes hinein, `Uint8Array`-Frames
  transferiert heraus; importiert nur die beiden Parser.
- `src/sources/hdf5OffMain.ts` — EINE Brücke für beide: lazy ein Worker je Sitzung, `warmHdf5Worker()` beim
  Absetzen des Abrufs (Isolate + jsfive-Eval ≈ 0,3 s im Download-Schatten), Eingabe per Structured Clone (nicht
  transferiert — der Puffer bleibt für den **benannten Rückfall** auf denselben Hauptthread-Code erhalten, laut in
  der Konsole). Kill-Switch `?h5worker=0` / `localStorage.h5worker = '0'`, Query schlägt Speicher (Rule 2).
- Verbraucher: `geosphereIncaGrid.ts` und `meteoSwissRadar.ts` importieren kein `jsfive` mehr; „keine Frames"
  (V-RL-2) bleibt Entscheidung des Aufrufers; rzc-`validAt`-Fallback „jetzt" unverändert.

**H7 — Netz-Prioritäten** (`fetch(…, { priority })`, in `lib.dom` typisiert):

| Abruf | Priorität | wo |
|---|---|---|
| RV-Tar (DE-Erstbild) | `high` (Standard; Frühstart hatte es schon) | `radolan.ts` `fetchRvBytesCached` — `fetchRvNowcast(signal, { priority })` reicht bis zum Tar durch |
| Repack-PNGs (Erstbild der Wetterkarte) | `high` (Standard) | `repackSource.ts` `loadRgba`/`loadGridStep` |
| `cape` am Regenradar (eine Zahl) | `low` | `iconD2Cape.ts` |
| INCA / rzc / RV als **Nachbarquelle** | `low` | `NowcastRadarMap.tsx` (Nachbar-Jobs), `MapView.tsx` (`prioFor`: Land des gesuchten Orts = Standard, die zwei anderen `low`) |
| KONRAD3D Listing + XML | `low` | `dwdKonrad3d.ts` |
| Brightsky-Fächer (`/weather` × 21, `/current_weather`) | `low` | `brightSkyForecast.ts`, `brightSkyCurrent.ts` |
| Terrarium-Kacheln | `low` (Bestand) | `fusion/elevation.ts` |

Die Punkt-Nowcast-Fächer „erst nach dem Stack-Abruf absetzen" (H7-Text) ist mit LE1 strukturell erfüllt: der
Tar geht beim Auflösen der Route raus, der Fächer erst nach dem Mount.

**V-LE-12 nebenbei behoben:** der LE1-Frühstart holte den RV-Tar (2,2 MB, `high`) auch auf dem Regenradar
**ohne Ort** (Suchformular — gemessen, Lauf a0) und für AT/CH-Orte, wo RADOLAN nur Nachbarquelle ist. Jetzt nur
mit Ort in der URL und `land` = DE (`warmPlanFor`, 3 neue Verifier-Zeilen).

### 9.2 Gemessen — A/B verschränkt (alter Build = LE1-Stand auf :5214, neuer Build auf :5213; Prod-Manifeste in
beiden; je Lauf ein frischer isolierter Kontext = kalte Caches; ms ab Navigationsstart; Drosselung per DevTools)

Mess-Marker: Tar Start→Ende (Resource Timing) · INCA-Ende · Dekode = Start des `radolanWorker` (bz2 fertig) ·
Stil = `/styles/liberty` (Karte mountet) · Karte = `/countries/DE.geojson` (Ländermasken, erstes Radarbild
unmittelbar danach) · Long Tasks ≥ 200 ms (`PerformanceObserver`, `buffered`).

**Regenradar DE `/regenradar?ort=Kassel&olat=…&land=de`**

| | ungedrosselt alt | **neu** | CPU 4× alt | **neu** |
|---|---:|---:|---:|---:|
| RV-Tar Start → Ende | 217 → 2 846 | 219 → 3 060 | 582 → 3 252 | 346 → 2 608 |
| INCA-Ende | 3 275 | 3 994 | 4 231 | 3 323 |
| **INCA-Parse Long Task** | **3 278 + 597** | **—** | **4 243 + 2 624** | **—** |
| bz2 (Tar-Ende → Dekode-Start) | 1 247 | 1 190 | **3 716** | **1 536** |
| Mount Long Task | 4 383 + 379 | 4 652 + 448 | 7 488 + 1 910 | 4 649 + 2 157 |
| Kartenstil — Start | 4 860 | 5 186 | 9 888 | 7 344 |
| **Karte (Masken)** | 6 323 | **5 715** | 10 524 | **8 096** |

⇒ ungedrosselt **−0,6 s** (bei 0,2 s langsamerem Tar), CPU 4× **−2,4 s**. Der zweite Effekt war nicht
vorhergesagt: unter dem CPU-Budget bremste der Hauptthread-Parse auch den **bz2-Worker** (3,7 → 1,5 s) — das
Prozessbudget wird geteilt, und der Parse lag genau im bz2-Fenster.

**Regenradar AT `/regenradar?ort=Wien&…&land=at`** (INCA = eigener Stack, CPU 4×)

| | alt | **neu** |
|---|---:|---:|
| INCA Start → Ende | 884 → 5 851 | 1 408 → 4 111 |
| INCA-Parse Long Task | **5 863 + 2 565** | **—** |
| INCA-Ende → Kartenstil | **3 154** | **1 321** |
| Karte (Masken) | 9 512 | **5 973** |

⇒ auf dem Pfad, der vom Parse abhängt, **−1,8 s**; die übrigen 1,7 s der Differenz sind GeoSphere-Netzstreuung
(Download 3,5 s vs 1,4 s) und werden nicht mitgezählt. Bestand, beide Builds: ein 3,4–3,9-s-Long-Task nach dem
Stil-Abruf (maplibre-Stil + Mount unter CPU 4×) — V-LE-16.

**Wetterkarte Niederschlag `/wetterkarte/niederschlag?lat=49.57&lon=11.5&z=4.5`** (ungedrosselt)

| | alt | **neu** |
|---|---:|---:|
| RV-Tar Start → Ende | 247 → 3 108 | 223 → 2 672 |
| INCA-Parse Long Task | **3 621 + 602** | **—** (INCA nach 22 s noch unterwegs — GeoSphere-TTFB, V-RL-2) |
| Dekode-Start | 4 581 | 4 168 |
| DEM Long Task | 5 515 + 1 725 | 6 252 + 1 727 |
| Niederschlag-PNG — Ende | 5 480 … 7 662 | 8 162 (erst nach dem DEM, V-BW-42) |

⇒ Der DEM-Bau (H1) bleibt hier der Deckel; der INCA-Parse ist vom Hauptthread verschwunden. Unter CPU 4× war das
Paar nicht auswertbar: DEM 8,8/8,2 s, GeoSphere-TTFB 1,4/6,1 s, Tar-Download 1,4/3,2 s — und der bz2-Worker
brauchte im neuen Lauf 10,8 s, weil er vollständig im DEM-Fenster lag (V-LE-13).

**H7 unter gedrosseltem Netz** (Regenradar DE)

| | Fast 4G alt | **neu** | Slow 4G alt | **neu** |
|---|---:|---:|---:|---:|
| RV-Tar Start → Ende | 660 → 4 996 | 662 → 5 090 | 2 464 → 21 950 | 2 468 → 21 959 |
| INCA-Ende | 4 441 | 8 484 | 12 258 | 9 299 |
| KONRAD-XML-Ende | 5 227 | 4 706 | 8 906 | 8 935 |
| Karte (Masken) | 8 004 | 8 002 | 24 959 | 24 857 |

⇒ **Kein Effekt auf den Tar.** `priority` ordnet Chromes Scheduler-Warteschlange und HTTP/2-Gewichte
**derselben Verbindung** — es verteilt keine Bandbreite zwischen opendata.dwd.de, geosphere.at, jsDelivr und
brightsky.dev. Sobald alle Abrufe unterwegs sind, teilen sie die Leitung gleich; unter Slow 4G braucht der
2,1-MB-Tar 16,4 s statt ≈ 11 s allein. Die LE0-Erwartung „Tar 8,4 → 2,5 s" (§4, H7) war **falsch hergeleitet**
— der Wettlauf ist ein Fairness-, kein Prioritätsproblem. Die Hinweise bleiben (korrekt, kostenlos, wirksam
für Abrufe auf derselben Verbindung wie die jsDelivr-PNGs), aber der echte Hebel gegen den Wettlauf ist
**Sequenzierung**: Nachbarquellen, KONRAD3D, `cape` und den Brightsky-Fächer erst absetzen, wenn die
Tar-Bytes da sind (H7b, V-LE-14) — das ist H4-verwandt und ändert sichtbar, wann Nachbarland und
Zellbahnen erscheinen ⇒ **Jans Entscheidung** (§7).

Konsole auf den Seiten des neuen Builds: **0 Fehler, 0 Warnungen** (ein vorbestehender DOM-Hinweis „form
field should have an id"). Long Tasks: keine neue; die INCA-Long-Task ist auf allen drei Seiten weg.

### 9.3 Was Prod daraus macht (hergeleitet)

Der Prod-Trace (§2.3) zeigte den INCA-Parse mit 2,5 s auf dem Hauptthread genau im Mount-Fenster des
DE-Regenradars und den bz2-Worker mit 6,7 s „unter Last" — das lokale CPU-4×-Paar reproduziert beides
(2,6 s Parse, bz2 3,7 → 1,5 s). Erwartung Prod: Regenradar DE **−2…−3 s**, AT **≈ −2 s** (Parse-Pfad),
Wetterkarte Niederschlag −0,6 s Hauptthread-Blockade (Deckel bleibt DEM/H1). Nachmessung nach dem Deploy
(Jans Gate), Methode §1.

### 9.4 Gate GLE2

`npm run typecheck` grün · **neu `verify:layer-erstbild` 37/37** (A DOM-frei, B Verbraucher über die Brücke,
C Kill-Switch, D Rückfall in Node, E Byte-Gleichheit gegen die Referenzschleife an echten Dateien — Fixtures
über `LE_FIXTURES=<dir>`, sonst Live-Abruf mit ⊘ —, F Prioritäten als Text **und** mit gestubbtem `fetch`) ·
`verify:routing` 98/98 (+3 für V-LE-12) · `verify:radar-runs` 22/22 · `verify:radar-sampling` 25/25 · Budget
eagerJs 102,5/106,5 KB (unverändert), totalJs **1 009,4/1 017,7 KB** (+20 KB: der `hdf5Worker`-Chunk trägt
jsfive ein zweites Mal — der Hagel-Layer parst weiter auf dem Hauptthread, V-LE-15) · Build + Shells grün.

1. **Funktionserhalt** — dieselben Parser-Schleifen (byte-gleich belegt), dieselben Abruf-URLs, dieselben
   Verbraucher; Rückfall auf den Hauptthread bei Worker-Fehler; V-RL-2-Rückfall (letzter guter INCA-Lauf)
   unverändert; Prioritäten ändern keine Reihenfolge, nur Hinweise; Frühstart-Tar für DE-Orte unverändert.
2. **Desktop pixelgleich** — keine UI-Änderung.
3. **Touch-Targets** — nicht berührt.
4. **Konsole sauber** — 0/0 auf drei Seiten des neuen Builds (kalt).
5. **Long Tasks** — INCA-Parse (0,6 s ungedrosselt, 2,6 s CPU 4×) vom Hauptthread entfernt; keine neue.

### 9.5 Neue V-Einträge

- **V-LE-12 (behoben)** Frühstart-Tar ohne Ort / für AT-CH — `warmPlanFor` prüft jetzt Ort + Land.
- **V-LE-13** Die DevTools-CPU-Drossel ist ein **Prozessbudget**: Worker teilen es mit dem Hauptthread (bz2 10,8 s
  im DEM-Fenster). Ein Gerät mit 4 langsamen Kernen verhält sich anders — Real-Device-Messung (Jan, V-KL-4-Muster).
- **V-LE-14 (H7b, Jans Entscheidung)** Sequenzierung statt Priorität: Nachbarquellen, KONRAD3D, `cape`, Brightsky
  erst nach den Tar-Bytes. Erwartung Slow 4G: Tar 16,4 → ≈ 11 s; sichtbar: Nachbarland/Zellbahnen 2–10 s nach dem
  eigenen Bild.
- **V-LE-15** `meteoSwissHail.ts` parst ODIM-HDF5 weiter auf dem Hauptthread (Hagel-Layer, kein Erstbild) —
  derselbe Worker könnte `kind: 'hail'` lernen; dann wäre jsfive im Hauptbundle überflüssig (−20 KB).
- **V-LE-16** maplibre-Stil + Mount als 3,4–3,9-s-Long-Task unter CPU 4× (beide Builds) — Bestand, nicht LE.
- **V-LE-17** GeoSphere-Grid-API: TTFB 1,3–6,1 s, Download 1,4–7,7 s, ein Lauf > 22 s — die Nachbarquelle AT ist
  die unzuverlässigste; H4 (eigenes Land zuerst) hätte hier die größte Wirkung.
