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

## 2 Abteilung und Portfolio

(folgt nach dem Kick-off)

## 3 Kandidatenprotokoll (jeder Prüfstand-Lauf)

(folgt)

## 4 Entscheidungen im Auto-Modus

| Nr. | Entscheidung | Beleg |
|---|---|---|
| A-F10-1 | Warm-up ohne `--offline` (W1 fortgeschrieben), alle weiteren Läufe `--offline` | Auftrag „Preconditions“ |

## 5 Identität und Leck-Prüfungen

(folgt)

## 6 Urteil, offene Punkte, V-F10-n

(folgt)
