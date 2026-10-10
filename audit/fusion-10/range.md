# F10 — Spezialist „Langfrist & Ensembles“ (Kandidat K3, Zweig `f10/range`)

> Teil von `audit/fusion-10.md` (Phase F10, 07.10.2026). Worktree `C:\dev\buscosun-web-wt\f10-range`, Basis `6e1c88f`.
> Alle Zahlen hier stammen aus `scripts/fusion10/prescreen.mjs` (nur lesend, kein Prüfstand-Maß); Verzeichnisse unter
> `C:\dev\buscosun-fusion10-data\prescreen\k3-*` (Logs, `*.compare.txt`, `*.perland.txt` daneben). Zeitbudget 55 min.

## 1 Diagnose

- Die Stufe `fs` setzt `priorShrink: false` (`fusionRelease.ts:87` `FUSION_BASE_OPTIONS`) ⇒ `fuseAt` baut den Kontext mit
  `priorShrink: false` für JEDE Stunde (`cubeSource.ts:1156`, vor dieser Änderung Zeile 1125); in `fuse.ts:513–517` wird damit
  β = 1, sobald alle Member eine explizite σ tragen (`noShrink = shrinkOff && explicit === members.length`) — die Kombination ist
  die Antwort, die Klimatologie trägt nur jenseits der Daten. Richtig bei 0–120 h (Phase FS, D2), in der Langfrist nicht: die
  Entwicklungsmenge zeigt Wind ab 120 h UNTER der Stationsklimatologie (120–240 h −17 %, 240–336 h −54 %, Abdeckung q10–q90
  68–74 %, Bias +0,5 m/s) und T bei 240–336 h mit Abdeckung 63 % (`audit/fusion-10.md` §1.3).
- Die Ausnahmeform `{ except: ['wind', 'gust'] }` (`priorShrinkWind`, `cubeSource.ts:900`) hält den Schritt für Wind und Böe an
  ALLEN Vorläufen — E-AX-11 maß sie bei 0–120 h ohne Station als schlechter (Böe −3,5…−5,7 %!, DE-Wind bis −11 %!), bei
  126–240 h als besser (`audit/fusion-ausbau.md` §6h). Der Hebel ist der Vorlauf — und, wie sich zeigt, das Land.
- `ensMember` (AX-7) liest die Schema-6-Ebenen `<id>_ens`; der Hindcast trägt nur `*_sd_ens`/`*_q10/q90` (`audit/fusion-10.md`
  §1.2) ⇒ in Spur R wirkungslos (`ensMemberCount.noPlanes`), nicht verfolgt.
- Die Vorlauf-Abhängigkeit kostet nichts: `fuseAt(samples, leadH, …)` bekommt `leadH` schon (`cubeSource.ts:1134`).

## 2 Gebaut (nur `src/pointForecast/cubeSource.ts`; alle Optionen voreingestellt aus, ohne Wert byte-gleich — Stufe unverändert)

| Option (`FuseCubeOptions`) | Wirkung | Konstanten | Rückfall |
|---|---|---|---|
| `priorShrinkWindFromH?: number` (K3 a) | mit `priorShrink: false` behalten Wind und Böe den Klimatologie-Schritt nur an Schritten mit `leadH ≥` Wert (`priorShrinkAt(leadH)` in `fuseAt`); `priorShrinkWind: true` hat Vorrang | Vorlauf als Wert (geprüft 120, 168) | Option weglassen = Fusion 9 |
| `priorShrinkWindCountries?: string[]` (K3 a′) | K3 a nur an Punkten, deren `input.country` in der Liste steht | — | wie oben |
| `sigmaInflateFromH?: number` (K3 b) | ab `leadH ≥` Wert σ von T ×1,15 und Windgeschwindigkeit ×1,25 NACH dem Stationswert, Mittel unverändert; nur `normal`/`truncatedNormal` (`rice` bleibt, Mittel wandert mit σ — gezählt) | `SIGMA_INFLATE_LONG = { temperature: 1.15, wind: 1.25 }` (set) | wie oben |

