# Konzept: Modul Brandflächenkartierung (BA)

**Kontext:** DACH-Waldbrand-Dashboard · MapLibre GL JS · statischer Objektspeicher · kein Backend · Verarbeitung in GitHub Actions
**Voraussetzung:** FIRMS-Ingest und Hotspot-Clustering bestehen bereits
**Stand:** August 2026

---

## 1. Zielsetzung und Abgrenzung

### Was das Modul tut

Es nimmt einen fertigen Hotspot-Cluster entgegen und erzeugt daraus ein Brandflächen-Polygon aus Sentinel-2-Daten, inklusive Severity-Klassen, Landbedeckungs-Aufschlüsselung und Unsicherheitsangaben. Ergebnis sind versionierte GeoJSON-Objekte im Objektspeicher, die wöchentlich zu PMTiles gekachelt werden.

### Was es nicht tut

- Keine Feuerdetektion — das ist das Vorgänger-Modul
- Keine Vollerhebung von DACH-Bränden: **kein Hotspot → kein Polygon.** Das Modul erbt die Detektionslücke von VIIRS/MODIS vollständig
- Keine Echtzeit-Fläche. Median 3–5 Tage bis zum ersten belastbaren Polygon

Diese Abgrenzung gehört in die öffentliche Methodikbeschreibung. Sonst wird das Produkt mit der BLE-Waldbrandstatistik verglichen und als lückenhaft gelesen.

### Der Sonderfall aktiver Brände

Bei einem noch brennenden Feuer gibt es keine finale Brandfläche. Jedes Polygon ist dann „verbrannt bis Zeitpunkt X". Das Modul unterscheidet:

| Zustand | Bedingung | Verhalten |
|---|---|---|
| `fire_active` | neue Hotspots in den letzten 24 h | kartieren mit Zeitstempel, AOI kann wachsen, weiter pollen |
| `fire_out` | 24 h ohne neue Hotspots | `t_end` einfrieren, regulär kartieren |

Für DACH ist `fire_active` der seltene Fall (die meisten Brände sind binnen Stunden aus), aber es ist der Fall der Großereignisse — also genau der, den das Dashboard prominent zeigt.

**Wichtiger technischer Punkt:** Aktive Feuerpixel sind keine gültigen dNBR-Pixel. Flammenfront und Rauch verfälschen die Reflektanz. Sie werden über AFD-S2 identifiziert und als `burning` markiert, nicht als `burned` — in der nächsten Revision werden sie regulär mitkartiert.

---

## 2. Schnittstelle zum Cluster-Modul

### Eingang

Das Cluster-Modul liefert pro Ereignis:

```json
{
  "event_id": "de-2026-0817-001",
  "source": "firms",
  "seeds": [
    { "lat": 51.4231, "lon": 13.2807,
      "scan": 0.42, "track": 0.38,
      "sat": "VIIRS_NOAA20",
      "acq": "2026-08-15T12:41:00Z",
      "frp": 8.4, "confidence": "nominal" }
  ],
  "t_start": "2026-08-15T12:41:00Z",
  "t_end":   "2026-08-16T01:12:00Z",
  "n_hotspots": 3,
  "frp_sum_mw": 21.7
}
```

**Pflichtfelder:** `event_id`, `seeds[].lat/lon/scan/track/sat`, `t_start`, `t_end`.
`scan` und `track` sind nicht optional — ohne sie kann die reale Pixelgrundfläche und damit der Geolokationspuffer nicht bestimmt werden.

Das Feld `source` von Anfang an mitführen, auch wenn nur `firms` darin steht. Spätere Seed-Quellen (AFD-S2, selbst gerechnetes Landsat-LFTA, behördliche Meldungen) schreiben in dieselbe Watchlist; die Pipeline fragt nur nach Koordinate und Zeitfenster.

### Ausgang

