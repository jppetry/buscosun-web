# Phase WT — Wassertemperatur auf `/seewetter`

> **Auftrag Jan, 2026-11-18:** Wassertemperatur an jedem Spot — als Modell (DMI DKSS, EDR-Parameter `water-temperature`,
> über die bestehende DMI-Linie, für deutsche und dänische Spots) und als Messung (WSV PEGELONLINE `WT`, DMI oceanObs
> `tw`), getrennt gezeigt, jede mit ihrer Quelle; Verlauf als Diagramm; eigene Ablage der Messwerte; optionale Schwelle in
> °C; ohne Schalter an für alle (Ausnahme zu Rule 2, Jans Entscheidung). Kein MARNET, kein CMEMS. Kein Eingriff in
> buscosun Fusion, keine Edge Function, keine neue Abhängigkeit. Die Sichtprüfung im Browser macht Jan selbst (seine
> Entscheidung 18.11.) — hier gibt es deshalb **keine** Bilder und keinen UI-Beleg.

**Zur Reihenfolge, ehrlich:** die Messung von Schritt 0 lief gut eine Stunde (das DMI antwortet je Punktabfrage in
2–6 s, gefragt wird nacheinander). In dieser Zeit habe ich Vertrag, Producer und Karte schon geschrieben — also **Code vor
der fertigen schriftlichen Diagnose**, entgegen der Regel. Die Grenzen und Regeln (Station bis 20 km, Gewässer-Regel,
Modellpunkt mit Wasser in jeder Stunde, Jahresgang an vier Stationen) habe ich aus den Messwerten gesetzt, sobald sie
da waren, und den Code danach angepasst; der Katalog ist ausschließlich das, was die Messung ergab (`verify:sea-watertemp` C1).

## 1. Diagnose — Schritt 0, gemessen am 18.11.2026 17:15–18:30 UTC

Werkzeuge (nur Messung): `scripts/sea/spike/wt-probe.mjs` (alles unten), `wt-history.mjs` (Historie des DMI),
`wt-record-fixtures.mjs` (Fixtures des Prüfers), `wt-card-text.mjs` (die Karte als Text, ohne Browser). Ergebnis `audit/seewetter-wassertemperatur/spike/wt-probe.json` (der
Katalogbau liest es). Die Rohantworten (950 Antworten im Cache des Messwerkzeugs) sind nicht eingecheckt; die Fixtures hat der Aufzeichner mit den
Adressen des Producers und der Seite neu geholt (`scripts/lib/fixtures/sea/wt/manifest.json`).

### 1.1 Je Spot: welches DKSS-Teilmodell hat Wasser am Abfragepunkt, welche Station misst in der Nähe

Abfragepunkt = Mitte der CWAM-Wasserzelle des Spots. „121/121“ = Wert in jeder Stunde des Laufs; weniger = die Zelle
fällt im Modell zeitweise trocken (Watt); „0/121“ = Land im Modell (Antwort 200 mit lauter `null`). „Ring“ = am
Zellpunkt gab es im feinsten Teilmodell keinen Punkt mit Wasser in jeder Stunde, gewählt ist der nächste solche in
einem Ring bis ≈ 4 km.

