# Konzept: Brand-Feature-Seite — Dashboard, Graphen, Ortsbezug

> Stand: 2026-08-25 · Status: **Konzept, nicht umgesetzt** · Auftrag: Jan („aus den Kartenlayern eine echte
> Feature-Seite mit Dashboard und Graphen machen"). Kein Code, kein Commit. Nächster Schritt: Jans Go + Phasenplan.
>
> **Kennzeichnung jeder Aussage:** `[verifiziert: Datei:Zeile]` = am Repo belegt · `[verifiziert: URL]` = an der
> offiziellen Quelle belegt (Abruf 2026-08-25; „Suchtreffer" = nur über die Suchzusammenfassung, nicht direkt
> abgerufen) · `[Annahme — zu prüfen]` = nicht belegt, Prüfschritt steht in §7. Zahlen ohne Marke gibt es nicht.
>
> Grundlage: fünf Codebase-Recherchen (Quellen, UI, Analytik, Fremdquellen, Audits), Web-Recherche bei NASA FIRMS,
> Copernicus EFFIS/CEMS, DWD, BAFU, RIS/AT, Watch Duty, Windy, Fachliteratur FWI/KBDI/M-68.

## Kurzfassung (für Jan)

1. **Die Daten für ein Dashboard sind zu ~80 % schon im Browser.** Hotspots (FIRMS 375 m), Brand-Registry mit
   Überflügen/FRP/Tendenz/Flächenschätzung, EU-Gefahrenraster (GWIS), ICON-D2-Luftfeuchte und -Bodentrockenheit,
   Saison-Historie mit Vorjahresband — alles geladen, aber fast nur als Karte gezeigt. Charts gibt es genau eines
   (Saisonverlauf) `[verifiziert: src/fire/FireHistoryChart.tsx:47-75]`.
2. **Die Seite hat keinen Ortsbezug** — bewusst als „DACH-Flächenblick" gebaut `[verifiziert: src/fire/FirePage.tsx:5-7]`.
   Die drei Nutzerfragen („Brennt es in meiner Nähe?", „Ist mein Ziel morgen sicher?", „Wie außergewöhnlich ist die
   Lage?") brauchen genau das: **Ort wählen ⇒ Lage-Dashboard**. Der Permalink-Codec hat das Feld schon
   (`location`), es wird nur nie geschrieben `[verifiziert: src/fire/fireState.ts:41,113-115; FirePage.tsx:1138]`.
3. **Zwei fertige, lizenzgeklärte Quellen liegen unverdrahtet herum:** DWD-Waldbrandgefahrenindex (Stationen, Tag
   0…+6) und BAFU-Gefahrenstufen **plus kantonale Feuerverbote** (CH) `[verifiziert: src/fire/sources/dwdFireIndex.ts:5-8;
   src/fire/sources/bafuFire.ts:37-49]`. Sie beantworten die Frage „Gilt ein Feuerverbot?" — für CH amtlich, für DE
   über die Stufe, für AT gar nicht (keine offene amtliche Quelle).
4. **Drei Verknüpfungen bringen den meisten Mehrwert je Aufwand:** (a) Brand × ICON-D2-Wind ⇒ Abwind-Sektor und das
   heute dauerhaft tote Windflag `[verifiziert: src/fire/activity/dynamics.ts:42-45]`; (b) Gefahrenklasse × Bodentrockenheit
   × Luftfeuchte ⇒ Stufenband mit Treibern am Ort; (c) Ereignisdichte × Vorjahre ⇒ Anomalie (DACH-weit fertig, regional
   fehlt ein kleines Artefakt).
5. **Zwei Vorbedingungen sind Jans Handgriffe:** `FIRMS_MAP_KEY` fehlt im Prod-Deploy — die Hotspots laufen in
   Produktion nur über den GWIS-Notbetrieb `[verifiziert: audit/bandbreite.md:3024,3085]`; und die Wiederverwendung der
   am 2026-08-19 zurückgezogenen WBI/BAFU-Module (als Punktwert, nicht als Layer) braucht seine Freigabe (§7 F1).
6. **Rechtlich** verlangt NASA, dass der LANCE-Disclaimer mitgeliefert wird — inklusive des Satzes, dass die Daten
   für lokale Lageentscheidungen „not advised" sind `[verifiziert: https://earthdata.nasa.gov/earth-observation-data/near-real-time/citation]`.
   Das ist keine Fußnote, sondern die Grenze dessen, was „Brennt es in meiner Nähe?" antworten darf (§4.6).

---

## 1. Datenlage

### 1.1 Integrierte brandrelevante Quellen

| # | Quelle | Herkunft / Endpunkt | Räumlich | Zeitlich · Aktualisierung | Horizont · Historie | Abdeckung | Lizenz / Attribution | Beleg |
|---|---|---|---|---|---|---|---|---|
| Q1 | **FIRMS Area API** (VIIRS NRT, SNPP + NOAA-20 + NOAA-21) | NASA LANCE über eigenen Edge-Proxy `/_firms/*`; Schlüssel nur in `FIRMS_MAP_KEY` | 375 m nadir, am Schwadrand bis ~0,8 km (gemessen `scan` 0,32–0,80 km, Median 0,42) | NRT-Latenz ~3 h (best effort); Edge-Cache 30 min, Browser 5 min, Client 10 min; **kein Polling** | Fenster 24 h / 7 d; API max 5 Tage je Abruf; NRT wird später durch SP ersetzt (Positionen können sich verschieben) | DACH-Box 5,5/45,5–17,5/55,5 (Proxy-Hülle 5/45–18/56) | NASA „no restrictions"; Disclaimer-Weitergabe verlangt (§1.6) | `[verifiziert: src/fire/sources/firmsHotspots.ts:42,52-60,542; netlify/edge-functions/firms.ts:38-39,82-84,140-141; audit/waldbrand-firms.md:315]` · `[verifiziert: https://www.earthdata.nasa.gov/data/tools/firms/faq]` |
| Q2 | **GWIS-Hotspots WFS** (Notbetrieb ohne Schlüssel) | `maps.effis.emergency.copernicus.eu/gwis`, `ms:viirs.hs.today/.week` | wie Q1 (FIRMS 1:1 durchgereicht, 99,4 %/98,7 % deckungsgleich) | Cache 5 min | heute / Woche; Client-Deckel 12 000 | DACH-Box | CC BY 4.0 | `[verifiziert: src/fire/sources/gwisHotspots.ts:24,45-54,84; audit/waldbrand-effis.md:18]` |
| Q3 | **GWIS-Gefahrenraster** (ECMWF-FWI-System) | WMS `ecmwf.fwi/.ranking/.dc/.isi/.ffmc` (+ `dmc`, `bui` im Typ) | ECMWF ~8 km (EFFIS: „ECMWF model (8 km)") | Tageswert, Bezug 12 UTC; Kachel-Requests, kein TTL | Tag 0…+9 (`maxDay: 9`; EFFIS „1 to 9 days", live gemessen heute+8); `ranking` gegen „~40 Jahre", Jahre unveröffentlicht | Europa | CC BY 4.0 | `[verifiziert: src/fire/sources/gwisFwi.ts:27,40-47; src/fire/fireTime.ts:81-82; src/fire/dangerViews.ts:77-87,89-145]` · `[verifiziert: https://forest-fire.emergency.copernicus.eu/about-effis/technical-background/fire-danger-forecast]` |
| Q4 | **EFFIS Rapid Damage Assessment** (Brandflächen-Polygone) | WFS `ms:modis.ba.poly{.season,.week,}` | Polygone; Mindestfläche **aus den Daten gelesen** (2016–19: 21–52 ha, ab 2020/21: 0–2 ha) | Bucket-Cache 6 h, Wochen-Set 30 min; EFFIS: Perimeter „twice daily" (MODIS), Sentinel-2 seit 2018 | Saison + Archiv (DACH 1 270 Polygone seit 2016) | DACH-Box | CC BY 4.0 | `[verifiziert: src/fire/sources/euContext.ts:124-128,161-165,191,271; audit/waldbrand-effis.md:20,261-273]` · `[verifiziert: https://forest-fire.emergency.copernicus.eu/about-effis/technical-background/rapid-damage-assessment]` |
| Q5 | **EFFIS European Fuel Map** (Layer `fireFuel`) | WMS `fuel_map`, 42 Vegetationskomplexe → 13 NFFL-Klassen, Stand 2017 | nicht im Code angegeben | Kacheln, kein TTL | statisch | Europa | CC BY 4.0 | `[verifiziert: src/fire/sources/euContext.ts:43-64]` |
| Q6 | **EEA Natura 2000** (Layer `fireContext`) | ArcGIS-WMS | — | Kacheln | statisch | EU — **CH fehlt** | © EEA / CLMS | `[verifiziert: src/fire/sources/euContext.ts:66-82]` |
| Q7 | **CORINE-Industriemaske** (Klassen 121/131/132) | statisches PNG `/fire/clc-industry-mask.png`, 0,01°, 1200×1000, 24,8 KB | 100 m Quelle, MMU 25 ha | einmal je Sitzung | Stand 2018 | DACH-Box | CLMS-Attribution | `[verifiziert: src/fire/clcMask.ts:14-29; audit/waldbrand-behoerden.md:156]` |
| Q8 | **Copernicus EMS Rapid Mapping** (Aktivierungen) | internes Dashboard-API `public-activations-info/` | Punkt (Zentroid), Treffer-Radius 25 km | TTL 30 min | offen/geschlossen | DACH per Land oder Box | frei, Attribution Pflicht | `[verifiziert: src/fire/sources/emsActivations.ts:24-33,148,168]` |
| Q9 | **GeoSphere Warn-API** (AT, nur Kontext) | `warnungen.zamg.at/wsapp/api/getWarningsForCoords` | Gemeinde | Session-Cache 15 min, max 20 Abfragen; **kein Durable-Cache** (API.md §7) | Warnungen jetzt | AT | CC BY 4.0 | `[verifiziert: src/fire/sources/geosphereWarnContext.ts:32-50,213; docs/API.md:641-646]` |
| Q10 | **ICON-D2 `relhum_2m`** (Layer `fireWeather`, Treiber Luftfeuchte) | `/_dwd_grib`, Edge-Cache 6 h; **ungewärmt** (Verzeichnis-Scan) | 2,2 km (0,02°) | stündlich | Tag 0…+1 / Stunde 0…+6 (`HOUR_AXIS_MAX 6`) | ICON-D2-Domäne (DACH) | CC BY 4.0, Form „Datenbasis: … Rasterdaten bildlich wiedergegeben" | `[verifiziert: src/sources/iconD2Relhum.ts:10-17,47-58; src/fire/fireTime.ts:71,87]` |
| Q11 | **ICON-D2 `smi` + `soiltyp`** (Layer `fireSoilDryness`) | wie Q10 | 2,2 km; Tiefen 9 cm / 81 cm (Ebenen 243/729 wertgleich) | stündlich; gemessen −0,93…+2,15 (0 = Welkepunkt, 1 = Feldkapazität) | Tag 0…+1 / Stunde 0…+6 | DACH | CC BY 4.0 | `[verifiziert: src/sources/iconD2Smi.ts:15-16,24-43,67-70,86-87; audit/waldbrand-boden.md:56-91]` |
| Q12 | **Thermalanomalie-Standorte** | statisch `/fire/ta/thermal-sites-v1.json` aus FIRMS-SP-Archiv 2020-01…2026-05 + E-PRTR/MaStR/BFE | 0,01°-Zellen, Join ≤ 1,5 km | einmal je Sitzung, `no-store` | Archiv 2020–2026; 218 Standorte (A 145 · B 8 · C 65) | DACH-Box | FIRMS + E-PRTR CC-BY 4.0 + MaStR DL-DE/BY-2.0 + BFE OPEN BY | `[verifiziert: src/fire/anomaly/thermalSites.ts:5-30; audit/thermalanomalien.md:113]` |
| Q13 | **Flächen-Schätzmodell v1** | statisch `/fire/af/area-estimate-v1.json`; 604 zulässige Paare 2020–2026, σ 1,33 ln, LOO-Abdeckung 78,8 % | — | einmal je Sitzung, `no-store`; Kill-Switch `?afEst=0` | Kalibrierbereich 1…462 Detektionen, keine Extrapolation | DACH | eigene Ableitung (EFFIS-RDA-Labels) | `[verifiziert: src/fire/activity/estimate.ts:50-81,120-136; src/fire/activity/calibration.ts:254-291; audit/aktivfeuer.md:570]` |
| Q14 | **Brand-Historie** (BH) | statisch `/fire/bh/index-{month,season}-v1.json`, Shards je 1°-Zelle × Monat, `season-series-v1.json` | Ereignis = Cluster 2 km × Zeitlücke 48 h | einmal je Sitzung, `no-store`; Stand manuell nachgezogen (kein Workflow) | Saison 2026: 5 881 Ereignisse (DE 5 349 · AT 368 · CH 164); Saisonreihe 2020–2026, Referenz 2020–2025; **nur laufende Saison im Repo** (Jan 2026-08-23) | DE/AT/CH-Zentroide | FIRMS, EFFIS, GeoNames CC BY, Anlagenregister | `[verifiziert: src/fire/history/historyArtifacts.ts:28-30,77-81; src/fire/history/historySeries.ts:25-52,127; audit/brand-historie.md:259,441-447]` |
| Q15 | **GeoNames-Gazetteer** | statisch `/fire/places-dach.json`, ~7 500 Orte ≥ 1 500 Einw. | 0,1°-Suchgitter, max 20 km | einmal, lazy | statisch | DE/AT/CH | CC BY 4.0 | `[verifiziert: src/fire/footprint/places.ts:6-11,49-53]` |

**Nicht als eigene Quelle, aber Bestand:** amtliche Deep-Links je Land (NINA/MoWaS DE, Alertswiss CH, Landesfeuerwehr-Seiten AT)
`[verifiziert: src/officialSources.ts:149-178,204-216]`.

### 1.2 Vorhanden, aber vom Brand-Feature nicht genutzt

| Quelle / Modul | Was sie liefert | Warum relevant | Status heute | Beleg |
|---|---|---|---|---|
| **DWD Waldbrandgefahrenindex WBI + Graslandfeuerindex GLFI** | Stufen 1–5 je Station, Tag 0…+6, Lauf ~04:20 UTC, `wbi_0…wbi_6` | einzige amtliche deutsche Stufe; beantwortet „Wie hoch ist die Gefahr heute hier?" numerisch (kein Rasterbild) | **Modul komplett, unverdrahtet** seit 2026-08-19 (Layer „Amtliche Stufe" zurückgezogen); Transport `/_dwd_opendata` ohne Durable-Cache | `[verifiziert: src/fire/sources/dwdFireIndex.ts:5-8,25-28,38-64,107-127]` |
| **BAFU Gefahrenstufen + kantonale Präventionsmassnahmen (Feuerverbote)** | GeoJSON EPSG:2056, `level`, `valid_from`; Massnahmen je Kanton | **einzige maschinenlesbare Feuerverbots-Quelle in DACH** | **Modul komplett, unverdrahtet** (Layer „Feuerverbote (CH)" zurückgezogen 2026-08-19); Lizenz „Opendata OPEN: Freie Nutzung"; CORS nur als *simple request*; Bans-Felder (`name_*`, `title_*`) noch nicht geparst | `[verifiziert: src/fire/sources/bafuFire.ts:4-31,37-58,94-98,144-155; audit/waldbrand-behoerden.md:99-106]` |
| **ICON-D2 Wind 10 m (`u_10m/v_10m`)** + Punkt-Sampler `sampleWindAt` | Windvektor am Brandort, Gültigkeitszeit | Abwind-Sektor, Windflag der Tendenz (AF2) | Sampler wurde **für die Brandseite extrahiert**, aber `FireMap.tsx` importiert nur noch eine **leere Importliste**; `windAt` wird nie übergeben ⇒ Windflag dauerhaft `null` | `[verifiziert: src/wind/windPointSample.ts:1-15,66; src/fire/FireMap.tsx:32-33; src/fire/activity/dynamics.ts:42-45; src/fire/FirePage.tsx:897-910]` |
| **ICON-D2 Böen `vmax_10m`** | Spitzenböe je Stunde, 0…+24 h, **warm-cron-gewärmt** (schneller Kaltstart als relhum/smi) | Böen = Ausbreitungstreiber und Sicherheitswert für Camper/Wanderer | in `MapView` genutzt, nicht in `src/fire/` | `[verifiziert: src/sources/iconD2GustSource.ts:1-29; scripts/warm-grib.mjs:145]` |
| **ICON-D2 `tot_prec`** (gewärmt, 0…+27 h) + Radar-Akkumulation `accumulate()` | Niederschlag kommend / vergangene Stunden | „Kommt Regen?" und Teil von „Tage seit Regen" | nicht in `src/fire/` | `[verifiziert: src/sources/iconD2Precip.ts:6-10; src/radar/accumulation.ts:1-13]` |
| **Punkt-Vorhersage (Fusion)** | T/RH/Wind/Böe/Niederschlag stündlich; Horizont DE 24 h, AT/CH 60 h | Treiber-Sparklines am Ort | nicht in `src/fire/` | `[verifiziert: src/pointForecast/pointForecast.ts:1-21; src/countryProfiles.ts:76,92,108]` |
| **Beobachtete Blitze** `dwdLightning.ts` (WMS, letzte Stunde, ~10 min) | Zündquelle | Blitz + Trockenheit = natürliche Zündung | **DE only**; nicht in `src/fire/` | `[verifiziert: src/sources/dwdLightning.ts:1-30]` |
| **Gewitterpotenzial / `lpi_max`** (ICON-D2, 0…+12 h, gewärmt) | Gewitter-Wahrscheinlichkeit als Zündungs-Proxy DACH-weit | AT/CH haben keine Blitzbeobachtung im Repo | nicht in `src/fire/` | `[verifiziert: src/sources/iconD2Lpi.ts:40-46; src/radar/thunderPotential.ts:1-20]` |
| **Gelände** `terrainPhysics.ts` (Hangneigung, Aspekt, Senken) + Terrarium-DEM | Hangausrichtung am Brand | Rest des gelöschten Ausbreitungsmodells; „nie aus `src/fire/` benutzt" | ⚠ Terrarium/Mapzen fehlt auf `/lizenzen` | `[verifiziert: src/pointForecast/terrainPhysics.ts:63-115; src/fusion/elevation.ts:1-17; audit/waldbrand-ausbreitung.md:30]` |
| **Historie-Indizes** `drySpells()`, `heatWaves()` + Meteostat/ERA5-Tagesreihen | „Tage seit Regen", Hitzewellen | heute nur für **vergangene** Brände (`daysSinceRain`, Schwelle 1 mm, Rückblick 60 d) | Meteostat ist **CC BY-NC 4.0**; ERA5 ~25 km mit Verzug | `[verifiziert: src/history/historyIndices.ts:72-80; src/fire/history/historyDetail.ts:68-70,105; scripts/seo/licenses.mjs:91-92]` |
| **Favoriten** (`buscosun.favorites.v1`, max 8), **Routen** (GPX/TCX/FIT/KML/KMZ-Parser), **Event-Planer** | Personalisierung | „Meine Orte", „Meine Tour" | keine `buscosun.fire.*`-Keys; `/waldbrand` parst nur `:view` | `[verifiziert: src/favorites.ts:11-14; src/route/routeFormats.ts:11-25; src/router/urlState.ts:151,215]` |
| **CORINE-Waldklassen (311–324)** | Landbedeckung am Ort | „Liegt der Ort im Wald?" für Verbots-Hinweise | Maskenbauer existiert, kodiert nur 121/131/132 | `[verifiziert: src/fire/clcMask.ts:13-16; scripts/build-clc-mask.mjs]` |
| **EFFIS-Attribute ungenutzt**: `CLASS`; `BurntRun.maxAreaHa`; EMS `activationTime/lastUpdate/n_products`; GeoSphere `begin/end/auswirkungen/empfehlungen`; FIRMS `version/instrument`; Run-Feld `skipped` | Rohdaten liegen vor | z. B. GeoSphere `empfehlungen` wäre wörtlich zitierbar; `skipped` gehört in die Datenstand-Zeile | geparst-nicht-gezeigt bzw. nicht geparst | `[verifiziert: src/fire/fireCorroboration.ts:125-150; src/fire/sources/emsActivations.ts:78-100; src/fire/sources/geosphereWarnContext.ts:90-116; src/fire/sources/firmsHotspots.ts:176-183,444]` |

### 1.3 Was das UI heute zeigt — und was in der Registry schon gerechnet ist

Sichtbar (Route `/waldbrand/:view?` mit `gefahrenindex | aktive-braende | trockenheit`
`[verifiziert: src/router/routes.ts:68,169-181; src/fire/fireRouteView.ts:22-41]`):

- 9 lebende Layer (Bits 0, 2, 3, 7, 8, 9, 11, 12, 15), 7 reservierte `null`-Bits `[verifiziert: src/fire/fireModel.ts:125-159,496-502]`.
- Zeitachse Tage 0…+9 (EU-Index) bzw. Stunden 0…+6; Rückblick 24 h / 7 d; Historie Monat | Saison `[verifiziert: src/fire/fireTime.ts:71,80-133; FirePage.tsx:1530-1552]`.
- Brandliste (Deckel 50, ausgesprochen), Detailkarte mit Status · Fläche · Schätzung · Hotspots · Konfidenz · ΣFRP ·
  FRP je Überflug · Tendenz · Beobachtung · Ausbreitung (beobachtet) · FRE · Überflüge · Merkmale · Ort · Kartierung ·
  EMS · GeoSphere · Verlauf (letzte 8 Überflüge als Text) `[verifiziert: src/fire/FireFootprintPanel.tsx:531-723; src/fire/fireClusters.ts:70]`.
- Genau **ein** Chart: Saisonverlauf (SVG, Band/Mittel 2020–2025, laufende Saison) `[verifiziert: src/fire/FireHistoryChart.tsx:5,30,59-73]`.

Gerechnet, aber nicht (oder nur als Text) gezeigt `[verifiziert: Bericht Analytik, s. Zeilen]`:

| Größe | Wo gerechnet | Heute | Chart-Potenzial |
|---|---|---|---|
| `FirePass[]` je Brand: ΣFRP, maxFRP, Pixel, Tag/Nacht, Pixelbreite je Überflug | `src/fire/activity/overpasses.ts:35-61,127` | 8 Text-Chips | **FRP-Verlauf je Brand** (§5 C4) |
| `freMj`, `freSpanH`, `freMaxGapH` (Beobachtungslücken) | `intensity.ts:39-53,58` | ein Satz | Lücken-Streifen |
| `spreadBearingDeg/DistanceM` | `dynamics.ts:146-158` | Textzeile (selten befüllt, ≥ 3 FRP-Überflüge) | Kompass |
| `windAgreement/windFromDeg` | `dynamics.ts:186` | **immer `null`** (kein Wind geladen) | Kompass mit Abwind-Sektor |
| `laterPassesSeen`, `latestSeenMs` (Beobachtungsgelegenheit ≤ 150 km) | `observation.ts:39,104` | in einen Satz gefaltet | Überflug-Zeitleiste |
| `coverageHa`, `hullKm2`, `meanScanKm` | `features.ts:173-175` | Merkmale-Karte | Kalibrier-Bereichsplot |
| Saison-Index 5 881 × 25 Felder (`INDEX_FIELDS`) | `historyArtifacts.ts:77-81` | Liste | Kalender-Heatmap, FRP-Histogramm, Land-Stapel |
| `season-series` 7 Saisons × 4 Länder × 245 Tage | `historySeries.ts:25-52` | ein DACH-Chart | Small Multiples DE/AT/CH, „Tage vor/hinter dem Mittel" |

### 1.4 Gelöscht oder blockiert (nicht wieder anbieten ohne neue Entscheidung)

| Was | Warum | Beleg |
|---|---|---|
| FWI-Rechenkern `src/fire/fwi/*`, Ausbreitung `src/fire/spread/*`, Producer `iconD2FireWeather.ts` | BW-0: Feuerwetter komplett gelöscht (Jan 2026-08-23, Ausnahme vom Funktionserhalt; ~35 MiB je Aktivierung über den Netlify-Proxy). Kern wiederherstellbar aus `git show e212fc1^:src/fire/fwi/fwi.ts` | `[verifiziert: audit/bandbreite.md:972-1046; src/fire/fireModel.ts:150-156]` |
| Copernicus EDO (Bodenfeuchte-/Vegetationsanomalie) | doppelter `access-control-allow-origin: *, *` ⇒ MapLibre lädt 0 Kacheln; Layer zurückgezogen 2026-08-22 | `[verifiziert: src/fire/sources/euContext.ts:8-21; audit/waldbrand-ausbau.md:24-44]` |
| EOG VIIRS Nightfire | seit 2025-01-10 „Commercial uses … prohibited" | `[verifiziert: audit/thermalanomalien.md:68]` |
| OSM (Overpass/Geofabrik) | ODbL Share-Alike; Jan 2026-08-15: CORINE-only | `[verifiziert: audit/thermalanomalien.md:48,67]` |
| Nominatim als Massenabfrage | Usage Policy 1 req/s (V-245); Einzel-Ortssuche bleibt erlaubt | `[verifiziert: src/fire/footprint/places.ts:8-11; audit/waldbrand-cluster.md:147-150]` |
| NINA/MoWaS, Alertswiss (CC BY-NC-SA), ORF | unklare bzw. NC-Lizenz ⇒ nur Deep-Link (Jan 2026-08-15) | `[verifiziert: audit/waldbrand-behoerden.md:43,125,153; src/officialSources.ts:163,204-206]` |
| Meteostat als Live-Quelle | CC BY-NC 4.0 | `[verifiziert: scripts/seo/licenses.mjs:91-92]` |
| CDS/EWDS numerische FWI-Raster | Registrierung ⇒ blockiert (V-WF-4) | `[verifiziert: audit/waldbrand-forecast.md:223]` |
| GeoSphere Waldbrandindex (AT) | vom Anbieter selbst zurückgezogen („significant weaknesses"), Ersatz in Arbeit; Verweis auf Copernicus | `[verifiziert: https://www.geosphere.at/de/ueber-uns/faq (Suchtreffer)]` |

### 1.5 Fachliche Definitionen (für Texte und Schwellen)

- **Kanadisches FWI-System (Van Wagner 1987):** Inputs T, RH, Wind, Niederschlag → drei Feuchtecodes FFMC (Feinstreu),
  DMC (Moderschicht), DC (Tiefenschicht) → drei Verhaltensindizes ISI (Ausbreitungsrate, aus FFMC + Wind), BUI
  (verfügbarer Brennstoff, aus DMC + DC), FWI (Frontintensität, aus ISI + BUI)
  `[verifiziert: https://climatedataguide.ucar.edu/climate-data/canadian-forest-fire-weather-index-fwi]`. **Konsequenz:**
  ohne Vortagsgedächtnis (DMC/DC) gibt es keinen echten FWI — genau der Grund, warum der eigene Kern nur hFFMC/ISI
  konnte `[verifiziert: audit/waldbrand-forecast.md:198-200]`.
- **EFFIS-Klassen (FWI):** Low < 11,2 · Moderate 11,2–21,3 · High 21,3–38,0 · Very High 38,0–50,0 · Extreme 50,0–70,0 ·
  Very Extreme > 70 (seit Juni 2021); Modelle ECMWF 8 km (1–9 Tage) und MétéoFrance 10 km (≤ 3 Tage); Zusatzprodukte
  `ranking` (Perzentile) und `anomaly` (σ gegen ~40-Jahres-Mittel), DSR/WSR
  `[verifiziert: https://forest-fire.emergency.copernicus.eu/about-effis/technical-background/fire-danger-forecast]`.
  Im Repo stehen dieselben Kanten je Ansicht `[verifiziert: src/fire/dangerViews.ts:99,110,121,132,143]`. Wichtig:
  „rot" bedeutet je Ansicht etwas anderes `[verifiziert: audit/waldbrand-effis.md:161-171]`.
- **DWD WBI:** „beschreibt das meteorologische Potential für die Gefährdung durch Waldbrand", 5 Stufen (1 sehr gering
  … 5 sehr hoch), einmal täglich ~05:00 UTC, „i.d.R. ganzjährig", Karte „heute + 4 Tage"; **„Die örtliche
  Einschätzung der Waldbrandgefahr kann vom DWD-Produkt abweichen"** — die Länderbehörden geben die Warnungen heraus
  `[verifiziert: https://www.dwd.de/DE/leistungen/waldbrandgef/waldbrandgef.html; https://www.wettergefahren.de/warnungen/indizes/waldbrand.html]`.
  Open Data: Stationsdatei Tag 0…+6, kein offenes Raster `[verifiziert: src/fire/sources/dwdFireIndex.ts:12-17; audit/waldbrand-forecast.md:196]`.
  GLFI: Index für offenes Gelände, März–Oktober `[verifiziert: https://www.dwd.de/DE/leistungen/waldbrandgef/waldbrandgef.html]`.
- **CH-Gefahrenstufen (BAFU/Kantone):** 1 gering („Kleine Feuer können nicht ganz ausgeschlossen werden") · 2 mässig ·
  3 erheblich („Brennende Streichhölzer und Funkenflug eines Grillfeuers können einen Brand entfachen") · 4 gross ·
  5 sehr gross („Ausbruch von Bränden jederzeit möglich"); BAFU schätzt Mo–Fr morgens, Kantone entscheiden;
  Massnahmen: kein Verbot / bedingtes Feuerverbot / absolutes Feuerverbot im Wald und in Waldesnähe
  `[verifiziert: https://www.waldbrandgefahr.ch/de/gefahrenstufen; https://www.waldbrandgefahr.ch/de/fragen]`.
- **KBDI (Keetch-Byram):** Trockenheit von Boden/Duff, Skala 0–800 (0 = kein Defizit), Interpretationsbänder 0–200 /
  200–400 / 400–600 / 600–800 `[verifiziert: https://www.drought.gov/data-maps-tools/keetch-byram-drought-index]`. In EFFIS als
  Vergleichsindex seit 2019 `[verifiziert: EFFIS fire-danger-forecast, s. o.]`. Für buscosun kein Kandidat (US-Kalibrierung,
  Tagesgedächtnis) — `[Annahme — zu prüfen]`.
- **M-68 (DDR-Modell, später DWD):** Mittagswerte T/RH/Wind + 24-h-Niederschlag + Schneehöhe im Frühjahr; vom WBI
  abgelöst `[verifiziert: https://de.wikipedia.org/wiki/Waldbrandgef%C3%A4hrdung_(Deutschland) (Sekundärquelle, Suchtreffer)]`.
  Nur historisch relevant.
- **ICON-D2 `smi`:** 0 = Welkepunkt, 1 = Feldkapazität; Klassen gesättigt ≥ 1,0 · feucht 0,7–1,0 · mittel 0,4–0,7 ·
  trocken 0,2–0,4 · sehr trocken 0,0–0,2 — physikalisch verankert, nicht tageskalibriert
  `[verifiziert: audit/waldbrand-boden.md:113-121]`.
- **VIIRS-Grenzen:** Position = Pixelmitte, nicht Brandort; 2–4 Überflüge/Tag in mittleren Breiten; Wolken, Rauch,
  Kronendach und zu kleine/kühle Feuer verhindern Detektion; Fehlalarme durch Sonnenglint an Metalldächern,
  Gewächshäusern, Solarparks; Konfidenz `low/nominal/high` `[verifiziert: https://www.earthdata.nasa.gov/data/tools/firms/faq;
  https://www.earthdata.nasa.gov/sites/default/files/imported/Schroeder_et_al_2014b_RSE.pdf (Suchtreffer)]`. Über
  Mitteleuropa gemessen: Nachtfenster 23–03 UTC, Tagfenster 10–13 UTC, drei Satelliten ~50 min versetzt
  `[verifiziert: audit/waldbrand-firms.md:256-261,431-437]`. Detektionsrate für Brände < 50 ha nur 15–70 %
  `[verifiziert: history_feature/konzept-brand-historie-v2.md:15 — globale Validierung, nicht DACH]`.

### 1.6 Rechtliches

| Punkt | Befund | Konsequenz für die Seite | Beleg |
|---|---|---|---|
| **NASA LANCE/FIRMS Disclaimer** | Daten „as is"; Nutzer trägt alle Haftung; **„Due to the spatial resolution and other characteristics of these data, their use for tactical decision-making or informing about conditions at a local scale are not advised."** Bei Weitergabe an Dritte: Disclaimer replizieren oder verlinken, Acknowledgement-Text nennen | Der Disclaimer gehört **sichtbar auf die Seite** (nicht nur `/lizenzen`), und das Wording der Umkreis-Kachel darf keine Lageaussage sein (§4.6) | `[verifiziert: https://earthdata.nasa.gov/earth-observation-data/near-real-time/citation]` |
| **Copernicus CEMS/EFFIS** | CC BY 4.0; Notation „Generated using Copernicus Emergency Management Service information [Year]" bzw. „Contains modified …"; **„provided for information purposes only … does not constitute in any way an early warning for which only national/regional institutions are authorized"**; Haftungsverzicht | Wortlaut übernehmen; nie „Warnung" für den EU-Index | `[verifiziert: https://forest-fire.emergency.copernicus.eu/about-effis/data-license; https://ewds.climate.copernicus.eu/licences/terms-of-use-cems]` |
| **DWD** | Open Data CC BY 4.0 (seit 2023, vorher GeoNutzV); Warn-Klausel: Quellenangabe muss entfernt werden, wenn Warnungen nicht „vollständig und unverzüglich" alle Nutzer erreichen; Form „Datenbasis: Deutscher Wetterdienst, … bildlich wiedergegeben" | WBI-Werte nicht durable cachen, Datenalter sichtbar, bei Ausfall abschalten + verlinken (API.md §7 gilt sinngemäß) | `[verifiziert: docs/API.md:634-656; https://www.dwd.de/DE/leistungen/opendata/faqs_opendata.html (Suchtreffer)]` |
| **DWDG § 4** | Herausgabe amtlicher Warnungen ist Aufgabe des DWD; Verbreitung nur unter Quellenangabe | Buscosun-Texte sind nie „amtlich"; Verweis auf Länder/DWD | `[verifiziert: https://www.gesetze-im-internet.de/dwdg/__4.html (Suchtreffer)]` |
| **BAFU/CH** | „Opendata OPEN: Freie Nutzung."; Attribution „© BAFU · © Data: swisstopo"; Fair-Use (kein Polling) | ein Abruf je Sitzung, Stand = `valid_from` | `[verifiziert: src/fire/sources/bafuFire.ts:11-16,51-58; audit/waldbrand-behoerden.md:104-106]` |
| **Land Brandenburg (Stufen-XML)** | Quelle muss genannt werden; bei Einbettung der Karte E-Mail-Meldung verlangt | XML-Nutzung möglich, aber Meldepflicht klären | `[verifiziert: https://mleuv.brandenburg.de/mleuv/de/umwelt/forst/waldschutz/waldbrandgefahr-in-brandenburg/waldbrandgefahrenstufen/]` |
| **Feuerverbote DE** | offenes Feuer im Wald grundsätzlich verboten (Landeswaldgesetze); Rauchverbot 1.3.–31.10. in vielen Ländern, ganzjährig in acht Ländern | Regelhinweis + Deep-Link, keine Einzelfallaussage | `[verifiziert: https://www.bussgeld-info.de/rauchverbot-im-wald/ (Sekundärquelle, Suchtreffer)]` — Primärquelle je Land `[Annahme — zu prüfen]` (§7 F3) |
| **Feuerverbote AT** | Waldbrandverordnungen der Bezirkshauptmannschaften nach § 41 Abs. 1 ForstG, veröffentlicht im RIS; Strafen bis 7 300 € | kein strukturierter Feed bekannt ⇒ Deep-Link RIS/Land | `[verifiziert: https://noe.gv.at/noe/Katastrophenschutz/Waldbrandgefahr.html (Suchtreffer)]`; Feed-Existenz `[Annahme — zu prüfen]` (§7 F4) |
| **Haftung bei Gefahrendarstellung** | keine belastbare Quelle gefunden; Muster der Anbieter: „Informationszwecke", „kein Frühwarnsystem", Verweis auf Behörden | Disclaimer-Block wortnah an CEMS/LANCE anlehnen; **Rechtsprüfung** vor Go-Live | `[Annahme — zu prüfen]` (§7 F9) |
| **Meteostat** | CC BY-NC 4.0; UI-Nennung fehlt bisher | nicht für Live-Kacheln; Attribution in Historie nachziehen | `[verifiziert: scripts/seo/licenses.mjs:91-92; audit/strategie-2026-07-31/seo-geo-recht.md:577]` |
| **Lizenzseite lückenhaft** | `smi`, EMS Rapid Mapping, GeoSphere-Warnkontext, E-PRTR/MaStR/BFE, Terrarium fehlen in `NON_MODEL_SOURCES`; WBI/BAFU stehen noch drin | vor dem Gate nachziehen (Pflicht DATA_SOURCES.md:1448) | `[verifiziert: scripts/seo/licenses.mjs:97-118; docs/DATA_SOURCES.md:1448-1449]` |

### 1.7 Marktvergleich

| Anbieter | Was gut funktioniert | Was fehlt / Schwäche | Beleg |
|---|---|---|---|
| **EFFIS Current Situation Viewer** | Gefahr heute + Vorhersage bis 6 Tage, Hotspots + Perimeter täglich, `ranking`/`anomaly` als Einordnung gegen ~40 Jahre; gefilterte Hotspots (Landbedeckung, Stadtabstand, Konfidenz) | kein Ortsbezug, keine Feuerverbote, keine Treiber am Ort, Update 6×/Tag mit 2–3 h Verzug | `[verifiziert: https://forest-fire.emergency.copernicus.eu/about-effis/technical-background/active-fire-detection; EFFIS fire-danger-forecast]` |
| **NASA FIRMS Fire Map** | globale NRT-Daten ≤ 3 h, Zeitschieber, **Orbit-Spuren und Überflugzeiten** als Layer, Fire Events Explorer mit Perimetern | keine Gefahrenprognose, keine Einordnung, kein DACH-Kontext; für lokale Entscheidungen laut eigenem Disclaimer „not advised" | `[verifiziert: https://www.earthdata.nasa.gov/data/tools/firms (Suchtreffer); LANCE-Disclaimer]` |
| **Windy „Active fires"** | Feuer neben Wind/Wetter in einer Karte | Quelle GFAS: Tagesmittel FRP in 125-km-Zellen, gültig für den Vortag, „not ideal for operational monitoring"; neuere Version laut Windy-Artikel FIRMS stündlich, nur `high`-Konfidenz — Stand widersprüchlich | `[verifiziert: https://community.windy.com/topic/10126/new-map-on-windy-active-fires]`; aktueller Stand `[Annahme — zu prüfen]` |
| **Watch Duty (USA)** | **Ein Vorfall = eine Seite mit Zeitleiste**, von Menschen verifizierte Meldungen (Dispatcher, Feuerwehrleute), Push-Alarme nur bei „threat to life or property", Evakuierungszonen, Perimeter, Wind, Luftqualität, Flugverfolgung | nur USA; das Modell (Funkscanner, 911-Feeds) hat in DACH keine offene Entsprechung — MoWaS/Alertswiss sind Deep-Links | `[verifiziert: https://www.watchduty.org/how-it-works/overview; Feature-Liste: https://apps.apple.com/us/app/watch-duty-wildfire-floods/id1574452924 (Suchtreffer)]` |

**Was buscosun anders machen kann:** Ort + Lage statt nur Karte; nationale Stufen **neben** dem EU-Modell, nie
umgerechnet; die Brandliste hat schon das Vorfall-Muster von Watch Duty (Kennung, Verlauf, Tendenz, Evidenz) — es fehlt
die Zeitleiste als Grafik; Überflugzeiten wie FIRMS, aber als „Wann schaut der Satellit wieder?" am Ort; Feuerverbote
für CH amtlich, für DE/AT ehrlich als Lücke.

---

## 2. Nutzerperspektive

Zielgruppen-Dokument kennt Waldbrand noch nicht (Stand 2026-06-09); nächste Zeilen: Forst/Waldarbeiter (🟡, Böen,
Warnungen DE-only), Grill-/Lagerfeuer-Planer („windstilles, trockenes Fenster", offene Flamme), Feuerwehr/THW
ehrenamtlich (🔻 „kein behördentaugliches Warntool"); harte Grenze „rechtlich nicht für sicherheitskritische/
behördliche Entscheidungen" `[verifiziert: docs/zielgruppen-dach.md:53-56,169,185,194]`.

### 2.1 Anwohner — „Brennt es in meiner Nähe? Zieht der Rauch zu mir? Muss ich mir Sorgen machen?"

| Rang | Information | Warum zuerst | Daten (vorhanden ✅ / Lücke ⚠) |
|---|---|---|---|
| 1 | **Aktive Detektionen im Umkreis** (25/50 km), nächster Brand mit Distanz + Himmelsrichtung, Alter der letzten Detektion | beantwortet die Frage direkt; „kein Hotspot ≠ kein Feuer" muss im selben Satz stehen | ✅ Registry + Ort (Q1/Q2, `places.ts`); Wording-Grenze: LANCE-Disclaimer (§1.6) |
| 2 | **Amtliche Lage** (Deep-Link NINA/Alertswiss/Land) + Copernicus-EMS-Aktivierung + EFFIS-Kartierung | Sorgen-Frage ist eine Behördenfrage; buscosun darf nur zitieren/verlinken | ✅ Q4, Q8, `officialSources.ts`; ⚠ MoWaS-Auswertung bewusst nicht gebaut |
| 3 | **Windrichtung am Brand ⇒ Abwind-Sektor** (kein Rauchmodell) | „Zieht der Rauch zu mir?" — ehrlich nur als Richtung beantwortbar | ⚠ Wind existiert (`iconD2WindSource`), Brandseite lädt ihn nicht; Rauch/AOD: **keine Quelle im Repo** |
| 4 | **Tendenz** (wachsend/stabil/abklingend) + Beobachtungsqualität („seit 6 h kein Überflug") | verhindert die Fehl-Lesart „kein Signal = gelöscht" | ✅ `dynamics.ts`, `observation.ts` |
| 5 | Gefahrenklasse heute/morgen am Ort | Kontext, ob ein Funke reicht | ✅ Q3 (Karte); ⚠ Punktwert nur über Kachelfarbe (§7 F2) / WBI-Stufe (DE, unverdrahtet) |
| 6 | Nächster Satelliten-Überflug | erklärt, wann die Karte wieder etwas wissen kann | ✅ empirische Fenster (Audit); ⚠ orbitgenaue Vorhersage nicht im Repo |

### 2.2 Wanderer / Radfahrer / Camper — „Ist meine Route / mein Ziel morgen sicher? Gilt ein Feuerverbot?"

| Rang | Information | Warum | Daten |
|---|---|---|---|
| 1 | **Feuerverbot am Ziel** (CH amtlich je Kanton; DE Regel + Landesstufe; AT Hinweis auf Bezirksverordnung + RIS) | konkrete Handlung (Kocher, Grill, Rauchen) | ✅ CH `bafuFire.ts` (unverdrahtet); ⚠ DE nur Brandenburg-XML bekannt; ⚠ AT kein Feed |
| 2 | **Gefahr morgen/übermorgen am Ziel**: EU-Klasse Tag +1…+3 + nationale Stufe (DE WBI +1…+6) | Planungshorizont 1–3 Tage | ✅ Q3; ⚠ WBI unverdrahtet |
| 3 | **Treiber-Fenster**: Böen, Luftfeuchte, Regen in den nächsten 24 h (DE) / 60 h (AT/CH) | „windstill + feucht" ist das sichere Fenster | ✅ Fusion-Punktprognose, `vmax_10m`, `tot_prec` — nicht in `src/fire/` |
| 4 | Aktive Brände entlang der Route (≤ 10 km) | selten, aber entscheidend | ✅ Registry + GPX-Parser; ⚠ Verknüpfung fehlt |
| 5 | Bodentrockenheit (Oberboden/Wurzelzone) | erklärt Dauer der Lage | ✅ Q11 |
| 6 | Schutzgebiete am Ziel (Natura 2000, nicht CH) | Verbote sind dort strenger | ✅ Q6 |

### 2.3 Interessierte / Beobachter — „Wo brennt es gerade? Wie außergewöhnlich ist die Lage?"

| Rang | Information | Warum | Daten |
|---|---|---|---|
| 1 | **Saisonverlauf vs. Vorjahre** (kumuliert, Band 2020–2025) | eine Kurve beantwortet „außergewöhnlich?" — 2026 am Saisontag 174: 4 686 gegen Mittel 2 476 | ✅ `season-series-v1.json` `[verifiziert: audit/brand-historie.md:420-422]` |
| 2 | **Stärkste Brände jetzt** (ΣFRP, Fläche, Status) DACH-weit + Karte | Überblick | ✅ Brandliste |
| 3 | **Regionale Einordnung** („in 100 km um X: n Ereignisse, Vorjahre m") | Lokalisiert die Anomalie | ⚠ nur laufende Saison im Repo ⇒ kleines Zell-Artefakt nötig (§6 P2) |
| 4 | Wann brannte es dieses Jahr (Kalender-Heatmap) | Muster (Frühjahrs- vs. Sommerbrände) | ✅ Saison-Index `firstMs` je Ereignis |
| 5 | EU-`ranking`/`anomaly` (Perzentil gegen ~40 Jahre) | die einzige langjährige Einordnung | ✅ Q3 als Karte; ⚠ Punktwert |
| 6 | Amtliche Jahresstatistik (BLE: 2025 1 175 Brände, 26,3 km²) | Referenz für „durchschnittlicher deutscher Waldbrand ~2 ha" | `[verifiziert: https://www.ble.de/SharedDocs/Pressemitteilungen/DE/2026/260630_Waldbrandstatistik.html (Suchtreffer)]` — als Zitat, keine Datenquelle |

**Querschnitt:** Alle drei Gruppen brauchen zuerst denselben **Lage-Kopf** (Ort · Gefahr · Brände im Umkreis · Verbot ·
Datenstand). Sie unterscheiden sich im zweiten Block: Anwohner ⇒ Brandliste + Wind, Tourengeher ⇒ Prognose-Streifen
+ Verbot, Beobachter ⇒ Saison/Anomalie. Das trägt die Reiter-Struktur des Readouts (§4.2).

---

## 3. Verknüpfungen — was mehr Wert erzeugt als die Einzeldaten

Bewertung: **Aussagekraft** (1–5) · **Verfügbarkeit** (✅ alles da / 🟡 Teil da / ⚠ Quelle fehlt) · **Unsicherheit**
(niedrig/mittel/hoch) · **Aufwand** (S/M/L) · **Missverständnis-/Haftungsrisiko** (niedrig/mittel/hoch).

| # | Verknüpfung | Aussage | Aussagekraft | Verfügbarkeit | Unsicherheit | Aufwand | Risiko | Anmerkung / Beleg |
|---|---|---|---|---|---|---|---|---|
| V1 | **Brand × ICON-D2-Wind 10 m** ⇒ Abwind-Sektor (±30°) + Windflag der Tendenz | „Wind aus SW 25 km/h — Abwind Richtung NO"; „Ausbreitung mit/gegen den Wind" | 4 | 🟡 Wind gewärmt, Sampler da, Brandseite lädt ihn nicht | mittel (Modell 2,2 km, Lauf 2–6 h alt; Gültigkeitszeit prüfen — Lehre der 12,7-h-Falle) | S–M | **hoch, wenn als „Rauch" beschriftet**; niedrig als „Abwind-Richtung (kein Rauchmodell)" | `[verifiziert: src/wind/windPointSample.ts:66; audit/waldbrand-ausbreitung.md:220-240,296-307]` |
| V2 | **EU-Klasse × WBI/BAFU-Stufe × smi × RH** ⇒ „Gefahren-Stufenband mit Treibern" am Ort, Tag 0…+8 | „Hoch (EU) · Stufe 4 (DWD) · Boden sehr trocken · RH 28 %" | 5 | 🟡 EU nur als Bild; WBI/BAFU unverdrahtet; smi/RH ✅ | mittel; **Skalen nie umrechnen** | M | mittel (Verwechslung mit amtlicher Warnung ⇒ Pflichtsatz) | `[verifiziert: src/fire/FirePage.tsx:1775-1781; src/fire/dangerViews.ts:98]` |
| V3 | **Ereignisdichte × Vorjahre** ⇒ Anomalie DACH / Land / Umkreis | „Saison 2026: +89 % gegen Mittel" / „Umkreis 100 km: 12 Ereignisse, Vorjahre 3–9" | 4 | ✅ DACH/Land; ⚠ Umkreis braucht Vorjahres-Zellen | mittel (nur 6 Referenzsaisons, NRT-Rand; VIIRS-Detektionsrate) | S (DACH) / M (Umkreis) | niedrig | `[verifiziert: src/fire/history/historySeries.ts:118-127; audit/brand-historie.md:441-447]` |
| V4 | **Tage seit Regen (≥ 1 mm) × smi × Prognose-Regen** ⇒ Trockenphase mit Ausblick | „18 Tage kein Regentag; Boden sehr trocken; nächste 24 h: 0 mm" | 4 | ⚠ Live-Regenhistorie fehlt (Meteostat NC, ERA5-Verzug, RADOLAN-SF ohne Modul, CDC ohne CORS) | mittel | M–L | niedrig | `[verifiziert: src/fire/history/historyDetail.ts:68-70,105; docs/DATA_SOURCES.md:1334,1382-1384]` |
| V5 | **Route/Favoriten × Gefahrenprognose × Hotspots** ⇒ „Tour-Check" | „Etappe 2 morgen: Stufe 4, Feuerverbot Kanton GR, 0 Brände ≤ 10 km" | 5 | 🟡 Parser + Favoriten ✅, Sampling entlang Route fehlt | mittel | M | mittel (Sicherheitsversprechen vermeiden: „Hinweise, keine Freigabe") | `[verifiziert: src/route/routeFormats.ts:11-25; src/favorites.ts:11-14]` |
| V6 | **DEM (Hang/Aspekt) × Wind** ⇒ hangaufwärts-mit-Wind-Flag je Brand | „Hang 18°, Südlage, Wind hangaufwärts" | 3 | 🟡 `terrainPhysics` + Terrarium ✅, nie aus `src/fire/` | hoch (kein Brennstoffmodell mehr; FBP gelöscht) | M | **hoch** (liest sich wie Ausbreitungsprognose) — nur als Kontextzeile, kein Pfeil | `[verifiziert: src/pointForecast/terrainPhysics.ts:63-115; audit/waldbrand-ausbreitung.md:150-158]` |
| V7 | **Blitze (beobachtet, DE) / LPI (Prognose, DACH) × Trockenheit** ⇒ Zündungs-Kontext | „Gewitter ohne Regen über sehr trockenem Boden" | 3 | 🟡 beide Quellen ✅, nicht in `src/fire/`; Blitze DE-only | mittel | S–M | niedrig | `[verifiziert: src/sources/dwdLightning.ts:1-30; src/sources/iconD2Lpi.ts:40-46]` |
| V8 | **Überflüge (beobachtet) × empirische Fenster** ⇒ „Wann schaut der Satellit wieder?" | „letzter Überflug 12:41 UTC (NOAA-20); nächstes Fenster ~23–03 UTC" | 4 | ✅ `observation.ts` + gemessene Fenster; ⚠ orbitgenau nicht | mittel (Fenster empirisch, Wolken unbekannt) | S | niedrig — hebt Risiko der Fehl-Lesart „kein Signal" | `[verifiziert: src/fire/activity/observation.ts:104; audit/waldbrand-firms.md:256-261]` |
| V9 | **FRP je Überflug × Tag/Nacht × Lücken** ⇒ Brandverlauf-Chart | „Intensität halbiert seit gestern Nacht; 14 h Beobachtungslücke" | 4 | ✅ `FirePass[]` | niedrig (Daten sind, was sie sind; FRP-Blickwinkel benennen) | S | niedrig | `[verifiziert: src/fire/activity/overpasses.ts:35-61; src/fire/activity/intensity.ts:95-101]` |
| V10 | **Thermalanomalien × Brandliste** (bereits gebaut) | „Stahlwerk, kein Brand" | 5 | ✅ | niedrig | — | niedrig | `[verifiziert: src/fire/anomaly/classify.ts:118-135]` |
| V11 | **Rauch/AOD (CAMS) × Wind** ⇒ Rauchfahne | „Rauch aus Brand X über Region Y" | 5 | ⚠ keine Quelle; CAMS-WMS dokumentiert, Host nicht live-verifiziert | hoch | L | **hoch** | `[verifiziert: docs/API.md:754-765]` |

**Empfehlung:** V2 + V9 + V8 + V3 (DACH) sind mit vorhandenen Daten bau- und belegbar ⇒ MVP. V1 ist der günstigste
„neue" Mehrwert (Wind wieder laden) ⇒ Phase 2 zuerst. V5 folgt, wenn der Ortsschritt steht. V4 wartet auf eine
Quellenentscheidung. V6 nur als Textzeile. V11 nicht ohne verifizierte Quelle.

---

## 4. Seitenkonzept

### 4.1 Leitidee

**„Brandradar" bleibt der DACH-Flächenblick; neu ist die Ansicht „Meine Lage"** — vierter Sub-Slug `/waldbrand/lage`
(Muster `fireRouteView.ts`) mit Ortsschritt. Kein Remount, dieselbe `FirePage`-Shell (Topbar · Rail · Dock · Center ·
Readout, D-27), dieselbe `FireMap`; der Ort wird ins `#wb=`-Fragment geschrieben (Feld `l` existiert
`[verifiziert: src/fire/fireState.ts:113-115]`) und zusätzlich als Query `ort/olat/olon` gespiegelt, damit die URL teilbar
und SEO-fähig ist (§4.9). Ortsquellen: Suche (bestehende Einzel-Geokodierung), Standort (`navigator.geolocation`),
Favoriten (`buscosun.favorites.v1`).

**Was der Nutzer in den ersten 3 Sekunden sieht** (ohne Scroll, Desktop und Mobil identisch in der Reihenfolge):

1. **Ort** — „Freiburg im Breisgau · DE" (aus Gazetteer/Suche).
2. **Gefahr heute** als zwei Wörter, nie eine Zahl allein: „EU-Modell: **Hoch** · DWD-Stufe: **4 — hohe Gefahr**"
   (CH: BAFU-Stufe; AT: „keine offene amtliche Stufe — EU-Modell: …").
3. **Brände im Umkreis 50 km**: „**2 Detektionsgruppen aktiv**, nächste 12 km NO · Stand 12:41 UTC · kein Hotspot ≠ kein Feuer".
4. **Feuerverbot**: CH „Kanton GR: absolutes Feuerverbot (BAFU, gültig ab 24.08.)"; DE „offenes Feuer im Wald ganzjährig
   verboten (Landesrecht) — amtliche Stufe: Land BW ↗"; AT „Bezirksverordnung prüfen (RIS ↗)".
5. **Datenstand-Zeile**: FIRMS 12:41 UTC (2/2 Abrufe) · GWIS-Tag 25.08. · ICON-D2 06z · WBI 04:20 UTC.

### 4.2 Informationsarchitektur (von oben nach unten)

| Block | Inhalt | Reiter/Region (Desktop) | Quelle |
|---|---|---|---|
| A **Lage-Kopf** | Ort, Ampel (EU + national), Umkreis-Satz, Verbot, Datenstand | Dock oben (250 px) + Topbar-Pille | Q1–Q3, WBI/BAFU, Registry |
| B **Karte** | bestehende `FireMap` mit Umkreis-Ring (25/50 km), Brände, aktives Raster; Klick auf Brand ⇒ Readout | Center | bestehend |
| C **Dashboard-Kacheln** (§4.3) | 8 Kacheln in 2 Spalten | Dock unter A (scrollt) | s. u. |
| D **Readout „Lage"** | Stufenband (C1), Treiber-Sparklines (C2), Boden-Anzeige (C3), Überflug-Zeitleiste (C7) | Readout, Reiter 1 | Q3/Q10/Q11 + Fusion |
| E **Readout „Brände"** | bestehende Liste, sortiert nach Distanz (neue Sortierung), Detailkarte + **FRP-Verlauf (C4)** + **Kompass (C5)** | Readout, Reiter 2 | Registry |
| F **Readout „Verlauf"** | Saisonchart (C6, bestehend), Kalender-Heatmap (C8), Umkreis-Anomalie (C9, Phase 2) | Readout, Reiter 3 | Q14 |
| G **Fußblock** | Disclaimer (LANCE + CEMS wörtlich), amtliche Quellen je Land, Lizenzzeile | Readout-Ende / mobil eigene Seite | `officialSources.ts` |

### 4.3 Dashboard-Kacheln

Jede Kachel trägt **Wert · Herkunft · Stand** in dieser Reihenfolge; ohne Daten sagt sie „keine Daten — nicht: keine
Gefahr" (bestehendes Muster `[verifiziert: src/fire/FirePage.tsx:2168]`).

| # | Kachel | Wert | Herkunft | Stand/Alter | Leerzustand |
|---|---|---|---|---|---|
| K1 | **Gefahr heute (EU)** | Klasse als Wort + Farbe; darunter `ranking`-Perzentil („höher als 95 % der Jahre") | GWIS ECMWF-FWI ~8 km, Tageswert 12 UTC | Datum des Tages | „Modellwert nicht verfügbar" |
| K2 | **Amtliche Stufe** | DE: WBI 1–5 + Stationsname/Distanz; CH: BAFU 1–5 + Region; AT: „keine offene amtliche Stufe" | DWD / BAFU | WBI-Lauf ~04:20 UTC; BAFU `valid_from` (Mo–Fr) | Lücke ausgewiesen, nie durch K1 ersetzt |
| K3 | **Brände im Umkreis** | Anzahl aktiv / kein Signal / erloschen (50 km); nächster mit Distanz + Richtung + Alter | Registry (FIRMS/GWIS + EFFIS + EMS) | `latestAcqMs`; „n von m Abrufen" | „keine Detektion im Umkreis — letzter Überflug hh:mm; Wolken/Lücken verbergen Feuer" |
| K4 | **Feuerverbot** | CH: Massnahme wörtlich; DE/AT: Regelhinweis + Link | BAFU / statischer Text | `valid_from` / — | „nicht maschinenlesbar — bitte amtlich prüfen ↗" |
| K5 | **Trockenheit** | smi Oberboden + Wurzelzone als Klasse; RH jetzt | ICON-D2 `smi`, `relhum_2m` | Lauf + Schritt | — |
| K6 | **Wind & Böen** | Richtung/Stärke jetzt, max. Böe nächste 6 h | ICON-D2 `u/v_10m`, `vmax_10m` | Lauf; „Modellfeld reicht bis +X h" | Phase 2 |
| K7 | **Saison** | „2026: 4 686 Ereignisse — Mittel 2020–25: 2 476" + Mini-Sparkline | `season-series-v1.json` | `evaluatedAt − 1` (Beschriftungsfalle) | „kein Stand verfügbar" |
| K8 | **Satellit** | letzter Überflug (Sat, Zeit), nächstes Fenster | Beobachtungsindex + gemessene Fenster | — | — |

### 4.4 ASCII-Wireframe

**Desktop ≥ 1440 px** (Shell wie heute; neu: Ortszeile, Kacheln im Dock, Reiter „Lage"/„Verlauf", Charts):

```
┌────┬──────────────────────────────────────────────────────────────────────────────────────┐
│Rail│ Brandradar · [Überblick | Aktuelle Lage | Meine Lage]              FIRMS LIVE 12:41 UTC │
│    ├──────────────────┬──────────────────────────────────────┬────────────────────────────┤
│    │ DOCK 250         │ CENTER — Karte                        │ READOUT 340                │
│    │ ⌖ Freiburg · DE  │  ┌──────────────────────────────────┐ │ [ Lage | Brände·2 | Verlauf ]│
│    │ [Suche][Standort]│  │   ○ 50 km-Ring um den Ort         │ │ ┌ C1 Gefahr 0…+8 d ───────┐ │
│    │ [★ Favoriten ▾]  │  │     ▲ Brand 12 km NO (aktiv)      │ │ │ EU   ■■■■■■■■■  Hoch     │ │
│    │──────────────────│  │     · · Hotspots, Raster          │ │ │ DWD  ■■■■■■■    Stufe 4  │ │
│    │ K1 GEFAHR (EU)   │  │  Chips: Index|Einordnung|…        │ │ └─────────────────────────┘ │
│    │   HOCH · > 95 %  │  └──────────────────────────────────┘ │ ┌ C2 Treiber 0…+24 h ─────┐ │
│    │ K2 DWD-STUFE 4   │  Zeit-Deck: ▶ [Tage|Stunden] ─●────  │ │ RH ╲___  Böe ╱╲  Regen ▁  │ │
│    │   hohe Gefahr    │                                      │ └─────────────────────────┘ │
│    │ K3 BRÄNDE 50 km  │                                      │ ┌ C3 Boden ───────────────┐ │
│    │   2 aktiv · 12 km│                                      │ │ 9 cm ▮▮▮▯▯ sehr trocken  │ │
│    │ K4 FEUERVERBOT   │                                      │ │ 81 cm ▮▮▮▮▯ trocken      │ │
│    │   Landesrecht ↗  │                                      │ └─────────────────────────┘ │
│    │ K5 TROCKENHEIT   │                                      │ ┌ C7 Satellit ────────────┐ │
│    │ K6 WIND/BÖEN     │                                      │ │ ☾02:11 ☀12:41 ▏▏▏ ~23–03 │ │
│    │ K7 SAISON  ╱     │                                      │ └─────────────────────────┘ │
│    │ K8 SATELLIT      │                                      │ Disclaimer · Quellen · Stand │
└────┴──────────────────┴──────────────────────────────────────┴────────────────────────────┘
```

**Readout „Brände" (Detail eines Brands, neu C4 + C5):**

```
│ ← Brände   Hürtgenwald · DE · AKTIV · 12 km NO                       │
│ Fläche  ≈ 8,9 ha (1,6–49 ha, 80 %) — vorläufig, geschätzt            │
│ ┌ C4 FRP je Überflug (MW) ───────────────────────────────────────┐   │
│ │ 40┤        █                                                   │   │
│ │ 20┤   █    █  ▒lücke 14 h▒     █                               │   │
│ │  0┴──☾────☀──────────────────☾──────── 23.08 ── 24.08 ── 25.08 │   │
│ └────────────────────────────────────────────────────────────────┘   │
│ ┌ C5 Wind am Brand ──┐  Tendenz: abklingend · Beobachtung: Sicht gegeben │
│ │      N             │  Ausbreitung bisher: 400 m nach NO (mit dem Wind) │
│ │   ↗ Abwind NO      │  Wind: aus SW 18 km/h, ICON-D2 06z, gültig 12 UTC  │
│ │  ←●  Wind aus SW   │  Kein Rauchmodell — Richtung, keine Reichweite.    │
│ └────────────────────┘                                                    │
```

**Mobil ≤ 767 px** (Bottom-Bar wie heute: Karte · Lage · Brände · Zeit; „Layer" wandert ins Sheet „Karte"):

```
┌──────────────────────────────┐
│ ⌖ Freiburg · DE        [☰]   │  ← sticky
│ HOCH (EU) · DWD 4      12:41 │  ← sticky Ampelzeile
├──────────────────────────────┤
│ 2 Brände ≤ 50 km · nächster  │
│ 12 km NO · kein Hotspot ≠ …  │
│ Feuerverbot: Landesrecht ↗   │
├──────────────┬───────────────┤
│ K1 GEFAHR    │ K2 STUFE      │  2-spaltig, ≥ 44 px
│ K5 BODEN     │ K6 WIND       │
│ K7 SAISON ╱  │ K8 SATELLIT   │
├──────────────────────────────┤
│ [Karte-Vorschau — tippen ⇒ Sheet] │
├──────────────────────────────┤
│ ◀ C1 Stufenband ▶ (h-scroll) │
│ ◀ C2 Treiber ▶               │
├──────────────────────────────┤
│ Brände (Liste, Distanz-Sort) │
├──────────────────────────────┤
│ Disclaimer · Quellen         │
├──────────────────────────────┤
│ Karte │ Lage │ Brände │ Zeit │  ← Bottom-Bar
└──────────────────────────────┘
```

### 4.5 Karten-Integration — was auf die Karte, was ins Chart

| Auf die Karte | Ins Chart/Kachel | Kopplung |
|---|---|---|
| Raster (EU-Klasse, RH, smi), Hotspots/Raster, Brandflächen, Umkreis-Ring, Standort-Rauten | Zeitverlauf (Stufenband, Treiber, FRP), Vergleiche (Saison, Anomalie), Zahlen mit Herkunft | **Ort wählen** ⇒ Kamera auf Ort + Ring, Kacheln und Reiter „Lage" neu; **Brand klicken** (Karte oder Liste) ⇒ Detail + C4/C5; **Zeit-Deck scrubben** ⇒ Karte und Cursor im Stufenband/Treiber laufen mit (dieselbe `dayStep/hourStep`-Quelle) |
| Wind-Partikel **nicht** (Rückzug 2026-08-22 bleibt) | Windvektor je Brand als Kompass | Kompass nur bei geladenem Wind mit Gültigkeit ≤ ±3 h zum Überflug (AF2-Regel) `[verifiziert: CLAUDE.md-Statusblock AF2; src/fire/activity/dynamics.ts:62-63]` |

Regel: Ein Wert steht **entweder** auf der Karte **oder** im Chart nie mit zwei verschiedenen Auskünften (Lehre VB0,
„ein Brand, zwei Auskünfte = Fehler" `[verifiziert: audit/brandflaeche-vorlaeufig.md:173-176]`). Punktabfragen lesen
dieselbe 8-bit-Leinwand wie der Shader (`layerSampler`-Muster) `[verifiziert: src/qa/layerSampler.ts:1-13]`.

### 4.6 Unsicherheitskommunikation

| Thema | Text (Vorschlag, wortnah an Bestand) | Wo | Beleg |
|---|---|---|---|
| Datenalter | „Stand 12:41 UTC · 2 von 2 Abrufen" in Topbar und Kachel; bei Teilausfall „n von m ohne Antwort — die Anzeige kann Lücken haben" | Kopf, K3 | `[verifiziert: src/fire/FirePage.tsx:495-496]` |
| Auflösung | „Der Punkt ist die Pixelmitte, nicht der Brandort; die Pixelfläche ist eine Obergrenze, keine Brandfläche" | Popup, Detail | `[verifiziert: src/fire/FireMap.tsx:1075-1077]` |
| Beobachtungslücke | „kein Signal ist keine Entwarnung (Wolken, Überflugslücken)"; „seit hh:mm kein Überflug ausgewertet" | K3, K8, Liste | `[verifiziert: src/fire/footprint/fireRegistry.ts:796-797; FireFootprintPanel.tsx:336]` |
| „kein Hotspot ≠ kein Feuer" | im Leerzustand von K3 als **erster** Satz; „bei ~2 ha je deutschem Waldbrand sieht der Satellit viele nicht" | K3 | `[verifiziert: src/fire/FireLayerCard.tsx:177]` |
| Nicht amtlich | „Modellwert, kein amtliches Warnprodukt" (EU); „Detektionsgruppe, keine amtliche Meldung" (Brände); Pflichtsatz per Verifier | K1, K3, Liste | `[verifiziert: src/fire/dangerViews.ts:211-212; FireFootprintPanel.tsx:467-471]` |
| Skalen | „DE Stufe 2 ≠ CH Stufe 1 — nicht umgerechnet; AT hat keine offene amtliche Stufe" | K2 | `[verifiziert: src/fire/FirePage.tsx:1775-1781]` |
| Wind ≠ Rauch | „Abwind-Richtung aus ICON-D2 — kein Rauch- oder Ausbreitungsmodell" | C5 | neu |
| Schätzung | nie ohne Intervall; „kein Ersatz für eine Kartierung"; keine Schätzung auf Standort-Ereignissen | Detail | `[verifiziert: src/fire/activity/estimate.ts:88-102; src/fire/history/historyArtifacts.ts:167-179]` |
| Satellitenfenster | „nächstes Fenster ~23–03 UTC (Erfahrungswert, kein Orbit-Kalender)" | K8, C7 | `[verifiziert: audit/waldbrand-firms.md:256-261]` |
| Externer Disclaimer | LANCE-Absatz **wörtlich** (inkl. „tactical decision-making … not advised") + CEMS „information purposes only … not an early warning" + Link | Fußblock G, `/lizenzen` | `[verifiziert: LANCE-Citation-URL; EWDS-Terms-URL]` |
| Ausfall | „Ausfall, nicht Leerstand: keine Daten heißt nicht keine Brände"; GWIS-Notbetrieb ohne Rangfolge | K3, Liste | `[verifiziert: FireFootprintPanel.tsx:202-215]` |

### 4.7 Leere Zustände („Es brennt gerade nichts")

Der Normalfall im DACH-Winter und an vielen Sommertagen. Die Seite darf dann **nicht** leer wirken:

1. K3 wird zur **Beruhigungs-Kachel mit Vorbehalt**: „Keine Detektion im Umkreis 50 km (letzter Überflug 12:41 UTC).
   Letzte Detektion im Umkreis: vor 9 Tagen (Ort X). Kein Hotspot ≠ kein Feuer."
2. Der Readout öffnet auf **„Lage"** statt „Brände": Stufenband 0…+8 Tage, Treiber, Boden — die Seite beantwortet „wird
   es gefährlich?" statt „wo brennt es?".
3. Reiter „Verlauf" zeigt Saison-Einordnung + Kalender-Heatmap — Beobachter finden immer etwas.
4. Karte: EU-Raster + Umkreis-Ring; Brandflächen-Layer „Frühere Brandflächen" wird im Leerzustand als Vorschlag angeboten
   („in diesem Umkreis 3 kartierte Flächen seit 2016").
5. Kein „Alles gut"-Grün — Farbe nur aus Gefahrenklassen, nie aus der Abwesenheit von Detektionen.

### 4.8 Mobile-Variante

- Breakpoints 767 / 1439 px, Safe-Area, Touch ≥ 44 px (bestehende Regeln; offener V-WF-12: `.fire-td-now` 37 px)
  `[verifiziert: src/fire/FirePage.tsx:1030,1186; audit/waldbrand-forecast.md:350]`.
- Bottom-Bar bleibt vierteilig (Karte · Lage · Brände · Zeit); „Layer" wandert in das Sheet „Karte" (heute „Layer"-Seite).
- Kopf (Ort + Ampel) **sticky**; Kacheln 2-spaltig; Charts als horizontal scrollbare Karten mit fester Höhe 150 px
  (Maß des bestehenden Saisoncharts `[verifiziert: src/fire/FireHistoryChart.tsx:30]`).
- Karte als `BottomSheet` (`collapsed | half | full`) `[verifiziert: src/mobile/BottomSheet.tsx:4-6]`.
- Long-Task-Grenze 200 ms: Basislinie der Seite **ohne** Layer liegt heute bei 352 ms (V-220) — die neue Ansicht darf
  nicht mehr Hauptthread-Dekode auslösen als „Aktuelle Lage" heute `[verifiziert: audit/waldbrand-firms.md:710]`.

### 4.9 SEO/GEO-Potenzial

Bestehende Mechanik: EINE Routentabelle speist Router, Meta, Route-Shells und Sitemap `[verifiziert: src/router/routes.ts:169-181]`.
Ein neuer Slug `lage` bekommt automatisch Shell + Canonical. Ortsbezug per Query (`ort/olat/olon`, Muster Wetterkarte
`[verifiziert: src/router/urlState.ts:151,215]`) — Canonical ohne Query, damit keine Duplikate.

Suchfragen, die die Seite beantworten könnte `[Annahme — zu prüfen: keine Keyword-Daten im Repo]`:

| Frage | Block |
|---|---|
| „Waldbrandgefahr heute [Ort]", „Waldbrandstufe [Landkreis]" | A/K1/K2 |
| „Waldbrand aktuell [Region]", „wo brennt es gerade" | K3/E |
| „Feuerverbot [Kanton]", „Grillverbot Wald [Bundesland]" | K4 |
| „Waldbrandindex Vorhersage 3 Tage" | C1 |
| „Waldbrände 2026 Statistik Deutschland" | F/C6 |
| „Rauch Waldbrand Windrichtung" | C5 (nur Richtung) |

Landes-Einstiege (`/waldbrand/lage?land=DE`) statt Orts-Shells — 7 500 Orts-Shells wären Sitemap-Spam. GEO
(Antwort-Snippets): jede Kachel als `<dl>` mit Herkunft und Stand ist zitierfähig; JSON-LD `WebPage` existiert schon,
`Dataset`-Markup für die Saisonreihe wäre Nice-to-have.

---

## 5. Chart-Spezifikationen

Alle Charts reines Inline-SVG (D-06: keine Chart-Bibliothek `[verifiziert: src/fire/FireHistoryChart.tsx:5]`).
Wiederverwendbare Komponenten: `src/history/charts/{LineChart,CalendarHeatmap,AnomalyBars,Stripes,Windrose,HourlyDayChart}.tsx`
`[verifiziert: Signaturen LineChart.tsx:8-10; CalendarHeatmap.tsx:12-14; AnomalyBars.tsx:10-20; Windrose.tsx:5-9; HourlyDayChart.tsx:8-10]`
und `.br-card`-Bausteine `[verifiziert: src/fire/fireDeck.css:346-357]`. Farben aus `designTokens.css` (Sand/Ink, Terracotta
für „aktiv", Amber „kein Signal", Slate „erloschen" `[verifiziert: src/fire/footprint/fireRegistry.ts:659-663]`); Gefahrenklassen
aus `FWI_STEPS` (abgeleitet, nicht amtlich).

| # | Chart | Typ + warum | X | Y | Quelle | Aussage in einem Satz | Phase |
|---|---|---|---|---|---|---|---|
| C1 | **Gefahren-Stufenband am Ort** | **kategoriales Zeitband** (zwei Zeilen: EU-Klasse Tag 0…+8, nationale Stufe DE 0…+6 / CH 0). Kein Liniendiagramm: Klassen sind ordinal, die Skalen dürfen nicht auf eine Achse | Tag | zwei Zeilen, Farbe = Klasse, Wort im Feld | GWIS (Kachelfarbe→Klasse, §7 F2) + WBI-Station + BAFU-Region | „Ab Donnerstag Sehr hoch (EU), DWD-Stufe 5" | MVP (nationale Zeile nach F1) |
| C2 | **Treiber-Sparklines** (Small Multiples ×4: RH %, Böe km/h, T °C, Regen mm) | Linien/Balken je 150 px hoch, gemeinsame Zeitachse; Small Multiples statt Mehrfachachse, weil Einheiten verschieden | Stunde 0…+24 (DE) / +60 (AT/CH) | je Einheit | Fusion-Punktprognose (`pointForecast`), Cursor aus dem Zeit-Deck | „Heute Nachmittag RH 24 % bei Böen 45 km/h — das kritische Fenster" | MVP |
| C3 | **Bodentrockenheit** | zwei horizontale 5-Klassen-Balken (9 cm / 81 cm) mit Marke „jetzt" und „+24 h"; Balken statt Gauge, weil Klassen benannt sind | Klasse | Tiefe | ICON-D2 `smi` (Punktabfrage auf der Leinwand) | „Oberboden sehr trocken, Wurzelzone trocken — seit 24 h unverändert" | MVP |
| C4 | **FRP je Überflug** | **Stufen-/Balkenchart**; Lücken > 6 h als schraffierte Fläche „Beobachtungslücke"; Tag/Nacht als Symbol; **kein** interpolierender Linienzug (FRE-Trapez überbrückt „blind") | Überflugzeit (letzte 7 d) | ΣFRP MW (log-Skala ab 1 MW: FRP p50 3 MW, max 373 MW) | `FireRecord.passes` | „Intensität seit der Nacht halbiert; 14 h ohne Beobachtung" | MVP |
| C5 | **Wind am Brand (Kompass)** | ein Vektor + Abwind-Sektor ±30°, optional beobachteter Ausbreitungspfeil (getrennt); keine Windrose (ein Zeitpunkt, kein Klima) | — | — | ICON-D2 `u/v_10m` via `sampleWindAt` mit `validAtMs`; `dynamics.spreadBearingDeg` | „Wind aus SW, Abwind NO — Ausbreitung bisher mit dem Wind" | Phase 2 (Wind laden) |
| C6 | **Saisonverlauf kumuliert** (bestehend) + Land-Umschalter | Linie + Band; Small Multiples DE/AT/CH optional | Saisontag 1.3.–31.10. | Ereignisse kumuliert | `season-series-v1.json` | „Saison 2026 liegt 89 % über dem Mittel 2020–25" | MVP (Umschalter S) |
| C7 | **Überflug-Zeitleiste** | horizontale Zeitleiste 48 h: Punkte je Überflug (Sat, ☀/☾), Cursor „jetzt", schraffiertes erwartetes Fenster | Zeit | Satellit (3 Zeilen) | Beobachtungsindex (`observationFor`) + gemessene Fenster | „Letzter Überflug 12:41 (NOAA-20), nächstes Fenster ~23–03 UTC" | MVP |
| C8 | **Kalender-Heatmap Saison** | `CalendarHeatmap` wiederverwenden | Kalendertag | Wochentag | Saison-Index (`firstMs` je Ereignis, Umkreis oder Land) | „Der Juli hatte 21 Tage mit Ereignissen im Umkreis" | Phase 2 |
| C9 | **Umkreis-Anomalie** | Balken je Saison 2020–2026 + Mittel-Linie (`AnomalyBars`) | Saison | Ereignisse ≤ 100 km | **neues** Zell-Artefakt (1° × Saison) | „12 Ereignisse — Vorjahre 3–9" | Phase 2 |
| C10 | **Stärke-Verteilung** | Histogramm ΣFRP (log-Bins), DACH 7 d | MW-Bin | Anzahl | Registry | „Fast alle Brände < 10 MW; zwei Ausreißer" | Nice |
| C11 | **Tage seit Regen** | Zahl + 30-Tage-Balken Niederschlag | Tag | mm | offen (§7 F6) | „18 Tage kein Regentag ≥ 1 mm" | Phase 2 (nach F6) |

---

## 6. Priorisierung

Aufwände sind Schätzungen in Agent-Sessions (je Session = ein Gate) `[Annahme — zu prüfen]`. Regel: ein Thema = eine Phase
= ein Gate; STOPP & FRAGEN bei Edge Functions, Warm-Crons, Shadern, Löschungen.

### MVP — „Meine Lage" (Gate GBF1, ~4–5 Sessions)

| Schritt | Inhalt | Dateien/Module | Aufwand | Vorbedingung |
|---|---|---|---|---|
| M0 | `FIRMS_MAP_KEY` im Prod-Deploy setzen (sonst Notbetrieb ohne Intensität) | Netlify-UI | Jans Handgriff | V-BW-36 |
| M1 | Ortsschritt: Slug `lage`, Ortsquellen (Suche/Standort/Favoriten), `#wb=` `l` schreiben, Query-Spiegel, Umkreis-Ring, Distanz-Sortierung | `fireRouteView.ts`, `fireState.ts`, `FirePage.tsx`, `FireMap.tsx`, `routes.ts`, `favorites.ts` | 1 | — |
| M2 | Lage-Kopf + Kacheln K1/K3/K5/K7/K8 aus geladenen Daten; Punktabfragen auf `relhum`/`smi`-Leinwand; EU-Klasse aus Kachelfarbe (falls F2 grün, sonst „siehe Karte") | neu `src/fire/lage/*` (Kacheln, Sampler), `FireLayerCard`-Muster | 1 | F2 |
| M3 | K2 + K4: WBI (DE) und BAFU-Stufe + Massnahmen (CH) als Punkt-/Regionswerte; Bans-Felder parsen; DE/AT Regeltext + Deep-Links | `dwdFireIndex.ts`, `bafuFire.ts` (Parser erweitern), `officialSources.ts`, `licenses.mjs` | 1 | **F1 (Jans Freigabe)** |
| M4 | Charts C1 (EU-Zeile), C2, C3, C4, C6-Umschalter, C7; Zeit-Deck-Cursor | neu `src/fire/charts/*`, Wiederverwendung `src/history/charts` | 1–1,5 | Fusion-Chunk dynamisch importieren (Muster 30-KB-Chunk) |
| M5 | Unsicherheits-Texte, Disclaimer-Block (LANCE + CEMS wörtlich), Leerzustände, Lizenzseite nachziehen, Verifier `verify:fire-lage` | `brandradarMeta.ts`, `licenses.mjs`, `scripts/verify-fire-lage.mjs` | 0,5 | — |
| M6 | Mobile (sticky Kopf, Kacheln, Sheet), Desktop-Diff, Long-Task-Messung gegen V-220-Basislinie | `fireDeck.css`, `FirePage.tsx` | 0,5 | Real-Device für WebGL |

### Phase 2 (je eigenes Gate)

| Schritt | Inhalt | Dateien | Aufwand |
|---|---|---|---|
| P1 | Wind zurück auf die Brandseite: `fetchIconD2Wind` (gewärmt), `sampleWindAt` je Brand, `windAt` in `RegistryInput`, Kompass C5, K6 mit `vmax_10m`; toten Import löschen; Horizont-Guard `manifestCoversNow` | `FireMap.tsx:32-33`, `FirePage.tsx:897-910`, `fireRegistry.ts:164`, `iconD2GustSource.ts` | 1 |
| P2 | Umkreis-Anomalie: lokales Batch-Skript zählt Ereignisse je 1°-Zelle × Saison 2020–2026 (aus `data/fire/bh/events.jsonl`, 188 MB, gitignored) ⇒ `public/fire/bh/cells-season-v1.json` (Schätzung < 50 KB gz `[Annahme — zu prüfen]`); C9 + C8 | `scripts/fire/bh/*`, `historyLoad.ts` | 1 |
| P3 | Tage seit Regen live (nach F6): Quelle wählen, Modul, K/C11 | `src/fire/lage/rainHistory.ts` | 1 (+ Batch = STOPP) |
| P4 | Tour-Check: GPX/Favoriten × Stufenband × Hotspots ≤ 10 km; Karte in Tourenplanung | `src/route/*`, `src/fire/lage/routeCheck.ts` | 1–2 |
| P5 | Verifier-Nachzug: `verify:fire-history` um Zell-Artefakt, Perf-Anker Registry-Distanzsortierung | scripts | 0,5 |

### Nice-to-have

| Schritt | Inhalt | Hinweis |
|---|---|---|
| N1 | Blitze (DE) + LPI (DACH) als Zündungs-Kontext-Kachel | `dwdLightning.ts`, `iconD2Lpi.ts`; MTG-LI wäre die DACH-weite Quelle (nicht gebaut) |
| N2 | Hang/Aspekt-Zeile je Brand | `terrainPhysics.ts`; nur Text, kein Pfeil; Terrarium-Lizenz nachtragen |
| N3 | Rauch/AOD (CAMS) | erst nach Live-Verifikation des Hosts (§7 F8) |
| N4 | Europa-Blick | `ENVELOPE`-Konstante der Edge Function (STOPP) `[verifiziert: audit/waldbrand-firms.md:451-456]` |
| N5 | Orbitgenaue Überflug-Vorhersage | §7 F7 |
| N6 | Nächtlicher Historie-Stand (BH6) | Workflow = Jans Gate `[verifiziert: audit/brand-historie.md:446]` |
| N7 | Benachrichtigung „Stufe ≥ 4 an meinem Ort" | `buscosun.notify.*` existiert für Nowcast; Warn-Klauseln API.md §7 prüfen |

---

## 7. Offene Fragen & Datenlücken

| # | Frage | Warum offen | Nächster Prüfschritt |
|---|---|---|---|
| F1 | Dürfen `dwdFireIndex.ts`/`bafuFire.ts` als **Punkt-/Regionswert** wieder genutzt werden? Die *Layer* wurden am 2026-08-19 auf Jans Auftrag zurückgezogen; die Module blieben bewusst erhalten | Scope-Frage (Layer ≠ Kachel) | **Jan fragen** vor M3 |
| F2 | EU-Klasse am Punkt: GWIS ist nicht `queryable` `[verifiziert: audit/waldbrand-effis.md:143-146]`; CDS/EWDS blockiert (V-WF-4). Geht **Kachelfarbe → Klasse** (Legendenfarben sind bekannt)? | braucht CORS-fähiges Kachelbild für `getImageData` (Muster `elevation.ts:55-71`) | Sonde: GWIS-WMS-Kachel mit `crossOrigin='anonymous'` laden, `getImageData`, Farbe gegen `FWI_STEPS` prüfen; bei Taint: Klasse nur auf der Karte, Kachel sagt „siehe Karte" |
| F3 | Feuerverbote DE maschinenlesbar? Bekannt nur Brandenburg-XML (Quellenpflicht + E-Mail-Meldung) `[verifiziert: mleuv-URL]` | 16 Länder, keine Übersicht | je Land opendata-Portal prüfen (Sachsen „täglich + 3 Tage", Bayern, NRW…); Übersicht `https://www.waldwissen.net/assets/waldwirtschaft/schaden/brand/fva_waldbrand_wb6/wb6_1_uebersicht_waldgesetze.pdf` lesen |
| F4 | AT: gibt es einen strukturierten Feed der Waldbrandverordnungen (RIS „Bvb"-Dokumente)? | nur PDFs/Amtsblätter gefunden | RIS-API (`data.bka.gv.at`) auf Dokumenttyp „Bvb" + „Waldbrand" abfragen; sonst Deep-Link je Land |
| F5 | BAFU-Nutzungsbedingungen aktuell? opendata.swiss antwortete 403 auf Abruf | geocat sagt „OPEN", STAC sagt `proprietary` | `https://opendata.swiss/de/dataset/waldbrandgefahrenwarnung` im Browser prüfen; Fair-Use-Satz übernehmen |
| F6 | Quelle für „Tage seit Regen" live: RADOLAN-SF (DE, 1 km, kein Modul) / ERA5 via Open-Meteo (Verzug, Lizenz?) / DWD-CDC stündlich (kein CORS ⇒ Batch = STOPP) / Meteostat (**NC**) | jede Option hat eine Hürde | ERA5-Archiv-Verzug messen (Tage); RADOLAN-SF-Verzeichnis + CORS sondieren; Jan: Batch ja/nein |
| F7 | Orbitgenaue Überflug-Vorhersage: FIRMS bietet „Orbit Tracks and Overpass Times" im Viewer — als Daten abrufbar (CORS/Lizenz)? | nur Viewer-Feature belegt | FIRMS-Overpass-Endpunkt suchen; Fallback: empirische Fenster (gemessen) |
| F8 | CAMS-Rauch/AOD: `eccharts.ecmwf.int` „not live-verified (host robots-blocked)" `[verifiziert: docs/API.md:754-765]`; ADS-API braucht Schlüssel | keine Quelle | WMS-Host aus dem Browser sondieren; Lizenz (Attribution, keine Restriktion laut CAMS-Doku) bestätigen |
| F9 | Haftungsgrenze bei Gefahrendarstellung — welche Formulierung schützt (DE/AT/CH)? | keine belastbare Rechtsquelle gefunden | Rechtsberatung; bis dahin CEMS/LANCE-Wortlaut übernehmen + „nicht für sicherheitskritische Entscheidungen" (zielgruppen-dach.md:56) |
| F10 | Regionale Vorjahresreferenz: nur die laufende Saison liegt im Repo (Jan 2026-08-23) | C9 braucht 2020–2025 je Zelle | Größe eines Zell-Artefakts messen (Skript auf `events.jsonl`); falls < 100 KB gz ⇒ Vorschlag an Jan |
| F11 | Umkreis-Zählung und V-221: die DACH-Box enthält PL/CZ/IT/FR-Anteile `[verifiziert: audit/waldbrand-firms.md:711]` | „2 Brände in 50 km" könnte jenseits der Grenze liegen | im Umkreis-Satz Land nennen („1 davon in CZ"); `country`-Feld der Registry nutzen |
| F12 | Long Tasks: Basislinie 352 ms ohne Layer (V-220), GRIB-Dekode auf dem Hauptthread (V-WF-13) | neue Punktabfragen laden ggf. `relhum`/`smi` zusätzlich | Prod-Preview messen: „Meine Lage" kalt vs. „Aktuelle Lage" kalt; Real-Device |
| F13 | `season-series` trägt nur SNPP + NOAA-20, Live-Radar auch NOAA-21 `[verifiziert: historySeries.ts:118-122]` | Saison-Kachel vs. Live-Zahl könnten sich widersprechen | im Caption nennen; prüfen, ob NOAA-21 ins Batch soll (SP fehlt für NOAA-21 `[verifiziert: audit/waldbrand-firms.md:110]`) |
| F14 | Meteostat-Attribution im UI fehlt (Historie) `[verifiziert: audit/strategie-2026-07-31/seo-geo-recht.md:577]` | Lizenzpflicht | in Detailkarte + `/lizenzen` ergänzen (M5) |
| F15 | Windy-Stand (GFAS vs. FIRMS stündlich) | zwei widersprüchliche Quellen | nur relevant für den Marktvergleich; bei Bedarf Windy-Artikel 43910 im Browser lesen |
| F16 | AT amtliche Stufe: GeoSphere entwickelt einen neuen Index | Lücke bleibt bis dahin | GeoSphere-FAQ/Datahub halbjährlich prüfen; bis dahin „keine offene amtliche Stufe" |

---

## Anhang A — Verwendete Zahlen (Kurzliste mit Beleg)

- 5 881 Saison-Ereignisse 2026 (DE 5 349 · AT 368 · CH 164), 2 802 außerhalb weggelassen `[verifiziert: audit/brand-historie.md:259]`
- 2026 am Saisontag 174: 4 686 vs. Mittel 2 476 (Spanne 1 544–4 045) `[verifiziert: audit/brand-historie.md:420-422]`
- 97 % der Cluster ohne kartierte Entsprechung (263/272) `[verifiziert: audit/brandflaechen-echtzeit.md:56-59]`
- Detektionsraster = Median 10,3× kartierte Fläche `[verifiziert: audit/brandflaechen-echtzeit.md:92]`
- 85,4 % Sub-Pixel, Zentroid-Versatz Median 261 m `[verifiziert: audit/brandflaeche-vorlaeufig.md:26,127]`
- 604 Kalibrierpaare, σ 1,33 ln, LOO 78,8 % `[verifiziert: audit/aktivfeuer.md:570]`
- 218 Thermal-Standorte, 73,2 % `type 2`-Detektionen `[verifiziert: audit/thermalanomalien.md:16-19,113]`
- 1 111 Listenzeilen = 253 ms ⇒ Deckel 50 `[verifiziert: audit/waldbrand-cluster.md:177-185]`
- FRP p50 3,09 MW, max 372,86 MW `[verifiziert: audit/waldbrand-firms.md:320-322]`
- Überflugfenster Nacht 23–03 UTC, Tag 10–13 UTC `[verifiziert: audit/waldbrand-firms.md:256-261]`
- WBI 484→645 Stationen, Tag 0…+6, ~04:20 UTC `[verifiziert: audit/waldbrand-forecast.md:109,196]`
- smi 9 cm p50 0,13 / 81 cm p50 0,85; 67 % Zelländerung in 24 h `[verifiziert: audit/waldbrand-boden.md:95-105,125-131]`
- BLE 2025: 1 175 Waldbrände, 26,3 km² `[verifiziert: BLE-Pressemitteilung (Suchtreffer)]`
