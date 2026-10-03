# NP-0b Diagnose (Fork C): D-NP0-9, D-NP0-11, D-NP0-13, D-NP0-14

> 2026-10-03. Rein lesend, kein Eingriff in `src/`/`scripts/`, Daten-Repo nur gelesen. Datengrundlage: lokaler Klon
> `C:\dev\buscosun-data` Stand `75da5254` (30.09. 22:07 UTC, Cube-Schema 6): t1 = Lauf `2026093018` (208 Chunks,
> 87,19 MB), t2/t3 = Lauf `2026093012` (56 Chunks 9,17 MB / 12 Chunks 1,99 MB; erster Schema-6-t3-Lauf). Gelesen mit
> **demselben Dekoder wie die Clients** (`decodeCubeChunk`, Ebenenliste aus `run.json`). Messskript:
> `audit/np0-datenprodukte/field-proto.mjs` (`--mode=stats` Abdeckung/Wertebereiche, `--mode=proto` Feldbau mit Zeiten
> und Bytes). D-NP0-10/12 (Kette F1, Archivmessung) gehören Fork D.

## Anker aus §1.1 nachgeprüft (Arbeitsbaum 03.10., nach RR-Commit)

| Anker im Plan | Ist |
|---|---|
| `cubeFormat.ts:246` Größenliste | `CUBE_VARS` :246, `precip` :262, `snowlmt` :271 ✓ |
| `sparseCover.mjs:23` | `PUBLISH_PATHS = [point, .gitattributes]` :23 ✓ |
| `prune.mjs` `runsIn` | :16 (Regex `^\d{10}$`), `retainRuns` :91 |
| `publish-point.mjs:141` | `const kept = runsIn(point/)` :141 ✓ |
| `verify-point-data.mjs:837` | `JOB_MAX_MIN_BY_TIER = { t1: 20, t2: 15, t3: 15, 'stations-s': 6 }` :837 ✓ (t3 seit 30.09. 15, nicht 10) |
| `cdnSync.mjs` | `classifyPointPath` :86, `WARM_ORDER` :100, `JOB_MEASURED_MAX_MIN = { t1: 14.2, t2: 10.7, t3: 8.4, stations-s: 3.2 }` :69, `CDN_BUDGET_S_BY_TIER = { t1: 240, t2: 180, t3: 180, stations-s: 60 }` :57 |
| `fuse.ts:786–850` K-2 | Niederschlagsblock beginnt :787 ✓ |
| `dist.ts:253` | `quantileOf` :253 ✓ |
| Workflow-Vorlage | t1 `timeout-minutes: 45` :149, t2 60 :246, t3 40 :335, stations-s 20 :405 |

**Hinweis für Fork D / E-NP0-4:** Die Kette „K-2 → gelernte Hürde → `precipCal`" in §1.1 stimmt für **buscosun Fusion 8
nicht**: `precipCal` ist in der Stufe `fs` **aus** (CLAUDE.md „Fusion 8" = Fusion 7 + `nowcastHourMean`; die
Nachkalibrierung war GLEICHSTAND und wurde nicht eingeschaltet; `cubeSource.ts:999/1603` wirkt nur mit
`FuseCubeOptions.precipCal`). F1 „wie Fusion 8" heißt also K-2 → gelernte Hürde, **ohne** `precipCal`.

## D-NP0-9 — Einheiten, Bedeutung, Abdeckung

**`precip` = mittlere Rate in mm/h über das Stufenintervall (t − Δ, t]**, Δ = Stufenschritt (t1 1 h, t2 3 h, t3 6 h).
Beleg `build-point-cube.mjs:428–447`: aus laufakkumulierten Quellen `rate = max(0, (Summe[t] − Summe[t−Δ]) / Δ)`, ohne
Referenzschritt MISSING (nie 0); C-LAEF liefert schon die Stundensumme (`geosphere.mjs:37`). Folge für das Feld: eine
t3-„Rate" ist ein 6-h-Mittel — ein Schauer mit 6 mm in einer Stunde steht dort als 1 mm/h. Das Feld muss `stepH` je
Stufe nennen und darf t2/t3-Raten nicht wie Stundenraten beschriften (Skalen in derselben Legende ⇒ V-NP0-c1).