| Spot (`id`) | DKSS an der Wasserzelle (Stunden mit Wert / 121, Abstand des Gitterpunkts) | gewählt | Gitterpunkt ↔ Spot | nächste Station des Katalogs | ohne Gewässer-Regel |
|---|---|---|---|---|---|
| Borkum Nordstrand (`borkum`) | ws 121/121 @ 0,66 km · nsbs 121/121 @ 3,25 km | `ws` | 0,73 km | – (nächste: Wilhelmshaven Neuer Vorhafen 98,8 km) |  |
| Juist (`juist`) | ws 121/121 @ 0,63 km · nsbs 0/121 @ 2,68 km | `ws` | 1,42 km | – (nächste: Leuchtturm Alte Weser 77,2 km) |  |
| Norderney Nordstrand (`norderney`) | ws 121/121 @ 0,63 km · nsbs 121/121 @ 2,32 km | `ws` | 1,12 km | – (nächste: Leuchtturm Alte Weser 65,6 km) |  |
| Norddeich (`norddeich`) | ws 121/121 @ 0,67 km · nsbs 121/121 @ 1,45 km | `ws` | 0,30 km | – (nächste: Wilhelmshaven Neuer Vorhafen 67,6 km) |  |
| Langeoog (`langeoog`) | ws 0/121 @ 0,66 km · nsbs 121/121 @ 2,68 km | `ws` Ring | 1,88 km | – (nächste: Leuchtturm Alte Weser 44,0 km) |  |
| Spiekeroog (`spiekeroog`) | ws 0/121 @ 0,64 km · nsbs 0/121 @ 1,46 km | `ws` Ring | 1,66 km | – (nächste: Leuchtturm Alte Weser 29,7 km) |  |
| Wangerooge (`wangerooge`) | ws 0/121 @ 0,64 km · nsbs 121/121 @ 3,25 km | `ws` Ring | 1,66 km | **Leuchtturm Alte Weser** 17,1 km |  |
| Schillig (`schillig`) | ws 121/121 @ 0,66 km · nsbs 121/121 @ 2,35 km | `ws` | 0,98 km | **Leuchtturm Alte Weser** 18,5 km |  |
| Wilhelmshaven Südstrand (`wilhelmshaven`) | ws 121/121 @ 0,67 km · nsbs 0/121 @ 1,94 km | `ws` | 0,95 km | **Wilhelmshaven Neuer Vorhafen** 2,5 km |  |
| Dangast (Jadebusen) (`dangast`) | ws 121/121 @ 0,64 km · nsbs 121/121 @ 2,69 km | `ws` | 1,79 km | **Wilhelmshaven Neuer Vorhafen** 9,6 km |  |
| Cuxhaven-Duhnen (`cuxhaven-duhnen`) | ws 58/121 @ 0,66 km · nsbs 0/121 @ 2,70 km | `ws` Ring | 3,72 km | – (nächste: Dwarsgat 28,6 km) | BELUM PEGEL (OSTE) 26,8 km |
| Helgoland Düne (`helgoland`) | ws 121/121 @ 0,66 km · nsbs 121/121 @ 2,66 km | `ws` | 1,21 km | **Helgoland Binnenhafen** 1,8 km |  |
| Büsum (`buesum`) | ws 121/121 @ 0,65 km · nsbs 121/121 @ 2,32 km | `ws` | 0,32 km | **Büsum** 1,0 km |  |
| St. Peter-Ording (`st-peter-ording`) | ws 52/121 @ 0,66 km · nsbs 121/121 @ 2,66 km | `ws` Ring | 3,08 km | **Eider-Sperrwerk AP** 15,1 km |  |
| Pellworm (`pellworm`) | ws 88/121 @ 0,65 km · nsbs 121/121 @ 2,28 km | `ws` Ring | 3,05 km | **Pellworm Anleger** 7,6 km |  |
| Husum Dockkoog (`husum`) | ws 121/121 @ 0,64 km · nsbs 0/121 @ 2,29 km | `ws` | 1,54 km | **Husum** 1,0 km |  |
| Amrum Kniepsand (`amrum`) | ws 54/121 @ 0,65 km · nsbs 121/121 @ 2,63 km | `ws` Ring | 1,62 km | **Wittdün** 3,9 km |  |
| Föhr Wyk (`foehr-wyk`) | ws 0/121 @ 0,63 km · nsbs 121/121 @ 3,22 km | `ws` Ring | 1,44 km | **Wittdün** 14,0 km |  |
| Sylt Hörnum (`sylt-hoernum`) | ws 0/121 @ 0,65 km · nsbs 0/121 @ 2,35 km | `ws` Ring | 1,90 km | **Hörnum** 0,4 km |  |
| Sylt Westerland (`sylt-westerland`) | ws 121/121 @ 0,66 km · nsbs 121/121 @ 2,35 km | `ws` | 0,27 km | **List auf Sylt** 15,2 km |  |
| Sylt List (`sylt-list`) | ws 121/121 @ 0,62 km · nsbs 121/121 @ 1,92 km | `ws` | 1,08 km | **List auf Sylt** 0,4 km |  |
| Elbe Wittenbergen (`elbe-wittenbergen`) | ws 0/121 @ 0,66 km · nsbs 0/121 @ 2,68 km | `ws` Ring | 2,82 km | **D1 Hanskalbsand Oberfläche** 5,8 km | ESTE INNERES SPERRWERK AP (ESTE) 3,9 km |
| Flensburg Solitüde (`flensburg`) | idw 121/121 @ 0,04 km · ws 0/121 @ 0,63 km · nsbs 0/121 @ 2,27 km | `idw` | 0,73 km | – (nächste: Fynshav Havn II 36,5 km) |  |
| Glücksburg Holnis (`holnis`) | idw 121/121 @ 0,04 km · ws 0/121 @ 0,63 km · nsbs 0/121 @ 1,93 km | `idw` | 0,57 km | – (nächste: Fynshav Havn II 29,0 km) |  |
| Schleimünde (`schleimuende`) | idw 0/121 @ 0,05 km · ws 0/121 @ 0,65 km · nsbs 121/121 @ 0,64 km | `idw` Ring | 0,87 km | – (nächste: Fynshav Havn II 36,0 km) |  |
| Damp (`damp`) | idw 121/121 @ 0,05 km · ws 0/121 @ 0,63 km · nsbs 121/121 @ 0,65 km | `idw` | 0,93 km | – (nächste: Bagenkop Havn II 45,8 km) |  |
| Eckernförde (`eckernfoerde`) | idw 121/121 @ 0,05 km · ws 0/121 @ 0,65 km · nsbs 121/121 @ 1,43 km | `idw` | 0,77 km | – (nächste: Husum 52,8 km) | LEXFÄHRE UNTERWASSER (EIDER) 38,0 km |
| Kiel-Schilksee (`kiel-schilksee`) | idw 0/121 @ 0,05 km · ws 0/121 @ 0,63 km · nsbs 121/121 @ 2,30 km | `idw` Ring | 0,99 km | – (nächste: Bagenkop Havn II 48,3 km) |  |
| Laboe (`laboe`) | idw 121/121 @ 0,05 km · ws 0/121 @ 0,66 km · nsbs 121/121 @ 2,35 km | `idw` | 0,65 km | – (nächste: Bagenkop Havn II 48,0 km) |  |
| Schönberger Strand (`schoenberger-strand`) | idw 121/121 @ 0,05 km · ws 0/121 @ 0,63 km · nsbs 0/121 @ 1,42 km | `idw` | 0,50 km | – (nächste: Bagenkop Havn II 40,6 km) |  |
| Hohwacht (`hohwacht`) | idw 121/121 @ 0,06 km · nsbs 121/121 @ 1,43 km | `idw` | 0,79 km | – (nächste: Bagenkop Havn II 48,0 km) |  |
| Heiligenhafen (`heiligenhafen`) | idw 121/121 @ 0,05 km · nsbs 0/121 @ 1,42 km | `idw` | 0,41 km | – (nächste: Rødbyhavns Havn II 38,8 km) |  |
| Großenbrode (`grossenbrode`) | idw 121/121 @ 0,06 km · nsbs 0/121 @ 3,23 km | `idw` | 0,69 km | – (nächste: Rødbyhavns Havn II 36,9 km) |  |
| Fehmarn Grüner Brink (`fehmarn-gruener-brink`) | idw 0/121 @ 0,05 km · nsbs 121/121 @ 2,29 km | `idw` Ring | 1,36 km | **Rødbyhavns Havn II** 18,9 km |  |
| Fehmarn Wulfener Hals (`fehmarn-wulfen`) | idw 121/121 @ 0,05 km · nsbs 121/121 @ 3,24 km | `idw` | 0,90 km | – (nächste: Rødbyhavns Havn II 30,4 km) |  |
| Fehmarn Südstrand (`fehmarn-burgtiefe`) | idw 121/121 @ 0,05 km · nsbs 0/121 @ 2,35 km | `idw` | 0,69 km | – (nächste: Rødbyhavns Havn II 29,0 km) |  |
| Grömitz (`groemitz`) | idw 121/121 @ 0,06 km · nsbs 121/121 @ 2,37 km | `idw` | 0,20 km | – (nächste: Rødbyhavns Havn II 62,1 km) | BÜSSAU UP (ELBE-LÜBECK-KANAL) 42,5 km |
| Pelzerhaken (`pelzerhaken`) | idw 121/121 @ 0,06 km · nsbs 121/121 @ 1,47 km | `idw` | 0,54 km | – (nächste: Rødbyhavns Havn II 70,0 km) | BÜSSAU UP (ELBE-LÜBECK-KANAL) 34,4 km |
| Scharbeutz (`scharbeutz`) | idw 0/121 @ 0,06 km · nsbs 121/121 @ 2,32 km | `idw` Ring | 0,82 km | – (nächste: Hohnstorf 75,0 km) | BÜSSAU UP (ELBE-LÜBECK-KANAL) 25,2 km |
| Travemünde (`travemuende`) | idw 0/121 @ 0,06 km · nsbs 0/121 @ 1,45 km | `idw` Ring | 3,41 km | – (nächste: Hohnstorf 70,0 km) | BÜSSAU UP (ELBE-LÜBECK-KANAL) 23,8 km |
| Boltenhagen (`boltenhagen`) | idw 121/121 @ 0,06 km · nsbs 121/121 @ 2,35 km | `idw` | 0,42 km | – (nächste: Rødbyhavns Havn II 73,6 km) | SCHWERIN WERDERBRÜCKE (STÖR-WASSERSTRASSE) 42,1 km |
| Insel Poel (`poel`) | idw 121/121 @ 0,06 km · nsbs 0/121 @ 2,32 km | `idw` | 1,18 km | – (nächste: Gedser Havn II 70,6 km) | SCHWERIN WERDERBRÜCKE (STÖR-WASSERSTRASSE) 40,4 km |
| Rerik (Salzhaff) (`rerik`) | idw 121/121 @ 0,06 km · nsbs 121/121 @ 0,65 km | `idw` | 1,60 km | – (nächste: Gedser Havn II 55,0 km) | SCHWERIN WERDERBRÜCKE (STÖR-WASSERSTRASSE) 53,0 km |
| Kühlungsborn (`kuehlungsborn`) | idw 121/121 @ 0,06 km · nsbs 121/121 @ 2,64 km | `idw` | 1,22 km | – (nächste: Gedser Havn II 48,1 km) |  |
| Warnemünde (`warnemuende`) | idw 0/121 @ 0,06 km · nsbs 0/121 @ 2,32 km | `idw` Ring | 0,65 km | – (nächste: Gedser Havn II 44,6 km) |  |
| Graal-Müritz (`graal-mueritz`) | idw 121/121 @ 0,06 km · nsbs 121/121 @ 2,64 km | `idw` | 0,37 km | – (nächste: Gedser Havn II 40,3 km) |  |
| Ahrenshoop (`ahrenshoop`) | idw 121/121 @ 0,06 km · nsbs 121/121 @ 2,64 km | `idw` | 0,43 km | – (nächste: Gedser Havn II 37,9 km) |  |
| Zingst (`zingst`) | idw 121/121 @ 0,05 km · nsbs 0/121 @ 2,69 km | `idw` | 0,43 km | – (nächste: Gedser Havn II 51,5 km) |  |
| Hiddensee Vitte (`hiddensee`) | idw 121/121 @ 0,05 km · nsbs 121/121 @ 2,64 km | `idw` | 0,68 km | – (nächste: Gedser Havn II 75,8 km) |  |
| Juliusruh (`juliusruh`) | idw 121/121 @ 0,05 km · nsbs 0/121 @ 1,41 km | `idw` | 1,02 km | – (nächste: Gedser Havn II 94,0 km) |  |
| Binz (`binz`) | idw 121/121 @ 0,06 km · nsbs 121/121 @ 2,35 km | `idw` | 0,56 km | – (nächste: Gedser Havn II 110,7 km) |  |
| Göhren (`goehren`) | idw 121/121 @ 0,06 km · nsbs 121/121 @ 3,24 km | `idw` | 0,77 km | – (nächste: Gedser Havn II 120,4 km) | WAREN (MÜRITZ-ELDE-WASSERSTRASSE) 115,9 km |
| Lubmin (Greifswalder Bodden) (`lubmin`) | idw 0/121 @ 0,06 km · nsbs 0/121 @ 1,47 km | `idw` Ring | 1,22 km | – (nächste: Gedser Havn II 119,7 km) | WAREN (MÜRITZ-ELDE-WASSERSTRASSE) 92,5 km |
| Usedom Zinnowitz (`zinnowitz`) | idw 0/121 @ 0,06 km · nsbs 121/121 @ 2,32 km | `idw` Ring | 0,95 km | – (nächste: Gedser Havn II 140,2 km) | MESCHERIN (WESTODER) 98,4 km |
| Usedom Heringsdorf (`heringsdorf`) | idw 121/121 @ 0,07 km · nsbs 121/121 @ 2,66 km | `idw` | 0,81 km | – (nächste: Gedser Havn II 161,2 km) | MESCHERIN (WESTODER) 80,2 km |
| Ueckermünde (Stettiner Haff) (`ueckermuende`) | idw 121/121 @ 0,07 km · nsbs 121/121 @ 2,68 km | `idw` | 1,25 km | – (nächste: Gedser Havn II 166,2 km) | MESCHERIN (WESTODER) 60,6 km |
| Rømø Lakolk (`roemoe`) | ws 121/121 @ 0,62 km · nsbs 121/121 @ 2,36 km | `ws` | 0,61 km | **List auf Sylt** 14,5 km |  |
| Fanø Bad (`fanoe`) | ws 121/121 @ 0,61 km · nsbs 0/121 @ 1,40 km | `ws` | 0,90 km | **Esbjerg Havn II** 6,5 km |  |
| Hvide Sande (`hvide-sande`) | nsbs 0/121 @ 2,36 km | `nsbs` Ring | 3,22 km | – (nächste: Esbjerg Havn II 63,8 km) |  |
| Als Kegnæs (`als-kegnaes`) | idw 121/121 @ 0,04 km · ws 0/121 @ 0,66 km · nsbs 121/121 @ 3,20 km | `idw` | 0,44 km | **Fynshav Havn II** 15,9 km |  |
| Langeland Bagenkop (`langeland-bagenkop`) | idw 121/121 @ 0,05 km · nsbs 121/121 @ 3,20 km | `idw` | 0,71 km | **Bagenkop Havn II** 0,2 km |  |
| Ærø Marstal (`aeroe-marstal`) | idw 121/121 @ 0,04 km · nsbs 121/121 @ 2,35 km | `idw` | 0,74 km | **Bagenkop Havn II** 14,8 km |  |
| Middelfart (Kleiner Belt) (`middelfart`) | lb 121/121 @ 0,02 km · idw 121/121 @ 0,03 km · ws 0/121 @ 0,66 km · nsbs 121/121 @ 1,91 km | `lb` | 0,53 km | **Fredericia Havn II** 7,6 km |  |
| Gedser (`gedser`) | idw 121/121 @ 0,05 km · nsbs 0/121 @ 2,29 km | `idw` | 0,35 km | **Gedser Havn II** 0,2 km |  |

