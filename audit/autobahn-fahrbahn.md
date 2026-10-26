# Phase FB — „buscosun Fusion — Fahrbahn": Fahrbahntemperatur und -zustand +1/+3/+6 h (AW-6.2, Gate D)

> Auftrag (Jan, 26.10.2026): „DACH · buscosun Fusion — Fahrbahn · Fahrbahntemperatur und -zustand +1/+3/+6 h — setze
> es um." Das ist die Zeile mit Status „geplant" in der Quellenliste der Autobahnwetter-Seite
> (`src/road/RoadReadout.tsx`, `SOURCES`) und der Plan AW-6.2 aus `audit/autobahnwetter-plan.md` (Abschnitt AW-6).
> Vorarbeiten: Streckenprognose AW-6.1 (`audit/autobahnwetter.md` §14–§16), Archiv AW-6a (§12), Prognose-Archiv (§14.6).

## 1. Diagnose (26.10.2026, nur gelesen und gezählt)

**Was die Seite heute hat.** `road/fc/v1/` trägt WETTER an der Strecke (Luft 2 m, Taupunkt, Niederschlag, Wind,
Bewölkung) aus buscosun Fusion in seinem jüngsten Stand, stündlich, 0–48 h, an jedem 5-km-Achspunkt und an jeder
Glättemeldeanlage; die Stationspunkte sind an ihrer eigenen Luftmessung verankert (E-AW-30). Die Kacheln +1/+3/+6 h,
der Verlauf (gestrichelte Luft) und die Spalte „zur Ankunft" sagen ausdrücklich „Luft"; an fünf Stellen steht
„Eine Prognose der Fahrbahn folgt erst nach dem Backtest." Die Gefahren-Leiste schreibt eine fahrbahnabhängige
Glätte-Stufe fort, solange die Cube-Luft ≤ +1 °C bleibt (E-AW-40, Proxy bis Gate D).

**Was der Plan (03.10.) für AW-6.2 festlegt.** Fahrbahn = Cube-T2m + zuletzt gemessene Differenz Fahrbahn − Luft,
abklingend mit τ (gefittet, nicht gesetzt); Klasse mit den Zustandsregeln aus abgeleiteten Werten, Herkunft
`derived`; Berechnung im Derive, nicht im Browser; sichtbar erst nach Gate D (Backtest Frostgefahr gegen die später
gemessene Klasse, Brier, Treffer-/Fehlalarmquote, Baseline Persistenz). „Genug Frostlagen erst ab November."

**Was im Archiv liegt (lokaler Klon `C:\dev\buscosun-archiv`, `git pull` 26.10. 09:47 UTC, Stand `5df85d5`).**

| Bestand | Umfang |
|---|---|
| Messungen `road/v1` | 02.10.–26.10., 47 Halbtage, 2 256 Slots à 15 min, 1 408 Stationen; 2 588 069 gültige Fahrbahnwerte |
| Prognosen `road/fc/v1` | 04.10.–25.10., 152 Läufe (≈ 7 je Tag), 1 658–1 814 Stationspunkte, Vorlauf 0–24 h, `t ts td pp rr sn ff fx n q` |
| Schnittmenge | 1 378 Stationen in beiden Archiven |
| Ereignis Fahrbahn ≤ +1 °C | 1 996 Station-Slots (0,08 %), davon 902 ab 18.10.; stark gebündelt (13.10. 00–12 UTC: 229, 23.10.: 302) |
| Klasse Frostgefahr `f` / Glätte `i` | 903 / 30 Station-Slots von ≈ 2,9 Mio. |

Folge: die **Fahrbahntemperatur** ist jetzt belastbar messbar (MAE über 1,4 Mio. Paare), das **Ereignis ≤ +1 °C**
dünn (≈ 200 Stunden-Paare je Vorlauf im Bewertungsfenster), die **Klasse Frostgefahr** nicht (wie der Plan sagte).
Das Gate wird deshalb in zwei Hälften gelegt: D-T (Temperatur) und D-K (Klasse), s. §4.

