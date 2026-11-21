# Phase GI — IMIS-Stationen des SLF als weiteres Netz in `glacier/v1/stn/`

Diagnose, Umsetzung und Gate der Phase. Auftrag Jan 21.11.2026 (Prompt „Phases GI + GN“): die IMIS-Stationen des WSL-Instituts für
Schnee- und Lawinenforschung SLF als Netz `imis:` im Stationsprodukt der Gletscher-Linie, Zuordnung über den Abstand zum Umriss
(V-GO-1), gemessene Schneehöhen-Differenzen als eigene Größe, ohne Schalter, direkt auf `main`. Fortsetzung von
`audit/gletscher-stationen.md` (Phase GO).

## 1 Anker (am Code und an den Daten gelesen, 21.11.2026 abends)

- **Produkt:** `glacier/v1/stn/` läuft seit 21.11. auf dem Runner im Halbstundentakt (Cron `12,42`), Zeiger
  `index.stations = { hour, slot, builtAt, n, map, mapAt }`, Zuordnung `20261120-1.2` (387 von 2 094 Gletschern, Schweiz 100 von 1 291).
- **Der Producer auf dem Runner kommt bei jedem Lauf frisch von `origin/main` von `buscosun-web`** (`workflow-glacier-stations.yml`,
  Schritt „Checkout producer“). Ein lokaler Commit ändert dort nichts; mit Jans Push läuft der neue Producer im nächsten Slot.
- **Die ausgelieferte Seite prüft jedes Dokument selbst** (`loadStationHour` → `stnHourProblems`, `loadStationMap` → `stnMapProblems`):
  eine Kennung, die nicht mit `tirol|bz|at|ch|de:` beginnt, eine unbekannte Größe unter `v` oder ein unbekannter Schlüssel in der
  Zuordnung macht das GANZE Dokument ungültig — die Karte stünde dann für alle Gletscher ohne Werte da.
- **Umrisse:** `static/<build>/outline/<region>-L1.json` auf dem Zweig `glacier` des Daten-Repos, 26 Dateien, zusammen 2,0 MB,
  Vereinfachung `tolM` 60 m, alle 2 094 Gletscher haben einen Umriss.

## 2 Schritt 0 — Messungen (21.11.2026 22:47–23:30 UTC)

Werkzeug: `audit/gletscher-imis/schritt0.mjs` (liest die aufgezeichneten SLF-Antworten in `scripts/lib/fixtures/glacier/stations/`,
den Katalog und die L1-Umrisse des Builds `20261120-1`, den Katalog `stn/stations.json` und `obs/v1` vom selben Abend).

### 2.1 Die Schnittstelle

Beschreibung der Schnittstelle: `https://measurement-api.slf.ch/openapi.json` („SLF Measurement API“ 1.1.0, FastAPI; nennt als
Nutzungsbedingungen die Seite des SLF-Datenservice). Ohne Schlüssel. Alle Zeiten UTC.

| Endpunkt (`/public/api/imis/…`) | Inhalt | Größe | Übernommen |
|---|---|---|---|
| `stations` | alle aktiven IMIS-Stationen: `code`, `label`, `lon`, `lat` (WGS84), `elevation` (m), `country_code`, `canton_code`, `type` | 31 KB | **ja** |
| `measurements` | die letzten 24 h ALLER Stationen in EINER Antwort, eine Zeile je Station und halbe Stunde | 3,3 MB, übertragen 384 KB (gzip) | **ja** |
| `station/{code}/measurements?period_in_days=1\|3\|7` | dieselben Zeilen für eine Station | — | nein (ein Abruf je Station) |
| `measurements-precipitation` | `RR_10MIN_SUM` mm je 10 min, 24 h, 92 Stationen | 1,0 MB | **nein** — unbeheizte Regenmesser (Gegenprobe unten) |
| `daily-snow?period_in_days=` | Tageswert `HS` und `HN_1D`; laut Beschreibung „modeled by the snowpack model“ | 22 KB | **nein** — Modellwert, keine Messung |
| `/public/api/study-plot/…` | Beobachter-Messfelder (100 Stationen, 88 unter 2 000 m, ein Wert am Tag um 06 UTC) | 13 KB + 8 KB | nein — nicht IMIS, nicht im Auftrag |

Antwortköpfe: `Cache-Control: max-age=89…155`, `X-Fastapi-Cache: HIT`, `Etag` — der Dienst hält die Antwort selbst rund zweieinhalb
Minuten vor. Kein `Access-Control-Allow-Origin` in den Köpfen der Aufzeichnung (die Seite ruft den Dienst ohnehin nie).

| Feld von `measurements` | Bedeutung laut Schnittstelle | Einheit | im Produkt |
|---|---|---|---|
| `measure_date` | Zeitstempel der Messung, UTC (`…Z`), Minuten nur `00` und `30` | — | Stempel |
| `TA_30MIN_MEAN` | Lufttemperatur, Mittel der letzten 30 min | °C | `t` (auf 0,1 gerundet) |
| `RH_30MIN_MEAN` | relative Feuchte, Mittel 30 min | % | `rh` |
| `VW_30MIN_MEAN` | Windgeschwindigkeit, vektorielles Mittel 30 min | m/s | `ff` |
| `VW_30MIN_MAX` | stärkste 5-s-Messung der letzten 30 min | m/s | `fx` |
| `DW_30MIN_MEAN` | Windrichtung, vektorielles Mittel 30 min | ° | `dd` |
| `HS` | Schneehöhe, Momentanwert | cm | `snow` |
| `TSS_30MIN_MEAN` | Temperatur der Schneeoberfläche | °C | — (das Produkt führt keine Oberflächentemperatur, V-GI-3) |
| `TS0/TS25/TS50/TS100_30MIN_MEAN` | Schneetemperatur am Boden und in 25/50/100 cm | °C | — |
| `RSWR_30MIN_MEAN` | REFLEKTIERTE kurzwellige Strahlung | W/m² | — (keine Globalstrahlung) |
| `DW_30MIN_SD` | Streuung der Windrichtung | ° | — |

Kein Taupunkt, kein Luftdruck, keine Globalstrahlung, kein gemessener Neuschnee.

**Abrufe je Lauf: zwei** (`stations`, `measurements`), zusammen rund 0,4 MB übertragen. Bei 48 Läufen am Tag 96 Abrufe.

### 2.2 Stationen und Größen

**IMIS:** 207 Stationen (CH 205, LI 2), 9744 Zeilen für 204 Stationen; ohne Zeile: KLO1, SCH2, OTT2

