# Datenquellen-Matrix — Punktvorhersage 0–336 h

> Alle Zeilen mit „**gemessen**" wurden am **2026-09-05** gegen den Live-Endpunkt geprüft
> (`curl`, Verzeichnis-Listings, `.index`-Auswertung, KMZ-Parse). Zeilen mit „*Annahme*" sind
> **nicht** geprüft und vor der Umsetzung zu belegen. Lizenzaussagen tragen ihre Quelle.

---

## 1. Vorhersagequellen

| Quelle | Variablen (Auswahl) | Lead | Auflösung | Zyklus | Latenz | Lizenz | Constraint | Volumen |
|---|---|---|---|---|---|---|---|---|
| **DWD MOSMIX_L** | 114 Elemente (TTT, TX/TN, FF/DD, FX1/FXh, N/Neff/Nh/Nm/Nl, RR1c/RR3c, R101…R150, VV, Td, SunD1, Rad1h, …) | **246 h, stündlich** (247 Schritte, gemessen) | Punkt (Station) | 4×/Tag (03/09/15/21 UTC) | **+73 min** (Lauf 09z → 10:13 UTC, gemessen, 1 Fall) | CC BY 4.0 (GeoNutzV) | kein Key · **kein CORS** ⇒ Proxy | **18 953 B/Station/Lauf** (KMZ), KML 344 445 B; all_stations 82,6 MB |
| **DWD MOSMIX_S** | ~40 Elemente (*Annahme*, nicht ausgezählt) | 240 h | Punkt (Station) | **stündlich** | +39 min (1 Fall, gemessen) | CC BY 4.0 | nur `all_stations` (**keine Einzelstationsdateien**, gemessen) | **37,0–37,4 MB/Lauf** |
| **DWD ICON-D2** | t_2m, u/v_10m, vmax_10m, tot_prec, clc*, … | 48 h | 2,2 km | 8×/Tag | ~+2 h (*Annahme*) | CC BY 4.0 | kein CORS ⇒ `/_dwd_opendata`, `/_dwd_grib` | t_2m: 98 Dateien/Lauf |
| **DWD ICON-EU** | wie oben, + Druckflächen | 120 h | 7 km | 4×/Tag (*Annahme*) | *Annahme* | CC BY 4.0 | ebd. | — |
| **DWD ICON-EPS (global)** | t_2m, td_2m, u/v_10m, vmax_10m, tot_prec, clct, relhum_2m, ps, asob_s, aswdir_s | **180 h** (70 Schritte: 1 h ≤48, 3 h ≤120, 6 h ≤180, gemessen) | ikosaedrisch ~26 km (*Annahme*), 40 Member (*Annahme*) | 4×/Tag | *Annahme* | CC BY 4.0 | alle Member in **einer** Datei je Schritt | **~36,2 MB bz2 / Schritt / Variable** |
| **DWD ICON-EU-EPS** | t_2m u. a. | 120 h (*Annahme*) | ~13 km (*Annahme*) | 4×/Tag | *Annahme* | CC BY 4.0 | ebd. | 65 Dateien/Lauf für t_2m |
| **GeoSphere AROME** | T, u/v, N, RR, snowlmt | 60 h | 2,5 km | 8×/Tag (*Annahme*) | *Annahme* | CC BY 4.0 | **240 req/h/IP** | im Client in Betrieb |
| **GeoSphere INCA** | rr, t2m, td, rh2m, ff, fx, dd, pt | **3 h 15 min** | 1 km / 15 min | fortlaufend | — | CC BY 4.0 | EPSG:31287; NetCDF-Limit 10 Mio. Werte | in Betrieb |
| **ECMWF IFS HRES (oper)** | 184 Felder/Schritt inkl. 2t, 2d, 10u/10v, msl, tp, tcc | 240 h | 0,25° | 4×/Tag | ~+7–9 h (*Annahme*, Adapterkommentar) | **CC-BY-4.0 + ECMWF ToU, Weitergabe und kommerzielle Nutzung ausdrücklich erlaubt** (ecmwf.int, 2026-09-05) | kein CORS ⇒ `/_ecmwf`; `.index`-Sidecar ⇒ **Byte-Range je Feld** | Schritt gesamt **137,3 MB**, Feld `2t` **650 356 B** |
| **ECMWF IFS ENS (`enfo-ef`)** | 8 500 Sätze/Schritt; sfc: 2t, 2d, 10u/10v, 10fg, tp, tcc, sd, msl, mucape, ptype … | **360 h** (366 h → 404, gemessen) | 0,25° | 4×/Tag | *Annahme* | wie oben | **nur `type: pf`, 50 Member — kein Kontroll-Lauf** (gemessen an Schritt 0 **und** 24) | `2t` je Member **660 768 B** (Schritt 0) / 651 798 B (24) ⇒ **~32 MB je Variable je Schritt** |
| **ECMWF AIFS-single** | wie IFS-Kernsatz | 360 h | 0,25° | 4×/Tag (*Annahme*) | *Annahme* | wie oben | `.index` vorhanden | ~0,65 MB/Feld |
| **ECMWF AIFS-ENS** | sfc: 2t, 2d, 10u/10v, 100u/100v, tp, cp, sf, tcc/lcc/mcc/hcc, msl, sp, ssrd, skt + pl | **360 h**, **6-stündlich** (3 h → 404, gemessen) | 0,25° | 4×/Tag (*Annahme*) | *Annahme* | wie oben | **`enfo-cf` (1) + `enfo-pf` (50 Member)** getrennt; Index cf 26 578 B, pf 1 428 271 B | `2t` je Member **623 502 B** |
| **NOAA GEFS 0,25° (`pgrb2sp25`)** | TMP/DPT/RH 2 m, U/V 10 m, APCP, TCDC, GUST, CAPE … | **240 h** (f384 → 404, gemessen) | 0,25° | 4×/Tag (*Annahme*) | *Annahme* | **Public Domain** | `/_gfs`-Rewrite in Betrieb; `.idx` ⇒ Byte-Range | Datei geavg f024 **17,63 MB**; **`geavg` + `gespr` als eigene Produkte** |
| **NOAA GEFS 0,5° (`pgrb2ap5`)** | dieselben Oberflächenfelder (bei f336 geprüft) | **384 h** | 0,5° | 4×/Tag (*Annahme*) | *Annahme* | Public Domain | ebd. | Datei geavg f024 **13,17 MB**; Feld `TMP 2 m` bei f336 **122 747 B** |
| **NOAA GFS** | in Betrieb (`gfsPoint.ts`) | 384 h | 0,25°/1° | 4×/Tag | — | Public Domain | in Betrieb | ~100 Range-Abrufe je 14-Tage-Punktabfrage |
| **Open-Meteo (Forecast/Ensemble/Previous-Runs/Archive)** | viele | bis 16 d | div. | div. | — | Free-Tier **nicht-kommerziell** + Rate-Limit | 🚫 **blockiert für jedes ausgelieferte Artefakt und jedes Training** (D-18; fusionV2-Constraint C1) | nur Opt-in-Features |

