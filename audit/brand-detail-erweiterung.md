# Brand-Detailansicht erweitern (EFFIS-Fläche · Ausbreitung · Wetterführung) — Phase 1: Analyse

> Stand 2026-09-05. **Nur Analyse, kein Code.** Auftrag: A) EFFIS-Brandfläche, B) Ausbreitungsrichtung,
> C) Wetterführung im Brandzeitfenster — alles in der Detailansicht eines einzelnen Brandes,
> Kartenlayer nur solange sie offen ist, Vorhandenes wiederverwenden.
>
> **Kurzfassung: A und B sind zu großen Teilen gebaut und laufen. C läuft ebenfalls — aber auf einer
> Quelle, die der Auftrag als „blockiert" markiert. Die eigentliche Arbeit dieser Phase ist keine
> Neuentwicklung, sondern eine Quellen- und Transportfrage. Drei Vorgaben des Auftrags kollidieren
> mit dem Ist-Zustand; sie sind in §6 benannt und brauchen Jans Entscheidung, bevor Phase 2 beginnt.**

---

## 1. Wie die Detailansicht heute aufgebaut ist

**Es gibt zwei Darstellungen desselben Eintrags, aus denselben Bausteinen:**

| Ort | Komponente | Rolle |
|---|---|---|
| Mitte („Karte \| Dossier"-Umschalter, BD2) | `src/fire/FireDossier.tsx` (185 Z.) | Das Dossier: Kopf, Kennzahlen, Verlauf, Wetterlage, Satellitenbild, Einordnung, Merkmale |
| Rechte Spalte (Readout) | `src/fire/FireFootprintPanel.tsx` (894 Z.) | Liste + Detailkarte; **exportiert die Bausteine**, die das Dossier rendert (`RecordStats`, `DetailKennzahlenRows`, `DetailVerlauf`, `WeatherBlock`, `FeaturesRow`, …) |

`FireDossier` ist rein präsentational und hat **keine eigenen Inhalte** — jede Zeile kommt aus
`FireFootprintPanel`. Das ist der Ort, an dem neue Abschnitte entstehen: **eine neue Baustein-Komponente
dort, ein Aufruf im Dossier.** Kein zweiter Rechenweg, keine neue Seite.

**Datenfluss.** `FirePage.tsx` (2 514 Z.) hält allen Zustand:

```
FIRMS-Zeilen ─┬─ fireClusters ──┐
              └─ fireZones ─────┤
EFFIS-Polygone ── reconcile ────┼─→ buildFireRegistry → FireRecord[]  (footprint/fireRegistry.ts)
EMS-Aktivierungen ──────────────┘                          │
                                                           ├─ recordsById.get(selectedFootprint) → dossierRecord
                                                           └─ footprintsToGeoJSON → FireMap
```

**Öffnen/Schließen.** Zwei entkoppelte Zustände in `FirePage.tsx`:
`selectedFootprint: string | null` (welcher Brand) und `stage: 'map' | 'dossier'` (was die Mitte zeigt).
`openDossier(id)` (Z. 1082) setzt beides, `clearFootprint()` (Z. 1049) räumt Auswahl, Standort und
`focusBbox`. Beides steht im Permalink (`dossier: stage === 'dossier'`, Z. 1220). Ein Eintrag, der aus
dem Zeitfenster fällt, deselektiert sich selbst (Z. 985).

**Kopplung an die Karte.** Heute nur über **Filter**, nicht über Sichtbarkeit: `fire-footprints-sel-line`
und `-hover-line` bekommen `setFilter(['==', ['get','id'], selectedId])` (FireMap Z. 511–515). Die
Quellen und Layer selbst sind **immer montiert**; die Sichtbarkeit hängt an den Layer-Schaltern des Decks
— und seit heute sind `fireHotspots`, `fireFootprints`, `fireAnomalies`, `fireBurnt` **dauerhaft an**
(`FIRE_ALWAYS_ON` in `fireModel.ts`). Ein „Layer nur bei offener Detailansicht" gibt es im Brandradar
bisher **an keiner Stelle** — das wäre neues Verhalten (s. §6.3).

---

## 2. Was je Brand schon vorliegt

`FireRecord` (`footprint/fireRegistry.ts`, Z. 76–130) ist der vollständige Steckbrief:

| Feld | Inhalt |
|---|---|
| `sources.cluster` | FIRMS-Cluster inkl. **aller Rohzeilen** — `acq_date`/`acq_time` (→ `acqMs`), `confidence`, `frp`, `scan`/`track`, Satellit, Tag/Nacht |
| `passes: FirePass[]` | Überflüge (`overpasses.ts`): Zeit, Tag/Nacht, ΣFRP, Bbox, Schwerpunkt |
| `activity` | **`state` (Tendenz), `spreadBearingDeg`, `spreadDistanceM`, `windAgreement`, `windFromDeg`, `observation`, `areaEst`** |
| `sources.effis` | `BurntPolygon` (Geometrie, `FIREDATE`/`FINALDATE`, `AREA_HA`, Ort) — **oder `null`** |
| `sources.effisExtra`, `sources.ems` | weitere Kartierungen (gezählt), EMS-Aktivierung |
| `areaHa` | `{ value, kind: 'mapped' \| 'upper-bound', source, capped }` — nie eine Zahl ohne ihre Art |
| `confidence` | FIRMS-Konfidenzverteilung + Bewertung `bestätigt/plausibel/unbestätigt` mit Gründen |
| `landcover`, `place`, `anomaly`, `status`, `hotspots`, `overpasses`, `satellites`, `frpSumMw` | Landbedeckung (CLC-Maske), Ort (EFFIS oder Gazetteer), Anlagenstandort, Zustand |

**Convex Hull:** ja — `convexHull` in `fireClusters.ts`, als `geometry.kind: 'hull'` eine der vier Formen
(`effis` \| `raster` \| `hull` \| `point`); es wird immer **genau eine** gezeichnet.

**Vorberechnete Artefakte:** nur für die **Historie**, nicht für den Live-Bestand —
`public/fire/bh/` (Index Monat/Saison, Saison-Serie, Detail-Shards `ev/<jahr>/<monat>/<zelle>.json`),
dazu `public/fire/af/` (Kalibriermodell) und `public/fire/ta/` (Anlagenstandorte).
Ausgeliefert werden sie heute **aus `public/`, also über Netlify** — nicht über jsDelivr. Der nächtliche
Job, der sie erzeugt, ist **nie gebaut worden** (BH6 offen); `.github/workflows/nightly.yml` prüft nur
Upstream-Kontrakte. **Für den Auftrag heißt das: der „nächtliche GitHub-Actions-Job" existiert nicht und
wäre Teil der Umsetzung, nicht Voraussetzung.**

---

## 3. Ist die EFFIS-Brandfläche angebunden? — Ja, vollständig

Nicht nur der Hotspot-Layer. Belegt:

- **Quelle:** `sources/euContext.ts` — WFS gegen `maps.effis.emergency.copernicus.eu`, drei Zeitkörbe
  (Woche/Saison/Archiv), CC BY 4.0. Achsenreihenfolge über `wfsAxis.ts` geprüft, `maxfeatures` bewusst
  nicht serverseitig gedeckelt.
- **Karte:** eigene Fill+Line-Paare je Korb (`fire-burnt-week-fill/-line`, `-season-`, `-archive-`) plus
  die Registry-Flächen (`fire-footprints-fill/-line`) mit **eigener Hover- und Auswahl-Linie**
  (`FireMap.tsx` Z. 131–142, 180–182). Visuell getrennt von Hotspots und Hülle ist es damit schon.
- **Detailansicht:** `areaHa.value` + `kind: 'mapped'` + Quelle stehen in `DetailKennzahlenRows`;
  `DossierMapNote` sagt „Gezeichnet ist die EFFIS-Kartierung; sie läuft der Beobachtung 1–3 Tage nach."
- **Leerfall:** schon als Satz gebaut, nicht als leerer Platzhalter — `provisionalArea()` liefert
  „Vorläufige Brandfläche (geschätzt)" mit Begründung (VB0).

**Offen an A) bleibt genau eins:** der Grund, *warum* keine Kartierung vorliegt, wird heute allgemein
formuliert. Der Auftrag will die konkrete Aussage „EFFIS kartiert erst ab ~30 ha". Das ist eine
Textänderung an einer Stelle, kein Feature — **und sie braucht einen Beleg für die 30-ha-Schwelle**
(EFFIS nennt in seiner Doku 30 ha für die Rapid-Damage-Assessment-Schicht; das ist am Dienst zu prüfen,
bevor wir es als Zahl in die Oberfläche schreiben).

