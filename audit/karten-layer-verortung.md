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

> **Nachtrag 2026-08-27:** B5 ist mit **KL11** behoben (Weg A, flächengewichtete Blöcke — §15.9); die
> Messung unten beschreibt den Stand davor. `nachmessung.mjs` liest die alte Formel per Regex und ist
> für B5 durch Verifier-Abschnitt (12) abgelöst.

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

## 14. Befund B8 — der Niederschlag liegt 29 km zu weit nördlich (2026-08-26)

**Anlass:** Jans Screenshot `zell.PNG` (Dateizeit 12:35:54 UTC): zwei KONRAD3D-Zellpunkte sitzen
deutlich **unter** ihrem Radarecho, beide um denselben Betrag, fast rein Nord-Süd. Frage: „Ist die
Position der Zellbahnen korrekt?"

### 14.1 Messung gegen die DWD-Rohdaten derselben Minute

Referenz: das Radarkomposit `composite/wn` (DE1200, ODIM-HDF5, unabhängig nachgerechnet — die
eigene polar-stereografische Projektion reproduziert die vier `/where`-Eckkoordinaten auf den Meter,
Spannweite exakt 1 100 × 1 200 km).

| KONRAD3D 12:40 UTC | Schwerpunkt | KONRAD-dBZ | WN am Schwerpunkt | nächstes WN-Maximum |
|---|---|---|---|---|
| Zelle 1 | 12,088 / 49,165 | 55,5 | 54,2 | **0 km** |
| Zelle 5 | 11,525 / 49,172 | 53,7 | 53,7 | 0 km N (44 km O = Zelle 1) |

Die Zellen liegen exakt auf den Radarkernen. Auf 49,42 N (Amberg) — dort, wo im Screenshot der
Regen gezeichnet ist — stand über die 95 Minuten davor **nichts** (−64 dBZ, `undetect`).

Georeferenz des Screenshots über die Zellpunkte als Anker: die **Amberg**-Beschriftung der
Basiskarte fällt auf **0,08 km** genau auf ihre echte Breite; die Echokerne liegen **27,9 km**
nördlich der Daten.

**Live in der App nachgemessen** (Dev-Build, `/wetterkarte/zellbahnen?…&l=niederschlag`, 13:00 UTC):

| | lon / lat |
|---|---|
| KONRAD3D-Zelle 1, gezeichnet | 12,1701 / **49,1568** (62,4 dBZ) |
| Magenta-Kern des Niederschlags, unprojiziert | 12,0972 / **49,4221** |
| WN an dieser Stelle | −64 dBZ — nichts |
| stärkstes echtes Echo | 62,4 dBZ, **31 km südlich**, 10 km östlich |

**Die Zellbahnen sind richtig. Die Niederschlagsfläche liegt ≈ 29 km zu weit nördlich.**

### 14.2 Ursache: das Quad wird linear in Mercator interpoliert, die Textur ist linear in Breite

`RainLayer.setFrame` (`RainLayer.ts:204–228`) hat zwei Geometrie-Wege: ein feines Warp-Mesh
(`warpLnglat`, 33 × 33 Knoten) oder — ohne Mesh — **zwei Dreiecke über vier Ecken**. Der
Vertex-Shader rechnet jede Ecke nach Mercator; die GPU interpoliert zwischen den Ecken **linear in
Mercator-y**. Die Texturzeilen des DACH-Komposits liegen aber äquidistant in **Breite**
(`gridLatLon`: `latMax − (r+0,5)/h · (latMax−latMin)`). Über die 10,2° des Komposit-Quads
(45,3 … 55,5) laufen beide auseinander:

gezeichnete Breite = merc⁻¹( merc(latMax) + (latMax − lat)/(latMax − latMin) · (merc(latMin) − merc(latMax)) )

| Breite | 46 | 48 | 49,2 | 50,3 | 52 | 54 | 45,3 / 55,5 |
|---|---|---|---|---|---|---|---|
| Versatz nach N (km) | 7,9 | 23,9 | 28,9 | **30,5 (max)** | 27,4 | 15,2 | **0** |

Vorhersage des Modells für das Echo bei 49,1568: gezeichnet bei 49,4172 (+28,8 km). Gemessen:
49,4221 (+29,3 km). **Restabweichung 0,54 km** — unter einem Bildschirmpixel. Die Ursache ist damit
belegt, nicht nur plausibel.

Der Kommentar an der Aufrufstelle (`MapView.tsx:3291`, wortgleich `RadarMap.tsx:386`) lautet
*„Reguläres lat/lon-Gitter → kein Warp-Mesh nötig."* Er beantwortet die **Projektionsfrage** und
übergeht die zweite Aufgabe des Warp-Mesh: **fein genug zu unterteilen, dass die GPU-Interpolation
stimmt.** Diese zweite Aufgabe braucht *jedes* Quad mit großer Breitenspanne — auch ein reguläres
lat/lon-Gitter. Derselbe Fehlertyp wie `edge: false` in §7c: eine Frage beantwortet, die zweite
still übergangen.

### 14.3 Reichweite

| Layer | Geometrie | Versatz bei 49 N | Status |
|---|---|---|---|
| **Niederschlag** (Wetterkarte, `MapView.tsx:3296`) | 4-Eck-Quad, Komposit 10,2° | **+29 km** | live gemessen |
| **Regenradar im Komposit-Modus** (`RadarMap.tsx:392`) | derselbe Code | dito | Code identisch |
| **Wolken** (`CloudLayer.ts:131`) | 4-Eck-Quad über `gribCorners` des nativen ICON-D2 (14,9°) | **≈ 64 km** (max 66) | **gerechnet, nicht gemessen** — B9 |
| Temperatur · Böen · Gewitter · Blitzprognose · Schnee · Rotation (`ScalarLayer`), Vertrauens-Schleier (`ConfidenceLayer`), Wind-Heatmap | 128 × 64-Weltmesh, Band 2,66° | 0,4 … 2,4 km | gerechnet — B10, **offen** (V-KL-1) |
| Regenradar Einzelland · Flow-Nowcast · Regen-Chance | Warp-Mesh DE1200 / INCA / rzc | 0 | korrekt |
| Windpartikel | je Partikel ein Vertex | 0 | korrekt |
| Zellbahnen · Hagel · Warnungen · Stationen · Blitze · Schneefallgrenze | MapLibre-Vektorlayer | 0 | korrekt |

Zur Wolken-Zahl: mein erster Messversuch war ungültig — die gemessene Silhouette war die
DACH-Vektormaske (`countryMask.ts`), nicht die Wolkenkante; der zweite (Helligkeitsprofil gegen
Open-Meteo) zu verrauscht. Die 64 km folgen zwingend aus dem Code, sind aber **nicht am Bildschirm
belegt**.

