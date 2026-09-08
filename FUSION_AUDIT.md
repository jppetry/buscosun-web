# FUSION_AUDIT — buscosun Fusion (Phasen 1–3: Inventar, Korrektheit, Bug-Liste)

> Stand **2026-09-07** · Reines Audit, kein Produktivcode geändert. Prüfgegenstand ist der
> Punkt-Algorithmus **buscosun Fusion** in `src/pointForecast/fusion/` (PV3/PV3b, Stand
> `implementierung-pv3.md` 2026-09-06) samt seiner Verdrahtung in `src/pointForecast/`.
>
> **Belegkonvention.** Jede Aussage trägt `Datei:Zeile`. Status je Befund:
> **verifiziert** = am Code gelesen **und** am echten Modul nachgerechnet (Sondenskript in
> Anhang A, gegen die importierten Module, netzfrei) · **verifiziert (Lesen)** = am Code
> eindeutig, keine Rechnung nötig · **Verdacht** = plausibel, nicht bewiesen ·
> **unklar** = aus dem Code nicht entscheidbar.
>
> Referenzlauf: `npm run verify:pv-fusion` am 2026-09-07 **167/167** (dist 37 · combine 20 ·
> terrainScale 20 · meteo 30 · fuse 60). Diese Zahl belegt, dass der Code seine **eigenen
> Priors** reproduziert — sie belegt keinerlei Skill gegen Beobachtungen (§4).
>
> **Nachtrag 2026-09-07 (Block 0 umgesetzt):** K-1, K-3, H-1 und H-2 sind behoben, der
> Quellen-Auslauf wirkt jetzt auf das Gewicht statt auf ρ; Gate GPV3c **187/187**
> (`audit/punktvorhersage-14tage/implementierung-pv3.md` §9, mit Vorher/Nachher-Zahlen).
> **K-2 ist ebenfalls umgesetzt** (Niederschlag zweistufig: Auftreten im Probit-Latentraum mit
> eigenen Auftretens-ACC, Menge bedingt auf nass, Hurdle-Verteilung; Gate GPV3d **208/208**,
> ebd. §10). Die Bug-Tabelle in §3.6 trägt den Status je Eintrag. Alle übrigen Befunde gelten
> weiter.

---

## 0. Kurzfassung

1. **Der Algorithmus ist im Produkt nicht angeschlossen.** `distribution: true` hat im gesamten
   `src/` keinen einzigen Aufrufer (`grep`: nur Definition `pointForecast.ts:141` und Kommentar
   `types.ts:103`). Alle 12 Consumer von `getPointForecast` rufen den Altpfad (handgesetzter
   Blend + `confidence`-Heuristik). Alles Folgende beschreibt daher einen **schlafenden**
   Rechenweg — was gut ist, denn drei der Befunde unten würden das Produkt heute
   verschlechtern.
2. **Der Obs-Anker rechnet Wert-, nicht Anomaliepersistenz** (K-1). Die Anomalie der Station
   wird gegen die Klimatologie der **Zielstunde** gebildet, nicht der Messstunde
   (`fuse.ts:349` mit `ctx.clima` aus `attach.ts:111-119`). Gemessen: im morgendlichen
   Temperaturanstieg zieht die Station die Vorhersage bei h = 2 um **1,4 K** zu kalt.
3. **Niederschlagsmengen werden durch die lineare Schrumpfung im log1p-Raum systematisch
   zerdrückt** (K-2). Gemessen: MOSMIX 5 mm/h bei Lead 24 h ⇒ Median **0,22 mm/h**,
   P(trocken) 41 %; 10 mm/h bei Lead 48 h ⇒ Median **0,03 mm/h**, P(trocken) 49 %.
4. **Fällt `climaGrid.json` aus, rechnet die Kette still gegen 8 °C weiter** (K-3), ohne
   Marker: MOSMIX 25 °C im Juli bei Lead 200 h ⇒ **18,5 °C**, `climatologyOnly = false`.
5. **MOSMIX wird doppelt gedämpft** (H-1): `AMPLITUDE.mosmix = 1` behandelt ein MOS-Produkt
   wie rohes Modell-Output; bei Lead 168 h bleiben von +8 K Anomalie **+5,56 K**.
6. Konzeptionell: in **DE ist die „Fusion" ab h ≈ 6 eine Ein-Quellen-Schrumpfung** (nur MOSMIX,
   `equivalentSources = 1,00` gemessen). ICON-D2, ICON-EU und IFS sind im Punktpfad nicht
   verdrahtet, obwohl `priors.ts:227-237` sie kennt. Der Multi-Modell-Anspruch existiert
   nur in AT/CH bis 60 h (AROME + MOSMIX).

Das mathematische Gerüst (Verteilungsfamilien, korrelierte Minimum-Varianz-Kombination,
Schrumpfung mit β = ρ) ist sauber gebaut und numerisch sorgfältig. Die Fehler liegen dort,
wo das Gerüst auf die Datenwirklichkeit trifft: Zeitbezug der Beobachtung, Nullinflation des
Niederschlags, MOS-Amplitude, fehlende Höhenkorrektur einzelner Quellen, fehlende
Betriebsmarker. Alle Zahlen darin sind Priors; nichts ist gefittet (`priors.ts:25-33`).

---

## 1. Phase 1 — Inventar

### 1.1 Einstiegspunkte und Module

| Modul | Rolle | Zeilen |
|---|---|---|
| `src/pointForecast/pointForecast.ts` | Orchestrator; holt Quellen, baut `unified`, rechnet Altpfad-Blend, hängt bei `distribution: true` die Fusion an | 777 |
| `src/pointForecast/fusion/attach.ts` | Adapter: DEM-Sampler, Klimatologie, Sonnenstand, Föhn, Mikroklima → `fuseHour` je Stunde | 157 |
| `src/pointForecast/fusion/fuse.ts` | Kern: `representativeness`, `windTerrainFactor`, `microResolution`, `fuseScalar`, `fuseHour`, `verifyFuse` | 1235 |
| `src/pointForecast/fusion/combine.ts` | Minimum-Varianz-Kombination mit Fehlerkorrelation, Aktiv-Menge, Cholesky, Rückfall | 355 |
| `src/pointForecast/fusion/priors.ts` | Alle Parameter: ACC-Kurven, Amplituden, Fußabdrücke, Repräsentativität, Korrelationen, Regime | 539 |
| `src/pointForecast/fusion/dist.ts` | Verteilungsfamilien normal/censoredNormal/logCensored/rice; Φ, Φ⁻¹, Rice-CDF, CRPS, PIT, `inflate` | 554 |
| `src/pointForecast/fusion/meteo.ts` | Feuchtkugel, Taupunkt, Phasenwahrscheinlichkeit, Schneefallgrenze, Kaltluftsee/Föhn-Regime | 431 |
| `src/pointForecast/fusion/terrainScale.ts` | Höhenstreuung σ_z(L) auf 6 Radien, TPI, Horizont, Sky-View | 286 |
| `src/pointForecast/sampleSources.ts` | Quellenadapter: BrightSky/MOSMIX, INCA-Punkt, AROME-Punkt, nächste Stationen | 651 |
| `src/pointForecast/gfsPoint.ts` | GFS-Schwanz 216–372 h (nur bei `hours > 240`) | 152 |
| `src/pointForecast/radarNowcast.ts` + `radarSample.ts` + `quadSampler.ts` | Radar-Punktabtastung DE/AT/CH | 171 + 68 + 146 |
| `src/pointForecast/terrainPhysics.ts`, `foehnDetector.ts` | Sonnenstand, Senkentiefe, Hang, Kaltluftsee-Zuschlag; Föhn-Score (Tier C) | 246 + 156 |
| `src/ml/climaField.ts` (+ `public/climaGrid.json`) | Klimatologie-Prior: 178 Stationen, Meteostat 1995–2024, tägliche Harmonische + Tagesgang-Halbamplitude | 252 |
| `src/fusion/spatialInterp.ts` (`estimateLapseRate`), `src/fusion/elevation.ts` | Lapse-Rate-Regression, DEM-Kacheln | — |
| `scripts/verify-pv-fusion.mjs` | Gate; in `.github/workflows/ci.yml:91` | 54 |
| `src/pointForecast/leadTimeWeights.ts` | **Altpfad** (Amtsinhaber): `FAMILY_CURVES`, `VARIABLE_MULTIPLIER`, `spatialWeight` | 217 |

