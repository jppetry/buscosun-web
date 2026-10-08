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
| 18:17–18:21 | 0:15–0:19 | Hindcast-Läufe fertig (je ≈ 3 min zu dritt), Schnellmengen-Läufe + Fusion 10 Hindcast gestartet; erster Vergleich war verfälscht (`.cov.f32` als Score-Datei gelesen, Filter korrigiert — jede ≤-48-h-Zelle muss 0,00 zeigen, tat es danach) |
| 18:24–18:28 | 0:22–0:26 | Tabellen §3 gelesen, Entscheidung nach §2.1/§2.2 (Stufe · 241 h), Konstanten gesetzt, typecheck 0 |
| 18:28–18:33 | 0:26–0:31 | Pre-Screen des fertigen Bündels (`f11-hc`, §3.3), Identitätsverifier Lauf 1 (11/15: nur die Erwartung der zweiten Negativkontrolle zu eng, A-F11-4), `verify:fusion-release` 28/28, `verify:pruefstand` 60/60 |
| 18:35 | 0:33 | Commit `ace255d` (Tag `f11-lauf-1`), **Registrierung `fusion-11`** (Modell `77486606c795`, Spur R sauber, Freeze 2026-10-07), Notizen ins Register |
| 18:36 | 0:34 | **Lauf 1 `--modus=voll --offline`** gestartet (23 Konserven, 3 Worker); parallel der korrigierte Identitätsverifier (`laeufe/03-identity-lauf1.log`) |
| 18:47 | 0:45 | Lauf 1 fertig: **+0,47 % (+0,33 … +0,66)**, G2/G3/G4 grün (§6.1); Identitätsverifier 11/15 — T unterscheidet sich von Fusion 10 auch ≤ 234 h (1 548–1 800 Werte je Tag, V-F10-r3-Kopplung, §5.2) |
| 18:48 | 0:46 | Erwartung §6.2 eingefroren; **Abnahme gestartet** (einmalig, `laeufe/04-abnahme.log`); parallel Größenmessung der ≤-234-h-T-Unterschiede (1 Tag) und Build + Budget |
| 18:56–19:00 | 0:54–0:58 | Größenmessung: T ≤ 234 h nur AT/CH, ab 139 h, max 0,27 K (§5.2, V-F11-5); Build 255/255, Budget grün (§7); V-F11-1…6 geschrieben |
| 19:06 | 1:04 | **Abnahme fertig: Kandidat — Index +0,97 % (+0,64 … +1,28), G2/G3/G4 grün, G1 nicht nachweisbar** (§6.3) |
| 19:06–19:20 | 1:04–1:18 | Dokumentation (Audit §6.3/§9, MANUELLE-SCHRITTE §46, CLAUDE.md), Identitätsverifier am Endstand (§5.3), Commit auf `fusion-11` |

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

### 3.3 Das fertige Bündel (`longRange:1, longRangeFix:1`, Konstanten wie gesetzt) — Hindcast-Satz, Rolle B

| gegen | t 120–240 (DE/AT/CH) | t 240–336 (DE/AT/CH) | ws 120–240 | ws 240–336 (DE/AT/CH) | Böe 120–240 (DE/AT/CH) | Böe 240–336 | Abdeckung ws 120–240 · t 240–336 | Index-Näherung |
|---|---|---|---|---|---|---|---|---|
| Fusion 9 | −1,10 (−3,72/+3,17/−0,65) = Fusion 10 | **0,00** (0/0/0) | **0,00** | +4,14 (0/+9,05/+8,55) | +7,70 (+0,27/+22,17/+6,96) | +6,29 | 75,3/75,3 · 75,4/75,3 | +0,48 → **+0,48 %** (DE −0,35 · AT +0,96 · CH +0,76) |
| Fusion 10 | 0,00 (A-F11-3 bestätigt: T bis 240 h byte-gleich) | **+0,36** (+0,25/+0,41/+0,50) | **−0,53** (0/−1,70/−0,79) | 0,00 | **−2,27** (0/**−9,83**/−0,95) | 0,00 | — | −0,02 % |

