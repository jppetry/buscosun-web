# F10 — Abteilung „Gelände & Downscaling“: Kandidat K2 Nachbar-Dämpfung

> Zweig `f10/terrain` (Worktree `C:\dev\buscosun-web-wt\f10-terrain`), 07.10.2026, 60-Minuten-Budget. Alle Zahlen hier sind
> Pre-Screen-Hinweise (`scripts/fusion10/prescreen.mjs`, Entwicklungsmenge, Schnellmenge), keine Prüfstand-Maße.

## 1 Diagnose (Rolle B: Punkt ohne eigene Station und Messung)

- Der Nachbar steht in Rolle B zweimal ein (`scripts/pruefstand/lib/replay.mjs:124-132`): sein **Stationsprodukt** nur bei
  ≤ 15 km UND (|Δh| ≤ 100 m oder ≤ 0,25 km) (`src/point/client/resolve.ts:55-66` SELECTION), seine **Messung immer** mit
  `distanceM = an.km·1000` und seiner eigenen Höhe (Median 21,6 km; CH Median |Δh| 443 m).
- **T-Anker** (`src/pointForecast/cubeSource.ts:1400-1411`): Paar = (Messung des Nachbarn + Standard-Lapse·Δh, Cube-Wert
  AM PUNKT). Der „Versatz“ enthält also die echte räumliche Differenz Nachbar − Punkt (nachts Kaltluftsee, Hangwind), nicht
  nur den Modellfehler. Gewicht nur `spatialWeight` (`leadTimeWeights.ts:211-217`, Lorentz-Form, D_REF 20 km, H_REF 200 m):
  20 km ⇒ 0,5, 40 km ⇒ 0,2 — langsam. Der Term wirkt linear über `fraction = max wsp` (`anchor.ts:60,74`). Fusion 7 hat
  das für Wind erkannt und mit e^(−(d/10 km)²) zusätzlich gedämpft (`cubeSource.ts:1409-1410`); T blieb ausgenommen.
- **Stationsmember** (`cubeSource.ts:1188-1200`): MOSMIX-L des Nachbarn mit σ = `memberSigma` sys-only — ohne jede Abhängigkeit
  von d oder Δh; es zählt in der Minimum-Varianz-Kombination (`fuse.ts:375-382`) wie ein Produkt am Punkt. Bei 15 km / 100 m
  ist das in der Nacht nicht repräsentativ (Beleg: Rolle A 0,72 K gegen Rolle B 1,49 K bei 0–6 h, Rohzelle 1,45 K).
- **Stationswert** (`stationValue.ts:139`, Tabelle `9d22ff35986f-stack.json` `range` 5 km / 50 m): greift in Rolle B praktisch
  nie ⇒ kein Hebel hier.
- Das 0–6-h-Fenster ist immer Nacht (Ausgabe ≈ 23/00 UTC) — genau dort ist die horizontale Repräsentativität am geringsten.

## 2 Varianten

| | Eingriff | Erwartung |
|---|---|---|
| A (`neighbourDamp: 1`) | T-Anker einer Nachbarmessung zusätzlich mit e^(−(d/15 km)²)·e^(−(Δh/200 m)²) (Vorbild Fusion 7) | 0–6 h T näher an der Rohzelle + Lernstufe; Rolle A unverändert (Faktor exakt 1) |
| B (`neighbourDamp: 2`) | σ(T, Td) des Stationsmembers ⊕ (0,08 K/km·d) ⊕ (0,6 K/100 m·Δh) in Quadratur | Cube-Member gewinnt Gewicht bei 5–15 km; 6–24 h T/Td; Rolle A unverändert (Pfad nur bei d > 0 oder Δh ≠ 0) |
| A+B (`neighbourDamp: 3`) | beides | — |

Gebaut: EINE temporäre Option `FuseCubeOptions.neighbourDamp` (Wert wählt die Variante, Voreinstellung aus ⇒ der Hook läuft
nicht ⇒ byte-gleich zu Fusion 9 = benannter Rückfall), Konstanten `NEIGHBOUR_DAMP_T_KM` 15, `NEIGHBOUR_DAMP_DH_M` 200,
`NEIGHBOUR_STATION_SIGMA_T_PER_KM` 0,08, `NEIGHBOUR_STATION_SIGMA_T_PER_100M` 0,6 (Setzungen), Stufen-Notiz `neighbourDamp:set`.
`prescreen.mjs`: `--lands=1` (Vergleich je Land) und `--opts` in entspannter Form (PowerShell-Falle des Koordinators).

## 3 Pre-Screen (Skill 1 − CRPS_Variante/CRPS_Fusion 9; „+“ = besser; [Tage besser/schlechter]; nur T/Td ändern sich, ws/gust/precip/wet/clct überall exakt 0,00 %)

**Schritt 1 — 4 Tage (16./19./22./25.09.), Rolle B, alle Länder:**

