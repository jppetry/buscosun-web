# GM-9 — Messregel Neuschneedichte aus Temperatur und Wind (eingefroren)

Eingefroren am 24.11.2026 gegen 22:10 UTC, **vor dem ersten gewerteten Lauf**. Werkzeug `audit/gletscher-schneemodell/gm9-density.mjs`, sha256 beim Einfrieren `6ffa40c180240109ddc950bd7f9e8400b09d3490dda17de2bb459c8afc56848b`; der Modus `score` läuft nur, wenn diese Datei ihrem Hash in `gm9-method-frozen.sha256` entspricht.

## 0. Was beim Einfrieren bekannt war

- Geladen und **nur gezählt** (Modus `count`): Schweiz 2 362 zugelassene Ereignistage (wie GM-3 §B), davon 2 324 wertbar (Wind an allen 24 Stunden, Feuchte an mindestens 20 Stunden), 18 Messfelder, 14 Winter, 694 Tage ab 2 000 m; Österreich 8 061 Tage an 57 Stationen; Deutschland 775 Intervalle mit Temperatur an 18 Stationen mit Klimadaten. Keine Dichte dieser Zählung angesehen.
- **Vorwissen aus GM-3 §B (`gm3-report-B.json`), offen benannt:** an denselben Schweizer Tagen war Vionnet wie gedruckt mit 5,51 cm Fehler besser als 68 kg/m³ (8,00), aber schlechter als die Konstante 96 (4,49), eine lineare Temperaturregel 102 + 1,5·T gewann gegen 96 nichts (4,52 gegen 4,49); unter −8 °C lag die gemessene Brettdichte bei 84, sonst um 100. Diese Regel ist also nicht blind gegen die Daten; sie fügt Wind, Feuchttemperatur, die Rückhaltung je Winter, Formen aus der Literatur und die Negativkontrolle hinzu.
- Das Werkzeug fand an erfundenen Ereignissen eine gesetzte Regel log ρ = 4,3 + 0,03·T + 0,12·√u wieder (4,277 / 0,0304 / 0,122; Urteil „ja“, Negativkontrolle +0,2 %) und in einer Welt konstanter Dichte keine (Urteil „nein“).

## 1. Daten

| Land | Wahrheit | Wetter | Rolle |
|---|---|---|---|
| CH | SLF-Messfelder (Q6): `HN_1D` (cm) und `HNW_1D` (mm) vom selben Brett, 06 UTC | SwissMetNet-Station ≤ 3 km / ≤ 200 m (Q21): Stundenwerte `tre200h0` (mit −6,5 K/km auf die Höhe des Messfelds), `fkl010h0`, `ure200h0` | **gewertet** |
| AT | GeoSphere `klima-v2-1d` (Q7): Neuschnee von Hand, Wasser aus dem **Messer** (Minderfang) | Tagesmittel `tl_mittel`, `vv_mittel` derselben Station | nur beschreibend |
| DE | DWD CDC `water_equiv` (Gesamt-Wasserwert, meist Mo/Mi/Fr): Zuwachsdichte ΔSWE / ΔHS zwischen zwei Messtagen ≤ 3 Tage auseinander | DWD `kl` derselben Station (`TMK`, `TXK`, `FM`, `UPM`) | nur beschreibend |

Zulassung CH unverändert aus GM-3 §B (`set` dort): HN ≥ 3 cm, HNW ≥ 2 mm, mindestens 20 Stunden Temperatur, höchste Stundentemperatur ≤ 1 °C, Dichte 20–400 kg/m³, hydrologische Jahre 2012–2025, November–April. Gewertet werden nur Tage mit Wind an allen 24 Stunden und Feuchte an mindestens 20 Stunden (`set`), damit alle Regeln auf denselben Tagen stehen.
AT: Stationen ab 1 000 m, Jahre 2016–2025, HN ≥ 3 cm, Messer ≥ 2 mm, Tagesmittel ≤ −1 °C (GM-3 §B-Übertrag, aber **ohne** Windfilter, damit Windklassen entstehen). DE: Stationen ab 800 m, Jahre 2012–2026, ΔHS ≥ 5 cm, ΔSWE ≥ 2 mm, höchste Tagestemperatur des Intervalls ≤ 1 °C. AT und DE gehen nicht ins Urteil: AT misst Messer-Wasser (Minderfang hängt selbst am Wind), DE misst den Zuwachs der ganzen Decke über 1–3 Tage (Setzung des Altschnees, Wind, Regen darin).

Feuchttemperatur: Stull 2011 (`literature`) aus Stundentemperatur und Stundenfeuchte der Station (Feuchte nicht auf die Höhe verschoben, `set`).

## 2. Tabellen (beschreibend, kein Urteil)

Gemessene Dichte je Ereignis (CH: HNW / HN vom Brett; AT: Messer / HN; DE: ΔSWE / ΔHS), Median und Zahl je Zelle aus Höhenband × Temperaturklasse × Windklasse:
- Höhenbänder CH < 1 500 / 1 500–1 999 / ab 2 000 m; AT 1 000–1 499 / 1 500–1 999 / ab 2 000 m; DE < 1 000 / ab 1 000 m (`set`).
- Temperatur (Tagesmittel) und Feuchttemperatur: < −8 / −8 … −3 / ab −3 °C (Grenzen aus GM-3, `set`); Wind: < 2 / 2–4 / ab 4 m/s (Grenzen aus GM-3 D, `set`).
- p10/p90 nur ab 10 Ereignissen in der Zelle.
- Dazu je Zelle aus Temperatur × Wind (CH): mittlerer Fehler der Neuschneehöhe mit der Konstante 96.

