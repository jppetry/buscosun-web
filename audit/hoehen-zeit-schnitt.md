# audit/hoehen-zeit-schnitt.md — Diagnose: Höhen-Zeit-Schnitt am Ort im Regenradar (Phase HZS)

> Stand: 2026-10-09. Auftrag Jan 09.10.: im Regenradar ein Höhen-Zeit-Schnitt am gewählten Ort (x = 48 h | 14 Tage,
> y = 0–4 000 m; Gelände 10 km, Ortshöhe, Schneefallgrenze als Band + Linie, Nullgradgrenze, Niederschlagssäulen nach
> Phase, Satz „Schnee bis zu dir ab …", Hover, Textfassung). Zweiter Modus neben „Relief" in „Karte + 3D" bzw. im
> Reiter „3D". buscosun Fusion nur nutzen, nicht ändern. **Diagnose vor Code** (CLAUDE.md, Harte Regeln).
> Konzeptvorlage: `audit/niederschlagsplattform-konzept.md` §7 (E-NP-6 „Höhen-Zeit-Schnitt zuerst").
> Diagnose ohne Code; Umsetzung nach Jans Entscheidungen in §7 (uncommitted, hinter `?hzs=1`).

## 0. Kurzfassung für Jan

- **Gebaut ist davon nichts.** Es gibt im Regenradar weder einen Höhen-Zeit-Schnitt noch „Karte + 3D", einen Reiter
  „3D" oder einen Modus „Relief". Die einzige Ansichtswahl ist „Karte | Diagramm" (`NowcastDeck.tsx:125`).
- **Parallel läuft Phase ZT** (`audit/zelltuerme-3d.md`, heute 14:34, uncommitted, nur Diagnose): sie plant genau den
  Umschalter „Karte | Karte + 3D | 3D", den Mobil-Reiter „3D" und das Relief mit Zelltürmen — E-ZT-1…10 offen.
  Der Höhen-Zeit-Schnitt hängt an derselben Hülle ⇒ **Zuschnitt zwischen ZT und HZS ist die erste Entscheidung (E-HZS-1).**
- **Vorhanden und wiederverwendbar** (§1): Schneefallgrenze p10/p50/p90 je Schritt in `PointForecastV2`, Schneeanteil
  `pSnow`, Niederschlag mit Hürden-Verteilung, Ortshöhe `v2.point.hTrue`, die Druckflächen-Temperaturen des Cubes am
  Ort (`fc.cube.cells`, wie im Dashboard), die hypsometrische Höhe (`profileColumn.ts`), der Terrarium-Abruf.
- **Was buscosun Fusion NICHT liefert** (§2) und als sichtbare Lücke bleibt: Schneefallgrenze **ab ≈ 120 h** (Stufe t3
  führt sie in keiner Quelle) ⇒ im 14-Tage-Modus ist das Band nur an den ersten 5 Tagen da; **Spanne** nur, wo der Cube
  eine σ-Ebene hat (t2 außerhalb der ICON-CH-Domäne ⇒ nur Linie); **keine Nullgradgrenze** im Produkt — sie wird
  außerhalb von Fusion aus T925/T850/T700 abgeleitet (E-HZS-4).
- **Gelände im 10-km-Umkreis** gibt es nicht als Funktion; neu und klein: Terrarium z10 auf einer Kreisscheibe, eigener
  Abruf, 1–4 Kacheln (§3).
- **Neun Entscheidungen** E-HZS-1…9 (§5), jeweils mit Empfehlung; **E-HZS-10:** seit 09.10. voreingestellt an, `?hzs=0` = Rückfall (§7.4).

## 1. Was schon da ist

| Baustein | Ort | Zustand | Nutzen für HZS |
|---|---|---|---|
| Ansichtswahl Regenradar | `src/nowcast/NowcastDeck.tsx:125, 223-230, 386-390` | „Karte \| Diagramm" (Dock + Glas-Umschalter) | — (kein 3D) |
| Mobil-Reiter | `NowcastDeck.tsx:94, 696-760` | Schnellblick · Zeitachse · Diagramm · Layer · Detail, Blatt 34/92 vh, JS-geschaltet (`useIsMobile`, 767 px) | Reiter „3D" (ZT) bzw. eigener |
| Kennzahl „Schneegrenze" | `NowcastDeck.tsx:533, 941`, `nowcastEngine.ts:245-251, 336` | **Mittel** der NWP-Stunden aus `hours[].snowLineM` = roher Zellwert, nicht `v2.snowline.p50` (V-HZS-1) | bleibt unverändert |
| Tal/Grat-Satz | `NowcastDetail.tsx:121-135`, `alpineSplit.ts:104-127` | Grat = Ortshöhe + 1 000 m **Konstante** (`RIDGE_RELIEF_M`) | der 10-km-Wert könnte sie später ersetzen (V-HZS-2) |
| Kartennotiz / PointStrip | `NowcastRadarMap.tsx:772-777`, `radar/PointStrip.tsx:71,128` | „Schneefallgrenze ~X m" am Punkt | bleibt |
| Dashboard `TerrainField` | `src/dashboard/TerrainField.tsx`, `model/build.ts:692-770` | SVG-Querschnitt Gelände ± km, Isothermen aus `gammaEff`, Schneefallgrenze `v2.steps[0].snowline.p50` (P72) — **ein Zeitpunkt, kein Zeitverlauf** | Muster (SVG, Herkunft je Wert), Datenweg `forecastStore.ts:101-104` |
| Höhenprofile mit Schneefallgrenze | `route/RouteScrubber.tsx`, `route3d/Route3DView.tsx:1364-1388` | Strecke, nicht Ort/Zeit | — |
| Nullgradgrenze | `atmosphere/VerticalProfile.tsx:159-164`, `threed/soundingMath.ts:150-174` | aus ICON-EU-Sondierung (Live), nicht aus dem Cube | Rechenmuster (Durchgang warm → kalt) |
| Feldbilder `snowlmt-LLL.png` | `src/point/fieldFormat.ts:160-200` | Vertrag da, **kein Leser in `src`** | nicht nötig (am Ort gibt es V2) |
| Diagramme im Regenradar | `NowcastBarChart.tsx`, `PrecipSumsUi.tsx`, `PrecipChanceUi.tsx` | durchweg **handgeschriebenes SVG**, kein nivo | gleiche Art |

**Wo die Seite heute den Ort und die Zeit hat:** der Readout zeigt immer die Seiten-`location`; ein auf der Karte
gesetzter Punkt bleibt in `NowcastRadarMap` (`point`, `:229`, zweiter `buildNowcast` `:385-394`) und erreicht den Readout
nicht. Die Slider-Zeit (`profileTimeMs`, `:602-603`) geht nur über `onTimeChange` nach oben und ist heute nur im
Chance-Modus verdrahtet (`NowcastDeck.tsx:151-163`). Der Slider reicht vom Rückblick bis ≈ +2 h (Radarstapel).

**Fusion im Regenradar:** `buildNowcast` holt 8 h (mit Regenbeginn 25 h) und behält nur abgeleitete Felder; der Readout
hat **kein** `PointForecastV2`. Die Karten Chance/Summe/Zelle holen Fusion je eigens (`usePointChance.ts:40`,
`usePointSums.ts:121`). Für 336 h braucht der Schnitt einen eigenen Abruf wie das Dashboard (`getPointForecastFromCube`,
`hours: 336`, `pointSource: 'cube'`, Stufe = Register `FUSION_CURRENT`).

## 2. Was buscosun Fusion am Ort liefert (am Code geprüft)

| Größe | Feld | Herkunft / Rechnung | Zeitraster | Lücken |
|---|---|---|---|---|
| Schneefallgrenze (wahrscheinlichste Linie) | `v2.axis.steps[i].vars.snowline.p50` (= `mean`), m ü. NN | `fromCell` (`output.ts:284-300`): Modellwert SNOWLMT der Cube-Probe (2×2-gewichtet), **nicht fusioniert, nicht höhenkorrigiert** | nur native Schritte: 0–48 h stündlich, 51–120 h 3-stündlich | **> ≈ 120 h immer null** (t3: keine Quelle, `fieldFormat.ts:11`); interpolierte Stunden null; Stationsstunden null; ICON-CH maskiert SNOWLMT ohne Niederschlag (`sourceMatrix.ts:235`) |
| Spanne (untere/obere Grenze) | `snowline.p10` / `p90` | Normal: Wert ∓ 1,2816·σ, σ = `snowlmt_sd_ens`, sonst `snowlmt_sd` (Streuung der Quellen); `sigmaKind` ensemble/divergence/none | wie oben | ohne σ-Ebene null (`noSigmaPlane`) — t2 außerhalb ICON-CH hat nur ICON-EU ⇒ **kein Band** |
| Niederschlag je Stunde | `vars.precip` (mm/h; in t2/t3 Rate des 3/6-h-Schritts), `dist.pDry` | Hürden-Lognormal, Lernstufe | stündlich (Zwischenstunden interpoliert, ohne `dist`) | ≤ 336 h |
| Schneeanteil / Phase | `vars.pSnow` (0…1) = „fällt, wenn etwas fällt, als Schnee" | Feuchtkugel-Phase aus T-Verteilung am Ort + RH (`fuse.ts:884-893`, `meteo.ts:104-113`) | native Schritte, Station, Klimaschwanz | interpolierte Stunden null; Klasse über `phaseLabel` (`meteo.ts:122`: ≥ 0,75 Schnee, ≤ 0,25 Regen, sonst Schneeregen) |
| Ortshöhe | `v2.point.hTrue` | Station ≤ 250 m (E-F-12), sonst Terrarium z11/z8 | — | null ⇒ keine Verteilungen (`noTerrain`) |
| Nullgradgrenze | **nicht im Produkt** | — | — | abzuleiten (E-HZS-4) |
| Druckflächen am Ort | `fc.cube.cells[].v.t925/t850/t700` (°C, roh, nächste Zelle) | Phase DB, „v2 und Rechnung unberührt" (`cubeSource.ts:1931`) | native Schritte, alle drei Stufen bis 336 h | **keine Geopotentialhöhen** im Cube; `ps`/`t2m` am Ort aus V2 (`vars.ps` hydrostatisch auf h_true, `vars.t2m`) |

Die Nullgradgrenze lässt sich ohne Eingriff in Fusion bestimmen: Höhe jeder Fläche hypsometrisch über dem Ort
(`hypsometricHeight(hTrue, ps, t2m, T_p, p)`, `profileColumn.ts:78`), Säule [Ort, 925, 850, 700] linear in z, der erste
Durchgang warm → kalt von unten. Grenzen: über 700 hPa (≈ 3 000 m) gibt es keine Daten; Flächen unter Grund (`ps − p
< 10 hPa`) fallen weg (Regel aus `pressureProfileFromCell`).

## 3. Gelände im Umkreis von 10 km

- Keine Funktion liefert Min/Max/Perzentile in einem **Radius**. `terrainScales` (`fusion/terrainScale.ts:80`) gibt
  Ringmittel bis 12 km mit 8 Proben je Ring (zu dünn für ein Maximum); `zoneTerrainMetrics` (`event/eventTerrain.ts:129`)
  Min/Max über ein Rechteck mit ≤ 64 Punkten.
- Der Fusion-Leser lädt am Ort schon Terrarium z11 (2,5 km) und z8 (20,5 km), `point/client/terrain.ts:175` — der
  Abtaster ist intern, eine Erweiterung würde den Cache-Schlüssel und den Fusion-Eingang berühren ⇒ **nicht anfassen**.
- **Vorschlag:** eigener kleiner Abtaster mit `loadElevationLookup` (`src/fusion/elevation.ts:91`) auf **z10** (≈ 105 m/px
  bei 47° N, eine Kachel ≈ 27 km breit ⇒ 1–4 Kacheln ≈ 100–400 KB), Kreisscheibe r = 10 km im Raster ≈ 250 m
  (≈ 5 000 Proben), daraus Min, P10, P50, P90, Max. Nur geladen, solange der Schnitt offen ist.

## 4. Was fehlt (Bauplan, nach den Entscheidungen)

| AP | Inhalt | Ort (neu, additiv) |
|---|---|---|
| HZS-a | Daten: Fusion 336 h am Ort (eigener Abruf, Stufe aus dem Register), Ableitung Nullgradgrenze, Gelände 10 km | `src/nowcast/heightTime/model.ts` (rein, testbar), `useHeightTime.ts` |
| HZS-b | Diagramm SVG: Gelände, Ortshöhe, Band + Linie, Nullgrad gestrichelt, Säulen nach Phase, Zeitlinie, Lücken schraffiert | `HeightTimeChart.tsx`, `heightTime.css` (Tokens Sand/Ink, `--nc-blue`, Regen-/Schneefarben der Seite) |
| HZS-c | Satz „Schnee bis zu dir ab Do 03:00 (zwischen 23:00 und 07:00) · buscosun Fusion ‹n›" | `model.ts` (Regel E-HZS-6) |
| HZS-d | Hover/Tippen: Stunde → Grenze, Spanne, Niederschlag, Phase; Tastatur | `HeightTimeChart.tsx` |
| HZS-e | Textfassung für Screenreader unter dem Diagramm | `HeightTimeChart.tsx` |
| HZS-f | Einhängen (Ansicht/Modus, Mobil-Reiter), Slider-Zeit nach oben, gewählter Punkt | je nach E-HZS-1/7 in `NowcastDeck.tsx`/`NowcastRadarMap.tsx`, additiv |
| HZS-g | Verifier `verify:height-time` (Modell an echten V2-Fixtures inkl. Lücken, Nullgrad gegen Hand-Rechnung + Negativkontrolle, Satz-Regel, Gelände-Statistik), Pixel-Diff ohne Schalter 0 px | `scripts/verify-height-time.mjs` |

## 5. Entscheidungen (Jan)

| Nr. | Frage | Empfehlung | Alternativen |
|---|---|---|---|
| E-HZS-1 | Einhängen, solange es „Karte + 3D"/„3D"/„Relief" nicht gibt (ZT plant die Hülle) | HZS baut das Diagramm als **eigenständige Komponente** und hängt es in die ZT-Hülle als zweiten Modus; bis die Hülle steht, sichtbar hinter `?hzs=1` als dritte Ansicht „Karte \| Diagramm \| Höhe" (Desktop) und eigener Reiter „Höhe" (mobil); zieht mit ZT in „3D" um | HZS baut die Hülle selbst (Umschalter + Reiter „3D", Modus-Umschalter erscheint erst mit Relief) — Konfliktgefahr mit ZT im selben `NowcastDeck.tsx` · warten, bis ZT die Hülle gebaut hat |
| E-HZS-2 | Gelände-Silhouette (die x-Achse ist Zeit, Gelände hat keine Zeit) | **waagerechte Schichten**: dunkles Grau 0 … Tal (Min), helleres Grau Tal … Grat (Max), feine Linie bei P50, Beschriftung „Tal 480 m · Grat 1 840 m" links | gezackte Silhouette aus einem W–O-Profil durch den Ort (sieht nach Berg aus, x-Bedeutung falsch) · hypsometrische Kurve |
| E-HZS-3 | Zeitraster | nur **native Cube-Schritte** zeichnen: 48 h stündlich; 14 Tage mit 3-h-/6-h-Säulen in Schrittbreite („nie verteilt", wie E-RC-1); Linie/Band verbinden native Schritte, Lücke wo null | interpolierte Stunden mitzeichnen (Fusion liefert dort für Grenze und Phase null) |
| E-HZS-4 | Nullgradgrenze | aus T925/850/700 des Cubes + Ortswerten hypsometrisch (§2), erster Durchgang warm → kalt; T am Ort < 0 ⇒ Linie auf Ortshöhe mit Vermerk „am Boden"; **über 700 hPa nicht fortgeschrieben** ⇒ Lücke mit Pfeil „über ≈ 3 000 m" | mit dem 850–700-Gradienten bis 4 000 m fortschreiben (markiert „fortgeschrieben") · Standardatmosphäre statt Hypsometrie |
| E-HZS-5 | Säulen | Höhe = Erwartungswert `precip.mean` (mm/h), Farbe nach `phaseLabel(pSnow)` 0,25/0,75; ohne `pSnow` neutrales Grau („Phase unbekannt") | Median (bei Schauern oft 0) · Deckkraft nach P(nass) |
| E-HZS-6 | Satz „Schnee bis zu dir" | „ab" = erste Stunde mit p50 ≤ Ortshöhe; „zwischen" = erste Stunde p10 ≤ Ortshöhe … erste Stunde p90 ≤ Ortshöhe; ohne Band nur „ab … (ohne Spanne)"; schon jetzt darunter ⇒ „Schneefallgrenze liegt schon unter dir"; nie ⇒ „bleibt über dir (tiefster Wert ≈ X m, Do 05:00)"; **Zusatz „— aber kaum Niederschlag", wenn P(nass) < 30 % um den Zeitpunkt** | Satz nur, wenn auch Niederschlag erwartet wird |
| E-HZS-7 | Welcher Ort | der **gewählte Punkt** auf der Karte, sonst der Seiten-Ort (additiv: `NowcastRadarMap` meldet den Punkt nach oben) | immer der Seiten-Ort wie der übrige Readout |
| E-HZS-8 | Zeitlinie | folgt dem Slider (−2 h … +2 h) über `onTimeChange` (für alle Modi verdrahtet, additiv); Klick ins Diagramm setzt die Slider-Zeit nicht (der Slider reicht nicht bis 14 Tage) | Klick setzt Zeit, soweit im Stapel |
| E-HZS-9 | Freischaltung | hinter `?hzs=1`, voreingestellt aus (Rule 2) | gleich an |
| E-HZS-10 | Einschalten (Jan 09.10.: „du kannst das Feature einschalten“) | voreingestellt **an**, `?hzs=0` = Rückfall (§7.4) | — |

**Jans Entscheidungen (09.10.):** E-HZS-1 eigenständig + Interim (`?hzs=1`, „Karte | Diagramm | Höhe", Mobil-Reiter
„Höhe", Umzug in die ZT-Hülle als Modus neben „Relief"), E-HZS-2 waagerechte Schichten, E-HZS-4 Lücke + Hinweis über
700 hPa, E-HZS-6 Satz immer mit Trocken-Zusatz — je die Empfehlung. E-HZS-3/5/7/8/9 nach Empfehlung (nicht widersprochen).

## 6. Befunde

- **V-HZS-1** Die Kennzahl „Schneegrenze" im Readout ist das Mittel des **rohen** Zellwerts über die NWP-Stunden
  (`nowcastEngine.ts:245-251, 336`), nicht `v2.snowline.p50` (2×2-gewichtet). Mehrwert: dieselbe Zahl wie im Schnitt.
  Skizze: `summary.snowLineM` aus `v2` lesen, wenn vorhanden. Nicht Teil von HZS.
- **V-HZS-2** `alpineSplit.ts` setzt den Grat als Ortshöhe + 1 000 m. Mit dem 10-km-Gelände aus HZS ließe sich der echte
  Grat nehmen. Nicht Teil von HZS.
- **V-HZS-3** Fusion führt keine Schneefallgrenze nach ≈ 120 h; die 14-Tage-Ansicht ist dort nur Nullgradgrenze +
  Säulen. Eine eigene Ableitung aus Nullgrad (z. B. Feuchtkugel-Nullgrad − 300 m) wäre eine Fusion-Änderung ⇒ nicht hier.

## 7. Umsetzung (09.10., uncommitted; seit E-HZS-10 voreingestellt an, `?hzs=0` = Rückfall)

**Abweichung von E-HZS-1 im Detail (benannt):** am Desktop ersetzt „Diagramm" die Karte ganz — eine dritte Ansicht dieser
Art hätte Slider und gewählten Punkt verloren (die Karte wäre abgebaut). Die Interims-Ansicht heißt deshalb **„Karte + Höhe"**:
Karte oben (bleibt montiert, Slider und Punkt wirken), Schnitt darunter (`.rr-center.is-split`, ≤ 50 % Höhe, scrollt) —
dieselbe Form wie später „Karte + 3D". Mobil: Reiter „Höhe" nach „Diagramm", Blatt voll.

| Datei | Inhalt |
|---|---|
| `src/nowcast/heightTime/heightTimeModel.ts` | rein: Schneefallgrenze an nativen Schritten (`snowPointsFromV2`, `snowRuns`, `snowGapsOf`), Säulen (`columnsFromV2`, Zerlegung wie `chanceSeries.ts`, nie verteilt), Nullgradgrenze (`freezingLevel`, `freezeFromCells`), Gelände-Statistik, Satz (`snowSentence`), Stunde (`infoAt`), Textfassung (`srText`) |
| `src/nowcast/heightTime/terrainRing.ts` | Terrarium z10 über `loadElevationLookup`, Kreisscheibe 10 km im 250-m-Raster (5 025 Proben), Min/P10/P50/P90/Max, Speicher je Ort |
| `src/nowcast/heightTime/useHeightTime.ts` | buscosun Fusion 336 h am Ort (`getPointForecast`, `pointSource: 'cube'`, progressiv), `cube.v2` + `cube.cells`; `?pf=live` oder Fehler ⇒ benannte Lücke, kein Rückfall |
| `src/nowcast/heightTime/HeightTimeChart.tsx` + `heightTime.css` | SVG ohne WebGL: Säulen-Streifen, Gelände-Schichten, Lücken schraffiert, Band + Linie, Nullgrad gestrichelt (darüber zart gepunktet + „↑ 0 °C über ≈ 3 100 m"), Ortshöhe mit Label rechts, Slider-Linie, Satz am Schnittpunkt mit Führungslinie (Desktop) bzw. Satz über dem Diagramm + Marke „ab So 04:00" (mobil), ohne Schnittpunkt als Zeile über dem Diagramm; Hover/Tippen/Pfeiltasten; Legende, Herkunftszeile, Textfassung `.hzs-sr` (`aria-describedby`); 48 h \| 14 Tage je Browser gemerkt |
| `src/nowcast/heightTime/HeightTimePanel.tsx` | Lazy-Einstieg (Hook + Diagramm in EINEM Chunk) |
| `src/nowcast/heightTime/heightTimeFlag.ts` | `?hzs=1` |
| `src/nowcast/NowcastDeck.tsx` | additiv: Ansicht `height` (Glas-Umschalter + Dock), Reiter „Höhe", gewählter Punkt, Slider-Zeit; ohne Schalter `{}`-Props |
| `src/nowcast/NowcastRadarMap.tsx` | additiv: optionales `onPointChange` |
| `scripts/verify-height-time.mjs` (`verify:height-time`, CI) · `scripts/hzs-probe.mjs` | Verifier; Browser-Probe (CDP, Desktop + Mobil, Bilder, `--fixture=1` speichert die echte Fusion-Antwort) |

### 7.1 Gates

- `verify:height-time` **59/59** (mit `--phase` inkl. H5: `git diff` auf `src/pointForecast`, `src/point`, `src/fusion` leer
  — buscosun Fusion unverändert). Fixtures sind echte Antworten von buscosun Fusion 9 (Stufe `fs`, 336 h, 09.10. 13 UTC):
  Innsbruck 576 m, Obergurgl 1 927 m (`fixture-*.json.gz`, Member-Listen gestrichen).
- Gemessen an den Fixtures: Schneefallgrenze bis +113/+114 h, danach Lücke bis 336 h; Nullgradgrenze an 104 nativen
  Schritten bis 336 h (Innsbruck 83 im Profil / 21 „über 700 hPa", Obergurgl 62 / 41); Säulen 46 (48 h) / 107 (14 Tage).
- typecheck 0, Build 255/255, `npm run budget` grün nach Anhebung totalJs 1 658 → **1 669** (HEAD `e2c3a2c` 1 656,7 →
  1 667,3 KB, +10,6 KB: Lazy-Chunk `HeightTimePanel` 9,5 KB, Rest im Regenradar-Route-Chunk), eagerJs **109,3 unverändert**.
- Nachbarn: `verify:regenchance` 44/44, `rain-window` 63/63, `cell-places` 54/54, `precip-sums` 57 ✓ / 2 ⊘, `fusion-release`
  28/28, `regenradar-profile` 24 ✓ / 1 ⊘, `dashboard` 80/80.
- Browser (`hzs-probe.mjs`, Dev-Server): Bilder `desktop-*-48h.png`, `*-pane.png`, `*-hover.png`, `*-14d-pane.png`,
  `mobile-*-48h.png`; Konsole 0 Fehler/Warnungen (Desktop + Mobil, beide Orte).

### 7.2 Die fünf Selbstprüfungsfragen

1. **Funktionserhalt:** nichts entfernt; „Karte | Diagramm", Dock, Readout, Reiter unverändert; neue Teile nur mit `?hzs=1`.
2. **Desktop pixelgleich ohne Schalter:** `regenradar-wk-pixeldiff.mjs` HEAD-Build gegen Arbeitsbaum-Build
   (`pixeldiff/report.json`): mobil `/regenradar` und `/regenradar/muenchen` **0 px**; Desktop 50 bzw. 67 px — alle im
   pulsierenden Punkt „RADAR LIVE" (Animationsphase, Ausschnitt `pixeldiff/rr-ort-desktop.live-punkt-crop.png`), sonst 0.
3. **Touch ≥ 44 px:** Reiter 65 × 59, Zeitraum-Knöpfe 173 × 44 (mobil per Media Query); Werte per Tippen ins Diagramm.
4. **Konsole sauber:** 0 Fehler/Warnungen (Probe).
5. **Long Tasks:** in headless-shell nicht messbar (bekannt); Rechnung gemessen: `buildHeightTime` 1,1 ms (48 h) /
   2,3 ms (14 Tage), Scheibe 0,4 ms; Real-Device = Jan.

### 7.3 Offen / Befunde aus der Umsetzung

- **V-HZS-4** Die erste Ausgabe von buscosun Fusion kann nur t1 tragen (`pending`) — der Schnitt zeigt dann „weitere
  Stufen folgen …" in der Herkunftszeile und baut sich neu auf; 14 Tage sind erst mit der Kern-Ausgabe voll.
- **V-HZS-5** Die Ortshöhe der Seite und der Fixture-Aufruf unterscheiden sich in Obergurgl um 32 m (1 959 gegen 1 927 m):
  andere Koordinaten (Geocoder-Punkt gegen Hand-Koordinate), dieselbe Regel `hTrue`. Kein Fehler, benannt.
- **V-HZS-6** Umzug in die ZT-Hülle: `HeightTimePanel` ist eigenständig (Props: Punkt, Slider-Zeit, Variante) — ZT hängt
  ihn als Modus „Höhen-Zeit-Schnitt" neben „Relief" ein und nimmt Ansicht `height` / Reiter „Höhe" heraus.
- Real-Device (Jan), Winterfall mit Schnittpunkt im 48-h-Fenster (bis November nur an hochgelegenen Orten zu sehen).
- **V-HZS-7** Zwei parallele Linien berühren dieselben Stellen: **ZT** (`audit/zelltuerme-3d.md`, 3D-Hülle, Reiter „3D")
  und **SK** (`audit/schneefallgrenze-flaeche.md`, Schneefallgrenze als Fläche, ebenfalls ein Satz „Schnee bis zu dir …"
  am Ort und „Karte + 3D"). Beide nur Diagnose, kein Code. Mehrwert: EIN Satz, EINE Hülle. Skizze: SK nutzt
  `snowSentence` aus `heightTimeModel.ts` (rein, importierbar) statt einer zweiten Regel; die Hülle baut, wer zuerst
  committet, die anderen hängen sich ein (`agents.md`, Konfliktregel `NowcastDeck.tsx`).

### 7.4 Eingeschaltet (E-HZS-10, Jan 09.10.: „du kannst das Feature einschalten")

- `heightTimeEnabledFrom` ist voreingestellt **an**; `?hzs=0` / `?hzs=false` = Deck ohne Schnitt (benannter Rückfall,
  derselbe Codepfad wie vorher „ohne Schalter"). Sonst nichts geändert — buscosun Fusion unberührt.
- Gates: `verify:height-time` **58/58** (A1/A2 auf „an" + Rückfall umgestellt, H2/H3 auf `?hzs=0`; H5 nur mit `--phase`),
  typecheck 0, Build 255/255, `npm run budget` grün (totalJs 1 691,1 / 1 693 im Arbeitsbaum mit ZT/SK/ZO).
- Browser (eigener `vite preview` auf einer Kopie von `dist`, Port mit `--strictPort` geprüft): ohne Parameter Desktop
  „Karte + Höhe" da, 48 h / 14 Tage / Hover, mobil Reiter „Höhe" (alle Reiter 55–62 × 59 px, Zeitraum-Knöpfe 173 × 44),
  Konsole 0; mit `?hzs=0` fehlt der Umschalter. Bilder `audit/hoehen-zeit-schnitt/an/`.
- Falle: ein fremder `vite preview` einer Parallel-Sitzung belegte zuerst denselben Port (Prüfung lief gegen deren Stand,
  „Unable to preload CSS") — immer `--strictPort` und die „Local:"-Zeile des eigenen Servers abwarten.

