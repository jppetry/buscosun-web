# zuglinien-radar-spec.md — Zeitmodell, Playback und Niederschlagsbewegung (Phasen L5 + L6)

> **Stand: 2026-08-05.** Umsetzungsreife Spezifikation für die Phasen **L5** (einheitliches
> Layer-Zeitmodell + `TimelinePlayer`) und **L6** (Regenradar-Rückblick + Niederschlagszuglinien)
> aus `docs/2d-layer-erweiterung.md` §12.
>
> **Status: Spezifikation. Keine Implementierung, kein Produktivcode geändert.**
> Ziel dieses Dokuments: Eine Folge-Session kann L5 und L6 bauen, **ohne eine einzige neue
> Design-Entscheidung zu treffen**. Wo eine Entscheidung Jan gehört, steht sie als `O-`-Vorlage in
> `decisions.md` — und der Text nennt den Default, der ohne Entscheidung gilt.
>
> L5 und L6 stehen zusammen in **einem** Dokument, weil L6 ohne L5 nicht baubar ist (die Zuglinien
> brauchen die Vergangenheitsachse und den Player). Sie bleiben **zwei Phasen mit zwei Gates**
> (GL5, GL6 in `checklist.md`) — `CLAUDE.md`: ein Thema = eine Phase = ein Gate.
>
> Grundlagen: `CLAUDE.md` · `agents.md` · `architecture.md` §3/§13 · `decisions.md` (D-04, D-09,
> D-11, D-12, D-14, D-19, D-27, D-28; O-09…O-14) · `docs/2d-layer-erweiterung.md` ·
> `docs/DATA_SOURCES.md` · `docs/LAYER_SYSTEM.md` · `docs/MAP.md` · `docs/API.md` ·
> `docs/WEATHER.md` · `docs/niederschlag-architektur.md` ·
> `docs/high-end-radar-feature-catalogue.md`.

---

## 0. Die acht Sätze, die diese Spezifikation entscheiden

1. **Die Bewegung liegt nicht im Produkt.** Der RV-Tar enthält exakt 25 gleichartige
   RADOLAN-Gitter und **kein** Bewegungsfeld — am echten Byte belegt (§1.2). Damit ist die Frage
   „B1 oder B3?" beantwortet: **B1 liefert die Frames, B3 (`estimateFlowHS`) rechnet die Bewegung.**
   Es gibt keinen Fallback-Pfad, weil es keine zweite Quelle für ein *Feld* gibt.
2. **F-3 ist geschlossen.** KONRAD3D führt Zell-ID, Umriss-Polygon, Zuggeschwindigkeit, **zwölf
   Prognose-Schwerpunkte mit amtlichen Unsicherheitsellipsen** (+5 … +60 min), Hagel-, Starkregen-
   und Böen-Flag, VIL/VII, Echotops, Blitzrate und Mesozyklonen-Index — vollständig aus einer echten
   Datei ausgelesen (§1.3). Nichts muss mehr geraten werden.
3. **E3 ist damit fachlich freigegeben — aber es gehört nach L11, nicht nach L6.** Nicht aus
   Beleg-Mangel, sondern aus Phasendisziplin: E3 ist ein eigener Datenpfad mit eigener
   Ehrlichkeitsfläche (Hagel-/Böen-Flags berühren D-19). Die Spec für L11 steht trotzdem hier
   (§11), damit L11 keine Recherche mehr braucht. Wer E3 in L6 zieht, entscheidet **O-18**.
4. **Der Slider bekommt eine Vergangenheit — und für die 16 bestehenden Layer ändert sich nichts.**
   `sliderRange()` liefert `minHours = 0`, solange kein aktiver Layer eine Vergangenheitsachse
   deklariert. Das ist die Rückwärtskompatibilität, und sie ist per Verifier erzwingbar (§5.3).
5. **`precipSource.ts` wird nicht angefasst.** Das ist eine bewusste Entscheidung mit Begründung
   (§3.6): Byte-Identität ist so nicht *geprüft*, sondern *konstruktiv gegeben*, und
   `npm run verify:precip-source` bleibt unverändert grün.
6. **Die Zeitwahl muss auf die absolute Gültigkeitszeit gehen, nicht auf den Lead-Index.** Heute
   tut sie das nicht — für Österreich entsteht dadurch ein systematischer Zeitversatz von bis zu
   ~45 Minuten (§2.3, am Live-Datensatz gemessen: 32 min). L5 behebt das konstruktiv.
7. **Zugvektoren sind GeoJSON-Symbole, kein zweiter `WindLayer`.** Keine Shader-Zeile wird
   angefasst. GPU-Streamlines bleiben eine spätere Option hinter STOPP & FRAGEN.
8. **Für die Schweiz gibt es keine Zuglinien.** Das ist keine Lücke im Code, sondern eine Lücke in
   der offenen Datenlage, und sie wird gezeigt statt gefüllt (D-04 / O-14 Option B).

---

# TEIL I — BELEGLAGE

## 1. Quellenverifikation, live, mit Abrufdatum

### 1.1 Methodik und was sich dadurch ändert

Alle Abrufe dieses Abschnitts erfolgten am **2026-08-05 zwischen 19:38 und 19:50 UTC** per `curl`
gegen die Originalhosts, CORS-Proben mit `-H 'Origin: https://buscosun.com'`.

**Das schließt die methodische Einschränkung, die `docs/DATA_SOURCES.md` §0 an den Anfang stellt** —
dort steht, alle CORS-Aussagen seien über einen Fremd-Prüfdienst gewonnen oder aus dem Verhalten
produktiver Clients abgeleitet. Für die vier für L5/L6 relevanten Hosts liegen jetzt **gemessene
Antwort-Header** vor:

| Host | Sonde | `Access-Control-Allow-Origin` | Folge |
|---|---|---|---|
| `opendata.dwd.de` | `HEAD` auf `konrad3d/`, `mesocyclones/meso_latest.xml`, `composite/rv/DE1200_RV_LATEST.tar.bz2` | **fehlt vollständig** ✅ gemessen | `/_dwd_opendata`-Rewrite ist **Pflicht** — auch für KONRAD3D und Mesozyklonen |
| `maps.dwd.de` | `HEAD` auf `geoserver/dwd/wms?…GetCapabilities` | `*` ✅ gemessen (dazu `Access-Control-Allow-Credentials: true`, `Cache-Control: private,no-cache,no-store,no-transform,max-age=0`) | direkt, kein Proxy |
| `dataset.api.hub.geosphere.at` | `GET` auf `…/grid/forecast/nowcast-v1-15min-1km/metadata` | `*` ✅ gemessen; Rate-Limit-Header ebenfalls gemessen: `X-RateLimit-Limit-Hour: 240`, `X-RateLimit-Limit-Second: 5` | direkt möglich. ⚠️ Getrennt gemessen: `HEAD` auf `/v1/datasets` antwortet **405** ⇒ Sonden müssen `GET` benutzen |
| `data.geo.admin.ch` | `GET` auf STAC-Collections `ogd-radar-precip` / `ogd-radar-hail` | `*` ✅ gemessen; `Cache-Control: max-age=600, public`, `ETag` vorhanden | direkt, `If-None-Match` nutzbar |

⇒ **F-1 ist für die L5/L6-relevanten Endpunkte beantwortet** (nicht für alle zwölf — der Rest bleibt
Teil von L0). ⇒ **F-12 ist beantwortet:** die GeoSphere-`grid`-Route sendet CORS; der Edge-Proxy für
GeoSphere bleibt trotzdem nötig, aber wegen des **Rate-Limits** (RK-4), nicht wegen CORS.

**Verzeichnisinventar `opendata.dwd.de/weather/radar/` ✅ live:**

```
radar/          composite/  konrad3d/  mesocyclones/  radolan/  radvor/  sites/
composite/      dmax/  hg/  hx/  hymecng/  pg/  rs/  rv/  vii/  wn/
radvor/         re/  rq/          ← rq/ ist LEER (Index zeigt nur ../)  ✅
radolan/        rw/  ry/  sf/  yw/
```

