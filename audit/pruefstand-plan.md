# Prüfstand — feste Verifikationsroutine für buscosun Fusion (PS-0 … PS-4)

> Stand: 2026-10-05 (Plan, vor Diagnose; ergänzt um Vergleichsmodus, Rekonstruktion alter Versionen und Archiv-Punktliste). Auftrag Jan 05.10.: eine Testroutine für das Postprocessing buscosun Fusion,
> die jede neue Version (buscosun Fusion [n]) an realen Stationen nach immer denselben Kriterien bewertet und gegen die
> letzte und alle früheren Iterationen vergleicht. **Einmal bauen, danach je Version nur noch laufen lassen.**
> Konzept: Claude-Doc „buscosun Prüfstand – Verifikationsroutine für Fusion-Postprocessing“
> <https://claude.ai/code/artifact/c70f165b-12c5-469b-bbd8-7d6618a918da>, als Markdown-Abschrift in
> `audit/pruefstand-konzept.md` (Verweise „Konzept §n“ beziehen sich darauf; bei Widerspruch gilt dieser Plan).
> Kickoff: `prompt-pruefstand.md`.
> **Fünf Phasen, fünf Gates, ein Commit je Phase.** PS-0 schreibt keinen Code. Push, Änderungen in anderen Repos und
> Freigaben sind Jans Gate.

## 0. Kurzfassung für Jan

1. **Was gebaut wird:** fester, deterministischer Code unter `scripts/pruefstand/` und `src/pruefstand/`, ein
   eingefrorenes Prüfprotokoll P1, eine eigene Wahrheitstabelle W1 aus DWD, GeoSphere und MeteoSwiss, ein Modellregister
   mit Replay je Version und ein Claude-Code-Skill `/pruefe-fusion` (Anhang A).
2. **Was du danach je neuer Version tust:** `/pruefe-fusion 9` (Volltest auf der Entwicklungsmenge) und, wenn das gut
   aussieht, `/pruefe-fusion 9 abnahme` (Urteil gegen Champion und alle Vorgänger, Rangliste). Der freie Satz „teste die
   neue buscosun fusion 9 über unsere Prüfroutine“ löst denselben Skill aus. Der Skill rechnet nichts selbst: Er startet
   das Skript und fasst `scores.json` in festem Format zusammen.
3. **Einzige wiederkehrende Codearbeit:** Ändert eine neue Version die Schnittstelle der Engine (Eingaben, Ausgaben,
   Optionen), bricht ihr Adapter, und der Skill stoppt mit genauer Meldung. Ändert sich das Protokoll, entsteht P2 und
   alle Versionen werden neu bewertet, nie stillschweigend.
4. **Reihenfolge:** PS-0 Diagnose → deine Entscheidungen E-PS-1…11 → PS-1 Fundament → PS-2 Replay → PS-3 Statistik und
   Bericht → PS-4 Befehl. Die erste belastbare Abnahme ist ab G-PS3 möglich. Spur P hat heute gut drei Wochen; damit
   sind nur große Unterschiede nachweisbar.
5. **Korrektur am Konzept (betrifft E-PS-8):** Ein nächtlicher Schattenlauf ist unnötig. Das Archiv ist append-only und
   hält die Eingaben jedes Tages; der Replay rechnet eine Version jederzeit nachträglich auf allen Tagen nach ihrem
   Freeze. Dazu liegt `buscosun-hindcast` nur lokal (kein Git, laut Notizen rund 46 GB mit Cache). **Alles läuft lokal;
   GitHub Actions braucht der Prüfstand nicht.**
6. **Aufruf:** `npm run` schluckt `--`-Argumente (CLAUDE.md). Skill und Doku rufen deshalb direkt
   `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/pruefstand/run.mjs …` auf.
7. **Eilpunkt Archiv (D-PS-2 zuerst):** Eine Station ist nur prüfbar, wenn das Archiv für ihren Ort die
   Vorhersage-Eingaben gesichert hat. Messwerte lassen sich jahrelang nachladen, Cube-Zellen nicht: `buscosun-data`
   löscht alte Läufe, die offenen Modellserver halten sie nur kurz. Speichert das Archiv den Cube nur an seiner
   Punktliste (wie der Hindcast), zählen neue Stationen erst ab dem Tag, an dem das Archiv sie mitschreibt. PS-0
   klärt das als Erstes und meldet es sofort; die Erweiterung der Punktliste (E-PS-11) ist ein eigener, eiliger Antrag
   in `buscosun-archiv`, unabhängig vom Bau des Prüfstands.
8. **Mehrere Versionen gegeneinander** (z. B. 5e, 6, 7, 8): Modus `vergleich` erstellt eine Rangliste auf der größten
   gemeinsamen sauberen Prüfmenge. Alte Versionen zählen nur, wenn Commit, Tabellen und lesbare Eingaben erhalten sind
   (D-PS-7); sonst stehen sie als „nicht rekonstruierbar“ im Register.

## 1. Ausgangslage (aus Projektnotizen, nicht am Code gelesen — jeden Anker in PS-0 prüfen)

| Baustein | Stand laut Notizen | Prüfen in |
|---|---|---|
| `buscosun-archiv` | `C:\dev\buscosun-archiv`, Git `jppetry/buscosun-archiv`; Cron täglich 23:10 UTC, ein Slot `<YYYY-MM-DD>/<HHMM>.json.gz` (Kollision als `-r1`), append-only, Schema 3, ab 14.09.2026; Leser `lib/punktarchiv.mjs`; Inhalt `cube.t1/t2/t3`, `stations` (MOSMIX-L), `nowcast`, `hmodel`, `plan`, `live` (mu/q10/q50/q90), `truth.byPoint`, `stats`. **Unbekannt:** ob `cube` je Punkt oder als Gitter gespeichert ist, wie viele Punkte die Liste hat, ob Ankerwerte zur Ausgabezeit im Slot liegen; Punkte auch außerhalb von DACH (NL, DK) | D-PS-2, D-PS-3 |
| Audit-Befunde Archiv (Sept. 2026) | Bergstationen mit DEM- statt Stationshöhe; Höhenreferenzen `plan`/`live`/`points.elev` uneinheitlich; `id` ≠ `wmo` bei 17 AT-Punkten; 23‑UTC-Lücke DE/AT in der Wahrheit; leere Wahrheitsgrößen je Netz; `tsMs` null, `ageH` 0; Fusion teils `weights: equal` / `provenance: fallback` | D-PS-3, D-PS-5 |
| `buscosun-hindcast` | `C:\dev\buscosun-hindcast`, kein Git; `slots/` (t1 ab 25.05.2023, t2/t3 ab 01.04.2024), `truth/` (24.05.2023–21.09.2026, dazu `stations.json`), `cells/`, `shadow/`, `verify/`, `index.json`; Provenienz „Lauf“ (ab 17.06.2026), „Tag 0“, „dyn“ | D-PS-4 |
| Fusion-Engine | `src/pointForecast/fusion/*` (`fuse.ts`, `dist.ts` mit `quantileOf`), Tabellen `fusion.client.json`, `precip-cal.client.json`, Cube-Leser `src/point/cubeFormat.ts`, `read-point.mjs` | D-PS-5 |
| Vorhandene Prüfungen | `verify:fusion-fit`, `verify:point-client`, `verify:point-data`; Scorer der Phasen FL/FV/AX (Archiv, Niederschlag „nass“ = Radar-Analyse ≥ 0,1 mm/h) | D-PS-1 |
| Offene Einheit | `precip` im Cube: Rate oder Intervallsumme (offen seit D-NP0-9) | D-PS-6 |

## 2. Ziel und Abgrenzung

- **Ziel:** Eine Routine, die jede registrierte Fusion-Version auf identischen Prüffällen per Replay rechnet, an
  zurückgehaltenen Stationen gegen eine eingefrorene Wahrheit bewertet und ein Urteil nach festen Gates ausgibt.
  Gleiche Hashes (Protokoll, Wahrheit, Fälle, Modell) ⇒ gleiche Zahlen.
- **Nicht Teil:** Änderungen an buscosun Fusion (Motor, Tabellen, Optionen, Fit-Pipeline) — nur aufrufen; jede
  Oberfläche in buscosun-web; Feldverifikation (FSS gegen Radar); Bewertung der Schneefallgrenze (keine Bodenwahrheit);
  Änderungen in `buscosun-archiv` oder `buscosun-data` (E-PS-6 und E-PS-11 sind eigene Anträge); Archivpunkte außerhalb
  von DACH (NL, DK) gehören nicht zu P1.
- **Funktionserhalt:** Kein bestehender Job, Verifier oder Build ändert sein Verhalten. Der Prüfstand liest Archiv,
  Hindcast und Daten-Repo nur.

## 3. Was P1 einfriert (Kurzfassung Konzept §2–§11; mit * markierte Werte entscheidet Jan nach PS-0)

