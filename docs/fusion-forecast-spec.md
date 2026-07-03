# Technische Spezifikation — buscosun Fusion Forecast

> Stand: 2026-07-01 · Quellcode: `src/fusion/`, `src/sources/`, `src/countryProfiles.ts`
> Diese Spec beschreibt das gridded Fusions-Vorhersagesystem, das die 2D-Karten-Layer
> (Temperatur / Wind / Wolken / Niederschlag) speist. Rein clientseitig, kein Backend.

---

## 1. Zweck & Grundidee

Der Fusion Forecast nimmt **mehrere heterogene Wetterquellen** (Vorhersagemodelle +
Live-Stationsmessungen), die als unregelmäßige Punkt-Stichproben unterschiedlicher
Dichte, Auflösung und Vorhersagelänge vorliegen, und verschmilzt sie zu **einem
dichten, regelmäßigen Gitterfeld pro Vorhersagestunde**. Jede Stunde wird als Satz von
PNG-Texturen kodiert, die die WebGL-Layer der Karte direkt als GPU-Textur nutzen.

Kernprinzip: **Quellen sind additive Information.** Es gibt kein „bestes Modell", sondern
eine gewichtete Kombination — Live-Messungen dominieren Stunde 0, Modelle tragen den
Vorhersagehorizont, alpine Spezialmodelle verbessern die Bergregionen. Höhenkorrektur und
Glättung machen aus groben NWP-Gittern ein Feld mit Tal-Grat-Struktur.

**Deterministisch & pur:** kein LLM, keine externen Compute-Dienste. Meteorologie in
getesteten Modulen; das System rechnet, es „schätzt" nicht sprachlich.

---

## 2. Datenmodell

Alle Quellen normalisieren auf einen gemeinsamen Typ (`src/sources/openMeteoForecast.ts`):

```
ForecastGrid {
  cols, rows           // nominale Gitterdimension
  bounds               // lng/lat-Rechteck
  times: Date[]        // Zeitstempel je Vorhersagestunde (UTC, aufsteigend)
  points: Point[][]    // points[h][k], k = j*cols + i  (j=0 → Süden, i=0 → Westen)
}

ForecastHourPoint {
  temperature          // 2 m, °C
  u, v                 // Wind 10 m, m/s (Ost- / Nordkomponente)
  gust?, relativeHumidity?
  cloudLow/Mid/High    // 0..100 %
  precipitation        // mm in dieser Stunde
  model                // Modellname je Punkt (icon_d2, arome, …)
  lat?, lng?, elev?    // gesetzt bei unregelmäßigen Punktlisten (Stationen);
                       // dann werden diese statt der Gitter-Ableitung genutzt
}
```

Der entscheidende Punkt: Ein Punkt kann entweder ein **Gitterpunkt** (lat/lng aus
`bounds` abgeleitet) oder eine **Station** (`lat/lng/elev` explizit) sein. Stationen mit
`elev` fließen zusätzlich in die Lapse-Rate-Regression ein.

---

## 3. Quellen & Länderprofile

### 3.1 Quellen-Adapter (`src/sources/`, `src/wind/`)

| Quelle | Adapter | Typ | Abdeckung / Horizont |
|---|---|---|---|
| DWD MOSMIX (via BrightSky) | `brightSkyForecast` | NWP-Punktvorhersage (ICON-EU bias-korrigiert) | DE-Backbone, 24 h |
| DWD Live-Obs (via BrightSky) | `brightSkyCurrent` | Stationsmessung | ~1500 Stationen, nur h=0 |
| GeoSphere AROME | `geosphereArome` | NWP 2,5 km | AT/CH/Süd-DE, +60 h |
| GeoSphere INCA | `geosphereInca` | Nowcast 1 km | AT, ~3–4 h |
| GeoSphere TAWES | `geosphereTawes` | Stationsmessung | AT, nur h=0 |
| MeteoSwiss SMN | `meteoSwissSmn` | Stationsmessung | CH, nur h=0 |
| Open-Meteo best_match | `openMeteoForecast` | NWP (auto-routing) | **Opt-in**, non-commercial |
| SMHI / DMI / IPMA | `*Stations` | Stationsmessung | **hart deaktiviert** (außerhalb DACH) |

