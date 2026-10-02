# audit/karte-ruckler.md — Phase RK: Ruckler der Wetterkarte 1–2 s nach dem Laden

> Jans Befund (01.10.): „die Windkarte hat nach dem Laden etwa 1 oder 2 Sekunden einen Ruckler".
> Stand: **RK-1 umgesetzt (uncommitted), Gate s. §6.** Messwerkzeug und Rohdaten in `audit/karte-ruckler/`.

## §0 Kurzfassung

- **Bestätigt, in jedem Lauf (8 von 8):** etwa 2–7 s nach dem Aufruf steht die Karte **2,0–2,25 s still**
  (Desktop, ohne Drossel) — mit CPU-Drossel 4× (Handy-Annahme) **7,7 s**. Die Windpartikel bewegen sich
  in dieser Zeit nicht, Eingaben bleiben liegen.
- **Ursache:** `buildDemImage` in `src/sources/iconD2TempSource.ts` baut das Höhenbild der Temperatur
  (1141 × 700 Zellen, je 3 × 3 Abtastpunkte = **7,2 Mio. Aufrufe** von `lookup.sample`) in **einem**
  Hauptthread-Task. Es läuft auf **jeder** Kartenansicht, nicht nur bei „Temperatur": die
  Stadt-Temperaturen sind immer sichtbar, deshalb lädt die Karte das Temperaturgitter im Leerlauf
  nach dem Hero-Layer (`MapView.tsx:2672–2696`) — und genau dieser Leerlauf ist der Moment, in dem der
  Wind gerade zu laufen begonnen hat.
- **Die Kosten sind fast nur Wiederholung:** je Abtastpunkt rechnet `sample` `Math.log/tan/cos` für die
  Kachel-Zeile (811 ms), baut einen String-Schlüssel und sucht die Kachel in einer `Map` (996 ms) —
  obwohl es nur 3 × 1141 verschiedene Längen und 3 × 700 verschiedene Breiten gibt.
- **Vorschlag RK-1:** dieselbe Rechnung mit vorgerechneten Kachel-Koordinaten je Spalte/Zeile und
  Kachel per Array-Index, in Zeitscheiben mit Rückgabe an den Browser. Im Experiment (echte
  Terrarium-Kacheln, Node) **byte-gleich** zum heutigen Bild (0 abweichende Bytes, Negativkontrolle
  greift), **1,9 s → 0,4 s** Rechenzeit, größte 50-Zeilen-Scheibe 37–87 ms.

## §1 Messung

Eigener Chromium 148 (`ms-playwright/chromium-1223`, `--headless=new`, echte GPU über ANGLE/D3D11, kein
rAF-Drosseln — die MCP-Browser drosseln rAF auf 1 Hz, s. HZ1), Produktion `buscosun.com`,
`/wetterkarte/wind?ort=München…&land=de`, 1440 × 900, frischer Browser-Kontext je Lauf. Im Dokument
vor jedem Skript: rAF-Zeitstempel, `long-animation-frame` mit Skript-Zuordnung, große
`texImage2D`-Uploads. Werkzeug `audit/karte-ruckler/lab.mjs`, Zusammenfassung `2026-10-01-messung.txt`.

| Lauf | Frame-Lücke durch den DEM-Task | erster Wind-Upload (1216 × 746) |
|---|---|---|
| kalt (4 Läufe) | bei 4,6 / 5,2 / 7,1 / 8,0 s: **1 967–2 050 ms** | 2,4–5,5 s |
| warm, zweiter Aufruf (2 Läufe) | bei 1,7 / 3,2 s: **2 150–2 233 ms** | 2,9 / 4,3 s |
| kalt, CPU 4× (1 Lauf) | bei 8,9 s: **7 667 ms** | 6,2 s |

Kalt liegt der Stillstand **nach** dem ersten Windbild (Partikel laufen, dann stehen sie 2 s) — das ist
der gemeldete Ruckler. Warm kann er auch davor liegen und das erste Windbild um 2 s verschieben.

