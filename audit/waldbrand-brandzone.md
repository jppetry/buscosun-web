# audit/waldbrand-brandzone.md — Diagnose BA3 „Detektionsraster"

> **Phase BA3**, Gate **GWBBZ1**. Stand: 2026-08-16.
> Auftrag Jan: aus FIRMS **und** EFFIS Brandflächen auf der Karte zeigen und eine **ungefähre
> Größe** in die Information bringen. Verfahren nach Rückfrage gewählt: **Vereinigung der
> Pixelrechtecke** (statt konkaver Hülle).
> Belege: `scripts/l0/probe-waldbrand-brandzone.mjs`, `npm run verify:fire-zones` (52/52),
> Screenshot `scratchpad/ba3-zone-hohesvenn.png`.

---

## 0. Ausgangslage am Code (vor jeder Zeile Neucode)

| Was | Zustand |
|---|---|
| EFFIS-Brandflächen | **gebaut**: `fireBurnt`, zwei Körbe (Saison/Archiv), Füllung nach dominanter Landbedeckung, Popup mit `AREA_HA` + CORINE-Aufschlüsselung |
| FIRMS-Pixelrechtecke | **gebaut**: `footprintRing()` aus `scan`×`track`, gezeichnet ab Zoom 7, **einzeln** — nicht zusammengefasst, ohne Flächenangabe |
| Ereignisse | **gebaut**: `fireEvents.ts` mit `extentKm`, `pixels`, `sumFrp` — aber **keine** Fläche |
| Fläche aus FIRMS | **nicht vorhanden** |

Die Frage „wie groß ist dieses Feuer" war damit für die EFFIS-Seite beantwortet und für die
FIRMS-Seite gar nicht.

## 1. Warum kein Flächenwert aus FIRMS direkt ableitbar ist

Die FIRMS-CSV führt **kein Flächenfeld**. `frp` ist eine Leistung in MW, `bright_ti4` eine
Temperatur in K (sättigt bei ~367 K). Der einzige räumliche Inhalt sind `scan` und `track` — die
**Kantenlängen des Pixels** in km. Daraus folgt die Grenze, die alles bestimmt:

> **Am eigenen Lauf gemessen: Einzelpixelfläche min 13,7 ha · Median 19,9 ha · max 59,3 ha.**
> Der Median der EFFIS-Kartierungen im Wochenkorb liegt bei **4 ha**.
> Der typische kartierte Brand ist also **fünfmal kleiner als ein einzelnes Satellitenpixel**.

Jede Fläche aus FIRMS ist deshalb eine Aussage über die **Abdeckung der Messung**, nicht über den
Brand. Die Beschriftung trägt das (§5).

## 2. Verfahrenswahl: Vereinigung statt Hülle

| | Pixelraster (gewählt) | konkave Hülle (verworfen) |
|---|---|---|
| freie Parameter | **keine** | 2 (Konkavität, DBSCAN-Radius) |
| neue Dependencies | **keine** | 2 (~8,9 KB gzip, D-06 ⇒ STOPP & FRAGEN) |
| unverbrannte Inseln | bleiben frei | werden als verbrannt gefüllt |
| Verhältnis zur Zeichnung | **identisch** — die gezeichnete Fläche ist die gerechnete | Hülle ≠ Pixel |
| Reproduzierbarkeit | bitgleich bei gleicher Eingabe | parameterabhängig (Faktor 1,5–2 zwischen plausiblen Sätzen) |

Der entscheidende Punkt ist die letzte Zeile: eine Hektarzahl aus einer parameterabhängigen Hülle
wäre keine Messgröße. Die Vereinigung ist exakt das, was der Nutzer sieht.

## 3. Zwei gemessene Fallen — beide kosteten je einen Umbau

### (a) Exakt aneinandergrenzende Pixel fielen auseinander

VIIRS-Pixel eines Überflugs liegen **per Konstruktion** Kante an Kante. Ob `mitte + kante` und
`nachbarmitte − kante` bitgleich herauskommen, entscheidet die letzte Rundungsstelle — gemessener
Unterschied **~7e-15 Grad**. Ohne Gegenmaßnahme zerfiel ein zusammenhängender Brand in mehrere
Zonen mit haarfeinen Lücken; die *Fläche* stimmte, die *Zonenzahl* nicht.

Aufgefallen ist es an einer Prüf-Fixture (acht Pixel um eine Lücke ⇒ 112 ha statt 128, kein Loch).
**Wichtig für spätere Phasen:** die erste Vermutung „Code falsch" war falsch — die Fixture selbst
war fehlerhaft konstruiert (alle drei Pixelreihen mit dem Längenschritt von Breitengrad 50, während
`footprintRing` die Pixelbreite je Zeile aus **deren** Breite rechnet; die Südreihe war dadurch
schmaler als ihr Abstand). Beide Befunde waren echt und wurden getrennt behoben.

**Behoben:** Kanten werden auf **1e-9 Grad (~0,1 mm)** gerastet, bevor irgendetwas verglichen wird.
Das ist Gleitkomma-Hygiene, **kein Modellparameter**: neun Größenordnungen unter der Ortsunschärfe
der Quelle (±375 m), ohne messbare Wirkung auf irgendeine Fläche.

