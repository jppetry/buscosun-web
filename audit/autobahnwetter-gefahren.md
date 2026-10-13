# Autobahnwetter – Gefahren-Leiste und Detailansicht (AW-7, AW-8)

> Stand 13.10.2026, abgeglichen mit `audit/autobahnwetter.md` (Stand 06.10.) und `audit/autobahnwetter-datenpruefung.md`. Erweiterung zu `audit/autobahnwetter-plan.md` (Phase AW). Bei Widerspruch gilt für AW-7/AW-8 dieses Dokument, für alles andere der Plan und die Entscheidungen in `audit/autobahnwetter.md`.
> UI-Vorgabe: `reference/autobahnwetter-gefahren.dc.html` (Leiste), `reference/autobahnwetter-gefahren-detail.dc.html` (Detailansicht), Abschnitt „Gefahren-Leiste“ in `reference/README-autobahnwetter.md`.

## Ziel

Rechts am Rand steht eine Leiste, die **alle Autobahnabschnitte in DE, AT und CH nach wetterbedingten Gefahren** auflistet, für **jetzt und bis +6 h**. Ein Klick öffnet die **Detailansicht**, die in Sätzen und Bildern beschreibt, was auf der Fahrbahn liegt, woher das Wissen stammt und was niemand misst.

**Sechs Grundsätze** (gelten für Producer, Client und Texte):

1. **Jede Stufe ist eine Regel über benannten Eingängen.** Der Detailtext nennt Wert, Quelle und Zeit im selben Satz.
2. **Nachweis und Stufe sind getrennt.** Stufe 1–3 sagt, wie ausgeprägt; der Nachweis sagt, woher: gemessen, aus Messwerten abgeleitet oder Prognose. Die Zukunft ist nie „gemessen“.
3. **Fehlt ein Pflichteingang, heißt das „unbekannt“, nie Stufe 0** (D-04: keine Daten ≠ keine Gefahr).
4. **Ortsmerkmale lösen allein nichts aus.** Brücke, Wald, Steigung, Niederung senken dokumentierte Schwellen oder ergänzen den Text.
5. **Was niemand misst, heißt so.** Verkehrsdichte (Gischt), umgestürzte Bäume, Spurrinnen, Reifenzustand: nur Bedingungen, nie Ereignisse.
6. **Keine Warnsprache.** Stufen sind keine Warnstufen; amtliche Warnungen erscheinen nur wörtlich und nie als Stufe.

## Stand im Repo und Voraussetzungen

Phase AW läuft bereits: AW-0 bis AW-5, die Tagesablage AW-6a und die Streckenprognose AW-6.1/AW-6.1b sind live, `ROAD_LIVE = true` seit 03.10. Daraus folgt für AW-7/AW-8:

| Thema | Festlegung |
| --- | --- |
| Nummern | Entscheidungen dieser Erweiterung sind **E-AW-32 bis E-AW-37** (E-AW-1…31 sind vergeben), neue Verbesserungen ab **V-AW-47**, Arbeitspakete **AW-7/AW-8**, neue Gates **E** und **F** (A–D bestehen) |
| Schalter | Die Seite ist für alle an. Die Leiste bekommt einen eigenen Schalter `ROAD_HZ_LIVE = false` in `src/road/roadFlag.ts`, Reihenfolge `?roadhz=0` bzw. `1` > `localStorage.roadhz` > Konstante, wie bei `?road`. Ohne Schalter bleibt die rechte Spalte wie heute |
| Datenqualität | **D-1 bis D-4** aus `audit/autobahnwetter-datenpruefung.md` (falsche Frostgefahr aus Gerätefüllwerten, unmögliche Werte als gültig, Füllwert 21,6 mm/h, Anker aus defekten Sensoren) müssen behoben oder durch harte Regeln abgedeckt sein, bevor eine Gefahr mit Nachweis „gemessen“ oder „abgeleitet“ sichtbar wird. Sonst macht die Leiste aus einem defekten Sensor eine Stufe 3. Kriterium von Gate E |
| Geltungsbereich v1 | **nur DE**: die Korridore v1 enden an der Grenze (E-AW-12). AT/CH-Abschnitte der Vorlage sind Ausblick und kommen mit den AT/CH-Korridoren |
| Prognose-Eingänge | aus **`road/fc/v1`** (AW-6.1: buscosun Fusion je Achspunkt alle 5 km auf der OSM-Fahrbahn, 0–48 h stündlich, E-AW-17…21). Stützpunkte der Abschnitte sind diese Achspunkte; `static/points.json` trägt schon das Brücken-Merkmal. Fehlende Größen (z. B. Bewölkung, Schneefallgrenze, T850, Neuschnee, Gewitter- und Blitzpotenzial, MOSMIX-Sicht) ergänzt AW-7.1 additiv im Producer `scripts/road/road-forecast.mjs` |
| Zustand | Saisonzustand (erster Frost) im vorhandenen Producer-Zustand `road/v1/state.json` (E-AW-10), keine neue Datei |
| Archiv | AW-6a legt `road/v1` seit 03.10. in `buscosun-archiv` ab, die Stationsprognosen ebenfalls. Gate F hat damit Daten |
| Bezeichnungen | Prognosen nennen den Stand von buscosun Fusion, mit dem sie gebaut wurden (E-FR-1). Die Lufttemperatur der Anlagen heißt „Luft“, nicht „Luft 2 m“ – die Fühler hängen meist in 4–5 m (D-6) |

