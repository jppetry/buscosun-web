# Mathematische Spezifikation — punktbasierte probabilistische Vorhersage 0–336 h

> Stand 2026-09-05 · Phase PV0 · **kein Code**
> Literaturnennungen sind **aus dem Gedächtnis** und in dieser Runde **nicht gegen die
> Primärquelle geprüft** — sie benennen den Ansatz, nicht dessen berichtete Zahlen. Skill-Zahlen
> aus der Literatur werden bewusst **nicht** zitiert; sie sind auf diesen Anwendungsfall ohnehin
> erst nach eigener Messung übertragbar (Phase 0).

---

## 1. Das Ziel, sauber formuliert

Gesucht ist für Variable $y$, Ort $s=(\lambda,\varphi,z)$, Vorlaufzeit $\tau$ und Prädiktorvektor
$\mathbf{x}$ die **prädiktive Verteilung**

$$F_y(\,\cdot \mid \mathbf{x}, s, \tau)$$

nicht ein Wert. Der deterministische Wert ist eine Ableitung: unter absolutem Verlust der
**Median** $F^{-1}(0{,}5)$, unter quadratischem Verlust der Erwartungswert. Welcher davon
angezeigt wird, ist eine Produktentscheidung — die Verteilung ist die Größe, die geschätzt wird.

### 1.1 Zielfunktion: CRPS

$$\mathrm{CRPS}(F,y)=\int_{-\infty}^{\infty}\bigl(F(t)-\mathbb{1}\{t\ge y\}\bigr)^2\,dt
= \mathbb{E}|X-y| - \tfrac12\,\mathbb{E}|X-X'|,\qquad X,X'\sim F \text{ i.i.d.}$$

Warum genau diese: CRPS ist **strikt proper** — der erwartete Score wird genau dann minimal,
wenn $F$ die wahre bedingte Verteilung ist. Es gibt also keine Strategie, den Score durch
Über- oder Untertreiben der Streuung zu verbessern; „ehrliche Unsicherheit" ist hier nicht
Haltung, sondern die Optimallösung. CRPS ist in der Einheit der Variablen (°C, m/s, mm) und
reduziert sich für eine Punktmasse auf den absoluten Fehler — deterministische und
probabilistische Verfahren sind damit **auf einer Skala vergleichbar**.

Die Ensemble-Form ist in `src/ml/metrics.ts:crpsEnsemble` bereits implementiert.
Die geschlossene Gaußform (die alte fusionV2-Gleichung 17) ist zu ergänzen:

$$\mathrm{CRPS}\bigl(\mathcal{N}(\mu,\sigma^2),y\bigr)=\sigma\Bigl[z\bigl(2\Phi(z)-1\bigr)+2\varphi(z)-\tfrac{1}{\sqrt{\pi}}\Bigr],\qquad z=\frac{y-\mu}{\sigma}$$

### 1.2 Wo CRPS an Grenzen stößt — ehrlich benannt

- **Extremwerte.** CRPS ist ein integrierter Score über die ganze Verteilung; ein Verfahren kann
  einen guten mittleren CRPS haben und im Sturmfall systematisch zu eng sein. Gegenmaßnahme:
  Extremereignisse werden **separat** ausgewertet (Brier/ROC an Schwellen, `verifikation.md` §5),
  und schwellenbezogene Scores sind gate-relevant, nicht nur der Mittelwert.
- **Punktmasse bei Null (Niederschlag).** $F$ hat einen Sprung bei 0; Gaußannahmen sind falsch.
  Behandlung s. §4.3.
- **Räumlich/zeitlich aggregierte Fragen.** CRPS bewertet Randverteilungen je Stunde. „Bleibt
  das Fenster 14–18 Uhr trocken?" ist eine **gemeinsame** Aussage — dafür braucht es Kohärenz
  (§7), und der passende Score ist der Energy-/Variogramm-Score, nicht CRPS.
- **Optimalität ≠ Nützlichkeit.** CRPS belohnt am langen Ende die Klimatologie. Ein Verfahren,
  das bei Tag 12 „richtig nichtssagend" ist, gewinnt gegen eines, das gelegentlich richtig und
  öfter falsch spektakulär ist. Das ist gewollt, muss aber im Produkt gesagt werden.

