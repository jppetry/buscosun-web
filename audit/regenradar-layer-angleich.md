# Regenradar — Layer-Angleich an die Wetterkarte (RL0 Diagnose · RL1 Umsetzung)

> Stand: 2026-08-25. Jans Auftrag: „Für den Regenradar genau die gleichen Niederschlagslayer,
> Zellbahnen und Schnee verwenden wie in der Wetterkarte — mir ist aufgefallen, dass diese
> einfach besser sind. Integriere sie im Niederschlagsradar und ersetze die aktuellen Layer."
> Das ist eine ausdrückliche **Ausnahme vom Funktionserhalt** für die drei Layer des Regenradars,
> die ersetzt werden (eigene Zellverfolgung, Radar-Phasen-Schnee, Einzelland-Raster).

## 1. Befund: was die beiden Seiten heute zeichnen

| Layer | Wetterkarte (`src/MapView.tsx`) | Regenradar (`src/nowcast/NowcastRadarMap.tsx` + `src/radar/RadarMap.tsx`) | Gleich? |
|---|---|---|---|
| **Niederschlag** | `RainLayer` + `precipRainRamp`, **DACH-Komposit** `PrecipCompositor` (600 × 512 lon/lat, je Zelle die landesrichtige Quelle RADOLAN-RV / INCA / rzc, `precipComposite.ts:118`) | dieselbe `RainLayer`-Klasse, `PALETTES.classic.ramp === precipRainRamp` (`radarModel.ts:149`), aber **nur das Landesradar des Standorts** auf dem nativen Gitter mit Warp-Mesh (`radarFrames.ts:142`); Nachbarländer bleiben leer | Klasse/Rampe ja, **Abdeckung nein** |
| **Zellbahnen** | **amtliches DWD KONRAD3D** (`dwdKonrad3d.ts`, `konrad3d.ts`, `cellPolygons.ts`): Umriss gemessen, Spur + amtliche Unsicherheitsellipsen +5…+60 min, Zeitmarken, Pfeilkopf, Standortbezug, Steckbrief mit Hagel-/Böen-/Starkregen-Hinweisen, 8 Layer (`MapView.tsx:450-458`) | **eigene Verfolgung aus den Radarframes** (`cellTracking.ts`: Zusammenhangskomponenten + Block-Matching zweier Frames), Kreis + Vektor + „Trichter" = Kreis um den letzten Prognosepunkt (`RadarMap.tsx:408`), ETA-Banner „erreicht dich in ~X min" | **nein** — `cellPolygons.ts:8-12` benennt genau das als Qualitätsunterschied |
| **Schnee** | **ICON-D2 `h_snow` (Schneedecke) / `snow_gsp+snow_con` (Neuschnee)** als `ScalarLayer` mit `snowRamp`, Modus-Umschalter, Frame nach Gültigkeitszeit (`MapView.tsx:3881-3902`), seit BW-6 als PNG-Familie über jsDelivr | **Phasen-Heuristik** `classifyPhases` (`precipPhase.ts:119`): Radarintensität × DEM × Schneefallgrenze des Punktforecasts; im Command-Deck gar nicht erreichbar (Dock kennt nur `precip · cells · lightning · snowline`) | **nein** — anderes Produkt, nur `snowRamp` geteilt |

Nebenbefunde (nicht Teil des Auftrags, aber relevant):
- Das Deck übergibt immer `hideLayerbar` — Palette, Basiskarte, Deckkraft, Summe, Radarsicht, Regen/Graupel/Hagel sind auf `/regenradar` nur über einen alten `localStorage`-Stand erreichbar. Sie bleiben im Code (Funktionserhalt), werden hier nicht angefasst.
- `cellTracking.ts` wird nur noch von `src/radar/_verify.ts` referenziert (kein npm-Verifier). Die Datei bleibt (Löschen = STOPP & FRAGEN); die Seite verdrahtet sie nicht mehr.
- `convectiveIndex` nahm `cellIntensifying` aus dem Trend der eigenen Verfolgung. KONRAD3D liefert keinen Trend, wohl aber `severity`/`heavyRainFlag` je Zelle; der Index bekommt jetzt „verstärkend" = Standort-Zelle mit `severityDecimal ≥ 1`. Das ist benannt, nicht kaschiert.

