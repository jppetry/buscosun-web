# Seewetter – Datenprüfung DWD `weather/maritime` (Phase SW)

> Stand 07.10.2026. Rohbefunde der Quellenanalyse für das Konzept „Seewetter – Feature-Konzept buscosun“ (claude.ai Doc) und den Plan `audit/seewetter-plan.md`.
> **Methode:** Inventar `content.log.bz2` aus `weather/maritime/` (11.386 Dateien, 48-h-Fenster) im Browser entpackt; GRIB2-Felder des Laufs 07.10.2026 00 UTC aller drei Wellenmodelle im Browser selbst dekodiert; Textprodukte am 07.10. geladen und byte-genau als Fixtures abgelegt (`audit/seewetter/fixtures/`).
> **Grenzen:** Aus der Cloud-Umgebung waren `dwd.de` und `maps.dwd.de` per robots.txt bzw. Proxy gesperrt (nicht umgangen). Alles, was dort steht (CAP-Profil, Seegebietsgrenzen, BSH-Merkblatt), ist offen und gehört in SW-0. Alle Zahlen sind eine Momentaufnahme; SW-0 misst nach.

## 1. Verzeichnis

| Pfad | Inhalt |
| --- | --- |
| `weather/maritime/content.log.bz2` | Inventar aller Dateien mit Zeitstempel und Größe. **Maßgeblich**; Verzeichnislisten hingen bei GWAM tagelang nach (Liste zeigte den 02.10. als neuesten Lauf, das Inventar den 07.10.) |
| `weather/maritime/wave_models/{cwam,ewam,gwam}/grib/{00,12}/<param>/` | ein GRIB2-Feld je Datei, einzeln bz2-gepackt, Dateiname nach dem Muster `<MODELL>_<PARAM>_<YYYYMMDDHH>_<SSS>.grib2.bz2` (`SSS` = Vorlaufstunde) |
| `weather/maritime/forecast/german/` | Textprodukte `<PROD>_EDZW_<DDHHMM>` plus je Produkt `<PROD>_EDZW_LATEST`; rund 17 Ausgaben je Produkt im Fenster |
| `weather/maritime/forecast/english/` | FQEN70/71, FQMM80, WODL45 (englisch, nicht nötig) |

Die vier im 48-h-Fenster geprüften Läufe waren **vollständig**: CWAM und EWAM je 1.027 Dateien (13 Größen × 79 Schritte), GWAM 767 (13 × 59).

## 2. Die drei Wellenmodelle

| | CWAM | EWAM | GWAM |
| --- | --- | --- | --- |
| Gebiet | Deutsche Bucht und westliche Ostsee, 53,23–56,45° N, 6,17–14,91° E | Europa, 30–66° N, 10,5° W–42° E, inkl. Mittelmeer, Schwarzes Meer, IJsselmeer | global |
| Gitter | 630 × 387, Di 0,013889°, Dj 0,008333° (≈ 900 m) | 526 × 721, 0,1° × 0,05° (≈ 7 × 5,5 km) | 1440 × 699, 0,25° |
| Erster Gitterpunkt | La1 56,445835° N, Lo1 6,173611° E, Abtastung Nord → Süd | Nord → Süd | Nord → Süd |
| Seepunkte | 124.011 | 138.388 | ≈ 686.000 |
| Läufe, Vorlauf | 00 und 12 UTC, 0–78 h stündlich | 00 und 12 UTC, 0–78 h stündlich | 00 und 12 UTC, 0–174 h dreistündlich |
| Dateien je Lauf | 1.027 | 1.027 | 767 |
| Volumen je Lauf (bz2) | ≈ 95 MB (30–85 KB je Datei) | ≈ 143 MB | ≈ 445 MB |
| Erste Datei nach Laufbeginn | + 3:31 bis + 4:07 h | + 3:16 bis + 3:53 h | + 3:38 bis + 4:11 h |

**Folge für „Jetzt“:** Der jüngste Lauf ist beim Erscheinen 3–4 h alt; „Jetzt“ ist also Vorlaufstunde 4 bis 16.

## 3. Die 13 Größen je Modell

Wertebereich am Beispiel CWAM, + 24 h des Laufs 07.10. 00 UTC.

