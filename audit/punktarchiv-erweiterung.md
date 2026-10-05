# PA5 — Punktarchiv: Eingabe-Punkte und 2×2-Block (Archiv-Antrag des Prüfstands)

> Stand: 2026-10-05, umgesetzt (uncommitted), Gates grün. Auftrag Jan 05.10. („mach den Archiv-Antrag“) nach den
> Entscheidungen E-PS-11, E-PS-12 und E-PS-6 in `audit/pruefstand-plan.md` §9.
> **Wirksam wird alles erst mit dem Push von `buscosun-web/main`** — der Archiv-Cron klont `main` täglich 23:10 UTC.
> Im Archiv-Repo und im Daten-Repo ist nichts geändert.
> **Nachtrag 05.10. abends:** Jan hat E-PA5-1…4 entschieden (§5). Die reinen Niederschlagsstationen sind eingebaut (§8):
> **2 069 Punkte, Slot 59,9 MB.** Die Zahlen in §0–§4 gelten für den Stand davor (1 025 Punkte).

## 0. Kurzfassung für Jan

1. **Gebaut:** Das Archiv schreibt ab dem nächsten Slot nach dem Push zusätzlich **620 Stationen** der drei amtlichen
   Messnetze mit (Eingabe-Punkte) und zu jeder Zelle die **übrigen Zellen des 2×2-Blocks**. Archiv-Schema 5, alles
   additiv; die 405 Katalogpunkte bleiben in ihrer Form.
2. **Geprüft:** Zwei volle Probeläufe mit 1 025 Punkten in einen Scratch-Ordner. Hauptzellen und Blockzellen stimmen
   an über einer Million Werten ganzzahlig mit einer unabhängigen Lesung überein.
3. **Kosten:** Ein Slot wächst von 13,2 auf **36,8 MB**, das sind 13,4 GB im Jahr statt 4,8. Das Archiv-Repo
   (heute 0,66 GB) läge Ende Dezember bei etwa 3,9 GB.
4. **Nicht gebaut — deine Entscheidung nötig:**
   - **Vier Slots je Tag (E-PS-6)** kämen mit Block und neuen Punkten auf 124 MB je Tag, 45 GB im Jahr. Das trägt ein
     Git-Repo nicht. Die Zahl aus PS-0 (29 MB je Tag) galt ohne Block und ohne neue Punkte. Empfehlung: zurückstellen
     (E-PA5-1).
   - **Die Ausgabe des Cube-Pfads (zweite Hälfte von E-PS-12)** ist nicht gebaut. Sie braucht je Punkt Gelände-,
     Landbedeckungs- und Messabrufe im Sammler; das ist ein eigener Schritt mit eigener Laufzeitmessung (E-PA5-2).
5. **Eilig:** Push vor 23:10 UTC, sonst zählt der heutige Tag für die neuen Stationen nicht.

## 1. Diagnose