### 14.4 Warum es durchgerutscht ist

1. **An den Quad-Rändern ist der Fehler exakt 0**, in der Mitte maximal. Keine Kante, kein
   Versprung, keine Naht — die Fläche wölbt sich als Ganzes nach Norden.
2. **Eine Regenfläche hat keine Landmarken.** Man sieht ihr den Versatz nicht an, bis etwas
   darüberliegt, das richtig liegt. Genau das sind die Zellbahnen — deshalb ist es jetzt aufgefallen.
3. **Die Verifier sehen es nicht** (V-KL-2): `verify:layer-geometry` und `verify:radar-sampling`
   prüfen Abtastung gegen Zeichnung im **uv-/Gitterraum** („Rundlauf 8,5e-14 Texel"). Dort ist alles
   konsistent. Der Fehler entsteht erst bei der Platzierung des Quads auf dem Mercator-Bildschirm.

### 14.5 Plan KL8 — ohne Shader-Änderung

Der Rückweg ist ein vorhandener, verifizierter Pfad: `RainLayer` kann `warpLnglat` bereits.

- **KL8a** `src/scalar/quadWarpMesh.ts`: `quadWarpMesh(corners, n)` — die eine benannte Stelle für
  die zweite Aufgabe des Warp-Mesh (bilinear in lon/lat über die vier Ecken, Index-Konvention des
  `RainLayer`, memoisiert je Ecken-Referenz, damit der Layer den GL-Puffer nicht je Frame neu baut).
- **KL8b** `precipComposite.ts`: `compositeWarpMesh()` neben `COMPOSITE_CORNERS`; `build()` liefert
  `warpLnglat`/`warpN` mit; beide Aufrufstellen reichen sie durch.
- **KL8c** `CloudLayer`: unterteilt sein Quad selbst (33 × 33) — dieselbe Konvention, keine
  Shader-Zeile.
- **KL8d** `verify:layer-geometry`: Anker, der die **Mercator-Platzierung** simuliert (Knoten
  Mercator-linear, Textur breiten-linear) — Quad muss den Fehler reproduzieren (28 … 31 km, damit
  niemand still zum Quad zurückkehrt), Mesh muss < 0,1 km bleiben.
- **Nicht in KL8:** B10 (`ScalarLayer`/`ConfidenceLayer`/Wind-Heatmap, ≤ 2,4 km) — feineres
  Weltmesh oder uv-Berechnung im Fragment-Shader; letzteres ist Shader ⇒ STOPP & FRAGEN.

### 14.6 Umsetzung KL8 + Gate GKL8 (2026-08-26)

**Geändert (keine Shader-Zeile):**

| Datei | Änderung |
|---|---|
| `src/scalar/quadWarpMesh.ts` (neu) | `quadWarpMesh(corners, n)` — bilinear in lon/lat, Index-Konvention des `RainLayer`, memoisiert je Ecken-Referenz (`RainLayer` entscheidet über Referenzgleichheit, ob der GL-Puffer neu gebaut wird); `QUAD_WARP_N = 32` |
| `src/scalar/precipComposite.ts` | `compositeWarpMesh()` + `COMPOSITE_WARP_N` neben `COMPOSITE_CORNERS`; `CompositeFrame` trägt `warpLnglat`/`warpN` **verpflichtend**, `build()` liefert sie |
| `src/MapView.tsx` (Frame-Effekt Niederschlag) · `src/radar/RadarMap.tsx` (Komposit-Modus) | reichen `warpLnglat`/`warpN` an `RainLayer.setFrame` durch; der Kommentar „kein Warp-Mesh nötig" ist ersetzt |
| `src/scalar/CloudLayer.ts` | unterteilt sein Quad selbst (33 × 33, gleiche Konvention), baut die Geometrie nur bei neuer Ecken-Referenz, `drawArrays` über `vertexCount` |
| `scripts/verify-layer-geometry.mjs` | Abschnitt (7) **Mercator-Platzierung**: simuliert Knoten Mercator-linear / Textur breiten-linear; 8 neue Anker |

**Verifier:**

```
npm run typecheck                →  grün
npm run verify:layer-geometry    →  ALLE 23 CHECKS PASS  (vorher 15)
   B8: nacktes Komposit-Quad legt 49,157 N um +28,8 km nach Norden   (= gemessener Fehler, Regressionsanker)
   B8: Quad-Fehler an beiden Rändern 0
   compositeWarpMesh(): Ecken NW/NE/SE/SW · memoisiert
   Niederschlag mit Warp-Mesh: Restfehler max 36 m  (Quad: 30,5 km)
   PrecipCompositor.build() trägt warpLnglat/warpN
   B9: Wolken-Quad über native ICON-D2-Ecken läge 66,3 km daneben
   Wolken mit 32er-Mesh: Restfehler max 83 m
npm run verify:radar-sampling    →  ALLE 25 CHECKS PASS
npm run verify:precip-source     →  ALLE 30 CHECKS PASS
npm run budget                   →  totalJs 986,3 / 1017,7 KB, alle Budgets eingehalten
```

**Browser-Beleg (Dev-Build, Chrome DevTools MCP, 1440 × 900):**

*Niederschlag.* Zur Messzeit gab es keine KONRAD3D-Zelle mehr („aktuell keine konvektiven Zellen",
Lauf 14:10 UTC) — deshalb Referenz direkt das DWD-Radarkomposit `composite_wn_20260826_1410`:
stärkstes Echo in der Box 11,0–13,5 O / 48,5–50,0 N = **53,6 dBZ bei 12,4212 / 49,1033**.

| | |
|---|---|
| gezeichneter Regenkern (Cluster Magenta/Rot, unprojiziert) | 12,4027 / 49,0969 |
| Abstand zum WN-Maximum | −1,35 km O · −0,71 km N ⇒ **1,52 km** (vorher **29,3 km**) |
| Bildpunkt am WN-Maximum | `#b4414f` = Rot/Bordeaux, Regen |
| Bildpunkt 29 km nördlich (wo er vorher lag) | `#51514c` = Hintergrund, kein Regen |

Der Restabstand von 1,5 km ist die Nächster-Nachbar-Umtastung des 1-km-Radars auf das 2-km-Komposit
plus die Cluster-Schwerpunktbildung — kein Verortungsfehler mehr (Verifier: 36 m).

*Wolken.* Helligkeitsprofil entlang 10,0 O von 47,4 bis 54,4 N (36 Punkte) gegen die
ICON-D2-Bedeckung aus Open-Meteo (Lauf 12z, Over-Operator-Näherung des Shaders), Kreuzkorrelation
je Verschiebung: **Maximum bei 0 km** für 14 UTC (r = 0,29) und 15 UTC (r = 0,47); vor dem Fix lag
das Maximum bei +66 / +133 km. Das ist ein Korrelationsbeleg, keine punktgenaue Messung — für die
Wolken gibt es keine Referenz mit Landmarken wie das Radar.

*Konsole* beide Seiten 0 Fehler / 0 Warnungen. *Long Tasks* im Dev-Build nicht bewertbar (31 über
200 ms beim Kaltstart — unminifiziert, StrictMode, DWD-Listing 16 s); die Geometrie kostet
33² Knoten je Layer, einmal je Ecken-Referenz.

**Nicht separat im Browser belegt:** der Regenradar-Komposit-Modus (`RadarMap.tsx`) — derselbe
Aufruf mit denselben Feldern, `typecheck` erzwingt sie; und der Fusions-Wolkenpfad
(`uvBoundsToCorners`). DWD-Randnotiz: das `12/clcl/`-Listing hing zweimal (16 s → 500 über den
Proxy, 40 s Timeout direkt) und lieferte beim dritten Versuch — transient, nicht KL8.

**Die fünf Selbstverifikations-Fragen:**
1. Funktionserhalt — Niederschlag, Zellbahnen, Wolken zeichnen; Einzelland-Radar, Flow, PoP unberührt (kein Aufruf geändert).
2. Desktop-Diff — **absichtlich nicht pixelgleich**: der Regen liegt bis 30 km woanders, das war der Fehler.
3. Touch-Targets — keine UI-Änderung.
4. Konsole sauber — 0/0 (Niederschlag+Zellbahnen, Wolken).
5. Long Tasks — Dev-Build nicht bewertbar; Geometrie 33² Knoten, Prod-Messung offen.

**Offen:** B10 (`ScalarLayer`/`ConfidenceLayer`/Wind-Heatmap, ≤ 2,4 km — V-KL-1), Prod-Long-Task-Messung,
Regenradar-Komposit im Browser.

## §15 KL9 — „±0 km": alle Layer unter 1 m Mesh-Rest (2026-08-26)

**Auftrag (Jan):** „das Ziel der Plattform ist es, die Layer mit hoher Präzision darzustellen, ±0 km Versatz. Finde einen Weg (höhere Auflösung), das zu schaffen."

### 15.1 Ausgangslage nach KL8 (gemessen, `scripts/_tmp_mercsim.mjs`, echte Module)

Der Fehlertyp ist überall derselbe: der Vertex-Shader rechnet die Knoten nach Mercator, die GPU interpoliert
**linear in Mercator** zwischen den Knoten, die Textur (bzw. `v_equi_uv`) liegt **breiten-linear**. Über ein
Breitenband Δφ ist der schlimmste Versatz (Leitterm) **e = Δφ² · tan φ / 8 · R** — die Formel trifft die
Simulation auf 1 %: Komposit 32 Zeilen 35,9 m (sim 35,7), ICON-D2 84,4 m (sim 83,7), Weltmesh-Band 2,66°
bei 50 N 2,04 km (sim 1,98).

| Gitter | Layer | Mesh heute | Rest heute |
|---|---|---|---|
| DACH-Komposit 10,2° (lat/lon) | Niederschlag (Wetterkarte + Regenradar-Komposit) | 32 × 32 (KL8) | **36 m** |
| ICON-D2 nativ 14,9° (lat/lon) | Wolken | 32 × 32 (KL8) | **84 m** |
| Weltmesh 128 × 64 (Band 2,66°) | Temperatur · Böen · Gewitter · Schnee · Rotation · Blitz · Vertrauens-Schleier · Wind-Heatmap | ganze Welt | **2,0 km** bei 50 N |
| DE1200 polar-stereo | Regenradar DE, `flownowcast`, `poprob` | 32 × 32 | **87 m** |
| INCA Lambert | Regenradar AT | 16 × 16 | **58 m** |
| rzc LV95 | Regenradar CH | 16 × 16 | **78 m** |

### 15.2 Was „±0 km" technisch heißt — der Boden des Vertex-Pfads

Unter dem Mesh-Fehler liegen zwei Gleitkomma-Böden, die keine Unterteilung beseitigt: (1) `a_lnglat` ist
**Float32** — bei 50 N ist ein ULP der Breite 3,8 · 10⁻⁶° = **0,22 m** (gemessen: max 0,219 m über alle
Knoten); (2) die Mercator-Weltkoordinate `(mx, my) ∈ [0,1]` im Shader ist Float32 — ULP bei `my ≈ 0,34`
= 1,2 m, bei `mx ≈ 0,53` = 2,4 m. Exakt 0 gibt es nur mit uv-Rechnung im Fragment-Shader (STOPP & FRAGEN)
— und auch die läge auf demselben Float32-Boden. **Ziel dieser Phase: Mesh-Rest ≤ 1 m für jedes Gitter**
(`WARP_TARGET_KM = 0.001`) — das ist unter dem Boden des Vertex-Pfads und drei Größenordnungen unter der
Datenzelle (1–2,2 km). In Kartenpixeln: bei Zoom 14 (≈ 6 m/px bei 50 N) ein Sechstel Pixel.

### 15.3 Gemessene Fehlerkurven (Restfehler je Unterteilung, schlimmster Punkt)

| Mesh | 32² | 64² | 128² | 256² | 1 × 256 | 1 × 512 | 8 × 512 | 32 × 512 |
|---|---|---|---|---|---|---|---|---|
| Komposit (lat/lon) | 35,7 m | 8,9 m | 2,2 m | 0,56 m | **0,56 m** | **0,14 m** | 0,14 m | 0,14 m |
| ICON-D2 (lat/lon) | 83,7 m | 21,0 m | 5,3 m | 1,3 m | **1,3 m** | **0,33 m** | 0,33 m | 0,33 m |
| DE1200 (PS) | 86,8 m | 21,8 m | 5,5 m | 1,36 m | 40,6 km | 40,6 km | 639 m | 40 m |
| INCA (Lambert) | 14,6 m | 3,7 m | 0,92 m | 0,23 m | 10,9 km | 10,9 km | 170 m | 10,7 m |
| rzc (LV95) | 19,5 m | 4,9 m | 1,22 m | 0,31 m | 11,1 km | 11,1 km | 173 m | 10,9 m |

Zwei Lehren: **(a) Bei achsparallelen lat/lon-Gittern trägt nur die Breitenunterteilung** — Mercator-x ist
in der Länge exakt linear, Spalten sind gratis wirkungslos (1 × 512 = 32 × 512). **(b) Bei projizierten
Gittern krümmen sich beide Richtungen** (Zeilen konstanter v sind in lon/lat Kurven) ⇒ N² ist nötig, und
der Rest fällt mit 1/N². Für ≤ 1 m: DE1200 **320²** (0,87 m), INCA **128²** (0,92 m), rzc **160²** (0,78 m).

### 15.4 Die Baukosten-Falle und ihre Lösung

Ein 320²-Mesh braucht 103 041 Knoten. Direkt mit `psInv` (8 Fixpunkt-Iterationen mit `pow`) gerechnet:
**211 ms** (Node; mobil × 3) — eine Long Task, einmal je Sitzung, für INCA/rzc je Ladevorgang. Zwei
Auswege gemessen: (i) `psInv` beschleunigen (Reihe statt Iteration, Konvergenzabbruch) — ändert das
Projektionsmodul, das auch die Punktabfrage nutzt, Gewinn nur Faktor 2–5; (ii) **grobes Gitter exakt,
fein bikubisch** — die Projektionen sind analytisch glatt, Catmull-Rom über ein 64²-Gitter mit
Geisterring hat Fehler ∝ h⁴. Gemessen gegen die direkte Inverse an **allen** feinen Knoten
(`scripts/_tmp_bicubic.mjs`):

| Gitter | grob 32² | grob 64² | Kosten 64² (grob + fein) |
|---|---|---|---|
| DE1200 → 320² | 143 mm | **18 mm** | 12 + 13 ms |
| INCA → 128² | 11 mm | **0,006 mm** | 15 + 2 ms |
| rzc → 160² | 13 mm | **1,6 mm** | 20 + 4 ms |

Alles unter dem Float32-Boden der Knoten (219 mm). Gewählt: **64² grob, bikubisch verfeinert**, eine
Funktion für alle drei Projektionen, im Verifier gegen die direkte Inverse an jedem Knoten geprüft.

### 15.5 Plan KL9 (kein Shader, keine Dependency)

- **KL9a** `quadWarpMesh.ts` wird die EINE Stelle für Mesh-Dichte: `WARP_TARGET_KM`, Zeilenformel
  `warpRowsFor(latMin, latMax)` (uniform, für Quads mit `j/ny`-uv), `latRowsFor()` (nicht-uniform,
  marschiert mit Δφ(φ) — für Meshes, deren Shader uv aus der Breite selbst rechnet), Spalten
  `QUAD_WARP_COLS = 8`, `warpMeshGeometry(nx, ny)` (uv + **Index-Puffer**, memoisiert — 320² expandiert wären
  9,8 MB, indiziert 4,1 MB), `warpMeshFromProjection(node, n)` (64² + bikubisch), `equiFootprintMesh(uvBounds)`.
- **KL9b** `RainLayer` + `CloudLayer`: `warpRows` (additiv, Default = `warpN`), `drawElements`.
- **KL9c** Komposit (`compositeWarpMesh`, Zeilen aus der Formel), Wolken (Zeilen aus den Ecken), MapView/RadarMap
  reichen `warpRows` durch.
- **KL9d** DE1200 320², INCA 128², rzc 160² über `warpMeshFromProjection`; INCA/rzc memoisiert je Ecken-Referenz.
- **KL9e** `ScalarLayer` / `ConfidenceLayer` / Wind-Heatmap: statt Weltmesh ein **Footprint-Mesh** über die
  `uvBounds` der Daten (nicht-uniforme Zeilen aus `latRowsFor`, neu gebaut nur bei geänderten Bounds; Welt-Fall
  `[0,0,1,1]` gedeckelt — 2 921 Zeilen für ±85° bei 1 m).
- **KL9f** Verifier: 2-D-Simulator (beide Dreiecke je Masche, wahre Lage aus der Projektion), jedes Mesh der App
  ≤ 1 m, bikubische Knoten gegen direkte Inverse, Footprint-Mesh, Index-Topologie = bisherige Dreiecksfolge.
- **KL9g** Browser: synthetische Kante bei bekannter Breite bei Zoom 14 — gezeichnete Kante vs. `map.project`.

### 15.6 Umsetzung KL9 + Gate GKL9 (2026-08-26)

| Baustein | Stelle | Ergebnis |
|---|---|---|
| Zeilenregel + Mesh-Dichte, Index-Geometrie, bikubische Verfeinerung, Footprint-Mesh | `src/scalar/quadWarpMesh.ts` (EINE Stelle: `WARP_TARGET_KM` 1 m, `WARP_BAND_SAFETY` 0,9, `warpBandDeg`/`warpRowsFor`/`latRowsFor`, `quadWarpMesh(corners, nx, ny)`, `warpMeshGeometry` (uv + Uint16/Uint32-Indizes, memoisiert), `warpMeshFromProjection` (64² exakt + Catmull-Rom), `equiFootprintMesh`, `uvBoundsToCorners`) | — |
| Niederschlag (Komposit) | `compositeWarpMesh()` 8 × **213** Zeilen, `CompositeFrame.warpRows`, MapView + RadarMap reichen durch | **0,9 m** (KL8: 36 m) |
| Wolken | `CloudLayer` nimmt `quadWarpRows` (8 × **328**) | **0,9 m** (KL8: 84 m) |
| Regenradar DE, `flownowcast`, `poprob` | `DE1200_WARP_N` 32 → **352**, `de1200Node` + bikubisch | **0,8 m** (87 m); Bau 54 ms statt 211 ms direkt |
| Regenradar AT / CH | `INCA_WARP_N` 16 → **144**, `RZC_WARP_N` 16 → **160**, memoisiert je Ecken-Referenz | **0,9 m** (58 m) / **0,8 m** (78 m) |
| Temperatur · Böen · Gewitter · Schnee · Rotation · Blitz · Schleier · Wind-Heatmap | Weltmesh 128 × 64 ersetzt durch Footprint-Mesh über die uvBounds (`ScalarLayer.ensureMesh`, `ConfidenceLayer`, `WindLayer.ensureHeatmapMesh`); ICON-D2 286 Bänder / 13 728 Vertices, Welt (GFS) 3 245 Bänder / 1,19 MB | **0,8 m** (2,0 km) |
| RainLayer / CloudLayer | `drawElements` statt expandierter Dreiecke (`warpRows` additiv, Default = `warpN`); 352² = 4 MB statt 9,8 MB | — |

**Verifier** `verify:layer-geometry` **46/46** (+23): 2-D-Simulator (beide Dreiecke je Masche, wahre Lage aus der
Projektion) für jedes Mesh der App ≤ 1 m; bikubische Knoten gegen die direkte Inverse an ALLEN Knoten (< 0,3 m —
Float32-Boden 0,22 m); Anker gegen Rückfall (Quad 30,5 km, 32² = 87 m, Weltmesh-Band 1,97 km); Index-Topologie =
alte Dreiecksfolge; Footprint-Bänder, Welt-Deckel, Bounds-Deckung; Bauzeit 352² < 150 ms (29 ms). Dazu
`verify:radar-sampling` 25/25 (mit 352²/144²/160²), `verify:precip-source` 30/30, `typecheck` grün, Budget 987,9/1017,7 KB
(+1,6 KB). Belege: `audit/karten-layer-verortung/kl9-mercsim.mjs`, `kl9-bicubic.mjs`.

**Browser (Prod-Preview, Chrome/ANGLE D3D11, Intel UHD):** Niederschlag zeichnet `indexCount 10 224` = 8 × 213 × 6
(Uint16), Regenradar-Pfad mit 353² Knoten (`indexType UNSIGNED_INT`, 743 424 Indizes) rendert fehlerfrei
(`gl.getError() 0`), Footprint-Mesh Temperatur-Familie 13 776 Vertices; Konsole 0/0. Synthetische Kante bei 54,704 N
auf Zoom 14 (5,5 m/px), Textur 16 384 Zeilen (Texel 69 m ⇒ Kante auf ±1 px), Halbwert zwischen zwei Plateaus (100/200,
hebt den −8-Versatz der Farbrampen-Abfrage `floor(16t)/16` auf LINEAR-Textur heraus): KL8-32er-Mesh **−149 m**,
KL9-Mesh **−81 m**, ScalarLayer-Footprint **−77 m**, und — entscheidend — **jede feinere Unterteilung (214, 300, 1 000,
4 096 Zeilen) landet auf denselben −77…−81 m**, während MapLibres eigene GeoJSON-Linie (CPU-double) exakt auf `map.project`
liegt (Zeile 352 = 352,5).

**Befund B11 — der wahre Boden ist die GPU, nicht das Mesh (V-KL-3).** Derselbe Ausdruck
`0.5 − log(tan(π/4 + φ/2))/(2π)` per Transform-Feedback im WebGL2-Vertex-Shader gegen JS-double gemessen, 2 981 Breiten
43,18…58,08 N: **max 280 m (bei 56,82 N), Mittel 95 m, 68 % der Breiten > 50 m, 35 % > 100 m** — `highp` ändert nichts,
`log((1+sin φ)/cos φ)` ist gleich schlecht (Float32-Speicherboden wäre ±0,6 m). Die GPU-Transzendenten (`tan`, `log`) haben
~2–7 · 10⁻⁶ relativen Fehler; auf 40 075 km Weltumfang sind das Hunderte Meter. Alle acht Vertex-Shader der Raster-Layer
(RainLayer, CloudLayer, ScalarLayer, ConfidenceLayer, Wind-Heatmap + Partikel) rechnen so. MapLibre selbst projiziert auf
der CPU in double und ist deshalb exakt. **Konsequenz:** das Mesh liegt jetzt ≤ 1 m — die Karte trotzdem bis ±280 m
(GPU-abhängig: andere Treiber/Chips haben andere Kurven; auf Mobil-GPUs mit echtem fp16-`mediump` im Vertex-Shader wäre
schon `a_lnglat` auf 0,03° = 3 km quantisiert — **V-KL-4**, nicht messbar ohne Real-Device). Der einzige Weg zu „±0 km"
(≤ Float32-Boden ≈ 1–2 m): Mercator auf der CPU rechnen (double, die Mesh-Bauer sind schon die EINE Stelle) und dem Shader
fertige `(mx, my)` als Attribut geben — `gl_Position = u_matrix * vec4(a_merc, 0, 1)`, `v_equi_uv` weiter aus `a_lnglat`.
Das ist eine Shader-Änderung (Attribut-Semantik, keine Rechenlogik im Fragment) ⇒ **STOPP & FRAGEN — Jans Entscheidung.**
Nicht gebaut.

**Long Tasks (Prod-Preview):** einmalige Kosten dieser Phase headless gemessen — `de1200WarpMesh` 352² **54 ms**,
`warpMeshGeometry` 352² **21 ms** (743 424 Uint32), Komposit/Wolken-Geometrie 0,8 ms; GL-Uploads bei warmem Cache 2–19 ms
(4 Läufe in-page), Frame-Zeiten mit/ohne 352²-Layer identisch. Die Seiten-Long-Tasks (Wetterkarte bis 12 s — DEM-Bau
V-BW-42; Regenradar 294/345 ms — RADOLAN-HDF5-Dekode) sind Bestand, ohne Kontrolllauf nicht dieser Phase zuzuschreiben
(Lehre V-WF-13); der erste `setFrame` mit 353² in der DevTools-Evaluation dauerte 171 ms (kalter JIT + Index-Erzeugung),
in der App bleibt es unter 100 ms und passiert einmal je Sitzung.

**Fünf Fragen:** (1) Funktionserhalt — kein Layer entfernt, alle Aufrufstellen tragen `warpRows` (Typecheck erzwingt es
im Komposit), Quad-Pfad ohne Mesh bleibt; (2) Desktop — nur Geometrie, Shader unverändert, Rest ≤ 1 m; (3) Touch-Targets
— keine UI; (4) Konsole 0/0; (5) Long Tasks — einmalig ≤ 54 + 21 ms, s. o.

**Offen:** V-KL-3 CPU-Mercator als Attribut (STOPP & FRAGEN, ~40 Zeilen in 8 Vertex-Shadern + 5 Mesh-Bauern, headless
prüfbar); V-KL-4 `mediump` in Vertex-Shadern auf Mobil-GPUs (Real-Device); Regenradar-Komposit-Modus (`RadarMap.tsx`)
nicht separat im Browser belegt; bei `precip-forecast`/Fusions-Layern liegen die uvBounds ≠ ICON-D2 — das Footprint-Mesh
folgt ihnen (Schlüssel = Bounds), belegt am Komposit-Footprint (195 Bänder).

### 15.7 V-KL-3 umgesetzt — Mercator von der CPU (Jans Go, 2026-08-27)

**Änderung (Shader, mit Freigabe):** die sechs Raster-Vertex-Shader (`RainLayer`, `CloudLayer`, `ScalarLayer`,
`ConfidenceLayer`, `heatmapVert`, `heatmapVertProjected`) nehmen die Lage als Attribut **`a_merc`** (Mercator-
Weltkoordinate x, y ∈ [0,1]) und rechnen nur noch `u_matrix · vec4(a_merc, 0, 1)` bzw. `projectTile(a_merc)`;
`log(tan())` ist aus ihnen verschwunden. Die Werte kommen aus `mercatorOf(lnglat)` in `quadWarpMesh.ts` (double,
memoisiert je Array-Referenz — die Meshes sind es auch). Die ScalarLayer-Familie behält `a_lnglat` für die
Textur-uv (exakt in Float32: 0,2 m), RainLayer/CloudLayer brauchen lon/lat im Shader nicht mehr (`mercBuf`
ersetzt `lnglatBuf`). Alle sechs Shader stehen jetzt auf **`precision highp float`** (V-KL-4: ein echtes
fp16-`mediump` würde `a_merc` auf 20 km quantisieren). Fragment-Shader unverändert. **Bewusst nicht geändert:** die
vier Partikel-Shader (`drawVert`, `drawVertProjected`, `segDrawVert`, `segDrawVertProjected`) — die Partikellage
entsteht erst auf der GPU (Simulation), dort gibt es keine CPU-Stelle; ihr Rest bleibt ≤ 280 m, was bei
6·|V| px/s Bewegung und Zoom ≤ 12 unter einem Pixel liegt und keinen Datenwert verortet.

**Verifier** `verify:layer-geometry` **56/56** (+10): `mercatorOf` gegen die double-Formel an allen Komposit-Knoten
(max 1,01 m = exakt der Float32-Speicherboden), Memoisierung, `mercXY`-Anker, Text-Sonde je Vertex-Shader (`a_merc`,
kein `log(`/`tan(`, `highp`, Position aus `a_merc`), Bindungs-Sonde (alle fünf Layer binden `p.a_merc` an einen
`mercatorOf`-Puffer). `typecheck` grün, `verify:radar-sampling` 25/25, `verify:precip-source` 30/30, Build grün, Budget
eingehalten (größter Chunk 278,4 KB unverändert).

**Browser (Prod-Preview, Intel/ANGLE D3D11, Zoom 14 ≈ 5,5 m/px, synthetische 16 384-Zeilen-Kante, drei Spalten):**

| Breite | vorher (§15.6, Shader-log/tan) | jetzt KL9-Mesh + `a_merc` | KL8-32er-Mesh + `a_merc` (nur Mesh-Fehler) |
|---|---|---|---|
| 54,704 N | −81 m | **−3,7 m** (−0,67 px) | −73 m |
| 52,950 N | — | **−1,9 … −3,8 m** | −1,9 … −3,8 m (Kante auf Mesh-Zeile) |
| 50,400 N | — | **−4,1 m** | −4,1 m (Kante auf Mesh-Zeile) |
| 47,850 N | — | **−5,6 m** | −4,0 m (Kante auf Mesh-Zeile) |
| 46,116 N | — | **−2,5 m** | −53 m |
| ScalarLayer-Footprint 54,704 N | −77 m | **−2,1 m** (−0,38 px) | — |

Der verbleibende Rest von 2–6 m (≤ 1 px) ist der Float32-Boden des Custom-Layer-Pfads (Weltkoordinate 1,2–2,4 m,
`u_matrix`-Multiplikation in Float32 bei Zoom 14 ≈ 0,5 px) plus Halbpixel-Konventionen der Messung — die
MapLibre-eigene Linie liegt auf derselben Genauigkeit. Regenradar-DE-Pfad (353² Knoten, Uint32-Indizes) zeichnet
fehlerfrei (`gl.getError() 0`, erster `setFrame` 46 ms inkl. Index-Erzeugung). Konsole **0/0**. Nebenbefund: das
KL8-32er-Mesh misst zwischen seinen Zeilen 53–73 m statt der modellierten 35 m — Faktor 2 zum 1-D-Leitterm,
unerklärt, für den ausgelieferten Stand ohne Belang (das KL9-Mesh liegt auf jeder geprüften Breite ≤ 6 m).

**Long Tasks:** unverändert die Bestandsposten (DEM-Bau bis 5,4 s, HDF5-Dekode); `mercatorOf` kostet 0,1 µs je Knoten
(353² ≈ 12 ms, einmal je Sitzung, memoisiert). **Fünf Fragen:** (1) Funktionserhalt — alle Layer zeichnen, Partikel
unverändert; (2) Desktop — Lage jetzt exakter, Optik gleich; (3) keine UI; (4) Konsole 0/0; (5) keine neue Long Task.

**Stand „±0 km":** Mesh ≤ 1 m, Shader-Rechnung ≤ Float32-Boden, gemessen ≤ 6 m auf Zoom 14 über ganz DACH — unter
einem Bildschirmpixel bei jedem Zoom der Karte, drei Größenordnungen unter jeder Datenzelle. **Offen:** V-KL-4 auf
einem Real-Device gegenprüfen (jetzt `highp`, aber nur gemessen ist bewiesen); der Faktor 2 im 32er-Mesh; Partikel-
Shader bewusst außen vor.

### 15.8 KL10 — Wind-Partikel: Mercator-y aus der Tabelle (Jans Go, 2026-08-27)

**Warum nicht `a_merc`:** die Partikellage entsteht auf der GPU (Simulation in `updateFrag`, Position als 2 Byte je Achse
relativ zum Bezugsrechteck) — es gibt keinen CPU-Knoten. **Umgesetzt:** `mercYTable()` in `quadWarpMesh.ts` (64 × 64
RGBA8, Eintrag i = Mercator-y der equirect-Breite Y0 + i/(N−1)·(Y1−Y0) über ±85,05°, 32-bit-Festkomma über vier Bytes,
CPU-double, memoisiert, bounds-unabhängig) + `mercYFromTable()` als JS-Spiegel der Shader-Dekode; `MERC_TABLE_GLSL` in
`wind/shaders.ts` (`mercYOf`: zwei NEAREST-Taps + `mix`, Konstanten aus `quadWarpMesh` interpoliert) in allen vier
Zeichen-Shadern (`drawVert`, `drawVertProjected`, `segDrawVert`, `segDrawVertProjected`); Mercator-x = equirect-x direkt
(linear, vorher `(x·360−180+180)/360` mit Rundung). `WindLayer`: Textur einmal in `onAdd` (NEAREST), in beiden Draw-Pfaden
auf Einheit 3, `onRemove` löscht. **Unverändert:** `updateFrag` (WG1-Physik, Z3-Umverteilung, Bounds-Kodierung), Fragment-
Shader, Heatmap (seit §15.7 auf `a_merc`).

**Verifier** `verify:layer-geometry` **68/68** (+12): jeder Tabelleneintrag gegen die double-Formel (max 9,6 mm), Ränder/
Monotonie, die gespiegelte Shader-Dekode (Float32, zwischen den Stützstellen) über ganz DACH **max 1,73 m** bei 57,11 N
(Welt ±85° bis 55 m — Polnähe, Tabellenschritt 0,0415°; für den Globus bei Zoom ≤ 6 unsichtbar), Klemmung ohne NaN,
Text-Sonde je Zeichen-Shader (`mercYOf`, kein `log(`/`tan(`, highp), GLSL-Konstanten = JS-Konstanten, `updateFrag`
unverändert, Bindung/Löschung im WindLayer. Dazu `verify:wind-advection` ✓, `verify:radar-sampling` 25/25, `typecheck`,
Build, Budget (größter Chunk unverändert 278,4 KB).

**Browser (Prod-Preview, Intel/ANGLE):** die im WindLayer hochgeladene Textur per FBO zurückgelesen — jeder Eintrag trifft
double auf 9,6 mm; die Shader-Funktion `mercYOf` mit GENAU diesen Bytes per Transform-Feedback auf der GPU gegen double an
2 981 Breiten 43–58 N: **max 2,61 m (45,13 N), Mittel 0,58 m, 0 von 2 981 über 5 m** — vorher (§15.6) max 280 m, Mittel
95 m. Stichproben: 45,3 N +1,1 m · 47 N −0,8 · 49,2 N +0,2 · 50,4 N +0,8 · 52 N −0,4 · 54,7 N −0,7 · 56,8 N −1,5 · 58,1 N −1,6.
Wetterkarte Wind: Partikel + Heatmap zeichnen (10 201 Partikel), `drawProgram.u_merc_table` gesetzt, GL-Fehler 0, Konsole
0/0. Globus: `projVariant globe` (20 164 Partikel), Segment-Stil über `impl.constructor` mit `particleStyle:'segments'`
kompiliert und gerendert (Mercator- UND `projectTile`-Programm), GL-Fehler 0; die 108 „no buffer is bound to enabled
attribute"-Warnungen danach stammten vom Entfernen des Test-Layers (gelöschte Puffer an aktiven Attribut-Arrays, V-RL-1-
Mechanismus) — sauberer Reload: 0 Fehler, nur eine Chrome-Performance-Notiz zu einem Readback, die KL10 nicht verursacht
(es liest nichts zurück; Bestand, vermutlich die Fähigkeits-Sonde des WindLayers). Long Tasks > 200 ms auf dem Globus: 0.

