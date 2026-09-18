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




### 9.5 AP2 — Cube-Adapter und Flag `pointSource: 'cube'` (2026-09-16, ab 21:00 UTC)

**Auftrag (§4, AP2):** das Bündel aus AP1 auf den Sample-Vertrag von buscosun Fusion abbilden — auf der **Cube-Achse** (109 native Schritte), Familien t1 → `highres`, t2/t3 → `global`, Station → `mosmix`, Radar → `nowcast`; `PointSourceSample` **additiv** um `sigmaDiv, sigmaEns, q10, q90, srcCount, ensCount, hModEff, profile` erweitern; `pointSource: 'live' | 'cube'` in `PointForecastOptions` und im Cache-Schlüssel; Live-Pfad ohne Flag byte-gleich. Abnahme: Zehn-Orte-Vergleich Cube ↔ Live (T 0,5 K · Wind 1 m/s · RR 0,2 mm/h · clct 10 %; Größeres = Befund), Laufzeit Ende-zu-Ende ≤ 2 s p50 Desktop-warm.

#### 9.5.1 Diagnose — was das Bündel an den zehn Orten trägt (Node, 16.09. 21:12 UTC, `npm run point:read`-Weg, Radar an)

Läufe im Index: t1 `2026091618` (49 Schritte), t2 `2026091612` (24), t3 `2026091600` (36), Stationen `2026091615` (247 Schritte, 12 Größen); alle Manifeste **gepinnt** gelesen (V-FI-1 wirkt). Index `usableToH` **318** ab dem t1-Lauf (die t3-Naht ist beweglich, V-PD-55).

| Ort | h_true (z11) | hModEff t1/t2/t3 | Δh = hModEff − h_true (t1) | srcCount t1 · t3(126 h → 231 h) | Profil t1 (Inversionsstunden von 49) | q10/q90 t1 | unter Grund | Station | Radar |
|---|---|---|---|---|---|---|---|---|---|
| Hamburg | 12 | 15/16/12 | +3 | 4 · 4→2 | ja (15) | **nein** | — | Innenstadt 0,9 km, −4 m ✓ | RV (3 Frames, alle `validAtSuspect`) |
| Berlin | 44 | 45/42/48 | +1 | 4 · 4→2 | ja (20) | **nein** | — | Alex. 1,0 km, −7 m ✓ | RV |
| München | 525 | 510/568/487 | −15 | 6 · 4→2 | ja (14) | ja | — | Stadt 5,0 km, −10 m ✓ | RV + INCA + CombiPrecip (RV 0,16/0,47/0,16 gegen INCA 1,41/0,55/0,24 mm/h) |
| Wien | 172 | 235/208/278 | **+63** | 6 · 4→2 | ja (14) | ja | — | City 1,0 km, −1 m ✓ | INCA (10,1 → 1,3 → 0,3 mm/h) |
| Graz | 350 | 408/466/436 | +58 | 6 · 4→2 | ja (22) | ja | — | Universität 1,3 km, +17 m ✓ | INCA |
| Innsbruck | 576 | 1093/1222/1469 | **+517** | 6 · 4→2 | ja (0) | ja | 925 | Flughafen 4,1 km, +5 m ✓ | RV + INCA + CombiPrecip |
| Zürich | 406 | 483/486/483 | +77 | 6 · 4→2 | ja (18) | ja | — | **abgelehnt** (06660 +150 m) | RV + INCA + CombiPrecip |
| Genf | 379 | 473/536/525 | +94 | 6 · 4→2 | ja (20) | ja | — | Genf 5,2 km, +42 m ✓ | CombiPrecip (nur Analyse) |
| Zermatt | 1608 | 2537/2757/2854 | **+929** | 6 · 4→2 | ja (5) | ja | 925, 850 | Zermatt 1,0 km, +30 m ✓ | CombiPrecip |
| Zugspitze | 2906 | 1690/1730/1277 | **−1216** | 6 · 4→2 | ja (0) | ja | 925, 850 (t3: 925) | Zugspitze 0,5 km, +54 m ✓ | RV + INCA + CombiPrecip |

Was daran für den Adapter zählt:

1. **Die Zeitachse ist nicht stündlich und nicht durchgehend.** 49 + 24 + 36 = 109 native Schritte; in Gültigzeit überlappen t1 (18z + 48 h = 17.09. 18 UTC) und t2 (12z + 51…120 h = 17.09. 15 UTC …), t2 und t3 (12z + 120 h = 21.09. 12 UTC gegen 00z + 126 h = 21.09. 06 UTC). Wo zwei Stufen dieselbe Gültigzeit tragen, nimmt der Adapter die **feinere** und markiert den Wechsel (`seam`, R7: sichtbar, nie geglättet). Die Achsenlücken 49–50 h und 121–125 h fallen in Gültigzeit heute in die Überlappung — sie werden nicht als leere Stunden ausgegeben, sondern die Achse nennt, was sie trägt (AP7 füllt mit der Station oder interpoliert markiert).
2. **Profilfelder nur in t1** (R6): t2/t3 bekommen in AP4 den Rückfall `standardLapse` mit Flag. In t1 ist der Inversionsanteil heute 0–22 von 49 Stunden (Innsbruck und Zugspitze 0 — dort liegt die Zelle so weit über bzw. unter dem Punkt, dass PAP 4 den Fall C bzw. A trifft).
3. **σ_div überall, σ_ens nur auf dem groben Raster** (t1 6-stündlich, t2 12-stündlich, t3 24-stündlich — `ensCount` in der Stundenmitte `null`), **Quantile nur südlich 51,5 °N** in t1 (C-LAEF-EPS endet dort; Hamburg und Berlin ohne). Der Adapter trägt sie durch; AP6 entscheidet je Größe und Stunde den PAP-6-Zweig.
4. **Die Modellhöhe ist an fünf von zehn Orten um mehr als 50 m falsch**, an drei um mehr als 500 m. Bis AP4 gilt die lineare Standard-Lapse des bestehenden Motors (`sourceElevation = hModEff`, 6,5 K/km) — das ist genau die Basislinie B1 aus §5.2. Zermatt: Zelle 929 m über dem Punkt ⇒ der Punkt ist wärmer; Zugspitze: Zelle 1 216 m darunter ⇒ kälter.
5. **Der Radar-Nowcast ist an fünf Orten `validAtSuspect`** (RV: der Spiegel schreibt die Laufzeit in jeden Frame, V-PD-56) — der Leser rechnet Slot + `lead`; der Adapter trägt das Flag weiter (AP7). In München und Innsbruck widersprechen sich RV und INCA um den Faktor 2–9 auf dem ersten Frame — zwei Beobachtungen desselben Punkts, die der Motor als korrelierte `nowcast`-Member (0,80) mit ihrer Distanz-Repräsentativität mischt, nicht als zwei Meinungen.
6. **V-FI-5 traf auch diesen Lauf**: RV-`meta.json` dreimal (Hamburg), einmal (Berlin), INCA-`meta.json` einmal (München) erst über den `raw`-Ausweichweg nach dem 2,5-s-Hedge — Hamburg brauchte deshalb 7,5 s statt 0,3–0,7 s. Der Nowcast liegt nicht im Kern (§9.2, Begriff 1), der Algorithmus wartet nicht auf ihn.

#### 9.5.2 Was der bestehende Motor schon kann, und was der Adapter deshalb NICHT baut

`fuseHour(samples, leadH, ctx)` nimmt je Stunde eine Liste `PointSourceSample` und rechnet Geometrie (Lapse über `sourceElevation`, Wind-Shelter über `windTerrainFactor`), Fehler (σ_skill aus der ACC-Kurve je **Familie**, σ_rep aus der Geländestreuung je **Footprint** des `source`-Tags), Kombination mit Fehlerkorrelation (`combine.ts`), Schrumpfung gegen die Klimatologie (`ClimaField`, stündlich über `hourlyClimaTemp`), Familien (`dist.ts`), Regime-Aufweitung (`meteo.ts`, Kaltluftsee/Föhn/Phase). Nichts davon wird neu geschrieben. Der Adapter liefert **Samples, Kontext und Achse**:

| Cube-Ebene | Sample-Feld | Bemerkung |
|---|---|---|
| `t2m` | `temperature`, `sourceElevation = hModEff` | Motor korrigiert linear auf `ctx.elevationM` (= h_true aus dem Gelände); AP4 ersetzt das durch PAP 4 |
| `td2m` | `dewPoint` | Motor fusioniert den Taupunkt, RH ist abgeleitet; Taupunkt-Lapse 1,8 K/km (Prior des Motors) |
| `u10`/`v10`/`gust` | `u`/`v`/`gust` | Rice-Familie, Shelter/Speed-up aus TPI |
| `precip` | `precipitation` | Hurdle (K-2); `0` = zensiert |
| `clct` | **`cloudTotal` (neu, additiv)** | der Motor summierte bisher die drei Schichten; `clct := max(...)`-Konsistenz kommt in AP6 |
| `clcl/clcm/clch` | `cloudLow/Mid/High` | für die strahlungswirksame Bewölkung des Regimes |
| `snowlmt` | `snowLine` | der Motor fusioniert sie nicht; wird als Zellwert durchgereicht |
| `ps` | `pressure` (neu, additiv) | keine Familie im Motor; hydrostatisch auf h_true in AP4 |
| `<v>_sd`, `<v>_sd_ens`, `<v>_q10/_q90`, `srcCount`, `ensCount`, `hModEff`, Profil | `sigmaDiv`, `sigmaEns`, `q10`, `q90`, `srcCount`, `ensCount`, `hModEff`, `profile` (alle neu, additiv) | in AP2 nur getragen; AP4 liest `profile`/`hModEff`, AP6 die Streuungen |

Familien und Footprints: `cube-t1` → `highres` (ACC-Kurve von ICON-D2/AROME, Horizont 60 h), `cube-t2`/`cube-t3` → `global` (Horizont 384 h), Station → `mosmix` (Tag `mosmix`, Footprint 0 — dieselbe Behandlung wie BrightSky-MOSMIX auf dem Live-Pfad, damit der Vergleich denselben Prior sieht), Radar → `nowcast` (Tags `radolan`/`inca`/`rzc`, wie die Live-Sampler). Neu in `FOOTPRINT_M` (additiv): `cube-t1` 5 000, `cube-t2` 10 000, `cube-t3` 25 000 m — die Zellweite der Stufe, **`set`** (der Live-Pfad emittiert diese Tags nie).

**Der Vorlauf für die ACC-Kurve ist die Stunde ab JETZT**, nicht ab dem Quell-Lauf — dieselbe Regel wie auf dem Live-Pfad (dort ist `leadH` der Stundenindex ab jetzt, obwohl jede Quelle aus einem älteren Lauf stammt). Für t3 (Lauf 00z, beim Abruf 21 h alt) überschätzt das ρ leicht; das Laufalter steht in der Provenienz (`ageH`), und AP9 misst, ob die Kurve nach dem Modell-Vorlauf gehört (**V-FI-10**, offen).

**Was der Adapter NICHT tut (bewusst, je AP):** keine Mikroklima-Verschiebung des Mittels (`ctx.terrainDeltaC = 0` — PAP 5 mit A = null ist inaktiv, AP5; der Live-Pfad addiert bis zu −3,5 K Kaltluftsee — das wird im Zehn-Orte-Vergleich als Befund sichtbar, nicht versteckt), keine PAP-4-Fälle (AP4), keine Nachbargewichtung (AP3, `cellOf` = nächste Zelle), kein σ aus dem Cube (AP6), kein Anker, keine Interpolation, kein Klimatologie-Schwanz (AP7), keine v2-Ausgabe (AP8).

#### 9.5.3 Was sich ändert (Dateien)

| Datei | Änderung |
|---|---|
| `src/pointForecast/types.ts` | `PointSourceSample` additiv: `cloudTotal`, `pressure`, `sigmaDiv`, `sigmaEns`, `q10`, `q90`, `srcCount`, `ensCount`, `hModEff`, `profile`; `PointForecast` additiv: `cube?` (Achse, Provenienz, Flags, Zeiten) |
| `src/pointForecast/pointForecast.ts` | `PointForecastOptions.pointSource?: 'live' \| 'cube'`; `pfCacheKey` bekommt `:c`; **Registrierung statt Import**: `registerPointSource('cube', fn)` — ein statisches `await import('./cubeSource')` in dieser Datei ließe Rollup einen Chunk mit allen Punkt-Modulen bauen (Textsonde rot, totalJs wächst), deshalb registriert sich der Cube-Pfad, wenn ein Verbraucher `cubeSource.ts` lädt; ohne Registrierung wirft `pointSource: 'cube'` einen benannten Fehler statt still auf `live` zu fallen |
| `src/pointForecast/fusion/fuse.ts` | additiv: `cloudTotal` im Bewölkungs-Extraktor (`s.cloudTotal ?? Summe der Schichten`) — ohne das Feld byte-gleich |
| `src/pointForecast/fusion/priors.ts` | additiv: `FOOTPRINT_M['cube-t1'\|'cube-t2'\|'cube-t3']` |
| `src/pointForecast/fusion/attach.ts` | `getClimaField` exportiert (dieselbe Klimatologie, derselbe Cache) |
| `src/point/client/terrain.ts` | `TerrainPointResult.scales` (die sechs Ringradien des Motors, `terrainScales` aus `terrainScale.ts` auf derselben Höhenfunktion) + `sinkDepthM`; Ergebnis-Cache-Schlüssel `terrain/v2` |
| `src/pointForecast/cubeSource.ts` **neu** | `fuseCubePoint(input, opts)` — **pur**: (Bündeldaten, Klimatologie, Kalibrierung, nowMs, Optionen) → Schritte mit `FusedPoint`, Flags, Members; `cubeInputFromBundle`; `getPointForecastFromCube(opts, io)` — Lesen (AP1-Leser) + `fuseCubePoint` + Abbildung auf `PointForecast`; `registerCubePointSource()` |
| `scripts/verify-pv-cube.mjs` **neu** | netzfrei, echte Datenformen: Rundweg Fixture → `fuseCubePoint` → Werte; Live-Pfad-Gleichheit ohne Flag; Achse/Naht/Familien; wächst je AP |
| `scripts/pv-latency/lab.ts`, `scripts/verify-pv-latency.mjs` | Szenario `cube-cold`/`cube-warm` (`getPointForecast({ pointSource: 'cube' })` im Browser), `cube-vs-live` für den Zehn-Orte-Vergleich; `--gate` prüft §6 |

#### 9.5.4 Ergebnis AP2 (16.09., 21:30–21:50 UTC)

**Gebaut wie in 9.5.3.** Dazu `scripts/lib/pvCubeFixtures.mjs` (Fixture in echter Form: drei Stufen mit den Läufen 18z/12z/00z, Stationsprodukt 15z, Index über `buildPointIndex` — Signatur je Zelle, Schritt und Ebene) und `npm run verify:pv-cube` (**36/36** in der AP2-Fassung, netzfrei; die späteren Blöcke wachsen an). Beim Zählen der Achse hat die Fixture einen Rechenfehler der Diagnose korrigiert: 12z + 51 h ist der **18.09. 15:00**, nicht der 17.09. — die Überlappung t1/t2 beträgt heute 3 h (zwei t2-Schritte), t2/t3 6 h (zwei t3-Schritte) ⇒ **102** native Schritte im Fenster ab 21:00 (t1 46 · t2 22 · t3 34), zwei Nähte (18.09. 21:00 t1→t2, 21.09. 18:00 t2→t3), keine Gültigzeit doppelt.

**Gates:** `typecheck` 0 · `verify:pv-fusion` **222/222** (Live-Pfad byte-gleich — dazu im neuen Verifier: `fuseHour` ohne die additiven Felder ≡ mit `cloudTotal` = Schichtsumme, Negativkontrolle mit anderem `cloudTotal` weicht ab; die übrigen additiven Felder ändern nichts; `pfCacheKey` ohne Flag unverändert) · `verify:point-client` **112/112** · `verify:pv-cube` 36/36 · Rechnung allein **34 ms** für 102 Schritte (Node, < 100 ms).

**Laufzeit (Browser-Lab, `latency/2026-09-16T21-30-22-612Z.json`, desktop-none, 10 Orte, kalt-neu = frischer Kontext, CDN so wie es war; Stand des Bündels: AP2 ohne PAP 4):**

| Szenario | total p50 (p95) | Lesephase p50 | Algorithmus p50 (max) | Draht | Gate §6 |
|---|---|---|---|---|---|
| `cube-cold` (Ende-zu-Ende, 336 h, mit Radar) | **1 154 ms** (1 596) | 1 111 ms | 30 ms (36,5) | 1,2–2,3 MB, 25–38 Abrufe, 0 Ausweichwege | **GRÜN** (p50 < 2 s, p95 < 5 s) |
| `cube-warm` (Ergebnis-Cache geleert, IndexedDB warm) | **153 ms** (171) | 138 ms | 12 ms | 0–1 KB (nur `index.json`) | — |

Die Rechnung kostet 3 % der kalten und 8 % der warmen Antwort; der Rest ist AP1. Mobil-4G: s. 9.6.4 (mit AP4 im Bündel gemessen).

**Zehn-Orte-Vergleich Cube ↔ Live** (`cmp-cube`/`cmp-live` im selben Kontext, Live mit `distribution: true`, Radar, 336 h; Δ = Cube − Live an 10 Vorläufen 0…96 h — jenseits 96 h endet der Live-Pfad bei MOSMIX allein und der Vergleich sagt nichts Neues). Anteil der (Ort, Vorlauf)-Paare innerhalb der Toleranz:

| Größe | Toleranz | innerhalb | Wo es reißt |
|---|---|---|---|
| T | 0,5 K | **57 / 100** | Hamburg 10/10, Berlin 10/10, München 9/10 — **Zugspitze 0/10, Zermatt 2/10, Graz 3/10, Genf 4/10** |
| Wind | 1 m/s | **51 / 100** | Berlin 10/10, Hamburg/Wien 9/10 — Zermatt/Zugspitze 0/10, Zürich 2/10, Innsbruck 3/10; **der Cube ist fast überall windiger** (+0,3 bis +5 m/s) |
| Niederschlag | 0,2 mm/h | **90 / 100** | die Fehler liegen bei 0–6 h (Radar) und an der Zugspitze |
| clct | 10 % | **63 / 100** | Alpen und Genfersee 3–5/10; Flachland 8–9/10 |

Was die Tabelle sagt — Befund für Befund, nicht versteckt:

1. **Im Flachland stimmen die Pfade** (Hamburg/Berlin/München: T innerhalb 0,45 K an 29 von 30 Paaren; die Ausnahme ist München +0 h mit +1,04 K, wo der Live-Pfad die Stationsmessung 5 km entfernt als Wert nimmt und der Cube ICON-Mittel + MOSMIX fusioniert).
2. **V-FI-11 — der Live-Pfad meldet an der Zugspitze bei +0 h 12,67 °C** (Cube 2,11 °C, drei Stunden später beide bei 0,6/2,8 °C). Das ist der Stationsblend des Altpfads (`dwd_obs`, sechs Stationen mit Regressions-Lapse), nicht der Cube — ein Befund der Live-Linie, hier nur benannt.
3. **V-FI-12 — Wind:** der Cube-Pfad meldet den **Median der Rice-Verteilung**, der Live-Pfad den Betrag des geblendeten Vektors. Bei kleinem Mittelvektor und großer Komponentenstreuung (Repräsentativität im Gebirge: Zugspitze +3…+5 m/s, Zermatt +2,4…+4) liegt der Rice-Median weit über |μ| — dieselbe Plus-Verzerrung, die V-A₁ an der Fusion gemessen hat (§11 (3) in `implementierung-pv3.md`). In AP6 kommt σ des Cube-Members aus σ_div/σ_ens statt aus dem Streuungs-Prior des Motors; dann neu messen.
4. **V-FI-13 — im Gebirge trägt in t1 nur die Station:** Zermatt, Innsbruck, Zugspitze haben in den ersten 48 h `contributors = mosmix` — der Cube-Member hat dort **< 5 % Gewicht**. Ursache: die Repräsentativität des Motors für eine 5-km-Zelle mit 500–800 m Höhenstreuung plus `0,0035 K/m · |Δh|` (Δh 517–1 216 m) ergibt σ_rep ≈ 3–5 K gegen die Station 0,5–4 km daneben. Das ist konsistent, hat aber eine Folge für AP4/AP6: **die PAP-4-Korrektur wird an genau den Orten, für die sie gebaut ist, im fusionierten Wert unsichtbar, solange eine Station ≤ 15 km/100 m existiert** — und sie existiert an 9 von 10 Orten. AP6 muss σ des Cube-Members aus PAP 6 (σ_div/σ_ens/σ_sys + Restfehler der Korrektur) setzen, nicht aus dem Geländestreuungs-Prior; erst dann entscheidet der Backtest (AP9), wer im Tal recht hat.
5. **V-FI-14 — Niederschlag 0–6 h:** München +0 h Cube 0,06 gegen Live 0,77 mm/h, Zugspitze 1,18 gegen 1,86. Der Cube-Pfad hat drei Radarquellen als `nowcast`-Member (RV 0,16 · INCA 1,41 · CombiPrecip 0,00 in München, Slot 20:45/20:15), der Live-Pfad RV allein aus einem jüngeren Slot. Drei sich widersprechende Beobachtungen plus zwei trockene Modelle ⇒ das Auftreten bleibt unsicher, das Hurdle-Mittel klein. AP7 gehört das Nowcast-Member (Quellenwahl, Alter, `validAtSuspect`, Sättigung).
6. **Graz +3 h: −4,3 K** (Cube 14,1 gegen Live 18,4 °C um 00 UTC; bei +0 h Cube 15,7 gegen TAWES 17,4) und **Genf/Wien/Zürich bei 48/51 h −1…−2 K** (cube-t2 gegen AROME+MOSMIX): wer recht hat, sagt erst der Backtest. Ohne Wahrheit ist das eine Abweichung, kein Fehler.
7. `belowGround925` trägt an Innsbruck, Zermatt und Zugspitze auf 88 von 102 Schritten (t1/t2 alle, t3 für 925) — die Druckflächen-Information dort ist Extrapolation (PD-E §4.3).

**AP2-Abnahme:** fachlich ✓ (Vergleich liegt vor, Abweichungen benannt) · Laufzeit ✓ (Desktop-Gate grün) · Live-Pfad byte-gleich ✓ · Budget/Bundle: s. 9.6.4 (einmal nach AP4 gebaut). Offen aus AP2: V-FI-10…14; UV fehlt auf dem Cube-Pfad (bleibt Live-Abruf, §1.1 — AP7/AP8 tragen ihn nicht, ein Verbraucher holt ihn wie heute).

### 9.6 AP4 — PAP 4, die vertikale Korrektur (2026-09-16, ab 21:35 UTC)

**Auftrag (§4, AP4):** `fusion/vertical.ts` mit den Fällen A/B/C aus `gammaEff/zBase/zInv/dTInv` (nur t1), φ linear (`set`), Δh-Protokoll, Flag `extrapolatedBelowModel`, Taupunkt-Lapse; Rückfall Standard-Lapse mit Flag `stdLapseFallback` ohne Profil (t2/t3); `hModEff` aus dem Cube (E-E-5: keine abgeleiteten Höhen je Quelle) und `terrain.elevationM` als h_true. Abnahme: Vorzeichen Zermatt (Zelle über dem Punkt ⇒ wärmer) und Zugspitze (Zelle darunter ⇒ kälter), Nacht/Tag-Anteil des Inversionsfalls am lebenden Cube, Negativkontrolle ohne Profil = lineare Lapse, ≤ 5 ms je Punkt.

#### 9.6.1 Diagnose am lebenden Cube (Node, 16.09. 21:42 UTC, t1-Lauf 18z, alle 49 Schritte an den zehn Orten = 490 Zellstunden)

| Größe | Gemessen |
|---|---|
| Inversion in der Zelle (`zInv > zBase`, `dTInv > 0`) | **128 von 490** Zellstunden — **nachts 93 von 240 (39 %), tags 35 von 250 (14 %)**: der Nacht/Tag-Anteil kommt aus dem Profil, nirgends aus dem Code |
| PAP-4-Fall an diesen 128 | **Fall B: 0 · Fall C: 128.** Fall B verlangt h_true ≥ z_base; an allen zehn Orten liegt der Punkt unter der Basis — die Basis sitzt im Median **10 m über der Modelloberfläche** (p10 −33 m, p90 +182 m, max +815 m), und der Punkt liegt an 8 von 10 Orten unter der Zelle (Δh = h_true − hModEff: Hamburg −3, Berlin −1, München +15, Wien −63, Graz −58, Innsbruck −517, Zürich −77, Genf −94, Zermatt −929, Zugspitze +1 216 m) |
| davon aufsitzend (`zBase ≤ hModEff + 50 m`) / abgehoben | 85 / 43 — nur die 85 aufsitzenden extrapolieren (Flag) |
| Γ_eff in Fall A (K/km) | p10 4,8 · p50 6,5 · p90 10,1 — die Standard-Lapse ist der Median des Profils, die Ränder liegen ±40 % daneben |
| Korrektur ΔT (K), Spanne über 49 Schritte | Hamburg 0…0,04 · Berlin 0…0,01 · München −0,16…+0,33 · Wien −1,04…+0,65 · Graz **−2,25**…+0,55 · Innsbruck +0,82…**+5,26** · Zürich −0,78…+0,83 · Genf −1,32…+1,04 · Zermatt **−9,99…+7,51** · Zugspitze **−11,04…−3,47** |
| Vorzeichenprobe (22:00) | Zermatt T̄ 6,41 → **11,62 °C (+5,21 K, Fall A)**, Zugspitze T̄ 6,79 → **0,37 °C (−6,42 K)**, Innsbruck 14,30 → 15,98 (+1,68); Graz 16,67 → 16,07 (**Fall C**, −0,60 K: Bodeninversion 2,7 K über 100 m, Punkt 58 m unter der Zelle) |
| Druck (hydrostatisch mitgeführt) | Zermatt 763,6 → 841,2 hPa, Zugspitze 810,9 → 717,5, Innsbruck 920,6 → 951,1 |

