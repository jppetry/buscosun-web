# buscosun Prüfstand – Verifikationsroutine für Fusion-Postprocessing (Konzept)

> Abschrift des Claude-Docs <https://claude.ai/code/artifact/c70f165b-12c5-469b-bbd8-7d6618a918da> (Stand 05.10.2026),
> ohne Grafiken. Spätere Korrekturen aus dem Chat sind mit **Korrektur** markiert. Bei Widerspruch gilt
> `audit/pruefstand-plan.md`.

## 1 Kurzfassung

Der Prüfstand ist eine feste Routine: Er rechnet jede Version von buscosun Fusion auf denselben archivierten Eingaben
neu, bewertet sie an Stationen, die das Modell nie gesehen hat, und gibt eine Scorecard gegen Vorgänger, MOSMIX,
Einzelquellen und Klimatologie aus.

1. **Ein eingefrorenes Prüfprotokoll (P1).** Stationen, Wahrheit, Zielgrößen, Vorläufe, Metriken, Referenzen,
   Index-Gewichte und Testverfahren stehen fest. Wer etwas davon ändert, erzeugt P2; dann werden alle registrierten
   Versionen neu gerechnet. Zahlen aus P1 und P2 werden nie verglichen.
2. **Gleiche Eingaben für alle.** Jede Version steht mit Commit, Tabellen-Hashes und Modellkarte im Register. Der
   Prüfstand rechnet sie per Replay auf denselben Prüffällen und legt die Vorhersagen als Konserve ab. n gegen n−1 ist
   ein gepaarter Vergleich, Fall für Fall.
3. **Nur echte Prüfungen.** Zurückgehaltene Stationen sind nie Anker und nie Trainingsdaten. Prüftage liegen nach dem
   Fit-Fenster der Version (prospektiv) oder in gesperrten Hindcast-Blöcken (Tresor).
4. **Eine Skala für alles.** Hauptmaß ist der CRPS aus einem festen Quantilsatz; für eine deterministische Quelle wird er
   zum MAE. Dazu Kalibrierung, Schärfe und für Niederschlag der Brier-Score mit Zerlegung.
5. **Entscheidung nach Regel.** Fusion [n] wird Champion, wenn der Prüfindex signifikant besser ist, keine Kernzelle
   signifikant schlechter wird, die Kalibrierung im Band bleibt und alle harten Gates halten.

Ehrlich vorweg: Das Live-Archiv läuft seit 14.09.2026, mit einem Ausgabezeitpunkt am Tag und ohne Winter. Damit lassen
sich nur große Unterschiede nachweisen. Die Breite kommt aus dem Hindcast (Wahrheit ab 24.05.2023), dessen Eingaben
nachgebaut sind und getrennt ausgewiesen werden.

## 2 Ziel und Prinzipien

| # | Regel | Grund |
|---|---|---|
| R-1 | Alle Versionen auf identischen Prüffällen (Ausgabezeit × Punkt × Vorlauf × Größe); fehlt einer Version ein Fall, fällt er für diesen Vergleich weg | sonst vergleicht man Wetter, nicht Modelle |
| R-2 | Bewertet wird nur außerhalb der Trainingsdaten, in Raum und Zeit | Stationswert-Tabelle, Lernstufe und Anker nutzen dieselben Stationen |
| R-3 | Die Wahrheit ist unabhängig von jeder Vorhersage; QC nur aus Messreihe und Nachbarn | sonst wird das Modell bevorzugt, an dem man filtert |
| R-4 | Nur eigentliche (proper) Bewertungsmaße entscheiden | bei unechten Maßen lohnt Schummeln, z. B. zu schmale Bänder |
| R-5 | Unterteilt wird nur nach Merkmalen, die zur Ausgabezeit feststehen; Extreme über gewichtete Maße | Auswahl nach dem beobachteten Ereignis belohnt Übertreiben (Forecaster’s Dilemma) |
| R-6 | Jede Differenz mit Konfidenzintervall und Nachweisgrenze | drei Wochen Daten tragen keine 1‑%-Aussagen |
| R-7 | Provenienzen nie mischen: Live-Archiv, Hindcast „Lauf“, „Tag 0“, „dyn“ | nachgebaute Eingaben haben andere Fehler |
| R-8 | Ergebnisse adressierbar: Protokoll-, Wahrheits-, Datensatz- und Modell-Hash; gleiche Hashes ⇒ gleiche Zahlen | Vergleiche über Monate brauchen stabile Zahlen |