## Begriffe

| Begriff | Festlegung |
| --- | --- |
| Abschnitt | Autobahnstück zwischen zwei Anschlussstellen bzw. Knoten, 5–25 km (kürzere zusammengelegt, längere geteilt), Achse je Fahrtrichtung. Name „von – bis“ aus den Knotennamen (E-AW-32). ID stabil: `<Straße>-<km-Beginn>-<Richtung>`, z. B. `A8-034-R1` |
| Stützpunkt | Achspunkt aus `road/fc/v1/static/points.json` (alle 5 km, auf der OSM-Fahrbahn); dort liegen die Prognose-Eingänge, dort werden Radarwerte abgegriffen |
| Stufe | 1 = Anzeichen · 2 = Bedingungen erfüllt · 3 = ausgeprägt · `null` = unbekannt. 0 wird nicht angezeigt und ist keine Entwarnung |
| Nachweis | `m` gemessen (ein Sensor meldet den Zustand selbst) · `d` aus Messwerten abgeleitet (Regel über gemessenen Eingängen) · `p` Prognose bzw. Modellanalyse (DE ohne GMA im 10-km-Umkreis; AT/CH immer, sobald es dort Korridore gibt) |
| Fenster | Slot jetzt (15 min) und +1 … +6 h stündlich; Detail zusätzlich −2 h und −1 h aus dem 24-h-Ring |

## Gefahrenkatalog

Alle Schwellen sind `set`: begründete Startwerte, im Beobachtungsmodus protokolliert und nach Gate E/F kalibriert. GMA = Glättemeldeanlage (DWD), Tf = Fahrbahntemperatur, Td = Taupunkt, Cube = Prognosewerte von buscosun Fusion an den Stützpunkten (aus `road/fc/v1`, stündlich bis 48 h; fehlende Größen ergänzt AW-7.1), RV = DWD RADVOR, KONRAD3D = DWD-Zellverfolgung.

### Glätte

| ID | Stufe 1 | Stufe 2 | Stufe 3 | Eingänge jetzt | Eingänge +1 … +6 h |
| --- | --- | --- | --- | --- | --- |
| `reif` Reifglätte | Tf ≤ +1 °C und Tf − Td ≤ 1 K | Tf ≤ 0 °C und Tf < Td | Zustandscode Reif/Eis, oder Stufe 2 seit ≥ 2 Slots bei rF ≥ 90 % | GMA Tf, Td, rF, Zustandscode | bis Gate D: Persistenz der jetzigen Stufe, solange Cube-T2m am Abschnitt ≤ +1 °C bleibt; sonst Proxy aus Cube (T2m ≤ +1 °C, T2m − Td2m ≤ 1 K, clct ≤ 30 %, Wind < 3 m/s) = Stufe 1; ab Gate D: abgeleitete Tf aus AW-6.2, Regel wie jetzt |
| `nass` Überfrierende Nässe | Tf ≤ +2 °C, nass oder feucht, Trend ≤ −0,5 K/h | Tf ≤ +1 °C und nass (Wasserfilm > 0 oder Zustand nass/feucht) | Zustandscode Eis/Glätte, oder Tf ≤ 0 °C bei Wasserfilm ≥ 0,05 mm | GMA | bis Gate D: Persistenz wie bei `reif`; sonst T2m ≤ +1 °C und (jetzt nass gemessen oder Niederschlag ≥ 0,1 mm in 3 h) = Stufe 1; ab Gate D: AW-6.2 |
| `glatteis` Gefrierender Regen | Niederschlag ≥ 0,1 mm/h, T2m ≤ +1 °C, T850 ≥ +1 °C (warme Schicht über kalter Bodenschicht) | GMA: flüssiger Niederschlag (Bit 2, 4 oder 5) bei Tf ≤ 0 °C; Prognose: wie Stufe 1 mit T2m ≤ 0 °C und ≥ 0,5 mm/h | GMA Bit 3 „flüssig gefrierend“, oder Zustandscode Eis bei flüssigem Niederschlag | GMA Niederschlagsart, Tf | Cube t2m, t850, precip |
| `schnee` Schneeglätte | Schneefallgrenze ≤ Abschnittshöhe + 200 m bei Niederschlag ≥ 0,1 mm/h | Schneefall gemessen (Bit 6/7) bei Tf ≤ +1 °C, oder Neuschnee ≥ 1 cm/h | Zustandscode Schnee/Schneematsch, oder Neuschnee ≥ 5 cm in 6 h bei T2m ≤ 0 °C | GMA Niederschlagsart, Zustandscode | Cube snowlmt, precip; `runs/` snowfresh |

