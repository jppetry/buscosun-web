# Phase FR — Register der Stände von buscosun Fusion

> Auftrag Jan 05.10.2026: „einen Mechanismus, dass wir, wenn wir buscosun Fusion updaten (z. B. jetzt auf 9), es in allen
> Teilen der Plattform nachziehen können, ohne alles händisch zu machen — nur wenn es noch nicht umgesetzt ist, am besten
> automatisch." Stand: **umgesetzt, uncommitted, Gates grün.** Commit/Push = Jans Gate (`MANUELLE-SCHRITTE.md` §38).

## 0 Kurzfassung

Ein neuer Stand von buscosun Fusion ist ab jetzt **ein Eintrag** in `src/pointForecast/fusion/fusionRelease.ts` (plus die
Motor-Option, die er schaltet). Motor, Punkt-Panel, Dashboard, Regenradar-Streifen, Streckenprognose, Kartenfelder und die
Autobahnwetter-Seite lesen Optionen, Nummer und Namen von dort. Die Datenprodukte ziehen nach dem Push von selbst nach —
und nur, wenn sie noch auf einem älteren Stand stehen. `verify:fusion-release` (in CI) schlägt fehl, sobald irgendwo wieder
eine feste Nummer oder eine handkopierte Optionsliste steht.

## 1 Diagnose (vor der Umsetzung, am Code gelesen)

Die Stufe `fs` wurde an einer Stelle zusammengesetzt (`forecastFromBundle`, `cubeSource.ts`), die Nummer per verschachtelter
Bedingung (`hourMean ? (atObs ? 9 : 8) : '7 (…)'`). Wer `defaultCubeIo()` nimmt, zog mit; alle anderen trugen Kopien:

| Teil | Stand vor FR | Ursache |
|---|---|---|
| Punkt-Panel, Dashboard, Regenradar-Streifen | Fusion 9 | `defaultCubeIo()` — kein Problem |
| Streckenprognose `scripts/road/road-forecast.mjs` | Fusion 8 | Optionen von Hand, `name: 'buscosun Fusion 8'`, `anchorAtObsTime: false` fest, Stufen-Prüfung per Regex auf „Fusion 8" |
| Kartenfelder `scripts/point/build-point-fields.mjs` | Fusion 8 | eigene Liste `FIELD_FUSE_OPTIONS` (jede neue Option von Hand) |
| Autobahnwetter-Seite (`RoadReadout`, `RoadDock`, `RoadPage`, `roadFcView`, `roadFc`) | „buscosun Fusion 8" | 9 feste Textstellen im Code, dazu der Vertragstext `ROAD_FC_SOURCE_TEXT` |
| Kartenfeld-Vertrag `fieldFormat.ts` | „wie bei buscosun Fusion 8" | fester Text im Manifest |
| Wiederholungs-Schutz `repeatVerdict` (V-AW-31) | — | kannte den Stand nicht: ein Lauf mit neuem Code, aber gleichen Eingaben wäre bis zur nächsten Stunde übersprungen worden |

## 2 Entscheidungen (Jan, 05.10.2026)

