# Diagnose KL0 — Verortung der Wetterkarten-Layer

> Auftrag (Jan, 2026-08-21): „prüfe bitte ob der gleiche Fehler auch in den Layern der Wetterkarte
> vorkommt — Temperatur, Niederschlag, Windlayer und die anderen."
> Bezug: `audit/radar-punktverortung.md` (RP0–RP2). Dort war der Fehler: **Karte und Punktabfrage
> desselben Feldes benutzten verschiedenen Verortungscode.**
>
> Status: **KL1/KL3/KL6/KL7 umgesetzt (Gate GKL1, §12), je Layer nachgemessen (§13) — B5 und B2 offen.** Diagnose §1–11, Umsetzung §12, Nachmessung §13. Sieben Befunde, alle gemessen; der größte ist
> **schwerer als der Radar-Fehler, der diese Linie ausgelöst hat** (76,7 km statt 24 km).
> B5/B6 kamen bei der Nachfrage „gibt es noch offene Darstellungsfehler?" (2026-08-22) dazu —
> zwei Lücken, die die erste Messrunde nicht abgedeckt hatte. **B2 ist seit dem Löschen des
> Modells „Buscosun Fusion" (2026-08-22) im Normalbetrieb nicht mehr erreichbar** — es bleibt
> nur bei explizit gewähltem externem Raster-Modell (s. §5). Alle Zahlen am Stand vom
> 2026-08-22 nachgerechnet, alle Trägerdateien gegen HEAD unverändert.

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
| `flownowcast` `poprob` | DE1200 (polar-stereografisch), gröbert auf 137×150 | RainLayer **mit `de1200WarpMesh`** | `sampleRadarPoint` | Projektion ✅, **B5** |
| DEM des Temp-Layers (Höhenkorrektur je Pixel) | Terrarium 1140×700 über die ICON-Bounds | ScalarLayer, **dieselbe `uv` wie die Werte-Textur** (Außenkanten) | — | **B6** |
| `confidence` (PoP-Modus) | DE1200 (polar-stereografisch) | ConfidenceLayer über ein **achsparalleles lon/lat-Rechteck aus NUR NW und SE** | keine | **B1 — schwer** |
| `confidence` (Temp-Modus, ICON-D2-PoP-Fallback) | ICON-D2 | dieselben `uvBounds` wie der Temp-Layer | keine | in Ordnung |
| `temp` `wind` `clouds` `precip` **nur bei gewähltem externem Raster-Modell** | IDW-Rasterer 100×80 (bzw. 80×64) | ScalarLayer über `uvBounds` (**als Außenkanten gelesen**) | `TemperatureSampler` (Zellmitten) | **B2** — bei „Native" nicht aktiv |
| `snowline` | abgeleitet aus dem Temp-Gitter | GeoJSON-Linie, Stützstellen `i/(W−1)` (Zellmitten) | — | **B3** (Linie ≠ Farbe darunter) |
| `sat` | WMS-Kacheln `EPSG:3857` | Server rechnet um | — | in Ordnung ✅ |
| `lightning` `stations` `cells` `hail` `warnings` | Vektor, echte Koordinaten | GeoJSON | Klick auf das Feature | in Ordnung ✅ |

### 3a. Ergebnis je Layer (gemessen, 759 DACH-Orte ≥ 20 000 EW)

Nachgetragen 2026-08-22 auf Jans Nachfrage. Vorher waren acht Layer als „gleiches Muster"
zusammengefasst; hier ist jeder einzeln am Code geprüft (`TARGET_WIDTH`, Subsampling, Eck-Quelle)
und gemessen. `ss = ceil(1215/700) = 2` gilt für **alle** sieben subsampelnden ICON-D2-Quellen —
nachgesehen in `iconD2TempSource` · `iconD2GustSource` · `iconD2Thunder` · `iconD2Lpi` ·
`iconD2Snow` · `iconD2Rotation` · `windFrameBuild`.

