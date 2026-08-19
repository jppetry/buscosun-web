# audit/windpartikel-flaute.md — Diagnose: stehende Windpartikel bei schwachem Wind

> Stand: 2026-08-08, 16:06–16:15 MESZ. Auftraggeber: Jan.
> Auslöser (wörtlich): *„es gibt bei windstillen gegenden einfach punkte die stehen bleiben.
> ich würde mir wünschen dass dort trotzdem windpartikel zu sehen sind mit einer windrichtung,
> weil komplett windstill gibt es doch nicht. man kann doch immer wind und richtung detektieren
> oder?"*
> Diagnose **vor** Code (`CLAUDE.md` §Harte Regeln). Alle Zahlen unten sind **im laufenden
> Browser an der echten GPU gemessen** (Dev-Server :5175, Desktop 1440×900, Chrome DevTools MCP,
> rAF nachgemessen bei 60 fps), nicht aus der Doku übernommen. Rohmessungen: §3.

---

## 1. Antwort auf Jans Frage vorab

**Ja — eine Richtung ist immer da.** Weder das Modell noch unser Transport verlieren sie:

* ICON-D2 liefert u und v als Fließkomma; exakt 0,000 kommt praktisch nicht vor.
* Unsere eigene Wind-Textur ist zwar auf 8 Bit je Komponente quantisiert, aber der Wertebereich
  wird pro Lauf auf das tatsächliche Feld gespannt (gemessen: u −10,71…9,46 m/s, v −11,11…12,17 m/s)
  → **eine Stufe = 0,079 m/s (u) bzw. 0,091 m/s (v)**. Das ist weit feiner als jede Schwelle,
  die im Folgenden eine Rolle spielt.
* Im DACH-Kasten (5,5–15,5° O · 45,5–55,0° N, 238 476 Zellen) liegt **keine einzige Zelle** unter
  0,05 m/s — also unter der Schwelle, ab der der Shader „echte Flaute" annimmt.

Echte Windstille (Beaufort 0, < 0,3 m/s) gibt es in der Natur durchaus — nachts in Becken- und
Tallagen, im Kern eines Hochs. Aber auch dort hat das Modell eine Richtung. **Die Richtung geht
nicht in den Daten verloren, sondern in der Darstellung.**

**Und ist es dort, wo die Punkte stehen, überhaupt windstill?** Nein. Verteilung im DACH-Kasten
zum Messzeitpunkt: Minimum 0,04 m/s · 1 %-Wert 0,32 m/s · 5 %-Wert 0,71 m/s · **Median 2,17 m/s** ·
Maximum 7,78 m/s. Unter der Beaufort-0-Schwelle von 0,3 m/s liegen **0,9 % der Fläche**. Die
Bereiche mit stehenden Punkten tragen typisch **0,5–2 m/s aus einer klaren Richtung** — spürbare,
benennbare Luftbewegung, keine Flaute. Die Karte behauptet dort also etwas, das die Daten nicht
hergeben.

## 2. Befund in einem Satz

Die Partikelposition wird in **1/65 025 der Weltbreite** gespeichert (2 Byte je Achse, RGBA8).
Bei schwachem Wind ist der Schritt pro Bild **kleiner als eine halbe Rasterzelle** — er wird beim
Zurückschreiben auf null gerundet, und zwar in **jedem** Bild gleich. Das Partikel steht dann
nicht „langsam", sondern **exakt still**, dauerhaft. Dieselbe Rundung wirkt am anderen Ende
umgekehrt: Wo die Partikel laufen, laufen sie **22–33 % zu schnell** (§3.4). Es gibt keinen
Windbereich, in dem das gezeigte Tempo stimmt.

## 3. Messungen

### 3.1 Wie viel Karte betrifft das? (DACH-Kasten, 2026-08-08 16:06)

