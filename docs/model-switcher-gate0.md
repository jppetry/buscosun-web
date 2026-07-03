# Per-Land-Modell-Switcher — Gate 0 (Diagnose-First)

> Status: **Gate 0 abgeschlossen — kein Render-/State-Code vor diesem Dokument.**
> Baut auf `docs/fusion-2d-integration.md` (bestehender Fusion⇄Native-Switch, Textur-Kontrakt)
> und Code-Trace: `src/MapView.tsx`, `src/fusion/loadFusedForecast.ts` (`ModelChoice`),
> `src/countryProfiles.ts`, `src/scalar/precipComposite.ts`, `src/sources/*`, `src/wind/*`.
> Enumeration der nativen Quellen: verifiziert per file:line-Trace (s. Anhang A).

---

## 0. Kernbefund vorab

1. **Die Vorarbeiten existieren und tragen.** Der neue Switcher ist **kein** Parallelmechanismus,
   sondern die Erweiterung von **zwei** bestehenden Achsen:
   - `ModelSource = 'fusion'|'native'` (binär) in `src/fusion/modelSource.ts` → wird zu einer
     **Modell-ID-Achse**, in der `'native'`/`'fusion'` **Spezialwerte** neben konkreten Modell-IDs sind.
   - `ModelChoice = 'fusion'|'mosmix'|'arome'|'inca'|'obs'` in `loadFusedForecast.ts` → das ist bereits
     die **Einzelmodell-Isolation** (heute auf `'fusion'` gepinnt, ohne UI). Konkrete Modell-IDs rendern
     über genau diesen Pfad → **kein neuer Render-Weg nötig**.
   - `COUNTRY_PROFILES` (DE/AT/CH) + `parseCountry` (Such-Land) + `pickCountry(lat,lon)`
     (`precipComposite.ts:128`) liefern die **Land-Ableitung** bereits.

2. **Native ist heute ein Komposit, kein Einzelmodell** — und die Land-Unterschiede sind eng umrissen:
   - **Raster** (wind·temp·clouds·gust) = **ICON-D2, 2,2 km, in ALLEN drei Ländern** (kein Länder-Branch).
   - **Nowcast/Radar** = **per Kartenzelle** (nicht per gewähltem Land): DE→RADOLAN-RV, AT→INCA, CH→rzc/RR,
     Rest/Horizontende→ICON-D2 (`precipComposite.ts:173-180`).
   - **Punkt** = Länderprofil-Mix: DE→MOSMIX+Obs, AT→AROME+TAWES, CH→AROME+SMN.
   → Die Native-Beschriftung muss also **pro Land Karte+Radar+Punkt getrennt** benennen (s. §1c).

3. **Contract fit: ✅** Ein konkretes, bereits ingestiertes Modell als Raster läuft durch dieselbe
   `FusionEngine`-Einzelmodell-Isolation → **byte-identische PNG-Texturen** wie der bestehende
   Fusion/Native-Sink. Kein Kontrakt-Edit. (Details §3.)

4. **Ein echter Decision Gate für Phase 4:** Die Whitelist-Modelle, die **neu** ingestiert werden
   müssten (Météo-France, ECMWF, NOAA-GFS-2D, ECCC, UKMO …), verletzen die CLAUDE.md-Regel
   „keine neue externe Quelle / kein neuer Ingest-Pfad". Die Whitelist ist eine **explizite
   Vorab-Freigabe**, die diese Regel *für genau diese Modelle* aufhebt — das ist am **menschlichen
   Zwischengate nach Phase 3** zu bestätigen, bevor der erste neue Adapter entsteht (§6, §7).

---

## 1. Enumeration

### (a) Whitelist-Modelle, die die Pipeline HEUTE liefert (Switcher geht damit live)

