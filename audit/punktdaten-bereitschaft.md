# Bereitschaftsanalyse: buscosun-data und buscosun-web für buscosun Fusion (0–336 h)

> **Stand 2026-09-14, PD-Diagnose. Nur gelesen — kein Code, keine Workflow-Datei, kein Manifest geändert, nichts committet.**
> Auftrag Jans: Repository `buscosun-data`, Repository `buscosun-web` und den Algorithmus (Anhang
> `ABLAUFPLAENE.md`, PAP 1–6) gegeneinander prüfen; neun Fragen beantworten; zwei Tabellen; klares Urteil.
> Der Anhang ist **byte-identisch** mit `buscosun-web/ABLAUFPLAENE.md` (md5 `391299be…`) — es gibt nur eine Fassung.
>
> **Belegbasis (lokale Kopien, keine GitHub-API):** `buscosun-data/point/index.json` (Schema 5, Commit `9bd1e62`,
> `publishedAt 2026-09-14T16:56:22Z`), `point/sources.json`, `point/calib.json`, `point/2026091415/run.json` (t1),
> `point/2026091400/run.json` (t2+t3), `point/stations/2026091409/stations.json`, `.github/workflows/{point,build,radar}.yml`;
> `buscosun-web/src/pointForecast/*`, `src/point/*`, `src/point/client/*`, `src/sources/{radarImg,radolan,geosphereIncaGrid,meteoSwissRadar}.ts`,
> `src/globe/gfs.ts`, `package.json`, `audit/punktarchiv.md`, `CLAUDE.md` (nur als Zweitquelle).
> Alles, was nicht aus diesen Dateien folgt, ist als **Annahme** oder **offen** markiert.

---

## §0 Kurzfazit

**Nein — noch nicht bereit, aber näher, als die Lücken-Liste vermuten lässt.** Genauer, in drei Sätzen:

1. **Die Datenbasis für PAP 1, 3, 4 und den Kern von PAP 6 liegt vor.** Der Punkt-Cube trägt alle
   Vorhersagefelder, die der Algorithmus für 0–336 h braucht (Mittel, σ_div, σ_ens, Quantile, Wolkenschichten,
   Schneefallgrenze, Druckflächen, Profilfelder, Modellhöhe), in drei Stufen mit passender Maschenweite;
   Stationsprodukt und Nowcast-Spiegel liegen daneben. Das ist **belegt** (index.json, run.json).
2. **Was fehlt, ist nicht Datenmenge, sondern Verbindung und Messung:** (a) `buscosun-web` liest den Cube und
   das Stationsprodukt **nirgends** — buscosun Fusion holt seine Vorhersagen weiter live von BrightSky, GeoSphere
   (INCA, AROME nwp-v1 — Abschaltung 2026-11-01), DWD-UV und NOAA (GFS-Proxy); nur der Nowcast-Spiegel wird schon
   aus dem Daten-Repo gelesen; (b) **alle** kalibrierbaren Größen in `calib.json` sind `null`, die Cube-Fusion läuft
   mit `weights: "equal", provenance: "fallback"`, und `buscosun-archiv` ist leer — PAP 2 (Σ), PAP 5 (A, A_UHI,
   f_rad) und PAP 6 (σ_sys, c_spread) sind damit **nicht messbar**, nur setzbar.
3. **Drei harte Datenlücken** bleiben: Versiegelung/Verdrängungshöhe (`imperv`, `d0` — PAP 5, E-13), Profil- und
   Quantilfelder jenseits 48 h (PAP 4/6 in t2/t3 nur über Druckflächen), und ein **fehlender t3-Rückfall-Lauf**
   (Retention 24 h hält am Nachmittag nur EINEN t3-Lauf, gemessen 16:56 UTC). Dazu zwei Takt-Befunde: der
   t2-Slot verfehlt MOSMIX-L um ≈ 26 min (V-PD-28, `ageH 7,06` bestätigt) und hat gegen ICON-EU nur ≈ 8 min Rand.

Die priorisierte Liste steht in §6.

---

## §1 Was der Algorithmus verlangt — Feldbedarf je PAP

Aus dem Anhang (Feldglossar + PAP 1–6), nicht aus dem Repo. „Hz" = Vorhersagestunde.

| PAP | Stufe | Benötigte Eingangsdaten | Herkunft laut Algorithmus |
|---|---|---|---|
| 1 | Zellwahl / bilineare Abtastung | Gitterwerte T, Td, u, v, Böe, RR, clct, ps je Hz; Gitterdefinition; Modellhöhe h_mod je Zelle | Modell-Cube je Stufe + h_mod-Raster |
| 2 | Fusion | dieselben Werte **je Quelle**; Fehlerkovarianz Σ (Quelle × Quelle × Variable × Hz) | Quellenwerte + kalibrierte Σ |
| 3 | horizontale Korrektur | Nachbarzellen, DEM am Punkt (h_pt, Neigung, Exposition, TPI), L_d, L_h | DEM + Kalibrierung |
| 4 | vertikale Korrektur | h_mod, h_pt, γ_eff, z_base, z_inv, ΔT_inv, φ(·), Δz_min; T/RH 925/850/700 als Ersatz | Profilfelder je Hz + Kalibrierung |
| 5 | lokale Effekte | Kaltluftsee (TPI, A), Stadt (imperv, SVF, d0, A_UHI), Strahlung (clct, v10, f_rad), Wind (z0, d, h_pt, Exposition), Föhn (Druckgradient, RH 700/850) | Statik (DEM, Landbedeckung, **imperv, d0**) + Cube + Kalibrierung |
| 6 | Unsicherheit + Anker | σ_div, σ_ens, q10/q90, σ_sys, c_spread; Beobachtung t0 und Historie ≤ 6 h für Anker-Offsets (τ nach Größe) | Cube + Beobachtungen + Kalibrierung |
| 0–3 h | Nowcast | RR aus Radar-Extrapolation (RV/INCA), Analyse (RZC), Abdeckung | Nowcast-Spiegel |
| Verif. | Kalibrierung aller Priors | eigene Vorhersagen **und** Messwahrheit über Wochen/Monate, punktweise | Archiv (buscosun-archiv) |