---

## 4. Ausbreitungsrichtung — der Kern ist gebaut, die Karte fehlt

`activity/dynamics.ts` (268 Z., AF2) rechnet **genau das, was der Auftrag beschreibt**:

- **Richtung:** Verschiebung des **FRP-gewichteten Schwerpunkts** (Mittel der früheren Überflüge → jüngster),
  Peilung in Grad „wohin" + Kompassrichtung (`compassLabel`).
- **Schwellen:** erst ab **drei** Überflügen und erst ab `SPREAD_MIN_M = 200 m` (halbe Pixelbreite) —
  darunter `null` mit Grund. Die vom Auftrag geforderte Pflicht „bei einer Detektion nicht bestimmbar"
  **ist bereits die Regel**: `stateNote` sagt „nur ein Überflug dieser Tageshälfte mit FRP — kein Verlauf".
- **Tendenz:** wachsend/stabil/abklingend, wobei Wachstum **räumliche** Ausdehnung verlangt
  (`extendsBeyond`, `GROWTH_MIN_M = 400 m`), nicht nur steigende FRP.
- **Windabgleich:** `windAgreement` vergleicht Ausbreitungs- und Windrichtung (±60° / ±120°) —
  **das ist die vom Auftrag gewünschte Winkeldifferenz-Kennzahl, bereits als Flag.**
