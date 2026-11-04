# Phase HDR — HD-Niederschlagsradar in der DACH-Karte

> Stand 04.11.2026: §1–§8 Diagnose (Schritt 1, Commit `e42ea70d`), §9 Umsetzung nach Jans Entscheidungen vom 04.11. (HX-Quelle, bz2-Rückbau, Attribution, Bildmatrix, Mobilzahlen). Entscheidungen `E-HDR-n` (Jan), Befunde `V-HDR-n`.
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

## 9. Umsetzung (04.11.2026)

### 9.1 Jans Entscheidungen (04.11.)

E-HDR-1 kein R2 · **E-HDR-2 ja:** HX als 250-m-Quelle im Producer, byte-kompatible Ausgabe, kein Client-Umbau, Schalter `RADAR_HD250_SRC` (`px250 | hx`), px250 bleibt Voreinstellung bis zum Vergleich an einem nassen Slot (Überlappungen, Ränder, Bilder im Audit), `hx` nur ohne Rückschritt · E-HDR-3 OPERA raus, kein LAEA-Mosaik, kein Feathering, kein Shader-LUT · **E-HDR-6 offen:** erst Erstbild und Animations-fps mobil 250 m gegen 1 km messen · **E-HDR-7 ja:** nur den toten RADOLAN-bz2-Radarzweig entfernen, bzip2 bleibt für ICON · Attribution sichtbar aus den vorhandenen Konstanten · V-HDR-11 am Server prüfen. **Messlatte (bindend):** 250 m sieht genauso modern und glatt aus wie 1 km — derselbe `RainLayer`-Pfad (Catmull-Rom auf Werten, Rampe danach, Log-8-Bit, Morph), keine sichtbaren Pixel, Blöcke, Körnung, keine harte Kante am Ende der 250-m-Abdeckung oder zwischen 1 km und 250 m, keine Kachelnähte, kein Sprung beim Umschalten. Sieht 250 m körniger aus als 1 km: **nicht am Shader drehen**, sondern mit Bildern und Vorschlag berichten.

### 9.2 HDR-1 — HX als Quelle der 250-m-Kacheln (Commit `cef8c403`, gepusht)

