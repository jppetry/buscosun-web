# F10 — Abschnitt „Statistik & Kalibrierung + Daten“: Kandidat K1 Langfrist-Rückführung auf die Klimatologie

> Worktree `C:\dev\buscosun-web-wt\f10-stat`, Zweig `f10/stat` (ab `fusion-10` @ 6e1c88f), 07.10.2026. Zeitbudget 65 min.
> Option `longRange` (default aus), Modul `src/pointForecast/fusion/longRange.ts`, Fit `scripts/fusion10/fit-longrange.mjs`.

## 1 Diagnose (am Code)

- Die Kette rechnet jenseits von 48 h nur noch auf t2/t3-Cube-Membern; die Minimum-Varianz-Kombination schrumpft bereits mit dem
  Klimatologie-Prior (`fuse.ts`, `priorShrink: false` in der Stufe fs ⇒ Prior nur noch über β), aber die σ der gelernten Varianz
  (`cubeSource.ts:1470` ff., `kind: learned`) stammt aus dem Hindcast-Fit FL mit Sommerstrata (V-FV-1, Route 1) — die Bänder bei
  120–336 h sind zu schmal (Abdeckung 63–74 %, `audit/fusion-10.md` §1.3).
- Keine Stelle der Kette zieht das Mittel mit dem Vorlauf zur Klimatologie zurück: `finishStep` (`cubeSource.ts:1437`) endet nach
  `applyStationValue` (`:1629`) mit dem Unsicherheitsblock; der Klimatologie-Schwanz (`:1697`, `fuseAt([], …)`) beginnt erst
  hinter dem letzten nativen Schritt. ⇒ Bei 240–336 h liegt Wind 54 % unter der Stationsklimatologie, T +9,6 %, Td +0,3 %.
- Die Klimatologie des Motors ist je Größe greifbar: μ_c(T, Td) aus `muAt(climaEst, ms, lon)` (`:861`, dieselbe Quelle wie
  `anomalyMuT`), σ_c(T) aus `sigmaClimaFor('temperature')` (`:1096`), Wind/Böe als Klimatologie-only-Fusion `fuseAt([], leadH, t, null)`.
  Ein EMOS-artiger Haken (w·μ + (1−w)·μ_c, s·σ_mix) an dieser Stelle ist additiv, familientreu und mit Identitätstabelle byte-gleich.

## 2 Gebaut

| Datei | Was |
|---|---|
| `src/pointForecast/fusion/longRange.ts` (neu, rein) | `LONG_RANGE_BINS` (49–72, 73–120, 121–168, 169–240, 241–336 h, Binmitten), `LONG_RANGE_IDENTITY`, `LONG_RANGE_TABLE` (Provenienz hindcast), `longRangeParams` (linear im Vorlauf zwischen Knoten (48 h, {1,1}) und den Binmitten, hinter der letzten gehalten), `blendDist` (momentgleiche Mischung; `normal` exakt, `truncatedNormal`/`censoredNormal`/`rice` auf Lage/Skala — Näherung dokumentiert; `===` bei w = s = 1; andere Familien unverändert), `sdOf`, `locScaleOf` |
| `src/pointForecast/cubeSource.ts` | `FuseCubeOptions.longRange?: 0 \| 1`, `longRangeTable?`; Haken in `finishStep` NACH dem Stationswert, VOR dem Unsicherheitsblock, nur `leadH > 48`; `post.longRange = { leadH, clima, w, s }`; Flag `longRange`; eine Notizzeile mit Zählern |
| `scripts/fusion10/fit-longrange.mjs` (neu, nur lesend) | Replay der Champion-Optionen + `{ longRange: 1, longRangeTable: LONG_RANGE_IDENTITY }` auf 00-UTC-Hindcast-Slots außerhalb des Tresors (Tresor-Datum ⇒ Abbruch), Zeilen je Station × nativer Schritt > 48 h × Größe, Wahrheit W1 (`truthValue`, Böe = Max über den Schritt), Grid w ∈ [0,2; 1] / s ∈ [0,6; 1,8] grob 0,1 + Verfeinerung 0,05, Ziel = mittlere CRPS_Q über die 19 Protokoll-Quantile; Rice über momentgleiche gestutzte Normal als Proxy (exakte Gegenprobe auf Teilmenge); Länderregel (kein Land > 1 % schlechter, sonst Schrumpfen zur Identität); schreibt `audit/fusion-10/longrange-fit.json` |

Nicht gebaut: Pre-Screen-Lauf auf der Schnellmenge (Zeitbudget; Kommando s. §6).

## 3 Fit-Fenster und Mengen

Fenster 2025-09-08 … 2026-09-21 (außerhalb des Tresors 2024-04-01 … 2025-08-31, vor dem Freeze 07.10.; die Entwicklungsmenge
14.09.–06.10.2026 des Prüfstands wurde NICHT benutzt), jeder 12. Tag (statt 3./6.: ein Slot kostet 15–25 s bei geteilter CPU),
Kette wie Spur R (kein Stationsprodukt, keine Messung, LOSO-Klimatologie an Rolle B). Klimatologie an jedem Schritt > 48 h aus
dem Klimatologieprodukt (T/Td) bzw. der Klimatologie-only-Fusion (Wind, Böe).

