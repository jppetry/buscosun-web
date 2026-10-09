# audit/zell-orte.md — Diagnose: „Betroffene Orte und Ankunftsfenster" für Gewitterzellen (Phase ZO)

> Stand: 2026-10-09. Phase **ZO**. Auftrag Jan 09.10.: im Regenradar je Zelle die Orte nennen, über die sie in den
> nächsten 60 min voraussichtlich zieht (Zeitfenster statt Minute, Kern „zieht über" / Rand „streift"), Satz für den
> gewählten Ort, Haltestellen-Beschriftung entlang der Bahn, Liste „Zieht über" im Zell-Steckbrief des Readouts,
> AT/CH ehrlich benannt, buscosun Fusion getrennt ergänzt. Diagnose **vor** Code. Zahlen in §3 selbst gemessen
> (Skripte im Scratchpad der Sitzung, Daten: Fixture `scripts/fixtures/konrad3d-sample.xml` + 97 KONRAD3D-Läufe
> 07.10. 10:30 … 09.10. 10:30 UTC, halbstündlich, vom DWD gelesen).

---

## 1. Was schon da ist — und funktioniert

| Baustein | Wo | Stand |
|---|---|---|
| KONRAD3D-Abruf (CDN `cells.json`, Rückfall XML/Listing), Cache 60 s, geteilt von Karte und Deck | `src/sources/dwdKonrad3d.ts`, `src/radar/konrad3d.ts` | fertig (Z1, RD2/RD3) |
| Zellbahnen auf der Regenradar-Karte (MapView-Profil `radar`): Umriss, amtliche Spur, Trichter + Stufen aus den Ellipsen, Zeitmarken +15/30/60, Pfeil, Hervorhebung der Zelle des gewählten Orts (`affects`) | `cellPolygons.ts` `buildCellFeatures`, `cellLayers.ts`, `MapView.tsx` | fertig (Z1/Z2, RR) |
| Zell-Steckbrief als **Karten-Popup** (Klick auf den Schwerpunkt): Zug, dBZ, Echotop, Fläche, Blitzrate, Hinweise Hagel/Böen/Starkregen/Rotation, Fuß „kein amtliches Warnprodukt" | `cellLayers.ts` `renderCellPopup` | fertig |
| Satz zum gewählten Ort für **eine** Zelle (die früheste): „Zelle 231 erreicht dich in 20–35 min." / „Zelle 12 zieht ~12 km südlich an dir vorbei (am nächsten in ~25 min)." — Treffer = Ellipse ∪ Zellkörper je 5-min-Stützstelle (S-Z2-3a), Vorbeizug ≤ 25 km | `cellPolygons.ts` `cellLocationRelevance`/`cellRelevanceText`; gezeigt als Kartenleiste `nc-radar-eta` (`NowcastRadarMap.tsx:687`) und im Dashboard (`dashboard/data/extras.ts`) | fertig |
| Ortsverzeichnis DACH: GeoNames (CC BY 4.0), 7 547 Orte ab 1 500 Ew. mit Einwohnerzahl und Kreis, Gittersuche | `public/fire/places-dach.json` (324 KB / 124 KB gz, Netlify), `src/fire/footprint/places.ts` | fertig (BP3), bisher nur Brandradar |
| Abdeckungsregel des deutschen Radarverbunds: 17 Standorte, 150 km | `src/point/sourceMatrix.ts` `DWD_RADAR_SITES`, `DWD_RADAR_RANGE_KM` | fertig (PA3, für RV gemessen) |
| buscosun Fusion am Ort im Regenradar (Stufe fs): Niederschlagsverteilung je Stunde, P(nass), exakte Überschreitung ≥ 1 / ≥ 5 mm (RC), Böen | `nowcastEngine.ts` (`fusionPWetOf`), `precipChance/` | fertig |

**Fehlt** (nur das wird gebaut):

