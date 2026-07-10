# Audit — 2D-Wetterkarte: Redundantes Laden reduzieren

**Feature:** 2D-Wetterkarte (Wetterkarte / `map2d`-Overview)
**Referenzgerät:** iPhone 12 Pro (390×844, DPR 3), Chrome DevTools MCP, Touch-Emulation
**Dev-Server:** `http://localhost:5174` (Port 5173 war durch ein Fremdprojekt „g2-spike-app" belegt → Vite ist auf 5174 ausgewichen)
**Aufrufpfad Messung:** Startseite → Kachel „WETTERKARTE" (Overview-Modus, nativer Default-Layer Wind, Modell „DE Native")
**Ziel:** Nie dasselbe zweimal laden; statische Daten einmal laden und wiederverwenden; Refreshes koordinieren — **ohne** angezeigte Daten oder Layer/Funktionen zu ändern.

---

## 1. Methodik & Messgrenzen (ehrlich)

- Gemessen wird der **Overview-Modus** (die eigentliche Wetterkarte). Ein `#m=`-Permalink erzeugt dagegen `view.kind='map'` **mit Ortsmarker + Punktpanel** und lädt eager die **Punkt-Vorhersage → Fusion** (Elevation-Kacheln + ~230 brightsky/meteoswiss-Requests). Das ist **nicht** die Wetterkarte und **außerhalb** dieses Scopes. Erste Messungen über den Permalink wurden daher verworfen.
- **React StrictMode (Dev)** mountet den Karten-Effekt doppelt. Der erste Mount wird per `AbortController` abgebrochen; laufende Fetches erscheinen als `net::ERR_ABORTED` und werden vom zweiten Mount wiederholt. Alle „2×"-Duplikate im Dev-Trace (z. B. Elevation-Kacheln, `t_2m`-Directory) sind **Dev-Artefakte** und treten im Production-Build **nicht** auf. Sie sind kein Optimierungsziel.
- **Byte-Zählung ist cross-origin unzuverlässig:** Fremdhosts (S3-Elevation, brightsky, geosphere, geo.admin, openfreemap) liefern kein `Timing-Allow-Origin` → `transferSize = 0` im Resource-Timing. Verlässlich sind nur same-origin/proxied Ressourcen (`/_dwd_opendata/…`). Primärmetrik ist daher die **Request-Anzahl**, nicht Bytes.
- **Refresh-Zyklus (30 min) nicht live abwartbar:** Die Intervall-Redundanz wird deterministisch aus dem Code hergeleitet (siehe §5.1), nicht über 30-min-Wartezeiten.

---

## 2. Per-Source-Inventar

Alle 5 GRIB-Layer teilen sich die Lauf-Auflösung + Byte-Fetching über `src/sources/iconD2Precip.ts` mit drei Modul-Caches:
- `runCache` (`Map<param,…>`, TTL 3 min) — Per-Param-Directory-Listing-Cache.
- `sharedRun` (Modul-`let`, 3-min-TTL) — hat ein Layer den Lauf aufgelöst, probieren andere Params direkt dessen `HH` (1 Fetch) statt der 6er-Rückwärtssuche.
- `gribCacheP` / Cache API `icon-d2-grib-decompressed-v1` — dekomprimierte GRIB-Bytes, geteilt über alle ICON-D2-Params.

