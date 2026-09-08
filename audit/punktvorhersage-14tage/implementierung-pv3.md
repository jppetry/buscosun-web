# PV3 — Implementierung des buscosun-Fusion-Algorithmus

> Stand **2026-09-06** · Phase PV3 (Kern) + PV3b (0–336 h) · **Code, default-off hinter `distribution: true`**
>
> **§1–§7 beschreiben den Kern (Gate GPV3, 2026-09-05). §8 die Erweiterung auf
> 336 h in drei Stufen (Gate GPV3b, 2026-09-06) — dort stehen auch die Messwerte,
> welche Größe bis wohin trägt, und warum Stufe 4 (GEFS) nicht gebaut ist.**
> Diagnose und Plan: `audit/punktvorhersage-14tage.md` (PV0) und
> `punktvorhersage-14tage/mathematik-spezifikation.md`.
> Nach der Erstfassung durch **drei unabhängige Fachprüfungen** gegangen
> (Statistik/Verifikation · operationelle Meteorologie DACH · Integration und
> Robustheit); deren Befunde sind in §5 abgearbeitet.

---

## 1. Was gebaut wurde

Sieben neue, DOM- und netzfreie Module unter `src/pointForecast/fusion/` plus eine
Verdrahtung, die ohne Flag **nichts** ändert.

| Modul | Aufgabe |
|---|---|
| `dist.ts` | Verteilungsfamilien (normal · censoredNormal · logCensored · rice), Quantil/CDF/Mittel, generischer CRPS aus dem Quantil-Integral, PIT mit Atomen, mittelwerterhaltende Aufweitung |
| `priors.ts` | **Alle** Parameter an einer Stelle: ACC-Kurven ρ(τ) je Quelle × Variable, Amplituden, Fußabdrücke, Repräsentativität, Fehler-Korrelationen, Regime, Wind-Abschirmung |
| `combine.ts` | Minimum-Varianz-Kombination mit Fehlerkorrelation; **nicht-negative Gewichte** per Aktiv-Menge; Cholesky mit zeilenrelativem Jitter; konservativer Rückfall |
| `terrainScale.ts` | Höhenstreuung σ_z(L) auf sechs Skalen, TPI, Sky-View aus acht Azimut-Horizonten, `sampledCount` als Ehrlichkeits-Wächter |
| `meteo.ts` | Feuchtkugel, Phasenwahrscheinlichkeit über die Temperaturverteilung, Schneefallgrenze, Kaltluftsee (Bimodalität **und** Sockel), Föhn, strahlungsgewichtete Bewölkung |
| `fuse.ts` | Die Kette; `fuseHour(samples, lead, ctx) → FusedPoint` |
| `attach.ts` | Adapter: nutzt den **bereits geladenen** DEM-Sampler, memoisiert die Klimatologie je Tag, gibt alle 32 Stunden den Hauptthread frei |

Dazu: `scripts/verify-pv-fusion.mjs` + npm-Alias `verify:pv-fusion`, Eintrag in `ci.yml`.

## 2. Die Kette

```
1 GEOMETRIE   Quelle → Abfragepunkt: Lapse-Rate (T), Abschirmung/Beschleunigung (Wind),
              Mikroklima je nach dem, was die Quelle vom Gelände sieht
2 FEHLER      sigma^2 = sigma_skill(tau)^2 + sigma_rep(Punkt)^2
              sigma_skill aus der Anomaliekorrelation rho(tau) der Quelle
              sigma_rep   aus Geometrie: gamma*sigma_z(L) + Hoehe + Distanz * Gelaendekomplexitaet
3 KALIBRIEREN Anomalie / (rho*alpha)  =>  die Quelle wird zu einer erwartungstreuen Messung
4 KOMBINIEREN w = Sigma^-1 1 / (1' Sigma^-1 1) mit Fehlerkorrelation, Gewichte >= 0
5 SCHRUMPFEN  Klimatologie als Prior => beta = sc^2/(sc^2+se^2), effektiv beta = rho
6 FORM        Rice (Wind) · zensiert-lognormal (Niederschlag) · zensiert-normal (Prozente)
              + Regime-Aufweitung (Kaltluftsee, Foehn, Phasenuebergang)
```

## 3. Was dadurch ersetzt wird

| Bisher | Ort | Ersetzt durch |
|---|---|---|
| `FAMILY_CURVES` (5 Kurven × 4 Parameter) | `leadTimeWeights.ts` | ρ(τ) je Quelle × Variable |
| `VARIABLE_MULTIPLIER` (8 × 5 Faktoren) | `leadTimeWeights.ts` | dieselben ρ-Kurven, variablenweise |
| `spatialWeight` (nur für `obs`) | `leadTimeWeights.ts` | σ_rep für **jede** Quelle |
| `ANCHOR_TOL_C = 3,5 °C` | `pointForecast.ts` | entfällt — Abweichung wird über Varianzen bewertet |
| `SKILL_DECAY` (τ/floor je Variable) | `pointForecast.ts` | entfällt — Konvergenz folgt aus σ_est |
| Familienbonus `+0,05 je Familie` | `pointForecast.ts` | entfällt — die Fehlerkorrelation entscheidet |
| Böen-Fallback `1,4 × Wind` | `pointForecast.ts` | stabilitätsabhängiger Faktor + Nebenbedingung Böe ≥ Mittelwind |
| Wind-Speed-up `0,15 %/m` | `pointForecast.ts` | Abschirmung/Beschleunigung aus dem TPI, auf dem **Mittelwert** |
| `confidence` 0..1 (Anzeige-Heuristik) | `pointForecast.ts` | Quantile + PIT-fähige Verteilung |
| Phase über Trockentemperatur 0,5/2,5 °C | `precipType.ts` | P(Schnee) über die **Feuchtkugel**, integriert über die Temperaturverteilung |

> **„Ersetzt" heißt noch nicht „entfernt".** Der Altpfad läuft unverändert weiter und ist der
> Default. Die Ablösung ist PV4/PV5 und **erst nach der Messung** zulässig (`verifikation.md`
> §7.0) — Funktionserhalt.

## 4. Gate GPV3 — Belege (2026-09-05)

| Prüfung | Ergebnis |
|---|---|
| `npm run verify:pv-fusion` | **148/148** (dist 37 · combine 20 · terrainScale 20 · meteo 30 · fuse 41) |
| davon Negativkontrollen | **9** — jede prüft, dass ein abgeschalteter Kernmechanismus auffällt |
| Netzfreiheit | belegt: Lauf mit gesperrtem globalem `fetch`, 148/148 ⇒ CI-tauglich |
| `npm run typecheck` | grün |
| `npm run build` | grün |
| `npm run budget` | totalJs **1142,9 / 1150** · eagerJs **106,3 / 107,9 (unverändert)** · largestChunk 278,4 / 292,3 |
| Fusions-Chunk | `attach-*.js` **7 432 B gzip**, ausschließlich per dynamischem Import |
| `verify:model-source` · `verify:datenalter` · `verify:precip-source` | 64/64 · 54/54 · 30/30 |
| `verify:route-3d` · `verify:event-zone` · `verify:layer-erstbild` | 564/564 · 102/102 · 37/37 |

### 4.0 Laufzeit und Größe — gemessen

| Größe | Wert |
|---|---|
| `fuseHour` je Stunde | **214 µs** |
| volle 240-Stunden-Vorhersage | **51,5 ms**, in ~8 Häppchen zu ~7 ms (Yield alle 32 Stunden) |
| Ergebnis je Stunde (JSON) | 1 674 B ⇒ ~400 KB für 240 Stunden |
| Chunk | 7 432 B gzip, lazy |

Unter der 200-ms-Long-Task-Schwelle, und durch das Yield sieht der Hauptthread ohnehin nur
~7-ms-Blöcke. Die 400 KB sind der Grund, warum die Verteilungen **opt-in** bleiben:
Massen-Aufrufer (Route, 3-D-Schnitt) fragen sie nicht an.
*(Entwicklungsrechner, Node 22 — ein Leistungsanker misst immer auch die Maschine mit.)*

### 4.1 Funktionserhalt — belegt, nicht behauptet