## 3 Datenbasis

| Quelle | Inhalt | Rolle | Vorbehalt |
|---|---|---|---|
| `buscosun-archiv` | täglicher Slot 23:10 UTC (Schema 3): Cube t1/t2/t3, MOSMIX-L, Nowcast, `hmodel`, `plan`, `live` (mu/q10/q50/q90), `truth.byPoint`; ab 14.09.2026 | Spur P: Betriebseingaben, Betriebsvorhersage, Zweitwahrheit | ein Slot je Tag; Audit-Befunde (Höhen, id ≠ wmo) |
| `buscosun-hindcast` | Slots t1/t2/t3 mit Provenienz „Lauf“, „Tag 0“, „dyn“; Wahrheit 24.05.2023–21.09.2026 | Spur R: Tresor-Blöcke über alle Jahreszeiten | Eingaben nachgebaut; „Lauf“ (ab 17.06.2026) ist am nächsten am echten Cube |
| DWD CDC | 10‑min- und Stundenwerte, `now`/`recent`/`historical`, Qualitätsniveau QN | Wahrheit DE | `recent` hat die Qualitätsprüfung noch nicht abgeschlossen |
| GeoSphere `klima-v2-10min` / `-1h` | geprüfte Stationsdaten | Wahrheit AT | Korrekturen binnen 1–3 Arbeitstagen; `tawes-v1-10min` sind Rohdaten |
| MeteoSwiss A1 / A2 | SwissMetNet und Niederschlagsstationen, 10‑min-Werte | Wahrheit CH | Quellenangabe „Source: MeteoSwiss“ Pflicht |
| RADOLAN RW / RADKLIM, INCA, CombiPrecip | flächiger Niederschlag | nur getrennte Zweitwahrheit | Radar am Punkt ist keine Messung am Punkt |

**Reifezeit:** Ein Prüffall zählt für die Abnahme erst, wenn seine Wahrheit mindestens 7 Tage alt ist (GeoSphere-
Korrekturfrist mit Reserve). **Wahrheitsstand:** Die Wahrheit wird als W1, W2 … eingefroren; liefert der DWD
`historical`-Werte nach, entsteht ein neuer Stand und alle Versionen werden darauf neu bewertet.

**Korrektur – welche Stationen:** Wahrheit sind nur die amtlichen Bodenmessnetze: DWD (rund 200 hauptamtliche und
knapp 300 weitere automatische Wetterstationen, knapp 500 automatische Niederschlagsstationen), GeoSphere (rund 260),
MeteoSwiss (rund 160 SwissMetNet, rund 100 Niederschlagsstationen). Nicht Wahrheit: Radar, MOSMIX, private Netze,
SWIS-Straßenwetter, Ländernetze; Archivpunkte in NL/DK gehören nicht zu P1.

**Korrektur – Archiv als Flaschenhals:** Prüfbar ist eine Station nur, wenn das Archiv die Vorhersage-Eingaben für ihren
Ort gesichert hat. Messwerte lassen sich jahrelang nachladen, Cube-Zellen nicht. Speichert das Archiv den Cube nur an
seiner Punktliste, zählen neue Stationen erst ab dem Tag, an dem es sie mitschreibt (Plan D-PS-2, E-PS-11).

Lücken: kein Winter im Live-Archiv; Schneefallgrenze ohne Bodenwahrheit; Bewölkung, Sicht und Niederschlagsart nur an
einem Teil der Stationen.

## 4 Prüfnetz und Wahrheit

| Rolle | Darf das Modell sie nutzen? | Was die Zahl misst | Gewicht |
|---|---|---|---|
| A Anker | ja: Fit, Stationswert-Tabelle, Lernstufe, Live-Anker | Vorhersage am Stationsort mit Messung bis zur Ausgabezeit | Diagnose; wächst der Abstand A − B: Überanpassung |
| B Prüfstation | nein, weder im Fit noch im Replay als Anker | Vorhersage an einem beliebigen Punkt | entscheidet |
| B-Paar | Teilmenge von B: Tal-/Berg-Paare unter 15 km | ob die Höhendifferenz getroffen wird | Sonderprüfung |

