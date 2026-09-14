# Restbedarf an Daten vor der Implementierung (Phase PD, Anhang)

> **Status: Bestandsaufnahme, 2026-09-13. Kein Code, keine Änderung.**
> Frage: Welche **Daten** fehlen noch, bevor `buscosun Fusion` auf den Cube umgestellt wird —
> und wo gehören sie in die bestehende Struktur.
> Bezug: `ABLAUFPLAENE.md` (PAP 1–6), `QUELLENMATRIX.md`, `audit/punktdaten-versorgung.md`,
> `src/pointForecast/types.ts` (`PointSourceSample`), `src/point/calibration.ts`.

---

## §1 Die Tabelle

Legende Spalte **Ist**: ✅ vollständig · 🟡 vorhanden mit Einschränkung · ❌ fehlt ganz

### 1.1 Vorhersagegrößen — der Cube trägt sie fast alle

| # | Größe | Braucht | Ist | Was genau fehlt |
|---|---|---|---|---|
| 1 | `t2m` + σ + q10/q90 | PAP 4, 6 | ✅ | — |
| 2 | `td2m` | PAP 6 (Taupunkt statt RH) | ✅ | — |
| 3 | `u10`, `v10` | PAP 5 (f_rad, Wind) | ✅ | — |
| 4 | `gust` | PAP 6 (Böen-Bedingung) | 🟡 | MOSMIX verletzt `v_max ≥ |v10|` in 97 Fällen — Producer klammert, Quelle bleibt inkonsistent |
| 5 | `precip` | PAP 6 | 🟡 | `precip_sd_ens` bleibt MISSING ab 78 h (EU-EPS 6-stdl.) bzw. 132 h (EPS global 12-stdl.) |
| 6 | `clct`, `clcl`, `clcm`, `clch` | PAP 5 (f_rad), PAP 6 | ✅ | — |
| 7 | `ps` | PAP 6 | 🟡 | MISSING bei C-LAEF (nur `msl`) und MOSMIX (`PPPP` ist reduziert, nicht Stationsdruck) |
| 8 | `snowlmt` | PAP 6 | 🟡 | bitmap-maskiert bei einer Quelle (270 559 von 283 876 Zellen MISSING) |
| 9 | **`uvIndex`** | `PointSourceSample.uvIndex` | ❌ | **Nicht im Cube.** Heute `fetchDwdUvPoint` direkt vom DWD, DE-only |
| 10 | `gammaEff`, `zBase`, `zInv`, `dTInv` | **PAP 4, der ganze Kern** | ✅ | — |
| 11 | `hModEff` | PAP 4 (`h_true − h_mod_eff`) | 🟡 | **V-PD-57: in t3 steht ICON globals Höhe, auch jenseits 180 h, wo nur IFS/AIFS tragen** |
| 12 | `t925/850/700`, `rh925/850/700` | PAP 2 (Inversionsdetektion) | 🟡 | **Schema 5 ist nicht veröffentlicht** — am CDN liegt Schema 4 ohne diese sechs Ebenen |
| 13 | 925 hPa über alle Quellen | PAP 2 (Grenzschicht) | 🟡 | **V-PD-58: Schnittmenge leer.** ICON-D2 springt 950 → 850; IFS/AIFS führen kein 950 |
| 14 | `srcCount`, `ensCount` | PAP 6 (σ_div, n_eff) | ✅ | — |

### 1.2 Geländegrößen — am Punkt gerechnet, zwei Lücken

`terrainPoint.ts` rechnet am Punkt statt als Raster (Jans Entscheidung 2026-09-09) — Höhe aus
den Terrarium-Kacheln, Landbedeckung aus `buscosun-worldcover`. Das ist tragfähig und bleibt.