Anker-Konstanten aus `src/pointForecast/anchor.ts` (belegt): `ANCHOR_HISTORY_H = 6`, `ANCHOR_HISTORY_TAU_H = 3`,
τ je Größe {T 4 h, Feuchte 4 h, Wind 2 h, Böe 2 h}. Der Algorithmus braucht also **6 h Beobachtungshistorie je
Punkt**, nicht mehr — das ist die einzige „Rückwärts"-Anforderung im laufenden Betrieb.

---

## §2 Tabelle A — Bedarf, Vorhandensein, Takt, Retention je Datensatz

Legende Status: **✓ vorhanden** · **◐ teilweise** · **✗ fehlt** · **offen** = nicht prüfbar aus den gelesenen Dateien.
„Aktueller Takt" = Cron/Spiegel laut Workflow, „Empfohlener Takt" mit Begründung in §5.8.

| Daten | Für Algorithmus benötigt | Vorhanden | Quelle | Aktueller Takt | Empfohlener Takt | Speicherung / Retention | Status |
|---|---|---|---|---|---|---|---|
| Vorhersagefelder 0–48 h (t2m, td2m, u10, v10, gust, precip, clct, ps, snowlmt, clcl/clcm/clch), stündlich | PAP 1/2/5/6 | ja: t1, 0,05°, 201×241, 49 Schritte, 57 Ebenen | ICON-D2 (tragend), ICON-CH1-EPS, C-LAEF; Diversität ICON-EU, IFS, AIFS | 8×/Tag `40 1,4,…,22` (ICON-D2 −1,67 h; EPS/CH1/C-LAEF aus −3 h, C-LAEF-EPS −6 h — belegt im Manifest) | **beibehalten** (= Modelltakt; Rand 18 min gemessen) | `point/<run>/t1/`, BSPC int16, 208 Chunks ≈ 93 MB/Lauf; Retention **9 h** (3 Läufe) | ✓ |
| Vorhersagefelder 51–120 h, dreistündlich | PAP 1/2/5/6 | ja: t2, 0,1°, 101×121, 24 Schritte | ICON-EU (tragend), ICON-EU-EPS, ICON-CH2-EPS; Diversität ICON global, AICON, IFS, AIFS | 4×/Tag `50 3,9,15,21` | **`30 4,10,16,22`** (s. §5.8: Rand ICON-EU 8 → 48 min, MOSMIX-L wird erreicht) — Cron-Änderung = STOPP & FRAGEN | `point/<run>/t2/`, 56 Chunks ≈ 8,8 MB; Retention 24 h (4 Läufe) | ✓ (Takt knapp) |
| Vorhersagefelder 126–336 h, sechsstündlich | PAP 1/2/6 | ja: t3, 0,25°, 41×49, 36 Schritte | IFS HRES (360 h), AIFS Single, ICON global (≤ 180 h), AICON, ICON-EPS global, IFS-ENS | 2×/Tag `55 9,21` (IFS oper 00z/12z) | **2×/Tag beibehalten**; Vorziehen auf ≈ `35 8,20` erst nach Messung der 12z-Bereitstellung (offen) | `point/<run>/t3/`, 12 Chunks ≈ 1,5 MB; Retention 24 h → **hält nachmittags nur 1 Lauf** (belegt) | ◐ Retention |
| Lücke 121–125 h und > 328 h | PAP 1 (Achse) | **nein**: t2 endet 120 h, t3 beginnt 126 h; Nutzbarkeit bis 328 h (V-PD-55, Naht beweglich) | — | — | — | — | ✗ (klein) |
| σ_div (`*_sd`) je Größe, alle Stufen | PAP 6 | ja, 8 Größen | Streuung über alle gelesenen Quellen, **gleiche Gewichte** | mit Stufe | mit Stufe | im Cube | ◐ (Gewichte ungemessen) |
| σ_ens (`*_sd_ens`) | PAP 6 | ja: t1 ICON-D2-EPS (6-h-Schritte 3…45), t2 ICON-EU-EPS (12-h-Schritte 60…120), t3 ICON-EPS global (**nur t2m**, 144/168) + IFS-ENS | DWD/ECMWF-Ensembles | mit Stufe | mit Stufe | im Cube (interpoliert auf Stufenachse — Annahme, Interpolation nicht geprüft) | ◐ t3 dünn |
| Quantile q10/q90 | PAP 6 (Band) | **nur t1** aus C-LAEF-EPS (7 Größen); t2/t3 `quantiles: null` | GeoSphere | mit t1 | — | im Cube | ◐ |
| Profilfelder γ_eff, z_base, z_inv, ΔT_inv | PAP 4 | **nur t1** (ICON-D2 Modelllevel, 41 von 49 Schritten, `missing 8`, `inversionShare 0,60`); t2/t3 `profile: null` | ICON-D2 | mit t1 | mit t1 | im Cube | ◐ |
| Druckflächen T/RH 925/850/700 | PAP 4 (Ersatz), PAP 5 Föhn | t1: 925 nur ICON-EU/IFS/AIFS (V-PD-58); t2: alle drei; **t3: nur 850** (E-E-4 offen); AIFS ohne RH (E-E-2) | ICON-EU, IFS, AIFS, ICON-D2 (850/700) | mit Stufe | mit Stufe | im Cube | ◐ |
| Modellhöhe h_mod je Quelle (`hModEff`, `point/static/hmodel/v1/`) | PAP 1/4 | ja, zeitlos, Hash-Vergleich je Bau; **fehlt** für C-LAEF, C-LAEF-EPS, AICON (keine Orographie veröffentlicht) | DWD/MeteoSchweiz/ECMWF invariant | je Bau geprüft | **beibehalten** (ändert sich nur bei Modell-Upgrade) | `point/static/hmodel/v1/{static.json,t1,t2,t3}` | ◐ (V-PD-57: t3 > 180 h trägt ICON-globals Höhe) |
| `srcCount`, `ensCount` | PAP 6 (Zweigwahl) | ja | Cube | — | — | im Cube | ✓ |
| Stationsvorhersage MOSMIX-L (3071 Stationen, 247 h, stündlich) | PAP 2 (Stationsquelle), Bias-Anker | ja, eigenes Produkt | DWD | im t2-Job 4×/Tag, **26 min vor Bereitstellung** ⇒ nutzt Vorlauf, `ageH 7,06` | mit t2-Verschiebung: Lauf + ≈ 90 min | `point/stations/<run>/`, ≈ 7,2 MB/Lauf, 3 Läufe gehalten | ◐ (V-PD-28) |
| MOSMIX-S (stündlich, 240 h) | optional | nein (`pending`) | DWD | — | **nicht aufnehmen** (Annahme: Nutzen neben ICON-D2 + Anker gering, 24 Läufe/Tag Volumen) | — | — |
| Nowcast RR: RADVOR RV (0–2 h), INCA (0–3 h), CombiPrecip RZC (Analyse) | 0–3 h | ja, Live-Spiegel neben dem Cube | DWD, GeoSphere, MeteoSchweiz | Spiegel alle 1–2 min, `KEEP 12` | **beibehalten** | `radar/img/v1/{rv,inca,rzc}`, u8-PNG vMax 20; RV zusätzlich `radar/rv` verlustfrei | ✓ (Byte-0-Zweideutigkeit, Sättigung, V-PD-56 dokumentiert) |
| CH-Nowcast (Extrapolation) | 0–3 h CH | **nein** (E1 nur auf Anfrage — `blocked`) | MeteoSchweiz | — | — | — | ✗ (extern) |
| INCA T2m (Analyse) | Anker CH/AT | in sources.json `vars: [precip, t2m]`, im Spiegel **nur RR** (Annahme aus radarImg-Layout) | GeoSphere | — | — | — | offen |
| Beobachtung t0 + 6 h Historie je Punkt | PAP 6 Anker | **nicht im Daten-Repo**; live in web (`fetchNearestStationObs` 6, `fetchStationHistory`: BrightSky/TAWES/SMN) | DWD/GeoSphere/MeteoSchweiz | live je Abfrage | **live belassen** (Beobachtung altert minütlich; ein 3-h-Spiegel wäre älter als die Quelle) | — | ✓ (aber nicht in data) |
| DEM, Neigung, Exposition, TPI, SVF | PAP 3/4/5 | am Punkt gerechnet (`terrainPoint.ts`, Terrarium-Kacheln) — Jans Entscheidung 2026-09-09, kein Datenprodukt | Terrarium / Copernicus | — | — | — | ✓ (Client) |
| Landbedeckung, z0 | PAP 5 Wind | Spiegel `buscosun-worldcover`; `z0Table` Literatur | ESA WorldCover | statisch | jährlich prüfen | eigenes Repo | ✓ |
| Versiegelung `imperv`, Verdrängungshöhe `d0` | PAP 5 Stadt/Wind | **nein** (E-13) | GHS-BUILT-S / GHS-BUILT-H (frei) | — | einmalig, dann jährlich | vorgeschlagen `point/static/urban/v1/` (§5.7) | ✗ |
| Fehlerkovarianz Σ, σ_sys, c_spread, L_d, L_h, A, A_UHI, f_rad, φ-Knoten, Δz_min | PAP 2/3/4/5/6 | **alle `null`** in `calib.json`; nur dryAdiabatic, standardLapse, z0Table, gammaSign gesetzt | Verifikation | — | nach ≥ 30 Tagen Archiv erstmals, dann monatlich | `point/calib.json` (zeitlos) | ✗ (Struktur ✓) |
| Verifikationsarchiv (eigene Vorhersagen + Messwahrheit, punktweise) | Kalibrierung | **leer** (`buscosun-archiv`, PA0 = Plan) | eigener Sammler | — | täglich (Plan PA1) | eigenes Repo, append-only | ✗ |
| UV-Index | Zielgröße (nicht in PAP 1–6) | live in web (`fetchDwdUvPoint`); nicht im Cube | DWD | live | 1×/Tag, falls in den Cube (offen: Bedarf) | — | ◐ |
| Manifeste `index.json`, `run.json`, `sources.json` (Domänen, Lizenzen, Sperren, Terminänderungen) | Laufwahl, Attribution | ja, vollständig | — | je Bau | — | zeitlos / je Lauf | ✓ |
| Cube-Leser in web (`src/point/client`, `resolve.ts`) | Anbindung | vorhanden, `calibrated: false`, **kein Aufrufer** in `src/pointForecast/` (0 Importe) | — | — | — | — | ✗ (Verdrahtung) |