### 1.1 Die Zahl, die die Architektur entscheidet

Ein GRIB2-Feld ist **global und atomar** — es gibt bei keinem dieser Endpunkte ein
serverseitiges räumliches Subsetting. Wer 2 m-Temperatur über DACH will, lädt das Weltfeld.
Daraus folgt für ECMWF-ENS (gemessen, 0,25°, ~0,65 MB je Member und Feld):

| Ingest-Variante | Rechnung | Volumen je Lauf | Urteil |
|---|---|---|---|
| ENS voll: 85 Schritte × 51 Member × 7 Variablen | 85·51·7·0,65 MB | **≈ 197 GB** | ausgeschlossen |
| ENS reduziert: 85 × 20 Member × 4 Variablen | 85·20·4·0,65 MB | ≈ 4,4 GB | grenzwertig, messen |
| **GEFS `geavg` + `gespr` 0,5°, 7 Variablen, 105 Schritte** | 105·2·7·0,13 MB | **≈ 191 MB** | **tragfähig** |
| ECMWF HRES oder AIFS-single, 7 Variablen, 85 Schritte | 85·7·0,65 MB | ≈ 387 MB | tragfähig |
| ICON-EPS global, 1 Variable, 70 Schritte | 70·36,2 MB | ≈ 2,5 GB | pro Variable teuer |

