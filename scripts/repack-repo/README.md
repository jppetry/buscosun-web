# buscosun-data

Vorprozessierte Wetterdaten für [buscosun.com](https://buscosun.com).

**Dieses Repo enthält keinen Anwendungscode.** Es ist ein reiner Datenspeicher,
ausgeliefert über [jsDelivr](https://www.jsdelivr.com/). Drei Produktlinien mit drei
verschiedenen Takten und drei verschiedenen Zwecken:

| Linie | Verzeichnis | Achse | Takt | Wer schreibt |
|---|---|---|---|---|
| **Kartenlayer** | `runs/`, `index.json`, `hsurf-v1.png` | Fläche je Zeitpunkt | 8 × täglich | `.github/workflows/build.yml` |
| **Radar-Spiegel** | `radar/` | Fläche je Zeitpunkt, Minuten | alle 1–2 min | `.github/workflows/radar.yml` |
| **Punkt-Cube** | `point/` | **Zeitreihe je Ort** | 4 × täglich | `.github/workflows/point.yml` |

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
baut, greift ins Leere. (In der neuen Linie `point/` gilt diese Ausnahme nicht — dort
ist der Schlüssel immer der Pfad.)

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
point/index.json          Manifest: Läufe, Stufen, Ebenen mit Skala, Commit
point/sources.json        Quellenmatrix maschinenlesbar (Domänen, Horizonte, Lizenzen)
point/calib.json          Kalibrierung mit Herkunft je Wert (null = unbekannt, nie 0)
point/<lauf>/run.json     Zeiger auf den Lauf
point/<lauf>/t1/<cy>_<cx>.bin   Stufe 1 — 0,05°, 0–48 h stündlich
point/<lauf>/t2/<cy>_<cx>.bin   Stufe 2 — 0,10°, 51–120 h dreistündlich
point/<lauf>/t3/<cy>_<cx>.bin   Stufe 3 — 0,25°, 126–336 h sechsstündlich
```

**Drei Auflösungsstufen**, weil die Quellen drei Auflösungen haben: ICON-D2 ist 2,2 km,
IFS ist 0,25°. Eine Punktabfrage lädt **drei** Dateien — eine je Stufe.

**Welche Quellen einen Ingest haben** (Stand 2026-09-09) — `point/sources.json` führt
die vollständige Matrix mit Domänen, Horizonten und Lizenzen, `point/<lauf>/run.json`
je Lauf, welche davon tatsächlich getragen haben:

| Zugriffsfamilie | Quellen | Ingest |
|---|---|---|
| DWD reguläres lat-lon-GRIB | ICON-D2, ICON-EU | ✓ |
| DWD ikosaedrisch (`clat`/`clon`) | ICON global, AICON | ✓ |
| ECMWF `.index` + Byte-Bereiche | IFS HRES, AIFS Single | ✓ |
| ECMWF Ensemble | IFS ENS, AIFS ENS | Adapter da, **bewusst nicht im Mittel** — nur der Kontrolllauf ist lesbar, und der ist fast identisch zum jeweiligen deterministischen Lauf; als eigener Wert würde er σ schrumpfen lassen |
| Stationsquelle | MOSMIX-L | offen (anderes Datenmodell) |
| Fremd-API | C-LAEF, ICON-CH1/CH2 | offen |
| bereits gespiegelt | RADVOR RV, INCA, CombiPrecip | liegen unter `radar/` — brauchen einen Leser, keinen Ingest |

Was eine Quelle **nicht** führt, bleibt `MISSING`: ECMWF hat keine Schichtwolken und
keine Schneefallgrenze, ICON global keine Schneefallgrenze, AICON nur T, U/V,
Niederschlag und Druck. Der Unterschied zu 0 ist der zwischen „unbekannt" und
„wolkenlos".

**Container** (`BSPC`): Kopf (48 B) + Verzeichnis (12 B je Ebene) unkomprimiert, danach je
Ebene ein eigener `deflate-raw`-Block. Das Verzeichnis nennt Offset, Länge und den
Vorstufen-Filter (0 = roh, 1 = Zeilendifferenz). Nutzlast `int16[nvar][nt][ny][nx]`,
Größe außen. `−32768` heißt **fehlt** — nicht 0.

Warum kein `.bin.gz`: der Container komprimiert selbst, damit der Transport egal ist,
ein Client nur die gebrauchten Ebenen entpackt und Byte-Bereiche möglich bleiben.

Ein Chunk ohne seine Skala aus `point/index.json` ist Zahlensalat — dieselbe Regel wie
bei den Bildern, nur schärfer: der Algorithmus rechnet mit der Quantisierungsstufe
(`σ_quant² = Δ²/12`).

### Ein Verzeichnis ist eine Veröffentlichung

`point/<lauf>/run.json` nennt **jeden** Chunk in seinem Verzeichnis, und umgekehrt liegt
dort kein Chunk, den es nicht nennt. Der Publisher zählt das vor jedem Commit nach und
bricht sonst ab.

Der Verzeichnisname ist der **Publikationslauf**, nicht der Modelllauf. Die drei Stufen
kommen regelmäßig aus verschiedenen Läufen — t1 aus ICON-D2 12z, t3 aus ICON global 06z,
weil die Modelle verschieden oft rechnen. Jeder Stufeneintrag nennt deshalb seinen
eigenen Quell-Lauf:

```json
{ "id": "t3", "run": "2026090906", "runAt": "2026-09-09T06:00:00Z", "ageH": 6 }
```

`ageH` ist das Alter gegenüber dem Publikationslauf. Wer nur den Verzeichnisnamen liest,
hielte die Fernstufe für sechs Stunden jünger, als sie ist. Im Chunk-Kopf steht dieselbe
Angabe noch einmal als `runHours` — dort ist sie fälschungssicher, weil sie unter dem
CRC liegt.

Vorgehalten wird, was **jünger als 24 Stunden** ist — mindestens aber zwei Läufe, damit
ein Ausfall nicht in ein leeres Verzeichnis mündet. Siehe „Aufbewahrung".

---

## Warum es hier KEIN Geländeprodukt gibt

Dieses Repo speichert **Wetterdaten**. Gelände gehört nicht dazu — nicht weil der
Algorithmus es nicht bräuchte, sondern weil es **schon da ist**:

| Größe | wo sie herkommt |
|---|---|
| Höhe `h_true` | Terrarium-Kacheln (`elevation-tiles-prod`), von der App ohnehin in acht Modulen geladen |
| Landbedeckung, `z0`, Distanz zu Wasser | `jppetry/buscosun-worldcover`, SHA-gepinnt, seit SAT2d in Betrieb |
| TPI, SVF, Horizont, Neigung, Exposition | rechnet der Client **am Punkt** (`src/point/terrainPoint.ts`) |

`ABLAUFPLAENE.md` PAP 1 liest den Terrain-Stack **am Punkt**, nicht als Fläche. Für
einen Punkt sind SVF und Horizont acht Richtungen à ~40 Abtastungen — 320 Höhenabfragen
aus Kacheln, die im Cache liegen. Als Rasterprodukt wären es 1 920 Kacheln und ~300 MiB,
die jeder Radar- und Repack-Lauf mitzöge.

⚠️ Nicht verwechseln: **`hsurf-v1.png` ist die MODELL-Orographie** (ICON-D2, 2,2 km), ein
Wetterdatum — und ein anderes Ding als das echte Gelände. PAP 4 rechnet
`h_true − h_mod_eff` und braucht beide, aus verschiedenen Quellen.

Offen bleibt der Versiegelungsgrad (GHS-BUILT-S) und die Verdrängungshöhe
(GHS-BUILT-H) — in keiner Quelle greifbar, die die App schon hat, und damit auch der
Wärmeinsel- und der zweistufige Windterm aus PAP 5 (E-13).

---

## Aufbewahrung — 24 Stunden, quellenunabhängig

**In diesem Repo liegen nur Daten der letzten 24 Stunden**, gleich aus welcher Quelle.

Das begrenzt das **Alter eines Laufs**, nicht seinen **Horizont**: ein Lauf von heute
trägt weiterhin 0–336 h; er fällt heraus, sobald er selbst älter als 24 h ist.

| Linie | Regel | vorgehalten |
|---|---|---|
| `point/` | Alter ≤ 24 h, mindestens 2 Läufe | ≈ 4 Läufe bei vier Slots |
| `runs/` | `keep: 4` | ≈ 12 h — liegt unter der Decke |
| `radar/` | `keep: 12` Schritte | ≈ 1 h |

**Alter statt Anzahl**, weil `keep: N` am Takt hängt: ändert sich die Zahl der Slots,
ändert sich die vorgehaltene Zeit, ohne dass jemand die Regel angefasst hätte.

**Mindestens zwei Läufe bleiben immer stehen**, auch wenn sie die 24 h reißen. Fallen
mehrere Publishes hintereinander aus (V-BW-58: 2026-09-04 dreimal, 15z ganz), altern
sonst ALLE Läufe heraus — und ein leeres Repo ist schlimmer als ein altes. Der Publisher
meldet überalterte Läufe ausdrücklich, statt sie zu verschweigen.

**Zeitlos und deshalb ausgenommen:** `point/stations/catalog.json`, `point/sources.json`,
`point/calib.json`, `point/index.json`, `hsurf-v1.png`, `index.json`. Ein Stationskatalog
ist nicht „von gestern" — würde die Regel blind gelten, wäre er nach einem Tag weg und
jedes Stationsbündel unlesbar, weil die Zuordnung Spalte → Station dort steckt.

Jeder Publish der Karten- und der Punktlinie schreibt eine **frische Historie** und
force-pusht sie, damit das Repo nicht linear wächst.

Es geht nichts verloren: alle Dateien sind aus den Rohdaten reproduzierbar, und die
Anwendung fällt bei jedem Fehlgriff auf den direkten Quellpfad zurück.

---

## Takt und Frische (BW-9)

Der Karten-Batch startet zu den acht ICON-D2-Laufstunden bei Lauf + 20 min — sicher vor
den Daten — und wartet im Job erst auf den Lauf, dann auf die fehlenden Schritte (DWD:
Schritt 000 bei + 44 min, Schritt 027 bei ≈ + 66 min, gemessen an acht Läufen). GitHubs
Startverzögerung (7–31 min) fällt so in die Wartezeit. Ein zweiter Slot bei Lauf + 150 min
ist das Sicherheitsnetz.

Der Punkt-Batch läuft **vier** Slots am Tag, davon zwei mit voller Reichweite: 336 h
liefern nur die IFS-Läufe 00 und 12 UTC (06/18 UTC enden bei 144 h).

Nach jedem Push purgt der Publisher `index.json` auf jsDelivr und prüft nach, dass das CDN
den neuen Commit liefert.

⚠️ `.github/workflows/*.yml` kann ein Batch **nicht selbst** aktualisieren (eine Action
darf ohne `workflows`-Scope keine Workflow-Datei pushen). Weichen die Vorlagen
`buscosun-web/scripts/repack-repo/workflow-*.yml` ab, ist ein manueller Commit nötig —
sonst läuft der alte Stand weiter.

---

## Daten und Lizenz

| Linie | Quelle | Lizenz |
|---|---|---|
| `runs/`, `point/` (ICON) | **Deutscher Wetterdienst**, <https://opendata.dwd.de> | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) / GeoNutzV |
| `radar/rv`, `radar/konrad3d` | Deutscher Wetterdienst | CC BY 4.0 |
| `radar/img/v1/inca` | GeoSphere Austria | CC BY 4.0 |
| `radar/img/v1/rzc` | MeteoSchweiz | CC BY 4.0 |
| `point/` (IFS/AIFS) | ECMWF Open Data | CC BY 4.0, ECMWF Terms of Use |

Die Daten wurden **verändert**: räumlich abgetastet, quantisiert und umkodiert.
Sie sind **nicht** für amtliche Zwecke geeignet.

Die Producer liegen im Anwendungs-Repo:

- [`scripts/repack-icon-d2.mjs`](https://github.com/jppetry/buscosun-web/blob/main/scripts/repack-icon-d2.mjs) — Kartenlayer
- [`scripts/radar-mirror/radar-mirror.mjs`](https://github.com/jppetry/buscosun-web/blob/main/scripts/radar-mirror/radar-mirror.mjs) — Radar
- [`scripts/point/build-point-cube.mjs`](https://github.com/jppetry/buscosun-web/blob/main/scripts/point/build-point-cube.mjs) — Punkt-Cube