### 1.3 Warum die Verteilung ab Tag ~3 nicht optional ist — mit Herleitung

Sei die Klimatologie $\mathcal{N}(\mu_c,\sigma_c^2)$ und der Vorhersage-Skill null. Dann gilt für
$X,X',Y \stackrel{iid}{\sim}\mathcal{N}(\mu_c,\sigma_c^2)$:

$$\mathbb{E}|X-Y| = \frac{2\sigma_c}{\sqrt{\pi}},\qquad
\mathbb{E}\bigl[\mathrm{CRPS}(F_c,Y)\bigr]=\frac{2\sigma_c}{\sqrt\pi}-\frac12\cdot\frac{2\sigma_c}{\sqrt\pi}=\frac{\sigma_c}{\sqrt\pi}\approx 0{,}5642\,\sigma_c$$

Die **beste deterministische** Vorhersage (Punktmasse im Median) erreicht dagegen

$$\mathbb{E}\bigl[\mathrm{CRPS}(\delta_{\mu_c},Y)\bigr]=\mathbb{E}|\mu_c-Y|=\sigma_c\sqrt{\tfrac{2}{\pi}}\approx 0{,}7979\,\sigma_c$$

Das Verhältnis ist **exakt $1/\sqrt2 \approx 0{,}707$**: allein dadurch, dass man die
Unsicherheit ausspricht statt eine Zahl zu nennen, sind bei verschwindendem Skill
**29,3 % CRPS** zu gewinnen — ohne jede meteorologische Verbesserung. Je weiter der Vorlauf,
desto größer der Anteil dieses Gewinns am Gesamten. Deshalb ist die Verteilung ab dem Punkt,
an dem der Skill spürbar fällt (für T2m in DACH grob ab Tag 3–5, zu messen), **die** Maßnahme
mit dem besten Verhältnis von Aufwand zu Nutzen.

> Diese Herleitung ist numerisch nachprüfbar: `crpsEnsemble` aus `src/ml/metrics.ts` auf ein
> großes Gauß-Sample anwenden. Sie gehört als Selbsttest in den Verifier (Phase 0).

---

## 2. Die Zerlegung: Geometrie zuerst, Statistik danach

$$y(s,\tau) \;=\; \underbrace{x_b(s,\tau)}_{\text{Modellwert am Ort}} \;+\; \underbrace{f\bigl(Z(s),\text{Regime}\bigr)}_{\text{systematischer Ortsanteil}} \;+\; \underbrace{\varepsilon(s,\tau)}_{\text{Rest}}$$

- $x_b$: das interpolierte Modellfeld am Punkt (Geometrie — §3).
- $f$: was das Modell am Ort **systematisch** verfehlt, als Funktion von Geländeattributen
  $Z(s)$ und Wetterlage. Das ist der Teil, der aus Daten gelernt wird und der die
  Generalisierung auf Punkte **ohne Station** trägt (§4.2).
- $\varepsilon$: der Rest, dessen Verteilung geschätzt wird.

Diese Zerlegung ist die Regression-Kriging-Identität. Sie wird hier **nicht** als Kriging
implementiert (§3.3), sondern als Aufteilung der Zuständigkeiten zwischen einem
deterministischen Geometrieschritt und einem statistischen Verteilungsschritt.

---

## 3. Ebene 0 — Gitter → Punkt

### 3.1 Was bleibt

Der vorhandene Weg ist gut und wird beibehalten:

1. **Höhenreduktion vor der Mittelung**: $v_{\text{MSL}} = v + z_{\text{Quelle}}\cdot\hat\gamma$,
   danach Rückrechnung auf $z_s$ aus dem DEM.