| # | Frage | Befund | Beleg |
|---|---|---|---|
| D-PA5-1 | Woraus besteht die Punktliste? | Jeder Punkt ist eine MOSMIX-Katalogstation (`points.mjs`); Stationsprodukt und Live-Pfad hängen an der Katalogkennung. Eine Netzstation ohne Katalogstation kann kein Punkt dieser Art sein | `scripts/punktarchiv/points.mjs:128–158` |
| D-PA5-2 | Was braucht eine neue Station im Slot? | Nur die Eingaben, die sich nicht nachholen lassen: Cube-Zellen, Block, Nowcast-Frames, MOSMIX-Lauf, Modellhöhen. Messwerte sind bei DWD, GeoSphere und MeteoSwiss über Jahre abrufbar | `audit/pruefstand-plan.md` §14.1, §14.3 |
| D-PA5-3 | Was kostet der Live-Pfad? | 19,3 von 32,4 KB je Punkt und viele Abrufe je Punkt; er ist das App-Produkt an den Katalogpunkten und für neue Stationen nicht nötig | PS-0, D-PS-2 (d) |
| D-PA5-4 | Liefert der Leser den Block? | `readCubePoint` reicht `neighbours` nicht durch. Die Bausteine sind exportiert: `blockOffsets`, `blockCellsOutsideChunk`, `cellsFromChunk`, `chunkPath`. Kein Eingriff in `src/` nötig | `src/point/client/cubePoint.ts:290,429`, `src/point/cubeFormat.ts:592,603` |
| D-PA5-5 | Welche Ebenen mittelt der Motor über den Block? | Alle außer `gammaEff, zBase, zInv, dTInv, srcCount, ensCount` (`GRID_NEAREST_ONLY`). Der gekürzte Satz des Hindcast (31 Ebenen) lässt die Druckflächen weg und wäre nicht exakt | `src/pointForecast/fusion/grid.ts:42,122` |
| D-PA5-6 | Was kostet der Block je Punkt? | gemessen an 81 Punkten: Hauptzelle 6,1 KB · Block alle Ebenen 15,0 KB · Block 31 Ebenen 8,9 KB · als Differenz zur Hauptzelle 11,5 bzw. 7,3 KB. Die Differenz-Kodierung spart nur 20–25 % und wurde verworfen | Scratch `ps0/blocksize.mjs` |
| D-PA5-7 | Wo geht die Laufzeit hin? | Erster voller Lauf lokal 61 min: Modellhöhen 1 348 s, MOSMIX 702 + 767 s, Radar 342 s — jeder Punkt dekodierte Chunk, Bündel und Radarbild neu | Scratch `pa5/full.log` |
| D-PA5-8 | Was passiert bei einem nicht lesbaren Chunk? | Alle Punkte des Chunks verlieren die Stufe, endgültig. Im zweiten Lauf (30 min nach einem frischen t1-Lauf) fehlten 3 Chunks = 15 Punkte. Eine nicht lesbare Stationsreihe war ein stilles `null` (4 Katalogpunkte im ersten Lauf) | Scratch `pa5/full2.log` |
| D-PA5-9 | Bricht ein neues Schema die Bewerter? | Ja, wie bei Schema 3 (V-AX-4): `archiveAdapter.mjs` weist unbekannte Schemata ab | `scripts/fusionfit/lib/archiveAdapter.mjs:37` |

## 2. Was gebaut ist

| Teil | Inhalt | Datei |
|---|---|---|
| Eingabe-Punkte | Liste der Netzstationen, die kein Katalogpunkt sind: TAWES 202, SwissMetNet 57, DWD CDC 361 (293 mit Temperatur, 68 nur Wind). Kennung `<Netz>:<Kennung>`, `role: 'input'`. Eine CDC-Station fällt weg, wenn ein DE-Punkt am selben Ort steht (≤ 2 km, \|Δz\| ≤ 50 m — die gemessene Ko-Lokation aus `points.mjs`): 170 Fälle | `scripts/punktarchiv/points-extra.mjs`, `points-extra.json` |
| Sammler: Punkte | Eingabe-Punkte hinter den Katalogpunkten in allen `byPoint`-Blöcken; **kein Live-Pfad**; Wahrheit aus TAWES und SMN im Slot, für DE keine (`truth.cdc` nennt die Kennung zum Nachladen); INCA-Analyse auch an den neuen AT-Punkten | `collect.mjs` |
| Sammler: Block | `cube[t].byPoint[].block` nach der Regel des Motors, Zellen jenseits der Chunk-Grenze aus dem Nachbar-Chunk desselben Laufs; `blockTruncated`, wo eine Zelle fehlt | `collect.mjs` (`readBlock`), `lib/punktarchiv.mjs` (`encodeBlockCells`, `decodeBlockCells`) |
| Sammler: MOSMIX | Ein Eingabe-Punkt trägt die nächste Katalogstation und einen Verweis statt einer Kopie der Reihe (`ref.byPoint` oder `ref.byStation`); 620 Punkte brauchen 410 zusätzliche Reihen | `collect.mjs` (`collectStations`) |
| Sammler: Tempo | Jeder Chunk, jedes Stationsbündel und jedes Radarbild wird je Slot einmal dekodiert (derselbe Dekoder) | `collect.mjs` (`decodeChunkOnce`, `decodePngOnce`) |
| Sammler: Ausfälle | Ein nicht lesbarer Chunk wird nach 30 s einmal neu gefragt; nicht lesbare Stationsreihen stehen als Warnung im Slot | `collect.mjs` |
| Schema 5 | Schreiben 5, Lesen 1–5; auch im Adapter der Bewerter | `lib/punktarchiv.mjs`, `scripts/fusionfit/lib/archiveAdapter.mjs` |
| Prüfwerkzeug | Ein Slot gegen seine Regeln und gegen eine unabhängige Lesung des Daten-Repos | `scripts/punktarchiv/check-slot.mjs` |