| Baustein | Festlegung P1 | Konzept |
|---|---|---|
| Prüfnetz | Stationen DE/AT/CH mit Rolle A (Anker) oder B (zurückgehalten: nie im Fit, im Replay aus den Ankern maskiert); B geschichtet nach Land × Geländeklasse × Höhenstufe, fester Seed, Anteil* (E-PS-2); B-Paare Tal/Berg unter 15 km | §4 |
| Zielort | Länge, Breite und gemessene Stationshöhe aus eingefrorenen Metadaten, nie DEM-Höhe; Verlegung ⇒ neue Station | §4 |
| Wahrheit W1 | Nur amtliche Bodenmessnetze: DWD CDC (rund 200 hauptamtliche + knapp 300 weitere automatische Wetterstationen, knapp 500 automatische Niederschlagsstationen; 10 min / Stunde, Qualitätsniveau QN), GeoSphere `klima-v2-10min` / `-1h` (rund 260 Stationen), MeteoSwiss A1 (rund 160 SwissMetNet) und A2 (rund 100 Niederschlagsstationen). Reine Niederschlagsstationen nur für Niederschlag. Nicht Wahrheit: Radar (nur getrennte Zweitwahrheit Niederschlag), MOSMIX (Referenz), private Netze, SWIS-Straßenwetter, Ländernetze. QC nur aus Messreihe, Nachbarn, Quellflags, nie aus einer Vorhersage; Reifezeit 7 Tage für die Abnahme; Stand W1 mit Hash | §3, §4 |
| Anker im Replay | Ankerwerte so, wie sie zur Ausgabezeit vorlagen (Echtzeit), nicht nachträglich korrigierte Archivwerte; fehlen sie im Slot, wird das je Fall gekennzeichnet | §6 |
| Prüffall | (Ausgabezeit, Station, Gültigkeitszeit, Größe); Vorlauf ab Ausgabezeit, nicht ab Modellstart | §5 |
| Raster | stündlich bis 48 h, dreistündlich bis 120 h, sechsstündlich bis 336 h | §5 |
| Vorlauf-Fenster | 0–6, 6–24, 24–48, 48–120, 120–240, 240–336 h; Nahtbänder 48/51, 120/126, 180 h | §5 |
| Kerngrößen | T2m, Taupunkt, Wind 10 m, Böe, Niederschlag (Menge und Ereignis); Nebengrößen laut Konzept §5 | §5 |
| Hauptmaß | CRPS_Q = 2/K · Σ QS_τk über den Quantilsatz* (E-PS-1); für einen Einzelwert gleich MAE | §7 |
| Weitere Maße | Bias, MAE, RMSE; Abdeckung q10–q90, PIT, Spread-Skill; Schärfe; Brier mit Zerlegung, CORP-Diagramm; twCRPS, SEDI; RPS; Winkelfehler | §7 |
| Referenzen | Klimatologie lokal (Station × Kalendertag × Stunde, nur Trainingsjahre), Persistenz (nur A), Rohquellen, Rohquellen + 0,65 K/100 m, MOSMIX-L, naive Fusion, alle Vorgänger | §8 |
| Spuren | P: Archivtage nach dem Freeze der Version; R: Tresor im Hindcast* (E-PS-3), Sperre auf Ausgabe- **und** Gültigkeitszeit, Abstand aus der gemessenen Autokorrelation | §6 |
| Statistik | Tagesdifferenzen je Zelle; gepaarter t-Test mit AR(2)-Inflation, Block-Bootstrap für kleine n; Benjamini-Hochberg über Kernzellen; Nachweisgrenze je Zelle | §10 |
| Indizes | Fortschrittsindex (gegen Champion, entscheidet), Güteindex (gegen Klimatologie, Rangliste); Gewichte* (E-PS-4) | §11 |
| Gates | G1 Fortschritt · G2 kein Rückschritt (Toleranz δ*, E-PS-5) · G3 Kalibrierung (Binomialband aus n_eff) · G4 Technik (Determinismus, Physik, Vollständigkeit, Punktabfrage < 300 ms, Leck-Prüfung) | §11 |

P1 liegt als JSON unter `scripts/pruefstand/protokoll/p1/` (versioniert, mit Hash). Jede Änderung erzeugt P2; Zahlen
aus P1 und P2 werden nie verglichen.

## 4. PS-0 — Diagnose (kein Code außer Wegwerf-Proben im Scratch-Ordner; Ergebnis in §14)

| # | Frage | Wie |
|---|---|---|
| D-PS-1 | Was ist wiederverwendbar? Scorer der Phasen FL/FV/AX, `verify:fusion-fit`, Hindcast `verify/` und `shadow/`: Maße, Leser, Wahrheitsabgleich, Zeitkonventionen | Code-Suche; je Fund Pfad:Zeile und Urteil „übernehmen / anpassen / ersetzen“ |
| D-PS-2 | **Zuerst beantworten und sofort an Jan melden.** (a) Liegt `cube.t1/t2/t3` je Punkt (`byPoint`, welche Zellen je Punkt) oder als Gitter vor? (b) Wie viele Punkte hat die Liste, und wie viele der Messnetz-Stationen DE/AT/CH sind in **allen drei Stufen** durch gesicherte Zellen abgedeckt? (c) Liegen die Ankerwerte zur Ausgabezeit im Slot? (d) Bytes je Punkt und Slot (für E-PS-11). Danach Inventar: Tage, Slots, Kollisionen; welche Eingaben je Slot vollständig sind; ob `live` für alle Punkte und Vorläufe gefüllt ist; Rundung der `live`-Spalten | `lib/punktarchiv.mjs` über alle Slots, Tabelle je Tag; Stationslisten der drei Netze |
| D-PS-3 | Wahrheit: `truth.byPoint` und Hindcast-`truth/` gegen die Originalquellen an einer Stichprobe (≥ 3 Tage × 20 Stationen je Netz); Größen je Netz; Zeitstempel (UTC, Intervallende); Stationsmetadaten (Höhe, Windmesshöhe, Verlegungen) | Abruf der Originaldateien in einen Scratch-Ordner |
| D-PS-4 | Hindcast: Tage je Provenienz und Stufe; gleiche Struktur wie Archiv-Slots oder eigener Leser nötig; welche Tage die heutigen Fits (Stationswert, Lernstufe, `precip-cal`) gesehen haben | `index.json`, Fit-Skripte und ihre Eingaben |
| D-PS-5 | Replay: Lässt sich Fusion 8 je (Slot, Punkt) ohne Browser aufrufen? Einstieg, Eingaben, Optionen; Determinismus (zwei Läufe, Hash); lassen sich B-Stationen aus den Ankern nehmen, **ohne** den Motor zu ändern; liefert `dist.ts` 19 Quantile | Probe an 3 Slots × 10 Punkten gegen `live`. Muss der Motor geändert werden: STOPP |
| D-PS-6 | Einheiten und Definitionen je Größe in Cube, `live`, MOSMIX und Wahrheit: `precip` Rate oder Summe, Böen-Intervall, Momentanwert oder Mittel, Bewölkung | Code und Stichprobe |
| D-PS-7 | Versionen 5e, 6, 7, 8: je Version (a) Commit oder Tag; (b) liegen die gefitteten Tabellen (`fusion.client.json`, `precip-cal.client.json`, Stationswert-Tabelle) an diesem Commit im Web-Repo (`git show <commit>:<pfad>`) oder lagen sie nur in `buscosun-data` (dann vermutlich verloren: Löschen und Force-Push der Kartenlinie)? (c) holt die Engine zur Laufzeit etwas live nach (BrightSky, GeoSphere, Stationen)? (d) liest sie Archiv-Slots in Schema 3 oder braucht der Adapter einen Umsetzer? (e) zwei Läufe byte-gleich? (f) gibt es gespeicherte Ausgaben dieser Version für eine Treue-Probe (alte Verify-Berichte, `buscosun-hindcast/shadow/`)? (g) Freeze und Fit-Fenster belegbar? Urteil je Version: rekonstruierbar / teilweise / nicht | `git worktree` außerhalb des Repos, `npm ci`, Probe an 1 Slot × 3 Punkten |
| D-PS-8 | Autokorrelation der Tagesdifferenzen (Fusion 8 `live` gegen MOSMIX-L an A-Stationen, Archiv): AR(2)-Faktor k je Größe × Fenster, heutige Nachweisgrenze, Tresor-Abstand | Skript im Scratch, Ergebnis als Tabelle |
| D-PS-9 | Stationspool: Anzahl je Land × Geländeklasse × Höhenstufe; Abdeckung der Schichten bei 15/25/35 % B; Liste der Tal-/Berg-Paare unter 15 km | Metadaten + DEM |
| D-PS-10 | Laufzeit und Speicher: Replay je Slot × Version lokal; Größe der Fälle und Konserven je Tag; Speicher je Archiv-Slot (für E-PS-6) | Messung |
| D-PS-11 | Abhängigkeiten: DWD CDC liefert ZIP. Reicht ein eigener ZIP-Leser mit `node:zlib` (`inflateRawSync`), oder braucht es eine Abhängigkeit? | Probe an einer CDC-Datei |

**Gate G-PS0:** §14 gefüllt, Anker-Korrekturen zu §1 benannt, Entscheidungsvorlage E-PS-1…11 mit Messwerten. Jan
entscheidet; vorher keine Zeile Code im Repo.

## 5. PS-1 — Fundament