2. $\hat\gamma$ aus **stündlicher OLS-Regression über das lokale Stationsset mit
   Reliabilitäts-Shrinkage** (`estimateLapseRate`):
   $$\hat\gamma=\alpha\,\gamma_{\text{OLS}}+(1-\alpha)\gamma_0,\quad
   \alpha=\mathrm{clip}\!\Bigl(\tfrac{\Delta z-300}{700}\Bigr)\cdot\mathrm{clip}\!\Bigl(\tfrac{R^2-0{,}3}{0{,}5}\Bigr),\quad \gamma_0=0{,}0065$$
   geklemmt auf $[-0{,}008,\,+0{,}012]$ K/m. Inversionen ($\hat\gamma<0$) bleiben erhalten.
3. **Mikroklima-Korrekturen** (Kaltluftsee, Hangeinstrahlung) aus `terrainPhysics.ts`, gedeckelt
   und bei ko-lokalisierter Station gedämpft.

### 3.2 Was sich ändert

Die Mikroklima-Korrekturen sind heute **feste Zuschläge**. Sie werden zu **Prädiktoren**:
statt „−3,5 °C Deckel" liefert der Terrainkontext die Größen $(\text{Senkentiefe},
\cos\theta_{\text{Sonne,Hang}}, \text{SVF}, \mathrm{TPI}_{500}, \mathrm{TPI}_{2000},
\nabla z, z-z_{\text{Modell}})$ in das Verteilungsmodell (§4.2), und der Zuschlag ergibt sich
aus den Daten — inklusive seiner **Unsicherheit**. Der physikalische Gate-Gedanke (nur nachts,
nur windstill, nur wolkenarm) bleibt: er wird als **Interaktionsterm** kodiert
(Senkentiefe × Nacht × (1−Bewölkung) × 1/(1+Wind)), nicht als `if`.

### 3.3 Verworfene Alternativen

| Alternative | Warum verworfen |
|---|---|
| **Volles Regression-Kriging / OI am Punkt** | Braucht ein Kovarianzmodell je Variable × Lead und dessen Parameter aus einem Archiv, das wir erst aufbauen. Der Gewinn gegenüber „elevationsbewusste Gewichtung + Stations-Anker-QC" ist am **Punkt** klein (bei einem einzigen Zielort entfällt der eigentliche Kriging-Vorteil, die räumliche Konsistenz). Die gelöschten `oi.ts`-Module waren fürs **Raster** gebaut — die Wiederbelebung wäre teuer und am falschen Problem. |
| **Bilinear/IDW ohne Höhenkorrektur** | In den Alpen systematisch falsch; das Repo hat den Fehler schon einmal gemessen (`audit/karten-layer-verortung.md`). |
| **Neuronales Downscaling auf ein feines Gitter** | Erzeugt ein Rasterprodukt, das wir nicht ausliefern wollen, kostet Artefaktvolumen und ist ohne feines Wahrheitsgitter nicht verifizierbar. |

---

## 4. Ebene 1–2 — statistisches Post-Processing

### 4.1 Stufe A: Online-Bias-Korrektur (funktioniert ab Woche 1)

Je Station $i$, Lead $\tau$, Variable: ein **Kalman-Filter / exponentiell gewichteter
Mittelwert** auf dem Fehler $e = \hat y - y$:

$$b_{t} = b_{t-1} + K_t\,(e_t - b_{t-1}),\qquad
K_t=\frac{P_{t-1}+Q}{P_{t-1}+Q+R},\qquad P_t=(1-K_t)(P_{t-1}+Q)$$

$Q$ (Prozessrauschen) und $R$ (Beobachtungsrauschen) je Variable×Lead aus den ersten Wochen
geschätzt; $Q/R$ steuert, wie schnell sich der Bias an Wetterwechsel anpasst.
Für Punkte **ohne** Station wird das Bias-Feld mit demselben höhenbewussten Verfahren wie
$x_b$ interpoliert — Bias-Felder sind glatter als die Felder selbst, das ist der Grund, warum
das funktioniert.

Zusätzlich **hierarchische Schrumpfung** (James–Stein-Form), damit eine Station mit wenigen
Beobachtungen nicht ihr eigenes Rauschen lernt:

$$\hat b_i=\frac{n_i}{n_i+k}\,\bar e_i+\frac{k}{n_i+k}\,\bar e_{\text{Region}(i)}$$

