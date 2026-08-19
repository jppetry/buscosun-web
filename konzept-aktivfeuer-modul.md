# Konzept: Modul Aktiv-Feuer-Größe (AF)

**Kontext:** DACH-Waldbrand-Dashboard · MapLibre GL JS · statischer Objektspeicher · kein Backend · Verarbeitung in GitHub Actions
**Voraussetzung:** FIRMS-Ingest und Hotspot-Clustering bestehen bereits
**Schwestermodul:** `konzept-brandflaechen-modul.md` (BA) — die beiden Module sind über eine Kalibrierungsschleife gekoppelt (§6)
**Stand:** August 2026

---

## 1. Zielsetzung und Abgrenzung

### Der zentrale Befund vorweg

**Die Fläche eines aktiven Feuers lässt sich aus FIRMS-Daten nicht messen.** Ein Detektionspixel sagt aus, dass in ihm zum Überflugzeitpunkt eine Wärmeanomalie über der Schwelle lag — nicht, wie groß das Feuer war. Bei einem realen 1-ha-Brand liegt die Pixelgrundfläche um Faktor 14 (VIIRS Nadir) bis Faktor 1000 (MODIS Swath-Rand) daneben.

Alles, was dieses Modul liefert, ist entweder eine **Intensitätsgröße** (quantitativ belastbar), eine **Geometrie mit klarer Semantik** (kein Flächenmaß) oder eine **Schätzung mit Intervall** (erst nach Eigenkalibrierung, §6).

Wer das Modul als „Flächenmessung für laufende Brände" beschreibt, verspricht etwas, das die Datengrundlage nicht hergibt.

### Was das Modul tut

| Ausgabe | Charakter |
|---|---|
| Detektionsumring | Geometrie, **kein Flächenmaß** |
| FRP-Aggregate (MW) | quantitativ belastbar |
| FRE (MJ) und Biomasse | quantitativ belastbar bei ausreichender Abtastung |
| Aktivitätszustand (wachsend/stabil/abklingend) | qualitativ, robust |
| Ausbreitungsrichtung | qualitativ, mit Windabgleich plausibilisiert |
| Flächenschätzung mit Intervall | erst nach Kalibrierung aus der BA-Linie |

### Was das Modul ausdrücklich nicht tut

- **Keine Sub-Pixel-Retrieval.** Die Dozier-Bispektralmethode und ihre Weiterentwicklungen (Giglio & Kendall 2001, Peterson & Wang 2013) liefern prinzipiell Feuerfläche und -temperatur, brauchen aber Level-1B-Radianzen (VNP02/VJ102, MOD021KM). Die FIRMS-Standardfelder genügen nicht. Zudem ist das Verfahren nur im Bereich T ≈ 600–1200 K und Feueranteil > 0,0005 gültig und extrem empfindlich gegen die geschätzte Hintergrundtemperatur. Ohne Backend nicht umsetzbar.
- **Keine Übernahme publizierter FRP→Flächen-Beziehungen.** Sie stammen aus mediterranen, borealen und tropischen Regimen mit anderen Brennstoffen und Feuergrößen. Die Streuung ist erheblich. Ungeprüft übertragen erzeugen sie eine Scheingenauigkeit.
- **Keine Aussage „erloschen" allein aus fehlender Detektion.** Siehe §5.6.

### Verhältnis zum BA-Modul

Die beiden Module beantworten verschiedene Fragen zum selben Ereignis:

| | AF (dieses Modul) | BA (Schwestermodul) |
|---|---|---|
| Frage | Wie stark brennt es gerade? | Wie groß war die Fläche? |
| Datenquelle | FIRMS | Sentinel-2 |
| Latenz | ~3 h | Median 3–5 Tage |
| Ergebnis | Intensität, Umring, Schätzung | gemessene Fläche |

AF läuft sofort und dauernd, BA läuft verzögert und einmalig. AF liefert BA den Trigger und das AOI; BA liefert AF die Kalibrierungslabels. Die Kopplung ist bidirektional und in §6 beschrieben.

---

## 2. Schnittstelle

### Eingang (vom Cluster-Modul)