| Ebene | Bedeutung (Code/Manifest) | t1 (0,05°, 49 Schritte) | t2 (0,10°, 24) | t3 (0,25°, 36) |
|---|---|---|---|---|
| `precip` | Mittel über ALLE gelesenen Quellen (assigned + diversity), gleiche Gewichte (`run.json` `fusion.weights: equal`) | 100 % | 100 % | 100 % |
| `precip_sd` | σ_div zwischen Quellen, Bessel, braucht ≥ 2 Quellen | 81,9 % | 100 % | 100 % |
| `precip_sd_ens` | σ_ens zwischen Membern EINER Quelle je Stunde (`ensemble.byHour`) | 16,3 % — nur **8 Schritte** (3, 9, …, 45: ICON-D2-EPS 6-stündlich) | 8,3 % — nur **60, 72** | 11,1 % — nur 192/240/288/336 (IFS-ENS) |
| `precip_q10/_q90` | Quantile EINER Quelle: t1 C-LAEF-EPS (P10/P90 publiziert, `single-source`), t2/t3 Typ-7 über die Member (roh, unkalibriert) | 59,7 % — alle 49 Schritte, aber nur **≤ 51,45° N** (C-LAEF-Gebiet; Norddeutschland fehlt) | 8,3 % — nur 60, 72 | 11,1 % — nur 192…336 |
| `precip_ens` | Member-Mittel (Schema 6), nur t3 | 0 % (by design) | 0 % | 11,1 % |
| `snowlmt` | Schneefallgrenze **m ü. NN** (`punktdaten-versorgung.md:443`), Mittel der Quellen mit Wert; ICON-CH maskiert dort, wo kein Niederschlag fällt (MISSING, nicht 0) | 100 % | 100 % | **0 % — keine t3-Quelle führt `snowlmt`** (ICON global/IFS/AIFS) |
| `snowlmt_sd` | σ_div | 82,7 % | 45,7 % | 0 % |
| `snowlmt_sd_ens` | σ_ens (nur ICON-CH1/CH2-EPS führen SNOWLMT) | **0 %** — `byHour` nimmt ICON-D2-EPS (ohne snowlmt) | 0 % | 0 % |
| `snowlmt_q10/_q90` | C-LAEF-EPS | 59,7 % (≤ 51,45° N) | 0 % | 0 % |

Wertebereiche (gemessen, alle Zellen × Schritte): `precip` t1 p99 2,3 · p99,9 5,5 · max **17,5** mm/h; `precip_q90` t1
max **29,3**; t2 max 3,5 (q90 0,48); t3 max 3,4 (q90 2,75) — die 3-/6-h-Mittel sind klein. `precip_sd` max 26,4. Kein
Wert > 100 mm/h in irgendeiner Stufe (0 von 2,37 Mio. / 0,29 Mio.). Anteil ≥ 0,1 mm/h: t1 14,4 %, t2 2,6 %, t3 34,6 %.
`snowlmt` t1 1 303…3 525 m (q10/q90 1 987…3 789), t2 891…3 459 m; `snowlmt_sd` t1 p50 142 / p90 831 / max 1 437 m.

**Nebenbefund (V-NP0-c2):** t2 `ensCount` ist an 6 Schritten belegt (60…120), `precip_sd_ens`/`_q90` aber nur an 60/72
— ICON-EU-EPS hat für 84…120 h keine Niederschlagsrate (`ensemble.sources[0].noRate: 4` im `run.json`; 12-h-Schritt ohne
Vorschritt). Producer-Thema, nicht NP-0.

## D-NP0-11 — Spanne der Schneefallgrenze in buscosun Fusion 8

- Der Punktwert ist der **rohe Zellwert** `snowlmt` (`cubeSampleOf` → `snowLine: num(v.snowlmt)`, `cubeSource.ts:417`;
  `output.ts` `fromCell(step, 'snowline', 'snowlmt')` :380) — ohne Höhen-/Geländekorrektur, ohne Lernstufe.