**Genauigkeit der Partikel jetzt:** Shader-Rechnung ≤ 2,6 m; verbleibender Boden ist die **2-Byte-Positionskodierung
relativ zum Bezugsrechteck (~25 m über DACH)** — die zu ändern hieße den RGBA8-Packing-Pfad anzufassen (Mobile-GPU-Regel,
nicht angefasst). GPU-Last: zwei Texturtaps statt `log`+`tan` je Partikel, neutral (die Wind-Last sitzt in den Trail-Pässen).

**Fünf Fragen:** (1) Funktionserhalt — Punkte, Segmente, Globus, Heatmap zeichnen; Simulation byte-gleich; (2) Desktop —
Optik gleich, Lage exakter; (3) keine UI; (4) Konsole 0/0 nach sauberem Reload; (5) keine neue Long Task (Tabelle 4 096
Einträge). **Offen:** V-KL-4 Real-Device; Polnähe-Rest der Tabelle (55 m) nur für den Globus relevant und dort unsichtbar.

### 15.9 KL11 — B5 behoben: flächengewichtete Blockung (Jans Go, 2026-08-27)

**Befund (KL1 B5, §13.2):** `coarsenFrameU8` bildete starre 8er-Blöcke; 1100 RADOLAN-Spalten / 8 = 137,5 kacheln
nicht, die 138-Spalten-Ausgabe wurde aber über die vollen 1100 km gezeichnet ⇒ **bis 3,96 km Dehnung nach Osten**
(an Orten Median 1,64 km) in `flownowcast`, `poprob`, PoP-Schleier und der Punkt-PoP des Regenradars — das einzige
km-Maß, das nach KL9/KL10 auf der Wetterkarte übrig war.