Spuren: Stufen-Notizen `priorShrinkWindFromH:set` / `sigmaInflate:set`, Zählnotizen, `StepFlag` `sigmaInflate`. `npm run typecheck` grün.
Byte-Gleichheit ohne Option: alle Zellen ≤ 120 h (und alle Nicht-Wind-Zellen bei K3 a) zeigen im Pre-Screen exakt 0,00 % [0/0].

## 3 Pre-Screen (Rolle B, Skill 1 − A/B des CRPS_Q, „+“ = Variante besser; * Kernzelle)

**Schnellmenge, 4 gemeinsame Tage (16./19./22./25.09.), gegen `f9-schnell`:**

| Variante | ws 48–120* | ws 120–240* | ws 240–336* | Böe 120–240 | Böe 240–336 | T 120–240* | T 240–336* | Index (99 Zellen) |
|---|---|---|---|---|---|---|---|---|
| a `priorShrinkWindFromH: 120` | 0,00 | **+2,00** [3/1] (DE −7,03 · AT +6,96 · CH +11,92) | **+8,88** [4/0] (DE −3,09 · AT +14,15 · CH +20,71) | +7,82 (DE +2,1 · AT +15,2 · CH +5,7) | +6,50 | +0,01 | 0,00 | +0,44 % (DE −0,31 · AT +0,64 · CH +0,99) |
| a `priorShrinkWindFromH: 168` | 0,00 | +1,64 [3/1] | +8,88 [4/0] | — | — | +0,01 | 0,00 | +0,41 % |
| b = a/120 + `sigmaInflateFromH: 120` | 0,00 | +0,59 [4/0] (DE −2,44 · AT +2,54 · CH +3,69) | +7,38 [4/0] (DE +1,58 · AT +9,98 · CH +13,06) | +7,82 | +6,50 | **+0,56** [4/0] (DE +0,78 · AT +0,25 · CH +0,49) | **+1,31** [4/0] (DE +1,58 · AT +0,69 · CH +1,30) | +0,34 % |

Td, Niederschlag, Bewölkung, nass und alles ≤ 120 h: 0,00 % [0/0] in jeder Variante. T +0,01 % bei K3 a ist unerklärt (V-F10-r3).

**Hindcast außerhalb des Tresors, 6 Slots 00 UTC 08.–23.09.2025 (ohne Station, ohne Messung), a/120 gegen Fusion 9 (`k3-base-hindcast`):**

| Zelle | alle | DE | AT | CH |
|---|---|---|---|---|
| ws 48–120* | **−0,28** [2/4] | −0,57 | +0,19 | −0,03 |
| ws 120–240* | **−8,68** [1/5] | **−18,04** | +2,52 | +2,26 |
| ws 240–336* | **−6,59** [2/4] | **−19,17** | +8,61 | +7,30 |
| Böe 120–240 / 240–336 | +2,96 [6/0] / +2,42 [6/0] | −2,92 / −2,19 | +13,46 / +13,20 | +2,57 / +1,66 |
| Index (63 Zellen) | −0,27 % | | | |

Lesart: (1) Die Fensterkante — 48–120 h schließt den Schritt 120 ein, `fromH: 120` greift dort ⇒ Kernzelle ≤ 120 h minimal schlechter
(−0,28 %, DE −0,57 %) = **Veto nach der Regel des Auftrags**; sauber ist `fromH: 126` (erster nativer t3-Schritt nach 120 h) oder 168.
(2) Das Vorzeichen hängt am Land, nicht am Vorlauf: DE verliert ohne Station deutlich (Hindcast −18/−19 %, Schnellmenge −7/−3 %),
AT/CH gewinnen in beiden Mengen (+2…+21 %). Das ist das E-AX-11-Muster (DE-Wind −11 %) — die DE-Stationsklimatologie (flach, ρ
hoch) zieht die Kombination offenbar zu stark, während die Lernstufe dort schon trägt. (3) Die AT/CH-Form (`priorShrinkWindCountries:
['AT','CH']`) ist aus denselben Läufen ABLEITBAR, weil der Schritt je Punkt wirkt und kein Punkt einen anderen beeinflusst: DE-Zellen
byte-gleich (0,00), AT/CH-Zellen wie oben — Schnellmenge ws 120–240 AT +7,0/CH +11,9, 240–336 AT +14,2/CH +20,7; Hindcast AT
+2,5/+8,6, CH +2,3/+7,3; keine Kernzelle schlechter (bei `fromH ≥ 126`). Ein eigener Lauf hat im Zeitbudget nicht mehr gepasst.
(4) K3 b (σ ×1,15 T, ×1,25 Wind) gewinnt T in allen drei Ländern (+0,25…+1,58 %) und dämpft den DE-Windverlust (−7,0 → −2,4);
im Hindcast nicht gemessen.

