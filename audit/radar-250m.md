# audit/radar-250m.md — Phase R250: Niederschlagsradar auf 250 m aus den DWD-Standortradaren

> Auftrag (Jan, 09.10.2026): „Mach das Niederschlagsradar so hochauflösend und genau, wie es mit realen Datenquellen
> technisch möglich ist, mit 250 m als Richtwert. Die Darstellung muss dabei flüssig bleiben. … Interpolierte Pixel dürfen
> nicht als echte Messauflösung dargestellt werden. … Setze die beste tragfähige Lösung in buscosun-data und in der
> Darstellung um." Kachelmann HD+ als Referenz (≈ 250 m, zu prüfen).
> Stand: **R250-0 Diagnose (§1–§4), Plan (§5), Umsetzung (§6), Gates (§7), Befunde (§8).** Messwerkzeuge in
> `audit/radar-250m/`.

## §0 Kurzfassung

- **Bestand (Phase HD, 08.10.):** die drei Landesradare werden auf ihren nativen 1-km-Gittern gezeichnet (DE RADOLAN-RV
  1100 × 1200, AT INCA 701 × 431, CH rzc 710 × 640; Daten-Repo `radar/img/v1`, Dual-PNG mit Log-Ebene bis 200 mm/h,
  Catmull-Rom-Filter, Morph entlang der Zugbahn). Der Weg Quelle → Spiegel → Client ist in §1 beschrieben. **1 km ist die
  Obergrenze aller offenen Komposite** in DACH (§2).