Ohne `distribution: true` ändert sich **kein Feld**. Die einzige auch ohne Flag wirksame
Änderung ist, dass MOSMIX-Samples ihre echte Distanz tragen
(`brightSkyToHourSamples(bs, lat, lng)`; zuvor `haversine(station, station) = 0`). Beide
Leser von `distanceMeters` im Altpfad sind auf `family === 'obs'` gegattert
(`pointForecast.ts:570` Anker-QC, `:586` Blend-Gewicht), MOSMIX hat die Familie `'mosmix'`.
Die Integrationsprüfung hat das **gemessen** — inklusive Negativkontrolle, ohne die die
Gleichheit nichts beweist:

```
h = 0/1/5/12/48/200, MOSMIX-Distanz 0 vs. 18 km : IDENTISCH (6/6)
Negativkontrolle (obs 0 vs. 18 km)             : ABWEICHUNG (Pruefstand erkennt Distanzwirkung)
```

### 4.2 Die analytischen Selbstprüfungen

- **numerischer CRPS = analytischer CRPS (Normal)**, max. Δ = 4,9·10⁻⁴ — die Lizenz für den
  generischen Quantil-Integrator auf den Familien ohne geschlossene Form.
- **Faktor 1/√2**: die kalibrierte Klimatologie schlägt den besten Punktwert bei Nullskill um
  0,70710 gegen den Sollwert 0,70711 — die Herleitung aus `mathematik-spezifikation.md` §1.3
  ist im Code nachgerechnet.
- **β = ρ, nicht ρ²**: bei h = 24/72/168 stimmt die gemessene Schrumpfungssteigung auf ±0,02
  mit der Anomaliekorrelation überein, und die Restunsicherheit mit σ_c·√(1−ρ²).

## 5. Was die Prüfungen gefunden haben — und was daraus wurde

### 5.1 Aus den eigenen Tests (erster Lauf, 8 rot)

1. **ρ₀ für Modelle zu hoch** — MOSMIX war bei Lead 0 so gut eingestuft wie eine Messung.
2. **Niederschlags-ρ falsch sortiert** — Modell lag über Radar bei Lead 1.
3. **„0 mm" als Zahl statt als Zensierung** gelesen.
4. **Sky-View mittelte Winkel statt Kosinusse** — falsch genau beim geraden Tal.
5. **Horizontale Dekorrelation war geländeblind.**

### 5.2 Aus der mathematischen Prüfung

| Befund | Wirkung (gemessen) | Behoben |
|---|---|---|
| **Rice-Reihe unterläuft ab ν/σ ≈ 38,6** | ab ~14 m/s mit Stationsanker **alle** Quantile gleich und 36 % zu hoch | Grenzfall-Zweig über die Normalnäherung; Regressionstest über vier Sturmfälle |
| **Trockenzensur am falschen Anker** | das *beste* Niederschlagsprodukt lieferte die *niedrigste* Trockenwahrscheinlichkeit; μ um 0,83 daneben, σ 2,7× zu schmal | exakte Tobit-Momente gegen die **prädiktive** Streuung; Test „Radar ohne Echo ist die stärkste Trockenaussage" |
| **Bewölkung und Feuchte blieben `normal`** | q90 = 109 % Bewölkung, q10 = −8 % | `censoredNormal [0,100]` für beide |
| **Halley-Schritt verschlechterte `PhiInv`** | um 5–6 Größenordnungen (gegen die ungenauere `erf` verfeinert) | entfernt; Test gegen **exakte** Quantile statt Rundlauf |
| **σ aus der geschrumpften Matrix gemeldet** | −4,6 % σ, also anti-konservativ statt konservativ | Gewichte aus der geschrumpften, Streuung aus der geglaubten Matrix; Negativkontrolle |
| **Rice-Mittelwert-Asymptote war die RMS** | 0,025 m/s Sprung an der Zweiggrenze | `√(ν²+σ²)`; Stetigkeitstest |
| **Phasen-Aufweitung wurde gerechnet und verworfen** | `phaseVarK2` war ein toter Parameter | zweiter Regime-Durchlauf wird angewandt |
| **ρ senkrecht auf 0 am Horizont** | 1,0 K Sprung zwischen zwei Stunden | Taper über 15 % des Horizonts (max 24 h); Test misst jetzt **0,154 K** größten Stundenschritt |
| **`pitOf` ignorierte die Atome von `censoredNormal`** | das Kalibrierungs-Histogramm hätte seinen eigenen Fehler gemessen | beide Ränder behandelt |
| **`inflate` verschob den Mittelwert** | Rice +0,15 m/s Nebenwirkung; Einheitenfalle bei `logCensored` | ν wird nachgeführt; Niederschlag wird nicht nachträglich aufgeweitet |
| **Jitter an der größten Diagonale** | hätte die präziseste Quelle ausgelöscht | zeilenrelativer Jitter |
| **Rückfall war ausgerechnet die überkonfidenteste Antwort** | „alle unabhängig", nachdem die Unabhängigkeit gescheitert ist | konservativer Rückfall unter der vollen Korrelation |
| **β = ρ² statt ρ** | Mittelfrist-Anomalie ~40 % zu stark zur Klimatologie gezogen | Amplituden-Reskalierung; Test pinnt β = ρ bei drei Leads |
| **`gammaRatio` war O(j²)** | bis 65k Operationen je Aufruf | inkrementell |

### 5.3 Aus der meteorologischen Prüfung