- **Leser** `src/sources/dwdHx.ts`: ODIM-HDF5 des Komposits, Gitterprüfung gegen den Vertrag (`hxGridOk`: RV-Projektion, `x_0 = RV_X0 + 375`, `y_0 = RV_Y0 − 375` = Halbzellen-Differenz, 4400 × 4800 × 250 m, Toleranz `HX_ORIGIN_TOL_M` 1 mm, Annahme), Einzel-Chunk-Schnellpfad geteilt mit px250 (`h5SingleChunkU16`), Knotenliste aus `/how nodes`.
- **Vertrag** `src/sources/radarHd250.ts`: `compositeHx(grid)` (Verschiebung muss 0 sein, Z-R wie px250, `dist` = NaN für „nicht bekannt", +∞ für nodata), `Hd250Source`, `hd250.json` trägt optional `src: 'px250' | 'hx'` (alte Metas ohne Feld bleiben gültig; der Client liest das Feld nicht — **Vertragsänderung nur additiv**).
- **Producer** `radar-derive.mjs hd250`: `RADAR_HD250_SRC=hx` liest `composite_hx_<JJJJMMTT>_<HHMM>-hd5` vom DWD (oder `hx.h5` im `sitesDir`); fehlt die Datei, ist sie unlesbar oder trägt eine andere Zeit, **fällt der Slot auf px250 zurück** (stderr „HX verworfen … Rückfall auf px250", Meta `src: px250`). Voreinstellung `px250` = byte-gleich zu R250 (Verifier E3 unverändert grün). Spiegel: `status.json` nennt `hd250Src`, die Slot-Zeile `src`. Workflow-Vorlage: `RADAR_HD250_SRC: 'px250'` mit Kommentar.
- **Verifier** `verify:radar-250m`: G1–G7 (Name/URL, Gitterprüfung, Knoten, synthetisches Komposit, Verankerung, Ablehnung fremder Ebenen, Meta `src`), E7–E12 an echten Dateien (HX-Dekoder schnell = jsfive Zelle für Zelle, Derive `hx` byte-gleich zum Bibliothekspfad, Blockregel, **E12 Rückfall ohne HX-Datei byte-gleich zum px250-Lauf**). Lauf 04.11. mit `RADAR_250_RAW` = Slot 02.11. 10:30: **45 bestanden, 0 fehlgeschlagen, 1 übersprungen** (E6 Python-Referenz fehlt).
- Gates: `typecheck` grün, `build` grün, `budget`: totalJs 1978,7 KB über der Ratsche 1975 (Arbeitsbaum trägt die uncommitted ND-Linie; HDR legt `compositeHx` in den Client-Chunk, Anteil nicht einzeln gemessen) ⇒ Ratsche von Hand auf 1980 mit Notiz in `budget.json`.

### 9.3 Vergleich px250 ↔ HX (Belege `audit/hd-radar/vergleich-<Slot>/`)

**Slot-Wahl (V-HDR-12):** im 48-h-Fenster des DWD (02.11. 10:15 – 04.11. 10:10 UTC) gab es **keinen Regen über München, Basel oder dem Bodensee** (HX-Echoanteil ±40 km: 0,0 % in allen Stundenproben, München höchstens 2,5 % am 02.11. 20:25). Die Messung läuft deshalb an **Slot A = 02.11. 10:30 UTC** (Band Eifel–Ruhr–Weser, Köln 33 % Echo, Emden 2 %; HX 1,47 MB, px250 17 Dateien 2,3 MB, RV-Tar 2,56 MB) und **Slot B = 02.11. 20:25 UTC** (leichter Regen bei München 2,5 %). Die Nahtstellen zwischen Standorten (Essen/Flechtdorf, Neuheilenbach/Essen, Flechtdorf/Hannover) liegen im Band von Slot A. Eingaben gesichert im Scratchpad der Session; die Skripte `hx-regions.mjs` (Echo je Ort) und `hd250-compare.mjs` (Derive beide Wege, Zahlen, Bilder) liegen dort — für die Wiederholung an einem Südwest-Regentag mit denselben Aufrufen (`audit/hd-radar/vergleich-*/stats.json` nennt die Form).

| | Slot A 10:30 px250 | Slot A HX | Slot B 20:25 px250 | Slot B HX |
|---|---|---|---|---|
| Derive `hd250` (3 Läufe, lokale Eingaben, ms) | 6 961 / 5 807 / 5 624 | **4 472 / 5 192 / 5 010** | 4 568 / 4 009 / 4 101 | **2 714 / 3 519 / 2 850** |
| Eingabe vom DWD je Slot | 17 Dateien, 2,3 MB (+ 17 Polarscans für SE) | 1 Datei, 1,47 MB | 17 Dateien, 1,2 MB | 1 Datei, 0,87 MB |
| Kacheln · Bytes | 13 · 498 KB | 13 · 494 KB | 14 · 211 KB | 14 · 212 KB |
| 1-km-Blöcke nass / strukturiert / flach | 47 828 / 46 608 / 1 220 | 47 828 / **46 833 / 995** | 18 087 / 16 741 / 1 346 | 18 087 / **16 851 / 1 236** |
| nasse 250-m-Zellen (eine Quelle oder beide) | 706 040 | | 238 649 | |
| Zellen mit anderem Byte · > 1 Log-Stufe | 565 939 (80 %) · 420 798 | | 176 661 (74 %) · 133 533 | |
| nur px250 nass · nur HX nass | 20 504 (2,9 %) · 29 009 (4,1 %) | | 11 357 (4,8 %) · 11 791 (4,9 %) | |
| relative Streuung der 16 Teilzellen je nassem Block (Mittel) | 0,230 | 0,221 | 0,274 | 0,278 |

Lesart: die **Menge** ist in beiden gleich (Blockmittel = RV, E4/E10), die **Struktur** innerhalb der Blöcke ist in 74–80 % der Zellen anders, die **Struktur-Amplitude** gleich (±4 %), die Abdeckung unterscheidet sich um 3–5 % der nassen Zellen in beide Richtungen (HX = Maximum mehrerer Standorte füllt Lücken des nächsten Standorts, z. B. Strahlblockaden; px250 = nächster Standort hat an Kanten Zellen, die HX nicht hat).

**Befunde aus den Bildern** (`koeln-*`, `seam-*`, `emden-*`, `muenchen-*`, `overview-*`):
- **V-HDR-14 (Hauptbefund):** die px250-Kacheln tragen **Nähte zwischen den Standortzonen** — an der Linie, wo die Regel „nächster Standort" umschaltet, wechselt die Richtung der radialen Textur und im Differenzbild liegt eine scharfe Kante (`seam-ess-fld-diff.png` senkrecht bei x ≈ 180, `seam-fld-hnr-diff.png` diagonal). **HX hat diese Nähte nicht** (Maximum-Komposit des DWD, weich zwischen den Standorten). Jans Messlatte „keine Kachelnähte / keine harte Kante" spricht damit **für HX**.
- **V-HDR-15:** beide Quellen zeigen die **radiale Strahl-Textur** (250 m radial × 1° Azimut, mit der Entfernung breiter — R250 §3) — das ist die Natur des 250-m-Produkts, nicht der Kodierung; HX ist um 4 % glatter (Slot A) bzw. 1 % feiner (Slot B). An den Orten der Messlatte muss das im Bild der Karte beurteilt werden (§9.7).
- **V-HDR-16:** rote Flecken im Differenzbild (`seam-fld-hnr-diff.png`, `seam-nhb-ess-diff.png`) = Blöcke, in denen HX Echo hat und der nächste px250-Standort keins — Strahlblockade oder Reichweite des nächsten Standorts; HX nimmt dort den zweitnächsten. px250 hat dafür an Küste und Rand (Emden) vereinzelt Zellen, die HX als nodata führt.
- **V-HDR-17:** die Schiffs-/Windpark-Echos vor Emden (violette Blöcke in beiden Bildern) sind in HX und px250 identisch — der Störecho-Filter (SE, ρHV) greift im Producer vor der Verankerung und ist von der Quelle unabhängig (lokal ohne Polarscans gerechnet, deshalb hier sichtbar).

**Empfehlung zu E-HDR-2:** kein Rückschritt gemessen — Menge gleich, Amplitude gleich, Nähte weg, Eingabe 1 statt 17 Dateien, Derive 20–30 % schneller. `RADAR_HD250_SRC: 'hx'` im Daten-Repo setzen (§9.8); der Rückfall auf px250 je Slot bleibt automatisch.

### 9.4 V-HDR-11 — GeoSphere INCA

Am Server geprüft (04.11.): `dataset.api.hub.geosphere.at/v1/datasets` führt `grid/forecast/nowcast-v1-15min-1km` (das ist unser Datensatz, Client `geosphereIncaGrid.ts:33`, Spiegel `radar-mirror.mjs`) und `grid/historical/inca-v1-1h-1km`; **kein `inca-v2`/`nowcast-v2`** im Verzeichnis; `/metadata` antwortet normal (`last_forecast_reftime` 09:45 UTC). Die Abschaltung zum 04.11.2026 betrifft die v1-**NWP**-Modelle (`nwp-v1`, bei uns seit GS auf v2) — für `nowcast-v1-15min-1km` gibt es **keine Abkündigung**, weder im Datensatz-Verzeichnis noch im Changelog (Web-Recherche: eine Community-Übersicht nennt den Nowcast ausdrücklich als „nicht betroffen"). ⇒ **kein Stopp**, Terminregister unverändert; Beobachtung bleibt (Jan: beim nächsten GeoSphere-Rundschreiben prüfen).

### 9.5 E-HDR-7 — RADOLAN-bz2-Radarzweig entfernt

Entfernt: im Client `radolan.ts` der `decompress`-Import, die Signaturweiche bz2/HDF5, `rvFormatOrder`/`?rvfmt=`/`localStorage.rvfmt` (`radolanDecode.ts`), der Tar-Weg des `radolanWorker` (`tarBuf`), `fetchRyLatest`/`RY_LATEST` (unverdrahtet), der `fmt`-Parameter des Tar-Abrufs; im Producer die Option `RV_FORMAT=radolan` (Spiegel), der bz2-Zweig des `rv`-Derive (`decompressBz2`), `REPACK_BZIP2` an den Derive-Kindprozess und `bz2@1` aus dem `npm install` der Workflow-Vorlage. Ein Tar ohne HDF5-Felder ist jetzt ein **benannter Fehler** („RADOLAN-Binärformat seit 2026-10-20 abgeschaltet"). **Bleibt:** `decodeRadolanRaw`/`decodeRvTar`/`isBz2`/`rvFileNameOf(…, 'radolan')` in `radolanDecode.ts` für Archiv-Leser (`scripts/point/nowcastReader.mjs`, Hindcast-Tars, `verify:radar-repack` B1h) und `bz2`/`bzip2-wasm`/`decompress.ts` für ICON-D2. Verifier: `verify:radar-runs` ohne die `rvFormatOrder`-Zeile. Bundle: `bz2` liegt weiter in der App (ICON), der radolan-Chunk verliert nur den Import — Delta im Build gemessen (§9.9).

### 9.6 Attribution sichtbar

Die drei Konstanten (`RADOLAN_RV_ATTRIBUTION`, `GEOSPHERE_INCA_ATTRIBUTION`, `METEOSWISS_RADAR_ATTRIBUTION`) leben jetzt im abhängigkeitsfreien Blattmodul `src/sources/radarAttribution.ts` (die Leser re-exportieren sie unter denselben Namen — kein Importeur ändert sich) mit `parseRadarAttribution` (die EINE Stelle, die die HTML-Form kennt) und `radarAttributionsPlain()`. Sichtbar: Regenradar-Readout-Fußzeile (`● DWD RADOLAN-RV · CC BY 4.0 · GeoSphere Austria INCA (RR) · CC BY 4.0 · MeteoSchweiz rzc (RR) · CC BY 4.0 · …`, Quellen als Links, Komponente `components/RadarAttribution.tsx`), Regenradar „Methodik & Datenqualität" neue Zeile **Lizenzen**, Wetterkarte Layer-Karte „Niederschlag" Quellzeile aus den Konstanten. OPERA wird nicht genannt (E-HDR-3). Hinweis: MeteoSchweiz verlangt „Source: MeteoSwiss"; die App nennt seit RL „CC BY 4.0" — unverändert gelassen, Wortlaut ist Jans Entscheidung (V-HDR-18).

### 9.7 Bildmatrix (Messlatte) — `audit/hd-radar/shots-2611021030/`, Harness `scripts/radar-hdr-shots.mjs`

Lauf 04.11. 12:29–13:27 UTC gegen den Produktions-Build (`vite preview`), Slot A per CDP-Interception unter dem Stempel der Seite, 120 Aufnahmen (Köln, Emden, München, Basel, Konstanz × Zoom 6/8/10/12 × 1 km / 250 m px250 / 250 m HX × 1440 × 900 und 390 × 844 DPR 3), alle 120 mit gezeichnetem Radar (`__perf.radarDrawNZ`), Konsole sauber bis auf eine MapLibre-Bildwarnung in zwei Basel-Aufnahmen (Sprite-Bild, nicht Radar). Ein erster Lauf parallel zum Typecheck lieferte verfrühte Aufnahmen (V-HDR-19) und wurde verworfen; der Harness wartet seitdem auf den ersten Draw mit Radarinhalt statt auf feste Pausen. `report.jsonl` trägt je Bild Zoom, Zeitachse, angeforderte 250-m-Dateien, Konsole. Wichtig für die Lesart: in chrome-headless-shell (Software-WebGL, `--disable-gpu`) ist die Basiskarte **schwarz** und die Rampe wirkt grau-blau — wie in allen RA-Aufnahmen (§7 dort); die Struktur des Radars ist davon unberührt.

**Ergebnis gegen die Messlatte:**
- **250 m px250 ↔ 250 m HX auf der Karte: kein Unterschied in der Anmutung** (`koeln-desktop-px250-z10` ↔ `-hx-z10`, `-z12`, mobil): gleiche Textur, gleiche Kanten; HX zeigt die Standortnähte der px250-Kacheln nicht (§9.3, auf der Karte bei Köln nicht im Bild, weil die Naht Essen/Flechtdorf nördlich liegt). **Kein Rückschritt durch HX.**
- **250 m ↔ 1 km verfehlt die Messlatte — heute schon, unabhängig von HDR (V-HDR-20):** ab Zoom 10 zeigen die 250-m-Kacheln **sichtbare Rechteck-Stufen und radiale Streifen** (`koeln-desktop-hx-z10`, `-z12`, `koeln-mobile-hx-z10`), die 1-km-Ebene glatte Flächen (`koeln-desktop-1km-z10`). Es ist dieselbe `RainLayer`-Kette (Catmull-Rom auf Werten, Rampe danach, Log-Byte); die Stufen sind die **Daten** — ein 250-m-Pixel ist im Polarbin 1° breit (1 km ab 57 km, R250 §3), und Catmull-Rom interpoliert nur zwischen Zellmitten. Bei Zoom 6/8 (nur 1 km gezeichnet) sind alle drei Varianten identisch. Schalter 1 km ↔ 250 m: kein Sprung der Mengen (Blockmittel), aber der Texturwechsel ist der oben beschriebene.
- **Rand der 250-m-Abdeckung** (`emden-desktop-hx-z10`, Küste/Dollart): das 250-m-Bild endet an der Sandmaske (DACH) bzw. an der Reichweite — der Übergang ist der Kachelrand; ein quadratischer Block mit Starkregen-Farben am linken Bildrand (Dollart) ist ein Schiffs-/Windpark-Echo, in px250 und HX identisch (§9.3 V-HDR-17; live filtert SE solche Echos vor der Verankerung, hier ohne Polarscans gerechnet).
- München, Basel, Konstanz: im Slot trocken (§9.3) — die Aufnahmen belegen nur, dass dort nichts gezeichnet wird und keine Kachel angefordert wird (`report.jsonl`: `hd250Tiles 0`). Die Naht 1 km (CH/AT) ↔ 250 m (DE) an der Grenze ist damit **nicht beurteilt**; Wiederholung an einem Südwest-Regentag mit denselben Aufrufen.
- Beobachtung V-HDR-19 (nicht HDR): in den 250-m-Aufnahmen sagt die Ereignis-Karte „Durchgehend trocken", in den 1-km-Aufnahmen „leichter Schauer jetzt" — dieselben Radardaten; vermutlich rechnet die Ereignisliste, bevor der Radar-Nowcast da ist, und nicht neu. Einmal nachstellen (Regenradar-Linie).

**Vorschlag zur Messlatte (kein Shader, Jans Entscheidung, V-HDR-20):** die Stufen entstehen im Producer, nicht im Renderer — also im Producer glätten: vor der Verankerung das 250-m-Feld mit einem **entfernungsabhängigen Kern** glätten, dessen Breite die wahre Querauflösung des Strahls ist (`max(250 m, r · 0,01745)` für 1° Strahlbreite; 0,5 km bei 30 km, 1 km bei 57 km — die Zahl aus R250 §3), danach wie bisher Blockmittel = RV. Das nimmt die Treppen und Streifen dort, wo sie Artefakte der Bin-Breite sind, lässt die 250-m-Struktur nahe am Standort stehen, ändert keine Menge und keinen Client-Pfad (Kacheln bleiben Log-Bytes, derselbe `RainLayer`). Umfang: eine Funktion in `radarHd250.ts` + Producer-Schalter (`RADAR_HD250_SMOOTH=beam`), Verifier-Block, Bildmatrix wiederholen. Alternative mit Shader-Berührung (STOPP): B-Spline statt Catmull-Rom nur für die 16 Kachel-Ebenen (HD-2 hat B-Spline für 1 km wegen des Spitzenverlusts auf 44 % verworfen; für verankerte 250-m-Kacheln wäre das Blockmittel unberührt).

### 9.8 Mobilzahlen (E-HDR-6) — `scripts/radar-hdr-shots.mjs --perf=3`, Köln Zoom 10, 390 × 844 DPR 3, Fast 4G, CPU × 4

| Variante (Median aus 3) | erster Draw mit Radar (ms nach Navigation) | rAF-Lücken > 200 ms bis dahin | fps im Abspielen (6 s) | längste Lücke im Abspielen (ms) |
|---|---|---|---|---|
| 1 km (`hd250=0`) | 6 169 (5 541 / 6 186 / 6 169) | 3–5 | 1,8 | 717 |
| 250 m px250 | 4 880 (4 705 / 4 880 / 6 182) | 31–35 | 1,4 | 1 483 |
| 250 m HX | 6 500 (5 271 / 6 500 / 9 685) | 29–36 | 1,5 | 1 000 |

Lesart und Grenzen: chrome-headless-shell rendert WebGL in Software, die absoluten fps sind deshalb unbrauchbar (1–2 fps auch für 1 km); vergleichbar ist nur das Verhältnis innerhalb des Laufs. **250 m kostet im Laden ≈ 30 lange rAF-Lücken mehr** (zwei Kacheln je 1,32 MPixel dekodieren und hochladen) und im Abspielen **≈ 25 % längere Frames** (1,4–1,5 gegen 1,8 fps; längste Lücke 1 000–1 483 gegen 717 ms). Der erste Radar-Draw unterscheidet sich im Rauschen nicht (±1,5 s zwischen den Läufen). Die abgefangenen Dateien kommen ohne Netzemulation (CDP liefert lokal) — die Zahlen sind Dekode + Zeichnen, nicht Transfer; Transfer je nassem Slot: 2 Kacheln ≈ 100–150 KB zusätzlich (Slot A gesamt 13 Kacheln 494 KB). „Kacheln auf dem Bildschirm" ließ sich im Radar-Profil nicht aus dem DOM lesen (die Statuszeile ist ein Wetterkarten-Element); die Kacheldateien kamen in allen 250-m-Läufen an. **Real-Device bleibt offen** (CLAUDE.md: Emulation ist für WebGL nicht repräsentativ) — Jan, mit `?hd250=1` an einem Regentag auf dem Telefon: Erstbild und Abspielen gegen `?hd250=0`.

### 9.9 Daten-Repo

Kopien der Vorlagen `scripts/radar-mirror/workflow-radar.yml` → `.github/workflows/radar.yml` und `radar-mirror.mjs` → `scripts/radar-mirror.mjs` (E-HDR-7: ohne `bz2@1` und `REPACK_BZIP2`, ohne `RV_FORMAT`; die tote `RADAR_NC_BLEND`-Zeile der Daten-Repo-Kopie entfällt mit der Vorlage) mit **`RADAR_HD250_SRC: 'hx'`** (E-HDR-2, nach §9.3/§9.7 ohne Rückschritt). Eingespielt per `checkout --detach origin/main` → Commit → `push HEAD:main` (Regel V-WL-20, kein Rebase, kein Force). Wirksam mit dem **nächsten Spiegel-Job** (der laufende Job behält seine Umgebung bis zum Ende, ≤ 5 h 45; Dispatch von hier ist Jans Gate). Abnahme danach: `radar/status.json` nennt `hd250Src: "hx"`, ein `rv-past/<Slot>/hd250.json` trägt `src: "hx"`, die Slot-Zeile im Log `hd250 … (hx, 17/17 Standorte)`; bei fehlendem HX fällt der Slot auf px250 (Zeile „HX verworfen").

### 9.10 Weitere Befunde und offene Punkte

- **V-HDR-13 (Betrieb, nicht HDR):** der Spiegel-Job 41791065281 endete am 04.11. um 09:36 UTC mit „failure" im Schritt Mirror (gestartet 07:16, also nicht am Laufzeitende); der Nachfolger startete erst 10:16 (Watchdog) — die Slots 09:35–09:45 wurden um 10:18–10:26 nachgeholt (`status.json`), **≈ 40 min ohne frische Radarbilder**. Auch die regulär endenden Läufe (01:46, 07:15) stehen auf „failure". Die Job-Logs sind ohne Token nicht lesbar — Jan: einmal das Log von 41791065281 ansehen (Ursache des Abbruchs um 09:36) und ob `ensureSuccessor` den Exit-Code verdirbt.
- **V-HDR-21:** `verify:radar-250m` E7 — der jsfive-Weg braucht für das HX-Feld (21 M Zellen) ≈ 100 s; der Schnellpfad liest es in < 1 s. Im Producer läuft nur der Schnellpfad; fiele er aus (andere Chunk-Form), wäre der Slot zu langsam (Timeout 150 s). Der Verifier würde es melden (E7 prüft die Gleichheit beider Wege).
- Offen: Südwest-Regentag für die Naht 1 km ↔ 250 m an der Grenze und für München/Basel/Bodensee (§9.7); Real-Device (§9.8); V-HDR-20 Entscheidung zum Glätten im Producer; V-HDR-19 Ereignisliste; V-HDR-18 MeteoSchweiz-Wortlaut; `verify:radar-runs` 54/55 bleibt bekannt rot (V-ND-2).
