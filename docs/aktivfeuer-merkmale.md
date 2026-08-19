# Aktiv-Feuer — Merkmalsschema (`FireFeatures`, `featureVersion` 1)

> Stand 2026-08-18 (Phase AF3, Gate GAF3). Referenzimplementierung: `src/fire/activity/features.ts`
> (`featuresOf`, `featuresJson`, `isEligiblePair`). Herleitung: `audit/aktivfeuer.md` §3 F, §13;
> Konzept `konzept-aktivfeuer-modul.md` §6, §12. Verifier: `npm run verify:fire-activity` (Abschnitt g).

## 1. Zweck

Für mitteleuropäische Kleinbrände gibt es keine publizierte Beziehung „FRP/Detektionen → Fläche".
Sie soll aus **eigenen Labelpaaren** entstehen: Merkmale aus den VIIRS-Detektionen (dieses Schema) und
Zielgröße aus der Brandflächen-Kartierung (BA-Linie, Sentinel-2 dNBR — noch nicht gestartet). Weil die
Detektionen im Client nach ≤ 7 Tagen aus dem Fenster fallen, wird das Schema **jetzt** fixiert und die
Funktion dafür **einmal** geschrieben: Client (Detailkarte, „JSON kopieren") und späterer BA-Batch
(Node `--experimental-strip-types`) rechnen aus **derselben Datei** — Parität per Konstruktion.

Was das Schema **nicht** ist: eine Flächenschätzung. `areaEst` bleibt `null`, bis ein Kalibriermodell
aus ≥ 25 Paaren existiert (AF4, `MIN_PAIRS_FOR_FIT`), und wird dann nur mit Prädiktionsintervall
(`INTERVAL_LEVEL` 0,8) gezeigt.

## 2. Regeln

1. `featureVersion` steht in jedem Satz. Jede Änderung an einem Merkmal (Definition, Einheit, Rundung)
   zählt die Version hoch und bekommt hier einen Eintrag in §6.
2. **Kein `undefined`.** Jede Lücke ist `null`; der Grund steht in der Tabelle unten.
3. **Keine Fläche ohne ihre Art.** `coverageHa` ist das vom Satelliten abgedeckte Detektionsraster
   (Obergrenze der Abdeckung, **keine Brandfläche**); `effisMappedHa` ist eine Referenz, kein Ziel; das
   Ziel (`FireLabelTarget`) kommt ausschließlich vom BA-Batch.
4. **Deterministisch:** dasselbe Record ⇒ byte-gleiches JSON (`featuresJson`, feste Schlüsselreihenfolge
   `FEATURE_KEYS`). Kein `Date.now()`; `asOfMs` wird hereingereicht.
5. Kennung = `FireRecord.id` (`fire:<anchorKey>` = älteste Detektion; `effis:<id>` für reine
   Kartierungen). Sitzungsstabil, **nicht** sitzungsübergreifend — der Batch vergibt seine eigene Kennung
   und führt `id` als Herkunft mit.
6. Merkmale gelten **innerhalb des Fensters** (24 h / 7 Tage). Für Labelpaare ist der Satz erst dann
   endgültig, wenn die letzte Detektion aus dem Fenster gefallen ist (s. §4).

## 3. Felder

| Feld | Typ | Herkunft (`FireRecord`) | `null` heißt |
|---|---|---|---|
| `featureVersion` | `1` | Konstante | — |
| `id` | string | `id` | — |
| `asOfMs` | number | Aufrufer (`nowMs`) | — (Provenienz, kein Merkmal) |
| `country` | `DE`/`AT`/`CH`/`outside`/null | `country` | Umrisse nicht geladen |
| `lat`, `lon` | number | Schwerpunkt | — |
| **Prädiktoren (Konzept §6)** | | | |
| `nDetections` | number | `hotspots` | keine Detektion im Fenster (reiner EFFIS-Eintrag, GWIS-Notbetrieb) |
| `nOverpasses` | number | `overpasses` (10 min je Satellit, `activity/overpasses.ts`) | wie oben |
| `frpMaxPassMw` | number | `activity.frpMaxPassMw` — höchste ΣFRP **eines** Überflugs (Konzept `frp_sum_max_mw`) | kein Überflug mit FRP |
| `frpSumWindowMw` | number | `frpSumMw` — ΣFRP über alle Pixel und Überflüge (BP1-Größe, zusätzlich) | wie oben |
| `freMj` | number | `activity.freMj` — Trapez über die Überflüge, MJ | **nicht bestimmbar** (< 3 Detektionen über < 2 Überflüge) — nie 0 |
| `freSpanH`, `freMaxGapH` | number | `activity` — integrierte Spanne, größte Lücke (h) | FRE nicht bestimmbar |
| `durationH` | number | `(lastMs − firstMs) / 3,6e6` | keine Detektion |
| `coverageHa` | number | Σ `sources.zones[].areaHa` (Detektionsraster) — Konzept `envelope_area_ha` | kein Raster (keine Detektion) |
| `coverageCapped` | boolean | eine Zone traf den Rechteckdeckel (`MAX_RECTS_PER_ZONE`) — Abdeckung unvollständig | — |
| `hullKm2` | number | `sources.cluster.hullKm2` (konvexe Hülle; 0 = flächenlos) | kein Cluster |
| `sensorFamily` | `'VIIRS'` | konstant — nur VIIRS wird ingestiert (S-NPP, NOAA-20, NOAA-21) | keine Detektion |
| `daynightMix` | `D`/`N`/`DN` | `activity.daynightMix` | keine Detektion |
| `meanScanKm` | number | `activity.meanScanKm` (pixelgewichtet) — Off-Nadir-Kennzeichnung | keine Detektion |
| `landcoverDominant` | `LandcoverKey` | `landcover[0].key` — **nur** mit EFFIS-Kartierung (CORINE-Anteile) | ohne EFFIS: die CLC-Maske im Repo kennt nur industrial/other, nichts wird geraten |
| `month` | 1–12 | UTC-Monat von `firstMs` | keine Detektion |
| **Kovariaten / Ausschluss** | | | |
| `confidenceFirms` | `{high, nominal, low}` Anteile 0–1 | `confidence.firms` | keine Detektion |
| `assessment` | `bestaetigt`/`plausibel`/`unbestaetigt` | `confidence.assessment` (BP1-Bewertung) | nicht bewertet |
| `suspectedStatic` | boolean | `suspectedStatic` (F2: Mehrheit ortsfest) — **solche Einträge werden kein Paar** | — |
| `activityState` | `growing`/`stable`/`declining`/`no-signal` | `activity.state` (AF2) | zu wenig vergleichbare Überflüge |
| **Referenz (nicht Ziel)** | | | |
| `effisMappedHa` | number | `areaHa.value` wenn `areaHa.kind = 'mapped'` (EFFIS RDA) | keine Kartierung |
| `effisId` | string | `sources.effis.id` | keine Kartierung |

Rundung: Stunden und Hektar auf 0,1; km² und Anteile auf 0,01; `lat`/`lon` auf 1e-5 (≈ 1 m). Rundung ist Teil des Schemas (Determinismus).

## 4. Labelpaar und Persistenz-Haken (benannt, nicht betrieben)

```ts
interface FireLabelTarget { source: 'ba-dnbr'|'effis-rda'; areaNetHa; areaMinHa; areaMaxHa; baStatus: 'provisional'|'mapped'|'final'; separability: number|null; mappedAtMs; effisId? }
interface FireLabelPair   { features: FireFeatures; target: FireLabelTarget | null }
isEligiblePair(pair)  ⇔  target ≠ null ∧ ¬suspectedStatic ∧ baStatus ∈ {mapped, final}
                       ∧ (source = ba-dnbr  ⇒ separability ≥ 1,5)
                       ∧ (source = effis-rda ⇒ areaNetHa > 0 ∧ nDetections ≥ 1 ∧ landcoverDominant ≠ ARTIFSURF)
```

**Zwei Labelquellen (2026-08-18, Jans Entscheidung, Audit §15):** `effis-rda` = EFFIS Rapid Damage
Assessment aus dem Archiv (JRC, seit 2020/21 Sentinel-2-gestützt bis 0–2 ha; kein Trennbarkeitsmaß,
kein Intervall ⇒ `areaMinHa = areaMaxHa`), heute die Trainingsquelle; `ba-dnbr` = eigene Kartierung der
BA-Linie (später, mit Trennbarkeit). Je Quelle ein Modell — nie mischen.

- `provisional` (teilkartiert) würde die Zielgröße systematisch nach unten verzerren — raus (Konzept §6).
- **Wo der Satz später liegt:** im BA-Watchlist-Eintrag (`konzept-brandflaechen-modul.md` §3) als Feld
  `features`, geschrieben beim Trigger `fire_out`, **eingefroren bei `t_end + 7 d`** (dann ist die letzte
  Detektion aus dem FIRMS-Fenster gefallen, der Satz kann sich nicht mehr ändern); `target` wird beim
  Übergang nach `mapped`/`final` ergänzt. Modelldatei: `public/fire/af/area-estimate-v{n}.json` (AF4).
- **Heute läuft nichts davon** — kein Cron, kein Speicher, keine Datei (Jan, 2026-08-18, §10 Frage 9).
  Der Client zeigt den Satz nur an; „JSON kopieren" ist der einzige Weg nach draußen.
- Stichprobenbias (Konzept §6): das Modell gilt nur für **detektierte** Brände und darf nie auf die
  Gesamtheit hochgerechnet werden — steht in jeder Methodikbeschreibung.
- V-AF-9 **entschieden (2026-08-18):** EFFIS-RDA-Kartierungen sind die Trainingsquelle für Modell v1
  (`scripts/fire/pairs-from-archive.mjs`, s. §7). Die frühere Sorge „≈ 30 ha" gilt nur für die MODIS-Ära
  bis 2019 — seit 2020/21 kartiert EFFIS Sentinel-2-gestützt bis 0–2 ha (`audit/waldbrand-effis.md` §5.3).

## 5. Beispiel (Verifier-Fixture, 3 Detektionen über 2 Überflüge, 3 h)

```json
{"featureVersion":1,"id":"fire:…","asOfMs":1786795200000,"country":null,"lat":48.003,"lon":11.002,
 "nDetections":3,"nOverpasses":2,"frpMaxPassMw":10,"frpSumWindowMw":15,"freMj":81000,"freSpanH":3,"freMaxGapH":3,
 "durationH":3,"coverageHa":44.6,"coverageCapped":false,"hullKm2":0,"sensorFamily":"VIIRS","daynightMix":"N",
 "meanScanKm":0.4,"landcoverDominant":null,"month":8,"confidenceFirms":{"high":0,"nominal":1,"low":0},
 "assessment":"plausibel","suspectedStatic":false,"activityState":"stable","effisMappedHa":null,"effisId":null}
```

## 6. Versionen

| Version | Datum | Änderung |
|---|---|---|
| 1 | 2026-08-18 | Erstfassung (AF3). Gleicher Tag: `FireLabelTarget.source` / `separability: number|null` / `effisId` (nur Ziel — `featureVersion` bleibt 1). |

## 7. Kalibrierung (AF4) — Modell `area-estimate-v{n}.json`

**Rechenweg** (`src/fire/activity/calibration.ts`, dieselbe Datei für `scripts/fire/calibrate.mjs` und
die Client-Schätzung `estimate.ts`): Regression in log-log-Koordinaten
`ln(areaHa) = β₀ + β₁·ln x [+ β₂·(ln x)²]` mit **Prädiktionsintervall** (nicht Konfidenzintervall)
`ŷ ± t(df, 0,9) · σ · sqrt(1 + hₓ)`, `hₓ = xᵥ′(X′X)⁻¹xᵥ`, df = n − k, Niveau `INTERVAL_LEVEL` 0,8.
Zwei Prädiktoren:

| Modell | Prädiktor x | wann | Paare |
|---|---|---|---|
| `fre` | `freMj` (FRE) | anwendbar, wenn eine belastbare FRE vorliegt (≥ 3 Detektionen über ≥ 2 Überflüge) | nur solche |
| `det` | `nDetections` | immer anwendbar (Einzelüberflüge sind für DACH der Regelfall) | alle |

**Modell v1 (Stand 2026-08-19, 604 zulässige Paare 2020–2026):**

| Modell | n | Grad | β | σ (ln) | Bereich | LOO-RMSE (ln) | LOO-Abdeckung |
|---|---|---|---|---|---|---|---|
| `det` | 604 | 2 | [1,476 · 0,373 · 0,102] | 1,329 | 1…462 Detektionen | 1,332 | 78,8 % |
| `fre` | 368 | 1 | [−1,150 · 0,298] | 1,486 | 2 208…1,39·10⁸ MJ | 1,491 | 77,4 % |

Die Streuung ist groß (σ 1,33 ln ⇒ 80-%-Intervall etwa ×/÷ 5,6) und das ist der ehrliche Befund:
VIIRS-Detektionen tragen für DACH-Kleinbrände nur einen Teil der Information; R² ≈ 0,31.

**Modellwahl (Prädiktor):** von den anwendbaren Modellen (innerhalb des Prädiktorbereichs) das mit der
kleineren Leave-one-out-Streuung. Das Konzept sah FRE vorn; die Archivdaten zeigen das Gegenteil —
Detektionen σ_LOO 1,33 vs. FRE 1,49 (ln) —, deshalb entscheidet die gemessene Güte, nicht die Vorannahme.
Geprüft und **verworfen**: `coverageHa` (LOO 1,37), `hullKm2` (1,48), `frpMaxPassMw` (1,42),
`durationH` (1,55) sowie multiple Regressionen (`nDetections + coverageHa`: 1,349 — kein Gewinn).

**Modellwahl (Grad):** Grad 2 wird genommen, wenn das quadratische Glied **signifikant** ist
(|t| ≥ 2; hier t = 3,5, F = 12,1), der Leave-one-out-Fehler nicht steigt und die Vorhersage im
Trainingsbereich **monoton** bleibt. Hintergrund: die Gerade war zu flach für große Brände und
unterschätzte ab 40 Detektionen systematisch (mittleres ln-Residuum +0,59 bzw. +1,23 über 100
Detektionen; Intervall-Abdeckung dort 67 % statt 80 %). Mit quadratischem Glied verschwindet der Bias
(+0,27 / +0,29). Die Monotonie-Regel ist fachlich, nicht statistisch: **mehr Feuer darf nie weniger
Fläche bedeuten** — am FRE-Modell war Grad 2 statistisch minimal besser, fiel aber zwischen 2 208 und
63 000 MJ; verworfen, dort bleibt es bei der Geraden.

Regeln: kein Fit unter `MIN_PAIRS_FOR_FIT` 25 · **keine Vorhersage außerhalb des Prädiktorbereichs**
des Trainings (`xMin…xMax` — auf ln-Skalen läuft Extrapolation sofort in Größenordnungen) · Punktwert
**nie ohne Intervall** · Modellversion, Labelquelle und n stehen im Text (`≈ X ha (Y–Z ha, 80 %) —
Modell v1, EFFIS-kalibriert (n Paare 2020–2025), aus FRE; kein Ersatz für eine Kartierung`) · trägt der
Eintrag eine Kartierung, gilt die Kartierung; die Schätzung steht nur zum Vergleich daneben.
Güte je Modell in der Datei: R², σ (ln), Leave-one-out-RMSE (ln) und Anteil der Ziele im 80-%-Intervall.

**Stichprobenbias (Konzept §6):** die Paare sind detektionsbedingt — VIIRS sieht bevorzugt große,
heiße Feuer, EFFIS kartiert nicht jede Fläche (Wolken, Kartierverzug). Das Modell gilt nur für
**detektierte** Brände und wird nie auf die Gesamtheit hochgerechnet. 80 % heißt: eine von fünf wahren
Flächen liegt außerhalb — erwartete Streuung, kein Fehler.

**Datenweg v1 (EFFIS-Archiv × FIRMS-SP):** `scripts/fire/pairs-from-archive.mjs` — je Jahr die
EFFIS-Kartierungen (`ms:modis.ba.poly.{Y}`, DACH) und die VIIRS-Detektionen aus dem FIRMS-Archiv
(`VIIRS_SNPP_SP`, `VIIRS_NOAA20_SP`; 5-Tage-Chunks, `type ≠ 0` verworfen), je Kartierung dieselben
Module wie der Client (Cluster → Zonen → Abgleich → Registry → `featuresOf`) ⇒ `FireLabelPair`.
Schlüssel nur lokal (`FIRMS_MAP_KEY` oder `.cache/firms-archive/mapkey.txt`, gitignored); der Prod-Proxy
bleibt NRT-only. Ergebnis: **Trainingsdaten** `data/fire/af/pairs-effis-{von}-{bis}.jsonl` +
`.report.json` + `.dropped.json` (im Repo, **nicht** ausgeliefert — der Client lädt sie nie) und daraus
das **Modell** `public/fire/af/area-estimate-v1.json` (die einzige Datei, die in den Browser geht;
Commit von Hand, kein Cron).

**Auslieferung:** Die Modelldatei ist statisch und nicht gehasht; der Service Worker führt `.json` als
gehashtes Asset (stale-while-revalidate). Der Loader holt sie deshalb mit `cache: 'no-store'` (T1-Muster),
und **jede veröffentlichte Neukalibrierung erhöht die Modellversion** (`area-estimate-v{n}.json`) — sonst
sähen wiederkehrende Besucher stillschweigend die alten Koeffizienten.

**Anzeige:** Detailkarte, Zeile „Schätzung" („Fläche ≈ …"), sichtbar per Default; **Kill-Switch** `?afEst=0` in der
URL oder `localStorage.afEst = '0'` (dann wird kein Modell geladen — Zustand vor AF4).