- **Anzeige:** `FireFootprintPanel.tsx` Z. 752–757, „Schwerpunkt wandert nach **NO** (48°, 340 m
  zwischen den Überflügen)".

**Was fehlt:**

1. **Geschwindigkeit** — `spreadDistanceM` ist da, die Zeitspanne zwischen den Überflügen auch
   (`FirePass.atMs`); m/h wird nur nicht gebildet. Kleiner Zusatz in `dynamics.ts`.
2. **Konfidenz als eigene Zeile** — Anzahl Detektionen, Zeitspanne, mittlerer Abstand: alle drei
   Bestandteile liegen vor, keiner ist zusammengefasst.
3. **Der Kartenpfeil.** `fireSpread` (Bit 14, SF1: Pfeil + Fächer nach dem kanadischen FBP-System) wurde
   am **2026-08-23 zurückgezogen**, das Bit ist als `null` reserviert. Ein Pfeil müsste neu entstehen —
   und wäre inhaltlich ein **anderer**: SF1 modellierte die *erwartete* Ausbreitung aus Wind und Gelände,
   der Auftrag will die *beobachtete* aus den Detektionen. Das ist ehrlicher und billiger.
4. **Hotspots nach Erkennungszeit eingefärbt** — heute färbt der Layer nach Fenster/ortsfest
   (`--br-det` / `--br-grey-dot`). Eine zeitliche Rampe wäre neu, aber nur eine Paint-Expression.

**Der wichtigste Befund zu B):** Der Windabgleich ist seit dem Rückzug von Feuerwetter **tot geschaltet** —
die Waldbrandseite lädt kein Windgitter mehr, `windAt` bleibt undefiniert, `windAgreement` ist dauerhaft
`null` (dokumentiert im Modulkopf von `dynamics.ts`). Die Funktion ist unverändert nutzbar, **sobald ein
Aufrufer wieder Wind liefert** — genau das wäre C).

---

## 5. Wetterführung — läuft, aber auf einer Quelle, die der Auftrag ausschließt

### 5.1 Ist-Zustand

`detail/fireWeatherAtPoint.ts` (372 Z., BD1) holt auf Klick, einmal je Brand und Sitzung:
Wind (Richtung/Geschwindigkeit/Böen), T2m, relative Feuchte, Niederschlag, dazu Tagesreihe,
`precip24hBeforeMm`, „Tage seit Regen". Quelle: **`api.open-meteo.com/v1/forecast`** mit
`past_days=7` und `models=icon_seamless`. Gemessen: 7 Tage stündlich ≈ 9,4 KB.
Die Historie nutzt zusätzlich **ERA5 über Open-Meteo Archive** und **Meteostat/DWD-Stationen**
(`history/historyDetail.ts`).

Das erfüllt C) fachlich fast vollständig — **es fehlen** die Einstufung „brandtreibend/neutral/dämpfend",
der FWI, die Windrose und die Zeitreihen-Grafik.

### 5.2 Die Quellenfrage, die der Auftrag stellt