| Windgeschwindigkeit | Flächenanteil |
|---|---|
| < 0,05 m/s (Shader wertet als „Flaute") | **0 %** |
| 0,05–0,8 m/s | 6,4 % |
| 0,8–1,22 m/s | 9,4 % |
| 1,22–2,0 m/s | 27,3 % |
| 2,0–2,95 m/s | 33,9 % |
| 2,95–4 m/s | 17,4 % |
| > 4 m/s | 5,6 % |

Kumuliert: **16 % der Fläche unter 1,22 m/s, 43 % unter 2 m/s, 77 % unter 2,95 m/s.** An einem
ruhigen Sommernachmittag ist der Effekt also nicht die Ausnahme, sondern der Normalfall.

> Nebenbefund: Über die **ganze** Textur gerechnet liegen 15,9 % der Zellen unter 0,05 m/s — die
> sitzen aber ausschließlich in den Ecken des Rechtecks, außerhalb des ICON-D2-Gebiets (als
> 0 m/s aufgefüllt). Innerhalb DACH: 0 %. Das ist **kein** Datenloch auf der Karte.

### 3.2 Bewegen sich die Partikel? (echte GPU, 60 reale Update-Pässe = 997 ms, dtScale ≈ 1,02)

Von 2 025 Partikeln wurden 448 zwischenzeitlich neu gewürfelt (ausgefiltert), 1 577 ausgewertet:

| Wind am Partikel | Partikel, die in **1 s kein einziges Rasterfeld** weiterkamen | Median-Weg |
|---|---|---|
| < 0,8 m/s | **61,0 %** | 0 Felder/s |
| 0,8–1,22 m/s | **49,5 %** | 1 Feld/s |
| 1,22–2,0 m/s | 21,2 % | 1 Feld/s |
| 2,0–2,95 m/s | 0,3 % | 6 Felder/s |
| 2,95–4 m/s | 0 % | 55 Felder/s |
| 4–6 m/s | 0 % | 59 Felder/s |
| > 6 m/s | 0 % | 59 Felder/s |

**Insgesamt stand ein Viertel aller Partikel (24,8 %) eine volle Sekunde lang absolut still.**
Der Sprung von 1 auf 55 Felder/s zwischen 2 und 3 m/s ist keine Kurve, sondern eine **Kante** —
genau dort, wo der rechnerische Schritt die halbe Rasterzelle überschreitet (§4).

Zur Kontrolle dieselbe Messung mit fest auf 60 fps gesetztem Zeitschritt (dtScale = 1, also ohne
das Zittern der realen Bildabstände):

| Wind | still |
|---|---|
| < 0,8 m/s | **98,7 %** | 
| 0,8–1,22 m/s | **98,5 %** |
| 1,22–2,0 m/s | 88,2 % |
| 2,0–2,95 m/s | 61,8 % |
| 2,95–4 m/s | 27,3 % |
| 4–6 m/s | 1,6 % |
| > 6 m/s | 0 % |

Der Unterschied zwischen beiden Tabellen ist selbst ein Befund: Ob ein schwachwindiges Partikel
sich bewegt, hängt an den **Millisekunden zwischen zwei Bildern**. Auf einem 120-/144-Hz-Schirm
wird der Effekt schlimmer, auf dem 30-fps-Mobil-Deckel besser. Das ist der Grund, warum das
Problem mal auffällt und mal nicht.

> ⚠️ **Diese Kennzahl ist eine Messerschneide — nicht als Kernzahl verwenden.** Eine Wiederholung
> derselben Messung 15 Minuten später ergab bei **byte-identischem Windfeld, identischem Shader
> und identischen 60 fps** nur noch 4 statt 534 stehende Partikel. Grund: Die realen Bildabstände
> schwanken (gemessen dtScale 0,79 … 1,33 um den Median 1,03), und ein Partikel bei 0,4 Feldern je
> Bild rutscht immer dann über die Rundungsschwelle, wenn ein Bild zufällig lang genug ist.
> „Steht / steht nicht" misst damit die Laune der Bildzeitgeber mit. Die belastbare Größe steht
> in §3.4 — und sie fällt für den ausgelieferten Stand **härter** aus, nicht milder.

### 3.3 Stimmt wenigstens die Richtung? (Winkel zwischen gezeigter Bewegung und echtem Wind)

| | Median | 90 %-Wert |
|---|---|---|
| heutiger Stand | **21,5°** | 47,9° |
| heutiger Stand, nur Wind < 3 m/s | **23,1°** | 49,6° |

Und das ist noch geschmeichelt: Die 534 komplett stehenden Partikel konnten gar nicht in die
Statistik eingehen — sie zeigen **keine** Richtung. Der Median-Weg von exakt 59–60 Feldern/s bei
allen stärkeren Winden verrät zusätzlich, dass die Bewegung auf **ein Rasterfeld pro Bild** und
damit auf die Achsen des Rasters einrastet: Auch die Richtung wird quantisiert, nicht nur das Tempo.

### 3.4 Die belastbare Messgröße: gezeigtes Tempo gegen korrektes Tempo

Statt „steht / steht nicht" wird für **jedes** Partikel der tatsächlich zurückgelegte Weg gegen
den Weg gestellt, den derselbe Wind über dieselbe Zeit ergeben müsste (Anzeige-Kennlinie
`max(2, √(5·v))`, reales dt-Budget der 60 Pässe aufsummiert). Diese Größe ist gegen das
Zeitgeber-Zittern unempfindlich. Median je Windklasse, 1 564 ausgewertete Partikel,
mittleres dtScale **exakt 1,000**:

| Wind | gezeigtes Tempo (Soll = 100 %) | Richtungsfehler |
|---|---|---|
| < 0,5 m/s | **0 %** | zeigt gar keine Richtung |
| 0,5–1 m/s | **0 %** | zeigt gar keine Richtung |
| 1–2 m/s | **0 %** | zeigt gar keine Richtung |
| 2–3 m/s | **22 %** | 28,1° |
| 3–5 m/s | **122 %** | 18,1° |
| > 5 m/s | **133 %** | 9,3° |

Das ist der eigentliche Befund, und er ist größer als Jans Beobachtung:

* **Unter 2 m/s zeigt die Karte null Prozent** des richtigen Tempos — das ist die Hälfte aller
  Partikel im Bild und 43 % der DACH-Fläche.
* **Über 3 m/s ist sie 22–33 % zu schnell.** Ursache ist dieselbe Rundung: ein Schrittvektor von
  (0,78 / 0,50) Feldern wird zu (1 / 1) — beide Achsen werden aufgerundet, der Weg wächst um
  das 1,5-fache und der Winkel kippt auf die Diagonale. Die Partikel laufen also **zu schnell**,
  wo sie überhaupt laufen.
* Es gibt damit **keinen** Windbereich, in dem das gezeigte Tempo stimmt.

Gegenprobe mit stochastischem Runden, gleiche Messung, gleiche Sitzung (mittleres dtScale 0,996):

| Wind | gezeigtes Tempo | Richtungsfehler |
|---|---|---|
| < 0,5 m/s | 84 % | 31,0° |
| 0,5–1 m/s | **98 %** | 15,2° |
| 1–2 m/s | **98 %** | 10,7° |
| 2–3 m/s | 96 % | 8,2° |
| 3–5 m/s | 97 % | 5,5° |
| > 5 m/s | 99 % | 2,1° |

Dass die Soll-Rechnung stimmt, belegt diese zweite Tabelle gleich mit: Ein erwartungstreues
Verfahren muss 100 % treffen, und es trifft 96–99 % über fünf Windklassen. Die 122 % und 133 %
in der ersten Tabelle sind deshalb **kein Modellfehler, sondern echter Rundungs-Bias**.

## 4. Ursachenkette

Der Update-Shader (`src/wind/shaders.ts`, `updateFrag`) rechnet pro Bild:

```
offset = dispSpeed · 1e-4 · speedFactor · dtScale · zoomSpeed      (x zusätzlich ÷ cos φ)
dispSpeed = max(speedMin, (v/speedRef)^speedGamma · speedRef) = max(2, √(5·v))
```

Mit den Produktivwerten (`MapView.tsx`: speedFactor 0,02 · speedZoomDamping 0 → zoomSpeed 1) und
dtScale 1 ergibt das bei 50° N, umgerechnet in Rasterfelder (1 Feld = 1/65 025):

* **zonal** (Ost/West): `dispSpeed · 0,202`
* **meridional** (Nord/Süd): `dispSpeed · 0,130`

Beim Zurückschreiben wird auf das nächste Rasterfeld **gerundet**. Bewegung entsteht also erst
oberhalb eines halben Feldes:

| | nötige Anzeige-Geschwindigkeit | entspricht echtem Wind |
|---|---|---|
| Ost/West-Bewegung | > 2,47 m/s | **> 1,22 m/s** |
| Nord/Süd-Bewegung | > 3,84 m/s | **> 2,95 m/s** |

Weil `speedMin` = 2 m/s die Anzeige nach unten abfängt, gilt für **jeden** Wind bis 0,8 m/s:
Schritt 0,40 (zonal) bzw. 0,26 (meridional) Felder — beides unter der Hälfte, **in jeder
Richtung**. Und da die Position nach dem Runden wieder exakt auf einem Rasterpunkt sitzt, ist der
Rundungsfehler im nächsten Bild derselbe: Es gibt **keine Fehlerakkumulation**, die das Partikel
irgendwann doch weiterschöbe. Es steht für immer.

Drei Nebenwirkungen verschärfen das Bild:

1. **Die Lebensdauer-Logik hilft hier gegen sich selbst.** `hasWind = step(0.05, speed)` ist bei
   0,5 m/s erfüllt → das Partikel gilt als „hat Wind" → niedrige Recycling-Rate → es bleibt
   *lange* liegen. Nur echte Flaute (< 0,05 m/s) wird schnell neu gewürfelt. Ergebnis: gerade die
   stehenden Punkte sind die langlebigsten.
2. **Kein Schweif.** Ein stehendes Partikel malt jedes Bild denselben Pixel — die Fade-Spur wird
   zum Punkt. Genau das, was Jan sieht.
3. **Richtungs-Einrastung** (§3.3) auch im mittleren Bereich.

**Ausgeschlossen als Ursache** (jeweils gemessen, nicht vermutet): Datenlücken im ICON-D2-Gebiet
(0 % im DACH-Kasten), die 8-Bit-Quantisierung der Wind-Textur (Stufe 0,08 m/s, zwei Zehnerpotenzen
unter der relevanten Schwelle), der Partikel-Zähler und die Zoomstaffel aus der Vorphase
(unbeteiligt — der Effekt ist zoomunabhängig, weil der geografische Schritt zoomunabhängig ist).

## 5. Optionen

| | Eingriff | Wirkung | Bewertung |
|---|---|---|---|
| **A · Stochastisches Runden** | 3 Zeilen in `updateFrag`, unmittelbar **vor** der bestehenden Kodierzeile: statt zu runden, wird mit der Wahrscheinlichkeit des Nachkommaanteils ein Feld weitergesetzt | Der Schritt „0,4 Felder" wird in 40 % der Bilder zu einem ganzen Feld → im **Mittel exakt die richtige Geschwindigkeit und Richtung** | **empfohlen**, s. §6 |
| B · `speedMin` anheben | eine Zahl in `MapView.tsx`, kein Shader | Schwachwind bewegt sich — aber mit **falschem Tempo**, und wegen des Rundens weiterhin auf Rasterachsen eingerastet, d. h. **falsche Richtung** | abgelehnt: verstößt gegen das Ehrlichkeitsprinzip |
| C · Feinere Positions-Kodierung (16 Bit relativ zum Sichtfeld) | Kodierung **und** alle vier Dekodierstellen | beseitigt das Raster ganz, hilft zusätzlich beim Detailzoom | groß, berührt genau den Vertrag, den Jan geschützt hat → **V-172**, nicht jetzt |

## 6. Empfohlener Eingriff (A) — Umfang und Belege

**Was sich ändert:** in `updateFrag` vor `gl_FragColor = vec4(fract(pos*255.0), …)`:

```glsl
// Stochastisches Runden auf das 1/65025-Positionsraster: ein Teilschritt von
// 0,4 Feldern setzt das Partikel in 40 % der Bilder ein Feld weiter, statt in
// 100 % der Bilder gar nicht. Erwartungstreu → Tempo und Richtung stimmen im
// Mittel exakt; ohne das frieren Winde unter ~1,2 m/s dauerhaft ein.
vec2 dq = vec2(rand(seed + 3.7), rand(seed + 4.9));
pos = fract(floor(pos * 65025.0 + dq) / 65025.0);
```

**Was sich ausdrücklich NICHT ändert** (das ist der Punkt, an dem Jans harte Auflage hängt):

* Die **Kodierzeile selbst bleibt unangetastet** — weiterhin RGBA8, 2 Byte je Achse,
  `fract(pos*255)` / `floor(pos*255)/255`. Nach der Zeile oben liegt `pos` exakt auf einem
  Rasterpunkt, die bestehende Kodierung gibt ihn unverändert wieder.
* Keine Änderung an den vier **Dekodierstellen** (`drawVert`, `drawVertProjected`, `segDrawVert`,
  `segDrawVertProjected`) — das Format ist identisch.
* Keine Änderung an den `highp`-Deklarationen, keine neue Uniform, kein neues Texturformat,
  keine CPU-Arbeit pro Bild, kein zusätzlicher Datenabruf.
* `rand()` und `seed` existieren im Shader bereits (Recycling/Respawn) — es kommt keine neue
  Zufallsquelle dazu.

**Am laufenden Bild gemessen** (Programm zur Laufzeit getauscht, Uniform-Satz identisch,
danach wieder zurückgetauscht — es wurde nichts im Repo verändert). Maßgeblich ist die
Tempo-/Richtungs-Tabelle in **§3.4** (0 % → 98 % des korrekten Tempos unter 2 m/s,
122–133 % → 96–99 % darüber). Die folgende Tabelle derselben Sitzung zeigt zusätzlich die
Wegstrecken — sie ist wegen des Zeitgeber-Zitterns (§3.2) nur als Momentaufnahme zu lesen:

| Wind | still: heute → mit A | Median-Weg: heute → mit A |
|---|---|---|
| < 0,8 m/s | 61,0 % → **1,9 %** | 0 → **16 Felder/s** |
| 0,8–1,22 m/s | 49,5 % → **0,5 %** | 1 → 22 |
| 1,22–2,0 m/s | 21,2 % → **0 %** | 1 → 27 |
| 2,0–2,95 m/s | 0,3 % → 0 % | 6 → 34 |
| 2,95–4 m/s | 0 % → 0 % | 55 → 40 |
| 4–6 m/s | 0 % → 0 % | 59 → 46 |
| > 6 m/s | 0 % → 0 % | 59 → 49 |
| **gesamt** | **24,8 % → 0,3 %** | |

Zwei Dinge stehen in dieser Tabelle, die über Jans Wunsch hinausgehen:

1. Die Reihe wird **monoton** (16 · 22 · 27 · 34 · 40 · 46 · 49): schwacher Wind ist wieder
   langsamer als starker. Heute sind alle Winde über 3 m/s auf dasselbe Tempo eingerastet — die
   Geschwindigkeits-Abstufung der Partikel existiert derzeit praktisch nicht.
2. Der **Richtungsfehler halbiert sich**: Median 21,5° → 10,4° (bei Wind < 3 m/s: 23,1° → 12,2°).
   Der 90 %-Wert steigt leicht (47,9° → 54,7°), denn das Verfahren tauscht einen *systematischen*
   Fehler gegen ein *zufälliges* Zittern — der systematische bleibt für immer, das Zittern mittelt
   sich über wenige Sekunden weg.

**Preis, ehrlich benannt:** Bei hohem Zoom springt ein Partikel dann sichtbar von Rasterfeld zu
Rasterfeld, statt still zu stehen (bei z11 sind das 16 px pro Sprung). Das ist die
Auflösungsgrenze der geschützten Kodierung, nicht ein neuer Fehler — sie wird durch A nur
sichtbar statt verschwiegen. Der eigentliche Ausweg wäre C (**V-172**).

## 7. Gate

Der Eingriff liegt in `updateFrag` und damit unter **STOPP & FRAGEN** (`CLAUDE.md`:
Shader-/WebGL-Pipeline). Er ist Jan mit dieser Diagnose vorgelegt worden; ohne seine Freigabe
wird nichts geschrieben. Nach Freigabe: Gate **GWF1** mit den fünf Selbstverifikations-Fragen,
Desktop + iPhone-12-Pro-Profil, Vorher/Nachher-Belege unter
`audit/screenshots/windpartikel/flaute/`.

> Zu den Screenshots in diesem Ordner: `vorher-z5-desktop.png` und
> `nachher-experiment-dither-z5-desktop.png` zeigen denselben Ausschnitt mit und ohne A. Ein
> **Standbild kann Bewegung nicht belegen** — der Unterschied steckt in den Tabellen oben, nicht
> im Bild. Die Screenshots dokumentieren nur, dass Dichte, Farbe und Größe unverändert bleiben.
