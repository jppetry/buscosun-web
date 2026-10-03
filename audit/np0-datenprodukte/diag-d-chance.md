# NP-0 Diagnose D — Regen-Chance des Kartenfelds (D-NP0-10, D-NP0-12, Grundlage für E-NP0-4)

> Stand 2026-10-03, Fork D der NP-0-Diagnose. Nur gelesen und gemessen: kein Eingriff in `src/`, `scripts/`, buscosun Fusion,
> `C:\dev\buscosun-data`, `C:\dev\buscosun-archiv`. Messskripte: `diag-d-np0-chance.mjs` (Karte), `diag-d-np0-cost.mjs` (Kosten);
> Ergebnis `diag-d-chance.json`, Lauf-Log `diag-d-chance.log`.

## 0. Kurzfassung

1. **F1 ist ohne Änderung am Motor aufrufbar:** `fuseCubePoint` (unverändert) mit einem Eingang je Zelle — Cube-Reihe der Zelle,
   `station: null`, `nowcast: []`, `obs: null`, Klimatologie (`ClimaField`), gelernte Tabellen, Optionen der Stufe fs. Beleg: F1 aus
   dem Archiv neu gerechnet stimmt mit Fusion 8 ohne Station (Karte `score\2026-10-02-f8r-b`, Modus L, `mem = 0`) an **98,9 %** von
   191 529 Zeilen auf die Rundung der Karte (4 Stellen) überein, Brier gleich (Δ 0,0–0,3 %). **`precipCal` ist in Fusion 8 aus** —
   die Kette ist K-2 → gelernte Hürde, nicht „… → `precipCal`" (Plan §1.1/§4 korrigieren).
2. **Pflicht-Eingänge, die eine Zelle nicht von selbst hat:** ein Gelände-Block mit `scales.sampledCount > 0` (sonst rechnet der
   Motor **gar keine Verteilung**, `geometryOk`), eine Höhe `elevationM`. Vom Gelände wirkt auf die Regen-Chance nur `tpi2000`
   (Auftreten) bzw. `tpi2000`, `slope`, Wald-Anteil (Menge): mit neutralem Gelände ändert sich p um Median 0,0001, p99 0,0074, max 0,047;
   Brier gleich (≤ 0,1 %).
3. **Kosten je Zelle (volle Kette, alle Größen, unter Fremdlast 84 % CPU):** t1 9,9 ms (47 native Schritte), t2 3,8 ms, t3 7,3 ms ⇒
   t1-Gitter 48 441 Zellen ≈ **8 min lokal, ≈ 16 min Runner** (Faktor 2) einfädig; `fuseHour` allein spart nur die Hälfte.
   Das Zeitbudget (E-NP0-5: Feldschritt t1 ≤ 4 min) trägt F1 **nur mit Parallelität (Worker) und/oder Zellmaske**.
4. **Messung (Archiv 16.09.–01.10., 15 Ausgabetage, 389 Stationspunkte, Vorlauf 3–48 h, 219 538 Zeilen, Wahrheit Stationsstunde
   ≥ 0,1 mm):** F1 schlägt die Klimatologie um 17–30 % Brier und F2 (Spread-Verteilung) um 19–25 %; **F2 ist grob überkonfident**
   (p ≥ 0,9 ⇒ beobachtet 38–60 %) und bei 3–6/25–48 h schlechter als die Klimatologie. F3 (nur Menge, 0/1) ist am schlechtesten.
   **Überraschung:** K-2 allein (F0, ohne gelernte Hürde) ist 0,5–4,8 % besser als F1 (3–6/25–48 h roh p 0,02–0,03, nach BH n. s.,
   15 Tage) und besser kalibriert; F1 ist im Mittel zu nass (p̄ 5,6–6,9 % gegen 3,3–3,7 % Basisrate). Fusion 8 an der Station (F8S)
   ist 8 % besser als F1 — die Station trägt.
