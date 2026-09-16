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

**Was noch nicht behoben ist:** die `@main`-Kopie bleibt am CDN veraltet (Publisher-Purge = E-F-1, AP12a); wer den Leser ohne Index-Commit oder mit fremder Basis benutzt, bekommt weiter `@main`, jetzt aber mit Grund. Der Sammler-Lauf um 23:10 UTC ist erst geschützt, wenn `buscosun-web/main` diesen Stand trägt (der Workflow klont `main`).