| Ordner | Größe | GRIB2 (Disziplin/Kat./Nr.) | Bereich | Einsatz |
| --- | --- | --- | --- | --- |
| `swh` | signifikante Wellenhöhe gesamt | 10/0/3 | 0–3,11 m | Hauptfeld |
| `mwd` | mittlere Wellenrichtung | 10/0/14 | 0–360° | Pfeile |
| `tm10` | mittlere Periode Tm−1,0 | 10/0/15 | 1,0–7,8 s | Periode |
| `shww` | Höhe Windsee | 10/0/5 | 0–3,10 m | Ebene, Verlauf |
| `mdww` | Richtung Windsee | 10/0/4 | 0–360° | Readout |
| `mpww` | mittlere Periode Windsee | 10/0/6 | 1,0–6,4 s | Steilheit |
| `ppww` | Spitzenperiode Windsee | 10/0/35 | 1,0–21,8 s | nur gefiltert |
| `shts` | Höhe Dünung | 10/0/8 | 0–1,34 m | Ebene, Verlauf |
| `mdts` | Richtung Dünung | 10/0/7 | 0–360° | Readout |
| `mpts` | mittlere Periode Dünung | 10/0/9 | 1,0–10,2 s | Readout |
| `ppts` | Spitzenperiode Dünung | 10/0/36 | 1,0–11,2 s | Readout |
| `sp_10m` | Windgeschwindigkeit 10 m (Antrieb) | 0/2/1 | 2,00–17,8 m/s | **nie anzeigen** |
| `dd_10m` | Windrichtung 10 m | 0/2/0 | 0–360° | nur Prüfung |

**Kodierung:** GRIB2, regelmäßiges Lat/Lon-Gitter, einfache Packung (Data Representation Template 5.0) mit 8–16 bit, Dezimalskala D = 2, Landmaske als Bitmap (Sektion 6). Der vorhandene Decoder `src/sources/gribDecode.ts` muss in SW-0 zeigen, dass er Bitmap und Abtastung Nord → Süd richtig behandelt.

**Richtungen** gelten als „kommt aus“ (meteorologisch). Geprüft gegen den Text: + 24 h zeigt das Modell Wind aus 336° in der Deutschen Bucht und aus 138–153° in der westlichen Ostsee; der Küstenbericht sagt „norddrehend“ bzw. „suedostdrehend, zunehmend 4“.

## 4. Fallen (mit Zahlen)

| Falle | Befund | Regel |
| --- | --- | --- |
| Windboden | `sp_10m` exakt 2,00 m/s an 7.487 von 124.011 CWAM-Seepunkten, in EWAM an 12.499 von 138.388 | Modellwind nie zeigen; Wind aus buscosun Fusion |
| Platzhalter Periode | `tm10` = 1,0 s an 3.191 Punkten, alle mit Hs ≈ 0 | `tm10` = 1,0 s bei Hs < 0,05 m → `null` („–“) |
| Artefakt Spitzenperiode | `ppww` > 15 s an 468 Punkten, Hs dort im Median 0,17 m | `ppww` > 12 s bei `shww` < 0,3 m → `null` |
| Watt | östlich Sylt EWAM 1,95 m, CWAM 0,58 m | CWAM hat Vorrang; ob CWAM den Wasserstand berücksichtigt, klärt SW-0 |
| EWAM an der Küste | im CWAM-Kasten hat EWAM nur 2.776 Seepunkte; nur CWAM rechnet in Elbe, Weser, Wismarbucht, Strelasund, Stettiner Haff | Modellwahl CWAM vor EWAM |
| Binnenseen | Bodensee, Chiemsee, Genfersee, Neusiedler See, Gardasee, Balaton sind in allen drei Modellen Land; Müritz und Dümmer außerhalb bzw. Land | Seen ohne Welle (SW-8) |
| Verzeichnisliste | GWAM-Liste zeigte am 07.10. den 02.10. als neuesten Lauf | Inventar oder HEAD auf erwartete Pfade |
| Kein Ensemble, keine Messung | nur Vorhersage und Text | Modellabgleich als einzige Unsicherheitsangabe |

## 5. Modellabgleich (Lauf 07.10.2026 00 UTC, 0–72 h, sechsstündlich)

