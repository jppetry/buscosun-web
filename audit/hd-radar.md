# Phase HDR — HD-Niederschlagsradar in der DACH-Karte

> Stand 04.11.2026, Schritt 1 (Diagnose) abgeschlossen. Kein Code geändert. Entscheidungen `E-HDR-n` (Jan), Befunde `V-HDR-n`.
> Belege: Live-Abrufe vom 04.11. 09:00–09:15 UTC (DWD, OPERA, MeteoSchweiz, Spiegel-`status.json`), Dateien im Scratchpad der Session; Code-Kartierung mit Zeilenangaben in §4.

## 1. Ergebnis in Kürze

1. **Der DE-Radarpfad ist nicht gebrochen.** Die DWD-Umstellung (RV/RS/WN als `.tar` mit 25 ODIM-HDF5-Dateien, ≈ 20.–22.10.) ist seit EX-3 (30.09.) im Spiegel und im Client abgefangen; der Spiegel leitete heute Slot 09:10 UTC in 7,4 s ab, hd250 17/17 Standorte. Die Ausnahme „sofort und ohne Schalter reparieren" greift nicht.
2. **Der größte Teil des Phasenplans ist schon gebaut und live** (HD 08.10., R250 09.10., RA 13.10., NC 28.10.): native 1-km-Ebenen je Land mit Besitz-Maske, Catmull-Rom auf Werten, Log-8-Bit-Ebene bis 200 mm/h, Morph, 25 Bilder bis +2 h in allen drei Ländern, 250 m in DE (Standortprodukte px250, RV-verankert) als Kacheln im Daten-Repo. Die Messlatte „nicht pixeliger als heute" ist der heutige HD-Pfad selbst.
3. **Drei Annahmen des Plans sind widerlegt oder blockiert:** OPERA CIRRUS enthält **kein österreichisches Radar** (V-HDR-1); **Cloudflare R2 existiert nicht** (CLAUDE.md, `architecture.md`; keine Secrets, kein Binding) — der Plan sagt dafür „stop and report" (E-HDR-1); Shader-Änderungen sind STOPP-Grenze (E-HDR-5).
4. **Ein echter, abgegrenzter Gewinn bleibt:** das neue DWD-Komposit **HX** (250 m, 4800 × 4400) liegt **exakt auf dem Gitter DE1200 ÷ 4**, das buscosun heute aus 17 Standortdateien selbst zusammensetzt (V-HDR-2). HX kann den Eigenbau ersetzen: eine Datei 0,15–1,6 MB statt 17 Dateien ≈ 6,5 MB je Slot, DWD-eigene Kompositierung, RV-Anker bleibt (E-HDR-2).

Deshalb: **Stopp nach Schritt 1.** Die Schritte 2–7 wie geschrieben würden Vorhandenes doppelt bauen, eine nicht vorhandene Ablage voraussetzen und zwei STOPP-Grenzen berühren. Vorschlag für den reduzierten Umfang in §8.

## 2. Live-Befunde 04.11.2026