| Layer | Karte ↔ Wirklichkeit | Karte ↔ Punktabfrage | Urteil |
|---|---|---|---|
| `temp` | **1,11 km N** (konstant) | 0,47 km Median, 1,42 max | falsch, systematisch |
| `gust` | **1,11 km N** (konstant) | dito | falsch, systematisch |
| `thunder` | **1,11 km N** (konstant) | dito | falsch, systematisch |
| `lightningfc` | **1,11 km N** (konstant) | dito | falsch, systematisch |
| `snow` | **1,11 km N** (konstant) | dito | falsch, systematisch |
| `rotation` | **1,11 km N** (konstant) | dito | falsch, systematisch (+ gewollte 3×3-Max-Dilatation) |
| `wind` (10 m, ICON-D2) | **1,11 km N** (konstant) | dito | falsch, systematisch |
| `wind` (Druckflächen, ICON-EU) | 0,63 km Median, 0,99 max | 1,26 km Median, 1,97 max | falsch, aber Dehnung statt Verschiebung |
| `clouds` | **0,00 km** | 0,24 km Median, 0,71 max | **Karte richtig**, Abfrage nicht |
| `snowline` | erbt das Temp-Gitter | Stützstellen in Zellmitten-Konvention | Linie ≠ Farbe darunter |
| `confidence` (Temp-Modus) | wie `temp` (gleiche Auflösung, gleiche `uvBounds`) | — | falsch wie `temp` |
| `confidence` (PoP-Modus) | **76,7 km** | — | **schwer falsch** (B1) |
| `nowcast` 0–2/3 h (Radar) | 0,51 km (Komposit-Raster) | Punktabfrage richtig (RP1/RP2) | Karte um ½ Zelle daneben |
| `nowcast` ab 2/3 h (ICON-D2) | 0,51 km + Zugriffsfehler (s. B7) | dito | zwei kleine Fehler übereinander |

**ICON-EU verhält sich anders als ICON-D2** — und der Unterschied ist lehrreich: bei ICON-D2 ist
`nj = 746 = 373·2` glatt teilbar, deshalb ist der Nordversatz eine **feste Verschiebung**. Bei
ICON-EU (1377×657, 0,0625°) sind `ni−1` und `nj−1` beide gerade, das Subsampling deckt die volle
Spanne ab, und derselbe Code erzeugt eine **Dehnung** um ±½ Nativzelle statt einer Verschiebung.
Dass DACH nahe der Mitte der ICON-EU-Domäne liegt, drückt die Zahl auf 0,63 km — im Norden
Skandinaviens wären es 3,5 km. Die Zahl hängt also am Ort, nicht am Layer.

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

## 5. Befund B2 — IDW-Rasterer: Zellmitten werden als Außenkanten gezeichnet