| # | Layer | Quelle (Datei) | URL / Datei | Cache-Schutz | Trigger | Cadence |
|---|-------|----------------|-------------|--------------|---------|---------|
| 1 | Wind (GRIB) | `wind/iconD2WindSource.ts` `fetchIconD2Wind` | `…/icon-d2/grib/<HH>/u_10m/`, `/v_10m/` je Step | `iconD2WindRef` + `windLoadingRef` + Cache API + localStorage `bc_wind_now_v2` (Sofort-Paint, 24 h) | Aktivierung | 30 min (t12) |
| 2 | Temp (GRIB) | `sources/iconD2TempSource.ts` `fetchIconD2Temp` | `…/<HH>/t_2m/…` + invariant `hsurf` (DEM) | `iconD2TempRef` + Cache API; **kein Loading-Guard** | Aktivierung **oder** `requestIdleCallback` (Stadt-Labels) | 30 min (t13) |
| 3 | Wolken (GRIB) | `sources/iconD2Clouds.ts` | `…/<HH>/clcl/`,`clcm/`,`clch/` | `iconD2CloudsRef` + Cache API | Aktivierung | 30 min (t11) |
| 4 | Niederschlag (GRIB) | `sources/iconD2Precip.ts` `fetchIconD2Precip` | `…/<HH>/tot_prec/…` | `iconD2Ref` + Cache API | Aktivierung (Nowcast-Kette) | 30 min (t10) |
| 5 | Böen (GRIB) | `sources/iconD2GustSource.ts` | `…/<HH>/vmax_10m/…` | `iconD2GustRef` + Cache API | Aktivierung | 30 min (t14) |
| 6 | Nowcast/Radar | `radolan.ts` / `geosphereIncaGrid.ts` / `meteoSwissRadar.ts` | RV-Tar (DE) / INCA-Grid (AT) / rzc (CH) | je eigener Ref + `_runCache`/Cache API (RV) | Aktivierung (`nowcast`/`flownowcast`/`poprob`) | 5 min (t9) |
| 7 | Satellit (WMS) | `dwdSatellite.ts` | `maps.dwd.de/geoserver/dwd/wms?…` Rastertiles + `GetCapabilities` (Zeit) | MapLibre-Tile-Cache; `fetchWmsLatestTime` 5-min-Cache | Aktivierung | 30 min (t3) |
| 8 | Blitze (WMS) | `dwdLightning.ts` | `…/wms?…Accumulated_Flash_Area` + `GetCapabilities` | wie Satellit | Aktivierung | 10 min (t4) |
| 9 | Stationen | `dachStations.ts` | brightsky `/sources` + TAWES + SMN; Klick: `/current_weather` | `stationsLoadedRef` (nur Interval-Gate) | Aktivierung | 10 min (t7) |
| — | Fusion-Forecast | `fusion/loadFusedForecast.ts` | viele Modell-/Obs-Upstreams (Elevation-Terrarium, brightsky-Grid, SMN …) | `fusionRequestedRef` (idempotent, lazy) + `elevationPromise` (Modul-Scope) | **lazy** bei Temp-Aktivierung / fusion-fähigem Layer | 60 min (t1) |

### 2.1 `setInterval`-Registry (Mount-Effekt, `MapView.tsx`)

| Var | Zeile | Cadence | Ruft | Guard |
|-----|-------|---------|------|-------|
| t1 | 1407 | 60 min | `loadOpenMeteo` (Fusion) | `fusionRequestedRef` |
| t9 | 1412 | 5 min | `refreshNowSource` | Per-Source-Refs |
| **t10** | 1414 | 30 min | `installIconD2` | `iconD2Ref` |
| **t11** | 1418 | 30 min | `installClouds` | `iconD2CloudsRef` |
| **t12** | 1422 | 30 min | `installWind` | `active.has('wind') && iconD2WindRef` |
| **t13** | 1426 | 30 min | `installTemp` | `active.has('temp') && iconD2TempRef` |
| **t14** | 1430 | 30 min | `installGust` | `active.has('gust') && iconD2GustRef` |
| t3 | 1436 | 30 min | `installSatelliteLayer` | `satLoadedRef` |
| t4 | 1440 | 10 min | `installLightningLayer` | `lightningLoadedRef` |
| t7 | 1444 | 10 min | `installStationsLayer` | `stationsLoadedRef` |

**t10–t14** (fett) = die fünf unkoordinierten ICON-D2-GRIB-Refreshes → Ziel der Koordination.

---

## 3. Baseline-Messung (Dev, iPhone 12 Pro, Overview)