## 2. Ursache des wahrgenommenen Qualitätsunterschieds

1. **Abdeckung**: Von einem DE-Ort aus ist Österreich/Schweiz im Regenradar leer (Sand-Maske), in der Wetterkarte gefüllt. Beide nutzen dieselben drei Loader (`shareInFlight`), nur der Compositor mischt sie.
2. **Zellbahnen**: Die Eigenverfolgung kennt keine Unsicherheitsaufweitung, keine Zeitmarken, keine Begleitgrößen — KONRAD3D ist das amtliche Produkt (Lehre Z1/Z2).
3. **Schnee**: Die Phasenheuristik teilt das *Radarsignal* nach Höhe — sie zeigt nichts, wo es nicht regnet, und irrt an der Schneefallgrenze. ICON-D2 `h_snow` ist eine Schneedecke, `snow_gsp` ein Neuschnee-Feld.

## 3. Plan RL1 (ein Thema, ein Gate)

**Regel: 1:1 heißt importieren, nicht kopieren** (`audit/waldbrand-wind.md`). Die Wetterkarte hält die Zellbahnen-Layerdefinitionen, Sprites und den Steckbrief als MapView-interne Funktionen. Sie werden **herausgelöst** in `src/radar/cellLayers.ts` (+ `cellPopup.css`) und von MapView wie von RadarMap importiert — byte-gleiche Layer-Spezifikationen, ein einziger Ort.

| Schritt | Datei | Was |
|---|---|---|
| RL1-a | `src/radar/cellLayers.ts`, `src/radar/cellPopup.css` | Extrakt aus MapView: IDs, Minzooms, Farb-Expression, `makeCellArrowImage/makeCellMarkImage`, `renderCellPopup`, `installCellLayers(map)`, `bindCellPopup(map)`, `.sp*`-Styles |
| RL1-b | `src/MapView.tsx`, `src/MapView.css` | importiert RL1-a statt eigener Kopie (Refactor, kein Verhaltenswechsel; Desktop pixelgleich) |
| RL1-c | `src/radar/RadarMap.tsx` | (1) Niederschlag: `PrecipCompositor` — eigenes Land = aktueller (ggf. gemorphter) Stack-Frame, Nachbarländer = zeitnächster Frame ihrer Quelle; kein Warp-Mesh, Komposit-Ecken. Benannter Fallback: fehlen die Nachbarquellen, bleibt der Einzelland-Weg. (2) Zellbahnen: `installCellLayers` + `buildCellFeatures` + Horizont 60 min; alte `radar-cone/cells/vectors` entfallen. (3) Schnee: `ScalarLayer` (`snowRamp`, `SNOW_VIS_RANGE`, dieselben Optionen wie MapView) unter dem Regen, Frame per `bracketAtValidTime` zur Zeit des Radarframes |
| RL1-d | `src/nowcast/NowcastRadarMap.tsx` | Nachbarquellen best-effort laden (Muster `loadNowSource` der Wetterkarte, `primeXx` vor dem Tick), KONRAD3D-Poll (5 min, nur sichtbarer Tab, wie `MapView.tsx:3070`), ICON-D2-Schnee lazy je Modus (Seq-Guard wie `installSnow`), Standortbezug-Text statt ETA-Banner |
| RL1-e | `src/nowcast/NowcastDeck.tsx` | Dock/Mobile: `Schnee` (Decke \| Neuschnee) als Toggle, Untertitel der drei Layer benennen die Quelle |
| RL1-f | Verifier | `npm run typecheck`, `verify:cells`, `verify:snow`, `verify:precip-source`, `verify:radar-sampling`, `verify:layer-geometry`, `budget`, Build; Browser-Beleg Desktop/Mobil |