---

## §3 Tabelle B — Lücken und Probleme, priorisiert

Priorität: **P1** blockiert die Implementierung oder macht ihre Aussagen unwahr · **P2** nötig für die
Genauigkeitsziele · **P3** Verbesserung / Hygiene.

| Daten | Problem / Lücke | Warum benötigt | Quelle/API | Empfohlene Umsetzung | Priorität |
|---|---|---|---|---|---|
| Verifikationsarchiv | `buscosun-archiv` leer; ohne es sind Σ, σ_sys, c_spread, L_d/L_h, A, A_UHI, f_rad, φ nicht messbar — jeder Tag ohne Sammler ist ein verlorener Datenpunkt | PAP 2/3/5/6 sind sonst Setzungen, keine Kalibrierung | eigener Sammler (Plan `audit/punktarchiv.md` PA1) | PA1 umsetzen: täglicher Sammler-Slot, punktweise Vorhersage + Messwahrheit; erster Push = Jans Gate | **P1** |
| Cube/Stationen ↔ buscosun Fusion | `src/pointForecast/` liest den Cube nicht; Live-Abrufe bleiben (AROME nwp-v1 endet 2026-11-01) | ohne Anbindung nutzt der Algorithmus keine der Daten aus Tabelle A | `src/point/client` (vorhanden) | Leser hinter Flag in `getPointForecast` einhängen; AROME-Pfad durch Cube-t1 (C-LAEF) ersetzen **vor** 2026-11-01; Gleichheitsprobe wie V-PA-1 | **P1** |
| t2-Cron / MOSMIX-L | `50 3,9,15,21` liegt ≈ 26 min vor der MOSMIX-L-Bereitstellung (Lauf + 72–76 min) ⇒ Stationsprodukt ist immer der Vorlauf (`ageH 7,06`); ICON-EU-Rand nur ≈ 8 min (Bereitstellung +3,53–3,70 h, gemessen) | Stationsquelle und tragende t2-Quelle sollen den aktuellen Lauf tragen | `point.yml` | Slot auf `30 4,10,16,22` (Begründung §5.8); Verifier `verify:point-data` (Regeln A–D) neu rechnen; **STOPP & FRAGEN** | **P1** |
| t3-Retention | Retention 24 h + `minRuns 2` hält um 16:56 UTC **einen** t3-Lauf (2026091400) — 12z-Vorlauf ist gelöscht; scheitert der 21:55-Bau, gibt es bis 09:55 keinen Rückfall | Verfügbarkeit 126–336 h | `retentionByTier` | `t3: 36` (oder `minRuns` je Stufe durchsetzen); Kosten +1,5 MB | **P1** |
| `imperv`, `d0` | fehlen ganz (E-13); PAP 5 Stadt-/Windkorrektur läuft sonst mit imperv = 0 | UHI-Amplitude, Verdrängungshöhe | GHS-BUILT-S 10 m / GHS-BUILT-H (JRC, frei, keine NC-Klausel) | einmaliger Bau `point/static/urban/v1/` im Chunk-Raster t1 (u8), Hash im Index; Client liest wie hmodel | **P2** |
| Profil-/Quantilfelder > 48 h | t2/t3 `profile: null`, `quantiles: null`; PAP 4 muss dort auf 925/850/700 zurückfallen, in t3 auf **850 allein** | Inversionsbehandlung und Band 51–336 h | ICON-EU Modelllevel (offen: Verfügbarkeit), IFS 925/700 in t3 (E-E-4) | 700 hPa in t3 aufnehmen (E-E-4); Profil aus 925/850 ableiten als **markierter** Ersatz; keine ICON-EU-Modelllevel ohne Kostenmessung | **P2** |
| σ_ens in t3 | nur t2m aus ICON-EPS global (144/168 h) + IFS-ENS; übrige Größen ohne σ_ens ⇒ PAP-6-Zweig „σ_div allein" | Unsicherheit 126–336 h | IFS-ENS (vorhanden, 51 Member) | `ensemble.vars` in t3 auf u10/v10/precip/clct erweitern (Kosten offen) | **P2** |
| σ_sys / Gewichte | `fusion.weights = equal`, `σ_sys` fehlt; Σ ungemessen | PAP 2 Minimum-Varianz, PAP 6 Sockel | Archiv | folgt aus P1 Archiv; bis dahin Literatur-Sockel **als Setzung markiert** in `calib.json` (`provenance: "set"`) | **P2** |
| Kalibrierung `calib.json` | alle Werte `null`; Client `calibrated: false` | jede Korrektur ohne Wert läuft mit Startwerten | Archiv + Stationspaare | nach ≥ 30 Archiv-Tagen erstmals füllen; `updatedAt`, `provenance` je Wert | **P2** |
| Modellhöhe C-LAEF / AICON | `hmodel.absent`: keine Orographie ⇒ PAP 4 für diese Quellen ohne h_mod | Höhenkorrektur | GeoSphere (fehlt), DWD (AICON ohne invariant) | C-LAEF: Höhe aus `msl`/`ps`-Paar nicht möglich; Annahme ICON-global-Höhe für AICON **kennzeichnen** (V-PD-57 analog) | **P3** |
| Achsenlücke 121–125 h, > 328 h | t2/t3 klaffen 6 h; Naht beweglich (V-PD-55) | lückenlose 0–336 h | Achsen-Definition | Client interpoliert 120→126 h linear und **nennt es**; oder t3 ab 123 h | **P3** |
| Nowcast Byte 0 | „kein Regen" = „keine Abdeckung"; Client muss Domäne (`sources.json` domain ∩ clip) prüfen | 0–3 h RR korrekt | Spiegel | im Cube-Leser Domänenprüfung erzwingen (bereits im Index dokumentiert) | **P3** |
| UV-Index | nicht im Cube; Live-Abruf DWD | Zielgröße UV | DWD UV-Vorhersage (frei) | offen, ob in den Cube (1×/Tag, 1 Ebene) oder live bleiben | **P3** |
| Publish-Robustheit | V-BW-58: `publish-repack` pusht einmal ohne Retry; Radar-Spiegel pusht alle 1–2 min ins selbe Repo | Verfügbarkeit aller Produkte | Workflows | Commit-back-Loop (T2c) — Kartenlinie, nicht Punktlinie, aber dasselbe Repo | **P3** (bekannt) |