#### IMIS: Stationen je Typ und Höhenband

| Typ | < 1500 | 1500–1999 | 2000–2499 | 2500–2999 | ≥ 3000 | Summe |
|---|---|---|---|---|---|---|
| SNOW_FLAT | 2 | 18 | 76 | 31 | 0 | 127 |
| WIND | 0 | 2 | 18 | 28 | 19 | 67 |
| FLOWCAPT | 0 | 0 | 7 | 0 | 0 | 7 |
| SNOW_SLOPE | 0 | 0 | 6 | 0 | 0 | 6 |

#### IMIS: Stationen mit Wert in der jüngsten Zeile je Größe und Höhenband

| Größe (Feld) | < 1500 | 1500–1999 | 2000–2499 | 2500–2999 | ≥ 3000 | Summe | in 24 h je einmal |
|---|---|---|---|---|---|---|---|
| t (TA_30MIN_MEAN) | 2 | 19 | 105 | 58 | 19 | 203 | 203 |
| Feuchte (RH_30MIN_MEAN) | 2 | 20 | 104 | 58 | 19 | 203 | 203 |
| wind (VW_30MIN_MEAN) | 2 | 19 | 97 | 51 | 18 | 187 | 188 |
| gust (VW_30MIN_MAX) | 2 | 19 | 97 | 51 | 18 | 187 | 188 |
| Richtung (DW_30MIN_MEAN) | 2 | 19 | 97 | 51 | 18 | 187 | 188 |
| snow (HS) | 2 | 18 | 80 | 31 | 0 | 131 | 131 |
| Oberfläche (TSS_30MIN_MEAN) | 2 | 18 | 79 | 31 | 0 | 130 | 130 |
| reflektierte Strahlung (RSWR_30MIN_MEAN) | 2 | 18 | 79 | 31 | 0 | 130 | 130 |

Niederschlag (`measurements-precipitation`, RR_10MIN_SUM): 12797 Zeilen, 92 Stationen mit Wert — je Höhenband < 1500: 2, 1500–1999: 16, 2000–2499: 52, 2500–2999: 22, ≥ 3000: 0
Gegenprobe Regenmesser: 52 Stationen mit HN_1D ≥ 10 cm (`daily-snow`, 2026-11-21T00:00:00) und Regenmesser — 24-h-Summe des Regenmessers im Median 0.2 mm, unter 1 mm an 32

Stempel (Abruf 2026-11-21T22:53:34.000Z): Alter der jüngsten Zeile je Station — ≤ 30 min: 201, 31–60 min: 2, 61–180 min: 0, > 180 min: 1; Median 24 min; Minuten der Stempel: 00, 30; Zeilen je Station: 2–48

#### IMIS: Stationen ab 3 000 m

| Kennung | Name | Höhe m | Typ | Kanton |
|---|---|---|---|---|
| ZER1 | Platthorn | 3345 | WIND | VS |
| FOU1 | Le Portalet | 3344 | WIND | VS |
| ARO1 | La Cassorte | 3300 | WIND | VS |
| SAA1 | Platthorn | 3245 | WIND | VS |
| BOV1 | Pointe de Boveire | 3211 | WIND | VS |
| GAN1 | Sackhorn | 3193 | WIND | VS |
| SCA1 | Gross Windgällen | 3187 | WIND | UR |
| KES1 | Piz Val Müra | 3152 | WIND | GR |
| ZNZ1 | Sarsura Pitschen | 3133 | WIND | GR |
| VLS1 | Piz Aul | 3121 | WIND | GR |
| ELA1 | Piz Salteras | 3110 | WIND | GR |
| MUT1 | Ruchi | 3103 | WIND | GL |
| VSC1 | Piz San Jon Dadaint | 3092 | WIND | GR |
| TRU1 | Schwarzhorn | 3088 | WIND | VS |
| LAG1 | Lagrev | 3085 | WIND | GR |
| TUM1 | Piz Tumpiv | 3041 | WIND | GR |
| HTR1 | Chilchalphorn | 3040 | WIND | GR |
| LUK1 | Piz Gannaretsch | 3040 | WIND | GR |
| TUJ1 | Crispalt | 3028 | WIND | GR |

### 2.3 Takt und Verzug

Die Zeilen tragen Stempel zur vollen und zur halben Stunde (Mittel der 30 Minuten davor). Gemessen an 13 Abrufen im Abstand von
knapp drei Minuten (21.11. 22:52–23:24 UTC, je der jüngste Stempel der 203 Stationen mit laufender Reihe):

| Zeit nach dem Stempel 23:00 UTC | Stationen mit diesem Stempel |
|---|---|
| +1,4 min | 0 |
| +4,3 min | 72 |
| +7,1 min | 117 |
| +9,9 min | 117 |
| +12,8 min | 185 |
| +15,6 … +24,2 min (vier Abrufe) | 186 |

Der Stempel 22:30 stand 23 Minuten danach an 201 Stationen, 31 Minuten danach an allen 203. 17 Stationen trugen 24 Minuten nach
23:00 noch 22:30 — sie melden später. Eine Station (Hinterrugg) stand seit dem Vortag. Für den Lauf um :12 / :42 (Start gemessen
rund :13 / :43) heißt das: rund neun von zehn Stationen mit dem frischen Stempel (13 Minuten alt), der Rest 43 Minuten alt; das
Alter steht an jeder Station. Der Dienst hält seine Antwort selbst rund zweieinhalb Minuten vor (`Cache-Control`).

### 2.4 Zuordnung: heute gegen neu

Regel unverändert 5 km und ±300 m gegen die Höhenspanne (beides `set`). **A** = heute (Abstand zum Katalogpunkt, ohne IMIS) —
die Zahlen sind die der veröffentlichten Zuordnung `20261120-1.2` (387; Temperatur 367, Wind 348, Schneehöhe 123, Niederschlag 80,
Strahlung 174). **C** = neu: Abstand zum L1-Umriss (0 auf dem Eis, sonst zur nächsten Kante), mit IMIS für Temperatur, Wind, Böe und
Schneehöhe. `obs/v1` zählt wie bisher mit dem, was eine Station JETZT liefert (E-GO-6).

Kandidaten: Tirol/Südtirol 318, obs/v1 mit Lieferung 2011, IMIS 204; Umrisse L1 für 2094 von 2094 Gletschern

#### C — neu: Abstand zum Umriss, mit IMIS (2094 Gletscher)

