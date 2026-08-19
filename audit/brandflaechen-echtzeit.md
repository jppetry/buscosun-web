# audit/brandflaechen-echtzeit.md — Diagnose BF0

> **Phase BF0** (Kickoff `prompt-brandflaechen-echtzeit.md`, Gate **GBF1**). Diagnose, kein Code.
> **Stand: 2026-08-16.** Alle Zahlen aus `scripts/l0/probe-brandflaechen-echtzeit.mjs`, gemessen
> gegen die Live-Endpunkte (FIRMS über den echten Edge-Handler, EFFIS-WFS direkt, CLC-Maske aus
> `public/fire/clc-industry-mask.png`). Die Sonde ist reproduzierbar und schreibt nichts.
>
> Der Kickoff verlangt ausdrücklich „verify before relying on them". Das war richtig: **drei seiner
> Ausgangsannahmen halten der Messung nicht stand**, eine davon so deutlich, dass die daraus
> abgeleitete Bauanweisung (§BF0-4) das Gegenteil des Gewollten bewirken würde. Siehe §0.

---

## 0. Die drei Befunde, die den Kickoff korrigieren

| # | Kickoff sagt | Gemessen am 2026-08-16 | Folge |
|---|---|---|---|
| **A** | 1 233 Pixel in 24 h, 11 Überflüge, 0 × `low` | **2 987 roh / 2 696 nach Dedup**, **38 Erfassungsminuten**, **151 × `low`** | Alle abgeleiteten Clusterzahlen (66 / 54 / 48) sind veraltet — real 336 / 280 / 269 |
| **B** | Der 822-Pixel-Block bei 50,5 N / 6,1 E ist „almost certainly an **industrial heat source**" und muss neutralisiert werden | Der Block ist heute **1 311 Pixel / 20 918 MW** — und **vier unabhängige Merkmale sagen Waldbrand**, keines Industrie | **Ein Merkmal, das ihn aussortiert, löscht den größten aktiven Waldbrand der Region von der Karte.** §4 |
| **C** | Der Pufferradius wird „calibrated from BF0's overestimation factor" | Der Faktor streut über **zwei Größenordnungen und wechselt das Vorzeichen** (0,6 … 42,6; Median 10,5) | **Es gibt keine Kalibrierkonstante.** Die Bauanweisung §BF2 steht ohne Grundlage. §2 |

Befund **B** im Einzelnen — der Block bei 50,526 N / 6,089 E (Hohes Venn, DE/BE-Grenze):

| Merkmal | Wert | Deutung |
|---|---|---|
| CLC-Industriemaske (`clcMask.ts`) | `other` | **nicht** industriell |
| Persistenzklassifikator (`fireEvents.ts`) | `suspectedStatic = nein` | bewegt sich und dehnt sich aus |
| verschiedene Kalendertage | 3 | kein Dauerbetrieb |
| Copernicus EMS | **EMSR920** „Wildfire in Huertgen Forest, **Germany and Belgium**", Ereignis 13.08., `closed = false`, Zentroid 50,754 / 6,376 (≈ 30 km NO) | offene amtliche Waldbrand-Aktivierung im selben Gebiet |

Zum Vergleich die Cluster, die **tatsächlich** Industrie sind und vom Bestandscode erkannt werden:

```
    px      FRP  Tage         CLC  ortsfest  EFFIS  Ort
  1311    20918     3       other      nein   nein  50.526,6.089   ← Hohes Venn: WALDBRAND
   112      446     8       other      nein     ja  45.880,8.217   ← IT, EFFIS-kartiert
   104      316     8  industrial        JA   nein  51.489,6.718   ← ThyssenKrupp Duisburg
    83      387     8       other        JA     ja  45.732,8.163   ← IT, EFFIS-kartiert (!)
    74      331     8  industrial        JA   nein  48.276,14.336  ← voestalpine Linz
    62      210     4       other      nein     ja  46.394,13.062  ← IT, EFFIS-kartiert
```

Die Unterscheidung, die der Kickoff neu bauen will, **existiert also bereits und funktioniert** —
sie stammt aus den Phasen F2 und GWBA1. Was sie leistet und was sie kostet, steht in §4.

---

## 1. Wie viele Cluster schneiden eine EFFIS-Fläche?

