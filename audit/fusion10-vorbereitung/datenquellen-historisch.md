# Historische Daten DE/AT/CH für buscosun Fusion — Recherche

> Stand 07.10.2026 · Cowork-Sitzung. Geprüft an den Verzeichnissen und Beschreibungen der Anbieter (Links unten).
> Nicht heruntergeladen, nichts gemessen außer den genannten Metadaten. dwd.de sperrt automatischen Abruf; der Inhalt
> der DWD-Seite „Klimadaten Deutschland – Tages-/Monatswerte“ liegt im CDC unter `observations_germany/climate/daily/kl`
> und `monthly/kl`.

## Grundsatz

Historische Messungen liefern keine Vorhersage-Mess-Paare. Den vorlaufabhängigen Modellfehler lernt Fusion weiter nur
aus dem Hindcast und dem Punktarchiv. Historische Daten helfen bei: Klimatologie (Langfrist), Downscaling ohne Station,
flächiger Wahrheit und bisher unbewerteten Größen. **Leck-Regel:** Alles, was auf Daten mit Ausgabe- oder Gültigkeitszeit
im Tresor (2024-04-01 … 2025-08-31) gefittet wird, kontaminiert Spur R (`scripts/pruefstand/protokoll/p1/tresor.json`).

## Deutschland (DWD Open Data, CDC und REA)

| Prio | Datensatz | Pfad | Inhalt | Hilft gegen |
|---|---|---|---|---|
| P1 | HOSTRADA | `CDC/grids_germany/hourly/hostrada` | stündlich, 1 km, ab 1995, Verzug ~1 Monat; T, Td, rF, Mischungsverhältnis, Bewölkung, Wind 10 m (Betrag/Richtung), Druck (NN/Station), Globalstrahlung, Wärmeinsel; NetCDF ~170 MB je Monat und Größe; GeoNutzV | Langfrist (Wind/Bewölkung/Td schlechter als Klimatologie): Stunde × Saison-Klimatologie an jedem DE-Punkt; Klimatologie für Punkte ohne Station |
| P1 | ICON-DREAM-EU | `REA/ICON-DREAM-EU` | ICON-Reanalyse 6,5 km Europa (inkl. AT/CH), stündlich ab 2010, Verzug 2–3 Monate; T_2M, TD_2M, TMIN/TMAX_2M, U/V/WS_10M, VMAX_10M, CLCT, TOT_PREC, Strahlung, PS/PMSL, Profile (T, U, V, QV, P), Z0; GRIB2 | Downscaling ohne Station: 16 Jahre Zelle gegen Station inkl. Winter (Lernstufe kennt 7–48 h nur Sommer); auch CH. Analyse, kein Vorlauffehler |
| P2 | Lange Stationsreihen | `CDC/observations_germany/climate/hourly`, `/10_minutes` | T, Td, Wind, Böe (`extreme_wind`, FX), Bewölkung, Niederschlag, ~500 Wetterstationen, seit den 1990ern | Stationsklimatologie heute aus 1 217 Tagen (3,3 Jahre) → robust je Stunde × Saison inkl. 0,9-Quantil; sofort für die 293 CDC-Temperaturstationen aus Schema 5 |
| P2 | RADOLAN RW historisch / RADKLIM | `CDC/grids_germany/hourly/radolan` (`historical`, `reproc/2017_002`) | Radarniederschlag stündlich 1 km ab 2001 | Niederschlag ja/nein flächig, Nachbarschafts-Wahrscheinlichkeit, Bewertung ohne Station (Befund 8 des Expertenberichts) |
| P3 | Tageswerte KL | `CDC/observations_germany/climate/daily/kl` | TNK, TXK, TGK (5 cm), SHK_TAG Schneehöhe, FX, NM … seit 1781 | Nacht-/Kaltluftmerkmal (TGK − TNK), Schnee-Wahrheit |
| P3 | Stündlich: Niederschlagsform WRTR (ab 1995), Sichtweite, Druck; täglich `weather_phenomena` (Nebel, Gewitter, Hagel, Glatteis) | `CDC/…/hourly/precipitation`, `visibility`, `pressure`; `daily/weather_phenomena` | Wahrheit für unbewertete Größen (Niederschlagsart, Sichtweite, Druck) |
| P3 | DUETT | `CDC/grids_germany/hourly/duett` | Globalstrahlung + Sonnenscheindauer 1 km stündlich ab 2024, CC BY 4.0 | Wahrheit Globalstrahlung |
| P3 | Windparameter 1 km | `CDC/grids_germany/multi_annual/wind_parameters` | mittlerer Wind 10–100 m + Weibull k/c, 1981–2000 | statischer Gelände-Windfaktor, Windquantile |

Schon vorhanden: 1-km-Monatsnormale 1991–2020 (T, Niederschlag, Sonne) als Temperatur-Prior (AX-9, `?cg=1`, gebaut und
gemessen, Voreinstellung aus, E-AX-9); Wahrheit W1 aus CDC 10-min/stündlich; Archiv-Schema 5 schreibt seit 05.10.
CDC-Stationen mit. Nicht lohnend: COSMO-REA6 (endet 2019), REGNIE (von HYRAS abgelöst), HYRAS-Tageswerte und
Monatswerte für eine stündliche Vorhersage.

