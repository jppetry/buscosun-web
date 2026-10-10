# Performance-Phase PF — verzögerte Klicks, buscosun Fusion 12, Niederschlagsradar (Auftrag 10.10.2026)

> Jans Befund (10.10.2026): „Klicks auf Features werden manchmal erst nach einer Wartezeit umgesetzt. buscosun Fusion 12
> lädt noch etwas langsam. Das Niederschlagsradar braucht sehr lange, bis es geladen ist." Auftrag: Ursachen finden und
> beheben, **keine neuen Features, kein Redesign, Datenwerte unverändert** (Vorher/Nachher-Vergleich der Ausgaben),
> nur gemessene Zahlen.

## §0 Kurzfassung für Jan

- **Gemessen, nicht geschätzt:** eigener Harness (`scripts/perf-measure.mjs`, kalter Browser, HTTP/2 wie Netlify, Desktop und
  Mobil-4G mit CPU×4), Basis-Bau gegen den Bau mit den Maßnahmen abwechselnd im selben Lauf. Endstand §5.3.
- **Niederschlagsradar:** erstes Radarbild im Regenradar **Desktop 6,5 → 5,8 s, Mobil 7,7 → 6,2 s** (Endbau, Runde 5); Ebenen-Klick
  „Niederschlag" auf der Wetterkarte **Desktop 4,7 → 2,2 s, Mobil 4,2 → 3,0 s**. Ursachen: der Leser holte alle 25 Dual-Frames (5,4 MB)
  VOR dem ersten Bild (D-PF-7); auf dem Handy riss die 8-s-CDN-Frist den Slot ab und lud stattdessen das 7,4-MB-Tar — **das Radar lud
  zweimal** (D-PF-13); 25 parallele Abrufe ließen den raw-Hedge für jede Datei feuern (D-PF-14). Behoben: Analyse-Frame zuerst und
  sofort gezeichnet (M1), Frist fortschrittsbasiert + Abruf-Pool, der sich bei hängendem CDN hebt (M8), eigenes Radar vor den Nachbarn
  (M10), INCA/rzc-Decode im Worker (M4), CAPE nach dem Stapel (M11). **Der größte Lab-Hebel (M9, Ebenen bei `style.load`: Regenradar
  7,3 → 2,5 s / 9,6 → 4,8 s) wurde zurückgenommen** — er verschiebt die Reihenfolge der Kartenebenen (Maske über dem Radar) und braucht
  eine eigene Phase (V-PF-9). Im Regenradar wartet das Frühbild deshalb weiter auf das `load` der Karte (im Lab 3–4 s nach dem Stil,
  in Produktion mit gecachten Sprites/Glyphen weniger — nicht gemessen).
- **buscosun Fusion (Dashboard, Fusion 12 im Bau):** erste Ausgabe **Mobil 5,2 → 3,7 s** (Desktop 2,3 → 2,1 s). Ursache: die
  Radar-Stundenmittel-Bilder (300+ KB) teilten sich die Leitung mit dem 523-KB-Kern-Chunk (D-PF-4); jetzt starten sie nach dessen
  Bytes (M2). Fusion 12 selbst (`obs/v1`) war nicht der Engpass. Datenwerte unverändert (§5.4).
- **Klicks:** Seitenwechsel Kachel → Regenradar Desktop 0,64 → 0,30 s im Endlauf, auf Mobil gleich; der Wert schwankt zwischen den
  Runden stark (Hero-Karten-Abbau im Commit, D-PF-2), darum als Gewinn **nicht belegt** — gebaut: sofortige Rückmeldung (3-px-Balken,
  einzige sichtbare Änderung, M5) und der Abbau der Hero-Karte nach dem Paint. Eingabeverzögerung war nie das Problem (1–10 ms).
- **Nicht gewonnen:** die Zeit bis zum GANZEN DACH-Komposit auf dem Desktop (7,3 → 14,7 s; Pool und Reihenfolge) — V-PF-5.
- **Jans Entscheidungen:** Balken behalten? (V-PF-3), Pool-Größe/Reihenfolge am Desktop (V-PF-5), Merge des Zweigs
  `perf/ladezeit-2026-10-10` (auf `af/merge-fusion-12`) — `MANUELLE-SCHRITTE.md` §61.

## §1 Rahmen

- **Code-Stand:** Branch `perf/ladezeit-2026-10-10` im Worktree `C:\dev\buscosun-web-wt\perf`, abgezweigt von
  `af/merge-fusion-12` (`b9765a0` = `main` `646142b` + buscosun Fusion 10/11/12). Produktion (buscosun.com) läuft heute
  auf `main` (Asset-Hash `index-C-MoU_k3.js` = lokaler `dist`-Bau von `646142b`, Fusion 9); Fusion 12 liegt nur auf dem
  Merge-Zweig, den Jan nach E-AF-2 als `main` pushen will. Der Merge-Zweig enthält `main` vollständig (`main` ist dem
  Zweig um 0 Commits voraus), darum gilt jede Messung und Maßnahme hier für beide Stände.
- **Basis-Bau:** `npm run build` des unveränderten Zweigs, Kopie in `C:\dev\buscosun-web-wt\perf-base-dist` (98 Dateien,
  Build 255/255), ausgeliefert über `vite preview` auf Port 5301.
- **Messaufbau:** `scripts/perf-measure.mjs` (neu). `chrome-headless-shell` über CDP (`scripts/lib/cdpBrowser.mjs`),
  SwiftShader-WebGL; vor dem Preview ein Shell-Proxy, der Dokument-Anfragen wie Netlify mit der Route-Shell
  (`dist/<route>.html`, `dist/<route>--<sub>.html`) beantwortet und zum Browser **HTTP/2 über TLS** spricht (selbst
  signiertes Zertifikat, `--ignore-certificate-errors`) — ohne h2 benachteiligt HTTP/1.1 mit sechs Verbindungen den Bau
  mit vielen Chunks. Je Lauf ein frischer Browser-Kontext (kalter Cache, leere IndexedDB). Profile: **Desktop** 1440 × 900
  ohne Drossel; **Mobil-4G** 402 × 874 DPR 3, Chrome-„Fast 4G" (9 Mbit/s ↓, 170 ms RTT), **CPU ×4**. Ein Vorlauf je
  Profil wärmt die Verbindung und zählt nicht; n = 3 je Zelle. Daten kommen live vom CDN (jsDelivr/raw) — die Slots
  wechseln alle 5 min, Zahlen sind deshalb nur innerhalb eines Laufs vergleichbar (Leistungsanker).
- **Gemessene Größen:**
  - `click` — Startseite `/`, Klick auf die Kachel „Regenradar / Nowcast öffnen": Eingabeverzögerung (Handler-Start −
    Ereignisstempel), erste DOM-Änderung, URL-Wechsel (Commit der Navigation), erster WebGL-Draw der neuen Ansicht.
  - `layer` — `/wetterkarte/temperatur/muenchen`, Klick auf den Schalter „Niederschlag": Eingabeverzögerung, Rückmeldung
    (`aria-checked`), erstes Radarbild (erster Draw nach einem nicht-leeren Radar-Texturupload), letzte Radardatei.
  - `fusion` — `/wetterkarte/wind/muenchen?ansicht=dashboard`: `performance.mark('dbd:fusion:first'|'core')` des
    Dashboards (buscosun Fusion auf dem Cube), Abrufe von `point/`, `obs/`, Tabellen mit Bytes und Zeiten.
  - `radar` — `/regenradar/muenchen`: erster Karten-Draw, erstes Radarbild, letzte Radardatei, Bytes je Herkunft,
    rAF-Lücken (Ersatz für Long Tasks — in headless-shell nicht beobachtbar, CLAUDE.md), CPU-Profil des Hauptthreads.