- **Kachelmann HD+ ist 250 m, gebaut aus den 17 DWD-Standortradaren** („Echos der 17 Radarstandorte abhängig von der Position
  zum Radar variabel zu einem Komposit verschmolzen", Datenbasis DWD; eigene Seite). Dieselbe Datenbasis ist offen: der DWD
  liefert je Standort das **kartesische 250-m-Produkt `px250`** (ODIM-HDF5 V2.3, 1600 × 1600 Zellen à 250 m = 400 × 400 km,
  Reflektivität DBZH des Niederschlagsscans, alle 5 min, Datei ≈ 75 s nach dem Scan, 80–760 KB je Standort, ≈ 6,5 MB je
  Slot, 48 h Vorhaltung). Gleiche polar-stereografische Projektion wie das RV-Komposit (lat_ts 60, lon_0 10, WGS84-Ellipsoid):
  **die 250-m-Gitter sind reine Verschiebungen des 1-km-Gitters** — das Zielgitter ist das RV-Gitter DE1200, viergeteilt
  (4400 × 4800), die Standortgitter rücken ohne Interpolation per nächster Zelle hinein (Versatz ≤ 125 m, §3.1).
- **Ehrliche Auflösung (§3.2):** 250 m ist die radiale Auflösung der Messung überall; im Azimut misst das Radar mit 1°
  Strahlbreite, die Zelle ist also r · tan 1° breit — 250 m bei 14 km, 1 km bei 57 km, 2,6 km am Rand (150 km). Im
  Komposit mit dem jeweils nächsten Standort hat die Hälfte der abgedeckten Fläche einen Standort näher als 84 km
  (Tangentialbreite ≤ 1,5 km); über deutschem Land näher (Messung mit Landmaske in §6). Was die 250-m-Zelle trägt, ist der
  gemessene Wert ihres Polarbins — **kein interpolierter Wert**, aber jenseits von 14 km ein Bin, das breiter als 250 m ist.
  Die Anzeige sagt das („250-m-Gitter · 250 m radial · 1° Azimut").
- **Verfahren (§4):** nächster Standort je Zelle (niedrigster Strahl, geringste Dämpfung); dBZ → Rate mit der DWD-Beziehung
  Z = 256 · R^1,42 (wradlib, DWD-Parameter); **Verankerung am amtlichen 1-km-Produkt:** je 1-km-Zelle wird die 4 × 4-Struktur
  so skaliert, dass ihr Mittel exakt die RV-Rate der Zelle ist (Clutterfilter, Dämpfungs- und Qualitätskorrekturen des DWD
  bleiben erhalten; ohne Standortecho in der Zelle bleibt sie flach = 1-km-Wert; RV trocken ⇒ trocken). Gemessen am Slot
  09.10. 17:20 UTC: Mittel je km² exakt (max |Δ| 0), 93,6 % der nassen 1-km-Zellen bekommen Struktur, innerhalb einer Zelle
  liegt das Maximum im Median beim 1,34-fachen des Mittels, 11,7 % der Zellen haben ≥ 2-fache Spitzen (§3.3).
- **Produkt (§5):** je RV-Slot 16 Kacheln à 1100 × 1200 (Log-Byte wie die HD-3-Ebene) unter `radar/img/v1/rv-past/<stamp>/`
  (trockene Kacheln entfallen; gemessen 14 Kacheln, **2,05 MB je Slot**, Retention 2 h = 24 Slots); nur die **Analysen**
  (Messung) — die RV-Extrapolation 5…120 min bleibt 1 km und wird so gezeigt. Client: ab Zoom 9 lädt er die sichtbaren
  Kacheln des gezeigten Slots (progressiv: 1 km sofort, 250 m darüber, sobald da), Morph mit dem 1-km-Bewegungsfeld.
- **Grenzen:** AT/CH bleiben 1 km (GeoSphere: kein feineres Produkt im Data Hub; MeteoSwiss: Polarvolumen nur über die
  EUMETNET-ODR-API, ratenbegrenzt, Format/Termin ungenannt — §2). Die 2-h-Extrapolation hat kein 250-m-Gegenstück. 250 m
  ist Gitter, nicht überall Messzelle (s. o.).

## §1 Bestand: Kette Quelle → buscosun-data → Darstellung (Stand 09.10.2026)

| Stufe | Deutschland | Österreich | Schweiz |
|---|---|---|---|
| Quelle | DWD `composite/rv/composite_rv_<JJJJMMTT>_<HHMM>.tar` (ODIM-HDF5, 25 Felder 0…120 min, ACRR 5-min-Summe, 0,001 mm) | GeoSphere `nowcast-v1-15min-1km` (INCA RR, NetCDF, 12 Leads 15…180 min) | MeteoSwiss `ch.meteoschweiz.ogd-radar-precip` RZC (ODIM-HDF5, Analyse) |
| Gitter | DE1200 1100 × 1200 à 1 km, polar-stereografisch (lat_ts 60, lon_0 10, WGS84) | 701 × 431 à 1 km, Lambert | 710 × 640 à 1 km, LV95 |
| Takt / Latenz | 5 min; Tar beim DWD ≈ 3:15–3:45 nach dem Slot; Spiegel-Push ≈ 4–6 s danach | 15 min; Poll alle 45 s | 5 min; STAC-Tagesitem mit ETag |
| Spiegel (Daten-Repo `radar/img/v1/`) | `rv/<stamp>/f000…f120.png` (precipToU8, 1 Byte/px), `g<lead>.png` (Dual: v1-Byte + Log 0,06…200 mm/h), `m<lead>.png` Stundenmittel, `meta.json`; `rv-past/<stamp>/f000.png` 24 Slots | `inca/<stamp>/f015…f180.png` + `g`, `meta.json` | `rzc/<stamp>/frame.png` + `g000.png`, `meta.json` |
| Retention | rv 12 Slots (1 h), rv-past 24 (2 h) | 12 (3 h) | 24 (2 h) |
| Größe je Slot | RV 9,4 MB (mit Dual), rv-past ≈ 36 KB | ≈ 0,4 MB | ≈ 0,1 MB |
| Client | `fetchRvFromImg` (26 Dateien, Worker-Decode), Rückblick `fetchRvAnalysisSequence` | `geosphereIncaGrid.ts` | `meteoSwissRadar.ts` |
| Darstellung | drei `RainLayer` auf den nativen Gittern (HD-1, Besitz-Maske je Land), Catmull-Rom geklemmt (HD-2), Log-Rampe (HD-3), Morph (HD-4); Komposit 600 × 512 nur mit `?hd=0` | ebenso | ebenso |

Auslieferung: jsDelivr (`cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/radar/…`), Ausweichweg `raw.githubusercontent.com`
(Hedge 2,5 s, NL-2). Grenzen: 20 MB je Datei; die Paketgrenze 150 MB trifft nur Paketabrufe (D-NP0-1). Der Spiegel-Job läuft
≈ 5 h 45 je Lauf auf GitHub Actions, der ICON-Publisher setzt die Historie alle 3 h per Force-Push neu auf (Repo-Wachstum
bleibt gebunden).

## §2 Quellenprüfung: Was ist feiner als 1 km?

| Anbieter | Produkt | Auflösung | Takt | Format / Zugang | Beleg |
|---|---|---|---|---|---|
| DWD | **`weather/radar/sites/px250/<site>/`** — `rab02-tt_<WMO>-<JJJJMMTTHHMMSS>-de<site>-hd5` (+ `…-buf`) | **250 × 250 m kartesisch**, 1600 × 1600 je Standort (400 × 400 km), `PX_Product250_top_view`, DBZH uint16 (gain 0,00293, offset −64), nodata 65535, undetect 0, Projektion wie RV (eigenes `x_0/y_0` je Standort) | 5 min; Datei um :16:15–:16:33 für den Scan :15:00 (≈ 75 s) | ODIM_H5 V2.3; `latest-…` je Standort; 48 h Vorhaltung (ältester Eintrag 07.10. 17:30 am 09.10. 17:29) | Verzeichnis + h5py-Dump 09.10.2026 (`audit/radar-250m/diag-sites.json`) |
| DWD | `sweep_pcp_z/<site>/hdf5/filter_{simple,polarimetric}/` | polar 360 × 600 Bins = **1° × 250 m**, 150 km | 5 min | ODIM_H5 V2.2 | Verzeichnis + Dump (hnr 17:15) |
| DWD | `sweep_vol_z` (10 Elevationen) | 1° × 250 m, 180 km | 5 min | ODIM_H5 | Verzeichnis |
| DWD | RV/RY/HG-Komposite | 1 km | 5 min | HDF5/RADOLAN | Bestand |
| GeoSphere | Data Hub `v1/datasets` (67 Einträge, 09.10.) | kein Radar-Produkt außer INCA 1 km (`nowcast-v1-15min-1km`, `inca-v1-1h-1km`) | — | — | API-Listing |
| MeteoSwiss | D1 PRECIP/RZC/CPC 1 km; **D5 Polar-3D** (Einzelstandort-Volumen) | D5: Auflösung/Format/Termin ungenannt | 5 min | D5 nur über die EUMETNET-ODR-API (`api.meteogate.eu`), die ohne Token sofort das Ratenlimit meldet | opendatadocs D5, Probe 09.10. |
| Kachelmann | Radar HD+ | **250 m** (DE), „Komposit aus 17 Radarstandorten, distanzabhängig verschmolzen", Datenbasis DWD; AT 500 m, Europa 1 km | — | eigene Seiten | `kachelmannwetter.com/de/regenradar/hohenlohekreis` |

Ergebnis: **Für Deutschland ist 250 m real und offen** — das DWD-Standortprodukt `px250` ist bereits kartesisch, in der
Projektion des RV-Gitters und in 5-min-Takt. Für AT/CH gibt es offen nichts Feineres als 1 km; Polarvolumen der
Nachbarländer wären ein eigenes Projekt (Polar → kartesisch, Abschattung im Gebirge, Rate-Limit der ODR-API).

**Was 250 m bedeutet (Physik, nicht Marketing):** Der Niederschlagsscan misst 250-m-Bins radial bei 1° Strahlbreite
(`angle_step` 1,0 im `sweep_pcp_z`-Dump). Eine Zelle ist also 250 m lang und r · tan 1° = 17,5 m je km Entfernung breit:
250 m bei 14,3 km, 500 m bei 28,6 km, 1 km bei 57 km, 2,6 km bei 150 km. `px250` legt jeden Polarbin auf das 250-m-Gitter
(Abtastung, keine Mittelung — jede Zelle trägt EINEN gemessenen Bin). Mehr Auflösung als der Bin hat auch Kachelmann nicht;
„effektive Auflösung erhöht" heißt dort, dass in Überlappungszonen der nähere Standort zählt.

## §3 Messung (R250-0)

Werkzeuge: `audit/radar-250m/diag-sites.py` (h5py/numpy, Referenz) und `audit/radar-250m/diag-sites.mjs` (Node, dieselben
Decoder wie der Producer — Gegenprobe). Slot **09.10.2026 17:20 UTC**: 17 `px250`-Dateien (`what/time` 172000) und
`composite_rv_20261009_1720.tar` (Lead 0 = ACRR 17:15–17:20). Ein Tag mit verbreitetem Regen (RV nass 16,0 % der Zellen,
max 36–56 dBZ je Standort).

### §3.1 Gitterlage
- RV `where`: `+x_0=543196.835 +y_0=3622588.862`, Eckattribute = Außenkanten der Randpixel ⇒ Zellmitten bei X = i · 1000,
  Y = −j · 1000 (im versetzten Rahmen). `px250`: Zellmitten bei X = a · 250, Y = −b · 250 im eigenen Rahmen; der Standort
  liegt bei (799,5 · 250) — zwischen vier Zellen.
- Zielgitter = DE1200 ÷ 4: Spalte k, Zeile l mit Mitte X_off = 250 k − 375, Y_off = −250 l + 375. Standortzelle (a, b) →
  k = a + (x_0,RV − x_0,site + 375)/250, l = b + (y_0,site − y_0,RV + 375)/250. Die Brüche sind nicht ganzzahlig (asb 0,14/0,27
  Zellen, boo 0,47/0,13, drs 0,16/−0,04 …): **nächste Zelle, Versatz ≤ 125 m**, keine Interpolation.
- Abdeckung je Standort 47–49 % der 1600² Zellen (Kreis ≈ 150–156 km); zusammen decken die 17 Standorte 1 240 000 der
  1 320 000 RV-Zellen ab (die RV-Maske selbst: 53 %).

### §3.2 Entfernung zum nächsten Standort (= Breite des Polarbins)
Über alle abgedeckten 250-m-Zellen (inkl. Nachbarländer und Meer): Quantile 10/25/50/75/90 % = **36 / 58 / 84 / 112 / 138 km**
⇒ Tangentialbreite 0,63 / 1,0 / 1,46 / 1,95 / 2,4 km. Anteil mit Standort ≤ 14,3 km (echte 250 m tangential): 1,6 %;
≤ 28,6 km (500 m): 6,3 %; ≤ 57 km (≤ 1 km): 24,7 %. Über deutschem Land (Landmaske `pickCountry`) s. §6 (Node-Messung).

### §3.3 Standortkomposit gegen das RV-Komposit (1 km)
Nächster-Standort-Komposit, dBZ → R mit Z = 256 R^1,42, 4 × 4-Mittel gegen RV Lead 0 (695 133 vergleichbare Zellen):

| | beide nass | nur RV nass | nur px nass | Korrelation (log) | Median px/RV |
|---|---|---|---|---|---|
| nächster Standort | 155 528 | 54 429 | 12 298 | 0,76 | 0,70 |
| Maximum aller Standorte | 166 644 | 43 313 | 27 354 | 0,74 | 0,80 |

- „Nur RV nass" sind überwiegend Zellen am Rand leichter Echos (RV ist eine 5-min-Summe mit Qualitätsbearbeitung, `px250`
  ein Momentbild mit Echoschwelle; schwächstes Echo −27,8 dBZ, 5 %-Quantil −3,2 dBZ). „Nur px nass" liegt bei 1,5–2,0 % der
  Zellen **ohne Abhängigkeit von der Standortentfernung** (0–10 km 1,6 %, 80–200 km 2,0 %) ⇒ `px250` ist clutterbereinigt;
  die Verankerung (unten) entfernt diese Reste ohnehin.
- Die Rate aus der Standard-Z-R-Beziehung liegt 30 % unter RV (RY nutzt niederschlagstypabhängige Beziehungen und
  Korrekturen). Deshalb wird die Menge NICHT aus der Z-R-Umrechnung genommen, sondern aus RV (§4).
- **Verankerte Abwärtsskalierung** (je 1-km-Zelle: 250-m-Wert = RV · R_zr(Zelle)/Mittel der 16 R_zr; ohne Standortecho
  Faktor 1): Mittel je km² exakt RV (max |Δ| = 0,0), 211 212 nasse 1-km-Zellen, davon **197 717 mit 250-m-Struktur** (93,6 %),
  13 495 flach; 3 317 892 nasse 250-m-Zellen; Spitze je Zelle im Median 1,34 × Mittel, Minimum 0,69 × Mittel; 11,7 % der
  Zellen mit Spitze ≥ 2 × Mittel; Faktor-Quantile 99 % 3,5, 99,9 % 15,2; 3 Zellen > 200 mm/h (Deckel der Log-Ebene).
- **Dateigröße:** 14 von 16 Kacheln nass; mit dem Projekt-Encoder (`png.mjs`, Z_RLE 9) **2 047 070 Byte je Slot**
  (9 KB … 372 KB je Kachel), Encode 0,8 s; zum Vergleich das 1-km-Log-Bild 183 KB.

## §4 Entscheidung des Verfahrens

| Option | Menge | Struktur | Verworfen weil |
|---|---|---|---|
| A reines Standortkomposit (Z-R) | eigene Umrechnung, −30 % gegen RV, eigene Echoschwelle | 250 m | zwei Produkte widersprächen sich auf derselben Karte (Analyse ≠ Nowcast-Frame 0), Z-R-Wahl wäre unsere Setzung |
| B **RV-verankerte Abwärtsskalierung** | **exakt RV je km²** (amtlich, qualitätskorrigiert; dieselbe Zahl, die buscosun Fusion, Summen und Nowcast lesen) | 250 m aus dem nächsten Standort | — gewählt |
| C Interpolation des 1-km-Felds | RV | keine (nur glatter) | keine Mehrinformation — genau das, was nicht als Messauflösung gelten darf |

Konstanten mit Herkunft: 250 m / 1600² / Projektion = Datei-Attribute; Z = 256 R^1,42 = DWD-Parameter (wradlib-Doku:
„DWD uses a=256, b=1.42"), geht nur ins **Verhältnis** innerhalb der Zelle ein (der Exponent bestimmt den Kontrast, nicht die
Menge); Log-Kodierung 0,06…200 mm/h = HD-3 (`precipToU8Log`); nächster Standort = niedrigster Strahl (Standardregel der
Kompositbildung, `set`). Keine gefitteten Zahlen.

## §5 Plan

| AP | Inhalt | Gate |
|---|---|---|
| R250-1 Leser | `src/sources/dwdPx250.ts`: ODIM-`px250` → dBZ-Feld (jsfive mit schnellem Ein-Chunk-Weg wie `rvHdf5.ts`), Standorttabelle (17 × id/WMO), Dateiname/URL je Slot | Verifier A/B an echten Dateien (Attribute, Maße, Projektion, Werte = h5py-Referenz) |
| R250-2 Algebra | `src/sources/radarHd250.ts`: Zielgitter, Verschiebung je Standort, nächster-Standort-Komposit, Z-R, Verankerung, Log-Kodierung, 16 Kacheln; Vertrag `hd250.json` (Schema 1) mit Bauer/Prüfer | Verifier C (Mittel je km² = RV exakt, trocken ⇔ trocken, flach ohne Echo, Versatz ≤ 125 m), D (Meta), Gegenprobe gegen die Python-Referenz (E) |
| R250-3 Producer | `radar-derive.mjs hd250 <rvTar> <outDir> <stamp> [sitesDir]`: lädt die 17 Dateien (oder liest sie), schreibt `h<ty><tx>.png` + `hd250.json` nach `img/rv-past/<stamp>/`; Spiegel ruft ihn nach dem RV-Derive; `RADAR_HD250=0` schaltet ab (Rückweg) | Rundlauf an den echten Dateien (F), Laufzeit gemessen |
| R250-4 Client | `src/scalar/radarHd250.ts` (Schalter `?hd250=0|1`, Kachelgeometrie, Mesh je Kachel), Leser (`fetchImgRes`, Worker-Decode), `MapView`: bis zu 16 `RainLayer` über der DE-1-km-Ebene, Sichtbarkeit ab Zoom 9, nur sichtbare Kacheln, LRU, progressiv (1 km zuerst), Morph mit dem 1-km-Feld ×4, Status „250-m-Gitter" | ohne Schalter pixelgleich (Pixel-Diff), Browser-Sonde z10 (Kacheln da, Konsole sauber), typecheck/Build/Budget |

Nicht in dieser Phase: AT/CH (keine offene Quelle), 250 m für die Extrapolation (keine Messung), Polarvolumen.

## §6 Umsetzung (09.10.2026, uncommitted in buscosun-web)

### §6.1 Leser `src/sources/dwdPx250.ts` (R250-1)
Standorttabelle (17 × `id`/WMO aus dem Verzeichnis und `/what source` der Dateien), Dateiname/URL je RV-Stempel,
`decodePx250`: prüft Maße 1600², Zelle 250 m, Projektion (stere, lat_ts 60, lat_0 90, lon_0 10, WGS84-Ellipsoid; alles
andere ist ein fremdes Produkt), Größe DBZH; schneller Ein-Chunk-Weg (uint16 LE, ein Chunk = Feld, nur deflate — wie
`rvHdf5.ts`), sonst jsfive; liefert dBZ (`NaN` = nodata, `−∞` = kein Echo), Scanzeit, `x_0/y_0`, Standortlage. Am echten
Standortbild: Schnellweg = jsfive-Weg auf jeder der 2 560 000 Zellen (§7 E1).

### §6.2 Algebra und Vertrag `src/sources/radarHd250.ts` (R250-2)
Konstanten mit Herkunft (`RV_X0/RV_Y0` aus dem `projdef` des RV-HDF5; Z-R 256/1,42; Kachelung 4 × 4 × 1100 × 1200);
`hd250CellXY` (Zellmitte), `px250Shift` (ganzzahlige Verschiebung + Rest ≤ ½ Zelle), `compositePx250` (nächster
Standort je Zelle, `dist`/`siteIdx` je Zelle), `zrRate`, `anchorToRv` (Mittel je 1-km-Block exakt RV, flach ohne Echo,
trocken ⇔ trocken; zählt nasse/strukturierte/flache Blöcke), `hd250Tiles` (Log-Byte, 16 Kacheln, trocken-Flag), Vertrag
`hd250.json` Schema 1 (`makeHd250Meta`/`parseHd250Meta` — Konstanten, Kachelliste, Standorte benutzt/fehlend, Blockzahlen;
der Prüfer lehnt jede Abweichung ab). Ablage `radar/img/v1/rv-past/<stamp>/{hd250.json, h<ty><tx>.png}` — im Rückblick-
Slot, der schon die Analyse `f000.png` trägt (Retention 24 Slots = 2 h, Altersregel des Spiegels).

### §6.3 Producer (R250-3)
`radar-derive.mjs hd250 <rvTar> <rvPastSlotDir> <stamp> [sitesDir]`: Analyse (`_000-hd5`) aus dem RV-Tar (nur die
HDF5-Lieferform trägt den Anker), 17 Standortbilder aus `sitesDir` oder per Download vom DWD (30-s-Frist je Datei; fehlende
oder fremde Dateien — anderer Standort, andere Scanzeit — werden benannt und ausgelassen), Komposit → Verankerung → Kacheln
(nur nasse geschrieben, Meta zuletzt). `radar-mirror.mjs`: nach `derive('rv')` + `rvPastCopy` ruft `deriveHd250()` den
Kindprozess (Frist 150 s), Ergebnis im Log und in `status.json` (`hd250` je Zeile); `HD250_ON` nur mit Rückblick, Web-Klon
und Vertrag im Klon (`src/sources/radarHd250.ts`) — ohne ihn läuft der Spiegel byte-gleich wie bisher; `RADAR_HD250=0` =
Rückweg (Vorlage `workflow-radar.yml` trägt `RADAR_HD250: '1'`). Gemessen am Slot 17:20 (lokal, i7): Derive **5,8–6,4 s**,
14 Kacheln **2,44 MB** (Z_RLE-Encoder; 9…471 KB je Kachel), 17/17 Standorte, Blöcke nass 304 499 / strukturiert 266 096 /
flach 38 403. Budget je Slot: Download 6,5 MB vom DWD + 2,4 MB ins Repo (24 Slots ≈ 58 MB im Bestand; der ICON-Publisher
setzt die Historie alle 3 h neu auf).

### §6.4 Daten-Repo
`scripts/radar-mirror.mjs` und `.github/workflows/radar.yml` aus den Vorlagen eingespielt und gepusht (Jans Vollmacht
09.10.: „Du darfst dieses Repo in dieser Session verändern") — Commit **`dd5327334`** auf `origin/main` (ein Push-Versuch
vom laufenden Spiegel abgelehnt, Rebase, zweiter Versuch), dazu **`b9ad9092a`** mit der Korrektur aus V-R250-7 (der
erste Stand hätte den nächsten Spiegel-Job mit einem Syntaxfehler beendet — gefunden von `verify:np0-radar`, der das
Skript als Modul importiert; `node --check` am Daten-Repo-Stand grün). Ohne den Push von buscosun-web `main` ändert das nichts am
Betrieb: der laufende Job behält seinen Klon, der nächste Job findet den Vertrag erst nach Jans Push (§6.3, §57).

### §6.5 Client (R250-4)
- `src/scalar/radarHd250.ts`: Schalter (`?hd250=0|1` / `localStorage.radarhd250`, Voreinstellung an), `RADAR_HD250_MIN_ZOOM`
  9 (darunter ist eine 250-m-Zelle schmaler als ein Pixel), Kachelgeometrie = Viertel des DE1200-Footprints
  (`hd250TileNode` → `de1200Node`, Mesh N 88 = Knotenabstand des 352er-Meshs), Bounding-Box je Kachel, `hd250VisibleTiles`,
  Kachelmaske aus der 1-km-DE-Maske (Elternbyte), `hd250TileFlow` (1-km-Feld des HD-4-Morphs auf die Kachel geschnitten, × 4).
- `src/sources/radarHd250Read.ts`: Meta/Kachel über `fetchImgRes` (CDN mit Hedge + raw-Ausweichweg, CDN-Frist), Decode
  off-main im RADOLAN-Worker (`decodeGrayPngOffMain`), 404 = „kein Produkt" (gemerkt).
- `src/scalar/radarHd250Store.ts`: Zustände `loading`/`ready`/`dry`/`none`/`failed` je Kachel, ≤ 4 parallele Abrufe je Slot,
  LRU 40 Kacheln (≈ 53 MB), Benachrichtigung je Ankunft (Mikrotask-gebündelt), Wiederholung eines Fehlers nach 60 s.
- `MapView.tsx` (additiv): 16 `RainLayer` (`precip-rain-hd250-<ty><tx>`, Log-Rampe, Filter wie HD) direkt über der
  DE-1-km-Ebene; `moveend` tickt; `syncHd250(ra, rb, q)` nach jedem `syncHd`: Analyse-Stempel aus dem gewählten RV-Frame
  (Lead 0 des Laufs oder Rückblick-Frame — alles andere, d. h. die Extrapolation, bleibt 1 km), sichtbare Kacheln ab Zoom 9,
  und NUR wenn jede sichtbare Kachel des gezeigten Slots aufgelöst ist (geladen oder trocken) werden die Kacheln gezeigt und
  die 1-km-Ebene tritt zurück (progressiv: 1 km sofort, 250 m als Ganzes); zwischen zwei Analysen Morph mit dem 1-km-Feld ×4
  (sonst lineare Mischung), zwischen Analyse und Extrapolation 1 km. Sichtbarkeitsregel der Kachel-Ebenen = die der DE-Ebene.
  Status: „· DE 250 m (Standortradare, ab Zoom 9)".
- Ohne Schalter entstehen keine Kachel-Ebenen, kein Abruf, kein Tick — der Stand vor R250.

## §7 Gates

| Gate | Beleg | Ergebnis |
|---|---|---|
| G1 Leser/Algebra/Vertrag | `npm run verify:radar-250m` mit `RADAR_250_RAW=<Slot 17:20>` (A Schalter/Konstanten, B Geometrie inkl. der 17 echten Standortversätze ≤ 125 m = Python-Referenz, C synthetische Algebra, D Vertrag 12 Mutationen, E echte Dateien: Decoder Schnellweg = jsfive, Derive-Rundlauf, Kacheln byte-gleich zum Bibliotheksweg, Blockregel nass ⇔ nass und Blockmittel ≤ 2 % (52 195 Blöcke ≥ 0,5 mm/h; 2 032 mit gesättigter/unterschwelliger Zelle nicht beurteilt), Gegenprobe gegen die unabhängige h5py/numpy-Referenz 21 119 963 Bytes gleich · 37 ± 1 · 0 weiter, F Store gegen gestubbtes fetch) | **30/30** |
| G2 Browser | `scripts/radar-250m-probe.mjs --dir=<Slot>` (CDP schiebt den lokalen Slot unter den Live-Stempel, Zoom 10 über der nassesten Kachel) | s. §7.1 |
| G3 ohne Schalter | Rule 2: ohne `hd250` keine Ebenen/Abrufe (Codepfad); Pixel-Diff `?hd250=0` gegen HEAD = Jans Gate 3 (§57) | — |
| G4 typecheck / Build / Budget | typecheck 0; Build 255/255; `npm run budget`: totalJs 1 695,4 / **1 697** (angehoben, +2,4 KB lazy MapView-Chunk), eagerJs 109,3 unverändert | grün |
| G5 Nachbarn | `verify:radar-hd` 53/53 (E5 = Phasenwache auf die Zeile `if (hd.on) syncHd(pickCompositeFrames(forecastHour…` — beibehalten, R250 ruft daneben), `verify:radar-repack` 55/55 (1 ⊘), `verify:np0-radar` **39/39** (fand V-R250-7), `verify:regenradar-profile` 24/24 (1 ⊘), `verify:precip-source` grün, `verify:radar-fallback` grün | grün |

### §7.1 Browser-Sonde (chrome-headless-shell, Dev-Server `vite --port 5231` — die Haken `window.__map`/`__precipSources`
gibt es nur im DEV-Build; der Produktionsbuild ist über Build 255/255 + Budget belegt; 1440 × 900)
`scripts/radar-250m-probe.mjs --dir=<Slot 17:20>`: die Seite `/wetterkarte/niederschlag/muenchen` lädt den LIVE-RV-Lauf
(Stempel 2610091755), die Sonde beantwortet `rv-past/2610091755/hd250.json` und die Kacheln aus dem lokalen Slot. Sprung
über die nasseste Kachel (2, 1) bei Zoom 10:
- **mit Schalter:** nach **2,0–2,3 s** (zwei Läufe, der zweite auf dem Endstand mit dem eigenen Kachel-Effekt) EINE Kachel-Ebene sichtbar (`precip-rain-hd250-12`, Textur 1100 × 1200, Maske da,
  Filter Catmull), die DE-1-km-Ebene auf Deckkraft 0; genau **2 Abrufe** (`hd250.json`, `h12.png`); Konsole 4 Zeilen ohne
  Fehler/Warnung; Status „Niederschlag · DACH-Komposit · DE RADOLAN · 1-km-Gitter (HD) · DE 250 m (Standortradare, ab
  Zoom 9)" (Bild `audit/radar-250m/probe-z10-hd250.png` — die 250-m-Zellen ≈ 4 px, Binnenstruktur sichtbar).
