ist der # Konzept: Brand-Historie im Waldbrand-Feature (v2)

Stand: 22.08.2026 · buscosun, `src/fire/`

> Änderung gegenüber v1: dNBR-Verifikation ist **kein** Filterkriterium mehr. Begründung siehe Abschnitt 2.

## 1. Ziel

Nutzer sollen das Brandgeschehen über wählbare Zeitfenster sehen, mit einer Detailansicht je Ereignis, die offenlegt, was bekannt ist und was nicht.

## 2. Datenlage — die zwei bestimmenden Fakten

**Kleine Brände dominieren.** Der durchschnittliche deutsche Waldbrand lag 2025 bei gut 2 ha (1.175 Brände / 2.626 ha). EFFIS kartiert erst ab ~30 ha. Kleine Brände werden von VIIRS oft mit genau einer Detektion erwischt — oder gar nicht.

**Der dominante Fehler ist Omission, nicht Commission.** Die VIIRS-375m-Validierung ergab Commission Errors unter 1,2 % für Nominal-Confidence-Pixel; nachts außerhalb der Südatlantischen Anomalie vernachlässigbar, urbane Fehlalarme global bei 0,03 %. Demgegenüber liegen die Detektionsraten für Brände unter 50 ha bei nur 15–70 %.

Entscheidend ist außerdem die **Struktur** der Fehlalarme: sie fallen räumlich mit festen Wärmequellen zusammen (Vulkane, Gasfackeln, Stahlwerke). Kein Zufallsrauschen, sondern ein Ortseffekt — also mit einer Ortsmaske abfangbar, nicht mit Einzelfallprüfung.

**Daraus folgt:**

- Kein harter Filter auf Einzeldetektionen. Er würde genau die typischen DACH-Brände wegwerfen und den ohnehin großen Omission-Fehler vergrößern.
- Keine dNBR-Verifikation als Bedingung fürs Auftauchen in der Liste. Der Aufwand steht in keinem Verhältnis zu einer Fehlerrate von ~1 %, die zudem systematisch und billiger abfangbar ist.
- Drei billige Signale genügen: Baseline-Persistenz, Industrie-Co-Lokation, Confidence-Feld.

*Vorbehalt: die Zahlen stammen aus der globalen Algorithmus-Validierung, nicht aus einer DACH-spezifischen Studie. Für Mitteleuropa (kein Sun Glint über Wüstensand) eher konservativ.*

## 3. Zeitfenster

Vier antippbare Fenster: **24 Stunden**, **7 Tage**, **dieser Monat**, **Saison**.

- 24h und 7 Tage rollend, Monat als Kalendermonat.
- „Saison" statt „dieses Jahr", weil ein Kalenderjahr-Fenster im Januar leer wäre.
- Jedes Fenster wird im nächtlichen GitHub-Actions-Job als **fertiges Artefakt** erzeugt und auf R2 abgelegt. Kein FIRMS-Call zur Laufzeit.
- Antippen lädt die statische Datei — Lazy Loading auf Artefaktebene, nicht auf API-Ebene.

## 4. Datenquellen

### FIRMS Archiv (Primärquelle)

```
/api/area/csv/[MAP_KEY]/[SOURCE]/[BBOX]/[DAY_RANGE]/[DATE]
```

- Liefert DATE bis DATE + DAY_RANGE-1, DAY_RANGE max. 5.
- Archivquellen: `MODIS_SP`, `VIIRS_SNPP_SP`, `VIIRS_NOAA20_SP` (Standard Processing, geolokatorisch genauer als NRT).
- Aktueller Rand über NRT, da SP mit Wochen bis Monaten Verzögerung kommt.
- `/api/data_availability/` liefert pro Sensor den SP-Cutover-Punkt.
- Volle Saison DACH: ~35 Requests pro Sensor. Limit 5.000 Transaktionen / 10 min — unkritisch.
- MAP_KEY als GitHub-Secret, Client geht nie direkt gegen FIRMS.

### Ergänzend

- **Mehrjahres-Baseline** aus dem FIRMS-Archiv (3–5 Jahre): Rastermaske ortsfester Quellen. **Der wichtigste Vorarbeitsschritt.**
- **MaStR-Standorte** aus dem Anlagenatlas: Co-Lokation Industrie.
- **EFFIS**: Perimeter ab ~30 ha mit Attributen (`firedate`, `area_ha`, Landbedeckungsanteile, Natura-2000-Anteil) — Anreicherung, keine Bedingung.
- **Sentinel-2 dNBR** (eigene Pipeline): Perimeter und Brandschwere für große Brände — Anreicherung der Detailansicht, kein Gatekeeper.

## 5. Ereignisbildung

Detektionen werden räumlich und zeitlich zu Ereignissen geclustert. Aus dem Archiv einfacher als live, weil der komplette Verlauf auf einmal vorliegt.

Abgeleitet pro Ereignis: Erstdetektion, Letztdetektion, Dauer, Detektionsanzahl, Anzahl beteiligter Überflüge, max. FRP, Summe FRP, räumliche Ausdehnung, Zentroid, Confidence-Verteilung.

