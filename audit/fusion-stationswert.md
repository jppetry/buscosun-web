# Phase FS — Stationswert von buscosun Fusion gegen MOSMIX (Stand Fit 5e)

**Stand:** 2026-09-28 · **Status:** abgeschlossen (uncommitted), neueste Stufe freigeschaltet (§7.3: Daten-Repo gepusht, Panel-Voreinstellung Cube); Commit/Deploy von buscosun-web offen — Behauptungen eingefroren §2 (17:43:58Z), zwei Läufe §3, Verdikt §4, Gates grün; Entscheidungen E-FS-1…6 = Jans Gates (§6) · **Linie:** Anschluss an FV
(`audit/fusion-validierung.md`) · **Belege:** `audit/fusion-stationswert/`, Karten `C:\dev\buscosun-hindcast\score\<Datum>-fs`.

> Jans Auftrag (28.09.): aus der Bewertung gegen ICON-D2 und MOSMIX konkrete Verbesserungen ableiten, Fokus Stationswert — näher an
> MOSMIX oder darüber. Getestet wird der letzte Stand (Fit 5e). Reihenfolge: (1) Diagnose der Gewichte und β aus `onWeights`, (2) Kandidaten
> offline im Archiv, (3) Behauptungen vorab einfrieren, Gewichte Leave-Day-out, (4) stationsloser Punkt (E-FV-1), (5) erst danach die
> gewinnende Form hinter einem Flag in den Motor.

## 0 Kurzfassung — was die Phase ergeben hat (für Jan)

**An der Station schlägt der Stationswert MOSMIX; die Kette, wie sie war, trug zwei Fehler.**

- **Zwei Fehler in der Kette gefunden, beide am Motor belegt:**
  1. **Doppelte Korrektur (V-FS-2):** das gelernte Mittel gilt schon am Punkt; der Motor korrigierte es ein zweites Mal in der Höhe (T, Td)
     und skalierte Wind und Böe ein zweites Mal mit dem Geländefaktor. Ohne Station war die Kette dadurch bei T 24–30 % schlechter als die
     Lernstufe allein.
  2. **Doppelte Schrumpfung (V-FS-3, D2 bestätigt):** MOSMIX und die Lernstufe sind bereits Regressionen; der Klimatologie-Schritt dämpfte
     sie noch einmal. Ohne den Schritt ist die Kette in 14 von 16 Zellen signifikant besser.
- **Gewichte (D1 teilweise):** bei Wind, Böe und Td gibt die Kette MOSMIX 0,07–0,39 Gewicht, gemessen wären 0,67–0,90. Bei T stimmt das
  Gewicht ab 25 h (0,78 gegen 0,79).
- **Der Stationswert** M + b + w·I + c·(L − M) **schlägt MOSMIX an der Station** (H10 gilt, Leave-Day-out): T +13 / +6 / +5 / +3 %, Td
  +18 … +10 %, Wind und Böe 0–6 h +5 / +8 %, sonst gleichauf; keine Zelle schlechter. Als Motor-Option (E2): 13 von 16 Zellen signifikant
  besser, keine schlechter; gegen das heutige Live-Produkt T +20 … +4 %, Wind +11 … +6 % (0–48 h).
- **Bewölkung (H14 gilt):** die Lernstufe durchgereicht ist 18–22 % besser als die Kette und im CRPS 33–37 % besser als MOSMIX.
- **Zwischen den Stationen (H12/E4 gelten, indikativ):** gegen das MOSMIX der nächsten anderen Station ist die Kette mit beiden Korrekturen
  im Punktwert 30–50 % besser. Einschränkung: die Lernstufe kennt den Punkt aus dem Fit (Merkmale, keine Stationskoeffizienten).
- **Schwäche:** in der Schweiz ist der Stationswert bei Wind und Böe ab 7 h 2–10 % schlechter als MOSMIX (gepoolte Parameter, V-FS-5).
- **Gebaut:** vier Motor-Optionen, alle voreingestellt aus, ohne Option byte-gleich zu HEAD (312/312 Läufe auf echten Archiv-Eingaben).
  Einschalten ist dein Gate (§6).
- **Geltung:** 13 Ausgabetage im September, 389 Stationspunkte — indikativ. Die Tabelle des Stationswerts ist auf Tagen gefittet, nicht
  auf Jahreszeiten (Provenienz `archive`, nie `measured`).

## 1 Diagnose (aus Code und FV-Karten, vor jedem Lauf dieser Phase)

FV-A (12 Ausgabetage, an MOSMIX-Stationen): Punkt-MAE der Kette product@5e schlechter als MOSMIX (T 0–6 h 0,98 gegen 0,83 K, Wind 0,85
gegen 0,68 m/s), CRPS besser. Fünf Mechanismen, am Code gelesen, einzeln NICHT gemessen:

1. **Mitteln kann MOSMIX an der Station nicht schlagen.** Fehler MOSMIX ≈ 0,83 K MAE, Lernstufe auf dem echten Cube 1,46 K, Fehlerkorrelation
   `highres|mosmix` 0,60 (`priors.ts`) ⇒ varianzminimales Gewicht von MOSMIX ≈ 1.
2. **Gesetzte σ.** MOSMIX bekommt `SIGMA_SYS_FLOOR_A1` (T 1,2 K) bzw. den Skill-Prior (`stationSigma:set`), das gelernte Member die σ des
   Hindcast-Fits (`kind: learned`) — auf dem echten Cube ist sein Fehler größer (V-FV-8).
3. **Doppelte Schrumpfung.** Ein Member mit `errorSigma` gilt in `fuseScalar` als unverzerrte Messung der Anomalie und wird mit
   β = σ_c²/(σ_c² + σ_est²) zur Klimatologie gezogen; MOSMIX und die Lernstufe sind bereits Regressionen. Indiz: Wind-Bias der Kette
   −0,01 → −0,14 → −0,23 → −0,38 m/s über die Bins 0–6 … 51–120 h, Lernstufe allein ≈ 0.
