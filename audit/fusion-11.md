# Phase F11 — buscosun Fusion 11 („Fusion 10a“): die zwei Abnahme-Defekte von Fusion 10 entfernt, neu geprüft (07.10.2026)

> Auftrag: `prompt-fusion11.md` (Jan, 07.10.2026). Zeitbox 2 h 45 min, Auto-Modus mit denselben Vollmachten wie F10.
> Vorgänger: `audit/fusion-10.md` (Diagnose, Läufe, Urteil „abgelehnt“ bei Index +0,97 %). Dieses Dokument ist Diagnose,
> Protokoll und Gate-Beleg der Phase (Diagnose-First, CLAUDE.md). Alle Zahlen tragen ihre Menge.
> **Leck-Erklärung vorab (§2.0):** die beiden Korrekturen stammen aus dem Tresor-Ergebnis von Fusion 10. Die Tresor-Zellen
> **t 240–336 h** und **ws 120–240 h** sind für Fusion 11 deshalb **nicht blind**; Spur P bleibt der saubere Richter.

## 0 Zeitprotokoll

| Zeit (UTC) | Phase | Was |
|---|---|---|
| 18:02:34 | Start | `date -u` = **2026-10-07T18:02:34Z**; Freeze-Datum (UTC) = **2026-10-07**; Zeitbox endet 20:47 UTC |
| 18:03–18:12 | 0:00–0:10 | Orientierung (CLAUDE.md, `audit/fusion-10.md`, Register, `longRange.ts`, `cubeSource.ts`, Pre-Screen, Fit, Identitätsverifier, Prüfstand-README/Skill); Vorbedingungen §1.1; **kein Warm-up** (Archiv unverändert 23 Tage, A-F11-1) |
| 18:12–18:13 | 0:10–0:11 | Branch `fusion-11` von `fusion-10`; Motor-Änderungen hinter `longRangeFix` (§3.1), `npm run typecheck` 0 Fehler; Pre-Screen um die Abdeckung q10–q90 erweitert (§1.3) |
| 18:13 | 0:11 | Regel §2 geschrieben; Pre-Screen Hindcast außerhalb des Tresors (8 Slots, Basis Fusion 9, Variante A, Variante B) gestartet — **vor dem ersten Blick auf eine Zahl** |

## 1 Vorbedingungen und Diagnose

### 1.1 Vorbedingungen

- Branch `fusion-10` @ `38d4b1d` (HEAD der F10-Sitzung, Tags `f10-lauf-1…3`), `git status`: unter `src/`, `scripts/`,
  `audit/pruefstand/` **nichts Uncommittetes**. Fremd und unberührt: `audit/seewetter.md`, `audit/seewetter/spike/*` (Seewetter-Linie),
  `tsconfig.app.tsbuildinfo`, `audit/fusion10-vorbereitung/`, `prompt-fusion10-autonom.md`, `prompt-fusion11.md` (untracked). Nichts
  davon wird committet, gestasht oder verworfen. Neuer Branch `fusion-11` von `fusion-10`.
- `git -C C:\dev\buscosun-archiv pull --ff-only`: nur `road/fc/v1/2026-10-07/…` kam dazu — **kein neuer Punkt-Archivtag** (der Slot
  des 07.10. entsteht 23:10 UTC) ⇒ Warm-up `--modus=vergleich` entfällt (A-F11-1).
- Prüfstand-Status 18:04 UTC (`--modus=status`): Protokoll P1 `4b633f0766a7`, Prüfnetz 365 Stationen mit Wahrheit (Rolle B 95),
  W1 `150cf00b6ee5` 1 225 Tage (reif 1 217, letzter Lauf 15:04 UTC), Archiv 23 Ausgabetage 14.09.–06.10., Tresor 70 Ausgaben;
  Champion `fusion-9` (`0ad0615`, Freeze 2026-10-04, Modell `a371fe086a04`), Kandidat `fusion-10` (`eac9a43`, Freeze 2026-10-07,
  Modell `6180c2555392`, Rangliste Platz 1 +18,7 %).
- `scripts/pruefstand/register/zugriffe.log`: **kein Eintrag für `fusion-11`** (letzte Öffnung 07.10. 16:40:41Z, Abnahme Fusion 10)
  ⇒ der Tresor darf in dieser Sitzung genau einmal für Fusion 11 geöffnet werden.
