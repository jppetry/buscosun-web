# Phase KF — Konfidenz-Score von buscosun Fusion 6 („zeigt fast immer sehr gering")

> Auftrag Jan, 2026-09-30 abends: „kannst du dir die Konfidenz von buscosun Fusion 6 einmal anschauen? sie zeigt tendenziell immer
> sehr geringe an." — **Diagnose, kein Code geändert** (der Score liegt in `src/pointForecast/fusion/uncertainty.ts` = Fusion-Engine,
> Änderung ist Jans Gate). Belege: `audit/fusion-konfidenz/cdn-probe.md` (Sonde am CDN), `audit/fusion-konfidenz/monotonie.md`
> (Score gegen die Wahrheit des Archivs), Skripte daneben (`conf-probe.mjs`, `conf-monotonie.mjs`).

## 0 Kurzfassung für Jan

**Die Beobachtung stimmt und ist messbar:** an 389 Stationspunkten und 7 Ausgabetagen (Archiv 16.–28.09., Kette der Stufe fs mit den
Tabellen von buscosun Fusion 6) liegt der T-Score im Median bei **36–40 %** am ersten und zweiten Tag, bei **32 %** an Tag 3–5 und bei
**0 %** ab Tag 6; **99–100 % aller Stunden liegen unter der Dashboard-Schwelle „solide" (70 %)**, 73–78 % unter 50 % (= „unsicher").
Bewölkung ist **in jeder Stunde 0 %**. Wind kommt im Median auf 49–57 %, Böe auf 44–54 %.

**Der Score ist trotzdem nicht sinnlos:** höhere Scores haben kleinere Fehler (T: Dezile monoton, CRPS 1,34 → 0,52 K vom untersten
zum obersten Dezil, Spearman ρ −0,32). Er ist nur **falsch skaliert und aus drei Faktoren zusammengesetzt, von denen einer nichts
erklärt** und zwei an bekannten Stellen fälschlich auf 0 fallen. Fünf Ursachen, geordnet nach Wirkung:

| # | Ursache | Wirkung | Beleg |
|---|---|---|---|
| V-KF-1 | **Einigkeit bei gelernter σ rechnet gegen die falsche Bezugsgröße.** Die Lernstufe ersetzt σ des Cube-Members durch σ_learned, lässt aber `parts.div` (Streuung zwischen den Quellen) stehen; `confidenceOf` bildet dann `1 − σ_div²/σ_learned²` — das ist 0, sobald die Quellen stärker auseinanderliegen als die gelernte σ (Innsbruck T +6/+24 h: Score 0 %). | T/Td: **13 % aller Stunden Einigkeit = 0** ⇒ Score 0 unabhängig von Schärfe; im Mittel Einigkeit T 59 %, Td 55 % | §2.1, §4.4 |
| V-KF-2 | **Bewölkung: Schärfe vergleicht die Mischungs-σ mit σ_clima 34 %.** Die Zwei-Atome-Mischung (AX-4) hat als Streuung 33–83 % — bei einem bimodalen Feld ist σ kein Schärfemaß. | Bewölkung Score ≡ 0 (p90 ab 7 h 0 %) | §4.1 |
| V-KF-3 | **Lage-Abschläge deckeln dauerhaft und erklären den Fehler nicht.** An 48 % (AT) / 59 % (CH) der Stunden ist Lage < 1 (Fall C 0,7 · \|Δh\| > 300 m 0,8 · Chunk-Rand 0,9 · …), das Produkt deckelt jede Stunde eines Orts (Waldmünchen 57 %, Innsbruck 80 %). Gegen den gemessenen Fehler ist der Faktor **unkorreliert** (ρ +0,02 T, +0,07 Wind/Böe/Bewölkung). | Ø Lage T 83–95 %, ρ ≈ 0 | §4.3 |
| V-KF-4 | **Produkt dreier Faktoren ≤ 1.** Auch ohne jeden Fehler ergibt eine gute Tagesvorhersage (σ_post 1 K gegen σ_clima 3 K ⇒ Schärfe 0,67) mit voller Einigkeit und einem Abschlag 0,8 einen Score von 0,53. Die Fixture in AP6 begann bei 0,73 (+0 h). | „hoch" (≥ 0,9) ist rechnerisch fast unerreichbar | §2.2 |
| V-KF-5 | **Anzeige-Schwellen aus der Vorlage, nie an die Score-Verteilung gebunden.** `confidenceWord`: ≥ 0,9 hoch · ≥ 0,7 solide · ≥ 0,5 mäßig · sonst „unsicher"; `confidenceClass` ≥ 0,7 grün (Kommentar: „Vorlage: 86/74 % grün, 61 % ocker"). Das Panel legt 80/50 als Grenzen an. Der AP9-Schritt „Score-Dezile monoton gegen CRPS" (Plan §2.2, §9.8) war bis heute nicht gemessen — jetzt in `monotonie.md`. | Dashboard sagt an praktisch jedem Ort „unsicher" | §2.3 |

