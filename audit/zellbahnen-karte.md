# audit/zellbahnen-karte.md — Diagnose: Zellbahnen lesbar machen (Phase Z2)

> Stand: 2026-08-07. Phase **Z2** („Zellbahnen: Lesbarkeit und Standortbezug"). Auftraggeber: Jan.
> Fortsetzung von **Z1** (`audit/zellbahnen.md`, Gate GZ1, umgesetzt 2026-08-05).
> Diagnose **vor** Code (`CLAUDE.md` §Harte Regeln). Alle Zahlen in §2 und §3 sind an
> `scripts/fixtures/konrad3d-sample.xml` und am Code **selbst nachgerechnet**, nicht übernommen.

---

## 1. Was diese Phase ist — und was sie nicht ist

Z1 hat den Layer `cells` gebaut: amtliche Datenbasis, korrekte Geometrie, saubere
Ehrlichkeitsfläche. **Der Datenpfad ist richtig und wird nicht angefasst.** Was fehlt, ist die
Lesbarkeit: Die Karte zeigt heute Objekte, aber sie beantwortet keine Frage. Z2 ändert
ausschließlich, **wie** die vorhandenen Daten gezeichnet und beschriftet werden.

**Enthalten:**

| # | Inhalt |
|---|---|
| Z2-1 | Richtungspfeil an der Prognosespur — Zugrichtung ohne Klick lesbar |
| Z2-2 | Zeitmarken +15/+30/+60 min auf der Spur — „wann ist sie wo" statt einer Linienlänge |
| Z2-3 | Unsicherheits-Trichter mit Verlauf statt einer flächigen Hülle |
| Z2-4 | **Standortbezug**: die Zelle, deren Spur den gewählten Ort trifft, wird ausgezeichnet; ETA als **Spanne**, Vorbeizug als eigene Aussage |
| Z2-5 | Ausdünnung nach Severity und Zoom — Ruhe auf kleinen Karten |
| Z2-6 | Geschwindigkeit und Richtung konsistent zur gezeichneten Geometrie |

**Bewusst nicht Teil dieser Phase** (jeweils mit Begründung, damit es keine stille Auslassung ist):

| Nicht enthalten | Warum | Verbleib |
|---|---|---|
| Steckbrief-Umbau (`trends`, Vertrauen, Klartext/Messwerte-Split) | eigenes Thema, eigenes Gate — `CLAUDE.md`: ein Thema = eine Phase | **V-160** |
| Gemessene Vergangenheitsspur aus dem Poll-Cache | führt neuen Zustand über Zeit ein; gehört zusammen mit dem Zeitmodell betrachtet | **V-161** |
| Slider-Verhalten des Layers (Prognosestand statt Jetzt-Umriss bei +1 h) | berührt das Zeitmodell und damit L5-Gebiet | **V-148** (besteht) |
| Regenradar auf KONRAD3D umstellen | anderer Layer, anderer Bildschirm, eigenes Gate | **V-159**, **V-162**, **V-163** |
| Neue KONRAD3D-Felder in den Datenpfad | Z2 zeichnet nur, was `Konrad3dCell` heute schon trägt | V-160 |

**Kein neuer Datenpfad, kein neuer Abruf, kein zusätzliches Byte.** `dwdKonrad3d.ts` und
`konrad3d.ts` bleiben unverändert. Damit ist auch die Aufrufregel aus `audit/zellbahnen.md` §3
(nur bei aktivem Layer + sichtbarem Tab) unberührt.

---

## 2. Befunde am heutigen Zustand

### 2.1 Die Zugrichtung ist ohne Klick nicht lesbar

`MapView.tsx:351` zeichnet die Prognosespur als `line` mit `line-dasharray`. Eine gestrichelte
Linie hat kein vorne und kein hinten — die Richtung erschließt sich erst aus dem Vergleich mit
dem Umriss. Das ist ein Denkschritt, den die Karte dem Nutzer abnehmen kann.

### 2.2 Die Zeitachse der Spur ist unsichtbar

Die Spur läuft über 60 Minuten, wird aber als gleichförmige Linie gezeichnet
(`cellPolygons.ts:202-216`: **eine** `LineString` über Schwerpunkt + 12 Stützstellen). Die
Information „wo ist sie in einer halben Stunde" ist in der Geometrie enthalten und wird nicht
gezeigt. Nebeneffekt: Weil die Spurlänge die Zuggeschwindigkeit ist, macht dieselbe Markierung
das Tempo auf allen Zellen gleichzeitig lesbar — was mit Zahlenlabels nie ginge.

### 2.3 Der Trichter sagt „unsicher", nicht „nach hinten unsicherer"

`coneRing()` bildet **eine** konvexe Hülle über alle zwölf Ellipsen und zeichnet sie mit
konstanter Deckkraft. Die Aufweitung ist am Fixture erheblich und damit gut darstellbar:

| Vorlauf | Hauptachse | Nebenachse |
|---|---|---|
| +5 min | 2,322 km | 1,646 km |
| +30 min | 7,346 km | 6,421 km |
| +60 min | **16,884 km** | 15,739 km |

Die Ellipse wächst um den Faktor 7,3. Als eine Fläche mit einer Deckkraft geht diese Aussage
verloren — obwohl sie der teuerste Teil des Produkts ist (§4.2 von `audit/zellbahnen.md`:
„der Trichter ist amtlich, nicht geschätzt").

### 2.4 Der Bezug zum gewählten Ort fehlt auf der Karte

`etaMinutesToPoint()` existiert in `cellPolygons.ts:119` und wird **nirgends aufgerufen**
(geprüft über das ganze `src/`). Der Ortsmarker (`MapView.tsx:1132`, aus `location`) und die
Zellen sind zwei Dinge ohne Beziehung. Der Nutzer muss aus bis zu 38 Zellen die richtige
heraussuchen und anklicken, um zu erfahren, ob ihn eine davon betrifft.

Im **Übersichts-Modus** (`overview`, `MapView.tsx:546`) gibt es keinen gewählten Ort. Dort
entfällt der Standortbezug ersatzlos — das ist kein Fehler, sondern die richtige Antwort.

### 2.5 Angezeigte Geschwindigkeit und gezeichnete Spur sind zwei Größen

Am Fixture nachgerechnet: `cell_speed` und die aus der Prognosespur abgeleitete
Geschwindigkeit stimmen **nicht** überein.

| Zelle | `cell_speed` | aus der Spur | Abweichung |
|---|---|---|---|
| 12 | 19,489 km/h | 18,076 km/h | −7,25 % |
| 231 | 23,482 km/h | 23,140 km/h | −1,46 % |
| 126 | 24,637 km/h | 22,889 km/h | −7,10 % |

> **Korrektur aus der Umsetzung (2026-08-07, Gate GZ2).** Die ursprünglich hier notierten
> **23,126 km/h** für Zelle 231 sind die **Luftlinie** Schwerpunkt → letzte Stützstelle. §8 verlangt
> aber den Abgleich mit der **Länge der gezeichneten Spur** (Summe der Segmente) — und die ergibt
> **23,140 km/h**. Nur Zelle 231 hat eine merklich gekrümmte Spur, bei 12 und 126 sind beide Werte
> identisch. Der Unterschied beträgt 0,06 % und liegt weit innerhalb der 1-%-Toleranz; umgesetzt ist
> die Segmentsumme (`trackLengthKm`). **Zweiter Befund, der die Sorge entschärft:** nach der
> 5er-Rundung ist die Umstellung an **allen drei** Fixture-Zellen unsichtbar (20/25/25 vorher wie
> nachher). S-Z2-2 ändert die Anzeige also seltener, als die Tabelle vermuten lässt — sichtbar wird
> es nur bei einer Zelle nahe einer 2,5-km/h-Grenze.

Der Steckbrief beschriftet die Zelle mit `cell_speed`, die gezeichnete Spur und `etaMinutesToPoint`
folgen der anderen Größe. Bei 18 gegen 19,5 km/h sind das nach einer Stunde 1,4 km und damit
unsichtbar; bei einer schnellen Zelle wären es 4–5 km, und die Karte widerspräche sich selbst
sichtbar.

⚠️ **Belegtiefe:** drei Zellen aus **einem** Lauf. Dass die Spur systematisch langsamer läuft,
ist ein Indiz, keine Regel — bei einer der drei Zellen waren es nur 1,5 %. Die Umsetzung braucht
diese Regel auch nicht: sie muss nur **eine** der beiden Größen konsistent verwenden.

### 2.6 Die Richtung stammt aus einem einzigen Segment

`konrad3d.ts:260` peilt Schwerpunkt → **erster** Prognosepunkt. Bei einer drehenden Spur ist das
die Richtung der ersten fünf Minuten, nicht die der Stunde. Zelle 231 dreht über die Spur von
54,98° auf 48,61° (6,4°) und beschleunigt dabei von 21,9 auf 24,5 km/h — die Prognose ist also
**nicht** eine gerade Extrapolation mit konstanter Geschwindigkeit. Für das Kürzel „NO" ist das
belanglos, für einen gezeichneten Pfeil nicht.

### 2.7 Auf kleinen Karten sind 38 Zellen eine Fläche, kein Bild

`audit/zellbahnen.md` §2 hat 38 Features in einer Datei gemessen. Mit Umriss, Spur und Trichter
sind das bis zu 152 Geometrien. Auf 390×844 überlagern sich die Trichter zu einem Teppich, in dem
die starke Zelle nicht mehr auffällt.

---

## 3. Die Glyphen-Frage — der einzige echte Architekturpunkt

`audit/zellbahnen.md` §3 und der Kommentar in `MapView.tsx:346` legen fest: **„bewusst ohne
`symbol`/`text-field`"**, weil der Basemap-Stil der 2D-Karte keine Glyphen garantiert.

> **Korrektur aus der Umsetzung (2026-08-07).** Die Begründung stimmt in der Sache nicht ganz: der
> verwendete Stil (`tiles.openfreemap.org/styles/positron`) **lädt sehr wohl Glyphen** — im
> CDP-Netzwerkmitschnitt der Z2-Sitzung stehen ~15 Anfragen an
> `tiles.openfreemap.org/fonts/Noto Sans {Regular,Bold,Italic}/*.pbf`. `text-field` wäre also
> technisch möglich. **An der Entscheidung ändert das nichts:** die Glyphen kommen von einem
> Fremd-CDN, das nicht Teil unseres Vertrags ist, und Weg A braucht sie ohnehin nicht. Der Satz
> „garantiert keine Glyphen" wird damit zu „verlässt sich nicht auf fremde Glyphen" — dieselbe
> Regel, ehrlicher begründet.

**Diese Festlegung bleibt richtig — sie ist aber weiter gefasst als ihr Grund.** Sie schützt vor
fehlenden **Glyphen**; sie betrifft `text-field`. Ein `symbol`-Layer mit `icon-image` braucht
**keine** Glyphenquelle, wenn das Bild per `map.addImage()` aus einem Canvas registriert wird.
Genau dieses Muster ist im Repo bereits beschlossen und beschrieben:
`docs/zuglinien-radar-spec.md` §10.5 sieht für die Zugvektoren „arrow sprite via `map.addImage`
from a canvas (no external asset)" vor.

**Konsequenz für Z2:** Pfeilkopf (Z2-1) und Zeitmarken (Z2-2) sind als `symbol`-Layer mit
`icon-image` umsetzbar, ohne die Z1-Entscheidung zu verletzen. Weil es aber eine **schriftlich
festgehaltene** Entscheidung berührt, wird sie **nicht still umgedeutet**, sondern als
STOPP-&-FRAGEN-Punkt **S-Z2-1** an Jan gestellt (§6). Fällt die Antwort negativ aus, gibt es einen
belegten Rückfallweg ohne jedes `symbol`:

| | Weg A (`icon-image`) | Weg B (glyphenfrei) |
|---|---|---|
| Pfeilkopf | `symbol` + `icon-rotate` aus der Peilung | kurzes `line`-Dreieck als Polygon am Spurende |
| Zeitmarken | `symbol` mit vorgerendertem „15/30/60" | drei `circle`-Layer mit **abgestuftem Radius** + Legende |

Weg B kostet Lesbarkeit, aber keine Korrektheit. Weg A ist die Empfehlung.

---

## 4. Architektur — rein additiv, Rechnen bleibt rein

**Keine neue Datei ist zwingend.** Die gesamte Geometrie entsteht in `src/radar/cellPolygons.ts`,
das bereits rein und headless geprüft ist (D-12). `MapView.tsx` bekommt ausschließlich Layer-
Definitionen und die Verdrahtung — kein Rechnen.

**Neue reine Funktionen in `cellPolygons.ts`:**

| Funktion | Liefert |
|---|---|
| `conePolygons(cell)` | je Stützstelle **ein** Ellipsen-Polygon mit `leadMin` als Property (für den Deckkraft-Verlauf) |
| `trackSpeedKmh(cell)` | Zuggeschwindigkeit **aus der gezeichneten Spur** — die Zahl, die zur Geometrie passt (§2.5) |
| `trackBearing(cell, leadMin?)` | Peilung über mehrere Segmente statt aus dem ersten (§2.6); ohne Spur → `null` |
| `arrowAnchor(cell)` | Position + Rotation für den Pfeilkopf |
| `timeMarks(cell, leads)` | Punkte für +15/+30/+60, jeweils mit `leadMin` |
| `etaWindowToPoint(cell, target)` | `{ earliestMin, latestMin, distanceKm }` — ETA als **Spanne** aus der Ellipse |
| `passByToPoint(cell, target)` | `{ missKm, atLeadMin }`, wenn die Zelle vorbeizieht statt zu treffen |

`coneRing()` und `etaMinutesToPoint()` **bleiben erhalten, exportiert und verifiziert** — sie sind
der benannte Rückfall (D-11-Geist), auch wenn Z2 keinen neuen *Rechenpfad* im Sinne von Rule 2
einführt: es kommt keine neue Datenquelle und kein neues Modell hinzu, nur eine zweite Darstellung
derselben amtlichen Zahlen.

**Neue Feature-Sorten in `buildCellFeatures()`** (die Quelle bleibt **eine** FeatureCollection,
unterschieden über `kind` — das Muster aus Z1 wird fortgeführt, nicht ersetzt):

```
kind='cone'   → bleibt (Rückfall, heute gezeichnet)
kind='cone-step'  NEU  je Stützstelle eine Ellipse, Property leadMin
kind='hull'   → bleibt
kind='path'   → bleibt
kind='arrow'  NEU  Pfeilkopf am Spurende, Property bearing
kind='mark'   NEU  Zeitmarken +15/+30/+60, Property leadMin
kind='dot'    → bleibt
```

**Standortbezug (Z2-4)** hängt an der bestehenden `location`-Prop. Regel:

- `overview === true` ⇒ kein Standortbezug, keine Zusatzgeometrie. Ersatzlos, kein Platzhalter.
- Sonst: für jede Zelle `etaWindowToPoint(cell, [location.lon, location.lat])`. Trifft **keine**,
  wird die **nächstliegende** über `passByToPoint` ermittelt und als Vorbeizug ausgewiesen.
- Die betroffene Zelle bekommt `affects: true` als Property → kräftigere Linienbreite über eine
  `case`-Expression, kein zweiter Layer.

**Ausdünnung (Z2-5)** über native MapLibre-Mittel, ohne JS im Repaint:
`minzoom` je Layer plus `filter` auf `sev`. Der Umriss bleibt **immer** sichtbar — Funktionserhalt
gilt auch hier: ausgedünnt wird die Zusatzgeometrie, nie die Zelle selbst.

**Z-Band unverändert:** über den Rastern, unter den Stationen. Die neuen Layer reihen sich in
`CELLS_LAYER_IDS` ein und werden von demselben `moveLayer`-Block gehoben.

---

## 5. Ehrlichkeitsfläche (D-04 / D-19) — gate-blockierend

1. **Der Messung↔Prognose-Bruch bleibt unangetastet.** Umriss durchgezogen = gemessen; Spur,
   Pfeil, Zeitmarken und Trichterstufen sind **alle** prognostiziert und tragen dieselbe optische
   Sprache (gestrichelt/transparent). Ein Pfeil darf nicht solider wirken als die Spur, an der er
   hängt.
2. **ETA ist eine Spanne, kein Punktwert.** „erreicht dich in **20–35 min**" statt „in 27 min".
   Die Spanne kommt aus der amtlichen Ellipse, nicht aus einem Zuschlag. Wo die Ellipse fehlt,
   gibt es **keine** Spanne und damit keine ETA — nicht eine geratene.
3. **Vorbeizug ist eine Aussage, kein Leerzustand.** „zieht ~12 km südlich an dir vorbei" ist
   Information; ein leeres Feld ist es nicht.
4. **Wortwahl unverändert nach D-19:** „Zelle", „erreicht dich in ~", „zieht vorbei". **Nie**
   „trifft", „Warnung", „Gefahr", „Unwetter", „Tornado". Der Satz „kein amtliches Warnprodukt,
   kein Warnersatz — maßgeblich sind die DWD-Warnungen" bleibt an allen vier bestehenden Stellen.
5. **Eine Geschwindigkeit, nicht zwei.** Die angezeigte Zahl stammt aus derselben Geometrie wie
   die gezeichnete Spur (§2.5) und wird in **5er-Schritten** gerundet („~20 km/h") — die Rundung
   ist die ehrliche Antwort auf die gemessene Unschärfe zwischen beiden Größen.
6. **Richtung nur, wenn belegt.** Ohne Prognosespur keine Peilung, kein Pfeil (Fortführung der
   Z1-Regel aus `konrad3d.ts:258`).
7. **Ausgedünnt heißt nicht verschwunden.** Wo Spur oder Trichter zoomabhängig entfallen, bleibt
   der Umriss stehen. Die Legende benennt die Ausdünnung.

---

## 6. STOPP & FRAGEN (Jan)

| # | Punkt |
|---|---|
| **S-Z2-1** | **`symbol`/`icon-image` für Pfeil und Zeitmarken.** Berührt die schriftliche Z1-Entscheidung „bewusst ohne `symbol`" (§3). Empfehlung: Weg A, weil `icon-image` keine Glyphen braucht und `docs/zuglinien-radar-spec.md` §10.5 dasselbe Muster bereits vorsieht. Rückfall Weg B ist belegt und lauffähig |
| **S-Z2-2** | **Die angezeigte Zuggeschwindigkeit ändert sich sichtbar** (§2.5) — von `cell_speed` auf den Wert aus der Spur, rund 1–7 % niedriger, gerundet auf 5er-Schritte. Das ist eine bewusste Änderung an einer bestehenden Anzeige, kein Bugfix |
| **S-Z2-3** | **Der Standortbezug hebt eine Zelle hervor.** Eine Karte, die etwas auszeichnet, trifft eine Aussage über Relevanz. Wortlaut und Schwelle (`hitRadiusKm`) gehören gegengelesen, bevor sie live gehen |

Kein Punkt aus `CLAUDE.md` §STOPP & FRAGEN ist berührt: kein Shader/WebGL, keine Fusion, keine
Löschung, kein Dependency-Upgrade, keine Edge-Function-/Cron-/Manifest-Änderung, nichts
Irreversibles.

---

## 7. Risiken und ihre Behandlung

| Risiko | Behandlung |
|---|---|
| **`addImage` vor `styleReady`** — das Icon fehlt still, der Pfeil bleibt unsichtbar | Registrierung im selben `initOverlays`-Block wie die Quellen; `hasImage()`-Prüfung vor `addLayer`; der Verifier prüft die Feature-Erzeugung unabhängig vom Stil |
| **Zeitmarken kollidieren bei langsamen Zellen** — bei 18 km/h liegen +15/+30/+60 nur 4,5/9/18 km auseinander | ⚠️ **In der Umsetzung widerlegt:** `icon-allow-overlap: false` ließ MapLibre **alle drei** Marken verwerfen (0 von 3 gerendert, am Bildschirm gemessen) — die Basemap-Labels werden zuerst platziert, unser Layer liegt oben und kommt zuletzt dran. Ein stilles Weglassen wiegt schwerer als eine Überlagerung, also **`allow-overlap: true`** + `symbol-sort-key` nach `leadMin`. Restrisiko als **V-167** registriert |
| **Trichterstufen erzeugen 12× so viele Polygone** (bis 456 statt 38) | Ellipsen mit 24 Stützpunkten bleiben klein; Stufen nur oberhalb der Zoom-Schwelle und ab `sev ≥ 0,5` (an der gemessenen Verteilung gesetzt, **nicht** ≥ 1 — am Fixture hätte das ausnahmslos alle drei Zellen getroffen). **Gemessen statt geschätzt:** 3 Zellen ⇒ 60 Features, hochgerechnet 38 Zellen ⇒ **760 Features**, Rechenzeit **5,3 ms** (hochgerechnet ~67 ms) |
| **Standortbezug ohne Ort** (Übersichts-Modus, Einbettung) | ersatzlos aus, §4 — und im Verifier als eigener Fall geprüft |
| **Ausdünnung versteckt eine starke Zelle** | ausgedünnt wird nur Zusatzgeometrie; der Umriss ist von der Regel ausgenommen (Funktionserhalt) |
| **Doppelte Wahrheit über die Geschwindigkeit** (§2.5) | genau eine Quelle für die angezeigte Zahl; der Verifier prüft, dass Beschriftung und Spurgeometrie zusammenpassen |
| **Desktop-Regression** durch neue Layer im Z-Band | Golden-Screenshot vor der Phase, Pixel-Diff im Gate; `CELLS_LAYER_IDS` bleibt die einzige Reihenfolgen-Wahrheit |

---

## 8. Verifikationsplan

**`npm run verify:cells` wird erweitert, nicht ersetzt** — die bestehenden 64 Checks müssen
unverändert grün bleiben (Regressionsnachweis für Z1). Neue Checks gegen dasselbe echte Fixture:

- `conePolygons` liefert je Stützstelle ein Polygon; die Halbachsen wachsen **monoton**
  (am Fixture 2,322 → 16,884 km)
- `trackSpeedKmh` stimmt mit der Länge der gezeichneten Spur überein (Toleranz < 1 %)
- `trackBearing` über die volle Spur unterscheidet sich bei Zelle 231 messbar von der
  Erst-Segment-Peilung (54,98° vs. 48,61°) und liegt dazwischen
- `etaWindowToPoint` liefert `earliestMin < latestMin`; ein Punkt im Pfad trifft, ein Punkt
  quer dazu trifft nicht; ohne Ellipse **kein** Ergebnis statt eines geschätzten
- `passByToPoint` liefert für die querab liegende Zelle einen positiven `missKm`
- `timeMarks` erzeugt genau die angeforderten Leads und keine darüber hinaus
- Warnsprach-Sperre wird auf die **neuen** Textbausteine ausgeweitet
- **Rot-Test-Pflicht (V-99/O-02):** einmal absichtlich zum Scheitern gebracht, Beleg im Gate

**Weiter:** `npm run typecheck` und `npm run build` grün · `verify:hail` 55/55 und
`verify:warnings` 101/101 unverändert (beide hängen an `konrad3d.ts` bzw. am selben Kartenbereich).

**UI-Verifikation** (Chrome DevTools MCP, Desktop 1440×900 + iPhone 12 Pro 390×844 DPR 3),
Protokoll **V-ZELLBAHNEN-KARTE** in `tests.md`:

- Pfeilrichtung stimmt mit der Spur überein — an einer Zelle gegen die Peilung nachgerechnet
- Zeitmarken sitzen auf der Spur und in der richtigen Reihenfolge
- Trichter wird nach hinten sichtbar transparenter (Screenshot-Vergleich +5 vs. +60)
- Standortbezug: Ort in den Pfad legen ⇒ Spanne erscheint; Ort querab ⇒ Vorbeizug-Aussage;
  `overview` ⇒ nichts von beidem
- **Netzwerk-Beleg: null zusätzliche Requests gegenüber Z1** — die Phase zeichnet nur
- Touch-Targets ≥ 44 px · Konsole sauber · keine Long Tasks > 200 ms
- Zahl der gezeichneten Features vor/nach der Ausdünnung gemessen, nicht geschätzt

**Vor dem Gate:** die fünf Selbstverifikations-Fragen schriftlich mit Beleg — Funktionserhalt
**einzeln je Layer**, Desktop pixelgleich, Touch-Targets, Konsole, Long Tasks.

**Gate: GZ2 in `checklist.md`.**

---

## 9. Nachtrag aus der Umsetzung (2026-08-07) — was die Diagnose nicht wusste

Vier Dinge sind erst beim Bauen aufgetaucht. Sie sind Funde, keine Fehlschläge (`prompt-zellbahnen-v2.md`).

1. **Pfeilkopf und +60-Marke lagen exakt aufeinander.** Beide hängen an der letzten Stützstelle;
   am Bildschirm gemessen saßen sie auf demselben Pixel (523/372), der Pfeil war unlesbar. Gelöst
   über `icon-anchor: 'bottom'` + `icon-offset` — die Pille sitzt jetzt **über** der Spur, der
   Pfeil **auf** ihr. Die Diagnose hatte diesen Selbstkonflikt nicht vorhergesehen.
2. **`icon-allow-overlap: false` verwarf alle Marken** — s. §7, Zeile Zeitmarken.
3. **Die mobile Legende wuchs auf 359 px** und schob den Satz „kein amtliches Warnprodukt …" unter
   die Scrollkante. Die Legende wurde daraufhin auf 282 px gekürzt; die ausführliche Fassung steht
   in der Readout-Spalte, wo Platz ist. Ehrlichkeitstext gehört über die Kante, nicht darunter.
4. **Ein Sentinel-Konflikt mit dem Z1-Verifier.** Der Z1-Check „Kurzzeile lässt die fehlende Angabe
   weg statt zu raten" mutiert `cell_speed` auf den Sentinel und erwartet, dass keine
   Geschwindigkeit erscheint. Mit `trackSpeedKmh` wäre trotzdem eine erschienen, weil die Spur
   intakt bleibt. Gelöst über `displaySpeedKmh()`: der **Wert** kommt aus der Spur, die
   **Verfügbarkeit** weiterhin aus `tracking/cell_speed`. Sagt das amtliche Produkt „nicht
   bestimmt", sagt die Karte auch nichts — die konservativere Lesart, und der Z1-Test behält
   seinen Sinn statt entwertet zu werden.

**Außerhalb der Phase gefunden:** die Layer-Sichtbarkeit friert ein, wenn man einen Layer
einschaltet, bevor der Kartenstil fertig geladen ist (betrifft **alle** Layer, Ursache: `[]`-Deps
des Init-Effekts, `MapView.tsx:2579`). Nicht in Z2 gefixt (ein Thema = eine Phase, höchste
Risikodatei) — registriert als **V-164**.