5. **Empfehlung E-NP0-4: F1** — die Chance, die Fusion 8 an einem Ort ohne Station zeigt (|Δ| zu F8L 0,004–0,007), klar vor F2;
   Bedingung: Parallelität im Feldschritt. F0 als benannte Alternative (billiger, gemessen etwas besser, aber weiter vom Ort weg:
   |Δ| zu F8L 0,017–0,035). Der Befund F0 ≥ F1 gehört an die Fusion-Linie (V-NP0-D2), nicht in diese Phase.

## 1. D-NP0-10 — wie Fusion 8 die Regen-Hürde ohne Station und Radar rechnet

### 1.1 Kette (am Code, Stand `HEAD` 03.10.)

| Schritt | Ort | Was |
|---|---|---|
| Stufe fs | `cubeSource.ts` `forecastFromBundle` (≈ Z. 2310) | mit Tabellen: `learnedSpeed`, `learnedPrecip`, `learnedAtPoint`, `learnedClouds`, `priorShrink: false`, `anchorWindKm: 10`, `nowcastHourMean` (Fusion 8). **Kein `precipCal`** — `io.precipCalSource` ist in `defaultCubeIo()` nicht gesetzt (`'none'`), `stageFuse` nennt es nicht |
| Cube-Member | `cubeSampleOf` | `precipitation` = Ebene `precip` der Zelle (2×2-Block PAP 3 am Punkt; an der Zellmitte = die Zelle), σ_div/σ_ens aus `precip_sd`/`precip_sd_ens` |
| K-2 | `fuse.ts` `fuseHour` Z. 787–850 | Auftreten im Probit-Latentraum: Prior N(−θ, 1), θ = Φ⁻¹(1 − p₀), p₀ = 1 − (1 − wetProbDaily)^(1/6) aus `ClimaField` (`public/climaGrid.json`, am Ort, Tag, Höhe); Quelle über die Klimatologie-cdf ins Latent, `ACC.precipOcc`, Repräsentanz nur aus Footprint und Distanz (`fuse.ts` Z. 228). Menge lognormal, geschrumpft zur Nassstunden-Klimatologie. Ergebnis `hurdleLogNormal {pDry, μ, σ}` |
| gelernte Hürde | `cubeSource.ts` Z. 1546–1555 → `predict.ts predictPrecip` | nur, wo **kein Radar- und kein Stationsmember** Niederschlag trägt (im Feld immer): Auftreten logistisch auf `occurrenceDesign` = [1, ln1p P̄, wetShare = σ_div/(P̄+0,1), ln1p σ_div, **tpi2000**, Jahres- und Sonnenstunden-Harmonische (Länge), leadFrac, **logit(1 − pDry_K2)**]; Menge `amountDesign` = [1, ln1p P̄, ln1p σ_div, tpi2000, slope, Wald-Anteil]. Ohne geschriebenes Stratum bleibt K-2 |
| Strata | `fusion.client.json` (Fit 5e) | Form K, Route 1: Bins 0–4 (0–240 h) geschrieben, **Bin 5 (246–336 h) `no-skill` ⇒ dort bleibt K-2**; Route-1-Falten nur 2026-06b…09b (Sommer, V-FV-1) |
| danach | Stationswert, Bewölkung | wirken nicht auf Niederschlag |

### 1.2 Eingänge je Zelle (was der Producer liefern muss)