---

## §4 Fragen 1–4: Bedarf, Vorhandensein, Verwendung, Fehlendes

**1. Welche Daten braucht der Algorithmus?** — §1. Zusammengefasst: je Hz und Quelle acht Skalarfelder plus
Wolkenschichten und Schneefallgrenze; je Quelle Modellhöhe; je Hz Profilfelder (oder Druckflächen); Unsicherheit
(σ_div, σ_ens, Quantile); Beobachtung t0 und 6 h Historie; Statik (DEM-Ableitungen, Landbedeckung, imperv, d0);
Kalibrierung; Nowcast 0–3 h; Archiv für die Kalibrierung.

**2. Was liegt in buscosun-data?** — Belegt (index.json Schema 5, 57 Ebenen, drei Stufen, 22 Quellen in sources.json):
alle Vorhersagefelder inkl. σ, Quantile (t1), Profil (t1), Druckflächen, hModEff, srcCount/ensCount; Stationsprodukt
MOSMIX-L; Nowcast-Spiegel RV/INCA/RZC; Manifeste mit Domänen, Lizenzen (alle CC BY 4.0 / GeoNutzV / Public Domain —
keine NC-Klausel), Sperrliste (Open-Meteo frei, Netatmo, PAMORE, CORINE direkt, E1, Blitz kommerziell) und
Terminänderungen (AROME nwp-v1 aus am 2026-11-01; dynamical.org 2026-09-30; CDSE-DEM eingeschränkt). **Nicht**
darin: Beobachtungen, Gelände, imperv/d0, Kalibrierwerte, Historie.