Öffentliche API: `getPointForecast({ …, distribution: true })` → `PointForecastHour.fusion: FusedPoint | null` (`types.ts:108`, `fuse.ts:106-121`).

### 1.2 Datenfluss (Quelle → Einlesen → Punkt → Korrektur → Gewichtung → Fusion → Ausgabe)

| Schritt | Was passiert | Datei:Zeile |
|---|---|---|
| **Quellenwahl** | DE: MOSMIX (BrightSky) + DWD-Stationen + optional RADOLAN-RV; AT: + AROME + INCA-Punkt (≤ 4 h) + TAWES; CH: + AROME (GeoSphere-BBox) + SMN + optional rzc (nur h = 0); alle: GFS nur bei `hours > 240` | `pointForecast.ts:229-263`, `sampleSources.ts:249,342`, `radarNowcast.ts:51-73` |
| **Einlesen MOSMIX** | BrightSky `/weather` ab Stundenboden, nächste DWD-Station (`sources[0]`), km/h→m/s, Gesamtbedeckung **synthetisch** 55/30/15 gesplittet, Stationshöhe als `sourceElevation`, echte Distanz zum Abfragepunkt | `sampleSources.ts:180-243`, `:600-626` |
| **Einlesen AROME** | GeoSphere `timeseries/forecast/nwp-v1-1h-2500m`, `rr_acc` de-akkumuliert (Differenz, ≥ 0), Böe = |(ugust, vgust)|, `tcc·100` gesplittet, **`elevation: null`** (Gitterhöhe nicht verfügbar) | `sampleSources.ts:344-424` |
| **Einlesen INCA (AT)** | 15-min-Frames, nächster Slot je Stunde (≤ 30 min), `rr·4` → mm/h, **`elevation: null`** | `sampleSources.ts:268-336` |
| **Einlesen Stationen** | DE via BrightSky `current_weather` (Wolken bewusst `null`, `precipitation_10·6`), AT TAWES (2 Slots, jüngster finiter), CH SMN (letzte CSV-Zeile); 6 nächste nach Haversine; **Zeitstempel = `new Date()`** | `sampleSources.ts:446-522`, `:629-651`; `brightSkyCurrent.ts:144-182`; `geosphereTawes.ts:97-121`; `meteoSwissSmn.ts:95-140` |
| **Einlesen Radar** | RV 25 Frames (0–120 min), Toleranz 4 min; INCA-Grid 10 min; rzc nur ±5 min um `validAt` | `radarNowcast.ts:43-45, 79-107, 145-154` |
| **Einlesen GFS** | 1°-Gitter, Lauf mit Vorlauf 8/14/20/26 h (erster vollständiger), 6-h-Stützstellen linear interpoliert, `APCP/6`, **`sourceElevation: null`** | `gfsPoint.ts:90-99, 104-124, 136-148` |
| **Interpolation auf den Punkt** | MOSMIX: nächste Station (keine Interpolation); AROME/INCA: serverseitig an `lat_lon` — **unklar** ob nächster Gitterpunkt oder bilinear; GFS: bilinear auf 1° (≈ 70 × 111 km); Radar: nächste Zelle im projizierten Raum; DEM z9 (~150 m/px) | `sampleSources.ts:199, 282, 360`; `gfs.ts:243-262`; `quadSampler.ts:128-146`; `pointForecast.ts:203-206` |
| **Zeitachse** | `unified[h]` aus AROME/MOSMIX/UV/GFS-Zeitstempel; **Stunden ohne Zeitstempel werden übersprungen**; Stationen an `unified[0..5]` angehängt; Radar je Stunde im Horizont | `pointForecast.ts:305-329, 336-350` |
| **Lapse-Rate** | OLS über die ≤ 6 Stationen mit Reliabilitäts-Shrinkage; < 5 Stationen oder < 300 m Spanne ⇒ 0,0065 K/m | `pointForecast.ts:284-292`; `spatialInterp.ts:33-69` |
| **Gelände** | `terrainContext` (2,5-km-Ring, Senkentiefe ≤ 400 m, Neigung/Exposition) + `terrainScales` (6 Radien × 8 Azimute, 49 Lookups), Sky-View; kein DEM ⇒ **`fusion: null`** | `pointForecast.ts:201-215`; `attach.ts:81-84`; `terrainScale.ts:80-121, 161-169` |
| **Klimatologie** | `ClimaField.sample` (3 nächste Stationen, IDW, Höhenkorrektur 6,5 K/km), je Tag memoisiert; Stundenmittel = Tagesmittel + Halbamplitude·cos(2π(h−15)/24) | `attach.ts:86-97, 111-119`; `climaField.ts:116-141`; `fuse.ts:446-448` |
| **Geometrie-Korrekturen (kein Bias-Modell!)** | T: Lapse-Korrektur nur wenn `sourceElevation` bekannt; Wind/Böe: TPI-Abschirmung/Beschleunigung × „unaufgelöster" Anteil; Mikroklima-Offset (Kaltluftsee, Hang) je Quelle skaliert mit `1 − microResolution` | `fuse.ts:551-556, 214-222, 234-256, 325-326, 498, 663` |
| **Fehlerbudget je Member** | σ² = (α²σ_c²(1−ρ²) + σ_rep²)/(ρα)²; ρ aus ACC-Kurve (Familie × Variable × Lead), σ_rep aus Gelände/Distanz/Höhe | `fuse.ts:300-321`; `priors.ts:101-116, 147-216`; `fuse.ts:138-203` |
| **Kalibrierung zum erwartungstreuen Schätzer** | Anomalie = (Wert − Quellen-Klimatologie)/(ρα); Trockenmeldung als Zensur (Tobit-Momente) | `fuse.ts:329-350` |
| **Gewichtung/Kombination** | w = Σ̃⁻¹1/(1ᵀΣ̃⁻¹1) mit Σ̃ = geschrumpfte Korrelation (λ = 0,85), Aktiv-Menge erzwingt w ≥ 0, Streuung unter der **ungeschrumpften** Korrelation | `combine.ts:146-227`; `priors.ts:365-404, 416` |
| **Schrumpfung zur Klimatologie** | β = σ_c²/(σ_c²+σ_est²); μ = Klima + β·μ_est; var = σ_c²σ_est²/(σ_c²+σ_est²) + Regime-Zusatzvarianz | `fuse.ts:397-402` |
| **Form/Ausgabe** | T/Td normal; Wolken/RH/Böe censoredNormal [0,100]/[0,90]; Niederschlag logCensored; Wind Rice aus (u,v); Richtung nur bei ν/σ ≥ 1; P(Schnee) aus Feuchtkugel über T-Verteilung; Regime-Aufweitung | `fuse.ts:480-482, 509-530, 600-641, 657-659, 662-691, 699-726` |
| **Anhängen** | je Stunde `outHours[h].fusion = dists[h]`; jeder Fehler ⇒ alle `null` | `pointForecast.ts:497-515` |