**Was am besten den Fehler vorhersagt** ist die reine Ausgabestreuung σ_post (ρ 0,50 T, 0,55 Td, 0,44 Bewölkung) bzw. die Schärfe
1 − σ_post/σ_clima allein (−0,44 T, −0,55 Td, −0,40 Böe). Die Einigkeit trägt bei T/Td/Böe wenig dazu (−0,07 … −0,25 je Bin), ist
aber bei der Bewölkung der einzige Faktor mit Information (−0,34 … −0,55). Die Lage trägt nichts.

**Vorschlag (§6, Jans Entscheidung):** den Score neu als **kalibrierte Schärfe** definieren — je Größe eine monotone Abbildung von
σ_post/σ_clima auf 0…100, geeicht an den gemessenen Fehler-Dezilen des Archivs, so dass „hoch/solide/mäßig/unsicher" gemessene
Fehlerklassen sind statt Vorlagenzahlen; Einigkeit nur dort einrechnen, wo sie misst (Bewölkung: Atommasse statt σ; T/Td: gegen die
ungelernte Member-σ statt σ_learned); Lage aus dem Produkt nehmen und als Hinweis („Modell statt Radar", „Chunk-Rand") anzeigen.
Bis dahin kleinstmögliche Korrekturen: V-KF-1 (Einigkeit bei `learned` gegen `m0.sigma`) und V-KF-2 (Bewölkung: Schärfe aus der
größten Atommasse) — beides Motor-Änderungen mit Verifier-Fixtures, byte-gleich für alle anderen Größen.

## 1 Diagnose-Weg

1. Code gelesen: `confidenceOf` (`fusion/uncertainty.ts:180`), Aufrufer in `cubeSource.ts:1478` (native Schritte, `srcCount` des
   Cubes), `:1547` (Stationsschritte, `srcCount: 1`), `:1590` (interpoliert: Score × 0,9, Faktoren `null`), Ausgabe `output.ts`
   (`ConfidenceV2`), Anzeige `dashboard/model/rules.ts` (`confidenceClass`, `confidenceWord`), `build.ts` (`confOf` = `vars.t2m`),
   `PointForecastBands.tsx` (Index 0–100 + drei Faktoren), `PointForecastPanel.tsx` (Legende 80/50).
2. Sonde am echten Cube (CDN, Browser-Voreinstellung = Stufe fs): vier Orte, elf Stunden, fünf Größen ⇒ `cdn-probe.md`.
3. Formel isoliert nachgerechnet (`confidenceOf` mit gesetzten Zahlen, §2.2).
4. Messung gegen die Wahrheit des Archivs: Kette wie im Client (Variante P5 von `stack-extract.mjs`: `learned, learnedSpeed,
   learnedPrecip, learnedAtPoint, priorShrink:false, learnedClouds, stationValue`), Tabellen `fit\2026-09-30-ax4\fusion.ax4.json`
   (Fit 5e + 20 Atome) und `fit\2026-09-30-ax5\stack.archive.json`, Falten-Tabellen je Ausgabetag, Modus S; 7 Ausgabe-Slots
   (16., 18., …, 28.09.), 389 Punkte, 2 723 Motorläufe, je Größe 86 498–172 248 Zeilen an nativen Schritten ⇒ `monotonie.md`.
   Skript: `audit/fusion-konfidenz/conf-monotonie.mjs` (nur lesend; Laufzeit ≈ 2 min).

## 2 Befund im Code

### 2.1 Die Formel

```
spread = 1 − min(1, σ_post / σ_clima)                       Schärfe gegen die Klimatologie
agree  = min(1, srcCount/3) · { σ_ens²/(σ_ens²+σ_div²)      σ-Art ensemble
                              { 1 − σ_div²/σ_member²        sonst, wenn σ_div bekannt   ← bei `learned` ist σ_member = σ_learned
                              { 1                           ohne σ_div
lage   = ∏ Abschläge (set): Fall C 0,7 | Inversionskörper 0,9 | |Δh| > 300 m 0,8 | Chunk-Rand 0,9 | Interpolation 0,9 | Modell statt Radar 0,9
score  = spread · agree · lage
```

