# Programmablaufpläne — Punktvorhersage 0–336 h

**Norm:** DIN 66001 · **Stand:** 2026-09-09 · **Status:** Entwurf, nicht freigegeben

Sechs Ablaufpläne für den Fusions- und Downscaling-Algorithmus: vom Modellgitter
über die vertikale Korrektur bis zu den kalibrierten Quantilen an einem beliebigen
Punkt im DACH-Raum.

> Die Diagramme sind als Mermaid notiert und rendern in GitHub, GitLab und den
> meisten Editoren direkt. Die normgetreue Fassung mit den exakten DIN-Symbolen
> liegt zusätzlich als SVG vor.

---

## Symbole

| DIN 66001 | Bedeutung | Mermaid-Form |
|---|---|---|
| Rechteck mit halbkreisförmigen Schmalseiten | Grenzstelle (Anfang, Ende) | `([Text])` |
| Rechteck | Operation | `[Text]` |
| Rechteck mit doppelten Seitenlinien | Unterprogramm | `[[Text]]` |
| Parallelogramm | Ein-/Ausgabe | `[/Text/]` |
| Raute | Verzweigung | `{Text}` |
| Sechseck | Schleifengrenze (Modifikation) | `{{Text}}` |
| Linie mit Pfeil | Ablauflinie | `-->` |

Ablauflinien verlaufen, wo nicht anders gekennzeichnet, von oben nach unten.

---

## PAP 1 — Hauptablauf der Punktabfrage

Was im Browser passiert, sobald ein Standort angefragt wird. Die drei Range-Requests
holen für jede Auflösungsstufe einen Chunk; der Terrain-Stack liegt nach dem ersten
Aufruf im Cache. Die Schleife läuft über alle 141 Zeitschritte von 0 bis 336 h.

```mermaid
flowchart TD
    S(["Start · Punktabfrage (φ, λ, t)"])
    E1[/"Terrain-Stack am Punkt lesen:<br>h, TPI, SVF, z0, imperv, d_water"/]
    E2[/"Fusions-Chunks lesen (3 Range-Requests):<br>T̄ und σ je Zielgröße, dazu die Profilfelder<br>gamma_eff, z_base, z_inv, dT_inv, h_mod_eff"/]
    L1{{"für jeden Zeitschritt f = 0 … 140"}}
    U1[["Gitter → Punkt<br>PAP 3"]]
    U2[["Vertikale Korrektur<br>PAP 4"]]
    U3[["Terrain-Terme<br>PAP 5"]]
    L2{{"nächster Zeitschritt"}}
    U4[["Konsistenz und Unsicherheit<br>PAP 6"]]
    A1[/"Ausgabe: p10 / p50 / p90,<br>Konfidenz-Score, Herkunft je Quelle"/]
    ND(["Ende"])

    S --> E1 --> E2 --> L1 --> U1 --> U2 --> U3 --> L2
    L2 -->|Rücksprung| L1
    L2 --> U4 --> A1 --> ND
```

**Zu beachten:** Konsistenz und Unsicherheit laufen bewusst *nach* der Schleife.
Erst wenn alle Zielgrößen heruntergerechnet sind, ergibt eine Prüfung wie
„Taupunkt ≤ Temperatur" überhaupt Sinn.

---

## PAP 2 — Offline-Ingest je Modelllauf

Läuft achtmal täglich in der Ingest-Pipeline, nicht im Browser. Aus dem
Vertikalprofil jeder Gitterzelle entstehen fünf kompakte Hilfsfelder, die der
Client später statt des ganzen Profils bekommt — das ist der Grund, warum das
Latenzziel überhaupt erreichbar ist.

