# Sonde: die drei Faktoren des Konfidenz-Scores am echten Cube (CDN), 2026-09-30 ≈ 18:20 UTC

Sonde `conf-probe.mjs` (Scratch, Kopie der Aufrufform von `audit/fusion-stationswert/fs-live-check.mjs`): `getPointForecastFromCube`
gegen das Daten-Repo am CDN, `hours: 336`, ohne Radar, Gelände aus `features/points.v1.json`, **Lauf B mit der Browser-Voreinstellung**
(`learnedSource/climaSource/stackSource: json`, `stage: 'fs'` = buscosun Fusion 6, Tabellen `1aaec969`), Lauf A zum Vergleich ohne die
Stufe (σ-Art `divergence`/`ensemble`/`sys-only`). Ausgelesen aus `v2.axis.steps[*].vars[*].confidence` (score, spread = Schärfe,
agree = Einigkeit, lage) und `sigma` (Streuung der Ausgabe). Vier Punkte: Waldmünchen (DE, 499 m), Hamburg-Fuhlsbüttel (DE, 16 m),
Innsbruck-Flughafen (AT, 578 m), Chasseral (CH, 1 594 m).

## Lauf B (buscosun Fusion 6) — Mittel über die Stunden 1/3/6/12/24/48/72/120/168/240 an den vier Punkten

| Größe | n | Ø Score | Ø Schärfe | Ø Einigkeit | Ø Lage | Score < 0,5 | Score < 0,7 |
|---|---|---|---|---|---|---|---|
| T | 40 | **21 %** | 50 % | 49 % | 81 % | 36/40 | **40/40** |
| Td | 40 | 25 % | 64 % | 48 % | 81 % | 37/40 | 40/40 |
| Wind | 40 | 46 % | 73 % | 78 % | 81 % | 24/40 | 40/40 |
| Böe | 40 | 38 % | 69 % | 66 % | 81 % | 29/40 | 39/40 |
| Bewölkung | 40 | **1 %** | **2 %** | 75 % | 81 % | 40/40 | 40/40 |

T über alle 334 Schritte mit Konfidenz (nativ + interpoliert): Waldmünchen Ø 12 %, Hamburg 13 %, Innsbruck **8 %**, Chasseral 9 %;
Schritte mit Score < 0,5: 326 · 324 · 334 · 334 von 334. Das Dashboard liest genau diese Reihe (`vars.t2m.confidence.score`).

## Belegzeilen (Lauf B)

| Ort | h | Größe | Score | Schärfe | Einigkeit | Lage | σ_post | σ-Art | Flags |
|---|---|---|---|---|---|---|---|---|---|
| Innsbruck | 6 | T | **0 %** | 55 % | **0 %** | 80 % | 1,44 K | learned | belowGround925 (\|Δh\| > 300 m ⇒ 0,8) |
| Innsbruck | 24 | T | **0 %** | 59 % | **0 %** | 80 % | 1,31 K | learned | belowGround925 |
| Innsbruck | 6 | Td | 0 % | 66 % | 0 % | 80 % | 1,68 K | learned | — |
| Waldmünchen | 6 | T | 6 % | 66 % | 13 % | **63 %** | 1,03 K | learned | chunkBorderTruncated · extrapolatedBelowModel (0,9 · 0,7) |
| Waldmünchen | 1 | T | 13 % | 71 % | 32 % | **57 %** | 0,88 K | learned | + nowcastFallbackModel (· 0,9) |
| Hamburg | 6 | T | 54 % | 64 % | 84 % | 100 % | 1,03 K | learned | — (bester T-Wert der Sonde) |
| Hamburg | 48 | Böe | **74 %** | 75 % | 98 % | 100 % | 1,36 m/s | learned | seam (einziger Wert ≥ 0,7) |
| Hamburg | 24 | Bewölkung | **0 %** | **0 %** | 100 % | 100 % | 14,5 % | learned | σ_post 14,5 %, Score trotzdem 0 (s. V-KF-2) |
| Hamburg | 6 | Bewölkung | 0 % | 0 % | 61 % | 100 % | 45,4 % | learned | Mischungs-σ > σ_clima 34 % |
| Chasseral | 6 | Böe | 5 % | 78 % | **9 %** | 72 % | 1,19 m/s | learned | chunkBorder · \|Δh\| > 300 m (0,9 · 0,8) |
| Chasseral | 48 | Wind | 60 % | 86 % | 98 % | 72 % | 1,01 m/s | learned | Lage deckelt auf 72 % |

## Lauf A (ohne die Stufe, zum Vergleich)

Mittel über dieselben Stunden an Hamburg/Innsbruck/Chasseral: T Score 24 % (Schärfe 49 · Einigkeit 56 · Lage 82), Bewölkung 23 %
(Schärfe 42 — hier zählt σ_post der Normalverteilung ≈ 14–24 % gegen 34 %). Die Einigkeit bricht auch ohne die Stufe ein, wo das
Ensemble eng ist und die Quellen auseinanderliegen (σ-Art `ensemble`: Hamburg +6 h Wind Einigkeit 10 %, Innsbruck +6 h T 1 %,
Formel σ_ens²/(σ_ens² + σ_div²)).

## Lesart

Kein Punkt und keine Größe erreicht im Mittel die Dashboard-Schwelle „solide" (≥ 70 %); T liegt an allen vier Orten fast überall
unter 50 % (= „unsicher"). Die drei Faktoren erklären es getrennt: die **Einigkeit** fällt in der Stufe fs auf 0, wo σ_div ≥ σ_learned
(Innsbruck, V-KF-1); die **Schärfe** der Bewölkung ist mit der Mischungs-σ immer 0 (V-KF-2); die **Lage** ist an drei von vier Orten
dauerhaft 0,57–0,80 und deckelt jede Stunde (V-KF-3); das **Produkt** dreier Faktoren ≤ 1 liegt auch ohne jeden Fehler bei ≈ 0,5
(V-KF-4); die **Schwellen** 0,7/0,9 stammen aus der Dashboard-Vorlage (V-KF-5).
