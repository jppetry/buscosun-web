# Diagnose KL0 — Verortung der Wetterkarten-Layer

> Auftrag (Jan, 2026-08-21): „prüfe bitte ob der gleiche Fehler auch in den Layern der Wetterkarte
> vorkommt — Temperatur, Niederschlag, Windlayer und die anderen."
> Bezug: `audit/radar-punktverortung.md` (RP0–RP2). Dort war der Fehler: **Karte und Punktabfrage
> desselben Feldes benutzten verschiedenen Verortungscode.**
>
> Status: **diagnostiziert, nichts geändert.** Vier Befunde, alle gemessen; der größte ist
> **schwerer als der Radar-Fehler, der diese Linie ausgelöst hat** (76,7 km statt 24 km).

## 1. Was genau gesucht wurde

Der Radar-Fehler hatte zwei Hälften, und beide sind hier einzeln zu prüfen:

| | Frage | Radar-Antwort (RP0) |
|---|---|---|
| **(a) Projektion** | Ist das Gitter in lon/lat regulär, oder liegt es in einer Projektion? | RADOLAN/INCA/rzc sind projiziert ⇒ 4-Eck-Interpolation greift 13–36 km daneben |
| **(b) Eck-Konvention** | Bezeichnen die vier Ecken **Zellmitten** oder **Außenkanten**? | Gemischt ⇒ eine halbe Zelle |

Dazu kommt die Frage, die dem Ganzen den Namen gibt: **rendert die Karte mit demselben Code, mit
dem die Punktabfrage liest?**

## 2. Methode

1. Je Layer die drei Bahnen am Code nachgelesen: **Quelle → Ausgabe-Raster → Shader** und
   **Quelle → Punktabfrage**.
2. Die Gitterparameter **gemessen, nicht angenommen**: `audit/karten-layer-verortung/probe-d2grid.mjs`
   holt ein echtes ICON-D2-`t_2m`-Feld und liest Sektion 3 mit dem App-Decoder aus.
3. Den Versatz an **759 DACH-Orten ≥ 20 000 EW** gerechnet
   (`versatz-layer.mjs`, `versatz-confidence.mjs`).
4. **Kontrolle mitgeführt:** derselbe Rechenweg auf `poprob`/`flownowcast`, die seit RP1 über
   `de1200WarpMesh` gezeichnet werden. Ergibt die Methode dort **0,02 km**, misst sie richtig.

**Gemessene ICON-D2-Gitterparameter** (`icon-d2_germany_regular-lat-lon_single-level_2026082000_000_2d_t_2m`):
`ni 1215 · nj 746 · lon1 −3,94 · lat1 43,18 · di = dj = 0,02 · scanMode 64 (S→N)`.
`gribCorners` liefert daraus **Außenkanten** (−3,95 / 58,09 / 20,35 / 43,17) — erste Zellmitte ∓ halbe Zelle.

## 3. Die Landkarte: welcher Layer hängt an welcher Geometrie

| Layer | Gitter | Karte | Punktabfrage | Befund |
|---|---|---|---|---|
| `temp` `gust` `thunder` `lightningfc` `snow` `rotation` `wind` | ICON-D2 nativ, subsampled 608×373 | ScalarLayer/WindLayer über `uvBounds` (**Außenkanten**) | `bilinearChannel`/`bilinear`, `x = u·(w−1)` (**Zellmitten**) | **B3** |
| `clouds` | ICON-D2 nativ, voll 1215×746 | CloudLayer über `corners` (Außenkanten) | `sampleCloudsAt`, `Math.round(u·(w−1))` (Zellmitten) | **B3** |
| `nowcast` | DACH-Komposit 600×512 (reguläres lat/lon) | RainLayer über `COMPOSITE_CORNERS` (Außenkanten) | keine — der Slider liest die **Quellgitter** (RP1/RP2) | **B4** |
| `flownowcast` `poprob` | DE1200 (polar-stereografisch) | RainLayer **mit `de1200WarpMesh`** | `sampleRadarPoint` | **in Ordnung** ✅ |
| `confidence` (PoP-Modus) | DE1200 (polar-stereografisch) | ConfidenceLayer über ein **achsparalleles lon/lat-Rechteck aus NUR NW und SE** | keine | **B1 — schwer** |
| `confidence` (Temp-Modus, ICON-D2-PoP-Fallback) | ICON-D2 | dieselben `uvBounds` wie der Temp-Layer | keine | in Ordnung |
| `temp` `wind` `clouds` `precip` **bei gewähltem Raster-Modell** | Fusions-IDW 100×80 (bzw. 80×64) | ScalarLayer über `uvBounds` (**als Außenkanten gelesen**) | `TemperatureSampler` (Zellmitten) | **B2** |
| `snowline` | abgeleitet aus dem Temp-Gitter | GeoJSON-Linie, Stützstellen `i/(W−1)` (Zellmitten) | — | **B3** (Linie ≠ Farbe darunter) |
| `sat` | WMS-Kacheln `EPSG:3857` | Server rechnet um | — | in Ordnung ✅ |
| `lightning` `stations` `cells` `hail` `warnings` | Vektor, echte Koordinaten | GeoJSON | Klick auf das Feature | in Ordnung ✅ |