- **Auswahl:** geschichtete Zufallsauswahl mit festem Seed (Land × Geländeklasse × Höhenstufe); je Prüfstation der
  Abstand zum nächsten Anker (unter 5 km, 5–15 km, über 15 km) als Auswertungsachse.
- **Zielort:** Länge, Breite und gemessene Stationshöhe aus eingefrorenen Metadaten, nie DEM-Höhe; Verlegung ⇒ neue
  Station.
- **MOSMIX an Prüfstationen** ist auf deren Messungen trainiert; als Referenz fair, im Bericht ausgewiesen.
- **QC der Wahrheit:** (1) formal: Wertebereich, Einheit, Zeitstempel (UTC, Intervallende), Dubletten, Platzhalter;
  (2) zeitlich: Sprünge, hängende Sensoren; (3) räumlich: Nachbarvergleich mit Höhenbereinigung, nur grobe Ausreißer;
  (4) Quellkennzeichen; (5) Repräsentanz: Wind nur bei bekannter Messhöhe, Gipfelstationen bei Wind getrennt. Jeder
  verworfene Wert mit Grund protokolliert; Stationen mit hoher Verwerfungsquote zur Sichtung.

## 5 Prüffälle und Zielgrößen

- Prüffall = (Ausgabezeit, Station, Gültigkeitszeit, Größe); Vorlauf ab Ausgabezeit.
- Spur P hat einen Slot (23:10 UTC): Vorlauf und Tageszeit sind gekoppelt. Empfehlung: drei weitere Slots (05:10,
  11:10, 17:10 UTC). Spur R nimmt vier feste Slots je Tag aus „Lauf“.
- Vorlauf-Fenster: 0–6, 6–24, 24–48, 48–120, 120–240, 240–336 h; Nahtbänder 48/51, 120/126, 180 h.
- Raster: stündlich bis 48 h, dreistündlich bis 120 h, sechsstündlich bis 336 h; Stundeninterpolation t2/t3 als
  Diagnose.

| Größe | Wahrheit | Zeitbezug | Einheit | Zelle |
|---|---|---|---|---|
| Temperatur 2 m | 10‑min-Wert zum Termin | Termin | °C | Kern |
| Taupunkt | aus T und rel. Feuchte | Termin | °C | Kern |
| Wind 10 m | 10‑min-Mittel, nur bei bekannter Messhöhe | Termin | m/s | Kern |
| Böe | Maximum im Intervall vor dem Termin | 1 / 3 / 6 h | m/s | Kern |
| Niederschlag | Summe im Intervall, dazu Tagessumme | 1 / 3 / 6 h, 24 h | mm | Kern |
| Windrichtung | Winkelfehler, nur bei messbarem Wind | Termin | ° | Neben |
| Bewölkung gesamt | Synop oder Ceilometer | Termin | Achtel | Neben |
| Globalstrahlung | Mittel im Intervall | 1 / 3 / 6 h | W/m² | Neben |
| Luftdruck (Meeresniveau) | Stationswert reduziert | Termin | hPa | Neben |
| Sichtweite | Klassen, z. B. Nebel unter 1 km | Termin | Klasse | Neben |
| Niederschlagsart | aus dem Wetterschlüssel | Intervall | Klasse | Neben |
| Schneefallgrenze | keine Bodenwahrheit | – | m | nicht bewertet |

Jede Version liefert ihre Werte über einen Adapter in genau diesen Definitionen; Größen mit unklarer Einheit lehnt der
Prüfstand ab (heute `precip` im Cube, offen seit D-NP0-9).

## 6 Zwei Spuren und Leck-Schutz

| | Spur P – prospektiv | Spur R – Hindcast-Tresor |
|---|---|---|
| Prüftage | Archivtage nach dem Freeze der Version | gesperrte Blöcke im Hindcast |
| Eingaben | echte Betriebseingaben | nachgebaut, je Provenienz getrennt |
| Stärke | echt außerhalb der Stichprobe | Jahreszeiten, Extremlagen |
| Schwäche | klein, kein Winter, ein Slot je Tag | Eingaben weichen vom Cube ab |