```json
{
  "event_id": "de-2026-0817-001",
  "source": "firms",
  "detections": [
    { "lat": 51.4231, "lon": 13.2807,
      "scan": 0.42, "track": 0.38,
      "sat": "VIIRS_NOAA20", "daynight": "D",
      "acq": "2026-08-15T12:41:00Z",
      "frp": 8.4, "confidence": "nominal",
      "bright_ti4": 331.2, "bright_ti5": 295.7 }
  ],
  "t_start": "2026-08-15T12:41:00Z",
  "t_end":   "2026-08-16T01:12:00Z"
}
```

**Pflichtfelder:** `lat`, `lon`, `scan`, `track`, `sat`, `acq`, `frp`, `confidence`, `daynight`.

`scan`/`track` sind nicht optional — ohne sie ist weder die Pixelgrundfläche noch der Geolokationspuffer bestimmbar. `daynight` wird für die FRP-Normalisierung gebraucht (§5.3).

Das Modul erhält **alle** Detektionen des Ereignisses, nicht nur die neuesten. Zeitreihenmaße lassen sich sonst nicht bilden.

### Ausgang

Das Modul schreibt in denselben `FireRecord`, den das Panel liest. Die Felder, die es setzt:

```
envelope            Geometrie (GeoJSON Polygon)
envelopeAreaHa      Fläche des Umrings — NICHT die Brandfläche
frpSumMw            aktuellste Überflugsumme
frpMaxMw            Maximum über alle Überflüge
freeMj              Fire Radiative Energy, null bei zu wenig Abtastung
biomassKg           abgeleitet aus freeMj, null wenn freeMj null
activity            growing | stable | declining | no-signal
observationQuality  confirmed | unobserved   (siehe §5.6)
spreadBearingDeg    Ausbreitungsrichtung, null bei < 3 Überflügen
areaEstHa           Punktschätzung — null vor Kalibrierung
areaEstLowHa        untere Intervallgrenze
areaEstHighHa       obere Intervallgrenze
areaEstMethod       calibrated-frp | calibrated-count | null
```

### Statusachsen — nicht vermischen

Der `FireRecord` braucht **zwei** Statusfelder, weil zwei unabhängige Dinge beschrieben werden:

| Achse | Werte | Quelle |
|---|---|---|
| Feuerzustand | `active` / `no-signal` / `out` | AF-Modul |
| Kenntnisstand Fläche | `estimated` / `provisional` / `mapped` / `final` | BA-Modul |

Beide Kombinationen treten real auf: ein erloschenes Feuer ohne wolkenfreie Szene (`out` + `estimated`), ein brennendes Feuer mit Teilkartierung (`active` + `provisional`). In einem Feld ist einer der beiden Zustände nicht darstellbar.

`out` wird ausschließlich mit Quelle gesetzt (EFFIS `FINALDATE`, EMS geschlossen, behördliche Meldung). Das AF-Modul selbst kann nur `no-signal` setzen — siehe §5.6.

---

## 3. Datenmodell

### Überflug-Aggregat

Die Rohdetektionen werden zu Überflügen gruppiert. Ein Überflug ist die Menge aller Detektionen eines Sensors innerhalb eines kurzen Zeitfensters (Standard 10 min).

```json
{
  "overpass_id": "VIIRS_NOAA20_20260815T1241",
  "sat": "VIIRS_NOAA20",
  "daynight": "D",
  "t": "2026-08-15T12:41:00Z",
  "n_detections": 3,
  "frp_sum_mw": 21.7,
  "frp_max_mw": 12.1,
  "pixel_area_ha": 47.3,
  "centroid": [13.2807, 51.4231],
  "mean_scan_km": 0.44
}
```

Diese Zwischenstufe ist wichtig: Alle Zeitreihenmaße (Trend, FRE, Ausbreitung) arbeiten auf Überflügen, nicht auf Einzeldetektionen. Sonst gewichtet ein Überflug mit fünf Pixeln fünfmal so stark wie einer mit einem.

### Zustandsdatei pro Ereignis