- **ohne Schalter (`?hd250=0`):** keine Kachel-Ebene im Stil, 0 Abrufe — der Stand vor R250 (`probe-z10-hd250-off.png`).
- **Zoom 8 mit Schalter:** 0 Abrufe, keine Kachel sichtbar — die 1-km-Ebene trägt (`probe-z8-hd250.png`).
Nicht belegt (headless): Long Tasks, Telefon (Jans Gate 4, §57). Die Sonde ersetzt keinen Pixel-Orakel-Vergleich wie in Phase
HD; der Weg Bytes → Textur → Shader ist derselbe `RainLayer` (unverändert), die Bytes sind im Verifier gegen die Algebra geprüft.

## §8 Befunde und Entscheidungen
- **E-R250-1 (Auftrag):** Verfahren B (§4), Voreinstellung an, `?hd250=0` = Stand vor R250 (1 km), Producer-Schalter
  `RADAR_HD250` — Push des Workflows ins Daten-Repo = Jans Gate (Workflow-Dateien kann nur ein Nutzer-Token pushen).
- **V-R250-1** Die 250-m-Zelle ist jenseits von 14 km vom Standort ein Polarbin, das tangential breiter als 250 m ist (§2); eine
  Karte der effektiven Auflösung (Abstand zum liefernden Standort, `comp.dist`) ließe sich als Hinweisebene zeigen — nicht gebaut.