Lesart: gegen Fusion 10 gewinnt Fusion 11 genau die G2-Zelle (t 240–336 h, in jedem Land) und gibt den kleinen CRPS-Gewinn des
126-h-Schritts bei ws 120–240 h (−0,53 %) zurück, der im Tresor die Abdeckung unter die des Champions drückte; die Böe 120–240 h in AT
verliert gegen Fusion 10 9,8 % (Nebenzelle; der Schritt hielt dort auch die Böe), bleibt aber +22 % über Fusion 9 ⇒ **V-F11-4** (Schritt ab
126 h nur für die Böe prüfen — ihre Abdeckung lag mit 81,5 % im Band). Alle anderen Zellen byte-gleich zu Fusion 10 (0,00 [0/0]). Kopien:
`audit/fusion-11/prescreen/f11-hc.compare.txt`, `f11-vs-f10-hc.compare.txt`.

## 4 Entscheidungen im Auto-Modus

| Nr. | Entscheidung | Beleg |
|---|---|---|
| A-F11-1 | Kein Warm-up `--modus=vergleich`: das Archiv hat seit der F10-Sitzung keinen neuen Punkt-Ausgabetag (23 Tage, `pull` brachte nur `road/fc`); alle Läufe `--offline` | §1.1 |
| A-F11-2 | Monotoner Neufit des T-Bins 241–336 h nicht gerechnet: das Fit-Gitter von F10 (184 094 Zeilen, außerhalb des Tresors) zeigt jedes w ≤ 0,8 ≥ 0,48 % hinter der Identität — die Bedingung des Auftrags („schlägt die Identität auf dem Hindcast außerhalb des Tresors“) ist damit schon verneint ⇒ Identität | §1.2 |
| A-F11-3 | Stufenform der Identität nimmt bis 240 h die Fusion-10-Tabelle (T unterscheidet sich von Fusion 10 nur jenseits 240 h — Forderung der zweiten Negativkontrolle); die pre-gescreente Variante B interpolierte 205–240 h zum Ziel (1; 1) — Unterschied s ≤ 0,02, am Bündel nachgemessen (§3.3: T bis 240 h byte-gleich zu Fusion 10) | §3.1, §3.3 |
| A-F11-4 | Zweite Negativkontrolle erlaubt T-Unterschiede ab 235 h statt 241 h: die stündliche Achse interpoliert die Stunden 235–240 h aus dem nativen Nachbarn 243 h (Läufe mit um 3 h versetzter t3-Achse); gezählt wurden 1 404–2 214 solcher Werte je Archivtag (2 % der T-Unterschiede), ≤ 234 h muss 0 sein | §5 |
| A-F11-5 | Commit, Registrierung und Volltest vor dem Ende des ersten Identitätslaufs gestartet (Tage 02./03.10. waren grün; die Verletzung betraf nur die Verifier-Erwartung A-F11-4); der korrigierte Verifier läuft parallel zum Volltest | §0 |
| A-F11-6 | σ-Boden-Form (`priorShrinkWindSigmaFloor`, `FusionContext.priorShrink.sigmaFloor`) bleibt gebaut und aus — Regel §2.2 wählte 241 h; ohne Option byte-gleich (Identitätsverifier) | §3.2 |

## 5 Identität und Leck-Prüfungen

Verifier `scripts/verify-fusion10-identity.mjs` (F10, §5.1 dort), erweitert um `--vs` (zweite Negativkontrolle). Basis = Worktree
`C:\dev\buscosun-web-wt\base` @ `4bdade3` (Fusion 9), Kandidat = Hauptcheckout; Archiv 02./03./04.10.2026 (alle 365 Stationen, Rollen A
und B) + Hindcast 2026-06-15 (außerhalb des Tresors).

**Lauf 1 am Commit `ace255d` (`laeufe/01-identity.log`, 18:28–18:36 UTC): 11/15** — alle Byte-Prüfungen grün:
- Option aus (= Fusion 9) **byte-gleich zur Basis** an 3 Archivtagen (`9f7fb403f830`, `913875212c0d`, `f061a25d79cd`) und im Hindcast;
  Basis **byte-gleich zur gespeicherten Konserve von Fusion 9** an allen 3 Tagen ⇒ die Branch-Basis rechnet weiter exakt Fusion 9.