**Die Modellwahl ist geometrisch harmlos.** Alle Switcher-Quellen (AROME-AT/FR, ARPEGE, GFS, IFS/AIFS,
ICON-EU/global, AICON, ICON-CH1/CH2-EPS, ICON-D2-EPS) liefern **Punktlisten an expliziten lon/lat**
in die Fusion; keine Projektion wandert in die Darstellung. Der GRIB-Decoder nimmt ohnehin nur
GDT 0 (reguläres lat-lon) und GDT 101 (icosahedral, mit mitgelieferten `clat`/`clon`) an und wirft
alles andere — ein **rotiertes Gitter kann in diese App gar nicht hineinrutschen**
(`gribDecode.ts:230`). Das ist die eine Stelle, an der Frage (a) systematisch abgesichert ist.

## 4. Befund B1 — der Vertrauens-Schleier zeichnet DE1200 als lon/lat-Rechteck

`src/scalar/confidenceImage.ts:278` (`buildEnsembleConfidenceImage`) bekommt die **echten,
polar-stereografischen** DE1200-Ecken und macht daraus:

```ts
const [nw, , se] = corners;
const uvBounds = [(nw[0]+180)/360, (90-nw[1])/180, (se[0]+180)/360, (90-se[1])/180];
```

Zwei von vier Ecken werden weggeworfen und der Rest als **achsparalleles Rechteck** an den
`ConfidenceLayer` gegeben, der genau so rendert (`ConfidenceLayer.ts:51`, `uv = (v_equi_uv − bounds)/span`).
DE1200 ist aber ein Trapez: die Nordkante läuft von 1,46 °O bis **18,73 °O**, die Südkante von
3,57 °O bis 16,58 °O. Das Rechteck benutzt 1,46…16,58 — es ist **schmaler als das Gitter im Norden
und weiter als im Süden**, gleichzeitig verschoben.

**Gemessen** (`versatz-confidence.mjs`):

| | Versatz zwischen gezeichneter und wahrer Position |
|---|---|
| 700 DE-Orte ≥ 20 000 EW | **Median 76,7 km · max 93,7 km** (Stralsund) |
| alle 759 DACH-Orte | Median 76,8 km · max 110,5 km (Vernier) |
| **Kontrolle** `poprob`/`flownowcast` (dasselbe Gitter, `de1200WarpMesh`) | **Median 0,02 km · max 0,03 km** ✅ |

Die Kontrolle benutzt exakt denselben Rechenweg und dieselben Ortsdaten. Sie ist der Beleg, dass
nicht die Messung, sondern der Layer danebenliegt — und sie zeigt zugleich, dass die **Lösung im
selben Repo schon existiert**.

**Zweite, unabhängige Gegenprobe** (`spot-confidence.mjs`, ohne Ortsliste, ohne Texel-Arithmetik):
die wahre Gitterfraktion in DE1200 gegen die, die das Rechteck unterstellt.