**Nicht angefasst:** Shader (`RainLayer`, `ScalarLayer`), Fusion, Edge Functions, Warm-Crons, die Punktprodukte (Streifen, PoP, Zeitachsen-Profil) — sie lesen weiter den Landes-Stack, weil die Punktabfrage nach RP1/RP2 auf dessen Projektion geeicht ist.

**Bandbreite (bewusst):** Das Komposit lädt je Sitzung die zwei Nachbarquellen dazu (AT ≈ 0,7 MiB, CH ≈ 0,16 MiB, DE ≈ 0,35 MiB) — exakt wie die Wetterkarte, mit denselben entdoppelten Loadern. Schnee kommt seit BW-6 vom CDN, KONRAD3D (~0,6 MB/5 min) nur bei aktivem Layer und sichtbarem Tab.

## 4. Gate GRL1

Wird nach der Umsetzung mit Belegen ergänzt (§5).

## 5. Umsetzung + Gate GRL1 (2026-08-25, 00:15–00:35 lokal, Prod-Preview `vite preview` :4181)

**Gebaut** (uncommitted wie alles seit 2026-07-30):
- `src/radar/cellLayers.ts` (neu) + `src/radar/cellPopup.css` (aus `MapView.css` **verschoben**, nicht kopiert): IDs, Schwellen, `CELLS_SEVERITY_COLOR`, Sprites, `renderCellPopup`, `installCellLayers(map, beforeId?)`, `setCellLayersVisible`, `bindCellPopup`. `MapView.tsx` importiert sie (−16 KB Quelltext dort, Verhalten unverändert — `verify:cells` 133/133, `verify:datenalter` 54/54, `verify:warm-budget` 30/30).
- `src/radar/RadarMap.tsx`: Komposit-Pfad (`PrecipCompositor`, eigenes Land als Ein-Frame-Quelle aus dem Stack ⇒ `nearestBy` trifft exakt den gemorphten Frame; Nachbarn nur ab „jetzt" −2,5 min, sonst stünde still ihre Analyse für eine frühere Zeit), Index-Maps off-main vorgewärmt; KONRAD3D-Layer via `installCellLayers` + Horizont 60 min; `ScalarLayer` `radar-snow-amount` unter dem Regen mit den MapView-Optionen, Frame per `bracketAtValidTime` zur Zeit des Radarframes, Lerp auf 5-%-Schritte quantisiert (läuft je rAF). Die Radar-Phase „Schnee" ist entfallen; `rain/graupel/hail` bleiben.
- `src/nowcast/NowcastRadarMap.tsx`: Nachbarquellen best-effort (`Promise.allSettled`, Fehlgrund geloggt), KONRAD3D-Poll (5 min, sichtbarer Tab), ICON-D2-Schnee lazy je Modus, Standortbezug `cellLocationRelevance` ⇒ Banner mit `cellRelevanceText` (Wortlaut S-Z2-3b) bzw. Ruhe-Hinweis „keine konvektiven Zellen erkannt (DE)"; `cellTracking.ts` ist nicht mehr verdrahtet (Datei bleibt, `_verify.ts` referenziert sie).
- `src/nowcast/NowcastDeck.tsx`: Dock/Mobile-Layerliste mit **Schnee** (Decke | Neuschnee), Untertitel nennen die Quellen; `radar.css`: Banner rückt unter die Quellen-Pille (Desktop 3,1 rem, mobil 6,7 rem).

**Belege**
| Frage | Beleg |
|---|---|
| 1 Funktionserhalt | Niederschlag/Zeitachse/Rückblick/Punktstreifen/PoP/Hover unverändert (lesen weiter den Landes-Stack); Blitze, Schneegrenze, Summe, Radarsicht, Regen/Graupel/Hagel-Phasen erhalten. Ersetzt (Jans Ausnahme): Eigenverfolgung, Radar-Phase Schnee. `convectiveIndex.cellIntensifying` hat jetzt eine andere Quelle (Severity ≥ 1 der Standort-Zelle) — benannt in §1. |
| 2 Desktop Wetterkarte | `/wetterkarte/nowcast` am Preview: Konsole 0 Fehler / 0 Warnungen; Layer-Specs byte-gleich (Modul-Extrakt, keine Wertänderung). |
| 3 Touch-Targets | Deck-Toggles unverändert (`rr-layer`/`rm-layer` ≥ 44 px), Modus-Segment nutzt `rr-seg`/`rm-seg` der Modus-Umschalter. |
| 4 Konsole | Regenradar Prod-Preview: **0 Fehler**. Warnungen: (a) `GeoSphere INCA: keine Frames` — die API lieferte zur Messzeit 0 Leadtimes (Upstream; die Wetterkarte träfe dasselbe), Komposit lief mit rzc weiter (`1/2 Nachbarquellen`); (b) `Expected value to be of type number, but found null` aus dem MapLibre-Worker — **Bestand des liberty-Basemap-Stils**: im Dev-Bisect nach Entfernen aller `storm-cells-*`/`radar-snowline`-Layer und Neuladen der `openmaptiles`-Kacheln erneut aufgetreten; (c) einmalig `WebGL: INVALID_OPERATION: drawArrays: no buffer is bound to enabled attribute` aus `ScalarLayer.render` beim Kaltstart mit persistiertem Schnee-Layer (Prod-Preview, mobil), im Dev-Kaltstart und beim Zuschalten nicht reproduzierbar — V-RL-1. |
| 5 Long Tasks | nicht gemessen (Perf-Trace offen); Komposit-`build()` 307 200 Zellen je Frame ist derselbe Pfad wie der Slider der Wetterkarte, Schnee-Lerp gedrosselt. |

Screenshots: `audit/screenshots/rl1-desktop-1440-default.png` (Kaltstart, z8), `rl1-desktop-1440-z7-snow.png` (Schneedecke ICON-D2, rzc-Anteil am linken Rand sichtbar), `rl1-desktop-1440-final.png` (Ruhe-Hinweis KONRAD3D unter der Quellen-Pille), `rl1-mobile-390.png`. Konsole beim ersten Lauf: `KONRAD3D_20260824T221500.xml · 1 Zellen` (Zelle außerhalb des Ausschnitts, Popup nicht geklickt).

**Verifier**: `typecheck` grün · `verify:cells` 133/133 · `verify:snow` 20/20 · `verify:precip-source` 30/30 · `verify:radar-sampling` 25/25 · `verify:layer-geometry` 15/15 · `verify:datenalter` 54/54 · `verify:warm-budget` 30/30 · `budget` alle eingehalten (totalJs 974,7/1017,7 KB, NowcastRoute-Chunk 33,2 KB gz).

**Gate GRL1: grün mit zwei Vorbehalten** — Perf-Trace (Frage 5) und ein Zellen-Steckbrief-Klick am Regenradar stehen aus (zur Messzeit 0 Zellen in DE).

## 6. V-Katalog
- **V-RL-1** `ScalarLayer.render` zeichnet mit dem global noch aktivierten Attribut 1 (`a_uv` des `RainLayer`), das nach einem Stil-/Geometriewechsel auf einen gelöschten Puffer zeigen kann ⇒ einmalige WebGL-Warnung. Fix: in `ScalarLayer.render` alle nicht genutzten Attribute deaktivieren (oder `RainLayer.setFrame` nach dem Löschen `disableVertexAttribArray`). Beides Shader-/WebGL-Pipeline ⇒ **STOPP & FRAGEN**.
- **V-RL-2** GeoSphere INCA liefert zeitweise 0 Leadtimes (`keine Frames`); die Wetterkarte zeigt dann still kein AT-Radar. Ein Rückfall auf den letzten guten Lauf (Session-Cache wie `pastCache`) würde beide Karten tragen.
- **V-RL-3** Der liberty-Stil von OpenFreeMap wirft je Kachelparse `found null`-Warnungen (nur Regenradar; die Wetterkarte nutzt `positron`). Stil wechseln oder die Warnung dem Stil zuordnen — sonst verschluckt sie echte Warnungen.
- **V-RL-4** Der Steckbrief-Klick der Zellbahnen ist am Regenradar identisch zur Wetterkarte gebaut, aber ungeklickt belegt (0 Zellen zur Messzeit) — bei nächster Konvektion nachholen.

## 7. Abarbeitung der offenen Punkte (2026-08-25, 00:40–00:50 lokal, Jans Auftrag „arbeite die offenen Punkte ab")

| Punkt | Maßnahme | Beleg |
|---|---|---|
| **V-RL-1** WebGL-Warnung `ScalarLayer` | `ScalarLayer.render` deaktiviert nach `bindAttribute` alle anderen aktivierten Vertex-Attribut-Arrays (MapLibre löst vor Custom-Layern das VAO — `drawCustom` → `unbindVAO` —, wir ändern nur den Default-Zustand; kein Shader-Eingriff). Jans Auftrag gilt als Freigabe des Pipeline-Eingriffs. | typecheck grün; Regenradar-Kaltstart mit Schnee + Wetterkarte `temp` ohne WebGL-Warnung (§7 unten) |
| **V-RL-2** INCA 0 Frames | `fetchIncaGrid` hält den letzten guten Lauf der Sitzung und liefert ihn bei Fehlschlag bis 45 min als benannten Rückfall (`staleFromMs` am Ergebnis, Konsolen-Warnung mit Alter). Trägt Wetterkarte und Regenradar. | zur Messzeit kein guter Lauf in der Sitzung ⇒ Rückfall nicht live belegbar; Fehlerpfad („keine Frames") unverändert sichtbar |
| **V-RL-3** liberty `found null` | Bisect im Dev (Symbol-Layer halbiert, Kacheln per `setUrl` neu geparst): Ursache `["<=", ["get","ref_length"], 6]` in `highway-shield-non-us` / `highway-shield-us-interstate` / `road_shield_us`. `patchLibertyRefLength()` in `RadarMap` setzt nach `style.load` `coalesce(ref_length, 99)` — Verhalten identisch (null ⇒ kein Shield), Warnung weg. | Kaltstart z7: **0 Warnungen außer INCA**; `getFilter('highway-shield-non-us')` enthält `coalesce` |
| **V-RL-4** Steckbrief-Klick | Zelle in `storm-cells` injiziert (KONRAD3D hatte 0 Zellen), Klick auf den Schwerpunkt ⇒ Popup mit Kopf, sechs Zeilen, Hinweisen und Fuß, `.sp`-Styles aus `cellPopup.css` aktiv. | `audit/screenshots/rl1-desktop-1440-cell-popup.png` |
| Frage 5 Long Tasks | `PerformanceObserver('longtask')` im Dev-Build: Abspielen 26 s Komposit + Zellbahnen ⇒ **0**; Abspielen 24 s zusätzlich mit ICON-D2-Schnee ⇒ **0**. Beim Schnee-Nachladen ein Task von 1 029 ms = der bekannte Hauptthread-GRIB-Dekode (lokal ohne Repack-Abschnitt im Manifest; in Prod kommt das PNG vom CDN, V-WF-13-Kontrolle). | Messwerte oben |

**Gate GRL1: grün ohne Vorbehalt** (Long Tasks gemessen, Steckbrief belegt). Offen bleibt nur, den INCA-Rückfall bei nächster Gelegenheit live zu sehen.