```
events/{event_id}/rev{n}.geojson     # Polygon + Attribute
events/{event_id}/latest.json        # Zeiger auf aktuelle Revision
watchlist/{event_id}.json            # Verarbeitungsstatus
```

---

## 3. Datenmodell

### Watchlist-Eintrag

```json
{
  "event_id": "de-2026-0817-001",
  "status": "awaiting_post",
  "fire_state": "fire_out",
  "rev": 0,
  "aoi_utm": { "zone": 33, "bounds": [ ... ] },
  "seeds": [ ... ],
  "t_start": "...", "t_end": "...",
  "pre_scene": {
    "id": "S2C_MSIL2A_...", "platform": "S2C",
    "datetime": "...", "quality": "nominal"
  },
  "tried_scenes": ["S2B_MSIL2A_...", "..."],
  "attempts": 4,
  "first_seen": "...", "last_update": "..."
}
```

`tried_scenes` verhindert, dass eine bereits verworfene Szene bei jedem Lauf erneut geladen wird. Wächst monoton, deshalb nach `mapped` auf die letzten 20 Einträge kürzen.

### Statusautomat

```
estimated ──[Szene, sep 1.0–1.5]──> provisional ──[klare Szene, sep ≥1.5]──> mapped
    │                                     │                                     │
    │                                     └─────────────┬───────────────────────┘
    │                                                   │
    └──[45 d ohne Szene]──> timeout          [T+30 d]──> final
                                                   
   [neue Hotspots im AOI] ──> AOI erweitern, zurück auf provisional
```

| Status | Bedeutung | Geometrie |
|---|---|---|
| `estimated` | nur Hotspots, keine Kartierung | `detection_envelope` |
| `provisional` | teilkartiert oder schwaches Signal | Polygon, unvollständig |
| `mapped` | vollständig kartiert | Polygon |
| `final` | konsolidiert nach 30 Tagen | Polygon + Severity |
| `timeout` | 45 Tage ohne brauchbare Szene | `detection_envelope` |

### Revisionen

Jede erfolgreiche Kartierung schreibt eine neue Revision. Alte werden nie überschrieben. Grund: bei einer Änderung von `method_version` muss nachvollziehbar bleiben, welches Polygon mit welchem Stand entstand.

---

## 4. Modulstruktur

```
src/ba/
  models.py       Event, Seed, Revision, Scene (dataclasses)
  aoi.py          AOI-Konstruktion aus Seeds, UTM-Zonenwahl, Erweiterung
  stac.py         Szenensuche, Asset-Auflösung, Kachelgrenzen-Handling
  cloud.py        SCL/CLDPRB → Gültigkeitsmaske, valid_fraction
  raster.py       COG windowed read, Offset-Korrektur, Band-Stacks
  indices.py      NBR, BAIS2, RBR, NDVI
  afd.py          AFD-S2 Aktivfeuer-Erkennung
  segment.py      Otsu, Separabilität, Seed-Constraint, Cleanup
  refine.py       10-m-Randverfeinerung
  vectorize.py    Polygonisierung, Flächen- und Unsicherheitsattribute
  enrich.py       WorldCover, HRL Forest Type, VG250
  store.py        Objektspeicher-I/O, Watchlist, Revisionen
  pipeline.py     Orchestrierung
cli.py            Einstiegspunkte für die Workflows
```

Die Trennung von `segment.py` und `refine.py` ist bewusst: Die Randverfeinerung ist optional und kommt in Phase 5. Die Pipeline muss ohne sie lauffähig sein.

---

## 5. Verarbeitungskette

### 5.1 AOI aufspannen (`aoi.py`)

Pro Seed ein Rechteck `scan × track` (km) in UTM, Union bilden. Darauf drei Puffer:

| Zweck | VIIRS | MODIS | AFD-S2-Seed |
|---|---|---|---|
| Geolokation | 375 m | 1000 m | 40 m |
| Ausbreitung nach `t_end` | 500 m | 500 m | 500 m |
| Otsu-Kontext | 1000 m | 1000 m | 1000 m |