> **Nachtrag 2026-08-22 (Jans Hinweis „die Buscosun-Fusion hat nie funktioniert und ist gelöscht"):**
> am Code nachgeprüft. Aus `modelCatalog.ts` ist **genau ein** Eintrag verschwunden —
> `id: 'fusion', name: 'Buscosun Fusion'` —, und `MODEL_ID_TO_CHOICE` (`MapView.tsx:705`) führt
> `fusion` nicht mehr. Der **Rasterer selbst ist nicht gelöscht**: `loadFusedForecast` +
> `FusionEngine` + `spatialInterp` sind da, typecheck grün, und sie zeichnen weiterhin die Karte,
> sobald eines der **13 externen** gerasterten Modelle gewählt ist (AROME-AT/FR · INCA ·
> ICON-D2-EPS · ICON-CH1/2-EPS · ICON-EU · GFS · IFS · AIFS · AIFS-ENS · ICON-global · AICON ·
> ARPEGE). Gitter, Bounds und Auflösung sind unverändert ⇒ **die Zahlen unten gelten weiter**,
> nur der Auslöser heißt anders.
>
> Entfallen ist dagegen der **Erstpaint-Fallback**: mit „Native" ist `modelChoiceRef.current` null,
> `loadOpenMeteo` kehrt sofort zurück, `forecast` bleibt null — der Zweig `|| !iconD2TempRef.current`
> (`MapView.tsx:3515`) kann nicht mehr feuern. **Im Normalbetrieb (Native) ist B2 damit tot.**

Das IDW-Ausgabegitter legt seine Zellen auf
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

Der Pfad greift **ausschließlich** bei explizit gewähltem externem Raster-Modell
(`fusionFor(...)`, `MapView.tsx:950`) — dann speist der Rasterer `temp`, `wind`, `clouds` und
`precip`. Mit der Voreinstellung „Native" rendert ICON-D2 direkt und B2 kommt nicht vor.

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

## 7a. Befund B5 — das Flow-Gitter wird nach Osten gedehnt

Nachgetragen 2026-08-22. `coarsenFrameU8(values, 1100, 1200, 8)` deckelt mit
`floor(w/factor)` → **137×150**. Das deckt `137·8 = 1096` der 1100 RADOLAN-Spalten ab; die
restlichen **4 Spalten fallen weg**. Gezeichnet wird das Bild aber über die **vollen**
DE1200-Ecken (`fl.corners` + `de1200WarpMesh`), also über 1100 Spalten. Ergebnis: eine lineare
Dehnung, die im Westen bei null anfängt und nach Osten wächst.

```
Ost–West: Versatz 0,01 … 3,99 Zellen  ⇒ bis 3,99 km
Nord–Süd: 0,00 km   (1200 = 150·8 geht exakt auf)
```

Betrifft **`flownowcast`**, **`poprob`** und — zusätzlich zu den 77 km — **`confidence`**.

Wichtig für die Beweislage: die Kontrolle in §4 prüfte das **Mesh** (0,02 km) und war insofern
richtig; sie prüfte aber nicht diese Dehnung, weil sie die Mesh-Position auf die *native*
Zelle abbildete statt auf die *grobe*. Der Fehler ist damit klein, aber er war vorher unbelegt —
und `poprob`/`flownowcast` sind nicht so makellos, wie §8 der ersten Fassung nahelegte.

## 7b. Befund B6 — die Höhenkorrektur des Temperatur-Layers greift 1,2 km daneben

Nachgetragen 2026-08-22. `buildDemImage` (`iconD2TempSource.ts:80`) tastet das Gelände auf
`latMin + j·span/(rows−1)` ab — **Zellmitten** —, und der ScalarLayer liest es mit **derselben
`uv`** wie die Werte-Textur, also in **Außenkanten**-Konvention (`meshFrag`,
`texture2D(u_dem, uv)`).

```
DEM-Raster 1140×700 über die ICON-D2-Außenkanten
Zelle 0,021335° lon × 0,021345° lat  ≈  1,53 × 2,37 km
⇒ Versatz bis ±½ Zelle = 0,76 km lon · 1,19 km lat
```

Das ist der einzige Befund, der nicht nur die **Position** eines Wertes verschiebt, sondern den
**Wert selbst** ändert: der Shader rechnet `tPhys += (cellElev − demElev) · lapse`. Steht `demElev`
für Gelände aus 1,2 km Entfernung, wird die Höhenkorrektur mit einer fremden Höhe gerechnet — im
Flachland ohne Folge, im Hochgebirge ist genau dieser Term der Grund, warum der Layer überhaupt
DEM-verfeinert ist. **Die Temperaturwirkung ist nicht gemessen** (dafür bräuchte es das echte
Terrarium-DEM im Headless-Lauf); sie entspricht dem Geländerelief über diese Strecke.

## 7c. Befund B7 — das Komposit greift ICON-D2 in der falschen Konvention ab

Nachgetragen 2026-08-22. In `precipIndexMap.ts` steht

```ts
lonlat: { project: null, edge: false },  // ICON-D2 `regular-lat-lon`: schon regulär
```

Der Kommentar beantwortet Frage (a) — die Projektion — und **schweigt zu Frage (b)**. `edge: false`
heißt `Math.round(u·(sCols−1))`, also Zellmitten-Konvention; die Ecken kommen aber aus
`gribCorners` und sind **Außenkanten**. ICON-D2-Niederschlag wird nicht subsampelt
(`decodeGridStep` gibt `ni×nj`), das Gitter ist also volle 1215×746.

```
Soll-Zelle vs. genommene Zelle: bei 130 von 759 Orten (17 %) eine ANDERE Zelle
                                Median 0,00 km · max 2,69 km (Zürich)
```

Das ist kein systematischer Versatz, sondern ein gelegentliches Off-by-one: in 83 % der Fälle
trifft `round` dieselbe Zelle wie `floor`, in 17 % die Nachbarzelle. Für die Radar-Quellen
(`radolan`/`inca`/`rzc`, `edge: true`) ist der Zugriff seit RP2 richtig — nur der Modell-Eintrag
in derselben Tabelle wurde nicht mitgezogen. Der Fehler sitzt damit **in der Datei, die die
Konvention einführen sollte**.

## 8. Was nachweislich in Ordnung ist

- **`sat`** — WMS mit `{bbox-epsg-3857}`; die Umprojektion macht der DWD-GeoServer. Keine
  Client-Geometrie, keine Punktabfrage.
- **`lightning` · `stations` · `cells` · `hail` · `warnings`** — Vektorfeatures mit echten
  Koordinaten; der Klick trifft das Feature selbst.
- **`flownowcast` · `poprob`** — DE1200 mit `de1200WarpMesh` gezeichnet, Punktabfrage über
  `sampleRadarPoint`. Mesh-Kontrolle: 0,02 km. **Einschränkung:** die Gitter-Dehnung aus B5
  (bis 3,99 km im Osten) kommt obendrauf — die Projektion stimmt, der Rahmen ist 4 km zu weit.
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
| **KL5** | `coarsenFrameU8` die Restspalten mitnehmen (`ceil` + Teilblock) **oder** die Ecken auf den tatsächlich abgedeckten Ausschnitt einziehen | −4,0 km im Osten (B5) | 1 Funktion + 1 Aufrufer |
| **KL6** | DEM-Abtastung auf `(j+0,5)/rows` ziehen, damit sie dieselbe Konvention hat wie die `uv`, mit der der Shader sie liest | −1,2 km in der Höhenkorrektur (B6) | 1 Funktion |
| **KL7** | `GRID_GEO.lonlat` in `precipIndexMap.ts` auf `edge: true` — ICON-D2-Ecken sind Außenkanten (`gribCorners`) | −2,7 km bei 17 % der Orte (B7) | ein Wort |
| **KL4** | Verifier `verify:layer-geometry` nach dem Muster von `verify:radar-sampling`: Karte ↔ Punktabfrage < 1/10 Zelle je Layer-Familie | hält es geschlossen | 1 Skript |

KL1 ist der größte Einzelbetrag; KL3 trifft dafür ALLE nativen GRIB-Layer gleichzeitig und ist damit
das, was man auf der Karte täglich sieht. KL5, KL6 und KL7 sind Einzeiler
und hängen an keiner Entscheidung; KL2/KL3 fassen viele Dateien an und gehören in eine eigene Phase.

## 11. Belege

- `audit/karten-layer-verortung/probe-d2grid.mjs` — echte ICON-D2-Gitterparameter (Netz, DWD opendata)
- `audit/karten-layer-verortung/versatz-layer.mjs` — B2/B3/B4, netzfrei, 759 Orte
- `audit/karten-layer-verortung/versatz-confidence.mjs` — B1 + Kontrolle, netzfrei, 759 Orte
- `audit/karten-layer-verortung/spot-confidence.mjs` — zweite, unabhängige Gegenprobe zu B1 +
  Prüfung der Eck-Geometrie (PS-Spanne 1100,0 × 1200,0 km)
- `audit/karten-layer-verortung/versatz-rest.mjs` — B5 (Flow-Gitter-Dehnung) und B6 (DEM), netzfrei
- **Offen:** die Sichtprüfung im Browser. Die MCP-Browser-Instanz dieser Sitzung hatte kein Netz
  (`ERR_INTERNET_DISCONNECTED` auf `tiles.openfreemap.org` und alle Datenquellen), der Kartenstil
  lud nicht, `map.style._layers` blieb leer — es waren also gar keine App-Layer da. Zusätzlich fiel
  in DACH in dieser Nacht kein Niederschlag, sodass der PoP-Modus auch mit Netz nichts Vergleichbares
  gezeigt hätte. Die Zahlen oben stehen ohne Browser; die optische Bestätigung von B1 fehlt.

---

## 12. Umsetzung — Gate GKL1 (2026-08-22)

Jans Auftrag: „ja starte mit dem fix". Umgesetzt sind **KL1, KL3, KL6, KL7** und der
Komposit-Teil von KL2. Offen bleiben der Rest von KL2 (der IDW-Rasterer, B2) — er greift nur bei
explizit gewähltem externem Modell und ist im Normalbetrieb nicht erreichbar — und **B5**:
die Nachmessung (§13) hat gezeigt, dass **KL5 die Dehnung nicht beseitigt**, sondern nur ihr
Vorzeichen dreht. Die übrigen Zahlen unten sind unverändert richtig; die Bewertung von KL5 in
§12.2 ist korrigiert.

### 12.1 Die eine Stelle, die vorher fehlte

`src/sources/gribDecode.ts` bekommt neben `gribCorners` ein zweites, benanntes Gegenstück:

```ts
export function subsampledCorners(f: GribField, ss: number)
```

`gribCorners` beantwortet „wo liegt das **Gitter**", `subsampledCorners` beantwortet „wo liegen die
**Werte, die tatsächlich im Bild stehen**". Bisher gab es für die zweite Frage keine Stelle im Repo
— genau die Diagnose aus §9. `ss = 1` liefert exakt `gribCorners` zurück (Verifier-Check), der
nicht subsampelnde Wolken-Pfad ist also bit-gleich.

Dazu `texelCoord(uv, n)` in `src/wind/windPointSample.ts` — die GPU-Konvention als Funktion, statt
fünfmal ausgeschrieben.

### 12.2 Was geändert wurde

| Datei | Änderung |
|---|---|
| `src/sources/gribDecode.ts` | **neu:** `subsampledCorners` |
| `iconD2TempSource` · `iconD2GustSource` · `iconD2Thunder` · `iconD2Lpi` · `iconD2Snow` · `iconD2Rotation` · `iconD2FireWeather` · `iconD2Smi` · `iconD2Relhum` | `uvBounds` aus `subsampledCorners(gridRef, ss)` statt `gribCorners(gridRef)` (KL3) |
| `iconD2WindSource` · `windFrameWorker` · `iconEuPressureWind` | dito über die neue EINE Stelle `windGridCorners(u)` — die 700 steht nicht mehr zweimal im Repo |
| `iconD2TempSource.buildDemImage` | DEM auf **Zellmitten** `(j+0,5)/rows` statt `j/(rows−1)`; DEM teilt jetzt die Ecken der Werte-Textur (KL6) |
| `windPointSample` | **neu:** `texelCoord`; `bilinear` rechnet Außenkanten statt `u·(n−1)` (KL3) |
| `temperatureLabels.bilinearChannel` · `qa/layerSampler.sampleCloudsAt` · `scalar/snowLine` | dieselbe Konvention (KL3) |
| `fire/spread/isiPointSample.maskIntact` | benutzt `texelCoord` — sonst prüfte die Maske andere Zellen, als der Wert gemischt wird |
| `scalar/precipIndexMap` | `GRID_GEO.lonlat` → `edge: true` (KL7); `gridLatLon` auf Zellmitten (KL2-Komposit) |
| `ml/nowcasterInference.coarsenFrameU8` | `ceil` statt `floor` — das Flow-Gitter deckt jetzt alle 1100 Spalten. **Behebt B5 NICHT** (Nachmessung §13.2): die Dehnung bleibt, nur mit umgekehrtem Vorzeichen |
| `scalar/confidenceImage` | **KL1:** der PoP-Schleier wird über `buildIndexMap(..., 'radolan')` auf ein reguläres lon/lat-Gitter umgetastet |

### 12.3 KL1 ohne Shader-Änderung

Der naheliegende Weg wäre gewesen, den `ConfidenceLayer` um den Warp-Mesh-Pfad des `RainLayer` zu
erweitern. Das ist eine **Shader-/WebGL-Pipeline-Änderung** und damit STOPP & FRAGEN. Der Layer
bleibt deshalb unangetastet: stattdessen tastet `buildEnsembleConfidenceImage` den Schleier auf ein
reguläres lon/lat-Gitter um — mit **derselben `buildIndexMap`**, die seit RP1/RP2 schon das
Niederschlags-Komposit richtig verortet. Der Layer bekommt danach ein echtes Rechteck.

Zwei Nebenwirkungen, beide Verbesserungen: das Zielrechteck umfasst jetzt **alle vier** Ecken (nicht
nur NW und SE), und Zellen außerhalb der Radar-Domäne liefern `−1` ⇒ Alpha 0. Der Schleier hört
damit am Radarrand auf, statt wie bisher das ganze Rechteck zu schraffieren (**3 086 von 21 432
Zellen**, gemessen).

### 12.4 Belege

**Verifier `verify:layer-geometry` — ALLE 15 CHECKS PASS** (neu, `scripts/verify-layer-geometry.mjs`,
gegen den echten App-Code):

```
ICON-D2: Karte zeichnet jeden Wert auf seinen Abtastpunkt (608×373)   max Δ 7,1e-15°
ICON-EU: Karte zeichnet jeden Wert auf seinen Abtastpunkt (689×329)   max Δ 7,1e-15°
ICON-D2 / ICON-EU: Rundlauf Karte → Punktabfrage trifft dasselbe Texel (8,5e-14 / 2,8e-14 Texel)
der alte Weg (gribCorners) lag messbar daneben — 1,11 km (D2) / 3,46 km (EU)
subsampledCorners(f, 1) === gribCorners(f)  (Wolken-Pfad unverändert)
Komposit: Zellposition = Texelmitte der Zeichenfläche
Komposit greift ICON-D2 in der richtigen Zelle ab (400 Sonden, 0 daneben)
Schleier (PoP): jede Zielzelle liest ihre eigene Quellzelle — max 5,42 km (vorher Median 76,7 km)
```

Der Rundlauf-Check ist bewusst so gebaut, dass er etwas misst: er nimmt den Ort, an dem die Karte
Texel *i* zeichnet, gibt ihn der Punktabfrage und verlangt Texel *i* zurück. Die erste Fassung
verglich `texelCoord` mit sich selbst und hätte jeden Fehler bestanden — derselbe Fehler wie
V-„CH: dieselbe Zelle abseits der Zellgrenzen (0/0)" in RP2, diesmal vor dem Commit bemerkt.

Weiter:
- `npm run typecheck`: **3 Fehler, alle in `src/fire/FirePage.tsx`** — Jans laufender Umbau des
  Brand-Panels (`FireLayerCard.tsx` hat ein neues Pflicht-Prop `meta`, die Aufrufer sind noch nicht
  nachgezogen). **Keine einzige der berührten Dateien ist betroffen**; nicht angefasst.
- `npx vite build` grün. Budget: **totalJs 916,1 / 926,1 KB**, eagerJs 121,2 / 130,2 KB,
  largestChunk 278,4 / 292,3 KB. `npm run build` bricht vorher an demselben `tsc -b` ab.
- Verifier-Suite (50 Skripte): alle Exit 0 außer `verify:aec` (Exit 2, Golddaten nicht im Repo)
  und `verify:fire-registry`/`verify:fire-activity`, deren 150-ms-Perf-Anker unter Last reißt
  (170 ms; einzeln 81/81 bzw. der Anker allein) — bei **42 node- und 36 chrome-Prozessen** auf der
  Maschine der dokumentierte Messfallstrick, und `fireRegistry.ts` importiert keines der geänderten
  Module (geprüft).

### 12.5 Die fünf Selbstverifikations-Fragen

1. *Funktionserhalt?* Ja. Nichts entfernt; `gribCorners` bleibt exportiert und unverändert, der
   Wolken-Pfad (`ss = 1`) ist beweisbar bit-gleich. Neu sind zwei benannte Funktionen.
2. *Desktop pixelgleich?* **Nein — und das ist der Auftrag.** Alle ICON-D2-Raster rücken 1,11 km
   nach Süden auf ihre wahre Lage, der PoP-Schleier um bis zu 93 km. Layout und CSS unberührt.
3. *Touch-Targets ≥ 44 px?* Unberührt — keine UI-Elemente geändert.
4. *Konsole sauber?* **Nicht verifiziert.** Die Browser-Instanz dieser Sitzung hat kein Netz
   (`ERR_INTERNET_DISCONNECTED`), der Kartenstil lädt nicht.
5. *Keine Long Tasks > 200 ms?* **Nicht gemessen.** Rechnerisch unverändert: der Schleier gathert
   21 432 statt 20 550 Zellen, die Index-Map hängt nur an der Geometrie und wird einmal gebaut.
   Die Raster-Quellen rechnen keinen Schritt mehr — nur vier Zahlen anders.

**Gate GKL1 damit: Rechenweg belegt, Browser-Verifikation offen.** Die Fragen 4 und 5 brauchen einen
Lauf mit Netz; Frage 2 ist absichtlich verletzt.

## 13. Nachmessung nach dem Fix (2026-08-22)

> Auftrag (Jan): „prüfe jetzt nochmal, ob es auf der Wetterkarte noch Abweichungen der nativen
> Layer gibt — mache nach der Auswertung eine Tabelle für jeden Layer."

Skript: `audit/karten-layer-verortung/nachmessung.mjs`. Es **importiert die echten Module**
(`subsampledCorners`, `texelCoord`, `gridLatLon`, `buildIndexMap`, `ensembleGrid`, `psFwd`/`psInv`)
und misst den Ist-Zustand; wo eine Vorher-Zahl existiert, steht sie daneben. 759 DACH-Orte
≥ 20 000 EW, kein Netz (Gitterparameter aus `probe-d2grid.mjs`, am echten GRIB gemessen).

Gemessen werden zwei verschiedene Dinge:

- **Karte ↔ Wirklichkeit** — Abstand zwischen dem Ort, an dem der Shader den Wert von Texel *(i,j)*
  zeichnet, und dem Ort, **von dem dieser Wert stammt**.
- **Karte ↔ Punktabfrage** — Abstand zwischen der Texelkoordinate des Shaders und der der
  Punktabfrage, an echten Orten.

`coarsenFrameU8` ließ sich nicht importieren (`convNet.ts` benutzt TypeScript-Parameter-Properties,
die `--experimental-strip-types` nicht kann). Statt die Formel anzunehmen, liest das Skript sie per
Regex **aus dem Quelltext** und bricht ab, wenn sie sich ändert.

### 13.1 Ergebnis je Layer

Alle 19 `LayerKey`s der Wetterkarte, einzeln. „≈ 0" heißt Fließkomma-Rauschen (< 1 Nanometer).

| # | Layer | Geometrie | Karte ↔ Wirklichkeit | Karte ↔ Punktabfrage | Urteil |
|---|---|---|---|---|---|
| 1 | `temp` | ICON-D2 608×373 + DEM 1141×700 | **≈ 0** (9,0e-13 km) · vorher 1,11 km N | **0,00 km** · vorher 0,47 / 1,42 km | ✅ |
| 2 | `gust` | ICON-D2 608×373 | **≈ 0** · vorher 1,11 km N | **0,00 km** · vorher 1,42 km | ✅ |
| 3 | `thunder` | ICON-D2 608×373 | **≈ 0** · vorher 1,11 km N | **0,00 km** | ✅ |
| 4 | `lightningfc` | ICON-D2 608×373 | **≈ 0** · vorher 1,11 km N | **0,00 km** | ✅ |
| 5 | `snow` | ICON-D2 608×373 | **≈ 0** · vorher 1,11 km N | **0,00 km** | ✅ |
| 6 | `rotation` | ICON-D2 608×373 | **≈ 0** · vorher 1,11 km N | **0,00 km** | ✅ (3×3-Max-Dilatation ist gewollt) |
| 7 | `wind` (10 m) | ICON-D2 608×373 | **≈ 0** · vorher 1,11 km N | **0,00 km** | ✅ |
| 7b | `wind` (Druckflächen) | ICON-EU 689×329 | **≈ 0** (6,9e-13 km) · vorher 4,60 km | **0,00 km** · vorher 1,26 / 1,97 km | ✅ |
| 8 | `clouds` | ICON-D2 voll 1215×746 | **≈ 0** · war schon 0,00 km | **0,00 km** · vorher 0,24 / 0,71 km | ✅ |
| 9 | `snowline` | Kontur 220×135 auf dem Temp-Gitter | erbt `temp` ⇒ **≈ 0** | — (kein Punktpfad) | ✅ |
| 10 | `nowcast` (Radar DE/AT/CH) | Komposit 600×512 ← RADOLAN/INCA/rzc | **≈ 0** (1,9e-4 km) · vorher 0,51 / 1,14 km | RP1/RP2, `verify:radar-sampling` 25/25 | ✅ |
| 11 | `nowcast` (Modell ICON-D2) | Komposit 600×512 ← ICON-D2 1215×746 | **≈ 0** + Zellzugriff korrekt · vorher zusätzlich 17 % falsche Zelle, bis 2,7 km | wie oben | ✅ |
| 12 | `confidence` (Temp-Modus) | teilt `uvBounds` mit `temp` | **≈ 0** · vorher 1,11 km N | — | ✅ |
| 13 | `confidence` (PoP-Modus) | 152×141 lon/lat ← DE1200 138×150 | Umtastung **2,99 / 5,92 km** (≤ 1 Quellzelle) · vorher **76,7 / 93,7 km** | — | ✅ für B1 · ⚠ erbt B5 |
| 14 | `flownowcast` | DE1200 1100×1200 → 138×150 | **1,64 km Median · 3,81 km max** (Ost–West) | `sampleRadarPoint` (eigener Pfad) | ⚠ **B5 offen** |
| 15 | `poprob` | DE1200 1100×1200 → 138×150 | **1,64 km Median · 3,81 km max** (Ost–West) | `pointPoP` (eigener Pfad) | ⚠ **B5 offen** |
| 16 | `sat` | WMS-Kacheln, `{bbox-epsg-3857}` je Kachel | Server projiziert · keine Client-Geometrie | — | ✅ |
| 17 | `lightning` | GeoJSON-Punkte (Blitzortung) | echte Koordinaten | Klick trifft das Feature | ✅ |
| 18 | `stations` | GeoJSON-Punkte | echte Koordinaten | Klick trifft das Feature | ✅ |
| 19 | `cells` | GeoJSON (Zellbahnen) | echte Koordinaten | Klick trifft das Feature | ✅ |
| 20 | `hail` | GeoJSON | echte Koordinaten | Klick trifft das Feature | ✅ |
| 21 | `warnings` | GeoJSON-Polygone (amtlich) | echte Koordinaten | Klick trifft das Feature | ✅ |
| — | `temp`/`wind`/`clouds`/`precip` **nur bei externem Raster-Modell** | IDW-Rasterer 100×80 bzw. 80×64 | **8,37 km** bzw. **10,47 km** | Punktabfrage richtig | ⚠ **B2 offen** |

Die drei Brandradar-Quellen derselben Familie (`iconD2FireWeather`, `iconD2Smi`, `iconD2Relhum`)
hängen an demselben Rechenweg und sind mit KL3 mitgezogen — sie stehen hier nicht, weil das
Brandradar eine eigene Layer-Union führt.

**Zusammengefasst:** von den sieben Befunden der Diagnose sind **B1, B3, B4, B6, B7 behoben**,
**B5 und B2 offen**. 17 der 19 Wetterkarten-Layer zeichnen jeden Wert exakt auf seinem
Abtastpunkt; zwei (`flownowcast`, `poprob`) tragen eine Ost-West-Dehnung von im Median 1,6 km,
und der PoP-Schleier erbt sie.

### 13.2 Korrektur: KL5 hat B5 nicht behoben

`coarsenFrameU8` deckelte mit `floor(1100/8) = 137` Blöcken; KL5 hat daraus `ceil` = **138**
gemacht. Das war richtig für die **Abdeckung** — vorher fielen 4 der 1100 RADOLAN-Spalten weg,
jetzt nicht mehr. Es beseitigt die **Dehnung** aber nicht, und das war die eigentliche Aussage von
B5.

Der Grund: `1100 / 8 = 137,5`. Ganzzahlige 8er-Blöcke **kacheln die Domäne nicht glatt**, egal ob
man auf- oder abrundet. Gezeichnet wird die Textur immer über die vollen 1100 km:

```
Blockmitte ↔ Zeichenfläche, Ost–West
  vorher (floor, 137 Blöcke) : max +3,99 km   · an Orten Median 1,62 / max 3,84 km
  jetzt  (ceil,  138 Blöcke) : max −3,96 km   · an Orten Median 1,64 / max 3,81 km
  Nord–Süd: 1200 / 8 = 150 geht glatt auf ⇒ 0,00 km
```

Das Vorzeichen dreht sich, der Betrag bleibt. **Die Zeile in §12.2 und der Bericht an Jan waren
an dieser Stelle zu optimistisch** — „deckt alle 1100 Spalten" stimmt, „B5 behoben" nicht.

Zwei Wege, beide gemessen exakt:

- **A — flächengewichtete Blöcke.** Blockbreite `1100/138 = 7,971` native Spalten statt starr 8,
  Randspalten anteilig gewichtet. Enthalten in `coarsenFrameU8`, gilt für **jedes** (w, h, factor),
  behält die ~8-km-Auflösung. Restfehler **0,00 km**.
- **B — `FLOW_FACTOR` 8 → 10.** `1100/10 = 110` und `1200/10 = 120` gehen **beide** glatt auf.
  Ein Zeichen Änderung, aber das Flussfeld wird gröber (10 km statt 8) und die Zellzahl sinkt von
  20 700 auf 13 200. Restfehler **0,00 km**.

Empfehlung: **A**. Es ändert die Produktauflösung nicht und behebt die Klasse, nicht den Einzelfall.
Zu bedenken: `coarsenFrameU8` füttert außer Fluss/PoP auch den KI-Nowcaster (`KiNowcastCard`), dessen
Gewichte auf `floor`-Blöcken trainiert wurden — die Eingabe verschiebt sich dort minimal.

### 13.3 Zwei Zahlen, die nach Fehler aussehen und keiner sind

**„3 von 759 Orten in der falschen Zelle"** (Komposit → ICON-D2). Der Vergleich im Skript nimmt als
Soll `round((lon − lon1)/di)`, die App `floor(u·ni)` über die Außenkanten. Beide sind dieselbe
Zelle, außer wenn ein Ort **exakt auf einer Zellgrenze** liegt — dann ist die Wahl beliebig. Beleg,
dass es genau das ist: der größte Abstand zwischen Ort und Mitte der gelesenen Zelle beträgt
**1,31 km**, die halbe Zelldiagonale **1,32 km**. Kein Ort liest über seine eigene Zelle hinaus.

**„Schleier: Median 2,99 km, max 5,92 km"**. Das ist keine Fehlverortung, sondern die
Nächster-Nachbar-Umtastung von einem 8-km-Quellgitter auf ein 8-km-Zielgitter. Halbe Zelldiagonale
= 5,66 km, Ziel- und Quellzellen sind gegeneinander verdreht ⇒ 5,92 km ist der erwartete Deckel.
Vorher waren es 76,7 km **Median** — das war eine Fehlverortung.

### 13.4 Belege

```
node --experimental-strip-types --import ./scripts/lib/register-ts.mjs \
     audit/karten-layer-verortung/nachmessung.mjs
npm run verify:layer-geometry   →  ALLE 15 CHECKS PASS
npm run verify:radar-sampling   →  ALLE 25 CHECKS PASS
```

Unverändert offen aus §12.5: die Browser-Verifikation (Fragen 4 und 5 des Gates) — die
Browser-Instanz hat weiterhin kein Netz.
