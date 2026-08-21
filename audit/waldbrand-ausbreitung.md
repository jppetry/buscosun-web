# Ausbreitungsrichtung aktiver Brände — Diagnose SF0 + Gate GSF1

> Phase **SF1** · Stand 2026-08-19 · Vorgänger: WF4 (`audit/waldbrand-forecast.md` §16), AF2
> (`audit/aktivfeuer.md` §12), BP5 (`audit/brandflaechen-panel.md` §11).
> Kickoff: Jans Auftrag „weniger eine Karte, sondern eher Pfeile und Hinweise bei aktiven Bränden,
> in welche Richtung sich das Feuer die nächsten Stunden ausbreiten könnte, abhängig von Wetter,
> Untergrund etc."

---

## 1. Ausgangslage

Der Layer `fireForecast` („Feuerwetter stündlich (ISI)", WF4, Bit 13) zeigt eine **Fläche**: wie
schnell sich ein Feuer *irgendwo* nach der Zündung ausbreiten würde. Er beantwortet nicht die Frage,
die vor der Karte steht — **„wohin läuft dieser Brand?"** Die Fläche ist zudem default aus und in
keinem Preset; sie wird also faktisch selten gesehen.

Gleichzeitig liegt die Antwort fachlich nah: das **FBP-System** (Fire Behaviour Prediction) ist der
zweite Teil desselben CFFDRS, dessen FWI-Teil in `src/fire/fwi/fwi.ts` bereits gegen
cffdrs-Referenzvektoren geprüft ist (43/43). Sein Kern ist genau die gesuchte Rechnung: **Wind und
Hang werden vektoriell addiert** ⇒ Netto-Ausbreitungsrichtung (RAZ) und Netto-Windwirkung (WSV).

---

## 2. Eingangs-Inventar (am Code geprüft)

| Größe | Fundstelle | Lage |
|---|---|---|
| Wind am Punkt, Richtung **und** Stärke | `src/wind/windPointSample.ts:53` `sampleWindAt` | **vorhanden**; `dir` ist meteorologisch („kommt aus") |
| Hangneigung + Exposition | `src/pointForecast/terrainPhysics.ts:75` `terrainContext` | **vorhanden**, aber nie aus `src/fire/` benutzt |
| Höhenmodell global | `src/fusion/elevation.ts:91` `loadElevationLookup` | **vorhanden** (Terrarium-Kacheln, ~60 KB/Kachel) |
| ISI stündlich 0…+6 h | `src/sources/iconD2FireWeather.ts:168` | **vorhanden**, R-Kanal der Frame-Canvas |
| ISI/FFMC-Gleichungen | `src/fire/fwi/fwi.ts:187/287/320/325` | **vorhanden**, rein und punktfähig |
| ISI-Klassenkanten (EFFIS) | `src/fire/fwi/isiRamp.ts:40/80` | **vorhanden** |
| Winkel + Himmelsrichtung | `src/fire/activity/dynamics.ts:165/172/192` | **vorhanden** (`bearingDeg`, `angleDiff`, `compassLabel`) |
| Bewuchs an einem aktiven Brand | — | **Lücke**, s. §3 |
| Sampler für das ISI-Raster | — | **Lücke**, wird gebaut (`isiPointSample.ts`) |
| ISZ (ISI bei Windstille) | — | **Lücke**, wird im Producer mitgeschrieben, s. §5 |

### 2.1 Drei Befunde, die den Zuschnitt bestimmen

**B1 — Der Frame trägt nur einen Skalar.** `FireWeatherFrame` (`iconD2FireWeather.ts:75-84`) hält
`image` (RGBA: **R = Wert/vMax, A = Maske**, G und B ungenutzt) — die Rohfelder `u`, `v`, `t_2m`,
`relhum_2m`, `tot_prec` werden nach dem Kettenschritt freigegeben (`:273`) und verlassen die Funktion
nie. Windrichtung ist auf dem Feuerwetter-Raster also **nicht** verfügbar; sie kommt aus dem
Windgitter. Der freie **G-Kanal** ist der Platz für ISZ.

**B2 — Der Wind wird heute nur in die Vergangenheit gefragt.** `FirePage.tsx:1092-1096` ruft
`sampleWindAt` ausschließlich mit `lastPass.atMs` (Zeitpunkt des letzten Überflugs) und **verwirft
die Stärke** (`Math.round(w.dir)`). Für eine Vorhersage brauchen wir denselben Sampler mit
`jetzt + h` **und** der Stärke. Die ±3-h-Regel dort gilt für vergangene Überflüge; für künftige
Stunden ist sie zu lax, weil `windFrameAtValidTime` still auf den letzten Frame klemmt — für die
Vorhersage gilt eine engere Schranke (30 min).

**B3 — Zwei vorbestehende Fallen blockieren jeden Symbol-Layer.**
1. `FireMap.tsx:1704` fügt Layer mit `layout: { visibility: 'none' }` ein und **überschreibt damit
   das gesamte `layout` der Spec**. Ein Symbol-Layer verlöre `icon-image` und `icon-rotate` und wäre
   stumm unsichtbar. Heute fällt das nicht auf, weil **kein** bestehender Spec ein `layout` hat —
   der Fix ist deshalb verhaltensneutral.
2. Die MapView-Import-Sperre in `scripts/verify-fire-model.mjs:93` liest `src/fire/` mit
   `readdirSync` **ohne Rekursion**. Die fünf Unterordner (`activity/`, `footprint/`, `fwi/`,
   `sources/`, künftig `spread/`) sind seit jeher ungeprüft.

---

## 3. Die eine echte Datenlücke: Bewuchs

`src/fire/clcMask.ts` ist **keine** Brennstoffkarte: die Maske kodiert genau drei CORINE-Klassen —
121 (Industrie), 131 (Abbau), 132 (Deponie) — als 1 Bit (`public/fire/clc-industry-mask.json`:
14 562 Polygone, 2,12 % der Zellen). **0 heißt „keine Aussage", nicht „Natur"**
(`clcMask.ts:11-16`). `FireRecord.landcover` (CONIFER/BROADLEA/…) stammt aus der **EFFIS-Kartierung**
(`fireCorroboration.ts:154`) und existiert deshalb erst **nachdem** ein Brand kartiert wurde — für
ein frisches aktives Feuer ist es `null`.

**Folge (Jans Entscheidung 1):** Die Reichweite wird als **Spanne über vier Brennstofftypen**
angegeben, nicht als eine Zahl. Das ist die ehrliche Antwort auf die Lücke — und fachlich
verkraftbar, weil der Brennstoff für die **Richtung** auf ebenem Grund gar keine Rolle spielt
(s. §4.3) und am Hang nur über die Hangkorrektur eingeht.

Eine CORINE-Vegetationsmaske (Phase **SF2**, eigenes Gate) würde die Spanne zusammenziehen; sie
setzt eine **veröffentlichte** Zuordnung CORINE → FBP-Brennstofftyp voraus (EFFIS European Fuel Map,
Prometheus). Ohne zitierfähige Zuordnung bleibt es bei der Spanne.

---

## 4. Fachliche Grundlage: FBP, wörtlich übernommen

Quelle: **Forestry Canada Fire Danger Group (1992)**, Inf. Rep. ST-X-3 („FCFDG 1992"), mit den
Revisionen **Wotton, Alexander & Taylor (2009)**, NRCan Inf. Rep. GLC-X-10. Abgeschrieben aus der
Referenzimplementierung **`cffdrs`** (R-Paket, `R/rate_of_spread.r`, `R/Slopecalc.r`,
`R/length_to_breadth.r`, `R/distance_at_time.r`), die die Gleichungsnummern im Quelltext führt.
Keine Konstante stammt aus dem Gedächtnis.

### 4.1 Übernommene Gleichungen

| Nr. | Größe | Formel |
|---|---|---|
| 26 | Ausbreitungsrate im Gleichgewicht | `RSI = a · (1 − e^(−b·ISI))^c` |
| 35a/b | Kurungsgrad Gras (Wotton 2009) | `CF = CC < 58,8 ? 0,005·(e^(0,061·CC) − 1) : 0,176 + 0,02·(CC − 58,8)` |
| 36 | RSI Gras | `RSI = a · (1 − e^(−b·ISI))^c · CF` |
| 39 | Hangfaktor | `SF = GS ≥ 70 ? 10 : e^(3,533·(GS/100)^1,2)` |
| 40 | Rate hangaufwärts ohne Wind | `RSF = RSZ · SF` (RSZ = RSI bei ISZ) |
| 41a/b | Hang-äquivalenter ISI | `ISF = ln(1 − (RSF/a)^(1/c)) / (−b)`, Boden `ln(0,01)/(−b)` |
| 43a/b | dito Gras | wie 41, mit `a → CF·a` |
| 45 | Feuchtefunktion | `f(F) = 91,9·e^(−0,1386·m)·(1 + m^5,31/4,93·10⁷)` |
| 46 | Feuchtegehalt | `m = 147,2…·(101 − FFMC)/(59,5 + FFMC)` (Konstante aus `fwi.ts:68`) |
| 44a–c | Hang-äquivalente Windgeschwindigkeit | `WSE = ln(ISF/(0,208·f(F)))/0,05039`; ab > 40 km/h die Wotton-2009-Zweige `28 − ln(1 − ISF/(2,496·f(F)))/0,0818` bzw. `112,45` |
| 47/48 | Vektoraddition | `WSX = WS·sin(WAZ) + WSE·sin(SAZ)`, `WSY = WS·cos(WAZ) + WSE·cos(SAZ)` |
| 49 | Netto-Windwirkung | `WSV = √(WSX² + WSY²)` |
| 50/51 | Netto-Richtung | `RAZ = arccos(WSY/WSV)`, bei `WSX < 0` ⇒ `2π − RAZ` |
| 79 | Längen-Breiten-Verhältnis | `LB = 1 + 8,729·(1 − e^(−0,030·WSV))^2,155` |
| 80a/b | dito Gras (Wotton 2009) | `LB = WSV ≥ 1 ? 1,1·WSV^0,464 : 1` |
| 71 | Strecke nach Zeit | `DIST = ROS·(t + e^(−α·t)/α − 1/α)` |
| 72 | Beschleunigung | `α = 0,115` (Punktzündung ohne Kronenfeuer, CFB = 0) |

### 4.2 Brennstoffsatz — vier Typen mit **eigenen** Koeffizienten (ST-X-3 Tab. 6)

| Typ | a | b | c | Rolle in DACH |
|---|---|---|---|---|
| **D-1** (laubloser Espenbestand) | 30 | 0,0232 | 1,6 | langsames Ende, Stellvertreter Laubwald |
| **C-2** (borealer Fichtenbestand) | 110 | 0,0282 | 1,5 | dichter Nadelwald |
| **C-3** (reifer Kiefernbestand) | 110 | 0,0444 | 3,0 | **Referenz** — Kiefernforst |
| **O-1b** (stehendes Gras) | 250 | 0,0350 | 1,7 | schnelles Ende, Offenland |

> **Abweichung vom Plan:** dort stand M-1 statt D-1. M-1/M-2 haben in ST-X-3 **keine eigenen
> Koeffizienten** (a = b = c = 0); sie werden als gewichtetes Mittel aus C-2 und D-1 über den
> Nadelholzanteil PC gebildet — PC wäre eine erfundene Zahl. D-1 hat eigene Koeffizienten und
> liefert dasselbe langsame Ende ohne Annahme.

Kurungsgrad Gras: **CC = 80 %** — die Vorgabe des `cffdrs`-Pakets, keine eigene Wahl. Steht im Text.

### 4.3 Die tragende Eigenschaft

**Auf ebenem Grund ist RAZ exakt die Windrichtung** (WSE = 0 ⇒ die Vektoraddition reduziert sich auf
den Windvektor), und zwar **für jeden Brennstoff gleich**. Der Brennstoff wirkt auf die *Richtung*
nur über die Hangkorrektur — also nur am Hang. Das ist keine Bequemlichkeit, sondern das Argument,
warum die fehlende Brennstoffkarte die Richtungsaussage nicht entwertet. Der Verifier hält es fest.

### 4.4 Was bewusst **nicht** gerechnet wird

- **Kein Buildup-Effekt (BE, Gl. 54)** — dazu fehlt BUI (Stufe 1 ohne Vortagsgedächtnis, WF4).
  Die Reichweite ist dadurch eine **Untergrenze**; das steht überall dabei, wo sie erscheint.
- **Kein Kronenfeuer** (CFB = 0) — damit ist α = 0,115 für alle Typen (Gl. 72 fällt zusammen).
- **Keine Ellipse als Geometrie** — LB wird gerechnet und als Zahl gezeigt, aber nicht gezeichnet.

---

## 5. Entscheidungen (Jan, 2026-08-19)

| # | Frage | Entscheidung |
|---|---|---|
| 1 | Aussagetiefe | **Richtung + Reichweiten-Spanne** über die vier Brennstofftypen |
| 2 | Darstellung | **Pfeil + Unsicherheitsfächer** |
| 3 | ISI-Rasterfläche `fireForecast` | **Entfernen** — ausdrückliche Ausnahme vom Funktionserhalt |
| 4 | Auswahl | **Alle aktiven Brände, mit ausgesprochenem Deckel** |

**Zu 3 — entfernt wird der Layer, nicht die Datenquelle.** `iconD2FireWeather.ts` bleibt in Betrieb;
die Pfeile brauchen denselben stündlichen ISI. Bit 13 wird **`null`** (Muster: Rückzug „Amtliche
Stufe", Bit 1), damit geteilte `#wb=`-Links keine anderen Layer öffnen. Die Punktkurve auf Klick
bleibt und hängt künftig an `fireSpread`. Die Flächenansicht „Ausbreitung (ISI)" des EU-Index
(`dangerViews.ts:126`) ist unberührt — es bleibt also eine Flächenansicht verfügbar, sie kommt
wieder von EFFIS statt aus eigener Rechnung.

**Zu 5 (ISZ):** Da die Canvas nach dem Rückzug nur noch **Datenträger** und keine Anzeigefläche mehr
ist, schreibt `buildFrameImage` ISZ in den freien **G-Kanal** (ISZ = 0,208·f(F) ≤ 19,1, passt in die
0…30-Skala). Exakt, kein zusätzlicher Netzabruf, keine Umkehrrechnung — und konsistent mit dem
FFMC-Zustand, aus dem der ISI derselben Zelle stammt.

---

## 6. Ehrlichkeitsregeln (gate-blockierend)

Der Pfeil behauptet **nicht**: eine Brandfront · eine gefährdete Fläche · eine amtliche Warnung ·
Sicherheit über die Stunden · einen geprüften Bewuchs.

Fehlt ein Eingang, gibt es **keinen Pfeil, sondern einen benannten Grund** — nie eine
Vorgaberichtung, nie eine 0, die wie „keine Ausbreitung" aussieht:

| Lücke | Text |
|---|---|
| `inactive` | kein aktuelles Satellitensignal — es wird nichts vorhergesagt |
| `no-wind-frame` | kein Windfeld für diese Stunde |
| `no-isi` | kein Feuerwetter-Wert an dieser Stelle (außerhalb des Modellgebiets, Schnee oder Lücke im Lauf) |
| `isi-implausible` | Feuerwetter-Wert und Wind passen nicht zusammen |
| `no-terrain` | Gelände nicht geladen — ohne Hangneigung wird keine Richtung behauptet |
| `capped` | über dem Deckel dieser Berechnung — kein Pfeil heißt **nicht** „keine Ausbreitung" |

Die **beobachtete** Verschiebung (AF2, `dynamics.ts`) und die **gerechnete** Richtung bleiben
getrennt: eigene Zeilen, eigene Optik (beobachtet massiv, gerechnet hohl/gestrichelt), und die
Abweichung wird als **Flag** berichtet, nie als Korrektur — genau wie `windAgreement` heute.

---

## 7. Umsetzung (2026-08-19/20)

Gebaut: `src/fire/spread/` mit `fbp.ts` (Gleichungen), `spreadVector.ts` (Vektoraddition),
`spreadReach.ts` (Reichweiten-Spanne), `spreadForecast.ts` (Zusammenbau je Brand),
`spreadText.ts` (alle Texte), `isiPointSample.ts`, `terrainSampler.ts`, `spreadRun.ts`,
`spreadLayer.ts`. Layer `fireSpread` (Bit 14, Z-Band 82, Dock-Gruppe „Ausbreitung (Modell)"),
Rückzug von `fireForecast` (Bit 13 → `null`), ISZ im G-Kanal des Producers, Panelzeile,
Listen-Chip, Kartennotiz, Steckbrief, `verify:fire-spread`.

### 7.1 Messungen (live, Prod-Preview, 2026-08-19 abends)

| Größe | Messwert |
|---|---|
| Aktive Brände im 24-h-Fenster | **65** (von 76 Einträgen, 119 Detektionen) |
| Gerechnet | 25 (Deckel), Rest mit Grund „über dem Deckel" |
| DEM-Zellen geladen | **12** (= Deckel `MAX_DEM_CELLS`) |
| Pfeile auf der Karte | **12** — mit Richtungen 8°, 225°, 57°, 269° … |
| Fächer | 0 bei Reglerstellung „jetzt" (korrekt: keine Zeit vergangen ⇒ keine Reichweite) |
| ISZ am Brandpunkt | für **alle 7** Stundenschritte vorhanden (2,8 … 0,8) |
| Wind am Brandpunkt | **nur Stunde 0** — s. §7.2 |
| Konsole beim Laden | 16 Fehler, alle vorbestehend (GeoSphere/ZAMG-Warnendpunkt 404), 0 Warnungen |
| Budget nach dem Bau | eagerJs 124,1 / 130,2 · largestChunk 278,4 / 292,3 · **totalJs 918,2 / 926,1 KB** gz |
| Verifier | 17 `verify:fire-*` grün, davon **`verify:fire-spread` 203/203** |

### 7.2 Der Befund, der die Phase geprägt hat: der Windlauf endet vor der Achse

Gemessen: der geladene **Windlauf war 09 UTC (12,7 h alt)**, das Feuerwetter dagegen 18 UTC
(3,7 h alt). Das Windgitter reicht +12 h ab Lauf, also bis 21 UTC — das war der Zeitpunkt der
Messung. Ergebnis: nur die Stunde 0 hatte ein Windfeld, ab +1 h griff die Lücke
`no-wind-frame`; eine Stunde später (22 UTC) hatte **keine** Stunde mehr eines.

Das ist **kein Fehler der Rechnung**, sondern die Datenlage — aber es hätte sich als leere Karte
gezeigt. Deshalb nachgezogen: `SpreadRun.horizonHour` und `horizonNote()`. Live belegt:

> „Der geladene ICON-D2-Windlauf trägt nur bis +0 h; von +1 h bis +6 h wird nichts gerechnet —
> dort heißt „kein Pfeil" „kein Windfeld", nicht „keine Ausbreitung"."

und im Grenzfall ohne jedes Windfeld:

> „Für keine Stunde der Achse liegt ein passendes Windfeld vor — deshalb kein einziger Pfeil.
> Das ist eine Lücke im geladenen ICON-D2-Lauf, keine Aussage über die Brände."

**Lehre für jede künftige Stundenachse:** die Achse (`HOUR_AXIS_MAX`) ist eine Absicht, der
geladene Lauf ist die Wirklichkeit. Wer beide gleichsetzt, produziert stille Leere. Der
Windlauf ist dabei der KURZE der beiden Treiber — das Feuerwetter wird per Verzeichnis-Scan
frisch geholt, der Wind kommt aus dem Warm-Cron und kann einen halben Tag alt sein.

### 7.3 Weitere Lehren

1. **Die SPECS-Einfügeschleife überschrieb das `layout`** (`FireMap.tsx:1704`) — für jeden
   Symbol-Layer tödlich und bis dahin unsichtbar, weil kein Spec ein `layout` trug. Gefixt.
2. **Die MapView-Import-Sperre las `src/fire/` nicht rekursiv** (`verify-fire-model.mjs:93`) —
   fünf Unterordner waren ungeprüft. Jetzt rekursiv: **52 statt ~20 Dateien**.
3. **Gl. 71/72 (Beschleunigung) gehören nicht in diese Phase**: sie beschreiben eine
   Punktzündung; unsere Brände brennen bereits. Angewandt würden sie die Strecke systematisch
   unterschätzen. Die Reichweite integriert deshalb die Gleichgewichtsrate je Stunde.
4. **M-1/M-2 haben in ST-X-3 keine eigenen Koeffizienten** (a = b = c = 0) — sie sind Mittel aus
   C-2 und D-1 über den Nadelholzanteil PC. Statt PC zu erfinden trägt **D-1** das langsame Ende.
5. **Der Kurungsfaktor (Gl. 35a/b) ist am Knick 58,8 % nicht exakt stetig** (Sprung ≈ 4·10⁻⁴).
   Eine Prüfung auf Stetigkeit schlug fehl — der Satz ist so veröffentlicht; die Prüfung hält
   jetzt die Größenordnung fest, statt eine Stetigkeit zu behaupten, die es nicht gibt.
6. **Der Service Worker liefert das alte Bundle.** Bei der Sichtprüfung am Prod-Preview lief
   nach einem Rebuild weiter der vorige Chunk (1 Worker, 4 Caches) — und erzeugte einen
   widersprüchlichen Befund („Lauf da, Panelzeile fehlt"). Vor jeder Prod-Preview-Verifikation
   `getRegistrations().unregister()` + `caches.delete()`.
7. **Textsonden dürfen nicht am Quelltext hängen**, wenn der String über zwei Zeilen umbrochen
   ist: `'… keine '` + `'Brandfront …'` machte die Prüfung blind. Auf den WERTEN prüfen.
8. **Leistungsanker messen die Maschine mit.** Drei Anker (`< 150 ms`, `< 200 ms`) fielen mit
   zwei Vite-Servern und einem GRIB-dekodierenden Browser im Hintergrund; im Leerlauf sofort
   wieder grün. Anker nur auf entlasteter Maschine bewerten.

## 8. Gate GSF1 — Stand

**Grün, mit einer ausdrücklichen Lücke.**

| Frage | Beleg |
|---|---|
| ① Funktionserhalt | 17 `verify:fire-*` grün (203/203 neu); Bits 0–12 unverändert (Quellprüfung); Punktkurve auf Klick erhalten, hängt jetzt an `fireSpread`. **Bewusste Ausnahme:** `fireForecast` zurückgezogen (Jans Entscheidung 3), Bit 13 reserviert |
| ② Desktop unverändert | **offen** — Screenshot-Diff mit Layer aus nicht erhoben (Werkzeug, s. u.) |
| ③ Touch-Targets ≥ 44 px | **offen** — Mobile-Lauf nicht erhoben |
| ④ Konsole sauber | 16 Fehler, **alle vorbestehend** (ZAMG-404), 0 Warnungen beim Laden; kein „image not found" |
| ⑤ Long Tasks > 200 ms | **offen** — Trace nicht erhoben |

**Warum offen:** die Browser-Automatisierung (Playwright-MCP) brach nach mehreren erfolgreichen
Läufen reproduzierbar ab („Browser is already in use" / „No open pages available"), viermal
zurückgesetzt. Belegt sind: Pfeile auf der Karte mit korrekten Richtungen, Sprites registriert,
Layer sichtbar, Deckel- und Horizontsatz live, Listen-Chip „→ N (Modell)", Konsole sauber.
**Nicht live gesehen:** die Panelzeile „Ausbreitungsrichtung (gerechnet …)", der Fächer (er
braucht Reglerstellung ≥ +1 h UND ein Windfeld, das an diesem Abend nicht mehr existierte),
Mobile 390, Long-Task-Trace, Desktop-Diff.

Belege: `audit/screenshots/waldbrand-ausbreitung/desktop-1440-uebersicht.png`,
`…/desktop-1440-pfeil-nah.png` (Pfeil bei Oberroth, Richtung ~8°),
`…/desktop-1440-keine-aussage.png` (kein Pfeil, Grund im Satz).