**Umgesetzt (Weg A aus §13.2):** neues reines Modul `src/ml/coarsen.ts` — `coarsenFrameU8` mit `blockSpans(n, N)`:
jede Ausgabezelle deckt exakt n/N native Zellen (7,971 Spalten), Randspalten anteilig gewichtet, Zellwert =
gewichtetes Mittel; `nowcasterInference.ts` re-exportiert (alle Importpfade unverändert: MapView-Flussfeld, `pointPoP`,
`KiNowcastCard`, `predictFromFrames`). Ausgabemaße bleiben 138 × 150, Auflösung ~8 km, keine Shader-, Layer- oder
UI-Änderung. Das eigene Modul war nötig, weil `convNet.ts` (Parameter-Properties) für Node im Strip-Modus nicht ladbar
ist — vorher war die Blockung headless gar nicht prüfbar.

**Verifier** `verify:layer-geometry` **76/76** (+8): Rückfall-Anker (starre Blöcke 3,96 km), jede der 138 Zellen deckt
exakt [cx·w/W, (cx+1)·w/W) ⇒ Schwerpunkt = Zeichenposition **0,000000 m**, Gewichte summieren zur Blockbreite,
Gesamtmasse erhalten (103 661,380 = 103 661,380 auf einem Zufallsfeld), konstantes Feld bleibt konstant, bei glatter
Teilung (1096 = 137·8) identisch mit dem starren Blockmittel (Δ 7·10⁻⁹, Float32), Spalte 1092 verteilt sich 0,03/0,97
auf die Zellen 136/137, Zeilen 1200/8 unverändert. `typecheck` grün, Build grün, Budget eingehalten,
`verify:radar-sampling` 25/25, `verify:precip-source` 30/30.

