# Wetterdaten-Quellen für eine kommerzielle DACH-Web-App (buscosun-core) — Übersicht 2025/2026

## TL;DR
- **Für DACH baut man heute auf drei staatliche Säulen auf:** DWD OpenData (CC-BY 4.0, kostenlos, ICON-D2/EU/MOSMIX/RADOLAN/Warnungen), MeteoSwiss OGD (seit Mai 2025 CC-BY 4.0 via STAC, ICON-CH1-EPS 1 km / ICON-CH2-EPS 2.1 km, CombiPrecip) und GeoSphere Austria Data Hub (CC-BY 4.0 / teils CC0, INCA-Nowcast, AROME 2,5 km). Sie sind kommerziell uneingeschränkt nutzbar und Alpen-Physik-stark — Bright Sky bleibt der einfachste DWD-Wrapper.
- **Globales Modell-Rückgrat ist seit 1. Oktober 2025 ECMWF Open Data unter CC-BY 4.0** (IFS HRES, AIFS, ENS bei 0,25°; 9 km kommt 2026), redundant gespiegelt auf AWS/Azure/GCP. Open-Meteo bleibt der pragmatische Aggregator — kommerzielle Subscription ab $29/Monat (Standard 1 M Calls) bzw. 99 €/Monat (5 M).
- **Bei Spezialdaten zu Vorsicht raten:** RainViewer schließt 2026 die API (Founder-Blog: „transitioning our API services to limited operation throughout 2025"), Blitzortung verbietet kommerzielle Nutzung ausdrücklich, EUMETNET OPERA Pan-EU-Radar verlangt eine E-Mail-Registrierung. Für eine kommerzielle DACH-App ist die robuste Baseline daher: DWD + MeteoSwiss + GeoSphere + ECMWF Open Data + Open-Meteo Standard/Professional, ergänzt mit EUMETSAT Meteosat (frei ≥1 h), CAMS und einer bezahlten Blitz-/OPERA-Quelle, wenn benötigt.

## Key Findings

1. **Die Open-Data-Landschaft hat sich 2024–2025 fundamental gewandelt.** Drei Ereignisse verschieben den Markt: ICON ist laut DKRZ-Pressemitteilung „seit January 31, 2024 the renowned climate and weather model ICON has been made available to the public under an open source license" (BSD-3-Clause, Repo gitlab.dkrz.de/icon/icon-model, Release-Archiv mit DOI 10.35089/WDCC/IconRelease01); MeteoSwiss hat laut eigener Pressemitteilung „its wealth of collected, processed and refined meteorological and climatological data available to all interested parties free of charge from May 2025" geöffnet (Etappenfreigabe bis Ende 2026, „over a billion measurement, analysis and forecast values available each day"); ECMWF hat am 01.10.2025 den gesamten Real-Time-Katalog unter CC-BY 4.0 gestellt. Wer eine DACH-App heute baut, kann komplett auf staatliche CC-BY-Quellen setzen.

2. **Für DACH gibt es kein einzelnes „bestes" Modell — sondern eine Hierarchie nach Land:** ICON-D2 (2,1 km, DWD) ist der Standard für Deutschland/Alpenvorland; ICON-CH1-EPS (1 km, MeteoSwiss) für die Schweiz; AROME (2,5 km, GeoSphere bzw. Météo-France) ist der Referenzwert für Österreich, wobei INCA das DACH-bekannteste Nowcasting-System mit 1 km/15-min Auflösung ist. Für 3-15 Tage Vorhersage ist ECMWF IFS HRES (9 km, oder 0,25° in Open Data) die Goldstandard-Quelle.

3. **Realistische Throughput-Optionen für eine Web-App mit „tausenden Usern":** Direkte Calls von Browsern auf öffentliche APIs sind ein Anti-Pattern. Sowohl api.met.no (≤ 20 req/s pro Anwendung — alles darüber „requires special agreement") als auch DWD OpenData (kein API-Rate-Limit, aber Fair-Use) erwarten serverseitiges Caching. Open-Meteo Free ist hart limitiert (10 000 Calls/Tag, 5 000/h, 600/min, non-commercial), Standard ($29/Monat, 1 M Calls) erlaubt kommerzielle Nutzung. Für Map-Tiles/Radar Layer ist Caching auf eigenem CDN obligatorisch.

4. **Map-/Geocoding-Stack:** Nominatim selbst hosten ist günstig und legal sauber (1 req/s, kein Heavy-Usage laut OSM Foundation Usage Policy); Photon (Apache 2.0, Komoot-Demo „please be fair — extensive usage will be throttled") ist ideal als self-hosted Forward-Geocoder. OpenFreeMap (kostenlos, OSM-basiert) plus MapTiler oder Stadia Maps (Free-Tier 200 000 Tiles/Monat) deckt Tile-Hosting ab.

5. **Risiko-Quellen die in der App nicht eingesetzt werden sollten:** Blitzortung.org/LightningMaps.org (Lizenz schließt kommerzielle Nutzung ausdrücklich aus: „A commercial use of our data is strongly prohibited"); RainViewer API wird laut Founder-Blog auf rainviewer.com/blog/weather-radar-apis-2025-overview.html („After 10 years of building and maintaining Rain Viewer, I've made one of the most difficult decisions of my career: transitioning our API services to limited operation throughout 2025") in 2026 eingestellt; 7Timer hat seit Jahren keinen offiziellen API-SLA; OpenWeatherMap Free Tier ist zwar ODbL und erlaubt kommerziell mit Attribution, hat aber das Risiko eines Modellwechsels und ist DACH-mässig deutlich schwächer als ICON-D2/CH1.

## Details

### 1) Nationale DACH-Wetterdienste

#### DWD OpenData (Deutschland)
| Feld | Wert |
|---|---|
| URL | https://opendata.dwd.de · https://maps.dwd.de (GeoServer/MapProxy) · https://dwd-geoportal.de |
| Datentypen | ICON (global 13 km), ICON-EU (6,5 km), ICON-D2 (2,1 km), ICON-D2-EPS, ICON-EPS, MOSMIX (Stationsvorhersagen), RADOLAN/RADKLIM (Radar 1 km, 5 min, mit 2-Stunden-Nowcast „WN"), CDC (historische Klimadaten ab 1881), SYNOP-BUFR, Pollenflug, Warnungen (CAP), Satellit-Sekundärprodukte |
| Geo-Abdeckung | Deutschland (ICON-D2, RADOLAN, MOSMIX); Europa (ICON-EU); Global (ICON) |
| Lizenz | **CC BY 4.0** mit Quellenvermerk laut GeoNutzV: „Die Geodaten des DWD dürfen entsprechend der Creative Commons BY 4.0 - Lizenz (CC BY 4.0) unter Beigabe eines Quellenvermerks weiterverwendet werden" |
| Rate-Limit | Keine harten API-Limits dokumentiert. Fair-Use. GeoServer: „98% Verfügbarkeit" angegeben, kein Anspruch auf Verfügbarkeit. Für SLA: kostenpflichtiger „Geospatial Data Service" verfügbar |
| Kommerziell | **Ja, uneingeschränkt** (mit Attribution) |
| Self-Hosting | Daten frei, Modell-Code ICON unter BSD-3C seit 31.01.2024 |
| DACH-Tauglichkeit | **Exzellent.** ICON-D2 ist das Referenzmodell für Mitteleuropa (2,1 km, 65 vertikale Levels, alle 3 h, 27 h Vorhersage); RADOLAN ist Standard für Deutschland; ICON-EU deckt den Alpenraum |
| Anmerkung | Keine offizielle dedizierte „REST-API" — Zugriff via HTTPS-Verzeichnisstruktur (GRIB2, KML, CSV, BUFR), GeoServer WMS/WFS unter maps.dwd.de, und proxyiert über `dwd.api.proxy.bund.dev` (bundesAPI). Bright Sky ist der inoffizielle JSON-Wrapper |

#### Bright Sky (DWD-Wrapper, Drittprojekt)
| Feld | Wert |
|---|---|
| URL | https://brightsky.dev |
| Datentypen | DWD MOSMIX, Stationsbeobachtungen, ICON-Daten als JSON; Endpoints: `weather`, `current_weather`, `synop`, `sources`, `radar` |
| Lizenz | Code MIT; Daten unterliegen DWD-CC-BY-4.0 |
| Rate-Limit | „Free-to-use for all purposes." Die Brightsky-Homepage bestätigt: „Bright Sky now handles more than two million requests per day, and in total has served about 150,000,000 requests since its launch." Keine harten Limits dokumentiert, aber Fair-Use |
| Kommerziell | Ja |
| Self-Hosting | Komplett — Docker-Images verfügbar; das Projekt empfiehlt explizit Self-Hosting für hohe Volumen |
| DACH-Tauglichkeit | Deutschland-only (kein AT/CH); ideal als Ergänzung |

#### MeteoSwiss Open Government Data (Schweiz)
| Feld | Wert |
|---|---|
| URL | https://opendatadocs.meteoswiss.ch · STAC: https://data.geo.admin.ch/api/stac/v1/ · Forecast-Daten via CSCS-Object-Storage |
| Datentypen | **ICON-CH1-EPS** (1 km, 11 Member, alle 3 h, 33 h Forecast) und **ICON-CH2-EPS** (2,1 km, 21 Member, alle 6 h, 5 Tage) als GRIB auf nativem icosahedralem Grid (STAC-Collections `ch.meteoschweiz.ogd-forecasting-icon-ch1` und `ch.meteoschweiz.ogd-forecasting-icon-ch2`); **CombiPrecip** (Radar + Pluviometer-Fusion, 60-min, alle 10 min, HDF5/LV95); PRECIP/PRECIP SV (5-min); SwissMetNet-Stationsdaten (ca. 260 Stationen, 10-min); Hagel-Produkte (POH, MESHS); Klima-Zeitreihen ab 1864; Warnungen |
| Geo-Abdeckung | Schweiz und Alpenraum |
| Lizenz | **CC BY 4.0** (offiziell: „The 'Open Data' of MeteoSwiss are published accordingly under the Creative Commons Licence CC BY 4.0") mit Attribution „Source: MeteoSwiss" |
| Rate-Limit | Bulk-Download via STAC + CSCS Object Storage (keine harten Limits); reine Query-API noch nicht live |
| API-Status | **Wichtig:** Die opendatadocs.meteoswiss.ch-Hauptseite zitiert: „MeteoSwiss is also working to enable access to certain data through individual API queries. However, this option will not be available before end of 2026." Q2 2026 Roadmap: Beta einer EDR-API für Klimadaten und einer OGC-Features-API für Local Forecasts |
| Kommerziell | **Ja, uneingeschränkt** |
| Self-Hosting | Daten frei; STAC-Items komplett herunterladbar |
| DACH-Tauglichkeit | **Exzellent für CH**, deckt Alpen-Physik (Föhn, Stau, Lee) mit höchster Auflösung in der DACH-Region ab. ICON-CH1-EPS ist konzeptuell ICON-D2 sehr ähnlich, aber für die Schweiz optimiert |
| Anmerkung | Hosting auf Federal Spatial Data Infrastructure (FSDI, swisstopo) + CSCS public cloud object storage. **Rollende 24 h Vorhaltung** — kein Archiv auf STAC. Open-Meteo integriert MeteoSwiss als Datenquelle. D2-Reflektivitätsprodukte „expected to be available in 2026" |

#### GeoSphere Austria Data Hub (Österreich, vormals ZAMG)
| Feld | Wert |
|---|---|
| URL | https://dataset.api.hub.geosphere.at/v1/ · Portal: https://data.hub.geosphere.at · Doku: https://dataset.api.hub.geosphere.at/v1/docs/ |
| Datentypen | **NWP** (nwp-v1-1h-2500m AROME-AT 2,5 km, ensemble-v1-1h-2500m), **INCA-Nowcast** (nowcast-v1-15min-1km — DAS Alpine-Nowcasting-System für 1 km/15 min), Chemie-/Luftqualität (chem-v2-1h-3km/9km), SPARTACUS (historische Gitterklimatologie 1 km, täglich), HISTALP (lange Alpenklima-Zeitreihen), TAWES (Stations-10-min), Klima v1 (10 min/1 h/1 Tag), SYNOP, APOLIS-Klimatologie |
| Geo-Abdeckung | Österreich (AROME-AT, INCA); Alpenraum (HISTALP); SPARTACUS auch über AT hinaus |
| Lizenz | **CC BY 4.0** (Datasets) bzw. **CC0** (Metadaten); offiziell: „All data that is publicly accessible without authentication is licensed under Creative Commons Attribution 4.0" |
| Rate-Limit | Dokumentiert in der Doku; pro Endpoint Request-Limit. Im Allgemeinen großzügig, aber pro Anfrage limitierte Datenmenge |
| Kommerziell | **Ja**, „Many data sets are free to use, even commercially" |
| Self-Hosting | Daten frei |
| DACH-Tauglichkeit | **Exzellent für AT.** INCA (Integrated Nowcasting through Comprehensive Analysis) ist eines der besten Alpine-Nowcasting-Systeme weltweit, perfekt für Föhn, lokale Niederschlagsprozesse, Alpen-Stau-Lagen |
| Anmerkung | API-Migration: `hub.zamg.ac.at` → `hub.geosphere.at` läuft Dez 2025 aus. Outputs: GeoJSON, CSV, NetCDF. R-Paket `gsdata` und Python-Wrapper verfügbar |

### 2) Andere europäische Wetterdienste

#### Météo-France (Frankreich)
| Feld | Wert |
|---|---|
| URL | Portail neu: https://portail-api.meteofrance.fr · Alte URL `donneespubliques.meteofrance.fr` wird abgeschaltet · Auch auf data.gouv.fr |
| Datentypen | **AROME** 0,025° (~2,5 km, h+36, Frankreich-Metropole), **AROME-PI** (Prévision Immédiate / Nowcast), **ARPEGE** global (~10 km), AROME Outre-Mer, In-situ-Beobachtungen, Klimatologie, Radar |
| Lizenz | Etalab 2.0 (kompatibel mit CC-BY 4.0) |
| Rate-Limit | API Modèle AROME laut data.gouv.fr: **50 req/min**; Verfügbarkeit „Non communiqué"; Account-Pflicht (offener Account) |
| Kommerziell | Ja |
| DACH-Tauglichkeit | AROME deckt nur Metropolitan-Frankreich ab — wenig für DACH; ARPEGE ist global aber low-res |

#### KNMI (Niederlande)
| Feld | Wert |
|---|---|
| URL | https://dataplatform.knmi.nl · API: https://api.dataplatform.knmi.nl/open-data/v1/ |
| Datentypen | HARMONIE-AROME Cy43 (UWC-West, 2,5 km), HARMONIE-AROME EPS, Radar (5-min, korrigiert durch Pluviometer), Lightning Imager L2 (GLM/GOES-East), Wetterwarnungen, Wettermodellfelder, Air-Quality (LOTOS-EUROS) |
| Lizenz | **CC BY 4.0** für alle relevanten Datensätze |
| Rate-Limit | API-Key erforderlich (kostenlose Registrierung); Limits pro Key dokumentiert auf dem Developer Portal |
| Kommerziell | Ja |
| DACH-Tauglichkeit | HARMONIE UWC-West deckt einen Großteil Westeuropas mit 5,5 km ab; deutsche Nordsee/Niedersachsen-Tauglichkeit OK |

#### DMI (Dänemark)
| Feld | Wert |
|---|---|
| URL | Neue Endpoint (live seit 02.12.2025): https://opendataapi.dmi.dk — kein API-Key mehr nötig · Alt: dmigw.govcloud.dk (Auslauf 30.06.2026) |
| Datentypen | HARMONIE-DINI (2 km, Domain Denmark/Iceland/Netherlands/Ireland), HARMONIE-IG (Iceland/Greenland), DKSS (Sturmflut-Modell), WAM Wellen |
| Lizenz | **CC BY 4.0** seit 30.11.2023 (offiziell: „DMI's Open Data are distributed under the Creative Commons License CC BY 4.0") |
| Rate-Limit | „There is a fair use limit to allow only 500 requests per 5 seconds" — HTTP 429 bei Überschreitung. Default-Pagination 1000 Records |
| Kommerziell | Ja |
| DACH-Tauglichkeit | **Schwach** — DINI-Domain deckt höchstens Norddeutschland randständig ab. AT/CH komplett außerhalb |

#### MET Norway (api.met.no)
| Feld | Wert |
|---|---|
| URL | https://api.met.no · https://docs.api.met.no |
| Datentypen | **Locationforecast/2.0** (global! Nordic: MEPS 2,5 km, Arctic: AROME-Arctic 2,5 km, Rest: ECMWF HRES ~9 km), **Nowcast/2.0** (Nordic-Radar, 2 h, 5-min), **Radar** (PNG-Tiles, nur Nordeuropa), **MetAlerts** (CAP-Warnungen Norwegen) |
| Lizenz | **NLOD 2.0 + CC BY 4.0** (offiziell: „all data and products are licensed under the Norwegian Licence for Open Government Data (NLOD) 2.0 and Creative Commons 4.0 BY International licences") mit verpflichtender Attribution „MET Norway" |
| Rate-Limit | „Anything over 20 requests/second per application (total, not per client) requires special agreement"; obligatorischer eindeutiger User-Agent-Header mit Kontakt; Lat/Lon max 4 Dezimalstellen |
| Kommerziell | Ja, aber kein SLA (Zitat: „We cannot really offer any higher levels of service to paying customers"). „Has been approved as a digital public good by the UN-led Digital Public Goods Alliance" |
| DACH-Tauglichkeit | **Locationforecast funktioniert global für DACH-Punkte**, basiert dann aber auf ECMWF IFS HRES 9 km (kein lokales Postprocessing). Radar/MEPS sind Nordic-only |
| Anmerkung | Hervorragende Datenqualität und Doku; ideal als Fallback und für Vergleich. Kein Browser-Direkt-Call erlaubt — Proxy/Backend nutzen |

#### SMHI, AEMET, IPMA, Met Éireann, KMI/IRM, Met Office UK, MeteoLux
- **SMHI:** Open Data API (https://opendata.smhi.se), MetCoOp-Partner (MEPS), Forecast und Observations frei (CC BY 4.0). Coverage Skandinavien. Nicht DACH-relevant.
- **AEMET:** OpenData (https://opendata.aemet.es) mit API-Key, HARMONIE-Spanien. Coverage Spanien.
- **IPMA:** Open-Data-Portal mit Beobachtungen und Warnungen (CC BY).
- **Met Éireann:** Open Data via data.gov.ie, HARMONIE-IRL.
- **KMI/IRM Belgien:** Begrenzte Open-Data-Verfügbarkeit, OPERA-Beteiligung.
- **Met Office UK:** DataPoint stillgelegt; aktuell Met Office Weather DataHub (kostenpflichtig); UK-Open-Data eingeschränkt; nicht praktisch nutzbar.
- **MeteoLux:** Sehr kleine Open-Data-Initiative; nicht DACH-relevant.

### 3) EU-weite Programme

#### ECMWF Open Data
| Feld | Wert |
|---|---|
| URL | https://www.ecmwf.int/en/forecasts/datasets/open-data · Daten: https://data.ecmwf.int/forecasts/ · Cloud-Spiegel: AWS, Azure, GCP (`ecmwf-opendata` Python-Client) |
| Datentypen | **IFS HRES** und **AIFS** (KI-Modell) — Atmosphäre, Wellen (WAM); Ensembles (51 Member); seasonal; aktuell 0,25° (~25 km), 9 km „later in 2026" mit 2-h-Latenz |
| Lizenz | **CC BY 4.0** + ECMWF Terms of Use (seit 01.10.2025 voller Real-Time-Katalog). Offiziell: „A subset of ECMWF real-time forecast data from the IFS and AIFS models is made available to the public free of charge. Their use is governed by the Creative Commons CC-BY-4.0 licence" |
| Rate-Limit | Rolling Archive (12 Vorhersageläufe ≈ 2-3 Tage); zur Stabilität Limits am Portal; Empfehlung: Cloud-Spiegel nutzen |
| Kommerziell | **Ja, voll erlaubt** mit Attribution |
| Self-Hosting | Daten frei downloadbar; höhere Auflösungen via Real-time Dissemination Service Agreement (Volume Band / Service Pack Charges, individuell vereinbart) |
| DACH-Tauglichkeit | **Ausgezeichnet** für 3-15 Tage Vorhersage; Goldstandard global. AIFS zeigt z.T. bessere Skill-Werte als IFS in mittleren Lagen |
| Anmerkung | Laut ECMWF-Pressemitteilung 2025: „Since expanding free and open datasets, ECMWF has seen a 150% increase in open data retrievals, with the ECMWF Data Portal now serving approximately 680 TB per month." Seit 01.10.2025 ist der gesamte Real-time-Katalog offen |

#### Copernicus CDS / ADS / EWDS (ERA5, CAMS, CEMS)
| Feld | Wert |
|---|---|
| URL | https://cds.climate.copernicus.eu · https://ads.atmosphere.copernicus.eu (CAMS) · https://ewds.climate.copernicus.eu (EFAS/GloFAS) |
| Datentypen | **ERA5** (Reanalyse 1940–heute, 31 km, hourly), **ERA5-Land** (9 km), Seasonal Forecasts (UK Met Office, Météo-France, ECMWF, CMCC, DWD), CMIP6, **CAMS** (Luftqualität, Pollen, UV, Aerosole — globale Forecasts), EFAS (Hochwasser Europa), GloFAS |
| Lizenz | **CC BY 4.0** seit 02.07.2025 (vorher „Licence to use Copernicus Products"). Offiziell ECMWF-Forum: „On Wednesday 2nd July 2025, the License to use Copernicus Products in the Climate Data Store (CDS), Atmosphere Data Store (ADS) and the CEMS Early Warning Data Store (EWDS) will be replaced with the Creative Commons Attribution License (CC-BY)" |
| Rate-Limit | Anmeldung erforderlich (CDS-API mit Token); Queue-System, faire Nutzung; keine harten Counts |
| Kommerziell | Ja |
| DACH-Tauglichkeit | ERA5 ist die Standard-Klimareanalyse für DACH (mit ICON nicht spezifisch alpinen Auflösung); CAMS-Pollenflug ist sehr nützlich für Web-Apps |
| Anmerkung | ERA5-Latenz ~5 Tage; ERA5T-Frühreleases möglich. Open-Meteo serviert ERA5 schon performant (Multi-Dekaden-Zeitreihen in <100 ms) |

#### EUMETSAT
| Feld | Wert |
|---|---|
| URL | https://data.eumetsat.int · User Portal: user.eumetsat.int |
| Datentypen | Meteosat-Satellit (MSG, MTG), Metop, Sentinel-3/-6 für Met-Anwendungen, EUMETView, abgeleitete Produkte (Cloud, SST, Precipitation Estimates) |
| Lizenz | Mehrstufig (vor allem für Geostationary): **Hourly EUMETSAT imagery is no longer subject to licensing**; volle Auflösung 15-Minuten-Bilder frei nach **3 h** Verzögerung. <1 h Latenz: Lizenzpflicht (LESS_THAN_1H Licence) — nicht kostenlos |
| Rate-Limit | Data Store hat Quota auf Account-Basis |
| Kommerziell | Ja, bei jeweiliger Lizenz-Stufe |
| DACH-Tauglichkeit | Meteosat MSG/MTG deckt Europa hervorragend ab — ideal für Live-Cloud-Layer und Wolken-Animationen |

#### EUMETNET OPERA (Pan-EU Radar Composite)
| Feld | Wert |
|---|---|
| URL | https://www.eumetnet.eu/observations/weather-radar-network/ · Daten via DCPC ODPI |
| Datentypen | Pan-EU Radar-Composite (160+ Radarstationen, 2D Max Reflektivität, Niederschlagsrate, 1-h-Akkumulation), 1-2 km Auflösung, **5-15 min Update**; HDF5/BUFR/ODIM |
| Lizenz | **Nicht offen** — „Requires free research account/license: email info@eumetnet.eu" |
| Rate-Limit | Account-basiert |
| Kommerziell | Nicht standardmäßig offen — über RODEO-Projekt (laufende EU-Initiative) soll API-Zugriff aufgebaut werden |
| DACH-Tauglichkeit | Idealer Layer für eine DACH-App (deckt alle drei Länder einheitlich ab); aber Lizenz-Hürde |
| Anmerkung | **RODEO-Projekt (rodeo-project.eu)** baut bis ca. 2026 eine offene API für OPERA-Composites unter HVD-Regulation (High Value Datasets); Pan-European-Composite + Archive >10 J + 24-h-Cache der Volume-Daten geplant |

### 4) Spezialisierte Quellen (Blitz, Radar, Satellit)

#### Blitzortung.org / LightningMaps.org
- **Lizenz**: „A commercial use of our data is strongly prohibited, even by the users that send data to our servers." Karten z.T. CC BY-SA 4.0, Daten **nicht**.
- **Verdikt für buscosun-core: NICHT NUTZBAR** in kommerzieller Web-App. Alternative: nowcast GmbH (LINET, kostenpflichtig), Vaisala Xweather Lightning, Meteorage.

#### RainViewer
- **Status 2025/26: WIRD EINGESTELLT.** Founder-Blog auf rainviewer.com/blog/weather-radar-apis-2025-overview.html: „After 10 years of building and maintaining Rain Viewer, I've made one of the most difficult decisions of my career: transitioning our API services to limited operation throughout 2025." Bestätigung im Flowx-Forum: „RainViewer has informed us that their radar API will stop Jan 2026."
- **Migrationsempfehlung** (eigener RainViewer-Blog): Rainbow Weather, OpenWeatherMap, Tomorrow.io, Xweather. **Aktion: buscosun muss RainViewer ablösen.**

#### Rainbow Weather (rainbow.ai)
- ML-Nowcast-Tiles, Coverage ähnlich zu RainViewer (außer China). Preis (Stand RainViewer-Blog 2025): **Tiles API $0,20 / 1 000 Calls mit 30 000 Free/Monat; Forecast $0,10 / 1 000 mit 5 000 Free**. Custom Color Schemes möglich.

#### NOAA NOMADS / GFS / GEFS / HRRR
- URL: https://nomads.ncep.noaa.gov · Daten Public Domain (US Government Work, kein Copyright)
- GFS (13 km), GEFS Ensemble (25 km/50 km), HRRR (3 km — nur USA, nicht DACH-relevant)
- Kommerziell uneingeschränkt; ideal als globales Backup-Modell. DACH-Tauglichkeit: GFS ist robust, aber niedriger aufgelöst als ICON-D2/EU.

#### 7Timer
- URL: http://www.7timer.info · GFS-basierte Forecasts mit speziellen Astronomie-Produkten (Astro-Seeing); Forschungsprojekt, keine SLA, Status unklar; nur für nicht-kritische Use Cases.

### 5) Kommerzielle APIs mit Free Tier

#### Open-Meteo
| Feld | Wert |
|---|---|
| URL | https://open-meteo.com |
| Datentypen | Aggregiert ICON, ECMWF IFS HRES (native 9 km!), GFS, HRRR, MET Norway, KNMI, DMI, MeteoSwiss, GeoSphere etc. + Marine, Air Quality, Pollen, Solar Irradiance, ERA5/ERA5-Land Historical, Single-Run-Archiv |
| Lizenz Data | CC BY 4.0; Code AGPLv3 (Server selbst hostbar) |
| Free-Tier Rate-Limit | **10 000 Calls/Tag, 5 000/h, 600/min** — explizit **non-commercial** („operating websites or apps that have subscriptions or display advertisements" = commercial → kostenpflichtig) |
| Paid-Tiers | **Standard $29/Mo = 1 M Calls; Professional 99 €/Mo = 5 M Calls; Enterprise 50 M+ Calls/Mo**; dedizierte Endpoints, API-Key, 99,9% Uptime-Target |
| Self-Hosting | **Vollständig möglich** — Server-Code AGPLv3; Daten auf AWS S3 Open-Data; Patrick Zippenfenig (Maintainer) empfiehlt explizit Self-Hosting für „workloads in the billions" |
| DACH-Tauglichkeit | **Sehr gut.** „Best-match" wählt automatisch ICON-D2/CH1/AROME für hochaufgelöste Lokalvorhersagen |
| Bewertung | **Top-Empfehlung als zentraler Aggregator** für eine kommerzielle Web-App; spart die ICON/ECMWF/AROME-Eigen-Pipeline. AGPLv3 ist bei normaler API-Nutzung unproblematisch (keine Code-Modifikation) |

#### Pirate Weather (Dark Sky Nachfolger)
- URL: https://pirateweather.net · Open-Source-API mit Dark-Sky-kompatibler Response-Struktur
- Datenquellen: HRRR-Subh, RTMA-RU, HRRR 0-18/18-48, NBM, **ECMWF IFS**, GFS, GEFS, MOSMIX-Distanz wird angegeben
- Lizenz: Open Source (AGPL für Code); Daten je nach Quelle
- Pricing/Tier: Free-Tier (aktuell ~10 000 Calls/Monat laut docs Blog); Self-Hosting möglich
- DACH-Tauglichkeit: Solide, da auf ECMWF IFS + GFS basiert; **kein lokales hochaufgelöstes Modell für DACH** im aktuellen Routing

#### OpenWeatherMap
- URL: https://openweathermap.org
- Lizenz: **ODbL (Open Database License)** für Self-Service-Pläne; commercial use erlaubt mit Attribution (sichtbar, nicht im Hidden-Footer)
- Free: 1 000 Calls/Tag, 60/min One Call API 3.0; Geocoding 60/min, 1 M/Monat
- Paid: One Call 3.0 Pay-as-you-call ($0,0012-0,0018/Call); Professional Plans monatlich
- DACH-Tauglichkeit: Verarbeitet GFS + andere; DACH-Auflösung niedriger als ICON-D2 — solide aber nicht alpenstark

#### Tomorrow.io (ehemals ClimaCell)
- Free Trial 30 Tage, dann €300/Monat für 1 M Calls / €600/3 M / €700/5 M / €950/10 M
- DACH-Tauglichkeit: Eigenes Hyperlocal-Modell, aber für AT/CH-Alpen-Physik kein Vorteil ggü. ICON-CH1

#### Visual Crossing Weather
- Free: 1 000 Records/Tag; ab $35/Monat
- Stärke: 50 Jahre Historical, Forecast-Aufruf flexibel
- Lizenz: Commercial mit Attribution erlaubt auch im Free-Tier

#### WeatherAPI.com
- 1 M Calls/Monat Free für 30 Tage, dann ab €990/Jahr für 1 M/Monat
- Globale Coverage, kein DACH-Vorteil

#### Xweather (ehemals Aeris)
- Mehrere kommerzielle Pläne; sehr gute Visualisierungs-Tools
- Datenintegration mit Vaisala (Lightning) — Premium-Quelle für Blitzdaten

#### Meteomatics
- Schweizer kommerzieller Anbieter; **proprietäre 1-km Schweiz-Daten** (eigenes Postprocessing); sehr stark für Alpen-Physik; Preise pro Anfrage (kontaktbasiert; tendenziell teuer für Web-Apps, eher Enterprise)

### 6) Self-Hosting / Open-Source Modelle

#### ICON (DWD/MPI-M/MeteoSwiss/KIT/DKRZ/C2SM)
- **BSD-3-Clause** — laut DKRZ-Pressemitteilung „Since January 31, 2024, the renowned climate and weather model ICON has been made available to the public under an open source license"; aktueller Release 2026.04; Repo: https://gitlab.dkrz.de/icon/icon-model · Webseite: https://icon-model.org · Release-Archiv mit DOI 10.35089/WDCC/IconRelease01
- Voraussetzungen: HPC-Cluster (GPU empfohlen via C2SM-Konfig), GRIB2-Toolchain (ecCodes), ICON-Tools (DWD, nicht in Open Source, aber CDOs als Alternative)
- DWD Tutorial verfügbar (2025-04-1 Release)
- Für eine kommerzielle Web-App nur sinnvoll, wenn Eigenmodellierung Geschäftsmodell ist — sonst unrealistisch (Multi-100k-€ HPC)

#### WRF (Weather Research and Forecasting Model)
- NCAR/NOAA, **Public Domain**
- Klassiker für eigenes Setup; in Container-Stack einbindbar (NCAR liefert offizielle Containerimages); benötigt Initialbedingungen (GFS, ICON, ECMWF Open Data)

#### Tooling: eccodes (ECMWF), CDO, NCO, xarray, GRIBJump, NumPy/PySTAC
- Alle Open Source, BSD/Apache
- Pipeline: ICON/ECMWF GRIB → CDO/eccodes/regrid → NetCDF/Zarr/Parquet → eigener Tile-Server (z.B. titiler) → MapLibre

#### Self-hostable Aggregator-Server
- **Open-Meteo Server (AGPLv3)** — kompletter Stack, S3-Cloud-Native; Maintainer-Recommend für „workloads in the billions"
- Alliander Weather Provider API (MPL-2.0) — KNMI/ERA5-Aggregator
- Bright Sky (MIT, dwdparse Python-Package) — DWD-Wrapper

#### WeeWX, pywws
- Open Source für eigene Wetterstationen (Hardware → JSON/MQTT), nicht für Forecast-Daten relevant; kann eigene Stations-Daten in die App einspeisen

### 7) Geocoding / Karten Alternativen

| Service | Lizenz | Free Tier / Limits | Anmerkung |
|---|---|---|---|
| **Nominatim (osm.org)** | Daten ODbL; Software GPL | 1 req/s, kein Heavy-Use, kein Auto-Lookup | Public Instance NICHT für commercial Heavy-Use; Self-Hosting nötig |
| **Photon (komoot)** | Apache 2.0; Daten ODbL | „Please be fair", Throttle bei Heavy-Usage | Self-Hosting empfohlen; GraphHopper liefert wöchentliche DB-Dumps |
| **OpenCage** | ODbL-Daten | 2 500/Tag free; bezahlt ab $50/Monat | Geocoding-Aggregator |
| **Geoapify** | ODbL-Daten | 100 000/Monat free (Link-back required für commercial Free); paid ab $5/Monat | Solider Free Tier |
| **MapTiler** | proprietär + OSM | 100 000 Tile Requests/Monat Free Cloud; SDK Free | Hosted Tiles + Vector |
| **Stadia Maps** | proprietär + OSM | 200 000 Map Loads/Monat Free | Tile-Hosting |
| **OpenFreeMap** | OSS, OSM | 100 % kostenlos, „use without limits" | Komplett selbst-betreibbares Vector-Tile-Backend |
| **Mapbox** | proprietär | 50 000 Map Loads/Monat Free | Teuer bei Skalierung |
| **PickPoint** | ODbL | 2 500/Tag non-commercial free | OSM-basiert |

**Empfehlung für buscosun-core**: Photon self-hosted (Forward Geocoding mit Search-as-you-type, perfekt für DACH-Ortsnamen wie „Zell am See") + OpenFreeMap oder MapTiler Free Tier für Basemaps + Nominatim self-hosted für Detail-Reverse-Geocoding.

## Vergleichstabelle: Top-Optionen pro Datentyp

| Datentyp | Top-Option DACH | Backup / Alternative | Kommentar |
|---|---|---|---|
| **Gridded Forecast (Map-Layer)** | DWD ICON-D2 + ICON-EU; MeteoSwiss ICON-CH1; GeoSphere AROME-AT | ECMWF Open Data IFS HRES 0,25°; Open-Meteo | ICON-D2 = 2,1 km Mitteleuropa; ICON-CH1 = 1 km CH |
| **Stationsdaten** | DWD MOSMIX/CDC (Bright Sky); GeoSphere TAWES; MeteoSwiss SwissMetNet | MET Norway Locationforecast | Bright Sky einfachster Wrapper |
| **Radar / Nowcast** | DWD RADOLAN/WN (5-min, 2-h-Nowcast); MeteoSwiss CombiPrecip; GeoSphere INCA | Rainbow.ai bei Multi-Country-Layer | RainViewer abkündigend; OPERA Lizenz-Hürde |
| **Vertikale Profile (Skew-T)** | DWD ICON/ICON-EU pressure levels GRIB; ECMWF Open Data | Open-Meteo `pressure_level` Variablen | DWD GRIB2 hat alle Levels; Open-Meteo deckt 1000-10 hPa |
| **Klimadaten / Historical** | DWD CDC (1881–); MeteoSwiss (1864–); ERA5 (1940–) | Open-Meteo Historical Forecast/ERA5 | ERA5 als Standard-Reanalyse |
| **Blitz-Daten** | nowcast GmbH (LINET, kommerziell); Vaisala Xweather; Meteorage | **NICHT Blitzortung/LightningMaps** (lizenzrechtlich verboten kommerziell) | Stark eingeschränktes Feld für CC-frei |
| **Wetter-Warnungen** | DWD CAP (opendata + WarnWetter API); MeteoSwiss Warnings; GeoSphere | MET Norway MetAlerts (Norwegen); EU MeteoAlarm | Alle Länder via CAP-Format |
| **Modell-Daten (Native GRIB)** | DWD opendata.dwd.de; MeteoSwiss STAC; GeoSphere | ECMWF Open Data + Cloud Mirror (AWS/Azure/GCP) | Komplett offen |
| **Satellit** | EUMETSAT Meteosat MSG/MTG (15-min, ab 3-h-Latenz frei) | NOAA GOES (USA-Fokus); Sentinel-3 SLSTR | Meteosat = Pflichtquelle für DACH-Sat-Layer |

## Recommendations

### Empfohlener Stack für buscosun-core (kommerzielle DACH-Web-App)

**Stage 1 — Sofort (Baseline ablösen RainViewer + skalieren):**
1. **Forecast-Aggregation:** Open-Meteo Standard ($29/Monat, 1 M Calls) als zentraler Endpoint für Point-Forecasts; nutzt automatisch ICON-D2 (DE), ICON-CH1 (CH), AROME-AT (AT). Spart sofort 80 % Eigen-Engineering.
2. **Stationsdaten/Beobachtungen:** Bright Sky weiterhin nutzen (kostenlos, CC-BY 4.0); für AT/CH parallele Calls auf GeoSphere bzw. MeteoSwiss-OGD STAC.
3. **Radar / Map-Layer:** RainViewer ablösen durch:
   - **Deutschland**: DWD RADOLAN/WN-Produkte als WMS-Tiles via maps.dwd.de/geoproxy (5-min Update, 2-h-Nowcast); 98 % Uptime-Target.
   - **Schweiz**: MeteoSwiss CombiPrecip via STAC (HDF5, eigenes Tile-Rendering).
   - **Österreich**: GeoSphere INCA Nowcast (1 km / 15 min) via API.
   - **Alle drei zusammen / Europa**: kurzfristig Rainbow.ai Tiles (ab $0,20 / 1 000) oder OpenWeatherMap Radar; mittelfristig OPERA RODEO API beobachten.
4. **Warnungen:** DWD CAP + MeteoSwiss-Warnings + GeoSphere — alle als CAP. Aggregator-Schicht im eigenen Backend.
5. **Satellit:** EUMETSAT Data Store ≥1-h-Latenz, free; nur Backend-Worker mit Account.
6. **Geocoding:** Photon self-hosted (Docker, ~2 GB DACH-Extract) + Nominatim self-hosted Backup.
7. **Basemap:** OpenFreeMap oder MapTiler Free Tier.

**Stage 2 — bei Wachstum (10k+ DAU):**
- Upgrade Open-Meteo auf Professional 99 €/Monat (5 M Calls) ODER **selbst hosten** (AGPLv3) — ab dem Punkt günstiger.
- Eigener Tile-Server (titiler) mit S3-gecachten DWD/MeteoSwiss/GeoSphere-Tiles für Map-Layers; Backend ingestiert GRIB2 alle 3 h.
- ECMWF Open Data direkt anzapfen (AWS Bucket `ecmwf-forecasts`) für 9-15 Tage Forecast — kostenlos.
- Add: CAMS für Pollen-/Luftqualitäts-Layer (gerade in DACH stark nachgefragt).
- Add: ERA5 historische Zeitreihen für „Wie war das Wetter vor 5 Jahren" — Open-Meteo Historical API oder eigener Zarr-Cache.

**Stage 3 — Premium-Features:**
- Lightning: Vaisala Xweather oder nowcast LINET kommerziell — keine kostenlose Alternative mit kommerzieller Lizenz für DACH.
- OPERA Pan-EU-Radar via RODEO-API (sobald offiziell), oder Direkt-Lizenz von EUMETNET.
- Meteomatics für hochpräzise Alpen-Forecasts wenn Föhn/Bise/Lokalwind Kern-Feature werden.

### Benchmarks, die die Empfehlung ändern würden

| Beobachtung | Aktion |
|---|---|
| Open-Meteo Free 429er-Antworten > 5 % aus Production | Sofort Standard-Subscription oder Self-Hosting |
| DAU > 50 000 oder Map-Layer-Tile-Requests > 50 M/Monat | Self-Hosting Open-Meteo + eigener Tile-Server obligat |
| Nutzer fordern Blitz-Layer | Vaisala/nowcast Lizenz (€-Aufwand, nicht ausweichbar) |
| Web-App expandiert nach Skandinavien | MET Norway + SMHI integrieren (gratis) |
| RODEO-OPERA-API live | Migration von Rainbow.ai zu RODEO für Pan-EU-Layer |
| MeteoSwiss EDR-API live (Ende 2026+) | Direkt-Calls statt STAC-Polling für CH-Forecasts |

## Caveats

- **Lizenz-Diligence:** Bei CC-BY 4.0 ist Attribution Pflicht — bei MeteoSwiss explizit „Source: MeteoSwiss", bei DWD „DWD" mit Quellenvermerk, bei ECMWF Beispiel-Wording dokumentiert. Attribution muss nahe der Datenanzeige stehen, nicht im versteckten Impressum. Bei ODbL (OpenWeatherMap, OSM) ist zusätzlich die Database-Sharing-Klausel zu beachten, falls man aggregiert weiterverkauft.
- **MeteoSwiss API-Status:** Die volle Query-API kommt **nicht vor Ende 2026** (eigene Aussage in opendatadocs.meteoswiss.ch: „this option will not be available before end of 2026"). Bis dahin nur Bulk-STAC-Download — das ist für Web-Apps unhandlicher und erzwingt Backend-Caching. Hinweis: Die Task-Vorgabe nannte „seit März 2024" — die offizielle Pressemitteilung datiert Mai 2025 als formellen Open-Data-Start.
- **ECMWF AIFS:** Ist KI-Modell, in vielen Skill-Metriken besser als IFS, aber Datenstruktur und Variablen-Set noch in Bewegung — produktiv mit Bedacht einbauen.
- **Blitzortung/LightningMaps:** Mehrere DACH-Apps nutzen die Daten trotz Verbot — rechtliches Risiko. Für kommerzielle Anwendung disqualifiziert.
- **OPERA-Radar:** „Pan-EU" klingt verlockend, aber Lizenz/Account-Hürde + 15-min-Latenz machen es weniger attraktiv als nationale Composites mit 5-min-Updates.
- **RainViewer-Migration ist ein Muss**, Stand Mai 2026: API geht im Januar 2026 in Limited Operation und wird gestoppt — die existierende buscosun-core-Integration ist End-of-Life.
- **api.met.no Limits sind nicht verhandelbar:** 20 req/s über alle Clients, sonst Throttle/Block. Browser-Direkt-Calls verstoßen gegen ToS — Proxy-Backend zwingend.
- **DACH-spezifische Datenqualität:** ICON-D2/ICON-CH1 sind real die besten DACH-Modelle (eigene NWP-Validierungs-Studien von DWD/MeteoSwiss), gefolgt von Meteomatics-eigenen Postprocessing-Layern. AROME (Météo-France) und HARMONIE (UWC-West/KNMI) sind solide für Westeuropa, aber im Alpenraum schwächer als ICON-CH1.
- **Self-Hosting ICON ist nur sinnvoll, wenn Modellierung das Produkt ist** — operationeller Betrieb verlangt HPC + 24/7 Operations + Initial-Conditions-Bezug; das ist sechsstellig pro Jahr ohne Mehrwert ggü. fertigen Open-Data-Outputs.
- **Datenstand:** Alle Zahlen, Preise und Lizenzbedingungen sind Stand 2025/2026; speziell die ECMWF-9-km-Erweiterung „later in 2026", die MeteoSwiss-EDR-API „end of 2026" und die OPERA-RODEO-API sind angekündigt, aber noch nicht live — vor Produktivnutzung verifizieren.