Schalter für den Rückweg: `--no-extra` (ohne Eingabe-Punkte), `--no-block` (ohne Block). Ohne die Datei
`points-extra.json` läuft der Sammler auf `points.json` allein. Die Workflow-Vorlage ist unverändert; eine Kopie ins
Archiv-Repo ist nicht nötig.

Die 30 s Pause vor dem zweiten Versuch sind gesetzt, nicht gemessen.

## 3. Messwerte

**Größe** (erster voller Probelauf, 1 025 Punkte, Slot 36,84 MB gz):

| Teil | Katalogpunkte (405) | Eingabe-Punkte (620) |
|---|---|---|
| `live` | 7,80 MB | — |
| Cube, Hauptzelle | 2,46 MB | 3,86 MB |
| Cube, Block | 6,07 MB | 10,71 MB |
| MOSMIX-L + MOSMIX-S | 2,62 MB | 2,65 MB (410 Reihen) + 0,04 MB Verweise |
| Wahrheit, Nowcast, Modellhöhen, Plan, INCA | 0,2 MB | 0,2 MB |

| Stand | je Slot | je Jahr (ein Slot je Tag) |
|---|---|---|
| bisher | 13,2 MB | 4,8 GB |
| mit Block an den Katalogpunkten | 19,3 MB | 7,0 GB |
| mit Block und Eingabe-Punkten (gebaut) | 36,8 MB | 13,4 GB |
| dazu drei weitere Slots ohne `live` (E-PS-6) | 124 MB je Tag | 45 GB |

Block: 2,8 bis 3,0 Zellen je Punkt; 0 Punkte beschnitten im ersten Lauf, 2 im zweiten (Nachbar-Chunk nicht lesbar,
vor dem Einbau des zweiten Versuchs).

**Laufzeit lokal** (nicht der Runner):

| Lauf | gesamt | Live | Cube | Modellhöhen | MOSMIX | Radar |
|---|---|---|---|---|---|---|
| 1 (vor „einmal dekodieren“) | 61 min | 214 s | 249 s | 1 348 s | 1 469 s | 342 s |
| 2 (danach; t1-Lauf 30 min alt, 3 Chunks nicht lesbar) | 37,5 min | 121 s | 1 002 s | 614 s | 370 s | 24 s |

Auf dem Runner brauchte der bisherige Slot 8,5–14 min. Für den neuen Umfang schätze ich 15–25 min; **gemessen ist das
nicht** — der erste Cron-Lauf zeigt es (Limit der Vorlage: 60 min).

## 4. Gate G-PA5

| Frage | Stand | Beleg |
|---|---|---|
| Funktionserhalt: Katalogpunkte unverändert lesbar | ja | `check-slot`: bestehender Adapter liest den Slot; Hauptzelle an 321 383 Werten ganzzahlig gleich einer Lesung ohne Memo |
| Block exakt | ja | `check-slot` am vollen Slot: 517 Zellen, 807 279 Werte, 0 Abweichungen; Blockzellen = `blockOffsets` des Motors an allen 1 025 Punkten × 3 Stufen |
| Negativkontrolle | ja | zwei Zellen weiter nördlich ist die Reihe eine andere; in der Bibliothek wird ein um einen Schritt anderer Blockwert bemerkt |
| Eingabe-Punkte vollständig | ja | 1 025 von 1 025 in allen drei Stufen (Lauf 1); Verweise lösen alle auf (176 auf einen Katalogpunkt, 444 auf 410 Stationsreihen) |
| Wahrheit der neuen Punkte | ja | TAWES 201 von 202, SMN 57 von 57; CDC 361 ohne (Absicht) |
| Zweiter Versuch wirkt | ja | Probe `--fail-once=t1/`: 6 Punkte in 5 Chunks beim ersten Lesen „nicht da“, nach 30 s alle 6 gelesen, 0 Fehler |
| `verify:punktarchiv` | 162/162 | vorher 127; neu Block (9) und die Selbsttests der Liste |
| `verify:fusion-fit` | 131/131 | 16i liest Schema 5, weist Schema 6 ab |
| `typecheck` | 0 Fehler | |
| Build, Budget | nicht berührt | keine Datei unter `src/` geändert |
| Laufzeit auf dem Runner | **offen** | erst nach dem ersten Cron-Lauf messbar |