wobei „Region" über **Geländeklasse** definiert wird (Talboden / Hanglage / Kamm / Flachland),
nicht über Verwaltungsgrenzen. $k$ wird per CRPS-Kreuzvalidierung gefittet.

*Warum zuerst:* Datenbedarf < 3 Monate, kein Modellrisiko, und es adressiert den größten
bekannten Fehleranteil bei Lead 0–48 h.

### 4.2 Stufe B: Verteilungsmodell mit Geländeattributen

**Grundform (EMOS/NGR, Gneiting et al.)** für Temperatur und Taupunkt:

$$y\mid \mathbf{x} \sim \mathcal{N}\bigl(\mu,\sigma^2\bigr),\qquad
\mu=a(\mathbf{Z},\tau)+\sum_m b_m(\mathbf{Z},\tau)\,\hat y_m,\qquad
\sigma^2=c(\mathbf{Z},\tau)+d(\mathbf{Z},\tau)\,S^2$$

mit $\hat y_m$ = Vorhersage des Modells $m$ und $S^2$ = Ensemble-/Multi-Modell-Varianz.
$c,d \ge 0$ per Reparametrisierung ($c=\exp(\cdot)$). Geschätzt wird durch **CRPS-Minimierung**
über die geschlossene Gaußform (§1.1).

**Die zentrale Designentscheidung — und ihre ehrliche Einordnung.**
Der Auftrag verlangt: keine One-Hot-Stations-IDs, sondern Embeddings aus *Stationsattributen*.
Die Begründung ist **richtig und für dieses Produkt entscheidend**: eine One-Hot-ID ist an einem
Punkt ohne Station nicht auswertbar; ein Modell, das seinen Skill aus IDs zieht, generalisiert
per Konstruktion nicht. Das ist der Unterschied zwischen „MOSMIX für 6 000 Stationen" und
„Vorhersage für jeden Punkt".

**Aber**: ein *gelerntes* Embedding ist zunächst die falsche Umsetzung derselben richtigen Idee.
Rechnung zum effektiven Stichprobenumfang: bei ~250 DACH-Stationen, 4 Läufen/Tag und einem Jahr
sind es nominell ~$250\cdot4\cdot365 \approx 3{,}65\cdot10^5$ Fälle je Lead — aber die Fehler
sind stark autokorreliert. Unabhängig sind grob die **Wetterlagen** (~1 unabhängiger Fall je
2–3 Tage) mal die **räumlich unabhängigen Stationscluster** (~10–20 in DACH):
$$n_{\text{eff}} \approx \frac{365}{2{,}5}\times 15 \approx 2\,200 \text{ je Lead-Bin und Jahr.}$$
Das trägt eine Handvoll Koeffizienten pro Lead-Bin, keine gelernte Embedding-Schicht.

**Empfehlung, gestaffelt:**

1. **Attributvektor statt Embedding**: $\mathbf{Z}(s)$ = (z, $z-z_{\text{Modell}}$,
   $\mathrm{TPI}_{500}$, $\mathrm{TPI}_{2000}$, Neigung, $\cos$(Hang↔Sonne), Sky-View-Faktor,
   Landbedeckungsklasse, Landmaskenanteil der Modellzelle). Koeffizienten $a,b_m,c,d$ werden
   **linear in $\mathbf{Z}$** parametrisiert. Alle Stationen trainieren gemeinsam — das ist
   „Pooling über Attribute" und genau der Mechanismus, der auf stationslose Punkte überträgt.
2. **Gradient Boosting mit Pinball-Loss / Quantilregression** als nichtlineare Stufe, sobald das
   Archiv ≥ 2 Jahre trägt. Vorteil: keine Verteilungsannahme, Interaktionen (Senke × Nacht ×
   Windstille) werden gefunden statt gesetzt. Nachteil: mehr Parameter, Extrapolation außerhalb
   des Trainingsbereichs unkontrolliert.