Ortsmerkmale Glätte: Brücke und Schattenlage (Wald, Einschnitt) senken bei `reif` und `nass` die Tf-Schwelle der Stufe 1 um 1 K und erscheinen im Text („Brücken kühlen schneller aus als die Strecke – dort steht keine Messung“). Steigung ≥ 4 % über ≥ 1 km und freie Lage mit Böen ≥ 40 km/h ergänzen bei `schnee` den Text (Lkw an Steigungen, Verwehungen); eine Dammlage ist nur bekannt, wo die DWD-Stationsliste sie als Streckenlage führt.

### Aquaplaning, Sicht, Wind

| ID | Stufe 1 | Stufe 2 | Stufe 3 | Eingänge jetzt | Eingänge +1 … +6 h |
| --- | --- | --- | --- | --- | --- |
| `aqua` Aquaplaning | Wasserfilm ≥ 0,5 mm oder Regenrate ≥ 5 mm/h | ≥ 1,0 mm oder ≥ 15 mm/h | ≥ 2,0 mm oder ≥ 25 mm/h | GMA Wasserfilm; RV-Rate an den Stützpunkten | +1/+2 h RV-Nowcast, danach Cube precip |
| `nebel` Nebel | Sicht < 300 m ohne Niederschlag bei rF ≥ 95 %; Prognose: MOSMIX-Sicht < 1.000 m an Station ≤ 20 km, oder Cube T2m − Td2m ≤ 1 K bei Wind < 3 m/s | Sicht < 150 m | Sicht < 50 m (Text: höchstens 50 km/h, § 3 Abs. 1 StVO) | GMA Sichtweite, rF, Niederschlag | MOSMIX `vis` (`point/stations`), Cube |
| `gischt` Gischt | Wasserfilm ≥ 0,2 mm oder Regenrate ≥ 2 mm/h | Wasserfilm ≥ 0,5 mm oder ≥ 5 mm/h | nie – Verkehr unbekannt | GMA, RV | Cube precip |
| `sonne` Tiefstehende Sonne | Sonnenhöhe 0–15°, Sonne ≤ 25° neben der Fahrtrichtung, Bewölkung clct ≤ 50 % | zusätzlich Fahrbahn nass oder feucht (Spiegelung) | nie | Sonnenstand (berechnet), Achse je 1-km-Stück, Cube clct, GMA Nässe | dieselben |
| `quer` Seitenwind, Sturmböen | Querkomponente c = Böe · \|sin(Windrichtung − Achse)\| ≥ 45 km/h | c ≥ 60 km/h, oder Böe ≥ 90 km/h aus beliebiger Richtung | c ≥ 75 km/h, oder Böe ≥ 100 km/h | GMA Böe und Richtung | Cube gust, Richtung aus u10/v10 |
| `baum` Bäume, umherfliegende Teile | Böe ≥ 75 km/h und Waldanteil ≥ 30 % im 50-m-Band | Böe ≥ 90 km/h | nie – Ereignisse werden nicht erfasst | GMA Böe, Ortsmerkmal Wald | Cube gust |
| `staub` Staub, Sand | Böe ≥ 55 km/h, Oberboden trocken (Bodenfeuchte wie im Brandradar), Acker ≥ 50 % im 1-km-Band, 72 h ohne Niederschlag | – | – | wie Stufe 1 | Cube gust, precip |

Ortsmerkmale Wind: Auf Brücken, Dammlagen und Waldschneisen gelten für `quer` um 10 km/h niedrigere Schwellen. `sonne` gilt je Fahrtrichtung, alle anderen Gefahren für beide. `nebel` zählt nur ohne Niederschlag; Sichtminderung durch Regen oder Schnee fällt unter `gischt` bzw. `schnee`. `staub` ist sehr selten (A 19 bei Rostock, 2011) und läuft bis zur Entscheidung E-AW-36 nur im Beobachtungsmodus, also nicht in der Leiste.

### Gewitter und Hagel, Hitze, Wetterwechsel