| Punkt | Lage | größte Spanne Hs zwischen CWAM, EWAM, GWAM |
| --- | --- | --- |
| vor Norderney | 53,75° N 7,20° E | 0,53 m (bei + 60 h) |
| Helgoland | 54,20° N 7,75° E | 0,41 m |
| Kieler Bucht | 54,50° N 10,27° E | 0,43 m |
| Arkona | 54,75° N 13,55° E | 0,26 m |

Offshore liegen die drei Modelle bis 72 h meist innerhalb von 10–20 %. Die großen Unterschiede liegen in Küstennähe (Watt).

### Spot-Stichprobe aus dem Mockup (CWAM, Lauf 07.10.2026 00 UTC)

Die Reihen im Mockup sind aus diesem Lauf dekodiert (nächster Seepunkt zum Spot). Die Lage ist aus den Kartenpixeln zurückgerechnet und kann ein bis zwei Gitterpunkte neben dem gelesenen Punkt liegen; SW-0 vergleicht deshalb gegen den besten Seepunkt im Umkreis von zwei Gitterpunkten, Toleranz 0,1 m bzw. 0,2 s. Wangerooge lieferte am gewählten Punkt durchgehend 0 (geschützte oder trockenfallende Zelle) und ist im Mockup nicht enthalten.

| Spot | Lage (≈) | CWAM i/j | Ufernormale | Hs + 10 / + 34 / + 58 h (m) | Tm−1,0 + 34 h (s) | Windsee / Dünung + 34 h (m) | Wellenrichtung + 34 h |
| --- | --- | --- | --- | --- | --- | --- | --- |
| St. Peter-Ording | 54,300 N 8,620 E | 176/258 | 265° | 0,4 / 2,2 / 1,8 | 6,0 | 2,2 / 0,1 | 304° |
| Westerland (Sylt) | 54,910 N 8,300 E | 153/184 | 270° | 0,7 / 3,2 / 2,0 | 6,4 | 3,2 / 0,0 | 326° |
| Helgoland | 54,180 N 7,890 E | 124/272 | 90° | 0,7 / 3,6 / 2,3 | 7,2 | 3,5 / 0,2 | 315° |
| Büsum | 54,130 N 8,840 E | 192/278 | 250° | 0,1 / 1,0 / 0,9 | 3,6 | 1,0 / 0,0 | 304° |
| Cuxhaven-Duhnen | 53,880 N 8,650 E | 178/308 | 330° | 0,2 / 1,4 / 0,3 | 3,8 | 1,4 / 0,0 | 354° |
| Norderney | 53,710 N 7,160 E | 71/328 | 345° | 0,7 / 3,8 / 1,4 | 7,6 | 3,8 / 0,0 | 338° |
| Eckernförde | 54,470 N 9,840 E | 264/237 | 90° | 0,0 / 0,1 / 0,1 | 2,4 | 0,0 / 0,1 | 73° |
| Kiel-Schilksee | 54,430 N 10,170 E | 288/242 | 80° | 0,1 / 0,3 / 0,1 | 3,0 | 0,3 / 0,0 | 28° |
| Laboe | 54,410 N 10,220 E | 291/244 | 20° | 0,1 / 0,7 / 0,3 | 3,0 | 0,7 / 0,0 | 349° |
| Heiligenhafen | 54,380 N 10,980 E | 346/248 | 20° | 0,0 / 0,0 / 0,4 | 1,8 | 0,0 / 0,0 | 28° |
| Fehmarn Grüner Brink | 54,530 N 11,170 E | 360/230 | 0° | 0,2 / 0,2 / 0,7 | 2,6 | 0,1 / 0,2 | 101° |

i = Spalte von West (Lo1), j = Zeile von Nord (La1), jeweils ab 0. Werte auf 0,1 gerundet. Die Ufernormale (Richtung seewärts) ist eine Annahme des Mockups und gehört in den Spotkatalog (E-SW-5).

## 6. Textprodukte (`forecast/german/`)

Alle sind WMO-Bulletins: Steuerzeichen SOH (`0x01`) am Anfang, ETX (`0x03`) am Ende, Zeilenende `\r\r\n`, Textende `=` (außer WODL45 und FXDL40), Zeilen umbrochen bei rund 60 Zeichen, oft mit Leerzeichen am Zeilenende. Dateiname und Kopf weichen ab (`FQEN50_EDZW_…` trägt den Kopf `FQDL50 DWHA`).