3. **DRN (Distributional Regression Network) mit Attribut-Embedding** — erst wenn (2) gemessen
   gewinnt **und** das Archiv ≥ 3 Jahre trägt. Ein DRN im Browser scheidet ohnehin aus (§D);
   es liefert Koeffizientenfelder, keine Laufzeitinferenz.

**IDR (Isotonic Distributional Regression, Henzi/Ziegel/Gneiting)** als **hyperparameterarme
Referenz** in jeder Stufe: sie braucht nur eine Ordnung der Prädiktoren, hat keine
Hyperparameter und ist damit die härteste faire Baseline für jedes komplexere Verfahren.
`src/ml/isotonic.ts` (PAV) ist der halbe Weg dorthin.

**Analog-Ensemble (Delle Monache et al.)**: fürs lange Ende und für Variablen mit schiefer
Verteilung interessant, braucht aber **mehrjährige gepaarte** Reihen. `src/ml/analogEnsemble.ts`
existiert; einsatzfähig erst mit dem Archiv aus Phase 0 bzw. auf Reanalyse-Basis.

### 4.3 Niederschlag — eigene Familie

$y \ge 0$ mit Punktmasse bei 0. Drei Wege:

| Weg | Form | Bewertung |
|---|---|---|
| **Quantilregression / IDR direkt** | Schätze $q_{0{,}1},\dots,q_{0{,}9}$ per Pinball-Loss, danach Monotonisierung (Sortieren) | **Empfehlung für den Start.** Punktmasse bei 0 entsteht automatisch (mehrere untere Quantile = 0), keine Spezialfunktionen, keine Verteilungsannahme, direkt gate-fähig |
| **CSGD** (censored shifted gamma, Scheuerer & Hamill) | $y=\max(0, G-\delta)$, $G\sim\Gamma(k,\theta)$; geschlossene CRPS-Form | fachlich sauber, aber unvollständige Gammafunktion muss **von Hand** implementiert werden (D-06: keine neue Dependency). Ausbaustufe, wenn Quantilregression an der Auflösung scheitert |
| **Bernoulli–Gamma** | $P(y=0)=1-p$, sonst $\Gamma$ | zwei Modelle statt einem, PoP und Menge inkonsistent kalibrierbar |

**Zusätzlich immer separat**: PoP an den Schwellen 0,1 / 1 / 5 / 10 mm als eigenes,
isoton kalibriertes Produkt (Brier + Reliability sind dort die Gate-Metriken).

**Böen**: schief und nach unten durch die mittlere Windgeschwindigkeit beschränkt. Empfehlung:
Quantilregression auf $\log(1+\text{Böe})$ mit der harten Nebenbedingung
$q_p(\text{Böe}) \ge q_p(\text{Wind})$. Der heutige Fallback $1{,}4\times$ Wind entfällt.

**Bewölkung**: auf $[0,100]$ beschränkt und stark bimodal (0 % und 100 % häufig). Quantilregression
mit Zensierung an beiden Rändern; die erfundene 55/30/15-Schichtaufteilung wird nicht kalibriert,
sondern als Ableitung gekennzeichnet.

---

## 5. Ebene 3 — nahtloses Blending über die Vorlaufzeit

Statt handgesetzter Familienkurven: Gewichte als **Softmax über eine glatte Funktion von τ und
Kontext**