| Quelle | Befund (gemessen) |
|---|---|
| `composite/rv/` | `composite_rv_YYYYMMDD_HHMM.tar` + `composite_rv_LATEST.tar`, 829–850 KB (trocken); Inhalt 25 × `…_000-hd5 … _120-hd5`, je 31–34 KB, HDF5-Magic `89 48 44 46`; ODIM_H5/V2_3, `ACRR` uint32, gain 0,001 mm, 1100 × 1200, polar-stereografisch (lat_ts 60, lon_0 10). Slot 09:00 lag um 09:03:13 UTC (≈ 3 min). |
| `composite/wn/` | `composite_wn_YYYYMMDD_HHMM.tar`, 1,03–1,06 MB; LATEST heißt `composite_wn__LATEST.tar` (zwei Unterstriche). Nicht im Code verwendet. |
| `composite/rs/` | `.tar`, 1,06–1,1 MB. Nicht verwendet. |
| `composite/hx/` | **Einzeldateien** `composite_hx_YYYYMMDD_HHMM-hd5`, 576 Dateien (48 h), **150 KB – 1,6 MB** (nicht 1–10 MB); ODIM, `DBZH` uint16 gzip, gain 0,00293, offset −64, nodata 65535, `camethod MAXIMUM`, 17 Knoten (alle DWD-Standorte), 4800 × 4400 @ 250 m. Slot 09:00 um 09:01:35 UTC (≈ 1,5 min). |
| HX ↔ RV-Gitter | Eckpunkte UL/UR/LL/LR **identisch**; `x_0`/`y_0` unterscheiden sich um 375 m = halbe 1-km-Zelle minus halbe 250-m-Zelle ⇒ HX-Zellen 4i…4i+3 decken RV-Zelle i exakt (V-HDR-2). |
| `radvor/re`, `radvor/rq`, `composite/hg`, `composite/pg` | leer (nur `../`). |
| `DE1200_RV_LATEST.tar.bz2` | **404** — altes RADOLAN-bz2 ist weg. |
| OPERA CIRRUS | Bucket `openradar-24h` bei CloudFerro (`https://s3.waw3-1.cloudferro.com/openradar-24h/`), **nicht** AWS; anonymes Listing geht; Pfad `YYYY/MM/DD/OPERA/COMP/OPERA@<T>@0@DBZH.h5` alle 5 min (≈ 1,9 MB h5, ≈ 3 MB COG), `ACRR`/`RATE` nur alle 15 min. ODIM 2.4, float64 gzip, 3800 × 4400 @ 1 km, **LAEA lat_0 55 / lon_0 10** (nicht ETRS89-LAEA 52/10). Lizenz CC BY 4.0 im Header. GET mit `Origin` liefert **keinen** `Access-Control-Allow-Origin` ⇒ nur über Spiegel. **Knotenliste: 24 Länderkürzel, `at…` fehlt vollständig** (V-HDR-1). |
| MeteoSchweiz | STAC `ch.meteoschweiz.ogd-radar-precip`, Tages-Item `<YYYYMMDD>-ch`, Assets `rzc…h5`/`cpc…h5`, 14-Tage-Fenster; so schon im Code (`meteoSwissRadar.ts:29`). Der im Plan genannte Sammlungsname `ogd-radar-rzc` existiert nicht (404). |
| GeoSphere | Client und Spiegel lesen `nowcast-v1-15min-1km` (`geosphereIncaGrid.ts:33`, Spiegel 113). Ende v1 „Ende Dezember" laut Plan: **nicht am Server geprüft** (Terminregister `sourceMatrix.ts` kennt nur `nwp-v1` 04.11.). Offen: V-HDR-11. |
| Spiegel | `status.json` job 41791065281: `derive:true, hd250:true, nc:true`; RV 09:10 Tar 819 KB, derive 7,4 s, hd250 0,9 s, 11 Kacheln. |

## 3. Forschungsfakten des Plans gegen den Befund

| Behauptung | Befund | Folge |
|---|---|---|
| RV/RS/WN als tar mit 25 HDF5 | bestätigt | schon abgefangen (EX-3) |
| „Unser Browserpfad (bzip2.wasm, bz2Worker, radolanWorker) wahrscheinlich betroffen" | nein: Hauptpfad sind PNGs aus dem Spiegel, Rückfall ist der HDF5-Tar (`rvFormatOrder() = ['hdf5','radolan']`); bz2 nur noch für das tote RADOLAN-Format und `fetchRyLatest` (unverdrahtet) | E-HDR-7 |
| RADVOR RE/RQ, HG, PG leer | bestätigt | nichts zu tun, nie verwendet |
| HX 250 m, 4800 × 4400, 5 min, 1–10 MB | Gitter bestätigt; **Größe 0,15–1,6 MB** | Kacheln passen in das Daten-Repo wie heute (rv-past wet ≈ 2,4 MB) |
| WN = max von 16 HX-Pixeln | nicht gemessen (WN ungenutzt) | — |
| RZC 1 km, 5 min, LV95, mm/h, STAC ohne Schlüssel | bestätigt, so im Code | — |
| OPERA CIRRUS 1 km, 5 min, LAEA, HDF5/COG, CC BY 4.0, S3 anonym, kein CORS | bestätigt — **aber ohne AT-Radare**, Gitter LAEA 55/10 | AT-Lücke bleibt INCA (E-HDR-3) |
| AT: kein offenes Rohradar; INCA 1 km/15 min | bestätigt; buscosun verfeinert INCA auf 5 min (`inca-5m`) | — |
| jsDelivr 20 MB/150 MB, GitHub 100 MB/1 GB | nicht neu geprüft; Repo-Wachstum wird heute durch den 3-h-Force-Push mit Root-Commit begrenzt (`publish-repack.mjs:325`) | — |
| Actions-Cron min 5 min, verspätet | der Spiegel läuft **nicht** per Cron, sondern als Dauerjob (345 min, Selbst-Dispatch, Watchdog `7 * * * *`) | Laufzeit „je Zyklus < 5 min" ist heute: derive 7,4 s + Push |