**Minimum 3 × 3 km, Maximum 15 × 15 km.**

Der Otsu-Kontextpuffer ist der, der gern vergessen wird. Ohne ausreichend unverbrannte Referenzpixel im Fenster ist die dNBR-Verteilung unimodal und die Schwelle wertlos.

Über 15 km: AOI splitten und als getrennte Sub-Events verarbeiten. Sonst verfälschen andere Störungen im Fenster (Kahlschlag, Ernte) das Histogramm.

UTM-Zone aus dem Zentroid: DACH ist 32N westlich 12°E, 33N östlich. Ab hier alles in UTM — Flächen nie in WGS84 rechnen.

### 5.2 Szenensuche (`stac.py`)

```python
cat.search(
    collections=["sentinel-2-c1-l2a"],
    intersects=aoi_wgs84,
    datetime=f"{t_end + 12h}/{now}",
)
```

**Nicht nach `eo:cloud_cover` filtern.** Der Wert gilt für die 110-km-Kachel; ein Tile mit 85 % Bewölkung kann über einem 3-km-AOI vollständig klar sein. Höchstens `< 95` als Grobfilter. Das ist der folgenreichste Einzelfehler in der ganzen Kette — er verwirft rund die Hälfte der brauchbaren Szenen unbesehen.

Asset-Keys einmal per `items[0].assets.keys()` ausgeben und fest verdrahten, nicht raten. Earth Search benennt sie semantisch:

```python
BANDS_20M = {"rededge2":"B06", "rededge3":"B07", "nir08":"B8A",
             "swir16":"B11", "swir22":"B12", "scl":"SCL"}
BANDS_10M = {"red":"B04", "nir":"B08"}
```

`nir` ist B08 (10 m, breit), `nir08` ist B8A (20 m, schmal). NBR ist auf B8A definiert. Eine Verwechslung läuft fehlerfrei durch und liefert plausible, aber systematisch falsche Werte.

Liegt das AOI auf einer MGRS-Grenze, kommen zwei Items pro Termin zurück. Dann aus beiden lesen und mosaikieren, **bevor** gerechnet wird. In DACH kommt das häufiger vor als erwartet.

### 5.3 Wolkencheck (`cloud.py`)

Pro Kandidatenszene **nur SCL** laden, windowed. Bei 3 × 3 km sind das 150 × 150 px — Millisekunden.

```python
INVALID = {0, 1, 2, 3, 8, 9, 10, 11}
mask  = binary_dilation(np.isin(scl, list(INVALID)), iterations=3)   # 60 m
mask |= (cldprb > 30)
valid_fraction = 1.0 - mask.mean()
```

Der Dilatationspuffer ist notwendig, weil SCL an Wolkenrändern unscharf ist. `MSK_CLDPRB > 30` fängt dünne Bewölkung, die die harte SCL-Klasse verpasst.

Zwei Schwellen, getrennt geprüft:

| Bereich | Mindestwert |
|---|---|
| Kernzone (Union der Seed-Rechtecke) | 0,50 |
| Gesamt-AOI | 0,40 |

| Ergebnis | Aktion |
|---|---|
| beide erfüllt | verarbeiten |
| nur Kernzone | verarbeiten, Ergebnis `provisional` |
| keins | skippen, `tried_scenes` ergänzen |

So werden 20 Kandidatenszenen für den Ladeaufwand von einer geprüft. Dieser Schritt entscheidet darüber, ob das Modul in GitHub Actions bezahlbar läuft.

### 5.4 Prä-Szene wählen (`stac.py`)

Rückwärts ab `t_start`:

1. `valid_fraction ≥ 0,90` über AOI
2. zeitlich nächste vor `t_start`
3. DOY-Differenz zur Post-Szene **< 45 Tage** (Phänologie bei Laub und Grünland)