| Modell-ID | Betreiber | Typ | Adapter (vorhanden) | Raster im Switcher? |
|---|---|---|---|---|
| **native** *(Default)* | Komposit | R+P+A | (bestehender nativer Pfad) | — (ist der Default) |
| **fusion** (Buscosun, hauseigen) | Komposit | R+P | `src/fusion/` (Flag `FUSION_RASTER_ENABLED`, akt. off) | ja, sobald Flag on |
| **ICON-D2** | DWD | R+P · 2,2 km | `iconD2TempSource`/`iconD2Clouds`/`iconD2GustSource`/`iconD2Precip` + `wind/iconD2WindSource` | **ja** (= heutiges native Raster) |
| **AROME-AT** | GeoSphere | R+P · 2,5 km | `geosphereArome` | **ja** (teilw.: AT/CH/S-DE) |
| **INCA** | GeoSphere | R+P · 1 km · Nowcast | `geosphereInca` + `geosphereIncaGrid` | **ja** (teilw.: AT) |
| **MOSMIX** | DWD | P (Stationen) | `brightSkyForecast` | Punkt-only → Raster fällt auf native zurück |
| **Station-Obs** | DWD+GeoSphere+MeteoSwiss | P/A | `brightSkyCurrent`+`geosphereTawes`+`meteoSwissSmn` (`dachStations`) | Analyse → `stations`-Layer/Punkt |

### (b) Whitelist-Modelle, die NEU ingestiert werden müssten (Phase 4, einzeln gegated)

| Gruppe | Modelle | Status heute |
|---|---|---|
| **Regional / teilw.** | ICON-D2-EPS, ICON-CH1-EPS, ICON-CH2-EPS, AROME-France, **ICON-EU (Raster)** | ICON-EU nur als Sounding (`iconEuSounding`), kein 2D-Raster; Rest gar nicht |
| **Global / grob** | UKMO Global, ARPEGE, ICON global, GEM/GDPS, ECMWF IFS, **NOAA GFS (2D)** | GFS nur Sounding (`gfsSounding`) + Globe-Wind; kein DACH-2D-Raster; Rest gar nicht |
| **KI [KI]** | AICON, AIFS Single/ENS, AIGFS, AIGEFS, GraphCastGFS | keiner ingestiert |

### (c) Exakte native Modell-Zusammensetzung pro Land & Layer (Grundlage der „Native ·"-Labels)

Raster-Layer sind **länderunabhängig ICON-D2**; der Unterschied liegt in Nowcast (per Zelle) + Punkt.

| Layer | DE | AT | CH | Native-Quelle (Beleg) |
|---|---|---|---|---|
| wind | ICON-D2 u/v 10m 2,2 km | = | = | `MapView.tsx:1202` |
| temp | ICON-D2 t_2m 2,2 km | = | = | `MapView.tsx:1230` |
| clouds | ICON-D2 clct/l/m/h 2,2 km | = | = | `MapView.tsx:1137` |
| gust | ICON-D2 vmax_10m 2,2 km | = | = | `MapView.tsx:1248` |
| **nowcast** | **RADOLAN-RV** (0–2 h) →ICON-D2 | **INCA** (0–3 h) →ICON-D2 | **rzc/RR** (~0,5 h) →ICON-D2 | `precipComposite.ts:173-180` |
| stations/Punkt | DWD MOSMIX + Obs | AROME + TAWES | AROME + SMN | `countryProfiles.ts:63-110` |
| sat | EUMETSAT Meteosat (DWD WMS) | = | = | `dwdSatellite.ts:35` |
| lightning | DWD Sferics/Linet | = | = | `dwdLightning.ts:28` |
| snowline/flownowcast/poprob | abgeleitet (ML/Flow, DE-only bei flow/pop) | | | `MapView.tsx:1605/1629/1662` |

**Resultierende Native-Labels** (Statuszeile & Karte-Option-Untertitel):
- **Native · DE:** „ICON-D2 (Karte 2,2 km) · RADOLAN-RV (Regenradar) · MOSMIX + Stationen (Punkt)"
- **Native · AT:** „ICON-D2 (Karte 2,2 km) · INCA (Regenradar) · AROME + TAWES (Punkt)"
- **Native · CH:** „ICON-D2 (Karte 2,2 km) · MeteoSchweiz-Radar rzc (Regenradar) · AROME + SMN (Punkt)"

---

## 2. Integration-Map (State & Resolver — eine Achse, keine zweite Maschine)

Bestehend: `ModelSourceState = { global: 'fusion'|'native', overrides, point }`.

Erweiterung (dieselbe Achse; `native`/`fusion` bleiben Spezialwerte):