**3. Was wird in buscosun-web verwendet bzw. abgerufen?** — Belegt an `src/pointForecast/pointForecast.ts`
(`getPointForecast`): BrightSky-Punktvorhersage (DE), DWD-UV, INCA-Punkt (`nowcast-v1-15min-1km`), AROME-Punkt
(`nwp-v1-1h-2500m`), nächste Stationen + 6 h Historie (BrightSky/TAWES/SMN), GFS-Schwanz (`/_gfs`-Proxy → NOAA S3,
**nicht** buscosun-data), Radar-Nowcast über `createRadarNowcastSampler` → `sources/radolan|geosphereIncaGrid|meteoSwissRadar`
→ **liest `radar/img/v1` aus buscosun-data** (mit Rückfall auf die Behörden-APIs, wenn der CDN-Pfad abgeschaltet ist).
`fetchOpenMeteoPoint` existiert in `sampleSources.ts`, wird in `pointForecast.ts` **nicht** aufgerufen (nur ein
Typ-Import) — konsistent mit der Sperre `open_meteo_free`. **Korrektur** meiner Aussage vom 2026-09-13: „buscosun Fusion
liest nichts aus buscosun-data" stimmt nur für Cube und Stationen; der Nowcast-Spiegel wird gelesen.
Der Cube-Leser `src/point/client` (Store, `planPointSources`, `SELECTION {stationMaxKm 15, stationMaxDElevM 100,
calibrated: false}`) ist fertig und getestet (`verify:point-client`), hat aber **keinen Aufrufer** in
`src/pointForecast/` — 0 Importe aus `src/point`. `fusion/fuse.ts` (Minimum-Varianz mit Korrelation) macht 0 fetch-Aufrufe
und steht hinter `distribution: true`, ohne Konsumenten.

**4. Was fehlt komplett?** — imperv/d0; Archiv; Kalibrierwerte; Anbindung Cube → Fusion; Profil-/Quantilfelder > 48 h;
CH-Nowcast-Extrapolation (extern blockiert); t3-Rückfall-Lauf (Retention). Nicht fehlend, aber ungenutzt: Cube, Stationen,
Client-Leser.

---

## §5 Fragen 5–9: Eignung, Zusatzquellen, Struktur, Takt, Historie

### 5.5 Qualität, Aktualität, Auflösung

| Aspekt | Befund | Beleg / Annahme |
|---|---|---|
| Räumliche Auflösung | t1 0,05° (≈ 3,7 × 5,5 km) ist **gröber** als ICON-D2 (2,2 km) und ICON-CH1 (1 km); t2 0,1°, t3 0,25° passen zu ICON-EU (6,5 km) / IFS (9 km). Für PAP 1/3 ist die Zellauflösung nicht die Genauigkeitsgrenze — die Korrekturen PAP 3–5 wirken unterhalb der Zelle; die 0,05°-Abtastung verliert aber die Nahtlinie der Modellorographie (Nahtsprung t1→t2 −0,60 K bei Δh_mod +17 m gemessen). | belegt (index tiers, CLAUDE.md-Messung); Folgerung = Einschätzung |
| Zeitliche Auflösung | t1 stündlich ✓; t2 3 h, t3 6 h entsprechen den Quellen; Tagesgang-Korrekturen (PAP 5 Strahlung) brauchen in t3 Interpolation über 6 h — akzeptabel für 126–336 h. | belegt |
| Aktualität t1 | ICON-D2 Lauf + 1,67 h beim Bau; Alter des Mittels 0–6 h je Quelle; „Alter" hat keine einzelne Antwort (bis zu fünf Läufe in einer Stunde). | belegt (Manifest `runAt` je Quelle) |
| Aktualität t2 | ICON-EU aktuell, IFS/AIFS-Diversität aus −6 h; MOSMIX-L 7 h alt (V-PD-28). | belegt |
| Aktualität t3 | IFS oper 00z um 09:55 = 9,9 h alt beim Bau; bis zum nächsten Bau 21,9 h. Vorziehen auf ≈ 08:35 spart 1,3 h — erst nach Messung der 12z-Bereitstellung (offen). | belegt (00z), 12z offen |
| Quellenunabhängigkeit | ICON-D2-EPS / ICON-EU-EPS / C-LAEF-EPS / IFS-ENS tragen bewusst **nicht** zum Mittel bei (derselbe Lauf wie der deterministische); AIFS-ENS nur Kontrolllauf (V-PD-9). Korrekt für σ_div. | belegt (Manifest `ensemble.note`, `skipped`) |
| Mittel vs. Band | Mittel liegt in 10–42 % der Stunden außerhalb q10/q90 (t2m 38 %) — erklärbar (Band = eine Quelle, älterer Lauf), aber ohne Hinweis irreführend (V-PD-54). | CLAUDE.md-Messung, nicht neu geprüft |
| Nowcast | RV/INCA/RZC mit vMax 20 (Sättigung ≥ 19,96 mm/h), Byte-0-Zweideutigkeit, `validAtMs` = Laufzeit in allen RV-Frames (V-PD-56). Nutzbar, wenn der Leser Domäne + `leadMinutes` prüft. | belegt (index nowcast) |
| Kodierung | int16 skaliert + Sentinel, Schema versioniert, Commit-adressiert über jsDelivr (≤ 1,1 min Ausbreitung) — für < 300 ms Lesekosten ≈ 1,1 MiB je Punkt (gemessen). Für 336 h × alle Ebenen an einem Punkt sind das drei Chunk-Läufe (t1/t2/t3); Annahme: mit HTTP-Cache erreichbar, **nicht gemessen im Browser**. | belegt / Annahme |
| Lizenz | alle genutzten Quellen CC BY 4.0, GeoNutzV oder Public Domain; Attribution je Quelle im Manifest. | belegt (sources.json) |