| Land / Region | Gletscher | mit Station | Temperatur | Wind | Böe | Schneehöhe | Niederschlag | Strahlung | Treffer je Netz |
|---|---|---|---|---|---|---|---|---|---|
| alle | 2094 | 846 | 831 | 792 | 792 | 469 | 104 | 202 | bz 89, imis 1596, obs:AT 238, obs:CH 381, obs:DE 8, tirol 878 |
| Land AT | 799 | 309 | 308 | 289 | 289 | 134 | 54 | 111 | bz 89, imis 4, obs:AT 238, tirol 854 |
| Land CH | 1291 | 535 | 521 | 501 | 501 | 335 | 50 | 89 | imis 1592, obs:CH 381, tirol 24 |
| Land DE | 4 | 2 | 2 | 2 | 2 | 0 | 0 | 2 | obs:DE 8 |
| at-allgaeuer-alpen | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | tirol 3 |
| at-ankogel-hochalmspitzgruppe | 43 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| at-dachstein | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8 | obs:AT 48 |
| at-defreggergruppe | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| at-glocknergruppe | 74 | 15 | 15 | 15 | 15 | 0 | 6 | 6 | obs:AT 27, tirol 30 |
| at-goldberggruppe | 30 | 11 | 11 | 11 | 11 | 11 | 0 | 11 | obs:AT 55 |
| at-granatspitzgruppe | 23 | 10 | 10 | 9 | 9 | 9 | 5 | 10 | obs:AT 15, tirol 37 |
| at-hochkoenig | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| at-karnische-alpen | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| at-lechtaler-alpen | 11 | 6 | 6 | 6 | 6 | 2 | 0 | 2 | obs:AT 9, tirol 13 |
| at-oetztaler-alpen | 185 | 98 | 97 | 82 | 82 | 50 | 32 | 42 | bz 40, obs:AT 84, tirol 261 |
| at-raetikon | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| at-rieserfernergruppe | 5 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | bz 4 |
| at-samnaungruppe | 3 | 3 | 3 | 3 | 3 | 2 | 0 | 1 | imis 4, tirol 8 |
| at-schobergruppe | 16 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| at-silvrettagruppe | 40 | 24 | 24 | 24 | 24 | 2 | 0 | 2 | tirol 76 |
| at-stubaier-alpen | 108 | 80 | 80 | 79 | 79 | 31 | 3 | 15 | bz 27, tirol 260 |
| at-venedigergruppe | 88 | 21 | 21 | 19 | 19 | 5 | 0 | 5 | bz 15, tirol 54 |
| at-verwallgruppe | 27 | 22 | 22 | 22 | 22 | 10 | 0 | 6 | tirol 82 |
| at-zillertaler-alpen | 126 | 9 | 9 | 9 | 9 | 3 | 0 | 3 | bz 3, tirol 30 |
| ch-mitte-ost | 256 | 93 | 93 | 85 | 85 | 51 | 3 | 30 | imis 228, obs:CH 119 |
| ch-mitte-west | 494 | 184 | 184 | 174 | 174 | 130 | 7 | 35 | imis 566, obs:CH 138 |
| ch-ost | 272 | 120 | 120 | 120 | 120 | 64 | 1 | 3 | imis 397, obs:CH 7, tirol 24 |
| ch-sued | 79 | 29 | 29 | 29 | 29 | 14 | 17 | 16 | imis 59, obs:CH 75 |
| ch-west | 190 | 109 | 95 | 93 | 93 | 76 | 22 | 5 | imis 342, obs:CH 42 |
| de | 4 | 2 | 2 | 2 | 2 | 0 | 0 | 2 | obs:DE 8 |

#### Gewinn „mit Station“ je Land und Region: A (Punkt, ohne IMIS) → B (Umriss, ohne IMIS) → C (Umriss, mit IMIS); P = Punkt mit IMIS

| Land / Region | Gletscher | A | P | B | C | C − A | Temperatur A → C | Wind A → C | Schneehöhe A → C |
|---|---|---|---|---|---|---|---|---|---|
| alle | 2094 | 387 | 757 | 435 | 846 | +459 | 367 → 831 | 348 → 792 | 123 → 469 |
| Land AT | 799 | 285 | 286 | 308 | 309 | +24 | 284 → 308 | 265 → 289 | 122 → 134 |
| Land CH | 1291 | 100 | 469 | 125 | 535 | +435 | 81 → 521 | 81 → 501 | 1 → 335 |
| Land DE | 4 | 2 | 2 | 2 | 2 | +0 | 2 → 2 | 2 → 2 | 0 → 0 |
| at-allgaeuer-alpen | 1 | 0 | 0 | 1 | 1 | +1 | 0 → 1 | 0 → 1 | 0 → 0 |
| at-ankogel-hochalmspitzgruppe | 43 | 0 | 0 | 0 | 0 | +0 | 0 → 0 | 0 → 0 | 0 → 0 |
| at-dachstein | 8 | 8 | 8 | 8 | 8 | +0 | 8 → 8 | 8 → 8 | 8 → 8 |
| at-defreggergruppe | 6 | 0 | 0 | 0 | 0 | +0 | 0 → 0 | 0 → 0 | 0 → 0 |
| at-glocknergruppe | 74 | 14 | 14 | 15 | 15 | +1 | 14 → 15 | 14 → 15 | 0 → 0 |
| at-goldberggruppe | 30 | 10 | 10 | 11 | 11 | +1 | 10 → 11 | 10 → 11 | 10 → 11 |
| at-granatspitzgruppe | 23 | 10 | 10 | 10 | 10 | +0 | 10 → 10 | 9 → 9 | 9 → 9 |
| at-hochkoenig | 2 | 0 | 0 | 0 | 0 | +0 | 0 → 0 | 0 → 0 | 0 → 0 |
| at-karnische-alpen | 1 | 0 | 0 | 0 | 0 | +0 | 0 → 0 | 0 → 0 | 0 → 0 |
| at-lechtaler-alpen | 11 | 6 | 6 | 6 | 6 | +0 | 6 → 6 | 6 → 6 | 2 → 2 |
| at-oetztaler-alpen | 185 | 90 | 90 | 98 | 98 | +8 | 89 → 97 | 74 → 82 | 45 → 50 |
| at-raetikon | 2 | 0 | 0 | 0 | 0 | +0 | 0 → 0 | 0 → 0 | 0 → 0 |
| at-rieserfernergruppe | 5 | 1 | 1 | 1 | 1 | +0 | 1 → 1 | 1 → 1 | 1 → 1 |
| at-samnaungruppe | 3 | 2 | 3 | 2 | 3 | +1 | 2 → 3 | 2 → 3 | 1 → 2 |
| at-schobergruppe | 16 | 0 | 0 | 0 | 0 | +0 | 0 → 0 | 0 → 0 | 0 → 0 |
| at-silvrettagruppe | 40 | 23 | 23 | 24 | 24 | +1 | 23 → 24 | 23 → 24 | 2 → 2 |
| at-stubaier-alpen | 108 | 75 | 75 | 80 | 80 | +5 | 75 → 80 | 73 → 79 | 29 → 31 |
| at-venedigergruppe | 88 | 16 | 16 | 21 | 21 | +5 | 16 → 21 | 15 → 19 | 4 → 5 |
| at-verwallgruppe | 27 | 22 | 22 | 22 | 22 | +0 | 22 → 22 | 22 → 22 | 9 → 10 |
| at-zillertaler-alpen | 126 | 8 | 8 | 9 | 9 | +1 | 8 → 9 | 8 → 9 | 2 → 3 |
| ch-mitte-ost | 256 | 27 | 78 | 30 | 93 | +66 | 27 → 93 | 27 → 85 | 1 → 51 |
| ch-mitte-west | 494 | 30 | 157 | 41 | 184 | +154 | 28 → 184 | 28 → 174 | 0 → 130 |
| ch-ost | 272 | 11 | 115 | 11 | 120 | +109 | 11 → 120 | 11 → 120 | 0 → 64 |
| ch-sued | 79 | 11 | 22 | 17 | 29 | +18 | 11 → 29 | 11 → 29 | 0 → 14 |
| ch-west | 190 | 21 | 97 | 26 | 109 | +88 | 4 → 95 | 4 → 93 | 0 → 76 |
| de | 4 | 2 | 2 | 2 | 2 | +0 | 2 → 2 | 2 → 2 | 0 → 0 |