> **Konsequenz:** Der Langfrist-Ensembleteil kommt zuerst aus **GEFS-Mittel + Spread**
> (Public Domain, ~191 MB/Lauf) und **zwei deterministischen ECMWF-Ankern** (HRES, AIFS-single).
> Das volle ECMWF-ENS ist eine *gemessene Ausbaustufe*, keine Planungsgrundlage:
> es kostet je Lauf das 20- bis 1000-fache und muss seinen CRPS-Gewinn erst belegen.
>
> **Offener Optimierungspfad (V-PV-05, nicht eingeplant):** Bei DRT 0/1 ließe sich aus dem
> Bit-Offset der DACH-Zeilen ein Teil-Range berechnen; bei DRT 42 (AEC) sind RSI-Blöcke
> theoretisch teil-dekodierbar. Beides ist Forschung, kein Plan-Baustein.

---

## 2. Beobachtungen — die Wahrheit für jede Verifikation

| Quelle | Abdeckung | Takt | Historie | Lizenz | Transport | Volumen |
|---|---|---|---|---|---|---|
| **DWD CDC stündlich `recent`** | **503 Stationen** (air_temperature, gemessen) | 1 h | ~500 Tage | CC BY 4.0 | kein CORS ⇒ Proxy/Actions | ~80 KB/Station (ZIP) |
| **DWD CDC stündlich `historical`** | dieselben + aufgelassene | 1 h | bis 1881 | CC BY 4.0 | ebd. | — |
| **DWD CDC 10-min `now`** | vorhanden (HTTP 200, gemessen) | 10 min | Rollfenster | CC BY 4.0 | ebd. | — |
| **DWD POI (`weather_reports/poi`)** | **974 Stationen**, davon Block 10/11 = 237, Block 06 = 23 (gemessen; **enthält AT 11035 und CH 06670**) | 1 h | **25 Zeilen ⇒ 24-h-Rollfenster** | CC BY 4.0 | ebd. | ~7,2 KB/Station · **42 Parameter** inkl. Wolken, Sicht, Böen, Sonnenschein, Globalstrahlung |
| **GeoSphere `klima-v2-1h`** | **823 AT-Stationen** mit lat/lon/Höhe/valid_from | 1 h | **1880-04-01 → jetzt** (`end_time` = Abrufzeitpunkt, gemessen) | CC BY 4.0 | 5 req/s · 240 req/h ⇒ Batch-Abfragen | GeoJSON ≤ 1 Mio. Werte je Request |
| **GeoSphere `tawes-v1-10min`** (current + historical) | AT ~200 aktiv | 10 min | historisch vorhanden | CC BY 4.0 | ebd. | in Betrieb |
| **MeteoSchweiz OGD-SMN (STAC)** | CH; je Station Assets `_h_now`, `_h_recent`, `_h_historical_<Dekade>` | 1 h (+10 min `_t_`) | ab 1980er je Station | **CC-BY** (`license` der STAC-Collection, gemessen) | CORS `*` | CSV je Station/Dekade |
| **BrightSky** | DE-Wrapper über DWD | 1 h | — | MIT-Code, Daten unter DWD-Bedingungen | CORS `*`, kein Key | privat betrieben ⇒ **kein SLA** |

