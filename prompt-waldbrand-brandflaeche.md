# prompt-waldbrand-brandflaeche.md — Recherche + Kickoff: echte Brandflächen statt Punkte

> **Stand: 2026-08-15.** Recherche-Ergebnis zur Frage „wie bekomme ich eine **exakte Brandfläche**
> in die Karte statt nur Punkte?". Ordnet sich neben `prompt-waldbrand-dach.md` (WB0–WB5) und
> `prompt-waldbrand-ui.md` (WBU1) ein. Betrifft die bereits in `fireModel.ts:53` reservierte,
> aber **noch nicht gebaute** `FireLayerId` **`fireBurnt`** (z-Band 45, Akzent `terracotta`,
> Gruppe „Ausbaustufe 2", WB4).
>
> Alle Endpunkte in §2–§5 wurden am 2026-08-15 live gegen die Server geprüft. Wo etwas
> **nicht** verifiziert werden konnte, steht das ausdrücklich dabei.

---

## 0. Die kurze Antwort

**Es gibt genau eine amtliche, live abrufbare Polygonquelle für DACH: EFFIS `ms:modis.ba.poly`.**
Sie ist tagesaktuell, liefert **auch deutsche Kleinbrände ab ~1 ha** und ist CC BY 4.0. Der
Layername ist ein Legacy-Name — das Produkt ist längst multi-sensoriell (MODIS 250 m + VIIRS 375 m
+ **Sentinel-2 20 m seit 2018**).

Alles andere ist entweder **selten** (Copernicus EMS Rapid Mapping: exakt, aber nur bei
behördlicher Aktivierung), **kein Polygon** (GIBS-Raster), **abgeleitet** (Hülle aus Hotspots) oder
**nicht ohne Backend machbar** (Sentinel-2 dNBR selbst rechnen).

Die ehrliche Kaskade, in dieser Reihenfolge:

| Stufe | Was der Nutzer sieht | Geometrie | Latenz | Abdeckung DACH |
|---|---|---|---|---|
| **1** | **EFFIS-Brandfläche** (amtlich kartiert) | echtes Polygon | ~1–2 Tage | DE gut, AT/CH dünn |
| **2** | **Copernicus-EMS-Delineation** (Rapid Mapping) | exaktes Polygon, 10–20 m | ~29 h | DE 8 Brände seit 2024, AT 1, **CH nie** |
| **3** | **GIBS SWIR-Narbe** (Satellitenbild) | Rasterkachel | täglich | global |
| **4** | **VIIRS-Pixelraster** (Detektionsfußabdruck) | Rechtecke | Minuten | global |
| **5** | **Hüllkurve** aus Hotspot-Clustern | abgeleitetes Polygon | Minuten | global |

Stufe 1 + 2 sind **Brandflächen**. Stufe 3–5 sind **keine Brandflächen** und dürfen nicht so
beschriftet werden. Das ist die zentrale Aussage dieser Recherche.

---

## 1. Warum FIRMS/VIIRS niemals eine Brandfläche liefert

Die Zahl, die alles erklärt:

> **Ein VIIRS-Pixel bedeckt am Nadir ~14 ha. Ein MODIS-Pixel ~100 ha, am Scanrand bis ~1000 ha.**
> Der reale Brand **EMSR920/AOI02 (Langenfeld)** hatte laut Copernicus-EMS-Delineation
> **24,1 ha** — das sind **1,7 VIIRS-Pixel**. EMSR920/AOI01 (Hürtgenwald): 95,7 ha ≈ 7 Pixel.

NASA sagt es selbst, wörtlich:

> *„The hotspot 'location' is the center point of the pixel, which is not necessarily the
> coordinates of the actual fire."*

Ein typischer mitteleuropäischer Waldbrand ist also **kleiner als eine Handvoll Satellitenpixel**.
Deshalb: keine Punktwolke, kein Clustering und keine Hülle kann daraus eine Fläche machen. Sie
können nur eine **Detektionszone** zeigen.

Es gibt **kein Flächenfeld** in der FIRMS-CSV. `frp` ist Megawatt, `bright_ti4` ist Kelvin (und
sättigt bei ~367 K). Kein Feld beschreibt Ausdehnung oder Umriss.

---

## 2. STUFE 1 — EFFIS `ms:modis.ba.poly` ⭐ die Kernquelle

### 2.1 Der Request (getestet, liefert DACH-Daten)

```
https://maps.effis.emergency.copernicus.eu/effis
  ?service=WFS&version=1.1.0&request=GetFeature
  &typeName=ms:modis.ba.poly
  &outputformat=geojson
  &srsName=EPSG:4326
  &bbox=5.5,45.5,17.2,55.1
  &sortBy=FIREDATE+D
  &maxfeatures=300
```

Reale Antwort vom 2026-08-15 (Auszug):

| ID | FIREDATE | COUNTRY | PROVINCE | AREA_HA | CLASS |
|---|---|---|---|---|---|
| 627270 | 2026-08-13 | **DE** | **Harz** | 1 | 7DAYS |
| 627271 | 2026-08-12 | **DE** | **Hochsauerlandkreis** | 7 | 7DAYS |
| 627261 | 2026-08-11 | **DE** | **Lüneburg** | 6 | 7DAYS |
| 616541 | 2026-08-10 | **DE** | **Main-Kinzig-Kreis** | 15 | 7DAYS |
| 627420 | 2026-08-13 | IT | Udine | 27 | 7DAYS |

Sizing vorab (billig, ein Feld):

```
…&request=GetFeature&typeName=ms:modis.ba.poly&resulttype=hits&bbox=5.5,45.5,17.2,55.1
→ numberOfFeatures="1266"      // das GESAMTE DACH-Archiv seit 2016
```

1266 Polygone für ganz DACH über zehn Jahre — das ist klein genug, um **einmal pro Sitzung**
geholt und **clientseitig** nach Datum/`CLASS` gefiltert zu werden. Kein Edge-Function-Eingriff,
kein neuer Transportpfad.

### 2.2 Vier harte Fallen — bitte wörtlich übernehmen

**(a) `outputFormat=application/json` funktioniert NICHT.**
Der MapServer will `outputformat=geojson` (kleingeschrieben, MapServer-Alias).

**(b) Achsenreihenfolge kippt zwischen WFS 1.1.0 und 2.0.0.** Gemessen:

| Version | bbox `5.5,45.5,17.2,55.1` | Treffer |
|---|---|---|
| **1.1.0** | lon,lat | **1266** ✅ |
| 2.0.0 | lon,lat | 0 ❌ |
| 2.0.0 + `,urn:ogc:def:crs:EPSG::4326` | lat,lon | 0 ❌ |

→ **WFS 1.1.0, `typeName` (Singular), lon,lat.** Das ist derselbe Achsen-Fallstrick, für den ihr
`sources/wfsAxis.ts` schon habt — der Helper ist hier wiederverwendbar.

**(c) `maxfeatures` schneidet die JÜNGSTEN Daten ab — euer V-224, hier unabhängig reproduziert.**
Ohne `sortBy` sortiert der Server nach `id` aufsteigend; die erste ungefilterte Abfrage lieferte
Feature `id=2` mit FIREDATE **2016-08-28**. → **`sortBy=FIREDATE+D` ist verpflichtend**, sonst
zeigt die Karte zehn Jahre alte Brände als „aktuell".

**(d) `CQL_FILTER` liefert HTTP 403.** Getestet mit `CQL_FILTER=COUNTRY IN ('DE','AT','CH')`.
Ob MapServer oder vorgelagerte WAF, war nicht auflösbar. Der OGC-XML-`FILTER`-Parameter konnte
**gar nicht** getestet werden → ungetestet, nicht „kaputt". **Plane keine serverseitigen
Attributfilter ein**, bevor das im Browser gegengeprüft ist. `bbox` + `sortBy` + `resulttype=hits`
funktionieren sicher.

### 2.3 Attributfelder (aus `DescribeFeatureType`)

```
msGeometry (Polygon), id, FIREDATE, FINALDATE, LASTUPDATE,
COUNTRY, PROVINCE, COMMUNE, AREA_HA,
BROADLEA, CONIFER, MIXED, SCLEROPH, TRANSIT, OTHERNATLC,
AGRIAREAS, ARTIFSURF, OTHERLC, PERCNA2K, CLASS
```

Implementierungsrelevant:

- **Feldnamen sind GROSSGESCHRIEBEN** — `AREA_HA`, nicht `area_ha`.
- **Alle Werte sind Strings**, auch `AREA_HA` (`"67"`). Vor Sortieren/Rechnen casten.
- Datumsformat `"2026-08-13 20:56:00"` — Leerzeichen, **kein ISO-`T`**. `new Date(...)` ist damit
  in Safari unzuverlässig → vorher `.replace(' ', 'T')`.
- `BROADLEA`…`OTHERLC` = **CORINE-Landbedeckungsanteile der Brandfläche in %**, summieren auf 100.
  Das ist ein fertiger Steckbrief-Inhalt: „53 % Agrarfläche, 19 % Nadelwald". Und es verbindet sich
  direkt mit eurer bestehenden `clcMask.ts`.
- `PERCNA2K` = % innerhalb **Natura 2000** → verbindet sich mit `euContext.ts`.
- `CLASS` — beobachtet: **`7DAYS`** (frisch) und **`FireSeason`** (Archiv). Ein `30DAYS` ist
  plausibel, wurde aber **nicht gesehen**. Nicht darauf verlassen.

### 2.4 Latenz, Auflösung, Schwellwert

**Gemessene Latenz:** `FIREDATE` 2026-08-13 20:56 → `LASTUPDATE` 2026-08-14 13:39 = **~17 h**.
An der Spitze lag der jüngste Datensatz am 15.08. beim **13.08.** → faktisch **1–2 Tage Rückstand**.
Offizieller Takt: 2–3× täglich.

**Die 30-ha-Schwelle ist für DACH irreführend.** EFFIS schreibt „approximately 30 hectares … the
product may also include perimeters of burned areas of smaller dimension". Die Messung widerspricht
deutlich: `AREA_HA` in der DACH-Abfrage = **1, 1, 1, 1, 2, 4, 6, 7, 7, 15, 16, 27**. Grund:
Sentinel-2 (20 m) ist seit 2018 eingemischt. **Ohne Sentinel-2 wäre der Layer für DACH leer** —
mit ihm ist er brauchbar.

⚠️ Aber: **Sentinel-2 ist eingeschmolzen, nicht separat.** Es gibt kein Sensor-Attribut. Ein 1-ha-
Polygon ist faktisch S2, ein 500-ha-Polygon eher MODIS — das ist **Heuristik, keine Metadaten-
aussage**. In der UI **nicht behaupten**, welcher Sensor ein Polygon erzeugt hat. `ms:s2.ba.poly`,
`ms:effis.ba.poly`, `ms:nrt.ba.poly`, `ms:modis.ba.poly.2026` wurden sondiert → **existieren nicht**.

### 2.5 Lizenz

**CC BY 4.0**, „European Union, 1995–2025". Keine Registrierung, keine NC-Klausel. Vorschlag:

> © European Union, Copernicus EMS — EFFIS (Rapid Damage Assessment), CC BY 4.0

**Lizenzpflicht: auf Änderungen hinweisen.** Wenn ihr die Polygone fürs Rendering vereinfacht
(Douglas-Peucker), ist das eine Änderung und gehört in den Steckbrief.

### 2.6 Was EFFIS **nicht** hat

- ❌ **Kein NRT-Perimeter-Produkt** getrennt von der saisonalen RDA-Fläche. Die EFFIS-Modulliste
  (Fire Danger, Active Fire Detection, RDA, FDA, Emissions, Risk, Forecast, Fire Database, Fuels)
  enthält kein NRT-Perimeter-Modul. `CLASS='7DAYS'` ist das Nächstliegende.
- ❌ **GWIS hat keinen `ba.poly`-Layer** — 4 Sondierungen, konsistent negativ. Die GWIS-Brandfläche
  basiert auf MCD64A1, ist laut JRC ausdrücklich *„not near real time"* (Ereignisse brauchen
  *„more than one month"*) und wird als **TIFF-Raster** ausgeliefert. → **Polygone: EFFIS.
  Hotspots: GWIS/FIRMS. Nicht vermischen.**
- ❌ Kein jahresspezifischer Layer → Zeitfilterung nur über `sortBy` + Client.
- ⚠️ **AT/CH-Abdeckung unbelegt.** In den 20 aktuellsten DACH-Features: nur DE, IT, FR. Plausibel
  (Saison/Lage), aber die UI darf AT/CH-Abdeckung **nicht versprechen**, bevor eine Archivabfrage
  sie belegt. Das ist derselbe Fall wie die AT-Lücke beim Gefahrenindex.
- ⚠️ **CORS nicht direkt gemessen** (keine Header-Auslesung in der Recherche-Umgebung möglich).
  Starke Indizien: ihr holt `ms:viirs.hs` bereits clientseitig vom **selben Host** — `/effis` und
  `/gwis` sind derselbe Apache/MapServer, nur anderer Pfad; CORS wird auf VHost-Ebene gesetzt.
  Trotzdem: eine Zeile in die L0-Sonde.

---

## 3. STUFE 2 — Copernicus EMS Rapid Mapping: die exakten Perimeter

Ihr habt EMS bereits — aber **nur als Abzeichen** (`sources/emsActivations.ts`, Centroid + 25 km
Radius). **Die Geometrien liegen ein Endpunkt tiefer.**

### 3.1 Der Weg zu den Polygonen

Ihr nutzt heute:
```
https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/
```

Das ist die Übersicht. Der **Detailendpunkt** liefert den vollen Baum
`aois[] → products[] → versions → layers[]` inkl. `downloadPath`, `fileName`, `format` **und
Statistiken (verbrannte Fläche in ha)**:

```
https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/?code=EMSR920
```

Verifiziert für EMSR920 (Hürtgenwald, aktiv):

```
AOI01 Huertgen Forest  — DEL, Sentinel-2, finalized — 95,7 ha verbrannt (95,7 ha Wald)
AOI02 Langenfeld       — DEL, Sentinel-2, finalized — 24,1 ha verbrannt (14,6 ha Wald)
AOI03 Hautes-Fagnes/BE — DEL, waiting
```

Die eigentliche Brandfläche liegt als Datei im S3-Bucket:

```
https://rapidmapping-viewer.s3.eu-west-1.amazonaws.com/EMSR920/AOI01/DEL_PRODUCT/
  EMSR920_AOI01_DEL_PRODUCT_observedEventA_v1.json   ← DIE BRANDFLÄCHE
  EMSR920_AOI01_DEL_PRODUCT_observedEventA_v1.sld    ← OGC-Style dazu
  EMSR920_AOI01_DEL_PRODUCT_notAnalysedA_v1.json
```

CEMS-Vokabular: `A` = Area, `L` = Line, `P` = Point. `observedEventA` ist die kartierte Fläche.

⚠️ **Nicht abschließend belegt:** Der S3-Bucket liefert `.json` mit einem Content-Type, den der
Recherche-Fetcher als Binärdaten behandelt hat. Dass es **GeoJSON** ist, ist stark indiziert (die
CEMS-Harvest-Doku nennt GeoJSON, und ein SLD stylt Vektor-Features), **muss aber im Browser
belegt werden** — zusammen mit CORS auf `*.s3.eu-west-1.amazonaws.com`. Das ist der L0-Auftrag.

### 3.2 Raster-Fallback, falls CORS auf S3 scheitert

Pro Aktivierung existiert ein fertig gecachter ArcGIS-Tile-Service — eine Zeile MapLibre:

```
https://tiles.arcgis.com/tiles/rNFYfizUMWjwfBKB/arcgis/rest/services/EMSR920_latest/MapServer
  /tile/{z}/{y}/{x}     EPSG:3857, 256 px, Zoom 4–15
  Layer: Delineation-Areas, Latest observations, Grading, Area of interest
```

⚠️ Nur an EMSR843 verifiziert, dass der Cache existiert — nicht, dass jede Aktivierung einen hat.
Ein **öffentlicher Vektor-FeatureServer existiert nicht** (`services.arcgis.com/rNFYfizUMWjwfBKB/…`
→ 400 Invalid URL). Nur Raster.

### 3.3 Latenz — gemessen an EMSR901 (Primstal, Saarland)

| Schritt | Zeitpunkt |
|---|---|
| Ereignis | 2026-07-23 15:30 |
| Aktivierung | 2026-07-23 19:16 (+3 h 46) |
| Sentinel-2-Aufnahme | 2026-07-24 10:27 |
| **DEL-Produkt geliefert** | **2026-07-24 20:26 — +29 h nach Ereignis** |

Grading wurde hier vom Nutzer storniert → die UI muss `Waiting` / `Finalized` / `Cancelled`
abbilden, sonst zeigt sie eine Fläche an, die es nicht gibt.

### 3.4 Abdeckung — die ernüchternde Zahl

| Land | Aktivierungen gesamt | davon Wildfire |
|---|---|---|
| **DE** | 68 | **8 seit 2024** (EMSR920, 901, 886, 875, 874, 810, 804, 752) |
| **AT** | 11 | **1** (EMSR549, Hirschwang, 2021) |
| **CH** | **1** | **0 — nie eine Waldbrand-Aktivierung** |

DE ist 2026 auffällig aktiv: fünf Waldbrand-Aktivierungen allein Mai–August.

⚠️ **`category=fire` als Query-Parameter filtert NICHT** — bei `?category=fire&countries=DE` kamen
Flood- und Other-Aktivierungen zurück. **Clientseitig auf `category.slug === 'fire'` filtern.**
`countries=DE|AT|CH` und `ordering=-activationTime` funktionieren dagegen korrekt.

**Lizenz:** frei und offen, kommerzielle Nutzung nicht untersagt, **Quellenangabe Pflicht**:
„European Union / Copernicus Emergency Management Service". Habt ihr in `EMS_ATTRIBUTION` schon.

---

## 4. STUFE 3 — NASA GIBS: die Brandnarbe *sehen*, ohne sie zu vektorisieren

Kostenlos, **kein API-Key**, tagesaktuell. Am 2026-08-15 per `describedomains` gegen den Live-Dienst
geprüft:

| Layer | Zeitbereich bis | TMS | Format |
|---|---|---|---|
| `VIIRS_NOAA20_CorrectedReflectance_BandsM11-I2-I1` | **2026-08-15** | `GoogleMapsCompatible_Level9` | `.jpg` |
| `MODIS_Terra_CorrectedReflectance_Bands721` | **2026-08-15** | `GoogleMapsCompatible_Level9` | `.jpg` |
| `VIIRS_NOAA20_Thermal_Anomalies_375m_All` | **2026-08-15** | `GoogleMapsCompatible_Level9` | `.png` |
| `MODIS_Combined_MCD64A1_Burned_Area` | — | — | **404 — existiert nicht** |

```js
map.addSource('gibs-swir', {
  type: 'raster',
  tiles: ['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/' +
          'VIIRS_NOAA20_CorrectedReflectance_BandsM11-I2-I1/default/' +
          '2026-08-14/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg'],
  tileSize: 256,
  maxzoom: 9,
  attribution: 'NASA EOSDIS GIBS',
});
```

In dieser SWIR-Falschfarbe erscheinen frische Brandnarben **rotbraun**, aktive Feuerfronten
leuchtend rot-orange. Der Nutzer sieht die Fläche — nur eben als Bild, nicht als Geometrie.

**Details, die sonst Zeit kosten:**

- ⚠️ Achsenreihenfolge ist **`{z}/{y}/{x}`** (TileMatrix/TileRow/TileCol), nicht `{z}/{x}/{y}`.
  MapLibre kann das, weil es namentlich ersetzt.
- Kacheln sind **256×256**; `maxzoom` **muss** auf die Level-Zahl gesetzt werden (Level9 → z0–8
  nativ, MapLibre überzoomt darüber sauber).
- Level9 ≈ **250 m/px**. Für einen 20-ha-DACH-Brand sind das **1–3 Pixel** — ehrlich gesagt nur bei
  größeren Ereignissen sichtbar. Level13 (19 m) gibt es, aber nicht für diese Composites.
- Domain-Sharding (`gibs-a/b/c`) ist unter HTTP/2 überflüssig — nicht nutzen.
- ⚠️ **CORS nicht empirisch belegt.** GIBS dokumentiert es nirgends. Indizien sind stark (NASA
  Worldview ist eine Browser-App, die cross-origin gegen genau diesen Host lädt; GIBS dokumentiert
  Leaflet/OpenLayers/Cesium-Nutzung). Für euren Gate-Standard: `curl -I -H "Origin: https://buscosun.com"`
  gehört in die Diagnose. Rate-Limits/AUP sind ebenfalls nicht dokumentiert.

---

## 5. STUFE 4+5 — aus den Punkten, die ihr schon habt

### 5.1 VIIRS-Pixel-Footprint — null neue Bytes

Die FIRMS-CSV, die ihr bereits ladet, enthält `scan` und `track` — **Along-Scan- und
Along-Track-Pixelgröße in km**. NASA: *„Scan and track reflect actual pixel size."* `latitude`/
`longitude` sind der **Pixelmittelpunkt**.

```
dLat = (track / 2) / 111.320
dLon = (scan  / 2) / (111.320 * cos(lat * π/180))

Ecken: (lon−dLon, lat−dLat), (lon+dLon, lat−dLat),
       (lon+dLon, lat+dLat), (lon−dLon, lat+dLat), Ring schließen
```

⚠️ Für DACH (47–55 °N) liegt `cos(lat)` bei 0,68–0,57 — die **Longitude-Halbbreite ist 1,5–1,8×
größer** als die Latitude-Halbhöhe. Wer das vergisst, malt sichtbar zu schmale Kacheln.

⚠️ Ehrliche Grenze: der echte Fußabdruck ist ein um den Scan-Azimut **rotiertes** Viereck
(sonnensynchron, ~98,7° Bahnneigung). `scan`/`track` geben nur Kantenlängen, **nicht die
Orientierung** — die ist aus der CSV nicht rekonstruierbar. Die achsparallele Variante ist
allerdings genau das, was FIRMS selbst rendert.

**Nutzen:** Rechtecke statt Punkte, per `dissolve` verschmolzen, ergeben eine deutlich lesbarere
Brandzone als eine Punktwolke — **ohne ein einziges zusätzliches Byte Netzlast** (Z2-Logik).
Zwingend beschriftet als **„Detektionsraster (Satellitenpixel)"**, nie als Brandfläche, mit Hinweis
dass Randpixel deutlich größer sind.

### 5.2 Hüllkurve — DBSCAN + concaveman

Gemessene Bundlegrößen (min+gzip):

| Paket | gzip | Deps |
|---|---:|---:|
| `@turf/clusters-dbscan` | **3.899 B** | 7 |
| `concaveman` | **5.015 B** | 4 |
| `hull.js` | 1.703 B | 0 |
| `@turf/concave` | 7.364 B | 10 |
| `@turf/union` | 16.378 B | 5 |
| **`@turf/buffer`** | **65.599 B** ⚠️ | 9 |

> ⚠️ **`@turf/buffer` ist ein 65-kB-Brocken** — es zieht die komplette `turf-jsts`-Engine mit.
> Für eine App mit sechs Runtime-Dependencies und D-06 („keine neue Runtime-Dependency") ist das
> ein echter Eingriff. `@turf/union` hat dasselbe Problem kleiner.

**Minimalkombination: `@turf/clusters-dbscan` + `concaveman` = ~8,9 kB gzip, kein `turf-jsts`.**
`concaveman` direkt statt `@turf/concave` ist auch qualitativ besser — `@turf/concave` geht über
eine TIN-Triangulierung und liefert bei ungünstigem `maxEdge` gern `null` oder zerfallende
MultiPolygone.

```js
const clustered = clustersDbscan(firmsPoints, 1.5, { units: 'kilometers', minPoints: 3 });
const hull = concaveman(clusterCoords, 2, 0.01);   // concavity 2 = deutlich konkav
```

NASAs eigenes **FEDS/fireatlas** macht exakt das (Alpha-Hull über VIIRS, alle 12 h neu) — aber
**nur für CONUS, Kanada, Alaska, Nordmexiko. Europa nicht.** Als Referenzimplementierung trotzdem
lesenswert: `https://earth-information-system.github.io/fireatlas/docs/nrt.html`

### 5.3 Fünf Genauigkeitsgrenzen, die in die UI gehören

1. **±375 m Ortsunschärfe** ist prinzipiell — bei einem 20-ha-Brand (≈450 m Kantenlänge) ist das
   die Größenordnung des Objekts selbst.
2. **Detektiert wird die Feuerfront, nicht die Fläche.** Hinter der Front liegen keine Punkte mehr
   → die Hülle **unterschätzt systematisch**. Umgekehrt liegen Punkte oft außerhalb (Funkenflug).
3. **Überflugslücken:** 2–4 VIIRS-Überflüge/Tag über DACH. Nachts und bei Bewölkung fehlen
   Detektionen. Die Hülle zeigt **den Stand der letzten Überflüge**, nicht „jetzt".
4. **Hülle füllt Löcher:** unverbrannte Inseln, Straßen, Gewässer, Felsflächen erscheinen als
   verbrannt. In der kleinteiligen DACH-Landschaft ist der Fehler relativ groß.
5. **Parameterabhängig:** `concavity` und DBSCAN-`maxDistance` sind freie Parameter ohne
   physikalische Begründung. Zwei plausible Parametersätze liefern Flächen, die sich um **Faktor
   1,5–2** unterscheiden. Eine daraus abgeleitete Hektar-Zahl ist **keine Messgröße**.

**Formulierungsvorschlag:** nicht „Brandfläche", sondern
**„Umgriff der Satelliten-Hitzepunkte (VIIRS 375 m, letzte 24 h) — keine amtliche
Brandflächenkartierung"**, mit Deep-Link auf EFFIS. Und: **gestrichelte/unscharfe Kante statt
scharfer Polygonlinie.** Die Signatur muss die Unschärfe optisch transportieren, sonst liest der
Nutzer eine Präzision hinein, die nicht da ist.

---

## 6. Was NICHT geht — und warum

### 6.1 Sentinel-2 selbst rechnen (CDSE / Sentinel Hub) ❌ nicht öffentlich

Endpunkte und Custom Scripts existieren und wären technisch elegant:

- OAuth2: `https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token`
- WMS: `https://sh.dataspace.copernicus.eu/ogc/wms/<INSTANCE_ID>` — **braucht keinen Token**, die
  `INSTANCE_ID` in der URL *ist* die Auth. MapLibre könnte direkt darauf zeigen.
- Fertige Skripte: `burned_area_ms` (Schwellwert-Klassifikation), **`burned_area`** (echtes dNBR,
  multitemporal), `nbr`, `bais2`, `markuse_fire` — alle auf `custom-scripts.sentinel-hub.com`.

**Die Rechnung, die es killt.** Free Tier („Copernicus General User"): **10.000 Processing Units
und 10.000 Requests pro Monat.** Eine Burn-Scar-Kachel 512×512 mit 6 Bändern kostet:

```
Pixel (512×512)/262144 = 1,0  ×  Bänder 6/3 = 2,0  ×  PNG 1,0  =  2,0 PU/Kachel
```

→ **5.000 Kacheln im Monat.** Ein Desktop-Viewport zieht 8–16 Kacheln, eine Sitzung mit Zoomen
30–60. Das heißt: **~100–150 Nutzersitzungen pro Monat.** Bei dNBR (2 Szenen) halbiert sich das
nochmal. Ein öffentlich beworbener Layer auf buscosun.com ist nach wenigen Stunden tot — und die
`INSTANCE_ID` steht im Klartext im ausgelieferten JS, **ohne Referrer-Locking**.

Und selbst wenn: **die Process API gibt PNG/TIFF zurück, keine Polygone.** Zwischen „rot
eingefärbtes Raster" und „exaktes Polygon" liegt eine komplette Vektorisierung.

### 6.2 openEO serverseitig vektorisieren ❌ Latenz + experimentell

- `raster_to_vector` existiert auf CDSE, ist aber **als `experimental` markiert** und im Forum mit
  offenen Fehlern dokumentiert.
- Synchron (`openeosh`): max. 2500×2500 px, **nur ein Zeit-Slice** → **dNBR ausgeschlossen**.
- Synchron (`openeofed`): laut Doku nur „a couple of minutes at most"; das Minimalbeispiel braucht
  **~2 min**.
- Batch: **∅ 30 min pro Job**, asynchron über STAC.

Für Netlify Edge Functions (Sekunden-CPU-Budget) chancenlos. **Denkbar wäre nur ein
GitHub-Actions-Cron** mit Tagesprodukt nach `public/` — aber das ist Cron-Mechanik und damit
**STOPP & FRAGEN**.

### 6.3 GlobFire ⚠️ Archiv, kein Live-Pfad

`JRC/GWIS/GlobFire/v2/DailyPerimeters` + `FinalPerimeters`, CC-BY-4.0, Attribute `Id`,
`InitialDate` (ms epoch), `FinalDate`, `area` (m²). **Aber:** GEE-Zeitraum nur 2001–2021 (laut GWIS
bis 2023, Latenz ~2 Monate), Auflösung von MCD64A1 geerbt = **500 m** (grobe, gezackte Perimeter),
**kein WFS, kein ArcGIS, kein direkter Shapefile-Download**. Zugriff realistisch nur über Google
Earth Engine.

→ Falls überhaupt: **einmaliger GEE-Export der DACH-BBox als statisches GeoJSON ins Repo**, klar
als „bis 2023, MODIS 500 m" beschriftet. Reiner Historien-Layer. Kein Live-Pfad.

### 6.4 Nationale Quellen DACH ❌ praktisch nichts

| Quelle | Befund |
|---|---|
| **Thünen FNEWs** | WMS + PostgREST offen, **CC-BY-SA 4.0** — aber kartiert **Waldstörungen allgemein** (Sturm, Dürre, Borkenkäfer), **kein waldbrandspezifisches Produkt**, **jährlicher** Zyklus, primär GeoTIFF. Für einen Brandlayer unbrauchbar; allenfalls Kontext „Waldzustand". |
| **DLR/ZKI** | `activations.zki.dlr.de/de/activations/featureCollection.json` (GeoJSON) + GeoRSS, 159 Aktivierungen 2003–2026 inkl. DE-Waldbränden. ⚠️ **Geometrie = ausschließlich Point.** Kartenprodukte nur „für Behörden mit berechtigtem Interesse" nach Anfrage. **Keine Lizenzangabe.** → Ereignis-Index, keine Polygonquelle. |
| **AT: BOKU/BFW Waldbrand-Datenbank** | >7000 Ereignisse seit 2008, öffentliches WebGIS. ⚠️ **Punktgeometrie, keine API, kein WFS, keine Lizenzangabe.** Datenauszug nur auf Anfrage. Ohne schriftliche Freigabe nicht einbaubar. |
| **CH: WSL Swissfire** | *„zurzeit passwortgeschützt … kann von den kantonalen und eidgenössischen Verantwortlichen benutzt werden"*. **Sackgasse.** |
| **NIFC/WFIGS-Perimeter** (die man im FIRMS-Viewer sieht) | **USA-only.** Kein Europa-Äquivalent. |

**Konsequenz für die Schweiz:** 0 CEMS-Waldbrandaktivierungen jemals + Swissfire geschlossen +
EFFIS-Abdeckung unbelegt ⇒ **die Schweiz bleibt beim Brandflächen-Layer eine Lücke.** Nach eurem
Ehrlichkeitsprinzip muss sie **als Lücke ausgewiesen** werden — genau wie die AT-Lücke beim
Gefahrenindex — nicht als leere Karte.

---

## 7. Empfehlung: Phasenschnitt

### Phase BA1 — `fireBurnt` mit EFFIS (Gate GWBBA1) ⭐ das ist die Antwort auf deine Frage

Ein Request, ein neuer Source-File, kein Transporteingriff, keine neue Dependency:

```
src/fire/sources/effisBurntArea.ts
```

- WFS 1.1.0 GeoJSON, `sortBy=FIREDATE+D`, `maxfeatures=300`, `resulttype=hits` vorgeschaltet.
- `wfsAxis.ts` wiederverwenden (lon,lat für 1.1.0).
- MapLibre `fill` (terracotta, ~0.35 Deckkraft) + `line` (voll deckend, 1.5 px).
- Frisch-Marker: `CLASS === '7DAYS'` → kräftigere Farbe; `FireSeason` → gedämpft.
- Popup/Steckbrief aus `PROVINCE`, `FIREDATE`, `AREA_HA`, den CORINE-Anteilen und `PERCNA2K`.
  ⚠️ `AREA_HA` ist gerundet und bei Kleinbränden oft `"1"` — als **Größenordnung** formulieren,
  nicht als Messwert.
- Steckbrief-Pflichtsätze: „amtlich kartiert, aber **1–2 Tage Verzug**"; „Schwerpunkt Sentinel-2
  20 m seit 2018"; „Abdeckung AT/CH nicht belegt"; „kein amtliches Warnprodukt".
- Zeitachse: der bestehende Tagesregler filtert clientseitig auf `FIREDATE`.
- `officialSources.ts` + `scripts/seo/licenses.mjs §NON_MODEL_SOURCES` erweitern.

### Phase BA2 — EMS-Delineation aus dem Abzeichen zur Fläche

`emsActivations.ts` um den `public-activations/?code=` -Detailabruf erweitern; bei
`format === 'vt'|'cog'` und `finalized` die `observedEventA_v1.json` laden. **Nur nach L0-Beleg von
CORS + Format.** Fallback: der ArcGIS-`_latest/MapServer`-Raster-Tile-Layer.

Das ist der **einzige** Weg zu einer wirklich exakten, 10–20-m-genauen Brandfläche — dafür nur bei
Großereignissen (2026 in DE aber immerhin fünfmal).

### Phase BA3 — Detektionsraster + GIBS-Narbe (optional)

VIIRS-Pixelrechtecke aus der vorhandenen CSV (null neue Bytes) und der GIBS-SWIR-Rasterlayer.
Damit sieht der Nutzer **vier Dinge nebeneinander**:

- **Hitzepunkte** — gemessen
- **Pixelraster** — der Fußabdruck der Messung
- **SWIR-Narbe** — gesehen
- **EFFIS-Polygon** — amtlich kartiert, sobald verfügbar

Der visuelle Kontrast zwischen Pixelraster und EFFIS-Polygon ist selbst das beste
Ehrlichkeits-Argument — er zeigt dem Nutzer, warum Punkte keine Fläche sind.

---

## 8. L0-Sonde vor BA1 — was im Browser zu belegen ist

1. **CORS** auf `maps.effis.emergency.copernicus.eu/effis` (WFS GetFeature) — Header messen, nicht
   annehmen. Einzeiler für die Konsole:
   ```js
   fetch("https://maps.effis.emergency.copernicus.eu/effis?service=WFS&version=1.1.0&request=GetFeature&typeName=ms:modis.ba.poly&maxfeatures=1&outputformat=geojson&srsName=EPSG:4326&bbox=5.5,45.5,17.2,55.1&sortBy=FIREDATE+D")
     .then(r => r.json()).then(d => console.log(d.features[0].properties))
   ```
2. **Vollständige Layerliste** per GetCapabilities im Browser ziehen — der Recherche-Fetcher lief
   in Read-Timeouts, die Layerliste in §2 ist per `DescribeFeatureType`-Sonde belegt, **nicht als
   vollständige Enumeration**.
3. **XML-`FILTER`** gegenprüfen (CQL_FILTER → 403, XML ungetestet).
4. **AT/CH-Abdeckung** per Archivabfrage belegen, bevor die UI sie verspricht.
5. **CORS + Format** auf `rapidmapping-viewer.s3.eu-west-1.amazonaws.com` (für BA2).
6. **CORS** auf `gibs.earthdata.nasa.gov` (für BA3).

⚠️ Falls einer dieser Hosts kein `Access-Control-Allow-Origin` sendet: ein Proxy wäre eine
Edge-Function-Änderung → **STOPP & FRAGEN (Jan)** nach `CLAUDE.md`.

---

## Quellen

- EFFIS: [Rapid Damage Assessment](https://forest-fire.emergency.copernicus.eu/about-effis/technical-background/rapid-damage-assessment) · [Active Fire Detection](https://forest-fire.emergency.copernicus.eu/about-effis/technical-background/active-fire-detection) · [Downloads Instructions](https://forest-fire.emergency.copernicus.eu/downloads-instructions) · [Data License](https://forest-fire.emergency.copernicus.eu/about-effis/data-license) · [User Guide PDF](https://data.effis.emergency.copernicus.eu/effis/reports-and-publications/effis-related-publications/effis-userguide-23.pdf)
- Copernicus EMS: [How to harvest CEMS Mapping data](https://mapping.emergency.copernicus.eu/about/how-to-harvest-cems-mapping-data/) · [Emergency Response data](https://mapping.emergency.copernicus.eu/about/how-to-harvest-cems-mapping-data/emergency-response-data/) · [Terms and conditions](https://mapping.emergency.copernicus.eu/terms-and-conditions/) · [Rapid Mapping Viewer](https://rapidmapping.emergency.copernicus.eu/)
- JRC/GWIS: [Burnt Areas](https://gwis.jrc.ec.europa.eu/about-gwis/technical-background/burnt-areas) · [JRC-Katalog Burnt area](https://data.jrc.ec.europa.eu/dataset/e6f7a4e7-1f64-4ba9-9363-6bc864ab4666) · [GlobFire Daily Perimeters (GEE)](https://developers.google.com/earth-engine/datasets/catalog/JRC_GWIS_GlobFire_v2_DailyPerimeters) · [Artés et al. 2019](https://www.nature.com/articles/s41597-019-0312-2)
- NASA: [VIIRS I-Band 375 m Active Fire Data](https://www.earthdata.nasa.gov/data/instruments/viirs/viirs-i-band-375-m-active-fire-data) · [Why Do Fires on NASA's Maps Look Bigger](https://www.earthdata.nasa.gov/news/feature-articles/why-do-fires-nasas-maps-sometimes-look-bigger-than-really-are) · [FIRMS FAQ](https://www.earthdata.nasa.gov/data/tools/firms/faq) · [GIBS Access Basics](https://nasa-gibs.github.io/gibs-api-docs/access-basics/) · [GIBS Available Visualizations](https://nasa-gibs.github.io/gibs-api-docs/available-visualizations/) · [FEDS/fireatlas NRT](https://earth-information-system.github.io/fireatlas/docs/nrt.html)
- CDSE: [Quotas and Limitations](https://documentation.dataspace.copernicus.eu/Quotas.html) · [Processing Unit definition](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Overview/ProcessingUnit.html) · [Sentinel Hub WMS](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/OGC/WMS.html) · [openEO](https://documentation.dataspace.copernicus.eu/APIs/openEO/openEO.html) · [Forum: Vectorization](https://forum.dataspace.copernicus.eu/t/vectorization/3364) · [Custom Scripts: burned_area](https://custom-scripts.sentinel-hub.com/custom-scripts/sentinel-2/burned_area/) · [burned_area_ms](https://custom-scripts.sentinel-hub.com/custom-scripts/sentinel-2/burned_area_ms/)
- National: [FNEWs-Wald Geoportal](https://www.fnews-wald.de/geoportal) · [ZKI Aktivierungen](https://activations.zki.dlr.de/de/activations/) · [BOKU Waldbrand-Datenbank](https://boku.ac.at/oekb/wald/forschung/themen/bewirtschaftungskonzepte/waldbewirtschaftung-und-klimaaenderung/waldbrand/waldbrand-datenbank) · [WSL Swissfire](https://www.wsl.ch/de/services-produkte/swissfire/) · [WFIGS Current Interagency Fire Perimeters (US)](https://data-nifc.opendata.arcgis.com/datasets/nifc::wfigs-current-interagency-fire-perimeters/about)