| Variante | T 0–6 | T 6–24 | T 24–48 | T 48–120 | Td 0–6 | Td 6–24 | Td 24–48 | Index (99 Zellen) | DE · AT · CH |
|---|---|---|---|---|---|---|---|---|---|
| A Anker-Dämpfung | −0,41 % [1/3] | −0,19 % [0/4] | −0,05 % [2/2] | 0 | 0 | 0 | 0 | −0,02 % | −0,00 · +0,03 · −0,08 % |
| B σ Stationsmember | +0,17 % [3/1] | +0,60 % [4/0] | +1,10 % [4/0] | +0,64 % [3/1] | +0,30 % [3/1] | +0,30 % [4/0] | +0,15 % [3/1] | +0,12 % | +0,06 · +0,33 · −0,04 % |

Je Land, Variante A, T: 0–6 h DE −0,01 / AT +1,16 / CH **−2,06 %** [0/4]; 6–24 h DE +0,01 / AT +0,03 / CH −0,58 %. Die
Nachbarmessung HILFT in CH als T-Anker (Lesart: im Tal trägt die Nachbarstation den Kaltluftsee, den die Zelle nicht hat; die
Lapse-Korrektur stimmt nachts zwar nicht, aber der Versatz ist dennoch informativ) — Variante A verworfen, A+B nicht gerechnet.

Je Land, Variante B, T: 0–6 h DE +0,45 / AT +2,37 / CH **−1,77 %** [0/4]; 6–24 h DE +0,51 / AT +1,67 / CH −0,10; 24–48 h
DE +0,70 / AT +2,80 / CH +0,14; 48–120 h DE +0,26 / AT +2,13 / CH −0,13. Td: 0–6 h DE +0,35 / AT +1,00 / CH −0,18; 6–24 h
DE −0,08 / AT +0,31 / CH +0,65; 24–48 h DE −0,08 / AT +0,61 / CH +0,09.

Rolle-A-Identität Schritt 1: Variante A überall exakt +0,00 % [0/0]. Variante B zeigte bei 240–336 h T/Td „−0,00 % [0/4]“ —
in Rolle A hat die eigene Station `distanceKm` > 0 oder `elev − hTrue` ≠ 0 (Katalog- gegen Punkthöhe), die Weitung griff
minimal. Behoben: die Weitung greift nur bei d > `SELECTION.stationAtPointKm` (0,25 km, die Projektregel „Station am Punkt“,
E-F-12); Rolle A damit unberührt (Schritt 2).

**Schritt 2 — Variante B mit der Regel „am Punkt“ (d ≤ 0,25 km unberührt), 5 Tage (16.–28.09.; der 7-Tage-Lauf
`k2-v2-schnell` lief beim 50-Minuten-Stopp noch, Zahlen aus den fertigen Tagen), Rolle B:**

| Größe | 0–6 h | 6–24 h | 24–48 h | 48–120 h | 120–240 h |
|---|---|---|---|---|---|
| T alle | **+0,69 %** [4/1] | **+1,02 %** [5/0] | **+1,43 %** [5/0] | +0,79 % [4/1] | +0,08 % |
| T DE · AT · CH | +0,82 · +3,46 · **−1,45** [0/5] | +0,78 · +2,87 · −0,15 | +1,16 · +3,43 · +0,03 | +0,25 · +2,65 · −0,12 | +0,07 · +0,31 · −0,11 |
| Td alle | +0,09 % [3/2] | +0,29 % [5/0] | +0,07 % | −0,06 % [1/4] | +0,01 % |
| Td DE · AT · CH | +0,26 · +0,46 · −0,27 | −0,03 · +0,25 · +0,64 | −0,07 · +0,31 · +0,05 | −0,08 · −0,01 · −0,06 | 0 |

ws, gust, precip, wet, clct: exakt 0,00 % in jeder Zelle (die Option fasst nur T/Td des Stationsmembers an). Index-Näherung
+0,16 % (DE +0,10 · AT +0,42 · CH −0,04 %).

**Rolle-A-Identität Schritt 2:** alle Zellen +0,00 % [0/0] — AUSSER T/Td 240–336 h „−0,00 % [0/4]“ (unter 0,005 %, aber auf
4 Tagen messbar). Rolle A hat demnach Punkte, deren „eigene“ Station > 0,25 km entfernt liegt (Katalogwahl bis 15 km);
dort greift die Weitung. Warum nur im letzten Fenster sichtbar ist, blieb im Zeitbudget ungeklärt (Verdacht: hinter 240 h
trägt der Klimatologie-Schwanz das Stationsmember mit anderer Gewichtung). Die Identität „Faktor 1 bei d = 0“ gilt; die
Behauptung „Rolle A byte-gleich“ gilt nur für Stationen am Punkt. Ohne Option (kein Wert) läuft der Hook nicht ⇒ byte-gleich.