- **Freeze:** letzter Tag, den Fit, Tabellen oder Entwicklung gesehen haben (Modellkarte). Für n gegen n−1 zählt das
  gemeinsame Fenster nach dem späteren Freeze. **Korrektur:** Ein nächtlicher Schattenlauf ist unnötig; das Archiv ist
  append-only, der Replay rechnet jede Version jederzeit nachträglich auf allen Tagen nach ihrem Freeze.
- **Tresor:** Maske über Kalendertage (`tresor.json`), Empfehlung jede vierte Woche über alle Monate, Sicherheitsabstand
  aus der gemessenen Autokorrelation (Startwert 3 Tage); Sperre für Ausgabe- **und** Gültigkeitszeit.
- **Entwicklungsleck:** Auch Hinschauen ist Training. Schnelltest und Volltest nur auf der Entwicklungsmenge; Tresor und
  Spur P öffnet nur die Abnahme, jede Öffnung protokolliert.
- **Bestandsversionen** (Fusion 8 und älter) wurden vor dem Tresor gefittet: R-Zahlen „kontaminiert“, bis unter
  Tresor-Maske nachgefittet; bis dahin entscheidet Spur P.
- **Anker im Replay:** B-Stationen werden aus den Anker-Eingaben entfernt. **Korrektur:** Ankerwerte so, wie sie zur
  Ausgabezeit vorlagen, nicht nachträglich korrigiert.

## 7 Metriken

CRPS_Q = (2/K) · Σ_k QS_τk(q_k, y), mit QS_τ(q, y) = (1{y < q} − τ)(q − y).

Eigentlich für den Quantilsatz; bei symmetrischen Stufen für einen Einzelwert gleich dem MAE; mit feinem Quantilsatz
Näherung des CRPS (Gneiting & Ranjan 2011); mit {0,1; 0,5; 0,9} proportional zum Intervall-Score mit 80‑%-Band
(Bracher et al. 2021).

| Gruppe | Maß | Rolle |
|---|---|---|
| Gesamtgüte | CRPS_Q je Größe | entscheidet |
| Mitte | Bias, MAE des Medians, RMSE des Mittels | Diagnose |
| Kalibrierung | Abdeckung q10–q90 (Soll 80 %), Anteile unter q10 / über q90 (je 10 %), PIT bei voller Verteilung, Spread-Skill | Gate G3 |
| Schärfe | mittlere Breite q90 − q10, nur zusammen mit Kalibrierung | Diagnose |
| Niederschlag Ereignis | Brier je Schwelle mit Zerlegung (Zuverlässigkeit, Auflösung, Unsicherheit), CORP-Diagramm | entscheidet (Schwelle „nass“) |
| Niederschlag Menge | CRPS_Q inklusive Nullen | entscheidet |
| Extreme | twCRPS (T, Wind, Böe, Niederschlag), SEDI für seltene Ja/Nein-Ereignisse | Diagnose |
| Kategorien | RPS (Sicht, Bewölkungsklassen, Niederschlagsart) | Nebenzelle |
| Windrichtung | mittlerer Winkelfehler | Nebenzelle |

- Schwelle „nass“ wie im heutigen Scorer (0,1 mm/h); höhere Schwellen aus der Klimatologie der Prüfstationen.
- Aggregation: erst je Tag, dann über Tage; Skill immer als 1 − ΣS_Modell / ΣS_Referenz auf identischen Fällen.

## 8 Referenzen und Skill

CRPSS = 1 − CRPS_n / CRPS_ref (positiv = besser).

| Referenz | Als Vorhersage | Wofür |
|---|---|---|
| Klimatologie | empirische Quantile je Station × Kalendertag (gleitendes Fenster) × Stunde, nur Trainingsjahre | Untergrenze; immer lokal (Hamill & Juras 2006) |
| Persistenz | letzter Messwert zur Ausgabezeit, ab 24 h Vortag gleiche Stunde; nur A | Kurzfrist-Untergrenze |
| Rohe Einzelquellen | nächste Zelle ohne Höhenkorrektur (CRPS = MAE) | Mehrwert gegenüber dem Modell |
| Einzelquellen + 0,65 K/100 m | mit fester Höhenkorrektur, T und Taupunkt | Mehrwert des Downscalings über die Faustregel |
| MOSMIX-L | Einzelwert; Niederschlag mit MOSMIX-Wahrscheinlichkeiten | stärkste offene Konkurrenz |
| Naive Fusion | gleichgewichtetes Mittel, σ aus Trainingsresiduen | lohnt die Gewichtung? |
| Vorgänger | Champion, n−1, n−2 … per Replay | ist n stärker geworden? |

