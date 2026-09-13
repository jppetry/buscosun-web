# Vorstufe der buscosun Fusion — die beste Quelle je Punkt und Zeit (Phase PD-D)

> **Auftrag (Jan, 2026-09-12):** „Entwickle die Vorstufe der buscosun Fusion für Fore- und Nowcast über
> 0 bis 336 h. Eingabe: Location (beliebiger Punkt im DACH-Raum) und Zeitpunkt oder Zeitraum. Bestimme
> die **beste verfügbare Quelle aus dem Repo `buscosun-data`** und gib **alle relevanten Wetterdaten
> dieser Quelle** aus. In dieser ersten Stufe arbeiten wir noch **komplett ohne Algorithmus**."
>
> Abgrenzung, wörtlich genommen: keine Fusion, keine Gewichte, keine Korrektur, keine Interpolation
> zwischen Quellen. `src/pointForecast/fusion/*` wird nicht angefasst (STOPP & FRAGEN). Gebaut wird ein
> **Auswähler und Leser**: er entscheidet, welches Produkt für (Punkt, Zeit) das beste ist, holt dessen
> Daten und sagt, warum die anderen verloren haben.

Alle Zahlen dieses Dokuments sind am **veröffentlichten Stand** gemessen (Index `publishedAt`
2026-09-12T19:52Z, Commit `ccc3304`), nicht aus dem Format geschlossen.

---

## §1 Der Befund, der die Aufgabe umformt: der Cube trägt keine Quellenwerte

Die Aufgabe sagt „die beste Quelle … und alle Daten **dieser Quelle**". Am veröffentlichten Datum ist
das für den Cube **nicht beantwortbar**, und zwar aus Konstruktion, nicht aus einem Fehler:

`build-point-cube.mjs` führt je Zelle und Stunde eine Bitmaske `srcMask |= 1 << ci` — und schreibt sie
**nicht** in den Container. Vor dem Kodieren wird sie zu ihrer Quersumme reduziert
(`build-point-cube.mjs:515–525`), und was im Chunk landet, ist die Ebene `srcCount`: **wie viele**
Quellen getragen haben, nicht **welche**. Die 51 Ebenen tragen den fusionierten Mittelwert, seine
Streuungen und Quantile — keinen einzelnen Modellwert.

Damit hat „Quelle" im Repo heute genau **eine** beantwortbare Bedeutung: das **Produkt**.
Es gibt drei, und sie sind wirklich verschieden:

| Produkt | Ort | Zeitachse | Inhalt | Unsicherheit |
|---|---|---|---|---|
| **Nowcast** (`radar/img/v1/{rv,inca,rzc}`) | Gitter, geometrische Abdeckung | 0…+120 / +180 / 0 min, 5- bzw. 15-Minuten-Raster | **nur Niederschlag** | keine; ≥ 19,96 mm/h gesättigt, Null zweideutig |
| **Punkt-Cube** (`point/<lauf>/t{1,2,3}`) | 0,05° / 0,10° / 0,25°, ganzer Ausschnitt | Lauf + 0…48 h (1 h) / 51…120 h (3 h) / 126…336 h (6 h) | 47 / 29 / 24 der 51 Ebenen (an München gezählt) | σ_div, σ_ens, q10/q90, `srcCount`, `ensCount` |
| **Stationen** (`point/stations`) | 3 071 feste Punkte | Lauf + 1…247 h, **stündlich durchgehend** | **12 der 51 Ebenen** | **keine** (`srcCount` = 1, alle σ- und Quantilebenen leer) |

Die zweite Lesart — Werte einer *einzelnen Modellquelle* (ICON-D2, IFS …) am Punkt — ist keine
Auswahlfrage, sondern eine **Producer-Änderung**: sie bräuchte das in `audit/punktarchiv.md` geplante
Nebenprodukt `extract.bin` (Werte je Quelle an festen Punkten, ohne zusätzliches Netz, weil die Gitter
in der Fusionsschleife ohnehin im Speicher liegen). Das ist **E-D-1** unten, nicht Teil dieser Stufe.

