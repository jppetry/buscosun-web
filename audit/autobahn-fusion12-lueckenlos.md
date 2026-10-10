# Autobahnwetter — Phase AF: Streckenprognose lückenlos mit buscosun Fusion 12

> Stand 2026-10-10. Diagnose und Entwurf (Spezifikation) in §0–§7; **Umsetzungsprotokoll in §8** (AF-1 Merge §8.1, V-AF-9 Leser je
> Größe §8.3, V-AF-10 Anker vor dem Achsenbeginn §8.4 (E-AF-6 = Weg a, Jan 10.10.) — lokal, uncommittet, nichts gepusht). Vorgänger: `audit/autobahnwetter.md` §14–§18 (AW-6.1), `audit/obs-fusion.md`
> (Fusion 12, Branch `fusion-12`), `audit/fusion-release.md` (Register der Stände).

## 0. Kurzfassung für Jan

**Auftrag (10.10.):** „ab sofort für jeden Abschnitt jeder Autobahn eine Wetterprognose liefern, und zwar über buscosun
Fusion 12"; Änderungen an `buscosun-data` und `buscosun-archiv` sind erlaubt, wenn nötig.

**Was heute gilt (gemessen 10.10., §2):**

- Die Streckenprognose `road/fc/v1` rechnet live **buscosun Fusion 9** (Lauf `2610100804`: 4 569 Punkte, 141 Korridore,
  0 ohne Ergebnis, 63 s). Fusion 12 liegt nur auf dem lokalen Branch `fusion-12`; der Producer klont `main`.
- **32 von 120 Autobahn-Nummern haben keinen Korridor**, auf den übrigen 88 fehlen Teilstücke: ein Korridor entsteht nur,
  wo eine DWD-Glättemeldeanlage liegt, und Teilstücke unter 5 km fallen weg. An einem Korridor liegen heute **92,3 %** der
  DLM250-Autobahnachse.
- Die 2 755 Achspunkte rechnen ohne Messung. Fusion 12 **ist** der dichte Messungs-Anker; ohne ihn wäre „Fusion 12" an
  der Strecke in 0–48 h dieselbe Zahl wie Fusion 9.

**Was gebaut wird (deine Entscheidungen E-AF-1…4, §1):** Deutschland lückenlos in der bestehenden Form (Punkte alle
5 km, 0–48 h stündlich); `fusion-12` nach `main` (ganze Plattform auf Fusion 12), Push durch mich nach deinem Ja zum
fertigen Stand; der Producer liest den dichten Messsatz `obs/v1` und verankert jeden Punkt, sofort an, mit Rückweg
`ROAD_FC_DENSE=0` und begleitender Messung an einer Kontrollmenge.

**Sechs Etappen, je ein Gate (§3):** AF-1 Fusion 12 auf `main` · AF-2 Korridore lückenlos · AF-3 Punkte bauen und
einspielen · AF-4 dichter Anker im Producer · AF-5 Seite für Teilstücke ohne Messstelle · AF-6 begleitende Messung.

**Was sich nicht ändert:** Ablage `road/fc/v1/`, Schema der Laufdateien (nur additive Felder), Horizont, die 141
bestehenden Korridor-Kennungen, Fahrbahn und Glätte (bleiben Messung, AW-6.2 hinter Gate D), AT/CH (bleiben außen vor,
E-AW-12). Am Motor von buscosun Fusion ändert diese Phase nichts außer dem Merge selbst.

## 1. Entscheidungen (Jan, 10.10.2026, im Chat)