- Negativkontrolle (`longRange:1, longRangeFix:1` an): 1,10–1,17 Mio. Werte verschieden, **ausschließlich > 48 h**, Größen dd/gust/t/td/ws.
- Zweite Negativkontrolle (Fusion 11 gegen Fusion 10, beide an): je Archivtag 133–138 k Werte: t 97–104 k (davon 1 404–2 214 ≤ 240 h, 0 ≤ 120 h,
  DE/AT/CH), ws 17,8–18,8 k und gust 16,3–17,4 k (alle > 120 h und ≤ 240 h, **nur AT/CH** — der Schritt, der bei 126–240 h wegfällt), dd 71–92 (AT/CH);
  Hindcast 258 k Werte, gleiche Struktur. **Td, Niederschlag, pWet, Bewölkung: 0 Werte** — wie gebaut. Die vier roten Haken waren die zu enge
  Erwartung „T nur > 240 h“ (A-F11-4): die stündliche Achse interpoliert die Stunden vor einem veränderten nativen Schritt mit.

## 6 Prüfstand-Läufe

### 6.1 Lauf 1 — `--kandidat=fusion-11 --modus=voll --offline` (Register-Commit `ace255d`, Tag `f11-lauf-1`, Modell `77486606c795`, 18:36–18:47 UTC)

Bericht `laeufe/02-lauf1-voll/` (Kopie von `audit/pruefstand/berichte/fusion-11/2026-10-07-voll`). Entwicklungsmenge 23 Tage
(14.09.–06.10.), Konserven 23 (nur der Kandidat), 3 Worker, 465 s Rechnung.

| Maß | Wert |
|---|---|
| Fortschrittsindex Rolle B gegen Fusion 9 | **+0,47 %** (95 %: **+0,33 … +0,66 %**), Nachweisgrenze 0,3 % — Intervall über 0 |
| Gates (Hinweise) | G1 grün · G2 grün · G3 grün · G4 grün |
| Beste Kernzellen | ws 240–336 CH +20,7 %**, ws 240–336 AT +15,3 %**, td 240–336 CH +7,6 %** (wie Fusion 10, Lauf 2) |
| Schlechteste (n. s.) | td 120–240 AT −2,5 %, td 48–120 DE −2,1 %, td 120–240 CH −1,3 % (wie Fusion 10) |
| Produktaussage | **77 von 99** Kernzellen besser als jede Einzelquelle (Fusion 10: 80, Fusion 9: 76) |
| Warnung | 1 901 589 Werte mit unreifer Wahrheit mitgezählt (Tage 30.09.–06.10.; V-F10-6) |

Lesart gegen den Volltest von Fusion 10 (+0,69 %, +0,51 … +0,92): der Index fällt um 0,22 Punkte — erwartungsgemäß, denn auf der
Entwicklungsmenge halfen genau die zwei zurückgenommenen Teile (t 240–336 h s = 1,05 bei 65 % Abdeckung: +0,6 %; der Windschritt bei
126–240 h: ws +7,4/+12,2 % AT/CH). Fusion 11 verzichtet auf diese Gewinne der Entwicklungsmenge zugunsten der Tresor-Zellen — das ist
der Zweck der Phase. Level 1 erreicht (Index > 0 mit Intervall über 0, G2–G4 grün); ein Urteil gibt nur die Abnahme.

### 6.2 Abnahme (einmalig, Vollmacht 3) — Erwartung VOR dem Ergebnis (18:48 UTC)

Spur P leer ⇒ G1 „nicht nachweisbar“. Spur R (Kette ohne Station/Messung): t 240–336 h byte-gleich zu Fusion 9 (⇒ 0,00 %, die
G2-Zelle von Fusion 10 kann nicht mehr rot sein), t 48–240 h und Td wie Fusion 10 (+0,4…+6,4 %), ws 120–240 h byte-gleich zu Fusion 9
(Abdeckung = Champion ⇒ G3 dort nicht mehr rot), ws 240–336 h AT/CH wie Fusion 10 (+8,9/+6,6 %), Böe 120–240 h kleiner als bei Fusion 10
(Nebenzelle). Erwarteter Index: unter den +0,97 % von Fusion 10 (die zwei zurückgenommenen Teile trugen dort +0,6 % ws AT bei 120–240 h und
kosteten −0,4 % t AT bei 240–336 h — netto ≈ ±0), Intervall über 0. Erwartetes Urteil: **Kandidat**, falls keine andere Zelle kippt (die
Böen-Nebenzelle ist nicht G2-relevant; G3-Zellen des Windes bei 240–336 h und von T sind unverändert gegenüber Fusion 10, wo sie grün
waren). **Nicht blind:** t 240–336 h und ws 120–240 h (§2.0).