Analog zum BA-Modul liegt der Zustand pro Ereignis in dessen eigener Datei, nicht in einer zentralen Liste:

```
events/{event_id}/activity.json    Überflüge, Aggregate, aktueller Zustand
```

Grund: Ein Lauf ohne neue Detektion erzeugt keine Änderung und damit keinen Commit. Eine zentrale Datei würde bei jedem Lauf schreiben.

---

## 4. Modulstruktur

```
src/af/
  models.py        Detection, Overpass, ActivityState (dataclasses)
  overpass.py      Gruppierung Detektionen → Überflüge
  envelope.py      Detektionsumring aus scan/track, Alpha-Shape
  frp.py           FRP-Aggregation, Normalisierung, FRE-Integration, Biomasse
  dynamics.py      Trend, Wachstum, Ausbreitungsrichtung
  observation.py   Beobachtungsgelegenheit, no-signal-Qualifikation
  estimate.py      Flächenschätzung + Intervall aus Kalibriermodell
  calibrate.py     Auswertung der BA-Labelpaare, Modellfit
  store.py         Objektspeicher-I/O
  pipeline.py      Orchestrierung
```

`estimate.py` und `calibrate.py` kommen erst in Phase 4. Die Pipeline muss ohne sie vollständig lauffähig sein und dann `areaEst*` auf `null` lassen.

---

## 5. Verarbeitungskette

### 5.1 Überflüge bilden (`overpass.py`)

Detektionen nach `sat` und Zeitfenster (Standard 10 min) gruppieren. Bei drei VIIRS-Plattformen mit ähnlicher Überflugzeit ist die Sensortrennung notwendig — sonst werden zwei Sensoren zu einem Überflug verschmolzen und die FRP-Summe verdoppelt sich scheinbar.

Ausgabe: chronologische Überflugliste.

### 5.2 Detektionsumring (`envelope.py`)

Pro Detektion ein Rechteck `scan × track` (km) in UTM aufspannen. **Nicht die Punkte puffern** — die Pixelgrundfläche ist rechteckig und richtungsabhängig, und das ist die einzige geometrisch korrekte Repräsentation.

```python
rects = [box_utm(d.lon, d.lat, d.scan * 1000, d.track * 1000) for d in detections]
envelope = unary_union(rects)

if len(detections) >= 4:
    envelope = alphashape(corners_of(rects), alpha=1 / ALPHA_M)
```

Alpha-Parameter: Der FEDS-Ansatz (Chen et al. 2022, Scientific Data 9:249) nutzt α ≈ 1 km, kalibriert an kalifornischen Großfeuern. Für DACH-Kleinbrände ist das zu grob. Startwert **800 m**, in `config` haltbar, nach der ersten Saison gegen eigene Ereignisse nachjustieren.

Bei ein bis drei Detektionen degeneriert die Alpha-Shape — dann die Rechteck-Union verwenden. Für DACH ist das der Regelfall, nicht die Ausnahme.

**Semantik des Ergebnisses.** Der Umring heißt `detection-extent`, nicht `upper-bound`. Er ist **keine obere Schranke**:

| Mechanismus | Wirkung |
|---|---|
| Bewölkung zum Überflug | Aktiv-Feuer-Detektion fällt aus, Feuer brennt weiter |
| Schwelbrand unter der Detektionsschwelle | Ausbreitung ohne Signal |
| Ausbreitung zwischen Überflügen | Lücken von mehreren Stunden |

Die reale Brandfläche kann den Umring überschreiten. Wenn später eine S2-Kartierung darüber hinausgeht und im Dashboard ein „Maximalwert" stand, ist das eine widerlegte Zusage.

`envelopeAreaHa` mitschreiben, aber im UI **nie als Brandfläche rendern**.

### 5.3 FRP-Aggregation (`frp.py`)

Belastbar sind:

```
frp_sum_mw    Summe über alle Detektionen eines Überflugs
frp_max_mw    Maximum über alle Überflüge des Ereignisses
```

**Normalisierungsfallen, die dokumentiert werden müssen:**