| Eingang | wofür | im Producer |
|---|---|---|
| Cube-Reihe der Zelle (`precip`, `precip_sd`, `precip_sd_ens`, dazu alle Ebenen, die der Motor für die übrigen Größen liest) | K-2, Hürde | vorhanden (frisch gebauter Lauf) |
| `ClimaField` (`public/climaGrid.json`) | p₀ (wetProbDaily) | im buscosun-web-Klon vorhanden |
| gelernte Tabellen `point/fusion.client.json` | Hürde | Daten-Repo; dieselbe Datei wie die Clients (sonst sagt die Karte nicht, was der Ort sagt) |
| `learnedClima` (Klimatologieprodukt) | nur T/Td/Wind (μ_c) | für die Chance **nicht nötig** |
| `elevationM` | Pflicht (`hTrue`) | Zellhöhe (Modellhöhe `hModEff` oder DEM-Mittel) |
| `terrain` mit `scales.sampledCount > 0` | **Pflicht**, sonst `fuseAt` ⇒ null, keine Verteilung | Ring-Geometrie gibt es nur aus Terrarium am Punkt (`point/client/terrain.ts`); für die Zelle synthetisch oder vorab gerechnet |
| `tpi2000`, `slopeDeg`, Wald-Anteil | Hürde (Auftreten/Menge) | gemessen fast wirkungslos (§2.3, F1n) ⇒ neutral zulässig, benannt |
| Station, Radar, Messung | — | `null` / `[]` (Definition des Felds) |

**Aufrufbar ohne Änderung:** ja — `fuseCubePoint(input, stageFsOptions)` mit diesem Eingang je Zelle; F1 gegen Fusion 8 ohne Station
s. §2.4. Ein niedrigerer Einstieg (`fuseHour` + `predictPrecip`, beide exportiert) ist möglich, verlangt aber im Producer neuen
Klebe-Code (Kontext, Situation, `buildZ`) mit eigenem Gleichheitsbeweis — und spart nur ≈ die Hälfte (§1.3).

### 1.3 Kosten je Zelle (`diag-d-np0-cost.mjs`, Slot 01.10., 200 Punkte, zweiter Durchlauf nach JIT-Aufwärmung)

Gemessen **unter Fremdlast** (CPU 84 %, 14 node-Prozesse — parallele NP-0-Forks); Solo-Werte sind kleiner. Volle Kette = alle
Größen, nicht nur Niederschlag (der Motor rechnet je Stunde alles).

| Stufe | native Schritte | `fuseCubePoint` ms/Zelle (Median / Mittel / p90) | `fuseHour` allein ms/Zelle | Zellen | Hochrechnung einfädig lokal | × 2 Runner |
|---|---|---|---|---|---|---|
| t1 | 47 | 8,6 / 9,9 / 13,6 | 4,3 / 6,3 | 48 441 | ≈ 480 s (8 min) | ≈ 16 min |
| t2 | 22 | 3,4 / 3,8 / 5,3 | 1,7 / 2,0 | 12 221 | ≈ 46 s | ≈ 1,5 min |
| t3 | 34 | 5,8 / 7,3 / 10,2 | 2,9 / 4,0 | 2 009 | ≈ 15 s | ≈ 0,5 min |

Im Archiv-Lauf (gleiche Last): F1 9,6 ms je Punkt-Lauf (48-h-Fenster), F0 (K-2 ohne Lernstufe) 5,7 ms. **Folgerung für
D-NP0-13/E-NP0-5:** t1 passt mit F1 nicht in 4 min Runner einfädig. Hebel: Worker-Threads (GitHub-Runner 4 vCPU ⇒ ≈ 4–5 min),
Zellmaske (nur Zellen mit DACH-Bezug), (b′) t1 nur jeden zweiten Lauf. Ohne Hebel ⇒ F3/F0 oder STOPP.

## 2. D-NP0-12 — Messung der Chance-Kandidaten

### 2.1 Aufbau

- **Datenbasis:** die Karte der Fusion-8-Entscheidung `C:\dev\buscosun-hindcast\score\2026-10-02-f8r-b\rows.jsonl.gz` (Ausgabe-Slots
  16.09.–01.10., 15 Ausgabetage mit Wahrheit, 389 DACH-Stationspunkte), Stufe t1, Vorlauf 3–48 h, Zeilen mit Niederschlagswahrheit:
  **219 538** (alle verbunden, 0 Motorfehler). Der Cube kommt aus den Archiv-Slots (`C:\dev\buscosun-archiv`, nur gelesen, Schema 1–4):
  das Archiv hält je Punkt und Stufe die **nächste Zelle** (`archiveSeries`) — genau den Wert, den das Feld an dieser Zelle trüge;
  die Kandidaten sind also am Punkt mit dem Gelände des Punkts gerechnet, F1n zeigt den Unterschied zum neutralen Gelände.