Der Auftrag markiert **open-meteo als blockiert**. Sachlage: Open-Meteo stellt die Daten unter CC BY 4.0,
die **API** aber ist „free for non-commercial use" mit Tageskontingent; kommerzielle Nutzung verlangt ein
bezahltes Konto. Nach der Regel des Auftrags („keine Freemium-Kontingente") ist das tatsächlich blockiert
— **und der Bestand nutzt es an drei Stellen** (Brand-Dossier, Historie-Detail,
`src/sources/openMeteoForecast.ts` auf der Wetterkarte). Das ist kein Detail dieser Phase, sondern
eine repo-weite Entscheidung (§6.1).

### 5.3 Windfelder für zurückliegende Zeiträume — die eigentliche technische Frage

**Befund: ICON-D2 wird nicht archiviert.** DWD hält auf `opendata` je Familie nur die jüngsten Läufe
(Stunden, nicht Tage). Ein Brand liegt bis zu 7 Tage zurück. **Ohne Mitschreiben gibt es die
Brandzeitfenster-Wetterlage aus ICON-D2 nicht** — weder heute noch später.

Drei Wege, ehrlich gegeneinander:

| Weg | Was er liefert | Kosten / Risiko |
|---|---|---|
| **W1 — nächtlicher Job schreibt Punktreihen je Brand mit** | Für jeden Brand des Tages die ICON-D2-Stundenwerte am Brandort (Wind/Böe/T2m/RH/Regen), als JSON ins Daten-Repo, Auslieferung über jsDelivr | Der Job müsste **täglich** laufen und GRIB dekodieren — der Decoder ist Client-Code (`src/grib/*`), in Node über `--experimental-strip-types` lauffähig (die Verifier tun das). Aufwand mittel, Datenmenge klein (≈ 2 KB je Brand). **Er kann nur mitschreiben, was ab seinem Start passiert** — für Altbrände bleibt eine Lücke |
| **W2 — DWD-Stationsstundenwerte als Rückfall** | `opendata.dwd.de/climate_environment/CDC/observations_germany/climate/hourly/{wind,air_temperature,precipitation,extreme_wind}/recent/` — **gemessene** Werte, stündlich, „recent" reicht rund 500 Tage zurück, **DL-DE/BY-2.0 (kommerziell erlaubt, kein Schlüssel)**. Der Pfad `/_dwd_opendata` existiert bereits | **Taugt als Rückfall, nicht als Ersatz.** Eine Station ist im Mittel 10–30 km entfernt; Wind an einem Waldbrandhang ist damit nicht beschrieben. Nur mit Stationsname und Entfernung im selben Satz zeigbar. **Nur DE** — für AT/CH braucht es GeoSphere Datahub (CC BY 4.0, kein Schlüssel) bzw. MeteoSchweiz/opendata.swiss |
| **W3 — Windfeld wieder live laden und nur „jetzt" zeigen** | Reaktiviert `windAgreement` für den jüngsten Überflug | Beantwortet die Frage des Auftrags **nicht** (Brandzeitfenster ≠ jetzt) und holt die Ladelast zurück, die der Rückzug 2026-08-23 losgeworden ist |

**Empfehlung: W1 als Regelweg, W2 als benannter Rückfall und zugleich als Prüfmaß** (die Station sagt,
ob das Modell am Brandort grob danebenliegt). Beides zusammen ist auch der einzige Weg, der die
Auftrags-Constraints (kein Schlüssel, kein Kontingent, kommerziell erlaubt, kein Backend) ohne Ausnahme
einhält. Dass W1 rückwirkend blind ist, muss die Oberfläche sagen.

### 5.4 FWI aus GWIS — so nicht

Der Auftrag nennt „FWI aus GWIS". **Gemessener Befund (E0, `audit/waldbrand-effis.md` §4.1): kein Layer
des Dienstes ist `queryable`, `GetFeatureInfo` liefert für jedes Format eine Fehlermeldung.** Wir bekommen
ein Bild, keine Zahl. Drei Möglichkeiten:

- **F-a) Farbe aus dem Bild lesen** → eine Klasse, kein Wert; abhängig von der Legende; fragil. Als
  „Kachelfarbe" war das für das Brand-Feature-Konzept schon einmal vorgesehen (Freigabe F2, offen).
- **F-b) FWI selbst rechnen.** Der Rechenkern existierte: `src/fire/fwi/fwi.ts` (380 Z., cffdrs-Vektoren)
  wurde am **2026-08-24 in `e212fc1` gelöscht** und ist aus der Historie wiederherstellbar. Mit W1
  (Stundenwerte am Brandort) sind FWI/FFMC/ISI **rechenbar** — dann als **abgeleitet** gekennzeichnet,
  nicht als GWIS-Wert ausgegeben.