| Effekt | Wirkung auf FRP | Umgang |
|---|---|---|
| Blickwinkel (off-nadir) | größerer Pixel, veränderte Detektionswahrscheinlichkeit | `mean_scan_km` mitführen, bei starkem Off-Nadir kennzeichnen |
| Sensorunterschied VIIRS/MODIS | nicht direkt vergleichbar | Zeitreihe je Sensorfamilie führen, nicht mischen |
| Tag/Nacht | andere Detektionsschwelle und anderes Feuerverhalten | `daynight` mitführen, Trends nicht über Tag/Nacht-Grenzen bilden |
| Wolken-/Rauchdämpfung | gemessene FRP zu niedrig | nicht korrigierbar, als Unsicherheit vermerken |

Ein FRP-Verlauf, der Tag- und Nachtüberflüge und zwei Sensorfamilien mischt, zeigt vor allem Artefakte.

### 5.4 FRE und Biomasse (`frp.py`)

Fire Radiative Energy ist das zeitliche Integral der FRP. Sie ist die Größe, für die eine belastbare physikalische Beziehung existiert: Wooster et al. (2005, JGR 110:D24311) belegen FRP↔Verbrennungsrate mit r² = 0,90 und FRE↔verbrannte Biomasse mit r² = 0,98.

```python
fre_mj = trapezoid(frp_series_mw, time_series_s) / 1e6
```

**Gültigkeitsregel:** FRE nur berechnen bei **≥ 3 Detektionen über ≥ 2 Überflüge**. Aus einem einzelnen Messpunkt lässt sich kein Integral bilden; ein trotzdem ausgegebener Wert wäre erfunden. Sonst `null`.

Für DACH heißt das: Bei der Mehrzahl der Ereignisse bleibt FRE `null`. Das ist korrekt und muss so im UI erscheinen, nicht als 0.

**Systematischer Fehler der Integration.** Polarumläufer tasten den Tagesgang unregelmäßig ab. Die Überflugzeiten (≈ 10:30, 13:30, 22:30, 01:30 lokal) liegen neben dem typischen Feuermaximum am Nachmittag. Die Trapezintegration über Lücken von 6–12 Stunden hat entsprechend große Unsicherheit. Publizierte Tagesgang-Korrekturen existieren, führen aber zusätzliche Annahmen ein — für die erste Ausbaustufe nicht empfohlen, stattdessen die Unsicherheit ausweisen.

**Biomasse.** Wooster et al. publizieren einen Umrechnungsfaktor FRE → verbrannte Biomasse. Wert und Brennstoffabhängigkeit **direkt am Paper verifizieren**, nicht aus Sekundärquellen übernehmen — der Faktor variiert mit dem Brennstofftyp, und ein einzelner Zahlenwert ohne diesen Kontext ist irreführend.

Der Anteil der theoretisch verfügbaren Wärme, der als Strahlung freigesetzt wird, liegt nach derselben Arbeit bei 14 ± 3 %. Diese Streuung geht direkt in jede abgeleitete Biomasse ein und gehört als Unsicherheit ausgewiesen.

### 5.5 Dynamik (`dynamics.py`)

**Aktivitätszustand** aus dem FRP-Verlauf der letzten drei Überflüge derselben Sensorfamilie und Tageshälfte:

| Zustand | Kriterium |
|---|---|
| `growing` | FRP steigend **und** neue Detektionen am Rand des bisherigen Umrings |
| `stable` | FRP innerhalb ±30 % des Vorüberflugs |
| `declining` | FRP fallend über zwei Überflüge |
| `no-signal` | keine Detektion im letzten Überflug mit Beobachtungsgelegenheit |

Die Doppelbedingung bei `growing` ist wichtig: Steigende FRP allein kann auch ein Blickwinkeleffekt sein. Erst die räumliche Ausdehnung macht es zum Wachstum.

**Ausbreitungsrichtung** aus der Verschiebung des FRP-gewichteten Zentroids zwischen Überflügen. Erst ab drei Überflügen sinnvoll, sonst `null`.