```mermaid
flowchart TD
    S(["Start · Modelllauf verfügbar (≈ T+70 min)"])
    E1[/"GRIB2 lesen: T_2M, HSURF, CLCT, U/V_10M,<br>Modelllevel T (unterste ~25) + HHL,<br>EPS-Member bzw. Perzentile"/]
    O1["ikosaedrisches Gitter → reguläres Gitter<br>(CDO-Gewichte des DWD)"]
    L1{{"für jede Gitterzelle"}}
    O2["Vertikalprofil T(z) aus Modellleveln,<br>Höhen über HHL"]
    V1{"∂T/∂z &gt; 0 über ≥ Δz_min ?"}
    O3["z_base, z_inv, dT_inv aus Profil setzen<br>(Inversion)"]
    O4["z_inv := z_base<br>gamma_eff regressieren"]
    L2{{"nächste Gitterzelle"}}
    U1[["Bias-Korrektur je Quelle<br>(MOS-Fenster + Kalman)"]]
    U2[["Fusion über die Quellen<br>w = Σ⁻¹1 / (1ᵀΣ⁻¹1)"]]
    O5["quantisieren, Chunks bilden<br>(Zeitreihe je 16×16-Block)"]
    A1[/"fusion_&lt;Lauf&gt;.bin → Objektspeicher"/]
    ND(["Ende"])

    S --> E1 --> O1 --> L1 --> O2 --> V1
    V1 -->|ja| O3
    V1 -->|nein| O4
    O3 --> L2
    O4 --> L2
    L2 -->|Rücksprung| L1
    L2 --> U1 --> U2 --> O5 --> A1 --> ND
```

**Zu beachten:** Die Verzweigung prüft `∂T/∂z > 0`, **nicht** `∂θ/∂z > 0`.
Letzteres ist stabile Schichtung und liegt in fast jeder Nacht vor — mit dieser
Schwelle würde der Inversionszweig zum Normalfall statt zum Sonderfall.
Umrechnung: `∂T/∂z > 0` entspricht `∂θ/∂z > (θ/T)·g/c_p ≈ 0,0098 K/m`.

---

## PAP 3 — Gitter → Punkt

Die Interpolation von der Gitterzelle auf die exakte Position. Das Gewicht eines
Nachbarpunkts fällt nicht nur mit der horizontalen Distanz, sondern auch mit der
Höhendifferenz und der Unähnlichkeit der Landnutzung.

```mermaid
flowchart TD
    S(["Eingang · Zielpunkt (φ, λ), Chunk-Daten"])
    O1["N nächste Gitterpunkte bestimmen<br>(N = 4 … 9, je Modellauflösung)"]
    L1{{"für jeden Nachbarpunkt g"}}
    O2["d_g = horizontale Distanz<br>Δh_g = abs( h_mod(g) − h_true )<br>κ_g = Landnutzungs-Ähnlichkeit"]
    O3["w_g = exp(−(d_g/L_d)²) · exp(−(Δh_g/L_h)²) · κ_g"]
    L2{{"nächster Nachbarpunkt"}}
    O4["normieren: w_g := w_g / Σ w_g"]
    O5["gewichtet mitteln:<br>T̄, σ, gamma_eff, z_base, z_inv,<br>dT_inv, h_mod_eff"]
    ND(["Ausgang · Zellwerte am Punkt"])

    S --> O1 --> L1 --> O2 --> O3 --> L2
    L2 -->|Rücksprung| L1
    L2 --> O4 --> O5 --> ND
```

**Zu beachten:** Bilineare Interpolation würde im Gebirge einen Gipfelwert ins Tal
ziehen, weil sie nur die Entfernung kennt. `L_d` und `L_h` sind Kalibrierungs­parameter,
keine physikalischen Konstanten.

---

## PAP 4 — Vertikale Korrektur

Der Kern des Verfahrens und die einzige Stelle mit einer echten Fallunterscheidung.
Ob nach oben oder unten gerechnet wird, entscheidet nicht die Höhendifferenz allein,
sondern die Frage, ob eine Inversion vorliegt und wo der Punkt relativ zur
Modelloberfläche liegt.

```mermaid
flowchart TD
    S(["Eingang · T̄, h_mod_eff, gamma_eff,<br>z_base, z_inv, dT_inv, h_true"])
    V1{"z_inv &gt; z_base ?"}
    A["FALL A · keine Inversion<br>T := T̄ − gamma_eff · (h_true − h_mod_eff)"]
    V2{"h_true ≥ z_base ?"}
    B["FALL B · im Inversionskörper<br>u := (h_true − z_base) / (z_inv − z_base)<br>T := T̄ + dT_inv · (φ(u) − φ(u_mod))"]
    C["FALL C · unter Modellniveau<br>Γ_inv := dT_inv / (z_inv − z_base)<br>T := T̄ − Γ_inv · (z_base − h_true)<br>Flag: extrapoliert"]
    O1["Δh := h_true − h_mod_eff protokollieren<br>(Herkunftsinformation)"]
    ND(["Ausgang · höhenkorrigierte Temperatur T"])

    S --> V1
    V1 -->|nein| A
    V1 -->|ja| V2
    V2 -->|ja| B
    V2 -->|nein| C
    A --> O1
    B --> O1
    C --> O1
    O1 --> ND
```