**Default-Pfad ist DWD-only + GeoSphere/MeteoSwiss** (alle CC-BY 4.0 / unbegrenzt).
Open-Meteo ist optional (`useOpenMeteo`) — Free Tier ist rate-limitiert und
non-commercial; bei HTTP 429 wird stillschweigend auf DWD-only zurückgefallen.

### 3.2 Länderprofile (`src/countryProfiles.ts`)

Ein `CountryProfile` bindet ein Land an seinen Quellen-Stack (Boolean-Flags `use*`) und
setzt `forecastHours`. Wichtig: Das Fusions-Gitter wird **immer über den gemeinsamen
DACH-Ausschnitt** `DACH_VIEW.bounds = {lng 5,5–17,5 · lat 45,5–55,5}` gerechnet, damit
DE/AT/CH stets durchgängig sichtbar sind — unabhängig davon, in welchem Land gesucht wurde.
Das Profil steuert primär den **Punkt-Forecast-Mix**; fürs Gitter sind bei allen drei
Ländern nahezu alle Quellen aktiv (Cross-Border-Bleeding via IDW).

- **DE**: MOSMIX + DWD-Obs + AROME + TAWES + SMN; kein INCA (bbox nur AT); 24 h.
- **AT**: AROME + INCA + TAWES + MOSMIX + DWD-Obs; 60 h.
- **CH**: AROME + SMN + MOSMIX + DWD-Obs; kein INCA; 60 h.

---

## 4. Orchestrierung (`loadFusedForecast.ts`)

Öffentliche Signatur: `loadFusedForecast(options): Promise<DwdForecastResult>`.

### 4.1 Ablauf

1. **Profil auflösen** (default DE), `hours`, Gitterdimension (`denseCols×denseRows`,
   default 160×128), `modelChoice` (default `'fusion'`), `quickMode`.
2. **Result-Cache prüfen** (`fusedResultCache`, s. §4.3) → Treffer = Sub-100-ms-Antwort.
3. **DEM laden** (`getElevation`, einmalig, permanent gecacht) und in die Engine stecken.
   Fehlschlag ist non-fatal → Temperatur fällt auf reines IDW ohne Höhenkorrektur zurück.