| ID | Stufe 1 | Stufe 2 | Stufe 3 | Eingänge jetzt | Eingänge +1 … +6 h |
| --- | --- | --- | --- | --- | --- |
| `gewitter` Gewitter | Gewitterpotenzial (`runs/` thunder) ≥ 40 oder Blitzpotenzial lpi ≥ 1 J/kg | KONRAD3D-Zelle ≤ 20 km, Zugbahn kreuzt den Abschnitt in ≤ 60 min | Zelle über dem Abschnitt, oder RV-Rate ≥ 25 mm/h | KONRAD3D, RV | +1/+2 h KONRAD3D-Zugbahn, danach thunder, lpi |
| `hagel` Hagel | thunder ≥ 60 und CAPE ≥ 1.000 J/kg | KONRAD3D-Zelle mit Hagelkennung (sofern das XML sie führt – AW-7.0) | GMA fester Niederschlag (Bit 6) bei Luft ≥ +5 °C („Hagel oder Graupel“) | KONRAD3D, GMA | thunder, cape |
| `blowup` Aufwölbung Betonplatten | nur bei bekanntem Betonbelag: Tmax ≥ 30 °C heute | Tmax ≥ 30 °C am zweiten Tag in Folge (Messung + Prognose) | ≥ 3 Tage in Folge oder Tf gemessen ≥ 50 °C | GMA Tf, Luft; Belag | Cube t2m |
| `frost1` Erster Frost | Prognose: Tf bzw. T2m ≤ 0 °C erstmals seit Saisonbeginn (1. August) | gemessen: Tf ≤ 0 °C erstmals seit Saisonbeginn | – | GMA Tf; Saisonzustand | Cube t2m |
| `sturz` Temperatursturz | ΔT2m ≤ −8 K in 6 h (Fenster −3 … +6 h) | ≤ −8 K mit Nulldurchgang | ≤ −12 K mit Nulldurchgang bei nasser Fahrbahn | GMA Luft | Cube t2m |

Reifenplatzer bei Hitze sind wettermäßig nicht messbar; sie stehen nur als Hinweis im Detailtext einer Hitze-Stufe. Betonbelag ist nur bekannt, wo die DWD-Stationsliste (`Streckenbelag`) oder OSM (`surface=concrete`) ihn nennt; ohne Belagsangabe gibt es keine `blowup`-Stufe, und die Detailansicht sagt das.

### Amtliche Warnungen

DWD-, GeoSphere- und MeteoSchweiz-Warnungen, deren Gebiet den Abschnitt schneidet, erscheinen in Leiste und Detail als Kennzeichen „amtliche Warnung“ mit wörtlichem Zitat (bestehender Warn-Layer, `dwdCapAlerts.ts`). Sie heben keine Stufe an und senken keine.

## Vom Messpunkt zum Abschnitt

- **Eingänge je Abschnitt:** gültige GMA im Abschnitt und bis 5 km davor/dahinter, Gitterwerte an allen Stützpunkten, Ortsmerkmale aus `segments.json`.
- **Stufe des Abschnitts** = Maximum über Messpunkte und Stützpunkte; **Nachweis** = der des maßgeblichen Punkts. Gleichstand: gemessen vor abgeleitet vor Prognose.
- **DE ohne gültige GMA im 10-km-Umkreis:** jetzt aus Cube bzw. Radar, Nachweis `p`, Text „keine Fahrbahnmessung“.
- **Messlücke:** Hat der Abschnitt eine GMA, deren Werte verworfen sind, und keine andere gültige im 10-km-Umkreis, ist jede fahrbahnabhängige Gefahr (Glätte, Aquaplaning) **jetzt unbekannt** statt aus dem Modell aufgefüllt; die Prognose ab +1 h bleibt. Der defekte Sensor soll sichtbar bleiben.
- **AT/CH:** immer Nachweis `p`, Anker-Stationen (TAWES, SwissMetNet) nur für Luftwerte im Text.

## Datenvertrag

Rechnet der Derive im Radar-Spiegel (E-AW-33), direkt nach dem `obs/`-Slot: Er verbindet den Slot mit dem jüngsten Lauf aus `road/fc/v1` (Prognose-Eingänge je Stützpunkt, stündlich) und den Radar-Produkten RV und KONRAD3D aus `radar/`. Der Client müsste sonst für Hunderte Abschnitte rechnen.

```
road/v1/hz/<YYMMDDHHMM>.json      Gefahren je Abschnitt, nur Abschnitte mit Stufe ≥ 1 oder null
road/v1/static/segments.json      Abschnitte, Achsen je Richtung, Stützpunkte, Ortsmerkmale, Quellen/Lizenzen
road/v1/state.json                vorhanden (Producer-Zustand, E-AW-10); neu darin: Saisonzustand je Abschnitt (erster Frost)
```

```json
{
  "v": 1, "slot": "2611150615", "made": "2026-11-15T06:21:40Z",
  "hours": ["2026-11-15T05:15Z", "…", "2026-11-15T11:15Z"],
  "inputs": { "obs": "2611150615", "fc": { "run": "2611150531", "fusion": 9 }, "rv": "2611150615", "konrad": "2611150610" },
  "missing": [],
  "seg": {
    "A8-034-R1": {
      "lv": { "reif": [3, 3, 2, 1, 0, 0, 0], "sonne": [0, 0, 2, 1, 0, 0, 0] },
      "ev": { "reif": "mpppppp", "sonne": "ppppppp" },
      "why": { "reif": ["code:Reif@<GMA-Kennung>", "Tf:-1.4", "Td:-0.6", "rF:90"], "sonne": ["elev:6.8", "daz:14", "clct:20", "wet:1"] },
      "dir": { "sonne": 1 }
    }
  }
}
```