**Folgen.**

- **Jeder der 64 Spots hat einen brauchbaren Modellpunkt** mit Wasser in jeder Stunde, höchstens 3,7 km vom Spot
  (Cuxhaven-Duhnen 3,72 km, Travemünde 3,41 km, Hvide Sande 3,22 km; Grenze `WT_MODEL_MAX_KM` = 5 km, `set`). 38 Spots
  lesen `dkss_idw` (0,9 km), 24 `dkss_ws` (1,9 km), einer `dkss_lb`, einer das grobe `dkss_nsbs`.
- An **19 Spots** hat das feinste Teilmodell am Zellpunkt kein durchgehendes Wasser (10 im Watt, 8 an der Ostsee mit
  Land im Modell, Hvide Sande). Dort ist der nächste Punkt mit Wasser in jeder Stunde gewählt — „Modell für das offene
  Wasser“ ist an diesen Spots wörtlich zu nehmen.
- **Eine Messung in der Nähe (≤ 20 km) haben 23 von 64 Spots**: 16 an einem WSV-Pegel (alle an der Nordsee, Jade, Weser,
  Elbe — an der deutschen Ostseeküste misst PEGELONLINE keine Wassertemperatur), 7 an einer DMI-Station (sechs dänische
  Spots und Fehmarn Grüner Brink ↔ Rødbyhavn, 18,9 km über den Belt; Rømø liest den WSV-Pegel List, Hvide Sande hat
  keine liefernde Station).
  **41 Spots zeigen nur das Modell** — an der Stelle der Messung steht dort „keine Station in der Nähe“.

### 1.2 Tiefe des Parameters

`water-temperature` ohne Zusatz ist die **oberste Modellschicht**: gemessen identisch mit der flachsten benannten Ebene
(`-1m` in `dkss_idw` und `dkss_lb`, `-4m` in `dkss_ws` und `dkss_nsbs`; größte Abweichung über 121 Stunden 0,000 K). Die
nächsttiefere Ebene weicht ab (`idw` 3 m: bis 0,12 K, `lb` 3 m: bis 0,55 K, `nsbs` 9 m: bis 0,24 K). Die Doku des DMI
nennt die Schichtdicke nicht. Einheit °C, stündlich, 121 Werte ≙ +120 h (fünf Tage), vier Läufe am Tag.

### 1.3 WSV PEGELONLINE — Reihe `WT`

| Frage | Befund |
|---|---|
| Stationen mit `WT` | 141 bundesweit, 80 im Kasten der Küste (53,0–55,3° N, 6,0–14,6° O) — fast alle an Elbe, Weser, Eider und ihren Nebenflüssen; **an der Ostsee keine** |
| CORS | `Access-Control-Allow-Origin: *`, `Allow-Methods: GET,OPTIONS`, `Max-Age: 600` (mit `Origin: https://buscosun.com` geprüft) ⇒ direkt im Browser lesbar |
| Lizenz | „Die Daten sind unter der Lizenz DL-DE->Zero-2.0 …“ (Seite `webservice/ueberblick`), keine Gewähr; die Reihe heißt „WASSERTEMPERATUR ROHDATEN“ |
| Wie weit zurück | **31,8 Tage** (`start=P40D` liefert ab 18.10.) — an 60 der 61 gefragten Stationen (Fahrenholz: 25,6 Tage, liefert seit dem 12.11. nichts). Keine Kennwerte (`characteristicValues` leer) ⇒ **keine Jahreskurve aus dieser Quelle** |
| Takt | 1 min (fast alle), einzelne 5, 15 oder 60 min |
| Auffälligkeiten | Glückstadt 24,1 °C und Kollmar 12,5 °C bei ≈ 8 °C der Nachbarn; Fahrenholz liefert seit sechs Tagen nichts. Keine davon steht im Katalog (V-WT-3) |

Stationen bis 40 km um einen Spot:

