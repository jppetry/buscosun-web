# Punktdaten aus dem Daten-Repo für buscosun Fusion (Phase PD)

> **Status: PD0 (Diagnose, §1–§11) · PD-A (Datenbedarf aus den Ablaufplänen, §12–§21) · PD1 (Fundament umgesetzt, §22) · PD3–PD5 (Adapter-Schicht, §23).**
> Auftrag Jans (2026-09-09, erster Teil): prüfen, wie weit `jppetry/buscosun-data` erweitert werden muss,
> damit **buscosun Fusion** alle Modelle von 0 bis 336 h **aus dem Daten-Repo** bezieht —
> in welchen Formaten die Daten zwingend abgelegt werden müssen und wie viele Läufe.
>
> **Zweiter Auftrag Jans (2026-09-09, nachmittags):** `ABLAUFPLAENE.md` (sechs DIN-66001-Ablaufpläne
> des Fusions- und Downscaling-Algorithmus) und `QUELLENMATRIX.md` (Primärquellen je Standortland und
> Vorhersagestunde) liegen in der Repo-Wurzel. Daraus ist der **vollständige** Datenbedarf abzuleiten,
> gegen den Bestand von `buscosun-data` zu prüfen und das Repo auf einen Stand zu bringen, auf dem es
> die Daten dauerhaft trägt. **Der Algorithmus selbst wird in diesem Arbeitspaket nicht angefasst.**
>
> **Dritter Auftrag Jans (2026-09-09, abends):** die vollständige Tabelle aus `QUELLENMATRIX.md` §1
> in `buscosun-data` abbilden — alle Quellen, alle acht Bänder. Stand in §23.

**Abgrenzung zu PA (`audit/punktarchiv.md`):** PA archiviert *vergangene* Vorhersagen zur
**Verifikation** in `buscosun-archiv`. PD versorgt die **Laufzeit** aus `buscosun-data`.
Zwei Repos, zwei Zwecke, gemeinsame Sammler-Logik — aber nicht dasselbe Problem.
Wo PA v1 schon Quellen benennt (§4.2 dort), ist PD deckungsgleich; das ist Absicht.

---

## §1 Diagnose

### 1.1 Der Kernbefund: buscosun Fusion liest das Daten-Repo heute nicht

Ausgelesen aus `src/pointForecast/pointForecast.ts` — die einzigen Quell-Aufrufe im Produktivpfad:

| Aufruf | Quelle | Origin | Horizont |
|---|---|---|---|
| `fetchBrightSkyPointForecast` | MOSMIX der nächsten DWD-Station | `api.brightsky.dev` | ~240 h |
| `fetchIncaPoint` | GeoSphere INCA Nowcast | `dataset.api.hub.geosphere.at` | 3 h |
| `fetchAromePoint` | GeoSphere AROME 2,5 km | `dataset.api.hub.geosphere.at` | 60 h |
| `fetchNearestStationObs` / `fetchStationHistory` | DWD POI, TAWES, SMN | Fremd-Origins | Messung |
| `fetchGfsPointTail` | GFS deterministisch | `/_gfs`-Proxy → NOAA-S3 | 240–372 h |
| `fetchDwdUvPoint` | DWD UV | DWD | — |

**Kein einziger Abruf geht an `cdn.jsdelivr.net` oder an `buscosun-data`.** Das Daten-Repo
bedient ausschließlich die Kartenlayer; die Punktvorhersage läuft vollständig an ihm vorbei.

Zwei Folgebefunde am Code:

- **`fetchOpenMeteoPoint` existiert, hat aber keinen Aufrufer** (`grep -rn` über `src/`: eine
  Fundstelle, die Definition). Der Kommentar in `sampleSources.ts:118` sagt es selbst:
  *„Open-Meteo path is opt-in only anyway."* Für D-18/NC-Lizenz ist das die gute Nachricht —
  aber es ist ein Leser ohne Schreiber, dasselbe Muster wie **V-SH-11**. → **V-PD-1**
- **`fetchAromePoint` zieht `nwp-v1-1h-2500m`** — genau den Datensatz, den GeoSphere
  **im November 2026 abschaltet**. Nachfolger ist `nwp-v2-1h-1km` (C-LAEF AlpeAdria, 1 km statt
  2,5 km, gleiche Domain-Logik). Das ist unabhängig von PD ein Termin. → **V-PD-2**

### 1.2 Was heute im Daten-Repo liegt

Gemessen an `index.json`, vier `repack.json` und `radar/status.json` (Stand 2026-09-09, 09:47 UTC):

| Familie | Format | Schritte je Lauf | Dateien |
|---|---|---|---|
| `wind` | PNG RGB (R=u, G=v), Normierung **je Schritt** | 0–12 (13) | 52 |
| `temp` | PNG Grau+Alpha, −20…40 °C | 0–24 (25) | 100 |
| `gust` | PNG Grau+Alpha, 0…40 m/s | 0–24 (25) | 100 |
| `precip` | PNG, volle Auflösung, mit `ref` zum Deakkumulieren | 0–26/27 | 110 |
| `cape` | PNG, eigenes Gitter | 0–27 (28) | 112 |
| `thunder`, `rotation`, `lpi`, `snowdepth`, `snowfresh` | PNG Grau+Alpha | 12–25 | 344 |
| Radar `rv` / `inca` / `rzc` / `konrad3d` | PNG + JSON | ≤ 3 h | 517 |

Gitter: `ni 1215 × nj 746`, **Subsampling `ss 2`** → 608 × 373 px. Vier Läufe (`keep: 4`),
≈ 144 MiB gepackt, ein Zweig, ein Pusher, ≈ 42 Pushes/h.

### 1.3 Drei Gründe, warum die heutigen Dateien für Punktabfragen nicht taugen

Nicht die Qualität ist das Problem, sondern die **Zugriffsform**.

**(1) Feld-orientiert statt zeitreihen-orientiert.** Ein PNG ist *eine Fläche zu einem Zeitpunkt*.
Eine Punktvorhersage braucht *einen Ort über alle Zeitpunkte*. Eine 336-h-Reihe über neun
Zielgrößen aus dieser Ablage zu holen hieße, für **jeden** Schritt und **jede** Größe ein
eigenes Bild zu laden: bei 109 Schritten × 9 Größen ≈ **981 Abrufe** für einen einzigen Punkt.
Das ist nicht eine Frage der Optimierung, sondern der falschen Achse.

**(2) Der Horizont endet bei 27 h.** Für 0–336 h fehlen ICON-EU (48–120 h), ICON global und
AICON (120–180 h), IFS/AIFS (180–336 h) und MOSMIX als Punktquelle **vollständig**.
`wind` endet sogar schon bei 12 h.

**(3) Der Taupunkt fehlt — und die Fusion rechnet mit ihm.** `src/pointForecast/types.ts:34`
begründet das ausdrücklich: *„buscosun Fusion rechnet mit dem TAUPUNKT statt mit der relativen
Feuchte: er ist unbeschränkt, additiv und höhenkorrigierbar."* Keine der zehn Familien führt
ihn, und aus den vorhandenen Feldern ist er nicht rekonstruierbar.

### 1.4 Was das für die Frage bedeutet

Die Frage „wie weit muss das Repo erweitert werden" hat deshalb keine Antwort der Form
„drei Familien mehr". Für die Karte ist die bestehende Ablage richtig und bleibt es.
Für die Punktvorhersage braucht es eine **zweite Produktlinie im selben Repo**, die nach der
anderen Achse geschnitten ist.

---

## §2 Zielbild

```
buscosun-data/
  index.json              ← bleibt: Manifest der Kartenlayer
  runs/<lauf>/*.png       ← bleibt unverändert (2D-Karte)
  radar/…                 ← bleibt unverändert
  point/                  ← NEU
    index.json            Manifest der Punktdaten (eigenes Schema, eigener Takt)
    <lauf>/
      grid.json           Gitterdefinition, Zeitachse, Skalierung je Größe
      c/<zz>/<yy>_<xx>.bin   Chunk: räumlicher Block × alle Zeitschritte × Größen
```

Sechs Grundsätze:

1. **Zwei Achsen, zwei Ablagen.** `runs/` ist Fläche-je-Zeitpunkt, `point/` ist Zeitreihe-je-Ort.
   Beide aus demselben Ingest, keine doppelte Datenbeschaffung.
2. **Ein Chunk beantwortet eine Punktabfrage.** Ein Abruf, nicht 981.
3. **Fusioniert und bias-korrigiert wird offline**, auf Gitterebene. Der Client bekommt
   Median und Streuung, nicht neun Rohmodelle.
4. **Das Terrain-Downscaling bleibt im Browser** — nur es braucht die exakte Punktposition.
5. **Adressierung über den Commit-SHA**, wie heute (`index.json:commit`, jsDelivr `immutable`).
6. **Der Altpfad bleibt** (Flag-Gating, „Rule 2"): die Fremd-Origins bleiben Fallback, bis der
   CDN-Pfad verifiziert ist.

---

## §3 Formate — was zwingend ist

### 3.1 Warum nicht PNG

PNG ist für die Karte richtig: der Browser dekodiert es in Hardware, es geht direkt in eine
Textur. Für Punktdaten trifft keins davon zu — die Werte werden gelesen, nicht gezeichnet.
Dazu drei harte Gründe:

| Grund | Wirkung |
|---|---|
| **8-bit-Quantisierung je Kanal** | `temp` über −20…40 °C ergibt bei einem Kanal 0,235 K je Stufe. Die Fusion arbeitet mit Fehlern von 0,3–0,9 K — der Quantisierungsfehler wäre ein Drittel des Signals. Grau+Alpha als 16 bit wäre möglich, ist aber eine Konvention, die man dokumentieren und verifizieren muss. |
| **Normierung je Schritt** (`wind`) | `uMin/uMax` wechseln von Schritt zu Schritt. Für ein Bild ist das effizient, für eine Zeitreihe heißt es: 109 Skalierungen je Reihe mitführen. |
| **Achsenbruch** | Ein Zeitreihen-PNG wäre ein 1×109-Bild — PNG-Header und Filterzeilen kosten dann mehr als die Nutzlast. |

### 3.2 Das Format, das ich empfehle

**Roh-Binär, ganzzahlig skaliert, gzip-komprimiert, mit JSON-Manifest.** Dasselbe Prinzip,
das PA §3.2 für die Slot-Dateien vorsieht — spaltenweise, ganzzahlig skaliert.

```
point/<lauf>/c/<zz>/<yy>_<xx>.bin.gz

Kopf (48 B):  magic "BSPT" | schema u16 | lauf u32 (Stunden seit Epoche)
              | y0,x0 u16 | ny,nx u8 | nt u16 | nvar u8 | reserviert
Daten:        int16[nvar][nt][ny][nx]   — Reihenfolge ist Absicht:
                                          eine Größe über die Zeit liegt zusammen
```

**Zwingend an diesem Format:**

| Anforderung | Warum zwingend |
|---|---|
| **int16, nicht int8** | siehe 3.1 — 8 bit unterschreiten die Auflösung, die die Fusion braucht |
| **Skalierung je Größe im Manifest**, nicht je Schritt | eine Reihe muss mit *einer* Konstante lesbar sein |
| **Sentinel für „fehlt"** (`-32768`) | eine Quelle, die eine Größe nicht führt, ist nicht dasselbe wie 0 — die Fusion muss den Unterschied sehen (`PointSourceSample`: `null` = Quelle trägt die Variable nicht) |
| **Variable am äußersten Index** | der Client lädt oft nur T und Niederschlag; die Wolken sollen überspringbar sein |
| **gzip, nicht brotli** | jsDelivr liefert vorkomprimierte `.gz`-Dateien nicht transparent aus; gzip lässt sich im Browser mit `DecompressionStream('gzip')` ohne Abhängigkeit lesen — im Repo läuft `bz2`, aber nicht für diesen Pfad |
| **Ein Manifest je Lauf** (`grid.json`) | ⚠ **Die Lehre aus dem README des Daten-Repos gilt hier genauso:** „Ein Bild ohne seinen Eintrag in `index.json` ist bedeutungslos." Ein Chunk ohne Skalierung und Zeitachse ist Zahlensalat. |
| **Zeitachse als absolute Zeitstempel**, nicht als Schrittnummern | die Fusion mischt Quellen mit verschiedenen Lauf-Zeitpunkten; eine Schrittnummer ohne Lauf ist mehrdeutig (dieselbe Falle wie beim Globus in SH4) |

**Nicht zwingend, aber empfohlen:** Zeitschritte an den Modellhorizonten schneiden statt
gleichmäßig — 0–48 h stündlich, 48–120 h dreistündlich, 120–336 h sechsstündlich. Das sind
**109 Schritte** statt 337 und wirft nichts weg, weil die Quellen jenseits 120 h nativ nicht
feiner sind.

### 3.3 Das Manifest

```jsonc
{
  "schema": 1,
  "commit": "…",                       // wie index.json: adressiert wird über den SHA
  "run": "2026090900", "runAt": "…Z",
  "grid": { "lat0": 45.8, "lon0": 5.9, "dLat": 0.1, "dLon": 0.1, "ny": 93, "nx": 113 },
  "chunk": { "ny": 8, "nx": 8 },
  "time":  [ "2026-09-09T00:00Z", … ], // 109 absolute Zeitstempel
  "vars": [
    { "id": "t2m",  "unit": "degC", "scale": 0.01, "offset": 0 },
    { "id": "td2m", "unit": "degC", "scale": 0.01, "offset": 0 },
    { "id": "u10",  "unit": "m/s",  "scale": 0.01, "offset": 0 },
    …
  ],
  "sources": [ { "id": "icon_d2", "from": 0, "to": 48, "runAt": "…" }, … ],
  "profile": { "gammaEff": …, "zBase": …, "zInv": …, "dTInv": …, "hModEff": … }
}
```

`sources` ist nicht Zierrat: es ist die **Herkunftsinformation**, die das Produkt ohnehin
ausweisen muss (Ehrlichkeit ist Produktprinzip), und es sagt dem Client, ab welcher Stunde
welches Modell trägt.

---

## §4 Was fehlt — Quellen und Größen

### 4.1 Quellen je Bereich

| Bereich | Quelle | heute im Repo | Aufwand |
|---|---|---|---|
| 0–48 h | ICON-D2 | ⚠ nur bis 24–27 h, `wind` bis 12 h | Schrittliste erweitern, Decoder existiert |
| 0–33 h | ICON-CH1-EPS (CH) | ✗ | ecCodes/ikosaedrisch — **neuer Ingest-Baustein** |
| 0–60 h | C-LAEF AlpeAdria (AT, 1 km) | ✗ | API liefert Punkt-Zeitreihen direkt |
| 48–120 h | ICON-EU | ✗ | reguläres Gitter, gleicher Decoder |
| 33–120 h | ICON-CH2-EPS (CH) | ✗ | wie CH1 |
| 120–180 h | ICON global + **AICON** | ✗ | ikosaedrisch, CDO-Gewichte des DWD nötig |
| 180–336 h | **IFS HRES + ENS, AIFS** | ✗ | `.index`-Byte-Bereiche, sonst 60 GB/Tag |
| 0–240 h | **MOSMIX-L** (Punktquelle) | ✗ | KMZ je Station, kein Gitter |
| 0–3 h | Radar / INCA-Nowcast | ✓ vorhanden | bereits im Repo |

### 4.2 Größen je Stunde

Aus `PointSourceSample` (`types.ts`) — was die Fusion tatsächlich liest:

| Größe | heute als Kartenfamilie | für Punktdaten |
|---|---|---|
| `temperature` | ✓ `temp` (0–24 h) | erweitern auf 336 h |
| **`dewPoint`** | ✗ | **neu — die Fusion rechnet darauf** |
| `u`, `v` | ✓ `wind` (0–12 h) | erweitern, Normierung vereinheitlichen |
| `gust` | ✓ `gust` (0–24 h) | erweitern |
| `precipitation` | ✓ `precip` (0–27 h) | erweitern, `ref`-Deakkumulation im Ingest auflösen |
| `cloudLow/Mid/High` | ✗ | neu |
| `snowLine` | ✗ | neu (AROME/ICON `snowlmt`); ab 120 h abgeleitet |
| `relativeHumidity` | ✗ | entfällt — aus T und Td rechenbar |
| Profilfelder (5) | ✗ | neu, für das Downscaling im Browser |

---

## §5 Läufe und Takte

Jans Frage „wie viele Läufe" hat zwei getrennte Antworten.

### 5.1 Für die Auslieferung: zwei

| | Empfehlung | Begründung |
|---|---|---|
| **Vorgehalten** | **2 Läufe** (aktueller + Vorgänger) | Der Vorgänger ist der Fallback, wenn ein Publish scheitert — und **V-BW-58 belegt, dass das passiert** (2026-09-04 dreimal, 15z fiel ganz aus, die Karte stand sechs Stunden auf 12z). Ein einziger Lauf hätte dort eine Lücke bedeutet. Mehr als zwei nützt der Laufzeit nichts. |
| **Heute `runs/`** | `keep: 4` | bleibt wie es ist — andere Linie, andere Begründung |

### 5.2 Wie oft ein Punktlauf gebaut wird: vier

Der Takt richtet sich nach der **langsamsten tragenden Quelle**, nicht nach der schnellsten.
Für 0–336 h ist das IFS: 336 h liefern nur die Läufe **00 und 12 UTC** (`oper`, 360 h);
06 und 18 UTC enden bei 144 h (`scda`).

| Slot (UTC) | ICON-D2 | ICON-EU | ICON global / AICON | MOSMIX-L | IFS | Reichweite |
|---|---|---|---|---|---|---|
| **02** | 00z | 00z (120 h) | 00z (180 h) | 21z/03z | **00z (360 h)** | **volle 336 h** |
| 08 | 06z | 06z (120 h) | 06z (120 h) | 03z/09z | 06z (144 h) | bis 144 h |
| **14** | 12z | 12z (120 h) | 12z (180 h) | 09z/15z | **12z (360 h)** | **volle 336 h** |
| 20 | 18z | 18z (120 h) | 18z (120 h) | 15z/21z | 18z (144 h) | bis 144 h |

**Vier Slots am Tag, davon zwei mit voller Reichweite.** Die beiden Zwischenslots aktualisieren
den Kurz- und Mittelfristbereich; jenseits 144 h bleibt dort der letzte volle Lauf stehen —
das ist korrekt und muss im Manifest stehen (`sources[].runAt`), damit das Produkt das Alter
je Bereich ehrlich ausweisen kann.

⚠ **Der Kurzfristbereich verträgt einen schnelleren Takt.** ICON-D2 läuft achtmal täglich; der
Rest nicht. Wenn 0–48 h achtmal am Tag frisch sein soll, ist das ein **eigener, kleiner Lauf**
(nur ICON-D2-Bereich, ~1/5 des Volumens), nicht ein voller 336-h-Rebuild. Empfehlung: erst
vier Slots messen, dann entscheiden. → **E-3**

### 5.3 Zeitpunkte

Aus der Latenzmessung von BW-13 (§31.18): DWD publiziert Schritt 027 bei Lauf + 67 min, der
Repack-Batch landet 1–2 min später. IFS braucht länger. Die Slots oben liegen deshalb bei
**Lauf + 2 h**; die genaue Wartezeit ist in der ersten Etappe zu messen, nicht zu setzen.

---

## §6 Volumen

Gerechnet für DACH 45,8–55,1 °N / 5,9–17,2 °E, 109 Zeitschritte, 9 Zielgrößen + 5 Profilfelder,
int16:

| Gitter | Zellen | roh je Lauf | gepackt (÷3) | 4 Slots/Tag | Monat |
|---|---|---|---|---|---|
| 0,05° (5,6 × 3,5 km) | 42 262 | 129,0 MB | 43,0 MB | 172 MB/Tag | 5,2 GB |
| **0,10° (11,1 × 7,1 km)** | **10 622** | **32,4 MB** | **10,8 MB** | **43 MB/Tag** | **1,3 GB** |
| 0,25° (27,8 × 17,7 km) | 1 748 | 5,3 MB | 1,8 MB | 7 MB/Tag | 0,2 GB |

**Empfehlung: 0,10° als Basisgitter.** Begründung: Die Modellwerte müssen nicht feiner sein als
das Modell, das sie liefert — und das Terrain-Downscaling im Browser rechnet ohnehin von der
Gitterzelle auf den Punkt herunter, mit dem DEM als Führungsgröße. Ein feineres Gitter würde
den Fehler nicht kleiner machen, sondern nur das Volumen vervierfachen.

**Zum Vergleich:** Das Repo nimmt heute ≈ 520 MB/Tag an neuen Blobs auf (Radar-Spiegel
dominiert). 43 MB/Tag sind **8 % Aufschlag** — unkritisch, solange der Force-Push-Reset läuft.

**Chunk-Auslegung** bei 8 × 8 Zellen (0,8° × 0,8° ≈ 89 × 57 km):

| | Wert |
|---|---|
| Chunk mit allen 14 Größen | 190 KB roh, ~63 KB gepackt |
| Chunk nur T/Td/precip | 41 KB roh, ~14 KB gepackt |
| Chunks je Lauf | 166 |
| Dateien je Lauf | 166 + 1 Manifest |

Eine Punktabfrage lädt **einen** Chunk. Ob das ein Chunk mit allen Größen wird oder zwei
(Kern + Wolken lazy), entscheidet die Latenzmessung der ersten Etappe — nicht dieses Dokument.

---

## §7 Etappen und Gates

| Etappe | Inhalt | Gate |
|---|---|---|
| **PD0** | dieses Dokument | Jans Freigabe der Entscheidungen §8 |
| **PD1** | Punkt-Ingest für **ICON-D2 0–48 h**, Format + Manifest, ein Slot, ein Lauf. Noch kein Client. | GPD1: Chunk byte-identisch zum GRIB-Punktwert an 20 Stichproben; Volumen und Ingest-Laufzeit **gemessen**, nicht geschätzt |
| **PD2** | Client-Leser hinter Flag `?pointsrc=cdn`, Altpfad bleibt Standard | GPD2: identische Vorhersage aus CDN und Altpfad an 50 Punkten, Δ ≤ Quantisierungsfehler; Latenz p50/p90 gemessen |
| **PD3** | ICON-EU 48–120 h, MOSMIX-L als Punktquelle | GPD3: 0–240 h vollständig aus dem CDN |
| **PD4** | ICON global + AICON 120–180 h | GPD4 |
| **PD5** | IFS/AIFS 180–336 h über `.index`-Byte-Bereiche | GPD5: **volle 336 h aus dem CDN**, Fremd-Origins nur noch Fallback |
| **PD6** | AT/CH: C-LAEF, ICON-CH1/CH2 | GPD6 |
| **PD7** | Profilfelder für das Terrain-Downscaling | GPD7 |

**PD1 und PD2 sind die Entscheidungsetappen.** Wenn dort Volumen oder Latenz nicht halten,
ändert sich der Zuschnitt — alles Weitere baut darauf auf.

---

## §8 Offene Entscheidungen — Jans Gate

| # | Frage | Empfehlung |
|---|---|---|
| **E-1** | Basisgitter 0,05° / **0,10°** / 0,25°? | **0,10°** — §6 |
| **E-2** | Zielgrößen v1: die neun aus `PointSourceSample`, oder erst T/Td/Wind/Niederschlag? | **erst sechs** (T, Td, u, v, gust, precip), Wolken in PD3 |
| **E-3** | Vier Slots, oder zusätzlich ein schneller Kurzfrist-Slot (8×/Tag, nur 0–48 h)? | erst vier, nach GPD1 entscheiden |
| **E-4** | Zwei Läufe vorhalten, oder vier wie bei `runs/`? | **zwei** — §5.1 |
| **E-5** | Ein Chunk mit allen Größen, oder Kern + Lazy-Teil? | nach Latenzmessung in GPD2 |
| **E-6** | Punktdaten im selben Repo (`point/`) oder eigenes Repo? | **selbes Repo** — ein Publisher, ein Manifest-Muster, ein Force-Push-Reset. Ein zweites Repo verdoppelt V-BW-58. |
| **E-7** | Wird `fetchOpenMeteoPoint` entfernt (V-PD-1) oder bleibt sie als dokumentierter Opt-in? | **entfernen** — Leser ohne Schreiber, D-18 |
| **E-8** | AROME-Migration `nwp-v1-1h-2500m` → `nwp-v2-1h-1km` **vor** oder **in** PD6? | **vorher**, eigene kleine Phase — der Termin (Nov. 2026) hängt nicht an PD |

---

## §9 Risiken und Fallen

| # | Risiko | Kur |
|---|---|---|
| **R-1** | **V-BW-58 wird schlimmer.** `publish-repack.mjs` pusht einmal ohne Wiederholung, gegen einen Radar-Spiegel, der alle 1,5 min pusht. Ein zweiter Publisher erhöht die Kollisionsrate. | Commit-back-Loop (T2c) **vor** PD1; sonst wächst das Repo bei ausbleibendem Reset um ~0,5 GB/Tag |
| **R-2** | **Manifest-Key ≠ Dateipräfix.** Im bestehenden `index.json` gilt `lightningfc → lpi-`, `snowDepth → snowdepth-`, `snowFresh → snowfresh-`. Wer aus dem Key den Pfad baut, greift ins Leere. | Im neuen Schema Key = Dateiname, ohne Ausnahme |
| **R-3** | **`steps` enthält Objekte, keine Zahlen** (BW-13). Ein Verifier mit `Number.isInteger` war gegen Fixtures grün und gegen die Wirklichkeit `null`. | Fixtures aus echten Manifest-Auszügen, nie synthetisch |
| **R-4** | **Das URL-/Feld-Vokabular kommt aus dem Code, nicht aus dieser Skizze** (Lehre aus SH3, V-BW-51). Die Größennamen oben sind aus `types.ts` gelesen — aber die Einheiten und Wertebereiche je Quelle sind es nicht. | In PD1 gegen die echten GRIB-Felder prüfen |
| **R-5** | **jsDelivr liefert `.gz` nicht transparent aus.** Ein `.bin.gz` kommt komprimiert an und muss im Client entpackt werden. | `DecompressionStream('gzip')` — in PD1 gegen echte CDN-Antwort belegen, nicht annehmen |
| **R-6** | **Range-Requests über jsDelivr sind nicht verifiziert.** Das Chunk-Design vermeidet sie bewusst (viele kleine Dateien statt einer großen mit Bereichsabruf). | so lassen; falls doch gewünscht, erst messen |
| **R-7** | **Eine Messsonde, die ihre eigene Quelle drosselt, misst nichts** (BW-13). Der Ingest darf DWD und ECMWF nicht mit parallelen Abrufen überfahren. | IFS über `.index`-Byte-Bereiche, nicht volle Dateien (60 GB/Tag vs. wenige MB) |
| **R-8** | **Zwei Datenquellen für dieselbe Größe** — der Client könnte MOSMIX aus dem CDN *und* über BrightSky bekommen. Das ist die Falle, die BW-13 beim Wind aufgeräumt hat. | Genau eine reguläre Quelle je Größe und Bereich; der Altpfad ist Fallback, nicht Parallelbetrieb |

---

## §10 Verbesserungen (D-28; `improvements.md` fehlt, deshalb hier)

| # | Eintrag | Mehrwert | Skizze |
|---|---|---|---|
| **V-PD-1** | `fetchOpenMeteoPoint` ist ein Leser ohne Schreiber | Toter Code, der gepflegt aussieht — und eine NC-lizenzierte Quelle im Baum, die D-18 ausschließt | Funktion, Interface `OpenMeteoPointHour` und die zugehörigen Mapper entfernen; `omSeriesToHourSamples` prüfen, ob sie noch gebraucht wird |
| **V-PD-2** | AROME `nwp-v1-1h-2500m` wird November 2026 abgeschaltet | Ohne Migration fällt die AT/CH-Kurzfristquelle still aus — genau das Muster wie beim RADOLAN-Frühstart (V-LE-12) | Auf `nwp-v2-1h-1km` umstellen: 1 km statt 2,5 km, Parameternamen prüfen (`2t`, `2r`, `10u`/`10v`, `10fg`, `tp`, `snowlmt`), `AROME_BOUNDS` auf 43,00–51,50 °N / 5,03–22,57 °E nachziehen |
| **V-PD-3** | `README.md` des Daten-Repos beschreibt `radar/` nicht, `cape` nicht, und `archive-YYYYMM`-Zweige, die es nicht gibt | 517 Dateien und der dominante Commit-Treiber sind undokumentiert; ein beschriebener Zweig, den `/branches` nicht kennt, kostet die nächste Session eine Stunde | README nachziehen, AR-Absatz streichen (entspricht CLAUDE.md §1.6) |
| **V-PD-4** | Die Punktvorhersage hat keine Gesundheitsanzeige für ihre Quellen | Fällt BrightSky oder GeoSphere aus, merkt es niemand — die Karte hat `manifestHealth`, der Punkt nichts | Analog `manifestHealth` je Quelle mit `primary`-Kennzeichnung |

---

## §11 Was dieses Dokument nicht beantwortet

- **Ob der Umzug die Vorhersage besser macht.** Er macht sie unabhängiger von Fremd-Origins
  und schneller. Genauer wird sie erst durch mehr Quellen — und ob die Fusion daraus Skill
  zieht, misst der Bewerter (`verify:pv-score`), nicht dieses Dokument.
- **Die Ingest-Laufzeit.** Alle Zeitangaben in §5.3 sind aus BW-13 übernommen und gelten für
  ICON-D2. IFS und ICON global sind ungemessen.
- **Ob 0,10° reicht.** Die Begründung in §6 ist physikalisch plausibel, aber nicht gemessen.
  GPD2 vergleicht CDN- und Altpfad an 50 Punkten — dort wird es sichtbar.

---
---

# PD-A — Datenbedarf aus den Ablaufplänen (2026-09-09)

> §1–§11 oben sind die Diagnose PD0 vom Vormittag; sie entstand **vor** `ABLAUFPLAENE.md` und
> `QUELLENMATRIX.md`. Was dort steht, gilt weiter — aber es ist unvollständig. Die drei Befunde,
> die PD0 nicht haben konnte, stehen in §12.

## §12 Was die zwei Dokumente ändern

PD0 hat den **Modellteil** richtig erfasst: falsche Achse (Fläche-je-Zeitpunkt statt Zeitreihe-je-Ort),
Horizont endet bei 27 h, Taupunkt fehlt. Das bleibt. Drei Dinge kommen hinzu, und zwei davon sind
größer als alles, was PD0 aufgeschrieben hat.

**(1) Der Terrain-Stack ist eine eigene Produktlinie — und PD0 kennt ihn nicht.**
`ABLAUFPLAENE.md` PAP 1 liest als **allerersten Schritt** `h, TPI, SVF, z0, imperv, d_water` am Punkt;
PAP 5 rechnet Kaltluftsee und Wärmeinsel ausschließlich daraus. `QUELLENMATRIX.md` §3 nennt die
Quellen (Copernicus DEM GLO-30, ESA WorldCover v200, GHS-BUILT-S/-H) und sagt ausdrücklich:
*„Abgeleitet und mit ausgeliefert: Slope, Aspect, SVF, TPI (zwei Skalen), DAH, Sx je Richtung,
Föhn-Lee-Masken, Distanz zu Wasser."* **Mit ausgeliefert** heißt: aus unserem CDN, denn keine der drei
Quellen ist CORS-fähig, und keines der Derivate ist im Browser zur Laufzeit rechenbar (ein Sky-View-
Faktor braucht eine Horizontsuche über Kilometer). Das ist ein **statisches, einmal gebautes
Rasterprodukt** — eine andere Sorte Daten als alles, was heute im Repo liegt.

**(2) „Drei Range-Requests, je Auflösungsstufe einer" ist eine Architekturvorgabe, keine Optimierung.**
PAP 1 E2 holt die Fusions-Chunks in **drei** Abrufen, *„für jede Auflösungsstufe einen Chunk"*.
Der Cube ist damit nicht ein Gitter, sondern **drei gestaffelte Gitter** — fein für den Kurzfrist-,
mittel für den Mittelfrist-, grob für den Langfristbereich. PD0 §6 hatte **ein** Gitter (0,10°)
vorgeschlagen; das war zu grob im Kurzfristbereich (ICON-D2 ist 2,2 km) und zu fein im Langfrist-
bereich (IFS ist 0,25°). Die Staffelung ist zugleich die Antwort auf die Volumenfrage: der teure
Bereich ist auch der kurze.

**(3) Der Algorithmus braucht Zahlen, die aus der Verifikation kommen — nicht aus einem Modell.**
Das ist der Befund, der am leichtesten zu übersehen ist. PAP 2 fusioniert mit `w = Σ⁻¹1 / (1ᵀΣ⁻¹1)` —
das setzt eine **Fehlerkovarianzmatrix Σ je Quelle, Variable und Vorhersagestunde** voraus. PAP 6
addiert einen Sockel `σ_sys²` und nennt ihn *„zwingend"*. PAP 3 gewichtet mit `L_d`/`L_h`, PAP 5 mit
`A`, `A_uhi`, `a`, `v_ref`, `ε`, PAP 4 mit der Form von `φ`, PAP 6 mit `c(p,f)` und dem Schmelzversatz.
Die Offenen Punkte der Ablaufpläne sagen es selbst: *„Amplituden A und A_uhi werden an Stations-
beobachtungen **gelernt**, nicht gesetzt"* und *„Sämtliche Startwerte sind Kalibrierungsparameter,
keine physikalischen Konstanten."*

Diese Größen sind **Daten**, keine Konstanten im Code: sie ändern sich, wenn die Verifikation neue
Scorecards liefert, und sie müssen versioniert und ausgeliefert werden wie ein Modellfeld. Sie sind
der Grund, warum `buscosun-archiv` (PA) und `buscosun-data` (PD) **zwei Enden derselben Leitung** sind:
das Archiv misst, das Daten-Repo liefert das Ergebnis der Messung aus.

---

## §13 Der vollständige Datenbedarf

Abgeleitet Schritt für Schritt aus PAP 1–6 und dem Feldglossar. Die Spalte **Achse** sagt, wie die
Daten geschnitten sein müssen — das ist die Eigenschaft, an der die heutige Ablage scheitert.

### 13.1 Zur Laufzeit im Browser (PAP 1, 3, 4, 5, 6)

| # | Feld | Einheit | Achse | Frequenz | PAP |
|---|---|---|---|---|---|
| **Zielgrößen — Median `T̄` und Streuung `σ`, je Zeitschritt** ||||||
| 1 | `t2m` Temperatur 2 m | °C | Ort × Zeit | je Lauf | 1,4,5,6 |
| 2 | `td2m` Taupunkt 2 m | °C | Ort × Zeit | je Lauf | 6 |
| 3 | `u10` Ostkomponente 10 m | m/s | Ort × Zeit | je Lauf | 5,6 |
| 4 | `v10` Nordkomponente 10 m | m/s | Ort × Zeit | je Lauf | 5,6 |
| 5 | `gust` Böe (`v_max`) | m/s | Ort × Zeit | je Lauf | 6 |
| 6 | `precip` Niederschlagsrate | mm/h | Ort × Zeit | je Lauf | 6 |
| 7 | `clct` Gesamtbewölkung | % | Ort × Zeit | je Lauf | 5 (`f_rad`), 6 |
| 8–10 | `clcl` / `clcm` / `clch` | % | Ort × Zeit | je Lauf | 6 (Konsistenz) |
| 11 | `ps` Bodendruck | hPa | Ort × Zeit | je Lauf | 6 (normalverteilt) |
| 12 | `snowlmt` Schneefallgrenze | m ü. NN | Ort × Zeit | je Lauf | 6 |
| **Profilfelder — je Gitterzelle und Zeitschritt, ohne σ** ||||||
| 13 | `gammaEff` `Γ = −∂T/∂z` | K/km | Ort × Zeit | je Lauf | 3,4 |
| 14 | `zBase` Inversionsbasis | m ü. NN | Ort × Zeit | je Lauf | 4 |
| 15 | `zInv` Inversionsobergrenze | m ü. NN | Ort × Zeit | je Lauf | 4 |
| 16 | `dTInv` Temperaturzunahme | K | Ort × Zeit | je Lauf | 4 |
| 17 | `hModEff` effektive Modellorographie | m ü. NN | Ort × Zeit¹ | je Lauf | 3,4 |
| **Terrain-Stack — statisch, am Punkt** ||||||
| 18 | `h` Geländehöhe (`h_true`) | m ü. NN | Ort | einmalig | 1,3,4 |
| 19 | `tpi500` TPI kleine Skala | m | Ort | einmalig | 5 |
| 20 | `tpi2000` TPI große Skala | m | Ort | einmalig | 5 |
| 21 | `svf` Sky-View-Faktor | 0…1 | Ort | einmalig | 5 |
| 22 | `z0` Rauhigkeitslänge | m | Ort | einmalig² | 3 (`κ`), 5 |
| 23 | `d0` Verdrängungshöhe | m | Ort | einmalig² | 5 (Wind, zweistufig) |
| 24 | `imperv` Versiegelungsgrad | % | Ort | einmalig² | 5 (UHI) |
| 25 | `dwater` Distanz zu Wasser | m | Ort | einmalig | Glossar |
| 26 | `lcClass` Landnutzungsklasse | Code | Ort | einmalig² | 3 (`κ_g`) |
| 27 | `sx` Geländeabschirmung je Oktant | ° | Ort | einmalig | 5 (Föhn/Lee) |
| 28 | `dah` Diurnal-Anisotropic-Heating | −1…1 | Ort | einmalig | Matrix §3 |
| 29 | `foehnLee` Lee-Maske je Sektor | 0…1 | Ort | einmalig | 5 (`foehn_prob`) |
| **Kalibrierung — aus der Verifikation, halb-statisch** ||||||
| 30 | `sigmaSys` Sockel je Variable × Lead | Einheit der Variable | Tabelle | monatlich³ | 6 („zwingend") |
| 31 | `Sigma` Fehlerkovarianz je Quellenpaar | — | Tabelle | monatlich³ | 2 (Fusionsgewichte) |
| 32 | `cSpread` Spread-Skill-Faktor `c(p,f)` | — | Tabelle | monatlich³ | 6 |
| 33 | `Ld` / `Lh` Längenskalen | m | Skalar | selten | 3 |
| 34 | `A` / `A_uhi` Amplituden | K | Tabelle (regional) | selten | 5 |
| 35 | `a`, `v_ref`, `ε` Wetterfaktor | — | Skalar | selten | 5 |
| 36 | `phi` Form der Inversionsfunktion | Stützstellen | Tabelle | selten | 4 |
| 37 | `dzMin` Inversionsschwelle | m | Skalar | selten | 2 |
| 38 | `meltOffset` Schmelzversatz | m | Skalar | selten | 6 |
| 39 | `tpiSigma` regionale Streuung des TPI | m | Raster (grob) | einmalig | 5 („TPI < −1σ") |
| **Herkunft und Ehrlichkeit** ||||||
| 40 | `sources[]` welche Quelle ab welcher Stunde trägt | — | je Lauf | je Lauf | 1 (Ausgabe) |
| 41 | `runAt` je Quelle | Zeit | je Lauf | je Lauf | 1 |

¹ `hModEff` ist das gewichtete Mittel der `HSURF` **der beitragenden Quellen** — die wechseln mit der
Vorhersagestunde, also ist das Feld zeitabhängig, obwohl Orographie es nicht ist.
² Landnutzung und Versiegelung ändern sich jährlich, nicht stündlich — „einmalig" heißt hier
„je Datensatz-Jahrgang", mit Versionsnummer im Manifest.
³ Frequenz noch nicht entschieden — siehe E-14.

### 13.2 Im Ingest, nicht im Browser (PAP 2)

Diese Felder werden **gelesen und verbraucht**, nicht ausgeliefert. Sie bestimmen aber die
Download-Last der Pipeline und gehören deshalb in die Bestandsaufnahme.

| Feld | Zweck | Menge je ICON-D2-Lauf (gemessen) |
|---|---|---|
| `t` auf Modellleveln, unterste ~25 | Vertikalprofil → Felder 13–16 | 25 × 49 Schritte × **0,92 MiB** = **1,13 GiB** |
| `hhl` (66 Halbflächen) | Höhen der Modelllevel | 66 × 0,66 MiB = 43 MiB, **zeitinvariant** ⇒ einmal |
| `hsurf` | `hModEff` | 0,66 MiB, zeitinvariant |
| EPS-Member bzw. Perzentile | `σ_ens` → PAP 6 | ICON-D2-EPS 20 Member; C-LAEF nur P10/P50/P90 ⚠³ |
| Beobachtungen an Stationen | Bias-Korrektur (MOS + Kalman) | Live-Abruf, s. §14.3 |

**Der Profil-Download ist der teuerste Posten der ganzen Pipeline** — 1,13 GiB je Lauf, viermal
täglich 4,5 GiB, nur um fünf kompakte Felder zu erzeugen. Genau dafür ist PAP 2 gedacht („der Grund,
warum das Latenzziel überhaupt erreichbar ist"), aber es ist eine Last, die entschieden werden muss
(E-11).

---

## §14 Quellenzuordnung

### 14.1 Modellquellen je Bereich — und was das Repo davon kann

Aus `QUELLENMATRIX.md` §1/§2, abgeglichen mit dem Bestand an Adaptern in `src/sources/`.

| Bereich | Quelle (Primär **fett**) | Adapter im Repo | Im Daten-Repo | Zugriffsweg |
|---|---|---|---|---|
| 0–3 h DE | **RADVOR RV**, RADOLAN | `dwdRadar.ts`, `radolan*.ts` | ✓ `radar/rv/` | gespiegelt |
| 0–3 h AT | **INCA Nowcast** | `geosphereInca*.ts` | ✓ `radar/` | gespiegelt |
| 0–3 h CH | **CombiPrecip**, RZC | `meteoSwissRadar.ts`, `rzcParse.ts` | ✓ `radar/` | gespiegelt |
| 0–48 h | **ICON-D2**, ICON-D2-EPS | `iconD2*.ts`, `iconD2EpsSource.ts` | ⚠ nur 0–27 h als **Bilder** | opendata.dwd.de |
| 0–33 h CH | **ICON-CH1-EPS** | `iconChEpsSource.ts` | ✗ | STAC → CSCS |
| 33–120 h CH | **ICON-CH2-EPS** | `iconChEpsSource.ts` | ✗ | STAC → CSCS |
| 0–60 h AT | **C-LAEF AlpeAdria** | ⚠ `geosphereArome.ts` liest den **Vorgänger** | ✗ | GeoSphere-API |
| 48–120 h | **ICON-EU**, EU-EPS | `iconEuRasterSource.ts` | ✗ | opendata.dwd.de |
| 120–180 h | **ICON global**, **AICON** | `iconGlobalSource.ts`, `aiconSource.ts` | ✗ | opendata.dwd.de |
| 180–336 h | **IFS HRES/ENS**, **AIFS** | `ecmwfIfsSource.ts` | ✗ | data.ecmwf.int (`.index`) |
| 0–240 h | **MOSMIX-L** (Punktquelle) | via BrightSky (`brightSkyForecast.ts`) | ✗ | opendata.dwd.de (KMZ) |
| Rückfall lang | NOAA GFS/GEFS | `gfs2dSource.ts`, `globe/gfs.ts` | ✗ | NOAA-S3 (idx-Ranges) |
| 0–216 h CH | E4 Local Forecast ⚠⁴ | ✗ | ✗ | — (Benchmark, kein Adapter) |

**Der Befund, der die Aufwandsschätzung ändert:** für **jede** tragende Modellquelle außer C-LAEF und
E4 existiert im Repo bereits ein Adapter, der in Node läuft und einen eigenen Verifier hat
(`verify:icon-eu`, `verify:icon-global`, `verify:ifs`, `verify:aifs`, `verify:aicon`, `verify:ch-eps`,
`verify:gfs-2d`, `verify:eps`). Sie sind für die **Karte** gebaut (grobes Gitter, wenige Schritte),
aber die teuren Teile — GRIB2-Dekodierung inkl. CCSDS-AEC, `.index`-Byte-Bereiche, ikosaedrischer
Nearest-Index, STAC-Discovery, bz2 — sind vorhanden und belegt. Der Punkt-Ingest ist damit kein
Neubau, sondern eine **zweite Ausgabeform derselben Leser**.

### 14.2 Zwei Korrekturen an PAP 2

**(1) Die CDO-Gewichte des DWD werden für ICON-D2 und ICON-EU nicht gebraucht.**
PAP 2 O1 sieht „ikosaedrisches Gitter → reguläres Gitter (CDO-Gewichte des DWD)" vor. Gemessen am
Verzeichnis `icon-d2/grib/09/t/` (2026-09-09): 7 532 Dateien, davon **6 500 `regular-lat-lon_model-level`**
und 1 078 `regular-lat-lon_pressure-level` — alle 65 Modelllevel × 49 Schritte liegen **bereits regulär**
vor, ebenso `hhl` (66 Halbflächen, `regular-lat-lon_time-invariant`, 132 Dateien). Der bestehende
`decodeGrib2` liest das direkt. Die Interpolation bleibt nötig für **ICON global**, **AICON** und
**ICON-CH1/CH2** — dort ist ikosaedrisch die einzige Form, und dafür gibt es im Repo den
`clat`/`clon`-Nearest-Index (`iconGlobalSource.ts`, `iconChEpsSource.ts`), also auch dort keine
CDO-Gewichte.

**(2) `CLCT` allein reicht für PAP 6 nicht.** PAP 5 rechnet `f_rad` aus `clct`, PAP 6 erzwingt aber
`clct := max(clct, clcl, clcm, clch)` — die drei Schichten müssen also mitgeführt werden, nicht nur
die Summe. PAP 2 E1 nennt nur `CLCT`.

### 14.3 Beobachtungen und Verifikation

| Land | Echtzeit (Bias-Korrektur, Anker) | Adapter | Verifikation (geprüft) | Adapter |
|---|---|---|---|---|
| DE | DWD POI, stündlich, 748+ Stationen | `brightSkyCurrent.ts` | CDC `hourly` / `10_minutes` | ⚠ nur `historySource.ts` (Open-Meteo) |
| AT | TAWES 10 min (**nur 3 Monate Vorhalt**) | `geosphereTawes.ts` | **`klima-v2-1h`** mit Qualitätsflags | ✗ |
| CH | SwissMetNet 10 min, ~160 Stationen | `meteoSwissSmn.ts` | SwissMetNet-Historie | ⚠ `fetchSmnHistory` |

Die Verifikationsquellen sind **nicht** Sache von `buscosun-data` — sie speisen `buscosun-archiv` (PA).
Was `buscosun-data` daraus braucht, ist das **Ergebnis**: die Kalibriertabellen 30–38 aus §13.1.

### 14.4 Statische Geodaten — Zugang gemessen (2026-09-09)

| Zweck | Quelle | Kachelung | Format | Bytes je Kachel |
|---|---|---|---|---|
| `h` | **Copernicus DEM GLO-30**, `copernicus-dem-30m.s3.amazonaws.com` | 1°, `Copernicus_DSM_COG_10_N47_00_E011_00_DEM` | COG float32, Deflate, **Predictor 3**, 1024²-Kacheln, 4 Ebenen | 41,5 MiB (N47E011) / 29,8 MiB (N52E013) |
| `z0`, `lcClass`, `dwater` | **ESA WorldCover v200**, `esa-worldcover.s3.eu-central-1.amazonaws.com` | 3°, `…_N45E009_Map.tif` | COG uint8, Deflate, Predictor 1, 36 000², 7 Ebenen | 94,2 MiB |
| `imperv` | GHS-BUILT-S R2023A (JRC) | 100 m, Mollweide-Kacheln | GeoTIFF | noch nicht gemessen (E-13) |
| `d0` | GHS-BUILT-H | 100 m | GeoTIFF | noch nicht gemessen (E-13) |

**Zwei harte Befunde:**

- **GLO-30 ist nicht quadratisch.** Gemessen: unterhalb 50 °N 3 600 × 3 600 px je 1°-Kachel (1″),
  **ab 50 °N 2 400 × 3 600** (1,5″ in Länge). Ein Bauteil, das 3 600 Spalten annimmt, liefert nördlich
  von Leipzig ein um 50 % gestauchtes Gelände — genau die Sorte stiller Fehler, die KL0–KL11 gekostet hat.
- **Der COG-Leser des Repos kann GLO-30 heute nicht dekodieren.** `src/fire/detail/cogTiff.ts`
  (SAT2a) beherrscht uint8 und uint16 mit Predictor 1/2. GLO-30 ist float32 mit **Predictor 3**
  (Gleitkomma-Prädiktor: Byte-Akkumulation, dann Ebenen-Entflechtung). WorldCover dagegen liest der
  Bestand unverändert. → Ein benannter, kleiner Zusatz am Leser, kein neuer Leser.

---

## §15 Bestand in `buscosun-data` — gemessen am 2026-09-09, 10:47 UTC

```
buscosun-data/                      Repo-Größe 173 679 KB ≈ 170 MiB, ein Zweig, Force-Push-Reset
  index.json                        116 222 B — Manifest der Kartenlayer (schema 1, keep 4)
  hsurf-v1.png                       61 244 B — Modellorographie, lauf-invariant
  README.md                           5 931 B
  runs/<lauf>/                       4 Läufe · je 207 Dateien · 13,88 MiB
    repack.json, index.json          Lauf-Manifest + Zeiger
    wind|temp|gust|thunder|rotation|lpi|snowdepth|snowfresh|precip|cape-<SSS>.png
  radar/                             status.json + img/v1/ + konrad3d/ (12) + rv/ (12)
  scripts/radar-mirror.mjs           Kopie des Spiegel-Skripts
  .github/workflows/                 build.yml · radar.yml · radar-watchdog.yml
```

Familienzählung im jüngsten Lauf (`runs/2026090909`): `cape` 28, `precip` 28, `gust` 25, `snowdepth` 25,
`temp` 25, `snowfresh` 24, `wind` 13, `thunder` 13, `rotation` 12, `lpi` 12.

**Gegen die 41 Felder aus §13.1 gehalten:**

| Bedarf | Bestand | Status |
|---|---|---|
| 1 `t2m` | `temp-<SSS>.png`, 8 bit über −20…40 °C, 0–24 h | **Auflösung und Horizont zu klein** |
| 3/4 `u10`, `v10` | `wind-<SSS>.png`, RGB, Normierung **je Schritt**, 0–12 h | Horizont zu klein, Achse falsch |
| 5 `gust` | `gust-<SSS>.png`, 0–24 h | Horizont zu klein |
| 6 `precip` | `precip-<SSS>.png`, volle Auflösung, `ref`-Deakkumulation, 0–27 h | Horizont zu klein |
| 2, 7–17 | — | **fehlt vollständig** |
| 18–29 Terrain | — | **fehlt vollständig** |
| 30–39 Kalibrierung | — | **fehlt vollständig** |
| 40/41 Herkunft | `index.json` kennt Lauf und Commit, aber keine Quellenbänder | **fehlt** |
| 0–3 h Radar | `radar/rv`, `radar/konrad3d`, `radar/img/v1` | **vorhanden und nutzbar** |

**Vier Struktur-Befunde am Bestand**, die für die Erweiterung gelten:

1. **Schlüssel ≠ Dateipräfix.** `index.json` führt `lightningfc` → `lpi-…`, `snowDepth` → `snowdepth-…`,
   `snowFresh` → `snowfresh-…`. Wer aus dem Schlüssel den Pfad baut, greift ins Leere (PD0 R-2).
2. **`steps` enthält Objekte**, keine Zahlen (`{step,file,bytes,…}`) — die Falle aus BW-13.
3. **`range` ist in allen Familien `null`.** Die Wertebereiche stehen im Producer-Code, nicht im
   Manifest; ein Leser, der die Skala aus dem Manifest nimmt, bekommt `null`.
4. **Das README beschreibt den halben Bestand nicht:** `radar/` (der dominante Commit-Treiber) und die
   Familie `cape` fehlen. → V-PD-3, in diesem Arbeitspaket behoben.

---

## §16 Die Lücke in einem Satz

`buscosun-data` trägt heute **4 der 41 benötigten Felder**, und diese vier in der falschen Achse,
zu grob quantisiert und mit einem Horizont von 12–27 statt 336 Stunden. Was fehlt, sind nicht
einzelne Felder, sondern **drei ganze Produktlinien**: der Punkt-Cube (dynamisch, je Lauf), der
Terrain-Stack (statisch, einmalig) und die Kalibrierung (halb-statisch, aus der Verifikation).
Die Kartenlinie (`runs/`, `radar/`) bleibt davon unberührt und wird nicht angefasst.

---

## §17 Zielablage

```
buscosun-data/
  index.json                   BLEIBT — Manifest der Kartenlayer
  runs/<lauf>/*.png            BLEIBT unverändert
  radar/…                      BLEIBT unverändert
  hsurf-v1.png                 BLEIBT

  point/                       NEU — Punkt-Cube (dynamisch)
    index.json                 Manifest: Läufe, Stufen, Größen, Quellenbänder
    sources.json               Quellenmatrix maschinenlesbar (Domänen, Horizonte, Lizenz)
    calib.json                 Kalibrierung (σ_sys, Σ, c(p,f), L_d, L_h, A, A_uhi, …)
    <lauf>/
      run.json                 Lauf-Manifest (Zeiger, wie runs/<lauf>/index.json)
      t1/<cy>_<cx>.bin         Stufe 1 — 0,05°, 0–48 h stündlich
      t2/<cy>_<cx>.bin         Stufe 2 — 0,10°, 51–120 h dreistündlich
      t3/<cy>_<cx>.bin         Stufe 3 — 0,25°, 126–336 h sechsstündlich

  terrain/                     NEU — Terrain-Stack (statisch, einmal gebaut)
    index.json                 Manifest: Kachelgitter, Kanäle, Skalen, Quellenangaben
    v1/<lat>_<lon>.bin         Kachel 0,25° × 0,25°, 300 × 300 px (3″ ≈ 93 m)
```

Sieben Grundsätze — die sechs aus PD0 §2 gelten weiter, dazu einer aus den Ablaufplänen:

1. **Zwei Achsen, zwei Ablagen.** `runs/` ist Fläche-je-Zeitpunkt, `point/` ist Zeitreihe-je-Ort.
2. **Ein Chunk je Auflösungsstufe beantwortet eine Punktabfrage** — drei Abrufe, nicht 981.
3. **Fusioniert und bias-korrigiert wird offline**, auf Gitterebene.
4. **Das Terrain-Downscaling bleibt im Browser** — nur es braucht die exakte Punktposition.
5. **Adressierung über den Commit-SHA** (`index.json:commit`, jsDelivr `immutable`).
6. **Der Altpfad bleibt** (Flag-Gating, „Rule 2").
7. **NEU: Statisches liegt getrennt von Dynamischem.** `terrain/` wird einmal geschrieben und nie
   wieder; `point/<lauf>/` wird viermal täglich ersetzt. Sie im selben Verzeichnis zu mischen hieße,
   den Force-Push-Reset (`keep`) auf Daten anzuwenden, die nie veralten.

---

## §18 Formate — was gemessen wurde

### 18.1 Punkt-Cube: ein Container, drei Stufen

PD0 §3.2 hatte `int16` + gzip + JSON-Manifest vorgeschlagen. Zwei Änderungen, beide begründet:

**(a) Kein `.gz`-Dateiname, sondern ein eigener Container mit Verzeichnis.** PD0 R-5 hielt fest, dass
jsDelivrs Umgang mit `.gz` unverifiziert ist. Statt das zu messen und sich davon abhängig zu machen,
komprimiert der Container **selbst**: Kopf und Verzeichnis liegen unkomprimiert, jede Größe ist ein
eigener `deflate-raw`-Block mit Offset und Länge. Damit ist der Transport egal — und PAP 1 E2 wird
buchstäblich erfüllbar: *„drei Range-Requests"* kann heißen „drei Dateien" **oder** „drei
Byte-Bereiche", je nachdem, was die Latenzmessung in GPD2 hergibt. Ein `.gz` hätte den zweiten Weg
verbaut, weil in einen Gzip-Strom kein sinnvoller Bereich hineinführt.

**(b) `int16` bleibt, aber die Skalen stehen je Größe im Manifest und gehen in die Rechnung ein.**
PAP 6 verlangt `σ_quant² = Δ²/12` mit Δ aus Bit-Tiefe und Wertebereich. Die Skala ist damit kein
Implementierungsdetail, sondern ein **Eingabewert des Algorithmus** — sie muss aus dem Manifest
lesbar sein, nicht aus dem Code.

Kopf (48 B) + Verzeichnis (8 B je Größe), Nutzlast `int16[nvar][nt][ny][nx]`, Größe außen (eine
Reihe liegt zusammen, hintere Größen sind überspringbar), `−32768` = fehlt.

### 18.2 Terrain-Stack: die Auflösung ist gemessen, nicht geschätzt

An zwei echten GLO-30-Kacheln (Alpen N47E011 als Worst Case, Flachland N52E013), Fenster 0,25°,
vier Kanäle (`h`, Slope, Aspect, TPI 1 km), sinnvolle Quantisierung (h auf 1 m, Slope 0,5°,
Aspect 2°, TPI 0,5 m), gzip −9 mit Delta-Vorstufe:

| Zellgröße | Kachel-Raster | Alpen | Flachland | DACH-Hochrechnung (1 748 Kacheln) |
|---|---|---|---|---|
| 62 m (1,5″) | 450 × 450 | 668 KiB | 409 KiB | 0,7–1,1 GiB |
| **93 m (3″)** | **300 × 300** | **319 KiB** | **183 KiB** | **0,3–0,5 GiB** |
| 186 m (6″) | 150 × 150 | 90 KiB | 46 KiB | 78–154 MiB |

Zwei Lehren aus der Messung:

- **Über-Präzision kostet die Hälfte.** Der erste Durchlauf quantisierte `h` auf 0,1 m und Aspect auf
  0,02° — dieselbe Kachel wog dann 584 statt 319 KiB. Auf einer 93-m-Zelle ist ein Dezimeter Höhe
  Rauschen, und Rauschen komprimiert nicht.
- **Slope und Aspect gehören nicht in die Auslieferung.** Sie sind die schlechtesten Komprimierer
  (Aspect allein 86 von 319 KiB, im Flachland 67 von 183 — dort ist Aspect fast reines Rauschen) und
  zugleich die einzigen Derivate, die der Browser aus `h` mit einem 3×3-Kern **selbst** rechnen kann.
  Ausgeliefert wird nur, was eine Nachbarschaft von Kilometern braucht: TPI (zwei Skalen), SVF, Sx,
  DAH — und was aus anderen Quellen kommt: `z0`, `d0`, `imperv`, `lcClass`, `dwater`.

**Gewählt: 3″ ≈ 93 m, Kachel 0,25° = 300 × 300 px.** Begründung: 186 m verfehlt Talböden und
Kaltluftseen — genau das Phänomen, für das der Stack gebaut wird; 62 m verdoppelt das Volumen für
eine Genauigkeit, die die Modellwerte darüber nicht haben.

---

## §19 Etappen und Gates — revidiert

PD0 §7 kannte den Terrain-Stack und die Kalibrierung nicht. Neu:

| Etappe | Inhalt | Gate |
|---|---|---|
| **PD0** | Diagnose §1–§11 | erledigt |
| **PD-A** | dieses Kapitel §12–§21 + das **Fundament** (§22): Formate, Quellenregister, Verifier, Ablage, Cron-Vorlage | **GPD-A:** `verify:point-data` grün, Formate am echten Datum belegt, kein Produktivpfad berührt |
| **PD1** | ICON-D2-Punkt-Ingest 0–48 h vollständig (Stufe 1 inkl. Profilfelder), ein Slot | GPD1: Chunk-Wert = GRIB-Punktwert an 20 Stichproben; Volumen und Laufzeit **gemessen** |
| **PD1t** | Terrain-Stack DACH bauen und einmal veröffentlichen | GPD1t: 1 748 Kacheln, Stichprobe gegen GLO-30 am Punkt, Gesamtvolumen gemessen |
| **PD2** | Client-Leser hinter Flag `?pointsrc=cdn`, Altpfad bleibt Standard | GPD2: identische Vorhersage aus CDN und Altpfad an 50 Punkten; Latenz p50/p90 |
| **PD3** | ICON-EU 48–120 h (Stufe 2), MOSMIX-L als Punktquelle | GPD3: 0–240 h aus dem CDN |
| **PD4** | ICON global + AICON + IFS/AIFS (Stufe 3) | GPD4: **volle 336 h aus dem CDN** |
| **PD5** | AT/CH: C-LAEF, ICON-CH1/CH2, INCA | GPD5 |
| **PD6** | Kalibrierung aus `buscosun-archiv` → `calib.json` | GPD6: `σ_sys` gemessen statt gesetzt |

**PD-A ist bewusst klein und ohne Produktivwirkung.** Es legt die Formate fest, an die sich alle
weiteren Etappen halten müssen — und die man später nicht mehr ändern kann, ohne jeden Leser zu
brechen.

---

## §20 Offene Entscheidungen — Jans Gate

E-1…E-8 aus PD0 §8 gelten weiter, mit einer Korrektur: **E-1 ist überholt.** Die Ablaufpläne geben
drei Auflösungsstufen vor, also gibt es kein einzelnes Basisgitter mehr.

| # | Frage | Empfehlung |
|---|---|---|
| **E-9** | Auflösung der drei Stufen: 0,05 / 0,10 / 0,25° — oder feiner in Stufe 1 (0,02° = ICON-D2 nativ)? | **0,05 / 0,10 / 0,25°** — 0,02° vervierfacht Stufe 1 für eine Genauigkeit, die erst das Terrain-Downscaling erzeugt |
| **E-10** | Zeitachse: die Ablaufpläne nennen **141 Schritte** (PAP 1), PD0 rechnete mit **109** | **Aus den Quellenhorizonten ableiten, nicht setzen** — s. §21 (1). Der Vorschlag ergibt 109 |
| **E-11** | Profil-Ingest: 25 Modelllevel × alle 49 Schritte (1,13 GiB/Lauf) oder gedeckelt? | **15 Level × 3-stündlich** (≈ 235 MiB/Lauf) für PD1; Inversionen haben einen Tagesgang, keine Stundenstruktur. Volle Auflösung erst, wenn die Verifikation sie rechtfertigt |
| **E-12** | Terrain-Stack im selben Repo (`terrain/`) oder eigenes Repo wie `buscosun-worldcover`? | **selbes Repo** — solange 0,3–0,5 GiB gemessen bestätigt werden. Darüber ein eigenes Repo, weil der Radar-Spiegel alle 1,5 min klonen muss |
| **E-13** | GHS-BUILT-S/-H (Versiegelung, Gebäudehöhe) in v1 oder erst in v2? | **v2** — `imperv` und `d0` betreffen nur den Wärmeinsel- und den Windterm; ohne sie funktioniert der Rest. Die Kanäle bleiben im Format **reserviert** |
| **E-14** | Wie oft wird `calib.json` fortgeschrieben? | monatlich, sobald `buscosun-archiv` läuft (PA); bis dahin **`null` statt geraten** — s. §21 (4) |
| **E-15** | Wer schreibt `point/`? Der bestehende `build.yml`-Batch oder ein eigener Workflow? | **eigener Workflow** (`point.yml`), anderer Takt (4 statt 8 Slots), andere Laufzeit (Stunden statt Minuten). Aber **derselbe Publisher-Baustein**, damit V-BW-58 nur einmal zu heilen ist |
| **E-19** ✅ | Die Punkt-Slots (:10 der Stunden 02/08/14/20) laufen **in das Publish-Fenster der Kartenlinie** (:30 derselben Stunden). Ein Lauf braucht gemessen 20–40 min, landet also regelmäßig genau dort — und ein Force-Push der Kartenlinie löscht, was dazwischen ankommt (§27). | **Erledigt in §31 auf Jans Auftrag — aber ANDERS als hier vorgeschlagen.** Mein Vorschlag `10 1,7,13,19` war **falsch**: um 01:10 ist nicht einmal ICON-D2 fertig (Lauf + 1,35 h). Gemessen statt geraten ⇒ **`50 3,9,15,21`** — jede Quelle mit dem neuesten Lauf, den sie vollständig hat, und 100 min Abstand zum Repack |

**E-12 ist mit Jans Entscheidung vom 2026-09-09 erledigt und entfällt:** es gibt kein
Geländeprodukt (§25). **E-4 ist mit der 24-Stunden-Regel erledigt** (§24).

---

## §21 Annahmen und Unklarheiten in den beiden Dokumenten

Was sich aus `ABLAUFPLAENE.md` und `QUELLENMATRIX.md` **nicht** eindeutig ergibt. Nichts davon
blockiert das Fundament; alles davon muss vor PD1 entschieden sein.

**(1) Die 141 Zeitschritte sind nicht rekonstruierbar.** PAP 1 sagt „alle 141 Zeitschritte von 0 bis
336 h". Für eine dreistufige Achse (stündlich bis A, dreistündlich bis B, sechsstündlich bis 336)
lautet die Bedingung `4A + B = 504` — sie hat mehrere Lösungen (A=48/B=312, A=60/B=264, A=72/B=216,
A=84/B=168 …), und keine davon fällt mit einer Modellgrenze der Quellenmatrix zusammen. Die
naheliegende, aus den Horizonten abgeleitete Achse (stündlich 0–48, dreistündlich 51–120,
sechsstündlich 126–336) ergibt **109**. → Die Achse wird im Code deklariert und gezählt, nicht aus der
Skizze übernommen (Lehre aus SH3 / V-BW-51).

**(2) „Drei Range-Requests" ist zweideutig.** Drei Dateien oder drei Byte-Bereiche einer Datei?
Das Format hält beides offen (§18.1 a). Entschieden wird nach der Latenzmessung in GPD2.

**(3) `σ` je Zielgröße ist im Cube, aber seine Herkunft wechselt.** PAP 6 nimmt `c(p,f)·σ_ens`, wenn
ein Ensemble da ist, sonst `σ_div² + σ_sys²`. Der Cube muss deshalb **mitliefern, welcher Fall galt** —
sonst kann der Client die Konfidenz nicht ehrlich beschriften. Das ist kein Feld in den Ablaufplänen;
es ist im Format als eigene Größe `sigmaKind` vorgesehen. → **Annahme, kein Zitat.**

**(4) Kein einziger Kalibrierwert ist bekannt.** `σ_sys`, `Σ`, `c(p,f)`, `L_d`, `L_h`, `A`, `A_uhi`,
`a`, `v_ref`, `ε`, `Δz_min`, der Schmelzversatz und die Form von `φ` sind sämtlich als
„Kalibrierungsparameter" ausgewiesen und **keiner ist gemessen**. Ohne `buscosun-archiv` (PA) sind
sie nicht messbar. `calib.json` wird deshalb mit `null` und einem `provenance`-Feld ausgeliefert,
das je Wert sagt, ob er **gemessen**, **aus der Literatur** oder **gesetzt** ist. Ein gesetzter Wert,
der wie ein gemessener aussieht, ist der teuerste Fehler, den dieses Produkt machen kann.

**(5) `foehn_prob` hat zwei Eingänge und nur einer ist beschrieben.** Glossar: „Lee-Geometrie +
Modellprofil". Die Lee-Geometrie kommt aus dem Terrain-Stack (`sx`), das Modellprofil aus dem Cube —
aber die Verknüpfungsvorschrift steht nirgends. Im Repo existiert ein heuristischer
`foehnDetector.ts` (Tier-C, ohne Geländeeingang). → Offen, betrifft PD5.

**(6) `f_saison` erscheint in PAP 5 ohne Definition.** Weder Formel noch Wertebereich. → Offen.

**(7) Die Quellenmatrix nennt Vorhersagelängen, aber nicht die Schrittlisten.** Ob ICON-EU zwischen
78 und 120 h stündlich oder dreistündlich liefert, ob AICON 3- oder 6-stündlich ausgibt, steht dort
nicht. `sources.json` führt die Schrittlisten deshalb als **eigenes, am Verzeichnis gemessenes** Feld —
nicht als Abschrift.

**(8) E4 Local Forecast ist als Benchmark benannt, nicht als Quelle.** Fußnote ⚠⁴ sagt, der
Algorithmus müsse ihn in der Schweiz „schlagen". Ob er dafür abgerufen und archiviert werden muss
(dann ist er PA-Sache) oder nur zum Vergleich, ist offen.

**(9) MOSMIX-Stationszahlen für DE und AT sind ausdrücklich nicht ermittelt** (Quellenmatrix §7) —
und davon hängt ab, ob MOSMIX in Österreich als Fusionsquelle trägt. Der Stationskatalog wird deshalb
aus der echten `mosmix_stationskatalog.cfg` gebaut, nicht aus einer Zahl.

---

## §22 PD-A umgesetzt — das Fundament (2026-09-09)

**Kein Byte ist veröffentlicht.** Alles läuft lokal gegen die echten Quellen; der erste
Push in `jppetry/buscosun-data` ist Jans Gate (CLAUDE.md, „STOPP & FRAGEN … Prod-Dispatch
der Crons"). `POINT_PUSH` ist die einzige Stelle, die das ändert.

### 22.1 Was entstanden ist

| Datei | Rolle |
|---|---|
| `src/point/cubeFormat.ts` | **DIE** Form des Punkt-Cubes: Domäne, drei Stufen, Zeitachse, 27 Ebenen mit Skala, Chunk-Geometrie, Container (Kopf + Verzeichnis + `deflate-raw`-Blöcke), Quantisierung, CRC-32, Selbsttest |
| `src/point/sourceMatrix.ts` | `QUELLENMATRIX.md` maschinenlesbar: 19 Quellen mit Domäne, Horizont je Laufstunde, Lizenz, Vorhalt, Adapter; §1 als 8 Bänder; geometrische Auswahl; Sperrliste; terminierte Änderungen |
| `src/point/terrainFormat.ts` | Form des statischen Terrain-Stacks: 1 920 Kacheln à 0,25° × 300 px, 17 Kanäle, Davenport-Tabelle, Container |
| `src/point/calibration.ts` | `point/calib.json`: jeder Wert mit `provenance`, fast alles `null` |
| `src/point/manifest.ts` | die vier Manifeste — Ebenen MIT Skala, Stufen, Kacheln, Attribution |
| `src/fire/detail/cogTiff.ts` | **erweitert:** float32 + Predictor 3 (`decodeTileF32`) für das Copernicus-DEM |
| `scripts/point/cogWindow.mjs` | Fensterleser für DEM und WorldCover, mit Rasterkonvention je Quelle und Cache |
| `scripts/point/build-terrain-tile.mjs` | Producer der Terrain-Kacheln |
| `scripts/point/build-point-cube.mjs` | Producer des Punkt-Cubes (ICON-D2, Stufe 1) |
| `scripts/point/publish-point.mjs` | legt beides im Daten-Repo ab, Push gegated |
| `scripts/verify-point-data.mjs` | Gate GPD-A, netzfrei, **200/200** |
| `scripts/repack-repo/README.md` | **neu geschrieben** — beschreibt jetzt alle vier Linien (V-PD-3) |
| `scripts/repack-repo/workflow-point.yml` | Cron-Vorlage für das Daten-Repo (vier Slots, sparse Checkout, Push mit Wiederholung) |

Dazu: `npm run verify:point-data` (in CI), `point:cube`, `point:terrain`, `point:publish`.

### 22.2 Warum das Format in `src/` liegt

Die Repack-Linie hält die Form in `scripts/lib/repackManifest.mjs` und der Client
spiegelt sie in `src/sources/repackSource.ts`; `verify:repack` prüft, dass beide gleich
sind. Das ist eine Kopie mit Wächter. SH6 hat gezeigt, dass es besser geht (EIN Modul,
zwei Laufzeiten). Hier ist es noch einfacher: Producer (Node, `--experimental-strip-types`)
und Client (Vite) importieren **dieselbe Datei**. Es gibt keine zweite Liste.

Belegt: `npm run budget` ist unverändert (eagerJs 107,8/107,9, totalJs 1 343,7/1 350) —
solange kein Client-Modul importiert, zieht Rollup nichts in ein Bundle.

### 22.3 Gemessen, nicht geschätzt

**Punkt-Cube, Stufe 1, ICON-D2-Lauf 2026090909, Schritte 0–3 h:**

| | Wert |
|---|---|
| Chunks | 208 (13 × 16 à 16 × 16 Zellen) |
| Gesamt | 2,64 MiB |
| Median je Chunk | 14,1 KiB · größter 16,8 KiB |
| DWD-Abruf | 49 Dateien, **53,3 MiB bz2**, 89 s |
| Packen | 4,9 s |
| Gefüllte Ebenen | 13 von 27 |
| Hochrechnung volle Stufe 1 (49 Schritte, gleiche Füllung) | **32,3 MiB** |

Die Hochrechnung ist **optimistisch und wird als solche ausgewiesen**: 14 der 27 Ebenen
sind heute durchgehend `MISSING` (die neun σ-Ebenen, die fünf Profilfelder) und
komprimieren auf nichts. Tragen sie später Werte ähnlicher Entropie wie ihre
Median-Ebenen, liegt Stufe 1 bei ≈ 65 MiB je Lauf; Stufe 2 und 3 sind zusammen ein
Zehntel davon (weniger Schritte, gröberes Gitter).

Der Abruf ist der teure Teil: 12 Größen × 49 Schritte × ≈ 1,1 MiB ≈ **640 MiB je Lauf**
allein für ICON-D2, ohne die Profilfelder (E-11: nochmals 235 MiB bis 1,13 GiB).

**Terrain-Stack, vier echte Kacheln:**

| Kachel | Lage | Bytes | größte Kanäle (KiB, Δ = Zeilendelta) |
|---|---|---|---|
| 007/023 | Innsbruck, Alpen | **294,5 KiB** | h 89,6Δ · svf 87,4Δ · hmean500 50,6Δ · hmean2000 27,3Δ |
| 027/030 | Brandenburg, flach | **151,2 KiB** | h 51,8Δ · svf 29,9 · hmean500 17,6Δ · dwater 16,7Δ |
| 010/043 | Wiener Becken | **148,1 KiB** | h 47,6Δ · svf 22,4 · hmean500 17,7Δ · dwater 16,1Δ |
| 033/013 | Elbmündung, Küste | **41,3 KiB** | h 11,3 · z0 7,9 · lcClass 7,8 · dwater 7,6Δ |

Bauzeit je Kachel 3,3–9,4 s (DEM-Abruf, Horizontsuche 1,2–1,3 s, WorldCover, Packen).
**DACH-Hochrechnung: 1 920 Kacheln × 41–295 KiB ⇒ 80–550 MiB**, realistisch ≈ 300 MiB.
Das beantwortet **E-12**: der Stack passt in dasselbe Repo — **wenn** die drei
bestehenden Workflows auf `sparse-checkout` umgestellt werden (s. 22.6).

### 22.4 Drei Messungen, die das Design geändert haben

**(1) Über-Präzision kostet die Hälfte — zweimal.** Der erste Kachelbau wog 1 686 KiB.
`sx` auf 0,01° und `svf` auf 1e-4 quantisiert lieferten keine Information, die das DEM
hergibt, nur Rauschen — und Rauschen komprimiert nicht. Auf 0,25° bzw. 1e-3: 1 119 KiB.

**(2) Ein Hochpass komprimiert nicht.** `tpi = h − mittel` behält jede Rauheit und wirft
die glatte Grundform weg. Gemessen an derselben Alpenkachel: als Differenz 190 KiB, als
**Kastenmittel** 85 KiB — dieselbe Information, weil der Client `TPI = h − hmean` in
einer Subtraktion hat. Der Stack liefert deshalb `hmean500`/`hmean2000`, nicht `tpi*`.

**(3) Eine Zeilendifferenz vor dem Deflate spart 16 % — aber nicht überall.**
Höhe 123,9 → 89,6 KiB (−28 %), `dwater` 20,5 → 12,1 (−41 %), `lcClass` dagegen
12,6 → 15,4 (**+22 %**). Der Container wählt deshalb den Filter **je Block per Messung**
und schreibt die Wahl ins Verzeichnis — eine feste Regel wäre für ein Drittel der Kanäle
falsch.

Zusammen: 1 686 → **294,5 KiB** je Alpenkachel, ohne einen einzigen Wert wegzuwerfen.

### 22.5 Sieben Befunde am echten Datum

**(1) Die zwei statischen Quellen rechnen unterschiedlich.** GeoKey 1025 gemessen:
Copernicus DEM `GTRasterType = 2` (**PixelIsPoint**, Tiepoint = Pixelmitte), ESA
WorldCover `= 1` (**PixelIsArea**, Tiepoint = Ecke). Wer für beide dieselbe Formel nimmt,
verschiebt Landnutzung gegen Höhe um ein halbes Pixel. Der Leser trägt die Konvention
je Quelle und leitet sie nicht ab.

**(2) GLO-30 unterschätzt scharfe Gipfel — und zwar systematisch mit der Schärfe.**
Gegen amtliche Höhen gemessen:

| Gipfel | Form | GLO-30 | amtlich | Δ |
|---|---|---|---|---|
| Brocken | breite Kuppe | 1 142 m | 1 141 m | **+1** |
| Feldberg (Schwarzwald) | breite Kuppe | 1 494 m | 1 493 m | **+1** |
| Zugspitze | Grat | 2 949 m | 2 962 m | −13 |
| Wildspitze | scharf | 3 738 m | 3 768 m | −30 |
| Großglockner | extrem scharf | 3 657 m | 3 798 m | −141 |
| Matterhorn | extrem scharf | 4 329 m | 4 478 m | **−149** |

Das ist kein Dekodierfehler (Flachland und breite Kuppen stimmen auf den Meter), sondern
eine Eigenschaft des Radar-DEM. Für PAP 4 sind −149 m bei 6,5 K/km **0,97 K** — es gehört
in die Ehrlichkeit des Produkts, nicht in eine Fußnote. → **V-PD-6**

**(3) Die Verortung des Cubes stimmt — und belegt nebenbei den Algorithmus.**
`hModEff` aus dem Chunk gegen die echte Ortshöhe:

| Ort | ICON-D2 | echt | Δ |
|---|---|---|---|
| Hamburg | 17 m | 10 m | +7 |
| Berlin | 44 m | 37 m | +7 |
| München | 528 m | 520 m | +8 |
| Frankfurt | 130 m | 112 m | +18 |
| **Innsbruck** | 760 m | 574 m | **+186** |
| **Zermatt** | 2 326 m | 1 608 m | **+718** |
| **Zugspitze** | 2 024 m | 2 962 m | **−938** |

Im Flachland ±7–18 m — das Gitter sitzt. In den Alpen bis 938 m daneben, weil ein
2,2-km-Modell weder das Inntal noch einen Gipfel auflöst. Genau diese Differenz ist
`h_true − h_mod_eff` in PAP 4; bei Zermatt sind das **4,7 K**, die die vertikale
Korrektur zu leisten hat. Die Ablaufpläne haben recht, und der Cube liefert die zwei
Zahlen, die man dafür braucht.

**(4) `decompressBz2` ist asynchron — und ein vergessenes `await` sah aus wie ein
DWD-Ausfall.** Der erste Producer-Lauf meldete 147 Abrufe, 160 MiB und **alle 48 Felder
als „fehlend"**. Ursache: `writeFileSync` bekam ein Promise, warf, die Wiederholschleife
fing es und der Fehler wurde als „nicht vorhanden" gebucht. Kur: `await` — und die
Schleife unterscheidet jetzt zwischen Netzabbruch (wiederholen) und Dekodierfehler
(laut scheitern). Die Lehre aus BW-13 gilt in beide Richtungen: ein abgebrochener Abruf
ist kein Befund über seine Quelle, aber ein Dekodierfehler darf nicht als „fehlt"
durchgehen.

**(5) `git commit --amend` machte den Manifest-SHA ungültig.** Der Publisher schrieb den
Commit, hängte das Manifest per `--amend` an — und der Commit hieß danach anders. Im
Protokoll stand `808da93`, im Manifest `25e90c6`, und jede darauf gepinnte CDN-URL wäre
ein 404 gewesen. Jetzt **zwei** Commits: Daten, dann Manifest, das den Daten-SHA nennt.
Belegt: `git ls-tree` findet den Chunk im genannten Commit.

Dazu ein vermiedener: die Chunks sind binär, und Git auf einer Windows-Arbeitskopie
konvertiert Zeilenenden in allem, was es für Text hält. Der Publisher legt deshalb
`.gitattributes` mit `*.bin -text -diff` an — ein CRLF-verfälschter Chunk fiele erst am
CRC auf, und zwar beim Nutzer.

**(6) `git add` mit einem Pfad, den es nicht gibt, bricht den ganzen Lauf ab.**
`git add -A point terrain .gitattributes` endet mit `fatal: pathspec 'terrain' did not
match any files`, sobald keine Kacheln gebaut wurden — also bei **jedem** der vier
täglichen Cube-Läufe. Der Publisher übergibt jetzt nur Pfade, die existieren.

**(7) `git add` in einem SPARSE Checkout verwirft still — mit Exit 0.** Für Pfade
außerhalb der Muster meldet Git nur:
`paths … exist outside of your sparse-checkout definition, so will not be updated in
the index` — **kein Fehler, Exit 0**. Der Terrain-Lauf hätte drei Stunden gerechnet und
nichts committet, ohne dass irgendwo etwas rot geworden wäre. Das ist die gefährlichere
Hälfte des Sparse-Checkouts, den §22.6 (3) verlangt.

Zwei Kuren, weil eine nicht reicht: die Cron-Vorlage erweitert vor dem Terrain-Bau die
Muster (`git sparse-checkout add terrain`), **und** der Publisher prüft die Bedingung
selbst — er liest `core.sparseCheckout`, vergleicht die Muster gegen seine Schreibpfade
und **bricht mit Exit 1 und der Kur im Klartext ab**, statt einen leeren Commit zu
schreiben. Danach prüft er zusätzlich am Index nach, dass das Geschriebene wirklich
vorgemerkt ist. Beide Fälle sind nachgestellt: sparse ⇒ Exit 1 mit Meldung, ohne
`terrain/` ⇒ Exit 0 und ein sauberer Commit `data(point): 2026090909`.

**Nebenbefund, dabei behoben:** die Cron-Vorlage pushte zweimal — einmal im Publisher
(`POINT_PUSH=1`) und einmal als eigener Job-Schritt. Das war nicht nur doppelt: der
jsDelivr-Purge steht im Publisher **hinter** dem Push, also wäre er bei einem Push auf
Job-Ebene nie erreicht worden. Jetzt pusht genau eine Stelle.

### 22.6 Was Jan tun muss, bevor Daten fließen

1. **E-9 bis E-16 entscheiden** (§20 und unten).
2. **`workflow-point.yml` manuell** nach `.github/workflows/point.yml` im Daten-Repo
   committen — eine Action darf ohne `workflows`-Scope keine Workflow-Datei pushen.
3. **`build.yml`, `radar.yml`, `radar-watchdog.yml` auf `sparse-checkout` umstellen**,
   bevor `terrain/` liegt. Heute checken sie mit `fetch-depth: 1` den vollen Baum aus;
   mit ~300 MiB statischem Stack zöge das jeder Lauf mit. Beide Workflows können es
   bereits (sie klonen `buscosun-web` sparse) — es fehlt nur am eigenen Repo.
4. **Ersten Push freigeben** (`POINT_PUSH=1`).

### 22.7 Offene Entscheidungen, die dazugekommen sind

| # | Frage | Empfehlung |
|---|---|---|
| **E-16** | `sx_*` (acht Horizontwinkel) in v1 füllen? Gemessen kosten sie **534 von 940 KiB** je Alpenkachel — und die Vorschrift, die aus Lee-Geometrie und Modellprofil ein `foehn_prob` macht, steht in KEINEM der beiden Dokumente (§21 (5)). | **reserviert lassen.** Der Bauer rechnet sie auf `--with-sx`; SVF fällt ohnehin dabei ab. Füllen, sobald die Vorschrift steht (PD5) |
| **E-17** | Terrain in `buscosun-data` (dann Punkt 3 oben zuerst) oder eigenes Repo wie `buscosun-worldcover`? | **selbes Repo**, weil ein Manifest und eine CDN-Basis den Client einfacher halten — die Umstellung auf sparse ist eine Zeile je Workflow |
| **E-18** | Der Cube-Ingest zieht ≈ 640 MiB je Lauf für Stufe 1. Bei vier Slots sind das 2,5 GiB/Tag von opendata.dwd.de. Akzeptabel? | ja, aber **gebündelt**: eine Datei je (Größe, Schritt) ist die einzige Form, die DWD anbietet. Der Cache im Runner verhindert Doppelabrufe innerhalb eines Laufs |

### 22.8 Selbstverifikation (die fünf Fragen)

1. **Funktionserhalt.** Kein bestehender Pfad ist berührt. `src/point/*` wird von keinem
   Client-Modul importiert; `cogTiff.ts` hat eine neue Funktion und einen um `32` und
   `sampleFormat` erweiterten Fixture-Writer — beide additiv, `verify:fire-detail`
   unverändert grün. Der Kartenpfad (`runs/`, `radar/`) ist unangetastet.
2. **Desktop pixelgleich.** Keine UI-Änderung; `npm run build` grün, `verify:seo` 240/240.
3. **Touch-Targets.** Keine UI.
4. **Konsole sauber.** Keine Laufzeitänderung im Browser.
5. **Long Tasks.** Kein Client-Code.

Zusätzlich: `verify:point-data` **200/200**, `typecheck` grün, `budget` unverändert
(eagerJs 107,8/107,9, totalJs 1 343,7/1 350, largestChunk 281,7/292,3).

### 22.9 Verbesserungen (D-28)

| # | Eintrag | Mehrwert | Skizze |
|---|---|---|---|
| **V-PD-5** | Die Begründung zu ⚠² der Quellenmatrix lässt sich aus der Bounding-Box nicht nachrechnen: die AT-Ostspitze liegt **40,2 km** vom angegebenen Ostrand, die Fußnote nennt 15–20 km | Wer die Hülle für die Domäne hält, überschätzt die Abdeckung in den Ecken — und ICON-CH lieferte in Ostösterreich Zufallswerte, die wie eine Vorhersage aussähen | Ursache vermutlich der rotierte Pol: 17,7 °E ist die Hülle, nicht der Rand bei 48 °N. Bis das gemessen ist, entscheidet die Länderzuordnung aus §1 (`MATRIX_BANDS`), nicht die Box. In `CH_EDGE_DISCREPANCY` festgehalten, vom Verifier geprüft |
| **V-PD-6** | GLO-30 unterschätzt scharfe Gipfel um bis zu 149 m | Am Matterhorn sind das 0,97 K in der vertikalen Korrektur — eine Vorhersage, die sicher aussieht und es nicht ist | Im Terrain-Manifest als bekannte Eigenschaft ausweisen; in PD2 prüfen, ob ein Aufschlag auf `σ` in steilem Gelände (aus `hmean500 − h`) den Fehler ehrlich abbildet |
| **V-PD-7** | Der Cube-Ingest lädt je (Größe, Schritt) eine eigene Datei — 588 Abrufe für Stufe 1 | 640 MiB und ~15 min je Lauf, dominiert von der Leitung, nicht vom Rechnen | Prüfen, ob die DWD-Bündeldateien (`*_all_*`) dieselben Felder in weniger Abrufen liefern; sonst Parallelität hochziehen wie in `repack-icon-d2.mjs` (`REPACK_FETCH_PAR`) |
| **V-PD-8** | `verify:point-data` prüft die Form, aber nicht den WERT gegen die Quelle | Ein Chunk kann formal einwandfrei und inhaltlich verschoben sein — genau der Fall KL0–KL11 | GPD1: 20 Stichproben Chunk-Wert ⇄ GRIB-Punktwert, netzabhängig, in `nightly.yml`. Die Orographie-Gegenprobe aus 22.5 (3) ist die netzfreie Vorstufe davon |

---

## §23 Die Adapter-Schicht — alle Quellen der Matrix (2026-09-09, PD3–PD5 begonnen)

Jans Ziel: **die ganze Tabelle aus `QUELLENMATRIX.md` §1 in `buscosun-data` abbilden.**

### 23.1 19 Quellen sind sechs Zugriffsfamilien

Der Befund, der das Vorhaben tragbar macht: die Quellen unterscheiden sich nicht in
neunzehn Arten, sondern in **sechs Zugriffswegen**. Alles Übrige — Domäne, Horizont,
Lizenz, Vorhalt — steht bereits in `sourceMatrix.ts` und muss nicht noch einmal
programmiert werden.

| # | Familie | Quellen | Stand |
|---|---|---|---|
| 1 | DWD, reguläres lat-lon-GRIB | ICON-D2, ICON-EU | **umgesetzt** |
| 2 | DWD, ikosaedrisches GRIB | ICON global, AICON | **umgesetzt** |
| 3 | ECMWF, `.index` + Byte-Bereiche | IFS HRES/ENS, AIFS Single/ENS | **umgesetzt** (Kontrolllauf) |
| 4 | Stationsquelle | MOSMIX-L | offen |
| 5 | Fremd-API | C-LAEF (GeoSphere), ICON-CH1/CH2 (STAC) | offen |
| 6 | bereits gespiegelt | RADVOR RV, INCA, CombiPrecip | offen (Leser, kein Ingest) |
| — | Ensemble-Member | ICON-D2/EU/global-EPS | offen (Datenmenge = eigene Entscheidung) |

Eine Quelle ist damit ein Eintrag in `scripts/point/adapters/index.mjs` mit sechs
Funktionen: `discoverRun`, `leadsFor`, `field`, `orography`, `vars`, `accumulated`.
`verify:point-data` prüft, dass **keine** Quelle der Matrix ohne Adapter **und** ohne
benannten Grund bleibt — das Muster von V-SH-11, hier vorbeugend.

### 23.2 Zum ersten Mal ein echtes σ

Stufe 3 wird von bis zu **sechs** Quellen getragen. Damit entsteht `σ_div` — die
Streuung zwischen den Quellen an derselben Zelle und Stunde, die PAP 6 als einen von
zwei Beiträgen nennt. `sigmaKind` sagt je Zelle, welcher Fall galt: `divergence` bei
mehreren Quellen, `systematic` bei genau einer (dort ist der Nenner von `σ_div` exakt
null — PAP 6 sagt das selbst —, und `σ` bleibt `MISSING`, nicht 0).

**Zwei Ehrlichkeitsvorbehalte, beide im Manifest:**

- Die Gewichtung ist **gleich**, nicht `Σ⁻¹1/(1ᵀΣ⁻¹1)`. Σ ist ungemessen, solange
  `buscosun-archiv` nicht läuft. `fusion.provenance = "fallback"` steht deshalb in
  jedem Lauf-Manifest.
- `σ_div` aus IFS HRES, IFS ENS (Kontrolle), AIFS Single und AIFS ENS (Kontrolle)
  **unterschätzt**: das sind keine vier unabhängigen Meinungen, sondern zwei Modelle
  in je zwei Auflösungen. Genau dafür sieht PAP 2 eine Kovarianz **mit
  Fehlerkorrelation** vor. Bis sie gemessen ist, ist die Streuung eine Untergrenze —
  und das gehört an die Konfidenz, nicht in eine Fußnote. → **V-PD-9**

### 23.3 Sechs Befunde, die nur das echte Datum zeigt

**(1) AICON benennt Schritte anders, als jede andere DWD-Quelle.**
`PT003H00M.grib2` — ISO-8601-Dauer mit drei Stellen und Minuten, unter
`/p/<PARAM>/r/<ISO-Lauf>/s/`, mit prozentkodiertem Doppelpunkt im Laufpfad. Geraten
(`PT3H.grib2`) gibt es 404 — und ein 404 sieht im Protokoll aus wie „die Quelle hat
den Schritt nicht", nicht wie „wir fragen falsch".

**(2) AIFS-ENS legt keine gebündelte `enfo-ef` ab**, sondern `enfo-cf` (Kontrolle) und
`enfo-pf` (gestörte Member) getrennt — anders als IFS-ENS. Mit dem Suffix von IFS fand
die Lauf-Suche gar nichts und hätte die Quelle als „nicht verfügbar" gemeldet.

**(3) ECMWF drosselt — HTTP 429.** Die erste Fassung stellte je Stufe 36 HEAD-Anfragen
für die Horizontsuche, unmittelbar hintereinander. Das ist die BW-13-Lehre in Reinform:
*eine Messsonde, die ihre eigene Quelle drosselt, misst nichts.* Drei Kuren:
Mindestabstand je Host (ECMWF 300 ms, DWD 60 ms), 429 als **wiederholbar** mit
`Retry-After` statt festem Warten, und die Horizontsuche per **Halbierung** statt
Zählung — aus 36 Sonden werden sechs.

**(4) Was die Quellen NICHT führen, ist so wichtig wie was sie führen.** Am echten
`.index` bzw. Verzeichnis abgelesen:

| Quelle | fehlt |
|---|---|
| ECMWF (alle vier) | `lcc`/`mcc`/`hcc` (Schichtwolken), Schneefallgrenze |
| ICON global | Schneefallgrenze |
| AICON | Bewölkung, Taupunkt, Böe, Schneefallgrenze — es führt nur T, U/V, Niederschlag, Druck |

Diese Größen bleiben aus diesen Quellen `MISSING` — nicht 0. Wo eine andere Quelle
derselben Stufe sie führt, trägt sie die Zelle allein; wo keine, bleibt sie leer.
Der Unterschied ist der zwischen „unbekannt" und „wolkenlos".

**(5) IFS und AIFS benutzen für dasselbe Feld VERSCHIEDENE Einheiten — und sagen es im
GRIB.** Die erste Fassung nahm eine Tabelle „ECMWF → Faktor". Am Punkt Wien stand danach
im Cube eine Bewölkung von **3 597 %** und ein Niederschlag von **21 976 mm**. Gemessen
an denselben Feldern beider Produkte (Lauf 06z, Schritt 132 h):

| Feld | IFS oper | AIFS oper |
|---|---|---|
| `tcc` | cat 6 / num **192** (ECMWF-lokal), Werte 0…1 | cat 6 / num **1** (WMO), Werte 0…**100** |
| `tp` | cat 1 / num **193** (ECMWF-lokal), Werte 0…0,697 **m** | cat 1 / num **52** (WMO), Werte 0…295 **mm** |
| `2t`, `sp` | cat 0/0 bzw. 3/0 | **identisch** |

Die Einheit wird deshalb aus der **Parameter-Identität im Datenstrom** abgeleitet, nicht
aus dem Modellnamen. Eine Modelltabelle wäre Raterei über ein Produkt, während die
Antwort im GRIB steht — und sie bräche still, sobald ECMWF ein Produkt umstellt.

**Wie still**: `f_rad = (1 − clct/100)^a` (PAP 5) wäre bei 3 597 % dauerhaft **null**
geworden. Das hätte sämtliche Geländeterme — Kaltluftsee, Wärmeinsel — abgeschaltet,
ohne eine einzige Fehlermeldung. Ein Wert, der 25-fach zu groß ist, fällt nicht auf;
ein Effekt, der nie eintritt, auch nicht.

**(6) Ein Meta-Feld, das an jeder Zelle dasselbe sagt, sagt nichts.** `sigmaKind` sollte
je Zelle den PAP-6-Zweig führen und nahm bei mehreren Größen die strengere Aussage. Am
echten Lauf stand es überall auf `systematic` — weil `gust` in Stufe 3 nur von EINER
Quelle geführt wird und damit die ganze Zelle „vergiftete", obwohl Temperatur, Taupunkt,
Wind und Druck aus mehreren Quellen kamen und ein echtes σ trugen.

Der Zweig ist **je Größe** verschieden und aus den Daten selbst ablesbar: liegt
`<var>_sd` vor, war es Divergenz; fehlt sie bei vorhandenem Median, war es genau eine
Quelle. Die Rasterebene zählt deshalb jetzt die **Quellen** (`srcCount`, als Bitmaske
gezählt, damit dieselbe Quelle über mehrere Größen nicht doppelt zählt) — das ist die
Information, die man sonst nirgends herbekommt. `sigmaKindOf()` liefert den Zweig.

### 23.4 Gemessen: Stufe 3 aus vier Quellen (2026-09-09)

Stufe 3, Schritte 126–150 h, gegen die echten Server. Drei Läufe, weil zwei davon Fehler
gefunden haben:

| | 1. Lauf | 2. Lauf (σ-Korrektur) | **3. Lauf (Einheiten + srcCount)** |
|---|---|---|---|
| Quellen | 5 (inkl. IFS-ENS-Kontrolle) | 4 | **4** — ICON global · AICON · IFS HRES · AIFS Single |
| Chunks / Größe | 12 · 0,22 MiB | 12 · 0,22 MiB | 12 · **0,21 MiB** · Median 25,8 KiB |
| Ebenen mit Werten | 20 / 27 | 20 / 27 | **20 / 27** |
| Laufzeit | 744 s (kalt) | 127 s | 67 s (warm) |
| Netz | 145 Dateien, 287,3 MiB | 33 Dateien, 21,0 MiB | 0 — alles aus dem Cache |

**Werte am Punkt, Schritt +132 h** (Median ± σ_div über die vier Quellen):

| Ort | t2m | td2m | Wolken | Niederschlag | Druck | Quellen |
|---|---|---|---|---|---|---|
| Hamburg | 18,6 ± 3,47 °C | 13,8 °C | 69 ± 33,5 % | 0,00 mm/h | 1 020 hPa | 4 |
| Berlin | 19,1 ± 3,85 | 12,5 | 75 ± 23,8 | 0,00 | 1 016 | 4 |
| München | 20,1 ± 3,70 | 13,0 | 45 ± 25,3 | 0,03 | 967 | 4 |
| Wien | 21,2 ± 4,20 | 13,3 | 47 ± 34,4 | 0,04 | 988 | 4 |
| Zürich | 22,5 ± 2,75 | 12,8 | 36 ± 34,1 | 0,00 | 967 | 4 |
| Innsbruck | 14,7 ± 4,26 | 8,5 | 47 ± 24,3 | 0,02 | 865 | 4 |

Alle vier Konsistenzbedingungen aus PAP 6 halten ohne Nacharbeit: der Taupunkt liegt
überall unter der Temperatur, die Bewölkung in 0…100 %, der Niederschlag ≥ 0, und der
Bodendruck folgt der Modellhöhe (Hamburg 1 020, Innsbruck 865 hPa). **σ zwischen 1,75 und
4,26 K bei +132 h** ist die erste gemessene Unsicherheit, die dieser Cube je getragen hat.

**Was der Lauf nebenbei belegt:**

- **`gust_sd` bleibt leer, `gust` nicht.** An jeder Zelle liefert nur EINE Quelle eine
  Böe — der Nenner von σ_div ist dort exakt null, genau wie PAP 6 es beschreibt.
- **`ifs_hres` trug nur 4 der 5 Stunden.** Der 06z-Lauf endet bei 144 h — das ist
  Fußnote ⚠⁷ der Quellenmatrix, im Betrieb sichtbar geworden statt aus einer Tabelle
  gelesen.
- **`hModEff` kommt nur von ICON global.** AICON und ECMWF Open Data liefern keine
  Modellorographie in ihren Oberflächenfeldern. → V-PD-11
- **Jede übersprungene Quelle nennt ihren Grund** — im Protokoll und im Manifest:

```
übersprungen ifs_ens:  nur Kontrolllauf lesbar; als vierter „unabhängiger" Wert
                       würde er σ_div schrumpfen (V-PD-9)
übersprungen aifs_ens: dito
übersprungen icon_eps_global: ikosaedrisch, 40 Member — eigene Entscheidung
```

Das ist der Unterschied zwischen einer Lücke und einer Entscheidung: eine still
übergangene Quelle sieht im Ergebnis genauso aus wie eine, die es nicht gibt.

**Hochrechnung auf die volle Stufe 3** (36 Schritte): ≈ 1,6 MiB Ausgabe, ≈ 2 GiB
Download, ≈ 90 min kalt. Der Engpass ist das **bz2-Entpacken in reinem JavaScript** —
ein ICON-global-Feld sind 3,2 MiB und ≈ 4 s. Die Cron-Vorlage setzt deshalb
`REPACK_BZIP2=1` (Binary statt JS, Faktor ≈ 2,6 nach V-BW-27).

### 23.4b Stufe 2 aus ICON-EU — und was die Auflösung mit `h_mod_eff` macht

Stufe 2 (51–60 h, 3-stündlich), einzige Quelle ICON-EU @06z: **56 Chunks, 0,71 MiB**,
Median 14,6 KiB, 50 Dateien / 46,2 MiB in 103 s. **14 von 27 Ebenen mit Werten** — alle
zwölf Zielgrößen **einschließlich `snowlmt`**, die weder ECMWF noch ICON global führen.
Alle neun σ-Ebenen sind `MISSING`: eine Quelle, also der PAP-6-Zweig „nur Sockel", und
der Sockel ist ungemessen. Genau so soll es aussehen.

Werte bei +57 h, gegen die echte Ortshöhe gehalten:

| Ort | t2m | Td | Schneegrenze | Druck | `hModEff` | echt | Δ |
|---|---|---|---|---|---|---|---|
| Hamburg | 18,4 °C | 10,5 | 2 554 m | 1 018 hPa | 5 m | 10 m | −5 |
| Berlin | 20,6 | 6,6 | 2 015 m | 1 014 | 44 m | 37 m | +7 |
| München | 17,8 | 8,9 | 2 438 m | 957 | 548 m | 520 m | +28 |
| **Innsbruck** | 11,1 | 9,2 | 2 529 m | 890 | **1 164 m** | 574 m | **+590** |
| **Zermatt** | 8,1 | −5,8 | 2 725 m | 740 | **2 673 m** | 1 608 m | **+1 065** |

**Der Vergleich mit Stufe 1 ist der eigentliche Befund.** Dieselben zwei Alpenorte:

| Ort | ICON-D2 (2,2 km, Stufe 1) | ICON-EU (7 km, Stufe 2) |
|---|---|---|
| Innsbruck | +186 m | **+590 m** |
| Zermatt | +718 m | **+1 065 m** |

Der Orographiefehler wächst mit der Maschenweite — und mit ihm die Arbeit, die PAP 4
leisten muss: bei Zermatt sind 1 065 m mit 6,5 K/km **6,9 K**, die allein die vertikale
Korrektur aufbringt. Das ist kein Mangel der Daten, sondern die Begründung des ganzen
Verfahrens, an zwei Auflösungen gemessen. Es sagt zugleich, warum `hModEff` **je Stufe**
im Cube stehen muss und nicht einmal global: die Korrektur hängt an der Auflösung, aus
der der Wert stammt.

**Damit sind alle drei Stufen am echten Datum belegt:**

| Stufe | Quellen | Chunks | Größe | Ebenen mit Werten |
|---|---|---|---|---|
| t1 (0–48 h) | ICON-D2 | 208 | 2,64 MiB (4 Schritte) | 13 / 27 |
| t2 (51–120 h) | ICON-EU | 56 | 0,71 MiB (4 Schritte) | 14 / 27 |
| t3 (126–336 h) | ICON global · AICON · IFS HRES · AIFS Single | 12 | 0,21 MiB (5 Schritte) | **20 / 27** |

Die σ-Ebenen tragen nur in Stufe 3 Werte — dort, wo mehrere Quellen dieselbe Zelle
bedienen. In Stufe 1 und 2 fehlt σ, weil es dort **eine** Quelle gibt: das ist die
ehrliche Antwort, bis ICON-D2-EPS bzw. C-LAEF/ICON-CH dazukommen.

### 23.5 Verbesserungen (D-28)

| # | Eintrag | Mehrwert | Skizze |
|---|---|---|---|
| **V-PD-9** | σ_div aus IFS HRES + IFS ENS (Kontrolle) + AIFS Single + AIFS ENS (Kontrolle) **unterschätzt** — das sind zwei Modelle in je zwei Auflösungen, keine vier Meinungen | Eine Vorhersage, die sicherer aussieht, als sie ist, ist der teuerste Fehler dieses Produkts | Die Ensemble-**Kontrollläufe** gehen seit diesem Stand nicht in den Mittelwert (`ensembleControlOnly`, Grund im Manifest). Sobald echte Member gelesen werden, liefern sie `σ_ens` und kommen zurück — dann mit der Fehlerkorrelation aus PAP 2 |
| **V-PD-10** | Der Ingest von Stufe 3 lädt ≈ 2 GiB je Lauf, dominiert vom bz2-Entpacken in JS | 90 min Laufzeit je Slot; bei vier Slots ist das ein Drittel des Tages nur für eine Stufe | `REPACK_BZIP2=1` in der Cron-Vorlage gesetzt (Faktor ≈ 2,6). Darüber hinaus prüfen, ob ICON global auch als regionaler Ausschnitt zu haben ist — 2,9 M Zellen für 2 009 Zielzellen ist der eigentliche Verschnitt |
| **V-PD-11** | `hModEff` kommt in Stufe 3 nur von ICON global; AICON und ECMWF liefern keine Orographie | PAP 4 subtrahiert `h_true − h_mod_eff` — stammt der zweite Term von einem anderen Modell als der Wert, ist die Korrektur inkonsistent | Entweder je Quelle eine eigene Orographie beschaffen (ECMWF: `lsm`/`z` aus dem Invariant-Lauf) oder `hModEff` je Quelle führen statt gemittelt. Entscheidung gehört in PD2, wenn der Client die Korrektur wirklich rechnet |

---

## §24 Aufbewahrung: 24 Stunden, quellenunabhängig (Jans Entscheidung 2026-09-09)

**Im Daten-Repo liegen nur Daten der letzten 24 Stunden, gleich aus welcher Quelle.**

### 24.1 Was die Entscheidung heißt — und was nicht

Sie begrenzt das **Alter eines Laufs**, nicht seinen **Horizont**. Ein Lauf von heute
trägt weiterhin die vollen 0–336 h; er fällt heraus, sobald *er selbst* älter als 24 h
ist. Für das Produkt ist das eine Zusage: die Vorhersage, die ein Nutzer bekommt, ist nie
älter als einen Tag.

Das ist eine **Obergrenze, kein Soll**. Die Kartenlinie (`keep: 4` ≈ 12 h) und der
Radar-Spiegel (`keep: 12` ≈ 1 h) liegen längst darunter und bleiben unverändert; sie
haben jetzt nur eine benannte Decke.

### 24.2 Alter statt Anzahl

`keep: N` war die Regel der Kartenlinie und hängt am Takt: ändert sich die Zahl der
Slots, ändert sich die vorgehaltene Zeit — ohne dass jemand die Regel angefasst hätte.
Ein Alter sagt, was gemeint ist. `RETENTION_HOURS = 24` steht in `src/point/manifest.ts`
und wird in jedes `point/index.json` geschrieben.

Damit ist **E-4 erledigt** (zwei oder vier Läufe vorhalten): keins von beidem, sondern
alles unter 24 h — bei vier Slots am Tag sind das im Normalbetrieb vier Läufe.

### 24.3 Der Boden, ohne den die Regel gefährlich wäre

V-BW-58 belegt, dass Publishes ausfallen (2026-09-04 dreimal; 15z fiel ganz aus, die
Karte stand sechs Stunden auf 12z). Fallen mehrere Slots hintereinander aus, altern
**alle** Läufe heraus — und ein leeres Repo ist schlimmer als ein altes: der Client
bekäme nicht „veraltet", sondern „nichts".

Deshalb bleiben immer mindestens **zwei** Läufe stehen, auch wenn sie die 24 h reißen.
Der Publisher meldet sie dann ausdrücklich als überaltert (`⚠ … bleibt nur wegen des
Bodens`) und das Manifest führt sie in `stale`. Verschwiegen wird nichts.

### 24.4 Die Ausnahme, ohne die der Algorithmus stehen bliebe

Blind angewandt hätte die Regel `terrain/` nach einem Tag gelöscht — und **PAP 1 E1, der
allererste Schritt des Algorithmus**, liefe ins Leere. Gelände ist nicht „von gestern",
es ist zeitlos. Dasselbe gilt für die Kalibrierung, das Quellenregister und die
Modellorographie der Kartenlinie.

`TIMELESS_PATHS` führt sie als Liste, nicht als Erinnerung:

| Pfad | warum zeitlos |
|---|---|
| `terrain/` | Gelände. Einmal gebaut, nie veraltet. ~300 MiB |
| `point/sources.json` | Quellenregister — ändert sich mit der Matrix, nicht mit der Uhr |
| `point/calib.json` | Kalibrierung — ändert sich mit der Verifikation |
| `point/index.json` | das Manifest selbst |
| `hsurf-v1.png`, `index.json` | die lauf-invarianten Dateien der Kartenlinie |

`verify:point-data` prüft beide Seiten: dass diese Pfade ausgenommen sind **und** dass
ein Lauf-Chunk es NICHT ist — sonst würde die Regel gar nichts entfernen und niemand
merkte es.

### 24.5 Was das Repo damit wiegt

Mit vier Slots am Tag und den gemessenen Größen:

| Teil | Größe | Alterung |
|---|---|---|
| `point/` je Lauf (alle drei Stufen, alle Ebenen gefüllt) | ≈ 40–70 MiB | 24 h ⇒ ≈ 4 Läufe |
| `point/` insgesamt | **≈ 160–280 MiB** | |
| `terrain/` | ≈ 300 MiB | **nie** |
| `runs/` (Karte, `keep: 4`) | ≈ 55 MiB | 12 h |
| `radar/` (`keep: 12`) | ≈ 15 MiB | 1 h |
| **Summe** | **≈ 530–650 MiB** | |

Das ist ein Repo, das nicht wächst — die einzige dauerhafte Last ist der Terrain-Stack,
und der ist einmalig. Es bestätigt zugleich §22.6 (3): mit ~300 MiB statischem Ballast
müssen die drei bestehenden Workflows auf `sparse-checkout`, sonst zieht jeder Radar-
und Repack-Lauf ihn mit.

### 24.6 Was die Entscheidung NICHT beantwortet

Sie sagt, wie lange Daten **liegen**, nicht, wo sie **hinterher** hingehen. Die
Quellenmatrix §4 ist da eindeutig: „Alles außer den ECMWF- und NOAA-Quellen muss ab Tag 1
selbst archiviert werden […]. Jeder Tag ohne diesen Job ist für die Verifikation
dauerhaft verloren." Mit 24 h Aufbewahrung in `buscosun-data` ist das **kein Widerspruch,
sondern die Arbeitsteilung**: die Laufzeit lebt hier, die Verifikation in
`buscosun-archiv` (PA). Ohne PA gibt es weiterhin kein `σ_sys` — und ohne `σ_sys` keine
kalibrierte Unsicherheit.

---

## §25 Zwei Korrekturen am eigenen Entwurf (2026-09-09, abends)

### 25.1 Gelände ist kein Datenprodukt dieses Repos

**Jans Einwand:** „die Terrain-Daten kommen doch schon mit den Kartendaten […] bei dem
Repo geht es erstmal um Wetterdaten." — Er hat recht, und der Entwurf in §17/§18.2 war
überbaut.

Nachgesehen, was die App **heute schon** lädt:

| Größe | Quelle im Bestand |
|---|---|
| Höhe `h_true` | Terrarium-Kacheln (`elevation-tiles-prod`), in **acht** Modulen, darunter `pointForecast.ts` |
| Landbedeckung, `z0`, `dwater` | `jppetry/buscosun-worldcover`, SHA-gepinnt, seit SAT2d in Betrieb |

Der eigentliche Denkfehler war meiner: **PAP 1 E1 liest den Terrain-Stack AM PUNKT, nicht
als Fläche.** Für eine Zelle eines 300×300-Rasters ist eine Horizontsuche über 20 km
teuer; für EINEN Punkt sind es acht Richtungen à ~40 Abtastungen — 320 Höhenabfragen aus
Kacheln, die ohnehin im Cache liegen. Als Rasterprodukt waren es 1 920 Kacheln und
≈ 300 MiB, die jeder Radar- und Repack-Lauf mitgezogen hätte.

**Entfernt:** `src/point/terrainFormat.ts`, `scripts/point/build-terrain-tile.mjs`,
`scripts/point/cogWindow.mjs`, der `point:terrain`-Alias, die Terrain-Schritte der
Cron-Vorlage, `terrain/` aus Manifest, Publisher, README und Verifier.
**Geblieben ist das Wissen**, jetzt punktweise und rein: `src/point/terrainPoint.ts` —
TPI auf zwei Skalen, Horizontwinkel je Oktant, SVF nach Dozier/Frew, Neigung und
Exposition, die Davenport-z₀-Tabelle. **21/21** gegen analytisches Gelände geprüft:
eine 1 000 m hohe Wand in 1 000 m Abstand ergibt 45,0°, eine Südwand sieht nur der
Süd-Oktant, eine ebene Fläche hat SVF = 1, und eine Datenlücke bricht den Strahl ab
statt 0 zu rechnen.

**Ebenfalls entfallen:** die Voraussetzung „`sparse-checkout` vor dem Terrain-Push"
(§22.6 (3)) — ohne 300 MiB statischen Ballast ist sie gegenstandslos. Der sparse
Checkout bleibt in der Cron-Vorlage, aber als Sparsamkeit, nicht als Bedingung.

⚠ **Nicht verwechseln:** `hsurf-v1.png` ist die **Modell**orographie (ICON-D2, 2,2 km) —
ein Wetterdatum und etwas anderes als das Gelände. PAP 4 rechnet `h_true − h_mod_eff`
und braucht beide, aus verschiedenen Quellen. Es bleibt im Repo.

Offen bleiben `imperv` (GHS-BUILT-S) und die Verdrängungshöhe `d0` (GHS-BUILT-H): in
keiner Quelle greifbar, die die App schon hat — und damit auch der Wärmeinsel- und der
zweistufige Windterm aus PAP 5 (E-13).

### 25.2 Das reine-JS-`bz2`-Paket liefert richtige Länge und falsche Bytes

Beim ersten Vollbau brach Stufe 2 mit `AEC: Bitstrom-Überlauf` ab. Nachgemessen an
**ICON global `CLON`**, denselben Bytes, zwei Entpackwegen:

| Lauf | pure-JS `bz2` | `bzip2`-Binary |
|---|---|---|
| 00z | 2,50 / 2,50 MiB ✓, dekodiert | ✓ dekodiert |
| **06z** | 2,50 / 2,50 MiB ✓, **AEC-Überlauf** | ✓ dekodiert |
| **12z** | 2,50 / 2,50 MiB ✓, **AEC-Überlauf** | ✓ dekodiert |

Die Länge stimmt **exakt** mit dem, was der GRIB-Kopf ansagt — der Inhalt nicht. Es ist
**datenabhängig**, nicht größenabhängig: dieselbe Datei desselben Produkts geht beim
00z-Lauf durch und beim 06z nicht.

**Warum das gefährlicher ist als ein Abbruch:** hier hat zufällig der AEC-Decoder
angeschlagen. Bei einfacher Packung (DRT 0), die viele Felder benutzen, wäre daraus ein
**still falsches Feld** geworden — plausible Zahlen, falsche Wirklichkeit, kein Fehler.
Ein Längenvergleich fängt es nicht; eine Stichprobe auch nicht.

**Der eigene Anteil daran:** `verify-icon-global.mjs` trägt seit jeher den Kommentar
*„Felder sind groß (Multi-Block-bz2); das reine-JS-`bz2`-Paket […] — hier spiegeln wir
das über Pythons `bz2`"*. Ich habe ihn gelesen, EINE Datei getestet, bestanden gesehen
und abgehakt (§14.1, „Der JS-Decoder trägt auch ICON-EU und ICON global"). **Eine
bestandene Stichprobe ist kein Test** — dieselbe Lehre, die SAT2h als Negativ-Kontrolle
formuliert hat, nur diesmal in die andere Richtung verletzt.

**Kur in drei Stufen** (`scripts/point/adapters/shared.mjs`):

1. Entpackt wird bevorzugt mit dem **`bzip2`-Binary** — libbzip2 prüft die Block-CRC,
   das JS-Paket nicht.
2. **Jedes** Feld wird dekodiert, bevor es als gut gilt.
3. Scheitert die Dekodierung, wird der Cache-Eintrag **verworfen** und einmal neu
   geholt; scheitert es dann wieder, ist es ein Befund über die Quelle und wird laut
   geworfen (`reDecompressed` zählt die Fälle).

Dazu **Cache-Version 2**: der Schlüssel trägt sie, damit alles, was der alte Weg
erzeugt hat, ungültig wird. Ohne das hätte ein falsch entpacktes Feld jede Korrektur
überlebt — der Cache speichert das ENTPACKTE Ergebnis, nicht das Original.

Gegenprobe nach der Kur: alle drei `CLON`-Läufe lesen korrekt, erster Versuch,
`reDecompressed: 0`. Stufe 3 baut byte-identisch zum Stand vor dem Fund (0,76 MiB,
gleiche Ebenengrößen) — der Fehler hatte sie nicht getroffen.

→ **V-PD-12**: `verify:repack`, `verify:eps` und `verify:icon-eu` benutzen denselben
JS-Weg. Sie sind nicht Gegenstand dieser Phase, aber derselbe Fehler ist dort möglich.
Prüfen, ob die Repack-Linie betroffen ist — sie schreibt in Produktion.


## §26 Ein Verzeichnis, eine Veröffentlichung, ein Manifest (2026-09-09, nachts)

Der erste vollständige Bau über alle drei Stufen lief durch — und legte dabei einen
Konstruktionsfehler offen, den kein Selbsttest und kein Verifier gesehen hat.

### 26.1 Der Befund

Nach dem Bau lag im Ausgabebaum:

```
data/point/2026090906/run.json   → nennt Stufe t2, 56 Chunks
data/point/2026090906/           → enthält 68 Chunks   (t2 + t3)
data/point/2026090912/run.json   → nennt Stufe t1, 208 Chunks
data/point/2026090912/           → enthält 208 Chunks
```

Zwölf t3-Chunks lagen im Verzeichnis, ohne dass ein Manifest sie nannte. Für jeden
Client existierten sie nicht; das Repo hätte sie trotzdem getragen und über die
24-Stunden-Regel wieder gelöscht, ohne dass sie je jemand gelesen hätte.

Das ist die stille Variante des Fehlers, gegen den das Containerformat gebaut ist:
**ein Chunk ohne sein Manifest ist Zahlensalat.** Ein Manifest, das vorhandene
Dateien verschweigt, ist derselbe Fehler mit umgekehrtem Vorzeichen.

### 26.2 Die Ursache — zwei Begriffe, die stillschweigend einer waren

`buildTier()` schneidet die Chunks unter dem Lauf **seiner eigenen Quellen**:

```js
const runId = contributors.map((c) => c.run).sort().at(-1);   // je Stufe
```

`runManifest()` legt das Manifest dagegen unter den neuesten Lauf über **alle**
Stufen. Solange alle Stufen aus demselben Modelllauf kommen, fällt das nicht auf.
Sie kommen aber regelmäßig aus verschiedenen — und das ist kein Fehler, sondern die
Bauart:

| Stufe | Quelle | Lauf | Grund |
|---|---|---|---|
| t1 | ICON-D2 | 12z | läuft achtmal am Tag, ist um 15 Uhr schon beim 12z |
| t2 | ICON-EU / IFS | 06z | vierstündlicher bzw. sechsstündlicher Zyklus |
| t3 | ICON global / IFS / AIFS | 06z | dito, plus längere Rechenzeit |

Im Verzeichnisnamen steckten damit **zwei verschiedene Begriffe**, die niemand
getrennt hatte:

* der **Quell-Lauf** — aus welchem Modelllauf die Zahlen einer Stufe stammen;
* der **Publikationslauf** — welche Veröffentlichung des Cubes das ist.

Der erste ist eine Eigenschaft der Stufe, der zweite eine des Ablageorts. Sie in
einen Namen zu falten funktioniert genau so lange, wie sie zufällig gleich sind.

### 26.3 Die Korrektur

`placeUnderPublishRun()` legt alle gebauten Stufen unter **einen** Publikationslauf
(den neuesten über alle Stufen). Die Verschiebung ist eine reine Umbenennung des
Stufenverzeichnisses — **kein Byte im Chunk ändert sich**, und der Header behält sein
`runHours` aus dem Quell-Lauf. Das leere Quell-Verzeichnis wird mitgenommen, damit
kein `point/<lauf>/` ohne Chunks als Geisterlauf stehenbleibt.

Der Quell-Lauf geht dabei nicht verloren, sondern wird zum ersten Mal **explizit**:
jeder Stufeneintrag im Manifest trägt jetzt `run`, `runAt` und `ageH` — das Alter
gegenüber dem Publikationslauf, als Zahl.

```json
{ "id": "t3", "run": "2026090906", "runAt": "2026-09-09T06:00:00Z", "ageH": 6, … }
```

Ohne diese Felder hielte ein Leser die Fernstufe für sechs Stunden jünger, als sie
ist — er sähe nur den Verzeichnisnamen. Der Fehler wäre nicht sichtbar, sondern
plausibel; das ist die schlechtere Sorte.

Nebeneffekt, und nicht der kleinste: die Aufbewahrung nach Alter (§24) löscht jetzt
**ganze, in sich geschlossene Läufe**. Vorher hätte sie `2026090906` entfernen können,
während `2026090912` stehenbleibt — und dessen Manifest hätte auf gelöschte Dateien
gezeigt.

### 26.4 Zwei Wächter statt eines Kommentars

Die Korrektur allein genügt nicht, denn der Fehler war nicht falscher Code, sondern
eine **ungeprüfte Annahme**. Zwei Stellen zählen jetzt nach, statt zu vertrauen:

1. **`verify:point-data` §3c** baut den Fall synthetisch auf dem Datenträger nach
   (t1 aus 12z, t3 aus 06z), lässt `placeUnderPublishRun` laufen und prüft: der
   Publikationslauf ist der neuere, die ältere Stufe ist umgezogen, das leere
   Verzeichnis ist weg, **die Bytes des Chunks sind unverändert**, die Pfade im
   Ergebnis sind mitgewandert, das Manifest trägt beide Stufen, jede mit ihrem
   eigenen Quell-Lauf und ihrem Alter — und jeder Chunk auf dem Datenträger steht
   im Manifest. Das ist die wörtliche Umkehrung des Befunds.
2. **`verify:point-data` §3d** hält, wenn ein gebauter Baum unter `data/point`
   liegt, jedes Laufverzeichnis gegen sein eigenes Manifest: kein Chunk ohne
   Eintrag, kein Eintrag ohne Chunk. Ohne Baum wird der Abschnitt übersprungen
   **und das gesagt** — eine Prüfung, die ohne Daten grün meldet, wäre eine Lüge.
3. **`publish-point.mjs`** wiederholt dieselbe Zählung im Repo, nach dem Schreiben
   der Manifeste und **vor** dem ersten Git-Befehl, und bricht mit Exit 1 ab. Das
   ist der Wächter, auf den es ankommt: der Verifier prüft den Bauplan, dieser hier
   prüft, was tatsächlich gepusht würde.

### 26.5 Was das über die Prüfstrategie sagt

Alle vier Selbsttests waren grün, 216 Prüfungen bestanden, und der Fehler lag
trotzdem im Ausgabeverzeichnis. Der Grund ist derselbe wie bei V-BW-51 und bei
`?fenster=48h` in SH3: **geprüft wurde der Bauplan, nicht das Bauwerk.** `chunkPath()`
war korrekt, `runManifestPath()` war korrekt, ihre Eindeutigkeit war geprüft — nur
hat niemand gefragt, ob die beiden am Ende auf dasselbe Verzeichnis zeigen.

Die Lehre für diese Linie, in einem Satz: **ein Format-Selbsttest beweist nichts
über den Baum, den der Producer schreibt.** Deshalb §3d.


## §27 Ein gelungener Push ist noch kein abgelegtes Datum (2026-09-09, nachts)

Vor dem ersten echten Push habe ich geprüft, was mit `point/` passiert, wenn die
Kartenlinie publiziert. Das Ergebnis ändert nichts am Format, aber es ändert, was der
Publisher nach dem Push tun muss.

### 27.1 Wie die Kartenlinie publiziert

`scripts/publish-repack.mjs` legt **keinen** Commit auf den Bestand. Es klont das
Daten-Repo flach, legt die frischen Läufe darüber, **wirft `.git` weg**, macht ein
`git init`, committet den ganzen Baum als neuen Wurzel-Commit und **force-pusht** ihn
auf `main` (Zeile 216 ff.). Der Grund ist gut: ohne das wüchse die Historie um 5,35 MiB
je Lauf, für immer.

Für `point/` hat das zwei Folgen, eine gute und eine gefährliche.

**Die gute — die Historie wächst nicht.** Ich war davon ausgegangen, dass ≈ 50 MiB je
Punkt-Lauf bei vier Läufen am Tag die Historie um ~200 MiB täglich aufblähen würden
(≈ 73 GB im Jahr), was „dauerhaft bereitstellen" schlicht unmöglich machte. Das stimmt
nicht: der Force-Push der Kartenlinie ersetzt achtmal am Tag die gesamte Historie von
`main`. Alte Punkt-Chunks verschwinden mit ihr. Das Repo bleibt bei seiner
**Arbeitsbaum**-Größe — mit der 24-Stunden-Regel also ≈ 200–260 MiB.

**Die gefährliche — ein Push kann spurlos verschwinden.** Zwischen dem Klon der
Kartenlinie und ihrem Force-Push liegen rund 20 Sekunden. Was in diesem Fenster
ankommt, ist danach weg: kein Konflikt, keine Fehlermeldung, der Commit existiert
einfach nicht mehr. Der Radar-Spiegel lebt seit Monaten damit (daher die Regel „nie ins
Publish-Fenster pushen"), aber er pusht alle 1–2 Minuten und heilt sich dadurch selbst.
Der Punkt-Cube pusht viermal am Tag — bei ihm wäre das Loch bis zu sechs Stunden groß.

### 27.2 Was der Publisher jetzt tut

Nachsehen statt glauben. Nach dem Push wird `origin/main` geholt und geprüft, ob
`point/index.json` und das Manifest des jüngsten Laufs **dort** stehen:

```
git fetch origin main
git cat-file -e origin/main:point/index.json
git cat-file -e origin/main:point/<lauf>/run.json
```

Fehlt eines, ist die Meldung laut und benennt die wahrscheinlichste Ursache; der
Exit-Code ist 1. Und der **jsDelivr-Purge hängt an dieser Prüfung**: einen Index zu
purgen, den es am Origin nicht gibt, hieße die letzte gute Fassung im CDN durch eine
404 zu ersetzen — der Purge machte den Schaden also größer statt kleiner.

Das Fenster wird damit nicht geschlossen, sondern **sichtbar**. Schließen könnte es nur
die Kartenlinie selbst (indem sie ihren Klon unmittelbar vor dem Push auffrischt), und
die ist eine STOPP-&-FRAGEN-Zone — ein Thema, eine Phase.

### 27.3 Die Taktung, die dazu gehört

Die Vorlage lässt den Punkt-Lauf um :10 der Stunden 02/08/14/20 starten; die
Kartenlinie pusht um :20 der Stunden 0/3/6/9/12/15/18/21 und um :30 der Stunden
2/5/8/11/14/17/20/23. Ein Punkt-Lauf braucht gemessen 20–40 Minuten — er landet also
regelmäßig **genau auf** dem :30-Slot der Kartenlinie in derselben Stunde.

Das ist eine Kollision durch Konstruktion, kein Zufall. Sie ist als E-19 notiert; die
Nachprüfung aus 27.2 fängt den Schaden auf, aber die saubere Antwort ist eine Taktung,
die sich nicht überschneidet (die Stunden 01/04/07/10/13/16/19/22 sind frei von jedem
Repack-Slot, und 01/07/13/19 liegen genauso richtig zu den Modellläufen wie 02/08/14/20).

**E-19 — Slots verschieben?** Vorschlag: `10 1,7,13,19 * * *` statt `10 2,8,14,20`.
Gleiche Modelllage, keine Überschneidung mit der Kartenlinie. Nicht selbst geändert,
weil die Slot-Wahl an ECMWF-Bereitstellungszeiten hängt, die ich nicht gemessen habe —
und eine Taktung nach Vermutung wäre schlechter als die dokumentierte Kollision.

> ⚠ **Dieser Vorschlag war falsch und ist in §31 durch eine Messung ersetzt.** Um 01:10
> ist nicht einmal ICON-D2 fertig (Lauf + 1,35 h). Der Satz „01/07/13/19 liegen genauso
> richtig zu den Modellläufen" oben war genau die Vermutung, vor der derselbe Absatz
> warnt. Gültig ist **`50 3,9,15,21`**.


## §28 Die Beschreibung war strenger als die Rechnung (2026-09-09, nachts)

Beim Lesen des ersten vollständigen Laufs fiel eine Zeile auf, die nicht zusammenpasste:

```
── Stufe t2 · 0.1° · 101×121 · 24 Schritte 51–120 h
  zugeordnet: icon_eu@2026090912 (5 Std.)
  zweite Meinung (nur σ): icon_global@2026090912 (24 Std.) · aicon (24) · ifs_hres (24)
```

Die zugeordnete Quelle deckt **5 von 24** Stunden. Wenn die anderen drei wirklich nur
für σ gelesen würden, hätte t2 für 19 Stunden gar keinen Mittelwert. Es hat aber einen.

### 28.1 Was der Code tut

Nachgelesen an der Kombinationsschleife: `ids = [...usable, ...diversity]`, und die
Mittelung läuft über **alle** Beitragenden mit gleichem Gewicht. Die als „zweite
Meinung" geführten Quellen sind also **im Mittelwert**, nicht daneben.

Das ist auch richtig so, solange Σ ungemessen ist: PAP 2 verlangt
`w = Σ⁻¹1/(1ᵀΣ⁻¹1)`, und ohne Σ ist „gleiche Gewichte" der dokumentierte Rückfall
(§21 (4)). Eine Trennung in „diese zählen, jene nicht" wäre eine Gewichtung von 1 und 0
— also eine noch stärkere Behauptung über Σ, nicht eine schwächere.

**Falsch war nicht die Rechnung, sondern der Satz darüber.** In `runManifest()` stand
„`diversity` = nur als zweite Meinung für σ_div gelesen", und dieselbe Formulierung war
in `CLAUDE.md` und in der Konsolenausgabe gelandet. Eine Beschreibung, die strenger
klingt als die Rechnung, ist schlimmer als keine: sie lädt dazu ein, dem Mittelwert eine
Homogenität zu unterstellen, die er nicht hat.

### 28.2 Die Folge, die benannt werden muss

Wo Quellen verschiedener Maschenweite in dieselbe Zelle fallen, enthält `σ_div` auch die
**Auflösungsdifferenz** — nicht nur Vorhersageunsicherheit. In t2 betrifft das kurz nach
dem Lauf 19 der 24 Stunden. Für PAP 6 ist das erheblich: dort entscheidet der Vergleich
σ_ens gegen σ_div über den Zweig, und ein zu großes σ_div verschiebt diese Entscheidung.

Das Manifest sagt es jetzt selbst:

```json
"fusion": {
  "weights": "equal",
  "resolutionCaveat": "Wo Quellen verschiedener Maschenweite in dieselbe Zelle fallen,
     enthält σ_div auch die Auflösungsdifferenz … `sources[].role` und `fromH/toH` sagen,
     wo das der Fall ist …"
}
```

und je Quelle stehen `role` (`assigned` = laut Quellenmatrix zugeordnet, `diversity` =
zusätzlich gelesen) sowie `steps` — daran ist ablesbar, welcher Teil eines Bandes von
welcher Auflösung getragen wird.

### 28.3 Warum es nicht „repariert" wurde

Naheliegend wäre gewesen, die groben Quellen aus dem Mittel zu nehmen. Das hätte t2 für
19 von 24 Stunden **leer** gemacht — ein Produkt, das ehrlicher klingt und weniger kann.
Und es wäre eine Änderung am Algorithmus gewesen, die Jans Auftrag ausdrücklich
ausschließt („der Algorithmus selbst soll noch nicht implementiert oder grundlegend
verändert werden"). Die Datenlinie liefert; die Bewertung, ob ein grobes Modell im Mittel
mitlaufen darf, gehört zur Fusion — und die braucht dafür Σ aus `buscosun-archiv`.

Drei Prüfungen in `verify:point-data` halten den Stand fest: dass die Beschreibung die
Behauptung „nur für σ" **nicht** mehr enthält, dass der Auflösungsvorbehalt im Manifest
steht, und dass die Rolle je Quelle geführt wird.

### 28.4 Der Lauf, der veröffentlicht wird

```
t1  0,05°  201×241  49 Schritte 0–48 h    208 Chunks  46,66 MiB  23/27 Ebenen
    zugeordnet icon_d2@12z (49 h) · dazu icon_eu@12z, ifs_hres@06z, aifs_single@06z
t2  0,10°  101×121  24 Schritte 51–120 h   56 Chunks   5,10 MiB  22/27 Ebenen
    zugeordnet icon_eu@12z (5 h) · dazu icon_global@12z, aicon@12z, ifs_hres@06z
t3  0,25°   41×49   36 Schritte 126–336 h  12 Chunks   0,76 MiB  20/27 Ebenen
    zugeordnet icon_global@12z, aicon@12z, ifs_hres@06z, aifs_single@06z
────────────────────────────────────────────────────────────────────────────────
    276 Chunks · 52,53 MiB · EIN Lauf 2026090912 · EIN Manifest
    Netz: 753 Dateien (1 943 MiB), 1 783 aus dem Cache, 72 nicht vorhanden
```

Durchgehend MISSING bleiben in allen drei Stufen die vier Profilfelder `gammaEff`,
`zBase`, `zInv`, `dTInv` — das ist **E-11** und kein Fehler: sie kosten 1,13 GiB Abruf je
Lauf und brauchen Jans Entscheidung. `snowlmt_sd` fehlt in t2/t3 und `gust_sd` in t3, weil
dort nur eine Quelle die Größe führt; genau dafür gibt es `srcCount`.


## §29 Veröffentlicht — und was der erste echte Push gezeigt hat (2026-09-09, nachts)

Jans Auftrag war „sodass all diese Daten in buscosun-data erscheinen". Sie erscheinen.

```
[publish-point] point/: 277 Dateien, 53.27 MiB
[publish-point] 2026090912: 276 Chunks, alle im Manifest
[publish-point] Push (Daten) in Versuch 2 gelungen.        ← Versuch 1 abgewiesen, Rebase
[publish-point] Push (Manifest) in Versuch 1 gelungen.
[publish-point] Manifest 235f4a7 nennt Daten 2e96e22
[publish-point] Der genannte Commit 2e96e22 steht auf origin/main und trägt das Lauf-Manifest.
[publish-point] Nachgesehen: point/index.json und point/2026090912/run.json stehen auf origin/main.
[publish-point] jsDelivr-Purge: 200
```

Der Rebase-Wiederholer (V-BW-58) hat sich beim ersten Einsatz bewährt: der Radar-Spiegel
war schneller, Versuch 1 wurde abgewiesen, Rebase, Versuch 2 durch.

### 29.1 Der Fehler, den der erste Push aufgedeckt hat

**Zwei Commits statt `--amend` war richtig, aber nicht genug.** Genau dieser Rebase hat
den Datencommit umgeschrieben — *nachdem* das Manifest ihn bereits genannt hatte:

```
index.json nennt: bcaeef5a8a625c2d5d256c261f3c78b8f0b51272
Datencommit ist:  fbdd1c38a66b81b3b8dd33b785789351a7d6d19d
```

Am CDN nachgemessen, nicht vermutet:

```
@bcaeef5 point/2026090912/t1/05_07.bin → 404
@main    point/2026090912/t3/00_00.bin → 200, byte-gleich
```

Ein Rebase schreibt **jeden** eigenen Commit neu. Die Regel „erst der Datencommit, dann
nennt ihn das Manifest" schützt gegen `--amend`, aber nicht gegen einen Rebase, der
zwischen beiden Schritten liegt. Die richtige Regel ist schärfer:

> **Ein SHA ist erst unveränderlich, wenn er auf dem Remote steht.**

Die Reihenfolge ist deshalb jetzt: Datencommit → **pushen** → den nun endgültigen SHA
lesen → Manifest schreiben → zweiter Commit → pushen. Wird der zweite Commit rebaset,
macht das nichts: **er nennt, er wird nicht genannt.** Dazu eine Gegenprobe, die den
Fehler beim nächsten Mal sofort sichtbar macht — der genannte Commit muss existieren,
das Lauf-Manifest tragen und auf `origin/main` enthalten sein, sonst Exit 1.

Nebenbei geschlossen: nach einem Probelauf ohne `POINT_PUSH` stehen die Commits schon,
und der zweite Lauf hätte bei „Nichts zu committen" ausgesteigen — **der Schalter hätte
nie feuern können.** Jetzt wird unterschieden zwischen „nichts zu tun" und „nichts Neues
zu committen, aber Commits warten auf den Push".

### 29.2 Was am CDN wirklich ankommt

`npm run point:check-cdn -- <commit>` holt zwei Chunks über jsDelivr und lässt sie durch
den echten Decoder laufen — **die CRC-32 im Kopf wird dabei geprüft**, ein von Git oder
einem Proxy verfälschtes Byte fiele hier auf und nicht beim Nutzer:

```
@2e96e22 point/2026090912/t1/05_07.bin
  200 · 251 259 B · 229 ms · byte-gleich zur Quelle: JA
  Kopf: Stufe 0 · nt 49 · 16×16 @ y80 x112 · runHours 496932 (2026-09-09T12:00:00Z)
  t2m    12 544/12 544 gültig ·  2,90 … 20,60 °C
  t2m_sd 12 544/12 544 gültig ·  0,00 …  7,09 °C

@main    point/2026090912/t3/00_00.bin
  200 · 108 040 B · 36 ms · byte-gleich zur Quelle: JA
  Kopf: Stufe 2 · nt 36 · 16×16 @ y0 x0 · runHours 496932
  t2m    9 216/9 216 gültig · −3,43 … 25,47 °C
  t2m_sd 2 560/9 216 gültig ·  0,05 …  9,00 °C
```

**`core.autocrlf` ist im Daten-Repo `true`** — die Chunks kommen trotzdem unverfälscht
an, weil `.gitattributes` mit `*.bin -text` vor dem `git add` geschrieben wird. Einzeln
nachgeprüft: Arbeitskopie und Git-Blob sind für t1-, t2- und t3-Chunks SHA-gleich.

### 29.3 Die Daten erklären sich selbst

Zwei Gegenproben an den Zahlen, weil „es hat gerechnet" keine Aussage über Richtigkeit ist.

**σ ist echt, keine vier Kopien derselben Zahlen.** In einem t1-Chunk sind nur **0,41 %**
der `t2m_sd`-Werte exakt null, der Rest verteilt sich sauber bis über 4,5 K (33 % unter
0,5 K, 18 % 0,5–1,0 K, … 7 % über 4,5 K).

**`srcCount` reproduziert exakt die Publikationstakte der Quellen** — ohne dass irgendwo
ein Takt hinterlegt wäre:

| `srcCount` | Schritte | welche Stunden | Erklärung |
|---|---|---|---|
| 2 | 32 | keine durch 3 teilbar | nur ICON-D2 + ICON-EU (**stündlich**) |
| 3 | 8 | 3, 9, 15, 21, 27, 33, 39, 45 | + IFS HRES (**dreistündlich**) |
| 4 | 9 | 0, 6, 12, …, 48 | + AIFS Single (**sechsstündlich**) |

Das ist die beste Art von Beleg: eine Struktur, die niemand programmiert hat, fällt aus
den Daten heraus, weil die Kette stimmt.

**Und es ist zugleich ein Befund, der gesagt gehört:** in **zwei Dritteln** der
t1-Stunden steht σ_div auf nur zwei Quellen — und beide sind ICON. Dort misst σ
weitgehend die **Auflösungsdifferenz zwischen ICON-D2 und ICON-EU**, nicht die
Meinungsverschiedenheit unabhängiger Zentren. Für PAP 6 ist das erheblich (§28.2). Der
saubere Weg dorthin ist ICON-D2-EPS (20 Member) — E-11/E-17, nicht diese Phase.

### 29.4 Stand

| | |
|---|---|
| Veröffentlicht | `point/2026090912/` — 276 Chunks, 53,27 MiB, ein Manifest |
| Datencommit | `2e96e22` (in `point/index.json` genannt und nachgeprüft) |
| CDN | `https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/point/index.json` |
| Aufbewahrung | Alter ≤ 24 h, mindestens 2 Läufe (§24) |
| Verifier | `verify:point-data` **236/236**, netzfrei, in CI |

Was noch **nicht** im Repo liegt und warum, steht unverändert in §23 und im Manifest
unter `pending`: MOSMIX (eigenes Stationsprodukt), C-LAEF und ICON-CH (Fremd-APIs), die
EPS-Member (Datenmenge = eigene Entscheidung), die vier Profilfelder (E-11, 1,13 GiB je
Lauf) und die Radarquellen (liegen schon unter `radar/`, brauchen einen Leser statt eines
Ingests). Der Cron ist weiterhin Jans Gate: `workflow-point.yml` muss von Hand ins
Daten-Repo (`MANUELLE-SCHRITTE.md` §13) — bis dahin ist der veröffentlichte Lauf ein
Einzelstand und altert.


## §30 Der Cron, nachgebaut statt angenommen (2026-09-09, nachts)

Jan hat `buscosun-web` committet und gepusht (`388c9ac`). Damit war die Voraussetzung
erfuellt, die §29.4 als offen fuehrte — der Cron holt den Producer bei jedem Lauf frisch
von GitHub:

```yaml
git clone --depth=1 --filter=blob:none https://github.com/jppetry/buscosun-web.git app
git sparse-checkout set --no-cone scripts src package.json
```

Statt das fuer erledigt zu erklaeren, habe ich **nachgebaut, was der Job tut**: frisch von
GitHub klonen, sparse auschecken, `bz2` installieren, das netzfreie Gate laufen lassen.

### 30.1 Der Befund

```
FAIL  QUELLENMATRIX.md liegt im Repo — ohne sie ist dieser Abgleich nicht moeglich
230/231 Pruefungen bestanden
```

Die Matrix **ist** committet (10 349 B). Sie liegt nur in der **Wurzel**, und das
sparse-Set des Crons ist `scripts src package.json` — sie kommt nie mit. Der
Dokument-gegen-Registry-Abgleich (§ der Check, der fuenf fehlende Eintraege fand) fiel
deshalb durch, und weil das Gate im Job **vor** dem Ingest steht, waere **jeder
planmaessige Lauf abgebrochen, bevor er ein Byte zieht**.

Lokal ist das unsichtbar: hier liegt immer der volle Baum. Es ist damit dieselbe Klasse
wie §26 und §29.1 — **geprueft wurde der Bauplan, nicht das Bauwerk.** Nur diesmal war das
Bauwerk nicht der Ausgabebaum, sondern die Umgebung, in der der Producer laeuft.

### 30.2 Die Kur an beiden Enden

1. **Die Vorlage holt die Datei mit** und prueft danach nach:

   ```yaml
   git sparse-checkout set --no-cone scripts src package.json QUELLENMATRIX.md
   git checkout --quiet
   test -f QUELLENMATRIX.md || { echo "..."; exit 1; }
   ```

   Das `test -f` ist kein Gürtel-und-Hosentraeger: **ein sparse-Muster, das nichts
   trifft, meldet von sich aus nichts** — dieselbe Stille wie beim `git add` im sparse
   Checkout (§22).

2. **Eine fehlende Dokumentationsdatei ist kein Fehlschlag mehr, sondern ein
   Ueberspringen mit Hinweis.** Ein Datenlauf darf nicht an einer Markdown-Datei
   sterben. In CI liegt der volle Baum, dort wird der Abgleich weiter erzwungen — die
   Strenge geht also nicht verloren, sie steht nur an der richtigen Stelle.

Dazu zwei Pruefungen, die die Vorlage selbst gegen diesen Fehler halten.

### 30.3 Beleg am gepushten Stand

Nach `f8342d2` derselbe Nachbau noch einmal, **vollstaendig aus GitHub**, nichts von der
Platte kopiert:

```
Klon f8342d2 · Matrix 10 349 B
OK  QUELLENMATRIX §1: jeder genannte Name loest sich auf — 28 Namen geprueft
OK  die Cron-Vorlage holt QUELLENMATRIX.md mit
OK  die Cron-Vorlage prueft das auch nach
235/235 Pruefungen bestanden.
Exit-Code des Gates: 0
```

Der Unterschied zur lokalen Zahl (238) sind genau die drei Pruefungen, die einen Baum
unter `data/point` brauchen — sie werden uebersprungen **und das wird gesagt**.

### 30.4 Werkzeugfalle, zum dritten Mal

Beim Einbau der neuen Pruefung wurde `[^
]` in einer Regex durch die
Python-in-Bash-Kette zu einem **echten Zeilenumbruch** und hat die Datei zerschossen
(`SyntaxError: Invalid regular expression: missing /`). Das ist derselbe Werkzeugfehler
wie zweimal zuvor in dieser Phase. Kur wie festgelegt: mit dem Edit-Werkzeug arbeiten und
die `NEWLINE`-Konstante nutzen — hier ganz ohne Regex:

```js
wf.split(NEWLINE).some((l) => l.includes('sparse-checkout set') && l.includes('QUELLENMATRIX.md'))
```

### 30.5 Was jetzt noch fehlt

Genau **ein** Schritt, und der ist Jans: `scripts/repack-repo/workflow-point.yml` von Hand
nach `.github/workflows/point.yml` im Daten-Repo (eine Action darf ohne `workflows`-Scope
keine Workflow-Datei pushen). Danach laeuft die Linie ohne Zutun — mit der Einschraenkung
aus E-19, dass die Slots im Publish-Fenster der Kartenlinie liegen.


## §31 E-19 erledigt: die Slots gemessen statt geraten (2026-09-09, nachts)

Jans Auftrag: „kannst du das vielleicht verschieben?" — die Cron-Slots aus dem
Publish-Fenster der Kartenlinie holen. Bevor ich sie verschiebe, habe ich nachgeholt,
was ich in §27.3 selbst als Grund fuers Nicht-Aendern genannt hatte: **die
Bereitstellungszeiten waren ungemessen.** Sie sind rueckwirkend lesbar — `Last-Modified`
der jeweils LETZTEN gebrauchten Datei sagt auf die Minute, wann ein Lauf nutzbar war.

### 31.1 Mein eigener Vorschlag war falsch

```
ICON-D2 00z  +48 h    Wed, 09 Sep 2026 01:21:30 GMT   = Lauf + 1,36 h
ICON glob 00z +180 h  Wed, 09 Sep 2026 03:31:54 GMT   = Lauf + 3,53 h
ICON-EU 00z  +120 h   Wed, 09 Sep 2026 03:41:53 GMT   = Lauf + 3,70 h
AIFS Single 00z +336  Wed, 09 Sep 2026 07:26:00 GMT   = Lauf + 7,43 h
IFS HRES 00z +336 h   Wed, 09 Sep 2026 07:34:00 GMT   = Lauf + 7,57 h
```

§27.3 empfahl `10 1,7,13,19`. **Um 01:10 ist nicht einmal ICON-D2 fertig** (01:21).
Der Satz „01/07/13/19 liegen genauso richtig zu den Modelllaeufen wie 02/08/14/20" war
exakt die Vermutung, vor der derselbe Absatz warnt — nur diesmal von mir.

### 31.2 Ein Lauf ist keine Messung

Vier Laeufe, damit die Streuung sichtbar wird statt eines Einzelwerts:

| Quelle | 18z | 00z | 06z | 12z |
|---|---|---|---|---|
| ICON-D2 +48 h | 1,35 h | 1,36 h | 1,35 h | 1,35 h |
| ICON-EU +120 h | 3,53 h | 3,70 h | 3,55 h | 3,64 h |
| IFS +144 h | 6,45 h | **7,57 h** | 6,45 h | (noch nicht) |

ICON ist bemerkenswert stabil (±0,01 h bzw. ±0,09 h). Der IFS-Unterschied ist kein
Rauschen, sondern **Bauart**: 00z und 12z sind die vollen `oper`-Laeufe bis 360 h und
brauchen ~7,6 h; 06z und 18z enden als `scda` bei 144 h und sind nach ~6,5 h da (⚠⁷ der
Quellenmatrix). Die langsamste tragende Quelle ist damit IFS `oper` bei **Lauf + 7,6 h**.

### 31.3 Der neue Takt — und warum er auch fachlich besser ist

```
- cron: '50 3,9,15,21 * * *'
```

| Slot | ICON-D2 | ICON-EU | ICON global | IFS |
|---|---|---|---|---|
| 03:50 | 00z (01:21) | 00z (03:41) | 00z (03:31) | 18z (00:26) |
| 09:50 | 06z (07:21) | 06z (09:35) | 06z (09:32) | **00z (07:34)** → volle 336 h |
| 15:50 | 12z (13:21) | 12z (15:38) | 12z (15:32) | 06z (12:26) |
| 21:50 | 18z (19:21) | 18z (21:38) | 18z (21:32) | **12z (19:34)** → volle 336 h |

Der Gewinn ist nicht nur die vermiedene Kollision. Beim alten Takt (:10 der Stunden
02/08/14/20) waren ICON-EU und ICON global des laufenden Zyklus **noch nicht fertig** —
der Ingest fiel auf den vorigen Lauf zurueck. Das war nirgends falsch (das Manifest nennt
`runAt` je Quelle), aber es waren **sechs Stunden verschenkte Frische** in t2 und t3.
Der neue Takt holt beide aus dem aktuellen Lauf, weil er 9 bzw. 12 Minuten nach ihrer
Bereitstellung liegt.

Der Abstand zu ihrer Bereitstellung ist mit 9–12 min knapp — deshalb steht die gemessene
Streuung (3,53…3,70 h) im Vorlagenkopf: sie ist der Sicherheitsabstand, und wenn DWD sie
verschiebt, muss die Messung wiederholt werden, nicht der Slot geraten.

### 31.4 Warum :50 und nicht :10

Die Repack-Slots sind `:20` der Stunden 0/3/6/9/12/15/18/21 und `:30` der Stunden
2/5/8/11/14/17/20/23. Zwischen ihnen wechseln sich Luecken von **130** und **50** Minuten
ab; die langen beginnen jeweils direkt nach einem `:20`-Slot.

`50 3,9,15,21` liegt 30 min nach einem `:20`-Slot und hat damit **100 Minuten** bis zum
naechsten Repack-Push. Bei 20–40 min Laufzeit landet der Push mit 60–80 min Abstand.

### 31.5 Ein Waechter, der es ausrechnet — mit Negativ-Kontrolle

Die Kollision war vorher nicht falsch dokumentiert, sie war **nicht ausgerechnet**.
`verify:point-data` liest jetzt die Cron-Zeilen aus **beiden** Vorlagen, expandiert sie zu
Minuten des Tages und misst den engsten Abstand:

```
OK  beide Cron-Vorlagen sind lesbar — 16 Repack-Slots, 4 Punkt-Slots
OK  kein Punkt-Slot laeuft in das Publish-Fenster der Kartenlinie
      — engster Abstand 100 min (Slot 03:50), Lauf dauert bis zu 40 min
OK  Negativ-Kontrolle: der alte Takt faellt durch dieselbe Pruefung
      — alter Slot 02:10 haette nur 20 min Abstand — der Push landete auf dem Repack
```

Die Negativ-Kontrolle ist der eigentliche Beleg: sie zeigt, dass die Pruefung ueberhaupt
etwas misst — und beziffert nebenbei, wie eng es war (**20 min Abstand bei 20–40 min
Laufzeit**). Ohne sie waere ein gruener Haken nur ein gruener Haken.

`verify:point-data` **241/241**.

### 31.6 Was das ueber die Reihenfolge sagt

In §27.3 hatte ich die Kollision beschrieben, den Vorschlag aber ausdruecklich als
ungemessen markiert und nicht umgesetzt. Das war richtig — und die Messung hat den
Vorschlag dann auch prompt widerlegt. Die Lehre ist nicht „haette ich es doch gleich
gemacht", sondern: **eine dokumentierte Vermutung bleibt eine Vermutung, auch wenn sie
plausibel klingt und in einer Tabelle steht.** Erst die 15 Minuten Messung haben aus
E-19 eine Entscheidung gemacht.

---

## §32 Der Cron läuft (2026-09-09, 17:47 UTC)

Der letzte manuelle Schritt aus §30 ist getan: `scripts/repack-repo/workflow-point.yml` liegt
als `.github/workflows/point.yml` im Daten-Repo. Commit `fb9e483`, Push `70ed806..fb9e483` —
der Token trägt den `workflow`-Scope, die Annahme aus `MANUELLE-SCHRITTE.md` §13, das müsse
Jan von Hand tun, galt nur für einen Push **aus einer Action heraus**.

Nachgeprüft am Remote, nicht am lokalen Baum: die Datei steht auf `origin/main`, misst
9 222 B und ist **byte-gleich zur Vorlage**; die Cron-Zeile lautet `50 3,9,15,21 * * *`.
Die GitHub-API meldet den Workflow als registriert:

```
active   .github/workflows/build.yml            build
active   .github/workflows/point.yml            point
active   .github/workflows/radar-watchdog.yml   radar-watchdog
active   .github/workflows/radar.yml            radar
```

Erster planmäßiger Lauf: **21:50 UTC**. Er zieht ICON-D2 18z, ICON-EU 18z, ICON global 18z
und IFS 12z, legt `point/2026090918` neben den bestehenden Lauf und lässt den älteren stehen,
bis er 24 h überschreitet (`RETENTION_HOURS`, `MIN_RUNS = 2`). Der erste Lauf hat keinen
warmen Cache und zieht ~2 GB — die gemessenen 20–40 min gelten für den eingeschwungenen
Zustand, das Timeout steht mit 330 min weit darüber.

**Damit ist die Linie geschlossen:** Producer im Anwendungs-Repo, Vorlage im Anwendungs-Repo,
Workflow im Daten-Repo, Aufbewahrung im Publisher, Auslieferung über jsDelivr.

---

## §33 Vollständigkeitsprüfung gegen `ABLAUFPLAENE.md` (2026-09-09, nach dem Cron-Start)

Jans Frage: liegen auf `buscosun-data` **alle** Daten, die der Algorithmus später braucht —
für jeden Punkt im DACH-Raum, über die ganze Quellenmatrix?

**Antwort: nein.** Der Raum stimmt vollständig, die Zeitachse trägt, aber ein Drittel der
Felder fehlt, und die Quellenmatrix ist nur in ihrer deutschen Spalte abgebildet. Alles
Folgende ist am veröffentlichten Lauf gemessen, nicht aus dem Bauplan gelesen.

### 33.1 Die Messung, und woran sie hängt

Gemessen am Baum unter `data/repo/point/2026090912`. Dass dieser Baum dem entspricht, was
wirklich auf `buscosun-data` liegt, ist einzeln geprüft: `point/index.json` vom CDN nennt
Commit `2e96e22b06a688b64851fafa9e3a8054c1297671`, `publishedAt 2026-09-09T15:49:48Z`,
**einen** Lauf `2026090912` mit `55 862 146` Bytes — identisch zum lokalen Stand.

Die Sonde dekodiert die echten Chunks (CRC geprüft) und liest an zehn DACH-Punkten
(Hamburg, Berlin, München, Zugspitze, Wien, Innsbruck, Graz, Zürich, Genf, Zermatt)
jede der 27 Ebenen über alle 109 Zeitschritte.

### 33.2 Der Raum ist vollständig, die Achse auch

276 von 276 erwarteten Chunks liegen da: t1 13×16 = 208, t2 7×8 = 56, t3 3×4 = 12. Das
Gitter beginnt bei 45,5 °N / 5,5 °E und reicht bis 55,5 °N / 17,5 °E — DACH liegt mit Rand
darin (CH ab 45,82 °N / 5,96 °E, DE bis 55,06 °N, AT bis 17,16 °E). **Kein DACH-Punkt fällt
aus dem Gitter.**

Die Achse trägt 109 Schritte (49 + 24 + 36) und damit 0–336 h. Zwei Stellen sind konstruktiv
leer, weil die Auflösung wechselt: **49 und 50 h** (t1 endet bei 48, t2 beginnt bei 51) und
**121–125 h** (t2 endet bei 120, t3 beginnt bei 126). Das ist die abgeleitete Achse aus E-10,
keine Lücke im Datum — aber ein Client, der nach „49 h" fragt, muss interpolieren.

### 33.3 Die 41 Felder, ausgezählt

| Zustand | Anzahl | Felder |
|---|---|---|
| **vollständig geliefert** | **17** | `t2m` `td2m` `u10` `v10` `clct` `ps` (1,2,3,4,7,11) · `hModEff` (17) · `h` `tpi500` `tpi2000` `svf` `z0` `dwater` `lcClass` `sx` (18–22, 25–27, Client-Rechenweg) · `sources[]` `runAt` (40,41) |
| **lückenhaft** | **6** | `gust` (5) · `precip` (6) · `clcl` `clcm` `clch` (8–10) · `snowlmt` (12) |
| **fehlt ganz** | **8** | `gammaEff` `zBase` `zInv` `dTInv` (13–16) · `d0` `imperv` (23,24) · `dah` `foehnLee` (28,29) |
| **Form da, Wert `null`** | **10** | `sigmaSys` `Sigma` `cSpread` `Ld/Lh` `A/A_uhi` `a,v_ref,ε` `phi` `dzMin` `meltOffset` `tpiSigma` (30–39) |

Die Lücken im Einzelnen, gemessen:

```
t1  0–48 h    21 Ebenen voll · precip + precip_sd fehlen bei 0 h (98 %)
              gammaEff zBase zInv dTInv nie belegt
t2  51–120 h  20 Ebenen voll · gust_sd 88 % · snowlmt 88 % · snowlmt_sd nie
t3  126–336 h  9 Ebenen voll · alle σ, gust, clcl/clcm/clch nur 126–180 h (28 %)
              gust_sd snowlmt snowlmt_sd nie belegt
```

`precip` bei 0 h ist korrekt und keine Lücke: eine Stundensumme über die Stunde vor dem
Lauf gibt es nicht.

### 33.4 Der ernsteste Befund: ab 186 h trägt **eine** Quelle

`srcCount` an München, Wien und Zürich, über die ganze Achse:

```
t1  0 h = 4 · Stunden ohne Teiler 3 = 2 · durch 3 teilbar = 3 · durch 6 teilbar = 4
t2  51–111 h = 4 · 114–120 h = 3
t3  126–144 h = 4 · 150–180 h = 3 · 186–336 h = 1
```

**150 der 336 Vorhersagestunden — 44 % des Horizonts — ruhen auf AIFS Single allein.**
IFS HRES trägt in t3 nur vier Schritte (der gegriffene 06z-Lauf ist ein `scda`-Lauf und
endet bei 144 h), ICON global und AICON enden bei 180 h. Damit ist ab 186 h `σ_div` per
Konstruktion null, und alle `_sd`-Ebenen sind dort leer.

PAP 6 sieht diesen Fall ausdrücklich vor: „Bei nur einer beitragenden Quelle wird der Nenner
von `σ_div²` exakt null; dort entfällt der Term und `σ_ges² = σ_sys² + σ_quant²`." Nur ist
`σ_sys` **ungemessen** (§33.3, Zeile 30). Praktische Folge, ehrlich gesagt: **jenseits 180 h
gibt es heute überhaupt keine Unsicherheitsinformation** — weder aus Divergenz noch aus dem
Sockel. Ein p10/p90 dort wäre erfunden.

Kur, in dieser Reihenfolge: (a) IFS HRES aus dem `oper`-Lauf (00z/12z, 360 h) statt aus dem
jüngsten — der Cron trifft ihn um 09:50 und 21:50 bereits, der Ingest greift aber nach dem
neuesten Lauf, nicht nach dem weitesten; (b) IFS ENS / AIFS ENS als echte Member (nicht als
Kontrolllauf, V-PD-9); (c) `σ_sys` aus `buscosun-archiv`.

### 33.5 Die Quellenmatrix ist länderspezifisch — der Cube ist es nicht

`srcCount` ist in München, Wien und Zürich **Stunde für Stunde identisch**. Das ist kein
Zufall der Messpunkte, sondern die Aussage: der Cube kennt keine Länder. Jeder Punkt in
Österreich und der Schweiz wird heute aus der **deutschen Spalte** der Matrix versorgt.

Von 22 Registry-Einträgen sind **6 ingestiert**: ICON-D2, ICON-EU, ICON global, AICON,
IFS HRES, AIFS Single. Gegen Jans Tabelle gehalten:

| Band | Deutschland | Österreich | Schweiz |
|---|---|---|---|
| 0–3 h | ICON-D2 ✓ · RV/RY/HG nur als Spiegel (roh, ohne Leser) | ICON-D2 ✓ · INCA nur als **PNG** | ICON-D2 ✓ · CombiPrecip/RZC nur als **PNG** · ICON-CH1-EPS ✗ |
| 3–33 h | ICON-D2 ✓ · D2-EPS ✗ · MOSMIX ✗ | C-LAEF ✗ · C-LAEF-EPS ✗ · MOSMIX-L ✗ | ICON-CH1-EPS ✗ · E4 ✗ · KENDA-CH1 ✗ |
| 33–48 h | ICON-D2 ✓ · D2-EPS ✗ · MOSMIX-L ✗ | C-LAEF ✗ · C-LAEF-EPS ✗ | ICON-CH2-EPS ✗ · E4 ✗ |
| 48–60 h | ICON-EU ✓ · EU-EPS ✗ · MOSMIX-L ✗ | C-LAEF ✗ · C-LAEF-EPS ✗ | ICON-CH2-EPS ✗ · E4 ✗ |
| 60–120 h | ICON-EU ✓ · EU-EPS ✗ · MOSMIX-L ✗ | ICON-EU ✓ · EU-EPS ✗ | ICON-CH2-EPS ✗ · E4 ✗ |
| 120–180 h | global ✓ · AICON ✓ · EPS global ✗ · IFS ✓ (4 Schritte) | dito | dito · E4 ✗ |
| 180–240 h | **AIFS Single ✓ — sonst nichts** · IFS HRES ✗ · IFS/AIFS ENS ✗ · MOSMIX-L ✗ | dito | dito · E4 ✗ |
| 240–336 h | **AIFS Single ✓ — sonst nichts** · IFS/AIFS ENS ✗ | dito | dito |

Die drei Nowcast-Quellen liegen im Repo, aber **nicht in verwendbarer Form für einen Punkt**:
RV als rohes `.tar.bz2` (verlustfrei, aber ohne Leser), INCA und RZC nur als gerenderte PNG —
ein Punktwert daraus ist auf die Palette quantisiert. Für 0–3 h trägt heute allein ICON-D2,
also genau die Quelle, die die Matrix dort als **dritte** Wahl führt.

### 33.6 Was bewusst so ist, und was eine Lücke ist

**Bewusst so** (keine Nacharbeit nötig): die zwölf Terrain-Felder sind kein Datenprodukt
(§25) — acht davon rechnet `terrainPoint.ts` am Punkt aus Terrarium und WorldCover. Die
Ensemble-Kontrollläufe bleiben draußen (V-PD-9). MOSMIX ist ein eigenes Produkt
(`point/stations/`, im Index angekündigt, **noch nicht gebaut**). Die Achsenlücken bei
49/50 und 121–125 h folgen aus E-10.

**Echte Lücken**, nach Wirkung geordnet:

1. **`gammaEff`, `zBase`, `zInv`, `dTInv` fehlen überall** (E-11, 1,13 GiB/Lauf Profil-Ingest).
   Ohne sie hat PAP 4 keine Fallunterscheidung: die Verzweigung `z_inv > z_base` ist nie
   entscheidbar, Fall B und Fall C sind unerreichbar, und Fall A muss auf
   `standardLapse = 0,0065 K/m` zurückfallen. Genau die Inversionslagen, für die der
   Algorithmus gebaut ist — Alpentäler im Winter — sind damit die, die er nicht kann.
2. **Kein `σ` jenseits 180 h** (§33.4).
3. **`calib.json` ist leer** — zehn Felder, jeder Wert `null`. `σ_sys` ist nach PAP 6
   „zwingend"; `L_d`, `L_h`, `A`, `A_uhi`, `φ`, `Δz_min` sind es für PAP 3/4/5.
4. **`imperv` und `d0` fehlen** (GHS-BUILT-S / -H, E-13) ⇒ der Wärmeinselterm `ΔT_uhi` und
   die zweistufige Blending-Height-Korrektur in PAP 5 haben keine Eingabe.
5. **`dah` und `foehnLee` fehlen** ⇒ `foehn_prob` in PAP 5 ist nicht berechenbar; der Faktor
   `(1 − foehn_prob)` stünde damit dauerhaft auf 1, also räumte kein Föhn je einen
   Kaltluftsee aus.
6. **AT und CH haben keine eigene Quelle** (§33.5).
7. **Die Nowcast-Stunden 0–3 h laufen auf dem Modell**, nicht auf dem Radar (§33.5).

### 33.7 Bewertung

Was steht, steht gut: der Raum ist lückenlos, die Achse trägt bis 336 h, die sechs
Kern-Zielgrößen liegen durchgehend vor, die Herkunft ist über `sources[].role/steps/runAt`
und `tiers[].ageH` ehrlicher ausgewiesen, als die Anforderung verlangt, und die Auslieferung
ist byte-gleich am CDN nachgemessen.

Was fehlt, fehlt **im Kern des Verfahrens**, nicht am Rand: die vier Profilfelder sind der
Unterschied zwischen „höhenkorrigierte Temperatur" und „Temperatur minus 6,5 K/km", und die
leere Kalibrierung ist der Unterschied zwischen einem Quantil und einer Zahl mit einem
Fehlerbalken daneben. Beide sind benannt (E-11, PA/`buscosun-archiv`) und beide brauchen
eine Entscheidung, keine weitere Analyse.

**Der Satz, der die Lage zusammenfasst:** das Datenfundament trägt heute den Teil des
Algorithmus, der auch ohne es funktioniert hätte — und noch nicht den Teil, für den er
entworfen wurde.

---

## §34 PD-B1: die Auswahl repariert (2026-09-09, abends)

Jans Auftrag: einen Plan, der **alle** Quellen der Matrix ins Daten-Repo bringt, für den
ganzen DACH-Raum. Der Plan steht (PD-B1…B8); diese Etappe ist die erste und die billigste —
sie holt **kein einziges neues Byte** und schließt trotzdem den schwersten Befund aus §33.

### 34.1 Zwei Fehler, die erst an neuen Quellen sichtbar geworden wären

**(a) Die Laufwahl nahm den jüngsten Lauf, nicht den weitesten.** `build-point-cube.mjs`
rief `a.discoverRun(leadHours[0])` — geprüft wurde also die **erste** Stunde der Stufe.
Für Stufe 3 (126–336 h) besteht der ECMWF-Lauf 06z diese Probe: er ist ein `scda`-Lauf und
endet bei 144 h (⚠⁷), trägt also 126 h. Er verdrängte damit den 00z-`oper`-Lauf mit 360 h.
Genau daraus entstand der Befund §33.4 — jenseits 180 h blieb AIFS Single als einzige
Quelle, `srcCount = 1`, alle σ-Ebenen leer.

Dieselbe Klasse steckte in ⚠⁵ und ⚠⁶: ICON-EU trägt bei 03/09/15/21 UTC nur 48 h statt 120,
ICON global bei 06/18 UTC nur 120 statt 180.

**(b) Die Domänen-Prüfung wurde nie aufgerufen.** `sourceMatrix.ts` führt seit PD-A je
Quelle `domain`, `clip` und `edgeMarginKm` und die Helfer `coversPoint`/`sourcesForPoint` —
und **kein Aufrufer außerhalb des Selbsttests** hat sie je benutzt. Die Fusionsschleife lief
über jede Zelle und mittelte, was endlich war. Unsichtbar, solange nur ICON-D2/EU/global/
AICON/IFS/AIFS verdrahtet sind: sie decken den ganzen Ausschnitt. Ab C-LAEF (bis 51,5 °N),
ICON-CH (`edgeMarginKm: 20`) und RADVOR RV (`clip` schneidet östlich 14,1 °E) wäre es ein
stiller Fehler — und `fillNearest` verschmiert zusätzlich bis zu drei Ringe, bei Stufe 1
rund **15 km über den Domänenrand hinaus**.

`QUELLENMATRIX.md` §2 sagt die Regel wörtlich: *„Die Quellenauswahl muss geometrisch über
die Domain entschieden werden, nicht über das Land."*

### 34.2 Was umgesetzt ist

| Datei | Änderung |
|---|---|
| `scripts/point/adapters/{dwdRegular,dwdIcosahedral,ecmwf}.mjs` | `discoverRun(leadMax, nowMs, maxBack)` — begrenzbare Rückwärtssuche |
| `scripts/point/build-point-cube.mjs` | `chooseRun()`, `domainMask()`, `applyMask()`; Maske auf Feldern **und** Orographie; `srcMask`-Grenze; Manifest um `coverage`, `geometry`, `fusion.geometry`, `fusion.runChoice` |
| `scripts/verify-point-data.mjs` | Block (3e), 18 neue Prüfungen, **241 → 259** |

`chooseRun` sucht zuerst einen Lauf, der bis zur **letzten** Stunde der Stufe reicht
(höchstens vier Slots zurück); erst wenn es den nicht gibt, den jüngsten, der wenigstens
die erste trägt. Der Registry-Horizont dient dabei nur als **Vorfilter** — reicht eine
Quelle nirgends bis zur letzten Stunde (ICON global in Stufe 3: 180 h gegen 336 h), wird
die Probe gar nicht erst gestellt. Geprüft wird danach am Objekt, nie an der Tabelle
(§21 (7)).

`domainMask` gibt **`null` zurück, wenn die Quelle den ganzen Stufenausschnitt trägt.**
Damit ändert sich für die heutigen sechs Quellen kein Byte und keine Kopie fällt an; die
Maske materialisiert sich erst für die Quellen, die sie brauchen.

### 34.3 Am echten Datum belegt

Laufwahl gegen die echten Verzeichnisse (2026-09-09 18:41 UTC):

```
t3  ifs_hres      alt 2026090906   neu 2026090900   4/36 → 36/36 Stunden
t2  (unverändert) ifs_hres 06z · icon_global/aicon/icon_eu 12z
```

Stufe 3 neu gebaut und mit dem veröffentlichten Stand verglichen, `srcCount` und
`t2m_sd` an denselben drei Punkten:

```
VORHER   München/Wien/Zürich   126–144h n=4 σ · 150–180h n=3 σ · 186–336h n=1 (kein σ)
NACHHER  München/Wien/Zürich   126–180h n=4 σ ·                  186–336h n=2 σ
```

**Damit ist der Befund aus §33.4 geschlossen:** über alle 336 Stunden tragen mindestens
zwei Quellen, und σ_div existiert durchgehend. Stufe 3 wächst dabei von 20 auf **21 belegte
Ebenen** und von 0,76 auf **1,29 MiB**.

**Der Preis, gemessen und nicht verschwiegen:** Stufe 3 zieht jetzt **944,8 MiB in 777
Dateien** und braucht **6,4 min** (vorher trug IFS dort nur vier Schritte). Das ist der
Grund, warum jede weitere Etappe ihre Laufzeit messen muss — s. 34.5.

### 34.4 Drei Korrekturen, die erst die Messung erzwungen hat

1. **Meine eigene Negativ-Kontrolle war falsch.** Sie behauptete, Wien liege in der
   RV-*Domäne* und werde erst durch `clip` entfernt. Tatsächlich endet die Domäne bei
   **15,7 °E**, Wien liegt bei 16,37 — der Test bewies über `clip` gar nichts. Der Ort, den
   erst der Schnitt herausnimmt, ist **Linz** (14,29 °E gegen 14,1) — genau die Aufzählung
   in ⚠¹ („Nicht abgedeckt: Linz, Graz, Klagenfurt, Villach, Wien"). Die Gegenprobe hat also
   getan, wofür es sie gibt: sie hat den Prüfer widerlegt, nicht den Code.
2. **Die Abdeckung darf nicht aus der Sonde folgen.** Der erste Entwurf leitete
   `coverage` daraus ab, welche Probe den Lauf gefunden hatte — und meldete an der echten
   Quelle für **AIFS Single in Stufe 2 `full` bei null gelieferten Stunden**: AIFS trägt
   120 h, aber keine 51 h (6-stündliche Achse, 51 ist kein Vielfaches von 6). Die Bandsonde
   fand den Lauf, `leadsFor` fand nichts. `chooseRun` ist jetzt **stumm zur Abdeckung**; sie
   kommt aus den gemessenen Stunden. Der Verifier hält das fest (`chooseRun` darf kein
   `coverage`-Feld zurückgeben).
3. **`members` im Manifest war immer 0.** Der Ausdruck lautete `c.adapter?.ensembleControlOnly`,
   und `contributors` trug nie ein `adapter`-Feld — dieselbe Klasse wie `sigmaKind` vor §23:
   ein Feld, das an jeder Stelle dasselbe sagt, sagt nichts.

### 34.5 Nebenbefund, nachgemessen: `ifs_ens` hat noch nie ein Feld geliefert

Der Kommentar in `ecmwf.mjs` sagte „PD-A nimmt den Kontrolllauf (`number` fehlt oder 0)".
Am Objekt geprüft (`…/ifs/0p25/enfo/20260909000000-144h-enfo-ef.index`, 2 012 902 B):
**1 800 sfc-Einträge, ausnahmslos `type: "pf"` mit `number` 1…50** — kein Kontrolllauf.
Der Filter behält davon **null**. Aufgefallen ist es nie, weil `ensembleControlOnly` die
Quelle ohnehin aus dem Mittel hält (V-PD-9). Für IFS liegt der Kontrolllauf woanders als
bei AIFS (dort `enfo-cf`); die beiden Produkte sind verschieden abgelegt. Der Kommentar
trägt jetzt die Messung; behoben wird es in PD-B8, wenn die Member wirklich gelesen werden.

### 34.6 Die Laufzeit ist die knappste Ressource — und der Deckel ist enger als gedacht

Jan hat ≤ 120 min je Lauf freigegeben. Der Verifier ist strenger: `verify-point-data.mjs`
fordert `Abstand ≥ JOB_MAX_MIN + 20` und rechnet mit `JOB_MAX_MIN = 40`. Bei 100 min
Abstand zum Force-Push der Kartenlinie ist das **tatsächliche Budget 80 min**. Und
`JOB_MAX_MIN` schreibt sich nicht selbst fort: wächst der Lauf auf 85 min, bleibt der
Verifier grün und der Push landet trotzdem im Löschfenster (§27).

**Ab PD-B4 trägt deshalb jedes Gate die gemessene Laufzeit und zieht `JOB_MAX_MIN` mit.**
Reicht es nicht, gibt es drei Auswege in dieser Reihenfolge: Slot auf `:40` (110 min
Abstand), zwei Workflows mit derselben `concurrency`-Gruppe, oder `RETENTION_HOURS` auf
12 h — was Repo-Größe **und** Klondauer der Kartenlinie senkt.

### 34.7 Gate GPD-B1

| Nachweis | Ergebnis |
|---|---|
| `srcCount ≥ 2` über alle 36 t3-Schritte | ✅ 126–180 h n=4, 186–336 h n=2 |
| `t2m_sd` bis 336 h vorhanden | ✅ (vorher ab 186 h leer) |
| Quelle mit schmaler Domäne schreibt nichts außerhalb | ✅ synthetisch + Linz/Hamburg/Bern am Zellgitter |
| heutige Quellen unverändert | ✅ alle sechs ohne Maske (`domainMask → null`) |
| `verify:point-data` | ✅ **259/259** (war 241) |
| typecheck · Build · Budget | ✅ grün · grün · totalJs 1 345,8/1 350 unverändert |

---

## §35 PD-B2: σ_ens bekommt einen eigenen Ort (Schema 2, 2026-09-09)

### 35.1 Warum jetzt und nicht später

PAP 6 verzweigt **entweder-oder**: liegt ein Ensemble vor, gilt `σ = c(p,f)·σ_ens`, sonst
`σ² = σ_div² + σ_sys²`. Bis Schema 1 lagen beide Streuungsarten in **derselben** Ebene
`<var>_sd` — die Verzweigung war damit nicht entscheidbar, und `SIGMA_KIND.ensemble` war
ein Enum-Eintrag, den nichts je erreichen konnte.

Der Formatbruch verschiebt jeden Ebenenindex (27 → 36). Er ist **heute kostenlos**, weil es
noch keinen Client-Leser gibt (der ist PD2) und die Aufbewahrung 24 h beträgt — nach einem
Slot ist alles Schema 2. Später wäre derselbe Schritt eine Änderung an jedem Nutzer.

### 35.2 Was das Format jetzt sagt

| | |
|---|---|
| `<var>_sd` | Streuung **zwischen den Quellen** (σ_div). `srcCount` nennt n je Zelle. |
| `<var>_sd_ens` | Streuung **zwischen den Membern innerhalb einer Quelle** (σ_ens). `ensCount` nennt n je Zelle. |
| `ensCount` | neue Meta-Ebene neben `srcCount` — ohne n ist `E[s] = c₄(n)·σ` nicht anwendbar. Das Manifest nennt die Regel seit PD-A unter `fusion.memberBias`, und **niemand konnte sie benutzen**, weil n nirgends stand. |

`CubeVar.sigma` heißt jetzt `sigmaDiv`, daneben steht `sigmaEns`. **19 Größen + 9 σ_div +
8 σ_ens = 36 Ebenen.** `sigmaKindOf(mean, sd, ens)` liest den Zweig weiter **aus den Daten**,
nicht aus einem Flag — die dokumentierte Absage an eine `sigmaKind`-Rasterebene (§23.3) gilt
unverändert: sie galt EINEM Enum je Zelle über ALLE Größen hinweg. Getrennte Ebenen **je
Größe** sind die Konsequenz aus derselben Lehre, nicht ihr Rückfall.

⚠ Im Manifest steht ausdrücklich, dass man die beiden **nicht addieren** darf: die Member
einer Quelle streuen bereits um deren eigenes Mittel, und dieses Mittel geht anschließend
in σ_div ein. Die Summe zählte dieselbe Unsicherheit zweimal.

### 35.3 `snowlmt` bekommt kein σ_ens — und das ist gemessen, nicht vergessen

Eine Ebene, die keine Quelle je füllen kann, ist ein Feld ohne Schreiber (V-SH-11,
andersherum). Deshalb bekommt eine Größe nur dann `_sd_ens`, wenn mindestens eine
Ensemble-Quelle sie führt. An den drei DWD-EPS-Verzeichnissen nachgesehen
(`opendata.dwd.de/weather/nwp/icon-{d2,eu}-eps` und `icon-eps`, 2026-09-09): **keines führt
die Schneefallgrenze.** `snowlmt_sd_ens` gibt es deshalb nicht, und der Verifier hält den
Grund fest.

### 35.4 Die Registry war zu bescheiden — der Verifier hat es gefunden

Die neue Prüfung „jede σ_ens-Ebene hat mindestens eine Ensemble-Quelle" fiel beim ersten
Lauf durch: **`td2m`, `gust`, `ps`**. Nicht weil das Format falsch war, sondern weil die
Registry **weniger behauptete, als die Quellen liefern**. Am Verzeichnis gemessen:

| Quelle | Registry sagte | gemessen |
|---|---|---|
| `icon_d2_eps` | t2m, u10, v10, precip | + **td2m, gust, clct, clcl, clcm, clch, ps** |
| `icon_eu_eps` | t2m, u10, v10, precip | + **gust, clct, ps** (kein td_2m) |
| `icon_eps_global` | t2m, u10, v10, precip | + **td2m, gust, clct, ps** |
| `ifs_ens` | t2m, u10, v10, precip | + **td2m, clct, ps** (am `.index` abgelesen) |

Dabei ein Detail, das sonst erst in PD-B8 aufgefallen wäre: **IFS-ENS führt die Böe nur als
`10fg3`** (3-stündlich), nicht als `10fg` wie der deterministische Lauf — die
Parametertabelle in `ecmwf.mjs` findet sie deshalb heute nicht. Steht als Notiz an der
Quelle.

Das ist dieselbe Lehre wie bei den Schrittlisten (§21 (7)): **die Matrix nennt Fähigkeiten,
das Verzeichnis nennt Tatsachen.**

### 35.5 Der Container ist jetzt selbstbeschreibend

`decodeCubeChunk(bytes, { planes })` nimmt eine Ebenenliste entgegen; Voreinstellung bleibt
`CUBE_PLANES`. Ein Leser, der das Lauf-Manifest hat, kann damit **jeden** Lauf richtig
benennen — auch einen aus einem anderen Schema. Genau dafür trägt `run.json` die Ebenen mit
Skala seit PD-A; ab jetzt wird es benutzt, und **die nächste Ebenenerweiterung braucht
keinen Schemabruch mehr.**

Ohne Liste wird ein fremdes Schema **laut abgelehnt**, mit der Kur im Klartext — nicht still
falsch gelesen. Eine Liste mit falscher Länge fällt ebenfalls auf, statt alles um die
Differenz zu verschieben.

`planeManifest()` nennt je Ebene zusätzlich `of` (zu welcher Größe) und `kind`
(`mean`/`sd`/`sd_ens`), damit ein Leser die Bedeutung nicht aus dem Namen raten muss —
dieselbe Falle wie „Schlüssel ≠ Dateipräfix" (PD0 R-2).

**Sofort nutzbar geworden:** `scripts/point/check-cdn.mjs` holt die Ebenenliste jetzt aus
`run.json` desselben Laufs statt aus dem Code. Am **veröffentlichten Schema-1-Stand**
belegt: „Manifest: Schema 1 · 27 Ebenen", `t2m` und `t2m_sd` korrekt dekodiert, byte-gleich
zur Quelle. Ohne diese Änderung wäre das Werkzeug nach dem Schemasprung gegen die Produktion
gelaufen und hätte abgebrochen.

### 35.6 Der Preis, gemessen

Stufe 3 zweimal gebaut, aus demselben Cache, nur das Schema unterschiedlich:

```
12 Chunks · Schema 1  1 355 202 B · Schema 2  1 359 522 B · +0,32 %
27 gemeinsame Ebenen · 1 952 748 Werte verglichen · 0 Abweichungen
```

**Neun zusätzliche, durchgehend leere Ebenen kosten 0,32 %** — eine `int16`-Ebene aus lauter
`MISSING` komprimiert praktisch auf nichts. Und die Gegenprobe, die zählt: **kein einziger
Wert der 27 gemeinsamen Ebenen hat sich verändert.** Der Vergleich lief über den neuen
`planes`-Weg gegen die echte Schema-1-Datei — damit ist derselbe Mechanismus zweimal belegt,
synthetisch und am Datenträger.

### 35.7 Drei fest verdrahtete Schema-Zahlen entfernt

`runManifest()` schrieb `schema: 1` als Literal, und der Verifier prüfte `=== 1`. Beides war
nach dem Sprung falsch — die Klasse „fortgeschriebene Zahl" aus BW-1. Beide lesen jetzt
`CUBE_SCHEMA`. Der Ebenen-Anker bleibt bewusst eine **ausgeschriebene Zahl** (`=== 36`), denn
sein Zweck ist, eine unbeabsichtigte Änderung auffallen zu lassen; er nennt jetzt die
Herleitung dazu.

### 35.8 Gate GPD-B2

| Nachweis | Ergebnis |
|---|---|
| 36 Ebenen, Reihenfolge je Größe mean → sd → sd_ens | ✅ 19 + 9 + 8 |
| jede σ_ens-Ebene hat eine mögliche Quelle | ✅ (fand die zu enge Registry) |
| `sigmaKindOf` Wahrheitstabelle, 8 Fälle + Negativ-Kontrolle | ✅ |
| Container-Rundlauf über 36 Ebenen | ✅ 0 Abweichungen |
| Schema-1-Chunk wird laut abgelehnt, mit Kur | ✅ |
| mit Ebenenliste lesbar, falsche Länge fällt auf | ✅ synthetisch **und** am echten CDN-Stand |
| Volumendelta | ✅ **+0,32 %** (Ziel < 8 %) |
| 27 gemeinsame Ebenen wertgleich | ✅ 0 von 1 952 748 |
| `verify:point-data` | ✅ **282/282** (nach B1: 259) |
| typecheck · Build · Budget | ✅ grün · 241/241 · totalJs unverändert |

**Was noch nicht passiert:** es wird kein Ensemble gelesen, alle acht `_sd_ens`-Ebenen und
`ensCount` sind durchgehend `MISSING`. Das ist PD-B8. Diese Etappe hat den **Ort** geschaffen,
nicht den Inhalt — und das Manifest sagt genau das, statt Leere für Vollständigkeit
auszugeben.

---

## §36 PD-B3: der Nowcast bekommt einen Leser (2026-09-09)

### 36.1 Was hier fehlte — und was nicht

`adapters/index.mjs` sagt es seit PD-A selbst: RADVOR RV, INCA und CombiPrecip „liegen
bereits als Spiegel … braucht einen Leser, keinen Ingest". Die 0–3-h-Zeile der Matrix ist
also **nicht** ein Datenproblem, sondern ein Dokumentationsproblem gewesen: die Dateien
lagen da, aber nirgends stand, wie man aus ihnen einen Punktwert gewinnt.

**Korrektur an §33.5:** dort stand, INCA und RZC lägen „nur als gerenderte PNG" vor und ein
Punktwert daraus sei „auf die Palette quantisiert". Das ist zu pessimistisch formuliert. Es
sind **Werte-PNGs, keine Farbbilder** — jedes Byte ist `precipToU8(mm/h)`, die Umkehrung ist
exakt. Die echten Grenzen sind andere, und beide sind schärfer als eine Palette:

1. **Sättigung bei 20 mm/h.** Byte 255 heißt „≥ 19,96 mm/h" — ein **offener Randbin**, keine
   Messung. 20, 60 und 200 mm/h landen auf demselben Byte.
2. ⚠ **Byte 0 ist zweideutig** (s. 36.3) — die gefährlichere der beiden.

### 36.2 Was entstanden ist

| Datei | Rolle |
|---|---|
| `src/point/nowcastFormat.ts` | DIE Form: Umkehrung, Sättigungsregel, Pfade, die drei Quellen mit Gitter und Takt, Manifestblock, Selbsttest |
| `scripts/point/nowcastReader.mjs` | Node-Leser über den Spiegel — `listSlots`, `readFrame`, `readRvExact`, plus Kommandozeile |
| `src/point/manifest.ts` | `point/index.json` führt die Nowcast-Zeile |
| `npm run point:nowcast` | `point:nowcast -- <lat> <lon>` |

**Kein Byte aus dem Netz.** Alles steht schon im Daten-Repo; der Leser benutzt
`scripts/lib/png.mjs` (reines Node), `sampleRadarPoint` (dieselbe Verortung wie die Karte,
RP1/RP2) und für den verlustfreien Weg `untar` + `decodeRadolanRaw`.

**Die Domäne steht bewusst NICHT im neuen Modul** — sie steht in `sourceMatrix.ts`, und eine
zweite Fassung wäre eine zweite Wahrheit. Wer wissen will, ob eine Quelle einen Punkt trägt,
fragt `coversPoint()`; für Cube und Nowcast dieselbe Regel.

### 36.3 Der Befund: Byte 0 heißt zweierlei — und es entstand eine erfundene Trockenheit

`decodeRadolanRaw` setzt außerhalb der Radarabdeckung **`NaN`**. `precipToU8` bildet `NaN`
auf **0** ab (`!(NaN >= 0.06)` ist wahr). Damit sind „kein messbarer Niederschlag" und
„keine Radarabdeckung" im PNG **dasselbe Byte**.

Am echten Slot gemessen (RV `2609091740`, beide Wege am selben Punkt):

```
Ort         PNG (quantisiert)   roh aus tar.bz2   Differenz
Hamburg          0.0000            0.0000          0.0000
München          0.1569            0.1200          0.0369      < halber Schritt (0,0392) ✓
Berlin           0.0000            0.0000          0.0000
Köln             0.0000            0.0000          0.0000
Linz             0.0000               —               —        ⚠ erfundene Trockenheit
Wien             0.0000               —               —        ⚠ erfundene Trockenheit
```

Die linke Spalte behauptet für Linz und Wien „es regnet nicht"; die rohe Datei sagt
**`NaN`, ich sehe dort nichts**. Das DE1200-Gitter ist weit größer als das, was die Radare
erfassen — genau dafür führt die Registry `clip` (⚠¹: „Nicht abgedeckt: Linz, Graz,
Klagenfurt, Villach, Wien").

**Kur:** der Leser wendet `coversPoint()` an, **bevor** er ein Byte anfasst. Danach melden
beide Wege dieselbe ehrliche Lücke. Die Restunschärfe bleibt benannt: auch innerhalb des
`clip` kann eine einzelne Zelle in einer Radarlücke liegen und als 0 erscheinen — wer die
Unterscheidung braucht, muss für DE den verlustfreien Weg nehmen; für AT und CH gibt es ihn
heute nicht.

Nebenbei ist damit die Kodierungsaussage **belegt statt behauptet**: München weicht um
0,0369 mm/h ab, also weniger als der halbe Quantisierungsschritt — genau das Verhalten einer
Rundung zur nächsten Stufe.

### 36.4 Warum der Nowcast NICHT in den Cube gebacken wird

Die Cube-Achse hängt am **Modelllauf**: `leadH = 0` ist die Laufzeit, nicht „jetzt". Der
Punkt-Job läuft um `:50`, und der jüngste vollständige ICON-D2-Lauf ist dann gemessen
3,4–3,8 h alt. Ein RV-Frame mit +120 min deckt damit die Cube-Stunden **≈ 4 bis 6**, nicht
0–3. Ein Produkt, das viermal täglich erscheint, kann eines, das sich alle fünf Minuten
erneuert, nicht tragen.

Die Nowcast-Zeile bleibt deshalb **eine eigene Linie neben dem Cube**, zur Abfragezeit
gelesen. `point/index.json` sagt jetzt, wo sie liegt, wie die Bytes zu lesen sind, wo die
Sättigung sitzt, dass Byte 0 zweideutig ist, dass die Auswahl geometrisch erfolgt und dass
der Spiegel ein **Live-Spiegel und kein Archiv** ist (`KEEP = 12`: RV/RZC ≈ 1 h, INCA ≈ 3 h).
Die 24-h-Regel des Cubes fasst ihn nicht an.

### 36.5 `vMax` bleibt bei 20 — die Erhöhung wäre ein Produktausfall

Der Plan sah vor, im Spiegel einen zweiten Kanal mit höherem `vMax` zu schreiben. Beim
Nachsehen zeigte sich, warum die **bestehenden** PNGs dabei unangetastet bleiben müssen:
`src/sources/radarImg.ts` führt `vMax` als **Drift-Wächter** — weicht das `vMax` eines Slots
von `PRECIP_VMAX` ab, lehnt der Client den Slot ab. Eine Erhöhung von 20 auf 100 machte
also **jeden veröffentlichten Slot für jeden Leser ungültig** und schaltete das Regenradar
dunkel. Das ist keine Formatfrage, sondern ein Produktausfall.

Der Ausweg, der heute schon da ist: für Deutschland liegt das **unveränderte** `tar.bz2` im
Spiegel — `readRvExact()` liest daraus `rainRate` als `Float32`, ganz ohne Sättigung. Für AT
und CH gibt es ihn nicht; dort gilt `saturated: true` und der Aufrufer entscheidet (der Cube
schriebe `MISSING`, eine Anzeige darf „> 20 mm/h" schreiben). Ein zusätzlicher
Werte-Kanal im Spiegel bleibt möglich, ist aber eine Änderung an der **Kartenlinie** mit
eigenem Volumen und eigenem Gate — nicht Teil dieser Etappe.

### 36.6 Am lebenden Datum: die Matrix stimmt

```
$ npm run point:nowcast -- 48.137 11.575          (München)
radvor_rv @ 2609091740: +0min 0.16 · +25min 0.00 · +50min 0.00 · +75min 0.16 · +100min 0.16
            verlustfrei aus radar/rv: 0.1200 mm/h
inca      @ 20260909T1715: +15min 0.24 · +45min 0.08 · +75min 0.31 · +105min 0.00 · …
combiprecip @ 20260909T1745: +0min 0.00

$ npm run point:nowcast -- 48.209 16.373          (Wien)
radvor_rv:   deckt diesen Punkt NICHT (Domäne aus sources.json)
combiprecip: deckt diesen Punkt NICHT (Domäne aus sources.json)
inca @ 20260909T1715: +15min 0.00 · +45min 0.31 · +75min 0.16 · +105min 0.63 · +135min 1.02 · +165min 1.33
```

**In Wien trägt INCA allein**, mit steigendem Trend über 165 min — genau die Aussage von ⚠¹,
jetzt nicht mehr als Fußnote, sondern als Verhalten des Lesers.

### 36.7 Gate GPD-B3

| Nachweis | Ergebnis |
|---|---|
| Umkehrung deckungsgleich mit `precipToU8` | ✅ **0 Abweichungen über Bytes 1…254** (Rundweg auf dasselbe Byte) |
| Sättigung: 255 wird nicht zu 20 | ✅ mit Negativ-Kontrolle (naive Umkehrung ergäbe genau 20) |
| PNG gegen verlustfrei am echten Slot | ✅ Differenz 0,0369 < halber Schritt |
| Byte-0-Zweideutigkeit erkannt und gekurt | ✅ Linz/Wien melden jetzt beidseitig eine Lücke |
| Domäne: RV trägt Bregenz, nicht Linz/Wien; INCA trägt Wien | ✅ am Punkt **und** in der CLI |
| Manifest beschreibt den Leseweg vollständig | ✅ Formel, vMax, Schritt, Totzone, Sättigung, Zweideutigkeit, Geometrie, Vorhalt |
| Spiegel bleibt außerhalb der 24-h-Regel | ✅ |
| `verify:point-data` | ✅ **321/321** (nach B2: 282) |
| typecheck · Build · Budget | ✅ grün · 241/241 · unverändert |

**Was diese Etappe NICHT tut:** sie schreibt nichts in den Cube (s. 36.4) und ändert kein
Byte der Kartenlinie. Sie macht aus drei Dateien, die im Repo lagen, drei **benutzbare**
Quellen — und benennt dabei die zwei Eigenschaften, an denen ein Leser sonst stillschweigend
falsch gelegen hätte.

---

## §37 PD-B4: Österreich bekommt eine eigene Quelle — und ein Altfehler kommt ans Licht (2026-09-09)

### 37.1 Der Befund, der wichtiger war als die Etappe

Beim Vorbereiten des C-LAEF-Adapters fiel eine Zeile auf, die seit PD-A dort steht:

```js
let g = await c.adapter.field(c.run, leadH, varId, tier);
```

`leadH` ist die Vorhersagestunde **des Cubes**, `c.run` der Lauf **dieser Quelle**. Haben
zwei Quellen verschiedene Läufe, bezeichnet dieselbe Stunde **zwei verschiedene
Gültigzeiten** — und beide Werte landeten im selben Mittel.

Am veröffentlichten Stand nachgerechnet:

```
Publikationslauf 2026090912
  icon_global  2026-09-09T12   Versatz  0 h   gültig bei leadH=126: 2026-09-14T18
  aicon        2026-09-09T12   Versatz  0 h                          2026-09-14T18
  ifs_hres     2026-09-09T00   Versatz 12 h                          2026-09-14T06   ⚠
  aifs_single  2026-09-09T12   Versatz  0 h                          2026-09-14T18
```

**IFS trug Werte bei, die zwölf Stunden früher gültig waren.** Das verwischt den Tagesgang
im Mittel und bläht σ_div mit einem Zeitversatz auf, der wie Modelluneinigkeit aussieht.

⚠ **Der Fehler ist älter als PD-B1 — aber PD-B1 hat ihn vergrößert.** Vorher nahm IFS den
06z-Lauf (6 h Versatz), seither den weiteren 00z-Lauf (12 h). Ein Fix, der σ zurückholt,
darf σ nicht gleichzeitig verfälschen; §34 hätte ohne diese Nachprüfung eine falsche
Streuung als Erfolg verbucht.

**Kur:** der Producer rechnet in **Gültigzeit**. Der Publikationslauf ist der jüngste
beitragende Lauf; jede Quelle bekommt einen `offsetH` und wird bei `leadH + offsetH`
gelesen — im eigenen Laufraum, auch bei `leadsFor` und bei der Entakkumulation. Der
Versatz steht je Quelle im Manifest.

### 37.2 Was die Korrektur bewirkt — gemessen

Stufe 3 zweimal gebaut, gleicher Cache, nur die Übersetzung unterschiedlich:

```
t2m_sd über alle Zellen und Schritte (n = 72 324)
  ohne Versatzkorrektur : Median 3,060 K   Mittel 3,568   p90 7,280
  MIT  Versatzkorrektur : Median 1,070 K   Mittel 1,380   p90 2,750
                          ────────────────────────────────────────
                          Median −65 %     Mittel −61 %
```

**Zwei Drittel der Streuung in der Fernstufe waren der Tagesgang, nicht die Modelle.**
1,07 K Median zwischen vier Zentren bei +126…336 h ist ein plausibler Wert; 3,06 K war es
nicht — es sah nur nach mehr Information aus.

### 37.3 C-LAEF: die AT-Spalte ist nicht mehr leer

Neuer Adapter `scripts/point/adapters/geosphere.mjs`, **fünfte Zugriffsfamilie**
(Fremd-REST-API statt GRIB-Verzeichnis). Alles daran ist am Objekt gemessen:

| | gemessen |
|---|---|
| Gitter | **regulär in lat/lon**, 656 × 889 im DACH-Schnitt, Δ 0,009° × 0,0135° ⇒ `sampleRegularToTier` ohne neue Mathematik |
| Container | **HDF5**, gelesen mit `jsfive` (schon Abhängigkeit) |
| Horizont | `forecast_length: 61` ⇒ Stunden 0…60 |
| Läufe | **3-stündlich**, 6 vorgehalten ≈ 18 h |
| Latenz | 19:55 UTC ⇒ neuester Lauf 15:00, also **≈ 4,9 h** |
| Grenze | **10 Mio Datenpunkte je Anfrage** ⇒ ≤ 16 (Parameter × Schritt) je Fenster |

**Die Registry lag an fünf Stellen daneben** und ist gegen die Messung korrigiert:
`runHours` war `[0, 6, 12, 18]` (tatsächlich achtmal täglich), `retentionH` war `null`
(18 h), `kind` war `percentiles` (das ist `claef_eps`; der deterministische Datensatz
liefert einzelne Werte mit Einheit), `vars` nannte fünf statt acht Größen, `adapter` war
`null`. Auch der Selbsttest zu ⚠³ prüfte die **falsche Quelle** — die Fußnote gilt
C-LAEF-EPS, geprüft wurde `claef`.

### 37.4 ⚠ Drei verschiedene Skalen in derselben Datei

Die Felder sind `int16`, und **`jsfive` liest die Attribute nicht** (dieselbe Lage wie bei
INCA). Die Skalen mussten also gemessen werden — gegen die `geojson`-Ausgabe, die echte
Einheiten liefert, **an derselben Zelle**:

```
2t   roh      195  →     19,5 °C        ⇒ 0,1
2r   roh     7531  →    75,31 %         ⇒ 0,01
10u  roh       51  →      5,1 m/s       ⇒ 0,1
tcc  roh    10000  →      100 %         ⇒ 0,01
tp   roh      584  →    0,584 mm        ⇒ 0,001
msl  roh 10158433  → 101584,33 Pa       ⇒ 0,01
```

Eine Skala für die ganze Datei zu setzen wäre der Fehler gewesen, der schon „3 597 %
Bewölkung" erzeugt hat: mit 0,01 statt 0,1 stünde die Temperatur bei **1,95 °C statt 19,5**
— plausibel und falsch.

**Drei weitere Eigenheiten, jede eine stille Falle:**

1. **`tp` ist NICHT laufakkumuliert.** `/metadata` sagt „in the last forecast interval",
   und das Intervall ist eine Stunde. `accumulated` bleibt für C-LAEF **leer** — sonst
   entakkumulierte der Producer eine Stundensumme und bekäme Differenzen mit
   Vorzeichenwechsel.
2. **C-LAEF hat `msl`, nicht `ps`.** In die `ps`-Ebene geschrieben stünden auf der
   Zugspitze 1013 statt 700 hPa. `ps` bleibt bei dieser Quelle `MISSING`.
3. **Kein Taupunkt.** `td2m` wird aus `2t` + `2r` gerechnet (Magnus) — im Adapter als
   `derived` geführt, damit ein abgeleiteter Wert nicht aussieht wie ein gelesener.

### 37.5 Am echten Dienst belegt

```
Lauf 2026090915 · 49 Stunden (0…48)
  t2m      Wien 18,29 · Innsbruck 12,27 · Graz 20,15 · Hamburg —  · Zürich 12,04
  td2m     Wien 14,96 · Innsbruck 11,64 · Graz 10,82 · Hamburg —  · Zürich  8,89
  gust     Wien 15,41 · Innsbruck  5,24 · Graz  8,02 · Hamburg —  · Zürich  3,42
  snowlmt  Wien 3119  · Innsbruck 2601  · Graz 3180  · Hamburg —  · Zürich 1962
```

Der Taupunkt liegt an **jedem** Punkt unter der Temperatur, die Böe über dem Wind, die
Schneefallgrenze im September-Bereich — die Konsistenzbedingungen aus PAP 6 halten ohne
Nacharbeit. Und **Hamburg liefert `—`**: 53,55 °N liegt über der Domänengrenze 51,498 °N.

Ein echter t1-Bau (0–6 h) zeigt die Wirkung im Cube:

```
Quelle        Lauf           Versatz  Std.  Abdeckung  Zellen
icon_d2       2026-09-09T18      0 h     7  full       48441/48441
claef         2026-09-09T15      3 h     7  full       28920/48441
icon_eu       2026-09-09T15      3 h     7  full       48441/48441
ifs_hres      2026-09-09T12      6 h     7  full       ganz
aifs_single   2026-09-09T12      6 h     7  full       ganz

srcCount je Stunde        0  1  2  3  4  5  6
  DE Hamburg              4  2  2  3  2  2  4
  DE München              5  3  3  4  3  3  5
  AT Wien                 5  3  3  4  3  3  5
  AT Innsbruck            5  3  3  4  3  3  5
  CH Zürich               5  3  3  4  3  3  5
```

**Die Länder-Blindheit aus §33.5 ist beseitigt:** Hamburg hat durchgehend eine Quelle
weniger, München nicht. Das ist keine Landesgrenze, sondern die Domäne — genau wie
`QUELLENMATRIX.md` §2 es verlangt („C-LAEF: DE teilweise, nur < 51,5 °N | AT ✓ | CH ✓").
C-LAEF trägt **28 920 von 48 441** Zellen der Stufe.

### 37.6 C-LAEF-EPS bleibt bewusst draußen

Der Datensatz existiert und wurde geprüft: 42 Felder = 14 Parameter × p10/p50/p90,
gleiches Gitter, gleicher Horizont, **keine Einzelmember** (⚠³).

Er wird **nicht** aufgenommen, und der Grund ist seit PD-B2 schärfer als vorher: `_sd_ens`
heißt seit Schema 2 ausdrücklich „Streuung zwischen **Membern**". Aus `(p90 − p10)/2,563`
ein σ_ens zu machen setzt Normalverteilung voraus — für `t2m` vertretbar, für `precip`
(zensiert, PAP 6) nachweislich falsch. Ein **gesetzter** Wert in einer Ebene, die einen
**gemessenen** verspricht, ist der teuerste Fehler, den dieses Produkt machen kann (§21 (4)).

Der saubere Weg wären eigene Quantil-Ebenen `<var>_q10`/`_q90`. Das ist eine
Formatentscheidung, keine Adapterfrage — sie steht als benannter Pfad in `PENDING`.

### 37.7 Gate GPD-B4

| Nachweis | Ergebnis |
|---|---|
| alle Quellen tragen zur selben Gültigzeit bei | ✅ Versatz je Quelle im Manifest, σ_div −65 % |
| C-LAEF liefert am echten Dienst | ✅ 8 Größen, 49 Stunden, Lauf 2026090915 |
| Konsistenz PAP 6 (td ≤ t, Böe ≥ Wind) | ✅ an allen Punkten ohne Nacharbeit |
| `srcCount` in AT/CH > in Hamburg | ✅ 5/3 gegen 4/2 |
| C-LAEF schreibt nichts nördlich 51,5 °N | ✅ Hamburg `—`, 28 920/48 441 Zellen |
| `ps` bleibt bei C-LAEF MISSING | ✅ (nur `msl` vorhanden) |
| Registry gegen die Messung korrigiert | ✅ fünf Felder + der ⚠³-Selbsttest |
| `verify:point-data` | ✅ **332/332** (nach B3: 321) |
| typecheck · Build · Budget | ✅ grün · 241/241 · unverändert |

**Laufzeit, für das Budget aus §33.6:** der t1-Testbau über 7 Stunden zog 252 MiB in
223 Dateien. Hochgerechnet auf 49 Stunden liegt C-LAEF bei ≈ 300 MiB je Lauf — die Zahl aus
der Planung bestätigt sich.

---

## §38 PD-B4b: der Nachbarindex — 78× schneller, und ein Altfehler dabei gefunden (2026-09-09)

### 38.1 Der Blocker, selbst gemessen

`buildUnstructuredIndex` (`adapters/shared.mjs`) war `O(Zielzellen × Kandidaten)`: es
filterte die Quellzellen auf eine Umgebungsbox und suchte dann für **jede** der 48 441
t1-Zellen linear den nächsten Nachbarn. Gemessen mit einem synthetischen Zellsatz in der
Größe echter Quellen:

```
ICON global      ~6 000 Kandidaten in der Box →     1 170 ms
ICON-D2-EPS     542 040 Kandidaten            →    60 272 ms
ICON-CH1      1 150 000 Kandidaten            →   299 522 ms   = 5,0 min JE STUFE
```

Für ICON global geht es nur deshalb gut, weil die Box bloß ~7 500 der 2,95 Mio. Zellen
enthält. Drei unstrukturierte Quellen über drei Stufen hätten Viertelstunden allein für die
Nachbarsuche gekostet — bei **80 min Gesamtbudget** (§34.6) ein Blocker für B5 (ICON-CH) und
B8 (die Ensembles).

### 38.2 Die Ersetzung — und zwei Fehler auf dem Weg dorthin

Statt aller Kandidaten je Zielzelle: ein **uniformes Eimergitter** (Kantenlänge aus der
gemessenen Dichte, ~2 Kandidaten je Eimer), dann eine Ringsuche, die abbricht, sobald
bewiesen ist, dass draußen nichts Näheres liegen kann. Die alte Fassung bleibt als
`buildUnstructuredIndexBrute` stehen — ausschließlich für den Gleichheitsbeweis.

**Erster Fehler (mein eigener, gemessen statt vermutet):** die Ringsuche wurde bei einer
Quelle, die nur einen **Teil** des Ausschnitts deckt, langsamer als das Verfahren, das sie
ersetzen sollte. Jede Zielzelle nördlich des Quellenrandes ließ Ring für Ring durch leeres
Gebiet wachsen — bei 5,5° Abstand rund 315 Ringe à 8·r Eimer, mal 20 000 Zellen. Der
Testlauf brach nach über fünf Minuten ab. Kur: **Sprung auf den belegten Bereich** — alle
Kandidaten liegen dort, also ist kein Kandidat näher als der Weg dorthin, und die Suche darf
bei genau diesem Ring beginnen.

**Zweiter Fehler — und der war nicht meiner, sondern schon vorher da:** die alte Fassung
kannte **keine Entfernungsgrenze**. Sie nahm für jede Zelle den global nächsten Kandidaten,
auch wenn er 700 km entfernt lag. Für eine Quelle, die den Ausschnitt ganz füllt, fällt das
nie auf. Für eine, die nur einen Teil deckt — **C-LAEF bis 51,5 °N, ICON-CH bis 50,5 °N** —
hieße es: ein einzelner Randwert wird über halb Deutschland verteilt und sieht aus wie eine
Vorhersage.

Der reguläre Gitterweg macht es seit jeher richtig: `fillNearest` extrapoliert höchstens
drei Zellen und lässt den Rest MISSING („ein Loch, das 4 Zellen von jedem Wert entfernt
liegt … gehört MISSING"). Der unstrukturierte Weg zieht jetzt nach, mit derselben Regel plus
der eigenen Maschenweite der Quelle: `maxDist = max(3 · tier.deg, 2 · Maschenweite)`.

Am synthetischen Fall messbar:

```
Kandidaten nur im Süden, Stufe 3 (2 009 Zellen)
  neue Fassung : 1 470 Zellen bleiben LEER
  alte Fassung :     0 Zellen bleiben leer  ⇒ für 1 470 Zellen einen Wert erfunden
  dort, wo die Quelle wirklich trägt:  0 Abweichungen
```

### 38.3 Der Beweis: identisch an den ECHTEN Zellkoordinaten

Nicht an synthetischen Punkten, sondern an ICON globals wirklichem Gitter (`CLAT`/`CLON`,
2 949 120 Zellen weltweit), über alle drei Stufen:

```
Stufe   Kandidaten    neu       brute     Faktor   verschieden
  t1        7 449     228 ms   13 655 ms    60x    KEINE (48 441 Zellen)
  t2        7 502     165 ms    3 786 ms    23x    KEINE (12 221 Zellen)
  t3        7 667     174 ms      564 ms     3x    KEINE ( 2 009 Zellen)
```

**62 671 Zielzellen, null Abweichungen** — und die Entfernungskappe ändert daran nichts,
weil ICON global den Ausschnitt vollständig deckt. Genau so soll es sein: die Kappe greift
nur dort, wo vorher etwas erfunden wurde.

Was das Gleichstands-Verhalten angeht: die alte Fassung läuft über die Kandidaten
aufsteigend und nimmt nur **echt** kleinere Abstände, behält bei Gleichstand also den
kleinsten Index. Die Ringsuche läuft in anderer Reihenfolge — deshalb entscheidet sie
Gleichstände ausdrücklich über `c < best`. Ohne diese eine Zeile wären beide Fassungen
„gleich gut" und trotzdem verschieden, und der Gleichheitsbeweis fiele **zufällig** aus.

### 38.4 Was damit möglich wird

```
                            alle drei Stufen    (t1 allein, alte Fassung)
ICON-D2-EPS (542 040)            4 265 ms              60 272 ms
ICON-CH1  (1 150 000)            6 685 ms             299 522 ms
```

Aus fünf Minuten je Stufe werden **unter sieben Sekunden für alle drei**. Damit sind B5
(ICON-CH) und B8 (die DWD-Ensembles) rechnerisch tragbar — vorher waren sie es nicht.

### 38.5 Gate GPD-B4b

| Nachweis | Ergebnis |
|---|---|
| identisch zur alten Fassung, echte ICON-Koordinaten | ✅ **0 von 62 671** über drei Stufen |
| identisch, synthetisch dünn und dicht | ✅ 0 von 2 009, je zweimal |
| Gleichstand geht gleich aus | ✅ eigener Test |
| Teilabdeckung: leer statt erfunden | ✅ 1 470 leer (alt: 0) |
| Teilabdeckung: innerhalb der Reichweite identisch | ✅ 0 Abweichungen |
| Tempo Stufe 1, 200 000 Kandidaten | ✅ **1 464 ms** (alte Fassung ~22 s) |
| ICON-CH1-Größe, alle drei Stufen | ✅ **6 685 ms** statt 5 min je Stufe |
| **Byte-Beweis am Ausgabebaum** | ✅ **12 von 12 Chunks byte-gleich** — ICON global + AICON, Stufe 3, vor und nach Umbau |
| `verify:point-data` | ✅ **342/342** (nach B4: 332) |
| typecheck (`tsc -b --force`, voller Neudurchlauf) | ✅ 0 Fehler, Exit 0 |
| Build | ✅ 241/241 |
| Budget | ⚠ **rot — aber nicht aus PD-B** (s. 38.6) |

### 38.6 Das Budget ist rot — und zwar aus einer anderen Linie

`npm run budget` meldet zwei Überschreitungen: `largestChunk` **300,9 KB > 292,3** und
`totalJs` **1 365,2 > 1 362`. Die Ursache liegt **nicht** in PD-B, und das ist gemessen,
nicht behauptet:

**Kein einziges Punkt-Modul steht im Bundle.** Textsonde auf `dist/assets/*.js` nach den
Signaturen dieser Phase — `sd_ens`, `ensCount`, `BSPC`, `geosphere-grid`, `nowcastFromU8`,
`C-LAEF AlpeAdria`, `Randbin`: **null Treffer, in null Chunks.** Rollup schüttelt sie
vollständig heraus, genau wie PD-A es angelegt hat („Bundle bleibt unberührt, solange kein
Client-Modul importiert"). Ein Repo-weiter Grep bestätigt es an der Wurzel: **kein
`.ts`/`.tsx` unter `src/` importiert `point/cubeFormat`, `point/manifest`,
`point/sourceMatrix` oder `point/nowcastFormat`.**

Gewachsen ist der **FireRoute**-Chunk (281,7 → 300,9 KB), und zwar aus der parallel
laufenden Brandradar-Linie: `budget.json` trägt selbst einen Eintrag vom 2026-09-09
(„Brandradar-Charts auf nivo", Grenze `totalJs` 1 350 → 1 362, gemessen 1 355,4 /
`largestChunk` 291,1). Seither ist **`@nivo/radar`** dazugekommen — für ein neues
`src/fire/dossier/FireProfileChart.tsx` (Brandprofil als Radar-Netz). Die Notiz sagt
„keine einzige neue Abhängigkeit"; in `package.json` stehen jetzt **14 statt 13**
Laufzeit-Abhängigkeiten, und `largestChunk` ist auf 300,9 gestiegen. Die Linie ist
erkennbar mitten in der Arbeit (`src/fire/charts/nivoTheme.ts` und
`src/fire/detail/fireProfile.ts` sind noch untracked).

**Die Ratsche bleibt hier unangetastet.** Sie anzuheben hieße, eine fremde Regression zu
verdecken und eine Entscheidung zu treffen, die dieser Phase nicht gehört — dieselbe Lage
wie in §22 beschrieben: „Wer Gates abnimmt, muss wissen, dass der Baum nicht allein ihm
gehört."

**Die Lehre dieser Etappe:** eine Optimierung, die nur am günstigen Fall gemessen wird, ist
keine Messung. Der erste Entwurf war am dichten, voll abgedeckten Gitter tausendfach
schneller — und am **teilweise** abgedeckten langsamer als das Original. Erst der Fall, für
den die Etappe gebaut wurde, hat beides gezeigt: den Tempoeinbruch und den Altfehler, der
seit PD-A darunter lag.

---

## §39 Der Etappenplan PD-B5…B9 — rekonstruiert, nicht wiederhergestellt (2026-09-10)

**Dieser Abschnitt ist eine Rekonstruktion.** Die Etappenliste, auf die §34 sich beruft
(„Der Plan steht (PD-B1…B8)"), wurde nie niedergeschrieben; die Session, die sie im Kopf
trug, brach nach PD-B4b ab. Ein Grep über alle `.md`, `.ts` und `.mjs` des Repos findet
**PD-B5, PD-B6, PD-B7 und PD-B9 kein einziges Mal**. Was hier steht, ist also aus dem
Ist-Stand abgeleitet — und das ist ausdrücklich gesagt, damit niemand es später für ein
Zitat des ursprünglichen Plans hält.

Abgeleitet wurde aus drei Quellen, die alle im Repo liegen und alle gemessen sind:
`PENDING` in `scripts/point/adapters/index.mjs` (13 nicht ingestierte Quellen, je mit
Grund), `TIER_BANDS` in `src/point/cubeFormat.ts` (welche Quelle welche Stufe tragen
soll), und §33 (welche der 41 Felder fehlen, nach Wirkung geordnet).

### 39.1 Eine Nummer war schon vergeben — und wird nicht verschoben

**PD-B8 ist inhaltlich festgelegt.** Es wird an **sieben** Stellen genannt, und überall
für dieselbe Sache: die echten Ensemble-Member.

| Stelle | Aussage |
|---|---|
| §34.5 (`:2300`) | `ifs_ens` hat nie ein Feld geliefert — „behoben wird es in PD-B8" |
| §35.4 (`:2381`) | IFS-ENS führt die Böe nur als `10fg3` — „ein Detail, das sonst erst in PD-B8 aufgefallen wäre" |
| §35.6 (`:2450`) | „`ensCount` sind durchgehend `MISSING`. Das ist PD-B8." |
| `CLAUDE.md:132` | „Behebung in PD-B8" |
| `scripts/point/adapters/ecmwf.mjs:120` · `scripts/point/build-point-cube.mjs:508` · `src/point/sourceMatrix.ts:314` | dieselbe Zusage im Code |

Die naheliegende Nummerierung „B5, B6, B7, B8 der Reihe nach" hätte diese sieben
Referenzen ins Leere zeigen lassen. Die Reihenfolge wird deshalb **um die feste Nummer
herum** gebaut, nicht durch sie hindurch. Das ist kein Schönheitsfehler des Plans, sondern
dieselbe Regel wie bei den Ebenen: was schon benannt ist, behält seinen Namen.

### 39.2 Der Plan

| Etappe | Inhalt | Warum an dieser Stelle | Gate |
|---|---|---|---|
| **PD-B1** ✅ §34 | Laufwahl nach Abdeckung, Domänen-Maske | erledigt | GPD-B1 |
| **PD-B2** ✅ §35 | Schema 2: `_sd_ens` + `ensCount` bekommen einen Ort | erledigt | GPD-B2 |
| **PD-B3** ✅ §36 | Nowcast-Leser für RV / INCA / CombiPrecip | erledigt | GPD-B3 |
| **PD-B4** ✅ §37 | C-LAEF (AT) + der Gültigzeit-Fix | erledigt | GPD-B4 |
| **PD-B4b** ✅ §38 | Nachbarindex 78× + Entfernungsgrenze | erledigt | GPD-B4b |
| **PD-B5** ✅ §40 | **Profilfelder** `gammaEff` / `zBase` / `zInv` / `dTInv` aus den ICON-D2-Modellleveln (E-11) | Befund 1 aus §33.6. Die Ebenen **existieren schon** (`cubeFormat.ts`, `group: 'profile'`), es fehlt nur der Rechenweg — also die größte fachliche Wirkung ohne jeden Formatbruch | GPD-B5 |
| **PD-B6** ✅ §41 | **ICON-CH1 / CH2-EPS** über STAC → CSCS | schließt die Länder-Blindheit (§33.5) ganz: AT ist seit B4 versorgt, CH nicht. Der STAC-Client existiert bereits in der Kartenlinie (`src/sources/iconChEpsSource.ts`) und ist die Vorlage | GPD-B6 |
| **PD-B7** ✅ §42 | **C-LAEF-EPS** als eigene Quantil-Ebenen `<var>_q10` / `_q90` | Jans Entscheidung vom 2026-09-10: eigene Ebenen statt `(p90−p10)/2,563`. **Muss vor B8 liegen** — nach B8 wäre es ein zweiter Ebenenindex-Bruch statt eines ersten | GPD-B7 |
| **PD-B8** ✅ §43 | **Ensemble-Member**: ICON-D2/EU/global-EPS + IFS/AIFS ENS ⇒ `_sd_ens` und `ensCount` füllen | die Nummer ist vergeben (39.1). Drei benannte Baustellen: `ensembleControlOnly`-Sprung (`build-point-cube.mjs:182`), der `.index`-Filter auf `number` statt `type` (`ecmwf.mjs:123`), und `10fg3` | GPD-B8 |
| **PD-B9** ✅ §44 | **MOSMIX-L** als eigenes Produkt `point/stations/` | Stationsquelle, anderes Datenmodell, kein Eingriff ins Gitter — deshalb zuletzt und unabhängig von allem davor | GPD-B9 |
| **PD-B10** ✅ §45 | **IFS-ENS-Member** jenseits 180 h (V-PD-27) — dazu zwei Fehler aus PD-B8: σ_ens(Niederschlag) war die Streuung einer Summe, und der ECMWF-Filter strich IFS HRES und AIFS Single | nicht Teil der Rekonstruktion: aus dem Befund in §43.12, Jans Entscheidung vom 2026-09-11 | GPD-B10 |

### 39.3 Was in JEDER dieser Etappen mitläuft

Aus den fünf abgeschlossenen Etappen sind drei Pflichten entstanden, die keine von ihnen
noch einmal einzeln begründet:

1. **Ein eigener Verifier-Block**, hinten angehängt statt eingeschoben — `(3e)` = B1,
   `(3f)` = B2, `(3g)` = B3, `(3h)` = B4, `(3i)` = B4b, also `(3j)` = B5 und so fort.
   Netzfrei, weil der Workflow den Verifier als Gate **vor** dem Ingest ruft.
2. **Die gemessene Laufzeit im Gate, und `JOB_MAX_MIN` mitgezogen** (§34.6). Das echte
   Budget ist 80 min, nicht 120, und die Zahl schreibt sich nicht selbst fort.
3. **Eine Aussage zum Volumen** — je Lauf und in der Aufbewahrung. Der Publisher hat
   **keinen Größendeckel**, nur die 24-Stunden-Regel; ab B6 (ICON-CH, ~23 MB je Variable
   und Schritt) und B8 (Member) ist das eine Stelle, die eine Entscheidung braucht statt
   einer Annahme. Dazu gehört der Cache: `POINT_CACHE` zeigt im Workflow auf
   `${{ runner.temp }}` und ist damit **flüchtig** — jeder Cron-Lauf zieht alles neu.

### 39.4 Was der Plan bewusst NICHT enthält

`kenda_ch1` (Analyse, keine Vorhersage), `mosmix_s` (dasselbe Datenmodell wie MOSMIX-L,
nur stündlich), `gfs` (Rückfall, in §1 der Matrix nicht als tragende Quelle geführt) und
**E4 Local Forecast** (Benchmark, nicht Quelle — ⚠⁴ und §21 (8)). Alle vier bleiben in
`PENDING` mit ihrem Grund. Ebenso bleibt der Nowcast außerhalb des Cubes: seine Achse
hängt am Radarslot, nicht am Modelllauf (§36.4).

---

## §40 PD-B5: die Profilfelder — und der Beweis kommt aus dem Tagesgang (2026-09-10)

Die Etappe schließt Befund 1 aus §33.6: `gammaEff`, `zBase`, `zInv` und `dTInv` waren in
**keiner** Zelle und keiner Stunde belegt. Die Folge stand in PAP 4 und war kein Schönheits-
fehler: die Verzweigung `z_inv > z_base` ist ohne diese Felder nie entscheidbar, **Fall B und
Fall C sind unerreichbar**, und Fall A fällt auf `standardLapse = 6,5 K/km` zurück. Genau die
Inversionslagen, für die der Algorithmus entworfen wurde, konnte er nicht.

### 40.1 Was NICHT gebaut werden musste

Zwei Dinge waren schon da, und das hat die Etappe billig gemacht:

**Die vier Ebenen existieren seit PD-A im Format** (`cubeFormat.ts`, `group: 'profile'`,
`grib: null`) — mit Einheit, Skala und Wertebereich. **Kein Formatbruch, kein Schemabruch,
keine neue Ebene.** Es fehlte ausschließlich der Schreiber.

**Die Modelllevel liegen auf demselben regulären Gitter** wie die Single-Level-Felder. Am
Verzeichnis nachgemessen (2026-09-10, Lauf 2026091009): `t` auf **65 Vollflächen** als
`regular-lat-lon_model-level`, `hhl` auf **66 Halbflächen** — und `hhl` in **beiden**
Gitterformen, also auch regulär (132 Dateien = 66 ikosaedrisch + 66 regulär). Damit ist es
**keine neue Zugriffsfamilie**: `sampleRegularToTier` trägt unverändert, es braucht keine
CDO-Gewichte und keinen zweiten Decoder.

### 40.2 Die Levelzahl ist gemessen, nicht gesetzt — und E-11 lag daneben

E-11 empfahl **15 Level**. Die Empfehlung war eine Schätzung; die Level folgen aber dem
Gelände, und wie weit 15 davon reichen, hängt vom Punkt ab. An `hhl` nachgemessen, Höhe über
Grund:

| Halbfläche | Hamburg (14 m) | München (531 m) | Innsbruck (757 m) | Zermatt (1 878 m) |
|---|---|---|---|---|
| 51 (= 15 Level) | 1 134 m | 1 031 m | 1 043 m | 872 m |
| 47 | 1 649 m | 1 498 m | 1 506 m | 1 247 m |
| **46 (= 20 Level)** | **1 792 m** | **1 628 m** | **1 634 m** | **1 349 m** |

Der Abstand wächst von **20 m** an der untersten Fläche auf ~150 m in 2,5 km. 15 Level enden
bei 870–1 135 m über Grund: nächtliche Talinversionen sind damit erfasst, **Absinkinversionen
nicht** — und die sind der Fall, in dem eine Höhenkorrektur ohne Fallunterscheidung am
weitesten danebenliegt. Deshalb **20 Level** (65…46). Die Zahl steht mit dieser Begründung im
Adapter und ist über `POINT_PROFILE_LEVELS` verstellbar.

### 40.3 Die eine Entscheidung, die keine Rechenfrage ist: **nicht mitteln**

Alle Zielgrößen werden über die Quellen gemittelt. Die Profilfelder **nicht** — sie kommen
aus genau einer Quelle, und das steht als `provenance: "single-source"` samt Begründung im
Manifest.

Der Grund: **der Mittelwert zweier Inversionsobergrenzen ist keine Inversionsobergrenze.**
Sagt eine Quelle „Inversion bis 400 m" und die andere „keine Inversion", stünde nach der
Mittelung „200 m" im Cube — eine Schicht, die kein Modell kennt und die PAP 4 in Fall B
schickt, wo kein Modell einen Fall B sieht. Bei einer Temperatur ist das Mittel die bessere
Schätzung; bei einer Schichtgrenze ist es eine Erfindung. Dieselbe Lehre wie bei der
zurückgezogenen `sigmaKind`-Ebene (§23.3) und bei ⚠³ (§37): ein gesetzter Wert in einem Feld,
das einen gemessenen verspricht, ist der teuerste Fehler dieses Produkts.

Genommen wird die erste Quelle der Stufe, die Profile führt — `tier.sources` ist nach
Auflösung sortiert, also die feinste zuerst. Die Domänenmaske gilt auch hier: sonst trüge eine
Zelle das Profil einer Quelle, die sie gar nicht abdeckt (derselbe Grund wie bei `hModEff`).

### 40.4 Der eigentliche Beleg: das Feld kennt den Tagesgang, ohne dass es ihm jemand sagt

Dass eine Rechnung Zahlen produziert, sagt nichts über ihre Richtigkeit. Der Beweis ist
deshalb nicht „die Ebene ist belegt", sondern eine Aussage, die **nur dann herauskommt, wenn
die Physik stimmt**. Gemessen am Lauf 2026091012, Stufe 1, gleicher Code, nur andere Stunden:

| Vorhersagestunden | Gültigzeit (UTC) | Zellen mit `zInv > zBase` |
|---|---|---|
| 0–5 h | 12–17 Uhr, **Tag** | **12,5 %** |
| 12–17 h | 00–05 Uhr, **Nacht** | **68,2 %** |
| 18–23 h | 06–11 Uhr, Übergang | 33,5 % |

Das ist der Tagesgang der Strahlungsinversion — nachts fünfeinhalbmal so häufig wie mittags,
morgens im Abbau. **Nirgends im Code steht „Tag" oder „Nacht".** Die Zahl entsteht allein
daraus, dass die Temperatur in den untersten 20 Modellleveln nachts mit der Höhe zunimmt.
Käme sie nicht heraus, wäre die Vorzeichenkonvention gedreht oder die Suche kaputt — und
beides sähe am Wertebereich unauffällig aus.

**Nebenwirkung, die den Zeitraster entscheidet:** ein Feld, das zwischen 12 % und 68 %
schwankt, hat eine Stundenstruktur. Der Vorschlag aus E-11, dreistündlich zu messen, hätte
den Auf- und Abbau der Inversion verwischt. Der Producer rechnet deshalb im **Raster der
Stufe** (t1: stündlich); `POINT_PROFILE_STEP_H` kann es vergröbern, wenn die Laufzeit es
verlangt.

### 40.5 Volumen gemessen, Laufzeit ehrlich offen

Derselbe Bereich (6 Stunden, Stufe 1, nur ICON-D2), einmal mit und einmal ohne Profil, beide
mit kaltem Cache:

| | Dateien | Abruf | Ausgabe |
|---|---|---|---|
| ohne Profil (`POINT_PROFILE=0`) | 74 | 79,9 MiB | 3,51 MiB |
| mit Profil | 215 | 211,2 MiB | 4,56 MiB |
| **Differenz je 6 Stunden** | **+141** | **+131,3 MiB** | **+1,05 MiB** |

Hochgerechnet auf die volle Stufe 1 (49 Schritte): **980 Level-Dateien ≈ 892 MiB**, dazu die
Halbflächen **einmal je Lauf ≈ 14 MiB** ⇒ rund **906 MiB**. Gegen das gemessene Laufbudget
von 4,93 GiB sind das **+18 %**.

⚠ **Die Laufzeit lässt sich aus diesen beiden Läufen NICHT ableiten, und das wird hier
gesagt statt kaschiert.** Der Lauf **mit** Profil war mit 69 s **schneller** als der ohne
(132 s) — bei 2,6-facher Datenmenge. Der Durchsatz schwankte zwischen den Läufen von
0,61 MiB/s auf 3,06 MiB/s, also um den Faktor 5. Damit misst die Differenz die Leitung, nicht
die Etappe — genau die Falle, die SAT2h schon beschrieben hat („ein Leistungsanker misst
immer auch die Maschine mit; Vergleiche nur innerhalb eines Laufs"). Belastbar ist deshalb
nur das **Volumen**; die Laufzeit steht als Messung der vollen Stufe 1 in 40.7, und
`JOB_MAX_MIN` wird an ihr, nicht an einer Hochrechnung, fortgeschrieben.

### 40.6 Was bewusst draußen bleibt

**ICON-EU bekommt keine Profilfelder** (`profile: null`, mit Begründung im Adapter): es führt
74 statt 65 Level, also eine andere Levelzahl für dieselbe Schichttiefe und ein eigenes
Volumen. Ob Stufe 2 Profilfelder trägt, wird gemessen, nicht angenommen. Für Stufe 3 spricht
ohnehin wenig: sie ist sechsstündlich, und ein Feld mit Tagesgang (40.4) passt schlecht in ein
Sechs-Stunden-Raster.

**Die beiden Schwellen sind Startwerte, keine Konstanten.** `gammaDepthM` (500 m, Tiefe der
Γ-Bestimmung), `dzMinM` (50 m, Mindestmächtigkeit) und `dTMinK` (0,2 K, Mindesthub) stehen als
benannte, eingefrorene Tabelle in `profile.mjs` und **im Manifest**, zusammen mit
`calibrated: false`. Gemessen werden sie erst aus `buscosun-archiv` (Felder 30–39, E-14). Sie
im Rechenweg zu verstecken wäre dieselbe stille Konstante, die §33.3 bei zehn anderen Feldern
schon als Mangel führt.

### 40.7 Die Gegenprobe von Hand — und der Ausreißer, der die Rechnung bestätigt

Dass der Producer Zahlen schreibt, beweist nichts. Deshalb eine **unabhängig getippte**
Fassung derselben Vorschrift, angesetzt am rohen GRIB an der **nativen** Zelle (nicht am
Stufengitter), gegen den fertigen Chunk gehalten. Lauf 2026091012, +18 h (06 UTC):

| Punkt | Feld | Cube | Hand | Differenz |
|---|---|---|---|---|
| Hamburg | `zBase` / `zInv` / `dTInv` | 55 / 264 m / **3,11 K** | 52 / 261 m / **3,11 K** | 3 m / 3 m / **0,00 K** |
| Hamburg | `gammaEff` | **−5,18** K/km | −5,03 K/km | 0,15 |
| Berlin | `zBase` / `zInv` / `dTInv` | 81 / 226 m / 0,91 K | 82 / 227 m / 0,82 K | 1 m / 1 m / 0,09 K |
| München | Inversion? | **nein** | **nein** | `gammaEff` 4,11 / 3,85 |
| Innsbruck | Inversion? | **nein** | **nein** | `gammaEff` 6,67 / 6,15 |
| **Zermatt** | `zBase` | **2 336 m** | **1 888 m** | **+448 m** |

Vier von fünf Punkten stimmen auf wenige Meter und Hundertstel-Kelvin überein, und die
Ja/Nein-Aussage „Inversion" stimmt an **allen fünf**. Hamburgs `dTInv` ist auf zwei
Nachkommastellen identisch — die beiden Rechenwege wurden getrennt getippt.

**Der Ausreißer in Zermatt ist keiner.** Nachgemessen an derselben Zelle:

```
Zermatt     h_true 1608 m · hModEff 2326 m · Differenz −718 m · zBase 2336 m
Innsbruck   h_true  574 m · hModEff  760 m · Differenz −186 m · zBase  770 m
Hamburg     h_true    6 m · hModEff   17 m · Differenz  −11 m · zBase   55 m
```

`zBase` liegt im inversionsfreien Fall genau auf `hModEff` + ~10 m, also auf der untersten
Vollfläche — wie gebaut. Die Handprobe greift die **native** Zelle (Talboden 1 878 m), der
Cube mittelt den **0,05°-Block** über ein Tal zwischen Viertausendern (2 326 m). Beide Zahlen
sind für ihr Gitter richtig; die Differenz ist die Repräsentativitätslücke — und `hModEff`
reproduziert dabei die schon in §22.5 gemessenen **−718 m** in Zermatt auf den Meter.

**Das ist genau der Term, den PAP 4 korrigieren soll** (`h_true − h_mod_eff`, in Zermatt
4,7 K). Anders gesagt: die Gegenprobe zeigt nicht nur, dass die vier Felder stimmen, sondern
auch, warum es sie braucht.

### 40.8 Gate GPD-B5

| Nachweis | Ergebnis |
|---|---|
| Die vier Ebenen tragen Werte in Stufe 1 | ✅ `gammaEff` 3 427 · `dTInv` 1 429 · `zInv` 951 · `zBase` 531 KiB (18 von 36 Ebenen belegt, vorher 14) |
| **Echte Inversion gefunden und unabhängig nachgerechnet** | ✅ Hamburg 55→264 m, `dTInv` **3,11 K** in beiden Rechenwegen identisch; Berlin 81→226 m |
| **Negativ-Kontrolle: durchmischt ⇒ `zInv == zBase`** | ✅ München und Innsbruck in beiden Rechenwegen „keine Inversion" |
| **Physik-Kontrolle: Tagesgang ohne Tageszeit im Code** | ✅ **12,5 % mittags · 33,5 % morgens · 68,2 % nachts** |
| Vorzeichenkonvention Γ = −∂T/∂z | ✅ Standardatmosphäre → +6,50 K/km; Inversion → negativ (Hamburg −5,18) |
| `hModEff` und alle Zielgrößen unverändert | ✅ dieselben Ebenen, dieselben Werte; `POINT_PROFILE=0` baut den Stand vor PD-B5 |
| **Volumen gemessen** | ✅ +141 Dateien / +131,3 MiB je 6 h ⇒ volle Stufe 1 **≈ 906 MiB** (+18 % aufs Laufbudget); Ausgabe t1 32,82 MiB |
| **Laufzeit gemessen, `JOB_MAX_MIN` mitgezogen** | ✅ volle Stufe 1 kalt: **450 s / 1 589 MiB / 3,53 MiB/s**, Profilanteil ≈ 4,3 min ⇒ `JOB_MAX_MIN` **40 → 45**; engster Cron-Abstand 100 min hält (≥ 65) |
| `verify:point-data` | ✅ **380/380** (war 342) |
| typecheck · Build | ✅ 0 Fehler · 241/241 |
| Budget | ✅ 301,2/302 · 1 365,5/1 372 — Textsonde: **null** Punkt-Signaturen in `dist/assets/*.js`, kein `src/*.ts(x)` importiert die Punkt-Module |
| Veröffentlicht? | ❌ **nein, und das ist Absicht** — `POINT_PUSH` bleibt aus. Der erste Datenpush mit Profilfeldern ist Jans Gate |

### 40.9 Zwei Messfallen dieser Etappe

**(1) Der Laufzeitvergleich zweier Läufe war wertlos, und zwar zugunsten der Etappe.** Der
Lauf **mit** Profil (69 s, 211 MiB) war schneller als der **ohne** (132 s, 80 MiB). Hätte ich
diese Differenz als „Profil kostet nichts" berichtet, wäre es eine angenehme und falsche
Aussage gewesen — der Durchsatz schwankte zwischen den Läufen um den **Faktor 5**
(0,61 → 3,06 MiB/s). Belastbar ist nur, was **innerhalb eines Laufs** gemessen wird; die Zahl
im Gate stammt deshalb aus dem einen vollen Stufe-1-Lauf.

**(2) Eine Gegenprobe, die dieselbe Funktion aufruft, ist keine Gegenprobe.** `probe-check`
importiert `profile.mjs` bewusst **nicht**, sondern tippt die Vorschrift zweitens hin. Nur
deshalb ist „Hamburg `dTInv` 3,11 = 3,11" eine Aussage und keine Tautologie.

### 40.10 Verbesserungen (D-28)

**V-PD-21 · `gammaEff` ist mit `scale: 0.01` zu fein quantisiert.** Mit 3 427 KiB ist es die
**größte** Ebene der Stufe 1 — größer als `t2m` (3 376) —, weil 0,01 K/km bei einem
Wertebereich von ±40 K/km 8 000 Stufen ergibt und das Feld dadurch fast weißes Rauschen im
untersten Bit trägt. Eine Lapse-Rate auf 0,1 K/km genau ist mehr als jede Anwendung in PAP 3/4
braucht. *Mehrwert:* schätzungsweise 1–1,5 MiB je Lauf allein in Stufe 1, ohne dass irgendein
Leser einen Unterschied sähe. *Skizze:* `scale` in `CUBE_VARS` auf 0,1; der Container ist seit
PD-B2 selbstbeschreibend, ein Leser mit dem Manifest merkt nichts. Gehört zusammen mit den
Quantil-Ebenen in PD-B7, damit es **eine** Formatänderung bleibt statt zweier.

**V-PD-22 · Der Modelllevel-Abruf ist der neue größte Posten und läuft ohne Cache.**
`POINT_CACHE` zeigt im Workflow auf `${{ runner.temp }}` und ist damit flüchtig; die
Halbflächen `hhl` sind **zeitinvariant** (14 MiB je Lauf) und werden trotzdem viermal täglich
neu gezogen. *Mehrwert:* 56 MiB/Tag ohne jeden Nutzen, und bei ICON-CH (PD-B6) wird derselbe
Mechanismus deutlich teurer. *Skizze:* `actions/cache` auf die zeitinvarianten Dateien, Schlüssel
aus Modell + Gitterversion — nicht aus dem Lauf, sonst greift er nie.

---

## §41 PD-B6: die Schweiz bekommt eine eigene Quelle — sechste Zugriffsfamilie (2026-09-10)

Die Etappe schließt Befund 6 aus §33.6: `srcCount` war in München, Wien und Zürich **Stunde für
Stunde identisch**, weil der Cube keine Länder kannte. Seit PD-B4 hat Österreich C-LAEF; die
Schweiz wurde weiterhin aus der deutschen Spalte der Quellenmatrix versorgt.

Neu: `scripts/point/adapters/meteoswiss.mjs` — ICON-CH1-EPS in Stufe 1, ICON-CH2-EPS in Stufe 2.
Zugriffsfamilie 6: **STAC-Katalog plus vorsignierte S3-Objekte**.

### 41.1 Die Registry stand auf einem Verbraucher, nicht auf dem Katalog

`sourceMatrix.ts` führte für beide Modelle **fünf** Größen. Am Collection-Asset
`params_icon-ch1-eps.csv` gemessen sind es **alle zwölf** Zielgrößen des Cubes — inklusive
`TD_2M` (nativ, nicht abgeleitet wie bei C-LAEF) und `PS` (echter Bodendruck, **nicht** auf
Meeresniveau reduziert wie bei C-LAEF).

Woher die Fünf kamen, ist die eigentliche Lehre: aus `WANTED_STAC` in
`src/sources/iconChEpsSource.ts` — dem **Kartenclient**. Der holt bewusst nur fünf Größen, weil
er nur fünf zeichnet. Eine Registry, die von einem Verbraucher abschreibt, beschreibt dessen
Bedarf, nicht die Quelle. Dieselbe Klasse wie V-BW-51 und wie die fünf C-LAEF-Korrekturen in
§37.

### 41.2 Drei Fallen, die der Katalog stellt

**(1) ⚠ Unbekannte Query-Parameter werden STILL ignoriert.** `/conformance` nennt nur `core`,
`collections`, `ogcapi-features` und `item-search` — keine Filter-, Sort- oder Query-Klasse.
`?forecast:variable=T_2M` antwortet trotzdem mit **HTTP 200** und liefert `ALB_DIF`. Gegengeprüft
mit vier verschiedenen Parametern; alle vier liefern identisch die ungefilterte Seite. Dieselbe
Stille wie `git add` im sparse-Checkout (§30): Erfolg gemeldet, nichts getan.

**(2) ⚠ Der `next`-Cursor sieht konstruierbar aus und ist es nicht.** Er ist base64 von
`p=<letzte Item-ID>`, und die IDs beginnen mit `DDMMYYYY-HHMM` — also scheinbar ein
Keyset-Cursor, mit dem man direkt zum neuesten Lauf springen könnte. Am Objekt geprüft: eine
selbst gebaute, nicht existierende ID liefert **0 Items** statt eines Sprungs. Dass die
Kodierung stimmt, zeigt die Gegenprobe — derselbe Cursor dekodiert, neu kodiert und erneut
abgeschickt liefert dieselbe Seite. Der Cursor schlägt die ID **nach**; er vergleicht nicht.
Ich hätte darauf gebaut, wenn ich es nicht gemessen hätte.

**(3) ⚠ Vorsignierte URLs sind methodengebunden.** `HEAD` antwortet **403**, `GET` und
Range-`GET` antworten 200/206 — die Signatur deckt die Methode mit ab. `headOk()` aus
`shared.mjs` ist hier unbrauchbar und hätte als „Quelle hat nichts“ durchgeschlagen. Die Existenz
einer Datei folgt deshalb aus dem Katalog, nicht aus einer Sonde. Und weil `Signature` und
`Expires` bei **jeder** Enumeration wechseln, cacht der Abruf unter dem laufinvarianten
Objektnamen (`cacheKey`) statt unter der URL — ein URL-Schlüssel träfe nie, der Cache wäre da
und liefe leer.

Der Katalog ist auch teuer: `limit` ist bei **100** gedeckelt (500 und 1000 liefern 100), und an
**einer** Gültigzeit stehen bei CH1 **1 600 Items** (50 Variablen × 8 vorgehaltene Läufe ×
ctrl/perturbed) ⇒ 16 Seiten, 3,9 s, ~3 MB JSON. Deshalb wird je Gültigzeit **genau einmal**
enumeriert und daraus der Href **jeder** gebrauchten Größe gemerkt.

### 41.3 Einheiten gemessen — und die Doku hat an einer Stelle unrecht

| Größe | CSV sagt | gemessen | Folge |
|---|---|---|---|
| `TOT_PREC` | `kg m-2 s-1`, „Accumulation since Reference Time“ | **0…155 mm, laufakkumuliert** (Parameter 0/1/52) | keine Umrechnung; die CSV-Einheit ist falsch |
| `T_2M`, `TD_2M` | K | 268…303 K | → °C |
| `PS` | Pa | 60 889…102 351 Pa | → hPa |
| `CLCT`/`CLCL`/`CLCM`/`CLCH` | % | 0…100 | keine Umrechnung |
| `VMAX_10M` | m/s, „Maximum, Previous Hour“ | 0 … 35,7 | keine Umrechnung |

Die Zeile `kg m-2 s-1` ist genau die Sorte Angabe, die bei IFS **21 976 mm für Wien** erzeugt hat
(§23.3).

⚠ **`SNOWLMT` ist bitmap-maskiert:** 270 559 von 283 876 Zellen tragen einen Wert. Wo kein
Niederschlag fällt, gibt es keine Schneefallgrenze. Diese Zellen bleiben MISSING — eine 0 hieße
„Schneefallgrenze auf Meeresniveau“.

Die Zellkoordinaten und die Modellorographie kommen aus dem Konstanten-Asset und werden über die
**Parameter-Identität** gefunden (`clat` = 0/191/1, `clon` = 0/191/2, `HSURF` = 0/3/6), nicht
über Wertebereiche: eine Bereichs-Heuristik — so macht es der Kartenclient — findet `HSURF` gar
nicht.

### 41.4 Der Kontrolllauf darf hier ins Mittel — und das ist kein Bruch von V-PD-9

V-PD-9 hält Ensemble-Kontrollläufe aus dem Mittel. Der Grund war nie „Kontrollläufe sind
schlecht“, sondern: **der IFS-ENS-Kontrolllauf IST IFS HRES**, und eine bereits ingestierte
Quelle ein zweites Mal zu zählen ließe `σ_div` schrumpfen.

Für ICON-CH trifft das nicht zu: MeteoSchweiz veröffentlicht **keinen** separaten
deterministischen Lauf, der `ctrl`-Member ist die einzige Fassung, und er dupliziert keine andere
ingestierte Quelle. Deshalb `ensembleControlOnly: false` — mit genau dieser Begründung als
`controlNote` im Manifest, damit die Ausnahme nicht als Schlamperei gelesen wird. Die
`perturbed`-Member (23 MB je Variable und Schritt) bleiben PD-B8.

### 41.5 Der Wächter aus PD-B2 hat eine eigene Messung widerlegt

Beim ersten Verifier-Lauf wurde **`(3f) keine Ensemble-Größe ohne σ_ens-Ebene` rot** — wegen
`snowlmt`.

PD-B2 hatte die σ_ens-Ebene für `snowlmt` ausdrücklich weggelassen, mit gemessener Begründung:
„kein Ensemble führt die Schneefallgrenze (am Verzeichnis geprüft)“. Das galt für die drei
DWD/ECMWF-EPS-Verzeichnisse und ist für **MeteoSchweiz falsch**. Ohne die Ebene ginge die
Information beim Ingest verloren, ohne dass es je auffiele — genau der Satz, mit dem die Prüfung
in PD-B2 begründet wurde.

Aufgefallen ist es **nicht beim Lesen**, sondern weil eine Prüfung rot wurde, die für diesen Fall
gebaut war. Konsequenz: `snowlmt` bekommt `sigmaEns`, **36 → 37 Ebenen**, und `CUBE_SCHEMA` geht
auf **3**. Warum trotz selbstbeschreibendem Container eine neue Nummer: die Ebenenliste im
Manifest schützt nur Leser, die sie mitbringen; der Chunk-Kopf trägt `nvar`, und zwei
Generationen mit gleicher Schema-Nummer und verschiedener Ebenenzahl wären für einen Leser
**ohne** Manifest still verschieden. Genau davor steht die Nummer. Kosten heute: null (kein
Client-Leser, 24 h Aufbewahrung).

Zwei Zählprüfungen sind dabei von festen Zahlen auf **gezählte** umgestellt worden
(`=== 8 σ_ens` ⇒ „eine je Ensemble-fähiger Größe“) — die Lehre aus BW-1: eine fortgeschriebene
Zahl ist irgendwann eine falsche Zahl.

### 41.6 Der teuerste Befund: `chooseRun` nahm den frischesten statt des brauchbaren Laufs

Der erste volle CH1-Lauf meldete `icon_ch1_eps@2026091015 (3 Std.)` — **3 von 49 Stunden**.

Die Ursache liegt in `chooseRun` und ist **älter als PD-B6**: die Voll-Abdeckungsprobe wurde nur
gestellt, wenn `maxHorizon ≥ Bandende`. ICON-CH1 reicht 33 h, das t1-Band endet bei 48 ⇒ die
Probe entfiel ganz, und der Rückfall lautet „neuester Lauf, der Stunde 0 trägt". Das ist der
**frischeste** Lauf — und damit der am wenigsten veröffentlichte: der 15z-Lauf war zwei Stunden
alt und hatte drei Schritte publiziert.

Dieselbe Klasse wie §34.1, nur andersherum: dort gewann der kürzere Lauf über den weiteren, hier
gewinnt der jüngere über den brauchbaren. PD-B1 hatte diese Lücke sogar als **Prüfung**
festgeschrieben („keine aussichtslose Voll-Abdeckungsprobe") — die Annahme, eine solche Probe
könne „nur scheitern", war der Fehler.

**Und die naheliegende Kur reichte nicht.** Auf `min(Bandende, maxHorizon)` zu proben ergab für
CH1 45 h — denn am Katalog gemessen ist der Horizont **laufabhängig**:

```
Lauf 09-10T12:00  Alter  5 h  ->  Leads 24 30 33
Lauf 09-10T09:00  Alter  8 h  ->  Leads 24 30 33
Lauf 09-10T06:00  Alter 11 h  ->  Leads 24 30 33
Lauf 09-10T03:00  Alter 14 h  ->  Leads 24 30 33 36 42 45   <-- der einzige lange
Lauf 09-10T00:00  Alter 17 h  ->  Leads 24 30 33
Lauf 09-09T21:00  Alter 20 h  ->  Leads 24 30 33
```

**Nur 03z trägt 45 h**, alle anderen 33 — ein ⚠⁵-Fall wie bei ICON-EU. (Für 15z war zur Messzeit
noch nichts publiziert, dort ist der Wert ungemessen.) Eine Sonde auf 45 findet also nur den
03z-Lauf, und der war 14 h alt, damit jenseits von `FULL_COVER_MAX_BACK` — Ergebnis wäre wieder
der Rückfall gewesen.

Kur deshalb als **Leiter statt Sprung**: erst auf `min(Bandende, maxHorizon)`, dann auf
`min(Bandende, Regelhorizont)`, erst dann der Rückfall — höchstens zwei Sonden. Damit gewinnt der
5 h alte 12z-Lauf mit **12 von 12 möglichen Schritten** (CH1 liefert in Stufe 1 die Stunden
0, 3, … 33).

**Regressionsprobe über alle Quellen und Stufen, am echten Datum:** von 18 (Quelle × Stufe)-Paaren
ändert sich **genau eines** — ICON-CH1, von 3 auf 12 Stunden. Jede andere Quelle wählt denselben
Lauf wie vorher. Der Befund aus §34.1 bleibt unangetastet (die weiten Quellen proben weiter aufs
Bandende), und eine eigene Gegenprüfung hält das fest.

### 41.7 Die Rechteck-Hülle überschätzt — der Nachbarindex fängt es

Die Domäne ist die **Bounding-Box eines rotierten Gitters**, also an den Ecken zu großzügig
(genau der Punkt von `CH_EDGE_DISCREPANCY`: 17,7 °E ist die Hülle, nicht der Rand bei 48 °N).
Gemessen auf Stufe 1:

```
48 441 Zellen gesamt
23 203 von der Rechteck-Maske erlaubt
    63 davon OHNE Gitterzelle in Reichweite  (0,3 %)
23 140 tatsaechlich beschrieben
```

Der eigentliche Wächter ist damit **nicht** die Box, sondern die Entfernungsgrenze des
Nachbarindex aus PD-B4b — sie lässt die 63 Überhang-Zellen leer, statt einen Randwert über sie zu
verteilen. Die Nordost-Ecke der Hülle (50,4 °N / 17,6 °E) fällt schon durch `edgeMarginKm: 20`
heraus.

⚠ **Eine Spannung in den Ausgangsdokumenten, die hier entschieden werden musste.**
`QUELLENMATRIX.md` §1 führt ICON-CH nur in der Schweizer Spalte; §2 dagegen tabelliert
ausdrücklich seine Abdeckung von DE („teilweise, nur < 50,5 °N") und AT („✓ aber Randlage ⚠²")
und sagt wörtlich: „Die Quellenauswahl muss also **geometrisch** über die Domain entschieden
werden, nicht über das Land." Der Cube folgt §2 — wie bei jeder anderen Quelle auch. Praktische
Folge: München und Wien bekommen ICON-CH1 mit. Für Wien sind das 99 km bis zur Domänenhülle, also
nicht die Randlage, vor der ⚠² warnt (deren „15–20 km" ist ohnehin als V-PD-5 offen: gemessen
sind es 40,2 km an der Ostspitze Österreichs). Die frühere Registry-Notiz „die Zuordnung
entscheidet, nicht die Hülle" ist damit überholt und korrigiert.

### 41.8 Der Beleg: der Cube kennt jetzt Länder

Stufe 1, Lauf 2026091015, Quellen ICON-D2 + ICON-EU + C-LAEF + ICON-CH1:

| Ort | `srcCount` 0 h / 1 h / 3 h / 6 h / 12 h | `t2m_sd` @ 6 h |
|---|---|---|
| Hamburg | 2 · 2 · 2 · 2 · 2 | 0,25 K |
| Berlin | 2 · 2 · 2 · 2 · 2 | 0,58 K |
| München | **4 · 3 · 4 · 4 · 4** | 0,75 K |
| Wien | **4 · 3 · 4 · 4 · 4** | 0,58 K |
| Innsbruck | **4 · 3 · 4 · 4 · 4** | **1,09 K** |
| Zürich | **4 · 3 · 4 · 4 · 4** | **1,03 K** |
| Genf | **4 · 3 · 4 · 4 · 4** | 0,61 K |

Vor PD-B4 war diese Spalte überall gleich. Jetzt trennt sie Norddeutschland (zwei Quellen) vom
Alpenraum (vier), und der Takt 4/3/4 ist das dreistündliche Raster von C-LAEF und ICON-CH.

**Nebenbefund, der nicht bestellt war:** `t2m_sd` folgt der Geländekomplexität — Innsbruck 1,09 K
und Zürich 1,03 K gegen Hamburg 0,25 K. Die Modelle sind sich im Flachland einig und im Gebirge
nicht, und das steht jetzt als Zahl im Cube statt als Vermutung.

### 41.9 Kosten gemessen

| | je Schritt | Schritte | je Lauf |
|---|---|---|---|
| **ICON-CH1** (Stufe 1) | **26,4 MiB** (12 × 2,24) | 12 (0…33 h, dreistündlich) | **317 MiB** |
| **ICON-CH2** (Stufe 2) | **6,5 MiB** (12 × 0,554) | 24 (51…120 h) | **156 MiB** |
| Konstanten (zeitinvariant) | — | einmal | 41 MiB (CH1 32,9 + CH2 8,1) |

CH1 stündlich wäre **1,21 GiB** je Lauf gewesen — ein Fünftel des gesamten Laufbudgets für eine
Quelle. Das dreistündliche Raster ist damit keine Bequemlichkeit, sondern Jans Vorgabe für PD-B
(„Ensembles nur als Mittel + σ_ens in grobem Zeitraster") mit einer Zahl dahinter.

### 41.10 Gate GPD-B6

| Nachweis | Ergebnis |
|---|---|
| Beide ICON-CH-Quellen haben einen Adapter und sind aus `PENDING` raus | ✅ |
| Alle zwölf Zielgrößen, gegen den Katalog geprüft | ✅ `params_*.csv` + am Feld; Registry von 5 auf 12 korrigiert |
| **Der Cube kennt Länder** | ✅ Hamburg/Berlin `srcCount` 2, Alpenraum 4 (vorher überall gleich) |
| Domäne trägt CH, aber nicht Norddeutschland | ✅ Zürich/Genf/Zermatt belegt, Hamburg/Berlin MISSING |
| Rechteck-Hülle überschreitet nicht | ✅ 63 von 23 203 Zellen (0,3 %) bleiben leer statt erfunden |
| Einheiten am Feld gemessen | ✅ `TOT_PREC` mm laufakkumuliert (CSV sagt fälschlich `kg m-2 s-1`) |
| `SNOWLMT`-Maske respektiert | ✅ 270 559 von 283 876 Zellen; Rest MISSING, nicht 0 |
| V-PD-9 bleibt für ECMWF gültig | ✅ `ifs_ens`/`aifs_ens` weiter ausgeschlossen, ICON-CH begründet nicht |
| **Laufwahl-Regression** | ✅ 18 (Quelle × Stufe)-Paare geprüft, **genau eines** ändert sich (CH1: 3 → 12 Stunden) |
| Kosten gemessen | ✅ CH1 317 MiB, CH2 156 MiB, Konstanten 41 MiB je Lauf |
| `verify:point-data` | ✅ **410/410** (nach B5: 380) |
| typecheck · Build | ✅ 0 Fehler · 241/241 |
| Veröffentlicht? | ❌ **nein** — `POINT_PUSH` bleibt aus, der erste Push ist Jans Gate |

### 41.11 Verbesserungen (D-28)

**V-PD-23 · Die Katalog-Enumeration ist der neue teuerste Metadaten-Posten.** 16 Seiten à ~193 KB
je Gültigzeit, und gebraucht werden davon 12 von 1 600 Items (0,75 %). Für CH1 + CH2 zusammen
sind das 36 Enumerationen ≈ 580 Seiten ≈ 110 MB JSON je Lauf. *Mehrwert:* der Abruf schrumpft um
mehr als 100 MB und ~2 min. *Skizze:* die Items **eines Laufs** liegen id-zusammenhängend; ein
`/search` mit `ids`-Liste wäre der saubere Weg, sobald der Katalog ihn unterstützt — heute nicht.
Bis dahin: die Enumeration je Lauf **einmal** über alle Gültigzeiten halten statt je Gültigzeit,
sobald PD-B8 ohnehin mehrere Items je Schritt braucht.

**V-PD-24 · Die Konstanten-Assets sind 41 MiB je Lauf für zeitinvariante Daten.** Dieselbe
Ursache wie V-PD-22 (`POINT_CACHE` liegt im flüchtigen `runner.temp`). Bei ICON-CH wiegt es
schwerer als bei `hhl`, weil beide Modelle je ein eigenes Asset haben. *Skizze:* wie V-PD-22 —
`actions/cache`, Schlüssel aus Modell + Gitterversion.

---

## §42 PD-B7: gemessene Quantile bekommen einen eigenen Ort (2026-09-10)

C-LAEF-EPS lag seit PD-A in `PENDING`, mit einer Begründung, die schärfer war als die
Datenlage: die Quelle liefert **keine Member**, nur P10/P50/P90 (⚠³). Jans Entscheidung vom
2026-09-10: eigene Quantil-Ebenen statt einer Normalverteilungsannahme.

Neu: `<var>_q10` und `<var>_q90` für sieben Größen ⇒ **37 → 51 Ebenen, Schema 4**.

### 42.1 Der Beweis, warum σ hier falsch wäre — an einer nassen Zelle

Der naheliegende Weg wäre `σ_ens = (p90 − p10) / 2,563`. Am echten Datum gemessen (Lauf
2026091012, Innsbruck, +6 h):

```
tp_p10 = 0,000 mm      tp_p90 = 0,619 mm
```

Daraus σ = 0,241 mm. Ein normalverteiltes p10 wäre `Median − 1,28 σ` — und weil der Median
dort nahe null liegt, ist das Ergebnis **negativ**. Ein negativer Niederschlag ist keine
Vorhersage, sondern ein Rechenfehler mit Einheit.

Das ist derselbe Gedanke wie bei Schema 2 (`σ_div` und `σ_ens` in eine Ebene zu schreiben
machte die PAP-6-Verzweigung unentscheidbar): **ein gemessenes Quantil bleibt ein Quantil.**
Eine Ebene, die einen gemessenen Wert verspricht und einen gerechneten trägt, ist der teuerste
Fehler dieses Produkts (§21 (4)).

### 42.2 Sieben Größen — und drei ausdrücklich nicht

Am Katalog gemessen: der Datensatz führt **14 Parameter × p10/p50/p90 = 42 Felder**. Davon
passen sieben auf Cube-Größen: `t2m`, `u10`, `v10`, `gust`, `precip`, `clct`, `snowlmt`.

**Nicht dabei, mit Grund:**

| Größe | Warum nicht |
|---|---|
| `td2m` | Für den **Median** lässt sich der Taupunkt aus `2t` und `2r` ableiten — so macht es der deterministische C-LAEF seit §37. Für ein **Quantil** geht das nicht: das q10 des Taupunkts ist nicht Magnus(q10 der Temperatur, q10 der Feuchte). Ein abgeleitetes Quantil ist keins. |
| `ps` | Der Datensatz führt nur `msl` (auf Meeresniveau reduziert), wie der deterministische Lauf. Auf der Zugspitze stünden 1013 statt 700 hPa. |
| `clcl`/`clcm`/`clch` | führt der Datensatz gar nicht. |

### 42.3 Die Quelle geht NICHT ins Mittel — und das ist V-PD-9, nicht dessen Bruch

C-LAEF-EPS hat `vars: []`. Der Grund ist derselbe wie bei den ECMWF-Kontrollläufen: **ihr p50
ist derselbe Modelllauf wie `claef`**, den der Cube schon ingestiert. Als zweiter
„unabhängiger" Wert im Mittel ließe sie `σ_div` schrumpfen — die Divergenz zweier Kopien
desselben Modells ist null.

Umgesetzt ist das nicht als Sonderfall, sondern über die bestehende Mechanik: die
Mittelungsschleife prüft `c.adapter.vars.includes(varId)`, und eine leere Liste heißt, sie
fasst die Quelle nie an. Am Bau belegt — ein Lauf nur mit `claef_eps` füllt **14 von 51
Ebenen, und zwar ausschließlich die Quantil-Ebenen**; `srcCount`, alle Mediane und alle
σ-Ebenen bleiben MISSING.

Die Quantile kommen zudem aus **genau einer** Quelle, nicht gemittelt — dieselbe Regel wie bei
den Profilfeldern (§40.3). Das q10 zweier Modelle zu mitteln ergäbe ein Quantil, das kein
Ensemble je gerechnet hat, und über welche Verteilung es dann etwas sagt, könnte niemand
angeben. Das Manifest trägt `provenance: "single-source"` und den Satz, der die Doppelzählung
verhindert: **`_q10`/`_q90` NICHT mit `_sd` oder `_sd_ens` verrechnen** — sie beschreiben die
Unsicherheit EINER Quelle, nicht die Uneinigkeit mehrerer.

### 42.4 Die Registry lag dreifach daneben — zum zweiten Mal bei derselben Quellenfamilie

| Feld | stand da | gemessen |
|---|---|---|
| `runHours` | `[0, 6, 12, 18]` | **dreistündlich** (12/09/06/03 UTC vorgehalten) |
| `retentionH` | `null` | **4 Reftimes ≈ 12 h** |
| `vars` | 4 Größen | **7** (von 14 Parametern des Datensatzes) |

Der Laufrhythmus ist **exakt derselbe Fehler**, den §37 schon beim deterministischen C-LAEF
gefunden hat („Läufe sind DREIstündlich, nicht `[0,6,12,18]`"). Eine falsche Zahl war in einer
Datei korrigiert und in der Zeile darunter stehen geblieben.

Die Skalen sind einzeln am Objekt gemessen (netcdf-int16 gegen die `geojson`-Ausgabe
**derselben Zelle**, weil `jsfive` die Attribute nicht liest): `2t`/`10u`/`10v`/`10fg`/`snowlmt`
0,1 · `tcc` 0,01 · `tp` 0,001. ⚠ `tp` war an einer **trockenen** Zelle nicht bestimmbar (beide
Quantile 0) und musste an einer nassen gemessen werden — Innsbruck +6 h, 0,619 mm ← int16 619.

### 42.5 Der Fund, der nicht zu dieser Etappe gehörte: −1 mm Niederschlag im Cube

Die Konsistenzprobe meldete **29 161 negative `precip_q10`**. Die Spur:

```
Minimum im Cube: -1,000 mm  (int16 -100)
verschiedene negative Werte: genau EINER
```

Ein einziger Wert, also kein Rechenfehler, sondern ein Marker. Bei Skala 0,001 heißt −1,00 mm
im Cube ein Rohwert von **−1000** — ein Füllwert, den die Liste des Adapters
(−32768/−32767/−9999) nicht kannte. Die Liste war geraten, nicht gemessen.

**Und er betraf nicht nur die neuen Ebenen:** derselbe Lauf trug **28 920 Zellen mit −1,000 mm
im deterministischen `precip`** — ein Altfehler seit PD-B4, den erst die Quantil-Arbeit
sichtbar gemacht hat.

Die Ursache ist Semantik, nicht Technik: alle negativen Zellen liegen **ausschließlich bei
Stunde 0** (gemessen, je Zeitschritt ausgezählt). `tp` ist die Menge „in the last forecast
interval", und vor Stunde 0 gibt es kein Intervall — genau wie bei ICON, wo die Stunde 0 gar
keinen Niederschlag führt (§33.3). Die API sagt es selbst, wenn man sie richtig fragt:

```
geojson, Lead 0:  tp_p10 = null   tp_p90 = null
geojson, Lead 1:  tp_p10 = 0
```

**Kur an zwei Stellen, weil eine nicht reicht.** Erstens: −1000 kommt in die Füllwert-Liste,
mit der Messung als Begründung. Zweitens — und wichtiger — ein **zweiter Wall**, der von der
Liste unabhängig ist: Größen, die physikalisch nicht negativ werden können, sind deklariert
(`precip`, `clct`, `gust`, `snowlmt`), und ein negativer Wert dort ist keine Messung. Das fängt
jeden **weiteren** undokumentierten Füllwert, ohne dass ihn erst jemand finden muss.
`t2m`, `u10` und `v10` stehen ausdrücklich **nicht** in der Liste — sie dürfen negativ sein,
und eine Gegenprüfung hält das fest.

Nach der Kur: **0 negative Werte**, und `precip` verliert genau 28 920 Zellen — die Stunde 0
steht jetzt als MISSING statt als −1 mm.

### 42.6 Die Gegenprobe: liegt der deterministische Lauf im eigenen Ensemble-Band?

Der stärkste verfügbare Test ohne Wahrheitsdaten: `claef` und `claef_eps` stammen aus demselben
Modell. Läge der deterministische Wert systematisch außerhalb des 80-%-Bands seines eigenen
Ensembles, wäre etwas räumlich oder zeitlich fehlzugeordnet.

Über **347 040 Zellen** (Stufe 1, Stunden 0–11):

| Größe | `q10 ≤ q90` | Median im Band | mittlere Bandbreite |
|---|---|---|---|
| `t2m` | **100,00 %** | 83,25 % | 1,40 K |
| `u10` | **100,00 %** | 88,97 % | 1,34 m/s |
| `v10` | **100,00 %** | 88,52 % | 1,41 m/s |
| `gust` | **100,00 %** | 90,20 % | 2,17 m/s |
| `precip` | **100,00 %** | 97,13 % | 0,68 mm |
| `clct` | **100,00 %** | 88,26 % | 30,3 % |
| `snowlmt` | **100,00 %** | 77,22 % | 217 m |

Die Ordnung hält ausnahmslos, und die Trefferquote liegt dort, wo man sie für ein 80-%-Band
erwartet. Bei einer Verschiebung um eine Zelle oder eine Stunde wäre sie eingebrochen —
deshalb ist diese Zahl der eigentliche Verortungsbeweis der Etappe.

### 42.7 Kosten gemessen

Voller Bau der Stufe 1 nur mit `claef_eps`, kalter Cache:

```
49 Stunden · 7 Größen × 2 Quantile · 57 Dateien · 339,1 MiB · 306 s · Ausgabe 20,65 MiB
```

Die 57 Dateien sind **4 Zeitfenster × 14 Parameter + 1 Metadatenabruf** — die API liefert bis
zu 16 Stunden je Anfrage (Grenze: 10 Mio Punkte), also kostet eine Stunde mehr im Fenster
nichts. Gegen das Laufbudget sind die 339 MiB ein Zuwachs von **+6 %**; zusammen mit PD-B5
(906 MiB) und PD-B6 (473 MiB + 41 MiB Konstanten) steht die Phase bei **rund 6,7 GiB je Lauf**.

⚠ Damit wird die Laufzeit zum bindenden Posten, nicht das Volumen: bei dem in §40.5 gemessenen
Durchsatz von 3,5 MiB/s sind 6,7 GiB rund **32 min** — innerhalb der 45 min, die `JOB_MAX_MIN`
seit PD-B5 nennt, aber ohne den Puffer, den die Zahl vor B5 hatte. Die nächste Etappe (PD-B8,
Ensemble-Member) ist die teuerste der Reihe und braucht deshalb **vor** dem Bau eine
Volumenentscheidung, keine danach.

### 42.8 Gate GPD-B7

| Nachweis | Ergebnis |
|---|---|
| `_q10`/`_q90` für sieben Größen, Schema 4 | ✅ 37 → **51 Ebenen** |
| Quantile behalten Skala **und Versatz** ihrer Größe | ✅ (`_sd` setzt `offset: 0` — hier wäre das ein lautloser Fehler) |
| **Die Quelle trägt nichts zum Mittel bei** | ✅ Lauf nur mit `claef_eps`: **14 von 51 Ebenen belegt, ausschließlich Quantile**; `srcCount` und alle Mediane MISSING |
| `td2m` und `ps` bekommen bewusst keine | ✅ mit Begründung in Adapter und Verifier |
| **`q10 ≤ q90`** | ✅ **100,00 %** über 347 040 Zellen, alle sieben Größen |
| **Verortungsbeweis** | ✅ deterministischer Lauf im eigenen 80-%-Band: 77–97 % |
| ⚠ **Altfehler gefunden und behoben** | ✅ −1 mm Niederschlag: 28 920 Zellen im deterministischen C-LAEF (seit PD-B4) + 29 161 je Quantil-Ebene ⇒ nach der Kur **0** |
| Zweiter Wall gegen künftige Füllwerte | ✅ `NON_NEGATIVE` deklariert; `t2m`/`u10`/`v10` ausdrücklich nicht drin |
| Registry korrigiert | ✅ Läufe dreistündlich, Vorhalt 12 h, 7 statt 4 Größen |
| Kosten gemessen | ✅ 57 Dateien · **339,1 MiB** · 306 s · Ausgabe 20,65 MiB (Stufe 1 voll) |
| `verify:point-data` | ✅ **440/440** (nach B6: 410) |
| typecheck · Build · Budget | ✅ 0 Fehler · 241/241 · 301,2/302 · 1 365,5/1 372 |
| Veröffentlicht? | ❌ **nein** — `POINT_PUSH` bleibt aus |

### 42.9 Die Lehre dieser Etappe

**Eine Füllwert-Liste, die nicht gemessen ist, ist eine Vermutung mit drei Einträgen.** Die alte
Liste (−32768/−32767/−9999) sah vollständig aus und war es nicht; der fehlende vierte Eintrag
stand seit PD-B4 als −1 mm Niederschlag im Cube, in einer Ebene, die niemand angesehen hatte.
Gefunden wurde er nicht durch Lesen, sondern durch eine **physikalische** Prüfung („kann diese
Größe negativ werden?") an einer ganz anderen Etappe.

Deshalb ist die Kur auch nicht nur der vierte Listeneintrag, sondern der zweite Wall: die
Vollständigkeit einer Liste kann man nicht beweisen, die Nichtnegativität von Niederschlag
schon.

---

## §43 PD-B8: σ_ens und ensCount bekommen endlich Daten (2026-09-11)

PD-B2 hat den **Ort** geschaffen (Schema 2), PD-B6 die Ebene für `snowlmt` ergänzt (Schema 3) —
gefüllt hat sie niemand. `<var>_sd_ens` und `ensCount` standen seit PD-A **durchgehend auf
MISSING**; §35.6 sagte es ausdrücklich: „Diese Etappe hat den Ort geschaffen, nicht die Daten."

Neu: `scripts/point/adapters/dwdEps.mjs` — ICON-D2-EPS (Stufe 1), ICON-EU-EPS (Stufe 2),
ICON-EPS global (Stufe 3). **Siebte Zugriffsfamilie**: gebündelte Member auf dem ikosaedrischen
Gitter.

### 43.1 Die Volumenentscheidung kam VOR dem Code — und das war nötig

Gemessen je (Größe, Schritt):

| Quelle | Member | Größe | Form |
|---|---|---|---|
| ICON-D2-EPS | 20 | **13,4 MiB** | gebündelt, ein Abruf |
| ICON-EU-EPS | 40 | 9,1 MiB | gebündelt |
| ICON-EPS global | 40 | **34,8 MiB** | gebündelt |
| IFS-ENS | 50 | 1,12 MiB × 50 = **55,8 MiB** | 50 getrennte Byte-Bereiche |
| AIFS-ENS | 50 | 1,30 × 50 = **65,1 MiB** | `enfo-cf` + `enfo-pf` getrennt |

⚠ **Eine Teilmenge der Member ist bei ICON nicht abrufbar.** Die Datei ist gebündelt *und*
bz2-gepackt; ein Byte-Bereich hilft nicht. Entweder alle 20 (bzw. 40) oder keiner. Damit fällt
die naheliegende Sparmaßnahme („nimm 20 von 50 Membern, σ ist dann fast so gut") für die
DWD-Ensembles aus — sie geht nur bei ECMWF, und dort ist schon der Vollpreis am höchsten.

Stündlich wäre allein Stufe 1 **über 5 GiB je Lauf**. Nach PD-B5 bis B7 steht das Laufbudget
bereits bei ≈ 6,7 GiB ⇒ ~32 min gegen `JOB_MAX_MIN` 45. Deshalb ist das Zeitraster hier keine
Bequemlichkeit, sondern die Etappe selbst — **Jans Entscheidung vom 2026-09-11**: alle drei
Stufen, sehr grob.

| Stufe | Quelle | Raster | Größen |
|---|---|---|---|
| t1 | ICON-D2-EPS | **6-stündlich** | t2m, u10, v10, gust, precip |
| t2 | ICON-EU-EPS | **12-stündlich** | dieselben fünf |
| t3 | ICON-EPS global | **24-stündlich** | nur t2m und precip |

Stufe 3 ist am stärksten beschnitten und trotzdem die wichtigste: **dort fehlt heute jede
Unsicherheitsinformation** (§33.4 — jenseits 180 h trug lange nur eine Quelle, und `σ_sys` ist
bis `buscosun-archiv` ungemessen).

Zwischen den Rasterstunden bleiben die Ebenen MISSING. Das ist die ehrliche Form: der Client
sieht, wo eine gemessene Member-Streuung vorliegt und wo er auf `σ_div` zurückfällt — eine
interpolierte Streuung sähe aus wie eine gemessene.

### 43.2 Jans zweite Entscheidung: die Ensembles gehen NICHT ins Mittel

Die Vorgabe für PD-B lautete „Ensembles nur als Mittel + σ_ens in grobem Zeitraster". Ich habe
das als **Speicherform** gelesen (keine Einzelmember im Repo, sondern die abgeleiteten Größen)
und nicht als Fusionsregel — und nachgefragt, weil die andere Lesart messbar etwas anderes tut.

Der Grund ist derselbe wie zweimal zuvor: **das Ensemble-Mittel von ICON-D2-EPS ist derselbe
Modelllauf wie ICON-D2**, den der Cube schon ingestiert. Als zweiter „unabhängiger" Wert im
Mittel ließe es `σ_div` schrumpfen — exakt V-PD-9 (ECMWF-Kontrollläufe) und §42.3 (C-LAEF-EPS).
Umgesetzt über dieselbe Mechanik: `vars: []`, und die Mittelungsschleife fasst die Quelle nie
an. `srcCount` zählt sie ebenfalls nicht.

### 43.3 ⚠ Die Einheit einer Streuung ist nicht die Einheit eines Werts

`convert()` rechnet `wert · factor + offset`. Auf eine **Standardabweichung** angewandt wäre
das ein stiller Totalschaden: `KELVIN_TO_C` trägt `offset: −273,15`, und eine Streuung von
1,2 K stünde als **−271,95** im Cube. Nicht einmal sichtbar wäre es: beim Quantisieren würde
der Wert schlicht an der Bereichsgrenze geklemmt, ohne Fehlermeldung.

Streuungen werden deshalb **nur mit dem Faktor** skaliert. Das steht als eigene Tabelle
(`SD_FACTOR`) im Adapter, nicht als stille Auslassung — und der Verifier prüft, dass
`convert()` im Code dieser Datei überhaupt nicht vorkommt.

### 43.4 ⚠ Der teuerste Fund: nicht jede GRIB-Nachricht ist ein Member

Der erste Lauf meldete **„80 Member"** — bei einem Ensemble mit 20.

Am Objekt nachgezählt: `t_2m`, `u_10m`, `v_10m` und `vmax_10m` liefern je **20** Nachrichten,
`tot_prec` aber **80** — mit **identischer Parameter-Identität** und Member-Nummern 1…20, jede
viermal, und die vier sind nachweislich **verschieden** (55 466 von 542 040 Werten). Der
Unterschied steckt in Sektion 4, die der Decoder bis dahin nur bis zur Parameter-Identität las:

```
Ende 09:00 · Prozess 1 (Akkumulation) · Spanne 360 min  ->  20 Nachrichten
Ende 09:15 · Prozess 1                · Spanne 375 min  ->  20 Nachrichten
Ende 09:30 · Prozess 1                · Spanne 390 min  ->  20 Nachrichten
Ende 09:45 · Prozess 1                · Spanne 405 min  ->  20 Nachrichten
```

**ICON-D2-EPS veröffentlicht den Niederschlag in Viertelstunden.** Die Datei zum Schritt 006
enthält die Laufsummen bis +6:00, +6:15, +6:30 und +6:45. Eine Streuung über alle 80 hätte vier
**Gültigzeiten** vermischt — der Zuwachs über 45 Minuten sähe aus wie Modellstreuung und wäre
der Lauf der Uhr.

Der Decoder trägt dafür jetzt `productTemplate`, `forecastTime`, `statProcess`, `timeRangeMin`
und `intervalEndMinute` (Oktettlagen am echten Objekt abgelesen, Sektion 4 Länge 61). Die
Ergänzung ist rein additiv — die Kartenlinie liest die Felder nicht.

**Und der erste Filter war falsch, was sofort am Volumen sichtbar wurde.** Ich hatte auf die
**Länge** gefiltert (`timeRangeMin === leadH·60`). Damit verschwand `gust` fast vollständig:
`gust_sd_ens` fiel von 119 auf **5 KiB**. Der Grund: `tot_prec` ist seit Laufbeginn akkumuliert
(Spanne = `leadH·60`), `vmax_10m` aber das Maximum der **Vorstunde** (Spanne immer 60) — beide
enden auf der vollen Stunde, haben aber völlig verschiedene Längen. Das Kriterium ist das
**Ende** des Intervalls, nicht seine Länge. Nach der Korrektur: 20 Member, `gust` wieder bei
119 KiB.

Bemerkenswert an diesem Fehler ist, wie er aufgefallen ist: nicht durch eine Prüfung, sondern
weil eine **Ebenengröße im Bauprotokoll** um den Faktor 24 einbrach. Die Zeile „mit Werten"
ist damit mehr als Buchhaltung.

### 43.5 Der Beleg: die Streuung wächst mit der Vorhersagezeit

Wie bei den Profilfeldern (§40.4) ist der Beweis nicht „die Ebene ist belegt", sondern eine
Aussage, die **nur bei richtiger Rechnung** herauskommt. Ensemble-Spread wächst mit der
Vorhersagestunde — das steht nirgends im Code.

| Ort | σ_ens(t2m) 0 h | 6 h | 12 h | σ_ens(gust) 0 h | 6 h | 12 h |
|---|---|---|---|---|---|---|
| Hamburg | 0,32 K | 0,38 | **0,64** | **0,00** | 0,33 | **1,21** |
| München | 0,25 K | 0,57 | **0,60** | **0,00** | 0,60 | **1,12** |
| Innsbruck | 0,29 K | 0,42 | **0,57** | **0,00** | 0,52 | 0,59 |
| Zugspitze | 0,19 K | 0,28 | **0,33** | **0,00** | 0,59 | 0,38 |

⚠ **σ_ens(gust) ist bei Stunde 0 exakt null** — an allen vier Punkten. Das ist kein fehlender
Wert, sondern die richtige Antwort: zur Analysezeit teilen sich alle 20 Member denselben
Zustand. Eine Streuung, die dort *nicht* null wäre, hieße, dass vier verschiedene Gültigzeiten
im Topf liegen — also genau der Fehler aus 43.4.

`ensCount` steht überall auf **20**, wie es soll.

### 43.6 §34.5 geschlossen — der ECMWF-Filter greift jetzt über `type`

§34.5 hatte gemessen, dass `ifs_ens` **nie ein Feld geliefert** hat: der Filter behielt
„`number` fehlt oder ist 0", und `…/enfo-ef.index` enthält ausschließlich `type: "pf"` mit
`number` 1…50. `CLAUDE.md` versprach die Behebung für PD-B8.

Behoben ist sie als **Ursache, nicht als Symptom**: gefiltert wird über `type` (`cf` =
Kontrolllauf, `pf` = gestörter Member). Der Befund selbst bleibt bestehen — `enfo-ef` hat
keinen `cf`-Eintrag —, aber jetzt liefert die Quelle nichts, *weil der Katalog nichts hat*,
und nicht, weil der Filter danebengreift. Am Objekt gegengeprüft: AIFS führt den Kontrolllauf
in einer eigenen Datei (`enfo-cf`, 21 Einträge), die gestörten in `enfo-pf` (1 050 = 50 × 21).

**Die ECMWF-Member werden in diesem Zuschnitt nicht gelesen, und das ist eine Rechnung:**
55,8 MiB (IFS-ENS) bzw. 65,1 MiB (AIFS-ENS) je (Größe, Schritt) gegen 34,8 MiB bei ICON-EPS
global für dieselbe Aussage. Die Fernstufe bekommt σ_ens deshalb aus ICON-EPS global.

### 43.7 Was die drei Ensembles NICHT führen

Am Verzeichnis ausgezählt, denn sie führen nicht dasselbe:

| | t2m | td2m | u10/v10 | gust | precip | clct | ps | snowlmt |
|---|---|---|---|---|---|---|---|---|
| ICON-D2-EPS | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **✗** |
| ICON-EU-EPS | ✓ | **✗** | ✓ | ✓ | ✓ | ✓ | ✓ | **✗** |
| ICON-EPS global | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **✗** |

**Keines führt `snowlmt`** — das bestätigt die ursprüngliche Messung aus PD-B2 und zeigt
zugleich, warum sie unvollständig war: die σ_ens-Ebene für `snowlmt` existiert seit Schema 3
allein wegen ICON-CH (§41.5). Sie bleibt in Stufe 1 und 2 leer, bis PD-B6s perturbed-Member
gelesen werden.

### 43.8 Der Decoder log — je nach Quelle

Der Fund aus 43.4 hatte einen Nachläufer, der ohne eine Gegenprobe im Produkt gelandet wäre.

Der deterministische ICON-D2 führt `tot_prec` **ebenfalls** in vier Viertelstunden-Fassungen.
Er benutzt aber **Template 4.8**, das Ensemble **4.11** — und 4.11 ist 4.8 **plus drei
Ensemble-Oktette** (Typ, Member-Nummer, Anzahl). Alles danach ist um drei Oktette verschoben.

Mit einem Offsetsatz für beide las derselbe Code im Ensemble korrekt (Prozess 1, Spanne
360 min) und im deterministischen Lauf:

```
#0 Template 8 · Prozess 0 · Spanne 105 692 528 640 min · Ende-Minute 0
#1 Template 8 · Prozess 0 · Spanne 120 792 023 040 min · Ende-Minute 0
```

Ein Feld, das je nach Quelle stimmt oder Unsinn ist, ist schlimmer als keins — die Ende-Minute
stand dabei zufällig auf 0, also hätte ein Filter darauf **richtig ausgesehen und falsch
funktioniert**. Nach der Fallunterscheidung:

```
#0 Template 8 · Prozess 1 · Spanne 360 min · Ende-Minute  0
#1 Template 8 · Prozess 1 · Spanne 375 min · Ende-Minute 15
#2 Template 8 · Prozess 1 · Spanne 390 min · Ende-Minute 30
#3 Template 8 · Prozess 1 · Spanne 405 min · Ende-Minute 45
```

**Nebenbefund, der gesagt gehört:** `decodeGrib2` nimmt die **erste** Nachricht, und das ist
die 360-min-Fassung. Der deterministische Niederschlag im Cube war also immer richtig — aber
**durch die Reihenfolge der Datei, nicht durch eine Auswahl**. Ordnet DWD je um, würde daraus
lautlos eine Summe bis +6:45. Als V-PD-25 festgehalten.

### 43.9 Gate GPD-B8

| Nachweis | Ergebnis |
|---|---|
| Alle drei DWD-Ensembles haben einen Adapter, keins mehr in `PENDING` | ✅ |
| **`<var>_sd_ens` und `ensCount` tragen zum ersten Mal Werte** | ✅ Stufe 1: fünf σ_ens-Ebenen belegt, `ensCount` = **20** |
| **Keines trägt zum Mittel bei** | ✅ `vars: []`; `srcCount` zählt sie nicht (V-PD-9, wie C-LAEF-EPS) |
| **Spread wächst mit der Vorhersagezeit** | ✅ σ_ens(t2m) 0,19–0,32 K bei 0 h → 0,57–0,64 K bei 12 h; σ_ens(gust) bei 0 h **exakt 0** an allen Prüfpunkten |
| Streuung wird nur mit dem Faktor skaliert | ✅ `SD_FACTOR`; `convert()` kommt im Code der Datei nicht vor |
| ⚠ **Member korrekt abgegrenzt** | ✅ 80 Nachrichten → 20 Member; gefiltert auf das Intervall-**Ende**, nicht die Länge |
| ⚠ **Decoder für beide Templates korrekt** | ✅ 4.8 und 4.11 getrennt; vorher Spannen von 105 Mrd. Minuten im deterministischen Lauf |
| §34.5 geschlossen | ✅ ECMWF filtert über `type` statt `number`; der Befund („kein `cf` in `enfo-ef`") bleibt, aber als Katalog-Aussage |
| Kosten Stufe 1 gemessen | ✅ 47 Dateien · **670,2 MiB** · 206 s · Ausgabe 2,53 MiB |
| **End-zu-End gemessen** (alle Stufen, alle Quellen) | ✅ `EXIT=0` · **2 315 s = 38,6 min** · 3 325 Dateien · **5 965,7 MiB** · 276 Chunks · 77,84 MiB; Speicher stabil ~2,1 GB ⇒ `JOB_MAX_MIN` **45 → 50** |
| ⚠ σ_ens in Stufe 3 | **2 von 9 Rasterstunden** — ICON-EPS global endet bei 180 h, das Band bei 336. Jenseits 180 h weiterhin nichts (s. 43.12, V-PD-27) |
| `verify:point-data` | ✅ **479/479** (nach B7: 440) |
| typecheck · Build · Budget | ✅ 0 Fehler · 241/241 · 301,2/302 · 1 366,0/1 372 |
| Veröffentlicht? | ❌ **nein** — `POINT_PUSH` bleibt aus |

### 43.10 Verbesserungen (D-28)

**V-PD-25 · Der deterministische Niederschlag wird durch Reihenfolge ausgewählt, nicht durch
Auswahl.** `decodeGrib2` nimmt die erste GRIB-Nachricht; bei `tot_prec` sind es vier
(Viertelstunden), und die erste ist heute die Fassung auf der vollen Stunde. *Mehrwert:* der
Wert bleibt richtig, auch wenn DWD die Reihenfolge ändert — heute würde daraus lautlos eine
Summe bis +6:45, also bis zu 45 Minuten zu viel Niederschlag. *Skizze:* im DWD-Adapter wie beim
Ensemble auf `intervalEndMinute === 0` filtern; die Felder liefert der Decoder seit dieser
Etappe. Betrifft `icon_d2`, `icon_eu` und alle Quellen mit akkumulierten Größen.

**V-PD-26 · `ensCount` ist eine Ebene für alle Größen, aber die Quellen führen nicht dieselben.**
ICON-EU-EPS hat keinen Taupunkt, keines der drei hat `snowlmt` — dort steht `ensCount` auf 20
bzw. 40, obwohl es für jene Größe null Member gab. *Mehrwert:* die Bias-Korrektur
`E[s] = c4(n)·σ` würde sonst mit einem n rechnen, das für diese Größe nicht gilt. *Skizze:*
`ensCount` nur dort setzen, wo mindestens eine σ_ens-Ebene der Zelle belegt ist — oder je Größe
führen, was eine Ebene je Größe kostet und deshalb eine Formatentscheidung ist.

### 43.11 ⚠ Der volle Lauf ist am Speicher gestorben — und meldete Exit 0

Bis hierhin war jede Etappe **quellenweise** gemessen worden: ein Bau mit `--only=<quelle>`,
sauber und billig. Der erste Lauf über **alle Stufen mit allen Quellen** hat gezeigt, was diese
Messweise nicht sehen kann:

```
t1: σ_ens aus icon_d2_eps — 9 Stunden (Raster 6 h), 5 Größen, 20 Member
[1688] 1015537 ms: Mark-Compact (reduce) 4026.0 (4036.2) -> 4025.6 (4029.4) MB …
       allocation failure; scavenge might not succeed
WALL_ALL=1017s
```

**Der Producer lief gegen die 4-GB-Heapgrenze von Node und starb mitten in Stufe 1** — kein
einziger Chunk wurde geschrieben. Auf einem GitHub-Runner gilt dieselbe Grenze; der geplante
Cron wäre also bei seinem ersten Lauf gestorben, ohne dass eine der sieben Etappen davor etwas
Falsches getan hätte.

⚠ **Und er meldete `Exit 0`.** Das Kommando endete auf `| grep …`, und in einer Pipeline setzt
das **letzte** Glied den Status. Hätte ich nur auf den Exit-Code gesehen, wäre der Absturz als
erfolgreicher Lauf durchgegangen. Dieselbe Klasse wie das stille `git add` im sparse-Checkout
(§30) und die still ignorierten STAC-Filter (§41.2) — nur diesmal in meinem eigenen
Messaufbau.

**Die Ursache ist ein unbegrenzter Cache, nicht die Datenmenge.** `window_()` in
`geosphere.mjs` hält je (Parameter, 16-Stunden-Fenster) ein typisiertes Array von
16 × ~593 000 Werten ≈ **19 MiB**. Der Producer läuft Schritt für Schritt und fragt in jedem
Schritt **alle** Größen, also sind während eines Blocks alle Parameter gleichzeitig lebendig:
mit `claef` (8) und dem in PD-B7 dazugekommenen `claef_eps` (14 Quantil-Parameter) sind das
**22 Fenster ≈ 420 MiB** — und ohne Deckel blieb jeder weitere Block daneben liegen.

Bemerkenswert daran: **PD-B7 hat den Cache verdreifacht, ohne dass es auffiel.** Vorher waren es
8 Parameter, danach 22. Gemessen wurde in PD-B7 aber nur der Bau mit `--only=claef_eps`, und da
gibt es kein Nebeneinander. Eine Etappe kann ein Problem einbauen, das erst die *nächste*
sichtbar macht — genau dafür ist der volle Lauf da.

Kur: ein **gedeckelter LRU** (`GEOSPHERE_WIN_CACHE`, Standard 26 — bewusst über den 22
gleichzeitig gebrauchten, damit der häufigste Zugriff ein Treffer bleibt). Drei Prüfungen halten
den Deckel, seine Höhe und die Begründung fest.

**Die Lehre:** quellenweise Messungen sind billig, ehrlich und blind für alles, was aus dem
*Zusammenspiel* entsteht. Das gilt für Speicher genauso wie für die Laufzeit — und beides
entscheidet, ob der Cron lebt.

### 43.12 Der erste End-zu-End-Lauf — und was er über die Fernstufe sagt

Nach der Kur aus 43.11 lief derselbe Bau durch, diesmal mit erhaltenem Exit-Code:

```
EXIT=0  WALL=2315s  (38,6 min)
  t1  208 Chunks · 70,99 MiB   σ_ens 8 Std (20 Member) · Quantile 49 Std · Profil 38 Std
      icon_d2 · icon_d2_eps · icon_ch1_eps · claef · claef_eps
  t2   56 Chunks ·  6,47 MiB   σ_ens 6 Std (40 Member)
      icon_eu · icon_eu_eps · icon_ch2_eps
  t3   12 Chunks ·  0,38 MiB   σ_ens 2 Std (40 Member)
      icon_global · icon_eps_global · aicon · ifs_hres · aifs_single
  3 Stufen · 276 Chunks · 77,84 MiB
  Netz: 3 325 Dateien · 5 965,7 MiB
```

**Der Speicher blieb stabil bei ~2,1 GB**, während der Plattencache von 2,0 auf 2,7 GiB wuchs —
genau die Trennung, die vorher fehlte. Vorher war der Heap monoton bis 4 GB gewachsen.

**Die Hochrechnung war zu hoch, und das ist lehrreich.** Aus den Einzelquellen hatte ich
8,2 GiB erwartet; gemessen sind es **5,83 GiB**. Der Unterschied ist keine Messungenauigkeit,
sondern die Wirklichkeit: mehrere Quellen tragen ihre Stufe nicht voll (ICON global 10 von 36
Schritten, Profil 38 von 49, ICON-EPS global 2 von 9 Rasterstunden). Eine Summe aus
Einzelmessungen unterstellt Vollbesetzung — die gibt es nie.

**`JOB_MAX_MIN` geht von 45 auf 50** (gemessene 38,6 min plus Rand). Der engste Cron-Abstand
von 100 min hält damit weiterhin die Bedingung `≥ JOB_MAX_MIN + 20`.

#### ⚠ Und der Befund, der die t3-Entscheidung relativiert

σ_ens in der Fernstufe deckt **2 von 9 Rasterstunden** ab, und zwar 144 h und 168 h:

```
t3-Band 126…336 h · 24-h-Raster: 144 168 192 216 240 264 288 312 336
ICON-EPS global Horizont: 180 h
erreichbar: 144 168   ⇒ 2 von 9, und NULL jenseits 180 h
```

Der Grund ist **nicht** das grobe Raster, sondern der Horizont der Quelle. ICON-EPS global endet
bei 180 h (bei 06/18 UTC schon bei 120). Damit liegt die gesamte gelieferte Information in dem
Band, das ohnehin schon vier Quellen und damit `σ_div` hat — und **jenseits 180 h bleibt es
genau so leer wie in §33.4 beschrieben**.

Das gehört unverstellt gesagt: die Entscheidung „alle drei Stufen" bringt in Stufe 3 sehr wenig,
und sie bringt es an der falschen Stelle. Die einzigen Ensembles, die bis 336 h reichen, sind
**IFS-ENS und AIFS-ENS** — also genau die, die aus Kostengründen draußen blieben (55,8 bzw.
65,1 MiB je Größe und Schritt gegen 34,8).

Was daraus folgt, ist eine Entscheidung und keine Nacharbeit:

* **entweder** ECMWF-Member für zwei Größen in einem sehr groben Raster (t2m + precip alle 48 h
  = 5 Stunden × 2 × 55,8 MiB ≈ **558 MiB**, also tragbar) —
* **oder** man akzeptiert, dass jenseits 180 h die Unsicherheit erst aus `σ_sys` kommt, und das
  heißt: erst mit `buscosun-archiv` (PA).

Als **V-PD-27** festgehalten; die Zahl 558 MiB ist aus den in 43.1 gemessenen Feldgrößen
gerechnet, nicht geschätzt.

**V-PD-27 · σ_ens fehlt genau dort, wo es am meisten fehlt.** Die Fernstufe bekommt aus
ICON-EPS global nur 144 h und 168 h; jenseits 180 h gibt es weiterhin keine
Unsicherheitsinformation (§33.4 unverändert). *Mehrwert:* das ist der Bereich, in dem ein
p10/p90 heute erfunden wäre — 150 der 336 Stunden. *Skizze:* IFS-ENS oder AIFS-ENS für **zwei**
Größen (t2m, precip) in einem 48-Stunden-Raster: fünf Stunden × 2 Größen × 55,8 MiB ≈ **558 MiB**
je Lauf, gerechnet aus den in 43.1 gemessenen Feldgrößen. Die Member liegen dort als getrennte
Byte-Bereiche — anders als bei ICON ist eine **Teilmenge** abrufbar, 20 von 50 Membern kosteten
also nur 223 MiB. Braucht Jans Entscheidung, weil es das Laufbudget wieder anhebt.
→ **Erledigt in §45 (PD-B10).** Jan hat am 2026-09-11 entschieden: ECMWF-Member, 48-h-Raster. Umgesetzt mit **50** Membern (gemessen reichen 20 für Niederschlag nicht) und 538 MiB. Dabei zwei Fehler aus PD-B8 gefunden und behoben — s. §45.2 und §45.7.


---

## §44 PD-B9 — MOSMIX-L als eigenes Produkt `point/stations/`

Die letzte Etappe der Phase PD-B, und die einzige, bei der **die Form schon da war und der
Schreiber fehlte**: `stationBundlePath()`, `stationManifestPath()` und `STATION_CATALOG_PATH`
stehen seit PD-A in `cubeFormat.ts`, `index.json` kündigt den Stationsblock an, und
`TIMELESS_PATHS` nimmt den Katalog von der Aufbewahrung aus. Erzeugt hat das nie jemand.

Das ist dieselbe Klasse wie V-SH-11 (ein Leser ohne Schreiber), nur andersherum — und genauso
unangenehm, weil es **gepflegt aussieht**.

### 44.1 Die Entscheidung, die nicht neu getroffen wurde

MOSMIX geht **nicht ins Gitter**. Die Begründung steht seit PD-A im Format und gilt unverändert:
MOSMIX ist auf DWD-Stationen bias-korrigiert, sein ganzer Wert hängt daran, dass die Zahl **an
dieser Station** gilt. Eine Interpolation auf 0,05° verschmierte die Korrektur über die Fläche
und würfe genau den einen Vorteil weg, den die Quelle hat.

Ausgeliefert wird deshalb ein zweites Produkt im **selben Container**: eine Stationsreihe ist ein
Chunk mit `ny = 1` und `nx = Anzahl Stationen im Bündel`, gebündelt nach dem Chunk-Raster der
Stufe 1. Gleiche Ebenen, gleiche Skalen, gleicher Leser. Die Zuordnung **Spalte → Station** steht
im Lauf-Manifest, nicht in der Datei — eine Datei ohne ihr Manifest ist hier wie überall
Zahlensalat.

⚠ **Eine Spannung bleibt und wird benannt:** `TIER_BANDS` führt `mosmix_l` unter den Quellen der
Stufe 2. Ein Gitter-Adapter existiert nicht und soll nicht existieren. Der Eintrag bleibt, weil
`sources` je Stufe die Auskunft ist, welche Quellen diese Stunden *überhaupt* versorgen — und das
tut MOSMIX, nur über dieses Produkt. `PENDING.mosmix_l` sagt das jetzt ausdrücklich, statt wie
bisher „passt nicht ohne Entscheidung in ein Gitter" zu behaupten, als sei die Entscheidung offen.

### 44.2 ⚠ Die Koordinatenfalle, die keine Zählung gefunden hätte

Der naheliegende Weg zu den Stationsorten ist `mosmix_stationskatalog.cfg`. Er ist falsch.

Der Katalog führt Lat/Lon als **Grad + Dezimalminuten**, nicht als Dezimalgrad. Gemessen an drei
bekannten Lagen:

```
Wien/Hohe Warte   Katalog 48.15 / 16.22   ->  als Dezimalminuten 48.250 / 16.367   (wahr 48.2489 / 16.3564)
Zuerich           Katalog 47.23 /  8.34   ->                     47.383 /  8.567   (wahr 47.3769 /  8.5417)
Muenchen Stadt    Katalog 48.10 / 11.32   ->                     48.167 / 11.533   (wahr 48.14   / 11.57)
```

Die Dezimalgrad-Lesart verschiebt jede Station um bis zu ~20 km. **Und die Stationszahl im
Ausschnitt hätte das nicht gezeigt:** 3 049 gegen 3 055 — beides plausibel, keine Prüfung wäre
angeschlagen. Der Fehler wäre als leichte Unschärfe in die Verifikation eingegangen und hätte dort
wie Modellfehler ausgesehen.

Der Producer liest den Katalog deshalb **gar nicht**. Die Koordinaten kommen aus
`<kml:coordinates>` der Datei selbst und sind echte Dezimalgrad. Eine Quelle, die ihre eigenen
Koordinaten mitbringt, braucht keinen zweiten Katalog — der `catalog.json` dieses Produkts wird
aus der KML erzeugt und sagt im Kopf, warum.

### 44.3 Die achte Zugriffsfamilie — und zwei Fallen darin

MOSMIX ist kein GRIB, kein netCDF, kein REST: ein **KMZ** (Zip) mit einer KML darin.

⚠ **(1) Der lokale Dateikopf lügt.** DWD schreibt das Zip als **Strom mit Data-Descriptor**:
`compressedSize` und `uncompressedSize` stehen im lokalen Kopf auf **0**, die echten Größen erst
im Central Directory am Dateiende. Der vorhandene `unzip()` in `build-places-dach.mjs` liest nur
den lokalen Kopf und scheitert an MOSMIX mit `Z_BUF_ERROR` — gemessen. Ein Fehler, der nach
Datenkorruption aussieht und keine ist.

⚠ **(2) Die Datei passt nicht in einen String.**
`MOSMIX_L/all_stations/kml/MOSMIX_L_LATEST.kmz` ist **76,2 MiB gepackt und 1 750 MiB entpackt**.
Ein `inflateRawSync(...).toString()` wirft — und zwar erst nach 34 Sekunden Arbeit. Gelesen wird
deshalb als Strom: `createInflateRaw()`, ein Rest-Puffer, und je vollständigem `</kml:Placemark>`
wird ausgewertet und weggeworfen.

**Gemessen am echten Lauf:** Rest-Puffer **max 0,31 MiB**, Heap **unter 40 MiB** — bei 1 750 MiB
Durchsatz. Das ist die Lehre aus §43.11, diesmal *vor* dem Absturz angewandt.

### 44.4 Der Zugriffsweg, und warum die Registry ihn nicht kannte

Die Registry führte MOSMIX-L als „KMZ je Station". Das ist nicht falsch, aber unvollständig:

| Weg | Abruf | Anfragen | Speicher |
|---|---|---|---|
| `single_stations/<id>/` | 17,7 KiB je Station ⇒ **53 MiB** für 3 071 | **3 071** | unkritisch |
| `all_stations/` | **76,2 MiB in 6,2 s** | **1** | 1 750 MiB entpackt ⇒ Strom nötig |

Gewählt ist `all_stations` mit Stromparsen: **ein** Abruf statt 3 071 gegen einen Server, den
diese Linie ohnehin achtmal täglich beansprucht. Gesamt gemessen: **55 s** (6,2 s Abruf, 29,9 s
Parsen, Rest Schreiben).

Die Registry lag zum **vierten Mal in dieser Phase** bei einer Quellenfamilie daneben, und alle
vier Punkte sind jetzt gemessen:

| Feld | stand auf | gemessen |
|---|---|---|
| `runHours` | `[0,3,6,9,12,15,18,21]` | **`[3,9,15,21]`** — vier Läufe, nicht acht |
| `horizonH` | 240 | **247** (Schritte 1…247 h) |
| `steps` | `null`, ungemessen | **1…247 h, durchgehend stündlich** (Differenz-Histogramm: 246 × 1 h, sonst nichts) |
| `vars` | enthielt `ps` | **ohne `ps`** — s. 44.5 |

### 44.5 ⚠ `PPPP` ist nicht der Stationsdruck

MOSMIX führt `PPPP`. Die Versuchung, das auf `ps` abzubilden, ist groß und falsch. Am echten
Datum geprüft, statt der Doku zu glauben:

```
Muenchen Stadt   515 m   PPPP = 1019,3 hPa
Schleswig         47 m   PPPP = 1017,5 hPa      -> 470 m Hoehenunterschied fuer 1,8 hPa
Zugspitze      2 960 m   PPPP = "-"             -> gar kein Wert
```

Ein Stationsdruck stünde in München bei ~955 und auf der Zugspitze bei ~700 hPa. `PPPP` ist auf
Meeresniveau reduziert ⇒ **`ps` bleibt MISSING**, genau wie bei C-LAEF (§37). Dasselbe gilt für
`snowlmt` (MOSMIX führt sie unter seinen 114 Parametern nicht) und für die vier Profilfelder (eine
Station ist ein Punkt, kein Profil). Alle fünf stehen als `MOSMIX_NOT_MAPPED` **mit Grund** im
Manifest — benannt abwesend, nicht stillschweigend leer.

### 44.6 ⚠ Die Bö-Bedingung ist nicht geschenkt

PAP 6 verlangt `v_max := max(v_max, |v10|)`. Am echten Lauf ist das **in 97 Fällen verletzt**:
`FX1` (Maximum der Vorstunde) steht unter `FF` (Mittelwind). Das ist kein Lesefehler — die
MOS-Regression rechnet Mittel und Bö getrennt und kennt die Ungleichung nicht.

Ohne die Klammer stünde eine Bö unter dem Wind im Cube, und die PAP-6-Konsistenzprüfung schlüge
bei jedem Nutzer fehl. Der Producer klammert und **zählt mit**: im echten Lauf 92 Fälle innerhalb
des Ausschnitts.

Die übrigen Konsistenzbedingungen halten ohne Nacharbeit: Taupunkt ≤ Temperatur in **allen
758 536** Paaren, **0** negative Niederschläge (anders als C-LAEF, §42).

### 44.7 Die Zeitachse — eine Entscheidung mit gemessenem Preis

Die Stationsreihe könnte die Achse des Cubes benutzen (t1 stündlich, t2 dreistündlich, t3
sechsstündlich = 109 Schritte) oder ihre eigene (247 Schritte, durchgehend stündlich). Beides
gebaut und gemessen:

```
A  MOSMIX-Achse, 247 Schritte   179 Buendel   6,79 MiB   groesstes 152 KiB
B  Cube-Achse,   109 Schritte   179 Buendel   2,89 MiB   groesstes  61 KiB      = 42 % von A
```

Gewählt ist **A**. Die 3,9 MiB Differenz sind gegen die **77,84 MiB** des Cubes nichts, und dafür
bleibt erhalten, was MOSMIX als **einzige** Quelle im ganzen Repo kann: eine **stündliche**
Vorhersage bis 246 h. Der Cube ist ab 51 h dreistündlich, weil *Flächen* teuer sind — eine
Stationsreihe ist es nicht, und eine Sparsamkeit aus einem fremden Grund ist keine.

Die Achse steht in `stations.json`, damit kein Leser sie raten muss.

### 44.8 Ergebnis am echten Lauf

```
Lauf 2026091103 (Alter 5,7 h) · 247 Schritte 1…247 h
Stationen: 3071 von 5648 im Ausschnitt
179 Buendel · 6,71 MiB · 9 094 710 Werte
belegte Ebenen (12/51): v10 996 · u10 994 · t2m 853 · clch 732 · clcm 717 · td2m 716
                      · clcl 692 · clct 644 · gust 360 · precip 68 · hModEff 13 · srcCount 4
WALL_STATIONS=55s
```

**Die Länderabdeckung ist gezählt, nicht übernommen** (die Quellenmatrix §7 sagt ausdrücklich, dass
die Zahlen für DE und AT *nicht* ermittelt sind): im Ausschnitt **281** Stationen im WMO-Block 10
(DE), **120** im Block 11 (AT), **122** im Block 06 (CH) — alle drei mit Werten, keine leere Gruppe.
Höhen von **0 bis 3 797 m**.

**12 von 51 Ebenen tragen**, und das ist die richtige Zahl: eine Quelle hat keine Streuung zwischen
Quellen (`_sd` leer), keine Member (`_sd_ens` leer) und keine gemessenen Quantile (`_q10`/`_q90`
leer). `srcCount` steht auf **1**; `ensCount` bleibt **MISSING statt 0** — 0 hieße „gemessen und
null", gemessen wurde nichts. Die 39 leeren Ebenen kosten gemessen **4 Byte je Ebene und Bündel**,
zusammen rund 28 KiB — der Preis dafür, dass es derselbe Container und derselbe Leser ist.

`hModEff` trägt die **Stationshöhe**. Das ist keine Verlegenheitslösung: MOSMIX gilt *am Ort*, also
ist `h_true − h_mod_eff` hier null und PAP 4 hat nichts zu korrigieren. Genau das ist der Grund,
warum diese Quelle nicht ins Gitter darf.

### 44.9 Der Verortungsbeweis

Ein Bündel ist nur dann etwas wert, wenn Spalte *k* wirklich die Station ist, die das Manifest
nennt. Geprüft wurde deshalb **gegen eine unabhängig geholte Quelle**: vier Stationen aus
`single_stations/` einzeln abgerufen, die Bündel mit dem **Client-Leser** (`decodeCubeChunk`)
zurückgelesen und Wert für Wert verglichen:

```
10865 MUENCHEN STADT       Buendel 3_7  Spalte  2/48   2470 Werte, 0 fehlend   max. Abweichung 5,0e-3
11035 WIEN/HOHE WARTE      Buendel 3_13 Spalte  3/8    2470 Werte, 0 fehlend   max. Abweichung 5,0e-3
06660 ZUERICH              Buendel 2_3  Spalte  9/31   2470 Werte, 0 fehlend   max. Abweichung 5,0e-3
10961 ZUGSPITZE            Buendel 2_6  Spalte  3/42   2470 Werte, 0 fehlend   max. Abweichung 5,0e-3
```

**5,0·10⁻³ ist exakt der halbe Quantisierungsschritt** von `u10`/`v10` (Skala 0,01) — also der
größtmögliche Rundungsfehler und kein Versatz. Bei einer Verschiebung um eine Spalte oder eine
Stunde wäre das sofort um Größenordnungen eingebrochen.

### 44.10 ⚠ Zwei Betriebsbefunde, die nicht zur Etappe gehörten

**(1) Der Cron erreicht MOSMIX-L nie im eigenen Zyklus.** An vier aufeinanderfolgenden Läufen
gemessen erscheint die Datei bei **Lauf + 72…79 min** (04:17, 10:12, 16:16, 22:12 zu den Läufen
03/09/15/21 UTC). Der Punkt-Cron läuft bei **Lauf + 50 min** (§31). Der gleichzeitige Lauf ist
damit grundsätzlich unerreichbar; genommen wird der vorige, also ein **6,8 h alter**.

Das ist kein Fehler, aber es muss **dastehen** statt aufzufallen: `stations.json` nennt `ageH`, und
der Grund steht als `caveat` daneben. Den Slot zu verschieben wäre eine Cron-Änderung und damit
Jans Gate — dazu V-PD-28.

**(2) Das Stationsprodukt fiel durch jede Aufbewahrung.** `runsIn(point/)` nimmt nur
Verzeichnisse, die **wie ein Lauf heißen**. `stations` heißt nicht so, also wurde
`point/stations/<lauf>/` nie aufgeräumt — 6,7 MiB je Lauf, achtmal täglich, unbegrenzt. Nach
Tagen hätte das das Repo-Gewicht gesprengt, und zwar lautlos.

Kur: dieselbe Regel in einer zweiten Runde über `point/stations/`, derselbe Boden (`MIN_RUNS`),
und **überalterte Läufe werden benannt statt verschwiegen** — wie auf der Cube-Seite. Am
Datenträger belegt mit drei künstlich gealterten Läufen: der älteste entfernt, der zweite bleibt
mit Hinweis, `catalog.json` unberührt (es ist eine Datei, kein Laufverzeichnis, und steht in
`TIMELESS_PATHS`).

### 44.11 Gate GPD-B9

| Nachweis | Ergebnis |
|---|---|
| MOSMIX-L hat einen Erzeuger; die Form von PD-A ist nicht mehr leer | ✅ `scripts/point/{mosmix,build-stations}.mjs`, **achte Zugriffsfamilie** |
| **Die Bündel tragen Werte** | ✅ 179 Bündel · 6,71 MiB · 9 094 710 Werte · 12/51 Ebenen |
| **Spalte → Station stimmt**, gegen eine unabhängige Quelle | ✅ 4 Stationen × 2 470 Werte, **0 fehlend**, max. Abweichung = halber Quantisierungsschritt |
| Alle drei Länder versorgt, **gezählt** | ✅ DE 281 · AT 120 · CH 122, Höhen 0…3 797 m |
| ⚠ `ps` bleibt MISSING, mit Messung statt Doku | ✅ München/Schleswig/Zugspitze |
| ⚠ PAP-6-Konsistenz hergestellt | ✅ Bö auf den Wind geklammert (92 Fälle); Td ≤ T in 758 536 von 758 536; 0 negative Niederschläge |
| ⚠ Speicher bleibt beschränkt trotz 1 750 MiB | ✅ Rest-Puffer 0,31 MiB, Heap < 40 MiB |
| ⚠ Aufbewahrung greift auch für `stations/` | ✅ am Datenträger nachgebaut; überalterte Läufe werden benannt |
| Registry an vier Stellen gemessen korrigiert | ✅ Läufe · Horizont · Schrittfolge · `vars` |
| Kill-Switch (Regel 2) | ✅ `POINT_STATIONS=0` |
| Laufzeit gemessen, Budget geprüft | ✅ **55 s**; 38,6 + 0,9 = **39,5 min** gegen `JOB_MAX_MIN` 50 — unverändert ausreichend |
| `verify:point-data` | ✅ **533/533** (nach B8: 482) |
| typecheck · Build · Budget | ✅ 0 Fehler · 241/241 · 301,2/302 · **1 366/1 372 unverändert** |
| Bundle unberührt | ✅ `stationBundlePath`, `kml:Placemark`, `MOSMIX_L_LATEST` in **0** Chunks; `totalJs` byte-gleich |
| Veröffentlicht? | ❌ **nein** — `POINT_PUSH` bleibt aus |

### 44.12 Verbesserungen (D-28)

**V-PD-28 · Der Cron-Slot erreicht MOSMIX-L nie im eigenen Zyklus.** Gemessen erscheint MOSMIX-L
bei Lauf + 72…79 min, der Job läuft bei Lauf + 50 min ⇒ der genommene Lauf ist stets ~6,8 h alt.
*Mehrwert:* sechs Stunden Frische an der einzigen bias-korrigierten Quelle des Repos — und zwar
genau in den Stunden 1…6, in denen der Stationsanker den größten Hebel hat (§12 der
Punktvorhersage-Linie: 2,18 → 0,92 K). *Skizze:* entweder den Slot auf `:25` der Folgestunde
schieben (dann sind aber ICON-EU und IFS *weniger* weit, §31 hat das gegeneinander gemessen) oder
**einen zweiten, sehr billigen Job** nur für das Stationsprodukt bei `25 4,10,16,22` — 55 s und
76 MiB, also weit unter allem anderen. Der zweite Weg ändert den Cube-Takt nicht.
⚠ **Cron-Änderung = Jans Gate.**

**V-PD-29 · Der Stationsanker holt MOSMIX noch selbst, obwohl es jetzt im Repo liegt.**
`src/pointForecast/anchor.ts` zieht MOSMIX-L je Station einzeln von `opendata.dwd.de` (17,7 KiB
je Station, eine Anfrage je Ort). Dasselbe Datum steht ab dieser Etappe als Bündel im Daten-Repo
und käme über jsDelivr. *Mehrwert:* ein Abruf statt einem je Ort, kein Fremd-Origin im
Erstbild-Pfad, und dieselbe Zahl für Producer und Client (heute können die beiden Wege
verschiedene Läufe treffen, ohne dass es jemand merkt). *Skizze:* ein Leser analog
`nowcastReader.mjs`, der aus `lat/lon` den Stufe-1-Chunk rechnet, das Bündel holt und die Spalte
über `stations.json` auflöst — die nächstgelegene Station kommt aus `catalog.json`.

**V-PD-30 · MOSMIX-S könnte die Stationsreihe stündlich frisch halten.** MOSMIX-S läuft
**stündlich** (alle Stationen in einer Datei, am Verzeichnis 36,3 MiB), MOSMIX-L nur viermal
täglich. *Mehrwert:* die Stationsreihe wäre nie älter als eine Stunde statt bis zu 6,8 h — das
behebt V-PD-28 auf einem anderen Weg. *Skizze:* dasselbe Modul liest beide (die KML-Form ist
identisch); zu klären ist, welche der zehn Größen MOSMIX-S führt (es hat weniger Parameter als L)
und ob ein Nebeneinander zweier Läufe im selben Produkt die Achse zerreißt — beides eine Messung,
keine Annahme.


---

## §45 PD-B10 — IFS-ENS-Member jenseits 180 h (V-PD-27), und drei Fehler aus PD-B8

Jans Entscheidung vom 2026-09-11 zu V-PD-27: **ECMWF-Member dazunehmen**, t2m + Niederschlag im
48-Stunden-Raster. Hintergrund aus §43.12: σ_ens deckte in der Fernstufe 2 von 9 Rasterstunden,
beide im Bereich, der ohnehin σ_div aus vier Quellen hat — jenseits 180 h gab es keine
Unsicherheitsinformation, und ein p10/p90 dort wäre erfunden gewesen.

Die Etappe hat getan, was bestellt war. Sie hat dabei aber **drei Fehler aus meiner eigenen Etappe PD-B8** ans Licht gebracht, alle
still: einer lag im erlaubten Wertebereich, einer hat zwei Quellen vollständig aus dem Cube
entfernt, und der dritte zeigte sich erst am Speicher — der Cron stand bei 84 % der
Heap-Grenze (45.12). Die ersten beiden stehen hier zuerst, weil sie wichtiger sind als die
Etappe selbst.

### 45.1 Am Katalog gemessen, bevor gebaut wurde

Am echten Lauf 2026091100, Schritt +240 h:

| Befund | gemessen |
|---|---|
| Member | **50** gestörte (`type: pf`, `number` 1…50), **kein** Kontrolllauf in `enfo-ef` — einzeln adressierbar, aber nicht zusammenhängend abgelegt |
| Größe je Member | `2t` **0,63 MiB**, `tp` **1,05 MiB** |
| Horizont | nur **00z und 12z** reichen bis 336 h; 06z/18z enden bei **144 h** (180 h: 404) |
| ⚠ `tp` | seit Laufbeginn **akkumuliert** (Template 4.11, Prozess 1, Spanne = 14 400 min = 240 h) |

⚠ **Meine Zahl aus §43 war falsch hochgerechnet:** „55,8 MiB je (Größe, Schritt)" galt einem
anderen Parameter. Richtig sind 31,5 MiB (`2t`) und 51,5 MiB (`tp`) für 50 Member. Die
Kostenentscheidung, die in PD-B8 darauf stand, war also auf einer falschen Zahl gebaut.

### 45.2 ⚠ Fehler 1 aus PD-B8: `precip_sd_ens` war die Streuung einer SUMME

Die Producer-Schleife entakkumuliert den deterministischen Niederschlag korrekt:
`(Summe[t] − Summe[t−Δ]) / Δ`. Der Ensemble-Pfad tat das **nicht** — `dwdEps.mjs` streute direkt
über `tot_prec`, also über die Summe seit Laufbeginn, und schrieb das Ergebnis in
`precip_sd_ens`: eine Ebene mit der Einheit mm/h, die dieselbe Größe verspricht wie `precip`.

Am echten ICON-D2-EPS nachgemessen, Streuung der Summe gegen Streuung der Rate:

```
                              heute geschrieben    versprochen    Faktor
+6 h,  nasse Zellen (52 074)        1,04               0,42          2,5
+12 h, nasse Zellen (16 528)        0,88               0,31          2,8
+48 h, nasse Zellen (150 867)       1,82               0,49          3,7
+48 h, alle Zellen (Median)         1,23               0,04         29
IFS-ENS +240 h, DACH (Median)       9,57 mm            0,18 mm/h    53
```

**Zellen, in denen es JETZT trocken ist, trugen die Streuung des Regens der letzten Tage.** Im
Probebau sieht man es an Wien: Regen in den Stunden 1–2 (1,03 und 0,63 mm/h), bei +12 h trocken
— die korrigierte Ebene sagt dort **0,00**. Nach PD-B8 hätte dort die Streuung des Regens vom
Vormittag gestanden. Und alles lag im erlaubten Wertebereich `[0, 300]`: keine Prüfung hätte
angeschlagen.

**Kur:** eine Streuungsrechnung für alle Ensembles (`scripts/point/adapters/ensembleStats.mjs`,
`memberSpread`) — je Member `max(0, Summe[t] − Summe[t−Δ]) / Δ`, Member über ihre **Nummer**
gepaart, dann die Streuung. Δ ist der **Stufenschritt** (1/3/6 h), also dieselbe Größe wie die
`precip`-Ebene; bewusst nicht der Abstand zur vorigen *gewählten* Stunde, sonst stünde mit
`--steps` eine Rate über zwei Tage in der Stundenebene. Die Klammer auf 0 ist gemessen nötig:
**312 von 100 450** entakkumulierten IFS-Werten waren negativ (Packungsrauschen in trockenen
Zellen), im Probebau der Fernstufe **1 578**.

**Die Korrektur hat Folgen, die dastehen müssen.** Eine Rate braucht den Vorschritt, und die
DWD-Ensembles haben ihn nicht überall — am Verzeichnis gemessen:

| Ensemble | Schritte `tot_prec` | Stufenschritt | Rate bildbar |
|---|---|---|---|
| ICON-D2-EPS | stündlich bis 48 h | 1 h | überall außer Stunde 0 |
| ICON-EU-EPS | stündlich bis 48, 3-stündlich bis 72, **6-stündlich bis 120** | 3 h | nur **60 und 72 h** |
| ICON-EPS global | …, 6-stündlich bis 120, **12-stündlich bis 180** | 6 h | **nirgends** (138/162 fehlen) |

Wo die Rate nicht bildbar ist, bleibt die Ebene **MISSING** — nicht eine Rate über einen längeren
Zeitraum: σ über 6 h ist glatter als über 3 h, und in die 3-h-Ebene geschrieben wäre das eine
erfundene Sicherheit. **Die Fernstufe hatte also nie ein richtiges σ_ens für Niederschlag, nur
ein falsches.** Das richtige kommt jetzt von IFS-ENS, dessen Schrittraster den Vorschritt t−6
überall führt (3-stündlich bis 144, danach 6-stündlich).

Stunde 0 bekommt keine Niederschlags-Streuung mehr — PD-B8 schrieb dort eine 0 (alle Member
teilen die Analyse, also streut die Summe null). Eine Rate „bis zum Laufbeginn" gibt es nicht.

### 45.3 Member über ihre Nummer, nicht über ihre Reihenfolge

Die Rate braucht **denselben** Member in zwei Dateien. Der Decoder lieferte die Member bisher nur
in Dateireihenfolge — eine Paarung darüber wäre genau V-PD-25 gewesen (der deterministische
Niederschlag war dort durch die Reihenfolge richtig, nicht durch eine Auswahl).

`src/sources/gribDecode.ts` liest jetzt **Oktett 36 (Member-Nummer) und 37 (Ensemblegröße)** der
Templates 4.1 und 4.11 — rein additiv. Am echten ICON-D2-EPS: `t_2m` (Template 1) und `tot_prec`
(Template 11) tragen beide die Nummern **1…20**, Ensemblegröße 20. Bei ECMWF wird die Nummer
zusätzlich **gegen das `.index` geprüft**: weicht sie ab, sind die Byte-Bereiche verschoben, und
der Abruf scheitert laut statt still falsche Zahlen zu liefern. Fehlt die Nummer bei einer
akkumulierten Größe, gibt es keine Rate — eine geratene Paarung ist schlimmer als keine.

⚠ Der Decoder liegt im Kartenbündel: **+0,1 KB** `totalJs` (1 366,0 → 1 366,1), in denselben drei
Worker-Chunks wie die PD-B8-Felder, **nicht** im Start-Chunk (`eagerJs` bleibt unberührt).

### 45.4 Warum 50 Member und nicht 20

Weil ECMWF die Member als getrennte Bereiche ablegt, wäre eine Teilmenge abrufbar — das war der
Kern von V-PD-27. Gemessen an allen 2 009 Zellen des Ausschnitts, σ aus den ersten 20 gegen σ aus
allen 50:

```
2t @240 h                 Median-Abweichung  4,9 %   Mittel s20/s50 0,999   → 20 würden reichen
tp 234→240 h (mm/h)       Median-Abweichung 39,9 %   Mittel s20/s50 0,984   → 20 reichen NICHT
```

Niederschlag ist intermittierend; ob eine Teilmenge die nassen Member erwischt, ist Zufall. Und
beide Größen brauchen **dieselbe** Memberzahl, sonst sagte `ensCount` — eine Ebene für alle
Größen (V-PD-26) — für eine von beiden das Falsche. Also 50, `POINT_ECMWF_MEMBERS` verkleinert nur
auf gerade Zahlen (vollständige Paare). Die ±-Paar-Struktur der Anfangsstörungen ist am Start nur
noch schwach sichtbar (rms(m1+m2−m3−m4) = 0,97 K gegen 1,24 K über Kreuz), bei +240 h gar nicht
mehr (3,55 gegen 3,64).

Kosten bei 50 Membern: jenseits der ICON-EPS-Reichweite 4 Rasterstunden × (31,5 + 2 × 51,5) MiB
= **538 MiB** — der Niederschlag zählt doppelt, weil der Vorschritt mitkommt. Das liegt innerhalb
der ≈ 558 MiB, die Jan freigegeben hat.

### 45.5 Mehrere Byte-Bereiche in einer Anfrage

50 Member einzeln wären 50 Anfragen je (Größe, Schritt), bei 300 ms Mindestabstand und gemessenen
3 Drosselungen je 165 Anfragen. `data.ecmwf.int` beantwortet einen Range-Kopf mit 50 Bereichen mit
**HTTP 206 `multipart/byteranges`** — gemessen **31,55 MiB in 3,6 s**, alle 50 Längen stimmen.

`fetchRanges()` in `shared.mjs` ordnet die Teile über ihren `Content-Range` zu, **nicht über ihre
Position** — ein Server darf umordnen und nahe Bereiche zusammenlegen (RFC 7233); beides steht im
Selbsttest. Und es bricht ab, **bevor der Körper gelesen wird**, wenn der Server den Range-Kopf
ignoriert und mit 200 die ganze Datei schicken will — eine `enfo-ef`-Datei hat Hunderte MiB.
Jeder Bereich liegt danach im Cache unter demselben Schlüssel wie bei `fetchBytes(url, { range })`.

Am echten Server: **5 Anfragen statt 150** für t2m + Niederschlag an einem Schritt, 138 MiB in
41,8 s, keine Drosselung.

### 45.6 Je Stunde genau eine Quelle

Bis PD-B8 kannte eine Stufe genau ein Ensemble (`find`). Die Fernstufe hat jetzt zwei. Die Regel:
**je Stunde genau EINE Quelle**, die erste in der Reihenfolge der Stufe, die mindestens eine Größe
liefert. Member zweier Ensembles werden **nie** gemischt — die Streuung über ICON- und IFS-Member
wäre eine Streuung *zwischen* Modellen, also σ_div, und stünde in der Ebene für σ_ens.

ICON-EPS global steht in der Stufe vor IFS-ENS: Jans PD-B8-Raster bleibt, IFS-ENS ergänzt. Am
Probebau:

```
byHour  144 → icon_eps_global   168 → icon_eps_global   (nur t2m — keine 6-h-Rate bildbar)
        192 → ifs_ens   240 → ifs_ens   288 → ifs_ens   336 → ifs_ens   (t2m + Niederschlag)
```

⚠ **Der Quellenwechsel ist sichtbar, und das gehört gesagt:** bei 168 h (ICON) steht σ_ens(t2m)
im Median bei 1,93 K, bei 192 h (IFS) bei 1,47 K. Die Unsicherheit sinkt nicht — zwei Systeme
streuen verschieden (am selben Termin +144 h: IFS-ENS 1,20 K, ICON-EPS global 1,33 K). `byHour`
im Manifest macht den Wechsel lesbar; ausgleichen kann ihn erst `c(p,f)` je Quelle, und das
braucht `buscosun-archiv`.

Ein Ensemble-Fehler ist **laut, aber nicht tödlich**: er wird gezählt und steht im Manifest, der
Cube wird trotzdem fertig — dieselbe Regel wie beim Stationsprodukt.

### 45.7 ⚠ Fehler 2 aus PD-B8: IFS HRES und AIFS Single lieferten seit PD-B8 nichts

Der erste Probebau der Fernstufe hatte IFS HRES als einzige deterministische Quelle — und **jede**
deterministische Ebene blieb leer, obwohl die Quelle als „zugeordnet (36 Std.)" im Protokoll stand.

Die Ursache stand in PD-B8 (§43.6): der ECMWF-Indexfilter wurde von `number` auf `type`
umgestellt, damit Ensembles nur ihren Kontrolllauf behalten —
`if (e.type != null && String(e.type) !== 'cf') continue;` — als **eine** Bedingung für **alle**
Modelle. Deterministische Dateien tragen `type: "fc"`. Am echten `.index` nachgezählt:

```
ifs_hres     36 Oberflächeneinträge, alle type fc   → PD-B8-Filter behält 0
aifs_single  21 Oberflächeneinträge, alle type fc   → PD-B8-Filter behält 0
aifs_ens     21 Oberflächeneinträge, alle type cf   → behält 21 (richtig)
```

**Beide deterministischen ECMWF-Quellen haben seit PD-B8 in keiner Stufe ein Feld geliefert.** Im
Gesamtlauf fiel es nicht auf, weil ICON global und AICON die Fernstufe weiter füllten. Der einzige
Hinweis war die Größe — Stufe 3 schrumpfte von **1,29 MiB (PD-B1) auf 0,38 MiB** —, und den habe
ich in §43.12 übersehen. Veröffentlicht ist davon nichts: der Cron baut mit dem committeten Stand,
und der liegt vor PD-B8.

⚠ **Und der Verifier hat den Fehler bestätigt statt gefunden.** Die Prüfung aus PD-B8 verlangte
per Regex, dass genau die Zeile `String(e.type) !== 'cf'` im Code steht. Geprüft wurde die
**Schreibweise**, nicht das Verhalten. Die Kur ist deshalb eine Funktion, `keepIndexEntry(model,
entry)`, die der Verifier mit Zeilen in echter Form füttert: `fc` bleibt bei deterministischen
Modellen, `cf` bleibt beim Kontrolllauf-Adapter, `pf` fällt dort heraus.

Nach der Reparatur, derselbe Probebau: Stufe 3 **1,25 MiB statt 0,05**, **19 von 51 Ebenen**,
`srcCount` durchgehend **2** (IFS HRES + AIFS Single).

### 45.8 Der Beleg: Spread wächst, und σ_div sagt etwas anderes als σ_ens

Nirgends im Code steht, dass die Unsicherheit mit der Vorhersagezeit zunimmt. Am Probebau:

```
σ_ens(t2m), Median über 2 009 Zellen:   192 h 1,47 K · 240 h 2,35 K · 288 h 2,60 K · 336 h 3,48 K
σ_ens(Niederschlag):                    192 h 0,18 · 240 h 0,18 · 288 h 0,28 · 336 h 0,31 mm/h
```

Und die unabhängige Gegenprobe: dieselben Werte hatte eine **getrennt geschriebene** Sonde vorher
direkt aus den Member-Feldern gerechnet — 2,350 K, 0,180 mm/h, 312 geklemmte Werte. Adapter und
Sonde stimmen auf die Stelle.

**Die eigentliche Begründung für V-PD-27 steht in derselben Tabelle:** bei +240 h streuen IFS HRES
und AIFS Single untereinander nur **0,63 K** (σ_div), das Ensemble aber **2,35 K** (σ_ens); bei
+192 h 0,54 gegen 1,47. Zwei Modelle derselben Familie sind sich viel einiger, als die Lage sicher
ist — dieselbe Warnung wie §29.3 für die beiden ICON in Stufe 1. Ohne σ_ens hätte die Fernstufe
jenseits 180 h nur σ_div gehabt, und `σ_sys` ist ungemessen.

### 45.9 Ein Schritt, eine Anfrage — auch für die deterministischen Felder

Die Reparatur aus 45.7 hat eine Kostenfolge: IFS HRES und AIFS Single holen wieder Felder, je
Größe eine Anfrage — gerechnet rund 1 000 über alle Stufen, bei 300 ms Mindestabstand ≥ 5 min nur
Warten. **Der PD-B8-Gesamtlauf (38,6 min) war also zu kurz gemessen**, weil diese Abrufe fehlten.

Derselbe Mechanismus wie in 45.5 hilft: beim ersten Feld eines Schritts werden alle Größen dieses
Schritts in **einer** Anfrage geholt; sie liegen danach im Cache, und die Einzelabrufe treffen ihn.
Schlägt der Sammelabruf fehl, bleibt der Einzelweg; `POINT_ECMWF_MULTIRANGE=0` schaltet ab.

**Beweis, dass kein Byte anders wird:** dieselbe Stufe 3 mit leerem Cache neu gebaut und jeden
Chunk gegen den Bau mit Einzelabrufen verglichen — **12 von 12 byte-gleich**. Dabei **172
Anfragen** für 1,03 GiB (vorher über 700 für dieselben Felder).

### 45.10 Drei veraltete Aussagen im Lauf-Manifest

Alle drei betreffen genau die Quellen dieser Etappe, deshalb sind sie hier korrigiert:

* `sigma.ens` sagte „**heute überall MISSING**, weil noch kein Ensemble gelesen wird" — seit PD-B8
  falsch.
* `sources[].members` stand bei den EPS-Quellen auf **0**, und der Kommentar daneben definiert 0 als
  „deterministisch". Jetzt die Zahl der Member (ICON-D2-EPS 20, ICON-EPS global 40, IFS-ENS 50).
* `noEns` behauptete „Größen ohne `_sd_ens`-Ebene: `snowlmt`" — mit Schema 3 falsch geworden und
  bis heute nicht aufgefallen. Jetzt steht dort **gezählt**, welche σ_ens-Ebenen im Lauf leer
  blieben (`sdEnsEmpty`), statt einer fortgeschriebenen Liste (BW-1).

### 45.11 Ein Befund für die Quellenmatrix

Die Matrix führt IFS ENS als tragende Quelle für 240–336 h und schreibt die 144-h-Grenze der
06/18-UTC-Läufe (⚠⁷) nur **IFS HRES** zu. Gemessen (Läufe 2026091006 und 2026091018) gilt sie für
IFS ENS genauso; bis 336 h reichen um 06/18 UTC nur **AIFS Single und AIFS-ENS**. Der Selbsttest
der Registry hatte daraus „06 UTC trägt nur die ENS" abgeleitet und war nur grün, weil die Registry
für IFS-ENS keinen laufabhängigen Horizont kannte — eine Prüfung, die an einer Lücke der Registry
hängt, bestätigt die Lücke. Registry und Selbsttest sind korrigiert; die Matrix selbst bleibt
Jans Dokument (V-PD-33).

### 45.12 Der Gesamtlauf — und was er über PD-B8 nachträglich sagt

Alle drei Stufen, alle Quellen, **leerer Cache**:

```
EXIT=0  WALL=2 540 s (42,3 min)
t1  208 Chunks · 75,76 MiB   σ_ens icon_d2_eps 9 Std. · Quantile 49 · Profil 49
t2   56 Chunks ·  6,53 MiB   σ_ens icon_eu_eps 6 Std. (Niederschlag nur 60/72 h)
t3   12 Chunks ·  1,34 MiB   σ_ens icon_eps_global 144/168 · ifs_ens 192/240/288/336
3 Stufen · 276 Chunks · 83,63 MiB · Netz 3 947 Dateien · 7 801,6 MiB
```

Gegen PD-B8 (38,6 min · 5 965,7 MiB · 77,84 MiB): **+1,8 GiB Netz, aber nur +3,7 min**. Dazu
gehören IFS-ENS (538 MiB), die deterministischen ECMWF-Felder, die in PD-B8 gar nicht geholt
wurden, die Vorschritte für die Entakkumulation und laufabhängige Abdeckung (Profil diesmal 49
statt 38 Stunden). Genau aufschlüsseln lässt es sich nicht — der Producer zählt das Netz nur
gesamt (V-PD-36). Dass die Laufzeit kaum wächst, liegt an den Sammelabrufen aus 45.5 und 45.9.

**Der PD-B8-Wert von 38,6 min war zu kurz gemessen**, weil die Abrufe von IFS HRES und AIFS Single
fehlten. `JOB_MAX_MIN` geht deshalb von 50 auf **55** (gemessen + 30 %; der Durchsatz schwankte in
dieser Phase um Faktor 5). Der engste Cron-Abstand von 100 min hält die Regel `≥ JOB_MAX_MIN + 20`
weiter. Das Job-Timeout der Vorlage liegt bei 330 min und bindet nicht.

**Was dem PD-B8-Cube gefehlt hätte, zeigt `srcCount` jetzt direkt:**

```
t1  srcCount  2: 26 %   3: 46 %   4: 10 %   5: 10 %   6: 8 %
t2  srcCount  4: 53 %   5: 47 %
t3  srcCount  2: 72 %   4: 28 %      ← die „2" jenseits 180 h sind IFS HRES + AIFS Single
```

In Stufe 3 tragen jenseits 180 h **genau die zwei Quellen, die der Filter gestrichen hatte**. Der
PD-B8-Cube hatte dort also **überhaupt keine Vorhersage** — 156 der 336 Stunden leer, schlimmer
als die Lage aus §33.4, die PD-B1 behoben hatte. Veröffentlicht war er nie.

**Und σ_div gegen σ_ens, über alle drei Stufen:**

```
          σ_div(t2m)   σ_ens(t2m)
t1 +6 h      0,63         0,46       Modelle streuen STÄRKER als das Ensemble
t1 +48 h     0,70         0,56
t2 +72 h     0,63         0,96       ab hier ist es umgekehrt
t2 +120 h    0,90         1,58
t3 +240 h    0,63         2,35       Faktor 3,7
t3 +336 h    1,59         3,48
```

Die beiden Streuungen messen verschiedene Dinge, und ihr Verhältnis **kippt** mit der
Vorhersagezeit: kurzfristig sind die Modelle uneiniger, als ein Ensemble streut (bekannt: die
Kurzfrist-EPS sind unterdispersiv), in der Fernstufe sind sich zwei Modelle derselben Familie weit
einiger, als die Lage sicher ist. PAP 6 verzweigt deshalb zu Recht ENTWEDER-ODER — einen festen
Faktor zwischen beiden gibt es nicht, und genau deshalb dürfen sie nicht addiert werden.

**Speicher — und ein dritter Fehler aus PD-B8.** Die Prozessgröße stieg in Stufe 1
(12:09–12:11 Uhr) von 2,3 auf **4,2 GB** und blieb danach bei ~3,5 GB; nach PD-B8 lag sie bei
~2,1 GB. Die Prozessgröße sagt aber nicht, wie nah die V8-Heap-Grenze ist — der Speicher
hinter Typed Arrays liegt außerhalb. Deshalb misst der Producer jetzt je Stufe den
Heap-Höchststand gegen die Grenze (eine Zeile im Cron-Protokoll), und die erste Messung war
eindeutig:

```
Stufe 1, alter Code:  Heap max 3 486 von 4 144 MiB (84 %) · extern max 369 MiB · RSS max 3 831 MiB
```

Das ist die Lage aus §43.11, 16 % davor — und meine Vermutung („Typed-Array-Speicher außerhalb
des Heaps“) war falsch. Die Ursache ließ sich am echten Adapter isolieren: vier C-LAEF-Fenster
nacheinander geladen, nach jeder vollen Speicherbereinigung gemessen:

```
                        lebendiger Heap je Fenster    außerhalb des Heaps
vorher  (JS-Array)             +72 MiB                     +0 MiB
nachher (Int16Array)            +0 MiB                    +18 MiB
```

`jsfive` legt gechunkte HDF5-Datensätze als **gewöhnliches JavaScript-Array** an
(`new Array(data_size)`), und `geosphere.mjs` legte genau dieses Array in den Fenstercache.
§43.11 hatte dessen Obergrenze von 26 Fenstern mit **19 MiB je Fenster** ausgelegt — als Typed
Array gerechnet, nicht gemessen. Tatsächlich waren es **72 MiB im Heap**; die Obergrenze ließ
also bis zu ~1,9 GB zu. Dieselbe Klasse wie die Füllwertliste aus PD-B7: eine Zahl, die man
hätte messen können, war angenommen — und die Kur für §43.11 war auf ihr gebaut.

Beim Lesen dazugekommen: `d.value` ist in `jsfive` ein **Getter, der bei jedem Zugriff neu
entpackt**. Der Code griff zweimal zu (`d.value?.length` und `values: d.value`), jedes Fenster
wurde also doppelt dekomprimiert.

**Kur:** Fenster als `Int16Array` (`toTyped()` — die Felder sind int16; ein unbekannter Typ
fällt verlustfrei auf `Float64Array` zurück, geschätzt wird nichts), und `d.value` wird einmal
gelesen. Der Verifier prüft beides am Verhalten. 

**Der Gegenbeweis mit halbierter Grenze.** `heapUsed` zählt auch Müll, den der Garbage Collector
noch nicht eingesammelt hat; tödlich ist nur, was nach einer vollen Sammlung lebendig bleibt. Mit
`--max-old-space-size=2560` sammelt V8 aggressiver — und der **alte Code stirbt**: nach 444 s
„FATAL ERROR: Reached heap limit … JavaScript heap out of memory“ bei 2 511 MB, unmittelbar nach
dem Ensemble-Abschnitt, also in den C-LAEF-Quantilen (14 Parameter — genau dort füllt sich der
Fenstercache). Der lebendige Heap lag über 2,5 GB; mit der normalen Grenze von 4 144 MiB war der
Cron nicht sicher, sondern 16 % vor §43.11. Der **korrigierte Code läuft unter derselben Grenze durch**: 545 s, EXIT 0, Quantile
und Profil vollständig, Heap max 98 von 2 608 MiB. Gleiche Daten, gleiche Grenze — der alte
stirbt, der neue nicht.

```
Stufe 1, alter Code:  Heap max 3 486 von 4 144 MiB (84 %) · extern max   369 MiB · RSS max 3 831 MiB
Stufe 1, neuer Code:  Heap max    98 von 4 144 MiB  (2 %) · extern max 1 407 MiB · RSS max 1 529 MiB
```

Dass der Heap fast leer wird, ist stimmig: außer den `jsfive`-Arrays liegen alle großen Daten des
Producers in Typed Arrays, also außerhalb — deshalb steigt der externe Speicher, und der zählt
nicht gegen die Grenze. Die Prozessgröße fällt von 3,8 auf 1,5 GB. Einschränkung: der Abtaster
misst im Sekundentakt und kann kurze Spitzen in langen synchronen Abschnitten verpassen (etwa das
72-MiB-Array, das `jsfive` beim Lesen eines Fensters weiterhin kurz anlegt) — beweiskräftiger ist
deshalb der Gegenversuch mit halbierter Grenze oben.

Der Gesamtlauf oben ist mit dem **alten** Code gemessen. Neu gemessen ist nur Stufe 1, weil der
C-LAEF-Fenstercache nur dort lebt; dort macht der korrigierte Code strikt weniger Arbeit (jedes
Fenster einmal statt zweimal entpackt).


**Platte.** Der Cache wuchs auf **9,1 GiB** (Stufe 1 5,51 · Stufe 2 2,08 · Stufe 3 1,53). Ein
GitHub-Runner garantiert für öffentliche Repos 14 GB SSD. Das passt, ist aber zum ersten Mal als
Grenze gemessen und wächst mit jeder Quelle — V-PD-36.

### 45.13 Gate GPD-B10

| Nachweis | Ergebnis |
|---|---|
| **σ_ens jenseits 180 h** (V-PD-27) | ✅ IFS-ENS bei 192/240/288/336 h, t2m + Niederschlag, 50 Member; ICON-EPS global behält 144/168 h |
| Je Stunde genau eine Quelle, Member nie gemischt | ✅ `tiers[].ensemble.byHour`; der Sprung beim Quellenwechsel (1,93 → 1,47 K) ist benannt, nicht geglättet |
| ⚠ **PD-B8-Fehler 1 behoben:** `precip_sd_ens` ist die Streuung der Rate | ✅ vorher Faktor 2,5–3,7 (nasse Zellen) bis 53 (IFS +240 h) zu groß; Stunde 0, ICON-EU-EPS 84–120 h und ICON-EPS global 144/168 h jetzt MISSING statt falsch |
| Member über ihre Nummer gepaart | ✅ Decoder liest Oktett 36/37; bei ECMWF gegen das `.index` geprüft; ohne Nummer keine Rate |
| ⚠ **PD-B8-Fehler 2 behoben:** ECMWF-Indexfilter | ✅ vorher IFS HRES 0/36, AIFS Single 0/21 behalten; jetzt `keepIndexEntry`, vom Verifier mit echt geformten Zeilen geprüft statt per Regex; Stufe 3 wieder 1,34 MiB, jenseits 180 h `srcCount` 2 |
| 50 statt 20 Member begründet | ✅ gemessen: t2m 4,9 %, Niederschlag 39,9 % Median-Abweichung bei 20 |
| Mehrere Bereiche in einer Anfrage | ✅ IFS-ENS 5 statt 150 Anfragen je Schritt; deterministische ECMWF-Felder **12/12 Chunks byte-gleich** zum Einzelweg |
| Unabhängige Gegenprobe | ✅ Adapter und getrennt geschriebene Sonde: 2,350 K · 0,180 mm/h · 312 geklemmte Werte, auf die Stelle |
| Spread wächst ohne Vorgabe | ✅ σ_ens(t2m) 1,47 → 2,35 → 2,60 → 3,48 K (192 → 336 h) |
| Gesamtlauf kalt | ✅ EXIT 0 · **42,3 min** · 7,8 GiB Netz · 276 Chunks · 83,63 MiB; `JOB_MAX_MIN` 50 → **55** |
| ⚠ **PD-B8-Fehler 3 behoben:** C-LAEF-Fenster lagen als JS-Array im Heap | ✅ je Fenster 72 → 0 MiB Heap (18 MiB außerhalb); doppeltes Entpacken beseitigt; Verhaltensprüfung im Verifier |
| Speicher | ✅ Stufe 1 Heap max 3 486 → **98** von 4 144 MiB, Prozess 3,8 → 1,5 GB; **mit halbierter Grenze (2 560 MiB) stirbt der alte Code nach 444 s, der neue läuft durch** |
| Platte | ⚠ Cache 9,1 GiB gegen 14 GB auf dem Runner — passt, erstmals gemessen, V-PD-36 |
| Registry und Selbsttest | ✅ IFS-ENS 06/18 UTC → 144 h; der 336-h-Selbsttest prüft jetzt die gemessene Aufteilung |
| Veraltete Manifest-Aussagen | ✅ drei korrigiert (`sigma.ens`, `sources[].members`, `noEns` → `sdEnsEmpty`) |
| `verify:point-data` | ✅ **586/586** (nach B9: 533) |
| typecheck · Build · Budget | ✅ 0 Fehler · 241/241 · 301,2/302 · 1 366,1/1 372 |
| Bundle | ✅ Decoder +0,1 KB (`totalJs` 1 366,0 → 1 366,1) in drei Worker-Chunks, **nicht** im Start-Chunk; die Punkt-Module in null Chunks |
| Veröffentlicht? | ❌ **nein** — `POINT_PUSH` bleibt aus |

### 45.14 Verbesserungen (D-28)

**V-PD-27 · erledigt (§45).** σ_ens reicht jetzt bis 336 h: IFS-ENS, 50 Member, t2m und
Niederschlag bei 192/240/288/336 h; ICON-EPS global behält 144/168 h.

**V-PD-31 · Der Decoder entpackt 80 Nachrichten, wo 20 gebraucht werden.** ICON-D2-EPS bündelt
`tot_prec` in vier Viertelstunden-Fassungen je Member; `decodeGrib2All` dekodiert alle 80
(80 × 542 040 Werte ≈ 173 MB), behalten werden 20. Seit der Entakkumulation liegen zwei solche
Dateien gleichzeitig im Speicher. *Mehrwert:* drei Viertel der Dekodierzeit und des Spitzenspeichers
für diese Größe fallen weg — genau der Posten, der beim Cron an der 4-GB-Grenze zählt (§43.11).
*Skizze:* `decodeGrib2All(raw, { keep: (hdr) => hdr.intervalEndMinute === 0 })` — Sektion 4 ist
vor Sektion 7 gelesen, die Werte einer verworfenen Nachricht müssen nie entpackt werden.

**V-PD-32 · Beim Quellenwechsel springt σ_ens, obwohl die Unsicherheit nicht springt.** In der
Fernstufe wechselt die Quelle zwischen 168 h (ICON-EPS global) und 192 h (IFS-ENS); σ_ens(t2m)
fällt dort im Median von 1,93 auf 1,47 K. Zwei Systeme streuen verschieden (am selben Termin
+144 h: IFS 1,20 K, ICON 1,33 K). *Mehrwert:* PAP 6 rechnet `σ = c(p,f)·σ_ens` — mit EINEM c für
beide Quellen erbte die Vorhersage den Sprung als falsche Kante in der Unsicherheit. *Skizze:*
`calib.json` führt `c` je (Quelle, Größe, Vorhersagezeit); bis es gemessen ist, nennt
`tiers[].ensemble.byHour` die Quelle je Stunde, damit ein Leser den Sprung zuordnen kann.
Braucht `buscosun-archiv`.

**V-PD-33 · ⚠⁷ der Quellenmatrix gilt auch für IFS ENS.** Die Matrix nennt die 144-h-Grenze der
06/18-UTC-Läufe nur für IFS HRES; gemessen gilt sie für IFS ENS genauso, und um 06/18 UTC reichen
nur AIFS Single und AIFS-ENS bis 336 h. *Mehrwert:* wer die Matrix liest, plant sonst mit einer
Quelle, die es zu dieser Stunde nicht gibt — genau der Fehler, den der Registry-Selbsttest hatte.
*Skizze:* Fußnote ⚠⁷ auf „IFS HRES und IFS ENS" erweitern. **Jans Dokument** — nicht von mir
geändert.

**V-PD-34 · Vier σ_ens-Ebenen haben keinen Schreiber.** `td2m`, `clct`, `ps` und `snowlmt` — jetzt
gezählt in `sdEnsEmpty`, nicht behauptet. Ursache ist die PD-B8-Volumenentscheidung (fünf Größen
in t1/t2, zwei in t3) und dass die ICON-CH-Member nicht gelesen werden. *Mehrwert:* für diese
Größen fällt PAP 6 auf σ_div zurück, das in Stufe 1 zu zwei Dritteln aus zwei ICON besteht
(§29.3). *Skizze:* je Größe die Kosten am Verzeichnis messen (ICON-D2-EPS 13,4 MiB je Datei, bei
6-stündlichem Raster 9 Dateien je Größe) und Jan die Zahl vorlegen.

**V-PD-35 · Stufe 2 hat jenseits 72 h keine Niederschlags-Streuung.** ICON-EU-EPS rechnet ab 78 h
6-stündlich, der Stufenschritt ist 3 h — die Rate ist dort nicht bildbar (45.2). *Mehrwert:* σ_ens
für Niederschlag über 84–120 h, also genau in der Mittelfrist, in der Starkregen-Signale anfangen
zu tragen. *Skizze:* IFS-ENS rechnet bis 144 h **3-stündlich** — dieselbe Mechanik wie in Stufe 3,
nur mit Δ = 3 h; Kosten je Rasterstunde 2 × 51,5 MiB. Eine Messung und eine Entscheidung, keine
Annahme.

**V-PD-36 · Der Plattencache wächst über alle Stufen, obwohl kaum etwas zweimal gelesen wird.**
Im kalten Gesamtlauf 9,1 GiB (Stufe 1 5,51 · Stufe 2 2,08 · Stufe 3 1,53 GiB); ein GitHub-Runner
garantiert für öffentliche Repos **14 GB SSD**, und darauf liegen auch Checkout und Daten-Repo.
Der Cache ist ohnehin flüchtig (V-PD-22) und wird innerhalb eines Laufs fast nur für den
Vorschritt der Entakkumulation und für die Sammelabrufe gebraucht. *Mehrwert:* jede weitere
Quelle macht den Cron sonst ein Stück näher am `ENOSPC` — und der kommt als Abbruch mitten im
Lauf, nicht als Warnung. *Skizze:* den Cache nach jeder Stufe leeren (bis auf Koordinaten- und
Konstantendateien), dann ist die Spitze die größte Stufe (5,5 GiB) statt der Summe; dazu das
Netzvolumen **je Quelle** ins Manifest — der Producer zählt es heute nur gesamt, deshalb ließ sich
der Zuwachs von 1,8 GiB in diesem Lauf nicht auf den MiB genau zuordnen.

**V-PD-37 · AIFS Single fällt in Stufe 2 aus, weil die Horizontsuche die erste Stunde prüft.**
Im Gesamtlauf: „Lauf 2026091100 liefert keine Stunde dieser Stufe (Versatz 6 h)". AIFS rechnet
6-stündlich; die erste eigene Stunde der Stufe (51 + 6 = 57) gibt es nicht, und `probeHorizon`
schließt daraus, dass die Quelle gar nichts hat. Umgekehrt meldet Stufe 1 für AIFS „49 Stunden",
obwohl es nur jede sechste gibt — die fehlenden enden als 404 (80 im Gesamtlauf). §34 hatte den
6-Stunden-Takt schon einmal beim Abdeckungsflag erwischt. *Mehrwert:* eine zweite Meinung für σ_div
in der Mittelfrist, wo heute in Stufe 2 nur ICON und IFS HRES tragen — und keine vergeblichen
Abrufe mehr. *Skizze:* die ECMWF-Adapter kennen ihr Schrittraster (AIFS 6 h; IFS 3 h bis 144,
danach 6 h) und `leadsFor` prüft nur Stunden darauf. Ändert die Daten in Stufe 2 und braucht deshalb
eine eigene Messung.

**V-PD-38 · `--run` aus der Cron-Vorlage kommt im Producer nie an.** `workflow-point.yml` reicht
bei manuellem Start `--run=<Lauf>` weiter, `main()` in `build-point-cube.mjs` liest das Argument
nicht. Ein Eingabefeld, das nichts tut — dieselbe Klasse wie V-SH-11, nur in der Bedienung.
*Mehrwert:* wer einen bestimmten Lauf nachbauen will (z. B. nach einem Ausfall), bekommt heute
still den neuesten. *Skizze:* entweder `--run` bis `chooseRun` durchreichen (als Obergrenze der
Suche) oder das Feld aus der Vorlage streichen; im Verifier prüfen, dass jedes Eingabefeld der
Vorlage einen Leser hat.

**V-PD-39 · Die Karten-App liest HDF5 ebenfalls über jsfive — also als JS-Array.** INCA
(`src/sources/incaParse.ts`), CombiPrecip (`rzcParse.ts`) und der MeteoSchweiz-Hagel
(`meteoSwissHail.ts`) lesen `.value` und bekommen damit dieselben gewöhnlichen Arrays, die im
Producer 72 statt 18 MiB je C-LAEF-Fenster gekostet haben. **Im Browser nicht gemessen** — deshalb
hier ohne Zahl. *Mehrwert:* weniger Speicher im Worker auf Mobilgeräten, wo der Tab bei Druck
zuerst entladen wird. *Skizze:* erst messen (Heap-Snapshot des `hdf5Worker` nach einem INCA-Abruf),
dann dieselbe Umwandlung wie `toTyped()` direkt nach dem Lesen; Float-Felder als `Float32Array`.
Eigene Phase der Kartenlinie, nicht diese.

**V-PD-40 · Ein Fehler bei einer einzelnen deterministischen Quelle bricht den ganzen Bau ab.**
In der Fusionsschleife steht `await c.adapter.field(...)` ohne Fehlerbehandlung
(`build-point-cube.mjs`, deterministische Schleife und Vorschritt der Entakkumulation). Scheitert
ein Abruf endgültig — ein 429 nach allen Wiederholungen, eine unlesbare Datei —, wirft der
Producer, und der Cron veröffentlicht **nichts**, auch nicht die Stufen und Quellen, die fehlerfrei
waren. Seit PD-B10 fängt nur der Ensemble-Teil Fehler ab. *Mehrwert:* ein Ausfall bei einer von 14
Quellen kostet dann eine Stimme im Mittel statt des ganzen Laufs, und die Quelle steht benannt im
Manifest — wie beim Überspringen in `chooseRun`. Möglicherweise ist das die Ursache der sieben
gescheiterten Cron-Läufe seit dem 2026-09-09 (Abbruch nach 23–28 min im Bau-Schritt) — **unbelegt**,
das Protokoll gibt GitHub nur mit Anmeldung heraus. *Skizze:* `field()` je (Quelle, Stunde, Größe) in
`try/catch`, Fehler je Quelle zählen, ab einer Schwelle die Quelle für die Stufe verwerfen und im
Manifest nennen; dieselbe Regel für Profil und Quantile. ⚠ Ab welcher Schwelle eine Stufe
lieber gar nicht als mit zu wenigen Quellen veröffentlicht wird, ist eine Produktentscheidung.

---

## §46 PD-C1/PD-C2 — der Cron veröffentlicht nichts, und warum (Betrieb vor allem anderen)

Plan PD-C (Jans Auftrag 2026-09-11: „alle Probleme beheben, sodass dem Algorithmus nichts mehr
entgegensteht") beginnt nicht bei einer Quelle, sondern beim Betrieb — weil die Messung des Tages
zeigte, dass **nichts von PD-B je im Daten-Repo angekommen ist**.

### 46.1 Diagnose: 0 von 7 Cron-Läufen veröffentlicht

Am CDN lag `point/index.json` mit **Schema 1** und dem Handlauf `2026090912` vom 2026-09-09. Der
GitHub-API-Verlauf des Daten-Repos (`actions/workflows/point.yml/runs`) zeigte sieben planmäßige
Läufe seit 2026-09-09 21:54 UTC, **alle sieben `failure`**, 22–29 min lang. Die Job-Logs (mit dem
Token aus `git credential fill` gelesen — das Protokoll gibt GitHub nur mit Anmeldung heraus, §45.14
hatte das noch als „unbelegt" geführt) nennen zwei verschiedene Ursachen:

| Läufe | Schritt | Ursache |
|---|---|---|
| 1–6 | Publish | `Sparse Checkout deckt .gitattributes nicht ab — git würde diese Dateien STILL verwerfen (Exit 0). Kur: git sparse-checkout add .gitattributes. Aktuelle Muster: point index.json` — der Publisher bricht **korrekt** ab (§29-Wächter), aber erst nach 23 min Bau |
| 7 | Build point cube | `https://data.ecmwf.int/…/aifs-single/…-276h-oper-fc.grib2: HTTP 429 (gedrosselt)` aus `fetchBytes` (5 Versuche, dann Wurf) durch `await c.adapter.field(...)` in der deterministischen Schleife — **V-PD-40**, jetzt belegt |

Beides war lokal unsichtbar: hier liegt immer der volle Baum (kein sparse), und 300 ms Takt gegen
ECMWF reichten am Nachmittag. Dieselbe Klasse wie §30 („geprüft wurde der Bauplan, nicht das
Bauwerk") — nur dass diesmal der Wächter im Publisher **funktioniert** hat und trotzdem niemand die
sieben roten Läufe sah, weil kein Verifier die sparse-Muster mit den Publisher-Pfaden verglich.

Nebenbefund: die Vorlage im Daten-Repo ist die **alte** Fassung (9 222 B, vor PD-B9, ohne
Stationsschritt) — PD-B9 und PD-B10 hätten den Cron also auch nach einer Kur nicht erreicht.

### 46.2 PD-C1 — Sparse-Vertrag, verifiziert statt gemerkt

- `scripts/repack-repo/workflow-point.yml`: sparse-Muster `point`, `index.json`, **`.gitattributes`**;
  neuer Schritt nach dem Checkout (`git sparse-checkout list`, `grep -qx '.gitattributes'`, sonst
  Exit 1 — ein Muster, das nichts trifft, meldet nichts, §30). `timeout-minutes` **330 → 75**.
- Neu `scripts/point/sparseCover.mjs`: `PUBLISH_PATHS`, `sparseCovers()`, `uncoveredPaths()`,
  `sparseBlocksOf()`, `timeoutMinutesOf()`, `dispatchInputsOf()`. Publisher UND Verifier importieren
  dieselbe Liste und dasselbe Prädikat (kein Spiegel — die `repackManifest.mjs`-Lehre).
- Verifier: der `sparse-checkout: |`-Block der Vorlage wird **gelesen** und gegen `PUBLISH_PATHS` +
  `STATIONS_DIR` + Index/Kalibrierung gehalten; Negativ-Kontrolle mit dem deployten Muster
  (`point`, `index.json`) fällt durch; `JOB_MAX_MIN + 10 ≤ timeout ≤ engster Slot-Abstand`
  (75 gegen 100 min, die alten 330 fallen durch); jedes `workflow_dispatch`-Eingabefeld braucht
  einen Leser `args.<name>` im Producer. Die **deployte** Datei wird, wenn `data/repo` lokal liegt,
  byte-verglichen — Abweichung ist Auskunft, kein Fehlschlag (Jans Gate PD-C3).

**Cron-Nachbau (Muster §30):** frischer sparse-Klon von `jppetry/buscosun-data` mit den drei
Mustern ⇒ `git sparse-checkout list` nennt alle drei, `.gitattributes` (83 B) liegt im Baum;
Publisher gegen den Ausgabebaum des Fehlerinjektions-Laufs (46.3) ohne `POINT_PUSH` ⇒ Aufbewahrung,
Manifest-Abgleich („12 Chunks, alle im Manifest"), Datencommit `dae2444` lokal, **Exit 0**, Push
korrekt verweigert. ⚠ Nebenbei gesehen: in no-cone-Modus trifft das Muster `index.json` **jede**
Datei dieses Namens, also auch `runs/<lauf>/index.json` — der Klon trägt deshalb ein kleines `runs/`
(V-PD-42, harmlos, aber unerwartet).

### 46.3 PD-C2 — ein Quellfehler kostet eine Stimme, nicht den Lauf

- `build-point-cube.mjs`: `safeCall(c, what, fn)` um **alle sechs** deterministischen Adapteraufrufe
  (`leadsFor`, `field`, Vorschritt der Entakkumulation, `quantiles`, `profile`, `orography`); die
  Laufsuche (`chooseRun`) ist gesondert gefangen (ein 429 in `discoverRun` ⇒ Quelle benannt
  übersprungen). Fehler je (Stufe, Quelle) gezählt, erster Fehlertext bleibt stehen; ab
  `POINT_SRC_MAX_ERRORS` (Standard 5) fällt die Quelle für die Stufe heraus (`dropped`). Abbruch
  **nur**, wenn keine Quelle der Stufe mehr trägt. Manifest: `sources[].errors/firstError/dropped`,
  `tiers[].dropped`.
- `shared.mjs`: **Drosselung ist kein Fehlversuch** — 429/503 zählen gegen eine Wartezeit
  (`THROTTLE_MAX_WAIT_MS` 10 min), nicht gegen die fünf Versuche (`fetchBytes`, `fetchRanges`,
  `headOk`; ein gedrosselter HEAD fällt nicht mehr still auf „gibt es nicht"). ECMWF-Takt
  **300 → 600 ms**. Netz **je Quelle** (`net.bySource` über `AsyncLocalStorage`; `adapterFor()`
  wickelt jede Adaptermethode in `withSource()` — keine der 14 Aufrufstellen ändert sich); `netDiff()`
  je Stufe ⇒ Log-Zeile „Netz je Quelle" und `tiers[].net` im Manifest. **Fehlerinjektion**
  `POINT_FAULT_INJECT=<id>[:<n>]` an allen drei Netzwegen, VOR dem Cache. Plattencache je Stufe
  leeren (`clearCache()`, nur mit `POINT_CACHE_CLEAR=tier`, das die Vorlage setzt; Konstanten
  clat/clon/hhl/hsurf/`mch:…const` bleiben) — V-PD-36.
- `--run=YYYYMMDDHH` wird gelesen (V-PD-38): Obergrenze der Laufsuche (`nowMs = Lauf + 1 h`),
  `man.note` benennt es.

**Laufzeitbeweis statt Regex** (die Lehre aus §45.7): t3, 126–150 h, nur `aifs_single` + `ifs_hres`,
`POINT_FAULT_INJECT=aifs_single:12` ⇒ AIFS Single wirft ab dem 13. Abruf, **6 Fehler geloggt**,
„fällt für diese Stufe heraus", IFS HRES trägt weiter, **12 Chunks, EXIT 0**; Manifest:
`aifs_single errors 6, dropped {reason, errors, firstError}`, `ifs_hres errors 0`,
`tiers[0].net = { ifs_hres: 44 aus dem Cache · aifs_single: 3 Dateien, 5,1 MiB }`. Der Verifier
prüft dieses Manifest, wenn `POINT_FAULT_MANIFEST` gesetzt ist, sonst sagt er, dass er es überspringt.

### 46.4 Gate GPD-C1/C2

`verify:point-data` **615/615** (nach PD-B10: 586; +20 für C1/C2 inkl. Negativ-Kontrollen),
`typecheck` 0 Fehler, Cron-Nachbau Exit 0, Fehlerinjektion Exit 0.

**PD-C3, Jans Gate (2026-09-11):** C1+C2 als `0cf7dca` in `buscosun-web` gepusht; die Vorlage liegt seit
`4db2a2c` (Push 14:27 UTC) byte-gleich (11 964 B) als `.github/workflows/point.yml` im Daten-Repo,
Workflow `active`. Der Auto-Modus hatte Klon, Commit und Push einer Workflow-Datei dreimal blockiert
(Persistenz/Deploy/Selbstmodifikation); Jan hat die Regeln in `.claude/settings.local.json` selbst
gesetzt. Erster planmäßiger Lauf mit dem neuen Stand: **15:50 UTC**; Gate GPD-C3 = zwei grüne Läufe
am API-Verlauf und Schema 4 am CDN — noch offen.

### 46.5 Verbesserungen (D-28)

**V-PD-40 · erledigt (46.3).** Ursache der Cron-Ausfälle war zweigeteilt (46.1); die Schwelle
(5 Fehler je Stufe) und die Frage, ob eine Stufe mit nur EINER verbleibenden Quelle publizieren darf,
sind als Standard „veröffentlichen, `srcCount` sagt die Wahrheit" gesetzt — **Produktentscheidung
für Jan**, als Umgebungsvariable änderbar.

**V-PD-41 · Der Client-Nowcast tastet Radar-PNGs ohne Domänenmaske ab.**
`src/pointForecast/radarNowcast.ts` liefert für Punkte außerhalb der RV-Abdeckung 0,0 mm/h statt
„kein Wert" (der Byte-0-Fall aus §36.2, Linz/Wien). *Mehrwert:* keine erfundene Trockenheit in
Ostösterreich. *Skizze:* `coversPoint()` aus `sourceMatrix.ts` VOR dem Byte, wie im Node-Leser.
⚠ Ändert Live-Ausgabe (null statt 0) ⇒ STOPP & FRAGEN, eigene Mikro-Etappe (Plan PD-C4).

**V-PD-42 · Das sparse-Muster `index.json` trifft in no-cone-Modus jede gleichnamige Datei.**
Der Cron-Klon trägt deshalb `runs/<lauf>/index.json` mit. *Mehrwert:* ein paar KiB und Klarheit,
was der Job wirklich auscheckt. *Skizze:* `/index.json` mit führendem Schrägstrich (Wurzel);
`sparseCovers()` akzeptiert die Form bereits. Vorher messen, ob `actions/checkout` den Schrägstrich
durchreicht.

---

## §47 PD-C4 — Manifest-Wahrheit, Aufbewahrung, Nowcast-Ehrlichkeit

**Befund:** `PointRunManifest` in `src/point/manifest.ts` beschrieb ein Manifest, das kein Producer je
geschrieben hat — es deklarierte `missing` (nie geschrieben) und kannte weder `quantiles`, `ensemble`,
`profile`, `ageH`, `fusion`, `skipped`, `pending` noch die PD-C2-Felder `net`/`errors`/`dropped`.
Dieselbe Klasse wie V-SH-11 (ein Leser ohne Schreiber), nur als Typ: ein Client, der sich darauf
verlassen hätte, wäre am echten `run.json` gescheitert.

### 47.1 Der Vertrag

- Typ aus dem **tatsächlichen** Output von `runManifest()` abgeschrieben (`PointSourceManifest`,
  `PointNetStat`, `PointTierManifest`, `PointRunManifest`); `missing` gestrichen.
- Neu `validateRunManifest(json): string[]` — ohne Abhängigkeit, damit Verifier UND Browser sie
  ausführen. Prüft Schema (nur das aktuelle; ältere fallen an der **ersten** Zeile), Läufe, Stufen samt
  `run/runAt/ageH`, Chunk-Pfade unter dem Publikationslauf (§26), Ebenen, Quellen (`role`, `coverage`,
  `offsetH`, `errors`, `dropped` nur mit Fehlern), `fusion` (gleiche Gewichte müssen `fallback` heißen;
  `sdEnsEmpty` als Liste), `skipped`/`pending` als Objekte.
- **Belegt:** das synthetische Producer-Manifest besteht (0 Verstöße); das **echte** PD-C2-Manifest
  aus dem Fehlerinjektionslauf (46.3) besteht; vier Negativ-Kontrollen fallen an der benannten
  Stelle durch (fehlender Quell-Lauf, Chunk unter fremdem Lauf, Schema 1, „measured" bei gleichen
  Gewichten). Das lokale `data/point/2026090912` ist Schema 1 und wird **benannt** übersprungen.

### 47.2 Aufbewahrung

`TIMELESS_PATHS` führt jetzt `point/static/` (Präfix) — PD-C11 braucht dafür keine Formatentscheidung
mehr. Verifier: `index.json.timeless` ist **exakt** die Liste, kein zeitloser Pfad liegt in einem
Laufverzeichnis, ein Lauf-Chunk ist nicht zeitlos (Negativ-Kontrolle).

### 47.3 Nowcast-Ehrlichkeit

`nowcastManifest()` nennt je Quelle `extrapolationH` **aus der Registry** (`horizonH.default`: RV 2,
INCA 3, **CombiPrecip 0** — eine Analyse, kein Nowcast), `extrapolation: false` für die Schweiz,
`ambiguousZero: true` für alle PNG-Quellen, `coverageFrom: point/sources.json#<id>` statt einer
zweiten Domänenfassung, dazu `fallback` (jenseits der Reichweite tragen die Cube-Stunden 0–3, der
Client nennt die Quelle) und `horizonH: 3`. Selbsttest +6.

### 47.4 Drei Wahrheitskorrekturen — und ein Fund, der schwerer war

- `calib.json` führt jetzt `fixed.z0Table` (Davenport, `literature`, elf Klassen, Wasser 0,0002 m) —
  `terrainPoint.ts` behauptete den Eintrag seit PD-A.
- `MOSMIX_NOT_MAPPED.ensCount` benannt (MISSING statt 0); `srcCount` ausdrücklich **nicht** — es steht
  auf 1, eine Quelle ist eine Aussage.
- ⚠ **V-PD-43, gefunden beim Vereinheitlichen des Guard-Idioms:** `build-stations.mjs` startete
  `main()` nur, wenn `import.meta.url === 'file:///' + argv[1]`. Auf Windows (`C:/…`) stimmt das; auf
  einem **Linux-Runner** ist `argv[1]` absolut (`/home/…`), der Vergleich lautet `file:////home/…`
  gegen `file:///home/…` — **und `main()` wäre nie gestartet, mit Exit 0.** Der Stationsschritt in der
  neuen Vorlage hätte also still nichts gebaut, und `continue-on-error` hätte es zusätzlich verdeckt.
  Der Cron hat den Schritt bisher nie ausgeführt (die deployte Vorlage war die alte ohne ihn), deshalb
  gab es kein Protokoll, das es zeigte. Jetzt dasselbe Idiom wie im Producer (`argv[1].endsWith`);
  der Verifier prüft es und verbietet die alte Form.

### 47.5 Gate GPD-C4

`verify:point-data` **642/642** (nach C2: 615), `typecheck` 0 Fehler. Keine Netzänderung.
**V-PD-41** (Domänenmaske im Client-Nowcast) bleibt benannt und offen — STOPP & FRAGEN, weil es
Live-Ausgabe ändert (null statt 0,0 mm/h außerhalb der Abdeckung).

---

## §48 PD-C5 — ECMWF-Schrittraster (V-PD-37)

**Befund (§45.12, jetzt behoben):** die ECMWF-Adapter kannten ihr Schrittraster nicht. IFS rechnet
3-stündlich bis 144 h und danach 6-stündlich, AIFS durchgehend 6-stündlich; `leadsFor` probte aber die
ERSTE Stufenstunde und schloss aus einem 404, die Quelle habe nichts. In Stufe 2 beginnt die Achse bei
51 h — kein Vielfaches von 6 — also fiel **AIFS Single dort komplett aus** („kein Lauf gefunden, der
51 h trägt", Cron-Läufe 1–7). In Stufe 1 meldete die Halbierung 49 Stunden, von denen der Producer 80
vergeblich abrief.

### 48.1 Änderung

`scripts/point/adapters/ecmwf.mjs`: `ECMWF_STEPS` (eine Regel je Modellfamilie), `ecmwfOwnLeads(id,
leadHours)` filtert die Stufenstunden **vor** `probeHorizon` (die Halbierung setzt Zusammenhang voraus,
und der gilt nur auf den Stunden, die das Modell rechnet), `ecmwfSnapDown()` lässt `discoverRun` auf
eine Rasterstunde proben (51 → 48). Das Raster gilt im **Laufraum der Quelle** — `leadsFor` bekommt
die um `offsetH` verschobenen Stunden. `ecmwfEns.mjs` importiert dieselbe Regel (kein Spiegel).
Muster: `ownSteps` aus `dwdEps.mjs`.

### 48.2 Messung — und ein zweiter Fund

Stufe 2, `--only=aifs_single,ifs_hres,icon_eu`, Lauf 2026091106 (alle drei ohne Versatz):

| Quelle | Schritte | Netz | Anfragen | 404 | Sonden |
|---|---|---|---|---|---|
| icon_eu | 24/24 | 277,4 MiB | 290 | 0 | 5 |
| ifs_hres | 24/24 | 147,1 MiB | 50 | 0 | 4 |
| **aifs_single** | **12/24** (54…120 h, `partial`) | **60,8 MiB** | 23 | **12** | 4 |

AIFS Single trägt in Stufe 2 erstmals — **12 statt 0 Schritte**, für ≈ 61 MiB (der Plan hatte ≈ 40
geschätzt; gemessen sind es 61, das Budget-Buch ist nachzuziehen). Kein 429 bei 600 ms Takt. Stufe 1
(nur AIFS, 0–12 h): 3 Schritte (0/6/12), **keine** erfundenen 49 Stunden mehr.

⚠ **Die 12 (und in t1 2) verbliebenen 404 waren ein zweiter Fehler:** die Entakkumulation des
Niederschlags holt je Schritt den Vorschritt `leadH − Δ` — mit Δ = 3 h bei einer 6-stündlichen Quelle
eine Stunde, die es nie gibt. Der Producer prüft jetzt, ob die Quelle den Vorschritt laut `leadsFor`
trägt, bevor er ihn abruft (vor der ersten Stufenstunde weiter ohne Prüfung, dort sagt `leads` nichts).
Danach am selben Cache: **0 nicht vorhanden** in beiden Stufen, und **56 von 56 t2-Chunks byte-gleich**
zum Lauf davor — der Wächter ändert keine Daten, nur die Zahl der Anfragen. Ehrlich dazu: AIFS liefert
in Stufe 2 damit weiterhin **keinen Niederschlag** (die Rate über 3 h ist aus 6-h-Summen nicht bildbar),
wohl aber t2m, td2m, u10, v10, clct, ps — sechs von acht Größen als zweite Meinung für σ_div.

**Nicht gemessen:** der σ_div-Median vorher/nachher am selben Cache — dafür müsste der alte Code laufen
(kein `git stash`, Lehre Z3). Der Vergleich gegen den Cron steht stattdessen im Protokoll der Läufe 1–7
(AIFS in t2 übersprungen).

### 48.3 Gate GPD-C5

`verify:point-data` **655/655** (nach C4: 642; +13 als Funktionsaufrufe: Raster, 12 Schritte in t2,
9 in t1, Snap 51→48, Versatz, Vorschritt-Wächter), `typecheck` 0 Fehler, Chunks byte-gleich.
**Kosten:** +≈ 61 MiB und ≈ 14 s Netzzeit je Lauf für AIFS in Stufe 2; −80 −12 vergebliche Anfragen.

**V-PD-37 · erledigt (§48).** **V-PD-44 · Der Vorschritt der Entakkumulation folgt dem Stufenschritt,
nicht dem Quellenraster.** Für 6-stündliche Quellen in einer 3-stündlichen Stufe (AIFS in t2, ICON-EU-EPS
ab 78 h, V-PD-35) ist die Rate nicht bildbar und bleibt MISSING. *Mehrwert:* Niederschlag als zweite
Meinung in der Mittelfrist. *Skizze:* Rate über Δ = Quellenschritt bilden und auf die Stufenstunden
verteilen (gleiche Rate für beide 3-h-Schritte) — eine Annahme über die zeitliche Verteilung, die im
Manifest stehen müsste (`precipRateSpanH`). Entscheidung Jan, nicht hier.

---

## §49 PD-F1 — Wo die Zeit bleibt (Jans Prioritäten: Frische, Verarbeitungszeit, Vollständigkeit)

Jan hat am 2026-09-11 nachmittags drei Ziele gleichrangig benannt: kurze Veröffentlichungszeit,
immer die neuesten Werte, alle Quellen der Matrix im Repo. Die Vormittagsvorgabe „ein Job, ≤ 60 min /
≤ 10 GiB" ist damit eine Folgegröße, keine Randbedingung mehr (Plan, Block F).

### 49.1 Die Verzögerung hat drei Anteile

| Anteil | Dauer | Änderbar? |
|---|---|---|
| Quelle vollständig veröffentlicht | ICON-D2 +1,4 h · ICON-EU +3,6 h · IFS +6,5…7,6 h (§31) | nein |
| Wartezeit bis zum Slot | 0–6 h (vier Slots) | **ja — der größte Anteil** (F3) |
| Bau + Publish + Purge | ≈ 42 min gesamt | ja (F2) |

Der Nowcast (0–3 h) ist unberührt: Radar-Spiegel alle 1–2 min, Lesen zur Abfragezeit (§36.4).

### 49.2 Messung: Producer misst jetzt Wandzeit je Phase und Quelle

`safeCall` und der Ensemble-Aufruf zählen Wandzeit je Quelle (`msWall`, `calls`); sieben Phasenmarken
(`discover`, `fields`, `ensemble`, `quantiles`, `profile`, `orography`, `encode`); Log-Zeilen „Zeit je
Phase" / „Zeit je Quelle" und `tiers[].timing` im Manifest (Vertrag akzeptiert es, Verifier 661/661).

**Warm (t2, drei Quellen, alles aus dem Cache):** 76 s gesamt, davon **69 s `fields`** — reines
Dekodieren und Abtasten ohne ein Byte aus dem Netz (icon_eu 36 s/291 Aufrufe, ifs 25 s/195, aifs 11 s/98).

**Kalt (t1, frischer Cache, 2026-09-11 15:34–15:55 UTC, Lauf 2026091112):**

| | Zeit | Anteil |
|---|---|---|
| gesamt | **1 292 s = 21,5 min** | |
| `fields` (deterministische Felder) | 598 s | 46 % |
| `ensemble` (ICON-D2-EPS, 9 Rasterstunden, 20 Member) | 226 s | 17 % |
| `profile` (ICON-D2, 20 Level, 49 Stunden) | 211 s | 16 % |
| `quantiles` (C-LAEF-EPS, 7 Größen) | 176 s | 14 % |
| `discover` (Laufsuche + Abdeckung, 8 Quellen) | 57 s | 4 % |
| `encode` (208 Chunks, 75,7 MiB) | 23 s | 2 % |

| Quelle | Wandzeit | davon Netz | ⇒ Dekodieren/Abtasten | Netz | Aufrufe |
|---|---|---|---|---|---|
| icon_d2 | 380 s | 207 s | 173 s | 1 574,7 MiB | 639 |
| icon_d2_eps | 227 s | 65 s | **162 s** | 794,6 MiB | 47 |
| icon_eu | 198 s | 85 s | 113 s | 545,2 MiB | 590 |
| claef_eps | 176 s | 109 s | 67 s | 339,4 MiB | 345 |
| claef | 108 s | 69 s | 39 s | 217,2 MiB | 394 |
| icon_ch1_eps | 104 s | 55 s | 49 s | 346,8 MiB | 146 |
| ifs_hres | 46 s | 25 s | 21 s | 105,8 MiB | 139 |
| aifs_single | 20 s | 11 s | 9 s | 45,4 MiB | 75 |
| **Summe** | **1 259 s** | **626 s** | **633 s** | 3,97 GiB | |

Speicher: Heap max 103 MiB, RSS 1,7 GB; Plattencache der Stufe **5,48 GiB**.

### 49.3 Was die Zahlen sagen

1. **Die Quellen laufen nacheinander:** die Summe der Quellen-Wandzeiten (1 259 s) ist die Stufenzeit.
   Netz (626 s) und Rechnen (633 s) sind fast gleich groß — sie überlappen sich heute **gar nicht**.
   Quellen parallel mit Host-Deckel ⇒ Untergrenze ≈ max(Netz, Rechnen) ≈ 630 s statt 1 259, also bis
   zu **−50 %** — eine Rechnung, keine Messung; F2 muss sie belegen.
2. **ICON-D2-EPS dekodiert 162 s für 47 Dateien** — das ist V-PD-31 in Zahlen: 80 Nachrichten je
   `tot_prec`-Datei entpackt, 20 gebraucht. Erwartete Ersparnis ≈ 60–100 s (nur die Niederschlagsdateien).
3. **ICON-D2 allein: 1 590 Anfragen, 1,57 GiB, 380 s** — die Kurzfrist-Frische (F3, 8 Slots) hängt an
   dieser Quelle; ein reiner Stufe-1-Job kostet heute 21,5 min und 4 GiB Netz. Mit F2 realistisch
   ≈ 11–13 min.
4. Nebenbefund: je **1 × 404** bei IFS HRES und AIFS Single — der Vorschritt der ersten Stufenstunde
   (`leadH − 1` im Laufraum der Quelle) liegt VOR der Stufe und wird deshalb ohne Rasterprüfung geholt
   (§48.2 prüft nur innerhalb der Stufe). Zwei Anfragen je Lauf; Kur wäre `adapter.steps` auch dort
   (V-PD-45, klein).

### 49.4 Folgerung für den Plan

- **F2 vor F3:** erst den Bau halbieren (parallel + V-PD-31 + `deflate9` einmal statt zweimal), dann
  acht Slots für Stufe 1 — sonst kosten acht Slots 8 × 21,5 min Runner-Zeit für 8 × 4 GiB.
- **F3 (ein Job je Stufe):** t1 8×/Tag ≈ 32 GiB, t2 4×/Tag (heute ≈ 2,1 GiB), t3 2×/Tag ≈ 1,5 GiB ⇒
  ≈ **43 GiB/Tag** (ohne Block-3-Zuwächse); Aufbewahrung je Stufe (t1 12 h), `latestByTier` im Index
  (Client-Vertrag PD-C12). Cron = Jans Gate.
- Verifier +6 (3s). `typecheck` unverändert (nur `.mjs`).

### 49.5 ⚠ Lauf 8 auf dem Runner: der Bau braucht dort ≈ 80 min, nicht 42

Der manuell angestoßene Lauf 8 (15:18 UTC, Stand `0cf7dca` = PD-B10 + C1/C2) kam durch alle Vorstufen
und wurde nach **exakt 75 min** vom neuen `timeout-minutes` abgebrochen — in Stufe 3, vor dem Publish.
Zeitstempel aus dem Job-Log:

| Stufe | Runner | lokal (§49.2 / §45.12) |
|---|---|---|
| t1 | **41,4 min** (15:18:42 → 16:00:08) | 21,5 min |
| t2 | **25,6 min** | (t2 mit 3 Quellen warm: 1,3 min) |
| t3 | abgebrochen nach 8 min | — |

Der Runner ist bei diesem CPU-gebundenen Bau **≈ 2× langsamer** als Jans Maschine — und die 42,3 min
aus §45.12 waren **lokal** gemessen, nie auf dem Runner: Läufe 1–6 (22–26 min) liefen noch mit dem
alten Producer aus sechs Quellen. **Die volle Matrix ist auf dem Runner noch nie durchgelaufen.**
Hochgerechnet ≈ 80 min je Lauf; der Slot-Abstand zur Kartenlinie beträgt 100 min.

Was funktioniert hat: Sparse-Nachprüfung grün, Gate grün, `Netz je Quelle` je Stufe im Log (t1
byte-gleich zu §49.2: derselbe Lauf 2026091112), **Plattencache je Stufe geleert** (5 404 MiB nach t1,
2 191 MiB nach t2 — V-PD-36 wirkt), kein 429, keine herausgefallene Quelle.

**Folgerung:** PD-F2 ist kein Komfort, sondern Voraussetzung für den Cron. Übergangsentscheidung
(Jans Gate, Cron-Vorlage): `timeout-minutes` 75 → 95 und `JOB_MAX_MIN` 55 → 80 (Verifier: 80 + 20 =
100 = Slot-Abstand, gerade noch). Lauf 9 (planmäßig 15:50, wegen der Concurrency erst 16:34 gestartet)
läuft mit demselben Stand und wird voraussichtlich ebenso am Timeout enden.

### 49.6 ✅ Lauf 9 — der erste erfolgreiche Punkt-Lauf; Gate GPD-C3 halb

Der planmäßige 15:50-Lauf (wegen der Concurrency-Gruppe erst 16:34 UTC gestartet, noch unter der
75-min-Definition) **kam durch**: t1 27,8 min · t2 15,6 min · t3 11,4 min = **55 min Bau**, 7,7 GiB Netz,
Stationsprodukt 51 s (3 071 Stationen), Datencommit lokal `7d4ccc6` → am Remote **`44bd87b`** (Rebase
durch den Radar-Spiegel; die Zwei-Commit-Regel aus §29 hat genau dafür gegriffen: der Index nennt den
Remote-SHA), Purge 200. Am CDN geprüft (18:05 UTC): `point/index.json` Schema 4, Läufe
`2026091115` (t1 aus ICON-D2 15z; t2/t3 aus 2026091112, `ageH` 3) und der alte `2026090912` (bleibt
wegen `MIN_RUNS`); `validateRunManifest` **0 Verstöße** an `@44bd87b` und `@main`; 21 Quelleneinträge,
14 Quellen, 51 Ebenen; Chunk `t1/05_07.bin` `@commit` und `@main` byte-gleich (511 637 B), CRC hält;
`sdEnsEmpty` = td2m, clct, ps, snowlmt (V-PD-34, wie erwartet). Runner-Varianz: Lauf 8 brauchte für t1
41,4 min, Lauf 9 27,8 — dieselbe Vorlage, derselbe Stand.

⚠ Nebenbefund: der **erste** Abruf des frisch gepinnten `@44bd87b/…/05_07.bin` antwortete am CDN mit
**HTTP 403 (149 B)**, der zweite Abruf Sekunden später mit 200 — ein Kaltstart-Verhalten von jsDelivr, kein
Datenfehler (V-PD-46: `check-cdn.mjs` sollte einen 403/404 beim ersten Abruf einmal wiederholen, bevor
er „nicht ausgeliefert" meldet; außerdem ist es auf den Lauf 2026090912 und einen lokalen Klon fest
verdrahtet und braucht `<commit>` als Argument — heute unbenutzbar für den aktuellen Lauf).

Gate GPD-C3 verlangt zwei aufeinanderfolgende grüne Läufe: Lauf 10 (manuell 17:40 UTC, jetzt unter der
95-min-Definition) läuft.

---

## §50 Block F — Bau kürzen, ohne ein Byte zu ändern (PD-F2a…F2f)

Jans Plan-Freigabe (2026-09-11 18:35 UTC): Netz und Rechnen überlappen **und** Worker-Threads; danach
F3 (ein Job je Stufe). Invarianten (Plan F-0): Fusionsmathematik, Format, Quellenmenge, Adapter-Semantik
unverändert; jeder neue Pfad mit Kill-Switch; Beweis je Etappe = `compareTrees` (0 von 276 Chunks
verschieden am selben Cache mit demselben `--run`).

### 50.0 Referenzmessung (F-M)

Fester Lauf `--run=2026091115`, frischer Cache, kein `POINT_CACHE_CLEAR`, Producer-Stand vor F2a
(Stufe 1: der Code von `c686a3b`; Stufe 2/3 und der warme Lauf liefen als eigene Prozesse und luden
`shared.mjs` teils schon mit F2a-Änderungen — semantisch neutral, nur die Zeiten sind deshalb nicht
laborrein). Gemessen 18:42–19:35 UTC, lokal:

| Stufe | kalt gesamt | discover | fields | ensemble | quantiles | profile | encode | Netz |
|---|---|---|---|---|---|---|---|---|
| t1 | **1 219 s** | 48 | 557 | 227 | 168 | 198 | 23 | 3 833 MiB, 2 383 Dateien, 139 × 404 |
| t2 | **801 s** | 60 | **670** | 68 | 0 | 0 | 2 | 2 136 MiB, 1 069 Dateien |
| t3 | **764 s** | 15 | 404 | **345** | 0 | 0 | 0 | 1 680 MiB, 335 Dateien |
| t1 **warm** | **393 s** | 47 | 135 | 104 | 67 | 17 | 23 | 27,5 MiB (139 × 404 neu geholt) |

Lesart: der warme t1-Lauf ist die **reine Rechenzeit** — 393 s, davon 47 s Laufsuche (HEAD-Sonden
sind nicht gecacht) und 23 s Kodierung. Die Differenz kalt − warm ≈ 826 s ist Netz **plus** das, was
das Netz sequenziell blockiert. In t2 kostet `fields` 670 s (ICON global/AICON ikosaedrisch, 2,95 M
Zellen je Feld dekodiert für 12 221 Zielzellen); in t3 die Ensemble-Bahn 345 s (IFS-ENS, 50 Member ×
2 Größen × 4 Rasterstunden, jedes Member ein globales 0,25°-Feld). Plattencache nach allen Stufen
9,23 GiB. Die Referenzbäume liegen unter `point-ref/` (kalt) und `point-ref-warm/` (t1 warm).

### 50.a PD-F2a — Grundbausteine, Parallelität noch aus

- **`adapters/pacer.mjs`** (neu): `makePacer(minMs, maxInflight)` = FIFO je Host, Zeitstempel bei
  **Vergabe** gesetzt, Semaphor für gleichzeitige Anfragen; `makeHostPacers(minByHost, maxByHost)`.
  Selbsttest 11/11, darunter die **Negativ-Kontrolle**: das alte `pace()`-Muster (Lesen vor dem `await`)
  lässt fünf gleichzeitige Aufrufer mit **0 ms** Abstand durch — genau der Burst, der Lauf 7 mit 429 beendete.
- **`adapters/sample.mjs`** (neu): die reinen Abtast-/Nachbarindex-/Einheitenfunktionen aus `shared.mjs`
  herausgezogen (294 Zeilen, unverändert), `shared.mjs` re-exportiert dieselben Funktionsobjekte (vom
  Verifier per Identität geprüft) — der Worker (F2d) darf `shared.mjs` nicht laden.
- **Promise-Caches** statt Wert-nach-`await` in `dwdIcosahedral` (Nachbarindex, Zellkoordinaten),
  `dwdRegular` (21 HHL-Felder), `geosphere` (Fenster-LRU hält jetzt Promises, kein `winPut` nach dem
  `await`), `meteoswiss` (Katalog-Enumeration). Abgelehnte Promises fallen aus dem Cache.
- **`scripts/point/compareTrees.mjs`** (neu): Chunk-Bäume byteweise, Manifest-**Whitelist**
  (Läufe, Stufen, Dateigrößen, `steps/coverage/offsetH/errors`, `ensemble.byHour`, Quantil-/Profilzähler,
  `sdEnsEmpty`, `skipped`); `errors > 0` oder `throttled > 0` im neuen Bau ⇒ Vergleich ungültig.
  ⚠ Beim ersten Einsatz zeigte sich, dass die Anfragezahl NICHT in die Whitelist gehört: pc-c5 gegen
  pc-c5b waren 56/56 Chunks gleich, aber 233 ≠ 208 Anfragen bei IFS — der PD-C5-Vorschrittwächter hatte
  404-Abrufe gespart. Genau das sollen F2a–F2e tun; verglichen wird Datenzustand, nicht Netzverkehr.
- Verifier (3t): Pacer-Selbsttest, Re-Export-Identität, Worker-Tauglichkeit von `sample.mjs` (nur
  Code-Zeilen, der Kopf nennt `shared.mjs` beim Namen), Promise-Cache-Muster in vier Adaptern,
  `compareTrees` an synthetischen Bäumen (gleich · ein Byte anders · Whitelist-Feld anders · fehlender
  Baum) und — wenn `POINT_REF`/`POINT_NEW` gesetzt — am echten Paar. **680/680.**
- Noch offen in F2a (nach Ende der Referenz-t1, damit die Messung nicht der Code von morgen ist):
  `pace()` in `shared.mjs` auf `makeHostPacers` umstellen, In-flight-Memo in `fetchBytes`/`fetchRanges`/
  `headOk`, `fetchJson()` für die STAC-Listen.

### 49.7 ✅ Gate GPD-C3 grün: zwei aufeinanderfolgende Läufe, Schema 4 am CDN

Lauf 10 (manuell 17:40 UTC, erste Ausführung unter der 95-min-Definition) ist ebenfalls durch:
t1 **32,9 min** · t2 22,2 · t3 16,8 = **72 min Bau**, Stationen 53 s, Datencommit `8757b8d`, Purge 200,
Index-Commit `cce5a6e`, 656/656 Gate-Prüfungen im Job. Gesamtdauer 74 min — **21 min unter dem
Timeout, 26 min vor dem nächsten Kartenlinien-Push**. Der Publikationslauf blieb `2026091115` (ICON-D2 18z
war um 17:40 noch nicht veröffentlicht), das Verzeichnis wurde ersetzt, Index und Stationsprodukt neu.

Runner-Laufzeiten derselben Vorlage, derselbe Producer-Stand, drei Läufe: t1 **27,8 · 32,9 · 41,4 min**
(Läufe 9, 10, 8). Die Varianz von ±25 % ist die eigentliche Botschaft für Block F: eine Slot-Regel, die
auf dem Mittelwert steht, reißt an einem langsamen Abend. `JOB_MAX_MIN` wird deshalb nach F2 aus dem
**Maximum** der Runner-Läufe + 30 % gesetzt, nicht aus dem Mittel.

**Gate GPD-C3 (Plan): zwei aufeinanderfolgende grüne Läufe (9, 10), `point/index.json` Schema 4 am CDN,
`@commit` und `@main` byte-gleich (49.6) — erfüllt.** Erster planmäßiger Lauf mit C4/C5/F1 an Bord:
21:50 UTC (Stand `c686a3b`).

**Byte-Beweis F2a (19:35–19:49 UTC):** Referenz = der committete Producer (`git archive c686a3b` nach
`data/ref-producer/`, gitignored), neu = Arbeitsbaum mit F2a; beide **warm am selben Cache mit
`--run=2026091115`**, Stufe 1: **208 von 208 Chunks byte-gleich, 74,36 MiB, Manifest-Whitelist gleich.**
Zeiten: Referenz 375 s, neu 439 s — die Differenz ist **nicht** der Code, sondern ECMWF: der neue Lauf
kassierte **32 × 429** (AIFS 26, IFS 6) auf HEAD-Sonden, `discover` 10 → 101 s; die Referenz direkt davor
hatte 34 echte IFS-GETs ohne einen 429. Wahrscheinlich ein rollendes Kontingent je IP (beide Läufe
sequenziell, gleiche 600-ms-Takte, der Pacer vergibt nachweislich nicht dichter — Selbsttest).
`compareTrees` meldet den Lauf deshalb regelkonform als „ungültig" (`throttled > 0`); der Chunk-Beweis
selbst ist eindeutig. Wiederholung des neuen Baus läuft (19:50 UTC), um den 429-Befund von der
Codeänderung zu trennen. Nebenbei sichtbar: `fetchJson` zählt die STAC-Seiten jetzt als Netzverkehr
(icon_ch1_eps 161 Dateien, 28,6 MiB) — vorher stand diese Enumeration in keiner Statistik.

### 50.b PD-F2b — eine Bahn je Quelle, Verbraucher in Stundenordnung, Laufsuche parallel

- **`scripts/point/lanes.mjs`** (neu): `runLanes({ nLanes, nSteps, task, consume, ahead })` — je Bahn
  eine strikt sequenzielle Folge `it = 0…n−1` (die `accPrev`-Rekurrenz je Quelle bleibt, weil nur die
  eigene Bahn ihren Schlüssel berührt), Bahnen gleichzeitig, Verbraucher in Stundenordnung mit den Werten
  **in Bahnen-Ordnung**; Rückstau `ahead` (Standard 3 h, `POINT_AHEAD_HOURS`). Dazu `orderedSettle`
  (Promise.allSettled in **Eingabe**-Ordnung) und `sequentialSettle` (der Rückfall). Selbsttest 10/10,
  darunter: 4 Bahnen mit zufälligen Latenzen liefern dem Verbraucher exakt die Werte der sequenziellen
  Schleife in derselben Ordnung (mit einem absichtlich ordnungsabhängigen Prüfwert), Rekurrenz je Bahn
  strikt, Rückstau eingehalten, Fehler einer Bahn landet als `{ error }` an seiner Stelle.
- **Producer:** die Fusionsschleife ist in zwei Funktionen zerlegt — `sourceHour(c, it)` (alle Zielgrößen
  EINER Quelle für eine Stunde: Abruf, Maske, Entakkumulation — der bisherige Schleifenkörper, textgleich)
  und `consumeHour(it, perSource)` (je Größe der **unveränderte** synchrone Block: Bitmaske, Mittel/σ,
  `srcMask`; `grids` in `ci`-Ordnung ⇒ FP-Summen wie zuvor). `POINT_PARALLEL=0` fährt dieselben zwei
  Funktionen sequenziell — Rückfall UND Referenz.
- **Laufsuche parallel:** `discoverOne(id)` und `coverOne(c)` liefern `{ candidate | skip }`; beide
  Durchgänge laufen über `settle()` (parallel oder sequenziell) und sammeln **per Index in `ids`-Ordnung**
  ein — der Index `ci` ist tragend (srcMask-Bit, Ensemble-Priorität, `quantSrc`/`profileSrc`).
- Manifest additiv: `timing.mode: 'lanes'|'sequential'`, `timing.lanes: { ahead, maxAhead, consumeMs,
  laneMs je Quelle }` — Bahnzeiten **überlappen**, sind nicht summierbar.
- Verifier (3u): Bahnen-Selbsttest, Form (Kill-Switch, Rückstau ≥ 1, `ci`-Ordnung im Verbraucher,
  Entakkumulation IN der Bahn, beide Durchgänge über `settle`), `orderedSettle ≡ sequentialSettle`,
  `runLanes` mit einer Bahn ⇔ sequenziell. **705/705.**
- Noch nicht in Bahnen: Ensemble-, Quantil- und Profilblock (laufen weiter nach den Feldbahnen,
  intern sequenziell) — zweiter Schritt, wenn die Messung sagt, dass sie den Boden bilden.

**Wiederholung des F2a-Baus (19:50–19:57 UTC):** wieder **208/208 byte-gleich**, 386 s gegen 375 s der
Referenz (±3 %, Messrauschen — F2a ist zeitneutral, wie geplant). Diesmal **6 × 429** statt 32 (IFS 3,
AIFS 3, alles HEAD-Sonden), `discover` 27 s: ECMWF drosselt die Sonden zu dieser Tageszeit
schwankend, unabhängig vom Code — beide Läufe waren streng sequenziell mit demselben 600-ms-Takt.
Regel für die weiteren Etappen: der **Chunk-Beweis** entscheidet; `throttled` wird berichtet und bleibt
Gate nur für den Verdacht auf einen Burst (Bahnen), nicht für den Zufall der Gegenseite.
**Gate GPD-F2a erfüllt.**

**Byte-Beweis F2b (warm, 19:57–20:04 UTC):** Bahnen gegen den committeten Producer am selben Cache:
**208/208 Chunks byte-gleich, Manifest-Whitelist gleich, 0 × 429.** Zeit warm **454 s gegen 375–386 s** —
langsamer, und das ist erwartbar: warm gibt es kein Netz zu überlappen, die Bahnen verschränken nur
CPU-Arbeit im selben Thread und kosten Verwaltung (Verbraucher wartet je Stunde auf acht Bahnen, mehr
gleichzeitig lebende Gitter ⇒ GC; `encode` 23 → 33 s deutet auf Speicherdruck). **Der Gewinn von F2b
kann nur kalt sichtbar sein** — die Messung läuft (20:04 UTC, frischer Cache, `--run=2026091115`).
Der warme Befund ist zugleich das Argument für F2d (Worker): solange Dekodieren im Hauptthread bleibt,
ist die reine Rechenzeit (≈ 390 s in t1) der Boden, unter den kein Überlappen kommt.

**F2b kalt (20:04–20:23 UTC, frischer Cache, `--run=2026091115`): 1 092 s gegen 1 219 s Referenz
(−10 %).** Je Phase: discover **6 s** (war 48 — parallele Laufsuche), fields **338 s** (war 557,
−39 %), ensemble 281 (war 227), quantiles 227 (war 168), profile 208 (war 198), encode 32. Die Summe der
Quellen-Wandzeiten stieg auf 1 722 s (icon_d2 515 statt 351): die Bahnen überlappen, aber sie teilen sich
EINEN Thread — was eine Bahn dekodiert, wartet die andere. Die drei Blöcke, die NICHT in Bahnen laufen
(Ensemble, Quantile, Profil), sind jetzt **716 s = 65 %** der Stufe; ihre Zuwächse (+123 s) liegen im
Netzrauschen des Abends. **Lehre:** der Feld-Teil ist gelöst, der Boden liegt bei den drei Restblöcken
und beim Hauptthread ⇒ F2b-2 (Ensemble/Quantile/Profil als eigene Bahnen, gleichzeitig mit den
Feldbahnen) und F2d (Worker) sind das, was zählt. Speicher unauffällig (Heap 105 MiB, RSS 1,7 GB).

⚠ **V-PD-47 — C-LAEF ist nicht reproduzierbar (Befund des kalten Vergleichs):** kalt gegen warm mit
demselben Code unterscheiden sich **128 von 208 Chunks — exakt die Zeilen cy 0…7**, also die
C-LAEF-Domäne (≤ 51,5 °N), in allen Stunden und allen von C-LAEF getragenen Größen. Ursache: die
GeoSphere-Anfrage nennt **absolute Zeiten, aber keine Referenzzeit**
(`…?parameters=…&start=…&end=…&bbox=…`) — der Hub liefert den jeweils NEUESTEN Lauf, der die Zeiten
deckt. Um 18:42 war das ein anderer C-LAEF-Lauf als um 20:05. Der Cube bleibt in Gültigzeit korrekt,
aber `sources[].run/runAt/ageH` für `claef`/`claef_eps` sind nominal (aus `reftimes()`), nicht das, was
geliefert wurde — und ein Byte-Beweis kalt gegen warm ist für C-LAEF grundsätzlich unmöglich. *Skizze:*
prüfen, ob der Hub `forecast_offset`/Referenzzeit annimmt; sonst den gelieferten Lauf aus dem netCDF
(`leadtime`/Attribute) lesen und ins Manifest schreiben. Für Block F gilt deshalb: **Byte-Beweise nur
warm gegen warm am selben Cache** (so geschehen: F2a 208/208, F2b 208/208); der kalte Lauf misst Zeit.

### 50.c PD-F2c — Abtast-Index je Gittersignatur

`sample.mjs`: `sampleIndexKey/buildSampleIndex/sampleIndexFor/sampleWithIndex`, LRU ≤ 16; die alte
Schleife bleibt als `sampleRegularToTierFull` (Rückfall `POINT_SAMPLE_INDEX=0` und Referenz). Der Index
hält die Paare in der **Reihenfolge der Schleife** (j außen, i innen, mit Wrap und `Math.round`), also
laufen die Blockmittel-Summen in identischer FP-Ordnung. Verifier (3v): vier Geometrien (global 0,25° mit
Wrap · ICON-D2 0,02° nordwärts · C-LAEF 0,0135×0,009 · ICON-EU 0,0625° südwärts) × drei Stufen mit
Zufallswerten und NaN-Löchern ⇒ Float32-Ausgabe **byte-gleich**, auch ohne `fillGaps`;
Negativ-Kontrolle (Gitter um 0,011° verschoben ⇒ anderer Schlüssel, andere Ausgabe); LRU-Treffer;
ICON-D2 → t1 hält 303 309 statt 906 390 Paare, das globale 0,25°-Gitter → t3 2 009 statt 1 038 240 (gemessen). **726/726.**

**Byte-Beweis am echten Bau:** warm t1 gegen `point-ref-old` (committeter Producer, gleicher Cache,
gleicher `--run`) ⇒ **208 verglichen · 208 gleich · 0 verschieden**, Manifest-Whitelist gleich.

⚠ **Die Wirkung ist gemessen null — und die Schätzung im Plan war ein Rechenfehler.** Warm t1 423 s
mit `fields` **147 s** gegen 135–148 s der F2b-Referenz; die Blöcke Ensemble 110 · Quantile 72 ·
Profil 17 s unverändert. Der Mikro-Benchmark auf den echten Geometrien sagt, warum: ICON-D2 → t1 kostet
die Vollschleife **5,8 ms je Aufruf**, der Index **5,5 ms**; das globale 0,25°-Gitter → t3 1,5 gegen
0,2 ms. Bei 639 ICON-D2-Aufrufen in t1 sind das **≈ 3,7 s, nicht 150–250 s**. Der Plan hatte aus
„906 k Punkte je Aufruf" eine große Zahl gemacht, ohne sie mit dem Takt zu multiplizieren: 906 390 ×
639 ≈ 5,8·10⁸ Schleifendurchläufe sind bei ~10⁸/s **sechs Sekunden** — die Abtastung war nie der
Boden von `fields`, das ist die Dekodierung (bz2 + GRIB-Entpacken), und die erreicht kein Index.
**Dieselbe Lehre wie §38.6, nur andersherum:** dort war eine Optimierung am günstigen Fall gemessen,
hier war sie gar nicht gemessen, sondern aus einer Punktzahl geschätzt. Der Pfad bleibt (bewiesen
byte-gleich, Kill-Switch, Referenzschleife im Code), aber er trägt zur Bau-Kürzung nichts bei; die
Ziele hängen an F2b-2 (Blöcke nebeneinander) und F2d (Worker).

### 50.d PD-F2b-2 — Ensemble, Quantile, Profil und Orographie als eigene Bahnen

**Diagnose (aus 50.b):** nach F2b liefen die vier Nebenblöcke weiter streng HINTER den Feldbahnen —
im kalten t1 716 von 1 092 s (65 %), warm 110 + 72 + 17 s hinter 147 s `fields`. Sie schreiben
disjunkte Ebenen (`_sd_ens`/`ensCount`, `_q10`/`_q90`, vier Profilebenen, `hModEff`) und lesen
nichts aus den Feldebenen; ihre einzige Kopplung an die Felder ist die Fehlerbuchhaltung je Quelle
in `safeCall` (`errors`/`dropped`/`msWall`).

**Umsetzung:** die fünf Blöcke sind Funktionen (`runFields`, `runEnsemble`, `runQuantiles`,
`runProfile`, `runOrography`), **innen unverändert sequenziell** — Reihenfolge und FP-Ordnung je Block
bleiben —, und laufen mit `POINT_PARALLEL` (Standard) über `Promise.allSettled` gleichzeitig; erst
danach die Prüfung „alle Quellen tot" und der Chunk-Schnitt. `POINT_PARALLEL=0` fährt die alte Folge
Felder → Ensemble → Quantile → Profil → Orographie mit den alten sieben Phasenmarken. Neu im Manifest
(additiv): `timing.blocks` = Wandzeit je Block, **überlappend**; `timing.phases` bleibt die
sequenzielle Zerlegung (im Bahnenmodus discover · fields = Join · encode, Summe = Stufenzeit).
Benannte Folge im Fehlerfall: die Quellenwahl von Ensemble und Quantilen (`!c.dropped`) fällt jetzt
VOR den Feldbahnen, kann also ein späteres `dropped` nicht sehen; `safeCall` liefert für eine
herausgefallene Quelle danach ohnehin `null`. `PointTierManifest.timing` ist jetzt typisiert.
Verifier (3s) angepasst: sieben Marken im Rückfall, eine Join-Marke im Bahnenpfad — **726/726**,
typecheck 0.

**Byte-Beweis:** warm t1 gegen `point-ref-old` ⇒ **208 verglichen · 208 gleich · 0 verschieden**,
Manifest-Whitelist gleich. Speicher unverändert (Heap 31 MiB, extern 1 428 MiB, RSS 1 536 MiB).

⚠ **Warm ist der Bau damit LANGSAMER geworden — 496 s statt 423 s (+17 %) — und das ist kein
Widerspruch, sondern die Messung dessen, was der Warmlauf misst:** ohne Netz ist Stufe 1 reine
CPU in EINEM Thread. Fünf gleichzeitige Blöcke auf einem Kern gewinnen nichts (die Summe der
Arbeit ist dieselbe) und zahlen Verwaltung: `fields` 147 → 418 s, weil Ensemble (143 s),
Quantile und Profil (je 237 s) jetzt IN dieselbe Zeitspanne verschachtelt sind statt dahinter.
Der Warmlauf ist für F2b-2 der ungünstigste Fall; der Gewinn liegt dort, wo die Blöcke auf Netz
warten (kalt: Ensemble-Bahn zog 13,4 MiB je Datei, Quantile 345 Anfragen an GeoSphere) — und ab
F2d, wenn die CPU-Arbeit der Blöcke in Worker wandert und die Blöcke wirklich nebeneinander
rechnen. Deshalb wird F2b-2 NICHT einzeln kalt bewertet, sondern zusammen mit F2d (§50.e), und
der Kill-Switch bleibt: `POINT_PARALLEL=0` stellt den alten Ablauf her.

### 50.e PD-F2d — Dekodieren + Abtasten in `worker_threads`

**Diagnose:** nach 50.c ist der Boden von `fields` die Dekodierung (bz2 + GRIB-Entpacken), nach 50.d
teilen sich fünf gleichzeitige Blöcke einen Kern. Der Runner hat vier vCPU, lokal sind es vier Kerne —
drei davon lagen brach.

**Umsetzung:** `adapters/gribWorker.mjs` (Worker: importiert NUR `gribDecode.ts` und `sample.mjs`, kein
`shared.mjs` — Netz, Plattencache, Zähler, AsyncLocalStorage-Kontext und Fehlerinjektion bleiben im
Hauptthread) und `adapters/decodePool.mjs` (`DecodePool`: `POINT_WORKERS` Worker, Standard
min(6, Kerne − 1), je Worker ≤ 2 offene Aufträge, least-busy-Verteilung, `ref()` solange beschäftigt /
`unref()` im Leerlauf, Inline-Rückfall bei `POINT_WORKERS=0`, bei Spawn-Fehler und bei Worker-Ausfall —
laufende Aufträge des gestorbenen Workers rechnen inline weiter; Selbsttest 8/8). Einbau über drei
Einstiege in `shared.mjs`: `fetchSampledField(url, tier, opts)` (Bytes hier, Dekodieren + Abtasten +
Einheit im Pool, zurück Kopf ohne `values` + Stufengitter 194 KB statt bis 11,8 MB Feld; **derselbe
Binary-Rückfall wie `fetchGribField`**, §25), `sampleBytes(raw, tier, opts)` (für Range-Puffer: ECMWF,
IFS-ENS-Member per `Promise.all`, Ergebnisse per Index) und `sampleBytesMany` (dwdEps: alle Nachrichten
einer Datei, Filter auf Intervall-Ende und Member-Nummer am mitgelieferten Kopf). Nachbarindizes gehen
EINMAL je (Quelle, Stufe) als Kopie an alle Worker (`poolSetIndex`; Schlüssel `<id>|<tier>` bzw.
`mch:<collection>|<tier>`). Der Puffer wird vor der Übergabe kopiert, weil der In-flight-Memo (F2a)
denselben Puffer an zwei Aufrufer reicht und ein übertragener ArrayBuffer für den zweiten leer wäre.
Verdrahtet: dwdRegular (field/orography/Halbflächen/Level), dwdIcosahedral, meteoswiss, ecmwf (Einheit
NACH der Abtastung aus dem Kopf, §23 (4) bleibt), ecmwfEns, dwdEps; **geosphere bleibt inline**
(netCDF/jsfive). Manifest additiv: `timing.workers` = {requested, running, mode, jobs, inlineJobs,
errors, msWait}; Logzeile „Worker-Pool"; `poolClose()` am Ende von `main()`.

**Beweise:** Verifier (3w) — Pool-Selbsttest (Rundreise Worker ⇔ inline byte-gleich, sechs gleichzeitige
Aufträge richtig zugeordnet, kaputte Bytes ⇒ Fehler beim Aufrufer, kein Worker verloren,
`POINT_WORKERS=0` inline byte-gleich), Form je Adapter, Binary-Rückfall, Import-Hygiene des Workers, und
eine **echte ICON-D2-Datei aus dem Plattencache** (1 215×746, 1,5 MiB): Pool ⇔ inline byte-gleich.
**749/749** (nach F2c: 726). Byte-Beweis am Bau: warm t1 gegen `point-ref-old` ⇒ **208 verglichen ·
208 gleich · 0 verschieden**, Manifest-Whitelist gleich.

**Wirkung, warm t1 (reine CPU, 4 Kerne, 3 Worker):** **295 s** gegen 496 s (F2b-2) / 423 s (F2c) /
393 s (Referenz vor Block F) ⇒ **−25 % gegen die Referenz, −40 % gegen F2b-2** — und damit ist auch die
Verlangsamung aus 50.d erklärt und aufgehoben: die fünf Blöcke rechnen jetzt wirklich nebeneinander
(Blöcke überlappend: fields 238 · ensemble 261 · profile 142 · quantiles 98 · orography 99 s, Join
262 s). `discover` 6 s (Netz warm). Pool: 2 432 Aufträge, Wartezeit 481 s über alle Aufträge. Speicher
RSS **2 083 MiB** (war 1 536 — die drei Worker halten je einen Node-Heap plus die Rohpuffer in Arbeit),
Heap des Hauptthreads 42 MiB, extern 1 505 MiB — unter der Schranke des Plans (2,5 GB).
⚠ **Der neue Boden ist die Ensemble-Bahn (261 s):** dwdEps dekodiert je `tot_prec`-Datei alle
80 Nachrichten, obwohl 60 davon Viertelstunden sind — genau V-PD-31, das F2e mit dem `keep`-Prädikat im
Worker schließt.

**Kalt, t1, frischer Cache, `--run=2026091115`, F2b-2 + F2d zusammen: 620 s** (F1-Basis 1 219 s,
F2b 1 092 s ⇒ **−43 % gegen F2b, −49 % gegen die Basis**). Phasen: discover 46 · fields (Join) 544 ·
encode 31 s; Blöcke überlappend: profile 543 · fields 517 · ensemble 473 · quantiles 411 ·
orography 35 s. Netz 3 858 MiB in 2 545 Dateien (ICON-D2 1 580 MiB/1 590 Dateien, Netzzeit 522 s
bei 933 s Wandzeit — die Quelle ist jetzt der Boden der Feldbahnen, weil 639 Aufrufe je Stufe
sequenziell durch EINE Bahn laufen), Pool 2 432 Aufträge / Wartezeit 405 s, RSS 2 146 MiB, Heap
106 MiB. 74,27 statt 74,36 MiB Ausgabe — C-LAEF-Fenster einer anderen Abrufzeit (V-PD-47), kein
Vergleichsmaß. Ziel des Plans (t1 kalt ≤ 8 min = 480 s) noch nicht erreicht; die nächsten Böden
sind benannt: Profil-Level sequenziell (F2e), dwdEps 80 statt 20 Nachrichten (F2e), dritter Deflate
(F2f).

### 50.f PD-F2e — `keep` im Decoder, Konstanten 17 → 3, Profil-Level gleichzeitig, V-PD-45

**Diagnose:** nach F2d war die Ensemble-Bahn der Boden (warm 261 s): dwdEps entpackte je
`tot_prec`-Datei alle 80 Nachrichten (20 Member × vier Viertelstunden) und warf 60 weg (V-PD-31 aus
§43); meteoswiss entpackte 17 Konstantenfelder (41 MiB) für drei; das Profil holte 20 Level je Stunde
NACHEINANDER (mit dem Pool wartet dabei ein Kern auf einen); und der Vorschritt der ersten Stufenstunde
wurde bei ECMWF ohne Rasterprüfung geholt (2 × 404 je Lauf, V-PD-45 aus §49.3).

**Umsetzung:** `gribDecode.ts` — `decodeGrib2All(raw, { keep })` und `scanGrib2Headers(raw)`; das
Prädikat sieht den Kopf (`GribHeader` = `GribField` ohne `values`) **nach dem Sektionslauf und vor der
Entpackstufe**, eine abgelehnte Nachricht kostet nur das Lesen der Sektionen 1–6. `decodeGrib2(raw)`
behält seine Signatur (die Kartenlinie lädt die Datei). Regel: **„keine dekodierbar" wirft, „keine
behalten" gibt `[]`** — zwei verschiedene Aussagen. `adapters/keepSpec.mjs` (importiert NUR den
Decoder, worker-tauglich): deklaratives `keep` für Worker und Inline-Pfad — `intervalEndMinute`,
`paramIds`, `perturbationNumbers` und **`intervalEndMinuteIfAny`** („nur filtern, wenn die Datei
überhaupt Intervall-Enden trägt": `t_2m` hat keine, `tot_prec` vier je Member), aufgelöst am
Sektionslauf über alle Köpfe (`resolveKeep` liefert auch `total`, damit `messagesTotal` im Manifest
weiter die 80 nennt). dwdEps: `sampleBytesMany(…, { keep: { intervalEndMinuteIfAny: 0 } })`, kein
Nachfilter mehr. meteoswiss `constants`: `keep` auf clat/clon/hsurf. dwdRegular `profile`:
Halbflächen und Level per `Promise.all`, **Ergebnisse per Index in Levelordnung** (unten → oben),
fehlt eines ⇒ `null` wie zuvor. **V-PD-45:** liegt der Vorschritt vor der Stufe, fragt der Producer
`adapter.hasStep(h)` (ECMWF: 3 h bis 144, dann 6 h; AIFS 6 h) statt blind abzurufen.

**Beweise:** Verifier (3x) — keep-Position im Decoder (vor Gitter-/Datenprüfung, vor `values`),
Unterscheidung wirft/leer, Signatur von `decodeGrib2`, Import-Hygiene von keepSpec, Form in dwdEps/
meteoswiss/dwdRegular, Müll wirft, und **an echten Dateien aus dem Plattencache**: `scanGrib2Headers`
zählt wie `decodeGrib2All` (1 und 4 Nachrichten), `decodeGrib2All(raw,{keep}) ≡ decodeGrib2All(raw)
.filter(keep)` byte-gleich, keep-alles-ablehnen ⇒ `[]`, `resolveKeep(intervalEndMinuteIfAny)` an einer
Datei ohne Intervall-Enden behält alle; (3r) `hasStep` funktional (51 ja/50 nein/150 ja/147 nein;
AIFS 48 ja/51 nein). **765/765**, typecheck 0. ⚠ `gribDecode.ts` liegt im Karten-Bundle — `totalJs`
wird nach dem Byte-Beweis gemessen (§50.h).

### 50.g PD-F2f — Kodierung: dritter Deflate weg, `hasData` einmal, Deflate asynchron

**Diagnose:** je Chunk liefen je Ebene DREI Deflates im Hauptthread — roh und Zeilendifferenz in
`packBlock` (die Wahl je Block, §22) und ein dritter nur für die Logzeile „mit Werten" (`perPlane`),
dazu `hasData` als Schleife über jede Ebene jedes Chunks; `encode` 24–31 s je Stufe 1.

**Umsetzung:** `perPlane` kommt aus dem **Verzeichnis des geschriebenen Chunks**
(`readCubeHeader(bytes).directory[p].length`) — Semantik jetzt „Bytes im Container je Ebene"
(min(roh, Differenz) nach Deflate) statt „Rohgröße ohne Filter"; zulässig, weil die Zahl nur im
Bauprotokoll steht (nicht im Manifest), und die Zeile ist umbeschriftet („KiB im Container").
`hasData` einmal über die vollen Stufenebenen. `deflate9` = `promisify(zlib.deflateRaw)` mit
`level: 9` (libuv-Threadpool); zlib ist bei gleichen Parametern deterministisch. Bis **vier Chunks
gleichzeitig** über `mapLimit(jobs, 4, encodeOne)`, `files[]` **per Index in (cy, cx)-Ordnung** — die
Reihenfolge ist Manifestvertrag, nicht die Fertigstellung. Kill-Switch `POINT_ENCODE_ASYNC=0`
(synchron, ein Chunk nach dem anderen; `deflateRawSync` bleibt im Code als Referenz).
`build-stations.mjs` behält seinen dritten Deflate (55 s Gesamtlauf, eigenes Produkt — nicht Teil
dieser Etappe).

**Beweise:** Verifier (3y) — async ≡ sync byte-gleich an MISSING-Ebene (72 B), Zufall (35 587 B),
Rampe (5 527 B); `encodeCubeChunk` mit asynchronem ≡ synchronem Kompressor über den ganzen Chunk
(942 597 B); Verzeichnislängen summieren sich exakt auf den Nutzteil; `mapLimit` liefert per Index
trotz gestörter Fertigstellung (0:30 1:5 2:20 3:1 4:10 5:2), hält die Grenze, leere Liste ⇒ `[]`;
Form (kein dritter Deflate, `hasData` einmal, Kill-Switch, Logzeile). **778/778.**

**Byte-Beweis F2e + F2f zusammen:** warm t1 gegen `point-ref-old` ⇒ **208 verglichen · 208 gleich ·
0 verschieden**, Manifest-Whitelist gleich; `encode` **28 → 8 s**; `messagesTotal` nennt weiter 80.
⚠ **Die Wandzeit dieses Laufs (351 s) ist KEINE Messung:** während des Baus lief der Verifier
(Pool-Selbsttest mit eigenen Workern, Dekodierproben an echten Dateien) auf derselben Maschine, und
`discover` brauchte 47 statt 6 s (Netz: STAC-Listen und ECMWF-Sonden). Der Wert steht hier, damit
niemand ihn später für einen Rückschritt hält; gemessen wird F2e/F2f am kalten Lauf (§50.h) und an
einem sauberen Warmlauf.

### 50.i PD-F3a — Datenmodell für einen Job je Stufe: `latestByTier`, Aufbewahrung je Stufe, `pruneTier`

**Diagnose:** mit einem Job je Stufe (F3b) heißt jedes Verzeichnis nach dem Quell-Lauf der in DIESEM
Job gebauten Stufen (§26, `placeUnderPublishRun`) — t1 liegt achtmal täglich in einem eigenen
Verzeichnis, t3 zweimal. Der jüngste Lauf trägt dann meist nur t1; ein Client, der „den neuesten Lauf"
nähme, fände für t3 nichts. Und die 24-h-Regel hielte acht t1-Läufe ≈ 600 MiB im Arbeitsbaum — über
dem 500-MiB-Deckel.

**Umsetzung (additiv, `CUBE_SCHEMA` bleibt 4):** `manifest.ts` — `RETENTION_HOURS_BY_TIER`
**{ t1: 9, t2: 24, t3: 24 }** (⚠ **Vorschlag E-F-1, Jans Entscheidung steht aus**; der Plan nannte für
t3 36 h — das widerspräche Jans 24-h-Regel vom 2026-09-09 und steht deshalb nicht im Code; t3 behält
über `MIN_RUNS` je Stufe ohnehin zwei Läufe), `runsToKeepFor(runs, { hours, minRuns })` (dieselbe
Regel mit eigener Grenze; `runsToKeep` ist jetzt ein Aufruf davon), `latestByTier(runs)` = je Stufe
der jüngste Lauf, der sie TRÄGT, mit Quell-Lauf, Alter, Manifestpfad, Dateizahl und Bytes; `index.json`
bekommt `latestByTier` und `retentionByTier`, `retentionHours`/`minRuns` bleiben. Neu
`scripts/point/prune.mjs`: `tiersOf(runDir)` und `pruneTier(runDir, tierId)` — löscht
`point/<run>/<tier>/`, nimmt Stufeneintrag und dessen Quellen aus `run.json`, entfernt das Verzeichnis
ganz, wenn keine Stufe bleibt, und lässt kein Stufenverzeichnis ohne Manifesteintrag stehen (der
Orphan-Wächter des Publishers bleibt grün). `publish-point.mjs`: **Aufbewahrung je Stufe VOR der
Laufregel** — gemessen am Alter des Quell-Laufs der Stufe aus `run.json`, nicht am Verzeichnisnamen;
`tierRuns` je Lauf im Index. Repo-Rechnung: 4 t1-Läufe (9 h bei 3-h-Takt) × 75,7 + t2 4 × 25 + t3 2 × 5
+ stations 27 ≈ **440 MiB** < 500 (t2/t3-Größen nach dem ersten F3-Lauf nachmessen).

**Beweise:** Verifier (3z) — Regel je Stufe (9 h behält von acht 3-stündlichen Läufen genau 21z/18z/15z,
24 h alle acht; der Boden hält zwei überalterte und benennt sie; `runsToKeep ≡ runsToKeepFor` mit der
Gesamtregel), `latestByTier` an drei Läufen (t1 aus 18z, t2 aus 15z, t3 aus 12z — **Negativkontrolle:
der jüngste Lauf ohne t3 wird für t3 nie gewählt**; fehlt eine Stufe überall ⇒ `null`), `pruneTier` am
synthetischen Baum (Stufe weg, Manifest ohne Stufe und Quellen, kein Chunk ohne Eintrag / kein Eintrag
ohne Datei, letzte Stufe ⇒ Verzeichnis weg, fehlende Stufe harmlos), `validateRunManifest` nimmt ein
Manifest mit nur t1 an, Publisher-Form. Der Client-Leser von `latestByTier` gehört zu PD-C12.

### 50.j PD-F3b — die Vorlage: EIN Workflow, DREI Jobs, DREI Takte (Kopie = Jans Gate)

**Diagnose (§49.1):** die Verzögerung der Stufe 1 bestand zu ihrem größten Teil aus Wartezeit bis
zum Slot (0–6 h), nicht aus Bau oder Bereitstellung — ICON-D2 rechnet achtmal täglich und ist nach
1,35 h fertig, der Cube nahm ihn viermal täglich mit 3,4–3,8 h Alter.

**Umsetzung (`scripts/repack-repo/workflow-point.yml`, nur Vorlage — die Kopie ins Daten-Repo ist
Jans Gate):** drei Jobs `t1`/`t2`/`t3`, jeder mit eigenem Cron im `if:`
(`github.event.schedule == '…'`), eigenem `timeout-minutes`, eigenem sparse-Block und genau einer
Push-Stelle; jeder baut GENAU eine Stufe (`--tiers=tX`) direkt in den ausgecheckten `point/`-Baum
(der Producer führt ein vorhandenes `run.json` desselben Laufs fort, §26). Takte: **t1
`30 1,4,7,10,13,16,19,22`** (ICON-D2 des Laufs −3 h, +1,35 h + 9 min Rand; 8×/Tag), **t2
`50 3,9,15,21`** (wie bisher, mit dem Stationsprodukt), **t3 `55 9,21`** (IFS `oper` 00z/12z, die
einzigen bis 336 h; fünf Minuten hinter t2 in derselben Gruppe ⇒ wartet). `workflow_dispatch`
bekommt `tiers` (all | t1 | t2 | t3; `all` läuft über eine `needs`-Kette t1 → t2 → t3 mit `always()`,
damit ein planmäßiger t2-Lauf nicht ausfällt, weil t1 an dem Tag übersprungen ist); der Producer
liest `args.tiers` seit PD-B. EINE Concurrency-Gruppe ohne `cancel-in-progress` — zwei Publisher
gleichzeitig sind V-BW-58.

**Der Verifier rechnet die Slot-Regeln JE JOB gegen die Cron-Zeilen der Kartenlinie** (neu
`jobsOf()` in `sparseCover.mjs`): **Regel A** Abstand zum nächsten Kartenlinien-Push ≥
JOB_MAX_MIN(Job) + 20; **Regel B** wartet ein Job hinter einem anderen der Gruppe, zählt dessen
Restlaufzeit mit; **Regel C** JOB_MAX_MIN + 10 ≤ timeout ≤ Abstand; **Regel D** keine zwei Slots
auf derselben Minute (GitHub bricht einen wartenden Lauf ab, sobald ein zweiter wartet) und nie drei
Jobs in einem Fenster. Dazu je Job: sparse-Block deckt alle Publisher-Pfade, Nachprüfung im Job,
`QUELLENMATRIX.md`, `POINT_CACHE_CLEAR`, `REPACK_BZIP2`, genau eine Push-Stelle; Stationsprodukt
genau im t2-Job. Negativkontrollen: der alte Takt `10 2,8,14,20` und ein t1-Takt auf den
:30-Stunden der Kartenlinie fallen durch Regel A, 330 min fielen durch Regel C.

⚠ **`JOB_MAX_MIN_BY_TIER = { t1: 30, t2: 30, t3: 20 }` ist PROVISORISCH** — t1 aus der lokalen
kalten Messung nach F2d (620 s) × 2 (Runner-Faktor, §49.5), t2/t3 aus Lauf 9 VOR F2 (15,6 / 11,4 min).
Die Regel steht damit für t1 an der Grenze der Konstruktion: der :30-Slot hat zum :30-Push der
Kartenlinie eine Stunde später **60 min**, also JOB_MAX_MIN(t1) ≤ 40. Bringt der Runner t1 nicht in
30 min, greift der benannte Rückfall `30 0,3,6,…` (120 min Abstand, ≈ 2 h älteres ICON-D2) — eine
Vorlagenänderung und damit wieder Jans Gate. F3c zieht die drei Zahlen an `tiers[].timing.totalMs`
der Cron-Manifeste nach (Maximum + 30 %). Tagesnetz gerechnet ≈ 8 × 3,9 + 4 × 2,1 + 2 × 1,5 ≈
**43 GiB**, Runner-Minuten ≈ 8 × 12 + 4 × 10 + 2 × 6 ≈ 140/Tag (Schätzungen, zu messen).

### 50.h F2 — Zeittafel Stufe 1 (alle Werte gemessen, lokal, 4 Kerne, `--run=2026091115`)

| Stand | kalt t1 | warm t1 | Boden |
|---|---|---|---|
| F1-Basis (§49) | **1 219 s** | 393 s | Quellen sequenziell, Netz ≈ Rechnen ohne Überlappung |
| F2b Bahnen | 1 092 s | — | Ensemble/Quantile/Profil hinter den Feldern (65 %) |
| F2b-2 + F2c | — | 496 s / 423 s | ein Kern für fünf Blöcke; Index wirkungslos |
| F2d Worker | **620 s** | **295 s** | Ensemble-Bahn (80 statt 20 Nachrichten), Profil-Level sequenziell |
| F2e + F2f | **539 s** | (351 s, verunreinigt) | Feldbahn ICON-D2 603 s (1 590 Abrufe, eine Bahn), Ensemble 466 s, Quantile 443 s (GeoSphere, 345 Anfragen) |

Kalt F2e + F2f: discover 6 · fields 526 · **encode 7 s** (war 31); Blöcke überlappend profile **191 s**
(war 543), quantiles 443, ensemble 466, fields 526, orography 39; Netz 3 858 MiB / 2 545 Dateien;
RSS 1 910 MiB; Cache 5 324 MiB. **Gegen die Basis −56 %, gegen den Stand vor Block F (1 092 s)
−51 %.** Das Planziel „t1 kalt ≤ 8 min (480 s)" ist um **59 s verfehlt** — der Boden ist jetzt nicht
mehr CPU, sondern die ICON-D2-Bahn (1 590 Anfragen sequenziell in einer Bahn, 60-ms-Takt) und die
C-LAEF-EPS-Bahn (345 Anfragen an GeoSphere). Beides wäre eine weitere Etappe (mehrere Bahnen je
Quelle ⇒ die `accPrev`-Rekurrenz je Größe statt je Quelle) und steht als Skizze unter V-PD-48; für
den Runner (Faktor ≈ 2) heißen 539 s ≈ 18 min je t1-Job — unter den 30 min, die Regel A für den
:30-Takt verlangt, aber mit weniger Reserve, als der Plan wollte.

**Gate-Stand F2 (lokal, 2026-09-11 spät):** `verify:point-data` **814/814** (Block F: 3t/3u/3v/3w/3x/3y/3z
+ F3b-Regeln), typecheck 0, Build 241/241, Budget grün — **`totalJs` 1 366,1 KB unverändert** trotz
`keep`/`scanGrib2Headers` in `gribDecode.ts` (die Kartenlinie lädt die Datei; der Zusatz wiegt unter
der Rundung). Byte-Beweise t1: F2a, F2b, F2b-2, F2c, F2d, F2e+F2f je 208/208 gegen den committeten
Producer. **t2 + t3:** Referenz mit dem committeten Producer (`data/ref-producer`, `--tiers=t2,t3`,
gleicher Cache, gleicher `--run`), dann der neue Producer ⇒ **68 verglichen · 68 gleich · 0 verschieden**
(t2 56 Chunks 6,54 MiB, t3 12 Chunks 1,34 MiB), Manifest-Whitelist gleich. Damit sind **alle 276 Chunks
aller drei Stufen byte-gleich** zum Stand vor Block F — die Vollständigkeitsgarantie F-0 ist am Bau belegt,
nicht behauptet. (Die Zeiten dieses Paars taugen NICHT zum Vergleich: die Referenz zog 895 MiB t2/t3-Dateien
frisch, der neue Bau fand sie im Cache — 447/377 s gegen 219/151 s messen den Cache, nicht die Etappe.)
**Offen für das Gate:** der Runner-Lauf (Jans Dispatch, mit gepushtem Stand) und `JOB_MAX_MIN_BY_TIER`
aus dessen Manifest (F3c).

**V-PD-48 (neu, Skizze):** die ICON-D2-Bahn ist nach F2 der Boden von Stufe 1 — 639 Feldaufrufe
(≈ 1 590 Anfragen mit Vorschritten und Sonden) laufen in EINER Bahn nacheinander, weil die
`accPrev`-Rekurrenz der Entakkumulation je Quelle in der Bahn liegt. Skizze: eine Bahn je (Quelle,
Größe) statt je Quelle — die Rekurrenz gilt je `${id}:${varId}`, also bleibt sie in ihrer Bahn strikt;
der Verbraucher sammelt `(it, varId, ci)` unverändert per Index. Erwartung: ICON-D2 603 → ≈ 150 s
Wandzeit, kalt t1 ≈ 480 s. Zweiter Posten: C-LAEF-EPS (345 Anfragen an GeoSphere, 349 s Netz) — die
Quantile je Größe parallel. Beides Rechnung, keine Messung; Byte-Beweis wie in Block F.
**V-PD-46:** `check-cdn.mjs` braucht `<commit>` und trägt einen alten Lauf fest — Aufrufform in die
Vorlage/README, `index.json.commit` als Standard.

## §51 Der Bau griff in FREMDE Laufverzeichnisse — Cron-Lauf 13 (2026-09-12)

Der erste Cron-Lauf mit dem committeten Block-F-Stand hat **gebaut wie geplant und nicht
veröffentlicht**. Die Zahlen des Baus sind das Beste, was die Linie bisher hatte, und der Abbruch kam
von einem Wächter, der genau dafür da ist.

### 51.1 Was der Lauf gemeldet hat

Lauf 13 (`schedule`, 09:54–10:18 UTC, 34687063042): Schritte 1–10 grün, **Schritt 11 `Publish`
rot nach 0 s**:

```
[publish-point] 2026091206: 276 Chunks, alle im Manifest
[publish-point] 2026091200: 0 Chunk(s) ohne Manifesteintrag, 12 Eintrag/Einträge ohne Datei. Abbruch.
  fehlend:  point/2026091200/t3/00_00.bin point/2026091200/t3/00_01.bin …
```

**Der Bau selbst war der schnellste bisher:** 22,3 min für alle drei Stufen (Lauf 9 vor Block F:
55 min), 276 Chunks, 84,10 MiB, 7 972,5 MiB Netz, Heap max 38 von 4 144 MiB, Stationsprodukt 52 s.
Block F wirkt auf dem Runner also ungefähr so wie lokal.

### 51.2 Die Ursache, und warum sie erst jetzt zuschlug

`placeUnderPublishRun` (§26) legt alle Stufen unter EINEN Publikationslauf. Bis heute lief das über
den **Quell-Lauf als Zwischenablage**: jede Stufe schnitt ihre Chunks nach `point/<Quell-Lauf>/<Stufe>/`
und wurde von dort per `renameSync` verschoben. Im Cron ist der Ausgabebaum aber **das ausgecheckte
Daten-Repo**, in dem die zuletzt veröffentlichten Läufe liegen. Fällt der Quell-Lauf einer Stufe mit
dem Namen eines solchen Laufs zusammen, trifft der Bau ein **fremdes** Verzeichnis — erst schreibend
(die zwölf t3-Chunks des Vorlaufs wurden überschrieben), dann verschiebend (`renameSync` zog das
Verzeichnis weg). Zurück blieb `point/2026091200/run.json`, das zwölf Dateien nennt, die es nicht
mehr gab.

**Gemessen am Log beider Läufe desselben Tages** — der Unterschied ist eine einzige Zeile:

| | t1 | t2 | t3 | Publikationslauf | Platzierung |
|---|---|---|---|---|---|
| Lauf 12 (03:50, grün) | 2026091200 | 2026091200 | **2026091200** | 2026091200 | keine Verschiebung |
| Lauf 13 (09:50, rot) | 2026091206 | 2026091206 | **2026091200** | 2026091206 | `t3: Quellen aus 2026091200, abgelegt unter 2026091206` |

Die Bedingung ist also: **die Fernstufe fällt auf einen älteren Lauf zurück, und genau dieser Lauf
liegt schon als Veröffentlichung im Repo.** Im 09:50-Slot ist das der Regelfall — ICON global und IFS
`oper` sind dort noch nicht mit dem 06z-Lauf fertig, t3 nimmt 00z, und `point/2026091200/` hat der
03:50-Lauf zwei Stunden vorher hingelegt. Der Fehler ist **älter als Block F** (er steckt seit §26 in
der Umbenennung), aber er brauchte ein Repo, in dem mehrere Läufe nebeneinander liegen — und das gibt
es erst, seit der Cron veröffentlicht (Gate C3, gestern).

⚠ **Der Wächter hat funktioniert, und das ist der eigentliche Befund.** Ohne die Orphan-Prüfung im
Publisher (§26) wäre ein Lauf gepusht worden, dessen `run.json` zwölf Chunks nennt, die am CDN
**404** liefern — für jeden Client ein halber Lauf, und niemand hätte es gesehen. Der rote Job ist die
teure, aber ehrliche Variante.

### 51.3 Die Kur: der Bau fasst kein Laufverzeichnis mehr an

`src/point/cubeFormat.ts` bekommt die **Bau-Ablage** als Form (`STAGE_DIR = 'point/.build'`,
`stageChunkPath`, `stageTierDir`) — dieselbe Regel für Producer, Publisher und Verifier, nirgends
zusammengesetzt. Der Producer schneidet jede Stufe nach `point/.build/<Stufe>/`; `files[].file` bleibt
der LOGISCHE Pfad `point/<Quell-Lauf>/<Stufe>/…`, also ändert sich am Manifestvertrag nichts.
`placeUnderPublishRun` verschiebt **aus der Ablage** und ersetzt dabei ausschließlich das Verzeichnis
**der eigenen Stufe** unter dem Publikationslauf (die Fortschreibung eines Laufs durch einen zweiten
Job bleibt damit erhalten, F3b). Danach ist die Ablage weg; bleibt doch etwas liegen, stammt es aus
einem Abbruch und wird benannt entfernt.

Zweiter Riegel im Publisher: `point/.build` wird **vor** `git add -A point` gelöscht (mit Zählung im
Log). Der Name beginnt mit einem Punkt und ist damit kein Laufname (`^\d{10}$`) — Aufbewahrung,
`latestByTier` und die Orphan-Prüfung sehen ihn nie.

### 51.4 Der Beweis, am Datenträger und mit dem echten Fall

Nachgebaut mit dem warmen Referenz-Cache (`--tiers=t1,t3 --run=2026091115`) in einen Ausgabebaum, in
den vorher ein **vollständiger, veröffentlichter Lauf `2026091112`** (56 t2 + 12 t3 + `run.json`,
69 Dateien) gelegt wurde — und t3 kommt in diesem Bau aus genau diesem Lauf:
`t3: Quellen aus 2026091112, abgelegt unter 2026091115`.

| Frage | Ergebnis |
|---|---|
| Bleibt der fremde Lauf unberührt? | **69 von 69 Dateien SHA1-identisch** zu vorher (vor der Kur wären die 12 t3-Chunks weg gewesen) |
| Ändert die Kur ein Byte in t1? | `compareTrees` **208 verglichen · 208 gleich · 0 verschieden** |
| Ändert sie ein Byte in t3? | `cmp` gegen die t2/t3-Referenz: **12 gleich · 0 verschieden** (der Pfad wandert, der Inhalt nicht) |
| Bleibt die Bau-Ablage stehen? | nein — `point/.build` existiert nach dem Lauf nicht |

Die „80 zusätzlichen" Chunks in der `compareTrees`-Zeile sind die 68 des Fremdlaufs plus die 12 neuen
t3 — die t1-Referenz kennt sie nicht; verglichen wurden absichtlich zwei verschieden geschnittene
Bäume, damit der Fremdlauf im selben Lauf mitgeprüft wird.

**Und die Publisher-Seite, trocken gegen einen frischen Baum** (mit einem absichtlich liegengelassenen
`point/.build/t1/00_00.bin`):

```
[publish-point] Bau-Ablage point/.build entfernt (1 Datei(en) aus einem abgebrochenen Lauf).
[publish-point] 2026091115: 220 Chunks, alle im Manifest
[publish-point] 2026091112: 68 Chunks, alle im Manifest
```

Genau die Zeile, die in Lauf 13 „12 Eintrag/Einträge ohne Datei. Abbruch." lautete — und der Rest der
Bau-Ablage steht danach in keinem Commit.

Im Verifier neu: **(3c2)** baut den Lauf-13-Fall synthetisch nach (veröffentlichter Lauf + Quell-Lauf
gleichen Namens) und prüft, dass dessen Chunks *und Bytes* und sein Manifest unangetastet bleiben;
**(3c3)** hält die Form fest (Ablage heißt nicht wie ein Lauf, der Producer schreibt dorthin und
verschiebt von dort, der Publisher räumt vor `git add`). Der bestehende (3c)-Test baut jetzt ebenfalls
in die Ablage — er prüft damit, was der Producer wirklich tut.

`verify:point-data` **826/826** (war 814), `typecheck` 0 Fehler, Build 241/241, Budget grün
(`totalJs` 1 366,1 unverändert — `cubeFormat.ts` steht in keinem Chunk).

### 51.5 Der Nachhol-Lauf (Lauf 14) — und die erste saubere Runner-Messung von Block F

Nach dem Push der Kur (`e00ff3d`) von Hand angestoßen: **Lauf 14, `workflow_dispatch` 14:54 UTC,
EXIT 0 nach 25 min.** `2026091212` steht mit **276 Chunks / 81,9 MiB** im Repo, Datencommit `9ae83db`
(vier Push-Versuche — der Radar-Spiegel pusht dazwischen, die Wiederholung aus §29 hält),
Manifest `f1654c0`, jsDelivr-Purge 200, `index.json` am CDN um 15:17 UTC mit `latestByTier` und
`retentionByTier` (F3a ist damit erstmals AM CDN sichtbar). Die Aufbewahrung je Stufe hat gearbeitet:
t3 aus `2026091118`/`2026091115` entfernt (27,3 h alt), `2026091115` damit ganz weg, `2026091118` trägt
nur noch t2. **Kein `point/.build` im Repo.**

⚠ **Ehrlich zum Beweiswert:** Lauf 14 hat den Kollisionsfall NICHT ausgelöst — alle drei Stufen hatten
`2026091212` als jüngsten Beiträger (AICON und ICON-CH2 waren mit 12z schon da), also gab es nichts zu
verschieben. Der Lauf beweist damit Regressionsfreiheit am echten Betrieb und die Rückkehr der
Veröffentlichung, nicht die Kur selbst; die ist lokal bewiesen (51.4) und wird am Runner wieder
geprüft, sobald t3 auf einen älteren, schon veröffentlichten Lauf zurückfällt — im 09:50-Slot der
Regelfall.

**Lauf 15 (planmäßig 15:50, EXIT 0 nach 27,5 min)** hat den zweiten Fall geprüft, den der Umbau
berührt: `2026091212` lag mit allen drei Stufen im Repo und wurde **fortgeschrieben** — jede Stufe aus
der Ablage an ihren Platz, `run.json` neu, Orphan-Wächter grün, 276 Chunks / 84,45 MiB, Datencommit
`18489ce`, Purge 200. Inhaltlich zieht er fast alles auf 12z: ICON-EU als Hauptlauf (t1 **49/49**,
t2 24/24), ICON global, AICON, ICON-CH1 und ICON-CH2 ebenfalls 12z; nur IFS HRES/AIFS Single bleiben
bei 06z bzw. 00z (Bereitstellung 6,5 h). **`sources[].runCaveat` steht erstmals im veröffentlichten
Manifest** — bei `claef` und `claef_eps`, wie gebaut. Zeiten: t1 664 s · t2 501 s · t3 351 s.
⚠ Beim Nachsehen am CDN eine Minute nach dem Purge kam noch die vorige Fassung — für Gegenproben
unmittelbar nach einem Lauf ist `raw`/API die verlässliche Quelle, nicht jsDelivr.

**Was der Tag nebenbei liefert, ist die erste Vorher/Nachher-Messung auf DEMSELBEN Runner:**

| Stufe | Lauf 12 (03:50, vor Block F) | Lauf 13 (09:50) | Lauf 14 (14:54) |
|---|---|---|---|
| t1 | 2 108 s (35,1 min) | 600 s | 599 s |
| t2 | 1 527 s (25,5 min) | 448 s | 435 s |
| t3 | 965 s (16,1 min) | 291 s | 227 s |
| **Bau gesamt** | **4 600 s = 76,7 min** | 1 339 s = 22,3 min | **1 261 s = 21,0 min** |

**−72 % auf dem Runner** — die lokale Messung (kalt t1 1 219 → 539 s, −56 %) hat die Wirkung eher
unterschätzt, weil der Runner mit 4 vCPU stärker an der Sequenzialität litt. Damit ist Jans dritte
Priorität („kurzer Verarbeitungszeitraum") nicht mehr die Bremse: der Bau kostet 21 min, die Wartezeit
bis zum Slot 0–6 h. Das ist die Rechtfertigung für F3b (drei Takte) — und die Zahlen für
`JOB_MAX_MIN_BY_TIER` sind jetzt gemessen statt hochgerechnet: Maximum über die zwei Läufe mit Block F
+ 30 % ⇒ **t1 13 · t2 10 · t3 7 min** (die Vorlage trägt provisorisch {30, 30, 20} — sie bleibt so
lange stehen, bis ein ganzer Tag gemessen ist, F3c; ein Deckel darf großzügig sein, ein Slot nicht).

⚠ **Auffällig und noch nicht behoben:** `discover` kostet auf dem Runner **107–158 s** in t1/t2 (lokal
6–15 s). Die Laufsuche läuft seit F2b parallel; was hier misst, sind Netz-Rundreisen zu DWD und CSCS
über eine langsamere Leitung. Zusammen mit V-PD-48 (Bahnen je (Quelle, Var)) ist das der nächste
Posten, wenn Stufe 1 unter 8 min soll.

**V-PD-50 (neu, benannt):** `tiers[].ageH` misst den Abstand des **jüngsten beitragenden** Laufs zum
Publikationslauf — nicht den der tragenden Quelle. In Lauf 14 steht t3 damit auf `ageH: 0`, obwohl IFS
HRES und ICON global aus 00z stammen (15 h) und AICON@12z nur zehn Stunden beisteuert. Je Quelle steht
es richtig im Manifest (`sources[].runAt`, `offsetH`); die Stufenzahl allein liest sich zu jung. Kur
wäre ein zweiter Wert („Alter der Quelle mit der weitesten Abdeckung") — eigene Etappe, weil der
Client-Vertrag (PD-C12) davon abhängt.

### 51.6 Was offen bleibt

- **V-PD-49:** Dieselbe Klasse für das Stationsprodukt ist NICHT geprüft — `build-stations.mjs`
  schreibt direkt nach `point/stations/<Lauf>/`. Dort gibt es keine Umbenennung und der Lauf gehört
  immer dem eigenen Produkt, aber ein abgebrochener Bau kann halbe Bündel hinterlassen, die kein
  Manifest nennt (die Orphan-Prüfung läuft nur über `point/<Lauf>/`). Benannt, nicht behoben — ein
  Thema, eine Phase.
- Der erste Runner-Lauf mit der Kur ist zugleich der F2-Gate-Lauf: aus seinem `tiers[].timing.totalMs`
  kommt `JOB_MAX_MIN_BY_TIER` für F3c (heute {30, 30, 20} provisorisch).
- **V-PD-51 (neu, an `2026091212` gemessen): die Laufwahl stellt Abdeckung VOR Frische, und bei
  ICON-CH1-EPS kostet das neun Stunden.** Am Katalog gemessen (12.09., 16:05 UTC): der 03z-Lauf trägt
  16 Schritte bis +45 h, die Läufe 06z/09z/**12z** je 12 Schritte bis +33 h (⚠⁵, §41). Die Leiter
  nimmt deshalb 03z — im Cube 13 statt 12 Stundenwerte, also **ein einziges Drei-Stunden-Fenster mehr,
  bezahlt mit neun Stunden Vorlaufzeit in allen übrigen**. Für ein Band, dessen Stunden 33–48 ohnehin
  ICON-D2, ICON-EU und IFS tragen, ist das vermutlich der falsche Tausch; die Kur wäre eine Schranke
  in `chooseRun` („nimm den frischesten Lauf, dessen Abdeckung höchstens N Schritte unter der besten
  liegt"). Sie ändert Werte ⇒ Jans Entscheidung, eigene Etappe mit Vorher/Nachher-Messung.
  ⚠ **Der Befund ist kleiner, als er zuerst aussah, und das gehört dazu:** eine Stunde später (Lauf 15,
  15:54 UTC) hat dieselbe Leiter den frischen **12z** genommen (12 Schritte). Der Rückgriff auf 03z
  betrifft also das Fenster, in dem der jüngste CH1-Lauf noch nicht fertig ist — dort gewinnt der
  45-h-Lauf gegen die 33-h-Läufe. Kein Dauerzustand, aber in jedem Lauf kurz nach einem CH1-Zyklus.
- Nebenbefund derselben Messung, ohne Handlungsbedarf: **ICON-EU ist nur bis +30 h stündlich** (Stunde
  031 gibt es nicht, am Verzeichnis geprüft; danach 3-stündlich). Deshalb trägt es in der stündlichen
  Stufe 1 mit Versatz 3 h genau 28 der 49 Schritte — die Zahl ist erklärt, nicht defekt.