Fallback-Kaskade:
- Fenster auf 90 d, Schwelle auf 0,70
- Vorjahresszene ± 15 DOY → `pre_scene.quality: "prior_year"`

Die letzte Stufe ist deutlich schlechter, weil Bestandsänderungen zwischen den Jahren direkt in dNBR eingehen. Im Attribut kennzeichnen.

**Prä-Szene einmal wählen und einfrieren.** Bei Revisionen dieselbe behalten — sonst springen Flächen zwischen Revisionen ohne fachlichen Grund, und niemand kann die Änderung interpretieren.

### 5.5 Bänder laden (`raster.py`)

`B04, B06, B07, B08, B8A, B11, B12, SCL` — beide Termine, windowed über COG.

```python
arr = src.read(1, window=win).astype("float32")
arr = (arr + boa_add_offset) / quantification_value
arr[arr <= 0] = np.nan
```

**Cast vor der Rechnung.** Die Daten sind UInt16; `(B8A - B12)` auf UInt16 läuft bei negativen Ergebnissen über und liefert Werte um 65000 statt negativer. Das Resultat sieht stellenweise absurd aus, aber nicht offensichtlich kaputt.

`BOA_ADD_OFFSET` und `QUANTIFICATION_VALUE` aus den Item-Metadaten lesen, nicht hardcoden. Ab Processing Baseline 04.00 ist der Offset −1000, davor 0. Ob der jeweilige STAC-Katalog ihn bereits angewandt hat, muss einmal empirisch verifiziert werden — sind die Reflektanzwerte plausibel in 0…1 oder systematisch um 0,1 verschoben?

GDAL-Umgebung setzen, sonst dominiert Verzeichnis-Listing die Laufzeit:

```python
GDAL_DISABLE_READDIR_ON_OPEN = "EMPTY_DIR"
CPL_VSIL_CURL_ALLOWED_EXTENSIONS = ".tif"
GDAL_HTTP_MULTIPLEX = "YES"
```

Bänder parallel über ThreadPool lesen: 8 Bänder × 2 Termine sind 16 Öffnungsvorgänge mit je 100–300 ms Latenz — mehr als der eigentliche Download.

Zwei getrennte Stacks halten: 20 m für die Klassifikation, 10 m ausschließlich für die Randverfeinerung. Nicht auf ein gemeinsames Gitter zwingen — dabei geht entweder die 10-m-Kanteninformation verloren oder es wird 20-m-Detail erfunden, das nicht existiert.

### 5.6 AFD-S2 (`afd.py`, optional)

Multikriterien-Schwellentest auf B04/B11/B12 (Hu et al. 2021, IJAEO 101:102347). Einzelszene, kein Prä/Post-Paar nötig.

| Anwendung | Treffer bedeutet |
|---|---|
| **Post-Szene** | Ursache belegt → Separabilitätsschwelle darf auf 1,0; Feuerpixel ersetzen VIIRS-Seeds (Radius 375 m → 40 m); Pixel als `burning` markieren und aus der dNBR-Klassifikation ausnehmen |
| **Prä-Szene** | statische Wärmequelle oder SWIR-helle Fläche (PV, Dach) → Event verwerfen |

**Kein Treffer ist kein Signal.** In 90–95 % der Fälle war der Brand zur Aufnahmezeit längst aus — Sentinel-2 nimmt nur tagsüber um 10:30 auf. Ein fehlender Treffer darf nie zum Verwerfen eines Events führen.

Die Biom-Parametrisierung stammt aus Sommerdaten über 14 Regionen; mitteleuropäischer Mischwald ist darin schwach vertreten. Nachkalibrierung gegen eigene bestätigte Events einplanen.

### 5.7 Indizes (`indices.py`)

```
NBR    = (B8A − B12) / (B8A + B12)
dNBR   = NBR_pre − NBR_post
RBR    = dNBR / (NBR_pre + 1.001)
BAIS2  = (1 − sqrt(B06·B07·B8A / B04)) · ((B12 − B8A)/sqrt(B12 + B8A) + 1)
dBAIS2 = BAIS2_post − BAIS2_pre
dNDVI  = NDVI_pre − NDVI_post
```