- Worktree `C:\dev\buscosun-web-wt\base` @ `4bdade3` (Fusion-9-Basis des Identitätsverifiers) ist vorhanden.

### 1.2 Diagnose (aus `audit/fusion-10.md` §3.5/§6.1/§6.2, nichts neu gemessen)

| Defekt | Zelle (Spur R, Rolle B) | Ursache | Korrektur (V-F10-n) |
|---|---|---|---|
| G2 | **t 240–336 h AT −0,44 %** (p 0,0009, BH 0,028); DE −0,2 %*, CH −0,2 % n. s. | letzter T-Bin der Tabelle (w = 1, s = 1,05): kein Mischgewinn, nur 5 % breitere Bänder, die schon stimmten (Abdeckung 80,8 → 82,3 %) | **V-F10-7:** Bin 241–336 h auf Identität (w = s = 1) |
| G3 | **ws 120–240 h Abdeckung 75,7 % gegen 76,4 %** beim Champion (Band 78,3–81,7 %) | der AT/CH-Windschritt ab 126 h verengt σ (AT Bandbreite 3,69 → 3,30 m/s) bei kaum CRPS-Gewinn (+0,6/+0,2 %); bei 241–336 h trägt derselbe Schritt +8,9/+6,6 % | **V-F10-8:** Schritt erst ab 241 h ODER mit σ-Boden (nur das Mittel bewegt sich) |

**Monotone Neufit-Variante zu V-F10-7 (am Fit-Gitter geprüft, kein neuer Lauf):** `audit/fusion-10/longrange-fit.json` trägt das
volle Gitter des Bins t 241–336 h (184 094 Zeilen, Hindcast außerhalb des Tresors). Identität 2,2066; bestes Gitter (1; 1,05) 2,2051
(+0,07 %); jedes w ≤ 0,8 verliert ≥ 0,48 % (0,8/1,0: 2,2173; 0,9/1,0: −0,15 %). Eine Monotonie-Nebenbedingung (w nicht steigend über
die Bins, also w ≤ 0,65 wie im Bin 169–240) kann die Identität auf dem Fit-Fenster deshalb **nicht** schlagen — der Auftrag verlangt
den Neufit nur, wenn er die Identität auf dem Hindcast außerhalb des Tresors UND auf der Schnellmenge schlägt ⇒ **Identität**, ohne
weiteren Pre-Screen-Lauf (A-F11-2). Was offen bleibt, ist nur die *Form* der Identität (Rampe oder Stufe, §2.1).

### 1.3 Werkzeuge dieser Phase

- `scripts/fusion10/prescreen.mjs` (F10, nur lesend) schreibt seit F11 je Tag zusätzlich `<tag>.cov.f32` — die **Abdeckung q10–q90**
  (1/0 je Station × Vorlauf für t/td/ws/gust, das Maß von Gate G3) — und `--compare` druckt neben dem CRPS-Skill die Abdeckung A/B je
  Zelle sowie den Skill je Land für die Fenster > 48 h. Bestehende Läufe ohne `.cov.f32` bleiben lesbar (Abdeckungstabelle entfällt dann).
- `scripts/verify-fusion10-identity.mjs` erhält `--vs=<Optionen von Fusion 10>`: zweite Negativkontrolle Fusion 11 gegen Fusion 10
  (beide an) mit der Prüfung, dass sich nur T bei > 240 h und nur ws/gust/dd bei > 120 h unterscheiden, und nur an AT/CH-Stationen
  beim Wind (§5).

## 2 Regel vor den Zahlen (festgeschrieben 18:13 UTC, vor dem ersten Pre-Screen-Ergebnis)

### 2.0 Leck-Erklärung

Die Richtung beider Korrekturen ist aus Spur R von Fusion 10 bekannt (eine Zelle G2, eine Zelle G3). Die *Form* wird ausschließlich am
Hindcast außerhalb des Tresors (`--set=hindcast --limit=8`: 00-UTC-Slots ab 2025-09-08, jeder dritte Tag ⇒ 08.09.–29.09.2025) und auf
der Schnellmenge (jeder dritte Entwicklungstag ≤ Freeze von Fusion 9: 16.09.–04.10.2026, 7 Tage) gewählt. Tresor-Zahlen werden vor der
einen Abnahme nicht gelesen; nach ihr wird nichts geändert.