## 8 Offene Punkte und Verbesserungen (D-28; Mehrwert für Jan, Umsetzungsskizze)

- **V-F11-1** Die Mengen widersprechen sich bei t 240–336 h: Entwicklungsmenge (Herbst 2026, Kette mit Stationsprodukt) deckt q10–q90 nur zu
  64,5 % ab und belohnt jede Verbreiterung (Rampe +0,43 %, Fusion-10-s = 1,05 +0,6 %); Hindcast 09/2025 und Tresor (80,8 %) bestrafen sie.
  *Mehrwert:* klärt, ob die Langfrist-Bänder von T saisonal (Herbst/Winter zu schmal) oder kettenabhängig (mit Station schmaler) falsch
  sind — entscheidet, ob s je Saison oder je Kette gefittet werden muss. *Skizze:* Abdeckung t 240–336 h je Monat am Hindcast außerhalb
  des Tresors (378 Tage) und je Rolle A/B auf der Entwicklungsmenge auszählen (`prescreen.mjs` schreibt die Abdeckung schon); dann s als
  Funktion von Monat oder Rolle fitten (V-F10-3).
- **V-F11-2** Die Stufenform springt am nativen Schritt 240 → 246 h (w ≈ 0,80 → 1); die stündliche Achse interpoliert die Quantile dazwischen
  (steile 6-h-Rampe statt Sprung). *Mehrwert:* glatte 14-Tage-Kurve ohne Knick an Tag 10. *Skizze:* Knoten (240 h, (1; 1)) statt
  (288,5 h, (1; 1)) — Rampe von 204,5 bis 240 h; am Hindcast außerhalb des Tresors gegen die Stufe messen (t 169–240 h darf nicht verlieren).
- **V-F11-3** Böen-Zeile der Langfrist-Tabelle (F10 K1) verliert auf der Entwicklungsmenge in CH 120–240/240–336 h 4,8–5,6 % und in DE 1,2–1,5 %
  gegen Fusion 9 (Nebenzelle, in F10 bekannt: −4,1 % CH). *Mehrwert:* Böe > 48 h ist Nebenzelle, aber Produktwert (Sturmwarnung Tag 5–10).
  *Skizze:* Böen-Zeile je Land fitten (AX-5-Muster, V-F10-2) oder CH auf Identität.
- **V-F11-4** Der AT/CH-Schritt bei 126–240 h half der Böe (+9,8 % AT gegen Fusion 11 auf dem Hindcast-Satz) bei Abdeckung im Band (81,5 %) —
  nur der Wind verlor die Abdeckung. *Mehrwert:* +10 % Böen-CRPS in AT bei Tag 5–10 ohne G3-Risiko. *Skizze:* `priorShrinkAt` je Größe
  (`except: ['gust']` ab 126 h, `['wind', 'gust']` ab 241 h); Vorab-Regel, Pre-Screen beide Sätze, Fusion 12.
- **V-F11-5** Kopplung Windschritt → T (V-F10-r3 bestätigt): Fusion 11 unterscheidet sich von Fusion 10 auch in T bei 126–234 h
  (1 548–1 800 Werte je Archivtag, 9 738 im Hindcast-Slot; Größe und Länder in §5.2), obwohl nur der Wind-/Böen-Schritt wegfällt. *Mehrwert:*
  eine Zahl, die sich ohne Grund bewegt, ist eine unverstandene Abhängigkeit im Motor. *Skizze:* einen AT-Punkt mit `priorShrinkWindFromH`
  126 gegen 241 rechnen, `post`-Blöcke je Schritt diffen (Kandidaten: Stationswert `L − M` am Wind, Böe-≥-Wind-Konsistenz, Feuchtkugel-Phase,
  `onWeights`-β).
