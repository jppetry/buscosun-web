# audit/hagel.md — Diagnose: Hagel als 2D-Kartenlayer

> Stand: 2026-08-05. Phase **HA1** („Hagel"). Auftrag Jan: „aus `opendata.dwd.de/weather/` Hagel
> erstellen, der auch als zusätzlicher Layer in der 2D-Karte einschaltbar ist."
> Diagnose **vor** Code (CLAUDE.md §Harte Regeln). Alle Zahlen unten sind an diesem Abend
> (2026-08-05, ~21:30 UTC) **selbst an den Dateien gemessen** — die Vorrecherche in
> `docs/DATA_SOURCES.md` §5 war der Ausgangspunkt, nicht die Antwort.

---

## 1. Die Ausgangslage: vier Kandidaten, zwei überleben

`docs/DATA_SOURCES.md` §5 empfiehlt **H1 (MeteoSchweiz POH/MESHS) für CH** und
**H2 (DWD RADVOR-RE Bit 13) für DE**. Ich habe alle Kandidaten neu gemessen — und komme bei DE zu
einem **anderen** Ergebnis als die Vorrecherche.

| Kandidat | gemessen | Urteil |
|---|---|---|
| **CH POH + MESHS** (`ch.meteoschweiz.ogd-radar-hail`) | ✅ vollständig belegt, s. §2 | **gebaut** |
| **DE KONRAD3D Hagel-Attribute** (`radar/konrad3d/`) | ✅ vollständig belegt, s. §3 | **gebaut** |
| DE RADVOR-RE Bit 13 (`radar/radvor/re/`) | ⚠️ Flag existiert, Georeferenz nicht belegbar, s. §4 | **zurückgestellt** (V-152) |
| DE HyMeC-Klassen (`composite/hymecng/`) | ⚠️ Klassenlegende unlesbar, s. §5 | **zurückgestellt** (F-13 bleibt offen) |
| DE VII (`composite/vii/`) | ✅ ist **VIL**, aber ein Indikator, kein Hagelprodukt, s. §6 | **nicht als „Hagel"** |

**Die Leitfrage war nicht „was sieht am besten aus", sondern „was darf ‚Hagel‘ heißen".** Ein Layer,
der Hagel behauptet, ohne dass Bedeutung **und** Ortsbezug belegt sind, ist derselbe Fehlertyp wie
die erfundenen „78 %" (V-18) — nur im sicherheitsrelevanten Bereich (D-04, D-19).

---

## 2. CH — MeteoSchweiz POH + MESHS ✅ (Primärquelle, das Alleinstellungsmerkmal)

STAC-Tagesitem `…/collections/ch.meteoschweiz.ogd-radar-hail/items/20260805-ch` → HTTP 200,
**518 Assets**: **259 × `bzc…h5`** und **259 × `mzc…h5`** ⇒ 5-Minuten-Takt, Namensmuster
`bzc262172130vl.845.h5` / `mzc262172130vl.850.h5`.

**Aus den Dateien selbst gelesen** (nicht aus der Doku übernommen):

| | POH (`bzc`) | MESHS (`mzc`) |
|---|---|---|
| Datei | 24 704 B | 23 748 B |
| `dataset1/data1/what/quantity` | **`POH`** | **`MESH`** |
| `unit` | *(leer)* | **`mm`** ⚠️ |
| `gain` / `offset` | 1 / 0 | 1 / 0 |
| `nodata` / `undetect` | `NaN` / 0 | `NaN` / 0 |
| Wertebereich in der Probe | **0 … 0,81** (48 verschiedene Werte) | 0 (kein Hagel zur Messzeit) |
| `dataset1/what/prodname` | `CHBZC` | `CHMZC` |
| Gitter | `xsize=710 · ysize=640 · xscale/yscale=1000` (1 km) | identisch |
| Ecken (`/where`) | UL 2,6894/49,3744 · UR 12,4623/49,3633 · LR 11,9556/43,6190 · LL 3,1688/43,6290 | identisch |
| Projektion | `+proj=somerc … +ellps=bessel` — **Ecken liegen bereits in WGS84 vor** | identisch |
| `/what/date`,`/time` | 20260805 / 213000 | 20260805 / 213000 |

**Zwei Korrekturen an `docs/DATA_SOURCES.md` §5.1 H1:**
1. **MESHS trägt `unit = mm`, nicht cm.** Die Doku sagt „maximal erwartete Hagelkorngröße in **cm**".
   Wer das ungeprüft übernimmt, zeigt Korngrößen um den **Faktor 10 zu groß** — bei einem
   Hagel-Layer der schlimmstmögliche Fehler.
2. **POH ist ein Anteil 0…1, keine Prozentzahl.** Für die Anzeige ist ×100 nötig; ungefiltert stünde
   „0,81 %" statt „81 %" auf der Karte.

**Saisonalität** (Doku: nur 1. April – 30. September) — heute ist der 5. August, also **in der
Saison**; die Saisonlücke ist nicht messbar, wird aber im UI ausgewiesen (§7).

**Reuse:** `src/sources/meteoSwissRadar.ts` macht für `rzc` **exakt dasselbe** — STAC-Tagesitem,
Asset-Auswahl, `jsfive`, Ecken aus `/where`. Der neue Transport ist eine Kopie dieses Musters mit
zwei Produkten statt einem.

---

## 3. DE — KONRAD3D-Hagelattribute ✅ (Primärquelle Deutschland)

Aus `KONRAD3D_20260805T213000.xml` (42 Zellen, 2 mit `hail_flag > 0`), **verbatim** aus einer
Hagelzelle:

```xml
<intensity><hail_flag>1</hail_flag> …</intensity>
<hymec>
  <maximum_near_ground_class>9</maximum_near_ground_class>
  <echo_top_hail unit="m">6880</echo_top_hail>
  <echo_bottom_hail unit="m">2348</echo_bottom_hail>
  <echo_top_large_hail unit="m">-1000000000</echo_top_large_hail>   ← Sentinel = kein Großhagel
  <area_rain_hail unit="km^2">47.125000</area_rain_hail>
  <area_hail unit="km^2">8.937500</area_hail>
  <area_large_hail unit="km^2">0.000000</area_large_hail>
  <volume_hail unit="km^3">22.671875000</volume_hail>
</hymec>
```

**Warum das die richtige DE-Quelle ist:**

- **Bedeutung ist belegt**, nicht erraten: Tag-Namen und Einheiten stehen in der Datei; das Schema
  wurde in der Spec-Session vollständig ausgelesen (F-3 geschlossen).
- **Ortsbezug ist belegt**: alle Koordinaten liegen in **WGS84-Grad** vor — keine Reprojektion,
  keine ungeprüften Eckkoordinaten (genau das Problem, an dem RE scheitert, §4).
- **Es gibt eine Größenaussage**: `area_hail` vs. **`area_large_hail`** trennt Hagel von Großhagel,
  `hail_flag` 0/1/2 stuft ab. Das ist mehr als ein reines Ja/Nein.
- **Transport existiert bereits** — `src/sources/dwdKonrad3d.ts` aus Phase Z1 inklusive
  60-s-Listing-Cache; der Hagel-Layer teilt sich den Abruf mit den Zellbahnen, statt eine zweite
  0,6-MB-Last zu erzeugen.

**Abgrenzung zum Zellbahnen-Layer (Funktionserhalt + kein Doppel):** „Zellbahnen" beantwortet
*wohin zieht die Zelle*, „Hagel" beantwortet *wo ist Hagel und wie groß*. Der Hagel-Layer zeichnet
**nur** Zellen mit `hail_flag > 0`, in einer eigenen Palette, **ohne** Zugspur und **ohne** Trichter.

---

## 4. DE RADVOR-RE Bit 13 ⚠️ — zurückgestellt, mit Begründung

`radar/radvor/re/` ist live: **14 400 Dateien = 576 Läufe × 25 Frames** (0…+120 min, 5-min-Takt),
je ~20 KB gzip. Jüngster Lauf `2608052130`. Header verbatim:

```
RE052130100000826BY   1620201VS 5SW  P42001HPR E-03INT  60GP 900x 900VV 000MF 00000008QN 016MS103<…17 Radare…>
```

**Flag-Statistik über alle 810 000 Zellen des `_000`-Frames — selbst gezählt:**

| Maske | Zellen | Anteil | Restwert |
|---|---|---|---|
| `0x1000` (**Bit 13**, Kandidat „Hagelflag") | **8** | 0,001 % | 0 |
| `0x2000` (Bit 14) | 727 544 | 89,8 % | konstant 2500 ⇒ `0x29C4` = Fehlkennung |
| `0x4000` (Bit 15) | 0 | 0 % | — |
| `0x8000` (Bit 16) | 550 182 | 67,9 % | konstant 2500 (Clutter/außerhalb) |
| kein Flag | 82 448 | 10,2 % | **max 1000** |

**Zwei Befunde daraus:**

1. **Die Doku-Angabe `PR E-00` ist falsch — gemessen ist `PR E-03`.** Das ist keine Kleinigkeit,
   sondern der *Beweis* für die Deutung „0…1000 = Anteil festen Niederschlags 0…1", die
   `docs/DATA_SOURCES.md` §5.1 H2 nur als **abgeleitet** kennzeichnet: E-03 × max. 1000 = exakt 1,000.
2. **Bit 13 verhält sich wie ein Flag** (8 von 810 000 Zellen, Wertanteil durchgehend 0) — das
   passt zur Spezifikation, beweist aber nicht, dass es *Hagel* markiert.

**Der Blocker ist nicht die Bedeutung, sondern der Ortsbezug.** RE liegt auf dem
**900×900-Legacy-Gitter**, nicht auf DE1200. Das Repo kennt dieses Gitter nicht: `radolan.ts` führt
nur `DE1200_CORNERS` (`:48-55`); `fetchRyLatest` (`:342`) lädt zwar RY im selben 900×900-Format,
wird aber genau deshalb **nirgends gerendert**. Für die Eckkoordinaten fand ich heute **keine
zitierfähige Quelle**:

- Die amtliche Kompositformatbeschreibung (v2.6, 14.01.2025) ist als PDF abrufbar (2,74 MB), ihr
  Textlayer ist jedoch mit Font-Subsetting kodiert — die 61 inflateten Streams enthalten keine
  lesbaren Koordinaten (`Hagelflag`, `Eckkoordinate`, `46,95`: je **0 Treffer**).
- Eine Gegenprobe an zwei unabhängigen DWD-Produkten **bestätigt die Verortung nicht**: Zum selben
  Termin (21:30 UTC) meldet KONRAD3D zwei Hagelzellen bei 10,713/47,477 und 10,068/48,115; die
  nächstgelegene Bit-13-Zelle liegt unter der angenommenen Georeferenz **82,5 km** bzw. **157,8 km**
  entfernt.

Bei 8 Pixeln und 2 Zellen ist das kein Beweis für einen Fehler — aber eben auch **keine Bestätigung**.
Ein falsch verorteter **Hagel**-Layer ist schlimmer als keiner. **Entscheidung: RE wird nicht
gebaut, sondern als `V-152` mit benannter Vorbedingung registriert** (Eckkoordinaten aus einer
zitierfähigen Quelle **plus** räumliche Übereinstimmung mit KONRAD3D an einem Hageltag).

---

## 5. DE HyMeC ⚠️ — F-13 bleibt offen

`composite/hymecng/composite_HymecNG_20260805_2130_000-hd5` (42 809 B, 577 Dateien = 48 h):

- Gitter `DWD/DE1200_WGS84`, `xsize=1100 · ysize=1200`, Ecken **zeichengleich mit `DE1200_CORNERS`**
  im Repo ⇒ **null Geometrieaufwand**. Das wäre der billigste Weg — wenn die Klassen lesbar wären.
- `dataset1/data1/what`: `quantity=CLASS`, `gain=1`, `offset=0`, **`nodata=255`, `undetect=254`**.
- `dataset1/data1/legend`: existiert, `shape=[11]`, Attribut **`levels=11`** — und ist ein
  **HDF5-Compound-Typ mit deflate**. `jsfive` (die Repo-Bibliothek) bricht mit
  *„Compound type not yet implemented!"* ab; die Klassennamen stehen komprimiert in der Datei und
  sind auch als Rohbytes nicht lesbar.
- Belegte Klassenverteilung der Probe: `254`×650 437 · `255`×622 710 · `3`×29 420 · `2`×12 303 ·
  `0`×2 788 · `1`×2 306 · **`9`×36**.

**Ein Indiz, das ausdrücklich kein Beweis ist:** KONRAD3D führt für die Hagelzelle
`maximum_near_ground_class = 9` — und `9` ist genau die seltenste HyMeC-Klasse (36 Pixel). Das legt
nahe, dass 9 die Hagelklasse ist. **Nach D-04 reicht ein Indiz nicht**, um einen Layer „Hagel" zu
nennen. F-13 bleibt offen; Vorbedingung und Weg stehen in **V-153**.

---

## 6. DE VII ⚠️ — ist VIL und bleibt ein Indikator

`composite/vii/composite_VII_20260805_2125-hd5` (71 595 B): `quantity` = **`VIL`** (nicht „VII"),
`gain=0,015259487586406849`, `offset=−0,015259…`, `nodata=65535`, `undetect=0`, DE1200-Gitter,
304 verschiedene Werte. Damit ist der Ausschluss „Semantik unbelegt" (§5.1 H3) **aufgehoben** — die
Größe steht in der Datei.

**Trotzdem kein Hagel-Layer:** VIL ist der vertikal integrierte Flüssigwassergehalt, ein
*Hagel-Proxy*, kein Hagelprodukt. Als „Hagel" beschriftet wäre es unehrlich; als eigener
Experten-Layer „Eisgehalt/VIL" ist es sinnvoll — aber ein **anderes Thema** und damit eine andere
Phase (`CLAUDE.md`: ein Thema = eine Phase). Registriert als **V-154**.

---

## 7. Was der Layer zeigt — und was er über sich sagt (D-04 / D-19, gate-blockierend)

| Ebene | Inhalt | Formulierung |
|---|---|---|
| **Fläche** (Schweizer Radarverbund) | **MESHS** (erwartete max. Korngröße, **mm**) und **POH** (Hagelwahrscheinlichkeit, Anteil) als Raster, umschaltbar | „MeteoSchweiz MESHS · erwartete maximale Korngröße" / „POH · Hagelwahrscheinlichkeit" |
| **Zellen** (deutscher Radarverbund) | KONRAD3D-Zellen mit `hail_flag > 0` als Fläche; Detailkarte mit Hagelfläche, Großhagelfläche, Hagel-Echotop | „Radar erkennt Hagel in der Zelle" · „Hinweis auf **Groß**hagel", wenn `area_large_hail > 0` |
| **AT** | keine eigene Quelle — und das wird gesagt | „Österreich hat keine eigene offene Hagelquelle (weder GeoSphere noch ALDIS) — im **Osten** daher keine Abdeckung. Das heißt **nicht**, dass es dort nicht hagelt." |

⚠️ **Korrektur an meiner eigenen ersten Formulierung, an der Messung entstanden:** Die Ländertabelle
oben hieß zunächst „CH = MESHS/POH, DE = KONRAD3D". Das ist falsch — bei der UI-Verifikation lag das
**stärkste POH-Signal des Abends bei 10,07 °E / 47,93 °N, also in Bayern** (36 %), rund 135 km vom
Albis-Radar. Beide Produkte sind an **Radarverbünde** gebunden, nicht an Staatsgrenzen: der
Schweizer Verbund reicht nach Süddeutschland und Vorarlberg, der deutsche über die Alpennordseite
(dieselbe Lehre wie bei den Zellbahnen, `audit/zellbahnen.md` §2). Der Layer sagt jetzt
„Fläche/Zellen" mit dem jeweiligen Verbund statt „CH/DE" — sonst behauptete die Legende eine
Landeszuordnung, die die Daten nicht haben. Nebenbei ein Qualitätsindiz: die KONRAD3D-Hagelzelle
lag bei 10,82/47,50, das POH-Maximum bei 10,07/47,93 — **zwei unabhängige nationale Radarprodukte
zeigen dasselbe Konvektionsgebiet** (anders als bei RE Bit 13, §4).

Weitere Leitplanken:

1. **Zwei Länder, zwei Produkte, zwei Aussagen** — die Legende benennt beides getrennt; es wird
   **nichts** interpoliert und nichts über die Grenze fortgeschrieben.
2. **Kein Warnprodukt.** Fester Hinweis wie bei Z1: „kein amtliches Warnprodukt, kein Warnersatz —
   maßgeblich sind die Warnungen von DWD und MeteoSchweiz."
3. **Saison CH:** Außerhalb 1. April – 30. September existieren die Dateien ohne Inhalt — der Layer
   sagt „außerhalb der Hagelsaison (1. April – 30. September)" statt „kein Hagel".
4. **Nullwerte sind Ergebnisse:** „aktuell kein Hagel erkannt" ist der Normalfall und **kein** Fehler
   (dieselbe Lehre wie F1/F3/F4/Z1). Heute Abend: POH max **0,81**, MESHS flächendeckend **0**.
5. **Datenalter** aus der Messzeit der Datei (`/what/date`+`time` bzw. KONRAD3D-Referenzzeit), nie
   aus der Abrufzeit (V-19).

---

## 8. Architektur

| Datei | Rolle | Reinheit |
|---|---|---|
| `src/sources/meteoSwissHail.ts` | STAC-Tagesitem → jüngstes `bzc` (POH) + `mzc` (MESHS), `jsfive`-Decode, Ecken aus `/where`, Saisonprüfung | I/O |
| `src/radar/hailField.ts` | Paletten + Raster→RGBA, Schwellen, KONRAD3D→GeoJSON der Hagelzellen, Textbausteine | rein, headless |
| `MapView.tsx` | additive Seams: `LayerKey 'hail'`, **`image`-Source + `raster`-Layer** (CH), GeoJSON `fill`+`line` (DE), Produktumschalter, Legende, Popup | — |
| `scripts/verify-hail.mjs` | Verifier gegen **echte** Fixtures (bzc, mzc, KONRAD3D) | Node strip-types |

**Rendering bewusst ohne WebGL:** Das CH-Gitter ist `somerc` — ein Trapez in lon/lat (obere Kante
2,69…12,46 °E, untere 3,17…11,96 °E). Eine achsparallele `uvBounds`-Box, wie sie `ScalarLayer`
verlangt (`ScalarLayer.ts:92-98`), läge an den Rändern zweistellige Kilometer daneben. MapLibres
**`image`-Source nimmt vier Eckkoordinaten** und warpt selbst — damit ist die Darstellung korrekt
**und** die Shader-/WebGL-STOPP-Zone (`CLAUDE.md`) bleibt unberührt. Muster im Repo vorhanden:
`GlobeMap.tsx:107`, `ThermalMap.tsx:129`.

**Kein Dependency-Zuwachs** (`jsfive` ist Bestandsabhängigkeit, in `meteoSwissRadar.ts` und
`geosphereIncaGrid.ts` bereits im Einsatz), **keine** Änderung an `netlify.toml`, Edge Functions,
Warm-Crons oder Manifesten. `data.geo.admin.ch` liefert `Access-Control-Allow-Origin: *`
(`docs/DATA_SOURCES.md` §1, gemessen) ⇒ **kein Proxy nötig**.

---

## 9. Verifikationsplan

- `npm run verify:hail` — Decode beider CH-Produkte aus **echten** Fixtures (Quantity/Einheit/Gain/
  Ecken/NaN-Behandlung), POH→%-Umrechnung, **MESHS bleibt mm** (Regressionssperre gegen den
  cm-Fehler), Palettenmonotonie, KONRAD3D→Hagelzellen-GeoJSON inkl. Sentinel-Filter, Leerzustand.
  **Rot-Test-Pflicht** (V-99).
- `npm run typecheck` grün, `npm run verify:cells` unverändert 64/64 (gemeinsamer KONRAD3D-Pfad).
- Chrome DevTools MCP: Desktop 1440×900 + iPhone 12 Pro 390×844 — Layer an/aus, Produktumschalter,
  Legende, AT-Lückentext, Konsole sauber, Netzwerk-Beleg „vor Aktivierung 0 Requests".

**Gate: GHA1 in `checklist.md`.**
