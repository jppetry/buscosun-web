# audit/live-network-audit.md — Live-Netzwerk-Audit pro Layer (Prod)

**Art:** Reine **Diagnose** gegen die deployte Produktion — **kein Code**. Ergebnis: ein belegter Per-Layer-Traffic-Befund + priorisierte Verbesserungen, der spätere Umsetzungs-Phasen speist.

**Ziel-URL (Karten-Ansicht mit Ort, DACH):**
`https://buscosun.com/#m={"l":[50.2,10.5,"Deutschland · Österreich · Schweiz","DE"],"b":0,"h":0}`
(url-enkodiert wie vom Nutzer geliefert). Diese `#m=`-Ansicht ist `kind='map'` → Ortsmarker + **Punkt-Vorhersage + eager Fusion** (lädt ICON-D2-EPS, s. [[layer-transport-t2-effort]] §H).

**Zeitpunkt:** nach der T2b-Änderung. Der Audit **verifiziert nebenbei**, ob T2b deployt ist (EPS via `/_dwd_grib` statt `/_dwd_opendata`).

---

## §1 — Methodik (verbindlich)

- **Werkzeug:** Chrome DevTools MCP (Projekt-Standard). Netzwerk = **emulator-belastbar** (anders als GPU/FPS) — Real-Device nicht nötig.
- **Client-Kaltzustand vor der Baseline:** IndexedDB (`buscosun-wind`), Cache-API (`icon-d2-grib-decompressed-v1`, `radolan-rv-tar-v1`), HTTP-Cache leeren; frisches Profil. Service-Worker-Status notieren (`/sw.js`).
- **Server-Edge:** kann **nicht** geleert werden (Prod). Deshalb **je Request die Response-Header erfassen** — `Cache-Status` / `Netlify-CDN-Cache-Control` / `age` → Durable-Edge-**HIT vs. Origin-MISS** unterscheiden. Warmer Edge (Warm-Cron) = HITs auch bei kaltem Client; das ist der Prod-Normalfall und muss so interpretiert werden.
- **Je Request protokollieren:** Methode, Status, **voller Pfad** (welche Route: `/_dwd_wind` T1 · `/_dwd_grib` T2/T2b · `/_dwd_opendata` Radar/EPS · Tiles · brightsky/meteoswiss · sonst), **Bytes** (komprimiert), **Dauer**, **Cache-Status-Header**, Initiator/zugehöriger Layer.

## §2 — Ablauf

1. **Bare Cold-Load** der Ziel-URL (Client-Cache geleert) → vollständiger Waterfall. Was lädt *ohne* Layer-Interaktion (Basemap, Wind-Default, Temp, Punkt-Vorhersage/Fusion inkl. EPS)?
2. **Pro Layer einzeln:** die tatsächlich in der UI schaltbaren Layer nacheinander **einzeln** aktivieren (Wind, Temperatur, Böen, Niederschlag/Nowcast, Wolken, Konfidenz, Regenradar, …) und den **Delta-Traffic** je Layer erfassen (Dateizahl, Bytes, Dauer, Route, HIT/MISS).
3. **Fusion/Punkt-Vorhersage** separat ausweisen (die EPS-icosahedral-Dateien + brightsky/meteoswiss).
4. **Klassifizieren & Auffälligkeiten:** Directory-Listings, Doppel-/Redundanz-Fetches, Origin-MISSes trotz Warm-Cron, langsamste Requests (Top-N nach Dauer), Edge-HIT-Quote je Route.

## §3 — Ergebnis (gemessen 2026-07-22, ~21:09–21:40 UTC, CLI via Chrome DevTools MCP)

**Setup-Protokoll (V-AUDIT 1):** frischer **isolierter Browser-Context** (eigene Storage-/HTTP-Cache-Partition = echter Erstbesucher); vor der Baseline verifiziert/geleert: IndexedDB **leer**, Cache-API **leer**, local/sessionStorage **leer**, **kein Service Worker registriert**. (Nachtrag: `/sw.js` registrierte sich im Laufe der Session selbst — Folgebesuche können dadurch abweichen.) Messleitung ~90 Mbit/s (~11 MB/s) — mobile Nutzer sind langsamer, absolute Zeiten sind Untergrenzen. Screenshot: `audit/screenshots/t-audit/baseline-cold-load.png`.