Nur Pixel rechnen, wo **beide** Termine gültig sind. Der Rest bleibt NaN und wird später als `unmapped` ausgewiesen — nicht als unverbrannt.

Die Vorzeichenumkehr bei BAIS2 ist eine klassische Fehlerquelle: BAIS2 steigt bei Verbrennung, NBR fällt.

### 5.8 Schwelle und Qualitätsgate (`segment.py`)

```python
t = max(threshold_otsu(dnbr[valid]), 0.10)

burned   = dnbr[valid & (dnbr >  t)]
unburned = dnbr[valid & (dnbr <= t)]
sep = (burned.mean() - unburned.mean()) / (burned.std() + unburned.std())
```

| `sep` | Interpretation | Aktion |
|---|---|---|
| ≥ 1,5 | klare bimodale Trennung | `mapped` |
| 1,0 – 1,5 | schwaches Signal | `provisional` |
| < 1,0 | unimodal, kein Brand erkennbar | **abbrechen**, Szene in `tried`, nächste abwarten |

Dies ist das wichtigste Qualitätsgate des Moduls. Ohne es segmentiert Otsu bei jedem beliebigen AOI irgendetwas — auch dort, wo nichts verbrannt ist.

Der Floor bei 0,10 verhindert Rauschsegmentierung, wenn Otsu bei einer unimodalen Verteilung eine sinnlos niedrige Schwelle liefert.

### 5.9 Maske und Seed-Constraint (`segment.py`)

```python
burn = (dnbr > t) & (dbais2 > 0) & valid & ~burning
```

Der `dBAIS2`-Term ist ein billiger Konsistenzcheck: beide Indizes müssen in dieselbe Richtung zeigen. Filtert einen erheblichen Teil der Ernte- und Pflug-Fehlalarme.

```python
lbl, n = ndimage.label(burn, structure=np.ones((3, 3)))
keep = set()
for seed in seeds:
    r = SEED_RADIUS[seed.sat]        # 375 / 1000 / 40 m
    keep |= set(lbl[disk_around(seed, r)]) - {0}
burn = np.isin(lbl, list(keep))
```

Das ist der eigentliche False-Positive-Filter. Ein Kahlschlag drei Kilometer weiter hat keinen Hotspot und fällt heraus.

**Cleanup, minimal:**

```python
burn = binary_opening(burn, np.ones((3, 3)))
```

Kein Closing, kein `fill_holes`. Die Löcher sind unverbrannte Inseln und damit Nutzinformation — ein 5-ha-Umring kann intern 20–30 % unverbrannt enthalten.

Komponenten unter 5 Pixel (0,2 ha) verwerfen. Ausnahme: enthält direkt einen Seed → behalten und flaggen.

### 5.10 Randverfeinerung (`refine.py`, Phase 5)

1. 20-m-Maske nearest auf 10 m
2. Randband: Pixel innerhalb ±2 (10 m) der Kante
3. Im Randband über dNDVI aus B04/B08 entscheiden; Schwelle aus dem Mittelwert der sicher verbrannten 20-m-Pixel ableiten
4. Kern unangetastet

Halbiert den Flächenfehler bei einem 1-ha-Brand von ±60–80 % auf ±30–40 %. Bei Bränden über 20 ha vernachlässigbar — dort kann der Schritt übersprungen werden.

### 5.11 Vektorisierung (`vectorize.py`)

```python
shapes = rasterio.features.shapes(mask.astype("uint8"), mask=mask, transform=tf)
poly   = unary_union([shape(g) for g, v in shapes if v == 1])
poly   = poly.simplify(5)          # halbe Pixelgröße
```

In UTM simplifizieren, danach nach EPSG:4326 reprojizieren. Löcher erhalten.