`check-slot` am zweiten vollen Slot: 16 von 17 — die eine rote Prüfung sind die 15 Punkte ohne t1 aus den drei nicht
lesbaren Chunks (D-PA5-8), der Anlass für den zweiten Versuch.

## 5. Entscheidungen

| # | Frage | Optionen | Empfehlung | Jans Entscheidung |
|---|---|---|---|---|
| E-PA5-1 | Vier Slots je Tag (E-PS-6) bei 124 MB je Tag | jetzt · zurückstellen · nur Cube ohne Block in den Zusatz-Slots | **zurückstellen**, bis die Ablage geklärt ist (E-PA5-3). Technisch reichen drei weitere Cron-Zeilen mit `--no-live` | **nicht machen** (Jan 05.10.2026) — es bleibt bei einem Slot je Tag |
| E-PA5-2 | Ausgabe des Cube-Pfads im Slot | eigener Schritt · nicht | **eigener Schritt** nach dem ersten Schema-5-Slot; zuerst die Laufzeit an 405 Punkten messen | **machen** (Jan 05.10.2026), als eigener Schritt nach dem ersten Schema-5-Slot; Vorbereitung in §9 |
| E-PA5-3 | Ablage bei 13,4 GB im Jahr | Jahres-Repos (`buscosun-archiv-2027`) · Block nur 31 Ebenen (−6 MB je Slot, nicht exakt) · Eingabe-Punkte ohne Block (−10,7 MB) · so lassen | **so lassen und bis Ende November entscheiden**; die Daten dieser Wochen sind sonst verloren, verkleinern kann man später nicht | **vorerst so lassen** (Jan 05.10.2026), bis Jan sich eine Ablage überlegt hat |
| E-PA5-4 | Reine Niederschlagsstationen (902 DWD, 141 MeteoSwiss) | jetzt · später · nicht | **später**, zusammen mit E-PA5-3: +17 MB je Slot nach heutiger Form | **jetzt** (Jan 05.10.2026) — umgesetzt, §8 |

## 6. Befunde und Verbesserungen

- **V-PA5-1** `rebuildIndexes` liest bei jedem Lauf jeden Slot des Archivs neu. Mit 37-MB-Slots wächst das linear
  (150 MB JSON je Slot). Mehrwert: der Cron bleibt schnell. Skizze: Tagesindex nur für den geschriebenen Tag neu,
  Wurzelindex aus den Tagesindizes.
- **V-PA5-2** Der Workflow checkt das ganze Archiv aus. Mehrwert: Laufzeit und Plattenplatz des Runners. Skizze:
  sparse Checkout auf den laufenden Tag plus Indizes (setzt V-PA5-1 voraus). Änderung im Archiv-Repo = Jans Gate.
- **V-PA5-3** Für die Eingabe-Punkte fehlt die Merkmalstabelle (Gelände, Landbedeckung, Stadt-Raster), ohne die der
  Replay sie nicht rechnen kann (= V-PS-9). Die Merkmale sind statisch und lassen sich jederzeit nachbauen.
- **V-PA5-4** DE-Eingabe-Punkte haben keine Messung zur Ausgabezeit im Slot. Als zurückgehaltene Prüfstationen
  brauchen sie keine; als Anker für Nachbarn fehlen sie. Skizze: CDC-`now`-Leser im Sammler (ZIP-Leser aus PS-0).