**V-FI-15 — Fall C wörtlich ist an tiefen Orten nicht haltbar.** Zermatt trägt an 5 von 49 Schritten eine Bodeninversion; PAP 4 wörtlich (`T := T̄ − Γ_inv · (z_base − h_true)`) extrapoliert dann 3 K/300 m über **929 m** ⇒ **−9,99 K**, während dieselbe Zelle eine Stunde vorher (Fall A) **+7,51 K** ergibt — ein Sprung von 17 K je nachdem, ob das Modell an SEINER Oberfläche eine Inversion sieht. Eine Modellinversion von dT_inv sagt nichts über eine Mulde, die tiefer ist als die Inversion mächtig. Kur als **Strukturregel** (`calib: poolDepth:set`): das Gefälle wird höchstens über die eigene Mächtigkeit `zInv − zBase` fortgesetzt, darunter gilt wieder Γ_eff; die genutzte Tiefe steht als `poolDepthM` im Ergebnis. Zermatt damit **+1,25 K** statt −9,99. Ob die Regel richtig ist, sagt AP9 (Fall C ist laut PAP 4 „der unsichere Zweig" und bekommt in AP6 das breitere Band).

**Zwei Abweichungen von der Skizze, benannt:** (1) PAP 4 schreibt die Formeln, als läge die Modelloberfläche an der Inversionsbasis. Gemessen liegt sie das im Median (10 m), aber nicht immer (p90 182 m: **abgehobene** Inversionen). Deshalb rechnet `vertical.ts` die Korrektur als Differenz eines stückweisen Profils P(z) zwischen h_true und h_mod_eff — mit Modelloberfläche an der Basis exakt die PAP-4-Formeln, sonst Γ_eff in der aufgelösten Schicht darunter (Setzung `dzSurface: 50 m`). (2) Der Taupunkt bleibt dem Motor überlassen (1,8 K/km über `sourceElevation`), der Cube-Member wird für die Temperatur so **vorkorrigiert**, dass die lineare Lapse des Motors PAP 4 vollendet (`applyVertical`: T_sample = T_PAP4 − γ_Motor · (h_mod_eff − h_true)) — damit der Repräsentativitätsterm `0,0035 K/m · |Δh|` des Motors als Restfehler der Korrektur erhalten bleibt (AP6 baut darauf auf). Ohne Profil ist T_sample = T̄ ⇒ byte-gleich zu AP2 — das ist die Negativkontrolle.

#### 9.6.2 Was sich ändert

| Datei | Änderung |
|---|---|
| `src/pointForecast/fusion/vertical.ts` **neu** | `verticalCorrection()` (pur), `phiLinear`, `pressureAt` (hydrostatisch), `DZ_SURFACE_M`, `GAMMA_ABS_MAX_PER_M` (±20 K/km, darüber Standard-Lapse mit Flag `gammaImplausible`), `verifyVertical()` 17 Prüfungen mit Negativkontrollen |
| `src/pointForecast/cubeSource.ts` | `applyVertical()` je Schritt auf das Cube-Sample, `CubeStep.vertical`, Flags `inversionBody`/`extrapolatedBelowModel`/`stdLapseFallback`, `FuseCubeOptions.vertical` (Negativkontrolle), `calib`: `phi:set`, `dzSurface:set`, `standardLapse:literature` |
| `scripts/verify-pv-cube.mjs` | Block (8): `verifyVertical` + Adapter (Fixture-Inversion 520…820 m, Fall B; t2/t3 `std`; 96 von 102 Schritten byte-gleich zu AP2, genau die 6 Inversionsschritte weichen ab; Druck; Vorkorrektur + Motor-Lapse = PAP-4-Wert; Zermatt/Zugspitze-Vorzeichen) |

#### 9.6.3 Gates AP4

`verify:pv-cube` **64/64** · `verify:pv-fusion` 222/222 · `verify:point-client` 112/112 · `typecheck` 0. Kosten: die Korrektur auf 102 Schritten ist in der Gesamtlaufzeit nicht messbar (Differenz mit/ohne −8,6 ms = Rauschen; die reine Funktion braucht < 0,05 ms je Aufruf, 490 Aufrufe der Diagnose in < 20 ms). Negativkontrolle ✓ (ohne Profil byte-gleich zur linearen Lapse). Vorzeichen ✓ (oben). Nacht/Tag ✓ (39 % gegen 14 %) — für den **Inversionsfall**, nicht für Fall B, den es an den zehn Orten nicht gibt.

**Was AP4 bewusst NICHT tut:** PAP 4 wirkt nur auf das **Cube-Member**; ob es im fusionierten Wert ankommt, entscheidet dessen Gewicht — und das ist im Gebirge heute < 5 % (V-FI-13). Die Station 1 km neben Zermatt trägt den fusionierten Wert; die Korrektur des Cube-Members ist dort im Ergebnis unsichtbar, bis AP6 σ des Cube-Members aus PAP 6 setzt. Das ist die richtige Reihenfolge (erst der Wert, dann sein Fehler), aber es heißt: **die Zermatt-Zahl der Abnahme (+5,2 K am Member) ist kein Produktwert.**

#### 9.6.4 Laufzeit und Bundle nach AP2 + AP4

**Mobil-4G (Lab, `latency/2026-09-16T21-40-09-989Z.json`, CPU 4×, 9 Mbit/170 ms, München/Wien/Zermatt/Genf, Bündel mit AP4):**

| Szenario | total p50 (p95) | Lesephase p50 | Algorithmus p50 (max) | Gate §6 |
|---|---|---|---|---|
| `cube-cold` | **2 252 ms** (2 511) | 2 184 ms | 86 ms (122) | **ROT** — p50 < 2 000 verfehlt um 252 ms |
| `cube-warm` | 555 ms (704) | 504 ms | 76 ms | — |

**Ursache, nicht Ausrede:** die Lesephase allein liegt bei 2,18 s — dieselbe Zahl wie in AP1 (kalt-neu Kern 2 236 ms, §9.2: „1,9–2,5 MB bei 9 Mbit sind ≥ 1,7 s, das ist die Grenze dieses Formats"). Der Algorithmus kostet auf CPU 4× 86 ms (4 %). Das Gate bleibt, wie es ist; der Hebel ist **AP12 (progressives Laden, E-F-3: die ≈ 20 Kernebenen von 57 zuerst)** und das Warm-up aus AP12a, das erst mit Jans Push wirkt. Desktop-kalt ist grün (9.5.4).

**Bundle (`npm run build` 241/241, `npm run budget`):** eagerJs **107,9 unverändert** · eagerCss 2,4 · largestChunk 301,2 · totalJs 1 366,1 → **1 366,4 KB (+0,3 KB)** — der Zuwachs liegt im LAZY `pointForecast`-Chunk (Registrierung + Cache-Schlüssel des Flags), nicht im Start-Chunk; kein Punkt-Modul und kein Fusionsmodul kommt neu ins Bundle (Textsonde in `verify:point-client` (8): 0 Treffer über alle Chunks, 112/112). Der Cube-Pfad selbst (`cubeSource.ts`, `vertical.ts`) steht in **keinem** Chunk — er wird erst gebaut, wenn ein Verbraucher ihn lädt (AP11).

### 9.7 AP3 — PAP 3, Gitter → Punkt (2026-09-16, ab 22:00 UTC)

#### 9.7.1 Diagnose

**Was das Bündel trägt:** `cubeSeriesFrom` liest EINE Zelle (`cellOf` = die nächste, `round`), aber der entpackte Chunk hält alle 16×16 Zellen der Stufe — die Nachbarn kosten **0 Bytes** und ein paar Indexzugriffe. Die vier Zellen, die den Punkt umschließen (2×2-Block: die nächste Zelle plus je eine in Richtung des Punkts in y und x), liegen im selben Chunk, außer die Zelle sitzt am Chunk-Rand. Ausgezählt an den zehn Orten (`cellOf`/`chunkExtent`, ohne Netz): **4 von 30 (Ort, Stufe)-Paaren verlieren zwei der vier Zellen** — Berlin t2 (Zeile 6, Spalte 15) und t3 (Zeile 12, Spalte 0), Graz t1 (Zeile 15) und t2 (Zeile 0). Das sind 13 %, der Plan (§3.3) hatte 12 % gerechnet. Halo ist E-F-2 „nein" ⇒ Flag `chunkBorderTruncated` und N < 4.

**Was der Motor schon tut:** nichts davon — ein Sample hat `distanceMeters: 0`, die Repräsentativität kommt aus dem Footprint. **Was sich ändert:** additiv am Leser (`CubePointSeries.neighbours`, nur auf Wunsch `neighbours: true`, aus DEMSELBEN entpackten Chunk — 0 zusätzliche Abrufe) und ein reines Modul `fusion/grid.ts`: `w_g = exp(−(d_g/L_d)²) · exp(−(Δh_g/L_h)²) · κ_g`, κ = 1 (markiert: keine Landnutzung je Zelle im Repo), **L_d = Zellweite der Stufe** (5,5/11/28 km N–S), **L_h = 200 m** (Präzedenz `spatialWeight` H_REF) — beide `set`. Gemittelt werden Mittel, σ, Quantile und `hModEff` (PAP 3 O5); **nicht** die Profilfelder (PD-B5: das Mittel zweier Inversionsobergrenzen ist keine), nicht `srcCount`/`ensCount` (Zählwerte der nächsten Zelle). Bei N = 1 ist das Ergebnis exakt die Zelle (Negativkontrolle). Die Modellhöhe je Nachbar ist die Ebene `hModEff` dieser Zelle im selben Schritt — genau das, was PAP 3 mit h_mod(g) meint.

#### 9.7.2 Was sich ändert

| Datei | Änderung |
|---|---|
| `src/point/client/cubePoint.ts` | additiv `CubeNeighbourCell` und `CubePointSeries.neighbours` (3×3 um die Hauptzelle, am Chunk-Rand beschnitten, je Nachbar Mittelpunkt, Abstand, `hModEff` und die Werte aller gelesenen Ebenen je Schritt — aus DEMSELBEN entpackten Chunk); `cubeSeriesFrom(…, { neighbours })` |
| `src/point/client/readPoint.ts` | `ReadPointOptions.neighbours` durchgereicht (Voreinstellung aus: Sammler und CLI lesen wie zuvor) |
| `src/pointForecast/fusion/grid.ts` **neu** | `gridToPoint()` (pur), `blockOffsets()` (welche vier Zellen den Punkt umschließen), `GRID_SET` (L_h 200 m, κ 1, m/°), `GRID_NEAREST_ONLY` (Profil, Zählwerte), `verifyGrid()` 12 Prüfungen — darunter die bilineare Falle als Negativkontrolle (ohne Höhenterm zieht der 600 m höhere Nachbar das Mittel um > 3 K nach oben, mit ihm wiegt er < 0,1 %) |
| `src/pointForecast/cubeSource.ts` | `gridStep()` je Schritt VOR PAP 4 (das Cube-Sample ist danach das gewichtete Mittel des Blocks, `hModEff` das gewichtete Mittel der Zellhöhen — PAP 4 rechnet damit); `CubeStep.grid` (N, Gewichte, `truncated`), Flag `chunkBorderTruncated`; `FuseCubeOptions.grid` (Negativkontrolle N = 1); `calib`: `Ld:set`, `Lh:set`, `kappa:set`; der Einstieg liest mit `neighbours: true` |
| `scripts/lib/pvCubeFixtures.mjs` | `buildCubeFixture({ lat, lon })` — die Graz-Fixture für den Chunk-Rand (Zeile 15) |
| `scripts/verify-pv-cube.mjs` | Block (9): `verifyGrid` + Leser (8 Nachbarn, 0 Dateien mehr, Nachbar trägt die Signatur SEINER Zelle) + Adapter (N = 4, Gewichte, unabhängig gerechnetes Mittel innerhalb Δ/2, `grid: false` byte-gleich zu AP4, Graz-Rand N = 2 mit Flag) |

#### 9.7.3 Gates AP3

`verify:pv-cube` **86/86** · `typecheck` 0 · `verify:point-client` 112/112 · `verify:pv-fusion` 222/222. Negativkontrolle N = 1 ✓ (byte-gleich zu AP4). Kosten: PAP 3 auf 102 Schritten **3,9 ms** (Minimum aus drei Läufen, 13,8 gegen 9,9 ms) — innerhalb der 5 ms. **0 zusätzliche Chunks** (Dateizahl mit und ohne Nachbarn gleich; im Lab: dieselben 25–38 Abrufe je Ort, s. 9.7.4).

**Eine Folge, die dastehen muss:** im Gebirge liegen oft ALLE vier Zellen Hunderte Meter über oder unter dem Punkt (Zermatt: 2 537 m gegen 1 608 m). Dann sind alle Gewichte ≈ e^(−20) und nur ihr Verhältnis trägt Information — `gridToPoint` normiert und wählt die niedrigste (nächstliegende in der Höhe) Zelle am stärksten; bei numerischem Unterlauf fällt es auf die nächste Zelle zurück, ohne NaN. Die Höhendifferenz geht danach als Repräsentativität in σ (Motor heute, AP6 morgen) — PAP 3 verkleinert sie, es beseitigt sie nicht.

#### 9.7.4 Laufzeit nach AP3 (Lab, desktop-none, München/Wien/Zermatt/Genf/Graz, `latency/2026-09-16T21-50-55-174Z.json`)

| Szenario | total p50 (p95) | Lesephase p50 | Algorithmus p50 (max) | Abrufe je Ort |
|---|---|---|---|---|
| `cube-cold` | 787 ms (**4 722**) | 740 ms | 42 ms (58) | 25–38 — **unverändert gegen AP2** (0 zusätzliche Chunks) |
| `cube-warm` | 183 ms (213) | 152 ms | 22 ms (30) | 1–2 |

Der Algorithmus kostet mit PAP 3 + PAP 4 warm **22 ms** statt 12 (AP2) — die Nachbarn sind 4× so viele Werte je Schritt. Gate §6 Desktop **GRÜN** (p50). **Der p95 von 4,7 s ist München und ein neuer Befund, V-FI-16:** Kern und erste Darstellung waren nach 1,3 s da, der Nowcast erst nach **4,67 s** — acht Radar-Dateien (drei `meta.json`-Sonden, fünf Frames) je 2,0–2,3 s, alle `x-cache MISS` (V-FI-7: Radar-Slots sind am Edge immer kalt). `getPointForecastFromCube` wartet heute auf das ganze Bündel, also auch auf den Nowcast — obwohl §9.2 ihn ausdrücklich aus dem Kern genommen hat („er kommt nach, wie er kommt"). Für einen einzelnen Aufruf gibt es kein „nach": **AP7 gibt dem Nowcast eine Frist** (wie dem Anker), jenseits derer die Stunden 0–3 mit dem Modell und dem Flag `nowcastFallbackModel` ausgegeben werden; die Radar-Abrufe laufen weiter und füllen den Cache für den nächsten Aufruf.

`chunkBorderTruncated` am lebenden Datum: Graz trägt es auf allen 68 t1/t2-Schritten (Zeile 15 bzw. 0 des Blocks), die anderen vier Orte nirgends — wie in 9.7.1 ausgezählt.

### 9.8 AP6 — PAP 6, Unsicherheit, Familien, Konfidenz (2026-09-16, ab 22:10 UTC)

**Auftrag (§4, AP6):** `fusion/uncertainty.ts` — Konsistenz-Ops inkl. `clct := max(...)`; σ je Größe: `c·σ_ens` (c = 1 `set`), sonst `σ_div² + σ_sys²` (σ_sys aus V-A₁ `set`), plus `σ_quant² = Δ²/12`, plus Fall-C-Aufweitung; der Cube als Member in `combine.ts` **mit dieser σ**; Familien über `dist.ts`; Quantile nur auf nativen Schritten; Konfidenz-Score §2.2; `calib[]`. Abnahme: PAP-6-Bedingungen in 100 % der Ausgaben, PIT/Spread-Skill auf dem Archiv nur BERICHTET (Gate mit AP10), +≤ 30 ms.

#### 9.8.1 Diagnose (Node, 16.09. 21:52 UTC, zehn Orte, je Stufe drei bis vier Schritte)

**Was der Cube an Streuung trägt** (Temperatur, wenn nicht anders gesagt):

| Größe | Gemessen |
|---|---|
| σ_div (`t2m_sd`) | 100 Proben: p10 **0,5** · p50 **1,7** · p90 **2,9 K**. Flachland t1 0,3–1,1 K, Gebirge t1 2,0–2,8 K, t3 1,2–4,5 K. Deckung: t1 im Süden **49/49** Schritte, im Norden (Hamburg/Berlin, ohne C-LAEF/CH1) **35/49** — 14 Stunden mit `srcCount` 1 ⇒ dort gibt es KEIN σ_div, PAP 6 verlangt den Sockel allein |
| σ_ens (`t2m_sd_ens`) | nur auf dem groben Raster: t1 **8/49** (6-stündlich, `ensCount` 20), t2 **6/24** (`ensCount` 40), t3 **6/36** (`ensCount` 50); Werte p50 **2,8 K**, p90 3,1 K — und **σ_ens ist auf denselben Stunden fast immer GRÖSSER als σ_div** (z. B. Zugspitze +315 h: σ_div **0,06** gegen σ_ens **2,96** — zwei Quellen, die sich zufällig einig sind, gegen 50 Member, die es nicht sind). PAP 6 nimmt das Ensemble, wenn es da ist; die Diagnose zeigt, warum: σ_div misst Uneinigkeit, nicht Unsicherheit |
| Quantile (`t2m_q10/q90`) | t1 südlich 51,5 °N 49/49 (C-LAEF-EPS), nördlich 0; t2/t3 je 6 (Member-Quantile alle 48 h). **Zermatt +315 h: q10/q90 = −5,1/+0,4 °C bei T̄ 2,9** — das Mittel liegt außerhalb des Bandes (V-PD-54): Quantile sind EINE Quelle, das Mittel ein anderes. Sie werden getragen und im Konfidenz-Score nicht verwendet |
| `srcCount` | min 2, p50 4 (t3 jenseits 180 h überall 2: IFS + AIFS) |
| σ_div Wind (u10) / Niederschlag / clct | u p50 0,58, p90 1,24 m/s · Niederschlag p50 **0** (trocken), p90 0,13 mm/h · clct p50 **21 %**, p90 41 % — die Modelle sind sich bei der Bewölkung so uneinig, dass σ_div allein die klimatologische Streuung (34 %) erreicht |
| Repräsentativität des Motors für das Cube-Member (heute) | p10 **0,02** · p50 0,33 · p90 **4,3 K**: im Flachland praktisch null (Footprint 5 km × Höhenstreuung 10 m), im Gebirge 1,8–6 K (Zugspitze 4,3: fast ganz `0,0035 K/m · 1 216 m`) — s. V-FI-13 |
| Skill-Term des Motors (σ_c·√(1−ρ²), σ_c = 5 K) | 1,1 K bei +0 h · 1,4 K bei +21 h · 1,9 K bei +45 h · 3,1 K bei +111 h · 4,7 K bei +315 h (Familie `global`, ρ 0,32) |
| V-A₁-Scorecard (Fusion, 111 DE-Stationen, 1–24 h, `implementierung-pv3.md` §11) | T MAE 0,91–1,00 K ⇒ RMSE ≈ 1,2 K · Td 0,74–0,83 ⇒ ≈ 1,0 · Wind 0,69–0,85 ⇒ ≈ 1,0 m/s · Böe 0,96–1,00 ⇒ ≈ 1,3 m/s; Bewölkung und Niederschlagsmenge NICHT gemessen |

**Was das für die Konstruktion heißt:**

1. **σ des Cube-Members kommt aus PAP 6, nicht aus dem Streuungs-Prior des Motors** (V-FI-13): `σ² = (c·σ_ens)²` wo ein Ensemble die Stunde trägt, sonst `σ_div² + σ_sys²`, ohne σ_div (eine Quelle) nur `σ_sys²`; dazu `σ_quant² = Δ²/12` (Ebenenskala: T 0,01 K, clct 0,1 %, Schneefallgrenze 1 m — bei T 0,003 K, also nur ehrlich, nicht spürbar), der Restfehler der Höhenkorrektur `0,0035 K/m · |Δh|` (derselbe Wert wie `REP.lapseResidualPerM` — er ersetzt den Motorterm, der mit der expliziten σ entfällt) und die Aufweitung in Fall C (`|ΔT_C|` als 1 σ: eine Extrapolation, die das Modell nicht prüfen kann, ist um ihre eigene Größe unsicher) bzw. Fall B (`dT_inv/4`: φ ist linear gesetzt, die Form unbekannt).
2. **σ_sys(v, τ) als Startwert:** V-A₁ liefert einen Boden für 1–24 h (T 1,2 K, Td 1,0, Wind 1,0 m/s, Böe 1,3). Jenseits 24 h und für Größen ohne Messung (Bewölkung) wächst er mit dem Skill-Prior des Motors, `σ_c · √(1 − ρ_Familie(τ)²)` — keine neue Zahl, dieselbe Kurve, die der Motor heute für JEDES Modell-Member benutzt: `σ_sys = max(σ_A₁, σ_c·√(1−ρ²))`. Alles `set`; AP10 misst σ_sys(v, τ) aus dem Archiv und ersetzt beides.
3. **Der Member ist dann eine UNVERZERRTE Schätzung** (Steigung 1, kein ρα-Faktor auf der Anomalie): PAP 6 versteht σ als Fehler des fusionierten Werts, nicht als Rest nach einer Regression. Die Klimatologie bleibt Prior (β = σ_c²/(σ_c² + σ²)) — bei +315 h mit σ ≈ 4,7 K und σ_c = 5 K trägt sie die Hälfte, wie beim Motor heute.
4. **Niederschlag bleibt beim Motor** (K-2: Auftreten im Probit-Raum, Menge lognormal): `precip_sd` in mm/h ist in keinem der beiden Räume eine σ, und V-A₁ hat die Menge nicht gemessen. `sigmaKind: 'set'` (Prior des Motors); AP10 kann `precip_sd` in den Mengenraum übersetzen.
5. **Konfidenz-Score** (§2.2): `spread = 1 − min(1, σ_ges/σ_clima)`, `agree = σ_ens²/(σ_ens²+σ_div²)` bzw. `1 − σ_div²/σ_ges²`, gewichtet `min(1, srcCount/3)`, `lage = ∏` Abschläge (`set`: Fall C 0,7 · |Δh| > 300 m 0,8 · Chunk-Rand 0,9 · Interpolation 0,9 · Modell statt Nowcast 0,9). Ein Index 0…1, ausdrücklich keine Wahrscheinlichkeit; im Backtest gegen CRPS-Dezile geprüft (AP9).
6. **Konsistenz:** Td ≤ T und Böe ≥ Wind erledigt der Motor je Verteilung; `clct := max(clct, clcl, clcm, clch)` wirkt auf das Cube-Sample VOR dem Motor; RH ist abgeleitet und geklemmt; Schneegrenze bleibt der Zellwert (`meltOffset` = null, benannt).

#### 9.8.2 Was sich ändert

| Datei | Änderung |
|---|---|
| `src/pointForecast/fusion/uncertainty.ts` **neu** | `memberSigma()` (die PAP-6-Verzweigung je Größe: `ensemble` / `divergence` / `sys-only`, ⊕ Δ²/12 ⊕ Restfehler der Höhe ⊕ Fall-B/C-Aufweitung), `sigmaSysAt()` (V-A₁-Boden, darüber σ_c·√(1−ρ²)), `consistentCloudTotal()` (`clct := max`), `confidenceOf()` (§2.2), `SIGMA_SYS_FLOOR_A1`, `C_SPREAD`, `CONF_DISCOUNT`, `verifyUncertainty()` 20 Prüfungen (mit der Negativkontrolle „σ_div wird nie zu σ_ens addiert") |
| `src/pointForecast/types.ts` | additiv `PointSourceSample.errorSigma` (explizite Fehler-σ je Fusionsgröße) |
| `src/pointForecast/fusion/fuse.ts` | additiv in `fuseScalar`: ein Sample mit `errorSigma` geht als **unverzerrte Schätzung** mit genau dieser σ in `combine` (kein ρα, kein Taper, keine Repräsentativität des Motors; Klimatologie bleibt Prior); ohne das Feld byte-gleich (`verify:pv-fusion` 222/222) |
| `src/pointForecast/cubeSource.ts` | je Schritt σ des Cube-Members und — **bewusste Erweiterung** — des MOSMIX-Members (`sys-only`: eine Quelle, V-A₁-Boden statt des Motor-Priors ρ₀ = 0,985, den V-A₁ als zu hoch gemessen hat); `clct := max` auf beiden; `CubeStep.uncertainty` je Größe (`sigmaKind`, σ_member mit Teilen, σ_post, σ_clima, Konfidenz); `CubeMemberInfo.sigma`; `PointForecast.confidence` = Score; `FuseCubeOptions.uncertainty` (Negativkontrolle); `calib`: `cSpread`, `sigmaSys`, `sigmaQuant:physical`, `sigmaVert`, `confidence`, `precipSigma`, `meltOffset:null`, `stationSigma` |
| `scripts/lib/pvCubeFixtures.mjs` | Streuungen wachsen mit dem Vorlauf (σ_div 0,8 + 0,006·h, σ_ens 0,4 + 0,012·h); jeder achte t1-Schritt mit EINER Quelle (kein σ_div, `srcCount` 1); jeder achte mit `clcl` 95 % über `clct` (Konsistenz-Op) |
| `scripts/verify-pv-cube.mjs` | Block (10): `verifyUncertainty` + Motor-Haken (errorSigma 0,05 K bei +100 h ⇒ unverzerrt; ohne Feld ⇒ ρ-Schrumpfung, Negativkontrolle; Live-Sample byte-gleich) + Adapter (`sigmaKind` je Schritt aus den Daten, sys-only-Schritt, Ensemble-Schritt ohne σ_div-Addition, PAP-6-Bedingungen 102/102, `clct := max` wirkt, Konfidenz 0…1 und fallend, `uncertainty: false` byte-gleich zu AP3, Kosten, `calib`, Score im `PointForecast`) |

**Warum das MOSMIX-Member mit dazugehört (Abweichung vom Wortlaut „der Cube als Member mit dieser σ"):** mit dem V-A₁-Boden (1,2 K) am Cube-Member und dem Motor-Prior am Stationsmember (σ_skill 0,87 K bei +0 h) trüge die Station bei kurzem Vorlauf 70 % — nicht weil sie besser ist (V-A₁: MOSMIX MAE 0,89 K, RMSE ≈ 1,15 K, also derselbe Boden), sondern weil ihr Prior optimistischer ist als die Messung. PAP 6 sagt, σ_sys ist für jedes Member zwingend; die Station im Cube-Pfad ist ein Member der Repo-Daten. Beide bekommen denselben Boden, die Klimatologie bleibt Prior. Am Live-Pfad ändert das nichts (der liest `errorSigma` nie).

#### 9.8.3 Gates AP6

`verify:pv-cube` **119/119** · `verify:pv-fusion` 222/222 (Motor byte-gleich ohne das Feld) · `typecheck` 0. PAP-6-Bedingungen in **102 von 102** Schritten (Td ≤ T, Böe ≥ Wind, clct/RH 0…100, Niederschlag/Wind ≥ 0). Kosten **4,9 ms** auf 102 Schritten (Grenze 30). Negativkontrolle `uncertainty: false` ✓ byte-gleich zu AP3. Der Konfidenz-Score fällt mit dem Vorlauf (Fixture: 0,73 bei +0 h → 0,17 bei +336 h) und trägt die Abschläge. **PIT/Spread-Skill auf dem Archiv sind NICHT gemessen** — das ist AP9/AP10 (das Archiv hat zwei Slots); nichts hier ist eine Genauigkeitsaussage.

**Was am lebenden Datum sichtbar wird (Fixture München, +0 h):** Cube-Member σ 1,45 K (divergence: 0,8 ⊕ 1,2 ⊕ 0,05), Station σ 1,2 K (sys-only) ⇒ fusioniert 12,90 °C zwischen Zelle 14,27 und Station 12,50 mit σ_post 1,36 K; in AP2–AP5 lag der Wert bei 12,57 (Station 96 %). Das Cube-Member trägt jetzt — s. 9.8.4 für die zehn Orte.

### 9.9 AP5 — PAP 5, die Terrain-Terme (2026-09-16/17, ab 22:40 UTC)

**Auftrag (§4, AP5):** `fusion/terrainTerms.ts` — `f_rad` (a, v_ref, ε `set`, aus den Gates 65 %/2,5 m/s), ΔT_cap = −A·g(TPI, SVF, Tiefe)·f_rad·f_saison·(1−foehn), ΔT_uhi = A_uhi(imperv, SVF)·f_rad·f_saison, Wind zweistufig (z0 aus WorldCover, d0 aus `urban`, Blending-Höhe), `f_saison` = Nachtlängen-Jahresgang (E-F-4), Föhn durchgereicht; **A, A_uhi = null ⇒ Terme inaktiv**, Geometrie gerechnet und benannt. Abnahme: Negativkontrolle „A = A_uhi = null ⇒ byte-gleich zu AP6", synthetische Fälle (Mulde/Kamm, Stadt/Land, Wasser ohne +135 % Wind), +≤ 5 ms.

#### 9.9.1 Diagnose

**Was das Bündel trägt (zehn Orte, 16.09., §9.5.1):** `urban/v1` an allen zehn — `imperv` 0 % (Zugspitze) … 38 % (Wien), `d0` 0,1 … 11,6 m, `bldgH` 0,1 … 16,6 m; Gelände `tpi500`/`tpi2000`/`svf`/`sinkDepthM` (AP2: Innsbruck TPI 2 km −31 m, Zermatt −359 m, Zugspitze +659 m; SVF 0,86 Zermatt … 1,0 Flachland); Bedeckung und Wind des Schritts aus dem Cube; Föhn aus `detectFoehn` über die Zellwerte (bereits Kontext des Motors). **Was es NICHT trägt:** z0 am Punkt (WorldCover: der Leser `src/fire/detail/worldCover.ts` liest 3°-COG-Kacheln über den Planetary Computer bzw. den Spiegel — Kopf 16–64 KB plus eine 1024²-Kachel je Ort, zwei Abrufe auf dem kritischen Pfad; nicht im AP1-Bündel), z0 des MODELLS (ein GRIB-Feld, das der Producer nicht ingestiert), `tpiSigma` (regionale TPI-Streuung für das Gate „TPI < −1σ", `calib: null`), und die Amplituden A/A_uhi (`calib: null` — laut Ablaufplan gelernt, nicht gesetzt).

**Was der Motor schon tut:** der Kaltluftsee ist dort ein REGIME (Varianz-Aufweitung über `assessRegime`, Gates Nacht/Senke/Wind < 2,5/Bedeckung < 65 %/SVF), und `windTerrainFactor` verschiebt den Wind nach TPI. Beides bleibt. PAP 5 kommt als **Verschiebung des Mittels** dazu — heute mit Amplitude null.

**Was sich ändert:** die Geometrie wird je Schritt gerechnet und im Ergebnis benannt (`CubeStep.terrain`: f_rad, f_saison, g, Muldengate, UHI-Geometrie, Föhn-Faktor, die Terme als `null`), die zweistufige Windkorrektur ist als reine Funktion gebaut und geprüft, zur Laufzeit ohne z0 inaktiv (Flag). **V-FI-17:** ein WorldCover-Punktleser fürs Bündel (2 Abrufe, ≈ 150 KB je neuem Ort, cachebar) ist eine AP12-Maßnahme — erst, wenn AP10 eine Amplitude liefert, die ihn braucht. Die Setzungen: a = 1, v_ref = 2,5 m/s, ε = 0,35·e⁻¹ (so, dass f_rad an den beiden bestehenden Produkt-Gates genau ε ist), z_b = 60 m, g wie die Gates des Motors (Tiefe/250 m, 0,7 + 0,3·SVF), f_saison = (Nachtlänge − kürzeste)/(längste − kürzeste) am Ort.

#### 9.8.4 AP6 am lebenden Datum (Lab, desktop-none, München/Innsbruck/Zermatt/Zugspitze, `latency/2026-09-16T22-03-43-530Z.json`, 22:03 UTC)

| Ort | vorher (AP2, 9.5.4) | mit PAP 6 |
|---|---|---|
| München T (0…36 h) | 9/10 innerhalb 0,5 K | 5 von 6 (nur +0 h +0,81) — **Wind Δ −0,3…+0,7 m/s statt +0,5…+1,2**: die σ des Cube-Members ist kleiner als der Streuungs-Prior, die Rice-Verteilung enger (V-FI-12 kleiner, nicht weg) |
| Innsbruck | `contributors = mosmix` auf allen t1-Schritten (V-FI-13) | **cube-t1 trägt** bei +0/+3/+24/+36 h (σ_member ≈ 2,5 ⊕ 1,2 ⊕ 1,8 = 3,3 K gegen Station 1,2 K ⇒ ≈ 12 %), bei +6/+12 h noch nicht |
| Zermatt / Zugspitze | Station allein | **weiter Station allein** — der Restfehler der Höhenkorrektur 0,0035 K/m · 929 bzw. 1 216 m = 3,3 / 4,3 K ist der größte Term; der Cube-Member wiegt < 5 %. Das ist der Prior des Motors (`REP.lapseResidualPerM`), unverändert übernommen; ob er zu groß ist, misst AP10 |
| Zugspitze +0 h | −10,6 K (V-FI-11) | −11,5 K — der Live-Pfad (12,6 °C bei 2 962 m), nicht der Cube |

**Laufzeit:** Algorithmus warm **22 ms** p50 (max 40, Zermatt), kalt 40 ms — PAP 6 kostet im Browser < 5 ms. **Gate §6 in diesem Lauf ROT (p50 2 219 ms)** — aus demselben Grund wie V-FI-16: München Kern 729 ms, erste Darstellung 699 ms, **Nowcast fertig bei 2 171 ms**; Innsbruck Kern 770, Nowcast **2 778 ms** (zwei Radar-403 über `raw` nachgeholt), Zermatt Kern 672, statische Produkte erst bei **1 089 ms**. Der Algorithmus ist unbeteiligt; AP7 setzt die Frist (unten).

#### 9.9.2 Was sich ändert (AP5)

| Datei | Änderung |
|---|---|
| `src/pointForecast/fusion/terrainTerms.ts` **neu** | `terrainTerms()` (f_rad, f_saison, g, Muldengate, UHI-Geometrie, Föhn-Faktor, Terme `null` ohne Amplitude), `windBlendingFactor()` (zweistufig, `null` ohne z0), `dayLengthH`/`fSaisonOf` (E-F-4), `TERRAIN_SET`, `verifyTerrainTerms()` 18 Prüfungen (Mulde/Kamm, Stadt/Land, Föhn, durchmischt, Sommer/Winter, Wasser +12 % statt +86 % einstufig, fehlendes z0 ⇒ null) |
| `src/pointForecast/cubeSource.ts` | je Schritt `CubeStep.terrain` (Geometrie + `windFactor`), Amplituden und z0 aus `FuseCubeOptions.terrainCalib` (Voreinstellung: `calib.json` heute = alles null), Flags `terrainTermsInactive`/`windBlendingInactive`/`tpiSigmaUnknown`; `calib`: `A:null`, `Auhi:null`, `fRad:set`, `fSaison:set`, `tpiSigma:null`, `z0:null` |
| `scripts/verify-pv-cube.mjs` | Block (11): `verifyTerrainTerms` + Adapter: **A = A_uhi = null ⇒ byte-gleich zu AP6** (Negativkontrolle der Abnahme), Geometrie je Schritt (f_rad aus der Zelle, f_saison 16.09. ≈ 0,5, g der Mulde, UHI 23 %), f_rad < ε beim `clcl`-95-Schritt, mit A = 3 K (nur Test) Mulde kälter/Stadt wärmer, mit z0 (nur Test) Wind-Faktor < 1, Kosten, `calib` |

#### 9.9.3 Gates AP5

`verify:pv-cube` **144/144** · `typecheck` 0. Negativkontrolle ✓ (byte-gleich). Kosten **3,6 ms** auf 102 Schritten (Grenze 5). Synthetische Fälle ✓ (Mulde/Kamm, Stadt/Land, Wasser: +12 % statt +86 %/+135 %). Im Produkt ändert AP5 heute **keinen Wert** — es benennt, was fehlt: A, A_uhi, tpiSigma (`calib: null`, AP10) und z0 (V-FI-17, Bündel/AP12).

### 9.10 AP7 — Nowcast, Anker, Klimatologie-Schwanz, stündliche Achse

#### 9.10.1 Diagnose vor dem Code (gemessen 16.09. 22:03 UTC, `latency/2026-09-16T22-03-43-530Z.json`, und an der Fixture)

**Was der Cube-Pfad nach AP6 NICHT konnte — vier Lücken, alle am lebenden Datum sichtbar:**

1. **Die Zeitachse hatte Löcher, und das Produkt hat sie verschwiegen.** `PointForecast.hours` ist stündlich definiert (der Live-Pfad liefert 0…336 h stündlich); der Cube-Pfad lieferte **101 Stunden** (t1 45 · t2 22 · t3 34, München/Wien/Zermatt; Zugspitze 103) auf der nativen Achse — von 337 Stunden im Fenster fehlten **236**. Wo genau, aus den Rastern gerechnet (t0 = 22:00): die zwei Stunden der t1/t2-Übergabe (18.09. 19:00/20:00 — lauf-relativ 49–50 h, E-10), die fünf der t2/t3-Übergabe (21.09. 13:00–17:00 — 121–125 h), dazu **2 von 3 Stunden** im 3-h-Band und **5 von 6** im 6-h-Band. Ein Verbraucher, der `hours[i]` als Stunde i liest, läge ab Stunde 46 daneben.
2. **Die Station kann 153 dieser 236 Stunden tragen, und der Pfad hat sie nicht gefragt.** MOSMIX-L (Lauf 2026091615) ist stündlich bis +247 h (= 26.09. 22:00); im Fenster liegen 241 Stunden davon, 88 davon native ⇒ **153 Stunden, in denen die Station den Punkt vertritt** und der Cube keinen Schritt hat. Jenseits 26.09. 22:00 bleiben 96 Stunden mit 13 nativen t3-Schritten ⇒ **80 Stunden ohne jede Quelle** zwischen zwei Schritten, und **3 Stunden nach dem letzten t3-Schritt** (30.09. 00:00 … 22:00), für die es keine Modellvorhersage gibt (`usableToMs`).
3. **Radar deckt, trägt aber nicht immer — und das Produkt sagte es nicht.** Am 22:03-Lauf deckten RV (Slot 4 min alt, 3 Frames), INCA (34 min, 4) und CombiPrecip (4 min, 1) München; Zermatt nur CombiPrecip (`extrapolationH: 0`, also **kein** Frame jenseits des Slots). Wo der Nowcast fehlte — Frist, Sonde, Frame —, rechnete der Motor stumm mit dem Modell für 0–3 h. Und V-FI-16: der Nowcast war das Ende des Lesens (**2 171 / 2 778 ms** München/Innsbruck gegen Kern 729/770; Zermatt statische Produkte erst bei **1 089 ms** gegen Kern 672) ⇒ §6-Gate rot mit p50 2 219 ms, obwohl alles, was der Algorithmus braucht, nach 0,7 s da war.
4. **Kein Anker.** Der Live-Pfad trägt seit V-PV-19 die Innovations-Persistenz (Messung − Modell, τ_T 4 h; gemessen T 1–6 h 2,18 → 0,92 K); der Cube-Pfad hatte keine Messung. Am 22:03-Vergleich lag München +0 h um 0,81 K vom Live-Pfad weg (9.8.4) — wie viel davon der fehlende Anker ist, lässt sich ohne Wahrheit nicht trennen (AP9).

**Was das Fixture-Bündel dazu misst (dieselbe Rasterstruktur, t0 21:00):** 337 Stunden = 102 native + 153 Station + 79 interpoliert + 3 Klimatologie; die stündliche Rechnung kostet in Node **82 ms gegen 28 ms** nativ (153 zusätzliche `fuseHour`-Aufrufe mit einem Sample, 79 Interpolationen, 3 Klimatologie-Schritte) — im Browser unten nachgemessen.

**Setzungen, vor dem Code benannt (alle `set` in `calib[]`):**

| Setzung | Wert | Grund |
|---|---|---|
| Obs-Frist | 1 500 ms hart (`AbortSignal.timeout`), **Gnadenfrist 250 ms nach dem Bündel** | Plan §3.1 (1,5 s); die Gnadenfrist macht den Anker nie zum kritischen Pfad — das Bündel braucht ≥ 0,7 s, die Messung hat also ≈ 1 s Vorsprung |
| Frist der progressiven Produkte | 1 500 ms **ab dem Kern** | V-FI-16: Nowcast und statische Produkte laufen weiter (Cache), das Bündel benennt den Verlierer |
| `stale` | Radar-Slot > 60 min | RV alle 5 min, INCA alle 15 min: ein Slot älter als eine Stunde ist ein hängender Spiegel |
| Radar-Horizont | 3 h | INCA-Extrapolation 3 h, RV 2 h — jenseits davon gibt es kein Radar, also auch kein Fallback-Flag |
| Anker | `anchor.ts` unverändert: τ_T 4 h, τ_Wind 2 h, Deckel 8 K / 6 m/s, `spatialWeight` 20 km / 200 m | V-PV-19, dieselben Werte wie im Live-Pfad; **ein Paar je Station** (die Messung zur Stunde des Cube-Schritts), keine 6-h-Historie — die kommt mit dem Archiv (AP9) |
| Interpolation | linear in p10/p50/p90/Mittel zwischen den nächsten Schritten mit Verteilung; Konfidenz × 0,9 (`CONF_DISCOUNT.interpolated`) | E-F-2: markiert, nicht gerechnet — `fused: null`, der Schritt trägt nur Quantile |
| Schwanz | 6-h-Schritte (t3-Raster) aus dem Prior, `climatologyOnly` | keine Extrapolation der Modelle jenseits `usableToMs` |

#### 9.10.2 Was sich ändert (AP7)

| Datei | Änderung |
|---|---|
| `src/point/client/readPoint.ts` | `ReadPointOptions.lateDeadlineMs`: Nowcast und statische Produkte laufen gegen eine Frist **ab dem Kern** (`Promise.race`); der Verlierer bleibt unterwegs (füllt den Cache), das Bündel trägt `nowcast: []` bzw. `hmodel: null` **und eine Skip-Notiz** (V-FI-16). Ohne Option unverändert (112/112) |
| `src/pointForecast/cubeSource.ts` | `fuseCubePoint` in **drei Durchgängen** (Vorbereitung des Cube-Members je Schritt: PAP 3/4/5 · Anker aus `input.obs` gegen den PAP-4-Wert am Punkt · Fertigrechnen mit PAP 6, Station, Radar, Motor); `CubeFusionInput.obs` (reine Daten) + `nowcastCovering` (Geometrie); Flags `nowcastFallbackModel` (Radar deckt, trägt aber diese Stunde nicht, 0–3 h), `stale`, `anchored`, `stationOnly`, `interpolated`, `climatologyOnly`; `CubeStep.tier` = `t1|t2|t3|station|clima`, `CubeStep.interp` (Quantile) für interpolierte Schritte, Member `anchor`/`climatology`; `FuseCubeOptions.anchor|tail|hourly` (Voreinstellung der reinen Funktion: native Achse; `getPointForecastFromCube` verlangt `hourly + tail`); IO: `CubeIo.obs` (Browser: `fetchNearestStationObs`, harte Frist + Gnadenfrist, nie blockierend), `lateDeadlineMs`; `toPointForecast` gibt interpolierte Stunden mit `fusion: null` aus der `interp`-Quantile aus |
| `scripts/verify-pv-cube.mjs` | Block (7) auf die stündliche Achse (337 Stunden, Klassen aus den Stunden selbst; `hours: 48` ⇒ 46 t1 + 2 Station + 1 t2); **Block (12)**: Deckung aus der Geometrie, Fallback-Flag genau auf 0–3 h, Punkt ohne Radar (byte-gleich, Konfidenz × 0,9), `stale` 75 min gegen 12 min, Anker (Versatz 2,00 K · Repräsentativität 0,978 · Zuschlag 1,956 K, Median +0 h +0,58 K, +40 h wieder auf der Basis, drei Negativkontrollen, Messung ohne Paar), Schwanz (3 Schritte, byte-gleiche native), stündlich (337 = 102 + 153 + 79 + 3, Nähte ungeglättet, Punkt ohne Station ⇒ 232 interpoliert, ohne Klimatologie kein Schwanz), Ende-zu-Ende (Messung nach 2,5 s ⇒ Antwort nach 389 ms ohne Anker mit Notiz; sofort ⇒ Anker im Produkt; Abruf scheitert ⇒ kein Fehler), Leser-Frist (statisch 600 ms langsam, Frist 100 ⇒ Bündel nach 177 ms mit Notiz; ohne Frist 615 ms) |

#### 9.10.3 Gates und Messungen AP7

**Netzfrei:** `verify:pv-cube` **169/169** nach Block (12) (vor AP7 144), `verify:point-client` **112/112** (der Leser ohne `lateDeadlineMs` unverändert), `verify:pv-fusion` **222/222**, typecheck 0, Build 241/241, Budget **unverändert** (eagerJs 107,9 · totalJs 1 366,4), Textsonde: `fuseCubePoint`/`nowcastFallbackModel`/`OBS_GRACE_MS`/`cubeSeriesFrom` in **0** von 83 Chunks (die zwei Treffer `registerCubePointSource` und `climatologyOnly` sind der Fehlertext im lazy `pointForecast`-Chunk und das Motor-Feld im lazy `attach`-Chunk — beide seit AP2 da).

**Am lebenden Datum, zweimal (Lab, `--gate`, München/Wien/Zermatt/Genf):**

| Lauf | Frist-Regel | Desktop kalt p50 / p95 | München kalt (Kern → Antwort) | Desktop warm p50 | Mobil-4G kalt p50 | §6 |
|---|---|---|---|---|---|---|
| 22:33 (`…T22-33-18-132Z.json`) | 1 500 ms **ab dem Kern** | **1 173 / 2 329 ms** | 742 → **2 256 ms** (Nowcast nie da, Frist bindend) | 431 ms (München 1 761: Radar kam bei 1 724) | 2 894 ms | Desktop grün, Mobil rot |
| 22:40 (`…T22-40-27-388Z.json`) | 1 800 ms **ab Start**, ≥ 250 ms nach dem Kern | **1 025 / 1 874 ms** | 732 → **1 803 ms** (ohne Radar, Flag `nowcastFallbackModel`, Skip-Notiz) | 435 ms (München 1 143: Radar kam bei 1 103) | 2 500 ms | Desktop grün, Mobil rot |

Was die zwei Läufe zeigen: (1) Die Frist wirkt — vor AP7 antwortete München bei 2 219–2 778 ms (9.8.4), jetzt bei ≤ 1 803 ms; Wien/Zermatt/Genf liegen bei 0,90–1,03 s, weil dort der Nowcast VOR dem Kern fertig ist (191–375 ms). (2) Die Frist ab dem Kern (erster Entwurf, Setzung aus 9.10.1) war falsch bemessen: sie deckelt die Wartezeit, nicht die Antwort — mit Kern 742 ms landete München bei 2 256 ms, über dem Ziel. Die Frist ab Start (1 800 = 2 000 − 200 ms Rechnung/Ausgabe, Algorithmus stündlich p95 116 ms Desktop) hält das Ziel und behält das Radar, wenn es rechtzeitig kommt (warm 1 103 ms ⇒ Member `radolan/inca/rzc` da). (3) **Mobil-4G bleibt rot, und AP7 kann daran nichts ändern:** der KERN allein braucht 2,1–2,4 s (1,8–2,3 MB, bytes-gebunden, AP12/E-F-3), die Frist greift erst danach. (4) **Der Anker läuft:** im 22:33-Lauf lieferte der Abruf **0 Messungen** — die Abbildung las `point.time`, das Feld heißt `timestamp` (V-FI-19, behoben, Notiz für jeden Nicht-Anker-Fall ergänzt); im 22:40-Lauf **6 Paare je Ort**: München `dwd_obs` Versatz **−1,12 K** (Repräsentativität 0,19 — die nächste DWD-Messstelle ist weit), Wien `tawes` **−0,55 K** (0,67), Zermatt `smn` **−1,53 K** (0,49), Genf `smn` **−0,30 K** (0,38). Der Cube läuft an allen vier Orten wärmer als die Messung — mit den Vorzeichen der V-A₁-Befunde verträglich, aber ohne Wahrheit keine Aussage (AP9). (5) **Die Messung kostet die Antwort nichts Messbares auf dem Desktop:** Abruf fertig bei 825–953 ms kalt (Bündel 753–804), 394 ms warm (Wien; Bündel 127 ⇒ +267 ms Antwortzeit, unter der Gnadenfrist 500); auf Mobil-4G kalt kommt sie nach dem Bündel (2 135–2 417 ms) und wird dreimal von der Frist geschnitten — dort ohne Anker, mit Notiz. Die Gnadenfrist nach dem Bündel wurde dabei von 250 auf **500 ms** gesetzt: im 22:33-Lauf lag Zermatts Messung 252 ms hinter dem Bündel (1 048 gegen 796 ms) — mit 250 ms wäre der Anker um 2 ms verloren gegangen. (6) **Stündlich kostet:** Algorithmus 57–68 ms kalt / 29–39 ms warm auf dem Desktop (vor AP7 40/22), **150–253 ms** auf Mobil-4G (CPU 4×) — 337 Schritte statt 101, davon 153 Stations-`fuseHour` (V-FI-20).

**Die Achse am lebenden Datum (22:40, alle vier Orte):** 337 Stunden, davon 101 native (Zugspitze 103), 153 Station, 80 interpoliert, 3 Klimatologie — genau die Rechnung aus 9.10.1.

#### 9.10.4 Befunde AP7

- **V-FI-16 (Nowcast/statische Produkte am Ende des Lesens) — behoben mit Frist**, Zahlen oben. Offen bleibt die Ursache: Radar-Slots sind am Edge immer MISS (V-FI-7, Warm-up im Spiegel-Workflow = S&F, Radar-Linie). Bis dahin trägt München in 0–3 h kalt das Modell, benannt.
- **V-FI-18 — interpolierte Schritte tragen die Stufe des vorangehenden Schritts** (`tier: 't3'` + `interpolated: true`), der Verbraucher muss beides lesen; in der `flags`-Liste des `cube`-Blocks stehen nur Schritte MIT Flags (313–330 von 337 — fast alle, weil `stationOnly`/`interpolated` Flags sind).
- **V-FI-19 — der Obs-Abruf des Live-Pfads trägt den Messzeitpunkt als `timestamp`**, nicht als `time`; mein erster Adapter verlor jede Messung stumm (kein Anker, keine Notiz). Kur: Feld korrigiert **und** jeder Nicht-Anker-Fall hat jetzt eine Notiz (Frist, gescheitert, keine Station, kein Paar) — eine stille Abwesenheit war das eigentliche Problem.
- **V-FI-20 — die stündliche Achse kostet 153 zusätzliche Motor-Aufrufe** (je Stationsstunde ein `fuseHour` mit einem Sample): +30 ms Desktop, +100–200 ms Mobil. Tragbar; wenn AP11 es braucht, ließe sich die Stationsstunde ohne Kombination (ein Member ⇒ Verteilung direkt) rechnen.
- **Anker mit einem Paar je Station** (die Messung der letzten Stunde), nicht mit der 6-h-Historie des Live-Pfads — die Historie kommt aus dem Archiv (AP9), nicht aus einem zweiten Abruf.
- **Repräsentativität 0,19 in München** (`dwd_obs`): der Live-Pfad nimmt die sechs nächsten Messstellen über alle Netze; für München ist das offenbar keine nahe DWD-Station. Ob der Anker mit 19 % Gewicht noch nützt oder schadet, misst AP9.

### 9.11 AP8 — Ausgabe `PointForecastV2`, Verifier vollständig, CI

#### 9.11.1 Diagnose vor dem Code

**Was nach AP7 fehlte:** Das Produkt des Cube-Pfads war `PointForecast` (die Form des Live-Pfads: ein Median je Größe und Stunde, `fusion` als Motor-Objekt daneben) plus ein `cube`-Block mit Provenienz und Flags. Was Plan §2 verlangt und ein Verbraucher (AP11) oder der Backtest (AP9) braucht, stand darin nur verstreut oder gar nicht: **Quantile** (p10/p50/p90/Mittel/σ je Größe), die **σ-Art** (PAP 6: ensemble/divergence/sys-only), der **Konfidenz-Score** mit seinen drei Faktoren, **„Quelle + Gewicht"** je Größe und Schritt, die **Setzungen je Größe**, eine **Achse** mit nativen und interpolierten Zeiten — und alles **rein serialisierbar** (das `fusion`-Objekt trägt Verteilungen als Union-Typen, die Zeitstempel sind `Date`).

**Drei Dinge waren zu messen, bevor gebaut wurde:**

1. **Die Gewichte kennt nur der Motor, und er gibt sie nicht heraus.** `fuseScalar` normiert `c.weights` und behält davon nur die Tags über 5 % (`contributors`). Ein zweites Rechnen der Gewichte außerhalb wäre eine Kopie des Motors; ein neues Feld auf `FusedVariable` änderte die Bytes des Live-Produkts (jede `hours[i].fusion` trüge es). Der schmalste Weg: ein **lesender Hook** auf dem Kontext (`FusionContext.onWeights`), den nur der Cube-Pfad setzt — der Live-Pfad bleibt byte-gleich (Block 13 belegt: `fuseHour` mit und ohne Hook identisch; der Hook meldet je Größe Gewichte mit Σ = 1 und β).
2. **Wie groß wird das?** 337 Schritte × 14 Größen. Der erste Entwurf (Member mit Details und Setzungen im Klartext je Größe und Schritt) kam auf **3 039 KB JSON** — Stationsname, Lauf und Begründungssätze 4 700-mal wiederholt. Nach Normalisierung (Member-Details **einmal je Schritt**, je Größe nur `{tag, weight, value}`; Setzungen als **Schlüssel** mit Klartext **einmal** in `provenance.calib`/`calibLegend`; stundenunabhängige Schlüssel je Größe einmal in `calibByVar`; Einheiten einmal in `units`) **1 140 KB** — der Rest ist die Sache selbst: je Größe eine Verteilung, fünf Kennzahlen, drei Konfidenzfaktoren, zwei bis vier Gewichte. Im Speicher des Browsers unproblematisch; als Transport (Archiv, Massenaufrufer) braucht es eine kompakte Kodierung (**V-FI-21**, AP9/AP11).
3. **V-FI-8 (Fließkommareste aus `dequantize`)** gehört an genau diese Stelle: die Kennzahlen werden auf die **Skala der Cube-Ebene** gerundet (t2m/td2m/Wind/Böe/Niederschlag 0,01; clct/Schichten/rh/ps 0,1; Schneefallgrenze 1 m; Gewichte und Konfidenz 0,001), die Verteilungsparameter bleiben roh — sie SIND die Antwort, die Zahlen daneben sind ihre Lesart. Rundweg belegt: der Cube-Member-Wert von t2m ohne PAP 3/4 = Signatur der Zelle ± Δ/2 (14,37 gegen 14,3700).

**Abweichungen von der Form in Plan §2, mit Grund:** `VarV2.members` trägt `{tag, weight, value}` und verweist auf `StepV2.members` (Details) — Größe, s. o.; `VarV2.calib` sind Schlüssel, nicht Sätze; `sigma` ist **(q84 − q16)/2** der Verteilung (bei Normalverteilung exakt σ, bei Rice/Hurdle eine verteilungsfreie Lesart); der Prior ist ein **Member** mit Gewicht **1 − β** (K-3: wie viel der Antwort Klimatologie ist, steht jetzt da — gemessen im Motor, nicht gesetzt); `windDir` trägt nur p50 (Konzentrations-Gate, kein Quantil); Wolkenschichten, `ps` und Schneefallgrenze kommen **ohne Motor-Verteilung** vom tragenden Member (Schichten: keine σ-Ebene ⇒ `sigmaKind: none`; ps hydrostatisch aus PAP 4 mit σ_div/σ_ens aus dem Cube, ohne σ_sys ⇒ `sigmaCubeOnly`); `timing.decodeMs` ist `null`, weil der Leser Abruf und Dekodierung nicht trennt (ehrlich statt geschätzt).

#### 9.11.2 Was sich ändert (AP8)

| Datei | Änderung |
|---|---|
| `src/pointForecast/fusion/fuse.ts` | **Ein lesender Hook:** `FusionContext.onWeights?({ variable, weights, beta })`, aufgerufen in `fuseScalar` nach der Normierung. Nichts im Ergebnis hängt davon ab; der Live-Pfad setzt ihn nie (byte-gleich, Block 13; `verify:pv-fusion` 222/222) |
| `src/pointForecast/fusion/output.ts` **neu** | `PointForecastV2` (`schema: 2`; `point` mit Gelände-Kennzahlen; `axis` mit `steps`, `native`, `interpolated`, `seams`, `gaps`, `usableToMs`; `provenance` mit Läufen (ISO, `ageH`), Station, Radar, `calib`, `calibLegend`, `calibByVar`, `units`, `fetched`; `timing`), `StepV2` (`members` mit Details, `vars` × 14, `flags`), `VarV2` (p10/p50/p90/mean/σ, `dist`, `sigmaKind`, `confidence {score, spread, agree, lage}`, `members {tag, weight, value}`, `calib`-Schlüssel), `roundTo` (V-FI-8), `toPointForecastV2()` rein, `verifyOutput()` |
| `src/pointForecast/cubeSource.ts` | `CubeStep.weights` (aus dem Hook, Wind u/v gemittelt) und `CubeStep.samples` (die exakte Eingabe der Kombination — Replay, AP9); `CubePathSummary.v2` + `timing.outputMs`; `getPointForecastFromCube` hängt `v2` an `fc.cube` |
| `scripts/verify-pv-cube.mjs` | **Block (13)**: `verifyOutput`, Form (337/102/79/14/2), Schritt 0 (Quantile geordnet, σ-Art divergence, Konfidenz, Gewichte cube 0,31 + mosmix 0,69 = 1, Prior 0,051), Rundung auf die Ebenenskala über alle Schritte, **Rundweg Δ/2**, interpolierter/Stations-/Klimatologie-Schritt, Schichten/ps/Richtung/pSnow, Provenienz, JSON-Rundweg byte-gleich, Ende-zu-Ende `fc.cube.v2`, **Live-Gleichheit mit dem Hook**, **eine Negativkontrolle je Flag** (14 Flags: seam, interpolated, stationOnly, climatologyOnly, nowcastFallbackModel, stale, nowcastSaturated, anchored, inversionBody, stdLapseFallback, extrapolatedBelowModel, belowGround925, noTerrain, chunkBorderTruncated — je ein Fall, der es setzt, und einer, der es nicht setzt), **Laufzeit gedruckt** (nativ/stündlich/Ausgabe/JSON). Kosten-Prüfungen der Blöcke 8–11 auf Minimum aus **7** Läufen (bei 3 war die PAP-5-Differenz zwischen 1,3 und 8,6 ms — Rauschen, kein Kostenanstieg) |
| `.github/workflows/ci.yml` | Schritt „Verifier — Punkt-Cube-Pfad (buscosun Fusion, FI)" = `npm run verify:pv-cube` hinter `verify:pv-fusion` (netzfrei: Fixture im Speicher, injizierte Uhr, injiziertes Gelände) |

#### 9.11.3 Gates und Messungen AP8 — und der Stand der Phase nach AP2–AP8

**Netzfrei:** `verify:pv-cube` **201/201** (AP2 76 → AP4 106 → AP3 124 → AP6 144 → AP5 144 → AP7 169 → AP8 201; Block 13 = 33 Prüfungen), `verify:pv-fusion` **222/222** (Live-Pfad, mit dem Hook in der Datei), `verify:point-client` 112/112, typecheck 0, Build 241/241, Budget: eagerJs **107,9 unverändert**, totalJs 1 366,4 → **1 366,5** (+0,1 KB: der Hook-Aufruf in `fuse.ts`, im lazy `attach`-Chunk), Textsonde: `fuseCubePoint`/`toPointForecastV2`/`calibLegend`/`nowcastFallbackModel`/`OBS_GRACE_MS`/`cubeSeriesFrom` in **0** von 83 Chunks; `onWeights` 1 Treffer = der Motor selbst (lazy). Laufzeit in Node (Fixture, min aus 7): nativ 9,5 ms · stündlich 21,6 ms · Ausgabe v2 19,7 ms · `JSON.stringify` 9,9 ms (1 140 KB).

**Am lebenden Datum (Lab 22:59 UTC, `latency/2026-09-16T22-59-53-758Z.json`, `--gate`, München/Wien/Zermatt/Genf, Stand nach AP8):**

| Profil | kalt p50 / p95 | warm p50 / p95 | Kern kalt p50 | Algorithmus kalt | Ausgabe v2 | §6 |
|---|---|---|---|---|---|---|
| Desktop | **1 017 / 1 088 ms** (München 810 · Wien 907 · Genf 1 016 · Zermatt 1 087) | **359 / 622 ms** | 697 ms | 51–89 ms | 15–30 ms | **grün** |
| Mobil-4G (9 Mbit, 170 ms RTT, CPU 4×) | **2 631 / 2 781 ms** | 967 / 1 437 ms | **2 274 ms** | 244–247 ms | 75–98 ms | **rot** |

Der Anker trug auf **allen acht Desktop-Läufen** (6 Paare je Ort: München `dwd_obs` −0,97 K · Wien `tawes` −0,32 K · Zermatt `smn` −1,55 K · Genf `smn` −1,69 K); auf Mobil-4G kalt an einem von vier Orten (die Messung kommt dort erst nach 2,2–2,4 s, die Frist 1,5 s schneidet sie — mit Notiz). Der Nowcast kam in diesem Lauf an allen Orten vor der Frist (München 728 ms — der RV-Slot war diesmal warm), an Zermatt war er der letzte Posten (980 ms). Alle drei Läufe des Abends (22:33, 22:40, 22:59) sagen dasselbe: **Desktop kalt ≈ 1,0 s p50, warm 0,4 s; Mobil-4G kalt 2,5–2,9 s, davon 2,1–2,4 s Kern** (1,8–2,3 MB — bytes-gebunden; das ist AP12, nicht der Algorithmus, der auf Mobil 0,25 + 0,1 s kostet).

**Die 10-Orte-Tabelle (Cube-Pfad gegen Live-Pfad, Desktop, 22:03 UTC, §9.5.4/§9.8.4) gilt unverändert** — AP7/AP8 ändern an den nativen Schritten nichts (byte-gleich, Block 12/13), nur der Anker verschiebt +0…+12 h um `Versatz · Repräsentativität · e^(−h/4)` (München: −0,97 · 0,19 = −0,18 K bei +0 h). Das ist ein **Vergleich zweier Vorhersagen, keine Genauigkeit** — die kommt mit AP9.

**Befunde AP8:** **V-FI-21** (v2 ist 1,1 MB JSON je Punkt und 337 Stunden — im Speicher unproblematisch, für Archiv/Massenaufrufer kompakt kodieren: Verteilungen als Zahlentupel, Member-Tags als Index); **V-FI-8 behoben** (Rundung auf die Ebenenskala); der Hook `onWeights` macht sichtbar, dass an einem Flachland-Schritt +0 h die Station **69 %** und der Cube **31 %** trägt und der Prior 5 % (β = 0,95) — mit dem PAP-6-Sockel für die Station (`stationSigma:set`, §9.8.2); ob das Verhältnis stimmt, entscheidet allein der Backtest.

**Was Jan entscheiden muss:** nichts außerhalb von §4 — alle Setzungen tragen `set` mit Grund in `calib[]`, der Motor ist nur additiv angefasst (`errorSigma`, `cloudTotal`-Extraktor, lesender Hook), das App-Bundle ist unverändert, nichts committet.

**Nächste Etappe: AP9** — der Archiv-Sammler nimmt den Cube-Pfad mit (`getPointForecast({ pointSource: 'cube' })` in Node über `CubeIo` mit `store`/`clima`/`nowMs`, wie Block 7/12/13 es tut), `verify:pv-score --archive` bewertet beide Pfade gegen POI/TAWES/SMN; erst daraus kommen σ_sys, c(p,f) und die Antwort, ob der Cube-Member auf Bergorten zu Recht unter 5 % liegt (V-FI-13). Parallel AP12 für Mobil (Ebenen-Ranges, progressives Laden, E-F-3).

#### 9.11.4 Gegenprüfung AP2–AP8 (17.09., 05:40–05:55 UTC, andere Session)

**Gates neu gelaufen:** `typecheck` 0 · `verify:pv-fusion` 222/222 · `verify:pv-cube` **201/201** (Rechnung allein 49,8 ms je Punkt) · `verify:point-client` 112/112 · `verify:point-data` 969/969 · `verify:punktarchiv` 87/87 · Build 241/241 · Budget grün (eagerJs 107,9 · totalJs 1 366,5). Am Live-Motor wurden drei Zeilen ersetzt (`getClimaField` exportiert, die Gewichtsschleife um den lesenden Hook `onWeights` erweitert), alles andere ist additiv; `fuseCubePoint` ist synchron und ohne Abruf (der einzige `import()` liegt in der IO-Schicht `fetchCubeObs`). `verify:pv-cube` liest weder Archiv noch Netz und darf in CI. Der Cube-Pfad ist nicht importiert, sondern registriert (`registerPointSource`), ohne Registrierung wirft `getPointForecast` benannt.

**Lab (`latency/2026-09-17T05-49-21-318Z.json`, desktop-none, München/Wien/Zermatt/Genf, `--gate`):** `cube-cold` **p50 1 903 ms, p95 1 914 ms — Gate §6 grün, mit 100 ms Luft**; Kern 716–1 031 ms, erste Darstellung 683–748 ms, Rechnung + Ausgabe unverändert. Warum am Morgen 1,9 s statt der 1,0 s vom Vorabend: `static` (hmodel/urban unter `@main`) war nach Ablauf der 12 h am Edge MISS und kam bei 1 417–1 649 ms an, und der Radar-Slot war MISS (V-FI-7); `getPointForecastFromCube` wartet bis zur Frist von 1 800 ms auf das vollständige Bündel, dann die Gnadenfrist für den Anker. Der Anker trug an allen vier Orten (Versatz München −0,74 K, Zermatt +3,09 K, Genf +3,30 K — Repräsentativität 0,19–0,67). **V-FI-22:** die statischen Produkte liegen auf dem kritischen Pfad der Antwort, obwohl v1 sie nicht benutzt (PAP 4 rechnet mit `hModEff` aus dem Cube, die PAP-5-Amplituden sind null) — der Cube-Pfad sollte auf `core` + Radar-Frist warten, nicht auf `read`; das ist ein AP12-Posten neben V-FI-7. Solange das CDN diese Dateien kalt hat, liegt Desktop kalt-neu bei ≈ 1,8–1,9 s, nicht bei 1,0 s.

**Verdikt:** AP2–AP8 sind abgenommen, wie in 9.11.3 beschrieben; Mobil-4G bleibt rot (AP12). Nächste Etappe AP9 (Kickoff in `prompt.md`).

### 9.12 AP-PA3 — Befunde eines externen Experten am Archiv (2026-09-17, 15:10–16:30 UTC)

Jan hat 20 Ungereimtheiten aus einer Expertensicht auf den Slot `2026-09-16/2320.json.gz` (410 Punkte, Schema 1, Sammler `8212dda`) zur Prüfung gegeben — „prüfen und, wo echter Fehler, beheben". Jeder Punkt ist unten mit Messung, Einstufung und Kur aufgeführt. Regel der Etappe: Fehler im **Archiv** werden behoben; Fehler im **Live-Pfad der App** (buscosun Fusion, ihre Eingaben, die Stationsleser des Ankers) werden diagnostiziert, im Slot benannt und als V-Eintrag für Jans Entscheidung gestellt — nicht still geändert (Fusions-Eingaben = STOPP & FRAGEN).

#### 9.12.1 Diagnose je Befund (gemessen am Slot vom 16.09. und an den Quellen, vor dem Code)

| # | Befund des Experten | Messung / Ursache | Einstufung |
|---|---|---|---|
| 1 | Bergstationen lehnen sich selbst ab (10 Punkte) | `collectPlan` übergab `elevationM: p.demM` (Terrarium z9, nächstes Pixel). Am Gipfel liegt das Pixel bis 270 m unter der Station (Arber 1 177 gegen 1 446 m, Zugspitze 2 698 gegen 2 960), `judgeStation` (±100 m) verwarf die eigene Station in 10/410 Fällen — alle 10 mit Abstand 0,0–2,0 km | **Fehler im Sammler** — behoben: Punkthöhe = Stationshöhe `elev` |
| 2 | Höhen zwischen den Pfaden inkonsistent (31 Punkte > 50 m) | Der Live-Pfad rechnet mit seiner eigenen z9-DEM-Höhe (bilinear, `query.elevation`), `getPointForecast` nimmt keine Höhe an; Plan nahm z9-Pixel, Cube trägt `hModEff` (Modellhöhe, etwas anderes) | **Archiv**: Plan/Stationen jetzt auf `elev`, `dDemM` daneben, Live-Abweichung je Slot in `stats.warnings.liveElevation`. **App**: V-FI-24 (offen, E-F-12) |
| 3 | `profile` CH für NL/DK/LU | Bewusste Entscheidung aus 9.3.1 (Nachbarn im PA1-Profil, damit die Live-Reihe nicht bricht) — im Slot aber unerklärt | **Kein Fehler, Doku-Lücke** — `PROFILE_WHY` steht jetzt in `pointsFrom.rules.profile` und `live.caveats`; DE-Profil für DK/NL/BE/LU als E-F-11 gestellt |
| 4 | Kein Nowcast für 10 Punkte Ostdeutschland/CZ | `radvor_rv.clip` bis 14,1 °E über die GANZE Breite. **Gemessen am rohen Komposit** `DE1200_RV2609171520` (NaN = kein Radar): Cottbus, Görlitz, Lindenberg, Manschnow, Hoyerswerda, Lichtenhain, Prag, Liberec, Kremsmünster liegen im Komposit; der Kasten lag an **36/410 Punkten** falsch (8 zu Unrecht draußen, 27 zu Unrecht drin — Kärnten, Osttirol, Engadin, Tessin, Sylt, Odense; RV-Bytes dort = erfundene Trockenheit). Die Abdeckung ist die Vereinigung der 150-km-Kreise um die 17 DWD-Standorte: **99,53 % von 12 844 Rasterpunkten** stimmen, alle Abweichungen bei 150 ± 2 km, jeder einzeln prüfbare Standort bei 140 km gedeckt und bei 160 km leer | **Fehler in der Registry** — behoben: `sites` (Standortregel) statt `clip`, V-FI-23 |
| 5 | ICON-CH1/CH2-EPS spurlos | Das Lauf-Manifest 2026091621 WUSSTE es: `skipped.icon_ch1_eps: "Laufsuche fehlgeschlagen … STAC HTTP 500"`; der Sammler kopierte `skipped`/`pending`/`declined` nicht. ICON-CH2-EPS ist dem t1-Band 33–48 h (CH) zugeordnet, der Producer liest sie in t1 nie; CLAEF dem t2-Band 48–60 h, t2 liest sie nie | **Fehler im Sammler** — behoben: `skipped`/`pending`/`declined` je Stufe, `assignedAbsent` (Quellenmatrix gegen Manifest) mit Warnung. Producer/Registry: V-FI-27, V-FI-28 |
| 6 | `ageH` in allen Cube-Stufen 0 | Im Producer heißt `ageH` „Publikationslauf − Quell-Lauf" (`build-point-cube.mjs:1264`), mit einem Job je Stufe (F3b) immer 0; das Stations-`ageH` heißt „Alter beim Bau". Der Sammler kopierte beide unter demselben Namen | **Fehler im Sammler** (falsche Kopie) — behoben: `ageAtSlotH` (Quell-Lauf gegen Slotzeit; 16.09.: t1 2,3 · t2 5,3 · t3 11,3 h), Kopie als `publishLagH`, Stationen `ageAtBuildH` + `ageAtSlotH` |
| 7 | CLAEF-EPS `coverage: full`, 98 Punkte ohne Quantile | `coverage` im Producer = Zeitachse des gewählten Laufs (alle Schritte geholt), nie Fläche (`build-point-cube.mjs:365`). Die 98 Punkte liegen alle ≥ 51,50 °N (C-LAEF endet bei 51,5), belegt 94 DE + 3 NL + 1 DK; mit Quantilen max. 51,45 °N | **Irreführende Kopie** — behoben: `stepsCoverage` + `coverageNote`, `quantiles.points {with, without}` je Stufe, Warnung |
| 8 | Plan-Segmente mit 6-h-Lücken, Grenzen auf :20, letztes Segment `primary: null` | `toSegments` (`resolve.ts`): einstufiger Abschnitt endete auf Schrittende (…:19:59.999), mehrstufiger auf der letzten Entscheidungszeit — 400 einstufige gegen 2 040 mehrstufige im Slot; Achse ab `slotAtMs` (23:20) mit 6-h-Schritt. Das letzte Segment ist die echte Lücke jenseits +336 h des 12z-t3-Laufs (23:20 + 336 h = +347 h) | **Fehler im Client (`resolve.ts`)** — behoben: `toMs` einheitlich Schrittende, lückenlos; Sammler: Achse ab dem nächsten 00/06/12/18 UTC (alle Stufen auf ihrem Raster). `primary: null` am Ende ist korrekt und bleibt |
| 9 | Zeitanker `live` (t0 23:00, Slot 23:20, abgerufen 23:27–23:31), `tsMs` null | `t0Ms` = Stundenboden der Abrufzeit (die App rechnet ab der laufenden Stunde); `tsMs: null` ist die Kurzform für „lückenlos stündlich" (`encodeLive`) — beides war nirgends erklärt | **Doku-Lücke** — behoben: `live.axis` erklärt es im Slot |
| 10 | Wahrheitsfenster je Netz verschieden, 23-UTC-Lücke DE/AT | Fenster [Slot − 24 h, Slot] = [23:20 Vortag, 23:20]: die 23:00 des Vortags fiel vorn heraus, die 23:00 des Tages ist um 23:20 bei POI noch nicht da (gemessen 15:21 UTC: neueste Zeile 14:00) und wurde vom App-Leser TAWES (`end` exklusiv Stundenboden) nie geliefert ⇒ **die 23-UTC-Stunde jedes Tages fehlte für POI/TAWES dauerhaft**. SMN: der App-Leser nahm die :50-Zeile als Stunde 23 | **Fehler im Sammler** — behoben: Fenster ab Stundenboden(Slot − 24 h) (POI trägt 25 Zeilen, gemessen), TAWES/SMN aus den eigenen 10-min-Reihen AM Stundenstempel (SMN um 15:25 mit 15:00 belegt, TAWES mit 15:20) |
| 11 | `validAtSuspect` bei 78 % der Frames mit Lead > 0; INCA/CombiPrecip 11-/6-mal `null` | RV: 7 992/7 992 Frames mit Lead > 0 (100 %) — der Spiegel schreibt die Laufzeit in jedes Frame (V-PD-56), das Flag ist eine Eigenschaft des Spiegels; INCA 0/2 220. `null`: die Domänenhülle der Registry (lat/lon-Kasten) ist größer als das projizierte Raster (INCA Lambert, RZC LV95) — 9 CH-Punkte bei 8,1–8,3 °E und 2 DE-Punkte bei 49,4–49,5 °N tastet kein INCA-Frame ab, 6 Punkte am RZC-Rand kein RZC-Frame; `readNowcastPoint` gibt dann `null` | **Kopie ohne Aussage** — behoben: `validAtSuspect` einmal je Reihe `{frames, of, why}`; `null` nur ohne Slot, sonst `{stamp, frames: null, note}` + Warnung `nowcastOutsideRaster`. Registry-Hülle vs. Raster: V-FI-29 (App, gering) |
| 12 | SMN n/fx leer, TAWES n leer, POI t leer an 5 Punkten, Odense 4 h, Bratislava 8 h | n: weder TAWES noch SMN messen Bedeckung (9.3.1 (7)); SMN fx: der App-Leser fragt `fkl010d1`, die Datei trägt `fkl010z1` (gemessen am Header) ⇒ leer; POI: die 5 Dateien tragen nur „---" (UFS TW Ems, UFS Deutsche Bucht, Leuchtturm Kiel, Berlin-Tegel, Euskirchen — gemessen 15:21 UTC, 25 Zeilen ohne Wert); Odense/Bratislava melden im Synop-Rhythmus | **Archiv**: `fxh` (Stundenmaximum der Böe, alle Netze) und `fx` aus den 10-min-Spitzen; `n` fehlt in TAWES/SMN als Spalte statt als Nullreihe; POI-Sonde beim Listenbau (5 Punkte entfernt, gezählt), Warnungen `poiEmpty`/`poiSparse`. **App**: V-FI-26 (SMN-Böe des Ankers leer) |
| 13 | Taupunkt zu 86 % Klimatologie (`climaOnly` 85 900/99 730) | BrightSky liefert für MOSMIX-Stunden `relative_humidity: null` und `dew_point` gesetzt (gemessen München 18.09. 06 UTC: t 13, rh null, td 8,7); `sampleSources.ts` bildet nur `relative_humidity` ab ⇒ MOSMIX trägt weder Taupunkt noch Feuchte in die Live-Fusion, Beiträge nur aus Anker (`dwd_obs` 1 248 h), AROME (AT/CH bis 60 h) und GFS-Schwanz; DE 48 672 Stunden ohne Quelle | **Fehler in der Fusions-Eingabe der App** — nicht geändert (STOPP & FRAGEN): V-FI-25 mit Einzeiler; im Slot als Vorbehalt benannt |
| 14 | `id ≠ wmo` bei 17 AT-Punkten, P0060 | Beabsichtigt (PA2: `id` = Katalogkennung als Schlüssel des Stationsprodukts, `wmo` = Synop-Kennung der Messstelle) — im Slot unerklärt | **Doku-Lücke** — behoben: `pointsFrom.rules` (id, wmo, profile, elev, demM) |
| 15 | Neue Felder ohne Schema-Bump | `profile`, `mosmix`, `rr1h` kamen in PA2 additiv, Schema blieb 1 | **Fehler** — behoben: Schema 2 mit Historie in `punktarchiv.mjs`; Schema 1 bleibt lesbar (Selbsttest: 1 gelesen, 3 abgewiesen) |
| 16 | `stats.errors` leer trotz fehlender Quelle und 10 Punkten ohne Nowcast | `errors` sammelte nur geworfene Fehler; für „fehlt, ohne dass etwas scheiterte" gab es keinen Ort | **Fehler** — behoben: `stats.warnings` (cubeSourcesAbsent, cubeQuantilesMissing, nowcastNoSlot, nowcastUncovered, nowcastOutsideRaster, planStationRejected, poiEmpty, poiSparse, networkTruthMissing, liveElevation) |
| 17 | `fusion: weights equal, provenance fallback` | Zustand des Producers: PAP-2-Gewichte brauchen Σ aus dem Archiv (AP10); die Begründung steht im Manifest (`fusion.note`), der Sammler kopierte sie nicht | **Kein Fehler** — `fusion.note` jetzt im Slot |

**Nicht Gegenstand, aber mitgesehen:** der Cube-Pfad der App (`readPoint.ts`) beurteilt die Station ebenfalls mit einer DEM-Höhe (z11) — an Gipfelstationen dieselbe Selbstablehnung möglich (E-F-12); der Producer fragt für ICON-CH1 einen STAC-Zeitpunkt zwei Tage nach dem Lauf ab (`adapters/meteoswiss.mjs:156`, `datetime=2026-09-18T18:00` im Lauf 2026091621) — ob das die Ursache des 500 war, ist offen (V-FI-28).

#### 9.12.2 Umgesetzt

| Datei | Was |
|---|---|
| `src/point/sourceMatrix.ts` | `Source.sites?` (Standorte + Reichweite), `DWD_RADAR_SITES` (17) und `DWD_RADAR_RANGE_KM` (150) mit der Messung im Kommentar, `greatCircleKm` (pur), `coversPoint` prüft `sites` nach Domäne/Clip; RV: `clip: null`, `sites` gesetzt; Selbsttest +4 (Cottbus/Görlitz/Lindenberg/Manschnow/Prag gedeckt; Linz/Graz/Klagenfurt/Lienz/Samedan/Bozen/Odense nicht; Haversine-Kontrolle; Negativkontrolle ohne Standortregel). `sites` wandert über `buildSourcesJson` in `point/sources.json` |
| `src/point/nowcastFormat.ts` | Manifest-Text `zeroMeans` nennt die Standortreichweite |
| `src/point/client/resolve.ts` | `toSegments`/`gapsOf`: `toMs` = letzte Entscheidungszeit + Schritt − 1 ms, lückenlos (V-FI-30) |
| `scripts/punktarchiv/lib/punktarchiv.mjs` | Schema **2** mit Historie, `ARCHIVE_SCHEMAS_READABLE [1, 2]`, `parseSlot` liest beide; `TRUTH_SCALES.fxh`; Skelett mit `pointsFrom`, `nowcast.slots`, `live.axis`, `truth.window`, `plan.axis`, `stats.warnings`; Selbsttest +2 |
| `scripts/punktarchiv/lib/truth.mjs` | `TAWES_10MIN`/`SMN_10MIN` mit allen acht Spalten (am Endpunkt gemessen), `hourMax10`, `tenMinHourStamps`, `tenMinColumns` liefert t/td/rh/ff/dd/fx/p/rr1/rr1h/fxh; `hourMapSeries` (App-Leser-Weg) entfernt; Selbsttest 13 → 17 |
| `scripts/punktarchiv/points.mjs` | `readablePoiIds` (POI-Sonde: Datei mit mindestens einem Wert in t/rh/ff/p/n), `PROFILE_WHY`, `from.poiProbe`, `counts.poiEmpty`, Regeltext |
| `scripts/punktarchiv/points.json` | neu gebaut 15:40 UTC: **405 Punkte** (DE 203, AT 84, CH 101, LI 1, CZ 9, NL 4, DK 1, LU 1, SK 1) — die 5 leeren POI-Stationen fallen (`poiEmpty`), sonst identisch (TAWES 280/286, SMN 158/158 wie am 16.09.) |
| `scripts/punktarchiv/collect.mjs` | Cube: `ageAtSlotH`/`publishLagH`, `stepsCoverage` + `coverageNote`, `skipped`/`pending`/`declined`, `assignedAbsent` (Quellenmatrix-Bänder der Stufe gegen Manifest; Warnung nur ohne Grund oder bei `skipped`), `fusion.note`, `quantiles.points`; Stationen: `dElevM` gegen `elev`, `dDemM`; Plan: Höhe `elev`, Achse ab nächstem 6-h-Raster, `dDemM` am Kandidaten, Warnung `planStationRejected`; Nowcast: ein `findLatestSlot` je Quelle, `slots`, außerhalb des Rasters benannt, `validAtSuspect` je Reihe; Live: `axis`, Höhen- und Taupunkt-Vorbehalt, `liveElevation`-Warnung; Wahrheit: Fenster ab Stundenboden, eigene 10-min-Spalten, `fxh`, `count`, Warnungen; `pointsFrom.rules`; Ausgabe zählt Warnungen |
| `scripts/verify-punktarchiv.mjs` | 87 → **103** (Schema 2/1 lesbar, POI-Sonde in der Liste, 9 Textanker an den Kuren im Sammler) |
| `scripts/verify-point-data.mjs` | (3e) Negativkontrolle auf die Standortregel umgestellt, (3g) +1 (Cottbus/Görlitz/Lindenberg/Prag gedeckt, Lienz/Samedan nicht): 969 → **974** |
| `scripts/verify-point-client.mjs` | (7) +1: Abschnitte lückenlos, Länge = Schritte × 6 h, Lücken auf Schrittende: 112 → **113** |

**Nicht angefasst (Jans Gate):** `src/pointForecast/sampleSources.ts` (V-FI-25), `src/sources/meteoSwissSmn.ts` (V-FI-26), `src/point/client/readPoint.ts` (E-F-12), Producer (V-FI-27/28), Daten- und Archiv-Repo.

#### 9.12.3 Gates und Messungen

**Netzfrei:** `typecheck` 0 · `verify:punktarchiv` **103/103** · `verify:point-data` **974/974** · `verify:point-client` **113/113** · `verify:pv-cube` 201/201 · Build 241/241 · Budget grün (eagerJs **107,9 unverändert**, largestChunk 301,2, totalJs 1 366,5 — die Standortliste liegt im lazy `point`-Chunk).

**Am lebenden Datum (Sammler gegen das CDN, Index `4f22b45`, Läufe t1 2026091712 · t2 06 · t3 00 · Stationen 09):**

| Lauf | Punkte | Ergebnis |
|---|---|---|
| 15:46 UTC, `--limit=24 --live-hours=24`, `scratchpad/archiv/2026-09-17/1546.json.gz` | 24 (DK/NL/LU + CH 06600…) | **0 Fehler**, Schema 2; `ageAtSlotH` t1 3,77 · t2 9,77 · t3 15,77 · Stationen 6,77 (Bau 1,75); Plan 24/24 lückenlos, alle Grenzen auf 00/06/12/18 UTC, Stationen 24/24 angenommen (`dElevM` 0); POI 25 Zeilen (15:00 Vortag … 15:00) — das Fenster trägt die 25. Stunde; SMN 16 Stunden 00:00 … 15:00 mit `fxh`, `rr1h`, `p`, `td`, ohne `n`-Spalte; RV `validAtSuspect {24 von 25}` einmal je Reihe; Warnungen: `cubeQuantilesMissing` t1 4/24 (claef_eps), `nowcastUncovered` 06120 Odense (gemessen: nicht im Komposit), `poiSparse` Odense 4 h, `liveElevation` Le Moléson −155 m; 0,34 MiB |
| 15:49 UTC, `--limit=64 --no-live --no-truth`, `scratchpad/archiv2/…/1549.json.gz` | 64 | 0 Fehler, **`nowcastOutsideRaster` inca: 7 Punkte** (Meiringen, Beznau, Würenlingen, Luzern, Giswil, Pilatus, Leibstadt — die Fälle aus Befund 11 als `{stamp, frames: null, note}`), `cubeSourcesAbsent`: t1 icon_ch2_eps und t2 claef **ohne Grund im Manifest** (V-FI-27), t3 aifs_ens übersprungen mit Grund; die Spiegelquellen (pending) lösen keine Warnung mehr aus |

**Größe:** die Schema-2-Form ist je Punkt nicht größer: `validAtSuspect` je Reihe statt je Frame spart 8 325 Booleans je Slot, `n`-Nullreihen entfallen in TAWES/SMN, dazu kommen `fxh` (≈ 25 Werte je Netzpunkt) und die Kopfblöcke (< 10 KB roh). Hochrechnung unverändert ≈ 18 MB je Slot bei 405 Punkten.

**Selbstverifikation:** (1) Funktionserhalt — kein Feld des Schemas 1 ist ohne Ersatz gestrichen (`ageH` → `publishLagH`/`ageAtSlotH`, `coverage` → `stepsCoverage`, Frame-Flag → Reihenblock, `n`-Zähler → `count`), alte Slots bleiben lesbar (Selbsttest); die App-Änderungen (Registry-Reichweite, Segmentgrenzen) sind in ihren Verifiern gegengeprüft; (2) Desktop pixelgleich — keine UI-Datei angefasst, eagerJs unverändert; (3)–(5) entfallen (keine UI).

#### 9.12.4 Befunde und Entscheidungen

- **V-FI-23 — behoben:** RV-Abdeckung als Standortregel (150 km um 17 DWD-Standorte), gemessen an der rohen NaN-Maske; der Kasten bis 14,1 °E lag an 36/410 Punkten falsch. Die Regel lässt sich bei jedem Standortwechsel des DWD mit `scratchpad`-Sonde `rvmask.mjs`/`rvsites.mjs` (Ablauf in 9.12.1 #4) nachmessen.
- **V-FI-24 — offen (App):** der Live-Pfad rechnet an 31/410 Punkten mit einer DEM-Höhe > 50 m unter der Stationshöhe (Arber −237, Klippeneck −241, Feldberg −137 m). `getPointForecast` nimmt keine Höhe an. Kur-Skizze: Option `elevationM` (der Cube-Pfad hat sie schon), vom Archiv und von Ortssuchen mit bekannter Stationshöhe gesetzt; Verhalten der App unverändert, solange niemand sie setzt. **E-F-12:** soll der Cube-Pfad die Stationshöhe als Punkthöhe nehmen, wenn die nächste Katalogstation ≤ 1 km liegt (statt der DEM-Höhe, die am Gipfel die eigene Station verwirft)?
- **V-FI-25 — offen (Fusions-Eingabe, Jans Gate):** MOSMIX trägt in der Live-Fusion weder Taupunkt noch Feuchte, weil `sampleSources.ts` `w.dew_point` nicht abbildet (BrightSky: `relative_humidity` null bei MOSMIX-Stunden, `dew_point` gesetzt). Kur: in `brightSkyToPoint` `dewPoint: w.dew_point ?? null` ergänzen — `fuse.ts` bevorzugt `s.dewPoint` schon (Zeile 688). Wirkung: Taupunkt/Feuchte für alle DE-Punkte jenseits der Ankerstunden aus MOSMIX statt Klimatologie ⇒ **Ausgabe der Live-Vorhersage ändert sich** ⇒ nicht ohne Freigabe; danach `verify:pv-fusion` neu zählen und V-A₁-Scorecard für rh/td prüfen.
- **V-FI-26 — offen (App):** der SMN-Leser des Ankers (`meteoSwissSmn.ts:130`) fragt die Spalte `fkl010d1`; die OGD-Datei trägt `fkl010z1` (Header gemessen 17.09.). Folge: `gust` für alle CH-Stationen `null`, der Böen-Anker in CH trägt nie. Kur: Spaltenname; eine Zeile, aber Anker-Eingabe ⇒ mit V-FI-25 zusammen freigeben.
- **V-FI-27 — offen (Producer/Registry):** die Quellenmatrix ordnet ICON-CH2-EPS dem Band 33–48 h (CH, in t1) und CLAEF dem Band 48–60 h (AT, in t2) zu; der Producer liest sie in diesen Stufen nie und das Manifest nennt keinen Grund. Entweder Registry-Bänder oder Producer-Zuordnung anpassen; bis dahin meldet das Archiv es je Slot als `cubeSourcesAbsent`.
- **V-FI-28 — offen (Producer):** ICON-CH1-EPS fiel im Lauf 2026091621 mit STAC HTTP 500 aus (`skipped`); es gibt keinen Rückfall auf den vorigen Lauf. Die Anfrage nennt `datetime=2026-09-18T18:00` — zwei Tage nach dem Lauf; zu prüfen, ob `instant(validMs)` der richtige Suchschlüssel ist.
- **V-FI-29 — offen (App, gering):** die Registry-Hüllen von INCA und CombiPrecip sind lat/lon-Kästen um projizierte Raster (Lambert bzw. LV95); an den Ecken (INCA 8,1–8,3 °E und 49,4–49,5 °N, RZC 12,4–12,5 °E) meldet `coversPoint` Abdeckung, kein Frame tastet ab. Der AP1-Leser holt dort Frames umsonst. Exakt wäre die Projektion der vier Ecken (`nowcastCorners`) — ein Aufruf in `nowcastSourcesFor`, sobald die Ecken ohne Netz vorliegen.
- **V-FI-30 — behoben:** `toSegments` uneinheitliche Grenzen (s. 9.12.1 #8).
- **E-F-11 (Jan):** Profil DE statt CH für die 6 Punkte DK/NL/BE/LU (MOSMIX + ICON-D2 statt AROME, das sie nicht deckt)? Ein Reihenbruch nach 3 Slots wäre billig; bis zur Entscheidung bleibt CH, benannt im Slot.
- **Bewusst offen:** Bedeckung `n` in AT/CH hat keine Wahrheit; SMN-Vortagsstunde 23:00 (Tagesdatei) bleibt Sentinel — `_t_recent.csv` trägt das ganze Jahr (4,4 MB je Station, gemessen) und gehört in den Bewerter, nicht in den Slot; die 23:00 des Tages fehlt bei POI im 23:10-Slot weiterhin (erscheint erst danach) — das ist eine Eigenschaft des Slots, keine Lücke im Archiv mehr, weil der nächste Slot sie trägt.

**Jans Gates (`MANUELLE-SCHRITTE.md` §16):** Push von `main` **vor 23:10 UTC**, damit der heutige Slot Schema 2 trägt; Entscheidungen E-F-11, E-F-12 und die Freigabe von V-FI-25/26 — **entschieden und umgesetzt, s. 9.12.5.**

#### 9.12.5 Jans Entscheidungen (17.09., 16:35 UTC) und ihre Umsetzung

Jan hat die vier offenen Punkte aus 9.12.4 entschieden: **V-FI-25 und V-FI-26 freigeben**, als eigener Commit nach dem PA3-Push („jeder Tag ohne den Taupunkt-Fix ist ein Tag, an dem die Basislinie B5 im Backtest zu Unrecht schwach aussieht"); **E-F-11 ja**; **E-F-12 ja, aber enger** — die Stationshöhe nur bei höchstens etwa 250 m Entfernung („ein Kilometer in den Alpen kann 500 m Höhe bedeuten"). Dazu zwei Ergänzungen: die 23-UTC-Stunde von TAWES/SMN liegt jetzt in zwei aufeinanderfolgenden Slots (Ende von N, Anfang von N+1) — der Bewerter in AP9 dedupliziert nach Punkt und Stempel; `prompt.md` (AP9 ⇒ §9.13, Schema 2, 405 Punkte, Dedupe-Regel) hat Jan selbst angepasst.

| Entscheidung | Umsetzung | Beleg |
|---|---|---|
| **V-FI-25** MOSMIX-Taupunkt in die Live-Fusion | `src/pointForecast/sampleSources.ts`: `OpenMeteoPointHour.dewPoint?`, `BrightSkyWeatherEntry.dew_point?`, `brightSkyEntryToHour` (exportiert) bildet `dew_point` ab; alle vier Sample-Builder (`brightSkyToHourSamples`, `brightSkyHistoryToSamples`, `seriesToHourSamples`, `omSeriesToHourSamples`) reichen `dewPoint` durch. Der Motor ist unverändert — `fuse.ts` bevorzugte `s.dewPoint` schon (H-2) | `verify:pv-fusion` **227/227** (+5: Abbildung MOSMIX/Messung/Historie, Negativkontrolle „kein Wert ohne Herkunft"). **Gemessen in Node nach dem Fix** (240 h, `distribution: true`): München, Hamburg, Leeuwarden, Zürich — `dewPoint.climatologyOnly` **0/240** und `humidity.climatologyOnly` **0/240** an allen vier Punkten, Beiträge `mosmix` 234 h + Anker 6 h (DE), `mosmix+arome_at` 50 h in Zürich; Taupunkt h+12 München 9,0 °C. Vorher (Slot 16.09.): DE 48 672 Stunden ohne Quelle |
| **V-FI-26** SMN-Böenspalte | `src/sources/meteoSwissSmn.ts`: `fkl010z1` statt `fkl010d1` (Header am 17.09. gemessen), Kommentar in `leadTimeWeights.ts` | Spaltenname im Archiv-Selbsttest (`truth`) gegengeprüft; der CH-Böenanker trägt ab dem ersten Live-Abruf nach dem Push |
| **E-F-11** DE-Profil für DK/NL/BE/LU | `scripts/punktarchiv/points.mjs`: `PROFILE_OF` DK/NL/BE/LU ⇒ `DE`, `PROFILE_WHY` nennt den Reihenbruch (Slots 14.–16.09. unter CH, ab 17.09. DE — im Bewerter nach `codeHash` trennen); `points.json` neu gebaut (405 Punkte, sonst identisch) | `verify:punktarchiv` 103/103 (Nachbarn-Prüfung und Selbsttest umgestellt); Leeuwarden im Live-Pfad unter DE: `sources dwd_obs, mosmix, dwd_uv`, 240 h in 0,3 s |
| **E-F-12** Stationshöhe bei ≤ 250 m | `resolve.ts`: `SELECTION.stationAtPointKm = 0.25` (gesetzt, Grund im Kommentar), `judgeStation` nimmt eine Station ≤ 250 m an — „der Punkt steht an der Station, ihre Höhe gilt, das Höhenkriterium entfällt"; `readPoint.ts`: ohne übergebene Höhe wird an der Station deren Höhe die Punkthöhe (`StationChoice.elevationFrom: input/station/terrain/null`), der Plan bekommt dieselbe Höhe; `cubeSource.ts`: `cubeInputFromBundle` nimmt sie als h_true (auch für PAP 4), `CubeFusionInput.elevationFrom`, Setzung `hTrue:station` in `calib` mit DEM-Höhe daneben. Das DEM bleibt für TPI, Horizont, Senke | `verify:point-client` **118/118** (+5: Plan 0,2 km ⇒ angenommen mit Stationshöhe; 0,28 km ⇒ Höhenkriterium lehnt ab; Bündel 0,1 km ⇒ `station`/515 m; übergebene Höhe hat Vorrang; 4,5 km ohne Gelände ⇒ null, gesagt), `verify:pv-cube` **204/204** (+3: h_true 515 aus der Fixture-Station mit `hTrue:station`; Negativkontrolle 4,5 km ⇒ null; Fixture rechnet weiter mit 525). Die alte Negativkontrolle „0,3 km, 900 m höher ⇒ abgelehnt" stand mit Abstand 0 an Hochsölden und liegt jetzt bei 0,5 km |
| **Dedupe-Regel** | `truth.caveats` im Slot nennt die Überlappung der 23-UTC-Stunde und die Regel für den Bewerter | — |

**Gates gesamt (17.09., 16:50 UTC):** `typecheck` 0 · `verify:pv-fusion` 227/227 · `verify:pv-cube` 204/204 · `verify:point-client` 118/118 · `verify:punktarchiv` 103/103 · `verify:point-data` 974/974 (unverändert seit 9.12.3) · Build 241/241 · Budget grün (eagerJs 107,9, totalJs 1 366,5 — alle Änderungen liegen in lazy Chunks).

**Was sich am Live-Produkt ändert (Jans Freigabe):** Taupunkt und Feuchte der buscosun-Fusion für alle DE-Punkte jenseits der Ankerstunden aus MOSMIX statt Klimatologie; CH-Böenanker trägt. Der Bewerter trennt B5 vor/nach dem Fix am `codeHash` des Slots. **Was sich am Cube-Pfad ändert (default-off, `pointSource: 'cube'`):** an Gipfelstationen (≤ 250 m) h_true = Stationshöhe, die Station trägt; sonst nichts.

**Commits (§16):** zwei — der Live-Pfad-Fix (`sampleSources.ts`, `meteoSwissSmn.ts`, `leadTimeWeights.ts`, `verify-pv-fusion.mjs`) berührt keine Datei der PA3-Änderung und lässt sich als eigener Commit nach dem PA3-Push absetzen; E-F-11/E-F-12 hängen an PA3-Dateien (`resolve.ts`, `points.mjs`, `collect.mjs`, `verify-point-client.mjs`) und gehören in den PA3-Commit.

**Mitgesehen — V-FI-31 (offen, Live-Produkt):** das Legacy-Feld `hours[i].relativeHumidity` des Live-Pfads ist an DE-Punkten jenseits der Ankerstunde leer — im Slot 16.09. **208 von 49 920 Stunden belegt** (genau Stunde 0 je Punkt), CH 5 656/24 772 (AROME-Stunden), AT 4 704/20 160. Ursache: der Legacy-Blend füllt RH nur aus Quellen mit `relativeHumidity`, und MOSMIX hat keine. V-FI-25 ändert daran nichts (gemessen: `hours[12].relativeHumidity` an DE-Punkten weiter `undefined`), die Fusions-Feuchte (`fusion.humidity`, aus dem Taupunkt) ist jetzt aber da. Kur-Skizze: das Legacy-Feld bei `distribution: true` aus `fusion.humidity` (p50) füllen, sonst aus `dewPointC⁻¹(T, Td)` des MOSMIX-Samples — beides ändert die Ausgabe der App ⇒ Jans Gate. Zu prüfen, welches Feld das Punkt-Panel zeigt.

### 9.14 AP12 — Mobil-Härtung: Bytes vom kritischen Pfad (2026-09-18, ab 07:00 UTC, Session parallel zu AP9)

**Auftrag (Kickoff `prompt-ap12-ap11.md`, Stufe 1):** Mobil-4G kalt p50 < 2,0 s / p95 < 5,0 s, warm < 0,5 s; Desktop unverändert oder besser; Fast 3G berichtet (Ziel ≤ 5 s). Hebel in dieser Reihenfolge, jeder gegen die Basislinie desselben Tages: (a) Basislinie, (b) V-FI-22 statische Produkte vom Pfad, (c) Ebenen-Ranges, (d) V-FI-20 stündliche Achse, (e) was die Basislinie sonst mit einer Zahl nennt. Nicht in dieser Stufe: V-FI-7, E-F-8, E-F-3 (8×8, Schema), E-F-5.

#### 9.14.1 Diagnose (gemessen 18.09. 06:55–07:25 UTC, vor dem Code)

**Basislinie** (`latency/2026-09-18-before.json`, `--gate`, 4 Profile × 10 Orte, `cube-cold` = frischer Kontext, `cube-warm` = derselbe Ort erneut mit geleertem Ergebnis-Cache; CDN: 269 HIT / 0 MISS auf den gedrosselten Profilen — der Publisher-Warm-up aus AP12a wirkt, die Chunks sind am Edge warm):

| Profil | kalt p50 / p95 | Kern kalt p50 | nach dem Kern (Rechnung, Ausgabe, Warten) p50 | warm p50 / p95 | Kern warm p50 | §6 |
|---|---|---|---|---|---|---|
| desktop-none | **1 655** / 2 120 ms | 715 ms | 904 ms (Warten auf Radar/`static` bis zur Frist 1 800 ms) | 443 / 1 879 ms (Graz: `static` erst an der Frist) | 153 ms | grün |
| desktop-4g | **2 258** / 2 536 ms | 2 155 ms | 86 ms | 918 / 1 883 ms | 317 ms | **rot** |
| mobile-4g (CPU 4×) | **2 518** / 2 782 ms | 2 200 ms | 364 ms (Algorithmus 247 · Ausgabe 96) | 1 310 / 1 589 ms | 374 ms | **rot** |
| fast-3g (berichtet) | **8 781** / 9 128 ms | 8 746 ms | — | 8 919 / 9 044 ms | 8 576 ms | — |

**Was auf Mobil-4G den Kern begrenzt — Bytes je Posten** (Mittel über die zehn Orte, alle Abrufe enden VOR dem Kern; der Kern ist in 10 von 10 Läufen die Ankunft des t1-Chunks):

| Posten | KB je Ort | braucht der Algorithmus ihn für die Antwort? |
|---|---|---|
| t1-Chunk | 524 | ja (0–48 h) |
| Gelände (Terrarium z11 + z8, S3) | 476 (195–741) | ja (h_true, TPI, SVF, Ringgeometrie; ohne Gelände keine Verteilungen) |
| t3-Chunk / t2-Chunk | 233 / 200 | ja |
| Radar-Frames + Sonden | 76 + 3 | Member 0–3 h (Frist) |
| Klimatologie `climaGrid.json` | 71 | ja (Prior, K-3) |
| Messungen für den Anker (BrightSky/TAWES/SMN; CH bis 57 Abrufe) | 65 | Anker (Frist 1,5 s — auf Mobil kalt fast immer abgeschnitten) |
| Stationskatalog / Bündel / Manifest | 58 / 55 / 14 | ja (Stationswahl, MOSMIX) |
| `run.json` ×3 / statische Produkte / Index | 31 / 11 / 5 | Provenienz / heute ungenutzt (V-FI-22) / ja |
| **Summe** | **≈ 1 822 KB** | Durchsatz vor dem Kern ≈ 0,98 MB/s bei 9 Mbit Deckel ⇒ **die Leitung ist voll**, Prioritäten ordnen nur um (§9.2) |

**Hebel einzeln gemessen** (`latency/2026-09-18T07-20-49-225Z.json`, mobile-4g, 10 Orte, je Variante ein frischer Kontext im selben Lauf): Referenz `cube-cold` 2 539 ms (Kern 2 158) · **ohne Radar** 2 448 (Kern 2 153 — das Radar kostet den Kern nichts Messbares, es kommt mit 0,8–1,7 s vor dem t1-Chunk an) · **ohne Radar und ohne Messungs-Abruf** 2 348 (Kern **1 993**: der Anker-Abruf kostet den Kern ≈ 160 ms und liefert auf Mobil kalt fast nie, weil seine Frist 1,5 s vor dem Kern abläuft) · **Fenster 24 h** (das, was das Panel heute anfragt: `hours = 24` ⇒ nur t1) 1 916 ms p50 / 2 549 p95 (Kern 1 725).

**Ebenen-Ranges — was sie sparen könnten und warum sie heute nicht greifen:**
1. **Welche Ebenen die Antwort wirklich liest** (Code gelesen, nicht aus der Plan-Liste übernommen): `cubeSampleOf` trägt die Quantile `*_q10/_q90` in die Samples, aber **weder der Motor noch `output.ts` liest sie** (§9.8.1: „getragen und im Konfidenz-Score nicht verwendet"); von den Druckflächen braucht die Ausgabe nur 925 hPa (Flag `belowGround925`), `t850/t700/rh850/rh700` nirgends. Ohne diese 18 von 57 Ebenen: **t1 −38 %, t2 −21 %, t3 −20 %** (gemessen am Verzeichnis der 22 Chunks der zehn Orte, Lauf 2026091803/00/1712: Quantile 21,1 %, Druckflächen 16,2 % aller Bytes), je Ort ≈ **300 KB** ⇒ bei 9 Mbit ≈ 0,27 s.
2. **jsDelivr und Range, gemessen** (`scratchpad/rangecache*.mjs`, 07:05 UTC): (a) ein Range wird aus dem gecachten Objekt DERSELBEN `Accept-Encoding`-Variante bedient — ist die Variante warm, ist jeder Range ein HIT (12–54 ms); (b) der Browser schickt zu einem Range nach Fetch-Spezifikation `Accept-Encoding: identity`, der Publisher wärmt mit Chromes `gzip, deflate, br, zstd` (`WARM_ACCEPT_ENCODING`) ⇒ **der erste Range je Chunk und Edge ist ein MISS mit 0,30–1,78 s TTFB**, obwohl dieselbe Datei als Ganzes warm ist (25 ms); (c) Mehrfach-Ranges (`bytes=0-99,200-299`) beantwortet jsDelivr mit **200 und der ganzen Datei**; (d) mit `br` verlangt, liefert jsDelivr den Range über der **br-kodierten** Darstellung (`Content-Range … /363606` statt 363 601 B) — ein Mittelstück ist dann nicht dekodierbar (Node: `Decompression failed`). Die Kernebenen sind nicht zusammenhängend (je Größe Mittel, σ, σ_ens, q10, q90 hintereinander) ⇒ ≈ 10 Ranges je Chunk plus das Verzeichnis vorab.
3. **Folge:** Ranges sparen ≈ 0,27 s NUR, wenn die identity-Variante am Edge warm ist; kalt kosten sie einen MISS (0,3–1,8 s) je Chunk. Das Wärmen der identity-Variante ist eine Publisher-Änderung (S&F) — der Client allein kann sie nicht herstellen.

**V-FI-40 — auf Fast 3G kommt der t1-Chunk NIE an (10 von 10 Läufen), an 2 von 10 Orten keine einzige Stufe.** Zwei Ursachen im Leser, beide aus AP1: (1) die **harte Frist** von 8 s (`httpStore`, Browser) gilt für den GANZEN Abruf, nicht für die erste Antwort — 524 KB über 1,6 Mbit neben ≈ 1,3 MB anderer Abrufe brauchen > 8 s, der Abruf wird abgebrochen (`cube.t1: The user aborted a request.`); (2) der **Hedge** (`fallbackStore`, 2,5 s) startet den `raw`-Ausweichweg, wenn die GANZE Datei nach 2,5 s nicht da ist — gemeint war ein langsamer Origin (403 nach Sekunden), getroffen wird eine langsame Leitung: 34 zusätzliche Abrufe derselben Dateien ab ≈ 3,2 s, die sich die volle Leitung teilen und selbst an der Frist sterben. Auf 4G tritt beides nicht auf (0 Ausweichwege), auf 3G ist es der Grund, warum Fast 3G nicht „langsam", sondern **ohne 0–48 h** antwortet (Algorithmus 0,7–1,8 ms in München/Wien: nichts zu rechnen). Warm ist es dasselbe (der abgebrochene Chunk war nie im Cache).

**Warm (Mobil 1 310 ms p50 gegen Ziel 500 ms):** Kern 374 ms (davon die Index-Revalidierung, `no-cache`, eine RTT ≈ 190–650 ms), dann wartet die Antwort auf den Radar-Slot (neu je 5 min, Netz) und auf die Messung (bis 500 ms Gnadenfrist nach dem Bündel) — der Anker-Abruf ist warm der längste Posten (`obs` fertig bei 1,0–1,3 s). Rechnung + Ausgabe warm ≈ 230 ms auf CPU 4×.

**Was daraus für den Plan folgt (Reihenfolge nach gemessener Wirkung, nicht nach Plan-Liste):**

| # | Maßnahme | erwartete Wirkung (aus den Zahlen oben) | Rückfall / Negativkontrolle |
|---|---|---|---|
| 1 | **V-FI-40**: harte Frist auf die erste Antwort (Kopfzeilen), danach Stillstandsfrist je Datenpaket; Hedge nur bei langsamer ERSTER Antwort | 3G: t1 kommt an, keine Doppel-Abrufe; 4G: 0 (dort griff es nie) | 403/Frist ohne Antwort ⇒ Ausweichweg wie bisher (V-FI-5-Prüfungen) |
| 2 | **(b) + progressive Ausgabe** (nur auf Wunsch, `onUpdate`): erste Antwort, sobald der Kern da ist — statische Produkte nie abwarten (V-FI-22), Radar/Messung/`static`, die später kommen, lösen eine zweite Ausgabe aus; der Anker-Abruf startet im progressiven Modus erst mit dem Kern (er belegt sonst ≈ 160 ms der Leitung und kommt auf Mobil ohnehin zu spät) | Desktop kalt −0,8 s (Frist-Warten fällt weg), Mobil −0,16 s Kern, warm: keine Wartezeit auf Radar/Messung | ohne `onUpdate` byte-gleich wie heute (Sammler, Verifier); Werte der ersten Ausgabe = Werte ohne diese Produkte, benannt (`nowcastFallbackModel`, Notiz „Anker folgt") |
| 3 | **(d) V-FI-20**: Quantile je Verteilung einmal rechnen (Memo), Interpolation der Nachbarschritte zwischengespeichert | Mobil −100…−200 ms nach dem Kern | Ausgabe byte-gleich (JSON-Vergleich mit/ohne Memo) |
| 4 | **(c) Ebenen-Ranges** hinter einer Option (Voreinstellung aus), gemessen mit kalter UND gewärmter identity-Variante | −0,27 s nur mit gewärmter identity-Variante; kalt schlechter | ganze Datei (heutiger Weg) als benannter Rückfall; Ausgabe byte-gleich mit/ohne Ranges |
| 5 | (e) Index stale-while-revalidate für den warmen Fall — nur, wenn nach 1–4 warm noch über 0,5 s | warm −0,2 s | — |

#### 9.14.2 Umgesetzt (nur Leser, Cube-Pfad, Ausgabe und Harnisch — kein Motor, kein Producer, kein Schema)

| # | Datei | Was |
|---|---|---|
| V-FI-40 | `src/point/client/store.ts` | harte Frist nur bis zu den Kopfzeilen, danach Stillstandsfrist je Datenpaket (`stallMs`, Voreinstellung = `timeoutMs`) und Gesamtobergrenze `bodyMaxMs` 120 s; Körper als Strom (`readBody`); eigener Abbruchgrund statt „The user aborted a request."; `FetchOpts.onHeaders`; Hedge in `fallbackStore` fällt weg, sobald das CDN geantwortet hat (bleibt der Körper stehen, greift der Ausweichweg über `when`) |
| (b) | `src/point/client/readPoint.ts` | `ReadPointOptions.progressive`: Bündel ab dem Kern, Nowcast/statische Produkte als Versprechen in `bundle.late` (mit dem Skip-Text, der sie als fehlend benennt); ohne Option unverändert |
| (b) | `src/pointForecast/cubeSource.ts`, `pointForecast.ts` | `PointForecastOptions.onUpdate` (nur Cube-Pfad, Live-Pfad ignoriert es): erste Antwort ohne Warten auf `static`/Radar/Messung; der Messungs-Abruf startet erst mit dem Kern (eigene Frist `OBS_PROGRESSIVE_DEADLINE_MS` 4 s, set); EINE Nachlieferung (`UPDATE_WAIT_MS` 6 s, set) mit dem, was kam; `cube.emission`/`cube.pending`; `forecastFromBundle`/`obsNoteOf`/`cacheForecast` aus dem alten Einstieg herausgelöst (Notizen, Reihenfolge und Werte ohne `onUpdate` byte-gleich) |
| E-F-3 (a) | `readPoint.ts` (`onFirst`), `cubeSource.ts` | t1 zuerst: die übrigen Stufen starten, wenn die BYTES der ersten da sind; `onFirst` liefert ein Bündel der ersten Stufe (Fenster bis zu ihrem letzten Schritt) ⇒ erste Darstellung 0–47 h (`emission: first`, `pending` nennt t2/t3), dann der Kern (`core`), dann die Nachlieferung (`update`); die erste Darstellung kommt nicht in den Ergebnis-Cache (kürzeres Fenster) |
| (d) V-FI-20 | `src/pointForecast/fusion/output.ts`, `cubeSource.ts` | `roundTo` über `k/10^d` statt `toFixed` für Zehnerpotenz-Schritte (andere Schritte alter Weg; `roundToReference` bleibt zum Vergleich); `quantileMemo` (WeakMap je Verteilung) in `fromFused`, in der Interpolation der Nachbarschritte und in den Altfeldern (Median) — Node-Fixture: Ausgabe v2 49 → 8 ms, stündliche Rechnung unverändert ≈ 22–35 ms; **byte-gleich zu HEAD** (Fusion stündlich, v2, Altfelder; mit Negativkontrolle, `scratchpad/cmp-head.mjs`) |
| (c) | `src/point/client/chunkRanges.ts` **neu**, `store.ts` (`range`, `seed`), `cache.ts` (`range`/`seed`), `decodePool.ts`/`decodeWorker.ts` (`checkCrc`), `readPoint.ts` (`planeRanges`), `cubeSource.ts` (`CUBE_ANSWER_PLANES`, `CubeIo.planeRanges`) | Ebenen-Bereiche: Verzeichnis (732 B), dann die 39 Ebenen der Antwort in 7–10 Bereichen (benachbarte bis 2 KB Abstand zusammengelegt), dekodiert werden nur sie (ohne Gesamt-CRC, je Block prüft `unpackBlock` die Länge); `complete()` holt den Rest, prüft die CRC und legt die GANZE Datei über `seed` in den Cache (der warme Weg bleibt die ganze Datei); Bereiche ohne HTTP-Cache (`no-store`, V-FI-41); Rückfall ganze Datei bei 200 auf Range, Transportfehler, fremdem Schema oder abweichendem Manifest — benannt. **Voreinstellung AUS** (V-FI-42) |
| (e) | `cache.ts` (`swrIndex`, `peek`), `store.ts` (`peek`), `readPoint.ts` (`indexSwrMs`, `late.index`), `cubeSource.ts` (`INDEX_SWR_MS` 30 min, set) | Index stale-while-revalidate, nur im progressiven Modus und nur mit `swrIndex` (Voreinstellung aus; an: `defaultCubeIo`): Antwort mit der Index-Kopie ohne RTT vorab, Nachprüfung nebenher; nennt sie andere Läufe, wird ohne Kopie neu gelesen und nachgeliefert; der Index wird nie aus dem Cache GELIEFERT |
| Harnisch | `scripts/pv-latency/lab.ts`, `scripts/verify-pv-latency.mjs`, `scripts/lib/cdpBrowser.mjs` | Szenarien `cubep` (progressiv kalt/warm/24 h), `cubex` (Hebel einzeln: 24 h, ohne Radar, ohne Messung), `cuber` (Bereiche erster/zweiter Nutzer); je Lauf `fullMs`/`finalMs`/Ausgaben; Mitschnitt mit Methode, `Range` und Kodierung; `--gate` prüft jetzt auch warm (§6: < 0,5 s) und zählt kalt das GANZE Fenster (erste Darstellung daneben) |
| Verifier | `scripts/verify-point-client.mjs` (10k, 10l, 8-AP12), `scripts/verify-pv-cube.mjs` (14, 15, 16) | s. 9.14.3 |

**Nachtrag zur Reihenfolge (während der Umsetzung):** Jans Entscheidung E-F-3 (a) vom 16.09. („progressives Laden, t1 zuerst … wird **Pflicht in AP12**; Fast 3G: erste Darstellung mit 0–48 h") gehört als eigener Hebel dazu; er ist nach (d) gebaut (Tabelle oben, Zeile E-F-3).

#### 9.14.3 Messungen und Gates

**Zwischenmessungen am selben Tag** (je Hebel ein Lauf, jede Variante im eigenen frischen Kontext; die Dateien unter `latency/2026-09-18T*`): V-FI-40 + (b) `…T07-37-47-844Z` · (d) `…T08-00-24-244Z` (⚠ in diesem Lauf wurde ein neuer t1-Lauf veröffentlicht, 165 MISS — Kernzeiten dort nicht vergleichbar, nur die Rechenzeiten) · (c) erst mit Cache-Sperre `…T08-10-46-082Z`, dann ohne `…T08-19-50-687Z` · E-F-3 (t2/t3 nach dem DEKODIERTEN t1) `…T08-34-36-749Z`. **Rechenzeit auf Mobil-4G (CPU 4×, kalt)** vor/nach (d): Algorithmus 274 → 210 ms, Ausgabe 109 → 60 ms (Node-Fixture: Ausgabe 49 → 8 ms).

**Ebenen-Bereiche, was sie wirklich bringen** (`…T08-19-50-687Z`, identity-Variante warm, derselbe Lauf, ganzes Fenster ohne t1-zuerst): desktop-4g 2 148 → **1 932 ms**, mobile-4g 2 393 → **2 110 ms** (Kern 2 044 → 1 875) — **−12 % auf Mobil, unter den 20 %**, bei denen der Auftrag „mit Zahlen sagen und aufhören" verlangt. Mit Chromes Cache-Sperre (erster Versuch, `…T08-10-46`) waren sie SCHLECHTER (2 814 ms): zehn Bereiche derselben URL bekamen ihr erstes Byte im Abstand je einer RTT (V-FI-41).

**Vorher/Nachher — derselbe Harnisch, derselbe Tag, 10 Orte** (`latency/2026-09-18-before.json` 06:55 UTC gegen `latency/2026-09-18-after.json` 08:48–09:30 UTC; ms p50 / p95; „erste" = erste Darstellung aus t1 (0–47 h, E-F-3), „ganz" = das ganze 336-h-Fenster, „final" = mit Radar/Anker/`static`; warm = derselbe Ort erneut, Ergebnis-Cache geleert, IndexedDB + Index-SWR):

| Profil | vorher kalt | nachher kalt **erste** | nachher kalt **ganz** | nachher final | vorher warm | nachher warm erste / ganz | 24-h-Fenster (Panel heute) |
|---|---|---|---|---|---|---|---|
| desktop-none | 1 655 / 2 120 | **779** / 1 503 | **828** / 1 555 | 1 315 | 443 / 1 879 | **138** / 179 | 841 / 1 616 |
| desktop-4g | 2 258 / 2 536 | **1 686** / 2 063 | 2 296 / 2 777 | 3 747 | 918 / 1 883 | **111** / 149 | 1 700 / 2 007 |
| mobile-4g (CPU 4×) | 2 518 / 2 782 | **1 812** / 2 176 | **2 478** / 2 902 | 4 091 | 1 310 / 1 589 | **193** / 378 | 1 805 / 2 122 |
| fast-3g (berichtet) | 8 781 / 9 128 — **ohne t1** | 7 285 / 9 264 | 10 236 / 12 287 | 10 236 | 8 919 / 9 044 — ohne t1 | **204** / 401 | 7 216 / 9 242 |

Weiter gemessen im selben Lauf: der bisherige Weg ohne `onUpdate` (`cube-cold`) mobile-4g 2 486 / 2 713 (vorher 2 518), desktop-none 901 (vorher 1 655 — der Hedge/die Frist wartet nicht mehr auf den 403-Fall, V-FI-40); Ebenen-Bereiche (`cube-cold-prog-ranges`, Voreinstellung aus) desktop-4g erste **1 423** (−263 gegen ganze Dateien), ganz 2 219 (−77); mobile-4g erste 1 764 (−48), ganz 2 595 (+117 — **55 MISS**: zwischen den Läufen war ein neuer Lauf erschienen, dessen identity-Variante niemand gewärmt hatte, V-FI-42); fast-3g erste 6 584 (−700). 320 Läufe, **0 Fehler im Bündel, 0 Ausnahmen**, 2 Ausweichwege über `raw` (V-FI-5, bestimmungsgemäß). Fast 3G kommt jetzt VOLLSTÄNDIG an (vorher fehlte t1 in 10 von 10 Läufen) — deshalb ist die ganze Antwort dort länger als vorher (10,2 s statt 8,8 s ohne 0–48 h).

**Gate §6, wie `--gate` es jetzt prüft** (kalt = ganzes Fenster; warm neu im Harnisch, V-FI-48):

| Profil | kalt ganz p50 / p95 | kalt erste p50 / p95 | warm p50 | Urteil ganzes Fenster | Urteil erste Darstellung (E-F-3) |
|---|---|---|---|---|---|
| desktop-none | 828 / 1 555 | 779 / 1 503 | 138 | grün | grün |
| desktop-4g | 2 296 / 2 777 | 1 686 / 2 063 | 111 | **rot** (vorher 2 258: +38 ms p50, +241 p95 — t1 zuerst kostet das ganze Fenster eine RTT, V-FI-47) | grün |
| mobile-4g | **2 478** / 2 902 | **1 812** / 2 176 | **193** | **rot** (−40 ms gegen vorher) | **grün** |

**Netzfrei:** `typecheck` 0 · `verify:point-client` **129/129** (118 + 11: (10k) V-FI-40 sechs Prüfungen mit Gegenprobe am HEAD-Store, (10l) SWR vier, (8) Textsonde AP12 mit Gegenprobe auf das eigene Muster) · `verify:pv-cube` **230/230** (204 + 26: (14) progressive Ausgabe + E-F-3 + V-FI-20, (15) Ebenen-Bereiche, (16) Index-SWR) · `verify:pv-fusion` **227/227** (Live-Pfad unverändert) · Build 241/241 · Budget grün: eagerJs **107,9 unverändert**, totalJs 1 366,6 (+0,1 KB — im Baum liegt auch die Nebenlinie HZ1 einer dritten Session; kein Punkt-Modul in einem der 83 Chunks). Kosten-Prüfungen (4)/(11) in `verify:pv-cube` waren zweimal rot, als parallel Lab-Läufe oder die HZ1-Session rechneten, allein gelaufen grün (die bekannte Falle, CLAUDE.md).

**Byte-Gleichheit, einzeln belegt:** (d) stündliche Rechnung, v2 und Altfelder gegen die HEAD-Fassung von `output.ts`/`cubeSource.ts` byte-gleich (mit Negativkontrolle `nowMs + 1 h`); `roundTo` an 280 000 Zufallswerten gleich `roundToReference`; der Quantil-Speicher gibt für 1 806 Verteilungen (258 Rice) genau `quantileOf`; (b) die erste Antwort ohne Stadt-Raster in allen Werten gleich der Referenz MIT Stadt-Raster (der Vergleich sieht den Anker — Gegenprobe); E-F-3 die erste Darstellung ist byte-gleich der Anfang der ganzen Antwort; (c) mit Ebenen-Bereichen v2 und Altfelder byte-gleich zur ganzen Datei (Gegenprobe: nur `t2m` ⇒ andere Ausgabe), die zusammengesetzte Datei byte-gleich im Cache, ein verfälschtes Byte ⇒ CRC-Befund und nicht gespeichert; ohne `onUpdate` byte-gleich wie bisher.

#### 9.14.4 Befunde

- **V-FI-40 — behoben:** Frist über den ganzen Abruf + Hedge auf die Körperzeit ⇒ auf Fast 3G kam t1 nie an, an zwei Orten gar keine Stufe (9.14.1). Seit der Kur: 3G vollständig, 3G warm 8,9 → 0,2 s (erste) / 1,9 s (bisheriger Weg).
- **V-FI-41 — behoben (im Bereichs-Weg):** Chrome reiht gleichzeitige Abrufe derselben URL hinter der Sperre des HTTP-Cache-Eintrags ein; parallele Bereiche kamen im Abstand je einer RTT (Lab: 247 … 1 941 ms statt alle bei ≈ 250 ms). Kur: Bereiche mit `cache: 'no-store'` (die geprüfte ganze Datei landet ohnehin in IndexedDB).
- **V-FI-42 — offen, Jans Entscheidung (Publisher = S&F):** der Publisher wärmt nur die br-Variante; ein Range-Abruf des Browsers ist immer `identity` ⇒ der erste Bereich je Chunk und Edge ist ein MISS (0,3–1,8 s), gemessen 07:05 und wieder 09:20 (55 MISS nach einem neuen Lauf). **Vorschlag:** `cdnSync.mjs` holt je Chunk zusätzlich EINEN Bereich `bytes=0-731` (der Browser nimmt dafür identity; gemessen: EIN identity-Abruf macht das ganze Objekt am Edge warm, alle weiteren Bereiche HIT) — +1 kleiner Abruf je Chunk (≈ 276 je Zyklus). Danach `CubeIo.planeRanges` einschalten: gemessen erste Darstellung desktop-4g −263 ms, 3G −700 ms, mobile-4g −48 ms; ganzes Fenster −77 … −283 ms.
- **V-FI-43 — Befund (Vorsicht für Node-Leser):** mit `Accept-Encoding: br` bezieht jsDelivr einen Range auf die br-kodierte Darstellung (`Content-Range … /363606` statt 363 601 B) — ein Mittelstück ist nicht dekodierbar (Node: `Decompression failed`); Mehrfach-Bereiche beantwortet es mit 200 und der ganzen Datei. Der Browser ist sicher (identity), ein Node-Sammler mit Bereichen müsste identity verlangen.
- **V-FI-44 — offen (Producer/Schema, S&F):** 18 von 57 Ebenen (C-LAEF-Quantile q10/q90: 21 % aller Chunk-Bytes, in t1 28 %; t/rh auf 850/700 hPa: 11 %) liest die Antwort nicht — sie stehen verschränkt zwischen den gelesenen (je Größe Mittel, σ, σ_ens, q10, q90), deshalb 7–10 Bereiche je Chunk. Vorschlag für ein späteres Schema 6: die Ebenen der Antwort zusammenhängend nach vorn (EIN Bereich; mit dem Ende im Kopf sogar ohne Verzeichnis-RTT). Ob die Quantile in AP9/AP10 gebraucht werden, entscheidet der Backtest.
- **V-FI-45 — behoben:** `roundTo` über `toFixed` war die Hälfte der Ausgabezeit.
- **V-FI-46 — offen (gering):** der Anker-Abruf braucht in der Schweiz 53–57 Abrufe (SMN-Stationsdateien, dieselbe Klasse wie V-FI-4); progressiv kommt der Anker dort 4–6 s nach dem Start (final), blockiert aber nichts mehr.
- **V-FI-47 — offen:** t1 zuerst kostet das ganze Fenster eine RTT + TTFB (t2/t3 starten, wenn die t1-Bytes da sind; Leitung kurz leer): desktop-4g ganz +38 ms p50 / +241 ms p95. Vorschlag: t2/t3 starten, sobald der Rest von t1 in eine RTT passt (Fortschritt aus dem Körperstrom, Kopfzeile `content-length`) — geschätzt −150 … −250 ms für das ganze Fenster, erste Darstellung unverändert.
- **V-FI-48 — behoben (Harnisch):** `--gate` prüfte warm nie (§6 verlangt < 0,5 s); jetzt ja. Kalt zählt es das GANZE Fenster (strenger als die erste Darstellung).
- **V-FI-49 — offen:** Fast 3G erste Darstellung 7,3 s (Ziel ≤ 5 s, nicht blockierend): t1 524 + Gelände 476 + Station/Katalog 127 + Klimatologie 71 + Radar 80 KB ≈ 1,3 MB bei 1,6 Mbit ≈ 6,5 s. Mit Ebenen-Bereichen gemessen 6,6 s. Der Rest liegt im Gelände (z8-Fernfeld 150–450 KB, E-F-6: kein Produkt) — ein kleineres Fernfeld (z7) änderte Horizont/SVF und damit Werte ⇒ nur mit Jans Entscheidung.
- **V-FI-50 — offen, für AP11/Real-Device:** die Rechnung läuft synchron im Hauptthread: auf CPU 4× Algorithmus ≈ 210–230 ms + Ausgabe ≈ 60–80 ms am Stück ⇒ sehr wahrscheinlich ein Long Task > 200 ms auf einem echten Mobilgerät (headless-shell meldet keine). Kur-Skizze: `fuseCubePoint` + `toPointForecastV2` in einen Worker (die Eingabe ist bis auf `ClimaField` reine Daten; die Klimatologie ließe sich dort aus `climaGrid.json` neu bauen) oder die stündliche Achse in Scheiben mit `await` dazwischen.

#### 9.14.5 Selbstverifikation und Gate-Urteil

1. **Funktionserhalt:** Live-Pfad unverändert (`verify:pv-fusion` 227/227); der Cube-Pfad ohne `onUpdate` byte-gleich (Block 14 Referenzen, HEAD-Vergleich); ohne `planeRanges`/`swrIndex` liest der Leser wie bisher (alle alten Prüfungen unverändert grün, keine umnummeriert); Sammler/CLI rufen den Leser ohne die neuen Optionen. 2. **Desktop pixelgleich:** keine UI-Datei berührt, eagerJs 107,9 unverändert. 3. Touch: keine UI. 4. **Konsole:** 320 Lab-Läufe ohne Fehler im Bündel, ohne Ausnahme. 5. **Long Tasks:** in headless-shell nicht messbar (§9.2) — und nach den Rechenzeiten wahrscheinlich > 200 ms auf Mobil (V-FI-50) ⇒ Real-Device in AP11, Jans Schritt.

**Urteil Stufe 1: ROT nach dem strengen Maß** (ganzes 336-h-Fenster, Mobil-4G p50 2 478 ms > 2 000; desktop-4g ganzes Fenster +38 ms p50 gegen vorher), **GRÜN nach dem Maß der ersten Darstellung** (E-F-3: Mobil-4G 1 812 / 2 176 ms, desktop-4g 1 686 / 2 063, warm 193 ms; das 24-h-Fenster des heutigen Panels 1 805 / 2 122). Der Rest des ganzen Fensters ist bytes-gebunden (≈ 1,8 MB bei 9 Mbit); die Hebel ohne Schemawechsel sind V-FI-42 (Publisher wärmt identity ⇒ Ebenen-Bereiche an) und V-FI-47 (t2/t3 früher starten), zusammen geschätzt −0,3 … −0,5 s — ob das die 2,0 s sicher unterschreitet, ist nicht gemessen. E-F-3 (8×8-Chunks) wird **nicht** vorgeschlagen: die Messung zeigt nicht, dass es nötig ist, solange die zwei Hebel nicht gemessen sind. **Nach der Regel des Auftrags beginnt Stufe 2 erst mit Jans Entscheidung**, welches Maß gilt (MANUELLE-SCHRITTE §17).

**Jans Entscheidung (18.09., in der Session):** das §6-Gate zählt auf 4G die **erste Darstellung** (E-F-3), das ganze Fenster wird weiter berichtet ⇒ **Gate AP12 GRÜN** (Mobil-4G 1 812 / 2 176 ms, Desktop-4G 1 686 / 2 063, warm 193 / 111 ms). V-FI-42 (identity-Warm-up im Publisher) entscheidet Jan später; die Ebenen-Bereiche bleiben bis dahin aus.

### 9.15 AP11 — das Punkt-Panel liest v2 hinter `?pf=cube` (2026-09-18, ab 09:45 UTC)

**Auftrag (Kickoff Stufe 2):** URL-Schalter `?pf=cube` (fehlt oder anderer Wert = live) dort, wo das Panel seine Vorhersage holt; Cube-Pfad per dynamischem Import registrieren (eagerJs 107,9); `?pflog=1` für einen Zeit-/Herkunftsblock; Voreinstellung bleibt live. Das Panel zeigt `PointForecastV2` (§2): je Stunde p50 mit Band p10–p90, σ-Art, Konfidenz mit drei Faktoren, Member mit Gewicht/Lauf/Alter, Flags je Schritt, den Klimatologie-Schwanz sichtbar getrennt, `hTrue:station` und jede `set`-Setzung als „vorläufige Bandbreite"/„Setzung". Command-Deck; Mobil nur per Media Query; Touch ≥ 44 px; Safe-Area. Ohne `?pf=cube` pixelgleich auf dem Desktop. Massenaufrufer bleiben live (E-F-7).

#### 9.15.1 Diagnose (Code gelesen, am gebauten Bundle geprüft, vor dem Code)

1. **Einziger Verbraucher:** `PointForecastPanel` (MapView: Readout-Spalte auf dem Desktop, Bottom-Sheet mobil). Er ruft `getPointForecast({ lat, lng, country, hours, signal, includeRadarNowcast: true, sourceMode })` mit **`hours = 24`** und frischt alle 10 min auf. Die drei Ansichten (Übersicht, Diagramme, Tabelle) lesen nur die Altfelder von `PointForecast` (`hours[i].temperature/windSpeed/…`, `sourcesAvailable`, `nearestStations`, `query.elevation`, `lapseRatePerM`) — der Cube-Pfad liefert genau diese Form (AP2) plus `cube.v2`; die Ansichten laufen also mit Cube-Daten ohne Änderung.
2. **Das Panel ist in der Produktion heute unsichtbar:** `START_NOW_ONLY` (MapView, seit 2026-07-23) blendet es aus, außer mit `?startnow=0` (am Bundle geprüft: ohne den Schalter rendert die Readout-Spalte kein `.pfc-panel`). `?pf=cube` wirkt deshalb dort, wo das Panel sichtbar ist — heute nur mit `?startnow=0`. Das ist Jans Erstbild-Entscheidung und bleibt unangetastet.
3. **Unbekannte Query-Schlüssel überleben die Kanonisierung der Karte** (`urlState.ts`, `extra`: „startnow, ta, afEst … bleiben erhalten") — `pf`/`pflog` brauchen keine Router-Änderung.
4. **`sourceMode: 'native'`** (Einzelmodell aus dem Modell-Schalter) hat auf dem Cube-Pfad keine Entsprechung — der Cube fusioniert immer. Mit `native` bleibt das Panel live, benannt.
5. **Fenster:** das Panel fragt 24 h an. Die v2-Ansicht soll den Klimatologie-Schwanz (jenseits `usableToMs`, ≈ 318 h) zeigen ⇒ der Cube-Modus fragt **336 h** an; dank AP12 kommt die erste Darstellung (t1, 0–47 h) auf Mobil-4G nach ≈ 1,8 s (§9.14.3, 24-h- und 336-h-Fenster gleich schnell), der Rest über `onUpdate`. Die drei bestehenden Ansichten bekommen weiter die ersten 24 Stunden (gleiche Darstellung).
6. **Bundle:** `totalJs` zählt auch Lazy-Chunks und hat 5,4 KB Luft (1 366,6 / 1 372). Der Cube-Pfad (Leser, `cubeSource`, PAP-Module, Ausgabe) und die neue Ansicht werden ein eigener Lazy-Chunk — erst beim ersten Laden mit `?pf=cube`. Seine Größe wird am Kontrollbau gemessen; eagerJs darf sich nicht bewegen, der MapView-Chunk nur um den Schalter wachsen.
7. **Pixelgleichheit ohne Schalter** wird mit einem Vorher-Bau (`scratchpad/dist-before`, derselbe Baum vor AP11) und `scratchpad/panelshot.mjs` geprüft: beide Bauten gleichzeitig ausgeliefert, dieselbe URL, Ausschnitt `.pfc-panel`, Pixel- und Textvergleich, Konsolenfehler. Gegenprobe des Werkzeugs: Vorher gegen Vorher ⇒ Desktop **0 abweichende Pixel**; im mobilen Sheet stand die Uhr des Zeit-Decks mit im Bild (11:45 gegen 11:46) ⇒ Ausschnitt auf das Panel im Sheet verengt.
8. **Long Tasks** sind in headless-shell nicht messbar (§9.2); die Rechnung läuft ≈ 300 ms synchron auf CPU 4× (V-FI-50) ⇒ Real-Device bleibt Jans Schritt.

**Plan:** (a) Schalter in `PointForecastPanel` (`pfSourceFromUrl`/`pfLogFromUrl`), Cube-Modus lädt `cubeSource` dynamisch und ruft mit `pointSource: 'cube'`, `hours: 336`, `onUpdate`; live unverändert (derselbe Aufruf, dieselben Felder); (b) neue Ansicht „Bandbreite" als eigener Tab nur im Cube-Modus, `React.lazy` (eigener Chunk mit eigenem CSS `pfb-*`, lädt nur mit `?pf=cube`); (c) `?pflog=1`: Ausgaben (erste/Kern/Nachlieferung mit Zeit), Lesen/Kern/Rechnung/Ausgabe/gesamt, `doneAt` je Produkt, Dateien/Bytes/Ausweichwege, Browser-Cache-Anteil aus `PerformanceResourceTiming` (x-cache ist im Browser nicht lesbar — gesagt); (d) Verifier: Textsonde „Cube-Code nur im Lazy-Chunk", Schalter-Logik netzfrei; (e) Pixel-/Textvergleich ohne Schalter, Bildschirmfotos mit Schalter (Desktop 1440×900, iPhone 12 Pro 390×844 @3×).

#### 9.15.2 Umgesetzt (Panel, neue Ansicht, Harnisch — kein Motor, kein Leser, kein Producer)

| Datei | Was |
|---|---|
| `src/pointForecast/pfFlags.ts` **neu** | `pfSourceFrom(search)` (nur genau `pf=cube` ⇒ `'cube'`, alles andere `'live'`), `pfLogFrom(search)` (nur `pflog=1`) — rein, damit der Verifier sie ohne Browser prüft |
| `src/pointForecast/PointForecastPanel.tsx` | Schalter einmal beim Laden des Moduls gelesen; `useCube = pf=cube && sourceMode !== 'native'` (Einzelmodell bleibt live, 9.15.1 Nr. 4). **Live-Zweig: derselbe Aufruf, dieselbe 10-min-Auffrischung wie vorher** (Zeile unverändert, Verifier hält sie fest). Cube-Zweig: `import('./cubeSource')` (registriert sich), dann `getPointForecast({ …, hours: 336, pointSource: 'cube', onUpdate })`; jede Ausgabe (`first`/`core`/`update`) ersetzt die Daten, ihre Ankunftszeit wird für `?pflog=1` mitgeschrieben; Fehler nennt den Rückweg („ohne ?pf=cube zeigt das Panel den Live-Pfad"). Die drei bestehenden Ansichten bekommen im Cube-Modus die ersten `hours` (24) Stunden. Vierter Tab **„Bandbreite"** nur im Cube-Modus; `?pflog=1` blendet den Zeit-/Herkunftsblock über den Ansichten ein |
| `src/pointForecast/PointForecastBands.tsx` **neu** (Lazy-Chunk) | Ansicht über `cube.v2`: Größen-Schalter (Temperatur, Wind, Böe, Regen, Wolken, Taupunkt), je Stunde Band p10–p90 + Strich p50 auf EINER Skala je Größe, p50-Zahl, Konfidenz-Index; Flags je Schritt als Marken (Anker, interpoliert, Naht, unter Modellfläche, Radar-Rückfall, …), Tagestrenner; **Klimatologie-Schwanz** hinter einer eigenen Regel („Ab hier trägt kein Modell mehr — nur die Klimatologie (Prior), keine Vorhersage im engeren Sinn"), blass; interpolierte Stunden gestrichelt. Tippen öffnet die Stunde: p10/p50/p90, Mittel/σ, σ-Art, Konfidenz mit Schärfe/Einigkeit/Lage, Member-Tabelle (Gewicht, Wert, Lauf · Alter), Flag-Erklärungen. „Herkunft und Setzungen": h_true mit Herkunft (inkl. `hTrue:station`, E-F-12), Gelände, Läufe, Station, Radar, **jede `set`-Setzung benannt**. Marken oben: „buscosun Fusion · Cube · Test", **„vorläufige Bandbreite"** (solange die Kalibrierung `set` ist), „erste Darstellung · t2/t3 folgen", „Anker folgt", „Radar folgt". Export `PfLog`: Ausgaben mit Zeit und offenen Produkten, Lesen/Kern/erste, Rechnung/Ausgabe/gesamt, `doneAt` je Produkt, Dateien/Bytes/Ausweichwege/404, Anteil aus dem HTTP-Cache (`PerformanceResourceTiming`; „x-cache im Browser nicht lesbar" steht dabei), Notizen/Skips/Fehler |
| `src/pointForecast/pointForecastBands.css` **neu** (Lazy-CSS) | `pfb-*` mit den Command-Deck-Token (Sand/Ink/Terracotta, Fallback-Farben); **mobil nur per `@media (max-width: 767px)`**: Zeilen, Größen-Schalter und Aufklapper ≥ 44 px, Abstand für `env(safe-area-inset-bottom)` |
| `budget.json` | `totalJs` 1 372 → **1 430** KB (IST 1 424,1; Begründung im Eintrag): der Cube-Pfad hat mit AP11 zum ersten Mal einen Verbraucher im App-Bau — alles davon lazy |
| `scripts/verify-point-client.mjs` | (8) Textsonde umgestellt: Punkt-Module und AP12-Marken **nur in den Lazy-Chunks `cubeSource`/`PointForecastBands`/`decodeWorker`**, nie im Start-Chunk (alles, was `index.html` lädt) und nie im MapView-Chunk; Gegenprobe: im Cube-Chunk stehen sie. (10m) neu, drei Prüfungen: Schalter `pf` (4 Cube-, 10 Live-Fälle inkl. `Cube`, `cube2`, `%20cube`), Schalter `pflog`, Live-Aufruf unverändert + Cube nur per dynamischem Import |

`src/MapView.tsx` ist von AP11 **nicht** berührt (der Diff dort gehört der Nebenlinie HZ1); das Panel sitzt im MapView-Chunk, deshalb wächst der um den Schalter.

#### 9.15.3 Messungen und Belege

**Bundle** (gzip, Kontrollbau gegen den Vorher-Bau `scratchpad/dist-before`, `scratchpad/chunkdiff.mjs`): eagerJs **107,9 unverändert**, eagerCss 2,4 unverändert, largestChunk 301,2 (FireRoute, unberührt). Neu und lazy: `cubeSource` **47,2 KB** (Leser, Cube-Pfad, PAP-Module, Ausgabe), `PointForecastBands` 4,9 KB JS + 1,6 KB CSS, `decodeWorker` 3,9 KB; `MapView` 78,2 → 79,2 KB (+0,9: Schalter, Tab, Cube-Zweig; im Baum liegt auch HZ1); totalJs 1 366,6 → **1 424,1** KB. Ohne `?pf=cube` lädt keiner der drei neuen Chunks (Textsonde (8): kein Punkt-Modul außerhalb der Lazy-Chunks).

**Ohne Schalter — pixel- und textgleich** (`scratchpad/panelshot2.mjs`: Vorher-Bau gegen Endbau, beide gleichzeitig ausgeliefert, dieselbe URL mit München und `?startnow=0`, je Viewport die drei bestehenden Tabs nacheinander, reine Viewport-Aufnahmen, 2,5 s nach dem Tab-Klick):

| Viewport | Übersicht | Diagramme | Tabelle | Konsole (Fehler + Warnungen) |
|---|---|---|---|---|
| Desktop 1440×900 | **0 px**, Text gleich | **0 px**, Text gleich | **0 px**, Text gleich | 0 / 0 |
| iPhone 12 Pro 390×844 @3× | **0 px**, Text gleich | Text gleich; **0 px im Panel** (158 px = Minutenziffer der Zeit-Deck-Uhr, s. u.) | Text gleich; **0 px im Panel** (dieselben 158 px) | 0 / 0 |

Werkzeug-Kontrollen: **A/A** (Vorher gegen Vorher, 0,9 s nach dem Klick) Desktop 0 / 2 / 1 px — alle in der Tab-Leiste (x 3 bzw. 311, y 68–113: der Übergang des aktiven Tabs), deshalb 2,5 s Wartezeit; **Negativkontrolle** (B mit `&pf=cube`): alle sechs Aufnahmen verschieden (Text ungleich; 25 699 … 70 343 px bzw. andere Höhe). Zwei Läufe fielen aus Gründen außerhalb des Codes auseinander und sind als solche belegt: Übersicht 692 px, weil A und B die Minute wechselten („Geladen 10:29" gegen „10:30 UTC"); mobil 1 476 … 38 659 px, weil zwischen A und B eine neue DWD-Messung ankam (2,2 → 2,3 m/s, 97 → 100 %, Text entsprechend verschieden). Im Endlauf (Endbau, zweimal wiederholt) liegen die einzigen mobilen Abweichungen bei **x 454–471, y 957–980** in Diagramme und Tabelle — die letzte Minutenziffer der Uhr „JETZT · FR 12:5x" des Zeit-Decks, das im Viewport über dem unteren Rand des Sheets liegt und deshalb im Ausschnitt steht; der vorige Lauf auf dem Bau davor (ohne `pfFlags.ts`, sonst gleich) hatte mobil 0 / 0 / 0 px.

**Mit Schalter** (`?pf=cube&pflog=1&startnow=0`, München, Endbau; Bildschirmfotos und `report.json` unter `audit/fusion-implementierung/ap11/`: `{desktop,mobile}-cube-{overview,bands,bands-detail,tail}.png`):

| | Desktop 1440×900 | iPhone 12 Pro 390×844 @3× |
|---|---|---|
| Ausgaben laut `pflog` (ab Effekt-Start) | first 1 460 ms (45 h, offen t2+t3+Anker) · core 1 802 ms (337 h) · update 4 107 ms | first 1 438 ms · core 1 836 ms · update 2 594 ms |
| Zeilen „Bandbreite" | 337 (75 interpoliert, 5 Klimatologie) | 337 (75 / 5) |
| Tabs · Zeilen · Größen-Schalter | 44 · 35 · 23 px (Desktop, feiner Zeiger) | **44 · 44 · 44 px** |
| Klimatologie-Regel sichtbar · waagerechtes Überlaufen | ja · nein | ja · nein |
| Konsole | 0 Fehler, 0 Ausnahmen | 0 Fehler, 0 Ausnahmen |

Die Zahl interpolierter/Klimatologie-Stunden hängt an der Uhrzeit (früherer Lauf 80 / 17). Kein Neustart der Anfrage in 6 Läufen über je 20 s (Cube und live je 3, `scratchpad/rerun-probe.mjs`, Markierung am Panel-Element überlebt, gewählter Tab bleibt). **Nebenbei gemessen** (dieselben 6 Läufe, ungedrosselt, lokaler Server, derselbe Browser-Prozess — richtungsweisend, keine Gate-Messung): Panel sichtbar nach **1,3 / 1,8 / 2,1 s mit `?pf=cube`** gegen **4,5 / 5,3 / 4,6 s live**.

**Gates (Endbau, Verifier einzeln nacheinander):** `typecheck` 0 · `verify:point-client` **132/132** (129 + 3 aus (10m)) · `verify:pv-cube` **230/230** (von AP11 unberührt; im ersten Lauf (4) rot mit 133 ms, während die Bildschirmfotos liefen — allein 38,1 ms, die bekannte Kostenfalle) · `verify:pv-fusion` **227/227** · Build **241/241** · Budget grün (eagerJs 107,9 / 107,9, totalJs 1 424,1 / 1 430).

#### 9.15.4 Befunde

- **V-FI-51 — behoben (Anzeige):** `members[].weight` in v2 mischt zwei Ebenen — die Quellen teilen die Modellkombination unter sich auf (zusammen 100 %, `onWeights`, normiert), die Klimatologie trägt `1 − β` (`fuse.ts`: μ = Klima + β·Anomalie). Im Panel stand „Cube t1 41 % · Station 59 % · Klimatologie 11 %" (Summe 111 %). Jetzt: „11 % (1 − β)" und ein Satz unter der Tabelle. Für die Doku des Formats (§2) und den Kodierer (Stufe 3): die Semantik bleibt, sie muss nur benannt sein.
- **V-FI-52 — Messfalle (Werkzeug):** `Page.captureScreenshot` mit `captureBeyondViewport: true` vergrößert den Viewport kurz; danach war im Desktop-Lauf die Anfrage neu gestartet (nur noch „update 433 ms" im `pflog`) und der Klick auf „Bandbreite" verloren. Mit reinen Viewport-Aufnahmen in 3 von 3 Läufen stabil. Außerdem: die Tab-Leiste braucht nach einem Klick > 0,9 s bis zum ruhigen Bild (A/A-Kontrolle). Beides ist in `panelshot2.mjs`/`cubeshots.mjs` berücksichtigt.
- **V-FI-53 — offen, Jans Entscheidung (Bestand):** das Panel ist in der Produktion unsichtbar (`START_NOW_ONLY`, 9.15.1 Nr. 2) ⇒ `?pf=cube` wirkt heute nur zusammen mit `?startnow=0`. Für einen Test auf dem Gerät: `…/wetterkarte/temperatur/muenchen?startnow=0&pf=cube&pflog=1`.
- **V-FI-54 — offen (kosmetisch):** die Member-Tabelle zeigt die Lauf-Kennungen roh und uneinheitlich („2026091806", Radar „2609181040", INCA „20260918T1015"). Kur-Skizze: im Panel einheitlich „18.09. 06 UTC" formatieren (reine Anzeige).
- **V-FI-50 bleibt offen** (Rechnung ≈ 300 ms am Stück auf CPU 4×): mit `?pf=cube` sehr wahrscheinlich ein Long Task > 200 ms auf einem echten Mobilgerät — betrifft nur den Schalter, Real-Device ist Jans Schritt (§17).

#### 9.15.5 Selbstverifikation und Gate-Urteil

1. **Funktionserhalt, einzeln:** Übersicht, Diagramme und Tabelle ohne Schalter pixel- und textgleich (Desktop und Mobil, oben); Live-Aufruf und 10-min-Auffrischung wörtlich unverändert (Verifier (10m)); Warnungen, Pollen (DWD und Open-Meteo-Opt-in), „Speichern", Link zur Ortsseite, Bottom-Sheet (Wischen, peek/full) nicht angefasst; `sourceMode: 'native'` bleibt auch mit Schalter live; mit Schalter laufen die drei Ansichten auf den Cube-Altfeldern der ersten 24 h weiter. 2. **Desktop pixelgleich:** 0 px in allen drei Tabs, Negativkontrolle schlägt an. 3. **Touch ≥ 44 px (mobil, gemessen):** Tabs 44, Größen-Schalter 44, Zeilen 44; die Aufklapper (`Herkunft und Setzungen`, `Notizen`) per CSS `min-height: 44px`, nicht einzeln gemessen. 4. **Konsole sauber:** 12 Aufnahmen ohne Schalter und 2 mit Schalter ohne Fehler, Warnung oder Ausnahme. 5. **Long Tasks:** in headless-shell nicht messbar (§9.2); nach den Rechenzeiten mit Schalter auf Mobil wahrscheinlich > 200 ms (V-FI-50) — ohne Schalter läuft kein neuer Code.

**Urteil Stufe 2: GRÜN** für den Schalter-Verbraucher (Voreinstellung live, pixelgleich, eagerJs unverändert, alle Verifier grün). Offen und benannt: Real-Device-Lauf mit `?pf=cube` (V-FI-50), Sichtbarkeit nur mit `?startnow=0` (V-FI-53), Umschalten der Voreinstellung erst nach dem AP9-Gate (Jans Entscheidung).

### 9.16 Befunde V-FI-21 · V-FI-17 · V-FI-24 · V-FI-11 (2026-09-18, Kickoff Stufen 3–6)

#### 9.16.1 V-FI-21 — kompakte Kodierung von `PointForecastV2`

**Diagnose (vor dem Code).** (1) Einen Kodierer gab es nicht: `grep` nach `v2codec`, `encodeV2`, `decodeV2`, `compact` — nur die Ganzzahl-Kodierung des Archivs (`encodeValue`/`encodeSeries` mit `SENTINEL`, `scripts/punktarchiv/lib/punktarchiv.mjs`, für die Ebenen und den Live-Pfad; die AP9-Session schreibt den Cube-Pfad noch nicht mit). (2) Wohin die Bytes gehen (Fixture aus `verify:pv-cube`, `scratchpad/v2sizes.mjs`): v2 stündlich **1 140 KB JSON / 94 KB gz** (nativ 102 Schritte 482 / 45 KB); die rohen Verteilungsparameter (16-stellige Doubles) sind mit 36 KB gz der größte Posten, dann die Member je Größe (13 KB gz), je Größe p10…σ (je 11–15 KB gz). An echten Punkten (unten) 1 156 KB / **117 KB gz** — 405 Punkte als v2-JSON wären **46 MiB je Slot**, das 2,6-Fache des ganzen heutigen Slots (≈ 18 MiB).

**Umgesetzt — `src/pointForecast/fusion/v2codec.ts` (neu, rein, ohne Abhängigkeit außer `dist.ts`/`output.ts`), `encodeV2` / `decodeV2` / `compareV2`:** ein JSON-Objekt aus Ganzzahl-Spalten, das AP9 ins Slot-JSON legen kann:

| Teil | Kodierung | Rundweg |
|---|---|---|
| p10/p50/p90/Mittel/σ ohne Verteilung (interpolierte Stunden, Werte ohne σ, Richtung, P(Schnee)) | Ganzzahl auf der Ausgabe-Skala (= Ebenen-Skala, `OUTPUT_SCALE`): p50 und σ delta-kodiert, p10/p90/Mittel als Abstand zu p50 | exakt (derselbe Double) |
| … mit Verteilung | sie SIND ihre Lesart (`output.ts`): gespeichert wird der Rest gegen dieselbe Lesart der DEKODIERTEN Verteilung — fast immer 0 | exakt |
| Verteilung | Familie als Enum; Parameter quantisiert (`PARAM_EXTRA_DIGITS`, set): Lage auf der Ausgabe-Skala, Streuung eine Stelle feiner, Log-Raum und Wahrscheinlichkeiten 1e-4; nicht-endliche Parameter (offene Grenze) in einer dünnen Liste | **≤ ½ Schritt** (verlustbehaftet, benannt) |
| Konfidenz | 0,001: Faktoren delta-kodiert, `score` als Rest gegen r3(spread·agree·lage) (PAP 6: der Score IST das Produkt) | exakt |
| Member des Schritts | statischer Teil einmal (Tabelle); Alter als Rest gegen seine Ableitung (Lauf → Gültigzeit auf 0,1 h, sonst die Vorlaufzeit), Radar-Einträge als Tabellen-Index, Anker als Spalten auf 1e-4 | exakt; **Ankerzahlen ≤ ½ Schritt** (benannt) |
| Member je Größe | geordneter Member-Satz je Schritt als Index; Gewicht (0,001) und Wert (Ausgabe-Skala; Ankerzuschlag 0,001 dünn daneben) als eine delta-kodierte Spalte je Quelle; gleiche Sätze und Gewichte ⇒ Verweis (rh → td2m, clcm/clch → clcl) | exakt |
| Flags, Stufen, σ-Arten, calib je Größe | Index in Tabellen der vorkommenden Listen (Reihenfolge erhalten) | exakt |
| Achse, Punkt, Provenienz, Zeiten | einmal, wörtlich; Gültigzeiten als Abstände; Legende und Einheiten als Verweis, solange sie den **registrierten** Texten gleichen (ein geänderter Text reist wörtlich — ein Archiv dekodiert immer zu dem Text, mit dem es geschrieben wurde) | exakt |
| Schutz | FNV-1a 32 über den Körper; Kodierer verweigert Werte neben ihrer Skala statt still zu runden | — |

**Wie die Größe entstand** (je Schritt gemessen, verworfenes benannt; Fixture stündlich gz / echter Punkt München gz): Spalten + Enums 33,0 / 45,1 KB → Member-Spalten je Quelle + Verweise 25,6 / — → Differenzen zweiter Ordnung **schlechter** (28,3, verworfen) → Alter als Rest, Radar-Tabelle, Anker-Spalten — / 38,7 → Quantile als Rest der Lesart + Parameterstellen (sechs Varianten gemessen: 36,2 … 37,6, gewählt die zweitkleinste mit 1e-4 im Log-Raum für den Niederschlag) — / 36,3 → Konfidenz-Score als Rest 24,2 / **35,0**.

**Gemessen an echten Punkten** (18.09. 11:18 UTC, `audit/fusion-implementierung/v2codec/messung-echte-punkte.mjs` über Netz: jsDelivr, S3-Gelände, Messungen, Radar; Ergebnis `…/2026-09-18-echte-punkte.txt`):

| Ort | Schritte (nicht interpoliert) | v2 JSON / gz | kompakt JSON / gz | nur native Schritte (105) gz | Rundweg |
|---|---|---|---|---|---|
| München | 337 (261) | 1 227 / 123,9 KB | 739 / **35,0** KB | 17,9 KB | 0 Abweichungen; Verteilung ≤ ½ Schritt (5 831 Parameter), Anker ≤ ½ (630) |
| Zugspitze | 337 (261) | 1 225 / 125,9 | 741 / 34,7 | 17,6 | 0; 5 825; 525 |
| Hamburg | 337 (261) | 1 241 / 126,1 | 662 / 34,9 | 17,6 | 0; 5 785; 630 |
| Wien | 337 (261) | 1 232 / 124,4 | 662 / 34,7 | 17,4 | 0; 5 831; 630 |
| Zürich | 337 (**106**) | 844 / 87,7 | 682 / 31,1 | 14,8 | 0; 2 576; — (kein Anker) |
| Berlin | 337 (261) | 1 241 / 124,4 | 663 / 34,9 | 17,5 | 0; 5 785; 630 |
| **Mittel** | | 1 156 / 117,4 | 691 / **34,2** | **17,1** | |

**Archivwachstum je Slot** (die sechs Punkte gemeinsam gzippt wie in einem Slot, je Punkt: v2 117,1 · kompakt stündlich **34,1** · nur native Schritte **16,8** KB) ⇒ bei 405 Punkten **stündlich 13,5 MiB je Slot (+75 % auf die heutigen ≈ 18 MiB), nur native Schritte 6,6 MiB (+37 %)**; als v2-JSON wären es 46,3 MiB. Welche Form AP9 ablegt, ist eine Abwägung für Jan (E-U-13, Archivgröße): stündlich trägt die Stationsstunden (MOSMIX füllt 156 Stunden zwischen den Cube-Schritten) und die interpolierten Stunden mit; nativ trägt alles, was der Cube selbst rechnet. Weitere ≈ 30 % (Gewicht und Wert je Member und Größe, 10,6 KB von 35) fielen weg, wenn die Attribution nicht gebraucht wird — nicht eingebaut: eine v2 mit weniger Schritten ist weiter eine v2 (der Sammler filtert vor dem Kodieren, wie die Messung „nur native"), das Weglassen von Member-Daten wäre eine eigene, benannte Option.

**Zeit (Node, Fixture stündlich):** kodieren ≈ 40 ms, dekodieren ≈ 30 ms (Lesart der Verteilungen neu gerechnet; Rice-Quantile per Bisektion) — für den Sammler (405 Punkte ≈ 16 s) und den Bewerter ohne Belang.

**Verifier — `verify:pv-cube` (17), acht Prüfungen, netzfrei:** Rundweg stündlich mit Radar und Anker (337 Schritte, alle fünf Member-Arten; 0 Abweichungen, Verteilung ≤ ½ Schritt über 5 802 Parameter, Anker ≤ ½ über 306) · Rundweg nativ · über den JSON-Text · **Negativkontrolle Prüfsumme** (eine gekippte Ziffer in der t2m-Verteilung, falsche Prüfsumme, fremde Version, fremdes Objekt ⇒ verweigert) · **Negativkontrolle des Vergleichers** (p50 um einen Schritt, Verteilung um einen ganzen Schritt, Anker um 2 Schritte, ein Flag mehr ⇒ jeweils gemeldet) · **Negativkontrolle Skala** (t2m p50 = 12,345 ⇒ Kodierer verweigert) · registrierte Texte = die von `output.ts`, Verweis im Normalfall, geänderter Text wörtlich · **Größen-Ratsche** auf der Fixture: stündlich kompakt ≤ 27 KB gz und ≤ 30 % des v2-JSON, nativ ≤ 13 KB gz (gemessen 26,4 KB = 25 % bzw. 11,8 KB; die Fixture mit Radar und Anker ist etwas größer als ohne, 24,2 KB). **`verify:pv-cube` 238/238** (230 + 8). `typecheck` 0; Build 241/241; Budget unverändert (eagerJs 107,9, totalJs 1 424,1) — kein Chunk enthält den Kodierer, die App nutzt ihn nicht.

**Für AP9 (Übergabe):** `import { encodeV2, decodeV2, compareV2 } from '../../src/pointForecast/fusion/v2codec.ts'`; im Sammler `slot.cubePath.byPoint[id] = encodeV2(fc.cube.v2)` (bzw. mit auf `axis.native` gefilterten Schritten), im Bewerter `decodeV2(…)`; `compareV2` meldet exakte Abweichungen und die größte Abweichung in halben Schritten. `V2C_VERSION` = 1; eine neue Legende/Einheit in `output.ts` lässt (17) rot werden, bis sie in `v2codec.ts` registriert ist.

**Befunde:**
- **V-FI-21 — behoben (Kodierer); Einsatz = AP9.** 1 156 → 34 KB gz je Punkt stündlich (−71 %), exakter Rundweg bis auf die benannten Verteilungs- und Ankerzahlen (≤ ½ Schritt).
- **V-FI-55 — offen, Jans Entscheidung (mit AP9, E-U-13):** der Cube-Pfad im Archiv kostet je Slot +13,5 MiB stündlich (+75 %) oder +6,6 MiB nur native Schritte (+37 %); ≈ +4,8 bzw. +2,4 GB/Jahr bei einem Slot je Tag.
- **V-FI-56 — beobachtet, nicht untersucht (für AP9):** in Zürich sind 231 von 337 Stunden interpoliert (DE/AT 76) — keine Station füllt die Stunden zwischen den Cube-Schritten (Member ohne `station`; SMN ist Messung, kein Vorhersageprodukt) — und in beiden Läufen kam kein Anker zustande (im zweiten Lauf mit `smn`-Member). Für die Bewertung heißt das: in der Schweiz ist die stündliche Achse jenseits von 0–48 h überwiegend Interpolation; Stunden mit `interpolated` getrennt auswerten.

#### 9.16.2 V-FI-17 — z0 aus WorldCover, zweistufige Windkorrektur

**Diagnose (Code gelesen, Spiegel gemessen, vor dem Code).**
1. **Was die Korrektur braucht:** `windBlendingFactor(z0Mod, z0True, d0Mod, d0True)` (`fusion/terrainTerms.ts`, AP5, geprüft: Wasser +12 % statt +135 %) ist `null`, sobald EINE Rauhigkeit fehlt; `fuseCubePoint` ruft sie mit `terrainCalib.z0Mod/z0True` (heute beide `null` ⇒ Flag `windBlendingInactive`, calib `z0:null`). Gebraucht werden also **zwei** Rauhigkeiten: am Punkt und die, mit der das Modell seinen 10-m-Wind rechnet. Die zweite ist ein GRIB-Feld (`z0`), das der Cube nicht trägt; der Plan (`ABLAUFPLAENE.md` Glossar: „`z0` — WorldCover → Davenport-Klasse") nennt nur die Punkt-Seite.
2. **Entscheidung (set, benannt):** beide aus derselben Quelle — **z0_true** = log-Mittel der Klassen-z0 (`WORLDCOVER_Z0`, Davenport/Wieringa, `literature`) im Kreis 500 m um den Punkt (die Anströmstrecke des 10-m-Winds, nicht ein 37-m-Pixel); **z0_mod je Stufe** = log-Mittel über die Zellweite der Stufe (t1 0,05°, t2 0,10°, t3 0,25°, um den Punkt) — so sieht ein Modell die Landbedeckung seiner Zelle (die Modelle leiten ihr z0 aus Landnutzungskarten ab). Ohne Orographie-Anteil; `d0_mod = 0`, `d0_true` aus dem Stadt-Raster (wie bisher), z_b = 60 m (AP5). Das GRIB-z0 im Cube wäre die bessere Modellseite (Producer/Schema = S&F, V-FI-58).
3. **Woher die Klassen:** der SHA-gepinnte Spiegel `jppetry/buscosun-worldcover` (SAT2d, V-SAT-15; jsDelivr, eine Ebene 9 000 px ≈ 37 m, 1024²-Kacheln ≈ 38 km, DACH-3°-Kacheln). Gemessen 18.09. (`scratchpad/wcbytes.mjs`, 6 Orte): Kopf-Bereich kalt **1,7–3,6 s** TTFB (MISS — die identity-Variante wärmt niemand, wie V-FI-42), Kachel im Median **≈ 100 KB** (max 156 KB); ein Punkt braucht Kopf + alle Kacheln, die die t3-Zelle schneidet — **1–4 Kacheln, ≈ 120–450 KB** je neuem Ort, danach zeitlos im Cache.
4. **Kritischer Pfad:** auf Mobil-4G ist die Leitung bis zum Kern voll (§9.14.1: ≈ 1,8 MB bei 9 Mbit) — jeder parallele Abruf verlängert den Kern. Deshalb **im progressiven Modus erst mit dem Kern** starten (wie der Anker-Abruf seit AP12) und in der Nachlieferung wirken lassen; im nicht-progressiven Modus (Verifier, Replay) parallel zum Gelände, mit der Frist der späten Produkte. Ohne z0 zur Frist: Korrektur inaktiv, Flag `windBlendingInactive` bleibt, Skip-Notiz nennt den Grund.
5. **Funktionserhalt / Rule 2:** der AP9-Sammler ruft `cubeSource` — seine Ausgabe darf sich ohne Schalter nicht ändern. Deshalb wirkt z0 nur mit `CubeIo.z0` (Voreinstellung aus); `defaultCubeIo()` (Browser, nur hinter `?pf=cube`) schaltet es ein. Ohne z0 byte-gleich (Negativkontrolle im Verifier).

**Plan:** (a) `src/point/client/z0Point.ts` neu — rein: `z0FromClassField(classAt, lat, lon)` (log-Mittel Punktkreis + drei Zellboxen, Klassenanteile, Abdeckung; unter 50 % Abdeckung `null`); Lader: Kopf je 3°-Datei + gebrauchte Kacheln per Bereich aus dem Spiegel, `decodeTile` (SAT-Leser), Ergebnis je Ort (0,001°) und Kachelbytes im Cache-Backend; (b) `readPoint.ts`: `ReadPointOptions.z0`, `bundle.z0`, im progressiven Modus `late.z0` ab dem Kern; (c) `cubeSource.ts`: `CubeInput.z0`, z0_mod je Stufe in den Schritt, calib-Texte mit Herkunft, Nachlieferung rechnet mit z0; `CubeIo.z0`, `defaultCubeIo` an; (d) `output.ts`: `point.terrain.z0` = z0_true statt `null`; (e) Verifier: synthetische Klassenfelder (Wasser in Grasland, Wald in Grasland, Stadt mit d0 gegen offenes Land), Negativkontrolle byte-gleich ohne z0, halbe Rauhigkeit ⇒ inaktiv mit Flag; (f) Latenz-Lab Mobil-4G mit/ohne z0 im selben Lauf.

**Abweichung vom Plan (während der Umsetzung):** z0 hängt nicht im Leser (`readPoint.ts` bleibt unberührt), sondern wie der Anker-Abruf in `cubeSource.ts` — es ist kein Cube-Produkt, braucht den Store nicht, und dort sitzt schon die Logik „nicht-progressiv mit Frist, progressiv ab dem Kern in die Nachlieferung".

**Umgesetzt:**

| Datei | Was |
|---|---|
| `src/point/client/z0Point.ts` **neu** | rein: `z0FromClassField(classAt, lat, lon)` — log-Mittel im 500-m-Kreis (Schritt 40 m) und über die drei Zellboxen (100/200/400 m), Abdeckung, Klassenanteile; unter 50 % bekannter Pixel `null`. Lader `loadZ0AtPoint`: Kopf (16 KB, bei Bedarf mehr) jeder berührten 3°-Datei und die Kacheln der t3-Box per `Range` aus dem SHA-gepinnten Spiegel, `decodeTile` des SAT-Lesers; ein 200 statt 206 (ganze 8-MB-Datei) wird nie angenommen; Ergebnis je Ort (0,001°, Spiegel-Commit im Schlüssel) und Kachelbytes im Cache-Backend (IndexedDB im Browser); `cacheOnly` für den schnellen Blick vor dem Kern |
| `src/pointForecast/cubeSource.ts` | `CubeFusionInput.z0` (optional); `fuseCubePoint`: mit z0 (und ohne `terrainCalib`-Rauhigkeit von außen) `windBlendingFactor(z0Mod[Stufe], z0True, 0, d0)` je Schritt, calib-Text `z0:set — …` mit Werten, Klassenanteilen, Herkunft und V-FI-58; ohne z0 der bisherige Text und die bisherige Rechnung. `CubeIo.z0` (Voreinstellung aus; `defaultCubeIo` an, Cache = IndexedDB), `Z0_DEADLINE_MS` 6 s (set); nicht-progressiv wartet z0 wie die Messung höchstens `OBS_GRACE_MS` nach dem Bündel; progressiv erst Cache-Blick (ein bekannter Ort wirkt schon in der ersten Ausgabe), sonst Abruf ab dem Kern, `pending: z0`, Notiz „folgt", die Nachlieferung rechnet mit z0; `doneAt.z0` |
| `src/pointForecast/fusion/output.ts` | `point.terrain.z0` = z0 am Punkt (1e-5 m) statt fest `null`, nur wenn z0 da ist |
| `scripts/verify-point-client.mjs` | (10n) vier Prüfungen: Grasland konstant 0,03 m überall; See/Wald im Punktkreis bei grasiger Zelle; Negativkontrolle Abdeckung < 50 % ⇒ `null`; Lader ohne Netz (404, 200 statt 206, nur Cache ohne Eintrag ⇒ kein Abruf, Treffer ⇒ `fromCache`) |
| `scripts/verify-pv-cube.mjs` | (18) sieben Prüfungen (unten) |
| `scripts/pv-latency/lab.ts`, `scripts/verify-pv-latency.mjs` | Lab-Option `z0: false`, je Ausgabe `z0` (trägt sie die Korrektur); Szenario `cubez` (mit/ohne z0, je Variante ein frischer Kontext, kalt dann warm) |

**An echten Orten** (Node, Spiegel über jsDelivr, 18.09. 11:29 UTC, `scratchpad/z0real.mjs`; Faktor = `windBlendingFactor` ohne d0):

| Ort | z0 Punkt (Kreis 500 m) | z0 Zelle t1 / t2 / t3 | Faktor t1 / t2 / t3 | Klassen am Punkt | Abruf neu |
|---|---|---|---|---|---|
| München Marienplatz | 0,99 m | 0,73 / 0,69 / 0,42 | 0,95 / 0,94 / 0,88 | bebaut 98 % | 1 Kachel, 122 KB |
| Zugspitze | 0,0037 m | 0,023 / 0,11 / 0,22 | 1,06 / 1,14 / 1,20 | kahl 80 %, Schnee 19 % | 4 Kacheln, 436 KB |
| Hamburg, Außenalster | 0,0006 m | 0,25 / 0,29 / 0,26 | 1,25 / 1,27 / 1,26 | Wasser 87 % | 4, 552 KB |
| Wien | 1,00 m | 0,79 / 0,54 / 0,33 | 0,96 / 0,91 / 0,86 | bebaut 99 % | 4, 367 KB |
| Zürich | 0,49 m | 0,44 / 0,32 / 0,20 | 0,99 / 0,95 / 0,92 | bebaut 82 %, Wald 10 % | 2, 280 KB |
| Bodensee (Mitte) | 0,0002 m | 0,0002 / 0,0008 / 0,011 | 1,00 / 1,02 / 1,09 | Wasser 100 % | 4, 496 KB |
| Erdinger Moos (Acker) | 0,13 m | 0,16 / 0,13 / 0,13 | 1,02 / 1,00 / 1,00 | Acker 81 % | 4, 230 KB |

Zweiter Abruf desselben Orts: 0 Abrufe, aus dem Cache. **Keine Genauigkeitsaussage** — ob die Korrektur den Wind am Punkt besser trifft, misst erst der Backtest (AP9/AP10). Erwartung, nicht gemessen: an Messfeldern (meist Rasen, aber im 500-m-Kreis oft Bebauung/Wald) liegt der Faktor nahe 1 — die Archivpunkte sind Stationen, der Backtest sieht die Korrektur dort also nur schwach.

**Verifier (18), netzfrei:** Negativkontrolle ohne z0 (Feld fehlt, `null`, z0 am Punkt unbekannt) ⇒ Rechnung byte-gleich bis auf die gemessene Rechenzeit (Werte, Flags, calib; Gegenprobe: mit z0 unterscheidet sie sich) · See in Grasland **×1,12** (die einstufige Formel gäbe für dieselbe Paarung ×1,86; der Plan nennt +135 % für seine), Wald ×0,77, Stadt z0 1 m mit d0 9 m ×0,56 < ohne d0 ×0,78 < 1, offenes Land in offenem Land ×1 · das Cube-Member trägt den Faktor (u, v, Böe), die Temperatur nicht, `windBlendingInactive` fällt weg · z0 des Modells je Stufe, fehlt es für t3 ⇒ t3 inaktiv mit Flag · `terrainCalib` von außen hat Vorrang, calib nennt Herkunft · Durchreichen ohne `io.z0` (z0:null, `point.terrain.z0` null), nicht-progressiv mit z0 aus dem Cache, progressiv mit Cache-Treffer schon in der ersten Ausgabe · progressiv ohne Treffer und ohne Spiegel (404): ohne Korrektur, „folgt", `pending` z0, keine erfundene Rauhigkeit · progressiv, z0 später als die Nachlieferung ⇒ eigene letzte Ausgabe mit z0 (die Ausgaben davor ohne). **`verify:pv-cube` 246/246** (238 + 8; ein Lauf unter Last rot an der Kostenprüfung (9) PAP 3 mit 9,0 ms, allein 1,5 ms), **`verify:point-client` 136/136** (132 + 4).

**Latenz — z0 an gegen aus, derselbe Lauf, je Variante ein frischer Kontext** (`--only=cubez`, 10 Orte, ms p50 / p95; „Anker/Radar" = die Ausgabe, in der nur noch z0 offen ist):

| Lauf | Profil | Variante | erste Darstellung | ganzes Fenster | Anker/Radar | letzte Ausgabe | z0 in der letzten | WorldCover |
|---|---|---|---|---|---|---|---|---|
| 1 `latency/2026-09-18T11-37-55-602Z.json` (z0 wartete in der Nachlieferung mit) | mobile-4g | aus | 1 831 / 2 187 | 2 525 / 3 008 | 4 147 / 6 347 | 4 147 | — | — |
| | | an | 1 830 / 2 203 | 2 534 / 2 815 | **5 079 / 8 626** | 5 079 | 9/10 | 38 Abrufe, **38 MISS**, p50 424 KB |
| | desktop-4g | aus / an | 1 675 / 1 684 | 2 312 / 2 291 | 3 797 / 3 743 | | 10/10 | 43 Abrufe, 38 MISS |
| 2 `latency/2026-09-18T11-46-33-698Z.json` (entkoppelt, s. u.) | mobile-4g | aus | 1 851 / 2 181 | 2 521 / 2 869 | 4 201 / 5 944 | 4 201 | — | — |
| | | an | 1 854 / 2 273 | 2 507 / 2 939 | **4 137 / 5 867** | 4 180 | **10/10** | 43 Abrufe, 30 MISS, p50 424 KB |
| | | warm aus / an | 192 / 189 | 376 / 368 | 1 068 / 1 138 | | 10/10 (aus dem Cache) | 0 Abrufe |

**Befund aus Lauf 1 und Kur:** erste Darstellung, Kern und ganzes Fenster blieben gleich (z0 startet erst mit dem Kern), aber die EINE Nachlieferung wartete auf das langsamste Produkt — die WorldCover-Bereiche sind am Edge kalt (MISS, wie V-FI-42), und Anker/Radar kamen auf Mobil-4G **+0,9 s** später. Kur (im Code): z0 reist nur mit, wenn es zur Nachlieferung schon da ist; sonst folgt es als eigene letzte Ausgabe (höchstens `Z0_UPDATE_MAX_MS` = 15 s nach dem Kern, set; Panel-Marke „Windkorrektur folgt"). Lauf 2: Anker/Radar 4 201 → 4 137 ms p50 (−64, im Rauschen), erste Darstellung +3 ms, ganzes Fenster −14 ms — **keine Regression auf Mobil-4G**; z0 kam in 10/10 kalten Läufen (danach aus dem Cache: warm in der ersten Ausgabe). Die Differenzen p95 ±70–90 ms liegen bei n = 10 im Rauschen eines Laufs.

**Panel:** z0 steht im Herkunftsblock (Gelände-Zeile „z0 … m (WorldCover, 500-m-Kreis)") und als `z0:set`-Setzung in der Liste der Setzungen; offen ⇒ Marke „Windkorrektur folgt". Ohne `?pf=cube` unverändert: Pixelvergleich auf dem Bau mit AP11 + V-FI-17 + V-FI-24 alle sechs Aufnahmen 0 px, Text gleich, Konsole leer (`scratchpad/shots-final3`).

**Bundle:** eagerJs 107,9 unverändert; totalJs 1 424,1 → **1 427,0** KB (Grenze 1 430): der Cube-Chunk +2,4 KB, Vite legt `worldCover.ts` jetzt als geteilten Chunk ab (5,2 KB; `FireCogViewer` −4,7 KB — er lädt das Modul nun als eigenen Chunk nach, funktional gleich). Nach Stufe 5/6 und den Panel-Marken: **1 427,6 KB** (Luft 2,4 KB).

**Befunde:**
- **V-FI-17 — behoben (hinter `?pf=cube`):** die zweistufige Windkorrektur wirkt, wo z0 da ist; der Sammler rechnet weiter ohne (Voreinstellung aus).
- **V-FI-57 — offen (gering):** die WorldCover-Bereiche sind am jsDelivr-Edge kalt (Lauf 1: 38/38 MISS, Lauf 2: 30/43) — dieselbe identity-Variante wie V-FI-42, der Spiegel liegt in einem anderen Repo, niemand wärmt ihn. Folge nur: z0 kommt beim ersten Besuch eines Orts spät (eigene Ausgabe), danach aus dem Cache.
- **V-FI-58 — offen (Producer/Schema, S&F):** die Modellseite der Korrektur ist eine Näherung (WorldCover über die Zellweite) — das GRIB-Feld `z0` der Modelle (ICON-D2/EU u. a.) gehört als statische Ebene je Stufe in den Cube (`static/hmodel`-Muster, einmal je Quelle), dann fällt die Näherung weg. Ohne Orographie-Anteil bleibt sie an Gipfeln fragwürdig (Zugspitze: Faktor 1,06–1,20 durch Rauhigkeit allein; der Gipfelwind hängt vor allem an der Umströmung, die kein Term abbildet).

#### 9.16.3 V-FI-24 — Höhe von außen im Live-Pfad (`getPointForecast({ elevationM })`)

**Diagnose (Code gelesen).** Der Live-Pfad nimmt die Höhe des Abfragepunkts aus dem DEM (`loadElevationLookup`, Terrarium z9 ≈ 150 m je Pixel, `terrain.elevationM`) und nutzt sie an vier Stellen: Stationsgewichte und Anker-Qualitätsprüfung (`spatialWeight(Distanz, |Δh|)`), die Höhenkorrektur jedes Samples im Blend (`blendVariable`, Lapse), buscosun Fusion (`computeDistributions`: Klimatologie `clima.sample(…, elevationM)` und Kontext) und `query.elevation`. Eine Höhe von außen gab es nicht (PA3: an 31 Archivpunkten DEM > 50 m unter der Station; Zugspitze DEM 2 829 statt 2 962 m).

**Umgesetzt** (`src/pointForecast/pointForecast.ts`): `PointForecastOptions.elevationM?: number | null` — endlich ⇒ ersetzt die DEM-Höhe an allen vier Stellen (eine Zuweisung: `elevation = elevationIn ?? terrain.elevationM`); die Geländeform (Senke, Hang, `demSample`) bleibt vom DEM. `pfCacheKey(…, elevationM)` hängt `:h<Höhe>` an — ohne Höhe Zeichen für Zeichen der alte Schlüssel. Nur der Live-Pfad liest das Feld (der Cube-Pfad hat E-F-12).

**Verifier — `verify:pv-fusion` eine neue Prüfung (Ende zu Ende, gestubbtes `fetch`: nur BrightSky antwortet mit einer MOSMIX-Station Zugspitze 2 964 m / 2 °C, Gelände 404 ⇒ DEM 0 m):** ohne Höhe (Feld fehlt, `null`, `NaN`) byte-gleich (bis auf `fetchedAt`; die drei Aufrufe mit getrennten Cache-Schlüsseln, sonst wäre die Gleichheit ein Cache-Treffer) und Schlüssel unverändert; mit `elevationM: 2964` `query.elevation` 2 964, T(+0 h) ≈ 2 °C statt +19 K Lapse-Sprung, Schlüssel `:h2964`. **`verify:pv-fusion` 228/228** (227 + 1). An der echten Zugspitze (nach V-FI-11): T(+0 h) 2,8 °C auf DEM-Höhe, **1,9 °C mit `elevationM: 2962`** = der MOSMIX-Wert der Gipfelstation.

**Übergabe an AP9 (nicht in dieser Session geändert, `scripts/punktarchiv/**` gehört AP9):** in `scripts/punktarchiv/collect.mjs` Zeile 461 im Aufruf `getPointForecast({ … })` **`elevationM: p.elev,`** ergänzen (ebenso Zeile 570 im Vergleichslauf, falls er dieselbe Höhe prüfen soll); den Hinweistext Zeile 451 („der Live-Pfad rechnet mit SEINER DEM-Höhe …") anpassen und die B5-Grundlinie ab dem Slot mit dem neuen `codeHash` getrennt auswerten.

#### 9.16.4 V-FI-11 — Zugspitze +0 h zu warm im Live-Pfad (Diagnose, Leserfehler behoben)

**Diagnose in der Reihenfolge des Auftrags** (Node mit den Shims des Archivs — importiert, nicht geändert; `scratchpad/zugspitze.mjs`, 18.09. 11:54 UTC):
1. **Welche Station trägt:** der Live-Pfad meldete an diesem Tag **+0 h 17,2 °C** (MOSMIX Zugspitze 2 °C). Der Blend bei h = 0 ist allein die ko-lokalisierte `dwd_obs`-„Zugspitze" (0 km, 2 956 m, Gewicht 3,56 — alle anderen < 0,03): ohne sie 2,84 °C. Sie meldete **16,4 °C auf 2 956 m**. Die Rohantwort von BrightSky `/current_weather` (`lat=47.421&lon=10.985`): `source_id` 273006 Zugspitze, `temperature: 16.4`, **`fallback_source_ids.temperature: 11857` = Garmisch-Partenkirchen, 719 m** (ebenso Feuchte, Niederschlag). BrightSky füllt Größen, die einer Station fehlen, aus Nachbarstationen; `src/sources/brightSkyCurrent.ts` las `sources[0]` als Station und nahm jede Größe ungeprüft — **der Garmischer Talwert stand an der Gipfelhöhe**.
2. **Anker:** bei h = 0 unberührt; ab h = 1 trug die Innovations-Persistenz den falschen Versatz weiter (+1 h 6,3 °C, klingt ab — daher „drei Stunden später beide bei 0,6/2,8 °C" im ursprünglichen Befund).
3. **DEM-Höhe:** 2 829 statt 2 962 m (−133 m ⇒ +0,9 K) — Nebenposten, mit V-FI-24 abstellbar.
4. **Lapse:** Standard 6,5 K/km (die Regression fällt mangels Stützen auf den Prior) — kein Anteil.
Der Befund vom 16.09. (12,67 °C) ist mit sehr hoher Wahrscheinlichkeit derselbe Mechanismus; rückwirkend belegen lässt er sich nicht (`/current_weather` ist eine Momentaufnahme).

**Wie verbreitet** (`scratchpad/fallbackeffect.mjs`, dieselben Live-Antworten einmal wie gesendet, einmal ohne `fallback_source_ids` = der alte Leser): um München tragen **14 von 20** Antworten geborgte Messgrößen, um die Zugspitze **15 von 20** — im Flachland meist aus einem Nachbarn ähnlicher Höhe (Holzkirchen-Wind aus Bichl, Vilsbiburg-Wind vom Flughafen), im Gebirge mit großen Höhensprüngen (Zugspitze ← Garmisch 2 237 m tiefer, Ramsau 1 088 m ← Schönau 625 m, Kreuth 897 m ← Bichl 630 m).

**Behoben — ein reiner Leserfehler (`src/sources/brightSkyCurrent.ts`):** die Station ist `weather.source_id`; jede Größe gehört der Station, die sie gemessen hat (`fallback_source_ids`) — die angefragte Station bekommt nur ihre eigenen Werte, ein geborgter Wert erscheint als Punkt SEINER Station (Lage, Höhe aus `sources`), wenn diese keine eigene Antwort hatte. Nichts wird verworfen, nichts erfunden. **Negativkontrolle** (`verify:pv-fusion`, echte Antwortform vom 18.09. 11:30 UTC): mit `fallback_source_ids` ⇒ Zugspitze ohne Temperatur/Feuchte/Niederschlag, aber mit eigenem Wind und Böe; Garmisch als eigener Punkt auf 719 m mit 16,4 °C; Station = `source_id` auch bei umgekehrter Reihenfolge der Quellen; **ohne** `fallback_source_ids` ⇒ ein Punkt, 16,4 °C an der Zugspitze (das alte Verhalten). **`verify:pv-fusion` 229/229.** Nachher an der echten Zugspitze: **+0 h 2,8 °C** (DEM-Höhe) bzw. 1,9 °C (Stationshöhe), +1 h 2,9 statt 6,3 °C.

**Was sich am Live-Produkt ändert (Jans Gate):** der Leser speist den Live-Punktpfad (`fetchNearestStationObs`) und die Rasterfusion der Karte (`loadFusedForecast`). Messwerte stehen jetzt an der Station, die sie gemessen hat — an Bergstationen eine große Korrektur, im Flachland eine kleine Verschiebung. Gemessen am Panel ohne Schalter (München, Endbau gegen den Bau vor AP11): nur Datenunterschiede — Lapse 6,73 → 6,50 K/km, T(+0 h) 18,8 → 18,5 °C, Wind 2,9 → 3,4 m/s, die UI ist unverändert (vor diesem Fix 0 px). Kein Schalter: ein Leser, der Werte an die falsche Höhe schreibt, hat keine richtige zweite Stellung — deshalb als eigener Commit, den Jan getrennt freigibt oder zurückhält (§17).

**Befunde:**
- **V-FI-11 — Ursache gefunden, Leser behoben** (s. o.).
- **V-FI-59 — offen (gering):** dieselbe Klasse in `/weather` (Stundenwerte, Historie und MOSMIX): an der Zugspitze kommen Niederschlag aus Zugspitzplatt (2 420 m) und Druck aus Garmisch; `brightSkyEntryToHour` liest `fallback_source_ids` nicht. Die Temperatur war dort eigen; Niederschlag wird nicht höhenkorrigiert — kleiner Effekt, gleiche Kur möglich.
- **V-FI-60 — offen (Live-Pfad, Jans Entscheidung):** `fetchNearestStationObs` nimmt die 6 nächsten Stationen unabhängig davon, welche Größe sie tragen; seit V-FI-11 stehen dort auch Teil-Punkte (nur Wind) — um München sinkt die Zahl der Temperatur-Messungen unter den sechs von 6 auf 3, an der Zugspitze auf 2, die Lapse-Regression (≥ 5 Stützen) fällt auf 6,5 K/km zurück. Kur-Skizze: die nächsten Stationen je Größe wählen (Temperatur/Lapse aus den nächsten mit Temperatur, Wind aus denen mit Wind).
- **V-FI-61 — nicht geprüft:** die Rasterfusion der Karte (Temperatur-Layer im Fusionsmodus) bekommt dieselbe Korrektur; visuell nicht verglichen — an Gipfelzellen der Alpen sollte die warme Delle verschwinden. Jans Sichtprüfung.

#### 9.16.5 Selbstverifikation (Stufen 3–6) und Gates

1. **Funktionserhalt:** der Kodierer steht in keinem App-Chunk (Suche nach `buscosun-v2c` im Bau: 0 Treffer); z0 wirkt nur mit `CubeIo.z0` (ohne byte-gleich, (18)); `elevationM` ungesetzt byte-gleich (pv-fusion); V-FI-11 ändert Live-Werte **absichtlich** (Commit B), entfernt nichts — jeder Messwert bleibt, er steht nur an seiner Station. 2. **Desktop pixelgleich:** ohne Schalter 0 px in allen sechs Aufnahmen bis einschließlich V-FI-24 (`shots-final3`); nach dem Leser-Fix nur Datenunterschiede (Textvergleich: Lapse, T, Wind). 3. **Touch:** keine neuen Bedienelemente (die Marke „Windkorrektur folgt" ist Text). 4. **Konsole:** 0 Fehler/Warnungen in den Pixelläufen. 5. **Long Tasks:** nicht messbar in headless-shell; z0 rechnet ≈ 8 000 Klassenabfragen und inflatet 1–4 Kacheln über `DecompressionStream` (asynchron; WorldCover ohne Predictor, also keine Pixelschleife) — klein gegen die Fusionsrechnung (V-FI-50).

**Gates Endstand (18.09. ≈ 12:05 UTC, Verifier einzeln):** `typecheck` 0 · `verify:point-client` **136/136** · `verify:pv-cube` **246/246** · `verify:pv-fusion` **229/229** · `verify:punktarchiv` **103/103** (unberührt, der Sammler ruft `cubeSource`/`pointForecast`) · Build **241/241** · Budget grün: eagerJs 107,9, eagerCss 2,4, largestChunk 301,2, **totalJs 1 427,6 / 1 430**.