`cubeSource.ts:1368` (FL-AP5): `m = ls > 0 ? { sigma: ls, kind: 'learned', parts: { ...m0.parts, sys: 0 } } : m0` — die Teile des
PAP-6-Zweigs (`div`, `ens`) bleiben im Member, die σ wird ersetzt. `confidenceOf` kennt die Art `learned` nicht gesondert und nimmt
den Zweig „sonst": `1 − σ_div²/σ_learned²`. Im PAP-6-Zweig war σ_member² = σ_div² + σ_sys² ⇒ `agree = σ_sys²/(σ_div² + σ_sys²)` — ein
Anteil, immer in (0, 1). Mit σ_learned (aus dem Hindcast, typisch 0,9–1,3 K bei T) ist der Ausdruck nicht mehr beschränkt und wird
0, wo σ_div ≥ σ_learned — an Tal- und Bergorten der Normalfall. Eingeführt mit FL-AP5 (`6006dd6`, 25.09.), also **vor** buscosun
Fusion 6; die Stufe fs hat es nur sichtbar gemacht, weil sie die Voreinstellung wurde.

### 2.2 Nachrechnung mit gesetzten Zahlen (`confidenceOf` direkt aufgerufen, σ_clima 3 K, srcCount 3, keine Flags)

| Fall | Score | Schärfe | Einigkeit | Lage |
|---|---|---|---|---|
| divergence: σ_div 1,2 · σ_sys 1,2 ⇒ σ_m 1,70, σ_post 1,2 | 0,30 | 0,60 | 0,50 | 1 |
| **learned: σ_learned 1,0, `parts.div` 1,2 bleibt, σ_post 1,0** | **0,00** | 0,67 | **0,00** | 1 |
| learned: σ_learned 1,0, `parts.div` 0,8 | 0,24 | 0,67 | 0,36 | 1 |
| learned: σ_learned 1,0, `parts.div` unbekannt | 0,67 | 0,67 | 1,00 | 1 |
| ensemble: σ_ens 0,4 · σ_div 1,2 (enges Ensemble, uneinige Quellen) | 0,09 | 0,87 | 0,10 | 1 |
| Bewölkung: Mischungs-σ 45 % gegen σ_clima 34 % | **0,00** | **0,00** | 1 | 1 |
| Bewölkung: σ_post 14,5 % | 0,57 | 0,57 | 1 | 1 |
| gute Vorhersage σ_post 1,0 (Schärfe 0,67), Einigkeit 1, \|Δh\| > 300 m + Chunk-Rand | **0,48** | 0,67 | 1 | 0,72 |
| srcCount 2, sonst perfekt (σ_post 0,5) | 0,56 | 0,83 | 0,67 | 1 |

Die letzten zwei Zeilen zeigen V-KF-4: selbst ein Vorhersagefehler von null ergibt keinen Score über ≈ 0,6, sobald ein Abschlag
oder ein zweites Quellenpaar (`srcCount/3`) wirkt.

### 2.3 Anzeige

- Dashboard (`rules.ts`): Wort ≥ 0,9 „hoch" · ≥ 0,7 „solide" · ≥ 0,5 „mäßig" · sonst „unsicher"; Klasse ≥ 0,7 grün, sonst ocker
  (`is-fair`). Kachel „Konfidenz & Quellen": „Index 24 % · unsicher"; Zeitraumkopf „Konfidenz 21 % im Mittel"; Tageskarten Balken
  mit Prozent. Gelesen wird ausschließlich `vars.t2m.confidence.score` — die Größe mit dem zweitniedrigsten Score (§4.1).