**Zuordnung (CPU-Profil, 250 µs, derselbe Lauf):** Task bei 6,8 s, 2 231 ms —
`$h` (MapView-Chunk = `buildDemImage`) 2 302 ms inklusiv, darin `_` (`sample`) 996 ms selbst,
`T` (`lat2tileY`) 811 ms, `R` (`lng2tileX`) 103 ms, `P` (`decodeTerrariumPixel`) 31 ms, Schleife selbst 366 ms.
`long-animation-frame` nennt den Einstieg `resolve-promise:Promise.resolve@elevation-*.js` (das Ende von
`loadElevationLookup`) — das ist derselbe Task.

## §2 Ursache im Code

- `src/sources/iconD2TempSource.ts:88–146` `buildDemImage`: `rows = 700`, `cols = 1141` (aus den Ecken
  des Repack-Gitters), Spitzenwert über ein 3 × 3-Subraster je Zelle (QA-Fix D2/D3), alles in einer
  Schleife ohne Unterbrechung. Modul-Cache je Bounds — kostet also **einmal je Seitenaufruf**.
- `src/fusion/elevation.ts:129–152` `sample(lng, lat)`: je Aufruf `lng2tileX`, `lat2tileY`
  (Logarithmus, Tangens, Kosinus), Template-String `${zoom}/${tx}/${ty}` und `Map.get`.
- `src/MapView.tsx:2672–2696`: das Temperaturgitter (mit DEM) lädt auf jeder Kartenansicht im Leerlauf
  (`requestIdleCallback`, Frist 2,5 s) — Jans Vorgabe „Städte-Temperaturen beim Start anzeigen".
  Das Höhenbild braucht die Karte dafür wirklich: Temperatur-Layer (`setDem`), Schneefallgrenze
  (`buildSnowLine`) und die Stadtwerte (`MapView.tsx:3743`, `demImage`) lesen es.
