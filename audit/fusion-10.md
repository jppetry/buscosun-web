# Phase F10 — buscosun Fusion 10, autonome Entwicklungssitzung (07.10.2026)

> Auftrag: `prompt-fusion10-autonom.md` (Jan, 07.10.2026). Vier Stunden Wanduhr, Auto-Modus mit den Freigaben 1–6 des
> Auftrags. Dieses Dokument ist Diagnose, Protokoll und Gate-Beleg der Phase in einem (Diagnose-First, CLAUDE.md).
> Alle Zahlen tragen ihre Menge; Zahlen aus Spur R von Fusion 9 (am 05.10. geöffnet) gelten als Kontext (§1.4).

## 0 Zeitprotokoll

| Zeit (UTC) | Phase | Was |
|---|---|---|
| 15:02 | Start | `Get-Date` 2026-10-07 17:02:50 +02:00 = **15:02:50 UTC**; Freeze-Datum (UTC) = **2026-10-07** |
| 15:03 | 0:00 | Vorbedingungen (§1.1), Warm-up `--modus=vergleich --versionen=fusion-8,fusion-9` gestartet |
| 15:09 | 0:07 | Warm-up fertig (W1 fortgeschrieben, 21 Tage, Fusion 8 = Fusion 9 +0,00 %), `audit/fusion-10/laeufe/00-warmup-vergleich.log` |
| 15:25 | 0:23 | Diagnose geschrieben (§1), Pre-Screen-Werkzeug `scripts/fusion10/prescreen.mjs` gebaut und geprüft (1 Tag, 35 s) |
| 15:30 | 0:28 | Kick-off: Portfolio K1–K3 (§2), drei Spezialisten in Worktrees gestartet; Basis-Pre-Screen Fusion 9 (7 Tage) |
| 15:50–16:05 | 0:48–1:03 | Berichte K2 (§3.1), K3 (§3.2), K1 (§3.3) eingegangen; Register-Eintrag n = 10 committet (`a3c118d`) |
| 16:06 | 1:04 | `f10/stat` gemergt (`3f2d002`), Identitätsverifier **11/11** (`laeufe/02-identity-k1.log`) |
| 16:12 | 1:10 | `f10/range` gemergt (`96161d3`, Tag `f10-lauf-1`), **Registrierung `fusion-10`** (Modell `4ec2856339a1`, Spur R sauber), Lauf 1 `--modus=voll --offline` gestartet |
| 16:23 | 1:21 | Lauf 1 fertig: +0,14 % (+0,02 … +0,30), G2 rot (Wind-σ AT/CH) — §3.3 |
| 16:28 | 1:26 | Bündel K1 + K3-AT/CH (`27c9c5e`, `f10-lauf-2`) registriert, Lauf 2 `voll` gestartet |
| 16:36 | 1:34 | Lauf 2 fertig: **+0,69 % (+0,51 … +0,92)**, G2/G3/G4 grün — §3.4 |
| 16:40 | 1:38 | B2-Fix `eac9a43` (`f10-lauf-3`), Neu-Registrierung, **Abnahme gestartet** (einmalig) |
| 16:52 | 1:50 | Build 255/255, Budget rot (1598,6 > 1598) ⇒ Ratsche 1600 mit Notiz; Identität am Abnahme-Commit 5/5 |
| 17:03 | 2:01 | **Abnahme fertig: abgelehnt (G2/G3 rot in Spur R), Index +0,97 % (+0,61 … +1,29)** — §3.5/§6.1 |
| 17:05–17:20 | 2:03–2:18 | Dokumentation (Audit, MANUELLE-SCHRITTE §45, CLAUDE.md), Commit auf `fusion-10` |

## 1 Vorbedingungen und Diagnose

### 1.1 Vorbedingungen

- `git status` zu Beginn (Branch `main`, HEAD `4bdade3`): unter `src/`, `scripts/`, `audit/pruefstand/` **nichts
  Uncommittetes**. Fremd und unberührt: `audit/seewetter/spike/cap/log.jsonl` (geändert, Seewetter-Linie),
  `audit/fusion10-vorbereitung/` und `prompt-fusion10-autonom.md` (untracked, Material dieser Phase). Nichts davon wird
  committet, gestasht oder verworfen.
- `git diff --stat 0ad0615 HEAD -- src/pointForecast src/pruefstand`: 13 Dateien, +901/−60 (Commits `71e5c8e` PS-0,
  `e6f7626`, `18ab8ca` FR-2, `f9ba2d1`, `4bdade3` Seewetter). Unter `src/pointForecast/fusion/` nur `fusionRelease.ts`
  (neu, Register der Stände — Optionsliste der Stufe `fs`, keine Rechnung); `cubeSource.ts` −50/+? (Re-Exporte, Register
  statt Konstanten), dazu `countryOfPoint.ts`/`countryBorders.ts` (Land per Grenze, V-FR-9 — betrifft die Landesparameter
  des Stationswerts!), `fusionForecast.ts`, `pfFlags.ts`, `weatherEnrichment.ts`, `clustering.ts`. **Ob die Branch-Basis
  noch exakt Fusion 9 rechnet, sagt der Prüfstand selbst:** Fusion 9 ist am Commit `0ad0615` registriert; der Replay
  nimmt dafür den Worktree `C:\dev\buscosun-pruefstand\worktrees\fusion-9`, nicht HEAD. Der Identitätsverifier dieser
  Phase (§5) läuft gegen die Branch-Basis `4bdade3`; zusätzlich prüft §5.1, ob `4bdade3` auf den Prüfstand-Fällen
  byte-gleich zu `0ad0615` rechnet (Konserven-Hash des Champions gegen den Dry-Run von HEAD).
- `git -C C:\dev\buscosun-archiv pull --ff-only`: „Already up to date“ (23 Ausgabetage 14.09.–06.10.).
- Prüfstand-Status 15:03 UTC: Protokoll P1 `4b633f0766a7`, Prüfnetz 365 Stationen mit Wahrheit (Rolle B 95: DE 47,
  AT 21, CH 27), W1 `e973c1f31a9f` 1 223 Tage (reif 1 215), Tresor 70 Ausgaben; Champion `fusion-9` (`0ad0615`, Freeze
  2026-10-04, Modell `a371fe086a04`).

### 1.2 Mechanik, am Code geprüft (was ein Kandidat erfüllen muss)

- Replay = `eng.fuseCubePoint(input, { ...reg.options, hourly: true, tail: true })` (`scripts/pruefstand/lib/replay.mjs:120`,
  `:171`); `reg.options` = feste Optionen des Champions + `fusionStage().options` (`run.mjs:68`). Ein neuer Stand ist
  **ein** Eintrag in `FUSION_RELEASES` mit **einer** Option (`fusionRelease.ts:66`); Teilmerkmale sind Konstanten.