`lv` und `ev` haben je Gefahr 7 Einträge (jetzt, +1 … +6 h); `null` heißt unbekannt. `why` trägt die maßgeblichen Eingänge mit Wert, damit Detailtext und Diagnose dieselbe Begründung zeigen. Aufbewahrung wie `obs/` (höchstens 3 h, mindestens 2 Slots). Größenbudget im Spike messen; dünn besetzt erwartet: ein typischer Wintermorgen mit einigen Hundert Einträgen, also deutlich unter 1 MB je Slot.

## Validierung – die vier Sperren, erweitert

Ein Vertrag `src/road/roadHazards.ts`, den Derive, Client und Verifier importieren (Muster `roadContract.ts`): Gefahren-IDs, Stufen, Nachweise, Schwellen, Eingangsalter, Kill-Switch.

| Ebene | Regel | Folge |
| --- | --- | --- |
| Eintrag | ID im Katalog, Stufe ∈ {0, 1, 2, 3, null}, Nachweis ∈ {m, d, p}; `m` nur in Stunde 0; Stufe 3 für `gischt`, `sonne`, `baum` unmöglich; Stufe 3 mit Nachweis `p`, solange die Deckelung gilt (E-AW-34) | Slot nicht veröffentlicht (Programmfehler) |
| Eintrag | jede Stufe ≥ 1 hat `why` mit mindestens einem Eingang, dessen Zeit ≤ Slot ist | Eintrag verworfen, Bilanz |
| Eingang | Alter: obs ≤ 45 min, RV und KONRAD3D ≤ 15 min, `road/fc`-Lauf ≤ 3 h (stündlicher Job, E-AW-19) | betroffene Gefahren `null`, Eingang in `missing` |
| Konsistenz | Hitze-Stufe bei T2m < 25 °C; Schnee Stufe 3 bei T2m > +6 °C ohne Messcode; Nebel Stufe 3 ohne Sicht < 50 m (gemessen oder prognostiziert); Glätte gemessen ohne GMA im Abschnitt | Slot nicht veröffentlicht (Programmfehler) |
| Statistik (Beobachtungsmodus) | Anteil Abschnitte mit Stufe ≥ 1 über 60 %; Sprung der Abschnittszahl je Gefahr gegenüber dem Vorslot über das Dreifache | nur Bilanz in `status.json`, Wächter-Hinweis |
| Slot | `hz` nur, wenn der `obs`-Slot veröffentlicht wurde; sonst bleibt der letzte gute `hz`-Slot | – |
| Client | Schema, Alter (> 45 min grau, > 3 h „Gefahrenlage derzeit nicht verfügbar“), eigener Kill-Switch `hazards` getrennt von dem der Messungen | Anzeige gesperrt, Messungen bleiben |
| Wächter | `npm run health`: `hz`-Alter, `missing` leer, Bilanz unauffällig | Fehlermail |

**Verifier `verify:road-hazards`:** Szenario-Fixtures je Gefahr mit erwarteter Stufe und erwartetem Nachweis – Reifnacht, Warmfront mit gefrierendem Regen, Nebelmorgen im Becken, Sturm auf einer Talbrücke, Sommergewitter mit KONRAD3D-Zelle, Hitzewelle auf Beton, erster Frost, tiefe Sonne (Sonnenstand gegen drei NOAA-Referenzwerte, Toleranz 0,5°), Eingang fehlt → `null`, Messlücke → `null` statt Modell. Dazu **goldene Texte** für den Detailtext (eine Datei je Szenario).

## Detailtext (`roadNarrative.ts`)

Regelbasierte Satzbausteine, kein Sprachmodell. Reihenfolge: 1) Zustand der Fahrbahn jetzt mit Wert, Quelle, Uhrzeit; 2) warum (Taupunkt, Niederschlag, Wind); 3) Ortsmerkmale ohne Messung; 4) Ausblick bis +6 h mit „laut Prognose“; 5) was nicht messbar ist, wenn eine betroffene Gefahr es berührt. Beispiele stehen als Beispieldaten in der Vorlage, etwa:

> Auf der Fahrbahn liegt Reif. Die Glättemeldeanlage Irschenberg meldet um 06:15 den Zustand „Reif“ bei −1,4 °C Fahrbahntemperatur; der Taupunkt liegt mit −0,6 °C darüber, die Luftfeuchte schlägt sich als Eis nieder.

Verboten: Imperative und Alarmwörter („Achtung“, „Gefahr!“, „unbedingt“); Entwarnungen („frei“, „sicher“); Zahlen ohne Quelle. Erlaubt: Tatsachen mit Rechtsbezug (§ 3 StVO bei Sicht < 50 m).

## AW-8: Oberfläche

**Rechte Spalte (400 px, ≥ 1440 px Breite), hinter `ROAD_HZ_LIVE` bzw. `?roadhz=1`:** Reiter Gefahren · Strecke · Quellen. „Gefahren“ ist voreingestellt und hat zwei Zustände: **Lage** (die Leiste) und **Detail** (ein Abschnitt). Der bisherige Reiter „Station“ geht in der Detailansicht auf (Abschnitt „Messpunkte und Anker“; ein Klick auf einen Messpunkt der Karte öffnet das Detail seines Abschnitts).