- Spanne (`output.ts:284–299`): **σ = σ_ens, sonst σ_div, sonst keine**; p10/p90 = Wert ∓ 1,2816·σ (Normalannahme),
  `dist: normal`, `sigmaKind` `ensemble`/`divergence`/`none`, Kalibrierschlüssel `sigmaCubeOnly` (set) bzw.
  `noSigmaPlane`.
- Die gemessenen Quantile `snowlmt_q10/_q90` (C-LAEF-EPS) trägt `cubeSampleOf` zwar in die Samples, **aber weder Motor
  noch `output.ts` rechnet mit ihnen** (`cubeSource.ts:2063–2066`, „AP12 (c)"; sie fehlen sogar in `CUBE_ANSWER_PLANES`).
- **Folge für das Feld:** „dieselbe Regel wie Fusion 8" heißt Mitte = `snowlmt`, Band symmetrisch ∓ 1,2816·(σ_ens ??
  σ_div), Herkunft ∈ {keine, σ_div, σ_ens}. Der Plan-Code „1 = Quantile einer Quelle" (§3.3 NP-0b-2) wäre eine
  **Abweichung** von Fusion 8 — und sie ist groß: wo beide da sind (t1, 1,42 Mio. Zellen·Schritte), liegt das σ-Band unten
  im Median **382 m** und oben **88 m** neben C-LAEF-q10/q90. Nicht mischen (CLAUDE.md), und ohne Entscheidung nicht
  anbieten. Heute kommt in t1/t2 nur σ_div vor (σ_ens 0 %, s. o.); t3 hat keine Schneefallgrenze ⇒ Feld „fehlt", ehrlich
  benannt.
- Klemmung: unteres Band < 0 m an 0,0 % (t1/t2), oberes > 6 350 m an 0,0 %.

## D-NP0-13 — Laufzeit und Größe

Prototyp (`field-proto.mjs --mode=proto`): liest alle Chunks einer Stufe von der Platte (wie der Feldschritt nach dem
Bau), dekodiert 13 der 61 Ebenen, rechnet je Zelle und Schritt F2 (zensierte Normal auf Cube-Mittel und σ_ens ?? σ_div:
P(≥ 0,1 mm/h), Median | nass, q90 über `dist.ts` `cdfOf`/`quantileOf`), F3 (Mittel + q90-Ebene) und die Schneegrenze
(Mitte/unten/oben), kodiert je Schritt drei RGBA-PNGs (`scripts/lib/png.mjs`), schreibt sie. **F1 ist nicht enthalten**
(Fork D) — seine Kosten je Auswertung entscheiden, s. Budget unten.

⚠ Gemessen unter Fremdlast: drei weitere Diagnose-Forks liefen parallel, CPU-Auslastung 100 % vor und nach dem Lauf.

| Stufe | Zellen × Schritte | Lesen+Dekodieren | Rechnen | PNG | Schreiben | **gesamt lokal** | **× 2 Runner** |
|---|---|---|---|---|---|---|---|
| t1 (1. Lauf) | 48 441 × 49 | 6,1 s | 1,0 s | 1,0 s | 0,2 s | **8,4 s** | ≈ 17 s |
| t1 (Wiederholung am Ende) | | 10,6 s | 1,3 s | 1,6 s | 0,3 s | **13,9 s** | ≈ 28 s |
| t2 | 12 221 × 24 | 1,5 s | 0,3 s | 0,2 s | 0,1 s | **2,1 s** | ≈ 4 s |
| t3 | 2 009 × 36 | 0,4 s | 0,2 s | 0,1 s | 0,2 s | **0,9 s** | ≈ 2 s |

Das Dekodieren (`inflateRaw` + CRC) dominiert; die Rechnung F2/F3 kostet ≈ 0,4 µs je Zelle·Schritt·Größe.

**Bytes** (PNG je Schritt; Schneegrenze mit dem σ-Band ist schlechter komprimierbar):

