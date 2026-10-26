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
> benannte Rückfall (Code, Verifier, Doku umgestellt, Build grün). **Live seit 23.10. vormittags:** Jan hat die Phase committet
> (`18674137` „Update") und `main` gepusht (mit den 40 fremden Commits: Fusion 13, Start-Kacheln, Atmo, Brand, Glacier, Seewetter);
> Netlify liefert das Bundle aus. `ruc.yml` habe ich mit Jans Erlaubnis ins Daten-Repo gepusht (`8323d36`, 10:30 UTC, Workflow `active`);
> erster Lauf 10:52 UTC. Die Spannen ±15/30/45 min bleiben GESETZT, bis T9 sie misst (Stationsreihen laufen ab dem ersten Lauf mit).

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
| E-RUC-10 | Sprung an der Radar-Naht (V-RUC-19) | **Jan 23.10. mittags: „wir lassen es so"** (Option c, die Naht bleibt ehrlich); dazu: **die kleine Minutenverlauf-Kachel zeigt nur die ersten 2 h** (Radar-Horizont, `MINI_RANGE_H = 2`, Mini-Achse beschriftet volle und halbe Stunden), die Detailansicht bleibt bei 48 h; Verifier I9, Bilder `audit/niederschlag-ruc/2026-10-23-tile-2h-{desktop,mobile}.png`; uncommitted |
| E-RUC-9 | RUC als Member von buscosun Fusion (Fusion 14) | **nicht in dieser Phase** — Befund V-RUC-11, Prüfstand-Frage |
| E-RUC-11 | Regenbeginn aus der 5-min-Form in einer Spurenstunde (V-RUC-20…22, Herborn 24.10.) | **Jan 24.10. abends: (a) + (b), dazu Hinweise statt hartem Schnitt und die Summe geteilt** („wir können keinen klaren Cut machen, aber für solche Zeiträume Hinweise anfügen → 20 % Regenchance bei 0,05 mm"); Umsetzung §10. Ursprünglicher Vorschlag: (a) Minutenverlauf-`firstWet` und Ereignis „‹Wort› ab hh:mm" nehmen einen 5-min-Beginn nur aus Stunden, in denen buscosun Fusion selbst nass ist (Stundenmittel ≥ `WET_MMH` UND P(nass) ≥ `RB_P_EDGE` = 30 %) — dieselbe Regel, die der Karten-Pin (`rucOnset`) schon heute anwendet; sonst spricht der Stundensatz („leichtes Nieseln möglich"); (b) `rucFirstWetNear` schneidet an der Radar-Naht (keine RUC-Minute, die das Radar gerade trocken nannte — wie I6/M7 für den Minutenverlauf); (c) nichts, T9 misst erst. Rückfall bleibt `?ruc=0` |
| E-RUC-12 | Schraffur der Stunden ohne RUC-Form (V-RUC-24, Herborn 25.10.) | **Jan 25.10.: „das mit den schraffierten Kacheln rückgängig machen; wenn die Regenchance gering ist, macht das der Regenchance-Streifen unter dem Diagramm sichtbar"** ⇒ flache Stunden (`flat`, RUC trocken, Fusion nass) werden wie der Rest der 5-min-Form gezeichnet (Stufe + Fläche); die Art `flat` bleibt im Fit, im Tooltip („Stunde ohne Form (RUC trocken)") und in den Statistiken; kein Schalter (reine Zeichnung, E-RUC-4 unverändert); Umsetzung §11 |
| E-RUC-13 | Minutenverlauf: die 5-min-Form „so wie im Radar" interpoliert, ohne Verlust an Genauigkeit (Jan 25.10.) | **Jan 25.10.: „ja, mache, nur bis 27 h"** ⇒ die 5-min-Form wird als Minutenkurve gezeichnet (`nowcast/rucCurve.ts`): nicht die Rate wird interpoliert (die 5-min-Werte sind Intervallmittel, lineares Verbinden verschöbe Masse zwischen den Intervallen und bräche E-RUC-4), sondern die **kumulierte Menge** durch die 5-min-Stützstellen mit einer monotonen kubischen Hermite-Kurve (Fritsch–Butland-Tangenten); die Minutenrate ist ihre Steigung. Eigenschaften (Block K): jede 5-min-Summe und jede Stundensumme exakt erhalten, nie negativ, flache Stunden bleiben flach, Lücken ⇒ getrennte Läufe. Nur Zeichnung: erster Regen, Spitze, Summe und Ereignisse lesen die Stufen; Hover-Punkt und -Wert folgen der Kurve, die Quellzeile nennt das 5-min-Mittel und „Minute interpoliert" (wie beim Radar). Fusion-Stunden jenseits +27 h bleiben Balken (keine Form vorhanden, keine wird erfunden). Schalter `?mvcurve=0` = Stufen (Rule 2). **Nachtrag (Jan 25.10.: „ja bitte, einfach ein weicher Übergang, ohne die Daten zu verfälschen"):** weicher Start an der Radar-Naht — die Starttangente der Kurve ist der letzte Radar-Minutenwert statt des ersten 5-min-Mittels, gedeckelt auf 0 … 3 × erstes Mittel (`RUC_CURVE_START_CAP`, Monotonie-Box nach Fritsch–Carlson); die Kurve biegt innerhalb der ersten fünf Minuten ein, deren Summe exakt bleibt; darüber oder bei trockenem erstem Intervall bleibt die Kante (echter Widerspruch der Quellen). Keine Überblendzone im Radar-Teil, keine Annäherung an der +27-h-Naht (abgelehnt, siehe §12). Umsetzung §12 |
| E-RUC-14 | Zeitstufen der Detailansicht | **Jan 25.10.: „der Minutenverlauf soll jetzt nur noch 2 h, 6 h und 27 h anzeigen"** ⇒ `MV_VIEW_H = 27` (`minuteSeries.ts`): Stufen 2 \| 6 \| 27 h, Voreinstellung 27 h, Titel, KPIs „Spitze · 27 h"/„Summe · 27 h", Quellzeile und Reihe (`horizonH: MV_VIEW_H`) laufen bis +27 h; die 24-h- und 48-h-Stufen entfallen (Jans Freigabe, Funktionserhalt-Ausnahme). `MV_HORIZON_H` bleibt 48 für die Engine-Anfrage — die Ereignisse behalten ihre 48 h. Umsetzung §13 |
| E-RUC-15 | Darstellung des Minutenverlaufs | **Jan 25.10.: „mach in der Minutenanzeige im Regenradar doch ein Balkendiagramm daraus, das macht mehr Sinn"; Rückfrage, Antwort: alles als Balken** ⇒ jede Ebene als Balken in ihrer eigenen Auflösung: ein Balken je Radarbild (Wert des Bildes vom Bild bis zum nächsten, erster Balken an „jetzt" angeschnitten, keiner über das letzte Bild hinaus), ein Balken je 5-min-Intervall des RUC, ein Balken je Fusion-Stunde; keine Linie, keine Kurve, nichts interpoliert (die Kurve E-RUC-13 und der weiche Start bleiben hinter `?mvbars=0` erreichbar). Erster Regen, Spitze und Summe des Radar-Teils lesen die Bild-Balken (Minute = Beginn des ersten nassen Bildes, nicht mehr die interpolierte Minute) — damit zeigt das Diagramm genau das, was die Zahlen sagen, und V-RUC-25 (Kurvengipfel über der Spitze) entfällt. Hover nennt „Bild hh:mm (alle 5 min), gilt bis hh:mm". Rule 2: `?mvbars=0` = Stand davor byte-gleich (Block L3). Umsetzung §14 |
| E-RUC-16 | ICON-D2-RUC als Member von buscosun Fusion (Fusion 14, V-RUC-11) | **Jan 26.10.: „neues buscosun fusion 14 … einzige änderung: es soll icon ruc inkludiert haben bei der beimischung. mische es so über den zeitraum bis 27 h bei dass es die besten ergebnisse erzielt"; Rückfrage (0–27 h ist mit den Daten nicht messbar: RUC seit 23.10., Stationsreihen 0–12 h, kein RUC im Hindcast), Antwort: „Bauen, fitten, einschalten"** ⇒ Familie `ruc` als Niederschlags-Member (`FuseCubeOptions.rucMember`, Stundenmittel der 5-min-Raten des neuesten Laufs ≤ 3 h, ρ-Kurve `ACC.precipitation.ruc` / `ACC.precipOcc.ruc`, Fehlerkorrelation `CORR_PAIRS` gesetzt), ρ-Kurve 1–11 h an 23 Hindcast-Slots 23.–26.10. gegen W1 gefittet (eingefrorene Regel, 82 470 Paare), 13–27 h gesetzter Auslauf; Modus 2 (RUC-Stunde behält K-2 wie eine Radar-Stunde) — Modus 1 ließ jede Kurve gleich zählen, weil die Lernhürde K-2 ersetzte. Ergebnis CRPS −3,2 % gegen Fusion 13, Brier 7–11 h +2,0 % (V-RUC-26). **Eingeschaltet als buscosun Fusion 14** (Register `n: 14`, `FUSION14_RUC_MEMBER = 2`, Schalter `?rucm=0` = Fusion 13, `verify:fusion-release`), ohne Spur-P-Urteil wie Fusion 12/13 (E-OF-4/15); Prüfstand-Champion bleibt 9. Umsetzung §15 |

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

