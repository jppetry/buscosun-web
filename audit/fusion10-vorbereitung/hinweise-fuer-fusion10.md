# Hinweise für buscosun Fusion 10 — aus der Sitzung vom 07.10.2026

> **Status: Hinweise, keine Vorgabe.** Gesammelt in der Cowork-Sitzung vom 07.10.2026 (Bewertung von Fusion 9,
> Datenrecherche, Archivanalyse). Jeder Punkt nennt den Befund mit Beleg, eine Idee, womit er sich messen lässt, und
> seine Fallen. Wer am Code oder an den Daten etwas anderes findet, folgt dem Befund, nicht diesem Papier.
> Belege: `fusion9-bewertung.md`, `kennzahlen-fusion9.csv`, `archiv-schema5-stationsdichte.md`, `datenquellen-historisch.md`.
>
> **Tresor-Kenntnis:** Die Spur-R-Ergebnisse von Fusion 9 wurden am 05.10. geöffnet und stehen in diesem Material
> (Zeilen `spurR` der CSV, Diagramm 1 der Bewertung). Für die Entwicklung von Fusion 10 nur als Kontext — Kandidaten auf
> Belege der Entwicklungsmenge stützen; die Belege unten nennen deshalb zuerst die Entwicklungsmenge.

## 0. Was im Prüfstand wo zählt

| Menge | Enthält | Misst sauber | Misst nicht |
|---|---|---|---|
| Spur R (Tresor, 70 Ausgaben 2024-04-08 … 2025-08-04) | Cube aus dem Hindcast, Fenster 0–6 h („Tag 0“) und ab 51 h, kein Stationsprodukt, kein Nowcast, keine Messung | Langfrist, Klimatologie-Mischung, Kalibrierung, Gelände/Höhe im Cube-Pfad | Anker, Stationswert, Radar, 6–48 h |
| Entwicklungsmenge (Archiv bis Freeze) | alles, alle sechs Fenster, MOSMIX-L | Hinweise für alles, auch Anker/Stationswert/Radar und Rolle B | nichts sauber: der Stack-Fit (14.–28.09.) liegt darin |
| Spur P (Archiv nach Freeze) | reife Wahrheit ab 7 Tagen nach dem Tag | später das eigentliche Urteil (G1 braucht ≥ 4 Tage) | am Freeze-Tag: nichts (leer) |

**Kernzellen** (gehen in den Fortschrittsindex ein): Temperatur, Taupunkt, Wind, Böe bis 48 h, Niederschlagsmenge,
„nass“. **Nebenzellen:** Bewölkung, Windrichtung, Böe nach 48 h (`scripts/pruefstand/protokoll/p1/protokoll.json`).
Verluste bei Böe und Bewölkung in der Langfrist sind ein Produktthema, bewegen den Index aber nicht.

## 1. Schon gebaut, Voreinstellung aus

| Schalter | Wo | Befund | Hinweis |
|---|---|---|---|
| Klimagitter 1991–2020 als Temperatur-Prior | AX-9, `CubeIo.climaGrid` (`?cg=1`), `climaTrend` | **bewegt in der Stufe `fs` 0 von 72 Zellen (V-AX-19, `audit/fusion-ausbau.md` §6i)**; der Prior wirkt nur noch im Schwanz | nicht einschalten; Gewinn nur über die Anomalie-Interpolation erreichbar |
| Ensemble-Mittel im Cube | AX-7, Schema 6, Client-Option `ensMember` | Ebenen `t2m/u10/v10/precip_ens` im Archiv seit Slot 30.09.; σ = 1,5·σ_ens (Setzung) | prüfen, ob die Hindcast-Slots von Spur R die Ensembledaten tragen |
| MOSMIX-S als Stationsprodukt | AX-8, `stationSource` (`?st=s`) | stündlich aktualisiert, 0–24 h | wirkt nur auf Anker/Stationswert → nur Entwicklungsmenge |
| INCA-Analyse als Anker in AT | AX-10, `CubeIo.incaAnchor` (`?inca=1`), Gewicht 0,6 (Setzung) | gebaut, nie gemessen | nur Entwicklungsmenge; AT ist bei Rolle B schwach |
| Klimatologie-Schritt | `priorShrink` (seit Fusion 6 `false`) | Langfrist schlechter als Klimatologie (2.1) | einfachster Test; besser je Vorlauf gelernt |

Vorher klären: welche Optionen `FuseCubeOptions` sind (über das Register an den Replay) und welche Leser-/`CubeIo`-
Optionen, die Daten im Slot brauchen (`scripts/pruefstand/lib/replay.mjs`, `src/pruefstand/adapter.ts`).

## 2. Langfrist

