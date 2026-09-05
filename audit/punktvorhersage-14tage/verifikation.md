# Verifikation — Metriken, Splits, Signifikanz, Erfolg und Misserfolg

> Stand 2026-09-05 · Phase PV0 · Dieses Dokument wird **vor** dem ersten Messlauf eingefroren
> und versioniert (`retro-verifikation.md` §6). Änderungen danach sind Neu-Registrierungen mit
> eigenem Datum, keine Korrekturen.

---

## 1. Was überhaupt behauptet wird — zwei getrennte Ansprüche

Der Auftrag formuliert „besser als MOSMIX". Das sind in Wahrheit **zwei verschiedene Aussagen
mit sehr verschiedener Schwierigkeit**, und sie dürfen nie vermischt werden:

| Anspruch | Testaufbau | Schwierigkeit |
|---|---|---|
| **A — „an der Station besser"** | An einer MOSMIX-Station: unsere Vorhersage gegen die MOSMIX-Vorhersage **derselben** Station, Wahrheit = Messung dieser Station | **hoch.** MOSMIX ist dort ein am Ort statistisch korrigiertes Produkt mit langer Trainingsbasis. Ein Vorsprung muss aus zusätzlicher Information kommen (Multi-Modell, jüngste Beobachtung, Ensemble-Spread), nicht aus besserer Ortskenntnis |
| **B — „abseits der Station besser"** | Testpunkt **ohne** eigene MOSMIX-Station; Referenz = MOSMIX der nächsten Station, höhenkorrigiert interpoliert (der Weg, den jeder Anbieter geht) | **erreichbar.** Hier zählt Geländephysik und Attribut-Generalisierung — genau das, was §4.2 der Mathematik-Spezifikation baut |

Anspruch **B** ist der eigentliche Produktanspruch (Tourenplanung, Eventplanung finden nicht an
Flughäfen statt). Anspruch **A** ist der Härtetest. Beide werden getrennt berichtet.

**Anspruch B wird durch stationsweise Kreuzvalidierung operationalisiert**: eine echte
Beobachtungsstation wird komplett aus dem Training genommen und dient als „Punkt ohne Station".
Das ist der einzige Weg, Anspruch B mit echter Wahrheit zu messen — Punkte, an denen wirklich
nie gemessen wurde, sind per Definition nicht verifizierbar.

---

## 2. Regime-Tabelle — geprüft und korrigiert

| Regime | Lead | Referenz(en) | Korrektur gegenüber dem Vorschlag |
|---|---|---|---|
| **Nowcast** | 0–2 h | Persistenz + Radar-Advektion; **in AT zusätzlich INCA**, in CH rzc-Extrapolation | INCA *ist* der amtliche Nowcast für AT — es wäre unredlich, ihn als Referenz auszulassen. DE: RADOLAN-RV. Die Referenz ist damit **länderabhängig** |
| **Kurzfrist** | 2–6 h | MOSMIX_S **und** Radar-Blend | MOSMIX_S wird stündlich neu gerechnet; die Formulierung „mit Beobachtungen aktualisiert" ist zu prüfen — MOSMIX ist statistisches Post-Processing von NWP an Stationen, keine Assimilation. Als *Referenz* ist es trotzdem stark |
| **Tag 0–2** | 6–48 h | **ICON-D2 DMO (höhenkorrigiert am Punkt) + MOSMIX_S/L** | unverändert. Wichtig: „DMO interpoliert" muss **fair** interpoliert sein — mit derselben Höhenkorrektur wie unser Produkt, sonst schlägt man einen Strohmann |
| **Mittelfrist** | 48–**246 h** | MOSMIX_L (stündlich, gemessen: 247 Schritte bis +246 h) | **240 → 246 h korrigiert** (gemessen 2026-09-05) |
| **Erweitert** | 246–336 h | **ECMWF-ENS-Mittel bzw. GEFS-Mittel, Klimatologie, Persistenz-Anomalie** | kein MOSMIX-Vergleich möglich. Die Referenz ist hier die **kalibrierte Klimatologie** — sie ist bei Tag 12 schwer zu schlagen und der einzige ehrliche Maßstab |
| **durchgehend** | 0–336 h | **Klimatologie** und **Persistenz** (bzw. Persistenz-Anomalie) | Pflicht in jedem Bin. Ein Verfahren, das die Klimatologie bei Tag 12 nicht schlägt, ist dort wertlos |

**Zusätzliche Pflichtreferenz, die im Vorschlag fehlt:** die **heutige buscosun-Punktvorhersage**
(`getPointForecast`, Stand `main`). Ohne sie lässt sich nicht sagen, ob die neue Kette das
Produkt verbessert oder nur verkompliziert. Sie ist der Amtsinhaber.

