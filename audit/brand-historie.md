# Brand-Historie — Diagnose BH0 + Umsetzungsplan BH1–BH6

Stand: 2026-08-22 · Grundlage: `history_feature/konzept-brand-historie-v2.md` (Konzept v2)
Status: Diagnose 2026-08-22; **Jans Freigabe 2026-08-22: alle Defaults aus §4, Q6 = Ja** (Saisonverlauf-Chart als BH5).

## 1. Ziel (aus dem Konzept, unverändert)

Brandgeschehen über vier Zeitfenster (24 h · 7 Tage · Monat · Saison) mit Ereignis-Index
und Detailansicht je Ereignis, die offenlegt, was bekannt ist und was nicht. Vegetationsbrände
und ortsfeste Anomalien getrennt, nichts verschwindet still, Klassifikation als versionierter
Zustand mit gespeicherter Evidenz.

## 2. Befund am Code — was schon existiert

Das Konzept beschreibt zu rund der Hälfte Bestand. Die folgenden Bausteine werden **importiert,
nicht nachgebaut** (Lehre GBC1: ein Clustering im Projekt; Lehre AF3: ein Merkmalsschema):

| Konzept | Bestand | Datei |
|---|---|---|
| §4 FIRMS-SP-Archiv, 5-Tage-Chunks, DACH, Schlüssel lokal | fertig; Cache `.cache/firms-archive` 48 MB, 2020–2026 ganzjährig | `scripts/fire/ta/fetch-archive.mjs`, `scripts/fire/pairs-from-archive.mjs` |
| §4/§10.1 Mehrjahres-Baseline ortsfester Quellen | fertig: Regel ≥ 2 Jahre × ≥ 5 Tage + EFFIS-Veto, 469 Zellen → 218 Standorte | `scripts/fire/ta/persistence-grid.mjs`, `build-sites.mjs`, `public/fire/ta/thermal-sites-v1.json` |
| §6 Co-Lokation Industrie | fertig, breiter als MaStR: E-PRTR v16 + MaStR + BFE, Join ≤ 1,5 km | `scripts/fire/ta/facilities.mjs` |
| §6 Confidence als Gewicht | vorhanden (`FirmsConfidence`, `confidenceOpacity`) | `src/fire/sources/firmsHotspots.ts:82,361` |
| §6 Klassen Brand / Anomalie + Reiter | fertig: `FireRecord.anomaly` `site` / `site-deviating`, Layer Bit 15 | `src/fire/anomaly/classify.ts` |
| §5 Ereignisbildung | fertig für das 7-Tage-Fenster: `spatialClusters` + Zeitlücke `GAP_MS = 48 h` | `src/fire/fireEvents.ts:70,136` |
| §5 überflugstabile ID, Merge/Split | fertig (Anker = älteste Detektion) | `src/fire/footprint/fireRegistry.ts:21,247` |
| §5 Ereignis-Attribute (Erst/Letzt, Überflüge, FRP max/Summe, Ausdehnung) | fertig | `src/fire/activity/{overpasses,intensity,features}.ts` |
| §7 „Evidenz speichern, nicht nur das Urteil" | Schema existiert: `FireFeatures` v1, versioniert, deterministisch | `src/fire/activity/features.ts:53` |
| §8.1 Entfernung/Richtung/Wind | fertig (Panel, `windPointSample.ts`, AF2-Windflag) | `src/fire/FireFootprintPanel.tsx` |
| §8.2 Fläche mit Anker + Intervall | fertig (AF4-Schätzung, „Vorläufige Brandfläche (geschätzt)") | `src/fire/activity/estimate.ts` |
| §8.3 EFFIS-Landbedeckung, Natura | fertig (`landcoverAt`, `landcover[].key`) | `src/fire/footprint/{fireRegistry,reconcile}.ts` |
| §8.5 Brandgefahr Folgetage | fertig (`fireSpread`-Punktkurve, ISI-Raster) | `src/fire/spread/*` |
| §8.6 Einzeldetektion offen benennen | fertig (Beobachtungsqualifikation) | `src/fire/activity/observation.ts` |
| Zeitfenster-Mechanik | `mode: 'window'`, `windowsH: [24, 168]`, Permalink-Feld `w` | `src/fire/fireTime.ts:84,121`, `fireState.ts:105` |

**Neu sind nur drei Dinge:** (a) Fenster länger als 7 Tage, (b) ein vorgerechneter Ereignis-Index
je Fenster statt Live-Abruf, (c) Nachkorrektur (SP ersetzt NRT, EFFIS kommt nach).

## 3. Befund am Code — wo das Konzept dem Repo widerspricht

| # | Konzept sagt | Repo-Stand | Folge |
|---|---|---|---|
| W1 | Artefakte auf **R2** (§3, §8, §10.4) | R2 existiert nicht; zweimal abgelehnt (`audit/brandflaechen-panel.md:100`, Jan 2026-08-19 `audit/waldbrand-forecast.md:379`) | Ablage = **Commit-back nach `public/fire/bh/`** (Muster TA-Datei 36 KB gz, Warm-Crons) |
| W2 | **Nächtlicher Actions-Job** mit `FIRMS_MAP_KEY` als Secret (§3, §4, §7) | neue Workflow-Datei = STOPP & FRAGEN; fünf Workflows, null `secrets.*`; TA/AF4 liefen lokal | ohne Jans Freigabe bleibt Monat/Saison ein **manuell nachgezogener Stand** |
| W3 | **Kein FIRMS-Call zur Laufzeit** (§3) | 24 h / 7 d laufen live über `/_firms` (NRT, Deckel 12 000, `firmsHotspots.ts:69`); daran hängen Registry, AF1–AF4, TA, SF1 | Live-Pfad **bleibt** für 24 h / 7 d; Artefakte nur für Monat / Saison (Rule 2: additiv, Flag, benannter Fallback) |
| W4 | „Wetterlage am Brandtag" aus ICON/Fusion, FWI aus GWIS (§8.4) | ICON-D2/Fusion sind Vorhersage ohne Archiv; GWIS-FWI nur tagesaktuell | Rückblick nur über die Historie-Quellen: **Meteostat/DWD-Stationstag** (`src/history/meteostatSource.ts`, gemessen) + **ERA5-Stunden** (`historySource.ts`, ~25 km, Reanalyse). Kennzeichnung Pflicht. Der Satz „hat kein anderer Anbieter" ist so nicht einlösbar |
| W5 | Klasse „Unklar" (§6.3) | Klassifizierer kennt zwei Klassen | dritte Klasse = neue UI-Sprache, kleiner Bau; erst mit gemessenem Bedarf (wie viele Zellen sind Baseline **und** Wald?) |
| W6 | Cluster-Parameter „empirisch bestimmen" (§11) | EIN Clustering (`spatialClusters`, Radius-Parameter, `GAP_MS` 48 h); Änderung verschiebt F2-Ortsfest mit | Archiv-Batch nutzt **dieselben** Funktionen mit denselben Defaults; Alternativen werden gemessen, nicht gesetzt |
| W7 | SP ersetzt NRT → Detektionen verschieben sich (§7) | Registry-ID = älteste Detektion; eine Verschiebung ändert die ID | braucht eine ID-Stabilitätsregel im Batch (Anker bleibt, solange ≥ 1 Detektion des Vorlaufs im neuen Cluster liegt) — **nicht** im Client |
| W8 | Saison (§3) | undefiniert; EFFIS-Körbe `week/season/archive` hängen an `FIREDATE` (`history.ts`) | Saisondefinition ist Jans Wahl (§4 Q3) |
| W9 | dNBR (§4, §10.6) | BA-Linie wartet auf drei STOPP-Entscheidungen | bleibt außerhalb dieses Plans |
| W10 | Listen-Deckel | V-246: 1 111 Zeilen = 253 ms; still kürzen = Falschaussage | Saison-Index wird **im Batch aggregiert** (Ereignisse, nicht Detektionen) und die Liste trägt einen ausgesprochenen Deckel |

## 4. STOPP & FRAGEN — Entscheidungen vor Phase BH1

| # | Frage | Default, wenn Jan nichts sagt |
|---|---|---|
| Q1 | GitHub-Actions-Workflow für den nächtlichen Batch mit `FIRMS_MAP_KEY` als Secret? | **Nein** — erster Lauf lokal (wie TA/AF4), Ergebnis committed; Workflow als BH5 nachgelagert |
| Q2 | Ablage `public/fire/bh/` per Commit-back (kein R2)? | Ja |
| Q3 | Saison = Kalender **1. März – 31. Oktober**, außerhalb „vergangene Saison" gezeigt? | Ja (EFFIS-Saisonlogik; DE-Waldbrandsaison amtlich 1.3.–31.10.) |
| Q4 | Monat = Kalendermonat (Konzept) oder rollend 30 Tage? | Kalendermonat |
| Q5 | „Wetterlage am Brandtag" mit Meteostat/DWD + ERA5 (Reanalyse, gekennzeichnet)? | Ja, in BH4 |
| Q6 | Saisonverlauf-Chart gegen langjähriges Mittel (§9) — in diesen Plan? | **Ja** (Jan 2026-08-22) → Phase BH5, nach BH1 (Mehrjahres-Ereignisreihe) |
| Q7 | Dritte Klasse „Unklar" bauen? | erst, wenn BH1 > 5 % der Ereignisse so einstuft |

## 5. Phasenplan

Jede Phase: Diagnose → Plan → Implement → Verify → Gate; Gate nur mit Beleg hier in §6.

### BH1 — Archiv-Ereignisse (Batch, lokal) · Aufwand ~1 Tag

Ziel: aus dem vorhandenen Cache Ereignisse je Fenster rechnen, mit **den Client-Modulen**.

- `scripts/fire/bh/events-from-archive.mjs` (Node `--experimental-strip-types`, Muster
  `pairs-from-archive.mjs`): liest `.cache/firms-archive`, ergänzt den NRT-Rand über denselben
  Key (SP-Cutover aus `/api/data_availability/`, bereits in `fetch-archive.mjs` genutzt),
  ruft `spatialClusters` + `GAP_MS`-Zerlegung, `overpasses`, `intensity`, `featuresOf`,
  `classify` (mit `thermal-sites-v1.json`) — keine Kopien.
- Ausgabe `data/fire/bh/events-<jahr>.jsonl` (eine Zeile je Ereignis, **volle Evidenz**:
  `FireFeatures` + Detektions-IDs + Klassifikationsgründe + `evaluatedAt`) und
  `events-<jahr>.report.json` (Zählstände, Klassenverteilung, Cluster-Größenverteilung).
- ID-Stabilitätsregel (W7) im Batch: `bh:<anchorKey>`; bei SP-Nachlieferung bleibt die ID,
  wenn ≥ 1 Detektion des Vorlaufs im neuen Cluster liegt, sonst `supersededBy`.
- Messungen, die die offenen Punkte §11 des Konzepts beantworten: Ereignisse je Saison
  2020–2026, Anteil Einzeldetektionen, Anteil Baseline ∩ Wald (→ Q7), Cluster-Radius-
  Sensitivität (Default vs. ±50 %) — **als Zahl im Report, nicht als Annahme**.
- Verifier `verify:fire-history` (neu, Nr. 58): Determinismus (zweiter Lauf byte-gleich),
  `week ⊂ month ⊂ season`, keine Ereignis-ID doppelt, jede Klasse hat Gründe.

**Gate GBH1:** Report vorhanden, Verifier grün, ein Ereignis des 7-Tage-Fensters
deckungsgleich mit dem Live-Client (gleiche ID, gleiche Überflugzahl).

### BH2 — Artefakte je Fenster + Transport · Aufwand ~0,5 Tag

- `scripts/fire/bh/build-index.mjs`: aus BH1 → `public/fire/bh/index-month-v1.json` und
  `index-season-v1.json` (nur Zusammenfassung: Position, Zeitraum, n Detektionen, Überflüge,
  max FRP, Klasse, Konfidenz, Ort aus `places-dach.json`) + `public/fire/bh/ev/<id>.json`
  (Detail: Detektionen, Hülle, `FireFeatures`, Evidenz) — Detail nur bei Antippen geladen.
- Größenanker gemessen (Ziel Index ≤ 100 KB gz), `cache: 'no-store'` wie die AF4-Modelldatei
  (SW hasht `.json`), Versionsfeld + `generatedAt` in jeder Datei.
- Kein Workflow (Q1). Commit-back-Pfad vorbereitet, aber keine `.yml`.

**Gate GBH2:** Dateigrößen belegt, Budget (`npm run budget`) unverändert (reine Assets).

### BH3 — UI: Fenster Monat · Saison + Index-Liste · Aufwand ~1,5 Tage

- `fireTime.ts`: `fireHotspots`/`fireFootprints` `windowsH` um Monat/Saison erweitern —
  **nicht** als Stundenzahl, sondern als neuer Fenster-Typ (`FireWindow = 24 | 168 | 'month' |
  'season'`), Permalink `w` abwärtskompatibel (Zahlen bleiben, Strings neu); Verifier
  `verify:fire-time` erweitert.
- Flag `?bh=0` als Kill-Switch (Rule 2); Fallback = heutiger Zustand (24 h / 7 d).
- Daten-Hook `useFireHistory(window)`: lädt Index-Artefakt, **kein** `/_firms`-Call; Readout
  „Stand: <generatedAt>" sichtbar (Datenalter-Regel); bei fehlender Datei ausdrücklich
  „kein Stand verfügbar", nie leer.
- Brände-Reiter zeigt für Monat/Saison die Index-Liste (gleiche Zeilenform wie BP5, Rang
  „Stärke"), Thermalanomalien-Reiter analog; Listen-Deckel ausgesprochen (V-246).
- Karte: Ereignisse als Punkte/Hülle über das vorhandene `fireFootprints`-Muster; Hotspot-
  Raster für Monat/Saison **aus** (wäre 12 000er-Deckel × n).
- Detektionsgrenze-Hinweis (Konzept §8, letzter Absatz) einmalig im Readout.

**Gate GBH3:** fünf Selbstverifikationsfragen (Funktionserhalt 24 h/7 d unverändert,
Desktop pixelgleich bei `?bh=0`, Touch ≥ 44 px, Konsole sauber, keine Long Tasks > 200 ms
beim Fensterwechsel am Prod-Build), Screenshots Desktop 1440 / Mobile 390.

### BH4 — Detailansicht: Wetterlage + Nachkorrektur-Sicht · Aufwand ~1 Tag

- Detail-Datei laden, `FireRecord` daraus aufbauen → bestehende Detailkarte (Entfernung,
  Richtung, Fläche, Landbedeckung, Datengrundlage) **wiederverwendet**.
- Neu: Zeile „Wetterlage am Brandtag" — Tag: Meteostat/DWD-Station (`defaultHistorySource`,
  `lastStation` nennen, Distanz), Stunde der Erstdetektion: ERA5 (`fetchHourlyDay`);
  Kennzeichnung „gemessen (Station X, 12 km)" / „Reanalyse ERA5 ~25 km". Tage seit
  letztem Niederschlag aus der Tagesreihe. Dynamischer Import von `src/history/*`
  (eigener Chunk, Budget-Ratsche beachten).
- Neu: Zeile „Auswertungsstand" — `evaluatedAt`, SP/NRT-Anteil, `supersededBy`, EFFIS-
  Kartierung nachträglich (Reconcile-Logik aus `reconcile.ts`).
- Nebenbefund beheben: `historyExport.ts:19` nennt ERA5 auch bei Meteostat-Daten.

**Gate GBH4:** Detail an drei Ereignissen (Einzeldetektion, Mehrtagesbrand mit EFFIS,
`site-deviating`) belegt; jede Wetterzahl trägt Quelle + Wertart.

### BH5 — Saisonverlauf gegen langjähriges Mittel (§9) · Aufwand ~1 Tag

- Batch (`build-index.mjs`): je Saison 2020–2026 eine Tagesreihe kumulierter Ereignisse und
  Detektionen (DACH gesamt + je Land) → `public/fire/bh/season-series-v1.json`; Mittel und
  Spanne (min/max) der Vorjahre **aus denselben Ereignissen** wie die Liste — keine zweite
  Zählweise. Referenz = alle vollständigen Vorjahre (2020–2025, 6 Jahre; kein „langjährig"
  behaupten, das der Bestand nicht hergibt).
- UI: Chart im Readout des Saison-Fensters (SVG, keine Chart-Bibliothek — D-06), laufende
  Saison als Linie gegen Band der Vorjahre, Stand-Datum, Hinweis auf SP/NRT-Rand (die letzten
  Wochen sind NRT und können noch wandern). Gleiche Zählgrundlage wie die Liste: der
  Chart-Wert „heute" ist die Listenlänge.
- Thermalanomalien zählen nicht mit (sonst zeigt der Chart Stahlwerke).

**Gate GBH5:** Chart-Endwert = Listenlänge (Verifier), Vorjahresband aus dem Report
reproduzierbar, Desktop/Mobile-Screenshot.

### BH6 — Nächtlicher Batch (nur mit Q1 = Ja) · Aufwand ~0,5 Tag

- Workflow `fire-history.yml` (Muster `warm-grib.yml`, Commit-back, shallow-sicher),
  Secret `FIRMS_MAP_KEY`, Re-Evaluation der letzten 8 Wochen (SP-Nachlieferung), Fail-Safe:
  bei Fehler bleibt die alte Datei, `generatedAt` altert sichtbar.
- Prod-Dispatch = Jans Gate.

## 6. Gate-Belege

### GBH1 — BH1 umgesetzt (2026-08-22, abends) · **grün**

**Gebaut:**
- `src/fire/history/historyEvents.ts` — pures Modul: `eventsFromRows` (Ereignis = `spatialClusters`
  mit `CLUSTER_RADIUS_M` 2 000 m × `splitByTimeGap` 48 h — **beides importiert**, `splitByTimeGap`
  dafür aus `fireEvents.ts` exportiert), je Ereignis `buildFireRegistry` (Zonen, EFFIS-Abgleich,
  TA3 `siteAt`, Ort, AF4-Schätzung) und `featuresOf` v1; `linkPrevious` (Kennungen über Läufe, W7);
  Typen `HistoryEvent`/`HistoryDetection` für BH2–BH4; Selbstverifikation 10/10 (Determinismus bei
  umgekehrter Zeilenreihenfolge byte-gleich, Anker-Wanderung, Ersetzung).
- `scripts/fire/bh/events-from-archive.mjs` — Ein-/Ausgabe: SP-Cache (1 358 Chunks, 538 145 Zeilen,
  davon 334 082 mit NASA `type`), **NRT-Rand** ab SP-Cutover je Sensor (SNPP ab 2026-04-28, NOAA-20
  ab 2026-06-01; 41 Chunks, 27 193 Zeilen; NOAA-21 ausgeschlossen — nur NRT, die Reihe bliebe
  sensorungleich), Dedupe ⇒ **343 897 Zeilen**; EFFIS 1 177 Kartierungen (2026: Saison-Korb
  tagesgestempelt); Report mit Messungen. Laufzeit Ereignisse **580 s**; die Radius-Sensitivität
  (vier volle Läufe) kostete 38 min und ist jetzt `--sensitivity`.
- `scripts/verify-fire-history.mjs` (`npm run verify:fire-history`, Verifier Nr. **58**): **26/26** —
  Modul 10, Datei 11 (Version, keine doppelte Kennung, keine Detektion in zwei Ereignissen, Saison,
  Jahr, Gründe, Provenienz, Sortierung), Report 2, **Parität 3**.
- `.gitignore`: `data/fire/bh/events.jsonl` (188 MB; ~3,4 KB je Ereignis, davon Detektionen 1,7 KB,
  Merkmalsatz 0,6 KB) — reproduzierbar aus `.cache/`, nur `events.report.json` wird committet.

**Gemessen (`data/fire/bh/events.report.json`, `--today 2026-08-22`):**

| Jahr | Ereignisse | Saison | nur EFFIS | EFFIS-Treffer | Standort `site` | `site-deviating` | Einzeldetektion | DE / AT / CH / außerhalb |
|---|---|---|---|---|---|---|---|---|
| 2020 | 9 590 | 8 340 | 14 | — | 4 056 | 97 | 5 868 | 4 715 / 270 / 272 / 4 333 |
| 2021 | 8 197 | 7 200 | 11 | — | 4 032 | 104 | 4 898 | 3 854 / 334 / 226 / 3 783 |
| 2022 | 10 207 | 9 094 | 81 | — | 4 145 | 76 | 6 204 | 4 986 / 433 / 263 / 4 525 |
| 2023 | 8 968 | 8 011 | 19 | — | 3 821 | 84 | 5 432 | 4 739 / 353 / 229 / 3 647 |
| 2024 | 8 016 | 7 193 | 25 | — | 3 468 | 86 | 4 614 | 4 380 / 323 / 215 / 3 098 |
| 2025 | 10 512 | 9 604 | 261 | 120 | 3 509 | 114 | 6 041 | 6 072 / 465 / 210 / 3 765 |
| 2026 (bis 22.8.) | 9 055 | 8 683 | 154 | 171 | 2 369 | 73 | 5 368 | 5 526 / 390 / 180 / 2 959 |

Summe **64 545 Ereignisse**, 0 in der Registry verloren. Antworten auf Konzept §11:
- **Cluster-Radius** (Konzept: „empirisch bestimmen"): 1 000 m 65 922 · 1 500 m 64 815 · **2 000 m 63 980** ·
  3 000 m 61 742 Ereignisse — ±50 % Radius bewegt die Zahl um **< 3,5 %**; der Radius ist nicht der
  Hebel, die Zeitlücke ist es. Es bleibt bei den Client-Parametern (W6).
- **Einzeldetektionen** 57–61 % aller Ereignisse, **ein Überflug** ~ 72 %, Median Dauer 0 h, Median
  1 Kalendertag — die Konzeptthese „kleine Brände dominieren, oft genau eine Detektion" ist am
  Bestand bestätigt; ein Filter auf Einzeldetektionen würde die Mehrheit löschen.
- **Standort-Anteil**: 27–42 % der Ereignisse mit Detektionen liegen auf einem bekannten Standort
  (`site`); **`site-deviating` 0,8–1,1 %** ⇒ Q7: unter 5 %, **keine Klasse „Unklar"**. 2026 liegt der
  Standort-Anteil niedriger (26,6 %), weil die NRT-Zeilen erst in die Saison fallen — die Dauerquellen
  laufen ganzjährig, die Brände nicht.
- **„außerhalb"** (CZ, PL, FR, IT …) ist 33–45 % des Bestands: die DACH-BBox ist ein Rechteck. BH2
  filtert die Artefakte auf DE/AT/CH (`country`), die Rohdatei behält alles.
- **EFFIS-only** wächst 2025/2026 (261/154): Kartierungen ohne eine einzige VIIRS-Detektion —
  der Omission-Fehler des Konzepts §2, sichtbar gemacht statt verschwiegen.

**Parität mit dem Live-Client (Verifier-Abschnitt c):** die letzten 7 Tage aus dem NRT-Cache
durch `buildFireClusters` (der Weg der Brände-Liste): **220 Cluster** — 170 haben dieselbe Kennung
`bh:<anchorKey>`, 50 sind Teil eines Ereignisses, das **vor dem Fenster** begann (Fensterschnitt,
kein Widerspruch), **0 fehlen**. Von den 170: 154 gleich in Überflügen und Detektionen, **16 abweichend
— alle Wiederzündungen nach > 48 h** (Beleg: Anker `54.46756,17.23255` = 17.8. 11:25 2 px und
`54.46491,17.23290` = 21.8. 11:32 8 px — die Brände-Liste zeigt EINEN Cluster 10 px/2 Überflüge).
Lehre (V-BH-1): **die Brände-Liste (BC1) kennt keine Zeitlücke, das Ereignis (F2 `GAP_MS`) schon** —
im 7-Tage-Fenster verschmilzt die Liste Wiederzündungen bis 7 Tage Abstand. Die Historie folgt der
Ereignisdefinition; ob die Liste nachziehen soll, ist Jans Entscheidung (Änderung verschiebt BP5-Rang
und AF1-Überflugzahlen).

**Grenzen des Batch (im Report `limits`):** keine CLC-Maske und kein Windflag (Laufzeitdaten —
Felder `null` wie im Client ohne Quelle); keine AF2-Beobachtungsqualifikation (fragt „bis jetzt");
F2-`suspectedStatic` ist im Batch 0 (die `staticKeys` des 5-Tage-Fensters existieren im Archiv nicht —
die Standortliste TA3 trägt diese Aussage); die AF4-Schätzung wird auch für `site`-Ereignisse
gerechnet (BH2 zeigt sie dort nicht).

**Fünf Fragen:** (1) Funktionserhalt — kein Client-Code verdrahtet, `fireEvents.ts` nur um einen
`export` ergänzt, `npm run typecheck` grün; (2)–(5) entfallen (kein UI in BH1).

### GBH2 — BH2 umgesetzt (2026-08-23) · **grün**

**Gebaut:**
- `src/fire/history/historyArtifacts.ts` — pures Modul, das Batch UND Client (BH3/BH4) importieren:
  Fenster (`monthWindow` = Kalendermonat; `currentSeasonWindow` = laufende Saison, vor dem 1.3. die
  Vorjahres-, nach dem 31.10. die gerade abgeschlossene — nie leer), **positionale Index-Zeilen**
  (`INDEX_FIELDS`, `rowOf`/`entryOf`), Shard-Pfad `ev/<jahr>/<monat>/<floor(lat)>_<floor(lon)>.json`
  (1°-Zelle × Beginn-Monat, `shardPath` rechnet Batch und Client gleich), `selectWindow` (Beginn im
  Fenster, **nur DE/AT/CH**, Weggelassene gezählt), `countsOf`; Selbstverifikation 9/9.
- `scripts/fire/bh/build-index.mjs` (`npm run fire:history-index`, netzfrei, Fenster aus dem
  Report-`evaluatedAt`, nicht aus der Uhr): `public/fire/bh/index-month-v1.json`,
  `index-season-v1.json`, 434 Shards, `build-report.json`. Jede Indexdatei trägt `evaluatedAt`
  (der „Stand"), `limits` (NRT kann wandern · nur SNPP/NOAA-20 · Omission kleiner Brände · nur DACH)
  und `attributions` (FIRMS, EFFIS, GeoNames, E-PRTR/MaStR/BFE).
- Verifier `verify:fire-history` jetzt **58/58** (+32: Modul 9, je Index 11 — Version/Fenster/Stand,
  Feldliste = `INDEX_FIELDS`, Zählstände = Zeilen, nur DACH, Beginn im Fenster, `site` ohne
  Schätzung, Schätzung nie ohne Intervall, Rang = Stärke, jeder Eintrag hat seinen Shard,
  Größe gemessen, Shard-Stichprobe = Index-Zeile —, Shard-Schema 1).

**Gemessen (Stand 2026-08-22, `public/fire/bh/build-report.json`):**

| Artefakt | Ereignisse | roh | gzip | Inhalt |
|---|---|---|---|---|
| `index-month-v1.json` (August 2026) | 1 231 | 254 KB | **54 KB** | DE 1 138 · AT 82 · CH 11; `site` 133, abweichend 9, nur EFFIS 14; 1 217 mit NRT; 503 außerhalb weggelassen |
| `index-season-v1.json` (Saison 2026) | 5 881 | 1 207 KB | **257 KB** | DE 5 349 · AT 368 · CH 164; `site` 1 188, abweichend 44, nur EFFIS 120; 3 844 mit NRT; 2 802 außerhalb weggelassen |
| Shards `ev/**` | 434 Dateien | 13,3 MB | 1,67 MB (größter **47 KB** gz) | volle Ereignisse inkl. Detektionen (positional), Merkmalsatz, Evidenz |

**Abweichung vom Plan, gesagt statt versteckt:** das Ziel „Index ≤ 100 KB gz" hält der Monat (54 KB),
die **Saison nicht (257 KB gz)** — 5 881 Zeilen × ~44 B gz; das Weglassen von `method`/`satellites`
brachte nur 3,5 %, die Bytes sind Kennung (35 Zeichen) und Zahlen. Zwei Wege, falls das stört:
(a) die Saison-Liste nach Monaten laden (8 Dateien à ~30–55 KB, Karte zeigt trotzdem alles), (b) die
Kennung im Index auf den Anker kürzen (`bh:` ist redundant, −8 %). Beides Jans Wahl; 257 KB sind
kleiner als `places-dach.json` (328 KB roh), das der Brände-Reiter heute schon lädt.

**Repo-Frage (STOPP & FRAGEN vor dem ersten Commit):** `public/fire/bh/` wächst um **~14,8 MB je
Saison** (437 Dateien). Vorschlag: nur die laufende Saison (und bis 1.3. die vorige) unter `public/`
halten, ältere Shards beim Saisonwechsel löschen — die Rohdatei bleibt im lokalen Cache reproduzierbar,
und BH5 (Saisonverlauf) braucht nur Tageszählstände, keine Shards.

**Fünf Fragen:** (1) Funktionserhalt — nichts im Client verdrahtet, `npm run typecheck` grün,
`npm run budget` „Alle Budgets eingehalten" (reine Assets, kein JS); (2)–(5) entfallen (kein UI).

### GBH3 — BH3 umgesetzt (2026-08-23) · **grün**

**Gebaut (Rule 2: additiver Anzeigemodus, Live-Pfad unverändert):**
- Zeit-Deck: das Fenster-Segment trägt neben `24 h | 7 d` die Historie-Fenster **`Monat | Saison`**
  (nur mit Kill-Switch `historyEnabled()`, `?bh=0` ⇒ die Knöpfe fehlen). Ein Klick auf ein Live-Fenster
  verlässt die Historie; `windowH` bleibt gemerkt. Permalink-Feld **`bh`** (`fireState.ts`, nur im
  Modus geschrieben — Live-Links byte-gleich; unbekannter Wert ⇒ Live), Verifier `verify:fire-model` 129/129.
- `src/fire/history/historyLoad.ts`: `loadHistoryIndex` (`cache: 'no-store'`, einmal je Sitzung und
  Fenster, Fehler ist ein Ergebnis und wird nicht gemerkt), `historyToGeoJSON` (ein Punkt je Ereignis,
  Farbe = `clusterColor` der Brände-Liste, Standorte `STATIC_GREY` — keine zweite Skala),
  `historyStandLabel` (= letzter **enthaltener** Tag). Selbstverifikation 5/5.
- `FireMap.tsx`: Quelle `fire-history` (Attribution FIRMS), Punkt-Layer + Auswahlring **außerhalb der
  Z-Band-Schleife** (kein `FireLayerId`, kein Bit — ein Anzeigemodus), sichtbar genau dann, wenn
  `historyFc` da ist; Klick vor der Popup-Kette (Muster TA5). Im Modus bekommt die Karte **keine
  Live-Daten** (Hotspots, Raster, Hüllen, Flächen, Pfeile ⇒ leere Referenzen), die Standort-Rauten
  bleiben (zeitlos).
- `FireHistoryPanel.tsx`: Brände-Reiter im Modus — Kopfzeile „Historie · Saison 2026 (1.3.–31.10.) ·
  **Stand 22.08.2026**", Zählzeile (Länder, Standorte, nur EFFIS, NRT, **weggelassene Ereignisse
  jenseits der Grenzen gezählt**), Sortierung Stärke/Zuletzt/Fläche, Art Brände/Anlagen/Alle, Liste
  mit **ausgesprochenem Deckel** (`CLUSTER_PAGE` 50, „gezeigt 50 von 5 881"), Detailkarte (Zeitraum,
  Detektionen/Überflüge mit Einzeldetektions-Satz, Stärke, Fläche — Kartierung vor Schätzung mit
  Intervall —, Herkunft SP/NRT, Einordnung), Fußzeile mit den `limits` der Datei und Rückweg. Ausfall
  heißt „Kein Stand verfügbar … Ausfall, kein leerer Monat"; leer heißt „Keine Ereignisse dieser Art im
  Stand vom … — kleine Brände fehlen dem Satelliten systematisch". Mobil: Segment und Seitenkopf
  zählen die Datei, nicht die Live-Registry.
- Verifier `verify:fire-history` jetzt **75/75** (+17 Client: Lader/GeoJSON 5, Verdrahtung 12).

**Zwei Befunde aus dem Browser, beide behoben:**
1. **V-BH-2 — Stahlwerke als stärkste „Brände" der Saison.** Erste Fassung: Duisburg (2 136
   Detektionen, 59 Tage, „≈ 82,3 ha geschätzt"), Salzgitter, Steyregg auf Rang 1/2/4. Ursache: der
   TA3-Signaturvergleich ist für das 7-Tage-Fenster gebaut — über 60 Tage kippen Hülle und Wachstum
   auf `site-deviating`, und die AF4-Schätzung liefert auf einer Anlagensignatur eine Brandfläche, die
   es nicht gibt. Gemessen: 44 `site-deviating` in der Saison, Median 2 Tage, **7 über 7 Tage — alle
   Stahlwerke**, 7 der 50 stärksten Zeilen. Regel NUR im Index (`indexAnomalyKind`, `SITE_PERSIST_DAYS
   = 7`): Standort-Ereignis mit Signal an > 7 Kalendertagen = Dauersignal ⇒ `site`; und **keine
   Flächenschätzung auf irgendeinem Standort-Ereignis** (`site` und `site-deviating`). Die Rohdatei
   behält das TA3-Urteil. Danach: Saison `site` 1 195 / `site-deviating` 37; Rang 1–6 Hürtgenwald,
   Lesachtal, Illingen, Jüterbog, St. Egyden, Langscheid — alle EFFIS-kartiert. **Offen für Jan:**
   soll der Klassifizierer selbst die Regel bekommen (träfe den Live-Reiter „Thermalanomalien")?
2. **„Stand 23.08."** über Daten bis einschließlich 22.08.: `evaluatedAt` ist das Ende des Abruftags
   (exklusiv) — die Beschriftung nimmt jetzt den letzten enthaltenen Tag.

**Nebenbefund (nicht von BH3):** `warnungen.zamg.at/…getWarningsForCoords` antwortet für Orte außerhalb
Österreichs mit 404 (16 ×) — der GeoSphere-Warnkontext fragt für jede AT-nahe Zeile; vorbestehend.

**Fünf Fragen (Belege):**
1. Funktionserhalt: `?bh=0` ⇒ Segment `24 h | 7 d` wie vorher; Live-Fenster unverändert (Hash `w`
   byte-gleich ohne `bh`); `verify:fire-time` 124/124, `verify:fire-spread` 203/203,
   `verify:fire-anomalies` 56/56, `verify:fire-model` 129/129; `npm run typecheck` grün.
2. Desktop 1440×900: `audit/screenshots/bh3-desktop-1440-saison.png` — 5 881 Punkte gezeichnet
   (`queryRenderedFeatures` 5 881), Live-Hotspots 0, Auswahl per Zeile zoomt (z 10,3) und setzt den
   Ring-Filter auf die Kennung.
3. Touch ≥ 44 px: Listenzeilen 98 px; die Sortier-/Art-Chips sind 36 px — **dieselbe Chip-Klasse wie
   in den beiden Bestandspanels** (`.br-chip`), keine neue Abweichung; mobil
   `audit/screenshots/bh3-mobile-390-saison.png` (390×844, DPR 3).
4. Konsole: keine Fehler/Warnungen im Dev- und im Prod-Build (nur die vorbestehenden GeoSphere-404).
5. Long Tasks am **Prod-Build** (`vite preview`, SW aktiv, frische Origin): Monat↔Saison dreimal hin
   und her **74 / 53 ms**, zurück ins Live-Fenster 7 d **119 / 80 ms**, wieder Saison **0** — keine
   > 200 ms. (Dev-Build zur Einordnung: bis 2 026 ms — unminifiziertes React + HMR, nicht repräsentativ.)
   Bundle: `FireRoute` 276,4 KB (93,9 KB gz, +0,3 KB), totalJs 979,3 / 1 024,5 KB.

**Noch nicht in BH3 (Plan):** Detail-Shard laden (Wetterlage, Landbedeckung, Evidenz) = BH4; die
Detailkarte sagt das. Die Karte zeigt im Modus Punkte, keine Hüllen — die Hülle steht im Shard.

### GBH4 — BH4 umgesetzt (2026-08-23) · **grün**

**Gebaut:**
- `src/fire/history/historyDetail.ts`: `loadHistoryShard` (eine 1°-Zelle je Klick, `no-store`, Fehler
  als Ergebnis, nicht gemerkt), `eventFromShard`, **`fireDayWeather`** — Wetterlage am Brandtag aus
  den Quellen der Wetterhistorie per **dynamischem Import** (`historySource` 3,0 KB + `meteostatSource`
  11,9 KB + Stationsliste 67 KB als eigene Chunks; `FireRoute` +3,2 KB gz für die Karte selbst): Tag =
  nächste Station (Meteostat/DWD, **gemessen**), Stunde der Erstdetektion = ERA5 (Open-Meteo Archive,
  **Reanalyse ~25 km**, nächste volle Stunde ≤ 90 min), Trockenphase = Tage seit dem letzten Regentag
  ≥ 1 mm aus der Tagesreihe vor dem Brand (Rückblick 60 Tage, Lücke ⇒ „nicht bestimmbar", Deckel ⇒
  „länger als 60 Tage"); reine Ableitungen `daysSinceRain`/`pickHour`/`rainLabel` mit
  Selbstverifikation 7/7.
- `FireHistoryPanel.tsx` → `HistoryEventDetail`: drei Abschnitte **Wetterlage am Brandtag** (jede Zahl
  mit Wertart + Quelle + Station/Distanz; fester Satz „Kein ICON-/Fusionswert: die Vorhersagemodelle
  haben kein Archiv" — W4 gesagt statt behauptet), **Landbedeckung** (nur mit EFFIS-Kartierung:
  Anteile ≥ 1 %, Natura 2000, EFFIS-Ort), **Datengrundlage und Evidenz** (Sensoren, SP/NRT, NASA
  `type 2`-Anteil, Konfidenz, Status mit Satz „ein Ende bestätigt nur eine EFFIS-Kartierung mit
  Enddatum", frühere Kennung nach SP-Nachlieferung, Auswertestand, Gründe der Standort-Einordnung,
  Merkmalsatz AF3 ausklappbar + „JSON kopieren" wie in der Live-Detailkarte).
- Verifier `verify:fire-history` **93/93** (+18: Detail 7 + 7 Verdrahtung, Nebenbefunde 4).

**Vier Befunde aus dem Browser (Hürtgenwald 14.–15.08.2026, 319 ha EFFIS), drei davon Altfehler der
Wetterhistorie — behoben, weil die Karte sonst Falsches sagen würde:**
1. **„signal is aborted"** aus der Tagesreihe: `MeteostatSource` merkt sich das Jahres-Promise je
   Station; hing es am Abbruchsignal des ersten Aufrufers (Reacts doppelter Dev-Effekt), bekam jeder
   spätere Aufruf den Abbruch aus dem Cache — **Lehre GBP1 (3) reproduziert**. Behoben zweifach:
   der Batch-Aufruf gibt kein Signal mehr an die gecachte Tagesreihe, und `meteostatSource.ts` wirft
   ein abgelehntes Promise aus dem Cache (Altfehler, betrifft auch die Historie-Seite).
2. **„Wind max 1.018 km/h"** — das ist der **Luftdruck**: der Meteostat-Parser las feste
   Spaltenindizes, aber der Spaltensatz ist je Station verschieden (Nideggen-Schmidt D3591 führt weder
   `wpgt` noch `tsun`; Beleg: Header + Zeile 2026-08-14 im Verifier). Parser jetzt **header-basiert**;
   mit vollem Spaltensatz byte-gleich (Verifier: Böe 29,5, Sonnenstunden 13,05). **Altfehler der
   Historie-Seite** seit dem Meteostat-Wechsel — dort stand für jede Station ohne Böenspalte der
   Luftdruck als Wind (hPa ≈ 1 000 ⇒ „1.000 km/h").
3. **„gemessen" war nicht immer gemessen**: Meteostat füllt Lücken mit Modellwerten
   (`wspd_source = metno_forecast`). `DailyRecord.modelFilled` (additiv, optional) trägt die Felder;
   die Karte markiert sie mit `*` und dem Satz „vom Anbieter mit Modellwert gefüllt, nicht gemessen".
   Die Historie-Seite wertet das Feld noch nicht aus (**V-BH-3**, Jans Entscheidung, ob „gemessen"
   dort je Wert differenziert wird).
4. Für ~die Hälfte der gebündelten Stationen endet das Inventar 2022 — dann **Rückfall auf
   ERA5-Tageswerte**, gekennzeichnet („Station X hat für den Tag keinen Messwert — Tageswerte aus der
   ERA5-Reanalyse"). Die Stationsliste selbst ist ein Batch-Artefakt (`meteostatStations.ts`), nicht
   Teil dieser Phase.

Dazu der Export-Nebenbefund aus §3 W4 behoben: `historyExport.ts` nannte in jedem CSV fest „ERA5 /
Open-Meteo Archive" — jetzt die Quelle des aktiven Providers.

**Gemessen:** Detailkarte nach Klick: Shard `ev/2026/08/50_6.json` (1 Zelle), ERA5-Stunde < 1 s,
Tagesreihe **~15 s** — `MeteostatSource.fetchDailyRange` lädt das **ganze Stationsinventar**
(1994–2026, 33 Jahresdateien), unabhängig vom angefragten Bereich (**V-BH-4**: Jahresfenster im
Cache wäre für die Brandkarte 1–2 Dateien; betrifft auch die Historie-Seite, dort gewollt). Die Karte
sagt „werden geholt …" und zeigt die übrigen Abschnitte sofort.

**Fünf Fragen:** (1) Funktionserhalt — Historie-Seite: Parser-Änderung byte-gleich bei vollem
Spaltensatz (Verifier), Export-Signatur additiv (Default = alter Text); `verify:fire-model` 129/129,
`fire-time` 124/124, `fire-spread` 203/203, `fire-anomalies` 56/56; Typecheck grün; Budget totalJs
984,2 / 1 024,5 KB. (2) Desktop `audit/screenshots/bh4-desktop-1440-detail.png`. (3) Touch: keine
neuen Bedienelemente außer `details`/`JSON kopieren` (Textlinks wie im Bestand). (4) Konsole: nur die
vorbestehenden GeoSphere-404. (5) Keine neuen Long Tasks — die Arbeit ist Netz (Meteostat 16–33
gzip-CSV im Worker-freien Hauptthread entpackt via `DecompressionStream`, kein Block gemessen).

### GBH5 — BH5 umgesetzt (2026-08-23) · **grün**

**Gebaut:**
- `src/fire/history/historySeries.ts` (pur): je Saison eine Tagesreihe **kumulierter Ereignisse**
  (DACH, DE, AT, CH) aus DENSELBEN Ereignissen und DERSELBEN Zählregel wie die Liste
  (`countsInSeries` = DACH + Beginn + `indexAnomalyKind ≠ site`); laufende Saison endet am
  Auswertetag (`null` danach, nie 0); Referenz = Mittel/min/max **nur über vollständige Saisons**
  (2020–2025); `compareToReference` für „bis heute". Selbstverifikation 8/8.
- Batch `build-index.mjs` schreibt `public/fire/bh/season-series-v1.json` (**40 KB roh / 11 KB gz**),
  Build-Report trägt `today` und `seasonEnd` je Jahr.
- `historyLoad.ts` → `loadSeasonSeries` (no-store, einmal je Sitzung, Fehler nicht gemerkt);
  `FireHistoryChart.tsx` — **reines SVG** (D-06), rote Linie = laufende Saison, gestrichelt = Mittel,
  Band = Spanne der Vorjahre, Monatsmarken, Bildunterschrift mit dem Vergleich am selben Saisontag
  und den beiden Grenzen der Datei; im Saison-Readout über der Liste (`SeasonChartBlock`), Ausfall
  benannt.
- Verifier `verify:fire-history` **110/110** (+17: Modul 8, Datei 7 — darunter **Chart-Endwert =
  Brände im Saison-Index ohne Anlagen: 4 686 / 4 686** —, Chart/Panel 2).

**Gemessen (Stand 22.08.2026):** Saisonende 2020 2 792 · 2021 1 980 · 2022 3 171 · 2023 2 992 ·
2024 2 814 · 2025 4 528; **2026 am Saisontag 174 (22.08.): 4 686** gegen Vorjahresmittel **2 476**
(Spanne 1 544–4 045) am selben Tag — die laufende Saison liegt über jedem Vorjahr, **mit zwei
Vorbehalten, die in der Bildunterschrift stehen:** die Referenz ist kein langjähriges Mittel (sechs
Saisons), und 2026 trägt ab Ende April/Juni den NRT-Rand (SP-Nachlieferung kann Detektionen
verschieben oder streichen; die Vorjahre sind reine SP-Reihen). Ein Sensor-Unterschied ist es nicht
(beide Reihen SNPP + NOAA-20).

**Ein Dev-Befund:** beim ersten Aufruf nach dem Batch-Lauf lieferte der Dev-Server für die neue
Datei einmalig HTML (Vite hatte den Pfad noch nicht) — die Karte zeigte korrekt „Saisonverlauf nicht
verfügbar (Unexpected token '<') — Ausfall der Datei, kein leerer Verlauf", nach Reload JSON. Prod
betrifft das nicht (statisches Asset).

**Fünf Fragen:** (1) Funktionserhalt: Bestandsverifier grün (`fire-model` 129, `fire-time` 124,
`fire-spread` 203, `fire-anomalies` 56), Typecheck grün, Budget totalJs 985,4 / 1 024,5 KB
(`FireRoute` +1,3 KB gz für das Chart). (2) Desktop `audit/screenshots/bh5-desktop-1440-saisonchart.png`.
(3) Keine Bedienelemente im Chart. (4) Konsole: nur die vorbestehenden GeoSphere-404. (5) Chart =
drei SVG-Pfade aus 245 Punkten, kein Long Task (Dev gemessen, Render < 16 ms).

## 6a. Jans Entscheidungen zu den offenen Punkten (2026-08-23) — umgesetzt

| # | Entscheidung | Umsetzung · Beleg |
|---|---|---|
| Repo | **„nur die Saison"** | `build-index.mjs` baut `ev/` IMMER neu ⇒ im Repo liegen genau die Shards der laufenden Saison + des Monats; beim Saisonwechsel fallen alte Shards von selbst heraus. 438 Dateien, 14,8 MB (Saison 2026) — das ist die Obergrenze je Saison. Noch nicht committed. |
| V-BH-2 | „mache, wie du meinst" | **Klassifizierer bleibt unangetastet.** Begründung: im Live-Fenster (max. 7 Tage) kann die Regel „> 7 Signaltage" nie greifen — sie wäre dort toter Code; sie gehört in den Index, wo die Saison sie braucht. |
| V-BH-3 | **ja** | `historyModel.ts` `modelFilledSummary` + `MODEL_FILLED_LABEL`; `HistoryPage.tsx` `Provenance` bekommt an allen vier Stellen die Quote. Browser (Düren, Station Nörvenich 13 km): „0,2 % der Tage tragen Modellwerte statt Messungen (Temperatur max, …, Wind) — vom Anbieter gefüllt, hier nicht als Messung gezählt." Verifier 2 Prüfungen. |
| BH6 | „ich weiß nicht" | Default bleibt: **kein Workflow**. Bis zur Entscheidung ist Monat/Saison ein manuell nachgezogener Stand (`npm run fire:history-archive` ≈ 10 min mit Schlüssel, dann `fire:history-index`); der Stand steht in jeder Liste. Die Entscheidung braucht drei Antworten: Secret `FIRMS_MAP_KEY` im Repo-Actions-Store (ja/nein), Commit-back von ~15 MB je Nacht (Repo-Wachstum ~1 MB/Tag im Pack) und Prod-Dispatch als Jans Gate. |
| V-BH-4 | **„hochperformant"** | `MeteostatSource.fetchDailyRange` cacht je **Station und Jahr** und lädt nur den angefragten Bereich — die Detailkarte holt **eine** Datei: **1,3 s statt ~15 s** (Browser, Hürtgenwald). Historie-Seite unverändert (fragt die volle Reihe, Düren: 58 Dateien, dieselben wie vorher). Verifier 1 Prüfung; `verify:fire-history` **113/113**, Typecheck grün, Budget 985,8 / 1 024,5 KB. |

## 7. Nicht in diesem Plan

Sentinel-2-dNBR (§4, W9) · Klasse „Unklar" (Q7) ·
Jahresstatistik-Plausibilisierung BLE/BOKU (§7, keine Geometrie — bleibt Doku-Hinweis).