#### Grosser Aletschgletscher (gl_ch_grosser-aletschgletscher, 1639 / 3147 / 4119 m)

| Größe | A (Punkt, ohne IMIS) | C (Umriss, mit IMIS) |
|---|---|---|
| t | — | Jungfraujoch (obs:CH, 3571 m, 0.1 km) |
| wind | — | Jungfraujoch (obs:CH, 3571 m, 0.1 km) |
| gust | — | Jungfraujoch (obs:CH, 3571 m, 0.1 km) |
| snow | — | Flesch (imis, 2500 m, 1.9 km) |
| precip | — | — |
| rad | — | Jungfraujoch (obs:CH, 3571 m, 0.1 km) |

Stationen innerhalb des L1-Umrisses (Abstand 0) als Treffer: an 1 Gletschern.

## 3 Diagnose

1. **Zwei Abrufe genügen.** `measurements` trägt alle Stationen und 24 Stunden; ein Abruf je Station (207) wäre genau die Last, für
   die der Dienst laut SLF nicht gebaut ist. Niederschlag und Tageswerte bräuchten zwei weitere Abrufe und liefern nichts, was als
   Messung taugt (Punkt 3 und 4).
2. **Die Werte sind Halbstundenmittel mit drei Nachkommastellen**, die anderen Netze liefern 10-min-Werte mit einer. Das Produkt
   rundet auf seine Auflösung (0,1 °C, 0,1 %, 0,01 m/s, 1°, 0,1 cm); sonst würde die Stillstand-Prüfung („derselbe Wert“) an IMIS nie
   greifen und die Karte spiegelte eine Genauigkeit vor, die der Fühler nicht hat.
3. **Die Regenmesser sind unbeheizt.** Gemessen am 21.11.: an 52 Stationen mit mindestens 10 cm Neuschnee laut `daily-snow` zeigt der
   Regenmesser über 24 Stunden im Median 0,2 mm, an 32 davon unter 1 mm. Als „Niederschlag 24 h“ neben einem Gletscher im Winter wäre
   das eine Falschaussage ⇒ nicht übernommen.
4. **IMIS liefert keinen gemessenen Neuschnee.** `HN_1D` kommt laut Schnittstelle aus dem Schneedeckenmodell SNOWPACK. Der Auftrag
   sagt „never derive them from the model“ ⇒ für IMIS keine Größe. Tirol liefert `HSD24/48/72` als Differenz der gemessenen Schneehöhe
   an allen 120 Stationen mit Schneehöhe ⇒ wird als eigene Größe geführt (Änderung der Schneehöhe, kann negativ sein — Setzung).
5. **Die ausgelieferte Seite verträgt kein neues Netz und keine neue Größe an den bisherigen Stellen** (§1). Zwischen Jans Push und
   dem Wechsel des Bundles bei jedem Besucher (Service Worker: ein Besuch mit dem alten Stand) stünde die Karte ohne Werte da. Die
   Dokumente behalten deshalb ihre bisherigen Abschnitte mit genau den Netzen und Größen der Phase GO; alles Neue steht in einem
   Abschnitt `ext`, den ein alter Stand nicht liest. Derselbe Schnitt macht den Rückfall sauber: ein alter Producer liest den
   Abschnitt nicht und würde IMIS-Stationen sonst als Tiroler Stationen zuordnen (`stnCandidates`: alles außer `bz` gilt als `tirol`).
6. **Ein lokal veröffentlichter Lauf wäre vor Jans Push schädlich:** der alte Producer auf dem Runner schreibt 30 Minuten später
   wieder nach altem Stand. Die Phase braucht keinen Push ins Daten- oder Archiv-Repo — Workflow, Cron und Ablage bleiben, wie sie
   sind; der neue Producer übernimmt mit dem Push von `buscosun-web`.
7. **Der Abstand zum Katalogpunkt benachteiligt große Gletscher** (V-GO-1). Der Umriss liegt im statischen Build; die L1-Stufe
   (60 m Toleranz, 2,0 MB in 26 Dateien) reicht für eine Angabe auf 0,1 km. Der Abstand steht auf der Seite — der Satz muss dazu
   sagen, wovon er zählt.

## 4 Plan