**Einschätzung:** Für PAP 1, 3, 4 (t1) und 6 (t1) sind Qualität, Aktualität und Auflösung ausreichend. Für PAP 4 in
t2/t3 nur ersatzweise (Druckflächen). Für PAP 2 (echte Fusion) und PAP 5 (Stadt) noch nicht — aus Kalibrier-, nicht aus
Datengründen.

### 5.6 Zusätzliche Quellen / APIs

| Kandidat | Wofür | Lizenz / Zugang | Empfehlung |
|---|---|---|---|
| **GHS-BUILT-S (Versiegelung 10 m) + GHS-BUILT-H (Bauhöhe)** | imperv, d0 (PAP 5) | JRC, frei, CC BY 4.0 — Annahme: Zugriff ohne Schlüssel über JRC-Download (nicht geprüft) | **ja**, einmaliger statischer Bau |
| Copernicus DEM 30 m (AWS-Bucket) | präzisere TPI/SVF als Terrarium | frei; CDSE-View eingeschränkt (sources.json scheduledChanges) | optional; Terrarium reicht laut Jans Entscheidung |
| MeteoSchweiz E4 Local Forecast (~6 000 Punkte, 216 h) | Benchmark CH, Stationsersatz | STAC `ch.meteoschweiz.ogd-local-forecasting` — im Katalog gesehen, Produktgleichheit **nicht geprüft** | prüfen; nur als Verifikations-Benchmark, nicht als Quelle |
| ICON-EU Modelllevel | Profilfelder t2 | DWD frei; Kosten offen (t2 ist heute 243 MiB/Zyklus) | erst Kosten messen |
| IFS 925/700 hPa in t3 | Druckflächen t3 | ECMWF frei | ja (E-E-4), klein |
| KENDA-CH1 Analyse | Stunde 0 CH (Anker-Ersatz für dünnes SMN) | MeteoSchweiz frei | später; heute `pending` |
| MeteoSchweiz Einzelabfrage-API (angekündigt 2026-12-31) | CH-Nowcast | offen | beobachten |
| Netatmo, Open-Meteo frei, PAMORE, CORINE direkt, Blitz kommerziell | — | **gesperrt** (Schlüssel/NC/entgeltlich) | nein |

Keine weitere Quelle ist **nötig**, um den Algorithmus zu implementieren; nötig sind GHS-BUILT und das Archiv.

### 5.7 Speicherstruktur — Bewertung und Vorschlag

Bestehend (belegt): `point/index.json` (zeitlos, `latestByTier`, `timeless`-Liste), `point/<YYYYMMDDHH>/run.json` +
`t1|t2|t3/<cy>_<cx>.bin`, `point/stations/<run>/`, `point/static/hmodel/v1/`, `point/sources.json`, `point/calib.json`,
`radar/img/v1/<quelle>/<slot>/`. Ein Lauf-Verzeichnis kann mehrere Stufen tragen (`2026091412` = t1+t2).

**Bewertung:** Die Struktur passt zum Algorithmus — Stufe ⇔ Horizont, Chunk ⇔ Punktabfrage, zeitlose Produkte getrennt
von Läufen, Kalibrierung als eigene Datei mit `provenance` je Wert. Zwei Schwächen: (a) das Stationsprodukt hat eine
eigene Achse (stündlich bis 247 h) — der Client muss zwei Achsen mischen (dokumentiert); (b) alle Vorhersagen sind
**Mittelwerte** — Werte je Modell gibt es nicht (E-D-1), der Browser kann Σ-gewichtete Fusion also nicht selbst
rechnen; sie muss im Producer geschehen, sobald Σ vorliegt. Das ist mit dem < 300-ms-Ziel vereinbar und richtig.

Vorschlag für die fehlenden Teile, ohne Bruch der Struktur:

```
point/static/urban/v1/            imperv (u8 %), d0 (u8 dm) im t1-Chunk-Raster, static.json mit Hash + Quelle/Lizenz
point/calib.json                  bleibt; Werte mit provenance "measured"|"set"|"literature", updatedAt, n (Stichprobe)
buscosun-archiv/<YYYY-MM-DD>/     Sammler-Slots punktweise (Plan PA1) — NICHT in buscosun-data (Force-Push, 24 h)
```

Nicht vorgeschlagen: Beobachtungen im Daten-Repo (altern schneller als der Spiegel-Takt), Gelände im Daten-Repo
(Jans Entscheidung), Werte je Modell im Cube (Kosten ×n, E-D-1 nur, wenn die Browser-Fusion je gewollt ist).

### 5.8 Update-Takt je Quelle — mit Begründung

Gemessene Bereitstellung (point.yml-Kopf, 2026-09-09, vier Läufe; MOSMIX aus CLAUDE.md §-Messung):
ICON-D2 +1,35 h · ICON-D2-EPS +2,17 h · C-LAEF ≈ +4,9 h · ICON-EU +3,53–3,70 h · ICON global ≈ +3,5 h · IFS oper 00z +7,57 h,
06z/18z (scda) +6,45 h, **12z nicht gemessen** · MOSMIX-L +72–76 min · MOSMIX-S +40 min · ICON-CH1/CH2-EPS **nicht gemessen**.
Kartenlinie (`build.yml`) force-pusht um :20 der Stunden 0/3/6/… und :30 der Stunden 2/5/8/… — jeder Punkt-Job muss
dazwischen fertig sein (Regeln A–D im Verifier).

