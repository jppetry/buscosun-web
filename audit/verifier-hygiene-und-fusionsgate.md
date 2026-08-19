# audit/verifier-hygiene-und-fusionsgate.md — Diagnose Phase 1 (V-91 + V-29)

> Stand: 2026-08-03. Diagnose **vor** Code (Diagnose-First, `CLAUDE.md`).
> Auftrag: `improvements.md` V-91 (Verifier-Hygiene) und V-29 (Fusions-Gate reparieren + Artefakt refitten).
> Jans Freigaben zu Beginn dieser Session: simradar-Skript **löschen**; D-07 **ehrlich umschreiben** statt Golddaten einzuchecken.

---

## 1 · V-91 (1): `verify-simradar.mjs` kann nicht rot werden — bestätigt

Am Code nachgeprüft (`scripts/verify-simradar.mjs`, 65 Zeilen):

- `:20-21` re-implementiert `mmhToDbz` / `dbzToMmh` **als Kopie**, statt aus `src/` zu importieren. Der Modulkopf sagt das selbst (`:8-14`) und begründet es mit der WebGL-Abhängigkeit von `radarModel.ts`.
- `:31-36` prüft den Rundlauf **dieser Kopie gegen sich selbst** — `mmhToDbz(dbzToMmh(d)) == d` ist für die beiden Formeln eine algebraische Identität und für **jede** Parametrisierung wahr.
- `:44-46` prüft Stützwerte gegen dieselbe Kopie, `:51-53` die `visRange`-Schwellen ebenfalls.

**Ergebnis:** Es gibt keine Änderung in `src/`, die diesen Verifier rot färben kann. Er misst nur sich selbst.

**Zweiter Befund:** Das Feature ist weg. `tests.md` führt V-SIMRADAR korrekt als „⛔ STILLGELEGT" (D-15, Konsolidierung N1), `package.json:37` führt `verify:simradar` weiter als aktives Prüfmittel. Die Prüfliste behauptet damit eine Absicherung für Code, den es nicht mehr gibt.

## 2 · V-91 (2): D-07 „bit-verifiziert gegen eccodes" ist nicht reproduzierbar — bestätigt

`scripts/verify-aec.mjs:20-28` liest `ref_meta.json` und sechs `ref_<TAG>.npy` aus einem per Argument übergebenen `<datadir>`, dazu sechs ICON-EU-GRIB2-Dateien mit fixem Lauf-Datum (`2026061700`).

```
$ git ls-files | grep -E 'ref_meta|ref_.*\.npy'      → leer
$ grep -n 'verify:aec' package.json                  → kein Treffer
```

Weder Golddaten noch Erzeugungsskript sind im Repo, und es gibt keinen npm-Alias. Die Aussage in `architecture.md:52` und `decisions.md:23` (D-07) — „DOM-frei und in Node bit-verifiziert gegen eccodes" — beschreibt ein **historisches Einmal-Ergebnis**, kein wiederholbares Gate.

Das Skript selbst ist in Ordnung: es importiert `decodeGrib2` **direkt aus dem Quellmodul** (`:15`), ist also im Gegensatz zu (1) nicht tautologisch. Ihm fehlen nur die Daten.

**Konsequenz (D-04):** Nach Jans Entscheidung wird nicht die Reproduzierbarkeit hergestellt, sondern die **Aussage korrigiert** — plus eine Erzeugungsanleitung im Skriptkopf, damit die Wiederholung möglich bleibt, wer eccodes hat.

## 3 · V-91 (3): zwei Verifier ohne npm-Alias — bestätigt

| Skript | prüft | Status |
|---|---|---|
| `scripts/verify-wind-transport.mjs` | Byte-Identität + Durable-Cache-Header der Edge Function `dwd-wind.ts` | kein npm-Alias |
| `scripts/equivalence-check.mjs` | Browser-vs-Node-Capture-Äquivalenz; schreibt `fixtures/.equivalence-passed`, das **Ship-Gate** von `train-background.mjs:54` | kein npm-Alias |