| Station (PEGELONLINE) | Gewässer | Takt | Wert 18.11. | Reihe reicht zurück | nächster Spot | im Katalog |
|---|---|---|---|---|---|---|
| HÖRNUM (9570050) | NORDSEE | 1 min | 7,3 °C | 31,8 Tage (45750 Werte) | sylt-hoernum 0,4 km | ja |
| LIST AUF SYLT (9570070) | NORDSEE | 1 min | 7,2 °C | 31,8 Tage (45750 Werte) | sylt-list 0,4 km | ja |
| BÜSUM (9510095) | NORDSEE | 1 min | 6,6 °C | 31,8 Tage (45750 Werte) | buesum 1,0 km | ja |
| HUSUM (9530020) | NORDSEE | 1 min | 6,1 °C | 31,8 Tage (45750 Werte) | husum 1,0 km | ja |
| HELGOLAND BINNENHAFEN (9510070) | NORDSEE | 1 min | 11,4 °C | 31,8 Tage (45750 Werte) | helgoland 1,8 km | ja |
| WHV NEUER VORHAFEN (9440030) | JADE | 1 min | 8,5 °C | 31,8 Tage (45751 Werte) | wilhelmshaven 2,5 km | ja |
| ESTE INNERES SPERRWERK AP (5950082) | ESTE | 1 min | 7,0 °C | 31,8 Tage (45753 Werte) | elbe-wittenbergen 3,9 km | nein — Este |
| WITTDÜN (9570010) | NORDSEE | 1 min | 8,3 °C | 31,8 Tage (45750 Werte) | amrum 3,9 km | ja |
| HAHNÖFER SAND WEST SIEL (126017) | ELBE | 1 min | 7,7 °C | 31,8 Tage (45753 Werte) | elbe-wittenbergen 5,0 km | nein — Siel |
| D1 HANSKALBSAND OBERFLÄCHE (71160198) | ELBE | 5 min | 8,2 °C | 31,8 Tage (9150 Werte) | elbe-wittenbergen 5,8 km | ja |
| PELLWORM ANLEGER (9550021) | NORDSEE | 1 min | 7,4 °C | 31,8 Tage (18800 Werte) | pellworm 7,6 km | ja |
| LÜHORT LFK (126016) | LÜHE | 1 min | 8,3 °C | 31,8 Tage (45753 Werte) | elbe-wittenbergen 8,4 km | nein — Lühe |
| BUXTEHUDE (5950080) | ESTE | 1 min | 7,9 °C | 31,8 Tage (45741 Werte) | elbe-wittenbergen 10,3 km | nein — Este |
| HETLINGEN (5970010) | ELBE | 1 min | 7,8 °C | 31,8 Tage (45581 Werte) | elbe-wittenbergen 12,5 km | nein — nie die nächste |
| HORNEBURG (5960020) | LÜHE | 1 min | 7,2 °C | 31,8 Tage (45753 Werte) | elbe-wittenbergen 12,7 km | nein — Lühe |
| TWIELENFLETH SIEL (126015) | ELBE | 1 min | 6,9 °C | 31,8 Tage (45753 Werte) | elbe-wittenbergen 13,2 km | nein — Siel |
| UETERSEN (5970016) | PINNAU | 1 min | 7,5 °C | 31,8 Tage (45753 Werte) | elbe-wittenbergen 13,5 km | nein — Pinnau |
| EIDER-SPERRWERK AP (9530010) | NORDSEE | 1 min | 6,2 °C | 31,8 Tage (45750 Werte) | st-peter-ording 15,1 km | ja |
| EIDER-SPERRWERK BP (9520081) | EIDER | 1 min | 6,2 °C | 31,8 Tage (45615 Werte) | buesum 15,3 km | nein — Eider |
| NORDFELD UNTERWASSER (9520050) | EIDER | 1 min | 6,3 °C | 31,8 Tage (34827 Werte) | husum 17,1 km | nein — Eider |
| LEUCHTTURM ALTE WESER (9460040) | WESER | 1 min | 10,7 °C | 31,8 Tage (45752 Werte) | wangerooge 17,1 km | ja |
| NORDFELD OBERWASSER (9520040) | EIDER | 1 min | 6,2 °C | 31,8 Tage (43539 Werte) | husum 17,2 km | nein — Eider |
| SCHWINGE-SPERRWERK (126014) | SCHWINGE | 1 min | 7,8 °C | 31,8 Tage (38773 Werte) | elbe-wittenbergen 17,4 km | nein — Schwinge |
| PINNAU-SPERRWERK BP (5970018) | PINNAU | 1 min | 7,5 °C | 31,8 Tage (45751 Werte) | elbe-wittenbergen 17,6 km | nein — Pinnau |
| TÖNNING (9520070) | EIDER | 1 min | 6,5 °C | 31,8 Tage (45750 Werte) | husum 18,1 km | nein — Eider |
| DWARSGAT (9460020) | WESER | 1 min | 8,0 °C | 31,8 Tage (45720 Werte) | schillig 18,5 km | nur Ablage |
| ABBENFLETH SPERRWERK (126013) | BÜTZFLETHER SÜDERELBE | 1 min | 7,6 °C | 31,8 Tage (45753 Werte) | elbe-wittenbergen 20,9 km | nein — Bützflether süderelbe |
| GRAUERORT REEDE (5970026) | ELBE | 1 min | 8,3 °C | 31,8 Tage (45752 Werte) | elbe-wittenbergen 21,5 km | nein — nie die nächste |
| KRÜCKAU-SPERRWERK BP (5970023) | KRÜCKAU | 1 min | 7,7 °C | 31,8 Tage (45753 Werte) | elbe-wittenbergen 22,6 km | nein — Krückau |
| NORDENHAM (4970040) | WESER | 1 min | 7,7 °C | 31,8 Tage (45743 Werte) | wilhelmshaven 23,6 km | nein — nie die nächste |
| BÜSSAU UP (9669040) | ELBE-LÜBECK-KANAL | 1 min | 7,9 °C | 31,8 Tage (45753 Werte) | travemuende 23,8 km | nein — Elbe-lübeck-kanal |
| ROBBENSÜDSTEERT (9460010) | WESER | 1 min | 7,4 °C | 31,8 Tage (45742 Werte) | wilhelmshaven 24,6 km | nein — nie die nächste |
| BLEXEN ABZ (4970090) | WESER | 1 min | 7,5 °C | 31,8 Tage (45740 Werte) | wilhelmshaven 26,3 km | nein — nie die nächste |
| RECHTENFLETH (4970030) | WESER | 1 min | 8,0 °C | 31,8 Tage (45646 Werte) | dangast 26,4 km | nein — nie die nächste |
| BELUM PEGEL (126019) | OSTE | 1 min | 7,9 °C | 31,8 Tage (45749 Werte) | cuxhaven-duhnen 26,8 km | nein — Oste |
| KOLLMAR (5970025) | ELBE | 1 min | 12,5 °C | 31,8 Tage (45752 Werte) | elbe-wittenbergen 26,9 km | nein — nie die nächste |
| RUTHENSTROM-SPERRWERK (126010) | RUTHENSTROM | 1 min | 6,9 °C | 31,8 Tage (45753 Werte) | elbe-wittenbergen 28,2 km | nein — Ruthenstrom |
| BRAKE (4970020) | WESER | 1 min | 8,2 °C | 31,8 Tage (45753 Werte) | dangast 28,5 km | nein — nie die nächste |
| BHV ALTER LEUCHTTURM (4990010) | WESER | 1 min | 7,6 °C | 31,8 Tage (45726 Werte) | wilhelmshaven 28,5 km | nein — nie die nächste |
| GEVERSDORF BRÜCKE (126002) | OSTE | 1 min | 7,4 °C | 31,8 Tage (45753 Werte) | cuxhaven-duhnen 30,2 km | nein — Oste |
| ELSFLETH (4970010) | WESER | 1 min | 8,3 °C | 31,8 Tage (45746 Werte) | dangast 31,6 km | nein — nie die nächste |
| KRAUTSAND REEDE (5970031) | ELBE | 1 min | 8,2 °C | 31,8 Tage (45752 Werte) | elbe-wittenbergen 32,0 km | nein — nie die nächste |
| DORNBUSCH BRÜCKE (126009) | WISCHHAFENER SÜDERELBE | 1 min | 7,6 °C | 31,8 Tage (45721 Werte) | elbe-wittenbergen 33,1 km | nein — Wischhafener süderelbe |
| GLÜCKSTADT (5970035) | ELBE | 1 min | 24,1 °C | 31,8 Tage (45752 Werte) | elbe-wittenbergen 33,4 km | nein — nie die nächste |
| NEUENSEER SCHLEUSENFLETH SIEL (126003) | OSTE | 1 min | 7,9 °C | 31,8 Tage (45753 Werte) | cuxhaven-duhnen 34,1 km | nein — Siel |
| WISCHHAFEN SPERRWERK (126008) | WISCHHAFENER SÜDERELBE | 1 min | 6,1 °C | 31,8 Tage (45752 Werte) | elbe-wittenbergen 36,8 km | nein — Wischhafener süderelbe |
| STÖR-SPERRWERK BP (5970040) | STÖR | 1 min | 8,2 °C | 31,8 Tage (45753 Werte) | elbe-wittenbergen 37,3 km | nein — Stör |
| LEXFÄHRE UNTERWASSER (9520030) | EIDER | 1 min | 5,9 °C | 31,8 Tage (45727 Werte) | eckernfoerde 38,0 km | nein — Eider |
| LEXFÄHRE OBERWASSER (9520020) | EIDER | 1 min | 6,0 °C | 31,8 Tage (45726 Werte) | eckernfoerde 38,1 km | nein — Eider |
| ACHTHÖFENER FLETH SIEL (126004) | OSTE | 1 min | 7,5 °C | 31,8 Tage (45753 Werte) | cuxhaven-duhnen 39,8 km | nein — Siel |

### 1.4 DMI oceanObs — `tw`

65 aktive Stationen tragen `tw`, 23 liegen bis 60 km um einen Spot. CORS `*`. Takt 10 min, Rohwerte. An fast jedem Ort
stehen zwei Stationen („… I“ und „… II“, gleiche Lage): **nur eine davon liefert** — heute durchweg die „II“; die „I“
endet 2013–2021. Die Historie ist deshalb je Station lückenhaft; gemessen mit einer Stichprobe (eine Stunde am 15. jedes
Monats seit 2000, 323 Abrufe, alle Stationen je Abruf).

| Station (DMI oceanObs) | Werte in 3 h | Takt | Wert | volle Jahre in der Monatsstichprobe | nächster Spot | im Katalog |
|---|---|---|---|---|---|---|
| Bagenkop Havn II (28547) | 20 | 10 min | 10,2 °C | 3 (2023–2025) | langeland-bagenkop 0,2 km | ja |
| Gedser Havn I (31616) | 0 | – | – | 10 (2002–2013) | gedser 0,2 km | nein — liefert nicht |
| Gedser Havn II (31623) | 20 | 10 min | 9,1 °C | 8 (2015–2025) | gedser 0,2 km | ja |
| Hvide Sande Indsejling (9005203) | 0 | – | – | 13 (2006–2018) | hvide-sande 0,6 km | nein — liefert nicht |
| Esbjerg Havn I (25149) | 0 | – | – | 21 (2000–2020) | fanoe 6,5 km | nein — liefert nicht |
| Esbjerg Havn II (25151) | 20 | 10 min | 6,5 °C | 4 (2022–2025) | fanoe 6,5 km | ja |
| Fredericia Havn II (23289) | 20 | 10 min | 9,6 °C | 10 (2015–2025) | middelfart 7,6 km | ja |
| Fredericia Havn (23293) | 0 | – | – | 11 (2003–2013) | middelfart 7,6 km | nein — liefert nicht |
| Havneby Havn II (9006802) | 0 | – | – | 7 (2011–2017) | roemoe 9,1 km | nein — liefert nicht |
| Fynshav Havn I (26457) | 0 | – | – | 8 (2003–2013) | als-kegnaes 15,9 km | nein — liefert nicht |
| Fynshav Havn II (26459) | 20 | 10 min | 9,4 °C | 10 (2015–2025) | als-kegnaes 15,9 km | ja |
| Rødbyhavns Havn I (31573) | 0 | – | – | 14 (2000–2013) | fehmarn-gruener-brink 18,9 km | nein — liefert nicht |
| Rødbyhavns Havn II (31574) | 20 | 10 min | 9,5 °C | 9 (2015–2025) | fehmarn-gruener-brink 18,9 km | ja |
| Juelsminde Havn II (23131) | 19 | 10 min | 8,5 °C | 3 (2022–2025) | middelfart 30,7 km | nein — nie die nächste |
| Hesnæs Havn I (9030301) | 0 | – | – | 12 (2005–2016) | gedser 31,0 km | nein — liefert nicht |
| Nakskov I (31417) | 20 | 10 min | 8,6 °C | 4 (2022–2025) | langeland-bagenkop 31,1 km | nein — nie die nächste |