**Vorab-Befund UI:** Die Karte startet mit **0 aktiven Layern** (Command-Deck-Rail: Niederschlag · Flow-Nowcast · Regen-Chance · Schneegrenze · Wind · Böen · Temperatur · Wolken · Satellit · Blitze · Stationen · Sicherheit — 12 Toggles; das ist die maßgebliche Layer-Liste, nicht die Annahme aus §2).

### 3.1 Baseline-Waterfall (Bare Cold-Load der Ziel-URL, Seitenstart 21:09:14 UTC)

**215 Requests** bis zur Netz-Ruhe (~15 s; DOMContentLoaded 217 ms, `load` 218 ms — die Shell ist schnell, alles Weitere ist async Daten-Nachladen).

| Gruppe | Route | n | Bytes (komp.) | Zeitfenster | Cache-Status | Auffällig? |
|---|---|---|---|---|---|---|
| App-Shell + Assets | same-origin `/assets/` | 22 | 536 KB | 0–4 s | Netlify static | ok |
| Basemap | tiles.openfreemap.org | 25 | 2,10 MB | 0,7–2,0 s | extern | Style+Sprites+4 pbf+21 Font-pbf |
| **Terrain-DEM** | s3.amazonaws.com `elevation-tiles-prod/terrarium` | **94** | n. m. (kein TAO; Stichprobe 138 KB/Tile → grob 5–13 MB) | 0,6–5,6 s | S3, kein CDN-Header | größter Request-Block der Baseline; z7+z9-Kacheln |
| Punkt-Forecast | api.brightsky.dev (weather+alerts+20×current_weather-Grid) | 22 | 48 KB | 0,6–1,4 s | extern | ok, schnell (~40–130 ms) |
| Multi-Modell | api.open-meteo.com | 1 | 21 KB | 0,6 s | extern | ok |
| Gesundheit/UV | `/_dwd_opendata` uvi.json + s31fg.json | 2 | 19 KB | 0,6 s | fwd=miss | ok |
| Radar-Discovery | `/_dwd_opendata/weather/radar/composite/rv/` (Listing!) | 1 | **157,7 KB** | 281 ms | **fwd=miss** | Directory-Listing auf kritischem Pfad, ungecacht |
| Radar-Frame | `/_dwd_opendata/...RV….tar.bz2` | 1 | 521 KB | 127 ms | **fwd=miss** | ok schnell, aber nie CDN-gecacht |
| Manifest | `/latest-grib.json` | 1 | 298 B | 115 ms | **hit** (age 857) | **Inhalt = committeter localhost-Seed!** `warmedThroughProxy: http://localhost:5196/_dwd_grib`, 2D-Lauf **2026072215** (18z längst publiziert), `updatedAt 17:42Z`, `eps`-Sektion 18z |
| Temp-Invariante | `/_dwd_grib/...hsurf` | 1 | 662 KB | 1673 ms | **fwd=stale** | Function-Kaltstart + Live-Proxy |
| **Temp-Feld (ohne aktiven Layer!)** | `/_dwd_grib/.../15/t_2m/000–024` | **25** | **24,5 MB** | **8,3–11,0 s** | **25× fwd=stale** (0 Durable-HITs) | lädt eager für Stadt-Temp-Labels + Slider, obwohl Temperatur-Toggle AUS; Start erst **7,3 s nach** Manifest-Fetch (Client-Verzögerung); je Datei 97–661 ms |
| Länder-Umrisse, Fonts, Icons | div. | ~19 | ~0,6 MB | 0–2,3 s | — | ok |