- **Wahrheit — Korrektur am Auftrag:** der Scorer nimmt **nicht** die Radar-Analyse, sondern die **Stationsstunde** (`rr`, ≥ 0,1 mm,
  `stack-score.mjs` `WET_MM`), Netz je Land (DE POI, AT TAWES, CH SMN). Radar-Analysen liegen im Archiv nur zum Slot (einmal täglich)
  und taugen nicht als Stunden-Wahrheit für 3–48 h. p_wet einer Hürde = 1 − pDry (wie `pWetOf` im Scorer).
- **Tabellen:** Fit 5e mit Atomen `fit\2026-09-30-ax4\fusion.ax4.json` (sha 1ee84cab689e, dieselbe wie F8r der Karte), Falten-Schlüssel
  wie `stack-extract.mjs` (Ausgabe ≤ 21.09. ⇒ zurückgehaltene Halbmonatsfalte, danach volle Tabelle = außerhalb des Fits).
- **Kandidaten:** F1 (Kette, Cube allein), F1n (F1 mit neutralem Gelände: tpi 0, Hang 0, ohne Landbedeckung), F0 (Motor ohne
  Lernstufe = K-2 allein), F2 (zensierte Normal N(μ = `precip`, σ = √(σ_div² + σ_ens²)), P(X ≥ 0,1), `dist.ts cdfOf`), F2d (nur σ_div),
  F3 (Mittel ≥ 0,1 als 0/1 — was eine reine Mengenkarte nahelegt), CL (Klimatologie-Prior des Motors, stündlich), F8S/F8L (Fusion 8
  aus der Karte, Modus S = Punkt ist Station, Modus L = ohne die eigene Station), F8L0 (F8L mit `mem = 0`, kein Nachbar als Member),
  flK (Lernstufe allein aus der Karte — Gegenprobe).
- **Signifikanz:** Brier-Paare je Ausgabetag, DM/HLN mit Student-t, Moving-Block-Bootstrap 90 % (`lib/stats.mjs`), BH über alle 45
  Paar-Tests. Mit 15 Tagen ist kein Paar nach BH signifikant — die Bootstrap-Intervalle geben die Richtung.

### 2.2 Ergebnis (Schicht all)