**Jahresgang.** Vier Stationen des Katalogs tragen in der Stichprobe mindestens fünf volle Jahre: Gedser Havn II,
Fredericia Havn II, Fynshav Havn II, Rødbyhavns Havn II. Für sie habe ich die Jahre 2014–2025 ganz geholt (je Station
144 Abrufe, je ein Monat in 10-min-Werten, ≈ 1,1 MB) und nach den Regeln der eigenen Ablage ausgewertet (volle Stunde,
Tag ab 18 Stundenwerten, Jahr ab 347 vollen Tagen): **9 bzw. 10 volle Jahre** je Station (§3.4). Esbjerg Havn II
(4 Stichprobenjahre) und Bagenkop Havn II (3) reichen nicht; „I“ und „II“ werden nicht zusammengelegt (zwei Geräte,
kein belegter Versatz).

### 1.5 Modell gegen Messung, gemeinsame Stunden des Laufs 18.11. 12 UTC

DKSS am Ort der Station (feinstes Teilmodell mit Wasser dort oder im Ring — ein Hafen ist im Modell Land) gegen die
Messung zur vollen Stunde, 12–18 UTC.

| Station | Teilmodell | Gitterpunkt ↔ Station | gemeinsame Stunden | DKSS − Messung, Mittel | σ | größte Abweichung |
|---|---|---|---|---|---|---|
| Leuchtturm Alte Weser (WSV) | `ws` | 0,56 km | 6 | **+0,18 K** | 0,36 | 0,65 K |
| Wilhelmshaven Neuer Vorhafen (WSV) | `ws` Ring | 1,45 km | 6 | **-2,03 K** | 0,30 | 2,47 K |
| Helgoland Binnenhafen (WSV) | `ws` | 0,95 km | 6 | **+0,06 K** | 0,06 | 0,11 K |
| Büsum (WSV) | `ws` | 0,85 km | 6 | **-0,27 K** | 0,05 | 0,33 K |
| Eider-Sperrwerk AP (WSV) | `ws` Ring | 1,68 km | 6 | **-0,78 K** | 0,14 | 1,03 K |
| Pellworm Anleger (WSV) | `ws` | 0,94 km | 6 | **-0,41 K** | 0,05 | 0,51 K |
| Husum (WSV) | `ws` Ring | 2,51 km | 6 | **-1,52 K** | 0,07 | 1,62 K |
| Wittdün (WSV) | `ws` Ring | 1,42 km | 6 | **-2,27 K** | 0,53 | 2,80 K |
| Hörnum (WSV) | `ws` Ring | 1,51 km | 6 | **-0,55 K** | 0,16 | 0,73 K |
| List auf Sylt (WSV) | `ws` | 1,08 km | 6 | **-0,57 K** | 0,08 | 0,71 K |
| D1 Hanskalbsand Oberfläche (WSV) | `ws` | 0,99 km | 6 | **-2,49 K** | 0,11 | 2,69 K |
| Rødbyhavns Havn II (DMI) | `idw` Ring | 0,55 km | 7 | **-1,88 K** | 0,04 | 1,92 K |
| Esbjerg Havn II (DMI) | `ws` | 0,81 km | 7 | **-1,35 K** | 0,17 | 1,58 K |
| Fynshav Havn II (DMI) | `idw` Ring | 0,48 km | 7 | **+0,12 K** | 0,10 | 0,25 K |
| Bagenkop Havn II (DMI) | `idw` | 0,26 km | 7 | **-2,65 K** | 0,05 | 2,71 K |
| Fredericia Havn II (DMI) | `lb` | 0,09 km | 7 | **-1,12 K** | 0,17 | 1,39 K |
| Gedser Havn II (DMI) | `idw` | 0,19 km | 7 | **-3,13 K** | 0,08 | 3,27 K |

Mittel über 17 Stationen: -1,22 K; Median -1,12 K; Spanne -3,13 … 0,18 K

**Befund.** An den Stationen im offenen Wasser trifft das Modell (Leuchtturm Alte Weser +0,2 K, Helgoland +0,1 K,
Fynshav +0,1 K, Büsum −0,3 K). In Häfen und im Watt liegt es **0,4 bis 3,1 K unter** der Messung (Gedser −3,1 K,
Bagenkop −2,7 K, Hanskalbsand in der Elbe −2,5 K, Wittdün −2,3 K, Wilhelmshaven −2,0 K). Sechs bis sieben Stunden eines
Abends sind keine Statistik (V-WT-1) — aber sie tragen den Satz, der an jedem Modellwert steht, und sie sind der Grund,
warum Messung und Modell nie zu einer Zahl werden.

### 1.6 Was daraus folgt

1. **Das Modell kommt über den Producer**, in der DMI-Linie (`sea-dmi.mjs`): die Schnittstelle listet die Läufe
   (`/instances`) und bindet eine Punktabfrage an einen Lauf (`/instances/<lauf>/position`). Damit ist „höchstens einmal
   je DKSS-Lauf“ wörtlich einzuhalten: je Teilmodell höchstens stündlich die Liste, je Spot eine Abfrage je Lauf.
2. **Die Messung liest der Browser direkt** (CORS offen an beiden Quellen), ein Abruf je Spotwahl, fünf Tage zurück.
3. **Der Abfragepunkt je Spot steht im Katalog** — einer eigenen Datei (E-WT-7), gebaut aus dieser Messung.
4. **Unter eigener Last antwortet das DMI wieder mit 429** (32-mal, als Messung und Jahresgang-Abruf nebeneinander
   liefen); Pause und drei Versuche des Producers bleiben.

## 2. Entscheidungen

| Nr. | Frage | Entscheidung |
|---|---|---|
| **E-WT-1** | Schalter | keiner — an für alle (Jan, Ausnahme zu Rule 2). Rückfall: `sea/v1/static/watertemp.json` im Daten-Repo löschen ⇒ die Seite zeigt keine Wassertemperatur, der Producer fragt nichts |
| **E-WT-2** | „in der Nähe“ einer Station | ≤ **20 km** (`set`, `WT_STATION_MAX_KM`) — dieselbe Bedeutung von „nahe“ wie beim BSH-Pegel der dänischen Spots (E-DK-2). Station, Messort und Entfernung stehen an jedem Wert. Mit 15 km fielen sechs Spots weg (St. Peter-Ording 15,1 km, Sylt Westerland 15,2, Als Kegnæs 15,9, Wangerooge 17,1, Schillig 18,5, Fehmarn Grüner Brink 18,9) |
| **E-WT-3** | Modellpunkt | der **nächste Gitterpunkt mit Wasser in jeder Stunde des Laufs** — der Zellpunkt in jedem Teilmodell, und wo das feinste dort keinen hat, sein nächster im Ring bis ≈ 4 km; bei gleichem Abstand (0,3 km) das feinere Teilmodell. Höchstens 5 km vom Spot (`set`). Grund: ein Punkt, der die halbe Zeit trockenfällt, ist kein „offenes Wasser“ |
| **E-WT-4** | Welche WSV-Station „am Spot“ misst | nur Stationen an **Nordsee, Jade, Weser, Elbe** und **kein Siel** (`set`, `WT_WSV_WATERS`). Gemessen am echten Fall: Wittenbergen läge sonst am Sperrwerk der Este (3,9 km, ein Nebenfluss hinter einem Tor) statt an der Station Hanskalbsand in der Elbe (5,8 km) |
| **E-WT-5** | Einmal je DKSS-Lauf | Liste der Läufe je Teilmodell höchstens stündlich (`SEA_WT_CHECK_MS`); gefragt wird nur ein Spot ohne Eintrag des neuesten Laufs. Ein Spot, dessen Abfrage scheitert, behält den Eintrag des Laufs davor (mit dessen eigener Laufzeit auf der Karte), solange dieser Lauf jünger als 24 h ist (`SEA_WT_STALE_MS`), und steht in `failed`; danach „keine Daten“. Nach drei Abrufen in Folge ohne Antwort fragt der Durchgang nicht weiter |
| **E-WT-6** | Schwelle | EINE Zahl für alle Spots (die Zahl des Nutzers, keine Eigenschaft eines Orts), „über“/„unter“ streng, eine Nachkommastelle, −2 … 35 °C; gemerkt in `localStorage` (`sea.wtemp.v1`), im Link `wt=over.18`. Linie im Diagramm, je ein Satz zur Messung und zum Modell. Keine Klasse, kein Eingriff ins Stundenband |
| **E-WT-7** | Wo der Katalog steht | eigene Datei `sea/v1/static/watertemp.json` (Muster E-DK-7): `spots.json` bleibt byte-gleich, die Seite in Produktion und der Producer auf `main` sehen bis zu Jans Push nichts davon |
| **E-WT-8** | Jahreskurve | nur an den vier DMI-Stationen mit ≥ 5 vollen Jahren aus EINER Quelle an EINER Station: je Kalendertag niedrigstes, mittleres, höchstes Tagesmittel der vollen Jahre, **ungeglättet**, ein Tag mit weniger als drei Jahren bleibt leer. Datei `sea/v1/static/wtemp-season.json`, einmal gebaut. Überall sonst „Verlauf seit ‹Datum›“ aus der eigenen Ablage |
| **E-WT-9** | Eigene Ablage | `sea-archive.mjs` legt alle 6 h die Stundenwerte der 18 Stationen des Katalogs ab (die nächste je Spot bis 40 km — eine Reihe lässt sich später nicht nachholen), dazu die Tagesreihe `wtemp-daily.json` (liest die Seite) und die Modelldatei je Lauf. Der erste Lauf holt 31 Tage nach ⇒ „Verlauf seit 19.10.2026“ |
| **E-WT-10** | Ort auf der Seite | Abschnitt „Wassertemperatur“ im Kapitel „Wasserstand“, unter den Pegelkarten; ohne das Kapitel (`?wl=0`) im Kapitel „Wetter“. Die bestehende Kachel „Wasser“ (Spanne aus dem amtlichen Mittelfristbericht) bleibt unverändert |
| **E-WT-11** | Edge-Bündel der Vorschau | nicht berührt: `seaLink.ts` und `seaSpotNames.ts` sind unverändert, `wt` steht nur in `seaState.ts` (nicht im Bündel) |