**Empfehlung:** NICHT als Stand integrieren. Richtung stimmt (T 6–48 h +1,0…+1,4 % auf 5/5 Tagen, AT +2,7…+3,5 %), aber
klein, auf Entwicklungstagen gesetzt, CH 0–6 h konsistent schlechter (0/5), Rolle A nicht völlig unberührt und G3 ungeprüft.
Weiterverfolgen über V-F10-T2/T3 (Repräsentativität aus dem Gelände, gefittet, ≥ 30 Ausgabetage) — dann als Kandidat.

**Nachtrag — der 7-Tage-Lauf `k2-v2-schnell` ist nach dem Stopp fertig geworden (16.09.–04.10., Rolle B):** T 0–6 h
+0,99 % [6/1] · 6–24 h +1,23 % [7/0] · 24–48 h +1,66 % [7/0] · 48–120 h +0,93 % [6/1]; je Land T 0–6 h DE +0,75 / AT +4,10 /
CH **−1,04** [1/6], 6–24 h DE +0,67 / AT +3,62 / CH −0,06, 24–48 h DE +0,99 / AT +4,30 / CH +0,11, 48–120 h DE +0,26 /
AT +2,96 / CH +0,01. Td 0–6 h +0,12 · 6–24 h +0,43 [7/0] · 24–48 h +0,14 · 48–120 h −0,05 [2/5]. Index +0,20 % (DE +0,08 ·
AT +0,53 · CH −0,03). Rolle A wie in Schritt 2 (alles +0,00 % außer T/Td 240–336 h −0,00 % [0/4]). Empfehlung unverändert.

## 4 Risiken

- **Auf 4 bzw. 7 Entwicklungstagen getunt** (Schnellmenge, Herbst 2026, Nachtausgaben); die Konstanten sind Setzungen ohne
  Fit. Der Gewinn ist klein (T +0,2…+1,1 %, AT trägt ihn, CH 0–6 h verliert) — Prüfstand-Signifikanz offen.
- Die Spur R (Tresor) kann den Hebel nicht sehen (kein Stationsmember, keine Messung im Hindcast) — ein Abnahme-Beleg kommt
  nur aus Spur P / der Entwicklungsmenge, die zugleich Fit-Grundlage des Stacks ist (Heimvorteil, V-FS-7).
- Variante B ändert die Bandbreite (σ des Members) — G3 (Abdeckung q10–q90) ist mitzuprüfen; die CRPS-Zahl allein sagt nichts
  über die Richtung der Abdeckung.
- CH 0–6 h [0/4] in beiden Varianten: der Nachbar ist dort in der Nacht informativ (Tallage) — eine Dämpfung „blind“ nach
  d/Δh ist für CH die falsche Achse; das spricht gegen ein Einschalten ohne Länder- oder Geländeregel.

## 5 Offene Punkte (Vorschläge)

- **V-F10-T1 — Anker-Paar am richtigen Ort.** Mehrwert: der T-Versatz einer Nachbarmessung enthält heute die echte räumliche
  Differenz (Messung Nachbar − Cube AM PUNKT, `cubeSource.ts:1400-1411`); mit dem Cube-Wert AN DER NACHBARSTATION wäre er
  die Modell-Innovation. Skizze: der Leser holt für jede Messung ≤ 40 km die nächste Cube-Zelle der Messung (gleicher Chunk
  oder `crossChunk`), der Anker rechnet `obs − cube(Nachbar)` und überträgt den Versatz; Archiv-Schema 5 trägt die Zellen
  der Eingabepunkte bereits (PA5) ⇒ am Archiv messbar.
- **V-F10-T2 — Repräsentativität aus dem Gelände statt aus d/Δh.** Mehrwert: CH zeigt, dass Abstand und Höhendifferenz allein
  die Nacht-Repräsentativität nicht tragen; Tallage/TPI/`sinkDepthM` des Punkts UND des Nachbarn (Merkmalstabelle liegt vor)
  sind die physikalische Achse. Skizze: σ_rep = f(|TPI_Punkt − TPI_Nachbar|, Kaltluftsee-Tiefe) je Stunde (Nacht/Tag), aus
  den Paaren Rolle-A-Messung gegen Nachbarprodukt am Archiv gefittet (≥ 30 Ausgabetage), als Tabelle mit Provenienz.
- **V-F10-T3 — SELECTION-Schwelle messen.** Mehrwert: `stationMaxKm` 15 / `stationMaxDElevM` 100 sind Setzungen (PD-D3);
  Variante B zeigt, dass die Minimum-Varianz-Kombination die Distanz braucht. Skizze: am Archiv MAE des Stationsmembers
  gegen die Rohzelle in Klassen (d, |Δh|, Nacht/Tag), Schwelle und σ_rep daraus; dieselbe Tabelle wie V-F10-T2.