## 4. Ist-Stand der Radar-Kette (Kartierung)

**Producer** — `scripts/radar-mirror/radar-mirror.mjs` + `workflow-radar.yml` (Daten-Repo `.github/workflows/radar.yml`): Dauerjob, Poll 10 s, lokaler Store, Push ohne Force (`publish()` 364–395), KEEP 12 Roh-Tars; reines Node 22 + jsfive 0.4 + eigener PNG-Encoder (`scripts/lib/png.mjs`), **kein h5py/GDAL**; Derive nutzt die Client-Decoder über `register-ts.mjs`. Schalter `RADAR_IMG_DUAL`, `RADAR_HD250`, `RADAR_LOG_NATIVE`, `RADAR_CLUTTER`, `RADAR_NC`. Produkte unter `radar/img/v1/`: `rv/<Slot>/f|g|m<lead>.png + clutter.png + meta.json` (12 Slots), `rv-past/<Slot>/f000,g000 + h<ty><tx>.png + hd250.json` (24, Altersregel), `inca/` (12), `rzc/` (24), `rzc-nc/` (12), `inca-5m/` (12), `konrad3d/`, `lightning-*`. 250-m-Quelle heute: **17 px250-Standortdateien** (`dwdPx250.ts`, ≈ 6,5 MB je Slot), nächster Standort je Zelle, Z = 256·R^1,42 nur als Verhältnis, Blockmittel = RV (Methode B, `radar-250m.md`). **Kein Manifest/Index**: der Client rechnet Slots aus der Uhr mit Gates (RV 270 s, Raw-first < 360 s) und liest `meta.json`/`hd250.json`; `status.json` ist Telemetrie (V-HDR-9).

**Kodierung** — v1-Byte linear 0,06…20 mm/h (`RainLayer.ts:586`); Dual-`g`: Kanal 2 = Log-Byte 0,06…200 mm/h in 254 Stufen (`:596–620`); 250-m-Kacheln 1-Kanal-Log-Byte. Alles PNG verlustfrei.

**Client** — DE `radolan.ts` (`fetchRvTar` 614 → `fetchRvFromImg` 361, Rückfall HDF5-Tar via `hdf5OffMain`/`rvHdf5.ts`, letzter Rückfall RADOLAN-bz2); AT `geosphereIncaGrid.ts` (`inca-5m` → `inca` → NetCDF direkt); CH `meteoSwissRadar.ts` (Spiegel → STAC + HDF5); Nowcast `radarNowcast.ts`; 250 m `radarHd250Read.ts`/`scalar/radarHd250Store.ts`. CDN-Helfer `radarImg.ts:472` (jsDelivr, Hedge raw 2,5 s, ND-2 raw-first je Slot, Pool 6/12). ND-Linie (03.11.) in denselben Dateien **uncommitted**.

**Rendering** — ausschließlich MapLibre-Custom-Layer `scalar/RainLayer.ts` (WebGL, Warp-Mesh, Filter B-Spline/Catmull/Bilinear/Nearest, `u_mask`, Morph `u_flow`, Randregel). Erzeugt in `MapView.tsx:1607–1634`: Komposit `precip-rain-layer` (nur `?hd=0`, 600 × 512 ≈ 2 km), HD-Ebenen `precip-rain-hd-de/at/ch` + `-ch-unknown`, 16 hd250-Kacheln. Zonenmaske = Länder (E-NC-7). `syncHd` 3751, `syncHd250` 3809–3901 (ab Zoom 9, nur Analysen, DE-Ebene verborgen sobald alle sichtbaren Kacheln da sind). Farbrampe `precipRainRampLog` (`:635–654`), Anzeigeschwelle `RADAR_DISPLAY_MIN_MMH = 0,06` (`radarHd.ts:166`). **Das Filtern geschieht schon auf Werten, die Rampe danach** — der Plan-Schritt 5 beschreibt den Ist-Zustand.