Beide tragen echte Assertions. `dwd-wind.ts` hat damit heute kein verdrahtetes Prüfmittel, obwohl es den kompletten Wind-Transport trägt.

---

## 4 · V-29: Das Fusions-Gate — drei Defekte, nicht einer

### 4.1 Es kann nicht fehlschlagen (bestätigt)

`scripts/phase3-gate.mjs`:
- `:78` berechnet je Variable ein `ok`-Flag — und **aggregiert es nie**.
- `:82-88` druckt einen **hart kodierten** Verdikt-Text, unabhängig von den Daten.
- Das Skript endet nach `console.log` ohne `process.exit` ⇒ **immer Exit 0**.

Am 2026-08-03 real belegt (`npm run fusion:gate`, 304 Sessions):

```
  variable   fit MAE   heur MAE  gain      95% CI               ok effN
  t2m        2.0631    2.0559    -0.0072   [-0.0076, -0.0067]   ✗ 304
  windSpeed  1.3574    1.3572    -0.0003   [-0.0003, -0.0002]   ✗ 304
  precip     0.2231    0.2751    0.0520    [0.0508, 0.0533]     ✓ 304
  cloud      (no truth)
  ⛔ STOP — DIAGNOSIS: ARCHIVE TOO SHORT (effN < 10).
EXIT=0
```

**Zwei Variablen scheitern sichtbar — Exit-Code trotzdem 0.**

### 4.2 Das Verdikt widerspricht den eigenen Zahlen (neu, nicht in V-29)

Der gedruckte Grund lautet „ARCHIVE TOO SHORT (effN < 10)", während in derselben Tabelle **effN = 304** steht. Ursache: `:55` setzt `anyEffShort`, sobald **irgendeine** Variable `effN < 10` hat — und `cloud` hat strukturell `effN = 0`, weil BrightSky keine Bewölkungs-Wahrheit liefert (`archive-status.mjs:54-58`). Eine Variable, die per Konstruktion nie Stationswahrheit bekommen kann, blockiert damit das Urteil über alle anderen. Das ist exakt der Punkt, den V-31 für die Cutover-Spezifikation vorgemerkt hat.

### 4.3 Das Gate misst in-sample, behauptet aber LOSO (neu, nicht in V-29)

`:46` überschreibt die Ausgabe mit „LOSO τ=0". Tatsächlich:
- `:27` trainiert `trainBackground(fixtures, …)` auf **allen** Fixtures,
- `:57-67` bewertet dieselben Gewichte an **denselben** Stationen derselben Fixtures.

Es findet kein Leave-one-station-out statt — die Bewertung ist **in-sample**. `src/fusion/background.ts:156-187` enthält keinerlei internes Cross-Validation; `trainBackground` fittet direkt.

Für das *aktuelle* Urteil verschärft das den Befund, statt ihn zu entkräften: in-sample **bevorzugt** die gefitteten Gewichte, und sie verlieren trotzdem gegen Gleichgewichtung. Für künftige Läufe ist es aber genau die Falle aus Risiko R2 (`masterplan.md`): ein in-sample-Gate kann grün werden, obwohl die Methode out-of-sample verliert.

