# API.md — Externe Datenschnittstellen

> **Stand: 2026-08-08** (§8.2 MeteoAlarm korrigiert — Belege in `audit/warnungen-at-ch.md`;
> übrige Inhalte Stand 2026-08-05).
> Kontraktdokumentation aller externen Endpunkte, die buscosun heute nutzt
> oder für die 2D-Layer-Erweiterung nutzen soll. buscosun bietet **keine eigene API an** (D-01:
> client-only, kein Backend) — dieses Dokument beschreibt ausschließlich die **konsumierten**
> Schnittstellen.
>
> Zugehörig: `docs/DATA_SOURCES.md` (Bewertung und Auswahl) · `docs/MAP.md` §3 (Transport) ·
> `docs/2d-layer-erweiterung.md` (Umsetzung) · `architecture.md` §10 (Deployment).
>
> **Marker:** ✅ live verifiziert (2026-08-05) · ⚠️ abgeleitet · ❌ unverifiziert

---

## 1. Transportregeln

### 1.1 Die drei Wege

| Weg | Wann | Beispiele |
|---|---|---|
| **Direkt** (`fetch` aus dem Browser) | Quelle sendet CORS-Header | `maps.dwd.de`, `data.geo.admin.ch`, `api.brightsky.dev`, `warnungen.zamg.at` |
| **Netlify-Rewrite** (200, same-origin) | Quelle sendet **kein** CORS, aber keine Aufbereitung nötig | `/_dwd_opendata`, `/_gfs`, `/_cscs`, `/_mf`, `/_ecmwf` |
| **Netlify Edge Function** | zusätzlich Durable Cache und/oder Härtung nötig | `/_dwd_wind`, `/_dwd_grib` |

Der Rewrite-Trick steht in `netlify.toml` erklärt: `status = 200` macht daraus einen *Rewrite*
statt einer Weiterleitung — der Browser behandelt die Antwort als same-origin und die CORS-Sperre
greift nicht.

⚠️ **Bekannter Produktionsdefekt (A1 / V-01):** `/_mf`, `/_ecmwf` und `/_cscs` existieren in
`netlify.toml`, waren aber historisch nur im Vite-Dev-Proxy vorhanden. Status vor jeder neuen
Transportarbeit gegen die Prod-Umgebung prüfen.

### 1.2 Regel für neue Endpunkte

```
1. CORS im echten Browser prüfen  →  curl -I -H 'Origin: https://buscosun.com' <url>
2. CORS ok        → direkt, kein Eintrag in netlify.toml
3. CORS fehlt     → Rewrite (einfach) oder Edge Function (mit Cache)
4. Rate-Limit     → IMMER Edge Function mit Durable Cache (nie client-direkt in der Fläche)
5. Warnungen      → NIE durable cachen (Lizenzklausel, s. §7)
```

Schritte 3 und 4 berühren `netlify.toml` bzw. die Edge Functions und sind damit
**STOPP-&-FRAGEN-Zonen** nach `CLAUDE.md`.

---

## 2. DWD OpenData (`opendata.dwd.de`)

**Träger:** Deutscher Wetterdienst · **Lizenz:** CC BY 4.0 (GeoNutzV) · **Key:** nein ·
**CORS:** ❌ keiner ✅ (Header-Scan zeigt kein `Access-Control-Allow-Origin`) ⇒ **Proxy Pflicht** ·
**Rate-Limit:** keines veröffentlicht · **Hinweis:** DWD speichert die IP max. 7 Tage zur
Betriebssicherung.

Client-Präfix: `/_dwd_opendata/…` → `https://opendata.dwd.de/…`

### 2.1 RADOLAN-RV (Nowcast, in Betrieb)

```
/_dwd_opendata/weather/radar/composite/rv/DE1200_RV<YYMMDDHHMM>.tar.bz2   ✅
/_dwd_opendata/weather/radar/composite/rv/DE1200_RV_LATEST.tar.bz2        ✅ 200
```

| Feld | Wert |
|---|---|
| Inhalt | **ein** `tar.bz2` je 5-Min-Lauf mit **exakt 25 Frames** `_000`…`_120` ✅ nachgezählt 2026-08-05; je Mitglied 2 640 195 B = `1100·1200·2 + 195` |
| Gitter | **DE1200**, 1100 × 1200, 1 km, polar-stereografisch |
| Header | `PR E-02`, `INT 5` ⇒ **mm/h = Wert × 0,12** — verbatim: `RV051935100000826BY   2640195VS 5SW  P42001HPR E-02INT   5GP1200x1100VV 000MF 00000008MS103<deasb,…>` |
| **Bewegungsfeld** | **nicht enthalten** ✅ am Byte belegt — der Header führt weder u/v noch einen Advektionsvektor. Zugvektoren müssen aus der Frame-Folge gerechnet werden |
| Flag | `0x2000` gesetzt (Wert `0x29C4` = 2500+Flag) ⇒ außerhalb der Radarabdeckung |
| Größe / Latenz | 420 KB–1,4 MB (2026-08-05: **740 643 B**) / **3 min 21 s** ✅ gemessen |
| Retention | **exakt 48 h = 576 Läufe** ✅ gemessen |
| CORS | **kein `Access-Control-Allow-Origin`** ✅ **gemessen** mit `Origin: https://buscosun.com` |
| Verzeichnis | HTML-Listing, Regex `DE1200_RV(\d{10})\.tar\.bz2` |

**DE1200-Eckkoordinaten (WGS84, [NW, NE, SE, SW])** — im Code als Konstante, gegen wradlib
bestätigt:
```
NW 1.46330151 / 55.86208711   NE 18.73161645 / 55.84543856
SE 16.58086935 / 45.68460578  SW 3.566994635 / 45.69642538
```

