# Niederschlagssummen 1 · 3 · 6 · 12 · 24 · 48 h auf `/regenradar` — Diagnose (Phase NS)

> Stand 08.10.2026. **Nur Diagnose, kein Code.** Auftrag: Summen 1/3/6/12/24/48 h auf `/regenradar` (`MapView`, Profil `radar`) —
> gemessen rückwärts, erwartet vorwärts (Radar-Nowcast, dann Cube/buscosun Fusion 8), Naht sichtbar. Gebaut wird erst nach
> Jans Entscheidungen (§6), additiv hinter `?sum=0`, Wetterkarte pixelgleich, kein Shader, keine Fusion-Änderung, kein Push,
> Purge oder Daten-Repo-Commit. Belege: Abrufe vom 08.10.2026 ≈ 14:30–16:35 UTC (Befehle in §8).

## 0. Kurzfassung für Jan

1. **Der 20.10. trifft die Summen nicht, wenn wir HDF5 lesen.** `radolan/rw/` (Stundensumme) und `radolan/sf/` (24-h-Summe)
   liegen heute schon als `.hdf5` neben der `.bz2`. Die HDF5-Fassung hat das 1100×1200-Gitter des RV (die Binärfassung nur
   900×900). Ob DWD die `radolan/*`-HDF5 über den 20.10. hinaus weiterführt, steht in keiner Quelle, die ich finden konnte
   (die Newsletter-Formulierung nennt „Komposits mit HDF5-Produktion"); das beobachten wir am 20.10., der Leser hängt aber
   an keinem Binärformat (V-NS-1).
2. **Gemessene Summen gibt es offiziell für DE (RW, SF), CH (CombiPrecip) und AT (INCA-Analyse `RR`, stündlich).** Alle drei
   sind mit Regenmessern korrigiert. AT ist also keine harte Lücke — aber nur über einen dritten Abruf mit Rate-Limit
   (240/h) und einem NetCDF-Leser. Die Lücke „AT gezeigt" ist die Rückfallstellung (E-NS-2).
3. **48 h reichen genau für 48 h:** DWD hält RW und SF **exakt 48 h** (RW 288 Stempel im 10-min-Raster, SF 48 stündliche).
   Eine Summe „48 h bis zu einem früheren Zeitpunkt" gibt es aus der Quelle nicht — nur ein eigener Spiegel kann die
   Vergangenheit länger halten. Für „bis jetzt" genügt DWD allein (SF(t) + SF(t − 24 h) ist exakt 48 h).
4. **Die letzten ≈ 25–35 min fehlen in jeder amtlichen Summe** (RW kommt +25 min nach dem Fensterende, SF +29 min, CPC +4 min,
   INCA +35 min). Das Radar-Analysebild (RV `f000`, Spiegel `rv-past`) füllt die Lücke, ist aber **nicht** korrigiert:
   an der Stunde 12–13 UTC vom 08.10. lag die RV-Summe über 696 000 Zellen bei **0,886 × RW** (Korrelation 0,74). Die Naht
   RW → RV ist also eine echte Stufe von ≈ 11 % und gehört in die Legende.
5. **Die 5-min-Frames des Spiegels taugen nur eingeschränkt zum Summieren.** Sie sind u8 linear, 255 = 20 mm/h, unter
   0,06 mm/h = 0: Nieseln fällt heraus (bei 12 h trocken-nass-Mix sichtbar), Starkregen > 20 mm/h wird abgeschnitten
   (Unterschätzung genau dort, wo Summen interessieren). `src/radar/accumulation.ts` erbt beides. Der Spiegel hat bereits den
   Präzedenzfall `m<lead>.png` (RGB-Summenbild auf Rohbytes, B = Zahl gesättigter Frames); eine exakte Variante aus den Floats
   der RV-Tar ist möglich (E-NS-3).
6. **Jenseits 2 h gibt es für die Karte keine Mittelwert-Summe im Datenprodukt:** das NP-0b-Feld trägt Chance · Median | nass ·
   q90 — **Quantile addieren sich nicht**, der Mittelwert (= Chance × Mittel | nass) ist aus diesen drei Kanälen nicht
   herstellbar. Ehrlich möglich: eine **Erwartungssumme** (Mittelwerte addieren sich), ohne Band — oder ein neues Produkt aus
   dem Producer (E-NS-4).

## 1. Ausgangslage im Code

| Was | Befund |
|---|---|
| `src/radar/accumulation.ts` | `accumulate(frames, w, h, fromMin, toMin, vmax)`: Trapez über u8-Frames (mm/h = Byte/255 × 20), Fenster 1/2/6 h, `accumRamp` (sand → blau → violett). Hängt am **alten** `RadarMap` (`accumValues` → `RainLayer.setFrame` + `setColorRamp`). Eingabe nur Frames mit `leadMinutes`, nie Messungen |
| `/regenradar` heute | `MapView` mit Profil `radar` (`src/map/mapProfile.ts`): Layer `nowcast`, `cells`, `lightning`, `snow`, `snowline`. `accum` ist ausdrücklich **nicht** übernommen (E-RR-3) |
| Anzeige-Weg | `RainLayer` (`PRECIP_VMAX` 20) nimmt u8-Raster + eigene Rampe per `setFrame`/`setColorRamp` — der Alt-Weg zeigt, dass **kein Shader-Eingriff** nötig ist |
| Spiegel (`radar/img/v1/`) | `rv` 12 Slots (je `f000…f120`, 5 min, u8), `rv-past` 24 Slots `f000` (= 2 h Analyse), `inca` 12, `rzc` 24, Blitze 24; **RW, SF, CPC und INCA-Analyse fehlen** |
| Stundensumme exakt | `radarImgHourMean.ts` (`m<lead>.png`): je volle Stunde nach dem Slot ein RGB-Summenbild der Rohbytes (R·256+G = Summe, B = gesättigte Frames) — Vorbild für exakte Summen |
| Cube | `precip` = **mittlere Rate mm/h über (t − Δ, t]**, Δ = 1/3/6 h je Stufe (D-NP0-9); t1 49 Schritte 1 h, t2 3 h, t3 6 h |
| Felder (NP-0b) | `point/field/v1/…/precip-LLL.png`: R Chance · G Median \| nass · B q90, log-kodiert, A 0/255 — **kein Mittelwert, keine Summe** |

## 2. Amtliche Summenprodukte — gemessen am 08.10.2026

### 2.1 DWD `radolan/rw/` — Stundensumme (HDF5)

| | |
|---|---|
| Pfad | `opendata.dwd.de/weather/radar/radolan/rw/raa01-rw_10000-<JJMMTTHHMM>-dwd---bin.hdf5` (+ `…-latest-…`), daneben `…bin.bz2` |
| Takt | **alle 10 min** ein gleitendes 60-min-Fenster: Stempel 13:10 → `startdate/time` 12:10 … `endtime` 13:10 (geprüft an 13:00 und 13:10) |
| Latenz | Stempel 14:00 erschien 14:25:36 (+25,6 min); 06.10. 14:10 → 14:35, 14:20 → 14:47 (+25…27 min) |
| Retention | **288 Stempel = 48 h** (06.10. 14:10 … 08.10. 14:00) |
| Inhalt | ODIM `quantity ACRR`, uint16, **gain 0,1 mm**, offset 0, `nodata` 65535, `undetect` 0; `camethod "RGA: STANDARD ADJUSTMENT WITH GAUGES"` (Regenmesser-korrigiert) |
| Gitter | **1100 × 1200**, 1 km, Zeile 0 = Norden, dieselbe Stereographie wie RV (`x_0` 543196,8; `y_0` 3622588,9) — das Binärfassungs-Gitter (900×900) ist ein Teilausschnitt |
| Größe | 30 KB (trocken) … 231 KB (nass) |
| Abdeckung gültig (≠ nodata) | DE **94,5 %**, AT 52 % (nördlicher Streifen, Westen 99 %), CH 84 % — außerhalb DE nur Radar, keine DWD-Regenmesser |
| Quantisierung | 0,1 mm je Stunde ⇒ zwölf verkettete Stunden tragen bis ±0,6 mm Rundung (typisch ±0,2); `undetect` = 0 heißt „< 0,05 mm", nicht „nichts gemessen" |

### 2.2 DWD `radolan/sf/` — 24-h-Summe (HDF5)

Stempel :50 stündlich, Fenster 24 h (`startdate 07.10. 13:50`, `enddate 08.10. 13:50`), Latenz **+29 min** (13:50 → 14:19),
49 Dateien = 48 h Retention, gleiche Kodierung wie RW (gain 0,1, `STANDARD ADJUSTMENT WITH GAUGES, 24H-SUM`), 52–57 KB
trocken, 732 KB am 08.10. **48 h = SF(t) + SF(t − 24 h)** exakt (nicht überlappende Fenster), beide liegen im Verzeichnis.

### 2.3 DWD `composite/rs/` — Summen-Nowcast

`composite_rs_<JJJJMMTT>_<HHMM>.tar`, 25 ODIM-Felder `_000…_120`, uint32, gain 0,001 mm, `camethod DOMAIN`. Jedes Feld ist ein
**gleitendes 60-min-Fenster** (Lead 0: 13:25–14:25 = die zurückliegende Stunde, Lead 60: 14:25–15:25, Lead 120:
15:25–16:25). „Nächste 1 h" = Lead 60, „nächste 2 h" = Lead 60 + Lead 120, exakt und mit 0,001 mm Auflösung. **Aber 1,9 MB trocken,
23,8 MB am 08.10. 14:28** — für den Spiegel-Abruf zu schwer, und `rs` ist bisher nirgends im Code gelesen.

### 2.4 MeteoSchweiz CombiPrecip (CPC) — Stundensumme CH

`ch.meteoschweiz.ogd-radar-precip`, Item `<JJJJMMTT>-ch`, Asset `cpc<JJ><JJJ><HHMM><Q>_00060.001.h5`.

| | |
|---|---|
| Takt | **alle 5 min** (174 Assets um 14:30; die Doku `docs/API.md` §5.2 nennt 10 min — zu korrigieren, V-NS-4) |
| Fenster | gleitende 60 min: Stempel 13:05 → 12:05–13:05; `prod_date` 13:09 (**+4 min**) |
| Retention | 14 Tage (Reanalyse `CPCH` nach 8 Tagen ersetzt die Stunden — für ≤ 48 h irrelevant) |
| Inhalt | `ACRR`, **float64 mm**, `nodata` NaN, 270 Regenmesser eingerechnet (`Nr.raingauges.used`), Qualität `Qc/Qr` 9 |
| Gitter | 710 × 640, LV95 (`somerc`), 1 km — **624 KB je Datei**, ein Client-Abruf von 48 Dateien kommt nicht in Frage |

### 2.5 GeoSphere INCA-Analyse — Stundensumme AT

`dataset.api.hub.geosphere.at/v1/grid/historical/inca-v1-1h-1km`, Parameter `RR` (kg m⁻² je Stunde), 1 km, EPSG:31287,
Archiv ab 2011, `end_time` 14:00 bei Abruf 14:35 (**≈ +35 min**), NetCDF **878 KB je Stunde** für den AT-Ausschnitt
(Bbox 45,8/8,2/49,4/17,7; die im Spiegel für den Nowcast benutzte Bbox 45,51/8,11 liegt **außerhalb** der Analyse-Domäne und
liefert 400 „Requested bounding box is outside of dataset bounds"). Rate-Limit 5/s und **240/h** (Header), der INCA-Nowcast-Poll
des Spiegels verbraucht davon ≈ 80/h Metadaten-Abrufe. Eine neue Stunde = 1 Abruf; Nachholen von 48 h = 48 Abrufe oder wenige
Bereichsabrufe.

### 2.6 Verträglichkeit untereinander (gemessen)

Stunde 12–13 UTC am 08.10., RV-Analyse (12 × `_000`, 5-min-Beträge) gegen RW(13:00), Zellen beider gültig (695 833):

| | |
|---|---|
| Σ nasse Zellen RV / RW | **0,886** (Mittel RV 0,679 mm, RW 0,767 mm) |
| Korrelation (nasse Zellen) | 0,742 |
| RW = 0, RV > 0,1 mm | 38 884 Zellen (RV sieht Echos, die RW verwirft) |
| RV = 0, RW ≥ 0,1 mm | 2 166 Zellen |
| gültig nur RW / nur RV | 107 279 / 6 329 |

⇒ Eine Summe, die RW und RV ohne Kennzeichnung zusammenklebt, springt an der Naht um ≈ 10 %; die Stunde ist ein Einzelfall,
kein Eichwert (Wiederholung über mehrere Tage gehört in die Umsetzung, V-NS-3).

## 3. Wie ehrlich summieren

| Regel | Folge |
|---|---|
| **Quantile addieren sich nicht** | Median/q90 einzelner Stunden dürfen nie zu einer Summe addiert werden. Nur Mittelwerte (Erwartung) addieren sich. Eine Summen-Spanne bräuchte eine Abhängigkeitsannahme zwischen den Stunden, die wir nicht gemessen haben ⇒ keine Spanne ohne Messung |
| **Fehlend ≠ 0** | `nodata` (RW/SF 65535, CPC NaN, INCA Maske, RV-Maske) bleibt in der Summe `nodata`, wenn **eine** der Stunden fehlt. Zellen mit Teilabdeckung („37 von 48 h") bekommen kein Ergebnis, nicht eine Teilsumme — oder eine benannte Teilsumme mit Kennzeichnung (E-NS-5) |
| `undetect` ≠ nodata | RW/SF `undetect` 0 zählt als 0 mm („< 0,05"), nicht als fehlend |
| Rundung | RW-Verkettung trägt Rundung (§2.1); für 24/48 h ist SF/SF+SF die genauere Quelle, für 6/12 h die RW-Kette |
| Sättigung | u8-Frames: > 20 mm/h werden geclippt ⇒ Summe ist eine **Untergrenze**, die Zahl gesättigter Frames je Pixel gehört mit (wie `m<lead>.png` B) |
| Nieseln | u8-Frames: < 0,06 mm/h = 0 ⇒ Summe mit Totzone; 12 Frames à 0,5 mm/h gäbe 0,5 mm, ein einzelner Frame 0,04 mm/h wird 0 |
| Teilstunden | der Cube hat Stufenmittel (1/3/6 h); ein Fenster ab „jetzt" (nicht stundenrund) nimmt den Anteil der Stufe — **linear, unter Annahme gleichmäßiger Rate in der Stufe**; im Kleingedruckten |
| Länder | RW gilt in DE; CH aus CPC, AT aus INCA; Randzone mit Länderregel wie `countryRowPicker` (V-FR-11), nicht gemittelt. Ohne AT-Quelle: AT als „keine amtliche Summe" zeigen, nicht 0 |

## 4. Die vier Strecken einer Summe — und ihre Nähte

Eine „Summe der letzten N h" besteht aus **gemessenem Teil** (amtlich, korrigiert) + **Randstück** (RV-Analyse, unkorrigiert,
≈ 25–35 min). Eine „Summe der nächsten N h" besteht aus **Nowcast** (RV `f005…f120`, 0–2 h) + **Modell** (Cube, ab 2 h). Die
Nähte, die sichtbar sein müssen (Legende + Kartenbeschriftung, keine stillen Übergänge):

| Naht | Wo | Messung / Befund |
|---|---|---|
| N1 gemessen (korrigiert) → Randstück RV-Analyse | „jetzt − 25…35 min" | RV 0,886 × RW (§2.6) |
| N2 Messung → Nowcast | „jetzt" | Nowcast RV beginnt aus der Analyse, nicht aus RW |
| N3 Nowcast → Modell | 2 h | Fusion 8 am Punkt überblendet beides, die Felder (`nowcast: []`) nicht — auf der Karte ein harter Wechsel; Cube-Stufen Δ = 1 h (t1) |
| N4 t1 → t2 | ab dem t1-Ende | t1 hat 49 Schritte ab Lauf-Init; der Init liegt Stunden zurück ⇒ „jetzt + 48 h" liegt meist hinter t1 und verlangt t2 (Δ = 3 h): gröber, glatter |

Die Naht wird **nicht** geglättet oder „korrigiert" (kein Skalieren von RV auf RW — das wäre eine nicht gemessene Annahme).

## 5. Spiegel-Haken für 48 h — geht das?

**Ja, nach demselben Muster wie `lightning-mirror.mjs` / `road-mirror.mjs`** (Haken-Modul im Web-Klon, Abruf im Hintergrund,
Mitfahrt im nächsten Produkt-Push, Fehler nimmt nie den Radar-Push). Eckdaten:

| Posten | Zahl |
|---|---|
| Abrufe je Stunde | RW 1 (:00-Stempel) · SF 1 · CPC 1 · INCA 1 — alle < 1 MB (SF/INCA nass bis 0,9 MB) |
| Abgeleitet | je Fenster ein Summenbild; ein Pfad `radar/img/v1/sum/<Quelle>/<Stempel>/…` (Vorschlag, E-NS-1) |
| Größe je Stunde (Schätzung) | RW/CPC/INCA-Summenbild im 8-Bit-Log-Code ≈ 30–150 KB je Fenster; 6 Fenster × 3 Länder ≈ 0,5–2 MB/h ⇒ Baum +10–50 MB bei 48 h Aufbewahrung (Baum heute 337 MiB, 20-MB-Dateigrenze unberührt) — **vor dem Bau gemessen, nicht angenommen** |
| Aufbewahrung | Altersregel 48 h (+ Reserve) in den Kern-Retention-Tabellen (`IMG_KEEP`/`RADAR_IMG_AGE_RULE`), wie bei den Blitzen — **Kern-Eingriff**, der einmalig ist; Autobahnwetter-Linie hat Rechte am selben Kern (V-NP0-5) |
| Rückweg | Schalter (`SUMS=0`) räumt den Altbestand wie `LIGHTNING=0` |
| Gate | frühestens `Stempel + Latenz` (RW +30, SF +35, CPC +10, INCA +45 min), fehlt ⇒ kein Verzeichnis, nie 0 |
| Alternative ohne Spiegel | der Client holt `latest` direkt von DWD/GeoSphere/STAC: RW/SF gehen (231/732 KB, CORS/Proxy-Pfad `/_dwd_opendata` vorhanden), CPC (624 KB) und INCA (878 KB, Rate-Limit, kein CDN) nicht sinnvoll ⇒ nur als Notweg |

## 6. Entscheidungen für Jan (E-NS-1…6)

| # | Frage | Empfehlung |
|---|---|---|
| **E-NS-1** | Rückwärts-Summen: **Spiegel-Haken** (RW + SF + CPC [+ INCA]) mit fertigen Summenbildern je Fenster, oder der Client holt nur DWD direkt (DE) und zeigt CH/AT als Lücke? | Spiegel-Haken, DE + CH zuerst |
| **E-NS-2** | Österreich: INCA-Analyse `RR` einbinden (Rate-Limit, NetCDF-Leser, +1 Abruf/h) **oder** AT als Lücke zeigen („keine amtliche Summe")? | INCA einbinden, aber als eigener Schritt nach DE + CH; bis dahin Lücke benannt |
| **E-NS-3** | Randstück „jetzt − 30 min": nur „Stand RW" zeigen (Summe bis zum RW-Ende, Uhrzeit im Etikett) **oder** mit RV-Analyse auffüllen (kenntlich, ≈ −11 %)? Und Nowcast-Summen: aus den u8-Frames (`accumulate`, Totzone + Sättigung bekannt) **oder** exakt aus den Floats der RV-Tar als neues Spiegelprodukt (Muster `m<lead>.png`)? | „Stand RW" als Voreinstellung, Auffüllen als zweiter Zustand; Nowcast exakt (Derive-Eingriff, E-NP0-7-Regeln) |
| **E-NS-4** | Vorwärts jenseits 2 h: **Erwartungssumme ohne Band** aus dem Cube (Mittel addiert sich, Spanne weggelassen) — aus dem Roh-Cube im Client, oder als neues Producer-Produkt `point/field/…/sum` (Fusion-Erwartung, Jans Gate, Cron-Zeit)? | Roh-Cube im Client zuerst (kein Daten-Repo-Eingriff), Etikett „Modell · Cube, Erwartung"; Fusion-Summe später mit Messung |
| **E-NS-5** | Zellen mit unvollständiger Abdeckung: kein Ergebnis zeigen **oder** Teilsumme mit Kennzeichnung („nur 37 von 48 h")? | kein Ergebnis in der Karte, Teilsumme nur im Readout benannt |
| **E-NS-6** | Zeitbezug: Summen nur „bis jetzt" / „ab jetzt" **oder** auch wählbarer Endzeitpunkt über die Zeitleiste (DWD hält nur 48 h, ältere Summen brauchen den eigenen Spiegel ab dem Start)? | nur „bis jetzt"/„ab jetzt"; wählbare Zeit später, wenn der Spiegel wächst |

## 7. Bauplan (nach den Entscheidungen) und Gate

Additiv hinter `?sum=0`; Profil `radar` bekommt eine Ebene `sum` (Dock-Auswahl 1/3/6/12/24/48 h × „zurück/voraus"); Anzeige über
`RainLayer.setFrame` + `setColorRamp` wie der Alt-Weg (kein Shader); Legende mit den Strecken §4; reine Rechenlogik in
`src/radar/sums.ts` (kein Maplibre, headless prüfbar); Spiegel-Haken `scripts/sums/sums-mirror.mjs`; Verifier
`verify:precip-sums` (A Rechenregeln: Quantile, fehlend ≠ 0, Rundung, Sättigung · B Rundweg der Kodierung gegen unabhängige
Referenz · C Spiegel gegen Bare-Repo wie `verify:np0-radar` · D Wetterkarte pixelgleich (`regenradar-wk-pixeldiff`) und
`?sum=0` = Stand vor der Phase · E `--live`). Nicht angefasst: Shader, `src/pointForecast/**`, Daten-Repo.

## 8. V-Einträge und Belege

- **V-NS-1** Ob `radolan/rw|sf` im HDF5 am 20.10. weiterlaufen, ist nicht belegt (nur „Komposits mit HDF5-Produktion"). Mehrwert:
  kein Stillstand der Summen. Skizze: Termin ins Register (`SCHEDULED_CHANGES`, informational), am 20.10. Verzeichnis lesen;
  Rückfall = RV-Kette aus dem eigenen Spiegel (unkorrigiert, benannt).
- **V-NS-2** RW-HDF5 trägt das RV-Gitter 1100×1200 (nicht 900×900): die Binärfassung ist ein Teilausschnitt ohne den Süden/Westen
  außerhalb DE — wer RW-Bin liest, sieht AT/CH-Rand nicht.
- **V-NS-3** RV/RW-Verhältnis (0,886) ist ein Einzelfall — mehrere Regentage messen, bevor es in einem Text steht.
- **V-NS-4** `docs/API.md` §5.2 nennt CPC „10 min": gemessen 5 min; dort auch die Rolle von `CPC` (gleitendes 60-min-Fenster,
  float64, 624 KB) nachtragen.
- **V-NS-5** INCA-Analyse-Domäne (45,77/8,10 … 49,48/17,74) ist kleiner als die Nowcast-Bbox des Spiegels (45,51/8,11 …) — eine
  gemeinsame Bbox gibt 400.
- **V-NS-6** `src/radar/accumulation.ts` summiert u8-Bytes (Totzone < 0,06 mm/h, Sättigung 20 mm/h) und kennt keine Länder,
  keine Messungen, kein `nodata` — als Rechenkern für Summen ungeeignet, nur als Vorbild.

Befehle (08.10.2026): `curl https://opendata.dwd.de/weather/radar/{radolan/rw,radolan/sf,composite/rs,composite/rv}/` (Listings);
h5py-Lesung von `raa01-rw|sf_10000-latest-dwd---bin.hdf5`, `composite_rs_LATEST.tar`, `cpc2628113059_00060.001.h5`;
STAC-Item `…/items/20261008-ch`; `dataset.api.hub.geosphere.at/v1/grid/historical/inca-v1-1h-1km{,/metadata}`;
RV/RW-Vergleich über 12 `composite_rv_20261008_12{05…00}.tar` gegen `raa01-rw_10000-2610081300`. Rohdaten im Session-Scratchpad,
nicht im Repo.

## 9. Nachtrag 08.10. abends — zweiter Auftrag: „Erwartet" aus buscosun Fusion, UI-Vorgabe

> Der zweite Auftrag (Jan, 08.10.) ändert die Vorwärts-Seite: **am Ort** rechnet buscosun Fusion in der aktuellen Stufe das
> ganze Fenster (die ersten Stunden tragen dort schon das Radar-Stundenmittel, Fusion 8), **auf der Karte** kommt jenseits des
> Radar-Nowcasts das Fusion-Kartenfeld (NP-0b). Reiner Radar-Nowcast nur dort, wo Fusion nichts liefert, gekennzeichnet.
> Eine Spanne nur, wenn sie aus der Fusion-Verteilung ehrlich berechnet ist. Dazu eine feste UI-Vorgabe (Dock „Darstellung",
> Readout-Karte, Balkenstreifen). Die Empfehlung von E-NS-4 („Roh-Cube im Client") ist damit **überholt**. Weiter nur Diagnose.

### 9.1 Stand von buscosun Fusion

Auf `main` ist der Stand **buscosun Fusion 9** (`FUSION_CURRENT` in `fusionRelease.ts`: 7 Anker Wind, 8 Radar-Stundenmittel,
9 Anker am Messzeitpunkt; 10/11/12 liegen auf Kandidaten-Zweigen bzw. aus). Die Summen lesen den Namen aus dem Register bzw.
aus der Laufdatei des Datenprodukts (Regel FR), nie eine feste Nummer.

### 9.2 Erwartungssumme am Ort — was sich addieren lässt

Die Niederschlagsverteilung von buscosun Fusion ist **in jedem Schritt** `hurdleLogNormal` {pDry, μ, σ} (`fuse.ts:843`; die
Lernstufe `predictPrecip` und `precipCal` liefern dieselbe Familie). Ihr Mittel ist geschlossen: E = (1 − pDry)·e^(μ+σ²/2)
(`meanOf`, `dist.ts`), und `PointForecastV2` gibt es je Schritt als `mean` aus. **Mittelwerte addieren sich ohne jede Annahme
über die Abhängigkeit der Stunden** — die Erwartungssumme ist damit ehrlich.

Vier Regeln, die aus dem Code folgen:

| Regel | Grund (Beleg) |
|---|---|
| **Nur native Schritte summieren**, je Schritt `mean × Überlapp` mit dem Fenster | Der Wert eines Cube-Schritts ist die **mittlere Rate über (t − Δ, t]**, Δ = 1/3/6 h. Die Zwischenstunden der Stundenachse sind **linear zwischen zwei Raten-Mitteln interpoliert** (`cubeSource.ts` ≈ Z. 1724–1766, `interp.precipitation.mean = lerp`) — ihre Summe verschiebt Masse in die Nachbarstufe und zählt sie anteilig doppelt. Für Summen unbrauchbar |
| **Zerlegung ohne Überlapp** | Stunden, die die Station füllt (`tier: 'station'`, MOSMIX zwischen t2-Schritten), liegen **innerhalb** des Intervalls eines nativen Schritts. Je Zeitstück zählt genau eine Quelle: der native Schritt — oder, wenn für ein Intervall kein nativer Schritt da ist, die Stationsstunden. Nie beides |
| **Teilstück an den Rändern** | „jetzt" liegt selten auf der Stufengrenze: Anteil `(Ende − jetzt)/Δ` der Stufe, unter der Annahme gleichmäßiger Rate in der Stufe — im Kleingedruckten, wie §3 |
| **Herkunft je Zeitstück** | Nowcast-Stunden (`nowcastHourMean`, Vorlauf 1–2 h), `nowcastFallbackModel`, t1/t2-Naht, `climatologyOnly` werden je Stück mitgeführt; die Karte am Ort nennt „buscosun Fusion" und, wenn ein Stück nur Klimatologie ist, auch das |

Fenster bis 48 h ab jetzt: t1 reicht 48 h ab **Lauf-Init**, der Init liegt 2–5 h zurück ⇒ das Ende des 48-h-Fensters liegt
in t2 (Δ = 3 h). Die Naht N4 (§4) bleibt sichtbar.

### 9.3 Spanne der Fenstersumme — nur mit gemessener Abhängigkeit

Fusion liefert je Stunde eine **Randverteilung**, keine gemeinsame Verteilung über die Stunden. Die Spanne einer Summe hängt
vollständig von der Abhängigkeit zwischen den Stunden ab:

| Weg | Was er ist | ehrlich? |
|---|---|---|
| p10/p90 der Stunden addieren | genau die Quantile der Summe bei **vollständiger** Abhängigkeit (komonoton) — die breiteste übliche Annahme | nein, ungemessen |
| unabhängige Faltung | schmalste Annahme; Regenstunden hängen stark zusammen ⇒ systematisch zu schmal | nein |
| **gemessene Abhängigkeit** | Gauß-Kopula auf der Latenten der Hürde mit Korrelation ρ(Abstand, Vorlauf-Bin), **gefittet** an den Prüfstand-Replays (Fusion je Stunde) gegen die gemessenen Fenstersummen (W1, rr1h); Summe deterministisch per Quasi-Monte-Carlo (fester Sobol-Satz, ohne Zufall) → p10/p90; abgenommen an der Abdeckung der 80-%-Spanne und am CRPS der Fenstersumme je Fenster und Bin, Regel vorab eingefroren | **ja** — Ränder aus Fusion, Abhängigkeit gemessen |

⇒ **Bis zum dritten Weg zeigt die Karte am Ort nur den Erwartungswert** („etwa 3 mm"); die Spanne „(2–5 mm)" der Vorgabe
kommt erst mit dem Fit (E-NS-8). Kein Motor-Eingriff: die Kopula sitzt hinter `PointForecastV2`, ist aber eine neue gefittete
Größe von buscosun Fusion ⇒ STOPP-Regel, Jans Gate. Ob die Prüfstand-Replays die Hürden-Parameter je Stunde schon ablegen,
ist vor dem Bau zu prüfen.

### 9.4 Erwartungssumme auf der Karte — das Kartenfeld trägt kein Mittel

Gemessen am Feld `2026100812/t1` (raw.githubusercontent, 08.10. ≈ 16:55 UTC):

| | |
|---|---|
| Gitter | 241 × 201, 0,05° (≈ 5 km), 45,5–55,5° N / 5,5–17,5° E; t1 49 Vorläufe stündlich, t2 24 × 3 h, t3 36 × 6 h |
| Kanäle | R Chance · G Median \| nass · B q90 unbedingt, 8-Bit-Log-Code (x₀ 0,1, x_max 100 mm/h) — **kein Mittelwert** |
| Größe | 32–75 KB je Vorlauf ⇒ „nächste 48 h" aus Einzelfeldern ≈ 45 Dateien ≈ 2 MB im Client |
| Leser im Client | **keiner** — `fieldFormat.ts` benutzen nur der Producer und `verify:np0-fields` |

**Mittel zurückrechnen?** Bei der Hürde gilt Median|nass = e^μ und, wenn pDry < 0,9, q90 = e^(μ + σ·Φ⁻¹((0,9 − pDry)/(1 − pDry))) ⇒
σ und damit das Mittel sind bestimmbar. Gemessen an drei Vorläufen (Skript `recon.mjs` im Session-Scratchpad):

| Vorlauf | Zellen | σ bestimmbar | schlecht konditioniert (Chance ≈ 0,1) | Chance ≤ 0,1 (σ verloren) | σ p10/p50/p90 | Masse in Zellen ohne σ |
|---|---|---|---|---|---|---|
| +3 h | 48 441 | 25 547 (53 %) | 10 837 | 12 057 | 1,16 / 1,19 / 1,22 | 0,2–0,7 % |
| +12 h | 48 441 | 16 733 (35 %) | 0 | 31 708 | 1,24 / 1,27 / 1,31 | **6–16 %** |
| +30 h | 48 441 | 27 370 (57 %) | 50 | 21 021 | 1,27 / 1,30 / 1,34 | 3–8 % |

(„Masse ohne σ" = Beitrag dieser Zellen bei angenommenem σ 0,3 bzw. 1,5 gegen die Summe der rekonstruierten.) σ streut eng,
eine Annahme läge also meist nah — es bleibt aber eine Annahme an 43–65 % der Zellen, dazu 2,7 % Log-Code-Stufe je Wert.
⇒ **nicht ehrlich-exakt**. Sauberer Weg (E-NS-9): der Producer schreibt neben das Feld eine **kumulierte Erwartung**
`precipcum-<LLL>.png` (Σ meanOf × Δ ab Lauf-Init, 16 bit in 0,01 mm, R·256 + G, A wie bisher) aus denselben Verteilungen.
Eine Fenstersumme ist dann **C(Ende) − C(Anfang)** = zwei Dateien statt 45 (Teilstunden an den Rändern linear in der Stufe).
Kosten im Punkt-Cron: eine Addition je Zelle und Vorlauf (die Verteilung liegt schon vor), Ablage ≈ eine Datei mehr je Vorlauf.

**Etikett:** Das Feld rechnet buscosun Fusion mit dem **Cube als einziger Quelle** (kein Radar, keine Station, kein Gelände
am Ort) und trägt nach E-FR-1 das Etikett „Modell · Cube" plus den Stand im Manifest. Die Vorgabe „buscosun Fusion · Lauf 12
UTC" ist mit „buscosun Fusion ‹n› · Modell · Cube · Lauf 12 UTC" vereinbar, nicht mit dem Weglassen von „Modell · Cube" (E-NS-10).

**Naht auf der Karte:** 0–2 h aus dem Nowcast des Landes (DE RV-Frames, u8 ⇒ Totzone und Sättigung, §3; die Zahl gesättigter
Frames je Pixel trägt „mindestens"), ab 2 h aus `precipcum`. Fusion liefert am Ort auch für 0–2 h, auf der Karte aber nur
ohne Radar — deshalb dort der Nowcast zuerst, wie die Vorgabe es sagt. „Nur Radar, Fusion fehlt" gilt für Zellen mit A = 0 und
außerhalb des Feldgitters. Legende: „0–2 h Radar · danach buscosun Fusion ‹n› (Modell · Cube) · Lauf HH UTC". Welche
Nowcast-Frames AT/CH auf der Karte tragen (INCA-/rzc-Spiegel), ist beim Plan an `radarProfileComposite` festzumachen.

### 9.5 Gefallen — neue Daten nötig?

| Ebene | ohne neues Datenprodukt | mit Datenprodukt |
|---|---|---|
| **Karte** DE | RW/SF direkt über `/_dwd_opendata` (HDF5 30–732 KB, 1100 × 1200) — 6/12 h brauchen 6/12 RW-Dateien ⇒ zu schwer für Mobil | Spiegel-Haken §5 (E-NS-1): fertige Summenbilder je Fenster |
| **Karte** CH / AT | nicht sinnvoll (CPC 624 KB/h, INCA 878 KB/h, Rate-Limit) ⇒ **Lücke, grau schraffiert** | CPC / INCA-Analyse im Haken (E-NS-2) |
| **Ort** DACH | `obs/v1` (Phase OB, schon im Daten-Repo): 10-min-Reihen über **26 h** — DWD 10 min (1 372 Niederschlagsdateien), **TAWES (AT, 289 Stationen)**, SMN + SMN-precip — gemessene Summen 1–24 h an der nächsten Station, **mit Abstand genannt** (Station ≠ Ort) | 48 h nur aus RW/SF/CPC/INCA (Spiegel) |

„Mindestens" bei Starkregen betrifft nur die u8-Radarstücke (Randstück RV, Nowcast); RW/SF/CPC/INCA sind mit Regenmessern
korrigiert und nicht bei 20 mm/h geklippt. **Neue Daten im Daten-Repo sind nötig** für die Karte „Gefallen" (Spiegel-Haken,
Kern-Eingriff) und für die Karte „Erwartet" jenseits 2 h (`precipcum` im Punkt-Cron). Ohne beides geht nur die Karte am Ort.
Damit ist auch Österreich am Ort **keine** Lücke (TAWES), auf der Karte bis zu E-NS-2 schon.

### 9.6 UI — Ist gegen Vorgabe

| Vorgabe | Ist im Code |
|---|---|
| Dock „Darstellung" mit Intensität \| Summe | Das Dock (`NowcastDeck.tsx`, `Dock`) hat **Radar-Layer · Ansicht · Modus · Datenlage**, keinen Abschnitt „Darstellung". Der alte „Darstellung"-Kasten mit Summen-Fenster lebt nur auf `?rr=legacy` (`NowcastRadarMap.tsx` ≈ Z. 562, E-RR-3) ⇒ neuer Abschnitt im Dock, Segment-Leisten im vorhandenen `rr-seg`-Muster |
| ruhige Palette hell → blau → violett | `accumRamp` (`accumulation.ts`) ist genau das und bisher nur am Alt-Weg — wiederverwendbar über `RainLayer.setColorRamp` (kein Shader) |
| Legende unten mit mm-Stufen, Quelle, Alter | `nc-radar-legend` existiert; im Profil heute nur die Intensitäts-Legende |
| grau schraffiert ohne Daten | neu (Musterfläche als eigene Ebene — **zu prüfen**, ob ohne Shader-Eingriff möglich, sonst STOPP) |
| Readout-Karte, mobil Reiter „Jetzt" | Die Mobil-Reiter heißen **Schnellblick · Zeitachse · Diagramm · Layer · Detail** — es gibt keinen Reiter „Jetzt"; der nächste ist „Schnellblick" (`glance`) ⇒ E-NS-11 |
| Balkenstreifen mit „Jetzt"-Linie | neu; `NowcastBarChart` ist ein Vorbild im Command-Deck-Stil |

### 9.7 Befund: die bestehende „Summe 6 h · Band" addiert Stunden-Bänder

**V-NS-7** Das Readout zeigt heute „Summe 6 h … Band a – b" (`NowcastDeck.tsx:404`, `:791`). Das Band entsteht aus
**gesetzten** Schrittbändern `mmH·(1 ± (0,22 + 0,95·(1 − conf)))` (`nowcastEngine.ts:120–123`), die über alle Schritte
**addiert** werden (`:203–204`) — genau das komonotone Addieren, das der Auftrag verbietet, dazu ohne Kennzeichnung als
`set`. Mehrwert der Behebung: eine Zahl weniger, die Genauigkeit vortäuscht. Skizze: das Band durch die Erwartungssumme aus
§9.2 ersetzen bzw. weglassen, bis E-NS-8 gemessen ist — **Entfernen einer sichtbaren Angabe = Jans Freigabe** (E-NS-12).

### 9.8 Entscheidungen (ergänzt; E-NS-4 überholt)

| # | Frage | Empfehlung |
|---|---|---|
| **E-NS-7** | Reihenfolge: **Stufe A** ohne neue Daten (Karte am Ort: Gefallen aus `obs/v1`-Stationen bis 24 h + Erwartet als Fusion-Erwartungssumme; Kartenansicht „Summe" mit Erwartet 0–2 h Nowcast, sonst benannte Lücke) vor **Stufe B** (Datenprodukte E-NS-1/2/9, dann die volle Karte)? | ja, A zuerst — zeigt die Ehrlichkeitsregeln am Ort ohne Daten-Repo-Eingriff |
| **E-NS-8** | Spanne der Fenstersumme: Kopula-Fit (§9.3) am Prüfstand bauen und vorab-geregelt abnehmen, bis dahin nur der Erwartungswert? | ja |
| **E-NS-9** | Neues Feldprodukt `precipcum-<LLL>.png` (kumulierte Erwartung) im Punkt-Cron, oder Mittel im Client aus Chance/Median/q90 rekonstruieren (σ-Annahme an 43–65 % der Zellen, gekennzeichnet)? | Producer-Produkt; Rekonstruktion nur als benannter Notweg |
| **E-NS-10** | Legende der Karte: „buscosun Fusion ‹n› · Modell · Cube · Lauf 12 UTC" (Etikett nach E-FR-1 behalten) statt nur „buscosun Fusion · Lauf 12 UTC"? | Etikett behalten |
| **E-NS-11** | Mobil: Karte am Ort in „Schnellblick" (es gibt keinen Reiter „Jetzt"), oder einen Reiter umbenennen? | in „Schnellblick", nichts umbenennen |
| **E-NS-12** | V-NS-7: das gesetzte Band der bestehenden „Summe 6 h" ersetzen/entfernen? | ersetzen durch die Erwartungssumme, Band erst mit E-NS-8 |

E-NS-1/2/3/5/6 gelten unverändert (§6). Gebaut wird erst nach den Entscheidungen, additiv hinter einem Schalter mit benanntem
Rückfall (Regel 2), kein Motor-, Shader- oder Daten-Repo-Eingriff ohne Jans Gate.

## 10. Umsetzung 08.10. — Stufe A und B1 (Jan: „setze es nach deinen Empfehlungen um")

**Entschieden (Jan 08.10., jeweils die Empfehlung aus §6/§9.8):** E-NS-7 Stufe A zuerst, danach B · E-NS-8 Spanne der
Fenstersumme erst nach gemessener Abhängigkeit · E-NS-9 Producer-Produkt `precipcum` · E-NS-10 Etikett „Modell · Cube"
bleibt · E-NS-11 mobil in „Schnellblick" · E-NS-12 gesetztes Band ersetzt · E-NS-3 Randstück „Stand" (Fenster endet an der
jüngsten Messung), Nowcast-Summe aus den vorhandenen Frames mit „mindestens" · E-NS-5 keine Teilsumme in der Karte, im
Readout benannt · E-NS-6 nur „bis jetzt"/„ab jetzt". **E-NS-1/2 (Spiegel-Haken RW/SF/CPC, INCA-Analyse) = Stufe B2/B3:
NICHT gebaut** (s. §10.6).

### 10.1 Was gebaut ist

| Teil | Dateien | Inhalt |
|---|---|---|
| Rechenkerne (rein) | `src/precipSums/sumModel.ts`, `fusionWindowSum.ts`, `obsWindowSum.ts`, `radarWindowSum.ts`, `fieldCum.ts`, `sumGrid.ts` | Fenster/Palette/Zahlen; Erwartungssumme aus buscosun Fusion nach §9.2 (nur native Schritte, Zerlegung ohne Überlapp, Teilstücke, Lücke ≠ 0; Balken-Spanne NUR innerhalb eines Schritts); Stationssummen aus `obs/v1`; Radar-Nowcast-Summe (Rechteckregel, Sättigung gezählt, Lücke in den Frames beendet die Summe); Leser der kumulierten Erwartung; Zusammensetzung auf dem DACH-Gitter `G` mit der Länderregel `countryRowPicker` und Bild in Mercator-Zeilen |
| Netz | `obsSumStore.ts` | `obs/v1` (Katalog, latest, Reihen) und Kartenfelder: raw zuerst, jsDelivr nach 2,5 s (V-FI-5), Frist 10 s, Gedächtnis |
| Karte | `sumMapEngine.ts` (eigener Lazy-Chunk), `sumMapLayer.ts`, `useSumMap.ts`, `sumMapTypes.ts` | MapLibre `image`-Source + `circle`-Ebene (kein Shader), Index-Maps im Worker der Niederschlagskarte, Hover-Text |
| Ort | `usePointSums.ts` | Gefallen = nächste Station ≤ 10 km (set), Erwartet = `getPointForecast({ pointSource: 'cube', hours: Fenster + 2 })` → `PointForecastV2` → `fusionWindowSum`; Rückfall „nur Radar-Nowcast" (gekennzeichnet) nur, wenn buscosun Fusion nicht antwortet oder `?pf=live` |
| Oberfläche | `PrecipSumsUi.tsx`, `precipSums.css`; `NowcastDeck.tsx`, `NowcastRadarMap.tsx` (additiv) | Dock „Darstellung" (Intensität \| Summe; darunter Richtung und Fenster), Legende (mm-Stufen, Quelle + Stand, Naht je Radar-Quelle, Lücke schraffiert, „mindestens" gepunktet), Karte am Ort (Readout; mobil im Schnellblick) mit Balkenstreifen und Jetzt-Linie; „Summe 6 h" ohne gesetztes Band (E-NS-12) |
| Producer (B1) | `scripts/point/build-point-fields.mjs`, `src/point/fieldFormat.ts` | `precipcum-<LLL>.png` je Vorlauf: C(L) = Σ meanOf(Hürde)·stepH, 24 bit in 0,01 mm, A 0 = fehlt und bleibt für alle späteren Vorläufe 0; Manifest `leads[].precipcum`, `encoding.precipcum/cumUnitMm`, `stats.cumBroken`; Schalter `POINT_FIELD_CUM=0` |
| Prüfung | `scripts/verify-precip-sums.mjs` (`verify:precip-sums`, in CI), Fixture `scripts/lib/fixtures/precip-sums-obs.json` (Auszug `obs/v1` 08.10., unverändert) | A–G, s. §10.3 |

**Rückfall (Regel 2):** `?sum=0` = Stand vor der Phase (kein Dock-Abschnitt, keine Karte am Ort, „Summe 6 h · Band a – b"
wie zuvor), im Browser geprüft. Ohne Summen-Ansicht lädt das Regenradar den Karten-Rechenteil nicht.

### 10.2 Messungen

- **Producer an echten Läufen** (lokaler Klon `C:\dev\buscosun-data`, Läufe 2026093012 t2 / 2026093018 t1, Ausgabe im
  Scratchpad): t2 24 Bilder, Mittel 10,2 KB (max 14,8); t1 49 Bilder, Mittel 36,8 KB (max 55,2) ⇒ **+1,8 MB je t1-Lauf** im
  Daten-Repo (bei drei vorgehaltenen t1-Läufen ≈ +5,4 MB). t1-Bau 83 s, t2 13,9 s mit 4 Workern; der Zusatz ist eine Addition
  je Zelle und Vorlauf. 0 Zellen mit fehlender Stufe.
- **Unabhängiger Weg** (F3): ΔC je Vorlauf gegen das Mittel der Hürde, zurückgerechnet aus Chance / Median | nass / q90 des
  Niederschlagsbilds, wo σ bestimmbar ist: t2 **1 278 / 1 278**, t1 **62 528 / 62 567 (99,9 %)** innerhalb 12 %
  (Log-Stufen); Negativkontrolle gegen den vorigen Vorlauf trennt (t1 41 523 / 62 567 abweichend).
- **Stationssummen** gegen `rrSum` des Spiegels auf denselben Reihen: 1–12 h 88/88, 24 h 16/16.
- **Live 08.10. ≈ 15:30–16:10 UTC, München:** Gefallen 6 h 4,3 mm (München-Stadt, 3,8 km, Stand 16:50 MESZ), Erwartet 6 h
  „etwa 1,5 mm" (buscosun Fusion 9, bis 2 h mit Radar) — die bestehende Kennzahl „Summe 6 h" (Radar + Modell im 15-min-Raster)
  zeigte 1,2–1,4 mm; Karte „Gefallen 6 h" 1 816 Stationen; „Erwartet 1 h" Radar-Fläche DE + AT mit „mindestens"-Zellen;
  „Erwartet 6 h" = benannte Lücke, weil die Felder im Daten-Repo noch ohne `precipcum` gebaut sind (Legende: „t1 2026100812:
  Feld ohne kumulierte Erwartung (vor Phase NS gebaut)").
- **Budget** (Kontrollbau HEAD e2d875c gegen HEAD + nur diese Phase): totalJs 1 599,3 → 1 615,9 KB (+16,6, alles lazy;
  NowcastRoute +8,8, neuer Chunk `sumMapEngine` 7,1 nur in „Summe", `browserPng` 5,2 gegen `cubeSource` −4,7); eagerJs 109,3
  unverändert. Grenze totalJs 1 600 → **1 617** mit Notiz. Der gemeinsame Arbeitsbaum steht bei 1 626,6 — die weiteren +10,7 KB
  stammen aus der parallelen Sitzung Radar-Hochauflösung (`audit/radar-hochaufloesung.md`) und sind dort zu begründen.

### 10.3 Gates (Belege)

| Gate | Ergebnis |
|---|---|
| `verify:precip-sums --fields=<Producer-Ausgabe>` | **53/53** (A Modell 5, B Erwartungssumme 11, C Stationen 7, D Radar 5, E Feld + Karte 12, F Producer 8, G Verdrahtung 5); ohne `--fields` 45/45 + 1 ⊘ (CI-Fassung) |
| `verify:np0-fields --data=C:/dev/buscosun-data` | **29/29** (Konsistenz Feld = Kette, Teilmenge exakt, Cube byte-gleich, Publisher, Aufbewahrung — mit der Erweiterung um `mean`) |
| `verify:fusion-release` | 28/28 |
| `verify:regenradar-profile` | 33/36 — **E7** (Phasenwache der RR-Linie: kein Diff unter `src/point`) schlägt wegen der additiven Erweiterung von `src/point/fieldFormat.ts` an (wird mit dem Commit grün, wie bei FR §8.12); **E8** (Diff an `RainLayer.ts`) und **C1b** stammen aus der parallelen Radar-HD-Sitzung, nicht aus Phase NS |
| `verify:point-client` | 170/171 — (10s) zeitabhängig, fällt auch an HEAD (V-EX-13) |
| typecheck, Build | 0 Fehler; Build 255/255 |
| Budget | eagerJs 109,3 ✓; totalJs s. §10.2 |
| Browser (Dev-Server, Playwright, 1440×900 und 390×844) | Dock „Darstellung" mit beiden Leisten; Karte am Ort mit echten Werten; Hover „etwa 0,3 mm · Radar-Nowcast"; Gefallen-Punkte; Legende mobil über der Leiste „Punktabfrage"; `?sum=0` ohne jedes Element der Phase; Konsole: nur 403/404 der bestehenden Radar-Lader am CDN (V-FI-5), keine neue Meldung |

**Selbstprüfung:** (1) Funktionserhalt — keine Funktion entfernt; einzige sichtbare Änderung an Bestehendem ist der Untertitel
von „Summe 6 h" (E-NS-12, mit `?sum=0` wie zuvor). (2) Desktop ohne Summen-Ansicht: Karte, Ebenen, Legende unverändert; neu
sind der Dock-Abschnitt und die Karte am Ort (gewollt). (3) Touch-Ziele mobil ≥ 44 px (`min-height: 44px` der Leisten, G4).
(4) Konsole sauber bis auf die bekannten CDN-Antworten. (5) Long Tasks: die Zellschleife der Karte rechnet je Zeitpunkt einmal
vor (`prepareCumAt`), je Zelle nur Bytes; gemessen nicht in headless-shell (dort nicht messbar) — **Real-Device offen**.

### 10.4 Befunde

- **V-NS-8** `obs/v1` `latest.json`: `rr1h`/`rr24h` enden am jüngsten Stempel IRGENDEINER Größe der Station. DWD liefert den
  Niederschlag (:10/:40) nach Wind/Temperatur ⇒ die Summe ist dann „unvollständig" (Fixture: 6 Stationen). Mehrwert: richtige
  Stundensummen für jeden Leser. Skizze: im Spiegel das Ende je Größe wählen (`rrSum` mit dem jüngsten `rr`-Stempel). Phase NS
  umgeht es, indem sie immer aus den Reihen summiert.
- **V-NS-9** Die Reihen `obs/v1/series/*.json` sind spaltenweise je Netz (dwd10 534 KB gz) — für EINE Station am Ort lädt der
  Client die ganze Netzdatei. Mehrwert: Karte am Ort ≈ 0,5 MB leichter. Skizze: Summen-Datei je Fenster (`obs/v1/sums.json`,
  1/3/6/12/24 h je Station, ≈ 50 KB gz) im Spiegel.
- **V-NS-10** INCA-Stack ohne Lauf (`radarFrames.ts` loadAt setzt die Zeitachse ab dem Abruf) — die Legende nennt für INCA
  deshalb keinen Stand. Skizze: Laufzeit aus der INCA-Meta lesen.
- **V-NS-11** Die Summen-Karte braucht im Dev-Server bis zu ≈ 40 s bis zum ersten Bild (kalte Radar-Stacks DE + AT dekodieren,
  Index-Maps im Worker). Messung am Produktionsbau steht aus. Skizze: Stacks der Karte wiederverwenden statt neu laden.

### 10.5 Was mit Jans Push wirksam wird

Der Punkt-Cron klont `main`: erst mit dem Push baut der Feldschritt `precipcum` (t1 +1,8 MB je Lauf). Dann zeigt „Erwartet"
auf der Karte jenseits des Radars die Felder (0–2 h Radar · danach buscosun Fusion ‹n› · Modell · Cube · Lauf HH UTC).
`verify-precip-sums.mjs --live` prüft danach, ob das jüngste t1-Feld `precipcum` trägt.

### 10.6 Nicht gebaut (Stufe B2/B3) — nachgeholt in §11

Spiegel-Haken für die amtlichen Summen (RW, SF, CombiPrecip; INCA-Analyse für AT) mit Summenbildern je Fenster
`radar/img/v1/sum/…` — Eingriff in den Spiegel-Kern (Aufbewahrung, mit der Autobahnwetter-Linie geteilt), eigener Schritt.
Bis dahin zeigt „Gefallen" auf der Karte die Stationen als Punkte und die Fläche als benannte Lücke. **Gebaut am selben Abend
als eigener Workflow (§11).**

## 11. Umsetzung 08.10. spät — Stufe B2/B3: gemessene Flächensummen (Jan: „ja bau es")

> E-NS-1 (amtliche Summen, DE + CH) und E-NS-2 (INCA-Analyse AT) nach Empfehlung, mit einer Abweichung im Weg: **eigener
> Workflow statt Haken im Radar-Spiegel.** Der Spiegel-Kern veröffentlicht `radar/img/v1` als Ganzes und wird von der
> Radar-HD- und der Autobahnwetter-Linie mitbenutzt; ein eigener Pfad `precipsum/v1/` mit eigenem Workflow (Muster
> Seewetter, `sea.yml`) braucht keinen Kern-Eingriff und keine Retention-Tabelle dort. Kein Push, keine Kopie ins
> Daten-Repo (Jans Gate §49.2).

### 11.1 Messungen vor dem Bau (08.10. 19–20 UTC, Rohdaten im Session-Scratchpad)

| Frage | Messung | Folge |
|---|---|---|
| INCA-Analyse: Stempel = Anfang oder Ende? Skala? | `RR` int32, jsfive liest keine Attribute. Gegen **269 TAWES-Stationen** (nächste Zelle ≤ 0,8 km, Stunden 14–19 UTC): Fensterende **r 0,93**, Fensteranfang r 0,27; Mittel INCA/Station 934 ⇒ **0,001 mm**; 90 % der Stunden ±0,05 mm | Stempel = Ende, `INCA_RR_SCALE` 0,001 |
| INCA `time` | 2075482800 ⇔ 08.10. 19:00 UTC ⇒ **Sekunden seit 1961-01-01** (erst falsch als 1979 gelesen: Jahr 2044 — die Prüfung „keine angefragte Stunde in der Antwort" fing es) | `INCA_EPOCH_MS`, Verifier H8 |
| INCA-Abruf 48 h | HTTP 400 „limit is 10000000 data points, you requested 15279600"; eine Stunde = 281 101 Punkte ⇒ ≤ 35 h | Blöcke ≤ 24 h (`incaBlocks`, H7) |
| RW gegen DWD-Stationen | 5 Stunden, 6 718 Paare: Ende **r 0,83**, Anfang r 0,36; Mittel RW 0,59 / Station 0,73 mm | Stempel = Ende, Georeferenz `radolan` + `DE1200_CORNERS` stimmt |
| CombiPrecip gegen SMN | 1 399 Paare: Ende **r 0,95**, Anfang r 0,56 | Stempel = Ende; Asset-Name trägt eine Qualitätsziffer ⇒ Namen aus dem STAC-Item |
| CombiPrecip-Produkte | im Tages-Item nur `_00060` (241 Assets, 5-min-Takt) | stündliche Kette auch für 24/48 h |

Die Regenmesser stecken teils in den Eichungen (RW/SF/CPC/INCA) — die Korrelationen belegen Lage und Zeitbezug, keine
unabhängige Güte.

### 11.2 Produkt `precipsum/v1/`

Vertrag `src/precipSums/pastSumFormat.ts`. Ein Lauf = ein Ende E (volle UTC-Stunde), sechs Bilder `sum-<WWW>h.png` auf dem
DACH-Gitter G (600 × 512, wie die Summen-Karte), Kodierung wie `precipcum` (0,01 mm, 24 bit) mit **drei Zuständen** über den
Alphakanal: 255 Wert, 0 Lücke (schraffiert), 128 außerhalb DE · AT · CH (durchsichtig). Ordnername `<E>-<länder>[-rw]` —
derselbe Name trägt immer denselben Inhalt (CDN-tauglich); `latest.json` ist mutabel und wird raw zuerst gelesen.

| Regel | Umsetzung |
|---|---|
| Quelle je Land | Länderregel der Karte (`sumGeometry`/`countryRowPicker`): DE RW, AT INCA, CH CombiPrecip |
| nur DACH | Maske aus `public/countries/{DE,AT,CH}.geojson` (E-NS-14). Vorher lagen die Maxima in Norditalien (CombiPrecip, 1 h 32,6 mm) und Slowenien (INCA, 24 h 192 mm) — dort ist keine Quelle mit Regenmessern ihres Landes angeeicht |
| fehlend ≠ 0 | eine fehlende Stunde / `nodata` / NaN ⇒ Lücke der Zelle im Fenster (`windowSumOnGrid`, H1) |
| Wartestufe | fehlt an der jüngsten RW-Stunde ein Land (INCA + 35 min) und ist die Vorstunde vollständig, bleibt der Lauf bis 75 min nach E bei E − 1 h — sonst stünde jede Stunde ein Land 10–30 min als Lücke (H6) |
| DE 24/48 h | **SF** statt RW-Kette (E-NS-13, §11.3), Ende E − 10 min, in Manifest und Legende benannt; fehlt SF ⇒ RW-Kette, Ordner `-rw` (H5b) |
| Rückblick | Fenster enden an E, kein Randstück aus der RV-Analyse (E-NS-3 „Stand") |
| Cache | Stundenfelder auf G gz (≈ 6 MB), `actions/cache`; ohne Cache alles neu — das Ergebnis hängt nicht daran |

Lokal gegen die echten Quellen (08.10., E = 19 bzw. 20 UTC): erster Lauf ohne Cache 31 s (48 RW, 48 CPC, INCA in 2 Blöcken),
danach 2,6–12,5 s; Bilder 91–354 KB, ≈ 1,5 MB je Lauf; Lücken in DACH 199–575 Zellen von ≈ 162 000 (0,1–0,4 %); 24 h
Maximum in DACH 61 mm (Tessin).

### 11.3 E-NS-13: DE 24/48 h aus SF — gemessen

An der Station München-Stadt zeigte die RW-Kette für 12 h 1,9 mm gegen 4,83 mm im Regenmesser. Über alle DWD-Stationen mit
vollständiger Reihe (1 251, 24 h bis 19:00 bzw. 18:50 UTC):

| Produkt | Mittel / Regenmesser | r | MAE |
|---|---|---|---|
| SF (18:50) | 8,92 / 9,60 mm | **0,94** | **1,35 mm** |
| RW-Kette (19:00) | 8,77 / 9,60 mm | 0,84 | 2,15 mm |

SF ist die von DWD täglich mit mehr Regenmessern angeeichte Summe; beide sind nicht unabhängig von diesen Stationen (SF
hat dort den größeren Heimvorteil). Folge: DE 24 h = SF(E − 10 min), 48 h = SF(E − 10 min) + SF(E − 10 min − 24 h) (nicht
überlappend, DWD hält SF 48 h); 1–12 h bleiben die RW-Kette. München 48 h danach 5,9 mm (vorher RW-Kette 2,5 mm) bei 4,8 mm
der Station in 24 h.

### 11.4 Client

`sumMapEngine.ts` liest `latest.json` + das Bild des Fensters (gedächtnisgestützt, zwei dekodierte Bilder), `pastSumGridFromRgba`
(`sumGrid.ts`) macht daraus das Gitter: Wert = `FLAG_MEASURED`, Lücke = NaN (schraffiert), außerhalb = `FLAG_OUTSIDE` (nicht
gezeichnet). Legende: „Fläche bis ‹E›: Radar mit Regenmessern angeeicht · DE DWD RADOLAN RW|SF [bis ‹E − 10 min›] · AT GeoSphere
Austria INCA-Analyse · CH MeteoSchweiz CombiPrecip", je fehlendem Land „‹CC› Lücke: ‹Grund›", „nur DE · AT · CH"; ab 3 h Alter
„(veraltet)". Stationen bleiben als Punkte darüber. Karte am Ort: trägt keine Station (keine ≤ 10 km, Fenster > 24 h,
unvollständig), steht der Flächenwert der Zelle mit „Radar angeeicht · ‹Anbieter› ‹Produkt› · Stand ‹Zeit›" — nie als
Stationswert. Hover: „‹x› mm gemessen · Radar angeeicht".

Browser (Dev-Server, Daten-Repo-Pfad `precipsum/v1/**` per Playwright-Route auf den lokal erzeugten Speicher umgeleitet, weil
das Produkt erst nach Jans Kopie entsteht): München 24 h Fläche + 1 690 Stationen, Grenze DACH sauber (Bild
`.playwright-mcp/ns-b2-desktop-past24-dach.png`), 48 h Karte am Ort „5,9 mm · Radar angeeicht · DWD RADOLAN SF · Stand 21:50",
mobil Legende vollständig (`ns-b2-mobile-48.png`). Konsole: nur die bekannten 404 der Radar-Slot-Sonden.

### 11.5 Gates

`verify:precip-sums` **56/56** (CI-Form; mit `--raw` **61/61**: H10a–e an echten RW/SF/CombiPrecip/INCA-Dateien), Block H:
Fenstersumme, Kodierung + Zustände, Client-Leser, DACH-Maske (7 Orte innen, 11 außen), Lauf je Land, SF-Weg + Rückfall,
Wartestufe, INCA-Blöcke, Zeit/Namen, Speicher (älterer Lauf schreibt nichts — ein Fehler, den H9 fand: der Ordner eines
älteren Laufs wurde vor der Prüfung angelegt). `verify:fusion-release` 28/28, typecheck 0, Build 255/255, Budget grün:
totalJs 1 634,4 / **1 635** (+2,0 KB, Notiz), eagerJs 109,3 / 109,4. `verify:np0-fields` 23/24 — Block B (Punkt-Publisher
gegen den lokalen Klon `C:\dev\buscosun-data`, dort am 08.10. 22:32 neu bestückt) scheitert an fehlenden Chunk-Dateien des
Klons; diese Stufe berührt weder Publisher noch Feld-Producer.

### 11.6 Befunde

- **V-NS-12** Die INCA-Analyse deckt Slowenien/Norditalien ab, CombiPrecip die Lombardei — ohne Maske hätte die Karte dort
  „angeeicht" behauptet. Mehrwert: ehrliche Grenze. Erledigt (E-NS-14).
- **V-NS-13** RW unterschätzt im Mittel (0,59 gegen 0,73 mm je Stunde an DWD-Stationen) — 1–12 h bleiben RW. Skizze: an
  mehreren Regentagen RW-Kette gegen Regenmesser je Fenster messen; ggf. 12 h aus SF-Differenzen nicht möglich (SF nur 24 h).
- **V-NS-14** Zellwert = nächstes Quellpixel (wie die Niederschlagskarte), keine Flächenmittelung auf 2 km. Skizze: Mittel
  der Quellpixel je Zelle im Producer (Kosten einmal je Stunde).
- **V-NS-15** `docs/API.md` §5.2 (CombiPrecip 10 min) — weiter offen (V-NS-4).
- **V-NS-16** `actions/cache` legt je Lauf einen Eintrag (≈ 6 MB, 48/Tag) an; GitHub räumt nach Alter/10 GB. Skizze: fester
  Schlüssel je Tag, falls das Daten-Repo andere Caches bekommt.

Offen bleiben E-NS-8 (Spanne der Fenstersumme) und V-NS-8…11.