**Retention, an vier Produkten gemessen und identisch:** RV, KONRAD3D, Mesozyklonen und RE führen je
**576 Einträge im 5-Minuten-Raster = exakt 48 h** (`2608031945` … `2608051940`). Das ist die harte
Obergrenze jeder Vergangenheitsachse aus DWD-OpenData und bestätigt O-10 (60 min passen mühelos,
24 h ebenfalls, ein „volles Archiv" nicht).

### 1.2 B1 — enthält `composite/rv` selbst eine Bewegungsinformation? **Nein.**

Abruf `DE1200_RV_LATEST.tar.bz2` (2026-08-05 19:40 UTC): HTTP 200, `Content-Length: 740643`,
`Last-Modified: 2026-08-05T19:38:21Z` bei Lauf `2608051935` ⇒ **Latenz 3 min 21 s** (bestätigt die
„~3 min" aus `docs/DATA_SOURCES.md` §4 B1 mit einer echten Messung).

Der entpackte Tar enthält **exakt 25 Mitglieder**, `DE1200_RV2608051935_000` … `_120`, jedes
**2 640 195 Byte**. Die RADOLAN-ASCII-Header von `_000` und `_120` sind bis auf `VV` identisch:

```
RV051935100000826BY   2640195VS 5SW  P42001HPR E-02INT   5GP1200x1100VV 000MF 00000008
MS103<deasb,deboo,dedrs,deeis,deess,defbg,defld,dehnr,deisn,demem,deneu,denhb,deoft,depro,deros,detur,deumd>
```

**Der Header führt kein Bewegungsfeld, keinen Advektionsvektor, keine u/v-Komponente.** `2 640 195 =
1100 · 1200 · 2 + 195` — die Nutzlast ist restlos das 2-Byte-Intensitätsgitter. Es gibt in RV nichts
zu extrahieren.

**Entscheidung (belegt, nicht abgeleitet):**

| Rolle | Quelle | Begründung |
|---|---|---|
| **Primärpfad Frames** | **B1** — RV-Tar, 25 Frames, DE1200 | wird ohnehin geladen (`radolan.ts:263-275`); der `_000`-Frame ist die gemessene Analyse |
| **Primärpfad Bewegung** | **B3** — `estimateFlowHS` aus zwei *gemessenen* Analysen | einziger Weg zu einem **Feld**; liegt im Repo (`src/ml/opticalFlowNowcast.ts:20-58`), ist pur und headless prüfbar |
| **Fallback Bewegung** | **keiner auf Feldebene.** Objektebene: **B2** (KONRAD3D `cell_speed` + Prognosespuren) | ein Objektprodukt ersetzt kein Feld; es ergänzt es (E3) |

⚠️ **Falle, die ausdrücklich benannt gehört:** Der Fluss darf **nicht** aus RV-Vorhersageframes
(`_005`…`_120`) geschätzt werden. Diese enthalten bereits die Advektion des DWD-Nowcasts — eine
Flussschätzung darauf misst die eigene Extrapolation und ist zirkulär. Eingang sind ausschließlich
`_000`-Frames aufeinanderfolgender Läufe (das ist genau, was `fetchRvAnalysisSequence()`
(`radolan.ts:319-334`) und der Session-Past-Cache in `radarFrames.ts:81-104` bereits liefern).

### 1.3 F-3 — das KONRAD3D-Schema, aus einer echten Datei

Abgerufen: `https://opendata.dwd.de/weather/radar/konrad3d/KONRAD3D_20260805T193500.xml`
(2026-08-05 19:40 UTC) — HTTP 200, `Content-Type: text/xml`, **612 381 Byte**,
`Last-Modified: 19:39:53Z` ⇒ **Latenz 4 min 53 s** nach der Referenzzeit 19:35:00Z.
**Kein `Access-Control-Allow-Origin`.** **Kein `KONRAD3D_latest.xml`-Alias** (das Verzeichnis-Listing
enthält keinen `latest`-Eintrag) — der Verzeichnis-Scrape ist Pflicht, anders als bei
Mesozyklonen (§1.4) und RV.

**Wurzel und Kopf:**

```xml
<konrad3d data_model_name="KONRAD3D" data_model_version="1.7">
  <head>
    <metadata><reference_time format="ISO 8601">2026-08-05T19:35:00Z</reference_time>
              <ensemble_member_id>0</ensemble_member_id></metadata>
    <product>
      <system>KONRAD3D</system>
      <title>Detection and tracking of convective cells at DWD</title>
      <creation-date>…</creation-date>
      <run><name>konrad3d_1.8</name><description>KONRAD3D 1.8 Operational</description></run>
      <source><server>k3d_op1</server><software-version>POLARA_konrad3d_1.8.005</software-version></source>
      <associated_grid_projection>…</associated_grid_projection>
    </product>
    <data><radar>…<available_sweeps>…</available_sweeps></radar></data>
  </head>
  <cells reference_time="…" ensemble_member_id="0">
    <feature identifier="134" type="3D_reflectivity_feature"> … </feature>
    …
  </cells>
</konrad3d>
```

**Gitterbezug (wichtig, weil er einen Reprojektionsaufwand erspart):**
`polara_grid_id = DE4800_WGS84`, `projection_type = polar_stereographic`, Auflösung **250 m**,
`grid_size` 4800 Zeilen × 4400 Spalten,
`proj4_init_string = +proj=stere +lat_0=90 +lat_ts=60 +lon_0=10 +a=6378137 +b=6356752.3142451802 +no_defs +x_0=543571.83521776402 +y_0=3622213.8619310022`.
Die `projected_area`-Ecken sind **zeichengleich mit `DE1200_CORNERS`** in `radolan.ts:48-55`
(55.86209/1.46330 · 55.84544/18.73162 · 45.68461/16.58087 · 45.69643/3.56699).
**Konsequenz: KONRAD3D beschreibt dieselbe Fläche wie DE1200 — und liefert alle Koordinaten ohnehin
schon in WGS84-Grad. Es ist keine Reprojektion nötig.**

**Feature-Inventar der abgerufenen Datei:** 36 `<feature>`, alle `type="3D_reflectivity_feature"`;
je Feature **genau ein** `<polygon no="0">`; **12** `<centroid_forecast>` je Feature (+5 … +60 min,
5-Minuten-Schritte) ⇒ 432 Prognosepunkte in der Datei. `cell_speed` 8,9 … 67,4 km/h;
`hail_flag` {0: 30, 1: 5, 2: 1}; `gust_flag` {0: 32, 1: 4}; `severity` ∈ {0, 1, 2}.

**Die Elemente, die E3 braucht — verbatim aus der Datei, keine Vermutung:**

| Zweck | Pfad im Feature (verbatim) | Einheit / Werte |
|---|---|---|
| **Zell-ID** | `@identifier` bzw. `metadata/identifier` | ganze Zahl, laufzeitstabil über den Track |
| Zeitstempel des Objekts | `metadata/code` (`YYYYMMDDHHMM…`) · `metadata/reference_time` | ISO 8601 |
| **Schwerpunkt** | `geometry/centroid_3d/geodetic_coordinate/{latitude,longitude,height_msl}` | Grad / Grad / m |
| Schwerpunkt-Unsicherheit | `geometry/centroid_3d/uncertainty_ellipse/{major_axis,minor_axis,angle}` | km / km / Grad |
| **Umriss (Hülle)** | `geometry/polygons_projected/geodetic_coordinates/polygon/{latitudes,longitudes}` — zwei whitespace-getrennte Listen gleicher Länge | Grad, geschlossen zu interpretieren |
| Fläche / Volumen | `geometry/covered_area` · `geometry/volume` | km² · km³ |
| Echotop / -bottom | `geometry/{echo_top_msl,echo_bottom_msl,vertical_extent}` | m |
| **Zuggeschwindigkeit** | `tracking/cell_speed` | **km/h** |
| Track-Alter | `tracking/{reference_time_first_detection,number_detections}` | ISO 8601 / Zahl |
| Merge/Split | `tracking/mergers/*` · `tracking/splits/*` | bool + Zähler |
| **Prognosespur** | `forecast/centroid_forecasts/centroid_forecast[@forecast_time]/geodetic_coordinate/{latitude,longitude}` | Grad, 12 Stück, +5…+60 min |
| **Prognose-Unsicherheit (amtlicher Trichter!)** | `…/centroid_forecast/uncertainty_ellipse/{major_axis,minor_axis,angle}` | km / km / Grad — wächst monoton (Beispielzelle 0,77 → 23,99 km) |
| Intensität | `intensity/{min_value,max_value,average_value}` | dBZ |
| Schweregrad | `intensity/{severity,severity_decimal}` | severity_points |
| **Hagel-Flag** | `intensity/hail_flag` | 0 / 1 / 2 (beobachtet) |
| **Starkregen-Flag** | `intensity/heavy_rain_flag` + `heavy_rain_potential` (mm) + `heavy_rain_potential_accumulation_time` (min) | 0/1 · mm · min |
| **Böen-Flag** | `intensity/gust_flag`, `gust_flag_without_mesocyclones`, `maximum_estimated_wind_gust` | 0/1 · km/h |
| VIL / VII | `intensity/{cell_based_VIL,cell_based_VIL_density,cell_based_VII,cell_based_VII_density}` | kg/m² · g/m³ |
| Flächen/Volumen je dBZ-Schwelle | `intensity/area_of_projected_polygon_above_threshold/area_of_projected_polygon[@threshold]` und `volume_above_threshold` | 30…65 dBZ |
| Trends | `intensity/trends/{severity_trend,cell_based_VIL_trend,max_value_trend,…}` | je „/5min" |
| Hydrometeor-Klassen | `hymec/{echo_top_hail,area_hail,volume_hail,…}` | m · km² · km³ |
| Blitz | `lightning/{lightning_rate,lightning_density,number_detected_lightning_jumps}` | strokes/5min · strokes/(5min·km²) |
| Mesozyklone | `mesocyclone/{mesocyclone_severity_index,mesocyclone_diameter_equivalent,mesocyclone_velocity_rotational_max,number_assigned_mesocyclones}` | severity_points · km · m/s |
| Umgebungsparameter | `nwp_model/{nwp_model_name,nwp_mu_cape,nwp_mu_cin,nwp_bs_06km,nwp_srh_3km_rm,…}` | ICON-EU-Kontext |

**Zwei Eigenschaften, die jede Implementierung kennen muss:**

1. **Sentinel für „nicht verfügbar" ist `-1000000000`** (bzw. `-1000000000.00`, `-1000000000.000`)
   und für Zeitstempel der Literalstring **`not-a-date-time`**. Beides steht massenhaft in echten
   Dateien (jede frisch erkannte Zelle hat leere Trends). Wer das nicht filtert, zeichnet
   Trichter mit −1 Milliarde Metern. Das ist derselbe Fehlertyp wie die `−999,9`-Füllwerte, an denen
   der CIN-Gate in Phase F1 hing.
2. **Es gibt kein Richtungsfeld.** `cell_speed` ist ein Betrag in km/h; die Zugrichtung ist aus
   `centroid_3d` → erstem `centroid_forecast` zu berechnen (Peilung über `bearingDeg` aus
   `src/radar/gridGeo.ts`). Das ist kein Mangel — die Prognosespur ist präziser als eine
   Richtungsangabe, weil sie gekrümmt sein darf.

**F-3-Status: geschlossen.** Der zugehörige Eintrag in `docs/DATA_SOURCES.md` §13 und die Notiz
„Schema/Attributliste nicht gelesen" in §4 B2 sind entsprechend korrigiert.

### 1.4 Mesozyklonen — was drin ist, wie oft, und ob es nutzbar ist

Abruf `mesocyclones/meso_latest.xml` (der Alias **existiert**, anders als bei KONRAD3D):
2026-08-05 19:39:29Z → 9 149 Byte; erneute Probe 19:44:36Z → 6 957 Byte. Takt 5 min, Retention 48 h
(576 Dateien). Die im bisherigen Text genannten „173 B wenn leer" sind der Leerzustand; an einem Tag
mit Konvektion ist die Datei gefüllt.

**Vollständiges Tag-Inventar der abgerufenen Datei** (keine Auswahl):

```
nowcast-data > radar-stations
             > event[@ID] > time
                          > location > area > ellipse > moving-point > latitude
                                                                     > longitude
                                                                     > polar_motion > speed
                                                     > major_axis  > minor_axis  > orientation
                          > nowcast-parameters > mesocyclone_shear_mean | _shear_max
                                               > mesocyclone_momentum_mean | _momentum_max
                                               > mesocyclone_diameter | _diameter_equivalent
                                               > mesocyclone_top | _base | _echotop | _vil
                                               > mesocyclone_shear_vectors | _shear_features
                                               > elevations > elevation[@site]
                                               > mean_dbz | max_dbz
                                               > mesocyclone_velocity_max
                                               > mesocyclone_velocity_rotational_max
                                               > mesocyclone_velocity_rotational_mean
                                               > mesocyclone_velocity_rotational_max_closest_to_ground
                                               > meso_intensity
```

Beobachtet: 4 `<event>`, `meso_intensity` ∈ {1, 3, 4}, `radar-stations` = 17 Standorte.

**Der entscheidende Befund:** `<polar_motion>` enthält **ausschließlich `<speed units="km/h">`,
und der Wert ist in allen vier beobachteten Ereignissen `0.0`**. Ein Richtungselement existiert
nicht. **Das Mesozyklonen-Produkt liefert also keine verwertbare Bewegungsinformation** — es ist ein
Detektionsprodukt (Punkt + Ellipse + Rotationsparameter), kein Track-Produkt.

**Nutzbarkeit unter der Konservativ-Regel (D-04, D-19):** Für L6 **nein**, und für L11 nur als
*Attribut einer KONRAD3D-Zelle*, nicht als eigener Layer. Begründung: Ein eigener
„Mesozyklonen"-Layer wäre ein Punktprodukt mit amtlich klingendem Namen, dessen fachliche Bedeutung
(rotierendes Aufwindgebiet — **nicht** „Tornado") in einer Legende kaum sauber zu vermitteln ist.
buscosun hat mit F5 (Rotationspotenzial) bereits einen kalibrierten, konservativ formulierten
Experten-Layer für genau diese Frage. KONRAD3D führt den Mesozyklonen-Bezug ohnehin je Zelle
(`mesocyclone/mesocyclone_severity_index`, `number_assigned_mesocyclones`) — das ist der richtige
Ort. **Wortwahl bleibt gate-blockierend: nie „Tornado", nie „Warnung"; zulässig ist „Hinweis auf
Rotation in der Zelle".**

### 1.5 Die übrigen Komposite — was davon wohin gehört

Jede Aussage unten stammt aus der Datei selbst: bei ODIM-HDF5 aus dem `/what/quantity`-Attribut, bei
RADOLAN-Binär aus dem ASCII-Header. Nichts ist aus dem Verzeichnisnamen geschlossen.

| Verzeichnis | Format / Größe (2026-08-05) | Belegter Inhalt | Gitter (aus `projdef`) | Bewertung |
|---|---|---|---|---|
| `composite/wn` | `.tar` 2 672 640 B, Mitglieder `_000…_120` je ~108 KB, ODIM-HDF5 | **`quantity = DBZH`** ✅ | DE1200 1 km (`x_0=543196.835…`) | **Reflektivitäts-Nowcast, 25 Schritte.** Für den *Intensitäts*-Layer **redundant zu RV** (RV liefert mm/h und ist bereits integriert). Wert liegt im **Experten-dBZ-Modus** (Katalog §11) — gehört zu einer späteren Expert-Phase, nicht zu L6 |
| `composite/rs` | `.tar` 5 181 440 B, Mitglieder `_000…`, ODIM-HDF5 | **`quantity = ACRR`** ✅ (akkumulierter Niederschlag) | DE1200 1 km | **Akkumulations-Nowcast.** Gehört zum Akkumulations-Feature (Katalog §3 „Accumulation heatmap"), nicht zu L6. Wert: hoch, weil es die Summenbildung amtlich statt selbst gerechnet liefert (heute: `src/radar/accumulation.ts`) |
| `composite/hymecng` | `-hd5` 39 102 B, 5 min | **`quantity = CLASS`**, Dataset `NG_top_view` ✅ | DE1200 1 km | **Hydrometeor-Klassifikation.** Der fachlich richtige Weg zur Niederschlagsart und zum Hagelhinweis — **gehört zu L8/L9** und ist dort **RE Bit 13 vorzuziehen zu prüfen**, weil die Klassen-Semantik hier explizit ist. ⚠️ Die Klassen-Kodierung selbst ist noch nicht belegt ⇒ neue offene Frage **F-13** |
| `composite/vii` | `-hd5` 73 738 B, 5 min | **`quantity` enthält `VII` *und* `VIL`** ✅ | DE1200 1 km | **Semantik jetzt belegt** — „Vertically Integrated Ice/Liquid" steht als ODIM-Größe in der Datei, nicht nur in der Konvention. Damit ist der bisherige Ausschluss „Bedeutung unbelegt" (`docs/DATA_SOURCES.md` §5.1 H3, §6.1 G5) **für `vii` aufgehoben**. Gehört zu **L8** (Hagel-Proxy), nicht zu L6 |
| `composite/dmax` | `-hd5` 1 339 249 B, 5 min | **`quantity = DBZH`** ✅ | **DE4800 250 m** (`x_0=543571.835…`) | Hochaufgelöste Reflektivität auf demselben Gitter wie KONRAD3D. Teuer (1,3 MB/5 min) und für DACH-Zoom überauflösend ⇒ **nicht für L6**, Kandidat für einen späteren Detail-Zoom |
| `composite/hx` | `-hd5` 720 750 B, 5 min | **`quantity = DBZH`** ✅ | DE4800 250 m | wie `dmax`, kleiner; **nicht für L6** |
| `composite/pg` | BUFR `raa00-pg_bfr26-…-dwd---bufr`, 21 596 B | Format BUFR ✅ (Dateiname + Struktur) | — | **Nicht nutzbar.** buscosun hat keinen BUFR-Decoder, und einen zu schreiben verstößt gegen die Aufwandslogik von D-06 (der Nutzen ist durch `wn`/`rv` bereits abgedeckt) |
| `composite/hg` | RADOLAN-Binär `.bz2`, 15 254 B komprimiert | Header ✅ `HG051940100000826BY 5280195VS 5SW P42001HPR E-00INT 5GP1200x1100VV 000…`; **5 280 195 = 1100·1200·4 + 195 ⇒ 4 Byte je Zelle**; Füllmuster `00 00 00 80` (LE-uint32, Bit 31) | DE1200 1 km | **Struktur belegt, physikalische Größe weiterhin NICHT.** Der Header deklariert nur `PR E-00` (ganze Zahlen) und `INT 5`. **Bleibt draußen** (D-04 / RK-8). Neu ist immerhin: 4 Byte/Zelle ist außerhalb der 2-Byte-Konvention — wer das je auswertet, braucht einen eigenen Pfad. Bleibt **F-8** |
| `radvor/rq` | Verzeichnis **leer** ✅ | — | — | Nicht gegen RQ planen (bestätigt) |

**Was ausdrücklich NICHT nutzbar ist:** `composite/pg` (BUFR, kein Decoder) und `composite/hg`
(Größe undeklariert). Beides bleibt bis zu einer amtlichen Produktdefinition außen vor.

### 1.6 Österreich und Schweiz

**Österreich — INCA.** Live gemessen (2026-08-05 19:47 UTC):

| Feld | Metadaten-Endpunkt `…/nowcast-v1-15min-1km/metadata` | Tatsächlich gelieferte NetCDF |
|---|---|---|
| Takt | `frequency: 15min` | — |
| Schritte | **`forecast_length: 13`** | **`rr` hat Form `(11, 431, 701)`**, `leadtime = [0.5 … 3.0]` |
| Referenzzeit | `last_forecast_reftime: 2026-08-05T19:15+00:00` | Root-Attribut `last_forecast_reftime = 2026-08-05 19:15:00` |
| Zeitachse | — | `time = [0…150] min`, `units = "minutes since 2026-08-05 19:45:00"` |
| Verfügbare Läufe | `available_forecast_reftimes`: 6 (letzte 90 min) | dito |
| CRS / Auflösung | `EPSG:31287` / 1000 m | `esri_pe_string` = MGI/Austria Lambert, `scale_factor 0.01`, `_FillValue -999` |
| Parameter | `dd, ff, fx, pt, rh2m, rr, t2m, td` | — |

**Drei Befunde, die in keiner Doku standen:**

1. **Die Zahl der gelieferten Frames schrumpft mit dem Alter des Laufs.** Die API gibt nur Leads
   aus, deren Gültigkeit noch nicht verstrichen ist: 32 Minuten nach der Referenzzeit kamen
   **11** statt 12 Schritte, beginnend bei Lead **0,5 h**. Die Angabe „13 Zeitschritte" in
   `docs/DATA_SOURCES.md` §4 B4 ist die Metadaten-Zahl `forecast_length`, **nicht** das, was ankommt.
   Der Code sagt „12 Frames (+0,25…+3,0 h)" (`geosphereIncaGrid.ts:15,25`) — das ist der Zustand bei
   einem frischen Lauf. **Beide Angaben sind Sonderfälle einer variablen Größe.**
2. **INCA hat keine Analyse.** Der kleinste Lead ist ≥ 0,25 h. Es gibt für Österreich **keinen
   gemessenen „jetzt"-Frame** — auch nicht theoretisch. Das ist der eigentliche Grund, warum die
   Zuglinien für AT anders begründet werden müssen als für DE (§10.7).
3. **INCA liefert `dd` und `ff` (10-m-Windrichtung und -geschwindigkeit).** ⚠️ **Diese dürfen
   niemals als Zuglinien verwendet werden.** Bodenwind ist nicht die Verlagerungsrichtung von
   Niederschlagsgebieten (die folgt der Strömung in der Wolkenschicht). Ein „billiger" Zuglinien-Layer
   aus `dd`/`ff` wäre fachlich falsch und nach D-04 unzulässig. Explizit als Falle notiert, weil die
   Parameter direkt daneben liegen und verlockend billig aussehen.

**Schweiz — rzc.** STAC-Collection `ch.meteoschweiz.ogd-radar-precip` ✅ 200, `license: CC-BY`,
CORS `*`, `Cache-Control: max-age=600, public`, `ETag` vorhanden.
Der Client holt **einen** Frame je Abruf (`fetchRzcLatest`). Es gibt ein 14-Tage-Archiv, aber es ist
heute nicht angebunden. **Für Zuglinien bedeutet das: kein Frame-Paar ohne Sitzungsverlauf.**
Und **INCA-CH ist „Data on request"** — es gibt keine offene Nowcast-Verlängerung für die Schweiz
(`docs/DATA_SOURCES.md` §4 B5, unverändert gültig).

**Wie der Layer die Lücke kommuniziert (O-14 Option B, verbindlich):**
Der Zuglinien-Layer zeigt über der Schweiz **keine Pfeile** und im Readout den Satz
„Für die Schweiz veröffentlicht MeteoSchweiz keine offene Bewegungs- oder Nowcast-Quelle. Die
Zuglinien enden an der Grenze." plus Deep-Link auf MeteoSchweiz über `src/officialSources.ts`.
**Kein Modell-Ersatz, keine Interpolation über die Grenze.** Auf der Zeitleiste endet das
CH-Länderband bei „jetzt" (§12.3).

### 1.7 Attribution (fließt in V-140 ein)

Die neuen Pfade bringen **keine neuen Rechteinhaber** — DWD (RV, KONRAD3D, Mesozyklonen),
GeoSphere (INCA), MeteoSchweiz (rzc) sind alle bereits attribuiert. Was sich ändert, ist die
**Form**, weil aus gemessenen Daten jetzt ein **abgeleitetes** Produkt entsteht:

| Ebene | Bisher | Für L6 verbindlich |
|---|---|---|
| Regenradar-Raster (eingefärbt) | `Quelle: DWD — RADOLAN, CC BY 4.0` | `Datenbasis: Deutscher Wetterdienst, Rasterdaten bildlich wiedergegeben` |
| **Zugvektoren (E2)** | — | `Datenbasis: Deutscher Wetterdienst, eigene Elemente ergänzt` — die Pfeile sind **buscosuns Rechnung**, nicht DWDs Produkt. Das muss die Attribution sagen, sonst liest sich eine eigene Optical-Flow-Schätzung wie ein amtliches Produkt |
| Zellbahnen (E3, L11) | — | `Datenbasis: Deutscher Wetterdienst (KONRAD3D)` — hier ist die Spur **amtlich**, also ohne „eigene Elemente" |
| AT-Zugvektoren | — | `Datenbasis: GeoSphere Austria (INCA), eigene Elemente ergänzt` |

Der Unterschied zwischen E2 und E3 ist keine Formalie: Bei E2 haftet buscosun für die Aussage, bei
E3 zitiert es. Die Legende muss beides unterscheidbar machen (§12.1). → **V-140 wird um diese drei
Zeilen erweitert.**

---

## 2. Ist-Stand am Code — und wo die Doku ihn falsch beschreibt

Alle Zeilenangaben gemessen am Arbeitsstand 2026-08-05.

### 2.1 Was für Playback schon existiert (und die Doku als fehlend führt)

`docs/MAP.md` §7.2 listet acht Playback-Bausteine, sieben davon mit ❌. **Das stimmt so nicht.**
Gemessener Stand:

| Baustein | `MapView.tsx` (2D-Karte) | `src/radar/` + `NowcastRadarMap.tsx` (Regenradar) |
|---|---|---|
| Play / Pause | **vorhanden** — Engine `:2985-2994` (`setInterval`, 900 ms, Schritt +1 h), Button `:3321-3329` | vorhanden — rAF-Engine `NowcastRadarMap.tsx:269-279`, `fps = 2.5 · speed` |
| Loop | **vorhanden**, aber ohne Schalter (`:2990` springt hart auf `dayLo` zurück) | vorhanden **mit** Schalter (`RadarTimeline.tsx:191`) |
| Geschwindigkeit 0,5×/1×/2× | ❌ (900 ms fest) | vorhanden (`RadarTimeline.tsx:30,184-190`) — **aber nicht gemerkt** (`useState(1)`, kein `localStorage`) |
| Frame-Schritt ±1 | ❌ | vorhanden (`RadarTimeline.tsx:178,182`) |
| „Zurück zu jetzt" | **vorhanden** (`:3332-3340`) | vorhanden (`RadarTimeline.tsx:183`, `NowcastRadarMap.tsx:359`) |
| Auto-Advance bei neuem Frame | ❌ | vorhanden (`NowcastRadarMap.tsx:200-230`, Bedingung `wasAtNow` bei `:202`) |
| **Harter Mess-/Vorhersage-Bruch** | ❌ | **vorhanden** (`RadarTimeline.tsx:148-166`: `rdr-tl-fill-meas` / `-fc`, Bruchlinie `:164`, „jetzt"-Marke `:170-175`) |
| Konfidenz-Abklingen | ❌ | vorhanden (`RadarTimeline.tsx:154`: Tick-Opazität fällt mit `lead / (skillMin·1,5)`) |
| Morphing/Tween | **vorhanden für Bild-Layer** (s. u.) | ❌ |
| `prefers-reduced-motion` | ❌ | ❌ |

**Korrektur 1 (doku-relevant):** `src/fusion/frameInterp.ts` ist **sehr wohl im Slider-Pfad
verdrahtet** — acht Aufrufstellen in `MapView.tsx` (`:24` Import; `:2280, :2309, :2485, :2507,
:2527, :2548, :2569, :2594`) für Temperatur, Fusions-Niederschlag, Böen, Gewitter, Blitzprognose,
Rotation und Schnee. `docs/MAP.md` §7.1 („vorhanden, aber nicht im Slider-Pfad verdrahtet") und
`docs/2d-layer-erweiterung.md` §4.3 sind an dieser Stelle **falsch**.
**Was wirklich fehlt:** `lerpFrameImage` arbeitet auf `HTMLImageElement`/`HTMLCanvasElement`
(`frameInterp.ts:31-47`), also auf dem **PNG-Pfad** der ScalarLayer, und benutzt
`document.createElement` (`:22`) — es ist **DOM-gebunden**, verletzt also D-12 und ist headless nicht
prüfbar. Für den `RainLayer`-Uint8-Pfad (Niederschlag, Regenradar) gibt es **keine** Interpolation.
Genau die spezifiziert §9.3.

**Korrektur 2 (doku-relevant):** Die duplizierten Sichtbarkeitsblöcke stehen heute bei
**`MapView.tsx:1103-1149` und `:2813-2859`** und sind **47 Zeilen byte-identisch** (per
Zeilenvergleich verifiziert). Die Doku nennt `:1108-1136`/`:2818-2846` bzw. `:1089-1136`/`:2764-2811`
und „48 Zeilen" — beides sind veraltete Stände einer gewachsenen Datei. Korrigiert in
`docs/LAYER_SYSTEM.md` §2, `docs/DATA_SOURCES.md` §2, `decisions.md` O-09, `improvements.md` V-135.

**Korrektur 3:** `src/radar/radarState.ts:118` prüft `RADAR_PRESETS.length >= 4`, aber
`radarModel.ts:320-324` definiert **drei** Presets. `verifyRadarState()` schlägt heute also fehl —
unbemerkt, weil `src/radar/_verify.ts` **kein npm-Skript** hat (der Kopfkommentar nennt einen
manuellen `esbuild`-Aufruf). Das ist ein konkreter Fall des in V-95 beschriebenen Musters. →
**V-143**.

### 2.2 Die Zeitachse heute

`MapView.tsx:2941-2953`:
```ts
let horizon = forecast ? Math.max(0, forecast.hours.length - 1) : 0;
if (active.has('clouds'))  horizon = Math.max(horizon, cloudsHorizonHours());
if (active.has('nowcast')) horizon = Math.max(horizon, precipRadarHorizonHours(precipAvailability()));
return horizon;                                     // untere Grenze ist implizit 0
```
Dazu `:2956-2958` (Slider zurückholen, wenn der Horizont schrumpft) und `:3350-3359` (`<input
type="range" min={dayLo} max={dayHi} step={0.1}>`). **Es gibt keine untere Grenze als Variable** —
`dayLo` ist außer im Embed-Fall konstant 0 (`:2980`).

Die Frame-Wahl je Layer erfolgt durchgängig über **`Date.now() + forecastHour · 3 600 000`**
(15 Fundstellen, u. a. `:2135, :2149, :2353, :2385, :2480, :2505, :2525, :2546, :2567, :2592, :2607`)
— also bereits über die **absolute Gültigkeitszeit**. Das ist die richtige Grundlage; L5 macht sie
zur einzigen.

### 2.3 Der Zeitversatz für Österreich (echter Defekt, in L5 zu beheben)

`radarFrames.ts:161-169` verankert die INCA-Leads an **jetzt** statt an der Laufzeit:
```ts
const anchor = Date.now() - (Date.now() % 60_000);
const nowcast = grid.frames.map((f) => ({ …, timeMs: anchor + Math.round(f.leadHours*60) * 60_000 }));
```
`fetchIncaGrid` (`geosphereIncaGrid.ts:57-97`) liest zwar `leadtime`, **nicht** aber die Laufzeit —
obwohl sie in der Datei steht (Root-Attribut `last_forecast_reftime`, zusätzlich in
`time:units`, §1.6). `precipComposite.build` (`:200`) wählt den AT-Frame ebenso über
`|leadHours − h|`.

**Wirkung, an der Live-Datei quantifiziert:** Referenzzeit 19:15, Abruf 19:47 ⇒ jeder AT-Frame wird
um **32 Minuten zu jung dargestellt**; bei Slider-Stunde +1 zeigt die Karte die Lage von 20:15,
beschriftet als 20:47. Der Versatz entspricht `now − reftime` und liegt zwischen 0 und ~45 Minuten.
Für Deutschland und die Schweiz besteht das Problem nicht (RV trägt seine Laufzeit im Header, rzc
seine Messzeit in `/what`).

**Das ist ein Ehrlichkeitsdefekt, kein Schönheitsfehler**, und es ist der Grund, warum §3.4 die
Frame-Wahl auf die absolute Gültigkeitszeit umstellt statt auf den Lead-Index. → **V-144**.

### 2.4 Verifier-Bestand

`package.json` führt **26** `verify:*`-Aliase (Zeilen 12–19, 22–23, 34–49) und sieben `fusion:*`.
**Nicht vorhanden:** `verify:mapstate`, `verify:layer-time`, `verify:timeline`,
`verify:motion-field`, `verify:composite-equivalence`, `verify:frame-budget` — und kein Alias für
`src/radar/_verify.ts`.

⚠️ `docs/2d-layer-erweiterung.md` §5.2 und Risiko U-4 nennen `verify:mapstate`, als gäbe es ihn.
**Es gibt ihn nicht** (geprüft 2026-08-05). Nach `agents.md` §1.3 (Code schlägt Doku) ist die Doku
korrigiert und der Verifier hier als **neu zu erstellen** spezifiziert (§14.6).

---

# TEIL II — PHASE L5: ZEITMODELL UND PLAYBACK

## 3. `src/map/layerTime.ts` — das Zeitmodell

**Rein, DOM-frei, netzfrei, headless importierbar** (D-12; Vorbild `precipSource.ts`).
Kein Import aus `maplibre-gl`, React, `src/scalar/*` oder `src/sources/*`.

### 3.1 Typen

```ts
export type TimeMode = 'instant' | 'window' | 'forecast' | 'valid-interval';

/** Ein Frame, wie ihn ein Loader dem Zeitmodell meldet. Nur Metadaten — nie Pixel. */
export interface TimeFrameRef {
  /** absolute Gültigkeit in ms (UTC). EINZIGE Zeitwahrheit. */
  validAtMs: number;
  /** gemessen (true) vs. extrapoliert/modelliert (false) — speist den Bruch (D-04). */
  measured: boolean;
  /** Index im Frame-Array des Loaders. */
  index: number;
}

export interface LayerAvailability {
  frames: TimeFrameRef[];          // aufsteigend nach validAtMs, darf leer sein
  /** Referenz-/Laufzeit der Quelle (Status-Chip, V-19). null = Quelle weist keine aus. */
  refMs: number | null;
  /** Belegte Rückblickstiefe der Quelle in Stunden (0 = keine). */
  retentionPastH: number;
  /** Belegter Vorhersagehorizont in Stunden (0 = keiner). */
  horizonFutureH: number;
  /** optionale Sperrgründe, die vor der Zeitprüfung greifen. */
  block?: 'out-of-season' | 'out-of-coverage' | 'rate-limited' | 'offline' | 'upstream' | 'format';
}

export interface LayerTimeSpec {
  mode: TimeMode;
  /** native Frame-Kadenz in Minuten (RV 5, INCA 15, rzc 5, ICON-D2 60). */
  stepMinutes: number;
  /** frühester nutzbarer Lead in Stunden (Rotation nutzt 1; Default 0). */
  minStepHours?: number;
  /** Gewünschte Rückblickstiefe in Stunden. 0 = Layer hat keine Vergangenheit. */
  pastWindowH: number;
  /** true → der Layer bestimmt die Slider-Obergrenze mit (heutiges Verhalten von
   *  clouds/nowcast). false → er richtet sich nach den anderen. */
  drivesSliderMax: boolean;
}

export type LayerTimeResolution =
  | { ready: true;  frameIndex: number; validAtMs: number; measured: boolean; offsetMinutes: number }
  | { ready: false; reason: NotReadyReason };

export type NotReadyReason =
  | 'no-data'          // Loader hat (noch) keine Frames
  | 'out-of-horizon'   // jenseits des Vorhersagehorizonts — KEIN Modellersatz (D-14)
  | 'out-of-retention' // weiter zurück, als die Quelle vorhält
  | 'no-frame-near'    // Lücke in der Frame-Folge größer als stepMinutes
  | 'out-of-season' | 'out-of-coverage' | 'rate-limited' | 'offline' | 'upstream' | 'format';
```

`NotReadyReason` ist absichtlich die **Obermenge** der `LayerFailure`-Union aus V-139: das Zeitmodell
liefert die Zeitgründe, der Loader die Transportgründe, das UI hat **eine** Textabbildung.

### 3.2 Zuordnung Modus je Layer (vollständig, bestehend + geplant)

| `LayerKey` | Modus | `stepMinutes` | `pastWindowH` | `drivesSliderMax` | Anmerkung |
|---|---|---|---|---|---|
| `wind` | `forecast` | 60 | 0 | nein | Partikel, Frame = Stunde |
| `gust` | `forecast` | 60 | 0 | nein | |
| `temp` | `forecast` | 60 | 0 | nein | |
| `clouds` | `forecast` | 60 | 0 | **ja** | heutiges Verhalten (`MapView.tsx:2948`) |
| `nowcast` | `forecast` | 5 | 0 | **ja** | Horizont **delegiert** an `precipRadarHorizonHours` (§3.6); D-14: Vergangenheit bleibt 0 |
| `sat` | `instant` | 180 | 0 | nein | WMS, 3-h-Takt |
| `lightning` | `window` | 5 | 0,25 | nein | „letzte 15 min" ist Fenstergröße, nicht Frame |
| `lightningfc` | `forecast` | 60 | 0 | nein | |
| `stations` | `instant` | 10 | 0 | nein | |
| `confidence` | `forecast` | 60 | 0 | nein | |
| `snowline` | `forecast` | 60 | 0 | nein | |
| `flownowcast` | `forecast` | 5 | 0 | nein | |
| `poprob` | `forecast` | 5 | 0 | nein | |
| `thunder` | `forecast` | 60 | 0 | nein | |
| `snow` | `forecast` | 60 | 0 | nein | |
| `rotation` | `forecast` | 60 | 0 | nein | `minStepHours: 1` (bestehende Eigenheit) |
| **`rainradar`** *(neu, L6)* | `forecast` | 5 | **`PAST_WINDOW_H`** | **ja** | Rückblick + gemessene Analyse |
| **`motion`** *(neu, L6)* | `forecast` | 5 | **`PAST_WINDOW_H`** | nein | folgt `rainradar` |
| *(L3/L4)* `warnde`, `warnat` | `valid-interval` | — | 0 | nein | `ONSET`…`EXPIRES` |
| *(L7)* `lightningdensity` | `window` | 5 | 1 | nein | |
| *(L8)* `hail` | `forecast` / `window` (CH) | 5 | 0 / 1 | nein | |
| *(L9)* `snowfall` | `forecast` | 5 | 0 | nein | |
| *(L9)* `snowgrid` | `instant` | 1440 | 0 | nein | „gestern" |

```ts
/** Rückblickstiefe der zeitfähigen Mess-Layer. EINE Konstante — O-10 ändert nur diese Zahl. */
export const PAST_WINDOW_H = 1;   // 60 min, Empfehlung O-10
```

### 3.3 `sliderRange` — mit garantierter Rückwärtskompatibilität

```ts
export function sliderRange(
  active: Array<{ key: string; spec: LayerTimeSpec; avail: LayerAvailability }>,
  baseHours: number,                 // heutiges forecast.hours.length - 1
): { minHours: number; maxHours: number; stepMinutes: number }
```

Regeln, in dieser Reihenfolge:

1. `maxHours = max(baseHours, …max über alle aktiven Layer mit drivesSliderMax === true von
   min(spec-Horizont, avail.horizonFutureH))`. **Identisch zur heutigen `max()`-Kette** —
   nur dass „welcher Layer treibt" jetzt Daten statt `if`-Zweige sind.
2. `minHours = −max über alle aktiven Layer von min(spec.pastWindowH, avail.retentionPastH)`.
   **Hat kein aktiver Layer eine Vergangenheit, ist `minHours` exakt `0`.**
3. `stepMinutes = min über alle aktiven Layer von spec.stepMinutes`, mindestens 5, höchstens 60.
   (Nur Anzeige-Granularität des Sliders; die Frame-Wahl bleibt zeitbasiert.)

**Die Kompatibilitätsaussage ist prüfbar und gate-blockierend:** Für jede Teilmenge der **16
bestehenden** `LayerKey`s liefert `sliderRange` `minHours === 0` und exakt denselben `maxHours` wie
die heutige Kette. Das ist die erste Assertion von `verify:layer-time` (§14.1).

### 3.4 `resolveLayerTime` — Wahl über die absolute Gültigkeitszeit

```ts
export function resolveLayerTime(
  spec: LayerTimeSpec,
  sliderHours: number,          // vorzeichenbehaftet
  avail: LayerAvailability,
  nowMs: number,
): LayerTimeResolution
```

Ablauf:

1. `avail.block` gesetzt ⇒ `{ ready:false, reason: avail.block }`.
2. `avail.frames.length === 0` ⇒ `no-data`.
3. `targetMs = nowMs + sliderHours · 3_600_000`.
4. Bereichsprüfung **vor** der Frame-Suche:
   `sliderHours > avail.horizonFutureH + ε` ⇒ `out-of-horizon`;
   `sliderHours < −(avail.retentionPastH) − ε` ⇒ `out-of-retention`;
   `sliderHours < (spec.minStepHours ?? 0) − ε` und `spec.pastWindowH === 0` ⇒ `out-of-horizon`.
   `ε = 1e-6` — **dieselbe Toleranz und dieselbe Semantik wie `precipSource.ts:56`.**
5. Nächsten Frame nach `|validAtMs − targetMs|` suchen.
   Ist der Abstand größer als `spec.stepMinutes · 60_000` (also mehr als ein voller Frame-Schritt
   daneben) ⇒ `no-frame-near`. **Nie den „irgendwie nächsten" Frame zeigen** — genau das erzeugt
   heute den AT-Versatz (§2.3).
6. Sonst `{ ready:true, frameIndex, validAtMs, measured, offsetMinutes: (validAtMs − nowMs)/60000 }`.

Modus-Besonderheiten:

| Modus | Abweichung von obigem Ablauf |
|---|---|
| `instant` | Schritt 3–5 entfallen; immer der jüngste Frame; `ready` sofern Frames da. Der Slider hat **keine** Wirkung, das Alter steht im Chip |
| `window` | `targetMs` ist das **Fensterende**; `ready` bezieht sich auf das Fenster `[targetMs − Fenstergröße, targetMs]` |
| `forecast` | wie oben |
| `valid-interval` | statt Frames werden Intervalle geprüft; **kein `ready:false`** — der Layer bleibt aktiv und rendert leer, das UI zeigt „Keine gültige Warnung für diesen Zeitpunkt" (§3.5) |

### 3.5 Verhalten außerhalb des Bereichs (präzisiert §5.3 von `2d-layer-erweiterung.md`)

| Modus | Slider-Wirkung | Außerhalb |
|---|---|---|
| `instant` | keine | Layer bleibt sichtbar, Chip zeigt das Alter |
| `window` | wählt das Fensterende | Layer aus, Grund `out-of-retention` |
| `forecast` | wählt den Frame | Layer aus, Grund `out-of-horizon` — **kein Modellersatz** (D-14) |
| `valid-interval` | filtert nach Gültigkeit | **Layer bleibt an und rendert leer**, Hinweis „Keine gültige Warnung für diesen Zeitpunkt" |

**Abweichung, bewusst:** `docs/2d-layer-erweiterung.md` §5.3 sagt für `valid-interval` „Layer aus,
Hinweis". Das ist die schlechtere Variante: Ein *abgeschalteter* Warn-Layer ist von einem *kaputten*
Warn-Layer nicht zu unterscheiden — genau die Mehrdeutigkeit, die O-14 Option A verwirft. Ein
aktiver, leerer Layer mit Text sagt „hier ist gerade nichts", und das ist die ehrliche Aussage.
`2d-layer-erweiterung.md` §5.3 ist entsprechend korrigiert.

### 3.6 Das Schicksal von `precipSource.ts` — **unverändert lassen**

**Entscheidung: `src/nowcast/precipSource.ts` wird nicht angefasst.** `layerTime.ts` *delegiert*
für den Key `nowcast`:

```ts
// in layerTime.ts — der EINZIGE Import aus dem Bestand, bewusst schmal
import { precipRadarHorizonHours, type PrecipAvailability } from '../nowcast/precipSource';
```
und setzt `avail.horizonFutureH = precipRadarHorizonHours(precipAvailability)` sowie
`spec.pastWindowH = 0` für `nowcast`.

**Begründung (schriftlich, wie gefordert):**

1. **Byte-Identität wird konstruktiv statt geprüft.** Wenn keine Zeile in `precipSource.ts` sich
   ändert, kann das Verhalten der Menge `{rv, inca, rzc, d2}` sich nicht ändern — inklusive der
   Grenz-Inklusivität (DE 2 h und AT 3 h inklusive über `+EPS`, CH strikt `< 0.5`,
   `precipSource.ts:64-67`). Ein Äquivalenz-Verifier kann Fehler nur *finden*; ein nicht angefasstes
   Modul kann keine haben.
2. **`npm run verify:precip-source` bleibt unverändert grün.** Die 22 Prüfungen
   (`precipSource.ts:112-158`) prüfen weiterhin exakt dieselbe Implementierung. Der Gate-Nachweis
   ist der Vergleich der **Prüfnamen-Liste** vorher/nachher (kein Check darf verschwinden oder
   umbenannt werden) — nicht nur ein grünes Exit.
3. **D-14 ist nicht revisionsfähig.** `precipSource.ts` ist die Kodifizierung von D-14. Es in ein
   generisches Zeitmodell aufzulösen, würde die Entscheidung von einer Modulgrenze zu einer
   Konfigurationszeile degradieren — und Konfigurationszeilen ändert man versehentlich.
4. **Der Preis ist eine Doppelpflege**, die `docs/MAP.md` §5 ohnehin schon als bewusst in Kauf
   genommen beschreibt (`RADAR_HORIZON_H` ↔ `RV_MAX_H`/`INCA_MAX_H`/`RZC_MAX_H`). L5 macht sie
   nicht schlimmer und `verify:layer-time` prüft die Deckungsgleichheit maschinell (§14.1,
   Assertion 6).

**Gegenargument, ehrlich benannt:** Zwei Zeitmodelle nebeneinander sind konzeptionell unsauber, und
ein späterer Leser wird fragen, warum Niederschlag eine Sonderregel hat. Antwort: weil er eine
Sonderentscheidung *ist* (D-14). Wenn Jan die Zusammenführung später will, ist sie mit dem dann
existierenden `verify:composite-equivalence` risikoarm nachholbar — **O-16**.

### 3.7 Was `precipComposite.ts` in L5/L6 betrifft: **nichts**

Die Regenradar-Ansicht (§9) speist den `RainLayer` aus Komposit-Frames, die über
`resolveLayerTime` **nach Gültigkeitszeit** gewählt werden — sie ruft `PrecipCompositor.build(h, …)`
mit demselben `h` auf wie heute und ändert weder Signatur noch Mischschleife
(`precipComposite.ts:196-219`). Die Generalisierung auf eine Beitragsliste (V-137) bleibt **L8**.

**Byte-Identitäts-Kontrakt trotzdem benannt**, weil die Prompt-Vorgabe ihn für *jede* Berührung
verlangt: sollte L5/L6 wider Erwarten eine Zeile in `precipComposite.ts` ändern, ist
`npm run verify:composite-equivalence` (§14.4) die Gate-Bedingung — und der Verifier ist **vorher**
zu bauen, nicht danach.

---

## 4. `TimelinePlayer` — Vertrag

### 4.1 Aufteilung

```
src/map/timelineModel.ts    rein, DOM-frei, headless  → verify:timeline
src/map/TimelinePlayer.tsx  reine Darstellung + Events, kein eigener Zustand („controlled")
```
Das ist genau das Muster, das `RadarTimeline.tsx` schon benutzt (Kopfkommentar: „Controlled-Component:
Abspiel-Engine liegt im Radar-Block") — nur dass die Engine dort **im Bauteil** liegt
(`NowcastRadarMap.tsx:269-279`) und darum nicht prüfbar ist. L5 hebt sie heraus.

### 4.2 Reiner Zustand und Übergänge (`timelineModel.ts`)

```ts
export const SPEEDS = [0.5, 1, 2] as const;
export type Speed = typeof SPEEDS[number];

/** Frames pro Sekunde bei 1×. Übernommen aus NowcastRadarMap.tsx:271 (2.5) — die
 *  bereits im Produkt bewährte Rate; Änderung wäre eine Verhaltensänderung. */
export const BASE_FPS = 2.5;

export interface PlayerState {
  pos: number;        // gebrochene Frame-Position (0 … maxIdx)
  playing: boolean;
  speed: Speed;
  loop: boolean;
  /** true, solange der Nutzer auf „jetzt" steht. EINZIGE Bedingung für Auto-Advance. */
  atNow: boolean;
}

export function advance(s: PlayerState, dtMs: number, maxIdx: number, reducedMotion: boolean): PlayerState;
export function stepBy(s: PlayerState, delta: number, maxIdx: number): PlayerState;
export function scrubTo(s: PlayerState, pos: number, nowIndex: number, maxIdx: number): PlayerState;
export function jumpNow(s: PlayerState, nowIndex: number): PlayerState;
export function onFramesReplaced(s: PlayerState, oldNowIndex: number, newNowIndex: number, maxIdx: number): PlayerState;
export function loadSpeed(): Speed;      // localStorage, Default 1
export function persistSpeed(s: Speed): void;
```

Verhaltensregeln (jede einzeln prüfbar):

| Regel | Präzise Fassung |
|---|---|
| Fortschritt | `pos += dtMs/1000 · BASE_FPS · speed` |
| Ende erreicht | `loop` ⇒ `pos = 0`; sonst `pos = maxIdx`, `playing = false` |
| **Reduced Motion** | `advance` liefert **ausschließlich ganzzahlige `pos`**; der Fortschritt akkumuliert intern und rastet je vollem Schritt |
| Schritt ±1 | `pos = clamp(round(pos) + delta, 0, maxIdx)`; setzt `playing = false` |
| Scrubben | setzt `playing = false`; `atNow = (round(pos) === nowIndex)` |
| „Zurück zu jetzt" | `pos = nowIndex`, `playing = false`, `atNow = true` |
| **Auto-Advance** | `onFramesReplaced` verschiebt `pos` **nur wenn `atNow === true`** auf den neuen `nowIndex`; sonst bleibt `pos` **an derselben Gültigkeitszeit** (Aufrufer übergibt den neu gefundenen Index) |
| Geschwindigkeit | wird in `localStorage['buscosun.timeline.speed.v1']` gemerkt (Konvention der 20 `buscosun.*`-Keys, D-03); ungültiger Wert ⇒ 1 |

**Warum `atNow` ein eigenes Feld ist und nicht aus `pos === nowIndex` abgeleitet wird:** Nach dem
Einschieben eines neuen Frames verschiebt sich `nowIndex`; wäre `atNow` abgeleitet, würde ein Nutzer,
der bewusst auf „jetzt" steht, beim Frame-Wechsel für einen Tick als „scrubbend" gelten und der
Auto-Advance bliebe aus. `NowcastRadarMap.tsx:202` löst das heute mit einer lokalen Variable
`wasAtNow` — dieselbe Erkenntnis, nur nicht wiederverwendbar.

### 4.3 Der harte Mess-/Vorhersage-Bruch (Command-Deck, D-27)

Der Bruch ist **kein Styling-Detail**, sondern die visuelle Form von D-04 und laut
`docs/high-end-radar-feature-catalogue.md` §2 „the single most-underrated feature". Er wird aus
`RadarTimeline.tsx:148-175` in das Deck-System **portiert, nicht neu erfunden**.

Neue Token im `--mdk-`-Namensraum (`src/map/mapDeck.css`, Ergänzung — kein neues Designsystem):

| Token | Zweck | Wert |
|---|---|---|
| `--mdk-tl-meas` | Füllung der gemessenen Spur | `var(--mdk-steel)` bei 100 % Deckung |
| `--mdk-tl-fc` | Füllung der Vorhersage-Spur | `var(--mdk-steel)` bei 45 %, zusätzlich `repeating-linear-gradient` 3 px/3 px (gestrichelt) |
| `--mdk-tl-break` | Bruchlinie bei „jetzt" | 2 px, `var(--mdk-accent)`, volle Höhe des Tracks |
| `--mdk-tl-tick-meas` / `--mdk-tl-tick-fc` | Frame-Ticks | solide / offen |
| `--mdk-tl-country-de/at/ch` | Länderbänder (§12.3) | Sage / Terracotta / Violett bei 35 % |

Drei Signale gleichzeitig, damit die Aussage nicht allein an Farbe hängt (A11y, Katalog §13):
**(a)** Füllfarbe wechselt, **(b)** die Spur wird gestrichelt, **(c)** eine beschriftete Marke
„jetzt ⟶ Vorhersage" sitzt auf der Grenze. Zusätzlich sagt der Zeitstempel im Klartext
„gemessen" oder „Vorhersage" (`RadarTimeline.tsx:103-106` ist die Vorlage).

**Konfidenz-Abklingen:** Die Tick-Deckkraft fällt ab „jetzt" nach
`opacity = max(0.25, 1 − lead / (skillMin · 1.5))` — die in `RadarTimeline.tsx:154` bereits
produktive Formel. `skillMin` = 120 für DE, 180 für AT, 0 für CH.

### 4.4 A11y (verbindlicher Teil der Definition of Done)

| Aspekt | Festlegung |
|---|---|
| Rolle Track | `role="slider"`, `aria-label="Zeitpunkt"`, `aria-valuemin/-max` = Frame-Indizes, `aria-valuenow` = `round(pos)`, **`aria-valuetext`** = „19:35 Uhr · gemessen" bzw. „20:10 Uhr · Vorhersage in 35 Minuten" |
| Tastatur Track | `←`/`→` = ±1 Frame · `Home`/`End` = erster/letzter Frame · `Bild↑`/`Bild↓` = ±6 Frames (30 min) · `Pos1` doppelt = „jetzt" |
| Tastatur global | `Leertaste` = Play/Pause **nur, wenn der Fokus im Zeit-Deck liegt** (kein globaler Hotkey — er kollidiert sonst mit dem Kartenscroll) |
| Fokusreihenfolge | Track → Play → Schritt − → Schritt + → Jetzt → Geschwindigkeit → Schleife |
| Fokus sichtbar | 2 px `outline` in `--mdk-accent`, nie `outline: none` |
| Touch-Ziele | alle Bedienelemente ≥ 44 × 44 px (auch Desktop — keine 28-px-Icons) |
| `prefers-reduced-motion` | (1) Playback rastet ganzzahlig, (2) **kein** Crossfade/Tween (§9.3), (3) kein Auto-Scroll der Zeitleiste; Abfrage einmal per `matchMedia`, plus `change`-Listener |
| Screenreader-Äquivalent | Der Zustand „gemessen/Vorhersage" steht als Text im DOM, nicht nur als Farbe; die Länderbänder haben je ein `<span class="sr-only">` („Deutschland: gemessen bis jetzt, Vorhersage bis +2 Stunden") |

---

## 5. Permalink `#m=` — negative Stunden und die vollständige Bitmaske

### 5.1 Format

`src/mapState.ts` bleibt strukturell, es ändern sich zwei Dinge:

1. **`h` darf negativ sein.** `encodeMapState` rundet weiterhin auf eine Nachkommastelle
   (`:39`); `decodeMapState` akzeptiert jeden endlichen Wert (`:55` — **tut das bereits**, es ist
   keine Änderung nötig). Bestehende Links enthalten ausschließlich `h ≥ 0` ⇒ **keine Kollision,
   kein Formatwechsel, keine Version im Hash**.
2. **`LAYER_ORDER` wird vollständig** (V-134). Die Reihenfolge ist ab hier **eingefroren**:

```
 0 wind        1 nowcast     2 temp        3 clouds      4 sat        5 lightning
 6 stations    7 confidence  8 snowline    9 flownowcast 10 poprob    11 gust
12 thunder    13 lightningfc 14 snow       15 rotation   16 rainradar 17 motion
```

Bits 0–11 sind der heutige Bestand **unverändert** (`mapState.ts:24`) — alle existierenden
Permalinks bleiben gültig. 12–15 schließen die vier vergessenen Layer, 16–17 sind die neuen aus L6.

⚠️ **Nebenbefund:** Der Kommentar bei `mapState.ts:22-23` sagt, `confidence` sei „ans ENDE
angehängt" — tatsächlich steht `confidence` an Position 7 und `gust` am Ende. Der Kommentar ist
gedriftet und wird mitkorrigiert (reine Kommentar-Änderung, kein Verhalten).

### 5.2 Klemmung beim Dekodieren

`decodeMapState` liefert `h` unverändert; **die Klemmung passiert im Aufrufer**, weil erst dort
bekannt ist, welche Layer aktiv sind: `hour = clamp(decoded.hour, sliderRange().minHours,
sliderRange().maxHours)`. Ein Link mit `h = −1`, dessen Layer keine Vergangenheit hat, landet damit
auf `0` — sichtbar korrekt statt still kaputt.

### 5.3 `verify:mapstate` — neu, und was er erzwingen muss

Datei `scripts/verify-mapstate.mjs`, Alias `"verify:mapstate": "node --experimental-strip-types
--import ./scripts/lib/register-ts.mjs scripts/verify-mapstate.mjs"`.

| # | Assertion | Warum sie den nächsten vergessenen Layer fängt |
|---|---|---|
| 1 | **Jeder `LayerKey` kommt in `LAYER_ORDER` vor** — der Verifier importiert den `LayerKey`-Typ nicht (Typen sind zur Laufzeit weg), sondern eine **exportierte Laufzeitliste `ALL_LAYER_KEYS`**, die `MapView.tsx` neben dem Typ pflegt | Genau das ist der Fehler von heute (4 von 16 fehlen). Ohne Laufzeitliste ist er maschinell nicht fassbar ⇒ die Liste zu exportieren ist **Teil von L5** |
| 2 | `LAYER_ORDER` ist duplikatfrei und lückenlos | verhindert doppelte Bits |
| 3 | Die ersten 12 Einträge sind **exakt** die eingefrorene Bestandsliste (Golden-Array im Skript) | ein Einfügen statt Anhängen bricht alle bestehenden Links — das muss die Build-Zeit merken, nicht der Nutzer |
| 4 | Roundtrip für `h ∈ {−1, −0.5, 0, 0.1, 2, 2.5, 48}` | negative Achse |
| 5 | Ein **eingefrorener Legacy-Hash** (mit 12-Bit-Maske und `h ≥ 0`) dekodiert zu exakt demselben Zustand wie vor der Änderung | Rückwärtskompatibilität als Testfall, nicht als Behauptung |
| 6 | Unbekannte/übergroße Bits werden ignoriert statt zu werfen | Vorwärtskompatibilität |
| 7 | `decodeMapState('#r=…')` und Müll ⇒ `null` | bestehende Zusicherung |

**Red-Test-Nachweis (Pflicht, O-02/V-99):** Das Skript muss einmal mit einem absichtlich entfernten
Key fehlschlagen; der Beleg gehört ins Gate GL5.

---

## 6. Speicherbudget und Prefetch

### 6.1 Rechengrundlage (konkret, wie gefordert)

| Größe | Bytes | Herkunft |
|---|---|---|
| **Komposit-Frame** (`G` 600 × 512 Uint8) | **307 200 B ≈ 300 KiB** | `precipIndexMap.ts:15` |
| DE1200-Quellframe (1100 × 1200 Uint8) | **1 320 000 B ≈ 1,26 MiB** | `radolan.ts` / `precipComposite` |
| RV-Lauf komplett (25 Quellframes) | **31,5 MiB** | 25 × 1,26 MiB |
| Rückblick DE (12 Frames à 5 min = 60 min) | 3,5 MiB als Komposit / 15,1 MiB als Quellgitter | Faktor 4,3 |

**Die Regel, die daraus folgt und die den Unterschied macht:**
> **Für Playback werden ausschließlich Frames auf dem Komposit-Gitter vorgehalten. Quellgitter
> leben nur so lange, wie der Kompositor sie braucht — höchstens für den aktuellen und den
> unmittelbar vorherigen Lauf je Quelle, und sie werden als Erstes verdrängt.**

Ohne diese Regel sprengt ein einziger RV-Lauf (31,5 MiB) das 32-MB-Budget der schwächsten Klasse.
Mit ihr kostet die komplette DE-Regenradar-Ansicht (12 Rückblick + 25 Vorhersage = 37
Komposit-Frames) **11,1 MiB**.

### 6.2 `src/map/frameBudget.ts` — Tier-Ableitung ohne neue Governor-Logik

Der `FrameGovernor` bekommt **keine** neue Aufgabe (D-09). `frameBudget` liest nur, was
`perfGovernor.ts` schon liefert: `initialTier(readDeviceCaps(gl))` (`:101-112`) und
`caps.coarsePointer` (`:79-82`).

| `coarsePointer` | `initialTier` | Budget | Komposit-Frames (à 300 KiB) | Beispielgerät |
|---|---|---|---|---|
| false | `high` | **192 MB** | **655** | Desktop |
| false | `mid` / `low` | **96 MB** | **327** | schwacher Laptop |
| true | `high` | **96 MB** | **327** | starkes Tablet |
| true | **`mid`** | **64 MB** | **218** | **iPhone 12 Pro** ¹ |
| true | `low` | **32 MB** | **109** | Altgerät |

¹ Herleitung: Safari liefert `deviceMemory` nicht (`caps.memoryGB = 0` ⇒ die
`memoryGB <= 3`-Bedingung greift nicht), `hardwareConcurrency` = 6 (> 4), der Renderer-String
matcht `apple a1[2-9]` ⇒ `gpuClass = 'mid'` ⇒ `initialTier` gibt `'mid'` (`perfGovernor.ts:106-111`).
**Für iPhone 12 Pro gilt also: 64 MB, 218 Komposit-Frames gleichzeitig resident.** Die vollständige
Regenradar-Ansicht braucht 37 — das Budget ist um Faktor 5,9 überdeckt. Der Druck entsteht erst,
wenn L7–L9 weitere Raster-Layer dazustellen; dafür ist das Budget da.

```ts
export interface FrameBudget {
  readonly maxBytes: number;
  admit(layerKey: string, frameKey: string, bytes: number): boolean;
  touch(layerKey: string, frameKey: string): void;
  release(layerKey: string): void;         // Layer abgeschaltet
  setScrubbing(active: boolean): void;     // s. 6.3
  stats(): { used: number; frames: number; evicted: number };
}
```

**Verdrängungsreihenfolge (fest):**
1. Quellgitter von Läufen, die nicht der aktuelle sind.
2. Komposit-Frames **inaktiver** Layer.
3. Komposit-Frames aktiver Layer, absteigend nach Abstand zur aktuellen Slider-Position.
4. **Nie**: das Mindestkontingent von **±2 Schritten um die aktuelle Position je aktivem Layer**
   (O-13, „kein Layer verhungert"). Reicht das Budget nicht einmal dafür, meldet `admit` `false`
   und der Layer zeigt `out-of-memory`-Degradation statt zu flackern.

### 6.3 Zusammenspiel mit dem Scrubben

Während eines aktiven Scrubs (`setScrubbing(true)`, gesetzt auf `pointerdown` und 250 ms nach dem
letzten `pointermove` zurückgenommen) läuft **nur Admission, keine Eviction**. Grund: Beim schnellen
Hin- und Herziehen wechselt die „aktuelle Position" 60-mal pro Sekunde; eine positionsabhängige
Verdrängung würde Frames wegwerfen, die 200 ms später wieder gebraucht werden. Das Budget darf in
dieser Zeit bis **120 %** überzogen werden; danach räumt eine einmalige Eviction auf
(`requestIdleCallback`, Fallback `setTimeout(…, 0)`).

### 6.4 `src/map/fetchScheduler.ts` — Prioritäten

```
P0  Frame der AKTUELLEN Slider-Stunde des ZULETZT AKTIVIERTEN Layers
P1  ±1 Schritt dieses Layers
P2  restliche Frames dieses Layers
P3  P0/P1 der übrigen aktiven Layer
P4  restliche Frames der übrigen aktiven Layer
```

| Regel | Festlegung |
|---|---|
| Parallelität | höchstens **3** gleichzeitige Anfragen aus dem Scheduler. Begründung: Der Browser erlaubt 6 pro Host, und der Mount-Burst konkurriert bereits mit dem Wind-Hero — der Kommentar bei `MapView.tsx:1810-1812` beschreibt genau diesen Engpass |
| Abbruch | **ein `AbortController` je (`layerKey`, `runId`)**, nicht je Request. Ein neuer Lauf bricht den alten Lauf desselben Layers ab |
| Layer aus während des Ladens | P2/P4 dieses Layers werden **sofort abgebrochen**; P0/P1 laufen **zu Ende** und landen im Cache — die Wiederaktivierung ist dann sofort da. (Ein halb geladener Frame wegzuwerfen kostet mehr, als er spart) |
| Layer an während des Ladens | **keine Abbrüche**, nur Neupriorisierung: der neue Layer wird „zuletzt aktiviert" und seine P0/P1 rutschen vor die P2 der anderen |
| Ortswechsel | bricht **alles** ab (die Frames sind ortsunabhängig, aber die Reihenfolge ist es nicht) und startet mit P0 neu |
| Sichtbarkeit | bei `document.hidden` pausiert die Warteschlange nach dem laufenden Request (Regel 1 aus `2d-layer-erweiterung.md` §6) |

### 6.5 Purity-Aufteilung

| Modul | Rein? | Verifier |
|---|---|---|
| `src/map/layerTime.ts` | **ja** | `verify:layer-time` |
| `src/map/timelineModel.ts` | **ja** | `verify:timeline` |
| `src/map/frameBudget.ts` | **ja** (LRU-Buchhaltung, keine Puffer) | `verify:frame-budget` |
| `src/map/fetchScheduler.ts` | **ja** bis auf `fetch` — die Warteschlangenlogik ist ein eigener, injizierter `run(task)`-Callback | `verify:fetch-scheduler` *(optional, Stufe 2)* |
| `src/radar/motionField.ts` | **ja** | `verify:motion-field` |
| `src/map/frameBlend.ts` | **ja** | Teil von `verify:motion-field` |
| `src/map/TimelinePlayer.tsx` | nein (React) | MCP-Protokoll V-TIMELINE |
| MapView-Verdrahtung | nein | Gate GL5 |

---

# TEIL III — PHASE L6: REGENRADAR UND ZUGLINIEN

## 7. Abgrenzung — was L6 ist und was es nicht ist

| | `nowcast` (Bestand, D-14) | **`rainradar`** (neu) | **`motion`** (neu) |
|---|---|---|---|
| Frage | „Regnet es und wird es regnen?" | „**Woher kam das?**" | „**Wohin zieht es?**" |
| Zeitbereich | 0 … Land-Horizont | −60 min … Land-Horizont | −60 min … Land-Horizont |
| Inhalt | Analyse + Nowcast, eine Fläche | dieselbe Fläche, **mit Rückblick und Playback** | Pfeilfeld über der Fläche |
| Quelle | RV/INCA/rzc über `PrecipCompositor` | **identisch** | abgeleitet (Horn-Schunck) |
| Wird `nowcast` verändert? | **nein** | nein | nein |

**D-14 bleibt unangetastet.** `rainradar` ist eine **zusätzliche** Ansicht auf denselben Kompositor
— keine Modellverlängerung, kein zweiter Datenpfad, keine Rückkehr der 2–12-h-Hälfte. Wer beide
Layer gleichzeitig einschaltet, sieht dieselben Pixel doppelt; deshalb sind sie im Band `precip`
gegenseitig **weich ausschließend** (O-12: der zuletzt aktivierte gewinnt, mit sichtbarem Hinweis).

## 8. Datenfluss L6

```
                       ┌── DE: RV-Tar (25 Frames) + _000-Frames der letzten 12 Läufe
   fetchScheduler ─────┼── AT: INCA-NetCDF (11–12 Leads) + last_forecast_reftime  ← NEU gelesen
                       └── CH: rzc (1 Frame, Messzeit aus /what)
                                 │
                    radarFrames.ts  (Stack mit measured-Flag, echten Gültigkeitszeiten)
                                 │
                    PrecipCompositor.build(h, …)      ← unverändert
                                 │
              ┌──────────────────┴───────────────────┐
              ▼                                       ▼
        frameBudget (LRU, Komposit-Gitter)      motionField.ts (E2)
              │                                       │
     frameBlend.blendU8(a, b, f)  (E1)          GeoJSON-Pfeilgitter
              │                                       │
        RainLayer.setFrame()                   map.addSource('motion')
              │                                       │
              └────────────► layerTime / TimelinePlayer ◄────────┘
```

## 9. E1 — Verlagerung und Playback

### 9.1 Welche Frames

| Land | Vergangenheit | Gegenwart | Zukunft | Kadenz |
|---|---|---|---|---|
| **DE** | 12 × `_000`-Frames der letzten 12 RV-Läufe = **60 min** | `_000` des aktuellen Laufs (gemessen) | `_005`…`_120` = +2 h (Vorhersage) | 5 min |
| **AT** | aus dem Sitzungs-Cache, soweit vorhanden (kein Archivabruf) | **keiner** (INCA hat keine Analyse) | 11–12 Leads bis +3 h | 15 min |
| **CH** | aus dem Sitzungs-Cache, soweit vorhanden | rzc-Messframe | **keiner** | 5 min |

**Die Rückblickstiefe kommt aus `PAST_WINDOW_H = 1`** (§3.2). Heute füllt
`radarFrames.ts:114` (`DE_PAST_SEED_FRAMES = 9`) nur **45 min**; L6 setzt den Wert auf **12**.
Die Fenstergrenze `PAST_WINDOW_MIN = 120` (`:75`) bleibt, weil sie nichts kostet und eine spätere
O-10-Option C ohne Umbau erlaubt.

Der Archiv-Seed (`seedDePastArchive`, `:122-132`) lädt zwölf zusätzliche RV-Tars — **nicht im
Kaltstartpfad** (der Kommentar bei `:111-113` sagt das bereits und bleibt gültig). Er läuft als
P4-Aufgabe des Schedulers, sobald der aktuelle Lauf steht.

### 9.2 Warum die Rückblick-Frames nicht 12 × 1,6 MB Netz kosten

Der RV-Tar-Cache (`radolan.ts:165-188`, `RV_TAR_CACHE_MAX = 14`) hält bereits 14 Läufe vor — der
Kommentar bei `:166-168` nennt genau diesen Zweck. Ein warmer Reload zieht die zwölf
Rückblick-Läufe aus der Cache API, nicht aus dem Netz. Kalt kostet der Seed 12 × ~0,73 MB ≈ 8,8 MB,
verteilt über P4. **Das ist der Grund, warum `RV_TAR_CACHE_MAX` nicht unter 14 fallen darf** — als
Kontrakt notieren.

### 9.3 Tween: `src/map/frameBlend.ts`

```ts
/** Konvexe Mischung zweier Uint8-Frames gleicher Länge: out = (1-f)·a + f·b. */
export function blendU8(a: Uint8Array, b: Uint8Array, f: number, out?: Uint8Array): Uint8Array;
```

**Warum CPU-Blend und nicht ein zweiter `RainLayer` oder eine Shader-Erweiterung:**

| Weg | Bewertung |
|---|---|
| **CPU-Blend (gewählt)** | 307 200 Operationen je Tween-Frame; bei 2,5 fps × 2× = 5 Tween-Frames/s ⇒ 1,5 M Ops/s — im Rauschen gegenüber dem ohnehin laufenden Kompositor-Gather derselben Größe. Rein, headless prüfbar, **null WebGL-Risiko** |
| Zweiter `RainLayer` mit Alpha | verdoppelt Draw-Calls und Texturspeicher; zwei halbtransparente Regenflächen übereinander sind **nicht** dasselbe wie ein gemischter Wert (Alpha-Compositing ≠ konvexe Mischung der Intensität) — die Legende würde lügen |
| Shader-Erweiterung (2 Texturen + `mix`) | optisch am besten und am billigsten auf der GPU — **aber Shader-Zone ⇒ STOPP & FRAGEN** (`CLAUDE.md`). Bleibt als spätere Option, ist **nicht** Teil von L6 |

Die konvexe Mischung erbt dasselbe Argument wie die bikubische B-Spline-Abtastung
(`docs/MAP.md` §2.5): alle Gewichte ≥ 0, Summe 1 ⇒ **kein Überschwingen, kein künstlicher Regen**.

**Wann getweent wird:**

| Bedingung | Verhalten |
|---|---|
| `prefers-reduced-motion` | **kein** Tween, gerasterte Schritte |
| `FrameGovernor`-Tier `low` | **kein** Tween (erster Hebel, den L6 abschaltet) |
| Tier `mid`/`high` | Crossfade aktiv |
| Flag `motionWarp` (D-11, **default off**) | statt Crossfade: `advect(a, flow, f)` aus `opticalFlowNowcast.ts:75` — Fallback bei jedem Fehler und auf Tier `low` **ist der Crossfade**, benannt und getestet |

**Was der `FrameGovernor` in welcher Reihenfolge abschaltet** (D-09, keine Sonderpfade — nur eine
feste Liste, die an sein Tier gebunden ist):
1. `motionWarp` (falls eingeschaltet) → Crossfade
2. Crossfade → gerasterte Schritte
3. Playback-FPS 2,5 → 1,5
4. Zugvektor-Dichte eine Zoomklasse gröber (§10.4)
Die Partikelzahl des Wind-Layers ist **nie** ein Hebel — das bleibt unberührt.

### 9.4 Wiederholrate und Repaint

Playback zeichnet nur, wenn `playing === true` oder ein Scrub läuft. Im Ruhezustand kein
`triggerRepaint` — die in P3 eingeführte Repaint-Disziplin (`visibilitychange` /
`IntersectionObserver`) gilt unverändert und wird **nicht** dupliziert.

## 10. E2 — der Zuglinien-Layer

### 10.1 Pipeline in acht Schritten

```
① Eingang:  zwei GEMESSENE Analysen auf dem Komposit-Gitter (600×512),
            zeitlich benachbart (DE 5 min, AT 15 min)
② Gröbern:  Blockmittel 4×4  →  Flussgitter 150×128
③ Fluss:    estimateFlowHS(a, b, 150, 128, { alpha: 0.5, iters: 60 })   [Worker]
④ Glätten:  EMA über die letzten 3 Schätzungen, α = 0,4, auf u und v getrennt
⑤ Einheiten: px/Intervall → km/h  (§10.3)
⑥ Schwelle: nur Zellen mit 3×3-Mittel ≥ 0,5 mm/h UND |Fluss| ≥ 0,2 px/Intervall
⑦ Dezimieren: jede n-te Zelle nach Zoomstufe; harte Obergrenze 1 200 Features
⑧ GeoJSON:  FeatureCollection<Point> mit { bearing, speedKmh, mmh }
```

### 10.2 Warum 150 × 128 und nicht 600 × 512

Horn-Schunck ist `O(iters · w · h)`. Auf dem vollen Komposit-Gitter wären das
`60 · 600 · 512 ≈ 18,4 M` innere Schritte je Achse — im Bereich mehrerer hundert Millisekunden und
damit ein Long Task > 200 ms (eine der fünf Selbstverifikations-Fragen). Auf 150 × 128 sind es
`60 · 150 · 128 ≈ 1,15 M` — Größenordnung 10–20 ms. Die Auflösung reicht: eine Flusszelle ist
~8,8 km, ein Zugvektor soll ohnehin nicht feiner sein als die Kohärenzlänge eines
Niederschlagsgebiets.

**Ausführung im Worker** (`src/radar/motionWorker.ts`) nach dem etablierten Muster von
`precipIndexWorker` / `radolanWorker`: Pool-Größe 1, transparenter Main-Thread-Fallback bei
fehlendem oder abgestürztem Worker. `iters: 60` statt der Default-80 (`opticalFlowNowcast.ts:25`),
weil der Selbsttest zeigt, dass die Konvergenz bei `alpha: 0.5` deutlich vorher steht
(`:111` nutzt 200 Iterationen für eine 60×60-Testfläche mit Sub-Pixel-Anspruch — die Karte braucht
das nicht).

### 10.3 Von Pixeln zu km/h — die Rechnung ausgeschrieben

Komposit-Gitter `G` (`precipIndexMap.ts:15`): `lon 5,5…17,4` über 600 Spalten,
`lat 45,3…55,5` über 512 Zeilen.

```
Δlon_komposit = (17,4 − 5,5) / 599   = 0,0198664°
Δlat_komposit = (55,5 − 45,3) / 511  = 0,0199609°
Flussgitter (÷4):  Δlon = 0,0794656°   Δlat = 0,0798434°

dx_km(φ) = Δlon · 111,32 · cos φ        (bei 48° N: 5,917 km)
dy_km    = Δlat · 110,57                (8,828 km)

speed_kmh = hypot(u · dx_km(φ), v · dy_km) · (60 / Intervall_min)
            → DE (5 min):  · 12
            → AT (15 min): · 4
bearing°  = (atan2(u · dx_km(φ), −v · dy_km) · 180/π + 360) mod 360
```
`v` zeigt in Zeilenrichtung, und Zeile 0 ist **Nord** (north-up-Konvention des `RainLayer`) —
daher das Minuszeichen. Das Ergebnis ist die meteorologische **Zug**richtung („wohin"), nicht die
Herkunftsrichtung. Das ist der umgekehrte Sinn zur Windrichtung, und die Legende muss es sagen:
**„Pfeil zeigt, wohin der Niederschlag zieht"**.

### 10.4 Dichte je Zoomstufe und die harte Obergrenze

| Zoom | jede n-te Flusszelle | Abstand ≈ | Begründung |
|---|---|---|---|
| < 6 | 6 | 53 km | DACH-Übersicht, Pfeile sollen die Fläche nicht zupflastern |
| 6 … < 8 | 4 | 35 km | |
| 8 … < 10 | 2 | 18 km | |
| ≥ 10 | 1 | 8,8 km | native Auflösung des Flussgitters — feiner geht nicht ehrlich |

Auf Mobil (`coarsePointer === true`) gilt jeweils **eine Klasse gröber**.
Harte Obergrenze **1 200 Features**: wird sie überschritten, wird `n` um 1 erhöht und neu emittiert
(iterativ, höchstens 3-mal). Die Zahl der weggelassenen Vektoren wird **geloggt**, nicht verschwiegen
(„no silent caps").

### 10.5 Rendering — zwei native MapLibre-Layer

```ts
map.addSource('motion', { type: 'geojson', data: fc });

map.addLayer({ id: 'motion-arrows', type: 'symbol', source: 'motion',
  layout: {
    'icon-image': 'mdk-motion-arrow',              // per map.addImage aus einem Canvas, kein externes Asset
    'icon-rotate': ['get', 'bearing'],
    'icon-rotation-alignment': 'map',
    'icon-allow-overlap': true, 'icon-ignore-placement': true,
    'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 11, 1.1],
  },
  paint: {
    'icon-opacity': ['interpolate', ['linear'], ['get', 'speedKmh'], 2, 0.45, 25, 0.95],
  }});

map.addLayer({ id: 'motion-labels', type: 'symbol', source: 'motion',
  minzoom: 9,
  layout: {
    'text-field': ['concat', ['to-string', ['round', ['get', 'speedKmh']]], ' km/h'],
    'text-font': ['Noto Sans Regular'], 'text-size': 11,
    'text-offset': [0, 1.2], 'text-allow-overlap': false,
  },
  paint: { 'text-color': 'var→ --mdk-ink', 'text-halo-color': 'var→ --mdk-sand', 'text-halo-width': 1.2 }});
```

| Aspekt | Festlegung |
|---|---|
| **Z-Band** | **`vector` (Band 6)** nach `docs/LAYER_SYSTEM.md` §6 — über dem Niederschlagsraster (Band 3) und der Maske (4), unter Stationen (7) und Wind (8). Konkret: `addLayer(..., beforeId = STATIONS_LAYER_ID)`, und in der `moveLayer`-Sequenz **vor** `STATIONS_LAYER_ID` einsortiert |
| **Farbe** | Pfeil in `--mdk-ink` bei 78 % Deckung mit 1 px `--mdk-sand`-Kontur — liest auf hellem Basemap **und** auf rotem Starkregen. Neue Token: `--mdk-motion-arrow`, `--mdk-motion-label` |
| Größe | ≥ 22 px effektive Trefferfläche bei z ≥ 10 (Tap-Ziel; das Icon selbst darf kleiner sein, `icon-padding` gleicht aus) |
| Legende | eigener Eintrag im Deck: Pfeil-Sprite + „Zugrichtung · km/h" + Ehrlichkeitssatz (§12.1) |

### 10.6 Interaktion

`map.on('click', 'motion-arrows', …)` (Muster wie `STATIONS_LAYER_ID`) und
`mouseenter`/`mouseleave` für den Cursor. Das Readout zeigt:

```
Zieht mit ~35 km/h nach Nordost.
Erreicht Wetzlar in ~35 min.                  ← nur wenn die Spur den Ort trifft
Berechnet aus zwei gemessenen Radarbildern (19:30 und 19:35 Uhr).
```

Die ETA entsteht aus derselben Mathematik wie `etaToPoint` (`cellTracking.ts:231-249`), aufgerufen
mit einer synthetischen „Zelle": Position = Flusszellen-Mittelpunkt, `speedKmh`/`bearingDeg` = Vektor,
`radiusKm` = halbe Flusszellen-Diagonale (≈ 5,3 km). Trifft die Spur den Ort nicht innerhalb von
`radiusKm + 25 km`, lautet der Satz **„zieht an Wetzlar vorbei"** — nicht „kein Regen".

**Sprachregeln (D-04/D-19, gate-blockierend):** „zieht", „erreicht", „vorbei" · immer mit `~` bzw.
„etwa" · **nie** „trifft", „Warnung", „Unwetter", „Gefahr". Die Zeitangabe wird auf 5 Minuten
gerundet, weil eine Minutenangabe eine Genauigkeit vortäuschen würde, die die Methode nicht hat.

### 10.7 Leerzustände und Verhalten außerhalb Deutschlands

| Zustand | Auslöser | Text im Readout |
|---|---|---|
| **Noch keine Berechnung** | < 2 gemessene Analysen im Sitzungs-Cache und Archiv-Seed noch nicht fertig | „Die Bewegung wird berechnet, sobald zwei gemessene Radarbilder vorliegen." |
| **Nichts in Bewegung** | Schwelle §10.1⑥ überall unterschritten | „Kein zusammenhängender Niederschlag in Bewegung." |
| **Österreich** | INCA statt Radar | Pfeile **werden gezeigt**, berechnet aus **zwei aufeinanderfolgenden INCA-Läufen zur selben Gültigkeitszeit** (15-min-Abstand). Fester Zusatz: „Für Österreich aus der **INCA-Analyse** abgeleitet, nicht aus einer Radarmessung." — die Beschriftung „Radar" ist für AT unzulässig (`docs/DATA_SOURCES.md` §3.1 R4) |
| **Schweiz** | keine offene Bewegungsquelle | **Keine Pfeile.** „Für die Schweiz veröffentlicht MeteoSchweiz keine offene Bewegungs- oder Nowcast-Quelle. Die Zuglinien enden an der Grenze." + Deep-Link (`officialSources.ts`) |
| **Außerhalb DACH** | Komposit deckt nicht ab | keine Pfeile, kein Text (die Länder-Maske erklärt es bereits) |

**Warum die Schweiz keine sitzungsbasierten Pfeile bekommt** (Entscheidung, mit Gegenargument):
Technisch wäre es möglich — der `rzc`-Sitzungs-Cache sammelt alle 5 Minuten einen Messframe, nach
zehn Minuten Sitzungsdauer gäbe es ein Paar. Dagegen spricht: Ein Layer, der über der Schweiz erst
nach zehn Minuten Wartezeit erscheint, sieht wie ein Fehler aus und macht die Grenze zu einer
Datenanomalie statt zu einer erklärten Lücke. Die ehrliche, gleichbleibende Aussage ist besser als
die gelegentlich verfügbare. **Der sitzungsbasierte Weg ist als V-146 registriert** und wäre nach
Anbindung des 14-Tage-Archivs (L14-nah) sauber machbar.

## 11. E3 — Zellbahnen: entschieden, spezifiziert, terminiert

> ✅ **UMGESETZT am 2026-08-05 als eigene Phase Z1** — auf Jans Auftrag **vor** L5/L6 vorgezogen,
> statt wie unten terminiert in L11. Gate **GZ1** in `checklist.md`, Diagnose `audit/zellbahnen.md`,
> Code: `src/radar/konrad3d.ts` · `src/radar/cellPolygons.ts` · `src/sources/dwdKonrad3d.ts` ·
> `LayerKey 'cells'` in `MapView.tsx`. Verifier `npm run verify:cells` (64/64).
> Die Spec darunter ist damit **Ist-Beschreibung**, nicht mehr Plan — mit **zwei** Abweichungen:
> **(a)** Die Abdeckung ist **nicht** „DE only" (s. §11.2, korrigiert). **(b)** Der Fallback
> `cellsLocal` ist **nicht** gebaut (V-149).

### 11.1 Die Entscheidung

**E3 wird gebaut, auf Basis von KONRAD3D, und zwar in Phase L11 — nicht in L6.**
*(Überholt: umgesetzt in Phase Z1, s. Kasten oben. Die Begründung gegen die Eigenberechnung gilt
unverändert und ist der Grund, warum der Pfadkegel amtlich statt geschätzt ist.)*

Warum nicht Eigenberechnung: `src/radar/cellTracking.ts` ist gut und funktioniert
(`detectAndTrackCells` `:148-224`, `etaToPoint` `:231-249`, Selbsttest `:274-314`), aber es liefert
eine **Heuristik** (Block-Matching mit SAD, Trichter über `radiusKm + distF·0,25` bei `:216`) dort,
wo der DWD eine **amtliche** Spur **mit amtlicher Unsicherheitsellipse** publiziert. Nach D-04 ist
die amtliche Quelle vorzuziehen, sobald sie belegt ist — und sie ist es seit §1.3.
`cellTracking.ts` bleibt als **benannter Fallback** (D-11), wenn KONRAD3D nicht erreichbar ist,
und behält seinen heutigen Einsatz in der Nowcast-Ansicht unverändert (Funktionserhalt).

Warum nicht in L6: E3 ist ein eigener Datenpfad (Verzeichnis-Scrape, 612-KB-XML, DOM-freier Parser,
Proxy), ein eigenes Rendering (`fill` + `line` + `symbol`) und vor allem eine **eigene
Ehrlichkeitsfläche** — `hail_flag`, `gust_flag` und `maximum_estimated_wind_gust` sind
warnungsnahe Größen und lösen D-19 aus. „Ein Thema = eine Phase = ein Gate" (`CLAUDE.md`) verbietet,
das an L6 anzuhängen. L6 ist mit E1 + E2 bereits M-groß.

**Die genannte Vorbedingung (F-3) ist erfüllt.** L11 wartet ab sofort auf nichts mehr außer auf
L10. Wer E3 dennoch in L6 haben will, entscheidet **O-18** — die Empfehlung dort lautet: nein.

### 11.2 Spec für L11 (damit dort keine Recherche mehr anfällt)

| Thema | Festlegung |
|---|---|
| Transport | `/_dwd_opendata/weather/radar/konrad3d/` — **Proxy Pflicht** (§1.1), Verzeichnis-Scrape (kein `latest`-Alias), Regex `KONRAD3D_(\d{8}T\d{6})\.xml`, jüngste Datei; TTL 60 s wie `_runCache` in `radolan.ts:144-145` |
| Größe / Takt | ~0,6 MB je 5 min ⇒ **~7,2 MB/h**, wenn dauerhaft gepollt. Nur bei aktivem Layer und sichtbarem Tab pollen (Regel §6.4) |
| Parser | **DOM-frei** (D-12): kleiner Pull-Parser über die ~20 gebrauchten Pfade, nicht `DOMParser`. `jsfive`/`gribDecode` sind die Vorbilder für „eigener Parser statt Abhängigkeit" (D-06) |
| **Sentinel** | `-1000000000` (alle Nachkommastellen) und `not-a-date-time` ⇒ **Feld gilt als fehlend**. Ein Verifier muss das mit einem echten Fixture prüfen (dasselbe Muster wie der `cinGate`-Sentinel aus F1) |
| Zellumriss | `polygons_projected/…/polygon` → `fill` (12 % Deckung) + `line` (1,5 px), Farbe nach `intensity/severity_decimal` in der Deck-Palette |
| **Pfadkegel** | Polygon aus den 12 `centroid_forecast`-Punkten, aufgeweitet um die **amtliche** `uncertainty_ellipse` je Stützstelle (`major_axis`/`minor_axis`/`angle`). **Keine eigene Aufweitungsformel** — der Kegel ist damit belegt statt geschätzt |
| Richtung | aus `centroid_3d` → erstem `centroid_forecast` (`bearingDeg` aus `gridGeo.ts`); `cell_speed` liefert den Betrag |
| ETA | Schnitt der Prognosespur mit dem Standort; Trefferradius = `minor_axis` der Ellipse zur jeweiligen Vorlaufzeit |
| **Wortwahl** | „Zelle", „Hinweis auf Hagel in der Zelle", „geschätzte Spitzenböe ~X km/h", „erreicht … in ~X min". **Nie** „Tornado", „Unwetterwarnung", „Gefahr". Amtliche Warnungen kommen aus L3/L4, nicht von hier |
| Mesozyklone | **kein eigener Layer** (§1.4); nur als Zeile im Zell-Detail, wenn `number_assigned_mesocyclones > 0` |
| Abdeckung | ⚠️ **korrigiert 2026-08-05 (Phase Z1, am Datum belegt):** nicht „DE only", sondern die **Reichweite des deutschen Radarverbunds** — sie reicht über die Grenze und dünnt dort aus. Beleg: In `KONRAD3D_20260805T204000.xml` liegt Zelle 12 bei **47,009 °N / 11,879 °E (Tirol)**, erkannt aus den Sweeps `isn` (Isen) + `mem` (Memmingen). Für AT/CH gibt es **kein gleichwertiges Objektprodukt** — genau so formuliert der Layer es (O-14 B) |
| Fallback | `cellTracking.ts` hinter Flag `cellsLocal` (D-11), default off, Aktivierung nur bei KONRAD3D-Ausfall, sichtbar gekennzeichnet als „eigene Schätzung" |

---

## 12. Ehrlichkeitsfläche

### 12.1 Auf der Karte

| Signal | Umsetzung |
|---|---|
| gemessen vs. Vorhersage | Bei einem Vorhersageframe erscheint am oberen Rand der Kartenbühne ein 2 px hoher, gestrichelter Balken in `--mdk-tl-fc` plus das Wort **„Vorhersage"** im Readout-Chip. **Das Raster selbst wird nicht abgedunkelt** — eine Opazitätsabsenkung würde als „schwächerer Regen" gelesen |
| Datenalter | Bestehender Chip über `src/dataAge.ts`; die **echte** Referenzzeit, nie die Abrufzeit (D-04/V-19). `rainradar` und `motion` liefern `ref` verpflichtend |
| Herkunft der Pfeile | Legende: „Zugrichtung — aus zwei gemessenen Radarbildern berechnet (buscosun), nicht vom DWD geliefert." Für AT: „aus der INCA-Analyse abgeleitet." |
| Sättigung | Für CH zusätzlich: „rzc sättigt bei 118 mm/h — der Wert ist eine Untergrenze." (bestehende Aussage aus `docs/DATA_SOURCES.md` §3.1 R3) |
| Radar-Grenzen | Der bestehende Legendeneintrag „Radar-Grenze" (`MapView.tsx:3373`) bleibt; Strahlabschattung/Bright-Band sind **nicht** Teil von L6 (Katalog §10 → eigene Phase) |

### 12.2 Auf der Zeitleiste

Drei Signale (Farbe, Strichelung, Textmarke) plus Konfidenz-Abklingen — §4.3.

### 12.3 Die DE/AT/CH-Horizontdifferenz sichtbar machen

Unter dem Track liegen drei dünne Länderbänder, jedes endet an seinem eigenen Horizont:

```
Vergangenheit  │  jetzt  │  Vorhersage
───────────────┼─────────┼──────────────────────────────────
DE ▓▓▓▓▓▓▓▓▓▓▓▓│▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░│  bis +2 h
AT ░░░░░░░░░░░░│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ bis +3 h (Analyse)
CH ▓▓▓▓▓▓▓▓▓▓▓▓│▓        │  ← endet hier
```
Legende darunter, einzeilig: **„CH: kein offener Nowcast · AT: Analyse statt Radar."**
Das ist die kompakteste ehrliche Darstellung der in `docs/DATA_SOURCES.md` §11 aufgezählten
Länder-Lücken, und sie steht dort, wo der Nutzer die Frage stellt.

### 12.4 Fehler und Offline (V-139)

| Fall | Verhalten |
|---|---|
| `offline` | Jüngster Cache-Treffer wird gezeigt, mit **Stale-Badge** und echter Referenzzeit („Letzter Stand 19:35 Uhr — offline"). Der RV-Tar-Cache **enthält** die Daten (`radolan.ts:165-188`) |
| `upstream` (404/5xx) | Quelle wird benannt, Retry mit Backoff 5 s/15 s/60 s, dann Aufgabe |
| `format` | „Die Quelle hat ihr Format geändert" + Kontrakt-Sonde meldet (V-142) |
| `out-of-horizon` | Layer aus + Grund; **kein Modellersatz** |
| `out-of-coverage` | Lückentext + amtlicher Link |
| `no-frame-near` | „Für diesen Zeitpunkt liegt kein Radarbild vor" — **nicht** „kein Niederschlag" |

## 13. Mobil (390 × 844, iPhone 12 Pro)

| Aspekt | Festlegung |
|---|---|
| Ort der Zeitleiste | im bestehenden Zeit-Deck des Bottom Sheets — **kein neues Overlay** |
| Höhe | 96 px in zwei Reihen: Reihe 1 Track (44 px inkl. Trefferfläche), Reihe 2 Bedienung |
| Bedienung Reihe 2 | `◀ ▮▶ ▶` · „Jetzt" · **Geschwindigkeit als ein durchschaltender Chip** (0,5× → 1× → 2×) statt drei Knöpfen — spart 88 px, entfernt **keine** Funktion · Schleifen-Schalter |
| Touch-Ziele | alle ≥ 44 × 44 px; der Track selbst hat 44 px Trefferhöhe bei 18 px sichtbarer Höhe (`padding`-Trick, wie im Radar-Deck) |
| Scrub vs. Sheet-Drag | Der Track setzt `touch-action: none` und `setPointerCapture` (`RadarTimeline.tsx:89`) — sonst zieht die Geste das Sheet statt des Reglers. **Das ist der wahrscheinlichste Mobil-Bug dieser Phase** und gehört als eigener Punkt ins Gate |
| Länderbänder | auf Mobil auf **ein** Band reduziert (das Land des gewählten Orts) plus Textzeile; Funktionserhalt: die vollen drei Bänder bleiben im Detail-Sheet erreichbar |
| Zugvektoren | eine Zoomklasse gröber (§10.4); Labels erst ab z ≥ 10 statt 9 |
| Was **nicht** entfällt | nichts. Keine Funktion wird auf Mobil weggelassen — nur umgruppiert (Oberste Direktive) |

---

# TEIL IV — ABNAHME

## 14. Verifier-Spezifikationen

Für jeden gilt: **ohne `npm run`-Alias zählt der Selbsttest nicht** (V-95). Jeder muss einmal
absichtlich rot gemacht worden sein (Red-Test-Nachweis, V-99).

### 14.1 `verify:layer-time`
`scripts/verify-layer-time.mjs` → `npm run verify:layer-time`
Importiert `src/map/layerTime.ts` (netzfrei, keine Fixtures nötig).

| # | Assertion |
|---|---|
| 1 | **Kompatibilität:** für alle 2¹⁶ Teilmengen der 16 Bestands-Keys ist `sliderRange(...).minHours === 0` (Stichprobe: alle 16 Einzel-Layer + 100 pseudozufällige Kombinationen aus einem festen Seed) |
| 2 | `maxHours` reproduziert die heutige `max()`-Kette für `{}`, `{clouds}`, `{nowcast}`, `{clouds,nowcast}` |
| 3 | `minHours = −1` genau dann, wenn `rainradar` oder `motion` aktiv ist und `retentionPastH ≥ 1` |
| 4 | Vier Modi: `instant` ignoriert den Slider · `window` liefert das Fensterende · `forecast` jenseits des Horizonts ⇒ `out-of-horizon` · `valid-interval` liefert **nie** `ready:false` |
| 5 | **Absolute Zeitwahl:** ein Frame-Satz mit Referenzzeit −32 min und Leads 0,5…3,0 h wird bei `sliderHours = 1` auf den Frame mit `validAtMs ≈ now+1 h` abgebildet — **nicht** auf `leadHours === 1`. (Der AT-Fall aus §2.3, als Regressionstest) |
| 6 | **Deckungsgleichheit mit `precipSource`:** für `nowcast` liefert `layerTime` exakt `precipRadarHorizonHours`; DE 2 h und AT 3 h sind `ready`, DE 2,5 h und CH 0,5 h sind es nicht (CH strikt) |
| 7 | `no-frame-near`, wenn der nächste Frame weiter als `stepMinutes` entfernt ist |
| 8 | `minStepHours` wird geachtet (`rotation` bei h < 1 ⇒ nicht ready) |
| 9 | `block` schlägt jede Zeitprüfung |

### 14.2 `verify:timeline`
`scripts/verify-timeline.mjs` → `npm run verify:timeline`. Importiert `src/map/timelineModel.ts`.

| # | Assertion |
|---|---|
| 1 | `advance` bei 1× und `dtMs = 400` bewegt `pos` um exakt `1,0` (BASE_FPS 2,5) |
| 2 | Ende + `loop` ⇒ `pos = 0`, `playing` bleibt; Ende ohne `loop` ⇒ `pos = maxIdx`, `playing = false` |
| 3 | **Reduced Motion:** über 200 aufeinanderfolgende `advance`-Aufrufe ist **jede** gelieferte `pos` ganzzahlig, und die Gesamtzahl der Schritte weicht um ≤ 1 von der Nicht-Reduced-Variante ab |
| 4 | `stepBy` klemmt an beiden Enden und setzt `playing = false` |
| 5 | **Auto-Advance-Invariante:** `onFramesReplaced` verschiebt `pos` genau dann, wenn `atNow === true`; bei `atNow === false` bleibt die **Gültigkeitszeit** erhalten |
| 6 | `scrubTo` setzt `atNow` genau bei `round(pos) === nowIndex` |
| 7 | Geschwindigkeit: `persistSpeed(2)` → `loadSpeed() === 2`; ein manipulierter Speicherwert (`"schnell"`, `7`, `null`) ⇒ `1` |
| 8 | `jumpNow` ist idempotent |

### 14.3 `verify:motion-field`
`scripts/verify-motion-field.mjs` → `npm run verify:motion-field`.
Importiert `src/radar/motionField.ts` und `src/map/frameBlend.ts`; erzeugt seine Eingänge synthetisch
(kein Netz).

| # | Assertion |
|---|---|
| 1 | **Richtung:** ein gaußscher Blob, um (+4, +1) Zellen versetzt ⇒ mittlere Peilung der emittierten Pfeile weicht ≤ 10° von der Wahrheit ab |
| 2 | **Betrag:** die berechnete km/h weicht ≤ 15 % vom analytischen Wert ab (DE-Intervall 5 min) |
| 3 | **AT-Skalierung:** derselbe Versatz mit `intervalMin = 15` ergibt **exakt ein Drittel** der DE-Geschwindigkeit |
| 4 | **Schwelle:** ein Feld aus reinem Rauschen mit Maximum < 0,5 mm/h ⇒ **0 Features** |
| 5 | **Glättung:** die Varianz der Peilung über 5 aufeinanderfolgende verrauschte Paare ist mit EMA kleiner als ohne |
| 6 | **Dezimierung:** die Feature-Zahl ist über die vier Zoomklassen streng monoton fallend |
| 7 | **Obergrenze:** ein flächendeckend nasses Feld bei z = 12 liefert ≤ 1 200 Features und meldet die Zahl der ausgelassenen |
| 8 | `blendU8(a,b,0) === a`, `blendU8(a,b,1) === b`, und für jedes `f` gilt `min(a,b) ≤ out ≤ max(a,b)` elementweise (**Konvexität — kein Überschwingen**) |
| 9 | Nordrichtung: ein rein nach Norden wandernder Blob ergibt Peilung ≈ 0° (Vorzeichenfalle aus §10.3 als Testfall) |

### 14.4 `verify:composite-equivalence`
`scripts/verify-composite-equivalence.mjs` → `npm run verify:composite-equivalence`.
**In L5/L6 wird `precipComposite.ts` nicht geändert** (§3.7) — der Verifier wird trotzdem hier
gebaut, weil er die Gate-Bedingung für L8 ist und weil ein Sicherheitsnetz vor der Änderung mehr
wert ist als danach.

| # | Assertion |
|---|---|
| 1 | Für synthetische `{rv, inca, rzc, d2}` (deterministische Pseudo-Zufallsgitter aus festem Seed) und `h ∈ {0, 0.4, 0.499999, 0.5, 1, 2, 2+1e-7, 2.5, 3, 3+1e-7, 3.5}` ist die Ausgabe **byte-identisch** zur Referenz (`Buffer.compare(...) === 0`) |
| 2 | Die Grenz-Inklusivität wird einzeln geprüft: DE bei h = 2 gefüllt, bei 2,5 nicht · AT bei 3 gefüllt · **CH bei 0,5 leer** (strikt) |
| 3 | Fehlt eine Quelle, füllt `d2` genau die Zellen, die vorher leer blieben — und keine anderen |
| 4 | Der Verifier kann fehlschlagen: eine absichtlich auf `<` geänderte DE-Grenze wird erkannt (Red-Test) |

### 14.5 `verify:frame-budget`
`scripts/verify-frame-budget.mjs` → `npm run verify:frame-budget`.

| # | Assertion |
|---|---|
| 1 | Tier-Abbildung: die fünf Kombinationen aus §6.2 liefern 192/96/96/64/32 MB |
| 2 | LRU: das am längsten nicht berührte Element geht zuerst |
| 3 | **Mindestkontingent:** ±2 Schritte je aktivem Layer werden nie verdrängt, auch nicht unter Volllast |
| 4 | Verdrängungsreihenfolge §6.2 wird eingehalten (Quellgitter vor Komposit, inaktiv vor aktiv) |
| 5 | **Scrub-Modus:** bei `setScrubbing(true)` findet keine Eviction statt und das Budget darf bis 120 % steigen; danach räumt genau ein Durchlauf auf |
| 6 | `release(layer)` gibt alles frei und verletzt kein Kontingent der übrigen |

### 14.6 `verify:mapstate`
Spezifikation in §5.3.

### 14.7 Bestehende Verifier, die grün bleiben müssen

`npm run typecheck` · `verify:precip-source` (**mit unveränderter Prüfnamen-Liste**, §3.6) ·
`verify:governor` · `verify:datenalter` · `verify:layer-transport` · `verify:wind-transport`.

### 14.8 UI-Protokolle (Chrome DevTools MCP)

Neu in `tests.md`: **V-TIMELINE** und **V-ZUGLINIEN** (Desktop 1440 × 900 und iPhone 12 Pro
390 × 844 DPR 3). ⚠️ Die FPS-Aussage aus GL6 ist per MCP **nicht** belastbar (die Emulation drosselt
rAF) — sie braucht ein Real-Device (`CLAUDE.md`, `agents.md` §7). Ohne Gerät wird der Punkt als
**offen** ausgewiesen, nicht als bestanden.

## 15. Byte-Identitäts- und Erhalt-Kontrakte (vollständige Liste)

| Berührung | Kontrakt | Nachweisender Verifier |
|---|---|---|
| `src/nowcast/precipSource.ts` | **wird nicht geändert** | `verify:precip-source`, Prüfnamen-Liste vorher/nachher identisch (22 Checks) |
| `src/scalar/precipComposite.ts` | in L5/L6 **nicht geändert**; falls doch: Menge `{rv,inca,rzc,d2}` byte-identisch inkl. DE 2 h / AT 3 h inklusiv und **CH strikt < 0,5** | `verify:composite-equivalence` |
| `src/mapState.ts` | Bits 0–11 unverändert; bestehende Hashes dekodieren identisch | `verify:mapstate` (Assertions 3 + 5) |
| `src/wind/*` | **nicht angefasst** (Shader/Governor) | `verify:governor` |
| `src/scalar/RainLayer.ts` | Shader unverändert; nur `setFrame`/`setColorRamp` werden aufgerufen | Pixel-Diff im Gate |
| `src/scalar/ScalarLayer.ts` | nicht angefasst | Pixel-Diff |
| `src/fusion/*` | nicht angefasst | — |
| 16 bestehende Layer | Sichtbarkeit, Beschriftung, Z-Position unverändert | Golden-Baseline aus L0 + Pixel-Diff |
| `src/radar/*` (Regenradar-Feature) | Verhalten unverändert; `radarFrames.ts` bekommt nur `DE_PAST_SEED_FRAMES 9 → 12` und die Laufzeit-Korrektur (§2.3) | `verify:radar` (neu, bindet `src/radar/_verify.ts` an npm — behebt zugleich V-143) |
| `RV_TAR_CACHE_MAX = 14` | darf nicht sinken (§9.2) | Kommentar-Kontrakt + Assertion in `verify:radar` |

## 16. STOPP & FRAGEN (an Jan, gesammelt)

| # | Punkt | Warum es Jans Entscheidung ist |
|---|---|---|
| S-1 | **Shader-Crossfade** (zwei Texturen + `mix` im `RainLayer`) wäre optisch und energetisch besser als der CPU-Blend | WebGL-/Shader-Pipeline-Zone (`CLAUDE.md`). L6 baut ohne — die Frage ist, ob es später kommen soll |
| S-2 | **GPU-Streamlines** für die Zuglinien (zweiter `WindLayer`) | dieselbe Zone. L6 baut GeoJSON-Pfeile |
| S-3 | **KONRAD3D-Polling** (~7,2 MB/h bei aktivem Layer) über den bestehenden `/_dwd_opendata`-Rewrite | Transport-/Edge-Zone. Kein Durable Cache nötig, aber Lastfrage |
| S-4 | **Warm-Cron für RV-Rückblick**? Zwölf zusätzliche Tars je Kaltstart | Warm-Cron-/Budget-Zone; hängt an A10/V-80 |
| S-5 | **`DE_PAST_SEED_FRAMES` 9 → 12** (45 → 60 min) folgt O-10 | O-10 ist eine Vorlage, keine Entscheidung |
| S-6 | Der **Zeitversatz-Fix für AT** (§2.3) verändert sichtbar, was die Karte für Österreich zeigt | Es ist eine Korrektur, aber eine wahrnehmbare Verhaltensänderung |

## 17. Offene Fragen, die diese Session **nicht** entscheidet

Als `O-`-Vorlagen in `decisions.md` eingetragen: **O-15** (Rückblick auch für `nowcast`?),
**O-16** (spätere Zusammenführung `precipSource` → `layerTime`), **O-17** (Warm-Cron für den
RV-Rückblick), **O-18** (E3 in L6 oder L11?), **O-19** (Shader-Crossfade freigeben?).
Neue Quellen-Frage: **F-13** (Klassen-Kodierung von `composite/hymecng`).

## 18. Was diese Spezifikation bewusst NICHT tut

- **D-14 wird nicht revidiert.** Kein Modellersatz jenseits des Radarhorizonts, in keinem Modus.
- **Kein Layer wird entfernt, versteckt oder vereinfacht** — auch nicht auf Mobil.
- **Keine Shader-Zeile, keine Fusions-Zeile, keine neue Laufzeit-Abhängigkeit.**
- **Kein Edge-Function-, Cron- oder Manifest-Eingriff.**
- **Keine geratene Semantik:** `composite/hg` und `composite/pg` bleiben draußen; die
  `hymecng`-Klassen werden erst benutzt, wenn ihre Kodierung belegt ist (F-13).
- **Keine Warnsprache** in E2 oder E3 — amtliche Warnungen kommen ausschließlich aus L3/L4.
