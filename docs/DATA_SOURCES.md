# DATA_SOURCES.md — Quellenbewertung für die 2D-Layer-Erweiterung

> **Stand: 2026-08-08** (§9.2 A2 und §9.3 korrigiert, §11 nachgezogen — Belege in
> `audit/warnungen-at-ch.md`; übrige Inhalte Stand 2026-08-05).
> Recherche- und Bewertungsdokument für die geplanten neuen 2D-Wetterlayer
> (Regenradar, Niederschlagszuglinien, Hagel, Gewitter, Blitz, Schneefall, Wetter-/Unwetterwarnungen
> und weitere DACH-Layer).
> **Status: Analyse. Keine Implementierung, keine Quellenwahl ist final** — die Empfehlungen sind
> Entscheidungsvorlagen für Jan (s. `decisions.md` §O-09…O-14).
>
> Zugehörig: `docs/LAYER_SYSTEM.md` (wie Layer gebaut werden) · `docs/MAP.md` (Renderpipeline) ·
> `docs/WEATHER.md` (fachliche Layer-Beschreibungen) · `docs/API.md` (Endpunkt-Kontrakte) ·
> `docs/2d-layer-erweiterung.md` (Integrationskonzept + Umsetzungsplan).

---

## 0. Lesehinweise und Ehrlichkeits-Konvention

Dieses Dokument folgt **D-04 (Ehrlichkeits-Prinzip)**. Deshalb gilt durchgehend:

| Marker | Bedeutung |
|---|---|
| ✅ **verifiziert** | Endpunkt/Angabe am 2026-08-05 live abgerufen oder aus einem amtlichen Primärdokument zitiert |
| ⚠️ **abgeleitet** | Plausibel aus Sekundärquelle/Analogie geschlossen, **nicht** am Original geprüft |
| ❌ **unverifiziert** | Behauptung ohne Beleg — vor der Umsetzung zwingend zu prüfen |
| 🚫 **ausgeschlossen** | Rechtlich oder technisch nicht nutzbar |

**Eine methodische Einschränkung vorab, die überall gilt:** Die Recherche lief in einer Umgebung
ohne Zugriff auf HTTP-Antwort-Header. **Alle CORS-Aussagen in diesem Dokument sind daher entweder
über einen Fremd-Prüfdienst gewonnen oder aus dem Verhalten produktiver Clients (auch aus diesem
Repo) abgeleitet.** Vor jeder Umsetzung ist CORS je Endpunkt einmal im echten Browser zu bestätigen
(ein `curl -I -H 'Origin: https://buscosun.com' <url>` genügt). Das ist Gate-relevant, weil die
CORS-Antwort darüber entscheidet, ob ein Layer ohne Edge-Proxy auskommt (Aufwand S) oder nicht
(Aufwand M + STOPP-&-FRAGEN-Zone nach `CLAUDE.md`).

> **Teil-Aufhebung der Einschränkung, 2026-08-05 (Spec-Session L5/L6):** Für **vier** Hosts liegen
> inzwischen **gemessene** Antwort-Header vor (`curl -I`/`-D` mit `Origin: https://buscosun.com`,
> 2026-08-05 ~19:45 UTC). Sie sind unten je Quelle mit ✅ **gemessen** markiert:
>
> | Host | Sonde | Ergebnis |
> |---|---|---|
> | `opendata.dwd.de` | `konrad3d/`, `mesocyclones/meso_latest.xml`, `composite/rv/DE1200_RV_LATEST.tar.bz2` | **kein `Access-Control-Allow-Origin`** ⇒ Proxy Pflicht |
> | `maps.dwd.de` | `geoserver/dwd/wms?…GetCapabilities` | `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Credentials: true` |
> | `dataset.api.hub.geosphere.at` | `GET …/grid/forecast/nowcast-v1-15min-1km/metadata` | `*`; Rate-Limit-Header bestätigt: `X-RateLimit-Limit-Hour: 240`, `X-RateLimit-Limit-Second: 5`. Getrennt gemessen: **`HEAD` auf `/v1/datasets` antwortet 405** ⇒ Sonden müssen `GET` nutzen |
> | `data.geo.admin.ch` | STAC `ogd-radar-precip` / `ogd-radar-hail` | `*`, `Cache-Control: max-age=600, public`, `ETag` |
>
> ⇒ **F-1 ist für diese vier Hosts beantwortet, F-12 vollständig.** Die übrigen Endpunkte bleiben
> Teil von Phase L0. Belege und Rohbefunde: `docs/zuglinien-radar-spec.md` §1.1.

### Bewertungsraster

Jede Quelle wird nach denselben 24 Kriterien bewertet (Vorgabe aus dem Auftrag):
Betreiber · Trägerschaft · Lizenz · Kosten · API-Key · Authentifizierung · Aktualisierungsintervall ·
zeitliche Auflösung · räumliche Auflösung · Datenformat · Projektion · Animationsfähigkeit ·
Echtzeitfähigkeit · Datenqualität · Datenvollständigkeit · Abdeckung DE/AT/CH · Stabilität ·
Langzeitverfügbarkeit · Dokumentationsqualität · Integrationsaufwand · Performance · Skalierbarkeit ·
Wartbarkeit · Gesamtbewertung.

Gesamtbewertung als Schulnote **1 (sehr gut) … 5 (mangelhaft)**, gewichtet nach den
Projektprinzipien: Amtlichkeit (D-04/D-05) > Key-Freiheit (D-01/D-06) > Langzeitstabilität >
Integrationsaufwand > Auflösung.

---

## 1. Executive Summary — die zehn Sätze, die die Architektur entscheiden

1. **Für Deutschland ist alles vorhanden und größtenteils schon erschlossen.** Der teuerste Baustein
   (RADOLAN-Binärdecoder, DE1200-Warp-Mesh, bz2-Worker) läuft bereits produktiv in
   `src/sources/radolan.ts` — sechs der neun geplanten Layer sind für DE eine Erweiterung dieses
   Pfads, kein Neubau.
2. **Die größte Einzelentdeckung: `maps.dwd.de` liefert `dwd:Blitzdichte` mit einer
   TIME-Dimension über ~13 Monate im 5-Minuten-Raster** (`2025-07-02T16:10Z/2026-08-04T21:50Z/PT5M`,
   ✅ verifiziert). Damit ist eine *animierte* Blitzaktivität für DE mit einer WMS-Rastersource
   erreichbar — der heute genutzte Layer `dwd:Accumulated_Flash_Area` ist demgegenüber eine
   Nur-Jetzt-Ansicht mit unbestätigter Zeitdimension.
3. **Der zweite große Fund: MeteoSchweiz publiziert seit 2025 POH und MESHS als offene Radarprodukte**
   (`ch.meteoschweiz.ogd-radar-hail`, BZC/MZC, 5 min, ODIM-HDF5, CC BY 4.0, ✅ verifiziert). Ein
   amtlicher **Hagelkorngrößen-Layer** ist im DACH-Consumer-Markt praktisch unbesetzt. Einschränkung:
   nur CH, und nur **1. April – 30. September** (außerhalb existieren die Dateien, enthalten aber
   keine Daten).
4. **Der Blocker V-133 (AT-Warnungen) ist gelöst.** Die `wtype`/`wlevel`-Legende steht in den
   Enum-Beschreibungen der OpenAPI-Spezifikation der GeoSphere-Warn-API
   (`https://openapi.hub.geosphere.at/warnapi/v1/openapi.json`, ✅ verifiziert):
   `1=Sturm, 2=Regen, 3=Schnee, 4=Glatteis, 5=Gewitter, 6=Hitze, 7=Kälte` und
   `1=gelb, 2=orange, 3=rot`. Zusätzlich liefert `getWarningsForCoords` **deutschen Klartext**
   (`text`, `auswirkungen`, `empfehlungen`) — es muss also gar nichts geraten werden. Damit ist
   V-24 entblockt.
5. **Für Warnungen in DE ist der WFS-Weg dem CAP-Weg deutlich überlegen.**
   `dwd:Warnungen_Gemeinden` liefert Polygone **und** Attribute in einem GeoJSON-Request, mit
   `Access-Control-Allow-Origin: *` (⚠️ über Fremdprüfdienst) — die CAP-ZIPs auf `opendata.dwd.de`
   enthalten dagegen **keine Geometrie**, nur `WARNCELLID`-Geocodes, und brauchen Proxy + Entpacken +
   XML-Parser + Geometrie-Join.
6. **Österreich hat kein offenes Radar und keine offenen Blitzdaten.** Das Austro-Control-Radar ist
   nicht offen, ALDIS ist kommerziell (Einzelabfrage 264–370 € netto). Die einzige offene
   AT-Niederschlagsfläche bleibt INCA — die buscosun bereits nutzt. **Das ist eine strukturelle
   Länder-Asymmetrie, die nach D-04 auszuweisen und nicht zu kaschieren ist.**
7. **Es gibt genau eine legale, kostenlose, key-freie Blitzquelle mit DACH-weiter Abdeckung:**
   der EUMETSAT MTG-I Lightning Imager, Layer `mtg_fd:li_afa` auf `view.eumetsat.int`
   (5 min, WMS-T, `Fees: none`, LI-L2 ist *Derived Product* ⇒ Core Data ⇒ CC BY 4.0, ✅ verifiziert).
   **Blitzortung.org ist ausgeschlossen** — die Nutzungsbedingungen verbieten kommerzielle Nutzung
   und ausdrücklich den Einsatz in Sturmwarnsystemen.
8. **OPERA/EUMETNET ist seit dem MeteoGate-/RODEO-Programm offen und key-frei** (CC BY 4.0,
   anonymer S3-Zugriff, ✅ verifiziert) und würde die harte Kante an der deutschen Grenze schließen —
   aber es gibt **kein WMS/WMTS**, nur ODIM-HDF5/CoG in Lambert-Azimutal. Das ist der teuerste
   Kandidat im ganzen Dokument.