**Konsequenzen, ehrlich:** (1) Der KI-Nowcaster (`KiNowcastCard`) bekommt minimal andere Eingaben — seine Gewichte sind
auf starren Blöcken trainiert; beide Seiten des Vergleichs (`dwdCoarse` und Vorhersage) laufen durch dieselbe neue
Funktion, die Kachelung ist damit konsistent, ein Effekt auf die Skill-Zahlen ist nicht gemessen (kein Verifier für den
Nowcaster; die Eingaben ändern sich nur an den Blockrändern um Bruchteile). (2) B2 (IDW-Rasterer bei explizit
externem Modell, 3–9 km) bleibt offen — nicht Teil dieser Phase. (3) `nachmessung.mjs` (§13) liest die alte Formel per
Regex und ist für B5 durch Verifier-Abschnitt (12) abgelöst.

**Browser:** s. u. (Fluss-/PoP-Layer mit echten RADOLAN-Daten auf dem Prod-Preview).
Prod-Preview, `/wetterkarte/flow-nowcast?…&l=regen-chance` (die beiden Layer sind nur per URL-Slug erreichbar, nicht im
Dock): Flow-Nowcast und Regen-Chance laden echte RADOLAN-Daten, Textur **138 × 150** über dem 353²-Knoten-DE1200-Mesh
(743 424 Uint32-Indizes), beide sichtbar (Steckbriefe „Stand 13:35 · vor 6 min"), `gl.getError() 0`, Konsole **0/0**,
keine Long Task > 200 ms nach dem Laden. Die Kante selbst ist dort nicht separat gemessen — die Verortung des Meshs ist in
§15.7 belegt (≤ 6 m), die Kachelung headless (0,000000 m); das Radarbild war zur Messzeit fast trocken (eine Zelle bei
Koblenz), deshalb kein Vorher/Nachher-Bildvergleich.

**Stand Wetterkarte nach KL11:** kein Layer mehr mit bekanntem km-Versatz im Standardbetrieb. Offen: B2 (nur bei explizit
gewähltem externem Modell), V-KL-4 (Real-Device), V-KL-5 (`image`-Sources auf Atmosphäre/Globus), Skill-Effekt auf den
KI-Nowcaster ungemessen.

### 15.10 Große Verifikation aller Layer im DACH-Raum (Jans Auftrag, 2026-08-27)

**Auftrag:** „nochmal eine Verifikation der Layer im DACH-Raum — sind wirklich alle Layer immer an der richtigen
Position mit geringem Versatz?" Drei Ebenen: headless (Rechenkette gegen die echten Module), Browser (gezeichnete Kante
gegen `map.project` bzw. eine MapLibre-CPU-Linie, Prod-Preview, Intel/ANGLE, Zoom 14 ≈ 5,5 m/px), GPU-Rechnung
(Transform-Feedback).