| Schritt | Inhalt |
|---|---|
| GI-1 Vertrag | `glacierStationContract.ts`: Netz `imis`, Leser der zwei Antworten, Quellenvermerk SLF, Abschnitt `ext` in Katalog, Slot-Dokument und Zuordnung, Größe „Änderung der Schneehöhe“ (`hsd`), Abstand zum Umriss, Abruf-Deckel |
| GI-2 Producer | `stations.mjs`: zwei SLF-Abrufe je Lauf mit Pause und EINER Wiederholung, Deckel benannt; Umrisse für die Zuordnung; Zuordnung in zwei Abschnitten |
| GI-3 Anzeige | Karte „Gemessen in der Nähe“: liest `ext`, zeigt die neue Größe, Satz „x km vom Rand des Gletschers“, Vermerk SLF mit Link auf www.slf.ch; Zeile in der Lizenzliste |
| GI-4 Prüfer | `verify:glacier-stations`: SLF-Aufzeichnungen Byte für Byte, SLF fällt aus, alter und unplausibler IMIS-Wert, Umriss-Zuordnung mit Gegenbeispiel, Größe `hsd`, alter Stand der Seite liest die neuen Dokumente, buscosun Fusion Byte für Byte gleich, Gegenproben |

Nicht angefasst: buscosun Fusion, `obs/v1`, Edge Functions, Shader, Abhängigkeiten, Workflows, Cron, Ablage, Grenzen und Prüfungen
der bisherigen Größen.

## 5 Entscheidungen im Auftrag (E-GI)

Jede ist umkehrbar; Jan entscheidet.

| Nr. | Entscheidung | Warum | Alternative |
|---|---|---|---|
| E-GI-1 | **Zwei Abrufe je Lauf, Deckel vier** (`IMIS_MAX_REQUESTS_PER_RUN`, `set`): je Abruf höchstens EINE Wiederholung nach 20 s Pause (`IMIS_RETRY_PAUSE_MS`, `set`). Ist der Deckel erreicht, fällt IMIS in diesem Lauf aus (steht in `sources` und der Statuszeile), die anderen Netze liefern. | Der Dienst ist laut SLF nicht für Kundensysteme gebaut; die allgemeine Abruf-Funktion des Producers wiederholt zweimal im Sekundenabstand | Stationsliste nur einmal am Tag (ein Abruf je Lauf) — spart 31 KB je Lauf, kostet einen Zustand |
| E-GI-2 | **Kein Niederschlag von IMIS** | unbeheizte Regenmesser, gemessen (§3.3) | im Sommer wären die Werte brauchbar; eine Regel „nur bei Lufttemperatur über x °C“ wäre gesetzt, nicht gemessen |
| E-GI-3 | **Änderung der Schneehöhe nur von Tirol** (`HSD24/48/72`, cm, wie geliefert); IMIS ohne diese Größe | `HN_1D` ist ein Modellwert (§3.4) | eigene Differenz aus der 24-h-Reihe der Station (beide Enden gemessen, aber die Reihe reicht nur 23,5 h zurück und die Differenz wäre von buscosun gebildet); oder `HN_1D` als Modellwert kennzeichnen |
| E-GI-4 | **Die Größe heißt „Änderung der Schneehöhe“**, mit Vorzeichen, je Zeitraum (24 / 48 / 72 h) | die Differenz kann negativ sein; „Neuschnee“ wäre ein Wort, das der Geber nicht misst | „Neuschnee“ nur bei positiver Differenz |
| E-GI-5 | **Neues in einem Abschnitt `ext`** derselben Dateien (Katalog, Slot-Dokument, Zuordnung); die bisherigen Abschnitte tragen weiter genau die Netze und Größen der Phase GO | §3.5: der ausgelieferte Stand der Seite und ein alter Producer bleiben richtig | neue Dateinamen und Zeigerfelder (doppelte Menge je Slot); oder den alten Stand ohne Karte lassen |
| E-GI-6 | **Kein Push in Daten- oder Archiv-Repo in dieser Phase**; der lokale Producer-Lauf wird nicht veröffentlicht | §3.6 | — |
| E-GI-7 | **Abstand zum L1-Umriss**, 0 auf dem Eis; die Seite sagt „x km vom Rand des Gletschers“ bzw. „am Rand des Gletschers“ unter 0,1 km. Auch der bisherige Abschnitt der Zuordnung rechnet so (ein alter Stand der Seite zeigt denselben Abstand mit dem alten Satz „x km entfernt“). | V-GO-1; eine Regel für alle | bisheriger Abschnitt weiter vom Katalogpunkt |
| E-GI-8 | **IMIS-Werte auf die Auflösung des Produkts gerundet**, im Vermerk „Geändert“ genannt | §3.2 | drei Nachkommastellen durchreichen |
| E-GI-9 | **Kein Schalter** (Jans Wort). Rückfall ohne Deploy: gibt es nicht mehr allein über den Zeiger — den Commit zurücknehmen; der alte Producer schreibt dann Dokumente ohne `ext`, und die Seite zeigt wieder nur die Netze der Phase GO | — | — |

## 6 Umsetzung

### 6.1 Dateien

| Datei | Änderung |
|---|---|
| `src/glacier/glacierStationContract.ts` | Netz `imis` (`IMIS_*`-Adressen, Abruf-Deckel, `parseImis`, `parseImisTime`, Quelle mit `operatorUrl`), Größe `hsd` (`STN_HSD_*`, im Tirol-Leser, in `checkReading`), Abstand zum Umriss (`stnOutlineKm`, `buildStnMap` mit `from` und `quantities`, `buildStnMapDoc`), Abschnitt `ext` in Katalog, Slot-Dokument und Zuordnung (`stnHourEntries`, `stnMapSection`), `STN_QUANTITIES_GO` neben `STN_QUANTITIES`, Prüfregeln beider Abschnitte |
| `scripts/glacier/stations.mjs` | SLF-Weg mit `getOnce` (ein Abruf ohne Wiederholung), höchstens eine Wiederholung je Abruf nach `IMIS_RETRY_PAUSE_MS`, Deckel; Umrisse je Region (`glacierOutlineUrl`); Katalog, Slot und Zuordnung in zwei Abschnitten; eine Zuordnung ohne `ext` wird sofort neu gebaut; README |
| `src/glacier/glacierStationView.ts` | liest `ext`, Größe „Änderung der Schneehöhe“, `whereText`, `operatorUrl` |
| `src/glacier/GlacierStationCard.tsx` | Satz zum Abstand, Betreiber als Link, drei bedingte Sätze im Kleingedruckten |
| `src/glacier/glacierSheet.css` | Link im Satz der Station wie im Quellenvermerk (zwei Regeln erweitert) |
| `scripts/glacier/make-stations-fixture.mjs` | `--outlines=<dir>` schreibt den Umriss-Auszug |
| `scripts/lib/fixtures/glacier/stations/imis-stations.json`, `imis-measurements.json.gz`, `glacier-outline-extract.json` | die zwei SLF-Antworten (Liste wie geliefert, Messzeilen wie übertragen) und die L1-Umrisse der zehn Gletscher des Auszugs |
| `scripts/verify-glacier-stations.mjs` | 61 → 77 Prüfungen (A2, Block J; F1, F3, F8, G7, H1, H3, I5 nachgezogen) |
| `budget.json` | totalJs-Grenze mit Notiz angehoben (§7.4) |

