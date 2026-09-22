# Befundbericht: buscosun Punktarchiv – Slot 2026-09-21 23:21 UTC

**Datei:** `2321.json` (134 MB, `kind: punktarchiv/slot`, `schema: 2`, `codeHash: 36f2bbb`, Producer `buscosun-web/scripts/punktarchiv/collect.mjs`)
**Geprüft am:** 22.09.2026
**Umfang:** ein einzelner Slot, 405 Punkte (DE 203, CH 101, AT 84, CZ 9, NL 4, DK/LU/LI/SK je 1)

> **Einordnung:** Alle Befunde stammen aus **einem** Slot. Die Verifikationszahlen (Fehler gegen Beobachtung) beruhen auf **einer Nacht** (21.09., 18–23 UTC) und sind ein Hinweis, keine statistisch belastbare Aussage. Strukturelle Befunde (Kapitel 2–4) gelten dagegen unabhängig von der Stichprobe.
> Die Einträge sind nach Schwere sortiert. Jeder Befund ist als **[Befund]** (direkt in den Daten nachgewiesen) oder **[Vermutung]** (plausible Ursache, nicht bewiesen) markiert.

---

## 1. Überblick: Aufbau der Datei

| Block | Inhalt | Größe (kompakt) |
|---|---|---|
| `points`, `pointsFrom` | Stationsliste mit Höhe, DEM-Höhe, Länderprofil, Kennungsregeln | < 0,1 MB |
| `cube.t1` / `t2` / `t3` | Gitter-Fusion: t1 0–48 h stündlich (Lauf 18Z), t2 51–120 h 3-stündlich (Lauf 18Z), t3 126–336 h 6-stündlich (Lauf 12Z). 57 Ebenen je Stunde (Mittel, `_sd`, `_sd_ens`, `q10/q90`, `gammaEff`, Inversion, 925/850/700 hPa, `srcCount`) | ~10 MB |
| `stations` | MOSMIX-L Lauf 21Z, 1–247 h, 12 Ebenen | ~4,7 MB |
| `nowcast` | RADVOR-RV (5-min, 0–120 min), INCA (15-min, 15–180 min), CombiPrecip (nur Lead 0) | ~0,8 MB |
| `hmodel` | Modellhöhe je Quelle und Punkt | ~0,3 MB |
| `live` | Ausgabe des App-Live-Pfads, 240 h je Punkt (10 Punkte 373 h) | **~117 MB** |
| `truth` | Beobachtungen 20.09. 23 UTC – 21.09. 23 UTC aus DWD POI, TAWES, SMN | ~0,6 MB |
| `plan` | Quellenwahl je 6-h-Abschnitt, Stationszuordnung, Lücken | ~0,7 MB |
| `stats` | Warnungen, Laufzeiten, Netzwerk | < 0,1 MB |

**Positiv:** Die Datei beschreibt sich weitgehend selbst (Skalen, Sentinel `-32768`, Provenienz je Quelle, Caveats, codeHash, `stats.warnings`). Das ist für ein Backtest-Archiv sehr gute Praxis.

---

## 2. Kritische Befunde (verfälschen einen Backtest direkt)

### 2.1 Sägezahn-Artefakt in der Cube-Temperatur durch wechselnden Quellenmix ohne Höhenangleich **[Befund]**

**Beobachtung:** `cube.t1.byPoint[*].planes.srcCount` wechselt stündlich im festen Muster `6, 3, 3, 5, 3, 3, 6, …` (ab Lead 28: `2, 2, 5, 2, 2, 3, …`). Mit dem Quellenmix springt die effektive Modellhöhe `hModEff` und damit `t2m`.

**Ursache:** Die Quellen haben unterschiedliche Zeittakte (ICON-D2/ICON-EU/CLAEF stündlich, IFS und ICON-CH1-EPS 3-stündlich, AIFS 6-stündlich). Die Fusion mittelt je Stunde die gerade verfügbaren Quellen, und zwar deren 2-m-Temperatur auf der **jeweils eigenen Modellhöhe**, ohne vorherige Reduktion auf eine gemeinsame Bezugshöhe.

**Beispiel Giswil (06657, Stationshöhe 471 m)**, Modellhöhen laut `hmodel`: ICON-CH1-EPS 477 m, ICON-D2 631 m, ICON-EU 1227 m, IFS 1660 m, AIFS 1770 m (Spread 1293 m).

| Lead (h) | 3 | 4 | 5 | **6** | 7 | 8 |
|---|---|---|---|---|---|---|
| `srcCount` | 5 | 3 | 3 | **6** | 3 | 3 |
| `hModEff` (m) | 999 | 929 | 929 | **1153** | 929 | 929 |
| `t2m` (°C) | 11,48 | 11,40 | 11,06 | **8,91** | 10,54 | 10,08 |