4. **Wind vektoriell.** MOSMIX-FF wird in u/v zerlegt und vektoriell kombiniert; das Speed-Gesetz ist auf dem gelernten Member gefittet und
   wird auf die fusionierte Rice angewendet.
5. **Der Anker verschiebt nur das Cube-Member** (`finishStep`: `cubeSample.temperature += termK`), nie das Stationsmember.

## 2 Vorab festgelegte Behauptungen und Entscheidungsregeln

### 2.0 Einfrieren

Zeitstempel und sha256 des Texts von „### 2.1" bis vor „### 2.9" in `fusion-stationswert/claims-frozen.sha256` — vor dem ersten Lauf von
`stack-extract.mjs`. Danach wird §2 nur in §2.9 präzisiert (mit Zeitstempel und Grund), nie geändert.

### 2.1 Zeilen, Modi, Wortwahl

- **Zeilen:** wie FV-A — je Slot, DACH-Punkt (389) und nativer Gültigzeit des Produkts mit Wahrheit, Vorlauf ≥ 1 h ab dem Stundenboden der
  Slotzeit; alle lesbaren Slots des Archivs (14.–27.09., Schema 1/2). Tabellen: Fit 5e `fit\2026-09-27-fx5e\fusion.hindcast.json` mit der
  Faltenregel von FV (§1.7 dort), μ_c = LOSO-Schätzung des Punkts.
- **Modus S (Station):** der Punkt ist die Station; MOSMIX, Messung und Wahrheit von derselben Station (FV-A).
- **Modus L (Leave-Station-out, E-FV-1):** Wahrheit an A; MOSMIX und Messung von der nächsten ANDEREN Station B (nächster DACH-Punkt mit
  anderer Katalogstation und Stationsreihe im Slot), T/Td mit `sourceToPoint` von der Höhe von B auf h_true von A; die Kette an A bekommt B
  als Stationsmember nur, wenn die heutige `SELECTION` B für A annimmt, und die Messung von B mit ihrem Abstand. A's eigene MOSMIX-Reihe und
  A's Messungen erreichen keinen Kandidaten.
- Skill = 1 − Score_Kandidat / Score_Referenz auf identischen Zeilen; MAE des Punktwerts und CRPS (deterministisch: MAE). Test:
  Diebold–Mariano mit HAC auf Tagesmitteln (Tag = Ausgabetag), Benjamini–Hochberg über alle Tests der Karte (q = 0,05). Worte wie FV §2.1:
  „signifikant besser" / „gleichauf (n.s.)" / „signifikant schlechter"; alles **indikativ** (n_eff ≤ 13 Ausgabetage).
- **Zellen:** Größe (T, Td, Wind, Böe) × Bin (0–6, 7–24, 25–48, 51–120 h) = 16 Zellen, Schicht `all`; Länder berichtet.

### 2.2 Kandidaten

Prädiktoren je Zeile und Größe: **M** = MOSMIX am Gültigzeitpunkt (Punktwert; Wind = Betrag aus u/v); **I** = Messung(t₀) − MOSMIX(t₀) mit
t₀ = jüngste Messung ≤ slotAt des Netzes (Innovation von MOSMIX); **L** = Punktwert der Lernstufe allein (fl-K@5e); τ = V − t₀ in Stunden.

| Kandidat | Form | Parameter |
|---|---|---|
| `mosmix+anker` | M + w·I | w je Größe × τ-Gruppe |
| `mosmix+anker+bias` | M + b + w·I | b, w je Größe × τ-Gruppe |
| `stack` | M + b + w·I + c·(L − M) | b, w, c je Größe × τ-Gruppe |
| `product-noshrink` | die Kette product@5e ohne den Klimatologie-Schritt: Verteilung aus `rawMu`/`rawSigma` des Motors (T/Td normal, σ² = rawσ² + extraVar; Böe zensiert [0, 90]; Wind Rice(rawMu, rawσ), mit dem Speed-Gesetz des Stratums, wo die Kette es anwendet) | keine |
| `product@5e`, `fl-K@5e`, `mosmix`, `live` | wie FV-A | — |

- **τ-Gruppen:** 1, 2, 3, 4, 5, 6, 7–12, 13–24, 25–48, 49–120, 121–240 h.
- **Fit:** kleinste Quadrate auf r = y − M; Gruppen mit < 200 Trainingszeilen ⇒ Parameter 0 (Kandidat = MOSMIX). Zeilen ohne I: dieselbe Form
  ohne den Term w·I (eigener Fit); Zeilen ohne L: `stack` = `mosmix+anker+bias`. Wind und Böe nach unten bei 0 begrenzt.
- **Leckregel (Leave-Day-out mit Sperre):** die Parameter einer Zeile mit Gültigtag D stammen aus allen Zeilen, deren Gültigtag NICHT in
  [D − 1, D + 1] liegt (dieselbe Wahrheit steht unter mehreren Ausgabetagen — der Ausgabetag allein wäre ein Leck).
- **Verteilung der gefitteten Kandidaten** (für CRPS): Normal(Punktwert, σ_G), Wind/Böe zensiert bei 0 (und 90); σ_G = rms der Residuen der
  Trainingszeilen derselben Gruppe unter derselben Sperre.

### 2.3 Diagnose-Behauptungen (Schritt 1)

- **D1 (Gewichte, Punkt 2):** je Zelle T und Wind × vier Bins (8 Zellen, Modus S) der Median des normierten MOSMIX-Gewichts der Kette
  (`onWeights`) gegen das Leave-Day-out-Gewicht von MOSMIX im `stack` (1 − c, zeilengewichtet über die τ-Gruppen des Bins).
  **Bestätigt**, wenn die Kette in ≥ 6 von 8 Zellen um ≥ 0,15 darunter liegt; **widerlegt**, wenn der Abstand in ≥ 6 von 8 Zellen < 0,05
  ist; sonst **teilweise**. β (Median, p10, p90) je Größe × Bin wird berichtet.