- **Vorbehalt SwiftShader:** WebGL läuft in Software; GPU-nahe Kosten (Texturupload, `render`, `clearStencil`) sind
  überzeichnet. Verglichen wird deshalb nur Vorher/Nachher im selben Aufbau, und JS-Kosten werden über das CPU-Profil
  (Selbstzeit je Funktion) getrennt ausgewiesen.

## §2 Ausgangsmessung (Basis `b9765a0`, 10.10.2026 13:30–14:15 UTC, p50 von n = 3)

| Szenario | Größe | Desktop | Mobil-4G CPU×4 |
|---|---|---|---|
| click | Eingabeverzögerung | 1 ms | 3 ms |
| click | erste DOM-Änderung nach Klick | 271 ms (226–800) | 213 ms (127–430) |
| click | URL-Wechsel (Navigation committed) | **841 ms (558–1 983)** | — (Klick traf keine Kachel, s. V-PF-1) |
| click | erster Draw der neuen Ansicht | (Messfehler, s. V-PF-1) | — |
| layer | Rückmeldung `aria-checked` | **207 ms (149–217)** | — (Schalter liegt im mobilen Reiter „Layer", s. V-PF-1) |
| layer | erstes Radarbild nach Klick | 212 ms | — |
| layer | letzte Radardatei nach Klick | **2 286 ms (2 026–4 698)**, 6,1 MB | — |
| layer | rAF-Lücken > 200 ms nach Klick | **16 (10–18), max 1 117 ms** | 17 (ohne Klick, nur Temperaturkarte) |
| fusion | erste Ausgabe `dbd:fusion:first` | **1 865 ms (1 666–1 916)** | **4 502 ms (4 388–4 717)** |
| fusion | Kern `dbd:fusion:core` | 2 272 ms | 5 530 ms |
| fusion | Abrufe `point/` | 19 Abrufe, 1 287 KB | 19 Abrufe, 1 287 KB |
| fusion | Abrufe `obs/` (Fusion 12) | 2 Abrufe, 87 KB (nach dem Kern) | 2 Abrufe, 87 KB (nach dem Kern) |
| fusion | Radar-Stundenmittel + Frames während des Kerns | 20 Abrufe, 981 KB | 20 Abrufe, 950 KB |
| radar | erster Karten-Draw | 1 257 ms | 2 052 ms |
| radar | erstes Radarbild (nicht-leere Textur) | **≈ 4,1–6,7 s** (Messung 1: Texturerkennung noch ohne Null-Filter) | **≥ 7,2 s** (s. §3.3) |
| radar | letzte Radardatei | 5,3 s (4,5–9,0) | 12,3 s (7,2–14,2) |
| radar | Daten gesamt (CDP-Bytes) | **8–15,7 MB** | 3,6–11,2 MB (Lauf endete vor dem Ende der Abrufe) |
| radar | rAF-Lücken > 200 ms | **30 (28–37), max 1,25 s** | **30 (11–33), max 2,7–3,0 s** |
| radar | Hauptthread beschäftigt (CPU-Profil, Lauf 1) | 11,5 s | 11,3 s |

Rohdaten: `audit/performance-2026-10-10/baseline-1.json.gz` (mit Request-Listen und CPU-Profilen je Lauf).

## §3 Diagnose

### §3.1 Klick-Reaktion (D-PF-1 … D-PF-3)

- **D-PF-1 Navigation ohne Rückmeldung.** Der Kachel-Klick ruft `navigate()`; React Router lädt die Seite als `lazy`-Route
  (Chunk `NowcastRoute`, dazu `MapView` per Route-`loader`) und **committet die Navigation erst, wenn beide Chunks geladen
  und ausgewertet sind**. Bis dahin ändert sich nichts Sichtbares (`App.tsx` zeigt den `Suspense`-Fallback nur beim ersten
  Laden, nicht bei Navigationen — React Router navigiert in einer Transition). Gemessen Desktop: erste DOM-Änderung
  226–800 ms, URL-Wechsel 558–1 983 ms nach dem Klick; der `NowcastRoute`-Chunk startete 8 470 ms nach dem Seitenstart
  (= Klickzeit) und endete 818 ms später (lokal, h2).
- **D-PF-2 `Map.remove()` der Hero-Karte.** CPU-Profil des Klick-Laufs (Desktop): `remove maplibre` 605 ms Selbstzeit +
  `render maplibre` 400 ms — der Abbau der Startseiten-Hintergrundkarte (`HeroMapBackground`) läuft synchron im
  Hauptthread, genau im Fenster zwischen Klick und neuem Bild. (Mit SwiftShader überzeichnet; der Abbau einer MapLibre-
  Instanz kostet aber auch mit GPU zweistellige bis dreistellige Millisekunden.) **Mobil wiegt das am schwersten:** die
  Hero-Karte wird auch im Mobil-Profil geladen (`maplibre` + `HeroMapBackground` in jedem Mobil-Lauf), ihr `remove()` läuft im
  selben synchronen Commit wie der Seitenwechsel, VOR dem ersten Paint der neuen Ansicht — gemessen Runde 2 (`m2-all.json.gz`):
  Basis erste DOM-Änderung 2 409–2 568 ms nach dem Klick (der Browser nahm die drei Eingabe-Ereignisse erst nach 519–2 843 ms an),
  mit dem auf den nächsten Frame verschobenen Abbau 325–565 ms. Die absolute Zahl ist SwiftShader-überzeichnet (GL-Kontext-Abbau
  in Software), der Mechanismus nicht.
- **D-PF-3 Ebenen-Schalter.** Rückmeldung (`aria-checked`) erst 149–217 ms nach dem Klick; der Zustandswechsel löst einen
  vollständigen `MapView`-Render (6 200 Zeilen Komponente) aus, bevor der Schalter umspringt. Danach lädt der Klick
  **6,1 MB** Radardaten (25 Dual-Frames RV + INCA + rzc) und der Hauptthread hat 10–18 rAF-Lücken > 200 ms.

### §3.2 buscosun Fusion (D-PF-4 … D-PF-6)

Request-Zeitachse Mobil-4G (Lauf 1, ms seit Seitenstart):

| Welle | Abrufe | Start → Ende |
|---|---|---|
| JS (`index`, `nivo-line`, `cubeSource` …, 78 Dateien, 457 KB) | | 264 → 958 |
| 1: `fusion.client.json`, `stack.client.json`, `clima/stations.json`, `index.json` | 4 | 1 225 → 1 867 |
| 2: `hmodel`/`urban` (6), `stations/catalog.json` 58 KB, `stations/<lauf>/stations.json`, Stations-Chunk 130 KB, **12 Radar-`meta.json`-Sonden** (RV/INCA/rzc × 4 Stempel), `run.json`, **t1-Chunk 523 KB** | 24 | 1 819 → **4 144** (t1-Chunk) |
| 3: Radar-Stundenmittel **`m040.png` 305 KB + `m100.png` 334 KB**, `f000.png` 94 KB, INCA 4 × 45–51 KB, rzc 24 KB | 9 | 2 607 → 4 052 |
| erste Ausgabe | | **4 502** |
| 4: t2/t3 `run.json` + Chunks 193 + 255 KB | 4 | 4 179 → 4 949 |
| Kern | | **5 530** |
| 5: `obs/v1/stations.json` 87 KB (CDN) + `latest.json` (raw), WorldCover-Kacheln 16 + 106 KB | 4 | 5 530 → 6 472 |

- **D-PF-4 Bandbreiten-Wettlauf im Kern.** Der t1-Chunk (523 KB, der kritische Pfad zur ersten Ausgabe) lädt auf Mobil-4G
  2,3 s (1 828 → 4 144), weil parallel ≈ 870 KB Radarprodukte (Stundenmittel-Bilder je 300+ KB, Frames) und ≈ 200 KB
  Stationsprodukt dieselbe Leitung teilen. Allein bräuchte er bei 9 Mbit/s ≈ 0,5 s + RTT. Die Radarprodukte sind
  „progressive Produkte" (AP7/AP12: eigene Frist, Nachlieferung ab dem Kern) — sie dürfen den Kern nicht ausbremsen.
  Desktop ohne Drossel ist der Effekt klein (t1-Chunk 958 → 1 351).
- **D-PF-5 Zwölf Radar-`meta.json`-Sonden.** Je Quelle werden vier Stempel parallel sondiert (12 Abrufe, 2–3 KB), eine
  je Quelle endet als 404/abgebrochen. Auf Mobil kosten sie je eine RTT und ein Stream-Slot; sie sind nicht der Engpass,
  aber unnötiger Lärm im kritischen Fenster.
- **D-PF-6 Dashboard-Render.** CPU-Profil: `_onResize nivo-line` 341 ms (Mobil) / 182 ms (Desktop) Selbstzeit — der
  ResizeObserver-Handler der Nivo-Diagramme läuft mehrfach und rendert die Diagramme neu, während die Fusion rechnet.
  `cubeSource`-Funktionen zusammen ≈ 0,5 s (Mobil) — die Rechnung selbst.
- **Fusion 12 (`obs/v1`) ist nicht der Engpass:** die beiden Dateien (87 + 51 KB gz) starten erst mit dem Kern (AP12-
  Entscheidung E-F-3) und enden ≈ 0,5 s danach; die erste Ausgabe liegt davor.

### §3.3 Niederschlagsradar (D-PF-7 … D-PF-12)

Request-Gruppen Desktop (Lauf 1, ms seit Seitenstart):

| Gruppe | Abrufe | KB | Start → Ende |
|---|---|---|---|
| RV `meta.json` (5 Stempel-Sonden) + **29 Frames `[fgm]NNN.png` (Dual)** | 34 | **5 402** | 324 → 4 795 |
| `cape-000…003.png` (ICON-D2 CAPE für den Gewitter-Index am Punkt) | 4 | 450 | 921 → 3 001 |
| `konrad3d/cells.json`, `index.json` | 2 | 11 | 652 → 893 |
| buscosun Fusion (Streifen): Tabellen, Index, Stationen, Statik, `run.json`, **t1-Chunk 523 KB** | 13 | 813 | 1 249 → 3 804 |
| INCA `meta.json` (5) + **16 Frames** | 21 | 1 586 | 2 706 → 5 347 |
| rzc `meta.json` (4) + Frame | 5 | 28 | 2 765 → 4 795 |
| `obs/v1` (zweimal: Fusion-Anker und Summen-Leser), WorldCover | 6 | 210 | 4 038 → 12 915 |
| DWD-WMS (Blitze, 7 Abrufe, 0 KB), GeoSphere/geo.admin-Sonden („Quelle weg?") | 11 | 0 | 653 → 11 012 |
| ICON-D2 `precip-003…005.png` (Regenbeginn jenseits des Radars) | 3 | 70 | 11 904 → 22 346 |

- **D-PF-7 Alles-oder-nichts-Slot.** `fetchRvFromImg` (`radolan.ts`) holt die 25 Frames eines Laufs parallel und dekodiert
  sie **erst, wenn alle da sind** (Kommentar: „ALLES-ODER-NICHTS … Verbraucher brauchen den kompletten 25-Frame-Stapel").
  Seit HD-3 sind das Dual-Frames (v1-Byte + Log-Ebene): 5,4 MB je Slot statt 2,3 MB. Das erste Bild hängt damit an der
  letzten von 25 Dateien; auf Mobil-4G endeten die RV-Frames nach 12,3 s. Der Analyse-Frame (`g000.png`, ≈ 200 KB) allein
  wäre nach < 1 s da.
- **D-PF-8 Bandbreiten-Wettlauf.** Parallel zu den RV-Frames laden CAPE (450 KB), INCA (1,6 MB, 16 Frames), der Fusion-Kern
  (813 KB) und die Stationsprodukte — auf Mobil-4G teilen sich ≈ 8,5 MB die ersten 12 s. Die Nachbarradare laufen schon mit
  `priority: 'low'`; CAPE, Fusion und die Vorhersage-Frames des eigenen Radars nicht.
- **D-PF-9 Hauptthread nach der Ankunft.** CPU-Profil Desktop (Selbstzeit): `lerpValues` (`Rn mapProfile`) **1 832 ms**,
  `RainLayer.setFrame` 1 465 ms, `PrecipCompositor.build` 1 439 ms, `RainLayer.render` 874 ms, `clearStencil` 640 ms,
  React-Commit (`Yt`) 591 ms, `flowEnsemble` 253 ms, `cubeSource` 231 ms. Mobil: **React-Commit `vh` 4 128 ms +
  `setInitialProperties` `d0` 2 136 ms** (DOM-Aufbau), `RainLayer.render` 596 ms, `flowEnsemble` 0,9 s. Die rAF-Lücken
  (0,45–1,25 s, alle ≈ 500 ms am Desktop; 1,0–1,3 s am Stück auf Mobil) zeigen einen **ausgelasteten Hauptthread über
  10–12 s** nach dem Eintreffen der Frames. Die Zuordnung je Feature-Schalter steht in §3.4.
- **D-PF-10 INCA/rzc auf dem Hauptthread dekodiert.** `loadIncaSlot`/`fetchRzcLatest` rufen `loadRadarGrayAlphaPng` →
  `decodeGrayAlphaPng` (Un-Filter-Schleife 701 × 431 × 2 Byte je Frame, 16 Frames) im Hauptthread; nur RV geht über
  `decodeGrayPngsOffMain` in den Worker.
- **D-PF-11 Doppelte `obs/v1`-Leser.** `src/sources/obsStore.ts` (Fusion-Anker) und `src/precipSums/obsSumStore.ts`
  (Stationssummen) lesen dieselben Dateien getrennt (2 × 138 KB gz).
- **D-PF-12 Datenmenge je Besuch.** 8–15,7 MB je kaltem Aufruf des Regenradars (Desktop, inkl. 250-m-Kacheln wo sichtbar).
- **D-PF-13 Die CDN-Frist wirft den langsamen Bild-Weg auf das noch größere Tar (Mobil!).** `radarCdnDeadline` (8 s, „ein hängendes
  CDN darf das Radar nicht länger aufhalten") gilt für den GANZEN RV-Slot. Seit HD-3 sind das 5,4 MB (Dual-Frames) — auf Mobil-4G
  8–13 s. Gemessen (`m2-all.json.gz`, Basis!): Mobil Lauf 2 Frames 1 138 → 13 347 ms, Frist bei ≈ 10,3 s ⇒ `ERR_ABORTED` und **Tar-Rückfall
  `composite_rv_<ts>.tar` 7,4 MB** über Netlify (10 281 → 17 235 ms); mit der M1b-Sequenz (Analyse zuerst) traf die Frist noch öfter
  (3 von 6 Läufen). Nach dem Rückfall lädt das Radar also ZWEIMAL — das ist die lange Ladezeit auf dem Handy. Die Frist stammt
  aus der Zeit der 2,3-MB-Slots (RD3) und wurde bei HD-3 nicht nachgezogen.
- **D-PF-14 Hedge und Parallelität.** 25 Frame-Abrufe gleichzeitig: auf einer vollen Leitung kommen alle fast gleichzeitig am Ende
  an (auch die Analyse), die Antwort-Kopfzeilen brauchen > 2,5 s ⇒ `fetchImgRes` startet für JEDE Datei den raw-Ausweichweg
  (gemessen: `raw:…/[fgm]NNN.png` als Duplikate, `ERR_ABORTED`) — die Zahl der Anfragen verdoppelt sich auf der langsamsten Leitung.
  INCA (16 Frames) ebenso.
- **D-PF-15 Slot-Grenze ⇒ Tar (Bestand, nicht geändert).** Ist der jüngste gerechnete RV-Lauf noch nicht „bild-berechtigt" (`rvImgEligible`:
  Tar-Gate + Derive-Zeit), fragt der Leser gar keinen Bild-Slot an, sondern lädt sofort das 7-MB-Tar vom CDN — in Runde 4 in Lauf 1
  beider Varianten des Ebenen-Klicks (Basis `_dwd_opendata/…tar` 22 353 ms, Variante `radar/rv/composite_rv_<ts>.tar` 21 596 → 29 599 ms,
  danach erst INCA). Der vorige, fertige Bild-Slot läge 5 min zurück. E-NL-1 („voriger Slot zuerst") hatte Jan verneint ⇒ hier nur benannt.

### §3.4 Zuordnung je Schalter (Experimente, Desktop, Regenradar, n = 1, `audit/performance-2026-10-10/exp/`)

| Variante | erstes Radarbild | letzte Radardatei | rAF-Lücken > 200 ms | Hauptthread beschäftigt | Spitzen des CPU-Profils (Selbstzeit) |
|---|---|---|---|---|---|
| Basis (zweiter Lauf) | 4 054 ms | 5 174 | 30 (max 1 183) | 4,2 s | React-DOM `setInitialProperties` 615, `calculatePosMatrix` 318, `RainLayer.render` 250, `radarImg` (Decode main) 197 |
| `?hdmorph=0` | 5 577 | 4 507 | 22 (max 2 083) | 6,7 s | `PrecipCompositor.build` 1 290, `calculatePosMatrix` 619, React 583 |
| `?hd=0` | 4 885 | 3 029 | 34 (max 1 000) | 4,8 s | `build` 1 390, `ws pointForecast` 282, maplibre `uploadPending` 208 |
| `?hd250=0` | 5 170 | 3 879 | 22 (max 1 250) | 6,8 s | **`radarImg` Decode auf dem Hauptthread 1 794**, maplibre `draw` 544 |
| `?zo=0&hzs=0&sk=0&z3d=0&rb=0&rc=0` | 12 969 (anderer Slot) | 7 976 | 33 (max 1 517) | 6,3 s | maplibre `Eo` 1 134, `radarImg` 404, `RainLayer.render` 323 |
| `?pf=live` (ohne buscosun Fusion am Streifen) | 4 821 | 5 149 | 15 (max 1 267) | — | — |

**Lesart:** Kein einzelner Schalter beseitigt die Lücken; sie sind die Summe mehrerer mittlerer Posten auf einem ausgelasteten
Hauptthread (Komposit-`build`, Hauptthread-PNG-Decode für INCA/rzc/Rückblick, React-Commit, Fusion-Rechnung, Flow-Ensemble) plus
der mit SwiftShader überzeichneten Zeichenkosten (`render`, `draw`, `calculatePosMatrix`). Die Zahlen schwanken zwischen Läufen
stark (andere 5-min-Slots, Regenfläche) — nur Vorher/Nachher im selben Lauf zählt. Die **Zeit bis zum ersten Radarbild hängt an
keinem Feature-Schalter**, sondern am Alles-oder-nichts-Slot (D-PF-7) und am Bandbreiten-Wettlauf (D-PF-8).

### §3.5 Erster Versuch M1 (Analyse-Frame zuerst) — Lehre

Lauf `m1-radar.json.gz` (Basis gegen M1, abwechselnd, n = 3): die Reihenfolge auf der Leitung stimmte (`g000.png` 722 → 967 ms,
die 24 Vorhersage-Frames erst danach), das erste Radarbild kam trotzdem nicht früher (Desktop 5 054 gegen 5 425, Mobil 7 213 gegen
7 036). Ursache: Karte (`MapView.loadRv`) und Streifen (`radarFrames.getRadarStack`) teilen sich EINEN laufenden Slot-Abruf
(`shareInFlight`); der Streifen startet ihn ≈ 290 ms nach dem Seitenstart, die Karte abonniert das Frühbild erst nach ihrem
`load` (≈ 1 s) — die Veröffentlichung war da schon vorbei. Außerdem warteten die 24 Vorhersage-Frames auf das Decode des
Analyse-Frames (Worker-Start + Decode ≈ 0,7–0,85 s Leerlauf auf der Leitung). Beides behoben (M1b): das zuletzt veröffentlichte
Frühbild wird einem späten Abonnenten nachgereicht (Replay ≤ 5 min), die Vorhersage-Frames starten, sobald die Analyse-BYTES da
sind, und der Frühstart (`warmRvTar`) wärmt neben `f000.png` auch `g000.png`.

**Zweiter Versuch (`m2-all.json.gz`, Basis gegen M1b + M2 + M4 + M5):** Regenradar Desktop erstes Radarbild 6 803 gegen 5 512 ms
(p50, n = 3, Spanne 4 856–7 284 gegen 4 711–6 554 — Rauschen, kein Gewinn), aber **Wetterkarte, Ebenen-Klick: Radarbild 1 432
gegen 2 122 ms** (p50) — dort, wo der Stil der Karte beim Eintreffen des Frühbilds schon geladen ist, wirkt M1. Auf dem
Regenradar kommt das Frühbild ≈ 1,1 s nach dem Seitenstart, VOR dem `load` des Kartenstils: `hoistRain()` ruft `map.moveLayer`,
das ohne geladenen Stil eine Ausnahme wirft — sie brach `onEarlyRv` ab, bevor der Tick gesetzt war; der nächste Tick kam erst
mit INCA/rzc (≈ 3–5 s). Behoben (M1c): `hoistRain` im Frühbild-Pfad abgesichert, und `addLayers` (nach dem Stil-`load`) setzt
einen Tick, wenn schon eine Radarquelle da ist.

## §4 Maßnahmen (Wirkung / Risiko) — Plan

| Nr. | Maßnahme | Problem | Datenwerte | Risiko |
|---|---|---|---|---|
| M1 | Analyse-Frame des RV-Slots zuerst holen, allein dekodieren und sofort zeichnen (`onRvAnalysisEarly`, `earlyRvRef` in `MapView`), danach die 24 Vorhersage-Frames wie bisher in einem Zug | D-PF-7 | identisch — derselbe Decoder, der fertige Stapel ist byte-gleich und in Meta-Reihenfolge; nur ein früheres Zwischenbild (die Analyse zu ihrer eigenen Zeit) | mittel: neue Zwischenzustände in `MapView` (nur wo die Zeit = Analysezeit ist; `rvAtValidTime`-Toleranz, `forecastHour === 0`) |
| M2 | Im progressiven Fusion-Modus starten die Radarprodukte (Stundenmittel, Frames, Slot-Sonden) erst, wenn die Bytes der ersten Stufe da sind (`firstBytesP`, Muster `deferLater` aus AP12) | D-PF-4/5 | identisch — Endausgabe gleich; die vorläufige erste Ausgabe rechnet ohne Radar-Member, die Nachlieferung (`UPDATE_WAIT_MS`) bringt ihn wie bisher | gering |
| M4 | INCA-, rzc- und Rückblick-PNGs im RV-Worker dekodieren (`loadRadarGray[Alpha]PngOffMain`, Hauptthread als Rückfall) | D-PF-10 | identisch — derselbe Decoder (`grayPng.ts`) im Worker | gering |
| M5 | Klick-Rückmeldung: Fortschrittsbalken während `navigation.state === 'loading'` (`App.tsx`); Abbau der Hero-Karte (`Map.remove()`) erst nach dem nächsten Paint | D-PF-1/2 | keine Datenänderung; **einzige sichtbare UI-Ergänzung** (3 px Balken oben, Tokens) | gering |
| M6 | `obs/v1` einmal lesen (Summen-Leser nutzt den memoisierten Fusion-Leser) | D-PF-11 | identisch (gleiche Dateien) | gering |
| M3 | CAPE/Fusion-Streifen am Regenradar hinter das erste Radarbild stellen | D-PF-8 | identisch | gering — Priorität `low` ist schon gesetzt; nur Reihenfolge |
| M7 | Dashboard: Nivo-`_onResize`-Stürme | D-PF-6 | — | offen, erst messen |
| M8 | CDN-Frist fortschrittsbasiert (`touch()` je angekommener Datei — 8 s OHNE Fortschritt bleibt der Hänger-Schutz) und je Slot höchstens `RADAR_IMG_CONCURRENCY` = 6 Frame-Abrufe gleichzeitig (RV, INCA) | D-PF-13/14 | identisch — dieselben Dateien, dieselbe Reihenfolge im Ergebnis | gering: Leser ohne `touch` verhalten sich wie bisher; der Tar-Rückfall bleibt der benannte Weg bei echtem Hänger |
| ~~M9~~ | Kartenebenen bei `style.load` statt `load` anlegen — **gebaut, gemessen (Regenradar Desktop 7,3 → 2,5 s, Mobil 9,6 → 4,8 s, `m5-all.json.gz`) und ZURÜCKGENOMMEN:** Pixel-Diff der Wetterkarte zeigte das Radar unter der DACH-Maske (Installer bei `load`) und, nach dem Umzug auch der Maske, mit blockierten Daten eine Abdunkelung über der ganzen Karte (42–73 % Abweichung, `pixeldiff2-m6-style-load.log`). Die Installer-Reihenfolge an `load` ist gekoppelt (§6) | D-PF-7 | — | zu hoch für diese Phase |
| M10 | `loadNowSource`: eigenes Landesradar zuerst, die zwei Nachbarn danach (Bytes vor Bandbreite; `prioFor` ordnete nur die Priorität) | D-PF-8 | identisch (dieselben drei Slots, Ankunftsreihenfolge anders) | gering: AT/CH-Teile des Komposits erscheinen nach dem eigenen Radar (Zwischenzustand gab es schon) |
| M11 | CAPE/Warnungen (Gewitter-Index) erst nach dem Radar-Stapel | D-PF-8 | identisch | gering |
| — | Komposit-`build` überspringen, wenn die HD-Ebenen das Bild tragen | D-PF-9 | **ändert das Bild** (Komposit liegt unter den HD-Ebenen, beide halbtransparent) ⇒ nicht ohne Jans Entscheidung | — |

## §5 Umsetzung und Nachmessung

Jede Runde: Basis-Bau (`perf-base-dist`) gegen den Bau mit den Maßnahmen, **abwechselnd im selben Browser-Lauf**, p50 von n = 3,
kalter Kontext je Lauf. Rohdaten `audit/performance-2026-10-10/m*-all.json.gz`.

> **Zu den Uhrzeiten in §2 und §5 (Nachprüfung 10.10.):** die als „UTC" genannten Zeitfenster sind nicht belastbar — die Dateien
> der Sitzung (Bauten `perf-base-dist` … `perf-m7-dist`, letzte Quelländerung, Endbau) liegen zwischen 11:00 und 16:03 UTC, die
> Rohdaten tragen keinen eigenen Zeitstempel. Reihenfolge der Runden und Messwerte sind davon unberührt.

### §5.1 Runde 2 — M1b + M2 + M4 + M5 (`m2-all.json.gz`, 10.10. 15:50–16:50 UTC)

| Szenario · Größe | Desktop Basis → M | Mobil-4G Basis → M |
|---|---|---|
| fusion · erste Ausgabe | 1 966 → **1 713 ms** | 4 400 → **3 231 ms** |
| fusion · Kern | 2 087 → 1 774 | 5 210 → 4 135 |
| radar · erstes Radarbild | 5 512 → 6 803 (Rauschen; Frühbild noch nicht gezeichnet, §3.5) | 13 578 → 7 107 |
| radar · rAF-Lücken > 200 ms | 21 → 31 | 29 → 20 |
| layer · Radarbild nach Klick | 2 122 → **1 432** | 5 053 → **3 228** |
| click · URL-Wechsel | 202 → 465 (`useNavigation` in `App` ließ die Startseite neu rendern — behoben, Runde 3) | **2 922 → 561** |
| click · erste DOM-Änderung | 54 → 88 | 2 465 → 336 |

Befund dieser Runde: in 3 von 6 Mobil-/Desktop-Läufen des Regenradars fiel der Bau MIT M1b auf den **Tar-Rückfall** (7,4 MB), weil die
Analyse-zuerst-Sequenz die 8-s-CDN-Frist noch öfter reißen ließ als die Basis (D-PF-13) ⇒ M8.

### §5.2 Runde 3 — M1c + M2 + M4 + M5 (Balken isoliert) + M6 + M8 (`m4-all.json.gz`, 10.10. 17:30–18:40 UTC)

| Szenario · Größe | Desktop Basis → M | Mobil-4G Basis → M |
|---|---|---|
| fusion · erste Ausgabe | 1 820 → 1 913 (Rauschen, −5…+5 %) | 4 352 → **3 160 ms** (−27 %) |
| fusion · Kern | 2 287 → 2 000 | 5 345 → 4 025 |
| radar · erstes Radarbild | 6 579 → 5 873 | 8 717 → 7 133 |
| radar · rAF-Lücken > 200 ms | 24 → 22 | 25 → 16 |
| radar · Tar-Rückfall (Läufe) | 0 → 0 | Basis 1 von 3 (7,3 MB Tar) → 0 von 2 gültigen |
| layer · Radarbild nach Klick | 3 905 → **3 296** | 4 506 → **3 770** |
| layer · Rückmeldung | 317 → 266 | 286 → 343 |
| click · URL-Wechsel | 440 → 777 (!) | 590 → 667 |
| click · erste DOM-Änderung | 109 → 569 (!) | 318 → 423 |

**Lesart Runde 3.** Fusion mobil reproduziert (−27 %). Der Mobil-Klick-Gewinn der Runde 2 (2 922 → 561) reproduziert NICHT (590 → 667) —
die Basis war in Runde 2 an jedem der drei Läufe 2,4–2,6 s langsam, in Runde 3 nicht; Ursache in der Basis nicht gefunden (die
Hero-Karte lud in beiden Runden), der Klick-Gewinn gilt daher als **nicht belegt**. Desktop-Klick in Runde 3 schlechter (109 → 569
erste DOM-Änderung): der Balken rendert als erste Änderung (`firstMutation` misst jetzt den Balken, nicht den Seitenwechsel) — aber
der URL-Wechsel kam ebenfalls später (440 → 777); n = 3 mit Spannen 19–800 ms, der Effekt ist nicht signifikant, aber auch nicht
ausgeschlossen ⇒ offener Punkt V-PF-3 (Balken ja/nein ist Jans Entscheidung, Messung mit n ≥ 10).
### §5.3 Runde 4 (mit M9) und Runde 5 (ENDSTAND ohne M9) — M1c + M2 + M4 + M5 + M6 + M8b + M10 + M11

Runde 4 (`m5-all.json.gz`, 10.10. 19:40–20:40 UTC) enthielt M9 (Ebenen bei `style.load`), das nach dem Pixel-Diff zurückgenommen wurde
(§5.4); die Radar-/Ebenen-Zeilen wurden deshalb in **Runde 5** (`m7-radar.json.gz`, 23:00–23:40 UTC, Endbau `perf-m7-dist`) neu gemessen —
die Fusion- und Klick-Zeilen stammen aus Runde 4 (die Rücknahme von M9 berührt sie nicht; der Endbau unterscheidet sich dort nur um
M8b, das nur bei hängendem CDN wirkt).

| Problem | Größe | Desktop Basis → Endstand | Mobil-4G CPU×4 Basis → Endstand |
|---|---|---|---|
| 3 Niederschlagsradar | erstes Radarbild `/regenradar/muenchen` (p50, Spanne; Runde 5) | **6 548 → 5 795 ms** (5 616–7 240 → 4 748–6 190), −11 % | **7 731 → 6 222 ms** (6 950–7 818 → 6 063–14 630), −20 % |
| 3 Niederschlagsradar | dito mit M9 (Runde 4, verworfen — der Hebel liegt im `load`-Zeitpunkt der Karte, V-PF-9) | 7 312 → 2 491 | 9 565 → 4 758 |
| 3 Niederschlagsradar | letzte Radardatei (ganzes DACH-Komposit; Runde 5) | 5 088 → 12 082 (Pool 6 + Nachbarn nach dem eigenen Radar, Proxy-Latenz je Anfrage) | 11 319 → 15 804 |
| 3 Niederschlagsradar | rAF-Lücken > 200 ms (Runde 5) | 23 → 30 | 25 → 20 |
| 3 Niederschlagsradar | Tar-Rückfall (Läufe mit `composite_rv_*.tar`; Runde 5) | 0 / 3 → 0 / 3 | 0 / 3 → 1 / 3 (Lauf 3: Slot an der Bildgrenze, D-PF-15 — auch die Basis traf das in Runde 3/4) |
| 1 Klick: Ebenen-Schalter „Niederschlag" (Wetterkarte; Runde 5) | erstes Radarbild nach Klick | **4 661 → 2 203 ms**, −53 % | **4 169 → 2 974 ms**, −29 % |
| 1 Klick: Ebenen-Schalter | Rückmeldung `aria-checked` | 225 → 204 | 395 → 354 |
| 1 Klick: Kachel → Regenradar | URL-Wechsel (Navigation committed) | **637 → 299 ms** | 894 → 826 |
| 1 Klick: Kachel → Regenradar | erste sichtbare Änderung (Balken bzw. Seite) | 521 → 147 | 519 → 553 |
| 2 buscosun Fusion (Dashboard) | erste Ausgabe | 2 306 → 2 069 ms, −10 % | **5 215 → 3 726 ms**, −29 % |
| 2 buscosun Fusion (Dashboard) | Kern | 2 768 → 2 582 | 6 246 → 4 676 |
| 2 buscosun Fusion (Dashboard) | Bytes `point/` + `obs/` | 1 287 + 643 KB (gleich) | gleich |

Alle Zellen p50 aus n = 3, Basis und Endstand abwechselnd im selben Browser-Lauf, kalter Kontext; Rohdaten mit Request-Listen und
CPU-Profilen in `m5-all.json.gz`. Desktop-Klick: in jeder Runde anders (Basis 202 / 440 / 637 ms URL-Wechsel), der Endstand ist in Runde 4
schneller, in Runde 3 war die Variante langsamer — der Klick-Wert hängt am Zustand der Hero-Karte beim Klick (SwiftShader-Abbau) und
ist mit n = 3 nicht belastbar (V-PF-3). Die Zahl, die nicht gewonnen hat: die ZEIT BIS ZUM GANZEN KOMPOSIT auf dem Desktop
(7,3 → 14,7 s), weil die Nachbarradare jetzt nach dem eigenen laden und je Slot nur sechs Dateien gleichzeitig unterwegs sind — auf
dem Handy war das die Rettung vor dem Tar-Rückfall, am Desktop kostet es (V-PF-5: Pool-Größe je Leitung).

**Erstes Radarbild im Regenradar (Runde 3):** die DEV-Sonde (`scripts/perf-early-probe.mjs`) zeigt den Mechanismus intakt — Frühbild da,
Zeicheneffekt läuft, aber der Texturupload wartet auf `map.once('load')` (erst Kacheln, Sprite, Glyphen: im Lab 3–4 s nach dem
Stil) ⇒ M9. Die volle Slot-Zeit wurde mit dem 6er-Pool auf dem Desktop länger (Proxy-Latenz je Anfrage) und auf Mobil-4G blieb der
Slot bei ≈ 9 MB Gesamtlast in 15–35 s — die Leitung ist das Limit ⇒ M10/M11 (Reihenfolge: eigenes Radar, dann Nachbarn und CAPE).

### §5.4 Datenwerte vorher/nachher (`scripts/perf-data-identity.mjs`, zwei `vite dev`: Basis `b9765a0` gegen den Zweig, Seiten gleichzeitig geöffnet)

| Teil | Vergleich | Ergebnis (Läufe 5–8, 10.10. 21:00–21:40 UTC) |
|---|---|---|
| Regenradar RV | 25 Frames: FNV-1a über `values` UND `values2` (Log-Ebene), Lauf-/Gültigkeitszeiten, Reihenfolge | **identisch** in jedem Lauf (`identity-5…8.log`) |
| Regenradar rzc, Besitz-Masken DE/AT/CH | Hash je Ebene | **identisch** in jedem Lauf |
| Regenradar INCA | Hash der `values` je Lead | **identisch** wo beide Instanzen denselben Slot lasen; die Basis-DEV-Instanz nahm in 3 von 4 Läufen den GeoSphere-Direktweg (Rate-Limit nach den vielen Lab-Läufen: 11–12 Frames ohne Log-Ebene, andere Ecken-Rundung) — ein Umgebungs-, kein Code-Unterschied (`v` der gemeinsamen Leads gleich) |
| buscosun Fusion (Fusion 12, progressiv, Endausgabe nach `onUpdate`) | Hash über ALLE Stundenwerte (T, u, v, Böe, RH, Niederschlag, Bewölkung), Notizen/Skips ohne Alterswerte, `v2`-Block ohne Lesestatistik | **Stunden identisch** in jedem Lauf; Notizen identisch; `v2` identisch bis auf die eingebettete Lesestatistik (`fetched.files` 66 → 68: die früher gestarteten Slot-Sonden zählen) und die Alterszeile der Index-Kopie |

Lehre M9: Ebenen bei `style.load` anzulegen, während die Abdunkelung/DACH-Maske noch bei `load` kam, legte die Maske ÜBER das Radar
(Pixel-Diff Lauf 1: `wk-niederschlag-live` 4,4 %/12 % Abweichung, Bild ohne Radar). Behoben, indem beide Installer in der alten
Reihenfolge bei `style.load` laufen; Pixel-Diff Lauf 2 in §5.5.

### §5.5 Gates (Worktree `perf`, 10.10. 20:50–22:30 UTC; Basis-Worktree `perf-base` = `b9765a0` zum Vergleich)

| Gate | Ergebnis | Basis (`b9765a0`) |
|---|---|---|
| `npm run typecheck` | 0 Fehler | — |
| `verify:radar-fallback` | **25/25** (nach M8b: der Pool hebt sich, sobald der CDN-Hedge feuert — mit festem Pool waren B1–B3 rot: 18 s statt < 8 s bei hängendem CDN) | 25/25 |
| `verify:routing` | **255/255** (Erwartung des Frühstarts um `g000.png` erweitert) | 239/239 (ohne `dist`) |
| `verify:radar-runs` | 56/56 | — |
| `verify:radar-repack` | 54/55 — B2c (schneller Weg ≥ 2× jsfive) unter Last rot, C1 ⊘ | 54/55 (CLAUDE.md: B2c/B1h lastabhängig) |
| `verify:regenradar-profile` | 34/36 — C1b (Bestand, V-FR-11-Phasenwache) und E7 (Phasenwache „`src/point` ohne Diff zu HEAD" — `readPoint.ts` M2, grün nach dem Commit) | 35/36 (C1b) |
| `verify:point-client` | exit 1 — dieselbe Zelle wie an der Basis ((10s) zeitabhängig, V-EX-13) | exit 1 |
| `verify:pv-cube` | 437/441 — (4) „Rechnung < 100 ms je Punkt" unter Fremdlast 259 ms (V-FR-8), Motor unberührt | — |
| `verify:layer-erstbild` 38/38 · `verify:radar-hd` 53/53 · `verify:precip-sums` 57/57 · `verify:obs-reader` 41/41 · `verify:dashboard` 80/80 · `verify:fusion-release` 30/30 · `verify:np0-radar` 39/39 | grün | — |
| `verify:share` | 527/528 — SH6 Edge-Bündel (`npm run edge:share`, Jans Gate, Bestand) | 527/528 |
| Pixel-Diff Wetterkarte (`regenradar-wk-pixeldiff.mjs`, Basis-Bau gegen Endbau `perf-m7-dist`) | deterministische Szenarien (Daten blockiert) Lauf 4 (`pixeldiff/pixeldiff4.log`): wk-wind Desktop/Mobil **0 px**, wk-overview Desktop 95 px (0,007 %) / Mobil 0 px, warnungen 127 px (0,01 %); Live-Szenarien Lauf 3: Niederschlag Desktop 1,3 % / Mobil 2,0 % (anderer Ladezeitpunkt des Radars innerhalb der 14 s — nach M10 erst DE, dann AT/CH), Regenradar 0–0,03 %. Lauf 3 der Block-Szenarien (41–69 %) war ein Basemap-Ausfall einer Seite (openfreemap nach ≈ 60 Lab-Läufen; Lauf 4 sauber) | Lauf 1 (Bau mit M9): Niederschlag-live 4,4 % / 12 % = Radar unter der Maske ⇒ M9 zurück |
| `npm run build` (Endbau, mit `verify-seo`/`verify-routing`) | s. §5.6 | — |
| `npm run budget` | s. §5.6 | — |

**Nachprüfung vor dem Merge (10.10. 18:05–18:15 UTC, zweite Sitzung, alle Gates nacheinander im Worktree `perf`):** typecheck 0,
Build 255/255, Budget grün (eagerJs 109,6 / 109,7 · totalJs 1 710,8 / 1 712), `verify:radar-fallback` 25/25, `radar-runs` 56/56,
`radar-repack` 55/55, `layer-erstbild` 38/38, `radar-hd` 53/53, `radar-edge` 24/24, `radar-250m` 21/21, `precip-sums` 57/57,
`obs-reader` 41/41, `dashboard` 80/80, `fusion-release` 30/30, `np0-radar` 39/39, `point-client` 179/179. Rot, jeweils gegen den
sauberen Basis-Worktree `perf-base` (`b9765a0`) bzw. `main` geprüft und nicht aus dieser Phase: `regenradar-profile` 34/36 (C1b
auch an der Basis; E7 = Phasenwache auf `readPoint.ts`, grün nach dem Commit), `share` 527/528 (SH6 Edge-Bündel, auch an der
Basis), `pv-cube` 440/441 — Zelle (21) „kein App-Modul importiert `profileColumn`" trifft `src/nowcast/heightTime/heightTimeModel.ts`
(Phase HZS, schon auf `main` `646142b`; **V-PF-10:** die AP15-Wache ist seit HZS überholt), `radar-threshold` 27/28 — E1 (sha256
der eingefrorenen Behauptungen) nur in den Worktrees rot, weil `claims-frozen.txt` dort mit CRLF ausgecheckt ist (`main`: LF, 28/28;
**V-PF-11:** `.gitattributes` `-text` für eingefrorene Dateien).

### §5.6 Endbau und Budget

- `npm run build` (tsc, vite, `generate-seo`, `verify-seo`, `verify-routing`): **255/255**, Exit 0 (10.10. 23:55 UTC).
- `npm run budget`: eagerJs **109,6 KB** (Ratsche 109,4 → **109,7**, mit Notiz in `budget.json`; Jan 30.09.: Grenzen dürfen angehoben
  werden): +0,2 KB gzip im Start-Chunk = `NavProgress` (App.tsx) + im Frühstart-Modul `radolanRuns.ts` die fortschrittsbasierte Frist
  (`touch`) und der gewärmte Dual-Analyse-Frame (`radarImgDualFile`); der Abruf-Pool liegt bewusst im lazy `radarImg.ts`. eagerCss 2,4 /
  2,5, largestChunk 278,4 / 302, totalJs 1 710,8 / 1 712 unverändert. Alle Budgets eingehalten.
- Diff des Zweigs: 16 Dateien, +339 / −72 Zeilen in `src/` + Verifier + Doku; neu `scripts/perf-measure.mjs`, `perf-early-probe.mjs`,
  `perf-data-identity.mjs`, dieses Audit mit Rohdaten (`performance-2026-10-10/`, 2,3 MB gz).

## §6 Bewusst nicht umgesetzt

| Idee | Warum nicht |
|---|---|
| Kartenebenen bei `style.load` statt `load` (M9) — der größte Hebel für das erste Radarbild im Lab (Regenradar Desktop 7,3 → 2,5 s, Mobil 9,6 → 4,8 s in Runde 4) | Die Installer der Abdunkelung und der DACH-Maske (`initOverlays`) und die Reihenfolge der Ebenen hängen an `load`; bei `style.load` lag die Maske über dem Radar, nach dem Umzug der Maske lag die Abdunkelung bei blockierten Daten über der ganzen Karte. Alle `once('load')`-Installer gemeinsam umzuziehen ist eine eigene Phase mit Pixel-Diff je Ansicht (V-PF-9). Wie groß der Gewinn in Produktion wäre (Sprite/Glyphen/Kacheln kommen dort schneller als im Lab), ist nicht gemessen. |
| Komposit-`build` + Upload überspringen, wenn die drei HD-Ebenen das Bild tragen (D-PF-9: `build` 1,3–1,4 s Selbstzeit je Lauf) | Das Komposit liegt UNTER den HD-Ebenen, beide halbtransparent — das Bild ändert sich (Deckkraft-Summe). Nur mit Jans Entscheidung, nicht in dieser Phase (Bild muss pixelgleich bleiben). |
| Weniger Bytes je RV-Slot (nur `f`-Frames statt Dual, Vorhersage-Frames erst beim Scrubben) | Ändert die Datengrundlage der Karte (Log-Ebene) bzw. das Verhalten des Zeitstrahls (E-HD-3/E-HD-5 von Jan); außerhalb des Auftrags. |
| Lernstufe/Fusion-Rechnung beschleunigen (`cubeSource` ≈ 0,5 s mobil) | Fusion-Engine-Änderung = STOPP & FRAGEN; die Rechnung ist nicht der Engpass (Netz). |
| Ebenen-Bereiche (HTTP-Range) für den 523-KB-t1-Chunk (V-FI-42) | Braucht die identity-Variante am CDN (Publisher-Warm-up) — Jans Gate, Daten-Repo. |
| `pointPoPSeries`/Flow-Ensemble in einen Worker (0,3–0,9 s Hauptthread mobil) | `useMemo` synchron im Render; asynchron würde die Reihenfolge der UI-Zustände ändern (PoP erscheint später) — kleiner Gewinn, eigene Phase. |
| Nivo-`_onResize` im Dashboard (D-PF-6, 341 ms mobil) | Nicht gemessen, woher die Resize-Stürme kommen (ResizeObserver der Diagramme bei Layout-Shift während die Daten eintreffen); erst Messung, dann Maßnahme — offen V-PF-4. |
| Fortschrittsbalken abschaltbar / anderes Design | Einzige sichtbare Ergänzung (3 px, Tokens, nur während `navigation.state === 'loading'`); ob er bleibt, entscheidet Jan (V-PF-3). |
| `RADAR_IMG_CONCURRENCY` kleiner/größer je Leitung | Nur Lab-Messung (Desktop/4G); eine adaptive Regel braucht Real-Device-Zahlen (V-PF-5). |

## §7 Befunde V-PF

- **V-PF-2 Lab-Grundrauschen.** Zwischen den Runden schwanken die Basiswerte um bis zu Faktor 3 (Klick Desktop 202 / 440 / 637 ms;
  Radar Mobil 7–14 s), weil die Live-Slots, die Regenfläche und der CDN-Zustand wechseln; eine Messung ist nur als
  Basis-gegen-Variante im selben Lauf lesbar. Ein eingefrorener Datensatz (Slot-Spiegel auf localhost) würde den Harness
  reproduzierbar machen — eigene Phase.
- **V-PF-3 Fortschrittsbalken ja/nein (E-PF-1).** Sichtbarkeit sofort (147 ms Desktop), aber in Runde 3 war der Seitenwechsel mit
  Balken langsamer, in Runde 4 schneller (n = 3). Entscheidung Jan; Messung mit n ≥ 10 auf einem eingefrorenen Datensatz.
- **V-PF-4 Nivo-`_onResize` im Dashboard** (341 ms Selbstzeit mobil) — Resize-Stürme der Diagramme während die Daten eintreffen;
  nicht angefasst, erst messen, welcher Container die Größe ändert.
- **V-PF-5 Pool-Größe und Nachbar-Reihenfolge je Leitung (E-PF-2).** Desktop: ganzes Komposit 7,3 → 14,7 s im Lab (Proxy-Latenz je
  Anfrage, Pool 6, Nachbarn seriell); Handy: Rettung vor dem Tar. Adaptiv (z. B. `navigator.connection`, Breite) oder Pool 10–12 —
  braucht Real-Device-Zahlen.
- **V-PF-6 Real-Device.** SwiftShader überzeichnet GPU-nahe Kosten (Upload, `render`, `Map.remove()`); Long Tasks in headless-shell
  nicht messbar (rAF-Lücken als Ersatz). Ein Mitschnitt am Handy (DevTools) für `/regenradar/muenchen` kalt steht aus.
- **V-PF-7 Slot-Grenze ⇒ Tar (D-PF-15).** Ein neuer Lauf, der noch nicht bild-berechtigt ist, lädt das 7-MB-Tar statt des fertigen
  Bild-Slots von vor 5 min. E-NL-1 war „nein"; mit den Mobil-Zahlen (Tar = zweites Laden) lohnt eine erneute Entscheidung.
- **V-PF-8 Hauptthread nach der Ankunft** (D-PF-9): Komposit-`build` + CPU-Mischen + Uploads + React-Commit bleiben 10–12 s lang
  spürbar (rAF-Lücken 16–27 > 200 ms); die Hebel (Komposit unter HD überspringen, Flow-Ensemble in den Worker, Render-Entkopplung
  der Zelle/Orte-Karten) ändern Bild oder Reihenfolge — eigene Phase mit Jans Entscheidung.
- **V-PF-1 (Messung):** Der erste Harness-Lauf klickte auf Mobil die erste passende Kachel auch außerhalb des Viewports
  (kein `scrollIntoView`) und erkannte den Ebenen-Schalter im mobilen Reiter „Layer" nicht; die Radar-Texturerkennung
  zählte leere 1100 × 1200-Uploads (`HD250_ZERO`) als Radarbild. Behoben in `perf-measure.mjs` (Null-Filter,
  `scrollIntoView`, Reiter öffnen) — die Mobil-Zellen `click`/`layer` der Tabelle in §2 stammen aus dem korrigierten Lauf,
  wo angegeben.
