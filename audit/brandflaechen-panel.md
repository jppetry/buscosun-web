# audit/brandflaechen-panel.md — Diagnose BP0: Brandflächen als Polygone + linkes Panel

> **Phase BP0** (Analyse, kein Code). Auftrag Jan 2026-08-17: prüfen, wie sich das Brandflächen-
> Konzept (`prompt-brandflaechen-echtzeit.md`, Schwester `konzept-brandflaechen-modul.md`) in den
> bestehenden Brandradar integrieren lässt — Polygone auf der Karte, gesteuert über ein eigenes
> ausklappbares Panel links, unabhängig vom Hotspot-Layer — und einen Umsetzungsplan zu liefern.
> **Stand: 2026-08-17.** Alles, was hier „gemessen" heißt, wurde heute live (Node-`fetch`, ohne
> Schreibzugriff) oder aus den vorhandenen Diagnosen belegt; alles andere ist als Schätzung markiert.
> Gate für die Bauphasen: **GBP1** (§5).

---

## 0. Kurzfazit

**Geht — mit zwei Einschränkungen.**

1. **Panel + Polygone gehen sofort und rein clientseitig.** 80 % der Bausteine liegen im Bestand:
   Cluster (`fireClusters.ts`, BC1), Detektionsraster (`fireZones.ts`, BA3), EFFIS-Polygone
   (`euContext.ts`, E2), Abgleich „nie zwei Formen für ein Feuer" (`footprint/reconcile.ts`, BF3),
   7-Tage-Historie (`footprint/history.ts`, BF4), EMS-Abzeichen (`emsActivations.ts`, GWBA1).
   Was fehlt: eine **stabile Brand-ID über alle Quellen**, das **Panel links** und die
   **Hover/Select-Kopplung Karte ↔ Liste für Polygone**.
2. **Die eigene Sentinel-2-Detektion** (`konzept-brandflaechen-modul.md`, dNBR) ist **nur als Batch
   in GitHub Actions** machbar — der COG-Bucket sendet **kein CORS** (gemessen), je Ereignis sind 16
   Bandfenster mit 0,1–0,9 s Latenz zu lesen (gemessen 917 ms aus DE nach us-west-2), und die
   numerische Kette gehört nicht in den Browser. Sie berührt **drei STOPP-&-FRAGEN-Zonen** (neuer
   Cron, neuer Speicherweg, ggf. neue Bundle-Dependency). Vor Jans Entscheidung dazu keine Zeile.
3. **Nicht so wie im Auftrags-KONTEXT beschrieben:** im Repo gibt es **kein Cloudflare R2 und kein
   PMTiles** (`architecture.md` §14.2; `package.json`; Grep über `src/` findet nur einen lokalen
   Variablennamen). Der etablierte Batch→Client-Weg ist der Warm-Cron mit **Commit-back nach
   `public/`** (D-20). Empfehlung: den benutzen; ein neuer Speicher wäre eine Architekturänderung.
4. **Lizenz-Blocker nach den neuen Constraints:** **NASA FIRMS** (MAP_KEY + 5 000 Transaktionen/10 min)
   — die bestehende Primärquelle. Sie ist durch Jans ausdrückliche Freigabe vom 2026-08-14 gedeckt
   (`docs/DATA_SOURCES.md` §W.2.1); hebt die neue Regel diese Freigabe auf, fällt der Live-Zweig.
   Außerdem **Nominatim** (Usage Policy 1 req/s) für „nächster Ort" → nur ein statischer Gazetteer.
5. **Repo-Zustand (Befund, keine Bewertung):** `plan.md`, `checklist.md`, `context.md`,
   `mobile-design-guidelines.md` sind im Arbeitsverzeichnis **gelöscht** (HEAD-Stand 2026-07-30),
   `improvements.md`/`roadmap.md` existieren weder im Baum noch in Git, `src/fire/` ist komplett
   **uncommitted** (letzter Commit 2026-07-30). Die Gate-Protokolle GBF1/GBC1 sind damit weg. Diese
   Diagnose steht deshalb hier und fasst `CLAUDE.md`/`architecture.md` nur ergänzend an (§7 h).

---

## 1. Das Konzept in zehn Punkten

> `prompt-brandflaechen-echtzeit.md` ist der genannte Text. Der KONTEXT des Auftrags („Detektion",
> „PMTiles auf R2", „Batch-Jobs in GitHub Actions") beschreibt eher das Schwester-Dokument
> **`konzept-brandflaechen-modul.md`** (Sentinel-2-dNBR-Kartierung, Python, Objektspeicher). Beide
> sind Teile **eines** Footprint-Modells; ⚑ markiert, wo das Schwester-Dokument mehr oder anderes sagt.

| # | Punkt | Was das Dokument sagt | Befund / Annahme |
|---|---|---|---|
| 1 | **Inputs** | FIRMS VIIRS-375-m-NRT (3 Streams, 24 h) über die bestehende Edge Function; EFFIS-WFS `ms:modis.ba.poly.week/.season` mit `id, FIREDATE, LASTUPDATE, COUNTRY, PROVINCE, COMMUNE, AREA_HA`, 9 CORINE-Anteile, `PERCNA2K, CLASS` (heute gegengeprüft: genau diese 18 Properties) | ⚑ Modul: Sentinel-2 L2A (Earth Search STAC, Bänder B04/B06/B07/B08/B8A/B11/B12/SCL — Asset-Keys heute bestätigt: `red, rededge2, rededge3, nir, nir08, swir16, swir22, scl`), WorldCover, HRL Forest Type, VG250 |
| 2 | **Output Geometrie** | live: Alpha-Shape bzw. Puffer um Cluster; kartiert: EFFIS-Polygon 1:1; nie beide für einen Brand | BF0 hat Alpha-Shape verworfen (kein kalibrierbarer Faktor, zwei Deps); gebaut ist das **Pixelraster** (`fireZones.ts`) plus konvexe **Cluster-Hülle** (`fireClusters.ts`). ⚑ Modul: dNBR-Polygon **mit Löchern**, in UTM 5 m simplifiziert |
| 3 | **Output Attribute** | live: `estimated:true`, Pixelzahl, Satelliten, Überflüge, ΣFRP, bbox, first/last; kartiert: `confirmed:true`, `AREA_HA`, `LASTUPDATE`, Landbedeckung | ⚑ Modul: `area_gross/net/min/max`, Severity-Quantile, Provenienz (Szenen-IDs, Baseline, `separability`, `method_version`), Status-Automat `estimated → provisional → mapped → final / timeout` |
| 4 | **Räumliche Genauigkeit** | live ±375 m Pixel (Einzelpixel 13,7–59,3 ha, Median 19,9 ha, gemessen BF0); kartiert „~30 ha", real bis 0–1 ha (S2-Anteil) | Live-Fläche = **Obergrenze**, Median 10,3× kartierte Fläche (BF0 §2). ⚑ Modul: 20 m, Flächenfehler ±60–80 % bei 1 ha |
| 5 | **Zeitliche Genauigkeit** | live 0–24 h (Überflug-Takt, NRT-Latenz ~3 h); kartiert 1–4 d (gemessen Median 1,8 d); Historie 7 d über `FIREDATE` | ⚑ Modul: Median 3–5 d bis zum ersten belastbaren Polygon, Revisionen alle 6 h |
| 6 | **Kernregel** | Ersetzung statt Addition; „bestätigt" nur mit Quelle im Satz; keine ha-Zahl auf Schätzung | umgesetzt (BF3); Jan hat die ha-Zahl auf dem Raster **behalten** (2026-08-16, mit Obergrenzen-Hinweis) |
| 7 | **Industrie-Ausschluss** | soll neu gebaut werden | existiert (CLC-Maske 0 % FP, Persistenz 22 % FP → durch Überstimmungsregel 0 %); der „822-Pixel-Block" ist ein **Waldbrand** (Hohes Venn, EMSR920) — **nichts bauen** (BF0 §4) |
| 8 | **Zeitachse** | eigener Regler für die 7-Tage-Historie über `FIREDATE`, `LASTUPDATE` als Stempel | umgesetzt (BF4, `burntDay` im Hash) |
| 9 | **Verifikation** | `verify:fire-footprint`: stabil/ordnungsunabhängig, nie beide Formen, Achsen-Assertion, keine ha ohne EFFIS, Schwelle aus Daten | Verifier existiert (`scripts/verify-fire-footprint.mjs`, 229 Zeilen); Gate-Protokoll GBF1 lag in `checklist.md` (gelöscht) |
| 10 | **Fallen** | `maxfeatures` vor bbox (V-224), lat/lon-Achse, setData-Schleife (V-220), FIRMS-Transaktionen, 4,8-MB-Archiv, GWIS = FIRMS | alle im Code berücksichtigt (`wfsAxis.ts`, `LAST_SET_DATA`, Edge-Cache, `archive` nur auf Wunsch) |

**Unterspezifiziert (nicht geraten → §7):** (a) welches der beiden Dokumente „das Konzept" für
Phase 2 ist; (b) ob die Brand-ID **über Sitzungen hinweg** stabil sein muss (braucht Speicher);
(c) Vorrang der Geometrie, wenn EFFIS **und** eigene Kartierung dasselbe Feuer zeigen; (d) ob das Panel
die BC1-Liste **ersetzt** (Umgruppierung) oder daneben steht; (e) was „Konfidenz" in der Zeile meint
(FIRMS-Stufe vs. Bewertung aus `fireAssessment.ts`).