**Quantifizierung über alle 405 Punkte (t1):** Residuum `t2m[i] − (t2m[i−1] + t2m[i+1]) / 2` in Stunden, in denen `srcCount` ein lokales Maximum hat und `hModEff` um > 100 m springt: n = 916, **Mittel −0,69 K**, mittlerer Betrag 1,08 K. Referenz (übrige Stunden): Mittel +0,12 K, mittlerer Betrag 0,30 K.

**Folgeeffekt – systematische Kältedrift mit dem Vorlauf:** Die effektive Höhe steigt je Stufe, weil in höheren Stufen grobe Modelle dominieren. Giswil: t1 929–1153 m, t2 1410–1482 m (alterniert 5/6 Quellen), t3 1815 m. Für Talstationen erzeugt das einen mit dem Vorlauf wachsenden Kältebias, der im Backtest als „Modell wird schlechter“ fehlinterpretiert würde.

**Nebenbefund:** CLAEF geht in die Mittelung ein, fehlt aber im `hmodel`-Block. Seine Modellhöhe ist nicht nachvollziehbar.

**Empfehlung:** Jede Quelle **vor** der Fusion einzeln auf die Stationshöhe reduzieren (Gradient aus dem Modellprofil, `gammaEff` bzw. `t925/850/700`; in Tälern mit Inversion kein fixer Gradient). Grobe Quellen zeitlich interpolieren, damit die Zusammensetzung stündlich konstant bleibt.

### 2.2 Cube-Werte beziehen sich auf die Modellhöhe, nicht auf die Punkthöhe; Vorzeichen von `gammaEff` undokumentiert **[Befund]**

Verifikation `cube.t1.t2m` gegen `truth` (≈ 400 Punkte, Lead 0–5 = 18–23 UTC):

| Lead | roh (Modellhöhe) MAE / Bias | mit 6,5 K/km auf Stationshöhe | mit `gammaEff` (positiv = Abkühlung) |
|---|---|---|---|
| 0 | 1,53 / −0,53 K | 0,76 / −0,22 K | 0,85 / −0,18 K |
| 2 | 1,42 / −0,33 K | 0,98 / −0,10 K | 1,01 / −0,08 K |
| 4 | 1,35 / −0,19 K | 1,16 / +0,05 K | 1,10 / +0,06 K |
| 5 (nur TAWES/SMN, n = 183) | 1,76 / −0,47 K | 1,45 / +0,23 K | 1,31 / +0,17 K |

Wird `gammaEff` mit umgekehrtem Vorzeichen angewendet, steigt der MAE auf 2,1–2,5 K. Die Vorzeichenkonvention (positiv = Temperaturabnahme mit der Höhe) steht nirgends in der Datei. Wertebereich `gammaEff` t1: −5,6 … +10,1 K/km, Median 5,05 K/km.

### 2.3 Live-Block enthält zwei widersprüchliche Vorhersagen; Wind in `fusion.mu` driftet **[Befund]** / Ursache **[Vermutung]**

`live.byPoint[*].fields` und `live.byPoint[*].fusion[i].mu` weichen systematisch voneinander ab (98 530 Stundenwerte). Mittlerer Betrag: Temperatur 0,5 K, Windgeschwindigkeit 2,2 m/s, Böen 1,5 m/s, Bewölkung 8,5 Prozentpunkte, Windrichtung 87°. Einen Zeitversatz zwischen beiden Reihen gibt es nicht (Test mit Offsets −1 … +2 h).

Mittlere Windgeschwindigkeit, gleiche Gültigkeitszeit:

| Vorlauf | `fields` | `fusion.mu` | MOSMIX (`stations`) |
|---|---|---|---|
| 0–6 h | 2,20 | 2,96 | 2,50 m/s |
| 24–72 h | 2,53 | 3,89 | 2,72 m/s |
| 72–150 h | 2,18 | 4,53 | 2,27 m/s |
| 150–240 h | 2,46 | **5,11** | 2,55 m/s |

Beispiel München (10870), Stunde 100: `rawMu` = 1,95 m/s, `mu` = 3,80 m/s (Quelle nur MOSMIX).
**[Vermutung]** Die Schrumpfung Richtung Klimatologie zieht den Wind auf einen zu hohen Klimawert (Einheit, Höhe oder Größe der Klimareihe prüfen).

Weitere Auffälligkeiten in `fusion` (Gaußmodell auf begrenzten Größen):