**Bias-Korrektur:** Es gibt **keine** (weder statisch noch adaptiv). Was als „Korrektur" existiert, ist Geometrie (Lapse, TPI, Mikroklima). Damit stellt sich die Leakage-Frage nicht — es stellt sich die Frage, warum ein Verfahren mit dem Anspruch „besser als MOSMIX" ohne Bias-Term arbeitet (§5, `FUSION_IMPROVEMENTS.md` V-1).

### 1.3 Horizont-Regime

Es gibt keine harten Übergänge: jede Quelle trägt mit ρ(τ)-abhängiger Varianz, der Übergang folgt aus den Gewichten. Vor `maxLeadH` läuft ρ über `min(24 h, 15 % des Horizonts)` linear aus (`priors.ts:99, 113-115`). Die **praktische** Reichweite ist meist kürzer als `maxLeadH`, weil die Adapter weniger holen:

| Familie | Quellen im Pfad | `maxLeadH` (T) | tatsächlich im Pfad | ρ₀ (T) | Bemerkung |
|---|---|---|---|---|---|
| `obs` | dwd_obs / tawes / smn | 36 | **h = 0…5** (angehängt) | 0,999 | `pointForecast.ts:327`; Messzeitpunkt wird nicht geprüft (§3, H-5) |
| `nowcast` | inca (AT: T, Wind, RR), radolan_rv / rzc (nur RR) | 8 | INCA ≤ 4 h; RV ≤ 2 h; rzc h = 0 | 0,985 | `pointForecast.ts:240`, `radarNowcast.ts:79-107, 145-154` |
| `highres` | arome_at (AT/CH) | 60 | ≤ 60 h, Auslauf ab 51 h | 0,975 | DE: **keine** highres-Quelle im Punktpfad |
| `mosmix` | mosmix (alle Länder; dwd_uv trägt nur UV, wird von der Fusion übersprungen) | 246 | ≤ `hours` der Anfrage (Default DE 24, AT/CH 60; `countryProfiles.ts:76, 92, 108`), Auslauf ab 222 h | 0,985 | Produkt (BrightSky, S oder L) **unklar** |
| `global` | gfs | 384 | 216–372 h, nur bei `hours > 240` | 0,960 | kein heutiger Consumer fragt > 240 h an |
| Klimatologie | climaGrid | ∞ | immer (Prior); allein ab dem letzten Quellenhorizont (`climatologyOnly`) | — | ohne Klimatologie ⇒ `null` nur im quellenlosen Fall (`fuse.ts:363`) |

Übergänge, die real stattfinden: **Station → MOSMIX** bei ~2–3 h (DE), **Radar → MOSMIX** (Niederschlag) bei 2–6 h, **INCA/AROME → MOSMIX** (AT/CH) bei 4 bzw. 60 h, **MOSMIX → GFS** bei 222–246 h (nur bei Anfragen > 240 h), **alles → Klimatologie** darüber. Da `ρ_obs(5 h) = 0,914` und `ρ_mosmix(5 h) = 0,985`, dominiert die Station bei h = 5 nur noch über ihre kleinere σ_rep.

### 1.4 Variablen und Fusionspfad

| Variable | Eingang je Quelle | Arbeitsraum / Familie | Prior (μ_c, σ_c) | Pfad | Datei:Zeile |
|---|---|---|---|---|---|
| Temperatur | `temperature` (+ Lapse-Korrektur wenn `sourceElevation`) | normal | climaGrid Stundenwert, σ = max(1, tempStd) sonst 8 °C / 6 K | `fuseScalar` + Mikroklima + Regime-Zusatzvarianz + Phasenaufweitung | `fuse.ts:550-561, 723-726` |
| Taupunkt | `dewPoint` (GFS) oder Magnus(T, RH) — **ohne Höhenkorrektur** | normal | T_c − 4 K, σ 5 K | `fuseScalar` | `fuse.ts:574-583` |
| rel. Feuchte | abgeleitet aus T- und Td-Median, linearisiert, Kreuzterm r ∈ [0,55; 0,88] | censoredNormal [0,100] | — (Rückfall: RH direkt, 75 %/16 %) | Ableitung | `fuse.ts:600-641` |
| Bewölkung | Σ(low, mid, high) ≤ 100 (bei allen Punktquellen = synthetischer Split der Gesamtbedeckung) | censoredNormal [0,100] | 62 + 25·(wetProb−0,3), σ 34 | `fuseScalar` | `fuse.ts:466-482` |
| Niederschlag | `log1p(max(0, mm/h))`; 0 mm ⇒ Zensur | logCensored | μ = Φ⁻¹(p_wet,h)·1, σ 1 (log1p) | `fuseScalar` mit `dryCensor` | `fuse.ts:644-659, 329-347` |
| Wind | u, v je × `windTerrainFactor` | 2 × normal → Rice | 0 m/s, σ = 3,2 + 0,0016·z + 0,004·TPI | zwei `fuseScalar`, Betrag/Richtung aus dem Mittelvektor | `fuse.ts:496-530` |
| Böe | `gust` × `windTerrainFactor`; sonst Faktor 1,45→1,15 × Wind | censoredNormal [0,90] | 6 m/s, σ 5,5 + 0,6·(σ_wind−3,2) | `fuseScalar` oder Ableitung; Median-Boden ≥ Wind | `fuse.ts:662-691` |
| P(Schnee) | aus T-Verteilung + RH (zur Sättigung geblendet) | — | — | `snowProbability` | `fuse.ts:699-702`; `meteo.ts:104-113` |
| Schneefallgrenze | **nicht fusioniert** (nur Altpfad, AROME) | — | — | — | offen V-PV-10 |
| UV-Index | **nicht fusioniert** (Altpfad, `dwd_uv`) | — | — | — | `dwdUvForecast.ts:264-281` |

### 1.5 Was ausdrücklich **nicht** im Pfad ist

- **ICON-D2, ICON-D2-EPS, ICON-EU, ICON-CH1, ECMWF IFS**: in `priors.ts:227-237` mit Fußabdruck angelegt, aber kein Adapter speist sie in `getPointForecast` (`grep icon_d2|ecmwf_ifs` in `src/pointForecast/*.ts` außerhalb `fusion/`: nur Kommentare). Die Kartenlayer laden ICON-D2 über das Daten-Repo — der Punktpfad nicht.
- **Open-Meteo-Multimodell** (`fetchOpenMeteoPoint`, `sampleSources.ts:60-151`): existiert, wird nicht aufgerufen (NC-Lizenz, D-18).
- **Ein Consumer des Fusionsergebnisses**: keiner. `PointForecastPanel.tsx:123,131` ruft ohne `distribution`. Der Modellvergleich (`src/confidence/`) misst weiterhin gegen den Modell-Analysen-Konsens von Open-Meteo (`hitRate.ts:8-10`).

### 1.6 Was der Verifier belegt — und was nicht

`verifyFuse` (`fuse.ts:775-1224`) prüft Eigenschaften **relativ zu den eigenen Priors**: β = ρ (Zeilen 1031-1051), Monotonie der Streuung, Konvergenz zur Klimatologie, keine negativen Quantile, kein Sprung am Horizont, Determinismus. Kein Test verwendet eine Beobachtung. Die synthetischen Fixtures nutzen `flatCtx` mit fester Klimatologie 10 °C/6 K für **alle** Leads (`fuse.ts:758-773`) — dadurch ist der Zeitbezug-Fehler K-1 dort unsichtbar (die Klimatologie ändert sich zwischen h = 0 und h = 5 nicht).

---

## 2. Phase 2 — Mathematische und meteorologische Korrektheit

### 2.1 Minimum-Varianz/BLUE-Annahmen