**/regenradar** — `MapView` mit `profile="radar"` (`nowcast/NowcastRadarMap.tsx:720`); `src/radar/RadarMap.tsx` nur hinter `?rr=legacy` oder bei Chunk-Fehler.

**Schalter** — `?hd` (0/1/catmull/bilinear/nearest/bspline, Default an, `radarHd.ts:112`), `?hdv2`, `?hdmorph`, `?hdedge`, `?rmin`, `?chstyle`, `?hd250` (Default aus, `radarHd250.ts:23`, E-RA-1), `?nc`/`?chnc`, `?radarcdn`/`?radarimg`/`?radarraw`/`?radarpool`, `?rvfmt`, `?h5worker`, `?rr=legacy`. **Kein `RADAR_*_LIVE`**; Defaults heißen `RADAR_*_DEFAULT_ON`.

**Texte** — `RADOLAN_RV_ATTRIBUTION`, `GEOSPHERE_INCA_ATTRIBUTION`, `METEOSWISS_RADAR_ATTRIBUTION` sind definiert, aber **nirgends gezeigt** (Attribution-Control im Profil aus, `MapView.tsx:1335`); sichtbar sind `modelCatalog.ts:300–303`, `radarFrames.ts:79–88`, `NowcastDeck.tsx:90/534`, `LayerInfoPanel.tsx:70`, Statuszeile `setCompositeStatus` (`MapView.tsx:2316–2358`: „1-km-Gitter (HD)", „DE 250 m (Standortradare, ab Zoom 9)", „ab 0,06 mm/h"). Legenden (`radarModel.ts:43–49`, `MapView.tsx:5331`, `LayerInfoPanel.tsx:38`) sind **nicht** aus `precipRainRampLog` abgeleitet (V-HDR-6).

**R2/PMTiles/OPERA** — nirgends im Code; OPERA nur als CORS-Sonde `scripts/l0/probe-cors.mjs:158`. `audit/bandbreite.md:418` und `radar-datenrepo.md` §4/§6 führen R2 bzw. Cloudflare Worker als **offene Entscheidung Jans**.

## 5. Phasenplan gegen Ist-Stand, je Schritt

| Schritt | Status |
|---|---|
| 1 Diagnose | erledigt (dieses Dokument) |
| 2 Decode in Actions, bzip2 raus, DE-Nowcast aus 25 Schritten, lautes Scheitern | **schon so**: Browser bekommt PNGs, 25 RV-Schritte seit RD3, Tar-Rückfall nur bei Spiegel-Ausfall; „laut scheitern" (Derive-Timeouts 120/150 s, 404 > 30 min überspringen) vorhanden. Offen nur E-HDR-7 (bz2-Rückfall). h5py/GDAL wären ein Werkzeugwechsel ohne Mehrwert (jsfive + Client-Decoder sind byte-identisch verifiziert, RD3 §14). |
| 3 1-km-Mosaik LAEA, Feathering zwischen Netzen | **anders gelöst und live**: je Land native Ebene mit Besitz-Maske, keine Umprojektion, kein Mischen über Netze (= Regel „innerhalb des Landes das nationale Produkt unverändert"). Feathering 10–20 km in Überlappungen gibt es nicht — die Maske schneidet hart an der Grenze (V-NC-13 offen). OPERA als AT-Füller entfällt (V-HDR-1). Ein LAEA-Mosaik würde ein zweites Resampling einführen und die Byte-Gleichheit zum Originalgitter aufgeben. |
| 4 250 m DE aus HX, PMTiles auf R2, Distanzmaske 30/60 km | **teilweise da**: 250 m aus px250, Kacheln im Daten-Repo (≈ 2,4 MB nass je Slot, 24 Slots), nur Analysen. **Neu möglich:** HX statt px250 (E-HDR-2). **Blockiert:** R2 (E-HDR-1). Distanzmaske: die Audit-Linie R250 nennt die Strahlbreite (1 km ab 57 km) nur im Label, blendet nicht — Teil von E-HDR-2. |
| 5 Rendering: Filter auf Werten, LUT im Shader, Overzoom, GPU-Fenster, Prefetch, Crossfade | **schon so** (Catmull-Rom auf Werten, Rampe danach, Morph statt Crossfade). Änderungen am Shader = STOPP (E-HDR-5). |
| 6 Legende/Quellen | Resolution-Text existiert in der Statuszeile; Attributions-Konstanten ungenutzt (V-HDR-6). OPERA-Nennung entfällt. |
| 7 Messungen, Screenshots | nur sinnvoll für den reduzierten Umfang (§8). |

## 6. Entscheidungen für Jan

- **E-HDR-1 — Cloudflare R2 / PMTiles.** Nicht vorhanden; CLAUDE.md und `architecture.md` führen „kein R2/PMTiles" als Ist-Stand. Vorschlag: **nicht einführen.** Die 250-m-Kacheln passen heute in das Daten-Repo (≈ 2,4 MB nass je Slot × 24 Slots ≈ 60 MB Fenster, Root-Commit alle 3 h). Wenn Jan R2 will: eigene Phase (Konto, Secret, Publisher, Purge-Regeln, CORS) — außerhalb HDR.
- **E-HDR-2 — HX als 250-m-Quelle statt 17 px250-Standortdateien.** Gleiches Gitter (V-HDR-2), eine Datei statt 17, DWD-Kompositierung mit `MAXIMUM`, Last je Slot ≈ 6,5 MB → ≤ 1,6 MB. Methode bleibt B (HX als Verhältnis, Blockmittel = RV), Ausgabeformat `rv-past/<Slot>/h<ty><tx>.png` + `hd250.json` unverändert ⇒ **kein Client-Umbau**, Schalter im Producer `RADAR_HD250_SRC=hx|px250` (Default `px250`, Rückfall benannt). Abnahme: Byte-Vergleich der Kacheln px250 ↔ HX an drei nassen Slots, Blockmittel-Beweis, Laufzeit. Empfehlung: **ja**, als einzige Bau-Etappe von HDR.
- **E-HDR-3 — Österreich.** OPERA ohne AT-Knoten; AT bleibt INCA 1 km/15 min + `inca-5m`. OPERA nur für Flächen jenseits der DACH-Maske nützlich, die heute ohnehin verdeckt sind (V-NC-13). Empfehlung: **OPERA außerhalb des Umfangs.**
- **E-HDR-4 — Schalter.** `?hd=1`/`RADAR_HD_LIVE` kollidiert mit dem bestehenden `?hd` (HD-1, Default an). Vorschlag: kein neuer Client-Schalter; falls E-HDR-2 kommt, trägt `hd250.json` ein Feld `src: 'hx'|'px250'` und die Statuszeile nennt „Standortradare" bzw. „DWD-HX".
- **E-HDR-5 — Shader.** Keine Änderung (STOPP-Grenze; der Ist-Zustand erfüllt Schritt 5). Wer „pixelig" sieht, sieht `?hd=0` oder die Strahlbreite jenseits 57 km — dafür Beleg per Screenshot erbitten, bevor am Filter gedreht wird.
- **E-HDR-6 — 250 m als Standard in DE?** Widerspricht E-RA-1 („250 m nur auf Wunsch", 13.10.). Der Plan setzt 250 m als Ziel der Karte voraus. Jans Wort; Empfehlung: erst nach E-HDR-2 und einer Real-Device-Messung (V-RA-6 offen) entscheiden.
- **E-HDR-7 — RADOLAN-bz2-Rückfall entfernen.** Das Format ist bei DWD weg (404). Entfernen spart `bz2` aus dem radolan-Chunk (Größe nicht gemessen, kein Build in dieser Session); `iconD2Precip.ts` braucht `bz2` weiter, `bzip2-wasm` bliebe für ICON. Funktionserhalt-Regel ⇒ Jans Freigabe.

## 7. Befunde

- **V-HDR-1** OPERA-CIRRUS-Komposit 04.11. 09:00 UTC: Knotenliste mit 24 Ländern, **null `at…`-Knoten** (Austro Control liefert nicht in das offene Produkt). Jede Planung „AT aus OPERA" ist damit hinfällig.
- **V-HDR-2** HX-Gitter = DE1200 ÷ 4 exakt (gleiche Ecken, Versatz `x_0`/`y_0` 375 m = Halbzellen-Differenz). Der Eigenbau in `dwdPx250.ts`/derive (4400 × 4800) ist bereits dieses Gitter.
- **V-HDR-3** HX-Dateien 150 KB – 1,6 MB (576 Dateien, 48 h), nicht 1–10 MB; uint16 gzip.
- **V-HDR-4** DWD-Latenz: RV-Tar ≈ 3 min nach dem Slot, HX ≈ 1,5 min; WN-LATEST mit doppeltem Unterstrich.
- **V-HDR-5** `DE1200_RV_LATEST.tar.bz2` → 404; der RADOLAN-Zweig im Client ist toter Code mit lebender Abhängigkeit (`radolan.ts:26` statischer Import `decompress` ⇒ `bz2` im Chunk).
- **V-HDR-6** Drei Attributions-Konstanten ungenutzt; drei Legenden nicht aus der Rampe abgeleitet (Regenradar `RADAR_BANDS`, Wetterkarte „Regen 0,1…>10", LayerInfoPanel-Gradient). Für Schritt 6 wäre eine Quelle der Wahrheit nötig.
- **V-HDR-7** `jsfive` liegt trotz Kommentar `radolan.ts:592` statisch im MapView-Graph (`geosphereIncaGrid.ts:21`, `meteoSwissRadar.ts:21` → `hdf5OffMain` → `incaParse`/`rzcParse`/`rvHdf5`). Kein Fehler, aber die Chunk-Annahme stimmt nicht.
- **V-HDR-8** OPERA: Bucket `openradar-24h` (CloudFerro), DBZH 5-min ≈ 1,9 MB, ohne CORS-Header; LAEA 55/10, 3800 × 4400. Archiv-Bucket laut ORD-Doku „TBD".
- **V-HDR-9** Es gibt keinen Radar-Index; Slots werden aus der Uhr geraten (Gates). Der Plan setzt „manifest/index" voraus — das wäre E-ND-2 (Bündel je Slot), nicht HDR.
- **V-HDR-10** Lokaler Klon `C:\dev\buscosun-data` steht auf 28.10.; Spiegel-Kopien von `radar.yml`/`radar-mirror.mjs` weichen nur in Kommentaren von den Vorlagen ab.
- **V-HDR-11** GeoSphere `nowcast-v1` Abschaltung „Ende Dezember" ist weder im Terminregister noch am Server geprüft. Vor dem 30.11.-Block (E-EX-5) nachtragen: `inca-v2`-Pfad messen, Register-Eintrag mit `resolved`-Pflicht.
- **V-HDR-12** Der Spiegel installiert `bz2@1` im Workflow (`workflow-radar.yml:67`) nur noch für das tote Format; mit E-HDR-7 entfällt auch das.

## 8. Vorschlag für den reduzierten Umfang (wartet auf Jans Wort)

1. **HDR-1 (E-HDR-2):** HX-Leser `src/sources/dwdHx.ts` (ODIM, uint16, gain/offset, nodata/undetect) + Producer-Schalter `RADAR_HD250_SRC` im Derive, Ausgabe byte-kompatibel; Verifier-Erweiterung `verify:radar-250m` mit einer HX-Fixture; Abnahme an drei nassen Slots (Blockmittel = RV, Kachel-Diff px250 ↔ HX, Laufzeit ≤ heute 0,9–1,5 s).
2. **HDR-2 (E-HDR-7, optional):** RADOLAN-bz2-Zweig und `fetchRyLatest` entfernen, `bz2@1` aus dem Spiegel-Install; Bundle-Delta messen.
3. **HDR-3 (V-HDR-6, optional):** Attribution DWD · GeoSphere · MeteoSchweiz sichtbar aus den vorhandenen Konstanten; Resolution-Satz „bis 250 m in Deutschland (auf Wunsch), 1 km in Österreich und der Schweiz".
4. **Nicht in HDR:** LAEA-Mosaik, Feathering, OPERA, R2/PMTiles, Shader-LUT, Crossfade, 250 m als Standard (E-HDR-6 separat).