**Windabgleich als Plausibilitätsprüfung.** Die DWD-Anbindung liegt im Projekt bereits vor. Weicht die berechnete Ausbreitungsrichtung stark von der Windrichtung ab, ist entweder der Zentroid durch einen Detektionsausfall verzerrt oder das Ereignis besteht aus zwei getrennten Feuern. Als Flag mitführen, nicht als Korrektur anwenden.

### 5.6 Beobachtungsgelegenheit (`observation.py`)

**Das Fehlen einer Detektion ist keine Aussage über das Feuer.** Bewölkung blockiert die Aktiv-Feuer-Detektion genauso wie die optische Kartierung. Ein Ereignis als beendet zu führen, weil nichts mehr detektiert wurde, ist der wahrscheinlichste inhaltliche Fehler dieses Moduls.

Jeder `no-signal`-Zustand wird deshalb qualifiziert:

| `observationQuality` | Bedingung | Aussage |
|---|---|---|
| `confirmed` | Überflug fand statt **und** Sicht war gegeben | Feuer vermutlich aus |
| `unobserved` | Überflug bewölkt oder ausgefallen | keine Aussage möglich |

Sichtprüfung, in aufsteigender Genauigkeit:

1. **Regionale Aktivität** — wurden beim selben Überflug andere Hotspots im weiteren Umfeld detektiert? Dann arbeitete der Sensor und hatte teilweise freie Sicht. Billig, ungenau, ohne Zusatzquelle machbar.
2. **DWD-Bewölkung** zum Überflugzeitpunkt am Ereignisort. Genauer, Anbindung besteht bereits.

Im UI erscheint `unobserved` als „kein Signal, Sicht durch Bewölkung eingeschränkt", nicht als „kein Signal seit X". Der Unterschied ist für die Nutzer erheblich.

### 5.7 Flächenschätzung (`estimate.py`, Phase 4)

**Vor der Kalibrierung gibt es keine Punktschätzung.** `areaEstHa` bleibt `null`, das UI zeigt Umring und FRP und den Hinweis, dass die Fläche nach der Sentinel-2-Kartierung ergänzt wird. Das ist konsistent mit dem gestuften Produkt der BA-Linie und ehrlicher als eine Zahl aus einer fremden Region.

Nach der Kalibrierung (§6) liefert das Modell ein **Intervall**, keinen Punktwert. Die Punktschätzung `areaEstHa` wird mitgeführt, aber im UI immer zusammen mit `areaEstLowHa`/`areaEstHighHa` dargestellt. Bei der zu erwartenden Streuung wird das Intervall häufig eine Größenordnung umfassen — das ist die Wahrheit über die Datengrundlage, nicht ein Mangel der Implementierung.

---

## 6. Kalibrierung aus der BA-Linie

Dies ist der eigentliche Kern des Konzepts und der Grund, warum die beiden Module zusammen mehr können als jedes für sich.

### Das Labelpaar

Jedes Ereignis, das im BA-Modul von `estimated` nach `mapped` durchläuft, erzeugt automatisch ein gelabeltes Trainingspaar:

```json
{
  "event_id": "de-2026-0817-001",
  "features": {
    "n_detections": 3,
    "n_overpasses": 2,
    "frp_sum_max_mw": 21.7,
    "fre_mj": 412.0,
    "duration_h": 12.5,
    "envelope_area_ha": 47.3,
    "sensor_family": "VIIRS",
    "daynight_mix": "DN",
    "landcover_dominant": "tree_cover",
    "month": 8
  },
  "target": {
    "area_net_ha": 3.8,
    "area_min_ha": 2.9,
    "area_max_ha": 4.9,
    "ba_status": "mapped",
    "separability": 1.9
  }
}
```

Nur Paare mit `ba_status ∈ {mapped, final}` und `separability ≥ 1,5` aufnehmen. `provisional` ist teilkartiert und würde die Zielgröße systematisch nach unten verzerren.

### Warum das relevant ist

Für mitteleuropäische Kleinbrände existiert keine publizierte FRP→Flächen-Beziehung. Alle verfügbaren stammen aus Regimen mit anderen Feuergrößen und Brennstoffen. Nach einer Saison sind **30–80 eigene Paare** aus DACH zu erwarten — genug für eine regional gültige Beziehung, die es sonst nirgends gibt.