---

## 6. Attribute

### Fläche und Unsicherheit

```python
area_gross = poly.area / 1e4                    # inkl. Löcher
area_net   = (poly.area - holes_area) / 1e4
area_min   = poly.buffer(-10).area / 1e4        # ∓1 Pixel bei 10 m
area_max   = poly.buffer(+10).area / 1e4
```

Die Spanne ist keine Kosmetik. Bei 20 m Pixelgröße bedeutet ein Pixel Randfehler:

| Reale Fläche | Fehlerspanne |
|---|---|
| 1 ha | −58 % / +83 % |
| 5 ha | −30 % / +34 % |
| 10 ha | −22 % / +23 % |
| 50 ha | −10 % / +11 % |

Bei DACH-Mediangröße unter 1 ha ist die Flächenangabe auf ±60–80 % genau, und das liegt an der Pixelgröße, nicht am Algorithmus. Ein Polygon ohne Unsicherheitsangabe suggeriert eine Präzision, die nicht existiert.

### Severity

Über RBR, Klassengrenzen als **Quantile der verbrannten Pixel** — nicht als FIREMON-Absolutwerte. Die Key-&-Benson-Schwellen sind an nordamerikanischen Nadelwäldern kalibriert und auf Kiefer/Fichte/Buche/Heide/Moor nicht direkt übertragbar.

### Anreicherung (`enrich.py`)

Reine Verschneidungen, rechnerisch trivial:

| Datensatz | Lizenz | Ergebnis |
|---|---|---|
| ESA WorldCover 10 m | CC-BY 4.0 | Wald / Heide / Grünland / Moor |
| Copernicus HRL Forest Type | Copernicus | Nadel / Laub / Misch |
| BKG VG250 | dl-de/by-2-0 | Gemeinde / Kreis / Land |

Ergebnis ist keine Einzelzahl, sondern eine Matrix Severity × Vegetationstyp in Hektar. Das ist die Aufschlüsselung, die forstliche Nutzer erwarten und die EFFIS nicht liefert.

### Provenienz

```
pre_scene_id, post_scene_id, platform_pre, platform_post,
processing_baseline_pre, processing_baseline_post,
days_since_fire, valid_fraction_core, valid_fraction_aoi,
threshold, separability, method_version, pre_scene_quality
```

`platform_pre/post` sind relevant, weil S2A/S2B/S2C leicht unterschiedliche Spektralantworten haben. Bei Grenzfällen nahe der Schwelle muss nachvollziehbar bleiben, ob ein Prä/Post-Paar über zwei verschiedene Satelliten lief.

---

## 7. Speicherlayout

```
watchlist/{event_id}.json          Verarbeitungsstatus
events/{event_id}/rev0.geojson     detection_envelope
events/{event_id}/rev1.geojson     erste Kartierung
events/{event_id}/rev2.geojson     Verfeinerung
events/{event_id}/latest.json      { "rev": 2, "status": "mapped" }
tiles/burned-areas.pmtiles         Kachelsatz (wöchentlich)
tiles/active-events.pmtiles        Hotspots + Umringe (stündlich)
```

### Anforderungen an den Speicher

| Anforderung | Grund |
|---|---|
| HTTP-`Range`-Requests | PMTiles liest gezielt Byte-Bereiche |
| CORS konfigurierbar | sonst scheitert der Range-Request im Browser |
| schreibbar aus CI | Watchlist ändert sich alle 6 Stunden |
| HTTPS | Voraussetzung für den Client |

Keine Ausführungsumgebung nötig — der Speicher liefert ausschließlich statische Bytes.

**Watchlist nicht im Repo ablegen.** Sie ändert sich bei jedem Lauf; im Git erzeugt das Commit-Rauschen und macht die History unbrauchbar. Sie gehört in den beschreibbaren Objektspeicher.