| Befund | Behoben |
|---|---|
| **MOSMIX bekam die Mikroklima-Korrektur nie** (Footprint 0 ⇒ „perfekt ko-lokalisiert") — ein 200-m-Talkessel landete als −0,1 K statt −3,5 K | Punktquellen distanz-/höhenabhängig, Stationsvorhersage mit größerer Skala als Messung |
| **Hangeinstrahlung war im Fusionspfad tot** (`slopeRad: 0, aspectRad: 0`) | vollständiger `TerrainContext` durchgereicht |
| **`wetProb` ist eine TAGES-Rate, als Stunden-Rate benutzt** ⇒ ~7 nasse Stunden/Tag als Klimatologie | Umrechnung über effektive Stunden je Nasstag |
| **Wolken-Prior ~12 Punkte zu klar** — und kippte damit das Kaltluftsee-Gate | 62 + 25·(wetProb−0,3) |
| **Feuchte-Prior fest 75 %** ⇒ Schneefallgrenze systematisch ~250 m zu tief | Phasen-Feuchte bedingt auf Niederschlag (Sättigungs-Blend) |
| **obs-Kurve fiel zu früh** — Übergabe an MOSMIX bei 0,6 h statt 2–4 h | k = 1,35, τ = 30 h |
| **Kaltluftsee blind für breite Becken**, Sky-View mit falschem Vorzeichen im Becken-Term | Senkentiefe über **alle** Skalen; Sky-View nur noch im Strahlungsterm |
| **Bewölkungs-Gate nutzte die Summe der Schichten** | strahlungsgewichtet 1,0 / 0,6 / 0,25 |
| **`4s(1−s)` allein: voll entkoppeltes Tal galt als sicher** | zusätzlicher Sockel proportional zur Entkopplung |
| **Distanz-Repräsentativität zu klein in komplexem Gelände** | Komplexitätsdeckel 3 → 6, Referenz 300 → 220 m |
| **`obs-obs = 0,35` verwechselte Wetter- mit Fehlerkorrelation** | distanzabhängige Punktpaar-Korrelation 0,45 + 0,45·e^(−d/40 km) |
| **Böenfaktor fest 1,45** | 1,45 → 1,15 mit zunehmender Entkopplung |
| **Wolken- und Feuchte-ACC zu optimistisch** | Zeitkonstanten deutlich verkürzt |

### 5.4 Aus der Integrationsprüfung

| Befund | Behoben |
|---|---|
| **DEM-Totalausfall umging den Ehrlichkeits-Wächter** — `loadTile` verschluckt Fehler, `sample()` liefert NaN, das Gelände wird zur perfekten Ebene: gemessen **5,1 K daneben und dabei 12 % schmaler** | `sampledCount` + Probe am Abfragepunkt; Negativkontrolle „totes DEM ⇒ verweigern" |
| **Abgebrochene Läufe vergifteten den `PF_CACHE` 3 min lang** (Bestandsfehler, den das neue Flag verschärft) | degradierte Läufe werden nicht gecacht |
| **Fehlgeschlagene Klimatologie war für die Sitzung eingefroren** | Fehlschlag wird nicht memoisiert |
| **Zweiter, größerer DEM-Load** — bis zu 4 zusätzliche S3-Abrufe je Abfrage; meine Zusage „aus der bereits geladenen Kachel" war schlicht falsch | Sampler wird aus `getPointForecast` durchgereicht, **null** zusätzliche Abrufe |
| **Ein einziger synchroner Block** über bis zu 336 Stunden | Yield alle 32 Stunden, mit Abbruchprüfung |
| **Klimatologie je Stunde neu ortsaufgelöst** (178-Stationen-Scan × 336) | Memoisierung je Tag |
| **`Member.tag` nicht eindeutig**, Familien-Rückwärtssuche O(k²·n) | Member trägt seine Quelle; `contributors` dedupliziert |
| **NaN-`distanceMeters` löschte MOSMIX still aus jeder Variablen** | `Number.isFinite`-Wächter an beiden Stellen |

### 5.5 Aus dem eigenen Demo-Lauf (nach den Prüfungen)

**Ein 15-m/s-Sturm kam als 5 m/s heraus.** Ursache: die Geländeexposition wirkte nur auf die
**Streuung**, während der Wind-Prior der Nullvektor ist — „das Modell kann es nicht wissen"
wurde damit zu „wahrscheinlich windstill". Behoben, indem die Abschirmung bzw. Beschleunigung
dorthin wandert, wo sie physikalisch hingehört: auf den **Mittelwert**. Ein Talboden ist
wirklich abgeschirmt, ein Kamm wirklich schneller. Dazu ein ortsabhängiges σ_c für den Wind
(Meereshöhe und Exposition), weil ein einziger Wert für ganz DACH um den Faktor drei falsch ist.

Gemessen, derselbe synoptische Wind (Quellen ~15,6 m/s), Lead 6 h:

| Lage | Median | Verteilung |
|---|---|---|
| Ebene | **14,7 m/s** | q10 = 13,0 |
| tiefes Tal (TPI −600 m) | **11,7 m/s** | breiter als in der Ebene |
| Kamm (TPI +500 m) | **18,6 m/s** | — |

## 6. Ein Durchlauf zum Ansehen (Alpental, Winternacht, 580 m)

```
Lead |  T-Median   q10...q90     sigma  aeq.Q  P(Schnee)  P(trocken)
   0 |     0.7 C   -0.2...1.6   0.72   1.00     71 %       54 %
   6 |     0.5 C   -1.3...2.4   1.42   1.10     72 %       61 %
  48 |     0.4 C   -2.3...3.1   2.10   1.00     71 %       81 %
 168 |    -0.9 C   -6.3...4.6   4.27   1.00     73 %       93 %
 240 |    -3.3 C  -10.8...4.1   5.78   1.00     79 %         -

Beitraege h=0 : dwd_obs          (Station 900 m entfernt dominiert allein)
Beitraege h=48: mosmix, arome_at (Station ist raus, Modelle uebernehmen)
Regime    h=3 : ["phasenuebergang"]
Bewoelkung h=6: q10..q90 = 30...82 %   (nie ausserhalb 0..100)
```

Die Konvergenz zur Klimatologie bei Lead 240 (σ → 5,78 gegen klimatologische 5,8 K) ist
**nicht eingestellt** — sie fällt aus der Rechnung, weil ρ(τ) fällt.

## 7. Offen — bewusst nicht gebaut

| # | Was | Warum jetzt nicht |
|---|---|---|
| 1 | **σ_rep steckt teilweise schon in ρ₀** — die ACC-Werte sind stationsverifiziert und tragen damit Repräsentativität mit; sie wird ein zweites Mal addiert | Die Korrekturgröße lässt sich ohne retrospektives Scoring nicht bestimmen. Erst messen (PV2), dann trennen. **Der wichtigste offene Kalibrierpunkt.** |
| 2 | **σ_rep wird über Quellen als unabhängig behandelt**, obwohl zwei 28-km-Zellen über demselben Tal denselben Fehler machen | Braucht eine Blockstruktur in Σ (Skill-Block + Repräsentativitäts-Block) und damit getrennte σ am Member |
| 3 | **Föhn nur als Aufweitung, nicht als Mischung** — der Ausgang ist bimodal, eine breite mittige Normalverteilung ist die schlechteste Antwort | Braucht eine fünfte Verteilungsfamilie (Normalmischung); sauber machbar, aber eigener Schritt |
| 4 | **Nebel/Hochnebel** — der größte Punktfehler im DACH-Winterhalbjahr; die Engine hat keinen Term dafür und behandelt tiefe Bewölkung als Ausschluss, obwohl sie die *Folge* des Kaltluftsees ist | Eigene Physik, eigenes Gate |
| 5 | **Talwind- und Land-See-Wind-Systeme** | Braucht die Talachse aus dem DEM und einen Tagesgang im Wind-Prior |
| 6 | **Gefrierender Regen, Schmelzschicht, Niederschlagsintensität in der Phase** | Das Zwei-Klassen-Modell kann Glatteis strukturell nicht ausdrücken |
| 7 | **Laufende Bias-Korrektur je Quelle** | Der ertragreichste billige Hebel — aber er braucht das Archiv aus PV1 |
| 8 | **`params.ts`** (gefittete Parameter überlagern die Priors) | Hätte ohne Archiv nichts zu laden |

**Und der Rahmen bleibt:** Alle Parameter in `priors.ts` sind **Priors, keine Messwerte**.
Der Kopf der Datei sagt das. Was hier steht, ist ein Algorithmus, dessen **Form** belegt ist —
nicht ein Verfahren, dessen **Zahlen** belegt sind. Genau das trennt PV3 von PV2.

---

## 8. Von 60 h auf 336 h — die drei Stufen (2026-09-06)

Nach PV3 reichte die Kette nicht bis 14 Tage. Die Analyse fand **zwei verschiedene
Ursachen**, die nur zufällig gleich aussahen — und die deshalb zwei verschiedene
Kuren brauchten.

### 8.1 Die zwei Ursachen

**(a) Eine Datenlücke, keine Modellgrenze.** Die Feuchte endete bei 229 h (gemessen am
Stand vor Stufe 1) — nicht, weil GFS dort aufhört, sondern weil `gfsPoint.ts` `DPT`
und `GUST` nie geholt hat. Beide liegen in **derselben Datei**, die der Client für
Temperatur und Wind ohnehin liest.

*Gemessen am 2026-09-06 gegen `noaa-gfs-bdp-pds.s3.amazonaws.com`, Lauf 2026-09-05,
im `.idx` von `gfs.tHHz.pgrb2.**1p00**.fFFF` — genau der Datei, die `src/globe/gfs.ts`
ohnehin liest (nicht der 0,25°-Satz):*

| Schritt | Einträge | `:TMP:2 m` | `:DPT:2 m` | `:GUST:surface` | `:UGRD:10 m` |
|---|---|---|---|---|---|
| f240 (00z) | 744 | 1 | 1 | 1 | 1 |
| f336 (00z, 06z, 12z, 18z) | 744 | 1 | 1 | 1 | 1 |
| f372 (00z) | 744 | 1 | 1 | 1 | 1 |
| f384 (00z) | 744 | 1 | 1 | 1 | 1 |
| f387 (00z) | HTTP 404 — GFS endet bei f384 | | | | |

**(b) Eine zu arme Funktionsfamilie.** Das eigentliche strukturelle Problem war
ρ(τ) = ρ₀·exp(−(τ/T)^k). Diese Familie kann **„wie gut an Tag 1"** und **„wie schnell
tot bis Tag 14"** nicht unabhängig einstellen. Das ist nicht theoretisch aufgefallen,
sondern praktisch: T für Feuchte und Bewölkung zu verkürzen war für den Kurzfristbereich
richtig und meteorologisch begründet — und riss den Schwanz mit weg, bis
**ρ(336 h) = 0,002** für die 2-m-Feuchte. Der Fehler lag in der Funktion, nicht in
den Zahlen.

### 8.2 Stufe 1 — ACC-Kurve mit zwei Zeitskalen

```
rho(tau) = rho0 · [ (1−w)·exp(−(tau/T)^k) + w·exp(−tau/T_slow) ]
```

Die zwei Skalen sind physikalisch, nicht kosmetisch: was ein Modell an Tag 1 richtig
hat, ist teils **großräumiges Regime** (Blockierung, ein stehender Trog, eine nasse
Phase — zerfällt über Wochen), teils **lokales Detail** (zerfällt in Tagen). Echte
ACC-Kurven haben genau diesen langen Schwanz, und er ist das Einzige, was an Tag 14
noch Information trägt.

Der Schwanz ist ehrlich, aber **schwach**: ρ ≈ 0,07 für Niederschlag bei 336 h heißt
7 % Modell und 93 % Klimatologie. Das ist die richtige Antwort, keine gute.

Quellen, die reine Persistenz oder Extrapolation sind (Station, Nowcast), bekommen
`w = 0` und enden hart an ihrem Horizont — sie wissen nichts über das Regime.

Dazu ein **Auslauf** (`TAPER_H`, max. 24 h bzw. 15 % des Horizonts): ρ senkrecht bei
`maxLeadH` abzuschneiden erzeugte einen 1,0-K-Sprung in der Zeitreihe. Gemessen nach
dem Auslauf: größter Stundenschritt **0,150 K** (bei h = 223).

### 8.3 Stufe 2 — der Taupunkt wird die Feuchtegröße

Fusioniert wird jetzt der **Taupunkt**, nicht die relative Feuchte; RH wird daraus
abgeleitet. Gründe, in dieser Reihenfolge:

1. Td ist **unbeschränkt und additiv** — eine Normalverteilung darauf erzeugt keine
   Quantile über 100 %, wie es RH tat (gemessen: q90 = 109 %).
2. Td ist **höhenkorrigierbar** (≈ 1,8 K/km); RH ist als Quotient nicht linear
   korrigierbar.
3. Td folgt der **Luftmasse** und ist damit fast so gut vorhersagbar wie T, während
   RH die Fehler von T *und* Td erbt.
4. GFS liefert Td direkt bis f384 — RH nicht in derselben Auflösung.

Quellen, die nur RH melden (Stationen, MOSMIX), werden exakt umgerechnet.
Kosten: 135 → 189 Range-Abrufe je GFS-Lauf, **und nur, wenn ein Consumer mehr als
240 h anfragt**.

**Dabei gefunden und korrigiert:** RH wird um die beiden Mediane linearisiert aus T
und Td abgeleitet. Beide Unsicherheiten als *unabhängig* fortzupflanzen sah
konservativ aus und war schlicht falsch: im reinen Klimatologiefall kam
**σ(RH) = 44 %** heraus — ein Intervall breiter als der halbe Wertebereich, auf einer
Größe, deren klimatologische Streuung bei ~15 % liegt. Der Kreuzterm ist das, was RH
überhaupt vorhersagbar macht (wärmere Luft kommt meist feuchter an, RH bewegt sich
viel weniger als T und Td einzeln). Er trägt jetzt eine Korrelation, die zwischen
Fehler-Regime (0,55) und Klimatologie-Regime (0,88) über β interpoliert — die
Schrumpfungsgewichtung, die ohnehin schon sagt, wie viel Messung und wie viel Prior
in der Antwort steckt. Gemessen danach: **σ(RH) = 14,5 %** im Klimatologiefall.
Beide Korrelationen sind **Annahmen**, keine Messwerte; ihre Wirkung ist einseitig und
begrenzt (zu klein verbreitert RH, zu groß verengt es).

### 8.4 Stufe 3 — die Klimatologie ist der letzte Member, nicht `null`

Vorher gab die Fusion `null` zurück, sobald keine Quelle mehr trug. Dabei **wissen**
wir etwas: die Klimatologie liegt als Prior fertig da. Sie auszugeben — sichtbar
markiert als `climatologyOnly` — ist ehrlicher als eine Lücke, und sie macht die
Zeitachse unabhängig davon, wann die letzte Quelle endet.

Die Grenze bleibt scharf: **ohne echte Klimatologie gibt es weiter `null`.** Ohne
`ctx.clima` greifen im Rechenweg feste Rückfallkonstanten (8 °C, 30 % Nasstage);
solange Quellen da sind, ist das ein legitimer Anker für die Schrumpfung — als
alleinstehende Antwort wäre es eine erfundene Zahl für einen beliebigen Punkt im
DACH-Raum, und eine erfundene Zahl ist schlechter als eine Lücke.

### 8.5 Gemessen: bis wohin trägt was

*Realistischer Quellensatz (Station bei 4,2 km, Radar ≤ 2 h, ICON-D2 ≤ 48 h,
MOSMIX ≤ 240 h, GFS ≤ 372 h), Alpental 600 m, `sinkDepthM` 120:*

| Größe | echte Quelle bis | Verteilung bis |
|---|---|---|
| Temperatur | **372 h** | unbegrenzt (Klimatologie) |
| Taupunkt | **372 h** | unbegrenzt |
| rel. Feuchte (abgeleitet) | **372 h** | unbegrenzt |
| Bewölkung | **372 h** | unbegrenzt |
| Niederschlag | **372 h** | unbegrenzt |
| Wind | **372 h** | unbegrenzt |
| Böen | **372 h** | unbegrenzt |
| Windrichtung | **konzentrationsabhängig**, s. u. | — |

Das Ziel (336 h) ist damit für alle sieben Skalargrößen erreicht und um 36 h
überschritten. Die Grenze ist jetzt der **Datensatz** (GFS endet bei f384), nicht
mehr die Rechnung.

**Die Windrichtung hat bewusst keinen Horizont**, sondern ein Konzentrations-Gate:
sie wird nur gemeldet, wenn der Mittelvektor lang genug gegenüber seiner Streuung
ist. Gemessen in der Ebene: **229 h bei 12 m/s West, 46 h bei 3 m/s.** Ein fester
Lead-Schnitt wäre in beide Richtungen gelogen — bei starkem Wind zu früh, bei
schwachem viel zu spät.

**Die Kerneigenschaft des langen Bereichs** ist nicht, dass eine Zahl bis 336 h
existiert, sondern dass sie **von beiden Seiten** zur Klimatologie läuft. Ein reines
Abklingen sieht von oben identisch aus und ist falsch. Gemessen (Ebene, 300 m,
klimatologische Komponentenstreuung 3,68 m/s), Median der Windgeschwindigkeit:

| Start | h = 0 | h = 336 |
|---|---|---|
| Sturm 12 m/s West | 10,83 m/s | **4,58 m/s** (herunter) |
| Flaute 1 m/s | 2,07 m/s | **4,28 m/s** (herauf) |

Δ = 0,30 m/s — beide landen auf derselben Klimatologie. Der Wind fällt dabei **nicht
gegen null**: σ·√(π/2) ist das klimatologische Mittel, und genau da kommt er an.

### 8.6 Gate GPV3b — Belege (2026-09-06)

| Prüfung | Ergebnis |
|---|---|
| `npm run verify:pv-fusion` | **167/167** (dist 37 · combine 20 · terrainScale 20 · meteo 30 · fuse 60) |
| davon Negativkontrollen | **8** (ausgezählt am Lauf, nicht fortgeschrieben) |
| `npm run typecheck` | grün |
| `npm run build` | grün · `verify:shell` 153/153 |
| `npm run budget` | totalJs **1143,5 / 1150** · eagerJs **106,3 / 107,9 (unverändert)** · largestChunk 278,4 / 292,3 |
| `verify:route-3d` · `verify:event-zone` · `verify:radar-sampling` | 564/564 · 102/102 · 25/25 |

Zwei bestehende Tests hat Stufe 3 **absichtlich umgedreht**, sie wurden nicht
gelockert:

- *„jenseits aller Quellen-Horizonte: keine Aussage statt einer erfundenen"* prüft
  jetzt das Gegenteil — es muss eine Verteilung geben, sie muss markiert sein, und
  ihr Mittel muss **exakt** das klimatologische sein. Dazu eine neue
  Negativkontrolle: der Quellenwert (24 °C) darf nicht durchsickern.
- *„Negativkontrolle: ohne Quellen keine Verteilung"* heißt jetzt *„ohne Quellen
  **und ohne Klimatologie**"* und prüft alle sieben Größen statt drei.

### 8.7 Stufe 4 — nicht gebaut, und warum

Der nächste echte Sprung wäre **GEFS-Mittel und -Spread** (31 Member, 0,5°, bis
384 h): erst damit wird der Tag-14-Bereich mehr als ein schwacher Regime-Schwanz,
weil der Spread die Unsicherheit *situativ* misst, statt sie aus einer Priorkurve zu
lesen.

Das ist **nicht** eine weitere Stufe derselben Art. Es braucht einen neuen
Actions-Cron mit Vorverdichtung im Daten-Repo (die 31 Member roh im Client sind
keine Option) — also eine Änderung an der Warm-Cron-/Manifest-Mechanik. Das ist
nach `CLAUDE.md` ausdrücklich **STOPP & FRAGEN**. Umfang geschätzt 15–25
Arbeitsschritte, Größenordnung einer eigenen Phase (PV5).

---

## 9. Block 0 der Audit-Fixes (2026-09-07) — Gate GPV3c

Grundlage: das externe Audit `FUSION_AUDIT.md` / `FUSION_VERIFICATION.md` /
`FUSION_IMPROVEMENTS.md` (Repo-Wurzel, 2026-09-07). Umgesetzt wurde der dort empfohlene
erste Block: vier Befunde behoben, ein Nebenbefund am Quellen-Auslauf gelöst. Alles bleibt
hinter `distribution: true`; der Altpfad ist Feld für Feld unverändert (einzige Änderung
ohne Flag: Stationssamples tragen jetzt `validAtMs`, das der Altpfad nicht liest).

| Befund | Ursache | Fix | Gemessen vorher → nachher (Sonde, Anhang A des Audits) |
|---|---|---|---|
| **K-1** Stationsanker rechnete Wert- statt Anomaliepersistenz | Anomalie gegen die Klimatologie der **Zielstunde** gebildet (`fuse.ts` `sourceClimaMean`), obwohl die Messung zur Stunde 0 gehört; der Tagesgang der Klimatologie wanderte in die „Anomalie" | `PointSourceSample.validAtMs` (gesetzt in `stationsToHour0Samples`), `FusionContext.climaAt`/`terrainDeltaAt`, `ScalarOptions.climaMeanAt`/`microDeltaAt`; `attach.ts` liefert die Klimatologie für beliebige Zeiten aus derselben Memoisierung | Morgenanstieg, Station 8 °C um 06, MOSMIX 12/14/16 °C: h = 2 **10,58 → 11,22**, h = 3 **12,60 → 13,26**, h = 5 **15,00 → 15,60** °C; h = 0 identisch 8,02 |
| **K-3** Fehlende Klimatologie rechnete still gegen 8 °C | `climaGrid.json`-Ladefehler ⇒ Konstanten 8 °C / 6 K / 30 % ohne Marker | `attach.ts` verweigert ohne Klimatologie wie ohne DEM (`null` je Stunde, Retry beim nächsten Aufruf); `FusedPoint.climaSource: 'grid' \| 'fallback'` für direkte Aufrufer; `AttachArgs.climaField` injizierbar (Verifier) | MOSMIX 25 °C, Lead 200 h ohne Grid: vorher **18,5 °C unmarkiert** → jetzt `null`; `fuseHour` direkt: 21,4 °C **mit Marker `fallback`** |
| **H-1** MOSMIX doppelt gedämpft | `AMPLITUDE.mosmix = 1` behandelte ein MOS-Produkt wie rohes Modell-Output; ideales MOS hat α = ρ (Steigung 1) | `AMPLITUDE_RHO_EXPONENT.mosmix = ½`, `amplitudeAt(family, ρ_skill)`; Prior bis zur Messung von α(τ) | +8 K Anomalie: h = 72 **+7,21 → +7,60**, h = 120 **+6,45 → +7,18**, h = 168 **+5,56 → +6,67** K; Restunsicherheit unverändert (α kürzt sich in der Varianz) |
| **H-2** Taupunkt ohne Höhenkorrektur | nur T wurde lapse-korrigiert; Td einer tieferen Station kam unverändert hoch | Td um `DEWPOINT_LAPSE_PER_M` (1,8 K/km) korrigiert, Umrechnung aus T/RH weiterhin an der Quellhöhe | Station 300 m (15 °C, 60 %), Punkt 1100 m: Td **6,77 → 5,52**, RH **86,6 → 79,4 %** |
| **Auslauf** (Nebenbefund aus H-1; ersetzt §8.2) | Der lineare ρ-Auslauf vor dem Horizont steckte im Kalibrier-Nenner (Anomalie/ρα); mit korrigierter MOS-Amplitude wuchs der Stundenschritt der Übergabe MOSMIX → GFS auf **0,253 K** (Smoothstep: 0,293 K) — über dem 0,25-K-Gate | Skill und Auslauf getrennt: ρ_skill kalibriert den Member, der Auslauf inflationiert seine **Varianz** um 1/taper (`fuseScalar`). Der Member-Mittelwert bleibt erwartungstreu, das Gewicht fällt linear | größter Stundenschritt **0,150 (alt) → 0,182 K** bei h = 230; MOSMIX bei 240 h behält **+1,82 K** von +8 K (vorher +1,05) — der Auslauf wirft weniger Skill weg (M-1 teilweise) |
| Nebenwirkung Niederschlag (K-2 **bleibt offen**) | H-1 wirkt auch auf die MOSMIX-Niederschlagsanomalie | — | MOSMIX 5 mm/h Lead 24 h: Median **0,22 → 1,29 mm/h**, P(trocken) **41 → 16 %**; 10 mm/h Lead 48 h: **0,03 → 1,44 mm/h**; AROME (α = 1) unverändert 0,58 mm/h — die strukturelle Dämpfung der Gauß-Schrumpfung besteht weiter |

**Gate GPV3c — Belege (2026-09-07)**

| Prüfung | Ergebnis |
|---|---|
| `npm run verify:pv-fusion` | **187/187** (dist 37 · combine 20 · terrainScale 20 · meteo 30 · fuse 74 · **attach 6, neu**) |
| neue Negativkontrollen | K-1 ohne Gültigkeitszeit ⇒ Wertpersistenz 8,10 / 10,58 (muss so bleiben); K-1 bei flacher Klimatologie identisch; K-3 Rückfall zieht 25 → 21,4 °C (darum der Marker); H-1 Steigung 0,833 = √ρ und > ρ + 0,03; attach ohne Klimatologie ⇒ `null`, ohne DEM ⇒ `null` |
| Prüfung, die den Fix erzwang | „kein Sprung am Horizont" fiel mit ρ-Taper auf 0,253 K (rot) — Gewichts-Taper 0,182 K (grün); die Schwelle 0,25 wurde **nicht** gelockert |
| `npm run typecheck` · `npm run build` | grün |
| `npm run budget` | totalJs **1319,4 / 1330** · eagerJs **106,3 / 107,9 (unverändert)** · largestChunk 279,9 / 292,3 · `attach-*.js` 9,59 KB gzip (lazy) |
| Sonden-Skript (Audit Anhang A) | alle Vorher/Nachher-Zahlen oben |

**Fünf Selbstverifikationsfragen:** (1) Funktionserhalt — der Altpfad hat keinen Leser von
`validAtMs`, `distribution: true` hat keinen Consumer; alle bestehenden Fusion-Tests grün;
(2) Desktop pixelgleich — keine UI-Änderung; (3) Touch-Targets — nicht berührt; (4) Konsole —
headless, keine Warnungen außer der Node-Type-Stripping-Notiz; (5) Long Tasks — Rechenweg je
Stunde unverändert (zwei zusätzliche `accAt`-Aufrufe je Member).

**Was §8.2 ersetzt:** Der dort beschriebene ρ-Auslauf („ρ senkrecht bei `maxLeadH`
abzuschneiden erzeugte 1,0 K; Auslauf 0,150 K") gilt in der Form nicht mehr — der Auslauf
sitzt jetzt auf dem Gewicht, nicht auf ρ. Der gemessene Schritt ist 0,182 K.

**Offen nach Block 0:** K-2 (Niederschlag zweistufig), H-3…H-7, M-1…M-12 — Liste und
Reihenfolge in `FUSION_IMPROVEMENTS.md` §2. Nächster Schritt: **V-A, Nachrechnen 0–24 h gegen
Stationsmessungen** (`FUSION_VERIFICATION.md` §9.2) — braucht einen t₀-Parameter durch die
Adapter und Stundenleser für DWD POI/CDC, GeoSphere `klima-v2-1h`, MeteoSchweiz SMN.

---

## 10. K-2 — Niederschlag zweistufig (2026-09-07) — Gate GPV3d

**Befund (Audit K-2):** Eine einzige Korrelation — die Stunden-**Mengen**-ACC von 0,5–0,7 —
entschied bisher über beide Fragen „regnet es?" und „wie viel?". Weil diese ACC vor allem
Zeit- und Intensitätsfehler *innerhalb* nasser Phasen misst, wurde sie als Auftretens-Skill
gelesen und schrumpfte jedes Signal in einen fast trockenen Prior: MOSMIX 5 mm/h bei 24 h ⇒
41 % trocken, Median 0,22 mm/h. Die Transformation (log1p) war nicht die Ursache — eine
saubere Gauß-Anamorphose mit derselben ρ macht es sogar schlimmer (5 mm/h ist dann nur ein
2,7-σ-Ereignis statt 3,5 σ).

**Design:** zwei Stufen, zwei Skills, eine Ausgabeverteilung.

| Stufe | Rechnung | Neue Priors (`priors.ts`) |
|---|---|---|
| **A — Auftreten** | Probit-Latent y ~ N(0,1), nass ⇔ y > θ = Φ⁻¹(1 − p₀). Jede Quelle wird durch die **klimatologische Verteilung des Punkts** (Atom p₀ bei 0, Lognormal darüber) auf ihr Latent-Quantil abgebildet (Gauß-Anamorphose: „5 mm/h" = „eine 2,8-σ-Stunde"); Trockenmeldung = Zensur y ≤ θ (vorhandener Tobit-Zweig). Dieselbe Kette kalibrieren → kombinieren → schrumpfen wie bei jeder Größe, auf z = y − θ mit Prior N(−θ, 1); P(nass) = P(z > 0). Amplitude α = 1 per Konstruktion (`unitAmplitude`). | `ACC.precipOcc` (Auftretens-ACC je Familie, über den Mengenkurven), `PRECIP_OCC_TAIL` (Tail-Abhängigkeit: ρ′ = ρ + (1−ρ)·0,35·(1 − e^{−r/0,5}); ein starkes Signal ist eine verlässlichere Nass-Aussage als Niesel — eine Gauß-Kopula hat das nicht von selbst) |
| **B — Menge bedingt auf nass** | ln(mm/h) der **nassen** Quellen, kombiniert mit der Mengen-ACC (`ACC.precipitation`, α wie H-1), geschrumpft zur **Nassstunden-Klimatologie** — nicht zur Trockenheit. Trockene Quellen sagen nichts über die Menge, falls es regnet. | `PRECIP_WET_CLIMA` (ln-Lognormal: Median 0,6 mm/h, q90 ≈ 3,2, q99 ≈ 12) |
| **Ausgabe** | `hurdleLogNormal { pDry, mu, sigma }` (`dist.ts`): Atom bei 0 aus A, Lognormal aus B. Zwei Parameter (`logCensored`) konnten beide Stufen nicht tragen — der Rückwärts-Fit auf P(trocken) + bedingten Median überzeichnet die Nass-Streuung um bis zu 60 %. ln statt log1p, weil eine Normalverteilung in log1p 30 % Masse bei negativen Mengen hätte (das war der erste rote Lauf: P(0) ≠ pDry, Loch am Atom). | — |

`fuseScalar` bekam dafür zwei kleine Haken: `rhoBoost` (wertabhängiger Skill) und
`unitAmplitude`. Die Repräsentativität der Auftretensstufe nutzt die Geometrie der
Mengenstufe (beide Räume haben Einheitsstreuung).

**Gemessen (Sonde B des Audits, Anhang A), Median/q90/Mittel in mm/h:**

| Fall | Audit (vor Block 0) | nach Block 0 (H-1) | **nach K-2** |
|---|---|---|---|
| Radar 5 mm/h, Lead 1 h | P(trocken) 1,4 % · 2,32 / 5,67 / 2,85 | gleich | **0,4 % · 3,52 / 8,67 / 4,50** |
| MOSMIX 5 mm/h, 3 h | 13,9 % · 1,15 / 4,31 / 1,79 | 4,5 % · 2,31 / 7,19 / 3,26 | **7,1 % · 3,23 / 10,96 / 4,98** |
| MOSMIX 5 mm/h, 24 h | **40,6 % · 0,22** / 2,57 / 0,90 | 16,3 % · 1,29 / 5,71 / 2,31 | **21,0 % · 1,95 / 9,80 / 4,03**; bedingter Median 2,82 |
| AROME 5 mm/h, 6 h (α = 1) | 27,6 % · 0,58 / 3,28 / 1,23 | gleich | **12,6 % · 1,90 / 7,59 / 3,28** |
| MOSMIX 10 mm/h, 48 h | **48,8 % · 0,03** / 2,29 / 0,77 | 16,4 % · 1,44 / 6,81 / 2,74 | **22,1 % · 2,36 / 13,80 / 5,66** |
| MOSMIX + AROME je 5 mm/h, 6 h | 11,4 % · 1,36 / 4,90 / 2,08 | 5,0 % · 2,23 / 7,08 / 3,18 | **5,0 % · 3,28 / 11,09 / 5,08** |
| Radar 4 mm/h gegen MOSMIX trocken, 1 h | P(nass) 73 % | — | **95 %** |
| MOSMIX 0,1 mm/h, 24 h (Tail-Prior) | — | — | P(nass) **24 %** gegen 79 % bei 5 mm/h |

Zwei Dinge daran sind ehrlich zu benennen: (1) P(trocken) bei 24 h liegt nach K-2 mit 21 %
*über* dem H-1-Zwischenstand (16 %) — der war ein Nebeneffekt der MOS-Amplitude auf dem
Latent, nicht Auftretens-Skill; (2) die q90-Werte sind breit (9,8 mm/h bei einer 5-mm/h-
Vorhersage), weil die bedingte Streuung aus Mengen-ACC 0,55 und klimatologischer Streuung
1,3 (ln) folgt. Beides sind **Priors**, keine Messwerte (V-PV-17).

**Gate GPV3d — Belege (2026-09-07)**

| Prüfung | Ergebnis |
|---|---|
| `npm run verify:pv-fusion` | **208/208** (dist **48**, +11 Hurdle · combine 20 · terrainScale 20 · meteo 30 · fuse **84**, +10 K-2 · attach 6) |
| neue Negativkontrollen | Hurdle: Atom ist echte Masse (pDry ≥ ½ ⇒ Median 0 trotz 2 mm/h bedingtem Median); K-2: trockene Quelle lässt die Menge|nass **exakt** bei der Klimatologie (mu = −0,510); Ausgabe-Atom = Auftretens-P(trocken); kein Loch zwischen Atom und Menge |
| erster Lauf rot (6 Fälle) | P(0) ≠ pDry, Loch am Atom, PIT-Mitte — Ursache log1p-Normal mit negativer Masse ⇒ ln-Lognormal; danach 208/208 |
| bestehende Niederschlagsprüfungen | alle grün, mit neuen Zahlen: Radar dominiert bei h = 1 mit P(trocken) 0,048 (vorher 0,268), nasse Prognose q90 7,88 (vorher 5,32), Ordnung Radar > ICON ≥ GFS erhalten |
| `npm run typecheck` · `npm run build` | grün |
| `npm run budget` | totalJs **1319,7 / 1330** · eagerJs **106,3 (unverändert)** · `attach-*.js` 9,96 KB gzip (lazy) |

**Fünf Selbstverifikationsfragen:** wie §9 — kein Consumer, keine UI, headless; Rechenweg je
Stunde: ein zweiter `fuseScalar`-Durchlauf für die Menge (nur nasse Quellen), unkritisch.

**Offen nach K-2:** H-4 (Tobit-Varianz 25 % zu schmal) gilt weiter, jetzt in der
Auftretensstufe; Bedingte Streuung und Tail-Prior sind zu messen (V-PV-17); Nächster Schritt
**V-A** (`FUSION_VERIFICATION.md` §9.2).

---

## 11. V-A — Nachrechnen gegen Stationsmessungen, erster Schnappschuss (2026-09-07)

**Werkzeug:** `npm run verify:pv-score` (`scripts/verify-pv-score.mjs`, netzabhängig, kein
CI-Gate). Eingaben **as-of** t₀ = MOSMIX_L-Lauf + 2 h (Publikationsreserve; gemessen +73 min):
der Lauf (8 Läufe, 48-h-Rollfenster) und die Stationsmessung zu t₀ aus DWD POI (24-h-Rollfenster),
nichts Jüngeres. Dieselben Samples laufen durch den **Altpfad** (`blendVariable` + Terrainzuschlag,
Replikat von `getPointForecast` Schritt 4/4b) und durch **buscosun Fusion** (`computeDistributions`
mit echtem Terrarium-DEM z9 und echter Klimatologie). Referenzen: rohes MOSMIX an der Station,
Persistenz, Anomaliepersistenz, Klimatologie, MOSMIX-PoP R101. Wahrheit: POI zur Zielzeit.
Scores: MAE/Bias/RMSE, CRPS/PIT/Spread-Skill (Fusion), Brier/Reliability (PoP), CRPSS gegen die
**beste** Referenz, Diebold-Mariano mit HAC über die Zielstunden, Block-Bootstrap über Läufe.
Zwei Leck-Wächter (Zukunftsmessung im Mix ≥ 10 % Gewinn; allein mit echtem Zeitstempel muss der
Fehler kollabieren: 0,91 → 0,03 K ✓). Scorecard je Lauf: `audit/punktvorhersage-14tage/va/<Zeit>.json`.

**Was dieser Schnappschuss ist — und was nicht:** 111 DE-Stationen (= MOSMIX-Stationen, also
**Anspruch A**, nicht B), 8 Läufe, 217 094 Datensätze, aber **25 Zielstunden eines trockenen
Septembertags** (Basisrate nass 2 %). n_t = 25 ist die relevante Stichprobe; jedes DM-p ist ein
Schnappschuss-p. Keine Aussage über Niederschlagsmengen, Föhn, Winter, Alpen. Belastbar wird das
erst über Tage (Scorecards aufsummieren, `FUSION_VERIFICATION.md` §7).

| Größe · Lead | MOSMIX MAE | Altpfad MAE | **Fusion MAE** (Bias) | Fusion CRPS · CRPSS vs beste | PIT-Ränder (Soll 0,20) · Spread/Skill (Soll 0,85–1,20) |
|---|---|---|---|---|---|
| T 1–6 h | 0,89 | **2,03** | 0,91 (−0,05) | 0,71 · +20,9 % | **0,51 · 0,50** |
| T 7–12 h | 0,91 | 0,94 | 0,94 (+0,02) | 0,71 · +22,4 % | 0,44 · 0,57 |
| T 13–24 h | 0,97 | 1,00 | 1,00 (0,00) | 0,75 · +23,0 % | 0,42 · 0,60 |
| Td 1–6 h | 0,74 | — | 0,79 (−0,15) | 0,58 · +22,1 % | 0,14 · 1,11 |
| Td 13–24 h | 0,83 | — | 0,81 (−0,07) | 0,64 · +22,0 % | 0,07 · 1,43 |
| Wind 1–6 h | 0,69 | 0,77 | 0,74 (**+0,23**) | 0,54 · +22,2 % | 0,13 · 1,33 |
| Wind 13–24 h | 0,70 | 0,72 | 0,85 (**+0,35**) | 0,62 · +11,5 % | 0,11 · 1,49 |
| Böe 1–6 h | 0,97 | 1,17 | 0,96 (−0,17) | 0,83 · +14,6 % | 0,02 · 1,94 |
| Böe 13–24 h | 0,99 | 0,99 | 1,00 (−0,16) | 0,94 · +5,6 % | 0,01 · 2,29 |
| PoP (Brier / BSS) | R101 0,020 / +4 % | — | Fusion 0,021 / −1 % | — | Reliability Fusion: fc 0–1 % → obs 2 % |

K-1-Kontrolle (435 Fälle): MAE Fusion mit Gültigkeitszeit vs. ohne — h1 **0,77 vs 0,90**, h2 0,97 vs
1,12, h3 0,93 vs 1,08, h4 1,01 vs 1,04, h5 1,01 vs 1,03 K. Der Block-0-Fix K-1 ist damit erstmals
**an Messungen** belegt: 0,13–0,15 K in den ersten drei Stunden.

**Lesart, ehrlich:**

1. **Anspruch A ist an der Station nicht zu gewinnen — wie vorhergesagt** (`FUSION_VERIFICATION.md`
   §10): Fusion-T liegt bei −2…−3 % MAE gegen rohes MOSMIX; die einzige Quelle ist MOSMIX selbst,
   Geometrie und Anker fügen dort nichts hinzu. Der CRPSS von +21…23 % ist der Verteilungsgewinn
   gegen einen Punktwert (Faktor 1/√2 bei Nullskill = 29 %), **kein** Modellgewinn.
2. **Die Fusion-Temperatur ist doppelt überkonfident.** PIT-Ränder 0,42–0,51 statt 0,20, Spread/Skill
   0,50–0,60. Ursache benannt, nicht geraten: σ_c kommt aus dem **Tagesmittel**-Residuum des
   Klimagrids (Audit M-2; im September 2–3 K statt der stündlichen 4–5 K), und ρ₀ = 0,985 für
   MOSMIX ist zu hoch — aus MAE 0,9 K bei σ_c ≈ 2,5 K folgt ρ ≈ 0,93. **Kalibrierungs-Gate
   verletzt** (`verifikation.md` §7.0 Punkt 4) ⇒ nicht ausliefern, Priors fitten (V-PV-18).
3. **Wind ist schlechter als MOSMIX, mit wachsendem Plus-Bias** (+0,23 → +0,35 m/s): der
   Wind-Prior (Rayleigh-Mittel 4,3 m/s in 300 m Ebene, Audit M-3) und die Konvergenz des
   Betrags nach oben ziehen jede Vorhersage in Richtung „windiger". Spread 1,3–1,5× zu breit.
4. **Td leicht, Böe deutlich zu breit** (Spread/Skill 1,1–1,4 bzw. 1,9–2,3): die Rückfall-Streuungen
   `CLIMA_SIGMA_FALLBACK.dewpoint/gust` sind Priors ohne Bezug zur Stationsstreuung.
5. **H-4 zeigt sich in den Daten:** nach Trockenmeldungen sagt die Fusion 0–1 % nass, beobachtet 2 %
   (R101: 3 % → 2 %). Genau die 25 % zu schmale Tobit-Varianz aus dem Audit.
6. **Der Altpfad — das, was das Produkt heute zeigt — ist in den ersten sechs Stunden 2,3-mal
   schlechter als rohes MOSMIX** (2,03 vs 0,89 K, Bias −0,80): die Station klebt mit Gewicht 5,0
   und Halbwertszeit 2,5 h als **Wert**-Persistenz am Blend (`leadTimeWeights.ts:36-44`). Das ist
   kein Fusionsbefund, sondern ein **Produktdefekt** (V-PV-19).

**Gate GPV3e — Belege:** `verify:pv-score` Lauf 2026-09-07T21:32Z, Scorecard
`va/2026090721Z.json` (Code ce85e39, uncommitted Baum), Leck-Wächter 2/2 ✓; `verify:pv-fusion`
208/208 unverändert; `typecheck` grün.

**Offen nach V-A₁:** Priors fitten (V-PV-18), Wind-Prior und Rückfall-Streuungen messen, Altpfad-
Anker (V-PV-19) entscheiden, Nachrechnen täglich fortschreiben; AT/CH (TAWES/SMN, AROME 15 h)
und Anspruch B (Stationen-Kreuzvalidierung) sind der zweite Ausbau.

---

## 12. V-PV-19 — Stationsanker als Innovations-Persistenz (2026-09-08) — Gate GPV3f

**Jans Auftrag (2026-09-07):** „Schritt eins (Versatz statt Wert) und Schritt zwei (Versatz aus
den letzten Stunden) umsetzen." Beides betrifft den **Altpfad**, also das, was Panel, Event,
Route, 3-D, Nowcast und Benachrichtigungen heute zeigen — deshalb mit benanntem Rückfallweg.

**Was gebaut wurde**

| Teil | Datei | Inhalt |
|---|---|---|
| Rechnung | `src/pointForecast/anchor.ts` (neu, pur) | `innovation(pairs)`: altersgewichteter Versatz Messung − Modell (τ_hist 3 h), Repräsentativität = größtes räumliches Stationsgewicht, Deckel je Größe; `anchorTerm` = Versatz · Bruchteil · e^{−h/τ} mit τ_T/τ_RH 4 h, τ_Wind/τ_Böe 2 h. 8 Prüffälle inkl. Negativkontrolle (Versatz 0 lässt den Tagesgang unangetastet, der alte Anker hätte 3 K weggenommen) |
| Verdrahtung | `pointForecast.ts` | `anchorMode: 'offset' \| 'value'`, Default **offset**; Kill-Switch `?anchor=value`; Cache-Schlüssel getrennt. Stationen bleiben an h = 0…5 in `unified` (die Fusion braucht sie für K-1), der Blend liest sie im Versatz-Modus nur bei h = 0; ab h = 1 Modell + Versatz für T, RH, u/v, Böe (`anchorOffsetsFor`, `anchoredValues` — exportiert, der Harness nutzt dieselben Funktionen). Herkunfts-Badges nennen die Station, solange der Versatz ≥ 5 % wiegt. Native-Modus: kein Anker (wie zuvor) |
| Schritt zwei, Daten | `sampleSources.ts`, `geosphereTawes.ts`, `meteoSwissSmn.ts` | **DE:** BrightSky-Anfrage beginnt 6 h früher (vergangene Stunden = Messungen der nächsten Beobachtungsstation) + ein zweiter Abruf `source_id` für die vergangenen Schritte des laufenden MOSMIX-Laufs (gemessen 2026-09-07: 4 h rückwirkend). **AT:** `fetchTawesHistory` (ein Aufruf für die 6 nächsten Stationen, `station/historical/tawes-v1-10min`) + AROME/INCA-Schritte vor t₀ (`pastHours`). **CH:** die SMN-Tagesdatei trägt 10-Minuten-Werte des ganzen Tags (132 Zeilen gemessen) — Zeilen-Cache je Station, `fetchSmnHistory` ohne zusätzlichen Abruf + AROME-Schritte. Kein Archiv nötig |
| Harness | `verify-pv-score.mjs` | rechnet **beide** Altpfad-Fassungen je Lauf (`altpfad(wert)`, `altpfad(versatz)`), Historie as-of: Messung aus POI, Modellwert des Laufs, der zu jener Stunde publiziert war |

**Gemessen (V-A, 111 DE-Stationen, 8 MOSMIX_L-Läufe, 25 Zielstunden, 2026-09-07T22Z, Scorecard `va/2026090722Z.json`), MAE (Bias):**

| Größe · Lead | rohes MOSMIX | Altpfad **alt** (Wert) | Altpfad **neu** (Versatz) | Fusion |
|---|---|---|---|---|
| T 1–6 h | 0,90 (−0,03) | **2,18 (−0,62)** | **0,92 (+0,05)** | 0,92 |
| T 7–12 h | 0,91 | 0,94 | 0,93 | 0,94 |
| T 13–24 h | 0,98 | 1,01 | 1,01 | 1,01 |
| Td 1–6 h | 0,74 | 1,05 (−0,48) | **0,70 (−0,02)** | 0,81 |
| Wind 1–6 h | 0,69 | 0,78 | **0,69** | 0,74 |
| Böe 1–6 h | 0,98 | 1,22 | **0,96** | 0,97 |

Der Produktdefekt aus §11 ist damit behoben: die ersten sechs Stunden liegen auf dem Niveau
des rohen MOSMIX statt 2,3-mal darunter, der Morgen-Kaltbias ist weg, und beim Taupunkt gewinnt
der Versatz gegen MOSMIX. Ab 7 h sind alt und neu identisch (der Anker klingt ab). Einschränkung
wie in §11: ein trockener Septembertag, MOSMIX-Stationen, n_t = 25.

**Gate GPV3f — Belege (2026-09-08)**

| Prüfung | Ergebnis |
|---|---|
| `npm run verify:pv-fusion` | **222/222** (+ Suiten „Stationsanker" 8/8 und „Stationsanker im Blend" 6/6 mit Negativkontrollen) |
| `npm run verify:pv-score` | Lauf 2026-09-07T22:14Z, Leck-Wächter 2/2 ✓, Tabelle oben |
| `verify:model-source` · `verify:precip-source` · `verify:datenalter` | s. Protokoll unten |
| `npm run typecheck` · `npm run build` | grün |
| `npm run budget` | totalJs **1322,3 / 1330** (+2,6 KB) · eagerJs **106,3 (unverändert)** · `pointForecast-*.js` 35,84 KB gzip |
| Live-Probe Client-Pfad (Node, DE/AT/CH, beide Modi) | s. Protokoll unten |

**Fünf Selbstverifikationsfragen:** (1) Funktionserhalt — jede Funktion bleibt; die Stationen
wirken weiter (h = 0 als Wert, ab h = 1 als Versatz); Rückfallweg `?anchor=value` und Option
`anchorMode` (D-11); (2) Desktop — keine UI-Änderung, die Zahlen ändern sich im Sinn des
Auftrags; (3) Touch — nicht berührt; (4) Konsole — headless-Probe ohne Fehler; (5) Long Tasks —
ein zusätzlicher Round-Trip (BrightSky `source_id` bzw. TAWES-Historie), Rechenaufwand
unverändert; die Stationshistorie hängt an `stations$` (kein zweiter Round-Trip) und ist mit einer
1,5-s-Frist (`Promise.race`) begrenzt — läuft sie ab, rechnet der Anker allein mit dem Paar zu t₀.

**Offen:** τ und Deckel sind Priors (mit den Scorecards messbar); AT/CH-Zahlen fehlen (Harness
ist DE); Alter der Messung (H-5) wird im Versatz nicht gedämpft.

**Protokoll (2026-09-08)**

| Verifier | Ergebnis |
|---|---|
| `verify:model-source` | 64/64 |
| `verify:precip-source` | 30/30 |
| `verify:datenalter` | 54/54 |
| `verify:pv-fusion` (nach der 1,5-s-Frist) | 222/222 · typecheck grün · Build grün · totalJs 1322,4 / 1330, eagerJs 106,3 |

Live-Probe des Client-Pfads (`getPointForecast`, Node ohne DEM, 8 h, beide Modi, warmer Cache je Land):

| Ort | Modus | Dauer | Stationen (nächste) | Quellen |
|---|---|---|---|---|
| Dresden (DE) | Wert · Versatz | 0,73 s · 0,82 s | 6 (`dwd_obs` 39 km, 44 km) | dwd_obs, mosmix |
| Innsbruck (AT) | Wert · Versatz | 11,4 s · 8,9 s | 6 (`tawes` 0 km, 8 km) | tawes, mosmix, inca, arome_at |
| Bern (CH) | Wert · Versatz | 1,73 s · 1,73 s | 6 (`smn` 7 km, 23 km) | smn, mosmix, arome_at |

Die AT-Dauer ist **nicht** der Anker: mit Abruf-Timing je Anfrage (Sonde `probe-anchor-timing.mjs`)
trägt der INCA-Punktabruf (`timeseries/forecast/nowcast-v1-15min-1km`) allein 9,3 s (Versatz) bzw.
11,7 s (Wert — ohne jede Historie); die TAWES-Historie kostet 0,28 s, der zweite BrightSky-Abruf
(`source_id`) 0,03 s, AROME 0,66 s. Dieselbe INCA-URL per curl direkt nacheinander: 0,33 s → 1,78 s →
3,30 s — GeoSphere verlangsamt wiederholte gleiche Punktabfragen serverseitig, was eine Sonde mit
sechs Aufrufen in Folge trifft, einen Nutzer mit einer Abfrage nicht. Der Befund bestand vor
GPV3f (INCA ist seit PV0 im AT-Pfad) und bleibt als **V-PV-20** notiert: INCA-Punktabruf mit
Frist versehen oder aus dem CDN-Spiegel lesen (§`audit/bandbreite.md`, INCA-Grid liegt dort
bereits als Bild). Ein Erst-Fehlversuch der Sonde (alle drei GeoSphere-Abrufe nach 7,1 s mit
`fetch failed`) war ein transienter Netzfehler und ließ sich nicht reproduzieren (Node-DNS liefert
nur A-Record 138.22.189.233, vier Einzelabrufe 68–239 ms).

Im Versatz-Modus zeigt die AT-Probe den zweiten Schritt real am Werk: `station/historical`
lieferte die letzten 6 h für 6 Stationen in einem Aufruf, BrightSky in DE 4 rückwirkende
MOSMIX-Stunden. Die `dwd_obs`-Badges, die in AT/CH beim ersten Lauf auftauchten, kamen aus der
BrightSky-Messhistorie (nächste DWD-Station aus DE) — seitdem wird sie nur in DE eingespeist.
