# Protokoll der retrospektiven Verifikation

> Stand 2026-09-05 · Phase PV0 · **Dieses Protokoll wird vor dem ersten Lauf eingefroren.**
> Es gilt zusammen mit `verifikation.md` (Metriken, Splits, Erfolgsschwellen).
>
> ## Revision 2026-09-05 nach J-1/J-2/J-5
>
> J-1 macht den Rückblick zum **Hauptinstrument** („schau einfach, ob es bei den vergangenen
> Vorhersagen besser abgeschnitten hätte"), J-2 streicht die langfristigen Testkampagnen, J-5
> verlegt die laufende Messung ins Produkt. Konkret:
>
> - **§1 und §2 gelten unverändert und werden dadurch wichtiger, nicht unwichtiger.**
>   Ein Rückblick ohne As-of-Rekonstruktion, ohne walk-forward und ohne gesperrten
>   Testzeitraum ist kein Rückblick, sondern eine Selbstbestätigung. Wenn der Rückblick das
>   einzige Instrument ist, muss er sauber sein.
> - **§6 Stufe 2 (prospektiver Schattenbetrieb) entfällt als eigenes Vorhaben.** Seine Rolle
>   übernimmt der **Modellvergleich** (PV4): dieselbe prospektive Messung, aber als Feature,
>   das ohnehin läuft. Bedingung dafür ist die Umstellung der Wahrheitsquelle auf
>   Stationsmessungen (`hitRate.ts` misst heute gegen einen Modell-Analysen-Konsens).
> - **Die Einschränkung bleibt und wird ausgesprochen:** Ein Rückblick misst auf Daten, die bei
>   der Modellwahl schon sichtbar waren. Er bleibt methodisch ein starker Verdacht, kein
>   Beweis. Deshalb steht in jedem Bericht, worauf er beruht — und der Modellvergleich liefert
>   die prospektive Bestätigung nach.
> - **§4 Fahrplan:** Die MOSMIX-Zeile ändert ihre Bedeutung — sie ist kein Meilenstein mehr,
>   sondern eine Auskunft, die mit dem Archiv aus PV1 von selbst wächst.

---

## 1. Grundregel: As-of-Rekonstruktion

Für jeden Vorhersagezeitpunkt $t_0$ darf ausschließlich eingehen, was zu $t_0$ **real verfügbar**
war:

| Bestandteil | Regel |
|---|---|
| **Modellläufe** | nur Läufe, deren **Publikationszeit ≤ $t_0$** war — nicht deren nominelle Laufzeit. Für die S3-Archive ist die Publikationszeit rekonstruierbar (`LastModified` des Objekts); wo sie fehlt, wird die **gemessene mediane Latenz** je Produkt abgezogen und diese Setzung im Manifest festgehalten |
| **Beobachtungen** | nur Messungen mit Zeitstempel < $t_0$, **und zwar im damaligen Zustand**: ungeprüfte Rohwerte, nicht die später qualitätsgeprüfte Fassung. Das Archiv führt deshalb **zwei Stände** (§3) |
| **Kalibrierungskoeffizienten** | ausschließlich aus Daten **vor $t_0$** geschätzt. Rollierendes Neuschätzen entlang der Zeitachse (**walk-forward**), niemals ein globaler Fit über das ganze Archiv |
| **Klimatologie** | nur aus Jahren vor $t_0$. Eine Klimatologie, die den Testzeitraum enthält, ist Look-ahead |
| **Modell- und Hyperparameterwahl** | vor dem Testzeitraum getroffen und schriftlich fixiert |

**Walk-forward konkret:** Zeitraster (Vorschlag: monatlich). Zum Monatsanfang $m$ werden alle
Koeffizienten neu aus dem Fenster $[m-W, m)$ geschätzt und den ganzen Monat $m$ unverändert
angewandt. $W$ (Trainingsfenster) ist ein Hyperparameter, der **im Validierungsblock** bestimmt
wird, nicht im Test.

---

## 2. Was den Test wertlos macht — und wie wir belegen, dass es nicht passiert ist

Jeder Verifikationslauf gibt am Ende eine Prüfliste aus. Ein Lauf ohne diese Ausgabe zählt nicht.

| Fehler | Automatische Gegenprüfung im Harness |
|---|---|
| **Look-ahead in der Kalibrierung** | Jeder Koeffizientensatz trägt sein Trainingsfenster; der Scorer bricht ab, wenn ein Fenster über $t_0$ hinausreicht |
| **Modell-/Hyperparameterwahl gegen den Testzeitraum** | Der Testzeitraum ist im Manifest festgeschrieben und im Fit-Pfad **hart gesperrt**; ein Fit, der Testdaten liest, wirft |
| **Verifikation gegen Reanalyse nach Training auf Reanalyse** | Wahrheitsquelle ist typisiert (`measured` / `reanalysis`, das Muster existiert schon in `historySource.ts`); ein Lauf mit `reanalysis` als Wahrheit ist **kein Gate**, sondern eine Diagnose und wird so beschriftet |
| **Beobachtungen, die zu $t_0$ noch nicht übermittelt oder ungeprüft waren** | Zwei Stände (§3); Eingabepfad liest ausschließlich den As-of-Stand, Wahrheitspfad ausschließlich den Endstand |
| **Nachträgliches Nachjustieren nach Sicht der Ergebnisse** | Manifest-Hash über Protokoll + Code + Parameter; jede Änderung erzeugt eine **neue** Registrierung mit eigenem Datum. Alte Läufe bleiben im Bericht stehen |
| **Stille Lücken** | Lückenanteil je Bin wird mitberichtet; über einer Schranke gilt der Bin als **nicht ausgewertet**, nicht als „unauffällig" |
| **Abgebrochene Abrufe als „keine Daten"** | `AbortError` wird nie als `absent` gezählt (Lehre aus der Bandbreiten-Linie) |

---

## 3. Zwei Beobachtungsstände

| Stand | Inhalt | Verwendung |
|---|---|---|
| **as-of** | Was zu $t_0$ übermittelt war: DWD POI (24-h-Rollfenster) bzw. CDC `now`/`recent` ungeprüft; GeoSphere-Werte ohne Rücksicht auf spätere Flag-Korrekturen; MeteoSchweiz `_h_now` | **Eingabe** (Beobachtungsanker, Bias-Verlauf, Persistenz) |
| **final** | Qualitätsgeprüft: CDC `historical`, GeoSphere `klima-v2-1h` mit `*_flag`, MeteoSchweiz `_h_historical` | **Wahrheit** |

Der Unterschied ist nicht akademisch: Ein Verfahren, das im Hindcast den geprüften Wert als
Anker bekommt, im Betrieb aber den ungeprüften, ist im Hindcast systematisch besser als in
Wirklichkeit.

**Konsequenz für die Rückwärts-Befüllung:** Der As-of-Stand lässt sich für die Vergangenheit
**nicht** rekonstruieren (die Rollfenster sind weg). Für den Hindcast-Zeitraum vor Beginn der
Eigenarchivierung wird deshalb der Endstand auch als Eingabe verwendet — und dieser
**optimistische Bias muss im Bericht stehen**. Ab Beginn der Eigenarchivierung existieren beide
Stände; die Differenz zwischen „mit as-of" und „mit final" ist selbst eine Messgröße und wird
einmal ausgewiesen, damit die Größenordnung des Bias bekannt ist.

---

## 4. Datenlage — ab welchem Archivstand welcher Vergleich belastbar wird

| Vergleich | Voraussetzung | Verfügbar |
|---|---|---|
| vs. **Klimatologie**, **Persistenz** | Beobachtungsarchiv (rückwirkend vorhanden) | **sofort** |
| vs. **GEFS-Mittel** | S3 `noaa-gefs-pds` (2024-01-01 belegt vorhanden) | **sofort**, ≥ 1,5 Jahre |
| vs. **ECMWF IFS/ENS/AIFS** | S3 `ecmwf-forecasts` (ab 2023-01-18 belegt) | **sofort**, ≥ 3,5 Jahre |
| vs. **heutige buscosun-Engine** | Nachrechnen auf archivierten Eingaben | **sofort** |
| vs. **MOSMIX_S / MOSMIX_L** | **Eigenarchiv** — kein öffentliches Archiv | **erst nach Start von WP 0.2** |
| vs. **ICON-D2 DMO** | Eigenarchiv (opendata hält 8 Läufe) | ebenso |

**Mindestintervall für einen belastbaren MOSMIX-Vergleich: ≥ 12 zusammenhängende Monate**
(alle Jahreszeiten, alle Höhenbänder). Vorher sind Aussagen möglich, aber ausdrücklich
**vorläufig** und mit genanntem Zeitraum, Stationszahl und fehlenden Jahreszeiten zu
kennzeichnen. Ein „besser als MOSMIX" ohne Winter ist keine Aussage über den Winter.

---

## 5. Modellversions-Drift

ICON, IFS und AIFS ändern sich über die Zeit. Ein Hindcast über 3,5 Jahre mischt
Modellgenerationen; ein Vorsprung gegenüber einer alten Referenzversion ist **kein** Vorsprung
gegenüber der heutigen.

**Regeln:**

1. **Versionshistorie mitführen**: je Quelle eine Tabelle (Datum → Version/Zyklus → Bemerkung),
   gepflegt im Archiv-Manifest. Quelle: die Änderungsmitteilungen der Betreiber; **jede
   Zeile trägt ihren Beleg mit Datum**.
   - Die im Auftrag genannte Angabe „AIFS ENS v2 seit 2026-05-12" ist eine **vom Auftraggeber
     gelieferte, in dieser Runde nicht geprüfte Angabe** und in dieser Form zu belegen, bevor
     sie in die Stratifikation eingeht.
2. **Stratifizieren**: Ergebnisse werden je Versionsperiode berichtet, nicht nur gepoolt.
3. **Vorrang der jüngsten Periode**: Für die Auslieferungsentscheidung zählt das Ergebnis der
   **aktuellsten** Version, auch wenn der gepoolte Mittelwert besser aussieht.
4. **Bruch = Blockgrenze**: Ein Versionswechsel ist eine Blockgrenze für den Bootstrap und darf
   nicht innerhalb eines Blocks liegen.

---

## 6. Zweistufiges Protokoll

### Stufe 1 — Hindcast (Vorscreening)

- Zweck: **aussortieren**, nicht belegen. Billig, schnell, viele Varianten.
- Ergebnis ist ein **Verdacht**. Formulierung im Bericht entsprechend („der Hindcast legt nahe",
  nie „das Verfahren ist besser").
- Läuft auf dem S3-Archiv (ECMWF/GEFS) + Beobachtungsarchiv, walk-forward, as-of nach §1.
- Bekannter, zu berichtender Bias: fehlender As-of-Beobachtungsstand vor Archivbeginn (§3).

### Stufe 2 — prospektiver Schattenbetrieb (der eigentliche Beleg)

- Das Verfahren wird **eingefroren**: Commit-Hash + Koeffizienten-Snapshot + Manifest.
- Es läuft **parallel zur Produktion** in Actions, schreibt seine Vorhersagen ins Archiv und
  wird gegen dieselben Referenzen ausgewertet.
- Zeitraum, Stationsauswahl, Metriken und Schwelle sind **vorab** festgelegt (§7).
- **Nur dieses Ergebnis darf nach außen als „besser als …" behauptet werden.**
- Während des Schattenbetriebs wird **nicht** nachjustiert. Wer nachjustiert, startet den
  Zeitraum neu.

**Mindestdauer Schattenbetrieb:** ≥ 6 Monate für einen saisonal eingeschränkten Anspruch,
≥ 12 Monate für einen unbeschränkten. Die Dauer ist vor dem Start festzulegen, nicht nach
Sichtung der ersten Zahlen.

---

## 7. Vorab-Festlegung und Reproduzierbarkeit

**Vor dem ersten Lauf schriftlich fixiert und versioniert:**

1. Auswertungsprotokoll (dieses Dokument + `verifikation.md`), mit Datum und Hash.
2. Stationsauswahl (Liste der IDs; Trainings-/Test-Folds; Höhen-Fold).
3. Zeitraum (Train/Val/Test-Blöcke mit Puffern).
4. Metriken und Stratifikationen.
5. Erfolgsschwelle je Variable × Lead-Bin.

**Ein Kommando, ein Manifest:**

```
npm run verify:pv-score -- --protocol audit/punktvorhersage-14tage/protokoll-vN.json
```

Das Manifest enthält:

| Feld | Inhalt |
|---|---|
| `protocolHash` | Hash über Protokoll + Stationsliste + Zeiträume |
| `codeHash` | Git-Commit der Auswertungskette |
| `paramsHash` | Hash der verwendeten Koeffizienten-Artefakte |
| `dataHashes` | Hash je Archivdatei, die in den Lauf einging |
| `env` | Node-Version, Betriebssystem, Laufzeitdatum |
| `gaps` | Lückenanteil je Bin |
| `checklist` | die Prüfliste aus §2, jeweils bestanden/nicht bestanden |

**Vollständiger Bericht.** Es wird **jeder** Bin berichtet, auch die verlorenen. Ein Bericht,
der nur die Gewinne zeigt, ist ein Verstoß gegen D-04 und macht das Gate ungültig.

---

## 8. Akzeptanz- und Rückfallregel

1. Erfüllt eine Phase ihr Kriterium im retrospektiven Test **nicht**, wird sie **nicht
   ausgeliefert**.
2. Für die betroffenen **Lead-Bins und Variablen** wird auf die Referenz zurückgefallen
   (MOSMIX bzw. DMO bzw. der heutige Blend).
3. **Hybridbetrieb je Bin ist ausdrücklich erwünscht** — besser als ein flächiges, unbelegtes
   Eigenverfahren. Das Produkt sagt in dem Fall, welche Quelle den jeweiligen Zeitraum trägt;
   das Muster dafür existiert bereits (Quellen-Badges im Punkt-Panel).
4. Ein zurückgefallener Bin bleibt in der Auswertung und wird bei jedem Folgelauf erneut
   geprüft. Es gibt keine dauerhaft „erledigten" Verlierer-Bins.

---

## 9. Wiederkehrende Messfallen aus diesem Repo, die hier gelten

Aus den früheren Linien übernommen, weil sie exakt auf diese Arbeit passen:

- **Eine Hochrechnung aus einem beobachteten Fall ist keine Messung** (BW-12: aus „ein Drittel
  der Deploys" wurden beim Auszählen 13 % bzw. 0 %). Publikationslatenzen, Skill-Gewinne und
  Volumina werden **ausgezählt**, nicht geschätzt und dann zitiert.
- **Synthetische Fixtures müssen die echte Datenform tragen** (V-BW-51: eine Fassung war gegen
  erfundene Fixtures grün und gegen die Wirklichkeit für jede Familie `null`).
- **Byte-/Wert-Gleichheitstests brauchen eine Negativkontrolle**, sonst beweisen sie nichts
  (SAT2h).
- **Ein Leistungsanker misst immer auch die Maschine mit** — Actions-Laufzeiten nur innerhalb
  eines Laufs vergleichen oder mit genannter Last.
- **Eine Messsonde, die ihre eigene Quelle drosselt, misst nichts** (BW-13: 45-s-Polling auf
  eine API mit 60 Anfragen/h). Gilt unmittelbar für GeoSphere (240 req/h).
- **Fragen nach zeitlichem Verhalten brauchen nicht immer ein Beobachtungsfenster** — DWD-
  Verzeichnisse, S3-`LastModified` und Actions-Läufe sind rückwirkend lesbar.
- **PowerShell:** `Set-Content -Encoding utf8` kodiert eine BOM-lose UTF-8-Datei doppelt;
  `node … 2>&1 | Out-File` macht aus stderr-Warnungen ErrorRecords und liefert Exit 1 —
  Verifier nie mit `2>&1` starten.
