# FUSION_IMPROVEMENTS — Verbesserungspotenzial, neue Quellen, Verworfenes (Phasen 4b + 5)

> Stand **2026-09-07**. Reihenfolge nach **erwartetem Skill-Gewinn je Integrationsaufwand**,
> getrennt in „behebt einen Fehler" (F) und „steigert vermutlich Skill" (S). Jeder Eintrag
> nennt Wirkung (Variable/Horizont), Aufwand, Risiko, Constraint-Verträglichkeit und — bei
> Quellen — Ingest, Speicher und CDN-Volumen. Kein Eintrag ohne Bezug auf eine Codestelle.
> Quellen-Constraints des Auftrags gelten vor allen älteren MD-Aussagen.
>
> **Vorbemerkung zu den Constraints.** Die wörtliche Liste schließt „Rate-Limits" aus.
> GeoSphere (AROME, INCA, TAWES — alle in Produktion) dokumentiert 5 req/s · 240 req/h je IP
> (`docs/API.md` §4.1). Nach dem Wortlaut wären sie **blockiert**; nach dem erkennbaren Zweck
> (keine Freemium-/Key-Abhängigkeit) nicht. Diese Kollision ist unten als **„Klärung durch
> Jan"** markiert; der Ausweg ist in beiden Lesarten derselbe: **Spiegel im Daten-Repo per
> Actions** (ein Abrufer statt jeder Browser), wie beim ICON-D2-Repack.

---

## 1. Lückenanalyse — wo der heutige Quellenmix schwach ist

Basis: `FUSION_AUDIT.md` §1.3–1.5. „Unabhängigkeit" = Anteil eines anderen Modellzentrums
oder einer Beobachtung am Mix.

| Variable × Lead | Quellen heute (DE / AT / CH) | Lücke | Fehler, der daraus entsteht | Was helfen würde |
|---|---|---|---|---|
| **T, Td, Wind 0–3 h** | DE: 6 DWD-Stationen (0–5 h) + MOSMIX · AT: TAWES + INCA + AROME + MOSMIX · CH: SMN + AROME + MOSMIX | Beobachtungsanker vorhanden, aber **falsch angebunden** (K-1), ohne Messalter (H-5); kein Satellit für Wolken; CH ohne Nowcast-Modell | Tageszeit-Bias 0,5–1,4 K bei h = 1–5; Stationsausfälle unbemerkt | K-1/H-5 beheben; INCA-Analyse auch für CH-Randpunkte; Satelliten-Wolkenanker (nur als Bild, §3.10) |
| **RR 0–2 h** | DE: RADOLAN-RV · AT: INCA-Punkt · CH: rzc nur h = 0 | CH hat keine Extrapolation; alle drei werden von K-2 gedämpft | Radar 5 mm/h ⇒ Median 2,3 | K-2 beheben; CH: rzc-Extrapolation aus `src/nowcast` (existiert für die Karte) in den Punktpfad |
| **T, Wind, RR 3–48 h** | DE: **nur MOSMIX** · AT/CH: AROME + MOSMIX | DE: kein hochauflösendes Modell, kein zweites Zentrum; überall: alles ICON-Familie (MOSMIX = MOS auf ICON-EU/IFS-Mix, AROME = eigenes Modell, aber GeoSphere) | kein Fusionsgewinn möglich; `equivalentSources = 1,00` in DE | **ICON-D2 aus dem Daten-Repo** (liegt schon dort), **IFS HRES** (anderes Zentrum), ICON-D2-EPS-Spread |
| **2–7 d** | MOSMIX (alle) | 7-km-Basis, keine Ensemble-Unsicherheit; H-1 dämpft die einzige Quelle doppelt | Unterschätzte Anomalien, Prior-σ statt Situations-σ | IFS HRES + **GEFS-Mittel/Spread** oder **ICON-EU-EPS**; H-1 beheben |
| **7–14 d** | GFS 1° (nur bei `hours > 240`, kein Consumer) | de facto **Klimatologie** ab 222 h (MOSMIX-Auslauf) bzw. 246 h; GFS ohne Orografie (H-3) | Extrapolation in den Prior; Gipfel +2 K | IFS HRES 0,25° bis 240/360 h, AIFS-single, GEFS-Spread; H-3 beheben |
| **Alpen / AT / CH** | AROME 2,5 km (AT-BBox reicht nach CH/S-DE), INCA 1 km (AT), MOSMIX-Station bis 30 km entfernt | **ICON-CH1-EPS (1 km) / ICON-CH2-EPS (2,1 km) fehlen** in CH; DE-Alpenrand hat außer AROME nichts Hochauflösendes; Klimatologie mit 6 Stationen > 1500 m | Interpolation aus grobem Feld, Kaltluftsee/Föhn nur als Prior | ICON-CH1/CH2-EPS, ICON-D2 (deckt AT/CH-Alpen mit 2,2 km), stündliche Höhenklimatologie aus `klima-v2-1h`/SMN |
| **Bewölkung, alle Leads** | MOSMIX-Gesamtbedeckung, synthetisch 55/30/15 | keine Beobachtung, keine Schichten | Kaltluftsee-Gate falsch (M-4), Astro-Nutzen null | ICON-D2 `clcl/clcm/clch` (Repack-Familie vorhanden), DWD-POI-Bewölkung als Obs, Satellit |
| **Böe** | MOSMIX FX1, AROME, Stationen | Prior 6 m/s ortsunabhängig; keine Konvektionsböen | Sturm gedämpft, Gewitterböen fehlen | ICON-D2 `vmax_10m` (Repack), `cape_ml` als Regime-Kovariate (Repack) |
| **Phase / Schneefallgrenze** | aus T-Verteilung + RH-Blend | keine Modell-Schneefallgrenze außer AROME; `snowLine` unfusioniert | DE ohne Schneefallgrenze | ICON-D2 `snowlmt`, `impliedSnowLineM` (V-PV-10) |