- **F-c) weglassen und die GWIS-Karte verlinken.** Die ehrlichste billige Variante.

**Empfehlung: F-b im nächtlichen Job, klar als eigene Rechnung beschriftet** — nie „FWI laut GWIS".

### 5.5 Einstufung „brandtreibend / neutral / dämpfend"

Neu zu bauen, klein, rein. Der Auftrag verlangt, die Heuristik offenzulegen — das entspricht dem
Hausmuster (`fireAssessment.ts` führt `reasons: string[]` mit; `provisionalArea()` nennt seine Regel im
Text). Umsetzung als reine Funktion mit ausgeschriebenen Schwellen und einem Satz je Beitrag.

---

## 6. Kollisionen mit dem Ist-Zustand — brauchen eine Entscheidung

### 6.1 „Keine Freemium-Kontingente" trifft den Bestand, nicht nur den Neubau
Open-Meteo ist an **drei** Stellen im Code (Brand-Dossier, Historie-Detail, Wetterkarte). Der Auftrag
verlangt, kollidierende Quellen als „blockiert" zu markieren statt zu umgehen. Konsequent angewandt
hieße das: **eine laufende, sichtbare Funktion verliert ihre Datenquelle** — und das steht gegen die
oberste Direktive Funktionserhalt. Drei Auswege:

- **(a)** Neubau nur auf DWD/GeoSphere/MeteoSchweiz; Bestand bleibt bis zu einem eigenen Vorgang stehen,
  die Kollision wird als V-Eintrag geführt. *(Empfehlung — der Auftrag wird für alles Neue eingehalten,
  nichts Bestehendes bricht.)*
- **(b)** Bestand mit umziehen — deutlich größerer Vorgang, betrifft die Wetterkarte, eigene Phase.
- **(c)** Open-Meteo bleibt bewusst zugelassen (Jans Entscheidung), dann fällt die Blockade weg.

### 6.2 „Keine Laufzeit-Calls gegen FIRMS oder EFFIS"
Das ist heute **die Architektur des ganzen Brandradars**: FIRMS läuft live über `/_firms` (Edge-Funktion,
Schlüssel serverseitig — der vom Auftrag ausgeschlossene „API-Key-Zwang" gilt hier bereits, nur eben
verdeckt), EFFIS-Flächen kommen live per WFS, EMS live. Ein Umzug in den nächtlichen Job wäre eine
**Neuarchitektur des Live-Bestands** und würde die Aktualität von Minuten auf 24 h senken —
für ein *aktives* Feuer der falsche Tausch. Vorschlag: **die Regel gilt für die neuen, abgeleiteten
Daten** (Wetterreihen, FWI, Ausbreitungskennzahlen) — die haben ohnehin keinen Nutzen in Echtzeit.
Der Live-Pfad bleibt, wie er ist.

### 6.3 „Layer nur bei offener Detailansicht"
Steht im Widerspruch zu der heute umgesetzten Entscheidung, dass `fireHotspots`, `fireFootprints`,
`fireAnomalies` und `fireBurnt` **dauerhaft aktiv** sind. Auflösung, die beides erfüllt: die
**vorhandenen** Layer bleiben dauerhaft an, und die **neuen** Detail-Layer (Ausbreitungspfeil,
zeitgefärbte Hotspots dieses Brandes, hervorgehobene EFFIS-Fläche) sind eine eigene, kleine
Layer-Gruppe, die an `selectedFootprint != null` hängt und beim Schließen abgeräumt wird. Sie tauchen
gar nicht erst im Deck-Schalter auf — sie gehören zur Ansicht, nicht zum Kartenangebot.

---

## 7. UI- und Chart-Bibliothek

**Es gibt keine.** Laufzeit-Abhängigkeiten sind vollständig: `maplibre-gl`, `react`, `react-dom`,
`react-router`, `bz2`, `bzip2-wasm`, `jsfive`. Charts sind **handgeschriebenes SVG** (D-06) —
`FirePassChart.tsx` (FRP je Überflug, log-Achse, Lücken schraffiert), `FireHistoryChart.tsx`,
dazu die Saison-Charts der Historie. Sie sind responsiv über `viewBox` und tragen `font-family`
ausdrücklich an jedem `<text>` (sonst erbt SVG die Browser-Standardschrift, Befund B1).