### (b) Das komprimierte 2D-Gitter war zu langsam

| Fassung | 24-h-Lauf (2 987 Detektionen) | größte Zone allein (1 524 px) |
|---|---|---|
| Zellgitter (`Uint8Array` über alle komprimierten Zellen) | **669 ms** | **477 ms** |
| zeilenweise Läufe, je Zeile sortiert und verschmolzen | 560 ms | 300 ms |
| **Zeilendurchlauf mit dauerhaft sortierten aktiven Rechtecken** | **167 ms** | **73 ms** |

Die Ursache: 1 524 Rechtecke ergeben ~3 200 x- und ~3 200 y-Kanten, also **9,3 Mio. Zellen**, von
denen fast alle leer sind und trotzdem dreimal angefasst wurden. Die Zwischenfassung sortierte je
Zeile neu (474 000 Zeileneinträge, 3 171 Sortierungen). Die Endfassung hält die aktiven Rechtecke
**dauerhaft nach `i0` sortiert** und verschmilzt je Zeile linear.

Das Ergebnis ist in allen drei Fassungen identisch (Fläche der größten Zone unverändert
5 000,6 ha) — geprüft über die eingebaute Gegenprobe Zellsumme ↔ Umriss-Shoelace.

**Trotzdem im Worker:** 167 ms auf dem Hauptthread wären auf einem Mobilgerät (2–3×) ein Long Task
über der 200-ms-Gate-Schwelle. Die Rechnung läuft deshalb in `fireEventsWorker.ts` (Muster V-222),
mit Hauptthread-Rückfall.

## 4. Ergebnisse am echten Lauf

| Fenster | Detektionen | Zonen | Median Fläche | p90 | größte | Einzelpixel-Zonen |
|---|---|---|---|---|---|---|
| 24 h | 2 696 | 325 | 18,9 ha | 98,4 ha | 4 654 ha | 191 (59 %) |
| 7 Tage | 7 932 | 1 358 | 17,6 ha | 63,7 ha | 4 654 ha | 817 (60 %) |

GeoJSON-Nutzlast: 150 KB (24 h) bzw. 556 KB (7 Tage) — **null zusätzliche Netz-Bytes**, die Daten
liegen bereits vor.

Dass ~60 % der Zonen aus einem einzigen Pixel bestehen, ist kein Mangel, sondern die Auflösung:
ein Einzelpixel ist herausgezoomt subpixelgroß und verschwindet von selbst. Ein Zoom-Schwellwert
wäre ein freier Parameter ohne Gewinn — deshalb keiner.

## 5. Kalibrierung gegen die Kartierung — die Zahl für die Beschriftung

17 Paare (Detektion in einer EFFIS-kartierten Fläche der letzten 7 Tage):

```
   EFFIS ha  Raster ha  Faktor  px  Ort
          2       33.9    16.9    3  DE Neustadt a. d. Waldnaab
         15       67.0     4.5    5  DE Main-Kinzig-Kreis
         87     1066.3    12.3  222  IT Vercelli
        181      918.4     5.1  148  IT Udine
        203      413.5     2.0   71  IT Verbano-Cusio-Ossola
          1      181.7   181.7   27  IT Udine
```

**Faktor Raster/Kartierung: min 2,0 · Median 12,3 · max 181,7 (n = 16).**

Daraus folgt die Wortwahl, die im Verifier verankert ist:
- „Detektionsraster: X ha aus N Pixeln (VIIRS 375 m)" — nie „Brandfläche"
- immer im selben Block: „ein Pixel bedeckt hier ~Y ha, und der Punkt ist die Pixelmitte"
- der Layer-Text nennt die gemessene Größenordnung: „im Median 12-mal so groß wie die tatsächlich
  verbrannte Fläche"

## 6. Darstellung

Drei Bildsprachen, die sich nicht ähneln dürfen:

| Ebene | Signatur |
|---|---|
| EFFIS-Kartierung | Füllung nach Landbedeckung, **harte dunkle Kontur** |
| Detektionsraster | Füllung 0,10, **gestrichelte** Kante — die Unschärfe muss optisch mitkommen |
| Pixelrechtecke (ab Zoom 7) | wie bisher, Nachtüberflug gestrichelt |
| Detektionspunkte | wie bisher (FRP-Radius, Konfidenz-Ring, Ortsfest-Grau) |

Beleg: `scratchpad/ba3-zone-hohesvenn.png` (Hohes Venn, 3 370 ha aus 814 Pixeln bei Zoom 11,6).

## 7. Nachgang

Die Regel „nie zwei Formen für dasselbe Feuer" war in dieser Phase **noch nicht** umgesetzt —
Raster und EFFIS-Fläche lagen gleichzeitig auf der Karte. Das ist in der Folgephase **BF3**
behoben (`src/fire/footprint/reconcile.ts`, Gate **GBF1**,
`audit/brandflaechen-echtzeit.md` §7).