## 3. Wertung (nur CH)

**Größe.** Wie GM-3 §B: der Schneekern (`boardDepth`, `stepPack` aus `scripts/glacier/lib/snowcore.mjs`) auf leerem Brett über 24 Stunden mit dem gemessenen Wasserwert, gleichmäßig auf die Stunden verteilt, und der Stundendichte der Regel; Fehler = berechnete minus gemessene Neuschneehöhe (cm). Kennzahl: **mittlerer Betrag des Fehlers (MAE)**, gerechnet je ausgelassenem Winter (LOWO, 14 Winter) und über alle Tage gemittelt.

**Anpassung.** Je Tag die Ablagedichte ρ*, mit der der Kern genau die gemessene Neuschneehöhe zeigt (Halbierung, konstante Dichte über 24 h). Angepasst wird auf den Wintern ohne den ausgelassenen: gewichtete kleinste absolute Abweichung (IRLS, Gewicht = gemessene Neuschneehöhe) von log ρ* gegen das Tagesmittel der Stundenprädiktoren; angewandt wird die Regel stündlich, begrenzt auf 20–400 kg/m³ (`set`).

**Kandidaten** (jede Konstante mit Herkunft):

| Kürzel | Form | Herkunft |
|---|---|---|
| C0 | 96 kg/m³ fest (heute, `board`) | `measured` (GM-3 D2) |
| C1 | Konstante, je Rückhaltung neu geschätzt | `measured` (diese Runde) |
| F1 | log ρ = a + b·T + c·√u | Form: Vionnet 2012 / Lehning 2002 (`literature`), a, b, c `measured` |
| F2 | log ρ = a + b·Tw + c·√u | Form wie F1 mit Feuchttemperatur (Anderson 1976, `literature`), a, b, c `measured` |
| F3 | log ρ = a + b·T | Zerlegung: nur Temperatur, `measured` |
| F4 | log ρ = a + c·√u | Zerlegung: nur Wind, `measured` |
| L1 | 109 + 6·T + 26·√u, wie gedruckt (Boden 50) | Vionnet et al. 2012, `literature` |
| L2 | 50 + 1,7·(Tw + 15)^1,5 (unter −15 °C: 50) | Anderson 1976, `literature` |
| L3 | 67,92 + 51,25·exp(T/2,59), T ≤ 0 | Hedstrom & Pomeroy 1998, `literature` |
| L1s, L2s, L3s | k × L1 / L2 / L3, k je Rückhaltung geschätzt | Form `literature`, k `measured` |

**„Trägt“ — eine Regel trägt, wenn alle vier Bedingungen gelten** (Grenzen `set`):
1. LOWO-MAE mindestens **5 %** besser als C1 (dieselbe 5-%-Grenze wie GM-3 §B);
2. mindestens **5 %** besser als C0 = 96 (heute);
3. besser als C1 in mindestens **60 %** der ausgelassenen Winter;
4. im Band ab 2 000 m nicht mehr als **2 %** schlechter als C1 (nur geprüft, wenn dort mindestens 100 Tage liegen).

**Negativkontrolle.** F1, angepasst mit dem Wetter anderer Tage (Temperatur-, Wind- und Feuchtreihen innerhalb der Trainingswinter vertauscht, fester Startwert 20261124). Erfüllt sie Bedingung 1, ist das Urteil **ungültig**.

**Urteil auf Jans Frage** („schlägt eine Temperatur-Wind-Regel die Konstante?“): **ja**, wenn mindestens eine der Formen mit Temperatur (oder Feuchttemperatur) UND Wind trägt — F1, F2, L1, L1s; sonst **nein**. F3, F4, L2, L3 werden mit ausgewiesen (Zerlegung), entscheiden die Frage aber nicht.

**Auswahl** (für den Bau nach Jans Wort): unter den tragenden Regeln die mit dem kleinsten LOWO-MAE; eine Regel mit weniger Parametern plus Eingängen (T, u, Feuchte) wird genommen, wenn die bessere sie um weniger als **2 %** schlägt (`set`).

**Weitere Kennzahlen, ohne Urteil:** Anteil der Streuung, den die Regel erklärt — 1 − mittlerer |log(Modell-Brettdichte / gemessene)| der Regel / der von C1, und dasselbe als 1 − Quadratsumme (R² in log); Bias; MAE ab 2 000 m; Winter für Winter.

## 4. Referenzpaar Zugspitze und Schattenpaare (beschreibend)

- Ist die DWD-Station Zugspitze (`de:05792`) dem Nördlichen Schneeferner zugeordnet, und liefert sie eine Schneehöhe? Gelesen aus Zuordnung, Katalog und Slots der Stationslinie (Kopie `C:\dev\buscosun-glacier-cache\gm4\live`) und aus den DWD-Tageswerten (`kl`, `more_precip`). Die Stationslinie wird nicht geändert.
- Die 24-h-Änderung aus den Schattenpaaren braucht zwei Läufe 24 h auseinander; wird gezählt, was im Daten-Repo und im Archiv davon liegt. Fehlt es, wird es benannt, nichts geschätzt.

## 5. Was diese Regel nicht prüft

Dichte auf dem Eis (die Bretter liegen auf 580–2 690 m); Schneefälle unter 10 cm (Wasserwert dort fast nie gemessen, V-GM-20); den Niederschlag der Ereignisse 20.–23.11. (V-GM-50 trennt Niederschlag und Dichte erst mit einer gewerteten Dichte-Regel und Läufen von buscosun Fusion); die Spanne (σ) der Dichte — sie wird erst nach einem Urteil „ja“ aus den Resten der gewählten Regel gemessen.