## 3. Umsetzung

| Datei | Rolle |
|---|---|
| `src/sea/seaWaterTemp.ts` (neu) | **Vertrag**, importiert nur `seaDmi.ts`: Quellen und Vermerke; Werteprüfung (−2,5 … 32 °C, `set`); Katalog `static/watertemp.json` + Regeln; Läufe (`dmiInstancesUrl`, `dmiNewestInstance`, `dmiInstancePositionUrl`); Produkt `sea-watertemp` (`wtEntry`, `seaWtProblems`, Zeiger `status.wtemp`); Messung (`wsvObsOf`, `dmiTwObsOf`, `wtLatest`, `wtHourly`); eigene Ablage (`wtDayStat`, `wtRecordOf`, `wtFullYears`); Jahresgang (`wtSeasonFromDays`, `wtSeasonOf`) |
| `src/sea/waterTemp.ts` (neu) | **Seitenlogik**, rein: Schwelle (Link, Speicher, Eingabe), `wtModelViewOf`, `wtObsViewOf`, Zeiträume und die beiden Sätze |
| `src/sea/waterTempClient.ts` (neu) | Leser: Katalog, Modelldatei, Messreihe live (10 min im Speicher), eigene Tagesreihe (raw aus `buscosun-archiv`), Jahresgang. Kein Rückfall von einer Quelle auf eine andere |
| `src/sea/useSeaWaterTemp.ts` (neu) | Zustand der Seite in einem Hook; ohne Katalog keine Ansicht |
| `src/sea/SeaWaterTempPanel.tsx` (neu) | **Karte**: zwei Hälften an einer Naht (links Messung, rechts Modell), Diagramm, Schwelle als Satz, Jahresgang oder „Verlauf seit“ |
| `src/sea/SeaWaterTempChart.tsx` (neu) | drei nivo-Diagramme, **eigener träger Chunk** (`lazy`): Verlauf mit Naht bei „jetzt“, eigene Tagesreihe, Jahresgang |
| `src/sea/SeaPage.tsx`, `SeaReadout.tsx`, `seaState.ts`, `seaDeck.css` | Zeiger `status.wtemp`, Hook, Abschnitt, zwei Einträge der Quellenliste, Link-Parameter `wt`, Stile `sw-wt-*` (vor dem Planer, mobil per Media Query) |
| `scripts/sea/sea-dmi.mjs` | **Producer**: `collectWaterTemp`, `buildWaterTemp`, `pruneWaterTemp`; `main` baut beide Produkte nacheinander, ein Fehler des einen hält das andere nicht auf, Exit ≠ 0 wenn eines scheitert; `--only=dmi|wtemp` |
| `scripts/sea/sea-archive.mjs` | `archiveWaterTemp` (Stundenwerte je Tag, nur anhängen; Tagesreihe), Modelldatei je Lauf, `--wtemp-days` |
| `scripts/sea/build-watertemp.mjs` (neu) | Katalogbauer aus der Messung (`buildWtCatalog`, `wtUsableStations`, lesbare Namen) |
| `scripts/sea/build-wtemp-season.mjs` (neu) | Jahresgang aus den vollen Jahren einer DMI-Station; Tageswerte je Station als Beleg unter `audit/seewetter-wassertemperatur/season/` |
| `scripts/verify-sea-watertemp.mjs` (neu), `scripts/lib/fixtures/sea/wt/`, `.gitattributes`, `scripts/sea/spike/wt-*.mjs` | Prüfer + 20 Fixtures (byte-gleich, `-text`), Messwerkzeuge. Nicht im CI-Gate eingetragen (Workflows von `buscosun-web` bleiben Jans Schritt) |
| `docs/API.md` §8.11 + §8.13, `docs/DATA_SOURCES.md`, `scripts/repack-repo/README.md`, `package.json` | Quellen, neue Dateien im Daten-Repo, Skript `verify:sea-watertemp` |

**Kein neuer Workflow-Schritt:** der Schritt „DMI“ in `sea.yml` ruft `sea-dmi.mjs` schon auf, der Archiv-Workflow
`sea-archive.mjs`; dessen Checkout (`scripts/sea`, `scripts/lib`, `src/sea`) genügt, weil der Vertrag nur aus `src/sea`
importiert (`verify:sea-watertemp` I13). Die Workflows in beiden Repos sind **unverändert**.

### 3.1 Gestaltung (Command-Deck, Skill `frontend-design`)

Ein Mittel trägt die Karte: **die Naht**. Links von ihr steht, was eine Station gemessen hat — in Tinte, wie jeder
Messwert auf dieser Seite; rechts, was das Modell rechnet — in Petrol, wie jede Vorhersagekurve. Jede Hälfte hat ihre
eigene Quellenzeile; fehlt eine Seite, steht das in ihrer Hälfte („keine Station in der Nähe“, „keine Daten“), in der
Größe eines Werts, und die andere füllt sie nie. Das Diagramm darunter wiederholt die Naht bei „jetzt“: links die
gemessenen fünf Tage, rechts die fünf Tage des Modells, dazwischen (Laufbeginn bis jetzt) beide — der Abstand zwischen
Hafen und Modell ist zu sehen statt verborgen. Die Schwelle ist ein Satz zum Ausfüllen wie beim Tidenfenster, ihre
Linie gestrichelte Tinte (die Zahl des Nutzers, keine Warnfarbe). Keine Großbuchstaben-Etiketten, keine neue Farbe,
keine Bewegung. Mobil dreht sich die Naht: Messung oben, Modell darunter; Eingabe, Umschalter und Links 44 px hoch.

### 3.2 Worte

Am Modellwert steht wörtlich „Modell für das offene Wasser, im flachen Uferwasser kann es wärmer oder kälter sein“. An
der Messung steht, wo gemessen wird: „im Hafen, WSV-Pegel Helgoland Binnenhafen (Nordsee), 1,8 km vom Spot“, „am
WSV-Pegel List auf Sylt (Nordsee)“, „im Hafen, DMI-Station Gedser Havn II“. Die Sätze zur Schwelle sagen nur, auf
welcher Seite der Zahl ein Wert liegt. Kein „sicher“, kein Rat zu Neopren, Baden oder Fisch (`verify:sea-watertemp`
G10, I10 — mit Gegenprobe).

### 3.3 Was bei fehlenden Daten steht

| Fall | Anzeige |
|---|---|
| kein Katalog im Daten-Repo | kein Abschnitt (Rückfall der Phase) |
| keine Modelldatei, Datei nicht lesbar, Kill-Schalter | Modellhälfte „keine Daten“ mit Grund |
| DMI lieferte den Spot nicht | „keine Daten“ mit DMIs eigenem Grund aus `failed` |
| Lauf des Eintrags älter als 24 h | „keine Daten“ — nie ein alter Lauf als Vorhersage |
| Stunde vor dem Lauf, hinter seinem Ende, Zelle trocken | kein Wert für diese Stunde, mit Grund |
| keine Station bis 20 km | Messhälfte „keine Station in der Nähe“ — „Das Modell steht nicht an ihrer Stelle.“ |
| Station antwortet nicht / letzter Wert älter als 2 h | „keine Messung“; ein alter Wert wird nur mit seiner Zeit genannt |

### 3.4 Jahresgang — was gebaut ist

