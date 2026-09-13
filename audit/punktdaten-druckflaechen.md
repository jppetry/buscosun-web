# PD-E — Druckflächen im Cube und `h_model` je Quelle

> **Auftrag (Jan, 2026-09-13), zwei Posten, beide von ihm als „niedrig" eingeschätzt:**
>
> 1. **Vertikalprofil** — „Zwei bis drei Druckflächen (925/850/700 hPa, T + optional RH) als eigene
>    Ebenen im BSPC-Container mitziehen — ICON-D2/EU/global und IFS liefern sie alle, der Ingest in
>    point.yml existiert bereits, es ist nur eine erweiterte Parameterliste. Nur in t1 und t2 nötig,
>    in t3 reicht 850 hPa."
> 2. **`h_model` je Quelle** — „HSURF ist ein statisches Feld — einmal je Quelle und Stufe als eigene
>    `.bin` neben dem Cube ablegen, SHA-gepinnt wie `buscosun-worldcover`, nicht pro Lauf neu
>    schreiben."
>
> Diagnose-First: dieses Dokument steht **vor** dem Code. Alle Zahlen sind am 2026-09-13 am echten
> Server gemessen, nicht aus Dokumentation übernommen.

---

## §1 Die beiden Annahmen im Auftrag — was die Messung sagt

Jan hat zwei Verfügbarkeitsaussagen gemacht. Eine hält, eine nicht.

### §1.1 ⚠ „ICON-D2/EU/global und IFS liefern sie alle" — für **925 hPa nicht**

Am Verzeichnis bzw. am `.index` ausgezählt (Lauf 2026091300, `t` bzw. `relhum`):

| Quelle | veröffentlichte Druckflächen (hPa) | 925 | 850 | 700 |
|---|---|:--:|:--:|:--:|
| ICON-D2 | 200 250 300 400 500 600 700 850 **950 975** 1000 | **✗** | ✓ | ✓ |
| ICON-EU | 50 70 100 150 200 250 300 400 500 600 700 775 800 825 850 875 900 **925 950** 1000 | ✓ | ✓ | ✓ |
| ICON global | 30 50 70 100 150 200 250 300 400 500 600 700 800 850 900 **925 950** 1000 | ✓ | ✓ | ✓ |
| IFS HRES | 10 50 100 150 200 250 300 400 500 600 700 850 **925** 1000 | ✓ | ✓ | ✓ |
| AIFS Single | 10 50 100 150 200 250 300 400 500 600 700 850 **925** 1000 | ✓ | ✓ | ✓ |

**ICON-D2 führt kein 925 hPa** — es springt von 950 auf 850. Und umgekehrt: **IFS und AIFS führen kein
950 hPa**. Die Schnittmenge ALLER fünf Quellen in der Grenzschicht ist damit leer; gemeinsam sind nur
**700, 850 und 1000 hPa**.

Das ist kein Detail: ICON-D2 ist die tragende Quelle von Stufe 1. Ein 925-hPa-Feld in t1 kommt
zwangsläufig **nicht** aus dem feinsten Modell.

**Entschieden (mit Begründung, s. §4.2):** die drei Flächen bleiben **925 / 850 / 700**, wie Jan sie
genannt hat. In t1 wird 925 von ICON-EU, IFS und AIFS getragen (alle drei stehen in t1 als
`diversity`), ICON-D2 trägt dort 850 und 700. **Nicht** gebaut wird ein Ersatz „950 statt 925 für
ICON-D2": zwei verschiedene Druckflächen in EINER Ebene sind derselbe Fehler wie die vermischten
Gültigzeiten aus §37 — eine Ebene muss genau eine Fläche bedeuten. Die Lücke steht im Manifest.

### §1.2 ⚠ AIFS Single führt **keine relative Feuchte**

Am `.index` (2026091300, +12 h): AIFS hat auf Druckflächen `t u v w gh q z` — **kein `r`**. IFS hat
`r`. Also trägt AIFS auf den Druckflächen **nur die Temperatur**. Ableitbar wäre RH aus `q`, `t`, `p`
(exakt, keine Schätzung) — das kostet je Fläche und Schritt eine zweite Datei (`q` ist mit 0,63–0,72 MiB
sogar größer als `t`) und ist ein eigener Posten (**E-E-2**), kein Teil dieser Etappe.

### §1.3 ✓ „nur eine erweiterte Parameterliste" — im Kern richtig, und die Messung sagt warum

Gemessen mit dem bestehenden `decodeGrib2` an ICON-D2 (Lauf 2026091300, +12 h):

```
single t_2m     ni=1215 nj=746 lat1=43.18 lon1=-3.94 di=0.02 dj=0.02 scan=64  lev=2
pl     t 850    ni=1215 nj=746 lat1=43.18 lon1=-3.94 di=0.02 dj=0.02 scan=64  lev=85000
pl     relhum   ni=1215 nj=746 lat1=43.18 lon1=-3.94 di=0.02 dj=0.02 scan=64  lev=85000
pl     t 700    ni=1215 nj=746 lat1=43.18 lon1=-3.94 di=0.02 dj=0.02 scan=64  lev=70000
```

**Das Gitter ist byte-identisch definiert zum Einzelflächenfeld.** Damit gilt:

* keine neue Zugriffsfamilie, kein neuer Decoder, keine neue Abtastmathematik;
* der Abtast-Index aus PD-F2c ist über die Gittersignatur **derselbe** wie für die Einzelflächen — die
  Druckflächen kosten keinen zweiten Index;
* `level` kommt in **Pa** (85000, 70000). Das ist als Wächter brauchbar: der Adapter prüft
  `level === hPa · 100` und bricht laut ab, statt eine falsche Fläche stumm in die richtige Ebene zu
  schreiben.

**Zwei Einheitenbefunde, die ohne Messung ins Produkt gegangen wären:**

* T kommt in **Kelvin** (273,99–293,66 K auf 850 hPa) — wie `t_2m`, also `KELVIN_TO_C`.
* RH kommt in **Prozent**, und der gemessene Maximalwert ist **101,00 %**, nicht 100. Der Bereich
  der Ebene ist deshalb `[0, 120]`.

  ⚠ **Korrektur an meiner ersten Fassung dieses Absatzes, die erst die eigene Gegenkontrolle
  erzwungen hat:** ich hatte geschrieben, `[0, 100]` würde die Werte „still klemmen". Das ist
  falsch. `quantize()` liest `range` **gar nicht** — es wehrt nur den int16-Überlauf ab
  (`q < INT16_MIN || q > INT16_MAX ⇒ MISSING`). 101 % landen also so oder so unverändert im Cube.
  Falsch wäre `[0, 100]` trotzdem, nur anders: der Bereich ist eine **Deklaration**. Sie stünde
  dann unwahr im Format, der int16-Test prüfte die falsche Spanne, und jeder Leser, der ihr glaubt
  — eine UI-Klemme, ein Plausibilitätsfilter, das Archivschema, das dieselben Skalen erbt —, hielte
  einen gültigen Wert für einen Fehler. Der Verifier hält beide Aussagen jetzt fest: dass 101 %
  durchkommen, **und** dass der Bereich sie nicht klemmt.

### §1.4 ✓ „HSURF ist ein statisches Feld" — richtig, und es wird **heute schon je Quelle geholt**

`scripts/point/build-point-cube.mjs` ruft in `runOrography()` je Beiträger `adapter.orography(run, tier)`
auf, maskiert auf die Domäne — **und mittelt die Gitter dann zu der einen Ebene `hModEff`**:

```js
for (const o of oros) if (Number.isFinite(o[k])) { n++; sum += o[k]; }
const q = quantize(sum / n, mp);
```

Das ist dieselbe Klasse wie der Befund aus PD-D §1 (`srcMask` → `srcCount`): **die Information je Quelle
existiert im Speicher und wird vor dem Schreiben weggeworfen.** Jans Posten 2 kostet deshalb **kein
einziges Byte Netz** — er legt ab, was ohnehin geholt und schon abgetastet wurde. Der Abruf ist zudem
längst im Cache-Schutz (`CACHE_KEEP_RE` in `shared.mjs` hält `hsurf|time-invariant|constants`).

---

## §2 Wer eine Modellorographie hat — und wer nicht

Am Code ausgezählt (`orography()` je Adapter):

| Quelle | `orography()` | Herkunft |
|---|---|---|
| `icon_d2` | ✓ | `…time-invariant_<run>_000_0_hsurf.grib2.bz2` (0,63 MiB) |
| `icon_eu` | ✓ | `…time-invariant_<run>_HSURF.grib2.bz2` (0,68 MiB) |
| `icon_global` | ✓ | `icon_global_icosahedral_time-invariant_<run>_HSURF…` (1,25 MiB) |
| `icon_ch1_eps`, `icon_ch2_eps` | ✓ | MeteoSchweiz-Konstantenobjekt, `CONST_ID.hsurf = [0,3,6]` |
| `aicon` | ✗ | `orographyParam: null` — der DWD legt für AICON keine invariante Datei ab |
| `claef`, `claef_eps` | ✗ | die GeoSphere-API liefert keine Orographie (Kommentar im Adapter) |
| `ifs_hres`, `aifs_single`, `ifs_ens`, `aifs_ens` | ✗ | `.index` führt auf `sfc` **kein** `z`/`orog` (gemessene sfc-Liste: `100u 100v 10fg 10u 10v 2d 2t asn ewss lsm mn2t3 msl mucape mx2t3 nsss ptype ro rsn sd sf sithick skt sp ssr ssrd str strd sve svn tcc tcw tcwv tp tprate ttr zos`) |
| `*_eps` (DWD) | ✗ | reine σ_ens-Quellen, `orography(){ return null }` |
| `mosmix_l` | (eigenes Produkt) | `hModEff` = Stationshöhe (§44) |

Gegen `TIER_BANDS` gehalten ergibt das:

| Stufe | Beiträger mit Orographie | Beiträger ohne |
|---|---|---|
| t1 | `icon_d2`, `icon_ch1_eps`, `icon_eu` | `icon_d2_eps`, `claef`, `claef_eps`, `ifs_hres`, `aifs_single` |
| t2 | `icon_eu`, `icon_ch2_eps`, `icon_global` | `icon_eu_eps`, `aicon`, `ifs_hres`, `aifs_single` |
| t3 | **`icon_global` — und sonst keiner** | `icon_eps_global`, `aicon`, `ifs_hres`, `ifs_ens`, `aifs_single`, `aifs_ens` |

### §2.1 ⚠ **V-PD-57 — der Befund, den Jans Posten 2 sichtbar macht**