Clustering: Union-Find, 1 500 m Verknüpfungsdistanz (Bestand `LINK_RADIUS_M`), 24-h-Fenster,
2 696 deduplizierte Detektionen ⇒ **272 Cluster**. Zuordnung räumlich mit `TOLERANCE_M` (400 m)
**und** zeitlich über `timeMatches` (±14 Tage um `FIREDATE`) — der Vertrag aus `fireCorroboration.ts`.

| Korb | Treffer | Anteil Cluster | Anteil Pixel |
|---|---|---|---|
| `week` (7 Tage) | **7 von 272** | 3 % | 273 von 2 696 (10 %) |
| `season` (Saison) | **9 von 272** | 3 % | 382 von 2 696 (14 %) |

**Das ist die wichtigste Zahl der Phase: 97 % der Cluster haben keine kartierte Entsprechung.**
„Bestätigt" ist damit der Ausnahmefall und bleibt es auch — nicht wegen eines schlechten
Abgleichs, sondern weil EFFIS mit 1,8 Tagen Median-Verzug kartiert (§6) und die Mehrzahl der
Detektionen keine Vegetationsbrände sind. Jede UI, die „bestätigt" als Normalzustand anlegt,
zeigt zu 97 % einen Mangel an.

Die 9 Treffer liegen **alle in Italien** — kein einziger in DACH. Der Grund ist nicht fehlende
Abdeckung, sondern Lage: die aktuellen DACH-Detektionen sind Industrie (Duisburg, Linz) oder das
noch nicht kartierte Hohe Venn.

---

## 2. Überschätzungsfaktor — und warum es ihn nicht als Konstante gibt

Für jedes der 9 Paare: konvexe Hülle (Monotone Chain, lokal metrisch) und das Pixelraster aus
`fireZones.ts`, jeweils geteilt durch `AREA_HA`.

```
  EFFIS     Hülle    Raster  f_Hülle  f_Raster  px  Ort
   1196     726.6     645.4      0.6       0.5   83  IT Biella
    302     177.0     249.3      0.6       0.8   26  IT Verbano-Cusio-Ossola
    181     542.1     546.6      3.0       3.0   62  IT Udine
     87     915.6     898.6     10.5      10.3  112  IT Vercelli
     47      52.2     123.8      1.1       2.6    8  IT Vercelli
      7     100.2     212.9     14.3      30.4   17  IT Pordenone
      7     140.4     270.2     20.1      38.6   42  IT Udine
      2      78.4     180.6     39.2      90.3   16  IT Pordenone
      1      42.6     127.2     42.6     127.2   16  IT Udine
```

| Verfahren | min | p25 | Median | p75 | max |
|---|---|---|---|---|---|
| konvexe Hülle | **0,6** | 1,1 | **10,5** | 20,1 | **42,6** |
| Pixelraster | **0,5** | 2,6 | **10,3** | 38,6 | **127,2** |

Drei Dinge stehen darin, und alle drei sind unbequem:

1. **Der Faktor wechselt das Vorzeichen.** Bei den beiden größten Bränden (1 196 ha, 302 ha)
   liegt er **unter 1** — die Hülle *unterschätzt* die kartierte Fläche um 40 %. Der Grund ist
   bekannt und physikalisch: VIIRS detektiert die **Feuerfront**, nicht die Fläche dahinter; bei
   einem großen, teils schon abgebrannten Areal fehlen die Punkte im Inneren. Bei Kleinbränden
   dominiert dagegen die Pixelgröße, und der Faktor läuft auf 42 bzw. 127.
2. **Er ist eine Funktion der Brandgröße, kein Materialkonstante.** Genau deshalb lässt er sich
   nicht als Pufferradius kalibrieren: der Puffer müsste bei 1 ha wachsen und bei 1 000 ha
   schrumpfen, und die Brandgröße ist die Größe, die man gerade nicht kennt.
3. **Die Streuung ist zu groß für jede Zahl.** p25 = 1,1, p75 = 20,1 — eine daraus abgeleitete
   Hektarzahl wäre um den Faktor 20 unsicher. Das ist keine Messgröße.

Zur Einordnung die Auflösungsgrenze selbst: **Einzelpixelfläche min 13,7 ha · Median 19,9 ha ·
max 59,3 ha** (Randpixel). Der Median der kartierten Flächen im Wochenkorb ist **4 ha** (§5).
**Der typische kartierte Brand ist also fünfmal kleiner als ein einzelnes Satellitenpixel.**