**Erstlauf in Produktion (23.10., gemessen):** Workflow `ruc` Lauf 1 (`schedule`) 10:55:31–10:57:25 UTC, `success`; Commit `1c560b89`
„ruc: 2026102310" um 10:56:29 UTC. Manifest: Lauf 10z, 208 Chunks 5,73 MB, `missing` 0, `maxMmH` 178,0, 22 gesättigte Zell-Intervalle,
kleinstes Δ 0,00104 mm, Stationsreihe 3 052 Stationen (Katalog `d213d4de`); Laufzeit fetch 13,2 s, decode 20,6 s, sample 5,1 s, gesamt
41,2 s (Actions-Runner schneller als die lokale Maschine). Produktionsseite (CDP-Harness gegen buscosun.com, 11:0x UTC): Köln Desktop
`data-origin="radar+ruc+fusion"`, Naht „Radar · RUC 5 min", Ereignis-Marken „min, 5 min"; mit `?ruc=0` `radar+fusion`, Naht „Radar ·
buscosun Fusion", nur „min" (Rückfall greift); Regensburg Mobil ebenfalls `radar+ruc+fusion`. Bilder `audit/niederschlag-ruc/2026-10-23-live-*.png`.

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
| V-RUC-19 | **Sprung an der Radar-Naht (Jan, 23.10. 13:30 MESZ, Köln):** die RV-Extrapolation steigt in den letzten fünf Minuten vor der Naht von 0,86 auf 2,43 mm/h (15:20–15:25), die Fusion-Stunde 15–16 dahinter trägt ≈ 0,1 mm/h, die RUC-Form zeigt 0,16 / 0,12 / 0,02 / 0 … Der Sprung ist der Widerspruch zwischen dem Rand der Radar-Extrapolation (+115…+120 min, dort am schwächsten, V-RB-4) und der modellgetragenen Stundensumme; vor RUC stand derselbe Sprung als flacher Balken da, die Stufenlinie macht ihn sichtbar. Bild `audit/niederschlag-ruc/2026-10-23-live-koeln-naht-6h.jpg` | der Leser sieht an der Naht zwei Quellen, die sich widersprechen, ohne dass es gesagt wird | Optionen (Jans Wahl): (a) Naht-Text nennt beide Werte („Radar 2,4 → buscosun Fusion 0,1 mm/h"); (b) die Karte überblendet 90–120 min wie die Engine (dann ist der Radar-Teil dort keine reine Extrapolation mehr, Beschriftung ändern); (c) nichts, die Naht ist ehrlich | 
| V-RUC-12 | ICON-D2 auf dem neuen Pfad ist um ≈ 15 min FRÜHER vollständig (+48 h um Lauf + 1,1 h) als die `regular-lat-lon`-Fassung (+1,35 h gemessen 09/2026) | der t1-Slot `:40` hätte mehr Rand | mit E-EX-5 (Umstellung bis 30.11.) nachmessen |
| V-RUC-20 | **„Leichter Regen" direkt an der Radar-Naht aus einer Spurenstunde (Jan, 24.10. 19:05 MESZ, Herborn):** Radar 19:02–20:55 durchgehend 0,00 mm/h; Fusion-Stunde 20–21 trägt im Mittel **0,047 mm/h bei P(nass) = 16 %**, die RUC-Form (Lauf 16 UTC) legt den Regen ans Stundenende (roh 20:40 0,005 · 20:45 0,031 · 20:50 0,077 · 20:55 0,042), Faktor ×2,99 ⇒ 20:50 0,230 und 20:55 0,127 mm/h. Das Radar deckt 20:00–20:55 ab, sichtbar bleibt nur die Stufe 20:55–21:00 = 0,127 ≥ `WET_MMH` 0,1 ⇒ Minutenverlauf „Regen ab 20:55 · in 1 Std 53", obwohl die Stunde als Ganze unter der Nassschwelle liegt und nur 0,05 mm bringt. Die Form-Skalierung hebt ein Spurenmittel über die 5-min-Schwelle; ohne RUC (`?ruc=0`) erster Regen 21:00 (Stunde 21–22, 0,124 mm/h, P 39 %). Bild `audit/niederschlag-ruc/2026-10-24-live-herborn-naht-drei-zeiten.jpg` | der Leser liest einen Regenbeginn aus einer Stunde, die buscosun Fusion selbst mit 16 % und 0,05 mm führt — kein Fehler von Jan, kein Datenfehler, eine Regel-Lücke: der Minutenverlauf und die Ereignisse kennen die P(nass)-Schwelle des Karten-Pins nicht | E-RUC-11 (a): `firstWet`/Ereignis-Minute nur aus Stunden mit Fusion-Mittel ≥ `WET_MMH` und P(nass) ≥ `RB_P_EDGE` |
| V-RUC-21 | **Ereignis-Minute liegt im Radarfenster:** Ereignis „leichter Schauer ab 20:50 · 5 min", das Radar ist bis 20:55 gültig und dort trocken. `rucFirstWetNear(nc, 21:02)` sucht den ersten nassen Fit-Punkt in (20:47, 21:02] und nimmt 20:50 (0,230) — ohne Rücksicht auf die Naht; der Engine-Schritt 20:47 (105 min) ist noch Blend (0,009), 21:02 reine Modellseite (0,133 = `rucMeanOver` 20:47–21:02). Der Minutenverlauf schneidet die RUC-Punkte an der Naht (I6/M7), das Ereignis nicht | zwei Angaben auf einer Seite widersprechen dem Radar, das die Seite selbst als minutengenau ausweist | E-RUC-11 (b): `max(Naht, Minute)` in `rucFirstWetNear`, Fall in `verify:ruc` |
| V-RUC-22 | **Drei Beginnzeiten auf einer Seite:** Ereignis 20:50 (Engine-Schritt + `rucFirstWetNear`), Minutenverlauf 20:55 (`firstWet`, Naht), Karten-Pin „Regen ~21:15" (`rucOnset`: überspringt die Stunde 20–21 wegen P 16 % < 30 %, nimmt in 21–22 den ersten Punkt ≥ 0,1 = 21:15 mit 0,186). Ohne RUC dasselbe Bild mit anderen Zahlen (Ereignis 21:51, Minutenverlauf 21:00). Die drei Pfade haben drei Regeln für „erster Regen" | die Seite nennt für eine Frage drei Antworten; die ehrlichste (Pin, mit P-Schwelle und „möglich") steht am kleinsten | eine Funktion `firstRainMinute(series, hours, radarSeam)` für alle drei Anzeigen (Regel des Pins), Verifier-Fall „drei Anzeigen, eine Minute"; Messung T9 entscheidet die Schwellen |
| V-RUC-23 | **Roher RUC gegen buscosun Fusion 13 im Regenereignis 23./24.10. (Jan, 24.10. abends, nur Niederschlag):** Fenster 23.10. 12 UTC – 24.10. 15 UTC (Regen ab dem Abend, Kern 23–05 UTC mit bis 37 % nassen Stationen), Prüfnetz P1 (365 Stationen, 364 in der RUC-Stationsreihe `ruc/v1/stations`), Wahrheit W1 (unreif, 23./24.10. frisch gebaut), Fusion 13 = Register `fusion-12x` auf den Hindcast-Slots (dafür `queue.mjs follow` 22.–24.10. nachgezogen: 20 Slots, lokal; ohne Radar-Member und ohne Anker), RUC = Stundenmittel der 5-min-Reihe je Lauf. **Paare = gleiche Station, gleicher Stempel, gleicher Vorlauf (1–12 h), n = 31 452.** Ergebnis: Summe über alle Paare RUC 1,09, Fusion-Mittel 1,11 der gemessenen (beide unverzerrt); Fehler RUC MAE 0,193 mm/h, Fusion CRPS der Quantile 0,127 (−34 %), Fusion-Mittel MAE 0,190 (gleich); je Vorlauf 1–3 h RUC 0,150 / Fusion CRPS 0,110, 7–12 h 0,222 / 0,140. Nass/trocken (≥ 0,1 mm/h): RUC POD 73 % FAR 40 % ETS 0,34; Fusion bei P ≥ 50 % POD 35 % FAR 15 % ETS 0,25 (zu vorsichtig), bei P ≥ 30 % POD 82 % FAR 42 % ETS 0,35 (= RUC). Länder: DE RUC 0,99 der Summe, CH RUC 1,21 (zu nass); Fusion-Median überall ≈ ¼ der Summe (die Verteilung ist breit, der Median ist nicht der Produktwert). Stationen mit viel Regen (27 h): Säntis 39,2 mm gemessen, RUC 15,6, Fusion 24,9; La Dôle 32,8 / 37,1 / 26,7; Lüdenscheid 21,4 / 17,4 / 19,0; Ahaus 21,1 / 18,2 / 18,3. **Verlässlichkeit der Regenchance (39 120 Fusion-Zeilen, 1–12 h):** angezeigt 0–10 % ⇒ 3 % nass, 20–30 % ⇒ 17 %, 30–40 % ⇒ 39 %, 40–50 % ⇒ 62 %, 50–60 % ⇒ 76 %, 70–80 % ⇒ 94 %, ab 80 % ⇒ 98–100 % — bis 40 % ehrlich, darüber zu vorsichtig (es regnete öfter als gesagt). Schwellen-Sweep: P ≥ 30 % POD 80 % FAR 43 % ETS 0,35 (sagt 1,4-mal so oft Regen, wie er fiel), **P ≥ 35 % ETS 0,38 bei Häufigkeitsfaktor 0,97 (beste Trennung)**, P ≥ 40 % ETS 0,34, P ≥ 50 % POD 33 % ETS 0,24 (verfehlt zwei Drittel der nassen Stunden). Belege `audit/niederschlag-ruc/2026-10-24-ruc-vs-fusion13-niederschlag.{txt,json}`, Skript `…/2026-10-24-measure-ruc-f13.mjs` | ein Tag ist eine Stichprobe, kein Urteil; er stützt aber E-RUC-4 (Summe von Fusion 13, Form vom RUC) und zeigt, dass die Nass-Entscheidung der Fusion bei 50 % das Ereignis verfehlt, bei 30 % den RUC erreicht | (a) in T9 die Stundensummen beider Quellen mitmessen (RUC-Reihe liegt vor); (b) V-RUC-11 bleibt: RUC als Member in den Prüfstand (Fusion 14); (c) die Nass-Schwelle der Anzeigen an `RB_P_EDGE` 30 % hängen, nicht an 50 % (siehe E-RUC-11 a); Hindcast-Slots 22.–24.10. liegen lokal in `C:\dev\buscosun-hindcast\slots\` (Publish = Jan) |
| V-RUC-25 | **Kurvengipfel über der „Spitze · 48 h" (E-RUC-13, Herborn 25.10. 01:00 MESZ):** die KPI liest die Stufen und das Radar (2 mm/h, 01:10 Radar), die Minutenkurve erreicht um 06:50 ≈ 2,5 mm/h (5-min-Mittel 06:50–06:55 1,9 mm/h) und die y-Achse zeigt 3. Das ist kein Rechenfehler, sondern die Eigenschaft jeder glatten Kurve durch Intervallmittel: liegt ein 5-min-Mittel über seinen Nachbarn, muss die Rate innerhalb der fünf Minuten irgendwo darüber liegen, sonst stimmt die Summe nicht; Fritsch–Butland begrenzt den Gipfel auf ≤ 3 × Stufe, gemessen ×1,35 (Block K6 auf Rauschen, Herborn ≈ ×1,3). Ein einzelner nasser 5-min-Schritt zwischen Nullen wird zur schmalen Spitze (Herborn 21:00) | eine Seite nennt eine Spitze und zeichnet eine höhere; die Zahl ist die ehrlichere (Daten), die Kurve die anschaulichere | Optionen für Jan: (a) so lassen, Tooltip erklärt es („5-min-Mittel x, Minute interpoliert"); (b) KPI-Untertitel „5-min-Mittel" bei RUC-Spitzen; (c) die KPI nimmt die Kurve mit dem Zusatz „Minute interpoliert" (wie das Radar, dessen Minuten ebenfalls interpoliert sind). Empfehlung (b): ein Wort, keine neue Zahl |
| V-RUC-24 | **„Ab 9 Uhr Stundenbalken" im Minutenverlauf (Jan, 25.10. früh, Herborn):** die 5-min-Schicht reicht bis Lauf + 27 h (Lauf 21 UTC ⇒ Naht 01:00 MEZ, Produkt 324 Schritte, 0 Lücken — am Punkt direkt gelesen); ICON-D2-RUC rechnet Herborn aber ab +11 h (09:00) zehn Stunden exakt trocken und danach nur Spuren ≤ 0,04 mm/h, buscosun Fusion hält 0,2–0,4 mm/h bei 30–45 % Regenchance. Diese Stunden sind `flat` (keine Form, Fusion-Summe gleichmäßig) und wurden als schraffierte Blöcke gezeichnet — zwölf gleiche 5-min-Stufen sehen aus wie Stundenbalken, die Schraffur liest sich nicht als „ohne Form", sondern als anderes Produkt. Tooltip nannte es korrekt („Stunde ohne Form (RUC trocken) · Regenchance 43 %"). Die Nullen sind echt (Producer-Schwelle 0,001 mm je 5 min, `RUC_DRY_MM`) | eine zweite Kodierung (Schraffur) neben dem Regenchance-Streifen für dieselbe Unsicherheit verwirrt mehr, als sie erklärt; das Produkt erklärt sich über Streifen, Tooltip und Fußtext | E-RUC-12: Schraffur entfernt; Rest bleibt |
| V-RUC-26 | **Fusion 14 verbessert die Menge, aber die Nass-Entscheidung 7–11 h wird schlechter (§15):** mit dem RUC-Member (Modus 2) sinkt der CRPS in jeder Vorlaufklasse und jedem Land, der Brier von P(nass) 1–3 h um 6,9 % und 4–6 h um 1,6 %, bei 7–11 h steigt er aber um 2,0 % (AT 5,5 %). Ursache: eine RUC-Stunde behält K-2 statt der gelernten Hürde (V-FL-18), und die Hürde war bei 7–11 h die bessere Nass-Entscheidung — der Gewinn 7–11 h kommt aus der Menge, nicht aus P(nass). Modus 1 (Hürde bleibt) hat den besseren Brier (−4,7 %), aber nur −1,5 % CRPS | ein Leser der Regenchance sieht bei 7–11 h etwas schlechtere Prozentzahlen als mit Fusion 13; die Menge und die Spanne sind besser | Modus 3: RUC-Stunde behält K-2 für die Menge, P(nass) aus der gelernten Hürde mit RUC-pDry-Merkmal (eine Zeile in `fuseCubePoint`, Messung mit demselben Skript); oder die Hürde bei 7–11 h wieder zulassen (Vorlauf-Schwelle) |
| V-RUC-27 | **Das Gitter endet am Gewinner:** die Vorkommens-Kurve ρ₀ 0,94 / τ 30 h ist der Rand des eingefrorenen Gitters B (0,82 / 0,88 / 0,94), die Mengen-Kurve 0,55 / 6 h liegt mittig (0,45–0,72 nahezu gleich, ± 0,1 %). Die Kurve 13–27 h ist gesetzt (Stationsreihen enden bei 12 h, `RUC_STATION_STEPS` 144); Stichprobe = 4 Herbsttage mit einem Frontregen (23./24.10.) und ruhigen Tagen danach | das Optimum der Vorkommens-Kurve kann jenseits 0,94 liegen; der Auslauf 13–27 h ist ungemessen | nach ≥ 14 Tagen RUC-Reihe (T9-Termin) Gitter 0,94–0,99 und τ 20–60 h nachfitten; Stationsreihen auf 27 h verlängern (Producer, Daten-Repo = Jans Gate), dann 13–27 h messen |
| V-RUC-28 | **Die Kartenfelder `point/field` (Regenchance-Karte, Summenfelder) rechnen ohne RUC-Member** (§15.5) — `build-point-fields.mjs` ruft `fuseCubePoint` je Zelle ohne Station, Radar und RUC; ein Feldlauf müsste je Zelle die RUC-Gitterspalte lesen (`ruc/v1/<run>/<chunk>.png` liegt im Daten-Repo), und der Punkt-Cron hat `ruc/` nicht im Checkout | die Karte zeigt in 1–11 h die Fusion-13-Regenchance, der Punkt daneben die von Fusion 14 — zwei Zahlen für eine Zelle | **umgesetzt 26.10. abends (Jan: „schalte es da auch an")**: `rucReader` + `cellInput({ ruc })` in `build-point-fields.mjs`, `workflow-point.yml` t1 mit `ruc`; live mit Jans Kopie der Vorlage (§78) |
| V-RUC-29 | **Das Etikett „Modell · Cube" der Kartenfelder bleibt, obwohl das t1-Feld seit V-RUC-28 den RUC-Member trägt** — das Feld ist nicht mehr „Cube als einzige Quelle"; das Manifest sagt es (`chain.options.ruc`), die Karte nicht | ein Leser der Legende hält das Feld für Modell ohne Nowcast-Form, obwohl 0–27 h die RUC-Form einfließt | Legendentext an das Manifest hängen („Modell · Cube + RUC" nur, wenn `ruc.run` gesetzt ist); E-NP0-4 F1 war Jans Wortwahl ⇒ Rückfrage vor der Änderung |

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

## 10. Regen-Kante der Anzeigen (E-RUC-11, 24.10.2026 abends)

**Diagnose:** V-RUC-20…23. Der Minutenverlauf und die Ereignisse kennen keine Wahrscheinlichkeitsschwelle; eine Stunde mit 0,047 mm/h
und 16 % Regenchance wird über die ×3-skalierte RUC-Form zum „Regen ab 20:55". Die Messung V-RUC-23 zeigt: unter 30 % Regenchance
regnete es in 3–17 % der Stunden, ab 30 % in 39 % und mehr; 35 % trennt am besten (ETS 0,38), 50 % verfehlt zwei Drittel.

**Regel (eine Funktion, `src/nowcast/rainGate.ts`):** eine Stunde von buscosun Fusion „zeigt Regen", wenn Stundenmittel ≥ `WET_MMH`
(0,1 mm/h) UND Regenchance ≥ `RAIN_GATE_P` = 0,3 (= `RB_P_EDGE` des Karten-Pins; ohne Regenchance — Live-Rückfall — entscheidet das
Mittel allein). Alles andere ist eine **Spurenstunde** (`trace`). Die Kante bleibt GESETZT; T9 misst sie nach (V-RUC-23 nennt 35 % als
gemessenen Kandidaten für einen Herbst-Frontregen).

**Umsetzung (Rule 2: Schalter `?mvgate=0` = alles wie heute, byte-gleich):**
1. `rucSeries.ts`: `fitRucToFusion(…, { pWet, gate })` markiert Stunden und Punkte `trace`; `rucAt` liefert in Spurenstunden `null`
   ⇒ die Engine fällt dort auf die Stundeninterpolation zurück (wie vor RUC), der 15-min-Schritt wird nicht nass.
2. `minuteSeries.ts`: Balken und Stufen der Spurenstunden tragen `trace`; erster Regen, Spitze und `maxMmH` überspringen sie;
   `sumMm` zählt nur gezeichnete Regenstunden (+ Radar), `sumTraceMm` die Spurenstunden; `hints` = zusammenhängende Spurenstunden
   als Spanne {von, bis, pMax, mm}.
3. `MinuteChart.tsx`: Spurenstunden ohne Balken/Stufe (Stufenlinie auf 0), in der Detailansicht ein leiser Hinweis je Spanne
   („16 % · 0,05 mm", ab 56 px Breite, sonst nur im Tooltip); die kleine Kachel bleibt still. Tooltip nennt die Spur.
4. `MinuteSeriesCard.tsx`: KPI „Summe · 48 h" = gezeichnete Stunden, darunter „+ x mm möglich (unter der Kante)"; Fußtext nennt die Regel.
5. `eventDetail.ts`: `rucFirstWetNear` nimmt keine Minute vor der Radar-Naht und keine aus Spurenstunden (V-RUC-21); `rucFirstWet`/
   `rucLastWetEnd` überspringen Spurenstunden.
6. `rainWindow.ts`: `rucOnset` überspringt Spurenpunkte (dieselbe Regel wie bisher plus Stundenmittel ≥ 0,1); `RB_P_EDGE` = `RAIN_GATE_P`.
7. `nowcastEngine.ts`: Regenchance VOR der Anpassung rechnen, an `fitRucToFusion` reichen; `nc.rainGate` trägt den Schalter.
8. `verify:ruc` Block J: Spurenstunde ⇒ kein erster Regen, Hinweis, Summen-Split; Ereignis-Minute ≥ Naht; Pin unverändert;
   Schalter aus ⇒ byte-gleich; Quelltext-Verdrahtung.

**Erwartung am Herborn-Fall (24.10. 19:05):** keine Stufe 20:55–21:00, Hinweis „16 % · 0,05 mm" an der Stunde 20–21, erster Regen
21:15 (Stunde 21–22, 39 %), Ereignis und Pin nennen dieselbe Minute, Summe ohne die Spurenstunde + „möglich"-Zeile.

**Gate E-RUC-11 (24.10. 20:45 MESZ):** `npm run typecheck` grün · `verify:ruc` **115/115** (Block J: J1–J1c Fit mit Kante und byte-gleich ohne,
J2–J2e Minutenverlauf am Herborn-Fall — ohne Kante erster Regen 18:55 UTC an der Naht (V-RUC-20), mit Kante 19:15 UTC aus der Regenstunde,
Balken/Stufen `trace`, Summe geteilt, Hinweis-Spanne; J3–J3c Ereignisse — ohne Kante „ab 18:50" aus dem Radarfenster (V-RUC-21), mit Kante
19:15 = die Minute des Minutenverlaufs, Radar-Minute auch in der Blend-Zone; J4 Karten-Pin 19:15 vor und nach der Kante; J5/J5b Verdrahtung
mit Gegenprobe) · `verify:rain-window` 62/64 (G2/G3 an HEAD rot, V-RUC-14; G7-Muster erhalten) · Build 260/260 · Budget totalJs 1905,7
≤ 1912 (Ratsche mit Notiz angehoben), eagerJs 110,1 unverändert (0,1 über der Ratsche seit HB, Jans Entscheidung §73.4).
Live am Dev-Server (Herborn, 20:36 MESZ): `nc.rainGate = true`, sechs Hinweis-Spannen am 25.10. (28–30 %, 0,08–0,74 mm), KPI „Summe 13,0 mm ·
+ 1,9 mm möglich (Stunden unter der Kante)", Ereignis „mäßiger Regen ab 22:09 · min" = Minutenverlauf „Regen ab 22:09 · Radar" (vorher 22:09
gegen 22:20, eine Blend-Zonen-Abweichung, die J3c jetzt deckt). Bild `audit/niederschlag-ruc/2026-10-24-regenkante-herborn-48h.jpg`.

| Frage | Beleg |
|---|---|
| 1 Funktionserhalt einzeln | `?mvgate=0` ⇒ Fit, Minutenverlauf, Ereignisse byte-gleich (J1b, J2d, J3b); Regenchance-Streifen, Schraffur, Nähte, Tooltip unverändert; Hinweise nur zusätzlich |
| 2 Desktop pixelgleich | ohne Spurenstunden keine Änderung am Bild; mit Spurenstunden fehlen Balken/Stufen unter der Kante, neue Hinweise nur im Overlay (Bild oben), Kachel still |
| 3 Touch-Targets ≥ 44 px | keine neuen Bedienelemente (Hinweise sind Text/`<title>`) |
| 4 Konsole sauber | keine Fehler beim Laden der Herborn-Seite nach HMR (Fiber-Lesung ohne Warnungen); Build ohne Warnung zu den neuen Dateien |
| 5 keine Long Tasks > 200 ms | Rechenaufwand: eine `find` je RUC-Punkt über ≤ 48 Balken (≤ 324 × 48), vernachlässigbar; nicht gemessen (Emulation untauglich, V-RUC-17) |

Nicht gemessen: der Bundle-Anteil dieser Änderung isoliert (geteilter Arbeitsbaum, Notiz in `budget.json`); Mobil-Bild (keine Layout-Änderung,
Hinweise nur im Overlay ab 56 px Spannenbreite).

## 11. Keine Schraffur für Stunden ohne RUC-Form (E-RUC-12, 25.10.2026)

**Diagnose:** V-RUC-24. **Änderung (nur Zeichnung):** `MinuteChart.tsx` zeichnet die 5-min-Form als eine Stufenlinie mit Fläche, ohne
`<pattern>`/`<rect>` je flacher Stunde; `minuteSeries.css` ohne `.mv-ruc-flat`/`.mv-hatch-line`; Fußtext in `MinuteSeriesCard.tsx` nennt statt
der Schraffur den Satz „rechnet der RUC eine Stunde trocken, liegt die Summe gleichmäßig in ihr". Fit (`kind: 'flat'`, `stats.flat`), Tooltip-Zusatz,
Regenchance-Streifen, Nähte und Kante (E-RUC-11) unverändert; `verify:ruc` prüft keine Schraffur (nichts anzupassen). Kein Schalter: die
Schraffur war eine Darstellungswahl der RUC-Phase, keine Rechenregel (Rule 2 betrifft Rechenpfade).

**Gate E-RUC-12 (25.10. 00:45 MESZ):** `npm run typecheck` grün · `verify:ruc` 115/115 · Build 260/260 · Budget totalJs 1908,5 ≤ 1912
(gestern 1905,7; die Differenz stammt nicht aus dieser Änderung, die nur Code entfernt — geteilter Arbeitsbaum, nicht isoliert messbar),
eagerJs 110,1 > 110 unverändert (HB, Jans Entscheidung §73.4), largestChunk 278,4 ≤ 302. Live am Dev-Server (Herborn, Lauf 21 UTC): die Stunden
09:00–01:00 laufen als eine Stufenlinie mit Fläche durch, keine Schraffur, Nähte 02:35 (Radar) und 01:00 (5-min-Form) unverändert, Hinweise und
„+ 1,0 mm möglich" unverändert. Bild `audit/niederschlag-ruc/2026-10-25-ohne-schraffur-herborn-48h.jpg`.

| Frage | Beleg |
|---|---|
| 1 Funktionserhalt einzeln | Fit, Statistiken (`stats.flat`), Tooltip-Zusatz „Stunde ohne Form (RUC trocken)", Regenchance-Streifen, Nähte, Kante, Hinweise unverändert (`verify:ruc` 115/115); nur die Schraffur-Rechtecke und das `<pattern>` entfallen |
| 2 Desktop pixelgleich | ohne flache Stunden pixelgleich (Stufenlinie und Fläche unverändert); mit flachen Stunden fehlt nur die Schraffur (Bild oben) |
| 3 Touch-Targets ≥ 44 px | keine Bedienelemente berührt |
| 4 Konsole sauber | Seite nach HMR ohne Fehler geladen; Build ohne neue Warnung |
| 5 keine Long Tasks > 200 ms | weniger Arbeit als vorher (eine Schleife über die RUC-Punkte und bis zu 27 `<rect>` je Render entfallen) |

## 12. Minutenkurve der 5-min-Form (E-RUC-13, 25.10.2026)

**Auftrag (Jan):** „könnten wir die Ansicht des Minutendiagramms so wie im Radar machen, sodass wir es interpolieren, aber dabei die
Genauigkeit nicht leidet" — „ja, mache, nur bis 27 h".

**Diagnose:** Der Radar-Teil interpoliert Momentwerte (Bild alle 5 min) linear zur Minute (`interpolateMinutes`). Die 5-min-Werte des RUC sind
dagegen Intervallmittel (Δ zweier Akkumulationen, `intervalRateMmH`); eine lineare Verbindung dieser Mittel verschöbe Masse zwischen den
Intervallen, die Stundensumme wäre nicht mehr der Fusion-Wert (E-RUC-4). Fusion-Stunden jenseits +27 h tragen keine Form; eine Kurve dort
wäre erfunden (Kopfkommentar `minuteSeries.ts`: „No minute is invented beyond the radar").

**Änderung:** `src/nowcast/rucCurve.ts` (neu, rein): `rucMinuteCurve(steps, endMs, stepMs)` legt durch die kumulierte Menge an den 5-min-Stützstellen
eine monotone kubische Hermite-Kurve (Fritsch–Butland-Tangenten, Null-Tangente neben einem trockenen Intervall, Sekante an den Enden) und gibt je
zusammenhängendem Lauf eine Probe je Minute mit Rate (Steigung) und kumulierter Menge (Wert); `rucCurveAt`, Schalter `rucCurveEnabledFrom`
(`?mvcurve=0`). `MinuteChart.tsx`: Prop `curve` (Voreinstellung an); `geom` rechnet die Kurve aus den kanten-bereinigten Stufen (Spurenstufen = 0
⇒ Kurve auf der Grundlinie) und nimmt ihr Maximum in `yMax`; `rucPath` zeichnet je Lauf Linie + Fläche, mit Schalter aus den Stufenpfad wie bisher;
Hover-Punkt und -Wert folgen der Kurve, die Quellzeile des Tooltips nennt „5-min-Mittel x, Minute interpoliert". `MinuteSeriesCard.tsx` liest
den Schalter, reicht ihn beiden Diagrammen, Quellzeile „(Lauf hh UTC, 5-min-Summen, Minute interpoliert)", Fußtext „Kurve … zwischen den
5-min-Summen zur Minute interpoliert, ohne dass sich eine 5-min-Summe ändert". Unverändert: Fit, `firstWet`, Spitze, Summe, Hinweise, Ereignisse,
Karten-Pin, Nähte, Balken jenseits +27 h, Regenchance-Streifen.

**Belege (Block K, `verify:ruc` 127/127):** K2 kumulierte Menge an jeder 5-min-Stützstelle exakt (1,8e-15 mm, auch die an der Naht angeschnittene
Stufe), K3 jede Stundensumme exakt das Mittel der zwölf Stufen (1,8e-15), K4 Integral der gezeichneten Rate je 5 min = Summe (1-s-Trapez 5e-6 mm),
keine negative Minute, K5 flache Stunde exakt flach (5,6e-17), Nullen bleiben Nullen, K6 Gipfel ≤ 3 × Stufe (gemessen ×1,35 auf Rauschen), K7/K8
Lücke ⇒ zwei Läufe ohne Brücke, `endMs` schneidet, `rucCurveAt` in der Lücke null, K9 auf einem echten `fitRucToFusion` (27 Stunden dry/flat/form/
mixed) trägt die Kurve je Stunde exakt die Fusion-Summe (4,3e-15), K10 Schalter, K11/K11b Verdrahtung als Quelltext mit Gegenprobe.

**Gate E-RUC-13 (25.10. 01:05 MESZ):** `npm run typecheck` grün · `verify:ruc` 127/127 (115 + 12) · `npm run build` Exit 0 · Budget totalJs
1910 ≤ 1912 (vor E-RUC-13 1908,5; +1,5 KB gz = `rucCurve.ts` im Regenradar-Chunk), largestChunk 278,4 ≤ 302, eagerCss 2,4 ≤ 2,5, eagerJs 110,1 > 110
unverändert (HB, Jans Entscheidung §73.4). Live am Dev-Server (Herborn, Lauf 22 UTC, Radar bis 02:55, 5-min-Form bis 02:00): die Form läuft als
durchgehende Kurve von der Radar-Naht bis zur zweiten Naht, flache Stunden (09–19 Uhr) als waagerechte Linie, ein einzelner nasser Schritt um 21:00
als schmale Spitze, Tooltip um 06:55 „1,7 mm/h · mäßig · ICON-D2-RUC · 5-min-Form 06:55–07:00 · 5-min-Mittel 1,9 mm/h, Minute interpoliert ·
Stundensumme buscosun Fusion · Regenchance 69 %"; Balken ab 02:00 unverändert. Mit `?mvcurve=0` die Stufenlinie wie vor E-RUC-13 (gesichtet).
Konsole: nur die sechs Meldungen der Chrome-Erweiterung („message channel closed"), keine App-Fehler. Bild
`audit/niederschlag-ruc/2026-10-25-minutenkurve-herborn-48h.jpg`. Befund V-RUC-25 (Kurvengipfel über der KPI „Spitze"), Entscheidung bei Jan.

| Frage | Beleg |
|---|---|
| 1 Funktionserhalt einzeln | `?mvcurve=0` ⇒ Stufenpfad, Tooltip-Texte und Quellzeile wie vor E-RUC-13 (gesichtet); Fit, Zahlen, Ereignisse, Pin unberührt (`verify:ruc` 115 Altprüfungen grün); Fusion-Balken jenseits +27 h unverändert |
| 2 Desktop pixelgleich | ohne RUC-Schicht pixelgleich (Radar-Pfad und Balken unverändert); mit Schicht ersetzt die Kurve die Stufen, `yMax` kann durch den Kurvengipfel eine Stufe höher liegen (V-RUC-25) |
| 3 Touch-Targets ≥ 44 px | keine Bedienelemente berührt |
| 4 Konsole sauber | keine App-Fehler (s. o.) |
| 5 keine Long Tasks > 200 ms | Kurve: ≤ 1 620 Proben je Render (27 h × 60), einfache Arithmetik, im `useMemo` von `geom`; nicht gemessen (Emulation untauglich, V-RUC-17) |

Nicht gemessen: Mobil-Bild (gleiche Komponente, keine Layout-Änderung); Long Tasks am Prod-Build.

### 12.1 Weicher Start an der Radar-Naht (Nachtrag E-RUC-13, 25.10.2026)

**Frage (Jan):** „macht es Sinn, jetzt noch eine Annäherung beim Übergang zwischen Radar- und buscosun-Fusion-Ebene zu machen?" — Antwort: an der
Radar-Naht ja, summentreu; keine Überblendzone im Radar-Teil (der Teil hieße dann zu Unrecht „Radar, minutengenau", und die Summe der Zone
verschöbe sich); keine Annäherung an der +27-h-Naht (jenseits nur Stundenmittel, jede Form dort wäre erfunden; Jans „nur bis 27 h").
**Entscheidung (Jan):** „ja bitte, einfach ein weicher Übergang, ohne die Daten zu verfälschen."

**Änderung:** `rucCurve.ts` nimmt `opts: { startMmH, startAtMs }`; beginnt der erste Lauf genau bei `startAtMs`, ist seine Starttangente
`min(max(0, startMmH), 3 × erstes 5-min-Mittel)` statt des Mittels (`RUC_CURVE_START_CAP = 3`, Fritsch–Carlson-Box ⇒ Kurve bleibt monoton, Rate
≥ 0; Fritsch–Butland liefert für die zweite Tangente ohnehin ≤ 3 × Mittel). Die Kurve läuft weiter durch jede Stützstelle, also ändert sich
keine 5-min-Summe und keine Stundensumme — nur die Form innerhalb der ersten fünf Minuten. `MinuteChart.tsx` reicht den letzten Radar-Minutenwert,
wenn das Radar genau am ersten RUC-Schritt endet (sonst nichts). Hängt am Schalter `?mvcurve=0` (dann Stufen, kein Start). Ist das erste
Intervall trocken (Mittel 0, auch Spurenstufe), bleibt der Start 0 ⇒ Kante; liegt das Radar über dem Dreifachen, startet die Kurve beim Dreifachen
⇒ Restkante. Beides gewollt: dann widersprechen sich die Quellen, und die Naht-Beschriftung sagt es.

**Belege (Block K, `verify:ruc` 130/130):** K12 Start 1,2 bei Mittel 0,6: Kurve beginnt bei 1,2, ab dem zweiten Intervall identisch zur Kurve ohne
Start (< 1e-12), jede 5-min-Summe exakt (2,2e-16 mm), keine negative Minute (1-s-Proben); K13 Radar 5 ⇒ Start 1,8 (Deckel), keine negative Minute;
trockenes erstes Intervall ⇒ Start 0 und Nullen bis zu dessen Ende; `startAtMs` ≠ Laufbeginn ⇒ ohne Wirkung; K14 Verdrahtung als Quelltext.
Live (Herborn, Lauf 22 UTC, Radar bis 02:10 mit 2,5 mm/h am letzten Bild, 01:10 MESZ): die Kurve setzt bei 2,5 an und fällt in den ersten fünf
Minuten auf die RUC-Form um 1 mm/h — keine senkrechte Kante mehr, die Naht-Linie und ihr Text bleiben. Bild
`audit/niederschlag-ruc/2026-10-25-minutenkurve-naht-herborn-48h.jpg`. typecheck grün.

**Gate Nachtrag (25.10. 01:25 MESZ):** `npm run typecheck` grün · `verify:ruc` 130/130 · `npm run build` grün (44 s) · Budget totalJs 1910,1 ≤ 1912
(+0,1 KB gegen §12), largestChunk 278,4 ≤ 302, eagerCss 2,4 ≤ 2,5, eagerJs 110,1 > 110 unverändert (HB, §73.4 — der Exit 1 des Budget-Skripts
stammt allein daraus). Die fünf Fragen wie in §12: 1 `?mvcurve=0` ⇒ Stufen ohne Start, Zahlen unberührt; 2 ohne RUC-Schicht pixelgleich, mit
Schicht ändert sich nur die Form der ersten fünf Minuten nach der Naht; 3 keine Bedienelemente; 4 keine App-Fehler in der Konsole; 5 eine
Vergleichsoperation mehr je Render.

## 13. Detailansicht 2 | 6 | 27 h (E-RUC-14, 25.10.2026)

**Auftrag (Jan):** „der Minutenverlauf soll jetzt nur noch 2 h, 6 h und 27 h anzeigen."

**Diagnose:** Die Detailansicht bot 2 | 6 | 24 | 48 h mit Voreinstellung 48 h; Titel, KPIs („Spitze · 48 h", „Summe · 48 h"), Quellzeile und die
Reihe selbst hingen an `MV_HORIZON_H = 48`. Dieselbe Konstante bestimmt in `nowcastEngine.ts` die Zahl der Fusion-Stunden aus dem Cube
(`cubeHoursMv = MV_HORIZON_H + 1`), und `nc.fusionHours` speist auch die Ereignisse (48 h). Ein bloßes Absenken auf 27 hätte die Ereignisse
mitgekürzt (V-Regression außerhalb des Auftrags).

**Änderung:** neue Konstante `MV_VIEW_H = 27` in `minuteSeries.ts` (Horizont, den der Minutenverlauf ZEIGT); `MinuteSeriesCard.tsx` nutzt sie für
die Stufen `[2, 6, 27]`, die Voreinstellung, `horizonH` der Reihe (Spitze und Summe zählen bis +27 h), Titel, KPI-Beschriftungen, Hero-Satz
(„kein Niederschlag in den nächsten 27 h"), Quellzeile und Öffnen-Knopf; der Fußtext sagt „jenseits der 5-min-Form (Lauf + 27 h) zeigt jeder
Balken das Stundenmittel", weil die 5-min-Form bei Lauf + 27 h endet und die letzten ein bis zwei Stunden der Ansicht Fusion-Balken sind.
`timeTicks` setzt bis 30 h 3-h-Schritte (vorher 6 h ab 25 h). `MV_HORIZON_H` bleibt 48 (Engine, Ereignisse). Verifier I9 prüft Stufen,
Voreinstellung, `horizonH` und dass kein „48 h" mehr in der Kachel steht. Mini-Kachel (2 h) unverändert.
Nachbesserung aus der Sichtprüfung: in der 27-h-Ansicht liegt die zweite Naht (Lauf + 27 h) nahe am rechten Rand, ihr Text lief über den Rand;
bei weniger als 330 px Platz rechts steht er jetzt links der Naht („5-min-Form bis hh:mm · danach buscosun Fusion als Stundenmittel ▸").

**Gate E-RUC-14 (25.10. 01:45 MESZ):** `npm run typecheck` grün · `verify:ruc` 130/130 (I9 angepasst) · `npm run build` grün (39 s) · Budget totalJs
1910,3 ≤ 1912, largestChunk 278,4 ≤ 302, eagerCss 2,4 ≤ 2,5, eagerJs 110,1 > 110 unverändert (HB, §73.4). Live (Herborn, Lauf 22 UTC, 01:20 MESZ):
Titel „Minutenverlauf · 27 h", Stufen 2 h | 6 h | 27 h (27 h aktiv), KPIs „Spitze · 27 h 3,9 mm/h 02:10 Radar", „Summe · 27 h 11,3 mm", Achse in
3-h-Schritten, Radar-Naht 02:20, zweite Naht 02:00 mit Text links davon, Fusion-Balken danach bis +27 h. Bilder
`audit/niederschlag-ruc/2026-10-25-detail-27h-herborn.jpg` (vor der Nachbesserung, Text abgeschnitten) und
`audit/niederschlag-ruc/2026-10-25-detail-27h-naht-rechts-herborn.png` (danach). Ereignisse-Kachel weiter „48 h" (gesichtet).

| Frage | Beleg |
|---|---|
| 1 Funktionserhalt einzeln | 24-h- und 48-h-Stufen entfallen auf Jans Wort (E-RUC-14); Mini-Kachel 2 h, Kurve, Kante, Hinweise, Nähte unverändert; Ereignisse 48 h unverändert (`MV_HORIZON_H` bleibt 48) |
| 2 Desktop pixelgleich | Kachel pixelgleich; Overlay zeigt 27 statt 48 h (gewollt) |
| 3 Touch-Targets ≥ 44 px | Stufen-Knöpfe unverändert in Größe, einer weniger |
| 4 Konsole sauber | keine App-Fehler |
| 5 keine Long Tasks > 200 ms | weniger Arbeit (Reihe über 27 statt 48 h) |

## 14. Balken je Ebene (E-RUC-15, 25.10.2026)

**Auftrag (Jan):** „mach in der Minutenanzeige im Regenradar doch ein Balkendiagramm daraus, das macht mehr Sinn" — Rückfrage (nur RUC, alles,
Radar je Minute), Antwort: **alles als Balken**.

**Diagnose:** Drei Ebenen hatten drei Zeichensprachen (Radar: interpolierte Minutenlinie mit Fläche; RUC: Kurve/Stufen; Fusion: Stundenbalken), dazu
die Kurvenfrage V-RUC-25 (Gipfel über der KPI). Jede Ebene hat eine echte Auflösung: Radarbild alle 5 min (INCA 15 min), RUC 5-min-Summe,
Fusion Stundenmittel. Ein Balken je Einheit zeigt genau diese Auflösung und nichts Erfundenes.

**Änderung:** `minuteSeries.ts`: `radar.bars` (ein Balken je Bild über [Bild, nächstes Bild), erster an „jetzt" angeschnitten, keiner über das
letzte Bild hinaus — das letzte Bild ist das Ende, nicht ein weiterer Balken), Option `bars` ⇒ erster Regen, Spitze und Summe des Radar-Teils aus den
Bild-Balken (erster Regen = Beginn des ersten nassen Bildes statt der interpolierten Minute; Spitze identisch, Summe Σ Bild × Dauer statt Σ Minute/60);
Schalter `minuteBarsEnabledFrom` (`?mvbars=0`). `MinuteChart.tsx`: Prop `bars` (an), Radar-Balken (`mv-bar--radar`, 0,46), RUC-Balken je 5 min
(`mv-bar--ruc`, 0,30), Fusion-Balken heller (`mv-bar--fusion`, 0,16); 1-px-Lücke nur ab 6 px Balkenbreite (im 27-h-Blick liegen 324 RUC-Balken auf
≈ 800 px, sie bilden dann eine geschlossene Fläche); Linie, Fläche und Kurve nur ohne `bars`; Hover nennt „Bild hh:mm (alle 5 min), gilt bis hh:mm",
„jetzt"-Punkt auf dem Bild-Balken; Naht- und Aria-Texte „Radar · Bild alle 5 min" statt „minutengenau" (`radarRes`; mit `?mvbars=0` die alten
Literale, I1 angepasst). `MinuteSeriesCard.tsx`: liest den Schalter, reicht `bars` an Reihe und beide Diagramme, Hero „Radar, Bild alle 5 min",
Quellzeile „ein Balken je Bild" / „ein Balken je 5 min", Fußtext endet mit „Nichts ist interpoliert." Kurve (E-RUC-13) und weicher Start bleiben
hinter `?mvbars=0` als benannter Rückfall (Rule 2); V-RUC-25 ist mit Balken gegenstandslos (kein Gipfel über der Spitze möglich).

**Belege (Block L, `verify:ruc` 136/136):** L1 24 Balken aus 25 Bildern, lückenlos von jetzt bis zum letzten Bild, Wert = Bild am Balkenanfang;
L2 mit Balken erster Regen 08:25 (Bild 08:20 ist 0,08 < 0,1), ohne Balken 08:21 (interpolierte Minute), Spitze gleich, Summe Σ Bild × Dauer;
L3 `bars: false` byte-gleich zur Reihe ohne Option; L4 Schalter; L5/L5b Verdrahtung mit Gegenprobe; I1 (Naht-Literale über `radarRes`) und K11
(Quellzeile) angepasst.

**Gate E-RUC-15 (25.10. 02:10 MESZ):** `npm run typecheck` grün · `verify:ruc` 136/136 · `npm run build` grün (38 s) · Budget totalJs 1911,8 ≤ 1912
(+1,5 KB gegen §13 — die Balkenpfade kommen zur bestehenden Linie/Kurve hinzu, die hinter `?mvbars=0` bleibt; nur noch 0,2 KB Luft, die nächste
Änderung am Regenradar-Chunk hebt die Ratsche mit Notiz), largestChunk 278,4 ≤ 302, eagerCss 2,4 ≤ 2,5, eagerJs 110,1 > 110 unverändert (HB, §73.4).
Live (Herborn, Lauf 22 UTC, 01:50 MESZ): Kachel und Detailansicht als Balken — Radar (dunkel) bis 02:50, 5-min-Balken des RUC bis 02:00, hellere
Fusion-Balken danach; Spitze „4,3 mm/h 02:25 Radar" = höchster Radar-Balken; Hover 02:59 „1,9 mm/h · DWD RADOLAN-RV · Bild 02:55 (alle 5 min), gilt
bis 02:00" — richtig, in dieser Nacht springt die Uhr um 03:00 MESZ auf 02:00 MEZ zurück. Mit `?mvbars=0` Linie + Kurve wie vor E-RUC-15 (gesichtet).
Bilder `audit/niederschlag-ruc/2026-10-25-balken-herborn-27h.jpg`, `audit/niederschlag-ruc/2026-10-25-balken-hover-herborn.png`.

| Frage | Beleg |
|---|---|
| 1 Funktionserhalt einzeln | `?mvbars=0` ⇒ Reihe byte-gleich (L3), Linie/Kurve/Nähte/Texte wie vorher (I1, K11 angepasst, gesichtet); Kante, Hinweise, Streifen, Ereignisse, Pin unberührt |
| 2 Desktop pixelgleich | gewollt anders (Balken); Rückfall pixelgleich |
| 3 Touch-Targets ≥ 44 px | keine Bedienelemente berührt |
| 4 Konsole sauber | keine App-Fehler (nur die Meldungen der Chrome-Erweiterung) |
| 5 keine Long Tasks > 200 ms | ≤ 24 + 324 + 27 `<rect>` je Render, keine Kurvenrechnung mehr im Balkenmodus |

## 15. buscosun Fusion 14 — ICON-D2-RUC als Niederschlags-Member (E-RUC-16, 26.10.2026)

**Auftrag (Jan, 26.10.):** „ich möchte ein neues buscosun fusion 14 releasen, einzige änderung: es soll icon ruc inkludiert haben bei der
beimischung. mische es so über den zeitraum bis 27 h bei dass es die besten ergebnisse erzielt." Rückfrage, weil „beste Ergebnisse über
0–27 h" mit den Daten nicht messbar ist (RUC seit 23.10. 10 UTC, Stationsreihen `ruc/v1/stations` nur 0–12 h, kein RUC im Hindcast und
damit nicht im Prüfstand); Jans Wahl: **„Bauen, fitten, einschalten"** — ρ-Kurve 1–12 h an den Stationsreihen gegen W1 fitten, 13–27 h als
gesetzten Auslauf, Gegenprobe gegen Fusion 13, wenn nirgends schlechter live als Fusion 14 (Muster E-OF-15, ohne Spur P), `?rucm=0` = 13.

**15.1 Bau (Motor, `src/pointForecast/`):** `SourceFamily` + `CubeProduct` `ruc`; `CubeFusionInput.ruc: RucPointSeries | null`;
`FuseCubeOptions.rucMember: 0 | 1 | 2`; je Stunde t ein Sample `icon_d2_ruc` (Familie `ruc`, nur Niederschlag) = Mittel der 5-min-Raten in
(t − 60 min, t] des neuesten Laufs (≥ `RUC_MEMBER_MIN_STEPS` 10 Intervalle, sonst keine Stunde), Member-Eintrag mit Lauf/Alter/Intervallen;
Priors `ACC.precipitation.ruc`, `ACC.precipOcc.ruc` (Fit, unten), `CORR_PAIRS` `ruc|ruc` 0,80 · `ruc|nowcast` 0,45 · `ruc|highres` 0,60 ·
`ruc|mosmix` 0,50 · `ruc|global` 0,40 · `ruc|obs` 0,20 (GESETZT, nicht gemessen), `AMPLITUDE` 1, `FOOTPRINT_FALLBACK_M` 2 500; Leser-Anbindung in
`getPointForecastFromCube` (`loadRucPoint`, nur mit `CubeIo.rucMember` + Gray-Decoder + Radar-Pfad, `priority: 'low'`, progressiv wie der
Radar-Member); Schalter `pfRucMemberFrom` (`?rucm=0`), Variantenschlüssel `rucm`/`rucm0`; Register `fusionRelease.ts` Eintrag `n: 14`
(`FUSION14_RUC_MEMBER`, `io: { key: 'rucMember', set: true }`, `needs: 'ruc'`); Dashboard-Label „ICON-D2-RUC", Farbe `#A3B08A`;
Options-Note und Ergebnis-Note nennen den Member und die Stunden („… ⇒ Niederschlag wie der Stand davor, ohne RUC-Member", wenn die Reihe
fehlt). Alles andere (T, Td, Wind, Böe, Wolken, jede Stunde ohne RUC-Wert) rechnet byte-gleich zu Fusion 13 — der Member liefert nur
`precipitation`, alle anderen Felder `null`.

**Modus 1 → Modus 2 (Befund während des Fits):** im ersten Gitter (20 Mengen-Kurven, Modus 1) zählte JEDE Kurve gleich (CRPS 0,1341,
Brier 0,0949). Ursache: die gelernte Hürde (`learnedPrecip`, V-FL-18) ersetzt die K-2-Verteilung, sobald kein Radar-/Stationsmember trägt —
der RUC-Member kam nur über sein pDry-Merkmal zum Zug, die ρ-Kurve war wirkungslos. Darum `rucMember: 2`: eine RUC-Stunde behält K-2 wie eine
Radar-Stunde (gleiche Bedingung in `learnedPost.precipKept` und `precipCal`-Situation). Probe auf 2 Slots: Modus 2 mit schwacher
Mengen-Kurve −2,2 %, mit starker (0,88 / 48 h) +3,8 % schlechter ⇒ die Kurven greifen.

**15.2 Fit — eingefrorene Regel** (Kopf von `audit/niederschlag-ruc/2026-10-26-fit-ruc-f14.mjs`, vor dem ersten Lauf geschrieben):
Paare = Station s (Prüfnetz P1, 364 von 365 in der RUC-Reihe) × Hindcast-Slot t0 (3-stündlich) × Vorlauf L = 1 … 11 h; RUC-Lauf = t0 − 1 h
(sonst t0 − 2 h); ein Paar zählt nur mit Wahrheit rr(t0 + L) in W1 UND vollständiger RUC-Stunde (12 Intervalle). DERSELBE Paarsatz misst die
Basis (`rucMember: 0` = Fusion 13 als Register `fusion-12x`) und jeden Kandidaten. Score = mittlerer CRPS des Niederschlags-Quantilsatzes
(Prüfstand-Score), zweite Zahl Brier von P(nass) gegen rr ≥ 0,1 mm/h; je Vorlaufklasse 1–3 / 4–6 / 7–11 h und je Land. **Verdikt = der
Kandidat mit dem niedrigsten CRPS 1–11 h unter denen, die in keiner Vorlaufklasse schlechter als die Basis sind.** 13–27 h wird nicht
gemessen. Daten: Slots 23.10. 12 UTC – 26.10. 12 UTC (23 Slots; 24.10. 18/21 UTC fehlen im Hindcast, 23.10. 00–09 UTC ohne RUC-Lauf), W1 bis
26.10. unreif gebaut, **82 470 Paare**. Gitter B (12 Kandidaten, `…-gitter.json`): Modus 1 mit vier Vorkommens-Kurven; Modus 2 mit
Mengen-Kurven ρ₀ 0,45–0,72 / τ 6–12 h bei Vorkommen 0,88 / 30 h, dazu 0,55 / 6 h mit Vorkommen 0,82 / 15 h und 0,94 / 30 h. Ein serieller
Prozess (≈ 3 min je Kandidat, drei parallele Läufe hatte der Speicherwächter abgebrochen), über `scripts/hindcast/detach.ps1`, 44 min.

**15.3 Ergebnis** (`…-ergebnis.json`, Tabelle `…-tabelle.txt`; Gewinn in % gegen Fusion 13, positiv = besser):

| Kandidat | Modus | Menge ρ₀/τ | Vorkommen ρ₀/τ | CRPS 1–11 h | 1–3 h | 4–6 h | 7–11 h | Brier 1–11 h | Brier 7–11 h |
|---|---|---|---|---|---|---|---|---|---|
| Basis Fusion 13 | 0 | — | — | 0,1361 | 0,1339 | 0,1344 | 0,1387 | 0,0995 | 0,1025 |
| m1-o088-t30 (bester Modus 1) | 1 | 0,80 / 24 | 0,88 / 30 | +1,47 % | +2,27 | +1,27 | +1,09 | **+4,67 %** | +3,57 |
| m2-a055-t06 | 2 | 0,55 / 6 | 0,88 / 30 | +2,27 % | +4,70 | +1,04 | +1,46 | −0,13 % | −3,25 |
| m2-a065-t12 (bester bei 0,88) | 2 | 0,65 / 12 | 0,88 / 30 | +2,51 % | +5,45 | +1,14 | +1,46 | −0,12 % | −3,29 |
| m2-a055-t06-o082-t15 | 2 | 0,55 / 6 | 0,82 / 15 | −0,01 % (4–6 h −1,16 ⇒ verworfen) | +2,13 | −1,16 | −0,67 | −4,83 % | −8,26 |
| **m2-a055-t06-o094-t30 — Verdikt** | **2** | **0,55 / 6** | **0,94 / 30** | **+3,19 % (0,1318)** | **+6,23** | **+1,90** | **+2,03** | **+1,46 %** | **−1,96** |

Je Land (Verdikt, CRPS 1–11 h): DE +2,94 % (1–3 h +6,19, 4–6 h +1,34, 7–11 h +1,70), AT +3,03 % (+6,07 / +2,59 / +1,61), CH +3,74 %
(+6,41 / +2,42 / +2,88) — kein Land, keine Klasse schlechter. Brier je Land: DE +2,65 %, CH +2,16 %, AT −2,05 % (7–11 h −5,47 %). Die
Mengen-Kurven 0,45–0,72 unterscheiden sich um ≤ 0,3 % (die Menge des RUC ist so verrauscht wie die von ICON-D2; sein Wert ist das
Vorkommen und das Timing in den ersten Stunden); die Vorkommens-Kurve entscheidet (0,82 → 0,88 → 0,94: ±0 → +2,3 → +3,2 %).

**Grenzen (ehrlich):** (1) vier Herbsttage, ein Frontregen (23./24.10.) und ruhige Tage — eine Stichprobe, kein Spur-P-Urteil; der Prüfstand
kann Fusion 14 nicht replayen, solange der Hindcast keinen RUC trägt (V-RUC-11 bleibt offen). (2) 13–27 h GESETZT: dieselbe Kurve läuft aus,
`maxLeadH` 27 mit Taper-Fenster ≈ 4 h, kein Messwert (Stationsreihen enden bei 12 h, V-RUC-27). (3) Brier 7–11 h +2,0 % schlechter (AT
+5,5 %) — V-RUC-26 mit Skizze „Modus 3". (4) `CORR_PAIRS` der Familie sind gesetzt. (5) W1 für 25./26.10. unreif (Nachträge möglich).
(6) Der Hindcast-Replay rechnet ohne Radar-Member und ohne Anker (wie V-RUC-23) — live stehen in 0–2 h Radar und Messung neben dem RUC, dort
ist der Gewinn kleiner als 1–3 h hier sagt.

**15.4 Umsetzung des Verdikts:** `priors.ts` `ACC.precipitation.ruc = { rho0: 0.55, tauH: 6, k: 1, maxLeadH: 27 }`, `ACC.precipOcc.ruc =
{ rho0: 0.94, tauH: 30, k: 1, maxLeadH: 27 }`; `FUSION14_RUC_MEMBER = 2`; `fusionStage()` nennt „buscosun Fusion 14", `FUSION_CURRENT` 14,
`?rucm=0` = Fusion 13 (kein Fetch, Register-Schalter `rucMember: false`). Ohne Produkt am Punkt (kein `latest.json`, Lauf > 3 h alt, außerhalb
t1, Chunk fehlt) rechnet der Motor exakt Fusion 13 und sagt es in der Ergebnis-Note.

**Gate E-RUC-16 (26.10. abends):** `npm run typecheck` grün · `verify:fusion-release` 30/30 (B2: keine feste Standnummer außerhalb des
Registers — die Noten in `cubeSource.ts` sagen „Phase RUC, E-RUC-16" und „wie der Stand davor") · kein Build/Budget (keine neue Abhängigkeit,
kein neuer Chunk; Jans Sessionregel) · kein Browser-Beleg (Sessionregel). Lokal committet, kein Push (§78 in `MANUELLE-SCHRITTE.md`).

| Frage | Beleg |
|---|---|
| 1 Funktionserhalt einzeln | `?rucm=0` ⇒ `CubeIo.rucMember: false`, kein RUC-Fetch, Motor ohne `input.ruc` = Fusion 13 (Code-Pfad: `useRucMember = rucOpt && !!input.ruc`); nur `precipitation`/`precipOcc` lesen die Familie |
| 2 Desktop pixelgleich | keine UI-Änderung außer Standname und Dashboard-Label „ICON-D2-RUC" in der Herkunft |
| 3 Touch-Targets ≥ 44 px | keine Bedienelemente berührt |
| 4 Konsole sauber | nicht im Browser geprüft (Sessionregel) — offen für Jans Sichtprüfung mit `?pflog=1` (Note `rucMember: ICON-D2-RUC-Member an N Stunden`) |
| 5 keine Long Tasks > 200 ms | ein zusätzlicher Chunk-Abruf (`priority: 'low'`), eine Spalte dekodiert; nicht gemessen (V-RUC-17 gilt weiter) |

**15.5 Wege je Feature (Jan 26.10.: „schauen, dass buscosun Fusion 14 im Dashboard und Regenradar aktiv ist sowie in allen anderen
Features") — am Code geprüft, nicht im Browser.** Der Name kommt überall aus dem Register (`verify:fusion-release` C1, 15 Teile); ob der
RUC-Member tatsächlich rechnet, hängt am Weg: `CubeIo.rucMember` (setzt `fusionStageIo`), ein Gray-Decoder und ein Store, der `ruc/v1`
erreicht. Die Kopplung an den Radar-Pfad (`includeRadarNowcast`) wurde heute entfernt — der Member läuft in jedem Teil, der den Cube abfragt.

| Feature | Aufruf | RUC-Member |
|---|---|---|
| Punkt-Panel | `PointForecastPanel.tsx`, `pointSource: 'cube'`, Radar an, `defaultCubeIo()` | **an** |
| Wetter-Dashboard | `dashboard/data/forecastStore.ts`, Radar an, `defaultCubeIo()`; Herkunft nennt „ICON-D2-RUC" | **an** |
| Regenradar (Streifen, Minutenverlauf, Ereignisse, Pin) | `nowcast/nowcastEngine.ts`, Radar an; die 5-min-Form (`rucSeries.ts`) passt sich an Stundensummen an, die den Member schon tragen | **an** |
| Regenradar — Punktansicht am Mauszeiger (P3D) | `nowcast/pointProbe/usePointProbe.ts`, `includeRadarNowcast: false` (kein Radar-Abruf je Hover) | **an** seit heute (vorher am Radar-Pfad hängend); ein Chunk-Spaltenabruf je 0,05°-Zelle, `priority: 'low'` |
| Niederschlagssummen, Regenchance, Zell-Hinweis, Schneeankunft, Höhen-Zeit-Schnitt | `getPointForecast(…, pointSource: 'cube', includeRadarNowcast: true)` | **an** |
| Routenplaner, Eventplaner, Vertikalschnitt/3D/Föhn, Benachrichtigungen | `getFusionForecast` (`fusionForecast.ts`, Radar an) | **an** |
| Streckenprognose `road/fc` (Producer, Node) | `scripts/road/road-forecast.mjs` `makeIo` = `fusionStageIo()` + Decoder + `dirStore(Checkout)`; der Workflow checkte `point`, `radar/img`, `road` aus — **ohne `ruc`** ⇒ Niederschlag wie Fusion 13 unter dem Namen 14 | **an nach Kopie der Vorlage**: `workflow-road-fc.yml` checkt jetzt auch `ruc` aus (`verify:road-fc` E3 angepasst); Kopie ins Daten-Repo = Jan (§78) |
| Kartenfelder `point/field` (Producer) | `build-point-fields.mjs`: seit heute abends liest `rucReader` je t1-Zelle die RUC-Spalte mit dem Client-Leser (`loadRucPoint`, Zeiger `ruc/v1/latest.json` neben `point/` im Checkout) und gibt sie als `cellInput({ ruc })` an `fuseCubePoint`; t2/t3 liegen jenseits +27 h (Grund im Manifest). Manifest `chain.options.ruc` = Lauf, Alter, Zellen mit Reihe — oder der Grund, warum keiner rechnet; Log „RUC-Member an N" | **an nach Kopie der Vorlage** (Jan 26.10. abends: „schalte es da auch an"): `workflow-point.yml` t1-Job checkt `ruc` aus (`sparseCover` deckt weiter alle Publish-Pfade); Kopie ins Daten-Repo = Jan (§78). Etikett bleibt „Modell · Cube" (F1) — V-RUC-29 |
| Seewetter-Spots, Gletscher-Schmelze (Producer, Node) | `makeIo` trägt Schalter und Decoder; die Cube-Checkouts (`workflow-sea.yml`, `workflow-glacier-melt.yml` + `gen-workflows.py`) holen jetzt `point ruc` | **an nach Kopie der Vorlagen** — Werte bleiben byte-gleich (nur Wind bzw. T gelesen), der Lauf nennt den Stand ehrlich; Preis: ein Chunk je Spot/Gletscherpunkt aus dem Checkout, kein Netz |
| Autobahnwetter-Seite, Seewetter-Seite | lesen die Dateien; nennen den Stand der DATEI | folgt dem Producer |

Befund dazu: V-RUC-28 (§8, umgesetzt 26.10. abends), V-RUC-29. Gate: `npm run typecheck` grün · `verify:fusion-release` 30/30 ·
`verify:road-fc` (E3 mit `ruc`) · Feld-Leser gegen die RUC-Fixture (`scripts/lib/fixtures/ruc`, Lauf 2026102305, Chunk 02_13): Zelle
(40, 215) ⇒ Spalte 135, 324 Intervalle, 85 nass; Zelle in einem fehlenden Chunk ⇒ `null`; Lauf 4 h alt ⇒ „älter als 3 h"; `sparseCover`:
jeder Job des Punkt-Workflows deckt weiter alle Publish-Pfade.