- **E-FR-1 — eine Nummer überall.** Jeder Teil, der die Stufe rechnet, heißt nach dem neuesten Stand; fehlt einem Teil die
  Eingabe eines Stands (Streckenprognose ohne Messung bei Fusion 9), sagt er es in eigenen Worten („ohne Messungs-Anker").
  Das ersetzt den Satz vom 04.10. („road/fc und die Kartenfelder bleiben buscosun Fusion 8"); die Rechnung dort ändert sich
  nicht (ohne Messung und mit Messung zur vollen Stunde ist Fusion 9 ≡ Fusion 8).
- **E-FR-2 — komplett umsetzen** (Register, Verbraucher, Name aus der Datei, Versionsstempel + Neubau-Regel, Wächter).

## 3 Umsetzung

**Register** `fusion/fusionRelease.ts` (importfrei): `FUSION_RELEASES` (7, 8, 9 — je Stand Option, Wert, Notiz, Beleg,
`CubeIo`-Schalter mit URL-Flag, benötigte Eingabe), Basis `FUSION_BASE_OPTIONS` (Fusion 6), daraus `FUSION_CURRENT`,
`FUSION_NAME`, `fusionStage(off)` (Optionen, erreichter Stand, Etikett, Notiz), `fusionStageIo()` (Tabellen, `stage: 'fs'`,
Leser-Schalter), `fusionStageNote`/`fusionVersionOfNotes`, `fusionVersionOfEngine`/`fusionProductBehind`. Die Konstanten
`FUSION7_…`/`FUSION8_…`/`FUSION9_…` liegen jetzt dort; `cubeSource.ts` re-exportiert sie.

**Verbraucher**
- Motor: `forecastFromBundle` nimmt `fusionStage((r) => io[r.io.key] === false)`; `defaultCubeIo()` nimmt `fusionStageIo()`.
  Wortlaut der Stufen-Notiz und Rückfälle (`?hm=0` ⇒ „Fusion 7 (Stundenmittel per Schalter aus)", `?anc=0` ⇒ „Fusion 8")
  unverändert — `verify:pv-cube` Block (29) ist **nicht angefasst** und bleibt grün (Byte-Beweis mit eigener Negativkontrolle dort).
- Streckenprognose: `makeIo` nimmt `fusionStageIo()` (kein fester `anchorAtObsTime: false` mehr), der Kopf trägt
  `engine.name = FUSION_NAME` und neu `engine.version`; ein Punkt zählt nur mit `fusionVersionOfNotes(…) === FUSION_CURRENT`.
- Kartenfelder: `FIELD_FUSE_OPTIONS = { hourly, tail, learned, ...fusionStage().options }`; das Manifest nennt den Stand in
  `chain.options.fusion`/`fusionName`. Etikett bleibt „Modell · Cube" (F1).
- Autobahnwetter-Seite: `roadFcEngineName(file)` — der Name kommt aus der **Laufdatei** (der Stand, mit dem sie gebaut
  wurde), ohne Datei nur „buscosun Fusion" ohne Nummer; die Quellenzeile zeigt `file.source`.

**Automatisches Nachziehen der Datenprodukte**
- `road/fc`: `repeatVerdict` wertet einen letzten Lauf mit älterem (oder unbekanntem) Stand nie als Wiederholung ⇒ der
  erste Job nach dem Push baut einmal neu, danach greift der Schutz wieder. Der Job klont `main`, also wirkt es mit dem Push.
- `point/field`: wird ohnehin mit jedem Punkt-Cron neu gebaut; ab dann steht der Stand im Manifest.
- Bis dahin zeigt die Seite ehrlich den Stand der vorhandenen Datei (heute „buscosun Fusion 8").

**Wächter** `verify:fusion-release` (in `ci.yml`): A Register (Lücken, neuester Stand, je Schalter der Stand davor, Notiz ⇄
Stand, Produktstempel) · B kein „buscosun Fusion ‹n›" im Code außerhalb des Registers (805 Dateien, Kommentare frei, 2
begründete Ausnahmen = Provenienzzeilen von Optionen) und kein handkopierter Optionsschlüssel außerhalb von Motor/Leser —
beides mit Gegenprobe auf das eigene Muster · C sieben Plattformteile hängen am Register (Tabelle in der Ausgabe) ·
`--live` liest `road/fc` und `point/field` im Daten-Repo und sagt, welcher Stand dort liegt (nur Auskunft).

## 4 So kommt der nächste Stand (Fusion 10)

1. Motor-Option bauen und messen wie bisher (`FuseCubeOptions`, voreingestellt aus).
2. **Ein Eintrag** am Ende von `FUSION_RELEASES` (Nummer, Datum, Beleg, Option, Wert, Notiz; `io` nur mit Rückfall-Schalter).
3. `npm run verify:fusion-release` — zeigt je Plattformteil den Stand; rot, wenn ein Teil nicht am Register hängt.
4. Push (Jan). Die Crons ziehen `road/fc` und `point/field` beim nächsten Lauf nach; Kontrolle mit `--live`.
5. `CLAUDE.md`: Absatz „Bezeichnung buscosun Fusion 10".

## 5 Gates (05.10.2026, sauberer Arbeitsbaum + diese Änderung)

| Gate | Ergebnis |
|---|---|
| `verify:fusion-release` (neu) | 11/11 |
| `verify:pv-cube` (unverändert) | 421/421 |
| `verify:road-fc` | 90/90 (neu K2b: älterer Stand ⇒ Neubau, mit Gegenprobe) |
| `verify:np0-fields` | 29/29 (Konsistenz Feld ⇄ volle Rechnung mit den Register-Optionen) |
| `verify:point-client` | 171/171 |
| `verify:road-ui` (Browser, gegen `vite preview`) | 55/55 — P5/P7: die Seite zeigt „buscosun Fusion 8" aus der Fixture-Datei, während der Code 9 rechnet |
| typecheck / Build | 0 / 252/252 |
| Budget | grün nach Anhebung totalJs 1 551 → 1 553 (§6), eagerJs 108,9 unverändert |

Die fünf Fragen: (1) Funktionserhalt — keine Funktion entfernt, Rückfall-Schalter `?hm=0`/`?anc=0` und ihr Wortlaut
unverändert (Block 29). (2) Desktop — nur Texte der Autobahnwetter-Seite: Nummer aus der Datei, im Dock ohne Nummer.
(3) Touch-Targets unberührt. (4) Konsole — `verify:road-ui` ohne Seitenfehler. (5) kein neuer Rechenpfad im Hauptthread.

## 6 Budget

Kontrollbau von HEAD `8d8d594` in einem Worktree gegen den Arbeitsstand, Chunk-Vergleich mit gzip -9:

| Metrik | HEAD | mit FR | Grenze |
|---|---|---|---|
| eagerJs | 108,9 | 108,9 | 109 (unverändert) |
| totalJs | 1 550,4 | 1 551,7 | 1 551 → **1 553** (Notiz in `budget.json`) |

+1,3 KB gzip: neuer geteilter Lazy-Chunk `fusionRelease` +1,10 (von `cubeSource` und `RoadPage` gelesen), `RoadPage` +0,12,
`cubeSource` −0,10. Nichts im Start-Chunk. `npm run budget` danach grün.

## 7 Befunde

- **V-FR-1** `scripts/road/workflow-road-fc.yml` nennt im Kopfkommentar noch „buscosun Fusion 8" (nur Kommentar; die
  Kopie im Daten-Repo ist Jans Gate) — beim nächsten Anfassen der Vorlage ohne Nummer schreiben.
- **V-FR-2** Die Verifier `verify:pv-cube` (29) pinnen den Wortlaut der Stufen-Notiz mit festen Nummern — gewollt als
  unabhängiger Anker; ein neuer Stand braucht dort seine eigene Prüfung (wie 7, 8, 9).
- **V-FR-3** Der Sammler des Punktarchivs ruft den Live-Pfad (`getPointForecast`), nicht die Stufe — er trägt keinen Stand;
  sobald er den Cube-Pfad archiviert (AP9, Schema 4+), gehört er als achter Teil in Block C des Wächters.
- **V-FR-4** `engine.version` ist neu im Kopf von `road/fc`; `buscosun-archiv` (`road-fc-archive.mjs`) reicht den
  `engine`-Block unverändert durch — Auswertungen können ab dem ersten neuen Lauf nach Stand trennen.

## 8 Phase FR-2 — die ganze Plattform rechnet mit buscosun Fusion (Auftrag Jan 06.10.2026)

> Auftrag: „Wenn eine neue Version von buscosun Fusion qualifiziert wurde und ich sie aktivieren möchte, soll sie auf der
> gesamten Plattform aktiv werden — nicht überall einzeln nachziehen (Niederschlagsradar, Wetterkarte, Dashboard,
> Routenplaner, Eventplaner)."

### 8.1 Diagnose (am Code gelesen, 06.10.)

Das Register (§3) erreicht jeden Teil, der die Stufe `fs` rechnet. Es erreicht keinen Teil, der den **Live-Pfad**
(`getPointForecast` ohne `pointSource: 'cube'`) ruft — dort gibt es keine Stufe, also auch keinen Stand.

| Teil | Aufruf | Stand heute |
|---|---|---|
| Punkt-Panel (Wetterkarte), Dashboard, Regenradar-Streifen | Cube, `defaultCubeIo()` | neuester Stand (§3) |
| Kartenfelder, Streckenprognose, Autobahnwetter | Register | neuester Stand (§3) |
| Kartenebenen der Wetterkarte | Rasterfusion (`src/fusion/`) | nicht buscosun Fusion — nicht betroffen |
| **Routenplaner** | `weatherEnrichment.ts` (je Cluster, 4 parallel), `route/windSampling.ts` | Live-Pfad — zieht nie nach |
| **Eventplaner** | `EventResult.tsx` (≤ 180 h, Radar), `eventZoneScan.ts` (Ecken nacheinander), `eventAltLocation.ts` | Live-Pfad |
| **Vertikalschnitt / 3D / Föhn** | `threed/buildCrossSection.ts` (5 Anker, 36 h), `atmosphere/TalwindPanel.tsx` (48 h) | Live-Pfad |
| **Benachrichtigungen** | `notifications/useNotifications.tsx` | Live-Pfad |

Lücken der Cube-Ausgabe für diese Aufrufer: **kein UV-Index** (`uvIndex: null` überall; der Live-Pfad holt in DE die
DWD-UV-Vorhersage, der Eventplaner bewertet damit); Wolken unten/mittel/oben nur an nativen Schritten (zwischen den
Schritten `null`; der Vertikalschnitt zeichnet sie, liest `?? 0`); ohne `onUpdate` wartet der Cube-Pfad die Fristen ab
(Messung, Radar). Jeder Aufrufer hat eine eigene Kopie des Musters „Cube laden, bei Fehler live" (Panel, Streifen) —
oder gar keine.

### 8.2 Entscheidungen (Jan, 06.10.2026)

- **E-FR-3 — bauen, messen, dann an:** ein zentraler Einstieg für alle Teile; je Teil ein Schalter, voreingestellt aus;
  jeder Teil wird nach der Messung eingeschaltet, wenn er nicht schlechter wird; ein Teil, der schlechter würde, bleibt aus
  und wird benannt.
- **E-FR-4 — DWD-UV dazuholen:** der Einstieg holt in DE die DWD-UV-Vorhersage wie der Live-Pfad und trägt sie mit
  Herkunft in die Stunden ein, in denen der Cube keinen UV-Wert hat.

### 8.3 Plan

1. **Teile im Register** (`fusionRelease.ts`, importfrei): `FUSION_PARTS` — je Teil Kennung, Name, `on`. Ein neuer Stand
   braucht dort nichts; ein neuer Teil ist eine Zeile.
2. **Einstieg** `src/pointForecast/fusionForecast.ts`: `getFusionForecast(opts, part)`. Teil an (oder `?pf=cube`) ⇒
   `cubeSource` laden, Stufe `fs` mit Radar (die Stände 8/9 brauchen Radar und Messung), UV ergänzen; Fehler (kein
   Abbruch) ⇒ Live-Pfad mit Konsolenmeldung. Teil aus (oder `?pf=live`) ⇒ **exakt** der bisherige Aufruf
   `getPointForecast(opts)`. Die Stunden-Objekte des Cube-Caches werden nicht verändert (Panel und Dashboard teilen ihn).
3. **Verbraucher** rufen den Einstieg mit ihrem Teil; ohne Schalter ändert sich nichts (byte-gleich).
4. **Wächter** `verify:fusion-release` Block C: die neuen Teile in der Tabelle, und **C3**: kein Aufruf von
   `getPointForecast(` außerhalb des Kerns, der weder den Cube verlangt noch über den Einstieg geht (ein künftiger Teil,
   der den Live-Pfad direkt ruft, macht den Wächter rot) — mit Gegenprobe.
5. **Messung** (§8.4) je Teil, dann Einschalten je Teil.

### 8.4 Messregel (eingefroren vor dem Lauf)

Orte: München, Hamburg, Garmisch-Partenkirchen (DE), Innsbruck (AT), Zürich, Davos (CH). Je Ort und Teil der Aufruf des
Teils (Stunden und Optionen wie im Code) einmal über den Live-Pfad, einmal über den Cube-Pfad des Einstiegs (`?pf=` als
Erzwingung), Desktop ohne Drossel, je Messung ein frischer Browser-Kontext (kalt), danach im selben Kontext ein Punkt
3 km daneben (warm). Ein Teil wird eingeschaltet, wenn **beide** Kriterien halten:

- **K1 Felder:** für jedes Feld, das der Teil liest, ist der Anteil belegter Stunden im Fenster des Teils über alle Orte
  mit dem Cube ≥ dem Live-Pfad − 2 Prozentpunkte. Ausnahme nur benannt.
- **K2 Ladezeit:** Median kalt und Median warm über die Orte: Cube ≤ 1,25 × Live **oder** ≤ Live + 300 ms.

Kontext ohne Gate: Abweichung der Werte zwischen den Pfaden (Median |Δ| T, Wind, Niederschlag, Bewölkung). Die
Genauigkeit selbst ist keine Frage dieser Messung — der Punkt der Wetterkarte rechnet seit E-FS-7 auf dem Cube, die
Stände sind am Archiv gegen ihre Vorgänger gemessen (`audit/fusion-ausbau.md`).

### 8.5 Umsetzung

- **Register:** `FUSION_PARTS` in `fusionRelease.ts` (Routenplaner, Eventplaner, Vertikalschnitt / 3D / Föhn,
  Benachrichtigungen; alle `on: false`), `fusionPartOn(id)`. Einschalten eines Teils = `on: true` in einer Zeile.
- **Einstieg** `src/pointForecast/fusionForecast.ts`: `getFusionForecast(opts, part, { path? })`, `fusionPathFor`,
  `withDwdUv`. Teil aus ⇒ `return getPointForecast(opts)` mit demselben Objekt (byte-gleich). Teil an ⇒ `cubeSource`
  laden, Stufe `fs` mit `includeRadarNowcast: true`, Stunden des Teils; parallel in DE `fetchDwdUvPoint` (derselbe Abruf
  wie im Live-Pfad), eingetragen nur in Stunden ohne UV, Sicherheit `singleSourceConfidence('uvIndex', lead)` (neu exportiert
  aus `pointForecast.ts`, genau der Wert des Live-Blends für eine Einzelquelle), Herkunft `sourcesAvailable: dwd_uv` und
  `cube.uv`; neues Objekt, der geteilte Cube-Cache bleibt unberührt. Fehler ⇒ Live-Pfad mit Konsolenmeldung; Abbruch ⇒ kein
  Rückfall. `?pf=cube` / `?pf=live` erzwingen (neu `pfForceFrom`, das Panel liest weiter `pfSourceFrom`).
- **Verbraucher:** acht Aufrufe in sieben Dateien rufen `getFusionForecast(…, '<teil>')` (Tabelle in `verify:fusion-release` C1).
- **Wächter** `verify:fusion-release` **16/16**: C1 15 Plattformteile; **C3** kein direkter Live-Aufruf in `src` außerhalb des
  Kerns (2 benannte Rückfälle: Panel 2×, Regenradar-Streifen 1×; Zahl je Datei fest) mit Gegenprobe; **C4** Weg je Teil,
  UV-Ergänzung (inkl. unverändertem Eingabeobjekt), Cube-Aufruf mit Radar und Stunden, Abbruch ohne Rückfall.
  Dazu: `scripts/pruefstand/` aus dem B-Scan genommen (das Versionsregister des Prüfstands hält die historischen Stände
  5e…9 absichtlich fest — B2/B3 waren seit PS rot, nicht durch FR-2).
- **Messwerkzeug** `scripts/fusion-platform-measure.mjs` (CDP gegen einen Vite-Dev-Server, frischer Kontext je Messung).

### 8.6 Messung (Regel §8.4) — kein Teil eingeschaltet

Rohdaten und Tabellen: `audit/fusion-release/platform-measure.{json,md}` (06.10.2026, 19:21 und 19:26 UTC).

| Teil | K1 Felder | K2 kalt (Median live → Cube) | K2 warm | Verdikt |
|---|---|---|---|---|
| Routenplaner | ✗ Windrichtung 100 → 43,7 % | ✗ 775 → 1 466 ms | ✓ 398 → 601 | bleibt aus |
| Eventplaner | ✗ Windrichtung 100 → 27,1 % | ✓ 889 → 1 113 ms | ✓ 452 → 380 | bleibt aus |
| Vertikalschnitt / 3D / Föhn | ✗ Windrichtung 100 → 42,6 % | ✓ 1 187 → 1 223 ms | ✓ 681 → 544 | bleibt aus |
| Benachrichtigungen | ✓ | ✗ 784 → 1 133 ms | ✓ 423 → 493 | bleibt aus |

Alle übrigen Felder: Cube gleich oder besser belegt (relative Feuchte 100 % statt 16–69 %, Schneefallgrenze 88 statt 68 %,
Wolken unten/mittel/oben 100 % bis 36 h), DWD-UV in DE genau wie im Live-Pfad (14–29 % der Stunden: die DWD-Vorhersage
reicht 3 Tage), 0 Rückfälle, 0 Fehler an 24 × 2 Messungen. Kontext |Δ| Cube − live (Median): T 0,4–0,6 K, Wind 0,1–0,4 m/s,
Niederschlag 0,01 mm/h. **Korrektur nach dem Lauf:** die Feldliste der Benachrichtigungen enthielt die Windrichtung, die
dieser Teil nicht liest (`recommendBestDay`, `notificationEngine`); aus denselben Rohdaten neu ausgewertet, K1 erfüllt.

### 8.7 Befunde

- **V-FR-5 Windrichtung.** buscosun Fusion meldet keine Richtung, wenn der mittlere Windvektor gegen seine Streuung zu schwach
  ist (`fuse.ts`, `WIND_DIR_MIN_CONCENTRATION`: „keine Richtung statt einer erfundenen"), und an interpolierten Schritten
  (`toPointForecast`: `windDirection: null`) — an den sechs Orten in 57–73 % der Stunden. Der Live-Pfad meldet immer eine.
  Folgen beim Einschalten: Vertikalschnitt und Talwind lesen `?? 0` ⇒ **Nordwind gezeichnet** (falsch); der Wind der Tourzeit
  (`windSampling`) verwirft Stunden ohne Richtung (weniger Wind in der Zeitrechnung); die Event-Fläche zeigt „keine Richtung"
  (vorgesehen). Mehrwert der Behebung: diese Teile können eingeschaltet werden. Skizze: E-FR-5.
- **V-FR-6 Ladezeit Routenplaner kalt +0,7 s.** Der Cube-Pfad wartet ohne `onUpdate` die Fristen ab (Messung 1,5 s + Gnade,
  Radar); der Live-Aufruf des Routenplaners holt kein Radar. Skizze: Einstieg liefert dem Routenplaner die erste vollständige
  Ausgabe (`onUpdate`, Kern) und reicht die Nachlieferung nach; oder der Routenplaner ohne Radar-Member (er hat sein eigenes
  Radar für 0–2 h) — dann rechnet er bei Niederschlag 1–2 h Fusion 7 und muss das sagen. Neu messen.
- **V-FR-7 Benachrichtigungen kalt +0,35 s.** Die Prüfung läuft im Hintergrund, niemand wartet auf sie — K2 ist hier
  vermutlich das falsche Maß. Jans Entscheidung (E-FR-6).
- **V-FR-8** `verify:pv-cube` (8)/(9)/(16) fallen unter Last wechselnd, auch am sauberen HEAD (Worktree: 418/421, dann
  421/421); (16) wartet fest 400 ms auf eine Neu-Lesung. Mit FR-2 zuletzt 421/421. Skizze: (16) auf das Ereignis warten statt
  auf die Uhr.

### 8.8 Offene Entscheidungen (Jan, `MANUELLE-SCHRITTE.md` §42)

- **E-FR-5 Windrichtung** (V-FR-5): (a) die Teile behandeln „keine Richtung" ehrlich (Schnitt/Talwind ohne Pfeil statt
  Nordwind, Tourzeit ohne Gegenwind-Anteil in diesen Stunden) — Empfehlung, berührt nur die Teile; (b) der Einstieg ergänzt die
  Richtung des Modellmittels, gekennzeichnet als unsicher — widerspricht der Regel im Motor, berührt die Ausgabe von
  buscosun Fusion (STOPP-Regel); (c) die drei Teile bleiben aus.
- **E-FR-6 Benachrichtigungen:** einschalten trotz K2 kalt (Hintergrundprüfung), oder aus lassen.
- **E-FR-7 Routenplaner:** V-FR-6 bauen und neu messen.

### 8.9 Gates (06.10.2026)

| Gate | Ergebnis |
|---|---|
| `verify:fusion-release` | 16/16 |
| `verify:pv-fusion` | 235/235 |
| `verify:point-client` | 171/171 |
| `verify:event-zone` | 102/102 |
| `verify:route-3d` | 587/587 |
| `verify:pv-cube` | 421/421 (Lauf 5; davor wechselnd 420/421 an (8)/(9)/(16), am HEAD ebenso — V-FR-8) |
| typecheck / Build | 0 / 252/252 |
| Budget | grün nach Anhebung totalJs 1 557 → 1 559 (Kontrollbau HEAD 1 555,5 → 1 557,7: +1,48 Chunk `fusionForecast`, Rest Vorlade-Einträge), eagerJs 108,98 / 109 |

Die fünf Fragen: (1) Funktionserhalt — keine Funktion entfernt; jeder Teil ist aus und ruft `getPointForecast(opts)` mit
demselben Objekt wie vorher (C4, Codepfad). (2) Desktop — keine UI geändert, Werte unverändert, solange die Teile aus sind.
(3) Touch-Targets unberührt. (4) Konsole — 48 Messungen ohne Fehler, kein Rückfall. (5) kein neuer Rechenpfad im
Hauptthread, solange aus; eingeschaltet rechnet der Cube-Pfad wie im Panel (V-FI-50 gilt dann auch hier).

**Wie ein neuer Stand jetzt wirkt:** Eintrag im Register (§4) ⇒ Panel, Dashboard, Regenradar-Streifen, Kartenfelder,
Streckenprognose sofort; jeder eingeschaltete Teil aus `FUSION_PARTS` ebenso. Ein künftiger Teil, der den Live-Pfad direkt
ruft, macht `verify:fusion-release` (C3) rot.

### 8.10 E-FR-7 entschieden — Routenplaner eingeschaltet (Jan 06.10.2026)

Jan: „nutze es einfach, die Zeit ist erstmal nicht so wichtig." ⇒ `FUSION_PARTS.route.on = true` trotz K2 kalt (+0,7 s) und
trotz V-FR-5 (E-FR-5 weiter offen). Folge von V-FR-5 im Routenplaner: der Wind der Tourzeit (`windSampling.ts`) verwirft
Stunden ohne Richtung und nimmt dort die Nachbarstunden; ein Abschnitt mit < 2 Stunden mit Richtung rechnet ohne Wind; die
Abschnittsanzeige zeigt „keine Richtung".

**Durchlauf im Browser** (Dev-Server, Testtour 6 Punkte München → Südwest, 25 km, Abfahrt +1 h, ohne `?pf`):
`enrichSampleWeather` und `createWindSampler` auf dem Cube ohne Fehler und ohne Rückfall; Windrichtung an 2 von 6 Abschnitten
(1,4 m/s, Flaute — V-FR-5), Tourwind aus 2 Clustern mit 50 Stunden; Konsole nur die INCA-Ladezeile. Zeiten (je ein Lauf,
kalter Kontext): Cube Anreicherung 7,9 / 7,6 s + Tourwind 1,9 / 1,4 s; live 2,5 s + 9,2 s — in Summe nicht langsamer.
Gates nach dem Einschalten: `verify:fusion-release` 16/16 (Routenplaner „buscosun Fusion 9"), typecheck 0, Build 252/252,
Budget grün (totalJs 1 557,7 / 1 559), `verify:route-3d` grün.

- **V-FR-9 (älter als FR-2) Länderwahl `pickCountry`** (`clustering.ts`): wählt das Land mit dem größten Abstand zum Rand
  seines Rechtecks; das AT-Rechteck reicht bis 49° N / 9,5° O ⇒ Punkte in Südbayern werden als **AT** gerechnet (Testtour
  südwestlich München: `countries: ['AT']`, live wie Cube). Folgen: AT-Profil (Messungen TAWES statt DWD, INCA, kein DWD-UV,
  Horizont 60 h) für Routenplaner, Vertikalschnitt und Talwind in Südbayern. Mehrwert der Behebung: richtige Quellen und
  UV in Südbayern. Skizze: Landesgrenze per Punkt-in-Polygon (die Grenzen liegen in `public/countries`) statt Rechteck-Abstand;
  eigenes Thema, eigene Messung.

### 8.11 E-FR-5 und E-FR-6 entschieden — Eventplaner, Vertikalschnitt, Benachrichtigungen eingeschaltet (Jan 07.10.2026)

Jan: „bei Windrichtung setze a um und bei 2. ist die Ladezeit erstmal irrelevant, solange sie nicht zu extrem hoch wird …
setze jetzt Eventplaner und Vertikalschnitt mit buscosun Fusion um." Der Vorschlag davor (Eventplaner und Benachrichtigungen
gemeinsam, weil beide die Tage mit derselben Funktion bewerten) war „okay" ⇒ **alle vier Teile `on: true`**.

**E-FR-5 (a) umgesetzt — eine fehlende Richtung bleibt fehlend, nie 0° = Nord.** Regel überall gleich: zwischen zwei Stunden
(oder zwei Ankern) mit Richtung wie bisher als Vektor; fehlt sie an einem Ende, gilt die Richtung der **näheren** Stunde, sonst
keine; der Betrag wird immer linear weitergerechnet. Geändert (nur Teile, buscosun Fusion unberührt):

| Teil | Stelle | vorher | jetzt |
|---|---|---|---|
| Vertikalschnitt | `buildCrossSection.ts` (`TimeSample`, `sampleAnchorAt`), `crossSection.ts` (`AnchorSurface`, `SectionCell`, `interpAnchor`) | `windDirection ?? 0` | `null` bis in die Zelle |
| Vertikalschnitt | `SectionChart.tsx` (Pfeile Mittel/Böe, Strömungsrichtung), `TerrainMap.tsx`, `RouteTerrainMap.tsx` | Nordpfeil | kein Pfeil; Strömungsrichtung nur aus Zellen mit Richtung |
| Vertikalschnitt | Punkt-Abfrage `AtmosphereDeck.tsx`, `SectionView.tsx`; Legende beider Ansichten | „N" | „keine Richtung"; Legende „ohne Pfeil = keine eindeutige Richtung" |
| Talwind | `TalwindPanel.tsx`, `dynamics.ts` `talwindReversals` | Nordwind ⇒ falsche Umkehrungen | Stunden ohne Richtung tragen keine Komponente; Wechsel über sie hinweg, gemeldet an der ersten Stunde der neuen Richtung |
| Föhn | `dynamics.ts` `estimateFoehn` | — | reicht `null` an `detectFoehn` (nahm es schon an) |
| Routenplaner | `windSampling.ts` + `tourTiming.ts` | Stunden ohne Richtung verworfen, Nachbarstunden geborgt | Stunden bleiben; ohne Richtung kein Gegen-/Rückenwind in der Tourzeit |
| Routenplaner | `weatherEnrichment.ts` `lerpAngle` (Abschnittsanzeige) | Richtung der anderen Stunde geborgt | nähere Stunde oder keine (Live-Pfad: Richtung immer da ⇒ unverändert) |
| Routenplaner | `RouteMap.tsx` (Pfeil-Layer, Popup) | `?? 0` ⇒ Nordpfeil | Filter ohne Richtung, Popup „keine Richtung" |
| Routenplaner 3D | `routeSection.ts` | Spalte ohne Richtung ganz verworfen (auch Temperatur) | Spalte bleibt, ohne Pfeil |
| Eventplaner | `eventTerrain.ts`, `EventTerrainMap.tsx`, `eventZoneScan.ts` | las `null` schon richtig | unverändert |

**E-FR-6:** Benachrichtigungen an (Ladezeit kalt +0,35 s im Hintergrund, Jan: „irrelevant, solange nicht extrem").

**Wächter** `verify:fusion-release` **20/20** — neu C5: (1) Gegenprobe des Musters „Richtung `?? 0`" (trifft `?? 0`, nicht
`?? 0.5`, `?? null`, Kommentar); (2) kein Treffer in `src` (vorher drei: Schnitt, Talwind, Routenkarte); (3) die
Selbsttests `verifyCrossSection`/`verifyDynamics` grün, mit den neuen Fällen ohne Richtung (Anker-Interpolation, Zellen
`null`, Talwind über Lücken, nur Lücken ⇒ keine Umkehr); (4) `sampleAnchorAt` über die Zeit (270 / null / null / null).
`verify:route-3d` prüfte den Quelltext `(c.windDirDeg ?? 0) + 180` wörtlich ⇒ angepasst (Pfeil nur aus Spalten mit Richtung,
kein `?? 0`), 589/589.

**Durchlauf im Browser** (Dev-Server :5231, ohne `?pf`, 07.10. ≈ 04 UTC): alle vier Teile wählen den Cube
(`fusionPathFor` = cube), 0 Rückfälle. Schnitt Inntal (47,2/11,3 → 47,4/11,5): 85 von 185 Anker-Stunden ohne Richtung,
0 als 0° gelesen; über 8 Zeitpunkte 4 338 von 10 640 Zellen ohne Pfeil. Seite `/atmosphaere/querschnitt`: links und am
Ende Pfeile, über dem Inntal keine; Punkt-Abfrage „17 km/h · keine Richtung"; Legende mit dem neuen Eintrag; Föhn-Linse
Talwind „Mi 22:00 — dreht auf bergab"; Konsole ohne Fehler und Warnungen (gesammelt ab Dokumentstart). Eventplaner München
180 h auf dem Cube (94 von 181 Stunden ohne Richtung, 45 UV-Stunden aus dem DWD), Benachrichtigungen Zürich auf dem Cube.
Schnitt-Vorbereitung kalt 7,3 s (DEM + 5 Anker, Dev-Server).

**Gates:** `verify:fusion-release` 20/20, `verify:route-3d` 589/589, `verify:event-zone` 102/102, typecheck 0, Build grün.
Budget: diese Änderung allein (Worktree HEAD `18ab8ca` gegen HEAD + Patch) totalJs 1 557,9 → 1 558,0 KB — keine Anhebung;
der Arbeitsbaum steht wegen der parallelen Autobahn-Sitzung bei 1 560,1 / 1 561 (deren Anhebung, §43).

Die fünf Fragen: (1) Funktionserhalt — nichts entfernt; die 3D-Routenspalten ohne Richtung kommen sogar zurück. (2) Desktop —
Schnitt-Legende um einen Eintrag länger; Pfeile fehlen genau dort, wo buscosun Fusion keine Richtung meldet (gewollt).
(3) Touch-Targets unberührt. (4) Konsole sauber (s. o.). (5) Rechnung unverändert (Cube-Pfad wie im Panel, V-FI-50).

- **V-FR-10 (älter als FR-2) Bildunterschrift des Schnitts:** „Wind auf realer Höhe über Grund (AGL) aus
  ICON-D2-Druckflächen + DEM interpoliert" — der Schnitt nimmt den Bodenwind der Punktvorhersage (jetzt buscosun Fusion) und
  rechnet die Höhe mit dem Potenzgesetz, Druckflächen liest er nicht. Mehrwert: die Herkunft stimmt (Ehrlichkeitsregel). Skizze:
  „Bodenwind aus buscosun Fusion, Höhenprofil nach Potenzgesetz + Gelände (DEM)"; dasselbe in der Liste der Startseite.

### 8.12 V-FR-10 und V-FR-9 behoben (Jan 07.10.2026: „beides beheben")

**V-FR-10 — Herkunft im Vertikalschnitt.** Der Schnitt nannte sich an neun Stellen „ICON-D2“ („ICON-D2-Druckflächen“,
„Gitterzellen ≈ 2 km · 333 m“, im Kopf fest „ICON-D2 · 08:00 UTC“ unabhängig vom Abruf, „Modelllauf“ = in Wahrheit die
Abrufzeit). Er rechnet aber den Bodenwind der Punktvorhersage an 5 Punkten der Linie mit dem Potenzgesetz über das Gelände
hoch, mit Höhenstufen von 150 m, und liest keine Druckflächen. Jetzt steht die Herkunft an EINER Stelle:
`PreparedSection.source` = welcher Weg die Anker wirklich geliefert hat (`fusionSourceOf`: Cube ⇒ `fc.cube`), Text
`sectionOrigin` = `fusionSourceText` im Register (`fusionRelease.ts`, importfrei): „buscosun Fusion ‹n›“, bei Rückfall
„Live-Punktvorhersage“, gemischt beides. `SECTION_ANCHORS`, `SECTION_METHOD`, `SECTION_LEVEL_STEP_M` als Konstanten.

| Stelle | vorher | jetzt |
|---|---|---|
| Kopf der Atmosphären-Ansicht | „ICON-D2 · 08:00 UTC" (fest) | „buscosun Fusion 9 · 09:04 Uhr" (Stand + Abrufzeit), ohne Schnitt nur die Marke |
| Hinweis über dem Schnitt | „Gitterzellen ≈ 2 km · 333 m" | „5 Wetterpunkte entlang der Linie · Höhenstufen 150 m" |
| Bildunterschrift Desktop / mobil | „… aus ICON-D2-Druckflächen + DEM" | „buscosun Fusion 9 · Bodenwind an 5 Punkten der Linie, Höhe über Grund nach Potenzgesetz + Gelände (DEM)" |
| Inversion-Hinweis | „ICON-D2 + DWD-Beobachtung" | Herkunft des Schnitts |
| Go/No-Go (Desktop, mobil, Text-Export `GoNoGoPanel`, PDF-Bericht) | „Modell ICON-D2, Gitterzellen ≈ 2 km", „Modelllauf" | „Daten: buscosun Fusion 9, 5 Wetterpunkte …", „Abgerufen … · buscosun Fusion 9" |
| 3D-Ansichten `SectionView`/`TerrainView`/`ThreeDPage` | „Datenstand: ICON-D2 + DEM", „Auflösung ≈ 2 km" | Herkunft + „Gelände (DEM)", Methode |
| Einstieg `AtmospherePage` | „Aus ICON-D2-Druckflächen …" | „Bodenwind aus buscosun Fusion, Höhenprofil aus ICON-EU-Druckflächen, Gelände (DEM)" (Emagramm/Föhn lesen wirklich ICON-EU) |
| 3D-Route im Routenplaner (`sourceNote`) | Live-Stacks je Land „DWD (ICON-D2 / MOSMIX …)" — seit E-FR-7 falsch | auf dem Cube „buscosun Fusion 9 (Punkt-Cube + Messungen + Radar)"; live wie bisher (`EnrichmentMeta.pointSource`) |

**V-FR-9 — Land eines Punkts.** `pickCountry` nahm die Länder-Box, in der der Punkt am tiefsten liegt; die AT-Box reicht bis
49,5° N ⇒ **München, Rosenheim, Kempten, Garmisch** galten als AT (AT-Profil: TAWES statt DWD-Messungen, kein DWD-UV,
60 h). Am Raster 0,05° über 45–56° N × 5–18° O lagen **919 Punkte in Deutschland falsch in AT (4,7 % der deutschen Fläche)**,
dazu 124 DE→CH, 72 AT→CH, 135 DE→AT, 15 CH→AT. Jetzt: liegt der Punkt in genau einer Box, wie bisher; wo sich Boxen
überlappen, entscheidet die Landesgrenze (`public/countries`, erzeugt nach `src/pointForecast/countryBorders.ts` von
`scripts/gen-country-borders.mjs`, auf die Überlappungs-Rechtecke beschnitten — 1 014 statt 1 716 Punkte, Gerade-Ungerade-Regel
mit Enklaven Büsingen und Jungholz); außerhalb von DE/AT/CH (Vaduz, Bozen, Straßburg) die Box-Regel. Beschnitten und
unbeschnitten ändern dieselben 1 265 Rasterpunkte. Wirkt in Routenplaner (Anreicherung, Tourwind), Vertikalschnitt, Talwind,
Atmosphäre-/3D-Tourimport.

- **V-FR-11 (älter) Niederschlagsgitter der Karte** (`precipComposite.ts`): ordnet jede Zelle mit der Box-Regel einer
  Radarquelle zu — Südbayern samt München malt INCA statt RADOLAN; der Kommentar dort behauptete das Gegenteil (jetzt
  richtiggestellt). Bewusst NICHT umgestellt: es ändert die Radarbilder von Wetterkarte und Regenradar und bräuchte eine
  Nachschlagetabelle statt eines Polygontests je Pixel. Die Box-Regel liegt jetzt als `pickCountryByBox` in
  `countryProfiles.ts`, damit die Karte die Grenzen nicht lädt. Mehrwert: Südbayern bekommt das DWD-Radar. Skizze: Länderraster
  einmalig beim Bau (oder als statische Maske), dann `PrecipCompositor` daraus; Pixel-Diff gegen HEAD als Gate.
- **V-FR-12 (älter)** Kopf der Atmosphären- und der 3D-Ansicht zeigt feste Initialen „JK" (Vorlage) — kein Konto dahinter.

**Wächter** `verify:fusion-release` **27/27**: neu C6 (23 Orte an den Grenzen inkl. Büsingen; Gegenprobe: Box-Regel allein ⇒
München/Rosenheim AT; Raster: jede Abweichung liegt im gewählten Land, außerhalb von DE/AT/CH unverändert; Grenzdatei
stammt aus `public/countries` — jeder Punkt ein Quellpunkt oder ein Schnitt mit dem Rechteck) und C7 (kein „ICON-D2" in
sieben Dateien des Schnitts, mit Gegenprobe; Herkunftstext folgt dem Weg cube/live/gemischt; 3D-Route ebenso).
`verify:regenradar-profile`: seine HEAD-Referenz des Niederschlagsgitters lud HEADs `precipComposite.ts` gegen das
AKTUELLE `clustering.ts` ⇒ C1/C2/D1/D2/D6/D7 rot, obwohl das Gitter unverändert ist — die Referenz lädt jetzt auch HEADs
`clustering.ts`; danach 34/35, offen nur E7 („`src/pointForecast` ohne Diff zu HEAD", Wache der Phase RR — grün nach dem
Commit, wie bei FR-2).

**Durchlauf im Browser** (Dev-Server :5231): `pickCountry` München/Rosenheim DE, Innsbruck AT; Testtour München → Südwest
`countries: ['DE']` (vorher `['AT']`), `pointSource: 'fusion'`, UV 1,9–2,6 an allen 6 Abschnitten (vorher keiner);
Querschnitt München → Süd (48,10/11,45 → 47,70/11,75): Anker `fusion`, Kopf „buscosun Fusion 9 · 09:04 Uhr", Hinweis
„5 Wetterpunkte entlang der Linie · Höhenstufen 150 m", Bildunterschrift wie oben, Go/No-Go „Daten: buscosun Fusion 9, 5
Wetterpunkte entlang der Schnittlinie"; auf keiner der beiden Seiten „ICON-D2"; Konsole ohne Fehler und Warnungen.

**Gates:** `verify:fusion-release` 27/27, `verify:route-3d` 589/589, `verify:event-zone` 102/102, `verify:regenradar-profile`
34/35 (E7 s. o.), `verify:precip-source`/`verify:layer-geometry` grün, typecheck 0, Build grün. Budget: Kontrollbau Worktree
HEAD `18ab8ca` 1 557,9 gegen HEAD + diese Änderungen (§8.11 + §8.12) 1 564,1 KB = **+6,2** (Grenzdaten ≈ 5,5 im Lazy-Chunk
`clustering`); Grenze 1 561 → **1 567** mit Notiz (Arbeitsbaum mit der AW-Sitzung 1 566,2); eagerJs 108,9 unverändert.

Die fünf Fragen: (1) Funktionserhalt — nichts entfernt; die Box-Regel bleibt (`pickCountryByBox`). (2) Desktop — nur Texte
der Atmosphären-/3D-Ansicht geändert (Länge ähnlich), Karte byte-gleich (`verify:regenradar-profile` C1). (3) Touch-Targets
unberührt. (4) Konsole sauber. (5) Polygontest nur in der Überlappung, je Abfrage ≈ 700 Kanten — kein Long Task.

### 8.13 V-FR-11 und V-FR-12 umgesetzt (Jan 07.10.2026: „setze das hier jetzt um")

Jans Rückfrage vorab: „in Österreich wird aber schon INCA dann später verwendet?" — ja: das Gitter nimmt je Zelle das Radar
ihres Landes (DE RADOLAN-RV 0–2 h, AT INCA 0–3 h, CH rzc „jetzt“, danach ICON-D2); V-FR-11 ändert nur, welches Land eine
Zelle in der Überlappung der Boxen bekommt.

**V-FR-11 — Niederschlagsgitter der Karte (Wetterkarte, Regenradar, `?rr=legacy`).** `PrecipCompositor` ordnet jede Zelle mit
derselben Regel zu wie die Punktvorhersage. Die Regel liegt jetzt in `src/pointForecast/countryOfPoint.ts` (`pickCountry`,
`inCountry`, neu `countryRowPicker`); `clustering.ts` reicht sie weiter. `countryRowPicker(lat)` rechnet je Gitterzeile einmal
die Schnittpunkte der Grenzen und die Box-Abstände, je Zelle dann eine binäre Suche — Zelle für Zelle gleich `pickCountry`
(307 200 Zellen, 0 anders) und **gleich schnell wie die Box-Regel** (Node, Median 7 Läufe: 51,5 gegen 54,4 ms; die erste
Fassung mit `pickCountry`-Aufrufen je Zelle brauchte 184 ms ⇒ verworfen).

Gemessen auf echten Frames (RV 07.10. ≈ 09 UTC, INCA, rzc): Zellen mit neuem Land **AT→DE 5 519** (Südbayern samt München:
jetzt RADOLAN statt INCA), DE→AT 971, DE→CH 921, AT→CH 467, CH→AT 98; das Bild ändert sich NUR in diesen Zellen (an h 0/1/2,5
14 Werte anders, 0 außerhalb — wenig Regen an diesem Morgen). Folge in Südbayern: RADOLAN reicht 2 h, INCA reichte 3 h ⇒
zwischen 2 und 3 h zeigt das Gitter dort jetzt ICON-D2 (mit Jan besprochen).

Kosten: die Grenzen liegen jetzt in einem eigenen Lazy-Chunk `countryOfPoint` (6,3 KB gzip), den Karte, Route und Atmosphäre
teilen — die Karte lädt sie beim Öffnen mit (vorher nur Route/Atmosphäre). totalJs 1 566,2 unverändert (Chunk verschoben,
nicht verdoppelt), eagerJs unverändert, nicht in `index.html`.

**V-FR-12 — Initialen „JK".** Die Vorlagen-Initialen standen auf NEUN Seiten (Event, Vorhersage ×2, 3D, Regenradar ×2,
Atmosphäre, Historie, Route), ohne Funktion, ohne Konto. Alle entfernt; die CSS-Regeln (`*-avatar`) bleiben stehen
(ungenutzt; `tourTheme.css` wird nach Projektregel nicht angefasst).