### Modellwahl

Bei dieser Stichprobengröße ist ein ML-Modell unangemessen. Empfohlen:

```
log(area_net) ~ log(fre_mj)            wenn FRE verfügbar
log(area_net) ~ log(n_detections)      Fallback bei Einzelüberflug-Ereignissen
```

Log-lineare Regression mit **Prädiktionsintervall** (nicht Konfidenzintervall — gefragt ist die Streuung einer Einzelvorhersage, nicht die des Mittelwerts). Zwei getrennte Modelle, weil bei DACH die Mehrzahl der Ereignisse kein belastbares FRE hat.

Stratifizierung nach Landbedeckung erst ab ausreichender Stichprobe je Klasse — im ersten Jahr voraussichtlich nicht möglich.

### Der Stichprobenbias und warum er hier nicht schadet

Die Stichprobe ist detektionsbedingt: VIIRS sieht bevorzugt große, heiße Brände. Der Median der detektierten Brände liegt deutlich über dem der BLE-Waldbrandstatistik.

Für die beabsichtigte Anwendung ist das **kein Problem**, sondern genau richtig: Das Modell sagt eine Fläche nur für Ereignisse voraus, die detektiert wurden. Es wird nie auf undetektierte Brände angewandt. Der Bias wäre nur relevant, wenn aus dem Modell auf die Gesamtheit der DACH-Brände hochgerechnet würde — und das darf nicht passieren.

Diese Einschränkung gehört in die Methodikbeschreibung.

### Rhythmus

`calibrate.py` läuft nicht im regulären Poll, sondern **manuell oder monatlich**. Ergebnis ist eine versionierte Modelldatei:

```
models/area-estimate-v{n}.json     Koeffizienten, n, R², Residualstreuung, Datum
```

Die Modellversion wird in jedem `FireRecord` als `areaEstMethod` mitgeschrieben. Ändert sich das Modell, bleibt nachvollziehbar, welche Schätzung mit welchem Stand entstand.

---

## 7. Attribute im FireRecord

```
envelope, envelopeAreaHa
frpSumMw, frpMaxMw, freeMj, biomassKg
activity, observationQuality
spreadBearingDeg, spreadWindAgreement
areaEstHa, areaEstLowHa, areaEstHighHa, areaEstMethod
nDetections, nOverpasses, durationH
sensorFamilies, daynightMix, meanScanKm
firstDetection, lastDetection
```

**Darstellungsregeln, die aus dem Datenmodell folgen:**

| Regel | Grund |
|---|---|
| `envelopeAreaHa` nie als Brandfläche beschriften | ist keine, siehe §5.2 |
| `areaEst*` nur mit Intervall zeigen | Punktwert allein suggeriert Präzision |
| `freeMj = null` als „nicht bestimmbar", nicht als 0 | fehlende Abtastung ≠ keine Energie |
| `no-signal` immer mit `observationQuality` | sonst wird Bewölkung als Löschung gelesen |
| „erloschen" nur mit Quelle | AF-Modul kann das nicht feststellen |

---

## 8. Workflow

### Rhythmus

Das AF-Modul läuft im Takt des FIRMS-Polls (stündlich), nicht im 6-Stunden-Takt der BA-Linie. Begründung: FIRMS-Latenz liegt bei etwa 3 Stunden, und die Aktivitätsanzeige ist der Echtzeitteil des Produkts.

```yaml
on:
  schedule:
    - cron: "17 * * * *"
  workflow_dispatch:
```

Die Minute bewusst nicht auf `:00` legen — geplante Läufe zur vollen Stunde haben die größten Verzögerungen.

### Ablauf

1. Neue Detektionen vom Cluster-Modul entgegennehmen
2. Je betroffenem Ereignis: `activity.json` laden, Überflüge fortschreiben
3. Umring, FRP-Aggregate, Dynamik, Beobachtungsgelegenheit neu berechnen
4. Falls Kalibriermodell vorliegt: Schätzintervall setzen
5. `FireRecord` aktualisieren, `activity.json` zurückschreiben
6. Nur bei tatsächlicher Änderung schreiben — sonst kein Commit