## 6. Klassifikation

### Drei Signale

| Signal | Zweck |
|---|---|
| Persistenz gegen Mehrjahres-Baseline | Trennt ortsfeste Quellen ab — deckt den Großteil der bekannten Fehlalarm-Klasse |
| Co-Lokation MaStR / Industriestandort | Bestätigt und ergänzt die Baseline |
| Confidence-Feld des Sensors | Low-Confidence-Detektionen (tagsüber ~11 % aller Detektionen) runtergewichten, nicht löschen |

Ergänzend als Kontext, nicht als Filter: Landbedeckung am Detektionsort, FRP, räumliche Ausdehnung des Clusters.

### Zwei Klassen plus Randfall

1. **Vegetationsbrand** — Standardanzeige im Reiter „Brände". Einzeldetektionen zählen ganz normal dazu.
2. **Ortsfeste Anomalie** — Reiter „Thermalanomalien".
3. **Unklar** — nur wo Baseline-Treffer und Vegetationskontext widersprüchlich sind. Über Filter erreichbar, nicht in der Standardansicht.

Nichts verschwindet stillschweigend; die Voreinstellung filtert nur die Anzeige.

## 7. Nachkorrektur

Die Historie ändert sich ohnehin, unabhängig von der Klassifikation:

- **FIRMS SP ersetzt NRT** — Detektionen können verschoben werden oder wegfallen.
- **EFFIS-Perimeter** tauchen nachträglich auf (nur ≥ ~30 ha).
- Jahresstatistiken (BLE, BOKU) haben keine Geometrie und keine Ereignis-IDs — taugen nur zur Plausibilisierung von Gesamtzahlen auf Bundeslandebene.

**Klassifikation deshalb als versionierter Zustand:** Ereignisse tragen ein Auswertungsdatum. Ein nächtlicher Job re-evaluiert die letzten Wochen, wenn neue Evidenz eintrifft. **Evidenz speichern, nicht nur das Urteil** — alle Einzelsignale persistieren, damit Schwellen später änderbar sind und die Historie neu bewertet werden kann, ohne alles neu zu ziehen.

## 8. Auslieferung

**Index pro Zeitfenster** (statisch auf R2): nur Ereignis-Zusammenfassungen — Position, Zeitraum, Detektionsanzahl, max. FRP, Klassifikation, Konfidenz.

**Detail pro Ereignis** (nachgeladen beim Antippen): Einzeldetektionen, Hull/Polygon, volle Attribute, Evidenzaufstellung.

### Inhalte der Detailansicht

1. **Betrifft mich das?** — Entfernung, Richtung, Windrichtung zum Brandzeitpunkt (Rauchfahne)
2. **Was ist passiert?** — Beginn, Dauer, Status, Fläche mit Anker („entspricht X Fußballfeldern")
3. **Ökologischer Kontext** — Waldtyp aus EFFIS-Landbedeckung, Natura-2000-Anteil (wo vorhanden)
4. **Wetterlage am Brandtag** — Temperatur, Wind, Luftfeuchte aus ICON/Fusion; Tage seit letztem Niederschlag; FWI aus GWIS; Hangneigung/Exposition. **Der Teil, den kein anderer Anbieter hat.**
5. **Wie geht es weiter?** — Regen in Sicht, Brandgefahr Folgetage aus dem eigenen Forecast
6. **Datengrundlage** — Sensor, Anzahl Überflüge, Confidence; bei Einzeldetektion offen benennen („Einzeldetektion, keine Bestätigung durch weiteren Überflug")

Detektionsgrenze transparent machen: kleine Brände fehlen systematisch. Ein Hinweis dazu gehört ins Feature, sonst wird eine leere Karte als „keine Brände" gelesen.

## 9. Übersichtsebene

Saisonverlauf gegen langjähriges Mittel als Chart in der Übersicht — die Kennzahl, die EFFIS selbst als Kernaussage führt und die Wiederbesuche erzeugt.

## 10. Reihenfolge der Umsetzung

1. **Mehrjahres-Backfill FIRMS** → Baseline-Maske. Muss vor allem anderen stehen, sonst sind die Schwellen geraten.
2. Ereignis-Clustering auf dem Archiv, Parameter empirisch bestimmen
3. Klassifikation + Evidenzspeicherung
4. Artefakt-Generierung pro Zeitfenster, Ablage auf R2
5. UI: Zeitfenster-Umschaltung, Index, Detailansicht
6. Anreicherung: EFFIS-Match, Wetterlage aus Fusion, dNBR für große Brände

## 11. Offene Punkte

- Cluster-Parameter (Radius, Zeitfenster) empirisch bestimmen
- Backfill-Umfang der Baseline: 3 oder 5 Jahre
- Schwellenwert für „ortsfest": ab wie vielen Tagen in wie vielen Jahren
- Umgang mit Rasterzellen, die sowohl Baseline-Treffer als auch Waldbedeckung haben