In **Stufe 3** hat genau EINE Quelle eine Modellorographie: ICON global. Und ICON global **endet bei
180 h** (§43.12). Für die **156 von 336 Stunden** jenseits davon tragen ausschließlich IFS HRES und AIFS
Single die Werte — während `hModEff` dort ICON globals HSURF ausweist, weil die Ebene über die ganze
Zeitachse konstant geschrieben wird:

```js
for (let it = 0; it < nt; it++) plane[it * cells + k] = q;   // runOrography
```

`hModEff` ist damit in der Fernstufe die Höhe eines Modells, das dort **gar nichts beiträgt**. PAP 4
rechnet mit `h_true − h_mod_eff`; die Korrektur greift dort also gegen die falsche Modellhöhe. Sichtbar
wird das erst, wenn man die Höhen je Quelle nebeneinanderlegt — genau das ist Posten 2.

**Folge für den Bau:** ein statisches Produkt, das nur die nativ veröffentlichten HSURF ablegt, wäre in
t3 ein Produkt mit einer einzigen Spalte. Deshalb §5.3: die ECMWF-Höhe wird aus `gh` + `sp` **abgeleitet**
und als solche gekennzeichnet.

---

## §3 Kosten, gemessen

Dateigrößen am echten Objekt (`Content-Length`, Lauf 2026091300, +12 h; ECMWF aus `_length` im `.index`):

| Quelle | T je Fläche·Schritt | RH je Fläche·Schritt | Summe |
|---|---:|---:|---:|
| ICON-D2 | 0,872 MiB | 1,090 MiB | **1,962 MiB** |
| ICON-EU | 0,912 MiB | 1,264 MiB | **2,177 MiB** |
| ICON global | 3,119 MiB | 4,507 MiB | **7,626 MiB** |
| IFS HRES (Byte-Bereich) | 0,52–0,58 MiB | 0,39–0,42 MiB | **0,93–1,00 MiB** |
| AIFS Single (Byte-Bereich) | 0,44–0,49 MiB | — (kein `r`) | **0,44–0,49 MiB** |