**Prüfungen:** `verify:fusion-release` **28/28** (C6 neu: Gitter nutzt `countryRowPicker`, keine Box-Regel mehr, Zelle für
Zelle gleich `pickCountry`); `verify:regenradar-profile` **35/36** — C1 jetzt „HEADs Gitter mit der neuen Länderzuordnung
byte-gleich" (3 379 200 Zellwerte; HEAD = `f9ba2d1`, das selbst noch die Box-Regel trägt), neu **C1b** „gegen die Box-Regel nur
Zellen mit Landwechsel anders"; C2/D1–D7 grün; E7 („`src/pointForecast` ohne Diff zu HEAD", Wache der Phase RR) grün nach dem
Commit. `verify:precip-source` 30/30, `verify:layer-geometry` 76/76, typecheck 0, Build grün, Budget grün (1 566,2 / 1 567).
Browser (Dev-Server): Wetterkarte/Niederschlag, Regenradar, Regenradar `?rr=legacy`, Vorhersage, Tourenplanung,
Eventplanung, Wetterarchiv, Atmosphäre — keine Konsolenfehler, kein „JK".

Die fünf Fragen: (1) Funktionserhalt — die Initialen hatten keine Funktion; jede Zelle hat weiter genau eine Quelle.
(2) Desktop — Köpfe ohne den 32-px-Kreis (gewollt); Radarbild nur in den umgeordneten Zellen anders (C1b). (3) Touch-Targets
unberührt. (4) Konsole sauber. (5) Gitterbau gleich schnell wie vorher (≈ 50 ms, wie bisher einmal beim Öffnen der Karte).