**Summe Bare-Load:** 215 Requests, ~32 MB messbar (+ DEM-Tiles, geschätzt 5–13 MB), längster Request hsurf 1673 ms, **Edge-HIT-Quote auf `/_dwd_grib`: 0/26**. **Kein `/_dwd_wind`**- und **kein EPS-Traffic** im Bare-Load — Wind lädt erst mit Toggle, die EPS-Fusion erst mit einem Fusion-Konsumenten (s. 3.2/Temperatur); der Punkt-Forecast rechts speist sich aus brightsky/open-meteo („Quellen: DWD Stations-Obs · MOSMIX · dwd_uv · radolan_rv").

**2D-GRIB-Discovery: 0 Directory-Listings, 0 Fehl-Fetches** — das Manifest-Gate (T2) wirkt in Prod. ✓

### 3.2 Per-Layer-Delta (je Toggle einzeln AN, danach AUS; Client-Cache zwischen Layern bewusst NICHT geleert)

| Layer | Route(n) | Dateien | Bytes | Wall | HIT/MISS | Decode off-main? | Befund |
|---|---|---|---|---|---|---|---|
| Niederschlag | `/_dwd_grib` tot_prec + `/_dwd_opendata` rv + GeoSphere + MeteoSwiss | 40 | ~27,9 MB | ~9,2 s | tot_prec **28× fwd=stale** | ✓ (bz2-/gribGrid-/precipIndex-Worker) | tot_prec 15z **0–27 komplett** (26,2 MB; Dateien wachsen 237 KB→1,34 MB); + INCA-NetCDF 740 KB (**Rate-Limit 240/h, 5/s!**), CH-STAC 251 KB + rzc-h5 28 KB; rv-Listing ERNEUT (157,7 KB) + neuer Tar 516 KB |
| Flow-Nowcast | — | 0 | **0 B** | — | — | ✓ (nowcaster-Worker) | perfekter Warm-Reuse: rechnet aus dem bereits gecachten RV-Tar, null Netz |
| Regen-Chance | `/_dwd_opendata` rv + INCA/CH | ~34 | ~2,4 MB | ~3 s | fwd=miss | ✓ (flowEnsemble) | Radar-Stack-Refresh; **rv-Listing ×2 und rv-Tar 21:15 ×2 = Duplikat** (~1 MB Verschnitt); Messfenster überlappte mit dem 10-min-Refresh-Tick (brightsky-Grid+DEM darin enthalten) |
| Schneegrenze | same-origin | 2 | 86 KB | <1 s | static | ✓ | nur `climaGrid.json` 72 KB; reuset t_2m+hsurf aus Client-Cache |
| Wind | `/_dwd_wind` + `/latest-wind.json` | 32 | ~27,3 MB | ~7,4 s | **Edge-HIT** (Probe age 1539) | ✓ (windFrame-/windBlend-Worker) | Manifest 277 B → Lauf **2026072218** (aktuell!), u/v 0–12 = 26 Dateien; erste 10 ~1 s/Datei, dann 150–590 ms. T1 funktioniert end-to-end: Cron wärmt, Manifest kommt an, Edge liefert HITs |
| Böen | `/_dwd_grib` vmax_10m | 27 | ~27,2 MB | ~5,1 s | **25× fwd=stale** | ✓ | vmax 15z 0–24 (Step 0 nur 16 KB); erste 6 ~1 s, Rest 110–300 ms — alles Live-Proxy, weil 15z ungewärmt |
| Temperatur | **EPS via `/_dwd_grib`** + GeoSphere + MeteoSwiss + brightsky | **397** | **~194,6 MB** | **~17 s** | EPS **Edge-HIT** (age ~1624) | bz2 ✓; icosahedrales Resampling client-seitig (teuer) | **Der Toggle triggert die volle Fusion:** EPS-Listing 2× (`/_dwd_opendata`, 19 KB) → **17 EPS-Dateien = 191,98 MB** (t_2m/u/v/clct/tot_prec × 0/3/6 + clat/clon, 18z, 11,5–15,3 MB je Step-Datei, 12,3–15,0 s/Datei **bandbreitenlimitiert**); + GeoSphere NWP-/Nowcast-Timeseries (416 KB), 81 MeteoSwiss-Requests (1,40 MB), **288 brightsky-Requests** (0,75 MB, inkl. ~15–20 404s auf See-Gitterpunkten). 2D-t_2m: **0 neue Requests** (Cache-API-Reuse ✓) |
| Wolken | `/_dwd_grib` clcl/clcm/clch | **329** | ~23,7 MB | ~36,5 s | **39× fwd=stale** | ✓ | clcl+clcm+clch je 0–12 (39 Dateien, 21,4 MB; **kein** 2D-clct-Fetch); Ausreißer bis **21,2 s/Datei** (Browser-Queueing hinter dem parallel laufenden **zweiten kompletten brightsky-Sweep à 288 Requests** (2,27 MB)) |
| Satellit | maps.dwd.de WMS | 6 | ~0,42 MB | <1 s | extern | n/a (PNG) | GetCapabilities + 4 GetMap-Kacheln, 83–277 ms — unkritisch |
| Blitze | maps.dwd.de WMS | 6 | ~0,14 MB | <1 s | extern | n/a | GetCapabilities 111 KB + 4 GetMap ~23 KB — unkritisch |
| Stationen | brightsky + GeoSphere + data.geo.admin.ch | **162** | ~7,9 MB | ~4 s | extern | n/a | brightsky-Stations-Dump 5,28 MB (2 Req.), TAWES 114 KB, **158 MeteoSwiss-Einzel-CSVs** (2,44 MB) — Request-Zahl-Explosion CH-seitig |
| Sicherheit (≙ Konfidenz) | `/_dwd_grib` t_2m | 12 | ~9,7 MB | ~1,5 s | schnell (Edge inzwischen selbst-gewärmt) | ✓ | Lagged-Run-Vergleich: t_2m **15z** Steps 0/6/12/18/24 **erneut übers Netz** (~4,8 MB, obwohl identische URLs im Client-Cache-API liegen!) + t_2m **12z** Steps 3/9/15/21/27 (~4,9 MB, legitim neu) |
| Punkt-Vorhersage/Fusion (EPS) | s. o. | — | — | — | — | — | Bare-Load: **nur** brightsky (22 Req.) + open-meteo + uvi/s31fg, **kein EPS**; die EPS-Fusion (192 MB) feuert erst über einen Fusion-Konsumenten (gemessen: Temperatur-Toggle). Tabs „Diagramme"/„Tabelle": keine EPS-Neuladung (Reuse ✓), nur Refresh-Burst — darin erneut **rv-Tar 21:25 ×2** (Duplikat) |

Session-Gesamtverkehr des Audits (Baseline + alle Toggles + Sonden): **1320 Requests, ~354 MB** — davon EPS 195,9 MB (18 Req. inkl. Sonde), `/_dwd_grib` 2D 105,9 MB (129 Req.), `/_dwd_wind` 26,1 MB (26), brightsky **646 Requests** (8,1 MB), MeteoSwiss **247 Requests** (4,7 MB).

### 3.3 Top-Auffälligkeiten

**Langsamste Requests (Top 10):**
| # | Request | Route | Dauer | Bytes | Cache | Einordnung |
|---|---|---|---|---|---|---|
| 1 | clcm 15z/003 | `/_dwd_grib` | 21 151 ms | 556 KB | fwd=stale | Queueing hinter brightsky-Sweep + 38 Parallel-GRIBs (Wolken) |
| 2 | clcl 15z/004 | `/_dwd_grib` | 21 151 ms | 755 KB | fwd=stale | dito |
| 3 | clcl 15z/005 | `/_dwd_grib` | 18 941 ms | 752 KB | fwd=stale | dito |
| 4–10 | EPS u/v/t_2m/clct 18z (Steps 0/3/6) | `/_dwd_grib` (EPS) | 12 289–14 998 ms | 11,5–15,3 MB | **Edge-HIT** | reine Client-Bandbreite: 192 MB Burst ÷ ~11 MB/s Leitung |

(Baseline-Maximum war hsurf mit 1673 ms = Edge-Function-Kaltstart; alle anderen Einzeldateien < 1 s bei freier Leitung.)

**Origin-MISS trotz Warm-Cron — die zentrale Warm-Lücke:** ALLE 117 `/_dwd_grib`-2D-Dateien der Session (t_2m 25 + tot_prec 28 + vmax 25 + clc* 39, ≈ 100 MB) kamen als `cache-status: "Netlify Edge"; fwd=stale` (Live-Proxy). Ursache ist **nicht** der Warm-Cron und **nicht** der Proxy: Sonden belegen, dass der Cron um ~20:54–20:55 UTC lief und **18z** wärmte (2D-t_2m 18z: `hit`, age 1604 · EPS 18z: `hit`, age 1204–1628 · Wind 18z: `hit`, age 1539). Aber das ausgelieferte `latest-grib.json` ist der **committete localhost-Seed** (2D-Lauf 15z, `updatedAt 17:42Z`, `warmedThroughProxy: localhost:5196`) — der **Manifest-Advance erreicht Prod nicht** (Commit-back/Deploy-Kette), also fragen Clients exakt die Dateien an, die niemand gewärmt hat. Doppelschaden: alle 2D-Loads ungecacht **und** Datenstand einen vollen Zyklus alt (15z statt 18z; Wind nutzt parallel korrekt 18z → Laufinkonsistenz zwischen Layern).

**Directory-Listings auf dem kritischen Pfad:** `rv/`-Radar-Listing (157,7 KB, immer fwd=miss) ≥ 5× in der Session — je Radar-Resolve neu, teils doppelt (s. u.). EPS-Listing 2× (klein, 19 KB — per Design auf `/_dwd_opendata`). 2D-GRIB: **0** Listings (Manifest-Gate ✓).

**Doppel-/Redundanz-Fetches (Prod hat keinen StrictMode — alles echt):**
- **rv-Tar ×2 je Refresh-Burst** (21:15 ×2, 21:25 ×2; je ~510 KB) + rv-Listing ×2 — zwei Konsumenten resolven den Radar-Stand parallel, kein In-Flight-Sharing.
- **brightsky-Vollsweep (288 Requests) je Fusion-Konsument-Toggle** — 646 brightsky-Requests in einer Session, inkl. wiederholter 404s auf See-Gitterpunkten.
- **Sicherheit** lädt 5 t_2m-15z-Dateien erneut übers Netz, die als identische URLs bereits im Cache-API (`icon-d2-grib-decompressed-v1`) liegen — anderer Fetch-Pfad ohne `fetchDecompressedCached`.
- bz2Worker.js + bzip2.wasm werden je Worker-Instanz angefragt (4×; ab dem 2. aus dem HTTP-Cache — kosmetisch).

**T2b-Deploy-Status: DEPLOYT und wirksam. ✓** EPS-Byte-Fetches laufen über `/_dwd_grib` (17 Dateien, Edge-HITs), nur das Lauf-Discovery-Listing verbleibt per Design auf `/_dwd_opendata`; das deployte Bundle enthält die EPS-Proxy-Base. Die frühere 4–15-s-Baseline „je Datei am DWD-Origin" ist damit weg; die verbleibenden 12–15 s/Datei im Burst sind Client-Bandbreite (Einzeldatei frei: 13,5 MB in 1,5 s).

**Bisher nicht diskutierte Quellen (ehrlich gemeldet, keine Zuordnung erzwungen):** `s3.amazonaws.com/elevation-tiles-prod` (Terrain-DEM, 94 Tiles im Kaltload — drittgrößter Zeitblock der Baseline), `maps.dwd.de` GeoServer-WMS (Satellit + Blitze), `dataset.api.hub.geosphere.at` (INCA/NWP/TAWES; **beobachtetes Rate-Limit 240/h, 5/s**), `data.geo.admin.ch` (STAC + per-Station-CSVs), `api.open-meteo.com` (Multi-Modell), `/climaGrid.json` (Schneegrenze). Außerdem: `/sw.js` registrierte sich erst **nach** dem Load (Baseline lief ohne SW).

## §4 — Verbesserungs-Analyse (priorisiert nach Wirkung ÷ Aufwand, je mit Beleg aus §3)

1. **Prod-Manifest-Advance reparieren (T2/T2b-Betriebslücke — Jans Gate, kein Code-Thema).** Beleg §3.3: Cron wärmt 18z (HIT-Sonden), Clients folgen dem localhost-Seed auf 15z → 117/117 2D-Dateien fwd=stale ≈ 100 MB Live-Proxy-Traffic in einer Session + ein voller Zyklus Datenverzug + Laufinkonsistenz zu Wind (18z). Erwartung nach Fix: jeder 2D-Layer-Kaltload wird Edge-HIT (wie Wind, ~150–600 ms/Datei konstant), Datenstand aktuell. Aufwand: winzig (Commit-back-/Deploy-Kette des `warm-grib`-Bots prüfen — Branch-Protection-Kandidat wie bei T1; zur Not Manifest-Publikation am Git-Weg vorbei). **Wirksamster Einzelgriff des gesamten Audits.**
2. **Radar-Resolve koalieren (In-Flight-Sharing).** Beleg §3.2/3.3: rv-Listing ×2 + rv-Tar ×2 je Refresh-Burst (~1,2 MB + 2 Listings Verschnitt pro Tick). Ein geteiltes Promise pro (Produkt, Zeitstempel) — Muster `tempLoadingRef`/60-s-Promise-Cache existiert im Code bereits. Aufwand klein.
3. **„Sicherheit" auf den gecachten Decode-Pfad heben.** Beleg §3.2: 5× t_2m 15z (~4,8 MB) erneut übers Netz trotz identischer URLs im Cache-API. `fetchDecompressedCached` statt Direkt-Fetch für den Lagged-Run-Vergleich. Aufwand klein.
4. **brightsky-Sweep memoisieren + See-Punkte auslassen.** Beleg §3.2: 288 Requests pro Fusion-Toggle, 646/Session, wiederholte 404s auf denselben Gitterpunkten. Memo pro (Gitter, Modell-Lauf/10-min-Slot) im Client + statische Ozean-Maske für bekannte 404-Punkte. Aufwand klein–mittel, Wirkung: Request-Zahl ÷ ~3 der Gesamt-Session, weniger Mobile-Radio-Wakeups, Schonung des Fremd-APIs.
5. **MeteoSwiss-Einzel-CSVs bündeln/memoisieren.** Beleg §3.2: 158 Requests (Stationen) + 81 (Temperatur) als per-Station-CSVs. Memo pro 10-min-Slot; prüfen, ob der OGD-Bulk-Endpunkt eine Sammeldatei bietet. Aufwand klein–mittel.
6. **Near-Horizon-Staffelung für 2D-Vollhorizonte (First-Paint-Hebel).** Beleg §3.1/3.2: Baseline lädt t_2m 0–24 (24,5 MB) eager bei 0 aktiven Layern (Start zudem erst bei Sekunde 8,3); Niederschlag 0–27, Böen 0–24, Wolken 0–12×3 (36,5 s Wall). Slider-Startbild braucht Step 0(–6); Rest idle nachziehen (bekannter T2-7-/Staffelungs-Hebel). Aufwand mittel, Wirkung groß auf gefühlte Ladezeit, v. a. mobil.
7. **T2b-4: EPS-Vor-Resampling im Cron (der große Fusion-Hebel).** Beleg §3.2: Der Temperatur-Toggle zieht 191,98 MB EPS; die Edge liefert zwar HITs, aber 192 MB bleiben 192 MB — auf dieser Leitung 17 s, mobil Minuten, plus teurer icosahedraler Client-Decode. Ein vor-resampeltes kompaktes Artefakt (Spec §H.1 T2b-4, Output-**Äquivalenz** mit numerischem Zell-für-Zell-Beweis Pflicht) reduziert Bytes+Decode um Größenordnungen. Aufwand groß — aber der einzige Hebel, der die Fusion-Kaltlast wirklich bricht.
8. **Radar-Discovery ent-listen.** Beleg §3.1/3.3: 157,7-KB-Listing, fwd=miss, mehrfach pro Session. Ein `latest-radar`-Pointer (Manifest-Muster) oder kurzlebiger Edge-Cache. Radar liegt bewusst außerhalb T2 (§ „Explizit außerhalb") — als eigene Mini-Phase benennen. Aufwand klein–mittel.
9. **Terrain-DEM prüfen (Beobachtung, kein eigener Hebel).** 94 S3-Tiles im Kaltload (z7-Flächendeckung + z9); Drittanbieter ohne unsere Cache-Kontrolle. Ggf. maxzoom-/Kachelbedarf des Terrain-Sources prüfen. Niedrige Priorität.
10. **⛔ STOPP-VERMERK (nur benannt, nicht anfassen):** Das Fusion-Lade-**Timing** ist der Multiplikator hinter Hebel 7: Heute startet die volle EPS-Fusion als Nebeneffekt des **Temperatur-Toggles** (§3.2), während der Bare-Load bewusst ohne EPS auskommt. Ob/wann Fusion EPS lädt (Deferral, Entkopplung Temperatur↔EPS, On-Demand) ist eine **Fusion-Engine-Verhaltensänderung → STOPP & FRAGEN Jan**; hier ausdrücklich nicht vorgeschlagen, nur als Entscheidungsoption dokumentiert.

**Caveats der Messung:** (a) Server-Edge nicht leerbar — sie war **teilweise warm**: 18z-Dateien cron-gewärmt (HITs), 15z-Dateien ungewärmt (fwd=stale = der reale Client-Pfad heute); ein echter Erstbesucher auf kalter Edge läge über den gemessenen Zeiten. (b) Messleitung ~11 MB/s — mobile Realität langsamer, Bandbreiten-dominierte Werte (EPS!) skalieren entsprechend. (c) Zwei Messfenster (Regen-Chance, Diagramme-Tab) überlappten mit dem 10-min-Refresh-Tick — deren Deltas enthalten Refresh-Anteile (im Text markiert). (d) Dauerwerte enthalten Browser-Queueing (clc*-Ausreißer 19–21 s). (e) DEM-Bytes ohne Timing-Allow-Origin nicht messbar (Stichprobe hochgerechnet). (f) `/sw.js` registrierte sich während der Session — Folgebesuche haben ggf. SW-Cache-Verhalten, das hier nicht gemessen wurde.

## §5 — Harte Regeln
- Read-only Diagnose. Kein Code, kein Deploy, keine Settings-/Account-Aktion auf der Live-Site (nur navigieren + Layer togglen + Traffic lesen).
- Findings ausschließlich in dieses Dokument (§3/§4) + `checklist.md` GT-Audit + `context.md`.
- Fusion-Engine-Verhalten (Lade-Timing) nur **benennen**, nicht ändern.