| Quelle | Modelltakt | Aktueller Abhol-Takt | Empfohlener Takt | Begründung |
|---|---|---|---|---|
| ICON-D2 (t1 tragend) | 8×/Tag | 8×/Tag, Lauf + 1,67 h | **beibehalten** | Bereitstellung +1,35 h ± 0,01 h ⇒ 18 min Rand; Bau 10,0 min gemessen (`timing.totalMs`); Rückfall auf −3 h dokumentiert. Häufiger geht nicht (Modelltakt), später kostet Aktualität. |
| ICON-D2-EPS, ICON-CH1-EPS, C-LAEF | 8×/Tag | im t1-Job, aus −3 h (EPS +2,17 h, C-LAEF +4,9 h) | **beibehalten** | Ein zweiter t1-Slot je Zyklus (z. B. :55 für EPS) verletzte Regel D/Concurrency und brächte nur σ_ens 0,8 h früher. Akzeptierter Vorlauf, im Manifest je Quelle als `runAt` sichtbar. |
| C-LAEF-EPS | 8×/Tag | aus −6 h | beibehalten; **Quelle vor 2026-11-01 auf nwp-v2 migrieren** | Terminänderung in sources.json; betrifft `claef` im Cube und den AROME-Live-Pfad in web. |
| ICON-EU / ICON-EU-EPS / ICON-CH2-EPS (t2) | 120 h nur 00/06/12/18z | 4×/Tag `50 3,9,15,21` = Lauf + 3,83 h | **`30 4,10,16,22`** = Lauf + 4,5 h | Rand zu ICON-EU wächst von 8 auf 48 min (Bereitstellung schwankt 3,53–3,70 h — 8 min sind kein Rand); Abstand zum nächsten Kartenlinien-Push (05:30) = 60 min ⇒ Regel A verlangt JOB_MAX_MIN(t2) ≤ 40; gemessen t2-Bau 10,0 min + Stationsbau (Dauer **offen**) — plausibel, vom Verifier zu bestätigen. Preis: 40 min ältere t2-Daten. |
| MOSMIX-L (Stationen) | 4×/Tag 03/09/15/21z | im t2-Job, 26 min **vor** Bereitstellung ⇒ Vorlauf (`ageH 7,06`) | **mit t2 auf :30** = Lauf + 90 min | Bereitstellung +72–76 min ⇒ 14–18 min Rand. Behebt V-PD-28 ohne zweiten Job. Alternative eigener Slot `35 4,10,16,22` verletzt Regel D (dieselbe Minute) — nur mit t2 zusammen. |
| MOSMIX-S | 24×/Tag | nicht abgeholt | **nicht aufnehmen** (Annahme) | 24 KMZ/Tag mit allen Stationen; Nutzen gegenüber ICON-D2 + Anker nicht belegt; Volumen ≈ 24 × 7 MB. Erst, wenn das Archiv zeigt, dass MOSMIX-S 0–24 h besser ist. |
| ICON global / ICON-EPS global / AICON | 4×/Tag | in t2 (Diversität) und t3 | beibehalten | Bereitstellung ≈ +3,5 h; in t2 auf :30 noch bequemer. |
| IFS HRES / IFS-ENS / AIFS (t3) | 4×/Tag, 360 h nur 00/12z | 2×/Tag `55 9,21` = Lauf + 9,9 h | **2×/Tag beibehalten**; Vorziehen auf ≈ `35 8,20` **erst nach Messung** der 12z-Bereitstellung | 00z +7,57 h ⇒ 2,3 h Rand heute, davon 1,3 h einsparbar; 12z **offen**; im 08:30–09:20-Fenster müsste t3 (4,7 min gemessen) mit `timeout ≤ 45` laufen. 06z/18z (scda, 144 h) reichen nicht bis 336 h — kein Gewinn durch 4×/Tag. |
| Nowcast RV / INCA / RZC | 5 / 15 / 5 min | Spiegel alle 1–2 min, 12 Slots | **beibehalten** | Live-Spiegel = Quellentakt; mehr Slots nützen dem Algorithmus nichts (0–3 h). Retention ist Live-Fenster, keine Archivierung. |
| Beobachtungen (BrightSky/TAWES/SMN) | 10 min – 1 h | live je Abfrage | **live belassen** | Ein Spiegel könnte höchstens so frisch sein wie sein Cron (≥ 1 h auf Actions); die Quelle selbst ist frischer. 6 h Historie kommt aus denselben APIs. |
| hmodel (statisch) | bei Modell-Upgrade | Hash je Bau | beibehalten | `changed: true` in t2/t3 am 2026-09-14 zeigt, dass der Vergleich arbeitet (Ursache offen: Upgrade oder erste Ablage). |
| GHS-BUILT (neu) | jährlich (Release) | — | einmalig, jährlich prüfen | statisch |
| calib.json | — | nie (alle null) | nach ≥ 30 Archiv-Tagen erstmals, dann **monatlich**, saisonal geprüft | Σ und A hängen von Jahreszeit ab; monatlich ist der kleinste sinnvolle Schritt bei täglichen Slots. |
| Archiv-Sammler (neu) | — | — | **täglich, fester Slot** (Plan PA1) | Punktweise Samples + Messwahrheit; Rückfüllung unmöglich — jeder Tag zählt. |

### 5.9 Historie vs. 24-h-Fenster

**Was der Algorithmus im Betrieb braucht:** nur den jüngsten Lauf je Stufe **plus einen Rückfall-Lauf**, und für den
Anker 6 h Beobachtungshistorie (live). Er braucht **keine** alten Cube-Läufe — mit einer Ausnahme: die **abgelaufenen
Schritte** des aktuellen t1-Laufs (Hz < jetzt) sind nötig, weil der Anker Beobachtung und Modell zur selben
Gültigzeit vergleicht (t0 − 6 h … t0). Retention t1 = 9 h ist dafür exakt die Untergrenze (6 h Historie + 3 h Takt):
um 17:30 UTC liefert der 09z-Lauf die Modellwerte für 11–17 UTC. **Abgelaufene Schritte dürfen nicht beschnitten
werden** — heute werden sie es nicht (49 Schritte je Lauf, belegt).

**Retention je Produkt:**

| Produkt | heute | Bedarf | Empfehlung |
|---|---|---|---|
| t1 | 9 h (3 Läufe) | jüngster + Rückfall + 6 h Anker | **9 h beibehalten** (Untergrenze; 12 h wären +93 MB Sicherheitsmarge gegen einen verpassten Bau) |
| t2 | 24 h (4 Läufe) | jüngster + Rückfall | 24 h ok (12 h reichten; Kosten 8,8 MB/Lauf sind unerheblich) |
| t3 | 24 h — **hält nur 1 Lauf** (belegt 16:56 UTC) | jüngster + Rückfall | **36 h** (oder `minRuns` je Stufe wirksam machen) |
| Stationen | 3 Läufe (≈ 18 h) | jüngster + Rückfall | beibehalten |
| Nowcast | 12 Slots | Live | beibehalten |
| hmodel / calib / sources | zeitlos | — | beibehalten |

