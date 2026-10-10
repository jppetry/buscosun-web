# Phase OF — Behauptungen und Regel vor den Zahlen (eingefroren vor dem ersten Pre-Screen)

Eingefroren am 2026-10-08 (UTC-Zeit im Hash-Beleg `claims-frozen.sha256` neben dieser Datei). Nichts hier wird nach dem
ersten Blick auf eine Pre-Screen-Zahl geändert; eine Änderung wäre eine neue Datei mit neuem Hash und eigener Begründung.

## 1 Varianten

Alle Varianten rechnen denselben Motor (Branch `fusion-12`, Basis = Register `fusion-11`, Tabellen des Champions, Stufe `fs`
mit Fusion 10/11 an) auf denselben Prüfstand-Fällen (Protokoll P1, 365 Stationen, Rollen A/B, Wahrheit W1); nur die
Messungen und die Motor-Optionen unterscheiden sich:

| Kürzel | Messungen (Replay) | Motor-Optionen | Was es misst |
|---|---|---|---|
| **R0** | `archive` — die Wahrheitszeilen des Slots (Rolle A eigene Station, Rolle B nächste Rolle-A-Station), stündlich | keine | der Stand Fusion 11 (Referenz) |
| **R1** | `store6` — die sechs nächsten vollen Stationen aus dem Produkt (10-min-Stempel), Rolle B ohne eigene Station | keine | **OF-1 allein**: anderer Stationssatz, frischere Stempel (nicht „gratis", OF-5 Punkt 1) |
| **D0** | `dense` — bis 12 nächste 10-min-Stationen inkl. Niederschlagsstationen, Td, rr10/rr1h | `obsDense: 1` (gaugeOccurrence 0, gaugeRadar 0) | **OF-2**: dichter Ankersatz (je Größe die 6 besten nach spatialWeight), gemessener Td im Stationswert |
| **D1** | `dense` | `obsDense: 1, gaugeOccurrence: 1` | OF-3 (b) Auftrittsanker |
| **D2** | `dense` | `obsDense: 1, gaugeRadar: 1` | OF-3 (a′) Messgerät–Radar-Faktor am Punkt |
| **D3** | `dense` | `obsDense: 1, gaugeOccurrence: 1, gaugeRadar: 1` | beide zusammen |

Menge: die Entwicklungsmenge des Prüfstands bis zum Freeze von `fusion-11` (2026-10-07), `--set=voll` (alle 24 Archivtage
14.09.–07.10.2026), Rolle B ist das Maß des Prüfstands (Kernzellen), Rolle A der Zusatzblick. Maße wie im Prüfstand:
CRPS je Größe (t, td, ws, gust, precip, clct), Brier für `wet`; Vergleich je Zelle als Skill 1 − A/B auf identischen
endlichen Zeilen; dazu die einzelnen Vorläufe 1 … 6 h.

## 2 Behauptungen (aus dem Auftrag, Form der Messung)

| # | Größe | Fenster | Erwartung | Gilt, wenn |
|---|---|---|---|---|
| C1 | `wet` (Brier) | Vorlauf 1 h und 2 h | D1 **deutlich besser** als D0, am meisten in DE und CH | Skill ≥ +3 % bei 1 h (Rolle B, alle Länder) und an mehr Tagen besser als schlechter |
| C2 | `precip` (CRPS) | 1–2 h | D2 **besser** als D0 | Skill ≥ +1 % bei 1 h oder 2 h, nirgends (Land) ≤ −2 % |
| C3 | `precip`/`wet` | 3–6 h | D1/D2 höchstens ≈ +1–2 % gegen D0 | |Skill| ≤ 2 % bei 3–6 h |
| C4 | `precip`/`wet` | > 6 h | keine Änderung | Skill 0,00 % (byte-gleich) in 6–24 h und später |
| C5 | t, td | 0–6 h | D0 klein besser als R1 (≈ 0–2 %) | Skill −1 … +3 % |
| C6 | ws, gust | 0–6 h | D0 ≈ R1 (klein oder nichts) | |Skill| ≤ 1,5 % |
| C7 | alles | > 6 h | D0 gegen R1 nicht verschieden außer durch Anker/Stationswert bis 48 h | Skill 0,00 % ab 48–120 h |
| C8 | alles | alle | R1 gegen R0: Änderung nur über die Messung — t/td/ws/gust bis 48 h, Niederschlag/Bewölkung unverändert | precip/clct/wet Skill 0,00 % |

## 3 Regel der Auswahl (vor den Zahlen)

Der Kandidat „buscosun Fusion 12" = `obsDense: 1` plus GENAU die Messgeräte-Optionen, die diese Regel bestehen:

1. **Auftrittsanker (b)** kommt in das Bündel, wenn D1 gegen D0 bei `wet` an Vorlauf 1 h (Rolle B, alle Länder) Skill ≥ +2 %
   zeigt, an keinem Vorlauf 1–6 h `wet` oder `precip` um mehr als 1 % verliert und in keinem Land (Rolle B, Fenster 0–6 h)
   `wet` um mehr als 2 % verliert.
2. **Messgerät–Radar-Faktor (a′)** kommt in das Bündel, wenn D2 gegen D0 bei `precip` an Vorlauf 1 h oder 2 h (Rolle B)
   Skill ≥ +1 % zeigt, an keinem Vorlauf 1–6 h `precip` oder `wet` um mehr als 1 % verliert und in keinem Land (Fenster
   0–6 h) `precip` um mehr als 2 % verliert.
3. Bestehen beide, gilt das Bündel nur, wenn D3 gegen D0 bei `wet` 1 h UND `precip` 1–2 h nicht hinter das bessere der
   Einzelergebnisse um mehr als 0,5 % zurückfällt; sonst nur die stärkere Einzeloption (nach `wet`-1-h-Skill).
4. `obsDense: 1` selbst (D0 gegen R1) bleibt im Kandidaten, wenn keine Kernzelle (t, td, ws, gust × Fenster 0–6 h, 6–24 h,
   24–48 h × Land, Rolle B) um mehr als 1,5 % verliert und der Index-Näherung der Kernzellen ≥ −0,2 %. Verliert eine Zelle
   mehr, wird der Befund notiert und `obsDense` bleibt aus — Phasenergebnis „kein neuer Stand" (OF-5 Punkt 5).
5. Der Prüfstand-Volltest (OF-5) entscheidet nichts hier Gesagtes um; er misst den so gewählten Kandidaten gegen den
   Champion (Fusion 9) und gegen Fusion 11 (`--modus=vergleich`).

## 4 Leck-Erklärung

- Die Messungen des Replays stammen aus den Originalen (`scripts/obsfusion/build-dense-obs.mjs`, `obs-dense/<Tag>.json.gz`);
  die Wahrheit ist W1 (Stempel H, QC). Rolle B: keine Station ≤ 0,25 km vom Punkt (die eigene bleibt maskiert).
- Die Konstanten der Optionen (`OBS_DENSE_ANCHOR_K` 6, `GAUGE_OCC_*`: 2 h, 10 km, 0,5, τ 1 h, 40 min; `GAUGE_RADAR_*`: 3 h,
  10 km, ε 0,2 mm, Deckel 3, τ 2 h, 0,3 mm) sind SETZUNGEN vor der Messung; sie werden in dieser Phase nicht am Ergebnis
  nachgestellt (eine Nachstellung wäre ein Fit und ein neuer Freeze).
- Die Entwicklungsmenge enthält Tage, die die Entwicklung (Phasen AX/FS/F10/F11) gesehen hat; sauber richtet nur Spur P.