- **D2 (Schrumpfung, Punkt 3):** `product-noshrink` gegen `product@5e`, MAE, 16 Zellen, Modus S. **Bestätigt**, wenn ≥ 9 Zellen signifikant
  besser und keine signifikant schlechter; **widerlegt**, wenn ≥ 9 signifikant schlechter; sonst **teilweise** mit Zellliste. Berichtet:
  die Steigung s der Regression (y − μ_clim) auf (rawMu − μ_clim) durch den Ursprung je Zelle (s ≈ 1: keine Schrumpfung gerechtfertigt;
  s ≈ β: die Schrumpfung des Motors ist richtig).

### 2.4 Behauptungen an der Station (Modus S)

- **H9 (`mosmix+anker` gegen `mosmix`, MAE):** T, Wind, Böe im Bin 0–6 h, Schicht `all`. **Gilt**, wenn alle drei signifikant besser sind.
  DE/AT/CH berichtet (DE: Messung 22:00, AT/CH 23:00).
- **H10 (`stack` gegen `mosmix`, MAE, 16 Zellen):** **gilt** („schlägt MOSMIX"), wenn keine Zelle signifikant schlechter ist und ≥ 8 Zellen
  signifikant besser sind; **Gleichstand**, wenn keine Zelle signifikant schlechter mit Skill < −2 % ist, aber weniger als 8 besser; sonst
  **gilt nicht**. `mosmix+anker+bias` gegen `mosmix` nach derselben Regel berichtet.
- **H11 (`stack` gegen `product@5e`, MAE, 16 Zellen):** **gilt**, wenn jede Zelle signifikant besser ist; Fehlschläge einzeln. CRPS berichtet.
- **H14 (Bewölkung, nur DE, Bins 0–6 … 51–120 h):** `fl-K@5e` (Lernstufe durchgereicht) gegen `product@5e` (CRPS und MAE) und gegen `mosmix`
  (CRPS). **Gilt**, wenn alle 12 Vergleiche signifikant besser sind. MAE gegen `mosmix` berichtet.

### 2.5 Behauptungen am stationslosen Punkt (Modus L, E-FV-1)

- **H12 (= H6b, `product@5e` gegen MOSMIX der Nachbarstation):** 16 Zellen, CRPS UND MAE. **Gilt (indikativ)**, wenn in allen Zellen beide
  Skills > 0 sind und keine signifikant schlechter ist; **gilt nicht**, wenn eine signifikant schlechter ist; sonst **teilweise**.
- **H13 (`stack` im Modus L — eigener Fit auf Modus-L-Zeilen — gegen MOSMIX der Nachbarstation, MAE):** Regel wie H10. Berichtet: gegen
  `product@5e` (Modus L) und gegen `fl-K@5e`; Schichten nach Abstand A–B (< 15, 15–30, ≥ 30 km) und |Δh| (< 100, ≥ 100 m).

### 2.6 Kontrollen (Erwartung vorab)

- **K1 (Leck des Ankerterms):** `stack` mit I vom selben Punkt, aber einem ANDEREN Ausgabetag (zyklisch um 3 Slots versetzt) darf
  `mosmix+anker+bias` im Bin 0–6 h nicht erreichen: w fällt auf < ⅓ des echten w bei T, τ = 1.
- **K2 (In-sample gegen Leave-Day-out):** der In-sample-Fit hat in jeder Zelle einen MAE ≤ dem Leave-Day-out-MAE + 0,5 % (sonst Fehler in der
  Sperre).
- **K3 (Nullform):** mit allen Parametern 0 ist jeder gefittete Kandidat zeilenweise identisch mit `mosmix` (max |Δ| = 0).
- **K4 (Nachbar ist nie der Punkt):** Modus L — keine Zeile mit Station B = Katalogstation von A, Abstand A–B > 0; gezählt.

### 2.7 Regel für Schritt 5 (Motor, nur hinter Option, ohne Option byte-gleich)

Eine Form geht nur dann hinter ein Flag in den Motor, wenn ihre Behauptung gilt: H9 ⇒ Anker auch auf dem Stationsmember; D2 bestätigt ⇒
Option ohne Klimatologie-Schritt für kalibrierte Member; H10/H11 (oder Gleichstand in H10 mit H11) ⇒ gefittete Stapel-Tabelle; H14 ⇒
Bewölkung durchreichen. Jede Option voreingestellt aus; Einschalten bleibt Jans Gate.

### 2.9 Präzisierungen nach dem Einfrieren

- **2026-09-28T17:55Z** (nach dem Rauchtest der Werkzeuge an 6 Punkten × 6 Slots, VOR der vollen Karte; Grund: beim Bau festgelegt):
  (1) `mosmix+anker` ist auf Zeilen ohne Innovation MOSMIX selbst (deterministisch, CRPS = MAE); (2) Zeilen ohne Innovation werden nach dem
  Vorlauf statt nach τ gruppiert (τ ist dort nicht definiert), mit eigenem Fit der Formen ohne w·I; (3) das Archiv trägt inzwischen 14 Slots
  (14.–27.09.) — alle werden gelesen; (4) K1 wird an den In-sample-Koeffizienten der Form b + w·I gelesen (T, τ = 1); (5) K2 vergleicht MAE,
  der Fit minimiert Quadrate — die Schranke +0,5 % bleibt, eine Verletzung wird als Befund berichtet, nicht umgedeutet; (6) D2-Steigung nur
  für T und Td (für Wind und Böe trägt der Motor kein μ_clim im Ergebnis); (7) `live` nur im Modus S.
- **2026-09-28T18:45Z — nach Lauf 1 (Karte `score\2026-09-28-fs-run1`, Verdikte §4.1) und dem Befund V-FS-2, VOR Lauf 2.** Lauf 1 bleibt
  gültig als Bewertung der Kette, wie sie ist. Lauf 2 misst die vier Motor-Optionen aus Schritt 5 (§2.7) und ändert keine Regel aus
  §2.3–§2.6. Neu und vorab festgelegt:
  (8) **L wie der Client:** der Stationswert wird auf der Lernstufe gefittet, wie der Client sie rechnet (die Situation der Kette trägt kein
  Höhenband ⇒ gepooltes Windgesetz; `fl-K@5e` des Scorers nimmt den Band-Eintrag) — betrifft nur den Wind; H9–H13 werden in Lauf 2 mit
  diesem L neu gerechnet und neben Lauf 1 berichtet.
  (9) **Kandidaten des Motors:** `product+fix` (= product@5e + `learnedAtPoint`), `product+fix+noshrink` (+ `priorShrink: false`),
  `product-FS` (+ `learnedClouds` + `stationValue` mit der In-sample-Tabelle aller Tage — um den Abstand von K2 optimistisch; die ehrliche
  Zahl der Form bleibt der Leave-Day-out-Kandidat `stack`).
  (10) **E1 (V-FS-2):** `product+fix` gegen `product@5e`, MAE, Modus L: T und Böe in allen vier Bins signifikant besser ⇒ **gilt**; Modus S
  und die übrigen Größen berichtet.
  (11) **E2:** `product-FS` gegen `mosmix`, MAE, Modus S, 16 Zellen, Regel wie H10.
  (12) **E3 (Motor = Form):** K5 — der Motor mit `priorShrink: false` auf der Kette von Lauf 1 gegen die Offline-Form `product-noshrink` an
  25 Punkten je Slot: max |Δ Punktwert| ≤ 0,001 (gespeicherte Verteilungen sind auf 4 Stellen gerundet) für T, Td, Böe, Bewölkung, Wind;
  K6 — der Stationswert des Motors gegen den In-sample-Kandidaten `stack:in` auf Zeilen gleicher Form: max |Δ| ≤ 0,001, Anteil der Zeilen
  mit abweichender Form berichtet.
  (13) **E4:** `product+fix+noshrink` gegen MOSMIX der Nachbarstation, Modus L, Regel wie H12.
- **2026-09-28T20:20Z — nach Lauf 2, beim Einschalten der Stufe im Client (Jans Auftrag), VOR Lauf 3.** Befund V-FS-12: die Formen
  ohne Innovation (B, S0) waren nur auf Zeilen OHNE Messung gefittet — im Archiv fast keine ⇒ kein geschriebener Eintrag ⇒ eine Abfrage
  ohne rechtzeitige Messung (im Browser: jede erste Ausgabe) bekam keinen Stationswert. Neu: (14) B und S0 werden auf JEDER Zeile
  gefittet, gruppiert nach dem Vorlauf; (15) **E5:** Kandidat `stack0` (Stationswert ohne Messung, Leave-Day-out) gegen `mosmix`, MAE,
  Modus S, 16 Zellen, Regel wie H10. Die Kandidaten mit Messung (A, AB, S) und ihre Verdikte bleiben unberührt.

## 3 Protokoll

### 3.1 Gebaut (28.09.)

| Datei | Was |
|---|---|
| `src/pointForecast/fusion/stationValue.ts` (neu) | EINE Definition für Fit und Motor: τ-Gruppen, Formen, Wert, Verteilung, Tabelle (`StackTable`, Provenienz `archive`), `stationValueOf`, `verifyStationValue` |
| `src/pointForecast/fusion/fuse.ts` | additiv: `FusionContext.priorShrink` — `false` ⇒ β = 1 für Kombinationen, deren Member alle eine explizite σ tragen |
| `src/pointForecast/cubeSource.ts` | vier Optionen in `FuseCubeOptions` (`learnedAtPoint`, `priorShrink`, `learnedClouds`, `stationValue`), Eingang `stack`, `CubeObs.dewPoint`, `CubeStep.post`; keine neuen Flags (der Codec bleibt unberührt) |
| `src/pointForecast/fusion/output.ts` | die vier calib-Schlüssel je Größe eingetragen (`CALIB_KEYS_OF`) |
| `scripts/fusionfit/lib/stackFit.mjs` (neu) | Normalgleichungen je (Schlüssel, Gültigtag), Falte = Subtraktion, Sperre ±1 Gültigtag |
| `scripts/fusionfit/stack-extract.mjs` (neu) | Zeilen je Slot × Punkt × Gültigzeit in den Modi S und L, Kette und Motor-Varianten; `--only=fit` |
| `scripts/fusionfit/stack-score.mjs` (neu) | Fit, Kandidaten, Scores, Paare, Verdikte nach §2; `--table` schreibt die Tabelle, `--fitOnly` |
| `scripts/fusionfit/lib/archiveAdapter.mjs` | additiv: `inputFromArchive` reicht `stack` durch |
| `scripts/verify-fusion-fit.mjs` Block 17 | 17a–d: Rückgewinnung b/w/c, Sperre mit gepflanztem Leck, Formen, Abstand — je mit Negativkontrolle |
| `scripts/verify-pv-cube.mjs` Block 28 | 11 Prüfungen: Modul, Byte-Gleichheit ohne Option, je Option die Wirkung mit Negativkontrolle, Grenzen, stündliche Achse, Cache-Schlüssel |
| `audit/fusion-stationswert/` | `claims-frozen.sha256`, `fs-decision-run1.md`, `fs-decision-run2.md`, `diag-fs-chainL.{mjs,md}`, `diag-fs-k6.{mjs,md}`, `fs-bytes-check.mjs` |

### 3.2 Läufe

| Schritt | Ergebnis |
|---|---|
| Einfrieren §2.1–§2.7 | 2026-09-28T17:43:58Z, sha256 e2c00e0b… |
| Extraktion Lauf 1 | `score\2026-09-28-fs-run1\rows.jsonl.gz`: **331 594 Zeilen**, 14 Slots (13 Ausgabetage mit Wahrheit), 15 768 Motorläufe, 0 Motorfehler; Modus L an 5 104 Punkt-Slots (8 ohne Nachbar), Nachbar als Stationsmember angenommen an 602 |
| Karte Lauf 1 | 4 445 Zellen, 13 902 DM-Tests — Verdikte §4.1 |
| Diagnose V-FS-2 | `diag-fs-chainL.md` (65 Punkte, Slot 22.09.): T-MAE des Members wie gespeichert 1,18–1,54 K, wie der Motor ihn liest 1,69–2,31 K |
| Fit-Zeilen + Tabelle | `--only=fit` (5 112 Motorläufe, 2 min) → `fit\2026-09-28-fs\stack.archive.json`, 174 Einträge |
| Byte-Gleichheit | `fs-bytes-check.mjs`: **312/312** Läufe (3 Slots × 26 Punkte × 4 Varianten) byte-gleich zu den HEAD-Kopien im selben Prozess; Positivkontrolle: jede der vier Optionen ändert 78/78 Läufe |
| Extraktion Lauf 2 | `score\2026-09-28-fs\rows.jsonl.gz`: 331 594 Zeilen, **48 111 Motorläufe**, 16 min, 0 Motorfehler |
| Karte Lauf 2 | 6 587 Zellen, 28 878 DM-Tests — Verdikte §4.2 |

**Gates (28.09., Maschine frei):** typecheck grün · `verify:pv-cube` **331/331** · `verify:fusion-fit` **119/119** · `verify:point-client` 167/167 ·
`verify:calib-fit` 14/14 · `verify:pv-fusion` 229/229 · Build 241/241 · eagerJs 107,9 (unverändert), largestChunk 301,2, **totalJs 1 450,6 KB >
1 438** (+3,0 KB aus dieser Phase, alles im Lazy-Chunk des Cube-Pfads; die Grenze war schon vorher überschritten, E-FL-11).

## 4 Verdikt je Behauptung

Gerechnet von `stack-score.mjs` nach §2 (vollständige Tabellen: `fusion-stationswert/fs-decision-run1.md`, `fs-decision-run2.md`). Skill auf
identischen Zeilen; * signifikant besser, ! signifikant schlechter (DM auf Tagesmitteln, BH über die Karte). Alles indikativ (n_eff ≤ 13).

### 4.1 Lauf 1 — die Kette, wie sie ist, und die Offline-Kandidaten

| Behauptung | Verdikt | Beleg |
|---|---|---|
| **D1** Gewichte | **TEILWEISE** | MOSMIX-Gewicht der Kette (p50) gegen Leave-Day-out: T 0,64 / 0,66 / 0,78 / 0,74 gegen 0,91 / 0,79 / 0,79 / 0,74; Wind 0,32 / 0,39 / 0,23 / 0,12 gegen 0,83–0,85; berichtet Td 0,17–0,38 gegen 0,67–0,90, Böe 0,07–0,14 gegen 0,67–0,72. 5 von 8 Zellen um ≥ 0,15 darunter |
| **D2** Schrumpfung | **BESTÄTIGT** | ohne Klimatologie-Schritt 14 von 16 Zellen signifikant besser, keine schlechter (T +9,5…+13,8 %, Td 7–120 h +6…+8 %, Wind +5…+6 %); Steigung der Wahrheit auf der kombinierten Anomalie 1,04–1,13 (T) bei β 0,83–0,87 |
| **H9** Anker auf MOSMIX | **GILT** | 0–6 h: T +12,4 %*, Wind +4,8 %*, Böe +6,1 %*; AT +14…+24 %*, DE +0,7…+4 % (Messung 22:00, eine Stunde älter) |
| **H10** `stack` gegen MOSMIX | **GILT** | 10 Zellen signifikant besser, 0 schlechter, 6 gleichauf (Wind 7–120 h, Böe 7–120 h) |
| **H11** `stack` gegen die Kette | **GILT NICHT (knapp)** | 15 von 16 signifikant besser (T +14…+28 %, Wind +22…+26 %, Böe +14…+21 %); Td 51–120 h +7,2 % n.s. |
| **H14** Bewölkung | **GILT** | Lernstufe gegen Kette CRPS +18…+22 %*, MAE +11…+18 %*; gegen MOSMIX CRPS +33…+37 %* (MAE +5/+8 %* bis 24 h, danach gleichauf) |
| **H12** stationsloser Punkt | **GILT (indikativ)** | Kette gegen MOSMIX der Nachbarstation: beide Skills > 0 in 16 von 16 Zellen (MAE +13…+45 %) |
| **H13** `stack` im Modus L | **GILT** | 16 von 16 signifikant besser (MAE +28…+50 %); der Fit wählt dort c ≈ 1 — der Stationswert IST dann die Lernstufe (T: c 0,7–0,9) |
| K1 / K2 / K3 / K4 | bestanden | w versetzt 0,232 gegen 0,865; In-sample besser um 0,1–1,7 %; Nullform max \|Δ\| 0; 330 817 Zeilen, Nachbar nie der Punkt |

### 4.2 Lauf 2 — die Motor-Optionen (§2.9 (8)–(13))

| Behauptung | Verdikt | Beleg |
|---|---|---|
| **E1** `learnedAtPoint` (Modus L) | **GILT** | T +7,7 / +18,1 / +15,9 / +13,8 %*, Böe +4,5…+9,2 %*; Wind ±1 % (0–6 und 25–48 h −0,5 / −0,8 %!) |
| **E2** `product-FS` gegen MOSMIX (Modus S) | **GILT** | 13 Zellen signifikant besser, 0 schlechter, 3 gleichauf; gegen `stack` (Leave-Day-out) +0,1…+1,8 % — der In-sample-Vorteil der Tabelle |
| **E4** fix + noshrink gegen MOSMIX der Nachbarstation | **GILT (indikativ)** | 16 von 16, MAE +30…+50 % |
| **E3 / K5** Motor = Offline-Form ohne Schrumpfung | **NICHT bestanden** | T, Td, Bewölkung exakt (max \|Δ\| 0); Wind max 0,53 m/s, Böe max 4,6 m/s — die Offline-Form kennt die Regime-Aufweitung der Rice und den Böen-Boden (Böe ≥ 1,15 · Windmedian) nicht. Maßgeblich ist der Motor (V-FS-8) |
| **E3 / K6** Stationswert des Motors = `stack:in` | **NICHT bestanden** | M und I exakt (max \|Δ\| 0 bzw. 2e-15); L weicht ab: p50 0,05 K, max 0,17 K — dem Client fehlt das Merkmal `lake` (V-FS-6). Wirkung auf den Wert ≤ 0,07 |
| H9–H14, D1, D2 neu mit L wie der Client | unverändert | dieselben Verdikte wie Lauf 1 |

**Absolut, Modus S (MAE; Auszug aus `fs-decision-run2.md`):**

| Zelle | MOSMIX | live | Kette (HEAD) | + fix | + noshrink | product-FS | stack (LDO) |
|---|---|---|---|---|---|---|---|
| T 0–6 h (K) | 0,827 | 0,898 | 0,991 | 0,929 | 0,816 | **0,718** | 0,719 |
| T 25–48 h | 0,972 | 0,995 | 1,094 | 1,058 | 0,938 | **0,926** | 0,927 |
| Td 0–6 h (K) | 0,843 | — | 0,886 | 0,879 | 0,877 | **0,688** | 0,695 |
| Td 25–48 h | 1,217 | — | 1,298 | 1,270 | 1,173 | **1,086** | 1,099 |
| Wind 0–6 h (m/s) | 0,672 | 0,725 | 0,850 | 0,842 | 0,831 | **0,644** | 0,636 |
| Wind 25–48 h | 0,762 | 0,809 | 1,033 | 1,039 | 0,988 | **0,761** | 0,760 |
| Böe 0–6 h (m/s) | 0,972 | 0,980 | 1,091 | 1,093 | 1,048 | **0,887** | 0,891 |
| Böe 25–48 h | 1,167 | 1,139 | 1,459 | 1,394 | 1,309 | 1,146 | 1,160 |
| Bewölkung 0–6 h (%) | 22,2 | 21,8 | 25,7 | 25,7 | 21,9 | **21,0** | — |
| Bewölkung CRPS 0–6 h | 22,2 | 21,8 | 18,6 | 18,6 | 15,7 | **14,5** | — |

**Lesart:** Die beiden Korrekturen allein bringen T und Td an MOSMIX heran oder darüber (T 7–120 h +3…+7 %*), Wind und Böe nicht (−21…−29 %
bzw. −5…−14 % gegen MOSMIX) — dort fehlt der Kombination das Gewicht für MOSMIX. Erst der Stationswert schließt die Lücke.

## 5 Befunde (V-FS-NN — Mehrwert und Skizze)

- **V-FS-1 — Die gesetzten σ geben MOSMIX bei Wind, Böe und Td zu wenig Gewicht** (D1). *Mehrwert:* das erklärt den Rückstand von
  26–34 % beim Wind in FV-A. *Skizze:* der Stationswert ersetzt die Kombination an der Station; abseits davon σ des Stationsmembers je
  Abstand und Δh aus dem Archiv fitten, sobald ≥ 30 Ausgabetage je Bin da sind (FL-AP6).
- **V-FS-2 — Das gelernte Mittel wurde doppelt korrigiert.** `cubeSource.ts` schreibt `pr.mu.t` (am Punkt) in das Member, dessen
  `sourceElevation` die Modellhöhe bleibt; der Motor addiert Δh · 6,5 K/km (Td 1,8 K/km) und multipliziert Wind und Böe mit
  `windTerrainFactor`. `applyVertical` kompensiert das für PAP 4 vor, die Lernstufe tat es nicht. *Mehrwert:* T ohne Station +8…+18 %,
  Böe +5…+9 %. *Skizze:* gebaut als `learnedAtPoint`; gehört zu jedem Einschalten von `learned`.
- **V-FS-3 — Doppelte Schrumpfung** (D2). Der `errorSigma`-Pfad von `fuseScalar` umgeht die H-1-Korrektur des alten Pfads. *Skizze:*
  gebaut als `priorShrink: false`; Niederschlag und der Klimatologie-Schwanz behalten den Schritt.
- **V-FS-4 — Das Gewicht der Innovation klingt beim Wind nicht ab:** w 0,62 (τ = 1 h) → 0,15 bei 25–120 h, Böe 0,10–0,12; T 0,86 → 0,04.
  Bei großem τ ist das kein Wetterfehler mehr, sondern der Ortsfehler von MOSMIX in diesen zwei Wochen. *Mehrwert:* ein Stationsbias
  ist über die Innovation ohne eigene Stationstabelle nutzbar. *Skizze:* mit mehr Archiv trennen — w(τ) aus der jüngsten Messung, ein
  gleitender Stationsbias aus den letzten Tagen.
- **V-FS-5 — Schweiz: Wind und Böe des Stationswerts ab 7 h schlechter als MOSMIX** (−2,0…−4,6 %! bzw. −4,3…−9,3 %!); AT +4…+15 %*, DE
  gleichauf. Die Parameter sind über DACH gepoolt. *Skizze:* c und b je Land oder Höhenband, mit Mindestzeilen und Rückfall auf den
  gepoolten Eintrag; vorab als Behauptung einfrieren.
- **V-FS-6 — Die Lernstufe des Clients ist nicht die des Scorers.** Der Client übergibt `dLakeM: null` (256 von 389 Punkten tragen das
  Merkmal `lake`) und kein Höhenband (gepooltes statt Band-Windgesetz). \|ΔL\| T p50 0,05 K, max 0,16 K. *Mehrwert:* `fl-K@5e` der Karten
  beschreibt nicht exakt, was der Browser rechnet. *Skizze:* `dLake` aus der Landbedeckung in den Client (AP16 trägt die Kacheln schon),
  Band aus h_true; bis dahin Karten mit der Client-Form rechnen (`Lc`).
- **V-FS-7 — Am stationslosen Punkt gewinnt die Lernstufe klar, aber mit Heimvorteil.** MOSMIX der Nachbarstation (höhenkorrigiert) hat
  T-MAE 1,9–2,6 K gegen 1,2–1,5 K. Der Punkt ist aber eine Station des Fits. *Skizze:* dieselbe Karte mit den Leave-Region-out-Tabellen
  (Anspruch B) — das ist die Zahl für einen echten Punkt ohne Station.
- **V-FS-8 — Die Offline-Form ohne Schrumpfung ist für Wind und Böe nur eine Näherung** (K5). *Skizze:* Kandidaten für Wind und Böe
  künftig aus dem Motor rechnen (`priorShrink: false`), nicht aus `rawMu`.
- **V-FS-9 — Der Stationswert lässt Feuchte, Phase und Richtung bei der Kombination.** RH folgt aus dem T und Td der Kombination, nicht
  aus dem Stationswert; Td ≤ T ist nicht erzwungen. *Skizze:* RH und pSnow nach dem Stationswert neu ableiten (Motor, eigenes Gate).
- **V-FS-10 — Kein Leser für die Tabelle im Client (erledigt, §7.1).** `input.stack` erreicht den Motor nur über den Aufrufer; `CubeIo` lädt sie nicht.
  *Skizze:* `CubeIo.stackSource: 'json'` wie `learnedSource`, Pfad `point/stack.client.json`, Publisher-Weg = dein Gate.
- **V-FS-11 — Werkzeug:** Backticks in einem Bash-Heredoc werden ausgeführt (ein Kommentar in `fuse.ts` verlor drei Code-Spannen, am Diff
  gefunden); der Fit-Cache trug die Sperre nicht im Schlüssel (Verifier 17b fand es vor dem ersten Lauf).

## 6 Entscheidungen für Jan (E-FS-NN, auch in `MANUELLE-SCHRITTE.md` §24)

- **E-FS-1 `learnedAtPoint` zur Voreinstellung von `learned` machen?** Es ist eine Fehlerkorrektur im Lernpfad; heute hinter der Option,
  damit FV-A reproduzierbar bleibt. Empfehlung: ja.
- **E-FS-2 `priorShrink: false` für den Cube-Pfad?** D2 bestätigt. Empfehlung: ja, zusammen mit E-FS-1.
- **E-FS-3 Stationswert einschalten?** Braucht den Leser (V-FS-10) und den Publisher-Weg der Tabelle. Empfehlung: erst nach ≥ 30
  Ausgabetagen neu fitten und V-FS-5 (Schweiz) klären; bis dahin nur hinter `?pf=cube`.
- **E-FS-4 `learnedClouds`?** H14 gilt. Empfehlung: ja, mit `learned`.
- **E-FS-5 berührt E-FV-2:** die Empfehlung „Lernstufe noch nicht einschalten" galt der Kette mit beiden Fehlern. Mit E-FS-1/2/4 ist die
  Kette an der Station bei T und Td auf MOSMIX-Niveau, bei Wind und Böe erst mit dem Stationswert.
- **E-FS-6 totalJs** 1 450,6 KB > 1 438 (+3,0 KB).

## 7 Einschalten im Client (Jans Auftrag 28.09. abends: „wer buscosun Fusion abfragt, bekommt die neueste Stufe")

### 7.1 Gebaut

- **Leser** `src/point/client/stackPoint.ts` für `point/stack.client.json` (`POINT_STACK_PATH`), Muster wie `learnedPoint.ts`: geprüft, nie
  blockierend, nie still. `CubeIo.stackSource: 'json'` (V-FS-10 erledigt).
- **Ein Schalter** `CubeIo.stage: 'fs'`: liegen die gelernten Tabellen vor, rechnet der Cube-Pfad mit `learnedSpeed`, `learnedPrecip`,
  `learnedAtPoint`, `learnedClouds`, `priorShrink: false`; liegt zusätzlich die Tabelle des Stationswerts vor, mit `stationValue`. Ohne
  Tabellen rechnet er byte-gleich wie ohne Schalter (keine der Optionen ist ohne Lernstufe gemessen) und sagt es. Ausdrückliche
  `fuse`-Optionen haben Vorrang.
- **Voreinstellung des Browsers** (`defaultCubeIo`): `learnedSource`, `climaSource`, `stackSource` = `json`, `stage: 'fs'`. Der
  Cache-Schlüssel trägt beides.
- **V-FS-12 behoben:** die Formen ohne Messung (B, S0) werden auf jeder Zeile gefittet (Lauf 3). Vorher fand eine Abfrage ohne
  rechtzeitige Messung keinen Eintrag — im Browser ist das jede erste Ausgabe. Der Motor zählt jetzt, an wie vielen Schritten der
  Stationswert gesetzt wurde, und sagt „an keinem Schritt gesetzt", wenn die Tabelle nichts trägt.
- **Veröffentlichungspaket** `C:\dev\buscosun-hindcast\publish\2026-09-28-fs\` mit `SHA256SUMS`, jede Datei mit dem Leser des Clients geprüft:

| Pfad im Daten-Repo | Bytes (gz) | sha256 | Herkunft |
|---|---|---|---|
| `point/fusion.client.json` | 132 954 (28 999) | 0739ead7ab3a0206… | Fit 5e, `fit\2026-09-27-fx5e` |
| `point/static/clima/v1/stations.json` | 49 545 (12 289) | 85d73cead2cb9b0d… | Klimatologieprodukt, `product\2026-09-27` |
| `point/stack.client.json` | 21 494 (8 075) | 8ac008f32fdc3bf0… | Stationswert, `fit\2026-09-28-fs`, 220 Einträge |

### 7.2 Gemessen

- **E5 (Stationswert ohne Messung, Leave-Day-out, gegen MOSMIX): GLEICHSTAND** — 9 Zellen signifikant besser (T +1,5 / +5,9 / +4,6 /
  +2,4 %, Td +5…+13 %, Böe 7–24 h +2,1 %), 6 gleichauf, 1 signifikant schlechter (Wind 51–120 h −1,0 %). Gegen live: T +9 / +9 / +7 %,
  Wind +8 / +7 / +6 % (0–48 h). Mit Messung bleibt es bei H10 (§4.1).
- **Ende-zu-Ende gegen den echten Cube am CDN** (`fs-live-check.md`, drei Stationspunkte DE/AT/CH): ohne die Dateien wirkt die Stufe nicht
  und nennt jede fehlende Datei; mit dem Paket stehen alle sieben Zeilen der Stufe in `calib`. Rechnung 50–110 ms wie vorher.
- **Die Temperatur ändert sich sichtbar:** am 28.09. −0,1 … +2,0 K gegenüber der Kette von heute (Chasseral +24 h 13,3 → 15,2 °C, MOSMIX
  14,4 °C). Ursache ist die Lage, nicht ein Fehler: eine starke warme Anomalie, die der Klimatologie-Schritt der alten Kette um 1,3–2,6 K
  zur Klimatologie zog (β 0,73–0,84).
- **Gates:** typecheck grün · `verify:pv-cube` **338/338** (Block 29, 7 Prüfungen) · `verify:fusion-fit` 119/119 · `verify:point-client`
  167/167 · `verify:pv-fusion` 229/229 · Build 241/241 · eagerJs 107,9 · totalJs **1 451,2 KB > 1 438** (+0,6 KB).

### 7.3 Freigeschaltet (29.09., Jans Auftrag und Erlaubnis)

- **Daten-Repo:** die drei Dateien stehen auf `origin/main` von `buscosun-data` — Commit `3dd7475` (29.09. 04:52 UTC, außerhalb der
  Fenster der Kartenlinie; genau drei neue Dateien, kein anderer Pfad berührt; Prüfsummen im Index gleich `SHA256SUMS`). Gebaut auf der
  Spitze von `origin/main` als gewöhnlicher Push (kein Force-Push), danach nachgesehen. Am CDN antworten alle drei mit 200, auch unter
  `@main` — kein Purge nötig.
- **Panel:** buscosun Fusion auf dem Cube ist die Voreinstellung (`pfFlags.ts`); `?pf=live` zeigt den Live-Pfad wie vorher (benannter
  Rückfall). Scheitert der Cube-Pfad, fällt das Panel von selbst auf den Live-Pfad zurück (`cubeFailed`) statt einen Fehler zu zeigen.
- **Gegen das echte CDN ohne Überlagerung** (Chasseral, Hamburg, Wien): alle Zeilen der Stufe in `calib`, Stationswert an 240 Schritten.
- **Im Browser** (Dev-Server, Desktop 1440×900, Ort München OHNE `?pf=cube`): Abzeichen „buscosun Fusion · Cube", Tab „Bandbreite",
  Notiz `stage:fs — neueste Stufe …`, `learnedAtPoint` an 104 Schritten, Stationswert an 240 Schritten; erste Ausgabe 2,1 s, Kern 2,5 s,
  Nachlieferung 3,7 s (kalt); Konsole ohne Fehler aus diesem Pfad (vier 404 des Radar-Spiegels, vorbestehend).
- **Gates:** typecheck grün · `verify:pv-cube` 338/338 · `verify:point-client` 167/167 (10m auf die neue Voreinstellung umgestellt) ·
  Build 241/241 · eagerJs 107,9 · totalJs 1 451,2 KB > 1 438.

**Noch offen:**

1. **Commit, Push und Deploy von `buscosun-web`** — der Code liegt lokal. Erst danach sieht es ein Nutzer auf buscosun.com.
2. **Das Panel ist in Produktion nur mit `?startnow=0` sichtbar** (V-FI-53, Erstbild-Modus der Karte) — unabhängig von dieser Phase.
3. **Real-Device** (V-FI-50): nicht geprüft; die Rechnung läuft ≈ 300 ms synchron auf Mobil.
4. **V-FS-15 — Im Browser trägt der Stationswert selten eine Innovation:** die Messung kommt von der nächsten Messstation (München:
   5 km entfernt, Repräsentativität 0,28) und liegt damit außerhalb der Reichweite „am Punkt" ⇒ Formen ohne w·I (E5: Gleichstand mit
   MOSMIX statt Vorsprung in 0–6 h). *Skizze:* die Messung der MOSMIX-Station selbst holen (Stations-ID aus dem Katalog).
5. **V-FS-16 — Das Panel zeigt weiter das Etikett „LIVE"** neben „Punktforecast" (kosmetisch, `MapView.tsx`).

### 7.4 Befunde

- **V-FS-12 — Formen ohne Messung fehlten in der Tabelle** (s. 7.1). *Mehrwert:* die erste Ausgabe trägt den Stationswert.
- **V-FS-13 — Gecachte 404 am Edge:** die drei Pfade sind am 28.09. abgefragt worden und antworten 404. Nach der Kopie ins Daten-Repo
  braucht jeder einen Purge, sonst liefert jsDelivr die 404 weiter. *Skizze:* die drei Pfade in die Purge-Liste des Publishers.
- **V-FS-14 — Der Sprung zwischen erster Ausgabe und Nachlieferung:** die erste Ausgabe rechnet ohne Messung (Form S0), die
  Nachlieferung mit (Form S). In 0–6 h ändert sich T dabei um w·I (w 0,86 → 0,47). Dasselbe Verhalten wie beim Anker heute.