---

## 2. Analyse

### 2.1 Einhängepunkte im Code

| Baustein | Datei:Zeile | Was dort steht / was zu tun wäre |
|---|---|---|
| **Layer-Registry** | `src/fire/fireModel.ts:44-56` `FireLayerId` · `:76-84` `FIRE_LAYER_ORDER` (Permalink-Bits, **nur anhängen**) · `:96-119` `FIRE_Z_BAND` (`fireBurnt: 45`) · `:167-216` `FIRE_DECK_GROUPS` | Neuer Layer **`fireFootprints`**, **angehängt** als Bit 12, `FIRE_Z_BAND: 78` (über Wind 75, unter Hotspots 80 — Punkte bleiben klickbar), eigene Dock-Zeile in „Aktuelle Lage". Damit hängt er automatisch in der Sichtbarkeitsschleife (`FireMap.tsx:606-611`) und ist unabhängig von `fireHotspots`/`fireBurnt` schaltbar. `verify:fire-model` bekommt zwei Zusicherungen (Bit 12, Z-Band eindeutig) |
| **Layer → GL-Ids** | `src/fire/FireMap.tsx:98-142` `GL_LAYERS` · `:176-181` `BURNT_GL` · `installLayers` `:1171-1489` (Z-Ordnung über `sortByZBand`) · `SPECS` `:1204-1418` | Neue GL-Layer `fire-footprints-fill / -line / -hover-line / -sel-line`; Hervorhebung als **Filter auf eigenem Layer** (Muster `fire-clusters-sel-line` `:1323-1327`) |
| **State (Seite)** | `src/fire/FirePage.tsx:114-185` (alle `useState`) · `:158` `clusters` · `:162-165` `selectedCluster / focusNonce / readoutTab` · `:177` `shownClusters` · `:490` Leeren beim Fensterwechsel · `:497-530` `clusterList / focusCluster / selectFromMap` · `:753-800` `burntSplit / burntLookup / drawnBurntPolys / reconciled` | Panel-Zustand (`open`, Filter, Sortierung, `hoverFootprint`, `selectedFootprint`, `focusBbox`) kommt **hierher** (Permalink-Effekt und Geschwister `FireMap` sitzen hier). Die BC1-Auswahl wird **nicht** verallgemeinert (s. §3) |
| **State (Permalink)** | `src/fire/fireState.ts:39-58` `FireState` (additiv: `v`, `bb`, `bd`, `sm`) · `:84-140` encode/decode („Standard verlängert den Hash nicht") | neues optionales Feld `fp` (Panel offen) — nur schreiben, wenn abweichend; `verifyFireState` erweitern |
| **Panel-System** | Desktop `FirePage.tsx:1440-1465` `.fire-dock` (links, 240 px) · `:1467-1517` `.fire-center` · `:1519-1523` `.fire-readout` (rechts, 348 px; Tabs `layers`/`fires` `:1317-1336`) · mobil `:1525-1544` `BottomSheet` mit `dockContent(true)` + `readoutContent(true)` · CSS `fireDeck.css:120-129, 246, 348-350, 604-611` | Neues `<aside class="fire-fpanel">` als **absolutes Overlay am linken Rand von `.fire-center`** (Desktop) bzw. **drittes Tab-Segment** im Sheet (mobil) — §3 |
| **Legende** | Steckbriefe `src/fire/FireLayerCard.tsx:171-289` (`FIRE_LAYER_INFO`, `fireBurnt :232-262`, Landbedeckungsfarben `fireCorroboration.ts:72`) · Cluster-Legende inline `FirePage.tsx:1245-1259` (`CLUSTER_FRP_STOPS`) | Panel-Legende im Panel-Kopf: Zustandsfarben (aktiv / kein Signal / erloschen) + drei Geometrie-Signaturen (kartiert hart, Raster gestrichelt, Hülle weit gestrichelt) + bestehende Landbedeckungs-Swatches. Steckbrief `fireFootprints` in `FIRE_LAYER_INFO` |
| **Zeitsteuerung** | `src/fire/fireTime.ts:48-100` (`fireBurnt: instant`, `fireHotspots: window 24/168`) · Fenster-UI `FirePage.tsx:1024-1036` `windowSeg` · Historie `:1128-1149` (`burntDay`, `HISTORY_DAYS`) · Playback `firePlayback.ts` | **Kein neues Zeitmodell.** Detektionsseite folgt `time.windowH` (24 h/7 d), EFFIS-Seite `HISTORY_DAYS`/`burntDay`; das Panel nennt beide Fenster in der Kopfzeile. Saison-Flächen nur als Filter „ältere Kartierungen" |
| **Cluster-Modell / IDs** | `src/fire/fireClusters.ts:108-150` (`id = "<lat3>,<lon3>@<firstMs>"` — **nicht überflugstabil**) · `:225-282` `buildFireClusters` · `fireEvents.ts:84-114` (gleiche ID-Regel), `spatialClusters :134` | §2.4 |
| **Abgleich** | `src/fire/footprint/reconcile.ts:100-125` `reconcileZones()` (räumlich beidseitig, zeitlich ±14 d) | die **eine** Stelle, die Cluster ↔ Fläche verknüpft — um EMS/eigene Kartierung als weitere Stufen erweitern |
| **Karte: Klick/Hover** | `FireMap.tsx:662-767` (Reihenfolge: Hüllen-Auswahl → Hotspot-Popup → Flächen-Popup → Raster-Popup; `mousemove` nur Cursor) · Fokus-Zoom `:810-830` (`focusNonce`, `fitBounds` maxZoom 11) | Auswahlblock für `fire-footprints-fill` **an derselben Stelle wie der BC1-Block** (vor der Popup-Kette, ohne `return`, ohne Popup); Fokus-Effekt bekommt `focusBbox` und bevorzugt sie (eine Kamera-Logik); `fire-footprints-fill` in die `mousemove`-Liste `:763` |
| **Worker** | `fireEventsClient.ts` / `fireEventsWorker.ts` (`computeZonesAndClusters`, `computeFireClusters`) | Registry-Bau (§2.4) läuft im **selben** Worker-Aufruf — kein zweiter Thread, kein zweites Clustering (BC1-Lehre) |

### 2.2 Datenweg — Empfehlung

Zwei Wege, weil zwei Zeitskalen:

| Zweig | Weg | Warum | Laufzeit | Takt | Kosten |
|---|---|---|---|---|---|
| **Live-Footprints** (FIRMS-Cluster/Raster, EFFIS-Abgleich, EMS) | **clientseitig, wie heute** | rechnet auf Bytes, die die Karte ohnehin lädt (0 zusätzliche Requests); Worker gemessen 73–167 ms (`audit/waldbrand-brandzone.md`); Datenalter = Überflug | 0 | FIRMS-Edge-Cache 30 min, EFFIS-TTL 6 h | 0 € |
| **Kartierte Flächen EFFIS** | **clientseitig, wie heute** (WFS-GeoJSON) — heute gemessen: Saison **1 576 347 Byte unkomprimiert (kein `content-encoding`), 303 Features, 52 327 Stützpunkte, längster Ring 3 102, 966 ms** | CC BY 4.0, key-frei, CORS ok; `week ⊂ season` ⇒ ein Abruf | – | 6 h TTL | 0 € |
| **Eigene Detektion (S2-dNBR)** | **Batch in GitHub Actions → statisches GeoJSON in `public/fire/ba/` per Commit-back → Netlify** (Muster `.github/workflows/warm-wind.yml`, D-20) | COG-Bucket **ohne CORS** (gemessen: `206`, `accept-ranges: bytes`, **kein** `access-control-allow-origin`), 16 Bandfenster × 0,1–0,9 s Latenz, numpy-Kette — im Browser weder erlaubt noch bezahlbar | Konzept: ~5 min je 50 Ereignisse, < 400 MB Transfer | Konzept 6 h; realistisch **1×/Tag** (S2-Wiederkehr 2–3 d in DACH, Median-Latenz 3–5 d) | Repo ist **public** (GitHub-API 200) ⇒ Actions-Minuten kostenlos (Fair Use); ~15–40 min/Tag |

**Warum nicht R2/PMTiles:** (1) existiert im Repo nicht (`architecture.md` §14.2: „kein R2, kein
PMTiles, kein Netlify Blobs"); (2) ein neuer Speicherweg ist eine D-01/D-20-Architekturänderung ⇒
STOPP & FRAGEN; (3) R2 ist ein Freemium-Produkt (10 GB / 10 Mio Reads frei) — der Auftrag schließt
Freemium aus; (4) für DACH-Mengen (≈ 300 Kartierungen/Saison, ≈ 1 MB) reicht statisches GeoJSON auf
Netlify; (5) PMTiles bräuchte die `pmtiles`-Bibliothek im Bundle (≈ 10–15 kB gzip inkl. `fflate`,
**ungemessen**) ⇒ D-06 ⇒ STOPP & FRAGEN. Netlify liefert Range-Requests für statische Dateien, PMTiles
wäre also **später auch ohne R2** möglich — nur eben nicht nötig.

**Kosten der Commit-back-Variante:** jeder Commit löst einen Netlify-Build aus (~1–2 min); die
Warm-Crons tun das heute schon mehrfach täglich. Ein täglicher BA-Commit ist unerheblich. Die Watchlist
(Konzept §7 will sie **nicht** im Repo) → als `public/fire/ba/watchlist.json` (≈ 10–50 KB) **im Repo**;
Commit-Rauschen ist im Projekt akzeptiert (D-20). Netlify Blobs wäre ein neuer Weg ⇒ STOPP.

**Toolchain (Begründung + Größe, wie verlangt):** Das Modul-Konzept ist Python — rasterio ≈ 20 MB,
numpy ≈ 15 MB, scipy ≈ 35 MB, shapely ≈ 2 MB, pystac-client < 1 MB, **nur im Runner, nie im Bundle**,
Install ~30 s mit Cache. Node-Alternative: `geotiff.js` (dev-dep, ≈ 100 KB) plus handgeschriebene
Otsu/Label/Opening/Polygonisierung/UTM. **Empfehlung: Python im Runner** (Reife der Raster-Kette
schlägt Repo-Homogenität; null Bundle-Wirkung) — **Entscheidung Jans**, weil das Repo bisher kein
Python führt (§7 g).

### 2.3 Format: GeoJSON vs. Vektor-Tiles

- **Messung:** Saison-Korb 1,58 MB / 52 k Stützpunkte / 303 Features ⇒ `setData` unkritisch (geojson-vt
  im MapLibre-Worker). Archiv 4,83 MB / ~1 270 Features: die setData-Schleife kostete auf dem Desktop
  200–400 ms je Sekunde (V-220, gefixt). Daraus: **~3–5 MB unkomprimiert bzw. ~150 k Stützpunkte ist
  der Kipppunkt** für mobile Geräte (Faktor 2–3 gegenüber Desktop ⇒ Long Task > 200 ms beim ersten
  Parse).
- **Eigene BA-Ausgabe (Schätzung):** DACH ≈ 300–400 Kartierungen/Saison × 100–300 Stützpunkte (20 m,
  Löcher, `simplify(5 m)`) ≈ **0,8–1,5 MB/Saison** ⇒ GeoJSON reicht. Mehrjahres-Archiv ⇒ **eine Datei je
  Jahr**, lazy (heute schon das Muster `season` vs. `archive` nur auf Wunsch).
- **Vektor-Tiles erst ab** > ~10 k Polygonen oder wenn der Nutzer sie **alle auf einmal** braucht
  (Europa statt DACH). Dann PMTiles statisch auf Netlify (Range ok), Bibliothek ⇒ D-06-Entscheidung.
- **Simplification/Zoomstufen:** Quelle in UTM 5 m simplifiziert (Konzept §5.11); Client:
  `geojson`-Source mit `tolerance` 0,375 (Default) und `maxzoom: 14`; unter Zoom 8 statt Fläche eine
  **Bbox-/Zentroid-Marke** (1-ha-Polygone sind bei z 7 < 1 px); für EFFIS `buffer: 64` gegen
  Kachelnaht-Artefakte der Konturen. CC-BY-Pflicht: Vereinfachung ist eine Änderung ⇒ im Steckbrief
  nennen (`prompt-waldbrand-brandflaeche.md` §2.5).

### 2.4 Verknüpfung Hotspot ↔ Fläche: Brand-ID, Merge/Split, Zeitreihe

**Ist:** Cluster- und Ereignis-IDs sind `"<lat3>,<lon3>@<firstMs>"` — Schwerpunkt **und** Beginn
verschieben sich mit jedem Überflug (neue Pixel, gleitendes Fenster). Für React-Keys reicht das, für ein
Panel mit „Erstdetektion / letzte Detektion / Verlauf" nicht.

**Vorschlag (pur, `src/fire/footprint/fireRegistry.ts`, Verifier `verify:fire-registry`):**

1. **Anker-ID:** `fire:<detectionKey der ältesten Detektion im Cluster>`. Die älteste Detektion ist
   stabil, solange sie im Fenster liegt; ein neuer Überflug ändert nichts. Fällt sie aus dem Fenster,
   wandert der Anker auf die nächstälteste — `previousIds` wird mitgeführt, damit die Auswahl in der
   Liste nicht springt. `fireClusters.ts` liefert dafür additiv `anchorKey` (§4.1).
2. **Kartierte Flächen:** `effis:<id>` (Server-ID, stabil), `ems:<EMSRxxx/AOIyy>`, später
   `ba:<event_id>` (Watchlist-ID `de-2026-0817-001`, Konzept §2).
3. **Verknüpfung:** exakt der Abgleich aus `reconcileZones()` (räumlich beidseitig, ±14 d) — kein
   zweiter Algorithmus. Ein Record trägt `sources: {firms?, effis?, ems?, ba?}`; die **gezeichnete**
   Geometrie folgt dem Vorrang §2.6.
4. **Merge/Split innerhalb der Sitzung (ohne Speicher):** Union-Find-Ergebnis Lauf *n+1* gegen Lauf *n*
   per Überlappung der Detektionsmengen. Teilen sich zwei alte Cluster einen neuen ⇒ **Merge**, der neue
   erbt die ID des **älteren** (`mergedFrom`); zerfällt einer ⇒ **Split**, das Teilstück mit dem Anker
   behält die ID, die anderen bekommen neue mit `splitFrom`. Beides steht im Eintrag („zusammengewachsen
   aus 2 Detektionsgruppen"), nie still.
5. **Zeitreihe wachsender Flächen:** je Überflug ein Punkt `{atMs, pixels, upperBoundHa, frpSumMw}` —
   im Client nur **innerhalb des Fensters** (24 h/7 d) aus den `acqMs` je Detektion rekonstruierbar,
   ohne Zusatzabruf. **Über Sitzungen hinweg** braucht es einen Speicher — der einzige, der ohne
   Backend erlaubt ist, ist die BA-Watchlist im Repo (§2.2). Ehrlicher Text im Panel: „Verlauf innerhalb
   des Fensters".
6. **Status:** `aktiv` = letzte Detektion < 24 h **oder** offene EMS-Aktivierung; `kein Signal seit X`
   = Alter ≥ 24 h **und** mindestens ein verpasster Tagesüberflug (Überflugslücke ≠ erloschen — Wolken);
   `erloschen` **nur mit Quelle**: EFFIS `FINALDATE`, EMS `closed`, BA `fire_out`. Ohne Quelle heißt es
   „kein Signal seit X", nie „erloschen".

### 2.5 Attributschema je Brand

```ts
export interface FireRecord {
  id: string;                        // 'fire:<key>' | 'effis:<id>' | 'ems:<code/aoi>' | 'ba:<event_id>'
  previousIds: string[];             // Anker-Wanderung, Merge/Split-Herkunft
  country: 'DE' | 'AT' | 'CH' | 'outside' | null;   // null = Umrisse noch nicht geladen (BC1-Regel)
  centroid: [lon: number, lat: number];
  bbox: [w: number, s: number, e: number, n: number];
  geometry: { kind: 'effis' | 'ems' | 'ba' | 'raster' | 'hull'; ref: string };   // was gezeichnet wird (§2.6)
  status: { kind: 'active' | 'no-signal' | 'out'; sinceMs: number | null; source: string | null }; // 'out' nur mit source
  firstMs: number | null; lastMs: number | null;      // Detektion; bei reinen EFFIS-Flächen FIREDATE / null
  hotspots: number | null; overpasses: number | null; satellites: string[] | null;
  frpSumMw: number | null;           // Leistung, NIE Fläche
  confidence: {
    firms: { low: number; nominal: number; high: number } | null;
    assessment: 'confirmed' | 'plausible' | 'unconfirmed' | null; assessmentSource: string | null;
  };
  areaHa: { value: number | null; kind: 'mapped' | 'upper-bound' | 'ba-net' | null; source: string | null; min?: number; max?: number };
  method: ('viirs-cluster' | 'effis-rda' | 'ems-del' | 's2-dnbr')[];
  sources: { firms?: { anchorKey: string; count: number }; effis?: BurntPolygon; ems?: EmsActivation; ba?: BaRevision };
  place: { name: string | null; district: string | null; source: 'effis' | 'gazetteer' | null };  // null = nicht bestimmt, nie geraten
  landcover: { key: LandcoverKey; pct: number }[] | null;   // EFFIS-Anteile bzw. CLC-Maske (3×3) — Quelle nennen
  suspectedStatic: boolean;          // F2-Vorbehalt: ausgegraut, nie ausgeblendet
  history: { atMs: number; pixels: number; upperBoundHa: number | null; frpSumMw: number }[];  // nur im Fenster
}
```

**Was das Konzept liefert:** ID-Bausteine, first/last, Pixel, Satelliten, Überflüge, FRP, bbox,
`AREA_HA/LASTUPDATE/FIREDATE`, Landbedeckung (EFFIS), Konfidenz (FIRMS-Stufe). **Was fürs Panel fehlt:**
Ort + Kreis/Bezirk/Kanton (EFFIS `PROVINCE/COMMUNE` nur für kartierte Flächen; Cluster: nichts), Status
„erloschen" (nur mit EFFIS `FINALDATE`/EMS/BA), Verlauf über das Fenster hinaus, stabile ID.
**Kennzeichnung fehlender Werte:** `null` im Modell, „—" in der Zelle **mit Grund im `title`**
(„Umrisse noch nicht geladen" / „keine kartierte Fläche" / „Ort nicht bestimmt") — nie 0, nie leerer
String, nie ein geschätzter Ersatz. Konfidenz wird **aggregiert** („überwiegend nominal, 12 % high"),
nicht erfunden; im GWIS-Notbetrieb gibt es weder FRP noch Konfidenz ⇒ Leerzustand mit Grund (Präzedenz
`hotspotProvider === 'gwis'` im `clusterPanel`).

### 2.6 Abgrenzung zu EFFIS

- **Duplikat-Erkennung:** dieselbe Verknüpfung wie BF3 (`reconcileZones`: bbox-Grobfilter, Schwerpunkt-
  in-Fläche **und** Flächenstützpunkt-in-Zone, ±14 d). Live am 2026-08-16: 22 von 1 346 Zonen ersetzt.
- **Vorrang der gezeichneten Geometrie (Vorschlag, Produktentscheidung → §7 c):**
  `EMS-Delineation` (exakt, amtlich, selten) > `EFFIS RDA` (amtlich kartiert) > `BA eigene Kartierung
  mapped/final` > `BA provisional` > `Detektionsraster` > `Cluster-Hülle`. **Nie zwei zugleich** — die
  BF3-Zusicherung wird auf die neuen Stufen erweitert und im Verifier festgehalten.
- **Kennzeichnung:** die drei Bildsprachen bleiben (hart = kartiert/EMS, gestrichelt = Raster, weit
  gestrichelt = Hülle); die eigene BA-Kartierung kommt als **Doppelkontur mit Schraffur** und Chip
  „eigene Kartierung (Sentinel-2, dNBR) — nicht amtlich"; im Panel eine Spalte „Quelle" mit Chip je
  Methode. Das Wort **„bestätigt" fällt nur mit EFFIS oder EMS im Satz** — die eigene Kartierung ist es
  nicht.
- **Wo beide da sind:** die Detailansicht zeigt beide **als Zahlen nebeneinander** (EFFIS ha, BA ha
  min/max, IoU) — auf der Karte nur eine Fläche (Umschalter im Detail). Das ist zugleich das
  Validierungsinstrument aus Konzept §11.

### 2.7 Performance mobil (iPhone 12 Pro)

| Posten | Payload | Renderkosten | Beleg |
|---|---|---|---|
| EFFIS Saison | 1,58 MB (kein gzip vom Server) | Parse/geojson-vt ≈ 150–300 ms im MapLibre-Worker; Fill + Line für 303 Features trivial | gemessen (Größe); Desktop-Traces V-220 |
| Detektionsraster + Hülle | 150 KB (24 h) / 556 KB (7 d) in-memory | Bau 73–167 ms im Worker | `audit/waldbrand-brandzone.md` |
| BA-Polygone (Saison) | ≈ 1 MB (Schätzung) | wie EFFIS | – |
| Panel-Liste | DOM | 1 111 Zeilen = 253 ms Desktop (V-246) ⇒ **Deckel 50 + „n weitere"** | gemessen (BC1) |
| Hover-Highlight | 0 Byte | `setFilter` auf eigenem Line-Layer: nur Repaint, kein `setData` | Muster `fire-clusters-sel-line` |
| Highlight per `feature-state` | – | **vermeiden**: braucht `promoteId`, verliert sich beim Basiskarten-Wechsel | `setStyle` wirft eigene Layer weg |
| Bundle | Panel + Registry ≈ +8–12 kB gzip im Fire-Chunk (Schätzung) | Ratsche `budget.json` totalJs 926,1 kB | `npm run budget` nach Bau |

Regeln: kein `content-visibility` (V-246, war schlechter); Hover aus der Liste **gedrosselt** (rAF),
aus der Karte über `mousemove` nur bei offenem Panel; nichts davon > 50 ms auf dem Hauptthread;
Long Tasks am **Prod-Build** messen.

### 2.8 Lizenzcheck

| Quelle | Lizenz | Key | Limit | Freemium/Test | Urteil |
|---|---|---|---|---|---|
| NASA FIRMS Area API (VIIRS NRT) | NASA: „no restrictions" | **MAP_KEY** (Edge Function) | **5 000 Trans./10 min** | – | **BLOCKIERT nach Auftrags-Constraint** — bestehende ausdrückliche Freigabe Jan 2026-08-14 (§W.2.1); nicht umgehen; Frage §7 (f) |
| Copernicus GWIS/EFFIS WFS + WMS (FWI, `ba.poly.*`, VIIRS-Rückfall) | CC BY 4.0 | nein | keins dokumentiert | – | ✅ |
| Copernicus EMS Rapid Mapping (Aktivierungen; DEL-GeoJSON auf S3) | frei/offen, Attribution Pflicht | nein | – | – | ✅ (Format/CORS auf S3 unbelegt → L0-Sonde) |
| Sentinel-2 L2A via Earth Search STAC (Element84) + AWS-Open-Data-COGs | Copernicus Sentinel Legal Notice (frei, kommerziell, Attribution) | **nein** (gemessen: `POST /v1/search` 200, `access-control-allow-origin: *`) | Fair Use, kein Limit dokumentiert | – | ✅ für Batch · ❌ Client (COG ohne CORS, gemessen) |
| ESA WorldCover 10 m | CC BY 4.0 | nein | – | – | ✅ |
| Copernicus HRL Forest Type | CLMS frei/offen, Attribution | nein | – | – | ✅ |
| BKG VG250 (Kreise) | dl-de/by-2-0 | nein | – | – | ✅ |
| STATISTIK AUSTRIA Bezirksgrenzen | CC BY 4.0 | nein | – | – | ✅ |
| swisstopo swissBOUNDARIES3D | frei (opendata.swiss, Quellenangabe) | nein | – | – | ✅ |
| GeoNames (`cities1000`-Dump) | CC BY 4.0 | nein (Dump) | – | – | ✅ als statische Datei · ❌ Web-API (Konto + Limit) |
| Nominatim (public) | ODbL + **Usage Policy 1 req/s** | nein | **ja** | – | **BLOCKIERT** für Bulk/Panel; bestehende Einzelabfragen (Ortssuche) unberührt |
| CDSE / Sentinel Hub / openEO | Free-Tier 10 000 PU | Instance-ID/OAuth | ja | **Freemium** | **BLOCKIERT** (`prompt-waldbrand-brandflaeche.md` §6.1) |
| GitHub Actions (Infra) | – | – | öffentl. Repo unbegrenzt | – | ✅ (Repo ist public — gemessen) |
| Cloudflare R2 (Infra) | – | API-Token | Free-Tier | **Freemium** | ⚠ nicht nötig (§2.2); wenn doch: Jans Entscheidung |
| MoWaS/NINA, Alertswiss (NC), ORF, BOKU, WSL Swissfire | unklar / NC / geschlossen | – | – | – | **BLOCKIERT** — Deep-Link only (`CLAUDE.md`, Lehre 5) |

---

## 3. Panel-Spezifikation (Design-Vorschlag; mit einem zweiten Plan-Agenten gegengeprüft)

- **Ort/Toggle:** eigenes `<aside class="fire-fpanel">` als **Overlay am linken Kartenrand**, absolut
  in `.fire-center` (bereits `position:relative; overflow:hidden`; Muster `.fire-timedeck`) — **keine
  vierte Flex-Spalte**, aus drei Gründen: (a) `.fire-body`-Flex bleibt byte-gleich ⇒ keine
  Desktop-Regression; (b) eine Spalte ließe bei 1440 px nur 240 + 300 + 348 ⇒ **552 px Karte**;
  (c) jedes Auf-/Zuklappen einer Flex-Spalte ändert die Canvas-Breite ⇒ MapLibre `trackResize`
  reallokiert und stößt `onAdd` der Custom-Layer (Wind/Scalar) an — pro Klick. Overlay kostet null.
  Toggle: 44-px-Reiter an der Kartenkante („Brände ▸ 12") **und** eine Schaltzeile im `.fire-dock-head`.
  Panel offen ≠ Layer an: ist `fireHotspots` aus, sagt die Liste, dass ihr die Live-Detektionen fehlen;
  ist `fireBurnt` aus, dass die kartierten fehlen.
- **CSS (additiv, keine bestehende Regel anfassen):** `.fire-fpanel { position:absolute; left:0; top:0;
  bottom:96px; width:300px; z-index:3; overflow-y:auto; }` (`bottom:96px` hält Zeit-Deck und
  `maplibregl-ctrl-bottom-left` frei); 768–1439 px nur `width:264px`; ≤ 767 px kein Overlay, sondern
  **drittes Segment** in den bestehenden `fire-ro-tabs` (`'layers' | 'fires' | 'footprints'`) im Sheet
  aus derselben Bau-Funktion `footprintPanel(inSheet)`. Gotcha: Wechsel mobil → desktop setzt
  `readoutTab === 'footprints'` auf `'fires'` zurück, sonst ist das Readout leer. Tokens `--fp-*`.
- **State:** alles in `FirePage`; `FireFootprintPanel.tsx` rein präsentational (Props rein, Callbacks
  raus). Die BC1-Auswahl (`selectedCluster`, `selectFromMap`, `onSelectCluster`,
  `fire-clusters-sel-line`) wird **nicht** verallgemeinert — das zöge vier BC1-Pfade (Paging,
  `readoutTab`, scrollIntoView, Filter) mit; stattdessen parallel `selectedFootprint`/`hoverFootprint`
  **mit gegenseitigem Ausschluss in den Settern** (eine Auswahl nullt die andere; sonst zeigen zwei
  Hervorhebungen zwei Feuer). Der Fokus-Effekt (`FireMap.tsx:810-830`) bekommt `focusBbox` und
  bevorzugt sie — **eine** Kamera-Logik.
- **Karte:** GL-Layer `fire-footprints-fill / -line / -hover-line / -sel-line`; Hover/Auswahl per
  `setFilter` auf eigenen Layern; Hover in einem **eigenen Mini-Effekt** (`useEffect([hoverFootprintId])`
  mit `getLayer`-Guard), `applyState` setzt den Filter zusätzlich idempotent (übersteht den
  Basiskarten-Wechsel). Klickkette: neuer Auswahlblock **an derselben Stelle wie der BC1-Block** (vor
  der Popup-Kette, ohne `return`, ohne Popup; `onSelectFootprintRef` wie `onSelectClusterRef`).
  Hotspot-/Flächen-/Raster-Popups unverändert. `footprintFc` zwingend per `useMemo` (V-220); neue Props
  in die `applyState`-Abhängigkeiten (`FireMap.tsx:885`), sonst hinkt die Hervorhebung einen Tick.
- **Liste:** Deckel 50 (`CLUSTER_PAGE`) + „n weitere" (ausgesprochen, BC1-Muster); Sortierung Fläche |
  Aktualität | Status; Filter Mindestfläche (0/1/5/20 ha; Obergrenzen-Flächen mit Hinweis), Status,
  Land (DE/AT/CH; „außerhalb" bleibt zählbar); Zeitraum s. §2.1 „Zeitsteuerung".
- **Zeile:** Bezeichnung (Ort/Kreis, sonst Koordinate), Fläche mit Chip `kartiert` / `Obergrenze` /
  `eigene`, Erst-/Letztdetektion, Status-Punkt, Hotspots, Konfidenz aggregiert, Quellen-Chips,
  Landbedeckung (dominant), optional ΣFRP; F2-Vorbehalt als grauer Chip.
- **Interaktion:** Hover ⇒ Hover-Kontur; Klick Liste ⇒ Auswahl + `focusNonce`+1 + `focusBbox`
  (`fitBounds`, maxZoom 11) + Detailkarte **im Panel** (kein Popup); Kartenklick ⇒ Zeile markieren,
  Paging aufklappen, mobil Tab wechseln, **Karte bewegt sich nicht** (BC1-Regel).
- **Legende und Zustände:** Zustandsfarben (aktiv Terracotta, kein Signal Amber, erloschen Slate) +
  drei Geometrie-Signaturen + Landbedeckungs-Swatches. **leer:** „keine Brände im Fenster" nur, wenn
  beide Quellen geladen sind — sonst „Quelle X aus / nicht geladen"; **lädt:** „Detektionen da, Cluster
  werden gebildet …"; **veraltet:** `dataAgeText`, > 6 h FIRMS bzw. > 4 d EFFIS-`LASTUPDATE` ⇒ gelber
  Balken; ein Ausfall wird als **Ausfall** benannt, nie als Leerstand.
- **Dopplung zu BC1 (Risiko):** BC1 rankt nach ΣFRP, das Panel nach Fläche — dieselben Detektionen,
  andere Bezugsgröße. Bis Jans Entscheidung (§7 d) tragen beide Listen eine gegenseitige Fußnote.

---

## 4. Umsetzungsplan (Aufwand in Agent-Sitzungen à ~4 h)

Ein Thema = eine Phase = ein Gate; jede Stufe hat für sich Wert; die STOPP-Zonen liegen hinten.

| # | Phase | Inhalt | Aufwand | Risiken |
|---|---|---|---|---|
| 0 | **BP0 Doku** (diese Datei) | Diagnose, `CLAUDE.md`, `architecture.md` §14.7, Kickoff `prompt-brandflaechen-panel.md`, `docs/DATA_SOURCES.md` §W.10, `docs/API.md` §8.7 | 0,5 | keine |
| 1 | **BP1 Registry (pur)** | `src/fire/footprint/fireRegistry.ts`: `FireRecord`, Anker-ID, Merge/Split-Verfolgung, Status, Verlauf im Fenster; `reconcile.ts` um EMS-Stufe erweitern; Verifier `verify:fire-registry` (Fixtures: Überflug hinzu ⇒ ID stabil; Merge; Split; nie zwei Geometrien; „erloschen" nur mit Quelle) | 1,5 | ID-Wanderung am Fensterrand (Test); Worker-Laufzeit +20–40 ms (messen) |
| 2 | **BP2 Panel + Karte** | `fireModel.ts`: `fireFootprints` Bit 12 / Z 78 / Dock-Zeile; `FireFootprintPanel.tsx` + `--fp-*`; FirePage-State (open/filter/sort/`hoverFootprint`/`selectedFootprint`/`focusBbox`, `#wb=`-Feld `fp` standard-still); FireMap: vier GL-Layer, Auswahlblock, Hover-Effekt, `focusBbox`; mobil drittes Tab-Segment; Legende + drei Zustände | 2,5 | Desktop-Regression (Screenshot-Diff Pflicht); V-220; Long Task Liste (Deckel 50); Tab-Rückfall mobil → desktop |
| 3 | **BP3 Ort + Kreis** | `public/fire/places-dach.json` (GeoNames `cities1000` DACH-Auszug ≈ 100–150 KB, CC BY 4.0) + vereinfachte Kreis/Bezirk/Kanton-Polygone (VG250 / STATISTIK AUSTRIA / swissBOUNDARIES3D, 1:1 Mio, ≈ 250–400 KB); Build-Skript `scripts/build-places-dach.mjs`; lazy beim Öffnen des Panels; Nachschlag im Worker; Attribution in `scripts/seo/licenses.mjs` | 1,5 | Größe/Genauigkeit der Grenzen (Randorte) |
| 4 | **BP4 Gate GBP1** | fünf Selbstverifikationsfragen mit Beleg (Prod-Build), `typecheck`, `verify:*`, `budget`; MCP Desktop 1440×900 + iPhone 12 Pro; Fazit in `context.md` (falls wiederhergestellt) | 0,5 | Real-Device für Long Tasks |
| 5 | **BA-P1/P2 Prototyp** — *STOPP & FRAGEN vorher (Toolchain)* | Python unter `pipeline/ba/` gegen Gohrischheide 2025 + einen 2–5-ha-Brand, Szenen-IDs von Hand; Fixtures + Regressionswerte | 2 | BOA-Offset-Verifikation; „Lackmustest" 2 ha kann scheitern ⇒ Randverfeinerung vorziehen |
| 6 | **BA-P3/P4 Automatisierung** — *STOPP & FRAGEN (Cron + Speicherweg)* | Wolkencheck, AOI/STAC, Statusautomat, Watchlist + Revisionen nach `public/fire/ba/` per Commit-back-Cron (1×/Tag); Client-Quelle `sources/baFootprints.ts`; Vorrang §2.6; Verifier | 3 | Netlify-Builds je Commit; Watchlist im Repo; Latenz 3–5 d ehrlich kommunizieren |
| 7 | **BA-P5 Qualität** | AFD-S2, Randverfeinerung, WorldCover/HRL-Aufschlüsselung, IoU gegen EFFIS im Panel-Detail | 2 | Kalibrierung ohne DACH-Referenz (Konzept §13) |

**Summe Phase 2 (BP1–BP4): ≈ 6 Sitzungen. BA-Linie: ≈ 7 zusätzlich, nur nach Freigaben.**

### 4.1 Was nicht angefasst wird
Hotspot-Pipeline (`firmsHotspots.ts`, `netlify/edge-functions/firms.ts`), FWI-Layer (`gwisFwi.ts`,
`dangerViews.ts`), Fusion, `MapView`, Warm-Crons. Einzige begründete Änderung an Bestehendem:
`fireClusters.ts` bekommt additiv `anchorKey` (älteste Detektion), damit die Registry keinen zweiten
Cluster-Lauf braucht (BC1-Lehre: **ein** Clustering im Projekt).

---

## 5. Verifikation (Gate GBP1, vorab festgelegt)

- `npm run typecheck` · `verify:fire-model` (Bit 12, Z-Band eindeutig) · `verify:fire-footprint` ·
  **neu** `verify:fire-registry` · `verify:fire-model` deckt `verifyFireState` (Feld `fp`) mit ab ·
  `npm run build && npm run budget`.
- MCP: Desktop 1440×900 (Panel offen/zu, Hover, Klick Liste → Karte → Liste, Filter, Basiskarten-
  Wechsel mit offener Auswahl), 1024 px, iPhone 12 Pro 390×844 (Sheet-Segment, Touch ≥ 44 px);
  Konsole sauber; Long Tasks am Prod-Build.
- Funktionserhalt einzeln: BC1-Liste (Rang nach Stärke, Deckel, F2-Chip), Flächen-Popup, Raster-Popup,
  Historie-Regler, Zeitkörbe, alte Permalinks (`#wb=` ohne `fp`) öffnen identisch.

---

## 6. Doku-Änderungen dieser Phase (BP0)

1. **neu** diese Datei.
2. `CLAUDE.md`: Zeile in der Doku-Landkarte; Statusblock (nächste Phase BP1–BP4, BA-Linie wartet auf
   Freigaben; Hinweis auf die gelöschten Prozessdateien).
3. `architecture.md` §14.7 „Footprint-Modell + Panel" (drei Quellen, Vorrang, Datenweg, ausdrücklich
   „kein R2/PMTiles — Commit-back-Weg").
4. **neu** `prompt-brandflaechen-panel.md` — englischer Kickoff für BP1–BP4 (Muster `prompt-zellbahnen-v2.md`).
5. `docs/DATA_SOURCES.md` §W.10 (Lizenztabelle §2.8, neue Zeilen) · `docs/API.md` §8.7 (Earth Search
   STAC + COG-Bucket, gemessen).
6. `improvements.md` wird **nicht** neu angelegt (Datei fehlt, laufende Nummer unbekannt) — die
   V-Kandidaten stehen in §8 und werden nachgetragen, sobald die Datei wieder existiert.

---

## 7. Offene Fragen an Jan

- **(a)** Welches Dokument ist „das Konzept" für Phase 2 — `prompt-brandflaechen-echtzeit.md` (live,
  weitgehend gebaut) oder `konzept-brandflaechen-modul.md` (Sentinel-2-Batch)? Der Plan macht BP1–BP4
  zuerst (sofortiger Wert, keine STOPP-Zone) und BA danach — richtig so?
- **(b)** Stabile Brand-ID **über Sitzungen hinweg** geht nur mit BA-Watchlist im Repo. Reicht „stabil
  innerhalb der Sitzung/des Fensters" für den Anfang?
- **(c)** Vorrang der Geometrie bei EFFIS ∧ eigene Kartierung: EFFIS gewinnt (amtlich) — einverstanden?
- **(d)** BC1-Liste rechts wird zum Inhalt des neuen linken Panels (Umgruppierung, nichts fällt weg) —
  oder beide behalten (Risiko: zwei Listen, zwei Wahrheiten)?
- **(e)** „Konfidenz" in der Zeile: FIRMS-Stufe (l/n/h) oder Bewertung bestätigt/plausibel/unbestätigt
  aus `fireAssessment.ts` — oder beides?
- **(f)** FIRMS unter der neuen Constraint (Key + Limit): bleibt die Freigabe vom 2026-08-14?
- **(g)** BA-Linie: Python im Runner (empfohlen) oder Node? Commit-back nach `public/` (empfohlen) oder
  doch Objektspeicher? Beides STOPP-Zonen — bitte entscheiden, bevor BA-P1 startet.
- **(h)** Gelöschte Prozessdateien (`plan.md`, `checklist.md`, `context.md`, `mobile-design-guidelines.md`),
  fehlende `improvements.md`/`roadmap.md`, `src/fire/` uncommitted seit 2026-07-30: Absicht? Aus dem
  HEAD-Stand (2026-07-30) wiederherstellen (verliert die Fire-Gates GBF1/GBC1) oder neu anlegen?

---

## 8. Verbesserungs-Kandidaten (D-28; Nummern folgen, sobald `improvements.md` wieder existiert)

| Kandidat | Mehrwert für Jan | Umsetzungsskizze |
|---|---|---|
| **Cluster-/Ereignis-ID überflugstabil** (`anchorKey`) | Auswahl und Permalink auf einen Brand überleben den nächsten Überflug; Voraussetzung für jede Liste mit „seit wann" | additives Feld in `buildFireClusters`/`buildFireEvents`; Verifier: Überflug hinzu ⇒ ID gleich |
| **EFFIS-Saison ohne `content-encoding`** (1,58 MB roh) | ~1,2 MB weniger je Sitzung mit `fireBurnt`; auf Mobil spürbar | wie V-226 (Archiv): komprimierender Proxy = Transportzone ⇒ nur mit Freigabe; bis dahin lazy + TTL 6 h (Bestand) |
| **`fireWeather` ohne Lizenzträger** | die DWD-Zeile fehlt in der Attributionsleiste, wenn nur der Treiber an ist (bekannte Lücke, `FireMap.tsx` ATTRIB_CARRIERS-Kommentar) | dritten Eintrag in `ATTRIB_CARRIERS` (2 Zeilen), Verifier gegen die Leiste |
| **Statischer DACH-Gazetteer + Kreisgrenzen** | „nächster Ort / Kreis" ohne Fremd-API und ohne Rate-Limit — auch für Zellbahnen, Hagel, Warnungen wiederverwendbar | BP3; Datei unter `public/`, Nachschlag im Worker |
| **Prozessdateien in Git** | Gate-Protokolle sind heute nur im Arbeitsverzeichnis — ein `rm` löscht 17 Tage Belege | Commit-Disziplin nach jedem Gate (CONTRIBUTING); ggf. Pre-Push-Check, dass `checklist.md` existiert |

---

## Belege

- Live-Messungen 2026-08-17 (Node 22, `fetch`, ohne Schreibzugriff): EFFIS `ms:modis.ba.poly.season`
  (Größe/Features/Stützpunkte/Properties/`AREA_HA` min 0 · Median 5 · max 2 825 ha); Earth Search
  `POST /v1/search` (`sentinel-2-c1-l2a`, Punkt 6,089 E / 50,526 N, 10.–17.08.: 2 Items, darunter
  `S2C_T31UGS_20260814T104037_L2A` mit 0,1 % Wolken, Baseline 05.12); COG `SCL.tif` Range-Read
  (`206`, `accept-ranges: bytes`, kein ACAO, 917 ms); GitHub-API `repos/jppetry/buscosun-web` → 200
  (public).
- Bestandscode: `src/fire/FirePage.tsx`, `FireMap.tsx`, `fireModel.ts`, `fireState.ts`, `fireTime.ts`,
  `fireClusters.ts`, `fireEvents.ts`, `fireZones.ts`, `footprint/reconcile.ts`, `footprint/history.ts`,
  `sources/euContext.ts`, `sources/firmsHotspots.ts`, `FireLayerCard.tsx`, `fireDeck.css`, `budget.json`.
- Diagnosen: `audit/brandflaechen-echtzeit.md` (BF0), `audit/waldbrand-cluster.md` (BC1),
  `audit/waldbrand-brandzone.md` (BA3), `audit/waldbrand-effis.md` (E0–E3),
  `prompt-waldbrand-brandflaeche.md` (Quellenrecherche), `konzept-brandflaechen-modul.md`.

---

## 9. Gate GBP1 — Umsetzung BP1–BP4 (2026-08-17)

**Was gebaut wurde (alles uncommitted, wie der Rest von `src/fire/`):**

| Phase | Dateien | Verifikation |
|---|---|---|
| **BP1** Registry | `src/fire/footprint/fireRegistry.ts` (neu, 900 Zeilen inkl. Selbstverifikation) · `src/fire/fireClusters.ts` (additiv: `anchorKey`, `overpasses`, `satellites`, `confidence`, `passes`) · `scripts/verify-fire-registry.mjs` (neu) · `package.json` (`verify:fire-registry`) | `verify:fire-registry` **74/74**, `verify:fire-clusters` 103/103 (BC1-Bestand unverändert grün) |
| **BP2** Panel + Karte | `src/fire/fireModel.ts` (`fireFootprints` Bit 12, Z 78, Dock-Zeile) · `fireTime.ts` (window 24/168) · `fireState.ts` (Feld `fp`, standard-still) · `fireIcons.tsx` · `FireLayerCard.tsx` (Steckbrief + Legende) · `FireMap.tsx` (Quelle `fire-footprints`, vier GL-Layer, Auswahlblock vor der Popup-Kette, Hover-Mini-Effekt, `focusBbox`) · **neu** `FireFootprintPanel.tsx` · `FirePage.tsx` (State, Registry-Memo, `carryIds`, Vertretung `mapZones`, Overlay + Reiter, drittes Sheet-Segment) · `fireDeck.css` (nur additive Regeln, `--fp-*`) | `verify:fire-model` 100/100 (Bit 12, Z-Band, Dock-Position), `verify:fire-time` 75/75, `verify:fire-footprint` 73/73 (Assertion auf `mapZones` angepasst), typecheck grün |
| **BP3** Ort + Kreis | `scripts/build-places-dach.mjs` (neu; GeoNames-Dumps DE/AT/CH, eigener Zip-Leser) · `public/fire/places-dach.json` (7 547 Orte ab 1 500 Ew. ohne Stadtteile, 640 Verwaltungseinheiten, 323 KB / ~125 KB gzip, Stand GeoNames 2026-08-12) · `src/fire/footprint/places.ts` (neu, Gitter-Suche, lazy) · `scripts/seo/licenses.mjs` (GeoNames CC BY 4.0) | `[places]`-Sonden in `verify:fire-registry` (Berlin gefunden, „Wien" statt „Vienna", 2 000 Nachschläge < 100 ms, Nordsee ⇒ null), `verify:official-sources` 44/44, `verify:seo` 63 ok |

**Abweichungen vom Plan (§4), jede begründet:**
1. **Merge gleicher Kartierung** (neu, aus den Live-Daten): drei Cluster mit je einer Detektion lagen in derselben EFFIS-Fläche (Hohes Venn, 2 825 ha) ⇒ drei Einträge „2 825 ha kartiert". Die Registry verschmilzt Cluster mit derselben vertretenden Fläche jetzt zu **einem** Eintrag (`mergeClusters`, Anker = ältester, andere Anker als `previousIds`); `assertRegistry` verlangt „eine kartierte Fläche vertritt höchstens einen Eintrag". Live danach: 65 → 63 Einträge.
2. **Detektionsabruf** läuft, sobald `fireHotspots` **oder** `fireFootprints` an ist (sonst hätte der Layer „unabhängig schaltbar" nur EFFIS-Einträge). Ladezustand steht an beiden Dock-Zeilen; ist nur `fireFootprints` an, trägt seine Zeile den Fensterschalter 24 h / 7 d.
3. **Vertretung statt Dopplung auf der Karte**: Zonen, die die Registry mit einer EFFIS-Fläche vertritt, fallen aus dem Raster (`mapZones`), sobald der Registry-Layer an ist — sonst lägen Raster (Abgleich gegen gezeichnete Flächen) und Registry-Fläche (Abgleich gegen alle geladenen) übereinander. `verify:fire-footprint` prüft, dass `mapZones` eine Teilmenge von `reconciled.estimated` ist.
4. **BC1-Tab heißt jetzt „Cluster"** (vorher „Brände"), damit nicht zwei Dinge „Brände" heißen; Inhalt, Sortierung, Deckel, Chip — unverändert. Beide Listen tragen die gegenseitige Fußnote (§3). Mobil ist „Brände" das dritte Segment.
5. **Ohne aktive Quelle keine Liste** im Panel — nur der Kasten mit Grund und dem Knopf „Brandflächen einschalten"; die Zeilen von eben neben dem Kasten läsen sich wie eine Behauptung.
6. **Ortsverzeichnis ohne Abbruch-Signal** geladen (`loadPlaces()`): der geteilte Cache darf nicht am ersten Aufrufer hängen — Reacts doppelte Dev-Effekte hatten den Cache mit einem verworfenen Promise zurückgelassen (Zeilen blieben ohne Ort).
7. **Kein `verify:fire-state`-Skript** — `verifyFireState` läuft wie bisher in `verify:fire-model` mit (dort 100/100 inkl. `fp`).

**Live-Befunde 2026-08-17 (Dev, 24-h-Fenster):** 132 Detektionen, 49 Cluster, 63 Einträge (davon 16 nur kartiert); Hohes Venn 3 Hotspots + EFFIS 2 825 ha, EMSR920 offen ⇒ „aktiv · Copernicus EMS EMSR920 (offen)"; Duisburg/Salzgitter/Linz als „ortsfest" grau mit Obergrenze („bis 130 ha"); 7-Tage-Fenster 983 Einträge (Deckel 50 + „13 weitere" ausgesprochen).

**Die fünf Selbstverifikationsfragen:**

| # | Frage | Beleg |
|---|---|---|
| 1 | **Funktionserhalt einzeln** | BC1-Liste: Rang nach ΣFRP, Deckel 50, Chip „ortsfest", Klick ⇒ Karte fährt hin (geprüft: `fire-clusters-sel-line`-Filter gesetzt, Zoom 11, Registry-Auswahl dabei genullt) · Flächen-Popup / Raster-Popup / Hotspot-Steckbrief: Klickkette unverändert (Auswahlblock ohne `return`, vor der Kette) · Historie-Regler, Zeitkörbe, Basiskarten-Wechsel (Auswahl überlebt `setStyle`: Filter identisch vor/nach) · alte Permalinks ohne `fp` öffnen mit geschlossenem Panel (`verifyFireState`) · alle 13 Fire-Verifier + `official-sources` + `seo` grün |
| 2 | **Desktop pixelgleich** (Bestand) | Panel zu: einzig neu ist der 44-px-Reiter am linken Kartenrand und die Dock-Zeile „Brandflächen (Übersicht)"; `.fire-body`/`.fire-dock`/`.fire-readout` unangetastet (nur additive CSS-Regeln, Grep: keine bestehende Regel geändert) — `audit/screenshots/brandflaechen-panel/desktop-1440-panel-closed-tab.png`, `…-panel-open.png`, `…-selected-detail.png` |
| 3 | **Touch-Targets ≥ 44 px** | iPhone 12 Pro 390×844: alle Buttons im Sheet-Segment gemessen ≥ 44 px (`under44: 0`), Chips 44 px, Zeilen 112 px — `mobile-390-sheet-braende.png` |
| 4 | **Konsole sauber** | Dev und Prod-Preview: keine neuen Fehler/Warnungen; einzig die vorbestehenden 15× 404 (auch mit Layer aus, Baseline geprüft). Der einmalige `RangeError` (rekursives `setDetLoad`) war ein Fehler dieser Session und ist behoben |
| 5 | **Keine Long Tasks > 200 ms** (Prod-Build, `vite preview`, PerformanceObserver `longtask`) | Laden: max 172 ms (Baseline-Bereich, 7-Tage-Klassifikation) · Panel öffnen + Zeile klicken + Fenster 24 h → 7 d (983 Einträge): max **130 ms** · `npm run budget`: totalJs 898 KB (Grenze 926,1), eagerJs 124 KB (130,2), größter Chunk 278,4 KB — alle Budgets eingehalten |

**Offen / nächste Schritte:** BA-Linie (Sentinel-2-Batch) weiter gesperrt bis zu Jans drei Entscheidungen (§7 g); `context.md`/`checklist.md` existieren nicht (§7 h) — dieses Gate-Protokoll steht deshalb hier; V-Kandidaten §8 unverändert plus **neu**: „Cluster in einer Kartierung verschmelzen" (umgesetzt, s. o.) und „Vertretung der Raster durch Registry-Flächen" (umgesetzt).


## 10. Nachtrag 2026-08-19 — „wann wurde dieser Brand zuletzt detektiert?"

**Anlass (Jan, im Betrieb gefragt):** Die Zeile eines Brands sagte nicht, WANN er
zuletzt gesehen wurde — nur, wie alt das ist. Im 7-Tage-Fenster ist das zu wenig.

**Befund (am Code, nicht geraten).** Drei getrennte Mängel:

1. **`statusLabel` nannte nur das Alter** („aktiv · letzte Detektion vor 12 h").
   Der Zeitpunkt fehlte — obwohl die Cluster-Liste ihn seit BC1 führt
   (`lastSeenLabel`). Zwei Listen über dieselben Brände, zwei Zeitsprachen.
2. **`status.sinceMs` ist nicht immer eine Detektion.** `statusOf` füllt das Feld
   je nach Fall mit der letzten Detektion, mit EFFIS `FINALDATE` **oder mit dem
   EFFIS-Branddatum**. Die alte Zeile „kein Signal seit vor 5 T 2 h" beschriftete
   damit bei kartierten Einträgen ohne Überflug ein **fremdes** Datum als wäre es
   ein Signal — genau die Sorte stiller Falschaussage, die §0 verbietet.
3. **Zwei Zustände sagten gar nichts:** ein Eintrag, der nur wegen einer offenen
   EMS-Aktivierung „aktiv" ist, und ein „erloschen"-Eintrag trugen keinen
   Detektionsbezug. Live sichtbar an Amaro · Udine: „aktiv · Copernicus EMS
   EMSR924 (offen)" bei **null** Detektionen im 24-h-Fenster.

**Umsetzung (additiv, eine Quelle).**

- `src/dataAge.ts` → **`stampLabel(atMs, nowMs)`**: heute nur die Uhrzeit, sonst
  Datum + Uhrzeit. Die Grenze ist der **Kalendertag**, keine Stundenschwelle —
  „03:43" liest sich sonst wie heute Nacht.
- `fireRegistry.ts` → **`lastDetectionLabel(r, nowMs)`** liest **`r.lastMs`**,
  nie `status.sinceMs`. Ohne Detektion: „keine Detektion im Fenster".
  `statusLabel` hängt die Zeile an **jeden** der drei Zustände; bei einem
  kartierten Eintrag ohne Überflug wird das Branddatum getrennt als
  „EFFIS-Brandbeginn …" benannt, statt als Detektion durchzugehen.
- `fireClusters.ts` → `lastSeenLabel` nutzt dasselbe `stampLabel`. **Eine**
  Zeitsprache in beiden Listen.
- `fireDeck.css` → `.fire-crow-meta` darf **zwei** Zeilen hoch werden. Grund
  gemessen, nicht vermutet: mit dem Datum passte „· vor 2 T 1 h" nicht mehr in
  eine Zeile, und ausgerechnet das Alter fiel der Ellipse zum Opfer (Beleg:
  `rows7d-shot.png` vor / `rows7db-shot.png` nach). Das ist eine **bewusste**
  Desktop-Änderung an genau dieser Zeile, keine Regression an anderer Stelle;
  im Sheet (≤ 767 px) wird der Zwei-Zeilen-Deckel aufgehoben, dort ist die
  Spalte schmaler.

**Lehre für alles Weitere:** ein Zeitfeld, das je nach Zustand etwas anderes
bedeutet (`status.sinceMs`), darf nie mit einer festen Beschriftung gerendert
werden. Entweder die Beschriftung folgt dem Zustand — oder man liest das Feld,
das immer dasselbe bedeutet (`lastMs`). Hier wurde Letzteres gewählt.

**Belege.** `npm run typecheck` grün · `verify:fire-registry` **79/79** (+5 neue
Sätze: Zeitpunkt bei „aktiv", Datum bei älteren Detektionen, nur Uhrzeit bei
heutigen, EFFIS-Eintrag ohne Detektion, „erloschen" mit Detektionsbezug) ·
`verify:fire-clusters` **106/106** (+1: Datum ab dem Vortag) · `fire-model`
123/123 · `fire-time` 127/127 · `fire-firms` 92/92 · `fire-activity` 171/171 ·
`npm run build && npm run budget`: totalJs **914,5 / 926,1 KB** (+0,4 KB) ·
Browser-Smoke Desktop 1440×900 und Mobil 390×844 (DPR 3) am Dev-Server, 24-h-
und 7-Tage-Fenster, Konsole ohne Fehler; Sheet-Zeilen 85–130 px hoch (≥ 44 px).

**Gelesen wird jetzt z. B.:**
`aktiv · Copernicus EMS EMSR924 (offen) · letzte Detektion 17.08., 15:04 · vor 2 T 1 h · abklingend · 203 Hotspots`


## 11. Phase BP5 — Brände und Cluster zu EINER Liste (Diagnose + Plan, 2026-08-19)

**Auftrag (Jan):** „Brände · je Brand" und die Cluster-Ansicht rechts verschmelzen.
Die Brand-Liste führt, die **Leistungsangaben der Cluster kommen hinzu**, und das
Ergebnis steht dort, wo bisher die Cluster-Liste stand: **rechts im Readout**.

### 11.1 Warum das überhaupt zwei Listen waren

Nicht aus Versehen, sondern weil sie **verschiedene Bezugsgrößen** zählen — der
Hinweistext im Readout sagt das heute selbst: die Registry führt einen Eintrag
**je Brand**, das Clustering eine Zeile **je Detektionsgruppe**. Der Unterschied
ist messbar und lag live bei 871 Bränden gegen 867 Cluster:

1. **Verschmelzung:** mehrere Cluster in EINER EFFIS-Kartierung sind EIN Brand
   (`buildFireRegistry`, `units`) — der Grund, aus dem BP1 die Registry überhaupt
   bekam (Hohes Venn, drei Zeilen „2 825 ha").
2. **Kartierungen ohne Detektion** haben gar keinen Cluster (`effis:`-Einträge).

Ein Merge darf diese beiden Tatsachen nicht einebnen. Er ist trotzdem möglich,
**weil die Registry den Cluster mitführt**: `FireRecord.sources.cluster` trägt
`sumFrp`, `count`, `hullKm2`, `mostlyStatic` — alles, was die Cluster-Zeile
zeigt. Die Brand-Liste ist also die **Obermenge**; die Cluster-Liste war eine
Projektion davon mit anderer Sortierung.

### 11.2 Was aus der Cluster-Ansicht mitkommen MUSS (Funktionserhalt, einzeln)

| Funktion | Wohin |
|---|---|
| Stärke ΣFRP (`strengthLabel`) + Farbpunkt (`clusterColorOf`) | neue Leistungszeile der Brand-Zeile |
| Stärke-Legende (`CLUSTER_FRP_STOPS`) | über die Liste, wie bisher |
| Ausdehnung der Hülle (`extentLabel`) | Leistungszeile |
| Rangfolge **nach Stärke** | neue Sortierung „Stärke" (`RecordSort`) |
| Pflichthinweis `CLUSTER_NOTE` (MW ist Leistung, Hülle ist keine Brandfläche) | über die Liste |
| Ortsfest-Chip | ist in der Brand-Zeile bereits vorhanden (`is-static`) |
| Leerzustände mit Grund, **inkl. GWIS-Notbetrieb ⇒ keine Rangfolge nach Stärke** | Panel-Leerzustände |
| Auswahl ⇒ Hülle auf der Karte hervorheben | `focusFootprint` setzt zusätzlich `selectedCluster` |
| Klick auf eine Hülle ⇒ Zeile markieren | Karten-Rückruf bildet Cluster-Kennung auf die Brand-Kennung ab |
| Ausgesprochener Deckel | im Panel bereits vorhanden (`shown`/`onShowMore`) |

**Nicht mitkommen kann** die Zeile „N Cluster aus M Detektionen": sie zählt die
alte Bezugsgröße. Ersatz: „N Brände aus M Detektionen im Fenster" — dieselbe
Aussage über dieselbe Datenmenge, nur in der Bezugsgröße der neuen Liste; die
Verschmelzung wird dort ausdrücklich benannt, damit die Zahl nicht als
Widerspruch zur Detektionszahl gelesen wird.

### 11.3 Umbau

- **Readout-Reiter** werden auf beiden Größen `Layer | Brände`; der dritte
  (mobile) Reiter entfällt, weil er dasselbe zeigte.
- **Das Overlay am linken Kartenrand entfällt** samt 44-px-Reiter. Das ist ein
  Umzug, kein Wegfall (oberste Direktive): derselbe Bau, ein Einbauort weniger.
- **Permalink `fp`** bleibt gültig: `fp=1` öffnet jetzt den Reiter „Brände",
  geschrieben wird es, solange dieser Reiter offen ist. Alte Links behalten ihre
  Bedeutung („Liste zeigen"), nur der Ort der Liste hat sich geändert.
- **Der Knopf im Dock** („Liste öffnen · n") schaltet künftig den Reiter statt
  des Overlays.

### 11.4 Gate GBP5

Typecheck · `verify:fire-registry` (neue Sortierung, Grenzfälle ohne Cluster) ·
`verify:fire-state` (`fp` bildet auf den Reiter ab) · übrige Fire-Verifier
unverändert grün · Build + Budget · Browser-Smoke Desktop 1440×900 und Mobil
390×844: beide Reiter, Sortierung „Stärke" rankt wie die alte Cluster-Liste,
Auswahl aus der Liste hebt die Hülle hervor, Klick auf eine Hülle markiert die
Zeile, Konsole sauber, Touch-Ziele ≥ 44 px.


### 11.5 Gate GBP5 — umgesetzt (2026-08-19)

**Was gebaut wurde.** Eine Liste statt zweier: `FireFootprintPanel` trägt jetzt
die Leistungszeile (Stärke ΣFRP mit Skalenpunkt · Ausdehnung der Hülle), die
Stärke-Skala, den Pflichthinweis der Cluster-Seite und die Rangfolge „Stärke"
(`RecordSort` += `'strength'`). Sie steht auf beiden Größen im Readout unter
`Layer | Brände`; das Overlay am linken Kartenrand und sein 44-px-Reiter sind
entfallen, `clusterPanel` (131 Zeilen) ist aufgelöst.

**Selbstverifikation (fünf Fragen).**

1. **Funktionserhalt, einzeln geprüft:** die zwölf Funktionen der Tabelle in
   §11.2 sind je durch eine eigene Verifier-Sonde `[BP5] …` belegt
   (`verify:fire-clusters`). Die neun BC1-Quellsonden wurden auf den neuen Ort
   **nachgezogen, nicht gestrichen** — sie prüfen dieselbe Absicht (Hinweis
   unbedingt und vor der Liste, volle Zahl in der Kopfzeile, ausgesprochener
   Deckel, Grau-Markierung statt Filter, Start auf „Layer").
2. **Desktop:** absichtliche Änderung, kein Nebeneffekt — die Karte gewinnt die
   300 px des Overlays, die Liste zieht ins Readout. Alles andere unverändert.
3. **Touch-Ziele:** mobil 390×844 **0** Elemente < 44 px (Zeilen, Chips, Reiter,
   Sortierknöpfe gemessen). Desktop naturgemäß kleiner (Zeigergerät).
4. **Konsole:** Desktop und Mobil ohne Fehler und ohne Ausnahmen.
5. **Long Tasks:** keine neue Rechenlast — dieselbe Registry, dieselben
   Beschriftungen, nur ein anderer Einbauort; der Perf-Anker der Registry bleibt
   (3 000 Detektionen + 300 Flächen: 86 ms, Grenze 150 ms).

**Belege.** `npm run typecheck` grün · `verify:fire-clusters` **117/117** (+11
BP5-Sonden) · `fire-registry` **81/81** (+2: Rangfolge nach Stärke, Eintrag ohne
Leistung hinten) · `fire-footprint` 73/73 · `fire-model` 123/123 · `fire-time`
130/130 · `fire-firms` 92/92 · `fire-activity` 171/171 · `fire-events` 42/42 ·
`fire-sources` 151/151 · `fire-zones` 52/52 · Build + Budget **totalJs 914 /
926,1 KB** (−0,5 KB) · Browser-Smoke gegen den Dev-Server, Desktop 1440×900 und
Mobil 390×844 (DPR 3), 24-h- und 7-Tage-Fenster:

- Reiter `Layer | Brände 871`, Overlay und Kartenreiter nachweislich weg.
- `fp=1` aus einem alten Permalink öffnet die Liste (Reiter „Brände" aktiv).
- Leistungszeile: `25,3 MW · 1,9 km² Ausdehnung`; ohne Detektion
  `— keine Leistung (keine Detektion im Fenster)`.
- Sortierung „Stärke": 53,8 · 32,4 · 32,2 · 30,1 · 25,3 MW — absteigend wie die
  frühere Cluster-Liste.
- Auswahl einer Zeile setzt den Hüllenfilter der Karte auf die Detektionsgruppe
  des Brands (`["==",["get","id"],"48.182,10.174@1787141280000"]`, 1 Fläche
  gezeichnet) — die Hervorhebung aus BC1 lebt weiter.

**Anmerkung zu den Screenshots:** in den letzten Headless-Läufen fehlt die
Basiskarte (keine Straßen, kein Grün) — die OpenFreeMap-Kacheln kamen nach rund
einem Dutzend Smoke-Läufen nicht mehr. Die App-eigenen Ebenen (Detektionen,
Hüllen, Flächen) zeichnen normal; ein früherer Lauf desselben Codes zeigt die
Basiskarte vollständig. Das ist eine Grenze der Messumgebung, kein Befund.