**Vorschlag: keine neue Abhängigkeit.** Begründung mit Zahlen:

| Kandidat | Bundle (min+gzip, Größenordnung) | Verhältnis |
|---|---|---|
| Windrose + Zeitreihe von Hand (SVG) | **≈ 3–5 KB** | ein Modul im Muster von `FirePassChart` |
| Recharts | ≈ 95 KB (+ D3-Teile) | **rund +9 % auf `totalJs` 1 089 KB** |
| MUI X Charts | ≈ 120 KB (+ Emotion) | zusätzlich ein zweites Styling-System neben D-27 |

Die Ratsche `npm run budget` steht bei 1 089,3/1 109,8 KB — **20,5 KB Luft**. Recharts passt schlicht
nicht hinein, ohne die Ratsche zu heben. Eine Windrose ist zudem genau die Grafik, die eine
Allzweck-Bibliothek schlecht kann (Polarsektoren mit Klassen je Geschwindigkeit) und ein
80-Zeilen-SVG gut.

---

## 8. Umsetzungsoptionen

**Option 1 — „Nur die Detailansicht" (klein, ohne neuen Job, ohne Quellenwechsel)**
A) 30-ha-Satz im Leerfall · B) Geschwindigkeit + Konfidenzzeile + Detail-Layer mit Pfeil und
zeitgefärbten Hotspots · C) Einstufung + Windrose + Zeitreihe **aus den heute schon geholten
Open-Meteo-Werten**. Kein Actions-Job, kein Daten-Repo.
*Ergebnis:* alle drei Blöcke sichtbar in 1–2 Phasen. *Preis:* C) bleibt auf der blockierten Quelle (6.1c).

**Option 2 — „Detailansicht + eigener Wetterpfad" (Empfehlung)**
Wie Option 1, aber C) bekommt seine Daten aus einem **neuen nächtlichen Job**: ICON-D2-Punktreihe je
Brand (W1) ins Daten-Repo, FWI selbst gerechnet (F-b, Kern aus `e212fc1` zurückholen), DWD/GeoSphere-
Stationswerte als benannter Rückfall (W2) — und damit auch `windAgreement` wieder lebendig.
*Ergebnis:* erfüllt alle Constraints außer 6.2 (dort mit der Auslegung aus §6.2). *Preis:* drei Phasen,
und für Brände **vor** dem Start des Jobs gibt es keine Reihe — das muss die Oberfläche sagen.

**Option 3 — „Alles ins Daten-Repo" (nicht empfohlen)**
Zusätzlich FIRMS/EFFIS in den Job. *Preis:* aktive Feuer wären bis zu 24 h alt. Für ein Produkt, dessen
Kern „was brennt gerade" ist, der falsche Tausch.

---

## 9. Was vor Phase 2 entschieden werden muss (Jan)

1. **§6.1** — Open-Meteo: (a) nur Neubau umstellen, (b) alles umstellen, (c) zugelassen lassen?
2. **§6.2** — gilt „keine Laufzeit-Calls" für den Live-Bestand oder nur für die neuen Ableitungen?
3. **§5.3** — W1 (nächtlicher ICON-D2-Mitschrieb) bauen? Er ist ein **neuer Actions-Workflow mit
   Commit-back** und damit nach CLAUDE.md ausdrücklich **STOPP & FRAGEN**.
4. **§5.4** — FWI selbst rechnen (F-b) oder GWIS nur verlinken (F-c)?
5. **Option 1, 2 oder 3.**

**Kein Code, bis diese fünf beantwortet sind.**

---

## 10. Jans Entscheidungen (2026-09-05) und was daraus folgte