**Lage:** Kopf mit Zahl der Abschnitte und Zeitraum-Schalter Jetzt / Bis +6 h · Lage-Matrix 7 Gefahrengruppen × jetzt … +6 h (Zahl = Abschnitte, Farbe = höchste Stufe, Zelle = Filter auf Gruppe und Stunde) · Filter-Chips mit Zählern · Liste nach Gruppe in fester Reihenfolge (Glätte, Aquaplaning, Sicht, Wind, Gewitter/Hagel, Hitze, Wetterwechsel), in der Gruppe nach Stufe, dann Nachweis, dann Gefahrenrang; unbekannte Einträge zuletzt, schraffiert. Zeile: Stufenbalken, Schild, „von – bis“, Gefahr · km · Richtung, 7-Stunden-Streifen, „seit/ab/bis“, weitere Gefahren, Stufen-Chip, Nachweis. Leere Gruppe: „Keine Abschnitte erkannt. Das ist keine Entwarnung.“

**Detail:** Kopf mit Zurück, Position „n / N“ und Vor/Zurück · Karte mit Schild, Name, km, Länge, Höhe, Fahrtrichtung, Chips der aktiven Gefahren · Querschnitt „Was auf der Fahrbahn liegt“ (Luft, Taupunkt, Belagsschicht Reif/Eis/Wasserfilm/Schnee/feucht/trocken/unbekannt/nicht gemessen, Fahrbahntemperatur) mit Detailtext · Gefahren-Fahrplan −2 … +6 h · Fahrbahn, Luft und Taupunkt −12 … +6 h mit Reif-Fläche · Messgrößen gegen Schwellen · Wind zur Fahrbahnachse · Ortsmerkmale · Messpunkte und Anker · amtliche Warnung wörtlich · „Nicht messbar“ · Herkunft.

**Karte:** Abschnitte als Linie in Stufenfarbe über dem Korridor (gewählter Zeitraum und Filter), unbekannt gepunktet grau, gewählter Abschnitt mit hellem Saum; Hover in der Liste hebt hervor, Klick auf der Karte öffnet das Detail. Ein gemeinsamer Zeitzustand (stündlich 0 … 6) für Karte, Band, Matrix und Detail; der Zeitregler der Karte wird stündlich.

**Mobil (≤ 767 px):** Bottom-Sheet mit Reitern Gefahren / Strecke; Matrix waagerecht scrollbar mit fester Gruppenspalte; Detail als Vollbild-Sheet mit Zurück; Zeilen ≥ 44 px hoch.

**Bedienung und Zugänglichkeit:** Zeilen und Zellen sind `button`; ↑/↓ in der Liste, Enter öffnet, Esc schließt; Fokus springt auf die Detailüberschrift. Jede Grafik hat `role="img"`, eine Kurzbeschreibung und daneben eine visuell versteckte Tabelle mit denselben Zahlen. Stufen sind nie nur Farbe: Zahl im Chip, Muster für unbekannt, Form für den Nachweis (gefüllt, halb, Ring). `prefers-reduced-motion` schaltet nivo-Animationen ab.

### nivo

Jan wünscht ausdrücklich nivo. Neu sind drei Pakete, **exakt in der Version des vorhandenen `@nivo/line`** (alle `@nivo/*` müssen dieselbe Version haben); ein Upgrade der vorhandenen nivo-Pakete bleibt STOPP-Zone. Stand 13.10.2026 ist 0.99.0 die aktuelle Version von `@nivo/heatmap`.

| Element | Umsetzung | Hinweise |
| --- | --- | --- |
| Lage-Matrix | `@nivo/heatmap` (`ResponsiveHeatMap`) | Zeilen = Gruppen, Spalten = Stunden; Zellwert = Anzahl, Farbe über eigene Funktion aus der höchsten Stufe (nicht aus der Anzahl); eigene `cellComponent` für Schraffur bei unbekannt; `onClick` setzt Filter; `hoverTarget="rowColumn"` |
| Gefahren-Fahrplan | `@nivo/heatmap` | Zeilen = Gefahren des Abschnitts, Spalten −2 … +6 h; `cellComponent` zeichnet die Nachweisform; eigene Ebene für den Jetzt-Rahmen |
| Fahrbahn, Luft, Taupunkt | `@nivo/line` (vorhanden) | Mess- und Prognoseteil als getrennte Serien, Prognose gestrichelt über eine eigene Linien-Ebene; `markers` für 0 °C und jetzt; eigene Ebene „Reif-Fläche“ (Tf ≤ 0 °C und Tf < Td); `enableSlices="x"` |
| Messgrößen gegen Schwellen | `@nivo/bullet` | `ranges` = Stufengrenzen, `measures` = jetzt, `markers` = Prognose-Extrem bis +6 h; eigene `rangeComponent` in Stufenfarben; Temperatur und Sicht mit umgekehrter Achse (ungünstig = rechts) |
| Wind zur Fahrbahnachse | `@nivo/polar-bar` | `indexBy` = 8 Sektoren, Wert = Böe, Farbe = Stufe der Querkomponente; Fahrbahnachse und Wind jetzt als eigene Ebene; erlaubt die API keine eigenen Ebenen, ein absolut positioniertes SVG darüber |
| 7-Stunden-Streifen je Zeile | **kein nivo** | 7 `span` – Hunderte Chart-Instanzen kosten zu viel |
| Querschnitt der Fahrbahn | **kein nivo** | eigenes SVG `RoadCrossSection.tsx` nach Vorlage |