| Stufe | precip (F2) je Schritt | snowlmt je Schritt | je Lauf (precip + snowlmt) | Läufe in der Aufbewahrung | stehend |
|---|---|---|---|---|---|
| t1 | 28,0 KB | 46,8 KB | **3,66 MB** (1,37 + 2,29) | 9 h bei 3-h-Takt ⇒ 3–4 | 11–15 MB |
| t2 | 4,2 KB | 13,6 KB | **0,43 MB** | 24 h bei 6-h-Takt ⇒ 4–5 | 1,7–2,2 MB |
| t3 | 3,5 KB | 0,09 KB (leer) | **0,13 MB** | 24 h bei 12-h-Takt ⇒ 2–3 | 0,3–0,4 MB |

Summe stehend ≈ **13–18 MB** (gegen ≥ 276 MB `point/`); neu je Tag ≈ 8 × 3,66 + 4 × 0,43 + 2 × 0,13 ≈ **31 MB** Blobs
(t1 +4 % zum Chunk-Volumen von 87 MB je Lauf). F3 allein wäre 21 KB je t1-Schritt.

**Zeitregeln** (Zahlen aus `verify-point-data.mjs`/`cdnSync.mjs`, Feldschritt ×2 obere Messung 0,5 min t1, 0,1 t2,
0,05 t3):

| Regel | t1 | t2 | t3 |
|---|---|---|---|
| F: gemessen + Feld + CDN-Budget + 1 ≤ JOB_MAX_MIN | 14,2 + 0,5 + 4,0 + 1 = **19,7 ≤ 20** ✓ (0,3 min Luft) | 10,7 + 0,1 + 3 + 1 = 14,8 ≤ 15 ✓ | 8,4 + 0,05 + 3 + 1 = 12,5 ≤ 15 ✓ |
| A/B/C/D | unverändert (JOB_MAX_MIN bleibt) | unverändert | unverändert |

**Wichtige Korrektur zu E-NP0-5 (b):** Der Plan sagt „Regel A: 50 min Abstand trägt t1 bis 30". **Regel B bindet
früher:** (1) t1 (:40 in den Stunden 4/10/16/22) wartet hinter t2 (:30): 50 − (15 − 10) = 45 ≥ M + 20 ⇒ **M ≤ 25**;
(2) `stations-s` (:50 in den Stunden 1/7/13/19) wartet hinter t1 (:40): Abstand bis zum Kartenpush 2:30 = 40, also
40 − (M − 10) ≥ 6 + 20 ⇒ **M ≤ 24**. JOB_MAX_MIN(t1) kann also höchstens auf **24** steigen (Regel C dann 24 + 10 ≤ 45 ✓).
Budget für den Feldschritt am Runner: bei M = 20 ≈ **0,8 min**, bei M = 24 ≈ **4,8 min** (= 14,2 + Feld + 4 + 1 ≤ 24).
Für F1 heißt das: die Kette darf je t1-Lauf (2,37 Mio. Zellen·Schritte) lokal höchstens ≈ 0,4 min (M = 20) bzw.
≈ 2,4 min (M = 24) zusätzlich kosten — ≈ 10 µs bzw. ≈ 60 µs je Zelle·Schritt. Messen, bevor E-NP0-5 entschieden wird.
Die gemessenen Maxima stammen vom 15./16.09. (t3 seit Schema 6 nachgezogen, t1 nicht) — vor der Entscheidung die
t1-Jobdauern der Schema-6-Läufe (ab 30.09.) aus der Actions-API nachlesen (V-NP0-c3).

## D-NP0-14 — Was `point/field/` im Publisher, Prune, CDN-Sync und Index braucht