```ts
type ModelId =
  | 'native' | 'fusion'                               // Spezialwerte (Bestand)
  | 'icon-d2' | 'icon-eu' | 'mosmix' | 'inca' | 'arome-at' | 'obs'   // heute ingestiert
  | 'icon-d2-eps' | 'icon-ch1-eps' | 'icon-ch2-eps' | 'arome-fr'      // Phase 4 …
  | 'gfs' | 'ifs' | 'icon-global' | 'gem' | 'ukmo' | 'arpege'
  | 'aicon' | 'aifs' | 'aifs-ens' | 'aigfs' | 'aigefs' | 'graphcast';

interface ModelSourceState {
  country: Country;                                    // aktives Land (Viewport/explizit)
  perCountry: Record<Country, ModelId>;                // Modellwahl je Land, Default 'native'
  overrides: Partial<Record<FusionCapableLayer, ModelId>>;  // Per-Layer schlägt Land
  radar: boolean;                                      // orthogonaler Radar-Toggle
  point: ModelSource;                                  // Punkt-Domäne unverändert (Bestand)
}
```

`resolveModelSource(layer, state): ModelId` (erweitert):
1. `overrides[layer]` gewinnt, sonst `perCountry[state.country]`.
2. **Fähigkeits-/Abdeckungs-Fallback** (neue Logik, aus Katalog): liefert das gewählte Modell für
   `layer`/`country` **kein Raster** (Punkt-only wie MOSMIX, oder außerhalb „teilw."-Abdeckung, oder
   noch nicht ingestiert) → Rückgabe `'native'` **mit Indikator** (gleiche Mechanik wie der bestehende
   Fusion-Auto-Fallback, `docs/fusion-2d-integration.md §5`). Nie leerer Layer.
3. `'native'`→nativer Pfad · `'fusion'`→gridded Fusion (Flag) · konkrete ID→`loadFusedForecast`
   `modelChoice`-Isolation (bzw. nativer ICON-D2-Pfad für `icon-d2`).

**Render-Verdrahtung:** unverändert ein **Daten-Swap in dieselbe Layer-Instanz**
(`setData/setWindData/setFrame` → `triggerRepaint`), gezielte Invalidierung nur betroffener Layer,
kein Remount/Reload/Flicker (WindLayer-Dedup-Guard). Radar-Toggle steuert ausschließlich den
Nowcast-/Radar-Render-Pfad, unabhängig von `perCountry`.

**Rückwärtskompatibilität:** `perCountry` mit überall `'native'` + `radar:true` = **exakt** heutiges
Verhalten (Pin-Test-Basis). `verifyModelSource()` wird auf die neue Form migriert; die bestehenden
Invarianten (native-by-design unverlierbar, Per-Layer schlägt Land, Punkt-Default `'fusion'`) bleiben.

---

## 3. Contract-Fit-Urteil

**Frage:** Passen die Modell-Outputs in den bestehenden Textur-/Tile-Kontrakt — ohne Kontrakt-Edit?

- **Bereits ingestierte Modelle:** Jede konkrete ID rendert über die `FusionEngine`-Einzelmodell-
  Isolation (`modelChoice='arome'|'inca'|'mosmix'|'obs'`) bzw. den nativen ICON-D2-Pfad. Beide
  erzeugen **denselben `DwdForecastResult`/PNG-Kontrakt** wie der heute verifizierte Fusion/Native-
  Sink (wind/temp byte-identisch; clouds/precip via bestehende Adapter). **→ ✅ Drop-in, kein Edit.**
- **Punkt-only (MOSMIX/Obs) auf Raster-Layer:** kein Raster-Encoding vorhanden → **Fähigkeits-Fallback
  auf native** (§2.2), kein Leerlayer.
- **Neue Modelle (Phase 4):** fügen sich **by construction** ein, sobald ihr Adapter in den gemeinsamen
  `ForecastGrid`-Typ normalisiert (`openMeteoForecast.ts`) — dann fließen sie durch dieselbe Engine →
  derselbe Kontrakt. Das Risiko liegt in **Ingestion** (CORS/Format/Lizenz), **nicht** im Kontrakt.
  **STOPP-Kriterium pro Quelle:** wenn eine Quelle nachweislich nicht in `ForecastGrid` normalisierbar
  ist → melden statt Kontrakt biegen.

**Urteil: ✅ CONTRACT FITS — kein Hard Stop. Kein Kontrakt wird geändert.**

---

## 4. Ehrliche Abweichungen Katalog ↔ Realität (nicht glätten)