- `rawMu < 0` bei Niederschlag in 96 %, bei Bewölkung in 53 % und bei Böen in 41 % der Stunden.
- Physikalisch unmögliche Rohwerte, z. B. Böen-`rawMu` 38 m/s und Bewölkung 169 % (Helgoland, Stunde 200).
- Der Niederschlag `mu` liegt in 90 % der Stunden außerhalb von q10–q90. Das ist bei einer Mischverteilung mit P(Regen) < 10 % mathematisch möglich, aber zu dokumentieren.

**Offene Frage:** Welche Reihe ist „die“ Live-Vorhersage, die bewertet werden soll?

### 2.4 Live-Pfad verletzt das As-of-Prinzip (möglicher Look-ahead) **[Befund]**

- `slotAt` = 23:21:00, `createdAt` = 23:21:50. `live.byPoint[*].fetchedAtMs` liegt aber zwischen **23:28 und 23:33 UTC**, also 7–12 min nach der Slotzeit. `createdAt` ist die Start-, nicht die Fertigstellungszeit (`stats.timing.total` = 678 s).
- Stunde 0 des Live-Pfads (t0 = 23:00) enthält `dwd_obs`. Laut `truth.window.note` erscheint der POI-Wert für 23:00 erst **nach** dem Slot.
- **[Vermutung]** Die auffällig gute Live-Trefferquote um 23 UTC (MAE `fusion.mu` 0,52 K gegen 0,82 K für `fields` und 0,79 K für MOSMIX) könnte daher rühren, dass der verifizierende Messwert bereits eingeflossen ist.

### 2.5 Luftdruck ist nicht verifizierbar: gemischte Bezugsniveaus **[Befund]**

`truth.*.tawes.p` (laut Caveat „reduziert: TAWES PRED“) enthält je nach Stationshöhe unterschiedliche Bezugsniveaus. Median je Station:

| Stationshöhe | typischer Wert | Beispiele |
|---|---|---|
| ≤ 842 m | 1023–1030 hPa (Meereshöhe) | Wien, Reutte, Landeck |
| 1034–2251 m | 857–861 hPa, **nahezu konstant unabhängig von der Höhe** | Fischbach 1034 m: 856,8; Patscherkofel 2251 m: 860,2 |
| ≥ 2317 m | 717–720 hPa | Rudolfshütte, Ischgl/Idalpe, Sonnblick |

POI und SMN liefern Meereshöhen-Druck (POI und SMN sind an Doppelstationen identisch). Der Cube liefert nur `ps` (Bodendruck an der Modelloberfläche). **Keine Vorhersagegröße hat dasselbe Bezugsniveau wie die Beobachtung.** Das Mischreferenz-Verhalten von TAWES ist in den Caveats nicht dokumentiert.

---

## 3. Mittelschwere Befunde

### 3.1 Quantile in t1 passen nicht zum Mittelwert **[Befund]**

In t1 stammen die Quantile aus `claef_eps` (Lauf 12Z, 6 h älter), der Mittelwert dagegen aus dem deterministischen Mix. Anteil der Fälle, in denen der Mittelwert außerhalb q10–q90 liegt (erwartet ≈ 20 %):

| Größe | t1 | t2 | t3 |
|---|---|---|---|
| t2m | **45 %** | 7,8 % | 7,2 % |
| snowlmt | **74 %** | – | – |
| u10 / v10 / gust / clct | 29–39 % | 7–14 % | 4–5 % |

94 von 405 Punkten (23 %) haben in t1 überhaupt keine Quantile (außerhalb der CLAEF-Domäne). Empfehlung: Quantile um den eigenen Mittelwert zentrieren oder als „fremde Quelle“ kennzeichnen.

### 3.2 Im Cube fehlen die Einzelwerte je Quelle **[Befund]**

Der Cube enthält nur den Fusionswert und `srcCount`, aber keine Werte je Modell. Damit sind **nicht** möglich:

- der geforderte Vergleich „Fusion gegen jede Einzelquelle“,
- das Herleiten der Gewichte aus Fehlerstatistiken (`fusion.note`: „Σ ist ungemessen …“).

Nur MOSMIX liegt separat vor (`stations`).
**Empfehlung:** Einzelwerte je Quelle mindestens für t2m, Wind, Böen, Niederschlag und Bewölkung archivieren.

### 3.3 Plan-Achse um einen Schritt überschritten **[Befund]**