- Eingang des Motors im Replay: `learnedClima` = LOSO-Ein-Stations-Produkt der Fit-Tabelle (`archiveAdapter.mjs:228`,
  `losoClimaProduct`) für Rolle B, Stationsprodukt für Rolle A; `clima` = `ClimaField` aus `public/climaGrid.json`
  (`replay.mjs:41`). Der Motor schätzt daraus μ_c je Größe `t, td, u, v, gust, clct, precip` als 13 Koeffizienten
  (Stunde × Jahrestag, `fitClima.ts:11`) — `muAt(climaEst, ms, lon)` (`climaProduct.ts:341`) — und hat je Größe eine
  klimatologische σ (`cubeSource.ts:1096` `sigmaClimaFor`: T aus dem Gitter, Wind `windSigmaAt(h, tpi)`, Rest Setzung).
- Spur R: Hindcast-Slots 00 UTC tragen t1 nur als „Tag 0“ (Vorlauf 1–2 h) und t2/t3 „dyn“ (`ifs_hres`, `aifs_single`,
  ab 2026 auch `icon_eu` in t2); **die Ebenen `<id>_ens` (Schema 6, AX-7) fehlen im Hindcast** — vorhanden sind nur
  `t2m_sd_ens`, `u10_sd_ens`, `v10_sd_ens`, `precip_sd_ens`, `*_q10/q90` (Slot 2024-04-08 und 2026-06-15 geprüft, §1.3).
  ⇒ `ensMember` hat in Spur R nichts zu lesen; auf der Entwicklungsmenge nur ab Slot 30.09. (7 Tage).
- Hindcast außerhalb des Tresors mit t2/t3: **378 Tage 2025-09-08 … 2026-09-21** (täglich, 00/06/12/18 UTC); vor dem
  Tresor (298 Tage bis 2024-03-17) nur t1 „Tag 0“ — kein Langfrist-Fit vor dem Tresor möglich.
- Die Prüfstand-Maße: CRPS_Q über 19 Quantile (`metrics.ts:18`), Brier für „nass“, Tagesmittel je Zelle, gepaarter t-Test
  mit AR(2), Bootstrap, BH. Kernzellen = {t, td, ws, gust ≤ 48 h, precip, wet} × 6 Fenster × {DE, AT, CH} an Rolle B =
  99 Zellen, gleich gewichtet; Spur R trägt 63 (kein 6–24/24–48 h).
- Gates (`protokoll.json`): G2 keine Kernzelle nach BH signifikant schlechter (δ = 0); G3 Abdeckung q10–q90 im Band ODER
  nicht signifikant weiter vom Soll als der Champion; G4 Determinismus, Physik (Td ≤ T + 0,5, Böe ≥ Wind − 0,5,
  Niederschlag ≥ 0), Vollständigkeit, Punktabfrage ≤ 300 ms, Leck; Überanpassungswarnung bei Gewinn A − Gewinn B > 5 %.

### 1.3 Befund: wo Fusion 9 verliert (Entwicklungsmenge, Rolle B, `kennzahlen-fusion9.csv`)

| Zelle (alle Länder) | Fusion 9 CRPS | Klimatologie CRPS | Skill gegen Klima | Abdeckung q10–q90 (Soll 80 %) |
|---|---|---|---|---|
| Wind 120–240 h | 0,972 | 0,830 | **−17,2 %** | 73,6 % |
| Wind 240–336 h | 1,205 | 0,785 | **−53,6 %** | 67,9 %, Bias +0,51 m/s |
| Wind 48–120 h | 0,811 | 0,862 | +5,8 % | 77,9 % |
| T 240–336 h | 2,179 | 2,412 | +9,6 % | 63,1 %, Bias −1,69 K |
| Td 240–336 h | 2,034 | 2,039 | +0,3 % | 78,6 % |
| T 120–240 h | 1,702 | 2,294 | +25,8 % | 67,3 % |
| Böe 120–240 h (Nebenzelle) | 1,881 | 1,624 | −15,8 % | 83,1 % |
| Böe 0–48 h (Kern) | 0,91–1,03 | — | +29…34 % | 87–90 % (zu breit) |
| Niederschlag 240–336 h | 0,0374 | 0,0370 | −1,1 % | 91 % |
| T 0–6 h | 1,143 (MAE 1,49 K) | 2,030 | +43,7 % | 77,8 % — MAE Rohzelle 1,45 K, MOSMIX 0,85 K |

Lesart: In der Langfrist ist die Kette unter der Stationsklimatologie (Wind ab 120 h deutlich, T/Td ab 240 h gleichauf),
die Bänder dort zu schmal (Wind, T) — ein lead-abhängiges Zurückführen auf die Klimatologie plus σ-Skala ist der sauber
in Spur R messbare Hebel (Kernzellen t/td/ws × 3 Fenster × 3 Länder = 27 von 63 Zellen in Spur R). Am Punkt ohne Station
(0–48 h) ist der Hebel größer, aber nur auf der Entwicklungsmenge sichtbar (Fit-Tage des Stacks liegen darin).

### 1.4 Tresor-Kenntnis

Die Spur-R-Zahlen von Fusion 9 (Bewertung Diagramm 1) sind der Sitzung bekannt; Kandidaten werden auf der
Entwicklungsmenge und am Hindcast außerhalb des Tresors gewählt und gefittet. Die Abnahme von Fusion 10 ist deshalb nicht
vollständig blind (Richtung der Hebel bekannt), die Zahlen selbst werden erst in der Abnahme gerechnet. Spur P bleibt der
saubere Richter.

### 1.5 Werkzeug: Pre-Screen außerhalb des Prüfstands

`scripts/fusion10/prescreen.mjs` (neu, nur lesend): rechnet eine Motor-Variante (`--opts`, `--root`) auf den Fällen des
Prüfstands (Schnellmenge = jeder dritte Entwicklungstag; oder Hindcast-Slots außerhalb des Tresors, Tresor-Daten werden
abgelehnt) mit den Bibliotheken des Prüfstands (Protokoll, W1, Replay) und schreibt CRPS_Q/Brier je Fall; `--compare`
zeigt den Skill je Zelle. Es registriert nichts, schreibt nichts nach `C:\dev\buscosun-pruefstand`, entscheidet nichts.
Zahlen daraus sind Hinweise für die Spezialisten; Prüfstand-Zahlen kommen nur aus `run.mjs`.

## 2 Abteilung und Portfolio (Kick-off 15:20–15:30 UTC)

