# buscosun-data

Vorprozessierte Wetterdaten für [buscosun.com](https://buscosun.com).

**Dieses Repo enthält keinen Anwendungscode.** Es ist ein reiner Datenspeicher,
ausgeliefert über [jsDelivr](https://www.jsdelivr.com/). Drei Produktlinien mit drei
verschiedenen Takten und drei verschiedenen Zwecken:

| Linie | Verzeichnis | Achse | Takt | Wer schreibt |
|---|---|---|---|---|
| **Kartenlayer** | `runs/`, `index.json`, `hsurf-v1.png` | Fläche je Zeitpunkt | 8 × täglich | `.github/workflows/build.yml` |
| **Radar-Spiegel** | `radar/` | Fläche je Zeitpunkt, Minuten | alle 1–2 min | `.github/workflows/radar.yml` |
| **Punkt-Cube** | `point/` | **Zeitreihe je Ort** | **drei Jobs**: Stufe 1 8 ×, Stufe 2 4 ×, Stufe 3 2 × täglich | `.github/workflows/point.yml` |

---

## Warum

Die Wetterkarte holte bisher rohe GRIB2-Dateien und dekodierte sie in **jedem** Browser
einzeln — 6,55 MiB je Kaltsitzung. Dabei reduziert die App die Daten ohnehin: das native
1215×746-Gleitkommagitter wird auf 608×373 × 8 bit abgetastet, bevor irgendetwas
gezeichnet wird. Dieser Schritt passiert jetzt **einmal** hier statt einmal pro Besucher.

Gemessen: 49,88 MiB GRIB (bz2) → 5,41 MiB PNG je Lauf (Wind + Temperatur, Faktor 9,2×);
mit allen Familien 165,14 MiB → 10,06 MiB (Faktor 16,4×, BW-6).

Die Bilder sind **byte-identisch** zu dem, was der bisherige Pfad im Browser erzeugt
hat — bewiesen über drei Läufe im Verifier `verify:repack` des Anwendungs-Repos.

---

## Kartenlayer — `runs/` und `index.json`

```
index.json              welcher Commit welche Läufe trägt (von den Crons gelesen)
hsurf-v1.png            Modell-Orographie — zeit- UND lauf-invariant, deshalb einmal
runs/<YYYYMMDDHH>/
  repack.json           Gitter, Ecken, Normierung, Dateigrößen, je Familie
  index.json            Zeiger auf den Lauf (Commit + Index-Eintrag) — s. „Frische"
  wind-<SSS>.png        RGB: R = normierte u-Komponente, G = normierte v-Komponente
  temp-<SSS>.png        Grau + Alpha: Grau = normierte 2-m-Temperatur, Alpha = Maske
  gust-<SSS>.png        Grau + Alpha: Böe 0…40 m/s
  thunder-<SSS>.png     Grau + Alpha: Gewitterpotenzial 0…100 (cape_ml, cin_ml, lpi)
  rotation-<SSS>.png    Grau + Alpha: Rotationspotenzial 0…100 (uh_max, uh_max_low, sdi_2)
  lpi-<SSS>.png         Grau + Alpha: Blitzpotenzial lpi_max 0…30 J/kg
  snowdepth-<SSS>.png   Grau + Alpha: Schneedecke 0…150 cm
  snowfresh-<SSS>.png   Grau + Alpha: Neuschnee 0…50 cm (snow_gsp + snow_con, rho_snow)
  precip-<SSS>.png      Grau, VOLLE Auflösung 1215×746: Stundenrate 0…20 mm/h, deakkumuliert
                        gegen den in `repack.json` genannten Vorschritt (`ref`)
  cape-<SSS>.png        Grau, VOLLE Auflösung: CAPE am Punkt (BW-7a) — 12,65 MiB GRIB
                        für EINE Zahl, deshalb hier statt im Browser
```

Die Familienliste lebt an EINER Stelle im Anwendungs-Repo
(`scripts/lib/repackManifest.mjs`, `FAMILIES`).

⚠️ **Der Manifest-Schlüssel ist NICHT immer das Dateipräfix:** `lightningfc` → `lpi-…`,
`snowDepth` → `snowdepth-…`, `snowFresh` → `snowfresh-…`. Wer aus dem Schlüssel den Pfad
baut, greift ins Leere. (In der Linie `point/` gilt diese Ausnahme nicht — dort ist der
Schlüssel immer der Pfad.)

Ein Bild ohne seinen Eintrag in `index.json` ist bedeutungslos: die Wind-Normierung
(`uMin`/`uMax`/`vMin`/`vMax`) wird **je Schritt** neu bestimmt, und ein Niederschlagsbild
ist nur mit seiner Referenz (`ref`) eine Rate.

Adressiert werden die Bilder über `@main` (LZ1/M2): die Pfade unter `runs/<lauf>/` sind
inhaltlich unveränderlich, und die Branch-Ref überlebt den Force-Push des nächsten
Publish am CDN. Die auf den Commit gepinnte Form bleibt als Rückfall.

---

## Radar-Spiegel — `radar/`

Der dominante Commit-Treiber dieses Repos: alle 1–2 Minuten ein Push (RD1–RD3).

```
radar/status.json         schema 2 — keep, pollSec, derive, Job-ID, letzte Läufe
radar/rv/                 DWD RADVOR RV, rohe tar.bz2 je 5-Minuten-Schritt
radar/konrad3d/           DWD KONRAD3D, XML je 5-Minuten-Schritt
radar/img/v1/rv/          RV als fertiges PNG + JSON (RD3: Derive im Spiegel statt im Browser)
radar/img/v1/inca/        GeoSphere INCA
radar/img/v1/rzc/         MeteoSchweiz RZC/CombiPrecip
radar/img/v1/konrad3d/    Zellbahnen als JSON
```

Aufbewahrung: `keep: 12` Schritte (≈ 1 Stunde). Der Job läuft 345 Minuten am Stück und
pusht in seinem eigenen Takt; `radar-watchdog.yml` startet ihn neu, wenn er ausfällt.

---

## Punkt-Cube — `point/`

Die zweite Achse. `runs/` ist *Fläche je Zeitpunkt* — richtig für eine Karte, falsch für
eine Punktvorhersage, die *einen Ort über alle Zeitpunkte* braucht. Eine 336-h-Reihe über
neun Zielgrößen aus `runs/` zu holen hieße ~981 Bildabrufe für einen einzigen Punkt.

```
point/index.json                 Register: Läufe je Stufe, Ebenen mit Skala, Aufbewahrung, Commit
point/sources.json               Quellenmatrix maschinenlesbar (Domänen, Horizonte, Lizenzen)
point/calib.json                 Kalibrierung mit Herkunft je Wert (null = unbekannt, nie 0)
point/<lauf>/run.json            Zeiger auf den Lauf — nennt JEDEN Chunk darunter
point/<lauf>/t1/<cy>_<cx>.bin    Stufe 1 — 0,05°, 0–48 h stündlich   · 201×241, 208 Chunks
point/<lauf>/t2/<cy>_<cx>.bin    Stufe 2 — 0,10°, 51–120 h 3-stündl. · 101×121,  56 Chunks
point/<lauf>/t3/<cy>_<cx>.bin    Stufe 3 — 0,25°, 126–336 h 6-stündl.·  41×49,   12 Chunks
point/stations/catalog.json      Stationskatalog (zeitlos)
point/stations/<lauf>/…          MOSMIX-L je Station — EIGENES Produkt, eigene Achse
point/static/hmodel/v1/…         Modellhöhe JE QUELLE — statisch, zeitlos
```

**Drei Auflösungsstufen**, weil die Quellen drei Auflösungen haben: ICON-D2 ist 2,2 km,
IFS ist 0,25°. Zusammen **109 Zeitschritte** (49 + 24 + 36). Zwischen den Bändern liegen
zwei Lücken in Vorhersagestunden — 49/50 h und 121–125 h; in **Gültigzeit** verschieben
sie sich, weil die Stufen aus verschiedenen Läufen kommen (s. „Ein Verzeichnis ist eine
Veröffentlichung").

Eine Punktabfrage lädt **drei** Chunks — einen je Stufe. Dazu kommen, wenn gebraucht,
1,5 KiB Modellhöhe aus `point/static/` und ein Stationsbündel.

### Was der Cube trägt — 57 Ebenen

```
25 Mittel   12 Zielgrößen (t2m, td2m, u10, v10, gust, precip, clct, clcl, clcm, clch, ps, snowlmt)
            11 Profil- und Flächengrößen (gammaEff, zBase, zInv, dTInv, hModEff,
               t925/t850/t700, rh925/rh850/rh700)
             2 Metaebenen (srcCount, ensCount)
 9 σ_div    <var>_sd      — Streuung ZWISCHEN den Quellen
 9 σ_ens    <var>_sd_ens  — Streuung ZWISCHEN den Membern EINER Quelle
 7 q10 + 7 q90            — gemessene Quantile EINER Quelle (C-LAEF-EPS)
```

⚠️ **Die drei Streuungsarten werden nicht verrechnet.** `_sd` und `_sd_ens` beschreiben
Verschiedenes und dürfen nicht addiert werden; `_q10`/`_q90` sind gemessene Quantile und
keine σ. Welcher Zweig gilt, steht nicht als Flag da — er ist daran ablesbar, welche
Ebene belegt ist. `srcCount` sagt je Zelle, wie viele Quellen getragen haben, `ensCount`,
wie viele Member.

⚠️ **Die Druckflächen sind nicht überall dieselben Quellen:** ICON-D2 führt kein 925 hPa
(sondern 950/975), IFS und AIFS kein 950; AIFS führt auf Druckflächen keine relative
Feuchte. Gemittelt wird je Ebene nur über die Quellen, die **genau** diese Fläche führen.
Seit 2026-09-15 (E-E-4) tragen alle drei Stufen 925/850/700 hPa; davor führte Stufe 3 nur 850. Liegt eine Fläche unter der Modelloberfläche (p > `ps`), ist
ihr Wert eine Extrapolation — er steht unverändert im Cube, das Erkennen ist Sache des
Lesers.

**Die Ebenenliste steht im Manifest, nicht in diesem Text.** `point/index.json → planes`
nennt sie mit Skala und Versatz, `run.json` je Lauf; ein Leser zählt sie dort, er merkt
sie sich nicht. Der Container ist selbstbeschreibend — deshalb kostet eine neue Ebene
keinen Schemabruch.

### Welche Quellen einen Ingest haben

Acht Zugriffsfamilien statt einer Quellenliste — das ist der Grund, warum 22 Einträge des
Registers mit überschaubarem Aufwand versorgt werden können. `point/sources.json` führt
die vollständige Matrix mit Domänen, Horizonten und Lizenzen; `point/<lauf>/run.json`
nennt je Lauf, welche Quellen **tatsächlich** getragen haben (`sources[]`) und welche
nicht (`skipped`, `pending`, `dropped`).

| Zugriffsfamilie | Quellen | Rolle im Cube |
|---|---|---|
| DWD reguläres lat-lon-GRIB | ICON-D2, ICON-EU | Mittel + σ_div, ICON-D2 zusätzlich das Modelllevel-Profil |
| DWD ikosaedrisch (`clat`/`clon`) | ICON global, AICON | Mittel + σ_div in Stufe 2/3 |
| ECMWF `.index` + Byte-Bereiche | IFS HRES, AIFS Single | Mittel + σ_div; jenseits 180 h die tragenden Quellen |
| DWD EPS-Bündel | ICON-D2-EPS, ICON-EU-EPS, ICON-EPS global | **nur σ_ens** — das Ensemble-Mittel wäre derselbe Lauf, den der deterministische schon liefert |
| ECMWF Ensemble (50 Member, Byte-Bereiche) | IFS-ENS | **nur σ_ens**, 192–336 h |
| GeoSphere REST/HDF5 | C-LAEF, C-LAEF-EPS | Mittel + σ_div (AT/Alpenraum) bzw. q10/q90 |
| MeteoSchweiz STAC + S3 | ICON-CH1-EPS, ICON-CH2-EPS | Mittel + σ_div (CH) |
| KMZ/KML | MOSMIX-L | eigenes Produkt `point/stations/`, **nicht** im Gitter |
| bereits gespiegelt | RADVOR RV, INCA, CombiPrecip | liegen unter `radar/` — brauchen einen Leser, keinen Ingest |

Benannt offen, mit Grund im Register: MOSMIX-S (Stationsquelle wie MOSMIX-L),
KENDA-CH1 (eine **Analyse**, keine Vorhersage), GFS (Rückfall, in der Quellenmatrix nicht
als tragende Quelle geführt), AIFS-ENS (Kosten: 65,1 MiB je Größe und Schritt gegen
34,8 bei ICON-EPS global für dieselbe Aussage).

⚠️ **Ensembles gehen nie ins Mittel.** Ihr Mittel ist derselbe Modelllauf wie der schon
ingestierte deterministische; als vierter „unabhängiger" Wert ließe er σ_div schrumpfen.
Dasselbe gilt für Kontrollläufe und für C-LAEF-EPS, dessen p50 der Lauf von C-LAEF ist.

Was eine Quelle **nicht** führt, bleibt `MISSING`: ECMWF hat keine Schichtwolken und keine
Schneefallgrenze, ICON global keine Schneefallgrenze, AICON nur T, U/V, Niederschlag und
Druck, C-LAEF nur `msl` statt `ps`. Der Unterschied zu 0 ist der zwischen „unbekannt" und
„wolkenlos".

### Container

`BSPC`: Kopf (48 B) + Verzeichnis (12 B je Ebene) unkomprimiert, danach je Ebene ein
eigener `deflate-raw`-Block. Das Verzeichnis nennt Offset, Länge und den Vorstufen-Filter
(0 = roh, 1 = Zeilendifferenz — je Block gemessen gewählt). Nutzlast
`int16[nvar][nt][ny][nx]`, Größe außen. `−32768` heißt **fehlt** — nicht 0.

Warum kein `.bin.gz`: der Container komprimiert selbst, damit der Transport egal ist, ein
Client nur die gebrauchten Ebenen entpackt und Byte-Bereiche möglich bleiben.

Ein Chunk ohne seine Skala aus `point/index.json` ist Zahlensalat — dieselbe Regel wie bei
den Bildern, nur schärfer: der Algorithmus rechnet mit der Quantisierungsstufe
(`σ_quant² = Δ²/12`).

### Ein Verzeichnis ist eine Veröffentlichung

`point/<lauf>/run.json` nennt **jeden** Chunk in seinem Verzeichnis, und umgekehrt liegt
dort kein Chunk, den es nicht nennt. Der Publisher zählt das vor jedem Commit nach und
bricht sonst ab.

Der Verzeichnisname ist der **Publikationslauf**, nicht der Modelllauf. Die Stufen kommen
regelmäßig aus verschiedenen Läufen — t1 aus ICON-D2 12z, t3 aus ICON global 06z, weil die
Modelle verschieden oft rechnen. Jeder Stufeneintrag nennt deshalb seinen eigenen
Quell-Lauf:

```json
{ "id": "t3", "run": "2026090906", "runAt": "2026-09-09T06:00:00Z", "ageH": 6 }
```

`ageH` ist das Alter gegenüber dem Publikationslauf. Wer nur den Verzeichnisnamen liest,
hielte die Fernstufe für sechs Stunden jünger, als sie ist. Im Chunk-Kopf steht dieselbe
Angabe noch einmal als `runHours` — dort ist sie fälschungssicher, weil sie unter dem CRC
liegt.

⚠️ **Seit die drei Stufen eigene Jobs haben, trägt ein Laufverzeichnis oft nur EINE
Stufe.** Der Einstieg ist deshalb **`latestByTier`** im Register — nicht „der neueste
Lauf". Wer den nähme, fände für die Fernstufe regelmäßig nichts.

`point/.build/` ist die Bau-Ablage des laufenden Jobs und nie Teil einer Veröffentlichung;
der Publisher räumt sie vor dem Commit. Steht sie da, ist ein Job abgebrochen.

### Stationsprodukt — `point/stations/`

MOSMIX-L ist auf DWD-Stationen bias-korrigiert. Auf ein 0,05°-Gitter interpoliert
verschmierte diese Korrektur über die Fläche und würfe genau ihren einzigen Vorteil weg —
deshalb liegt die Quelle als **eigenes Produkt** mit **eigener Achse** daneben:
stündlich bis 247 h, also feiner und weiter als der Cube, der ab 51 h dreistündlich wird.

Ausgeliefert im selben Container (eine Stationsreihe ist ein Chunk mit `ny = 1`), gebündelt
nach dem Chunk-Raster der Stufe 1. Die Zuordnung Spalte → Station steht im Lauf-Manifest,
die Orte und Höhen in `catalog.json` — deshalb ist der Katalog von der Aufbewahrung
ausgenommen.

`hModEff` trägt hier die **Stationshöhe**: MOSMIX gilt AM Ort, es gibt keine
Höhendifferenz zu korrigieren.

### Modellhöhe je Quelle — `point/static/hmodel/v1/`

Jede Quelle hat ihre eigene Modelloberfläche, und sie weichen erheblich voneinander ab:
in derselben 0,25°-Zelle über Innsbruck nimmt ICON global 1332 m an, IFS 1402 m, AIFS
1672 m — bei 574 m echter Höhe. Der Cube trägt davon nur das **Mittel** (`hModEff`); wer
den Höhenfehler einer einzelnen Quelle korrigieren will, braucht die Spalten.

Gleicher Container, **eigene Ebenenliste** (eine Ebene je Quelle), `nt = 1`, gleiches
Chunk-Raster wie der Cube — ein Leser holt denselben `(cy, cx)`, den er ohnehin holt.
`static.json` nennt je Stufe die Spalten, ihre Herkunft und was fehlt, mit Grund.

Zwei Dinge stehen dort ausdrücklich:

* **`provenance`** unterscheidet `native` (die Quelle veröffentlicht HSURF) von
  `derived-gh-sp` (aus `gh` in `ln p` an der Stelle `p = sp` interpoliert — ECMWF
  veröffentlicht keine Orographie). Die abgeleiteten Höhen gehen **nicht** in `hModEff`.
* **`absent`** nennt je Quelle den Grund, warum sie keine Spalte hat — reine
  σ_ens-Quellen haben keine Mittelwerte zu korrigieren, GeoSphere veröffentlicht keine
  Orographie und führt kein `ps`, für AICON legt der DWD keine `time-invariant`-Datei ab.

Das Produkt wird **nicht je Lauf neu geschrieben**: der Producer vergleicht je Spalte
einen Hash und schreibt null Bytes, wenn sich nichts geändert hat. Ein Modell-Upgrade
ändert die Orographie trotzdem sichtbar.

---

## Warum es hier KEIN Geländeprodukt gibt

Dieses Repo speichert **Wetterdaten**. Gelände gehört nicht dazu — nicht weil der
Algorithmus es nicht bräuchte, sondern weil es **schon da ist**:

| Größe | wo sie herkommt |
|---|---|
| Höhe `h_true` | Terrarium-Kacheln (`elevation-tiles-prod`), von der App ohnehin in acht Modulen geladen |
| Landbedeckung, `z0`, Distanz zu Wasser | `jppetry/buscosun-worldcover`, SHA-gepinnt, seit SAT2d in Betrieb |
| TPI, SVF, Horizont, Neigung, Exposition | rechnet der Client **am Punkt** (`src/point/terrainPoint.ts`) |

`ABLAUFPLAENE.md` PAP 1 liest den Terrain-Stack **am Punkt**, nicht als Fläche. Für einen
Punkt sind SVF und Horizont acht Richtungen à ~40 Abtastungen — 320 Höhenabfragen aus
Kacheln, die im Cache liegen. Als Rasterprodukt wären es 1 920 Kacheln und ~300 MiB, die
jeder Radar- und Repack-Lauf mitzöge.

⚠️ **Nicht verwechseln — hier liegen zwei MODELL-Orographien, aber kein Gelände:**
`hsurf-v1.png` ist die Modell-Orographie der Kartenlinie (ICON-D2, 2,2 km),
`point/static/hmodel/` die des Punkt-Cubes je Quelle. Beides sind Wetterdaten und etwas
anderes als das echte Gelände. PAP 4 rechnet `h_true − h_mod_eff` und braucht beide, aus
verschiedenen Quellen.

Offen bleibt der Versiegelungsgrad (GHS-BUILT-S) und die Verdrängungshöhe (GHS-BUILT-H) —
in keiner Quelle greifbar, die die App schon hat, und damit auch der Wärmeinsel- und der
zweistufige Windterm aus PAP 5 (E-13).

---

## Aufbewahrung

**In diesem Repo liegen nur frische Daten** — was herausfällt, ist reproduzierbar.

Das begrenzt das **Alter eines Laufs**, nicht seinen **Horizont**: ein Lauf von heute
trägt weiterhin 0–336 h; er fällt heraus, sobald er selbst zu alt ist.

| Linie | Regel | vorgehalten |
|---|---|---|
| `point/` Stufe 1 | Alter ≤ **9 h**, mindestens 2 Läufe | ≈ 3 Läufe bei acht Slots |
| `point/` Stufe 2 | Alter ≤ **24 h**, mindestens 2 Läufe | ≈ 4 Läufe |
| `point/` Stufe 3 | Alter ≤ **24 h**, mindestens 2 Läufe | 2 Läufe |
| `point/stations/` | Alter ≤ 24 h, mindestens 2 Läufe | ≈ 4 Läufe |
| `runs/` | `keep: 4` | ≈ 12 h |
| `radar/` | `keep: 12` Schritte | ≈ 1 h |

**Je Stufe**, weil die Stufen verschieden oft kommen: Stufe 1 achtmal täglich à ≈ 75 MiB
würde bei 24 h acht Läufe halten und den Arbeitsbaum sprengen; die Fernstufe kommt
zweimal täglich und braucht die vollen 24 h, um überhaupt zwei Läufe zu haben.

**Alter statt Anzahl**, weil `keep: N` am Takt hängt: ändert sich die Zahl der Slots,
ändert sich die vorgehaltene Zeit, ohne dass jemand die Regel angefasst hätte.

**Mindestens zwei Läufe bleiben immer stehen**, auch wenn sie die Frist reißen. Fallen
mehrere Publishes hintereinander aus (V-BW-58: 2026-09-04 dreimal, 15z ganz), altern sonst
ALLE Läufe heraus — und ein leeres Repo ist schlimmer als ein altes. Der Publisher meldet
überalterte Läufe ausdrücklich, statt sie zu verschweigen.

**Zeitlos und deshalb ausgenommen** (`point/index.json → timeless` führt die Liste
maschinenlesbar): `point/stations/catalog.json`, `point/sources.json`, `point/calib.json`,
`point/index.json`, **alles unter `point/static/`**, `hsurf-v1.png`, `index.json`. Ein
Stationskatalog ist nicht „von gestern" — würde die Regel blind gelten, wäre er nach einem
Tag weg und jedes Stationsbündel unlesbar, weil die Zuordnung Spalte → Station dort steckt.

Jeder Publish der Karten- und der Punktlinie schreibt eine **frische Historie** und
force-pusht sie, damit das Repo nicht linear wächst.

Es geht nichts verloren: alle Dateien sind aus den Rohdaten reproduzierbar, und die
Anwendung fällt bei jedem Fehlgriff auf den direkten Quellpfad zurück.

---

## Takt und Frische

**Kartenlayer (BW-9):** Der Batch startet zu den acht ICON-D2-Laufstunden bei Lauf + 20 min —
sicher vor den Daten — und wartet im Job erst auf den Lauf, dann auf die fehlenden Schritte
(DWD: Schritt 000 bei + 44 min, Schritt 027 bei ≈ + 66 min, gemessen an acht Läufen).
GitHubs Startverzögerung (7–31 min) fällt so in die Wartezeit. Ein zweiter Slot bei
Lauf + 150 min ist das Sicherheitsnetz.

**Punkt-Cube:** drei Jobs, weil die drei Stufen an drei verschiedenen Quellen hängen und
ein gemeinsamer Takt für jede von ihnen der falsche wäre. Die Slots sind aus der
**gemessenen** Bereitstellung abgeleitet, nicht gesetzt:

| Job | Slot (UTC) | tragende Quelle | gemessene Bereitstellung |
|---|---|---|---|
| Stufe 1 | `:40` der Stunden 1, 4, 7, 10, 13, 16, 19, 22 | ICON-D2 | Lauf + 1,36 h ⇒ 18 min Rand |
| Stufe 2 (+ Stationen) | `:30` der Stunden 4, 10, 16, 22 | ICON-EU, MOSMIX-L | ICON-EU Lauf + 3,60…3,70 h ⇒ 48 min Rand; MOSMIX-L (03/09/15/21z) Lauf + 73…76 min ⇒ 14 min Rand. Bis 2026-09-14 lag der Slot bei `:50` der Stunden 3, 9, 15, 21 — 27 min VOR MOSMIX-L, das Stationsprodukt trug immer den Vorlauf (7 h alt) |
| Stufe 3 | `:55` der Stunden 9, 21 | IFS `oper` | Lauf + 7,57 h; 336 h liefern nur 00z und 12z |

Alle drei teilen eine Concurrency-Gruppe — sie können sich nie überlappen — und halten
Abstand zum Force-Push der Kartenlinie, der alles überschriebe, was zwischen Klon und Push
im Repo ankommt.

⚠️ Zwei Quellen sind zum Slot **noch nicht fertig** und kommen aus dem vorigen Zyklus:
ICON-D2-EPS (+ 2,17 h) und C-LAEF (+ 4,9 h). Das ist kein Ausfall — je Quelle steht
`runAt` und `offsetH` im Lauf-Manifest, und gelesen wird in **Gültigzeit**, nicht in
Vorhersagestunden.

Nach jedem Push purgt der Publisher `index.json` auf jsDelivr und prüft nach, dass das CDN
den neuen Commit liefert.

⚠️ `.github/workflows/*.yml` kann ein Batch **nicht selbst** aktualisieren (eine Action
darf ohne `workflows`-Scope keine Workflow-Datei pushen). Weichen die Vorlagen
`buscosun-web/scripts/repack-repo/workflow-*.yml` ab, ist ein manueller Commit nötig —
sonst läuft der alte Stand weiter. Dasselbe gilt für dieses README und für
`scripts/radar-mirror.mjs`: beide sind Kopien aus dem Anwendungs-Repo.

---

## Daten und Lizenz

| Linie | Quelle | Lizenz |
|---|---|---|
| `runs/`, `point/` (ICON, MOSMIX) | **Deutscher Wetterdienst**, <https://opendata.dwd.de> | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) / GeoNutzV |
| `radar/rv`, `radar/konrad3d` | Deutscher Wetterdienst | CC BY 4.0 |
| `point/` (C-LAEF), `radar/img/v1/inca` | GeoSphere Austria | CC BY 4.0 |
| `point/` (ICON-CH1/CH2), `radar/img/v1/rzc` | MeteoSchweiz | CC BY 4.0 |
| `point/` (IFS/AIFS) | ECMWF Open Data | CC BY 4.0, ECMWF Terms of Use |

Die Daten wurden **verändert**: räumlich abgetastet, quantisiert und umkodiert.
Sie sind **nicht** für amtliche Zwecke geeignet.

Die Producer liegen im Anwendungs-Repo:

- [`scripts/repack-icon-d2.mjs`](https://github.com/jppetry/buscosun-web/blob/main/scripts/repack-icon-d2.mjs) — Kartenlayer
- [`scripts/radar-mirror/radar-mirror.mjs`](https://github.com/jppetry/buscosun-web/blob/main/scripts/radar-mirror/radar-mirror.mjs) — Radar
- [`scripts/point/build-point-cube.mjs`](https://github.com/jppetry/buscosun-web/blob/main/scripts/point/build-point-cube.mjs) — Punkt-Cube
- [`scripts/point/build-stations.mjs`](https://github.com/jppetry/buscosun-web/blob/main/scripts/point/build-stations.mjs) — Stationsprodukt
- [`scripts/point/publish-point.mjs`](https://github.com/jppetry/buscosun-web/blob/main/scripts/point/publish-point.mjs) — Veröffentlichung und Aufbewahrung der Punktlinie