**ICON global ist je Fläche und Schritt 3,5-mal so teuer wie ICON-EU und 7,7-mal so teuer wie IFS** — es
liefert das ganze Globusgitter für einen DACH-Ausschnitt. Genau dieselbe Rechnung hat schon bei den
Membern entschieden (§43: „55,8/65,1 MiB gegen 34,8 für dieselbe Aussage").

**Entschieden: ICON global steht NICHT in der Druckflächen-Bahn.** In t2 tragen ICON-EU (bis 120 h) und
IFS dieselben drei Flächen für zusammen 226 MiB statt 549 MiB allein für ICON global; in t3 reicht ICON
global ohnehin nur bis 180 h, während IFS und AIFS die ganze Achse tragen. Eine Zeile in
`PRESSURE_SOURCES`, falls Jan es anders will.

### §3.1 Volumen der Etappe

Schrittzahlen aus `TIER_BANDS` × dem gemessenen Raster der Quelle (ICON-D2 stündlich 000–048 belegt;
ICON-EU stündlich bis 78 h, danach 3-stündlich bis 120 h; IFS 3-stündlich ≤ 144 h; AIFS 6-stündlich):

| Stufe | Quelle | Flächen | Schritte | MiB |
|---|---|---|---:|---:|
| t1 | `icon_d2` | 850, 700 | 49 | 192,3 |
| t1 | `icon_eu` | 925, 850, 700 | 49 | 320,0 |
| t1 | `ifs_hres` | 925, 850, 700 | 17 | 49,2 |
| t1 | `aifs_single` | 925, 850, 700 (nur T) | 9 | 12,8 |
| | | | **t1** | **574,3** |
| t2 | `icon_eu` | 925, 850, 700 | 24 | 156,7 |
| t2 | `ifs_hres` | 925, 850, 700 | 24 | 69,5 |
| t2 | `aifs_single` | 925, 850, 700 (nur T) | 12 | 17,0 |
| | | | **t2** | **243,2** |
| t3 | `ifs_hres` | 850 | 36 | 36,0 |
| t3 | `aifs_single` | 850 (nur T) | 36 | 17,6 |
| | | | **t3** | **53,6** |

**Je Zyklus 871 MiB.** Auf den Tag mit den Takten aus PD-F3c (t1 8×, t2 4×, t3 2×):
**8 · 574,3 + 4 · 243,2 + 2 · 53,6 = 5 674 MiB ≈ 5,54 GiB/Tag** — auf ein Tagesvolumen von ≈ 43 GiB
sind das **+13 %**.

Der größte Einzelposten ist **ICON-EU in t1 mit 320 MiB** (die einzige stündliche 925-hPa-Quelle im
Kurzfristband). Wer kürzen muss, kürzt hier zuerst — die Zeile steht deshalb einzeln in der Tabelle und
einzeln in `PRESSURE_SOURCES`.

Laufzeit: der Bau ist seit Block F netzgebunden mit überlappenden Bahnen; die Druckflächen laufen als
**eigene Bahn** neben den Feldbahnen. Erwartung **+2…4 min** in t1 (gemessen wird beim ersten Bau, s. Gate).
`JOB_MAX_MIN_BY_TIER` steht auf {20, 15, 10} bei gemessenen Maxima {11,1 · 8,4 · 5,9} — der Rand trägt das.

### §3.2 Kosten Posten 2

**Null Byte Netz.** Die Orographie wird je Quelle und Stufe ohnehin geholt und abgetastet (§1.4). Das
statische Produkt schreibt nur, was danach im Speicher liegt.

Ausgabe: t1 hat 48 441 Zellen (201 × 241), int16 ⇒ 94,6 KiB je Quelle und Stufe **roh**; mit
Zeilendifferenz + Deflate misst §26 an einem Höhenfeld −28 %, also ≈ 68 KiB. Bei 3 Quellen in t1,
3 in t2, 3 in t3 (mit den abgeleiteten aus §5.3) liegt das ganze Produkt **unter 1 MiB** — einmal, nicht
je Lauf.

---

## §4 Entwurf Posten 1 — die Druckflächen

### §4.1 Sechs neue Ebenen, Schema 5

`CUBE_VARS` bekommt sechs Einträge ohne σ und ohne Quantile (wie `clcl/clcm/clch`, die es ebenfalls nur
für eine Konsistenzbedingung gibt):

| Ebene | Einheit | Skala | Bereich | Grund |
|---|---|---:|---|---|
| `t925`, `t850`, `t700` | °C | 0,01 | −80…40 | Temperatur der Druckfläche |
| `rh925`, `rh850`, `rh700` | % | 0,1 | 0…**120** | relative Feuchte; 101 % gemessen, s. §1.3 |

**51 → 57 Ebenen ⇒ `CUBE_SCHEMA` 4 → 5.** Der Container ist seit Schema 2 selbstbeschreibend
(`decodeCubeChunk(bytes, { planes })` aus dem Lauf-Manifest), die Nummer bleibt trotzdem die
Projektkonvention für eine geänderte Ebenenliste (so hat es PD-B6 mit 36→37 und PD-B7 mit 37→51
gehalten). Der Bruch ist **heute kostenlos**: Aufbewahrung ≤ 24 h, kein verdrahteter Verbraucher.

**Warum RH und nicht Taupunkt:** die Quellen veröffentlichen RH; ein Taupunkt auf der Druckfläche wäre
eine Ableitung, die jeder Leser aus `t<p>` + `rh<p>` in einer Zeile selbst machen kann. Für den MEDIAN
ist die Ableitung zulässig (§37 macht es bei C-LAEF so) — sie hier vorwegzunehmen hieße nur, die
Rohgröße zu verlieren. Jan hat RH ausdrücklich als das Gewünschte genannt.

### §4.2 Belegung je Stufe

| | 925 | 850 | 700 |
|---|---|---|---|
| **t1** | `icon_eu`, `ifs_hres`, `aifs_single`(T) | `icon_d2`, `icon_eu`, `ifs_hres`, `aifs_single`(T) | wie 850 |
| **t2** | `icon_eu`, `ifs_hres`, `aifs_single`(T) | dieselben | dieselben |
| **t3** | — (MISSING) | `ifs_hres`, `aifs_single`(T) | — (MISSING) |

t3 trägt nach Jans Vorgabe **nur 850 hPa**; `t925/t700/rh925/rh700` bleiben dort MISSING und stehen so im
Manifest — benannt abwesend, nicht stumm leer.

**Fusion:** wie bei den Zielgrößen, gleiche Gewichte, Mittel über die Quellen, die diese Fläche führen.
Das ist hier zulässig und bei den Profilfeldern nicht: `gammaEff/zBase/zInv/dTInv` sind
Strukturaussagen, deren Mittel keine Struktur mehr ist (§40) — die Temperatur auf 850 hPa ist ein
gewöhnliches Skalarfeld, für das der Cube seit PD-A mittelt. **Keine σ-Ebenen**: sie kosteten sechs
weitere Ebenen für eine Größe, die PAP 4/5/6 heute nicht als unsichere Eingabe führt.

### §4.3 ⚠ Werte **unter Grund** sind Extrapolation, keine Messung

Über den Alpen liegt die 925-hPa-Fläche (≈ 760 m Standardatmosphäre) und teils auch 850 hPa (≈ 1 460 m)
**unterhalb der Modelloberfläche**. Alle Modelle veröffentlichen dort trotzdem einen Wert — extrapoliert,
nach modellinterner Vorschrift. Ein Leser, der ihn für eine Vorhersage hält, liest Fiktion.

Der Cube hat die Information, um das zu entscheiden: die Ebene **`ps`** (Bodendruck) steht in derselben
Zelle und Stunde. Die Regel ist exakt und braucht kein neues Feld:

> `p_Fläche > ps` ⇒ die Fläche liegt unter Grund; der Wert ist extrapoliert.

**Entschieden: der Producer maskiert NICHT.** Erstens wäre die Maske gegen das *fusionierte* `ps`
gerechnet, während die Werte je Quelle extrapoliert sind; zweitens ist ein extrapolierter Wert für
manche Zwecke (Reduktionsrechnungen) brauchbar, solange er als solcher erkennbar ist. Stattdessen:

* das Manifest führt `pressure.belowGroundRule` im Klartext,
* `src/point/client/cubePoint.ts` setzt je Schritt und Fläche `belowGround: true`, wenn `ps` es sagt,
* `npm run point:read` schreibt es in den Ehrlichkeitsblock.

---

## §5 Entwurf Posten 2 — `point/static/hmodel/`

### §5.1 Ort, Form, Pinnung

```
point/static/hmodel/v1/static.json          ← Ebenenliste (= Quellen), Herkunft je Quelle, Prüfsummen
point/static/hmodel/v1/t1/<cy>_<cx>.bin     ← BSPC-Container, nt = 1, eine Ebene je Quelle
point/static/hmodel/v1/t2/<cy>_<cx>.bin
point/static/hmodel/v1/t3/<cy>_<cx>.bin
```

* **Derselbe Container, eigene Ebenenliste.** `encodeCubeChunk` bekommt die Ebenenliste als
  **optionalen dritten Parameter** (heute fest `CUBE_PLANES`); `decodeCubeChunk` kann eine fremde Liste
  schon seit Schema 2. Additiv, keine Aufrufstelle ändert sich.
* **Dasselbe Chunk-Raster wie der Cube** (`CHUNK_CELLS = 16`). Damit liest ein Client die Modellhöhen
  am selben `(cy, cx)`, den er für den Cube ohnehin holt — **1,5 KiB statt der 210 KiB**, die eine
  Datei je Stufe kosten würde. Das ist die Abweichung vom Plan-Entwurf PD-C11, der für das
  GHS-Produkt eine Datei je Stufe skizzierte; hier entscheidet die Leserechnung.
* **`point/static/` ist bereits `TIMELESS`** (`manifest.ts`), fällt also aus der Aufbewahrung heraus,
  und der Verzeichnisname `static` erfüllt `^\d{10}$` nicht — die Löschregel und der Orphan-Wächter
  fassen es nicht an.
* **SHA-Pinnung:** `index.json` bekommt einen Block `static.hmodel` mit `version`, `path`, `planes[]`,
  `builtFrom` (Lauf) und der Prüfsumme je Stufe. Wie bei den Cube-Chunks nennt der Publisher den
  Datencommit erst, **nachdem** er auf dem Remote steht (§29).

### §5.2 „Nicht pro Lauf neu schreiben" — und trotzdem nicht blind

HSURF ändert sich mit einem Modell-Upgrade, also selten und ohne Ankündigung im Dateinamen. Ein Produkt,
das **nie** wieder hinsieht, wäre nach dem nächsten ICON-Upgrade stumm falsch. Deshalb:

> Der Producer hasht das je Quelle und Stufe abgetastete Gitter und vergleicht mit `static.json`.
> Gleich ⇒ **nichts geschrieben** (Jans Vorgabe). Verschieden oder fehlend ⇒ Stufe neu geschrieben und
> die Änderung im Log und im Manifest **benannt**.

Kosten des Vergleichs: ein Hash über 48 441 int16 je Quelle, also Millisekunden — gegen ein stumm
veraltetes Höhenfeld, das jede PAP-4-Korrektur verschöbe.

### §5.3 ECMWF: Höhe aus `gh` + `sp` **abgeleitet**, und als solche gekennzeichnet

Ohne diesen Schritt hätte das Produkt in t3 genau eine Spalte (§2.1). ECMWF veröffentlicht auf
Druckflächen die **geopotentielle Höhe** `gh` (in m) — dieselben Flächen, die Posten 1 ohnehin anfasst —
und auf `sfc` den **Bodendruck** `sp`, den der Cube als `ps` schon holt. Die Modelloberfläche ist die
Höhe, auf der der Druck gleich `sp` ist:

> `h_mod = gh` interpoliert in `ln p` an der Stelle `p = sp`, mit den zwei Flächen, die `sp` einschließen.

Das ist keine Schätzung, sondern die Umkehrung derselben Beziehung, aus der `gh` selbst kommt; über eine
Schicht von ≈ 700 m ist die log-lineare Interpolation für eine isotherme Schicht exakt und sonst
nahezu. Kosten: `gh` auf 1000/925/850/700 hPa für **einen** Schritt je Lauf ≈ 2,0 MiB je Modell.

**Gegenprobe, die den Wert erst belastbar macht:** in t3 liegt ICON globals natives HSURF auf demselben
0,25°-Gitter. Die abgeleitete IFS-Höhe muss ihm im Flachland auf wenige Dutzend Meter folgen und in den
Alpen systematisch abweichen (verschiedene Modellauflösungen). Bleibt die Abweichung im Flachland groß,
ist die Ableitung falsch und wird nicht veröffentlicht — dann trägt t3 eine Spalte und sagt es.

Kennzeichnung je Quelle in `static.json`: `provenance: 'native'` (HSURF aus der Quelle) gegen
`'derived-gh-sp'`. Wer beides gleich behandelt, tut es dann wissentlich.

### §5.4 Wer keine bekommt, und warum das dasteht

`aicon` (kein invariantes Objekt; das ikosaedrische Gitter von ICON global zu **unterstellen** wäre eine
Annahme, keine Messung), `claef`/`claef_eps` (die GeoSphere-API führt weder Orographie noch `ps`, nur
`msl` — die Ableitung aus §5.3 ist damit versperrt), die reinen σ_ens-Quellen (sie tragen keine Werte,
für die eine Höhenkorrektur nötig wäre). Alle vier stehen als `absent` **mit Grund** in `static.json`,
nach dem Muster `MOSMIX_NOT_MAPPED` aus §44.

---

## §6 Etappen und Gates

| Etappe | Inhalt | Gate |
|---|---|---|
| **E1a** | Format: 6 Ebenen, Schema 5, `PRESSURE_LEVELS`, `encodeCubeChunk` mit optionaler Ebenenliste | `verify:point-data` grün, Rundweg Producer→Client über den echten `encodeCubeChunk` |
| **E1b** | Adapter: `pressure()` in `dwdRegular` und `ecmwf`, Flächenliste je Quelle **gemessen**, Pa-Wächter | netzfreier Selbsttest + ein echter Abruf je Quelle |
| **E1c** | Producer: eigene Bahn `runPressure`, Manifestblock `pressure`, Kill-Switch `POINT_PLEVEL=0` | Bau je Stufe; Belegung und Volumen gemessen; Byte-Gleichheit der übrigen 51 Ebenen gegen den Referenzbau |
| **E2a** | `point/static/hmodel/v1` aus den nativ veröffentlichten HSURF, Hash-Vergleich statt Neuschreiben | Produkt liegt vor, zweiter Lauf schreibt **null** Bytes |
| **E2b** | ECMWF-Höhe aus `gh` + `sp`, Gegenprobe gegen ICON global in t3 | Abweichung im Flachland benannt; bei Fehlschlag wird E2b **nicht** veröffentlicht |
| **E3** | Client + CLI: neue Ebenen, `belowGround`, `staticPoint.ts`; Verifier | `verify:point-client`, `point:read` zeigt beides |

**Jans Gates unverändert:** kein Commit, kein Push, keine Cron-/Vorlagenänderung ohne Auftrag. Diese
Etappe ändert **keine** Workflow-Datei — die Druckflächen laufen im bestehenden Job jeder Stufe mit.

## §9 Umgesetzt — und was der erste echte Bau gezeigt hat

Beide Posten sind gebaut, verifiziert und **nicht veröffentlicht** (kein Commit, kein Push, keine
Workflow-Änderung — Jans Gates unberührt). Die Cron-Vorlage bleibt Zeile für Zeile, wie sie ist: die
Druckflächen laufen im bestehenden Job jeder Stufe mit.

### §9.1 Was neu ist

| | |
|---|---|
| Format | `CUBE_VARS` + 6 Ebenen (`t925/t850/t700`, `rh925/rh850/rh700`), **51 → 57 Ebenen, Schema 4 → 5**; `PRESSURE_LEVELS_HPA`, `pressureLevelsForTier`, `pressurePlaneId`, `parsePressurePlaneId`; `STATIC_DIR` + Pfadbauer; `encodeCubeChunk` nimmt die Ebenenliste als **optionalen** dritten Parameter (keine Aufrufstelle ändert sich) |
| Adapter | `dwdRegular`: `pressureLevels` je Modell (**D2 nur 850/700**), `pressureField()` mit Pa-Wächter · `ecmwf`: eigener `pl`-Index, Mehrbereichs-Vorabruf, `pressureField()`, `orographyDerived()` · `orographyAbsentReason` in fünf Adaptern |
| Producer | eigene Bahn `runPressure` (`runLanes` wie die Feldbahnen), Manifestblock `pressure`, Kill-Switch `POINT_PLEVEL=0`, Raster `POINT_PLEVEL_STEP_H`; `runOrography` behält die Spalten je Quelle und ruft `writeStaticHmodel` (`POINT_STATIC=0`) |
| Neu | `scripts/point/staticHmodel.mjs` (Hash-Vergleich, Manifest-Merge, netzfreier Selbsttest 7/7) · `src/point/client/staticPoint.ts` |
| Client | `CubePointStep.belowGroundHPa`, `readHmodelPoint`/`loadHmodelManifest`, beides im Barrel; `point:read` zeigt beide Blöcke |

**Gate:** `verify:point-data` **895/895** (vorher 837), `verify:point-client` **63/63** (vorher 44),
`typecheck` 0 Fehler, Build 241/241, Budget **unverändert** (eagerJs 107,9 · totalJs 1366,1;
Textsonde um `readHmodelPoint`, `belowGroundHPa`, `derived-gh-sp` erweitert ⇒ 0 von 83 Chunks).

### §9.2 ⚠ Zwei Fehler, die erst der Bau am echten Datum gezeigt hat — beide von mir

**(1) Der Druckflächen-Index war leer, und nichts sah danach aus.** Der erste t3-Bau meldete
`t850 0 · rh850 0` und ein statisches Produkt mit nur einer Spalte — **ohne Fehler, ohne 404, ohne
Ausnahme**. Ursache: `keepIndexEntry()` beginnt mit `if (e.levtype !== 'sfc') return false;`. Mein
`plIndex` benutzte dieselbe Funktion und verwarf damit **jede einzelne** Druckflächenzeile. Der
Block lief 32 s (er holte den Index ja), fand nichts und schrieb pflichtgemäß eine 0 ins Manifest.

Das ist die Klasse aus §45.2 — ein Filter, für einen Zweck geschrieben, für einen zweiten
wiederverwendet —, nur diesmal von mir eingebaut. Kur: `keepIndexType()` (die Lauf-Regel allein)
getrennt von `keepIndexEntry()` (dieselbe Regel **plus** „nur Oberflächenfelder"). Gefunden hat es
**nicht** der Verifier, sondern die Zahl im Bauprotokoll: meine 21 neuen Prüfungen testeten die
Adapter-Oberfläche (führt die Quelle 925? liefert sie `null`, wo sie nichts hat?) und nie, ob sie
für eine Fläche, die sie führt, auch etwas **liefert**. Genau deshalb steht die Zeile
„Druckflaechen … t850 3 · rh850 3" im Protokoll: eine Etappe, die keine Zahl ausdruckt, kann man
nicht widerlegen.

**(2) `point/point/static/`.** `POINT_OUT` **ist** das `point/`-Verzeichnis; die Pfadbauer liefern
Pfade ab Repo-Wurzel. Der Producer streift das Präfix mit `inOut()`, mein Modul tat es nicht. Auch
hier kein Fehler — das Schreiben gelang ja —, aufgefallen erst, als die Gegenprobe die Cube-Chunks
woanders suchte als das statische Produkt lag. Kur: dieselbe Regel im Modul, und eine
Verifier-Prüfung hält beide Stellen aneinander.

**Korrektur an dieser Diagnose selbst:** meine Behauptung in §1.3, ein Bereich `[0,100]` würde RH
still klemmen, ist falsch — `quantize()` liest `range` gar nicht (s. den korrigierten Absatz dort).
Aufgefallen, weil die dafür geschriebene *Gegenkontrolle* durchfiel.

### §9.3 Die Druckflächen am echten Datum

Bau t1, Lauf 2026091306, Stunden 0–2, Quellen ICON-D2 + ICON-EU + IFS:

```
t1: Druckflaechen (Raster 1 h) — t925 3 · rh925 3 · t850 3 · rh850 3 · t700 3 · rh700 3
```

Alle sechs Ebenen belegt. 925 kommt dabei aus ICON-EU und IFS, **nicht** aus ICON-D2 — genau wie
§1.1 es vorhergesagt hat.

**Die Gegenprobe ist die Physik, nicht der Wertebereich.** Über **145 323 (Zelle, Stunde)**:

| Bedingung | Verstöße |
|---|---|
| `t925 > t850` | **57** (0,04 %), größte Umkehr **0,33 K** — echte Inversionen, und genau dafür ist die Fläche da |
| `t850 > t700` | **0** (0,00 %) |

Eine Verwechslung zweier Flächen, ein Einheitenfehler oder eine Zellverschiebung hätten hier
Prozentwerte im zweistelligen Bereich erzeugt.

**Und der Grund für `belowGroundHPa`, an echten Zahlen** (t1, +0 h):

| Ort | echte Höhe | `ps` | `t2m` | `t925` | `t850` | `t700` | unter Grund |
|---|---:|---:|---:|---:|---:|---:|---|
| Hamburg | 10 m | 1015,2 | 16,5 | 12,9 | 8,7 | 0,9 | — |
| München | 519 m | 963,6 | 14,4 | 15,8 | 10,7 | 3,6 | — |
| Innsbruck | 574 m | 908,1 | 10,1 | 13,6 | 9,8 | 2,8 | **925** |
| Zermatt | 1608 m | 752,3 | **4,2** | **19,5** | 14,7 | 6,2 | **925, 850** |
| Zugspitze | 2962 m | 834,9 | 7,2 | 14,3 | 10,2 | 3,0 | **925, 850** |

**Zermatt meldet auf 925 hPa 19,5 °C, während am Boden 4,2 °C stehen.** Der Wert ist nicht falsch —
er ist die Extrapolation des Modells unter die eigene Oberfläche. Wer ihn für eine Vorhersage in
760 m Höhe hält, liest Fiktion. Der Leser markiert das (`belowGroundHPa`), der Cube schreibt den
Wert unverändert, und `null` statt `[]` heißt ausdrücklich „nicht entscheidbar" (kein `ps` oder
keine Fläche geführt) statt „geprüft, alle über Grund".

### §9.4 `h_model` je Quelle — und die Gegenprobe, die über E2b entschieden hat

Bau t3 (0,25°), Lauf 2026091300: **drei Spalten** — `icon_global` nativ, `ifs_hres` und
`aifs_single` aus `gh` + `sp` abgeleitet; 12 Chunks, **10 KiB**. Bau t1: `icon_d2`, `icon_eu`,
`ifs_hres`, 208 Chunks, **135 KiB**. Netz für Posten 2: **0 Byte** außer den ~2,6 MiB je Stufe für
die ECMWF-Ableitung.

**Die Gegenprobe aus §5.3, gerechnet:** ICON globals natives HSURF liegt in t3 auf demselben
0,25°-Gitter wie die abgeleitete IFS-Höhe.

| | mittlerer Betrag | größte Abweichung |
|---|---:|---:|
| Flachland (< 300 m) | **7 m** | 10 m |
| Bergland (≥ 300 m) | 30 m | 70 m |

Das Flachland ist der Prüfstein: dort sollten zwei Modelle ähnlicher Auflösung dieselbe Höhe
kennen, und 7 m sind der Beweis, dass die log-lineare Interpolation in `ln p` trifft (gegen die
Standardatmosphäre gerechnet: ≤ 18 m über 0–2 962 m). Im Bergland gehen sie auseinander — erwartet,
weil ICON global (~13 km) und AIFS (0,25°) verschieden stark glätten. **E2b ist damit belegt und
wird gebaut.**

**Was das Produkt sichtbar macht, und `hModEff` nicht:**

| Ort (t3, 0,25°) | echt | ICON global | IFS | AIFS | Spanne |
|---|---:|---:|---:|---:|---:|
| Innsbruck | 574 m | 1332 m | 1402 m | **1672 m** | **340 m** |
| Zermatt | 1608 m | 3020 m | 2995 m | 2542 m | 478 m |
| Zugspitze | 2962 m | 1333 m | 1374 m | 1123 m | 251 m |
| Hamburg | 10 m | 7 m | 13 m | 16 m | 9 m |

Die drei Modelle sind sich über die Höhe **derselben Zelle** um bis zu 478 m uneinig, und der
Abstand zur Wirklichkeit geht in den Alpen in den Kilometer (Zugspitze −1 588 m bis −1 839 m). PAP 4
korrigiert `h_true − h_mod_eff`; bis PD-E stand dort ein Mittelwert, der beides verschwieg.

**„Nicht pro Lauf neu schreiben" ist belegt, nicht behauptet:** der Verifier baut das Produkt auf
dem Datenträger, ruft es ein zweites Mal mit denselben Höhen auf ⇒ `changed: false`, **null Bytes**;
mit geänderten Höhen und mit einer zusätzlichen Spalte ⇒ jeweils `changed: true`; und ein
Ein-Stufen-Job (F3b) **mergt** das Manifest, statt die Spalten der anderen Stufen zu löschen.

### §9.5 Zwei Betriebsbefunde, benannt statt behoben

* **V-PD-60 — die ECMWF-Drosselung wächst mit.** Der t3-Bau meldete **3 × HTTP 429** bei
  `ifs_hres`, der t1-Bau 1 ×. Die Druckflächen legen eine zweite Mehrbereichs-Anfragenfamilie je
  Schritt auf denselben Host. Der FIFO-Pacer aus PD-F2a hat sie aufgefangen (0 Fehler, keine Quelle
  gefallen, `throttled` steht im Manifest) — aber der Abstand von 600 ms ist für IFS jetzt knapper
  als vorher. Zu beobachten am ersten vollen Lauf; die Stellschraube ist `HOST_MAX_INFLIGHT`.
* **V-PD-57 bleibt offen und ist jetzt messbar.** `hModEff` in t3 ist weiterhin allein ICON globals
  HSURF, auch für die 156 Stunden jenseits 180 h, in denen nur IFS und AIFS tragen. Die abgeleiteten
  Höhen gehen bewusst **nicht** ins Mittel (E-E-5) — das wäre eine stille Änderung an genau dem
  Term, den PAP 4 korrigiert. Sie stehen daneben, damit die Differenz sichtbar ist.

## §7 Offene Entscheidungen (Jan)

* **E-E-1** — ICON-EU in t1 ist mit 320 MiB der größte Posten und die einzige stündliche 925-hPa-Quelle
  im Kurzfristband. Bleiben (925 stündlich) oder streichen (925 nur 3-stündlich aus IFS, −320 MiB/Lauf,
  −2,5 GiB/Tag)?
* **E-E-2** — RH für AIFS aus `q` ableiten (exakt, aber `q` ist größer als `t`) oder AIFS auf den
  Druckflächen bei „nur Temperatur" belassen?
* **E-E-3** — ICON global bleibt aus der Druckflächen-Bahn draußen (7,63 gegen 2,18 bzw. 0,99 MiB je
  Fläche und Schritt). Einverstanden?
* **E-E-5** — soll die abgeleitete ECMWF-Höhe in `hModEff` eingehen? Heute nicht: `hModEff` mittelt
  nur nativ veröffentlichte HSURF, in t3 also allein ICON global — für 156 der 336 Stunden ein
  Modell, das dort gar nichts beiträgt (V-PD-57). Sie aufzunehmen verbessert die Höhe und **ändert
  veröffentlichte Werte** an dem Term, den PAP 4 korrigiert. Das ist keine Entscheidung, die ich
  still treffe.
* **E-E-4** — 700 hPa auch in t3? Kostet 36 MiB je t3-Lauf (2×/Tag) und wäre für Föhn- und
  Absinklagen im Fernbereich die aussagekräftigste Fläche. Jans Vorgabe war „in t3 reicht 850".

## §8 Neue V-Einträge

* **V-PD-57** — `hModEff` in t3 ist ICON globals HSURF, auch für die 156 Stunden jenseits 180 h, in
  denen ausschließlich IFS und AIFS tragen (§2.1).
* **V-PD-58** — ICON-D2 führt kein 925 hPa; die 925-Ebene in t1 kommt ohne das feinste Modell aus (§1.1).
* **V-PD-60** — die Druckflächen legen eine zweite Mehrbereichs-Anfragenfamilie je Schritt auf
  `data.ecmwf.int`; gemessen 3 × 429 in einem t3-Bau, vom Pacer aufgefangen (§9.5).
* **V-PD-59** — RH auf Druckflächen überschreitet 100 % (gemessen 101,00). Der Cube schreibt den
  Wert unverändert; jeder Leser, der auf 100 klemmt oder darüber hinaus als Fehler wertet, liegt
  falsch (§1.3). Miterledigt: `range` in `CUBE_VARS` ist eine **Deklaration**, kein
  Laufzeitwächter — `quantize()` prüft nur int16. Das stand nirgends, und ich hatte es anders
  angenommen.