| Bin | n | nass | Kandidat | Brier | BSS gg. Klima | p̄ | \|p − F8S\| | \|p − F8L\| |
|---|---|---|---|---|---|---|---|---|
| 3–6 h | 21 126 | 698 (3,3 %) | **F1** | 0,02675 | **0,184** | 0,056 | 0,034 | **0,006** |
| | | | F1n | 0,02674 | 0,184 | 0,056 | 0,034 | 0,007 |
| | | | F0 | 0,02559 | 0,219 | 0,040 | 0,024 | 0,017 |
| | | | F2 | 0,03258 | 0,006 | 0,042 | 0,033 | 0,040 |
| | | | F3 | 0,04677 | −0,427 | 0,048 | 0,047 | 0,058 |
| | | | CL | 0,03278 | 0 | 0,061 | 0,073 | 0,072 |
| | | | F8S | 0,02455 | 0,251 | 0,033 | 0 | 0,029 |
| | | | F8L | 0,02658 | 0,189 | 0,052 | 0,029 | 0 |
| 7–24 h | 94 647 | 3 529 (3,7 %) | **F1** | 0,02563 | **0,297** | 0,057 | 0,037 | **0,004** |
| | | | F1n | 0,02565 | 0,297 | 0,057 | 0,037 | 0,004 |
| | | | F0 | 0,02550 | 0,301 | 0,038 | 0,022 | 0,019 |
| | | | F2 | 0,03058 | 0,162 | 0,045 | 0,034 | 0,049 |
| | | | F3 | 0,04295 | −0,177 | 0,051 | 0,046 | 0,064 |
| | | | CL | 0,03649 | 0 | 0,061 | 0,072 | 0,062 |
| | | | F8S | 0,02361 | 0,353 | 0,031 | 0 | 0,033 |
| | | | F8L | 0,02557 | 0,299 | 0,054 | 0,033 | 0 |
| 25–48 h | 103 765 | 3 550 (3,4 %) | **F1** | 0,02806 | **0,172** | 0,069 | 0,049 | **0,006** |
| | | | F1n | 0,02807 | 0,172 | 0,069 | 0,049 | 0,007 |
| | | | F0 | 0,02672 | 0,212 | 0,030 | 0,018 | 0,035 |
| | | | F2 | 0,03497 | −0,032 | 0,042 | 0,036 | 0,066 |
| | | | F3 | 0,04641 | −0,369 | 0,045 | 0,043 | 0,078 |
| | | | CL | 0,03390 | 0 | 0,061 | 0,066 | 0,042 |
| | | | F8S | 0,02583 | 0,238 | 0,023 | 0 | 0,044 |
| | | | F8L | 0,02795 | 0,175 | 0,063 | 0,044 | 0 |

**Brier-Skill gegen F1** (positiv = Kandidat besser; DM-p roh / BH; Bootstrap 90 %):

| Paar | 3–6 h | 7–24 h | 25–48 h |
|---|---|---|---|
| F2 gegen F1 | −21,8 % (0,073 / 0,15; −28…−14) | −19,3 % (0,21 / 0,28; −28…−3) | −24,7 % (0,21 / 0,28; −37…0) |
| F3 gegen F1 | −74,9 % (0,043 / 0,14) | −67,5 % (0,056 / 0,15) | −65,4 % (0,095 / 0,16) |
| F1 gegen Klima | +18,4 % (0,066 / 0,15; 11…27) | +29,7 % (0,071 / 0,15; 19…41) | +17,2 % (0,096 / 0,16; 11…24) |
| F0 gegen F1 | +4,3 % (0,027 / 0,14; 2…7) | +0,5 % (0,83 / 0,91; −2…4) | +4,8 % (0,022 / 0,13; 2…13) |
| F8S gegen F1 | +8,2 % (0,021 / 0,13; 5…15) | +7,9 % (0,12 / 0,18; 2…14) | +7,9 % (0,021 / 0,13; 4…17) |
| F8L gegen F1 | +0,6 % | +0,3 % | +0,4 % |
| F1n gegen F1 | 0,0 % | 0,0 % | 0,0 % |

**Zuverlässigkeit** (Klasse: n : vorhergesagt / beobachtet in %, Auszug 3–6 h; alle Bins in `diag-d-chance.json`):

| Kandidat | 0–10 | 20–30 | 30–40 | 40–50 | 50–60 | 90–100 |
|---|---|---|---|---|---|---|
| F1 | 18 806 : 2 / 1 | 876 : 28 / 13 | 996 : 33 / 21 | 201 : 44 / 35 | 73 : 55 / 44 | 11 : 93 / 73 |
| F0 | 18 806 : 1 / 1 | 1 696 : 26 / 17 | 375 : 33 / 31 | 93 : 44 / 43 | 88 : 55 / 63 | — |
| F2 | 19 647 : 0 / 1 | 115 : 25 / 19 | 115 : 35 / 17 | 128 : 44 / 12 | 244 : 55 / 27 | 159 : 97 / 58 |
| F8S | 19 603 : 1 / 1 | 55 : 24 / 22 | 531 : 36 / 24 | 284 : 44 / 36 | 102 : 54 / 42 | 6 : 93 / 100 |