Nicht geändert: buscosun Fusion, `obs/v1`, Edge Functions, Shader, Abhängigkeiten, Workflow-Vorlagen, Cron, Publisher, Ablage
(`stations-archive.mjs` legt die Slot-Datei ab, wie sie veröffentlicht ist — also mit `ext`), Grenzen und Prüfungen der bisherigen Größen.

### 6.2 Das Produkt nach der Phase

```
glacier/v1/stn/stations.json        stations = Tirol, Südtirol            ext.stations = IMIS
glacier/v1/stn/h/<slot>.json        stations = Tirol, Südtirol, obs/v1    ext.stations = IMIS      (Eintrag: + hsd { h24, h48, h72 } cm)
glacier/v1/stn/map/<build>.<n>.json oberste Ebene = Netze und Größen des ersten Stands
                                    ext = alle Netze und Größen (+ dsnow)                           rule.from = 'outline' in beiden
glacier/v1/index.json → stations    unverändert { hour, slot, builtAt, n, map, mapAt }; n zählt jetzt alle Stationen
```

Kennung `imis:<Kennung der Station>` (z. B. `imis:EGH2`). Einheiten wie bisher; `hsd` in cm mit Vorzeichen.

| Neu (alle `set`) | Wert |
|---|---|
| `IMIS_MAX_REQUESTS_PER_RUN` | 4 (zwei Abrufe, je höchstens eine Wiederholung) |
| `IMIS_RETRY_PAUSE_MS` | 20 s |
| `STN_HSD_LIMITS` | 24 h −100 … 250 cm · 48 h −150 … 350 · 72 h −200 … 450 |
| `STN_HSD_ABOVE_DEPTH` | ein Anstieg darf die Schneehöhe um höchstens 5 cm übersteigen |
| Regel | ist die Schneehöhe selbst verworfen, fallen ihre Differenzen mit (`inconsistent`) |
| `STN_OUTLINE_LEVEL` | 1 (L1, 60 m Toleranz) |

Die Prüfungen der IMIS-Werte sind die der anderen Netze (Höchstalter 3 h, Grenzen, Sprung, Stillstand, Widerspruch); die Geschichte
kommt aus den eigenen Slot-Dateien (beide Abschnitte).

### 6.3 Anzeige

Karte „Gemessen in der Nähe“ wie bisher, drei Änderungen: (1) der Satz der Station sagt, wovon der Abstand zählt — „1,9 km vom Rand
des Gletschers, 647 m unter der mittleren Höhe des Gletschers.“, unter 0,1 km „Am Rand des Gletschers, …“; bei einer Zuordnung von
vor dieser Phase weiter „x km entfernt“. (2) Eine IMIS-Station nennt „WSL-Institut für Schnee- und Lawinenforschung SLF“ als Link
auf https://www.slf.ch, derselbe Link steht mit „CC BY 4.0“ im Quellenvermerk der Karte und in der Lizenzliste des Steckbriefs.
(3) Größe „Änderung der Schneehöhe“ an Tiroler Stationen: „+10,0 cm in 24 Stunden · +14,7 cm in 48 Stunden · +16,1 cm in
72 Stunden“, `data-origin="measured"`. Das Kleingedruckte nennt je nach Inhalt: wovon der Abstand zählt, dass SLF-Werte Mittel über
30 Minuten sind, und was die Änderung der Schneehöhe ist. Kein Vergleich mit dem Modell, kein Wort über Verhältnisse.

**Ich habe die Karte nicht im Browser gesehen** (Vorgabe des Auftrags). Geprüft ist das gerenderte Markup ohne Browser (J13, J14).

## 7 Gate

### 7.1 `verify:glacier-stations` — 77/77

| Block | Inhalt der Phase |
|---|---|
| A2 | die zwei SLF-Aufzeichnungen Byte für Byte (sha256), mit Gegenprobe |
| J1–J3 | IMIS-Leser: 207 Stationen, Größen wie in Schritt 0 gezählt, Einheiten und Rundung an einer echten Zeile, neueste Zeile je Größe, Zeit nur mit `Z`, Wächter (doppelte Kennung, fremde Zeilen, keine Liste) |
| J4 | Lauf aus den Aufzeichnungen: zwei Abrufe, 203 Stationen unter `ext` |
| J5 | **alter und unplausibler IMIS-Wert**: echte Zeilen (Stempel vom Vortag; Feuchte 0,1 %) und konstruiert (55 °C; dieselbe Antwort vier Stunden später) |
| J6 | **das SLF fällt aus, die anderen liefern**: der bisherige Abschnitt Byte für Byte der des vollen Laufs, Fehler in der Quelle, zwei Abrufe |
| J7 | Abruf-Deckel: höchstens vier, eine Wiederholung je Abruf; nur das SLF liefert ⇒ der Lauf schreibt trotzdem |
| J8 | Abschnitt `ext` gegen einen Stand der Seite von vor dieser Phase (eingefrorene Kopie seiner Prüfregeln), vier Gegenproben |
| J9–J11 | **Zuordnung über den Umriss**: Aletschgletscher am echten Auszug mit Gegenbeispiel (Katalogpunkt), erfundenes Eisquadrat mit Felsinsel (0 auf dem Eis, Insel, Kante, Ecke, 4,9 / 5,1 km), fehlender Umriss ⇒ Abbruch, Übergang von der alten Zuordnung |
| J12–J13 | **Änderung der Schneehöhe**: Leser, Grenzen, Alter, Widerspruch zur Schneehöhe, im Slot nur bei Tirol, in der Zuordnung nur unter `ext`, Text mit Vorzeichen, nie aus dem Modell |
| J14 | Karte mit SLF: Link auf www.slf.ch an Station und Vermerk, Lizenz, Satz zum Abstand, `data-origin`, gesperrte Wörter |
| H1, H3 | **buscosun Fusion Byte für Byte gleich** mit den Dateien des Laufs MIT IMIS (203 Stationen im Slot, 207 im Katalog, IMIS-Treffer in der Zuordnung, 120 Einträge mit `hsd`); dritte Gegenprobe: vier IMIS-Werte in `obs/v1` geschrieben ändern die Antwort |