| Nr. | Frage | Entscheidung | Verworfen |
|---|---|---|---|
| E-AF-1 | Umfang von „jeder Abschnitt jeder Autobahn" | **DE lückenlos**: alle Autobahnen des DLM250, auch Teilstücke ohne Messstelle und unter 5 km; Form des Produkts bleibt | Abschnitte je Anschlussstelle; AT/CH |
| E-AF-2 | Weg von Fusion 12 in die Streckenprognose | **Merge `fusion-12` → `main`, Push durch Claude** nach Jans Ja zum fertigen Merge-Stand | Jan pusht selbst; nur der Producer auf dem Branch (widerspricht E-FR-1 „eine Nummer überall") |
| E-AF-3 | Messungs-Anker an den Autobahnpunkten | **sofort an, begleitend messen**; Rückweg `ROAD_FC_DENSE=0` | erst messen, dann einschalten; ohne dichten Anker |
| E-AF-4 | Entwurf | **freigegeben**, einschließlich Push ins Daten-Repo (drei statische Dateien, Workflow-Kopie) und Purge genau der drei statischen CDN-Pfade; Kontrollmenge im Archiv | einmalige Stichprobe ohne Kontrollmenge |

Annahmen dieser Spezifikation (nicht gefragt, aus dem Bestand übernommen): Wetter an der Strecke wie AW-6.1 (Luft,
Taupunkt, Niederschlag, Schnee-Anteil, Wind, Böen, Bewölkung), 0–48 h stündlich, Lage der Achspunkte auf der
OSM-Fahrbahn (E-AW-17).

## 2. Diagnose (10.10.2026, nur gelesen und gemessen)

| Nr. | Frage | Befund | Beleg |
|---|---|---|---|
| D-AF-1 | Mit welchem Stand rechnet die Streckenprognose? | `engine.name` „buscosun Fusion 9", `version` 9, Anker `swis` an 1 162 Stationspunkten, Achspunkte ohne Anker; Tabellen `0714300fe2a5`/`9d22ff35986f` | `road/fc/v1/index.json` über raw, 08:05 UTC |
| D-AF-2 | Wo liegt Fusion 12? | Branch `fusion-12` (`e503094`, 26 Commits vor der gemeinsamen Basis `6777973`, `main` 18 voraus), nicht auf `origin`. Register dort: Stände 10, 11, 12 an (`FUSION12_OBS_DENSE = 1`, `FUSION12_ANCHOR_SIGMA = 1`). `main`: Register endet bei 9 | `git branch -a`, `git show fusion-12:…/fusionRelease.ts` |
| D-AF-3 | Lässt sich der Branch mergen? | Probe-Merge ohne Arbeitsbaum: Konflikte nur in `.github/workflows/ci.yml`, `MANUELLE-SCHRITTE.md`, `budget.json`; `CLAUDE.md` und `package.json` mergen von selbst; im Quellcode kein Konflikt (11 Dateien unter `src/`, +1 607 Zeilen, davon `cubeSource.ts` +562, neu `obsStore.ts`, `longRange.ts`, `sigmaScale.ts`) | `git merge-tree --write-tree main fusion-12` |
| D-AF-4 | Was täte der Producer nach dem Merge ohne weitere Änderung? | `scripts/road/` ist auf dem Branch unverändert: `fusionStageIo()` setzte `obsDense`, der Producer reicht aber weiter `obs: null` (Achse) bzw. die eigene SWIS-Luft (Station). Der Lauf hieße „Fusion 12"; an Achspunkten rechnete er in 0–48 h wie Fusion 9 (Fusion 10/11 wirken erst über 48 h), an Stationspunkten käme die σ-Kopplung `anchorSigma` dazu | Diff `main...fusion-12 -- scripts/road src/road` leer; `road-forecast.mjs` Z. 131–142, 281–286 |
| D-AF-5 | Warum fehlen Autobahnen? | `build-corridors.mjs`: `sections()` verwirft Teilstücke < 5 km („ramps, junction stubs"), `buildCorridors` behält nur Abschnitte mit ≥ 1 Station (`built.filter((c) => c.stations.length > 0)`); Stichäste, die die Schleifen-Bereinigung abschneidet, werden nur mit eigener Station zu Abschnitten (V-AW-16) | Quelltext Z. 126, 360, 364–382 |
| D-AF-6 | Welche Autobahnen fehlen ganz? | **32 von 120** Nummern des DLM250: A 36 (154 km Achse), A 100 (61), A 26 (42), A 111 (39), A 115 (38), A 113 (33), A 448 (33), A 281 (25), A 555 (24), A 480 (23), A 270, A 445, A 995, A 656, A 114, A 524, A 562, A 117, A 369, A 516, A 980, A 659, A 544, A 542, A 226, A 571, A 103, A 672, A 255, A 392, A 831, A 695. Achs-km des DLM250 zählen getrennt geführte Fahrbahnen doppelt — sie sind kein Netz-km | `audit/autobahn-fusion12-lueckenlos/measure-roads.mjs` |
| D-AF-7 | Wie viel der Achse liegt an einem Korridor? | Abtastung der rohen DLM250-Achsen alle 500 m (44 382 Proben), „gedeckt" = Korridor-Linie in ≤ 300 m: **live 92,32 %**. Bauer ohne Stationsfilter (ohne OSM-Kürzung, heutige Meldung `2610100930`): ≥ 5 km 201 Korridore auf 117 Nummern, 96,83 % · ≥ 2 km 311 / 120 / 97,10 % · ≥ 1 km 563 / 120 / 97,22 % · ≥ 0,5 km 805 / 120 / 97,29 % | `measure-coverage.mjs` (gepatchte Kopie des Bauers im Scratch, Repo unberührt) |
| D-AF-8 | Was bleibt auch dann ungedeckt? | ≈ 600–700 km Achse (2,7–3,2 %), unabhängig von der Mindestlänge: A 485 19 km, A 602 17, A 98 17, A 281 16,5, A 650 15, A 8 27, A 1 24,5, A 9 23,5 … — Stücke, die `removeLoops` als Schleife oder Stichast abschneidet, und Rampen der Kreuze (Widmung 1301). Die Mindestlänge löst das nicht; die abgeschnittenen Äste müssen eigene Teilstücke werden | wie D-AF-7, letzte Zeile |
| D-AF-9 | Halten die Kennungen? | Bei reiner Neunummerierung behalten 123 von 141 Live-Korridoren Kennung, Länge und Stationszahl (der Rest unterscheidet sich durch die OSM-Kürzung von a14/a143 und die neuere Meldung). Kennungen stecken in geteilten Links (`st=a8@70`), in `where.json` und im Archiv ⇒ sie müssen aus der Live-Datei **festgeschrieben** werden, nicht neu vergeben | `measure-coverage.mjs`, Zeile „ids" |
| D-AF-10 | Was kostet es? | Achspunkte 2 755 (live) → ≈ 3 100–3 400 (+12 … +23 %); der Producer braucht heute 63 s für 4 569 Punkte (Job-Frist 25 min); Laufdateien ≈ 8,5 MB je Lauf ⇒ ≈ +1 MB | D-AF-7, `index.json` `ms` |
| D-AF-11 | Sind die Messungen für den dichten Anker da? | `obs/v1` liegt im selben Daten-Repo: `stations.json` 3 123 Stationen (DE 2 346, AT 289, CH 485, LI 3), `latest.json` 3 059 Einträge, 631 + 655 KB, `builtAt` 09:14:10 UTC bei Abruf 09:14:38; deutsche 10-min-Stempel meist 20 min alt (1 277 von 1 427 Einträgen mit Stempel), Größen einer Station können eigene Stempel tragen | raw-Abruf beider Dateien |
| D-AF-12 | Liest der Workflow `obs/v1`? | Nein: `road-fc.yml` checkt sparse `point`, `radar/img`, `road` aus | `scripts/road/workflow-road-fc.yml` Z. 68–72 |
| D-AF-13 | Gibt es reine Wahl- und Abbildungsfunktionen des Clients? | Ja, auf dem Branch: `parseObsCatalog`, `parseObsLatest`, `obsStoreOf`, `nearestObsStations` (`obsStore.ts`), `cubeObsOf` (`cubeSource.ts`), `OBS_DENSE_MAX = 12`, je Größe die `OBS_DENSE_ANCHOR_K = 6` besten. Der Producer kann denselben Satz aus zwei Dateien des Checkouts bilden, ohne Netz | Exportlisten beider Dateien |
| D-AF-14 | Trägt die Seite Korridore ohne Messstelle? | Der Leser verlangt nur `Array.isArray(c.stations)`; Band, Dock und Kopf zählen und zeigen `c.stations` und nehmen als Voreinstellung eine Station. Ein leerer Abschnitt bricht nichts, zeigt aber ein leeres Band und „0 Messpunkte"; Achs-Prognosepunkte sind schon wählbar (`st=<korridor>@<km>`) | `roadClient.ts` Z. 177, `RoadPage.tsx` Z. 166, 276, 352, `roadView.ts` Z. 171 |
| D-AF-15 | Vorgeschichte des Ankers an Achspunkten | V-AW-21 (04.10.): Nachbar-Anker aus SWIS brachte an Achspunkten keinen Gewinn, am Morgenlauf leicht schlechter. Der dichte Satz von Fusion 12 ist ein anderer (DWD-10-min-Netz, 12 Stationen, σ-Kopplung) und war im Prüfstand an Punkten ohne eigene Station besser als Fusion 9 (Index +1,55 %, G3 rot in 3 von 27 Zellen) — an der Strecke ist er nicht gemessen | `audit/autobahnwetter.md` §16, `audit/obs-fusion.md` §12 |

## 3. Entwurf

Weg: der bestehende Korridor-Bauer wird erweitert; kein zweites Produkt. Seite, Leser, `where.json`, Archiv und Wächter
kennen nur Korridore und Punkte und folgen ohne neue Schnittstelle.

### AF-1 Fusion 12 auf `main` (E-AF-2)

- Merge von `fusion-12` auf einem Hilfszweig in einem eigenen Worktree (eigenes `npm ci`, keine Junction). Jans offene
  Änderung an `src/MapView.tsx` und die Dateien der Sitzung RG im Haupt-Arbeitsbaum bleiben unberührt.
- Konflikte: `ci.yml` (beide Verifier-Listen), `MANUELLE-SCHRITTE.md` (beide Abschnitte, neu nummeriert),
  `budget.json` (Grenze neu gemessen, mit Notiz, nie `--update`).
- **Gate AF-1:** typecheck 0 · Build · Budget · `verify:fusion-release` (Register nennt 12 als aktuellen Stand) ·
  `verify:pv-cube` · `verify:point-client` · `verify:pv-fusion` · `verify:road-fc` · `verify:np0-fields` ·
  `verify:dashboard`. Zeitabhängige Prüfungen ((10s), (16)) gegen `main` gegengelesen.
- Danach **Jans Ja** zum fertigen Stand ⇒ Fast-Forward von `main`, Push. Wirkung von selbst: `repeatVerdict`
  überspringt keinen Lauf, dessen Vorgänger einen älteren Stand trägt ⇒ der nächste Lauf heißt „buscosun Fusion 12";
  Kartenfelder ebenso. Kontrolle: `verify-fusion-release.mjs --live`, `road-fc-check.mjs`.

### AF-2 Korridore lückenlos (`scripts/road/build-corridors.mjs`, E-AF-1)

- Neue Option `--gapless` (ohne sie baut der Bauer byte-gleich wie heute, `verify:road-contract` K6):
  1. Abschnitte ohne Station bleiben erhalten.
  2. Abgeschnittene Äste (`cuts`) ab der Mindestlänge werden eigene Teilstücke, auch ohne Station (heute nur mit).
  3. Mindestlänge `GAPLESS_MIN_KM` (`set`, Startwert 2 km aus D-AF-7: darunter kommen 250–500 Bruchstücke für
     +0,2 % Achse); kürzere Reste zählen als gedeckt, wenn ein Prognosepunkt derselben Nummer in ≤ 2,5 km liegt.
- **Kennungen festgeschrieben:** `--pin=<live corridors.json>` ordnet jedem neu gebauten Abschnitt die Live-Kennung
  zu, mit der er sich überwiegend deckt; neue Teilstücke werden dahinter nummeriert (`a8-5`, …), mit `gap: true`
  (Teilstück ohne Messstelle). Kein Live-Korridor verliert Kennung, Richtung oder km-Nullpunkt.
- Die Regel V-AW-22 gilt weiter: ohne OSM-Fahrbahn der eigenen Nummer auf ≥ 5 km kein Teilstück bzw. `unbuilt`.
- **Gate AF-2 (Vollständigkeit, neuer Block in `verify:road-contract`):** jede 500-m-Probe der DLM250-Achsen liegt
  ≤ 300 m an einem Korridor **oder** ≤ 2,5 km an einem Prognosepunkt derselben Nummer **oder** in einer benannten
  Ausnahme (`unbuilt`, Rampe eines Kreuzes). Zielwert ≥ 99,5 % der Proben; der Rest steht als Liste je Autobahn im
  Audit. Dazu: alle 120 Nummern mit ≥ 1 Korridor; 141/141 Live-Kennungen unverändert (Länge ± 0,1 km, Stationen
  gleich); Gegenprobe (Stationsfilter wieder an ⇒ Gate rot).

### AF-3 Punkte bauen und einspielen (`scripts/road/build-fc-points.mjs`)

- Achspunkte nach der bestehenden Regel (`roadFcAxisKms`: alle 5 km, Endpunkt ab 2,5 km Rest ⇒ jedes Teilstück hat
  mindestens einen Punkt bei km 0), eingerastet auf die OSM-Fahrbahn; Gelände und z0 je neuem Punkt vorab
  (`--geo-from` nimmt die bestehenden Einträge mit). Die Achspunkte der 141 Live-Korridore bleiben Kennung für
  Kennung, wo sie liegen (`axisFrom`).
- OSM-Auszug frisch von Overpass (abends überlastet ⇒ tagsüber, lokal gecacht).
- **Gate AF-3:** `verify:road-fc --data` auf den neuen Dateien · Volllauf des Producers lokal auf einem frischen
  Klon: 0 Punkte ohne Ergebnis, Laufzeit und Größe gemessen · Stichprobe der Lage gegen eine frische
  Overpass-Abfrage.
- **Einspielen (E-AF-4):** Paket mit `SHA256SUMS` unter `C:\dev\buscosun-road-publish\2026-10-10\`; Commit auf
  frischem `origin/main` mit temporärem Index (`read-tree` + `update-index --cacheinfo`), nur
  `road/v1/static/corridors.json`, `road/fc/v1/static/points.json`, `road/fc/v1/static/geo.json`, nie force, bei
  Wettlauf mit dem Radar-Commit neu bauen; Purge genau dieser drei `@main`-Pfade, danach sha256 am CDN = Paket.
  Reihenfolge: erst wenn AF-5 auf `main` liegt (sonst zeigt die Seite leere Bänder, D-AF-14).
- V-AW-39 (der Wiederholungsschutz sieht geänderte statische Dateien nicht) wird hier behoben: Blob-Hash von
  `points.json` in `engine`, verglichen in `repeatVerdict`.

### AF-4 Dichter Anker im Producer (`scripts/road/road-forecast.mjs`, E-AF-3)

- Der Producer bildet **einmal je Lauf** den Messsatz aus `obs/v1/stations.json` + `latest.json` des Checkouts
  (`parseObsCatalog`, `parseObsLatest`, `obsStoreOf`) und wählt je Punkt mit `nearestObsStations(…, { max:
  OBS_DENSE_MAX, dense: true, nowMs })`, abgebildet mit `cubeObsOf` — dieselben Funktionen wie der Browser, kein
  Nachbau. Kein Netzabruf.
- Achspunkt: der dichte Satz. Stationspunkt: der dichte Satz **plus** die eigene SWIS-Luft der vollen Stunde
  (Abstand 0, wie seit E-AW-30; die Filter aus M1–M5 bleiben).
- Schalter `ROAD_FC_DENSE_MODE` im Vertrag (`'all'` | `'none'`), Rückweg ohne Commit `ROAD_FC_DENSE=0`
  (Workflow-Variable) ⇒ exakt die Kette von AF-1. Fehlt `obs/v1` im Checkout oder ist `latest.json` älter als
  60 min, rechnet der Lauf ohne dichten Anker und **sagt es** (`engine.dense: 'none'` mit Grund).
- Laufdatei, additiv: `engine.dense` (`{ mode, builtAt, anchored, stations }`), je Punkt weiter `anc`; der Quelltext
  nennt den Messsatz nur, wenn der Lauf ihn benutzt hat. `repeatVerdict`: gleicher Stundenlauf mit gleichen
  Cube-Läufen bleibt eine Wiederholung (der Messsatz ändert sich alle paar Minuten — sonst rechnete jeder Auslöser).
- Der Vertrag `src/road/roadFc.ts` bleibt frei von Importen aus `src/pointForecast` und `src/sources` (V-AW-35: der
  Archiv-Job checkt nur `src/road` aus); die Messfunktionen importiert nur der Producer.
- Workflow-Vorlage: `obs/v1` in den Sparse-Checkout; Kopie nach `.github/workflows/road-fc.yml` im Daten-Repo.
- **Gate AF-4:** `verify:road-fc` neu: (a) der Messsatz des Producers an 20 Punkten = `nearestObsStations` + 
  `cubeObsOf` direkt auf einer Fixture aus echten `obs/v1`-Dateien, mit Negativkontrolle (andere Stunde ⇒ anderer
  Satz); (b) Datei = direkte Rechnung von buscosun Fusion am selben Punkt mit demselben Messsatz; (c)
  `ROAD_FC_DENSE=0` byte-gleich zum Lauf ohne die Änderung; (d) veraltete/fehlende `latest.json` ⇒ Lauf ohne Anker,
  benannt; (e) Workflow gegen Konstanten. Dazu `verify:road-archive` (Vertrag importfrei) und die Stichprobe aus
  AF-6 vor dem ersten Live-Lauf.

### AF-5 Seite (`src/road/`)

- Teilstück ohne Messstelle: Band nur mit der Zeile „Prognose Luft" und den Achspunkten; Kopf „keine Messstelle an
  diesem Abschnitt · Prognose ‹Name aus der Laufdatei›" statt „0 Messpunkte"; Voreinstellung = erster Achspunkt;
  Karte zeichnet die Linie in der Prognose-Farbe, nie in einer Fahrbahn-Klasse (D-04: keine Daten ≠ trocken).
- Dock: Teilstücke mit `gap: true` unter der bestehenden Falt-Zeile je Autobahn (V-AW-9); Autobahnen, die nur aus
  solchen bestehen (die 32 neuen), bekommen eine eigene Zeile mit „nur Prognose".
- Der Zusatz „ohne Messungs-Anker" erscheint nur, wenn die Laufdatei es so sagt; mit `engine.dense` nennt der
  Quellen-Reiter den Messsatz und seinen Stempel.
- Command-Deck, Breakpoints 767/1439, keine neue Farbe außerhalb der Prognose-Token.
- **Gate AF-5:** `verify:road-ui` neu (Teilstück ohne Messstelle Desktop + mobil, Lauf mit/ohne `engine.dense`,
  Autobahn nur aus Teilstücken), bestehende Prüfungen unverändert grün; Pixel-Diff der Seite auf einem
  Live-Korridor gegen `main` (nur benannte Abweichungen); die fünf Selbstverifikations-Fragen mit Beleg; Budget.

### AF-6 Begleitende Messung (E-AF-3, E-AF-4)

- **Stichprobe vor dem Einschalten (ein Fall, keine Messung — so benannt):** eine Ausgabezeit, ≈ 1 000 Stationen
  gerechnet wie ein Achspunkt (ohne eigene SWIS-Luft), mit und ohne dichten Satz, gegen die gemessene SWIS-Luft
  +1…+3 h. Sie entscheidet nichts; sie soll einen groben Fehler der Verdrahtung zeigen (Bias, Einheiten, Stempel).
- **Kontrollmenge:** feste Auswahl von ≈ 150 Autobahn-Stationen (Kennung-Hash, stabil), in jedem Lauf zusätzlich
  zweimal „wie ein Achspunkt" gerechnet — Variante D (dichter Satz, ohne eigene Messung) und Variante N (ohne
  Anker). Ablage nur im Archiv (`buscosun-archiv/road/fc/v1/<tag>/<lauf>.json.gz`, Block `ctl`), nicht im Frontend.
  ≈ +3 % Rechenzeit.
- **Regel, vor den Zahlen festgeschrieben:** Wahrheit = gemessene SWIS-Luft und -Taupunkt der vollen Stunde, die
  die harten Regeln besteht. Größen T und Td; Vorlauf-Bins 1–3 h, 4–6 h, 7–24 h. Maß: MAE je Ausgabezeit und Bin,
  gepaart D − N. Auswertung frühestens nach **8 Ausgabezeiten an ≥ 3 Tagen**, darunter ≥ 2 Morgenläufe
  (04–07 UTC, Lehre V-AW-32). Test: t-Test über die Ausgabezeiten (Block = Ausgabezeit), zweiseitig, 5 %.
  - D in einem Bin signifikant schlechter ⇒ `ROAD_FC_DENSE=0` und Meldung an Jan (Rückweg ohne Commit).
  - D signifikant besser oder gleichauf in allen Bins ⇒ bleibt an; Zahlen in dieses Dokument.
  - Die Regel wird nach dem ersten Blick auf die Zahlen nicht mehr geändert; Hash dieses Abschnitts in
    `audit/autobahn-fusion12-lueckenlos/regel.sha256` vor dem ersten Live-Lauf.
- Skript `scripts/road/road-fc-control-score.mjs` (liest nur das Archiv).

## 4. Reihenfolge und Wirkung

| Schritt | Wirkung für den Besucher |
|---|---|
| AF-1 gepusht | ganze Plattform rechnet Fusion 12; Streckenprognose heißt ab dem nächsten Lauf „buscosun Fusion 12" (Stationspunkte mit σ-Kopplung, Achspunkte ohne Messung — die Seite sagt es) |
| AF-5 gepusht | nichts sichtbar (es gibt noch kein Teilstück ohne Messstelle) |
| AF-2 + AF-3 eingespielt | jede Autobahn in der Liste, jedes Teilstück mit Prognosepunkten |
| AF-4 gepusht + Workflow-Kopie | jeder Punkt mit dem dichten Messsatz verankert |
| AF-6 | laufende Zahl, ob der Anker an der Strecke hilft; Abschalten nach Regel |

## 5. Rückwege

| Was | Rückweg |
|---|---|
| Fusion 12 an der Strecke | Register-Wert `FUSION12_OBS_DENSE = 0` (ganze Plattform = Fusion 11) — Jans Entscheidung |
| dichter Anker im Producer | Repo-Variable `ROAD_FC_DENSE=0`, wirkt im nächsten Lauf, ohne Commit |
| neue Korridore/Punkte | die drei Dateien des Pakets vom 07.10. wieder einspielen (liegen mit Prüfsummen vor) |
| Streckenprognose ganz | `ROAD_FC=0` (bestehend) |

## 6. Jans Gates

1. Durchsicht dieses Dokuments und des Umsetzungsplans.
2. Ja zum fertigen Stand jeder Etappe, die `main` ändert (AF-1 Merge, AF-4 Producer, AF-5 Seite) — erst danach Push
   von `main` durch Claude (E-AF-2). Commits entstehen erst auf dieses Ja.
3. Real-Device der Seite nach AF-5 (WebGL-Karte, mobil).
4. Ergebnis der Kontrollmenge (AF-6), falls die Regel abschaltet.

Im Entwurf schon freigegeben (E-AF-4): Push der drei statischen Dateien und der Workflow-Kopie ins Daten-Repo, Purge
der drei statischen CDN-Pfade, der Block `ctl` im Archiv.

## 7. Befunde und Verbesserungen (V-AF)

| Nr. | Befund | Mehrwert | Skizze |
|---|---|---|---|
| V-AF-1 | Fusion 12 an Achspunkten ist ohne Messsatz nur ein Name (D-AF-4) | die Zahl hinter dem Namen stimmt | AF-4 |
| V-AF-2 | ≈ 3 % der Achse schneidet die Schleifen-Bereinigung weg (D-AF-8) | keine Autobahn mit Loch im Band | AF-2 Punkt 2; Rest als Liste |
| V-AF-3 | Die DWD-Messungen in `obs/v1` sind meist 20 min alt (D-AF-11, V-OF-3) | frischere erste Stunde | Synop-Strom im Spiegel — Phase OF, nicht hier |
| V-AF-4 | Kennungen hängen an der Sortierung nach Stationszahl; jede neue Meldung kann sie verschieben (D-AF-9) | geteilte Links bleiben richtig | `--pin` wird der Normalweg jedes Neubaus |
| V-AF-5 | Der Prüfstand-Champion bleibt Fusion 9 (E-OF-7); Fusion 12 hat kein Spur-P-Urteil | Klarheit, was „Fusion 12" belegt | Abnahme ab ≈ 20.10. (E-OF-6), unabhängig von dieser Phase |
| V-AF-6 | AT/CH ohne Korridore und Prognosepunkte (E-AW-12) | A 8 endet nicht an der Grenze | eigene Phase (Achsen GIP.at/OSM, Radar INCA/RZC) |
| V-AF-7 … V-AF-17 | aus der Umsetzung: V-AF-7/8 in §8.1, V-AF-9 (Leser las nur den jüngsten Stationsstempel — behoben, §8.3), V-AF-10 (Motor paarte die deutsche Temperatur zum Stundenanfang nicht — behoben mit E-AF-6 Weg a, §8.4), V-AF-11 … 17 in §8.3.9, V-AF-18 … 20 in §8.4.6 | | |

## 8. Protokoll

### 8.1 AF-1 — Fusion 12 auf `main` (10.10.2026; Jan: „es ist commited, schalte es jetzt auch aktiv")

Jans Commit `646142b` trägt diese Spezifikation; sein Satz gilt hier als Ja zur Umsetzung und — bei grünen Gates — zum
Push von AF-1 (E-AF-2). Merge von `fusion-12` (`e503094`) in einem eigenen Worktree auf dem Hilfszweig
`af/merge-fusion-12`, Merge-Commit `b9765a0`. Konflikte wie in D-AF-3 vorhergesagt: `ci.yml` (beide Verifier-Listen),
`MANUELLE-SCHRITTE.md` (beide Abschnitte; der OF-Abschnitt des Branches heißt jetzt §60, die Verweise „§48.9/§48.10" in
`audit/obs-fusion.md` meinen ihn), `budget.json` (Grenzen von `main`; totalJs 1 699 → **1 712**, gemessen 1 710,0 =
`main` 1 697,1 + 12,9 KB, alles lazy; die drei Notizen des Branches übernommen).

| Gate (gemergter Stand, PowerShell, ohne `2>&1`) | Ergebnis |
|---|---|
| `npm run typecheck` | 0 Fehler |
| Build | grün, `verify-routing` 255/255 |
| `npm run budget` | grün: eagerJs 109,3 / 109,4 · totalJs 1 710 / **1 712** · largestChunk 278,4 |
| `verify:fusion-release` | **30/30**, „neuester Stand buscosun Fusion 12" |
| `verify:pv-fusion` · `verify:obs-reader` · `verify:calib-fit` · `verify:fusion-fit` | 235/235 · 41/41 · 14/14 · grün |
| `verify:road-fc` · `road-contract` · `road-archive` | 103/103 · 93/93 · 26/26 |
| `verify:pv-cube` | 440/441 — rot nur **(21)**; auf `main` (`646142b`) im selben Durchgang 422/424 mit (21) und der Zeitprüfung (11). Im ersten Lauf unter Last zusätzlich (4)/(12)/(14)/(16) (Zeit, V-FR-8) |
| `verify:point-client` | 177/178 — (10s) zeitabhängig (V-EX-13) |
| `verify:np0-fields` | 32/33 — B14 (Zustand des lokalen Daten-Klons, V-RC-4, auf `main` gleich) |
| `verify:punktarchiv` · `point-data` · `precip-sums` · `regenchance` · `rain-window` · `height-time` · `snowcap` | 165/165 · 1016/1016 · 57 (2 ausgelassen) · 44/44 · 63/63 · 58/58 · 56/56 |
| `verify:sea-derive` | nicht gewertet: lief nach 20 min CPU noch (abgebrochen); `scripts/sea` und `src/sea` sind im Merge unverändert, der Verifier ruft den Motor nicht |

**Probelauf des Producers** (gemergter Code, frischer sparse Klon des Daten-Repos `00519d6`, ohne `--publish`):
300 Achspunkte 300/300, 0 ohne Ergebnis, 37 s; 41 Stationspunkte 41/41, 24 mit eigener SWIS-Luft verankert;
`engine`: `{"name":"buscosun Fusion 12","version":12,"stage":"fs",…}`, Tabellen `0714300fe2a5`/`9d22ff35986f`/`85d73cead2cb`
wie live. Achspunkte bis AF-4 ohne Messung (D-AF-4) — der Lauf sagt „Anker keiner".

| Nr. | Befund | Mehrwert | Skizze |
|---|---|---|---|
| V-AF-7 | `verify:pv-cube` (21) ist auf `main` rot: `src/nowcast/heightTime/heightTimeModel.ts` (Phase HZS) importiert `profileColumn`, die Prüfung aus AP15 verbietet jeden Import unter `src/` | CI auf `main` wieder grün | Prüfung auf den Motor (`src/pointForecast/`) eingrenzen — der Schnitt rechnet die Nullgradgrenze ausdrücklich außerhalb von buscosun Fusion; Jans Gate (Fusion-Linie) |
| V-AF-8 | `verify:sea-derive` braucht auf dieser Maschine > 20 min CPU | Gate wieder benutzbar | Laufzeit am Stand `main` messen, langsamen Block suchen (Phase SW) |

### 8.3 V-AF-9 — die jüngste Messung je Größe aus `obs/v1` (10.10.2026; Auftrag: Behebung vor der Freigabe von buscosun Fusion 12)

Arbeitsbaum `.wt-af`, Zweig `af/merge-fusion-12`. Nichts gepusht, nichts ins Daten-Repo kopiert.

#### 8.3.1 Diagnose (vor dem Code)

**Der Befund ist kein Zufall, er folgt einer festen Uhr.**

1. Der DWD veröffentlicht die 10-min-„now“-Dateien gestaffelt (`audit/stationsmessungen.md` §1.2, gemessen 07.10.): Niederschlag
   um :10/:40, Wind/Böen/Sonne um :15/:45, Temperatur (TT/RF/TD/PP) um :20/:50. Bis die Temperaturdatei kommt, trägt die
   Niederschlagsdatei einen ≈ 30 min jüngeren Stempel.
2. Der Spiegel veröffentlicht nach jeder Teillieferung neu. `latestDoc()` (`scripts/obs/obs-mirror.mjs`) setzt den Stationsstempel
   `t` auf den jüngsten Stempel über ALLE Größen; was dort fehlt, steht mit eigenem Stempel unter `older` — aber nur, wenn es
   höchstens 60 min älter ist.
3. `obsPointOf()` (`src/sources/obsStore.ts`) liest nur `v` („one stamp per station“) ⇒ Temperatur `null`.
4. Im dichten Satz behält `nearestObsStations()` die reinen Niederschlagseinträge, die Liste ist also nie leer.
   `fetchNearestStationObs()` (`src/pointForecast/sampleSources.ts`) fällt nur bei einer LEEREN Liste oder einem Fehler auf die
   Adapter zurück ⇒ BrightSky springt nie ein.

**Eigene Zählung an den sieben gesicherten Versionen** (`obs-fixtures/count-stamps.mjs`; Dateien aus der Git-Historie des
Daten-Repos, `obs-fixtures/SOURCES.md` + `SHA256SUMS`; DE = 1 427 Einträge mit 10-min-Stempel, davon 462 mit Temperatur, 275–276
mit Wind, ≈ 965 reine Niederschlagsstationen):

| Version (Commit, `builtAt` UTC) | Fenster | T am Stempel | T in `older` (Rückstand) | Wind am Stempel | Wind in `older` | rr in `older` | Stempel je Station 1 / 2 / 3 |
|---|---|---|---|---|---|---|---|
| `574ef48` 10:21:29 | gut | **462** | 0 | 275 | 1 (50 min) | 22 (10 min) | 1 404 / 23 / 0 |
| `fa2ca00` 10:40:45 | schlecht | **5** | 457 (435 × 30 min, 22 × 20 min) | 72 | 203 | 0 | 970 / 457 / 0 |
| `00519d6` 10:44:20 | schlecht | **5** | 457 (wie oben) | 72 | 203 | 0 | 970 / 457 / 0 |
| `9aa64bf` 10:46:19 | schlecht | **2** | 460 (459 × 30 min) | 274 | 1 | 21 (10 min) | 967 / 438 / **22** |
| `13d3b58` 11:11:39 | schlecht | **5** | 457 | 72 | 203 | 0 | 970 / 456 / 1 |
| `9f46fab` 11:16:11 | schlecht | **2** | 460 (455 × 30, 3 × 40 min) | 274 | 2 | 22 | 967 / 436 / **24** |
| `a5552f2` 11:21:31 | gut | **462** | 0 | 274 | 2 (50 min) | 22 | 1 403 / 24 / 0 |

Lesart: zwischen der Niederschlags- und der Temperaturlieferung (jede halbe Stunde ≈ 10 min lang, :11–:21 und :41–:51) tragen
**2–5 von 462** deutschen Temperaturstationen die Temperatur am Stempel; die übrigen 457–460 führen sie 30 min älter unter `older`.
Der Wind fehlt im ersten Teil des Fensters ebenfalls (72 von 275), im zweiten nicht mehr (274).

**Was über den Auftrag hinaus auffiel:**

- **Bis zu DREI Stempel je Station.** Im zweiten Teil des schlechten Fensters (Wind schon da, Temperatur noch nicht) tragen 22–24
  Stationen drei Stempel: Wind am Stationsstempel, Niederschlag 10 min älter, Temperatur 30 min älter. „Bis zu zwei Messungen je
  Station“ reicht dort nicht; der Leser gruppiert deshalb nach Stempel (eine Messung je Stempel).
- **Der umgekehrte Fall besteht in JEDER Version, auch im guten Fenster:** 21–22 deutsche Stationen führen `rr` 10 min hinter dem
  Stempel (dort ist dichtes `rr10` heute `null`), dazu 1–2 Stationen mit Wind 50 min hinter dem Stempel. In der Schweiz stehen in
  jeder Version 14–39 Stationen mit `rr` 10–30 min hinter dem Stempel; Österreich hat keinen `older`-Eintrag. „Im guten Fenster
  byte-gleich“ gilt deshalb für alle Stationen OHNE `older`-Eintrag; an den genannten Stationen kommt genau die Messung hinzu, die
  heute fehlt (§8.3.3, Prüfung A4).
- **Alter der Temperatur in DE:** München-Stadt trägt um 10:21 den Stempel 09:50 (31 min alt), um 10:44 denselben Wert (54 min).
  Die Temperatur aus `obs/v1` ist in Deutschland 30–60 min alt (V-OF-3); der neue Leser macht daraus keinen jüngeren Wert, er
  reicht ihn nur weiter.
- **Der Live-Pfad** (`pointForecast.ts`, Rückfall des Panels und `?pf=live`) ruft denselben Leser ohne dichten Satz: dort blieben
  im schlechten Fenster nur Stationen mit Wind oder eine der 2–5 Temperaturstationen übrig.

Fixtures: `obs-fixtures/full/<commit7>.{latest,stations}.json.gz` (14 Dateien, 884 KB) für die Wiederholung (§8.3.4 B, nicht in
CI); für CI der echte Auszug `scripts/lib/fixtures/obs-v1-vaf9.json` (688 Stationen im Umkreis von 60 km um München, Berlin,
Hamburg, Frankfurt, Stuttgart, Dresden, Wien, Zürich aus `00519d6` und `574ef48`, dazu 17 Stationen mit `rr` in `older`;
ausgeschnitten, kein Wert geändert — `obs-fixtures/make-fixtures.mjs`).

#### 8.3.2 Entwurf und Umsetzung

**Regel:** jede Größe einer Station kommt aus ihrer jüngsten verfügbaren Messung und behält ihren eigenen Stempel. Kein Wert wird auf
einen fremden Stempel gelegt.

| Stufe | Wo | Was |
|---|---|---|
| Größe auflösen | `obsStore.ts obsVarsOf` | je Größe (`t`, `rh`, `td`, `ff`, `dd`, `fx`, `rr`): Wert am Stationsstempel `t`, sonst `older[größe]` mit EIGENEM Stempel, wenn dieser älter als `t` ist und gegen die Uhr des Lesers höchstens `OBS_VAR_MAX_AGE_MS` = **90 min** (`set`: 30 min Rückstand + zwei ausgefallene Lieferungen) |
| Teile bilden | `obsOlderPartsOf` | die Größen aus `older` nach Stempel gruppiert — EIN Teil je Stempel (jüngster zuerst), jeder nur mit den Größen dieses Stempels; Wind braucht Geschwindigkeit und Richtung desselben Stempels |
| Stationen wählen | `nearestObsStations({ perVar: 'split' })` | weiterhin EIN Eintrag je Station, aufsteigend nach Abstand; „voll“ = T/Wind/Böe/Feuchte am Stempel ODER in einem Teil; `point` bleibt der Stand am Stationsstempel (wie vor V-AF-9), die älteren Stempel hängen als `parts` am Eintrag. Ohne `perVar` Byte für Byte der Leser vor V-AF-9 |
| zum Motor | `cubeSource.ts cubeObsOf` (die Abbildung VOR dem Motor) | je Station eine `CubeObs` je Stempel: zuerst der Stationsstempel, dann die Teile; `validAtMs` = der Stempel der Größen. Ein Stationsstempel ohne lesbare Größe ergibt keine leere Messung. Ohne `parts` exakt die Abbildung von vorher |
| Live-Pfad, Anzeige | `nearestObsStations({ perVar: 'merge' })`, `obsGridOf`, `obsStationFeatures`, `obsStationLive` (`obsMergedOf`) | Verbraucher, die eine Station als „jetzt“ nehmen und keine zwei Stempel tragen können: EIN Punkt mit dem jüngsten Wert je Größe; die Karten-Stationen und das Popup nennen `obsAt` und die eigene Zeit jedes Werts, der nicht am Stempel gemessen ist (`temperatureAt`, `windAt`, `precipitationAt`; Popup: „12,1 °C · 11:50 Uhr“) |
| Rückfall je Größe | `sampleSources.ts fetchNearestStationObs` | Reihenfolge je Größe: (1) Wert am Stempel → (2) `older` innerhalb der Grenze → (3) trägt KEINE Station des Satzes eine Temperatur (nur DE): die zwei gezielten BrightSky-Anfragen (`brightSkyAtPoint`: Station des Punkts + nächste Station) mit eigener Frist von 800 ms (`set` — eine langsame Antwort darf die Stationen des Produkts nicht kosten), übernommen wird NUR die Temperatur, `via: 'bs-var'` → (4) sonst kein Anker für die Größe, der Vermerk sagt es |
| veraltetes Produkt | ebenda | `latest.json.builtAt` älter als `OBS_PRODUCT_MAX_AGE_MS` = **30 min** (`set`; der Spiegel veröffentlicht mindestens alle ≈ 10 min) ⇒ wie ein Fehler: Direktabruf; der Vermerk des Motors sagt „Rückfall, obs/v1 nicht lesbar oder ohne aktuelle Station oder älter als 30 min“ (die Minutenzahl steht nur in `onNote` des Abrufers, den der Cube-Pfad nicht durchreicht) |
| Vermerk | `cubeSource.ts obsNoteOf` | `obsPerVar:set — je Größe der jüngste Wert der Station mit eigenem Stempel (aus „older“ höchstens 90 min alt, V-AF-9): n Station(en), davon k mit Messungen an mehr als einem Stempel` — nur, wenn die Messungen selbst es zeigen (k > 0; ein eigener `io.obs` eines Aufrufers kann anders gelesen haben); dazu der BrightSky-Satz und je fehlender Größe „keine Temperatur-/Wind-/Böenmessung im Satz … kein …-Anker“ |
| Schalter | `pfFlags.ts pfObsVarFrom`, `CubeIo.obsPerVar`, `CubeObsFetchOptions.perVar`, `NearestObsOptions.perVar` | **`?obsvar=0`** = exakt der Leser vor V-AF-9 (nur die Werte am Stationsstempel, keine Altersprüfung des Produkts, kein Rückfall je Größe); voreingestellt AN; im Cache-Schlüssel (`obsvar0`) |

**Der Motor (`fuseCubePoint`) ist nicht geändert.** In `cubeSource.ts` sind nur die Abbildung `cubeObsOf`, der Abrufer `fetchCubeObs`, die
Vermerk-Funktion `obsNoteOf`, der Typ `CubeObs.via`, `CubeIo.obsPerVar` und der Cache-Schlüssel berührt (alles vor bzw. neben dem Motor).

**Zuordnung zum Stand:** der neue Leser gehört zu **buscosun Fusion 12** (noch nicht veröffentlicht; im Register nennen ihn das Feld
`ref` des Stands 12 und der Kommentar über `FUSION12_OBS_DENSE`). In der Stufen-NOTIZ des Motors steht er absichtlich nicht: sie gilt
für jeden Lauf des Stands, auch hinter `?obsvar=0`, `?obs=direct` und in Datenprodukten ohne Messung — was gelesen wurde, sagt je Lauf
der Vermerk des Lesers. Der Prüfstand-Kandidat `fusion-12s` sah in der Wiederholung jede Größe an ihrem
Stempel (das Replay baut den Messsatz aus den Originalen, nicht aus `latest.json`) — der neue Leser stellt in der Produktion her, was
dort gemessen wurde. Der Schalter wirkt unabhängig von `?dense=0`: auch die sechs vollen Stationen (Fusion 11) lesen je Größe.

**Die Fallen des Auftrags, je mit Befund:**

- **a) Entdopplung (`nearestStationList`, `keyOf`):** liegt nur auf dem Direktabruf; eine geteilte Station ist EIN Listeneintrag mit
  `parts` und kann dort weder herausfallen noch zusammengelegt werden (Prüfung 14).
- **b) `anchorDenseAllow`:** wählt je Größe unter den `CubeObs`, die die Größe tragen. Jede Größe einer Station steht in genau einer
  ihrer Messungen ⇒ eine Station zählt je Größe höchstens einmal (Prüfung 14, an 16 Punkt-Sätzen).
- **c) Stationswert (jüngste T-Messung, dann `byStation`, dann Nähe):** gemessen an den 2 755 Achspunkten und 20 Stadtpunkten über alle
  sieben Versionen (§8.3.4 B). **Deutschland: an keinem Punkt eine andere Station als im guten Fenster** (339 bzw. 337 Achspunkte mit
  Wahl, 0 Abweichungen). An zwei österreichischen Stadtpunkten wechselt die Station zwischen den Versionen (Wien `11034` 1,2 km ↔
  `11035` 4,7 km; Innsbruck) — beim Leser vor V-AF-9 genauso (in derselben Version neu = alt an jedem Punkt): die TAWES-Stationen
  liefern um 10 min versetzt, und die Regel „jüngste zuerst“ zieht die fernere Station vor. Das ist bestehendes Verhalten des Motors,
  nicht Folge dieses Auftrags ⇒ **V-AF-11**, kein Stopp.
- **d) dichtes `rr10`/`rr1h`:** `rr10` reist mit dem Stempel des Niederschlags (behebt den umgekehrten Fall, Prüfung 17). `rr1h` bleibt
  am Stationsstempel — der Spiegel summiert bis dorthin; im umgekehrten Fall ist die Summe unvollständig (5 von 6) und der
  Messgerät–Radar-Faktor nimmt sie wie bisher nicht.

**Abweichungen vom Auftrag (bewusst, jede benannt):**

1. **Bis zu drei Messungen je Station** statt „bis zu zwei“ (22–24 Stationen im zweiten Teil des schlechten Fensters, §8.3.1). Zwei
   Messungen hätten dort eine Größe auf einen fremden Stempel gelegt.
2. **Rückfall je Größe nur für die Temperatur** (`OBS_VAR_FALLBACK`). Kein Wind im dichten Satz ist an ≈ 4 % der Achspunkte der
   Normalzustand in JEDEM Fenster (275 Windstationen); ein Wind-Rückfall wäre dort eine Dauerlast beim Anbieter und eine Änderung des
   gemessenen Stands ⇒ **V-AF-12**, Jans Entscheidung. Auch der Temperatur-Rückfall greift im guten Fenster: an 16–19 der 2 755
   Achspunkte (0,6–0,7 %) trägt keine der 12 nächsten Stationen eine Temperatur — dort holt der Browser jetzt zwei BrightSky-Anfragen
   (der Producer der Streckenprognose liest aus dem Klon und holt nichts).
3. **„Im guten Fenster byte-gleich“** gilt an jedem Punkt für die Stationen, ihre Reihenfolge und ihre Messungen am Stempel (Liste ohne
   `parts` byte-gleich). Wo der Satz eine Station des umgekehrten Falls enthält, kommt deren `rr10`-Messung hinzu (das ist der
   verlangte Punkt d) — im Auszug an 96 von 522 Punkten.
4. **Der Live-Pfad** (`pointForecast.ts`) liest mit `merge` (ein Punkt je Station) — nicht im Auftrag genannt, aber derselbe Leser und
   derselbe Ausfall; hinter `?obsvar=0` wie vorher. Der dichte Satz (er geht zum Motor) liest ohne Angabe immer `split`, nie `merge`.
5. **Mit dem Rückfall je Größe ist die Liste bis zu zwei Einträge länger** als `maxStations` (die BrightSky-Station kommt hinzu, keine
   Station des Produkts fällt heraus).

#### 8.3.3 Prüfung A — `verify:obs-reader` (neu gezählt: **70/70**, davon 29 neue Prüfungen in den Blöcken 12–19; mit `--live` 73/73)

Neue Blöcke in `scripts/lib/obsReaderVaf9.mjs`, am echten Auszug (`00519d6` schlecht, `574ef48` gut); die Blöcke 1–11 unverändert grün.

| Block | Aussage | Zahl |
|---|---|---|
| 12 | schlechtes Fenster: deutsche Stationen mit T (am Stempel oder in `older`) liefern eine T-Messung mit `validAtMs` = Stempel der Temperatur | **116/116 = 100 %** (115 aus `older`) |
| 12 | Negativkontrolle: Leser vor V-AF-9 an denselben Stationen | 1/116 = 0,9 % |
| 12 | München-Stadt 10:44: zwei Messungen — 10:20 `rr10` 0,03 (ohne T/Wind), 09:50 T 12,1 °C mit Feuchte, Taupunkt, Wind, Böe (ohne `rr10`) | ✓ |
| 13 | Stempeltreue, beide Fenster, alle Länder des Auszugs, gegen die rohen Einträge geprüft (auch: `rr1h` nur an der Messung des Stationsstempels) | 1 040 Messungen, **0 Verstöße** |
| 13 | Negativkontrolle: absichtlich falsche Zusammenführung (T auf dem Niederschlagsstempel) | 498 Verstöße an 144 Stationen |
| 14 | keine Doppelzählung je Station und Größe (T, Wind, Böe, `rr10`, `rr1h`); `anchorDenseAllow` ohne doppelte Station; Entdopplung lässt geteilte Stationen stehen | 16 Punkt-Sätze, höchste Zahl 1 |
| 15 | gutes Fenster: an JEDEM Punkt dieselben Stationen, Reihenfolge und Messungen am Stempel (dichter Satz und sechs volle Stationen) | 522/522 Punkte |
| 15 | … ganze Ausgabe byte-gleich, wo der Satz keine Station mit `older` enthält; im Auszug ist jede Zusatzmessung der übrigen Punkte eine reine Niederschlagsmessung des umgekehrten Falls (in den vollen Versionen dazu 1–2 Stationen mit Wind 50 min hinter dem Stempel) | 426 byte-gleich, 96 mit Zusatzmessung; 222/222 Zusatzmessungen nur `rr` |
| 16 | Altersgrenze 90 min: genau an der Grenze benutzt, eine Minute älter nicht (in `obsVarsOf` und in der Stationsliste) | ✓ |
| 17 | umgekehrter Fall: `rr` nur in `older` ⇒ dichtes `rr10` mit dem Stempel des Niederschlags; vorher `null` | 22/22 Stationen |
| 18 | Satz ohne Temperatur ⇒ genau 2 BrightSky-Anfragen, nur T übernommen, `via bs-var`; Satz mit T ⇒ 0; Leser vor V-AF-9 ⇒ 0 (Negativkontrolle) | 2 / 0 / 0 Anfragen |
| 18 | veraltetes Produkt (31 min) ⇒ Direktabruf mit Vermerk „latest.json ist 31 min alt (Grenze 30 min) — Direktabruf“; genau 30 min ⇒ Produkt; Produkt 500 ⇒ wie bisher | 22 / 0 / 22 Anfragen |
| 18 | BrightSky antwortet nicht ⇒ der Rückfall bricht nach 800 ms ab (`OBS_VAR_FALLBACK_TIMEOUT_MS`, `set`), die 12 Stationen des Produkts bleiben | 856 ms |
| 18 | Voreinstellung: Live-Pfad `merge` (ein Punkt je Station); mit `dense` (der Satz des Motors) immer `split` — keine Temperatur von 09:50 auf dem Stempel 10:20 | ✓ |
| 19 | Karte im schlechten Fenster geladen, Klick im guten: die ältere Zeitangabe bleibt nicht neben dem neuen Wert stehen | ✓ |
| 19 | Popup: T und Wind mit eigener Zeit im schlechten Fenster, ohne Zusatz im guten; Raster der Rasterfusion T-Stationen 1 → 116; Karten-Stationen gleiche Zahl; Schalter und Cache-Schlüssel | ✓ |
| 19 `--live` | Anteil der deutschen Temperaturstationen mit Wert (Grenze 95 %): 13:51 UTC im schlechten Fenster / 14:51 UTC im guten | **461/461** (am Stempel 2, aus `older` 459) / 462/462 (alle am Stempel) |

#### 8.3.4 Prüfung B — Wiederholung über die echte Historie (`replay-obs-reader.mjs`, nicht in CI)

Alle sieben gesicherten Versionen, 2 755 Achspunkte aus `road/fc/v1/static/points.json` und 20 Stadtpunkte (16 DE, Wien, Innsbruck,
Zürich, Bern); dichter Satz (12 Stationen), Uhr = `builtAt` der Version.

| Version | Fenster | Leser | Achspunkte mit T | nächste T-Station km p50 / p90 | Alter dieser T min p50 / p90 | Achspunkte mit Wind | Städte mit T |
|---|---|---|---|---|---|---|---|
| `574ef48` 10:21 | gut | vor V-AF-9 | 99,4 % | 11,0 / 19,6 | 31,5 / 31,5 | 96,1 % | 20/20 |
| `574ef48` 10:21 | gut | je Größe | 99,4 % | 11,0 / 19,6 | 31,5 / 31,5 | 96,1 % | 20/20 |
| `fa2ca00` 10:40 | schlecht | vor V-AF-9 | **1,9 %** | 27,5 / 38,6 | 80,8 / 350,8 | 42,6 % | 4/20 |
| `fa2ca00` 10:40 | schlecht | je Größe | **99,4 %** | 11,0 / 19,6 | 50,8 / 50,8 | 96,1 % | 20/20 |
| `00519d6` 10:44 | schlecht | vor V-AF-9 | **1,9 %** | 27,5 / 38,6 | 84,3 / 354,3 | 42,6 % | 4/20 |
| `00519d6` 10:44 | schlecht | je Größe | **99,4 %** | 11,0 / 19,6 | 54,3 / 54,3 | 96,1 % | 20/20 |
| `9aa64bf` 10:46 | schlecht | vor V-AF-9 | **1,5 %** | 25,0 / 33,0 | 86,3 / 356,3 | 96,1 % | 4/20 |
| `9aa64bf` 10:46 | schlecht | je Größe | **99,4 %** | 11,0 / 19,6 | 56,3 / 56,3 | 96,1 % | 20/20 |
| `13d3b58` 11:11 | schlecht | vor V-AF-9 | **1,3 %** | 28,2 / 39,9 | 111,7 / 111,7 | 42,1 % | 4/20 |
| `13d3b58` 11:11 | schlecht | je Größe | **99,3 %** | 11,1 / 19,7 | 51,7 / 51,7 | 95,9 % | 20/20 |
| `9f46fab` 11:16 | schlecht | vor V-AF-9 | **0,9 %** | 26,5 / 32,4 | 116,2 / 116,2 | 95,9 % | 4/20 |
| `9f46fab` 11:16 | schlecht | je Größe | **99,3 %** | 11,1 / 19,7 | 56,2 / 56,2 | 95,9 % | 20/20 |
| `a5552f2` 11:21 | gut | vor V-AF-9 | 99,3 % | 11,1 / 19,7 | 31,5 / 31,5 | 95,9 % | 20/20 |
| `a5552f2` 11:21 | gut | je Größe | 99,3 % | 11,1 / 19,7 | 31,5 / 31,5 | 95,9 % | 20/20 |

- **Gate B bestanden:** der neue Leser liefert in JEDER Version an ≥ 99 % der Achspunkte eine Temperatur (Minimum 99,31 %); der alte
  Leser zeigt den Einbruch als Negativkontrolle (0,9–1,9 % in den schlechten, 99,3–99,4 % in den guten Fenstern).
- Im guten Fenster ist die Temperatur-Sicht alt = neu (gleiche Anteile, gleiche Abstände, gleiches Alter).
- Die 4 Städte „mit T“ beim alten Leser im schlechten Fenster sind Wien, Innsbruck, Zürich, Bern — in Deutschland 0 von 16.
- Ohne Temperatur im neuen Satz bleiben 16–19 Achspunkte (0,6–0,7 %; alle 12 nächsten Stationen sind Niederschlagsstationen) —
  dort greift im Browser der BrightSky-Rückfall, in jedem Fenster.
- Messungen je Achspunkt im Mittel: gutes Fenster 12,0 → 12,2, schlechtes 12,0 → 16,2–16,4; Achspunkte mit einer Station an drei
  Stempeln: 0 / 0 / 0 / 322 / 17 / 335 / 0.
- **Alter der Temperatur:** im schlechten Fenster ist die weitergereichte Temperatur 51–56 min alt (im guten 31,5 min). Der alte
  Leser reichte dort an den wenigen Punkten mit Temperatur 81–116 min alte Werte weiter (p90 bis 356 min: Stationen, die seit Stunden
  nichts mehr liefern und deshalb als einzige „am Stempel“ stehen).
- **Falle c (Stationswert):** Achse — 339 bzw. 337 Punkte mit einer T-Messung ≤ 5 km; in jeder Version dieselbe Station wie im guten
  Fenster, 0 Abweichungen; der alte Leser hat im schlechten Fenster an 0–2 dieser Punkte überhaupt eine Wahl. Städte — 10 Punkte mit
  Wahl; eine Abweichung je schlechter Version, immer in Österreich (Wien `11034` 1,2 km → `11035` 4,7 km; Innsbruck `11320` 1,8 km →
  `8989037` 0,9 km), und in DERSELBEN Version wählt der alte Leser genauso (0 Unterschiede neu gegen alt) ⇒ V-AF-11.

#### 8.3.5 Prüfung C — Motor (`replay-engine.mjs`, nicht in CI)

Kette des Producers (`getPointForecastFromCube` → `fuseCubePoint`, Stufe buscosun Fusion 12) auf DEMSELBEN Cube (Klon des Daten-Repos,
Stand 10:44 UTC), 20 Achspunkte (der nächste Achspunkt je Stadt, 20 deutsche Städte), Messungen je gesicherter Version, Uhr = `builtAt`.

| Version | Fenster | Punkte mit T-Paaren > 0: alt | neu | T-Paare je Punkt alt | neu | Vorhersage alt = neu (alle Stunden byte-gleich) |
|---|---|---|---|---|---|---|
| `574ef48` 10:21 | gut | 20/20 | 20/20 | 4,0 | 4,0 | 20/20 |
| `fa2ca00` 10:40 | schlecht | **0/20** | **20/20** | 0,0 | 4,0 | 0/20 |
| `00519d6` 10:44 | schlecht | **0/20** | **20/20** | 0,0 | 4,0 | 0/20 |
| `9aa64bf` 10:46 | schlecht | **0/20** | **20/20** | 0,0 | 4,0 | 0/20 |
| `13d3b58` 11:11 | schlecht | 0/20 | **2/20** | 0,0 | 0,1 | 14/20 |
| `9f46fab` 11:16 | schlecht | 0/20 | **2/20** | 0,0 | 0,1 | 14/20 |
| `a5552f2` 11:21 | gut | 20/20 | 20/20 | 4,0 | 4,0 | 20/20 |
| live 13:02 | gut, Stundenanfang | **2/20** | **2/20** | 0,1 | 0,1 | 20/20 |
| live 13:16 | schlecht, Stundenanfang | 0/20 | 2/20 | 0,0 | 0,1 | 14/20 |

- **(ii) bestanden:** in den guten Fenstern ist die Vorhersage an 20/20 Punkten byte-gleich (alle Stunden).
- **(i) NICHT bestanden — in den Versionen nach dem Stundenwechsel (11:11, 11:16, live 13:16) nur 2 von 20 Punkten mit T-Paaren.**
  Ursache ist nicht der Leser, sondern der Motor ⇒ **V-AF-10**: die Achse beginnt am Stundenboden (H:00), und der Anker paart eine
  Messung nur, wenn sie zwischen zwei Achsenschritten liegt oder höchstens 30 min (`SAME_TIME_MS`) von einem Schritt entfernt ist. Die
  jüngste deutsche Temperatur in `obs/v1` trägt von H:00 bis H:20 den Stempel (H − 1):20 — 40 min vor dem ersten Schritt. Der Beleg, dass
  es am Motor liegt: **um 13:02 UTC (gutes Fenster, alle 462 Stationen mit T am Stempel) paart auch der ALTE Leser nur an 2 von 20
  Punkten.** Die zwei Punkte liegen an Stationen, deren Stempel 10 min voraus ist (12:30 = genau 30 min).
  Über die Stunde gerechnet hat buscosun Fusion 12 in Deutschland einen Temperatur-Anker: mit dem Leser vor V-AF-9 in ≈ 30 von 60
  Minuten (:21–:41 und :51–:60), mit dem neuen Leser in ≈ 40 von 60 (:20–:60), mit einer Korrektur am Motor in 60 von 60.
- **(iii) Stetigkeit** — Temperatur für eine FESTE Gültigzeit zwischen aufeinanderfolgenden Versionen (|Δ| in K, größter Sprung über
  20 Punkte; „Stunde 0/1“ wechselt um 11:00 die Bedeutung, deshalb feste Gültigzeiten):

| Übergang | für 11:00 UTC: alt | neu | für 12:00 UTC: alt | neu |
|---|---|---|---|---|
| 10:21 gut → 10:40 schlecht | **1,53** | **0,00** | **1,35** | **0,00** |
| 10:40 → 10:44 → 10:46 (schlecht) | 0,00 | 0,00 | 0,00 | 0,00 |
| 10:46 schlecht → 11:11 schlecht (Stundenwechsel) | 0,66 | **1,52** | 0,06 | **1,35** |
| 11:11 → 11:16 (schlecht) | 0,00 | 0,00 | 0,00 | 0,00 |
| 11:16 schlecht → 11:21 gut | 1,44 | 1,44 | 1,44 | 1,44 |

  Der alte Leser springt beim Eintritt ins schlechte Fenster (Anker fällt weg, bis 1,53 K) und beim Austritt (kommt zurück); der neue
  springt beim Eintritt nicht mehr. **Das Gate „neu ≤ alt an jedem Punkt“ ist nicht bestanden:** 16/20 Punkte (11:00 UTC) und 18/20
  (12:00 UTC). Die übrigen Punkte (Berlin 0,47 → 1,03 K, Frankfurt 0,54 → 1,29 K, Hannover 0,70 → 0,98 K, Hamburg 0,20 → 0,27 K) springen
  beim neuen Leser am Stundenwechsel 10:46 → 11:11, weil der Anker dort wegen V-AF-10 wegfällt — der alte Leser hatte ihn zu dem
  Zeitpunkt schon seit 10:40 verloren. Je Stunde fällt der Anker mit dem neuen Leser einmal weg (H:00–H:20) statt zweimal.
- Der Stationswert ist von V-AF-10 nicht betroffen (er vergleicht an der Messminute mit dem Stationsprodukt): im Browser um 13:21 UTC
  „Innovation aus dwd_obs 03379 München-Stadt (3,8 km) 12:20Z (T 0,70 K)“ bei „anchor: 0 Paar(e)“.

#### 8.3.6 Prüfung D — bestehende Gates (PowerShell, je ein Log, nie `2>&1`; neu gezählt)

Geänderter Baum gegen den Zweigkopf vor der Änderung (`1308df2`, eigener sauberer Arbeitsbaum). Die Maschine stand unter Fremdlast
(Typecheck 335–417 s); wo eine Prüfung Zeiten misst, steht der ruhige Wiederholungslauf dabei.

| Gate | geänderter Baum | Zweigkopf vor der Änderung | Urteil |
|---|---|---|---|
| `npm run typecheck` | 0 Fehler | — | grün |
| `npm run build` | grün, SEO 255/255 | — | grün |
| `npm run budget` | eagerJs 109,3 / 109,4 · eagerCss 2,4 / 2,5 · largestChunk 278,4 / 302 · totalJs **1 712,3 / 1 715** (Grenze von 1 712 mit Notiz angehoben, +2,3 KB lazy) | 1 710,0 / 1 712 | grün |
| `verify:obs-reader` | **70/70** (29 neue Prüfungen nach der unabhängigen Prüfung), `--live` 73/73 (14:51 UTC) | 41/41 | grün |
| `verify:fusion-release` | 30/30, neuester Stand buscosun Fusion 12 | 30/30 | grün |
| `verify:fusion12-identity` (kein npm-Alias, Skript direkt) | 18/18 | — | grün |
| `verify:road-fc` | 103/103 | 103/103 (AF-1) | grün |
| `verify:pv-fusion` | 235/235 | — | grün |
| `verify:dashboard` | 80/80 | — | grün |
| `verify:point-client` | 178/179 — rot (10s) | 177/178 — rot (10s); eine Prüfung weniger, weil dort kein `dist/` liegt (Textsonde übersprungen) | bekannte Zeitprüfung V-EX-13, an beiden Ständen gleich |
| `verify:np0-fields` | ruhig 32/33 — rot B14 (Publisher: „208 Einträge ohne Datei“, Zustand des lokalen Daten-Klons); unter Last 9/10 (Block B brach mit der Feld-Frist ab) | 32/33 — rot B14 | unabhängig (V-RC-4), an beiden Ständen gleich |
| `verify:pv-cube` | ruhig **439/441** — rot (4) Laufzeit 114 ms gegen 100 ms und (21); unter Last 431/441 — (4), (10), (11), (12) × 2, (14) × 2, (16), (20), (21) | unter Last 432/441 — (4), (11), (12) × 2, (14) × 2, (16), (20), (21) | (21) = V-AF-7 (auf `main` rot); alle übrigen sind Zeit-/Kostenprüfungen, die am Zweigkopf unter derselben Last genauso fallen (V-FR-8) |

Nicht gelaufen: `verify:sea-derive` (V-AF-8, > 20 min) und die übrigen Verifier ohne Bezug zum Leser — der Diff berührt außer dem Leser nur
das Stations-Popup (`MapView.tsx`, eine CSS-Zeile) und den Aufruf des Stationsrasters der Rasterfusion.

#### 8.3.7 Prüfung E — Browser (Dev-Server des Arbeitsbaums, Playwright-Chromium, München)

`/wetterkarte/wind/muenchen?ansicht=dashboard&pflog=1`; die Vermerke stammen aus demselben Modul wie die Seite (`getPointForecastFromCube`
mit der Voreinstellung des Browsers), Anfragen aus `performance.getEntriesByType('resource')` und dem Netzwerk-Mitschnitt. Belege in
`audit/autobahn-fusion12-lueckenlos/browser/`.

| Zeit (UTC), Produkt | Zustand des Produkts (DE) | Schalter | Vermerke des Motors | BrightSky | `obs/v1` |
|---|---|---|---|---|---|
| 13:48:36, `builtAt` 13:42:03 | schlecht: T am Stempel 6, in `older` 456 | — | `obs: 16 Stationsmessung(en) aus buscosun-data obs/v1` · `obsPerVar:set — … 12 Station(en), davon 4 mit Messungen an mehr als einem Stempel` · **`anchor: 4 Paar(e) aus dwd_obs, Versatz T -0.57 K, Repräsentativität 0.96`** · Stationswert „Innovation aus dwd_obs 03379 München-Stadt (3.8 km) 12:50Z (T 0.60 K)“ | **0** | 2 |
| 13:49:02, dasselbe Produkt | schlecht | **`&obsvar=0`** | `obs: 12 Stationsmessung(en) …` · **`anchor: Messungen da, aber kein Paar (Messung, Cube) im selben Stundenraster — kein Anker`** · Stationswert „Innovation keine“ · 0 mit gemessenem Taupunkt | 0 | 2 |
| 13:49:53, `builtAt` 13:49:12, 390 × 844 | schlecht: T am Stempel 3 | — | wie Zeile 1 (`anchor: 4 Paar(e) …`) | 0 | 2 |
| 13:21:55, `builtAt` 13:16:10 | schlecht, Stundenanfang: T am Stempel 2, in `older` 460 (Stempel 12:20) | — | `obs: 16 …` · `obsPerVar:set …` · Stationswert „Innovation … 12:20Z (T 0.70 K)“ · **`anchor: 0 Paar(e) aus dwd_obs, Versatz T — K`** (V-AF-10: die Temperatur ist da, der Anker paart sie zum Stundenanfang nicht) | 0 | 2 |
| 13:22:21, `builtAt` 13:21:23 | gut: T am Stempel 462 | `&obsvar=0` | `anchor: 4 Paar(e) aus dwd_obs, Versatz T -0.57 K` (kein `obsPerVar`-Vermerk) | 0 | 2 |

- **Stations-Popup** (`/wetterkarte/temperatur?…&l=stationen`, 13:49:19, München-Stadt): „Temperatur 13.1 °C · 14:50 Uhr“, „Wind 2.8 m/s“,
  „Niederschlag 1.68 mm/h“, Fußzeile „Messung 15:20 Uhr · Aktualisiert · live abgerufen“ (Ortszeit; im Produkt Stempel 13:20Z, Temperatur
  in `older` 12:50Z, Wind am Stempel) — `desktop-1349-popup-muenchen-stadt.png`.
- **Screenshots:** `desktop-1348-bad-window.png`, `desktop-1349-bad-window-obsvar0.png` (Gegenprobe), `mobile-1349-bad-window.png`,
  `desktop-1321-bad-window.png`; Netzwerk `network-1348-bad-window.txt` (zwei Anfragen an `obs/v1`, keine an `api.brightsky.dev`).
- **Konsole:** je Seitenaufruf 1–3 × `404` auf `…/radar/img/v1/{inca,rv,rzc}/<neuester Slot>/meta.json` (die Sonde auf den noch nicht
  veröffentlichten Radar-Slot, bestehendes Verhalten, nicht aus dieser Änderung), sonst leer; die eine Warnung („Deprecated API for given
  entry type“) stammt aus der Abfrage der Prüfsitzung selbst (`getEntriesByType('longtask')`).
- **Nicht geprüft:** Gerätepixelverhältnis 3 (Playwright stellt nur die Fenstergröße 390 × 844) und Real-Device — Jans Gate.
- Die Vermerke oben sind vom Stand VOR den Korrekturen aus §8.3.8 (5a–5e) abgeschrieben: der `obsPerVar`-Vermerk erscheint seither nur,
  wenn eine Station mehr als einen Stempel liefert (in jedem der Fälle oben: 4 Stationen), der Wortlaut ist unverändert.
- **Nebenbefund V-AF-14:** die Dashboard-Kachel „Jetzt · Messwert als Anker“ nennt als Quelle „BrightSky · 1 Station“, obwohl die Messung
  aus `obs/v1` kommt (0 BrightSky-Anfragen). `src/dashboard/model/build.ts sourceNames` bildet jede Quelle `dwd…` auf „BrightSky“ ab —
  seit Phase OF falsch, nicht Teil dieses Auftrags.
- **Werkzeugfalle:** `node_modules` im Arbeitsbaum ist eine Junction auf den Hauptbaum. Ein zweiter Vite-Server teilt damit
  `node_modules/.vite` mit einem laufenden Server (Port 5199, Arbeitsbaum `buscosun-web-wt\fusion-12`) — mein erster Start hat dort die
  optimierten Abhängigkeiten neu angestoßen und hing. Abhilfe: eigener `cacheDir` (lokale, nicht committete Konfiguration). Der Server
  auf 5199 optimiert seine Abhängigkeiten beim nächsten Aufruf neu.

#### 8.3.8 Prüfung F — unabhängige Prüfung (frische Sitzung, nur Spezifikation und Diff)

Auftrag: Stempeltreue, Doppelzählung, Byte-Gleichheit und die Reihenfolge des Rückfalls zu brechen versuchen. Die Prüfsitzung hat nichts
im Arbeitsbaum geändert; ihre Skripte liegen im Scratchpad (`review/`).

**Nicht zu brechen (von ihr gerechnet):**

- **Stempeltreue:** alle Stationen aller sieben vollen Versionen, DE/AT/CH, dichter Satz und sechs volle Stationen, Uhr = `builtAt` und
  + 20 min: 2 051–2 511 Messungen je Lauf, **0 Verstöße**; Wind immer mit `ff` und `dd` desselben Stempels; `rr1h` nur an der Messung des
  Stationsstempels; keine leere, keine künftige Messung. Im Rohprodukt: kein `older`-Stempel ≥ Stationsstempel, keiner unlesbar, keine
  Größe in `v` UND `older`. Erfundene Einträge (gleicher/neuerer/unlesbarer `older`-Stempel, `ff`/`dd` an verschiedenen Stempeln,
  Stationsstempel nur mit `ps`, T 91 min alt) verhalten sich wie beschrieben.
- **Doppelzählung:** 0; höchstens drei Messungen je Station, jede Größe höchstens einmal.
- **Byte-Gleichheit gegen HEAD** (`git show HEAD:…` neben dem Arbeitsbaum geladen, 894 Punkt-Sätze × 7 Versionen): ohne `perVar` Liste
  und `CubeObs` 894/894 gleich; `obsGridOf`/`obsStationFeatures`/`obsStationLive` mit `perVar = false` gleich; gute Fenster mit `split`:
  Liste ohne `parts` 894/894 gleich, ganze Ausgabe an 790 bzw. 797 Sätzen gleich, der Rest unterscheidet sich nur durch `parts`.
- **Schalter aus:** keine Altersprüfung, kein BrightSky. **Abbruch:** der Abbruch des Aufrufers erreicht den Rückfall; BrightSky 500
  oder ohne Antwort ⇒ die Stationen des Produkts bleiben. **Motor:** kein Hunk in `fuseCubePoint`.

**Funde und was daraus wurde:**

| Nr. | Fund der Prüfung | Entscheidung |
|---|---|---|
| 1 | Der Motor verwirft die übergebene Temperatur im Fenster :11–:21 (an 462 Stationen übergeben, 21 paarbar; Replay an 4 Punkten) — „behoben“ wäre zu viel gesagt | **bestätigt, = V-AF-10** (unabhängig gefunden). Kommentar im Register und dieses Dokument sagen es jetzt ausdrücklich; die Behebung ist ein Motor-Eingriff ⇒ Jans Gate E-AF-6 |
| 2 | Popup: Karte im schlechten Fenster geladen, Klick im guten ⇒ die alte Zeit („· 11:50 Uhr“) blieb neben dem neuen Wert stehen (`{ ...feature, ...live }`); im BrightSky-Zweig blieb „Messung HH:MM“ stehen | **behoben:** der Leser je Größe liefert die Zeitfelder immer (`null` = am Stempel), der BrightSky-Zweig setzt sie auf `null`; Prüfung 19 neu |
| 3 | Die Altersprüfung (30 min) verwirft die jsDelivr-Kopie, wenn der Ausweichweg gewinnt: gemessen 13:58/14:07/14:13 UTC `@main` 27/36/42 min alt bei raw 2–6 min; eine Geräteuhr > 30 min voraus verwirft jedes Produkt | **nicht geändert, benannt (V-AF-16):** ein 36 min altes `latest.json` trägt in DE eine 66–96 min alte Temperatur — der Direktabruf ist dann die frischere Antwort und vom Auftrag so verlangt. Besser wäre ein zweiter Leseversuch über raw vor dem Direktabruf und das Alter gegen den `Date`-Kopf |
| 4 | Stationswert liest EINE Messung: im Fenster „Wind am Stempel, T älter“ fehlt ihm an 206/207 von 462 Stationspunkten Wind/Böe der eigenen Station; „fernere Station mit jüngerer T gewinnt“ an 1 von 462 Punkten in jeder Version, auch im guten Fenster | **Motor, Jans Gate (V-AF-11 erweitert).** Gegen den Leser vor V-AF-9 trotzdem besser (dort gar keine Innovation) |
| 5a | Die Stufen-Notiz des Stands 12 nannte den Leser je Größe — auch hinter `?obsvar=0` | **behoben:** aus der Notiz genommen, steht im Feld `ref` und im Kommentar |
| 5b | `obsNoteOf` schrieb „obsPerVar“ aus dem Schalter, nicht aus dem, was der Abrufer tat | **behoben:** nur noch, wenn die Messungen selbst mehr als einen Stempel je Station zeigen |
| 5c | „auch nicht per Direktabruf“ stand auch bei AT/CH, wo keiner versucht wird | **behoben:** Wortlaut je Land |
| 5d | `fetchCubeObs` reicht `onNote` nicht durch (Alter in Minuten, „BrightSky liefert auch keine“ erreichen den Vermerk nicht) | bestehende Form des Cube-Pfads, benannt (§8.3.2) |
| 5e | „Kein Anker für die Größe“ nur für Temperatur | **behoben:** auch Wind und Böe |
| 6 | Mit Rückfall ist die Liste länger als `maxStations` | benannt (§8.3.2, Abweichung 5; Kommentar im Code) |
| 7 | Ein BrightSky ohne Antwort hält die Stationen des Produkts bis 800 ms auf; mit einer Produktantwort > 700 ms verfehlt der nicht-progressive Cube-Pfad die 1,5-s-Frist | benannt; betrifft nur Punkte ohne Temperaturstation im Satz (0,6–0,7 %); der Browser rechnet progressiv mit 4 s |
| 8 | Prüfung 15 (zweite Zeile) war durch die erste impliziert, ihr Text an den vollen Versionen falsch (1–2 Stationen mit Wind 50 min hinter dem Stempel); Titel von 18 „sechs“; 13 ohne `rr1h` | **behoben:** 15 prüft jetzt jede Zusatzmessung des Auszugs (222/222 nur `rr`), Text nennt die Windstationen; 13 prüft `rr1h` am Stationsstempel; Titel korrigiert |
| 9 | `merge` war eine fehlende Option vom Motor entfernt (`dense` ohne `perVar` ⇒ T von 09:50 auf dem Stempel 10:20) | **behoben:** `dense` liest ohne Angabe `split`; Prüfung 18 neu |
| 10 | `fetchObsNearest` ohne Aufrufer; „BrightSky liefert auch keine“ auch bei Abbruch/500 | Wortlaut ergänzt („oder nicht binnen 800 ms“); die Funktion bleibt (Funktionserhalt) |

#### 8.3.9 Befunde und Verbesserungen aus V-AF-9

| Nr. | Befund | Mehrwert | Skizze |
|---|---|---|---|
| **V-AF-10** (behoben, §8.4) | **Der Anker paarte die deutsche Temperatur in den ersten ≈ 20 min jeder Stunde nicht** — die Achse beginnt am Stundenboden, gepaart wird nur zwischen zwei Schritten oder ≤ 30 min (`SAME_TIME_MS`) an einem Schritt; die jüngste DWD-Temperatur in `obs/v1` trägt dann den Stempel (H − 1):20. Gemessen: 13:02 UTC (gutes Fenster) T-Paare an 2 von 20 Punkten, alter und neuer Leser gleich; 11:11/11:16/13:16 ebenso | buscosun Fusion 12 hätte den Temperatur-Anker in Deutschland 60 statt ≈ 40 von 60 Minuten; kein stündlicher Sprung bis 1,5 K | Motor (Jans Gate, E-AF-6): dem Anker den nativen Schritt vor t0 zum Paaren geben und auf die Messminute interpolieren; Alternative im Leser: Temperatur älter als ≈ 40 min ⇒ BrightSky gezielt |
| V-AF-11 | Der Stationswert liest EINE Messung, die jüngste vor der nächsten: (a) bei versetzt liefernden TAWES-Stationen wechselt die Station von Version zu Version (Wien 1,2 km ↔ 4,7 km; in DE an 1 von 462 Stationspunkten, in jedem Fenster); (b) trägt eine Station Wind am Stempel und Temperatur 30 min älter, fehlen dem Stationswert Wind und Böe der eigenen Station (unabhängige Prüfung: 206/207 von 462 Stationspunkten in den Versionen 10:46/11:16; beim Leser vor V-AF-9 dort gar keine Innovation) | ruhigerer, vollständiger Stationswert | Motor (Jans Gate): die Größen einer Station über ihre Messungen sammeln, jede an ihrem Stempel; unter den Messungen der letzten ≈ 30 min die Station am Punkt vorziehen |
| V-AF-12 | Rückfall je Größe nur für die Temperatur; ohne Wind im dichten Satz bleiben ≈ 4 % der Achspunkte in jedem Fenster | Wind-Anker an diesen Punkten | E-AF-7: am Prüfstand messen, ob ein Wind-Anker aus der nächsten BrightSky-Station (oft > 20 km) überhaupt hilft; dann `OBS_VAR_FALLBACK` erweitern |
| V-AF-13 | Der Spiegel hält den letzten Wert einer Größe nur 60 min hinter dem Stationsstempel (`latestDoc`) | fällt eine Temperaturlieferung zweimal aus, bleibt der letzte Wert im Produkt (der Leser begrenzt mit 90 min) | Auftrag Schritt 3: Fenster auf 6 h, `--self-test` erweitern, Größe von `latest.json` messen, Kopie ins Daten-Repo = Jans Gate (E-AF-8) — nicht gebaut |
| V-AF-14 | Dashboard-Kachel „Messwert als Anker“ nennt „BrightSky“, obwohl die Messung aus `obs/v1` kommt (`dashboard/model/build.ts sourceNames`) | Herkunft stimmt (Ehrlichkeitsregel) | Netzname aus `via` bzw. dem Vermerk `obs: … aus buscosun-data obs/v1` ⇒ „DWD (obs/v1)“; BrightSky nur beim Direktabruf |
| V-AF-15 | (am Code gelesen, nicht gemessen) `fraction` (Repräsentativität des Ankers) nimmt das größte Raumgewicht ALLER gepaarten Messungen, auch einer reinen Niederschlagsstation ohne Temperatur — im dichten Satz hebt die nächste Regenstation die Repräsentativität des Temperatur-Ankers | Anker-Gewicht passt zur Station, die die Größe wirklich misst | Motor (Jans Gate): `fraction` je Größe aus den Stationen, die sie tragen; am Prüfstand messen (das ist der Stand `fusion-12s`, also bestehendes Verhalten) |
| V-AF-16 | Die Altersprüfung des Produkts (30 min) rechnet gegen die Uhr des Geräts und kennt nur EINE Antwort: geht die Uhr > 30 min vor, gilt `latest.json` immer als veraltet; gewinnt der Ausweichweg jsDelivr `@main`, ist dessen Kopie oft älter (unabhängige Prüfung 13:58/14:07/14:13 UTC: 27/36/42 min bei raw 2–6 min) ⇒ jeweils Direktabruf (22 BrightSky-Anfragen) | weniger Direktabrufe, Entscheidung unabhängig von der Geräteuhr | bei „veraltet“ einmal gezielt über raw neu lesen, bevor der Direktabruf startet; Alter gegen den `Date`-Kopf der Antwort; getrennt davon: warum die jsDelivr-Kopie trotz Purge alt bleibt (Spiegel, Phase OB) |
| V-AF-17 | Zwei Vite-Server auf Arbeitsbäumen mit `node_modules`-Junction teilen `node_modules/.vite` und blockieren sich | Browser-Prüfungen aus Arbeitsbäumen ohne Störung anderer Sitzungen | `cacheDir` je Arbeitsbaum (Umgebungsvariable in `vite.config.ts`) |

#### 8.3.10 Die fünf Selbstverifikations-Fragen

1. **Funktionserhalt, einzeln:** hinter `?obsvar=0` rechnet jeder berührte Leser Byte für Byte wie vorher — `nearestObsStations` ohne
   `perVar` (unabhängige Prüfung gegen `git show HEAD`: Liste und `CubeObs` an 894 Punkt-Sätzen × 7 Versionen gleich; Prüfung 15 an 522
   Punkten; Negativkontrolle im schlechten Fenster), `obsGridOf`/`obsStationFeatures`/`obsStationLive` mit `perVar = false` (Prüfung 19), Altersprüfung und Rückfall je Größe aus
   (Prüfung 18). Die Blöcke 1–11 von `verify:obs-reader` sind unverändert grün; `verify:fusion12-identity` 18/18, `verify:road-fc`
   103/103, `verify:pv-fusion` 235/235. `fuseCubePoint` ist nicht berührt (im Diff von `cubeSource.ts` stehen nur `CubeObs.via`,
   `CubeIo.obsPerVar`, `cubeIoVariantKey`, `CubeObsFetchOptions`, `fetchCubeObs`, `cubeObsOf`, `obsNoteOf`, die zwei Aufrufstellen von
   `io.obs` und die Schalter in `defaultCubeIo`). Keine Funktion entfernt.
2. **Desktop pixelgleich:** geändert ist nur das Stations-Popup — ein Zeit-Zusatz hinter einem Wert, der nicht am Stationsstempel gemessen
   ist, und „Messung HH:MM Uhr“ in der Fußzeile (nur mit Werten aus `obs/v1`). Kein Layout, kein Breakpoint, keine Media Query. Ein
   Pixel-Diff der ganzen Seite ist nicht gelaufen (das Popup erscheint erst auf Klick); im guten Fenster zeigt das Popup die Werte ohne
   Zusatz, mit der neuen Fußzeile.
3. **Touch-Targets ≥ 44 px:** kein neues Bedienelement.
4. **Konsole sauber:** ja bis auf die bekannten `404` der Radar-Slot-Sonde (§8.3.7), die es ohne diese Änderung genauso gibt.
5. **Keine Long Tasks > 200 ms:** die Änderung rechnet je Station eine Handvoll Vergleiche (3 300 Stationen je Abruf). In der
   Playwright-Sitzung meldet `longtask` 0 Einträge — headless ist dafür nicht belastbar (bekannte Falle); Real-Device = Jans Gate.

### 8.4 V-AF-10 — der Anker paart auch vor dem Achsenbeginn (10.10.2026 abends; E-AF-6: Jan „setze a um“)

Lokal im Arbeitsbaum `.wt-af`, **uncommittet**, nichts gepusht. Eingriff in den Motor (`fuseCubePoint`), von Jan mit Weg (a) freigegeben.

#### 8.4.1 Diagnose (aus §8.3.5, hier am Code)

- Die Achse des Motors sind die nativen Cube-Schritte im Fenster; das Fenster beginnt am Stundenboden (`nativeAxis`, `window.fromMs`).
- Der Anker (`cubeSource.ts`, Durchgang 2) paarte eine Messung nur (1) streng zwischen zwei ACHSEN-Schritten (`anchorAtObsTime`, Fusion 9)
  oder (2) höchstens 30 min (`SAME_TIME_MS`) von einem Achsenschritt entfernt. Eine Messung vor dem ersten Schritt hat keinen Schritt
  auf ihrer frühen Seite: weiter als 30 min davor ⇒ kein Paar; näher ⇒ gegen den Wert des ersten Schritts gerechnet, ohne Interpolation.
- Der Cube trägt die Schritte davor: t1 läuft ab dem Laufbeginn (Fixture: Lauf 18 UTC, t0 21 UTC ⇒ 18, 19, 20 UTC im Bündel). Es
  braucht keinen neuen Abruf.

#### 8.4.2 Umsetzung

| Teil | Wo | Was |
|---|---|---|
| Motor-Option | `FuseCubeOptions.anchorBeforeAxis` (`cubeSource.ts`) | wirkt nur mit `anchorAtObsTime`. Liegt eine Messung vor dem ersten Achsenschritt, werden die nativen Schritte bis `ANCHOR_BRACKET_MAX_H` (3 h, bestehende Setzung) davor vorbereitet wie jeder Schritt (PAP 3–5, Lernstufe) und der Paar-Liste vorangestellt — **nur zum Paaren, nie in der Ausgabe**. Paarung und Interpolation auf die Messminute sind der bestehende Code von V-AW-33, auf der längeren Liste. Voreingestellt aus ⇒ byte-gleich |
| Umbau ohne Wirkung | `prepOf` | der Rumpf von Durchgang 1 ist jetzt eine benannte Funktion (`preps = axis.map(prepOf)`), damit derselbe Code den Schritt davor vorbereitet. Die Zählwerke von Durchgang 1 (Lernstufe, κ, z0) werden danach nicht mehr gelesen; ihre Notizen stehen schon |
| Notiz | Motor | `anchorBeforeAxis: n von N Messung(en) vor dem Achsenbeginn mit den nativen Schritten davor gepaart …` — nur, wenn eine Messung vor dem Achsenbeginn liegt (sonst ist das ganze Ergebnis byte-gleich zu ohne Option) |
| Stand | `fusionRelease.ts` | `FUSION12_ANCHOR_BEFORE_AXIS = true`, Begleit-Option des Stands 12 (`also`) — geht mit `?dense=0` aus. Stufen-Notiz unverändert |
| Rückfall | `pfFlags.ts pfAnchorBeforeAxisFrom`, `CubeIo.anchorBeforeAxis`, `cubeIoVariantKey` | **`?ancpre=0`** = Motor wie vor V-AF-10 (Stand und Notiz bleiben); eigener Cache-Schlüssel `ancpre0` |

Producer (`road-forecast.mjs`, `fusionStageIo()`) und jede Seite, die die Stufe rechnet, ziehen von selbst nach. Die Kartenfelder rechnen
ohne Messung ⇒ unverändert. Das Daten-Repo bleibt unverändert.

#### 8.4.3 Prüfungen (zuerst rot gesehen, dann grün)

`verify:pv-cube`, Block (12) und (29), fünf neue Prüfungen — vor der Umsetzung alle fünf rot („Versatz ohne undefined · mit undefined“):

| Nr. | Prüfung | Ergebnis |
|---|---|---|
| 1 | Reproduktion: Messung 40 min vor dem Achsenbeginn (Stempel (H − 1):20), 1 K über der Modelllinie ⇒ mit `anchorAtObsTime` allein kein Paar; mit Option Versatz genau 1 K, `anchored`, Notiz „1 von 1“ | 1,000000 K |
| 2 | Messung 20 min davor: ohne Option gegen den ersten Schritt (2 K samt 20 min Modellgang), mit Option gegen die Modelllinie an der Messminute | auf 1e-9 |
| 3 | Messung genau auf dem Schritt davor ⇒ gegen dessen Wert gepaart (1,5 K); ohne kein Paar | auf 1e-9 |
| 4 | Negativkontrollen: Messung auf/nach dem Achsenbeginn (volle Stunde, + 30, + 41 min, keine) ⇒ GANZES Ergebnis (ohne Laufzeit) byte-gleich zu `anchorAtObsTime` allein; Option ohne `anchorAtObsTime` wirkt nicht; Cube ohne Schritt vor dem Fenster ⇒ byte-gleich, Notiz „0 von 1“; Messung 5 h davor ⇒ kein Paar; der Schritt davor erscheint nie in der Ausgabe (102 Schritte, erster = t0) | grün |
| 5 | Stufe (echte Kette mit Lernstufe und Stationswert): Notiz „1 von 1“, Anker mit 1 Paar; `CubeIo.anchorBeforeAxis: false` ⇒ keine Notiz, „kein Paar“, Stufen-Notiz gleich, Schritte verschieden; **die Zähl-Notiz der Lernstufe ist mit Schritt davor, ohne und ohne Messung dieselbe**; `?ancpre=0`; Cache-Schlüssel | grün |

#### 8.4.4 Wiederholung an echten Daten (`replay-engine.mjs`, 20 Achspunkte, derselbe Cube, sieben gesicherte Versionen von `obs/v1`)

Zwei Läufe: mit der Option (Stufe) und mit `--ancpre=0` (Gegenprobe). **Die Gegenprobe trifft die Tabelle aus §8.3.5 Zeile für Zeile**
(11:11/11:16: 2 von 20, Sprünge 1,53/1,52 K) — der Unterschied der beiden Läufe ist also die Option.

| Version | Fenster | Punkte mit T-Paaren, neuer Leser: ohne Option | mit Option |
|---|---|---|---|
| 10:21 | gut | 20/20 | 20/20 |
| 10:40 · 10:44 · 10:46 | schlecht | 20/20 | 20/20 |
| **11:11** | schlecht, Stundenanfang | **2/20** | **20/20** |
| **11:16** | schlecht, Stundenanfang | **2/20** | **20/20** |
| 11:21 | gut | 20/20 | 20/20 |

- **Gate C(i) aus §8.3.5 ist damit bestanden:** Temperatur-Paare an 20 von 20 Punkten in JEDER Version (4,0 Paare je Punkt).
- **Stetigkeit** (Temperatur für eine feste Gültigzeit zwischen aufeinanderfolgenden Versionen, neuer Leser, größter Sprung / Mittel in K):

| Übergang | für 11:00 UTC: ohne Option | mit | für 12:00 UTC: ohne | mit |
|---|---|---|---|---|
| 10:46 → 11:11 (Stundenwechsel) | 1,52 / 0,445 | **1,03 / 0,299** | 1,35 / 0,267 | **0,73 / 0,209** |
| 11:16 → 11:21 | 1,44 / 0,355 | **1,22 / 0,209** | 1,44 / 0,272 | **0,60 / 0,151** |
| alle übrigen | 0,00 | 0,00 | 0,00 | 0,00 |

  Der Anker fällt nicht mehr weg. Die Sprünge, die bleiben, sind keine Ausfälle: zwischen 10:46 und 11:11 wechselt die Messung
  (Stempel 09:50 → 10:20, München Versatz −0,91 → −0,77 K), zwischen 11:16 und 11:21 noch einmal (10:50, −0,58 K). Nicht zerlegt ist,
  welcher Teil davon am Stundenwechsel des Motors selbst hängt (V-AF-18).
- **Das Gate C(iii) in seiner Form „neu ≤ alt an jedem Punkt“ ist weiterhin nicht bestanden** (12/20 bzw. 14/20 Punkte). Es vergleicht
  mit dem Leser vor V-AF-9, der in den schlechten Fenstern auf beiden Seiten des Übergangs KEINEN Anker hat und deshalb nicht springt —
  als Maß für die Güte taugt es nicht; die Tabelle oben vergleicht denselben Leser mit und ohne Option.
- **Die Option wirkt nicht nur in der Lücke** (Sonde Magdeburg/München, 10:21 UTC, gutes Fenster): der deutsche Temperaturstempel ist
  dort 09:50, also 10 min VOR dem Achsenbeginn. Er paarte schon vorher (≤ 30 min), wurde aber gegen den Modellwert von 10:00 gerechnet;
  jetzt gegen die Modelllinie um 09:50. München Versatz −1,00 → −0,91 K, Magdeburg 0,38 → 0,49 K (Temperatur der Stunde 0 + 0,06 K).
  Über die Stunde: H:00–H:20 Stempel (H − 1):20 — paart jetzt überhaupt; H:21–H:50 Stempel (H − 1):50 — paart wie bisher, Versatz um
  10 min Modellgang verschoben; H:51–H:59 Stempel H:20 — nach dem Achsenbeginn, unverändert. Das ist dieselbe Korrektur wie V-AW-33
  (Fusion 9), nur bis vor den Achsenbeginn fortgesetzt.
- Neuer Leser gegen den Leser vor V-AF-9 in den guten Fenstern: 19 von 20 Punkten byte-gleich (vorher 20). Der eine Punkt (Magdeburg):
  der neue Leser reicht eine Windmessung von 09:00 aus einem älteren Teil weiter, die jetzt paart (Windgeschwindigkeit der Stunde 0
  4,85076 → 4,85083 m/s; Temperatur-Anker gleich).

#### 8.4.5 Wirkung auf den Prüfstand-Kandidaten (`bench-before-axis.mjs`, nur lesend)

Register `fusion-12s` (der Kandidat hinter buscosun Fusion 12) gegen dieselben Optionen + `anchorBeforeAxis`, Motor aus diesem Arbeitsbaum,
drei Archivtage der Entwicklungsmenge, 365 Stationen, je 5 250 160 Werte:

| Fall | Messungen | Werte verschieden | Profil |
|---|---|---|---|
| 05.10. | dicht (wie der Kandidat gemessen ist) | **0** | byte-gleich |
| 06.10. | dicht | **855** | nur T, 1–46 h, max \|Δ\| 0,110 K |
| 07.10. | dicht | **38** | nur Windrichtung, max \|Δ\| 0,004° |
| 05./06./07.10. | Archiv-Messung (Modus der Stände ≤ 11, hier nur zum Vergleich) | 86 868 / 89 575 / 86 095 | T bis 2,29 K, Wind bis 1,23 m/s |
| Hindcast 15.06. | keine | 0 | byte-gleich |

Im Modus des Kandidaten ändert die Option 0,006 % der Werte dieser drei Tage — der gemessene Index von `fusion-12s` (+1,55 %) ist davon
praktisch nicht berührt, aber **der Stand, der jetzt „buscosun Fusion 12“ heißt, ist nicht mehr bit-gleich der Prüfstand-Kandidat**, und
die Wirkung im Betrieb (jede deutsche Abfrage, s. §8.4.4) ist am Prüfstand nicht gemessen: in seinen dichten Tagesdateien liegt offenbar kaum eine Messung
vor der Ausgabestunde (aus der kleinen Zahl geschlossen, nicht nachgezählt). Die große Zahl im Archiv-Modus betrifft die Stände bis 11, die die Option nicht tragen (V-AF-19).

#### 8.4.6 Befunde und Entscheidungen

| Nr. | Befund | Mehrwert | Skizze |
|---|---|---|---|
| V-AF-18 | Am Stundenwechsel bleibt ein Sprung bis 1,03 K (Berlin, Gültigzeit 11:00). Am Code gelesen, nicht gemessen: das Gewicht des Ankers hängt am Vorlauf ab Stundenboden (`anchorTermOf(…, leadH, …)`), nicht am Alter der Messung — mit dem Stundenwechsel rückt dieselbe Gültigzeit eine Stunde näher und der Anker-Term wächst | ruhigere Vorhersage über den Stundenwechsel | am Prüfstand messen: Abklingen ab der Messminute statt ab dem Stundenboden; Motor, Jans Gate |
| V-AF-19 | Im Archiv-Modus des Prüfstands liegen Messungen vor der Ausgabestunde: die Option änderte dort 1,6–1,7 % der Werte (T bis 2,3 K). Die Stände 9–11 sind also mit Messungen gemessen, die der Motor gar nicht paart oder gegen den ersten Schritt rechnet statt gegen ihre Minute (nicht aufgeschlüsselt) | genauere Aussage, was der Anker im Archiv-Lauf wert ist | eigener Kandidat am Prüfstand (Stand 11 + `anchorBeforeAxis`, Archiv-Modus) — erst dann ist die Option gemessen |
| V-AF-20 | `fusion-12s` im Prüfstand-Register nennt die Option nicht; „buscosun Fusion 12“ im Code trägt sie | Register und Code sagen dasselbe | E-AF-9 |

- **E-AF-6 (entschieden, Jan 10.10.: „setze a um“):** Weg (a), Motor. Umgesetzt wie oben.
- **E-AF-9 (offen, Jans Gate): Teil von buscosun Fusion 12 oder buscosun Fusion 13?** Gebaut ist die Option als Begleit-Option des noch
  nicht veröffentlichten Stands 12, wie der Leser aus V-AF-9. Nach der Namensregel („jede Änderung an Kette ⇒ neue Nummer“) wäre sie ein
  eigener Stand. Empfehlung: Teil von 12 lassen — Stand 12 war nie live, und ohne die Option wäre er in Deutschland in einem Drittel
  der Zeit ohne Temperatur-Anker; die Definition in `CLAUDE.md` nennt die Option. Als Fusion 13 wäre es EIN neuer Eintrag im Register
  (die Konstante bleibt).

#### 8.4.7 Gates (PowerShell, je ein Log, nie `2>&1`; neu gezählt)

| Gate | Ergebnis | Urteil |
|---|---|---|
| `npm run typecheck` | 0 Fehler | grün |
| `npm run build` | grün, SEO 255/255 | grün |
| `npm run budget` | eagerJs 109,3 / 109,4 · largestChunk 278,4 / 302 · totalJs **1 712,6 / 1 715** (+0,3 KB lazy, Grenze unverändert) | grün |
| `verify:pv-cube` | **445/446** — fünf neue Prüfungen grün; rot nur (21) | (21) = V-AF-7, auf `main` rot, unabhängig |
| `verify:fusion-release` | 30/30, neuester Stand buscosun Fusion 12, Begleit-Optionen „12: anchorSigma+anchorBeforeAxis“ | grün |
| `verify:fusion12-identity` | 18/18 | grün |
| `verify:obs-reader` | 70/70 | grün |
| `verify:road-fc` | 103/103 | grün |
| `verify:pv-fusion` | 235/235 | grün |
| `verify:point-client` | 179/179 (die Zeitprüfung (10s) lief in diesem ruhigen Lauf durch) | grün |
| `verify:dashboard` | 80/80 | grün |

Nicht gelaufen: `verify:sea-derive` (V-AF-8), `verify:np0-fields` (rechnet ohne Messung, B14 hängt am lokalen Daten-Klon) und die
Verifier ohne Bezug zum Motor. **Nicht geprüft: der Browser** (ein Aufruf im Fenster :00–:20 mit `?pflog=1`, Gegenprobe `&ancpre=0`)
und Real-Device — die Wiederholung in §8.4.4 fährt die Kette des Producers (`getPointForecastFromCube` → `fuseCubePoint`), nicht die Seite.

Die fünf Fragen: (1) Funktionserhalt — ohne Option und hinter `?ancpre=0` rechnet der Motor wie vorher (Negativkontrollen 4 und 5,
Gegenprobe-Lauf trifft §8.3.5; `prepOf` ist derselbe Rumpf, alle 441 Bestandsprüfungen von `verify:pv-cube` unverändert); keine Funktion
entfernt. (2) Desktop pixelgleich — keine UI geändert; Werte ändern sich, wo eine Messung vor dem Achsenbeginn liegt (§8.4.4). (3) kein
neues Bedienelement. (4) Konsole — nicht im Browser geprüft. (5) Long Tasks — höchstens drei zusätzliche Schritte auf 102, nur mit
einer Messung vor dem Achsenbeginn; nicht gemessen.