9. **Ein zentrales technisches Risiko ist entschärft:** die ODIM-H5-Spezifikation der OPERA
   (v2.4.1, ✅ Zitat) schließt szip normativ aus („SZIP compression library is proprietary and will
   therefore not be supported in any official OPERA software"), und ein realer `gdalinfo`-Dump eines
   MeteoSchweiz-CPC zeigt `COMPRESSION=DEFLATE`. Das im Repo bereits eingesetzte `jsfive`
   (gzip/deflate + shuffle) reicht damit **sehr wahrscheinlich** aus. ⚠️ Für RZC/BZC/MZC selbst ist
   das abgeleitet, nicht gemessen — ein `h5dump -pH` je Produkt schließt die Lücke in Minuten.
10. **Eine Korrektur an einer verbreiteten Annahme:** Es gibt **kein DWD-„HG"-Hagelprodukt** im
    RADOLAN/RADVOR-Format. Der amtliche Hagelhinweis ist **Bit 13 („Hagelflag") im RE-Produkt**
    (`radvor/re/`), Gitter **900×900** — nicht DE1200. Das Verzeichnis `radvor/rq/` existiert, ist
    aber **leer**; gegen RQ darf nicht geplant werden.

---

## 2. Bestandsaufnahme — was buscosun heute schon nutzt

Grundlage für „Erweiterung statt Neubau". Alle Angaben aus dem Code verifiziert.

| Quelle | Modul | Produkt | Transport | Bewertung für die Erweiterung |
|---|---|---|---|---|
| DWD RADOLAN-RV | `sources/radolan.ts` | `composite/rv/DE1200_RV*.tar.bz2`, 25 Frames 0–120 min | `/_dwd_opendata` Netlify-Rewrite + `bz2`-Worker + Cache-API | **Tragende Säule.** Regenradar + Zuglinien bauen darauf auf |
| DWD RADOLAN (Decoder) | `sources/radolanDecode.ts` | Binärformat, Header-Parser, Flag-Bits | DOM-frei, worker-tauglich | Für RE (Hagel/Phase) direkt wiederverwendbar |
| DWD WMS Radar | `sources/dwdRadar.ts` | `dwd:RADOLAN-RY`, `dwd:Radar_rv_product_1x1km_ger` | direkt (CORS ok) | heute nur teilgenutzt; TIME-Snap auf 5-min-Raster ist gelöst |
| DWD WMS Blitze | `sources/dwdLightning.ts` | `dwd:Accumulated_Flash_Area` | direkt | zu ersetzen/ergänzen durch `dwd:Blitzdichte` (TIME!) |
| DWD WMS Satellit | `sources/dwdSatellite.ts` | 2 Meteosat-Layer, 3-h-Takt | direkt | 3 h ist für Animation zu grob — EUMETView-Kandidat |
| DWD WMS TIME | `sources/wmsTime.ts` | Per-Layer-Virtual-Service GetCapabilities | direkt | **Der fertige Baustein für jede WMS-T-Animation** |
| DWD CAP-Warnungen | `sources/dwdAlerts.ts` | via BrightSky `/alerts`, punktbezogen | direkt | liefert Text, **keine Polygone** → für einen Karten-Layer nicht ausreichend |
| GeoSphere INCA | `sources/geosphereIncaGrid.ts` | `nowcast-v1-15min-1km`, `rr`, NetCDF-4 | direkt + `jsfive` | AT-Niederschlag; erweiterbar auf weitere Parameter |
| MeteoSchweiz rzc | `sources/meteoSwissRadar.ts` | `ch.meteoschweiz.ogd-radar-precip`, ODIM-HDF5 | direkt + `jsfive` | **Das Muster für POH/MESHS ist wortwörtlich schon da** |
| ICON-D2 (diverse) | `sources/iconD2*.ts` | Precip, Snow, Thunder, LPI, Rotation | `/_dwd_grib` Edge Function | Modell-Layer; ergänzen die Messlayer, ersetzen sie nicht |

**Zwei Befunde aus der Bestandsaufnahme, die in den Umsetzungsplan gehören:**

- `src/mapState.ts` `LAYER_ORDER` enthält nur **12 der 16** existierenden `LayerKey`s — `thunder`,
  `lightningfc`, `snow` und `rotation` sind **nicht permalink-fähig**. Jeder neue Layer erbt diesen
  Defekt, wenn er nicht mit angemeldet wird (→ V-134).
- Der Sichtbarkeits-/`moveLayer`-Block existiert in `MapView.tsx` **zweimal byte-identisch**. ⚠️
  **Korrigierte Fundstelle (Zeilenvergleich 2026-08-05): `:1103-1149` und `:2813-2859`, 47 Zeilen.**
  Die früheren Angaben `:1089-1136`/`:2764-2811` bzw. `:1108-1136`/`:2818-2846` sind Stände einer
  gewachsenen Datei. Neun neue Layer würden diese Duplikation auf ~85 Zeilen ×2 aufblähen
  (→ V-135, hängt an V-38/O-04).

---

## 3. Layer 1 — Regenradar (gemessene Niederschlagsanalyse)

**Fachliche Aufgabe:** „Wo regnet es *jetzt*, wie stark" — die gemessene Analyse, ohne Modellanteil.
Abgrenzung zu Layer 2 (Bewegung/Vorhersage) und zum bestehenden `nowcast`-Layer, der Analyse und
Nowcast bereits mischt.

### 3.1 Kandidaten

#### R1 — DWD RADOLAN-RY / RV-`_000` (opendata, Binär) ✅

| Kriterium | Wert |
|---|---|
| Betreiber | Deutscher Wetterdienst |
| Trägerschaft | **staatlich** (Bundesoberbehörde, DWD-Gesetz) |
| Lizenz | **CC BY 4.0** (GeoNutzV als Rechtsgrundlage) — ✅ verbatim aus `opendata.dwd.de/climate_environment/CDC/Terms_of_use.txt` |
| Kosten | 0 € |
| API-Key | **nein** |
| Authentifizierung | keine |
| Aktualisierung | **5 min** (RY, RV); RW stündlich |
| Zeitliche Auflösung | 5 min |
| Räumliche Auflösung | **1 km** |
| Datenformat | RADOLAN-Binär (2 Byte/Zelle LE) in `.bz2`; alternativ ODIM-HDF5 |
| Projektion | polar-stereografisch, `lat_0=90 lat_ts=60 lon_0=10`, WGS84 — **kein EPSG-Code**; DWD-GeoServer führt `EPSG:1000001` |
| Animation | ja (Verzeichnis-Historie ~48 h) |
| Echtzeit | ja, Latenz ~3 min ✅ gemessen |
| Datenqualität | sehr hoch (17 Radare, Clutter-/Bright-Band-Korrektur, Aneichung bei RW) |
| Vollständigkeit | Deutschland vollständig; Randbereiche mit Strahlabschattung |
| DE / AT / CH | **DE ✅** / AT ⚠️ Randabdeckung / CH ⚠️ Randabdeckung |
| Stabilität | sehr hoch, seit >15 Jahren |
| Langzeit | sehr hoch (gesetzlicher Auftrag) |
| Doku | gut, aber PDF-lastig; Formatspec 2.6 vom 2025-12-16 ✅ |
| Integration | **niedrig** — läuft bereits (`radolan.ts`) |
| Performance | 420 KB–1,4 MB je Lauf (25 Frames im selben Tar) |
| Skalierbarkeit | gut, aber **kein CORS** ⇒ Netlify-Rewrite Pflicht ✅ (im Code als Grund dokumentiert) |
| Wartbarkeit | mittel — Header-Semantik und Eckkoordinaten sind reverse-engineert |
| **Gesamt** | **1** |

Konkrete URLs: `…/composite/rv/DE1200_RV_LATEST.tar.bz2` ✅ 200 ·
`…/radolan/ry/raa01-ry_10000-latest-dwd---bin.bz2` ✅ 200.

#### R2 — DWD GeoServer WMS `dwd:RADOLAN-RY` / `dwd:Niederschlagsradar` ✅

Dieselben Daten als fertig eingefärbte Kachel. **Vorteil:** kein Decoder, kein Proxy,
`Access-Control-Allow-Origin: *` ⚠️. **Nachteil, der ihn hier disqualifiziert:** die Farbskala kommt
vom Server — buscosun kann sie nicht auf die eigene `precipRainRamp` bringen, keine Farbenblind-
Palette anbieten, keine mm/h-Punktabfrage machen und keine Zellverfolgung rechnen. Für ein Produkt,
dessen Achse „Ehrlichkeit + eigene Aussage" ist, ist ein fremdgefärbtes PNG ein Rückschritt.
**Gesamt: 3** (als Fallback wertvoll, nicht als Primärpfad).

#### R3 — MeteoSchweiz `ch.meteoschweiz.ogd-radar-precip` (RZC/CPC) ✅

| Kriterium | Wert |
|---|---|
| Betreiber / Träger | MeteoSchweiz — **staatlich** (Bundesamt) |
| Lizenz | **CC BY 4.0**, kommerzielle Nutzung ausdrücklich erlaubt ✅ |
| Key / Auth | **nein / keine** |
| Aktualisierung | **5 min** (RZC), 10 min (CPC) |
| Räuml. Auflösung | 1 km, 710×640 Zellen ✅ (aus realem `gdalinfo`) |
| Format | **ODIM-HDF5**, `COMPRESSION=DEFLATE` ✅ (CPC gemessen; RZC ⚠️ abgeleitet) |
| Projektion | **EPSG:2056** (LV95 / `somerc`, Bessel-Ellipsoid) |
| Animation | ja — **14 Tage rollierendes Archiv im 5-min-Raster** ✅ |
| Echtzeit | ja |
| CORS | `access-control-allow-origin: *`, `GET,HEAD` ✅ verifiziert |
| Cache | Assets 2 h, 10-min-Collections 10 s; `ETag`/`If-None-Match` → 304 ✅ |
| DE / AT / CH | ❌ / ❌ / **CH ✅** |
| Integration | **niedrig** — `meteoSwissRadar.ts` macht genau das bereits |
| Dateigröße | < 1 MB |
| **Gesamt** | **1** |

Wichtig: `RZC` sättigt bei **118 mm/h** — bei Extremzellen ist der Wert eine Untergrenze, nicht der
Messwert. Das gehört nach D-04 in die Legende.

#### R4 — GeoSphere INCA `rr` (AT) ✅ — *Radar-Ersatz, nicht Radar*

| Kriterium | Wert |
|---|---|
| Betreiber / Träger | GeoSphere Austria — **staatlich** (Bundesanstalt) |
| Lizenz / Key | **CC BY 4.0** / **kein Key** ✅ |
| Aktualisierung | **15 min**, `last_forecast_reftime` ohne Verzug ✅ |
| Räuml. Auflösung | 1 km, Gitter 430×700 = 301.000 Zellen ✅ |
| Projektion | **EPSG:31287** (MGI / Austria Lambert) |
| Format | NetCDF-4 (⇒ HDF5 ⇒ `jsfive`) oder GeoJSON |
| **Harte Grenze** | **Rate-Limit 5 req/s und 240 req/h pro IP → HTTP 429** ✅ verifiziert an den Antwort-Headern |
| **Zweite harte Grenze** | Request-Größe = Parameter × Zeitschritte × Orte, **GeoJSON max. 1 Mio. Werte, NetCDF max. 10 Mio.** ✅ ⇒ Vollflächen-Animation ist **nur** als NetCDF möglich (13 × 301.000 = 3,9 Mio.) |
| DE / AT / CH | ❌ / **AT ✅** / ❌ |
| **Gesamt** | **2** — beste verfügbare AT-Quelle, aber **keine Reflektivitätsanalyse** |

**Ehrlichkeitspflicht (D-04):** INCA assimiliert Radar, ist aber eine **Analyse/Mischung**, kein
Radarkomposit. Ein AT-Layer, der aus INCA gespeist wird, darf im UI **nicht** „Radar" heißen. Der
korrekte Begriff ist „INCA-Analyse". Die bestehende Beschriftung im `nowcast`-Layer
(„AT GeoSphere INCA") ist bereits korrekt und muss so bleiben.

#### R5 — OPERA/EUMETNET CIRRUS/NIMBUS über MeteoGate ORD ✅

| Kriterium | Wert |
|---|---|
| Betreiber / Träger | EUMETNET (31 nationale Wetterdienste) — **staatlicher Verbund**; Hosting CloudFerro |
| Lizenz | **CC BY 4.0** ✅ (in der Collection-Metadata verlinkt) |
| Key / Auth | **anonym möglich**; Key hebt nur Rate-Limits |
| Produkte | CIRRUS: max. Reflektivität (dBZ), **1 km / 5 min**; NIMBUS: Regenrate + 1-h-Summe |
| Räuml. Ausdehnung | 3800 × 4400 km; Composite-Gitter **2200 × 1900** ✅ (EURADCLIM) |
| Projektion | **Lambert-Azimutal-Flächentreu (LAEA)** |
| Format | **ODIM-HDF5** (szip normativ ausgeschlossen ✅) und **Cloud-Optimized GeoTIFF** ⚠️ |
| Zugriff | `https://s3.waw3-1.cloudferro.com/openradar-24h/YYYY/MM/DD/OPERA/COMP/OPERA@<ts>@0@DBZH.h5` ✅ |
| Archiv | `openradar-24h` (24 h) + `openradar-archive` (ab 2012) |
| Push | MQTT-Broker, Port 8884, User `everyone` |
| DE / AT / CH | **✅ / ✅ / ✅** (bbox −22,6…29,8 E / 28,0…70,6 N ✅) |
| **Kein WMS/WMTS** | ⇒ Fetch + HDF5-Decode + LAEA→Mercator-Reprojektion im Client |
| Integration | **hoch** — aber strukturell identisch zum bestehenden RADOLAN-Pfad |
| Speicher | 4,18 Mio. Zellen; 4,2 MB (uint8) … 16,7 MB (float32) ⚠️ dtype unverifiziert |
| Stabilität | ODYSSEY wurde **2024-10-30 abgeschaltet**; CIRRUS/NIMBUS sind die Nachfolger seit 2024 |
| ⚠️ Rechtlicher Widerspruch | Die alten EUMETNET-Seiten verlangen weiterhin Kontaktaufnahme für nicht-Mitglieder, die ORD-API deklariert CC BY 4.0. **Vor einer Headline-Funktion schriftlich bestätigen lassen.** |
| **Gesamt** | **2** — höchster strategischer Wert, höchster Aufwand |

#### R6 — RainViewer / Zoom Earth / kommerzielle Aggregatoren 🚫

RainViewer wird laut `dwdRadar.ts` bis 2026 abgeschaltet; kommerzielle Aggregatoren verletzen die
Vorgabe „keine Freemium-/Key-Modelle". **Nicht weiterverfolgen.**

### 3.2 Vergleich und Empfehlung

| | R1 RADOLAN bin | R2 DWD WMS | R3 MeteoSchweiz | R4 INCA | R5 OPERA |
|---|---|---|---|---|---|
| Amtlich | ✅ | ✅ | ✅ | ✅ | ✅ |
| Key-frei | ✅ | ✅ | ✅ | ✅ | ✅ |
| CORS ohne Proxy | ❌ | ✅ | ✅ | ⚠️ gemischt | ❌ |
| Eigene Farbskala möglich | ✅ | ❌ | ✅ | ✅ | ✅ |
| Auflösung | 1 km | 1 km | 1 km | 1 km | 1–2 km |
| Takt | 5 min | 5 min | 5 min | 15 min | 5 min |
| Abdeckung | DE | DE | CH | AT | **DACH+EU** |
| Aufwand | **vorhanden** | S | **vorhanden** | **vorhanden** | L |
| Note | **1** | 3 | **1** | 2 | 2 |

**Empfehlung (technische Begründung):** Der Regenradar-Layer wird aus **R1 + R3 + R4** gespeist —
also aus exakt den Quellen, die `precipComposite.ts` schon zusammenführt. Der neue Layer ist damit
**kein neuer Datenpfad, sondern eine zweite Ansicht auf denselben Kompositor**: „nur gemessen"
(`h = 0`, plus Rückblick) statt „gemessen + Nowcast". Das kostet einen Frame-Puffer und eine
Zeitachse, keine neue Quelle. **R5 (OPERA) wird als eigenständiger, flag-gegateter Layer
„Europa-Radar" geplant** (Rule 2 / D-11), nicht als Ersatz für R1 — weil R1 für DE feiner,
aneichbar und bereits integriert ist, und weil OPERA die harte Grenzkante schließt, aber nicht die
deutsche Qualität übertrifft.

---

## 4. Layer 2 — Niederschlagszuglinien / Niederschlagsbewegung

**Fachliche Aufgabe:** „Wohin zieht der Regen, wann ist er bei mir?" — die Bewegung als eigene
visuelle Ebene: Zugvektoren, Zellbahnen, Zeitpfeile, animierte Verlagerung.

> **Nachverifikation 2026-08-05 (Spec-Session L5/L6).** Dieser Abschnitt wurde gegen die echten
> Bytes nachgeprüft. Zwei Aussagen der Erstfassung waren zu optimistisch und sind korrigiert:
> die Überschrift zu B1 („die Bewegung ist im Produkt enthalten") und der ❌-Vermerk zum
> KONRAD3D-Schema bei B2. Vollständige Beleglage: `docs/zuglinien-radar-spec.md` §1.
>
> **Retention, an vier Produkten gemessen und identisch: 576 Einträge im 5-Minuten-Raster =
> exakt 48 h** (RV, KONRAD3D, Mesozyklonen, RADVOR-RE; Verzeichnisspanne `2608031945`…`2608051940`).

### 4.1 Kandidaten

#### B1 — DWD RADVOR RV (`composite/rv/`) ✅ — *liefert die Frames, **nicht** die Bewegung*

25 Frames 0…+120 min in **einem** `.tar.bz2` pro 5-Minuten-Lauf, alle auf DE1200.

⚠️ **Korrektur der Erstfassung (2026-08-05 am Byte belegt):** Das Produkt enthält **kein**
Bewegungsfeld. Der entpackte Tar hat **exakt 25 Mitglieder** (`DE1200_RV2608051935_000`…`_120`),
jedes 2 640 195 B = `1100 · 1200 · 2 + 195` — die Nutzlast ist restlos das Intensitätsgitter.
Der ASCII-Header ist über alle Frames identisch bis auf `VV`:

```
RV051935100000826BY   2640195VS 5SW  P42001HPR E-02INT   5GP1200x1100VV 000MF 00000008MS103<deasb,…,deumd>
```

Kein Advektionsvektor, keine u/v-Komponente, kein Zusatzfeld. **Die Bewegung ergibt sich
ausschließlich aus der Frame-Sequenz** und muss gerechnet werden (→ B3).

| Kriterium | Wert |
|---|---|
| Aktualisierung / Latenz | 5 min / **3 min 21 s** ✅ gemessen 2026-08-05 (`Last-Modified 19:38:21Z` bei Lauf `2608051935`) |
| Horizont | **0…+120 min in 5-min-Schritten** ✅ |
| Format / Einheit | RADOLAN-Binär, `PR E-02`, `INT 5` ⇒ mm/h = Wert × 0,12 ✅ (im Code verifiziert) |
| Größe | 420 KB–1,4 MB je Lauf (gemessen 2026-08-05: **740 643 B** / 741 228 B) |
| Retention | **exakt 48 h = 576 Läufe** ✅ gemessen |
| Abdeckung | DE (DE1200: 1,46–18,73 E / 45,68–55,86 N) |
| CORS | **kein `Access-Control-Allow-Origin`** ✅ **gemessen** ⇒ `/_dwd_opendata`-Rewrite Pflicht |
| **Bewegungsfeld enthalten?** | **nein** ✅ am Byte belegt |
| **Gesamt** | **1** (als Frame-Quelle) |

**Wichtiger Optimierungsbefund:** `DE1200_RV_LATEST.tar.bz2` existiert ✅. `listRvRuns()` scrapt heute
das Verzeichnis-HTML, um den jüngsten Lauf zu finden. Für den „nur jetzt"-Pfad ist der
LATEST-Alias ein Roundtrip weniger. **Aber:** der Alias ist nicht pro Lauf cache-key-fähig, während
der `RV_TAR_CACHE` genau darauf beruht. Der Verzeichnis-Scrape bleibt für
`fetchRvAnalysisSequence()` zwingend (→ V-136 beschreibt den Kompromiss).

#### B2 — DWD KONRAD3D + Mesozyklonen ✅ — *objektbasierte Zellverfolgung, Schema gelesen*

**Der frühere ❌-Vermerk „Schema nicht gelesen" ist aufgehoben.** Am 2026-08-05 wurde
`KONRAD3D_20260805T193500.xml` (612 381 B) heruntergeladen und vollständig ausgewertet.
**F-3 ist geschlossen.**

| Kriterium | Wert |
|---|---|
| Pfad | `opendata.dwd.de/weather/radar/konrad3d/KONRAD3D_<YYYYMMDD>T<HHMMSS>.xml` ✅ live |
| **Kein `latest`-Alias** | ✅ geprüft — Verzeichnis-Scrape ist Pflicht (Mesozyklonen haben einen, KONRAD3D nicht) |
| Aktualisierung / Latenz | **5 min** / **4 min 53 s** ✅ gemessen |
| Größe | 612 KB in der Probe (~0,6 MB/5 min ⇒ ~7,2 MB/h bei Dauer-Polling) |
| Retention | **48 h = 576 Dateien** ✅ |
| CORS | **keiner** ✅ gemessen ⇒ Proxy Pflicht |
| Format | XML, `data_model_version="1.7"`, Run `konrad3d_1.8`, `POLARA_konrad3d_1.8.005` ✅ |
| Gitter | `DE4800_WGS84`, polar-stereografisch, **250 m**, 4800 × 4400; `projected_area`-Ecken **zeichengleich mit `DE1200_CORNERS`** ⇒ **alle Koordinaten liegen bereits in WGS84-Grad vor, keine Reprojektion nötig** ✅ |
| Inhalt der Probe | **36** `<feature type="3D_reflectivity_feature">`, je **ein** Umriss-Polygon und **12** Prognose-Schwerpunkte (+5…+60 min) |
| **Zell-ID** | `@identifier` / `metadata/identifier` ✅ |
| **Schwerpunkt** | `geometry/centroid_3d/geodetic_coordinate/{latitude,longitude,height_msl}` ✅ |
| **Umriss** | `geometry/polygons_projected/geodetic_coordinates/polygon/{latitudes,longitudes}` ✅ |
| **Zuggeschwindigkeit** | `tracking/cell_speed` (km/h) ✅ — Spanne in der Probe 8,9…67,4 |
| **Zugrichtung** | ⚠️ **kein eigenes Feld** — aus `centroid_3d` → erstem `centroid_forecast` zu berechnen |
| **Prognosepositionen** | `forecast/centroid_forecasts/centroid_forecast[@forecast_time]` ✅ 12 Stück, 5-min-Raster |
| **Amtlicher Unsicherheits-Trichter** | `…/uncertainty_ellipse/{major_axis,minor_axis,angle}` je Stützstelle, monoton wachsend (Beispielzelle 0,77 → 23,99 km) ✅ — **ersetzt jede eigene Aufweitungsformel** |
| **Hagel / Böen / Starkregen** | `intensity/{hail_flag, gust_flag, heavy_rain_flag}`, `maximum_estimated_wind_gust` (km/h), `heavy_rain_potential` (mm) ✅ |
| VIL / VII / Echotop | `intensity/{cell_based_VIL,cell_based_VII}`, `geometry/echo_top_msl`, `intensity/echo_top_threshold/echo_top[@threshold]` (30…65 dBZ) ✅ |
| Blitz / Mesozyklone | `lightning/lightning_rate`, `mesocyclone/mesocyclone_severity_index` ✅ |
| **Sentinel** | **`-1000000000`** (alle Nachkommastellen) und **`not-a-date-time`** = „nicht verfügbar" ✅ — jede frisch erkannte Zelle hat leere Trends. Wer das nicht filtert, zeichnet Trichter mit −1 Mrd. Metern |
| Integration | mittel — **DOM-freier** Pull-Parser über ~20 Pfade (D-12), kein `DOMParser` |
| **Gesamt** | **1** — die amtliche Quelle für Zellbahnen; ersetzt die Eigenheuristik |

`docs/high-end-radar-feature-catalogue.md` §7 („Gewitterzelle erreicht dich in ~22 min") ist damit
**ohne eigene Heuristik** erreichbar — inklusive eines Pfadkegels, dessen Aufweitung amtlich
geliefert wird statt geschätzt zu werden.

**Mesozyklonen — separat bewertet, Ergebnis negativ für die Bewegung.**
`meso_latest.xml` **existiert** als Alias (2026-08-05: 9 149 B um 19:39, 6 957 B um 19:44; Takt
5 min, Retention 48 h). Struktur: `<nowcast-data>` → `<radar-stations>` + N × `<event ID>` mit
`location/area/ellipse/moving-point` (lat/lon, `major_axis`, `minor_axis`, `orientation`) und
`nowcast-parameters` (Scherung, Momentum, Durchmesser, Top/Base, Echotop, VIL, mean/max dBZ,
Rotationsgeschwindigkeiten, `meso_intensity`).
⚠️ **`<polar_motion>` enthält ausschließlich `<speed units="km/h">`, und der Wert ist in allen vier
beobachteten Ereignissen `0.0`; ein Richtungselement gibt es nicht.** Das Produkt ist eine
**Detektion**, kein Track. **Für Zuglinien unbrauchbar**; unter der Konservativ-Regel (D-04/D-19)
außerdem **kein eigener Layer**, sondern höchstens ein Attribut der zugehörigen KONRAD3D-Zelle
(`mesocyclone/number_assigned_mesocyclones`). Nie „Tornado"-Sprache.

#### B3 — Eigenberechnung aus RV-Frames (Optical Flow) ✅ — *im Repo vorhanden, und der einzige Feldweg*

`src/ml/opticalFlowNowcast.ts` (Horn-Schunck, `estimateFlowHS` `:20-58`, `advect` `:75-85`, pur und
headless), `src/ml/flowEnsemble.ts` (15-Member-PoP), `src/radar/cellTracking.ts`,
`src/radar/rotationPotential.ts`. Der `flownowcast`- und der `poprob`-Layer laufen bereits produktiv.
Ein Zuglinien-Layer wäre die **Visualisierung des ohnehin berechneten Bewegungsfelds** — kein neuer
Datenpfad, keine neue Quelle.

⚠️ **Pflicht-Einschränkung:** Der Fluss darf **nur aus gemessenen Analysen** (`_000`-Frames
aufeinanderfolgender Läufe) geschätzt werden, **nie** aus den RV-Vorhersageframes `_005`…`_120` —
diese enthalten bereits die Advektion des DWD-Nowcasts, eine Flussschätzung darauf misst die eigene
Extrapolation und ist zirkulär.
Note: **1** (Aufwand S–M, Quelle = R1). **Da B1 kein Feld liefert (s. o.), ist B3 nicht die
Alternative, sondern der Primärpfad; einen Feld-Fallback gibt es nicht.**

#### B4 — GeoSphere INCA-Nowcast (AT) ✅ — *variable Frame-Zahl, keine Analyse*

⚠️ **Korrektur der Erstfassung.** „13 Zeitschritte × 15 min" ist die **Metadaten-Angabe**
(`forecast_length: 13` unter `…/nowcast-v1-15min-1km/metadata`, ✅ 2026-08-05), **nicht** das, was
ankommt. Gemessen am realen NetCDF (Abruf 19:47 UTC, Referenzzeit 19:15):

| Befund | Wert ✅ gemessen |
|---|---|
| `rr`-Form | `(11, 431, 701)` int16, `scale_factor 0.01`, `_FillValue -999` |
| `leadtime` | `[0,5 · 0,75 · … · 3,0]` h — **11 Schritte**, beginnend bei 0,5 h |
| `time` | `[0…150]` min, `units = "minutes since 2026-08-05 19:45:00"` |
| Root-Attribut | **`last_forecast_reftime = 2026-08-05 19:15:00`** |
| Verfügbare Läufe | `available_forecast_reftimes`: 6 (letzte 90 min) |
| Parameter | `dd, ff, fx, pt, rh2m, rr, t2m, td` |

**Drei Konsequenzen:**
1. **Die Frame-Zahl schrumpft mit dem Alter des Laufs** — die API liefert nur Leads, deren
   Gültigkeit noch nicht verstrichen ist. Der Code sagt „12 Frames (+0,25…+3,0 h)"
   (`geosphereIncaGrid.ts:15,25`) — das ist der Zustand bei einem frischen Lauf. Beide Zahlen sind
   Sonderfälle einer variablen Größe.
2. **INCA hat keine Analyse.** Der kleinste Lead ist ≥ 0,25 h ⇒ für AT existiert **kein gemessener
   „jetzt"-Frame**. Bewegung ist nur aus zwei aufeinanderfolgenden **Läufen** ableitbar und heißt
   dann korrekt „aus der INCA-Analyse abgeleitet", nicht „gemessen".
3. ⚠️ **Falle:** INCA liefert `dd`/`ff` (10-m-Windrichtung/-geschwindigkeit) direkt daneben.
   **Bodenwind ist nicht die Verlagerungsrichtung von Niederschlagsgebieten.** Ein Zuglinien-Layer
   aus `dd`/`ff` wäre fachlich falsch und nach D-04 unzulässig.

CORS ✅ **gemessen** (`Access-Control-Allow-Origin: *` auf der `grid/forecast`-Metadaten-Route).
⚠️ Getrennt gemessen: `HEAD` auf `/v1/datasets` antwortet **405** — Sonden müssen `GET` nutzen.
Begrenzung wie R4 (240 req/h und 5 req/s, Header-bestätigt; NetCDF-Pflicht bei Vollfläche).
Note: **2**.

#### B5 — MeteoSchweiz INCA-CH ❌/🚫

Auf `opendatadocs.meteoswiss.ch` als **„Data on request"** geführt — *nicht* als offener
Bulk-Download ✅. Für die Schweiz existiert damit **keine offene Nowcast-Verlängerung**; nur die
RZC-Analyse. Das ist eine echte, auszuweisende Lücke.
Note: **5 (nicht nutzbar)**.

#### B6 — DWD RADVOR RE (`radvor/re/`) ✅ — *Phase + Hagel, nicht Bewegung*

Gehört fachlich zu Layer 3, wird hier nur der Vollständigkeit halber genannt: ebenfalls
25 Schritte 0…+120 min, 5-min-Takt, ~21–25 KB gzip je Datei ✅ (2026-08-05 nachgemessen:
19 669–19 813 B), Retention **48 h = 576 Läufe** ✅.

#### B7 — Die übrigen `composite/`-Verzeichnisse ✅ — *Semantik jetzt aus den Dateien belegt*

Neu für diese Bewertung (2026-08-05): Für jedes Verzeichnis wurde die Datei selbst gelesen — bei
ODIM-HDF5 das `/what/quantity`-Attribut, bei RADOLAN-Binär der ASCII-Header. Nichts ist aus dem
Verzeichnisnamen geschlossen.

| Verzeichnis | Belegter Inhalt ✅ | Gitter | Gehört zu | Note |
|---|---|---|---|---|
| `wn` (`.tar`, 25 × ODIM-HDF5) | **`quantity = DBZH`** — Reflektivitäts-Nowcast, 25 Schritte | DE1200 1 km | **Experten-dBZ-Modus** (Katalog §11); für den Intensitäts-Layer **redundant zu RV** | 2 |
| `rs` (`.tar`, ODIM-HDF5) | **`quantity = ACRR`** — akkumulierter Niederschlag | DE1200 1 km | **Akkumulations-Feature** (Katalog §3); amtliche Summe statt Eigenrechnung (`src/radar/accumulation.ts`) | **1** |
| `hymecng` (`-hd5`, 39 KB) | **`quantity = CLASS`**, Dataset `NG_top_view` — Hydrometeor-Klassifikation | DE1200 1 km | **L8/L9** — der fachlich sauberste Weg zu Niederschlagsart und Hagelhinweis; **vor** RE Bit 13 zu prüfen. ⚠️ Klassen-Kodierung noch unbelegt ⇒ **F-13** | **2** |
| `vii` (`-hd5`, 74 KB) | **`quantity = VIL`** ✅ präzisiert 2026-08-06 (`gain=0,015259487586406849`, `offset=−0,015259…`, `nodata=65535`, `undetect=0`, 304 Werte in der Probe) | DE1200 1 km | Hagel-**Proxy**, kein Hagelprodukt — deshalb in Phase HA1 bewusst **nicht** als „Hagel" gebaut; eigener Indikator-Layer = **V-154** | **2** |
| `dmax` (`-hd5`, 1,34 MB) | **`quantity = DBZH`** | **DE4800 250 m** (`x_0=543571,8…` — dasselbe Gitter wie KONRAD3D) | teuer und für DACH-Zoom überauflösend; späterer Detail-Zoom | 3 |
| `hx` (`-hd5`, 721 KB) | **`quantity = DBZH`** | DE4800 250 m | wie `dmax`, kleiner | 3 |
| `pg` (BUFR, 21,6 KB) | Format **BUFR** | — | **nicht nutzbar** — kein BUFR-Decoder, und einer widerspräche der Aufwandslogik von D-06 (Nutzen durch `wn`/`rv` gedeckt) | **5** |
| `hg` (RADOLAN-bin `.bz2`, 15,3 KB) | Header `HG…BY 5280195…PR E-00INT 5GP1200x1100`; **5 280 195 = 1100·1200·4 + 195 ⇒ 4 Byte/Zelle**, Füllmuster `00 00 00 80` (LE-uint32, Bit 31) | DE1200 1 km | **Struktur belegt, physikalische Größe weiterhin NICHT.** Bleibt draußen (D-04/RK-8) — bleibt **F-8** | **4** |
| `radvor/rq` | Verzeichnis **leer** ✅ bestätigt | — | nicht gegen RQ planen | — |

**Was ausdrücklich NICHT nutzbar ist:** `composite/pg` (BUFR) und `composite/hg` (Größe
undeklariert). Alles andere ist nutzbar, gehört aber zu L8/L9/L11 bzw. zum Experten- und
Akkumulations-Feature — **nichts davon gehört in den Zuglinien-Layer**.

### 4.2 Empfehlung

**Primär B1 (Frames) + B3 (Bewegung).** Das ist keine Präferenz mehr, sondern die einzige Option
auf Feldebene: B1 enthält belegt kein Bewegungsfeld, und es gibt keine zweite gerasterte Quelle.
Ein Fallback existiert nur auf **Objekt**ebene: **B2 (KONRAD3D)** liefert je Zelle Geschwindigkeit
und eine amtliche Prognosespur — das ergänzt das Feld, ersetzt es aber nicht.

**Der Prüfauftrag zu B2 ist erledigt** (F-3 geschlossen): KONRAD3D führt Zell-ID, Umriss,
Geschwindigkeit, zwölf Prognosepositionen **mit amtlichen Unsicherheitsellipsen** sowie Hagel-,
Böen- und Starkregen-Flags. Damit ist KONRAD3D die Quelle für Zellbahnen (Stufe E3) und
`src/radar/cellTracking.ts` der benannte Fallback (D-11).

**B4** liefert AT in geringerer zeitlicher Auflösung und **ohne Analyse** — die AT-Vektoren sind aus
zwei aufeinanderfolgenden INCA-**Läufen** abzuleiten und als „aus der INCA-Analyse abgeleitet" zu
kennzeichnen. **Für CH gibt es keine Bewegungsquelle** — dort endet der Layer bei „jetzt", und das
muss die Zeitachse sichtbar machen (harter visueller Bruch, wie ihn
`high-end-radar-feature-catalogue.md` §2 zu Recht als wichtigstes Einzelfeature führt).

Vollständige Umsetzungsspezifikation: **`docs/zuglinien-radar-spec.md`**.

---

## 5. Layer 3 — Hagel

> ✅ **UMGESETZT am 2026-08-06 als Phase HA1** (`LayerKey 'hail'`, Gate **GHA1**,
> Diagnose `audit/hagel.md`, Verifier `npm run verify:hail`).
> **Drei Korrekturen an den Angaben unten, alle an der Datei gemessen:**
> **(a) MESHS trägt `unit = mm`, nicht cm** — die cm-Annahme hätte Korngrößen 10× zu groß gezeigt.
> **(b) POH ist ein Anteil 0…1, keine Prozentzahl** (Anzeige ×100).
> **(c) RE Bit 13 wurde NICHT gebaut** — s. H2, Begründung in `audit/hagel.md` §4 und **V-152**.
> Zusätzlich: die Produkte hängen an **Radarverbünden, nicht an Staatsgrenzen** — das stärkste
> POH-Signal der Verifikation lag in **Bayern** (10,07 °E/47,93 °N, 36 %).

### 5.1 Kandidaten

#### H1 — MeteoSchweiz POH + MESHS (`ch.meteoschweiz.ogd-radar-hail`) ✅ ⭐ — **in Benutzung**

| Kriterium | Wert |
|---|---|
| Betreiber / Träger | MeteoSchweiz — **staatlich** |
| Produkte | **POH** (`bzc…h5`, `quantity=POH`, **Anteil 0…1** ⚠️ korrigiert, Waldvogel-Verfahren: 45-dBZ-Echotop − Nullgradgrenze) · **MESHS** (`mzc…h5`, `quantity=MESH`, **`unit=mm`** ⚠️ korrigiert — nicht cm, Treloar-Verfahren: 50-dBZ-Echotop − Nullgradgrenze) |
| Gemessen 2026-08-05 21:40 UTC | 518 Assets/Tag (259 je Produkt = 5-min-Takt) · 24 704 B (POH) / 23 748 B (MESHS) · `gain=1`, `offset=0`, `nodata=NaN`, `undetect=0` · Gitter 710×640 à 1 km · Ecken in `/where` bereits **WGS84** ⇒ keine Reprojektion |
| Lizenz / Key | **CC BY 4.0** / **kein Key** ✅ |
| Aktualisierung | **5 min** ✅ |
| Räuml. Auflösung | 1 km |
| Format / Projektion | ODIM-HDF5 / **EPSG:2056** |
| Dateigröße | < 1 MB |
| Retention | 14 Tage rollierend ⇒ **animierbar** |
| **Saisonalität** | **nur 1. April – 30. September.** Außerhalb existieren die Dateien, enthalten aber **keine Daten** ✅ |
| DE / AT / CH | ❌ / ❌ / **CH ✅** |
| CORS | `*` ✅ |
| Integration | **niedrig** — identisches Muster wie `meteoSwissRadar.ts` |
| **Gesamt** | **1** |

**Warum das der stärkste Einzelfund des Dokuments ist:** Eine amtliche, kostenlose, 5-minütige
Hagelkorngrößen-Karte zeigt im DACH-Consumer-Markt praktisch niemand. Für die Zielgruppen aus
`docs/zielgruppen-dach.md` (Landwirtschaft, Bau, Fahrzeughalter, Veranstalter) ist das ein
Entscheidungs-Layer, kein Deko-Layer.

#### H2 — DWD RADVOR RE, Bit 13 „Hagelflag" ⚠️ — **zurückgestellt (V-152)**

> **Messung 2026-08-05 (Lauf 2608052130), die die Bewertung unten ändert:**
> Der Header lautet **`PR E-03`**, nicht `PR E-00` — damit ist die Deutung „0…1000 = Anteil
> festen Niederschlags 0…1" **belegt** statt abgeleitet (E-03 × 1000 = 1,000).
> Bit 13 (`0x1000`) existiert und verhält sich wie ein Flag: **8 von 810 000** Zellen, Wertanteil
> durchgehend 0. `0x2000` (727 544 Zellen, Wert 2500 = `0x29C4`) ist die Fehlkennung, `0x8000`
> (550 182) Clutter/außerhalb, `0x4000` kommt nicht vor.
> **Blocker ist nicht die Bedeutung, sondern der Ortsbezug:** das 900×900-Gitter ist im Repo nicht
> georeferenziert, die amtliche PDF-Spec hat keinen maschinenlesbaren Textlayer, und die Gegenprobe
> an KONRAD3D bestätigt die angenommene Verortung **nicht** (82,5 / 157,8 km Abstand).
> ⇒ Nicht gebaut. Vorbedingungen in **V-152**.

| Kriterium | Wert |
|---|---|
| Pfad | `opendata.dwd.de/weather/radar/radvor/re/RE<YYMMDDHHMM>_<vvv>.gz` ✅ |
| Spec-Definition | **„Anteil des festen Niederschlags (keine Radardaten) + Hagelflag"** ✅ verbatim, Kompositformat 2.6 |
| Flag | **„RE: Bit 13 = Hagelflag; Wert (Anteil festen Niederschlags): 0 bis 1000"** ✅ verbatim |
| Bytes/Zelle | 2 (RE steht nicht in der 1-Byte-Ausnahmeliste WW/WX/RX/EX) ✅ |
| **Gitter** | **900 × 900** ✅ — **nicht** DE1200. DE1200 gehört zu RV |
| Header | `PR E-00` (ganze Zahlen), `INT 60`, Erzeugung alle 5 min, `VV` 000…120 |
| Frames | 25 je Lauf (0…+120 min, 5-min-Schritte) ✅ |
| Größe | ~21–25 KB gzip; unkomprimiert 900×900×2 B = 1,62 MB |
| DE / AT / CH | **DE ✅** / ❌ / ❌ |
| Integration | **niedrig–mittel** — `decodeRadolanRaw` liest das Format bereits; nötig sind ein zweites Gitter (900×900 statt DE1200), gzip statt bz2 und die Bit-13-Maske |
| ⚠️ Offen | Die Umrechnung „0–1000 → Anteil 0–1" ist aus `PR E-00` + Spec-Bereich **abgeleitet**, nicht wörtlich gefordert. wradlib warnt außerdem: *„This product isn't implemented with all features, yet."* |
| **Gesamt** | **2** |

#### H3 — DWD `composite/hg/`, `composite/vii/`, `composite/dmax/` ⚠️

`HG<YYMMDDHHMM>_000.bz2` (3,5–20 KB, 5 min) ✅ existiert und antwortet mit 200. **Aber: „HG" kommt
in keiner zugänglichen DWD-Formatbeschreibung vor.** Die Auflösung „Hagel" ist eine Vermutung aus
Code, Takt und Dateigröße. Dasselbe gilt für `VII` (konventionell „Vertically Integrated Ice", ein
klassischer Hagel-Proxy) und `dmax`.

**Bewertung nach D-04: nicht verwendbar, solange die Semantik unbelegt ist.** Ein Layer, der
„Hagel" behauptet, weil ein Verzeichnis „hg" heißt, ist derselbe Fehlertyp wie die erfundenen „78 %"
aus V-18 — nur im sicherheitsrelevanten Bereich. **Gesamt: 4** (Prüfauftrag, kein Bauauftrag).

#### H4 — ICON-D2-abgeleiteter Hagel-Proxy ⚠️

Aus CAPE × Nullgradgrenze × `uh_max` ließe sich ein Hagel*potenzial* rechnen. Das Repo hat alle
Zutaten (`iconD2Cape.ts`, `snowLine.ts`, `iconD2Rotation.ts`). **Aber:** das wäre eine
buscosun-eigene Größe ohne Verifikation — D-19 („Experten-Layer konservativ") würde extrem
zurückhaltende Formulierung verlangen. **Gesamt: 3** — allenfalls als klar gekennzeichneter
Modell-Layer *neben* den Messprodukten, nie als deren Ersatz.

#### H5 — MeteoSchweiz Hagelgefährdungs-Klimatologie (WMTS) ✅

`ch.meteoschweiz.hagelgefaehrdung-korngroesse_{10,20,50,100}_jahre` auf `wmts.geo.admin.ch` ✅ —
radarbasierte Klimatologie 2002–2020, Wiederkehrperioden. **Keine Echtzeit**, aber ein fertiger
Kachel-Layer ohne jeden Decodieraufwand. Als Kontext-Layer („wie hagelgefährdet ist diese Region
grundsätzlich") interessant. **Gesamt: 2** für den Klimatologie-Zweck, **5** für Echtzeit.

### 5.2 Empfehlung — **überholt durch die Umsetzung (Phase HA1)**

Die ursprüngliche Empfehlung lautete „H1 für CH, **H2 für DE**, H5 als Kontext". **Gebaut wurde
H1 + KONRAD3D-Hagelattribute**, nicht H2:

| | gebaut | Begründung |
|---|---|---|
| Fläche | **H1** — MeteoSchweiz MESHS/POH | vollständig in der Datei belegt (Quantity, Einheit, Gain, Ecken) |
| Zellen | **KONRAD3D** `intensity/hail_flag` + `hymec/{area_hail, area_large_hail, echo_top_hail}` | Schema seit F-3 belegt, Koordinaten in WGS84, Transport aus Phase Z1 vorhanden, `area_large_hail` trennt Hagel von **Groß**hagel |
| — | ~~H2 (RE Bit 13)~~ | Georeferenz nicht belegbar → **V-152** |
| — | ~~H3 (HyMeC/VII)~~ | Klassenlegende unlesbar (**V-153**) bzw. VIL ist ein Proxy (**V-154**) |

Für **AT existiert keine eigene offene Hagelquelle** — weder GeoSphere noch ALDIS noch die
Hagelversicherung publizieren etwas Offenes. Das ist nach D-04 ausgewiesen. **Präzisierung aus der
Umsetzung:** Was in AT (und in Süddeutschland) trotzdem erscheint, ist die **Reichweite der
Nachbar-Radarverbünde** — der Schweizer Verbund deckt Vorarlberg und Teile Süddeutschlands mit ab,
der deutsche die Alpennordseite. Im **Osten** Österreichs gibt es keine Abdeckung. Der Layer
formuliert genau das, statt „CH/DE/AT" zu behaupten.

---

## 6. Layer 4 — Gewitter (konvektive Zellen)

Abzugrenzen vom bestehenden `thunder`-Layer (ICON-D2 CAPE×CIN×LPI = **Potenzial**, Modell) und vom
`lightningfc`-Layer (ICON-D2 LPI = **Prognose**). Der neue Layer soll die **beobachtete** Konvektion
zeigen.

### 6.1 Kandidaten

| # | Quelle | Träger | Lizenz | Key | Takt | Format | DE/AT/CH | Aufwand | Note |
|---|---|---|---|---|---|---|---|---|---|
| G1 | **DWD `dwd:NCEW_EU`** (NowCastELEC-Polygone um erkannte **und prognostizierte** Blitze, WarnWetter-App-Layer) | staatlich | GeoNutzV | nein | ⚠️ | WMS | DE(+EU) | S | **2** |
| G2 | **DWD KONRAD3D** (`konrad3d/*.xml`, 5 min) ✅ | staatlich | CC BY 4.0 | nein | 5 min | XML-Objekte | DE | M | **2** ❌Schema |
| G3 | **DWD Mesozyklonen** (`mesocyclones/*.xml`, 5 min) ✅ | staatlich | CC BY 4.0 | nein | 5 min | XML | DE | S | **3** (Nischensignal) |
| G4 | **EUMETSAT `msg_fes:rdt`** (Rapidly Developing Thunderstorms) ✅ | zwischenstaatlich | ⚠️ Lizenzstufe | nein | ⚠️ | WMS-T | DACH+EU | S | **2** |
| G5 | **DWD `composite/vii/`** (Vertically Integrated Ice, 5 min) | staatlich | CC BY 4.0 | nein | 5 min | ODIM-HDF5 | DE | M | **4** ❌Semantik |
| G6 | **MeteoSchweiz D4 „Convection radar"** | staatlich | CC BY 4.0 | nein | — | — | CH | — | **5** — Doku: *„Planning is pending"* ✅ |

**Zu G1 (NCEW_EU) — der wichtigste Ehrlichkeitspunkt dieses Layers:** Die Layer-Beschreibung nennt
ausdrücklich Polygone um **erkannte und vorhergesagte** Blitze in einem Layer. Nach D-04 ist eine
Vermischung von Messung und Prognose in derselben Fläche **ohne Kennzeichnung nicht zulässig** — das
ist exakt die Trennung, die buscosun bei `lightning` vs. `lightningfc` und bei `nowcast` bereits
sauber zieht. Wenn NCEW_EU keine trennbare Attributierung liefert, muss die Legende das
ausdrücklich sagen.

**Zu G4 (EUMETSAT RDT):** ⚠️ Die EUMETSAT-Datenpolitik (Fassung 27.06.2024, Art. 4) unterscheidet
**Core Data** (u. a. alle abgeleiteten SEVIRI/FCI/IRS/LI-Produkte ⇒ CC BY 4.0, frei auch
kommerziell) von **Recommended Data** (Level-1 mit Latenz < 1 h ⇒ Lizenzgebühren 4.000–8.000 €/Jahr,
Weiterverbreitung der Originaldaten untersagt). RDT ist ein abgeleitetes Produkt und damit
**wahrscheinlich** Core Data — aber die EUMETView-WMS-Ausgabe deklariert nur pauschal
`Fees: none`. **STOPP & FRAGEN:** Vor einer kommerziellen Nutzung von EUMETSAT-Bildprodukten in
Echtzeit ist eine schriftliche Bestätigung von EUMETSAT einzuholen. **Für `mtg_fd:li_afa` (Blitz)
besteht dieser Zweifel nicht** — LI Level 2 ist explizit ein Derived Product.

### 6.2 Empfehlung

**Zweistufig.** Stufe 1: **G1 (NCEW_EU)** als WMS-Raster — geringster Aufwand, amtlich, sofort.
Stufe 2: **G2 (KONRAD3D)** als objektbasierter Zell-Layer, **erst nach Schema-Klärung**; er ist der
einzige Kandidat, der Zell-ID, Zugbahn und Attribute amtlich liefert und damit die
„Zelle erreicht dich in X min"-Funktion ohne Eigenheuristik ermöglicht.
G4 bleibt hinter dem EUMETSAT-Lizenz-Gate.

---

## 7. Layer 5 — Blitzaktivität

### 7.1 Kandidaten

#### L1 — DWD `dwd:Blitzdichte` (NowCastMix) ✅ ⭐ *bester DE-Layer, mit Zeitachse*

| Kriterium | Wert |
|---|---|
| Betreiber / Träger | DWD — **staatlich** |
| Endpunkt | `https://maps.dwd.de/geoserver/dwd/wms` (bzw. Per-Layer-Virtual-Service) |
| Lizenz / Key / Kosten | GeoNutzV (`Fees: none`) / **nein** / 0 € |
| Aktualisierung | **5 min**, jedes Bild enthält die Blitze der **letzten 15 min** ✅ verbatim |
| **TIME-Dimension** | **`2025-07-02T16:10:00Z / 2026-08-04T21:50:00Z / PT5M`** ✅ verifiziert — ~13 Monate im 5-min-Raster |
| Werte | 0–127, **nichtlinear** abgebildet aus 0–3000 Blitze pro Zeiteinheit und 100 km² ✅ verbatim |
| Format / Projektion | WMS-PNG; EPSG:3857/4326/25832 |
| Animation | **ja** — der einzige DACH-Blitz-Layer mit langer Zeitachse |
| DE / AT / CH | **DE ✅** / ❌ / ❌ |
| ⚠️ Herkunft | NowCastMix verarbeitet kommerzielle Bodennetz-Daten; **das abgeleitete Raster** ist offen |
| ⚠️ Achtung | Frames überlappen (5-min-Schritt, 15-min-Fenster) — aufeinanderfolgende Bilder sind **nicht unabhängig**; naives Aufsummieren zählt dreifach |
| Integration | **niedrig** — Raster-Source + `wmsTime.ts` sind vorhanden |
| **Gesamt** | **1** |

#### L2 — EUMETSAT MTG-I LI `mtg_fd:li_afa` ✅ ⭐ *einzige DACH-weite legale Quelle*

| Kriterium | Wert |
|---|---|
| Betreiber / Träger | EUMETSAT — **zwischenstaatlich** |
| Endpunkt | `https://view.eumetsat.int/geoserver/mtg_fd/wms` ✅ |
| Lizenz | **CC BY 4.0** — LI Level 2 ist *Derived Product* ⇒ Core Data (Datenpolitik Art. 4) ✅ |
| Key / Auth / Kosten | **nein / keine / 0 €**; Service deklariert `Fees: none`, `AccessConstraints: none` ✅ |
| **TIME-Dimension** | **`2025-05-30T15:00Z / <jetzt> / PT5M`** ✅ verifiziert — ~14 Monate |
| Latenz | **~5 min** ✅ gemessen |
| Räuml. Auflösung | 2 km (LI-L2-Gitter 5568×5568 auf dem FCI-Raster) |
| Projektion | deklariert nur EPSG:4326/CRS:84 — **aber `crs=EPSG:3857` liefert ein gültiges PNG** ✅ getestet ⇒ MapLibre-tauglich |
| Messgröße | **optische Gesamtblitzaktivität** (Wolke-Wolke **und** Wolke-Boden) — nicht deckungsgleich mit Bodennetz-CG-Daten |
| ⚠️ Physik | Geostationär bei 0° ⇒ **Parallaxe** bei ~50° N nicht vernachlässigbar; Überlagerung mit Radar verschiebt sich systematisch |
| DE / AT / CH | **✅ / ✅ / ✅** |
| Integration | **niedrig** (WMS-T-Raster) |
| **Gesamt** | **1** |

#### L3 — DWD `dwd:Accumulated_Flash_Area` (heute genutzt) ⚠️

Laut Abstract die **DWD-Weiterveröffentlichung desselben MTG-LI-AFA-Produkts**. Wenn das stimmt,
bringt L2 dieselben Daten frischer und mit dokumentierter Zeitdimension. ❌ TIME-Dimension nicht
bestätigt (Spatineo meldet „not indicated"). **Gesamt: 3** — heute im Einsatz, mittelfristig durch
L1 + L2 zu ersetzen bzw. zu ergänzen.

#### L4 — DMI Lightning Data API ✅ ⚠️ *überraschend, aber nur halb Deutschland*

| Kriterium | Wert |
|---|---|
| Endpunkt | `https://dmigw.govcloud.dk/v2/lightningdata/collections/observation/items?period=latest-hour` ✅ live, ohne Key |
| Format | **OGC API Features → GeoJSON** (Punkte mit `amp`, `strokes`, `sensors`, `observed`) — direkt MapLibre-tauglich |
| Latenz | **~3 min** ✅ gemessen |
| Lizenz | CC BY 4.0 |
| **Abdeckung** | ✅ Treffer in Brandenburg, Sachsen, **Hessen (8,07 E / 50,49 N)**; **0 Treffer über 7 Tage** südlich ~49–50 °N ⇒ **AT, CH und Südbayern nicht abgedeckt** |
| ⚠️ Widerspruch | DMIs eigene Nutzungsbedingungen fordern Registrierung, der Endpunkt antwortet aber ohne Key — kann jederzeit geschlossen werden |
| **Gesamt** | **3** — echte Einschlagspunkte mit Amplitude, aber Teilabdeckung. Nur mit expliziter Abdeckungsmaske („Netzabdeckung endet bei ca. 50 °N") nutzbar |

#### L5 — Blitzortung.org / lightningmaps.org 🚫 **ausgeschlossen**

Zitate aus den Nutzungsbedingungen: *„A commercial use of our data is strongly prohibited, even by
the users that send data to our servers."* · *„It is not allowed to use the data of Blitzortung.org
for storm warning systems […]"* · Rohdatenzugang ist an aktiven Stationsbetrieb gebunden und wird
entzogen, wenn die Station aufhört zu senden. Das Projekt bezeichnet sich selbst als
*„not an official information service for lightning data"*.
**Die Beschränkung folgt den Daten** — Bezug über Dritte heilt sie nicht. Auch iframe-Einbettung
trägt keine Lizenzgrundlage. **Nicht verwenden, in keiner Form.**

#### L6 — ALDIS (AT), Météorage/EUCLID, nowcast GmbH 🚫

Rein kommerziell. ALDIS-Einzelabfrage **264 € (3 Tage) / 370 € (7 Tage)** netto ✅. Kein Free-Tier,
keine offene API. Für AT bedeutet das: **keine offenen Blitzdaten.**

#### L7 — MeteoSchweiz Blitzortung ❌/🚫

MeteoSchweiz betreibt ein Blitzortungsnetz, publiziert es aber **weder in der OGD noch auf der
Roadmap** ✅ geprüft. Schweizer Blitzdaten werden kommerziell vertrieben.

#### L8 — met.no `lightning/1.0` ⚠️

Dokumentationsseite existiert, alle Endpunkt-Proben 404, Produkt fehlt im api.met.no-Index.
Abdeckung nordisch. **Gesamt: 4** — für DACH ohne Wert.

### 7.2 Vergleich und Empfehlung

| | L1 Blitzdichte | L2 MTG-LI | L3 AFA (heute) | L4 DMI | L5 Blitzortung |
|---|---|---|---|---|---|
| Legal nutzbar | ✅ | ✅ | ✅ | ✅ | 🚫 |
| Amtlich | ✅ | ✅ | ✅ | ✅ | ❌ |
| Key-frei | ✅ | ✅ | ✅ | ⚠️ | — |
| Animierbar | ✅ 13 Mon | ✅ 14 Mon | ❌ | ✅ | — |
| Auflösung | ~1 km Raster | 2 km | 2 km | Punkte | — |
| DE/AT/CH | DE | **DACH** | DACH | DE-Nord | — |
| Physik | CG+IC (Bodennetz) | optisch total | optisch total | CG-Punkte | — |
| Note | **1** | **1** | 3 | 3 | 🚫 |

**Empfehlung:** **L1 als DE-Detailschicht + L2 als DACH-Grundschicht.** Beide sind WMS-T-Raster,
beide brauchen keinen Proxy, beide nutzen das vorhandene `wmsTime.ts`. Der Layer trägt zwei ehrliche
Hinweise, die nicht optional sind: (a) Satellit misst **Gesamtblitzaktivität**, Bodennetz misst
**Erdblitze** — die Bilder unterscheiden sich systematisch, nicht zufällig; (b) die
Satellit-Parallaxe verschiebt die Ortung gegenüber dem Radar. L4 nur, wenn Einschlagspunkte
gewünscht sind — dann zwingend mit Abdeckungsmaske.

---

## 8. Layer 6 — Schneefall

Abzugrenzen vom bestehenden `snow`-Layer (ICON-D2 `h_snow` / `snow_gsp` — **Modell**) und
`snowline` (Schneefallgrenze — **ML**). Neu: die **gemessene** bzw. amtlich analysierte Schneelage.

| # | Quelle | Träger | Lizenz | Key | Takt | Auflösung | Format / Projektion | DE/AT/CH | Aufwand | Note |
|---|---|---|---|---|---|---|---|---|---|---|
| S1 | **DWD RADVOR RE — Anteil fester Niederschlag** ✅ | staatlich | CC BY 4.0 | nein | 5 min, 0…+120 min | 1 km, 900×900 | RADOLAN-bin/gz | DE | S–M | **1** |
| S2 | **GeoSphere SNOWGRID-CL** `snowgrid_cl-v2-1d-1km` ✅ | staatlich | CC BY 4.0 | nein | **1 Tag** (Lag ~1 d) | 1 km, 328×583 | NetCDF-4 / **EPSG:3416** ⚠️ | AT | M | **2** |
| S3 | **MeteoSchweiz SMN Schneeparameter** (`ch.meteoschweiz.ogd-smn`) ✅ | staatlich | CC BY 4.0 | nein | 10 min–1 d | 158 Stationen | CSV | CH | S | **2** (Punkte, keine Fläche) |
| S4 | **SLF/WSL IMIS + Schneekarten** ✅ | staatlich (Forschung) | CC BY 4.0 | nein | variabel | Stationen + Regionen | JSON/GeoJSON | CH | S | **2** |
| S5 | **DWD `radolan/sf/`** (24-h-Summe) ✅ | staatlich | CC BY 4.0 | nein | stündlich | 1 km, 900×900 | RADOLAN-bin | DE | S | **3** (Niederschlag, keine Phase) |
| S6 | ICON-D2 `h_snow`/`snow_gsp` (**heute genutzt**) | staatlich | CC BY 4.0 | nein | 3 h | 2,2 km | GRIB2 | DACH | — | **2** (Modell) |

**Projektionsfalle S2:** SNOWGRID nutzt **EPSG:3416** (ETRS89/Austria Lambert), INCA dagegen
**EPSG:31287** (MGI/Austria Lambert). Das sind **verschiedene Datumsflächen**, nicht nur andere
Parameter — eine gemeinsame Darstellung erfordert eine Datumstransformation, keine reine
Parameterumrechnung. Das ist im Aufwand einzuplanen.

**Empfehlung:** **S1 als DE-Primärquelle** — RE ist derselbe Decoderpfad wie H2, liefert im selben
Request die Phase (fest/flüssig) *und* das Hagelflag, im 5-min-Takt bis +2 h. Ein einziger
Datenpfad speist damit **zwei** neue Layer (Hagel und Schneefall-Phase). Das ist der beste
Aufwand/Nutzen-Schnitt im ganzen Dokument. **S2** für die österreichische Schneedecke (tägliche
Auflösung ehrlich ausweisen), **S4** für CH. Der bestehende `snow`-Layer (S6) bleibt als
Modellschicht unverändert bestehen — **Funktionserhalt ist oberste Direktive.**

---

## 9. Layer 7+8 — Wetterwarnungen und Unwetterwarnungen

Fachlich **ein** Datenkanal mit Schweregrad-Achse: DWD-Stufen 1 (Vorabinformation) … 5 (extremes
Unwetter); „Unwetter" beginnt bei Stufe 4. Zwei getrennte UI-Layer sind eine Darstellungs-, keine
Quellenfrage.

### 9.1 Deutschland

| # | Quelle | Geometrie | CORS | Takt | Aufwand | Note |
|---|---|---|---|---|---|---|
| **W1** | **`dwd:Warnungen_Gemeinden` via WFS→GeoJSON** ✅ | **✅ Gemeinde-Polygone** | `*` ⚠️ | Poll 15 min | **S** | **1** |
| W2 | `dwd:Warnungen_Gemeinden_vereinigt` + `…_vereinigt_{Gewitter,Sturm,Regen,Schnee,Frost,Glatteis,Tauwetter,Nebel,Hitze,UV}` ✅ | ✅ zusammengefasst | `*` ⚠️ | 15 min | S | **1** |
| **W3** | **DWD CAP-ZIPs `opendata.dwd.de/weather/alerts/cap/` ✅ — UMGESETZT (Phase W1)** | **✅ Landkreis-Polygone, 95/95 Gebiete** | ❌ kein CORS → bestehender Proxy ✅ | ~5 min | **M** | **1** |
| W4 | `www.dwd.de/DWD/warnungen/warnapp/json/warnings.json` ✅ | ❌ nur Warncell-IDs | `*` ✅ verifiziert | Minuten | S+Join | 3 |
| W5 | BrightSky `/alerts` (**heute genutzt**) ✅ | ❌ | `*` ✅ | ⚠️ | **vorhanden** | 2 (Text) |
| W6 | MeteoAlarm Atom DE | ⚠️ Bounding-Boxen | ❌ kein CORS ✅ | +10 min | M | 4 |

**W1 im Detail:**
```
https://maps.dwd.de/geoserver/dwd/ows?version=2.0.0&SERVICE=WFS
  &outputFormat=application/json&REQUEST=GetFeature
  &typeName=dwd:Warnungen_Gemeinden&CRS=CRS:84
```
Attribute (⚠️ aus drei unabhängigen Fremd-Clients zusammengetragen, **nicht** aus einer eigenen
`DescribeFeatureType`-Antwort): `SEVERITY, DESCRIPTION, EFFECTIVE, EXPIRES, ONSET, EVENT, STATUS,
MSGTYPE, HEADLINE, ALTITUDE, CEILING, INSTRUCTION, URGENCY, IDENTIFIER, WARNCELLID, NAME, EC_II,
EC_GROUP`. Semantik folgt dem **CAP-DWD-Profil 1.2**. Serverseitige Filterung via
`CQL_FILTER=EC_II IN(247,248)` ✅ (247 = starke Hitze, 248 = extreme Hitze).
❌ **Keine TIME-Dimension** auf den Warn-Layern — die zeitliche Gültigkeit steckt in `ONSET`/`EXPIRES`.
⚠️ Bekannter Fallstrick: Abfrage nach `WARNCELLID` liefert dokumentiert unzuverlässig
`numberMatched=0`; **räumlich/BBox abfragen**.

**Vor der Umsetzung zwingend:** einmal
`…/wfs?service=WFS&version=2.0.0&request=DescribeFeatureType&typeName=dwd:Warnungen_Gemeinden`
abrufen und die Attributliste festschreiben.

**W3 im Detail — Korrektur dieser Tabelle (gemessen 2026-08-06, Phase W1).**
Die Bewertung „**❌ nur `WARNCELLID`**" war **zu pauschal** und hat die Quelle zu Unrecht auf
Note 3 gesetzt. Sie gilt nur für den **Gemeindeverbands**-Schnitt. Gemessen an den echten
Vollständen:

| Produkt | Meldungen | Gebiete | davon **mit `<polygon>`** | Bytes |
|---|---|---|---|---|
| `DISTRICT_DWD_STAT` | 27 | 95 | **95 = 100 %** | 112 476 |
| `COMMUNEUNION_DWD_STAT` | 27 | 2029 | 67 = 3,3 % | 104 068 |

Umgesetzt ist deshalb **`DISTRICT_DWD_STAT`** (Sprache `DE`). Weitere belegte Eigenschaften:

- **Stabiler `LATEST`-Alias**, byte-identisch zur jüngsten zeitgestempelten Datei (SHA-1
  verglichen) ⇒ **kein Verzeichnis-Scrape** nötig — der Unterschied zu KONRAD3D.
- **Container:** ZIP mit DEFLATE (27 Einträge). Gelöst ohne neue Abhängigkeit über einen
  eigenen Zentralverzeichnis-Leser + `DecompressionStream('deflate-raw')` (D-06).
- **Die amtliche Warnfarbe liegt bei** (`AREA_COLOR`-eventCode) — kein Nachbau einer Palette.
- **Höhenbänder in Fuß** (`altitude`/`ceiling`): 1968,50394 ft = exakt 600 m.
- `expires` **darf fehlen** (9 von 27) = offen bis zur Aufhebung.
- Aufwand real **M**, nicht L: der Vollstand macht Aufhebungen implizit korrekt (was nicht
  mehr in der Datei steht, ist weg) — es braucht keine `*_DIFF`-Zustandsführung.

**W1 (WFS) bleibt der sinnvolle nächste Schritt für Gemeindegenauigkeit** (→ `improvements.md`
V-158); für Phase W1 gab CAP den kürzeren, vollständig belegten Weg — inklusive der
Attributsemantik, die bei W1 bis heute nur aus Fremd-Clients zusammengetragen ist.
Details: `audit/wetterwarnungen.md`.

### 9.2 Österreich — **V-133 ist gelöst**

**A1 — GeoSphere Warn-API** ✅

| Kriterium | Wert |
|---|---|
| Basis | `https://warnungen.zamg.at/wsapp/api` · OpenAPI 1.1.0: `https://openapi.hub.geosphere.at/warnapi/v1/openapi.json` ✅ |
| Lizenz / Key | **CC BY 4.0** / **nein** ✅ (Data Hub: „warnungen-v1") |
| CORS | `access-control-allow-origin: *`, `GET, HEAD`, `max-age 600` ✅ |
| Fläche | `GET /getWarnstatus` → FeatureCollection, **MultiPolygon je Gemeinde** ✅ |
| Projektion | **EPSG:31287** (Austria Lambert, Meter) — **muss** nach 4326 umprojiziert werden |
| Vereinfachung | GeoPandas `simplify_coverage`, Toleranz **375 m** ⇒ gut für Rendering, grob für Punkt-in-Polygon |
| Änderungserkennung | `HEAD /getWarnstatus` → `Last-Modified` ⇒ billiges Polling ✅ |
| **`wtype`** ✅ | **1 = Sturm · 2 = Regen · 3 = Schnee · 4 = Glatteis · 5 = Gewitter · 6 = Hitze · 7 = Kälte** |
| **`wlevel`** ✅ | **1 = gelb · 2 = orange · 3 = rot** (Dreistufig — **keine** 4. Stufe wie bei MeteoAlarm) |
| Klartext | `GET /getWarningsForCoords?lon=&lat=&lang=de\|en` liefert `text`, `auswirkungen`, `empfehlungen` ✅ (live geprüft, z. B. „Es ist mit extremer Hitzebelastung zu rechnen") |
| Zusatz | `GET /getGewitterAuto` → MultiPoint, automatische Gewitterdetektion |
| Einschränkung | gilt für den **Dauersiedlungsraum**, hochalpine Lagen ausgenommen (steht bereits korrekt in `src/officialSources.ts`) |
| ⚠️ Bekannter Defekt | `warnid` ist **nicht** zwischen `getWarnstatus` und `getWarningsForCoords` joinbar (offenes Issue #42) — **nicht als Cache-/Dedup-Schlüssel verwenden** |
| Aufwand | **S–M** (nur die Reprojektion ist echte Arbeit) |
| **Gesamt** | **1** |

**Die Konsequenz für V-24/V-133:** Der Grund für den Stopp — „`wtype` ist eine nackte Zahl ohne
abrufbare Legende" — ist damit ausgeräumt. Die Legende ist **normativ** (Enum-Beschreibung der
amtlichen OpenAPI-Spezifikation), nicht geraten. Zusätzlich braucht es die Zuordnung womöglich gar
nicht: `getWarningsForCoords` liefert deutschen Klartext direkt. **Empfohlene Architektur:**
`getWarnstatus` für die Flächen (ein Request, ganz AT), `getWarningsForCoords` für die Detailkarte
bei Klick/Tap.

**A2 — MeteoAlarm Österreich** — CC BY 4.0, key-frei, **aber kein CORS** ✅ und **ohne jede
Geometrie**: gemessen am Live-Payload 2026-08-08 trägt jedes `area` ausschließlich
`<geocode>` `EMMA_ID` (z. B. `AT203` = Hermagor), **kein** `<polygon>`. ⚠️ Die frühere Formulierung
„nur Bounding-Boxen" war ungenau — Boxen liefert die (registrierungspflichtige) EDR-API, der offene
Feed liefert gar nichts Flächenhaftes. Ein Geometrie-Join gegen die politischen Bezirke von
Statistik Austria wäre nötig; A1 liefert die Flächen dagegen fertig mit. **Gesamt: 4** (unverändert).
Bemerkenswert: MeteoAlarm wird von GeoSphere betrieben (Kontakt `meteoalarm@geosphere.at`) —
deshalb gibt es keinen separaten GeoSphere-CAP-Feed. **Für die Schweiz gilt das Gegenteil**, s. §9.3.

### 9.3 Schweiz — ⚠️ **Korrektur 2026-08-08: die Lücke ist keine**

> **Diese Sektion war falsch.** Die Erstfassung schloss aus sieben negativ geprüften Wegen auf
> „kein eigener Warn-Layer für CH". Die Prüfung dieser sieben Wege war korrekt und bleibt unten
> stehen — übersehen wurde nur der achte: MeteoSchweiz publiziert seine Warnungen als
> EUMETNET-Mitglied über MeteoAlarm, und der **CH-Feed enthält volle Polygone**. Belege und
> Integrationsweg: `audit/warnungen-at-ch.md` (2026-08-08). Siehe auch die Korrektur zu
> `docs/API.md` §8.2, aus der die Fehlannahme stammt.

**C1 — MeteoAlarm-Feed Schweiz** ✅ *(neu bewertet 2026-08-08)*

| Kriterium | Wert |
|---|---|
| Endpunkt (offiziell) | `https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-switzerland` — Atom, RSS ist seit 2026-01-14 abgekündigt |
| Endpunkt (verifiziert) | `https://feeds.meteoalarm.org/api/v1/warnings/feeds-switzerland` — JSON, ⚠️ **undokumentiertes Website-Backend**, kann ohne Ankündigung brechen |
| Urheber | **MeteoSchweiz** direkt (`"sender": "meteoalarm.cap@meteoswiss.ch"`) — MeteoAlarm ist nur das Relais |
| Format | **CAP 1.2**, Feldsatz deckungsgleich mit dem DWD-Profil ⇒ `src/warnings/capAlerts.ts` ist wiederverwendbar |
| Fläche | ✅ **echte `<polygon>`-Ringe an JEDEM `area`-Objekt**, hochaufgelöst — kein Geocode-Join nötig |
| Lizenz / Key | **CC BY 4.0** / **nein**; Attribution „Data provided by EUMETNET members" + „Quelle: MeteoSchweiz" |
| CORS | ❌ kein `Access-Control-Allow-Origin` ⇒ **Netlify-Rewrite** (kein Edge Function, s. §7-Cache-Verbot) |
| Latest-Alias | ✅ die Länder-URL **ist** der Alias — keine Zeitstempel-Dateinamen, kein Scrape |
| Verzug | ~10 min (Relais-Latenz addiert sich zur Quelle) — bei der Datenalter-Anzeige zu berücksichtigen |
| ⚠️ **Falle 1** | `altitude`/`ceiling` stehen in **Metern**, nicht in Fuß wie CAP es normativ vorschreibt (gemessen: glatte `800.0`/`600.0`/`3000` gegen DWDs `1968.50394 ft`). `feetToM()` darauf anzuwenden macht aus „unterhalb 800 m" ein „unterhalb 244 m" — **verfälschte amtliche Warnung** |
| ⚠️ **Falle 2** | **fünf `info`-Blöcke je Meldung** (`en`/`de`/`fr`/`it`/`rm`); `parseCapAlert` nimmt heute den ersten = `en` ⇒ Auswahl muss über `language` laufen |
| ⚠️ Offen | Innere Struktur des **Atom**-Feeds unverifiziert (gzip, nicht dekodierbar gewesen); CORS-Gegenprobe mit echtem `Origin`-Header steht aus |
| Auflösung | MeteoSchweiz warnt intern in **159 Warnregionen** — ob die Feed-Polygone diesen Schnitt tragen, ist offen (Legenden-, keine Machbarkeitsfrage) |
| Aufwand | **S–M** |
| **Gesamt** | **1** |

**Weiterhin gültig — die sieben negativ geprüften Wege:**

| Weg | Ergebnis |
|---|---|
| MeteoSchweiz OGD/STAC | ✅ geprüft — **keine** Warn-/Alert-/CAP-Collection |
| `meteoswiss.admin.ch` Gefahrenkarte | 5-stufige Skala, **keine API dokumentiert** |
| `naturgefahren.ch` | Bundesportal, **keine öffentliche API/GeoJSON** |
| GIN (`info.gin.admin.ch`) | API existiert, **zugangsbeschränkt** (Behörden) |
| `api3.geo.admin.ch` Layer-Suche | **kein** `ch.meteoschweiz.*`-Warnregionen-Layer gefunden |
| `opendata.swiss` | nur statische Risiko-/Gefahrenkarten |
| App-Backend `app-prod-ws.meteoswiss-app.ch/v3/plzDetail?plz=…` | ⚠️ funktioniert, aber **undokumentiert, PLZ-basiert, ohne Polygone, ohne Lizenz und ohne Zusage** |

**Empfehlung für CH (2026-08-08 revidiert):** **C1 — MeteoAlarm-Feed über Netlify-Rewrite.** Der
Weg ist amtlich (Urheber MeteoSchweiz), lizenziert (CC BY 4.0), polygonhaltig und formatgleich mit
dem bereits umgesetzten DWD-CAP-Pfad. Die zwei Fallen oben sind vor dem Gate zu belegen.

Unverändert gültig: Das reverse-engineerte App-Backend ist **nicht** zu verwenden — es
widerspricht dem Prinzip „amtlich und belastbar" und würde in dem Feature brechen, in dem ein
Bruch am teuersten ist. Und die Deep-Links in `src/officialSources.ts` auf das
Naturgefahrenportal **bleiben** auch mit eigenen Daten bestehen (Oberste Direktive
Funktionserhalt); sie sind dann die amtliche Primärquelle neben der eigenen Darstellung.

⚠️ **Lizenz-Sonderregel, die für DE und CH gleichermaßen gilt:** DWD verlangt, dass die
Quellenangabe **entfernt** wird, wenn die Darstellung nicht sicherstellt, dass Warnungen alle Nutzer
*„vollständig und unverzüglich"* erreichen. MeteoSchweiz erlaubt die Weitergabe von Warnungen nur
**unverzüglich und inhaltlich unverändert**. Beides ist bei der UI-Gestaltung zu berücksichtigen —
ein Warn-Layer, der 15 Minuten alte Daten unkommentiert zeigt, ist nicht nur ehrlich fragwürdig,
sondern lizenzrechtlich heikel.

### 9.4 Vergleich — ⚠️ **korrigiert 2026-08-08 (zweiter Durchgang)**

> Die Erstfassung dieser Tabelle führte CH als „—"/„❌" und MeteoAlarm pauschal als
> „BBox / Note 4". Beides widersprach der bereits korrigierten §9.3 **derselben Datei** — beim
> Nachziehen am 2026-08-08 wurde die Tabelle übersehen. Belege: `audit/warnungen-at-ch.md`
> §§1, 8 (gemessene Payloads).

| | DE W1 (WFS) | DE W3 (CAP) | AT A1 | **CH C1** | MeteoAlarm (DE/AT) |
|---|---|---|---|---|---|
| Träger | staatlich | staatlich | staatlich | **staatlich** (MeteoSchweiz, Relais EUMETNET) | Verbund |
| Lizenz | GeoNutzV | GeoNutzV | CC BY 4.0 | ⚠️ „**gleichwertig zu CC BY 4.0**, mit Zusatzauflagen für die Weitergabe" (Wortlaut `<rights>`, §8.8) | dito |
| Key | nein | nein | nein | **nein** | nein (Feeds) |
| CORS | ✅ `*` | ❌ | ✅ `*` | ❌ (mit echtem `Origin` gegengeprüft) | ❌ |
| Polygone | ✅ Gemeinde | ❌ IDs | ✅ Gemeinde | ✅ **Warnregion, hochaufgelöst** | ❌ nur `EMMA_ID`-Geocodes |
| Projektion | 4326/3857 | — | **31287** | **4326** | 4326 |
| Klartext | ✅ | ✅ | ✅ (Coords-API) | ✅ — aber **nicht im Atom-Index**, nur im je-Meldung-CAP (§8.1/§8.3) | ✅ |
| Aufwand | **S** | L | S–M | **S–M** | M |
| Note | **1** | 3 | **1** | **1** | 4 |

⚠️ Der Geometrie-Gehalt von MeteoAlarm ist **länderabhängig** — die Spalte „MeteoAlarm" gilt
ausdrücklich für **DE und AT**. Für CH liefert dieselbe Plattform volle Polygone (Spalte „CH C1").

---

## 10. Weitere hochwertige DACH-Layer (Auswahl)

| # | Layer | Quelle | Träger | Lizenz | Key | Takt / Auflösung | DE/AT/CH | Aufwand | Note |
|---|---|---|---|---|---|---|---|---|---|
| X1 | **Satellit HD** | EUMETView `mtg_fd:rgb_geocolour` (PT10M), `msg_rss:rgb_natural_nrt` (**PT5M**, Archiv seit 2020) ✅ | zwischenstaatl. | ⚠️ Lizenzstufe | nein | 5–10 min / 1–3 km | ✅✅✅ | S | **2** ⚠️ |
| X2 | **Lawinenlage** | ALBINA/EUREGIO `static.avalanche.report/bulletins/<date>/<date>_<REGION>_<lang>_CAAMLv6.json` ✅ · EAWS-Tagesaggregate `…/eaws_bulletins/<date>/<date>.ratings.json` ✅ · Regionen `eaws.gitlab.io/eaws-regions/…` (**CC0**) ✅ | staatlich/Verbund | CC0 (Regionen) / ❌ Bulletins | nein | 2×/Tag | ✅✅✅ | **S** | **1** |
| X3 | **Lawinenlage CH** | SLF `https://aws.slf.ch/api/bulletin/caaml` — CAAMLv6 **+ GeoJSON mit EAWS-konformen `fill`-Farben im Payload** ✅ | staatlich | **CC BY 4.0** | nein | 2×/Tag | ❌❌✅ | **S** | **1** |
| X4 | **Waldbrandgefahr** | EFFIS/GWIS `https://maps.effis.emergency.copernicus.eu/gwis` WMS, Layer `ecmwf.fwi`, `mf025.fwi`, `viirs.hs` ✅ (`Fees: none`) | EU/JRC | CC BY 4.0 | **nein** | täglich / 8–25 km | ✅✅✅ | S | **2** |
| X5 | **Luftqualität / Saharastaub / Pollen** | CAMS via `https://eccharts.ecmwf.int/wms/?token=public` — 24 europ. Layer inkl. **Erle, Birke, Gräser, Beifuß, Olive, Ambrosia** und UV-Index ⚠️ (Doku, nicht live geprüft) | EU/ECMWF | Copernicus | **nein** (`token=public`) | tägl. 00Z, stündlich / 0,1° | ✅✅✅ | S | **2** |
| X6 | **Europa-Radar** | OPERA (s. R5) ✅ | Verbund | CC BY 4.0 | nein | 5 min / 1–2 km | ✅✅✅ | **L** | 2 |
| X7 | **Hagelklimatologie CH** | `wmts.geo.admin.ch` `ch.meteoschweiz.hagelgefaehrdung-korngroesse_*_jahre` ✅ | staatlich | CC BY | nein | statisch | ❌❌✅ | **XS** | 2 |
| X8 | **Niederschlagsmessnetz** | `ch.meteoschweiz.messwerte-niederschlag-10min` (WMTS) ✅ | staatlich | CC BY | nein | 10 min | ❌❌✅ | XS | 3 |
| X9 | **Überflutung** | GloFAS `https://ows.globalfloods.eu/glofas-ows/ows.py` ⚠️ (EFAS ist **key-pflichtig** und embargoiert Echtzeit 30 Tage) | EU | offen | nein | täglich | ✅✅✅ | M | 3 |

**Hinweis zu X5:** CAMS-Pollen ist **pan-europäisch** und key-frei — das schließt genau die
Länder-Asymmetrie, die `V-27` heute als DE-only-Problem beschreibt, **ohne** den personengebundenen
API-Key des österreichischen Pollenwarndienstes und damit ohne den D-06-Konflikt („keine Secrets im
Frontend"). Derselbe Weg löst den in `V-26` beschriebenen UV-Fleck. Das ist ein Nebenbefund dieser
Recherche mit eigenständigem Wert (→ V-141).

**Hinweis zu X2/X3:** Die SLF-Bulletin-API liefert GeoJSON, in dem die **EAWS-konformen
Füllfarben bereits enthalten** sind (`fill`, `fillEarlier`, `fillLater`). Das ist der billigste
hochwertige Layer im ganzen Dokument: ein `fetch`, eine `geojson`-Source, `fill-color: ['get','fill']`.
Passt außerdem exakt zur bestehenden, richtigen Haltung des Projekts (`src/avalanche.ts` verlinkt,
statt zu modellieren) — der Layer würde **verlinken und darstellen**, nicht selbst bewerten.

---

## 11. Konsolidierte Empfehlungsmatrix

| Layer | DE | AT | CH | DACH-weit | Transport | Aufwand |
|---|---|---|---|---|---|---|
| **Regenradar** | RADOLAN-RY/RV ✅ | INCA (**„Analyse", nicht „Radar"**) | rzc ✅ | (OPERA) | Proxy / direkt / direkt | **vorhanden** |
| **Zuglinien / Bewegung** | RV 25 Frames + **eigener** Optical Flow (RV enthält **kein** Bewegungsfeld ✅) | INCA, **11–12 variable Leads, keine Analyse** — „aus der INCA-Analyse abgeleitet" | — **Lücke** (kein offener Nowcast, INCA-CH „on request") | — | vorhanden | S–M |
| **Zellbahnen (E3)** ✅ **umgesetzt** (Phase Z1, 2026-08-05) | **KONRAD3D** ✅ — ID, Umriss, `cell_speed`, 12 Prognosepositionen **mit amtlicher Unsicherheitsellipse**, Hagel-/Böen-/Starkregen-Flag | ⚠️ **kein** eigenes Objektprodukt — der **deutsche** Radarverbund reicht aber über die Grenze (belegt: Zelle bei 47,009 °N / 11,879 °E aus den Sweeps Isen + Memmingen) und dünnt dort aus | dito — kein gleichwertiges Objektprodukt | — | Proxy Pflicht | M |
| **Hagel** ✅ **umgesetzt** (Phase HA1, 2026-08-06) | **KONRAD3D-Hagelzellen** (`hail_flag`, `area_hail`, `area_large_hail`); RE Bit 13 zurückgestellt (V-152) | keine eigene Quelle — nur Reichweite der Nachbarverbünde, im Osten **keine** Abdeckung | **POH + MESHS** ⭐ (MESHS in **mm**, POH als **Anteil 0…1**) | — | direkt (CORS `*`) / — / direkt | M |
| **Gewitter (Zellen)** | NCEW_EU → KONRAD3D | — Lücke | — Lücke | (MSG RDT) | direkt | S → M |
| **Blitz** | **Blitzdichte** (TIME!) ⭐ | — Lücke | — Lücke | **MTG-LI AFA** ⭐ | direkt | **S** |
| **Schneefall** | RE (Phase) | SNOWGRID (1 d) | SMN/SLF | — | Proxy / direkt / direkt | M |
| **Wetterwarnungen** | **WFS GeoJSON** ⭐ | **GeoSphere** ⭐ | **MeteoAlarm-Feed CH** ⭐ (Urheber MeteoSchweiz, **mit** Polygonen — korrigiert 2026-08-08) | (MeteoAlarm nur für CH tauglich — der AT-Feed hat keine Geometrie) | direkt / direkt / **Rewrite** | **S–M** |
| **Unwetterwarnungen** | dieselbe Quelle, Stufe ≥ 4 | dieselbe, `wlevel` ≥ 2 | dieselbe, `severity` ≥ `Severe` | — | — | **XS** |
| **Lawinen** | (DE-BY via EAWS) | ALBINA/EAWS | **SLF** ⭐ | EAWS | direkt | **S** |
| **Satellit HD** | — | — | — | EUMETView ⚠️ | direkt | S |
| **Waldbrand** | — | — | — | EFFIS/GWIS | direkt | S |
| **Pollen/UV/Luft** | — | — | — | CAMS | direkt | S |

### Die vier Länder-Lücken, die ausgewiesen werden müssen (D-04)

1. **AT: kein offenes Radar** — Austro Control publiziert nicht offen; INCA ist eine Analyse.
2. **AT + CH: keine offenen Blitzdaten** — ALDIS kommerziell, MeteoSchweiz nicht publiziert.
   Satellit (MTG-LI) schließt die Lücke fachlich nur teilweise (Gesamtblitz statt Erdblitz).
3. **AT: kein offenes Hagelprodukt.**
4. **CH: kein offener Nowcast** (INCA-CH ist „on request"). ⚠️ **Korrigiert 2026-08-08:** Der
   Zusatz „keine offenen Warnungen" war **falsch** — MeteoSchweiz publiziert Warnungen mit
   Polygonen über MeteoAlarm (§9.3 C1). Die CH-Warnlücke ist damit gestrichen; der fehlende
   Nowcast bleibt.

Diese Sätze gehören in die Legende der betroffenen Layer — nicht in eine Fußnote.

**Neu hinzugekommen (2026-08-08):** **AT: Warnungen decken nur den Dauersiedlungsraum ab**,
hochalpine Lagen sind ausgenommen (GeoSphere, §9.2). Eine warnfreie Alpenfläche in AT heißt
**nicht** „keine Gefahr", sondern „nicht abgedeckt" — das ist eine Ausweisungspflicht derselben
Kategorie und gehört in dieselbe Legende.

---

## 12. Risiken

| # | Risiko | Wahrsch. | Wirkung | Gegenmaßnahme |
|---|---|---|---|---|
| RK-1 | **CORS-Annahme falsch** → Layer braucht doch einen Edge-Proxy (STOPP-&-FRAGEN-Zone) | mittel | hoch | Je Endpunkt **einmal im Browser prüfen**, bevor der Aufwand geschätzt wird. Gate-Bedingung |
| RK-2 | **EUMETSAT-Lizenzstufe** für Echtzeit-Bildprodukte < 1 h ungeklärt | mittel | hoch | Satellit-RGB hinter Flag; **schriftliche Bestätigung** einholen. `li_afa` ist unbedenklich |
| RK-3 | **EUMETNET-Widerspruch**: Altseiten fordern Kontaktaufnahme, ORD deklariert CC BY 4.0 | mittel | mittel | OPERA erst nach schriftlicher Klärung als sichtbares Feature |
| RK-4 | **GeoSphere 240 req/h** → 429 unter Last | **hoch** | hoch | Edge-Proxy + Durable Cache + Warm-Cron nach T1/T2-Muster; **nie** client-direkt in der Fläche |
| RK-5 | **`jsfive` scheitert an einem Filter** (szip/n-bit/scale-offset) | niedrig | hoch | `h5dump -pH` je Produkt **vor** der Planung; ODIM v2.4.1 schließt szip normativ aus |
| RK-6 | **Reverse-engineerte Konstanten brechen still** (Verzeichnislayout, Header-Semantik, Eckkoordinaten) | mittel | hoch | Kontrakt-Sonde je Quelle (V-87-Muster) + Frische-Badge (V-19) |
| RK-7 | **Hagel-Saisonalität CH** → im Winter leere Dateien wirken wie „kein Hagel" | **hoch** | mittel | Layer außerhalb 01.04.–30.09. mit Saisonhinweis statt leerer Fläche |
| RK-8 | **Erfundene Semantik** (HG/VII/DMAX, geratene `wtype`) | mittel | **sehr hoch** | Harte Regel: kein Layer ohne belegte Produktdefinition. HG/VII/DMAX bleiben draußen |
| RK-9 | **Speicherdruck** durch viele parallele Frame-Puffer auf Mobilgeräten | **hoch** | hoch | Frame-Budget je Layer, LRU über alle Layer, `FrameGovernor`-Kopplung (s. `docs/2d-layer-erweiterung.md` §7) |
| RK-10 | **Warn-Lizenzklausel** („vollständig und unverzüglich") wird durch Cache/Staleness verletzt | mittel | mittel | Warn-Layer **ohne** Durable-Cache, kurzes TTL, sichtbares Alter, Deep-Link zur amtlichen Quelle |
| RK-11 | **Blitz-Doppelzählung** (Blitzdichte: 5-min-Schritt über 15-min-Fenster) | mittel | niedrig | Nie aufsummieren; Legende „letzte 15 Minuten" führen |
| RK-12 | **Parallaxe Satellit vs. Radar** wird als Ortungsfehler wahrgenommen | mittel | niedrig | Ehrlichkeitshinweis in der Legende; Radar bleibt Referenz |

---

## 13. Offene Fragen (vor Umsetzung zu klären)

| # | Frage | Wie zu klären | Blockiert | Stand |
|---|---|---|---|---|
| F-1 | CORS je Endpunkt | 1× `curl -I -H 'Origin: …'` je Quelle | **Aufwandsschätzung aller Layer** | **teilweise beantwortet 2026-08-05** — vier Hosts gemessen (§0). Rest bleibt L0 |
| F-2 | Welche HDF5-Filter nutzen RZC/BZC/MZC und OPERA? | `h5dump -pH` je 1 Datei | Hagel-CH, Europa-Radar | offen |
| F-3 | KONRAD3D-XML-Schema | Formatbeschreibung beim DWD anfordern / Datei inspizieren | Zell-Layer, Zuglinien Stufe 2 | **GESCHLOSSEN 2026-08-05** — vollständig aus `KONRAD3D_20260805T193500.xml` ausgelesen, s. §4.1 B2 und `docs/zuglinien-radar-spec.md` §1.3. **L11 wartet auf nichts mehr** |
| F-4 | Vollständige Attributliste `dwd:Warnungen_Gemeinden` | 1× `DescribeFeatureType` | Warn-Layer-Styling | offen |
| F-5 | Hat `dwd:Accumulated_Flash_Area` eine TIME-Dimension? | 1× GetCapabilities | Blitz-Layer-Auswahl | offen |
| F-6 | EUMETSAT: Echtzeit-Bildprodukte kommerziell nutzbar? | **schriftliche Anfrage** | Satellit-HD-Layer | offen |
| F-7 | EUMETNET/OPERA: gilt CC BY 4.0 für Nicht-Mitglieder? | **schriftliche Anfrage** | Europa-Radar | offen |
| F-8 | Bedeutung von `composite/hg/`, `vii/`, `dmax/` | DWD-Anfrage | (aktuell bewusst draußen) | **teilweise beantwortet 2026-08-05** — `vii` = ODIM `VII`+`VIL` ✅, `dmax` = `DBZH` auf DE4800 ✅ (beide damit nutzbar). **`hg` bleibt offen**: Struktur belegt (4 B/Zelle, DE1200), physikalische Größe nicht |
| F-9 | Nimmt Österreich am EUMETNET-ODR teil? | ORD-Collections prüfen | AT-Radar-Lücke | offen |
| F-10 | RE: ist „0–1000 → Anteil" korrekt? | DWD-Anfrage oder Plausibilisierung gegen SYNOP | Schneefall-Phase DE | offen |
| F-11 | ALBINA-Bulletin-Lizenz | `avalanche.report/more/open-data` im Browser lesen | Lawinen-Layer AT/IT | offen |
| F-12 | GeoSphere: senden die `grid`-Datenrouten CORS-Header? | Browser-Probe | AT-Transportentscheidung | **BEANTWORTET 2026-08-05** — ja, `Access-Control-Allow-Origin: *` ✅ gemessen. `HEAD` antwortet 405, Sonden müssen `GET` nutzen. Der Edge-Proxy bleibt nötig — wegen des **Rate-Limits** (RK-4), nicht wegen CORS |
| **F-13** | **Klassen-Kodierung von `composite/hymecng`** (ODIM `quantity = CLASS`) — welcher Zahlwert ist welcher Hydrometeor? | Compound-Reader nachrüsten **oder** DWD-Anfrage (wie bei F-3) | **L8/L9** — ohne belegte Kodierung kein Klassen-Layer (D-04) | **BLEIBT OFFEN, präzisiert 2026-08-06 (Phase HA1):** Die `legend` **existiert**, `shape=[11]`, Attribut `levels=11`, aber als HDF5-**Compound + deflate** — `jsfive` bricht mit „Compound type not yet implemented" ab, Rohbytes sind komprimiert. Beobachtete Klassen: 0,1,2,3 und (36 Pixel) 9. **Indiz, kein Beleg:** KONRAD3D führt für eine Hagelzelle `maximum_near_ground_class = 9`. Weg + Aufwand in **V-153** |

---

## 14. Quellenverzeichnis

**Amtlich / primär**
[DWD OpenData Radar](https://opendata.dwd.de/weather/radar/) ·
[RADOLAN/RADVOR Kompositformat 2.6](https://opendata.dwd.de/climate_environment/CDC/help/RADOLAN/Unterstuetzungsdokumente/RADOLAN-RADVOR-Kompositformat_2.6.pdf) ·
[DWD CDC Terms of use](https://opendata.dwd.de/climate_environment/CDC/Terms_of_use.txt) ·
[DWD CAP-Warnungen](https://opendata.dwd.de/weather/alerts/cap/) ·
[DWD GeoServer](https://maps.dwd.de/geoserver/dwd/ows?service=WMS&version=1.3.0&request=GetCapabilities) ·
[DWD Vorlagen Quellenangabe](https://www.wettergefahren.de/vorlagen_quellenangabe.html) ·
[GeoSphere Dataset API](https://dataset.api.hub.geosphere.at/v1/datasets) ·
[GeoSphere Warn-API OpenAPI](https://openapi.hub.geosphere.at/warnapi/v1/openapi.json) ·
[GeoSphere Data Hub warnungen-v1](https://data.hub.geosphere.at/dataset/warnungen-v1) ·
[MeteoSchweiz Open Data](https://opendatadocs.meteoswiss.ch/) ·
[MeteoSchweiz D1 Niederschlagsradar](https://opendatadocs.meteoswiss.ch/d-radar-data/d1-precipitation-radar-products) ·
[MeteoSchweiz D3 Hagelradar](https://opendatadocs.meteoswiss.ch/d-radar-data/d3-hail-radar-products) ·
[STAC ogd-radar-hail](https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-radar-hail) ·
[SLF Bulletin-API](https://aws.slf.ch/api/bulletin/caaml) ·
[EUMETView WMS](https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetCapabilities&namespace=mtg_fd) ·
[EUMETNET Open Radar Data](https://eumetnet.github.io/openradardata-documentation/) ·
[MeteoGate ORD Collections](https://api.meteogate.eu/eu-eumetnet-weather-radar/collections) ·
[ODIM_H5 v2.4.1](https://eumetnet.eu/wp-content/uploads/2024/10/ODIM_H5_v2.4.1_final.pdf) ·
[EFFIS/GWIS WMS](https://maps.effis.emergency.copernicus.eu/gwis?service=WMS&request=GetCapabilities&version=1.3.0) ·
[EAWS Regions (CC0)](https://gitlab.com/eaws/eaws-regions) ·
[MeteoAlarm Feeds](https://feeds.meteoalarm.org/)

**Sekundär / Kontext**
[wradlib RADOLAN Guide](https://docs.wradlib.org/projects/radolan/en/latest/notebooks/legacy.html) ·
[EURADCLIM, ESSD 15, 1441](https://essd.copernicus.org/articles/15/1441/2023/) ·
[Bright Sky](https://brightsky.dev/) ·
[Spatineo: DWD GeoServer](https://directory.spatineo.com/service/1117/) ·
[openHAB dwdunwetter DwdXmlTag](https://github.com/openhab/openhab-addons/blob/main/bundles/org.openhab.binding.dwdunwetter/src/main/java/org/openhab/binding/dwdunwetter/internal/dto/DwdXmlTag.java) ·
[dataset-api-docs Issue #42](https://github.com/Geosphere-Austria/dataset-api-docs/issues/42) ·
[Blitzortung Nutzungsbedingungen](https://www.blitzortung.org/en/cover_your_area.php) ·
[ALDIS Produkte](https://www.aldis.at/produkte/blitz-einzelabfrage/) ·
[albina-website config.json](https://raw.githubusercontent.com/albina-euregio/albina-website/master/app/config.json) ·
[proj4js Issue #456](https://github.com/proj4js/proj4js/issues/456)

---

# W. Waldbrand DACH — Quellenbewertung (Recherche 2026-08-14)

> Erhoben für die geplante Kachel **„Waldbrand DACH"** (`architecture.md` §14, `plan.md` §Phase WB).
> **Prüfmaßstab dieser Session — vier harte Filter:** (1) kostenlos, keine Testphase, kein Freemium ·
> (2) **kein Registrierungs-/API-Key-Zwang** · (3) **keine Rate-Limits** · (4) keine
> Nicht-kommerziell-Klausel, keine unklare Lizenz. Ein Verstoß ⇒ **BLOCKIERT**, kein Umgehen.
> Rangfolge nach Auftrag: **DWD zuerst**, dann GeoSphere/MeteoSchweiz/WSL/Copernicus/EU.
>
> **Legende Verifikationsgrad:** ✅ = URL in dieser Session selbst aufgerufen ·
> ⚠️ = nicht abrufbar (robots.txt / Timeout / Binärantwort), Angabe **unbestätigt**.

## W.0 Die drei Befunde, die alles andere bestimmen

1. **Das DWD-WBI-Raster existiert als offene Datei nicht.** Die amtliche Produktbeschreibung
   kündigt ein 1-km-NetCDF (EPSG:3035) unter `grids_germany/daily/fire_danger_index/…` an. ✅ Der
   Pfad liefert 404, und das Verzeichnislisting `grids_germany/daily/` enthält **keinen**
   `fire_danger_index`-Eintrag (nur `Project_TRY, evapo_p, evapo_r, evaporation_fao, frost_depth,
   hyras_de, radolan, regnie, soil_moist, soil_moisture, soil_temperature_5cm`). **Offen ist nur die
   Stations-CSV** (in WB0 gemessen: **484 Stationen**, als 484 Einzeldateien plus einer
   Stationsliste mit den Koordinaten — s. §W.8). Eine Fläche daraus ist **unsere Interpolation**, kein
   amtliches Flächenprodukt — und muss genau so beschriftet werden.
2. **ICON-D2 führt alle vier FWI-Eingangsgrößen — und mehr.** ✅ Das Parameterverzeichnis
   `weather/nwp/icon-d2/grib/00/` listet 137 Parameter, darunter **`relhum_2m`, `td_2m`, `w_so`,
   `smi`, `t_so`, `plcov`, `lai`, `rootdp`, `aswdir_s`, `asob_s`, `runoff_s`** — zusätzlich zu den
   bereits angebundenen `t_2m`, `u_10m`, `v_10m`, `vmax_10m`, `tot_prec`, `h_snow`. Damit ist der
   meteorologische Treiber-Layer **ohne neue Lizenz und ohne neue Pipeline** erreichbar (Constraint 5
   des Auftrags erfüllt). **Grenze:** siehe W.5 — echte FWI-Codes brauchen Tagesübertrag.
3. **Österreich hat keinen offenen Waldbrandindex.** GeoSphere-Dataset-API: kein `fire`/`waldbrand`-
   Datensatz; Warn-API: 7 Typen (Sturm, Regen, Schnee, Glatteis, Gewitter, Hitze, Kälte), **kein
   Waldbrand**. BOKU-Datenbank und BMLUK-Risikokarte: keine Lizenzangabe, kein Download ⇒ blockiert.
   Für AT bleibt **nur** der EU-Index. Das ist eine auszuweisende Länder-Lücke nach D-04.

## W.1 Gefahrenindizes (Faktorgruppe A)

| Quelle | Betreiber | Produkt / Größe | Auflösung, Abdeckung | Zeitl. Auflösung / Horizont | Update | Format | Zugriffs-URL | Auth | Lizenz / kommerziell | Limits | Historie | Check |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **DWD WBI** | DWD (CDC) | Waldbrandgefahrenindex, **5 Stufen** (sehr gering → sehr hoch), eigenes Bestandsmodell (Streu-/Bodenfeuchte, Ausbreitung, Feuerintensität) | **Stationen: gemessen 484**, DE | Tageswert, **Tag 0…+6** (Spalten `wbi_0`…`wbi_6`) | täglich ~**04:20 UTC** ✅ | CSV.gz, v2-3--0 — **484 Dateien, eine je Station**, jede eine Zeitreihe über 170 Termine; nur die **letzte** Zeile ist der aktuelle Stand. Eine Sammeldatei existiert **nicht** | ✅ `opendata.dwd.de/climate_environment/CDC/derived_germany/fire_danger_index/woodland/forecast/recent/` | nein | **CC BY 4.0**, kommerziell ja | keine | offen seit 2026-02; `recomputed/` ab 1961 | 🟢 **OK, aber Ladestrategie nötig** (§W.8) |
| **DWD WBI Stationsliste** | DWD (CDC) | `Stationsindex; Höhe in m; Breite; Länge; Name; Bundesland` — **die einzige Quelle der Koordinaten**; die Wert-CSVs führen nur die `StationsID` | 484 Zeilen, DE | statisch je Version | mit dem Produkt | TXT, 97.970 B | ✅ `…/recent/derived_germany_fire_danger_index_woodland_forecast_recent_v2-3--0_stations_list.txt` | nein | CC BY 4.0 | keine | — | 🟢 **OK — ohne sie ist kein Punkt verortbar** |
| **DWD GLFI** | DWD (CDC) | Graslandfeuerindex, 5 Stufen, Spalten `glfi_0`…`glfi_6` | Stationen, DE | Tag 0…+6 | täglich ~04:20 UTC | CSV.gz | ✅ `…/fire_danger_index/grassland/forecast/recent/` | nein | CC BY 4.0, ja | keine | seit 2026-02 | 🟢 **OK** |
| **DWD WBI/GLFI als 1-km-Raster** | DWD | NetCDF, EPSG:3035 — **in der Produktbeschreibung angekündigt** | 1 km, DE | Tag 0…+6 | — | NetCDF | ✅ `…/grids_germany/daily/fire_danger_index/…` → **404**, Eintrag fehlt im Listing | — | — | — | — | ⛔ **EXISTIERT NICHT** |
| **EFFIS FWI (Météo-France)** | EU/JRC, Copernicus EMS | Canadian FWI + FFMC/DMC/DC/ISI/BUI/Ranking/Anomalie, **6 Klassen** (Low <11,2 · Moderate 11,2–21,3 · High 21,3–38,0 · Very High 38,0–50,0 · Extreme 50,0–70,0 · Very Extreme >70) | ~10 km, Europa/MENA — DACH durchgehend | Tagesschritte, MF bis +3 d | täglich | **WMS** (PNG/GeoTIFF) | ✅ `maps.effis.emergency.copernicus.eu/effis?service=WMS&request=GetCapabilities&version=1.3.0` — Layer `mf010.fwi`, `.ffmc`, `.dmc`, `.dc`, `.isi`, `.bui`, `.ranking`, `.anomaly`; `TIME 2018-01-01/2099-12-31`; CRS 4326/3035/3034/3857 | **nein** | **CC BY 4.0**, kommerziell ja | ✅ **Fees „none", AccessConstraints „None"** | ab 2018 | 🟢 **OK** |
| **GWIS FWI (ECMWF)** | EU/JRC + GEO | dieselbe Indexfamilie auf ECMWF-Basis, **bis +9 Tage** | ~8 km, **global** | Tagesschritte, +1…+9 d | täglich | WMS | ✅ `maps.effis.emergency.copernicus.eu/gwis?service=WMS&request=GetCapabilities&version=1.3.0` — `ecmwf.fwi`, `.ffmc`, `.dmc`, `.dc`, `.isi`, `.bui`, `.ranking`, `.anomaly`, `.anomaly_sigm`, `.anomaly_day`; zusätzlich `mf025.*`, `nasa_geos5.*` | **nein** | **CC BY 4.0**, ja | ✅ Fees „none", AccessConstraints „None" | ab 2018 | 🟢 **OK — DACH-Rückgrat** |
| **BAFU Waldbrandgefahr CH** | BAFU + Kantone | amtliche CH-Gefahrenstufe, **5 Stufen** (gering · mässig · erheblich · gross · sehr gross), Basis Canadian FWI, **kantonal nachbearbeitet** | Warnregionen/Kantone, CH, EPSG:2056 | ein Zeitpunkt (`instant`) | **Mo–Fr, kurz nach Mittag** | **GeoJSON** | ✅ STAC `data.geo.admin.ch/api/stac/v1/collections/ch.bafu.gefahren-waldbrand_warnung` → Asset ✅ `data.geo.admin.ch/ch.bafu.gefahren-waldbrand_warnung/gefahren-waldbrand_warnung/gefahren-waldbrand_warnung_2056.geojson` (`application/geo+json`) | **nein** ✅ | ✅ FSDI-Terms: „free of charge", „does not require registration", Vermerk `© Data: swisstopo` → hier `© BAFU`; **kommerziell nicht untersagt** | ✅ **Fair Use**, ⌀ 20.000 Nutzer/Tag = konform | nur aktueller Stand, kein Archiv | 🟡 **OK mit Auflagen** (s. W.6) |
| **GeoSphere AT** | GeoSphere Austria | — | — | — | — | — | ✅ `dataset.api.hub.geosphere.at/v1/datasets` → **kein fire/waldbrand/FWI-Datensatz**; ✅ `openapi.hub.geosphere.at/warnapi/v1/openapi.json` → 7 Warntypen, **kein Waldbrand** | — | — | 5 req/s · 240 req/h | — | ⛔ **NICHT VORHANDEN** |
| **BOKU Waldbrand-DB AT** | BOKU Wien | historische Ereignisse (>6.600) | Punkte, AT | Vergangenheit | — | Web-GIS | ✅ `fire.boku.ac.at/firedb/` | — | **keine Lizenzangabe**, kein Export | — | historisch | 🔴 **BLOCKIERT** (K4) |
| **BMLUK/BFW Risikokarte AT** | BMLUK, BOKU, BFW | statische Risikokarte, 5 Klassen, Gemeindeebene | Gemeinden, AT | **statisch** | — | — | ✅ `bmluk.gv.at/themen/wald/wald-und-naturgefahren/waldbrand/risikokarte-gemeindeebene.html` — **kein Download/WMS** | — | keine Lizenzangabe | — | — | 🔴 **BLOCKIERT** (K4) |
| **Brandenburg WBGK** | Landesbetrieb Forst BB | statische **Waldbrandgefahrenklassen** (`NZ.RiskZone`) — **nicht** die Tagesstufe | BB | statisch | — | WMS (PNG/GeoTIFF/GeoJSON/MVT) | `brandenburg-forst.de/geoserver/WBGK/wms?service=wms&request=GetCapabilities` | nein | **DL-DE/BY-2.0**, kommerziell ja | keine | — | 🟢 **OK (Ausbau)** |
| **Bayern `waldbrandgefahr.info`** | privat, Impressum-Platzhalter | DWD-WBI aufbereitet | — | — | — | JSON | `waldbrandgefahr.info/api/wbi.php` | — | **keine Lizenz** | — | — | 🔴 **BLOCKIERT** (K4) — DWD direkt nutzen |
| **`fire-technology.info` WBS-API** | Privatprojekt | Waldbrandstufen DE | — | — | — | JSON | `wbs-service.niklas-ullmann.de/` | **Key** | „kommerzielle Nutzung … untersagt" | — | — | 🔴 **BLOCKIERT** (K2+K4) |

### Die Skalen sind **nicht** ineinander umrechenbar

| Stufe | 🇩🇪 DWD WBI | 🇨🇭 BAFU | 🇦🇹 AT | 🇪🇺 EFFIS/GWIS FWI |
|---|---|---|---|---|
| 1 | **sehr geringe** Gefahr | **geringe** Gefahr | — | Low (< 11,2) |
| 2 | **geringe** Gefahr | **mässige** Gefahr | — | Moderate (11,2–21,3) |
| 3 | mittlere Gefahr | erhebliche Gefahr | — | High (21,3–38,0) |
| 4 | hohe Gefahr | grosse Gefahr | — | Very High (38,0–50,0) |
| 5 | sehr hohe Gefahr | sehr grosse Gefahr | — | Extreme (50,0–70,0) |
| 6 | — | — | — | Very Extreme (> 70,0) |

**„Geringe Gefahr" ist in DE Stufe 2 und in CH Stufe 1.** Eine Zuordnung nach Beschriftung
verschiebt die gesamte Schweizer Skala um eine Stufe. Zusätzlich sind die Modelle verschieden
(DWD-Bestandsmodell vs. Canadian FWI) und **beide behördlich überformt** (CH: Kantone entscheiden
über Übernahme/Änderung; DE: Landesbehörden veröffentlichen eigene amtliche Stufen).

✅ **In WB0 (2026-08-14) entschieden statt vermutet:** Die amtlichen **Farbwerte** sind nicht bloß
„unbestätigt" — das BAFU-GeoJSON führt **überhaupt kein Farbfeld**. Gemessene Eigenschaften:
`region_id, canton, level, name_de/fr/it/en, title_de/fr/it/en, valid_from` (143 Features,
`EPSG:2056`; `level` am Messtag mit 4 und 5 belegt). Die Farbe ist damit zwingend **unsere Zutat**
und wird als `colorOrigin: 'derived'` gekennzeichnet (Muster `warnings/warnField.ts:79`).
`valid_from` liefert die Referenzzeit für `dataAge` — genau das, was Risiko R4 (CH aktualisiert nur
Mo–Fr) verlangt.

## W.2 Aktive Brände (Faktorgruppe B)

| Quelle | Produkt | Auflösung / Latenz | Format | Zugriffs-URL | Auth | Lizenz | Check |
|---|---|---|---|---|---|---|---|
| **~~EFFIS Hotspots~~** | MODIS/VIIRS-Thermalanomalien; Attribute u. a. `acq_at, frp, confidence, night, satellite, ndvi, cci_class` | VIIRS 375 m / MODIS 1 km | **WFS → GeoJSON** | `maps.effis.emergency.copernicus.eu/effis?…typename=ms:viirs.hs…` | **nein** | CC BY 4.0 | ⛔ **NICHT AKTUELL — Bestand endet Okt 2021** (WB0 am 2026-08-14 gemessen: Antworten von 2019-11-13; OGC-Filter `acq_at > 2021-11-01` ⇒ 0 Features). Die „NRT"-Angabe stammte aus der Produktbeschreibung, nicht aus einem Abruf. **Nicht verwenden.** |
| **GWIS Hotspots — Fensterlayer** | `ms:viirs.hs.today` / `.week` (auch `.month`, `.season`; je Plattform `ms:viirs.hs.{suomi,n20,n21}.*`, ferner `modis`, `s3`, `all`) | VIIRS 375 m / MODIS 1 km, **live** | **WFS → GeoJSON** und WMS | ✅ `maps.effis.emergency.copernicus.eu/gwis?service=WFS&request=GetFeature&typename=ms:viirs.hs.today&version=1.1.0&outputformat=geojson` — 0,4–1,2 s, `ACAO: *`; DACH-BBOX `bbox=45.5,5.5,55.5,17.5,EPSG:4326` (WFS 1.1.0 = **lat,lon**) belegt; **`maxfeatures` hoch setzen** (ohne Angabe liefert der Dienst alles: `.week` 7.352 Features in DACH am 2026-08-15) | nein | CC BY 4.0 | 🟢 **OK — keylose Rückfallebene** für `fireHotspots` (Primär: FIRMS, §W.2.1) ⚠️ Attribute nur **`id, acq_at, CLASS`** — **kein `frp`**, kein `confidence`; die Plattform steckt im `CLASS`-Suffix (`_N` S-NPP, `_1` NOAA-20, `_2` NOAA-21). ⚠️ **Kein EFFIS-Filter:** die Menge ist NASA FIRMS 1:1 (E0: 99,4 % koordinaten- und minutengleich, inkl. aller Stahlwerke) — s. W.2.3 |
| **GWIS `ms:viirs.hs`** (ohne Fenster) | rollierendes Jahr | ab ca. −12 Monate | WFS | ✅ gemessen 14–48 s | nein | CC BY 4.0 | 🟡 **zu langsam für den Ladepfad** |
| **EFFIS Burnt Areas (Rapid Damage Assessment)** | `ms:modis.ba.poly` (alles ab 2016), Fensterlayer `ms:modis.ba.poly.{today,week,month,season}`, Jahreslayer `.2016…2025` — Polygone mit `id, FIREDATE (mit Uhrzeit), [FINALDATE nur Archiv], LASTUPDATE, COUNTRY, PROVINCE, COMMUNE, AREA_HA, BROADLEA, CONIFER, MIXED, SCLEROPH, TRANSIT, OTHERNATLC, AGRIAREAS, ARTIFSURF, OTHERLC (Summe 100 %), PERCNA2K, CLASS` | Polygone, **live** (LASTUPDATE vom Vortag) | WFS GeoJSON, **unkomprimiert** (kein `content-encoding`): DACH `.week` ~100 KB, `.season` ~1,4 MB, Archiv ~4,8 MB | ✅ `…/effis?service=WFS&request=GetFeature&typename=ms:modis.ba.poly.season&version=1.1.0&outputformat=geojson&bbox=45.5,5.5,55.5,17.5,EPSG:4326` — `ACAO: *`. ⚠️ **`maxfeatures` wirkt VOR dem BBox-Filter** und schneidet die JÜNGSTEN Flächen zuerst (V-224) — nie klein setzen | nein | CC BY 4.0 | 🟢 **OK — LIVE** (E0, 2026-08-15: DACH 1.270 Polygone 2016–2026, Saison 293, letzte Woche 26). Die frühere Angabe „Bestand endet 2018/2022" war ein Artefakt unseres `maxfeatures=800`. Kartierschwelle 2016–2019 ~20–50 ha, ab 2020/21 **0–2 ha** (Sentinel-2-Ära) |
| **NASA FIRMS Area API** | dieselben Detektionen, **attributvollständig** (`frp`, `confidence`, `bright_ti4/ti5`, `scan`/`track`, `daynight`, `satellite`) | VIIRS 375 m / MODIS 1 km, NRT ~3 h | CSV | `firms.modaps.eosdis.nasa.gov/api/area/csv/[MAP_KEY]/[SOURCE]/[west,south,east,north]/[days]` | **MAP_KEY** | NASA: „no restrictions on subsequent use or redistribution“ | 🟡 **BEWUSSTE AUSNAHME (Jan, 2026-08-14)** — s. W.2.1 |
| **NASA FIRMS WMS** | `fires_viirs_snpp` u. a., alle 15 min | — | WMS | `firms.modaps.eosdis.nasa.gov/mapserver/wms/fires/[MapKey]/` | **MAP_KEY** | — | 🔴 **BLOCKIERT** (K2) |
| **NASA FIRMS Regions-CSV** | `SUOMI_VIIRS_C2_Europe_24h.csv`, `_7d`, `J1_…`, `MODIS_C6_1_…` | 375 m / 1 km | CSV | `firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Europe_24h.csv` | **nein**, aber **kein `Access-Control-Allow-Origin`** — auch bei 200 mit echtem Origin (F0, 2026-08-14) | NASA: „no restrictions on subsequent use or redistribution" | 🔴 **KEIN Browser-Fallback** (V-218) — s. W.2.2 |
| **FIRMS nrt3-Archiv** | Tagesarchive | — | — | `nrt3.modaps.eosdis.nasa.gov/archive/FIRMS/` | **Registrierung** | — | 🔴 **BLOCKIERT** (K2) |
| **Swissfire (CH)** | Wald-/Flurbranddatenbank | Archiv | — | `wsl.ch/de/services-produkte/swissfire/` | **Passwort**, nur Behörden | — | 🔴 **BLOCKIERT** (K2) |
| **Waldbrandstatistik DE** | BLE/BMEL, Jahresstatistik Bundesland-Ebene | — | CSV/API laut BMEL | ⚠️ `open-data.ble.de/…` **robots-gesperrt** | — | Lizenz nicht ausgewiesen | ⚪ **UNKLAR** |

### W.2.1 Entscheidung Jan, 2026-08-14: FIRMS Area API als **Primärquelle** für aktive Brände

**Was sich ändert.** Die Constraint-Regeln dieser Session hatten die FIRMS Area API wegen
MAP_KEY-Zwang (K2) und Transaktionslimit (K3) als **blockiert** geführt. Jan hat sich am 2026-08-14
einen Schlüssel erstellt und die Quelle **ausdrücklich freigegeben** — sie ist ab sofort die
**Primärquelle** des Layers `fireHotspots`; GWIS bleibt als keyloser Fallback. Der Grund ist
inhaltlich zwingend: die GWIS-Fensterlayer führen live **nur** `id`, `acq_at`, `CLASS` (V-199), die
Area API führt den vollen Attributsatz — ohne den lässt sich weder Intensität noch Verlässlichkeit
einer Detektion darstellen.

**Die Ausnahme gilt nur für diese eine Quelle.** Alle übrigen 🔴-Einträge in §W bleiben blockiert;
insbesondere bleibt es dabei, dass für Quellen mit Key/Login **nicht** nach Umgehungen gesucht wird.

**Zwei Auflagen, ohne die die Freigabe nicht trägt:**

1. **Der Schlüssel darf nicht ins Bundle.** buscosun ist client-only (D-01) — eine Konstante im
   Frontend wäre im Netzwerk-Tab lesbar, und das Limit hängt am Schlüssel des Betreibers. Der
   Zugriff läuft über eine **Netlify Edge Function `/_firms/*`** nach dem Muster
   `netlify/edge-functions/dwd-grib.ts`, die `FIRMS_MAP_KEY` serverseitig aus einer
   Umgebungsvariable einsetzt. **Edge Functions sind STOPP-&-FRAGEN-Zone** (`CLAUDE.md`).
2. **Transaktionsbudget.** Dokumentiert sind **5.000 Transaktionen / 10 min pro Schlüssel**, große
   Anfragen zählen mehrfach. Ohne Proxy-Cache wäre jede Nutzersitzung ein eigener Satz Anfragen; mit
   Edge-Cache (TTL 15–30 min, NRT-Latenz liegt ohnehin bei ~3 h) sind es wenige Anfragen je
   Zeitfenster unabhängig von der Nutzerzahl. Das Budget ist damit kein Engpass — ohne den Proxy
   wäre es einer.

**Produkte und Parameter** (Doku am 2026-08-14 abgerufen): `SOURCE` ∈ `VIIRS_SNPP_NRT`,
`VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT` (dazu `_SP`-Varianten und MODIS). BBox-Reihenfolge
**west,south,east,north** — anders als beim GWIS-WFS, der in WFS 1.1.0 lat,lon erwartet. Tagesspanne
dokumentiert als 1–5, optionales Startdatum `YYYY-MM-DD`. Ausgabe **nur CSV**, kein JSON.

✅ **Am eigenen Schlüssel geprüft (F0, 2026-08-14 — `audit/waldbrand-firms.md` §4).** Die Antwort
führt **14 Spalten**:

```
latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
```

- **`type` ist NICHT enthalten.** Die Unterscheidung gegen statische Wärmequellen muss über
  Persistenz-Clustering kommen (F2). An 4.707 Detektionen über 5 Tage gegengeprüft: die Heuristik
  trennt sauber und findet die bekannten Dauerquellen (ThyssenKrupp Duisburg, voestalpine Linz);
  **39,3 % aller Detektionen** entfallen auf solche Zellen.
- **Neu gegenüber der Regions-CSV: `instrument`** (Wert `VIIRS`) an Position 9. Ein positions-
  basierter Parser läse ab dort um eine Spalte verschoben ⇒ **nach Spaltennamen parsen**.
- ⚠️ **`acq_time` kommt ohne führende Nullen** (`7`, `33`, `137`, `1230` — Bereich 7…2358), die
  Regions-CSV füllt dagegen auf `0048` auf. Ohne `padStart(4,'0')` liegt die Zeit still falsch.
- ⚠️ **`confidence` ist einbuchstabig** (`l`/`n`/`h`), nicht `low`/`nominal`/`high` wie in der
  Regions-CSV.
- `scan` gemessen 0,32–0,80 km (Median 0,42) · `frp` 0,22–372,86 MW (Median 3,09, stark rechtsschief).
- **Tagesspanne bestätigt 1–5** (`days=6` ⇒ `400 Invalid day range. Expects [1..5].`), optionales
  Startdatum funktioniert. Vertauschte lat,lon-BBox ⇒ **`200` mit 0 Zeilen**, kein Fehler.
- **CORS:** die Area API sendet im Erfolgsfall `Access-Control-Allow-Origin: *` (die Fehlerantwort
  und die statische Regions-CSV **nicht**, s. V-218). Der Proxy ist allein wegen des Schlüssels
  nötig — das genügt.
- **Transaktionspreis exakt vermessen: `2 × DAY_RANGE` je erfolgreicher Anfrage**, abgelehnte
  Anfragen und `mapkey_status` kosten nichts. Ein 7-Tage-Rückblick über drei Satelliten kostet
  **42 von 5.000** je Cache-Fenster.

### W.2.2 Zwei Korrekturen aus Phase F0 (2026-08-14, am eigenen Schlüssel gemessen)

**(1) Die keylose Regions-CSV ist kein Browser-Fallback — V-218.** Der Eintrag oben führte sie als
„200 OK verifiziert". Diese Verifikation war eine **Server-zu-Server**-Abfrage; der Host sendet
**kein `Access-Control-Allow-Origin`**, auch nicht bei 200 mit echtem Origin. Im Browser ist sie
damit unbrauchbar. Genau davor warnt `scripts/l0/probe-cors.mjs` im eigenen Kopfkommentar
(„Node erzwingt kein CORS … ein starker Hinweis, kein Beweis") — die Regel war da, sie wurde bei
der Erstaufnahme nicht angewandt. **Konsequenz:** die Degradationskette des Layers ist
**FIRMS Area API → GWIS**, mehr nicht. Im GWIS-Zustand entfallen `frp` und `confidence`; die
Darstellung fällt auf einheitliche Punkte zurück und der Steckbrief sagt das.

**(2) `DAY_RANGE` deckelt bei 5, das Ereignis-Clustering braucht 7 — V-219.** Die Dokuangabe
„1–5" ist bestätigt. Ein 7-Tage-Fenster erfordert daher **zwei Abrufe je Satellit** (5 + 2 mit
`date`-Parameter), bei drei VIIRS-Strömen also **sechs Upstream-Abrufe**. Zwei Folgerungen:

- **Deduplizierung gehört vor den Merge, nicht danach**, und sie ist **exakt**, nicht unscharf:
  Schlüssel `(satellite, lat, lon, acq_date, acq_time)`. Eine unscharfe Zusammenlegung über
  Satelliten hinweg („gleicher Ort ±200 m") wäre ein Fehler — zwei Satelliten, die dieselbe
  Fläche 40 Minuten versetzt sehen, sind **zwei Beobachtungen**, und genau deren Anzahl trägt die
  Persistenz-Heuristik in F2.
- **Das Transaktionsbudget bleibt irrelevant.** Sechs Abrufe je 30-min-Cachefenster sind ~2 pro
  10 Minuten gegen ein Limit von 5.000 — rund 0,04 %. Eine nach Fensteralter gestaffelte TTL
  wäre verfrühte Optimierung; die einheitlichen 30 Minuten bleiben.

**(3) Der Client fragt eine feste BBox ab, nie den Viewport.** Die Edge-Hülle erlaubt jede
Teilbox innerhalb DACH — leitete der Client die BBox aus dem Kartenausschnitt ab, erzeugte jedes
Verschieben einen neuen Cache-Schlüssel und damit einen neuen Upstream-Abruf. Es gilt **eine
kanonische, zeichengleiche DACH-BBox** je Abruf; die räumliche Einschränkung passiert im Client.

**Für DACH existiert keine offene behördliche Echtzeit-Brandquelle.** Echtzeit kommt ausschließlich
vom Satelliten. Das ist im Steckbrief auszuweisen: Satellitendetektion ≠ Feuerwehreinsatz; kleine
Bodenfeuer unterhalb der Pixelgröße bleiben unsichtbar, Überflüge sind lückenhaft.

### W.2.3 EFFIS/GWIS als Sekundärquelle — drei Korrekturen aus Phase E0 (2026-08-15, gemessen)

Diagnose: `audit/waldbrand-effis.md`; Sonde `scripts/l0/probe-waldbrand-effis.mjs`;
Belege `audit/l0/waldbrand-effis-*.json`.

**(1) Der GWIS-Hotspot-Layer ist KEIN gefilterter Datensatz — er ist NASA FIRMS 1:1.** Der Kickoff
nahm an, GWIS ergänze EFFIS' Wissensfilter (Landbedeckung, Abstand zu Kunstflächen). Gemessen:
99,4 % (24 h) bzw. 98,7 % (7 d) aller FIRMS-Detektionen stehen **koordinaten- und minutengleich**
in `ms:viirs.hs.*` (Distanz p90 = 0 m, Δt = 0 s), null GWIS-Detektionen ohne FIRMS-Partner, und
**alle sechs geprüften Stahlwerke** (Duisburg 125/129, Linz 73/74, Salzgitter 118/119, Dillingen
50/51, Eisenhüttenstadt 19/20, Bremen 60/62) sind enthalten. Die 0,6 % Differenz sind fehlende
Granulate (12 der 18 aus **einem** SNPP-Überflug), kein Kriterium. **Folge:** ein Abzeichen „von
EFFIS als Vegetationsbrand eingestuft" aus dem bloßen Vorkommen in GWIS wäre falsch — **nicht
gebaut.** Satelliten-Parität (S-NPP/NOAA-20/NOAA-21 = `CLASS`-Suffix `_N/_1/_2`) und Fensterparität
(„today" = Vortag 00:00 UTC → jetzt; „week" = heute − 7 d 00:00 UTC → jetzt) sind dagegen gegeben.

**(2) EFFIS' Prüfung sitzt in der Brandflächenkartierung — und die ist live** (Tabelle oben,
V-224). Eine FIRMS-Detektion, die räumlich (Pixeltoleranz 400 m) **und** zeitlich (±14 Tage um
`FIREDATE`) in einer kartierten Fläche liegt, wird als **„Brandfläche von EFFIS kartiert
(bestätigt)"** ausgewiesen — das einzige „bestätigt" der Waldbrand-Ansicht, immer mit Fläche, Datum
und Stand (`src/fire/fireCorroboration.ts`). Fehlende Kartierung ist **nie** ein Gegenbeleg. Am
2026-08-15 lagen 545 von 7.152 Detektionen in 20 der 26 Wochenflächen (Piedimulera IT 302 ha: 162;
Oberharz DE 3 ha: 14; Sundern DE 7 ha: 10). Die Kartierung **hebt die Ortsfest-Vermutung auf**
(F2): 24 graue Detektionen (Varallo IT, 47 ha, 5 Tage ortsfest) wären sonst wie ein Stahlwerk
gezeichnet worden.

**(3) Index-Layer der ECMWF-Familie:** `ecmwf.fwi/.ranking/.dc/.isi/.ffmc/.anomaly` rendern für
DACH (6 Klassen, 89 % Landpixel), TIME `2018-01-01/2099-12-31`, Horizont heute + 8 (gemessen 08 UTC;
Doku „1 to 9 days"); `mf025.fwi` + 2, `nasa_geos5.fwi` + 6. **Kein Layer ist `queryable`** —
`GetFeatureInfo` ⇒ ServiceException, es gibt keine Punktwerte. Klassengrenzen je Code aus
`GetLegendGraphic` (`audit/waldbrand-effis.md` §4.3). **Referenzperiode `ranking`/`anomaly`:**
EFFIS/GWIS sagt „a historical series of approximately 40 years" und nennt keine Jahre; die
zugrunde liegende JRC/ECMWF-ERA5-Klimatologie (Vitolo et al. 2020) umfasst 1980–2018 — so wird es
beschriftet, mit der Unschärfe.

## W.3 Trockenheit und Bodenfeuchte (Faktorgruppe C)

| Quelle | Produkt / Größe | Auflösung / Abdeckung | Takt | Format | Zugriff | Auth | Lizenz | Check |
|---|---|---|---|---|---|---|---|---|
| **ICON-D2 `smi` / `w_so`** | Soil Moisture Index bzw. Bodenwassergehalt **als Modellfeld** | 2,2 km, D2-Domäne (DE + Alpenraum) | 3-h-Läufe, stündliche Schritte | GRIB2 | ✅ `opendata.dwd.de/weather/nwp/icon-d2/grib/00/smi/`, `…/w_so/` | nein | CC BY 4.0 | 🟢 **OK — billigste DACH-Option** |
| **DWD Bodenfeuchte-Raster** | AMBAV 2.0, ‰ nFK, Varianten **`pine`, `spruce`, `composite`**, beech/oak/grass/maize/wheat; 0–200 cm in 10-cm-Schichten | **1 km**, DE, EPSG:31467 | **monatlich** („am 3. jedes Monats"), Latenz bis ~1 Monat | **NetCDF**, ~82–86 MB je Jahr+Schicht | `opendata.dwd.de/climate_environment/CDC/grids_germany/daily/soil_moisture/pine/2026/` | nein | CC BY 4.0 | 🟡 **OK, aber MVP-untauglich**: NetCDF-Decoder = neue Abhängigkeit (D-06) + Dateigröße + Monatstakt |
| **EDO/GDO SMI + SMA** | `smian`, `smang`, `smand` — Bodenfeuchte-**Anomalie** in σ (−4…+4) | ~1 arcmin (≈1,5–2 km), **Europa** | 3× pro Monat | **WMS** + NetCDF/GeoTIFF | `drought.emergency.copernicus.eu/api/wms?REQUEST=GetCapabilities&SERVICE=WMS&VERSION=1.1.1` — AccessConstraints „No constraints", Fees „No fees" | **nein** | **CC BY 4.0** (`…/data/Drought_Observatories_datasets/copyright.txt`) | 🟢 **OK — einzige DACH-einheitliche Option** |
| **EDO CDI** | Combined Drought Indicator, Klassen Watch/Warning/Alert/Recovery | ~1 arcmin, Europa | 3×/Monat | WMS | `…/api/wms` Layer `cdinx`, `cdiad`, `cdirc` | nein | CC BY 4.0 | 🟢 **OK (Ausbau)** |
| **UFZ Dürremonitor** | SMI 0–25 cm / Gesamtboden, nFK | 1 km, DE | täglich | NetCDF/PNG | `files.ufz.de/~drought/SM_L02_daily_n14.nc` u. a. | nein | **„im Rahmen von Wissenschaft und Forschung sowie für redaktionelle Zwecke"** — Rohdaten ungeregelt; Disclaimer „Versuchsläufe" | 🔴 **BLOCKIERT** (K4) |
| **ERA5-Land (CDS)** | volumetrische Bodenfeuchte | 9 km, global | stündlich | GRIB/NetCDF | `cds.climate.copernicus.eu/datasets/reanalysis-era5-land` | **Konto + `.cdsapirc` + manuelle Zustimmung** | CC-BY | 🔴 **BLOCKIERT** (K2) |
| **CGLS Soil Water Index 1 km** | SWI | 1 km, Europa | täglich, ≤2 d Latenz | — | nur über CDSE | **Konto + Quoten** | — | 🔴 **BLOCKIERT** (K2+K3) |
| **RADOLAN SF** | rollierende 24-h-Niederschlagssumme (gemessen) | 1 km, DE | **stündlich** | bin.bz2 / HDF5 | `opendata.dwd.de/weather/radar/radolan/sf/` | nein | CC BY 4.0 | 🟢 **OK** — Basis für Trockenperiode/Defizit |
| **HYRAS-DE-PR v6-1** | Tagesniederschlag, Klimareferenz | 1 km, DE | täglich, Jahresdatei | NetCDF (~31 MB) | `opendata.dwd.de/climate_environment/CDC/grids_germany/daily/hyras_de/precipitation/` | nein | CC BY 4.0 | 🟡 OK, aber NetCDF (D-06) |
| **REGNIE** | — | — | — | — | eingestellt („replaced by HYRAS-PRE-DE", 01/2022) | — | — | ⛔ **EINGESTELLT** |
| **DWD `evapo_p`** | potenzielle Verdunstung | 1 km, DE | — | .tgz | Archiv endet **01/2019** | nein | CC BY 4.0 | ⛔ **VERALTET** |
| **GeoSphere SPARTACUS** | RR/TN/TX, 1 km täglich, ab 1961 | 1 km, AT | täglich | NetCDF/GeoJSON | `data.hub.geosphere.at/dataset/spartacus-v2-1d-1km` | nein | CC BY 4.0 | 🟡 OK, **aber 5 req/s · 240 req/h** ⇒ Edge-Proxy = STOPP-Zone |
| **MeteoSchweiz OGD** | Bodenmessungen/Radar/Prognose | CH | — | Dateidownload (**keine API vor Ende 2026**) | `opendatadocs.meteoswiss.ch/` | nein | „uneingeschränkt nutzbar, Quelle angeben" | 🟡 OK — **kein** Bodenfeuchte-/Dürreprodukt |
| **drought.ch** | CH-Trockenheitsplattform (BAFU+WSL) | CH | — | — | `drought.ch/de/` — kein Download/WMS/Lizenz auffindbar | — | — | ⚪ **UNKLAR** |

## W.4 Vegetation, Brennmaterial, Kontext-Geometrien (Faktorgruppen E + G)

| Quelle | Produkt | Auflösung | Zugriff | Auth | Lizenz | Check |
|---|---|---|---|---|---|---|
| **EDO fAPAR-Anomalie** | `fpanv` (VIIRS) — Vegetationsstress in σ, 10-Tages-Dekaden | ~1 km, Europa | `drought.emergency.copernicus.eu/api/wms` | nein | CC BY 4.0 | 🟢 **OK — Ersatz für NDVI** |
| **EFFIS `fuel_map`** | European Fuel Map: 42 Vegetationskomplexe → 13 NFFL-Klassen (Anderson 1982), 2017 | ⚠️ unbestätigt | GWIS/EFFIS WMS, Layer `fuel_map` ✅ in Capabilities | nein | CC BY 4.0 | 🟢 **OK** |
| **CORINE Land Cover (EEA discomap)** | CLC 1990–2018, 44 Klassen, MMU 25 ha | 100 m | `image.discomap.eea.europa.eu/arcgis/services/Corine/CLC2018_WM/MapServer/WMSServer?request=GetCapabilities&service=WMS` — Fees „No Condition Apply", AccessConstraints „No Limitation" | **nein** | CLMS-Datenpolitik: offen, kommerziell ja | 🟢 **OK** |
| **CLC+ Backbone 2021** | 11 Klassen | **10 m** | `image.discomap.eea.europa.eu/arcgis/rest/services/CLC_plus/CLMS_CLCplus_RASTER_2021_010m_eu/ImageServer` (ArcGIS REST `exportImage`, **kein WMS**) | nein | wie oben | 🟢 **OK (Ausbau)** |
| **HRL Dominant Leaf Type 2018** | Nadel/Laub, Werte 0–2 | **10 m**, EPSG:3035 | `image.discomap.eea.europa.eu/arcgis/rest/services/GioLandPublic/HRL_DominantLeafType2018/ImageServer` | nein | CLMS; ⚠️ `copyrightText` im Dienst **leer** | 🟢 **OK** |
| **CLMS-Portal-Download** (CLC, HRL, CGLS) | — | — | `land.copernicus.eu` | **EU Login** („The registration is required to download data") | Lizenz selbst unproblematisch | 🔴 **BLOCKIERT** (K2) — Ersatz: discomap |
| **DLR Tree Species DE 2022** | 10 Baumartengruppen | **10 m**, DE, 2022 | `geoservice.dlr.de/eoc/land/wms` (AccessConstraints NONE, Fees NONE); ⚠️ Layername `TREE_SPECIES_DE_2022` **unbestätigt** | nein | **CC BY 4.0** | 🟢 **OK** |
| **Thünen Dominant Tree Species 2017/18** | 11 Artengruppen, Genauigkeit 87,1 % rein / 75,5 % gesamt | ⚠️ 10 m unbestätigt | `atlas.thuenen.de/catalogue/…/dominant-tree-species-for-germany-20172018.html` | nein | **CC BY 4.0**, Use Constraints „None" | 🟢 **OK** |
| **FNEWS (Thünen)** | Kalamitäts-/Schadflächen 2018–2025, MMU 0,1 ha | Sentinel-2 | `fnews-access.bwi.info/geoserver/ows?service=WMS&version=1.3.0&request=GetCapabilities` — Fees NONE | nein | **Widerspruch:** WMS sagt **CC-BY-SA 4.0**, Startseite sagt **dl-de/by-2-0**; Lizenzseiten 404 | 🟡 **UNKLAR** — erst nach Rückfrage `fnews@thuenen.de`; ShareAlike schlüge auf abgeleitete Kacheln durch |
| **Waldmonitor Deutschland** | Waldzustand, Baumarten, 10 m | 10 m | `waldmonitor-deutschland.de` | — | **keine Lizenz**, kein dokumentierter Zugang | 🔴 **BLOCKIERT** (K4) |
| **BKG Open Data** | **CORINE 2012/15/18/21 für DE** + VG250 | — | `daten.gdz.bkg.bund.de/produkte/vg/vg250_ebenen_0101/aktuell/` (offenes Listing) | nein | **dl-de/by-2-0**, Vermerk `© BKG (Jahr) dl-de/by-2-0`, Link auf bkg.bund.de | 🟢 **OK (DE)** |
| **OSM Wald (Geofabrik)** | `landuse=forest`, `natural=wood` | — | `download.geofabrik.de/europe/{germany,austria,switzerland}.html`, tägliche `.osm.pbf` | nein | **ODbL 1.0** — gerenderte Ebene = *Produced Work* (nur Attribution); **abfragbares GeoJSON-Endpoint ⇒ ShareAlike auf die abgeleitete Datenbank** | 🟢 **OK als Renderebene** |
| **Overpass API (öffentlich)** | — | — | — | nein | — | 🔴 **BLOCKIERT** (K3: ~10.000 Req./Tag, 1 GB/Tag, HTTP 429) |
| **Natura 2000 (EEA)** | Schutzgebiete, 3 Layer | — | `bio.discomap.eea.europa.eu/arcgis/services/ProtectedSites/Natura2000Sites/MapServer/WMSServer?request=GetCapabilities&service=WMS` — Fees/AccessConstraints leer | nein | EEA-Reuse: „free of charge, for commercial or non-commercial purposes" | 🟢 **OK** — **CH nicht enthalten** (Nicht-EU) |
| **Global WUI v1.1** | Wildland-Urban Interface, ~2020 | **10 m**, global, Regions-ZIP „EU" | `zenodo.org/records/7941460` | nein | **CC BY 4.0** | 🟢 **OK (Ausbau)** |

## W.5 Faktorgruppe D — was ICON-D2 schon kann, und wo die Grenze liegt

| FWI-Baustein | ICON-D2-Feld | Status im Repo |
|---|---|---|
| Temperatur 12 UTC | `t_2m` | ✅ angebunden (`iconD2TempSource.ts:180`) |
| Relative Feuchte 12 UTC | **`relhum_2m`** | ✅ auf opendata vorhanden — **im Repo nicht angebunden** (neuer Ein-Feld-Loader nach Muster `iconD2Lpi.ts`) |
| Wind 10 m | `u_10m`/`v_10m`, `vmax_10m` | ✅ angebunden (`iconD2WindSource.ts:279-280`, `iconD2GustSource.ts:92`) |
| 24-h-Niederschlag | `tot_prec` | ✅ angebunden (`iconD2Precip.ts:461`) |
| Bodenfeuchte | `smi`, `w_so` | ✅ vorhanden, nicht angebunden |
| Brennstoff-Proxy | `plcov`, `lai`, `rootdp` | ✅ vorhanden, nicht angebunden |

**Die Grenze — ehrlich benannt:** Die FWI-Codes **FFMC, DMC und DC sind kumulativ**; sie tragen den
Vortageswert fort (Zeitkonstanten grob 2/3 Tag, 12 Tage, 52 Tage). Ein echtes FWI braucht also einen
Spin-up von Wochen und einen Zustand über Tage hinweg. **D-01 (kein Backend) und die ~24-h-Vorhaltung
der ICON-D2-Läufe auf opendata schließen das aus.** ⇒ Aus ICON-D2 lässt sich **kein FWI** rechnen,
sondern nur ein **gedächtnisloser Feuerwetter-Treiber** (Temperatur, Feuchte, Wind, Niederschlag der
laufenden Vorhersage). Der ist als **Zusatzsignal** wertvoll, ist aber **kein Index und kein
Warnprodukt** — und muss so beschriftet werden (analog zum bestehenden Rotations-Layer).
Die kumulativen Codes kommen fertig gerechnet von **EFFIS/GWIS** (`ecmwf.ffmc/.dmc/.dc/.isi/.bui`).

> **Nachtrag WF0 (2026-08-18, `audit/waldbrand-forecast.md`):** Die Grenze gilt **clientseitig**. Mit
> dem inzwischen von Jan gesetzten täglichen GitHub-Actions-Batch (Zustand in R2) lassen sich FFMC₁₂/DMC/DC
> **an Stationen** fortschreiben; Kaltstart aus `opendata.dwd.de/climate_environment/CDC/observations_germany/climate/hourly/{air_temperature,precipitation,wind}/recent/`
> (~600 Stationen, ~500 Tage, täglich ~08:40 UTC, CC BY 4.0 — heute geprüft). Stündliche FFMC/ISI/FWI aus
> den fusionierten Stundenwerten sind Stand der Wissenschaft (Van Wagner 1977; `cffdrs::hffmc`; Rodell
> et al. 2024). **Korrektur zu W.0 (2):** Der DWD-WBI ist **kein** FWI mit deutschen Schwellen, sondern ein
> eigenes stündliches Bestandsmodell in FWI-Struktur (DWD-Erläuterung 2020) — die vier FWI-Eingänge sind
> auch seine, aber ein „WBI-Nachbau" ist nicht möglich. **Korrektur zu W.1:** die heutige
> `…_stations_list.txt` zählt **645** Stationen (WB0 maß 484) — bei WF1 neu messen. EFFIS bleibt Bild
> ohne Zahlenwert (`gwisFwi.ts:4-11`).

## W.6 Zusammenfassung Constraint-Check

**🟢 Freigabefähig (alle vier Filter erfüllt):** DWD WBI · DWD GLFI · GWIS/EFFIS FWI + Komponenten ·
EFFIS Hotspots (WFS) · EFFIS Burnt Areas · EFFIS `fuel_map` · EDO `smian`/`smand`/`fpanv`/`cdinx` ·
ICON-D2 `relhum_2m`/`smi`/`w_so`/`plcov`/`lai` · RADOLAN SF · EEA CLC2018 + CLC+ + HRL DLT ·
DLR Tree Species DE · Thünen Tree Species · Natura 2000 · BKG · OSM/Geofabrik (als Renderebene) ·
Global WUI · Brandenburg WBGK.

**🟡 Freigabefähig mit ausdrücklicher Auflage:**
- **BAFU CH** — STAC-Feld meldet `"license": "proprietary"`; das ist ein STAC-Platzhalter. **Autoritativ ist
  der geocat-Record je Layer** (in A0-6 am 2026-08-15 gemessen: `ch.bafu.gefahren-waldbrand_warnung` →
  geocat `3f8bc20d-db07-4008-8465-4cc8efa6c84f`, `…praeventionsmassnahmen_kantone` →
  `5deca805-ace4-4401-9750-cb1b02f5a292`; beide `MD_LegalConstraints.otherConstraints` =
  **„Opendata OPEN: Freie Nutzung." / „Open use."**, Anker `opendata.swiss/en/terms-of-use/#terms_open`).
  Die FSDI-Terms (kostenlos, ohne Registrierung, kommerziell nicht untersagt) bleiben ergänzend. **Auflage:**
  Fair-Use einhalten (ein Abruf je Sitzung, TTL ≥ 1 h, kein Polling) und den Lizenzstatus in
  `scripts/seo/licenses.mjs` mit dieser Begründung dokumentieren.
- **FIRMS Area API** — seit 2026-08-14 freigegebene Ausnahme (s. W.2.1); trägt **nur** mit
  Edge-Function-Proxy und Schlüssel in der Umgebungsvariable, nie mit Schlüssel im Bundle.
- ~~**FIRMS Regions-CSV** als Fallback~~ — **zurückgezogen 2026-08-14 (V-218):** der Host sendet kein
  ACAO, im Browser also unbrauchbar. Der einzige reale Fallback des Hotspot-Layers ist **GWIS**.
- **DWD Bodenfeuchte-Raster / HYRAS** — Lizenz einwandfrei, aber NetCDF ⇒ D-06.
- **GeoSphere SPARTACUS** — CC BY 4.0, aber 240 req/h ⇒ Edge-Proxy ⇒ STOPP & FRAGEN.
- **FNEWS** — Lizenzwiderspruch, erst nach Klärung.

**🔴 Blockiert, nicht umgehen:** FIRMS WMS/nrt3 (Key bzw. Registrierung; die **Area API** ist die eine freigegebene Ausnahme, W.2.1) · UFZ Dürremonitor (nur
Wissenschaft/Redaktion) · CDS/ERA5-Land, CDSE, CLMS-Download (Konto + Quoten) · Overpass öffentlich
(Limits) · blitzortung.org (**explizite Non-Commercial-Klausel**) · ALDIS (264 €/370 € je Abfrage) ·
EUMETSAT MTG-LI (Key) · MeteoAlarm OGC-EDR-API (Bearer-Token) · Swissfire (Passwort) ·
Waldmonitor Deutschland, `waldbrandgefahr.info`, `fire-technology.info`, BOKU-DB, BMLUK-Risikokarte
(keine Lizenz).

**⚠️ Nicht prüfbar (robots.txt / Binärantwort — keine Umgehung versucht):** `maps.dwd.de`-Layerliste
(Blitzdichte — im Repo bereits über `src/sources/dwdLightning.ts` produktiv, daher kein neuer Bedarf) ·
`dwd.de`-Produktseiten · `govdata.de`-Suche · `open-data.ble.de` · MeteoAlarm-Atom-Feeds im
Live-Inhalt · BAFU-GeoJSON-Feldstruktur (gzip-Antwort).

**Blitz für DACH:** Es gibt **keine** Blitzquelle, die alle vier Filter erfüllt. Für Waldbrand ist
das verschmerzbar — Blitz ist die sekundäre Zündquelle, und der bestehende DE-Layer `lightning`
(`src/sources/dwdLightning.ts`) deckt den deutschen Teil bereits ab.

## W.7 Attributionspflichten, die daraus folgen

| Quelle | Pflichttext |
|---|---|
| DWD (verändert/abgeleitet) | `Datenbasis: Deutscher Wetterdienst, Rasterdaten bildlich wiedergegeben` — unmittelbar an der Information (s. `docs/API.md` §Attribution; V-140 bleibt offen) |
| EFFIS / GWIS | `© European Union, Copernicus Emergency Management Service — EFFIS/GWIS (CC BY 4.0)`, Änderungen kenntlich machen |
| BAFU / geo.admin.ch | `© BAFU` bzw. `© Data: swisstopo` |
| EDO/GDO | `© European Union, 1995–2026 (CC BY 4.0)` |
| EEA (CLC, HRL, Natura 2000) | `Generated using European Union's Copernicus Land Monitoring Service information` / `© EEA` |
| DLR | `© DLR/EOC — Tree Species Germany 2022 (CC BY 4.0)`, Zitat Wegler et al. (2025) |
| BKG | `© BKG (Jahr) dl-de/by-2-0 (Daten verändert)`, „BKG" auf `bkg.bund.de` verlinkt |
| OSM | `© OpenStreetMap contributors (ODbL)` |
| NASA FIRMS (Primärquelle aktive Brände) | `NASA FIRMS / LANCE` — Detektionen VIIRS 375 m |

Alle neuen Quellen müssen in `scripts/seo/licenses.mjs` §`NON_MODEL_SOURCES` eingetragen werden,
sonst fehlen sie auf `/lizenzen/`.

## W.8 Was die Messung an dieser Matrix korrigiert hat (Phase WB0, 2026-08-14)

> Die Tabellen oben stammen aus der Recherche vom 2026-08-14 (Gate GWB-A) und beruhten teils auf
> Produktbeschreibungen. Phase **WB0** hat jede kritische Angabe mit echtem `Origin: https://buscosun.com`
> nachgemessen. Belege: `audit/l0/cors-waldbrand.json`, `audit/l0/waldbrand-payloads.json`,
> Diagnose `audit/waldbrand-transport.md`, Protokoll `tests.md` §WB-T0.
> **Bei Widerspruch gilt ab hier die Messung, nicht die Recherche.**

**Bestätigt:**

- **CORS ist kein Blocker.** `maps.effis.emergency.copernicus.eu` sendet `ACAO: *` auf WMS **und**
  WFS, Preflight 200; `GetMap ecmwf.fwi` liefert ein PNG 512×512 in 36–364 ms. `EPSG:3857` wird
  angeboten, `TIME=2018-01-01/2099-12-31`, 231 Layer davon 24× `ecmwf.*`. **Kein neuer Rewrite nötig.**
- EDO (`*, *`), EEA und DLR (origin-spiegelnd) antworten alle mit CORS; `opendata.dwd.de` erwartungs-
  gemäß ohne — dort genügt der bestehende `/_dwd_opendata`-Rewrite.
- Das **DWD-1-km-Raster existiert weiterhin nicht** (404, Eintrag fehlt im Listing von
  `grids_germany/daily/` mit seinen 11 Verzeichnissen). W.0 Befund 1 bleibt gültig.
- `relhum_2m` liegt im ICON-D2-Verzeichnis (98 Dateien je Lauf). W.5 bleibt gültig.
- Die WBI/GLFI-Spalten sind wie beschrieben: `StationsID;Termin;wbi_0…wbi_6` bzw. `glfi_0…glfi_6`.

**Korrigiert:**

| Angabe in dieser Datei | Messung | Eintrag |
|---|---|---|
| EFFIS `ms:viirs.hs` sei „NRT" und „Primärquelle" | Bestand endet **Okt 2021** | `V-198` — Primärquelle ist **GWIS** `.today`/`.week` |
| Hotspots trügen `frp, confidence, satellite` | live nur **`id, acq_at, CLASS`** | `V-199` — `frp` wird nicht gezeigt, die Lücke wird benannt |
| WBI habe „~370–500 Stationen" | **484**, als **484 Einzeldateien**; Stationsliste mit den Koordinaten in §W.1 nicht erwähnt | `V-200` — Ladestrategie in `plan.md` §WB2 |
| ⚠️ BAFU-Farbwerte „unbestätigt" | die Features tragen **gar kein `color`**: `region_id, canton, level, name_*, title_*, valid_from` | `V-201` — `colorOrigin: 'derived'`, `valid_from` als `dataAge`-Referenz |

**Betriebsgrenzen, die keine Recherche liefern konnte** (`V-202`): EFFIS-WFS `GetCapabilities`
80 s / 86 s / Abbruch nach 150 s · GWIS `ms:viirs.hs` ohne Fenster 14–48 s · GWIS-Fensterlayer
0,6–1,9 s · GWIS `GetMap` 32–364 ms · BAFU-GeoJSON 534 KB in 0,1–0,2 s mit servereigenem
`Cache-Control: max-age=7200` (die Fair-Use-Auflage ist damit die Vorgabe der Quelle) ·
`data.geo.admin.ch` beantwortet **OPTIONS mit 403** ⇒ nur Simple Requests, kein `If-None-Match` ·
EDO sendet `access-control-allow-origin` **doppelt**, was ein Browser als ungültig werten kann —
vor WB4 im echten Browser gegenzuprüfen, denn Node erzwingt kein CORS.

### W.9 Behördendaten als Bestätigungs- und Kontextebene (Phase GWBA1, 2026-08-15, gemessen)

Diagnose `audit/waldbrand-behoerden.md`, Sonde `scripts/l0/probe-behoerden.mjs`.

| Quelle | Rolle | Zugriff / Format | Lizenz | Check |
|---|---|---|---|---|
| **BBK MoWaS / NINA** (`warnung.bund.de/api31/mowas/mapData.json` + `/warnings/{id}.json|.geojson`) | Ereignisbestätigung DE | JSON (CAP-Struktur), **kein ACAO** ⇒ Edge Function `/_nina/*` zwingend; Eventcodes `profile:DE-BBK-EVENTCODE` = `BBK-EVC-NNN` (Brand: 077/034/030/011/010, 32/40 in der Stichprobe); **Geometrie je Warnung als Polygon-GeoJSON**, ARS in `warnVerwaltungsbereiche`; `sender_langname` = ausstellende Stelle | **keine Lizenzangabe** (§ 5 UrhG amtliches Werk) | 🔴 **Jans Entscheidung 2026-08-15: NICHT auswerten** — Grenznutzen neben der EFFIS-Kartierung klein, „keine unklare Lizenz"; Flag `MOWAS_ENABLED=false` + Vertrag bleiben (Flag-Umlegen, falls das BBK eine Lizenz erklärt); stattdessen **Deep-Link** `warnung.bund.de/meldungen`. Messbefunde für später: `mapData.json` Felder `id, version, startDate, severity, urgency, type, i18nTitle, transKeys`; Detail = CAP (`identifier, sender, sent, status, msgType, scope, code, references, info[]{language, category, event, urgency, severity, certainty, eventCode[], headline, description, instruction, parameter[], area[]}`); Eventcodes `profile:DE-BBK-EVENTCODE` → `BBK-EVC-NNN`; ARS 12-stellig in `parameter[warnVerwaltungsbereiche]`; `.geojson` liefert Polygon/MultiPolygon `[lon,lat]` je Warnung (40/40); Textfelder ISO-8859-Anmutung in der Sonde — Charset prüfen |
| **GeoSphere Warn-API** (`warnungen.zamg.at/wsapp/api/getWarningsForCoords`) | Kontext AT (Hitze/Gewitter/Sturm ⇒ plausibel, nie bestätigt) | JSON, `ACAO: *`, kein Key, keine RL-Header gemessen; Geometrien **EPSG:31287**; Typen 1–7 (kein Waldbrand), Stufen 1–3 | CC BY 4.0 | 🟢 OK — Deckel 20 Abrufe/Sitzung, Cache 15 min, kein Durable-Cache |
| **Copernicus EMS Rapid Mapping** (`rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/`) | Abzeichen (Großschadensaktivierung ⇒ bestätigt) | JSON, `ACAO: *`; `code, countries[], eventTime, name, centroid (WKT), category, closed` | EU/Copernicus (Namensnennung) | 🟡 **interne API** — schematolerant, Fehler ⇒ kein Abzeichen |
| **BKG VG250 WFS** | ARS → Geometrie | — | dl-de/by-2.0 | ⚪ **nicht gebraucht** (MoWaS liefert Geometrie); Rückfall dokumentiert |
| **AT Landes-Einsatzübersichten** (OÖ `einsaetze.ooelfv.at`, Bgld `einsatz.lsz-b.at`), Tirol, Steiermark, ORF-RSS | Verifikation beim Nutzer | nur **Deep-Link** | keine Lizenz / NC / Anti-Automatisierung | 🔴 kein Abruf, kein Proxy (§ 76c UrhG) |
| **Alertswiss** | Link CH | — | CC BY-NC-SA | 🔴 nur Link |
| **BAFU-Layer (beide)** | Gefahrenstufe / Massnahmen CH | STAC/GeoJSON | **geocat: „Opendata OPEN: Freie Nutzung."** (STAC-`proprietary` = Platzhalter) | 🟢 korrigiert |

### W.10 Brandflächen-Panel und eigene Kartierung — Lizenzcheck der Kandidaten (Phase BP0, 2026-08-17)

Diagnose `audit/brandflaechen-panel.md` §2.8. Auftrags-Constraints: nur offene, kommerziell nutzbare
Daten; **kein** Key-Zwang, Rate-Limit, NC, Freemium, Testphase. Was dagegen verstößt, ist BLOCKIERT und
wird nicht umgangen. Nur die Zeilen, die in §W.1–W.9 noch nicht stehen:

| Quelle | Rolle | Lizenz | Key / Limit | Check |
|---|---|---|---|---|
| **Sentinel-2 L2A** via Earth Search STAC (`earth-search.aws.element84.com/v1`, `sentinel-2-c1-l2a`) + AWS-Open-Data-COGs (`e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com`) | Eingang der eigenen dNBR-Kartierung (Batch) | Copernicus Sentinel Legal Notice (frei, kommerziell, Attribution) | kein Key; STAC gemessen `200` + `ACAO: *`; COG-Range gemessen `206`, `accept-ranges: bytes`, **kein ACAO**; kein Limit dokumentiert (Fair Use) | 🟢 Batch · 🔴 Client (CORS) |
| **ESA WorldCover 10 m** | Vegetationstyp je Brandfläche | CC BY 4.0 | – | 🟢 |
| **Copernicus HRL Forest Type** | Nadel/Laub/Misch | CLMS frei/offen, Attribution | – | 🟢 |
| **STATISTIK AUSTRIA Bezirksgrenzen** · **swisstopo swissBOUNDARIES3D** (VG250 s. W.9) | Kreis/Bezirk/Kanton je Brand | CC BY 4.0 · frei (opendata.swiss) | – | 🟢 als statische, vereinfachte Datei |
| **GeoNames `cities1000`-Dump** | „nächster Ort" ohne Fremd-API | CC BY 4.0 | Dump ohne Key; **Web-API braucht Konto + Limit** | 🟢 Datei · 🔴 API |
| **Nominatim (public)** | Reverse-Geocoding je Zeile | ODbL, Usage Policy **1 req/s** | Rate-Limit | 🔴 für Bulk/Panel; bestehende Einzelabfrage der Ortssuche unberührt |
| **CDSE / Sentinel Hub / openEO** | dNBR serverseitig | Free-Tier 10 000 PU | Instance-ID/OAuth, Freemium | 🔴 (s. `prompt-waldbrand-brandflaeche.md` §6.1) |
| **NASA FIRMS Area API** | Primärquelle Live (Bestand) | „no restrictions" | **MAP_KEY + 5 000 Trans./10 min** | 🔴 nach Auftrags-Constraint — bestehende Freigabe Jan 2026-08-14 (§W.2.1); Bestätigung erbeten |
| **GitHub Actions** (Infra) · **Cloudflare R2** (Infra) | Batch-Runner · Objektspeicher | – | Repo public ⇒ Actions frei · R2 = Freemium | 🟢 Actions · ⚠ R2 nicht nötig (Commit-back nach `public/`, D-20), sonst Jans Entscheidung |