Slots 32 (2025-09-08 … 2026-09-15, jeder 12. Tag), Schritte 700800, Fehler 0

| Größe | Bin | Zeilen | Familie | Grid-Optimum (w, s) | gewählt (w, s) | CRPS vorher → nachher | Skill | DE / AT / CH | Rolle A / B | exakt (Rice) |
|---|---|---|---|---|---|---|---|---|---|---|
| t | 49-72 | 92062 | normal 92062 | (0.95, 0.8) | (0.975, 0.9) 1× geschrumpft | 1.2589 → 1.252 | +0.5 % | −0.4 % / +1.0 % / +1.4 % | +0.6 % / +0.5 % | – |
| t | 73-120 | 184007 | normal 184007 | (0.9, 0.9) | (0.95, 0.95) 1× geschrumpft | 1.422 → 1.4056 | +1.1 % | −0.6 % / +2.3 % / +2.6 % | +1.2 % / +1.0 % | – |
| t | 121-168 | 92063 | normal 92063 | (0.9, 0.85) | (0.9, 0.85) | 1.6123 → 1.5987 | +0.8 % | −0.7 % / +1.9 % / +2.3 % | +0.9 % / +0.5 % | – |
| t | 169-240 | 138138 | normal 138138 | (0.65, 0.9) | (0.65, 0.9) | 2.1095 → 1.9865 | +5.8 % | +3.5 % / +8.5 % / +7.4 % | +6.0 % / +5.2 % | – |
| t | 241-336 | 184094 | normal 184094 | (1, 1.05) | (1, 1.05) | 2.2099 → 2.2084 | +0.1 % | +0.1 % / −0.1 % / +0.1 % | +0.1 % / +0.1 % | – |
| td | 49-72 | 92015 | normal 92015 | (0.9, 0.75) | (0.9, 0.75) | 1.157 → 1.1253 | +2.7 % | −0.4 % / +6.1 % / +4.0 % | +2.9 % / +2.4 % | – |
| td | 73-120 | 183918 | normal 183918 | (0.85, 0.85) | (0.925, 0.925) 1× geschrumpft | 1.4047 → 1.3691 | +2.5 % | −0.3 % / +4.9 % / +4.4 % | +2.7 % / +2.2 % | – |
| td | 121-168 | 92016 | normal 92016 | (0.85, 0.8) | (0.85, 0.8) | 1.5981 → 1.5685 | +1.8 % | +0.8 % / +2.1 % / +3.4 % | +2.0 % / +1.5 % | – |
| td | 169-240 | 138044 | normal 138044 | (0.55, 0.9) | (0.55, 0.9) | 2.1502 → 1.9656 | +8.6 % | +7.7 % / +9.4 % / +9.3 % | +8.8 % / +8.0 % | – |
| td | 241-336 | 183971 | normal 183971 | (0.6, 1.05) | (0.6, 1.05) | 2.2288 → 2.1962 | +1.5 % | +1.2 % / +1.4 % / +1.9 % | +1.5 % / +1.5 % | – |
| ws | 49-72 | 91937 | truncatedNormal 91937 | (1, 1) | (1, 1) | 0.9019 → 0.9019 | +0.0 % | +0.0 % / +0.0 % / +0.0 % | +0.0 % / +0.0 % | – |
| ws | 73-120 | 183744 | truncatedNormal 183744 | (1, 1.05) | (1, 1.05) | 0.9711 → 0.9703 | +0.1 % | +0.3 % / −0.3 % / +0.0 % | +0.0 % / +0.2 % | – |
| ws | 121-168 | 91924 | truncatedNormal 91924 | (1, 1.2) | (1, 1.05) 2× geschrumpft | 1.1158 → 1.112 | +0.3 % | +0.9 % / −0.5 % / −0.0 % | +0.3 % / +0.5 % | – |
| ws | 169-240 | 137877 | truncatedNormal 137877 | (1, 1.05) | (1, 1.05) | 1.1263 → 1.1252 | +0.1 % | +0.5 % / −0.7 % / −0.1 % | +0.0 % / +0.3 % | – |
| ws | 241-336 | 183812 | truncatedNormal 183812 | (1, 0.8) | (1, 0.8) | 1.2121 → 1.1998 | +1.0 % | −0.2 % / +2.8 % / +1.6 % | +1.2 % / +0.5 % | – |
| gust | 49-72 | 91871 | censoredNormal 91871 | (1, 1) | (1, 1) | 1.5028 → 1.5028 | +0.0 % | +0.0 % / +0.0 % / +0.0 % | +0.0 % / +0.0 % | – |
| gust | 73-120 | 183594 | censoredNormal 183594 | (0.9, 0.8) | (0.9, 0.8) | 1.6012 → 1.5875 | +0.9 % | +0.4 % / +1.3 % / +1.3 % | +0.9 % / +0.7 % | – |
| gust | 121-168 | 91775 | censoredNormal 91775 | (0.5, 0.75) | (0.75, 0.875) 1× geschrumpft | 2.5496 → 2.3984 | +5.9 % | +0.1 % / +9.7 % / +11.2 % | +5.5 % / +7.1 % | – |
| gust | 169-240 | 137592 | censoredNormal 137592 | (0.4, 0.65) | (0.7, 0.825) 1× geschrumpft | 2.4939 → 2.3192 | +7.0 % | +0.6 % / +10.8 % / +12.8 % | +6.4 % / +8.6 % | – |
| gust | 241-336 | 183527 | censoredNormal 183527 | (0.6, 0.75) | (0.8, 0.875) 1× geschrumpft | 2.2908 → 2.2257 | +2.8 % | +0.0 % / +4.4 % / +5.7 % | +2.5 % / +3.9 % | – |