`store.py` kapselt den Zugriff hinter einer schmalen Schnittstelle (`get`, `put`, `list`, `exists`). Damit bleibt der Speicher austauschbar und ist kein Architekturmerkmal, sondern Konfiguration.

---

## 8. GitHub Actions

### `ba-poll.yml` — alle 6 Stunden

```yaml
on:
  schedule:
    - cron: "0 */6 * * *"
  workflow_dispatch:
```

1. Watchlist aus dem Objektspeicher laden
2. Events mit `status ∈ {estimated, provisional}` durchgehen
3. Pro Event: STAC-Query → Wolkencheck → ggf. Kartierung
4. Revisionen und Watchlist zurückschreiben

Sechs Stunden sind nicht übertrieben, obwohl Sentinel-2 nur alle 1–2 Tage kommt: bei einer Kette mit Median 3–5 Tagen sind 20 Stunden verschenkte Latenz spürbar.

### `ba-tile.yml` — wöchentlich

```bash
tippecanoe -z15 -Z5 \
  --no-simplification-of-shared-nodes \
  --drop-densest-as-needed \
  --extend-zooms-if-still-dropping \
  -o burned-areas.pmtiles events/*.geojson
```

Zoom 15 ist nötig — bei niedrigerem Maximalzoom verschwinden 0,2-ha-Polygone in der Vereinfachung.

### Ressourcen

| Größe | Wert |
|---|---|
| Transfer pro Event (3 × 3 km) | ~1,5 MB |
| Transfer pro Event (10 × 10 km) | ~8 MB |
| 50 Events pro Lauf | ~5 min, < 400 MB |
| Runner-Limits | 6 h Job, 14 GB Disk, 7–16 GB RAM |

Die Verarbeitung bleibt weit unter allen Grenzen. Der Engpass ist HTTP-Latenz, nicht Rechenleistung.

---

## 9. Konfiguration

```yaml
aoi:
  min_size_m: 3000
  max_size_m: 15000
  buffer_geoloc: { VIIRS: 375, MODIS: 1000, AFD_S2: 40 }
  buffer_spread: 500
  buffer_context: 1000

cloud:
  scl_invalid: [0, 1, 2, 3, 8, 9, 10, 11]
  dilation_iterations: 3
  cldprb_max: 30
  min_valid_core: 0.50
  min_valid_aoi: 0.40

pre_scene:
  window_days: 60
  min_valid: 0.90
  max_doy_diff: 45
  fallback_window_days: 90
  fallback_min_valid: 0.70

segmentation:
  dnbr_floor: 0.10
  sep_mapped: 1.5
  sep_provisional: 1.0
  min_component_px: 5

lifecycle:
  poll_hours: 6
  fire_active_hours: 24
  timeout_days: 45
  final_after_days: 30
```

Alle Schwellen konfigurierbar halten. Nach der ersten Saison werden mindestens `dnbr_floor`, `sep_*` und `min_valid_*` gegen echte DACH-Ereignisse nachjustiert.

---

## 10. Fehlerfälle

| Fall | Verhalten |
|---|---|
| Szene nicht lesbar (HTTP 5xx, Timeout) | in `tried_scenes`, nächste Szene, kein Abbruch |
| STAC nicht erreichbar | Event unverändert lassen, nächster Lauf |
| AOI auf MGRS-Grenze | beide Items lesen und mosaikieren vor der Rechnung |
| Keine Prä-Szene | Fallback-Kaskade, dann `timeout` |
| `separability < 1.0` | **kein Fehler** — regulärer Pfad, Szene verwerfen, warten |
| Kein AFD-S2-Treffer | **kein Fehler** — Normalfall |
| Neue Hotspots im AOI | AOI erweitern, `t_end` fortschreiben, zurück auf `provisional` |
| Offset-Mismatch Prä/Post | aus Metadaten korrigieren; bei Fehlen → Event überspringen und loggen |
| Polygon nach Cleanup leer | Szene verwerfen, `tried`, weiter |