- **V-R250-2** Blöcke mit einer Zelle über 200 mm/h (Deckel der Log-Ebene, 3 Zellen im Messslot) verlieren beim Dekodieren Masse
  (bis 30 % im Block); eine höhere Obergrenze der Log-Ebene beträfe HD-3 (Codec, Rampe) = eigener Schritt.
- **V-R250-3** Die Extrapolation (+5 … +120 min) bleibt 1 km: beim Abspielen über „jetzt" hinaus wechselt die Schärfe sichtbar
  (Messung → Vorhersage). Ein 250-m-Nowcast wäre die Verschiebung der Analyse entlang des Bewegungsfelds = Interpolation, deshalb
  nicht gebaut (E-R250-3 = Jans Entscheidung).
- **V-R250-4** `only px nass` 1,5–2 % der Zellen (Momentbild gegen 5-min-Summe, Echoschwelle); durch die Verankerung ohne Wirkung
  (RV trocken ⇒ trocken). Umgekehrt bleiben 6,4 % der nassen RV-Blöcke flach (kein Standortecho) — dort ist die Kachel 1-km-Information.
- **V-R250-5** Der erste Slot nach dem Push ist der erste mit Kacheln; die Slots des Rückblicks davor bleiben 1 km (keine
  Nachrechnung, die DWD-Dateien hielten 48 h — ein Nachholen wäre ein Spiegel-Schritt, nicht gebaut).
- **V-R250-6** Im Python-/Node-Vergleich 37 von 21 Mio. Bytes um eine Stufe verschieden: Rundungsgrenzen (float32 gegen float64)
  — keine Kodierungsfrage.
- **V-R250-7 (behoben)** Der erste Stand von `radar-mirror.mjs` deklarierte `h` zweimal im selben Block (HEAD-Antwort und
  hd250-Ergebnis) — ein Syntaxfehler, den ein Testlauf des Derive allein nie zeigt; `verify:np0-radar` importiert das Skript als
  Modul und fiel um. Lehre: jede Änderung am Spiegel-Skript vor dem Einspielen mit `node --check` UND dem Modul-Import prüfen
  (der Daten-Repo-Stand war 11 min lang kaputt, kein Job startete in der Zeit — Korrektur `b9ad9092a`).
