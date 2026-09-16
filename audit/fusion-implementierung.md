# Phase FI — Implementierung von buscosun Fusion auf dem Punkt-Cube (0–336 h, Antwort < 2 s)

> **Plan freigegeben von Jan am 2026-09-16 (Planungssession, `~/.claude/plans/…kind-raccoon.md`).** Dieser Text ist der
> Plan im Wortlaut; die Belege je Etappe werden in **§9 (Etappenprotokoll)** am Ende fortgeschrieben.
> Belegdateien: `audit/fusion-implementierung/latency/*.json` (Laufzeit), `audit/fusion-implementierung/scorecards/*.json` (Backtest).


## Kontext

Der Punkt-Algorithmus („buscosun Fusion", PAP 1–6 in `ABLAUFPLAENE.md`, Quellenwahl in `QUELLENMATRIX.md`) soll für eine beliebige Location und einen Zeitpunkt/Zeitraum 0–336 h die bestmögliche Vorhersage liefern — aus `buscosun-data` (`point/`), verifiziert gegen `buscosun-archiv`. Neu und hart: **Antwortzeit < 2 s end-to-end, Obergrenze 5 s.**

Ausgangslage (Stand 16.09., am Primärdatum geprüft):

- **Datenseite ist bereit** (`audit/punktdaten-umsetzungsplan.md` §8.1): Cube Schema 5, 57 Ebenen, drei Stufen bis 336 h, Stationsprodukt (MOSMIX-L, 3 071 Stationen), `static/hmodel` + `static/urban`, Nowcast-Spiegel, Archiv-Cron (2 Slots: 14.09. lokal, 15.09. Cron — der lokale Klon von `buscosun-archiv` ist einen Commit hinter dem Remote `cdbe952`).
- **Der Algorithmus existiert in zwei Hälften, die sich nicht kennen:** `src/pointForecast/fusion/` (Minimum-Varianz-Kombination, fünf Verteilungsfamilien, Klimatologie-Prior, Stationsanker; `verify:pv-fusion` 222/222) rechnet auf dem **Live-Pfad** (BrightSky, GeoSphere, GFS) und hat **keinen Consumer**; `src/point/client/` liest den Cube und ist mit **nichts** verdrahtet. Kein Modul importiert das andere.
- **PAP 3, 4, 5 und der PAP-6-Unsicherheitsteil sind nicht implementiert** (Nachbargewichtung, Fallunterscheidung A/B/C, `f_rad`/Kaltluftsee/Wärmeinsel/Blending-Height, σ_div²+σ_sys², Konfidenz-Score). `calib.json` trägt **13 × `null`, 0 × `measured`** (der Selbsttest erzwingt das).
- **Laufzeit heute:** Live-Pfad Innsbruck **8,9–11,4 s** (INCA-Endpunkt), Cube-Leser als CLI **2,3–8,2 s** — 18 **serielle** Abrufe, 1,10 MiB Draht, 3 × `run.json`, Nowcast-Sonden ins Leere. Im Browser **nie gemessen**.

Entscheidungen aus dieser Session (Jan, 16.09.): Design-Doku = ABLAUFPLAENE + QUELLENMATRIX; **Integration** (Cube als Hauptmember der bestehenden Fusion, kein Parallelbau); Zeitachse **native Schritte + markierte Interpolation**; Terrain: „prüfe und entscheide" → §0.2.

---

## §0 Ergebnis der Vorprüfung

### 0.1 Gemessene Zahlen, auf denen der Plan steht

| Größe | Wert | Beleg |
|---|---|---|
| t1-Chunk (16×16 Zellen × 49 h × 57 Ebenen, int16, je Ebene deflate) | Ø **454 KB**, max 640 KB | `point/2026091515/t1/*.bin`, 208 Dateien |
| t2-Chunk / t3-Chunk | Ø 155 KB / 124 KB | 56 / 12 Dateien |
| Stationsbündel (t1-Raster, 247 h × 57 Ebenen × n Stationen) | Median 28 KB, München 102 KB, max 151 KB | `point/stations/2026091509/` |
| `index.json` / `run.json` / `catalog.json` / `stations.json` (Draht, br) | 4,9 / 8–12 / 59 / 14 KB | Live-Trace München |
| Voller Punktabruf 0–336 h (Cube + Station + hmodel) | **18 Abrufe, 1,10 MiB Draht, 850 ms warm in Node, seriell** | Trace `read-point` |
| Dekodieren je t1-Chunk (alle 57 Ebenen, `DecompressionStream`) | **74 ms**; nur 1 Ebene 0,5 ms; 8 Zielebenen 10 ms | Node 22 |
| jsDelivr TTFB kalt (Origin kalt) p50 / p90 | **0,60 s / 1,43 s**; skaliert mit Dateigröße (250 KB → 0,97 s); **454 KB nie gemessen** | `audit/layer-ladezeit.md` §4.1 |
| jsDelivr TTFB nach Origin-Warm-up (Publisher-Muster M1) | **0,17 s p50 / 0,56 s p90** | ebd. §4.3 |
| Range-Requests über jsDelivr | **funktionieren** (206, `Accept-Ranges: bytes`, gecacht); 732-B-Präfix = vollständiges Ebenenverzeichnis | live gemessen 16.09. |
| `fuseHour` (bestehende Fusion) | 214 µs je Stunde, 240 h = 51 ms | `implementierung-pv3.md` §4.0 |
| Archiv-Slot | 10,09 MiB gz, 243 Punkte, Wahrheit POI 237/243 + TAWES 11 + SMN 6, Verzug 46 min (POI) / 106 min (TAWES) | Slot 2026-09-14 |
| Actions-Luft im Publish-Job | t1 ≈ 8 min, t2 ≈ 5 min, t3 ≈ 4 min unter `JOB_MAX_MIN` | Läufe 38/42/39/44 |
| Bundle-Ratsche | eagerJs **107,9/107,9 (0 KB Luft)**, totalJs 1 366/1 372 | `budget.json` |

### 0.2 Terrain — geprüft, entschieden

**Befund:** In `buscosun-data` gibt es **kein Geländeprodukt** — weder lokal (Stand 15.09. 20:53) noch am Remote (GitHub-API `/contents/point/static` = `hmodel`, `urban`; Root = `hsurf-v1.png` ist die ICON-D2-Modellorographie der Kartenlinie). Der WorldCover-Spiegel liegt getrennt (`jppetry/buscosun-worldcover`, Landbedeckung, kein DEM). TPI/SVF/Horizont existieren nirgends vorberechnet.

**Entscheidung:** Das Gelände bleibt **Laufzeit am Punkt** (Jans Entscheidung vom 09.09. bleibt; `terrainPoint.ts` ist pur und nimmt eine Höhenfunktion). Begründung mit Zahlen: die Horizontsuche braucht ≈ 370 + TPI 72 DEM-Abfragen aus **2–8 Terrarium-Kacheln** (z9 für den 20-km-Horizont, z11 für TPI 500 m; je 40–80 KB PNG von S3), die **parallel** zu den Cube-Chunks laden und den kritischen Pfad nicht verlängern, solange sie nicht langsamer sind als der größte Chunk. **Auslöser für eine Revision:** misst AP0 einen Beitrag der Kacheln zum kritischen Pfad von > 400 ms (p50, Desktop, neuer Ort), wird ein statisches Produkt `point/static/terrain/` (Zellraster 0,05°, ≈ 8 Felder u8/int16, geschätzt 1–3 MB, TIMELESS) als E-F-6 vorgelegt — mit gemessenem Preis, nicht vorab gebaut. Zwischenstufe ohne Datenprodukt: Terrain je Ort einmal rechnen und in IndexedDB halten (die Wiederholabfrage kostet 0 Kacheln).

### 0.3 Was sich am Design gegenüber ABLAUFPLAENE.md ändert (benannt, nicht still)

| ABLAUFPLAENE | Plan | Grund |
|---|---|---|
| 141 Zeitschritte, stündlich | **109 native Schritte** (49 + 24 + 36) + markierte lineare Interpolation auf Wunsch | Jans Wahl 16.09.; die Cube-Achse ist die Datenachse (E-10) |
| „3 Range-Requests" | 3 **ganze** Chunks parallel (v1); Ebenen-Ranges nur als Härtung (AP12) | Der volle Algorithmus braucht ≈ 45 von 57 Ebenen — Ranges sparen dort < 20 % |
| Wind → Weibull | **Rice** (bestehend, 222/222 geprüft) | Rice ist die natürliche Familie für den Betrag eines normalverteilten Vektors; Weibull nur, wenn der Backtest (AP9) es verlangt |
| Niederschlag „zensiert mit Punktmasse 0" | **hurdleLogNormal** (K-2, bestehend) | zweistufig Auftreten/Menge — die zensierte Normalverteilung war der gemessene Fehler vor K-2 |
| PAP 2 „Bias-Korrektur je Quelle, w = Σ⁻¹1" | bleibt **Producer-Seite, gleiche Gewichte** bis Σ gemessen ist (`fusion.provenance: fallback`) | nicht Teil dieses Plans; AP10 liefert Σ |
| Terrain-Stack ausgeliefert | am Punkt gerechnet (§0.2) | kein Produkt vorhanden |

---

## §1 Analyse Design-Dokument ↔ Datenbestand

### 1.1 PAP-Schritt für Schritt

| PAP | Braucht | Im Cube / Repo | Im Code | Lücke |
|---|---|---|---|---|
| **1** Terrain-Stack | h, TPI×2, SVF, z0, imperv, d0, d_water | hmodel ✓, urban ✓ (imperv/d0/bldgH), Höhe/Landbedeckung extern (Terrarium, worldcover) | `terrainPoint.ts` (TPI, Horizont, SVF, slope, z0) ✓; **kein `readUrbanPoint`** (U-7); `d_water` ✗ | Urban-Leser; d_water (nachrangig) |
| **1** 3 Chunks + Schleife | Chunk je Stufe | ✓ 208/56/12 | `cubePoint.ts` ✓, nichts verdrahtet | Verdrahtung, Parallelisierung |
| **2** Offline-Ingest | T̄, σ, Profilfelder, h_mod_eff, Quantile | ✓ alle 57 Ebenen; Profil **nur t1** (t2 `profile: null`, U-15 offen; t3 standard-lapse) | Producer | PAP 4 Fall B/C nur in t1 möglich |
| **3** Gitter → Punkt | N Nachbarn, d, Δh (h_mod je Zelle), κ (Landnutzung), L_d, L_h | h_mod je Zelle = Ebene `hModEff` ✓; Landbedeckung je **Zelle** ✗ (nur am Punkt) | ✗ (`cellOf` = nearest) | Implementierung; κ = 1 markiert; L_d/L_h `null` → Startwerte `set` |
| **4** Vertikale Korrektur | gamma_eff, z_base, z_inv, dT_inv, h_mod_eff, h_true, φ | ✓ (t1); `phi.shape linear (set)` | nur lineare Lapse (`fuse.ts:632`) | Fall A/B/C, Flag `extrapolated`, Rückfall t2/t3 |
| **5** Terrain-Terme | clct, v10, TPI, SVF, imperv, z0, d0, foehn_prob, A, A_uhi, f_rad-Parameter, tpiSigma, f_saison | Daten ✓ (urban seit 15.09.); **alle Amplituden `null`**; `fSaison` undefiniert (§21 (6)) | Analogon `coldPoolStrength` (multiplikative Gates), Wind-Shelter auf TPI, **kein UHI, keine Blending-Height** | PAP-5-Form mit inaktiven Amplituden bis AP10 |
| **6** Konsistenz/Unsicherheit | σ_div, σ_ens, σ_sys, c(p,f), σ_quant, Familien, conf | σ_div/σ_ens/q10/q90/srcCount/ensCount ✓; **σ_sys, c(p,f) `null`** | Td ≤ T ✓, Böe ≥ Wind ✓, `clct = max(...)` ✗, Familien ✓, **conf ✗** | σ-Rechnung, σ_quant, Konfidenz-Score, Provenienzregel |
| Nowcast 0–3 h | RV/INCA/RZC am Punkt | Spiegel ✓, kein Slot-Index (V-PD-52), `validAtMs`-Falle (V-PD-56) | `nowcastPoint.ts` ✓ | `latest.json` (Spiegel-Workflow, S&F) — sonst 1–3 Sonden |
| Anker (Stationsmessung 6 h) | Messung − Modell | **nicht im Repo** (`point/obs/` offen) | `anchor.ts` ✓ über BrightSky/TAWES/SMN | bleibt extern, mit Frist, nie blockierend |
| Klimatologie | Stundenklimatologie je Ort | `public/climaGrid.json` (Tagesauflösung, Meteostat CC BY) | `attach.ts` ✓ | stündlich (V-PV-18) = AP10-Nebenprodukt |
| UV | uvIndex | ✗ nicht im Cube | `fetchDwdUvPoint` (DE) | bleibt Live-Abruf, nicht blockierend |

### 1.2 Archiv für den Backtest

| Frage | Antwort |
|---|---|
| Was liegt je Punkt und Slot? | `cube.t1/t2/t3` **alle 57 Ebenen int-kodiert** (exakte Replay-Basis für PAP 3–6), `stations`, `nowcast`, `hmodel`, `plan`, `live` (Altpfad-Felder + Fusion mu/q10/q50/q90/rawσ — 81 % der Bytes), `truth` (POI/TAWES/SMN, 24 h rückwärts) |
| Ab wann ist Lead h bewertbar? | Slot N + ⌈h/24⌉ Tage: 0–24 h ab Tag 2, 48 h ab Tag 3, 120 h ab Tag 6, **336 h ab Tag 15**; ≥ 30 unabhängige Fälle je Bin ⇒ t3-Aussagen frühestens **Ende Oktober 2026** |
| Punkte | 243 = MOSMIX ∩ POI ∩ WMO 10/11/06 — **DE 208 (Kern), AT 23, „CH" 12 = WMO-Block 06 inkl. NL/DK/LU** (nur 6 echte SMN). Backtest berichtet DE getrennt; AT/CH über PA2 auffüllen |
| Fallen | TAWES/SMN `rr1` = 10-min-Rate × 6, POI = Stundensumme; `Dist`-Objekt der alten Fusion nicht archiviert (nur 3 Quantile) |
| Fehlt | Werte je Einzelquelle (E-D-1) — Σ je Quellenpaar erst mit PA6 |

**Satz zur Lage:** Die Daten tragen den Algorithmus; was fehlt, sind (a) die Rechnung PAP 3–6 am Punkt, (b) der schnelle Lesepfad und (c) die Kalibrierung, die erst aus dem Archiv fällt. Bis (c) liegt, sind p10/p90 **Setzungen** und werden so ausgewiesen.

---

## §2 Zielgrößen und Ausgabeformat je Abfrage

Eingang: `{ lat, lon, at | from/to, hourly?: boolean, elevM? }`. Ausgang `PointForecastV2` (neu, `src/pointForecast/fusion/output.ts`), pur serialisierbar:

```ts
interface PointForecastV2 {
  schema: 2;
  point: { lat, lon, hTrue, terrain: { tpi500, tpi2000, svf, slope, aspect, z0, imperv, d0, dWater? }, terrainSource: 'terrarium-z11' };
  axis: { steps: StepV2[]; native: number[]; interpolated: number[]; gaps: [number, number][]; usableToMs };
  provenance: { indexCommit, runs: { t1, t2, t3, stations, nowcast }, ageH: {...}, calib: CalibFlag[], fetched: { files, bytes, ms } };
  timing: { fetchMs, decodeMs, terrainMs, algoMs, totalMs };            // AP0-Instrumentierung, bleibt im Produkt
}
interface StepV2 {
  validAtMs; leadH; tier: 't1'|'t2'|'t3'|'station'|'nowcast'|'clima'; interpolated: boolean;
  vars: Record<'t2m'|'td2m'|'rh'|'wind'|'windDir'|'gust'|'precip'|'clct'|'clcl'|'clcm'|'clch'|'ps'|'snowline'|'pSnow', VarV2 | null>;
  flags: ('extrapolatedBelowModel'|'inversionBody'|'stdLapseFallback'|'chunkBorderTruncated'|'belowGround925'|'nowcastFallbackModel'|'climatologyOnly'|'stale')[];
}
interface VarV2 {
  p10; p50; p90; mean; sigma;                      // Einheit wie im Cube-Manifest
  dist: Dist;                                      // normal | censoredNormal | hurdleLogNormal | rice (dist.ts)
  sigmaKind: 'ensemble'|'divergence'|'sys-only'|'set';
  confidence: { score: number; spread; agree; lage };   // 0..1, Produkt der drei Faktoren (§2.2)
  members: MemberV2[];                             // „Quelle + Gewicht"
  calib: CalibFlag[];                              // z. B. 'sigmaSys:set', 'cSpread:set'
}
interface MemberV2 { product: 'cube-t1'|'cube-t2'|'cube-t3'|'station'|'nowcast'|'anchor'|'climatology';
  weight: number; run?: string; runAt?: string; ageH?: number; models?: string[];   // aus run.json tiers[].sources
  station?: { id, name, distKm, dElevM }; nowcast?: { source, ageMin, validAtSuspect } }
```

**2.1 Zielgrößen und Familie** (Reihenfolge = Gate-Reihenfolge aus `verifikation.md` §3): t2m (normal) · Wind/Böe (rice, Böe ≥ Wind) · P(nass) + Menge (hurdleLogNormal) · clct/clcl/clcm/clch (censoredNormal 0–100, `clct := max`) · td2m (normal, ≤ t2m) und rh abgeleitet · ps (normal) · Schneefallgrenze/pSnow (Feuchtkugel, `meteo.ts`) · Windrichtung mit Konzentrations-Gate (kein Quantil).

**2.2 Konfidenz-Score** (PAP 6 O8) — ein Index 0…1, ausdrücklich **keine Wahrscheinlichkeit** (V-PV-02), jeder Faktor eine monotone Abbildung gemessener Größen, Startform `set`, im Backtest auf Monotonie gegen CRPS geprüft (Score-Dezile vs. Fehler):
- `spread = 1 − min(1, σ_ges/σ_clima)` — 0, wenn die Aussage nicht schärfer ist als die Klimatologie;
- `agree = σ_ens²/(σ_ens²+σ_div²)` bei Ensemble bzw. `1 − σ_div²/σ_ges²` sonst, gewichtet mit `min(1, srcCount/3)`;
- `lage = ∏ Abschläge` je Flag (Fall C, Zelle > 300 m über/unter dem Punkt, Chunk-Rand, Interpolation, Modell statt Nowcast, Station > 15 km) — Abschlagswerte `set`, im Backtest je Flag gegen den Fehlerzuwachs gemessen.

**2.3 Provenienzregel** (aus §7 des PD-U-Plans, verbindlich): nur `measured` wirkt stillschweigend; `set`/`literature` wirken **mit Kennzeichnung** (`calib[]`); nichts wird als gemessen ausgegeben, was es nicht ist. Ein Consumer, der `calib` nicht liest, zeigt trotzdem korrekte Zahlen — er zeigt nur nicht, wie vorläufig sie sind.

---

## §3 Schnitt Precompute ↔ Laufzeit und das Laufzeitbudget

### 3.1 Der Schnitt

| Vorberechnet (GitHub Actions) | Status | Zur Laufzeit (Browser) |
|---|---|---|
| Fusion über die Quellen (T̄, σ_div, σ_ens, q10/q90, srcCount) — PAP 2 | ✓ läuft | PAP 3 Nachbargewichtung (≤ 4 Zellen) |
| Profilfelder gamma_eff/z_base/z_inv/dT_inv, hModEff je Schritt | ✓ t1 | PAP 4 Fallunterscheidung |
| Modellorographie je Quelle (`static/hmodel`), Versiegelung/d0 (`static/urban`) | ✓ | PAP 5 Terrain-Terme, Wind-Blending |
| Stationsvorhersagen im Chunk-Raster | ✓ | PAP 6 σ, Familien, Quantile, Konfidenz |
| **Neu P1:** CDN-Warm-up aller Chunks des neuen Laufs nach dem Push (Muster `warmCdnFiles`, LZ1 M1) | AP12, **S&F** | Terrain am Punkt aus 2–8 DEM-Kacheln (einmal je Ort, IndexedDB) |
| **Neu P2:** `latest.json` je Nowcast-Quelle im Spiegel (V-PD-52) | AP12, **S&F** (Radar-Linie) | Nowcast-Abtastung 0–3 h |
| **Neu P3:** Kalibrierung `calib.json` aus dem Archiv (σ_sys, c, L_d/L_h, A, A_uhi, f_rad) | AP10, **S&F** (Cron im Archiv-Repo) | Anker (Messung − Modell) aus BrightSky/TAWES/SMN, Frist 1,5 s, nie blockierend |
| **Neu P4 (optional):** Stationskoordinaten in `stations.json` je Chunk (spart `catalog.json`, 59 KB) | AP12, S&F (Manifest additiv) | Klimatologie-Schwanz jenseits `usableToH` |
| Nicht vorberechnet: das Endergebnis je Ort (Gazetteer) — erst, wenn AP0/AP12 es verlangt (E-F-5) | — | Ausgabe, Interpolation, Rendering |

**Was zur Laufzeit NICHT mehr passiert** (gegenüber dem Live-Pfad heute): kein GeoSphere-INCA-Punktabruf (bis 12 s), kein AROME-Abruf, kein BrightSky-MOSMIX (die Station kommt aus dem Repo), kein GFS-Range-Abruf, keine seriellen `run.json`.

### 3.2 Laufzeitbudget je Stufe (neuer Ort, Browser-Cache leer)

Kritischer Pfad = max über parallele Zweige. Zahlen: gemessen (M) oder gerechnet aus Messungen (R); nichts geschätzt ohne Quelle.

| Stufe | Desktop, CDN warm | Desktop, CDN kalt (ohne P1) | Mobil 4G (9 Mbit, 170 ms RTT, CPU 4×), CDN warm | Quelle |
|---|---|---|---|---|
| **0 Index** `point/index.json` (4,9 KB, revalidierend) | 70 ms | 300 ms | 250 ms | M (HIT p50 0,07 s; MISS 13 KB 0,39 s) |
| **1a Chunks** t1+t2+t3 parallel (733 KB Ø, 1,05 MB max) | 60–130 ms | **0,7–1,6 s** (TTFB 0,6–1,4 s + Transfer) | 0,8–1,1 s (Transfer-bound) | M/R; 454-KB-TTFB kalt = **offen, AP0** |
| **1b parallel dazu:** `run.json` ×3 (30 KB), Stationsbündel (28–150 KB), hmodel/urban (≈ 1,5 KB), `catalog.json` (59 KB, danach IndexedDB), Nowcast-Sonden + Frames (RV 25 × 19 KB, nur Niederschlag) | ≤ 1a | ≤ 1a | ≤ 1a + 0,2 s | M |
| **1c parallel dazu:** Terrain 2–8 Terrarium-Kacheln (S3, je 40–80 KB) + 1 WorldCover-Kachel | 150–300 ms | 150–300 ms | 400–700 ms | R (S3-Latenz aus LZ0-Klasse) — **AP0 misst** |
| **1d parallel dazu:** Obs-Anker (BrightSky/TAWES/SMN) | Frist 1,5 s, blockiert nicht | — | — | bestehend |
| **2 Dekodieren** 3 Chunks (`wanted` ≈ 45 Ebenen) + Bündel im **Worker** | 150–200 ms (überlappt 1b/1c) | gleich | 400–600 ms | M (74 ms/57 Ebenen Node) ×4 CPU |
| **3 Terrain-Rechnung** (≈ 450 DEM-Abfragen, SVF, PNG-Dekode 2–8 Kacheln) | 20–40 ms | gleich | 80–150 ms | R (`terrainScales` 49 Abfragen heute ≪ 1 ms) |
| **4 PAP 3–6** 109 Schritte × 10 Größen (+ Quantile) | 30–60 ms | gleich | 120–240 ms | M (214 µs/h) ×4 |
| **5 Ausgabe** + Interpolation + erste Darstellung | 30–50 ms | gleich | 100 ms | R |
| **Summe kritischer Pfad (p50)** | **≈ 0,5–0,7 s** | **≈ 1,4–2,3 s** ⚠ | **≈ 1,5–2,0 s** | |
| **mit P1 (Warm-up, TTFB 0,17/0,56 s)** | — | **≈ 0,8–1,2 s** | Mobil-kalt ≈ 2,0–2,6 s | M (LZ1 M1) |

Lesart: Das Ziel < 2 s p50 ist auf Desktop und Mobil-4G **mit warmem CDN** erreichbar; **kalt** hängt es allein am jsDelivr-Origin-TTFB. Der Hebel ist nicht der Algorithmus (< 100 ms), sondern **P1 (Warm-up im Publisher)** — dieselbe Maßnahme hat in LZ1 die Kartenlinie von 0,60 auf 0,17 s p50 gebracht. Ohne P1 verletzt der kalte Fall das Ziel in p90. **Fast 3G (1,6 Mbit)**: allein der Transfer von 733 KB dauert 3,7 s → Ziel nicht haltbar, Obergrenze 5 s knapp; Kur = progressives Laden (AP12), gemessen bevor entschieden. Wiederholabfragen (gleicher Ort, gleicher Lauf) laufen vollständig aus IndexedDB: **≈ 0,2–0,3 s**.

### 3.3 Was das Budget sprengen würde, und was stattdessen gilt

| Schritt | Kosten | Verdikt |
|---|---|---|
| PAP 3 über Chunk-Grenzen (12 % der Punkte bei 4 Nachbarn, 23 % bei 9 — Randstreifen des 16×16-Blocks) | +1–3 Chunks = +0,5–1,5 MB | **v1: nur Nachbarn im eigenen Chunk**, Flag `chunkBorderTruncated`; Halo im Producer als E-F-2 |
| Stündliche Rice-Quantile für 337 Stunden | 60 Bisektionen × Reihe je Quantil | Quantile nur auf **nativen** Schritten, Interpolation auf den Quantilen |
| Alle 57 Ebenen im Hauptthread dekodieren | ≈ 250 ms Desktop / 1 s Mobil, blockierend | **Worker-Pool** (Muster `src/sources/decompress.ts`), `wanted`-Liste |
| `catalog.json` + Sort über 3 071 Stationen je Abfrage | 59 KB + ~5 ms | einmal je Version in IndexedDB; `stations.json` liefert die Stationen des Chunks |
| 3 × `run.json` seriell vor dem ersten Chunk | 3 RTT | `index.json.tiers/planes` reicht für die Adresse; `run.json` parallel, nur für Provenienz |
| Live-INCA-Punktabruf (bis 12 s) | — | entfällt im Cube-Pfad (Nowcast aus dem Spiegel) |

---

## §4 Arbeitspakete

Legende Gate: **—** lokal + Verifier · **J** Jan (Kopie/Push/Produktentscheidung) · **S&F** STOPP & FRAGEN (Fusion-Engine, Cron/Publisher/Manifest). Aufwand in Sitzungen (S = 1, M = 2–3, L = 4+). Jede Etappe: Verifier grün, `typecheck` 0, Budget (eagerJs 107,9 **unverändert**, Textsonde: Punkt-Module nur im lazy Chunk).

| AP | Inhalt | Abhängig von | Abnahme fachlich | Abnahme Laufzeit | Aufwand | Gate |
|---|---|---|---|---|---|---|
| **AP0** Messbasis + Laufzeit-Harness | `scripts/verify-pv-latency.mjs` (Playwright/CDP gegen `vite preview` + echtes CDN; Netzprofile; `x-cache` je Abruf), `performance.mark` im Leser/Algorithmus, Baseline: Live-Pfad heute + PD-D-Leser im Browser, Terrain-Kachelkosten, **kalter TTFB eines 454-KB-Chunks**, `buscosun-data`-Gesamtgröße gegen das 150-MB-Paketlimit | — | Bericht mit p50/p95 je Szenario (§6), 10 Orte | — (Baseline) | S–M | — |
| **AP1** Lesepfad schlank + parallel (nur Client) | `index.json` mit `cache: 'no-cache'`; Chunk-Adresse aus `index.json.tiers`; alle Abrufe einer Ebene parallel; `wanted`; Worker-Dekodierung mit Hauptthread-Rückfall; IndexedDB-Cache `(run, tier, cy, cx)` + Timeless-Produkte; Frist je Abruf 4 s weich / 8 s hart; Nowcast-Sonden parallel; `store.stats.ms` | AP0 | `verify:point-client` byte-gleich zu `read-point.mjs` (Negativkontrolle: verschobene Zelle) | Lesephase ≤ 400 ms Desktop warm, ≤ 1,0 s Mobil-4G warm (10 Orte) | M | — |
| **AP2** Cube-Adapter + Flag | `src/pointForecast/cubeSource.ts`: `PointHourSamples[]` auf der Cube-Achse, Familien t1→`highres`, t2/t3→`global`, Stationen→`mosmix`, Spiegel→`nowcast`; **additiv** am Sample-Vertrag: `sigmaDiv, sigmaEns, q10, q90, srcCount, ensCount, hModEff, profile`; `pointSource: 'live'|'cube'` in `PointForecastOptions` **und** `pfCacheKey`; Live-Pfad byte-gleich ohne Flag | AP1 | 10-Orte-Gleichheitsprobe Cube↔Live (Wien, Bregenz, Zermatt, Zugspitze, Hamburg, Nähte 48/51, 120/126 h; Toleranzen T 0,5 K, Wind 1 m/s, RR 0,2 mm/h, clct 10 % — Größeres = Befund) | Ende-zu-Ende ≤ 2 s p50 Desktop-warm | M | **S&F** (erste Berührung der Engine) |
| **AP4** PAP 4 Vertikale Korrektur | `fusion/vertical.ts`: Fall A/B/C, φ linear (`set`), Δh-Protokoll, Flag `extrapolatedBelowModel`, Td-Lapse; Rückfall `standardLapse` wenn Profil `null` (t2/t3) mit Flag | AP2 | Vorzeichenproben Zermatt (+718 m) / Zugspitze (−938 m); Nacht/Tag-Anteil Fall B; Negativkontrolle ohne Profil = lineare Lapse; **Backtest** T-MAE an Punkten mit \|h_true − hModEff\| > 300 m gegen Basislinie B1 | +≤ 5 ms | S–M | — (im Flag) |
| **AP3** PAP 3 Gitter → Punkt | `fusion/grid.ts`: N ≤ 4 Nachbarn **im Chunk**, w = exp(−(d/L_d)²)·exp(−(Δh/L_h)²)·κ, κ = 1 (markiert), L_d/L_h Startwerte `set` (Vorschlag L_d = Zellweite, L_h = 200 m — Präzedenz `spatialWeight` H_REF) | AP4 | Mittel der Ebenen exakt bei N = 1 (Negativkontrolle); Profilfelder werden **nicht** gemittelt (PD-B5-Regel: Quelle = nächste Zelle); Backtest an Randzellen | +≤ 5 ms; **0 zusätzliche Chunks** | S–M | — |
| **AP6** PAP 6 Unsicherheit, Familien, Konfidenz | `fusion/uncertainty.ts`: Konsistenz-Ops inkl. `clct := max`; σ je Größe: `c·σ_ens` (c = 1 `set`) **oder** `σ_div² + σ_sys²` (σ_sys Startwert aus V-A₁ `set`), + `σ_quant² = Δ²/12` aus `quantStep`, + Fall-C-Aufweitung; Cube als Member in `combine.ts` mit dieser σ; Familien via `dist.ts`; Quantile; Konfidenz-Score §2.2; `calib[]`-Flags | AP2, AP4 | PAP-6-Bedingungen in 100 % der Ausgaben (Verifier); PIT/Spread-Skill auf dem Archiv **berichtet** (Gate erst nach AP10); Score-Dezile monoton gegen CRPS | +≤ 30 ms | M–L | — |
| **AP5** PAP 5 Terrain-Terme | `fusion/terrainTerms.ts`: `f_rad` (a, v_ref, ε `set`, hergeleitet aus den bestehenden Gates 65 %/2,5 m/s), ΔT_cap = −A·g(TPI, SVF, Tiefe)·f_rad·f_saison·(1−foehn), ΔT_uhi = A_uhi(imperv, SVF)·f_rad·f_saison, Wind zweistufig (z0 aus WorldCover, d0 aus `urban`, Blending-Height), `readUrbanPoint` (U-7), `foehnDetector` durchgereicht; **A, A_uhi = null ⇒ Terme inaktiv**, Gate/Geometrie trotzdem gerechnet und im Output benannt; `f_saison` = Setzung mit Formel (E-F-4) | AP4, AP6 | Negativkontrolle: mit `A = A_uhi = null` byte-gleich zu AP6; synthetische Fälle (Mulde/Kamm, Stadt/Land, Wasser: kein +135 % Wind); Backtest erst mit AP10 | +≤ 5 ms; Urban-Chunk +0,6 KB | M | — |
| **AP7** Nowcast, Anker, Schwanz, Achse | Nowcast-Member Niederschlag 0–3 h (`nowcastPoint`, Domäne vor Byte, `validAtSuspect`), Rückfall Modell mit Flag; `anchor.ts` auf dem Cube-Pfad (Messung − Cube-Wert der Vorstunden); Klimatologie-Schwanz jenseits `usableToH` (bestehend, `climatologyOnly`); Achsenlücken 49–50/121–125 h und Naht t2/t3 → Station füllt, sonst Interpolation mit Flag | AP2, AP6 | Lückenfälle im Verifier (Zeit in der Lücke, jenseits 336 h, Punkt ohne Radar, Punkt ohne Station); Naht als Flag sichtbar | Obs-Frist 1,5 s nicht auf dem kritischen Pfad | M | — |
| **AP8** Ausgabe v2 + `verify:pv-cube` | `output.ts` (§2), Interpolation auf Quantilen, Provenienz/Members; **netzfreier Verifier mit echten Datenformen** (ein t1/t2/t3-Chunk + Bündel als Fixture aus dem Archiv-Slot), Negativkontrollen je Flag | AP2–AP7 | Verifier grün; Rundweg Fixture → Ausgabe → Werte innerhalb Δ/2 | Algorithmus allein < 100 ms je Punkt (Node, CI) | S–M | — |
| **AP9** Backtest `verify:pv-score --archive` (PA4) | Replay PAP 3–6 aus den archivierten Cube-Ebenen je Punkt, Wahrheit aus Folge-Slots, Basislinien B0–B6 (§5), Metriken, Stratifikation, Leck-Wächter (t₀-Sperre + Negativkontrolle), Scorecards `audit/fusion-implementierung/scorecards/<tag>.json`, täglich fortschreibbar | AP2, AP4 (inkrementell) | erste Scorecard 0–48 h (ab Tag 3), 0–120 h (Tag 6), 0–336 h (Tag 15) | Replay ≤ 10 min je Slot lokal | M–L | — |
| **AP11** Consumer | `PointForecastPanel` liest v2: Band p10–p90, Konfidenz-Score, Members, Flags, `climatologyOnly` (V-PV-14), „vorläufige Bandbreite" bei `calib:set`; Flag-Umstellung `pointSource` Default `cube` **nur nach** AP9-Gate; Massenaufrufer (Route, Event-Scan, 3D) bleiben `live`, bis ihre Batch-Kosten gemessen sind (E-F-7); Modellvergleich (J-5) = Folgephase | AP8, AP9 | Fünf Selbstverifikationsfragen; Desktop pixelgleich außer Panel-Inhalt | § 6 Abnahme in allen drei Profilen + ein Real-Device | M | **J** |
| **AP10** Kalibrierung aus dem Archiv (PA5) | `scripts/punktarchiv/fit-calib.mjs`: σ_sys(var, Lead), c(p,f), dann L_d/L_h, A, A_uhi, f_rad, dzMin, meltOffset — je Wert `n`, Zeitraum, `provenance: measured`; Anspruch B über **räumlich geblockte** Stations-CV; Schreiben nach `point/calib.json`; Client-Provenienzregel wirkt | AP9 + **≥ 30 Tage Archiv** | Spread/Skill 0,85–1,20 und PIT-Ränder 0,15–0,25 je Lead-Bin (gate-blockierend, `verifikation.md` §7.0); Fit berichtet n je Zelle, bricht bei zu kurzem Archiv mit „Archiv zu kurz" ab | — | L (kalenderabhängig) | **S&F** (Cron im Archiv-Repo, `calib.json`-Push) |
| **AP12** Laufzeit-Härtung (bedingt) | nur, was AP0/§6 verlangt: **P1** Warm-up in `publish-point.mjs` (Muster `warmCdnFiles`); **P2** `latest.json` je Nowcast-Quelle; progressive Ebenen-Ranges (Kernebenen zuerst, Rest nach der ersten Darstellung); 8×8-Chunks (Schema 6, 4× kleinere Dateien, 1 104 Dateien je Zyklus) als E-F-3; Orts-Gazetteer als E-F-5 | AP0, AP11 | jede Maßnahme mit Vorher/Nachher auf demselben Harness | § 6 in allen Profilen, inkl. Fast 3G ≤ 5 s | S–M je Maßnahme | **S&F** (Publisher/Spiegel/Schema) |

**Reihenfolge:** AP0 → AP1 → AP2 → AP4 → AP3 → AP6 → AP5 → AP7 → AP8 → AP9 (ab AP2 mitlaufend, täglich) → AP11 → AP12 (wie gemessen) → AP10 (sobald das Archiv trägt; läuft kalendarisch parallel). **Summe ≈ 16–20 Sitzungen** plus Kalenderzeit für AP10.

**Wiederverwendung (kein Neubau):** `combine.ts` (Gewichte), `dist.ts` (Familien, Quantile, CRPS, PIT), `meteo.ts` (Feuchtkugel, Schneefallgrenze, Föhn), `anchor.ts`, `attach.ts` (Klimatologie, Yield), `terrainPoint.ts` (TPI/SVF/z0), `src/point/client/*` (Leser), `src/point/calibration.ts` (Provenienz), `scripts/verify-pv-score.mjs` (Metriken, DM/HAC, Bootstrap, Leck-Wächter), `scripts/punktarchiv/lib/punktarchiv.mjs` (Slot-Parser), `src/sources/decompress.ts` (Worker-Pool-Muster), `scripts/lib/headlessShot.mjs` (CDP), `repackManifest.mjs::warmCdnFiles` (Warm-up).

**Neue Dateien (alle lazy, hinter `pointSource: 'cube'`):** `src/pointForecast/cubeSource.ts`, `src/pointForecast/fusion/{grid,vertical,terrainTerms,uncertainty,output}.ts`, `src/point/client/{decodeWorker.ts, cache.ts}`, `src/point/client/staticPoint.ts` (+urban), `scripts/verify-pv-cube.mjs`, `scripts/verify-pv-latency.mjs`, `scripts/punktarchiv/{score-archive.mjs, fit-calib.mjs}`, `audit/fusion-implementierung.md`.

---

## §5 Verifikationsstrategie

**Grundsatz:** keine Genauigkeitsaussage ohne Scorecard; Wahrheit = Stationsmessung (nie Modellanalyse); as-of t₀ mit Leck-Wächter und Negativkontrolle (bestehend in `verify-pv-score.mjs`).

**5.1 Datenbasis.** Archiv-Slots (1/Tag, 23:10 UTC): Cube-Ebenen je Punkt = exakte Eingabe für PAP 3–6 (Replay ist bit-gleich zur Produktion, D-12); `hmodel` im Slot; `urban`/Terrain zeitlos (zur Bewertungszeit lesen); Wahrheit aus den Folge-Slots (POI stündlich lückenlos; TAWES/SMN 10-min → Stunde; `rr1`-Falle berücksichtigt). DE 208 Punkte als Kern; AT 23; Block-06-Dutzend getrennt und nur die 6 SMN-Punkte als CH. PA2 (AT/CH über TAWES/SMN auffüllen) wird als Empfehlung mitgeführt.

**5.2 Basislinien** (Pflicht in jedem Bin):
- **B0** nächste Cube-Zelle roh (das, was der Leser heute liefert — „DMO");
- **B1** B0 + Standard-Lapse 6,5 K/km auf h_true (der faire Interpolations-Strohmann, `verifikation.md` §2);
- **B2** MOSMIX-L an der Station (as-of, aus dem Stationsprodukt des Slots);
- **B3** Persistenz / Anomalie-Persistenz; **B4** Klimatologie;
- **B5** Altpfad heute (archiviert `live.fields`) = **Amtsinhaber**;
- **B6** bestehende buscosun Fusion (archiviert `live.fusion` q10/q50/q90; CRPS als 3-Quantil-Näherung, für alle Verfahren gleich gerechnet, so beschriftet).

**5.3 Metriken** (`verifikation.md` §4, unverändert): MAE/Bias/RMSE; CRPS + CRPSS gegen jede Basislinie; PIT-Histogramm, Spread/Skill (gate-blockierend); Brier/BSS + Reliability an 0,1/1/5 mm/h; Diebold-Mariano mit HAC, Block-Bootstrap über Tage, FDR-Korrektur. Lead-Bins: 0–6 · 7–24 · 25–48 · 51–120 · 126–240 · 246–336 h. Stratifikation: Höhenband, Geländeklasse (TPI), Nacht/Tag, Inversion ja/nein (`zInv > zBase`), Land.

**5.4 Gates je Etappe (fachlich):**

| Etappe | Gate |
|---|---|
| AP4 | T: CRPSS/MAE-Gewinn gegen **B1** an Punkten mit \|h_true − hModEff\| > 300 m, signifikant; keine Verschlechterung im Flachland; Fall-B-Anteil nachts > tags |
| AP3 | kein Bin signifikant schlechter als AP4 allein; Randzellen-Befund berichtet |
| AP6 | alle Konsistenzbedingungen 100 %; PIT/Spread-Skill **berichtet** (mit `set`-Sockel), Score-Dezile monoton gegen CRPS |
| AP5 | erst bewertbar mit AP10 (A, A_uhi); bis dahin Negativkontrolle „inaktiv = byte-gleich" |
| AP11 (Umstellung Default) | CRPSS > 0 gegen **B5** in jedem Lead-Bin 0–246 h, signifikant; CRPSS > 0 gegen B3/B4 in jedem Bin; in keinem Bin/Höhenband/Regime signifikant schlechter; **Laufzeit nach §6**; Kalibrierung: bis AP10 nur mit sichtbarer Kennzeichnung `set` |
| AP10 | Spread/Skill 0,85–1,20, PIT-Ränder 0,15–0,25 je Bin über ≥ 2 Wochen Scorecards; n je Zelle berichtet; Anspruch B (räumlich geblockte CV) getrennt |

**5.5 Zeitplan der Belegbarkeit.** Tag 3: 0–48 h · Tag 6: 0–120 h · Tag 15: 0–336 h (erster Fall) · ≈ Ende Oktober: ≥ 30 Fälle je t3-Bin. Bis dahin sind Aussagen über t3 **Form-, keine Zahlbelege** — das steht so im Produkt (`calib:set`, `sigmaKind`).

**5.6 Abbruchregeln** (`verifikation.md` §7.2/7.3): kein Gewinn gegen B5 ⇒ Hybrid je Bin (Cube-Pfad nur in gewonnenen Bins); Kalibrierung verletzt ⇒ harter Stopp der Auslieferung als „kalibriert"; Archiv zu kurz ⇒ Stopp mit Diagnose, kein Lockern.

---

## §6 Messmethodik Laufzeit — wann „erfüllt" gilt

**Werkzeug:** `npm run verify:pv-latency` (`scripts/verify-pv-latency.mjs`, **CDP über das bestehende Muster `scripts/lib/headlessShot.mjs`** — Node-`WebSocket` + lokaler `chrome-headless-shell`, **keine neue Abhängigkeit**; Playwright ist nicht in `package.json`, das Playwright-MCP dient nur der Sichtprüfung): baut (`npm run build`), startet `vite preview`, öffnet die Karte mit `?pf=cube&pflog=1`, liest `performance.measure('pf', 'pf:start', 'pf:done')` und die Marken `pf:index | pf:chunks | pf:decode | pf:terrain | pf:algo | pf:paint`, dazu je Abruf Bytes, ms und `x-cache` (HIT/MISS werden als **zwei Populationen** berichtet, weil Chunks nicht purgebar sind). Netzprofile über `Network.emulateNetworkConditions`, CPU über `Emulation.setCPUThrottlingRate`.

**Orte (fest, 10):** Hamburg, Berlin, München, Wien, Graz, Innsbruck, Zürich, Genf, Zermatt, Zugspitze — Flachland, Ostösterreich (nur INCA), Alpen, Chunk-Rand (mindestens zwei Orte an einer Chunk-Grenze, aus `cellOf` gerechnet).

**Szenarien:** (1) **kalt-neu**: frischer Browser-Kontext, leerer Cache, neuer Ort; (2) **warm**: derselbe Ort erneut (IndexedDB); (3) **lauwarm**: anderer Ort im selben Chunk; (4) **Zeitraum**: 0–336 h mit `hourly: true`; (5) **Zeitpunkt**: ein Schritt. Profile: **Desktop ohne Drossel** · **Desktop 4G** (9 Mbit ↓, 170 ms RTT) · **Mobil** (iPhone-12-Pro-Viewport, CPU 4×, 4G) · **Fast 3G** (1,6 Mbit, 560 ms RTT — berichtet, nicht gate-blockierend, bis AP12 entschieden ist).

**Abnahme:** je Profil (außer Fast 3G) und Szenario **kalt-neu**: **p50 < 2,0 s und p95 < 5,0 s** über 10 Orte × 3 Wiederholungen; warm p50 < 0,5 s; Algorithmus allein (Node-Harness, CI, netzfrei) < 100 ms je Punkt; kein Long Task > 200 ms im Hauptthread (Trace); Konsole leer. **Vor der Default-Umstellung (AP11) einmal Real-Device** (Android via scrcpy/ADB; Emulation ist für Netz/CPU repräsentativ, für WebGL nicht — hier ohne WebGL, deshalb genügt ein Lauf). Ergebnisse als `audit/fusion-implementierung/latency/<tag>.json` + Tabelle im Phasendokument; jede AP12-Maßnahme misst Vorher/Nachher auf demselben Harness am selben Tag (Leistungsanker-Regel).

---

## §7 Offene Punkte, Risiken, Entscheidungen

### 7.1 Risiken

| # | Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|---|
| R1 | **Kalibrierung ist null** (σ_sys, c, L_d/L_h, A, A_uhi, f_rad); V-A₁ misst die bestehende Fusion 2× überkonfident | p10/p90 sind bis AP10 Setzungen | Provenienzregel + sichtbare Kennzeichnung; kein „kalibriert" im Produkt vor dem AP10-Gate |
| R2 | **Archiv zu jung** (2 Slots); t3-Bins erst Ende Oktober belastbar; AT/CH dünn, Block 06 gemischt | keine 336-h-Zahl vor Wochen | Reihenfolge der Gates nach Lead; DE-Kern getrennt; PA2 empfehlen |
| R3 | **Kalter TTFB für 454 KB nie gemessen** (Extrapolation 1,3–1,5 s p50) | Ziel < 2 s kalt gefährdet | AP0 misst; P1 Warm-up (S&F) als Hauptkur; ohne P1 ist „kalt" p90 > 2 s |
| R4 | **Fast 3G**: Transfer allein 3,7 s | Obergrenze 5 s knapp | progressive Ranges / 8×8-Chunks (E-F-3), erst nach Messung |
| R5 | **Chunk-Rand**: 12–23 % der Punkte (4 bzw. 9 Nachbarn) haben Nachbarn im Nachbarchunk | PAP 3 dort einseitig | v1 Flag + Konfidenz-Abschlag; Halo (E-F-2) |
| R6 | Profilfelder nur in t1 | PAP 4 Fall B/C in t2/t3 unerreichbar | Rückfall `standardLapse` mit Flag; U-15 (Druckflächen-Profil in t2) bleibt Producer-Etappe |
| R7 | Naht t1/t2 (−0,6 K gemessen), Achsenlücken | Sprünge in der Reihe | Flag + Station füllt; keine Glättung ohne Backtest |
| R8 | **eagerJs 0 KB Luft** | jeder eager Import bricht die Ratsche | alles hinter `await import()`; Textsonde im Verifier |
| R9 | `index.json` mit `max-age=604800` am `@main`-Pfad | 7 Tage alter Zeiger auf gelöschte Läufe | `cache: 'no-cache'` + ETag; Retention-Falle im Verifier |
| R10 | jsDelivr **150-MB-Paketlimit**: `point/` ≈ 112 MB + Stationen 21 MB + Radar-Spiegel | neue Artefakte könnten das Repo kippen | AP0 misst die Gesamtgröße am Remote; bis dahin keine neuen Produkte |
| R11 | Massenaufrufer (Route/Event-Scan) × Punktkosten | 50 Punkte × 0,7 MB | bleiben `live`, bis Batch-Lesen (Chunk teilen) gemessen ist (E-F-7) |
| R12 | AROME-Abschaltung 2026-11-01 trifft den Live-**Rückfall**pfad | AT/CH-Fallback verliert ein Mitglied | U-19 parallel (klein), unabhängig von diesem Plan |
| R13 | Abweichungen von PAP 6 (Rice statt Weibull, Hurdle statt zensiert) | Design ≠ Code | benannt in §0.3; Backtest entscheidet, nicht die Vorliebe |
| R14 | Externe Obs-APIs (BrightSky) für den Anker | Ausfall/Latenz | Frist 1,5 s, nie blockierend; `point/obs/` als spätere Producer-Etappe |
| R15 | Jeder Schritt AP2–AP7 berührt die Fusion-Engine (S&F-Zone) | ohne Freigabe kein Start | **die Freigabe dieses Plans ist die Freigabe der Zone** — Umfang steht in §4 |

### 7.2 Entscheidungen für Jan (E-F-1 …)

1. **E-F-1 — P1 Warm-up im Punkt-Publisher** (Publisher-Mechanik = S&F). Empfehlung: **ja**, nach AP0-Messung des kalten TTFB; ohne P1 ist das 2-s-Ziel kalt nur p50 haltbar.
2. **E-F-2 — Halo im Chunk** (17×17 statt 16×16, Schema 6, +13 % Bytes) gegen den Chunk-Rand in PAP 3. Empfehlung: **erst nach AP9-Befund** an Randzellen.
3. **E-F-3 — 8×8-Chunks** (4× kleinere Dateien, 1 104 Dateien je Zyklus, Schema 6) für Fast 3G. Empfehlung: **nein, solange 4G das Ziel hält**; progressive Ranges zuerst.
4. **E-F-4 — `f_saison`**: PAP 5 nennt es ohne Formel. Vorschlag: Setzung als Jahresgang der Nachtlänge (`set`), bis AP10 ihn lernt. Empfehlung: **so**, benannt.
5. **E-F-5 — Orts-Gazetteer** (vorgerechnete v2-Ausgabe für die Tabelle `placeSlugs.json` je Lauf, ≈ 5 KB je Ort): nur, wenn §6 auf Mobil-kalt verfehlt wird. Empfehlung: **nicht vor der Messung.**
6. **E-F-6 — statisches Terrain-Produkt**: nur bei > 400 ms Kachelbeitrag (§0.2). Empfehlung: **nein, bis gemessen.**
7. **E-F-7 — Massenaufrufer** (Route, Event-Zone, 3D) auf den Cube-Pfad: eigene kleine Phase mit Batch-Lesen (ein Chunk trägt 256 Zellen — die Route liest ihn einmal). Empfehlung: **nach AP11.**
8. **E-F-8 — Nowcast `latest.json` im Radar-Spiegel** (V-PD-52; Spiegel-Workflow = S&F): spart 1–3 Sonden (260 ms gemessen). Empfehlung: **ja, klein.**
9. **E-F-9 — PA2** (AT/CH-Punkte über TAWES/SMN auffüllen, ohne POI-Pflicht): Empfehlung **ja**, sonst bleibt der AT/CH-Beleg dünn.
10. **E-F-10 — Rice bleibt** (statt Weibull): Empfehlung **ja**, Backtest darf es kippen.

### 7.3 Was dieser Plan bewusst nicht enthält

PAP 2 (Producer-Fusion mit gemessenem Σ) · `point/obs/` · UV im Cube · Föhn-Lee-Geometrie (`Sx`-Gerüst existiert) · E4-Benchmark (CH) · Modellvergleich-Integration (J-5, Folgephase) · Nebel/Hochnebel (Fusion §7 Nr. 4).

### 7.4 Entschieden am 2026-09-16 (Jan: „ich vertraue dir und du kannst alle offenen Punkte mit deiner Empfehlung beantworten")

| # | Entscheidung | Folge im Plan |
|---|---|---|
| E-F-1 | **Ja.** Warm-up aller Chunks des neuen Laufs + Purge jedes berührten `run.json` im Punkt-Publisher, nach AP1 | AP12 zieht als **AP12a** direkt hinter AP1 (Vorlage `workflow-point.yml` + `publish-point.mjs`, Muster `warmCdnFiles`; Kopie ins Daten-Repo = Jans Push) |
| E-F-2 | **Nein, jetzt nicht.** Halo erst, wenn AP9 an Randzellen einen messbaren Verlust zeigt | AP3 v1 mit Flag `chunkBorderTruncated` + Konfidenzabschlag |
| E-F-3 | **Weg (a): progressives Laden** (t1 zuerst, dann Ebenen-Ranges über das 732-B-Verzeichnis) wird **Pflicht in AP12**; 8×8-Chunks nur, wenn (a) nicht reicht. **Fast 3G ist kein Abnahmeprofil für p50 < 2 s**; dort gilt: erste Darstellung mit 0–48 h **< 5 s** | §6 Abnahme ergänzt; `verify:pv-latency` bekommt das Szenario `cube-first-paint` |
| E-F-4 | **Ja.** `f_saison` = Jahresgang der Nachtlänge, Wertebereich 0…1, `provenance: set`; AP10 lernt ihn | AP5 |
| E-F-5 | **Nein.** Kein Orts-Gazetteer (zweiter Rechenpfad, kein Repo-Platz); nur, wenn Mobil-kalt nach AP12 scheitert | — |
| E-F-6 | **Kein Terrain-Produkt.** Zwei-Skalen-DEM z8 (Fernhorizont) + z11 (Nahfeld/TPI), Terrain je Ort einmal in IndexedDB; in AP1 nachgemessen | AP1 |
| E-F-7 | **Ja, nach AP11** als eigene kleine Phase mit Batch-Lesen; bis dahin Route/Event/3D auf `live` | Folgephase |
| E-F-8 | **Nützlich, nicht blockierend.** AP1 macht die Sonden parallel; `latest.json` im Spiegel erst, wenn danach noch eine Runde fehlt | AP12 (bedingt) |
| E-F-9 | **Ja.** PA2: AT/CH-Punkte über TAWES/SMN ohne POI-Pflicht auffüllen (Ziel ≥ 60 AT, ≥ 40 CH) | neue Etappe **AP-PA2** (Sammler `points.mjs`, Wahrheitsleser unverändert), vor AP9 |
| E-F-10 | **Ja.** Rice bleibt; der Backtest darf es kippen | AP6 |
| V-FI-1 | **Sofort:** Manifeste an den Index-Commit gepinnt lesen (Client-Fix, §9.1); der Sammler profitiert, sobald `main` gepusht ist (er klont `main` je Lauf) | §9.1 — **Push von `main` vor 23:10 UTC schützt den heutigen Slot** |

---

## §8 Verifikation des Plans selbst (Definition of Done je Etappe)

1. `npm run typecheck` 0 Fehler; `npm run build` grün; `npm run budget`: eagerJs 107,9 unverändert, Textsonde „kein Punkt-Modul im Start-Chunk".
2. Verifier: `verify:pv-fusion` 222/222 unverändert (Live-Pfad byte-gleich ohne Flag), `verify:point-client` 63/63 + neue Prüfungen, `verify:pv-cube` (neu, netzfrei, echte Datenformen), `verify:pv-latency` (Bericht), `verify:pv-score --archive` (Scorecard).
3. Fünf Selbstverifikationsfragen mit Beleg im Phasendokument; Konsole leer; keine Long Tasks > 200 ms.
4. Jede Zahl im Phasendokument ist gemessen oder als Setzung markiert — keine fortgeschriebene Zahl (BW-1-Lehre).

---

## §9 Etappenprotokoll

### 9.0 AP0 — Messbasis (begonnen 2026-09-16)

**Werkzeug:** `npm run verify:pv-latency` (`scripts/verify-pv-latency.mjs` + `scripts/pv-latency/lab.ts` + `scripts/lib/cdpBrowser.mjs`). Das Lab-Bündel (esbuild, ≈ 600 KB, nicht minifiziert) enthält die echten Module `src/point/client`, `getPointForecast` und `loadElevationLookup`; es läuft in einer leeren Seite unter `127.0.0.1` — **das App-Bundle ist unberührt** (eagerJs 107,9 unverändert, kein neuer Chunk). Netzmitschnitt über CDP (`Network.*`): je Abruf Bytes, TTFB, `x-cache`, Browser-Cache. Profile über `Network.emulateNetworkConditions` / `Emulation.setCPUThrottlingRate`. Läufe: `audit/fusion-implementierung/latency/*.json`.

**9.0.1 Gemessen VOR der Matrix (Node, 16.09. 10:41–10:45 UTC):**

| Messung | Ergebnis | Folge |
|---|---|---|
| Kalter jsDelivr-TTFB, acht t1-Chunks 432–469 KB des frischesten Laufs `2026091606` (erstmals irgendwo abgerufen, `x-cache MISS`) | **p50 635 ms · p90 2 602 ms · min 347 ms**; danach warm **21 ms** (n = 8). t2-Chunk 175 KB kalt 851 ms, t3 233 KB kalt 594 ms | R3 beziffert: der Median hält das 2-s-Ziel, **der Schwanz nicht** (2 von 8 über 1,5 s). Drei parallele Chunks ⇒ max-von-3 — ohne Warm-up (E-F-1) ist p90 kalt > 2 s |
| `buscosun-data` am HEAD `5251515` (10:41 UTC): Summe aller Blobs | **307,4 MiB** (point/2026091603 89,9 · point/2026091606 86,7 · radar/img 20,7 · radar/rv 15,5 · stations 14,1 · runs/* 4 × 12,5 · point/static 0,4); größte Datei < 5 MB | R10: das Repo liegt **doppelt** über der nominellen 150-MB-Grenze und wird trotzdem ausgeliefert — die Grenze greift am `@main`-Dateiabruf offensichtlich nicht; **kein Platz für neue Artefakte**, keine Sicherheit, dass das so bleibt |
| Terrarium-Kacheln 3×3, Node: Innsbruck z9 **1 374 KB / 976 ms kalt**, z11 1 297 KB / 1 618 ms; Hamburg z9 989 KB / 278 ms; Zermatt z9 1 324 KB / 1 506 ms, z11 1 310 KB / 2 009 ms | **100–150 KB je Kachel**, nicht 40–80 KB (Plan §0.2 war zu optimistisch); S3-Latenz je Kachel 135–2 500 ms, hohe Varianz | Terrain nur mit den Kacheln, die der Radius wirklich schneidet (Lab misst genau das: 1–6 statt 9) |

**9.0.2 V-FI-1 — `run.json` ist am CDN veraltet, und der Leser schweigt dazu** (gefunden am ersten Lab-Lauf, 10:49 UTC; am CDN gegen `raw.githubusercontent` nachgeprüft 10:56 UTC):

| Datei | CDN (`@main`, `x-cache HIT`, `age 256`) | Repo (`raw`) | `index.json.runs[]` |
|---|---|---|---|
| `point/2026091606/run.json` | Stufen **t1** | t1 + t2 | t1 + t2 |
| `point/2026091600/run.json` | Stufen **t1 + t2** | t2 + t3 | t2 + t3 |

Ursache: `publish-point.mjs` purgt **nur `index.json`** (Zeile 439). Ein `run.json` wird aber je Stufe **gemergt** (t2-Job schreibt in das t1-Verzeichnis desselben Laufs, §26) und beim Aufräumen **beschnitten** (t1 fällt nach 9 h aus `2026091600`) — die Datei ist veränderlich, das CDN hält sie 12 h (`s-maxage`), der Browser 7 Tage (`max-age=604800`). `readCubePoint` findet die Stufe im veralteten Manifest nicht und gibt **`null` zurück — kein Fehler, kein `miss`** (`cubePoint.ts`, `if (!tm) return null`). Am Lab: Wien, München und Zermatt bekamen **t2 = null, t3 = null**, also nichts jenseits 48 h, bei `stats.misses 0`. ⚠ **Der Archiv-Sammler liest denselben Weg (`@main`)** — ein Slot um 23:10 UTC kann dieselbe Lücke tragen, ohne dass es im Slot als Fehler steht (nur `indexCommit` erlaubt die Nachprüfung). Kur, dreifach: (1) Client (AP1): Chunk-Adresse aus `index.json` (trägt `tiers[]`, `planes[]`, `latestByTier`), `run.json` **nicht** auf dem kritischen Pfad und wenn, dann **`@<index.commit>`** statt `@main` (unveränderlich je Index-Stand; die Zwei-Commit-Regel garantiert, dass der SHA am Remote liegt); (2) Publisher (E-F-1, S&F): jedes berührte `run.json` purgen, nicht nur den Index; (3) Sammler: `--raw` für Manifeste, bis (1) steht. **Ein Leser, der eine fehlende Stufe schweigend als „nicht vorhanden" nimmt, gehört zur Klasse „grün ohne Aussage"** — AP1 macht daraus einen benannten Befund (`tierMissing: 'manifest-stale'`).

**9.0.3 Zwei Werkzeugbefunde:** (a) der Browser liefert PNG immer als RGBA, `sampleNowcastFrame` verlangt einen Kanal — ohne Rotkanal-Extraktion wirft der erste INCA-Frame (`f015.png hat 4 Kanäle`); der Client-Leser (AP1) braucht genau diese Zeile. (b) Der Bash-Kanal dieses Rechners schneidet Kommandos bei ≈ 8 KB ab (Windows-Kommandozeilenlimit): zwei Heredocs kamen verstümmelt an, `lab.ts` war bei 7 611 B abgeschnitten — große Dateien nur über das Write-Werkzeug.

**9.0.4 Matrix (Browser, 10 Orte, 16.09. 10:52–11:21 UTC; `latency/2026-09-16T10-52…`, `…T10-56…`, `…T11-02…`, `…T11-09…`; 310 Läufe, 0 Fehler)**

Szenario „kalt-neu": frischer Browser-Kontext je Ort. ⚠ Zwei Lesehinweise: (1) das Desktop-Profil lief zuerst und hat die Chunks am CDN erwärmt — die drei gedrosselten Profile messen **CDN warm, Browser kalt** (t1-Chunk-TTFB dort ≈ 200 ms = die emulierte RTT); nur `desktop-none` trägt echte MISS-Werte (10/10 MISS, TTFB p50 590 ms, max 2 165 ms). (2) Wegen V-FI-1 fehlten t2/t3 in **allen** Leser-Läufen — der heutige Leser hat also ≈ 300 KB **zu wenig** geladen; die Zahlen sind eine Untergrenze.

| Szenario | desktop-none p50 / p95 | desktop-4g p50 / p95 | mobile-4g (CPU 4×) p50 / p95 | fast-3g p50 / p95 |
|---|---|---|---|---|
| **reader-cold** (heutiger Cube-Leser, seriell, inkl. Nowcast-Frames) | **3,0 s** / 16,0 s | 10,4 s / 22,3 s | **13,6 s** / 20,5 s | 38,9 s / 45,5 s |
| reader-cold **ohne Nowcast-Phase** (plan + Chunks + Station + hmodel) | 1,6 s / 4,9 s | 3,7 s / 4,7 s | 4,8 s / 6,7 s | 12,8 s / 16,4 s |
| reader-warm (Browser-Cache, seriell) | 0,72 s / 0,86 s | 0,98 s / 1,97 s | 1,99 s / 3,66 s | 2,78 s / 5,63 s |
| reader-parallel (Browser-Cache, `Promise.all`) | 0,63 s / 0,77 s | 0,84 s / 1,85 s | 1,71 s / 2,43 s | 2,38 s / 4,20 s |
| **live-cold** (heutiges Produkt, 240 h, ohne Radar) | **0,99 s** / 2,61 s | 1,77 s / 3,51 s | 1,90 s / **13,8 s** (Innsbruck, INCA) | — |
| dem-live-z9 (DEM-Box des Live-Pfads, 4 Kacheln, 434 KB p50) | 0,73 s / 0,75 s | 0,89 s / 1,01 s | 0,99 s / 1,77 s | 3,02 s / 3,89 s |
| terrain-z9 (Radius 20 km, 4 Kacheln, 564 KB) | 0,73 s / 1,27 s | 0,95 s / 1,03 s | 1,01 s / 1,64 s | 3,60 s / 3,91 s |
| terrain-z10 (Radius 20 km, 6 Kacheln, 719 KB) | 0,68 s / 0,81 s | 0,96 s / 1,39 s | 0,93 s / 1,64 s | 4,11 s / 7,19 s |
| terrain-z11 (Radius 2 km, 2 Kacheln, 283 KB) | 0,26 s / 0,58 s | 0,45 s / 0,69 s | 0,54 s / 0,72 s | 2,01 s / 3,33 s |

Live-Pfad je Land (p50, kalt): Desktop DE 0,72 s · AT 1,07 s · CH 0,98 s; Mobil-4G DE 1,87 s · AT 1,81 s (max 13,8 s) · CH 3,73 s (**89 Abrufe**, 81 davon `data.geo.admin.ch` — die SMN-Stationsdateien). Nowcast im heutigen Leser: p50 1,3 s Desktop / 7,5 s Mobil, **bis 25 RV-Frames à ≈ 63 KB = 1,6 MB, seriell** (Hamburg 12,4 s Desktop, 16 s Mobil) — Frames sind wetterabhängig groß (der Spiegel-Median 19 KB galt einem trockenen Tag).

**Was daraus folgt (bindend für AP1/AP7, Korrekturen am Plan §3.2):**

1. **Der heutige Leser ist die 30-s-Klasse**, die der Auftrag ausschließt: 13,6 s p50 auf Mobil-4G, 38,9 s auf 3G — nicht wegen der Chunks, sondern wegen **Serialität** (37 Abrufe nacheinander) und **Nowcast-Frames** (1,6 MB). Das heutige Produkt (Live-Pfad) ist mit ≈ 1–2 s p50 der Amtsinhaber auch in der Laufzeit; der Cube-Pfad muss ihn schlagen, nicht nur den Leser.
2. **Nowcast (AP7): Frames nur auf den Ausgabeschritten** (stündlich ⇒ 3 RV-Frames statt 25; INCA 4 statt 12) **und parallel**; die 5-min-Reihe nur auf ausdrückliche Anfrage. Damit fällt der Posten von 1,6 MB auf ≈ 0,2 MB. Dazu E-F-8 (`latest.json`, spart 1–3 serielle Sonden à 300–600 ms kalt).
3. **Terrain ist der kritische Pfad, sobald das CDN warm ist:** die z9-Box kostet 0,7–1,0 s (4 Kacheln, ≈ 0,5 MB) — mehr als drei warme Chunks (≈ 0,2–0,4 s). Der §0.2-Auslöser (> 400 ms) **ist gerissen**. Entscheidung: **kein statisches Terrain-Produkt** (das Repo hat mit 307 MiB keinen Platz, R10), sondern **Zwei-Skalen-DEM**: Fernhorizont aus **z8** (600 m/px, 20 km = 33 px, 1–2 Kacheln ≈ 150–300 KB) + Nahfeld/TPI aus **z11** (2 km, 1–4 Kacheln, 283 KB p50, 0,26–0,54 s) ⇒ geschätzt 0,3–0,6 s, parallel zu den Chunks; Terrain je Ort **einmal** rechnen und in IndexedDB halten. E-F-6 ist damit durch Messung beantwortet; die z8/z11-Zahl wird in AP1 nachgemessen (Vorher/Nachher auf demselben Harness).
4. **Mobil-4G kalt-neu** liegt für den Cube-Pfad rechnerisch bei ≈ 1,5–2,0 s (Chunks 0,9 MB ≈ 0,8 s + RTTs, Terrain parallel 0,5 s, Worker-Dekodierung 0,4 s überlappt) — **Ziel p50 < 2 s knapp, p95 < 5 s sicher**. **Fast 3G** bleibt außerhalb: allein die Chunks brauchen ≈ 4,5 s ⇒ progressives Laden (t1 zuerst, t2/t3 nach der ersten Darstellung; Ebenen-Ranges) ist für 3G Pflicht, nicht Option (E-F-3 → AP12, mit dieser Messung als Grundlage).
5. **Dekodieren ist auf Mobil nicht gratis:** reader-warm (alles aus dem Browser-Cache) 2,0 s p50 auf Mobil-4G — davon der größte Teil PNG-Dekodierung der 25 Frames und `DecompressionStream` je Ebene. Worker + `wanted` (AP1) und Punkt 2 nehmen den Posten auf ≈ 0,3–0,4 s.
6. **Der kalte CDN-Fall ist mit E-F-1 zu beantworten, nicht mit Client-Code:** Desktop-MISS-TTFB p50 590 ms, max 2,2 s je Chunk; drei parallele Chunks ⇒ max-von-3. Ohne Warm-up im Publisher bleibt p90 kalt über 2 s.

**AP0-Abnahme:** Bericht mit p50/p95 je Szenario und Profil liegt (oben + JSON); Baseline des heutigen Leseweges und des heutigen Produkts im Browser gemessen; Terrain-Kachelkosten gemessen; kalter Chunk-TTFB gemessen (9.0.1); Repo-Größe gemessen (9.0.1). **Gates:** `npm run typecheck` 0 Fehler; `verify:point-client` 63/63 unverändert (kein `src/`-Modul berührt); Budget **unverändert by construction** — kein Byte in `src/`, `public/` oder der Vite-Konfiguration geändert (Textsonde entfällt, das Lab-Bündel ist kein Teil von `dist/`). Neue Dateien: `scripts/verify-pv-latency.mjs`, `scripts/pv-latency/{lab.ts,lab.html}`, `scripts/lib/cdpBrowser.mjs`, `package.json` (Alias `verify:pv-latency`), `audit/fusion-implementierung/latency/*.json`. **Nichts committet.**

**Neu benannt:** **V-FI-1** (9.0.2, `run.json` am CDN veraltet — betrifft Leser UND Archiv-Sammler; Priorität hoch, weil der Sammler heute Nacht davon betroffen sein kann) · **V-FI-2** der Nowcast-Leser holt jeden Frame seriell und ungeachtet des Ausgaberasters (bis 25 × 63 KB; Kur in AP7) · **V-FI-3** `readCubePoint` gibt bei fehlender Stufe im Manifest `null` ohne Grund zurück (Kur in AP1: benannter Befund `tierMissing`) · **V-FI-4** die SMN-Stationsdateien kosten dem Live-Pfad in CH 81 Abrufe je Abfrage (nur Rückfallpfad, nicht Teil dieses Plans; benannt).

**Nächste Etappe: AP1** (Lesepfad: Adresse aus `index.json`, `run.json` `@commit` nur für Provenienz, alle Abrufe parallel, `wanted`, Worker-Dekodierung, IndexedDB, Zwei-Skalen-DEM, Nowcast-Frames auf Ausgabeschritten). Abnahme: Lesephase ≤ 400 ms Desktop warm, ≤ 1,0 s Mobil-4G warm, gemessen mit `verify:pv-latency` (neues Szenario `cube-read`).

### 9.1 AP1, erster Schritt — V-FI-1 im Leser behoben (2026-09-16, 12:40–13:00 UTC)

**Vorab gemessen, weil der Fix darauf baut:** `@<commit>`-Pfade liefert jsDelivr für dieses 307-MiB-Repo (HTTP 200, `cache-control: immutable`, kalt 0,8–1,5 s, warm 25 ms), und die gepinnte Fassung von `point/2026091600/run.json` trug **t2 + t3** — die `@main`-Fassung zur selben Zeit t1 + t2.

**Umgesetzt (`src/point/client`, nur Client, kein S&F):**
- `store.ts`: `PointStore.withBase?(base)` — derselbe Store unter anderer Basis, **dieselbe** Zählung (`httpStore` teilt `stats`; `memoryStore` gibt sich selbst zurück).
- `cubePoint.ts`: `manifestStore(store, index)` pinnt eine jsDelivr-`@main`-Basis an `index.commit`; `loadRunManifestFrom()` liest zuerst gepinnt (ein 403/404 auf den frischen Commit wird **einmal** wiederholt, V-PD-46 — ein 403 ist beim Store ein Fehler, deshalb fängt der gepinnte Versuch ihn), dann `@main` als Rückfall, und **nennt die Herkunft** (`pinned | main | none`); `readCubePoint` trägt `manifestFrom` in der Reihe und meldet eine übersprungene Stufe über `opts.onSkip(reason)` (V-FI-3) — mit dem Hinweis „@main, möglicherweise veraltet — V-FI-1", wenn es der Rückfall war. Chunks bleiben unter `@main` (unveränderlicher Pfad, am Edge warm).
- `collect.mjs`: `memoStore.withBase` (ein Memo je Basis), Manifeste gepinnt, Rückfall und fehlende Stufe landen in `stats.errors`; `hmodel` (Manifest **und** Chunks, beide in place veränderlich) über den gepinnten Store. `read-point.mjs`: dasselbe, `onSkip` auf stderr. `lab.ts`: `skips` und `manifestFrom` im Ergebnis.
- Verifier `verify:point-client` **70/70** (war 63): sieben neue Prüfungen mit einem `fetch`, der `@main` ohne die Stufe und `@<commit>` mit ihr ausliefert — der Leser findet die Stufe gepinnt (`main: 0, pinned: 1`); **Negativkontrolle:** ohne Commit kommt `@main`, die Stufe fehlt, der Grund kommt heraus; V-PD-46: erstes 403 ⇒ Wiederholung ⇒ Commit trägt (`pinned: 2`); `caller`/`main`-Herkunft benannt. `typecheck` 0; `verify:point-data` 947/947, `verify:punktarchiv` 56/56 unverändert.

**Belegt am lebenden Datum (12:52–12:56 UTC):** `npm run point:read -- 46.0207 7.7491 --step=6 --no-nowcast --json` ⇒ t1 49 · **t2 24 · t3 36** Schritte, alle `manifestFrom: pinned`, 13 Dateien, 1,69 MiB (vorher: t2/t3 `null`, 11 Dateien). Im Browser (`verify:pv-latency --places=wien,zermatt --only=reader`, `latency/2026-09-16T12-55-07-378Z.json`): Wien und Zermatt je t1 49 / t2 24 / t3 36, `skips: []`, 1,2–1,4 MB je Ort (vorher 0,7–0,9 MB — die fehlenden Stufen sind jetzt dabei).

**Was noch nicht behoben ist:** die `@main`-Kopie bleibt am CDN veraltet (Publisher-Purge = E-F-1, AP12a); wer den Leser ohne Index-Commit oder mit fremder Basis benutzt, bekommt weiter `@main`, jetzt aber mit Grund. Der Sammler-Lauf um 23:10 UTC ist erst geschützt, wenn `buscosun-web/main` diesen Stand trägt (der Workflow klont `main`). *(Jan hat den Stand am 16.09. nachmittags committet und gepusht.)*

### 9.2 AP1 — Lesepfad schlank und parallel (2026-09-16, 13:10–15:30 UTC)

**Auftrag (§4, AP1):** `index.json` mit `no-cache`; Chunk-Adresse aus `index.json`; alle Abrufe parallel; `wanted`; Worker-Dekodierung mit Hauptthread-Rückfall; IndexedDB-Cache; Frist je Abruf; Nowcast-Sonden parallel; `store.stats.ms`; dazu aus §9.0.4: Zwei-Skalen-DEM z8 + z11, Nowcast-Frames nur auf den Ausgabeschritten. **Abnahme:** `verify:point-client` wertgleich zum seriellen Leser (mit Negativkontrolle); Lesephase ≤ 400 ms Desktop warm, ≤ 1,0 s Mobil-4G warm, gemessen mit `verify:pv-latency`.

**Umgesetzt — nur `src/point/client`, Skripte und Verifier. Kein Modul der Fusion-Engine berührt, kein Byte im App-Bundle** (Build 241/241, `npm run budget`: eagerJs 107,9 · largestChunk 301,2/302 · totalJs 1 366,1/1 372 — unverändert; Textsonde des Verifiers: `readPointBundle`, `cachedStore`, `decodeChunkPooled`, `loadTerrainAtPoint` in null von 83 Chunks).

| Datei | Was |
|---|---|
| `store.ts` | `FetchOpts.cache` (der Index geht mit `no-cache`, R9); `stats.ms/slow/retries` (weiche Frist 4 s, harte 8 s im Browser-Leser, 20 s bleibt Voreinstellung für den Sammler); Wiederholung **nur bei 5xx/Netzfehler**, nie bei 403/404/Frist (V-FI-5); `memoStore` (jeder Pfad einmal je Instanz, Absagen werden **nicht** gemerkt) |
| `cache.ts` **neu** | Byte-Cache VOR dem Store mit **Regel je Pfad**: Chunks, Stationsbündel, Radar-Slots und alles unter `@<sha>` unveränderlich; Katalog/`sources`/`calib` 24 h; `point/static/*` 12 h; `index.json` und `run.json@main` nie. Backends IndexedDB (Browser) und Speicher (Selbsttest); Sweep nach 48 h; ein 404 wird nicht gemerkt; jeder Backend-Fehler fällt aufs Netz zurück und wird gezählt |
| `decodePool.ts` + `decodeWorker.ts` **neu** | Pool von ≤ 3 Web-Workern (Muster `src/sources/decompress.ts`): Chunk als Kopie hinein, Ebenen als Transfer zurück; dieselbe `decodeCubeChunk`; Hauptthread-Rückfall bei fehlendem `Worker` (Node), Worker-Fehler oder 15 s ohne Antwort; `configureDecodePool({ workers: 0 })` erzwingt den Hauptthread für die Vorher/Nachher-Messung; `decodePoolInfo()` sagt, welcher Weg gefahren wurde |
| `terrain.ts` **neu** | Zwei-Skalen-DEM (E-F-6): z11 im Radius 2,5 km (Höhe, TPI 500/2000, Neigung, Nahfeld der Horizontstrahlen), z8 im Radius 20,5 km (Fernfeld bis 20 km); `tilesForRadius` holt nur die Kacheln, die der Radius schneidet; Rechnung über die bestehenden reinen Funktionen aus `terrainPoint.ts`; Ergebnis je Ort (4 Nachkommastellen ≈ 11 m) und Kachel-Bytes im selben Cache; RGBA-Dekoder injiziert (`browserPng.ts` im Browser, `png.mjs` in Node) |
| `browserPng.ts` **neu** | `createImageBitmap` + (Offscreen-)Canvas → RGBA für Terrarium, Rotkanal → ein Kanal für die Werte-PNGs des Spiegels (9.0.3) |
| `cubePoint.ts` | in drei reine Stücke zerlegt: `cubeAddress` (Index → Zelle/Chunk/Pfad, **ohne Manifest**), `planesForChunkHeader` (Schema 5 mit 57 Ebenen ⇒ `CUBE_PLANES`, sonst Manifest nötig), `cubeSeriesFrom` (entpackter Chunk → Reihe; ohne Stufe im Manifest bleiben die Werte und `provenanceNote` benennt die Lücke); `readCubePoint` setzt sie seriell zusammen — **Vertrag für Sammler und Verifier unverändert** (`null` bei fehlender Stufe, `onSkip` mit Grund) |
| `staticPoint.ts` | `readStaticProductPoint` (Manifest ‖ Chunk parallel, eine Form für `hmodel` und `urban`), `readUrbanPoint` (U-7 aus dem Plan), `readHmodelPoint` unverändert als Aufruf davon |
| `nowcastPoint.ts` | `atMs` = Ausgabezeiten ⇒ je Zeit der nächste Frame (≤ 30 min), doppelte weg; Frames **parallel**; Slot-Sonden in Vierergruppen; eine Sonde oder ein Frame mit Transportfehler reißt die anderen nicht (V-FI-2, V-FI-5); `framesInSlot/framesFetched/framesFailed` |
| `resolve.ts` | `judgeStation` — die Stationsregel EINMAL, für Plan und Bündel; ein Sondenfehler reißt den Plan nicht |
| `readPoint.ts` **neu** | `readPointBundle`: Index (no-cache) → alles parallel (je Stufe Chunk ‖ `run.json@commit`, Dekodierung sobald der Chunk da ist; Katalog ‖ Stationsmanifest ‖ **optimistisches Bündel** des eigenen Chunks; Radarsonden → Frames auf Ausgabezeiten; `hmodel`/`urban`; Gelände ab dem ersten Takt); `timing.doneAt` je Produkt, `firstMs`, `coreMs`, `readMs`; `skips`/`notes`/`errors` getrennt; die Auswahlregel am Ende über den Memo-Store (kein weiterer Abruf) |
| `read-point.mjs` | fährt das Bündel (Node: Hauptthread, kein IndexedDB, `png.mjs`); neue Zeilen „Gelände", „Stadt-Raster", „Zeit (AP1, parallel)" mit kritischem Pfad; `--no-terrain` |
| `lab.ts` / `verify-pv-latency.mjs` | `bundle()` (IndexedDB, Worker, Zwei-Skalen-DEM, Long-Task-Beobachter), `terrain2()`, `prime()`; Szenarien `cube-read-cold/-warm/-main/-nocache`, `terrain-z8`, `terrain-2scale`; `--gate` prüft die AP1-Abnahme auf `coreMs`; Startzeit je Abruf im Mitschnitt |
| `verify-point-client.mjs` | **107/107** (war 70): Block (10) mit 37 Prüfungen — s. unten |

**Drei Begriffe, die beim Bauen entstanden sind — und warum:**

1. **„Erste Darstellung" = Stufe am Fensteranfang + Gelände.** Der Nowcast gehört nicht dazu: seine Dateien sind alle fünf Minuten neu und deshalb am Edge fast immer `MISS` (gemessen 0,8–1,6 s je Sonde und je Frame, s. u.). Er kommt nach, wie er kommt (progressiv, E-F-3); ein Verbraucher zeichnet ihn nach. Das ist die Zahl, die ein Nutzer als Antwortzeit erlebt.
2. **„Lesephase" (`coreMs`) = Cube-Stufen + Station + Gelände** — alles, was buscosun Fusion für die Ausgabe braucht. Statische Produkte (`hmodel`, `urban`) und Nowcast stehen in `doneAt`, aber nicht im Gate: die Modellhöhe je Quelle braucht v1 nicht (PAP 4 rechnet mit `hModEff` aus dem Cube; E-E-5), `urban` erst mit den Amplituden aus AP10, und beide kamen in der Messung als Letzte an (V-FI-6).
3. **Statische Produkte über `@main` mit 12-h-Cache, nicht `@<commit>`.** §9.1 hatte sie gepinnt (in place veränderlich). Im Lab gemessen: die gepinnte Fassung ist für **jeden Nutzer nach jedem Publish** ein Edge-MISS — 1,2–2,1 KB Dateien mit 0,9–2,1 s TTFB, achtmal täglich neu, und damit der kritische Pfad des ganzen Bündels (Wien: `static` fertig bei 5,9 s, alles andere bei 2,5 s). `@main` ist nach dem ersten Nutzer je Edge 12 h warm; die Ebenenzahl prüft der Decoder laut, eine Umordnung der Spalten bei gleicher Zahl bliebe still (seit PD-E dieselben Spalten). `staticPinned: true` schaltet zurück. **V-FI-6.**

**V-FI-5 — jsDelivr antwortet mit 403 statt 200 oder 404, nach Sekunden, vorübergehend.** In vier Lab-Läufen: `radar/img/v1/inca/…/meta.json` (403 nach 4,0 s), `point/static/urban/v1/t1/03_13.bin` (403 nach 5,8 s, gepinnt UND `@main`), `radar/img/v1/rv/2609161415/f120.png` (403 nach 1,4 s), `point/static/hmodel/v1/t2/00_01.bin` (403 nach 1,5 s), `radar/img/v1/rzc/20260916T1420/meta.json` (403 nach 5,7 s — ein Slot, den es noch **nicht** gab, also statt 404). Dieselben URLs per `curl` Minuten später: **200, `x-cache MISS`**. Es ist der Origin-Abruf des CDN, der scheitert (das Repo hat 307 MiB, R10 — ob das die Ursache ist, lässt sich von außen nicht belegen). Folgen im Leser: ein 403 wird **nicht wiederholt** (er kommt nach Sekunden und blieb im Lab über vier Läufe), eine Sonde mit 403 gilt als „nicht da" und die Suche geht weiter, ein Frame mit 403 fehlt in der Reihe, ein Produkt mit 403 fehlt im Bündel — **mit Fehlertext**, nie still. Der 403 auf eine Datei, die es nicht gibt, ist der Grund, warum die Slot-Suche weiterprobieren muss statt abzubrechen. **Für E-F-1 heißt das:** das Warm-up im Publisher muss den 403 als Fehlschlag zählen und wiederholen, nicht als „gewärmt".

Die volle Matrix hat den Befund dann verschärft: der t1-Chunk von **Genf** (`point/2026091609/t1/00_00.bin`, 616 KB) kam in **drei Profilen und zwölf Läufen über 15 Minuten** mit 403, auch warm (er war nie im Cache angekommen); `urban/v1/t1/02_07.bin` (Innsbruck) fünfmal 403 und dreimal **über der harten Frist von 8 s**. Per `curl` danach: `@main` **200, `x-cache MISS`** (also nie zuvor am Edge), `raw.githubusercontent.com` 200 mit **229 ms** TTFB und `Access-Control-Allow-Origin: *`. Ein einzelner Chunk, der am Edge nicht ankommt, macht 0–48 h für alle Nutzer dieses Edge unlesbar — Warm-up (E-F-1) hilft dagegen nur, wenn es selbst nicht 403 bekommt. Deshalb **Ausweichweg im Leser** (`fallbackStore`/`withRawFallback` in `store.ts`): 403, Fristablauf, 5xx (nach Wiederholung) oder Netzfehler am jsDelivr-`@main`-Store ⇒ derselbe Pfad von `raw.githubusercontent.com`, gezählt (`stats.fallbacks`) und im Bündel benannt (`notes`: „cdn: … über raw.githubusercontent nachgeholt"). Ein 404 nimmt den Ausweichweg nicht. Der Ausweichweg hat keinen Edge-Cache und bleibt die Ausnahme; der IndexedDB-Cache hält, was er liefert, wie alles andere.

**Prüfungen (Block 10, alle netzfrei, echte Datenformen):** Bündel == serieller Leser (Stufe und Station wertgleich, Spalte gleich; Negativkontrolle verschobene Zelle); Auswahlregel im Bündel und `judgeStation` einheitlich; veraltetes Manifest ⇒ Werte bleiben + `provenanceNote` (und der serielle Leser gibt weiter `null`); ohne Manifest ⇒ `manifestFrom: none`; `tiersForWindow` an sechs Fenstern inkl. Naht 49 h ⇒ t1 **und** t2; `nowcastTimes`; Frames auf drei Ausgabezeiten = 3 von 25, Werte gleich dem Fensterweg, Toleranz 30 min, 403 auf die jüngste Sonde ⇒ dritter Stempel gefunden mit vier Sonden auf einmal, „kein Slot und Transportfehler" wird geworfen; Station im **Nachbarchunk** ⇒ zweites Bündel, Spalte 0; Cache-Regel an acht Pfaden, Treffer/Umgehung/Ablauf/404-nicht-gemerkt/Sweep; Memo einmal je Pfad, Absage nicht gemerkt; Dekodier-Pool in Node = Hauptthread, Ebene für Ebene gleich, `wanted` kommt an; Index mit `no-cache`; Dauer/weiche Frist/5xx-Wiederholung/403 sofort/404 nie; Gelände an **synthetischen Terrarium-Kacheln**: Ebene ⇒ 700 m/TPI 0/Horizont 0/SVF 1, Gipfel ⇒ TPI **wie analytisch** (11,4 m auf 500 m, 156 m auf 2 km — die erste Fassung der Prüfung erwartete > 20 und war falsch, die Rechnung nicht), 2 km östlich ⇒ Horizont West 8–14°, Ost 0°, SVF < 1; Ergebnis-Cache und Kachel-Cache getrennt belegt.

**Gemessen — volle Matrix (16.09. 14:33–14:42 UTC, `latency/2026-09-16T14-33-41-921Z.json`, 4 Profile × 10 Orte × 4 Szenarien = 160 Läufe; Gelände `…T14-42-16-240Z.json`, 100 Läufe).** Je Profil ein Aufwärm-Kontext davor (`prime`: DNS/TLS des Browser-Prozesses — der erste Abruf eines Prozesses kostete sonst 2,4 s auf `index.json` und 2,8 s je S3-Kachel; das ist Maschine, nicht Leseweg). Szenario „kalt-neu" = frischer Browser-Kontext (IndexedDB leer, CDN so, wie es war). Alle Zeiten Wandzeit in der Seite, p50 (p95).

| Profil | kalt-neu: **Kern** · erste Darstellung · alles | warm (IndexedDB): **Kern** | warm, Hauptthread statt Worker: Kern | warm ohne IndexedDB (Browser-HTTP-Cache): Kern |
|---|---|---|---|---|
| desktop-none | **1 458** (2 871) · 1 316 · 1 673 ms | **189** (343) | 230 | 232 |
| desktop-4g | 2 224 (2 466) · 2 224 · 2 233 | 384 (729) | 406 | 399 |
| mobile-4g (CPU 4×) | **2 236** (2 708) · 2 236 · 2 236 | **367** (407) | 820 | 502 |
| fast-3g (berichtet) | 8 693 (8 713) · 8 693 · 8 693 | 4 413 (7 210) ⚠ | 1 271 | 852 |

Kalt-neu je Ort: 1,87 MB p50 auf dem Draht, 29 Abrufe (t1-Chunk 545–634 KB, t2 ≈ 210, t3 ≈ 250, Stationsbündel ≈ 100, Katalog 59, Gelände 320–640, Radar-Frames 3 × 85, Manifeste/Static ≈ 40). Desktop kalt: 225 HIT / 37 MISS über alle Läufe — die 37 MISS sind die 8-s-Fälle (Genf, Innsbruck; unten). **Gate AP1: GRÜN** — Kern warm p50 Desktop **189 ms** (Grenze 400), Mobil-4G **367 ms** (Grenze 1 000).

Was die Matrix außerdem gezeigt hat, und was daraufhin noch am selben Nachmittag geändert wurde:

1. **Der 403 kostet bis zur harten Frist.** Genf: t1-Chunk 403 in zwölf Läufen, jedes Mal erst nach ≈ 8 s (die p95-Werte 8 062–8 116 ms in der Desktop-Zeile sind genau das). Auf einen Fehler zu warten kostet die Zeit, die ein Ausweichweg sparen soll ⇒ **Hedge**: nach 2,5 s (p95 der MISS-TTFB) startet `raw.githubusercontent` zusätzlich, die schnellere Antwort gewinnt, der Verlierer wird abgebrochen (`fallbackStore({ hedgeMs })`, `FetchOpts.signal`).
2. **Fast 3G warm 4,4 s war ein Lab-Artefakt:** `configureDecodePool` baute den Pool bei jedem Aufruf neu, und der Lab-Server lieferte das Worker-Skript (17 KB) mit `no-store` — drei Worker × 17 KB über 1,6 Mbit und 560 ms RTT. Der Pool bleibt jetzt stehen, wenn sich nichts ändert; das Skript ist cachebar (in der App ist es ein gehashter Chunk). Der Hauptthread-Wert derselben Zeile (1 271 ms) zeigt, was der Leser auf 3G warm wirklich kostet.
3. **Auf 4G begrenzen die Bytes, nicht die RTTs** (1,87 MB ≈ 1,6 s reine Übertragung bei 9 Mbit). Alles feuert gleichzeitig, also teilen sich t2/t3 (460 KB) die Leitung mit der Stufe, die die erste Darstellung braucht ⇒ **Fetch-Prioritäten** (`FetchOpts.priority`): Stufe am Fensteranfang, Gelände, Katalog, Stationsbündel `high`; übrige Stufen, statische Produkte, Radar `low`.
4. **Worker gegen Hauptthread:** Desktop warm 189 gegen 230 ms — kaum Unterschied (drei Chunks à ≈ 50 ms). Mobil-4G (CPU 4×) **367 gegen 820 ms** — dort ist der Pool der Unterschied zwischen unter und über einer halben Sekunde. ⚠ Der Long-Task-Beobachter (`PerformanceObserver('longtask')`) hat in **allen** Läufen 0 gemeldet, auch im Hauptthread-Modus mit nachweislich 3 × 50 ms Dekodierung am Stück: `chrome-headless-shell` liefert diese Einträge nicht. „Kein Long Task > 200 ms" ist mit diesem Harnisch **nicht belegbar** und bleibt für AP11 (Real-Device, DevTools-Trace) offen.
5. **Zwei-Skalen-DEM gegen die z9-Box des Live-Pfads:** `terrain-2scale` 720 ms p50 Desktop (p95 1 615) / 921 ms Mobil gegen `dem-live-z9` 715 / 861 ms — **gleich teuer**, nicht billiger: die Zeit sitzt in der S3-Latenz je Kachel (TTFB 380–460 ms, unabhängig von der Größe), nicht in den Bytes (322–639 KB gegen 291–623 KB). Was die zwei Skalen bringen, ist die Auflösung (76 m/px im Nahfeld statt 305 m/px — TPI 500 m ist mit z9 gar nicht rechenbar) bei gleichem Preis; und der Ergebnis-Cache macht jeden weiteren Besuch desselben Orts gratis (warm: Gelände fertig nach 3–7 ms). Die §0.2-Vermutung „2–8 Kacheln parallel zu den Chunks, nicht auf dem kritischen Pfad" hält auf dem Desktop (Gelände 731 ms, t1-Chunk warm am Edge ≈ 300–560 ms ⇒ das Gelände IST der kritische Pfad der ersten Darstellung) — die Kur wäre ein Vorabruf beim Tippen des Orts oder ein statisches Produkt (E-F-6 bleibt „nein", das Repo hat keinen Platz).
6. **Radar und statische Produkte kommen als Letzte** (kalt: Nowcast fertig bei 1,5–1,6 s auf 4G, 6,8 s auf 3G; Static beim ersten Nutzer je Edge 0,5–1,1 s): beide sind vom Kern getrennt (oben, Begriffe 1 und 2). Die Radar-Dateien sind alle fünf Minuten neu und damit am Edge fast immer MISS — E-F-8 (`latest.json`) spart Sonden, aber keinen MISS; ein Warm-up im Spiegel-Workflow wäre die Kur (S&F Radar-Linie, benannt als **V-FI-7**).

**Nachmessung nach den vier Änderungen (14:53 UTC, `latency/2026-09-16T14-53-27-456Z.json`, Genf/München/Zermatt/Innsbruck, Desktop + Mobil-4G):**

| Profil | kalt-neu Kern p50 (p95) · erste Darstellung | warm Kern p50 (p95) | Hauptthread | ohne IndexedDB |
|---|---|---|---|---|
| desktop-none | **841** (1 206) · 795 ms | **168** (174) | 239 | 235 |
| mobile-4g | **2 320** (2 678) · 2 319 ms | **325** (337) | 970 | 487 |

**0 Fehler in 32 Läufen, 5 Ausweichwege** (Genf: der t1-Chunk 403 ⇒ `raw` nach dem Hedge; die rzc-Sonden 403 ⇒ `raw`), Genf kalt jetzt 2,3 s statt 8 s. Gate AP1 erneut **GRÜN** (168 / 325 ms). Die 4G-Kaltzeit blieb bei ≈ 2,3 s — die Prioritäten ändern die Reihenfolge, nicht die Menge: **1,9–2,5 MB bei 9 Mbit sind ≥ 1,7 s**, das ist die Grenze dieses Formats und der Hebel von AP12 (Ebenen-Ranges: die ≈ 20 Kernebenen von 57 zuerst, E-F-3).

**Am lebenden Datum, Node (`npm run point:read -- 46.0207 7.7491 --at=2026-09-17T12:00Z --no-nowcast`, 14:55 UTC):** Zermatt ⇒ Gelände **1 608 m**, TPI 500 m **−35**, TPI 2 km **−359** (Talboden — das Vorzeichen stimmt), Neigung 2,7°, SVF 0,864, Horizont 12–31° (4 Kacheln, 469 KB, 861 ms); Station ZERMATT 1,0 km, **+30 m — vertritt den Punkt** (das Höhenkriterium ist zum ersten Mal ohne `--elev` geprüft, aus dem Gelände); `urban` 2 % / d0 0,5 m; 11 Dateien, 1,19 MiB, erste Darstellung 867 ms, Lesephase 892 ms; ein rzc-403 über `raw` nachgeholt und im Protokoll benannt.

**Gegen die AP0-Basislinie (derselbe Harnisch, derselbe Tag):** heutiger Leser kalt 3,0 s Desktop / 13,6 s Mobil-4G / 38,9 s 3G ⇒ Bündel kalt Kern **0,84–1,46 s / 2,2–2,3 s / 8,7 s**, erste Darstellung 0,8–1,3 s Desktop; warm 0,72 / 2,0 s ⇒ **0,17–0,19 / 0,33–0,37 s**. Fast 3G bleibt übertragungsgebunden (1,2–1,6 MB) und außerhalb der 5-s-Grenze — wie in §9.0.4 vorhergesagt, AP12 ist dort Pflicht.

**AP1-Abnahme:** fachlich ✓ (`verify:point-client` **112/112**, Bündel wertgleich zum seriellen Leser mit Negativkontrolle) · Laufzeit ✓ (Gate zweimal grün, 14:33 und 14:53 UTC) · `typecheck` 0 · `verify:point-data` 947/947 · `verify:punktarchiv` 56/56 · `verify:pv-fusion` Exit 0 (Engine unberührt) · Build 241/241 · Budget unverändert (eagerJs 107,9 · totalJs 1 366,1) · Textsonde 0 von 83 Chunks. Was AP1 **nicht** liefert: `wanted` ist gebaut und geprüft, aber ungenutzt — die Ebenenliste, die buscosun Fusion wirklich braucht, legt AP2 fest; Long Tasks sind nicht messbar (oben, 4).

**Neu benannt:** **V-FI-5** (jsDelivr 403 nach 1–8 s, vorübergehend, auch statt 404; Leser-Kur: kein Retry, Sonde = nicht da, Hedge + raw-Ausweichweg; für E-F-1: Warm-up muss 403 als Fehlschlag zählen) · **V-FI-6** (statische Produkte gepinnt = MISS für jeden Nutzer nach jedem Publish ⇒ `@main` + 12 h) · **V-FI-7** (Radar-Slots am Edge immer MISS — Warm-up gehört in den Spiegel-Workflow, S&F) · **V-FI-8** (`urban.bldgH` zeigt `0.7000000000000001` — `dequantize` 7 × 0,1; kosmetisch, Rundung auf die Skala gehört in die Ausgabe v2) · **V-FI-9** (`planPointSources` probt die Radar-Slots auch, wenn der Aufrufer den Nowcast abgeschaltet hat — nur CLI-relevant).

**Nächste Etappe: AP12a** (E-F-1: Warm-up + `run.json`-Purge in `publish-point.mjs` und der Vorlage `workflow-point.yml`, Kopie ins Daten-Repo = Jans Push; das Warm-up zählt 403 als Fehlschlag und wiederholt), dann **AP-PA2** (AT/CH-Punkte über TAWES/SMN in `scripts/punktarchiv/points.mjs`), dann **AP2** (`cubeSource.ts` + `pointSource: 'cube'`, S&F: erste Berührung der Engine).

### 9.3 AP-PA2 — AT- und CH-Punkte im Archiv (E-F-9, 2026-09-16, ab 17:20 UTC)

**Reihenfolge getauscht:** PA2 vor AP12a, weil nur PA2 eine Uhr hat — der Archiv-Cron klont `buscosun-web/main` um 23:10 UTC, jeder Tag ohne PA2 fehlt dem Backtest (AP9) für AT/CH.

#### 9.3.1 Diagnose (gemessen 17:20–17:50 UTC, vor dem Code)

Quellen: `point/stations/catalog.json` (Remote, 3 071 Stationen), POI-Verzeichnis (974 Dateien), TAWES-Metadaten (`station/current/tawes-v1-10min/metadata`, 86,8 KB, 0,75 s), SMN-Metadaten (`ogd-smn_meta_stations.csv`, 151,8 KB, 0,25 s), `scripts/punktarchiv/points.json` (Stand 14.09.).

**(1) Die heutige Liste ist in AT und CH nicht nur dünn, sondern falsch etikettiert.** Die Regel „WMO-Block 11 = AT, 06 = CH" trifft ganze Blöcke, nicht Länder: Block 11 ist AT 11000–11399, **CZ 11400–11799, SK 11800–11999**; Block 06 ist DK 060–061xx, NL 062–063xx, BE 064xx, LU 065xx, **CH nur 066–067xx**, LI 069xx. Ausgezählt an den 243 Punkten: „AT 23" = **13 AT** + 9 CZ + 1 SK (Bratislava); „CH 12" = **5 CH** + 1 LI (Vaduz, MeteoSchweiz-Station VAD) + 1 DK + 4 NL + 1 LU. DE 208 ist sauber (Block 10 ist nur Deutschland). Wahrheit TAWES 11, SMN 6 (inkl. Vaduz).

**(2) Die POI-Pflicht ist der Engpass, nicht die Netze.** POI führt 11 TAWES- und 6 SMN-Stationen. Die Netze selbst: **TAWES 288 Stationen, 286 aktiv, alle in der Cube-Box** (269 mit 11xxx-Kennung = Synop-Kennung, `id_type: "Synop"`; 19 mit 8989xxx = Partner-/Teststationen, u. a. „WEIZ - TESTSTATION", sechs Innsbrucker Stadtstationen); **SMN 158 Stationen, alle „Automatic weather stations", alle in der Box** (156 mit WIGOS `0-20000-0-<WMO>`, 2 national `0-756-0`; 13 gemeinsam mit dem SLF; Kanton FL = Vaduz).

**(3) Wie der Sammler heute einen Punkt dem Stationsprodukt zuordnet:** `collectStations` nimmt `nearestStations(catalog, p.lat, p.lon)[0]` und liest das Bündel nur, wenn diese Station **der Punkt selbst** ist (`c.id === p.id`), sonst Vermerk „nächste Katalogstation ist nicht der Punkt selbst" und `planes: null`. Das trägt, weil PA1-Punkte Katalogstationen mit Katalogkoordinaten sind. **Ein Punkt mit TAWES- oder SMN-Kennung und eigener Position hätte kein MOSMIX-Produkt** (B2 im Backtest fiele weg) — die Kennung im Archiv muss die Katalogkennung bleiben, die Zuordnung muss über die Kennung laufen statt über die Nähe.

**(4) Katalog und Netze decken sich — gemessen, nicht angenommen.** Für jede Katalogstation die nächste TAWES/SMN-Station (Haversine), Abstand und Δz (Netzhöhe − Katalogeintrag):

| Paar | Anzahl | Abstand | Δz |
|---|---|---|---|
| gleiche Kennung (TAWES-Kennung = Katalog, SMN-WIGOS-WMO = Katalog) | **171** (TAWES 69, SMN 102) | 0,24–2,93 km, **95 % ≤ 2 km**; Ausreißer Zell am See 4,56 km | alle **\|Δz\| ≤ 42 m** (91 % ≤ 11 m) |
| andere Kennung, ≤ 2 km, \|Δz\| ≤ 50 m | 21 (fast alle AT) | 0,15–2,00 km | −34…+15 m |
| andere Kennung, verworfen | u. a. Murau↔Stolzalpe +477 m, Kitzbühel↔Hahnenkamm +924 m, Dachstein −295 m, Mühleberg −295 m, Andermatt −65 m, Tannheim +60 m; oberhalb 2 km wechseln die Ortsnamen (Gmunden↔Altmünster 2,37 km, Nilling↔Ostermiething 2,71 km) | | |

Warum Paare gleicher Kennung bis 2–3 km auseinanderliegen: der Katalog trägt Koordinaten auf **zwei Dezimalen** (≈ 0,7 km) und in einem Teil der Fälle einen älteren Referenzpunkt; die Netzkoordinaten sind die Messstelle (vier bis sechs Dezimalen). Bei Bergstationen ist das nicht kosmetisch: 1 km neben dem Säntisgipfel liegt das Gelände Hunderte Meter tiefer — PAP 4 (`h_true`) braucht die **Messstelle**. Die Paare anderer Kennung sind die bekannten Doppelführungen: `11120 INNSBRUCK FL.` ↔ TAWES `11121 INNSBRUCK-FLUGHAFEN (AUTOMAT)` 1,22 km/−3 m, `11231 KLAGENFURT FL.` ↔ `11331` 0,91 km/+2 m, `11146 SONNBLICK` ↔ `11343 SONNBLICK - AUTOM.` 0,73 km/+3 m, `P0060 PATSCHERKOFEL` ↔ `11126` 1,82 km/+3 m. **Heute tragen `11120` und `11231` gar keine TAWES-Wahrheit** (PA1 prüft nur Kennungsgleichheit).

**(5) Wahrheit lesbar — Stichprobe an den Endpunkten:** `station/historical/tawes-v1-10min` mit allen 11 TAWES-Kennungen, 26 h, `RR`: 200, 13,6 KB, 0,49 s (ein Aufruf für alle Stationen); `ogd-smn_<abbr>_t_now.csv` für PAY/KLO/SAE/GVE/SIO/VAD je 200, ≈ 15 KB, 0,13 s. **Grenze der SMN-Datei:** sie trägt nur den **laufenden UTC-Tag** (PAY um 17:36 UTC: erste Zeile 16.09. 00:00, 106 Zeilen) ⇒ im 23:10-Slot fehlt die Stunde 23:00 des Vortags; `_t_recent.csv` (5,2 MB je Station, täglich ≈ 11:20 UTC) ist der Nachholweg. TAWES-Historie reicht drei Monate zurück (`start_time 2026-06-16T00:10`).

**(6) Die `rr1`-Falle — und warum sie mit PA2 von einem Vorbehalt zu einem Datenfehler wird.** PA1 schreibt für TAWES/SMN `rr1` = **10-min-Wert zur vollen Stunde × 6** (`hourMapSeries`, `src/sources/*History`) und benennt es in `truth.caveats`; POI trägt die Stundensumme. Solange jeder AT/CH-Punkt auch POI hatte, war das ein Vorbehalt. Für PA2-Punkte ist TAWES/SMN die **einzige** Wahrheit. Gemessen an den 17 Stationen mit beiden (letzte 24 h, 280 Stunden mit vollständigen 10-min-Werten, 14 nasse POI-Stunden):

| Verfahren | nasse Stunden | Summe | Σ\|Fehler\| gegen POI | Übereinstimmung nass/trocken |
|---|---|---|---|---|
| POI `rr1` (Referenz) | 14 | 16,4 mm | — | — |
| **10-min × 6 zur vollen Stunde (heute)** | **5** | **4,2 mm (−74 %)** | **15,4 mm** | — |
| Summe der sechs 10-min-Werte mit Stempel h−50…h (Stempel = Intervallende) | 15 | 16,9 mm | 0,7 mm | 279/280 |
| Summe mit Stempel h−60…h−10 (Stempel = Intervallbeginn) | 14 | 16,4 mm | 0,8 mm | 280/280 |

**SMN:** die Intervallende-Summe trifft POI an allen sechs Stationen **auf die Stelle** (Säntis 3,0 · 0,1 · 0,2 · 0,1 · 0,2 · 1,2 · 0,7 mm; Vaduz 7,8 mm, Intervallbeginn 7,6) — POI für Schweizer Stationen *ist* die SMN-Stundensumme, und `reference_timestamp` ist das **Intervallende**. **TAWES:** POI entscheidet es nicht (Feldkirch 16 h: POI 1,0, Ende 1,5, Beginn 1,3 — ein anderer Messer im Synop), aber das API sagt es: `RR` = „Niederschlag der **letzten** 10 Minuten", und die Historie beginnt bei 00:10 ⇒ ebenfalls **Intervallende**. Folge: die 10-min-Momentaufnahme verfehlt zwei Drittel der nassen Stunden — für die Brier-/P(nass)-Prüfung in AT/CH wäre die Wahrheit unbrauchbar. **Kur (im Sammler, nicht im Wahrheitsleser der App):** zusätzliche Spalte `rr1h` = Summe der sechs 10-min-Werte h−50…h, nur wenn alle sechs vorliegen (sonst Sentinel); `rr1` bleibt unverändert (Rückwärtsgleichheit der Slots). Aus demselben einen Abruf je Netz kommen `td` (TAWES `TP`, SMN `tde200s0`) und `p` (reduziert: TAWES `PRED`, SMN `pp0qffs0`) — heute für TAWES/SMN `null`, obwohl gemessen. `src/sources/geosphereTawes.ts` und `meteoSwissSmn.ts` bleiben unberührt (sie tragen den Stationsanker der App).

**(7) Was die Wahrheit ohne POI nicht hat:** Bedeckung `n` (weder TAWES noch SMN messen sie) ⇒ `clct` bleibt in AT/CH auf die POI-Punkte beschränkt. Benannt, nicht ersetzt.

**Regel für PA2 (daraus abgeleitet, Konstanten mit Herkunft):**
- **DE unverändert:** Katalog ∩ POI ∩ WMO 10000–10999 ∩ Box, Position aus dem Katalog.
- **AT/CH/LI:** Katalogstation mit einer TAWES- (AT) bzw. SMN-Station (CH; Kanton FL ⇒ LI) — **gleiche Kennung** bei ≤ 5 km (Wächter gegen Kennungswiederverwendung; gemessen max. 4,56 km) **oder** andere Kennung bei **≤ 2 km** (= 95 % der gemessenen Positionsabweichung identischer Stationen), beides mit **\|Δz\| ≤ 50 m** (gemessen: identische Paare ≤ 42 m, die ersten nicht identischen bei 60/65/112 m). Kennungsgleiche Paare zuerst, dann nach Abstand; jede Netzstation und jede Katalogstation höchstens einmal. **Kennung = Katalogkennung** (das Stationsprodukt hängt daran), **Position und Höhe = Messstelle**, die Katalogposition bleibt als `mosmix` am Punkt. POI bleibt zusätzliche Wahrheit, wo vorhanden; ohne Netzpaar bleibt ein AT/CH-Punkt mit POI wie bisher (Rückfall, damit ein Metadaten-Ausfall die PA1-Punkte nicht löscht).
- **Nachbarn (CZ, SK, DK, NL, BE, LU):** nicht gestrichen (zwei Slots liegen schon, die Punkte tragen POI und MOSMIX), aber **richtig etikettiert** (`country` = Land) und getrennt gezählt; `profile` = das Länderprofil, mit dem der Live-Pfad sie bisher gerechnet hat (AT bzw. CH) — unverändert, damit ihre Live-Reihe nicht bricht.
- Box, DEM endlich, eindeutig nach Kennung und Position (3 Dezimalen) — wie PA1. Wahrheit beim Bau geprüft: TAWES-Station ohne einen Wert `TL` in 24 h bzw. SMN-Datei nicht lesbar ⇒ Netzpaar verworfen (gezählt).

#### 9.3.2 Umgesetzt (nur `scripts/`, kein `src/`-Modul, keine Abhängigkeit)

| Datei | Was |
|---|---|
| `scripts/punktarchiv/points.mjs` | `WMO_RANGES` (statt Blöcken), `PROFILE_OF`, `NETWORK_OF`, `COLOCATE {idMaxKm 5, maxKm 2, maxDzM 50}` mit Herkunft; reine `matchNetworks` (kennungsgleich zuerst, dann nach Abstand, jede Station einmal) und `selectPoints` (Regel oben, Rückfall auf POI ohne Netzmetadaten, Gründe gezählt: `noTruth`, `colocateDz`, `colocateTooFar`); `readableNetworkStations` prüft die Wahrheit beim Bau (TAWES `TL` in ≤ 100 Kennungen je Abruf, SMN-Tagesdatei je Station); SMN-Metadaten als **Windows-1252** gelesen (sonst `S�ntis`, am ersten Bau gesehen). Selbsttest **11/11** (war 5) |
| `scripts/punktarchiv/lib/truth.mjs` | `parseTawesStations`, `parseSmnStations`, `parseSmnNowRows`, `parseTawes10min`, `parseSmn10min`, `hourSum10` (sechs Werte h−50…h, sonst `null`), `tenMinColumns`. Selbsttest **13/13** (war 7) |
| `scripts/punktarchiv/lib/rawFallback.mjs` **neu** | `withRawSameRef` — s. 9.3.4 (V-FI-5 im Sammler) |
| `scripts/punktarchiv/collect.mjs` | Stationsprodukt über die **Katalogkennung** (`p.mosmix?.id ?? p.id`) statt über die Nähe — für DE-Punkte dieselbe Station, Abstand 0; POI nur für Punkte mit POI-Datei; `rr1h`/`td`/`p` aus einem TAWES-Abruf bzw. der SMN-Tagesdatei (App-Leser `src/sources/*` unverändert); Live-Pfad mit `profile`; `slot.points` trägt `profile` und `mosmix`; `stats.net.fallbacks`; zwei neue Vorbehalte in `truth.caveats` |
| `scripts/punktarchiv/lib/punktarchiv.mjs` | `TRUTH_SCALES.rr1h` (additiv, Schema bleibt 1) |
| `scripts/punktarchiv/points.json` | neu gebaut, 410 Punkte (s. 9.3.3) |
| `scripts/verify-punktarchiv.mjs` | **87/87** (war 56): (4) Land aus WMO-Bereich bzw. Netz, ≥ 1 Wahrheit, DE unverändert, Nachbarn im PA1-Profil, **GPA2 ≥ 60 AT / ≥ 40 CH**, Paar-Grenzen, keine Netzstation doppelt; Gegenprobe (ein echter PA2-Punkt wird aus Katalog + TAWES wieder ausgewählt) und fünf Negativkontrollen an der reinen Regel (ohne Wahrheit, Δz 60 m, andere Kennung 3,3 km, außerhalb der Box, doppelte Position); (5) Stationsprodukt über die Kennung, POI nur mit Datei, `rr1h`; (7) Ausweichweg mit Negativkontrolle 404 |

#### 9.3.3 Ergebnis: die Punktliste (gebaut 17:40 UTC)

| Land | Punkte | Wahrheit | Paar gleiche Kennung / anderer Kennung | Dichte | Ziel |
|---|---|---|---|---|---|
| DE | **208** (unverändert: 208/208 mit gleicher Position, Höhe, DEM, Wahrheit) | POI | — | 1 je 1 717 km² | — |
| AT | **84** (PA1: 13 echte) | TAWES 84, davon 13 auch POI | 67 / 17 | 1 je 999 km² | ≥ 50 (DE-Dichte) ✓ · ≥ 60 (GPA2) ✓ |
| CH | **101** (PA1: 5 echte) | SMN 101, davon 5 auch POI | 101 / 0 | 1 je 409 km² | ≥ 25 ✓ · ≥ 40 ✓ |
| LI | 1 (Vaduz) | SMN VAD + POI | 1 / 0 | — | — |
| Nachbarn | 16 (CZ 9, NL 4, DK 1, LU 1, SK 1) | POI | — | getrennt gezählt | — |

Beim Bau geprüft: TAWES **280/286** lesbar (ohne einen `TL`-Wert in 24 h: 11267 Dachstein-Hunerkogel, 11290 Graz Universität, 8989044 Hahnenkamm/Sonnenrast, 11194 Neusiedl am See, 11316 Pitztaler Gletscher, 8989104 Graz Lendplatz/Feuerwehrturm — die Katalogstationen `11290` und `11194` bekommen dafür die Nachbarstation am selben Ort, 11291 bzw. 11072), SMN **158/158** (158 Abrufe, 1,9 MB, 1,3 s). Verworfen wegen Δz: 3; wegen Abstand: 0. Bauzeit 37 s.

**Warum mehr als das Ziel und nicht ausgedünnt:** jede Ausdünnung bräuchte eine gesetzte Regel ohne Messung (welche Station fällt?), und die zusätzlichen Punkte sind genau die, die dem Archiv fehlen: Messstellen AT/CH/LI **p10 273 · p50 596 · p90 1 971 m, 34 über 1 500 m (DE: 1)**. Das Gate von AP4 fragt nach Punkten mit \|h_true − hModEff\| > 300 m. Der Preis steht in 9.3.4 und ist Jans zu tragen oder zu kappen (E-U-13).

**Was an den PA1-Punkten anders wird:** die 13 AT- und 6 CH/LI-Punkte liegen jetzt an der Messstelle (0,15–4,56 km von der Katalogposition); am Säntis steigt die DEM-Höhe dadurch von **1 925 auf 2 370 m** (Station 2 501 m), in Innsbruck fällt sie von 689 auf 576 m (Station 578 m) — die alte Position lag am Hang. `11120 INNSBRUCK FL.` und `11231 KLAGENFURT FL.` tragen erstmals TAWES-Wahrheit (11121/11331). Die 16 Nachbarn behalten Position und Live-Profil, nur `country` stimmt jetzt.

#### 9.3.4 Ergebnis: lokaler Slot (nicht gepusht, `scratchpad/archiv/2026-09-16/1746.json.gz`)

**Lauf 1 (17:46 UTC, Index `ac95eb7`, t1 `2026091615` · t2 `2026091612` · t3 `2026091600` · Stationen `2026091615`):** 410 Punkte, **18 352 560 B gzip (17,50 MiB)**, 126,1 MiB roh, **648 s** (cube t1 124 · t2 39 · t3 9 · Stationen 102 · hmodel 138 · Plan 4 · Nowcast 137 · Wahrheit 4 · Live 91 s), 528 Abrufe, 80,5 MiB.

| Punktklasse | n | je Punkt, einzeln gepackt | Anteil `live` | Abdeckung cube t1/t2/t3 · Stationen · Nowcast · Wahrheit |
|---|---|---|---|---|
| DE | 208 | 46,7 KB | 75 % | 204/194/208 · 208 · 202 · 208 |
| AT nur TAWES | 71 | 51,1 KB | 76 % | 71/70/71 · 71 · 71 · 71 |
| AT TAWES + POI | 13 | 51,5 KB | 75 % | 13/13/13 · 13 · 13 · 13 |
| CH nur SMN | 96 | 51,0 KB | 76 % | 96/96/96 · 96 · 96 · 96 |
| CH/LI SMN + POI | 6 | 51,7 KB | 76 % | alle 6 |
| Nachbarn | 16 | 48,0 KB | 77 % | 16/12/16 · 13 · 12 · 16 |

- **Bytes je Punkt im Slot: 43,7 KB** gegen 42,5 KB im PA1-Slot vom 14.09. (243 Punkte, 10 579 767 B) — **+3 %**, der Slot wächst mit der Punktzahl, nicht pro Punkt. **Hochrechnung: 18,35 MB × 365 = 6,70 GB/Jahr** (PA1: ≈ 3,9 GB). GitHubs Empfehlung < 1 GB je Repo ist damit nach ≈ 55 statt ≈ 95 Tagen erreicht, die harte Empfehlung < 5 GB nach ≈ 9 statt ≈ 15 Monaten ⇒ **E-U-13 (Archivwachstum) wird dringender**; der Hebel ist `live` mit 75–77 % der Bytes, nicht die Punktzahl.
- Stationsprodukt für **186/186** PA2-Paare gelesen (über die Katalogkennung; Messstelle ↔ Katalog Median 0,75 km).
- Wahrheit: SMN 102/102, TAWES 84/84, 10-min-Spalten für alle 186. `rr1h` findet in 24 h **184 nasse Stunden an den 96 CH-Netzpunkten, die Momentaufnahme `rr1` 99** (AT: 26 gegen 14) — die Falle aus 9.3.1 (6) in der Fläche. `td` belegt (CH 1 674, AT 1 633 Stunden), `p` fehlt an Bergstationen ohne QFF (Säntis: Sentinel).
- Laufzeit am Runner, gerechnet: der Cron-Slot vom 15.09. brauchte für 243 Punkte 13 min (lokal 8,5) ⇒ Faktor 1,5 ⇒ **≈ 16–17 min für 410**, `timeout-minutes: 60` hält.
- ⚠ **38 Fehler, alle `HTTP 403` von jsDelivr (V-FI-5) — und sie trafen nicht nur PA2:** ein t1-Chunk (4 DE-Punkte), vier t2-Chunks (19 Punkte: 14 DE, 4 Nachbarn, 1 AT), zwei Stationsbündel (3 Nachbarn), fünf `hmodel`-Chunks (12 Lesungen). Der Sammler hatte keinen Ausweichweg; ein Slot ist nicht nachholbar (die Läufe fallen nach 9/24 h aus dem Repo) ⇒ **verlorene Archivzeit**. PA2 macht das wahrscheinlicher, weil der Sammler für die neuen Alpenchunks oft der erste Abrufer am Edge ist. **Kur (`lib/rawFallback.mjs`):** derselbe Ausweichweg wie im Browser-Leser (AP1, `fallbackStore`) — raw.githubusercontent bei 403/Frist/5xx/Netzfehler, **aber eine gepinnte Basis fällt auf raw AM SELBEN COMMIT zurück** (sonst könnten `hmodel`-Manifest und -Chunks aus zwei Ständen kommen); kein Hedge. Belegt im Verifier (7) mit Negativkontrolle 404.
- **Lauf 2 (18:09 UTC, mit Ausweichweg):** s. 9.3.5. Ehrlich dazu: der Edge war vom ersten Lauf warm (t1 24 s statt 124 s), ein 403 war deshalb unwahrscheinlich — Lauf 2 belegt „kein Verlust", nicht „Ausweichweg geheilt"; die Heilung belegt der Verifier.

**So sieht ein PA2-Punkt im Slot aus** (`points[]`, gekürzt):

```json
{"id":"06680","name":"Säntis","lat":47.249447,"lon":9.343469,"elev":2501,"demM":2370,"country":"CH","profile":"CH","wmo":"06680",
 "truth":{"poi":true,"tawes":null,"smn":"SAE"},
 "mosmix":{"id":"06680","name":"SAENTIS","lat":47.25,"lon":9.33,"elev":2502,"distanceKm":1.02,"dzM":-1,"match":"id"}}
```

`truth.byPoint["06680"].smn` trägt `obsAtMs, t, td, rh, ff, dd, fx, rr1, rr1h, p, n` (letzte sechs Stunden `rr1h` 0,2 · 0,1 · 0,2 · 1,2 · 0,7 · 0,2 mm, `rr1` 0 · 0 · 0,6 · 0 · 0 · 0 mm/h); `cube.t1.byPoint` die Zelle 47,25/9,35 (0,5 km), `stations.byPoint` die Station 06680 (1,02 km).

#### 9.3.5 Lauf 2 (18:09 UTC, derselbe Index, mit Ausweichweg)

410 Punkte, **18 379 658 B (17,53 MiB), 0 Fehler, 0 Ausweichwege**, 556 s (cube t1 24 · t2 14 · t3 11 · Stationen 18 · Nowcast 163 · Wahrheit 3 · Live 295 s — der Live-Pfad schwankt zwischen den Läufen um den Faktor 3, der Cube-Teil ist am warmen Edge fünfmal schneller). Abdeckung jetzt auch in DE 410/410 in t1, t2 und Stationen. Slot-Größe gegen Lauf 1 +0,15 % (die 23 Punkte, die in Lauf 1 fehlten). **Was Lauf 2 belegt und was nicht:** kein Verlust bei warmem Edge; dass der Ausweichweg einen 403 heilt, belegt der Verifier (7), nicht dieser Lauf.

**Nebenbefund V-FI-10 (PA1, nicht behoben):** in jedem Wahrheitsdatensatz überschreibt die Bedeckungsspalte `n` (aus `TRUTH_SCALES`) die Zählung `n: obsAtMs.length` — der Slot trägt unter `n` die Bedeckung (bei TAWES/SMN nur Sentinels). Kein Datenverlust (die Zahl ist `obsAtMs.length`), aber ein Name mit zwei Bedeutungen; eine Umbenennung bräche die zwei vorhandenen Slots ⇒ im Bewerter (AP9) als bekannt behandeln.

#### 9.3.6 Gate AP-PA2 und was Jan tun muss

**Gates:** `points.mjs --self-test` 11/11 · `truthSelfTest` 13/13 · **`verify:punktarchiv` 87/87** (war 56) · `verify:point-client` 112/112 unverändert · `typecheck` 0 · lokaler Slot 410 Punkte, 0 Fehler (Lauf 2). GPA2 (≥ 60 AT, ≥ 40 CH mit Netzwahrheit) **grün: 84 / 101**. Nichts committet, nichts gepusht, das Archiv-Repo nicht angefasst (Slots nur im Scratchpad).

**Jan (`MANUELLE-SCHRITTE.md` §15):** `buscosun-web/main` **vor 23:10 UTC** pushen — und zwar AP1 + PA2 + AP12a in einem Push, weil der Sammler `fallbackStore` aus AP1 braucht. Dann trägt der heutige Slot (≈ 23:10–23:30 UTC) die 410 Punkte; **AT/CH-Fälle 0–24 h sind ab dem Slot vom 17.09. bewertbar**, 48 h ab dem 18.09., 336 h ab dem 30.09. (Regel §1.2). Ohne Push bleibt der heutige Slot bei 243 Punkten mit falschen Ländern und ohne Stundensummen, und die 403-Verluste können wieder auftreten.

**Bewusst offen:** Ausdünnung auf die Zielzahl (nicht ohne gemessene Regel; Preis steht in 9.3.4, E-U-13); Bedeckung `n` hat in AT/CH keine Wahrheit (9.3.1 (7)); V-FI-10; SMN-Vortagsstunde im 23:10-Slot (Nachholweg `_t_recent.csv` im Bewerter).

### 9.4 AP12a — Purge jeder geänderten Datei und CDN-Warm-up im Punkt-Publisher (E-F-1, 2026-09-16, ab 18:00 UTC)

#### 9.4.1 Diagnose (Code gelesen, Zahlen gemessen, vor dem Code)

**(1) Was der Publisher heute tut.** Nach der Landeprüfung (`landed`) genau EIN Abruf `purge.jsdelivr.net/…@main/point/index.json`, Status ins Log — **ohne Nachprüfung** (`purgeIndexUntilFresh` benutzt nur der Karten-Publisher), kein Purge eines `run.json`, kein Warm-up. Folge V-FI-1: das gemergte `run.json` stand am CDN bis 12 h ohne die neue Stufe.

**(2) Was die Helfer in `scripts/lib/repackManifest.mjs` können** (LZ1-Muster): `warmCdnFiles` — Chromes `Accept-Encoding` (jsDelivr hält je Kodierung einen Eintrag, V-LZ-10), 8 parallel, Body gelesen, 404 unter `@main` ⇒ Purge + 8 s + ein Versuch; **403 und Fristablauf landen ununterschieden in `failed`, ohne Wiederholung, und es gibt keine Wandzeit-Grenze**. `purgeUrlOf` (cdn → purge). `purgeIndexUntilFresh` — Purge, GET, `commit` vergleichen, 8 s + bis 3 × 20 s; es prüft nur Dateien mit `commit`-Feld. Für E-F-1 fehlten also: 403/Frist als eigene Zählung mit Wiederholung (V-FI-5), ein Budget, ein Trockenlauf, der auch den 404-Purge unterlässt, und eine Frischeprüfung für `run.json` (kein `commit`-Feld ⇒ Byte-Vergleich mit dem Repo).

**(3) Welche Dateien ein Stufen-Job anfasst** (Pfadform `cubeFormat.ts`, Mechanik §26/`prune.mjs`/PD-E):

| Klasse | Pfad | Status im Job | Der Leser holt sie | Purge | Warm-up |
|---|---|---|---|---|---|
| Chunks der Stufe | `point/<lauf>/tX/*.bin` | A (neuer Lauf, oder Stufe in bestehendes Verzeichnis gemergt); M nur beim Neubau desselben Laufs | `@main` | bei M | ja |
| `run.json` des Publikationslaufs | `point/<lauf>/run.json` | A (neuer Lauf) oder **M (zweite Stufe gemergt, §26)** | `@<index.commit>` (§9.1), Rückfall `@main` | bei M | gepinnt; bei M zusätzlich `@main` |
| `run.json` älterer Läufe | `point/<alt>/run.json` | **M (Aufbewahrung strich eine Stufe)** / D (letzte Stufe weg ⇒ Verzeichnis weg) | wie oben | bei M | bei M |
| Index | `point/index.json` | M (jeder Publish) | `@main`, `no-cache` | ja, zuletzt, mit Commit-Prüfung | — (die Prüfung liest ihn) |
| statische Produkte | `point/static/hmodel/v1/{static.json, tX/*.bin}` | M bei jedem ECMWF-Laufwechsel (V-PD-62; gemessen 124 Chunks je t1-Job); `urban` nie | `@main`, 12 h (V-FI-6) | `static.json` bei M; Chunks mit M **nicht** (9.4.3) | `static.json` bei A/M; Chunks nur bei A |
| Stationsprodukt (nur t2-Job) | `point/stations/<lauf>/{stations.json, *.bin}`, `catalog.json` | A; Katalog M, wenn geändert | `@main` | Katalog bei M | ja |
| Register | `point/sources.json`, `point/calib.json` | selten M | `@main`, 24 h | bei M | bei M |
| gelöschte Läufe | alles darunter | D | — (kein Index nennt sie) | **nein** — ein Purge machte aus einer noch gültigen Kopie für einen Leser mit altem Index eine 404 | nein |

**Regel:** M ⇒ purgen; A oder M ⇒ wärmen (in der Form des Lesers); D ⇒ nichts — mit einer am echten Job nachgemessenen Ausnahme für in place geänderte statische Chunks (9.4.3). **Quelle der Liste je Job:** `git diff --cached --name-status --no-renames -- point` direkt nach `git add` (im Nur-Push-Pfad `origin/main HEAD`) — die exakte Menge, keine Liste im Kopf. ⚠ Aus der Vergangenheit nachzählen ging nicht: die Kartenlinie hat die Historie um 17:32 UTC per Force-Push ersetzt, die Punkt-Commits des Tages existieren am Remote nicht mehr (GitHub-API `commits?path=point` ⇒ nur der Wurzel-Commit). Deshalb vorher/nachher an einem echten Job gemessen (9.4.3).

**(4) Reihenfolge, und warum:** (a) geänderte Dateien purgen, `run.json` zuerst; (b) `index.json` purgen und prüfen, dass `@main` den neuen Daten-Commit trägt (bis 2:39 min nach dem Push löst jsDelivr `main` noch auf den alten Commit auf, BW-9 §28.4); (c) jedes geänderte `run.json` gegen die Bytes im Repo prüfen, sonst noch einmal purgen; (d) **`@main` erst wärmen, wenn der Index frisch ist** — ein zu früher Abruf eines neuen Chunks bekäme eine 404, und die hinge am Edge fest (§28.9); gepinnte Formen immer.

**(5) Budget — gemessen, nicht gesetzt.** Job-Dauern aus der GitHub-API (`actions/runs/<id>/jobs`, Läufe 56–71, 15./16.09., 16 Läufe): **t1 9,7–14,2 min** (Bau 8,2–11,4, Publish 0,5–1,9), **t2 7,5–10,7** (Bau 5,5–7,9, Stationen 0,6–0,9, Publish 0,4–1,7), **t3 5,3–5,4** (Bau 3,9–4,2). Gegen `JOB_MAX_MIN_BY_TIER` {20, 15, 10} bleibt mit 1 min Reserve: t1 4,8 min, t2 3,3, t3 3,6 ⇒ **Budget t1 240 s, t2 180 s, t3 180 s**; ohne Angabe 180 s (hält in jedem Job). Der ganze Schritt (Purges, Wartezeiten, Warm-up) läuft gegen dieses Budget; was bis dahin nicht begonnen ist, zählt als `skipped`.

#### 9.4.2 Umgesetzt (nur `scripts/`, kein `src/`-Modul, keine Abhängigkeit)

| Datei | Was |
|---|---|
| `scripts/lib/repackManifest.mjs` | `warmCdnFiles` **additiv**: `retries`, `backoffMs` (×2 je Versuch), `deadlineMs`, `purgeOn404`, `sleepImpl`; Zählung `forbidden`, `timeout` (beide Teil von `failed`, nie `ok`), `retried`, `recovered`, `skipped`; wiederholt werden 403, Frist, 5xx, Netzfehler — ohne die neuen Optionen verhält es sich wie bisher. `purgeUntilFresh({ url, check })` als die Schleife hinter `purgeIndexUntilFresh` (das ist jetzt ein Aufruf davon, Meldungen wortgleich), mit `dryRun` (kein Purge, nur Lesen) |
| `scripts/point/cdnSync.mjs` **neu** | `parseNameStatus`, `classifyPointPath`, `planCdnSync` (Regel aus 9.4.1), `missingManifestPurges` und `cdnContractViolations` (für die Negativkontrollen), `syncCdn` (Ausführung mit Budget, Bericht), `CDN_BUDGET_S_BY_TIER`, `JOB_MEASURED_MAX_MIN`; CLI-Trockenlauf gegen einen veröffentlichten Lauf (GET only) |
| `scripts/point/publish-point.mjs` | `touched` aus `git diff --cached --name-status` (Nur-Push-Pfad: `origin/main HEAD`); nach `landed`: `syncCdn` im Budget `POINT_CDN_BUDGET_S`; **Schalter** `POINT_CDN_SYNC=0` (= der alte Einzel-Purge), `POINT_CDN_DRY=1` (kein Purge), `POINT_CDN_BASE` (lokaler Nachbau); nie fatal, Exit-Code unverändert |
| `scripts/repack-repo/workflow-point.yml` | `POINT_CDN_BUDGET_S` je Publish-Schritt (240/180/180) + Herleitung — Kopie = Jans Gate (`MANUELLE-SCHRITTE.md` §15) |
| `scripts/verify-point-data.mjs` | **969/969** (war 947): **Regel F** je Job (gemessenes Maximum + Budget + 1 ≤ `JOB_MAX_MIN`, Vorlage = Modul; Negativkontrolle 400 s in t1); **AP12a** — Vertrag des Publishers (+ Negativkontrollen: ohne `syncCdn`, `syncCdn` vor Push/Landeprüfung), `parseNameStatus`, Plan an der echten Pfadform eines t2-Jobs (Merge, Beschnitt, Löschung, `hmodel` in place, Stationsprodukt), jede geänderte `run.json` im Purge (Negativkontrolle: Plan ohne Purges verfehlt genau zwei), Warm-up **403 = Fehlschlag**, 403 → 200 geheilt, Frist = `timeout`, Trockenlauf ohne 404-Purge, Budget erschöpft ⇒ `skipped`, `syncCdn` gegen ein nachgebautes CDN: Trockenlauf **null** Abrufe an `purge.jsdelivr.net`, echter Lauf purgt genau die M-Dateien, nicht frischer Index ⇒ kein `@main`-Warm-up |

`verify:repack` **348/348** unverändert (die Kartenlinie benutzt dieselben Helfer). typecheck 0. **Kein Purge von dieser Maschine gegen das echte CDN** — der Trockenlauf (9.4.3) schickt nur GETs; das ist im Verifier und im CLI geprüft.

**Ende-zu-Ende-Nachbau des echten Publishers (18:40 UTC)** — weil dieser Code nach Jans Push im nächsten Cron-Job läuft und der Verifier nur Module prüft: `publish-point.mjs` unverändert gestartet gegen einen lokalen Bare-Origin (Anfangsstand: echter t3-Lauf `2026091512` mit 12 Chunks) und ein lokales Nachbau-CDN (`POINT_CDN_BASE=http://127.0.0.1:8787/gh/…`, liefert den Arbeitsbaum, protokolliert jeden Abruf), Bauausgabe = echter t3-Lauf `2026091600` (12 Chunks) + ein geändertes `2026091512/run.json` (wie ein Merge), `POINT_PUSH=1`, `POINT_CDN_DRY=1`, Budget 60 s. Ergebnis: Datencommit → Push → Manifest-Commit → „steht auf origin/main" → **CDN: 16 neu · 1 geändert · 0 gelöscht ⇒ 1 Purge (trocken), 17 zu wärmen** · Index frisch im ersten Versuch (8 s Wartezeit) · `run.json` Byte-gleich · **Warm-up 17/17** · **0 Abrufe mit `purge`**, alle 17 Warm-up-Abrufe mit `gzip, deflate, br, zstd`, `run.json` gepinnt an den Daten-Commit · Exit 0 · 11,2 s gesamt.

**Ein Fehler, den erst der Nachbau zeigte:** der erste Versuch hing — mein Harnisch blockierte mit `spawnSync` sein eigenes Nachbau-CDN, und der Publisher wartete **ohne Ende**, weil weder `purgeIndexUntilFresh` noch die Purge-Schleife eine Frist je Abruf hatten. Am echten CDN hieße ein hängender Abruf: der Publish-Schritt hält bis zum Job-Timeout (45/60/40 min) und schiebt den Job in das Fenster der Kartenlinie. Kur: `purgeUntilFresh({ timeoutMs })` (opt-in, die Kartenlinie bleibt ohne Frist wie bisher), 15 s je Purge-/Prüfabruf im Punkt-Publisher, der 404-Purge im Warm-up mit Frist, Budgetprüfung vor jedem Schritt, und eine **harte Obergrenze** (Budget + 15 s) um den ganzen Schritt. Verifier: hängt jeder Abruf, endet `syncCdn` an der Obergrenze, und jeder Purge-/Prüfabruf trägt ein `signal` ⇒ **968/968**.

#### 9.4.3 Gemessen (a): was ein echter Job anfasst, und was das Warm-up kostet

**Der t1-Job von 19:40 UTC** (Lauf `2026091618`, Index 19:52:39 UTC, Daten-Commit `b3e6fec`), zweifach gemessen: GitHub-API-Dateiliste des Commits (vor dem nächsten Force-Push der Kartenlinie gelesen) und Schnappschuss aller veränderlichen Manifeste über `raw.githubusercontent` um 18:15 und 19:58 UTC (`scratchpad/snapshot.mjs`, `snapdiff.mjs`) — beide stimmen überein:

| Status | Dateien | Was |
|---|---|---|
| A | 209 | `point/2026091618/run.json` + 208 t1-Chunks (Git meldet das `run.json` als Umbenennung von `2026091609/run.json` — mit `--no-renames` korrekt D + A) |
| M | 126 | `point/index.json`, `point/static/hmodel/v1/static.json` und **124 `hmodel`-t1-Chunks** (abgeleitete ECMWF-Höhe, V-PD-62) |
| D | 266 | Läufe `2026091609` (t1, 208 Chunks) und `2026091518` (t2, 56 Chunks) samt `run.json` — Aufbewahrung |

In diesem Job war **kein** `run.json` geändert (beide Altläufe fielen ganz). M-Manifeste entstehen, wenn ein Job in ein bestehendes Laufverzeichnis merged (t2 in das t1-Verzeichnis, heute `2026091612[t1+t2]`) oder die Aufbewahrung aus einem Mehrstufen-Verzeichnis eine Stufe streicht — nach der Regel `RETENTION_HOURS_BY_TIER.t1 = 9` im 22:40-Job zu erwarten (t1 in `2026091612` ist dann 10,9 h alt).

**Nachgemessene Entscheidung:** die 124 in place geänderten `hmodel`-Chunks hätte die Regel aus 9.4.1 alle gepurgt — achtmal am Tag, für Höhen, die sich um 1–2 m verschieben. Wärmen ohne Purge liefert die alte Kopie. Deshalb: **statische Chunks mit M werden weder gepurgt noch gewärmt** (gezählt als `staticChunksLeft`), `static.json` schon (eine neue Spaltenliste muss ankommen; eine Umordnung bei gleicher Zahl bliebe still, wie in V-FI-6 schon benannt); neue statische Chunks (A) werden gewärmt. Plan für genau diesen Job, mit der echten Dateiliste nachgerechnet: **1 Purge (`static.json`) + Index mit Frischeprüfung, 210 Dateien wärmen** (208 Chunks, `run.json` gepinnt, `static.json`), 124 statische Chunks ausgelassen, 266 gelöschte nicht angefasst. Verifier-Fixture nachgezogen ⇒ **969/969**.

**Trockenlauf gegen genau diesen Lauf** (`node … scripts/point/cdnSync.mjs --tier=t1 --json`, von dieser Maschine, 19:58:01–19:58:31 UTC = 5 min 22 s nach dem Index; GET only, kein Purge):

| Größe | Wert |
|---|---|
| Dateien | 210 (208 Chunks + `run.json` gepinnt + `run.json` `@main` — das CLI behandelt `run.json` als M) |
| Ergebnis | **210/210 ok · 0 HIT / 210 MISS** (niemand hatte den Lauf in 5 min abgerufen — ohne Warm-up trifft JEDER erste Nutzer einen kalten Edge) · **403: 0 · Frist: 0 · 404: 0 · wiederholt: 0** |
| Volumen / Dauer | **86,0 MiB in 27,9 s** (8 parallel ⇒ Ø 1,06 s je Datei inkl. 410 KB Übertragung); Schritt gesamt 28,8 s |
| Frische | Index `@main` im ersten Versuch auf `b3e6fec` (der alte Publisher hatte gepurgt), `run.json` `@main` byte-gleich zum Repo |
| Budget | t1 240 s ⇒ **8,3-fache Reserve**; Job gemessen max. 14,2 min + 0,5 min ⇒ 14,7 ≤ 19 (Regel F) |

Ehrlich dazu: (1) ein Lauf ohne 403 ist kein Beleg gegen V-FI-5 — die Wiederholung ist im Verifier belegt, nicht hier. (2) Diese GETs haben den Origin und den Europa-Edge dieser Maschine für Lauf `2026091618` gewärmt — für die Abnahme (b) taugt dieser Lauf deshalb nicht. (3) Kosten: ≈ 86 MiB je t1-Job, achtmal am Tag ≈ 690 MiB/Tag Abruf von jsDelivr (die Kartenlinie wärmt ≈ 26 MB je Publish); kein Byte über Netlify.

#### 9.4.4 Abnahme (b) — offen, braucht Jans Push

Nicht in dieser Sitzung möglich: der Publisher läuft im Cron erst mit dem gepushten `main`. Sobald ein Punkt-Job mit dem neuen Publisher gelaufen ist (im Publish-Log: `CDN-Warm-up: …/… ok … · 403 … · Frist …`) und **ohne diesen Lauf vorher von hier abzurufen**:

```
npm run verify:pv-latency -- --only=bundle --profiles=desktop-none
```

Vergleich gegen `latency/2026-09-16T14-33-41-921Z.json` (kalt-neu Kern p50 **1 458 ms**, 37 MISS über 10 Orte). ⚠ Lesehinweis vorab: der Runner steht in den USA — er wärmt den **Origin** und seinen Edge. Von Europa aus kann `x-cache` weiter `MISS` melden (Edge kalt), während der TTFB auf das Origin-warm-Niveau fällt (LZ1 M1: 0,17 s p50 statt 0,60 s). Verglichen wird deshalb **TTFB je Chunk und Kern-p50**, die HIT/MISS-Zählung nur als zweite Zahl. Gate: kalt-neu Kern p50 < 1 458 ms und kein 403-Fall über der harten Frist.

#### 9.4.5 Gate AP12a und was Jan tun muss

**Gates:** `verify:point-data` **969/969** (war 947) · `verify:repack` **348/348** · `verify:punktarchiv` 87/87 · `verify:point-client` 112/112 · `typecheck` 0 · Ende-zu-Ende-Nachbau des Publishers Exit 0 · Trockenlauf gegen den echten Lauf 210/210. Budget/Bundle unberührt (kein Byte in `src/`, `public/`, Vite-Konfiguration). Kein Purge gegen das echte CDN, keine Workflow-Kopie, nichts committet.

**Jan (`MANUELLE-SCHRITTE.md` §15):** (1) Push von `buscosun-web/main` — aktiviert den neuen Publisher im nächsten Punkt-Job mit Standard-Budget 180 s; (2) optional die Vorlage ins Daten-Repo kopieren (+11 Zeilen, t1 bekommt 240 s); (3) nach dem ersten Job mit neuem Publisher die Abnahme (b).

**Bewusst offen:** in place geänderte `hmodel`-Chunks bleiben am CDN bis 12 h alt (Entscheidung oben); gelöschte Läufe werden nicht gepurgt; Warm-up des Radar-Spiegels (V-FI-7, S&F Radar-Linie); ob jsDelivr einen Purge je geänderter Datei auf Dauer ohne Drosselung annimmt, ist ungemessen (heute ≤ 3 je Job nach der hmodel-Entscheidung — im Publish-Log sichtbar).