Punkt 6 ist der Unterschied zwischen einem sauberen Repo und stündlichem Commit-Rauschen.

### Aufwand

Reine Vektor- und Skalarrechnung auf wenigen Punkten pro Ereignis. Bei 200 offenen Ereignissen unter einer Sekunde. Kein Rasterzugriff, kein Netzwerkverkehr außer FIRMS und optional DWD.

---

## 9. Konfiguration

```yaml
overpass:
  window_minutes: 10
  separate_by_sensor: true

envelope:
  alpha_m: 800
  min_detections_for_alphashape: 4

frp:
  fre_min_detections: 3
  fre_min_overpasses: 2
  trend_window_overpasses: 3
  stable_tolerance: 0.30

observation:
  regional_activity_radius_km: 150
  use_dwd_cloud: true

activity:
  no_signal_after_overpasses: 2

estimate:
  model_path: "models/area-estimate-v1.json"
  min_pairs_for_fit: 25
  interval_level: 0.80
```

`min_pairs_for_fit` verhindert, dass aus fünf Paaren ein Modell entsteht. Bis der Wert erreicht ist, bleibt die Schätzung `null`.

`interval_level` bewusst auf 0,80 statt 0,95 — bei der zu erwartenden Streuung wäre ein 95-%-Intervall so breit, dass es keine Information mehr trägt. Der gewählte Wert gehört in die Methodikbeschreibung.

---

## 10. Fehlerfälle

| Fall | Verhalten |
|---|---|
| Einzelne Detektion, kein weiterer Überflug | Umring + FRP; FRE, Trend, Richtung bleiben `null` — **kein Fehler** |
| Keine Detektion im letzten Überflug | `no-signal` **plus** `observationQuality` setzen, nie `out` |
| DWD nicht erreichbar | Fallback auf regionale Aktivität, `observationQuality` grober |
| Zwei Sensorfamilien im selben Zeitfenster | getrennte Überflüge, nicht verschmelzen |
| Alpha-Shape degeneriert (< 4 Punkte) | Rechteck-Union verwenden — **Regelfall in DACH** |
| Kein Kalibriermodell | `areaEst*` = `null`, UI zeigt nur Umring und FRP |
| Detektion mit `frp = 0` oder fehlend | Detektion für Geometrie zählen, aus FRP-Aggregaten ausnehmen |
| Ereignis flammt nach `no-signal` wieder auf | `activity` zurück auf `growing`, Überflugreihe fortsetzen, nicht neues Ereignis |

Die ersten beiden sind die wichtigsten: **Einzeldetektion ohne Zeitreihe und fehlendes Signal sind Normalzustände**, keine Ausnahmen. Werden sie als Fehler behandelt, verliert das Modul die Mehrzahl der DACH-Ereignisse.

---

## 11. Validierung

| Prüfung | Referenz | Erwartung |
|---|---|---|
| Umring ⊂ S2-Polygon? | BA-Ergebnis desselben Ereignisses | **nicht immer** — Abweichungen dokumentieren, nicht wegdefinieren |
| Schätzintervall trifft gemessene Fläche | BA-Ergebnis | bei 80-%-Intervall in ~80 % der Fälle |
| FRP-Zeitreihe plausibel | Tagesgang, Windlage | keine Sprünge über Sensorwechsel |
| `no-signal` korrekt | EFFIS `FINALDATE`, behördliche Meldung | keine verfrühten Beendigungen |
| Regression | fixe Detektionsfixtures | identische Aggregate |

Die erste Zeile ist der aufschlussreichste Test. Wenn der Detektionsumring regelmäßig **kleiner** ist als die kartierte Fläche, bestätigt das die Semantik aus §5.2 und liefert das Argument, warum `upper-bound` die falsche Bezeichnung wäre.

Die zweite Zeile ist die eigentliche Modellvalidierung und der Grund, das Intervall statt eines Punktwerts auszugeben: Ein Intervall ist überprüfbar, eine Punktschätzung nicht.

---

## 12. Umsetzungsphasen