| Szenario | Beobachtung |
|----------|-------------|
| **Kaltstart, Default Wind** | 222 Requests gesamt. GRIB kommt aus der Cache API (nur 2 Proxy-Hits = `t_2m`-Directory, StrictMode-doppelt). **Keine** eager Fusion, **kein** brightsky-Grid. Dominant: ~90 unique Elevation-Terrarium-Kacheln (Dev-doppelt → 180). Basemap ~25, Dev-Module ~15. **Konsole fehlerfrei.** |
| **Wind aus → ein** | **0 neue GRIB-, 0 neue Weather-Requests** → `iconD2WindRef` + Cache API greifen (Invariante „Layer-Switch refetcht nicht" bestätigt). |
| **Precip/Radar aktivieren** | Kein neuer Radar-RV-Fetch (RV wurde bereits am Mount geladen → Ref-Cache greift). |
| **Temp aktivieren** | Voller Fusion-Obs-Load: ~172 brightsky + 61 meteoswiss + 4 geosphere. **By-Design** (Fusion speist Temp-Fallback + Stadt-Labels); Fusion-**Ergebnisse** sind laut Vorgabe tabu → **kein** Ziel. |

**Elevation-Kacheln am Kaltstart** (~90 unique, Dev-doppelt): Die `2×`-Verdopplung entsteht, weil der StrictMode-Abbruch die in-flight Elevation abbricht → `elevationPromise` wird im `.catch` auf `null` zurückgesetzt (`loadFusedForecast.ts:61`) → der zweite Mount lädt neu. **Production-Verhalten: einmalig.** Kein Ziel dieses Tasks.

---

## 4. Ziel-Verifikation (die 5 Konkret-Targets aus dem Prompt)

| # | Target | Befund | Aktion |
|---|--------|--------|--------|
| 1 | Refresh-Intervalle koordinieren (t10–t14) | **Bestätigt.** 5 separate 30-min-Intervalle. Am 30-min-Tick sind `runCache`/`sharedRun` (3-min-TTL) abgelaufen → bis zu 5 **nebenläufige** Rückwärtssuchen (`sharedRun` ist beim Start aller fünf noch `null`). | **FIX** — 1 Koordinator |
| 2 | In-flight-Guard für Temp | **Bestätigt.** Nur `windLoadingRef` existiert; Temp hat keinen Loading-Guard. Aktivierungs-Pfad (Effekt) und `requestIdleCallback`-Pfad + 30-min-Refresh können `installTemp` doppelt feuern. | **FIX** — `tempLoadingRef` |
| 3 | Wind-„now"-Cache ohne PNG-Codec | **Bestätigt.** `bc_wind_now_v2` speichert Frame 0 als PNG-DataURL (`toDataURL`) → Encode beim Speichern, async `Image`-Decode beim Laden. Grid 608×373, 487 KB. | **FIX** — Rohbytes (IndexedDB) |
| 4 | WMS-Capture-Time kurz cachen | **Bereits umgesetzt.** `wmsTime.ts` hat 5-min-TTL-Cache **+ inflight-Promise-Dedup** (Z. 14–16, 37, 58). Sat & Blitze nutzen ihn (Call-Sites `MapView.tsx:995`, `:1370`). | **Kein Code** — verifiziert |
| 5 | Fusion-Doppel-Load | **Kein Doppel-Load.** Fusion lädt **nicht** am Mount (nur Placeholder `setForecast`), sondern lazy via `fusionRequestedRef` (Temp-Aktivierung / fusion-fähiger Layer). Overview-Trace bestätigt: keine Fusion am Kaltstart. Der eager Fusion-Load im `#m=`-Modus ist die **Punkt-Vorhersage**, nicht die Wetterkarte. | **Kein Code** — verifiziert |

---

## 5. Maßnahmenplan (nur #1–#3)

### 5.1 Refresh-Koordinator (Target #1)
`t10–t14` durch **ein** 30-min-Intervall `tD2 → refreshIconD2Layers()` ersetzen:
1. Prüfen, welche der 5 GRIB-Layer geladen sind (Ref-Präsenz = „actually loaded", wie im Prompt spezifiziert).
2. Den jüngsten Lauf **einmal** auflösen (`await resolveLatestRun('t_2m', signal)`) → `sharedRun`/`runCache` warm.
3. Danach nur die Per-Param-Installer der geladenen Layer auffächern — sie treffen jetzt den warmen `sharedRun` (je 1 Directory-Probe statt nebenläufiger 6er-Rückwärtssuche).

**Nebeneffekt/Verbesserung:** Die alten `active.has(...)`-Guards von t12–t14 lasen `active` aus der Mount-Closure (deps `[]`) → **stale** (Mount-Zeit-Set). Temp/Böen wurden dadurch faktisch nie per Interval aufgefrischt, außer sie waren initial aktiv. Die Ref-Präsenz-Gates (wie t10/t11 sie schon haben) beheben das und sind konsistent mit der Prompt-Vorgabe „layers that are actually loaded". Andere Cadences (Nowcast 5, Sat 30, Blitze/Stationen 10, Fusion 60) bleiben unverändert.

### 5.2 `tempLoadingRef` (Target #2)
`useRef(false)` neben `windLoadingRef`; `installTemp` mit `if (tempLoadingRef.current) return; tempLoadingRef.current = true; try {…} finally { tempLoadingRef.current = false; }` umschließen — exakt das `windLoadingRef`-Muster. Verhindert die Race zwischen Aktivierung, `requestIdleCallback` und Refresh.

### 5.3 Wind-„now"-Cache: Rohbytes statt PNG (Target #3)
- **Warum IndexedDB, nicht localStorage:** Rohe RGBA sind 886 KB; als Base64 in localStorage ~1,18 MB **String** (UTF-16 → ~2,3 MB Quota-Fußabdruck, ~2,4× heute) → Quota-Risiko nahe der 5-MB-Grenze. IndexedDB speichert `Uint8ClampedArray` per Structured-Clone **nativ** (kein Base64, großzügige Quota).
- **Kein PNG-Codec mehr:** Speichern = `getImageData` (Rohbytes), Laden = `rgbaToCanvas(rgba, w, h)` (bestehender Helper) → **Canvas**. `WindLayer.setWindData` akzeptiert `HTMLImageElement | HTMLCanvasElement` (WindLayer.ts:759) → kein `WindLayer`-Eingriff nötig, kein async `Image`-Decode.
- **Invarianten bleiben:** 24-h-TTL, Sofort-Paint-vor-Netz, standort-unabhängiger globaler Key.
- Alter localStorage-Key `bc_wind_now_v2` wird best-effort aufgeräumt.

---

## 6. Vorher/Nachher (implementiert)

Umgesetzt: #1 (Koordinator), #2 (`tempLoadingRef`), #3 (Wind-Cache Rohbytes/IndexedDB). #4/#5 bereits vorhanden → kein Code.

| Metrik | Vorher | Nachher |
|--------|--------|---------|
| ICON-D2-Refresh: Lauf-Auflösungen / 30-min-Zyklus | bis zu 5 **nebenläufige** Rückwärtssuchen (sharedRun beim Start aller noch `null`) | **1** Auflösung vorab → Installer treffen warmen `sharedRun` (je 1 Directory-Probe) |
| Refresh-Intervalle (Timer) | 5 (t10–t14) | 1 (`tD2`) |
| Temp-Auto-Refresh (nicht-initial aktiv) | faktisch nie (stale `active`-Closure) | zuverlässig (Ref-Präsenz-Gate) |
| Temp-Doppel-Load-Race | möglich (kein Guard) | ausgeschlossen (`tempLoadingRef`, spiegelt `windLoadingRef`) |
| Wind-Cache-Codec | PNG-Encode (Save) + async `Image`-Decode (Load) | Rohbytes, synchroner Canvas (`rgbaToCanvas`) |
| Wind-Cache-Speicher / Quota | localStorage, 487 KB PNG-String (~974 KB UTF-16) | IndexedDB, 886 KB `Uint8ClampedArray` (kein String/Base64) |
| Layer-Switch refetcht | nein (Invariante) | **nein** (Wind aus→ein: 0 neue GRIB-/Weather-Requests, gemessen) |
| Modellwechsel DE/AT/CH | funktioniert | **funktioniert** (verifiziert, keine Konsolen-Fehler) |
| Konsole | fehlerfrei | **fehlerfrei** (Kaltstart + Layer-Switch + Modellwechsel) |
| Angezeigte Daten / Layer | — | unverändert (reine Fetch/Cache-Änderung) |

### Verifikations-Notizen
- **Koordinator & Temp-Guard:** Typecheck grün; Karte lädt, alle Layer rendern, Wind aus→ein refetcht nicht, DE/AT/CH-Wechsel ohne Fehler, Konsole sauber.
- **Wind-Cache (#3):** Die Save/Load-Logik wurde durch eine **1:1-Nachbildung im Browser** verifiziert — 886-KB-`Uint8ClampedArray` schreibt/liest über IndexedDB, `rgbaToCanvas` rekonstruiert das 608×373-Canvas mit korrekten Pixeln + Normierung + `uvBounds`; `setWindData` akzeptiert das Canvas. `loadWindNowCache` misst **19 ms** (kein Hang → blockiert `installWind` nicht). Eine organische End-to-End-Beobachtung war in dieser Dev-Sitzung durch **zeitweise nicht abschließende Wind-Fetches** (DWD-Proxy-Drosselung nach vielen Reloads/Cache-Clears) blockiert — unabhängig vom Cache-Code (Breadcrumb belegt: `saveWindNowCache` wird schlicht nicht erreicht, wenn `fetchIconD2Wind` nicht abschließt). Real-Device-Gegencheck empfohlen, sobald der Proxy frisch ist.