| Datei | Kopf | Inhalt | Takt (beobachtet) | Größe |
| --- | --- | --- | --- | --- |
| `FQEN50_EDZW_<DDHHMM>` | `FQDL50 DWHA` | Seewetterbericht Nord- und Ostsee: Wetterlage, dann „Vorhersage fuer <Tag>:“ heute und morgen für 9 Seegebiete (Deutsche Bucht, Suedwestliche Nordsee, Fischer, Skagerrak, Kattegat, Belte und Sund, Westliche Ostsee, Suedliche Ostsee, Suedoestliche Ostsee), je `Wind:` (Bft), `Sicht/Wetter:`, `Seegang:` (m) | 8 × täglich, Ausgabe 00, 03, 05, 08, 11, 14, 17, 20 UTC, Datei jeweils um :15 (070800 → 08:15:08 UTC) | 3,3–4,1 KB |
| `FQEN51_EDZW_<DDHHMM>` | `FQDL51 DWHA` | Seewetterbericht Deutsche Nord- und Ostseeküste: Wetterlage, Vorhersage für 8 Küstenabschnitte (Ostfriesische Kueste, Elbmuendung, Helgoland, Nordfriesische Kueste, Elbe von Hamburg bis Cuxhaven, Flensburg bis Fehmarn, Oestlich Fehmarn bis Ruegen, Boddengewaesser Ost und oestlich Ruegen), je `Wind:` und `Sicht/Wetter:`, **kein Seegang** | wie FQEN50 | 1,4–1,8 KB |
| `WODL45_EDZW_<DDHHMM>` | `WODL45 DWHA` | Starkwind-, Sturm- und Orkanwarnungen: englischer Teil für German Bight, Western Baltic, Southern Baltic; deutscher Teil „Warnstatus“ je Küste mit `NR.`, Art („Amtliche Aufhebung / Meldung“) und Ausgabezeit in GZ | alle 3 h; Datei 070900 erschien 08:45:33 UTC (Name = nächste volle Stunde) | 0,9 KB ohne Warnung |
| `FXDL40_EDZW_<DDHHMM>` | `FXDL40 DWHA` | Mittelfrist Nord- und Ostsee, 5 Tage, je Tag eine Windzeile, dazu Wassertemperaturen je Teilgebiet; **ISO-8859-1** mit Umlauten | 1 × täglich; Datei 060000 (Text: „06.10.2026, 09.00 GZ“) erschien 06.10. 07:52:58 UTC; Text kündigt die nächste für „gegen 14.00 Uhr“ an | 1,6 KB |
| `FQMM60_EDZW_<DDHHMM>` | `FQDL60 DWHA` | Seewetterbericht Mittelmeer; enthält HTML-Rest `<br>`, einzelne `\r` ohne `\n` und eine Folge von `NIL`-Zeilen | 1 × täglich, Datei 061400 erschien 12:16:21 UTC | ≈ 1 KB |

**Befunde aus den Fixtures (für den Parser):**

- WODL45 ohne Warnung: Seegebiete je mit dem Satz `no warning. ` (mit Leerzeichen); Küsten je ein Block `NR. 479` / `Amtliche Aufhebung / Meldung des Seewetterdienstes Hamburg` / `fuer die deutsche Nordseekueste` / `herausgegeben am Dienstag, den 29.09.2026 um 11:25 Uhr GZ` / `Fuer die deutsche Nordseekueste besteht keine Starkwind-, Sturm- oder` + `Orkanwarnung.` (über zwei Zeilen umbrochen, Umbruch an anderer Stelle möglich). Der Status „keine Warnung“ darf nur aus genau diesem Satz nach Entfernen der Umbrüche folgen; alles andere ist `unbekannt` und wird wörtlich gezeigt. Wie der Text **mit** aktiver Warnung aussieht, ist offen (SW-0 sammelt).
- FQDL50: Gebietsnamen stehen allein auf einer Zeile mit Doppelpunkt; ein Wert kann über mehrere Zeilen laufen (`Wind: … norddrehend ` + `und zunehmend um 6.`). Am Ende `Windstaerke in Beaufort, Luftdruck in Hektopascal`.
- FQDL51 gliedert in `Nordseekueste:` und `Ostseekueste:` mit Unterabschnitten; Doppel-Leerzeichen im Text kommen vor (`spaeter  rechtdrehend`).
- FXDL40: Ausgabezeit im Text (09.00 GZ) passt nicht zum Dateinamen (`060000`); Wassertemperaturen als `Temperaturen Wasser` + Zeilen `Norden 12 bis 15 Grad` usw. Am 06.10.: Nordsee Norden 12–15, Mitte 13–16, Süden 16–18 °C; Ostsee Osten 12–17, Süden 13–17, Westen 14–17 °C.
- FQDL60: Nach `Vorhersage bis Mittwochabend:` folgen 13 Zeilen `NIL ` statt Gebietstexten.