$$w_m(\tau,s,\text{Var}) = \frac{\exp\bigl(\eta_m(\tau) + \boldsymbol\beta_m^\top \mathbf{u}(s,\tau)\bigr)}{\sum_{m'}\exp\bigl(\eta_{m'}(\tau)+\boldsymbol\beta_{m'}^\top \mathbf{u}(s,\tau)\bigr)}$$

- $\eta_m(\tau)$: **glatte Kurve in τ**, als natürlicher kubischer Spline mit wenigen Knoten
  (z. B. τ ∈ {0, 3, 6, 12, 24, 48, 96, 168, 240, 336}) — garantiert Stetigkeit; „unsichtbare
  Modellgrenzen" sind damit eine Eigenschaft der Parametrisierung, keine Nachbearbeitung.
- $\mathbf{u}$: Kontext-Kovariaten, u. a. **Modell-Dissens** (Spread als Regimeindikator),
  Geländeklasse, Tageszeit, Jahreszeit (sin/cos), Verfügbarkeitsflags.
- Regularisierung: $\lambda\sum_\tau \bigl(\eta_m''(\tau)\bigr)^2$ gegen Zappeln;
  $\lambda$ per Kreuzvalidierung.
- Fitting: gemeinsam mit den EMOS-Parametern durch CRPS-Minimierung.

**Zwei harte Nebenbedingungen aus dem Betrieb:**

1. **Ausfallrobustheit**: fällt Modell $m$ aus, wird über die verbleibenden renormiert — der
   Softmax macht das automatisch, aber die Kalibrierung ($\sigma$) muss die reduzierte
   Informationsbasis kennen. Deshalb geht die **Menge der verfügbaren Modelle** als Kovariate
   in $\sigma$ ein.
2. **Stetigkeit an Modellhorizonten**: AROME endet bei 60 h, ICON-D2 bei 48 h, MOSMIX bei
   ~246 h. Der Spline muss dort **nicht** springen; der Verifier prüft
   $|\eta_m(\tau^+)-\eta_m(\tau^-)|$ an jedem Horizont gegen eine Schranke.

**Verworfen**: „bestes Modell je Lead auswählen" (Sprünge, Informationsverlust) und die heutigen
festen Faktoren (nicht optimierbar, nicht prüfbar).

---

## 6. Ebene 4 — das lange Ende: Dämpfung zur Klimatologie, hergeleitet

Sei $a=y-\mu_c(s,\text{doy},\text{Stunde})$ die Beobachtungsanomalie mit
$\mathrm{Var}(a)=\sigma_c^2$, und $f$ die Modellanomalie mit
$\rho(\tau)=\mathrm{corr}(f,a)$. Der im mittleren quadratischen Fehler optimale lineare
Schätzer ist

$$\hat a = \rho(\tau)\,\frac{\sigma_c}{\sigma_f}\,f,
\qquad \mathrm{Var}(a-\hat a) = \sigma_c^2\bigl(1-\rho(\tau)^2\bigr)$$

Daraus folgt beides zugleich, **ohne einen einzigen freien Parameter**:

- Der **Mittelwert** schrumpft mit $\rho(\tau)$ zur Klimatologie.
- Die **Streuung** wächst auf $\sigma_c$, sobald $\rho\to0$.

$\rho(\tau)$ wird je Variable, Lead-Bin, Jahreszeit und Geländeklasse **aus dem Archiv
geschätzt**, nicht gesetzt. Das ersetzt `SKILL_DECAY` (τ/floor) und `leadWeight()` aus
`src/ml/mosModel.ts` durch eine messbare Größe. Die Klimatologie $\mu_c,\sigma_c$ kommt aus der
harmonischen Regression (`src/ml/climatology.ts`), aber auf **stündlicher** Basis
(Jahresgang × Tagesgang, s. §6.1) und aus lizenzsicheren Beobachtungen (nicht Meteostat, s.
`datenquellen-matrix.md` §4).

### 6.1 Stündliche Klimatologie

$$\mu_c(\text{doy},h) = \sum_{k=0}^{K}\Bigl[a_k\cos\tfrac{2\pi k\,\text{doy}}{365{,}25}+b_k\sin\tfrac{2\pi k\,\text{doy}}{365{,}25}\Bigr]
+ \sum_{j=1}^{J}\Bigl[c_j(\text{doy})\cos\tfrac{2\pi j h}{24}+d_j(\text{doy})\sin\tfrac{2\pi j h}{24}\Bigr]$$

mit jahreszeitabhängigen Tagesgang-Amplituden $c_j,d_j$ (selbst wieder harmonisch in doy).
$K=3$, $J=2$ als Startwert (das bestehende `climaGrid` nutzt $K=3$ und speichert bereits
tmin/tmax-Harmonische, aus denen sich eine Tagesgang-Halbamplitude ergibt).

### 6.2 Kommunikation im Produkt

Ab dem Lead, bei dem $\rho(\tau)$ unter eine festzulegende Schranke fällt (Vorschlag: $\rho<0{,}3$,
je Variable gemessen), zeigt das Produkt **die Verteilung als Hauptaussage** und den Median nur
noch nachrangig — mit einem Satz, der sagt, dass hier die Bandbreite die Information ist.
Das ist die Umsetzung von D-04 in dieser Feature-Linie und **gate-blockierend**.

---

## 7. Ebene 5 — zeitliche und multivariate Kohärenz

Unabhängig kalibrierte Stundenquantile ergeben **keine** physikalisch plausiblen Verläufe: das
q90 aller 336 Stunden hintereinander ist kein Wetterablauf. Für Touren- und Eventplanung ist
aber genau der Verlauf die Frage.

| Verfahren | Voraussetzung | Bewertung hier |
|---|---|---|
| **ECC-Q** (Ensemble Copula Coupling, Schefzik et al.) | rohe Ensemble-**Member** am Punkt | scheidet aus, sobald wir nur Mittel+Spread ausliefern (GEFS-Weg). Nur verfügbar, wenn ECMWF-ENS-Member ins Artefakt kommen |
| **Schaake Shuffle** (Clark et al.) | **Beobachtungsarchiv** mit Mehrfach-Reihen | **Empfehlung.** Die Rangstruktur kommt aus historischen Tagen ähnlicher Jahreszeit/Wetterlage an derselben Station; unsere Randverteilungen werden dieser Struktur nachgeordnet |
| **Gauß-Copula mit gefitteter Zeit-Korrelationsmatrix** | Schätzung von 336×336 je Variable | zu viele Parameter, und die Struktur ist nicht stationär |

**Kosten, quantifiziert.** Direkte Auslieferung von $K$ Trajektorien:
$K \times 336\,\text{h} \times 7\,\text{Variablen} \times 2\,\text{Byte}$ → bei $K=50$
**235 KB je Punkt**. Zu viel.
Über Schaake-Vorlagen: ausgeliefert werden **Quantile** (§D: ~5 KB/Kachel) plus eine
**Vorlagenliste** (K historische Datums-IDs je Stationscluster und Jahreszeit) —
$50 \times 4\,\text{Byte} = 200\,\text{Byte}$ je Cluster/Saison. Der Client rekonstruiert die
Trajektorien lokal. **Faktor ~1000 gespart.**

**Wie viele Trajektorien?** Der Standardfehler einer aus $K$ Membern geschätzten
Überschreitungswahrscheinlichkeit ist $\sqrt{p(1-p)/K}$:

| $K$ | SE bei $p=0{,}5$ | SE bei $p=0{,}1$ |
|---|---|---|
| 20 | 0,112 | 0,067 |
| 50 | 0,071 | 0,042 |
| 100 | 0,050 | 0,030 |

Für Aussagen mit 10-%-Auflösung reicht $K=50$; darunter wird die angezeigte Wahrscheinlichkeit
selbst verrauschter als der Informationsgehalt. **Empfehlung: $K=50$.**

---

## 8. Prädiktoren — die vollständige Liste

| Gruppe | Größen | Verfügbar? |
|---|---|---|
| **Modellwerte** | je Modell die Zielvariable am Punkt (höhenkorrigiert) | ja |
| **Multi-Modell-Statistik** | Mittel, Spread, Min/Max, Quantile, **paarweiser Dissens** | ja |
| **Ensemble-Statistik** | Mittel + Spread aus GEFS `geavg`/`gespr`, ggf. ECMWF-ENS-Quantile | Artefakt (§D) |
| **Zeitzyklen** | $\sin/\cos$ (Tag, Jahr), Sonnenhöhe (bereits in `terrainPhysics.solarPosition`) | ja |
| **Jüngste Beobachtung + Bias-Verlauf 3–48 h** | größter Hebel bei Lead 0–24 h | ja (POI / TAWES / SMN); **Bias-Verlauf braucht das Archiv** |
| **Persistenz-Anomalie** | Beobachtungsanomalie zum Startzeitpunkt | ja |
| **Gelände** | z, $z-z_{\text{Modell}}$, TPI₅₀₀, TPI₂₀₀₀, Neigung, Exposition, SVF, Landbedeckung | ja (DEM) |
| **Regime/Wetterlage** | Bodendruckmuster, Schichtungsindex, Föhn-Score (`foehnDetector.ts`), 500-hPa-Anomalie | teilweise, Ausbaustufe |
| **Nachbarstationen** | Werte + Distanz/Höhendifferenz | ja |

---

## 9. Zusammenfassung der Modellwahl

| Ebene | Gewählt | Warum | Verworfen |
|---|---|---|---|
| Gitter→Punkt | höhenbewusste Interpolation + Terrain-Prädiktoren | vorhanden, verifiziert, billig | OI/Kriging (fürs Raster gebaut, teuer, am Punkt wenig Gewinn) |
| Kurzfrist-Korrektur | Kalman/EWMA + hierarchische Schrumpfung | funktioniert ab Woche 1 | statisches MOS (braucht Jahre) |
| Verteilung T/Td | EMOS/NGR mit attributabhängigen Koeffizienten, CRPS-gefittet | wenig Parameter, generalisiert auf stationslose Punkte | DRN mit gelerntem Embedding (Datenbedarf), One-Hot-IDs (generalisiert nicht) |
| Verteilung RR/Böe/Wolken | Quantilregression + IDR-Referenz | keine Verteilungsannahme, Punktmasse bei 0 automatisch | CSGD (Spezialfunktionen von Hand), Bernoulli-Gamma (zwei inkonsistente Teile) |
| Blending | Softmax mit Spline in τ, CRPS-gefittet, glättungsreguliert | stetig, regimefähig, optimierbar | Handgewichte (heute), „bestes Modell" (Sprünge) |
| Langes Ende | Schrumpfung mit gefittetem $\rho(\tau)$ | parameterfrei hergeleitet | fester Zerfall $\tau$/`floor` (heute) |
| Kohärenz | Schaake Shuffle mit Vorlagenliste | Faktor ~1000 im Volumen | direkte Trajektorien (235 KB/Punkt), ECC (Member nicht verfügbar) |

---

## 10. Literatur (benannt, in dieser Runde **nicht** gegen die Primärquelle geprüft)

- **EMOS/NGR** — Gneiting, Raftery, Westveld, Goldman (2005), *Calibrated probabilistic
  forecasting using ensemble model output statistics and minimum CRPS estimation*.
- **CRPS als properer Score** — Gneiting & Raftery (2007), *Strictly proper scoring rules*.
- **EMOS-Boosting** — Messner, Mayr, Zeileis (u. a. 2017), Prädiktorauswahl im
  Verteilungsmodell.
- **DRN** — Rasp & Lerch (2018), *Neural networks for postprocessing ensemble forecasts*.
  (Die dort berichteten Gewinne stammen aus einem mehrjährigen deutschen Stationsdatensatz;
  ihre Übertragbarkeit auf unser Archiv ist **erst nach eigener Messung** zu beurteilen.)
- **IDR** — Henzi, Ziegel, Gneiting (2021), *Isotonic distributional regression*.
- **CSGD** — Scheuerer & Hamill (2015), zensierte verschobene Gammaverteilung für Niederschlag.
- **ECC** — Schefzik, Thorarinsdottir, Gneiting (2013), *Uncertainty quantification in complex
  simulation models using ensemble copula coupling*.
- **Schaake Shuffle** — Clark et al. (2004).
- **Analog-Ensemble** — Delle Monache et al. (2013).
- **Kalman-MOS** — Homleid (1995); Galanis & Anadranistakis (2002).
- **Überblick Post-Processing** — Vannitsem et al. (2021), *Statistical postprocessing for
  weather forecasts: a review*.
- **DWD-MOSMIX-Verfahrensdokumentation** — vom DWD veröffentlicht; **in dieser Runde nicht
  beschafft**. Sie ist vor Phase 2 zu lesen: wer MOSMIX schlagen will, muss wissen, welche
  Prädiktoren MOSMIX bereits nutzt (sonst baut man dieselbe Korrektur ein zweites Mal).