| # | Katalog sagt | Realität im Code | Umgang |
|---|---|---|---|
| 1 | CH-Radar = **CombiPrecip** (1 km) | Code nutzt **rzc/RR** (Radar-Analyse, ~0,5 h, `meteoSwissRadar.ts`). CombiPrecip (Radar-Gauge-Merge) ist **nicht** ingestiert. | Label ehrlich „MeteoSchweiz rzc/RR"; CombiPrecip als „bald verfügbar". |
| 2 | ICON-EU = **R+P** 7 km | Nur **Sounding** ingestiert, **kein 2D-Raster**. | ICON-EU-Raster = neu (Phase 4). MOSMIX (ICON-EU-MOS) deckt den Punkt teilweise ab. |
| 3 | GFS = **R+P** grob | Nur **Sounding** + Globe-Wind; kein DACH-2D-Raster. | GFS-2D = neu (Phase 4). |
| 4 | INCA CH = **teilw.** | CH-INCA-Grid ist **nicht publiziert** (`meteoSwissRadar.ts:5-9`); INCA-Raster ist AT-only. | INCA in CH = nicht verfügbar; Abdeckung ehrlich als AT markieren. |
| 5 | Native raster (impliziert best-per-region) | Native raster = **ICON-D2 überall**, AROME nur im Punkt/der Fusion. | Native-Label benennt ICON-D2 für Karte, nicht AROME. |
| 6 | MOSMIX „voll" | Stationen (P), Raster-Layer fallen zurück. | Als Punkt-Quelle kennzeichnen. |

---

## 5. UI-Entscheidungen (erarbeitet & begründet)

- **Nicht-ingestierte Modelle: ausgegraut + „bald verfügbar"** (nicht ausblenden). Begründung: hält die
  Katalog-Übersicht vollständig/ehrlich, kommuniziert die Roadmap, nutzt den Disabled-State des
  Design-Systems — keine „tote Auswahl", da nicht klickbar.
- **Aktives Land:** initial aus Such-Land (`parseCountry`), danach aus dem **Karten-Center** via
  `pickCountry(lat,lon)` (Wiederverwendung der `precipComposite`-Logik) — kein neues Konzept.
- **Dreistufige Gruppierung** „Lokal & fein" (≤2,5 km) · „Regional" (7 km/teilw.) · „Global & langfristig",
  Sortierung nach Auflösung, Gruppen-Zusammensetzung folgt der **Land-Whitelist** aus dem Katalog.
