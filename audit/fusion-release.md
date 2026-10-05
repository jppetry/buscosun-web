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