Produktaussage „genauer als jede Einzelquelle“ je Zelle gegen die beste Einzelquelle dieser Zelle (inkl. MOSMIX).
`live`-Werte als eigene Zeile an A-Stationen (was Nutzer sahen; Replay-Probe).

## 9 Aufschlüsselung und Sonderprüfungen

Achsen der Scorecard: Größe × Vorlauf-Fenster × Land. Filter (zur Ausgabezeit bekannt): Geländeklasse, Höhendifferenz
Station minus Modellorographie, Abstand zum nächsten Anker, Tag/Nacht, Jahreszeit, Stufe, Provenienz; Lagen nur aus
Messungen zur Ausgabezeit (Inversion aus Tal-Berg-Paaren, Föhn aus Druckdifferenz).

| Sonderprüfung | Maß | Warum |
|---|---|---|
| Höhenpaare | Fehler der vorhergesagten Differenz ΔT = T_Tal − T_Berg (und ΔTd) an B-Paaren, nach Inversion getrennt; gegen rohe Zelle (ΔT ≈ 0) und Faustregel | direkter Beleg für den Mehrwert des Downscalings |
| Nahtstellen 48/51, 120/126, 180 h | Sprung über die Naht minus gemessene Änderung, gegen Nachbarschritte; CRPS im Nahtband | harte Stufenwechsel |
| Sprunghaftigkeit | mittlere Revision derselben Gültigkeitszeit zwischen Ausgaben (Zsoter et al. 2009); braucht > 1 Slot/Tag | Vertrauen der Nutzer |
| Stundeninterpolation t2/t3 | CRPS auf Zwischenstunden | lineares Kappen der Extreme |
| Extreme | twCRPS über klimatologischen Schwellen | ohne Ergebnisfilter |

## 10 Signifikanz und Stichprobe

1. Einheit ist der Tag: d_t = S_n(t) − S_ref(t) je Zelle, gemittelt über Stationen und Termine des Tages.
2. Gepaarter t-Test mit Inflationsfaktor k aus AR(2) (Geer 2016: AR(1) zu klein, bei kleinen Stichproben unzuverlässig);
   Block-Bootstrap über Tage für kleine n; welches ab welcher Tageszahl, legt der A/A-Test fest.
3. Mehrfachtests: zwei Marken (roh 95 %, Benjamini-Hochberg über die Kernzellen); Gates nutzen nur die korrigierte.
4. Nachweisgrenze je Zelle: MDE ≈ (z_{1−α/2} + z_{0,8}) · k · s_d / √n, n_eff = n / k². Bei GraphCast lag k je nach
   Größe und Vorlauf zwischen 1,21 und 6,75; viele nützliche Änderungen bewegen Scores um weniger als 0,5 % (Geer).
   Nicht nachweisbare Unterschiede heißen „nicht nachweisbar“.

## 11 Bewertungsregel

I = Σ_c w_c · CRPSS_c über Kernzellen, Σ w_c = 1. Fortschrittsindex gegen den Champion (entscheidet), Güteindex gegen die
lokale Klimatologie (Rangliste). Gewichte sind eine Produktentscheidung.

| Gate | Bedingung | Bei Rot |
|---|---|---|
| G1 Fortschritt | Fortschrittsindex in Spur P > 0, einseitig signifikant; Spur R (nicht kontaminiert) nicht signifikant negativ | „nicht nachweisbar“, Wiedervorlage |
| G2 Kein Rückschritt | keine Kernzelle mehrfachkorrigiert signifikant schlechter als der Champion um mehr als δ | abgelehnt |
| G3 Kalibrierung | Abdeckung q10–q90 im Binomial-Vertrauensband um 80 % (aus n_eff) und nicht signifikant weiter weg als beim Champion | abgelehnt |
| G4 Technik | Determinismus; Physik (q10 ≤ q50 ≤ q90, Td ≤ T, Böe ≥ Wind, Niederschlag ≥ 0, rel. Feuchte ≤ 100 %); Vollständigkeit nicht schlechter; Punktabfrage < 300 ms; Leck-Prüfung | abgelehnt |