### 2.1 V-F10-7 (T 241–336 h) — Form der Identität

Zwei Formen: **Rampe** (Knoten-Interpolation von `longRangeParams`: w, s laufen von (0,65; 0,9) bei 204,5 h linear auf (1; 1) bei 288,5 h,
danach Identität) und **Stufe** (exakt w = s = 1 an jedem T-Schritt ≥ 241 h; Sprung bei 240/241 h). Regel: beide Formen müssen in
t 240–336 h (Rolle B, alle Länder und je Land) auf dem Hindcast-Satz nicht schlechter als Fusion 9 sein (Skill ≥ −0,05 %); unter den
Formen, die das erfüllen, gewinnt die mit dem besseren t 240–336 h CRPS auf dem Hindcast-Satz; liegt der Unterschied unter 0,05 %,
gilt die **Rampe** (Entwurfsregel von F10: keine Sprünge in der Kurve). Erfüllt keine Form die Bedingung, gilt trotzdem die Rampe
(Identität am Bin-Mittelpunkt ist die Vorgabe des Auftrags) — der Befund wird dann als V-F11-n notiert. Schnellmenge = Gegenprobe
(Richtung muss stimmen, sonst Befund).

### 2.2 V-F10-8 (Windschritt AT/CH) — Form

Varianten: **(a) ab 241 h** (`FUSION11_WIND_SHRINK_FROM_H = 241`, volle Schrumpfung) und **(b) ab 126 h mit σ-Boden** (σ nie unter
die σ der Kombination; der Schritt bewegt nur das Mittel; `FusionContext.priorShrink.sigmaFloor`). Regel (Wortlaut des Auftrags,
präzisiert): eine Variante besteht, wenn sie (i) die ws-Abdeckung q10–q90 bei 120–240 h (Rolle B, alle Länder) auf **beiden**
Pre-Screen-Sätzen **nicht unter die von Fusion 9** drückt (Toleranz 0,1 Prozentpunkt) und (ii) in **keiner ws-/gust-Zelle** (Rolle B,
alle Länder, alle sechs Fenster) CRPS **gegen Fusion 9** verliert (Skill ≥ −0,05 %) — auf beiden Sätzen. Unter den bestehenden gewinnt
die mit dem größeren ws-CRPS-Gewinn bei 120–336 h (Mittel der Skills der zwei Zellen, Rolle B, alle Länder, Hindcast-Satz; Schnellmenge
als Gegenprobe der Richtung). Besteht keine, gilt **(a) 241 h**.

### 2.3 Was nicht geändert wird

Td- und Böen-Zeilen der Tabelle, alle Bins ≤ 240 h von T, der Windschritt bei ≥ 241 h in AT/CH (volle Schrumpfung bleibt in (a); in (b)
mit σ-Boden), DE überall, alles ≤ 48 h, Niederschlag, Bewölkung, Tabellen des Daten-Repos (`1aaec969`). Ohne `longRangeFix` rechnet der
Motor byte-gleich Fusion 10 (Identitätsverifier, §5).

## 3 Pre-Screen (Rolle B, Skill 1 − A/B des CRPS_Q gegen Fusion 9, „+“ = Variante besser; Abdeckung q10–q90 in %)

Werkzeug `scripts/fusion10/prescreen.mjs` (nur lesend, kein Prüfstand-Maß), Motor aus dem lebenden Checkout, Optionen über die des
Champions. Verzeichnisse `C:\dev\buscosun-fusion11-data\prescreen\<lauf>` (Logs und `*.compare.txt` daneben, Kopien der Vergleiche in
`audit/fusion-11/prescreen/`). Läufe: `f9-*` (Basis), `f10-*` (`longRange:1`), `vA-*` (T **Rampe** + Windschritt **241 h**),
`vB-*` (T **Stufe** + Windschritt **126 h mit σ-Boden**), `f11-*` (das fertige Bündel `longRange:1, longRangeFix:1` mit den
gewählten Konstanten). T-Zellen hängen nur an der T-Form, ws/gust/dd-Zellen nur an der Windform (keine Kopplung sichtbar: T 48–120/
120–240 in A und B auf 0,01 % gleich). Alle Zellen ≤ 48 h, Niederschlag und Bewölkung in jedem Lauf exakt 0,00 % [0/0].