| Frage | Befund | Status | Beleg |
|---|---|---|---|
| Erwartungstreue vor der Gewichtung? | Ja, **strukturell**: Anomalie/(ρα) macht den Member zum erwartungstreuen Schätzer der Wahrheitsanomalie — unter der Annahme α = 1 und **ohne Bias-Term**. Ein systematischer Modellfehler (z. B. ICON zu warm im Kaltluftsee, GFS am Gipfel) geht als Zufallsfehler in σ_rep ein, nicht als Bias. | verifiziert (Lesen) | `fuse.ts:319-321, 349`; `priors.ts:133-135` |
| Kovarianzen zwischen Modellen? | Ja: `familyErrorCorrelation` (Familienpaare) + `pointPairCorrelation` (Punktquellen), Σ_ij = ρ_ij σ_i σ_j, Schrumpfung λ = 0,85 vor der Inversion, Streuung unter der vollen Korrelation. Negativkontrolle vorhanden (Unabhängigkeitsannahme unterschätzt σ um 1,92×). | verifiziert | `combine.ts:158-224`; `priors.ts:365-404`; Verifier „Negativkontrolle … Faktor > 1,7" |
| Sind die Korrelationen richtig? | Sie sind **Setzungen** je Familie, nicht je Modellpaar: GFS (NOAA) gegen MOSMIX bekommt 0,45 — derselbe Wert, den ICON-EU (die MOSMIX-Basis) bekäme. AROME gegen ICON-D2 0,75, obwohl nur AROME im Pfad ist. σ_rep wird zwischen Quellen als unabhängig behandelt (§7.2 in `implementierung-pv3.md` räumt das ein). | verifiziert (Lesen) | `priors.ts:365-381` |
| Gewichte normiert, negativ, Nullvarianz? | Σw = 1 (Verifier 1,000000000); negative Gewichte per Aktiv-Menge ausgeschlossen; σ-Boden 1e-3; bei ≤ 1 Member direkt. Division durch ~0: `SIGMA_FLOOR` verhindert sie; 1/σ² eines 300-K-Members neben 0,2-K-Station: zeilenrelativer Jitter. | verifiziert | `combine.ts:56, 153-156, 183-200`; Verifier „σ = 0 wird abgefangen" |
| Degeneration bei singulärer Korrelation? | Vier Stufen: λ·0,6ᵏ, Jitter 10⁻⁸…10⁻², sonst `conservativeFallback` (Präzisionsgewichte, Streuung unter voller Korrelation). Nie „alle unabhängig". | verifiziert | `combine.ts:62-101, 114-135, 158-226` |

### 2.2 Varianzschätzung

- **Herkunft:** ausschließlich **statisch** aus `priors.ts` (ACC-Kurven, Repräsentativitätskoeffizienten, klimatologische σ). Kein EPS, kein rollierendes Fehlerfenster, keine Saison-, Tageszeit- oder Lageabhängigkeit von ρ(τ) (nur Variable × Familie). `priors.ts:25-33` sagt das ausdrücklich. — **verifiziert (Lesen)**.
- **σ_rep steckt schon in ρ₀** (stationsverifizierte ACC-Werte enthalten Repräsentativität) und wird ein zweites Mal addiert — von den Autoren als wichtigster offener Kalibrierpunkt benannt (`implementierung-pv3.md` §7.1). — **verifiziert (Lesen)**, Größe **unklar**.
- **Klimatologische σ_c (T)** stammt aus dem Residuum **täglicher Mittel** (`climatology.ts:113-116`, Median 3,64 K, Spanne 1,91–4,87 K über die 178 Stationen), wird aber als Streuung der **stündlichen** Anomalie benutzt (`fuse.ts:457`). Stundenanomalien streuen breiter (Nacht/Kaltluftsee) ⇒ Unterdispersion am langen Ende. — **verifiziert (Lesen)**, Faktor unklar (zu messen).
- **Regime-Zusatzvarianz** (Kaltluftsee 2,6 + 1,8 K², Föhn 3,2 K², Phase 0,5 K²) sind Setzungen. — `priors.ts:463-481`.

### 2.3 Kovarianz/„OI"

Es ist keine OI: keine räumliche Analyse, sondern eine k×k-Matrix über die Member einer Stunde. Positive Definitheit wird nicht bewiesen, sondern **erzwungen** (Schrumpfung + Jitter + Rückfall, §2.1). Höhendifferenz Station/Modell: Lapse-Korrektur auf dem Mittel (`fuse.ts:553-555`), Restunsicherheit 0,0035 K/m·|Δz| (`fuse.ts:162`, `priors.ts:294`), Sub-Footprint-Streuung γ·σ_z(L) (`fuse.ts:161`; `terrainScale.ts:124-135`). Für Quellen **ohne** `sourceElevation` (AROME, INCA, GFS, Radar) entfällt die Korrektur des Mittels ganz — bei GFS mit 28-km-Fußabdruck im Gebirge ist das ein Bias von mehreren Kelvin, der als Streuung (σ_rep ≈ 5,7 K) statt als Verschiebung behandelt wird (H-3).

### 2.4 Bias-Korrektur

Nicht vorhanden (siehe 1.2). Keine Trainingsdaten, kein Fenster, keine Leakage-Frage. Der Verifier trainiert nichts; er prüft Priors gegen sich selbst.

### 2.5 Variablenspezifische Fallen

| Falle | Befund | Status | Beleg |
|---|---|---|---|
| **Windrichtung zirkulär** | Korrekt vektoriell: u und v getrennt fusioniert (gleiche Gewichte, da gleiche σ), Richtung aus dem Mittelvektor, nur bei Konzentration ν/σ ≥ 1 gemeldet. | verifiziert | `fuse.ts:497-529`; `priors.ts:523` |
| **Niederschlag linear gemittelt?** | Nein — aber **im log1p-Raum linear zur trockenen Klimatologie geschrumpft** (β·Anomalie). Wirkung siehe K-2: die Mengen werden bei Lead ≥ 3 h um Faktor 3–30 im Median gedämpft; kein Probability Matching, keine Quantil-Abbildung, keine Nachbarschaft. Die mathematische Spezifikation empfahl Quantilregression/CSGD (`mathematik-spezifikation.md` §4.3); gebaut wurde die Gauß-Schrumpfung. | verifiziert | `fuse.ts:319-320, 349, 397-400, 648-656`; `priors.ts:191-201, 428`; Sonde B |
| **Böen/Extremwerte** | Böen aus Quellen werden wie Wind geschrumpft (ρ_gust ≤ 0,90); Spitzen werden gedämpft, nicht kompensiert. Nebenbedingung Böe ≥ Wind nur am **Median** (`quantileOf(…,0.5)`), q10(Böe) < q10(Wind) tritt auf (Sonde L: 5,11 < 5,77). | verifiziert | `fuse.ts:688-691` |
| **Akkumulierte Felder** | AROME `rr_acc` per Differenz ≥ 0 (erste Stunde ohne Vorgänger ⇒ `null`); GFS `APCP/6` an 6-h-Stützstellen — welcher APCP-Record (0–N oder 6-h-Eimer) vom `.idx`-Match `:APCP:surface:` getroffen wird, ist am Code nicht entscheidbar. | verifiziert (Lesen) / **unklar** (GFS-Eimer) | `sampleSources.ts:393-397`; `gfsPoint.ts:36, 120` |
| **Bewölkung** | Wertebereich per censoredNormal [0,100] sauber. Schichten sind bei **allen** Punktquellen erfunden (55/30/15); die strahlungsgewichtete Summe 1,0/0,6/0,25 liefert deshalb konstant 0,77·Gesamt ⇒ das Kaltluftsee-Gate (65 %) schließt erst bei ~85 % Gesamtbedeckung (Sonde G). | verifiziert | `sampleSources.ts:211-221`; `fuse.ts:487-489`; `meteo.ts:221-227` |
| **Feuchte** | Td ≤ T nur am Median erzwungen (`Math.min(tMed, …)`); die Td-Verteilung selbst ist nicht an T gekoppelt ⇒ q90(Td) > q90(T) möglich. | verifiziert (Lesen) | `fuse.ts:603` |