> **Konsequenz für §BF2 des Kickoffs:** „Buffer radius calibrated from BF0's overestimation factor"
> ist nicht umsetzbar — der Faktor existiert nicht. Was bleibt, ist eine Fläche **ohne** abgeleitete
> Hektarzahl (Kickoff-Linie §BF5) oder eine Fläche mit einer als Obergrenze ausgewiesenen Zahl
> (Linie BA3, Jans Entscheidung vom 2026-08-16). Die Wahl ist eine Produktentscheidung, keine
> Messfrage — sie liegt Jan vor.

---

## 3. Welche Verknüpfungsdistanz — und gepoolt oder je Überflug?

**Gepoolt über 24 h** (2 696 Detektionen):

| Distanz | Cluster | Einzelpixel | in Gruppen | größtes |
|---|---|---|---|---|
| 500 m | 336 | 197 | 2 499 (92,7 %) | 1 272 |
| 1 000 m | 280 | 147 | 2 549 (94,5 %) | 1 296 |
| **1 500 m** | **272** | **141** | **2 555 (94,8 %)** | **1 311** |
| 2 000 m | 269 | 138 | 2 558 (94,9 %) | 1 311 |

**Je Überflug** (38 Erfassungsminuten): 1 000 m ⇒ 660 Cluster / 392 Einzelpixel (15 %) ·
1 500 m ⇒ 614 Cluster / 350 Einzelpixel (13 %).

**Begründung aus den Daten, nicht aus der runden Zahl:** Zwischen 500 m und 2 000 m ändert sich
die Clusterzahl nur um 20 % (336 → 269), und der größte Cluster wächst bereits bei 500 m auf
1 272 Pixel. Die Struktur ist also **nicht** von der Verknüpfungsdistanz getrieben — sie kommt aus
den Daten selbst. Ein neuer Wert wäre Scheingenauigkeit; **der Bestand (1 500 m, plus 48-h-Zeitlücke
in `fireEvents.ts`) bleibt.** Das ist zugleich die Distanz, unter der zwei Detektionen desselben
Überflugs sich mit ihren Pixelrechtecken ohnehin berühren.

**Gepoolt, nicht je Überflug — und warum:** Je Überflug liegt der Anteil isolierter Pixel bei 13 %
statt 5 %, aber diese „Isolation" ist ein Artefakt der Beobachtung, kein Befund über das Feuer:
derselbe Brand erscheint in Pass *n* als Zweiergruppe und in Pass *n+1* als Einzelpixel, weil der
Überflugwinkel und die Bewölkung anders waren. Das Produkt beantwortet die Frage „wie groß ist
dieses Feuer", nicht „was sah Satellit X um 01:37". Deshalb **gepoolt über das angezeigte Fenster**.
Die Zahl der Überflüge bleibt als Eigenschaft je Cluster erhalten (`overpasses` in `fireEvents.ts`)
und ist genau das, was der Steckbrief als Beleg zeigt.

---

## 4. Wie wird der Industrieblock ausgeschlossen?

**Nicht durch ein neues Merkmal — der Bestand leistet es bereits, und zwar mit zwei unabhängigen
Verfahren.** Der Kickoff nennt drei Kandidaten; alle drei sind gebaut:

| Kandidat | Wo | Befund |
|---|---|---|
| Persistenz über Tage | `fireEvents.ts`, `suspectedStatic` (≥ `STATIC_MIN_DAYS` = 5 Tage ortsfest **und** Ausdehnung < 1 Pixelbreite) | 48 von 1 330 Ereignissen (7 Tage) |
| `ARTIFSURF`-Landbedeckung | `clcMask.ts` (CORINE 2018, 3×3-Nachschlag ±1 km) | 116 von 263 unkartierten Clustern |
| fehlende EFFIS-Kartierung trotz hoher FRP | — | **untauglich, s. u.** |

**Falsch-Positiv-Messung** (falsch positiv = das Merkmal stuft einen Cluster als Dauerquelle ein,
den EFFIS als Brandfläche kartiert hat):

| Merkmal | kartierte Cluster | davon getroffen | FP-Rate |
|---|---|---|---|
| Persistenz (`suspectedStatic`) | 9 | 2 | **22 %** |
| CLC-Industriemaske | 9 | 0 | **0 %** |

