# Niederschlag in 5-Minuten-Schritten hinter dem Radar — Phase RUC (Diagnose und Plan, 23.10.2026)

> Stand 23.10.2026, ≈ 04:30–05:20 UTC. **Diagnose und Plan, noch kein Code.** Auftrag (Jan, 23.10. früh): „könntest du das neue
> buscosun Fusion 13 auch nach dem Radar noch minutengenau machen, aktuell ist es stündlich" — präzisiert: beim Niederschlag
> reicht ihm eine Viertelstunde, es geht darum, **Beginn und Ende des Regens auch jenseits des Radars genauer zu sagen**;
> buscosun-data darf dafür verändert werden; zusätzlich prüfen, ob andere Größen (KONRAD usw.) höher aufgelöst verfügbar sind.
> Jans Go vom 23.10. galt dem Entwurf „Viertelstunden aus ICON-D2". Die Messung am DWD-Verzeichnis (§3) hat eine bessere Quelle
> gefunden: **ICON-D2-RUC, 5-min-Schritte, stündlich neu, +27 h**. Der Plan baut darauf (E-RUC-1, Empfehlung) — nichts davon
> ist live, bevor Jan die Workflow-Vorlage ins Daten-Repo kopiert (§6 T4, `MANUELLE-SCHRITTE.md` §74).
> Belege: Verzeichnislistings und HEAD-Abrufe von `opendata.dwd.de`, GeoSphere-Metadaten, MeteoSchweiz-STAC (Befehle in §9).

## 0. Kurzfassung für Jan