Warnung ohne Gate: Skill-Gewinn an A deutlich größer als an B ⇒ „Verdacht Überanpassung“. Ergebnisse: Champion /
Kandidat / abgelehnt.

## 12 Architektur

Fünf Stufen mit eigenem Speicher: (1) Quellen: Archiv, Hindcast, Stationsmessungen → (2) Prüffall-Bauer (Fälle nach P1,
Eingaben je Fall, B-Stationen maskiert) und Wahrheitstabelle W1 (QC, Reifezeit) → (3) Modellregister, Replay-Runner
(`git worktree` je Version, Adapter Fall → Quantile), Vorhersage-Konserven (einmal je Version × Fall, auch Referenzen)
→ (4) Scorer (Tagesmittel je Zelle), Statistik, Gates → (5) Bericht + `scores.json`, Rangliste (nur Abnahme),
Selbstprüfung als Gegenprobe.

```ts
interface FusionAdapter {
  id: string;            // 'fusion-9'
  commit: string;        // Git-SHA in buscosun-web
  tablesHash: string;    // fusion.client.json, precip-cal.client.json …
  predict(fall: Pruefeingabe): Promise<Quantilblock>; // Quantilsatz aus P1, Einheiten aus §5
}
```

| Modus | Daten | Was läuft | Schreibt |
|---|---|---|---|
| Schnelltest | geschichtete Teilmenge der Entwicklungsmenge | Replay, Scorer, Statistik; keine Gates | nur Konsole |
| Volltest | ganze Entwicklungsmenge | alles außer Rangliste | Bericht |
| Abnahme | Spur P nach Freeze + Tresor | Selbstprüfung zuerst, dann alles | Bericht, Rangliste, Zugriffsprotokoll |
| Vergleich (**Korrektur**, neu) | größte gemeinsame saubere Menge mehrerer Versionen | Güteindex, Scorecards, paarweise Differenzen | Vergleichsbericht, keine Entscheidung |

Fälle als Spaltenblöcke (`Float32Array`), Tage auf `worker_threads`, Konserven nach (Modell-Hash, Fall-Hash, Protokoll)
adressiert, inkrementell je Archivtag. **Korrektur:** Alles läuft lokal; der Hindcast liegt nur lokal, und ein
Actions-Schattenlauf ist unnötig.

## 13 Bericht

Erste Zeile: Urteil in einem Satz. Danach: (1) Kopf mit Hashes und Gate-Ampel; (2) Scorecard Größe × Fenster je Land,
relative CRPS-Änderung, Signifikanz-Marken, Nachweisgrenze; (3) Rangliste mit Güteindex und Intervall; (4)
Produktaussage je Zelle; (5) Kalibrierung; (6) Sonderprüfungen; (7) Karte CRPSS je Prüfstation; (8) die 20 größten
Verluste gegen den Champion mit Eingaben und Herkunft; (9) `scores.json` mit allen Zellen und Tagesreihen. Ablage
`audit/pruefstand/berichte/<version>/<datum>/`; Fehler zusätzlich in °C, m/s, mm.

## 14 Den Prüfstand selbst prüfen

| Prüfung | Erwartung |
|---|---|
| Replay-Treue: Fusion 8 per Replay gegen gespeicherte `live`-Werte | gleich bis auf Rundung |
| Referenzwerte: Maße gegen Sollwerte aus dem Python-Paket `scores` (nur offline erzeugt) | Abweichung < 1e‑9 |
| Negativkontrollen: Wahrheit als Version ⇒ CRPS 0; Klimatologie ⇒ Güteindex 0; halbierte Bänder ⇒ G3 rot; Rauschen ⇒ G2 rot; Leck-Modell ⇒ Überanpassungs-Warnung | jede schlägt an |
| A/A-Test: Champion gegen Bootstrap-Fit von sich selbst, viele Wiederholungen | Anteil „signifikanter“ Zellen = nominale Irrtumsrate |
| Determinismus | bytegleiche `scores.json` |
| Wahrheits-Rundlauf gegen Originaldateien und `truth.byPoint` | Abweichungen erklärt |