Bei 7–24 h sind F1 und F0 in 30–80 % eher zu trocken (F1 45 → 53 %, F0 44 → 64 %), bei 25–48 h F1 in 20–40 % zu nass (27 → 20 %).
F2 ist in **jedem** Bin oberhalb 30 % massiv zu nass (p 0,9–1 ⇒ 38–60 % beobachtet): die Spreizung der Quellen (σ_div ist an 88 %
der Zeilen 0, weil alle Quellen trocken sagen) beschreibt nicht die Unsicherheit des Auftretens — das bestätigt, warum der Motor
`precip_sd` nicht als σ nimmt.

**Länder (Brier, F1 / F0 / F2 / F8S):** DE 3–6 h 0,0335 / 0,0322 / 0,0426 / 0,0303; AT 0,0284 / 0,0280 / 0,0319 / 0,0278; CH 0,0129 /
0,0113 / 0,0148 / 0,0111 — dieselbe Ordnung in jedem Land und Bin (CH 25–48 h: F0 0,0119 gegen F1 0,0144, der größte Abstand).

### 2.3 Gelände: F1 gegen F1n

|p(F1) − p(F1n)| über 219 538 Zeilen: Median 0,0001, p90 0,0015, p99 0,0074, max 0,047; Brier je Bin gleich (≤ 0,1 %). ⇒ Für die
**Chance** braucht der Producer kein Gelände je Zelle; neutrale Werte sind zulässig und werden benannt. (Gemessen mit den `scales`
des Punkts — ein ganz synthetischer `scales`-Block für die Zelle ist auf Regen-Invarianz noch zu prüfen: die Repräsentanz des
Niederschlags liest laut `fuse.ts` Z. 228 nur Footprint und Distanz.)

### 2.4 Gegenproben

- **F1 = Fusion 8 ohne Station und Radar:** gegen F8L mit `mem = 0` (Modus L, Nachbar kein Member, Vorlauf ≥ 3 h ⇒ kein Radar):
  191 529 Zeilen, Median |Δp| 2,5·10⁻⁵ (Rundung der Karte auf 4 Stellen), **98,9 %** < 10⁻⁴, p99 0,011, max 0,45; Brier-Unterschied
  0,0–0,3 %. Die 1,1 % abweichenden Zeilen sind nicht untersucht (Modus L reicht die Messung des Nachbarn als `obs` herein; ob sie
  auf die Regen-Hürde wirkt, ist offen — V-NP0-D3).
- **F1 = Lernstufe allein (flK der Karte):** max |Δp| 5·10⁻⁵ (Rundung) — die Hürde wird an jeder Zeile gelernt
  (`learnedPrecip` an 219 538 von 219 538 Schritten, nie K-2 behalten).
- **F2-Eingänge:** σ_ens an 34 463 Zeilen (t1-Ensemble im Gebiet), sonst nur σ_div; σ gesamt = 0 an 194 291 Zeilen (88 %) ⇒ dort
  ist F2 = F3 (0/1).

### 2.5 Lücken (benannt)