> **Stand 23.10.2026 abends:** Jans Go für ICON-D2-RUC mit 5 Minuten (E-RUC-1/2). T1–T9 gebaut und verifiziert (`verify:ruc` 100/100,
> typecheck, Build), frischer Review mit zwei kritischen und vier wichtigen Befunden — alle behoben (§7a). Alles **uncommitted** und
> **nichts live**: das Produkt entsteht erst mit dem Workflow im Daten-Repo (§74), der Client zeigt die Form nur hinter `?ruc=1`. Der
> Messlauf T9 folgt nach ≥ 14 Tagen Schatten (Regel eingefroren, Hash `4e660c231a709c8a`). Umsetzungsstand in §6, Belege in §7.
>
> **Nachtrag 23.10. abends (Jan: „komplett aktiv schalten"):** E-RUC-7 gedreht, die Form ist **voreingestellt an**, `?ruc=0` ist der
> benannte Rückfall (Code, Verifier, Doku umgestellt, Build grün). Commit in `buscosun-web`, Commit/Push von `ruc.yml` ins Daten-Repo
> und Push von `main` hat der Berechtigungs-Klassifizierer der Sitzung verweigert („Production Deploy"); sie stehen als Befehle in §74.
> Die Spannen ±15/30/45 min bleiben GESETZT, bis T9 sie misst (die Stationsreihen laufen ab dem ersten Workflow-Lauf mit). Der Push
> von `main` trägt 40 fremde Commits (Fusion 13, Start-Kacheln, Atmo, Brand, Glacier, Seewetter).

1. **Hinter dem Radar gibt es echte 5-Minuten-Daten — nicht von ICON-D2, sondern von ICON-D2-RUC.** Auf dem neuen DWD-Pfad
   `/weather/nwp/v1/m/icon-d2-ruc/` liegt der Rapid Update Cycle: **stündliche Läufe**, Niederschlag `TOT_PREC` in **5-min-Schritten
   bis +27 h** (325 Dateien je Lauf), erste Datei **30 min** nach dem Lauf, letzte (+27 h) **41 min** danach (zwei Läufe gemessen).
   Dazu **ICON-D2-RUC-EPS** mit 20 Membern in denselben 5-min-Schritten (für eine GEMESSENE Spanne, spätere Phase).
2. **ICON-D2 selbst liefert auf dem neuen Pfad Viertelstunden** (193 Schritte bis +48 h) für 29 Größen — Niederschlag in allen
   Spielarten, Schneefallgrenze, Nullgradhöhe, Reflektivität, CAPE/CIN/LPI, Strahlung. Temperatur, Taupunkt, Wind, Böe und
   Bewölkung bleiben **stündlich** (bei ICON-D2 und beim RUC). Auf dem alten Pfad (`regular-lat-lon`) gibt es nur Stunden.
3. **Andere Größen höher aufgelöst:** AT über INCA (15 min, +3 h 15: T, Td, RH, Wind, Böe, Niederschlagsart), DE/CH nichts
   Flächiges unter einer Stunde für T/Wind/Böe/Wolken — nur die 10-min-Stationsmessungen (`obs/v1`). KONRAD3D (5 min) und das
   WN-Komposit (5 min) sind Radar-Nowcasts, keine Modellgrößen; KONRAD liegt schon im Spiegel. MeteoSchweiz
   `ogd-nowcasting` ist eine leere Hülle (Items ohne Assets).
4. **Der Plan:** ein neues Produkt `ruc/v1/` im Daten-Repo (stündlich, 5-min-Niederschlag je t1-Zelle als Chunk-PNG, 0–27 h), ein
   Leser am Punkt, und im Regenradar drei Schichten: Radar (0–2 h, 5 min) → RUC-Form (bis +27 h, 5 min) → Stundenbalken
   (bis 48 h). **Die Stundensumme bleibt exakt buscosun Fusion 13**, der RUC verteilt sie nur in der Stunde. Regenbeginn-Satz:
   „Regen wahrscheinlich ab etwa 17:15 (±30 min)" statt „17–18 Uhr". Spanne zunächst gesetzt, nach ≥ 14 Tagen Schattenbetrieb am
   10-min-Messsatz nachgemessen; erst dann voreingestellt an.
5. **Nebeneffekt:** erster Producer auf dem neuen DWD-Pfad (Dreiecksgitter, CCSDS), den wir bis zum 30.11. ohnehin brauchen.
   Der Gletscher-Leser (`scripts/glacier/lib/dwdNew.mjs`) und der App-Decoder (`src/sources/gribDecode.ts`) lesen ihn schon:
   542 040 Zellen in 77–94 ms je Datei (lokal gemessen).

## 1. Was es heute gibt (am Code geprüft)

| Baustein | Ort | Verhalten hinter dem Radar | Für RUC |
|---|---|---|---|
| **Minutenverlauf** (Kachel + Overlay 2/6/24/48 h) | `nowcast/minuteSeries.ts`, `MinuteSeriesCard.tsx`, `MinuteChart.tsx` | Radar-Bilder am Ort minütlich interpoliert bis zum letzten Bild (RV +2 h, INCA +3 h); danach **Stundenbalken** aus `nowcast.fusionHours` (Mittel der Stunde) mit Regenchance-Streifen; Hero nennt bei Fusion-Beginn nur „ab 17:00 · buscosun Fusion, stündlich" und bleibt aus der Kachel weg (`tile: false`). Kopfkommentar: „No minute is invented beyond the radar." | **Das ist, was Jan sieht.** Dritte Schicht zwischen Radar und Stundenbalken |
| **Regenbeginn als Spanne** (RB) | `nowcast/rainWindow.ts`, `RainWindowCard.tsx` | Radar: Minute ± Tempo-Unsicherheit (E-RB-5); danach `fusionOnset`/`fusionEnd` auf **vollen Stunden** aus P(nass) je Stunde (Kern 50 %, Rand 30 %, trocken < 20 %); Sätze „Regen wahrscheinlich heute 17–19 Uhr", „Beginn unsicher, zwischen …" | Neue Regel `ruc` zwischen Radar und Stunden |
| **Engine-Serie 0–6 h** | `nowcast/nowcastEngine.ts` `assembleNowcast`, `interpNwp` | 15-min-Schritte; Radar ≤ 90 min, Überblendung 90–150 min, danach `interpNwp` = **lineare Interpolation der Stundenwerte** (eine Treppe ohne Form); Hero (`nowcastView.ts heroState`), Ereignisse 0–6 h, Trockenfenster hängen daran | `rucAt` ersetzt `interpNwp` für mm/h, wo der RUC trägt |
| **Ereignisse** (ED) | `nowcast/eventDetail.ts`, `EventsTile.tsx` | 0–6 h aus der Engine-Serie, 6–48 h aus Stunden („Hours only — no minute is invented beyond the radar") | Lauf-Beginn/-Ende ≤ 27 h aus den 5-min-Punkten |
| **Nowcast-Abruf** | `nowcastEngine.ts buildNowcast` | Radar-Sampler + buscosun Fusion (Cube-Pfad, 49 h mit `mv`), `fusionPWetOf` (1 − pDry je Stunde) | RUC-Leser parallel dazu |
| **Punkt-Cube** | `point/cubeFormat.ts` | Stufe t1 0,05° (201 × 241 = 48 441 Zellen), stündlich 0–48 h, `CHUNK_CELLS` 16 ⇒ 13 × 16 = 208 Chunks; Domäne 45,5–55,5° N / 5,5–17,5° E | Gitter und Chunk-Raster des neuen Produkts |
| **Daten-Repo-Leser** | `point/client/store.ts` (`httpStore`, `fallbackStore`, `withRawFallback`), `nowcastPoint.ts` (PNG-Dekoder injiziert, Node `png.mjs` / Browser `browserPng.ts`) | jsDelivr `@main` + raw-Hedge; mutable Manifeste raw zuerst (`obs/v1`, `precipsum/v1`) | Dasselbe Muster |
| **Kleine Produkt-Workflows** | `scripts/precipsum/workflow-precipsum.yml`, `precipsum-publish.mjs` | eigener Pfad, eigener Workflow, Publisher: fetch → `checkout -B main FETCH_HEAD` → nur den eigenen Pfad committen → push ohne Force, ≤ 6 Versuche; Kill-Schalter als Repo-Variable | Vorlage für `ruc.yml` |
| **Neuer DWD-Pfad** | `scripts/glacier/lib/dwdNew.mjs` (`fieldUrl`, `getField`, `newestRun`, `cellCoords`), `src/sources/gribDecode.ts` (CCSDS, `unstructured`) | liest `v1/m/<modell>/p/<PARAM>/r/<ISO-Lauf>/s/PT<HHH>H<MM>M.grib2`, CLAT/CLON je Lauf | wiederverwenden, kein zweiter Decoder |
| **Cube-Adapter Dreiecksgitter** | `scripts/point/adapters/sample.mjs` `buildUnstructuredIndex` / `sampleUnstructuredToTier` | **nächste Zelle** je Zielzelle (für ICON global 13 km auf 0,25° richtig) | für RUC 2,2 km auf 0,05° falsch (V-RUC-5) ⇒ Blockmittel |

Die Stundenauflösung kommt also aus drei Stellen: der Cube-Achse (stündlich), der Engine-Interpolation und den Wortregeln
des Regenbeginns. Keine davon kennt eine Quelle unter einer Stunde jenseits der Radar-Extrapolation.

## 2. Was Jan will

Beginn und Ende des Regens in der Zukunft so genau nennen, wie Daten es hergeben — als Uhrzeit mit Spanne, nicht als volle
Stunde. Niederschlag genügt; eine Viertelstunde reicht ihm; 5 Minuten sind recht, wenn sie echt sind. Ehrlichkeit bleibt
Produktprinzip: die Minute eines Modells ist keine Messung, die Spanne gehört dazu, die Herkunft steht am Wert.

## 3. Quellenlage — GEMESSEN am 23.10.2026 (nicht aus Doku)

### 3.1 DWD, neuer Pfad `/weather/nwp/v1/m/` (der einzige nach dem 30.11.)

Modelle im Verzeichnis: `aicon icon icon-art icon-art-eps icon-art-eu icon-art-eu-eps icon-d2 icon-d2-eps icon-d2-ruc
icon-d2-ruc-eps icon-eps icon-eu icon-eu-eps`.

| Modell | Läufe | Niederschlag `TOT_PREC` | andere Größen | Bereitstellung | Datei |
|---|---|---|---|---|---|
| **ICON-D2** (`icon-d2`) | 8/Tag (3 h) | **193 Schritte = 15 min, 0–48 h** | 15 min: `RAIN_GSP RAIN_CON SNOW_GSP SNOW_CON GRAU_GSP PRR_GSP PRS_GSP PRG_GSP SNOWLMT HZEROCL DBZ_CMAX DBZ_850 CAPE_ML CIN_ML LPI SDI_2 HBAS_SC HTOP_SC ASWDIR_S ASWDIFD_S SYNMSG_BT_CL_IR10.8 SYNMSG_BT_CL_WV6.2 TQC TQG TQI TQR TQS TQV` (29); **stündlich** (49): `T_2M TD_2M U_10M V_10M VMAX_10M CLCT CLCL CLCM CLCH RELHUM_2M …`; `WW` 96 (stündlich ab +1) | Lauf 00z: `PT006H00M` 00:46:57, `PT012H00M` 00:49:55, `PT024H00M` 00:54:55, `PT048H00M` 01:05:56 UTC (Lauf + 1,1 h) | `PT000H15M` 228 132 B |
| **ICON-D2-EPS** (`icon-d2-eps`) | 8/Tag | `e/01…20/s/`: 193 Schritte = 15 min, 0–48 h, **20 Member** | wie ICON-D2 | nicht gemessen | — |
| **ICON-D2-RUC** (`icon-d2-ruc`) | **24/Tag (stündlich)**, 24 Läufe gelistet | **325 Schritte = 5 min, 0–27 h** (Läufe 22.10. 12z und 23.10. 02z gleich) | 15 min (109): `PRR_GSP PRS_GSP PRG_GSP PRH_GSP PREC_GSP SNOWLMT HZEROCL DBZ_CMAX DBZ_850 CAPE_ML CAPE_MU CIN_ML LPI SDI_2 …`; **stündlich** (28): `T_2M TD_2M U_10M V_10M VMAX_10M CLCT CLC* RELHUM_2M PMSL VIS H_SNOW …`; `WW` 27 (ab +2 h); Hagel-Felder `HAIL_GSP DEMAX_HAIL_S KE_HAIL_S`; `CLAT`/`CLON` je Lauf | **Lauf 02z: erste Datei (`PT000H05M`) 02:30:49, letzte (`PT027H00M`) 02:41:38 UTC; Lauf 22.10. 12z: 12:30:22 → 12:40:56** ⇒ Lauf + 30…41 min | 396–705 KB je Schritt |
| **ICON-D2-RUC-EPS** (`icon-d2-ruc-eps`) | stündlich | `e/01…20/s/`: **325 Schritte = 5 min, 0–27 h, 20 Member** | Teilmenge des RUC | Lauf 03z: `e/01/s/PT001H00M` 03:30:39 UTC | 412 916 B |
| ICON-EU (`icon-eu`) | 4/Tag | 93 Schritte (stündlich, dann 3-stündlich) bis +120 h, **keine Unterstunde** | — | 00z: +120 h um 03:09 UTC | — |

Alter Pfad `icon-d2/grib/00/tot_prec/` (`regular-lat-lon`): **nur 000…048 stündlich** (98 Einträge = 49 × Link + Text). Die
Viertelstunden gibt es ausschließlich auf dem neuen Pfad im Dreiecksgitter (542 040 Zellen, CCSDS). Decoder-Messung lokal
(`src/sources/gribDecode.ts`, zwei RUC-Dateien 02z): 542 040 Werte in **94 ms bzw. 77 ms**; `unstructured: true`; 16 968 Zellen
`NaN` (3,1 %, Bitmap — ob innerhalb DACH, prüft T2); +1 h-Summe max. 7,58 mm, 262 697 Zellen > 0.

### 3.2 DWD-Radarprodukte

`weather/radar/`: `composite/ {dmax hg hx hymecng pg rs rv vii wn} konrad3d/ mesocyclones/ radolan/ radvor/ sites/`.
`radvor/re/` und `radvor/rq/` sind **leer** (nur `../`); `composite/hg/` und `pg/` leer. `composite/wn/` trägt 5-min-Tars
(`composite_wn_20261023_0455.tar`) — ein Reflektivitäts-Nowcast, in dieser Diagnose nicht ausgewertet (V-RUC-7). KONRAD3D
(5 min, Zellobjekte) liest der Radar-Spiegel bereits (`scripts/radar-mirror`, Zelltürme/Zell-Orte). Keine Modellgröße ist
davon betroffen: Radar-Nowcasts sagen Niederschlag und Zellen, nicht Temperatur oder Wind.

### 3.3 GeoSphere (AT)

`/grid/forecast/nowcast-v1-15min-1km`: Frequenz **15 min**, `forecast_length` 13 (= 3 h 15), Parameter **`dd ff fx pt rh2m rr
t2m td`** (Windrichtung, Wind, Böe, Niederschlagsart, Feuchte, Niederschlag, Temperatur, Taupunkt), `last_forecast_reftime`
04:30 UTC. Das ist die einzige flächige Unterstunden-Quelle für T/Wind/Böe — nur AT, nur 3 h. INCA `rr` nutzt der Radar-Sampler
schon (0–3 h); die übrigen Größen liegen in der Nowcast-Spalte des Cubes nicht (V-RUC-3).

### 3.4 MeteoSchweiz (CH)

`ch.meteoschweiz.ogd-nowcasting` („Short-term forecast data – Grid data", temporal bis 23.10. 04:00 UTC): Items `20261021-ch`,
`20261022-ch`, `20261023-ch` — das heutige Item hat **0 Assets**; `src/sources/meteoSwissRadar.ts` vermerkt „aktuell NICHT als
Grid". `rzc` bleibt ein 5-min-Analysebild ohne Nowcast; ICON-CH1-EPS stündlich. CH bekommt hinter dem Radar also den RUC, dessen
Domäne (43,2–58,1° N, 3,9° W–20,3° E) die Schweiz trägt — ein deutsches Modell über der Schweiz, so benannt.

### 3.5 Bewertung gegen Jans Ziel

| Kandidat hinter dem Radar | Schritt | Aktualität | Horizont | Deckt | Preis | Urteil |
|---|---|---|---|---|---|---|
| Stundenwerte interpolieren (heute) | 60 min | 3 h | 48 h | DACH | 0 | keine Form, keine Minute |
| ICON-D2 `TOT_PREC` (neuer Pfad) | 15 min | 3 h (Lauf + 1,1 h) | 48 h | DACH | 96 Dateien à 230 KB je 3 h | gut, aber jeder RUC-Lauf ist jünger |
| **ICON-D2-RUC `TOT_PREC`** | **5 min** | **1 h (Lauf + 41 min)** | 27 h | DACH | 325 Dateien à ≈ 0,5 MB je Stunde (≈ 165 MB, Decode ≈ 30 s) | **Empfehlung** |
| ICON-D2-RUC-EPS (20 Member) | 5 min | 1 h | 27 h | DACH | 20 × 165 MB je Stunde | später: gemessene Spanne (E-RUC-6) |
| INCA `rr` | 15 min | 15 min | 3 h 15 | AT | schon da | bleibt im Radar-Teil |

Der RUC ist auf jeder Achse besser als ICON-D2: feiner, stündlich statt dreistündlich erneuert, und er ist das Modell, das
der DWD für genau diese Zeitspanne (SINFONY, nahtlos an das Radar) rechnet. 27 h statt 48 h kosten nichts, was Jan verlangt
(Regenbeginn-Fenster 24 h). Darüber bleiben die Stundenbalken.

**Grenze, die bleibt:** Ein 5-min-Schritt eines Modells bei 4 h Vorlauf ist eine Form, keine Messung. Deshalb (a) Spanne am
Satz, (b) Stundensumme bleibt buscosun Fusion 13 (abgenommen, Prüfstand), (c) Herkunft steht an jedem Abschnitt, (d) vor dem
Einschalten die Messung am 10-min-Messsatz (§6 T9).

## 4. Entwurf

### 4.1 Produkt `ruc/v1/` im Daten-Repo (E-RUC-8)

```
ruc/v1/latest.json                 mutabel (raw zuerst): { schema, run, runAtMs, builtAtMs, stepMin: 5, steps: 324,
                                   horizonH: 27, grid: { tier: 't1', ny: 201, nx: 241, chunk: 16 }, encoding: 'ruc-log-v1',
                                   source: { model: 'icon-d2-ruc', param: 'TOT_PREC', base: '…/v1/m/icon-d2-ruc' },
                                   stats: { cells, missing, wet, maxMmH, minPosDeltaMm }, timing: { fetchMs, decodeMs, sampleMs, totalMs }, chunks }
ruc/v1/<run>/run.json              dasselbe Manifest, unveränderlich (Lauf = YYYYMMDDHH UTC)
ruc/v1/<run>/<cy>_<cx>.png         Graustufen 8 bit, Breite 256 = 16 × 16 Zellen (Spalte p = (iy mod 16)·16 + (ix mod 16)),
                                   Höhe 324 = Intervalle (Zeile k = (runAt + 5k min, runAt + 5(k+1) min]), Wert = mittlere
                                   Rate mm/h des Intervalls = Δ TOT_PREC × 12
ruc/v1/stations/<run>-<katalog>.png dieselbe Kodierung an den Messstationen mit Regen (`obs/v1/stations.json`, `vars` ∋ rr;
                                   `<katalog>` = Hash der id-Liste, `stations/catalog-<katalog>.json` nennt Spalte j = id j):
                                   Breite = Stationen, Höhe 144 (0–12 h) — nur für die Messung T9; Vorhalt 21 Tage
```

Kodierung (`src/point/rucFormat.ts`): Byte 0 = **kein Wert** (Bitmap/fehlende Datei), 1 = **0 mm/h**, 2…255 = `precipLogCode(x)`
(Log-Skala der Kartenfelder, `fieldFormat.ts`, eins zu eins: Code 1 ist auch dort die Null; x₀ 0,1 mm/h, x_max 100 mm/h, ±1,4 % relativ;
255 = 100 mm/h, Sättigung ab 98,75 mm/h, gezählt). Die zuerst geplante Form `1 + precipLogCode(x)` hätte Byte 2 als zweite Null
getragen und bei 255 übergelaufen — Verifier A3/A6 fanden es (T1).
Rauschschwelle: Δ < 0,001 mm je 5 min ⇒ 0 (gesetzt; T2 misst das kleinste positive Δ und trägt es ins Manifest). Raster und
Chunk-Nummern sind die von Stufe t1 (`cellOf`, `CHUNK_CELLS`), damit Leser und Verifier dieselben Funktionen nehmen.
Größe: 208 PNG × 82 944 B roh = 17,3 MB roh je Lauf; komprimiert gemessen in T2 (trockene Zellen sind Nullen). Vorhalt 3 Läufe.
Außerhalb `point/`, damit Cube-Publisher und `prune.mjs` das Produkt nie anfassen.

Abtastung Dreiecksgitter → t1: **Blockmittel** aller RUC-Zellen, deren Mittelpunkt in die 0,05°-Zelle fällt (2,2 km auf
≈ 3,5 × 5,5 km ⇒ gemessen 1–7 Zellen, Ø 4,4; 215 257 RUC-Zellen in der Domäne, 213 290 Treffer, keine t1-Zelle ohne Treffer — T2); Zielzellen ohne Treffer bekommen den nächsten Nachbarn (`fillNearest`, wie `sample.mjs`).
Index einmal je Lauf aus `CLAT`/`CLON` (Gitter ändert sich nicht; der Index wird nach Gitter-Signatur gecacht).

### 4.2 Workflow `ruc.yml` (Vorlage `scripts/ruc/workflow-ruc.yml`, Kopie = Jans Gate)

Cron **`52 * * * *`** (RUC-Lauf H ist um H:41 vollständig, gemessen an zwei Läufen; der Producer nimmt den jüngsten Lauf, dessen
`PT027H00M` per HEAD da ist, sonst H − 1 — der ist dann schon gebaut ⇒ Ende ohne Schreiben), `timeout-minutes` 12, Concurrency-Gruppe
`ruc`, Kill-Schalter `vars.RUC_KILL`. Die zuerst vorgesehene Minute :47 war belegt (`workflow-glacier-archiv.yml`); :52 ist gegen alle
20 Vorlagen unter `scripts/**/workflow-*.yml` gezählt frei (Verifier D2: belegt sind 3,4,7,10,12,17,19,20,23,24,25,30,34,35,40,41,42,
43,44,47,49,50,55,57) und liegt 22 bzw. 28 min von den Force-Push-Fenstern der Kartenlinie (:30 von 2/5/8/…, :20 von 0/3/6/…; D3).
Push-Kollisionen mit `stations-s` (:50) fängt der Publisher mit frischer Basis und Wiederholung. Stationskatalog per GET von
`raw.githubusercontent` (Cone-Sparse kann keine Einzeldatei); fehlt er, läuft der Bau ohne Stationsreihen.

### 4.3 Leser am Punkt (`src/point/client/rucPoint.ts`)

`loadRucPoint(store, lat, lon, nowMs, decodeGray)`: `latest.json` raw zuerst (`fallbackStore(raw, jsDelivr)`), Chunk unter
`@main` (Pfad trägt den Lauf ⇒ unveränderlich), **eine** Spalte lesen (nächste t1-Zelle, ein Abruf; der 2 × 2-Block des Cubes
wäre bis zu vier Chunks — V-RUC-8). Ergebnis `RucPointSeries { run, runAtMs, builtAtMs, ageMin, stepMin, points: { fromMs, toMs,
mmH | null }[] }`; `null` ohne Produkt, bei fremdem Schema oder Alter > 3 h (dann wie heute).

### 4.4 Anpassung an buscosun Fusion 13 (`src/nowcast/rucSeries.ts`, rein)

Je Stunde (t − 1 h, t] mit Fusion-Wert f (Stundenmittel aus `fusionHours`) und zwölf RUC-Intervallen mit Mittel r:
- f ≤ 0 ⇒ alle zwölf 0 (die Fusion sagt trocken);
- r ≤ 0 < f ⇒ zwölf gleiche Werte f, Stunde **`flat`** (keine Form bekannt);
- sonst Faktor f/r; liegt er über **4**, wird die Form mit 4 skaliert und der Rest **flach** verteilt (Stunde `mixed`).
In jedem Fall gilt Σ(12 Werte)/12 = f exakt. Fehlt ein Intervall (Byte 0) ⇒ die Stunde trägt keine RUC-Punkte (Stundenbalken wie
heute). Kappe 4 gesetzt (E-RUC-4); V-RUC-9 misst, wie oft sie greift.

### 4.5 Darstellung im Regenradar (E-RUC-5)

- **Minutenverlauf:** dritte Schicht `ruc` zwischen `radar` und `hours`: 5-min-Stufen ab der Radar-Naht bis min(Lauf + 27 h, 48 h);
  `hours` nur dahinter. Naht-Beschriftung „Radar · minutengenau bis 14:05 · ab hier 5-min-Form ICON-D2-RUC, Stundensumme buscosun
  Fusion ▸", flache Stunden schraffiert mit Tooltip „Stunde ohne Form (RUC trocken)". Hero: `tile: true` für einen RUC-Beginn
  („in 2 Std 35", „Regen ab 17:15 · 5-min-Form ICON-D2-RUC"). Fußzeile und KPI-Zeilen nennen die drei Quellen.
- **Regenbeginn-Fenster:** Regel `ruc` zwischen Radar und Stunden: Beginn = erstes 5-min-Intervall ≥ 0,1 mm/h in einer Stunde mit
  P(nass) ≥ 30 % (Kern ≥ 50 %), die **nicht `flat`** ist; Fenster = Beginn ∓ Δ, Δ = 15 min (Vorlauf ≤ 3 h), 30 min (≤ 12 h),
  45 min (> 12 h), auf 5 min gerundet (gesetzt, E-RUC-6). Satz „Regen wahrscheinlich ab etwa 17:15 (±30 min)" / „Regen möglich
  ab etwa 17:15"; Ende: erstes trockenes 30-min-Fenster (sechs Intervalle < 0,1) in einer Stunde mit P < 50 %: „Regen hört
  voraussichtlich gegen 18:45 auf (±30 min)". Sicherheit wie heute aus P(nass) der Stunde. Flache Stunde ⇒ Stundensatz wie heute.
  `RainWindow.source` bekommt `'ruc'`, `sourceLabel` „buscosun Fusion · 5 min (ICON-D2-RUC)".
- **Engine-Serie 0–6 h:** `assembleNowcast` nimmt `rucAt(etaMs)` statt `interpNwp(...).mmH` für den Modellteil und die Modellseite
  der Überblendung, wo der RUC trägt; Hero, Trockenfenster, Ereignisse 0–6 h folgen damit automatisch.
- **Ereignisse 6–48 h:** Lauf-Beginn/-Ende ≤ 27 h aus den 5-min-Punkten (`precision: 'min'`), Stunde nur, wo der RUC nicht trägt.
- Panel, Dashboard, Routen, Autobahn, Seewetter: **unverändert** (eigene Phase, V-RUC-10).

### 4.6 Schalter und Rückfall (E-RUC-7)

~~`?ruc=1` schaltet ein (Schattenphase), `?ruc=0`/fehlend = alles wie heute.~~ **Seit 23.10. abends (Jan): an, `?ruc=0` = Rückfall** (alles wie vor RUC). `?rucbase=<http(s)-Origin>` liest das Produkt von einer
anderen Basis (lokaler Nachbau vor dem ersten Workflow-Lauf, §74 Schritt 5; nur http(s), sonst ignoriert). Nach der Messung (T9) und Jans Freigabe wird die
Voreinstellung gedreht (`?ruc=0` = Rückfall). Producer: `RUC_KILL=1` (Repo-Variable) hält den Workflow an; der Client zeigt
ab 3 h Alter die Stundenbalken wie heute. Kein Eingriff in buscosun Fusion, keine neue Nummer (die Stundenwerte bleiben).

## 5. Entscheidungen (Jan; Empfehlung jeweils fett)

| Nr. | Frage | Empfehlung / Stand |
|---|---|---|
| E-RUC-1 | Quelle hinter dem Radar | **ICON-D2-RUC `TOT_PREC`, 5 min, +27 h, stündlich** (statt ICON-D2 15 min). Jans Go vom 23.10. galt „Viertelstunden ICON-D2"; die Messung §3 fand den RUC. Bestätigung erbeten — der Bau läuft auf der Empfehlung, live wird nichts ohne T4 |
| E-RUC-2 | Schritt | **5 min nativ, keine Glättung auf 1 min**, Anzeige als 5-min-Stufen |
| E-RUC-3 | Horizont | **27 h** (= RUC); 27–48 h Stundenbalken wie heute |
| E-RUC-4 | Verhältnis zu buscosun Fusion 13 | **Stundensumme = Fusion 13, RUC nur die Form in der Stunde**; Kappe ×4, Rest flach, `flat`/`mixed` gekennzeichnet; keine neue Fusion-Nummer |
| E-RUC-5 | Ort | **Regenradar** (Minutenverlauf, Regenbeginn, Engine-Serie/Hero, Ereignisse); Panel/Dashboard eigene Phase |
| E-RUC-6 | Spanne | **gesetzt 15/30/45 min nach Vorlauf**, nach ≥ 14 Tagen am 10-min-Messsatz nachgemessen (T9); RUC-EPS (20 Member) als gemessene Spanne = spätere Phase |
| E-RUC-7 | Einschalten | ~~hinter `?ruc=1`; nach T9 und Freigabe voreingestellt an~~ **Jan 23.10. abends: sofort an, `?ruc=0` = Rückfall; T9 misst die gesetzten Spannen nachträglich** |
| E-RUC-8 | Ablage und Takt | **`ruc/v1/` außerhalb `point/`**, 3 Läufe + Stationsreihen 21 Tage; eigener Workflow `52 * * * *` (:47 war belegt, §4.2); Kopie der Vorlage und Repo-Variable = Jans Gate (§74) |
| E-RUC-9 | RUC als Member von buscosun Fusion (Fusion 14) | **nicht in dieser Phase** — Befund V-RUC-11, Prüfstand-Frage |

## 6. Umsetzungsplan

Konventionen: kein Test-Framework — ein Verifier `scripts/verify-ruc.mjs` (`npm run verify:ruc`) wächst Abschnitt für Abschnitt (A…G),
jede Zahl kommt aus echten Daten (Fixture aus einem realen RUC-Lauf) oder wird gezählt. Vor jedem Gate `npm run typecheck`,
bei `src/`-Änderungen `npm run build` + `npm run budget`. Commits sind Jans Auftrag (CLAUDE.md) — je Task steht die vorgesehene
Commit-Zeile, committet wird auf Zuruf. Aufrufe immer `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs …`,
PowerShell, nie `2>&1`.

### T1 — Vertrag `src/point/rucFormat.ts` + Verifier A

**Dateien:** neu `src/point/rucFormat.ts`; neu `scripts/verify-ruc.mjs`; `package.json` Skript `verify:ruc`.
**Liefert:** `RUC_SCHEMA = 1`, `RUC_DIR = 'ruc/v1'`, `RUC_STEP_MIN = 5`, `RUC_HORIZON_H = 27`, `RUC_STEPS = 324`, `RUC_KEEP_RUNS = 3`,
`RUC_STATIONS_KEEP_DAYS = 21`, `RUC_STALE_MS = 3 h`, `RUC_DRY_MM = 0.001`, `RUC_CAP_FACTOR = 4`, `RUC_MODEL = 'icon-d2-ruc'`,
`RUC_PARAM = 'TOT_PREC'`, `RUC_LABEL = 'ICON-D2-RUC'`; `rucRunStamp(ms): string` (YYYYMMDDHH), `rucRunMs(stamp)`, `rucRunDir(run)`,
`rucChunkFile(cy, cx)`, `rucChunkOf(iy, ix): { cy, cx, column }`, `rucPixelOffset(column, step, width)`, `encodeRucByte(mmH: number |
null): number`, `decodeRucByte(b: number): number | null`, `RucManifest` (Felder aus §4.1), `makeRucManifest(p)`, `parseRucManifest(j):
RucManifest | null`, `rucIntervalMs(runAtMs, k): { fromMs, toMs }`.
**Verifier A:** Byte-Umkehr auf allen 256 Codes (0 → null, 1 → 0, 2…255 → Wert, Umkehr-Fehler ≤ 1,4 %), Sättigung bei 96 mm/h = 255,
Spalten-/Chunk-Zuordnung gegen `cellOf`/`CHUNK_CELLS` an 1 000 Zufallspunkten in der Domäne, Lauf-Stempel ↔ ms, Manifest-Parse mit
Gegenprobe (falsches Schema ⇒ null).
**Commit:** `feat(ruc): contract of the 5-min precipitation product ruc/v1`.

### T2 — Producer `scripts/ruc/ruc-build.mjs` (+ Blockmittel-Index) + Verifier B

**Dateien:** neu `scripts/ruc/ruc-build.mjs`, `scripts/ruc/lib/blockIndex.mjs` (rein: `buildBlockMeanIndex(cellLat, cellLon, tier)` →
`{ offsets: Int32Array, cells: Int32Array }` CSR-Form, `sampleBlockMean(values, idx, tier)` → `Float32Array` mit `fillNearest`),
`scripts/ruc/lib/dwdRuc.mjs` (dünn über `scripts/glacier/lib/dwdNew.mjs`: `newestCompleteRun()` per HEAD auf `PT027H00M`, `fetchSteps(run,
[0…324], concurrency 8)`); Fixture `scripts/lib/fixtures/ruc/` = `PT001H00M` und `PT001H05M` des Laufs 23.10. 02z (je ≈ 400 KB, echte
Form) + `clat-clon-dach.json.gz` (die RUC-Zellen in der Domäne).
**Ablauf:** Lauf wählen → CLAT/CLON → Index (Cache je Gitter-Signatur `n:first:last`) → 325 Felder laden und dekodieren (Pool 8) →
je Intervall Δ = acc[k+1] − acc[k] je RUC-Zelle, dann Blockmittel auf t1, `< RUC_DRY_MM ⇒ 0`, `NaN ⇒ Byte 0` → 208 PNG (`encodePng`,
1 Kanal) in `<store>/.build/<run>/` → `run.json` → Umbenennen nach `<store>/<run>/` → `latest.json` zuletzt → Vorhalt beschneiden
(3 Läufe, Stationsreihen 21 Tage) → Stationsreihen `stations/<run>.png` aus `obs/v1/stations.json` (Pfad `--obs=`, optional).
Letzte Zeile JSON `{ changed, run, chunks, bytes, timing }`. `--run=`, `--steps=0-24` (Test), `--store=`, `--cache=`.
**Messen (ins Manifest, gezählt):** kleinste positive Δ, Anteil `NaN`-Zellen innerhalb DACH, Byte-Größe aller PNG, Laufzeit je Phase.
**Verifier B (netzfrei, Fixture):** Δ zweier echter Felder ≥ 0 nach Kappung, Blockmittel = Mittel der Zellen im Block (Gegenprobe
brute force an 50 Zellen), Zelle ohne Treffer gefüllt, Encode/Decode-Rundlauf einer echten Spalte, Manifest trägt Schema/Lauf/Statistik,
Byte 0 nur dort, wo das Feld `NaN` hat.
**Lokaler Probelauf (Beleg):** `--steps=0-24` gegen das Netz, Laufzeit und Bytes ins Audit (§7).
**Commit:** `feat(ruc): producer — ICON-D2-RUC 5-min precipitation on the t1 grid as chunk PNGs`.

### T3 — Publisher `scripts/ruc/ruc-publish.mjs` + Verifier C

Nach dem Muster von `precipsum-publish.mjs` (frische Basis je Versuch, nur `ruc/`, kein Force, ≤ 6 Versuche); danach CDN: Purge
`ruc/v1/latest.json` und Warm der neuen Chunks mit den Funktionen aus `scripts/point/cdnSync.mjs` (`syncCdn`, Budget 60 s, nie fatal).
**Verifier C:** mit injiziertem `git` (Attrappe) — Pfade außerhalb `ruc/` werfen, leerer Diff ⇒ `unchanged`, Wiederholung nach
abgewiesenem Push, Purge-Liste = genau `latest.json` + neue Dateien.
**Commit:** `feat(ruc): publisher for ruc/v1 (fresh base, own path, CDN purge)`.

### T4 — Workflow-Vorlage `scripts/ruc/workflow-ruc.yml` + Verifier D + `MANUELLE-SCHRITTE.md` §74

Inhalt nach §4.2; Schritte wie `precipsum`: Node 22, Producer sparse (`scripts src package.json`), Daten-Repo sparse (`ruc`, `obs/v1/stations.json`),
Build in `store`, Publish. **Verifier D:** Cron-Minute ≠ jeder Minute einer Cron-Zeile in `scripts/**/workflow-*.yml` und ≥ 15 min Abstand
zu den Force-Push-Fenstern der Kartenlinie (`workflow-build.yml`), `timeout-minutes` ≥ 10, Kill-Variable vorhanden, Sparse-Muster
decken alle gelesenen Pfade. §74 beschreibt Kopie, Variable `RUC_KILL`, Erstlauf per `workflow_dispatch`, Sichtprüfung.
**Commit:** `feat(ruc): workflow template and manual steps`.

### T5 — Leser `src/point/client/rucPoint.ts` + Verifier E

**Liefert:** `loadRucPoint(store: PointStore, lat, lon, nowMs, decodeGray: PngDecoder): Promise<RucPointSeries | null>`,
`rucStoreFrom(opts)` (raw zuerst für `latest.json`, `@main` für Chunks, Hedge wie `withRawFallback`). **Verifier E:** `memoryStore` mit
einem echten Chunk aus dem Probelauf (T2): Spalte der Zelle = Byte-Reihe, Zeiten = `rucIntervalMs`, Alter > 3 h ⇒ null, fehlendes
Manifest ⇒ null, 404 des Chunks ⇒ null (ein Befund, kein Fehler), Punkt außerhalb der Domäne ⇒ null.
**Commit:** `feat(ruc): point reader of ruc/v1`.

### T6 — Anpassung `src/nowcast/rucSeries.ts` + Verifier F

**Liefert:** `fitRucToFusion(ruc: RucPointSeries, fusionHours: FusionHourValue[], nowMs): RucFitted` mit `points: { fromMs, toMs, mmH,
kind: 'form' | 'flat' | 'mixed' }[]`, `hours: { hourStartMs, factor, kind }[]`, `fromMs`, `toMs`; `rucAt(fitted, etaMs): number | null`;
`rucEnabledFrom(search)`. **Verifier F:** Stundensumme exakt f in allen drei Fällen (form/flat/mixed, 1 000 Zufallsstunden),
f = 0 ⇒ Nullen, fehlendes Intervall ⇒ Stunde ohne Punkte, Faktor-Kappe greift genau bei > 4, `rucAt` trifft das richtige Intervall
an den Rändern, Schalter.
**Commit:** `feat(ruc): fit the 5-min form to the hourly sums of buscosun Fusion`.

### T7 — Verdrahtung Regenradar + Verifier G

**Dateien:** `nowcastEngine.ts` (`buildNowcast`: Leser parallel, `nc.ruc`; `assembleNowcast`: optionales `rucAt`), `nowcastModel.ts`
(`Nowcast.ruc?`), `minuteSeries.ts` (Schicht `ruc`, `valueAt`, `firstWet`/`peak`/`sumMm` mit RUC), `MinuteChart.tsx`/`MinuteSeriesCard.tsx`
(Stufen, Naht-Texte, Hero `tile`, Fußzeile), `rainWindow.ts` (Regel `ruc`, `RB_RUC_SPAN_MIN = { 3: 15, 12: 30, 27: 45 }`, Sätze), `RainWindowCard.tsx`
(Quelle `ruc`), `eventDetail.ts` (Lauf-Zeiten ≤ 27 h). Texte hängen an Konstanten (`RUC_LABEL`), nicht an Stichworten.
**Verifier G:** ohne `ruc` byte-gleiche Ergebnisse von `buildMinuteSeries`, `computeRainWindow`, `assembleNowcast` (Gegenprobe gegen
die Fixtures von `verify-rain-window.mjs`); mit `ruc`: Beginn aus dem ersten nassen Intervall, Spanne nach Vorlauf, flache Stunde ⇒
Stundensatz, Ende nach 30 min trocken, Hero `tile: true`, Ereignis-Zeiten minutengenau ≤ 27 h, darüber Stunden. Bestehende Verifier
`verify:rain-window` grün.
**UI-Prüfung:** Chrome DevTools MCP Desktop 1440 × 900 und iPhone 12 Pro, `/regenradar?ruc=1` an einem nassen Ort (Belege §7).
**Commit:** `feat(regenradar): 5-min precipitation form from ICON-D2-RUC behind ?ruc=1`.

### T8 — Budget, Typecheck, Build, Doku

`npm run typecheck`, `npm run build`, `npm run budget` (Ratschen ggf. mit Notiz anheben, nie `--update`), CLAUDE.md-Zeile RUC,
QUELLENMATRIX §1 Zeile 0–3 h / 3–33 h um ICON-D2-RUC (5 min) ergänzen, `docs/DATA_SOURCES.md` kurzer Eintrag neuer DWD-Pfad.

### T9 — Messung nach ≥ 14 Tagen Schatten: `scripts/ruc/ruc-measure.mjs`

Eingabe `ruc/v1/stations/*.png` (Reihen je Lauf, 0–12 h) + `obs/v1` Tagesdateien (rr je 10 min). Je Station und Lauf: erster
10-min-Schritt mit rr ≥ 0,1 mm im Vorlauf 2–12 h (Wahrheit) gegen (a) Beginn aus der RUC-5-min-Reihe (auf 10 min), (b) Beginn aus
derselben Reihe auf Stunden gemittelt (Stundenblock, Beginn = Stundenanfang). Kennzahlen: MAE des Beginns, Trefferquote ±30 min,
Brier nass/trocken je 10 min, je Land und Vorlaufklasse. Regel vor dem Lauf eingefroren (Hash im Audit). Verdikt rechnet das Skript.
**Gate (Jan):** nur wenn (a) ≤ (b) in MAE und Trefferquote, wird E-RUC-7 gedreht; die gesetzte Spanne wird durch die gemessenen
Quantile (q25/q75 des Beginn-Fehlers je Vorlaufklasse) ersetzt.

**Umgesetzt 23.10. (vor den Daten):** `scripts/ruc/ruc-measure.mjs` mit `MEASURE_RULE` (Wahrheit rr ≥ 0,1 mm/10 min; Form (a) = erster
10-min-Stempel mit (r[k] + r[k+1])/12 ≥ 0,1 mm; Stundenblock (b) = erster Stempel der ersten Stunde mit Mittel ≥ 0,6 mm/h; Fenster
2–12 h; Beginn-Fall nur, wenn die Wahrheit am ersten Fensterstempel trocken ist; > 20 % Lücken ⇒ ungültig; Treffer ±30 min; Brier =
Fehlanteil je Stempel; Klassen ≤ 3 h / 3–12 h; Spanne = max(|q25|, |q75|) des Form-Fehlers, auf 5 min). Verdikt rechnet das Skript.
Aufruf nach der Schattenphase:
```
node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/ruc/ruc-measure.mjs --store=<Klon>/ruc/v1 --obs=C:/dev/buscosun-pruefstand/obs-dense --from=2026-10-24 --out=audit/niederschlag-ruc/t9-<datum>.json
```

### Umsetzungsstand (23.10.2026, alles uncommitted, nichts live)

| Task | Dateien | Verifier | Messung / Beleg |
|---|---|---|---|
| T1 | `src/point/rucFormat.ts`, `scripts/verify-ruc.mjs`, `package.json` (`verify:ruc`) | A 18 | Byte = `precipLogCode` eins zu eins (die geplante Form `1 + Code` hätte eine doppelte Null getragen und bei 255 übergelaufen — A3/A6 fanden es); Stationsblock mit Katalog-Hash |
| T2 | `scripts/ruc/ruc-build.mjs`, `scripts/ruc/lib/{blockIndex,rucEncode,dwdRuc}.mjs`, Fixtures `scripts/lib/fixtures/ruc/` (zwei echte Felder, Fenster der Zellen, Chunk + Manifest des Volllaufs) | B 10 | Probelauf 25 Intervalle 7,9 s; **Volllauf 2026102305: 68,6 s, 325 Dateien 187 MB (fetch 18 s, decode 44 s, sample 3 s, encode 2,4 s), 208 PNG = 5,36 MB, größter Chunk 56 KB, Stationsreihe 3 052 Stationen 210 KB, missing 0, max 137 mm/h, 12 gesättigte Zell-Intervalle, kleinstes Δ 0,001 mm**; 1–7 RUC-Zellen je t1-Zelle (Ø 4,4) |
| T3 | `scripts/ruc/ruc-publish.mjs` | C 9 | Git-Attrappe: frische Basis, nur `ruc/`, ≤ 6 Versuche; CDN-Plan Purge `latest.json` + Wärmen der neuen Dateien (`purgeUntilFresh`/`warmCdnFiles` aus `repackManifest.mjs`), nie fatal |
| T4 | `scripts/ruc/workflow-ruc.yml`, `MANUELLE-SCHRITTE.md` §74 | D 8 | Cron :52, Timeout 12, Gruppe `ruc`, `RUC_KILL`, Sparse-Muster, Katalog per GET |
| T5 | `src/point/client/rucPoint.ts` | E 9 | echter Chunk 02_13: 324 Punkte = Spalte 135, ein Manifest + ein Chunk, > 3 h ⇒ null, 404 ⇒ null |
| T6 | `src/nowcast/rucSeries.ts` | F 8 | 1 080 Zufallsstunden Summe exakt, Arten dry/flat/form/mixed, Kappe genau an 4, Schalter aus/an, `?rucbase=` |
| T7 | `nowcastModel.ts`, `nowcastEngine.ts`, `minuteSeries.ts`, `MinuteChart.tsx`, `MinuteSeriesCard.tsx`, `minuteSeries.css`, `rainWindow.ts`, `eventDetail.ts`, `EventsTile.tsx`, `NowcastDeck.tsx`, `NowcastRadarMap.tsx` | G 20 | ohne `ruc` byte-gleich (G1/G10/G14/G17b); UI-Belege unten |
| T8 | `budget.json` (totalJs 1 825 → 1 905 mit Notiz), CLAUDE.md-Zeile, QUELLENMATRIX ⚠⁸, `docs/DATA_SOURCES.md` | — | typecheck grün, Build 260/260, `verify:ruc` 100/100 (nach dem Review), `verify:rain-window` 62/64 (G2/G3 schon an HEAD rot, V-RUC-14) |
| T9 | `scripts/ruc/ruc-measure.mjs` | H 8 | Messregel **eingefroren** (Hash `4e660c231a709c8a` = sha256 des Regel-JSON; Skript sha256 `5e861be6ded187f7…`), Fall-Rechnung gegen Handrechnung, Dateilauf mit Katalog/Reihe/dense-day; der Lauf selbst folgt nach ≥ 14 Tagen Schatten (braucht das Produkt im Daten-Repo und die dense-day-Dateien bis zum Vortag) |

## 7a. Frischer Review (23.10. abends, Fable 5.1 als Reviewer auf dem ganzen Stand) und Nachbesserungen

| Nr. | Befund | Behoben (Verifier I) |
|---|---|---|
| C1 | Die drei Naht-Texte des Minutenverlaufs änderten sich OHNE Schalter (`afterSeamLabel`): „danach buscosun Fusion · Stundenmittel ▸" statt „danach buscosun Fusion ▸" usw. — Verstoß gegen die Byte-Gleichheit, Verifier G sah TSX nicht | `MinuteChart.tsx`: ohne `ruc` die Literale des Standes vor RUC wortgleich (I1 prüft sie gegen den Quelltext) |
| C2 | Das Messskript konnte gegen die 7-h-Fenster der dense-day-Dateien (43 Stempel) keinen gültigen Fall liefern (61 Stempel verlangt, ≤ 20 % Lücken) — H7 war grün nur mit einem erfundenen 80-Stempel-Tag | Regel: nur gedeckte Stempel zählen, Mindestdeckung 25 (`minCovered`), Lücken innerhalb der Deckung ≤ 20 %; H7 mit echtem 43-Stempel-Tag; neuer Hash `4e660c231a709c8a` (I8/I8b) |
| I1 | `rucOnset` übersprang flache Stunden statt dem Stundensatz zu weichen (§4.5): nasse Fusion-Stunde ohne Form vor einer Form-Stunde ⇒ der Satz nannte den späteren 5-min-Beginn, die Minutenverlauf-Kachel die frühere Stunde | flache nasse Stunde mit p ≥ Rand ⇒ `null` ⇒ Stundensatz (I5) |
| I2 | Zellkoordinaten-Cache unter festem `actions/cache`-Schlüssel + harter Abbruch bei Gitterwechsel ⇒ nach einem DWD-Regridding stündlich rot | `lib/rucCoords.mjs`: bei „grid changed" mit Cache ⇒ Cache verwerfen, CLAT/CLON neu holen, Index neu bauen, weiter (I7/I7b; lokal mit absichtlich falschem Cache belegt: „grid changed (542040 cells, cache 12345) — cache discarded, coordinates refetched") |
| I3 | Die Engine las den Punktwert des 5-min-Intervalls am 15-min-Schritt ⇒ 6-h-Summe und Ereignisse hingen an der Sekunde des Seitenaufrufs | `rucMeanOver(fit, eta − 15 min, eta)`: Mittel der Intervalle des Schritts, Σ der Schritte = Fusion-Stundensumme (I3/I4) |
| I4 | Radar-geschärfte Ereignisse bekamen ohne Schalter den neuen Schlüssel `minSource: 'radar'` | Schlüssel nur für `ruc` gespreizt (I2) |
| M2 | Das Ereignis-Detail baute seine Serie ohne `ruc` ⇒ Kennzahl „Nächster Regen" widersprach dem Eintrag darunter | Serie mit `ruc` (I2) |
| M7 | Flache Stunde an der Radar-Naht angeschnitten ⇒ „erster Regen" am Stundenanfang, den das Radar gerade trocken nannte | `max(Stundenanfang, Naht)` (I6) |

**Zurückgestellt (Jans Entscheidung, Mehrwert klein oder Schattenphase):** M1 `rucFirstWetNear` mit `>` statt `>=` (Minute bis 5 min spät, wenn `nowMs` auf dem 5-min-Raster liegt); M3 erste Ausgabe wartet mit Schalter auf den RUC-Abruf (bis 8 s; Vorschlag: erste Ausgabe ohne, Nachlieferung per `onUpdate`); M4 `?rucbase=` wird in Teilen-Links weitergereicht (Vorschlag: nur `localhost`/`127.0.0.1` oder aus Share-URLs streichen); M5 `--steps` schreibt ein Teilprodukt in `latest.json` und der „already built"-Wächter verlangt dann `--force` (nur für Tests gedacht); M6 Absturz zwischen Umbenennen und `latest.json` ⇒ „already built" bis zur nächsten Stunde; M8 `rucAt` an `fromMs` dokumentieren; M9 Mini-Naht „RUC 5 min" als Kürzel; M11 `inStore()` ohne Präfix-Prüfung. Nicht geprüft (V-RUC-17): Long Tasks am Prod-Build.

## 7. Gate und Selbstverifikation (wird je Task gefüllt)

| Frage | Beleg |
|---|---|
| 1 Funktionserhalt einzeln | ohne `?ruc=1` byte-gleich: `computeRainWindow` (G1), `buildMinuteSeries` (G10), `assembleNowcast` (G14), `buildEventDetail` (G17b); `verify:rain-window` unverändert 62/64 (die zwei Roten sind an HEAD rot, V-RUC-14); Rückfall `?ruc=0`/fehlend |
| 2 Desktop pixelgleich | Köln 1440 × 900 ohne Schalter `audit/niederschlag-ruc/2026-10-23-koeln-desktop-ohne-schalter.jpg` gegen mit Schalter `…-koeln-desktop-ruc1.jpg`: gleiche Hülle, Karte, Layer; Unterschiede nur im Minutenverlauf (Naht „Radar · RUC 5 min", Stufen) und in den Ereignissen (Marke „5 min", Zeiten); Overlay `…-koeln-minutenverlauf-48h-ruc1.jpg` |
| 3 Touch-Targets ≥ 44 px | keine neuen Bedienelemente (Naht-Texte, Schraffur, Marke „5 min" im Ereignis — keine Ziele); Mobil 390 × 844 `…-muenchen-mobile-ohne-schalter.png` / `…-muenchen-mobile-ruc1.png` gleiche Hülle |
| 4 Konsole sauber | Chrome-Konsole Köln mit Schalter: nur die sechs Erweiterungs-Meldungen „message channel closed" (Browser-Extension, nicht die App); keine App-Fehler, keine Warnung |
| 5 keine Long Tasks > 200 ms | Lesen = ein PNG (15 KB komprimiert, 83 KB roh) + `latest.json`; Dekodierung über `decodeGrayPngBrowser` (createImageBitmap); nicht gemessen (Emulation ist für Long Tasks unzuverlässig, Prod-Build-Messung mit `perf-measure.mjs` nach dem ersten Workflow-Lauf, V-RUC-17) |

**UI-Belege (lokaler Nachbau, Lauf 2026102306 im Scratch-Speicher über `?rucbase=http://127.0.0.1:8765`, 23.10. 09:20–09:30 MESZ):**
- Köln Desktop: Minutenverlauf-Kachel `data-origin="radar+ruc+fusion"`, Naht „Radar · RUC 5 min", im Overlay die zwei Nähte „◂ Radar bis 11:20 · ab hier ICON-D2-RUC · 5-min-Form · Stundensumme buscosun Fusion" und „◂ 5-min-Form bis 11:00 · ab hier buscosun Fusion als Stundenmittel", 3 schraffierte flache Stunden, KPI „Spitze 2,7 mm/h · 20:05 · 5-min-Form ICON-D2-RUC", „Summe 13,3 mm · Radar-Minuten + 5-min-Form + Stundenmittel"; Ereignisse mit Marke „5 min" (Titel „5-min-Form ICON-D2-RUC, Stundensumme buscosun Fusion"); Marker-Label „Regen 09:57–10:12" (Radar-Regel vor der RUC-Regel, G4).
- Regensburg und Rostock Mobil: Regenbeginn-Karte „Regen möglich ab etwa 16:00" bzw. „… 17:00" mit Chip „buscosun Fusion · 5 min (ICON-D2-RUC)", Marker „Regen ~16:00" / „Regen ~17:00" (RUC-Regel, Rand p < 50 %: ohne ±, unsicher).
- München Mobil mit/ohne Schalter: Radar-Regel in beiden („Beginn unsicher, zwischen 11 und 12 Uhr"), nur `data-origin` unterscheidet sich.

## 8. Befunde (V-RUC-n)

| Nr. | Befund | Mehrwert | Skizze |
|---|---|---|---|
| V-RUC-1 | **ICON-D2-RUC auf dem neuen DWD-Pfad: 5-min-Niederschlag, +27 h, stündlich, Lauf + 41 min** (§3.1). Weder QUELLENMATRIX noch `docs/DATA_SOURCES.md` kennen ihn | die beste Quelle für 2–27 h Niederschlagstiming | diese Phase; QUELLENMATRIX nachführen (T8) |
| V-RUC-2 | **ICON-D2-RUC-EPS**: 20 Member in 5 min, Lauf + 30 min | gemessene Spanne für Beginn/Ende statt gesetzter | eigene Phase: Member-Quantile des ersten nassen Intervalls je Zelle, Produkt `ruc/v1/<run>/q.png` |
| V-RUC-3 | INCA-Nowcast trägt 15-min **T/Td/RH/Wind/Böe/Niederschlagsart** bis +3 h 15 (AT) — ungenutzt außer `rr` | Viertelstunden-Temperatur und -Böe für AT im Nahbereich | Nowcast-Spalte des Cubes um INCA-Größen erweitern (PD-Linie) |
| V-RUC-4 | MeteoSchweiz `ogd-nowcasting` hat Items ohne Assets | CH hat keinen amtlichen Nowcast im Open Data | beobachten; CH hinter dem Radar = RUC (deutsches Modell, benannt) |
| V-RUC-5 | `sampleUnstructuredToTier` nimmt die nächste Zelle — für 2,2-km-Gitter auf 0,05° ein Zufallstreffer (die Begründung im Kopf von `sample.mjs` gilt für ICON-D2 regulär genauso) | der Cube-Adapter für ICON-D2 nach dem 30.11. braucht dasselbe Blockmittel | `blockIndex.mjs` (T2) ist die Vorlage für den Adapter der Phase E-EX-5 |
| V-RUC-6 | Minutenverlauf (MV) und Ereignisse (ED) haben **kein Audit-Dokument** (`grep -l Minutenverlauf audit/*.md` leer) | Entscheidungen (48 h, `?mv=0`, Hero-Regel) sind nur im Code | dieses Dokument führt MV/ED für RUC mit; Nachtrag `audit/minutenverlauf.md` = Jans Wunsch |
| V-RUC-7 | `composite/wn/` (5 min) ist ein DWD-Reflektivitäts-Nowcast, den die Linie nicht liest; `radvor/re`, `rq`, `composite/hg`, `pg` leer am 23.10. | ggf. Gewitter-Nowcast | nicht in dieser Phase |
| V-RUC-8 | Der Leser liest EINE Zelle, der Cube den 2 × 2-Block (PAP 3) | Konsistenz am Zellrand | Blocklesen = bis zu vier Chunks; nach der Messung entscheiden |
| V-RUC-9 | Faktor-Kappe ×4 ist gesetzt | wie oft greift sie, wie oft `flat`? | T2/T7 zählen `flat`/`mixed` je Lauf ins Manifest und in `nc.ruc.stats` |
| V-RUC-10 | Panel/Dashboard/Autobahn/Seewetter zeigen weiter Stunden | eine Nummer überall (E-FR-1) gilt — die Form ist kein neuer Stand | eigene Phase, wenn Jan sie will |
| V-RUC-11 | RUC als Member von buscosun Fusion (0–27 h Niederschlag, stündlich frisch) | könnte die Stundensumme selbst verbessern | Kandidat für den Prüfstand (Fusion 14), nie ohne Spur P |
| V-RUC-13 | **Kosten gemessen:** ein Volllauf lädt 325 Dateien = 187 MB vom DWD (stündlich ⇒ ≈ 4,5 GB/Tag) und schreibt 5,4 MB PNG + 0,2 MB Stationsreihe; die Historie des Daten-Repos setzt die Kartenlinie bei jedem Publish neu auf (`publish-repack.mjs`), die Größe ist eine Baumfrage (3 Läufe ≈ 16 MB) | Betriebskosten sichtbar | Bandbreite später: nur Intervalle bis +12 h in 5 min, dahinter 15 min (−60 %) — erst nach der Messung T9 entscheiden |
| V-RUC-14 | `verify:rain-window` G2/G3 sind an HEAD rot (G3: `const onRadarStack = rbOn \|\| p3dOn` aus der P3D-Linie, G2: Muster des mobilen Schnellblicks) — nicht diese Phase | der Verifier beschreibt einen alten Stand | Muster der P3D-Linie nachführen (eigene Zeile) |
| V-RUC-15 | Mit `?ruc=1` ändert sich auch die Engine-Serie 0–6 h (Modellseite ab 90 min = RUC-Form): in Köln erschien „13:27 leichter Schauer (zweiter Schauer)", den die Stundeninterpolation nicht kannte | mehr Ereignisse im Nahbereich — ob sie stimmen, misst T9 | T9 misst auch Beginn/Ende im Fenster 2–6 h gegen die 10-min-Messungen |
| V-RUC-16 | Chrome-MCP `resize_window` greift bei maximiertem Fenster nicht (Viewport blieb 1920 × 953); Mobil-Belege über den CDP-Harness `headlessShot.mjs` (390 × 844) | Werkzeugfalle | im CLAUDE.md-Werkzeugblock nennen |
| V-RUC-17 | Long Tasks / Ladezeit mit RUC nicht gemessen (Emulation untauglich) | Gate-Frage 5 offen | `scripts/perf-measure.mjs` am Prod-Build nach dem ersten Workflow-Lauf |
| V-RUC-18 | **Grenzen der Messung T9:** die Stationsreihen tragen den rohen RUC (nicht die an buscosun Fusion angepasste Form des Clients); die dense-day-Dateien decken je Tag nur [Slot − 7 h, Slot] = 16:20–23:20 UTC (⇒ ein Fall braucht ≥ 25 gedeckte Stempel im Fenster 2–12 h: messbar sind die Läufe ≈ 06z–17z, Review C2); die Klasse > 12 h ist mit 0–12-h-Reihen nicht messbar | das Verdikt gilt für die Form, nicht für die Summe; der Zeitraum ist ein Abendfenster | `build-dense-obs.mjs` um ein 24-h-Fenster erweitern (eigene Zeile); Spanne > 12 h bleibt gesetzt (45 min) bis zu Stationsreihen über 27 h |
| V-RUC-12 | ICON-D2 auf dem neuen Pfad ist um ≈ 15 min FRÜHER vollständig (+48 h um Lauf + 1,1 h) als die `regular-lat-lon`-Fassung (+1,35 h gemessen 09/2026) | der t1-Slot `:40` hätte mehr Rand | mit E-EX-5 (Umstellung bis 30.11.) nachmessen |

## 9. Belege (Befehle, 23.10.2026)

```
curl -s https://opendata.dwd.de/weather/nwp/v1/m/icon-d2/p/TOT_PREC/r/2026-10-23T00%3A00/s/ | grep -o 'PT[0-9]*H[0-9]*M.grib2' | sort -u | wc -l   # 193
curl -sI …/icon-d2/p/TOT_PREC/r/2026-10-23T00%3A00/s/PT048H00M.grib2                                                               # Last-Modified 01:05:56
for V in $(…/icon-d2/p/); do … grep -c PT000H15M …; done                                                                          # 29 Größen mit 15 min
curl -s …/icon-d2-ruc/p/TOT_PREC/r/2026-10-23T02%3A00/s/ | grep -o 'PT[0-9]*H[0-9]*M.grib2' | sort -u | wc -l                    # 325, letzte PT027H00M
curl -sI …/icon-d2-ruc/p/TOT_PREC/r/2026-10-23T02%3A00/s/PT000H05M.grib2 ; … PT027H00M.grib2                                      # 02:30:49 / 02:41:38
curl -s …/icon-d2-ruc-eps/p/TOT_PREC/r/2026-10-23T03%3A00/e/ | grep -o 'href="[0-9]*/"' | wc -l                                   # 20 Member
curl -s https://dataset.api.hub.geosphere.at/v1/grid/forecast/nowcast-v1-15min-1km/metadata                                      # 15min, 13, dd ff fx pt rh2m rr t2m td
curl -s https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-nowcasting/items/20261023-ch                        # assets: 0
node --experimental-strip-types --import ./scripts/lib/register-ts.mjs <scratch>/decode-probe.mjs <scratch>/ruc                  # 542 040 Zellen, 94 / 77 ms
```