| Frage aus §9 | Jans Antwort | Folge |
|---|---|---|
| §6.1 Open-Meteo | „bei historischen Wetterdaten kommen wir nicht an Open-Meteo vorbei, das ist okay — nur nicht für neue" | Die Wetterführung nutzt **die Reihe, die ohnehin geholt wird**. Kein neuer Endpunkt, kein zweiter Abruf. Für Live-/Vorhersagegrößen bleibt Open-Meteo kein Weg. |
| §6.2 keine Laufzeit-Calls | „ich weiß nicht, was damit gemeint ist, ist aber auch nicht notwendig. Wenn man den API-Key unbedingt braucht, ist er okay." | Der Live-Pfad (FIRMS über `/_firms`, EFFIS-WFS, EMS) bleibt **unverändert**. |
| §6.3 Layer nur bei offener Detailansicht | „ich meine damit, dass diese Ansicht in die Detailansicht eines Brands einfließt" | **Missverständnis meinerseits aufgelöst**: es ging nie um Layer-Sichtbarkeit. Alles Neue steht in der Detailansicht; an den Kartenlayern wurde nichts geändert. |
| §5.4 FWI | (mit der Umsetzung angekündigt, nicht widersprochen) | **F-b, aber nur zur Hälfte**: FFMC und ISI werden selbst gerechnet, der Gesamt-FWI **nicht** — s. §10.2. |
| §8 Option | „starte mit allen Phasen" | **Option 1** — Detailansicht, ohne Datenpfad-Umbau, ohne neuen Actions-Job. |

### 10.1 Der Befund, der A) umgedreht hat

Der Auftrag verlangte den Satz „EFFIS kartiert erst ab ~30 ha". **Diese Aussage ist falsch, und das
Repo wusste es schon** (`audit/waldbrand-effis.md`, Befund B3): sie gilt nur für die MODIS-Ära
(kleinste Fläche je Jahr 2016–2019: 52/34/22/21 ha). **Ab 2020/21 kartiert EFFIS Sentinel-2-gestützt
bis 0–2 ha**; Saison 2026 in DACH: 293 Flächen, **Median 5 ha, 231 davon unter 30 ha**.

Statt sie in die Oberfläche zu schreiben, sagt der Begründungstext jetzt das Gegenteil — mit den
gemessenen Zahlen im Satz, damit die alte Regel nicht über eine Umformulierung zurückkommt. Zwei
Fälle, weil sie Verschiedenes bedeuten: **jünger als 3 Tage** („kein Befund" — die Kartierung läuft
der Beobachtung nach) und **älter** (dann die möglichen Gründe: keine wolkenfreie Sentinel-2-Szene,
kein Vegetationsbrand, oder schlicht nicht kartiert — *welcher* zutrifft, sagt keine Quelle).
Die Konstanten und der Beleg stehen in `fireRegistry.ts` (`EFFIS_LAG_DAYS`, `EFFIS_SIZE_EVIDENCE`).

### 10.2 Was bei C) bewusst NICHT ausgegeben wird

`GWIS` liefert den FWI nur als **Bild** — kein Layer des Dienstes ist `queryable` (gemessen, E0).
Selbst rechnen geht, der geprüfte Kern ist wieder da (s. §10.3) — **aber nur teilweise ehrlich**:

| Größe | Zeitkonstante | 7-Tage-Reihe reicht? |
|---|---|---|
| FFMC (Feinbrennstoff) | Stunden | **ja** — 24 h Vorlauf im Fenster, erste 12 h als Vorlauf markiert |
| ISI (= f(FFMC, Wind)) | mit FFMC | **ja** |
| DMC | ~15 Tage | grenzwertig |
| DC (Trockenheit) | **~52 Tage** | **nein** |
| BUI, FWI | erben DC | **nein** |

Deshalb: **FFMC und ISI ja, Gesamt-FWI nein.** Die Oberfläche sagt das im Klartext und verlinkt für
den FWI die GWIS-Karte, statt eine Zahl zu erfinden. Ein FWI aus einer 7-Tage-Kette hätte wie ein
Messwert ausgesehen und wäre einer gewesen, der seinen Trockenheitsanteil nicht kennt.

### 10.3 Der FWI-Kern kam zurück, nicht neu gebaut

`src/fire/fwi/fwi.ts` (380 Z., cffdrs-Vektoren) wurde am 2026-08-24 in `e212fc1` gelöscht.
Wiederhergestellt aus der Historie, samt `scripts/verify-fire-fwi.mjs` und der Fixture
`scripts/fixtures/fire-fwi-vectors.json` (die im Repo überlebt hatte). **`verify:fire-fwi` 43/43**
gegen die Referenzvektoren von Natural Resources Canada — ein zurückgeholtes Modul, das seine
Richtigkeit selbst belegt, ist billiger und besser als ein neu geschriebenes.

### 10.4 Zwei Ehrlichkeitsentscheidungen in B)