**Zusatzbefund zur Ursache des negativen Gewinns:** `minVarWeights` (`background.ts:33-61`) minimiert die **Varianz der bias-korrigierten** Fehler; das Gate misst dagegen den rohen **MAE ohne Bias-Korrektur** (`phase3-gate.mjs:33-40`). Gefittet wird also gegen ein anderes Ziel als gemessen wird. Das ist eine Erklärung, **keine** Rechtfertigung zum Nachjustieren — Constraint C2 („never re-tune to force a pass") bleibt bindend. Der Befund gehört in die Cutover-Spezifikation V-31.

### 4.4 `verify-loso.mjs` assertiert auf Realdaten nicht (bestätigt)

`:68` setzt `ok = crpsOk && ss.corr > 0`; die harten Prüfungen (`beats`, `noDrift`) laufen nur im synthetischen Zweig (`:69-77`). Der Realdaten-Zweig druckt Tabellen und sagt es selbst: „no synthetic sanity assertion applied" (`:78`). Berechnete Konfidenzintervalle (`:48-51`), `driftFlags` (`:58`) und `coverage@1σ` (`:64`) fließen in kein Urteil.

### 4.5 Das Archiv ist reif, das ausgelieferte Artefakt nicht (bestätigt, Zahlen aktualisiert)

```
$ npm run fusion:status
  sessions: 304   span: 2026-07-02T14:00Z … 2026-08-03T20:00Z (774,0 h)
  diurnal: midday=61 afternoon=107 night=94 morning=42   (4 Regime)
  effN: t2m 304 · windSpeed 304 · precip 304 · cloud 0
  VERDICT: ✅ READY to refit + wire bgMinVar live
```

`public/params/background-v1.json` steht auf `trainedWindow.sessions: 2`, Fenster `2026-07-02T14:00Z … 15:00Z` — **zwei Sessions vom 2. Juli**, während 304 vorliegen. (V-29 nannte 273–278; Stand heute 304, das Archiv ist seither weitergewachsen.)

Das Ship-Gate ist offen: `fixtures/.equivalence-passed` existiert (2026-07-02), `train-background.mjs:54` würde also nach `public/params/` schreiben.

**Nachtrag beim Refit — das Artefakt hat keinen Aufrufer.** `src/fusion/params.ts:109` exportiert `loadJsonArtifact<T>(url)` als Browser-Ladepfad. Eine Suche über `src/` findet **keinen einzigen Aufrufer**:

```
$ grep -rn "loadJsonArtifact\|params/background" src/ --include=*.ts --include=*.tsx | grep -v "params.ts:"
(keine Ausgabe)
```

Die 152-KB-Datei wird gebaut, nach `dist/` kopiert und ausgeliefert, aber nie angefordert. Das ist einerseits beruhigend — der Refit ist damit **garantiert wirkungsneutral für Produktion** — andererseits ein Blocker für V-15/V-30: ein Cutover ohne Ladepfad ist nicht möglich. Als **V-129** registriert.

---

## 5 · Was daraus umgesetzt wird

| # | Maßnahme | Datei(en) |
|---|---|---|
| 1 | `verify-simradar.mjs` + npm-Alias entfernen | `scripts/`, `package.json` |
| 2 | D-07 auf „historisch verifiziert, nicht wiederholbar" korrigieren; Erzeugungsanleitung in den Skriptkopf; `verify:aec`-Alias mit ehrlichem Exit 2 bei fehlenden Daten | `decisions.md`, `architecture.md`, `scripts/verify-aec.mjs`, `package.json` |
| 3 | `verify:wind-transport` + `fusion:equivalence` als Aliase | `package.json` |
| 4 | Gate urteilt: stationsblockierte 5-fache Kreuzvalidierung statt in-sample, per-Variable-Aggregation, Reifekriterien programmatisch aus `archive-status`-Logik, **drei Exit-Codes** (0 bestanden · 1 fachlicher Fehlschlag · 2 Archiv objektiv zu kurz), `cloud` ausdrücklich als nicht gate-bar ausgewiesen | `scripts/phase3-gate.mjs` |
| 5 | `verify-loso.mjs`: Realdaten-Zweig assertiert (driftFlags, spread–skill, Signifikanz), `--strict` für Explorationsläufe | `scripts/verify-loso.mjs` |
| 6 | Artefakt auf dem 304-Session-Archiv refitten | `public/params/background-v1.json` |
| 7 | Protokoll V-FUSION-GATE + V-VERIFIER-HYGIENE | `tests.md` |

**Ausdrücklich nicht Teil dieser Phase:** kein Eingriff in `fusionEngine.ts`, keine Flag-Änderung, kein Cutover. Die Flags bleiben aus (D-11). Ob `t2m` jemals umgestellt wird, entscheidet Jan auf Basis eines Gates, das dann **urteilen kann** — genau das ist der Auftrag.

---

## 6 · Ergebnis (Gate GH1, 2026-08-03)

Verifikationsprotokolle mit allen Zahlen: `tests.md` §V-VERIFIER-HYGIENE und §V-FUSION-GATE. Kurzfassung:

| Maßnahme | Beleg |
|---|---|
| simradar entfernt | `grep -c simradar package.json` → 0 |
| D-07 korrigiert | `decisions.md` D-07, `architecture.md` §Decoding |
| `verify:aec` ehrlich | Exit **2** ohne Golddaten, mit ausdrücklicher „KEIN bestandener Test"-Zeile |
| 2 Aliase ergänzt | `verify:wind-transport`, `fusion:equivalence` |
| Gate urteilt | Exit **0 / 1 / 2** an drei echten Archiven belegt |
| Gate misst out-of-sample | stationsblockierte 5-fache CV |
| `fusion:loso` diskriminiert real | PASS 07-05T12 · **FAIL** 08-03T21 (corr −0,019) |
| Artefakt refittet | `sessions: 2` → **305** |
| Typecheck | grün |

### Die fünf Selbstverifikations-Fragen (`CLAUDE.md`)

1. **Funktionserhalt einzeln geprüft.** Kein App-Code berührt. Entfernt wurde ausschließlich `verify-simradar.mjs` — ein Prüfmittel für ein per D-15 gelöschtes Feature, mit Jans ausdrücklicher Freigabe. Alle übrigen Verifier sind unverändert; `fusion:gate` und `fusion:loso` haben ihre Ausgabe **erweitert**, keine Tabelle entfernt (`--insample` reicht sogar die alte In-sample-Tabelle nach).
2. **Desktop pixelgleich.** Trifft nicht zu — reine Werkzeug-/Skript-Phase, keine einzige Datei unter `src/` mit UI-Bezug geändert. Geändert: 4 Skripte, `package.json`, 4 Doku-Dateien, 1 Artefakt-JSON.
3. **Touch-Targets ≥ 44 px.** Trifft nicht zu (keine UI).
4. **Konsole sauber.** Trifft nicht zu (kein Browser-Lauf). Ersatzweise: alle vier Skripte laufen ohne Node-Warnung außer der erwarteten `ExperimentalWarning: Type Stripping`.
5. **Keine Long Tasks > 200 ms.** Trifft nicht zu (kein Renderpfad). Laufzeit-Hinweis für den Betrieb: die 5-fache Kreuzvalidierung trainiert fünfmal über 305 Sessions — `fusion:gate` braucht dadurch spürbar länger als vorher. Das ist der Preis für ein Urteil, das nicht in-sample geschönt ist, und für ein manuell/nächtlich gefahrenes Kommando vertretbar. **Nicht** ins PR-Gate von V-93 aufnehmen (dort gehört es in den Nightly).

### Offene Punkte an Jan aus dieser Phase

- 🔴 **t2m-Cutover ist derzeit nicht gerechtfertigt.** Das reparierte Gate sagt: gefittete Gewichtung out-of-sample schlechter als Gleichgewichtung, signifikant. Nur `precip` gewinnt. Das ist ein Befund, kein Fehler — und nach C2 **nicht** durch Nachjustieren zu beheben. Entscheidung je Variable gehört zu V-31.
- 🔴 **σ ist systematisch zu klein** (V-128) — `coverage@1σ` 0,34…0,54 statt 0,683. Berührt die Unsicherheits-Aussagen der App und damit Achse 3.
- 🔴 **`background-v1.json` hat keinen Ladepfad** (V-129) — zu klären zusammen mit V-30, bevor ein Cutover geplant wird.