> **Befund:** Beobachtungen sind für alle drei Länder **rückwirkend, frei und kommerziell
> nutzbar** verfügbar. Das Kaltstartproblem betrifft die Beobachtungsseite **nicht**.

---

## 3. Statische Prädiktoren

| Kandidat | Status | Lizenz | Bewertung |
|---|---|---|---|
| **DEM (Mapzen Terrarium via S3)** | **in Betrieb** (`elevation.ts`, z5 für Raster, z9 ≈ 150 m für den Punkt) | s. Terrarium/AWS-ODR (*Annahme*, im Repo als in Betrieb dokumentiert) | liefert z, ∇z, Neigung, Exposition, TPI/Senkentiefe — **alle Terrain-Prädiktoren ohne neue Quelle** |
| **Sky-View-Faktor / Horizontüberhöhung** | ableitbar aus demselben DEM (`eventTerrain.ts` rechnet bereits Horizonte mit Krümmungsabzug) | — | **kein neuer Fetch**, nur Rechenweg |
| **CORINE Landbedeckung** | Teilweise im Repo (`scripts/build-clc-mask.mjs`) | Copernicus, frei (*Annahme*, zu belegen) | Kandidat für den Landnutzungs-Prädiktor |
| **ESA WorldCover** | in Betrieb im Brandradar (Spiegel-Repo `buscosun-worldcover`) | CC BY 4.0 (*Annahme*, im Repo dokumentiert) | Alternative zu CORINE |
| **Küstenabstand / Seenähe** | **nicht vorhanden** | — | für DACH gering relevant (binnenländisch); aus dem Landmaskenfeld `lsm` der Modelle ableitbar |

---

## 4. Trainings- und Referenzarchive

| Archiv | Inhalt | Reichweite | Lizenz | Urteil |
|---|---|---|---|---|
| **S3 `ecmwf-forecasts`** | ECMWF Open Data 1:1 (oper, enfo, aifs-single, …) inkl. `.index` | **ab 2023-01-18** (Präfix-Listing, gemessen); 2025-09-05 stichprobenhaft vorhanden | CC-BY-4.0 + ToU | **Hindcast ab sofort möglich** |
| **S3 `noaa-gefs-pds`** | GEFS operativ | 2024-01-01 und 2025-09-05 vorhanden, 2020-01-01 nicht (gemessen) | Public Domain | **Hindcast ab sofort möglich** |
| **S3 `noaa-gefs-retrospective`** | GEFSv12-Reforecast (`GEFSv12/`-Präfix, gemessen) | mehrjährig (*Annahme*: 2000–2019, 5 Member) | Public Domain | Langtraining für AnEn/Klimatologie |
| **ERA5 (Copernicus)** | Reanalyse | ab 1940 | Copernicus-Lizenz (*Annahme*) | **nur Prädiktor/Klimatologie, nie Wahrheit** (s. `retro-verifikation.md`) |
| **Open-Meteo Archive / Previous-Runs** | Reanalyse + archivierte Läufe | mehrjährig | Free-Tier nicht-kommerziell | 🚫 **blockiert** für Training/Artefakte |
| **Meteostat (`data.meteostat.net`)** | Tagesreihen; Grundlage von `public/climaGrid.json` | 1995–2024 im Artefakt | **unbelegt** — zwei Terms-Abrufe am 2026-09-05 ohne auswertbaren Lizenztext | 🚫 **blockiert für neue Artefakte**, Bestand prüfen (V-PV-07) |
| **MOSMIX-Archiv** | — | **existiert nicht** öffentlich | — | ⇒ Eigenarchiv ab Tag 1 |
| **ICON-Archiv** | — | in dieser Runde **nicht gefunden**; opendata ist Rollfenster (D2: 8 Läufe, gemessen) | — | ⇒ Eigenarchiv, falls ICON-DMO als Referenz verlangt wird |