1. **Die Geschwindigkeit heißt „Verlagerung", nicht „Ausbreitungsgeschwindigkeit".** Sie ist die
   Wanderung eines FRP-Schwerpunkts zwischen Momentaufnahmen im Abstand von Stunden: erlischt eine
   Flanke und entzündet sich eine andere, „bewegt" sich der Schwerpunkt, ohne dass etwas gelaufen
   wäre. Weg und Zeit kommen aus **derselben** FRP-Gewichtung — sonst gehörten Zähler und Nenner
   nicht zusammen.
2. **Die Konfidenzzeile kann gegen die Richtung sprechen.** Ist der mittlere Schritt zwischen
   aufeinanderfolgenden Schwerpunkten mehr als doppelt so groß wie die Gesamtverschiebung, springt
   der Schwerpunkt hin und her, statt sich zu verlagern — dann sagt die Zeile „die Richtung ist grob".

### 10.5 Windrose: warum kein arithmetisches Mittel

350° und 10° mitteln sich arithmetisch zu **180°** — genau der Gegenrichtung. Richtungen werden
deshalb als geschwindigkeitsgewichtete Einheitsvektoren addiert; die Länge der Summe geteilt durch
die Summe der Geschwindigkeiten ist die **Beständigkeit** („wind constancy", 0 = dreht ständig,
1 = konstant). Unter 0,5 gibt es **keine** vorherrschende Richtung — die Rose zeigt dann nur die
Verteilung. Rose („woher der Wind kommt") und Ausbreitungspfeil („wohin das Feuer läuft") tragen
gegensätzliche Konventionen; beide stehen im selben Bild und beide sagen ihre Konvention dazu.

### 10.6 Charts ohne Bibliothek

Windrose und Zeitreihe sind handgeschriebenes SVG (D-06). Recharts (≈ 95 KB) hätten in die
Budget-Ratsche mit 20,5 KB Luft nicht gepasst, ohne sie zu heben. Farben ausschließlich aus
vorhandenen Tokens: die Stärkeklassen der Rose sind die Sand-/Stein-Leiter hell → dunkel
(schwach → stark), die Einstufung nutzt Rot/Stein/Steel. **Keine neue Hex-Farbe** — im Gegensatz
zu SAT3 (§13.5 dort) war hier keine Ausnahme nötig.

### 10.7 Belege

| Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` | grün |
| `npm run verify:fire-fwi` | **43/43** (cffdrs-Referenzvektoren) |
| `npm run verify:fire-detail` | **405/405** (davon 29 Selbstprüfungen `fireDrivers.ts` + 25 `[bde]`-Sonden) |
| `npm run verify:fire-activity` | s. §10.8 — zwei Altfehler, ein Perf-Anker |

### 10.8 Drei Fehlschläge, die NICHT aus dieser Phase stammen

`verify:fire-activity` meldet drei Fehler. Alle drei wurden gegen den Stand **vor** dieser Phase
gegengeprüft und bestehen dort ebenso:

1. **`(f) FirePage: Windabgleich nur mit Frame ±3 h`** — die Sonde sucht den Wind-Sampler in
   `FirePage.tsx`. Den gibt es seit dem Rückzug von Feuerwetter (2026-08-23) nicht mehr; die Sonde
   ist der Rest einer entfernten Funktion. **V-BDE-1**: Sonde auf den heutigen Zustand ziehen
   (Windabgleich kommt jetzt aus der Modell-Stundenreihe, nicht aus einem Layer-Frame).
2. **`(h) Panel: Zeile „Schätzung" nutzt estimateLabel`** — die Zeile existiert, ruft aber seit VB3
   anders auf. **V-BDE-2**: Sonde nachziehen.
3. **`[registry] BP1-Selbstverifikation` — Perf-Anker 3 000 Detektionen < 150 ms.** Gemessen mit
   baugleichem Aufbau: **Stand vor dieser Phase 293 ms, danach 330 ms** — beide über der Schwelle,
   der Anker war also schon rot. Die ~12 % kommen von der neuen Konfidenz-Zählung (ein O(n)-Lauf je
   Eintrag über die Überflüge). Zur Einordnung: der Prüffall baut **3 284 Einträge**, der DACH-Alltag
   liegt bei 50–100. **V-BDE-3**: entweder die Schwelle an einen realistischen Umfang binden oder die
   Konfidenz erst beim Anzeigen rechnen (sie wird nur im Dossier gebraucht, also einmal je Klick).

Kein Fehlschlag betrifft eine ausgelieferte Funktion.