Rollen (Zuständigkeit disjunkt, je eigener Worktree unter `C:\dev\buscosun-web-wt\` mit gemeinsamer `node_modules`-Junction,
Branch `f10/<rolle>` von `fusion-10` @ `6e1c88f`): **Koordination + Verifikation/Red Team** (diese Sitzung, Hauptcheckout,
einzige Rolle mit `run.mjs`), **Statistik & Kalibrierung + Daten** (`f10/stat`), **Gelände & Downscaling** (`f10/terrain`),
**Langfrist (Null-Fit-Varianten)** (`f10/range`). Die Maschine hat **4 Kerne** — Pre-Screens klein halten, der Prüfstand läuft
nie parallel zu einem Hindcast-Replay eines Spezialisten.

| Kandidat | Rolle | Idee | Erwartung / Kernzellen | Messbar in | Risiko |
|---|---|---|---|---|---|
| **K1 Langfrist-Rückführung** | stat | Für Vorlauf > 48 h die fusionierte Verteilung von T, Td, Wind, Böe momentgetreu zur Klimatologie des Motors mischen (μ′ = w·μ + (1−w)·μ_c, σ′ = s·σ_mix), w/s je Größe × Vorlauf-Bin **gefittet am Hindcast außerhalb des Tresors** (2025-09-08 … 2026-09-21, jeder 3. Tag, 00 UTC); reines Modul `fusion/longRange.ts`, Option `longRange: 1`, Identität bei w = s = 1 | Wind 120–336 h (Skill −17/−54 % gegen Klima), T/Td 240–336 h; 27 Kernzellen in Spur R | Spur R **und** Entwicklungsmenge | Klimatologie des Motors (LOSO-μ_c, Gitter-σ) schwächer als die Stationsklimatologie des Prüfstands; Fit-Jahr ≠ Tresor-Jahre; Wind-Klimatologie des Motors = Rice aus (ū, v̄, σ_c) |
| **K2 Nachbar-Dämpfung** | terrain | Rolle B 0–48 h: T/Td-Anker und/oder Stationsmember des Nachbarn nach Abstand und |Δh| dämpfen (Faktor 1 bei d = 0, Δh = 0 ⇒ Rolle A byte-gleich) | T/Td 0–6/6–24/24–48 h (MAE 1,49 K gegen Rohzelle 1,45) | nur Entwicklungsmenge (Spur R hat keine Station/Messung) | Tuning auf 8–23 Entwicklungstagen; Nachweis erst in Spur P |
| **K3 Null-Fit-Fallbacks** | range | Klimatologie-Schritt für Wind/Böe nur ab 120/168 h (`priorShrinkWindFromH`), ggf. feste σ-Inflation Wind ≥ 120 h | Wind 120–336 h | Spur R und Entwicklungsmenge | E-AX-11: ungegatet war der Schritt bei 0–120 h schlechter; nur Fallback, falls K1 nicht rechtzeitig |
| ~~K4 Ensemble-Mittel~~ | — | `ensMember` (AX-7) | — | **nicht messbar in Spur R** (keine `<id>_ens`-Ebenen im Hindcast, §1.2), Entwicklungsmenge nur 7 Tage | verworfen (A-F10-2) |

Rote-Team-Fragen vorab (werden am Ergebnis geprüft): (1) Verbessert K1 nur, weil der Fit die Spur-R-Richtung kennt?
→ Fit nur am Hindcast 2025/26, Tresor-Daten im Fit-Skript abgelehnt; Gegenprobe auf der Entwicklungsmenge. (2) Verliert
K1 bei 48–120 h, wo Fusion noch vor der Klimatologie liegt? → w nahe 1 dort, Bin-weise Veto bei Verschlechterung eines
Landes. (3) Ist K2 nur ein Fit an 8 Tage? → ja, bis Spur P misst; die Freigabe für die Plattform bleibt Jans Gate.
(4) Überanpassung A gegen B? → Prüfstand-Warnung (Marge 5 %).

## 3 Kandidatenprotokoll

### 3.1 K2 Nachbar-Dämpfung (Gelände, `f10/terrain` @ `d680ce4`, Bericht `audit/fusion-10/terrain.md`) — **nicht integriert**

Zwei Varianten gebaut hinter `FuseCubeOptions.neighbourDamp` (aus = Hook läuft nicht): (A) T-Anker des Nachbarn über
Abstand und |Δh| gedämpft (15 km / 200 m), (B) σ des Stationsmembers (T/Td) in Quadratur mit 0,08 K/km und 0,6 K/100 m
verbreitert. Pre-Screen (Schnellmenge, Rolle B, CRPS-Skill gegen Fusion 9; nur T/Td ändern sich, alles andere 0,00 %):

| Variante | Tage | T 0–6 h | T 6–24 h | T 24–48 h | T 48–120 h | je Land T 0–6 h (DE/AT/CH) | Index-Näherung |
|---|---|---|---|---|---|---|---|
| A Anker-Dämpfung | 4 | −0,41 % [1/3] | −0,19 % [0/4] | — | — | −0,01 / +1,16 / **−2,06 %** | — (verworfen) |
| B Stations-σ | 7 | +0,99 % [6/1] | +1,23 % [7/0] | +1,66 % [7/0] | +0,93 % [6/1] | +0,75 / +4,10 / **−1,04 %** [1/6] | +0,20 % (DE +0,08, AT +0,53, CH −0,03) |

Befund des Spezialisten: in Rolle B paart der T-Anker die Messung des NACHBARN (lapse-korrigiert) mit dem Cube-Wert AM
PUNKT (`cubeSource.ts` ~1400–1411) — die „Innovation“ trägt den echten räumlichen Unterschied; der Nachbar-Anker **hilft**
in CH nachts (Variante A dort −2 %). Variante B: Richtung richtig und tageskonsistent (T 6–48 h 7/7 Tage), Gewinn klein,
Konstanten auf 7 Entwicklungstagen gesetzt, CH 0–6 h schlechter (G2-Risiko), **Rolle A mit Option an nicht byte-gleich**
(T/Td 240–336 h −0,00 % an 4 Tagen: Rolle-A-Punkte mit Katalogstation > 0,25 km), G3 nicht geprüft. Rotes Team:
einverstanden — ein Fit an 7 Tage mit einer Verschlechterung in einer Kernzelle ist kein Stand. **Entscheidung A-F10-4:
K2 nicht in Fusion 10; Branch bleibt, V-F10-T1…T3 (§6) übernommen.**

### 3.2 K3 Null-Fit-Fallbacks (Langfrist, `f10/range` @ `966d97b`, Bericht `audit/fusion-10/range.md`) — **Reserve, nicht integriert**

Gebaut (alle aus = byte-gleich): `priorShrinkWindFromH` (Klimatologie-Schritt für Wind/Böe nur ab Vorlauf h),
`priorShrinkWindCountries` (nur an Punkten der gelisteten Länder), `sigmaInflateFromH` (σ T ×1,15, Wind ×1,25 ab h, Setzung).
Pre-Screen (Rolle B, CRPS-Skill gegen Fusion 9; alle Zellen ≤ 120 h und alle Nicht-Wind-Zellen 0,00 %):

| Variante | Menge | ws 120–240 | ws 240–336 | Böe 120–240 (Neben) | je Land ws 120–240 (DE/AT/CH) | Index-Näherung |
|---|---|---|---|---|---|---|
| a/120 | Schnellmenge 4 Tage | +2,0 % | +8,9 % | +7,8 % | **−7,0** / +7,0 / +11,9 % | +0,44 % (DE −0,31) |
| a/120 | Hindcast außerhalb Tresor, 6 Slots 09/2025 | **−8,7 %** | **−6,6 %** | +3,0 % | **−18,0** / +2,5 / +2,3 % | −0,27 % |
| a/120 + b | Schnellmenge 4 Tage | +0,6 % | +7,4 % | — | DE −2,4 | +0,34 % (T 120–336 +0,6/+1,3 %) |

Befunde: (1) `fromH = 120` greift in die Kernzelle 48–120 h (der Vorlauf 120 gehört dazu) ⇒ formales Veto, ab 126 h
(erster nativer t3-Schritt) wählen. (2) Das E-AX-11-Muster wiederholt sich: **DE verliert beim Wind > 120 h in beiden
Mengen**, AT/CH gewinnen deutlich. Der Spezialist empfiehlt die Form „nur AT/CH ab 126 h“. Rotes Team: die Länderwahl ist
**nach** dem Blick auf die Ergebnisse getroffen (4 Tage + 6 Slots) — ein Fit an die Stichprobe mit einem Parameter, der
die Stichprobe teilt; als Stand nur mit eigener Vorab-Regel und eigenem Pre-Screen tragbar. K1 adressiert dieselben Zellen
mit gefitteten Gewichten je Größe und Bin (und kann länderweise geprüft werden) ⇒ **A-F10-5: K3 bleibt Reserve, falls K1
scheitert; dann nur die AT/CH-Form ab 126 h mit eigenem Pre-Screen (Schnellmenge + 6 Hindcast-Slots) vor der Registrierung.**
Nachgeholt vom Koordinator (`k3-atch126*`, Regel vorab: nirgends schlechter, Wind/Böe AT/CH > 120 h besser): **AT/CH ab 126 h**
Schnellmenge 4 Tage ws 120–240 **+5,2 %** [4/0], 240–336 **+10,2 %** [4/0], Böe +6,9/+6,4 %, DE und alle anderen Zellen 0,00 %,
Index-Näherung +0,54 % (AT +0,64, CH +0,98); Hindcast 6 Slots ws +1,1 % [5/1] / +3,65 % [5/1], Böe +4,4/+3,5 % [6/0], Index-Näherung
+0,33 %. Zwei Stichproben, gleiche Richtung — aber die Länderregel wurde nach der ersten Stichprobe gewählt. Als **zweites
Teilmerkmal von Fusion 10** nur, wenn der Volltest mit K1 allein grün ist und der Volltest mit K1 + K3-AT/CH keine Kernzelle
verschlechtert (Interaktionslauf, §3.4).
Offen V-F10-r1…r4 (§6), darunter r3: T bewegt sich unter K3 a um +0,01 %, obwohl nur Wind/Böe den Schritt behalten —
unerklärte Kopplung (vermutlich über die Böe-≥-Wind-Konsistenz oder die Feuchtkugel-Phase, zu prüfen).

### 3.3 K1 Langfrist-Rückführung (Statistik, `f10/stat` @ `af70179`, Bericht `audit/fusion-10/stat.md`) — **integriert, Lauf 1**

Gebaut: reines Modul `src/pointForecast/fusion/longRange.ts` (Bins 49–72/73–120/121–168/169–240/241–336 h, Knoten (48 h, {1, 1}),
linear im Vorlauf; `blendDist` momentgetreu, Identität bei w = s = 1 per Referenz; Familien normal exakt, truncatedNormal /
censoredNormal (Böe) / rice auf Lage und Skala — Abweichung vom Auftrag: die Böe des Motors ist `censoredNormal`, nicht rice),
Hook in `finishStep` nach dem Stationswert (`cubeSource.ts:1680`), `FuseCubeOptions.longRange: 0 | 1` + `longRangeTable`,
Fit-Skript `scripts/fusion10/fit-longrange.mjs` (nur lesend, lehnt Tresor-Daten ab). **Fit:** 32 Hindcast-Slots 00 UTC
2025-09-08 … 2026-09-15 (jeder 12. Tag — jeder 3./6. passte nicht ins Budget bei 4 geteilten Kernen), 700 800 Schritte,
92–184 k Zeilen je Größe × Bin, Gitter w ∈ [0,2; 1] / s ∈ [0,6; 1,8] (0,1, dann 0,05), Ziel mittlere CRPS_Q über die 19
Protokoll-Quantile, Länderregel (kein Land > 1 % schlechter, sonst halb zur Identität) in t 49–120, td 73–120, ws 121–168,
Böe 121–336 angewandt. `audit/fusion-10/longrange-fit.json`.

| Größe | (w, s) je Bin 49–72 · 73–120 · 121–168 · 169–240 · 241–336 | CRPS-Gewinn am Fit-Fenster je Bin |
|---|---|---|
| T | (0,975; 0,9) (0,95; 0,95) (0,9; 0,85) (0,65; 0,9) (1; 1,05) | +0,5 / +1,1 / +0,8 / **+5,8** / +0,1 % (DE 49–168 h −0,4…−0,7 %) |
| Td | (0,9; 0,75) (0,925; 0,925) (0,85; 0,8) (0,55; 0,9) (0,6; 1,05) | +2,7 / +2,5 / +1,8 / **+8,6** / +1,5 % |
| Wind | w = 1; s = 1 / 1,05 / 1,05 / 1,05 / 0,8 | +0,0 / +0,1 / +0,3 / +0,1 / +1,0 % |
| Böe (Neben > 48 h) | (1; 1) (0,9; 0,8) (0,75; 0,875) (0,7; 0,825) (0,8; 0,875) | +0,0 / +0,9 / **+5,9 / +7,0** / +2,8 % |

Befund des Spezialisten: das Wind-Defizit von −54 % (§1.3, Entwicklungsmenge) **erscheint am Hindcast-Fenster nicht** — dort
ist der Fusion-9-Wind nahe optimal (w = 1), V-F10-1; T 241–336 kam mit w = 1 heraus (nicht monoton, V-F10-4). Identität des
Spezialisten: sha256 aller Verteilungen Basis = Worktree ohne Option = Option + Identitätstabelle (`8e1d0ab496e866b0`),
gefittete Tabelle verschieden. **Identitätsverifier des Koordinators (§5.1) 11/11:** Archiv 02./03./04.10. Option aus
byte-gleich zur Basis UND zur Konserve von Fusion 9; Negativkontrolle 1,49–1,51 Mio. Werte verschieden, **ausschließlich
> 48 h**, Größen gust/t/td/ws; Hindcast 2026-06-15 ebenso (1,60 Mio. Werte, nur > 48 h). Rotes Team: Fit-Jahr ≠ Tresor-Jahre
(Saisonalität), LOSO-Klimatologie an Rolle B, DE in t 49–168 h leicht negativ — der Volltest zeigt, ob G2 das trifft.

**Lauf 1 — `--kandidat=fusion-10 --modus=voll --offline`, Register-Commit `96161d3` (Tag `f10-lauf-1`), Modell `4ec2856339a1`,
16:12–16:23 UTC, Bericht `laeufe/03-lauf1-voll/` (Kopie von `audit/pruefstand/berichte/fusion-10/2026-10-07-voll`):**
Entwicklungsmenge 23 Tage (14.09.–06.10.), Konserven 43 (Kandidat 23, Fusion 9 + Referenzen für 05./06.10.), 3 Worker, 631 s.

| Maß | Wert |
|---|---|
| Fortschrittsindex Rolle B gegen Fusion 9 | **+0,14 %** (95 %: +0,02 … +0,30 %), Nachweisgrenze 0,1 % |
| Gates (Hinweise) | G1 grün · **G2 rot** · G3 grün · G4 grün |
| G2 | 3 von 99 Kernzellen nach BH signifikant schlechter: **ws 48–120 AT −0,2 %, ws 120–240 AT −0,9 %, ws 120–240 CH −1,5 %** |
| Beste Kernzellen | td 240–336 CH +7,6 %**, t 120–240 AT +4,2 %**, ws 240–336 CH +3,7 %** |
| Schlechteste (n. s.) | td 120–240 AT −2,5 %, td 48–120 DE −2,1 %, ws 240–336 DE −1,9 % |
| Überanpassung | Gewinn A −0,14 % gegen B +0,14 % ⇒ keine Warnung |
| Produktaussage | 76 von 99 Kernzellen besser als jede Einzelquelle (wie Fusion 9) |
| Warnung | 1 901 589 Werte mit unreifer Wahrheit mitgezählt (Entwicklungsmenge) |

Je Größe > 48 h (Rolle B, DE/AT/CH): T 48–120 −0,7/+0,3/+1,9 · 120–240 −1,0/+4,2/+2,6 · 240–336 +0,6/+0,6/+0,5; Td 48–120
−2,1/−0,6/+0,8 · 120–240 −0,2/−2,5/−1,3 · 240–336 +2,6/−0,7/+7,6; Böe (Neben) 120–240 −1,0/**+19,0**/−6,9 · 240–336 −1,4/+10,7/−6,4;
Niederschlag/nass überall 0,00 (unberührt, wie gebaut). **Lesart:** die T/Td-Rückführung trägt (am stärksten 120–240 h AT/CH
und 240–336 h), die **Wind-σ-Skala des Fits (s = 1,05 bei 73–240 h) ist auf der Entwicklungsmenge signifikant schlecht** —
genau die drei roten Zellen; die CH-Böe verliert als Nebenzelle. Rotes Team: ein roter G2 ist das Champion-Schutz-Gate und der
Zweck des Volltests; die Rücknahme der Windzeile ist eine Entscheidung auf der Entwicklungsmenge und wird als solche deklariert.

### 3.4 Integration: Fusion 10 = K1 (T, Td, Böe) + K3-AT/CH (Wind/Böe-Schritt ab 126 h) — Lauf 2

**A-F10-6:** Windzeile der Tabelle auf Identität (w = s = 1; der Fit hatte für Wind ohnehin w = 1 und Gewinne ≤ 1 %), die
Windwirkung von Fusion 10 kommt aus dem zweiten Teilmerkmal `FUSION10_WIND_SHRINK_FROM_H = 126` /
`FUSION10_WIND_SHRINK_COUNTRIES = ['AT', 'CH']` (greift nur mit `longRange: 1`, explizite `priorShrinkWind*`-Optionen haben
Vorrang; `fusion/longRange.ts`, `cubeSource.ts` ~931). Commit `27c9c5e` (Tag `f10-lauf-2`), Registrierung `--neu` (Modell
`13e11e07096d`, Spur R sauber), Lauf 2 `voll --offline` ab 16:28 UTC, parallel der Identitätsverifier am neuen Commit.
Bekannt vor dem Lauf: `verify:fusion-release` **27/28** — B2 trifft die Stufen-Notiz „(Teilmerkmal von buscosun Fusion 10)“
in `cubeSource.ts:1076` (fester Stand im Text); Korrektur erst nach Lauf 2 (Hauptcheckout ist während eines Laufs tabu),
dann Neu-Registrierung vor der Abnahme (**A-F10-7**).

**Lauf 2 — `--kandidat=fusion-10 --modus=voll --offline`, Register-Commit `27c9c5e` (Tag `f10-lauf-2`), Modell `13e11e07096d`,
16:28–16:36 UTC, Bericht `laeufe/04-lauf2-voll/`:** Entwicklungsmenge 23 Tage, Konserven nur der Kandidat (23).

| Maß | Wert |
|---|---|
| Fortschrittsindex Rolle B gegen Fusion 9 | **+0,69 %** (95 %: **+0,51 … +0,92 %**), Nachweisgrenze 0,4 % — Intervall über 0 |
| Gates (Hinweise) | G1 grün · **G2 grün** (0 von 99) · G3 grün (0 von 27 rot, 17 außerhalb des Bands — wie beim Champion erlaubt per ODER) · G4 grün (Determinismus `d6987a8a59d3` = `d6987a8a59d3`; Physik Böe < Wind − 0,5 0,208 % ≤ Champion) |
| Beste Kernzellen | ws 240–336 CH +20,7 %**, ws 240–336 AT +15,3 %**, ws 120–240 CH +12,2 %** |
| Schlechteste (n. s.) | td 120–240 AT −2,5 %, td 48–120 DE −2,1 %, td 120–240 CH −1,3 % |
| Überanpassung | Gewinn A +0,18 % gegen B +0,69 % ⇒ keine Warnung (B > A) |
| Produktaussage | **80 von 99** Kernzellen besser als jede Einzelquelle (Fusion 9: 76) |

Je Größe > 48 h (DE/AT/CH): T und Td wie Lauf 1 (unverändert); **ws 120–240 0,0/+7,4**/+12,2** · 240–336 0,0/+15,3**/+20,7****
(DE byte-gleich zu Fusion 9, wie gebaut); Böe (Neben) 120–240 −1,0/**+27,4**/−4,1 · 240–336 −1,4/+20,0/−2,3. **Level 1 erreicht**
(Index > 0 mit Intervall über 0, G2–G4 grün, keine Überanpassungswarnung) — auf der Entwicklungsmenge, die Tage der
Stack-Fits enthält und auf der die Wind-Rücknahme entschieden wurde; ein Urteil gibt nur die Abnahme (§3.5).

### 3.5 Abnahme (einmalig, Vollmacht 3)

Nach Lauf 2: B2-Text korrigiert (`eac9a43`, Tag `f10-lauf-3`; Rechnung identisch zu `27c9c5e`), `verify:fusion-release`
**28/28**, `verify:pruefstand` **60/60**, Registrierung `--neu` (Modell `6180c2555392`, Spur R sauber, Notizen zu Freeze,
Bündel und Fit-Fenster). **Abnahme gestartet 16:40 UTC (1:38)** — `--kandidat=fusion-10 --modus=abnahme --offline`, die
einzige Öffnung des Tresors dieser Sitzung (`scripts/pruefstand/register/zugriffe.log`); parallel der Identitätsverifier am
Commit `eac9a43` (`laeufe/07-identity-final.log`). Der Prüfstand nimmt den Motor aus dem lebenden Checkout („src des Commits = src von HEAD, Arbeitsbaum sauber“) ⇒ während der Abnahme keine Änderung unter `src/`. Erwartung vorab (eingefroren vor dem Ergebnis): G1 in Spur P „nicht
nachweisbar“ (leer), Spur R zeigt die Kette ohne Station/Messung — dort wirken nur die T/Td/Böe-Rückführung ab 51 h und der
AT/CH-Windschritt ab 126 h; Kandidat, falls Spur R nicht signifikant schlechter und G2–G4 grün.

**Ergebnis der Abnahme (16:40–17:03 UTC, Bericht `laeufe/06-abnahme/`, `zugriffe.log` Eintrag 16:40:41Z):** Spur P 0 Tage,
Spur R 70 Ausgaben, Entwicklungsmenge 23 Tage (Diagnose). Selbstprüfung bestanden: halbierte Bänder ⇒ G3 rot (12/17),
Rauschen ⇒ G2 rot (50/63), Leck-Modell ⇒ Überanpassungswarnung, **A/A-Irrtumsrate 5,3 % bei nominal 5 %**. G4 grün
(Determinismus Hindcast 2024-04-08 byte-gleich, Physik, Vollständigkeit, Punktabfrage, Leck-Prüfung).

| Maß (Spur R, Rolle B) | Wert |
|---|---|
| **Urteil des Prüfstands** | **abgelehnt — Gate G2, G3 rot** (G1 nicht nachweisbar: Spur P leer) |
| Fortschrittsindex gegen Fusion 9 | **+0,97 %** (95 %: **+0,61 … +1,29 %**), Nachweisgrenze 0,5 % — Rolle A +1,14 % (+0,77 … +1,50), keine Überanpassungswarnung |
| G2 | **1 von 63 Kernzellen** nach BH signifikant schlechter: **t 240–336 h AT −0,44 %** (CRPS 2,1353 gegen 2,1259, p 0,0009, BH 0,028); daneben t 240–336 DE −0,2 % *, CH −0,2 % n. s. |
| G3 | **1 von 17 Zellen rot: ws 120–240 h** Abdeckung q10–q90 **75,7 % gegen 76,4 %** beim Champion (Band 78,3–81,7 %; beide darunter, der Kandidat signifikant weiter weg); 9 Zellen außerhalb des Bands (wie beim Champion: t 0–6 90 %, ws 48–120 73 %, Niederschlag 0–6 97 %, …) |
| Beste Kernzellen | ws 240–336 AT +8,9 %**, ws 240–336 CH +6,6 %**, td 120–240 AT +6,4 %** |
| Produktaussage | 63 von 63 Kernzellen besser als jede Einzelquelle |
| Rangliste (Güteindex gegen Klimatologie, Spur R) | **fusion-10 +18,69 %** · fusion-6/7/8/9 +17,81 % · fusion-5e +15,36 % |

Je Größe (DE/AT/CH): T 48–120 +0,4/+1,6**/+2,4** · 120–240 +0,6/+5,8**/+1,8 · **240–336 −0,2/−0,4!/−0,2**; Td 48–120
+2,7**/+5,8**/+5,0** · 120–240 +4,3/+6,4**/+2,6 · 240–336 +0,7/+2,9**/+2,8**; Wind 120–240 0/+0,6/+0,2 · 240–336 0/**+8,9**/+6,6****
(DE byte-gleich); Böe (Neben) 48–120 +2,1…+2,7 · 120–240 +0,9/+18,4/+5,3 · 240–336 +0,5/+12,3/+3,8. Alle 0–6-h-Zellen 0,00
(unberührt, wie gebaut).

**Lesart (rotes Team):** Der Tresor bestätigt die Richtung — der Fortschrittsindex liegt mit dem ganzen Intervall über 0, die
Rangliste setzt Fusion 10 vor alle Bestandsversionen, und 62 von 63 Kernzellen sind nicht schlechter. Zwei Details reißen das
Protokoll: (1) der **T-Bin 241–336 h** mit w = 1 und s = 1,05 (V-F10-4: der Fit hatte dort keinen Mischgewinn, die σ-Weitung
kostet 0,4 % CRPS in AT — Abdeckung 80,8 → 82,3 %, also zu breit) und (2) der **AT/CH-Windschritt bei 126–240 h** verengt die
Bänder (Breite 3,69 → 3,30 m/s in AT), der CRPS gewinnt dort kaum (+0,6/+0,2 %), die Abdeckung fällt unter die des Champions ⇒
G3. Bei 241–336 h trägt derselbe Schritt +8,9/+6,6 %. **Nach der Abnahme wird nichts geändert** (Leck-Regel des Auftrags);
beide Befunde sind Vorgaben für den nächsten Stand (V-F10-7/8), dessen Tresor-Test in diesen Zellen dann nicht blind ist.

## 4 Entscheidungen im Auto-Modus

| Nr. | Entscheidung | Beleg |
|---|---|---|
| A-F10-1 | Warm-up ohne `--offline` (W1 fortgeschrieben), alle weiteren Läufe `--offline` | Auftrag „Preconditions“ |
| A-F10-2 | `ensMember` (AX-7) nicht verfolgt: der Hindcast trägt keine Schema-6-Ebenen `<id>_ens` ⇒ in Spur R wirkungslos, Entwicklungsmenge erst ab 30.09. (7 Tage) | §1.2, Slot 2024-04-08/2026-06-15 geprüft |
| A-F10-4 | K2 (Nachbar-Dämpfung) nicht in Fusion 10 aufgenommen: Gewinn klein, CH 0–6 h schlechter, Rolle A mit Option an nicht byte-gleich, 7 Entwicklungstage | §3.1 |
| A-F10-5 | K3 (Null-Fit-Schritt für Wind/Böe) nur Reserve: DE verliert > 120 h in beiden Mengen; Länderwahl wäre nachträglich | §3.2 |
| A-F10-6 | Windzeile der Langfrist-Tabelle nach Lauf 1 auf Identität (G2 rot: AT/CH-Wind-σ-Skala); Wind über K3-AT/CH | §3.3/§3.4 |
| A-F10-7 | B2-Text in der Stufen-Notiz nach Lauf 2 korrigiert, Kandidat danach neu registriert (Commit = Modell-Hash) | §3.4 |
| A-F10-8 | Nach der Abnahme nichts geändert (Leck-Regel); die zwei Korrekturen nur als V-F10-7/8 für Fusion 11 notiert | §3.5, §6.1 |
| A-F10-9 | totalJs-Ratsche 1598 → 1600 mit Notiz (Jan 30.09.: Grenzen dürfen angehoben werden) | §5.2 |
| A-F10-3 | Spezialisten arbeiten in Worktrees unter `C:\dev\buscosun-web-wt\` (nicht unter `C:\dev\buscosun-pruefstand`), gemeinsame `node_modules` als Junction dort | Auftrag „Bench discipline“ (Junction-Verbot gilt nur dem Prüfstand-Ordner) |

## 5 Identität und Leck-Prüfungen

### 5.1 Branch-Basis gegen Fusion 9 und Identität der Option

Verifier `scripts/verify-fusion10-identity.mjs` (`npm run verify:fusion10-identity -- --on=<Option>`): Motor der Basis aus dem
abgekoppelten Worktree `C:\dev\buscosun-web-wt\base` (`4bdade3`), Motor des Kandidaten aus dem Hauptcheckout; je
Archivtag (alle 365 Stationen, Rollen A und B wie im Protokoll) drei Prüfungen — Option aus byte-gleich zur Basis, Basis
byte-gleich zur **gespeicherten Konserve des Champions** (Fusion 9 am Register-Commit `0ad0615`), Option an verschieden
(Negativkontrolle, mit Zählung der verschiedenen Werte ≤ 48 h / > 48 h und je Größe); dazu ein Hindcast-Slot außerhalb des
Tresors. Rauchtest 15:31 UTC (`laeufe/01-identity-smoke.log`, Negativkontrolle = `nowcastHourMean:false`): Archiv
2026-10-04 Basis = Kandidat = Konserve `f061a25d79cd` ⇒ **die Branch-Basis rechnet an diesem Tag exakt Fusion 9**
(die Commits nach `0ad0615` haben die Rechnung nicht verändert). Die Negativkontrolle des Rauchtests griff im Archiv
(500 Werte, nur `precip`/`pWet` ≤ 48 h — genau die Radarstunden des Stundenmittels) und erwartungsgemäß **nicht** im
Hindcast (dort gibt es kein Radar ⇒ 4/5, der fünfte Haken ist für `nowcastHourMean` unerreichbar) — das Werkzeug trennt
also die Pfade richtig; für die Fusion-10-Option muss der Hindcast-Haken grün sein (sie wirkt ab 51 h).

**Am Bündel-Commit `27c9c5e` (Lauf 2, `laeufe/05-identity-lauf2.log`): 8/8** — Archiv 03./04.10. Option aus byte-gleich zur
Basis und zur Fusion-9-Konserve (`913875212c0d`, `f061a25d79cd`); Negativkontrolle 1,21/1,24 Mio. Werte verschieden, nur
> 48 h, Größen dd/gust/t/td/ws (dd kommt durch den AT/CH-Klimatologie-Schritt des Windes dazu — Richtung aus u/v);
Hindcast 2026-06-15 ebenso (1,34 Mio. Werte, nur > 48 h). **Am Abnahme-Commit `eac9a43` (`laeufe/07-identity-final.log`): 5/5** (Archiv 04.10. + Hindcast, gleiche Hashes wie oben — der Commit änderte nur einen Notiz-Text).

### 5.2 Gates der Codebasis (Abnahme-Commit `eac9a43`)

| Gate | Ergebnis |
|---|---|
| `npm run typecheck` | 0 Fehler |
| `verify:fusion-release` | **28/28** (B2/B3 nach zwei Korrekturen: Options-Schlüssel aus dem Register im Fit-Skript, kein fester Stand in der Stufen-Notiz) |
| `verify:pruefstand` | **60/60** |
| `verify:fusion10-identity -- --on=longRange:1` | 11/11 (`96161d3`), 8/8 (`27c9c5e`), 5/5 (`eac9a43`) |
| `npm run build` | 255/255 (SEO-Prüfung), 1 min 45 s |
| `npm run budget` | totalJs **1598,6 > 1598** ⇒ Ratsche 1598 → **1600** mit Notiz (Jan 30.09.: Grenzen dürfen angehoben werden); +2,6 KB gegen den SW-Stand (1596,0), alles lazy (`longRange.ts`, Hooks in `cubeSource`, Eintrag im `fusionRelease`-Chunk); eagerJs 109,3 (Ratsche 109,4) unverändert, largestChunk 278,4. Kein Kontrollbau (Kerne beim Prüfstand) — Zuordnung über die geänderten Dateien. Danach „Alle Budgets eingehalten“ |

## 6 Urteil, offene Punkte, V-F10-n

### 6.1 Urteil

**Prüfstand (Protokoll P1, Wahrheit W1, Spur R 70 Ausgaben, Spur P 0 Tage): buscosun Fusion 10 — abgelehnt** (G2 und G3 rot in
Spur R, s. §3.5), bei einem Fortschrittsindex von **+0,97 % (95 %: +0,61 … +1,29 %)** gegen Fusion 9 und Platz 1 der Rangliste.
**Erreichte Stufe des Auftrags: Level 1** — Fusion 10 ist an einem Commit registriert (`eac9a43`, Status kandidat), der
Volltest auf der Entwicklungsmenge zeigt +0,69 % (95 %: +0,51 … +0,92 %) mit G2–G4 grün und ohne Überanpassungswarnung.
**Level 2 nicht erreicht:** die Abnahme sagt „abgelehnt“, obwohl der Index auf Spur R über 0 liegt — eine Kernzelle
(T 240–336 h AT −0,4 %) und eine Abdeckungszelle (Wind 120–240 h) verletzen das Protokoll. Das ist das Protokoll, nicht ein
Werkzeugfehler: die Selbstprüfung bestand (A/A 5,3 %), G4 ist grün. Die Champion-Entscheidung ist Jans, nach ≥ 4 reifen
Spur-P-Tagen (ab 19.10.2026); ohne Änderung bleibt der Kandidat laut P1 abgelehnt, mit den zwei Korrekturen (V-F10-7/8) wäre
der nächste Stand Fusion 11 — mit dem Vorbehalt, dass seine Tresor-Zahlen in diesen Zellen nicht mehr blind sind.

**Was funktioniert hat:** die Langfrist-Rückführung von T und Td (48–240 h, alle Länder, AT/CH signifikant), der
AT/CH-Windschritt bei 240–336 h (+8,9/+6,6 %), die Böe als Nebenzelle in jedem Fenster > 48 h; die Arbeitsteilung (drei
Spezialisten, Pre-Screen außerhalb des Prüfstands, Identitätsverifier mit Konserven-Vergleich); die Prüfstand-Mechanik hielt
(drei Registrierungen, drei Läufe, kein Exit ≠ 0). **Was nicht funktioniert hat:** die Wind-σ-Skala des Fits (G2 rot in Lauf 1),
die σ-Weitung von T bei 241–336 h (G2 rot in der Abnahme), die Bandverengung des Windschritts bei 126–240 h (G3 rot); K2
(Nachbar-Dämpfung) brachte zu wenig; `ensMember` war nicht messbar. **Nächste Schritte:** V-F10-7 (T-Bin 241–336 auf Identität
oder s ≤ 1), V-F10-8 (Windschritt erst ab 241 h oder mit σ-Boden), beides zuerst am Hindcast außerhalb des Tresors nachmessen
(`prescreen.mjs --set=hindcast`), dann als Fusion 11 registrieren; parallel Spur P reifen lassen (19.10.).

### 6.2 Offene Punkte und Verbesserungen (D-28; Mehrwert für Jan, Umsetzungsskizze)

Aus den Spezialistenberichten übernommen (Details je dort):

- **V-F10-1 (stat)** Wind-Langfrist am Hindcast ≠ Entwicklungsmenge. *Mehrwert:* klärt, ob das −54-%-Wind-Defizit (§1.3) ein Artefakt
  der 23 Herbsttage mit Stationsprodukt ist oder ein Winter-/Jahreszeiten-Effekt — entscheidet, ob ein Wind-Fit überhaupt lohnt.
  *Skizze:* `prescreen.mjs --set=hindcast --limit=20` je Bin gegen `ref-klima`, dazu dieselben Zellen auf der Entwicklungsmenge.
- **V-F10-2 (stat)** Fit alle 3 Tage mit 3 Workern statt jedem 12. Tag (32 Slots); w/s je Land (AX-5-Muster). *Mehrwert:* stabilere
  Gewichte, Saisonabdeckung; die DE-Verluste bei T 49–168 h (−0,4…−0,7 %) könnten eine Landesform auflösen.
- **V-F10-3 (stat)** Varianzmodell statt Skala s: s kompensiert heute die Sommer-σ der Lernstufe (V-FV-1); nach dem Winter-Nachfit
  (E-FL-3) neu fitten — dann ist s voraussichtlich ≈ 1.
- **V-F10-4 (stat)** T 241–336 h kam mit w = 1 heraus (nicht monoton zum Bin davor); Interpolation zwischen Binmitten zieht w
  dazwischen. *Skizze:* Monotonie-Nebenbedingung im Fit oder Bin 241–336 an 169–240 koppeln; am Hindcast mit allen Tagen prüfen.
- **V-F10-T1 (terrain)** Anker-Paar am richtigen Ort: der T-Versatz einer Nachbarmessung wird heute gegen den Cube AM PUNKT gebildet
  und trägt die echte räumliche Differenz. *Skizze:* Messung gegen die Cube-Zelle der NACHBARSTATION paaren (das Archiv-Schema 5
  trägt diese Zellen), Innovation dann räumlich übertragen.
- **V-F10-T2 (terrain)** Repräsentativität des Nachbarn aus dem Gelände (TPI, Kaltluftsee-Tiefe, Nacht) statt aus d/|Δh| allein —
  CH zeigt, dass der Nachbar-Anker nachts hilft, obwohl er weit und hoch ist. *Skizze:* Residuen an ≥ 30 Ausgabetagen klassieren,
  σ_rep daraus; dann als Kandidat.
- **V-F10-T3 (terrain)** `SELECTION`-Schwellen (15 km / 100 m) messen statt setzen — dieselbe Tabelle wie T2.
- **V-F10-r1 (range)** Länderform des Langfrist-Schritts für Wind — **in Fusion 10 als Teilmerkmal umgesetzt** (AT/CH ab 126 h);
  offen bleibt die *Erklärung*, warum DE verliert: die Wind-Stationsklimatologie-σ `windSigmaAt(h, tpi)` (`cubeSource.ts:1096`)
  gegen das gelernte Member je Land prüfen.
- **V-F10-r2 (range)** σ-Weitung der Langfrist nur für T (Faktor je Fenster aus dem Abdeckungsdefizit) — entfällt, wenn K1 die
  Varianz fittet (V-F10-3); vorerst nicht.
- **V-F10-r3 (range)** T bewegt sich um +0,01 %, wenn nur Wind/Böe den Klimatologie-Schritt behalten — unerklärte Kopplung
  (Vermutung: `onWeights`/β-Mittelung oder Stationswert `L − M` am Wind). *Skizze:* einen Punkt mit beiden Kontexten rechnen, Diff.
- **V-F10-r4 (range)** Schema-6-Ensemblemittel (`t2m_ens/u10_ens/v10_ens/precip_ens`) für die 378 Hindcast-Tage außerhalb des
  Tresors nachtragen (Open-Meteo `ensemble`-Member-Mittel, dynamical AIFS-ENS analog) — erst dann ist `ensMember` (AX-7) fair
  messbar. Tresor unberührt lassen (neue Spalten nur außerhalb).
- **V-F10-7 (Abnahme)** T-Bin 241–336 h: w = 1, s = 1,05 kostet in Spur R 0,2–0,4 % CRPS (AT signifikant, G2 rot) bei
  Abdeckung 80,8 → 82,3 % (zu breit). *Skizze:* Bin auf Identität setzen oder s ≤ 1 zulassen; Monotonie-Nebenbedingung (V-F10-4).
- **V-F10-8 (Abnahme)** AT/CH-Windschritt bei 126–240 h verengt die Bänder (Breite AT 3,69 → 3,30 m/s), Abdeckung 75,1 → 73,8 %
  bei kaum CRPS-Gewinn (+0,6 %) ⇒ G3 rot; bei 241–336 h trägt er +8,9/+6,6 %. *Skizze:* `FUSION10_WIND_SHRINK_FROM_H` 126 → 241
  oder den Schritt mit einem σ-Boden (Breite nicht unter die des Members) rechnen; am Hindcast außerhalb des Tresors nachmessen.
- **V-F10-5 (Koordination)** `prescreen.mjs --compare` nimmt POSIX-Pfade aus Git Bash nicht an (MSYS wandelt die Kommaliste nicht);
  PowerShell 5.1 streicht die Anführungszeichen eines JSON-Arguments (Form `key:value` ergänzt; Arrays nur per Bash/`\"`).
- **V-F10-6 (Koordination)** Der Volltest zählt 1,9 Mio. Werte mit unreifer Wahrheit mit (Tage 30.09.–06.10.); für Entwicklungs-
  entscheidungen harmlos, für Zahlen in der Doku als Vorbehalt nennen.

### 6.3 Vorschlag P2 (Prüfstand fairer machen, nicht in P1)

MOSMIX-L der nächsten *anderen* Katalogstation als Rolle-B-Referenz (die Vorbereitung nennt es); MAE des Medians neben dem CRPS
in der Produktaussage; die Länder-Zellen von Spur R mit den Hindcast-Quellen je Stufe beschriften (t3 nur `ifs_hres` +
`aifs_single`, ohne Böen-σ) — damit ein Leser weiß, welche Kette er bewertet.