| Schritt | Inhalt |
|---|---|
| PS-1-1 Protokoll | `scripts/pruefstand/protokoll/p1/*.json` (Prüfnetz mit Rollen, Zielgrößen-Katalog, Fenster, Quantilsatz, Schwellen, Index-Gewichte, Gates, Tresor-Maske `tresor.json`) und `src/pruefstand/protokoll.ts` (Lader, Prüfer, Hash; rein) |
| PS-1-2 Wahrheit W1 | `scripts/pruefstand/wahrheit/`: Abruf je Netz, QC nach Konzept §4 (formal, zeitlich, räumlich, Quellflags, Repräsentanz), jeder verworfene Wert mit Grund protokolliert, Reifezeit-Kennzeichen; Ablage spaltenweise unter `C:\dev\buscosun-pruefstand\wahrheit\W1\` mit Manifest und Hash |
| PS-1-3 Prüffall-Bauer | Fälle aus Archiv (Spur P) und Hindcast (Spur R, je Provenienz getrennt) als Spaltenblöcke (`Float32Array` je Größe × Vorlauf) mit Verweis auf die Eingaben; Masken für B-Stationen und Tresor; Ablage `…\faelle\<spur>\<tag>.bin` mit Hash |
| PS-1-4 Maß-Kern | `src/pruefstand/metrics.ts` (rein): QS, CRPS_Q, Brier mit Zerlegung, Abdeckung, PIT, Spread-Skill, twCRPS, RPS, SEDI, Winkelfehler, Tagesaggregation, Skill als Verhältnis der Summen |
| PS-1-5 Sollwerte | Sollwerte aller Maße einmalig offline mit dem Python-Paket `scores` (Bureau of Meteorology) erzeugen und als JSON-Fixtures einchecken (`scripts/pruefstand/fixtures/`); zur Laufzeit kein Python |
| PS-1-6 Verifier | `scripts/verify-pruefstand.mjs` + `npm run verify:pruefstand` (netzfrei): Protokoll-Rundlauf mit Negativkontrolle, Maße gegen Sollwerte (Abweichung < 1e‑9), QC an synthetischen Reihen, Fall-Bau an einem Archiv-Fixture, Byte-Gleichheit bei Wiederholung |

**Gate G-PS1**

| Frage | Beleg |
|---|---|
| Maße | alle gegen `scores`-Sollwerte grün |
| Wahrheit | Rundlauf W1 gegen die Originale (Stichprobe aus D-PS-3) ohne unerklärte Abweichung; Verwerfungsquote je Netz benannt |
| Protokoll | P1 lädt, Hash stabil; ein manipuliertes P1 wird abgelehnt |
| Verifier | `typecheck`, `verify:pruefstand`, `build` |

## 6. PS-2 — Register und Replay

| Schritt | Inhalt |
|---|---|
| PS-2-1 Register | `scripts/pruefstand/register/<id>.json` je Version: Commit, Tabellen-Hashes, Optionen, Freeze-Datum, Fit-Fenster, Tresor-Hash, Adapter-Version, Status (Kandidat / Champion / abgelehnt / historisch). `run.mjs --registriere <id>` füllt Commit und Hashes aus Git; was sich nicht belegen lässt (Freeze, Fit-Fenster), fragt der Skill Jan einmal |
| PS-2-2 Adapter-Vertrag | `src/pruefstand/adapter.ts`: `predict(fall) → Quantilblock` im Quantilsatz von P1 und in den Einheiten des Zielgrößen-Katalogs; Vertragstest mit Negativkontrollen (falsche Einheit, nicht monotone Quantile ⇒ Abbruch mit Meldung) |
| PS-2-3 Adapter | Adapter für Fusion 8 (Champion); Referenzen als Pseudo-Versionen: Klimatologie (aus W1, nur Trainingsjahre), Persistenz, Rohquellen je Modell, Rohquellen + 0,65 K/100 m, MOSMIX-L, naive Fusion |
| PS-2-4 Runner | `git worktree` je Version unter `C:\dev\buscosun-pruefstand\worktrees\<id>`; Tage auf `worker_threads`; B-Stationen aus den Anker-Eingaben maskiert; Tresor und Spur P öffnet nur der Modus `abnahme`, jede Öffnung in `scripts/pruefstand/register/zugriffe.log` |
| PS-2-5 Konserven | Vorhersagen adressiert nach (Modell-Hash, Fall-Hash, Protokoll-Hash) unter `…\konserven\`; inkrementell: neuer Archivtag ⇒ nur dieser Tag wird gerechnet |
| PS-2-6 Replay-Treue | Fusion 8 ohne Maske auf allen Archiv-Slots gegen die gespeicherten `live`-Werte; Abweichungsstatistik je Größe × Vorlauf |
| PS-2-7 Champion unter Tresor | Nur wenn der Fit von Fusion 8 ohne Motor-Änderung mit Tresor-Maske wiederholbar ist; sonst Status „R kontaminiert“ (E-PS-9) |
| PS-2-8 Altversionen | Für jede nach D-PS-7 rekonstruierbare Version (5e, 6, 7) Register-Eintrag mit Status „historisch“ und Adapter (ein Adapter je Schnittstellen-Generation, nicht je Version). Treue-Probe gegen gespeicherte Ausgaben, wo vorhanden; sonst Kennzeichen „Treue nicht prüfbar“ im Register und im Bericht. Nicht rekonstruierbare Versionen: Status „nicht rekonstruierbar“, nie mit Ersatz-Tabellen oder Refit nachgestellt |

**Gate G-PS2 (kritisch):** Replay-Treue gleich bis auf die Rundung der `live`-Spalten (aus D-PS-2); zwei Läufe
byte-gleich; Vertragstests grün; `verify:pruefstand` erweitert. Hält G-PS2 nicht, sind alle späteren Vergleiche
wertlos: STOPP, PS-3 beginnt nicht.

## 7. PS-3 — Statistik, Gates, Bericht

| Schritt | Inhalt |
|---|---|
| PS-3-1 Statistik | `src/pruefstand/stats.ts`: Tagesdifferenzen je Zelle, AR(2)-Inflation, Block-Bootstrap (Blocklänge aus der Autokorrelation), Benjamini-Hochberg über Kernzellen, Nachweisgrenze |
| PS-3-2 Gates | G1–G4 und Überanpassungs-Warnung nach Konzept §11; Urteil Champion / Kandidat / abgelehnt |
| PS-3-3 Sonderprüfungen | Höhenpaare (ΔT, ΔTd, getrennt nach Inversion zur Ausgabezeit), Nahtsprünge, Sprunghaftigkeit (nur bei mehr als einem Slot je Tag), Stundeninterpolation t2/t3 |
| PS-3-4 Bericht | `audit/pruefstand/berichte/<id>/<datum>/bericht.html` (eine Datei, ohne externe Abhängigkeiten) und `scores.json` (alle Zellen und Tagesreihen); Gliederung nach Konzept §13; erste Zeile = Urteil in einem Satz; Quellenvermerke DWD, GeoSphere, „Source: MeteoSwiss“ |
| PS-3-5 Rangliste | `audit/pruefstand/rangliste.json`; nur der Modus `abnahme` schreibt |
| PS-3-6 Vergleichsmodus | `--modus vergleich --versionen fusion-5e,fusion-6,…`: Güteindex und Scorecards aller genannten Versionen auf der größten gemeinsamen sauberen Prüfmenge (Spur P: Tage nach dem jüngsten Freeze der Auswahl; Spur R nur für nicht kontaminierte Versionen), Zahl der Tage und Fälle im Kopf, paarweise Differenzen mit Konfidenzintervall. Entscheidet nichts und schreibt keine Rangliste; Bericht unter `audit/pruefstand/vergleiche/<datum>/` |
| PS-3-7 Selbstprüfung | A/A-Test (Champion gegen einen Bootstrap-Fit von sich selbst, viele Wiederholungen) legt Testverfahren und Mindesttage fest; Negativkontrollen nach Konzept §14 |

**Gate G-PS3:** A/A-Test trifft die nominale Irrtumsrate (Spanne aus den Wiederholungen benannt); alle
Negativkontrollen schlagen an; Bericht und `scores.json` byte-gleich bei Wiederholung.

## 8. PS-4 — Befehl und Doku

| Schritt | Inhalt |
|---|---|
| PS-4-1 Einstieg | `scripts/pruefstand/run.mjs --kandidat <id> --modus schnell\|voll\|abnahme`, `--modus vergleich --versionen <id,id,…>`, `--modus status` und `--registriere <id>`; Exit-Code ≠ 0 bei Vertragsbruch, G4-Verstoß oder fehlgeschlagener Selbstprüfung |
| PS-4-2 Skill | `.claude/skills/pruefe-fusion/SKILL.md` nach Anhang A |
| PS-4-3 Doku | CLAUDE.md-Dokumentenkarte; Abschnitt in `MANUELLE-SCHRITTE.md`; `audit/pruefstand/README.md` (Bedienung in zehn Zeilen) |
| PS-4-4 Erster Lauf | `/pruefe-fusion 8 abnahme` als Selbsttest: Champion gegen sich selbst ⇒ „kein Fortschritt“, G2–G4 grün, Rangliste mit Fusion 8 und allen Referenzen |

**Gate G-PS4:** Selbsttest grün; ein bewusst verschlechterter Kandidat (Fusion 8 mit verbreiterten Bändern) wird über
den Skill abgelehnt.

## 9. Entscheidungen (Jan) — von PS-0 mit Messwerten vorgelegt, am 05.10.2026 entschieden (jeweils die Empfehlung)

| # | Frage | Optionen | Empfehlung | Jans Entscheidung |
|---|---|---|---|---|
| E-PS-1 | Quantilsatz | 3 Stufen q10/q50/q90 (wie `live`) · 19 Stufen 5–95 % per Replay | **19**, dazu 3 als gemeinsamer Nenner. Gemessen (D-PS-5): `quantileOf` liefert für alle sieben Verteilungsfamilien jede Stufe; 101 529 Schritte × 6 Größen × 19 Stufen ohne Fehler, alle monoton | 19 Stufen, dazu 3 als gemeinsamer Nenner (Jan 05.10.2026) |
| E-PS-2 | Anteil Prüfstationen B | 15 / 25 / 35 % | **25 %** (101 von 389: DE 53, AT 21, CH 27). Bei 15 % bleiben 17 der 37 besetzten Schichten ohne B, bei 25 % und 35 % je 7 (die Einzelstationen). **Vorbehalt (D-PS-9):** alle 389 Stationen waren im Fit jeder Bestandsversion; „B“ ist dort nur im Replay maskiert. Echte, nie gesehene Prüfstationen entstehen erst über E-PS-11 | 25 % (101 von 389), mit dem Vermerk „im Fit gesehen“ (Jan 05.10.2026) |
| E-PS-3 | Tresor im Hindcast | jede 4. Woche · jede 5. Woche · ein ganzes Jahr · **neu: der ungenutzte Zeitraum vor 2025-09-01** | **Der ungenutzte Zeitraum**: kein Fit hat Hindcast-Tage vor dem 01.09.2025 gesehen (D-PS-4). 2024-04-01…2025-08-31 (17 Monate, alle drei Stufen, Provenienz Tag 0/dyn) ist für alle Bestandsversionen ohne Nachfit sauber. Künftige Fits müssen ihn per Regel aussparen. Abstand (D-PS-8): 7 Tage (r₁ bis 0,73, bei T schon ab 6 h Vorlauf 0,70) — aus nur 15–20 Tagen geschätzt | Tresor = Hindcast 2024-04-01 … 2025-08-31, Abstand 7 Tage; künftige Fits sparen ihn aus (Jan 05.10.2026) |
| E-PS-4 | Index-Gewichte | gleich · nach Nutzung · kurze Vorläufe betont | gleich, bis Nutzungsdaten vorliegen (keine Messung in PS-0) | gleich (Jan 05.10.2026) |
| E-PS-5 | Toleranz δ in G2 | 0 · 1 % · Nachweisgrenze | 0. Zur Einordnung (D-PS-8, Paar `live` gegen MOSMIX-L, 15–20 Tage): Nachweisgrenze heute je Zelle 3–69 %, bei 90 Tagen 1–32 %; n_eff 4–20 Tage | 0 (Jan 05.10.2026) |
| E-PS-6 | Archiv-Cron mit 4 Slots je Tag | ja · nein | **ja, Eingaben viermal, `live` nur im 23:10-Slot.** Ein Slot hat heute 13,2 MB (5,3 MB ohne `live`); vier Slots: 29 MB/Tag = 10,6 GB/Jahr bei 405 Punkten. Sammelzeit 8,5–14 min je Slot, davon `live` 3 min | ja: vier Slots je Tag, `live` nur im 23:10-Slot (eigener Antrag) (Jan 05.10.2026) |
| E-PS-7 | Ort | Code in `buscosun-web`, Daten in `C:\dev\buscosun-pruefstand\` · eigenes Repo | Code in `buscosun-web`, große Daten lokal. Gemessen (D-PS-10): Konserve je Slot × Version 19 MB roh auf dem P1-Raster (46 MB stündlich) | Code in `buscosun-web`, große Daten lokal (Jan 05.10.2026) |
| E-PS-8 | Wo läuft es? | lokal · Actions | **lokal.** Gemessen: Replay 48 s je Slot × Version (389 Punkte, stündlich bis 336 h), ohne `npm ci` nicht lauffähig (Paket `bz2` wird importiert) | lokal (Jan 05.10.2026) |
| E-PS-9 | Bestandsversionen unter Tresor nachfitten | ja · nein | **nein** — mit dem Tresor aus E-PS-3 unnötig. Der Stationswert ist ohnehin am Archiv gefittet (14.–28.09.), nicht am Hindcast | nein, kein Nachfit (Jan 05.10.2026) |
| E-PS-10 | ZIP für DWD CDC | eigener Leser mit `node:zlib` · Abhängigkeit | **eigener Leser.** 46 Zeilen, an 3 Dateien und 13 Einträgen jede CRC32 und Größe gleich dem Verzeichnis (D-PS-11) | eigener Leser (Jan 05.10.2026) |
| E-PS-11 | Archiv-Punktliste erweitern (**eilig** — D-PS-2 zeigt „je Punkt“) | alle nutzbaren Stationen DE/AT/CH · nur die Prüfstationen B · nicht | **alle Wetterstationen, sofort, neue Punkte ohne `live`.** Neu ≈ 540–610 Punkte (DWD 282 mit Temperatur + 68 nur Wind, TAWES 202, SMN 57): +7,1–8,0 MB je Slot (13,1 KB je Punkt), ≈ 21 MB je Slot, 7,6 GB/Jahr. Reine Niederschlagsstationen (902 + 141) als zweite Stufe: +13,7 MB je Slot. Im selben Antrag: E-PS-12 | alle Wetterstationen sofort, neue Punkte ohne `live`; reine Niederschlagsstationen als zweite Stufe (eigener Antrag, zusammen mit E-PS-12) (Jan 05.10.2026) |
| E-PS-12 | **neu** — Archiv schreibt die 2×2-Blockzellen und die Ausgabe des Cube-Pfads mit | beides · nur Block · nur Ausgabe · nicht | **beides.** Ohne Block rechnet der Replay PAP 3 mit einer Zelle, der Browser mit vier (D-PS-2). Ohne gespeicherte Ausgabe gibt es keine Treue-Referenz für das ausgelieferte Produkt (D-PS-5). Kosten: Block ≈ +3 × 6,1 KB je Punkt; Ausgabe laut §9.16 der Phase FI 34 KB je Punkt stündlich (nicht neu gemessen) | beides; die Ausgabe des Cube-Pfads notfalls nur auf den nativen Schritten; wenn nur eines geht, die Blockzellen (Jan 05.10.2026) |
| E-PS-13 | **neu** — Gate G-PS2 neu fassen | wie geplant gegen `live` · gegen die gespeicherten Zeilen der AX-Messläufe · nur Determinismus | **gegen die gespeicherten Zeilen** (`buscosun-hindcast\score\…\rows.jsonl.gz`, Fusion 6/7/8 je Punkt und Schritt) plus Determinismus. `live` ist die Ausgabe des alten Live-Pfads, nicht von Fusion 8 (D-PS-5) | ja: gegen die gespeicherten Messlauf-Zeilen bis auf deren Rundung, zwei Läufe byte-gleich, Taupunkt-Abweichung 0,07 K vorher in PS-2 klären; Probe gegen das echte Produkt kommt dazu, sobald das Archiv es schreibt (Jan 05.10.2026) |
| E-PS-14 | **neu** — Champion | Fusion 8 · Fusion 9 | **Fusion 9** (seit 04.10. der Stand im Code). Am Archiv rechnen 8 und 9 identisch, weil es nur Stundenwerte trägt (gemessen: gleicher Hash an 3 Punkten) | Fusion 9; Fusion 8 bleibt „historisch“ (Jan 05.10.2026) |
| E-PS-15 | **neu** — Zeitbezug der Wahrheit DE und Böen-Intervall | W1 einheitlich am Stempel H · wie das Archiv (DE H − 10 min) | **einheitlich am Stempel H.** Die Archiv-Wahrheit DE ist der 10-min-Wert von H − 10 min (D-PS-3); gegen den Wert zu H weicht T im Mittel 0,22 K ab, maximal 2,0 K. Böe in t2/t3 mischt Stundenmaximum (ICON) und Schrittmaximum (ECMWF) — P1 bewertet die Böe nur stündlich bis 48 h als Kern (D-PS-6) | W1 einheitlich am Stempel H (Archiv-Wahrheit DE nur noch als Anker-Eingabe); Böe Kernzelle stündlich bis 48 h, t2/t3 als Nebenzelle gegen das Schrittmaximum, gemischte Definition im Bericht benannt (Jan 05.10.2026) |

## 10. Harte Grenzen (STOPP & FRAGEN)

- Keine Änderung an buscosun Fusion (`src/pointForecast/**` inkl. `fusion/*`, Tabellen, Optionen, `FUSION*`-Schalter,
  Fit-Pipeline) — nur aufrufen. Braucht der Replay oder das Maskieren eine Änderung am Motor: STOPP.
- `buscosun-archiv`, `buscosun-hindcast` und `C:\dev\buscosun-data` nur lesen; `git pull --ff-only` im Archiv-Klon ist
  erlaubt. Proben in einem Scratch-Ordner.
- Kein Push, kein Commit in andere Repos, kein Workflow in Archiv- oder Daten-Repo.
- Keine neue Abhängigkeit ohne Rückfrage (E-PS-10).
- Tresor und Spur P nur im Modus `abnahme` öffnen; jede Öffnung protokollieren.
- Protokoll-Werte ändern sich nur über P2 mit Jans Zustimmung; nachträgliches Verschieben einer Schwelle ist verboten.
- Wahrheit nie anhand einer Vorhersage filtern.
- Keine Konstante ohne Herleitung: jede Zahl in P1 ist gemessen oder als Jans Entscheidung markiert.

## 11. Jans Gates

- **Je Phase:** Durchsicht, Commit (Scope `pruefstand`), Push `buscosun-web`. PS-0 committet nur diese MD-Datei.
- **G-PS0:** Entscheidungen E-PS-1…11 in §9 eintragen (Spalte „Jans Entscheidung“).
- **E-PS-6:** eigener Antrag und Push in `buscosun-archiv`.
- **PS-4:** Der Skill ist nach dem Commit sofort aktiv (Projekt-Skill im Repo).

## 12. Bedienung nach dem Bau — je neue Version

1. Neue Fusion-Version committen (Code und Tabellen).
2. `/pruefe-fusion 9` oder „teste die neue buscosun fusion 9 über unsere Prüfroutine“: Register-Eintrag, Volltest auf
   der Entwicklungsmenge, Kurzurteil. Beliebig oft wiederholbar, ohne den Tresor zu verbrauchen.
3. Sieht das gut aus: `/pruefe-fusion 9 abnahme`: Selbstprüfung, Abnahme gegen Champion und alle Vorgänger, Bericht,
   Rangliste, Urteil Champion / Kandidat / abgelehnt.
4. Bei „Kandidat“ (noch nicht nachweisbar): später erneut abnehmen; der Replay rechnet die neuen Archivtage nach.
5. Bei „Champion“: Status im Register setzt Jan; die Liveschaltung von Fusion 9 bleibt ein eigener Schritt.

## 13. V-Katalog (Start)

- **V-PS-1** Die Fit-Pipeline schreibt Fit-Fenster und Tresor-Hash in die Tabellen-Metadaten. Mehrwert: Register und
  Leck-Prüfung vollautomatisch. Braucht eine Änderung an Fusion, also eigener Antrag.
- **V-PS-2** Archiv mit 4 Slots je Tag (E-PS-6). Mehrwert: Vorlauf und Tageszeit entkoppelt, Sprunghaftigkeit messbar.
- **V-PS-3** Das Archiv schreibt jede neue Quelle ab dem Tag mit, an dem ihre Integration beginnt (Konzept §16).
- **V-PS-4** Spur R aus Originalquellen statt Open-Meteo-Nachbau (Lizenz bei späterer Monetarisierung).
- **V-PS-5** Konzept-Doc nachziehen: kein Actions-Schattenlauf, alles lokal (§0.5).
- **V-PS-6** Das Archiv speichert die Ankerwerte zur Ausgabezeit mit (falls D-PS-2 (c) „nein“ ergibt). Mehrwert: Replay
  ohne nachträglich korrigierte Messwerte, also ohne geschönte Anker.

## 14. Diagnose-Ergebnis und Umsetzung (füllt die Phase)

### 14.0 PS-0 — Kurzfassung (05.10.2026)

Gemessen am 05.10.2026 an 21 Archiv-Slots (14.09.–04.10.), am lokalen Hindcast und an den Originalquellen. Kein Code im
Repo; die Proben liegen im Scratch-Ordner der Sitzung (`ps0/`, `ps0-hc/`, `ps0-truth/`) und sind Wegwerf-Skripte.

1. **Das Archiv speichert je Punkt eine Zelle je Stufe.** Stationen ohne Archivpunkt sind rückwirkend nicht prüfbar
   (E-PS-11, eilig).
2. **`live` ist nicht buscosun Fusion 8.** Der Block ist die Ausgabe des alten Live-Pfads. Die geplante Treue-Probe
   „Replay gegen `live`“ gibt es so nicht (E-PS-13).
3. **Der Replay geht ohne Motor-Änderung.** `fuseCubePoint` ist eine reine Funktion; der vorhandene Archiv-Adapter baut
   die Eingabe. Zwei Läufe sind byte-gleich, 48 s je Slot und Version.
4. **5e, 6, 7 und 8 sind rekonstruierbar.** Alle Tabellen liegen lokal mit den dokumentierten Hashes. Motor am alten
   Commit und Motor von heute mit denselben Optionen liefern denselben Hash.
5. **Am Stationspunkt sind 6 und 7 identisch und 8 weicht nur an nassen Radarstunden ab.** Eine Rangliste „6 gegen 7
   gegen 8“ zeigt dort per Bauart Gleichstände.
6. **Jede Bestandsversion hat alle 389 Stationen im Fit gesehen.** Zurückgehaltene Stationen im Sinn des Konzepts gibt
   es heute nicht; sie entstehen erst mit neuen Archivpunkten.
7. **Spur P ist für Fusion 8 drei Tage lang** (02.–04.10.), für Fusion 9 null.

### 14.1 D-PS-2 — Archiv (zuerst beantwortet)

**(a) Form.** `cube.t1/t2/t3.byPoint[<id>]` je Punkt mit genau einer Zelle (`cell {iy, ix, lat, lon, offsetKm}`), alle
Ebenen ganzzahlig. Der Sammler ruft `readCubePoint` ohne `neighbours` auf (`scripts/punktarchiv/collect.mjs:254`); kein
Slot trägt einen Block. Archiviert sind 411 von 48 441 t1-Zellen, 409 von 12 221 t2-Zellen, 351 von 2 009 t3-Zellen.

**(b) Punkte und Abdeckung.** 405 Punkte seit 18.09. (DE 203, AT 84, CH 101, LI 1, Nachbarn 16); 14./15.09. 243,
16./17.09. 410. Alle Punkte haben in jedem Slot alle drei Stufen.

| Netz | Stationen aktiv | davon Archivpunkt | nicht gesichert |
|---|---|---|---|
| DWD CDC 10-min Temperatur | 461 | 179 | 282 |
| DWD CDC 10-min Wind | 275 | 178 | 97 |
| DWD CDC nur Niederschlag | 902 | 0 | 902 |
| GeoSphere TAWES | 286 | 84 | 202 |
| GeoSphere `klima-v2-10min` | 285 Standorte (476 Einträge) | 83 | 202 |
| MeteoSwiss A1 (SMN) | 159 | 102 | 57 |
| MeteoSwiss A2 (Niederschlag) | 141 | 0 | 141 |

- DE: Zuordnung Archivpunkt → CDC-Kennung über das DWD-Stationslexikon, 203 von 203 eindeutig. 24 Punkte sind
  Flugplatz-Stationen ohne 10-min-Daten in CDC. Die Zuordnung über die nächste Station ist für genau diese 24 falsch.
- Nur per Zufall liegt die Zelle einer fremden Station in allen drei Stufen im Archiv: DE etwa 20, AT 4, CH 1.

**(c) Ankerwerte.** `truth.byPoint` hält die zur Slotzeit abgerufenen Stundenwerte der letzten 25 h (Echtzeitstand).
Einschränkungen: nur an den Archivpunkten selbst; DWD-POI endet 60–83 min vor dem Slot, TAWES/SMN 18–23 min; nur
Stundenstempel; INCA-Analyse (AT) vollständig erst seit 02.10. Der Browser nimmt dagegen die jüngste 10-min-Messung
der sechs nächsten Stationen.

**(d) Größe.** 32,4 KB gz je Punkt und Slot: `live` 19,3 · Cube 6,1 · MOSMIX-L 3,3 · MOSMIX-S 3,2 · Wahrheit 0,3 ·
Rest 0,2. Slot 13,2 MB, Sammellauf 8,5–14,1 min (Anteile am 04.10.: `live` 180 s, `hmodel` 138 s, Cube 108 s,
Stationen 96 s, Nowcast 76 s).

**Inventar.**

| Zeitraum | Slots | Archiv-Schema | Punkte | Cube-Ebenen | Besonderheit |
|---|---|---|---|---|---|
| 14.–15.09. | 2 | 1 | 243 | 57 | nur POI-Wahrheit an allen Punkten; TAWES 11, SMN 6 |
| 16.–17.09. | 2 | 1 | 410 | 57 | |
| 18.–28.09. | 11 | 2 | 405 | 57 | 19.09.: 3 Fehler im Slot |
| 29.09. | 1 | 3 | 405 | 57 | |
| 30.09. | 1 | 3 | 405 | 61 (Cube-Schema 6) | |
| 01.–04.10. | 4 | 4 | 405 | 61 | 01.10. INCA an 40 von 84; 03.10. Slot erst 00:01 UTC (Datei `2401`) |

- 21 Tage, 21 Slots, keine Kollision (`-r<n>`), 338 MB.
- Alter des Quell-Laufs zur Slotzeit: t1 2,3 h (19./21.09.: 5,3 h), t2 5,3 h, t3 11,3 h.
- `live`: alle Punkte, 240 h (die ersten 10 Punkte 372 h), 0,01 °C / m/s / mm/h, 0,1 % bei Feuchte und Bewölkung.
- MOSMIX-L an allen Punkten; MOSMIX-S seit 01.10.; Nowcast deckt 401 von 405 Punkten.

### 14.2 D-PS-1 — Wiederverwendbares

| Baustein | Ort | Urteil |
|---|---|---|
| CRPS geschlossen (Normal, gestutzt, zensiert), Pinball | `src/pointForecast/fusion/dist.ts:399–431` | übernehmen |
| CRPS als Quantil-Integral | `dist.ts:451` | anpassen (Stützstellen festlegen) |
| `scoreDist` (Punktwert, CRPS, PIT, σ) | `scripts/fusionfit/lib/distScore.mjs:16` | übernehmen |
| QS3 (0,1/0,5/0,9) | `distScore.mjs:14,36,43` | anpassen auf 19 Stufen |
| `ScoreAcc` (MAE, Bias, RMSE, PIT-Histogramm, Spread-Skill), randomisierte PIT | `scripts/fusionfit/lib/stats.mjs:205–255` | übernehmen |
| Brier mit Zuverlässigkeitstabelle, POD/FAR/ETS | `stats.mjs:258,269` | anpassen (Zerlegung fehlt) |
| Diebold-Mariano nach Harvey/Leybourne/Newbold, Block-Bootstrap, Benjamini-Hochberg | `stats.mjs:96,128,147` | übernehmen |
| Archiv-Adapter (Eingabe des Motors aus einem Slot), Wahrheits-Dekoder, Nachträge | `scripts/fusionfit/lib/archiveAdapter.mjs` | übernehmen |
| Modus S / L (eigene Station maskiert, Nachbar als Anker) | `scripts/fusionfit/stack-extract.mjs:351–382` | übernehmen |
| Hindcast-Leser | `scripts/fusionfit/lib/slotAdapter.mjs` | übernehmen |
| `shadow.mjs`, `cdn-shadow.mjs` | `scripts/hindcast/` | ersetzen (vergleichen Eingaben, keine Ausgaben) |

Nicht vorhanden: Abdeckung q10–q90 als eigenes Maß, Brier-Zerlegung, AR-Inflation, twCRPS, RPS, SEDI.

Fund am Rand: `stack-score.mjs` vergleicht beim Regen P(Y > 0) (`:60`) mit dem Ereignis y ≥ 0,1 mm (`:55`, `:288`) —
vom Hilfslauf gemeldet, von mir nicht nachgeprüft (V-PS-8).

### 14.3 D-PS-3 — Wahrheit gegen die Originale

Stichprobe 3 Tage (20.09., 27.09., 02.10.) × 20 Punkte je Netz.

| Netz | Ergebnis | Systematik |
|---|---|---|
| DE (POI gegen CDC) | T, Böe, Druck 100 % gleich; Td 97 %, Niederschlag 99,7 % (nasse Stunden 98 %), Bewölkung 90 % | „Stunde H“ ist der 10-min-Wert von H − 10 min, Fenster hh−1:50…hh:50. Gegen den Wert zu H: T nur 22 % gleich, Mittel 0,22 K, max 2,0 K. Wind in ganzen km/h (± 0,14 m/s) |
| AT (TAWES gegen `klima-v2-10min`) | T, Richtung, Böe 100 %; Wind 97,9 %; Niederschlag 99,7 % (nass 84 %) | TAWES heute erneut geholt: 100 % gleich, das Archiv ist der unveränderte Echtzeitwert. Die Qualitätsprüfung ändert Wind (≈ 2 %) und Niederschlag (einzelne 0,1 mm). `klima-v2` hat keinen Taupunkt |
| CH (SMN gegen `_t_recent`) | alle Größen 99,9–100 % | erste Stunde jedes Fensters ohne Stundenmaximum und Stundensumme (Lücke, keine Abweichung) |

- Zeit überall UTC, Stempel = Intervallende. Für DWD aus dem Verhalten abgeleitet, nicht aus der Produktbeschreibung
  gelesen.
- Bewölkung nur DE (stündlich, Achtel). Strahlung und Sonnenschein in allen drei Netzen. Sicht nur DE stündlich.
- Windmesshöhe: DE in den Gerätemetadaten der Stunden-ZIPs (19 Stationen: 9,1 bis 37,7 m, 9-mal 10 m). AT und CH nicht
  in den offenen Metadaten.
- Verlegungen: DE `Metadaten_Geographie`, AT `valid_from/valid_to` je Eintrag, CH nur eine Zeile je Station.
- Archiv-Befunde aus §1 bestätigt: `id` ≠ `wmo` an 17 AT-Punkten; |Stationshöhe − DEM| > 100 m an 9 DACH-Punkten.

### 14.4 D-PS-4 — Hindcast

| Route × Stufe | Slots | Tage | Zeitraum | Ausgabezeiten UTC |
|---|---|---|---|---|
| Tag 0 / t1 | 1 119 | 1 119 | 2023-05-25 … 2026-06-16 | 00 |
| dyn / t2 | 3 227 | 807 | 2024-04-01 … 2026-06-16 | 00/06/12/18 |
| dyn / t3 | 1 614 | 807 | 2024-04-01 … 2026-06-16 | 00/12 |
| Lauf / t1 | 774 | 97 | 2026-06-17 … 2026-09-21 | dreistündlich |
| Lauf / t2 | 387 | 97 | wie oben | 00/06/12/18 |
| Lauf / t3 | 192 | 97 | wie oben | 00/12 |

- 4 314 Dateien an 1 216 Tagen, 7,24 GiB; Wahrheit 1 217 Tagesdateien, 124 MB; Cache laut Index 39 GiB.
- Gleiche JSON-Familie wie das Archiv (`kind: hindcast/slot`), eigener Leser vorhanden. Trägt den 2×2-Block, aber
  **kein MOSMIX, keinen Nowcast, keine Messungen zur Ausgabezeit** und 57 statt 61 Ebenen. Spur R kann damit nur die
  Kette ohne Stationsmember und ohne Anker prüfen, nicht das ausgelieferte Produkt.
- 405 Punkte, Wahrheit an 389.

| Tabelle | Fit-Fenster | Quelle | Steht in der Datei? |
|---|---|---|---|
| Lernstufe Fit 5e | 2025-09-01 … 2026-09-21, 40,8 Mio. Zeilen, 389 Punkte | Hindcast | ja (`period`, `inputs`); Ausdünnung nur im Shell-Skript |
| Wolkenatome (AX-4) | dieselben Fälle | Hindcast | nur als Notizzeile |
| Stationswert mit Landesparametern (ausgeliefert) | 2026-09-14 … 09-28, 14 Ausgabetage | Archiv | ja |
| `precipCal` (aus) | 2026-09-14 … 09-30 | Archiv | ja |

Kein Fit hat Hindcast-Tage vor dem 01.09.2025 gesehen (`build-cases.mjs --from=2025-09-01`).

### 14.5 D-PS-5 — Replay

- **Einstieg:** `fuseCubePoint(input, options)` aus `src/pointForecast/cubeSource.ts`; Eingabe über
  `inputFromArchive` (`archiveAdapter.mjs:243`). Kein Browser, kein Netz.
- **Eingaben außerhalb des Slots:** Merkmalstabelle `buscosun-hindcast\features\points.v1.json` (Gelände,
  Landbedeckung, Stadt-Raster je Punkt), `public/climaGrid.json`, die drei Tabellen.
- **Optionen der Stufe:** in `fusionRelease.ts` (Stand 9, uncommitted); an älteren Commits stehen sie inline in
  `forecastFromBundle` und sind nicht exportiert. Der Adapter muss sie je Version aus dem Register setzen.
- **Determinismus:** zwei Läufe an 10 Punkten und zwei an 389 Punkten, jeweils gleicher Hash.
- **Maskieren:** Station und Messung werden in der Eingabe weggelassen (`station: null`, `obs: null`) oder durch den
  Nachbarn ersetzt. Keine Motor-Änderung nötig. Wirkung an 3 Punkten bei +48 h (Median T mit → ohne eigene Station und
  Messung): 9,6 → 9,7 °C (10282), 13,1 → 10,5 °C (11112), 8,2 → 13,7 °C (06659 Pilatus).
- **Quantile:** 19 Stufen für alle Familien (Normal, zensierte Normal, gestutzte Normal, Rice, Hürde-Lognormal,
  Wolkenmischung, log-zensiert); 0 Fehler, 0 nicht monotone Sätze.
- **Probe gegen `live` entfällt:** `live.byPoint[].fusion` ist der alte Live-Pfad (`getPointForecast`, ohne Radar).
  Eine Ausgabe des Cube-Pfads liegt in keinem Slot.
- **Abstand Replay ↔ Browser** (nicht messbar, weil die Browser-Ausgabe nicht gespeichert ist): eine Zelle statt
  2×2-Block; Gelände aus der Merkmalstabelle statt Terrarium am Punkt; eine eigene Stundenmessung statt sechs
  nächster 10-min-Messungen.

### 14.6 D-PS-6 — Einheiten

| Größe | Cube | MOSMIX | Wahrheit |
|---|---|---|---|
| Niederschlag | mittlere **Rate** in mm/h über den Stufenschritt, der am Schritt endet (1/3/6 h); Summe = Rate × Schritt (`cubeFormat.ts:262`, `build-point-cube.mjs:680,708`) | `RR1c`, Summe der letzten Stunde | Stundensumme (POI `rr1`, TAWES/SMN `rr1h`) |
| Böe | `vmax_10m` (ICON: Maximum der Vorstunde, auch in t2/t3) gemischt mit ECMWF `10fg` (Maximum seit dem letzten Schritt) | `FX1`, Maximum der letzten Stunde | Stundenmaximum `fxh` |
| Wind | Momentanwert u/v | `FF` | 10-min-Mittel (DE in km/h gerundet; AT Vektormittel) |
| T, Taupunkt | Momentanwert auf `hModEff`, nicht auf Punkthöhe | 2 m | 10-min-Wert |
| Bewölkung | % | `N` in % | nur DE, Achtel × 12,5 |

Damit ist die seit D-NP0-9 offene Frage beantwortet: `precip` ist eine Rate. Offen bleibt die gemischte Böen-Definition
in t2/t3 (E-PS-15).

### 14.7 D-PS-7 — Versionen

| Version | Commit | Tabellen | Wo | Fit sah / Entscheidung sah | Urteil |
|---|---|---|---|---|---|
| 5e | `56066ae` (29.09.; Kette der Phase FV vom 27.09.) | `fusion.hindcast.json` sha `a71e53c9…` | nur lokal, `buscosun-hindcast\fit\2026-09-27-fx5e\` (kein Git) | Hindcast bis 21.09. / Archiv bis 26.09. | rekonstruierbar |
| 6 | `a02f2b5` / `6d5933d` (30.09.) | `fusion.client.json` sha `0714300f…`, `stack.client.json` sha `9d22ff35…`, Klimatologie sha `85d73cea…` | Daten-Repo `1aaec969` (im lokalen Klon vorhanden) **und** `buscosun-hindcast\publish\2026-09-30-ax12\` | Archiv bis 28.09. | rekonstruierbar |
| 7 | `751bee2` (02.10.) | wie 6 | wie 6 | Archiv bis 30.09. | rekonstruierbar |
| 8 | `07cc7cf` (03.10.) | wie 6 | wie 6 | Archiv bis 01.10. | rekonstruierbar |
| 9 | `0ad0615` (05.10.) | wie 6 | wie 6 | nicht am Archiv gemessen | rekonstruierbar, am Archiv ≡ 8 |

- **(b)** Keine Tabelle liegt im Web-Repo (`git ls-files` leer). Die Hashes stimmen mit den Angaben in CLAUDE.md
  überein.
- **(c)** Der Replay holt nichts live; alles kommt aus Slot, Merkmalstabelle und Tabellen.
- **(d)** Der Adapter am Commit von 5e liest nur Archiv-Schema 1/2 und bricht an Schema 3/4 ab. Lösung: Adapter von
  heute, Motor aus dem Worktree. So geprüft an Schema 2, 3 und 4.
- **(e)** Je Version zwei Läufe im Worktree: gleicher Hash. Motor am alten Commit und Motor von heute mit den Optionen
  der Version: gleicher Hash (5e an 3 Slots × 3 Punkten; 6, 7, 8 an 389 Punkten des Slots 02.10.).
- **(f)** Gespeicherte Ausgaben: `buscosun-hindcast\score\2026-10-01-f7\rows.jsonl.gz` (Fusion 6, 7) und
  `…\2026-10-02-f8r-b\rows.jsonl.gz` (Fusion 7, 8; 446 141 Zeilen), je Punkt und Schritt als Verteilungsparameter auf
  4 Stellen; 5e in `…\2026-09-30-now5e-b\`. Stichprobe Fusion 8 am Slot 30.09.: Wind, Niederschlag, Bewölkung gleich
  bis auf die Rundung (5·10⁻⁵), T bis 0,0004 K, Böe bis 0,003 m/s, Taupunkt bis 0,07 K. Am Slot 16.09. bis 0,7 K —
  die Messläufe rechneten dort mit Falten-Tabellen und Leave-Station-out-Klimatologie, der Replay mit den
  ausgelieferten Tabellen. Die Ursache der Taupunkt-Abweichung am 30.09. ist nicht geklärt (vermutlich die
  Td-Messung in der Eingabe der Messläufe).
- **(g)** Fit-Fenster stehen in den Tabellen. Der Zeitpunkt, bis zu dem bei der Entscheidung Archivtage angesehen
  wurden, steht nur in CLAUDE.md und den Audits.
- **Worktree ohne `npm ci` läuft nicht** (`src/sources/decompress.ts` importiert `bz2`).
- **Gleichstände per Bauart:** am Stationspunkt (Messdistanz 0) ist 7 ≡ 6; 8 weicht von 7 nur an Radarstunden mit
  Niederschlag ab (Slot 01.10.: 1–2 Schritte je nassem Punkt; Slot 02.10.: 0 von 389 Punkten). Unterschiede zwischen 6
  und 7 zeigt nur der Modus mit Nachbar-Anker.

### 14.8 D-PS-8 — Autokorrelation und Nachweisgrenze

Paar: `live`-Fusion (CRPS aus q10/q50/q90) gegen MOSMIX-L (MAE), 389 Punkte, Tagesmittel je Zelle, 15–20 Tage.

| Größe | k (AR(2)) je Fenster 0–6 / 6–24 / 24–48 / 48–120 / 120–240 h | n_eff | Nachweisgrenze heute | bei 90 Tagen |
|---|---|---|---|---|
| T | 1,6 / 2,2 / 2,0 / 2,0 / 1,3 | 4–9 | 14–69 % | 6–32 % |
| Taupunkt | 1,6 / 1,8 / 1,6 / 1,0 / 1,9 | 4–18 | 3–8 % | 1–3 % |
| Wind | 1,0 / 1,2 / 1,2 / 2,2 / 1,6 | 4–20 | 7–31 % | 4–14 % |
| Böe | 1,1 / 1,0 / 1,0 / 1,9 / 1,7 | 5–20 | 7–15 % | 3–6 % |
| Niederschlag | 1,1 / 1,0 / 1,0 / 1,9 / 1,5 | 5–20 | 35–44 % (bis 120 h) | 16–21 % |

- Die Zahlen gelten für dieses Paar (zwei sehr verschiedene Systeme). Zwei benachbarte Fusion-Versionen streuen
  enger; ihre Nachweisgrenze misst PS-3 im A/A-Test.
- r₁ bis 0,73; bei T schon im Fenster 6–24 h 0,70, bei Böe und Niederschlag unter 48 h höchstens 0,26 ⇒
  Tresor-Abstand 7 Tage für alle Größen (r₁ = 0,7 fällt erst nach etwa 7 Tagen unter 0,1).
- Aus 15–20 Tagen ist eine AR(2)-Schätzung unsicher (Standardfehler von r ≈ 0,22).

### 14.9 D-PS-9 — Stationspool

389 Punkte (DE 203, AT 84, CH 102 mit LI). Geländeklasse aus `points.v1.json` (TPI und Reliefspanne auf Ringen
500 m … 12 km, Hangneigung); die Schwellen sind ein Vorschlag, die Bedeutung von `spreadM` ist nicht am Code geprüft.

| Klasse | flach | Hügel | Tal | Hang/Rücken | Gipfel |
|---|---|---|---|---|---|
| Punkte | 131 | 112 | 89 | 34 | 23 |

- 37 von 60 Schichten (Land × 4 Höhenstufen × 5 Klassen) besetzt, 7 mit nur einer Station, 17 mit höchstens drei.
- B-Anteil 15 % ⇒ 57 Stationen, 17 Schichten ohne B. 25 % ⇒ 101, 7 ohne. 35 % ⇒ 134, 7 ohne.
- 36 Tal-/Berg-Paare unter 15 km mit ≥ 300 m Höhendifferenz (DE 4, AT 6, CH 26), größte Garmisch–Zugspitze 2 241 m.
- **Alle 389 Punkte sind die Trainingsstationen der Lernstufe und des Stationswerts.**

### 14.10 D-PS-10 — Laufzeit und Speicher

| Posten | Messwert |
|---|---|
| Replay je Slot × Version | 48 s (389 Punkte, stündlich bis 336 h; Motor 27 s, Rest Lesen und Quantile) |
| 21 Slots × 5 Versionen | ≈ 1,4 h auf einem Kern |
| Konserve je Slot × Version | 19 MB roh auf dem P1-Raster (108 Schritte × 6 Größen × 19 Quantile × 389 Punkte), 46 MB stündlich |
| Archiv je Slot | 13,2 MB, davon `live` 7,8 MB |
| Vier Slots je Tag | 29 MB/Tag mit `live` nur einmal |

Gemessen unter Fremdlast (parallele Installation); die Größenordnung trägt, die Sekunde nicht.

### 14.11 D-PS-11 — ZIP

Eigener Leser mit `node:zlib` (`inflateRawSync`, 46 Zeilen) an drei CDC-Dateien geprüft; alle 13 Einträge mit
richtiger CRC32 und Größe. Keine Abhängigkeit nötig. Fallen: Datenversatz aus dem lokalen Kopf lesen; Zeilen enden auf
`;eor`, Fehlwert −999; die 10-min-ZIPs tragen keine Metadaten (nur die Stunden-ZIPs); `recent` endet am Vortag 23:50,
`now` trägt den laufenden Tag.

### 14.12 Anker-Korrekturen zu §1

| Anker in §1 | Befund |
|---|---|
| Archiv „Schema 3“ | Schema 1 (4 Slots), 2 (11), 3 (2), 4 (4); der Leser liest alle |
| Archiv „ab 14.09., täglich 23:10“ | Slots 23:18–23:23 UTC; erster 20:46; 03.10. erst 00:01 des Folgetags |
| Leser `lib/punktarchiv.mjs` | liegt im Web-Repo: `scripts/punktarchiv/lib/punktarchiv.mjs` |
| `live` (mu/q10/q50/q90) als Fusion-Ausgabe | ist der alte Live-Pfad, nicht der Cube-Pfad (Fusion 6–9) |
| „Unbekannt: Cube je Punkt oder Gitter“ | je Punkt, eine Zelle, kein Block |
| Punkte außerhalb DACH „NL, DK“ | DK 1, NL 4, LU 1, CZ 9, SK 1 |
| `tsMs` null | bestätigt; die Achse ist `t0Ms` + Stundenindex. `ageH` heißt seit Schema 2 `ageAtSlotH` und ist gefüllt |
| `weights: equal` / `provenance: fallback` | bestätigt, in jedem Slot (Angabe des Cube-Producers) |
| Hindcast „rund 46 GB mit Cache“ | Slots 7,24 GiB, Cache 39 GiB, Fälle 5,9 GiB, Scores 2,1 GiB |
| Hindcast „gleiche Struktur wie Archiv“ | gleiche Familie, aber ohne MOSMIX, Nowcast, Messungen; mit Block |
| Tabellen `fusion.client.json`, `precip-cal.client.json` | `fusion.client.json`, `stack.client.json` und `static/clima/v1` im Daten-Repo; `precip-cal` ist nicht ausgeliefert (Option aus) |
| `read-point.mjs` | `scripts/point/read-point.mjs` |
| Champion „Fusion 8“ | der Stand im Code ist Fusion 9 (seit 04.10.) |
| „nass = Radar-Analyse ≥ 0,1 mm/h“ | die Scorer nehmen die Stationssumme ≥ 0,1 mm; Radar ist nie Wahrheit |
| DWD „rund 500 + knapp 500 Stationen“ | 10-min: 461 Temperatur, 275 Wind, 902 nur Niederschlag |
| GeoSphere „rund 260“ | TAWES 286 aktiv; `klima-v2-10min` 285 Standorte |
| MeteoSwiss „rund 160 + rund 100“ | 159 und 141 |
| Vorlauf-Fenster 0–6 … 240–336 h | die vorhandenen Scorer nutzen 0–6, 7–24, 25–48, 51–120, 126–240, 246–336 h (native Achse mit Lücken 49–50 und 121–125 h) |

### 14.13 Gate G-PS0

| Frage | Stand | Beleg |
|---|---|---|
| §14 gefüllt (D-PS-1…11) | ja | §14.1–§14.11 |
| Anker-Korrekturen benannt | ja | §14.12 |
| Entscheidungsvorlage mit Messwerten | ja | §9, E-PS-1…15; von Jan am 05.10.2026 entschieden (jeweils die Empfehlung) |
| Kein Code im Repo | ja | `git status` nach PS-0 gleich dem Stand davor; geändert nur diese Datei und die Dokumentenkarte in CLAUDE.md |
| Fremde Repos unverändert | ja | Archiv-Klon nur `git pull --ff-only`; vier Scratch-Worktrees unter `C:\dev\ps0-wt\` angelegt und wieder entfernt |

Nicht bestimmt in PS-0: Windmesshöhen AT/CH; DWD-Zeitbezug aus der Produktbeschreibung; Stundenabdeckung aller 24
Flugplatz-Stationen (4 geprüft); ob der Fit unter einer Tagesmaske wiederholbar ist (durch E-PS-3 hinfällig, falls so
entschieden); Abstand Replay ↔ Browser.

### 14.14 Neue V-Einträge

- **V-PS-7** Die Tabellen von 5e und die Merkmalstabelle liegen nur in `C:\dev\buscosun-hindcast` (kein Git, keine
  zweite Kopie). Mehrwert: ohne sie ist 5e verloren und kein Replay möglich. Skizze: Tabellen und `points.v1.json`
  mit Hash nach `C:\dev\buscosun-pruefstand\` kopieren und extern sichern.
- **V-PS-8** `stack-score.mjs` bewertet beim Regen P(Y > 0) gegen das Ereignis y ≥ 0,1 mm. Mehrwert: saubere
  Brier-Zahlen der AX-Messungen. Skizze: nachprüfen, dann `exceedance(dist, 0,1)` verwenden.
- **V-PS-9** Die Merkmalstabelle für neue Archivpunkte (E-PS-11) muss gebaut werden, bevor der Replay sie rechnen
  kann (`scripts/fusionfit/features.mjs`). Mehrwert: neue Stationen werden prüfbar.
- **V-PS-10** Archiv-Wahrheit DE auf den Stempel H umstellen oder den Versatz von 10 min im Slot benennen
  (E-PS-15). Mehrwert: DE, AT und CH auf gleichem Zeitbezug.
- **V-PS-11** Das Register der Stände nennt je Stand die Tabellen-Hashes und das Datum der letzten angesehenen
  Archivtage. Mehrwert: Freeze je Version maschinenlesbar statt aus CLAUDE.md. Braucht eine Änderung unter
  `src/pointForecast/`, also eigener Antrag.

*(Umsetzung PS-1…PS-4 und ihre Gate-Tabellen folgen je Phase.)*

## Anhang A — `.claude/skills/pruefe-fusion/SKILL.md` (Lieferobjekt PS-4-2)

```markdown
---
name: pruefe-fusion
description: Prüft eine Version von buscosun Fusion mit dem festen Prüfstand (Protokoll P1) an realen Stationen gegen den Champion und alle früheren Versionen. Immer verwenden, wenn Jan eine Fusion-Version testen, prüfen, bewerten, vergleichen oder abnehmen will, z. B. "teste die neue buscosun fusion 9 über unsere Prüfroutine", "/pruefe-fusion 9", "ist fusion 9 besser als 8?".
---

# Prüfstand ausführen

Argumente: $ARGUMENTS — Version (z. B. `9` oder `fusion-9`), optional `abnahme` oder `schnell`;
oder mehrere Versionen mit `vergleich` (z. B. `5e 6 7 8 vergleich`).
Register: !`node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/pruefstand/run.mjs --modus status`

Du bedienst eine feste Routine. Du rechnest keine Maße selbst, änderst kein Protokoll, keine Schwelle, keine Tabelle
und keinen Code unter `src/pointForecast/`. Zahlen kommen nur aus `scores.json`.

## Ablauf
1. Version auf `fusion-<n>` normalisieren. Archiv-Klon `C:\dev\buscosun-archiv` mit `git pull --ff-only` aktualisieren.
2. Register prüfen (`scripts/pruefstand/register/fusion-<n>.json`). Fehlt der Eintrag:
   `run.mjs --registriere fusion-<n>`. Fehlen Freeze-Datum oder Fit-Fenster: Jan fragen, nichts raten.
3. Modus: ohne Zusatz `voll`; `schnell` nur auf ausdrücklichen Wunsch; `abnahme` nur, wenn Jan das Wort nennt;
   mehrere Versionen nur mit `vergleich` (`--modus vergleich --versionen fusion-5e,fusion-6,…`); der Vergleich entscheidet nichts.
   Die Abnahme öffnet Tresor und Spur P und wird protokolliert. Nie von selbst zur Abnahme wechseln.
4. Ausführen: `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/pruefstand/run.mjs --kandidat fusion-<n> --modus <modus>`
5. Exit-Code ≠ 0: STOPP. Meldung wörtlich wiedergeben (Adapter-Vertrag, G4, Selbstprüfung, fehlende Wahrheit) und
   sagen, was zu tun ist. Keinen Workaround bauen.
6. Antwort im festen Format, Link auf den Bericht.

## Antwortformat
**Fusion <n> — <Champion | Kandidat | abgelehnt | Volltest>** (Protokoll P1, Wahrheit W<x>, Spur <P/R>, <Tage> Tage)
- Fortschrittsindex gegen <Champion>: <±x,x %> (95 %: <a … b>), Nachweisgrenze <y %>
- Gates: G1 <…> · G2 <…> · G3 <…> · G4 <…>
- Drei beste und drei schlechteste Kernzellen (Größe × Fenster × Land, Änderung, Signifikanz)
- Produktaussage: in <k> von <m> Kernzellen besser als jede Einzelquelle
- Warnungen: Überanpassung, unreife Wahrheit, Spur R kontaminiert
- Bericht: <Pfad>
Ist ein Unterschied nicht nachweisbar, das genau so sagen, nicht „besser“ oder „schlechter“.
```
