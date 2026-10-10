# Autobahnwetter — Phase AF: Streckenprognose lückenlos mit buscosun Fusion 12

> Stand 2026-10-10. Diagnose und Entwurf (Spezifikation). **Noch kein Code.** Umsetzung erst nach Jans Durchsicht dieses
> Dokuments und des Umsetzungsplans. Vorgänger: `audit/autobahnwetter.md` §14–§18 (AW-6.1), `audit/obs-fusion.md`
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