Ein Theme `roadNivoTheme.ts` übersetzt die `--aw-*`-Tokens und die Schriften aus `src/fonts.css` (keine Google-Fonts-Anfrage). Laden: Leiste mit `@nivo/heatmap` im `road`-Chunk; `@nivo/bullet`, `@nivo/polar-bar` und die Detail-Diagramme erst beim Öffnen eines Details (`React.lazy`). `npm run budget`: eagerJs unverändert; Größe des `road`-Chunks und des Detail-Chunks in AW-8.0 messen und als Grenze eintragen.

### Neue Tokens (additiv, `src/designTokens.css`)

| Token | Wert | Bedeutung |
| --- | --- | --- |
| `--aw-sev-1` | `#E6C46F` | Stufe 1 (Text darauf `#4A3A12`) |
| `--aw-sev-2` | `#E0822F` | Stufe 2 (Text darauf `#2C1A0A`) |
| `--aw-sev-3` | `#B5321F` | Stufe 3 (= `--aw-ice`, Text darauf `#FFFFFF`) |
| `--aw-sev-0` | `#EFE9DA` | keine Stufe in dieser Stunde (Streifen, Matrix) |
| Chips | Stufe 1 `#FBF5E2 / #E9D9A8 / #6B5212` · Stufe 2 `#FBEFE3 / #EBC39C / #7A4520` · Stufe 3 `#FBE9E4 / #E8C9BD / #8A1C1C` · unbekannt schraffiert `#EDE6D3/#F5F1E8`, Rahmen `#D9D0B8`, Text `#5C5447` | Fläche / Rahmen / Text |

## Arbeitspakete

```
AW-0…AW-6.1 (live)  ──▶ AW-7.0 Spike ──▶ AW-7.1 Abschnitte ──▶ AW-7.2 Regeln ──▶ AW-7.3 Derive ──▶ (E)
                                          segments.json         roadHazards.ts      hz/ im Spiegel      7 Tage Schatten
AW-5 (Seite) ───────────────────────────────────────────────▶ AW-8.1 Leiste ──▶ AW-8.2 Detail ──▶ AW-8.3 Karte, Zeit, Mobil ──▶ (C+)
                                                                Fixtures bis (E)                                         Seite mit Leiste
                                                                                                         später ──▶ (F) Backtest Prognose-Stufen
```

| AP | Inhalt | Ergebnis |
| --- | --- | --- |
| AW-7.0 Spike | Stand von D-1…D-9 aus der Datenprüfung (06.10.) im Code und im Live-Slot; welche Größen `road/fc/v1` schon trägt; Führt das KONRAD3D-XML eine Hagelkennung? MOSMIX-Sichtstationen ≤ 20 km je Abschnitt (Abdeckung in %), PNG-Lesen von `runs/` im Node-Derive ohne neue Abhängigkeit (`node:zlib`), Knotennamen und Brücken aus OSM für DE/AT/CH, Höhenmodell (DE: BKG DGM200, dl-de/by-2.0; AT/CH: Lizenz klären, sonst keine Steigung), Größenbudget `hz/` | `audit/autobahnwetter.md`, Abschnitt AW-7 |
| AW-7.1 Abschnitte und Eingänge | `scripts/road/build-segments.mjs`: Abschnitte auf den Korridoren aus `static/corridors.json`, Achsen je 1 km, Stützpunkte = Achspunkte aus `road/fc`, Ortsmerkmale (Brücke, Wald, Steigung, Niederung, Belag, Höhe), Quellen und Lizenzen je Feld; fehlende Prognose-Größen additiv in `road-forecast.mjs` | `road/v1/static/segments.json`, erweiterter `road/fc`-Lauf |
| AW-7.2 Regeln | `src/road/roadHazards.ts` (Katalog, Schwellen `set`, Aggregation, Prüfer), Sonnenstand (NOAA), `roadNarrative.ts`, Fixtures, `verify:road-hazards` | Verifier grün |
| AW-7.3 Derive | Kindprozess nach dem `obs`-Slot, `hz/` und Saisonzustand in `state.json` atomar, Bilanz in `status.json`, Wächter erweitert | Schattenbetrieb läuft |
| AW-8.1 Leiste | `RoadHazardPanel.tsx`, `RoadHazardMatrix.tsx`, Liste, Filter, Zeitraum, Kill-Switch | Pixelvergleich Leiste |
| AW-8.2 Detail | `RoadHazardDetail.tsx`, `RoadCrossSection.tsx`, vier nivo-Diagramme, Detailtext, Tastatur | Pixelvergleich Detail |
| AW-8.3 Karte, Zeit, Mobil | Abschnitts-Layer in `RoadMap.tsx`, gemeinsamer Zeitzustand, Bottom-Sheet | iPhone 12 Pro, `verify:road-ui` erweitert |

