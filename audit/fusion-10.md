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
Offen V-F10-r1…r4 (§6), darunter r3: T bewegt sich unter K3 a um +0,01 %, obwohl nur Wind/Böe den Schritt behalten —
unerklärte Kopplung (vermutlich über die Böe-≥-Wind-Konsistenz oder die Feuchtkugel-Phase, zu prüfen).

## 4 Entscheidungen im Auto-Modus

| Nr. | Entscheidung | Beleg |
|---|---|---|
| A-F10-1 | Warm-up ohne `--offline` (W1 fortgeschrieben), alle weiteren Läufe `--offline` | Auftrag „Preconditions“ |
| A-F10-2 | `ensMember` (AX-7) nicht verfolgt: der Hindcast trägt keine Schema-6-Ebenen `<id>_ens` ⇒ in Spur R wirkungslos, Entwicklungsmenge erst ab 30.09. (7 Tage) | §1.2, Slot 2024-04-08/2026-06-15 geprüft |
| A-F10-4 | K2 (Nachbar-Dämpfung) nicht in Fusion 10 aufgenommen: Gewinn klein, CH 0–6 h schlechter, Rolle A mit Option an nicht byte-gleich, 7 Entwicklungstage | §3.1 |
| A-F10-5 | K3 (Null-Fit-Schritt für Wind/Böe) nur Reserve: DE verliert > 120 h in beiden Mengen; Länderwahl wäre nachträglich | §3.2 |
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

## 6 Urteil, offene Punkte, V-F10-n

(folgt)