---

## 3. Zielvariablen und ihre Reihenfolge

| # | Variable | Warum in dieser Reihenfolge |
|---|---|---|
| 1 | **T2m** | höchste Nutzungsfrequenz, beste Datenlage, längster Skill-Horizont, klarste Verifikation. Auch der Ort, an dem Geländephysik am meisten bringt (Kaltluftsee, Inversion) — also der Test des Kernversprechens |
| 2 | **Wind 10 m (Betrag) + Böen** | entscheidungsrelevant für Touren/Event; Böen sind der einzige Parameter mit direktem Sicherheitsbezug. Böen getrennt, weil ihre Verteilung schief und nach unten beschränkt ist |
| 3 | **Niederschlagswahrscheinlichkeit (Schwellen)** | die tatsächlich gestellte Nutzerfrage („muss ich Regenzeug mitnehmen?"). Als Wahrscheinlichkeit früher belastbar als die Menge |
| 4 | **Niederschlagsmenge** | schwierigste Variable: nicht-negativ, Punktmasse bei 0, kleinräumig. Eigene Verteilungsfamilie |
| 5 | **Bewölkung / Sonnenscheindauer** | Fotografie, Astro, Event; schwache Datenlage an vielen Stationen (Bewölkung wird an vielen automatischen Stationen nur abgeleitet) |
| 6 | **Taupunkt / rel. Feuchte** | Komfort, Nebelrisiko, Eingang in die gefühlte Temperatur; leicht zu verifizieren |

Reihenfolge = Reihenfolge des Ausbaus **und** der Gates. Eine Variable wird erst ausgeliefert,
wenn sie ihr eigenes Gate besteht — es gibt kein Bündel.

---

## 4. Metriken

### 4.1 Primär

- **CRPS** je Variable × Lead-Bin, und **CRPSS** gegen die Regime-Referenz:
  $$\mathrm{CRPSS}=1-\frac{\overline{\mathrm{CRPS}}_{\text{buscosun}}}{\overline{\mathrm{CRPS}}_{\text{Referenz}}}$$
  Für deterministische Referenzen (MOSMIX, DMO) ist CRPS = MAE — der Vergleich ist zulässig und
  **benachteiligt die Referenz nicht künstlich**, weil CRPS für eine Punktmasse exakt in den
  absoluten Fehler übergeht. Trotzdem wird zusätzlich MAE gegen MAE berichtet, damit die
  Aussage nicht allein auf dem Verteilungsvorteil ruht (§1.3 der Mathematik-Spezifikation
  zeigt: allein daraus kommen bei Nullskill schon 29,3 %).

### 4.2 Deterministisch

- MAE, RMSE, **Bias** (getrennt, nie im RMSE versteckt) je Variable × Lead × Jahreszeit ×
  Höhenband × Tageszeit.

### 4.3 Niederschlag

- **Brier-Score + BSS** an 0,1 / 1 / 5 / 10 mm (1 h und 6 h akkumuliert).
- **ROC / AUC** je Schwelle.
- **Reliability-Diagramm** + Zerlegung in Reliability/Resolution/Uncertainty.

### 4.4 Kalibrierung (gate-blockierend)

- **PIT-Histogramm** je Variable × Lead-Bin; Abweichung von der Gleichverteilung als
  $\chi^2$- oder Cramér-von-Mises-Statistik.
- **Reliability-Diagramm** (für Wahrscheinlichkeiten), **Rangdiagramm** (für Trajektorien).
- **Spread-Skill-Verhältnis**: $\overline{\sigma} / \mathrm{RMSE}$ je Lead-Bin; Zielwert ~1.

> **Regel:** Ein CRPS-Gewinn bei kaputter Kalibrierung wird **nicht** ausgeliefert. Ein Produkt,
> das falsche Wahrscheinlichkeiten mit gutem Mittelwert zeigt, verletzt D-04.

### 4.5 Kohärenz (ab Phase 4)

- **Variogramm-Score** und **Energy-Score** über den Verlauf eines Tages.
- Fensterbezogene Ereignisse („4 h trocken", „Böe > 20 m/s irgendwann heute") als Brier-Scores —
  das ist die Metrik, die den Kohärenzgewinn sichtbar macht; Rand-CRPS zeigt ihn nicht.

### 4.6 Signifikanz

- **Diebold-Mariano** auf den Score-Differenzen, mit **HAC-Korrektur** (Newey-West,
  Bandbreite $\lfloor 1{,}5\,n^{1/3}\rfloor$ oder datengetrieben) — die Score-Reihen sind
  über die Leads **und** über die Tage autokorreliert.
- **Block-Bootstrap** über ganze **Läufe/Tage** (nicht über Stunden!) für Konfidenzintervalle;
  Blocklänge ≥ 3 Tage (typische Dauer einer Wetterlage), gepaart über beide Verfahren.
- Bei vielen Bins (Variable × Lead × Saison × Höhenband): **Multiplizitätskorrektur**
  (Benjamini-Hochberg auf FDR 5 %). Ohne sie „gewinnt" man bei 200 Bins zufällig in zehn.

---

## 5. Stratifizierung — wo die Wahrheit sich versteckt

Jede Auswertung wird zusätzlich getrennt nach:

- **Jahreszeit** (DJF/MAM/JJA/SON),
- **Höhenband** (< 300 m / 300–800 m / 800–1500 m / > 1500 m),
- **Geländeklasse** (Talboden / Hang / Kamm / Flachland; aus TPI),
- **Tageszeit** (Nacht / Morgen / Tag / Abend — Kaltluftseen und Inversionen sind ein
  Nachtphänomen und verschwinden im Tagesmittel),
- **Wetterlage/Regime** (mindestens: Föhn ja/nein, Inversion ja/nein, Frontdurchgang ja/nein),
- **Extremereignisse separat**: Sturm (Böe > 20 m/s), Starkniederschlag (> 10 mm/h oder
  > 30 mm/24 h), Inversion/Kaltluftsee (Δ zur Bergstation > 5 K), Föhn, Frost/Tauwechsel.

**Regel:** Das Gesamtergebnis wird nie ohne die Stratifikation berichtet. Ein Verfahren, das im
Mittel gewinnt und im Föhnfall verliert, verliert im Produkt genau dann, wenn es zählt.

---

## 6. Splits — die Hygiene, die nicht verhandelbar ist

### 6.1 Zeitlich

- **Train / Validation / Test = zusammenhängende, disjunkte Zeiträume.**
- Test ist ein **nie im Training gesehener, zusammenhängender** Zeitraum von ≥ 12 Monaten
  (alle Jahreszeiten). Kein Shuffle, keine zufällige Aufteilung von Stunden — die würde durch
  Autokorrelation praktisch Trainingsdaten in den Test lecken.
- **Puffer** von ≥ 5 Tagen zwischen den Blöcken (Autokorrelationslänge der Fehler).
- Für den operativen Betrieb: **walk-forward** (rollierendes Neuschätzen), s. `retro-verifikation.md`.

### 6.2 Stationsweise (der Test für Anspruch B)

- $k$-fach Kreuzvalidierung über **Stationen**, wobei die Folds **räumlich geblockt** sind
  (zusammenhängende Regionen), nicht zufällig gezogen — sonst liegt eine Nachbarstation 8 km
  entfernt im Training und der Test misst Interpolation statt Generalisierung.
- Zusätzlich ein **Höhen-Fold**: alle Stationen über 1500 m aus dem Training nehmen und dort
  testen. Das ist der ehrlichste Test der Attribut-Generalisierung — und der, an dem das
  Verfahren am ehesten scheitert.

### 6.3 Verbote

- **Kein Tuning gegen das Testset.** Hyperparameter kommen ausschließlich aus dem
  Validierungsblock.
- **Keine Modellwahl gegen denselben Zeitraum, gegen den anschließend getestet wird.**
- **Keine Verifikation gegen ERA5, wenn auf ERA5 trainiert wurde.** Wahrheit sind
  Stationsmessungen (DWD CDC / GeoSphere `klima-v2-1h` / MeteoSchweiz OGD-SMN).
- **Kein Look-ahead in den Prädiktoren.** Zum Zeitpunkt $t_0$ darf nur einfließen, was zu $t_0$
  publiziert war — inklusive realer Publikationslatenz.

---

## 7. Erfolg und Misserfolg — verbindlich

### 7.1 Erfolgskriterium je Variable und Phase

> **Eine Phase gilt als bestanden, wenn für die betroffene(n) Variable(n) gilt:**
>
> 1. **CRPSS > 0** gegenüber der Regime-Referenz, **signifikant auf dem 5-%-Niveau**
>    (Diebold-Mariano/HAC, gepaarter Block-Bootstrap, FDR-korrigiert),
>    gemittelt über **≥ 12 zusammenhängende Monate** und **≥ 150 DACH-Stationen**;
> 2. **in keinem** Lead-Bin, keiner Jahreszeit, keinem Höhenband und keiner der fünf
>    Extremklassen **signifikant schlechter** als die Referenz;
> 3. **Kalibrierung eingehalten**: PIT-Abweichung unterhalb der vorab festgelegten Schranke,
>    Spread-Skill-Verhältnis in [0,85; 1,20] in jedem Lead-Bin;
> 4. **Betriebsbudget eingehalten**: Artefaktgröße, Client-Payload und Rechenzeit unter den in
>    `implementierungsplan.md` je Phase genannten Schranken.

Die Stationszahl 150 ist eine **Setzung**, die zu belegen ist, sobald die exakte Zahl der
DACH-MOSMIX-Stationen ausgezählt ist (`datenquellen-matrix.md` §7.1). Sie muss so gewählt sein,
dass alle vier Höhenbänder mit ≥ 15 Stationen besetzt sind.

### 7.2 Misserfolg — und was dann passiert

| Fall | Diagnose | Konsequenz |
|---|---|---|
| CRPSS ≤ 0 oder nicht signifikant | Verfahren bringt nichts | **Nicht ausliefern.** Für die betroffenen Bins auf die Referenz zurückfallen (Hybridbetrieb je Bin ist ausdrücklich erlaubt und besser als ein flächiges, unbelegtes Eigenverfahren) |
| CRPSS > 0 im Mittel, aber signifikant schlechter in ≥ 1 Bin | teilweiser Gewinn | Auslieferung **nur** in den gewonnenen Bins; die verlorenen Bins nennen die Referenz |
| Kalibrierung verletzt | falsche Wahrscheinlichkeiten | **Harter Stopp**, unabhängig vom CRPS (D-04) |
| Gate scheitert **wegen Stichprobengröße** | Archiv zu kurz | **STOPP mit der Diagnose „Archiv zu kurz"** — nicht nachjustieren, nicht das Gate lockern. Der Fit berichtet den effektiven Stichprobenumfang je Zelle, damit die Ursache eindeutig ist (Übernahme der bewährten Regel C2 aus `docs/fusionV2-plan.md`) |
| Betriebsbudget verletzt | zu teuer | Phase gilt als nicht bestanden, auch bei perfektem Score |

### 7.3 Abbruchkriterien für die gesamte Linie

- **Nach Phase 1**: Wenn die Online-Bias-Korrektur bei Lead 6–48 h für T2m gegen MOSMIX_S
  **keinen** signifikanten CRPSS-Gewinn zeigt, ist die Grundannahme („Multi-Modell +
  Beobachtungsanker schlägt einzelnes post-processtes NWP") widerlegt. Dann wird die Linie auf
  das eingeschränkte Ziel „**kalibrierte Verteilung statt Punktwert**" reduziert — das ist auch
  ohne Skill-Vorsprung ein Produktgewinn — und der Anspruch „besser als MOSMIX" wird fallen
  gelassen und im Produkt nicht behauptet.
- **Nach Phase 2**: Wenn der Langfrist-Teil (246–336 h) die kalibrierte Klimatologie nicht
  schlägt, wird der Horizont bei 246 h belassen und der 14-Tage-Anspruch gestrichen. Ein
  ehrliches „bis 10 Tage" ist besser als ein unbelegtes „14 Tage".
- **Jederzeit**: Wenn die Lizenzprüfung einer tragenden Quelle negativ ausfällt, ruht die
  betroffene Stufe, bis eine lizenzsichere Alternative belegt ist.

---

## 8. Werkzeug und Reproduzierbarkeit

- **Kein neues Test-Framework** (D-10). Alle Gates sind
  `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-*.mjs`
  und liefern `{checks, passed, failed}` mit Exit ≠ 0 bei Fehlschlag.
- Geplante Harnische:
  - `verify:pv-metrics` — CRPS/Brier/PIT/DM/Bootstrap gegen synthetische Fälle mit
    **analytisch bekanntem** Ergebnis (u. a. der $1/\sqrt2$-Test aus §1.3 der
    Mathematik-Spezifikation) und mit **Negativkontrollen**.
  - `verify:pv-archive` — Schema, Vollständigkeit, As-of-Konsistenz des Archivs.
  - `verify:pv-score` — der eigentliche Verifikationslauf; ein Kommando, ein Manifest
    (Daten-Hashes, Modell-Hash, Umgebung), reproduzierbares Ergebnis.
  - `verify:pv-artifact` — Byte-/Wertidentität zwischen Producer und Client-Sampler
    (Muster: `verify:repack`, 325/325).
- **Negativkontrolle ist Pflicht** (Lehre aus der Satelliten-Linie SAT2h): Jeder
  Gleichheits-/Identitätstest braucht einen Fall, der **fehlschlagen muss**, sonst beweist er
  nichts.
- **Synthetische Fixtures müssen die echte Datenform tragen** (Lehre V-BW-51: eine Fassung war
  gegen erfundene Fixtures grün und gegen die Wirklichkeit für jede Familie `null`).
- **Ein abgebrochener Abruf ist kein Befund** (Lehre V-BW-5x): `AbortError` darf nie als
  „Quelle liefert nichts" gezählt werden — im Archivbau würde das stille Lücken erzeugen.