| Gate | Kriterium | Beleg |
| --- | --- | --- |
| E – Gefahren-Schatten | D-1 bis D-4 erledigt; 7 Tage `hz/` bei `ROAD_HZ_LIVE = false`: keine Konsistenzverletzung, `missing` ≤ 2 % der Slots, Stichprobe von 50 Einträgen je Stufe ≥ 2 von Jan oder Claude gegen Messwerte geprüft ohne Fehlbegründung | `status.json`-Reihe, Stichproben-Protokoll |
| C+ – Leiste live | wie Gate C, dazu beide neuen Vorlagen im Pixelvergleich, Tastaturbedienung, Erstanzeige der Leiste < 1,5 s auf Desktop | Screenshots, Verifier |
| F – Prognose-Stufen | Backtest ≥ 30 Tage: Stufe ≥ 2 für `nebel`, `quer`, `schnee`, `aqua` je Vorlauf gegen spätere GMA-Messung, Treffer- und Fehlalarmquote, Pflicht-Baseline Persistenz; Daten aus der Tagesablage AW-6a | Backtest-Report |

**Deckelung (E-AW-34):** Bis Gate F – für fahrbahnabhängige Glätte bis Gate D (AW-6.2) – sind alle Stufen mit Nachweis Prognose auf Stufe 2 begrenzt, und die Leiste sagt das („Prognose-Stufen in Erprobung, höchstens Stufe 2“). Das gilt auch für „jetzt“ in AT/CH, weil dort jede Aussage Modell ist.

## Entscheidungen

| Nr. | Frage | Optionen | Empfehlung |
| --- | --- | --- | --- |
| E-AW-32 | Wie entstehen Abschnitte? | Knoten zu Knoten (OSM `highway=motorway_junction`, ODbL) auf den Korridor-Achsen · feste 10-km-Stücke | Knoten zu Knoten mit 5–25-km-Regel; Namen aus OSM, Quellenvermerk „© OpenStreetMap-Mitwirkende, ODbL“; `segments.json` selbst unter ODbL |
| E-AW-33 | Wo wird gerechnet? | Derive im Spiegel · Client | Derive: Eingänge liegen im Klon, ein Rechenweg für alle Nutzer, prüfbar vor der Veröffentlichung |
| E-AW-34 | Prognose-Stufen vor Gate F? | gedeckelt auf Stufe 2 mit Hinweis · ausblenden | gedeckelt anzeigen – Jan wünscht +6 h, die Deckelung hält die Aussage ehrlich |
| E-AW-35 | Neue Abhängigkeiten | `@nivo/heatmap`, `@nivo/bullet`, `@nivo/polar-bar` in der vorhandenen nivo-Version · eigene SVG-Diagramme | die drei nivo-Pakete, von Jan mit diesem Auftrag gewünscht; kein Upgrade |
| E-AW-36 | Staub, Sand | Beobachtungsmodus · in der Leiste | Beobachtungsmodus, bis ein beobachteter Fall die Regel bestätigt |
| E-AW-37 | Rechte Spalte | Gefahren-Leiste als Standard, Station im Detail · Leiste als vierter Reiter | Gefahren-Leiste als Standard: die Frage „wo ist es gefährlich?“ kommt vor „was misst Station X?“ |

## Quellen und Lizenzen (zusätzlich zum Plan)

| Quelle | Verwendung | Lizenz |
| --- | --- | --- |
| OpenStreetMap | Knotennamen, Brücken, Wald, Belag (`surface=concrete`), Acker | ODbL 1.0, Quellenvermerk, abgeleitete Datenbank unter ODbL |
| BKG DLM250 | Achsen DE, Gewässer (Niederung) | dl-de/by-2.0 |
| BKG DGM200 | Steigung DE | dl-de/by-2.0 |
| DWD MOSMIX (`point/stations`) | Sichtweite +1 … +6 h | wie in `point/sources.json` des Daten-Repos geführt |
| DWD RADVOR RV, KONRAD3D (`radar/`) | Regenrate, Zellen | CC BY 4.0 laut Daten-Repo-README |
| buscosun Fusion (`point/`, `runs/`) | T2m, Td2m, Wind, Böen, Niederschlag, Schneefallgrenze, Bewölkung, T850, Gewitter- und Blitzpotenzial, Neuschnee, CAPE | Lizenzen der Eingangsmodelle wie im Daten-Repo |
| nivo | Diagramme | MIT |