Die Aufzeichnung des SLF stammt von 22:53 UTC, die der anderen Netze von 07:18–07:24 UTC. Für den gemeinsamen Lauf (Uhr 07:35 UTC)
schneidet der Prüfer die Messzeilen nach dem Stempel 07:00 UTC ab — die Datei bleibt Byte für Byte die des Dienstes, der Schnitt
steht im Prüfer.

**Gegenproben am Prüfer selbst** (Code verändert, ein Lauf je Fehler, Datei danach wiederhergestellt; Werkzeug im Scratchpad der Sitzung):

| Eingebauter Fehler | Bemerkt durch |
|---|---|
| IMIS unter `stations` statt `ext` | Abbruch (der Producer verwirft sein eigenes Dokument) |
| zwei Wiederholungen je Abruf | J6, J7 |
| Zuordnung vom Katalogpunkt | Abbruch des Prüfers (Aletsch ohne Treffer) |
| Felsinsel zählt als Eis | J10 |
| IMIS im bisherigen Abschnitt der Zuordnung | Abbruch (der Producer schreibt die Zuordnung nicht) |
| neue Größe im bisherigen Abschnitt | Abbruch (ebenso) |
| Höchstalter 30 h | D2, F1, F2, F3, G3, H1, J4, J5, J7, J12 |
| IMIS ungerundet | J2, J3 |
| älteste statt neueste Zeile | Abbruch des Prüfers |
| kein Link auf slf.ch | J14 |
| Differenz ohne Prüfung gegen die Schneehöhe | J12 |
| Größe heißt „Neuschnee“ | J13 |
| Karte liest nur den bisherigen Abschnitt | Abbruch des Prüfers |
| Satz sagt nicht, wovon der Abstand zählt | J14 |
| SLF fällt aus ⇒ Lauf bricht ab | Abbruch des Prüfers |
| fehlender Umriss ⇒ still vom Punkt | J10, J11 |
| Prüfregel lässt IMIS im bisherigen Abschnitt zu | J8 |

Alle 17 bemerkt (zehn durch rote Prüfpunkte, sieben durch Abbruch mit Exit ≠ 0).

### 7.2 Lokale Producer-Läufe gegen die echten Dienste (21.11.2026, NICHT veröffentlicht)

Speicher: frischer, flacher Klon von `buscosun-data` `main` (`09be6e2`, nur `glacier/`), im Scratchpad der Sitzung.

| Lauf (UTC) | Ergebnis |
|---|---|
| 23:23:17, 6 s | 548 Stationen (Tirol 221 gelesen, Südtirol 97, IMIS 207 mit zwei Abrufen, `obs/v1` 33), 34 Werte verworfen; der Slot `2026112123` lag schon im Speicher (Lauf des Runners 23:14) ⇒ keine Slot-Datei; **Zuordnung `20261120-1.3`: 846 von 2 094 Gletschern** (Temperatur 831, Wind 792, Böe 792, Schneehöhe 469, Niederschlag 104, Strahlung 202, Änderung der Schneehöhe 102) — **dieselben Zahlen wie Schritt 0 (§2.4, C)**; bisheriger Abschnitt 435 (= B) |
| 23:24:58, derselbe Speicher ohne die Slot-Datei des Runners | Slot-Dokument 85,6 KB roh / 16,7 KB gepackt (die Datei des Runners davor: 55,7 / 11,7 KB): 345 Stationen im bisherigen Abschnitt, 203 unter `ext`; verworfen bei IMIS: Feuchte 0,1 % an Les Fontanesses (`range`), Hinterrugg mit Stempel vom Vortag (`stale`); Alter der IMIS-Werte: 186 Stationen 25 min, 17 Stationen 55 min; 119 Einträge mit `hsd`; Zuordnung 845 (eine `obs/v1`-Station lieferte eine Minute später anders, E-GO-6); Katalog 144 KB roh / 24,9 KB gepackt; Zuordnung 283 KB roh / 48,8 KB gzip / 24,6 KB Brotli (die veröffentlichte `.2`: 93 / 15,7 / 11,8 KB) |

Grosser Aletschgletscher im zweiten Lauf: Jungfraujoch (0,1 km, +424 m) −7,7 °C, 3,5 m/s aus 315°, Böe 9 m/s, Strahlung 0; Flesch
(IMIS, 1,9 km, −647 m) Schneehöhe 61 cm.

**Kein Push** in `buscosun-data` oder `buscosun-archiv` (E-GI-6). Der Producer auf dem Runner ist bis zu Jans Push der alte.

### 7.3 Übergang beim Push (am Code gelesen, nicht auf dem Runner gesehen)

Der erste Lauf des neuen Producers findet im Speicher einen Katalog ohne `ext` und die Zuordnung `.2` ohne `ext`: er schreibt den
Katalog neu (IMIS unter `ext`), baut sofort die Zuordnung `.3` (26 Abrufe der Umrisse aus dem eigenen Repo, lokal 6 s für den ganzen
Lauf) und den Slot mit `ext`. Ein Besucher mit dem alten Stand der Seite liest dieselben Dateien: seine Prüfregeln nehmen sie an
(J8), er sieht die bisherigen Netze — mit dem Abstand zum Umriss unter dem alten Satz „x km entfernt“ und, wo der Umriss näher an
einer Station liegt als der Katalogpunkt, auch neue Stationen (Aletsch: Jungfraujoch).

### 7.4 Übrige Prüfungen