**Zu beachten:** `φ` ist monoton steigend mit `φ(0) = 0` und `φ(1) = 1` — unten kalt,
oben warm. Startform linear, kalibrierbar gegen Stationspaare in Inversionslagen.
Fall C ist der unsichere Zweig: Der Punkt liegt *unter* der Modelloberfläche, das
Modell kennt diese Senke also gar nicht. Er wird protokolliert und bekommt in PAP 6
ein breiteres Unsicherheitsband.

Vorzeichenkonvention, hier verbindlich: `Γ = −∂T/∂z`. Normale Schichtung → `Γ > 0`,
Inversion → `Γ < 0`.

---

## PAP 5 — Terrain-Terme

Kaltluftsee und Wärmeinsel sind beides Strahlungsnacht-Phänomene. Deshalb steht der
Wetterfaktor `f_rad` ganz vorne: Er entscheidet, ob die geländeabhängigen Terme
überhaupt wirken dürfen.

```mermaid
flowchart TD
    S(["Eingang · T, clct, v10, TPI, SVF, imperv, z0"])
    O1["f_rad := (1 − clct/100)^a · exp(−v10 / v_ref)"]
    V1{"f_rad &lt; ε ? (durchmischt)"}
    O2["ΔT_cap := 0<br>ΔT_uhi := 0"]
    V2{"Muldenlage (TPI &lt; −1σ)<br>UND stabil geschichtet ?"}
    O3["ΔT_cap := −A · g(TPI, SVF, Tiefe)<br>· f_rad · f_saison · (1 − foehn_prob)"]
    O4["ΔT_cap := 0"]
    O5["ΔT_uhi := A_uhi(imperv, SVF) · f_rad · f_saison"]
    O6["T := T + ΔT_cap + ΔT_uhi"]
    O7["Wind: Blending-Height-Korrektur über z0<br>und Verdrängungshöhe d (zweistufig)"]
    ND(["Ausgang · T, v am Punkt"])

    S --> O1 --> V1
    V1 -->|ja| O2
    V1 -->|nein| V2
    V2 -->|ja| O3
    V2 -->|nein| O4
    O3 --> O5
    O4 --> O5
    O5 --> O6
    O2 --> O6
    O6 --> O7 --> ND
```

**Zu beachten:** Zwischen klarer, windstiller Nacht und bedecktem, windigem Wetter
liegt bei der kleinräumigen Spreizung ein Faktor von etwa 3 bis 7. Ohne `f_rad`
wäre eine statische Korrektur nachts zu schwach und tagsüber grob falsch.

Der Faktor `(1 − foehn_prob)` ist nicht kosmetisch: Föhn räumt Kaltluftseen aus.
Ein Verfahren, das gleichzeitig Kaltluftsee und Föhn diagnostiziert, hat einen Fehler.

Die einstufige Windformel `v = v_mod · ln(10/z0_true) / ln(10/z0_mod)` ist **falsch** —
sie liefert über Wasser Faktor 2,35, also +135 % Wind aus dem Nichts. Korrekt ist die
zweistufige Blending-Height-Korrektur mit Verdrängungshöhe.

---

## PAP 6 — Konsistenz und Unsicherheit

Der Abschluss. Erst die harten physikalischen Bedingungen, dann die
Unsicherheitsrechnung, dann die Quantile — je Zielgröße aus einer anderen
Verteilungsfamilie.