| Baustein | Heute | Folge für `point/field/v1/` |
|---|---|---|
| `git add` (`PUBLISH_PATHS = [point, .gitattributes]`), sparse `point` | deckt `point/field/` mit | nichts zu tun. `.gitattributes` kennt nur `*.bin -text -diff`; PNG ist für Git binär (NUL im Kopf) — `*.png -text -diff` dennoch als Absicherung ergänzen (Muster PD-A) |
| Aufbewahrung `retainRuns` | nur Verzeichnisse `^\d{10}$` unter `point/` | `point/field/` wird **nie** beschnitten ⇒ wüchse unbegrenzt (wie einst `stations/`, `publish-point.mjs:143–149`). Eigene Runde im **Publisher** (nicht im Feldschritt — sonst bleibt bei `POINT_FIELDS=0` der Altbestand liegen). Vorschlag: ein Feldlauf lebt genau so lange wie die Cube-Stufe, aus der er gerechnet ist (`point/<lauf>/<stufe>/` vorhanden), dann gilt die Altersregel je Stufe und der Boden von 2 Läufen automatisch |
| Wächter „kein Chunk ohne Manifesteintrag" | läuft nur über `.bin` in `point/<lauf>/` | stört nicht; eigener Wächter „keine Feld-Datei ohne `field.json`, kein Eintrag ohne Datei" nötig |
| `TIMELESS_PATHS` | `point/index.json`, `static/`, … | `point/field/` **nicht** aufnehmen (die Felder altern) |
| `classifyPointPath` (`cdnSync.mjs:86`) | `point/field/…` ⇒ `'other'` ⇒ **weder gepurgt noch gewärmt** | zwei Klassen: `field-index` (veränderlich, fester Pfad ⇒ purgen + Frischeprüfung wie `run.json`) und `field` (je Lauf unveränderlich ⇒ nur wärmen, in `WARM_ORDER` **nach** `chunk`, damit das Budget zuerst die Chunks trifft). t1 bringt 98 PNG + 1–2 JSON je Lauf; bei Warm-Parallelität 8 und 0,5–2,6 s kaltem TTFB ≈ 10–30 s des 240-s-Budgets |
| `point/index.json` / `run.json` | Leser greifen per Name zu (`index.latestByTier[tier.id]`, `readPoint.ts:277`); `validateRunManifest` prüft nur Bekanntes; kein strenger Schlüsselvergleich gefunden | (a) eigener Feld-Index berührt beide nicht. Alternative ohne zweite veränderliche Datei: der Leser liest `point/index.json` (hat `commit`) und dann den Feld-Index **gepinnt `@<commit>`** — dann ist kein Purge für die Korrektheit nötig |
| Workflow | t1: Build → Publish; t2: Build → MOSMIX-L → MOSMIX-S (beide `continue-on-error`) → Publish; t3: Build → Publish | Schritt „Build fields" direkt nach „Build point cube", vor Publish (t2 vor den Stationsprodukten oder danach — gleichgültig, sie berühren sich nicht). `continue-on-error: true` ⇒ ein Fehlschlag färbt nur den Schritt, die Folgeschritte laufen (Standard-`if: success()` wertet ihn als Erfolg) — derselbe Mechanismus wie V-PD-28. Dazu **`timeout-minutes` am Schritt** (z. B. 3), sonst frisst ein hängender Feldschritt das Jobbudget; auch ein Zeitablauf läuft mit `continue-on-error` weiter |
| Halbfertige Felder | — | Ein abgebrochener Feldschritt hinterließe PNGs, die `git add -A point` mitnimmt. Wie beim Cube (`point/.build`): in eine Ablage schreiben, erst am Ende umbenennen, `field.json` zuletzt; der Publisher-Wächter entfernt Feld-Verzeichnisse ohne `field.json` |
| Welcher Lauf? | Der Bau legt die Stufe unter `publishRun` ab (`placeUnderPublishRun`, `build-point-cube.mjs:1426`), es gibt keine Ausgabedatei mit dem Laufnamen | Feldschritt nimmt je Stufe den Lauf mit dem jüngsten `runAt` der Stufe in `run.json` (dieselbe Regel wie `latestByTier`) und überspringt, wenn `field.json` dieses Laufs schon dieselben Chunk-Bytes nennt (ein Bau ohne neue Stufe baut sonst die alten Felder neu) |

## Vorschlag Kodierung (bestätigt NP-0b-2 mit Messwerten, mit zwei Änderungen)

- **Raster** = Cube-Gitter der Stufe (`TIERS`): t1 241 × 201, t2 121 × 101, t3 49 × 41; Pixel = Zellmittelpunkt
  `lat0 + iy·deg`, Zeile 0 = Norden (der Cube speichert Süden zuerst ⇒ umdrehen und im Vertrag festschreiben).