Der wichtigste Punkt: `separability < 1.0` und „kein AFD-S2-Treffer" sind **erwartete Zustände**, keine Ausnahmen. Wenn sie als Fehler behandelt werden, verliert das Modul reale Events.

---

## 11. Validierung

| Prüfung | Referenz | Frequenz |
|---|---|---|
| IoU der Polygone | EFFIS Burnt Area (Events mit beidem) | fortlaufend |
| Jahres-Flächensumme | BLE-Waldbrandstatistik (Größenordnung) | jährlich |
| Commission-Rate | Landesforst-Kalamitätsflächen, gezielt in Borkenkäfer-Regionen | stichprobenartig |
| Regression | fixe Event-Fixtures mit erwarteter Fläche ± Toleranz | pro Commit |

Der IoU-Vergleich gegen EFFIS ist der einzige fortlaufende Qualitätsindikator. Er funktioniert nur für die größeren Ereignisse — für die Kleinbrände gibt es keine unabhängige Referenz. Das ist eine bekannte Lücke, keine lösbare.

Die Regressionsfixtures von Anfang an anlegen: zwei bis drei Events mit fest verdrahteten Szenen-IDs und erwarteten Flächen. Sonst wird jede Änderung an `method_version` zum Blindflug.

---

## 12. Umsetzungsphasen

| Phase | Inhalt | Ergebnis |
|---|---|---|
| **1** | Schritte 5.5–5.9 hardcodiert an einem Großbrand (Gohrischheide 2025), Szenen-IDs von Hand | dNBR und Otsu plausibel |
| **2** | Derselbe Code an einem 2–5-ha-Brand aus der Landesstatistik | trägt die Schwellenlogik? |
| **3** | Schritt 5.3 (Wolkencheck) | macht den Prototyp bezahlbar |
| **4** | Schritte 5.1–5.2, Statusautomat, `store.py`, Actions | automatisiert |
| **5** | 5.6 (AFD-S2), 5.10 (Randverfeinerung), `enrich.py` | Qualität und Aufschlüsselung |

Phase 1–2 ist ein Nachmittag. **Phase 2 ist der Lackmustest** — wenn die Schwellenlogik bei einem 2-ha-Brand nicht trägt, trägt sie bei DACH-Mediangröße erst recht nicht, und dann muss die Randverfeinerung vorgezogen werden.

Phase 3 ist der größte Einzelgewinn für die Betriebskosten. Phase 5 ist durchgehend optional — die Pipeline muss ohne sie vollständig lauffähig sein.

---

## 13. Offene Punkte

- **AFD-S2-Parametrisierung für Mitteleuropa** — die publizierten Biom-Schwellen decken temperaten Mischwald schlecht ab. Nachkalibrierung erst möglich, wenn genug bestätigte Events vorliegen.
- **Severity-Klassengrenzen für DACH-Vegetation** — es existiert keine etablierte Kalibrierung für Kiefer/Fichte/Buche/Heide/Moor. Quantilbasierter Ansatz ist ein Behelf.
- **Schwelbrände** bleiben unsichtbar. SWIR-Detektion sieht flammendes Feuer; Bodenfeuer im Streu- und Humushorizont nicht. In der Schweiz sind das rund 88 % der Brandfläche.
- **Ob der STAC-Katalog den BOA-Offset bereits anwendet** — muss einmal empirisch verifiziert und dann fixiert werden.
- **Kalibrierungsdatensatz FRP/Hotspots → Fläche**: Jedes Event, das von `estimated` nach `mapped` durchläuft, erzeugt ein gelabeltes Paar. Nach einer Saison sind 30–80 Paare zu erwarten — genug für eine DACH-spezifische Beziehung, die es in der Literatur nicht gibt. Die Stichprobe ist detektionsbedingt verzerrt (VIIRS sieht bevorzugt große, heiße Brände), das muss bei der Auswertung berücksichtigt werden.