- **V-F11-6** `verify-fusion10-identity.mjs --vs` prüft T ab 235 h (Interpolationsrand); eine schärfere Prüfung verlangte den Vergleich an
  den NATIVEN Schritten (`interpolated`-Flag aus dem Replay). *Skizze:* Replay gibt die Native-Maske je Vorlauf zurück, Verifier zählt
  Unterschiede getrennt nativ/interpoliert.

### 5.2 Zweite Negativkontrolle mit Größenmessung (`laeufe/03-identity-lauf1.log`, `05-identity-magnitude.log`)

Nach A-F11-4 blieb ein Rest: T unterscheidet sich von Fusion 10 auch **≤ 234 h** — Archiv 04.10.: 1 548 Werte (1,5 % der T-Unterschiede),
**nur AT/CH, ab 139 h, max |Δ| 0,27 K**; Hindcast 2026-06-15: 9 738 Werte, nur AT/CH, ab 144 h, max |Δ| 0,19 K. Wind/Böe unterscheiden sich
ab 126/127 h nur in AT/CH (max |Δ| ws 5,1 m/s, Böe 12,3 m/s — die volle Schrumpfung des Fusion-10-Schritts an Bergstationen), dd ebenso,
**Td/Niederschlag/pWet/Bewölkung 0 Werte**. Lesart: der wegfallende Wind-/Böen-Schritt bei 126–240 h bewegt T in AT/CH um bis zu 0,3 K je Wert
(im Zellmittel 0,00 %, Pre-Screen §3.3) — die aus F10 bekannte, unerklärte Kopplung V-F10-r3, hier bestätigt und vermessen (**V-F11-5**).
Sie ist eine Folge der beabsichtigten Windänderung, keine Änderung an T selbst (T-Parameter bis 240 h byte-gleich zur Fusion-10-Tabelle);
dennoch „ändert sich etwas anderes“ — als solches deklariert. Der Verifier toleriert seitdem genau diese Kopplung (AT/CH, > 120 h, ≤ 0,5 K je
Wert, Betrag im Text) und schlägt bei DE, ≤ 120 h oder > 0,5 K an; Ergebnis des Laufs am Abnahme-Commit: §5.3.

## 7 Gates der Codebasis (Register-Commit `ace255d`; `src/` danach unverändert)

| Gate | Ergebnis |
|---|---|
| `npm run typecheck` | 0 Fehler |
| `verify:fusion-release` | **28/28** — „neuester Stand buscosun Fusion 11“ (B2/B3: kein fester Stand im Code, Schlüssel aus dem Register) |
| `verify:pruefstand` | **60/60** |
| `verify:fusion10-identity -- --on=longRange:1,longRangeFix:1 --vs=longRange:1` | Byte-Prüfungen 11/11 (Option aus = Basis = Konserve Fusion 9, 3 Archivtage + Hindcast; Negativkontrolle nur > 48 h); zweite Negativkontrolle nach §5.2 (Kopplung AT/CH toleriert) — Lauf am Ende §5.3 |
| `npm run build` | **255/255** (SEO-Prüfung), Log `laeufe/06-build.log` |
| `npm run budget` | grün: totalJs **1 599,1 / 1 600** (+0,5 KB gegen Fusion 10 1 598,6: `LONG_RANGE_TABLE_F11`, Konstanten, Bündel-Zweige in `cubeSource`, Eintrag im `fusionRelease`-Chunk — alles lazy), eagerJs 109,3 / 109,4 unverändert, largestChunk 278,4; keine Ratschen-Anhebung nötig |

### 6.3 Ergebnis der Abnahme (18:48–19:06 UTC, Bericht `laeufe/04-abnahme/`, `zugriffe.log` Eintrag 18:48:19Z — die einzige Öffnung des Tresors dieser Sitzung)

Spur P 0 Tage, Spur R 70 Ausgaben, Entwicklungsmenge 23 Tage (Diagnose). Selbstprüfung bestanden: Wahrheit ⇒ Score 0, Klimatologie ⇒
Güteindex 0, halbierte Bänder ⇒ G3 rot (12/17), Rauschen ⇒ G2 rot (50/63), Leck-Modell ⇒ Überanpassungswarnung, **A/A-Irrtumsrate 5,3 %
bei nominal 5 %**. G4 grün (Determinismus Hindcast 2024-04-08, Physik, Vollständigkeit, Punktabfrage, Leck-Prüfung).