## Österreich (GeoSphere Data Hub, CC BY 4.0) und Schweiz (MeteoSwiss OGD, „Source: MeteoSwiss“)

| DWD-Gegenstück | Österreich | Schweiz |
|---|---|---|
| HOSTRADA (stündliche 1-km-Analyse) | INCA-v1 `inca-v1-1h-1km`: stündlich, 1 km, 15.03.2011–heute; T, Niederschlag, Wind, Feuchte, Strahlung, Druck. **Wird Ende Dezember 2026 eingestellt**; INCA-v2 (`inca-v2-1h-1km`) beginnt erst am 01.10.2026 → Archiv vorher sichern | keine offene stündliche Analyse. Nur C3 Tagesraster 1 km (TabsD/TminD/TmaxD, RhiresD, SrelD; Jahrzehnte zurück) und C4 Satellit (Strahlung, Bewölkung, stündlich, Archiv erst ab 2025) |
| ICON-DREAM-EU | deckt AT ab; zusätzlich ARA (`ara-v1-1h-2500m`): AROME-Reanalyse 2,5 km, 11 Member, stündlich, Zielzeitraum 2012–2022, Domäne 43–51,8 °N / 5,5–22,1 °O; veröffentlichten Zeitraum auf dem Hub vorher prüfen | deckt CH ab (ICON-DREAM-EU, ARA-Domäne) |
| Lange Stationsreihen | `klima-v2-10min` ab 20.05.1992, `klima-v2-1h`, `klima-v2-1d` (mit Bewölkung, Sichtweite); ~260 TAWES-Stationen | A1 SwissMetNet: ~160 Stationen + ~100 automatische Niederschlagsstationen; 10 min/h/d; automatisch ab 1981 |
| RADOLAN/RADKLIM | INCA-Niederschlag (ab 2011) als flächige Wahrheit | CombiPrecip: offen nur 14 Tage rollierend, Archiv nur auf Anfrage → ab jetzt selbst mitschreiben (Stunden-Reanalyse, 8 Tage Verzug) |
| Schnee / Tageswerte | SNOWGRID Klima v2.1 (Schneehöhe + SWE, 1 km, ab 1961); SPARTACUS v3 Tagesraster 1 km ab 1961 (TN, TX, TM, RR, Sonne) | C3 Tagesraster; A5 manuelle Niederschlags-/Schneestationen |
| DUETT (Strahlung) | APOLIS-v2 (Tagesstrahlung 100 m) | C4 Satellit (ab 2025) |

Schon genutzt: klima-v2-10min und SwissMetNet in W1; SPARTACUS- und MeteoSwiss-Normale in AX-9; INCA als Anker in AT
(AX-10, gebaut, nicht gemessen). Die Schweiz — schwächster Bereich von Fusion 9 — hat die dünnste offene Rasterhistorie.

## Fallstricke

HOSTRADA und INCA sind an stationslosen Punkten selbst Analysen (HOSTRADA-Wind aus 3-km-Klimamodell, Bewölkung effektiv
~25 km²): gut als Klimatologie, nur Zweitwahrheit. ICON-DREAM und ARA sind Analysen, kein Vorlauffehler. Datenmengen:
HOSTRADA ~60 GB je Größe für 1995–heute — nur offline zu einem statischen Produkt verdichten (wie AX-9). Lizenzen
GeoNutzV / CC BY 4.0 / „Source: MeteoSwiss“: kommerziell mit Quellenangabe erlaubt.

## Quellen

- DWD CDC: https://opendata.dwd.de/climate_environment/CDC/ · Reanalysen: https://opendata.dwd.de/climate_environment/REA/
- HOSTRADA: https://opendata.dwd.de/climate_environment/CDC/grids_germany/hourly/hostrada/DESCRIPTION_gridsgermany_hourly_hostrada_en.pdf
- ICON-DREAM-EU: https://opendata.dwd.de/climate_environment/REA/ICON-DREAM-EU/Readme_intro_ICON.pdf ,
  https://opendata.dwd.de/climate_environment/REA/ICON-DREAM-EU/ParameterTables_ICON.pdf
- DUETT: https://opendata.dwd.de/climate_environment/CDC/grids_germany/hourly/duett/DESCRIPTION_grids_germany-climate-hourly-duett_1km_en.pdf
- KL-Tageswerte: https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/daily/kl/DESCRIPTION_obsgermany-climate-daily-kl_en.pdf
- Stündlicher Niederschlag (WRTR): https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/hourly/precipitation/DESCRIPTION_obsgermany_climate_hourly_precipitation_en.pdf
- GeoSphere: https://data.hub.geosphere.at/dataset/ (INCA-v1, INCA-v2, ARA, klima-v2-10min/1h, SPARTACUS v3, SNOWGRID)
- MeteoSwiss: https://opendatadocs.meteoswiss.ch/ (A1, C3, C4, D1)