- **V-PA5-5** 9 CDC-Stationen stehen neben einem DE-Punkt, ohne unter die Gleicher-Ort-Regel zu fallen (293 statt
  282 neue Temperaturstationen). Kosten 9 × 28 KB je Slot; sauber wäre die Zuordnung über das Stationslexikon.
- **V-PA5-6** Im t1-Lauf 15 UTC trug kein Punkt Quantil-Ebenen (12 UTC: 821 von 1 025). Nicht Teil dieser Phase;
  der Slot nennt es als Warnung `cubeQuantilesMissing`.

## 7. Jans Gates

1. **Commit und Push von `buscosun-web/main` vor 23:10 UTC** (Scope `punktarchiv`): `scripts/punktarchiv/{collect.mjs,
   points.mjs,points-extra.mjs,points-extra.json,check-slot.mjs,lib/punktarchiv.mjs}`, `scripts/fusionfit/lib/
   archiveAdapter.mjs`, `scripts/verify-punktarchiv.mjs`, `scripts/verify-fusion-fit.mjs`, dieses Dokument, CLAUDE.md,
   MANUELLE-SCHRITTE.md.
2. **Nach dem ersten Slot:** Laufzeit des Jobs in Actions ansehen (unter 60 min), Slot-Größe (≈ 37 MB), dann
   `git pull --ff-only` im Archiv-Klon und
   `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/punktarchiv/check-slot.mjs C:/dev/buscosun-archiv/<Tag>/<HHMM>.json.gz`
   (innerhalb von etwa 8 h, solange der t1-Lauf im Daten-Repo liegt).
3. **Rückweg**, falls der Job das Limit reißt: in der Workflow-Datei des Archiv-Repos `--no-extra` an den Sammler
   hängen (Block bleibt) oder den Commit zurücknehmen.
4. E-PA5-1…4: entschieden am 05.10. (§5). Offen bleibt die Ablage (E-PA5-3) und der Schritt E-PA5-2 (§9).

## 8. Nachtrag: reine Niederschlagsstationen (E-PA5-4, Jan 05.10. „jetzt“)

**Gebaut.** `points-extra.mjs` liest zusätzlich die CDC-Liste Niederschlag (10 Minuten) und die Stationsliste
`ogd-smn-precip` von MeteoSwiss. Eine Station ist `precipOnly`, wenn sie weder Temperatur noch Wind misst.

| Netz | gelistet | neu als Eingabe-Punkt |
|---|---|---|
| DWD CDC Niederschlag | 1 375 | **903** nur Niederschlag (die übrigen messen auch Temperatur oder Wind, stehen an einem DE-Punkt oder sind inaktiv) |
| MeteoSwiss Niederschlag (`smnp:<Kürzel>`) | 141 | **141** (139 CH, 2 LI; keine ist eine SwissMetNet-Station) |

- Die Liste hat jetzt **1 664 Eingabe-Punkte**; die bisherigen 620 stehen unverändert vorn (gleiche Kennungen, Reihenfolge,
  Lage, Höhe — verglichen), die 1 044 Niederschlagsstationen dahinter.
- Form wie jeder Eingabe-Punkt: Cube, Block, Nowcast, Modellhöhen, Plan, MOSMIX als Verweis. **Ihre Messwerte stehen nicht
  im Slot**; `truth.cdc` bzw. `truth.smnPrecip` nennt die Kennung zum Nachladen (wie bei den CDC-Punkten).
- Rückweg: `--no-precip-only` am Sammler (dann wieder 620).
- Neu: ein nicht lesbares Stationsbündel wird nach EINER gemeinsamen Pause von 30 s einmal neu gefragt
  (`bundleRetry` im Slot). Anlass: im Probelauf fehlten 23 MOSMIX-S-Reihen aus wenigen Bündeln. Probe mit
  `--fail-once=stations-s`: 12 von 12 Reihen nach dem zweiten Versuch da, 32 s.

**Gemessen** (voller Probelauf 18:55 UTC, 405 + 1 664 Punkte, vor dem Einbau des Bündel-Versuchs):