- 15 Ausgabetage, ≈ 6 Regentage, Spätsommer/Frühherbst; Route-1-Strata nur aus Sommerfalten (V-FV-1) — Winter offen.
- Nur Stationspunkte (Modus „Punkt ohne Station" = die eigene Station nicht als Member); flächige Wahrheit (Radar-Stundensumme) fehlt
  im Archiv — ein Feld wird erst mit NP-5 (Trefferbilanz) flächig prüfbar.
- Nur t1 (3–48 h); t2/t3 (51–336 h) nicht gemessen — dort Lernstufe Bin 3–4, Bin 5 `no-skill` ⇒ K-2.
- Kein neuer Sammler (Auftrag).

## 3. Empfehlung E-NP0-4

**F1** — die Niederschlags-Hürde der Fusion-Kette mit dem Cube als einziger Quelle, über `fuseCubePoint` unverändert je Zelle, mit
`point/fusion.client.json` als Tabelle. Begründung: (a) F1 schlägt F2 deutlich (−19…−25 % Brier für F2) und die Klimatologie
(+17…+30 %); (b) F1 ist die Chance, die Fusion 8 an einem Ort ohne Station zeigt (|Δ| 0,004–0,007) — Karte und Ort sagen dasselbe,
bis auf Station und Radar; (c) Gelände ist für die Chance entbehrlich. **Bedingung:** der Feldschritt t1 läuft parallel (Worker) oder
mit Zellmaske — einfädig ≈ 16 min Runner, über dem 4-min-Ziel.

**Benannte Alternative F0** (K-2 allein): 40 % billiger, keine Tabellen-Abhängigkeit, Brier 0,5–4,8 % besser (n. s. nach BH) und
besser kalibriert im Mittel — aber 3–6× weiter von der Ortsanzeige weg. Wählt Jan F0, muss das Manifest sagen, dass die Karte nicht
die Chance des Orts zeigt.

**Nicht F2** (überkonfident, teils schlechter als die Klimatologie), **F3 nur als Rückfall** (keine Chance, Menge allein).

**Manifest-Text (Vorschlag, D-NP0-12):** „Regen-Chance: Modell · Cube — Hürde der buscosun-Fusion-Kette mit dem Cube als einziger
Quelle (ohne Station, Radar, Gelände am Ort). Gemessen an 389 Stationen, 16.09.–01.10.2026, 3–48 h: Brier-Skill gegen die
Klimatologie 0,17–0,30; im Mittel zu nass (Chance 5,6–6,9 % gegen 3,3–3,7 % Regenstunden)."

## 4. Neue V-Einträge

- **V-NP0-D1** Plan §1.1/§4 nennt `precipCal` als Glied der Kette — in Fusion 8 ist es aus (`defaultCubeIo`, `stageFuse`). Mehrwert:
  richtige Definition im Manifest. Skizze: Plan-Text korrigieren („K-2 → gelernte Hürde").
- **V-NP0-D2** Am Archiv ist die gelernte Hürde (F1) nicht besser als K-2 allein (F0): 0,5–4,8 % Brier schlechter, im Mittel zu nass
  (p̄ 5,6–6,9 % gegen 3,0–4,0 % bei F0, Basisrate 3,3–3,7 %); Route-1-Strata aus Sommerfalten. Mehrwert: bessere Regen-Chance am Ort
  UND auf der Karte. Skizze: an die Fusion-Linie (nicht NP-0) — Wiederholung mit ≥ 30 Ausgabetagen (Regel vorab einfrieren, wie
  §6l), Kandidat „Hürde aus, K-2 behalten" bzw. Neufit mit Herbst-/Archivfalten; ändert buscosun Fusion ⇒ Jans Gate.
- **V-NP0-D3** 1,1 % der Zeilen von F8L (`mem = 0`) weichen von F1 ab (max |Δp| 0,45) — Ursache nicht untersucht (Messung des
  Nachbarn als `obs`?). Mehrwert: sauberer Gleichheitsbeweis der Feld-Definition. Skizze: die Zeilen isolieren, eine Zeile mit und
  ohne `obs` durch `fuseCubePoint` schicken.
- **V-NP0-D4** Der Motor verlangt `terrain.scales` auch für Größen, die ihn nicht lesen (Niederschlag) — ohne Ring-Geometrie gibt es
  keine Verteilung. Mehrwert: Feld ohne Gelände-Vorrechnung. Skizze: im Producer ein neutraler, benannter `scales`-Block mit
  Gleichheitsprobe auf den Niederschlag (Verifier `verify:np0-fields`, Konsistenz-Probe ≥ 50 Zellen) — kein Motor-Eingriff.