## 4 Risiken

- Hindcast-Zahlen tragen keine Station und keine Messung (Spur-R-Kette); die Schnellmenge trägt beides — das Vorzeichen für DE
  ist in beiden gleich, die Größe im Hindcast dreimal so groß. 4 bzw. 6 Tage, kein Signifikanztest; G2 des Prüfstands würde DE ws
  120–240 bei −7…−18 % wahrscheinlich als „signifikant schlechter“ werten ⇒ K3 a ohne Länderliste ist KEIN sicherer Rückfall.
- `SIGMA_INFLATE_LONG` ist eine Setzung ohne Fit (Provenienz `set`), und sie überschneidet sich mit K1 (gefittete Mischung zur
  Klimatologie): nur eines von beiden in die Stufe.
- K3 b lässt eine `rice`-Geschwindigkeit unverändert (ohne `learnedSpeed`-Gesetz, Stratum fehlt) — im Pre-Screen nicht gezählt, die
  Notiz `sigmaInflate:` nennt die Zahl je Punkt.
- Die Zellgrenze 120 h liegt IM Fenster 48–120: jede Vorlauf-Schwelle muss > 120 sein, sonst berührt sie eine Kernzelle ≤ 120 h.

## 5 Offene Punkte (Vorschläge)

- **V-F10-r1 Länderform des Langfrist-Schritts für Wind.** Mehrwert: AT/CH-Wind 120–336 h +2…+21 % CRPS, DE unberührt, 0 Fit.
  Skizze: `priorShrinkWindFromH: 126` + `priorShrinkWindCountries: ['AT','CH']` als EIN Registereintrag (Konstante) — vorher ein eigener
  Pre-Screen-Lauf (Schnellmenge + Hindcast) und die Erklärung, warum DE verliert (Stationsklimatologie-σ des Winds `windSigmaAt(h, tpi)`
  gegen das gelernte Member je Land prüfen, `cubeSource.ts:1096`).
- **V-F10-r2 σ-Weitung der Langfrist nur für T.** Mehrwert: T 120–336 h +0,3…+1,6 % in allen Ländern, Abdeckung 63–67 % → Richtung 80 %.
  Skizze: Faktor je Fenster aus dem Abdeckungsdefizit der Entwicklungsmenge ableiten (zwei Zahlen, `literature`/`set`), Hindcast-Lauf nachholen; entfällt, wenn K1 die Varianz fittet.
- **V-F10-r3 T ändert sich um +0,01 % bei K3 a**, obwohl nur Wind/Böe den Schritt behalten. Skizze: einen Punkt mit beiden Kontexten
  rechnen und die Kopplung finden (Vermutung: `onWeights`/β-Mittelung oder der Stationswert mit `L − M` am Wind).
- **V-F10-r4 Schema-6-Ensemblemittel im Hindcast für einen fairen `ensMember`-Test.** Skizze: `scripts/hindcast/` um die Spalten
  `t2m_ens/u10_ens/v10_ens/precip_ens` aus dem IFS-ENS-Member-Mittel (Open-Meteo `ensemble` liefert 50 Member ⇒ Mittel = eine Spalte;
  dynamical AIFS-ENS analog) für die 378 Tage außerhalb des Tresors erweitern — ≈ 1 Abruf je Punkt und Slot mehr, Schema-Stempel im
  Slot, Tresor unberührt; danach `ensMember` im Pre-Screen `--set=hindcast` messbar.