**Der Kern der Lücke:** Der Mix ist in DE eine Quelle, in AT/CH zwei aus derselben
Datenassimilations-Welt. Die korrelierte Kombination in `combine.ts` hat nichts zu
kombinieren. Was der Engine am meisten fehlt, ist nicht mehr Mathematik, sondern **ein
zweites Modellzentrum (ECMWF) und das eigene ICON-D2, das schon im CDN liegt.**

---

## 2. Priorisierte Liste (Fehler zuerst, dann Skill)

| # | Art | Maßnahme | Wirkung (Variable / Horizont) | Aufwand | Risiko | Constraints |
|---|---|---|---|---|---|---|
| **1** | F ✅ 2026-09-07 | **K-1: Obs-Anomalie gegen Klimatologie der Messstunde** — Sample bekommt `validAtMs`; `fuseScalar` rechnet `anomaly = (raw − clima(t_obs) − resolved)/slope`, Posterior addiert `clima(h)`; `attach.ts` liefert `clima(t₀)` mit | T, Td, Wind 1–5 h, alle Länder; Bias 0,5–1,4 K weg | klein (3 Dateien: `types.ts`, `sampleSources.ts:629-651`, `fuse.ts:325-350`, `attach.ts:111-119`) | gering; Verifier-Fixture mit stundenvariabler Klimatologie ergänzen (heute unsichtbar, `fuse.ts:758-773`) | keine |
| **2** | F ✅ 2026-09-07 | **K-3: Klimatologie-Ausfall sichtbar machen** — `FusedPoint.climaSource: 'grid' \| 'fallback'`; ohne Grid entweder `null` oder Marker; `attach.ts` reicht `clima === null` durch | Ehrlichkeit; verhindert 5–13 K stille Fehler | sehr klein | keins | D-04 |
| **3** | F ✅ 2026-09-07 (Prior √ρ; Messung offen) | **H-1: `AMPLITUDE.mosmix` als Funktion des Leads** (≈ 1 bei h ≤ 24, → ρ bei h ≥ 120; Form aus MOS-Theorie: α = ρ für einen Regressionsschätzer); bis zur Messung Zwischenwert √ρ | T, Td, Wind 2–10 d in allen Ländern: Anomalien +10…30 % | klein (`priors.ts:133-135` → Funktion; `fuse.ts:304`) | mittel: falscher α übertreibt Anomalien; **messen** in V-B/V-C (α = sd(MOSMIX-Anomalie)/sd(Obs-Anomalie) je Lead — aus 48 h MOSMIX + POI sofort schätzbar für h ≤ 48) | keine |
| **4** | F ✅ 2026-09-07 (Hurdle-Verteilung, `ACC.precipOcc`, Tail-Prior; GPV3d 208/208) | **K-2: Niederschlag zweistufig** — (a) P(nass) aus den Quellen als **kalibrierte Wahrscheinlichkeit** (logistische Kombination der Quell-PoPs mit ρ als Gewicht, Prior p_wet,h), (b) Menge **bedingt auf nass** als Quantil-Abbildung des Quellwerts (Probability Matching gegen die Klimatologie nasser Stunden statt Gauß-Schrumpfung); logCensored bleibt als Ausgabeform, Parameter aus (a)/(b) rückgerechnet | RR 0–336 h: Mengen-Bias weg, P(nass) bei starken Signalen von 50–60 % auf 70–90 % | mittel (neue Funktion neben `fuseScalar`, `fuse.ts:644-659`; Verifier-Fälle „5 mm/h bleibt nass") | mittel: ohne Messung ist die Kalibrierung wieder ein Prior — aber ein deutlich weniger falscher; Vergleichsanker sind rohes MOSMIX/Radar (V-A) | keine |
| **5** | F | **H-5/H-6: Zeitstempel und Laufalter** — `PointSourceSample.validAtMs`, `issuedAtMs`; Stationen > 70 min alt ⇒ ρ₀-Abwertung nach der obs-Kurve (Alter als Lead), > 3 h ⇒ raus; ρ(τ) mit τ = Lead ab Initialisierung (AROME `reference_time` durchreichen, GFS `run`, MOSMIX Ausgabezeit aus BrightSky `sources` bzw. Daten-Repo) | 0–6 h Robustheit; 7–14 d ρ-Ehrlichkeit | klein–mittel | gering | keine |
| **6** | F ✅ 2026-09-07 | **H-2: Taupunkt-Lapse** 0,0018 K/m auf dem Mittel (`fuse.ts:574-583`, analog `:553-555`) | Td/RH in AT/CH/Mittelgebirge: 5 %-Punkte | sehr klein | keins | keine |
| **7** | F | **H-4: Tobit-Varianz exakt** — `varEff` so wählen, dass `varPost = σ_c²(1 − (σ_c²/σ_T²)·λ(λ+α))`; geschlossen lösbar aus `fuse.ts:397-401` | P(nass) nach Trockenmeldung 0,4 → 2,5 % | sehr klein | keins | — |
| **8** | F | **H-3: Zellhöhe für GFS/IFS** — `HGT:surface` einmal je Lauf holen (`gfsPoint.ts:32-44`), als `sourceElevation` setzen ⇒ Lapse greift; dito für AROME, falls GeoSphere-Grid-Höhe beschaffbar (`sampleSources.ts:414-420`: **unklar**) | T 7–14 d Alpen: ±2 K | klein | keins | — |
| **9** | F | **M-7/Td ≤ T als Verteilungsbedingung** — Böe: `mu = max(mu, ν·1,15)` **und** σ-Kopplung; Td: Kopplung über die gemeinsame Normalverteilung (r = 0,55…0,88 ist schon da, `fuse.ts:618`) | Plausibilität aller Quantile | klein | keins | — |
| **10** | F (teilweise ✅ 2026-09-07: Auslauf wirkt auf das Gewicht, nicht auf ρ; Fenster 24 h bleibt) | **M-1: MOSMIX-Auslauf** von 24 h auf ≤ 6 h **oder** Übergabe an IFS statt an die Klimatologie (dann ist ein Auslauf überflüssig) | 222–246 h | trivial (`priors.ts:99`) | keins | — |
| **11** | S | **ICON-D2 aus dem Daten-Repo in den Punktpfad** (§3.1) | T, Wind, Böe, RR, Wolkenschichten, CAPE 0–48 h, DE/AT/CH-Alpen | mittel | gering (Daten liegen im CDN, Leser existiert für die Karte) | ✅ |
| **12** | S | **IFS HRES 0,25° als Repack-Familie** (§3.2) | T, Td, Wind, RR, Wolken 3–240 h, alle Länder — erstes unabhängiges Zentrum | mittel–groß (Cron = **STOPP & FRAGEN**) | Cron-Robustheit (V-BW-58) | ✅ (CC-BY-4.0, kein Key) |
| **13** | S | **Klimatologie stündlich und höhentreu** aus CDC/`klima-v2-1h`/SMN (Jahresgang × Tagesgang je Station, K = 3, J = 2; `mathematik-spezifikation.md` §6.1); mehr Stationen > 1500 m | Alle Variablen ab Tag 5, K-1-Restfehler, M-2 | mittel (Offline-Generator wie `_buildClimaGrid.ts`; Artefakt ~150–250 KB) | Lizenz jetzt geklärt: DWD/GeoSphere/SMN CC BY 4.0; Meteostat laut Lizenzseite CC BY 4.0 (§3.13) | ✅ |
| **14** | S | **Online-Bias je Station × Lead** (EWMA/Kalman) aus MOSMIX-Rollfenster (48 Läufe) × POI (24 h): **ohne Archiv** rechenbar in Actions, Artefakt ~250 Stationen × 8 Leads × 4 Variablen ≈ 30 KB; Bias-Feld höhenbewusst interpoliert (§4.1 der Mathematik-Spezifikation) | T, Td, Wind 0–48 h an und nahe Stationen | mittel (Cron = STOPP & FRAGEN) | Leck-Gefahr im Test (t₀-Disziplin) | ✅ |
| **15** | S | **ICON-D2-EPS-Spread als situative σ** (Repack `iconD2EpsSource.ts` existiert für die Karte) statt Prior-ρ für 0–48 h; `σ_skill² = a + b·Spread²` (EMOS-Form) | T, Wind, RR 0–48 h Kalibrierung | mittel | mittel: Spread-Skill-Verhältnis von ICON-D2-EPS ist zu messen | ✅ |
| **16** | S | **GEFS `geavg`/`gespr` 0,5°** als Repack-Familie (PV5-Plan) | 2–14 d Unsicherheit situativ | groß (Cron, 191 MB/Lauf Ingest, ~9 MB/Lauf CDN) | STOPP & FRAGEN | ✅ Public Domain |
| **17** | S | **ICON-CH1/CH2-EPS** für CH (§3.3) | T, Wind, RR, Böe 0–33/120 h in CH und Grenzräumen | groß | Retention 24 h ⇒ Cron alle 3 h; Domänenrand | ✅ (Lizenz am Collection-Objekt zu belegen) |
| **18** | S | **Modellpaar-Korrelationen statt Familien** (`priors.ts:365-386` → Tabelle je Tag `mosmix|gfs`, `mosmix|ifs`, `icon_d2|arome_at`…), später aus V-B gefittet | alle, sobald ≥ 2 Modelle | klein | keins | — |
| **19** | S | **σ_rep-Doppelzählung entfernen** (ρ₀ stationsverifiziert enthält Repräsentativität; `implementierung-pv3.md` §7.1): ρ₀ als „ACC gegen die Zellwahrheit" umdeuten, Stationsanteil aus V-A/V-B schätzen | alle, 0–48 h Streuung | klein (Zahl), Messung nötig | mittel | — |
| **20** | S | **Föhn als Mischung** (zwei Normalverteilungen, Durchbruch ja/nein) statt Aufweitung; Föhn-Score aus AROME/ICON-CH1 statt aus dem Altpfad-Blend | T, Wind Alpen-Nordseite | mittel (fünfte Familie in `dist.ts`) | mittel | — |
| **21** | S | **Nebel/Hochnebel-Term** (RH ≥ 95 %, Kaltluftsee, Sky-View, ICON-D2 `clcl`) als Regime mit Wolken-Aufweitung und T-Deckel | T, Wolken Winter, Becken | groß | groß (eigene Physik, eigenes Gate) | — |
| **22** | S | **UI-Marker** `climatologyOnly`/`contributors`/`equivalentSources` (V-PV-14) — erst dann darf angeschlossen werden | Ehrlichkeit | klein | keins | D-04 |

**Aus V-A₁ (2026-09-07) neu priorisiert — gemessen, nicht mehr vermutet:**

| # | Art | Maßnahme | Messbefund | Aufwand |
|---|---|---|---|---|
| **23** | F ✅ 2026-09-08 (Innovations-Persistenz `anchor.ts`, Default, Kill-Switch `?anchor=value`; T 1–6 h 2,18 → 0,92 K) | **Altpfad-Anker entkleben (V-PV-19):** `obs.base0 = 5,0` mit Halbwertszeit 2,5 h ist Wertpersistenz; entweder Anomaliepersistenz wie K-1 oder Gewicht/Halbwertszeit auf ~1,5/1,0 h | Altpfad T bei 1–6 h **2,03 K** gegen 0,89 K rohes MOSMIX (Bias −0,80) — das Produkt zeigt heute diesen Wert | klein; **Jans Entscheidung**, weil es das Produkt ändert |
| **24** | F/S | **σ_c und ρ₀ für T aus den V-A-Datensätzen fitten (V-PV-18):** stündliche Anomalie-Streuung je Station statt Tagesmittel-Residuum; ρ(τ) aus MAE-Reihen | Fusion-T Spread/Skill **0,50–0,60**, PIT-Ränder 0,42–0,51 — Kalibrierungs-Gate verletzt | mittel (Fit-Skript auf den Scorecard-Records; Parameterdatei `params/pv-*.json`) |
| **25** | F | **Wind-Prior senken / messen:** `windSigmaAt` (3,2 + 0,0016·z) auf Stations-Klimatologie | Fusion-Wind Bias **+0,23 → +0,35 m/s** mit dem Lead, MAE 7–22 % schlechter als MOSMIX | klein (Zahl) + Messung |
| **26** | F | **Rückfall-Streuungen Td/Böe** (`CLIMA_SIGMA_FALLBACK`) aus Stationsdaten | Spread/Skill Td 1,1–1,4, Böe 1,9–2,3 | klein |
| **27** | F | **H-4 (Tobit-Varianz)** jetzt gemessen | Fusion sagt nach Trockenmeldung 0–1 % nass, beobachtet 2 % | klein (Formel im Audit) |

**Nicht empfohlen vor PV2:** Anschließen des Fusionspfads an irgendeinen Consumer. Die
Reihenfolge ist 1–7 (Fehler) → V-A messen → 11/12/13 → V-B/V-C → Anschluss je Bin
(Hybridbetrieb ausdrücklich erlaubt, `retro-verifikation.md` §8).

---

## 3. Neue Quellen — Kandidaten mit harter Prüfung

Bewertung je Kandidat: Lücke · Unabhängigkeit · Lizenz (**belegt**, nicht angenommen) ·
Zugang · Architektur (kein Backend, Actions + Daten-Repo + jsDelivr, 150 MB/Repo,
20 MB/Datei) · Latenz/Ausfall · Abdeckung · **A/B-Experiment**.

### 3.1 DWD ICON-D2 (+ ICON-D2-EPS) — **liegt bereits im CDN**

| Kriterium | Befund |
|---|---|
| Lücke | 3–48 h hochauflösend in DE; Wolkenschichten (`clcl/clcm/clch`), `vmax_10m`, `cape_ml`, `snowlmt`; EPS-Spread (20 Member) |
| Unabhängigkeit | **gering** gegen MOSMIX (gleiches Zentrum, MOSMIX nutzt ICON-EU/IFS) — aber: rohes DMO mit voller Amplitude, eigene Orografie (`hsurf` als `sourceElevation`), 2,2 km statt Stationsinterpolation ⇒ an stationslosen Punkten der größte Einzelgewinn |
| Lizenz | CC BY 4.0 (GeoNutzV), `docs/API.md` §1 — belegt |
| Zugang | Repack-Familien in `buscosun-data` über jsDelivr, `index.json` (BW-12/13); kein Key, kein Rate-Limit, Netlify 0 Bytes |
| Architektur | ✅ vorhanden; Client-Leser für die Karte (`repackSource.ts`), Punktabtastung fehlt (bilinear auf `regular-lat-lon`, Muster `quadSampler.ts`) |
| Latenz | Lauf+50…67 min (BW §31.18), 8×/Tag; Ausfall = V-BW-58 (Publish ohne Retry) — **Vorbedingung: T2c-Retry** |
| Abdeckung | DE + AT + CH + Alpen (D2-Domäne) |
| Volumen | **0 zusätzlich** (Familien existieren); ggf. `t_2m/td_2m/u/v/vmax/tot_prec/clc*` als Familien prüfen, welche fehlen (`scripts/lib/repackManifest.mjs:FAMILIES`) |
| Offen | Quantisierung der PNG-Familien (Schrittweite je Variable) — für Punktwerte zu prüfen; `td_2m` als Familie **unklar** |
| **A/B** | V-A (24 h rückwirkend, ICON-D2 8 Läufe): Fusion mit vs. ohne ICON-D2 an 60 DE-Stationen + 30 AT/CH, Leads 1–24 h, T/Wind/RR/Wolken; Ziel CRPSS ≥ 3 % gegen „ohne" **und** nicht schlechter als rohes ICON-D2 an Stationen > 800 m. |

### 3.2 ECMWF Open Data — IFS HRES 0,25° (und AIFS-single)

| Kriterium | Befund |
|---|---|
| Lücke | 3–240 h (00/12z; 06/18z bis 144 h) als **zweites Modellzentrum** in allen Ländern; ersetzt GFS 1° am langen Ende (bis 360 h für 00/12z laut Portal) |
| Unabhängigkeit | **hoch** gegen ICON/MOSMIX (eigene Assimilation), mittel gegen GFS |
| Lizenz | **CC-BY-4.0 + ECMWF Terms of Use: „may be redistributed and used commercially, subject to appropriate attribution"** — ecmwf.int/en/forecasts/datasets/open-data, abgerufen 2026-09-07 (und M-13) |
| Zugang | **keine Registrierung, kein Key**; Limit **500 gleichzeitige Verbindungen**; Rollarchiv 12 Läufe; Spiegel auf AWS S3 `ecmwf-forecasts` ab 2023-01-18; `.index`-Sidecar ⇒ Byte-Range je Feld (`ecmwfIfsSource.ts` existiert) |
| Architektur | Repack-Familie per Actions: je Lauf 7 Variablen × ~61 Schritte (3-h bis 144, 6-h bis 240) × 0,65 MB Weltfeld ≈ **280 MB Ingest**, DACH-Ausschnitt als PNG ~50 KB/Schritt ⇒ **~20 MB/Lauf im Repo** bei 7 Variablen — mit Retention 2 an der 150-MB-Grenze eng; Variablen auf T/Td/u/v/RR/Wolken/Böe beschränken und 6-h-Takt ab 72 h ⇒ ~8 MB/Lauf |
| Latenz | ~+7–9 h nach Lauf (*Annahme*, Adapterkommentar; **auszählen über ≥ 24 Zyklen**, Muster BW §31.18) |
| Abdeckung | global |
| Prod-Falle | `/_ecmwf`-Rewrite historisch nur im Dev-Proxy (A1/V-01) — für den Actions-Weg irrelevant, für jeden Client-Direktpfad blockierend |
| **A/B** | V-B (Hindcast ab 2023): Fusion(GFS) vs. Fusion(IFS) vs. Fusion(GFS+IFS) für 24–240 h, T/Wind/RR, ≥ 150 Stationen, 2 Jahre; Ziel: IFS-Variante CRPSS > 0 gegen GFS-Variante in jedem Bin, und gegen rohes IFS ≥ 0 an Stationen ≤ 800 m. Prospektiv (V-C): MOSMIX+IFS vs. MOSMIX allein 48–240 h. |

### 3.3 MeteoSchweiz ICON-CH1-EPS / ICON-CH2-EPS

| Kriterium | Befund |
|---|---|
| Lücke | CH: 1 km / 33 h (CH1, 11 Member, alle 3 h) und 2,1 km / 120 h (CH2, 21 Member, alle 6 h); Ensemble-Spread; Föhn/Talwind physikalisch |
| Unabhängigkeit | gering gegen ICON-D2 (Modellfamilie), mittel gegen MOSMIX, **hoch als Auflösung** |
| Lizenz | MeteoSchweiz OGD; am SMN-STAC-Objekt `license: CC-BY` gemessen (M-19); für die Collections `ch.meteoschweiz.ogd-forecasting-icon-ch1/-ch2` **am Objekt zu belegen** (Doku-Seite nennt die Lizenz nicht; abgerufen 2026-09-07) |
| Zugang | STAC `data.geo.admin.ch/api/stac/v1/`, **kein Key genannt**; **Retention 24 h** ⇒ Cron-Takt ≤ 3 h zwingend; GRIB2 je Variable/Lead/Referenzzeit |
| Architektur | Repack-Familie; Oberflächenfelder klein; Domäne CH + Rand ⇒ Kachel ~30 KB/Schritt; CH1 33 Schritte × 6 Variablen ≈ 6 MB/Lauf, CH2 (6-h) ähnlich |
| Latenz/Ausfall | **unklar** (nicht dokumentiert in der abgerufenen Seite) — auszählen |
| Abdeckung | **nur CH und Grenzsaum** — Vorarlberg/Tirol/Süd-DE teilweise |
| Constraint | ✅ nach Beleg der Collection-Lizenz; sonst blockiert |
| **A/B** | V-A/V-C in CH: Fusion(AROME+MOSMIX) vs. +ICON-CH1 an ~40 SMN-Stationen, Leads 1–33 h, stratifiziert Tal/Kamm; Ziel CRPSS ≥ 5 % Wind auf Kämmen, ≥ 3 % T |

### 3.4 DWD ICON-EU (deterministisch) und ICON-EU-EPS

| Kriterium | Befund |
|---|---|
| Lücke | 48–120 h roh (MOSMIX-Basis mit voller Amplitude); AT/CH jenseits AROME 60 h; EPS 40 Member für 2–5 d |
| Unabhängigkeit | **sehr gering** gegen MOSMIX (MOSMIX ist MOS auf ICON-EU) — Wert liegt in Amplitude und Orografie, nicht in Unabhängigkeit |
| Lizenz | CC BY 4.0, belegt (`docs/API.md`) |
| Zugang | opendata.dwd.de, kein Key, kein CORS ⇒ `/_dwd_opendata` bzw. Actions; ICON-EU-EPS Volumen **nicht gemessen** (global-EPS 36 MB/Schritt gemessen, M-09) |
| Architektur | Repack wie ICON-D2 (Druckflächen 28,6 MB ungecacht sind eine bekannte Altlast, `audit/bandbreite.md`) |
| Urteil | **nach IFS**, nicht davor: gleicher Aufwand, weniger Unabhängigkeit. EPS erst nach GEFS/ICON-D2-EPS-Messung. |
| **A/B** | wie 3.2 mit ICON-EU statt IFS; Interpretation nur als Amplituden-/Orografie-Test |

### 3.5 NOAA GEFS 0,5° `geavg` + `gespr` (bis 384 h)

Bereits als PV5 geplant (`implementierungsplan.md`). Lizenz Public Domain (belegt), kein
Key, S3 ab 2024 (belegt). Ingest ≈ 191 MB/Lauf, Repo ≈ 9 MB/Lauf int8 (gerechnet). Lücke:
situative Unsicherheit 2–14 d. **A/B:** V-B-Hindcast: Fusion mit Prior-ρ vs. Fusion mit
σ_skill aus `gespr` (EMOS-Form a + b·s²) für 48–336 h; Ziel: Spread-Skill in [0,85; 1,20]
**und** CRPSS > 0 gegen die Prior-Variante. Aufruf nur nach 3.2.

### 3.6 DWD-Stationsdaten POI (974 Stationen inkl. AT/CH) und CDC 10-min `now`

| Kriterium | Befund |
|---|---|
| Lücke | (a) mehr Anker (heute 6 nächste via BrightSky, DE-only), (b) **Bewölkung, Sicht, Sonnenschein, `present_weather`** als Obs, (c) **Bias-Verlauf 24 h** je Station für #14, (d) Wahrheit für V-A |
| Unabhängigkeit | Beobachtung — maximal |
| Lizenz | CC BY 4.0, belegt (M-06) |
| Zugang | kein Key; kein CORS ⇒ Actions-Spiegel (alle 974 Dateien ≈ 7 MB/h roh ⇒ als eine Kachel ~150 KB stündlich ins Daten-Repo, Retention 6) |
| Architektur | ✅ kleine neue Familie `kind: 'points'` (dieselbe Frage wie PV1 für MOSMIX) |
| Latenz | POI-Aktualisierung stündlich, Verzug ~10–30 min (**auszählen**) |
| Constraint | ✅ |
| **A/B** | V-A: Fusion mit BrightSky-6 vs. mit POI-Anker (bis 12 nächste, Wolken/RH/Böe) für 0–6 h; plus #14-Bias-Term an/aus 6–48 h |

### 3.7 GeoSphere AROME / INCA / TAWES (in Betrieb) — **Klärung durch Jan**

Dokumentiertes Limit 5 req/s · 240 req/h je IP. Nach dem Wortlaut der Constraints
blockiert, nach Sinn nicht. Empfehlung unabhängig von der Lesart: **INCA-Analysefelder
(t2m, rh2m, ff, dd, rr) und AROME als Repack-Familien spiegeln**, damit der Browser
GeoSphere nicht mehr direkt trifft (heute bis 3 Aufrufe je Punktabfrage). Gewinn zusätzlich:
INCA-Analyse als Anker für stationslose AT-Punkte (1 km, beobachtungsgetrieben). Lizenz CC BY
4.0 belegt (`docs/API.md` §4).

### 3.8 Radar-Composites AT/CH — kein Neubedarf

INCA-Grid (AT), rzc (CH) und RADOLAN-RV (DE) sind im Repo und im Daten-Repo-Spiegel (RD3).
Was fehlt, ist die **rzc-Extrapolation** im Punktpfad (Kartenpfad hat sie, `src/nowcast`).
Kein neuer Ingest. EUMETNET-OPERA via MeteoGate: s. §4 (verworfen).

### 3.9 DWD MOSMIX_S (stündlich) direkt statt BrightSky — PV1 (J-3)

Unabhängigkeitsgewinn null, aber: Ausgabezeit bekannt (H-6), alle DACH-Stationen (mehrere
statt eine ⇒ `pointPairCorrelation` bekommt echte Abstände, M-6), kein SLA-Risiko. Welches
Produkt BrightSky heute liefert, konnte nicht belegt werden (Doku-Abruf leer) — **unklar**.

### 3.10 EUMETSAT — nur EUMETView-WMS (Bilder), Data Store blockiert

EUMETView ist ohne Registrierung nutzbar (WMS/WCS/WFS); der **Data Store und alle
numerischen Produkte erfordern ein EOP-Konto** ⇒ nach Constraint **blockiert**. Ein
Wolken-Anker für 0–3 h aus WMS-Kacheln (Bildklassifikation, wie `dwdSatellite.ts` für die
Karte) ist technisch möglich, aber ein Bildverfahren ohne Kalibrierung — **nicht empfohlen**
vor 3.6 (POI-Bewölkung ist die einfachere Beobachtung).

### 3.11 Météo-France AROME/ARPEGE — unklar, zurückgestellt

Adapter existieren für die Karte (`aromeFranceSource.ts`, `arpegeSource.ts`, `/_mf`), der
Prod-Rewrite ist ein bekannter Defekt (A1/V-01). Lizenz (Etalab 2.0) und Zugangsweg (Portal
mit Key vs. offener Bucket) sind in dieser Runde **nicht belegt** ⇒ bis zum Beleg blockiert.
Relevanz für DACH: Westrand (Saar/Pfalz/Basel).

### 3.12 Copernicus / CAMS — blockiert

ADS verlangt Konto + persönliches Token und Lizenzannahme je Datensatz (abgerufen
2026-09-07). Für T/Wind/RR ohnehin irrelevant (Luftqualität, Strahlung).

### 3.13 Meteostat — Lizenzlage neu

`dev.meteostat.net/license` nennt **CC BY 4.0** mit Attribution an Meteostat und die
Datenlieferanten (abgerufen 2026-09-07). Damit ist V-PV-07(b) („unbelegt") **überholt**:
`climaGrid.json` ist lizenzseitig nicht blockiert. Für die **stündliche** Klimatologie (#13)
ist Meteostat trotzdem die falsche Quelle (Tageswerte); CDC/`klima-v2-1h`/SMN direkt.

---

## 4. Geprüft und verworfen

| Quelle | Grund | Beleg |
|---|---|---|
| **Open-Meteo** (alle Endpunkte, inkl. Ensemble/Previous-Runs) | nicht-kommerzieller Free-Tier + Rate-Limit ⇒ Constraint; im Repo bereits D-18 | `datenquellen-matrix.md` §5 |
| **CAMS / ADS** | Registrierung + Token + Lizenzannahme; fachlich irrelevant | ads.atmosphere.copernicus.eu/how-to-api (2026-09-07) |
| **EUMETSAT Data Store** (numerische Produkte) | EOP-Konto erforderlich | user.eumetsat.int/data-access/data-store (2026-09-07) |
| **EUMETNET OPERA via MeteoGate** | anonym nur mit niedrigen Limits, sonst API-Key-Portal ⇒ Constraint; nationale Composites sind im Repo | eumetnet.github.io/openradardata-documentation (2026-09-07) |
| **ECMWF ENS vollständig** | ≈ 197 GB/Lauf gemessen-hochgerechnet; kein Ingest-Weg | M-11, `datenquellen-matrix.md` §1.1 |
| **ECMWF AIFS-ENS** (51 Member) | wie ENS ≈ 3,9 GB/Lauf für 2 Variablen — erst nach GEFS-Messung, als Ausbaustufe | M-12 |
| **ICON-EPS global** | 36 MB/Schritt/Variable, 2,5 GB je Variable und Lauf | M-09 |
| **BrightSky als Dauerquelle** | privat betrieben, kein SLA; bleibt Rückfallweg (PV1) | `datenquellen-matrix.md` §2 |
| **MeteoSwiss-App-Backend** | undokumentiert, ohne Lizenz | `docs/API.md` §11 |
| **Meteostat für Stundenklimatologie** | Tagesauflösung; Lizenz ok, Daten ungeeignet | §3.13 |
| **Météo-France** | Lizenz/Zugang unbelegt, Prod-Rewrite defekt | §3.11 |
| **ERA5 / Reanalysen als Wahrheit** | Selbstähnlichkeit; nur Prädiktor/Klimatologie | `retro-verifikation.md` §2 |
| **Lightning (BLIDS/EUCLID/nowcast GmbH)** | kommerzielle Lizenz | `docs/API.md` §11 |

---

## 5. Aufwand und Reihenfolge (Empfehlung)

| Block | Inhalt | Aufwand (AT) | Gate |
|---|---|---|---|
| **0 — Fehler** | #1 K-1, #2 K-3, #3 H-1 (Zwischenwert), #6 H-2 **✅ 2026-09-07 (Gate GPV3c 187/187)**; offen aus diesem Block: #7 H-4, #9, #22 UI-Marker | 3–5 | `verify:pv-fusion` mit neuen Fixtures (stundenvariable Klimatologie, „5 mm/h bleibt nass", `clima:null` sichtbar) |
| **1 — Messen** | `verify:pv-metrics`, V-A-Nachrechnen mit t₀-Parameter (`FUSION_VERIFICATION.md` §9.1–9.2) — **V-A₁ ✅ 2026-09-07** (`verify:pv-score`, DE/MOSMIX_L/POI, erster Schnappschuss in `implementierung-pv3.md` §11); offen: `verify:pv-metrics`, AT/CH, Anspruch B, tägliche Fortschreibung | 8–12 | erste CRPSS-Tabelle 0–24 h gegen Altpfad, MOSMIX, Persistenz — **liegt vor** |
| **2 — K-2 und Quellen 0–48 h** | #4 Niederschlag zweistufig **✅ 2026-09-07**; #11 ICON-D2 aus dem CDN (+EPS #15); #5 Zeitstempel | 10–15 | V-A: RR-Reliability auf der Diagonale; ICON-D2-A/B |
| **3 — Zentrum Nr. 2** | #12 IFS HRES als Repack-Familie (STOPP & FRAGEN), #8 Zellhöhe, #18 Paarkorrelationen | 10–15 + Cron | V-B-Hindcast IFS vs. GFS |
| **4 — Prior ersetzen** | #13 Stundenklimatologie, #14 Online-Bias (Cron), #19 σ_rep-Entflechtung, #3 α gemessen | 10–15 | V-B/V-C, PIT flach, Spread-Skill im Band |
| **5 — Alpen/CH, Langfrist** | #17 ICON-CH1/CH2, #16 GEFS, #20 Föhn-Mischung, #21 Nebel | je 15–25 | je eigenes A/B |

Gesamt bis zu einem **belegten** Anschluss (Blöcke 0–3): ≈ 30–45 AT plus zwei Cron-Freigaben.
Ohne Block 1 ist jede weitere Zahl eine Behauptung — das gilt auch für dieses Dokument.