Lesart: der Hebel liegt bei T/Td bei 169–240 h (w 0,55–0,65: +5,8/+8,6 %) und bei der Böe ab 121 h (+2,8…+7,0 %, AT/CH tragen, DE ≈ 0);
T bei 241–336 h bleibt nahe der Identität (w 1, s 1,05 — nicht monoton zum Bin davor, V-F10-4: Binmitten-Interpolation zieht w zwischen
204 und 288 h wieder auf 1); Windgeschwindigkeit (gestutzte Normal der Lernstufe) will nur eine σ-Skala (+0,1…+1,0 %). Die Vorab-Erwartung „Wind −54 % gegen Klima bei 240–336 h“
der Entwicklungsmenge zeigt sich am Hindcast-Fenster NICHT in dieser Größe — dort ist Fusion 9 bei Wind nahe der Identität optimal
(V-F10-1).

## 4 Identitätsbeleg

Hash der Verteilungen aller Schritte (hourly + tail, 40 Stationen, Slot 2025-09-08, 2 400 Schritte) — Skript `identity-check.mjs`
(Scratch): Basis-Motor `C:/dev/buscosun-web` (fusion-10, nur gelesen) `8e1d0ab496e866b0` = Worktree ohne Option `8e1d0ab496e866b0`
= Worktree mit `longRange: 1` + `LONG_RANGE_IDENTITY` `8e1d0ab496e866b0`; mit der gefitteten `LONG_RANGE_TABLE` `1132e298769a9f75` (Negativkontrolle).
Der Haken läuft ohne `opts.longRange === 1` nicht (`useLongRange`, `cubeSource.ts`). `tsc -b --noEmit` grün.

## 5 Risiken

- **Saisonalität:** das Fit-Jahr (Sept 2025–Sept 2026) gegen die Tresor-Jahre (Apr 2024–Aug 2025); die Lernstufe trägt Sommer-
  strata (V-FV-1). Ein Jahr ist eine Stichprobe — die w für T/Td ab 169 h (0,6–0,8) sind robust über die Länder, s nicht.
- **LOSO-Klimatologie an Rolle B:** μ_c kommt an Rolle B aus dem Leave-Station-out-Produkt; am Punkt ohne Station in Produktion
  aus dem veröffentlichten Produkt — Fit und Einsatz unterscheiden sich dort (Rolle A/B im Fit-JSON getrennt ausgewiesen).
- Rice-Proxy im Grid (Böe ist `censoredNormal`, nicht Rice — der Proxy griff nicht; Wind ist `truncatedNormal`) ⇒ kein Proxy-Risiko
  in diesem Lauf, aber ein Rice-Wind ohne `learnedSpeed` würde über den Proxy gefittet.
- Die Länderregel (1 %) ist auf einen Jahresausschnitt gemessen; CH/AT-Gewinne tragen die Bins, DE liegt bei T 49–168 h leicht negativ.

## 6 Offene Punkte

- **V-F10-1** Wind-Langfrist am Hindcast ≠ Entwicklungsmenge: Mehrwert — klärt, ob der −54-%-Befund ein Artefakt der 23 Archivtage
  (Herbst 2026, Stationsprodukt im Spiel) ist. Skizze: `prescreen.mjs --set=hindcast --limit=20` gegen `ref-klima` je Bin.
- **V-F10-2** Fit alle 3 Tage mit Workern (3 Worker = 3 Kerne) statt jedem 12. Tag; w/s je Land als Option prüfen (AX-5-Muster).
- **V-F10-3** Varianzmodell statt Skala: s kompensiert die Sommer-σ der Lernstufe (V-FV-1); ein Winter-Nachfit (E-FL-3) macht s obsolet.
- Pre-Screen: `node … scripts/fusion10/prescreen.mjs --out=C:\dev\buscosun-fusion10-data\prescreen\k1-schnell --root=C:/dev/buscosun-web-wt/f10-stat --opts='{"longRange":1}'` (Bash-Tool wegen der Anführungszeichen), dann `--compare=…\k1-schnell,…\f9-schnell`.