```
PS-Spanne  x: 1100,0 km   y: 1200,0 km   (Soll 1100 / 1200 — Eck-Geometrie bestätigt)
Berlin      wahr u=0,7130 v=0,3473 | Rechteck u=0,7903 v=0,3284  ⇒ 84,3 km daneben
Stralsund   wahr u=0,6824 v=0,1768 | Rechteck u=0,7691 v=0,1525  ⇒ 96,5 km daneben
München     wahr u=0,6086 v=0,7799 | Rechteck u=0,6692 v=0,7587  ⇒ 66,6 km daneben
Köln        wahr u=0,2903 v=0,5014 | Rechteck u=0,3636 v=0,4836  ⇒ 79,2 km daneben
```

Der Versatz ist **fast reines Ost-West**: das Rechteck ist 15,12° breit, das Gitter im Norden
17,27° — die Ostkomponente wird um ~11 % gestaucht, jeder Ort rutscht nach Osten.

Der Pfad ist kein Randfall: `MapView.tsx:3412` schätzt das Flussfeld ausdrücklich auch dann, wenn
nur `confidence` **und** `nowcast` aktiv sind („Auch der Vertrauens-Schleier im PoP-Modus braucht
den Fluss"). Wer beide Layer einschaltet, sieht die Schraffur rund 77 km neben der Unsicherheit,
die sie beschreiben soll — bei einem Layer, dessen ganze Aussage lautet „hier kannst du der
Vorhersage weniger trauen".

Nebenbei: `buildPopImage` (`confidenceImage.ts:307`) hat **denselben Defekt** und ist derzeit
**unbenutzt** — `poprob` läuft über den RainLayer-Pfad mit Mesh. Die Funktion sollte nicht
verdrahtet werden, ohne sie vorher zu reparieren.

## 5. Befund B2 — Fusions-Raster: Zellmitten werden als Außenkanten gezeichnet

Das IDW-Ausgabegitter der Fusion legt seine Zellen auf
`x0 + i·(x1−x0)/(cols−1)` (`spatialInterp.ts:176`, `openMeteoSource.ts:125`) — die Bounds
bezeichnen also die **äußersten Zellmitten**. Der ScalarLayer-Shader liest die Textur aber mit
`texture2D(uv)`, dessen Texelmitten bei `(i+0,5)/W` liegen — **Außenkanten**. Ergebnis: eine halbe
Zelle Versatz, und die Zelle ist hier groß.

| Auflösung (MapView) | Zelle | Karte ↔ Wirklichkeit | Karte ↔ Punktabfrage |
|---|---|---|---|
| 100×80 (Phase B) | 8,7 × 14,1 km | **Median 3,14 km · max 7,35 km** | dito |
| 80×64 (Phase A, First Paint) | 10,9 × 17,6 km | **Median 3,94 km · max 9,22 km** | dito |

Hier ist **die Punktabfrage richtig und die Karte falsch** — genau umgekehrt zu B3. Der
`TemperatureSampler` rechnet mit `x = u·(w−1)`, also in der Konvention, in der das Gitter gebaut
wurde; gemessen 0,00 km Abweichung zur Wirklichkeit.

Der Pfad greift, sobald im Modell-Switcher ein gerastertes Modell gewählt ist
(`fusionFor(...)`, `MapView.tsx:949`) — dann speist die Fusion `temp`, `wind`, `clouds` und
`precip` —, sowie als Temp-Erstbild, solange das native ICON-D2-Gitter noch lädt.

## 6. Befund B3 — ICON-D2: konstant 1,11 km zu weit nördlich, und Abfrage ≠ Karte

Zwei getrennte Ursachen, beide klein, beide systematisch.

**(i) Das Subsampling nimmt die südwestliche Ecke des Blocks, gezeichnet wird die Blockmitte.**
`buildTempImage`/`buildGustImage`/`buildWindRgba` u. a. nehmen mit `ss = 2` den Wert
`sj = jj·ss`, `si = ii·ss` — den **ersten** Punkt jedes 2×2-Blocks. Das Ausgabe-Raster wird dann
über die **vollen** Gitter-Außenkanten gespannt, also so gezeichnet, als säße der Wert in der
Blockmitte. In der Breite gleichen sich `ceil(1215/2) = 608` und die Rest-Spalte fast aus
(Δlon −0,0017…+0,0067°), in der Höhe ist `746 = 373·2` exakt und der Versatz daher **konstant**:

```
Karte je Achse: Δlat −0,0100…−0,0100°   ⇒  1,11 km, überall, immer, nach Norden
```

Das gilt für **temp · gust · thunder · lightningfc · snow · rotation · wind** und, weil dieselben
Module dort laufen, für die Feuerwetter-Raster der Brandansicht.

**(ii) Karte und Punktabfrage benutzen verschiedene Konventionen** — der Radar-Fehler in klein:

| | Karte | Punktabfrage | Abstand beider |
|---|---|---|---|
| ICON-D2 subsampled (608×373) | Δlat konstant −0,0100° | Δlat −0,0211…+0,0024° | Median 0,47 km · **max 1,42 km** |
| ICON-D2 voll (Wolken) | 0,0000° (exakt) | ±0,0067° | Median 0,24 km · max 0,71 km |

Die Punktabfrage liegt damit bis **2,35 km** neben dem Ort, den sie beschreibt. Betroffen sind die
**Stadt-Temperatur-Labels**, die dauerhaft auf der Karte stehen — und deren Kopfkommentar
ausdrücklich behauptet, sie träfen das Pixel darunter:

> `temperatureLabels.ts:6` — „using the SAME DEM-aware lapse arithmetic that the ScalarLayer
> fragment shader applies, so the label value matches the colour of the underlying heatmap pixel."

Die Arithmetik stimmt, die **Verortung** nicht. Dasselbe gilt für `snowLine.ts` (Stützstellen
`i/(W−1)`): die Schneefallgrenze wird als Linie über ein Farbfeld gelegt, das eine halbe Zelle
weiter liegt.

## 7. Befund B4 — DACH-Niederschlags-Komposit: eine halbe Komposit-Zelle

`gridLatLon()` (`precipIndexMap.ts:93`) legt die Komposit-Zellen auf `c/(w−1)` — Zellmitten —,
`COMPOSITE_CORNERS` gehen als Außenkanten in den RainLayer. Gleiche Ursache wie B2, kleinere Zelle:

```
Karte ↔ Wirklichkeit: Median 0,51 km · max 1,14 km   (Δlat ±0,0086°, Δlon −0,0090…+0,0082°)
```

Das ist **zusätzlich** zu RP1/RP2: die Zuordnung Komposit-Zelle → Quellgitter ist seit dem
Radar-Fix richtig; hier verrutscht das Komposit-Gitter als Ganzes gegen seine eigene Zeichenfläche.
Eine Punktabfrage auf dem Komposit gibt es nicht (`radarNowcast.ts` liest die Quellgitter direkt),
der Widerspruch Karte↔Slider entsteht also nicht — die Karte allein ist um eine halbe Zelle daneben.

## 8. Was nachweislich in Ordnung ist

- **`sat`** — WMS mit `{bbox-epsg-3857}`; die Umprojektion macht der DWD-GeoServer. Keine
  Client-Geometrie, keine Punktabfrage.
- **`lightning` · `stations` · `cells` · `hail` · `warnings`** — Vektorfeatures mit echten
  Koordinaten; der Klick trifft das Feature selbst.
- **`flownowcast` · `poprob`** — DE1200 mit `de1200WarpMesh` gezeichnet, Punktabfrage über
  `sampleRadarPoint`. Kontrolle: 0,02 km.
- **`nowcast`-Punktabfrage** — RP1/RP2, unverändert richtig.
- **Alle Switcher-Modelle** — Punktlisten in die Fusion, keine Projektion in der Darstellung;
  der Decoder lässt ohnehin nur GDT 0 und GDT 101 durch.
- **`confidence` im Temp-Modus und im ICON-D2-PoP-Fallback** — dieselben `uvBounds` wie der
  Temp-Layer bzw. ein ICON-D2-Rechteck, das ein Rechteck sein darf.

## 9. Warum das durchgerutscht ist

Der Radar-Fix RP1/RP2 hat zwei Fassaden geschaffen — `pointForecast/radarSample.ts` und
`GridKind` in `precipIndexMap.ts` —, und beide kennen **Projektion und Eck-Konvention je Quelle**.
Sie decken aber nur die Radar-Kette ab. Für die übrigen Layer gibt es **keine solche Stelle**:
`lngToEquiX`/`latToEquiY` sind in **zwölf** Dateien einzeln kopiert, die Eck-Konvention steht nirgends
geschrieben, und die Punktabfrage-Konvention (`u·(w−1)`) ist in `windPointSample.ts`,
`temperatureLabels.ts`, `qa/layerSampler.ts`, `snowLine.ts` und `sampleCloudsAt` fünfmal
unabhängig ausformuliert. Solange die Konvention nur im Kopf existiert, kann jede neue Quelle sie
anders beantworten — und genau das ist passiert: **ICON-D2 liefert Außenkanten, die Fusion
Zellmitten, und beide gehen durch denselben Shader.**

**Lehre.** Der Radar-Fehler war nicht „RADOLAN ist projiziert". Er war: *es gibt keine Stelle, die
weiß, was die vier Zahlen bedeuten.* Diese Stelle fehlt für die Wetterkarte weiterhin — nur ist
das Gitter dort regulär, weshalb der Rest-Fehler eine halbe Zelle statt 24 km beträgt. Die eine
Ausnahme (B1) beweist die Regel: sobald ein projiziertes Gitter in diesen Pfad gerät, sind es
wieder 77 km.

## 10. Behebungsvorschlag (nicht umgesetzt — Jans Entscheidung)

| # | Was | Wirkung | Aufwand |
|---|---|---|---|
| **KL1** | `confidence` im PoP-Modus über `de1200WarpMesh` zeichnen — entweder den `ConfidenceLayer` um den Mesh-Pfad des `RainLayer` erweitern, oder den Schleier auf das Komposit-Gitter resampeln | **−77 km** | 1 Layer + 1 Aufrufer |
| **KL2** | EINE Fassade für die Eck-Konvention der Nicht-Radar-Gitter (`edge` vs. `center`), wie `radarSample.ts` sie für Radar hat; Fusion/Open-Meteo/Komposit ihre Bounds als **Außenkanten** ausgeben lassen (analog `cellCentersToEdges` aus RP2) | −3,1…9,2 km (B2), −0,5 km (B4) | 3 Erzeuger + 1 Modul |
| **KL3** | Subsampling auf die **Blockmitte** ziehen (oder die Bounds um `(ss−1)/2` Zellen einziehen) und die Punktabfragen auf die Außenkanten-Konvention umstellen | −1,11 km konstant, Karte↔Abfrage → 0 | 9 Erzeuger, 5 Sampler |
| **KL4** | Verifier `verify:layer-geometry` nach dem Muster von `verify:radar-sampling`: Karte ↔ Punktabfrage < 1/10 Zelle je Layer-Familie | hält es geschlossen | 1 Skript |

KL1 ist der einzige Punkt, der aus meiner Sicht nicht warten sollte.

## 11. Belege

- `audit/karten-layer-verortung/probe-d2grid.mjs` — echte ICON-D2-Gitterparameter (Netz, DWD opendata)
- `audit/karten-layer-verortung/versatz-layer.mjs` — B2/B3/B4, netzfrei, 759 Orte
- `audit/karten-layer-verortung/versatz-confidence.mjs` — B1 + Kontrolle, netzfrei, 759 Orte
- `audit/karten-layer-verortung/spot-confidence.mjs` — zweite, unabhängige Gegenprobe zu B1 +
  Prüfung der Eck-Geometrie (PS-Spanne 1100,0 × 1200,0 km)
- **Offen:** die Sichtprüfung im Browser. Die MCP-Browser-Instanz dieser Sitzung hatte kein Netz
  (`ERR_INTERNET_DISCONNECTED` auf `tiles.openfreemap.org` und alle Datenquellen), der Kartenstil
  lud nicht, `map.style._layers` blieb leer — es waren also gar keine App-Layer da. Zusätzlich fiel
  in DACH in dieser Nacht kein Niederschlag, sodass der PoP-Modus auch mit Netz nichts Vergleichbares
  gezeigt hätte. Die Zahlen oben stehen ohne Browser; die optische Bestätigung von B1 fehlt.