| Maß (Spur R, Rolle B) | Wert |
|---|---|
| **Urteil des Prüfstands** | **Kandidat** — „ein Fortschritt gegen den Champion ist nicht nachweisbar“ (G1 nicht nachweisbar: Spur P leer); **G2 grün (0 von 63), G3 grün (0 von 17 rot), G4 grün** |
| Fortschrittsindex gegen Fusion 9 | **+0,97 %** (95 %: **+0,64 … +1,28 %**), Nachweisgrenze 0,5 %; Rolle A +1,10 % (+0,76 … +1,43); keine Überanpassungswarnung |
| Fortschrittsindex gegen Fusion 10 | +0,00 % (95 %: −0,03 … +0,03 %) — Fusion 11 ist in Spur R im Index gleichauf mit Fusion 10, die zwei Korrekturen heben sich im Mittel auf |
| Beste Kernzellen | ws 240–336 AT +8,9 %**, ws 240–336 CH +6,6 %**, td 120–240 AT +6,4 %** |
| Schlechteste Kernzellen | t 240–336 AT −0,0 % (n. s.), wet 240–336 CH/AT +0,0 % — **keine Zelle schlechter** |
| G2-Zelle von Fusion 10 (t 240–336 AT) | CRPS 2,12588 gegen 2,12586 (Fusion 9), Skill −0,00001, n. s. — vorher −0,44 %, p 0,0009; gegen Fusion 10 +0,44 %** (DE +0,24 %*, CH +0,22 %) |
| G3-Zelle von Fusion 10 (ws 120–240 h) | Abdeckung **76,4 % = Champion 76,4 %** (Band 78,2–81,8 %; beide darunter, kein Abstand mehr) — vorher 75,7 %; CRPS byte-gleich zu Fusion 9 (gegen Fusion 10 −0,17 % n. s.: AT −0,6 %, CH −0,2 %) |
| Weitere G3-Zeilen | t 240–336 78,9 = 78,9 % (Band 76,7–83,3 ✓; Fusion 10: 82,3 %), ws 240–336 78,0 gegen 77,3 % (im Band), t 120–240 80,9 gegen 79,8 % (im Band); 9 Zellen außerhalb des Bands wie beim Champion (t 0–6 90,4 %, ws 48–120 72,8 %, …) |
| Böe (Nebenzelle) | 120–240 +5,7 %** gegen Fusion 9 (DE +0,9/AT +14,6/CH +5,3) — gegen Fusion 10 −1,0 % (AT −4,7 % n. s., nEff 1,8): der Preis des 241-h-Schritts (V-F11-4); 240–336 +4,3 %** (wie Fusion 10) |
| Produktaussage | 63 von 63 Kernzellen besser als jede Einzelquelle |
| Rangliste (Güteindex gegen Klimatologie, Spur R) | **fusion-10 +18,69 % · fusion-11 +18,69 %** (gleichauf, Fusion 10 vor 11 bei gleicher Rundung) · fusion-6/7/8/9 +17,81 % · fusion-5e +15,36 % |

Je Größe gegen Fusion 9 (DE/AT/CH): T 120–240 +0,6/+5,8**/+1,8 · **240–336 0/−0,0/+0,0** (vorher −0,2/−0,4!/−0,2); Td 240–336 +0,7/+2,9*/+2,8*;
Wind 120–240 **0/0/0** (byte-gleich) · 240–336 0/+8,9**/+6,6**; alle 0–6-h-Zellen 0,00 (unberührt, wie gebaut). Gegen Fusion 10 sind
genau die erwarteten Zellen bewegt (§6.2): t 240–336 h in jedem Land besser, ws/Böe 120–240 h in AT/CH kleiner, t 120–240 h AT/CH
+0,00002 (die Kopplung V-F11-5, hier mit p 0,006 messbar, aber 0,002 % groß), alles andere byte-gleich.