4. **Quellen-Gates** aus `modelChoice` × Profil-Flags bilden. `modelChoice ≠ 'fusion'`
   isoliert genau eine Quelle (Transparenz-Feature „Modell"-Selektor der UI).
5. **Optional Open-Meteo** (best_match, + optional ICON-D2-DACH-Bias).
6. **Parallele Fetches** aller aktiven Quellen via `Promise.all` (jede einzeln
   `.catch(()=>null)`, jede über `getCachedSource`). Cold-Load = **Max** statt Summe der
   Latenzen.
7. **Ingest in Deklarationsreihenfolge** mit den Gewichtsmatrizen (§4.2).
8. `engine.run()` → dichtes Feld + PNGs.
9. **Modell-Label** bauen (`Buscosun Fusion (mosmix + dwd_obs + …)` bzw. Einzelmodellname).
10. Ergebnis cachen und zurückgeben.

### 4.2 Gewichtsmatrix (fusion-Modus)

Gewichte sind Multiplikatoren pro Quelle × Variable (`SourceWeights ∈ [0..2]`, default 1).

| Quelle | temperature | wind | clouds | precipitation | Bemerkung |
|---|---|---|---|---|---|
| DWD-Obs (h=0) | **5.0** | 3.0 | 2.0 | 4.0 | Messwert-Dominanz Stunde 0 |
| TAWES (h=0) | **5.0** | 3.0 | 0 | 4.0 | AT-Stationen |
| SMN (h=0) | **5.0** | 3.0 | 0 | 4.0 | CH-Stationen |
| MOSMIX | 1.4 | 1.4 | 0.98 | 1.4 | ×0.6 falls Open-Meteo aktiv; clouds = w·0.7 |
| INCA (≤4 h) | 2.0 | 1.8 | 0 | 2.2 | AT-Nowcast |
| AROME | 1.4 | 1.4 | 1.4 | 1.4 | AT/CH/sDE NWP |
| Open-Meteo best_match | 1.0 | 1.0 | 1.0 | 1.0 | opt-in |
| Open-Meteo ICON-D2-DACH | 1.6 | 1.4 | 1.3 | 1.8 | opt-in Zusatz-Bias |

Stationen tragen mangels Wolken-/Höhenmessung teils clouds=0 bei. Die hohen Stations-
gewichte gelten nur, wo Stationen Samples liefern — das ist ausschließlich Stunde 0.

### 4.3 Caching (alle TTL 10 min)

- **`sourceCache`** — pro Quelle, Key `(name, hours, 10-min-Slot)`. Treibt Sub-Sekunden-
  Modellwechsel: bei Fusion↔MOSMIX↔AROME werden Fetches aus dem Cache bedient, nur
  `engine.run()` läuft neu.
- **`fusedResultCache`** — pro Kombination `(country, modelChoice, hours, gridDims,
  quickMode, slot)`. Cached das komplette Ergebnis.
- **`elevationPromise`** — einmalig, **permanent** (Terrarium-Kacheln sind statisch).
  Bewusst ohne AbortSignal, damit ein StrictMode-Unmount die Höhenkarte nicht killt.

### 4.4 Zwei-Phasen-Rendering (Phase A / Phase B)

Zur Latenzreduktion beim Erstpaint kann in zwei Stufen geladen werden:

- **Phase A (`quickMode`)**: 80×64-Gitter, 6 h, **überspringt** Sekundärquellen (AROME/
  INCA/TAWES/SMN), **überspringt** die Gauß-Glättung aller Variablen außer Temperatur und
  den temporalen Medianfilter. Ziel: nutzbares Bild ~500 ms nach warmen Quellen.
- **Phase B**: volle Qualität 160×128, alle Quellen, alle Filter.

Ausnahme: Ist explizit AROME/INCA als Einzelmodell gewählt, werden diese in Phase A
**nicht** unterdrückt (sonst leeres Bild).

---

## 5. Fusions-Engine-Pipeline (`fusionEngine.ts` → `run()`)

Projektion durchgängig **äquirektangular** in [0,1]²:
`x = (lng+180)/360`, `y = (90−lat)/180`.

### Schritt 0 — Horizont bestimmen
`maxHours = min(cfg.hours, max over sources of points.length)`. Kürzere Quellen (INCA)
hören einfach auf beizutragen; volle Quellen (MOSMIX) halten das Feld besetzt.

### Schritt 1 — Positionen einmalig flach auslegen (Fast-Path)
Sample-**Positionen sind über alle Stunden konstant** — nur die Werte ändern sich. Daher
wird eine flache `positions[]`-Liste (x, y, elev, srcIdx, ptIdx, isStation, stationElev)
**einmal** gebaut. Höhe = Stationshöhe, sonst DEM-Sample. Ebenso einmalig: die
Quellgewichts-Arrays `wTemp/wWind/wClouds/wPrecip` pro Position.

### Schritt 2 — Drei räumliche Kernels vorberechnen
Ein `SpatialKernel` (§6) je (radius, power)-Profil, **einmal** für alle Stunden:

| Kernel | radius | power | Variablen |
|---|---|---|---|
| `kTemp` | 0.12 | 1.8 | Temperatur |
| `kWindCloud` | 0.14 | 1.6 | u, v, Windspeed, cloudLow/Mid/High |
| `kPrecip` | 0.08 | 2.0 | Niederschlag |

Der Kernel speichert je Zielzelle die Nachbarliste + reine Distanzgewichte
`1/(d²+ε)^(power/2)`. Damit kollabiert der Per-Stunde-Aufwand von O(Zellen×alleSamples)
auf O(Zellen×Nachbarn).

### Schritt 3 — Pro Stunde: Werte ziehen + interpolieren
Für jede Stunde h:
1. Werte aus `points[h][ptIdx]` in die wiederverwendeten Puffer `vTemp/vU/vV/…` ziehen
   (NaN wo fehlend). Stationen mit endlicher Temp → `stationsTemp[]` für die Regression.
2. Windbetrag `vSpeed = hypot(u,v)` separat berechnen.
3. **Lapse-Rate** dieser Stunde schätzen (§7).
4. **`applySpatialKernel`** je Variable mit passendem Kernel + Barnes-Sigma (§5.1).
   Temperatur zusätzlich mit Höhenkorrektur (`gridElevations`, lapseRate).
5. **Speed-erhaltende Wind-Korrektur** (§5.2).

### Schritt 4 — Barnes-Sigma je Variable

| Variable | Sigma (voll) | Sigma (quickMode) |
|---|---|---|
| Temperatur | 1.0 | 1.0 |
| Wind u/v | 1.4 | 0 |
| Wolken | 1.6 | 0 |
| Niederschlag | 1.0 | 0 |

### Schritt 5 — Temporaler Medianfilter (§8)
3-Punkt-Median über h−1/h/h+1 für Temperatur + alle drei Wolkenschichten. h=0 und die
letzte Stunde bleiben unangetastet. In quickMode übersprungen.

### Schritt 6 — PNG-Kodierung (§9) + DEM-PNG
Aus den geglätteten Arrays werden die vier Layer-PNGs je Stunde erzeugt, plus ein einzelnes
hochaufgelöstes DEM-PNG (384×256) für die Per-Pixel-Verfeinerung im Shader.

---

## 5.1 / 5.2 Zwei Spezialbehandlungen

**§5.1 Barnes-Gauß-Glättung** entfernt Spike-Artefakte um isolierte Stationen und erzeugt
die kontinuierlichen Gradienten, die Heatmap-Layer erwarten. NaN-bewusst (fehlende Daten
verwässern nicht, können aber gefüllt werden).

**§5.2 Speed-erhaltende Wind-Korrektur.** Komponentenweises Glätten der u/v-Vektoren löscht
sich bei leicht variierender Richtung teilweise aus → der Betrag wird systematisch zu klein
(gemessen ~2× zu niedrig vs. Stationen). Lösung: Windgeschwindigkeit wird **separat als
Skalar** interpoliert (mittelt ohne Auslöschung) und der geglättete (u,v)-Vektor pro Zelle
auf diesen Betrag **re-skaliert** — Richtung bleibt, Speed wird realistisch. Der
Verstärkungsfaktor ist auf **4×** gedeckelt (bei stark ausgelöschten Vektoren ist die
Richtung unzuverlässig).

---

## 6. Räumliche Interpolation (`spatialInterp.ts`)

Hybrid **IDW (Inverse Distance Weighting)** + optionaler **Barnes-Gauß-Pass**.

- **`buildSpatialKernel`** (Zwei-Pass, keine dynamischen Arrays): zählt je Zelle die
  Nachbarn im `radius`, legt CSR-artige `offsets/neighbors/distWeights` an.
  `distWeight = 1/(d²+1e-8)^(power/2)`. Quellgewichte werden **nicht** eingebacken (sie
  variieren je Variable) — sie kommen erst beim Apply dazu.
- **`applySpatialKernel`**: je Zelle `Σ(w·v)/Σw` mit `w = distWeight · sourceWeight`.
  Optimierungen: NaN-Skip via `v !== v` (schneller als `isFinite`), Modul-Scratch-Buffer
  für die MSL-Reduktion (keine GC-Last bei ~168 Aufrufen/Fusion).
- **Coverage-Maske**: `mask = clamp(maxW · radius² · 4 · 255, 0..255)` — stark (255) wenn
  ein Sample sehr nah, fällt mit Distanz ab; 0 = keine Daten (Shader verwirft diese Texel).
- **NaN-Backfill**: iterative 3×3-Dilation (max 6 Iterationen) füllt Löcher farbkohärent;
  Maske bleibt 0. Wird übersprungen, wenn das Feld voll besetzt ist (spart ~10 ms/Aufruf).

---

## 7. Höhenkorrektur & Lapse-Rate (`elevation.ts`, `estimateLapseRate`)

**DEM**: Mapzen-**Terrarium**-Kacheln, Zoom 5 (~2,5 km/Pixel, ~16 Kacheln für Europa).
Dekodierung: `h = R·256 + G + B/256 − 32768`. Bilineare Sub-Pixel-Abtastung.

**Elevation-aware IDW** (nur Temperatur): Samples werden vor der Interpolation auf
Meereshöhe reduziert (`v_msl = v + h·γ`), IDW läuft auf dem glatteren MSL-Feld, dann wird
je Zielzelle die Lapse-Rate mit deren **eigener DEM-Höhe** wieder aufgeschlagen
(`v_cell = v_msl − h_cell·γ`). Ergebnis: realistische alpine Abkühlung, ohne dass das
NWP Topographie kennen muss.

**Lapse-Rate-Schätzung pro Stunde** (`estimateLapseRate`): OLS-Regression Temperatur↔Höhe
über die Stationen, mit **Reliabilitäts-Shrinkage** zum physikalischen Prior 0,0065 °C/m:

```
α_spread = clamp01((spread − 300) / 700)   // 300 m → 0, 1000 m → 1
α_fit    = clamp01((R² − 0.3) / 0.5)       // R² < 0,3 → 0, R² > 0,8 → 1
α        = α_spread · α_fit
lapse    = α · lapse_OLS + (1 − α) · 0.0065
```

Voraussetzung ≥ 5 Stationen mit endlicher Höhe und Spread ≥ 1 m; sonst Prior. Ergebnis
geklemmt auf **[−0,008 … +0,012] °C/m** (breit genug für echte Inversionen, eng genug gegen
Ausreißer). Negative Werte = Inversion (klare Winternächte / Talnebel) bleiben erhalten.

> **Hinweis:** Die Engine schätzt die Rate pro Stunde für die IDW-Reduktion, die
> **Per-Pixel-Shader-Verfeinerung** nutzt jedoch bewusst die **Standard**-Rate 0,0065 —
> das ist der visuell erwartete Wert (≈0,65 °C/100 m). Verifikation der Shrinkage:
> `window.__verifyLapseShrinkage()` (Dev-Build).

---

## 8. Temporaler Medianfilter (`temporalMedian3`)

In-place 3-Punkt-Median entlang der Zeitachse pro Zelle für Temperatur + Wolken (low/mid/
high). Fängt den typischen MOSMIX-Fehlerfall ab, bei dem eine Stunde einen völlig
verrutschten Wert meldet, während h±1 korrekt sind („ICON-EU-Bias-Wobble" zwischen
6-h-Analysen). h=0 (obs-verankerte Wahrheit) und die letzte Stunde bleiben unverändert.
Nur wo alle drei Werte endlich sind (bewahrt die NaN-Coverage). In quickMode aus.

---

## 9. Ausgabeformat — PNG-Texturen

Alle Layer werden als RGBA-Canvas kodiert (direkt WebGL-`texImage2D`-tauglich, kein
`toDataURL`-Umweg). Gitter-Zeile j=0 = Süden → PNG-y=0 = Norden ⇒ vertikaler Flip beim
Kodieren.

| Layer | R | G | B | A |
|---|---|---|---|---|
| **Wind** | (u−uMin)/(uMax−uMin)·255 | v analog | 0 | Maske |
| **Temperatur** | (T−(−20))/(40−(−20))·255 | DEM-Höhe/4500·255 | 0 | Maske |
| **Wolken** | low/100·255 | mid/100·255 | high/100·255 | Maske |
| **Niederschlag** | p/10·255 (0–10 mm/h) | 0 | 0 | Maske |
| **Unsicherheit σ** *(opt., fusionV2)* | σ/σmax·255 (σmax=6 °C) | 0 | 0 | Maske |
| **DEM** (1×) | Höhe/4500·255 | 0 | 0 | 255 |

Der Temp-Layer trägt die **Zellen-DEM-Höhe im Grün-Kanal**, damit der Fragment-Shader je
Pixel zurück auf MSL rechnen und mit der feineren DEM-Textur (384×256, ~4 km/Pixel) eine
Tal-vs-Gipfel-Verfeinerung innerhalb einer IDW-Zelle vornehmen kann. `uMin/uMax/vMin/vMax`
werden je Stunde aus dem Feld bestimmt und im Wind-Result mitgeführt.

### 9.1 Fünfter σ-Layer — Unsicherheit (fusionV2, eq. 15) — **optional, additiv**

Der fünfte PNG (Temperatur-Unsicherheit) wird **nur** erzeugt, wenn `fusionV2.uncertainty`
aktiv ist (setzt `fusionV2.oi` voraus, da σ aus dem OI-Varianzverhältnis stammt). Ist das Flag
aus, sind die **vier bestehenden Layer byte-identisch** — der σ-Layer ist rein additiv und
optional (`FusedHour.layers.uncertainty?`, `DwdForecastResult.hours[].layers.uncertainty?`), er
verändert den bestehenden Textur-Kontrakt nicht.

- **Encoding:** R = σ/σmax·255 mit **festem** σmax = 6 °C (fixe Range ⇒ R-Kanal über alle
  Stunden vergleichbar, wie bei Temp/Precip), G=B=0, Alpha = Coverage-Maske des Temp-Backgrounds.
  Gleicher j=0-Süd→PNG-y=0-Nord-Flip wie alle Layer. Variable-Tag `uncertainty_t2m`.
- **Analyse (τ=0):** σ_a(x) = √(varRatio(x)) · σ_b, mit varRatio = 1 − ρ_cᵀC⁻¹ρ_c aus `oi.ts`
  (0 an einer Station → wächst mit der metrischen Distanz). σ_b = **provisorischer Prior** 1,5 °C
  (`OI_PRIORS.t2m.sigmaB`), bis das Archiv ihn (Desroziers) + einen Inflationsfaktor fittet.
- **Vorhersage (τ>0):** σ²(x,τ) = σ_a²·e^{−2τ/T} + σ_b²·(1−e^{−2τ/T}), T = `OI_PRIORS.t2m.tvHours`
  (4 h, provisorisch). **Dokumentierte Abweichung von eq. 15 (Rule 8):** der exakte
  Multi-Modell-Spread-Term Σ_m w_m(x̃_m−x_b)² wird provisorisch durch σ_b²(1−e^{−2τ/T})
  angenähert (σ läuft von σ_a bei τ=0 auf σ_b bei langem Vorlauf), bis die Per-Modell-Gitter
  mitgeführt werden. Kalibrierung (Spread-Skill, Rank-Histogramm, Inflationsfaktor) im
  LOSO-Harness (`scripts/verify-loso.mjs`, Sektion Spread-Skill).

Ausgabe-Objekt `DwdForecastResult`: `hours[]` (je timestamp + layers inkl. optional
`precipitation` / `uncertainty`), `fetchedAt`, `uvBounds`, `model`, `demImage`, `demMax=4500`,
`lapseRatePerM=0.0065`.

---

## 10. Sub-Stunden-Interpolation (`frameInterp.ts`)

Für Slider-Positionen zwischen ganzen Stunden werden die **PNG-Texturen** pixelweise
gelerpt (`(1−f)·a + f·b`) — mathematisch korrekt, weil jede Layer-Wertespanne fix ist
(Temp −20..40, Precip 0..10, Wolken 0..100), ein R-Kanal also in jeder Stunde dieselbe
physikalische Größe kodiert. **Wind wird NICHT gelerpt** — dessen uMin/uMax variieren je
Stunde, ein Pixel-Lerp würde die Geschwindigkeit verzerren; die Partikel-Persistenz glättet
die Übergänge ohnehin visuell.

---

## 11. Performance-Charakteristik

- Fetches parallel (`Promise.all`) → Cold-Load ≈ Max-Latenz statt Summe.
- Positions- & Kernel-Vorberechnung einmalig; Per-Stunde-Kosten O(Zellen×Nachbarn).
- Wiederverwendete Wert-Puffer + Modul-Scratch-Buffer → nahezu keine GC-Last.
- Direkter Canvas-Encode (kein `toDataURL`/`Image`-Roundtrip) — spart ~20 ms/Frame,
  bei 24 h × 4 Layern früher ~2 s.
- Zwei-Phasen-Rendering: 80×64/6 h Vorschau, dann 160×128/volle Tiefe.
- Prefetch-Hooks (`prefetchElevation`, `prefetchPrimary/SecondarySources`, `warmMapData`)
  wärmen DEM + Quellen schon auf der Landing-Page. **Aktuell wärmt `warmMapData` nur noch
  das DEM** — die gridded Fusion lädt lazy erst beim Aktivieren des Temperatur-Layers
  (spart ~1700 BrightSky-Requests pro Suche).

---

## 12. Constraints & Grenzen (Design-Leitplanken)

- **Nur bestehende Pipelines** (DWD/GeoSphere/MeteoSwiss/Open-Meteo/DEM). Keine neue
  externe Quelle, kein neuer Fetch-Pfad.
- **CORS**: `opendata.dwd.de` blockt Browser-CORS → im Dev via `vite.config.ts`
  (`/_dwd_opendata`) geproxyt; Prod braucht denselben Same-Origin-Proxy. GeoSphere,
  MeteoSwiss, S3 (Terrarium) liefern `ACAO: *`.
- **Stationsdominanz nur h=0** — ab Stunde 1 tragen ausschließlich die Modelle.
- **INCA nur AT & ≤ 3–4 h.** Open-Meteo non-commercial/rate-limited (opt-in).
- Metrik durchgängig **Meter / m·s⁻¹ bzw. km·h⁻¹ / lineare Skalen**.

---

## 13. Konstanten-Referenz

| Konstante | Wert | Ort |
|---|---|---|
| Default-Gitter | 160 × 128 (~20k Zellen) | `loadFusedForecast` |
| Phase-A-Gitter | 80 × 64 | `quickMode` |
| Projektion | äquirektangular [0,1]² | `fusionEngine` |
| Kernel Temp | radius 0.12 / power 1.8 | `fusionEngine` |
| Kernel Wind/Wolken | radius 0.14 / power 1.6 | `fusionEngine` |
| Kernel Precip | radius 0.08 / power 2.0 | `fusionEngine` |
| Barnes-Sigma T/UV/C/P | 1.0 / 1.4 / 1.6 / 1.0 | `fusionEngine` |
| Standard-Lapse-Rate | 0.0065 °C/m | `elevation.ts` |
| Lapse-Clamp | [−0.008, +0.012] °C/m | `spatialInterp` |
| Temp-Range (PNG) | −20 … +40 °C | `loadFusedForecast` |
| Precip-Range (PNG) | 0 … 10 mm/h | `fusionEngine` |
| DEM-Zoom / -Encode | Terrarium z5 / R·256+G+B/256−32768 | `elevation.ts` |
| DEM-Max / DEM-PNG | 4500 m / 384×256 | `fusionEngine` |
| Cache-TTL | 10 min | `loadFusedForecast` |
```
