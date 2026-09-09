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
| **E-19** | Die Punkt-Slots (:10 der Stunden 02/08/14/20) laufen **in das Publish-Fenster der Kartenlinie** (:30 derselben Stunden). Ein Lauf braucht gemessen 20–40 min, landet also regelmäßig genau dort — und ein Force-Push der Kartenlinie löscht, was dazwischen ankommt (§27). | **Slots auf `10 1,7,13,19` verschieben** — gleiche Modelllage, keine Überschneidung mit einem Repack-Slot. Nicht selbst geändert, weil die Wahl an ECMWF-Bereitstellungszeiten hängt, die ich nicht gemessen habe; die Nachprüfung nach dem Push (§27.2) fängt den Schaden bis dahin auf |

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