**Was der Producer zur Laufzeit hat.** `road-forecast.mjs` liest die Obs-Datei der vollen Laufstunde
(`readSwisTable`: `ta`, `td`, `rh`, Wind — die Fahrbahn `rs` noch nicht), hat Gelände und z0 je Punkt und rechnet je
Punkt die 49 Stunden. Alles, was FB-1 braucht, liegt also im selben Checkout; es fehlt nur `rs` in der Messtabelle
und eine Koeffiziententabelle.

**Was „DACH" in der Zeile bedeutet.** Prognosepunkte AT/CH gibt es nicht (Zeilen „GeoSphere TAWES", „SwissMetNet"
sind „geplant"); die Fahrbahnprognose rechnet dort, wo die Streckenprognose rechnet: deutsche Korridore und
Stationen. Die Quellenzeile sagt das, wenn sie „aktiv" wird (V-FB-3).

## 2. Entscheidungen (Ruling, je mit Preis)

| Nr. | Entscheidung | Warum | Preis, wenn falsch |
|---|---|---|---|
| E-FB-1 | **Modell FB-1** = Luft der Streckenprognose t_fc(h) + Δ_clim(Tagesstunde UTC, Klarhimmel 1 − N/100, Wind, Nässe) + Stationsversatz b_s + (Δ_obs(t0) − Δ_clim(t0) − b_s) · e^(−h/τ). Δ := Fahrbahn − PROGNOSE-Luft derselben Stunde. Alles gefittet am Archiv (§4), nichts gesetzt außer der Form | der Plan nennt Cube-T2m + abklingende Differenz; die reine Differenz ohne Tagesgang (PA) wäre bei Sonnenaufgang systematisch falsch (eine um 05 UTC gemessene kalte Fahrbahn bleibt sonst bis 11 UTC kalt). Klarhimmel und Wind sind die Treiber der Strahlungsbilanz der Fahrbahn und liegen in der Prognose vor | Form zu einfach ⇒ MAE schlechter als die Baselines, Gate rot; dann steht die Zeile weiter auf „geplant" |
| E-FB-2 | Die Tabelle (`surface.json`: 24 × 4 Koeffizienten, τ, σ je Vorlauf, Versatz je Station) liegt als **statische Datei im Daten-Repo** `road/fc/v1/static/surface.json`; Bau von Hand aus dem Archiv (`road-surface-backtest.mjs --table`), Kopie im Publish-Paket | wie `points.json`/`geo.json`: der Producer liest sie aus dem Checkout, kein zweiter Workflow, kein Lernen zur Laufzeit. Der Tagesgang hängt am Sonnenstand ⇒ Nachfit je Monat ist ein Handgriff (E-FB-6) | ohne Nachfit driftet die Klimatologie; die Tabelle nennt ihr Fenster, die Seite kann es sagen |
| E-FB-3 | **Produkt** = drei OPTIONALE Reihen im bestehenden Lauf (`rs` 0,1 °C, `rk` Hinweis-Code, `rq` Herkunft-Code), nur Vorlauf 0–6 h belegt, Rest `null`; Kopfblock `engine.surface` sagt, was der Lauf tat (Tabelle, τ, σ, Zahl der Punkte mit eigener Messung) oder warum nicht | kein neuer Pfad, kein neuer Zeiger, alte Clients und `verify:road-fc` ignorieren unbekannte Reihen (Muster AW-7.1); 7 Werte × 3 Reihen je Punkt ≈ +2 % Dateigröße | Horizont 6 h ist hart: die Spalte „zur Ankunft" zeigt bei späterer Ankunft weiter nur die Luft |
| E-FB-4 | **Hinweis-Klasse** aus abgeleiteten Werten: `2` Frostgefahr (rs ≤ +1 °C und (Nässe erwartet oder rs ≤ Taupunkt)), `1` Nass (Niederschlag ≥ 50 %), `0` kein Hinweis — nie „trocken", nie „Glätte gemessen" | dieselben Schwellen wie `classifySensor`, aber ohne gemessenen Zustand kann die Prognose weder „trocken" noch einen Eis-Code behaupten (D-04, D-FCB-2) | eine gemessene Nässe, die nach 2 h noch steht, wird in Stunde 3 nicht mehr „nass" genannt (V-FB-5) |
| E-FB-5 | **Anzeige hinter `ROAD_SURFACE_LIVE = false`**, `?rsfc=1` zeigt, `?rsfc=0` versteckt (Muster `roadhz`); eingeschaltet wird nach Jans Freigabe, und nur was das Gate hergibt (D-T ⇒ Temperatur „berechnet", D-K ⇒ Hinweis „Frostgefahr (berechnet)") | Rule 2 und die Messregel §4 Nr. 3 | — |
| E-FB-10 | **Einschalten trotz rotem D-T (Jan, 26.10. nachmittags: „du kannst es gerne einschalten").** `ROAD_SURFACE_LIVE = true`; Rückweg `?rsfc=0` je Besucher oder `false` + Push. Sichtbar wird es erst, wenn ein Lauf die Reihen trägt, also nach der Kopie der Tabelle ins Daten-Repo (§77) | Jans Abwägung: gegen den Luft-Proxy, den die Seite heute als Fahrbahn-Ersatz nutzt, ist FB-1 bei jedem Vorlauf 0,5–1,2 K besser; der rote Punkt der Regel (0,05 K hinter der Plan-Differenz bei +1 h) ist kein Nachteil für die Nutzer, sondern eine verfehlte Latte gegen eine Baseline, die die Seite nie hatte. Die Regel-Datei bleibt unverändert; dieses Urteil überstimmt sie ausdrücklich | der Dezember-Test misst dann die LIVE-Prognose; fällt er schlecht aus, zeigt die Seite bis dahin eine Fahrbahn, die nachts bei +1 h 0,2 K schlechter ist als die reine Fortschreibung — immer als „berechnet" gekennzeichnet |
| E-FB-6 | **Nachfit** der Tabelle monatlich (Jan: ein Kommando, eine Kopie), erster Nachfit Anfang Dezember mit den ersten Frostnächten; dann Gate D-K | Sonnenstand; Frostfälle | bis dahin Oktober-Klimatologie, benannt |
| E-FB-7 | Die **Gefahren-Leiste** (E-AW-40 Fortschreibung) bleibt in dieser Phase unverändert; die abgeleitete Fahrbahn ersetzt den Luft-Proxy erst nach grünem D-K (eigene Entscheidung, V-FB-2) | ein Thema = eine Phase; die Leiste hat ein eigenes Gate E | — |
| E-FB-8 | Das **Prognose-Archiv** nimmt `rs rk rq` mit (`ROAD_FC_ARCHIVE_VARS`), alte Läufe ohne die Reihen bleiben lesbar | der Live-Stand von FB-1 muss im Dezember am Archiv messbar sein (Live-Prognose gegen Messung), nicht nur im Replay | +3 Reihen × 7 Werte je Station ≈ +1,5 KB je Lauf |

Nicht angefasst: buscosun Fusion selbst (kein Eingriff in `src/pointForecast/`), die Spiegel-Workflows, `road/v1`.

## 3. Plan

1. **Vertrag** `src/road/roadSurface.ts` (abhängigkeitsfrei, Producer + Client + Verifier): Tabellenformat mit
   Prüfer, Modell FB-1 als reine Funktion, Hinweis-Klasse, Wörter („berechnet"), Flag `ROAD_SURFACE_LIVE`,
   `roadSurfaceFlagFrom`; `roadFc.ts`: optionale Reihen `rs rk rq`, Kopfblock `engine.surface`.
2. **Backtest + Fit** `scripts/road/road-surface-backtest.mjs`: Archiv lesen (Vollstunden), Paare bauen, Fit auf dem
   Trainingsfenster, Bewertung nach §4 (Bootstrap über Läufe), Bericht `audit/autobahn-fahrbahn/backtest-<Datum>.md`
   + `.json`, Tabelle aus allen Läufen nach `C:\dev\buscosun-road-publish\2026-10-26-fb1\surface.json`.
3. **Producer** `road-forecast.mjs`: Messtabelle trägt `rs`; Tabelle aus dem Checkout; je Punkt `rs rk rq` für 0–6 h
   (Station mit eigener Messung: Anomalie; sonst Klimatologie, `rq = 1`); `engine.surface`; Schalter `ROAD_SURFACE=0`.
   Fehlt die Tabelle, läuft die Streckenprognose wie bisher und der Kopf nennt den Grund (kein stiller Ausfall, kein
   Abbruch der ganzen Prognose wegen einer Zusatzreihe).
4. **Archiv** `road-fc-archive.mjs`: Reihen mitnehmen, fehlende Reihen alter Läufe tolerieren.
5. **Anzeige** (hinter Flag): Kacheln +1/+3/+6 h führen die Fahrbahn „berechnet" mit Hinweis-Marke, Luft darunter;
   Verlauf mit gestrichelter Fahrbahn 6 h; Prognose-Raster mit „Fahrbahn (berechnet) ± σ"; Spalte „zur Ankunft" mit
   Fahrbahn bis +6 h; Quellenzeile „aktiv" mit Fenster der Tabelle; die fünf Sätze „folgt erst nach dem Backtest"
   nur noch ohne Flag.
6. **Verifier** `verify:road-surface` (Modell, Vertrag, Fit und Bewertung auf synthetischem Archiv mit bekannter
   Wahrheit und Negativkontrolle, Producer auf dem Cube-Fixture mit/ohne Tabelle, Archiv-Ausdünnung, Texte);
   `verify:road-ui` Abschnitt W (`?rsfc=1`); `verify:road-fc`, `verify:road-archive`, `typecheck`, `build`, `budget`.
7. **Gate** §5; `MANUELLE-SCHRITTE.md` §77 (Kopie der Tabelle, Push, Einschalten); Zeile in `CLAUDE.md`.

## 4. Messregel (eingefroren vor dem Lauf)

`audit/autobahn-fahrbahn/backtest-regel.md`, SHA-256 `6f744dc356992649caef0b4864132063c6476b16ce92fb937ae990e9b96d66c0`
(gerechnet 26.10.2026 vor dem ersten Lauf des Skripts). **Änderung A1** nach dem ersten Lauf, der vor jeder Bewertung am
eigenen Tabellenprüfer abbrach (Station E774 mit +46 K, σ gesprengt): Paare mit |Fahrbahn − Luft| > 15 K bleiben aus dem
FIT (`ROAD_SURFACE_FIT_MAX_ABS_K`), die Bewertung zählt weiter jedes Paar; Wortlaut in der Regel-Datei, neuer SHA-256
`34ecf66d88057ac3b3e16d1fc8a6667b04460e43a28b562b1131329e79cf5be6`. Kurz: Fit t0 < 18.10., Bewertung t0 ≥ 18.10.; Vorläufe 1/3/6 h;
Baselines Persistenz, Luft-Proxy, Plan-Differenz ohne Abklingen, Klimatologie ohne Messung; Gate D-T = MAE kleiner als
alle drei Baselines mit 95-%-Bootstrap über Läufe; Gate D-K = Brier kleiner als P und A bei ≥ 100 Ereignissen je Vorlauf,
sonst „nicht messbar".

## 5. Umsetzung und Gate (26.10.2026)

### 5.1 Was gebaut ist (alles uncommitted im Arbeitsbaum, nichts im Daten-Repo)

| Teil | Datei | Stand |
|---|---|---|
| Vertrag + Modell FB-1 | `src/road/roadSurface.ts` | Tabellenformat mit Prüfer (benannte Gründe), Klimatologie, Anomalie mit Gewicht je Vorlauf, Hinweis-Klasse, Φ-Wahrscheinlichkeit; `roadFc.ts` trägt die optionalen Reihen `rs rk rq` und den Kopfblock `engine.surface` |
| Schalter | `src/road/roadFlag.ts` | `ROAD_SURFACE_LIVE = false`, `?rsfc=0|1`, `localStorage.rsfc` (Reihenfolge wie `roadhz`); eager, drei Zeilen |
| Fit + Backtest | `scripts/road/road-surface-backtest.mjs` | Leser der beiden Archive, Paare (Lauf × Station × Vorlauf 0–6), Fit (Regression je UTC-Stunde ↔ Stationsversatz wechselnd, 8 Pässe; τ-Gitter oder Gewicht je Vorlauf; σ je Vorlauf), Bewertung mit Bootstrap über Läufe, Gate-Urteil, Bericht, Produktionstabelle |
| Producer | `scripts/road/road-forecast.mjs` | `readSurfaceTable` (fehlend/unlesbar/ungültig/`ROAD_SURFACE=0` ⇒ Grund im Kopf, kein Abbruch), Messtabelle trägt `rs`, `applySurface` je Punkt (Station mit eigener Messung: Anomalie; sonst Klimatologie, `rq = 1`), `engine.surface`, Log-Zeile |
| Archiv | `scripts/road/road-fc-archive.mjs` | `rs rk rq` in `ROAD_FC_ARCHIVE_VARS`, alte Läufe ohne die Reihen bleiben lesbar (E-FB-8) |
| Anzeige (hinter Flag) | `RoadReadout.tsx`, `roadFcView.ts`, `roadDeck.css`, `RoadPage.tsx`, `RoadRoute.tsx` | Kacheln +1/+3/+6 h führen „Fahrbahn · berechnet" mit gestricheltem Marker und Hinweis, Luft darunter; Raster „Fahrbahn · berechnet ± σ" + „Hinweis · berechnet"; Verlauf mit gestrichelter Fahrbahn 6 h; Spalte „zur Ankunft" mit „Fahrbahn x° · ber."; Quellenzeile „aktiv" nur, wenn Lauf UND Schalter; die Sätze „folgt erst nach dem Backtest" nur noch ohne Schalter |
| Verifier | `scripts/verify-road-surface.mjs` (`npm run verify:road-surface`), `verify-road-fc.mjs` (Fixture: Code-Reihen mit 0), `verify-road-ui.mjs` Abschnitt W | s. 5.3 |
| Tabelle | `C:\dev\buscosun-road-publish\2026-10-26-fb1\surface.json` | 12 993 B, SHA-256 `6f3d60f4e1e2…`, gefittet an allen 151 Läufen 04.–25.10., Gewicht je Vorlauf (`decayFit: lead`) — Kopie ins Daten-Repo ist Jans Gate (§77) |

### 5.2 Backtest nach der eingefrorenen Regel (`audit/autobahn-fahrbahn/backtest-2026-10-26.md`, `.json` daneben)

Fit 04.–17.10. (105 Läufe, 767 131 Paare, 1 215 Stationen mit Versatz), Bewertung 18.–25.10. (46 Läufe, 293 436 Paare).
τ-Gitter ⇒ **τ = 4 h** (MAE 1,107 K über 1–6 h); σ 1,14 / 1,41 / 1,59 / 1,71 / 1,76 / 1,77 K (1–6 h); 3 474 Paare nach A1 aus dem Fit.

| Vorlauf | MAE FB-1 | Persistenz P | Luft-Proxy A (E-AW-40) | Plan-Differenz PA | Klimatologie C | Bias FB-1 | M − P [95 %] | M − A | M − PA |
|---|---|---|---|---|---|---|---|---|---|
| +1 h | **0,75** | 0,79 | 1,91 | 0,69 | 1,35 | +0,19 | −0,04 [−0,18; +0,07] | −1,17 [−1,45; −0,91] | +0,05 [−0,00; +0,10] |
| +3 h | **1,10** | 1,96 | 1,89 | 1,23 | 1,39 | +0,30 | −0,86 [−1,17; −0,59] | −0,79 [−1,03; −0,58] | −0,13 [−0,28; +0,03] |
| +6 h | **1,35** | 3,11 | 1,84 | 1,73 | 1,44 | +0,42 | −1,76 [−2,33; −1,23] | −0,48 [−0,71; −0,29] | −0,38 [−0,66; −0,13] |

Nacht/Tag (MAE K): FB-1 0,53/0,93 (+1 h), 0,81/1,48 (+3 h), 1,09/1,70 (+6 h); Persistenz nachts 0,37 (+1 h) → 2,74 (+6 h).
Ereignis Fahrbahn ≤ +1 °C im Bewertungsfenster: 33 / 30 / 29 Stunden-Paare je Vorlauf (0,06 %), Brier aller Varianten 0,001 — nicht unterscheidbar.
Klasse Frostgefahr/Glätte: 14 / 12 / 11 Fälle.

**Gate D-T (Temperatur): ROT** nach der Regel — bei +1 h ist die Plan-Differenz PA (0,69) um 0,05 K besser als FB-1 (0,75), und das Intervall M − P schließt 0 ein; bei +3 h schließt M − PA die 0 ein; bei +6 h ist alles grün. **Gate D-K (Klasse): NICHT MESSBAR** (33 statt ≥ 100 Ereignisse; Wiederholung im Dezember, wie der Plan vom 03.10. es vorsah).

Nachträglich und informativ (keine Formänderung am Urteil): ein Gewicht je Vorlauf statt e^(−h/τ) ergibt 0,796 / 0,646 / 0,485 / 0,352 / 0,254 / 0,168 (≈ e^(−h/4)) und dieselben Zahlen — die Form des Abklingens ist nicht der Grund (V-FB-7). Der Grund steht im Bias: FB-1 ist im Bewertungsfenster +0,19 … +0,42 K zu warm, weil die Klimatologie der Tage 04.–17.10. auf die Tage 18.–25.10. nicht mehr passt (der Herbst drückt den Abstand Fahrbahn − Luft innerhalb von zwei Wochen um Zehntelgrade); PA hat keine Klimatologie und deshalb keinen Drift. Nachts (Strahlungsfall) ist die reine Persistenz bei +1 h besser als jedes Modell (0,37 K).

**Ehrliche Lesart für die Seite:** gegen das, was die Seite heute als Fahrbahn-Proxy benutzt (Luft, E-AW-40), ist FB-1 bei jedem Vorlauf um 0,5–1,2 K besser (nachweisbar); gegen die beste simple Fortschreibung ist es erst ab +2 h besser. Was nicht geht: eine Gate-Zahl nach dem Blick auf die Bewertung umdeuten.

### 5.3 Verifier und Gates (26.10.2026, PowerShell, ohne `2>&1`)

| Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` | grün |
| `verify:road-surface` | **24/24** (A Modell 7, B Vertrag 1, C Fit/Backtest synthetisch 7 inkl. exakter Wahrheit und zwei Gegenproben, D Producer-Verdrahtung 4, E Archiv 1, F Texte 4; G mit `--archive`: 1 114 518 Paare, Gewichte fallen monoton) |
| `verify:road-fc` | 107/107 (Fixture-Reihe füllt Code-Größen mit 0 — `rk`/`rq` sind Codes wie `q`) |
| `verify:road-archive` | 33/33 |
| `verify:road-hazards` | 96/96 |
| `verify:road-ui` | Abschnitt W **5/5** im Scratch-Lauf (s. 5.4): W1 Kacheln +1/+3 h „Fahrbahn · berechnet" mit Wert aus der Datei, +6 h hinter dem Horizont des Laufs bleibt „Luft", Verlauf 6 Punkte, Legende, Hinweis mit Tabellenfenster; W2 Raster „Fahrbahn · berechnet +19,3 °C · typisch ± 1,5 K" + „Hinweis · berechnet"; W3 Quellenzeile aktiv, Ankunftsspalte, Hinweis ohne „folgt erst nach dem Backtest"; W4/W5 ohne Schalter bzw. ohne Fahrbahn im Lauf die Seite von vorher; I1 Konsole sauber. Beleg `audit/autobahn-fahrbahn/ui/w2-fahrbahn-station-1440.png` |
| `npm run build` | grün (260/260 Shell-Prüfungen) |
| `npm run budget` | eagerJs 110,2 KB (Ratsche 110 → 111), totalJs 1 928,4 KB (1 912 → 1 932), von Hand mit Notiz angehoben (Jan 30.09.); eagerCss 2,4, largestChunk 278,4 unverändert. Diese Phase liegt bis auf drei Schalter-Zeilen im lazy Autobahnwetter-Pfad |

**Fünf Fragen vor dem Gate:** 1 Funktionserhalt — ohne Schalter ist die Seite byte-gleich in Wort und Zahl (W4/W5), die Streckenprognose läuft ohne Tabelle wie bisher (`verify:road-fc` C/J: Kopf `surface.mode none` mit Grund). 2 Desktop — keine Layout-Änderung außer den Kacheln hinter dem Schalter. 3 Touch-Ziele — unverändert (dieselben Kacheln und Reiter). 4 Konsole — `verify:road-ui` I1. 5 Long Tasks — kein neuer Rechenpfad im Browser (die Reihen kommen fertig aus der Datei).

### 5.4 Nachtrag: `verify:road-ui` im geteilten Arbeitsbaum (26.10., 14:30–15:30 UTC+1)

Der volle Lauf bricht in Abschnitt M (Dock-Zeilen) mit `Cannot read properties of undefined (reading 'querySelector')` ab —
vor W. Ursache ist nicht diese Phase: `src/road/RoadDock.tsx` wurde um 14:13 von einer fremden Linie geändert (Dock in
`roads`/`layers` geteilt, die Autobahnliste liegt jetzt unter `.aw-roads`, nicht mehr unter `.aw-dock`), und der Verifier
sucht `.aw-dock .aw-road`. Diese Linie muss ihren Verifier nachziehen; FB fasst M nicht an. Belegt wurde W deshalb mit
einer Scratch-Kopie des Verifiers (Kopf mit Fixtures und Helfern + Abschnitt W + I1, Datei nach dem Lauf gelöscht):
**15/15** (14 Prüfungen des Kopfs + W1–W5 + I1), Protokoll im Sitzungs-Scratchpad `road-ui-w3.log`. Zwei eigene Fehler
dabei behoben: die Erwartung an +6 h (der Fixture-Lauf beginnt 07:00, „jetzt" ist 08:12 ⇒ Vorlauf 7, hinter dem Horizont,
Kachel fällt korrekt auf „Luft" zurück) und eine doppelt maskierte Regex in der Punktzählung des Verlaufs.

Nach E-FB-10 (Schalter an) wiederholt: W1 öffnet die Seite jetzt OHNE Parameter und sieht die Fahrbahn, W4 prüft den
Rückweg `?rsfc=0` — wieder **15/15** (`road-ui-w4.log`, Screenshot in `ui/` erneuert). `npm run typecheck`/`npm run build`
sind seit 15:43 durch eine weitere fremde Änderung blockiert (`src/sea/SeaReadout.tsx`, TS2367); `tsc` meldet keinen Fehler
in Dateien dieser Phase, `vite build` allein läuft durch, Budget unverändert grün.

### 5.5 Entscheidung E-FB-9 und E-FB-10

**Jan, 26.10. nachmittags: eingeschaltet (E-FB-10).** `ROAD_SURFACE_LIVE = true` im Arbeitsbaum; `verify:road-surface` A7
und `verify:road-ui` W1/W4 prüfen jetzt die Vorgabe AN und den Rückweg `?rsfc=0`. Live wird es mit Jans Push von `main`
UND der Kopie der Tabelle ins Daten-Repo (§77) — ohne Tabelle trägt kein Lauf die Reihen, und die Seite zeigt weiter „Luft".
**Tabelle im Daten-Repo (Jan, 26.10. ≈ 15:55 UTC+1: „das kannst du gerne machen"):** Commit `8e1f4ce18` auf `main` von
`buscosun-data`, `road/fc/v1/static/surface.json` (12 993 B, SHA-256 `6f3d60f4e1e2…`, auf raw.githubusercontent nachgeprüft);
Weg nach V-WL-20 (detach → cherry-pick → push HEAD:main), der erste Versuch auf dem alten Stand wurde vom Spiegel-Takt
abgewiesen. Wirksam wird sie mit dem Push von `buscosun-web/main` (der `road-fc`-Job klont `main`).
Welcher Stand von buscosun Fusion hinter dem Backtest steht: die archivierten Läufe 04.–25.10. wurden mit dem jeweils
aktuellen Stand gebaut — 11 Läufe Fusion 8 (04./05.10., ohne Anker), 36 Läufe Fusion 9 (06.–10.10., mit Anker), 87 Läufe
Fusion 12 (10.–21.10.), 18 Läufe Fusion 13 (23.–25.10.). FB-1 hängt nur an der Luft der Strecke (`t`), Bewölkung, Wind
und Niederschlagswahrscheinlichkeit des Laufs; die Fit-Tabelle mischt also die Stände, die Produktion rechnet auf Fusion 13.

Der ursprüngliche Vorschlag (vor Jans Entscheidung) — **Schattenbetrieb:** Tabelle ins Daten-Repo kopieren und `main` pushen ⇒ der stündliche Lauf schreibt `rs rk rq` in jede Lauf-Datei und das Archiv sammelt die LIVE-Fahrbahnprognose je Station (E-FB-8) — die Seite zeigt nichts (`ROAD_SURFACE_LIVE = false`), `?rsfc=1` zeigt es zur Sichtprüfung. Im Dezember (erste Frostnächte, ≥ 100 Ereignisse) neue eingefrorene Regel: Bewertung der LIVE-Prognosen aus dem Archiv gegen die Messung (kein Replay nötig), Tabelle aus den letzten 14 Tagen vor dem Fenster (V-FB-1), dann Gate D-T und D-K zusammen. Nicht einschalten ist die Alternative; dann bleibt die Zeile „geplant" und der Dezember-Test braucht ein Replay.

## 6. Offen (V-FB)

| Nr. | Was | Mehrwert | Skizze |
|---|---|---|---|
| V-FB-1 | Nachfit der Tabelle je Monat (E-FB-6) | Tagesgang folgt dem Sonnenstand; Frostnächte ab Dezember | `road-surface-backtest.mjs --table` auf dem Archiv, Kopie ins Daten-Repo; später im Archiv-Job |
| V-FB-2 | Gefahren-Leiste: abgeleitete Fahrbahn statt Luft-Proxy (E-AW-40) | Reif-/Glätte-Stufe folgt der Fahrbahn, nicht der Luft | nach grünem D-K: `reifProxy`/`persist` lesen `rs`/`rk` des Laufs |
| V-FB-3 | AT/CH-Prognosepunkte (TAWES/SwissMetNet als Anker) | „DACH" in der Zeile wird wahr | eigene Phase; Korridore AT/CH fehlen auch in der Streckenprognose |
| V-FB-4 | Achspunkte mit der Anomalie der nächsten Anlage (≤ 10 km, gleiche Höhenklasse) | genauere Fahrbahn zwischen zwei Anlagen | im Backtest als Variante „L" messen (Leave-one-out), wie V-AW-21 |
| V-FB-5 | Nässe-Gedächtnis: gemessene Nässe hält in der Prognose 1–2 h an | „nass" nicht nur bei erwartetem Niederschlag | Trocknungszeit aus dem Archiv (Wasserfilm-Verlauf) fitten |
| V-FB-6 | Datenprüfung: 20 Anlagen mit \|Fahrbahn − Luft\| > 6 K im Mittel, E774 meldet Fahrbahn 54–74 °C bei Luft 2–22 °C (138 Paare), E237 +28 K, H637 −39 K — die harten Regeln (`roadAir` relativ zum Nachbar-Band, V-AW-62) lassen sie durch | Fühler, die jede Prognose und jede Klasse verfälschen, fliegen aus Seite und Fit | Regel „Fahrbahn − eigene Luft über 15 K bei Luft > 0 °C und ohne Sonne" oder ein Tagesmittel-Vergleich mit den Nachbarn; Liste der 20 im Bericht |
| V-FB-7 | Abklingen: ein Gewicht je Vorlauf fittet auf e^(−h/4) zurück — die Form ist nicht das Problem, der Drift der Klimatologie ist es (Bias +0,19 … +0,42 K nach zwei Wochen) | Gate D-T erreichbar | Tabelle rollierend aus den letzten 14 Tagen (V-FB-1) oder ein Trend-Term je Tag im Fit; Alternative: Anomalie gegen die Klimatologie der LETZTEN Tage statt des Fensters |
| V-FB-8 | Nacht +1 h: reine Persistenz 0,37 K gegen FB-1 0,53 K — im Strahlungsfall ist die Fahrbahn eine Stunde lang ihr eigener bester Prädiktor | Frostnächte sind der Anwendungsfall | Gewicht je Vorlauf UND Tag/Nacht (zwei Spalten), im Dezember an frischen Daten messen |