**A · Headless.** `verify:layer-geometry` **76/76**, `verify:radar-sampling` 25/25, `verify:precip-source` 30/30,
`verify:wind-advection` ✓, `typecheck` grün. Nachmessung `nachmessung.mjs` (auf `blockSpans` gezogen) an **759 DACH-Orten
≥ 20 000 EW** — Karte ↔ Wirklichkeit / Karte ↔ Punktabfrage:

| Gitter → Layer | Karte ↔ Wirklichkeit | Karte ↔ Punktabfrage |
|---|---|---|
| ICON-D2 ss=2 → Temperatur, Böen, Gewitter, Blitzprognose, Schnee, Rotation, Wind-Heatmap | 9,0·10⁻¹³ km | 0,00 km |
| ICON-D2 ss=1 → Wolken | 8,4·10⁻¹³ km | 0,00 km |
| ICON-EU ss=2 → Höhenwind | 6,9·10⁻¹³ km | 0,00 km |
| DEM des Temp-Layers | 8,4·10⁻¹³ km | — |
| DACH-Komposit → Niederschlag | 1,9·10⁻⁴ km | 3/759 Zellgrenzen-Gleichstände (≤ halbe Zelldiagonale, §13.3) |
| DE1200 → Flow-Nowcast, Regen-Chance, Punkt-PoP (**B5, KL11**) | **2,3·10⁻¹³ km** (KL5-Stand 3,96 km, KL1 3,99 km) | 0,00 km |
| PoP-Schleier (152 × 141 lon/lat aus 138 × 150) | Median 2,99 / max 5,92 km = Nächster-Nachbar 8 km → 8 km: jede Zielzelle liest die Quellzelle, die sie enthält — Auflösung, kein Versatz (§13.3) | — |
| IDW-Rasterer (nur explizit gewähltes externes Modell) | **8,4 / 10,5 km — B2, unverändert offen** | — |