Damit ist die Reihenfolge klar und sie ist **im Code bereits so verdrahtet** (`fireAssessment.ts`):
die CLC-Maske ist das präzisere Merkmal, die Persistenz das empfindlichere — und **jede
Bestätigung überstimmt die Persistenz-Graustufe** (Präzedenzfall Varallo, E1: 24 graue Detektionen
gegen eine 47-ha-Kartierung). Genau diese Regel fängt die 2 falsch positiven Fälle oben ab: beide
sind EFFIS-kartiert, also werden sie **nicht** ausgegraut. Die effektive FP-Rate nach der
Überstimmungsregel ist **0 %**.

**Der dritte Kandidat des Kickoffs ist gefährlich.** „Absence of any EFFIS mapping despite huge FRP"
trifft in dieser Messung exakt den größten Cluster — das Hohe Venn mit 20 918 MW und ohne
Kartierung. Das ist aber kein Industriestandort, sondern ein **laufender Waldbrand**, dessen
Kartierung schlicht noch nicht vorliegt (Median-Verzug 1,8 Tage, der Brand läuft seit dem 13.08.
und die EMS-Aktivierung EMSR920 ist offen). Ein Merkmal aus „viel FRP, keine Kartierung" wäre ein
Detektor für **frische Großbrände** und würde sie unterdrücken — die teuerste denkbare
Fehlfunktion dieser Ansicht.

> **Konsequenz für §BF0-4 des Kickoffs:** Die Aufgabe „pick one, measure its false-positive rate"
> ist beantwortet — CLC-Maske primär (0 % FP), Persistenz sekundär (22 % FP, durch die
> Überstimmungsregel auf 0 % gebracht). Neu zu bauen ist **nichts**. Die Anweisung, den
> 822-Pixel-Block zu neutralisieren, wird **nicht** ausgeführt: er ist ein echtes Feuer.

---

## 5. Kartierschwelle: `min(AREA_HA)` je Korb

| Korb | n | min | p25 | Median | max | Anteil < 5 ha |
|---|---|---|---|---|---|---|
| `week` | 23 | **0 ha** | 1 | 4 | 203 | 52 % |
| `season` | 293 | **0 ha** | 2 | 5 | 1 196 | 46 % |

Die oft zitierte 30-ha-Schwelle ist für DACH **falsch** — sie stammt aus der MODIS-Ära. Seit der
Einmischung von Sentinel-2 (20 m) kartiert EFFIS bis auf 0–1 ha herunter; knapp die Hälfte aller
Flächen liegt unter 5 ha. `euContext.ts` liest `minAreaHa`/`maxAreaHa` bereits **aus den Daten**
(`buildBurntRun`), fest eingetragen wäre die Zahl binnen einer Saison falsch.

Was das für die Aussage bedeutet: Unterhalb ~1 ha ist FIRMS die **einzige** Evidenz — und dort ist
ein einzelnes Pixel (Median 19,9 ha Abdeckung) zwanzigmal größer als der Brand. Genau in diesem
Bereich muss die Ansicht am deutlichsten sagen, dass sie eine Abdeckung zeigt und keine Fläche.

---

## 6. Ist `week ⊂ season`?

**Ja, vollständig.** Von 23 `week`-Flächen fehlt **keine einzige** im `season`-Korb (Abgleich über
`id`).

```
week: 23 · season: 293 · in week, aber NICHT in season: 0
season-Flächen mit FIREDATE in den letzten 7 Tagen: 21 (week hat 23)
```

Die kleine Differenz (21 vs. 23) ist kein Widerspruch, sondern ein Hinweis auf das Kriterium: zwei
`week`-Flächen haben ein `FIREDATE`, das älter als 7 Tage ist — der Server bildet den Korb
offenbar über `LASTUPDATE` oder `CLASS`, nicht über `FIREDATE`. **Für die Historie ist der
Filter über `FIREDATE` zu ziehen**, wie der Kickoff §BF4 es verlangt (der Nutzer fragt, wann es
gebrannt hat).

**Latenz `FIREDATE` → `LASTUPDATE` im Wochenkorb:** min 0,3 d · **Median 1,8 d** · max 4,3 d
(n = 23). Die Angabe „1–4 Tage" des Kickoffs ist damit bestätigt.