**Historisch speichern — ja, aber nicht hier.** Für Σ, σ_sys, c_spread, L_d/L_h, A, A_UHI, f_rad, φ, Δz_min braucht
die Kalibrierung Wochen bis Monate eigener Vorhersagen **gegen Messwahrheit, punktweise**, nicht die Gitter. Das
gehört in `buscosun-archiv` (append-only, Plan PA1: Samples je Punkt und Lauf, ≈ MB/Tag, nicht GB), nicht in
`buscosun-data` (Force-Push-Reset, 24-h-Fenster, ≈ 0,8 GB/Tag Zufluss allein im `point/`-Zweig: 8 × 93 + 4 × 8,8 +
2 × 1,5 + 4 × 7,2 MB; Radar-Spiegel zusätzlich, Volumen offen). Ergebnis: **buscosun-data bleibt 24-h-Fenster
(t3: 36 h), Historie ausschließlich im Archiv.**

---

## §6 Bereitschaftsurteil und Reihenfolge

**buscosun-data:** Datenbereit für PAP 1/3/4/6 (t1) — ja. Für 51–336 h mit Einschränkungen (Druckflächen statt Profil,
σ_ens dünn in t3). Struktur, Formate, Lizenzen, Manifeste: bereit. Offen: t3-Retention, t2-Slot, imperv/d0, Archiv.

**buscosun-web:** Leser, Kalibrierstruktur, Fusionskern, Anker-Logik vorhanden — **nichts davon ist verdrahtet.**
buscosun Fusion rechnet heute mit Live-APIs, von denen eine (AROME nwp-v1) am 2026-11-01 endet.

**Gesamt: nicht bereit.** Nicht, weil Daten fehlen, sondern weil (1) der Algorithmus die Daten nicht liest und
(2) seine Genauigkeitsversprechen ohne Archiv weder eingelöst noch geprüft werden können.

Priorisierte Reihenfolge (jede Zeile: was, warum zuerst, Gate):

1. **Archiv-Sammler starten (PA1)** — jeder Tag ohne Archiv ist unwiederbringlich; nichts anderes hier hängt am
   Cube-Leser. Gate: Sammler-Cron + erster Push = Jan.
2. **t2-Slot auf `30 4,10,16,22` und t3-Retention 36 h** — zwei Zeilen in `point.yml` / Producer-Konfiguration, behebt
   V-PD-28 und den fehlenden t3-Rückfall; Verifier neu laufen lassen. Gate: Cron/Workflow = **STOPP & FRAGEN**, Kopie
   ins Daten-Repo = Jan.
3. **Cube-Leser hinter Flag in `getPointForecast` einhängen** und den AROME-Pfad durch Cube-t1 ersetzen — Frist
   2026-11-01; Gleichheitsprobe an 10 Punkten gegen den Live-Pfad (wie V-PA-1). Gate: Fusion-Engine = STOPP & FRAGEN.
4. **`point/static/urban/v1/` (imperv, d0) bauen** — ohne es läuft PAP 5 mit imperv = 0; einmalig, statisch.
5. **700 hPa in t3 (E-E-4), σ_ens-Größen in t3 erweitern** — kleine Producer-Änderungen, Kosten messen.
6. **Kalibrierung erstmals füllen** — frühestens 30 Tage nach Punkt 1; bis dahin Literatur-Sockel **als `set`
   markiert**, nie als gemessen.
7. Hygiene: Achsenlücke 121–125 h benennen, V-PD-54-Hinweis im Client, V-BW-58 Commit-back-Loop, 12z-IFS-Bereitstellung
   messen (dann t3-Slot prüfen).

---

## §7 Offene Punkte und Annahmen (getrennt von Belegen)

**Offen (nicht aus den gelesenen Dateien beantwortbar):**
- Bereitstellungszeiten IFS 12z, ICON-CH1/CH2-EPS, MOSMIX-L (nur CLAUDE.md-Messung, nicht neu gemessen).
- Dauer des Stationsbaus im t2-Job (`build-stations.mjs`) — bestimmt, ob `30 4,10,16,22` Regel A erfüllt.
- Ob INCA-T2m im Spiegel liegt (sources.json nennt `t2m`, radarImg-Layout nur RR).
- Ob `minRuns 2` je Stufe gemeint ist — der Index widerspricht der Erwartung (1 t3-Lauf).
- Ursache von `hmodel.changed: true` in t2/t3 am 2026-09-14 (Modell-Upgrade oder erste Ablage).
- Lesekosten der Punktabfrage im Browser über alle drei Stufen (< 300 ms) — nur Node-Messung 1,1 MiB.
- Verfügbarkeit ICON-EU-Modelllevel für Profilfelder in t2 und deren Kosten.
- Radar-Spiegel-Volumen je Tag.

**Annahmen (so gekennzeichnet in den Tabellen):**
- GHS-BUILT-S/H ist ohne Schlüssel und ohne NC-Klausel zugänglich (Lizenz CC BY 4.0 — Zugriffspfad nicht geprüft).
- MOSMIX-S bringt gegenüber ICON-D2 + Anker in 0–24 h keinen belegten Gewinn.
- σ_ens wird im Producer auf die Stufenachse interpoliert (Manifest nennt nur die Ensemble-Stunden).
- Die t2-Verschiebung um 40 min kostet keine Genauigkeit, die den MOSMIX-L-Gewinn aufwöge (6 h jüngere Stationsvorhersage).

**Korrekturen früherer Aussagen:** `audit/punktdaten-restbedarf.md` Zeile 12 („Schema 5 nicht veröffentlicht") und
Reihenfolgepunkt 2 („PD-E committen") sind **überholt** — Schema 5 ist seit 2026-09-13 veröffentlicht; und „buscosun
Fusion liest nichts aus buscosun-data" gilt nur für Cube und Stationen, nicht für den Nowcast-Spiegel (§4.3).
