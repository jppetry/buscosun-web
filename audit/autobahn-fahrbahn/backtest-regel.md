# FB — Messregel des Backtests (Gate D), festgelegt VOR dem ersten Lauf

Festgelegt am 26.10.2026, bevor `scripts/road/road-surface-backtest.mjs` ein einziges Paar gerechnet hat. Der
SHA-256 dieser Datei steht in `audit/autobahn-fahrbahn.md` §4; eine spätere Änderung an dieser Datei ändert den Hash.

**Frage:** Sagt „buscosun Fusion — Fahrbahn" (FB-1: Luft der Streckenprognose + klimatologischer Abstand
Fahrbahn − Luft je Tagesstunde, Bewölkung, Wind und Nässe + Stationsversatz + abklingende Anomalie der letzten
Messung) die Fahrbahntemperatur und das Ereignis „Fahrbahn ≤ +1 °C" bei +1, +3 und +6 h besser voraus als die
Baselines, die die Seite heute hat?

**Daten:** Archiv `buscosun-archiv` — Messungen `road/v1/<Tag>/<00|12>.json.gz` (Fahrbahn `rs`, Luft `ta`,
Taupunkt `td` je 15 min, nur Werte, die die harten Regeln bestanden haben) und Prognosen `road/fc/v1/<Tag>/<Lauf>.json.gz`
(Stationspunkte, Vorlauf 0–24 h, `t td pp rr sn ff fx n q`). Ein Paar = ein Lauf × eine Station × ein Vorlauf
h ∈ {0 … 6}; die Wahrheit ist die Fahrbahnmessung derselben Station zur vollen Stunde t0 + h. Ein Paar zählt nur,
wenn die Station zur Laufstunde t0 eine gültige Fahrbahn- UND Luftmessung hat (sonst gibt es keine Anomalie — das
ist der Fall „Klimatologie ohne Messung", der getrennt berichtet wird) und die Wahrheit vorliegt.

**Zeitliche Trennung (kein Leck):** Fit an Läufen mit t0 < 2026-10-18 00:00 UTC; Bewertung an Läufen mit
t0 ≥ 2026-10-18 00:00 UTC. Kein Parameter wird nach einem Blick auf den Bewertungszeitraum geändert. Die
Tabelle, die in Produktion geht, wird NACH der Bewertung aus ALLEN Läufen gefittet (dieselbe Methode, dieselben
Hyperparameter wie im Fit auf dem Trainingsfenster, darunter das gefittete τ).

**Vergleichsgrößen (Bewertungszeitraum, je Vorlauf 1, 3, 6 h):**

- MAE und Bias der Fahrbahntemperatur in K.
- Ereignis E = „Fahrbahn ≤ +1 °C" (`FROST_ROAD_MAX_C`, der Temperaturteil der Klasse Frostgefahr): Brier-Score der
  Wahrscheinlichkeit P(E) = Φ((1 − rs_fc) / σ_h) mit σ_h aus den Residuen des Trainingsfensters; Trefferquote
  (hit rate) und Fehlalarmquote (false alarm ratio) bei P ≥ 0,5; Anzahl der Ereignisse.
- Berichtet, nicht entschieden: dasselbe nach Tag/Nacht (Sonne über/unter dem Horizont zur gültigen Stunde) und die
  Klasse Frostgefahr/Glätte (`k` ∈ {f, i}) als Ereignis — im Oktober gibt es davon zu wenige.

**Baselines (je Paar dieselben Stationen und Läufe):**

- P — Persistenz: rs_fc(h) = rs_obs(t0). P(E) = 1 falls rs_obs(t0) ≤ 1, sonst 0.
- A — Luft-Proxy der Seite (E-AW-40): rs_fc(h) = t_fc(h). P(E) = 1 falls t_fc(h) ≤ 1, sonst 0.
- PA — Methode des Plans ohne Abklingen: rs_fc(h) = t_fc(h) + (rs_obs(t0) − t_fc(0)). P(E) wie bei P/A als 0/1.
- C — FB-1 ohne Messung (nur Klimatologie + Stationsversatz, wie an einem Achspunkt ohne Anlage).

**Regel**

1. **Gate D-T (Temperatur) ist GRÜN**, wenn die MAE von FB-1 bei jedem der Vorläufe 1, 3 und 6 h kleiner ist als die
   von P, A und PA, und das 95-%-Intervall der gepaarten Differenz (Bootstrap über Läufe, 1 000 Ziehungen — Läufe,
   nicht Stationen, denn die Stationen eines Laufs sind räumlich korreliert) die 0 ausschließt.
2. **Gate D-K (Klasse) ist GRÜN**, wenn der Brier-Score von FB-1 bei jedem der Vorläufe 1, 3 und 6 h kleiner ist als
   der von P und A und im Bewertungszeitraum je Vorlauf mindestens 100 Ereignisse E liegen. Liegen weniger vor, ist
   Gate D-K **nicht messbar** (nicht rot) und wird im Dezember wiederholt — so stand es schon im Plan vom 03.10.
3. **Sichtbar wird** (nach Jans Freigabe, Flag `ROAD_SURFACE_LIVE`) bei grünem D-T die Fahrbahntemperatur als
   „berechnet"; der Hinweis „Frostgefahr (berechnet)" erst bei grünem D-K. Ist D-T rot, geht nichts live und die
   Zeile bleibt „geplant".
4. τ wird im Fit auf dem Trainingsfenster per Gitter {0,5; 1; 1,5; 2; 3; 4; 6; 8; 12} h gewählt (kleinste MAE über
   h = 1 … 6); die Regression je Tagesstunde hat vier Koeffizienten (Konstante, Klarhimmel 1 − N/100, Wind m/s,
   Nässe 0/1); der Stationsversatz wird mit n/(n + 20) geschrumpft. Diese Form steht fest; was variiert, ist nur,
   was gefittet wird.

**Grenze der Aussage:** ≈ drei Wochen Oktober, eine Jahreszeit, ≈ 1 350 Stationen. Der Tagesgang der Klimatologie
gilt für den Sonnenstand des Fensters; ohne Nachfit driftet er zum Winter (V-FB-Eintrag). Die Nachtwerte
(Strahlungsabkühlung) tragen den Frostfall, die Oktobernächte sind dafür nur ein Vorgeschmack.

## Änderung A1 (26.10.2026, nach dem ersten Lauf — der brach vor jeder Bewertung am eigenen Tabellenprüfer ab)

Der erste Lauf scheiterte am Prüfer der gefitteten Tabelle: Station E774 meldet im Oktober Fahrbahn 54–74 °C bei
Luft 2–22 °C (Versatz +46 K über 138 Paare), weitere 19 Stationen tragen |Fahrbahn − Luft| > 6 K im Mittel; 3 246 von
1 114 518 Paaren liegen über 15 K. Solche Fühler setzen sich selbst einen „Versatz" und blähen σ. **Festgelegt, ohne
eine Bewertungszahl gesehen zu haben:** Paare mit |Fahrbahn − Prognose-Luft| > 15 K (zur gültigen Stunde oder zur
Laufstunde) bleiben aus dem FIT heraus (`ROAD_SURFACE_FIT_MAX_ABS_K`); die BEWERTUNG zählt weiter jedes Paar, wie oben
festgelegt — zusätzlich wird dieselbe MAE-Tabelle nur über Paare mit plausibler Messung zur Laufstunde berichtet
(nicht entschieden). Die Fühler selbst sind ein Befund für die Datenprüfung (V-FB-6).