> **Konsequenz für §BF4:** Die Historie ist ein **Filter auf `season`**, kein zweiter Abruf.
> `fetchBurntWeek()` bleibt trotzdem sinnvoll — es ist der kleine (~100 KB) Abruf, der die
> Bestätigung trägt, auch wenn der Brandflächen-Layer aus ist (V-225). Für die *Anzeige* der
> 7-Tage-Historie wird `season` gefiltert.

---

## 7. Was daraus für die Bauphasen folgt

| Kickoff-Phase | Status nach BF0 |
|---|---|
| **BF1** Clustering-Modul | **Bereits vorhanden**: `fireEvents.ts` liefert Union-Find über `LINK_RADIUS_M`, je Cluster Pixelzahl, `satellites`, `overpasses`, `sumFrp`/`maxFrp`, `extentKm`, `firstMs`/`lastMs`, Konfidenzverteilung — ohne `Date.now()` (nowMs wird übergeben, D-12). Cross-Satelliten-Dedup steckt in `dedupe()` (`firmsHotspots.ts`). **Kein Neubau, sonst zwei Wahrheiten.** |
| **BF2** Hüllengeometrie | **Grundlage entfallen** (§2): kein kalibrierbarer Faktor. Alpha-Shape bräuchte zusätzlich zwei Runtime-Dependencies (D-06, STOPP & FRAGEN) und zwei freie Parameter. Gebaut ist stattdessen die parameterfreie Pixelraster-Vereinigung (`fireZones.ts`, Phase BA3). **Entscheidung liegt bei Jan.** |
| **BF3** Abgleich | **Umgesetzt** — `src/fire/footprint/reconcile.ts`. War der eigentliche Zugewinn: Raster und EFFIS-Fläche lagen gleichzeitig auf der Karte. Live belegt: 22 von 1 346 Zonen werden ersetzt, Rückschalten stellt exakt den Ausgangsstand wieder her. |
| **BF4** Historie | **Umgesetzt** — `src/fire/footprint/history.ts`, Filter auf `season` (kein zweiter Abruf), Tagesregler auf `FIREDATE`, `LASTUPDATE` getrennt als Frischestempel. Live: `week` 19 + `season` 274 = 293 = voller Bestand, also überschneidungsfrei. |
| **BF5** Darstellung | Drei getrennte Bildsprachen stehen (harte Kontur = kartiert, doppelte Kontur = frisch kartiert, gestrichelt = Raster). Die Hektarzahl auf dem Raster **bleibt** — Jans Entscheidung 2026-08-16, mit Obergrenzen-Hinweis und Pixelzahl im selben Block. |

**Die drei Entscheidungen, die Jan am 2026-08-16 getroffen hat** (sie waren keine Messfragen mehr,
sondern Produktfragen — die Messung konnte sie nicht beantworten):

1. **Hektarzahl auf dem Detektionsraster: behalten**, mit Hinweis. Der Kickoff verlangte in §BF5
   das Gegenteil („no hectare figure. Ever."). Die Zahl ist exakt gerechnet und parameterfrei; was
   sie nicht ist, steht daneben.
2. **Geometrie: Pixelraster behalten**, kein Alpha-Shape. Deckt sich mit dem Messbefund §2 — die
   vom Kickoff geforderte Kalibrierung existiert nicht.
3. **Ersetzung statt Addition: ja** (BF3). Der stärkste Punkt des Kickoffs, umgesetzt und per
   Zusicherung abgesichert.

Gate-Protokoll mit allen Belegen: `checklist.md` §Gate **GBF1**.

---

## Belege

- Sonde: `scripts/l0/probe-brandflaechen-echtzeit.mjs` (reproduzierbar, netzabhängig)
- Vorlauf-Sonde der Phase BA3: `scripts/l0/probe-waldbrand-brandzone.mjs`
- Bestandscode: `src/fire/fireEvents.ts`, `src/fire/fireZones.ts`, `src/fire/clcMask.ts`,
  `src/fire/fireAssessment.ts`, `src/fire/fireCorroboration.ts`, `src/fire/sources/euContext.ts`
- Verwandte Diagnosen: `audit/waldbrand-effis.md` (E0–E3), `audit/waldbrand-behoerden.md` (GWBA1),
  `audit/waldbrand-firms.md` (F0–F2), `prompt-waldbrand-brandflaeche.md` (Quellenrecherche)