- **precip-RGBA:** R = Chance, `round(254·p)`; G = Median | nass, B = q90 unbedingt; G/B `0` = kein nasser Teil,
  sonst `1 + round(254·ln(1 + x/x₀)/ln(1 + x_max/x₀))` mit **x₀ = 0,1 mm/h, x_max = 100 mm/h** (Code 1 = 0 mm/h).
  Auflösung bei 0: 0,0027 mm/h (< Cube-Schritt 0,01), oben ± 1,4 % relativ; Sättigung ab 100 mm/h — gemessen nie
  erreicht (max. 29,3). Einheit „mm/h, Mittel über (t − Δ, t]" mit Δ je Stufe im `field.json`.
- **Änderung 1 — Alpha nur 0/255:** der Browser liest PNGs über `createImageBitmap` + 2D-Canvas
  (`browserPng.ts`, `radarImg.ts:403`, `repackSource.ts:604`); dessen Puffer ist vormultipliziert ⇒ RGB eines Pixels mit
  A ∉ {0, 255} kommt **nicht exakt** zurück. A = 255 gültig, 0 fehlt (fehlt ≠ 0). Keine Information in A-Zwischenwerten.
- **Änderung 2 — snowlmt-RGBA:** R = Mitte, G = **halbe Bandbreite** (Band ist nach der Fusion-8-Regel symmetrisch:
  ∓ 1,2816·σ), B = Herkunft (0 kein Band, 2 σ_div, 3 σ_ens; 1 = Quantile einer Quelle nur, falls Jan es trotz
  Abweichung will), A = 0/255. Mitte `1 + round(h/25)` ⇒ 0…6 350 m in **25-m-Schritten** (± 12,5 m; gemessen
  891…3 789 m, 20 m mit Sättigung bei 5 080 m ginge auch, 25 m deckt den deklarierten Bereich 0…6 000 vollständig);
  G `round(1,2816·σ/25)` (gemessen max. 1 842 m = 74 Codes). Untere Grenze < 0 klemmt der Leser auf 0 (gemessen 0 %).

## Neue V-Einträge (Vorschlag)

- **V-NP0-c1** Stufenraten sind Intervallmittel (1/3/6 h) — eine gemeinsame Legende „mm/h" über alle Stufen verwässert
  Schauer jenseits 48 h um den Faktor 3–6. Mehrwert: ehrliche Kartenlegende. Skizze: `field.json` trägt `stepH`, die
  Darstellung (NP-2) nennt „mittlere Rate über 3/6 h" oder rechnet auf Summe je Schritt um.
- **V-NP0-c2** ICON-EU-EPS liefert in t2 bei 84…120 h keine Niederschlagsrate (`noRate`), obwohl die Member gelesen
  sind — σ_ens/q90 fehlen dort. Mehrwert: Spanne bis 120 h statt bis 72 h. Skizze: Vorschritt −12 h im Adapter holen
  (Producer, eigener Antrag).
- **V-NP0-c3** `JOB_MEASURED_MAX_MIN.t1` (14,2 min) stammt aus den Läufen 56–71 (15./16.09.), vor Schema 6 und
  `POINT_Z0MOD`; t3 wurde nach dem ersten Schema-6-Lauf nachgezogen (5,4 → 8,4), t1 nicht. Mehrwert: Regel F rechnet
  mit der echten Zahl, bevor ein Feldschritt die 0,8 min Luft verbraucht. Skizze: Actions-API, Job-Dauern t1 ab 30.09.
- **V-NP0-c4** Im σ_div der Schneefallgrenze steckt die Auflösungsdifferenz (p90 831 m in t1) — das Band ist für die
  Karte sehr breit und unkalibriert (`sigmaCubeOnly`, set). Mehrwert: glaubwürdiger Gürtel. Skizze: nach AP10/Archiv
  c(p,f) je Stufe messen; bis dahin Etikett „Spanne der Modelle, unkalibriert".