| # | Größe | Braucht | Ist | Was fehlt |
|---|---|---|---|---|
| 15 | `h_true`, Slope, Aspect | PAP 1, 4, 5 | ✅ | aus Terrarium-Kacheln |
| 16 | `TPI` zwei Skalen (500 m / 2 km) | PAP 4 Fall C, PAP 5 | ✅ | Radien sind Entscheidung, kalibrierbar |
| 17 | `SVF` (16 Richtungen) | PAP 5 (Kaltluft, UHI) | ✅ | — |
| 18 | `z0` | PAP 5 (Windkorrektur) | ✅ | WorldCover → Davenport/Wieringa, Literatur |
| 19 | `d_water` | PAP 5 | ✅ | — |
| 20 | **`imperv`** (GHS-BUILT-S) | **PAP 5 Wärmeinsel-Term** | ❌ | **E-13: in keiner Quelle greifbar, die die App hat** |
| 21 | **`d0`** (GHS-BUILT-H) | **PAP 5 Blending-Height, Verdrängungshöhe** | ❌ | dito — ohne sie ist die Windkorrektur in Stadt und Wald nicht rechenbar |
| 22 | **`foehn_lee[8]`, `barrier_h[8]`** | PAP 5 `(1 − foehn_prob)` | ❌ | Lee-Geometrie je Anströmsektor; `Sx`-Gerüst existiert (`SX_OCTANTS`, `SX_RADIUS_M`) |
| 23 | `tpiSigma` je Region | PAP 5 („TPI < −1σ") | ❌ | σ ist Eigenschaft der Region, aus dem Gelände auszuzählen |

### 1.3 Kalibrierung — das Schema steht, die Werte sind alle `null`

`src/point/calibration.ts` ist vorbildlich gebaut: jeder Eintrag trägt `provenance`, und
`null` ist der ehrliche Normalfall. Genau deshalb ist die Bilanz eindeutig.

| # | Größe | PAP | Herkunft heute | Fehlt |
|---|---|---|---|---|
| 24 | **`sigmaSys`** | PAP 6 | `null` | **der Sockel, ohne den p10/p90 erfunden sind** |
| 25 | **`sigmaMatrix` (Σ)** | PAP 2 | `null` | Fusionsgewichte `w = Σ⁻¹1/(1ᵀΣ⁻¹1)` sind ohne ihn nicht bestimmbar |
| 26 | **`cSpread` c(p,f)** | PAP 6 | `null` | **V-A₁ hat Spread/Skill 0,5–0,6 gemessen — Gate verletzt, unkorrigierbar ohne c** |
| 27 | `Ld`, `Lh` | PAP 3 | `null` | Nachbargewichtung |
| 28 | `A` (Kaltluft), `Auhi` | PAP 5 | `null` | „an Stationen gelernt, nicht gesetzt" |
| 29 | `fRad.a`, `vRef`, `epsilon`, `fSaison` | PAP 5 | `null` | der Wetterfaktor selbst |
| 30 | `phi.knots` | PAP 4 | `shape: 'linear'` = `set` | Form der Inversionsfunktion |
| 31 | `dzMin` | PAP 2 | `null` | Mindestmächtigkeit der Inversion |
| 32 | `meltOffset` | PAP 6 | `null` | Schmelzversatz Schneefallgrenze |
| 33 | K-2-Priors (`ACC.precipOcc`, …) | — | ungemessen (V-PV-17) | Niederschlags-Hurdle |

**Gemessen ist: nichts.** `fixed` (trockenadiabatisch, ICAO-Lapse, z0-Tabelle) ist Physik und
Literatur, keine Kalibrierung.

### 1.4 Wahrheit — die Voraussetzung für 1.3

| # | Datensatz | Wofür | Ist | Fehlt |
|---|---|---|---|---|
| 34 | **Stationsmessungen, 6 h Rückblick** | PAP 1 / Stationsanker (`ANCHOR_HISTORY_H = 6`) | ❌ im CDN | heute BrightSky/TAWES/SMN direkt; für „alles aus dem CDN" fehlt die Ablage |
| 35 | **Archiv der eigenen Vorhersagen** | Kalibrierung 24–33, Scorecards | ❌ | `buscosun-archiv` existiert, ist **leer, ohne Sammler-Code** |
| 36 | Beobachtungs-Wahrheit (POI/CDC/TAWES/SMN) | Bewerter | 🟡 | nachholbar, aber nicht gesammelt |

### 1.5 Nowcast

| # | Größe | Ist | Fehlt |
|---|---|---|---|
| 37 | RV / INCA / CombiPrecip 0–3 h | 🟡 | im Spiegel vorhanden, **bewusst nicht im Cube** (Taktbruch: `leadH = 0` ist Laufzeit, der Lauf ist beim Bau 3,4–3,8 h alt). Leser `nowcastPoint.ts` existiert |
| 38 | `validAtMs` je RV-Frame | ❌ | **V-PD-56: jeder Frame trägt dieselbe Zeit** (RADOLAN-Kopfstempel). Kur nur im Leser |

---

## §2 Wie das in die bestehende Struktur passt

Die Struktur ist bereits richtig geschnitten. Jede Lücke hat einen natürlichen Platz —
**kein neues Repo nötig außer dem, das schon existiert und leer ist.**

```
jppetry/buscosun-data
├── index.json, runs/, radar/          Kartenlinie — unberührt
└── point/
    ├── index.json                     Manifest, TIMELESS
    ├── calib.json                     ← 1.3 füllen, Schema steht
    ├── sources.json
    ├── <lauf>/                        Cube, 3 Tiers
    │   └── c/…                        ← uvIndex als 39. Ebene (1.1 #9)
    ├── static/
    │   ├── hmodel/v1/                 Modellhöhe je Quelle (PD-E, lokal)
    │   └── urban/v1/          ← NEU   imperv + d0 (1.2 #20, #21)
    └── obs/<YYYYMMDDHH>/      ← NEU   Stationsmessungen 6–12 h (1.4 #34)

jppetry/buscosun-worldcover            Landbedeckung — unberührt
jppetry/buscosun-archiv         ← LEER Sammler fehlt (1.4 #35)
```

### 2.1 `point/static/urban/v1/` — Versiegelung und Gebäudehöhe

Dasselbe Muster wie `hmodel/`: **BSPC-Container, `TIMELESS_PATHS`, von der 24-h-Regel
ausgenommen.** Zwei `u8`-Ebenen (`imperv` 0–100 %, `bldgH` in Metern), gekachelt wie der Cube.

| Auflösung | Zellen | roh (2 Felder) | gepackt |
|---|---|---|---|
| 100 m (nativ) | 94,5 Mio | 189 MB | ~47 MB |
| **250 m** | **15,1 Mio** | **30 MB** | **~8 MB** |
| 500 m | 3,8 Mio | 7,6 MB | ~2 MB |

**Empfehlung 250 m.** Begründung: Der UHI-Term skaliert ohnehin mit `f_rad` und wird an
Stationen gelernt; eine feinere Auflösung als die Lernstichprobe bringt nichts. 8 MB ist
einmalig — GHS-BUILT ändert sich alle paar Jahre, nicht je Lauf.

Quelle: JRC `jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/`, **CC-BY 4.0, anonym, kein Key** —
erfüllt die Constraints. Ingest einmalig per Skript, kein Cron.

⚠ Ohne #20 und #21 bleibt **PAP 5 unvollständig**: der Wärmeinsel-Term entfällt, und die
Blending-Height-Windkorrektur kann die Verdrängungshöhe nicht setzen — in Wald und Stadtkern
ist die 10-m-Windgeschwindigkeit dann nicht definiert.

### 2.2 `point/obs/<stempel>/` — die 6 Stunden Rückblick

Eigener Pfad, **eigener Takt**: Messungen kommen 10-minütlich, der Cube 3-stündlich. Ein
stündlicher Mini-Job, Retention 12 h.

| Stationen | 6 h × 6 Größen | 12 h |
|---|---|---|
| 250 | 17,6 KB | 35 KB |
| 900 (DE+AT+CH amtlich) | 63 KB | 127 KB |
| 3 071 (MOSMIX-Netz) | 216 KB | 432 KB |

Das ist vernachlässigbar. Format wie der Cube: `int16`, Manifest mit Skalen, Sentinel −32768.

**Die Falle, die hier lauert:** Der Anker braucht Paare *(Messung, Modellwert von damals für
damals)*. Der Modellteil steckt in den **abgelaufenen Schritten** des vorgehaltenen Laufs — die
dürfen beim Aufräumen nicht beschnitten werden. `RETENTION_HOURS_BY_TIER.t1 = 9` deckt die
6 h ab, aber nur solange die Schritte vor „jetzt" mitgehen.

### 2.3 `calib.json` füllen — hängt vollständig an 2.4

Nichts an dieser Datei ist zu bauen; sie ist fertig. Sie füllt sich, sobald der Bewerter
Scorecards liefert. Reihenfolge nach `punktvorhersage-14tage.md`: erst `sigmaSys` und
`cSpread` (die beiden, die p10/p90 tragen), dann `Σ`, dann die PAP-5-Amplituden.

### 2.4 `buscosun-archiv` — der einzige echte Neubau

Plan liegt vollständig in `audit/punktarchiv.md` (PA0–PA7, Datenmodell, Sammler, Gates).
Volumen bei 250 Punkten:

| | pro Slot | pro Tag (4 Slots, 6 Quellen) | 14 Tage | 1 Jahr |
|---|---|---|---|---|
| Punktextraktion | 0,55 MB/Quelle | 13,1 MB | **183 MB** | 4,8 GB |

**183 MB, bis die erste 336-h-Bewertung möglich ist.** Das ist der Preis dafür, dass Punkt 24–33
aufhören, `null` zu sein.

⚠ **Das ist der einzige Posten mit einer Uhr.** Vorhersagen sind nicht nachholbar: MOSMIX 48 h,
ICON-D2 ~24 h, ECMWF 4 Tage. Jeder Tag ohne Sammler ist ein Tag, der für die Kalibrierung
dauerhaft fehlt — und für eine 336-h-Aussage braucht es 14 Tage Vorlauf, bevor der erste Fall
überhaupt bewertbar ist.

### 2.5 Was **nicht** ins Daten-Repo gehört

- **Gelände** — `terrainPoint.ts` rechnet am Punkt, Höhe aus Terrarium, Landbedeckung aus dem
  WorldCover-Spiegel. Die Entscheidung von 2026-09-09 bleibt richtig: ein zweiter Höhendatensatz
  wäre eine zweite Wahrheit.
- **Nowcast im Cube** — der Taktbruch ist real. Der Leser holt ihn separat aus `radar/`.
- **E4 Local Forecast (CH)** — bleibt Benchmark, nicht Quelle.

---

## §3 Reihenfolge

| # | Was | Warum zuerst | Blockiert |
|---|---|---|---|
| **1** | **`buscosun-archiv` starten** | einziger Posten mit Uhr; braucht den Algorithmus nicht | 24–33, 35, 36 |
| **2** | **PD-E committen** | der Cron baut sonst dauerhaft Schema 4 ohne Druckflächen | 12 |
| **3** | `point/static/urban/` | einmalig, 8 MB, kein Cron | 20, 21 |
| **4** | V-PD-57 (`hModEff` in t3) | trifft den PAP-4-Kernterm im Langfristbereich | 11 |
| **5** | `point/obs/` | klein, aber Voraussetzung für „alles aus dem CDN" | 34 |
| **6** | `uvIndex` als Cube-Ebene | kleinster Posten | 9 |
| **7** | Föhn-Geometrie | `Sx`-Gerüst existiert | 22 |

**Erst danach** die Verdrahtung `pointForecast.ts` ↔ `src/point/client`. Vorher ist sie
verfrüht: Der Algorithmus liefe auf einem Cube ohne Druckflächen (PAP 4 Fall B/C unvollständig),
ohne Wärmeinsel-Term (PAP 5) und mit `null`-Kalibrierung — also mit p10/p90, die PAP 6
ausdrücklich als „erfunden" bezeichnet.

---

## §4 Was nicht fehlt

Damit die Liste nicht den falschen Eindruck macht: **Von 41 ursprünglich benötigten Feldern
trägt der Cube heute den überwiegenden Teil** — alle Zielgrößen außer UV, alle fünf
Profilfelder, σ_div und σ_ens mit gemessenen Werten, q10/q90 mit belegter Ordnung
(347 040 Zellen, 100,00 %), 18 Quellen über drei Tiers bis 336 h.

Die Verortung ist am echten Datum belegt und bestätigt nebenbei den Algorithmus:
`hModEff` Zermatt **+718 m**, Zugspitze **−938 m** — genau das `h_true − h_mod_eff`,
das PAP 4 korrigiert.

Was fehlt, sind nicht die Wetterdaten. Es sind **die zwei statischen Raster für PAP 5**
und **die Wahrheit, aus der die Kalibrierung fällt**.
