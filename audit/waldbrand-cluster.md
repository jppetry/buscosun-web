# audit/waldbrand-cluster.md — Brand-Cluster: Liste rechts, Hülle auf der Karte (Phase BC1, Gate GBC1)

> Auftrag Jan, 2026-08-16: „Die Hotspot-Punkte (GWIS/VIIRS) sollen nicht mehr nur als Einzelpunkte
> erscheinen, sondern zu Brand-Clustern zusammengefasst und in der rechten Sidebar nach Stärke
> sortiert aufgelistet werden." Dazu: Cluster-Fläche als halbtransparentes Polygon (konvexe Hülle),
> Klick-Kopplung Liste ↔ Karte, ein Umschalter „Layer | Brände" **über** dem bestehenden
> Informationspanel — das Panel selbst bleibt unangetastet.
>
> Auflagen aus dem Auftrag: keine neue Datenquelle, keine Backend-Erweiterung, bewusst schlank
> (keine Detailansichten, keine Trendanalysen, keine weiteren Kennzahlen), Clustering clientseitig
> und performant für DACH-weite Punktmengen.

Diese Datei ist die **Diagnose vor dem Code**. Sie hält fest, was bereits existiert, welche vier
Entscheidungen die Phase trägt und woran sie überprüfbar ist.

---

## 1. Bestandsaufnahme — was es schon gibt

| Baustein | Datei | Was er leistet | Für diese Phase |
|---|---|---|---|
| Detektionen | `src/fire/sources/firmsHotspots.ts` | `FirmsRow[]` (lat/lon/acqMs/frp/confidence/scan/track/satellite), Dedup, Fenster­planung, GeoJSON | **Eingabe** — `HotspotRun.rows` ist genau die angezeigte Menge |
| Clustering | `src/fire/fireEvents.ts:130` `spatialClusters()` | Union-Find über ein Gitter, Verknüpfungsradius `LINK_RADIUS_M` = 1 500 m, danach Zerlegung an 48-h-Zeitlücken | **wird wiederverwendet**, nicht nachgebaut |
| Ereignisse | `fireEvents.ts:248` `buildFireEvents()` | Ereignisse mit Überflügen, Tagen, ΣFRP, Ausdehnung, Ortsfest-Verdacht | bleibt **unverändert** (F2/GWBA1 hängen daran) |
| Detektionsraster | `src/fire/fireZones.ts` | Vereinigung der `scan`×`track`-Pixelrechtecke, Fläche in ha | bleibt unverändert; die Hülle ist etwas **anderes** (§4) |
| Karte | `src/fire/FireMap.tsx:97` `GL_LAYERS.fireHotspots` | sechs GL-Layer am **einen** Schalter `fireHotspots` | Hülle kommt als drei weitere Layer **an denselben Schalter** |
| Sidebar | `src/fire/FirePage.tsx:1080` `readoutContent()` | Steckbrief-Stapel, Skalen-Trio, AT-Lücke, Saison-Hinweis | bleibt **wortgleich und unverändert**, bekommt nur einen Umschalter darüber |
| Worker | `src/fire/fireEventsWorker.ts` | Klassifikation (`kind` leer) und Raster (`kind: 'zones'`) off-main | trägt die Cluster **in derselben Nachricht** wie das Raster |

**Wichtigster Befund:** Das Clustering ist bereits gebaut, gemessen und dokumentiert. Diese Phase
baut **kein zweites**; sie parametrisiert das bestehende und legt eine Auswertung daneben.

---

## 2. Vier Entscheidungen

### 2.1 Ein Clustering-Modul, nicht zwei