---

## 5. Blockierte Quellen — und was dadurch fehlt

| Blockiert | Grund | Fachlicher Verlust | Ersatz |
|---|---|---|---|
| **Open-Meteo (alle Endpunkte)** | Free-Tier nicht-kommerziell + Rate-Limit; D-18 und fusionV2-C1 verbieten den Weg in ausgelieferte Artefakte | bequemer Multi-Modell-Punktabruf; fertiges Ensemble-API; fertiges Forecast-Archiv | Direktzugriff DWD/GeoSphere/MeteoSchweiz/ECMWF/NOAA — mehr Arbeit, gleiche Daten |
| **Meteostat (bis zur Lizenzklärung)** | Lizenz unbelegt | fertige, lange Tagesreihen für die Klimatologie | DWD CDC + GeoSphere `klima-v2-*` + MeteoSchweiz OGD-SMN |
| **Volles ECMWF-ENS als Regelbetrieb** | ~197 GB/Lauf (gemessen hochgerechnet) | 51-Member-Verteilung mit ECMWF-Qualität | GEFS-Mittel + Spread; ECMWF-ENS als belegpflichtige Ausbaustufe |
| **MOSMIX-Hindcast** | kein Archiv | 12 Monate früherer Beleg | Eigenarchiv ab Phase 0 |
| **Backend / bezahlte APIs** | D-01, Auftragsvorgabe | serverseitiges Subsetting, echtes Push | GitHub Actions + statische Artefakte |

---

## 6. Transport- und Betriebsgrenzen (Repo-Kontext)

| Grenze | Wert | Quelle |
|---|---|---|
| jsDelivr | 20 MB je Datei · **150 MB je Repo** | `docs/API.md` §8.1a |
| jsDelivr Sichtbarkeit nach Push | ≈ 35–57 s (neuer Pfad) | `audit/bandbreite.md` §28.4 |
| `buscosun-data`-Retention | 4 Läufe ≈ 45 MB, **Force-Push mit frischer Historie** | `scripts/publish-repack.mjs` |
| GeoSphere | 5 req/s · 240 req/h je IP | `docs/API.md` §4.1 |
| Netlify-Rewrites | `/_dwd_opendata`, `/_gfs`, `/_ecmwf`, `/_cscs`, `/_mf` | `netlify.toml` |
| ⚠️ Prod-Defekt | `/_mf`, `/_ecmwf`, `/_cscs` historisch nur im Vite-Dev-Proxy | `docs/API.md` §1.1 (A1/V-01) — **vor jedem ECMWF-Client-Pfad prüfen** |
| GitHub Actions | öffentliche Repos: freie Minuten; Job-Limit 6 h | *Annahme* (dokumentierte Politik, in dieser Runde nicht geprüft) |
| JS-Budget | totalJs 1089,3 / 1109,8 KB | `CLAUDE.md`-Kopf |

---

## 7. Prüfliste vor der Umsetzung (offene Belege)

1. Anzahl der MOSMIX-Stationen **innerhalb DACH** (aus `MOSMIX_L_LATEST.kmz`, 82,6 MB, einmalig).
2. Parameterliste MOSMIX_S (Behauptung „~40" ist unbelegt).
3. Member-Zahl ICON-EPS/ICON-EU-EPS am GRIB-Header, nicht aus der Doku.
4. Publikationslatenzen als **Verteilung über ≥ 24 Zyklen**, nicht als Einzelfall — das Muster
   dafür steht in `audit/bandbreite.md` §31.18.
5. Lizenz Meteostat, CORINE, Terrarium/AWS-ODR schriftlich belegen.
6. Reichweite von `noaa-gefs-retrospective` und `noaa-gefs-pds` (frühestes Datum) auszählen.
7. Prod-Erreichbarkeit von `/_ecmwf` gegen die Live-Site prüfen (A1/V-01).