- Bekannt seit LE0 (28.08., `audit/layer-erstbild.md`: „Long Task `buildDemImage` 2,9–3,4 s", Hebel H1
  „DEM vorgerechnet", Ablage = Jans Entscheidung) — nie umgesetzt.

## §3 Nebenbefunde (nicht der gemeldete Ruckler)

Beim Kaltstart gibt es weitere lange Frames, alle **vor** oder **während** des ersten Windbilds:

| Wann (kalt, Desktop) | Dauer | Zuordnung |
|---|---|---|
| ≈ 0,9 s | 413 ms | Karte anlegen: React-Render + MapLibre `_containerDimensions`/`_setupPainter` (WebGL-Kontext) |
| ≈ 3,2 s | 421 ms | MapLibre `useProgram` — erste Shader-Übersetzung (symbol 200, line 134, fill 87 ms) |
| ≈ 3,6 s | 687 ms (CPU 4×: 1 883 ms) | Layer-`onAdd` beim Style-Load: `ScalarLayer.onAdd` 438 ms in `quadWarpMesh` (Gitter der Geo-Korrektur KL8–KL11), `WindLayer.onAdd` 131 ms |

## §4 Vorschlag

**RK-1 (empfohlen, ohne Datenänderung):** `buildDemImage` rechnet dasselbe, nur ohne Wiederholung:
`lng2tileX` je Sub-Spalte (3 × 1141) und `lat2tileY` je Sub-Zeile (3 × 700) einmal vorab, die Kacheln in
einem Array nach (x − x0, y − y0), dieselbe Bilinear-Formel; die Zeilenschleife läuft in Zeitscheiben
(Rückgabe an den Browser nach ≈ 8 ms) statt in einem Block. Dafür braucht `elevation.ts` eine **additive**
Ausgabe der geladenen Kacheln (z. B. `loadElevationTiles`); `loadElevationLookup` und damit die
Rasterfusion bleiben unverändert.
Experiment `audit/karte-ruckler/dem-bench.mjs` (90 echte z7-Kacheln, 3 Wiederholungen):

| | heute | RK-1 |
|---|---|---|
| Rechenzeit (Node, Desktop) | 1 836–1 964 ms | 401–475 ms |
| größter Block ohne Rückgabe | 1 836–1 964 ms | 37–87 ms (50 Zeilen; mit Zeitbudget kleiner) |
| Bytes des Höhenbilds | — | **0 abweichend** von 3 194 800; verschobene Negativkontrolle weicht ab |

Erwartung im Browser: Desktop-Stillstand 2,2 s → keiner (Scheiben < 16 ms bei Zeitbudget); Handy 7,7 s
→ ≈ 1,6 s Rechenzeit verteilt auf viele kurze Scheiben. Prüfung: neuer Verifier (Byte-Gleichheit gegen
die alte Rechnung auf Fixture-Kacheln + Negativkontrolle), Lab-Messung vorher/nachher, typecheck,
Build, Budget.

**RK-2 (später, größerer Hebel):** das Höhenbild einmal vorrechnen und ablegen wie `hsurf-v1.png`
(LE0-H1). Spart zusätzlich die 90 Terrarium-Kacheln von S3 bei jedem Kaltstart. Offen seit 28.08.:
Ablage Daten-Repo oder `public/` — **Jans Entscheidung (E-RK-2)**.

## §5 Entscheidungen und Verbesserungen

- **E-RK-1: entschieden (Jan, 01.10.): RK-1 umsetzen.** Berührt `src/fusion/elevation.ts` (Rasterfusion)
  nur additiv (eine neue Funktion, die Rasterfusion bleibt unverändert).
- **E-RK-2:** RK-2 (vorgerechnetes Höhenbild) und Ablageort.
- **V-RK-1** Layer-`onAdd` baut alle `quadWarpMesh`-Gitter beim Style-Load (0,7 s Desktop, 1,9 s CPU 4×),
  auch für Layer, die nie eingeschaltet werden. Mehrwert: ruhigerer Kaltstart, v. a. mobil. Skizze: Gitter
  erst beim ersten Einschalten bauen oder im Worker vorrechnen; vorher messen, welcher Layer wie viel kostet.
- **V-RK-2** (Code gelesen, **nicht** gemessen) Nach dem vollständigen Windgitter setzen `setWindData`/
  `setWindDataPacked` `clearOnNextFrame` — die Schweife werden einmal gelöscht, wenn das frische Gitter das
  erste Bild ersetzt (in jedem Lauf ein zweiter 1216 × 746-Upload 2–5 s nach dem ersten). Mehrwert: kein
  sichtbarer „Neustart" der Partikel. Skizze: erst am Bildschirm prüfen, ob man es sieht; dann beim
  Wechsel innerhalb derselben Gültigkeitszeit nicht löschen. WebGL-Pfad ⇒ STOPP & FRAGEN.

## §6 Umsetzung RK-1 und Gate (01.10.)

**Geändert.**

| Datei | Änderung |
|---|---|
| `src/sources/demGrid.ts` (neu, DOM-frei) | `buildDemRgba(tiles, bounds, rows, demMax, { sliceMs, signal, yieldFn })`: Kachel-Koordinaten je Sub-Spalte/Sub-Zeile vorab, Kachel per Array-Index, Zeitscheiben (8 ms, dann `scheduler.yield`/`MessageChannel`), Abbruch zwischen den Scheiben |
| `src/fusion/elevation.ts` | **nur ergänzt:** `ElevationTiles`, `loadElevationTiles` (dieselben Kacheln, dieselbe Nebenläufigkeit 6); `loadElevationLookup` und alle Helfer wortgleich zu HEAD (vom Verifier geprüft) |
| `src/sources/iconD2TempSource.ts` | `buildDemImage` = `loadElevationTiles` + `buildDemRgba` + `putImageData`; Modul-Cache unverändert |
| `scripts/verify-dem-build.mjs` (neu), `package.json` | `verify:dem-build` |

**Belege.**

- `verify:dem-build` **21/21** mit `DEM_TILES` (90 echte z7-Kacheln), sonst 20/20 + 1 ⊘: Höhenbild byte-gleich
  zur wortgleich übernommenen alten Rechnung (Fixture mit Meer, negativen Höhen, fehlender Kachel: 0 von
  3 194 800 Bytes; echte Kacheln: 0), Negativkontrolle weicht ab (5 326 Bytes), Nullzellen gleich, neu
  406–427 ms gegen alt 1 883–2 333 ms im selben Lauf, mit 8-ms-Budget 46–47 Rückgaben und größter Block
  10–11 ms, Abbruch ⇒ `AbortError`, Verdrahtung, `elevation.ts`-Bestand wortgleich zu HEAD, Formeln in
  `demGrid.ts` wortgleich zu `elevation.ts`. Rot vor der Umsetzung gesehen (Modul fehlte: 5/9).
- typecheck 0, Build 249/249, `npm run budget` grün (eagerJs 108,6 / 108,7, totalJs 1 513,6 / 1 514 — der
  Arbeitsbaum trägt fremde uncommittete Änderungen in `cubeSource.ts`); die Verifier, die
  `iconD2TempSource.ts` lesen: `verify:layer-erstbild` 38/38, `verify:repack` 347/347, `verify:dashboard` 80/80.
- **Browser** (`lab.mjs`, eigener Chromium, verschränkt: neuer Build über `vite preview` gegen Produktion,
  Daten jeweils vom echten CDN/S3; Rohdaten `audit/karte-ruckler/gate/`):

| | Kacheln fertig | Höhenbild hochgeladen | größte Frame-Lücke danach | langer Task in `elevation` |
|---|---|---|---|---|
| alt, Runde 1 | 7,8 s | 9,9 s | **2 033 ms** | 2 044 ms |
| neu, Runde 1 | 6,3 s | 7,0 s | **33 ms** | — |
| alt, Runde 2 | 6,2 s | 8,3 s | **2 067 ms** | 2 089 ms |
| neu, Runde 2 | 6,9 s | 7,7 s | **50 ms** | — |
| alt, CPU 4× | 9,1 s | 16,6 s | **7 400 ms** | 7 417 ms |
| neu, CPU 4× | 8,6 s | 12,9 s | **100 ms** | — |

  Das Höhenbild ist neu außerdem 1,4–3,7 s früher fertig (die Rechnung selbst ist 4,6× schneller).

**Fünf Fragen.** (1) Funktionserhalt: Temperatur-Layer, Schneefallgrenze und Stadtwerte lesen dasselbe
Höhenbild — byte-gleich bewiesen; nichts entfernt. (2) Desktop pixelgleich: folgt aus (1), das Höhenbild ist
die einzige geänderte Eingabe. (3) Touch-Ziele: keine UI-Änderung. (4) Konsole: in allen Lab-Läufen keine
Warnung, kein Fehler. (5) Long Tasks: der 2-s- bzw. 7,4-s-Task ist weg; die langen Frames beim Kaltstart
(§3, V-RK-1) bestehen unverändert. Real-Device (Handy) steht aus — die CPU-Drossel ist eine Annahme.

**Kontrolle unter Last (21:20 UTC, verschränkt alt/neu, je 3 Läufe; ein fremder Vite-Dev-Server hielt die Maschine bei
80 % Last, `gate/2026-10-01-ab-unter-last.txt`):** alt DEM-Task 2 830 / 2 843 ms (im dritten Lauf kam das Höhenbild im
12-s-Fenster gar nicht an), neu in keinem Lauf ein DEM-Task; im Rechenfenster des Höhenbilds neu nur MapLibre-Render-Frames
(250–364 ms, kein `demGrid` zugeordnet). Die Start-Frames der Karte (§3) sind unter dieser Last in beiden Builds lang
(alt bis 3,6 s, neu bis 2,9 s) — das ist V-RK-1, nicht RK-1.