`plan.axis.toMs` endet am 06.10. um 00:00 UTC (Slot + 336 h, auf 6 h gerundet). Bei allen 405 Punkten endet das letzte Segment aber am 06.10. um 06:00. Die Segmente summieren sich auf 57 statt 56 Sechs-Stunden-Schritte (Off-by-one).
Zusätzlich hat jeder Punkt am Ende eine 12-h-Lücke, weil t3 (Lauf 12Z, 11,35 h alt) nur bis +336 h seines eigenen Laufs reicht.

### 3.4 Uneinheitliche Stationswahl zwischen `plan` und `stations` **[Befund]**

Zell am See (11144): `plan.byPoint.station.candidate` = **11143** (1,21 km), `stations.byPoint.station` = **11144** (4,56 km). Bei allen übrigen 404 Punkten stimmen beide überein.

### 3.5 Live-Horizont unvollständig **[Befund]**

- Laut Anforderung 0–336 h, tatsächlich 240 h (395 Punkte) bzw. 373 h (10 Punkte).
- `relativeHumidity` und `snowLineM` sind nur bis Stunde 55 belegt, `uvIndex` nur bis Stunde 48. Danach Sentinel, insgesamt rund 89 % aller Stundenwerte.
- `windSpeed` und `windDirection` haben 53 Sentinel-Werte.

### 3.6 Stationsprodukt ohne Unsicherheit; `notMapped` unvollständig **[Befund]**

`stations` hat 12 von 57 Ebenen: keine `_sd`, keine Quantile, kein `ps`. `stations.notMapped` nennt aber nur 7 fehlende Ebenen.

### 3.7 Datei-Größe **[Befund]**

`live.fusion` belegt rund 107 MB, also etwa 80 % der Datei. Ursache sind ausgeschriebene Objekte je Stunde mit Fließkommazahlen voller Genauigkeit (z. B. `"n": 1.0171111723776158`).
Hochgerechnet ergibt das rund 50 GB pro Jahr. GitHub lehnt Einzeldateien über 100 MB ab, jsDelivr liefert nach meinem Kenntnisstand Dateien nur bis 20 MB aus. Eine spaltenweise Ganzzahl-Kodierung wie im Cube dürfte die Größe auf einen Bruchteil senken.

---

## 4. Kleinere Befunde

- **Relative Feuchte über 100 %** in `rh925/850/700` (Maximum 101,1 %): t1 8 Werte, t2 5, t3 247.
- **Uneinheitliche Schlüssel:** `live.confidence` nutzt `wind`, `clouds`, `humidity` und `snowLine`, `live.fields` dagegen `windSpeed`, `cloudCoverTotal`, `relativeHumidity` und `snowLineM`.
- **Niederschlag in t2/t3** ist als `mm/h` angegeben. Undokumentiert bleibt, ob das eine mittlere Rate über das 3- bzw. 6-h-Intervall ist und über welches Intervall (vorher oder nachher).
- **Nowcast:**
  - CombiPrecip hat nur Frame 0, also Analyse ohne Vorhersage.
  - INCA beginnt bei +15 min.
  - 4 Punkte haben keinen Nowcast (06120, 10020, 11659, 11679); INCA liegt bei 11 Punkten, CombiPrecip bei 6 Punkten außerhalb des Rasters.
- **`validAtSuspect`** meldet bei RV 24 von 25 Frames, obwohl die archivierten `validAtMs` korrekt `Stempel + Lead` sind. Das Flag beschreibt den Spiegel, nicht das Archiv.
- **Veralteter Caveat:** `live.caveats` sagt, der Taupunkt außerhalb der Ankerstunden sei Klimatologie (V-FI-25). In den Daten ist `climaOnly` überall `false`, und die Quelle ist MOSMIX.
- **Höhen im Live-Pfad:** Bei 31 Punkten weicht die Live-DEM-Höhe um mehr als 50 m von der Stationshöhe ab (bis −241 m). Küstenpunkte wie Helgoland haben `elevation = 0`. Das ist in `stats.warnings.liveElevation` dokumentiert.
- **Lücken in `truth`:**
  - SMN-`p` fehlt an 56 von 102 CH-Stationen.
  - POI-`fx` fehlt an 26 Stationen, `rr1` an 31, `n` an 13.
  - Die POI-Datei von 10615 ist leer.
  - 06120 hat nur 4 h, 11816 nur 8 h.
- **`id` ≠ `wmo`** bei 17 Punkten. Das ist in `pointsFrom.rules` dokumentiert.
- **Weiterhin offen:** Die Fusion läuft mit `weights: equal` / `provenance: fallback`. `icon_ch2_eps` fehlt in t1 und `claef` in t2 jeweils ohne Begründung (`assignedAbsent.kind = null`).

---

## 5. Geprüft und ohne Befund

