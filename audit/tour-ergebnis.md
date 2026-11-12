# Phase TE — Tour-Ergebnis (neue Ergebnisansicht „Wetter entlang deiner Route")

Stand: 2026-11-11. Auftrag: Jan (Kickoff-Prompt „phase TE — Tour-Ergebnis", Mockup `mockups_tour/route-result-v3.html`).
Schalter: `TOUR_RESULT_V2 = true` seit 11.11. (Jan: „einschalten"), Rückfall `?tourv=1` (alt), `?tourv=2` (neu).
Entscheidungen Jan 11.11.: V-TE-1 umgesetzt (`FORECAST_HORIZON_H` = 336 h, Hinweis „über 14 Tage — so weit reicht die Vorhersage nicht"); V-TE-2 bleibt vorerst.

## 1 Diagnose (Phase 0)

### 1.1 Datenbasis: welcher Stand von buscosun Fusion rechnet die Route?

Kette im Code (Belege):

1. `TourView.tsx` → `enrichSampleWeather(enrichedSamples, …)` (`src/pointForecast/weatherEnrichment.ts:168`).
2. Je Cluster `getFusionForecast({ lat, lng, country, hours }, 'route')` (`weatherEnrichment.ts:223`).
3. `fusionPathFor('route', search)` (`fusionForecast.ts:26`): `?pf=` zuerst, sonst `fusionPartOn('route')` —
   `FUSION_PARTS` trägt `{ id: 'route', on: true }` (`fusionRelease.ts:329`) ⇒ Pfad `cube`.
4. Cube-Pfad `getPointForecast({ …, pointSource: 'cube', includeRadarNowcast: true })` rechnet die Stufe `fs`;
   `fusionStage()` legt alle eingeschalteten Stände auf (`fusionRelease.ts:264`). Eingeschaltet bis 14
   (`FUSION14_RUC_MEMBER`, Option `rucMember`), `FUSION_CURRENT` = 14.
5. Die Stufe schreibt `stage:fs — neueste Stufe (buscosun Fusion 14): …` in die Notizen
   (`cubeSource.ts:3080`, `fusionStageNote`); `fusionVersionOfNotes` liest die Nummer zurück.
6. `?rucm=0` ⇒ `CubeIo.rucMember: false` (`cubeSource.ts:3018`) ⇒ Stufe ohne RUC-Member, Etikett „buscosun Fusion 13
   (RUC-Member per Schalter aus)". `?pf=live` ⇒ Live-Pfad, kein Stand.

Der Wind der Zeitrechnung (`windSampling.ts`, `getFusionForecast(…, 'route')`) und `meta.startWindow` (gleiche
Cluster-Vorhersagen, `evaluateStartOffsets`) hängen an derselben Kette. **Ergebnis: `route` = buscosun Fusion 14 —
kein STOPP.**

Lücke vor TE: Die Route wusste nur `meta.pointSource` (`fusion` / `live` / `mixed`), nicht die NUMMER, mit der
gerechnet wurde. TE ergänzt `EnrichmentMeta.clusterFusion` (je Cluster die Nummer aus den Notizen der Vorhersage,
`null` = Live-Rückfall oder keine Vorhersage) — reine Durchreichung, keine Rechnung (E-TE-3).

Laufzeit-Beleg (Log des Stands je Cluster an einer Testroute): **offen** — in dieser Session ohne Browser (Jans
Session-Regel „kein Browser, kein Dev-Server"). Der Verifier prüft die Kette statisch (Register, Pfadwahl, Etikett
14/13). Laufzeitlog = Jans Schritt (MANUELLE-SCHRITTE §TE).

### 1.2 Inventar: heutiges Ergebnis → neuer Platz

| Heute (`resultBody` in `TourView.tsx`) | Desktop V2 | Mobil V2 |
|---|---|---|
| Urteil (`tourVerdict`) | Pille unter dem Titel | Pille unter dem Kopf |
| KPIs Start · Ankunft · Gesamt · Distanz | eine Textzeile + Plan-Pille „Start" | Unterzeile im Kopf |
| Gelände/Karte-Umschalter | Glas-Segment oben links auf der Bühne | Tab „Karte" |
| Gelände-Chips, Auflösung, Vorhang-Hinweis | unter der Bühne (unverändert aus `RouteTerrainPanel`) | Tab „Karte" |
| flache `RouteMap` mit Pausen, Wegpunkten, Wetter-Markern + Popups | Bühne (Karte) | Tab „Karte" |
| `QuellenOverlay`, `WindLegend` | auf der flachen Karte wie heute | dto. |
| 2D/3D-Umschalter + `Route3DView` | Glas-Segment oben rechts auf der Bühne | Kopf |
| `WeatherStatGrid` (ganze Tour) | „Details" | Tab „Hier", unten |
| `WarningBanner`, `FoehnBanner` | „Details" | Tab „Hier" |
| Aktionen Als Event / Tagesablauf / Speichern | „Details" | Tab „Start", unten |
| `TourWeatherStrip` (Verlässlichkeit je Punkt) | „Details" | Tab „Wechsel" |
| `RouteScrubber` (Readout, Höhe, Play, Meilensteine) | ersetzt durch `RouteSlider` (Glas-Leiste) + Positions-Panel; Meilenstein-Sprünge = Pausen-Striche + ◆; der alte Scrubber bleibt der Rückfall (Schalter aus) | Slider über der Bottom-Bar + Tab „Hier" |
| `WeatherProfile` (nivo, „Als Bild") | „Details" | Tab „Wechsel" |
| `TimeOverview` | „Details" | Tab „Start" |
| `Timeline` (Zeitplan) | „Details" | Tab „Start" |
| `QualityRow` | „Details" | Tab „Start" |
| Horizont-Warnung > 10 Tage | Kopf, unter dem Urteil | Kopf |
| Wiederherstellungs-Hinweis (V-R3D-1) | über dem Ergebnis (unverändert, Shell-Ebene) | dto. |
| E-Bike-Akku je Sample | Positions-Panel, Liste | Tab „Hier" |
| URL-Zustand SH5 (typeId, startMs, direction) | unverändert (Plan-Pills schreiben dieselben States) | dto. |
| Tour speichern (Gerätespeicher) | unverändert | dto. |
| `DeckSectionBar` mobil | ersetzt durch Tab-Leiste `ResultTabBar` (Schalter aus: wie heute) | Tab-Leiste |
| „Planung anpassen" | Crumb (wie heute) | Zurück-Knopf (wie heute) |

Nichts fällt weg. Neu: Wind-, Wechsel- und Startzeit-Karte (alle aus vorhandenen Feldern).

### 1.3 Datenzuordnung je neues Element

| Element | Felder | Stand |
|---|---|---|
| Positions-Kopf | `SampleETA.dist`, `etaMs`, `ele`, `arrivalOffsetMin` | Zeitrechnung (Wind aus Fusion 14) |
| Temperatur, gefühlt | `weather.temperatureC`, `apparentTempC` (höhenkorrigiert) | Fusion 14 je Cluster |
| Wind-Karte | `windSpeedMps`, `windDirectionDeg`, `gustMps`, Peilung `bearingAtDist(points, dist)` | Fusion 14 |
| Niederschlag | `precipitationMmH`, `precipitationType`, `precipitationSource` (`radar` = Radar-Nowcast ersetzt den Modellwert) | Radar bzw. Fusion 14 |
| Bewölkung, Feuchte | `cloudCoverPct`, `relativeHumidityPct` | Fusion 14 |
| Konfidenzpunkte | `weather.confidence.*` (0..1) | Fusion 14 |
| Schneefallgrenze | `snowLineM` vs. `ele` | Fusion 14 (clusterweit) |
| UV | `uvIndex`, Flag `uv_estimated` | DWD-UV (DE) / Klarhimmel-Schätzung |
| Warnungen | `weather.warnings[]` (wörtlich: `event`, `headline`) | DWD-CAP |
| Föhn | `weather.foehn` (heuristisch, Tier C) | Ableitung |
| Datenbezug | `lat`, `lon`, `cellId`, `sourcesUsed`, `isInterpolated`, `validityFlags`, `meta.clusterFusion[cellId]` | — |
| Startzeit-Karte | `meta.startWindow[]` (`offsetMin`, `wetMin`, `complete`, `coverage`) | Fusion 14 + Radar |
| Wechsel-Karte | abgeleitet aus den Samples (`tourResultModel.weatherChanges`) | Fusion 14 |

### 1.4 Kette „Ort + Zeit"

`computeTimingIterated` (`tourTiming.ts`) rechnet je Sample `etaMs` = Start + Bewegungszeit (Segmenttempo aus
Bewegungsmodell × Windfaktor `windSpeedFactor` aus der Gegenwindkomponente; iteriert bis die ETAs stehen) + Pausen.
`enrichSampleWeather` clustert die Samples (Radius je Gelände ≈ 10 km, Höhenband 300 m), fragt je Cluster EINE
Vorhersage am Repräsentanten-Sample, und je Sample: `interpolateForecastAt(pf, etaMs)` (Stundenklammer,
Niederschlag als Stunden-Bin), Radar-Ersatz im Nowcast-Fenster (`radar.sample(lat, lon, etaMs)`), Warnungen an
`lat/lon/etaMs`, dann `correctForElevation` auf `s.ele`. **Werte gibt es nur an den Samples (≤ 300)**; die
Auflösung im Raum ist der Cluster (≈ 10 km × 300 m Band), nicht das Sample. Die V2-Ansicht zeigt deshalb den Wert des
nächstgelegenen Samples und interpoliert nicht zwischen ihnen (E-TE-4).

### 1.5 Befunde (nicht behoben, Jans Entscheidung)

- **V-TE-1** `FORECAST_HORIZON_H = 240` (`startTime.ts`) gegen buscosun Fusion bis 336 h: die Horizont-Warnung kommt
  ab 10 Tagen, obwohl Werte bis 14 Tage da sind. Mehrwert: ehrliche Grenze statt pauschaler. Skizze: Grenze aus dem
  Register/Cube-Horizont lesen.
- **V-TE-2** Drei Rots für Gegenwind: `#A8431F` (TourView-Legende, RouteMap, Token `--rd-red`) gegen `#D7263D`
  (`RouteTerrainMap`, `route3d/model.ts`); Rückenwind ebenso dreifach (`#5e8048`, `#7A9466`, `#5F7A4C`). V2 nutzt
  die Tokens (`--rd-red`, `--terracotta-500`, `--rd-sage-strong`) — auf der Gelände-Karte bleibt das andere Rot, bis
  Jan entscheidet (WebGL/`RouteTerrainMap` nicht angefasst).
- **V-TE-3** „Zeitverlust durch Wind" bräuchte die Zeitrechnung ohne Wind (Iteration 1) als Rückgabe von
  `computeTimingIterated` — Mathe der Zeitrechnung = nicht anfassen.
- **V-TE-4** Uneinheitliche Wind-Schwellen: Karten-Marker `≥ 4 m/s`, `±0,7 m/s`; `RouteScrubber` `0,5 m/s`/`±0,5`.
  V2 nimmt die Marker-Werte als benannte Konstanten (`WIND_CALM_MPS`, `WIND_CROSS_MPS`).
- **V-TE-5** Nass-Schwelle uneinheitlich: `tourVerdict` `> 0,1`, Startfenster `≥ 0,1` (`WET_MIN_MMH`). V2 nutzt
  `≥ 0,1` (`TOUR_WET_MMH`, gleich `nowcastModel.WET_MMH`).
- **V-TE-6** Gelände-Karte kann nicht „nach Wind / Temperatur / Regen" einfärben, ohne `RouteTerrainMap`
  (MapLibre-Ebenen) zu ändern. V2 behält die vorhandenen Ebenen-Chips (Pfeile, Temperatur am Boden, Regen) und
  baut keinen Umschalter (E-TE-5).
- **V-TE-7** `@nivo/bar` ist nicht installiert. Die Startzeit-Balken sind deshalb reines SVG (keine neue Abhängigkeit).
- **V-TE-8** Die Konfidenz der Samples (`confidence.*`, 0..1) ist nicht die KF-Skala (`confidenceClasses.ts`:
  Perzentile des Scores je Größe). Die KF-Wörter passen nicht; V2 nutzt drei gesetzte Stufen (`CONF_HIGH`,
  `CONF_MID`, `set`).

## 2 Entscheidungen (vom Agenten getroffen, Jan bestätigt beim Umschalten)

- **E-TE-1** Ansicht als eigener Lazy-Chunk `TourResultV2.tsx`; Schalter aus ⇒ derselbe `resultBody` wie vorher
  (Hilfskomponenten nur verschoben nach `tourResultParts.tsx`, Markup unverändert).
- **E-TE-2** Die Slider-Position lebt in `TourResultV2` (nicht in `TourView`), damit ein Zug nicht die ganze
  TourView rendert; an `TourView` geht sie nur entprellt (für den Sprung in 3D).
- **E-TE-3** `EnrichmentMeta.clusterFusion` (Nummer je Cluster aus den Notizen) — Durchreichung, keine Rechnung.
- **E-TE-4** Werte nur am eingerasteten Sample, keine Interpolation zwischen Samples (Tooltip sagt es).
- **E-TE-5** Kein „Einfärben nach" auf der Gelände-Karte (V-TE-6).
- **E-TE-6** Wetter-Abruf mit Schalter an um 400 ms entprellt; solange die angezeigten Werte zu einem anderen Plan
  gehören (Fingerabdruck ≠), zeigen alle Wetterteile den Wartezustand (Regel V-R3D-3).

- **E-TE-7** Die kleinen Diagramme (Windkomponente, Startzeit-Balken) sind reines SVG statt nivo: `@nivo/bar` fehlt
  (V-TE-7), und die Markierung folgt dem Slider ohne nivo-Neuzeichnung. Die nivo-Kurven (`WeatherProfile`) bleiben unverändert.
- **E-TE-8** Zwei Textprüfungen von `verify:route-3d` (Szene hängt am Wetterzustand) verlangen die alten Zeilen wörtlich; die
  Frische-Sperre der 3D-Szene steht deshalb als eigener Zweig davor (`in3d && !scene3dFresh` ⇒ Wartefeld).

## 3 Umsetzung

- `src/route/tourResultFlag.ts` — Schalter.
- `src/route/tourResultModel.ts` — reine Ableitungen (Windbezug, Anteile nach Strecke, Wechsel, Einrasten, Startfenster, Konfidenzwort, Stand-Etikett).
- `src/route/tourResultParts.tsx` — `QuellenOverlay`, `WindLegend`, `TimeOverview`, `Timeline`, `QualityRow` (aus TourView verschoben).
- `src/route/RouteSlider.tsx`, `src/route/TourResultV2.tsx`, `src/route/tourResult.css`.
- `scripts/verify-tour-result.mjs` (`npm run verify:tour-result`).

Geändert außerdem: `TourView.tsx` (Schalter, entprellter Abruf nur mit Schalter an, Wetter-Zustand trägt den Fingerabdruck
`fp`, mobiler Kopf und Tab-Leiste mit Schalter an), `RouteDeck.tsx` (`DeckTabBar`), `weatherEnrichment.ts`
(`clusterFusion`, `fusionVersionOfForecast`), `package.json` (Skript).

## 4 Gate (Stand 11.11., ohne Browser)

| Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` | grün |
| `npm run verify:tour-result` | 51/51 (12 echte Läufe: 4 Testrouten × Gravel/Wandern/E-Bike; Register 14, Gegenprobe `?rucm=0` = 13) |
| `npm run verify:fusion-release` | 31/32 — C7 rot schon vorher (ICON-D2 in `AtmospherePage.tsx`, nicht angefasst) |
| `npm run verify:route-3d` | 585/589 — rot: Abhängigkeitsliste (`@mui`/`@emotion` in `package.json`, nicht aus TE) und 3× PDF-Knöpfe der 3D-Ansicht (`Route3DView.tsx`, nicht angefasst) |
| `npm run build` | Vite grün; `verify-seo` 1738/1739 („alle lastmod identisch", Sitemap, nicht aus TE) |
| `npm run budget` | alle Grenzen eingehalten (eagerJs 114,2 / 115 KB, totalJs 1 935,7 / 1 985 KB); neuer Chunk `TourResultV2` 11,8 KB JS + 3,9 KB CSS gzip, lädt nur mit Schalter an |

Fünf Fragen:
1. **Funktionserhalt:** jede Funktion der Tabelle §1.2 hat ihren Platz (Code); Schalter aus = alter `resultBody` unverändert.
   Nicht im Browser bestätigt.
2. **Desktop pixelgleich (Schalter aus):** per Code — Markup des alten Ergebnisses unverändert, Hilfskomponenten nur verschoben;
   kein Screenshot-Vergleich (Session-Regel).
3. **Touch-Ziele ≥ 44 px:** Pills, Tabs, Plan-Knopf, Chips, Ereignis-Zeilen, „Übernehmen", „Als Nächstes" per CSS ≥ 44 px;
   Slider-Knöpfe mobil 44 px, auf dem Desktop-Glas 36 px (Maus).
4. **Konsole sauber:** nicht geprüft.
5. **Long Tasks > 200 ms:** nicht gemessen. Der Slider rendert nur `TourResultV2` (Position lokal, E-TE-2), TourView hört sie
   nach 250 ms.

Offen bei Jan: MANUELLE-SCHRITTE §88.