**proj4-String (DE1200, WGS84):**
```
+proj=stere +lat_0=90 +lat_ts=60 +lon_0=10 +a=6378137 +b=6356752.3142451802
+x_0=543196.835217764 +y_0=3622588.861931
```
⚠️ **Nicht mit proj4js verwenden** — bekannter Bug bei `lat_0=90` (Issue #456). buscosun rechnet
die Transformation von Hand (`psFwd`/`psInv` in `radolan.ts`). Es gibt **keinen offiziellen
EPSG-Code**; der DWD-GeoServer führt `EPSG:1000001`.

### 2.2 RADOLAN-RY / RW / SF (Analyse)

```
/_dwd_opendata/weather/radar/radolan/ry/raa01-ry_10000-latest-dwd---bin.bz2   ✅ 200
/_dwd_opendata/weather/radar/radolan/rw/raa01-rw_10000-latest-dwd---bin.bz2   ✅ 200
/_dwd_opendata/weather/radar/radolan/sf/raa01-sf_10000-latest-dwd---bin.bz2   ✅
```
RY = ungeeichte 5-Min-Analyse (900×900) · RW = stündliche aneichte Summe · SF = 24-h-Summe.
Auch als `.hdf5` verfügbar.

### 2.3 RADVOR-RE — *geplant (Hagel + Niederschlagsphase)*

```
/_dwd_opendata/weather/radar/radvor/re/RE<YYMMDDHHMM>_<vvv>.gz     ✅
Beispiel: RE2608050600_000.gz … RE2608050600_120.gz   (25 Dateien je Lauf)
```

| Feld | Wert (✅ aus Kompositformat 2.6 zitiert) |
|---|---|
| Definition | **„Anteil des festen Niederschlags (keine Radardaten) + Hagelflag"** |
| Hagelflag | **„RE: Bit 13 = Hagelflag; Wert (Anteil festen Niederschlags): 0 bis 1000"** |
| Bytes/Zelle | **2** (RE steht nicht in der 1-Byte-Ausnahmeliste WW/WX/RX/EX) |
| **Gitter** | **900 × 900** — **nicht** DE1200 |
| Header | `PR E-00`, `INT 60`, Erzeugung alle 5 min, `VV` 000…120 |
| Weitere Flags | Bit 14 = Fehlkennung (Wert 2500) · Bit 15 = negatives Vorzeichen |
| Größe | ~21–25 KB gzip; unkomprimiert 1,62 MB |
| ⚠️ offen | Die Umrechnung „0–1000 → Anteil 0–1" ist abgeleitet, nicht wörtlich gefordert |

**900×900-proj4 (WGS84):**
```
+proj=stere +lat_0=90 +lat_ts=60 +lon_0=10 +a=6378137 +b=6356752.3142451802
+x_0=523196.835217778 +y_0=3772588.86193113
```
Ecken (WGS84): SW 3,604/46,954 · SE 14,605/47,072 · NE 15,697/54,738 · NW 2,096/54,585.

⚠️ **`radvor/rq/` existiert, ist aber leer** ✅ — nicht gegen RQ planen.
⚠️ **Es gibt kein „HG"-Produkt** in der Formatspezifikation. `composite/hg/` existiert im
Verzeichnisbaum, ist aber undokumentiert.

### 2.4 KONRAD3D und Mesozyklonen — *KONRAD3D ✅ IN BENUTZUNG (Phase Z1, 2026-08-05, Layer `cells` via `src/sources/dwdKonrad3d.ts`); Mesozyklonen weiterhin ungenutzt*

```
/_dwd_opendata/weather/radar/konrad3d/KONRAD3D_<YYYYMMDD>T<HHMMSS>.xml   ✅ 5 min, 37 KB–1,02 MB
   ⚠️ KEIN latest-Alias — Verzeichnis-Scrape, Regex  KONRAD3D_(\d{8}T\d{6})\.xml
/_dwd_opendata/weather/radar/mesocyclones/meso_<YYYYMMDD>_<HHMM>.xml     ✅ 5 min, 173 B wenn leer
/_dwd_opendata/weather/radar/mesocyclones/meso_latest.xml                ✅ Alias EXISTIERT
```

**Der frühere Vermerk „Schema unbekannt" ist aufgehoben.** Am **2026-08-05** wurde
`KONRAD3D_20260805T193500.xml` (**612 381 B**, `Content-Type: text/xml`,
`Last-Modified: 19:39:53Z` bei Referenzzeit 19:35:00Z ⇒ **Latenz 4 min 53 s**) abgerufen und
ausgewertet. **Kein `Access-Control-Allow-Origin`** ✅ gemessen ⇒ Proxy Pflicht.
Retention **48 h = 576 Dateien** ✅.

**Dokumentmodell:** `<konrad3d data_model_name="KONRAD3D" data_model_version="1.7">`, Run
`konrad3d_1.8`, Software `POLARA_konrad3d_1.8.005`.

**Gitterbezug (`head/product/associated_grid_projection`):**
```
polara_grid_id      DE4800_WGS84        projection_type  polar_stereographic
grid_resolution     250 m               grid_size        4800 Zeilen × 4400 Spalten
proj4_init_string   +proj=stere +lat_0=90 +lat_ts=60 +lon_0=10 +a=6378137
                    +b=6356752.3142451802 +no_defs +x_0=543571.83521776402 +y_0=3622213.8619310022
projected_area      55.86209/1.46330 · 55.84544/18.73162 · 45.69643/3.56699 · 45.68461/16.58087
```
⇒ **zeichengleich mit `DE1200_CORNERS`** (`src/sources/radolan.ts:48-55`). **Alle Objektkoordinaten
liegen bereits in WGS84-Grad vor — es ist keine Reprojektion nötig.**

**Feature-Kontrakt** (`cells/feature[@identifier][@type="3D_reflectivity_feature"]`) — die Pfade,
die ein Zell-Layer braucht, verbatim aus der Datei:

| Zweck | Pfad | Einheit |
|---|---|---|
| Zell-ID | `@identifier`, `metadata/identifier` | ganze Zahl |
| Zeitbezug | `metadata/reference_time`, `metadata/code` | ISO 8601 |
| Schwerpunkt | `geometry/centroid_3d/geodetic_coordinate/{latitude,longitude,height_msl}` | ° / ° / m |
| Schwerpunkt-Unsicherheit | `geometry/centroid_3d/uncertainty_ellipse/{major_axis,minor_axis,angle}` | km/km/° |
| Umriss | `geometry/polygons_projected/geodetic_coordinates/polygon/{latitudes,longitudes}` (zwei whitespace-getrennte Listen gleicher Länge) | ° |
| Fläche/Volumen | `geometry/covered_area`, `geometry/volume` | km² / km³ |
| Echotop/-bottom | `geometry/{echo_top_msl,echo_bottom_msl,vertical_extent}` | m |
| **Zuggeschwindigkeit** | `tracking/cell_speed` | **km/h** |
| Track-Alter, Merge/Split | `tracking/{reference_time_first_detection,number_detections,mergers/*,splits/*}` | |
| **Prognosespur (12 Punkte, +5…+60 min)** | `forecast/centroid_forecasts/centroid_forecast[@forecast_time]/geodetic_coordinate/{latitude,longitude}` | ° |
| **Amtlicher Unsicherheits-Trichter** | `…/centroid_forecast/uncertainty_ellipse/{major_axis,minor_axis,angle}` | km/km/° |
| Intensität | `intensity/{min_value,max_value,average_value}` | dBZ |
| Schweregrad | `intensity/{severity,severity_decimal}` | severity_points |
| Hagel / Böen / Starkregen | `intensity/{hail_flag,gust_flag,gust_flag_without_mesocyclones,heavy_rain_flag}`, `intensity/maximum_estimated_wind_gust`, `intensity/heavy_rain_potential` | 0/1/2 · km/h · mm |
| VIL / VII | `intensity/{cell_based_VIL,cell_based_VIL_density,cell_based_VII,cell_based_VII_density}` | kg/m² · g/m³ |
| je dBZ-Schwelle | `intensity/area_of_projected_polygon_above_threshold/…[@threshold]`, `…/volume_above_threshold`, `…/echo_top_threshold` | 30…65 dBZ |
| Trends | `intensity/trends/*` | je „/5min" |
| Hydrometeore | `hymec/{echo_top_hail,area_hail,volume_hail,…}` | m · km² · km³ |
| Blitz | `lightning/{lightning_rate,lightning_density,number_detected_lightning_jumps}` | strokes/5min |
| Mesozyklone | `mesocyclone/{mesocyclone_severity_index,mesocyclone_diameter_equivalent,mesocyclone_velocity_rotational_max,number_assigned_mesocyclones}` | severity_points · km · m/s |
| Umgebung | `nwp_model/{nwp_model_name,nwp_mu_cape,nwp_mu_cin,nwp_bs_06km,nwp_srh_3km_rm,…}` | ICON-EU |

**Zwei Pflichthinweise für jede Implementierung:**
1. **Sentinel für „nicht verfügbar": `-1000000000`** (in allen Nachkommastellen-Varianten) und
   **`not-a-date-time`** für Zeitstempel. Frisch erkannte Zellen haben leere Trends — ungefiltert
   entstehen Trichter mit −1 Milliarde Metern.
2. **Es gibt kein Richtungsfeld.** `cell_speed` ist ein Betrag; die Richtung kommt aus
   `centroid_3d` → erstem `centroid_forecast`.

**Beispielumfang der Probe:** 36 Features, je 1 Umriss-Polygon und 12 Prognosepunkte (432 gesamt);
`cell_speed` 8,9…67,4 km/h; `hail_flag` {0: 30, 1: 5, 2: 1}; `gust_flag` {0: 32, 1: 4}.

**Mesozyklonen-Kontrakt** (`meso_latest.xml`, 2026-08-05: 9 149 B / 6 957 B, 4 Ereignisse):
```
nowcast-data > radar-stations                                   (17 Standorte, kommagetrennt)
             > event[@ID] > time
                          > location/area/ellipse/moving-point/{latitude,longitude}
                                                    /polar_motion/speed          ⚠️ NUR Betrag, war 0.0
                                        /ellipse/{major_axis,minor_axis,orientation}
                          > nowcast-parameters/{mesocyclone_shear_mean|_max, _momentum_mean|_max,
                              _diameter, _diameter_equivalent, _top, _base, _echotop, _vil,
                              _shear_vectors, _shear_features, _velocity_max,
                              _velocity_rotational_max|_mean|_max_closest_to_ground}
                          > nowcast-parameters/{mean_dbz,max_dbz,meso_intensity}
                          > nowcast-parameters/elevations/elevation[@site]
```
⚠️ **`<polar_motion>` führt ausschließlich `<speed units="km/h">`, und der Wert war in allen vier
beobachteten Ereignissen `0.0`; ein Richtungselement existiert nicht.** Das Produkt ist eine
**Detektion**, kein Track — für Zuglinien unbrauchbar. Nutzung nur als Attribut einer
KONRAD3D-Zelle, mit konservativer Sprache (D-19: nie „Tornado").

### 2.3a DWD CAP — amtliche Wetterwarnungen — *✅ IN BENUTZUNG (Phase W1, `src/sources/dwdCapAlerts.ts`)*

```
/_dwd_opendata/weather/alerts/cap/DISTRICT_DWD_STAT/
    Z_CAP_C_EDZW_LATEST_PVW_STATUS_PREMIUMDWD_DISTRICT_DE.zip
  ~110 KB · ZIP mit je einer CAP-1.2-XML-Meldung · Neuschrift ~5 min · kein CORS → Proxy Pflicht
```

**Am 2026-08-06 14:34 UTC gemessen** (27 Meldungen, 95 Gebiete, 136 Ringe):

| Achse | Ausprägungen | Befund |
|---|---|---|
| Schnitt | `DISTRICT` / `COMMUNEUNION` | **Polygone: 95/95 (100 %) vs. 67/2029 (3,3 %)** ⇒ DISTRICT |
| Stand | `STAT` / `DIFF` | `STAT` = Vollstand; Aufhebungen implizit ⇒ keine Zustandsführung |
| Warnart | `DWD` / `CELLS` / `EVENT` | `DWD` = amtliche Wetterwarnung |
| Sprache | `DE/EN/ES/FR/MUL` | `DE` |

- **`LATEST` ist byte-identisch** zur jüngsten zeitgestempelten Datei (SHA-1 verglichen) ⇒
  **kein Verzeichnis-Scrape** (Unterschied zu KONRAD3D, §2.4).
- `Last-Modified` = Publikationszeit ⇒ Frischebeleg **im Leerfall** (V-19).
- **Feldbefunde, die die Umsetzung bestimmen:** Koordinaten `lat,lon` (GeoJSON braucht
  `lon,lat`) · `altitude`/`ceiling` in **Fuß** (1968,50394 ft = exakt 600 m) · `expires` **darf
  fehlen** (9/27 = offen bis zur Aufhebung) · `AREA_COLOR`-eventCode liefert die **amtliche**
  Warnfarbe je Meldung · `LICENSE`-eventCode trägt „© GeoBasis-DE / BKG 2021".
- **Transport bewusst ohne Durable-Cache** (§7.1): einfacher Rewrite `/_dwd_opendata`, nicht
  `/_dwd_grib`.

Diagnose und vollständige Messwerte: `audit/wetterwarnungen.md`.

---

### 2.4a MeteoSchweiz Hagel (POH + MESHS) — *✅ IN BENUTZUNG (Phase HA1, `src/sources/meteoSwissHail.ts`)*

```
https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-radar-hail/items/<YYYYMMDD>-ch
   → assets: bzc<…>vl.845.h5  (POH)   ·  mzc<…>vl.850.h5  (MESHS)
   518 Assets/Tag = 259 je Produkt ⇒ 5-Minuten-Takt · CORS `*` ⇒ KEIN Proxy nötig · CC BY 4.0
```

**Am 2026-08-05 21:40 UTC gemessen** (beide Produkte, ODIM-HDF5 `H5rad 2.4`):

| | POH (`bzc`, 24 704 B) | MESHS (`mzc`, 23 748 B) |
|---|---|---|
| `dataset1/data1/what/quantity` | `POH` | `MESH` |
| `unit` | *(leer)* — Werte sind **Anteil 0…1** | **`mm`** ⚠️ **nicht cm** |
| `gain` / `offset` / `nodata` / `undetect` | 1 / 0 / `NaN` / 0 | 1 / 0 / `NaN` / 0 |
| `dataset1/what/prodname` | `CHBZC` | `CHMZC` |
| `/where` | `xsize=710 · ysize=640 · xscale=yscale=1000`; Ecken **WGS84**: UL 2,6894/49,3744 · UR 12,4623/49,3633 · LR 11,9556/43,6190 · LL 3,1688/43,6290; `+proj=somerc … +ellps=bessel` | identisch |
| `/what/date`,`/time` | Messzeit UTC (Datenalter, V-19) | identisch |

**Zwei Pflichthinweise:** (1) **MESHS ist mm** — die cm-Annahme der Altdoku hätte Korngrößen 10× zu
groß gezeigt; im Verifier `verify:hail` als eigener Check verankert. (2) **POH ist ein Anteil**, die
Anzeige braucht ×100. Saison **1. April – 30. September**; außerhalb existieren die Dateien ohne
Inhalt. Das Gitter ist ein **Trapez** in lon/lat (Δlon oben/unten 0,479°) ⇒ Darstellung über eine
MapLibre-`image`-Source mit vier Ecken, **nicht** über eine achsparallele Box.

### 2.5 CAP-Warnungen — *bewertet, nicht empfohlen*

```
/_dwd_opendata/weather/alerts/cap/<VARIANT>/Z_CAP_C_EDZW_<ts>_PVW_STATUS_PREMIUM<V>_<AREA>_<LANG>.zip
VARIANT ∈ {COMMUNEUNION,DISTRICT}_{DWD,EVENT,CELLS}_{STAT,DIFF}   ✅ 12 Verzeichnisse
LANG    ∈ DE | EN | ES | FR | MUL
```
Takt ~1–2 min. **Enthält keine Geometrie** — nur `<geocode valueName="WARNCELLID">`.
⇒ Proxy + Entpacken + XML-Parser + Geometrie-Join. **Der WFS-Weg (§3.3) ist überlegen.**

### 2.6 Weitere Verzeichnisse

`/weather/nwp/icon-d2/` (ICON-D2 GRIB2, über `/_dwd_grib`) · `/weather/local_forecasts/` (MOSMIX) ·
`/weather/satellite/`. **`/weather/` enthält kein Blitz-Verzeichnis** ✅ geprüft.

### 2.7 Vollständiges Radar-Verzeichnisinventar ✅ (2026-08-05 live)

```
weather/radar/     composite/  konrad3d/  mesocyclones/  radolan/  radvor/  sites/
  composite/       dmax/  hg/  hx/  hymecng/  pg/  rs/  rv/  vii/  wn/
  radvor/          re/  rq/            ← rq/ ist LEER (Index zeigt nur ../)
  radolan/         rw/  ry/  sf/  yw/
```

**Retention, an vier Produkten gemessen und identisch: 576 Einträge im 5-Minuten-Raster = exakt
48 h** (RV · KONRAD3D · Mesozyklonen · RADVOR-RE; Spanne `2608031945` … `2608051940`). Das ist die
harte Obergrenze jeder Vergangenheitsachse aus DWD-OpenData.

**Belegter Inhalt der bisher unklaren Komposite** (ODIM `/what/quantity` bzw. RADOLAN-ASCII-Header,
2026-08-05 aus den Dateien selbst gelesen):

| Pfad | Datei-/Sammelform | `quantity` / Header ✅ | Gitter (aus `projdef`) | Bewertung |
|---|---|---|---|---|
| `composite/wn/composite_wn__LATEST.tar` | `.tar`, 25 × ODIM-HDF5 `_000…_120` | **`DBZH`** | DE1200 1 km (`x_0=543196,835…`) | Reflektivitäts-Nowcast → Experten-dBZ |
| `composite/rs/composite_rs_LATEST.tar` | `.tar`, ODIM-HDF5 `_000…` | **`ACRR`** | DE1200 1 km | Akkumulations-Nowcast |
| `composite/hymecng/composite_HymecNG_LATEST_000-hd5` | ODIM-HDF5, 39 KB | **`CLASS`**, Dataset `NG_top_view` | DE1200 1 km | Hydrometeor-Klassifikation ⚠️ Kodierung offen (**F-13**) |
| `composite/vii/composite_VII_latest-hd5` | ODIM-HDF5, 74 KB | **`VII` + `VIL`** | DE1200 1 km | Hagel-Proxy — Semantik **jetzt belegt** |
| `composite/dmax/composite_dmax_LATEST-hd5` | ODIM-HDF5, 1,34 MB | **`DBZH`** | **DE4800 250 m** (`x_0=543571,835…`) | wie KONRAD3D-Gitter |
| `composite/hx/composite_hx_LATEST-hd5` | ODIM-HDF5, 721 KB | **`DBZH`** | DE4800 250 m | |
| `composite/pg/raa00-pg_bfr26-latest-dwd---bufr` | **BUFR**, 21,6 KB | — | — | **nicht nutzbar** (kein Decoder, D-06) |
| `composite/hg/HG_LATEST_000.bz2` | RADOLAN-bin, 15,3 KB gz | `HG…BY 5280195…PR E-00INT 5GP1200x1100` ⇒ **4 Byte/Zelle** (5 280 195 = 1100·1200·4 + 195), Füllmuster `00 00 00 80` | DE1200 1 km | **Struktur belegt, Größe NICHT** — bleibt draußen (**F-8**) |

**Regel bleibt (D-04/RK-8):** Kein Layer ohne belegte Produktdefinition. `hg` und `pg` sind
außen vor; `vii` und `dmax` sind es ab sofort **nicht mehr** — ihre ODIM-Größe steht in der Datei.

---

## 3. DWD GeoServer (`maps.dwd.de`)

**Lizenz:** GeoNutzV (`Fees: none`) · **Key:** nein · **CORS:** `Access-Control-Allow-Origin: *`
⚠️ (über Fremdprüfdienst; zusätzlich durch die produktive Nutzung in `wmsTime.ts` belegt) ·
**Kein Proxy nötig.** · `robots.txt` setzt `Crawl-delay: 120` — Crawler-Direktive, kein API-Limit.

Basis: `https://maps.dwd.de/geoserver/dwd/wms` · WFS: `…/dwd/ows` · 192 Layer ✅

### 3.1 Radarlayer (in Betrieb)

| Layer | Produkt |
|---|---|
| `dwd:RADOLAN-RY` | 5-Min-Regenrate mm/h |
| `dwd:Radarniederschlag_RW` | stündliche Summe |
| `dwd:Radar_rv_product_1x1km_ger` | RV-Nowcast +5…+120 min |
| `dwd:Niederschlagsradar` | Reflektivitätskomposit |

**Kachel-Template (MapLibre expandiert `{bbox-epsg-3857}`):**
```
https://maps.dwd.de/geoserver/dwd/wms?service=WMS&version=1.1.1&request=GetMap
  &layers=<LAYER>&styles=&bbox={bbox-epsg-3857}&width=256&height=256
  &srs=EPSG:3857&format=image/png&transparent=true[&TIME=<ISO>]
```

⚠️ **TIME-Falle:** Der Wert muss **exakt** auf dem 5-Minuten-UTC-Raster liegen. Andernfalls
antwortet der Server mit **HTTP 200 und einem ServiceException-XML im Body** — nicht mit einem
Fehlerstatus. `snapToDwdFrame()` in `dwdRadar.ts` löst das.

### 3.2 Blitz- und Konvektionslayer

| Layer | Inhalt | TIME |
|---|---|---|
| **`dwd:Blitzdichte`** | „Blitzdichte aus NowCastMix-Verfahren in generischen Einheiten; 5-minütige Aktualisierung mit Blitzen der letzten 15 Minuten; nichtlineare Abbildung von 0 bis 3000 Blitze pro Zeiteinheit und 100 qkm auf den Wertebereich 0 bis 127" ✅ verbatim | **✅ `2025-07-02T16:10:00.000Z/2026-08-04T21:50:00.000Z/PT5M`** |
| `dwd:Accumulated_Flash_Area` | MTG-Lightning-Imager-Flächen (heute genutzt) | ❌ unbestätigt |
| `dwd:Accumulated_Flash_Geometry` | 5-min-Blitzgeometrie | ❌ |
| `dwd:NCEW_EU` | NowCastELEC-Polygone um **erkannte und prognostizierte** Blitze | ❌ |

**TIME-Extent auslesen** (Per-Layer-Virtual-Service, kleine Antwort):
```
https://maps.dwd.de/geoserver/dwd/<LayerLocalName>/wms?service=WMS&version=1.3.0&request=GetCapabilities
```
`src/sources/wmsTime.ts` parst daraus `<Dimension name="time">` (WMS 1.3.0) bzw.
`<Extent name="time">` (1.1.1), TTL 5 min.

### 3.3 Warnlayer (WFS) — *geplant, empfohlener Weg*

**Live-Warnungen mit Geometrie in einem Request:**
```
https://maps.dwd.de/geoserver/dwd/ows?version=2.0.0&SERVICE=WFS
  &outputFormat=application/json&REQUEST=GetFeature
  &typeName=dwd:Warnungen_Gemeinden&CRS=CRS:84
```
Serverseitiger Gefahrenfilter: `&CQL_FILTER=EC_II IN(247,248)` ✅ (247 = starke Hitze,
248 = extreme Hitze).

| Layer | Zweck |
|---|---|
| `dwd:Warnungen_Gemeinden` | aktuelle Warnungen + Vorabinformationen, Gemeindeebene |
| `dwd:Warnungen_Landkreise` | Kreisebene |
| **`dwd:Warnungen_Gemeinden_vereinigt`** | aufgelöste Flächen — **kartografisch sauberer, GPU-freundlicher** |
| `dwd:Warnungen_Gemeinden_vereinigt_{Gewitter,Sturm,Regen,Schnee,Frost,Glatteis,Tauwetter,Nebel,Hitze,UV}` | je Gefahr vorgefiltert |
| `dwd:Warnungen_Kueste`, `dwd:Warnungen_Binnenseen` | Küste / Binnenseen |
| `dwd:Warngebiete_{Gemeinden,Kreise,Kueste,Binnenseen,Bundeslaender}` | statische Geometrie (nur für den CAP-Weg nötig) |

**Attribute** ⚠️ (aus drei unabhängigen Fremd-Clients zusammengetragen, **nicht** aus eigener
`DescribeFeatureType`-Antwort):
`SEVERITY, DESCRIPTION, EFFECTIVE, EXPIRES, ONSET, EVENT, STATUS, MSGTYPE, HEADLINE, ALTITUDE,
CEILING, INSTRUCTION, URGENCY, IDENTIFIER, WARNCELLID, NAME, EC_II, EC_GROUP`.
Semantik nach **CAP-DWD-Profil 1.2**. `ALTITUDE`/`CEILING` in Fuß.

❌ **Keine TIME-Dimension** auf den Warnlayern ✅ geprüft — Gültigkeit steckt in `ONSET`/`EXPIRES`.
⚠️ Abfragen nach `WARNCELLID` liefern dokumentiert unzuverlässig `numberMatched=0` —
**räumlich/BBox abfragen**.

**Vor der Umsetzung zwingend einmal ausführen:**
```
https://maps.dwd.de/geoserver/dwd/wfs?service=WFS&version=2.0.0
  &request=DescribeFeatureType&typeName=dwd:Warnungen_Gemeinden
```

### 3.4 Satellitenlayer (in Betrieb)

| Layer | Inhalt | Takt |
|---|---|---|
| `dwd:Satellite_meteosat_1km_euat_rgb_day_hrv_and_night_ir108_3h` | Europa, HRV tags / IR 10.8 nachts, ~1 km | **3 h** |
| `dwd:Satellite_worldmosaic_3km_world_ir108_3h` | Welt IR 10.8, ~3 km | 3 h |

---

## 4. GeoSphere Austria

**Träger:** staatlich · **Lizenz:** CC BY 4.0 ✅ · **Key:** nein ✅

### 4.1 Dataset-API — `dataset.api.hub.geosphere.at`

**⚠️ Harte Grenzen (aus den Antwort-Headern verifiziert):**
```
x-ratelimit-limit-second: 5        →  5 req/s
x-ratelimit-limit-hour:  240       →  240 req/h pro IP  ⇒ HTTP 429
```
**Request-Größe** = Parameter × Zeitschritte × Orte, **vor** der Verarbeitung berechnet:
GeoJSON max. **1.000.000** Werte · NetCDF max. **10.000.000** Werte.

**CORS ⚠️ gemischt:** `/v1/datasets` **ohne** `Access-Control-Allow-Origin`;
`/v1/grid/forecast/<res>/metadata` **mit** `*`. ❌ Für die Datenrouten selbst nicht geprüft.
⇒ **Wegen des 240/h-Limits ohnehin Edge-Proxy erforderlich** (STOPP & FRAGEN).

**INCA-Nowcast (in Betrieb):**
```
https://dataset.api.hub.geosphere.at/v1/grid/forecast/nowcast-v1-15min-1km
  ?parameters=rr&output_format=netcdf&bbox=45.51,8.11,49.47,17.73
```
| Feld | Wert ✅ |
|---|---|
| Takt / Auflösung | 15 min / 1 km |
| Horizont | `forecast_length: 13` ⇒ **3 h 15 min** |
| Gitter | 430 × 700 = 301.000 Zellen, `grid_bounds [190000,20000,620000,720000]` |
| CRS | **EPSG:31287** |
| Parameter | `rr` (mm je 15 min), `t2m`, `td`, `rh2m`, `ff`, `fx`, `dd`, `pt` |
| Format | NetCDF-4 (⇒ HDF5 ⇒ `jsfive`) oder GeoJSON |

**Produktkonstanten** (jsfive liest keine Variablen-Attribute ⇒ hartkodiert):
`scale_factor 0.01` · `_FillValue -999` · 15-min-Summe → mm/h **× 4** · Zeile 0 = Süden (flippen).

⚠️ **Vollflächen-Animation nur als NetCDF möglich:** 1 Parameter × 13 Schritte × 301.000 Zellen
= 3,9 Mio. > 1 Mio. (GeoJSON-Limit).
⚠️ Metadatendefekt: `dd` (Windrichtung) ist mit `unit: "m s-1"` deklariert — falsch.

**SNOWGRID-CL — *geplant*:**
```
https://dataset.api.hub.geosphere.at/v1/grid/historical/snowgrid_cl-v2-1d-1km
  ?parameters=snow_depth,swe_tot&output_format=netcdf&...
```
Takt **1 Tag** (~1 Tag Verzug) · 328 × 583 · **CRS EPSG:3416** ⚠️ (**anderes Datum als INCA!**)

⚠️ **`inca-v1-1h-1km` ist ein Archivprodukt** — beobachtete Abdeckung endete ~14 Tage vor dem
Abrufdatum. Für „jetzt" ist ausschließlich `nowcast-v1-15min-1km` zu verwenden.

### 4.2 Warn-API — `warnungen.zamg.at/wsapp/api` — *geplant*

**OpenAPI 1.1.0:** `https://openapi.hub.geosphere.at/warnapi/v1/openapi.json` ✅
**CORS:** `access-control-allow-origin: *`, `GET, HEAD`, `max-age 600` ✅ ⇒ **kein Proxy nötig**

| Endpunkt | Rückgabe |
|---|---|
| `GET /getWarnstatus` | FeatureCollection, **MultiPolygon je Gemeinde**, alle aktiven Warnungen |
| `HEAD /getWarnstatus` | `Last-Modified` ⇒ billiges Änderungs-Polling |
| `GET /getWarningsForCoords?lon=&lat=&lang=de\|en` | Feature + Warnungen **mit deutschem Klartext** |
| `GET /getBBoxForCoords?lon=&lat=` | Bounding-Box-Polygon der Gemeinde |
| `GET /getGewitterAuto` | FeatureCollection, MultiPoint — automatische Gewitterdetektion |

**`getWarnstatus`-Properties:** `warnid, wtype, wlevel, start, end, gemeinden`
**Geometrie: EPSG:31287 (Meter) ⇒ muss nach 4326 umprojiziert werden.**
Vereinfacht mit GeoPandas `simplify_coverage`, Toleranz **375 m**.

**`getWarningsForCoords`-Properties** ✅ live geprüft:
`gemeindenr, name, urlname` + je Warnung `warnid, chgid, verlaufid, warntypid, warnstufeid,
begin, end, text, auswirkungen, empfehlungen`.
Beispiel `text`: *„Es ist mit extremer Hitzebelastung zu rechnen"*.

**Amtliche Legende ✅ (aus den Enum-Beschreibungen der OpenAPI-Spezifikation):**
```
wtype   1 = Sturm · 2 = Regen · 3 = Schnee · 4 = Glatteis
        5 = Gewitter · 6 = Hitze · 7 = Kälte
wlevel  1 = gelb · 2 = orange · 3 = rot        (dreistufig, keine 4. Stufe)
```
Feldnamen unterscheiden sich zwischen den Endpunkten: `wtype` ↔ `warntypid`,
`wlevel` ↔ `warnstufeid` (gleiche Wertebereiche).

⚠️ **`warnid` ist nicht zwischen den beiden Endpunkten joinbar** (offenes Issue #42) —
nicht als Cache-/Dedup-Schlüssel verwenden.
⚠️ Gilt für den **Dauersiedlungsraum**; hochalpine Lagen ausgenommen.

### 4.3 TAWES-Stationen (in Betrieb)
```
https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min?parameters=TL&station_ids=…
```

---

## 5. MeteoSchweiz / geo.admin.ch

**Träger:** staatlich · **Lizenz:** CC BY 4.0, kommerzielle Nutzung ausdrücklich erlaubt ✅ ·
**Key:** nein · **Attribution:** „Quelle: MeteoSchweiz" ·
**CORS:** `access-control-allow-origin: *`, `GET,HEAD` ✅
**Cache:** Assets 2 h; 10-min-Collections 10 s; `ETag` + `If-None-Match` ⇒ **304** ✅

⚠️ Eine Einzelabfrage-API ist **nicht vor Ende 2026** geplant — heute ist es Bulk-Download über
STAC.

### 5.1 STAC

```
https://data.geo.admin.ch/api/stac/v1/collections/<COLLECTION>
https://data.geo.admin.ch/api/stac/v1/collections/<COLLECTION>/items/<YYYYMMDD>-ch
```
Item-Assets tragen SHA-256-Prüfsummen (`file:checksum`).

### 5.2 Radar-Niederschlag (in Betrieb)

**Collection `ch.meteoschweiz.ogd-radar-precip`** ✅

| Code | Produkt | Takt | Einheit | Dateimuster |
|---|---|---|---|---|
| `RZC` | PRECIP — momentane Regenrate | 5 min | mm/h (**Sättigung 118**) | `RZCyyjjjHHMMKK.x01.h5` |
| `TZC` | PRECIP-SV mit Seitenansicht | 5 min | mm/h | `TZCyyjjjHHMM*.x01.h5` |
| `CPC` | CombiPrecip — Radar + Regenmesser, Qualität 0–9 | 10 min | mm | `CPCyyjjjHHMMQ_nnnnn.x01.h5` |
| `CPCH` | CombiPrecip-Reanalyse, **8 Tage verzögert** | 60 min | mm | |

Format **ODIM-HDF5** · `COMPRESSION=DEFLATE` ✅ (CPC per `gdalinfo` gemessen; RZC ⚠️ abgeleitet) ·
**EPSG:2056** (LV95, `somerc`, Bessel) · 710 × 640 ✅ · < 1 MB · **Retention 14 Tage** ·
`yy`=Jahr, `jjj`=Tag im Jahr 1–366, `HHMM`=UTC.

**HDF5-Pfade** (im Code verwendet): `where` (Attribute `xsize`, `ysize`, `UL/UR/LR/LL_lon/lat`) ·
`dataset1/data1/data` (Werte) · `what` (`date` YYYYMMDD, `time` HHMMSS).

### 5.3 Radar-Hagel — *geplant*

**Collection `ch.meteoschweiz.ogd-radar-hail`** ✅

| Produkt | Code | Verfahren | Einheit | Dateimuster |
|---|---|---|---|---|
| **POH** — Hagelwahrscheinlichkeit | `BZC` | Waldvogel: 45-dBZ-Echotop − Nullgradgrenze | **%** | `BZCyyjjjHHMMKK.XYZ.h5` |
| **MESHS** — max. erwartete Hagelkorngröße | `MZC` | Treloar: 50-dBZ-Echotop − Nullgradgrenze | **cm** (> 2 cm) | `MZCyyjjjHHMMKK.XYZ.h5` |

5 min · 14 Tage Retention · ODIM-HDF5 · EPSG:2056 · < 1 MB
⚠️ **Saisonal: nur 1. April – 30. September.** Außerhalb existieren die Dateien und enthalten keine
Daten.

### 5.4 Weitere Collections

`ch.meteoschweiz.ogd-smn` (158 SwissMetNet-Stationen, CSV, inkl. Schneeparameter) ·
`ch.meteoschweiz.ogd-forecasting-icon-ch1` / `-ch2` (GRIB2; **bbox reicht bis 17,7 °E / 50,5 °N —
also über AT und DE hinaus**) ✅

❌ **Nicht in der OGD:** Reflektivitätsprodukte (D2, „not yet realised"), Konvektionsradar (D4,
„planning is pending"), Blitzdaten, Warnungen. INCA-CH (E1) ist **„Data on request"** — kein
offener Bulk-Download.

### 5.5 WMTS (`wmts.geo.admin.ch`)

**Nur REST**, kein KVP:
```
https://wmts.geo.admin.ch/<Version>/<LayerBodId>/<Style>/<Time>/<TileMatrixSet>/<z>/<x>/<y>.<ext>
Capabilities: https://wmts.geo.admin.ch/EPSG/<EpsgCode>/1.0.0/WMTSCapabilities.xml?lang=de
```
TileMatrixSets: 2056, 21781, 4326, **3857**. `Time` akzeptiert das Literal `current`.

Relevante Layer ✅: `ch.meteoschweiz.messwerte-niederschlag-10min` ·
`ch.meteoschweiz.hagelgefaehrdung-korngroesse_{10,20,50,100}_jahre` (Klimatologie 2002–2020) ·
`ch.meteoschweiz.klimanormwerte-niederschlag_*`.
❌ Kein Live-Radar-Kachellayer unter `ch.meteoschweiz.*` gefunden.

### 5.6 CSCS-Objektspeicher (in Betrieb)

`rgw.cscs.ch` erlaubt **kein** Browser-CORS ⇒ `/_cscs/*`-Rewrite.
⚠️ Die S3-v2-Signatur wird über Host + Pfad + Query gebildet; der Query-String muss unverändert
durchgereicht werden.

---

## 6. EUMETSAT EUMETView — *geplant*

**Träger:** zwischenstaatlich · **Key/Auth:** **nein** · Service deklariert `Fees: none`,
`AccessConstraints: none` ✅ · ❌ **CORS unverifiziert**

```
https://view.eumetsat.int/geoserver/wms
https://view.eumetsat.int/geoserver/<workspace>/wms
Capabilities (scoped!): …/wms?service=WMS&version=1.3.0&request=GetCapabilities&namespace=mtg_fd
```
⚠️ Das Wurzel-Capabilities-Dokument ist sehr groß — **immer `&namespace=` verwenden**.

### 6.1 Blitz (empfohlen)

| Layer | `mtg_fd:li_afa` — „LI Accumulated Flash Area - MTG-I - 0 degree" |
|---|---|
| TIME | **`2025-05-30T15:00:00.000Z / <jetzt> / PT5M`** ✅ |
| Latenz | ~5 min ✅ |
| Auflösung | 2 km (LI-L2 auf dem FCI-Gitter 5568 × 5568) |
| CRS | deklariert 4326/CRS:84 — **`crs=EPSG:3857` liefert dennoch ein gültiges PNG** ✅ |
| Style | `mtg_li_afa` |
| Lizenz | **CC BY 4.0** (LI L2 = Derived Product = Core Data, Datenpolitik Art. 4) |

**Beispiel (verifiziert):**
```
https://view.eumetsat.int/geoserver/mtg_fd/wms?service=WMS&version=1.3.0&request=GetMap
  &layers=mtg_fd:li_afa&styles=&crs=EPSG:3857
  &bbox=556597,5621521,2003750,7361866&width=512&height=512
  &format=image/png&transparent=true&time=2026-08-05T17:20:00.000Z
```

**Zeitschritte auflisten** (GeoWebCache) ✅:
```
https://view.eumetsat.int/geoserver/gwc/service/wmts?service=WMTS&version=1.0.0
  &request=DescribeDomains&layer=mtg_fd%3Ali_afa&tileMatrix=EPSG%3A4326&Domains=time
```
⚠️ `GetCapabilities` auf demselben GWC-Endpunkt antwortet mit HTTP 400.

### 6.2 Satellitenbilder

`mtg_fd:rgb_geocolour|rgb_truecolour|rgb_cloudphase|rgb_cloudtype|rgb_dust|rgb_fog|rgb_snow`
(PT10M) · `msg_rss:rgb_natural_nrt|ir039_nrt|rgb_microphysics_nrt` (**PT5M**, Archiv seit 2020) ·
`msg_fes:ir108|rgb_convection|rgb_airmass|rgb_natural|rdt` ✅

⚠️ **Lizenz-Stopppunkt:** Die EUMETSAT-Datenpolitik (27.06.2024, Art. 4) trennt **Core Data**
(alle abgeleiteten SEVIRI/FCI/IRS/LI-Produkte ⇒ CC BY 4.0) von **Recommended Data** (Level-1 mit
Latenz < 1 h ⇒ 4.000–8.000 €/Jahr; „Redistribution of the original numerical data of Recommended
Data is prohibited"). Für `li_afa` besteht kein Zweifel. Für Echtzeit-RGB-Bilder **schriftliche
Bestätigung einholen**, bevor sie kommerziell ausgeliefert werden. → STOPP & FRAGEN.

---

## 7. Warnungen — Lizenzklauseln (verbindlich)

**DWD:** Die Quellenangabe **muss entfernt werden**, wenn die Darstellung nicht sicherstellt, dass
Wetterwarnungen alle Nutzer *„vollständig und unverzüglich"* erreichen.
**MeteoSchweiz:** Warnungen dürfen nur **unverzüglich und inhaltlich unverändert** weitergegeben
werden.

**Technische Konsequenzen:**
1. Warn-Layer **nicht** durable cachen; kurzes TTL.
2. Datenalter **sichtbar** anzeigen.
3. Bei Offline/Fehler den Layer **abschalten** und auf die amtliche Quelle verlinken — veraltete
   Warnungen sind gefährlicher als keine.
4. Wortlaut nicht kürzen, nicht umformulieren, nicht zusammenfassen.

**Attribution DWD, korrekte Form** ✅ (aus DWDs eigenen Vorlagen):
- unveränderte Daten: `Quelle: Deutscher Wetterdienst`
- veränderte/abgeleitete Daten: `Datenbasis: Deutscher Wetterdienst, Rasterdaten bildlich
  wiedergegeben` bzw. `…, eigene Elemente ergänzt`
- Platzierung *„unmittelbar an der verwendeten DWD-Information"*

⚠️ Da buscosun Rasterdaten einfärbt und eigene Produkte ableitet, ist die **`Datenbasis:`-Form die
korrekte**. Die heutigen Strings (`Quelle: DWD — RADOLAN, CC BY 4.0`) sind formal unpräzise
(→ `improvements.md` V-140).

---

## 8. Weitere Endpunkte

### 8.1 Bright Sky (in Betrieb)
```
https://api.brightsky.dev/alerts?lat=<lat>&lon=<lon>
```
Privat betrieben, MIT-Code, Daten unter DWD-Bedingungen · kein Key · CORS `*` ✅ · kein
veröffentlichtes Rate-Limit. Liefert **Text**, keine Geometrie. Bilingual DE/EN.

### 8.1a jsDelivr — Daten-CDN des Repack (`buscosun-data`, in Betrieb seit BW-4)
```
https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@<commit-sha>/runs/<YYYYMMDDHH>/<familie>-<SSS>.png
https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/index.json          (BW-9: der Browser liest ihn)
https://purge.jsdelivr.net/gh/jppetry/buscosun-data@main/index.json        (Publisher, nach jedem Push)
```
CORS `*` ✅ · kein Key · Egress zählt nicht auf Netlify (D-31). **Gemessen 2026-08-23/25:**

| Ref / Fall | `Cache-Control` | Bedeutung |
|---|---|---|
| `@<sha>/…` | `max-age=31536000, immutable` | unveränderlich — der Weg der Bilder |
| `@main/…` (vorhanden) | `max-age=604800, s-maxage=43200` | 12 h am Edge, 7 d im Browser ⇒ im Client nur mit `cache: 'no-store'` UND Purge nach dem Push |
| `@main/…` (**nicht** vorhanden) | `no-cache, no-store, must-revalidate` | ein 404 wird **nicht** festgehalten — ein neuer Pfad je Lauf ist beim ersten Abruf frisch |
| Push → neuer Pfad sichtbar | — | **≈ 35–57 s** (Poll-Raster 21 s, `audit/bandbreite.md` §28.4) |
| Push → `@main/index.json` nach Purge | — | 4 s nach dem Push noch alt (GitHub-Propagation), nach 2:39 min neu; der Publisher purgt deshalb nach 8 s, prüft nach und wiederholt bis 3× |
| Purge-API | JSON `status: finished`, `throttled: false` | ohne Freigabe nutzbar; README nennt Rate-Limits „für alle" — 8–24 je Tag sind unauffällig |

Grenzen (jsDelivr-README): **20 MB je Datei, 150 MB je Repo** — Retention 4 Läufe ≈ 45 MB. Lizenzträger
bleibt der DWD (CC BY 4.0, „Daten verändert" steht im README des Daten-Repos).

### 8.2 MeteoAlarm — ⚠️ **korrigiert 2026-08-08**
```
Atom (offizieller Vertrag):
  https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-{germany|austria|switzerland}
JSON (verifiziert, aber UNDOKUMENTIERT — Website-Backend, kann ohne Ankündigung brechen):
  https://feeds.meteoalarm.org/api/v1/warnings/feeds-{germany|austria|switzerland}
```
⚠️ „gleichwertig zu CC BY 4.0, **mit Zusatzauflagen für die Weitergabe**" (so der Wortlaut in
`<rights>` des Atom-Feeds — **nicht** schlicht CC BY 4.0) · key-frei · ❌ **kein CORS**, am
2026-08-08 mit echtem `Origin: https://buscosun.com` gegengeprüft ⇒ Proxy · +10 min Verzug
(Relais-Latenz addiert sich zur Quelle) · stabiler Latest-Alias: die Länder-URL **ist** der Alias ·
Attribution „Data provided by EUMETNET members". Die RSS-Varianten sind seit **2026-01-14
abgekündigt**.

⚠️ **Die drei Endpunkte liefern NICHT dasselbe** (gemessen 2026-08-08, `audit/warnungen-at-ch.md`
§8 — die frühere Lesart „Atom und JSON sind zwei Varianten derselben Information" ist widerlegt):

| Endpunkt | Bytes | Inhalt |
|---|---|---|
| `…/feeds/meteoalarm-legacy-atom-<land>` | 268 kB | **Index**: Polygon, `areaDesc`, `severity`, Zeiten, `identifier`, Feed-`<updated>` — **kein `headline`/`description`/`instruction`, kein `ceiling`, keine Sprachblöcke**; `event` nur **englisch** |
| `…/api/v1/warnings/feeds-<land>` | **12,9 MB** (unkomprimiert, Server ignoriert `Accept-Encoding`; 6,6 s) | **Archiv** über ~12 Tage: 306 Meldungen, davon 282 bereits abgelaufen; kein Frischestempel im Dokument |
| `…/api/v1/warnings/feeds-<land>/<uuid>` | 38–48 kB | **echtes CAP 1.2** je Meldung, 5 `<info>`-Blöcke, vollständige Texte — vom Atom-Eintrag selbst als `<link type="application/cap+xml">` verlinkt; `parseCapAlert()` liest es unverändert |

⚠️ **Kein `Last-Modified`, kein `ETag`** auf allen dreien (`cache-control: max-age=0, private,
must-revalidate`). Die einzige Frischebelegung ist `<updated>` im **Atom**-Feed — die
JSON-Variante hat keine. Für den Leerfall („keine Warnungen") ist das gate-relevant (V-19).

⚠️ **Kein `AREA_COLOR`, kein `LICENSE`-`eventCode`** (einziger `eventCode`: `NinjoWarnTypeId`).
Die amtliche Stufe steht stattdessen in `<parameter>`: `awareness_level` = `3; orange; Severe`
bzw. `4; red; Extreme`. Stufennummer und Farbwort kommen also aus der Quelle, der RGB-Wert nicht.

⚠️ **Die frühere Bewertung „nur Bounding-Boxen (EMMA_ID-Regionen), keine Detailpolygone" war zu
pauschal** und hat die Quelle für CH zu Unrecht ausgeschlossen. Der Geometrie-Gehalt ist
**länderabhängig** — gemessen an den echten Payloads vom 2026-08-08:

| Land | Absender | `area`-Inhalt |
|---|---|---|
| **CH** | `meteoalarm.cap@meteoswiss.ch` | ✅ **echte `<polygon>`-Ringe an jedem `area`**, hochaufgelöst |
| AT | `cap@zamg.ac.at` (GeoSphere) | ❌ nur `<geocode>` `EMMA_ID` (z. B. `AT203`), **keine** Geometrie |
| DE | DWD | ❌ nur Geocodes — und ohnehin durch §2.3a (CAP-ZIP) besser abgedeckt |

Die Bounding-Box-Einschränkung gilt für die **EDR-API** (`api.meteoalarm.org/edr/v1`), die
zusätzlich **registrierungspflichtig** ist (Token per manueller Freigabe). Für Flächendarstellung
ist sie damit der schlechtere, nicht der bessere Weg.

**Drei Fallen bei der CH-Nutzung** (Details: `audit/warnungen-at-ch.md` §4, §8.7):
- `altitude`/`ceiling` in **Metern**, obwohl CAP normativ Fuß vorschreibt (gemessen: glatte
  `800.0`/`600.0`/`3000` gegen DWDs `1968.50394 ft`). `feetToM()` darauf anzuwenden verfälscht die
  amtliche Warnung — Einheit **pro Quelle** führen, nicht global im Parser annehmen.
- **Fünf `info`-Blöcke** je Meldung (`en`/`de`/`fr`/`it`/`rm`); `parseCapAlert` nimmt heute
  unbedingt den ersten (= `en`) ⇒ Auswahl über `language`. Gegengeprüft: `severity`, `ceiling`
  und `areaDesc` sind über alle fünf Blöcke identisch (0 von 306 Meldungen weichen ab) — die
  Auswahl ändert **nur Text**, nicht Einstufung oder Geometrie.
- ⚠️ **`ceiling` widerspricht dem amtlichen Text.** Von 97 deutschsprachigen Meldungen mit dem
  Satz „Warnung gilt unterhalb von N m ü.M." tragen **32** ein abweichendes `ceiling` (Live-Fall:
  Text „unterhalb von 800 m", Feld `3000.0` = unser Wert für „keine Beschränkung"). Der
  Höhenband-Hinweis darf für CH **nicht** aus `ceiling` erzeugt werden → `improvements.md` V-176.

**Transport:** einfacher Netlify-Rewrite (`/_meteoalarm/*`), **keine** Edge Function — §7 schließt
einen Durable-Cache für Warnungen aus. Muster: `/_dwd_opendata`.

### 8.3 EUMETNET OPERA / MeteoGate ORD — *Ausbaustufe*
```
https://api.meteogate.eu/eu-eumetnet-weather-radar/collections                  ✅ CC BY 4.0
https://s3.waw3-1.cloudferro.com/openradar-24h/YYYY/MM/DD/OPERA/COMP/OPERA@<ts>@0@DBZH.h5   ✅
aws s3 cp s3://openradar-24h/... --endpoint-url https://s3.waw3-1.cloudferro.com/ --no-sign-request
```
Anonymer Zugriff möglich; Key hebt nur Rate-Limits (`x-ratelimit-remaining` beachten).
Buckets: `openradar-24h` (24 h) und `openradar-archive` (ab 2012). MQTT-Push:
`s3.waw3-1.cloudferro.com`, Port 8884, User `everyone`.
Format ODIM-HDF5 (**szip normativ ausgeschlossen** ✅) und Cloud-Optimized GeoTIFF ⚠️.
Gitter 2200 × 1900 bei 2 km, LAEA.
⚠️ **Dateinamen-Falle:** ACRR-Namen tragen die **Endzeit** des Akkumulationsintervalls.
⚠️ Rechtlicher Widerspruch zwischen Altseiten und ORD-Deklaration → schriftlich klären.

### 8.4 EFFIS / GWIS (Copernicus) — *Ausbaustufe*
```
https://maps.effis.emergency.copernicus.eu/gwis?service=WMS&request=GetCapabilities&version=1.3.0   ✅
https://ies-ows.jrc.ec.europa.eu/effis?service=WMS&request=GetCapabilities&version=1.3.0            ✅
```
`Fees: none`, `AccessConstraints: None` ✅ · CC BY 4.0 · key-frei.
Layer: `ecmwf.fwi`, `mf025.fwi`, `ecmwf.ffmc/dmc/dc/isi/bui`, `viirs.hs`, `all.hs`,
`ecmwf.extra.lightning` (Blitz**vorhersage**, keine Beobachtung).
⚠️ Die `<Default>`-TIME-Werte wirken veraltet — explizit `TIME` mitgeben und die Antwort prüfen.

### 8.5 CAMS (Copernicus / ECMWF) — *Ausbaustufe*
```
https://eccharts.ecmwf.int/wms/?token=public&request=GetCapabilities&version=1.3.0
```
⚠️ Nur aus der ECMWF-Dokumentation, **nicht live geprüft** (Host robots-gesperrt).
**Kein API-Key** — der Token ist das Literal `public`.
24 europäische Layer inkl. **Pollen** (Erle, Birke, Gräser, Beifuß, Olive, Ambrosia) und
**UV-Index**. Domäne 25 W/30 N–45 E/72 N, 0,1°, 96-h-Prognose stündlich, 00-UTC-Lauf.
⚠️ ECMWF-Wartung mittwochs zweiwöchentlich.
Numerische Daten (NetCDF/GRIB2) über den ADS **erfordern Registrierung** — für die WMS-Kacheln
nicht.

### 8.6 EAWS / SLF Lawinen — *Ausbaustufe*
```
https://aws.slf.ch/api/bulletin/caaml                          CAAMLv6 JSON + GeoJSON (CH)  ✅
https://aws.slf.ch/api/warningregion/                          Warnregionen GeoJSON/KML
https://static.avalanche.report/bulletins/<YYYY-MM-DD>/<date>_<REGION>_<lang>_CAAMLv6.json  ✅
https://static.avalanche.report/eaws_bulletins/<YYYY-MM-DD>/<date>.ratings.json   Europa-Aggregat ✅
https://eaws.gitlab.io/eaws-regions/micro-regions/<REGION>_micro-regions.geojson.json  (CC0) ✅
https://eaws.gitlab.io/eaws-regions/pbf/…                      Vektorkacheln
```
SLF: CC BY 4.0, kostenlos, kein Key; das GeoJSON enthält **EAWS-konforme Füllfarben**
(`fill`, `fillEarlier`, `fillLater`) — direkt als `fill-color: ['get','fill']` nutzbar.
EAWS-Regionen: **CC0**, `properties.id` joint auf `regionID` im Bulletin.
⚠️ Regionen sind **versioniert** (`start_date`/`end_date`) — historische Bulletins gegen den damals
gültigen Regionensatz joinen.
⚠️ `static.avalanche.report` antwortet mit **302 auf `avalanche.report`** — direkt die Zieladresse
verwenden, um den Cross-Host-Redirect zu sparen.
❌ Lizenz der ALBINA-Bulletins nicht ermittelt (Seite ist JS-only) — vor Nutzung klären.

### 8.6a Sentinel-2 L2A über Earth Search STAC + AWS Open Data — *geplant (Batch, BP0 2026-08-17)*
```
POST https://earth-search.aws.element84.com/v1/search
     {"collections":["sentinel-2-c1-l2a"],"intersects":<GeoJSON>,"datetime":"<from>/<to>","limit":n}   ✅ 200, ACAO: *
GET  https://e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com/sentinel-2-c1-l2a/<UTM>/<lat>/<sq>/<yyyy>/<m>/<item>/<BAND>.tif
     Range: bytes=…                                                                                        ✅ 206, accept-ranges: bytes — KEIN ACAO
```
Kein Key, kein Limit dokumentiert (Fair Use), Copernicus Sentinel Legal Notice (frei, kommerziell,
Attribution). Asset-Keys gemessen: `red, green, blue, visual, nir, swir22, rededge2, rededge3, rededge1,
swir16, wvp, nir08, scl, aot, coastal, nir09, cloud, snow, preview, …` — **`nir` = B08 (10 m),
`nir08` = B8A (20 m)**; NBR ist auf B8A definiert (`konzept-brandflaechen-modul.md` §5.2).
Beispiel 2026-08-17 (Hohes Venn, 6,089 E / 50,526 N): `S2C_T31UGS_20260814T104037_L2A`, 0,1 % Wolken,
Baseline 05.12 — d. h. für den laufenden Brand lag eine wolkenfreie Post-Szene vor.
⚠️ **Nur für Batch (GitHub Actions) tauglich:** der COG-Bucket sendet kein CORS, und ein Range-Read
kostet aus DE ~0,9 s (us-west-2). Kein Client-Pfad, kein Edge-Proxy (Transportzone).
⚠️ Nicht nach `eo:cloud_cover` filtern (gilt für die 110-km-Kachel) — SCL-Fenster lesen (Konzept §5.3).

### 8.7 Ausgeschlossene Quellen 🚫

| Quelle | Grund |
|---|---|
| **Blitzortung.org / lightningmaps.org** | Kommerzielle Nutzung **ausdrücklich verboten**; Einsatz in Sturmwarnsystemen untersagt; Rohdatenzugang an Stationsbetrieb gebunden; Selbstbeschreibung „not an official information service" |
| **ALDIS (AT)** | rein kommerziell, 264–370 € netto je Einzelabfrage |
| **Météorage, EUCLID, nowcast GmbH** | kommerzielle Lizenz |
| **Sentinel Hub / CDSE OGC** | Instanz-ID = API-Key |
| **EFAS Echtzeit** | Token-pflichtig, Echtzeit 30 Tage embargoiert |
| **MeteoSwiss-App-Backend** (`app-prod-ws.meteoswiss-app.ch`) | undokumentiert, ohne Lizenz, ohne Zusage — widerspricht „amtlich und belastbar" |
| **RainViewer** | Abkündigung 2026; kommerziell |

---

## 9. Prüfliste für neue Endpunkte

Vor jedem neuen Adapter abzuarbeiten und in `docs/DATA_SOURCES.md` §13 zu vermerken:

- [ ] CORS im Browser geprüft (`curl -I -H 'Origin: https://buscosun.com'`)
- [ ] Lizenz gelesen; Attributionsstring festgelegt; kommerzielle Nutzung ausdrücklich gedeckt
- [ ] Kein API-Key, keine Registrierung, keine Freemium-Stufe
- [ ] Rate-Limit ermittelt; falls vorhanden → Edge-Proxy geplant (**STOPP & FRAGEN**)
- [ ] Aktualisierungstakt und **echte Referenzzeit** im Payload identifiziert (D-04/V-19)
- [ ] Projektion und Eckkoordinaten belegt; Warp-Bedarf entschieden
- [ ] Format-/Kompressionsfilter geprüft (`h5dump -pH` bei HDF5)
- [ ] Retention/Archivtiefe bekannt (bestimmt die Animationsfähigkeit)
- [ ] Abdeckung je DE/AT/CH festgestellt und im Deskriptor hinterlegt
- [ ] Fehlerverhalten bei fehlenden Daten geklärt (leer ≠ null ≠ 404 ≠ außerhalb der Saison)
- [ ] Kontrakt-Sonde für das Monitoring definiert
- [ ] Beispiel-URL in dieses Dokument aufgenommen

### 8.7 Open-Meteo Forecast-API mit `past_days` — *✅ IN BENUTZUNG (BD1 2026-08-25, `src/fire/detail/fireWeatherAtPoint.ts`)*
```
GET https://api.open-meteo.com/v1/forecast?latitude=…&longitude=…&models=icon_seamless
    &hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation
    &past_days=7&forecast_days=1&timezone=UTC                                   ✅ 200, ≈ 9,4 KB
GET …&daily=precipitation_sum&models=icon_seamless&past_days=31&forecast_days=1  ✅ 200, ≈ 0,8 KB
```
Derselbe Host wie `openMeteoForecast.ts` (Punkt-Vorhersage), Lizenz wie dort (`scripts/seo/licenses.mjs`:
CC BY 4.0, nicht-kommerzielle Nutzung). `models=icon_seamless` = DWD ICON-D2/EU/global, `past_days` liefert die
**Analyse-/Kurzfristwerte der vergangenen Tage** — der Weg zur „Wetterlage zum Zeitpunkt des Brands", für den der
Brandradar selbst keine Vergangenheit hat (ICON-D2 läuft ab jetzt). Zeiten kommen **ohne `Z`** („2026-08-18T00:00")
und sind UTC. Nur auf Klick (Detailkarte), einmal je Brand und Sitzung (30 min); kein Netlify-Traffic. Modellwerte,
keine Messung — so beschriftet (`FIRE_WEATHER_SOURCE_LABEL`).