| Station | Spots, die sie lesen | volle Jahre (≥ 347 volle Tage) | volle Tage 2014–2025 | 15.01. | 15.04. | 15.07. | 15.10. |
|---|---|---|---|---|---|---|---|
| Gedser Havn II (`dmi:31623`) | gedser (0,2 km) | 9: 2015, 2016, 2017, 2018, 2019, 2022, 2023, 2024, 2025 | 4156 | 2,2 / **3,5** / 5,6 | 6,7 / **8,1** / 9,1 | 17,4 / **18,6** / 19,8 | 11,3 / **12,7** / 13,5 |
| Fredericia Havn II (`dmi:23289`) | middelfart (7,6 km) | 9: 2015, 2016, 2018, 2019, 2021, 2022, 2023, 2024, 2025 | 4010 | 3,3 / **5,1** / 7,6 | 5,4 / **7,3** / 9,1 | 12,1 / **16,4** / 19,7 | 12,8 / **13,6** / 14,5 |
| Fynshav Havn II (`dmi:26459`) | als-kegnaes (15,9 km) | 10: 2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025 | 4135 | 2,5 / **4,1** / 5,7 | 3,8 / **6,5** / 7,6 | 16,4 / **17,8** / 22,4 | 11,8 / **13,2** / 14,6 |
| Rødbyhavns Havn II (`dmi:31574`) | fehmarn-gruener-brink (18,9 km) | 10: 2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025 | 4179 | 2,4 / **4,2** / 5,8 | 6,5 / **7,8** / 9,1 | 16,3 / **18,0** / 21,9 | 11,2 / **13,3** / 14,0 |

Zellen: niedrigstes / **mittleres** / höchstes Tagesmittel der vollen Jahre in °C. Der 29.02. ist an allen vier Stationen leer (weniger als drei Schaltjahre). Tageswerte je Station als Beleg: `audit/seewetter-wassertemperatur/season/dmi-<id>.json` (je 144 Abrufe, kein Monat ohne Antwort).

## 4. Gates (18.11.2026)

| Gate | Beleg |
|---|---|
| `verify:sea-watertemp` | **136/136** — A Fixtures byte-gleich (sha256, Gegenprobe gekipptes Bit); B Vertrag an echten Antworten (Läufe, an den Lauf gebundene Antwort, **Modellpunkt auf Land**, DMIs 429-Körper, Antwort eines anderen Laufs, Werteprüfung 41,5 °C / −3 °C, gekürzte Spalte); C Katalog = Messung von Schritt 0, **Spot ohne Station** (Binz, Warnemünde), Gewässer-Regel am echten Fall Wittenbergen, fünf Gegenproben auf die Regeln; D Producer gegen einen DMI-Nachbau (ein Abruf je Spot und Lauf, eine Stunde später nur die Lauf-Listen, neuer Lauf EINES Teilmodells ⇒ nur dessen Spots, 429 an einem Spot ⇒ dreimal versucht, Eintrag des Laufs davor bleibt bis 24 h, Land, 99 °C, falscher Lauf, DMI ganz aus ⇒ nach drei Abrufen Schluss und Speicher unverändert, Kill-Schalter, ohne Katalog kein Abruf, Aufbewahrung); E Messung (echte PEGELONLINE- und DMI-Reihe Wert für Wert, Ausdünnen an echten 1-min-Werten, Station mit tagealtem Wert, Station ohne Werte, HTML statt Reihe, **Werteprüfung** mit verfälschten Werten); F Seite ohne Browser (Modell zur Stunde, alle „keine Daten“-Fälle, **nie das Modell an der Stelle der Messung**, Leser mit 404/429/HTML); G **Schwelle** (Link, Adresse der Seite, Speicher, Eingabe, streng, Zeiträume am echten Lauf Stunde für Stunde nachgerechnet, Sätze, kein Rat — mit Gegenprobe); H Archiv (Stundenwerte je Tag, nur anhängen, ein abgelegter Wert wird nie ersetzt, Tagesreihe unabhängig nachgerechnet, Lücke heilt sich, Modelldatei je Lauf); S Jahresgang (Datei = Regel über die abgelegten Tageswerte, drei Kalendertage unabhängig nachgerechnet, 346 Tage sind kein volles Jahr, unter fünf Jahren keiner); R die Karte als Markup in acht Zuständen (esbuild + `react-dom/server`, kein Browser); I Quelltext (Hosts, kein `/grib`, kein Schlüssel, kein MARNET/CMEMS — mit Gegenprobe —, Vermerke wörtlich, kein Schalter, Diagramm träge geladen, Stile vor dem Planer) |
| Mutationsprobe (**Negativkontrolle** des Prüfers) | 14 gezielte Regelbrüche in Producer, Vertrag, Logik, Katalogbau und Archiv (jeden Spot jedes Mal fragen; alter Lauf bleibt ewig; fremder Lauf angenommen; Werteprüfung offen; alter Messwert gilt als aktuell; Stunde nimmt jeden Wert; Station jenseits der Grenze; veralteter Lauf gezeigt; Schwelle nicht streng; Este als Wasser des Spots; Archiv überschreibt; Jahresgang aus einem Jahr; ohne fünf Jahre; Spot ohne Modellpunkt zeigt trotzdem) — **jeder macht den Prüfer rot** (1–5 Prüfungen je Bruch) |
| ein lokaler Producer-Lauf | `sea-dmi.mjs --only=wtemp` gegen den echten Dienst, Speicher = Kopie von `sea/v1/static` + Katalog: **68 Abrufe** (4 Lauf-Listen + 64 Spots), 63 Einträge, einer ausgefallen (Schleimünde: „DMI 429 Too Many Requests: Server is busy“ nach drei Versuchen — das DMI drosselte nach der Messung des Abends), 29 639 B, **5 min 54 s**. Zweiter Durchgang sofort: kein Abruf („vor weniger als 60 min“). Dritter mit `--force`: **5 Abrufe** (4 Listen + der fehlende Spot), 64/64, 14 s — „einmal je DKSS-Lauf“ am echten Dienst. Lauf aller vier Teilmodelle 18.11. 12 UTC; Werte 0,8 … 11,4 °C, kein Spot mit Lücke |
| ein lokaler Archivlauf | `sea-archive.mjs --poi=0` auf einem frischen Stand von `buscosun-archiv`: 18 von 18 Stationen antworten, 31 Tage gefragt, **13 387 Stundenwerte** in 32 Tagesdateien, Tagesreihe 19 668 B, 11 s; erster voller Tag 19.10.2026 an jeder Station (§5) |
| bestehende `verify:sea-*` | contract **30** ✓ · text **35** ✓ · decode **13** ✓ · derive **70/70** · waterlevel **63/63** · tide-window **49** ✓ · wind-band **41** ✓ (nach V-WT-13) · planner **46/46** · dk **70/70** · current **108/108** · seo **23/23**. `verify:sea-ui` (Browser) **nicht gelaufen** — Jans Entscheidung, keine Browser-Prüfung; an HEAD stand er rot (V-TF-5) |
| `npm run typecheck` | 0 — im Arbeitsbaum und in einer sauberen Kopie „HEAD `e8ac2c02` + nur die Dateien dieser Phase“ (`git archive`) |
| `npm run build` | grün, 281/281 Prüfungen des SEO-Baus (Arbeitsbaum); `vite build` der sauberen Kopie grün |
| `npm run budget` | **grün an „HEAD + nur diese Phase“** nach Anheben von Hand mit Notiz in `budget.json`: totalJs **2 003,4 / 2 004** (Grenze 1 991 → 2 004). Gemessen am sauberen HEAD **1 990,4** ⇒ die Phase kostet **+13,0 KB** gzip: +9,5 im lazy `SeaPage`-Chunk, 3,7 im neuen, träge geladenen Chunk `SeaWaterTempChart`; eagerJs 114,6 / 115, eagerCss 2,4 / 2,5, largestChunk 278,4 / 302 unverändert. **Im Arbeitsbaum, wie er liegt, ist das Budget rot** (totalJs 2 004,2, eagerJs 114,8): dort liegt eine fremde, uncommittete Linie (Radar: `MapView.tsx`, `radolan*.ts`, `shareSchema.ts` …), die +0,8 KB beiträgt — nicht Teil dieser Phase und nicht in ihrem Commit |
| `verify:share` | **516/517** — rot genau SH6, die Bytegleichheit des Edge-Bündels (E-DK-8, Jans `npm run edge:share`); diese Phase ändert daran nichts (`seaLink.ts`, `seaSpotNames.ts` unberührt) |
| Sichtprüfung | **keine** — weder Bild noch Browser (Jans Entscheidung 18.11.). Die Fragen 2 (Desktop pixelgleich), 3 (Touch-Ziele am Gerät), 4 (Konsole) und 5 (Long Tasks) der Selbstverifikation sind damit **unbeantwortet**; Frage 1 (Funktionserhalt) nur am Quelltext und an den Prüfern: `SeaReadout` bekommt eine neue, optionale Eigenschaft; ohne Katalog rendert kein neues Element; die Kachel „Wasser“ ist unverändert. Gelesen habe ich die Karte nur als Text (`scripts/sea/spike/wt-card-text.mjs`) — das sagt etwas über die Worte, nichts über das Aussehen |

Geändert habe ich einen fremden Prüfer: `verify:sea-wind-band` brach an HEAD ab (V-WT-13).

## 5. Daten-Repos (nur `sea/`, ohne Force, je Push nachgeprüft)