**B · Browser, synthetische Kante (16 384-Zeilen-Textur, zwei Plateaus), Prod-Preview.**

| Zeichenpfad | Messpunkte | Ergebnis |
|---|---|---|
| Niederschlag (RainLayer, Komposit-Mesh 8 × 213 + `a_merc`) | 5 Breiten × 3 Längen (47,5–54,3 N, 7,5–13,5 E); 49,0 N/7,5 E = Frankreich (Maske) | **−3,6 … −5,5 m**, je Punkt in drei Spalten identisch |
| Temperatur-Familie (ScalarLayer, Footprint-Mesh + `a_merc`; identischer Pfad für Böen, Gewitter, Blitzprognose, Schnee, Rotation, Modell-Niederschlag, Schleier, Wind-Heatmap) | dieselben 14 Punkte | **−3,6 … −5,5 m** |
| Wolken (CloudLayer, `quadWarpRows` + `a_merc`) | 5 Breiten auf 9–10 E | **−8,4 … −9,7 m** (Rest über den anderen Pfaden = nichtlineare Over-Mischung der Wolkenschichten in der Messung) |
| DE1200 352² (Flow-Nowcast/Regen-Chance, Wetterkarte) — Kante exakt auf Mesh-Zeile, Messpunkt ZWISCHEN zwei Knoten, Referenz = MapLibre-Linie aus den App-Knoten (CPU) | 3 Zeilen × 3 Spalten, 5 gültig | **2,6 · 4,7 · 3,1 · 3,2 · 5,3 m** |
| Regenradar (RadarMap-Pfad, Komposit-Mesh) DE und AT | je 3 Zeilen × 3 Spalten, 3 + 2 gültig | **8,2 · 8,8 · 9,3 m** (DE) · **8,2 · 9,3 m** (AT) |
| INCA 144² / rzc 160² | — | im UI nicht erreichbar: das Regenradar zeichnet AT/CH über das Komposit-Mesh; die Landesmeshes hängen nur am `radar-coverage`-Layer („Radarsicht"), den das Command-Deck-Dock nicht anbietet ⇒ nur headless belegt (2-D-Sim 0,9 / 0,8 m, Knoten vs. direkte Inverse < 0,3 m, `radar-sampling` Karte ↔ Punkt 1 m) |
| Wind-Partikel | Transform-Feedback 2 981 Breiten (§15.8) | Rechnung max 2,6 m, Mittel 0,6 m; Boden 2-Byte-Kodierung ~25 m |

Nulls in den Tabellen sind Spalten, in denen ein Kartenlabel/Gewässer die Plateaus oder die rote Referenzlinie stört
(bei beiden Layern identisch ⇒ Basiskarte). Konsole auf allen drei Seiten (Wetterkarte, Flow-Nowcast, Regenradar) 0/0,
GL-Fehler 0. Der gemeinsame Rest von 4–10 m ist der Float32-Boden des Custom-Layer-Pfads (Weltkoordinate 1,2–2,4 m,
`u_matrix` in Float32 ≈ 0,5 px) plus Messkonventionen — MapLibres eigene Linie liegt auf `map.project` (0 px).

**Befund:** Im Standardbetrieb der Wetterkarte und des Regenradars zeichnet **jeder** Raster-Layer im DACH-Raum auf
≤ 10 m (≤ 2 px bei Zoom 14), Vektor- und Kachel-Layer sind CPU-exakt. **Nicht auf diesem Stand:** B2 (IDW-Rasterer, nur
bei explizit gewähltem externem Modell, 8–10 km) und V-KL-5 (`image`-Sources Thermik/Globus — andere Seiten). **Nicht
belegt, nur gerechnet:** INCA/rzc im Browser (unerreichbar), V-KL-4 auf Mobil-GPUs (kein Real-Device).
