# Diagnose: EFFIS/GWIS als Sekundär- und Kontextquelle (Phase E0, Gate GWBE1)

> Auftrag Jan, 2026-08-14 („EFFIS/GWIS as secondary layer"). Gemessen am **2026-08-15,
> 08:21–09:40 UTC**, gegen `maps.effis.emergency.copernicus.eu` (Dienste `/gwis` und `/effis`)
> mit `Origin: https://buscosun.com`; FIRMS-Seite über den **echten Edge-Handler**
> `netlify/edge-functions/firms.ts` mit dem Schlüssel aus `.env.local` (nie ausgegeben).
> Sonde: `scripts/l0/probe-waldbrand-effis.mjs` (Teile `wfs`, `wfs2`, `wms`, `ba`).
> Belege: `audit/l0/waldbrand-effis-{wfs,wfs2,wms,ba}.json`, Logs daneben, Legenden- und
> Karten-PNGs unter `audit/l0/effis/`.
>
> **Bei Widerspruch gilt die Messung, nicht der Kickoff-Text.** Der Kickoff traf drei
> Annahmen, die die Messung kippt (§0). Alle drei ändern das Bauprogramm.

## 0. Die drei Befunde, die das Programm ändern

| # | Annahme im Kickoff | Messung | Folge |
|---|---|---|---|
| **B1** | „What GWIS adds is EFFIS's knowledge-based filter … that removes agricultural and industrial heat sources" | Die Live-Hotspot-Layer `ms:viirs.hs.*` auf `/gwis` sind **NASA FIRMS unverändert weitergereicht**: 99,4 % (24 h) bzw. 98,7 % (7 d) aller FIRMS-Detektionen stehen **koordinatengleich** (Distanz p90 = 0 m) und **minutengleich** darin; **null** GWIS-Detektionen ohne FIRMS-Partner; **alle sechs geprüften Stahlwerke** (Duisburg 125/129, Linz 73/74, Salzgitter 118/119, Dillingen 50/51, Eisenhüttenstadt 19/20, Bremen 60/62) sind in GWIS. Die 0,6 % Differenz sind Ingest-Granularität (12 der 18 Fehlstellen aus **einem** SNPP-Überflug 12:02 Z; ein N21-Überflug 23:37 Z fehlt komplett), kein inhaltlicher Filter. | **Das Korroborations-Abzeichen aus E1 ist semantisch leer und in beiden Richtungen falsch:** „von EFFIS als Vegetationsbrand eingestuft" träfe auf ThyssenKrupp Duisburg zu, „nicht übernommen — häufig Industrie-/Agrarwärme" auf zufällige, unauffällige 0,6 %. **Nicht gebaut** (§3). |
| **B2** | `fireBurnt` „points at the frozen archive (measured 2026-08-14: FIREDATE 2016, LASTUPDATE 2022-01)" | **Falsch — Artefakt unseres eigenen `maxfeatures=800`.** MapServer wendet den Deckel **vor** dem BBox-Filter an und liefert die 800 kleinsten `id`s europaweit; in DACH blieben davon 46 (WB4) bzw. 716 (heute) übrig — alle alt. Ohne Deckel: **1.270 Polygone in DACH, FIREDATE 2016-04-21 … 2026-08-13, LASTUPDATE bis 2026-08-14 14:38 UTC.** Der Live-Bestand liegt in `ms:modis.ba.poly` (alles) und den Fensterlayern `.today/.week/.month/.season` sowie Jahreslayern `.2016…2025` auf `/effis`. | Der Layer war nie „eingefroren"; er zeigte **die ältesten statt der jüngsten** Flächen — genau die stille Falschaussage, vor der V-198 warnt, diesmal selbst gebaut. **V-224.** E2 bekommt zwei getrennte Zeitkörbe (Saison live / Archiv). |
| **B3** | „EFFIS RDA maps roughly ≥30 ha, so most DACH fires never appear" | Stimmt nur für die MODIS-Ära: `AREA_HA` min je Jahr 2016–2019 = 52/34/22/21 ha; **ab 2020/21 = 0–2 ha** (Sentinel-2-gestützte Kartierung). Saison 2026 in DACH: 293 Flächen, Median **5 ha**, **231 von 293 unter 30 ha**, kleinste 0 (< 0,5 ha), z. B. 2 ha Nadelwald bei Neustadt a. d. Waldnaab, 3 ha Oberharz. | Die Schwelle wird **aus den Daten gelesen** (min `AREA_HA` je Korb) statt fest „≥30 ha" beschriftet. |

Zusätzlich: **Satelliten- und Fensterparität sind gegeben** (§1, §2) — der Abbruchgrund des
Kickoffs greift *nicht*; das Abzeichen scheitert an B1, nicht an der Vergleichbarkeit.
Und: **kein Layer des Dienstes ist `queryable`**, `GetFeatureInfo` liefert für jedes Format eine
`ServiceException` → **E4 entfällt** (§4.4), wie im Kickoff vorgesehen („drop it silently") —
hier trotzdem protokolliert.

---

## 1. E0-1 Satelliten-Parität

**Frage:** Welche VIIRS-Plattformen führen `ms:viirs.hs.today/.week`?

**Messung (DACH-BBox `45.5,5.5,55.5,17.5`, `maxfeatures=20000`):**

| Typename (`/gwis`) | Features | Erfassungszeiten (UTC) | CLASS-Werte |
|---|---|---|---|
| `ms:viirs.hs.today` | 2 736 | 08-14 00:33 … 08-15 03:00 | `1DAY_N` 803 · `12HOURS_N` 330 · `12HOURS_1` 457 · `1DAY_1` 407 · `12HOURS_2` 332 · `6HOURS_2` 99 · `1DAY_2` 308 |
| `ms:viirs.hs.suomi.today` | 1 133 | 08-14 00:33 … 08-15 01:56 | nur `*_N` (803 + 330) |
| `ms:viirs.hs.n20.today` | 864 | 08-14 00:52 … 08-15 02:15 | nur `*_1` (457 + 407) |
| `ms:viirs.hs.n21.today` | 739 | 08-14 01:37 … 08-15 03:00 | nur `*_2` (332 + 99 + 308) |
| `ms:viirs.hs.week` | 7 352 (`resulttype=hits` bestätigt) | 08-08 00:07 … 08-15 03:00 | zusätzlich `7DAYS_N/1/2` |
| `ms:modis.hs.today` / `ms:s3.hs.today` / `ms:all.hs.today` | 151 / 150 / 3 037 | — | `1DAY_T`, `12HOURS_S`, … |
| `ms:viirs.suomi.hs.today` u. ä. (andere Reihenfolge) | **existiert nicht** („terminated") | | |

**Befund:** 1 133 + 864 + 739 = **2 736 = `ms:viirs.hs.today`**, und jede Plattform-Detektion
ist (Schlüssel `lat,lon,acq_at`) in `viirs.hs.today` enthalten. Der Sammellayer führt also
**genau die drei Plattformen, die FIRMS liefert** (S-NPP, NOAA-20, NOAA-21). Kein Ausschluss
nötig — die Kickoff-Warnung („NOAA-21-only detections would be mislabelled") trifft nicht ein.

**Nebenbefund, brauchbar:** `CLASS` ist `<Altersklasse>_<Plattform>` mit Suffix **N** = S-NPP,
**1** = NOAA-20, **2** = NOAA-21, **T** = Terra, **S** = Sentinel-3; Altersklassen `6HOURS`,
`12HOURS`, `1DAY`, `7DAYS`. Damit lässt sich die Plattform **aus dem Sammellayer** lesen, ohne
drei Abrufe. (V-199 bleibt: kein `frp`, keine `confidence`, kein `satellite`-Feld — aber das
Suffix trägt die Plattform.)

## 2. E0-2 Fenster-Parität

| Fenster | GWIS (gemessen) | FIRMS 5 + 2 (`windowPlan`) | Überlappung |
|---|---|---|---|
| „today" | **00:00 UTC des Vortags** → jetzt (erste Detektion 08-14 00:33; die 20 FIRMS-Detektionen der Stunde 08-13 23 h fehlen — Fenstergrenze, kein Filter). Länge 26,4 h. | `days=2` = heute + gestern (UTC) | identisch: gestern 00:00 Z → jetzt |
| „week" | **00:00 UTC von heute − 7 d** → jetzt (erste 08-08 00:07). Länge 170,9 h. | 5 + 3 Tage = 08-08 … 08-15 | identisch |

Beide Seiten hatten dieselbe jüngste Detektion (08-15 03:00 Z) — GWIS hängt FIRMS nicht
systematisch hinterher; Ausfälle sind granulatweise (§3).

## 3. E0-3 Match-Toleranz — und warum daraus kein Abzeichen wird

**Verfahren:** je FIRMS-Detektion der nächste GWIS-Nachbar in derselben ±2-Minuten-Umgebung
(Minutenindex), Radius 1,5 km.

| Layer | Satellit | FIRMS im Fenster | Treffer | Quote | gleiche Minute | Distanz p50 / p90 / p99 / max |
|---|---|---|---|---|---|---|
| today | N (S-NPP) | 1 185 | 1 176 | 99,2 % | 1 176 | 0 / 0 / 379 / 1 191 m |
| today | N20 | 866 | 865 | 99,9 % | 865 | 0 / 0 / 0 / 371 m |
| today | N21 | 752 | 747 | 99,3 % | 747 | 0 / 0 / 372 / 540 m |
| week | N | 2 802 | 2 782 | 99,3 % | 2 782 | 0 / 0 / 379 / 1 191 m |
| week | N20 | 2 339 | 2 318 | 99,1 % | 2 318 | 0 / 0 / 114 / 1 226 m |
| week | N21 | 2 436 | 2 382 | 97,8 % | 2 382 | 0 / 0 / 373 / 836 m |
| beide | GWIS ohne FIRMS-Partner | — | **0** | | | |

**Toleranz, gemessen:** Wo der Zwilling existiert, ist er **koordinatengleich auf fünf
Nachkommastellen** (p90 = 0 m) und **minutengleich** (Δt = 0 s in jedem Treffer). Werte > 0 m
treten nur auf, wo der echte Zwilling fehlt und ein Nachbarpixel (≈375 m) oder ein zweites Feuer
gematcht wurde. Die vom Kickoff erwartete „±375 m Gitterverschiebung" gibt es nicht — GWIS
speichert NASAs Koordinaten. Ein exakter Schlüssel `(lat5, lon5, Minute)` wäre die richtige
Match-Regel; ein Unschärfe-Radius wäre nur nötig gegen Nachverarbeitung, die es hier nicht gibt.

**Die 18 (24 h) bzw. 95 (7 d) fehlenden Detektionen** (`audit/l0/waldbrand-effis-wfs2.json`
→ `unmatchedToday.list`): FRP 0,5–11,7 MW, alle `nominal`, Tag und Nacht, verstreut über DACH;
**12 von 18 aus einem einzigen SNPP-Tagüberflug (12:02 Z)**, zwei aus dem N21-Überflug 23:37 Z,
der in GWIS **komplett** fehlt (0 von 2). Muster: fehlende oder verspätete **Granulate**, kein
inhaltliches Kriterium.

**Gegenprobe Dauerquellen (2,5-km-Umkreis, 24-h-Fenster):**

| Standort | GWIS today | FIRMS gleiches Fenster |
|---|---|---|
| Duisburg (ThyssenKrupp) | 125 | 129 |
| Linz (voestalpine) | 73 | 74 |
| Salzgitter | 118 | 119 |
| Dillingen (Saar) | 50 | 51 |
| Eisenhüttenstadt | 19 | 20 |
| Bremen (Stahlwerk) | 60 | 62 |

**Schluss (B1):** Der Live-Hotspot-Layer von GWIS ist keine EFFIS-gefilterte Menge, sondern die
NASA-Menge. EFFIS' Wissensfilter (Landbedeckung, Abstand zu Kunstflächen, Konfidenz) sitzt
**nicht** in `viirs.hs.*` — er sitzt in der **Brandflächenkartierung** (`modis.ba.poly.*`, §5),
die menschlich geprüft ist. Ein Abzeichen „von EFFIS als Vegetationsbrand eingestuft" auf einer
Detektion, die lediglich in GWIS *vorkommt*, wäre eine **falsche Tatsachenbehauptung** — auf
Duisburg ebenso wie auf jedem Feld. Die Gegenrichtung („nicht übernommen — häufig
Industrie-/Agrarwärme") träfe 0,6 % zufällige Granulat-Ausfälle. **Beides ist schlimmer als kein
Abzeichen** (Kickoff-Abbruchregel, sinngemäß angewandt). **E1 wird in dieser Form nicht gebaut.**

Was stattdessen trägt: die **Kartierung** — imagery-basiert, visuell geprüft, mit Landbedeckung
und Fläche. Das ist der Kickoff-Satz „the one place where ‚bestätigt' is earned", und E0 hat sie
**live** gefunden (§5). `src/fire/fireCorroboration.ts` implementiert deshalb *diese*
Bestätigung; der GWIS-Vergleich bleibt Sondenwissen (§9).

Alle Live-Hotspot-Layer (`viirs.*`, `modis`, `s3`, `all`, je `today/week/month/season`) tragen nur
`id, acq_at, CLASS`. `ndvi, cci_class, flag_lc, mask_flag, checked, frp, confidence, satellite`:
**nirgends** (E0-6). Die `.query`-Varianten sind per WFS nicht bedienbar (Verbindung bricht ab).
Auf `/effis` gibt es nur `all.hs, viirs.hs, noaa.hs, modis.hs` (+ `.query`) — der eingefrorene
Bestand (V-198). **Ein gefilterter Live-Layer existiert nicht.**

## 4. E0-4 Index-Layer für Phase E3

### 4.1 Capabilities (`/gwis`, WMS 1.3.0, 190 KB, 0,5 s; 120 Layer)

| Layer | Titel | TIME | Standard | Legende | Abstract (Kern) |
|---|---|---|---|---|---|
| `ecmwf.fwi` | ecmwf.fwi | 2018-01-01/2099-12-31 | 2019-01-01 | ja | „Fire Weather Index (FWI) from ECMWF reanalysis data … numerical rating of fire intensity and potential fire behavior" |
| `ecmwf.ranking` | ecmwf.ranking | wie oben | | ja | (derselbe FWI-Text — kein eigener Abstract) |
| `ecmwf.dc` | ecmwf.dc | wie oben | | ja | „Drought Code (DC) … moisture content of deep, compacted organic layers" |
| `ecmwf.isi` | ecmwf.isi | wie oben | | ja | „Initial Spread Index (ISI) … expected rate of fire spread immediately after ignition, based on … wind speed and fine fuel moisture content" |
| `ecmwf.ffmc` | ecmwf.ffmc | wie oben | | ja | „Fine Fuel Moisture Code (FFMC) … moisture content of fine fuels, such as grass and leaves" |
| `ecmwf.anomaly` | ecmwf.anomaly | wie oben | | ja | — |
| `ecmwf.anomaly_sigm` | **ecmwf.anomaly_raw** | wie oben | | ja | — |
| `ecmwf.anomaly_day` | ecmwf.anomaly_day | **keine TIME** | | | GetMap mit TIME ⇒ ServiceException |
| `mf025.fwi` / `.ranking` / `.anomaly` … | | 2018-01-01/2099-12-31 | 2022-01-15 | ja | Météo-France 0,25° |
| `nasa_geos5.fwi` … | | 2014-05-01/2099-12-31 | 2017-03-01 | ja | NASA GEOS-5 (kein `ranking`/`anomaly`) |
| `fuel_map` | Global Fuelmap | — | | ja | **`queryable="0"`** |
| Ferner | `ecmwf.mark5.*` (McArthur), `ecmwf.nfdrs.*` (US NFDRS), `ecmwf.extra.{lightning,totalprecipitation,windspeed,wind.uv}`, `landcover.mcd12*`, `ghsl`, `wdpa*`, `gwis.globfire.finalperim` | | | | außerhalb des Auftrags |

**Kein einziger Layer ist `queryable`.** `GetFeatureInfo` (Punkt 11,5 E / 50,5 N, TIME=heute)
antwortet für `text/plain`, `application/json`, `text/html`, `application/vnd.ogc.gml` jeweils mit
`ServiceExceptionReport` — auch für `fuel_map`. **Es gibt keine Punktwerte**, nur Bilder (wie in
`gwisFwi.ts` schon dokumentiert). E4 entfällt.

### 4.2 Rendern für DACH (GetMap EPSG:3857, DACH-BBox, 512², TIME=2026-08-15)

Alle Kandidaten liefern PNG 512×512 RGBA in 0,2–0,3 s mit **89 % sichtbaren Pixeln** (= die
Landfläche der BBox; Meer/Außenbereich transparent) und **6 Farben** (= 6 Klassen):
`ecmwf.fwi/.ranking/.dc/.isi/.ffmc/.anomaly/.anomaly_sigm/.dmc/.bui`, `mf025.fwi` (91 %),
`nasa_geos5.fwi` (90 %, 5 Farben). Bilder: `audit/l0/effis/getmap-<layer>-2026-08-15.png`.
Am Messtag zeigt `ecmwf.ranking` für den größten Teil von DACH **„Very Extreme (99–101)"** —
das Perzentil ist an diesem Tag die eigentliche Aussage.

### 4.3 Legenden, Klassen, Einheiten (GetLegendGraphic, `audit/l0/effis/legend-*.png`)

| Code | Größe / Einheit | Low | Moderate | High | Very High | Extreme | Very Extreme |
|---|---|---|---|---|---|---|---|
| `fwi` | FWI, dimensionslos | < 11,2 | 11,2–21,3 | 21,3–38,0 | 38,0–50,0 | 50,0–70,0 | > 70,0 |
| `ranking` | **Perzentil** (%) | ≤ 80 | 80–90 | 90–95 | 95–98 | 98–99 | 99–101 |
| `dc` | Drought Code, dimensionslos | < 256,1 | 256,1–334,1 | 334,1–450,6 | 450,6–600,0 | 600,0–749,4 | > 749,4 |
| `isi` | Initial Spread Index, dimensionslos | < 3,2 | 3,2–5,0 | 5,0–7,5 | 7,5–13,4 | 13,4–26,8 | > 26,8 |
| `ffmc` | Fine Fuel Moisture Code, dimensionslos | < 82,7 | 82,7–86,1 | 86,1–89,2 | 89,2–93,0 | 93,0–96,0 | > 96,0 |
| `anomaly` | Standardabweichungen (σ) | ≤ 0 | 0–0,5 | 0,5–1,0 | 1,0–1,5 | 1,5–2,5 | > 2,5 |

Farbfolge in allen Legenden identisch (hellgrün → gelb → orange → dunkelorange → rot → dunkelrot).
**Die Farbe „rot" bedeutet also je Sub-Ansicht etwas anderes** — die Legende muss je Ansicht
eigene Klassengrenzen und die eigene Einheit tragen (Kickoff-Regel „No shared legend across codes").

### 4.4 Horizont (sichtbare Pixel je TIME, 128², gemessen 08:2x UTC am 2026-08-15)

| Layer | 08-13 | 08-14 | **08-15** | 08-16 | 08-17 | 08-18 | 08-19 | 08-20 | 08-21 | 08-22 | 08-23 | 08-24 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `ecmwf.fwi/.ranking/.dc/.isi/.ffmc/.anomaly` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | leer |
| `mf025.fwi` | ✓ | ✓ | ✓ | ✓ | ✓ | leer | | | | | | |
| `nasa_geos5.fwi` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | leer | | |

ECMWF-Familie: **heute + 8** (die Doku sagt „1 to 9 days"; der 9. Tag ist am Vormittag noch nicht
da — passt zu `FIRE_LAYER_TIME.fireDanger.maxDay = 9` als Obergrenze; ein leerer Tag zeigt sich als
leere Kachel, nicht als Fehler). MF: +2, GEOS-5: +6. **Alle E3-Sub-Ansichten teilen den Horizont
des Basislayers** — der Tagesregler kann unverändert bleiben. Modell-Vergleich (Stretch): Schnitt
heute…+2 — möglich, aber nicht Gate-Bedingung; **nicht begonnen** (§9).

### 4.5 Referenzperiode für `ranking` / `anomaly` — was die Quelle sagt, und was nicht

- EFFIS-Seite „Fire Danger Forecast" (`forest-fire.emergency.copernicus.eu/about-effis/technical-background/fire-danger-forecast`, abgerufen 2026-08-15) und die gleichlautende GWIS-Seite:
  > „EFFIS publishes two indicators derived from the FWI that provide information on the
  > local/temporal variability of the FWI compared to **a historical series of approximately
  > 40 years**. These indicators are the **ranking**, which provides **percentiles of
  > occurrence of the values**, and the **anomaly**, computed as **a standard deviation from
  > the 40-year historical mean values**."
  Die Seite nennt **keine Jahreszahlen** (einzige Jahre auf der Seite: 2007, 2019, 2021 in anderem
  Zusammenhang; Zitat „Fire danger indices historical data from the Copernicus Emergency
  Management Service (2019)").
- Der zitierte historische Datensatz ist der JRC/ECMWF-Datensatz **Vitolo et al. 2020, Sci Data,
  „ERA5-based global meteorological wildfire danger maps"** (doi 10.1038/s41597-020-0554-z,
  „developed … under the umbrella of GWIS"): „For every grid cell and day of the year the
  climatology is calculated as average of the recorded FWI for all the years in the data record
  **(1980–2018)** and across a moving window of 9 days centered on the given day." — 39 Jahre
  ≈ „approximately 40". **Dass die operative `ecmwf.ranking`-Ebene genau diese Klimatologie
  benutzt, sagt EFFIS nirgends ausdrücklich.**

**Umgang (Ehrlichkeitsregel des Kickoffs):** Die Sub-Ansicht „Einordnung" wird beschriftet mit
dem, was die Quelle sagt — **„Perzentil gegenüber einer ~40-jährigen historischen Reihe für
diesen Ort (Angabe EFFIS/GWIS)"** — plus dem Hinweis, dass EFFIS die genauen Jahre nicht
veröffentlicht, und der Fußnote zur ERA5-Basisklimatologie 1980–2018 (Vitolo et al. 2020) als
wahrscheinlicher, aber **nicht von EFFIS bestätigter** Grundlage. Das ist eine benannte Baseline
mit benannter Unschärfe — kein unbenanntes Perzentil. ⚠️ **Für Jan markiert:** Der Kickoff
listet „reference period cannot be established from source" als STOPP-Punkt; die Quelle
*etabliert* sie als „≈40 Jahre", nicht als Jahresspanne. Ich habe gebaut und die Formulierung
exakt an die Quelle gebunden; hält Jan das für zu unscharf, ist die Sub-Ansicht mit einer Zeile
in `DANGER_VIEWS` abschaltbar (V-228).

## 5. E0-5 Brandflächen — der Bestand ist live

### 5.1 Kandidaten (WFS 1.1.0 → GeoJSON, `maxfeatures=5` europaweit; lange Timeouts)

| Dienst : Typename | Status | ms | Befund |
|---|---|---|---|
| effis : `ms:modis.ba.poly` | 200 | 2 100 | 5 Feat., FIREDATE 2016 (kleinste ids); **WFS 2.0 `sortby=FIREDATE DESC` ⇒ jüngstes 2026-08-14, LASTUPDATE 2026-08-14 14:38 UTC** · `resulttype=hits` europaweit **104 207**, DACH **1 270** |
| effis : `ms:modis.ba.poly.today` | 200 | 300 | 4 Feat. (EU), FIREDATE 2026-08-14 · DACH 0 |
| effis : `ms:modis.ba.poly.week` | 200 | 300 | DACH **26** Feat., FIREDATE 2026-08-08 … 08-13, LASTUPDATE bis 08-14 14:04 · **102 902 B** |
| effis : `ms:modis.ba.poly.month` | 200 | 340 | DACH 74 Feat., 2026-07-16 … 08-13 |
| effis : `ms:modis.ba.poly.season` | 200 | 600 | DACH **293** Feat., 2026-01-04 … 08-13 (europaweit 14 719) · **1 437 097 B** |
| effis : `ms:modis.ba.poly.2016` … `.2025` (WMS-Liste) | 200 | 340 | z. B. `.2025` DACH 376 Feat., 864 KB, `cache-control: public, max-age=3600` |
| effis : `ms:effis.nrt.ba.poly` / `.point` | 200 | 200 | 800 Feat. **ohne Properties** — unbrauchbar |
| effis : `ms:modis.ba.point.week` | 200 | 190 | 26 Punkte ohne Properties |
| gwis : `ms:nrt.ba.poly` / `.week` / `.season` | 200 | 300–480 | global, Attribute nur `id, fire_id, initialdate, finaldate, area` — ärmer als `/effis` |
| effis/gwis : `ms:modis.ba`, `.today/.week/.month/.season` (ohne `.poly`), `ms:effis.nrt.ba`, `ms:nrt.ba` (effis), `ms:effis.ba`, `ms:ba.poly`, `ms:viirs.ba`, `ms:s2.ba`, `ms:sentinel2.ba` | ERR | 0,1–0,4 s | „terminated" — kein WFS-Typ |

**CORS:** `Access-Control-Allow-Origin: *` auf allen `/effis`-WFS-Antworten (auch `.season`,
`.week`, Archiv) — **kein neuer Transportweg nötig**, damit **kein STOPP-Punkt**.
**Cache:** `.season`/Archiv `cache-control: no-store`; Jahreslayer `public, max-age=3600`.
**Kompression:** der Server sendet **keine** `content-encoding`, auch nicht bei
`Accept-Encoding: gzip, br` — das Archiv geht mit **4,83 MB** über die Leitung (gzip-Schätzung
1,21 MB, Faktor 4). Ein komprimierender Proxy wäre Transportzone (V-226).

### 5.2 Attribute (identisch auf `.week/.month/.season`; Archiv zusätzlich `FINALDATE`)

`id, FIREDATE, [FINALDATE], LASTUPDATE, COUNTRY, PROVINCE, COMMUNE, AREA_HA, BROADLEA, CONIFER,
MIXED, SCLEROPH, TRANSIT, OTHERNATLC, AGRIAREAS, ARTIFSURF, OTHERLC, PERCNA2K, CLASS`

- `FIREDATE` trägt eine **Uhrzeit** (`2026-08-13 10:41:00` — Detektionszeit); `LASTUPDATE`
  Mikrosekunden.
- Die **neun Landbedeckungsanteile** (BROADLEA, CONIFER, MIXED, SCLEROPH, TRANSIT, OTHERNATLC,
  AGRIAREAS, ARTIFSURF, OTHERLC) summieren sich in allen 50 geprüften Features auf **100 %**;
  `PERCNA2K` ist der Anteil innerhalb Natura 2000 (eigenständig, 0–100). Der Kickoff nannte
  sieben — `TRANSIT` (Übergangsflächen Wald/Strauch) und `OTHERLC` kommen hinzu.
- `AREA_HA` kommt als **String** (`"2"`, `"170"`); `CLASS` = `7DAYS` / `30DAYS` / `FireSeason`.
- Beispiele DE, Saison 2026: Oberharz am Brocken 3 ha (100 % Nadelwald, 100 % Natura 2000,
  2026-08-13); Sundern 7 ha (100 % Nadelwald); Rehlingen 6 ha (100 % Natura 2000, „OTHERNATLC");
  Neustadt a. d. Waldnaab 2 ha (100 % Nadelwald).

### 5.3 Flächenschwelle je Ära (DACH, Archiv ohne Deckel, n = 1 270)

| Jahr | n | min ha | Median ha |
|---|---|---|---|
| 2016 | 6 | 52 | 106 |
| 2017 | 12 | 34 | 92 |
| 2018 | 51 | 22 | 38 |
| 2019 | 47 | 21 | 37 |
| 2020 | 48 | 2 | 25 |
| 2021 | 54 | 0 | 7 |
| 2022 | 239 | 1 | 15 |
| 2023 | 71 | 0 | 8 |
| 2024 | 73 | 0 | 8 |
| 2025 | 376 | 0 | 4 |
| 2026 (Saison) | 293 | 0 | 5 |

⇒ **B3.** Der Bruch 2019/2020 ist der Wechsel der Kartierungsgrundlage. Der Layer nennt die
untere Grenze je Korb aus den Daten und sagt dazu, dass **auch darüber** nicht jede Fläche
kartiert wird (Wolken, Kartierverzug, Prüfung).

## 6. Bauprogramm nach E0 (Abweichungen vom Kickoff ausdrücklich)

| Phase | Kickoff | Nach E0 |
|---|---|---|
| **E1** | GWIS-Hotspot-Abzeichen `effisKept / effisDropped / outOfScope` | **Nicht gebaut** (B1). `src/fire/fireCorroboration.ts` (pur, `verify:fire-corroboration`) implementiert stattdessen die **Kartierungs-Bestätigung**: Detektion/Ereignis ∩ EFFIS-Brandflächenpolygon (räumlich mit Pixeltoleranz **und** zeitlich ±14 Tage um `FIREDATE`) ⇒ „Brandfläche kartiert (EFFIS): X ha, Branddatum …, Stand …". Nur hier fällt das Wort „bestätigt" — und nur mit Quelle. **Fehlende Kartierung ist nie Evidenz gegen ein Feuer.** Datenbedarf: `ms:modis.ba.poly.week` (~100 KB), lazy bei aktivem Hotspot-Layer, TTL 30 min — **ein** zusätzlicher Abruf, ausgewiesen (V-225). |
| **E2** | Relabel „historisch", ≥30 ha, Landbedeckung, ggf. Live-Layer getrennt | Zwei **getrennte Zeitkörbe** im Layer `fireBurnt`: **„Diese Saison"** (`ms:modis.ba.poly.season`, live, Standard) und **„Archiv"** (`ms:modis.ba.poly` ohne Kleindeckel, clientseitig auf Vorjahre gefiltert, **nur auf Wunsch** geladen — 4,8 MB). Eigene Quellen, eigene Farb-/Konturlogik, nie gemischt gerendert. Füllfarbe **nach dominanter Landbedeckung**, Popup mit voller Aufschlüsselung + `PERCNA2K` + Fläche + Daten. Zeitspanne, Stand (`LASTUPDATE`) und untere Flächengrenze **aus den Daten**. **V-224** dokumentiert den Deckel-Fehler. |
| **E3** | Sub-Ansichten `ranking/dc/isi/ffmc` in `fireDanger` | Wie geplant: Untersegment „Index · Einordnung · Trockenheit · Ausbreitung · Zündbereitschaft"; je Ansicht eigene Legende mit **eigenen Klassengrenzen** (§4.3), Einheit und Bezugsangabe; `dc` = „Trockenheit der Streuauflage (Modellwert)", nie „Bodenfeuchte" (Verifier prüft den String); EDO bleibt als blockiert benannt. Standard bleibt **Index**; die Karte des Index trägt die Einordnung **daneben** (beide Legenden auf der Karte, Hinweis, Ein-Klick-Wechsel). Referenzperiode wie §4.5. Horizont geteilt (§4.4). |
| **E4** | GetFeatureInfo `fuel_map` | **Entfällt** — nicht queryable (§4.1). |
| Stretch | Modellvergleich fwi/mf025/geos5 | Nicht begonnen; Schnitt der Horizonte heute…+2 (§4.4). V-227. |

## 7. Was diese Phase NICHT anfasst

- `firmsHotspots.ts`, `fireEvents.ts`, `gwisHotspots.ts`: unverändert (E1 entfällt; V-199 bleibt).
- Edge Functions, `netlify.toml`, Warm-Crons: unberührt (kein neuer Transportweg — CORS ist da).
- `fireFuel`, `fireContext`: unverändert (E4 entfällt).
- Wetterkarte: kein Import, kein CSS-Leck (Muster WBU1).

## 8. Offene Punkte für Jan

1. **B1 zur Kenntnis:** Das Abzeichen aus E1 gibt es nicht, weil die Datenlage es nicht trägt —
   nicht, weil Parität fehlte. Wenn EFFIS eines Tages einen gefilterten Live-Layer anbietet
   (`checked`/`mask_flag`), ist der Vergleichspfad in der Sonde vorbereitet.
2. **§4.5 Referenzperiode:** „≈40 Jahre (EFFIS)" ist die Quellenangabe; genauer wird es nicht.
   Reicht das? Sonst `ranking` per Zeile abschalten.
3. **Standard-Sub-Ansicht:** Ich lasse den **Index** als Standard (Funktionserhalt, bestehende
   Permalinks) und zeige die Einordnung daneben. Wer die Einordnung als Standard will, ändert
   `DEFAULT_DANGER_VIEW`.
4. **Archivgröße 4,8 MB unkomprimiert** — nur auf Wunsch geladen; ein komprimierender Proxy wäre
   Transportzone (V-226).

## 9. Sondenwissen, das nicht in Produktcode wanderte

- GWIS-Plattformzerlegung per `CLASS`-Suffix (§1) — dokumentiert, nicht verwendet.
- Exakter Match-Schlüssel `(lat5, lon5, Minute)` FIRMS↔GWIS (§3) — dokumentiert, nicht verwendet.
- Modell-Horizonte MF +2 / GEOS-5 +6 (§4.4) — für einen späteren Modellvergleich.
- `ecmwf.extra.lightning/windspeed/totalprecipitation` (§4.1) — Treiber-Layer der ECMWF-Familie,
  außerhalb des Auftrags.

## 10. Beleg-Index

| Beleg | Pfad |
|---|---|
| Sonde | `scripts/l0/probe-waldbrand-effis.mjs` |
| WFS-Parität/Match (Voll-Lauf) | `audit/l0/waldbrand-effis-wfs.json`, `.log` |
| Deckel, CLASS-Suffix, Fehlstellen, Stahlwerke | `audit/l0/waldbrand-effis-wfs2.json`, `.log` |
| WMS-Capabilities, Rendern, Legenden, Horizont, GetFeatureInfo | `audit/l0/waldbrand-effis-wms.json`, `.log`, `audit/l0/effis/*.png` |
| Brandflächen-Jagd | `audit/l0/waldbrand-effis-ba.json`, `.log`, `audit/l0/waldbrand-effis-ba2.log` |
| Verifikationsprotokoll | `tests.md` §V-WALDBRAND-EFFIS |

## 11. Umsetzung E1–E3 — was beim Bauen dazukam (2026-08-15, nach der Diagnose)

**Gebaut:** `src/fire/fireCorroboration.ts` (Bestätigung durch die Kartierung, pur),
`src/fire/dangerViews.ts` (Sub-Ansichten, pur), `euContext.ts` (zwei Körbe, kein Kleindeckel,
Wochenlayer), `FireMap.tsx` (Raster je Ansicht, zwei Brandflächen-Quellen mit Landbedeckungsfarbe,
Flächen-Popup, Bestätigungszeile im Detektions-Popup), `FirePage.tsx` (Untersegmente, Körbe,
Begleit-Notiz, Zählung), `FireLayerCard.tsx` (Legenden je Ansicht, Relabel), `fireState.ts`
(Permalink `v`/`bb`), zwei Verifier. Protokoll: `tests.md` §V-WALDBRAND-EFFIS. Gate GWBE1.

**Drei Dinge, die erst die Umsetzung gezeigt hat:**

1. **Die Kartierung muss die Ortsfest-Vermutung aufheben.** Offline gegen die echten Daten
   geprüft: von 545 kartierten Detektionen waren **24 grau** — alle in Varallo (IT, 47 ha,
   5 Tage ortsfest, unter einer Pixelbreite Ausdehnung). Ein von EFFIS geprüfter Waldbrand sah
   aus wie ein Stahlwerk. Die Kartierung ist die stärkere, menschlich kontrollierte Beobachtung
   und entfernt die Detektion aus der Grau-Menge (nie umgekehrt). Im UI: 2 395 → 2 371 grau. Der
   Kickoff-Satz „ONE signal, not an override" galt dem verworfenen GWIS-Abzeichen; für die
   Kartierung wäre Nicht-Überstimmen der Fehler gewesen — hier begründet, per Verifier gehalten.
2. **`applyState` hatte eine Endlosschleife — und die war V-220.** `applyState` läuft auf `idle`
   und rief `setData` für jede Quelle; `setData` löst `idle` aus. Bei den kleinen Quellen war das
   ein Grundrauschen von 30–50 ms (die drei > 200 ms der Grundlinie); mit dem 4,8-MB-Archiv wurden
   es **200–400 ms jede Sekunde** im Leerlauf (Prod-Build gemessen). Sperre je Quellinstanz
   (`WeakMap` Referenzvergleich, nach Stilwechsel automatisch neu): Grundlinie 0 Tasks > 200 ms
   (max 143), Hotspots 7 d 0 (max 162), Hotspots + Saison + Archiv 2 beim Laden (207/222), 0 im
   Leerlauf. Basiskartenwechsel danach geprüft: alle Layer wieder da, keine Neuabrufe.
3. **„Trockenheit" stand sonst zweimal im Dock.** Der blockierte EDO-Layer hieß „Trockenheit",
   die neue DC-Sub-Ansicht auch — genau die Verwechslung, die der Kickoff verbietet. Der
   blockierte Layer heißt jetzt „Bodenfeuchte-Anomalie" (was er ist), sein Steckbrief sagt
   ausdrücklich, dass DC kein Ersatz ist; die DC-Ansicht nennt ihn beim Namen. Ein Verifier hält
   fest, dass „Bodenfeuchte" in der DC-Definition nur als dieser Layername vorkommt.

**Zahlen am Messtag (UI, Prod-Build):** 6 760 Detektionen (7 d), 2 371 grau, 538 in kartierten
Wochenflächen; Saison 293 Flächen (Stand 14.08. 15:40), Archiv 977 (2016–2025); Netz: 6 FIRMS +
1 week + 1 season + 16 GetMap, kein GWIS-Hotspot-Abruf.

**Nicht gebaut, bewusst:** E1-Abzeichen (§3), E4 (§4.1), Modellvergleich (V-227), Ausfall-Hinweis
für den Wochenlayer (V-225).