## §2 Abdeckung in Gültigzeit — und die Naht, die niemand sieht, wenn er in Vorhersagestunden denkt

Die bekannten Achsenlücken (49/50 h, 121–125 h) sind Lücken in **Vorhersagestunden**. Für einen Nutzer
zählt aber die **Gültigzeit**, und dort sieht es anders aus, weil die Stufen aus **verschiedenen Läufen**
kommen. Am Stand vom 12.09. 19:52 UTC gemessen:

```
Produkt    Lauf         Gueltig von        bis                Raster   ab jetzt (h)
t1         2026091218   2026-09-12T18:00Z  2026-09-14T18:00Z   1 h      -1.9 …  46.1
t2         2026091212   2026-09-14T15:00Z  2026-09-17T12:00Z   3 h      43.1 … 112.1
t3         2026091212   2026-09-17T18:00Z  2026-09-26T12:00Z   6 h     118.1 … 328.1
stations   2026091215   2026-09-12T16:00Z  2026-09-22T22:00Z   1 h      -3.9 … 242.1
```

* **t1/t2 überlappen 3 h** — die 49/50-h-Lücke existiert in Gültigzeit gerade *nicht*, weil t1 aus dem
  sechs Stunden jüngeren Lauf kommt.
* **t2/t3 klaffen 6 h** (17.09. 12:00–18:00Z). Beide stammen hier aus demselben 12z-Lauf; stünde t3 auf
  einem älteren Lauf, wäre die Lücke größer. **Die Lücke ist beweglich** — sie hängt am Takt, nicht am
  Format, und sie muss je Abfrage gerechnet werden.
* **Jenseits +328 h trägt nichts mehr.** Die 336 h des Auftrags sind ab dem *Lauf* gemeint, nicht ab
  jetzt; ab jetzt sind es je nach Alter des t3-Laufs 322–334 h. Das gehört benannt, nicht gerundet.
* Die Stationsachse ist die einzige **durchgehend stündliche** — aber sie endet bei +242 h.

## §3 Ein Wert, mehrere Läufe

`tiers[].ageH` steht im neuesten t1-Lauf auf **0** — das misst den jüngsten Beiträger (V-PD-50).
Tatsächlich stecken in derselben Stunde bis zu **fünf verschiedene Modellläufe**:

```
Quelle           Lauf                  Alter  Rolle       Schritte  Deckung
icon_d2          2026-09-12T18:00:00Z    0 h  assigned         49  full
icon_d2_eps      2026-09-12T15:00:00Z    3 h  assigned          8  partial
icon_ch1_eps     2026-09-12T15:00:00Z    3 h  assigned         11  partial
claef            2026-09-12T15:00:00Z    3 h  assigned         49  full
claef_eps        2026-09-12T12:00:00Z    6 h  assigned         49  full
icon_eu          2026-09-12T15:00:00Z    3 h  diversity        28  partial
ifs_hres         2026-09-12T12:00:00Z    6 h  diversity        17  partial
aifs_single      2026-09-12T12:00:00Z    6 h  diversity         9  partial
```

Alle sind über `offsetH` in **Gültigzeit** ausgerichtet (§37) — das ist richtig. Aber: der Mittelwert
kommt aus acht Quellen mit 0–6 h alten Läufen, σ_ens aus ICON-D2-EPS **15z**, die Quantile aus
C-LAEF-EPS **12z**, das Profil aus ICON-D2 **18z**. **„Wie frisch ist dieser Wert" hat keine einzelne
Antwort** — die Vorstufe muss das Alter je Ebenengruppe ausweisen, nicht je Lauf.

## §4 Der Mittelwert liegt oft außerhalb des Quantilbands — gemessen, bevor behauptet

Bei der ersten Stichprobe (München, +0 h) stand `t2m = 18,60` bei `q10 = 19,31` und `q90 = 19,88`, der
Mittelwert also **unter** dem eigenen q10. Nachgerechnet über die ganze t1-Achse an fünf Orten
(München, Innsbruck, Graz, Zürich, Wien; je 49 Stunden):