- **Native ganz oben** („Empfohlen · Standard", Untertitel = exakte Zusammensetzung §1c), **Fusion**
  direkt darunter („Kombiniert · hauseigen"), dann die drei Gruppen.
- **Ensemble** → 2D rendert Ens-Mittel, Badge „Ensemble (Mittel)". **KI** → `[KI]`-Badge.
- **Statuszeile** (immer sichtbar): aktives Land · aktive Quelle (Native ausgeschrieben) · Radar an/aus.
- **Radar-Toggle** getrennt & prominent, Untertitel = Radarquelle des Landes (RADOLAN / INCA / rzc).
- **Attribution** dezent je aktiver Quelle (Lizenzpflicht CC BY / Etalab / OGL).
- **Ein maschinenlesbarer Katalog** (`src/fusion/modelCatalog.ts`) speist Karten, Badges, „Gut für"-
  Sätze, Abdeckung, Lizenz, `ingested`-Flag — kein doppelt gepflegter Katalog.

---

## 6. Ingestion-Reihenfolge (Phase 4, nach Nutzen/Aufwand)

Kriterium: Abdeckung (voll>teilw.>grob) × vorhandene Betreiber-Pipeline × Kontrakt-Leichtigkeit.

1. **ICON-D2-EPS** (DWD) — nutzt den **vorhandenen** GRIB2-Decoder wie ICON-D2, nur EPS→Ens-Mittel;
   volle DACH-Abdeckung, hoher Nutzen (Unsicherheit). Bestes Verhältnis.
2. **ICON-CH1-EPS / ICON-CH2-EPS** (MeteoSwiss OGD) — CORS-freies STAC wie das bereits genutzte rzc;
   1 km alpin für CH.
3. **AROME-France** (Météo-France, Etalab) — füllt CH-West / S-DE-Rand.
4. **ICON-EU-Raster** (DWD GRIB2, gleiche Pipeline) — regionale 7-km-Kontinuität.
5. **Global-Satz** — ICON global + GFS-2D zuerst (DWD-GRIB2 bzw. GFS-Sounding-Plumbing vorhanden),
   dann IFS/GEM/UKMO/ARPEGE.
6. **KI-Modelle** — nach ihren physikalischen Pendants (teilen Format/Pipeline: DWD AICON, ECMWF AIFS
   Open-Data, NOAA-KI auf S3).

**Kein Bündel-Rollout:** Switcher geht mit (a)-Modellen live (Phase 3) **vor** der ersten neuen Quelle.

---

## 7. Offene Decision Gates (an den Betreiber)

1. **CLAUDE.md-Konflikt (Phase 4):** „keine neue externe Quelle" vs. Whitelist-Freigabe neuer Modelle.
   → Auflösung: Whitelist ist explizite Freigabe *für genau diese Modelle*; CLAUDE.md-Ausnahme dort
   dokumentieren. **Bestätigung am menschlichen Zwischengate nach Phase 3.**
2. **Prod-CORS/Proxy:** Neue Quellen brauchen CORS oder einen Same-Origin-Proxy; Prod hat noch keinen
   Backend-Proxy (CLAUDE.md). Pro Quelle in ihrer Ingestion-Phase zu klären.
3. **Production-Default-Flip** bleibt Hard Stop: Default ist und bleibt **Native**.

---

## 8. Phasenplan & Test-Mapping (Deliverables a–h)

| Phase | Inhalt | Gate |
|---|---|---|
| **0** | dieses Dokument | ✅ |
| **1** | Katalog (`modelCatalog.ts`) + State/Resolver-Erweiterung + `verifyModelSource` (Land/Modell/Fallback/Lizenz-Whitelist) | Self: typecheck + `fusion:verify` |
| **3** | Switcher-UI über Bestandsmodelle: Gruppen, Native-Labels, Statuszeile, Radar-Toggle, Attribution, Ausgrauung | **Menschliches Zwischengate** |
| **4** | Neue Quellen einzeln: Ingestion→Adapter→Verifikation→UI-Freischaltung→Commit→Gate | je Quelle |
| **Abschluss** | Validierung gegen Katalog (jede Land×Modell, Lizenz, Abdeckung, Horizont); Native-Default-Pin, Radar-Orthogonalität, keine Nicht-Whitelist-Quelle erreichbar | blockierend |

Test-Mapping: **(a)** Default=Native Pin-Test · **(b)** Land-Wechsel passt Modellliste (3 Länder) ·
**(c)** Modellwechsel repaintet flicker-frei nur betroffene Layer · **(d)** Radar-Toggle rendert/entfernt
nur Radar · **(e)** Abdeckungs-Fallback mit Indikator · **(f)** Punktquelle auf Raster ⇒ Native-Fallback ·
**(g)** Attribution folgt aktiven Quellen · **(h)** Lizenz-Whitelist: kein Modell außerhalb des Katalogs
lad-/wählbar. (a/c/e/f/h headless in `verifyModelSource`; b/c/d/g Runtime via Chrome-DevTools.)

---

## Anhang A — Beleg-Trace (native Quellen)

wind `MapView.tsx:1157/1188/1202` (`wind/iconD2WindSource.ts`) · gust `:1239/1242/1248`
(`sources/iconD2GustSource.ts`) · temp `:1218/1223/1230` (`sources/iconD2TempSource.ts`) ·
clouds `:1130/1141/1137` (`sources/iconD2Clouds.ts`) · nowcast `:1085/1317` + compositor
`precipComposite.ts:128/173-180` (radolan.ts RV · geosphereIncaGrid.ts INCA · meteoSwissRadar.ts rzc ·
iconD2Precip.ts) · sat `:903/914` (`dwdSatellite.ts:35`) · lightning `:1256/1266` (`dwdLightning.ts:28`) ·
stations `:942/988` (`dachStations.ts`, Attr `:949`) · confidence `:1505/1522` · snowline `:1605` ·
flownowcast `:1629` (DE-only) · poprob `:1662` (DE-only). Footer-Render: `.data-badge`
`MapView.tsx:2486-2503` (`updateStatus({model})`-Literale sind die maßgeblichen Strings; die
`*_ATTRIBUTION`-Consts der Source-Dateien sind für die 2D-Karte ungenutzt).
</content>
</invoke>
