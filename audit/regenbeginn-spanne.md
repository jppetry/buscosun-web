# Regenbeginn als Spanne — Phase RB (Diagnose, 09.10.2026)

Auftrag (Jan, 09.10.): Im Regenradar am gewählten Ort statt „Regen in 12 min" ein **Zeitfenster** nennen — 0–2 h aus
dem Radar-Nowcast und seiner Unsicherheit, danach aus buscosun Fusion (Stufe `fs`, stündliche Regenwahrscheinlichkeit
und Spanne). Regnet es, dasselbe für das Ende; bleibt es trocken: „Kein Regen bis …". Großer Satz ganz oben im
Readout (mobil: Reiter „Schnellblick"), schmale Zeitleiste mit weich auslaufendem Band und „jetzt"-Marke, Chip mit
Sicherheit + Quelle, ehrlicher Text bei breitem Fenster, Label am Ortsmarker. Hinter einem Flag; buscosun Fusion
unverändert.

## 1 Was es schon gibt (am Code geprüft)

| Baustein | Ort | Was er tut | Für RB |
|---|---|---|---|
| Hero „Schnellblick" (Readout oben) | `nowcast/NowcastDeck.tsx` `Hero`, Zustand `nowcastView.ts` `heroState` | „In 23 Minuten Regen. Beginnt ~14:05 · endet ~14:40"; „Es regnet gerade … danach 40 min trocken 14:40–15:20"; „Trocken. Kein Regen in den nächsten 6 Stunden"; jenseits 2 h „Später evtl. Regen" | **Punktwert, keine Spanne, keine Wahrscheinlichkeit.** Der Ort für den neuen Satz; bleibt erhalten (Funktionserhalt) |
| Mobil „Schnellblick" | `NowcastDeck.tsx` `GlancePanel` | dieselbe Aussage, kürzer | Ort für mobil |
| Nowcast-Serie 0–6 h | `nowcastEngine.ts` `assembleNowcast` | 15-min-Schritte: Radar ≤ 90 min, Überblendung 90–150 min, danach buscosun Fusion (`pointSource: 'cube'`) — **nur der Mittelwert `precipitation`**; `mmHMin/Max` ist ein GESETZTES Band aus einer Heuristik-Konfidenz | trägt keine Wahrscheinlichkeit; Band nicht verwendbar |
| Punkt-Streifen | `radar/PointStrip.tsx` (eingeklappt unter „Punktabfrage & Datenqualität") | „Regen beginnt in 12 min", Balken 0–120 min, Chip „Regenchance x % · 60 min" | Minutenwert; PoP nur als Spitze |
| **Ensemble-PoP am Punkt** | `radar/pointPoP.ts` → `ml/flowEnsemble.ts` | Horn–Schunck-Fluss aus „jetzt" + 5 min, 15 Member (Tempo ×0,7…1,3, Richtung ±12°), P(nass) je 5-min-Lead | **die Radar-Unsicherheit existiert — nur DE (RADOLAN-RV)**; Member-Design gesetzt, Kalibrierung nur synthetisch (`verifyEnsembleCalibration`), nie an echten Radarläufen gemessen |
| **Regenwahrscheinlichkeit der Fusion** | `dashboard/model/build.ts` `pWetOf` (aus `cube.v2`, `exceedance(dist, 0)`) | P(Niederschlag > 0) je Stunde, Fusion 8 nachkalibriert (`precipCal`) nicht eingeschaltet, Hürde gelernt | **existiert**, wird im Regenradar nicht gelesen; `buildNowcast` holt den Cube schon (`fc.cube.v2` liegt vor) |
| Ortsmarker | `MapView.tsx` ≈ Z. 1347 | blauer Standard-`maplibregl.Marker`, im Profil ziehbar | **kein Label** |
| Benachrichtigung | `nowcastAlerts.ts` | „Regen ab ca. HH:MM" (Minutenwert) | unberührt |

**Fazit:** Keine Spanne, kein Sicherheits-Chip, keine Zeitleiste mit Band, kein Marker-Label vorhanden. Die zwei
Rohstoffe (Radar-Ensemble DE, Fusion-pWet) sind da und werden nur genutzt, nicht verändert.

## 2 Wie man ein ehrliches Fenster bekommt

**Radar 0–2 h (DE) — Plan vor der Messung, durch E-RB-5 ersetzt (V-RB-4).** Aus `advectEnsembleProb` nur den Punkt brauchen: je Member die erste Minute, in der der Ort nass
wird (First-Passage). 15 Beginn-Zeiten ⇒ Fenster = Quantile q25–q75 (bzw. q10–q90), Sicherheit = Anteil der Member, die
im Horizont überhaupt nass werden. Das ist ein additiver Ableger (neue reine Funktion neben `pointPoPSeries`), kein
Eingriff in das Ensemble. Ende des Regens genauso (erste trockene Minute je Member). **Grenze:** das Ensemble streut nur
die Verlagerung, nicht Wachstum/Zerfall ⇒ es ist zu scharf (übersicher), Größe unbekannt, Provenienz `set`.

**Radar AT (INCA) / CH (rzc).** Kein Ensemble. AT: INCA-Extrapolation bis 3 h — Fenster nur mit gesetzter
Zeitunschärfe (z. B. ±(5 min + 20 % des Vorlaufs)), gekennzeichnet `set`. CH: rzc ist ein einziges Analysebild ohne
Nowcast ⇒ ab „jetzt" nur buscosun Fusion.

**buscosun Fusion jenseits des Radars.** Je Stunde p_h = P(nass) (Hürde der Verteilung). Stunden sind nicht
unabhängig, eine Beginn-Verteilung ist daraus nicht exakt. Ehrliche Lesart: Fenster = zusammenhängender Block um die
erste Stunde mit p_h ≥ 50 %, Ränder dort, wo p_h unter 30 % fällt; Sicherheit = max p_h im Block; Stundenauflösung,
Text in vollen Stunden („wahrscheinlich heute 17–19 Uhr"). Kein Block ≥ 50 %, aber p_h ≥ 30 % ⇒ „Regen möglich
(40 %) ab 17 Uhr". Alle p_h < 20 % bis zum Horizont ⇒ „Kein Regen bis 16 Uhr" (Horizont = letzte Stunde, die noch < 20 %
ist). Schwellen 20/30/50 % sind **gesetzt**; messbar am Archiv (Brier/Reliability der Hürde gibt es seit §6l).

**Breite ⇒ Text.** Fensterbreite > Schwelle (Radar > 45 min, Fusion > 3 h) oder Sicherheit < 50 % ⇒ „Beginn unsicher,
zwischen 14 und 15 Uhr" statt Minuten; Minuten nur bei Radar, gerundet auf 5 min.

## 3 Entscheidungen (Jan, 09.10.2026 — jeweils die Empfehlung)

| Nr. | Frage | Entscheidung |
|---|---|---|
| E-RB-1 | Radar-Fenster 0–2 h | zuerst: Ensemble DE + gesetzte Unschärfe AT — **durch E-RB-5 ersetzt** (V-RB-4) |
| E-RB-2 | Horizont | 24 h (Fusion-Teil), Zeitleiste 2 h bei Radar, sonst 24 h |
| E-RB-3 | Verhältnis zum Hero | neuer Block oben, Hero bleibt darunter unverändert |
| E-RB-4 | Schwellen 30/50/20 % | gesetzt starten, gekennzeichnet, später am Archiv messen (V-RB-3) |
| E-RB-5 | Radar DE nach V-RB-4 | Mitte = Minute der DWD-RV-Extrapolation (dieselbe wie im Hero), Spanne = Tempo-Unsicherheit ×0,85…×1,15 (mittlere Hälfte der Tempo-Member des Ensemble-Designs) ⇒ t/1,15 … t/0,85; Sicherheit = P(nass) von buscosun Fusion in der Stunde des Fensters; Richtung nicht erfasst (benannt) |
| E-RB-6 | AT (INCA) | dieselbe Regel wie DE |

## 4 Umsetzung (09.10., uncommitted, Schalter `?rb=1`, voreingestellt aus)

- `src/nowcast/rainWindow.ts` — rein, ohne Importe: `computeRainWindow` (Beginn / Ende / trocken / Regen hält an / keine
  Aussage), Texte in Europe/Berlin („heute/morgen/Wochentag", Mitternacht als „24"), `radarSpeedWindow`, `bandGeometry`,
  Schalter `rainWindowEnabledFrom`. Ehrlichkeit: Sicherheit < 50 % oder Fenster > 45 min (Radar) / > 3 h (Fusion) ⇒
  „Beginn unsicher, zwischen … und … Uhr"; nur Rand erreicht ⇒ „Regen möglich ab …".
- `src/nowcast/rainWindowRadar.ts` — Minute am Punkt aus den Frames des Stacks, den die Karte schon hält
  (`sampleRadarPoint`, 0,1 mm/h, Laufalter auf „jetzt" verschoben); rzc ⇒ nur „nass jetzt". Kein Fluss, kein Ensemble.
- `nowcastEngine.ts` (`buildNowcast`) — nur mit `?rb=1`: Cube-Anfrage 25 statt 8 h, `Nowcast.fusionPWet` =
  `exceedance(dist, 0,1)` je Stunde aus `cube.v2` (nur gelesen, wie `pWetOf` im Dashboard); die Engine bekommt weiter
  nur die ersten 8 h. Ohne Schalter Anfrage und Reihe wie vorher (G7). Mit Schalter kann der Cube für die ersten 8 h
  eine andere Stufenmischung liefern als mit `hours: 8` (Fenster über t1 hinaus) — benannt.
- `RainWindowCard.tsx` + `rainWindow.css` — Satz, Chips (Sicherheit mit Erklärung im Tooltip, Quelle mit Setzungen),
  Zeitleiste mit weich auslaufendem Band (Fenster = Kern, ⅓ Breite Auslauf je Seite, rein visuell), „jetzt"-Marke;
  mobil nur über `@media (max-width: 767px)`.
- `NowcastDeck.tsx` — Desktop über dem Hero, mobil oben im Schnellblick; Fenster für den Ort der Seite.
  `NowcastRadarMap.tsx` meldet den Stack (`onRadarStack`) und rechnet das Marker-Label für den Punkt am Marker (kann vom
  Ort der Seite abweichen, wenn auf die Karte getippt wurde). `MapView.tsx` — Prop `profileMarkerLabel`, nur im Profil,
  ohne Prop kein Element. Alte Karte `?rr=legacy`: kein Label (benannt).
- buscosun Fusion unverändert: `git diff HEAD -- src/pointForecast src/point` leer.

**Gates:** `verify:rain-window` **55/55** (neu; Blöcke A–G, Gegenproben B5c/C7b/G8/G9b), `verify:regenradar-profile`
35/36 (C1b = Phasenwache vor V-FR-11, wird mit V-FR-11 in HEAD zwangsläufig rot, `precipComposite` unberührt),
`verify:precip-sums` 57/0/2⊘, `verify:dashboard` 80/80, `verify:fusion-release` 28/28, typecheck 0, Build 255/255,
Budget grün: eagerJs 109,3 / 109,4 unverändert, totalJs 1 638,8 / **1 640** (angehoben mit Notiz, +4,4 KB lazy).
**Browser** (Vorschau, München, 09.10. ≈ 10:45 UTC): Desktop „Regen möglich ab 23 Uhr · möglich · 32 % · buscosun
Fusion", Label „Regen mögl. 23–24 Uhr", Hero „Trocken." darunter; mobil (iframe 390 × 844) Karte oben im Schnellblick;
ohne `?rb=1` 0 Karten, 0 Labels, Hero da; Konsole ohne Fehler. Nicht gesehen: ein Radar-Fenster am echten Regen
(es regnete nirgends nahe München) — Real-Device und ein Regentag offen.

**Selbstverifikation:** (1) Funktionserhalt: Hero, Punkt-Streifen, PoP-Chip, Summen unverändert, alles additiv;
(2) Desktop ohne Schalter: keine neue DOM-Ausgabe (0 `.rb-card`), Request unverändert; (3) Touch: die Karte hat keine
Bedienelemente; (4) Konsole sauber; (5) Long Tasks: der Radar-Teil ist eine Punktabfrage je Frame (< 20 ms, E4).

## 5 Befunde

- **V-RB-1** Das Flow-Ensemble ist nie an echten Radarläufen kalibriert (nur synthetisch). Mehrwert: die Spanne würde
  ehrlich statt zu scharf. Skizze: Hindcast über die Rückblick-Frames `rv-past` (NP-0a, 2 h) — Beginn-Quantile gegen
  den gemessenen Beginn.
- **V-RB-3** Schwellen der Fusion (30/50/20 %) und Tempo-Spanne (×0,85…1,15) sind gesetzt. Mehrwert: belegte statt
  angenommene Fenster. Skizze: am Punktarchiv (Hürde je Stunde, Brier/Reliability vorhanden) die Trefferquote „Beginn im
  Fenster" je Vorlauf zählen; Radar-Spanne an `rv-past` gegen den gemessenen Beginn.
- **V-RB-4** Das Flow-Ensemble (`ml/flowEnsemble.ts`, auch der Chip „Regenchance 60 min") sieht herannahenden Regen
  kaum: am synthetischen, texturierten Zug (3 Zellen/5 min) schätzt Horn–Schunck im Echo 48 % der wahren Verlagerung, am
  trockenen Ort davor 15 %; 0 von 15 Membern erreichten den Ort, obwohl die Extrapolation 75 min sagt; 150–375 ms
  Hauptthread (`verify:rain-window` Block D, Messung). Mehrwert: der PoP-Chip unterschätzt Regen, der auf den Ort zuzieht.
  Skizze: Advektion mit dem echogewichteten Vektor stromauf statt dem Fluss am Zielpunkt, mehr HS-Iterationen oder
  Pyramide; im Worker. Nicht angefasst (außerhalb des Auftrags).
- **V-RB-5** Richtungsunsicherheit fehlt in der Radar-Spanne (ob der Rand den Ort überhaupt trifft). Skizze: Frames
  seitlich versetzt abtasten (±12° × Abstand), Anteil der Treffer als zweiter Sicherheitswert.
- **V-RB-2** Der Hero nutzt das gesetzte Band `mmHMin/Max` der Engine nicht, die 6-h-Summe nennt es seit NS nicht mehr —
  das Band ist im Readout tot. Mehrwert: weniger Scheinpräzision im Code. Skizze: nach RB prüfen, wer es noch liest.