**Hindcast außerhalb des Tresors — 8 Slots 00 UTC 2025-09-08 … 2025-09-29 (jeder 3. Tag), 365 Stationen, Kette ohne Station/Messung:**

| Lauf | t 48–120 | t 120–240 | **t 240–336** (DE/AT/CH) | ws 120–240 (DE/AT/CH) | ws 240–336 (DE/AT/CH) | Böe 120–240 | Böe 240–336 | Index-Näherung (63 Zellen) |
|---|---|---|---|---|---|---|---|---|
| Fusion 10 | +0,27 | −1,10 | **−0,36** (−0,25/−0,41/−0,50) | +0,52 (0/+1,67/+0,78) | +4,14 (0/+9,05/+8,55) | +9,75 | +6,29 | +0,48 % |
| A (Rampe · 241 h) | +0,27 | −1,15 | **−0,54** (−0,52/−0,50/−0,63) | 0,00 (0/0/0) | +4,14 (0/+9,05/+8,55) | +7,70 | +6,29 | +0,43 % |
| B (Stufe · 126 h σ-Boden) | +0,27 | −1,15 | **−0,00** (0/−0,00/−0,00) | +0,01 (0/+0,44/**−0,25**) | +1,05 (0/+2,63/+1,94) | +9,70 | +6,18 | +0,25 % |

| Abdeckung q10–q90 (Variante/Fusion 9) | t 240–336 | **ws 120–240** (DE/AT/CH) | ws 240–336 | Böe 120–240 |
|---|---|---|---|---|
| Fusion 10 | 76,7/75,3 | **74,9/75,3** (77,9/77,9 · 73,0/73,4 · 71,1/72,4) — der G3-Befund reproduziert sich außerhalb des Tresors | 76,7/75,9 | 75,9/66,0 |
| A (241 h) | 74,5/75,3 | **75,3/75,3** (= Fusion 9) | 76,7/75,9 | 75,7/66,0 |
| B (126 h σ-Boden) | 75,3/75,3 | **75,3/75,3** (77,9/77,9 · 73,5/73,4 · 72,2/72,4) | 76,2/75,9 | 76,3/66,0 |

**Schnellmenge — 7 Entwicklungstage 16.09.–04.10.2026 (jeder 3. Tag ≤ Freeze von Fusion 9), Kette mit Stationsprodukt:**

| Lauf | t 240–336 (DE/AT/CH) | ws 120–240 | ws 240–336 (DE/AT/CH) | Böe 120–240 | Böe 240–336 | Abdeckung ws 120–240 | Abdeckung t 240–336 | Index-Näherung (99 Zellen) |
|---|---|---|---|---|---|---|---|---|
| A (Rampe · 241 h) | **+0,43** (+0,53/+0,30/+0,34) | 0,00 | +10,21 (0/+14,15/+20,71) | +5,43 | +5,20 | 75,1/75,1 | 65,4/64,5 | +0,43 % |
| B (Stufe · 126 h σ-Boden) | **+0,00** (0/0/−0,00) | +0,37 (0/+0,28/+1,00) | +1,64 (0/+2,58/+3,09) | +8,66 | +4,53 | 75,1/75,1 | 64,5/64,5 | +0,13 % |

### 3.1 Entscheidung nach Regel §2.1 (T-Form)

Hindcast-Satz, t 240–336 h: die Rampe verliert gegen Fusion 9 in jedem Land (−0,52/−0,50/−0,63 %) ⇒ fällt an der Bedingung
„≥ −0,05 %“; die Stufe ist exakt die Identität (0,00 %) ⇒ besteht ⇒ **Stufe**. Gegenprobe Schnellmenge: dort ist die Rampe BESSER
als Fusion 9 (+0,43 %) und die Stufe 0,00 — die Richtung widerspricht dem Hindcast ⇒ **V-F11-1** (§6): auf der Entwicklungsmenge
(Herbst 2026, Kette mit Stationsprodukt) deckt t 240–336 h nur 64,5 % statt 80 % ab, dort hilft jede Verbreiterung (auch die
s = 1,05 von Fusion 10: +0,6 % im Volltest); im Hindcast 09/2025 und im Tresor (80,8 %) stimmen die Bänder und die Verbreiterung
kostet. Die Regel hatte den Hindcast-Satz als Richter benannt; die Entscheidung folgt ihr. Warum die Rampe verliert: zwischen 204,5
und 288,5 h läuft s von 0,9 auf 1,0 (Fusion 10: auf 1,05) — schmalere Bänder bei 241–288 h, wo die Abdeckung schon 72–79 % beträgt.
**A-F11-3 (Form der Stufe):** die Stufe nimmt bis 240 h die Tabelle von Fusion 10 (Rampe 205–240 h unverändert, Ziel (1; 1,05)) und ab
241 h exakt w = s = 1 — so unterscheidet sich T von Fusion 10 NUR jenseits von 240 h (Forderung der zweiten Negativkontrolle des
Auftrags). Die pre-gescreente Variante B interpolierte 205–240 h zum Ziel (1; 1) (s um ≤ 0,02 kleiner; t 120–240 −1,15 statt −1,10 %);
das fertige Bündel wird mit dem Lauf `f11-hc` nachgemessen (§3.3). Die Stufe springt am nativen Schritt 240 → 246 h (w ≈ 0,80 → 1); die
stündliche Achse interpoliert die Quantile dazwischen (AP7), die Kurve zeigt also eine steile Rampe über 6 h, keinen Sprung — als
V-F11-2 notiert (stetige Alternative: Rampe bis 240 h enden lassen).

### 3.2 Entscheidung nach Regel §2.2 (Windform)

(i) Abdeckung ws 120–240 h: A 75,3/75,3 (Hindcast) und 75,1/75,1 (Schnellmenge) = Fusion 9; B 75,3/75,3 und 75,1/75,1 ⇒ beide bestehen.
(ii) keine ws-/Böen-Zelle (gepoolt) schlechter als Fusion 9: A ws 0/0/0/0/0/+4,14, Böe 0/0/0/+0,65/+7,70/+6,29 (Hindcast), Schnellmenge ws
+10,21, Böe +0,09/+5,43/+5,20 ⇒ besteht; B ws +0,01/+1,05, Böe +0,65/+9,70/+6,18, Schnellmenge ws +0,37/+1,64, Böe +0,09/+8,66/+4,53 ⇒
besteht. Je Land verliert B bei ws 120–240 h in CH (−0,25 %, Hindcast) — unter der strengeren Lesart fiele B; A verliert nirgends.
Größerer ws-Gewinn bei 120–336 h (Hindcast, Mittel der zwei Zellen): A (0,00 + 4,14)/2 = **+2,07 %**, B (0,01 + 1,05)/2 = +0,53 % ⇒
**A: Windschritt ab 241 h, ohne σ-Boden** — unter beiden Lesarten dieselbe Wahl. Der σ-Boden heilt die Abdeckung (75,3 statt 74,9), bringt
aber fast keinen CRPS (+0,01 %); der volle Schritt bei 126–240 h bringt +0,52 % CRPS und kostet die Abdeckung (Fusion 10) — genau der
Tresor-Befund V-F10-8, hier außerhalb des Tresors reproduziert. Die Böen-Zellen je Land auf der Schnellmenge (CH 120–240 −5,6/−4,8 %,
DE −1,2/−1,5 %) stammen aus der Böen-Zeile der F10-Tabelle (K1, im Volltest von Fusion 10 als Nebenzelle −4,1 % CH) und sind in A und B
gleich — nicht Gegenstand dieser Phase (§2.3), als V-F11-3 notiert.

**Konstanten gesetzt (18:28 UTC):** `FUSION11_T_TAIL = 'step'`, `FUSION11_T_IDENTITY_FROM_H = 241`, `FUSION11_WIND_SHRINK_FROM_H = 241`,
`FUSION11_WIND_SIGMA_FLOOR = false`. Die σ-Boden-Form bleibt als Option `priorShrinkWindSigmaFloor` (aus) und als `FusionContext.priorShrink.sigmaFloor`
im Motor; ohne Option byte-gleich.