```mermaid
flowchart TD
    S(["Eingang · alle Zielgrößen am Punkt"])
    O1["T_d := min(T_d, T)<br>RH := clip(RH, RH_min, 100)<br>clct := max(clct, clcl, clcm, clch)<br>v_max := max(v_max, abs(v10))"]
    V1{"T_feucht &lt; Schneeschwelle ?"}
    O2["Art := Schnee<br>Schneefallgrenze = T_w-Nullgradgrenze<br>− Schmelzversatz"]
    O3["Art := Regen"]
    V2{"Ensemble verfügbar ?"}
    O4["σ := c(p,f) · σ_ens"]
    O5["σ² := σ_div² + σ_sys²"]
    O6["σ_ges² := σ² + σ_quant² (Quantisierung)"]
    O7["Quantile je Verteilungsfamilie:<br>T, T_d, p → normal<br>v, Böe → Weibull<br>Niederschlag → zensiert mit Punktmasse 0"]
    O8["conf := conf_spread · conf_agree · conf_lage"]
    ND(["Ausgang · p10 / p50 / p90 + Konfidenz"])

    S --> O1 --> V1
    V1 -->|ja| O2
    V1 -->|nein| O3
    O2 --> V2
    O3 --> V2
    V2 -->|ja| O4
    V2 -->|nein| O5
    O4 --> O6
    O5 --> O6
    O6 --> O7 --> O8 --> ND
```

**Zu beachten:** Eine Normalverteilung für Niederschlag würde negative p10 erzeugen,
für Wind bei Schwachwind ebenso.

`σ_div` allein unterschätzt systematisch — er misst nur, worin die Modelle sich
unterscheiden, nicht ihren gemeinsamen Fehler. Der Sockel `σ_sys²` aus der
Verifikation ist zwingend. Bei nur einer beitragenden Quelle wird der Nenner von
`σ_div²` exakt null; dort entfällt der Term und `σ_ges² = σ_sys² + σ_quant²`.

`σ_quant² = Δ²/12` mit `Δ` aus Bit-Tiefe und Wertebereich — die Auslieferung führt
selbst einen Fehler ein, und der gehört ins Budget.

---

## Feldglossar

| Feld | Bedeutung | Herkunft |
|---|---|---|
| `T̄`, `σ` | fusionierter Median und Streuung je Zielgröße | Ingest (PAP 2) |
| `gamma_eff` | effektive Abnahmerate `Γ = −∂T/∂z` | aus Modellprofil regressiert |
| `z_base` | absolute Höhe der Inversionsbasis ü. NN | Profilauswertung |
| `z_inv` | absolute Höhe der Inversionsobergrenze ü. NN; `z_inv = z_base` heißt: keine Inversion | Profilauswertung |
| `dT_inv` | Temperaturzunahme von `z_base` bis `z_inv`, positiv | Profilauswertung |
| `h_mod_eff` | effektive Modellorographie des fusionierten Feldes | gewichtetes Mittel der `HSURF` |
| `h_true` | Geländehöhe am Punkt | Copernicus DEM GLO-30 |
| `TPI` | Topographic Position Index, zwei Skalen | Terrain-Stack |
| `SVF` | Sky-View-Faktor | Terrain-Stack |
| `z0` | aerodynamische Rauhigkeitslänge | WorldCover → Davenport-Klasse |
| `imperv` | Versiegelungsgrad | GHS-BUILT-S |
| `f_rad` | Wetterfaktor für Strahlungsnacht-Phänomene | zur Laufzeit |
| `foehn_prob` | Föhnwahrscheinlichkeit | Lee-Geometrie + Modellprofil |

**Alle Bezugshöhen sind absolut über NN**, nicht über Grund. Das Mischen beider
Bezüge ist hier die leichteste Art, sich einen stillen Fehler einzubauen.

---

## Offene Punkte

- Amplituden `A` (Kaltluft) und `A_uhi` (Wärmeinsel) werden an Stationsbeobachtungen
  **gelernt**, nicht gesetzt. Ob genug Stationen in Muldenlagen liegen, ist auszuzählen.
- Sämtliche Startwerte (`L_d`, `L_h`, `Δz_min`, `v_ref`, `a`, `ε`, `z_b`, Schmelzversatz)
  sind Kalibrierungsparameter, keine physikalischen Konstanten.
- Die Schrittfolge ist entworfen, nicht verifiziert. Genauigkeitsaussagen erst nach
  dem Baseline-Lauf.