### 2.6 Zeitliche Konsistenz

- Glatt über den Vorlauf: Verifier „kein Sprung, wenn eine Quelle ihren Horizont erreicht" — größter Stundenschritt 0,150 K (Lead 223 h). — **verifiziert**.
- **Aber:** der Auslauf beginnt 24 h vor `maxLeadH`. Für MOSMIX (246 h) fällt ρ ab 222 h linear auf 0 — bei h = 240 ist ρ = 0,131 (Sonde C), obwohl MOSMIX dort real ACC ≈ 0,5 trägt. In diesem Fenster wird vorhandener Skill weggeworfen. Praktisch nur relevant für Anfragen > 222 h. — **verifiziert**, Schwere mittel (M-1).
- **Sprung am Stationsende**: Stationen sind nur an h = 0…5 angehängt; bei h = 6 fallen sie hart weg (`pointForecast.ts:327`), der ρ-Auslauf (ab 30,6 h) greift nie. Mit ρ_obs(5) = 0,914 und Distanzgewicht ist der Schritt klein, aber existent; nicht gemessen. — **Verdacht**.

### 2.7 Zeit- und Lauf-Handling

| Punkt | Befund | Status | Beleg |
|---|---|---|---|
| UTC | durchgängig UTC; Sonnenstand NOAA aus UTC; Ortszeit-Proxy `UTC + lng/15`; keine Sommerzeit-Abhängigkeit | verifiziert (Lesen) | `attach.ts:41-45, 113`; `terrainPhysics.ts:32-58` |
| Lead-Index | **Lead = Array-Index** (`attach.ts:75-77`). `unified` überspringt Stunden ohne Zeitstempel (`pointForecast.ts:310 continue`). Fehlt in allen Zeitachsen eine Stunde, verschiebt sich Index gegen Lead; ρ(τ) und Klimatologie liefen dann für die falsche Stunde. | **Verdacht** (tritt nur bei Lücken in MOSMIX/AROME auf; nicht beobachtet) | `attach.ts:75-77, 105-106, 154` |
| Alter des Laufs | ρ(τ) wird mit dem Lead **ab jetzt** ausgewertet, nicht ab Modell-Initialisierung. GFS-Lauf ist per Konstruktion 8–26 h alt (`gfsPoint.ts:90`); AROME `reference_time` wird gelesen und verworfen; MOSMIX-Ausgabezeit ist dem Client unbekannt. ρ wird damit um das Laufalter überschätzt (GFS bei 240 h: 0,471 statt ≈ 0,428 bei 20 h Alter). | verifiziert (Lesen) | `priors.ts:101-116`; `gfsPoint.ts:83-99`; `sampleSources.ts:366` |
| Beobachtungsalter | Stationsmesswerte tragen **keinen** Zeitstempel in den Sample (`timestamp: new Date()`); BrightSky liefert `weather.timestamp`, der Adapter liest ihn nicht; TAWES nimmt den jüngsten finiten von zwei Slots; SMN die letzte Zeile. Eine seit Stunden ausgefallene Station gilt als ρ₀ = 0,999 bei h = 0. | verifiziert (Lesen) | `brightSkyCurrent.ts:30, 168-182`; `geosphereTawes.ts:97-100`; `meteoSwissSmn.ts:102-110`; `sampleSources.ts:633` |
| Off-by-one | BrightSky ab Stundenboden (`setUTCMinutes(0)`), AROME/INCA erster Slot ≥ Stundenboden, GFS `t0 = floor(now/1h)`: konsistent. Stationen (Messzeit ≈ jetzt, bis 10–60 min nach dem Stundenboden) werden bei h = 0 als Wert **für den Stundenboden** genommen — ≤ 1 h Versatz, in der Anomalie-Rechnung K-1 relevant. | verifiziert (Lesen) | `sampleSources.ts:186-187, 293-295, 370-376`; `pointForecast.ts:259` |
| Läufe gemischt | Jede Quelle wird unabhängig geholt (verschiedene Zyklen); Radar-Sampler 5 min, `PF_CACHE` 3 min gecacht; keine Lauf-Identität im Sample. Inhärent, aber ungekennzeichnet. | verifiziert (Lesen) | `pointForecast.ts:147-176` |

### 2.8 Interpolation auf den Punkt / Höhenkorrektur

- T: Lapse-Korrektur mit `lapseRatePerM` (Stations-OLS, Rückfall 0,0065) nur für Quellen mit `sourceElevation` (Station, MOSMIX, sonst keine). AROME/INCA/GFS/Radar: keine. — `fuse.ts:553-555`.
- **Td: keine Höhenkorrektur**, obwohl `DEWPOINT_LAPSE_PER_M = 0,0018` definiert ist (`priors.ts:267`) und in σ_rep verwendet wird (`fuse.ts:169`). Gemessen (Sonde E): Station 300 m, Punkt 1100 m ⇒ Td 6,77 statt ≈ 5,85 °C, RH 86,6 statt ≈ 81,3 %. — **verifiziert** (H-2).
- Alpenraum: Stationsnetz und `climaGrid` sind flachlandlastig — nur **6 von 178** Klimastationen liegen über 1500 m (ausgezählt). Ein 2500-m-Punkt bekommt seine Klimatologie aus drei tieferen Stationen minus 6,5 K/km (`climaField.ts:132-133`); die reale Höhenabhängigkeit klimatologischer Mittel (≈ 5,5 K/km, Winterinversionen) wird nicht getroffen. Genau dorthin konvergiert die Vorhersage ab Tag 8. — **verifiziert (Lesen)**, Größe unklar.

### 2.9 Plausibilitätsgrenzen