```
Groesse   n     im Band   darunter   darueber
t2m       245     62 %       29 %        9 %
u10       245     82 %       10 %        7 %
v10       245     74 %       20 %        6 %
gust      245     71 %       20 %        9 %
precip    245     90 %        0 %       10 %
clct      245     76 %        9 %       15 %
snowlmt   245     58 %       27 %       15 %
```

**Das ist kein Fehler und muss trotzdem dastehen.** Das Band ist das 80-%-Intervall **einer** Quelle
(C-LAEF-EPS, 12z), der Mittelwert die Mitte von **acht** Quellen aus jüngeren Läufen. Dass beide in
über einem Drittel der Stunden auseinanderliegen, ist eine Aussage über Modelluneinigkeit und
Laufversatz — aber ein Leser, der „Wert mit p10/p90" ausgibt, produziert damit ein Intervall, das
seinen eigenen Mittelwert nicht enthält. Das Manifest warnt bereits („NICHT mit `_sd` verrechnen");
die Vorstufe muss die Warnung **an den Wert hängen**, nicht ins Kleingedruckte.

## §5 Das Stationsnetz trägt die Hälfte der Fläche — und die Hälfte nicht

Abstand zum nächsten der 3 071 MOSMIX-Punkte, gemessen über 1 665 Rasterpunkte à 0,25° im
Cube-Ausschnitt (⚠ der Ausschnitt ist die Cube-Box 45,5–55,5 °N / 5,5–17,5 °E, nicht DACH — er enthält
Meer und Nachbarländer, die Zahlen sind für DACH also pessimistisch):

```
Median 9,2 km · p75 18,3 km · p90 31,0 km · p95 38,4 km · Maximum 77,7 km
≤ 10 km: 54 %   ≤ 15 km: 68 %   ≤ 25 km: 85 %
```

In Städten ist die Station konkurrenzlos (Hamburg 0,9 km, Wien 0,9, Berlin 1,0, Zürich 2,3,
München 5,0 km bei Δh −4 m). Im Gebirge kippt es: **Sellrain/Talschluss 16,5 km zur nächsten Station,
und die liegt auf 1 800 m.** Genau dort, wo `h_true − h_mod_eff` am größten ist, ist auch die Station
am weitesten weg.

Was die Station dafür kann, an denselben Gültigzeiten gegen den Cube gehalten (München):

```
Gueltigzeit       Station (MOSMIX-L, 515 m)            Cube (fusioniert)
+  3 h   T 18,1  Td  9,5  Bö 3,6  R 0,00  h 515   t1 T 18,6  Td  9,7  Bö 2,8  R 0,00  h 531  src 6
+ 24 h   T 19,9  Td 12,3  Bö 7,2  R 0,50  h 515   t1 T 19,2  Td 12,7  Bö 6,5  R 0,46  h 531  src 5
+ 96 h   T 18,3  Td 13,1  Bö 8,2  R 0,80  h 515   t2 T 17,0  Td 14,1  Bö 10,7 R 1,15  h 548  src 5
+150 h   T 12,8  Td  9,9  Bö 4,1  R 0,00  h 515   — keine Stufe traegt diese Gueltigzeit —
+240 h   T 19,1  Td  9,8  Bö 6,2  R 0,00  h 515   — keine Stufe traegt diese Gueltigzeit —
```

Zwei Dinge stehen darin, die die Auswahlregel bestimmen:

1. **`hModEff` der Station ist die echte Stationshöhe (515 m)**, die des Cubes 531 m (t1) bzw. 548 m
   (t2) — MOSMIX gilt AM Ort, der Cube in der Modellzelle. Für München sind das 16–33 m, in Zermatt
   wären es nach PD-A **+718 m**.
2. **„keine Stufe trägt diese Gültigzeit" bei +150 h und +240 h ist kein Ausfall, sondern das Raster.**
   Der Cube hat dort nur alle 6 h einen Wert; eine Anfrage auf eine beliebige Stunde trifft ihn nur
   jede sechste Mal. Die Vorstufe muss zwischen **„es gibt keinen Wert"** und **„der nächste Wert liegt
   3 h daneben"** unterscheiden — sonst sieht ein Raster wie eine Lücke aus.

## §6 Nahtsprung zwischen den Stufen, gemessen

An den beiden Gültigzeiten, die t1 und t2 gemeinsam tragen (München):

```
2026-09-14T15:00Z  t1(+45 h) 20,07 °C · hModEff 531 · src 3 | t2(+51 h) 20,19 °C · hModEff 548 · src 5  ⇒ Δ +0,12 K
2026-09-14T18:00Z  t1(+48 h) 17,80 °C · hModEff 531 · src 4 | t2(+54 h) 17,20 °C · hModEff 548 · src 6  ⇒ Δ −0,60 K
```

Ein Stufenwechsel mitten in einer Reihe kostet also eine Sprungstelle in der Größenordnung mehrerer
Zehntel Kelvin — verschiedene Auflösung, verschiedene Quellenmenge, verschiedene Modellhöhe. Die
Vorstufe glättet das **nicht** (das wäre Algorithmus); sie **markiert** die Stelle.

## §7 Nowcast: frisch, aber ohne Verzeichnis

Über das Netz gemessen (12.09. ~20:46 UTC): der Spiegel ist aktuell —
RV-Slot **6 min** alt (25 Frames, 0…+120 min), INCA **31 min** (12 Frames, +15…+180 min),
CombiPrecip **1 min** (1 Frame, Analyse ohne Extrapolation).

⚠ **Es gibt keinen maschinenlesbaren Slot-Index.** `nowcastReader.mjs` listet das Verzeichnis mit
`readdirSync` — das setzt einen lokalen Klon voraus. Ein Netz-Leser muss den Stempel aus der Uhr
ableiten und rückwärts probieren; gemessen kostet das **1–3 Sonden** (RV 2, INCA 3, RZC 1). Das ist
tragbar und wird so gebaut, gehört aber benannt (**V-PD-52**).

Geometrische Abdeckung, mit `coversPoint()` aus `sourceMatrix.ts` gerechnet, nicht nach Land geraten:
Hamburg/Berlin/Köln nur RV · Wien/Graz nur INCA · Genf/Zermatt nur CombiPrecip · der Alpenraum von
allen dreien. Wo mehrere tragen, braucht es eine Reihenfolge (§9).

## §8 Lesekosten je Punkt, gemessen

| Datei | Bytes |
|---|---|
| `point/index.json` | 21,1 kB |
| `point/<lauf>/run.json` | **85,2 kB** je Lauf (t2/t3 teilen sich einen) |
| t1-Chunk | 485,3 KiB |
| t2-Chunk | 151,0 KiB |
| t3-Chunk | 175,1 KiB |
| `point/stations/catalog.json` | 369,8 kB |
| `point/stations/<lauf>/stations.json` | 87,5 kB |
| Stationsbündel | 99,9 KiB |

**Ein voller Punktabruf über 0–336 h kostet damit ≈ 1,1 MiB für den Cube und ≈ 0,55 MiB für die
Station.** Ein Chunk trägt 16 × 16 Zellen × alle 51 Ebenen × alle Stunden — für einen Punkt werden also
255/256 der Zellen mitgeladen. Das ist die bewusste Entscheidung aus PD-A (ein Chunk = ein GET statt
Byte-Bereiche, die jsDelivr unzuverlässig cacht); es gehört nur beziffert, damit niemand die Vorstufe
für billig hält. `wanted` senkt die **Entpackzeit**, nicht die Bytes.

---

## §9 Was daraus folgt: die Auswahlregel

Die Regel ist **erklärend, nicht rechnend** — jede Entscheidung nennt ihren Grund, und alle Schwellen
stehen als benannte Konstanten mit `calibrated: false`, wie die Profil-Schwellen aus PD-B5.

Je angefragter **Gültigzeit** und je Größe:

1. **Harte Filter zuerst** (kein Ranking über Unmögliches):
   *trägt das Produkt die Größe überhaupt?* · *liegt die Gültigzeit auf seiner Achse (oder wie weit
   daneben)?* · *deckt seine Geometrie den Punkt?* (`coversPoint`, nie nach Land) · *ist der Lauf noch
   im Repo?*
2. **Niederschlag innerhalb des Nowcast-Horizonts und innerhalb der Abdeckung ⇒ Nowcast.**
   Begründet, nicht gesetzt: der Cube trägt dort einen Modellwert aus einem 1,9 h alten Lauf, der
   Spiegel eine 1–6 min alte Beobachtung. Reihenfolge bei Mehrfachabdeckung: **verlustfreies RV**
   (`radar/rv`, ohne Sättigung) vor RV-PNG vor INCA vor CombiPrecip — INCA vor RZC nur östlich 14,1 °E,
   wo RV nicht trägt (⚠¹).
3. **Station nur, wenn sie den Punkt wirklich vertritt** — `≤ 15 km` **und** `|Δh| ≤ 100 m`
   (**E-D-2**, gesetzt, nicht gemessen). Ohne übergebene Punkthöhe bleibt das Höhenkriterium
   **ungeprüft und wird als ungeprüft ausgewiesen**, nicht übersprungen.
4. **Zwischen Cube und Station entscheidet der ABSTAND ZUR GEFRAGTEN ZEIT, nicht der Rang.**
   Der Cube trägt an derselben Gültigzeit alles, was die Station trägt, und 39 Ebenen mehr —
   seine Wahl kostet also nichts, solange er die Zeit ähnlich gut trifft. Erst wenn die Station
   **mehr als 30 min näher** an der gefragten Zeit liegt (halbe feinste Rasterweite), gewinnt sie:
   dann ist der Cube-Wert erkennbar für eine andere Stunde gemeint. Bei Überlappung mehrerer
   Cube-Stufen die **feinere** (t1 vor t2 vor t3).

   ⚠ Die erste Fassung prüfte stattdessen `|offset_cube| ≤ 15 min` gegen eine feste Schwelle. Am
   lebenden Datum fiel auf, dass das falsch ist: eine Anfrage auf **07:25** verfehlt das stündliche
   t1-Raster um 25 min — die stündliche Stationsachse aber um **genau dieselben** 25 min. Die
   Station hätte gewonnen, ohne irgendetwas besser zu können, und dabei 39 Ebenen mitgenommen.
   Verglichen werden seither die Abstände; die Negativkontrolle steht im Verifier.
5. **σ, Quantile, Profil und `srcCount` gibt es nur im Cube** — auch wenn der Hauptwert von der Station
   kommt. Die Vorstufe liefert sie dann als **zweite, benannte Herkunft**, nie stillschweigend gemischt;
   das jeweils andere tragende Produkt steht als `alternative` mit Differenzen daneben.

Ausgegeben wird für einen Zeitraum deshalb kein einzelner Sieger, sondern ein **Segmentplan**
(„0–2 h Nowcast · 2–48 h t1 · … "), je Segment mit Produkt, Lauf, Alter, Abstand zum Raster und dem
Grund, warum die anderen verloren haben.

## §10 Etappen und Gates

| Etappe | Inhalt | Gate |
|---|---|---|
| **PD-D1** | Diese Diagnose | dieses Dokument |
| **PD-D2** | Leser: `src/point/client/{store,index,cube,stations,nowcast}.ts` — netzfähig, injizierbarer `fetch`, kein Verbraucher verdrahtet | Rundweg Producer → Leser byte-genau; `eagerJs` unverändert |
| **PD-D3** | Auswähler `src/point/client/resolve.ts` mit der Regel aus §9, jede Entscheidung mit `reason` | Negativkontrollen: Punkt ohne Radar, Punkt ohne Station, Zeit in der Lücke, Zeit jenseits 336 h |
| **PD-D4** | CLI `scripts/point/read-point.mjs` (`npm run point:read -- <lat> <lon> [--at=…|--from=… --to=…]`) | drei Orte gegen `point:check-cdn` gegengelesen |
| **PD-D5** | `verify:point-client`, netzfrei mit injiziertem `fetch` + Live-Modus | Verifier grün, `typecheck` 0, Budget unverändert |

## §11 Offene Entscheidungen (Jan)

* **E-D-1 — Werte je Einzelquelle?** Heute nicht im Repo (§1). Der Weg wäre `extract.bin` je Lauf
  (Werte je Quelle an festen Punkten, **kein zusätzliches Netz**, ≈ 2 MB je Quelle und Lauf bei
  523 Punkten). Erst mit ihm hieße „beste Quelle" *ICON-D2 statt IFS* statt *Cube statt Station*.
* **E-D-2 — Stationsschwelle.** Vorschlag 15 km / 100 m. Bei 15 km bekämen 68 % der Rasterpunkte eine
  Station (ohne Höhenfilter); mit Höhenfilter weniger — die Zahl wird in PD-D3 gemessen und
  nachgereicht, bevor die Schwelle festgeschrieben wird.
* **E-D-3 — Verhalten zwischen den Rasterstunden.** Nächster Schritt melden (mit Abstand) oder linear
  interpolieren und markieren? Interpolation ist bereits ein Hauch Algorithmus; Vorschlag: **melden,
  nicht rechnen**, und den Abstand ausweisen.

## §12 Benannte Befunde

* **V-PD-52** — kein Slot-Index für den Nowcast; ein Netz-Leser muss den Stempel aus der Uhr ableiten
  (gemessen 1–3 Sonden). Kur wäre eine `latest.json` je Quelle im Spiegel-Workflow.
* **V-PD-53** — `run.json` ist 85 kB und wird für **einen** Punktwert vollständig geladen. Ein
  schlanker Kopf (`planes`, `tiers[].leadHours`, `sources[].run/runAt`) wäre ≈ 3 kB.
* **V-PD-54** — der veröffentlichte Mittelwert liegt in 10–42 % der Stunden außerhalb des
  veröffentlichten q10/q90-Bands (§4). Erklärbar, aber ohne Hinweis am Wert irreführend.
* **V-PD-55** — die t2/t3-Naht ist in Gültigzeit **beweglich** (heute 6 h) und wird nirgends gerechnet;
  `latestByTier` nennt nur die Läufe.
* **V-PD-56 — jeder RV-Frame trägt dieselbe `validAtMs`.** Beim ersten Lauf der CLI lieferte der
  Nowcast nichts, ohne dass irgendwo ein Fehler auftauchte. Am veröffentlichten Slot nachgesehen:
  `f000.png` **und** `f120.png` nennen `validAtMs` = 1789283100000 = die Slot-Zeit. Ursache in
  `decodeRvTar` (`src/sources/radolanDecode.ts:170`): `validAt` kommt aus dem **Datumsfeld** des
  RADOLAN-Kopfes, und das ist bei einem Vorhersageprodukt die Produktionszeit; die Vorhersagestunde
  steht daneben in `leadMinutes`. Der Name verspricht die Gültigzeit, der Wert liefert die Laufzeit.
  Der Leser rechnet die Gültigzeit deshalb aus **Slot + `lead`** und meldet den Widerspruch als
  `validAtSuspect`; **der Spiegel bleibt unangetastet** — ihn zu ändern ist eine Entscheidung der
  Radar-Linie (STOPP & FRAGEN), nicht dieses Lesers.

---

## §13 Umgesetzt und belegt (2026-09-13)

PD-D1 bis PD-D5 sind gebaut. **Kein Verbraucher ist verdrahtet** — Einstiege sind die CLI und der
Verifier; `src/pointForecast/fusion/*` ist unberührt.

| Datei | Rolle |
|---|---|
| `src/point/client/store.ts` | Transport, `fetch` injizierbar (`memoryStore` für den netzfreien Selbsttest); 404 ist ein Befund, kein Fehler |
| `src/point/client/cubePoint.ts` | Cube am Punkt: Zelle → Chunk → Reihe, `stepNearest` gibt den **Abstand** mit |
| `src/point/client/stationPoint.ts` | Katalog, nächste Stationen mit Abstand UND Höhendifferenz, Bündel-Spalte |
| `src/point/nowcastSample.ts` | **geteilter Kern** — Domäne, `vMax`-Wächter, Abtastung, Byte → mm/h; `nowcastReader.mjs` ruft ihn jetzt auch auf, `cornersOf` dort entfallen |
| `src/point/client/nowcastPoint.ts` | Slot-Suche über die Uhr (V-PD-52), Frames im Zeitfenster, PNG-Dekoder injiziert |
| `src/point/client/resolve.ts` | die Auswahlregel aus §9, jede Entscheidung mit `reason` |
| `scripts/point/read-point.mjs` | `npm run point:read` — Segmentplan, Werte, Ehrlichkeitszeile |
| `scripts/verify-point-client.mjs` | `npm run verify:point-client` |

**Zwei kleine Änderungen an bestehender Form, beide additiv:** `dequantize`/`quantStep` nehmen jetzt
`PlaneScale` (`{scale, offset}`) statt `CubePlane` — das Lauf-Manifest führt genau diese zwei Felder,
und ohne die Verbreiterung hätte der Leser die Umrechnung ein zweites Mal hinschreiben müssen.
`nowcastFormat.ts` bekam `NOWCAST_STAMP_FORM` / `nowcastStampOf` / `nowcastSlotStamps` — die am
Spiegel gemessenen Stempelformen, damit die Slot-Suche sie nicht rät. **`nowcastManifest()` und damit
`point/index.json` sind unverändert.**

### Gate GPD-D

```
verify:point-client   44/44
verify:point-data    837/837   (unverändert nach dem Umbau des Nowcast-Lesers)
typecheck              0 Fehler
build                241/241
Budget      eagerJs 107,9/107,9 · totalJs 1366,1/1372 — UNVERÄNDERT
Textsonde   `planPointSources`, `readCubePoint`, `nowcastSlotStamps`, `stationMaxDElevM`
            in 0 von 83 dist-Chunks
```

Der Rundweg ist echt und nicht gegen eine Attrappe geprüft: der Verifier lässt **`encodeCubeChunk`**
(denselben Producer-Code) einen Chunk mit orts- und zeitabhängiger Signatur schreiben und liest ihn
mit `readCubePoint` zurück — 49 von 49 Schritten, größte Abweichung **2,0·10⁻³ K** bei Δ = 0,01
(also ≤ Δ/2). Eine um EINE Zelle verschobene Abfrage bricht den Vergleich; ohne diese Gegenprobe
bestünde er auch bei einem konstanten Feld.

### Am lebenden Datum geprüft (13.09., 07:10–07:25 UTC)

* **München, 09:00Z:** gewählt `cube-t1` (+6 h des 03z-Laufs, Rasterabstand 0 min) — 12 Werte,
  9 σ_div-Ebenen, 14 Quantile, 4 Profilfelder, `srcCount` 5. Station 10865 (5,0 km, −4 m) steht als
  Alternative daneben: ΔT −0,56 K, Δh_mod −16 m. Niederschlag aus RV (Slot 6 min alt).
  **19 Dateien, 1,76 MiB.**
* **Alpiner Talschluss 47,13/11,10:** Station HOCHSÖLDEN 16,5 km ⇒ **abgelehnt mit Grund**; der Cube
  trägt allein, t1 → t2 → t3 sauber durchgeschaltet.
* **Wien, 0–336 h im 12-h-Raster:** t1 → t2 → **stations** (18.–22.09., weil das 6-h-Raster von t3
  dort 3 h danebenliegt) → **t3** (ab 23.09., weil die Stationsachse bei +247 h endet) → nichts
  (ab 26.09. 21:00Z). Der Wechsel ist an jeder Stelle begründet, nicht geraten.
* **Rom / Ostsee:** kein Cube (Ausschnitt), keine Station, kein Radar — vier Kandidaten, vier Gründe,
  Exit 0. Eine leere Antwort ist ein Ergebnis, kein Absturz.
