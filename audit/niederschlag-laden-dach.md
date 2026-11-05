# audit/niederschlag-laden-dach.md — Phase ND: der Niederschlag-Layer über DE, AT und CH schneller und zuverlässiger

> Jans Auftrag (03.11.2026): „das Laden des Niederschlagslayers über DE, CH und AT optimieren, sodass er schneller und
> zuverlässiger geladen wird." Vorgängerphasen: NL (`niederschlag-ladezeit.md`, 01.10.: Frist für den Frühstart, Ausweichweg
> raw.githubusercontent), PF (`performance-2026-10-10.md`: Analyse-Frame zuerst, Pool, Fortschrittsfrist, eigenes Radar zuerst),
> RL/NC (Slot-Memos, abgeleitete Produkte AT/CH). Messwerkzeuge und Rohdaten in `audit/niederschlag-laden-dach/`.

## §0 Kurzfassung

- **Gemessen (03.11., 20:25–20:30 UTC, neun kalte Produktionsaufrufe Desktop, je Ort München/Wien/Zürich):** erstes eigenes
  Radarbild **DE 5,0–11,7 s, AT 4,2–7,8 s, CH 2,3–2,6 s**; das ganze DACH-Komposit nach **7,3–18,4 s**. Alle drei Quellen kamen
  in jedem Lauf (kein „⚠ Fehler"), aber auf Umwegen.
- **Ursache 1 — jsDelivr liefert frische Dateien schlecht:** einzelne Frames eines frischen Slots antworten **403** (1,4–1,7 s je
  Antwort bei `MISS`, danach am Edge **festgehalten** — dieselben Dateien 403 in drei Läufen hintereinander), kalte Abrufe hängen
  2,5–7,4 s. Der Ausweichweg (NL-2) rettet jede Datei, aber **erst nach** der Frist von 2,5 s bzw. nach der 403-Antwort — je
  Datei, nacheinander innerhalb des Pools (§1.2, Läufe #0, #1, #8).
- **Ursache 2 — der Frühstart hängt unbeaufsichtigt:** bei AT/CH-Orten lädt DE erst nach dem eigenen Radar (M10). Die vom Router
  vorgestarteten `meta.json`/`g000.png` hingen in Lauf #1 **7,4 s** am CDN; die Ausweichfrist beginnt erst, wenn der Leser die
  Antwort entgegennimmt (NL-1 koppelt die Frist, aber ab dem Zeitpunkt des Lesens, nicht ab dem Start).
- **Ursache 3 — der Spiegel verpasst das Bild-Gate:** von 16 RV-Slots der letzten 76 min lagen **3 (19 %) erst nach 270 s** im
  Daten-Repo (277, 321, 484 s; Median 234 s). Der erste Client nach dem Gate fragt dann einen Pfad an, den es noch nicht gibt;
  jsDelivr hält diesen 404 ≈ 66 s fest (RD2 §10.3) — für alle Besucher dieser Minute. KONRAD 2 von 15 über 330 s, rzc 1 von 15
  über 240 s. Das Daten-Repo bekommt 1,3 Pushes je Minute (obs, road, sea, radiosonde, radar).
- **Ursache 4 — Latenz je Anfrage statt Bytes:** ein Slot sind heute 26 (RV), 35 (INCA 5 min) bzw. 72 (CH-Hochrechnung) Dateien
  von 1–30 KB (trockener Abend: RV-Slot 173 KB). Mit Pool 6 und 0,3–0,7 s je CDN-Antwort kostet ein Nachbarradar 3–5 s, egal wie
  schnell die Leitung ist. Der rohe DWD-Tar (seit dem HDF5-Umstieg **840 KB**, ein Abruf) war mit **5,0 s** das schnellste DE-Bild.
- **Ursache 5 — jsDelivr `@main` hinkt (Sonde §1.4):** am Client-Gate (270 s) hat das CDN den RV-Slot in **3 von 3 Fällen noch
  nicht** (404, erst 31–90 s später 200), raw.githubusercontent hat ihn ab 277–280 s. Jeder Erstbesucher der ersten ≈ 90 s eines
  Slots zahlt 26 × (404 + raw).
- **Was wirkt (Plan §3, umgesetzt §5):** ND-1 Frist/Ausweichweg ab dem Start des Frühstarts rechnen; ND-2 je Slot den Herkunftsort
  merken — hat raw für diesen Slot einmal geliefert, was das CDN nicht lieferte, gehen die übrigen Dateien des Slots sofort über
  raw (CDN wird der Ausweichweg); ND-3 Pool 12 auf Desktop-Leitungen (Mobil bleibt 6); ND-4 GeoSphere-`/metadata` beim Start des
  Komposits anstoßen statt nacheinander; ND-5 Sitzungs-Latch mit Ablauf (V-NL-1); ND-6 Statuszeile nennt ein ausgefallenes
  Landesradar; ND-7 junger RV-Slot (< 6 min) raw zuerst, auch im Frühstart. **Jans Gate (Daten-Repo):** E-ND-1 Warm-up im
  Spiegel nach dem Push (E-NL-2, offen seit 01.10.), E-ND-2 ein Bündel je Slot (eine Datei statt 26/35/72), E-ND-3 RV-Bild-Gate
  gegen den gemessenen Push-Verzug.

## §1 Messung

### 1.1 Werkzeug

`audit/niederschlag-laden-dach/lab2.mjs` (Ableger von `niederschlag-ladezeit/lab.mjs`): eigener Chromium 148 (`--headless=new`,
echte GPU), frischer Browser-Kontext je Lauf (kalter HTTP-Cache, kalte Cache-API), Desktop 1440 × 900, Produktion
`buscosun.com/wetterkarte/niederschlag?ort=…&land=de|at|ch`, Läufe rotieren DE → AT → CH im Abstand von ≈ 31 s, 30 s Messfenster.
Gemessen wird die Konsolenzeile je Quelle (`Niederschlag-Layer →` RV, `GeoSphere INCA →`, `MeteoSwiss rzc →`, `CH Hochrechnung →`,
`AT INCA · 5 min →`) ab Navigation, dazu jede Radar-Anfrage mit Status, `x-cache`, Bytes und Dauer. „Alter" = Alter des jüngsten
geratenen RV-Slots (`guessRvRuns`, Verzug 3,3 min). Rohdaten `lab-prod.json`, Auszug `lab-prod.txt`.

### 1.2 Desktop, Produktion (03.11. 20:25–20:30 UTC, 9 Läufe)

| # | Ort | Alter | RV | INCA | rzc | CH-Hochr. | AT 5 min | Komposit | KB | was passiert ist |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | DE | 321 s | **11,7** | 15,7 | 12,3 | 18,4 | 15,7 | 18,4 | 955 | `f000`, `g060`, `g105` des RV-Slots **403** (`MISS`, je 1,4–1,6 s), dann raw; `inca-5m` `g020/g050/g060`, `rzc-nc` `g015/g120/u025/u060` ebenso 403 |
| 1 | AT | 353 s | 14,9 | **7,8** | 11,2 | 13,9 | 10,4 | 14,9 | 1 130 | Frühstart `rv/meta.json` + `g000.png` **887 → 8 308 ms** (hängend, unbeaufsichtigt); `inca-5m/meta.json` 2,6 s ohne Kopfzeilen ⇒ raw; dieselben 403-Dateien wie #0, jetzt `HIT` (festgehalten) |
| 2 | CH | 383 s | 9,8 | 8,5 | **2,3** | 4,7 | 8,5 | 9,8 | 953 | 403 jetzt in 50–100 ms (Edge); Nachbarn DE + AT (59 Dateien) 5,2 → 8,3 s, Pool wegen Hedge aufgehoben |
| 3 | DE | 414 s | **5,8** | 10,5 | 7,3 | 10,9 | 10,5 | 10,9 | 1 007 | sauber (kein 403, kein Hedge); rzc 2025 über STAC + HDF5 (raw 404, Slot noch nicht gespiegelt) |
| 4 | AT | 445 s | 10,1 | **5,1** | 6,4 | 11,0 | 5,1 | 11,0 | 1 009 | sauber |
| 5 | CH | 476 s | 9,3 | 11,0 | **2,4** | 5,4 | 11,0 | 11,0 | 1 007 | sauber; Nachbarn nacheinander (M10) |
| 6 | DE | 207 s | **5,0** (Tar) | 10,7 | 6,6 | 10,6 | 10,7 | 10,7 | 1 645 | Slot nicht bild-berechtigt ⇒ `composite_rv_…tar` **840 KB** über Netlify, HDF5 off-main |
| 7 | AT | 237 s | 7,5 (Tar) | **4,2** | 5,1 | 7,3 | 4,2 | 7,5 | 1 657 | wie #6 |
| 8 | CH | 268 s | 18,0 | 17,2 | **2,6** | 10,5 | 17,2 | 18,0 | 1 217 | `rzc-nc/2025` `g025/g035/g105/u115` 403 (1,7–2,5 s je); RV-Frames > 2,5 s ohne Kopfzeilen ⇒ raw gewinnt, 9 CDN-Abrufe abgebrochen; `inca-5m` `HIT, HIT` 20 KB in **4,0 s** |

Lesart: Das eigene Radar eines CH-Orts ist in 2,3–2,6 s da (ein Bild, 40 KB, Slot über raw oder Memo). DE und AT brauchen 26 bzw.
35 Dateien eines frischen Slots; ihre Zeit hängt am Verhalten von jsDelivr für genau diese Dateien — in 4 von 9 Läufen lief es
schief (403 festgehalten, hängende Antworten), in den übrigen kostet die Latenz je Anfrage (0,3–0,7 s, Pool 6). Der Tar-Weg (#6, #7)
ist heute mit einem einzigen 840-KB-Abruf **nicht** mehr der langsame Weg von NL (damals 9,6 MB).

### 1.3 Spiegel-Verzug (Commit-Historie `buscosun-data`, 03.11. 19:13–20:29 UTC, 102 Commits)

| Produkt | n | min | p50 | p90 | max | über dem Client-Gate |
|---|---|---|---|---|---|---|
| RV `composite_rv_*.tar` → Push | 16 | 209 s | **234 s** | 321 s | 484 s | **3 von 16 über 270 s** (277, 321, 484) |
| rzc → Push | 15 | 46 s | 94 s | 160 s | 242 s | 1 von 15 über 240 s |
| KONRAD → Push | 15 | 304 s | 320 s | 368 s | 513 s | 2 von 15 über 330 s |

Der Spiegel verarbeitet RV, KONRAD, rzc, INCA, `hd250` und die NC-Ableitungen nacheinander (RV-Derive 3,8–5,3 s, Push 5–13 s je
Produkt, `status.json`); ein Job-Neustart (`startedAt` 20:00:40) schob die Slots 19:55/20:00 um 2,5 min. Das RV-Bild-Gate von 270 s
(RD3: „Tar-Gate 240 s + Derive mit Reserve") stammt aus einer Zeit, in der der Spiegel 11 s nach der DWD-Ablage pushte (RD2 §10.3);
heute liegt der Median bei 234 s — 36 s Reserve, p90 darüber.

### 1.4 Sonde: wann ist ein frischer Slot am CDN und auf raw lesbar? (`cdn-probe.mjs`, 20:25–20:41 UTC, Abtastung 5 s)

Die Sonde fragt wie der Client: das CDN erst ab dem jeweiligen Gate (RV 270 s, rzc 240 s, rzc-nc 270 s), raw früher (RV ab 150 s,
rzc ab 60 s) — nie eine CDN-Anfrage vor dem Gate (die hielte ein 404 am Edge fest). Rohdaten `probe1.json`, Protokoll `probe1.txt`.

| Slot | raw: erste 200 | CDN: erste 200 | CDN am Gate |
|---|---|---|---|
| rv 20:25 | 277 s | **361 s** | 404 bei 271 s |
| rv 20:30 | 280 s | **342 s** | 404 bei 274 s |
| rv 20:35 | 279 s | **304 s** | 404 bei 273 s |
| rzc 20:25 / 20:30 / 20:35 | 127 / 122 / 63 s | 240 / 245 / 242 s | 200 (erste Anfrage nach dem Gate) |
| rzc-nc 20:25 / 20:30 / 20:35 | 127 / 122 / 63 s | 271 / 274 / 273 s | 200 (erste Anfrage nach dem Gate) |

- **RV: am Client-Gate (270 s) antwortet jsDelivr in 3 von 3 Fällen 404** (`MISS, MISS` — nicht festgehalten, einfach noch nicht
  da) und hat den Slot erst **31–90 s später**; raw.githubusercontent hat ihn ab 277–280 s. Ursache: jsDelivr löst `@main` nach
  einem Push verzögert auf den neuen Commit auf (das Daten-Repo bekommt 1,3 Pushes je Minute). rzc und rzc-nc werden 2–3 min
  früher gepusht — bis zu ihrem Gate hat das CDN aufgeholt.
- Eine CDN-Antwort brauchte 8,8 s (`rzc/20261103T2030`, 20:34:13) — der Hänger, gegen den die Fortschrittsfrist steht.
- raw antwortete in 230–630 ms, nie 403, nie hängend (34 Anfragen).
- Folge für den Client (ND-7): ein RV-Slot jünger als 6 min wird raw zuerst gelesen (CDN = Ausweichweg), auch vom Frühstart.
  Ohne das zahlt jeder Besucher im ersten Drittel jedes Slot-Lebens 26 × (CDN-404 + raw) — gemessen in Lauf #1/#8 — und
  riskiert ein festgehaltenes 404 für die Nachfolgenden.

### 1.5 Mobil-4G (390 × 844, 9 Mbit/s, 150 ms, CPU × 4, Produktion, 20:33–20:35 UTC, 3 Läufe)

| # | Ort | Alter | RV | INCA | rzc | CH-Hochr. | AT 5 min | Komposit |
|---|---|---|---|---|---|---|---|---|
| 0 | DE | 483 s | **13,9** | 17,2 | 14,5 | 18,3 | 17,2 | 18,3 |
| 1 | AT | 225 s | 9,2 (Tar) | **6,2** | 6,9 | 12,0 | 6,2 | 12,0 |
| 2 | CH | 266 s | 9,0 (Tar, CDN) | 12,0 | **3,2** | 6,8 | 12,0 | 12,0 |

Nur Orientierung (n = 1 je Ort, parallel lief ein `vite build` auf derselben Maschine): das Muster ist dasselbe wie am Desktop,
die Zeit bis zum ganzen Komposit 12–18 s. Lokaler Dev-Server (`localhost:5173`, DE, 456 s): alle drei Quellen da, kein „⚠ Fehler"
— der Status aus früheren Headless-Mobil-Läufen (V-ND-1) war in diesem Lauf nicht reproduzierbar.

## §2 Ursache im Code

1. **Ausweichfrist ab dem Lesen, nicht ab dem Start.** `fetchImgRes(url, signal, priority, started)` (`radarImg.ts`) startet den
   Hedge-Timer (`RADAR_RAW_HEDGE_MS` = 2 500 ms) beim Aufruf. Für eine vorgestartete Antwort (`warmRvTar`, Router) ist der Abruf da
   schon bis zu mehrere Sekunden alt (AT/CH-Ort: DE lädt nach dem eigenen Radar, M10). `takeWarmRvTar` kennt die Startzeit
   (`warm.at`), reicht sie aber nicht weiter.
2. **Jede Datei lernt für sich.** Ein 403 oder ein Hänger am CDN für `g060.png` sagt nichts über `g065.png` — der Leser fragt sie
   trotzdem zuerst am CDN. Ein frischer Slot, den jsDelivr gerade schlecht liefert, kostet so je betroffener Datei 1,5 s (403) bzw.
   2,5 s (Hedge), hintereinander im Pool. Die Pool-Aufhebung nach dem ersten Hedge (M8) hilft nur gegen das Warten, nicht gegen die
   Umwege. Der Punkt-Leser (`fallbackStore`) hat dasselbe Muster, er lädt aber wenige, große Dateien.
3. **Pool 6 für alle Leitungen.** `RADAR_IMG_CONCURRENCY` = 6 (D-PF-14) wurde gegen den falschen Hedge auf Mobil-4G mit 25 × 200-KB-
   Dual-Frames gesetzt. Heute: 7–30 KB je Datei, 0,3–0,7 s Latenz je CDN-Antwort ⇒ 35 INCA-Dateien in 6er-Runden ≈ 3,5–4,7 s auf
   einer schnellen Leitung (Lauf #3: INCA 5,8 → 10,5 s nach RV). V-PF-5 hatte genau das benannt.
4. **`/metadata` seriell.** `loadIncaFromImg` holt zuerst die Referenzzeit von GeoSphere (gemessen 1,4 s TTFB), dann das Produkt. Bei
   DE/CH-Orten startet das erst, wenn das eigene Radar fertig ist. Die Nachbar-Metas (`rzc/meta.json`, `rzc-nc`) ebenso.
5. **Sitzungs-Latch ohne Ablauf.** Zwei harte CDN-Fehler (`RADAR_CDN_FAIL_LATCH`) schalten alle Bild-Wege bis zum Neuladen ab:
   DE auf den Tar, AT auf NetCDF + HDF5-Parse, CH auf STAC + HDF5 — eine Wetterkarte, die Stunden offen bleibt, erholt sich nie (V-NL-1).
   Eine Frist (8 s ohne Fortschritt) zählt dabei wie ein Netzfehler.
6. **Stiller Ausfall eines Landesradars.** `setCompositeStatus` listet, was da ist; fällt z. B. rzc aus, während DE und AT laden,
   zeigt die Statuszeile „DACH-Komposit · DE RADOLAN · AT …" ohne ein Wort zur Schweiz — der Fehlertext wird nur gesetzt, wenn
   noch gar keine Quelle da ist (`loadRzc`/`loadRv`/`loadInca` `catch`). Ehrlichkeit ist Produktprinzip; der Nutzer sieht „leer"
   und weiß nicht, ob es trocken ist.
7. **Gate gegen Verzug (Spiegel, nicht Client).** `RV_IMG_GATE_MS` = 270 s gegen einen Push-Median von 234 s und p90 von 321 s
   (§1.3): in ≈ 19 % der Slots bekommt der erste Besucher ein 404, das jsDelivr ≈ 66 s festhält; der Ausweichweg raw trägt dann
   den Slot für alle (V-AW-25), 26 Dateien mit je einem 404-Umweg.
8. **`@main` hinkt dem Push nach (§1.4).** Auch ein pünktlich gepushter RV-Slot ist am Gate am CDN nicht da: jsDelivr löst den
   Zweig 31–90 s nach dem Push auf den neuen Commit auf. Der Client fragt den Bild-Slot trotzdem zuerst am CDN (`rvImgDir`,
   `warmRvTar`) — 26 × 404 + raw, in jedem Slot, für jeden Besucher der ersten ≈ 90 s. Für rzc kennt `loadRzcMirrorSlot` das
   Muster schon („frischer Slot über raw", RL), ebenso `slotDir` für die NC-Produkte; der RV-Leser nicht.

## §3 Plan (Reihenfolge = Nutzen je Risiko; alles Rule 2, Datenwerte byte-gleich — dieselben Dateien, andere Reihenfolge der Wege)

| Nr. | Maßnahme | Ursache | Risiko |
|---|---|---|---|
| ND-1 | `fetchImgRes` bekommt die Startzeit der vorgestarteten Antwort (`takeWarmRvTar` liefert `at`); der Hedge-Timer rechnet ab dort — eine Antwort, die beim Lesen schon ≥ 2,5 s alt ist, startet den Ausweichweg sofort | 1 | gering: ändert nur, wann raw startet |
| ND-2 | **Herkunft je Slot-Verzeichnis merken** (`radarImg.ts`, `preferRaw(dir)`): hat das CDN für eine Datei des Verzeichnisses gehangen (Hedge gefeuert), 403/404 geantwortet oder einen Netzfehler gehabt, holen die übrigen Dateien desselben Verzeichnisses **raw zuerst**, das CDN wird ihr Ausweichweg (derselbe Hedge, gespiegelt). Verzeichnis = Slot; der nächste Slot beginnt wieder am CDN. Ein 404 auf BEIDEN Wegen bleibt „nicht da" | 2, 7 | gering: raw war schon der Weg für diese Dateien, nur früher; mehr raw-Last nur in Slots, in denen das CDN schon versagt hat |
| ND-3 | Pool je Leitung: `RADAR_IMG_CONCURRENCY` 6 bleibt für `saveData`, `effectiveType` ≠ `4g` oder Viewport ≤ 767 px; sonst **12** (`radarImgPoolSize()`), `set`, Lab-Zahlen Desktop/4G | 3 | gering: der Hedge-Fehlalarm (D-PF-14) betraf 25 parallele 200-KB-Frames auf 4G — dort bleibt 6 |
| ND-4 | Nachbar-Vorlauf: beim Start von `loadNowSource` die kleinen Vorabrufe der Nachbarn anstoßen — GeoSphere-`/metadata` (`warmIncaMeta`, eigener Fehlerkreis), der Leser nimmt eine laufende Antwort ≤ 30 s entgegen | 4 | gering: ein 1,6-KB-Abruf an einen anderen Host, keine Bytes auf der CDN-Leitung |
| ND-5 | Latch mit Ablauf: `radarCdnUsable()` ist nach `RADAR_CDN_FAIL_LATCH` harten Fehlern für `RADAR_CDN_LATCH_MS` = 5 min falsch, danach zählt die Sitzung neu (V-NL-1) | 5 | gering: ein wirklich gesperrtes CDN (Firmennetz) kostet alle 5 min einen Versuch mit 8-s-Frist je Weg — pro Slot ein Abruf, und die 5-min-Auffrischung läuft ohnehin |
| ND-6 | Statuszeile nennt ein ausgefallenes Landesradar: `failedRef` je Land, `setCompositeStatus` hängt „· CH: MeteoSchweiz-Radar nicht erreichbar" an; der Fehlertext bleibt, wie bisher, wenn **keine** Quelle da ist | 6 | keine Datenänderung, ein Text |
| ND-7 | **Junger RV-Slot raw zuerst:** `rvImgRawFirst(ts)` = Bild-berechtigt und jünger als `RV_IMG_CDN_READY_MS` = 360 s (§1.4: CDN hat den Slot ab 304–361 s) ⇒ der Leser markiert das Slot-Verzeichnis raw-first (ND-2-Mechanik), der Frühstart `warmRvTar` wärmt `meta.json`/`g000`/`f000` auf raw (Schlüssel = raw-URL, der Leser nimmt sie dort entgegen). Ältere Slots wie bisher CDN zuerst; `RADAR_RAW_BASE`/`radarRawUrl`/`radarRawFlagFrom` ziehen dafür in den Start-Chunk (`radolanRuns.ts`, Re-Export aus `radarImg.ts`) | 8 | gering: dieselben Dateien, derselbe Commit; raw trägt je Slot ≈ 90 s lang alle Erstbesucher (heute über den 404-Umweg ohnehin), danach wieder das CDN; Schalter `?radarraw=0` schaltet alles ab |

**Jans Gate (Daten-Repo/Spiegel, hier nur benannt):**

- **E-ND-1 Warm-up im Spiegel** (= E-NL-2, offen seit 01.10.): nach dem Push jede Datei des Slots einmal über `@main` anfragen,
  sobald jsDelivr den neuen Commit auflöst (sonst hält der Edge 404). Nimmt dem ersten Besucher den kalten Abruf und die 403-Falle.
- **E-ND-2 Ein Bündel je Slot:** `rv/<ts>/frames.bin` (Vorhersage-Frames 005…120 als eine Datei mit Index, `g000` bleibt einzeln für
  das Frühbild), ebenso `inca-5m` und `rzc-nc`. Aus 26/35/72 Anfragen werden 2/2/2; die Einzeldateien bleiben (Producer, alte
  Clients). Entfernt Ursache 4 ganz. Producer in `scripts/radar-mirror/radar-derive.mjs`, Vertrag in `radarImg.ts`, Verifier.
- **E-ND-3 RV-Bild-Gate nachziehen:** 270 s gegen Median 234 s / p90 321 s — entweder der Spiegel wird schneller (parallele
  Produkte, Push gebündelt) oder das Gate steigt (330 s; dann 60 s länger der Tar-Weg, heute 840 KB) — Jans Abwägung Frische gegen
  Treffer. ND-2 mildert die Folge (raw-first für den Slot), beseitigt sie nicht.

**Nicht geändert:** E-NL-1 (jüngster Slot zuerst, kein „voriger Slot als Bilder"), der 404-Vertrag (404 auf beiden Wegen = nicht
da), die 8-s-Fortschrittsfrist, die Reihenfolge eigenes Radar → Nachbarn (M10), die Dual-Frames.

**Prüfung:** `verify:radar-fallback` (neue Fälle: Frühstart-Alter, raw-first je Verzeichnis, CDN als Ausweichweg, 404 beidseitig,
Latch-Ablauf), `verify:radar-runs`, `verify:radar-repack`, `verify:layer-erstbild`, `verify:radar-nc`, typecheck, Build, Budget;
Lab vorher/nachher gegen das echte CDN (alter gegen neuer `dist`, abwechselnd, Desktop und Mobil-4G), Datenwerte vorher/nachher
(`scripts/perf-data-identity.mjs`-Muster: Hash der Frames).

## §4 Entscheidungen und Befunde

- **E-ND-1 … E-ND-3:** Jans Gates, s. §3 und `MANUELLE-SCHRITTE.md` §86.
- **V-ND-1** „⚠ Fehler" am Niederschlag-Sublabel in früheren Headless-Mobil-Läufen (localhost) war am 03.11. nicht reproduzierbar
  (§1.5). Mehrwert: wissen, ob ein echter Pfad dahintersteht. Skizze: Headless-Lauf mit offenem Layer-Screen und 60 s Fenster,
  Konsole mitschneiden.
- **V-ND-2** `verify:radar-runs` „das ersetzte Listing ist > 100 KB" ist rot (79 946 B): das DWD-Verzeichnis ist seit dem Ende des
  Altformats (20.10.) kleiner. Auch an HEAD rot. Skizze: Schwelle auf die neue Zahl, Notiz im Audit BW-5.
- **V-ND-3** `verify:layer-erstbild` „beide wärmen den Worker VOR dem fetch" ist rot, auch an HEAD (`C:\dev\buscosun-nd-base`,
  37/38): seit RL steht `_rzcH5Last` zwischen `warmHdf5Worker()` und `await fetch(href` (Regex-Abstand 200 Zeichen). Skizze:
  Abstand im Verifier auf 400.
- **V-ND-4** GeoSphere hing in 2 von 18 Läufen am 03.11. (`/metadata` 8 s bis zur Frist, einmal 16 s): bei einem AT-Ort wartet das
  ganze Komposit (eigenes Radar zuerst, M10) — Desktop-Lauf #3: alles erst nach 25 s. Der geratene Bild-Weg (28-min-Gate, Slot
  sicher gespiegelt) läuft laut RD3c ausdrücklich NACH dem Direktweg (Frische). Mehrwert: ein hängendes GeoSphere kostet dann
  3 s statt 8–25 s. Skizze: nach 3 s ohne `/metadata`-Antwort den geratenen Spiegel-Slot als Hedge laden, `/metadata` weiterlaufen
  lassen und beim nächsten Refresh nachziehen — Jans Entscheidung (Frische-Regel).
- **V-ND-5** jsDelivr beantwortet einzelne Dateien eines frischen Slots mit 403 und hält das 403 am Edge fest (§1.2: dieselben
  Dateien in drei Läufen; am 01.10. als `f000.png` 403 schon gesehen). Ursache unbekannt (Origin-Fehler beim ersten Abruf?). ND-2
  umgeht es; E-ND-1 (Warm-up nach dem Push) würde es dem Spiegel statt dem Besucher zeigen.
- **V-ND-6** Der DWD-RV-Tar ist seit HDF5-only klein (840–860 KB an einem trockenen Abend; NL maß 9,6 MB im Regen am 01.10.) und
  war mit 5,0 s das schnellste DE-Bild (§1.2 #6). Die Bewertung „Tar = der langsame Weg" aus NL/PF gilt nicht mehr pauschal;
  V-PF-7/E-NL-1 (voriger Slot als Bilder) ist damit erledigt — nicht nötig.
- **V-ND-7** Die A/B-Messung gegen das echte CDN (§5) ist mit n = 1–2 je Paar und wechselndem CDN-Zustand (der erste Lauf wärmt
  den Edge für den zweiten) nicht beweiskräftig für Zehntelsekunden; sie belegt Mechanik (welche Wege laufen), nicht die
  Verteilung. Eingefrorener Datensatz (V-PF-2) bleibt offen.

## §5 Umsetzung und Gate (03.11., uncommitted)

**Geändert.**

| Datei | Änderung |
|---|---|
| `src/sources/radolanRuns.ts` | ND-5 Latch mit Fenster/Ablauf (`RADAR_CDN_LATCH_MS` = 5 min, `noteRadarCdnFailure(nowMs)`, `radarCdnUsable(nowMs)`); ND-1 `takeWarmRv(url)` liefert die Startzeit; ND-7 `RADAR_RAW_BASE`/`radarRawFlagFrom`/`radarRawUrl` hierher (Start-Chunk), `RV_IMG_CDN_READY_MS` = 360 s, `rvImgRawFirst(ts)`, `warmRvTar` wärmt einen jungen Slot auf raw |
| `src/sources/radarImg.ts` | ND-2 `radarRawFirst`/`radarMarkRawFirst` je Slot-Verzeichnis (TTL 10 min, ≤ 64 Verzeichnisse), `fetchImgRes(…, startedAt, startedVia)`: Frist ab Start, Wege tauschen die Rollen bei raw-zuerst, raw-Gewinn markiert das Verzeichnis; ND-3 `RADAR_IMG_CONCURRENCY_WIDE` = 12, `radarImgPoolSize()` (schmal/`saveData`/≠ `4g` ⇒ 6), Diagnose `?radarpool=N`; `_resetRadarRaw` |
| `src/sources/radolan.ts` | `imgRes` nimmt Frühstart samt Startzeit und raw-Schlüssel entgegen; `fetchRvFromImg` markiert einen jungen Slot raw-zuerst; Pool über `radarImgPoolSize()` |
| `src/sources/geosphereIncaGrid.ts` | ND-4 `warmIncaMeta()`/`incaMetaRef()` (Fenster 60 s, Frist des Lesers gilt auch für die warme Antwort), Pool |
| `src/sources/radarNowcast.ts` | Pool über `radarImgPoolSize()` |
| `src/MapView.tsx` | ND-4 `warmIncaMeta('low')` beim Start des Komposits für DE/CH-Orte; ND-6 `radarFailRef`, `noteRadarFail`, Statuszeile „· CH: MeteoSchweiz-Radar nicht erreichbar" |
| `scripts/verify-radar-fallback.mjs` | A14–A17b, B2 (ND-7), B2b (ND-2), B4 angepasst, C1–C3 (Latch, Gate), D1–D3 (INCA-Warm) — **48/48**, 23/25 vor der Anpassung der Erwartungen gesehen |
| `scripts/verify-routing.mjs`, `scripts/verify-radar-repack.mjs` | Frühstart-Erwartung (jung ⇒ raw, älter ⇒ CDN), A27 auf die neue Stelle des `/metadata`-Abrufs |

Nicht geändert: E-NL-1 (jüngster Slot zuerst), die Gates selbst, die 8-s-Fortschrittsfrist, M10 (eigenes Radar zuerst), Dual-Frames,
der Spiegel (E-ND-1…3 sind Jans Gates).

**Belege.**

- `verify:radar-fallback` 48/48 · `verify:radar-repack` 51/51 (2 ⊘) · `verify:routing` 277/277 · `verify:radar-nc` 39/39 ·
  typecheck 0 · Build grün · `npm run budget` grün (eagerJs 115,0 / 115 — der Umzug von `radarRawUrl` in den Start-Chunk füllt die
  Grenze genau; totalJs 1 973,4 / 1 975). Bekannt rot, auch an HEAD: `verify:radar-runs` 54/55 (V-ND-2), `verify:layer-erstbild`
  (V-ND-3).
- **A/B gegen das echte CDN** (`ab-desktop.txt`, `ab-4g.txt`, 20:58–21:08 UTC): zwei `vite preview` (Basis = sauberer HEAD-Worktree
  `C:\dev\buscosun-nd-base` auf :5220, neu :5221, beide mit Proxy), Läufe abwechselnd Basis/neu je Ort, kalter Kontext. Zeit bis
  zum eigenen Radar / bis zum ganzen Komposit (s):

| Ort | Alter | Basis Desktop | **neu Desktop** | Basis 4G × 4 | **neu 4G × 4** |
|---|---|---|---|---|---|
| DE München (Tar-Fenster, 218/249 s) | r1 | 5,7 / 14,3 | **2,6 / 6,2** | 15,5 / > 40 (INCA fehlte) | **9,5 / 29,9** (GeoSphere 16 s) |
| AT Wien | r1 | 3,8 / 11,5 | — / 28,1 (**GeoSphere `/metadata` 8 s bis zur Frist**, V-ND-4) | 8,2 / 16,8 | 17,4 / 24,7 |
| CH Zürich | r1 | 1,4 / 6,9 | 2,8 / 13,2 (CDN je Antwort 2–4 × langsamer als 30 s davor) | 4,5 / 13,1 | 4,7 / 11,5 |
| DE München | r2 | 6,9 / 12,8 | **6,2 / 9,7** | — | — |
| AT Wien | r2 | 4,1 / 9,9 | 4,0 / 10,2 | — | — |
| CH Zürich (Tar-Fenster) | r2 | 2,1 / 9,6 | 2,6 / 9,1 | — | — |

  Lesart (V-ND-7): n = 1 je Zelle, GeoSphere hing in den „neu"-Läufen zweimal, und der erste Lauf eines Paares wärmt den Edge für
  den zweiten — die Tabelle belegt die Mechanik (junger Slot: 0 CDN-Abrufe für den Slot, Lauf #1 Desktop `rzc-nc raw 26`; nach einem
  403 raw-zuerst für den Rest, Lauf #1 4G `rv raw 27`), nicht eine Verteilung.
- **Pool 6 gegen 12 isoliert** (`pool-desktop.txt`, neuer Build, `?radarpool=`, abwechselnd, 21:13–21:19 UTC, Komposit in s):
  DE 16,7 → **9,8**, CH 11,8 → 17,7 (Lauf mit 3 Hedge-Abbrüchen), DE 10,7 → **8,6**, CH 12,1 → **10,6**, DE 10,4 → **9,6**, CH 9,3 → **7,6**
  — 5 von 6 Paaren für 12; die mittlere CDN-Latenz je Antwort steigt mit 12 nicht systematisch (268/139/401/212/55 gegen
  492/203/312/259/75/297 ms). ND-3 bleibt (`set`, Lab).
- **Datenwerte:** dieselben Dateien desselben Commits, nur die Reihenfolge der Wege; B2/B2b/B4 lesen 25 Frames aus denselben PNG-Bytes
  über raw wie über das CDN (Verifier), `verify:radar-nc` 39/39 unverändert. Ein Browser-Hash-Vergleich (`perf-data-identity.mjs`)
  wurde nicht gefahren.

**Fünf Fragen.** (1) Funktionserhalt: alle Wege bleiben (CDN, raw, Tar, Netlify, STAC, NetCDF), Schalter `?radarraw=0` stellt den
Stand vor ND her (A16f, A9); 404 beidseitig bleibt „nicht da" (A16c); Latch schließt weiterhin nach zwei Fehlern (C1). (2) Desktop
pixelgleich: keine UI-Änderung außer dem Text eines ausgefallenen Radars in der Statuszeile (nur im Fehlerfall). (3) Touch-Ziele:
unverändert. (4) Konsole: in allen 36 Lab-Läufen nur die bekannte Sprite-Warnung `circle-11`, keine Fehler. (5) Long Tasks: keine
neuen Rechenpfade (nur Netz-Reihenfolge); nicht gemessen. Offen: Real-Device, Messung über einen Regentag (Slot-Größe 2–5 MB),
GeoSphere-Hänger (V-ND-4), Mobil-4G mit n ≥ 5.