1. Je Zelle die **Liste der Orte** auf der Bahn mit Zeitfenster und Kern/Rand — gibt es nirgends.
2. **Zell-Steckbrief im Readout** (rechtes Panel; mobil) mit Zellwahl — heute nur Popup auf der Karte. Die Vorlage
   `reference/regenradar2-desktop.dc.html` zeigt ihn (Zellwahl-Chips, Trend-Chip, „AM ORT"), gebaut ist er nicht.
3. **Ortsbeschriftungen entlang der Bahn** der gewählten Zelle — gibt es nicht.
4. **Uhrzeiten** statt Minuten und **Kern/Rand** im Satz zum Ort — der heutige Satz kennt nur Minuten und einen Treffer.
5. **AT/CH-Hinweis** — heute steht nur „KONRAD3D: aktuell keine konvektiven Zellen erkannt (DE)", wenn der Lauf leer ist.
6. **Fusion-Ergänzung** im Steckbrief — gibt es nicht.

**Mobil:** Die App hat keinen Reiter „Jetzt" (der steht nur in der Vorlage `regenradar2-mobile`). Die Tab-Leiste heißt
Schnellblick · Zeitachse · Diagramm · Layer · Detail; das Gegenstück zu „Jetzt" ist **Schnellblick** (`GlancePanel`).

## 2. Die amtlichen Zahlen und was sie hergeben

Je Zelle: Schwerpunkt zur Messzeit `refMs`, Umriss, Fläche (⇒ Zellradius r = √(A/π)), 12 Stützstellen +5 … +60 min mit
Schwerpunkt und `uncertainty_ellipse` (major, minor, angle). **Nicht dokumentiert** ist, welche Wahrscheinlichkeit die
Ellipse umschließt (1σ? 90 %?) und ob die Achsen voll oder halb sind — Z1 liest sie als **volle** Achsen (konservativer
für die Breite). Daraus folgt: **eine Prozentzahl je Ort ist nicht ehrlich ableitbar**, nur eine geometrische Einteilung.

**Vorschlag für Kern und Rand (rein geometrisch, nur aus amtlichen Zahlen):**

- **Kern — „zieht über":** der Ort liegt innerhalb des Zellkörpers (r) um die **amtliche Bahn**. Bedeutung: *folgt die
  Zelle der amtlichen Bahn, zieht sie über den Ort.* Zwischen zwei Stützstellen (5 min, bis 4 km Abstand bei 50 km/h)
  linear interpoliert auf 1 min — sonst fielen Orte zwischen zwei Punkten durch (r ist oft nur 1,5–2 km).
- **Rand — „streift":** nicht Kern, aber im Trichter: Abstand zur Ellipse einer Stützstelle ≤ r (Ellipse ⊕ Zellkörper).
  Bedeutung: *weicht die Zelle innerhalb der amtlichen Unsicherheit ab, kann sie den Ort erreichen.*
- **Zeitfenster:** erste bis letzte Minute, in der der Ort im Trichter liegt (für Kern und Rand gleich), auf 5 min
  gerundet (Auflösung des Produkts), als **Uhrzeit** aus `refMs` + Vorlauf (KONRAD3D liegt ≈ 5 min hinter der Uhr —
  Uhrzeiten sind trotzdem richtig, „in x min" wäre es nicht).
- **Ort liegt jetzt schon unter der Zelle** (Kern bei Vorlauf 0, noch keine Ellipse): eigene Aussage „jetzt unter der
  Zelle", kein Fenster ab +0.

Heutige Treffer-Regel (S-Z2-3a) ist **Ellipse ∪ Zellkörper**, nicht Ellipse ⊕ Zellkörper. Am Rand macht das einen
Unterschied (§3: Lauf 08.10., Zelle 18: 15 gegen 33 Orte ab 1 500 Ew.). Wird die Liste mit ⊕ gebaut, der Satz am Ort
aber weiter mit ∪, widersprechen sich Liste und Satz ⇒ **eine** Regel für beide (E-ZO-1).

## 3. Messung

**Ellipsengröße und Zellradius** (97 Läufe, 80 Zellen, alle mit Ellipsen; Fixture 3 Zellen): +60-Ellipse 21–48 km,
fast kreisrund (z. B. 34,7 × 34,7 km); Zellradius p10/p50/p90 1,6 / 2,1–3,5 / 5,2 km. ⇒ Der Kern ist ein Band von
3–10 km Breite, der Rand reicht bei +60 min bis ±17–24 km. **Der Rand überwiegt fast immer** — die Liste wird von
„streift" dominiert, und das ist die ehrliche Aussage (die Zugbahn ist nach einer Stunde unsicher).

**Orte je Zelle nach Einwohnerschwelle** (Kern · Rand nach ⊕, Spanne über die Zellen mit DACH-Orten auf der Bahn):

| Schwelle | Orte im Verzeichnis | Datei (gz) | Kern je Zelle | Rand je Zelle | Fenster Ø / max |
|---|---|---|---|---|---|
| ≥ 1 500 | 7 547 | 124 KB | 0–10 | 7–57 | 8–16 / 34 min |
| ≥ 5 000 | 3 217 | 47 KB | 0–4 | 0–24 | 8–16 / 33 min |
| ≥ 10 000 | 1 702 | 26 KB | 0–3 | 1–22 | 9–16 / 33 min |
| ≥ 20 000 | 759 | 12 KB | 0–3 | 0–20 | 2–17 / 33 min |

Im Rheinland (07.10. 18:45, 12 Zellen) liegen bei ≥ 10 000 Ew. 6–22 Orte je Zelle im Trichter, in Oberösterreich
(08.10., Zellen 15/18) bei ≥ 10 000 nur 1–4, ab 1 500 aber 15–48. Eine feste Schwelle ist auf dem Land zu grob und
in Ballungsräumen zu fein ⇒ Vorschlag E-ZO-2.

**Reichweite der Zellerkennung** (97 Läufe): Abstand Schwerpunkt → nächster DWD-Radarstandort p50 65 km, p90 117 km,
max 163 km (eine Zelle über 150 km). Das deckt sich mit der Standortregel 150 km (`sourceMatrix.ts`), die für RV
gemessen ist. ⚠ Belegtiefe: ruhige Herbsttage, 80 Zellen; das Z1-Fixture (August) hat eine Zelle am Brenner, 130 km
von Isen.

**Folge für AT/CH:** „In Österreich und der Schweiz gibt es keine Zelldaten" stimmt **nicht ganz** — KONRAD3D meldet
grenznah Zellen (08.10. bei Gmunden/Vöcklabruck, Z1: Brenner) und auch in Tschechien (08.10. bei Pilsen). Richtig ist:
**Zellen werden nur in Reichweite der deutschen Radare erkannt** (≈ 150 km; Wien, Graz, Kärnten, Wallis, Tessin,
Genf liegen außerhalb). Der Hinweis hängt deshalb an der Lage des gewählten Orts (Standortregel), nicht am Land.
Zellen über Nachbarländern außerhalb DACH haben keine Orte im Verzeichnis (GeoNames nur DE/AT/CH) — das wird
benannt („keine Orte aus dem Ortsverzeichnis DE/AT/CH auf der Bahn"), nicht als leere Liste gezeigt.

**Ortsnamen:** GeoNames hat vereinzelt Gemeindezahlen an Ortsteilen (z. B. „Kleinschwabhausen 5 911" bei Dachau) —
für eine Hinweisliste tragbar, als V-ZO-1 vermerkt.

## 4. buscosun Fusion am Ort — was es gibt und was nicht

buscosun Fusion rechnet am Ort je Stunde eine Niederschlagsverteilung (daraus P(nass), P(≥ 1 mm), P(≥ 5 mm) exakt, wie
in RC) und Böen. **Eine Gewittergröße rechnet buscosun Fusion nicht** (Größen: T, Td, RH, Wind, Böe, Niederschlag,
Bewölkung, Druck, Schneefallgrenze, P(Schnee)). Das „Gewitterrisiko" im Regenradar (`nowcastEngine.ts:233`) ist eine
Heuristik aus der Radar-Spitze in mm/h, **nicht** buscosun Fusion — es darf nicht als Fusion beschriftet werden.
Ehrlich ergänzbar ist daher: „buscosun Fusion ‹n›: Chance auf ≥ 5 mm in der Stunde 14–15 Uhr 30 %" (Starkregen-
Nähe) und ggf. Böen; zum Gewitter sagt die Ergänzung nichts. Kein neuer Abruf — die Punktvorhersage liegt im Deck schon
vor. buscosun Fusion wird nur gelesen.

## 5. Plan (nach den Entscheidungen)

- **Rechnen rein und headless** (neu `src/radar/cellPlaces.ts`): `cellPlacePasses(cell, places, opts)` → Liste
  `{ name, pop, kind: 'core'|'edge'|'now', fromMs, toMs, distKm, lon, lat }`, sortiert nach `fromMs`;
  `cellPlaceSentence(...)` für den gewählten Ort. `cellPolygons.ts` bleibt unverändert (nur gelesen).
- **Ortsliste:** schlanke Teilmenge von `places-dach.json` (Schwelle E-ZO-2), erzeugt vom bestehenden
  `scripts/build-places-dach.mjs` (zusätzlicher Ausgang), geladen lazy erst, wenn der Zell-Layer an ist und Zellen da
  sind; Ladeweg E-ZO-5.
- **Readout:** Abschnitt „Zelle ‹id› · KONRAD3D" im `ReadoutBody` (Desktop) und im `GlancePanel` (mobil): Zellwahl
  (Chips, voreingestellt die Zelle des Orts, sonst die stärkste), Satz für den Ort oben, Liste „Zieht über": Name links,
  Fenster rechts, schmales Band (Lage und Breite des Fensters auf der 60-min-Achse), Kern kräftig / Rand hell; Antippen
  zentriert die Karte (`mapInst.easeTo`, Zoom unverändert). Fusion-Ergänzung als eigener, beschrifteter Block darunter.
  Fuß „Hinweis aus dem Radar, keine Warnung · maßgeblich sind die DWD-Warnungen".
- **Karte:** Haltestellen der gewählten Zelle als kleine DOM-Marker über `mapInst` aus `NowcastRadarMap` (Muster
  `temperatureLabels`/Marker-Label RB, eigene Schriften, keine Fremd-Glyphen — Z2 §3): Punkt + „Dachau 14:20–14:35",
  Kern Ink, Rand Ink 55 %, gewählter Ort mit Terrakotta-Rand; ab 9 Marken nur Kern + größte Orte (Rest benannt).
  **`MapView.tsx`, Shader, Zell-Layer unverändert.** Klick auf einen Zell-Schwerpunkt wählt die Zelle zusätzlich
  (der Popup bleibt — Funktionserhalt).
- **Schalter:** `?zo=0` = heutiger Stand (Rule 2); Voreinstellung = E-ZO-6.
- **Verifier** `verify:cell-places` gegen Fixture + echte Läufe (Kern/Rand an Hand gerechneten Orten, Rundung, Sortierung,
  Leerfälle, AT/CH-Regel, Wortsperre D-19 „Warnung/Gefahr/Unwetter/trifft/Tornado"), Pixel-Diff ohne Schalter 0 px.

## 6. Entscheidungen (Jan)

| # | Frage | Empfehlung |
|---|---|---|
| E-ZO-1 | Treffer-Regel für den Rand | Ellipse ⊕ Zellkörper für Liste **und** Satz am Ort (die Kartenleiste übernimmt den neuen Satz), statt S-Z2-3a (∪) |
| E-ZO-2 | Welche Orte | ab 5 000 Ew.; der gewählte Ort immer; höchstens 12 Zeilen (alle Kern-Orte, dann Rand nach Größe), Rest benannt „+ n weitere Orte am Rand" |
| E-ZO-3 | Wort im Kern-Satz | „Zelle erreicht dich voraussichtlich 14:25–14:40" (= laut amtlicher Bahn); „wahrscheinlich" behauptet eine Wahrscheinlichkeit, die die Ellipse nicht dokumentiert |
| E-ZO-4 | Fusion-Ergänzung | P(≥ 5 mm) in der Stunde der Ankunft + Böen-Chance, ausdrücklich „kein Gewitterwert in buscosun Fusion" |
| E-ZO-5 | Ladeweg der Ortsliste | Teilmenge ≥ 5 000 Ew. (47 KB gz) als Lazy-Asset im App-Build (gehasht, lange gecacht, nur bei Zellen geladen) — Alternative Kopie ins Daten-Repo (Jans Gate, BW-Linie) |
| E-ZO-6 | Voreinstellung | an, `?zo=0` Rückfall |

**Entschieden (Jan 09.10.2026, je die Empfehlung):** E-ZO-1 Ellipse ⊕ Zellkörper für Liste und Satz (die Kartenleiste
übernimmt den neuen Satz) · E-ZO-2 ab 5 000 Ew., gewählter Ort immer, höchstens 12 Zeilen, Rest benannt · E-ZO-3
„voraussichtlich" · E-ZO-4 Starkregen (P ≥ 5 mm) + Böen, „kein Gewitterwert in buscosun Fusion". Ohne Gegenwort
übernommen: mobil im Schnellblick, Haltestellen als DOM-Marker, Ortsliste als gehashtes Lazy-Asset (E-ZO-5), an mit
`?zo=0` als Rückfall (E-ZO-6). `cellLocationRelevance` bleibt für das Dashboard unverändert (eigener Verbraucher).

## 7. Befunde

- **V-ZO-1** GeoNames-Einwohnerzahlen an Ortsteilen (Gemeindezahl am Ortsteil) — Mehrwert: Liste nennt keine Weiler als
  „Städte"; Skizze: im Build nur PPL/PPLA*-Klassen mit Gemeindeabgleich.
- **V-ZO-2** Ellipsen-Konvention (voll/halb, Wahrscheinlichkeit) beim DWD erfragen — Mehrwert: Rand ehrlich als Prozent;
  Skizze: Anfrage an opendata@dwd.de, bis dahin geometrisch.
- **V-ZO-3** Reichweite der Zellerkennung an einem Sommertag nachmessen (heute 80 Zellen) — Skizze: dasselbe
  Skript über 48 h im Juni (`audit/zell-orte/coverage.mjs`).
- **V-ZO-4** ~~Die Hervorhebung der Zelle des Orts auf der Karte rechnet weiter mit der alten Regel S-Z2-3a (∪).~~
  **Erledigt 09.10. (§10):** Prop `profileAffectsCellId` in `MapView`, die Karte hebt die Zelle des Satzes hervor. Gemessen:
  an den echten Läufen nicht „selten“ — 323 von 5 030 betroffenen Gitterpunkten (6 %), dort wo sich Zellen überlappen;
  unter den Orten ab 5 000 Ew. im Lauf 07.10. 16 (Moers, Leverkusen, Neuss …).
- **V-ZO-5** ~~Die Leiste über der Karte (`nc-radar-eta`) ist karminrot hinterlegt.~~ **Erledigt 09.10. (§10):** mit ZO als
  Hinweis in Sand/Ink (Zusatzklasse `nc-radar-eta--hint`), `?zo=0` = Bordeaux wie vorher.
- **V-ZO-6** Die Ortsliste kommt aus GeoNames ≥ 5 000 Ew. — Stadtteile großer Städte (z. B. Köln-Porz) fehlen als eigene
  Orte; Mehrwert: in Ballungsräumen genauere Fenster; Skizze: Stadtteile aus `urban/v1` oder OSM `place=suburb`.

## 8. Umsetzung (09.10.2026, uncommitted)

| Datei | Rolle |
|---|---|
| `src/radar/cellPlaces.ts` (neu) | rein: Bahn auf 1 min, `nearEllipse` (Ellipse ⊕ Zellkörper), `cellPassAt` (jetzt/Kern/Rand, Fenster auf 5 min), `cellPlaceList` (≤ 12 Zeilen, Rest gezählt, gewählter Ort immer), `cellPlaceVerdict`/`cellPlaceSentence` (Satz zum Ort), `inKonradReach` (150 km um 17 DWD-Standorte), Schalter `?zo=0` |
| `src/radar/cellPlacesDach.json` (neu, erzeugt) | 3 217 Orte ab 5 000 Ew. aus `public/fire/places-dach.json`; `scripts/build-cell-places.mjs` (offline, `--check`) |
| `src/nowcast/cellFusionHint.ts` (neu) | rein: P(≥ 5 mm) und P(Böe ≥ 60 km/h) im Schritt der Ankunftsstunde, `exceedance` von außen |
| `src/nowcast/useCellPlaces.ts`, `useCellFusionHint.ts` (neu) | Zustand: Ortsliste lazy (`?url`, nur bei Zellen), Zellwahl, Uhr je Minute; buscosun Fusion über `getPointForecast` (cube, nur gelesen) |
| `src/nowcast/CellPlacesCard.tsx`, `cellPlaces.css` (neu) | Readout/Schnellblick: Satz, Zellwahl, „Zieht über" mit Band, Steckbrief (der Popup-Inhalt, eingeklappt), Fusion-Block, Fuß; mobil nur über 767 px |
| `src/nowcast/cellPlaceStops.ts` (neu) | Haltestellen als DOM-Marker, Kern/Rand/gewählter Ort, Beschriftung nach Rang entzerrt |
| `src/nowcast/NowcastRadarMap.tsx` | additiv: Props `onCellsRun`/`cellStops`/`onCellPick`, Klick auf Zell-Schwerpunkt wählt die Zelle (Popup bleibt), Leiste mit dem neuen Satz (`?zo=0` = alter) |
| `src/nowcast/NowcastDeck.tsx` | additiv: Zustand, Karte im Readout (nach dem Hero) und im Schnellblick, Antippen zentriert (`easeTo`, mobil Blatt auf „peek") |

**Unverändert (Verifier H1–H3):** `cellPolygons.ts`, `cellLayers.ts`, `konrad3d.ts`, `MapView.tsx`, `src/pointForecast/fusion/`.
`cellLocationRelevance` bleibt für das Dashboard. Shader, Stil, Daten-Repo, Edge Functions: nicht berührt.

**Im Browser gefunden und behoben:** (1) Ein Vorbeizug, dessen nächster Punkt schon vorbei ist, fiel weg — Köln 3–4 km
neben einer wegziehenden Zelle hieß „keine Zelle"; jetzt „am nächsten jetzt" wie vorher (E4b, mit Gegenprobe auf den
alten Fehler). (2) Außerhalb der Radarreichweite stand unter dem Satz die Liste einer fernen Zelle — jetzt nur der Satz,
die Liste erst nach Antippen einer Zelle (H7).

## 9. Gates (Belege)

| Gate | Ergebnis |
|---|---|
| `verify:cell-places` (neu, in CI) | **54/54** — u. a. B1 4 000/4 000 gegen `pointInEllipse`, B2 3 955/3 955 gegen Abtastung, D an 23 echten Zellen (193 Zeilen), F1 1 211 Sätze ohne Sperrwort |
| `verify:cells` · `verify:rain-window` · `verify:regenchance` · `verify:dashboard` · `verify:precip-sums` · `verify:fusion-release` | grün (63/63, 44/44, 80/80, 28/28 …) |
| `verify:regenradar-profile` | 34/36 — C1b (V-FR-11) und E7 (`src/point/fieldFormat.ts` der RC-Sitzung) rot wie vor ZO, unabhängig |
| typecheck · Build · Budget | 0 · 255/255 · eagerJs 109,3 / 109,4, totalJs **1 656,7 / 1 658** (+7,4 KB lazy, Grenze mit Notiz angehoben); Ortsliste = Asset `cellPlacesDach-*.json` 124 KB (47 KB gz), kein JS |
| Browser (CDP, Lauf 07.10. auf jetzt verschoben eingespielt) | `zell-orte/desktop-moenchengladbach.png`, `mobil-schnellblick.png`, `desktop-wien.png`, `desktop-leerer-lauf.png`, `desktop-zo0.png`; Antippen Heinsberg zentriert (`?lat=50.938&lon=6.96` → `51.064/6.1`); Konsole ohne Fehler/Warnungen in allen Läufen |

**Fünf Fragen:** (1) Funktionserhalt — Popup-Steckbrief, Zellbahnen, Hervorhebung, Leiste (mit `?zo=0` wortgleich alt,
belegt), Dashboard-Satz unverändert. (2) Desktop — ohne Zelldaten nur die neue Karte im Readout; mit `?zo=0` kein neues
Element (Probe: 0 Karten, 0 Marker). Ein Pixel-Diff gegen HEAD ist ohne Schalter nicht sinnvoll, weil die Funktion
voreingestellt an ist (E-ZO-6). (3) Touch-Ziele mobil: Zeilen und Chips 44 px (gemessen). (4) Konsole sauber. (5) Long Tasks:
in headless-shell nicht messbar; die Rechnung ist je Lauf einmal ≈ 3 217 Orte × Vorfilter (Reichweite) — Real-Device offen.
Real-Device = Jans Gate.

## 10. V-ZO-4 und V-ZO-5 (09.10.2026, Jans Auftrag „mach V-ZO-4 und V-ZO-5“, uncommitted)

**V-ZO-4 — Karte und Satz sagen dasselbe.** `MapView` bekommt die optionale Prop `profileAffectsCellId` (nur im Profil): mit
Wert hebt die Karte genau diese Zelle hervor (`affects: 1`, `null` = keine), ohne Prop rechnet sie wie vorher mit
`cellLocationRelevance` (S-Z2-3a). `NowcastRadarMap` reicht mit ZO die Zelle des Satzes durch (aus `cellPlaceVerdict`, derselbe
Aufruf wie die Leiste: Kern, Rand oder Vorbeizug), auch an die alte Karte `?rr=legacy`; mit `?zo=0` fehlt die Prop. Die
Konsolenzeile „Zellbahnen gezeichnet“ nennt beide, wenn sie sich unterscheiden („Standortbezug: Zelle 58 · hervorgehoben
nach ZO: 41“). `cellPolygons.ts`/`cellLayers.ts` unverändert, kein neuer Layer, kein Stil.

Messung (warum es nötig war): an den drei echten Läufen auf einem Gitter um jede Zelle nennen alte Regel und Satz an
**323 von 5 030** betroffenen Punkten eine andere Zelle — immer dort, wo sich Zellen überlappen (die alte Regel nimmt die
früheste ETA über Umriss ∪ Ellipsen, der Satz den Kern vor dem Rand). Unter den Orten ab 5 000 Ew. im Lauf 07.10. sind
es 16, z. B. Moers (alt 58, Satz „Zelle 41 erreicht dich voraussichtlich …“), Leverkusen (55 → 46), Neuss (56 → 58).

**V-ZO-5 — Hinweis, keine Warnung.** Die Leiste über der Karte trägt mit ZO die Zusatzklasse `nc-radar-eta--hint`:
Sand `rgba(250,246,234,0.96)`, Ink `#2C2A26`, Rand Sand-200, leiser Schatten — wie das Marker-Label (RB). Auch der
Ruhe-Hinweis „keine konvektiven Zellen erkannt“ nimmt sie an. Lage, Größe, Mobil-Regeln (`.rm-map .nc-radar-eta`) und die
Grundklasse bleiben (Bordeaux mit `?zo=0`).

**Gates**

| Gate | Ergebnis |
|---|---|
| `verify:cell-places` | **60/60** (54 + H2b + I1–I5): H2 jetzt „MapView nur additiv“ — ohne die V-ZO-4-Zeilen stehen alle Zellbahn-Zeilen wortgleich wie an HEAD (die parallele Phase ZT ergänzt MapView ebenfalls; ihre Zeilen werden nur gezählt), Gegenprobe H2b; I1 Unterschied der Regeln an echten Läufen (323/5 030), I2 hervorgehoben genau die Zelle des Satzes (20 Fälle, nie die der alten Regel), I3 Verdrahtung nur mit Schalter, I4 Sand/Ink ohne Bordeaux und Grundklasse unverändert, I5 Klasse nur mit Schalter |
| `verify:cells` | 133/133 |
| `verify:rain-window` · `verify:regenradar-profile` | 63/63 · 24 bestanden, 0 rot, 1 übersprungen |
| typecheck · Build · Budget | 0 · 255/255 · alle Budgets eingehalten (nur CSS + wenige Zeilen) |
| Browser (CDP, Lauf 07.10. auf jetzt verschoben, Moers) | `zell-orte/v-zo-4-5-desktop-moers.png`: Leiste Sand/Ink „Zelle 41 erreicht dich voraussichtlich 16:20–16:35.“, Konsole „Standortbezug: Zelle 58 · hervorgehoben nach ZO: 41“; `…-moers-zo0.png`: Leiste Bordeaux „Zelle 58 erreicht dich in 50–60 min.“, ohne ZO-Zusatz; `v-zo-4-5-mobil-moers.png` wie Desktop; Konsole ohne Fehler/Warnungen. Werkzeug `zell-orte/v-zo-4-5-probe.mjs` + `shift-run.mjs` |

**Fünf Fragen:** (1) Funktionserhalt — Hervorhebung bleibt (jetzt nach der Regel des Satzes), Leiste, Popup, Haltestellen,
Dashboard unverändert; `?zo=0` exakt vorher (belegt). (2) Desktop — mit ZO nur Farbe der Leiste und ggf. eine andere
hervorgehobene Zelle; die Wetterkarte ohne Profil rechnet unverändert (Prop nur im Profil). (3) Touch-Ziele: nicht berührt
(die Leiste ist kein Bedienelement). (4) Konsole sauber. (5) Long Tasks: keine neue Rechnung (derselbe `cellPlaceVerdict`
wie die Leiste). Bekannt und nicht neu: mobil überdeckt die Leiste die Pille „Über diese Ansicht“ teilweise — Lage seit RL1
unverändert (V-ZO-7).

- **V-ZO-7** Mobil sitzt die Leiste (`top: 6.7rem`) unter der Pille „Über diese Ansicht“ und den Zoom-Knöpfen und schneidet
  sie an (`audit/zell-orte/v-zo-4-5-mobil-moers.png`) — Mehrwert: nichts verdeckt; Skizze: Leiste mobil unter die
  Quellen-Pille links, `max-width: calc(100% - 7rem)`, nur im Mobil-Breakpoint.