| Repo | Commit | Inhalt | Prüfung nach dem Push |
|---|---|---|---|
| `buscosun-data` | `385bea5d` (18.11. 18:39:37 UTC) | `sea/v1/static/watertemp.json` (neu, 9 475 B: 64 Spots, 18 Stationen), `sea/v1/static/wtemp-season.json` (neu, 22 818 B: vier Stationen) | GitHub-API: genau diese zwei Dateien, beide `added`, ein Elternteil; raw `@385bea5d` sha256 gleich den lokalen Dateien (`1ef97ead…`, `7eed1c3d…`); jsDelivr `@385bea5d` 200 mit denselben Längen; raw `main` 200; `spots.json` (`32446b5d…`) und `spots-dk.json` (`cfac53f1…`) unverändert. Erster Versuch gelungen (frische Basis `origin/main`, kein Force, kein Rebase) |
| `buscosun-archiv` | `c23a4161` (18.11. 18:52:06 UTC) | 32 Tagesdateien `sea/v1/2026-10-18 … 2026-11-18/wtemp.json.gz` (13 387 Stundenwerte von 18 Stationen, ≈ 1,7 KB je Tag), `sea/v1/wtemp-daily.json` (neu, 19 668 B), `sea/v1/index.json` (je Tag `wtempStations`) | GitHub-API: 34 Dateien, alle unter `sea/`, 33 `added`, geändert nur `index.json`; raw sha256 der Tagesreihe und einer Tagesdatei gleich den lokalen; `index.json` trägt 45 Tage, 32 davon mit `wtempStations`, die Spot-Läufe des 18.11. stehen weiter darin; raw `main` der Tagesreihe: 200, `Access-Control-Allow-Origin: *`. Gepusht 9 min nach dem 18:43-Lauf des Archiv-Workflows (der nächste folgt 00:41 UTC), erster Versuch gelungen |

**Was diese Pushes bewirken, solange `buscosun-web` nicht gepusht ist:** nichts Sichtbares. Die Seite in Produktion und der
Producer auf `main` kennen die beiden statischen Dateien nicht; der Publisher von `sea.yml` legt den ganzen Speicher
zurück, die Dateien bleiben (wie `spots-dk.json`). Der Archiv-Workflow läuft bis zum Push mit dem alten Skript und
schreibt keine Wassertemperatur; **danach** fragt er beim ersten Lauf so viele Tage nach, wie seit dem 18.11. fehlen
(höchstens 31) — die Reihe bleibt lückenlos, wenn der Push vor dem 19.12. kommt.

**Nicht gepusht:** keine Modelldatei (`sea/v1/wtemp/…`) von der lokalen Maschine — der Producer auf `main` schreibt sie
im ersten 15-min-Lauf nach Jans Push (≈ 6 min für 64 Spots). Kein Workflow in beiden Repos geändert.

## 6. Befunde

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| **V-WT-1** | Das Modell lag am 18.11. an 13 von 17 Stationen 0,3 bis 3,1 K unter der Messung, an den vier Stationen im offenen Wasser traf es (±0,3 K). Ein Abend, 6–7 Stunden | Mehrwert: ein belastbarer Satz statt „kann wärmer oder kälter sein“, und die Frage, ob die Ostsee-Punkte systematisch zu kalt sind. Skizze: das Archiv legt ab heute Messung UND Modelldatei ab — nach 14 Tagen Bias und MAE je Station und Vorlauf (`sea-gate-d.mjs` um die Wassertemperatur erweitern) |
| **V-WT-2** | Der Producer stellt bei einem neuen Lauf aller Teilmodelle 64 Punktabfragen nacheinander (≈ 5–6 min, viermal am Tag) vor dem Veröffentlichen der Texte; unter Last antwortet das DMI mit 429 | Mehrwert: Texte und Warnlage erscheinen nie verzögert. Skizze: die EDR-Abfrage `cube` (ein Kasten je Teilmodell statt 64 Punkte) — vier Abrufe je Lauf; oder ein eigener Workflow-Schritt nach „Publish“ (Workflow, Jans Gate) |
| **V-WT-3** | Die Werteprüfung (−2,5 … 32 °C) erkennt keinen plausibel aussehenden Sensorfehler (Glückstadt 24,1 °C im November). Keine solche Station steht im Katalog | Skizze: eine Messung, die mehr als x K von der eigenen Tagesreihe der Vortage abweicht, als „auffällig“ kennzeichnen — erst mit zwei Wochen Ablage setzbar |
| **V-WT-4** | Welche der beiden DMI-Stationen eines Orts liefert, ist einmal gemessen (heute die „II“). Hört sie auf, zeigt der Spot „keine Messung“, obwohl die andere vielleicht liefert | Skizze: den Katalogbau monatlich nachmessen (wie V-DK-7) oder im Archivlauf melden, wenn eine Katalogstation drei Tage nichts liefert |
| **V-WT-5** | 41 von 64 Spots haben keine Messung — die ganze deutsche Ostseeküste. BSH-MARNET und CMEMS waren ausgeschlossen (Auftrag) | Mehrwert: Messung an Kiel, Travemünde, Warnemünde, Rügen. Skizze: Jans Entscheidung, ob eine weitere Quelle geprüft wird (Lizenz, Zugang, CORS) — eigene Phase |
| **V-WT-6** | Der Jahresgang ist statisch (volle Jahre bis 2025). Esbjerg Havn II hat vier Stichprobenjahre, Bagenkop Havn II drei | Skizze: `build-wtemp-season.mjs` jeden Januar mit `--to=<Vorjahr>` laufen lassen; Esbjerg wird 2027 das fünfte Jahr tragen |
| **V-WT-7** | `wtemp-daily.json` wächst mit ≈ 165 KB im Jahr (18 Stationen) und wird ganz gelesen | Skizze: je Station eine Datei, sobald sie 300 KB erreicht |
| **V-WT-8** | `status.wtemp.checkedAt` ändert sich stündlich — eine weitere Statusänderung je Stunde (vgl. V-DK-8: der Publisher committet ohnehin jeden Durchgang) | Skizze: zusammen mit V-DK-8 lösen (`gauges.at`, `wtemp.checkedAt` in die flüchtigen Schlüssel) |
| **V-WT-9** | Die Liste der Läufe (`/instances`) wiegt 100–200 KB je Teilmodell und wird stündlich gelesen (vier Abrufe) | Skizze: nur lesen, wenn nach der Uhr ein neuer Lauf da sein kann (Lauf + 6 h + gemessene 4–5 h Verzug) — spart etwa zwei Drittel |
| **V-WT-10** | Keine Zeile im Stundenband und keine Kartenebene für die Wassertemperatur; die Kachel „Wasser“ im Kapitel Wetter zeigt weiter die Spanne des amtlichen Mittelfristberichts | Skizze: die Kachel um den Modellwert des Spots ergänzen (zwei benannte Quellen nebeneinander) — Jans Entscheidung, ob das die Kachel überlädt |
| **V-WT-11** | An 19 Spots liegt der Modellpunkt nicht an der Wasserzelle des Spots, sondern bis 3,7 km entfernt (Watt, Land im Modell). Die Karte nennt den Abstand | — |
| **V-WT-12** | Die Messreihe eines 1-min-Pegels wiegt für fünf Tage ≈ 400 KB (gzip deutlich weniger) und wird je Spotwahl einmal geholt | Skizze: die Stundenwerte der letzten Tage in die Modelldatei des Producers legen (ein Abruf je Station und Lauf statt je Besucher) |
| **V-WT-13** | `verify:sea-wind-band` brach **an HEAD** ab (`Cannot read file … SeaCurrentPanel.ts`): der Prüfer bündelt `HEAD:src/sea/SeaBand.tsx` und löste dessen Importe nur als `.ts` auf; seit dem Commit der Phase ST importiert das Band den Driftpfeil aus `SeaCurrentPanel.tsx`. Kein Fehler der Seite. **Behoben** im Prüfer (`.ts`, sonst `.tsx`) — danach 41 ✓ | — |
| **V-WT-14** | Nach der Anhebung bleiben `totalJs` 0,6 KB Luft (2 003,4 / 2 004), `eagerJs` 0,4 KB. Die fremde Radar-Linie im Arbeitsbaum liegt mit +0,8 KB schon darüber | Skizze: der Vertrag `seaWaterTemp.ts` trägt Producer- und Seitenteile in einer Datei; die Texte der Karte ließen sich mit denen der Strömungs- und DMI-Karte teilen (≈ 1 KB). Die Ratsche hebt, wer als Nächstes committet, mit eigener Notiz |
| **V-WT-15** | Im lokalen Producer-Lauf fiel ein Spot von 64 mit 429 aus, obwohl nacheinander und mit 1,5 s Pause gefragt wurde — das DMI hatte an diesem Abend ≈ 2 000 Abrufe von dieser Adresse gesehen. Der nächste stündliche Durchgang holt genau diesen Spot nach (gemessen: 5 Abrufe) | Auf einem Runner mit nur der eigenen Last nicht zu erwarten; wenn doch: `failed` in `status.wtemp` beobachten (`MANUELLE-SCHRITTE.md` §95 Punkt 4) |