### 2.1 Mischung mit der Klimatologie ab 48 h
- **Befund (Entwicklungsmenge, Rolle B, CRPS-Skill gegen die Stationsklimatologie):** Wind +5,8 / −17,2 / −53,6 %
  (48–120 / 120–240 / 240–336 h), Temperatur +46,7 / +25,8 / +9,6 %, Taupunkt +47,9 / +26,3 / +0,3 %; Böe und Bewölkung
  ab 120 h −11 bis −18 % (Nebenzellen). `audit/fusion-lernphase.md` V-FL-23/24: die Klimatologie fehlt als Prädiktor;
  246–336 h schlägt sie alles. Spur R zeigt dasselbe Muster (Kontext).
- **Idee:** μ = w(Vorlauf, Größe) · Fusion + (1 − w) · Klimatologie (Stunde × Jahrestag), σ entsprechend; w per CRPS aus
  dem Hindcast außerhalb des Tresors gelernt, zur Klimatologie hin regularisiert.
- **Messen:** Kernzellen Wind, Temperatur, Taupunkt ab 48 h — Entwicklungsmenge beim Screening, Spur R in der Abnahme.
- **Falle:** Die Klimatologie selbst darf den Tresor nicht gesehen haben (siehe 6).

### 2.2 Ensemble-Mittel in t3
- **Befund:** t3 mittelt deterministische Läufe; ab 180 h fallen ICON und AICON weg; WeatherBench 2: nach 3–6 Tagen ist
  das Ensemblemittel besser (`fusion-verbesserungen-2026-09-29.md` #3, Expertenbericht §5 Rang 4).
- **Idee:** IFS-ENS/AIFS-ENS-Mittel als Zentralwert, Einzelläufe mit dem Vorlauf abwerten.
- **Falle:** Ob der Hindcast von Spur R die Member trägt, ist ungeprüft; sonst nur auf der Entwicklungsmenge sichtbar.

### 2.3 Nähte und Böen-Bias
- **Befund:** Naht 180 h in der Entwicklungsmenge 3,09 K (davor 1,32, danach 1,65). Böe ab 120 h mit deutlich negativem
  Bias (der Cube mischt dort Stundenmaximum von ICON und Schrittmaximum von ECMWF; Böe nach 48 h ist Nebenzelle).
- **Idee:** Gewichtsrampen über die Stufengrenzen (IMPROVER `ChooseWeightsLinear`); Böen-Bias je Vorlauf und Quelle.

## 3. Kalibrierung

- **Befund (Entwicklungsmenge, Abdeckung q10–q90, Soll 80 %):** Wind 120–336 h 68–74 % (zu schmal); Böe 0–48 h 87–90 %
  und Niederschlagsmenge 91–98 % (zu breit); Temperatur 120–336 h 63–67 % mit Bias −1,69 K bei 240–336 h (Spur R zeigt
  das nicht — nicht überreagieren); Bewölkungsband ab 48 h 86–99 Prozentpunkte breit.
- **Idee:** σ-Skala je Größe × Fenster per CRPS-Minimum (EMOS: σ² = c + d·S²); Bewölkung als zweigipflige bzw.
  Klassenverteilung statt Normal.
- **Falle:** G3 zählt nur Verschlechterungen gegen den Champion; die Abdeckung direkt berichten.

## 4. Downscaling ohne Station — größter Produkthebel, schwer sauber zu messen

- **Befund (Entwicklungsmenge, Rolle B, MAE des Medians):** Temperatur 0–6 h 1,49 K gegen nächste Rohzelle 1,45 K und
  MOSMIX-L an der Station 0,85 K; 6–24 h 1,19 gegen Rohzelle + Lapse 1,18 K; erst ab 24 h ~6 % vor dem besten Rohwert.
  Schweiz 0–6 h 1,86 gegen Rohzelle 1,87 K. Rolle A (270 andere Stationen mit eigener Messung): 0,72 K. Das Fenster
  0–6 h ist immer Nacht.
- **Vermutung (prüfen):** Anker und Stationswert der nächsten Station ziehen den Punkt in der Nacht in die falsche
  Richtung, wenn die Nachbarstation nicht repräsentativ ist (Höhe, Mulde, Kaltluft). Nächster Nachbar eines
  Katalogpunkts im Median 21,6 km (mit Schema-5-Stationen 13,8 km), in der Schweiz im Median 443 m höher/tiefer.
- **Ideen:** Anker- und Stationswert-Gewicht nach Abstand UND Höhen-/Geländeähnlichkeit dämpfen (wie Fusion 7 beim
  Wind) oder auf den Cube zurückfallen; Nacht-/Kaltluftterm (TPI, Sky-View, Inversionsstärke aus dem Modellprofil);
  später gridded MOS aus den Residuen vieler Stationen (BCDG, `fusion-verbesserungen-2026-09-29.md` #6).
- **Messen:** Entwicklungsmenge, Rolle B, 0–48 h, je Land (CH zuerst); Gegenprobe Rolle A. Die Schema-5-Stationen
  eignen sich erst nach Wochen zum Fitten.

## 5. Daten — nur wenn Zeit bleibt

- Längere Stationsklimatologie aus CDC-Stunden-/10-min-Reihen, GeoSphere klima-v2, SwissMetNet (heute 1 217 Tage);
  nur Zeiträume, die vor dem 18.03.2024 enden oder den Tresor auslassen.
- HOSTRADA, ICON-DREAM-EU, RADKLIM: zu groß für eine 4-h-Sitzung; höchstens Machbarkeitsprobe und Plan.
- Fristen: INCA-v1 endet Ende Dezember 2026 (Archiv sichern); CombiPrecip ist offen nur 14 Tage (ab jetzt mitschreiben).

## 6. Mechanik des Prüfstands — Fallen (am Code geprüft)

- **Registrierung:** `run.mjs --registriere=fusion-10 --freeze=YYYY-MM-DD` verlangt `FUSION_CURRENT === 10` im
  committeten Code und ein sauberes `src/` (registerNew). Ein Eintrag in `FUSION_RELEASES` trägt genau eine Option →
  Fusion 10 = eine kombinierte Option. Registrierbar sind nur `fusion.client.json`, `stack.client.json`, `stations.json`;
  `loso` bleibt die des Champions. Ein solcher Commit schaltet die ganze Plattform auf Fusion 10, sobald er auf `main`
  landet. Iterationen: `--neu`; vorher `git worktree remove --force C:\dev\buscosun-pruefstand\worktrees\fusion-10`.
  Kennungen mit Buchstaben (`fusion-10a`) ergeben „buscosun Fusion NaN“.
- **Engine-Quelle:** Ist `src/` des registrierten Commits gleich `src/` von `HEAD` und sauber, liest der Prüfstand die
  Engine aus dem lebenden Checkout; Ergebnisse im Cache werden nie neu gerechnet → während eines Laufs den Checkout nicht
  ändern.
- **Tabellen und Fit-Fenster:** `--fit-*` übernimmt `source`/`what` vom Champion; die Kontaminationsprüfung sieht nur
  diese Fenster. Ein Fit im Code oder ein Stack aus dem Hindcast entgeht ihr → von Hand prüfen. Tresor: Ausgabe- oder
  Gültigkeitszeit in 2024-04-01 … 2025-08-31 (bei 14 Tagen Vorlauf Ausgaben ab 2024-03-18).
- **Register-Text:** `freezeNote` ist fest „von Jan bei der Registrierung genannt“ → eine Zeile in `notes` ergänzen
  (Notizen gehen nicht in den Modell-Hash ein).
- **Nur lesen:** `C:\dev\buscosun-hindcast` (`features/points.v1.json` steckt in jedem Modell-Hash), Archiv-Slots, W1.
- **Freeze** = letzter Archivtag, den Entwicklung, Fit oder Tabellen gesehen haben (UTC).
- **Laufzeiten:** etwa 30 s je Archivtag und Version (Entwicklungsmenge ≈ 24 Tage ≈ 12 min), etwa 15 s je
  Tresor-Ausgabe und Version; eine Abnahme dauert mit Selbstprüfung und Determinismus etwa eine Stunde. Der erste Lauf
  füllt die neuen Archivtage für alle Versionen und frischt W1 auf.
- **Ausgaben:** `schnell` druckt nur den Index (Rolle B/A), keine Gates, keinen Bericht. Berichte liegen unter
  `<Datum>-<Modus>` und werden am selben Tag überschrieben.
- **Urteil:** Ist Spur R signifikant schlechter, wird G1 rot und das Urteil „abgelehnt“. Die Abnahme wird vor der Rechnung
  protokolliert — kein zweiter Versuch.
- **Adapter:** Ändert sich die Schnittstelle der Engine, endet der Lauf mit Exit-Code 4; eine neue Adapter-Generation
  rechnet die gespeicherten Champion-Zeilen nicht neu (`scripts/pruefstand/treue.mjs` prüft sie).
- **Nie:** Protokoll P1, Prüfnetz oder Tresor ändern (Siegel; das wäre P2); Wahrheit nach einer Vorhersage filtern;
  Prüfstand-Maße von Hand rechnen; den Tresor wiederholt öffnen.

## 7. Prüfstand fairer machen — nicht in P1, als P2-Vorschlag

MAE des Medians neben dem CRPS berichten; MOSMIX-„nass“ aus den eigenen Wahrscheinlichkeiten (R101/wwP) statt 0/1;
MOSMIX der nächsten Katalogstation als Rolle-B-Referenz (liegt für Eingabe-Punkte schon im Slot); MeteoSwiss E4 als
Schweizer Referenz; ungesehene Prüfstationen aus Schema 5.