`spatialClusters()` bekommt einen **optionalen** Radius-Parameter (Vorgabe unverändert
`LINK_RADIUS_M`) und wird exportiert. `buildFireEvents()` ruft es ohne Argument auf — die
Ereignisbildung, an der die Ortsfest-Einstufung (F2) und die Bewertung (GWBA1) hängen, ist danach
**bitgleich**. Der Verifier-Anker aus GBF1 („es gibt genau EIN Clustering-Modul") wird in
`verify:fire-clusters` verschärft: `fireClusters.ts` darf **kein** eigenes Gitter, **kein** eigenes
Union-Find und **keinen** eigenen Abstandsvergleich enthalten.

### 2.2 Radius: 2 000 m Vorgabe, konfigurierbar — und warum das fast nichts ändert

Der Auftrag nennt „~2 km". `audit/brandflaechen-echtzeit.md` §3 hat den Parameter am 24-h-Lauf
(2 696 Detektionen) bereits durchgemessen:

| Distanz | Cluster | Einzelpixel | größter Cluster |
|---|---|---|---|
| 500 m | 336 | 197 | 1 272 |
| 1 000 m | 280 | 147 | 1 296 |
| 1 500 m (Ereignisse) | 272 | 141 | 1 311 |
| **2 000 m (Cluster-Liste)** | **269** | **138** | **1 311** |

Zwischen 1 500 m und 2 000 m liegen **drei Cluster** (1 %). Die Struktur kommt aus den Daten, nicht
aus dem Parameter — deshalb ist die Wahl unkritisch, und deshalb wird sie auch **nicht** zu einem
Bedienelement gemacht: ein Regler, der 272 in 269 verwandelt, verspricht eine Steuerbarkeit, die es
nicht gibt (aufgenommen als **V-244**). Konfigurierbar ist er als Parameter der reinen Funktion.

### 2.3 Rein räumlich, ohne 48-h-Zerlegung

`buildFireEvents()` zerlegt räumliche Cluster zusätzlich an Zeitlücken > 48 h — richtig für die
Frage „ist das noch dasselbe Feuer?". Die Liste beantwortet eine andere Frage: „wo hat es im
**gezeigten Fenster** wie stark gebrannt?". Das Fenster (24 h / 7 d) **ist** der Zeitfilter; eine
zweite Zeitregel darin wäre ein Parameter, den niemand sieht und niemand einstellt. Ein Ort mit
Detektionen an Tag 1 und Tag 6 ist deshalb in der 7-Tage-Liste **ein** Eintrag — die Spalte
„letzte Detektion" sagt, wann er zuletzt gesehen wurde.

### 2.4 Konvexe Hülle — was sie ist, und was sie ausdrücklich nicht ist

`fireZones.ts` verwirft im Kopfkommentar die **konkave** Hülle: zwei freie Parameter, zwei
plausible Parametersätze, Flächen um Faktor 1,5–2 auseinander. Dieselbe Begründung hat in GBF1 den
Alpha-Shape-Punkt (BF2) gekippt.

Die **konvexe** Hülle hat diesen Mangel nicht: sie hat **keinen freien Parameter**, ist bei gleicher
Eingabe reproduzierbar und lässt sich in einem Satz erklären („das kleinste Vieleck, das alle
Detektionen umschließt"). Sie ist damit zulässig — aber sie misst etwas anderes als die beiden
Flächen, die es schon gibt, und das muss in der Anzeige stehen:

| Zahl | Was sie ist | Einheit |
|---|---|---|
| EFFIS-Kartierung | die **verbrannte Fläche**, satellitenbildbasiert, visuell geprüft | ha |
| Detektionsraster (BA3) | die vom Satelliten **abgedeckte** Fläche (Pixelrechtecke) — Obergrenze | ha |
| **Cluster-Hülle (neu)** | die **Ausdehnung der Detektionsorte** — wie weit die Pixelmitten streuen | km² |

**Korrigiert nach der Live-Messung (16.08., 7-Tage-Lauf):** Die erste Fassung dieser Diagnose
behauptete, die Hülle sei „systematisch kleiner" als das Raster. Das stimmt nicht. Am größten
Cluster des Laufs gemessen: **Hülle 34,1 km² gegen Raster 33,67 km²** (3 367 ha aus 719 Pixeln) —
die Hülle ist dort **größer**. Beide Richtungen kommen vor, und zwar aus einem benennbaren Grund:
die Hülle schneidet den halben Pixelrand ab (kleiner), füllt aber jede undetektierte Lücke im
Inneren auf (größer). Ein fester Umrechnungsfaktor zwischen beiden existiert nicht — dieselbe
Lehre wie beim Überschätzungsfaktor gegen EFFIS (`audit/brandflaechen-echtzeit.md` §2).

Ein Cluster aus einer oder zwei Detektionen hat eine Hülle ohne Flächeninhalt — die Liste zeigt
dort **„—"**, nicht „0,0 km²" und schon gar nicht die Pixelfläche als Ersatz. Das Wort
„Brandfläche" fällt am Cluster nicht (Verifier-Anker).

---

## 3. „Stärke" — die eine Sortiergröße

Sortiert wird nach **ΣFRP** (Summe der Feuerstrahlungsleistung aller Detektionen des Clusters in
MW), bei Gleichstand nach Detektionszahl. Das ist dieselbe Reihenfolge, in der `buildFireEvents()`
seine Ereignisse schon heute ausgibt (`fireEvents.ts:288`) — es kommt keine zweite Rangordnung ins
Produkt.

Was ΣFRP ist und was nicht — steht so über der Liste:

* FRP ist eine **Leistung** (MW), keine Fläche und keine Energie.
* Die Summe läuft über **Pixel und Überflüge**. Ein Feuer, das drei Satelliten sechsmal gesehen
  haben, summiert höher als ein gleich starkes, das einmal gesehen wurde. Die Zahl misst also
  „Stärke **und** Beobachtungsdichte", nicht Stärke allein.
* Detektionen ohne `frp` (GWIS-Notbetrieb) tragen 0 bei — im Notbetrieb gibt es die Liste deshalb
  gar nicht, statt einer Rangfolge aus lauter Nullen (§6).

Die Farbstufen der Hülle bekommen **eigene** Stützstellen (`CLUSTER_FRP_STOPS`, in Σ MW), weil
dieselbe Farbe am Einzelpunkt eine Einzelleistung meint. Die Legende steht in der Liste, nicht im
Layer-Steckbrief — der bleibt unverändert (Auftrag).

### 3.1 Der Befund, der die Phase erweitert hat: Rang 7 war ein Stahlwerk

Der erste Live-Lauf (24-h-Fenster, 1 486 Detektionen, 232 Cluster) stellte auf **Rang 7**
„150,7 MW · 51 Detektionen · DE" — Duisburg-Bruckhausen, also **ThyssenKrupp**. Die Karte zeichnet
diese Punkte längst grau („ortsfest", F2); die Liste hätte sie als siebtstärksten *Brand* geführt.
Damit widerspräche die Liste der Karte an genau der Stelle, an der die Waldbrand-Linie ihre teuerste
Lehre hat: **39,3 %** aller DACH-Detektionen sind Dauerwärmequellen (`fireEvents.ts` Kopf).

Deshalb trägt jede Zeile denselben Vorbehalt wie der Punkt: Cluster, deren **Mehrheit** der
Detektionen als ortsfest eingestuft ist, werden grau gezeichnet und mit „ORTSFEST" beschriftet —
**in der Rangfolge stehend, nie ausgeblendet** (die Regel aus F2). Die Schlüsselmenge ist
**dieselbe** (`staticKeys`), die auch die Punkte grau macht; ein zweiter Zustand entsteht nicht.
Weil die Einordnung erst nach der Klassifikation vorliegt (V-222), läuft dafür ein **zweiter**
Cluster-Lauf im Worker — vorher behauptet keine Zeile einen Vorbehalt.

---

## 4. Region/Land — was ohne neue Quelle möglich ist

Der Auftrag nennt „Region/Land". Ohne neue Datenquelle gibt es:

* **Land:** Punkt-in-Polygon gegen `public/countries/{DE,AT,CH}.geojson` — dieselben Ringe, aus
  denen die DACH-Maske gebaut wird (`countryMask.ts`), zusammen 1 716 Stützpunkte. Der Abruf ist
  nach dem Maskenaufbau kostenlos (neuer Promise-Cache je Land).
* **Keine Unterregion.** Bundesland/Kanton/Bezirk gibt es in keinem mitgelieferten Datensatz; die
  einzige Auflösung wäre Reverse-Geocoding je Cluster (`src/geocode.ts` → Nominatim). Das wäre eine
  neue Datenquelle, ein Abruf je Zeile und ein Verstoß gegen die Nutzungsregeln der Quelle
  (Massenabfrage). **Nicht gebaut** (V-245).

Die Grobzuordnung `countryGuess()` in `FireMap.tsx:881` wird dafür **nicht** benutzt: sie fällt
außerhalb der AT-/CH-Kästen auf `DE` zurück. Für einen Deep-Link ist das vertretbar, für eine Liste,
die „Land" behauptet, nicht — das FIRMS-Fenster reicht über DACH hinaus, Detektionen in Tschechien
oder Frankreich sind der belegte Normalfall (**V-221**). Cluster außerhalb der drei Länder werden
als **„außerhalb DE/AT/CH"** geführt, solange die Ringe geladen sind, und als **„—"**, solange nicht.

---

## 5. Wo gerechnet wird

Die Cluster fahren **in derselben Worker-Nachricht wie das Detektionsraster** (`kind: 'zones'`):
gleiche Eingabe (die angezeigten Zeilen), gleicher Lebenszyklus (beide werden beim Fensterwechsel
geleert), gleicher Rückfall auf den Hauptthread. Der erste Lauf kostet damit **keine** zusätzliche
Strukturkopie über die Worker-Grenze.

**Ein zweiter Lauf kommt dazu** (`kind: 'clusters'`, s. §3.1): Der Ortsfest-Vorbehalt ist erst
bekannt, wenn die Klassifikation durch ist, und die Zuordnung Detektion → Cluster liegt nur im
Clustering vor. Er läuft im Leerlauf, nach dem ersten Bild, und kostet eine zweite Kopie der Zeilen
— dieselbe Größenordnung, die die Klassifikation ohnehin zweimal überträgt.

Aufwand: Union-Find + Hüllen sind linear bis n·log n in der Clustergröße. Headless gemessen
(`verify:fire-clusters`): **35–56 ms für 6 000 Detektionen** — der Worst Case, in dem jede Detektion
ein eigener Cluster ist. Zum Vergleich das teurere Nachbarmodul: `buildFireZones` braucht 167 ms
(24-h-Lauf, 2 987 Detektionen).

**Was NICHT off-main läuft: das Rendern der Liste.** Am Prod-Build gemessen kosten 1 111 Zeilen
(7-Tage-Fenster) vom Klick bis zur Zeile im DOM **253 ms** — über der 200-ms-Grenze, auf dem
Desktop. Die Kosten stecken im Erzeugen von ~9 000 Knoten: `content-visibility: auto` machte es mit
303–366 ms **schlechter**, weil es Layout und Paint betrifft, nicht die Knoten. Deshalb ein
**ausgesprochener Deckel** (`CLUSTER_PAGE = 50`): die Kopfzeile nennt die volle Clusterzahl, die
Liste sagt „gezeigt: die 50 stärksten von 1 111", ein Knopf holt die nächsten 50. Danach gemessen:
**19–41 ms**. Wird ein Cluster jenseits des Deckels auf der Karte angeklickt, klappt die Liste so
weit auf, dass seine Zeile wirklich existiert.

---

## 6. Bedienung

* **Umschalter** oben im Readout: „Layer" (heutiger Inhalt, unverändert) | „Brände" (Liste).
  Der Startzustand ist „Layer" — wer die Ansicht öffnet, sieht, was er bisher sah.
* **Liste:** Kopfzeile mit der Cluster-Zahl im sichtbaren Fenster, darunter der Pflichthinweis
  (§3), die Stärke-Legende und die Zeilen: Rang, Stärke (Σ MW), Detektionszahl, ggf. „ORTSFEST",
  Hüllenfläche, Land, letzte Detektion (`clockLabel` + `ageText` — dieselbe Alterssprache wie
  überall sonst, D-04). Gezeigt werden 50 Zeilen auf einmal, mit ausgesprochenem Deckel (§5).
  Der Hinweis steht **über** der Liste: hinter 1 111 Zeilen wäre er unerreichbar.
* **Liste → Karte:** Klick zoomt auf die Cluster-Bbox (`fitBounds`, `maxZoom` gedeckelt, damit ein
  Ein-Pixel-Cluster nicht auf Zoom 20 springt) und hebt das Polygon hervor.
* **Karte → Liste:** Klick auf die Hülle markiert die Zeile, schaltet den Readout auf „Brände" und
  scrollt die Zeile in den sichtbaren Bereich. **Die bestehenden Popups bleiben unberührt** — die
  Auswahl läuft vor der Popup-Kette, ändert an ihr nichts und öffnet selbst kein Popup.
* **Leerzustände**, jeder mit Grund statt mit leerer Fläche: Layer aus · lädt · keine Detektion im
  Fenster · **Notbetrieb GWIS** (dort liefert die Quelle keine Einzelzeilen und keine FRP —
  `HotspotRun.rows` ist leer; eine Liste „nach Stärke" wäre in diesem Zustand erfunden).

---

## 7. Bewusst nicht gebaut

| Nicht gebaut | Grund |
|---|---|
| Radius-Regler in der Oberfläche | §2.2 — verspricht Steuerbarkeit, die die Daten nicht hergeben (V-244) |
| Unterregion (Bundesland/Kanton) | §4 — neue Quelle, Massenabfrage, Nutzungsregeln (V-245) |
| Detailansicht/Aufklappen je Cluster | Auftrag: „bewusst schlank"; der Klick-Steckbrief der Detektion ist bereits die Detailebene |
| Trend/Tendenz je Cluster | Auftrag: keine Trendanalysen. `FireEvent.trend` bleibt, wo es ist |
| Cluster im Permalink | Auswahl ist ein Sitzungszustand, kein Ansichtszustand — ein Rang ändert sich mit jedem Überflug |
| Zeitliche Zerlegung der Cluster | §2.3 |
| Ortsfeste Cluster **ausblenden** oder ans Ende sortieren | §3.1 — die Regel aus F2 lautet „ausgegraut, nie ausgeblendet". Ein falsch eingeordnetes Feuer verschwände sonst aus der Liste, und die Sortierung wäre nicht mehr die nach Stärke, die der Auftrag verlangt |
| Virtualisierte Liste | §5 — ein handgeschriebener Virtualizer wäre deutlich mehr Code als die ganze Phase (D-06 verbietet die fertige Bibliothek). Der ausgesprochene Deckel löst dasselbe Problem in zehn Zeilen und sagt dem Nutzer, was er sieht |

---

## 8. Prüfmittel

Neu: `npm run verify:fire-clusters` (netzfrei, dependency-frei, gegen die echten Module):

* **(a) Kein zweites Clustering** — `fireClusters.ts` ohne eigenes Gitter/Union-Find/Distanzmaß,
  `spatialClusters` importiert; `buildFireEvents` mit Vorgabe-Radius **unverändert**
  (Regressionsanker gegen F2).
* **(b) Radius wirkt** — 2 500 m auseinander: bei 2 000 m zwei Cluster, bei 3 000 m einer.
* **(c) Einzelpunkt = eigener Cluster** (Auftrag), Hüllenfläche ohne Inhalt ⇒ „—".
* **(d) Hülle:** konvex, geschlossen, enthält alle Punkte; Fläche eines bekannten Rechtecks stimmt;
  kollineare Punkte ⇒ 0; Reihenfolge der Eingabe ändert nichts.
* **(e) Sortierung** nach ΣFRP, bei Gleichstand nach Detektionszahl.
* **(f) Ehrlichkeit:** kein „Brandfläche", kein „bestätigt", kein `Date.now()` (D-12) im Modul;
  die Hüllenfläche steht nie ohne ihren Hinweis; Notbetrieb erzeugt keine Rangliste.
* **(g) Verdrahtung:** eigene GL-Layer am Hotspot-Schalter, **kein** neuer Eintrag in `fireModel.ts`;
  Attribution folgt dem Provider; keine neue Runtime-Dependency (D-06).
* **(h) Mengengerüst:** 6 000 Detektionen unter 400 ms (dieselbe Schwelle wie `verify:fire-events`).
* **(i) Ortsfest-Vorbehalt:** Mehrheitsregel, Grau wertgleich zur Karte, ohne Einordnung kein
  Vorbehalt (V-222), ortsfeste Cluster bleiben in Liste und Rangfolge; Liste und Karte lesen
  **dieselbe** Schlüsselmenge.
* **(j) Deckel:** Kopfzeile nennt die volle Zahl, die Liste die gezeigte, ein Klick auf der Karte
  klappt bis zur markierten Zeile auf, ein Fensterwechsel setzt zurück.

Dazu unverändert grün: die elf bestehenden Feuer-Verifier, `npm run typecheck`, `npm run build`,
`npm run budget`.

---

## 9. Offene Punkte / Risiken

1. **Long Tasks konnten nicht gemessen werden.** Die Long-Task- und Event-Timing-API liefert über
   den verfügbaren Browser-Kanal keine Einträge — eine absichtlich erzeugte 260-ms-Blockade wurde
   ebenfalls **nicht** erfasst. Das Instrument ist hier unbrauchbar, nicht das Ergebnis „null Tasks".
   Ersatzweise gemessen: Klick → Zeile im DOM (s. §5) und die Rechenzeit headless. Die
   Grundlinie der Seite ist ohnehin vorbestehend rot (**V-239**).
2. **Mobile Verifikation** 390×844 — blockiert wie in WW1/WT1: Chrome nahm die Fenstergröße nicht
   an (Viewport blieb 1920×953). Die Liste erbt die 44-px-Regel über die bestehende Media-Query,
   live geprüft ist sie nicht.
3. **Ein Interaktionspfad ist nur im Code belegt, nicht live:** das Aufklappen der Liste, wenn ein
   Cluster **jenseits des Deckels** auf der Karte angeklickt wird. Am Ende der Sitzung lud die
   Basiskarte im Browser nicht mehr (`isStyleLoaded() === false`, auch in frischem Tab und mit
   Raster-Basiskarte, während der Style-Host aus derselben Maschine mit HTTP 200 antwortete) —
   ohne Karte kein Kartenklick. Verifier-Anker vorhanden; Nachholen bei nächster Gelegenheit.
4. **Budget:** `totalJs` 885,7 KB gegen die Ratsche 926,1 KB — grün, keine Anhebung nötig
   (**V-243**). `eagerJs`/`eagerCss` unverändert: die Liste liegt im Lazy-Chunk.
5. **`fireEvents.ts` bleibt der Eigentümer des Clusterings.** Wer dort den Vorgabe-Radius ändert,
   verschiebt F2 mit. Der Verifier hält beides getrennt fest.