**Lesart (rotes Team):** Die Abnahme sagt genau das, was §6.2 vorher erwartete — die zwei roten Zellen von Fusion 10 sind grün, der Index bleibt
mit dem ganzen Intervall über 0, keine Zelle wird schlechter, G2–G4 grün ⇒ **Kandidat**. Das ist der Erfolg des Auftrags, aber ein
bedingter: (1) beide Korrekturen wurden aus demselben Tresor abgeleitet, den sie jetzt bestehen — die Zellen t 240–336 h und ws 120–240 h
sind nicht blind, und die Richtung aller Hebel war bekannt (§2.0); (2) Spur P ist leer, G1 „nicht nachweisbar“ ⇒ das Protokoll kann aus
Spur R allein keinen Champion machen; (3) gegen Fusion 10 ist der Index exakt 0 — Fusion 11 ist nicht „besser“ als Fusion 10, sie ist
protokollkonform (keine signifikant schlechtere Zelle, Abdeckung nicht hinter dem Champion). **Nach der Abnahme wurde nichts geändert**
(Leck-Regel; die Verifier-Anpassung A-F11-4/§5.2 betrifft nur die Erwartung des Prüfwerkzeugs, nicht den Motor — `src/` seit `ace255d`
unverändert, der Prüfstand hat es am Lauf geprüft: „src des Commits = src von HEAD“).

## 9 Urteil

**Prüfstand (Protokoll P1, Wahrheit W1, Spur R 70 Ausgaben, Spur P 0 Tage): buscosun Fusion 11 — Kandidat**, Fortschrittsindex gegen
Fusion 9 **+0,97 % (95 %: +0,64 … +1,28 %)**, G2/G3/G4 grün, G1 nicht nachweisbar (Spur P leer); Volltest auf der Entwicklungsmenge
**+0,47 % (+0,33 … +0,66 %)**, G2–G4 grün. **Erreicht: das Ziel des Auftrags** (Urteil „Kandidat“, Index auf Spur R mit Intervall über 0,
G2–G4 grün, G1 bleibt „nicht nachweisbar“, solange Spur P leer ist). Vertrauen in das Tresor-Urteil: die zwei korrigierten Zellen sind
nicht blind und die Richtung war aus Fusion 10 bekannt — das Tresor-Ergebnis zeigt deshalb, dass die Korrekturen das Protokoll erfüllen, nicht,
dass sie generalisieren; dafür steht ihre Form am Hindcast außerhalb des Tresors (§3, Richtung gleich) und die erste echte Abnahme in Spur P
(≥ 4 reife Tage ab 19.10.2026). Champion-Entscheidung, Merge und Liveschaltung = Jan (`MANUELLE-SCHRITTE.md` §46).

**Was funktioniert hat:** die Vorab-Regel (geschrieben 18:13 UTC, vor jeder Zahl) traf an beiden Mengen eine eindeutige Wahl; der Hindcast
außerhalb des Tresors reproduzierte beide Tresor-Befunde (t 240–336 h −0,36 %, Abdeckung ws 120–240 h 74,9 gegen 75,3 %) — ein Prädiktor
für Spur R; die Prüfstand-Mechanik hielt (Registrierung, Volltest, Abnahme, kein Exit ≠ 0, 1 h 4 min von Start bis Urteil). **Was nicht
funktioniert hat / offen:** die Schnellmenge widerspricht beim T-Bin (V-F11-1); der Verzicht auf den 126-h-Schritt kostet die Böe in AT
≈ 5–10 % gegen Fusion 10 (V-F11-4); die Wind-T-Kopplung ist vermessen, nicht erklärt (V-F11-5); gegen Fusion 10 kein Indexgewinn.

### 5.3 Identitätsverifier am Endstand (`laeufe/07-identity-final.log`, 19:06–19:10 UTC, `src/` = `ace255d`): **7/7**

Archiv 04.10. + Hindcast 2026-06-15: Option aus byte-gleich zur Basis (`f061a25d79cd`, `f5a5609d1365`) und zur Konserve von Fusion 9;
Negativkontrolle nur > 48 h; zweite Negativkontrolle (Fusion 11 gegen Fusion 10) grün nach der Regel von §5.2 — T ≥ 235 h überall, darunter
nur AT/CH ab 139/144 h mit max |Δ| 0,27/0,19 K (Kopplung), ws/Böe/dd nur > 120 h und nur AT/CH, Td/Niederschlag/pWet/Bewölkung 0 Werte.
Der erste Lauf (`01-identity.log`, 11/15) und der zweite (`03-identity-lauf1.log`, 11/15) scheiterten nur an der zu engen Erwartung.