- Bandbreite-Tab (`PointForecastBands.tsx`): Zahl rechts = Index 0–100 mit Tooltip „kein Wahrscheinlichkeitsmaß"; Detail nennt die
  drei Faktoren („Schärfe · Einigkeit · Lage").
- Punkt-Panel (`PointForecastPanel.tsx`): Farbpunkte mit Legende „Hoch 80–100 % · Moderat 50–79 % · Niedrig < 50 %".
- Alle drei stellen den Index als Prozentzahl neben ein Wort, das ein Nutzer als Wahrscheinlichkeit liest — die Provenienz-Notiz
  „kein Wahrscheinlichkeitsmaß" steht nur im Tooltip und in `calib`.

## 3 Sonde am CDN (Auszug; vollständig in `cdn-probe.md`)

Mittel über zehn Stunden (1 … 240 h) an vier Orten, Stufe fs: T **21 %** (Schärfe 50 · Einigkeit 49 · Lage 81), Td 25 %, Wind 46 %,
Böe 38 %, Bewölkung **1 %** (Schärfe 2). Kein T-Wert über 56 %; über alle 334 Schritte mit Konfidenz: Innsbruck Ø 8 %, Chasseral 9 %,
Waldmünchen 12 %, Hamburg 13 %. Innsbruck T +6 h und +24 h: Einigkeit 0 ⇒ Score 0 bei σ_post 1,3–1,4 K (V-KF-1); Waldmünchen: Lage
dauerhaft 0,57–0,63 (V-KF-3); Bewölkung überall Schärfe 0 (V-KF-2).

## 4 Messung gegen die Wahrheit des Archivs (vollständig in `monotonie.md`)

### 4.1 Verteilung des Scores (Median, Anteil < 0,5 / < 0,7)

| Größe | 1–6 h | 7–24 h | 25–48 h | 49–120 h | 121–240 h | 241–336 h |
|---|---|---|---|---|---|---|
| T | 36 % (78/99) | 40 % (73/100) | 38 % (76/100) | 32 % (96/100) | **0 %** (100/100) | 3 % (100/100) |
| Td | 30 % (76/94) | 36 % (71/94) | 40 % (70/93) | 39 % (66/100) | 26 % (97/100) | 16 % (100/100) |
| Wind | 49 % (52/92) | 56 % (39/85) | 57 % (38/87) | 56 % (32/97) | 33 % (83/99) | 24 % (99/100) |
| Böe | 44 % (64/95) | 48 % (57/92) | 48 % (57/92) | 54 % (43/100) | 38 % (80/100) | 32 % (100/100) |
| Bewölkung | 5 % (100/100) | **0 %** | 0 % | 0 % | 0 % | 0 % |

T 121–240 h: Ø Schärfe 14 %, Ø Einigkeit 28 % — σ_post 2,6 K gegen σ_clima ≈ 3 K und die gelernte σ unter σ_div.

### 4.2 Ist der Score informativ? Score-Dezile gegen CRPS (alle Bins)

| Größe | CRPS Dezil 1 → 10 | Monotonie-Verletzungen | ρ(Score, CRPS) |
|---|---|---|---|
| T | 1,34 → 0,52 K | **0 von 9** | −0,32 |
| Td | 1,43 → 0,60 K | 1 von 9 | −0,30 |
| Wind | 0,83 → 0,51 m/s (Dezile 4–9 flach 0,53–0,59) | 4 von 9 | −0,11 |
| Böe | 1,21 → 0,73 m/s | 4 von 9 | −0,17 |
| Bewölkung | 17,0 → 11,1 % (nur das oberste Dezil trennt; 9 Dezile bei 0 %) | 5 von 9 | −0,26 |

Über alle Bins hinweg trägt der Vorlauf den Großteil der Ordnung; **innerhalb** eines Bins ist der Zusammenhang schwach
(T ρ −0,09 … −0,16, Wind −0,01 … +0,02 bei 1–48 h).

### 4.3 Welcher Faktor trägt? Spearman ρ mit dem CRPS, alle Bins

| Größe | ρ(Score) | ρ(Schärfe) | ρ(Einigkeit) | ρ(Lage) | ρ(σ_post) |
|---|---|---|---|---|---|
| T | −0,32 | **−0,44** | −0,20 | **+0,02** | **+0,50** |
| Td | −0,30 | **−0,55** | −0,16 | −0,03 | +0,55 |
| Wind | −0,11 | −0,14 | −0,13 | +0,07 | +0,29 |
| Böe | −0,17 | **−0,40** | −0,07 | +0,07 | +0,40 |
| Bewölkung | −0,26 | −0,26 | **−0,34** | +0,07 | +0,44 |

Die Schärfe allein ordnet den Fehler besser als das Produkt (T −0,44 gegen −0,32; Böe −0,40 gegen −0,17). Die Lage ist bei jeder Größe
unkorreliert oder zeigt sogar das falsche Vorzeichen (Wind 1–6 h +0,12). Die Einigkeit ist bei der Bewölkung der stärkste Faktor
(1–6 h −0,55) — dort, wo die Schärfe wegen V-KF-2 ausfällt.

### 4.4 Einigkeit = 0 und Lage < 1

| Größe | Anteil Einigkeit = 0 | Ø Einigkeit | Land | Anteil Lage < 1 (T) | Ø Lage (T) |
|---|---|---|---|---|---|
| T | **13 %** | 59 % | DE | 21 % | 95 % |
| Td | **13 %** | 55 % | AT | **48 %** | 89 % |
| Wind | 2 % | 76 % | CH | **59 %** | 87 % |
| Böe | 8 % | 68 % | | | |
| Bewölkung | 0 % | 74 % | | | |

Häufigste Lage-Flags an T: `extrapolatedBelowModel` (Fall C, ×0,7) DE 10 % · AT 13 % · CH 12 %, `inversionBody` DE 7 %.

## 5 Befunde (D-28)

- **V-KF-1** (Motor, Fehler): Einigkeit bei σ-Art `learned` rechnet `1 − σ_div²/σ_learned²` (§2.1). *Mehrwert:* 13 % der T/Td-Stunden
  bekommen einen Score > 0 zurück; Innsbruck-Fälle verschwinden. *Skizze:* in `confidenceOf` die Art `learned` gesondert behandeln —
  entweder Einigkeit gegen die ungelernte Member-σ (`m0.sigma`, dazu im `MemberSigma` ein Feld `sigmaRaw`) oder als
  `σ_sys²/(σ_div² + σ_sys²)` aus `m0.parts`; Fixture in `verify:pv-cube` Block 10 (learned mit σ_div > σ_learned ⇒ Einigkeit > 0).
- **V-KF-2** (Motor, Fehler in der Sache): Schärfe der Bewölkung aus der Mischungs-σ. *Mehrwert:* Bewölkung bekommt überhaupt einen
  Score. *Skizze:* für `dist.kind === 'cloudMix'` Schärfe = größte Masse der drei Teile (`cloudMixParts`: klar/bedeckt/Mitte) oder
  1 − Entropie/ln 3; für die alte Normalform bleibt 1 − σ/σ_clima. `sigmaPostOf` liefert für `cloudMix` heute `dist.sigma` (σ der
  Mitte) — dieser Wert ist zusätzlich falsch beschriftet (er ist nicht die Streuung der Ausgabe).
- **V-KF-3** (Design): Lage-Abschläge sind `set` und gegen den Fehler unkorreliert. *Mehrwert:* Orte in den Alpen verlieren den
  dauerhaften Deckel (0,57–0,80). *Skizze:* Lage aus dem Produkt nehmen, die Flags weiterhin als Hinweiszeilen anzeigen (das Panel
  zeigt sie schon); falls behalten: je Flag den Abschlag am Archiv messen (`calib.json confDiscount` ist dafür seit AP13 vorgesehen —
  die Messung hier sagt: ≈ 1,0 für jedes Flag bei T).
- **V-KF-4** (Design): Produkt dreier Faktoren ≤ 1, Skala nie geeicht. *Skizze:* §6.
- **V-KF-5** (Anzeige): Schwellen 0,9/0,7/0,5 (Dashboard) und 0,8/0,5 (Panel) stammen aus der Vorlage; die drei Anzeigen
  widersprechen sich zudem in den Grenzen. *Skizze:* Schwellen aus den gemessenen Fehler-Dezilen ableiten (§6) und an einer Konstante
  im Motor führen, damit Dashboard, Panel und Bandbreite dieselben Klassen zeigen.
- **V-KF-6** (Anzeige): Die Prozentzahl neben einem Wort liest sich als Wahrscheinlichkeit; „kein Wahrscheinlichkeitsmaß" steht nur
  im Tooltip. *Skizze:* das Wort („solide") führen, die Zahl in die Details; oder die Zahl als das ausweisen, was sie nach §6 wäre
  (erwarteter Fehler, z. B. „±0,8 °C typisch").
- **V-KF-7** (Messung): Der AP9-Schritt „Score-Dezile gegen CRPS" fehlte seit AP6 (16.09.); `conf-monotonie.mjs` ist der Anfang —
  gehört als `--confidence`-Ausgabe in `score-archive.mjs`, damit jede neue Nummer von buscosun Fusion ihn mitliefert.
- **V-KF-8** (Motor, klein): Stationsschritte (`cubeSource.ts:1547`) bekommen `srcCount: 1` ⇒ Einigkeit ≤ ⅓ auch dann, wenn die
  Station gut liegt; interpolierte Schritte tragen nur Score × 0,9 ohne Faktoren (die Sonde zeigt dort `—`).

## 6 Vorschlag zur Entscheidung (E-KF)

| Nr. | Frage | Vorschlag | Berührt |
|---|---|---|---|
| **E-KF-1** | Score neu definieren als **kalibrierte Schärfe**: je Größe `score = F_v(σ_post/σ_clima)`, wobei F_v die monotone Abbildung ist, die den Wert auf die gemessene Fehlerklasse legt (z. B. Perzentil der Zeile im Archiv, oder direkt „erwarteter absoluter Fehler" aus σ_post) — statt Produkt aus drei Faktoren | ja; Einigkeit nur für die Bewölkung (Atommasse) und als Zusatz bei T/Td, wenn sie nach V-KF-1 wieder misst; Lage raus (Hinweise bleiben) | `uncertainty.ts`, `output.ts` (`ConfidenceV2` behält `spread/agree/lage` als Auskunft), `v2codec` **nicht** (Zahlen bleiben 0…1 auf 0,001) ⇒ neue Nummer „buscosun Fusion 7" (Konvention) |
| **E-KF-2** | Bis zur Neudefinition die zwei Fehler V-KF-1 und V-KF-2 minimal beheben? | ja, als eigener kleiner Schritt mit Fixtures; byte-gleich für Wind/Böe/Niederschlag und für alle Zahlen außer `confidence` | Motor; Archiv-Vergleich vorher/nachher mit `conf-monotonie.mjs` |
| **E-KF-3** | Schwellen der Wörter aus dem Archiv ableiten: z. B. „hoch" = oberstes Fehler-Quintil (T CRPS ≤ 0,55 K), „solide" = zweites, „mäßig" = drittes, „unsicher" = unterste zwei — je Größe und Vorlauf-Bin gleich benannt | ja, eine Tabelle im Motor (`CONF_CLASSES`, Provenienz `archive`), Dashboard/Panel/Bandbreite lesen sie | `rules.ts`, `PointForecastPanel.tsx`, `PointForecastBands.tsx` |
| **E-KF-4** | Anzeige: Wort statt Prozentzahl in der Kachel; Zahl (und die drei Faktoren) in den Details | Jans Geschmack — der Leitsatz „Ehrlichkeit ist Produktprinzip" spricht für den erwarteten Fehler in der Einheit („typisch ±0,8 °C") statt einer Prozentzahl | Dashboard (E-DB-Linie), Panel |
| **E-KF-5** | `score-archive.mjs` um die Konfidenz-Dezile erweitern (V-KF-7), Gate: 0 Monotonie-Verletzungen bei T/Td, ρ(Score) ≤ ρ(Schärfe) − 0,02 nicht schlechter | ja | `scripts/fusionfit/` (AP9-Linie) |

Reihenfolge, wenn Jan zustimmt: E-KF-2 (klein, sofort messbar) → E-KF-5 (Messung im Scorer) → E-KF-1/3 (Neudefinition + Schwellen,
eine Phase mit Gate am Archiv: Dezile monoton, Klassenanteile plausibel) → E-KF-4 (Anzeige).

## 7 Nicht geändert, Fallen

- **Kein Code unter `src/` geändert.** Neue Dateien nur unter `audit/fusion-konfidenz/`.
- Die Archiv-Messung ist **indikativ** (13 Sommertage, Modus S = Punkt an der Station, Falten-Tabellen); sie sagt nichts über die
  Vorhersagegüte, nur über die Ordnung des Scores. Bewölkung nur DE (Wahrheit `n` nur im POI-Netz).
- Sonde am CDN: ohne `learnedSource/climaSource/stackSource: 'json'` und `stage: 'fs'` rechnet `getPointForecastFromCube` in Node die
  alte Kette (der erste Lauf der Sonde) — die Browser-Voreinstellung kommt aus `defaultCubeIo()`, nicht aus dem Aufruf.
- Node-Imports aus dem Scratch-Verzeichnis brauchen `file:///C:/…`-URLs; `v2.axis.steps` (nicht `v2.steps`).

## 8 Umsetzung E-KF-2 … E-KF-4 (Jans Freigabe 30.09. abends, „mach E-KF-2 bis E-KF-4 umsetzen")

### 8.1 Was gebaut wurde

| Nr. | Änderung | Dateien |
|---|---|---|
| E-KF-2 / V-KF-1 | `MemberSigma.raw` (σ und Art des PAP-6-Zweigs) — `cubeSource.ts` füllt es, wenn die gelernte σ die Member-σ ersetzt; `confidenceOf` misst die Einigkeit gegen `raw` (Art und σ), sonst wie bisher. Negativkontrolle: ohne `raw` alte Rechnung | `fusion/uncertainty.ts`, `cubeSource.ts:1368` |
| E-KF-2 / V-KF-2 | `cloudMixSharpness` (größte Atommasse, von ⅓ bis 1 auf 0…1 gestreckt, `set`) und `ConfidenceInput.spread` (vorgerechnete Schärfe); `spreadOverrideOf` in `cubeSource.ts` setzt sie nur für `dist.kind === 'cloudMix'` (native und Stationsschritte) | `fusion/uncertainty.ts`, `cubeSource.ts` |
| E-KF-3 | Neues importfreies Modul `fusion/confidenceClasses.ts`: fünf Wörter (sehr unsicher · unsicher · mäßig · solide · hoch), Schwellen = Score-Perzentile P20/P40/P60/P80 je Größe aus `classes.json` (Archiv nach E-KF-2), je Klasse Ø \|p50 − y\| und Ø CRPS, Provenienz `archive`; `confidenceWordOf`, `confidenceClassOf` (good = solide/hoch), `confidenceTypicalError`, Selbsttest `verifyConfidenceClasses` (in `verify:pv-cube` Block 10 und `verify:dashboard` Block 4). Dashboard-Regeln delegieren (`rules.ts`), Panel-Legende und Bandbreite-Tab lesen dieselbe Tabelle | `fusion/confidenceClasses.ts`, `dashboard/model/rules.ts`, `PointForecastPanel.tsx`, `PointForecastBands.tsx` |
| E-KF-4 | Kachel „Konfidenz & Quellen": `<Wort> · typisch ±x °C` (gemessener Fehler der Klasse) statt „Index 24 % · unsicher"; der Index steht im Tooltip (`title`) und weiter in `ConfVM.value`. Zeitraumkopf „Konfidenz im Mittel <Wort>", Tageskarten Balken = Index, Text = Wort. Bandbreite-Tab: Zahl + Wort. `ConfVM.typical`, Fixture, Herkunft P22/P23 | `dashboard/tiles.tsx`, `model/build.ts`, `model/types.ts`, `fixture.ts`, `origin.ts` |
| — | Die Klassen-Notiz steht NICHT in `calib` des Motors (sie ist eine Anzeige-Einstufung, keine Setzung der Rechnung; Block (4)/(19) verlangen für `calib` set/literature/physical/null und Zuordnung je Größe) | — |
| — | Skript `conf-monotonie.mjs` schreibt zusätzlich §5 Klassen und `classes.json`; Stand VOR E-KF-2 in `monotonie-vor-kf2.md` | `audit/fusion-konfidenz/` |

### 8.2 Messung nach E-KF-2 (gleiche Slots, Punkte, Tabellen; `monotonie.md`)

| Größe | Median-Score 1–6 h / 7–24 h / 49–120 h / 121–240 h | Einigkeit = 0 | ρ(Score, CRPS) vorher → nachher | Dezil-Verletzungen vorher → nachher |
|---|---|---|---|---|
| T | 37 / 40 / 33 / **6 %** (vorher 36 / 40 / 32 / 0) | 13 % → **0 %** | −0,32 → −0,31 | 0 → 0 |
| Td | 47 / 47 / 54 / 34 % (vorher 30 / 36 / 39 / 26) | 13 % → 0 % | −0,30 → **−0,36** | 1 → 1 |
| Wind | 49 / 56 / 56 / 33 % (unverändert) | 2 % → 0 % | −0,11 → −0,05 | 4 → 4 |
| Böe | 44 / 48 / 54 / 38 % (unverändert) | 8 % → 0 % | −0,17 → −0,15 | 4 → 4 |
| Bewölkung | **20 / 23 / 20 / 0 %** (vorher 5 / 0 / 0 / 0) | — | −0,26 → **−0,48** | 5 → **0** |

Lesart: die beiden Fehler sind weg (kein Score mehr wegen Einigkeit 0, Bewölkung hat wieder einen Score und ordnet den Fehler jetzt
am besten von allen Größen). Bei T/Wind/Böe verliert der Score etwas Rangkorrelation (Wind −0,11 → −0,05): die Einigkeit 0 war
dort zum Teil informativ (uneinige Quellen ⇒ größerer Fehler), nur eben als 0 ausgedrückt — E-KF-1 (kalibrierte Schärfe) bleibt der
eigentliche Weg. **Wind trennt kaum:** Ø CRPS je Klasse 0,63 / 0,58 / 0,58 / 0,59 / 0,54 m/s — mäßig und solide sind innerhalb 0,01
gleich, der Selbsttest nennt das. T 121–240 h bleibt zu Recht „sehr unsicher" (Schärfe 14 %).

### 8.3 Klassen (aus `classes.json`, 755 463 Zeilen)

| Größe | P20 / P40 / P60 / P80 | typischer Fehler sehr unsicher → hoch |
|---|---|---|
| T | 15 / 29 / 38 / 46 % | 1,75 → 0,81 K |
| Td | 30 / 41 / 50 / 63 % | 1,84 → 0,86 K |
| Wind | 37 / 49 / 60 / 68 % | 0,87 → 0,74 m/s |
| Böe | 35 / 48 / 57 / 67 % | 1,42 → 0,99 m/s |
| Bewölkung | 9 / 16 / 23 / 31 % | 37,9 → 12,9 % |

Anteil „solide + hoch" bei T je Bin: 1–6 h 49 %, 7–24 h 57 %, 25–48 h 48 %, 49–120 h 34 %, ab 121 h 0 % — die Einstufung bewegt sich
mit dem Vorlauf, wie sie soll. Die Tabelle ist **relativ** (jedes Wort deckt ein Fünftel der Archivstunden seiner Größe); ihre
Bedeutung ist der gemessene Fehler daneben. Neufit mit jeder neuen Nummer von buscosun Fusion (E-KF-5, offen).

### 8.4 Gates

- `npm run typecheck` 0 · `verify:dashboard` **80/80** (Block 4 neu: Wörter/Klassen/typischer Fehler + 11 Modulprüfungen) ·
  `verify:pv-cube` **397/398** — die eine rote Prüfung ist (35) „echter Schema-5-Chunk aus dem Daten-Repo": der lokale Klon trägt seit
  dem heutigen Cron-Lauf `2026093015` nur noch Schema-6-Chunks (61 Ebenen), die Prüfung nimmt den neuesten Chunk statt den neuesten
  mit Schema-Byte 5 (**V-KF-9**, unabhängig von KF, fällt an HEAD genauso); (8)/(9) Kostengates fielen einmal unter Fremdlast und
  bestanden im Einzellauf · `verify:pv-fusion` 235/235 (Live-Pfad unberührt) · `verify:point-client` 171/171 · Build 249/249 ·
  `npm run budget` grün: totalJs 1512,7 / **1514** (Notiz in `budget.json`), eagerJs 108,6 unverändert.
- Browser (Dev-Server, München, `?ansicht=dashboard`): Kachel „mäßig · typisch ±1,0 °C" an Stunde 0, Zeitraumkopf „Konfidenz im
  Mittel unsicher", Tageskarten unsicher / mäßig / mäßig, Konsole ohne Fehler —
  `audit/fusion-konfidenz/dashboard-konfidenz-kachel-2026-09-30.jpg`.
- Byte-Gleichheit: Motor-Ausgaben außer `confidence` unverändert (die Korrekturen berühren nur `confidenceOf`-Eingaben);
  `uncertainty: false` weiter byte-gleich (Block 10). Die Zahlen `spread/agree/lage` bleiben 0…1 auf 0,001 ⇒ `v2codec` unverändert.
- Fünf Selbstverifikationsfragen: 1 Funktionserhalt — Index weiter in `ConfVM.value`, Tooltip und Bandbreite-Tab; Balken der
  Tageskarten unverändert. 2 Desktop — nur Text der Konfidenz-Zeilen geändert, Layout gleich (Screenshot). 3 Touch — keine neuen
  Ziele. 4 Konsole sauber. 5 keine neue Rechnung im Render-Pfad (Tabellen-Lookup).

### 8.5 Offen

- **E-KF-1** (kalibrierte Schärfe, neue Nummer) und **E-KF-5** (Dezile im Scorer) — nicht Teil dieses Auftrags.
- **V-KF-9** Verifier (35) muss den neuesten Chunk MIT Schema-Byte 5 suchen (oder eine gespeicherte Fixture nehmen).
- **V-KF-10** Wind: Klassen mäßig/solide ununterscheidbar (§8.2) — mit E-KF-1 neu schneiden.
- Nach Konvention ist der Stand mit den zwei Korrekturen **nicht mehr „buscosun Fusion 6"** (die Kette hat sich in `confidence`
  geändert): Bezeichnung nach Jans Entscheidung, Vorschlag „buscosun Fusion 6.1" oder „7", sobald committet.