## 15 Entscheidungen

Siehe Plan §9 (E-PS-1…11 mit Empfehlungen und Spalte für Jans Entscheidung).

## 16 Grenzen und Risiken

- Neue Quellen ohne Archiv: Nimmt Fusion [n] eine Quelle auf, die das Archiv nicht mitschreibt, ist n rückwirkend nicht
  fair rechenbar; das Archiv schreibt neue Quellen ab Integrationsbeginn mit.
- Quellwechsel mitten in Spur P (ICON-EPS-Gitter 06.10.2026, IFS-Zyklen): n gegen n−1 bleibt fair, absolute Trends
  nicht; Ereignismarken im Bericht.
- Spur R lebt zum Teil von Open-Meteo-Nachbauten (frei nur nicht-kommerziell).
- Messfehler und Repräsentanz begrenzen, was interpretierbar ist.
- Goodhart: breite Kernzellen, G2 über alle Kernzellen, Nebenzellen sichtbar.
- Schneefallgrenze, Sicht, Bewölkung, Niederschlagsart schwach belegt.
- **Korrektur:** Alte Versionen (5e, 6, 7) sind nur prüfbar, wenn Commit, Tabellen und lesbare Eingaben erhalten sind;
  Tabellen, die nur in `buscosun-data` lagen, sind vermutlich verloren. Treue lässt sich für sie nicht gegen `live`
  prüfen.

## 17 Phasenplan

PS-0 Diagnose → G-PS0 (Jan entscheidet) → PS-1 Fundament → G-PS1 (Referenzwerte, Wahrheits-Rundlauf) → PS-2 Replay →
G-PS2 (Replay-Treue; kritisch) → PS-3 Statistik + Bericht → G-PS3 (A/A-Test, Negativkontrollen) → PS-4 Befehl → G-PS4
(erste Abnahme). Details im Plan.

## 18 Quellen

- DWD CDC: <https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/hourly/precipitation/BESCHREIBUNG_obsgermany_climate_hourly_precipitation_de.pdf>
- GeoSphere: <https://data.hub.geosphere.at/en/dataset/klima-v2-10min> · <https://data.hub.geosphere.at/en/dataset/tawes-v1-10min>
- MeteoSwiss: <https://opendatadocs.meteoswiss.ch/a-data-groundbased/a1-automatic-weather-stations> · <https://opendatadocs.meteoswiss.ch/a-data-groundbased/a2-automatic-precipitation-stations>
- Gneiting & Raftery 2007 <https://doi.org/10.1198/016214506000001437> · Gneiting, Balabdaoui & Raftery 2007 <https://doi.org/10.1111/j.1467-9868.2007.00587.x>
- Gneiting & Ranjan 2011 <https://doi.org/10.1198/jbes.2010.08110> · Bracher et al. 2021 <https://doi.org/10.1371/journal.pcbi.1008618>
- Dimitriadis, Gneiting & Jordan 2021 <https://doi.org/10.1073/pnas.2016191118> · Ferro & Stephenson 2011 <https://doi.org/10.1175/WAF-D-10-05030.1>
- Lerch et al. 2017 <https://doi.org/10.1214/16-STS588> · Hamill & Juras 2006 <https://doi.org/10.1256/qj.06.25> · Zsoter et al. 2009 <https://doi.org/10.1175/2009MWR2960.1>
- Geer 2016 <https://www.ecmwf.int/en/elibrary/78783-significance-changes-medium-range-forecast-scores> · Lam et al. 2023 <https://arxiv.org/abs/2212.12794>
- Diebold & Mariano 1995 <https://doi.org/10.1080/07350015.1995.10524599> · Benjamini & Hochberg 1995 <https://doi.org/10.1111/j.2517-6161.1995.tb02031.x>
- Glahn et al. 2009 <https://doi.org/10.1175/2008WAF2007080.1> · Claeskens et al. 2016 <https://doi.org/10.1016/j.ijforecast.2015.12.005>
- `scores` (Leeuwenburg et al. 2024) <https://doi.org/10.21105/joss.06889> · <https://scores.readthedocs.io/en/latest/api.html>