| Prüfung | Ergebnis (22.11.2026, Endstand des Codes) |
|---|---|
| `npm run typecheck` | grün |
| `npm run build` | grün (Shell-Prüfung 281/281) |
| `npm run budget` | **vor der Anhebung rot**: totalJs 2 097,9 KB bei einer Grenze von 2 097 KB (0,9 KB darüber). Gegen den letzten notierten Stand (2 096,1 nach BS-N) sind es +1,8 KB: +0,8 KB der Seewetter-Nachzug ST-N (`e73dcdf7`; von jener Sitzung im frischen Klon gemessen 2 096,8, `MANUELLE-SCHRITTE.md` §109.5) und **+1,1 KB diese Phase**. Grenze von Hand auf 2 099 angehoben, mit Notiz in `budget.json` (Regel Jan 30.09.), nicht per `--update`; danach grün: eagerJs 116,2 / 117, largestChunk 278,4 / 302, totalJs 2 097,9 / 2 099 |
| `verify:glacier-stations` | 77/77 (in der CI eingetragen wie bisher) |
| `verify:glacier-contract` · `-publish` · `-sat` · `-melt` · `-weather` · `-sheet` · `-feed` · `-hugonnet` | 64/64 · 34/34 · 28/28 · 41/41 · 33/33 · 45/45 · 22/22 · 41/41 |
| `verify:glacier-ui`, Blick in den Browser | nicht gelaufen (Browser-Prüfer; bricht schon an HEAD ab, V-GH-8) |

Die fünf Fragen: **1 Funktionserhalt** — die Karte zeigt weiter jede bisherige Größe; geändert ist der Satz zum Abstand (Zahl und
Wortlaut, E-GI-7) und welche Station die nächste ist, wo der Umriss oder IMIS eine nähere ergibt. Eine Zuordnung von vor der Phase
zeigt die Seite wie bisher (Block G läuft unverändert auf einer solchen). **2 Desktop pixelgleich** — nicht gemessen (kein Bild,
Vorgabe). **3 Touch-Ziele** — neu ist ein Link im Fließtext der Station (wie die Quellen-Links, kein eigenes Bedienelement).
**4 Konsole** — nicht geprüft (kein Browser). **5 Long Tasks** — nicht gemessen; die Karte lädt statt 93 KB jetzt 283 KB Zuordnung
(roh) und rechnet nichts.

## 8 Befunde und Verbesserungen (V-GI)

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| V-GI-1 | Die Slot-Datei wächst von 55,7 auf 85,6 KB (gepackt 11,7 → 16,7 KB): Historie des Daten-Repos und Ablage wachsen um rund 43 % — rund 145 statt 100 MB im Jahr. | Tagesdatei mit den Stunden als Spalten (V-GO-3) wäre grob ein Viertel. |
| V-GI-2 | Die Zuordnung trägt zwei Abschnitte: 283 statt 93 KB roh (Brotli 24,6 statt 11,8 KB), die Seite lädt sie je Sitzung einmal. | Sobald kein alter Stand der Seite mehr unterwegs ist (ein Wort von Jan): den bisherigen Abschnitt leeren — eine Zeile in `buildStnMapDoc`; ebenso `stations`/`ext` zusammenlegen. |
| V-GI-3 | IMIS liefert die Temperatur der Schneeoberfläche an 130 Stationen, Tirol `OFT` an 63 — das Produkt führt keine Oberflächentemperatur. | Eigene Größe „Oberfläche“ (Messung), wenn Jan sie auf der Karte will; Grenzen wären zu setzen. |
| V-GI-4 | 17 von 203 IMIS-Stationen trugen 24 Minuten nach dem Stempel noch den vorigen (§2.3); beim Lauf um :12/:42 sind ihre Werte rund 45–55 Minuten alt. Das Alter steht an der Station. | Kein Handlungsbedarf; steht hier, damit niemand es sucht. |
| V-GI-5 | IMIS-Wind ist ein vektorielles Mittel über 30 Minuten, die Böe die stärkste 5-s-Messung dieser 30 Minuten; die anderen Netze liefern 10-min-Werte. Die Karte sagt es im Kleingedruckten; zwei Stationen verschiedener Netze sind nicht eins zu eins vergleichbar. | — |
| V-GI-6 | Die Stationsliste (31 KB) wird in jedem Lauf geholt. | Einmal am Tag genügte (halbiert die Abrufe beim SLF auf 48 am Tag); kostet einen Zustand im Katalog („Liste zuletzt geholt“). |
| V-GI-7 | Gemessenen Neuschnee gibt es beim SLF nur an den Beobachter-Messfeldern (`study-plot`, ein Wert am Tag um 06 UTC, 88 von 100 unter 2 000 m) — nicht IMIS, nicht im Auftrag. Die Schweiz hat damit keine „Änderung der Schneehöhe“. | E-GI-3 nennt die zwei Wege: eigene Differenz aus der IMIS-Reihe, oder `HN_1D` als Modellwert kennzeichnen. |
| V-GI-8 | Der feste Satz „Station auf Fels oder Grat, nicht auf dem Eis“ stimmt in der zweiten Hälfte immer; 127 IMIS-Stationen sind aber Schneestationen im Flachfeld (wie schon die Tiroler Schneestationen). | Der Typ steht in der Stationsliste (`SNOW_FLAT`, `WIND`): Satz je Typ („Schneestation im flachen Gelände“ / „Windstation am Grat“). Jans Wort, der Satz ist festgelegt. |
| V-GI-9 | Der Rückfall „Zeiger `stations` entfernen“ (E-GO-10) schaltet weiter die ganze Karte ab; nur IMIS abschalten geht allein über den Code (Commit zurücknehmen). | Producer-Variable `GLACIER_STN_IMIS=0`, wenn Jan einen Rückfall ohne Deploy will. |
| V-GI-10 | Zwei Läufe im Abstand einer Minute zählten 846 und 845 Gletscher mit Station — eine `obs/v1`-Station lieferte anders (E-GO-6). Die Zuordnung wird einmal am Tag gerechnet; welcher Zustand der Messspiegel in dieser Minute hat, ist Zufall. | Eine Station erst aus der Zuordnung nehmen, wenn sie in n Läufen nichts liefert (V-GO-2). |
| V-GI-11 | Budget: totalJs lag am Endstand der Phase 0,9 KB über der Grenze (§7.4). | Grenze mit Notiz angehoben; die Parser stehen nicht im Bundle (nur Prüfregeln, Sicht, Karte). |
| V-GI-12 | `verify:glacier-ui` (Browser) ist nicht gelaufen; die Karte mit IMIS ist in keinem echten Browser geprüft. | Wie V-GO-10. |

## 9 Jans Schritte

`MANUELLE-SCHRITTE.md` §110: Push von `main` (damit läuft der neue Producer im nächsten Slot), fünf Gletscher ansehen, Mail an
data@slf.ch (Verteiler für Live-Daten), Entscheidungen E-GI-1 … 9, Rückfall.

Commit dieser Phase auf `main` (lokal, nicht gepusht): siehe `git log` — `feat(glacier): IMIS stations of the SLF, mapping by the distance to the outline, change of the snow depth (phase GI)`.