- **Kennungen:** 405 eindeutige IDs, keine doppelten Koordinaten oder Namen. Alle `byPoint`-Blöcke haben exakt die 405 Schlüssel.
- **Cube-Struktur:** `planeOrder` und `scales` sind deckungsgleich (57 Ebenen je Stufe). Alle Arrays haben die Länge der jeweiligen Lead-Achse. Keine int16-Überläufe. Leere Ebenen sind korrekt in `empty` gelistet. Keine negativen Streuungen.
- **Cube-Geometrie:** `cell.offsetKm` stimmt mit der Haversine-Distanz überein (Median t1 2,2 km, t2 3,3 km, t3 9,0 km, Maximum 16,2 km). `ps` ist plausibel zur Modellhöhe.
- **`index` gegen Cube:** Läufe und Alter stimmen überein.
- **`truth`:** `count` = Arraylänge, Zeitstempel sortiert, eindeutig, volle Stunden und im Fenster. rh ist konsistent zur Magnus-Formel aus t/td (keine Abweichung > 5 Prozentpunkte). fx ≥ ff, fxh ≥ fx, dd liegt in 0–360.
- **`plan`:** Die Segmente schließen lückenlos aneinander an, `steps` passt zur Segmentdauer, `plan.nowcast` stimmt mit `nowcast.covering` überein.
- **`live`:** Alle Arrays haben die Länge `n`, die Quellindizes liegen im gültigen Bereich, `t0Ms` = Stundenboden der Abrufzeit.

---

## 6. Referenzvergleich (Hinweis, eine Nacht)

Temperatur-MAE gegen `truth`, gleiche Gültigkeitszeit:

| Gültig | Cube t1 roh | Cube t1 höhenkorr. (6,5 K/km) | MOSMIX (Lauf 21Z) | Live `fields` | Live `fusion.mu` |
|---|---|---|---|---|---|
| 22 UTC (n = 399) | 1,35 K (Lead 4) | 1,16 K | **0,56 K** (Lead 1) | – | – |
| 23 UTC (n = 183) | 1,76 K (Lead 5) | 1,45 K | 0,79 K (Lead 2) | 0,82 K | 0,52 K* |

\* möglicherweise Look-ahead, siehe 2.4.

Die Vorlaufzeiten sind nicht identisch, der Vergleich ist also nicht fair. Die Tendenz ist aber: Kurzfristig schlägt die aktuelle Fusion MOSMIX nicht.

---

## 7. Priorisierte Empfehlungen

1. **Höhenangleich je Quelle vor der Fusion** und konstante Quellenzusammensetzung je Stunde (2.1, 2.2).
2. **As-of-Grenze im Live-Pfad** durchsetzen: nur Daten ≤ Slotzeit. `createdAt` als Fertigstellungszeit führen oder ein `finishedAt` ergänzen (2.4).
3. **Live klären:** Welche Reihe gilt? Warum driftet der Wind? Gaußmodell für begrenzte Größen ersetzen, z. B. zensiert, log- oder logit-transformiert (2.3).
4. **Einzelwerte je Quelle archivieren**, sonst sind die Pflicht-Baselines und datenbasierten Gewichte nicht erreichbar (3.2).
5. **Druck:** entweder MSL-Vorhersage ableiten oder Beobachtungen auf ein einheitliches Niveau bringen. Die TAWES-Bezugsniveaus dokumentieren (2.5).
6. **Quantile t1** konsistent zum Mittelwert machen (3.1).
7. **Speicherformat von `live`** spaltenweise und ganzzahlig (3.7).
8. **Kleinere Punkte:** Plan-Off-by-one, Stationswahl Zell am See, Schlüsselnamen, Caveats aktualisieren, Konventionen dokumentieren (Vorzeichen `gammaEff`, Intervallsemantik Niederschlag).

---

## Anhang: Methode

- Die Auswertung erfolgte in Python direkt auf der JSON-Datei. Skalierung gemäß `scales`, Sentinel `-32768` ausgeschlossen.
- **Beobachtungsquelle je Punkt:** Priorität POI → TAWES → SMN, Abgleich über exakte Zeitstempel (`obsAtMs`).
- **Höhenkorrektur:** `T_punkt = T_modell − γ · (h_station − hModEff)`, mit γ = 6,5 K/km bzw. `gammaEff`.
- **Sägezahn-Metrik:** Residuum gegen den Mittelwert der Nachbarstunden, getrennt nach lokalem Maximum von `srcCount` und Höhensprung.
- **Quantil-Konsistenz:** Anteil `mu ∉ [q10, q90]`, nur Stunden, in denen alle drei Werte vorhanden sind.