| Größe | Grenze | Status |
|---|---|---|
| Niederschlag < 0 | unmöglich (logCensored) | verifiziert (Verifier „nie negativ") |
| RH > 100 % | am Median unmöglich; Quantile zensiert [0,100]; Td > T in den Rändern möglich | verifiziert (Lesen), `fuse.ts:603, 624` |
| Böe < Wind | am Median verhindert, in den Quantilen nicht (Sonde L) | verifiziert |
| Bewölkung außerhalb [0,100] | unmöglich | verifiziert |
| Wind < 0 | unmöglich (Rice) | verifiziert |
| Temperatur | unbeschränkt (korrekt) | — |

---

## 3. Phase 3 — Robustheit und Bug-Liste

### 3.1 NaN/undefined-Propagation

Durchgängig gut abgefangen: `Number.isFinite` an jedem Quellwert (`fuse.ts:299, 468, 552, 576-578, 651, 663`), NaN-Distanz (`fuse.ts:147, 235, 383-384`), σ_rep (`fuse.ts:307`), σ (`:321`), `combine` (`combine.ts:98, 190, 203, 216`), DEM-Löcher (`terrainScale.ts:105-106`), totes DEM (`attach.ts:81-84`), Klimatologie NaN (`attach.ts:111`). Ein NaN bleibt nirgends unbemerkt **stehen** — er löscht den Member still (Design). Gefährlich ist nur das Gegenteil: ein **falscher endlicher** Wert (K-3).

### 3.2 Verhalten bei Ausfällen

| Situation | Verhalten | Sichtbar? | Beleg |
|---|---|---|---|
| Quelle fehlt | Member fehlt; übrige tragen; 0 Member ⇒ Klimatologie mit `climatologyOnly` | ja (`contributors`, `climatologyOnly`) | `fuse.ts:353-372` |
| Teilweise fehlende Schritte | pro Stunde unabhängig; Index-Verschiebung bei komplett leeren Stunden (§2.7) | nein | `pointForecast.ts:310` |
| Veralteter Lauf / alte Messung | nicht erkannt (§2.7) | **nein** | — |
| Punkt außerhalb Domäne | AROME/INCA liefern `[]` (BBox-Guard); BrightSky 404 ⇒ `null`; Radar `null` außerhalb Quad | still, aber korrekt | `sampleSources.ts:274-279, 350-355`; `quadSampler.ts:128-146` |
| Horizont jenseits aller Quellen | Klimatologie, markiert | ja | `fuse.ts:363-371` |
| **DEM fehlt** | `fusion: null` für alle Stunden | ja (`null`) | `attach.ts:81-84` |
| **Klimatologie fehlt** | Konstanten 8 °C / 6 K / 30 % Nasstage / 62 % Wolken; **kein Marker**; Ergebnis sieht aus wie eine Fusion | **nein** (K-3) | `fuse.ts:456-462`; `attach.ts:29-35, 86` |
| Einzelquelle als „Fusion" | ja: DE ab h ≈ 6 nur MOSMIX (`equivalentSources = 1,00`, Sonde K); der Name „Fusion" ist dann eine Schrumpfung mit Geometrie. `contributors` zeigt es, die UI liest es nicht (kein Consumer). | teils | `fuse.ts:404-413` |

### 3.3 Einheiten und Präzision

Konvertierungen sind korrekt: BrightSky km/h → m/s (`brightSkyCurrent.ts:148, 166`; `sampleSources.ts:206, 222`), 10-min-Niederschlag ×6 (`brightSkyCurrent.ts:164`; `geosphereTawes.ts:121`; `meteoSwissSmn.ts:132`), INCA 15 min ×4 (`sampleSources.ts:326`), AROME `tcc·100` (`:386`), GFS K → °C (`gfsPoint.ts:117, 122`), Rice-Unterlauf ab ν/σ > 31,6 per Normalnäherung (`dist.ts:145`), Φ⁻¹ ohne Halley-Verschlechterung (`dist.ts:88-96`). Kein Befund.

### 3.4 Caching/Staleness

`PF_CACHE` (3 min, Schlüssel enthält das Verteilungsflag) und Radar-Sampler (5 min) sind korrekt getrennt (`pointForecast.ts:164-176, 147-156`); abgebrochene/leere Läufe werden nicht gecacht (`:533-536`). Klimatologie-Fehlschlag wird nicht memoisiert (`attach.ts:29-35`). Kein Befund über §2.7 hinaus.

### 3.5 Performance

Je Stunde ≈ 0,2 ms (Doku 214 µs; eigener Lauf 336 Stunden in Sekundenbruchteilen). Hotspots: Rice-Quantil per Bisektion (60 × Reihe, `dist.ts:198-207`) — je Stunde 2–3 Aufrufe; `terrainScales` einmal je Anfrage (49 Lookups); Klimatologie je Tag memoisiert (`attach.ts:91-97`); Yield alle 32 Stunden (`attach.ts:38`). Unkritisch.

### 3.6 Bug-Liste

Schwere: **kritisch** = falsches Ergebnis in der Kernfunktion bei normalen Eingaben · **hoch** = systematischer Fehler mit messbarer Größe · **mittel** = begrenzte Wirkung oder Sonderfall · **niedrig** = Schönheitsfehler/Konservativ-Fehler.

| ID | Schwere | Befund | Datei:Zeile | Minimaler Repro | Erwartet | Tatsächlich | Status |
|---|---|---|---|---|---|---|---|
| **K-1** | **kritisch** | Obs-Anker bildet die Anomalie gegen die Klimatologie der **Zielstunde** statt der Messstunde ⇒ Wertpersistenz, obwohl `priors.ts:139-145` Anomaliepersistenz behauptet. Systematisch kalt im Tagesanstieg, warm im Abfall, h = 1…5 in jedem DE-Punkt mit Station. | `fuse.ts:349` (`sourceClimaMean` = `opt.climaMean` der Stunde h), `attach.ts:111-119`, `pointForecast.ts:327` | Sonde A: Station 8 °C um 06 lokal (Klima 10), Klima 11,8 °C um 08, MOSMIX 12 °C bei h = 2 | Obs-Beitrag ≈ 11,8 + 0,974·(8−10) = 9,85 ⇒ Fusion ≈ 11,2 | Obs-Member-Anomalie −3,90 K ⇒ Fusion **10,58** (ohne Obs 12,00); bei h = 5: 14,99 statt ≈ 15,4 | verifiziert · **behoben 2026-09-07** (`validAtMs`, `climaAt`; h = 2 jetzt 11,22, h = 5 15,60; Negativkontrolle im Verifier) |
| **K-2** | **kritisch** (Niederschlag) | Gauß-Schrumpfung im log1p-Raum zur fast-trockenen Klimatologie (p_wet,h ≈ 4,7 %) dämpft Mengen um Faktor 3–30 und hebt P(trocken) auf 40–50 % bei klaren Modellsignalen. Extreme werden strukturell zerstört. | `fuse.ts:319-320, 349, 397-400, 648-656`; `priors.ts:191-201, 428, 492` | Sonde B: MOSMIX 5 mm/h | ≥ 60–70 % nass, Median ≈ 2–3 mm/h (typische Bedingtverteilung bei Lead 24 h) | Lead 3 h: Median 1,15, P(dry) 14 % · Lead 24 h: Median **0,22**, P(dry) **41 %** · 10 mm/h Lead 48 h: Median **0,03**, P(dry) 49 %, q90 2,3 mm | verifiziert · **behoben 2026-09-07** (zweistufig, `hurdleLogNormal`; 24 h jetzt P(dry) 21 %, Median 1,95, bedingter Median 2,82; 48 h P(dry) 22 %, Median 2,36 — `implementierung-pv3.md` §10) |
| **K-3** | **hoch** (bei Eintritt kritisch) | Ohne Klimatologie rechnet die Kette gegen 8 °C / 6 K / 30 % weiter, ohne Marker; `climatologyOnly` bleibt `false`, `contributors` nennt MOSMIX. Jeder Netzfehler auf `climaGrid.json` erzeugt eine plausibel aussehende, um bis zu 13 K falsche Vorhersage. | `fuse.ts:456-462, 475`; `attach.ts:29-35, 86, 111` | Sonde D: `clima: null`, MOSMIX 25 °C | Fehler sichtbar (Marker) oder `null` | h = 120: 21,7 °C · h = 200: **18,5 °C** · h = 240: **10,2 °C** (mit Juli-Klima 22 °C: 24,4 / 23,9 / 22,4) | verifiziert · **behoben 2026-09-07** (`attach.ts` verweigert ohne Klimatologie; `FusedPoint.climaSource`) |
| **H-1** | hoch | `AMPLITUDE.mosmix = 1`: ein MOS-Produkt ist bereits regressionsgedämpft (α ≈ ρ); die zusätzliche Schrumpfung um ρ dämpft MOSMIX-Anomalien im Mittelfristbereich doppelt. | `priors.ts:119-135`; `fuse.ts:319-320` | Sonde C: MOSMIX +8 K | ≈ +8 K (α = ρ ⇒ Steigung 1) | h = 72: +7,21 · h = 120: +6,45 · h = 168: **+5,56** · h = 240: +1,05 (Auslauf) | verifiziert · **behoben 2026-09-07** als Prior α = √ρ (`AMPLITUDE_RHO_EXPONENT`): h = 168 jetzt +6,67 K; α(τ) bleibt zu messen |
| **H-2** | mittel | Taupunkt ohne Höhenkorrektur; nur T wird lapse-korrigiert ⇒ RH am Punkt systematisch zu hoch, wenn die Quelle tiefer liegt. | `fuse.ts:574-583` vs. `:553-555`; `priors.ts:267` | Sonde E: Station 300 m, Punkt 1100 m, 15 °C/60 % | Td ≈ 5,85, RH ≈ 81 % | Td 6,77, RH **86,6 %** | verifiziert · **behoben 2026-09-07** (Td 5,52, RH 79,4 % — der Rest ist die Repräsentativität der 800 m Höhendifferenz) |
| **H-3** | hoch (Alpen, > 216 h) | GFS trägt keine Zellhöhe (`sourceElevation: null`) ⇒ keine Lapse-Korrektur; der Höhenbias einer 28-km-Zelle geht als σ_rep ein, nicht als Verschiebung. | `gfsPoint.ts:138`; `fuse.ts:148-149, 553` | Sonde I: Gipfel 2000 m, GFS-Zelle ~1000 m sagt 5 °C, Klima −1 °C | ≈ −1,2 °C | h = 250: **+0,87 °C** · h = 336: +0,20 °C (≈ +2 K warm) | verifiziert (synthetisch; Zellhöhe real unklar) |
| **H-4** | mittel | Trockenzensur: Mittel exakt, **Varianz zu klein** (Kommentar behauptet exakte Tobit-Posterior). Posterior-σ um 25 % zu schmal ⇒ P(nass) nach Radar-„kein Echo" 0,4 % statt 2,5 %. | `fuse.ts:337-345` | Sonde F: radolan 0 mm, Lead 0 | σ = 0,904 | σ = **0,675** (Faktor 0,747) | verifiziert (Herleitung: Var[z|y≤0] = σ_c²(1 − (σ_c²/σ_T²)·λ(λ+α))) · **gilt weiter** — seit K-2 in der Auftretensstufe (Probit-Latent, σ_c = 1) |
| **H-5** | hoch | Messalter unbekannt: Stationssample ohne Zeitstempel; eine seit Stunden nicht meldende Station bleibt ρ₀ = 0,999 bei h = 0. | `sampleSources.ts:633`; `brightSkyCurrent.ts:30, 168-182`; `geosphereTawes.ts:97-100`; `meteoSwissSmn.ts:102-110` | Station mit `timestamp` vor 3 h (BrightSky liefert ihn) | Abwertung oder Ausschluss | volle Anker-Wirkung | verifiziert (Lesen) |
| **H-6** | mittel | Laufalter geht nicht in ρ(τ) ein (Lead ab „jetzt"); GFS strukturell 8–26 h alt. | `priors.ts:101-116`; `gfsPoint.ts:83-99`; `sampleSources.ts:366` | GFS-Lauf 20 h alt, Lead 240 | ρ ≈ 0,428 | ρ = 0,471 | verifiziert (Lesen + Rechnung an `accAt`) |
| **H-7** | mittel | Lead = Array-Index; leere Stunden verschieben Index gegen Lead. | `attach.ts:75-77`; `pointForecast.ts:310` | MOSMIX-Reihe mit einer fehlenden Stunde | Lead aus Zeitstempel | Lead um 1 verschoben, Klimatologie/Sonne bleiben korrekt (aus Zeitstempel) | **Verdacht** |
| **M-1** | mittel | 24-h-Auslauf vor `maxLeadH` wirft MOSMIX-Skill 222–246 h weg (ρ 0,52 → 0,13 bei 240 h). | `priors.ts:99, 113-115` | Sonde C h = 240 | Skill erhalten bis 246 h | +1,05 K von +8 K | verifiziert · **teilweise 2026-09-07**: Auslauf wirkt jetzt auf das Gewicht (Varianz ∝ 1/taper), Member-Mittel bleibt kalibriert; h = 240 jetzt +1,82 K; das Fenster selbst (24 h) bleibt |
| **M-2** | mittel | Klimatologische σ_c aus Tagesmittel-Residuen als Stundenanomalie-Streuung; Tagesgang als Kosinus mit festem Maximum 15 Uhr (Minimum 03 Uhr statt Sonnenaufgang). Prior-Fehler um 06 lokal ≈ 0,3·Amplitude (≈ 1 K); fließt voll in K-1 und ins lange Ende. | `climatology.ts:113-116`; `climaField.ts:140`; `fuse.ts:429, 446-448, 457` | — | stundenaufgelöste Klimatologie | Tagesmittel-σ, Kosinus | verifiziert (Lesen) |
| **M-3** | mittel | Wind-Prior zu windig im Flachland und höhenproportional: Median 4,33 m/s bei 300 m Ebene, 5,27 m/s bei 800 m Plateau; dorthin konvergiert jede Windvorhersage ab Tag 8. | `priors.ts:429, 442-446` | Sonde J | ≈ 3 m/s Flachland (DWD-Stationsmittel) | 4,33 / 5,27 / 8,01 / 12,25 m/s (300 / 800 / 1500+TPI300 / 2500+TPI800) | verifiziert; Kalibrierfrage |
| **M-4** | mittel | Kaltluftsee-Gate: erfundener 55/30/15-Split × Strahlungsgewichte ⇒ 0,77·Gesamt; Gate (65 %) schließt erst bei ~85 % Gesamtbedeckung. | `sampleSources.ts:211-221`; `fuse.ts:487-489`; `meteo.ts:221-227` | Sonde G: 80 % Gesamt | Kaltluftsee aus | Stärke 0,034 (85 %: 0) | verifiziert |
| **M-5** | mittel | `basinDepthM = max(−TPI über alle Radien)`: jeder Punkt unter dem 12-km-Ringmittel (Hangfuß, Plateau vor Gebirge) gilt als Becken ⇒ Kaltluftsee-Aufweitung ohne Becken. | `fuse.ts:536` | konkaver Hang, Ring 12 km mit Grat | Aufweitung nur in Senken | Aufweitung auch am Hang | **Verdacht** (Vorzeichen klar, Häufigkeit unklar) |
| **M-6** | niedrig | Punktpaar-Korrelation aus |d_a − d_b| statt aus dem Stationsabstand: gegenüberliegende Stationen (20 km Abstand) gelten als fast ko-lokalisiert (0,889). Konservativ, aber falsch gewichtet. | `fuse.ts:379-385`; `priors.ts:401-404` | Sonde H | ≈ 0,72 (20 km) | 0,889 | verifiziert |
| **M-7** | niedrig | Böe ≥ Wind nur am Median; q10 verletzt. | `fuse.ts:688-691` | Sonde L | q_p(Böe) ≥ q_p(Wind) ∀p | q10 5,11 < 5,77 | verifiziert |
| **M-8** | niedrig | RH-Kreuzterm: `betaOf(temperature)` teilt die **regime-aufgeweitete** Posterior-σ durch `rawSigma`; β > 1 wird auf 1 geklemmt ⇒ in Kaltluftsee-Nächten wandert r zur Klimatologie-Korrelation 0,88 und RH wird schmaler statt breiter. | `fuse.ts:402, 610-618` | Nacht, Senke, Wind 0 | r nahe 0,55 | r → 0,88 | verifiziert (Lesen) |
| **M-9** | niedrig | `assessRegime` mit `windMs: null ?? 0` bei fehlender Windquelle ⇒ Windstille angenommen ⇒ Kaltluftsee aktiv. | `fuse.ts:544`; `meteo.ts:210` | Stunde ohne u/v | neutral | calm = 1 | verifiziert (Lesen) |
| **M-10** | niedrig | Familienkorrelationen ignorieren das Modellzentrum (GFS ↔ MOSMIX 0,45 wie ICON-EU ↔ MOSMIX). | `priors.ts:365-386` | — | modellpaarweise | familienweise | verifiziert (Lesen) |
| **M-11** | niedrig | Trace-Niederschlag (0,05 mm/h) ist ein volles Nass-Sample; keine Schwelle. | `fuse.ts:651-652` | MOSMIX 0,05 mm/h | wie Trockenmeldung | Anomalie +2,3 σ | verifiziert (Lesen) · **entschärft durch K-2**: die Anamorphose macht 0,1 mm/h zu einer schwachen Nass-Aussage (P(nass) 24 % gegen 79 % bei 5 mm/h) |
| **M-12** | niedrig | Stationen fallen bei h = 6 hart weg (angehängt nur 0…5); der Auslauf (ab 30,6 h) greift nie. | `pointForecast.ts:327`; `priors.ts:156` | — | weicher Übergang | Stufe bei h = 6 (Größe nicht gemessen) | **Verdacht** |

Nicht als Bug gewertet, aber festgehalten: `FOOTPRINT_M` nennt `ecmwf_ifs`, `icon_d2`, `icon_ch1`, die nie ankommen (`priors.ts:227-237`); `verifyFuse` kann K-1 strukturell nicht sehen (§1.6); `snowLine` und `uvIndex` haben keine Verteilung.

---

## 4. Gesamturteil

**Was belastbar ist.** Die Verteilungsalgebra (`dist.ts`), die korrelierte Kombination (`combine.ts`) und die Schrumpfung mit β = ρ sind korrekt hergeleitet und numerisch abgesichert (analytischer CRPS-Gegentest, 1/√2-Identität, Negativkontrollen). Die Repräsentativitäts-Idee (σ_rep = γ·σ_z(L) aus dem DEM) ist der einzig originelle und wahrscheinlich wertvollste Baustein: sie macht die Engine an **stationslosen Punkten in komplexem Gelände** potenziell besser als jede interpolierte Einzelquelle.

**Was konzeptionell falsch oder unbelegt ist.**
1. Die Engine ist ein **Prior-Modell ohne Daten**: ρ(τ), α, σ_rep, Korrelationen, Regime-Varianzen — alles gesetzt. Es gibt keinen einzigen Vergleich mit einer Beobachtung. Bis PV2 gemessen hat, ist „besser als MOSMIX" eine Hypothese.
2. Die Gauß-Anomalie-Schrumpfung ist das falsche Modell für **Niederschlag** (K-2) und für **MOS-Produkte** (H-1). Für T, Td und Wind ist sie vertretbar.
3. Der Beobachtungsanker ist an der wichtigsten Stelle (h = 1…5) falsch gerechnet (K-1).
4. „Fusion" ist in DE ab h ≈ 6 eine Ein-Quellen-Schrumpfung; das Korrelationsgerüst ist dort leer. Ohne ein von MOSMIX unabhängiges Modell (IFS) und ohne das im Repo bereits gespiegelte ICON-D2 gibt es keinen Fusionsgewinn zu holen.
5. Betriebsrobustheit: kein Marker für fehlende Klimatologie (K-3), kein Mess-/Laufalter (H-5/H-6).

**Empfehlung in einem Satz:** Nicht anschließen, bevor K-1, K-2 (mindestens als Rückfall auf Modell-PoP/-Menge), K-3 und H-1 behoben **und** PV2 die erste Zahl gegen Beobachtungen geliefert hat — `FUSION_VERIFICATION.md`.

---

## Anhang A — Sondenskript (Repro aller „verifiziert"-Zahlen)

Das Skript liegt außerhalb des Repos (Scratchpad) und importiert die echten Module. Start aus der Repo-Wurzel:

```
node --experimental-strip-types --import ./scripts/lib/register-ts.mjs <pfad>/probe-fusion.mjs
```

Kern (gekürzt; `mk`, `flat`, `ctx` entsprechen `mkSample`/`flatCtx` aus `fuse.ts:749-773`):

```js
import { fuseHour, representativeness } from 'file:///C:/dev/buscosun-web/src/pointForecast/fusion/fuse.ts';
import { quantileOf, meanOf, cdfOf, Phi, phi } from 'file:///C:/dev/buscosun-web/src/pointForecast/fusion/dist.ts';
import { accAt, ACC, pointPairCorrelation } from 'file:///C:/dev/buscosun-web/src/pointForecast/fusion/priors.ts';
import { radiativeCloudPct, coldPoolStrength, rhFromDewPoint, dewPointC } from 'file:///C:/dev/buscosun-web/src/pointForecast/fusion/meteo.ts';

// A  Obs-Anker: clima(h) variiert mit der Stunde, Obs bleibt 8 °C von 06 lokal
for (const [h, climaH, mos] of [[0,10,8.5],[2,11.8,12],[3,12.9,14],[5,14,16]]) {
  const s = [mk({source:'dwd_obs',family:'obs',temperature:8,sourceElevation:300,distanceMeters:300}),
             mk({source:'mosmix',family:'mosmix',temperature:mos,sourceElevation:300,distanceMeters:5000})];
  const c = ctx({clima:{tempMeanC:climaH,tempSigmaC:6,wetProbDaily:0.25}});
  console.log(h, fuseHour(s,h,c).temperature.dist.mu, fuseHour([s[1]],h,c).temperature.dist.mu,
              climaH + accAt(ACC.temperature.obs,h)*(8-10));
}
// B  Niederschlag
for (const [lead,src,fam,mm] of [[3,'mosmix','mosmix',5],[24,'mosmix','mosmix',5],[48,'mosmix','mosmix',10]]) {
  const d = fuseHour([mk({source:src,family:fam,precipitation:mm,sourceElevation:300})],lead,ctx()).precipitation.dist;
  console.log(lead, cdfOf(d,0), quantileOf(d,.5), quantileOf(d,.9), meanOf(d));
}
// C  MOSMIX-Amplitude       D  clima:null           E  Td ohne Lapse
// F  Tobit-Varianz          G  Wolken-Gate          H  Punktpaar-Korrelation
// I  GFS am Gipfel          J  Wind-Prior           L  Böe q10
```

Vollständige Ausgabe (2026-09-07):

```
A  h=2: mit Obs 10.58 | ohne Obs 12.00 | Anomaliepersistenz wäre 9.85 | Obs-Anomalie im Code −3.90
   h=5: mit Obs 14.99 | ohne Obs 15.96 | Anomaliepersistenz wäre 12.17 | Obs-Anomalie im Code −6.57
B  lead 1h radolan 5 mm/h  -> pDry 0.014 q50 2.32 q90 5.67 mean 2.85
   lead 3h mosmix 5 mm/h   -> pDry 0.139 q50 1.15 q90 4.31 mean 1.79
   lead 6h arome 5 mm/h    -> pDry 0.276 q50 0.58 q90 3.28 mean 1.23
   lead 24h mosmix 5 mm/h  -> pDry 0.406 q50 0.22 q90 2.57 mean 0.90
   lead 48h mosmix 10 mm/h -> pDry 0.488 q50 0.03 q90 2.29 mean 0.77
   lead 6h MOSMIX+AROME 5  -> pDry 0.114 q50 1.36 q90 4.90 mean 2.08
C  +8 K -> h=72 +7.21 · h=120 +6.45 · h=168 +5.56 · h=240 +1.05
D  clima=null, MOSMIX 25 °C: h=120 21.70 · h=200 18.50 · h=240 10.22 (climatologyOnly=false)
E  Td_fused 6.77 (Lapse: 5.85), RH 86.6 % (konsistent 81.3 %)
F  σ_code 0.6749 vs exakt 0.9039 (Faktor 0.747)
G  80 % Gesamt -> 61.4 % strahlungswirksam -> Kaltluftsee 0.034; 85 % -> 0
H  gegenüberliegend 10 km/10 km: 0.889 · 1 km/21 km: 0.716
I  Gipfel 2000 m, GFS 5 °C: h=250 0.87 °C (Erwartung −1.22)
J  300 m Ebene: Median 4.33 m/s · 800 m: 5.27 · 2500 m+TPI 800: 12.25
K  DE h=12: contributors mosmix, äquivalente Quellen 1.00
L  Wind q10 5.77 · Böe q10 5.11
```