## 7. Ergänzende Quellen

| Quelle | Befund | Lizenz | Bewertung |
| --- | --- | --- | --- |
| buscosun Fusion 8 / ICON-D2, ICON-EU | Wind, Böen, Sicht, Gewitter je Punkt | vorhanden | Windquelle; Abdeckung des Würfels über See in SW-0 prüfen |
| DWD POI `weather/weather_reports/poi/` | Arkona 10091 liefert stündlich (u. a. Böen, Sicht); Feuerschiffe UFS Deutsche Bucht 10007 und UFS TW Ems 10004 lieferten am 07.10. nur `---` | GeoNutzV | „gemessen jetzt“ an der Küste |
| PEGELONLINE (WSV) | gemessener Wasserstand an Küstenpegeln | DL-DE Zero 2.0 | Ausbau SW-8 |
| BSH Wasserstandsvorhersage, Gezeiten | Vorhersage | Lizenz nicht geprüft | blockiert, nur Deep-Link |
| MeteoSchweiz SwissMetNet, GeoSphere TAWES | Wind und Böen an Seestationen | CC BY 4.0 | Seen-Ausbau |
| Sturmwarnleuchten Bodensee, bayerische Seen | Status der Leuchten | nicht offen | blockiert |
| DWD CAP-Warnungen | ob Küsten- und Binnenseewarnungen enthalten sind, offen | GeoNutzV | SW-0 |

## 8. Budget (gemessen im Browser)

Ein CWAM-Schritt als RGBA-PNG (R = Hs, G = Richtung, B = Periode, A = Maske): 152 KB; ein EWAM-Schritt: 206 KB (Browser-Encoder, unoptimiert, + 36 h). Stündlich über 79 Schritte wären das rund 12 MB (CWAM) bzw. 16 MB (EWAM) je Lauf. Daraus die Planung: stündlich bis + 48 h, danach dreistündlich (59 Schritte), EWAM nur in Ausschnitten. jsDelivr-Grenzen: 20 MB je Datei, 150 MB je Paket (Messung gegen den heutigen Bestand in SW-0).

## 9. Offen für SW-0

1. Dekodiert `gribDecode.ts` in Node Bitmap und Abtastung richtig? Sollwerte: 124.011 Seepunkte, 7.487 Windboden-Punkte (Lauf 07.10. 00 UTC).
2. Ankunftszeiten über mehrere Tage aus dem Inventar.
3. WODL45 und FQDL50 bei aktiver Warnung (Fixture sammeln).
4. Enthalten die DWD-CAP-Daten Küsten- und Binnenseewarnungen?
5. Geometrie der Seegebiete und Küstenabschnitte (Quelle, Lizenz).
6. Liefert CWAM Wasserstand oder Strömung, oder rechnet es ohne?
7. Deckt der Fusion-Würfel Spots am und auf dem Wasser ab?
8. Bestand und Größe von buscosun-data gegen die jsDelivr-Paketgrenze.

## Quellen

- DWD Open Data, `weather/maritime`: https://opendata.dwd.de/weather/maritime/
- DWD Open Data, POI: https://opendata.dwd.de/weather/weather_reports/poi/
- GDI-DE, CWAM signifikante Wellenhöhe: https://gdk.gdi-de.org/geonetwork/srv/api/records/urn:x-wmo:md:de.dwd.nwv.cwam.SWH · EWAM: https://gdk.gdi-de.org/geonetwork/srv/api/records/urn:x-wmo:md:de.dwd.nwv.ewam.SWH
- PEGELONLINE: https://www.pegelonline.wsv.de/webservice/ueberblick
- DWD Copyright (GeoNutzV): https://www.wettergefahren.de/copyright.html