| Größe | Wert |
|---|---|
| Slot | **59,87 MB** gz (256 MiB roh) — vorher 36,84 MB; die Schätzung war +17 MB, gemessen sind +23 MB |
| je Jahr bei einem Slot je Tag | **21,9 GB** (vorher 13,4) |
| Laufzeit lokal | 17,5 min (Live 92 s, Cube 95 s, MOSMIX-L 17 s, MOSMIX-S 148 s, Radar 24 s, INCA 120 s); der Lauf davor brauchte 37,5 min bei halb so vielen Punkten und kaltem CDN — die Zahlen sind nicht vergleichbar |
| Punkte je Stufe | 2 069 von 2 069 in t1, t2, t3; 0 Blöcke beschnitten; 0 Fehler |
| `check-slot` | 16 von 17: Block an 489 993 Werten und Hauptzelle an 191 766 Werten ganzzahlig gleich. Rot war der MOSMIX-S-Verweis auf die 23 nicht lesbaren Reihen — Anlass für den Bündel-Versuch |
| `verify:punktarchiv` | 165/165 |

**Zwei Dinge, die Jan wissen muss:**

1. **Die Slot-Datei liegt über 50 MB.** GitHub nimmt Dateien bis 100 MB an, warnt aber ab 50 MB beim Push. Der Cron
   läuft damit durch; die Reserve bis zur harten Grenze ist 40 MB. Das gehört zu E-PA5-3.
2. **Die Laufzeit auf dem Runner ist weiter ungemessen**, jetzt bei doppelter Punktzahl. Limit der Vorlage: 60 min.
   Reißt der Job das Limit, ist der Slot des Tages verloren. Rückweg in zwei Stufen: `--no-precip-only`, dann `--no-extra`.

- **V-PA5-7** Niederschlagsstationen von GeoSphere fehlen: das TAWES-Netz ist vollständig drin, ein eigenes
  Niederschlagsnetz mit 10-min-Werten habe ich nicht gesucht. Mehrwert: AT wäre beim Niederschlag so dicht wie DE/CH.
- **V-PA5-8** Die Messwerte der MeteoSwiss-Niederschlagsstationen ließen sich im Slot mitschreiben (gleiche Dateiform wie
  SwissMetNet, Spalte `rre150z0`). Nicht gebaut; sie sind nachladbar.

## 9. Vorbereitung E-PA5-2: Ausgabe des Cube-Pfads (Jan 05.10. „machen“, als eigener Schritt)

Noch nicht in den Sammler gebaut — der Schritt folgt nach dem ersten Schema-5-Slot, damit dessen Laufzeit auf dem Runner
bekannt ist, bevor mehr dazukommt. Gemessen ist die Machbarkeit (Scratch `pa5b/cubepath-probe.mjs`, 12 Katalogpunkte
DE/AT/CH, `getPointForecastFromCube` in Node mit dem Stand des Registers, Messungen über `fetchCubeObs`, Gelände und z0 aus dem Netz):

| Frage | Befund |
|---|---|
| Läuft der Cube-Pfad des Browsers in Node? | ja, 12 von 12, Stufe = buscosun Fusion 9, 337 Stunden, 0 Fehler |
| Kommen Messungen an (Anker)? | ja: DE `dwd_obs`, AT `tawes`, CH `smn` in `sourcesAvailable` |
| Zeit je Punkt | Median 2,7 s, höchstens 4,7 s, nacheinander; 405 Punkte ≈ 18 min nacheinander |
| Abrufe je Punkt | Median 26 |
| Größe je Punkt (`encodeV2`, gz) | Median 34,6 KB ⇒ 405 Punkte ≈ **14 MB je Slot** |

Folgen für den Bau: Bei 405 Punkten läge der Slot bei etwa 74 MB (Grenze 100 MB) und die Laufzeit stiege um einige
Minuten (mit Nebenläufigkeit). Eine Stichprobe von 40 Punkten kostet 1,4 MB. **Offen für Jan (E-PA5-5):** alle 405
Katalogpunkte oder eine feste Stichprobe.