| Phase | Inhalt | Ergebnis |
|---|---|---|
| **1** | `overpass.py`, `envelope.py` — Überflüge und Umring | Geometrie im Panel, korrekt beschriftet |
| **2** | `frp.py` — Aggregate, FRE, Biomasse mit Gültigkeitsregeln | Intensitätsgrößen |
| **3** | `dynamics.py`, `observation.py` — Zustand und Sichtqualifikation | Aktivitätsanzeige |
| **4** | `calibrate.py`, `estimate.py` — nach der ersten Saison | Flächenschätzung mit Intervall |

Phase 1–3 sind unabhängig von der BA-Linie und sofort umsetzbar. **Phase 4 setzt voraus, dass die BA-Linie läuft und genug Paare geliefert hat** — realistisch frühestens nach einer vollen Feuersaison.

Wichtig für die Reihenfolge: Das Labelpaar-Schema aus §6 muss **ab Phase 1** geschrieben werden, auch wenn Phase 4 noch weit weg ist. Sonst fehlen später die Merkmale zu den Ereignissen, die inzwischen durchgelaufen sind, und die erste Kalibrierung verschiebt sich um eine weitere Saison.

---

## 13. Was nicht sicher beantwortbar ist

- **Alpha-Parameter für DACH-Kleinbrände.** Der publizierte Wert von ~1 km stammt aus kalifornischen Großfeuern. 800 m ist ein Startwert, keine belegte Größe. Nachjustierung gegen eigene Ereignisse einplanen.
- **Streuung der zu erwartenden FRP↔Flächen-Beziehung.** Publizierte Beziehungen aus anderen Regionen streuen erheblich. Ob die DACH-Beziehung enger oder breiter ausfällt, ist offen — die Feuer sind kleiner und homogener, aber auch näher an der Detektionsschwelle, wo das Messrauschen relativ größer ist.
- **Biomasse-Umrechnungsfaktor.** Brennstoffabhängig; der Wert für mitteleuropäische Bestände ist nicht dieselbe Größe wie für die in der Originalarbeit untersuchten. Ohne eigene Kalibrierung nur als Größenordnung ausweisen.
- **Ob 30–80 Paare pro Saison erreicht werden.** Hängt davon ab, wie viele detektierte Ereignisse tatsächlich eine wolkenfreie S2-Szene innerhalb des 45-Tage-Fensters bekommen. Im Extremfall eines nassen Sommers deutlich weniger.
- **Tagesgang-Korrektur der FRE.** Publizierte Ansätze existieren, führen aber Annahmen ein, die für mitteleuropäische Brände nicht validiert sind. Bewusst nicht Teil der ersten Ausbaustufe.

---

## 14. Abgrenzung zu geostationären Daten

FIRMS führt inzwischen auch geostationäre Detektionen. Für DACH gilt:

| Sensor | Auflösung sub-nadir | Über DACH | Detektionsschwelle |
|---|---|---|---|
| MSG SEVIRI | 3 km | deutlich größer (off-nadir) | ~40 MW |
| MTG-I FCI | 1–2 km | kleiner als SEVIRI | ~10 MW |

**Für die Geometrie unbrauchbar.** Die Pixelverzerrung auf DACH-Breite macht jeden Umring wertlos.

**Für die Zeitachse potenziell wertvoll.** Aufnahmen alle 10–15 Minuten bestimmen `t_start` und `t_end` erheblich präziser als Polarumläufer — und `t_end` ist der Wert, an dem die gesamte BA-Szenensuche hängt. Ein halber Tag früherer Suchbeginn ist bei einer Kette mit Median 3–5 Tagen spürbar.

Die Detektionsschwelle bleibt das Problem: Der überwiegende Teil der DACH-Ereignisse liegt darunter. Bei den mehrtägigen Großbränden — also genau denen, für die eine Zeitachse überhaupt interessant ist — greift es dagegen.

**Empfehlung:** Geostationäre Detektionen als optionale Quelle für `t_start`/`t_end` einplanen, **nicht** in Umring, FRP-Aggregate oder Kalibrierung einfließen lassen. Sonst mischen sich zwei unvereinbare Geometrien.
