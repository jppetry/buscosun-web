# buscosun Fusion — Vollform ohne Archiv

> **Plan freigegeben am 2026-09-18** (Planungssession im Plan-Modus, kein Code; Phase FI, Etappen AP13–AP17).
> **Jans Entscheidungen E-F-13…22 vom 18.09.** stehen in §6.1, mit den Bedingungen zu E-F-15 und E-F-19.
> Die Korrektur zu V-FI-76 (POI trägt Wetter- und Schneespalten) ist eingearbeitet (§1.6, §2.5).
> Ein zweiter Prüfer hat V-FI-66/69/79 am Code und die Slot-Größen im lokalen Archiv-Klon bestätigt.
> Der Text ist der Plan im Wortlaut. Findings zählen ab **V-FI-62**, Entscheidungen ab **E-F-13**,
> Arbeitspakete ab **AP13**. Alle Zahlen sind gemessen (Quelle genannt), als `set` gesetzt oder als **R**
> (gerechnet aus Messungen) markiert. Nichts ist fortgeschrieben (BW-1).

## Kontext

Die Bestandsaufnahme vom 18.09. gegen `ABLAUFPLAENE.md` ergab: **gebaut ≈ 85 %, wirksam ≈ 65 %** (ohne
festgehaltene Zählregel). Sechs Lücken lassen sich ohne Archiv schließen:
1. d_water,
2. Profilfelder in t2/t3,
3. Nachbarn über den Chunk-Rand,
4. κ,
5. z0 der Modellseite,
6. das Kalibrier-Werkzeug.

Alles andere ist Kalibrierung (**AP10**) und wird hier nicht neu entworfen: Σ-gewichtete Fusion und Bias-Korrektur
(PAP 2), L_d/L_h/κ-Stärke (PAP 3), φ (PAP 4), A/A_uhi (PAP 5), σ_sys/c/Konfidenz-Abschläge (PAP 6).

Diese Session hat gemessen:
- lebender Cube (Index `e14eced`, 18.09. 13:54 UTC),
- DWD-, ECMWF- und NOAA-Verzeichnisse,
- WorldCover-Spiegel,
- Archiv-Slots,
- Verifier.

Der Plan macht aus den sechs Lücken die Pakete AP13–AP17. Ein Gegenlese-Agent hat den Entwurf gegen den Code
geprüft; seine Befunde sind eingearbeitet, u. a. V-FI-79 und die Regeln in §2.1–§2.5.

Zwei Ergebnisse weichen vom Vorschlag des 18.09. ab:
- **U-15 wandert in die Laufzeit.** Das Profil kommt aus der Säule der nächsten Zelle, über eine Portierung der
  t1-Funktion. Damit bleibt nur V-FI-58 als Producer-Stufe.
- **Der Halo wird durch einen Nachbar-Chunk-Abruf im Leser ersetzt.** Dazu speichert das Archiv den 2×2-Block
  (Entscheidung E-F-19). Erst damit ist der Randbefund überhaupt messbar.

---

## §0 Vorprüfung — gemessene Zahlen

Stand des Baums: sauber bis auf das unversionierte `prompt-vollform-plan.md`. §9.13 ist frei. Die AP9-Dateien
(`scripts/punktarchiv/**`) sind unberührt: es gibt weder `score-archive.mjs` noch `fit-calib.mjs`.

| Größe | Wert | Quelle |
|---|---|---|
| Läufe im Index | t1 `2026091812` (208 Chunks, 89,0 MB); t2 `2026091806` (56, 9,30 MB); t3 `2026091800` (12, 1,92 MB) | `point/index.json` @main, 18.09. 13:54 UTC |
| Druckflächen je Stufe (Manifest) | t2: 925/850/700 aus ICON-EU, IFS, AIFS (24 Schritte). t3: 925/850/700 aus IFS, AIFS (36 Schritte, E-E-4 wirkt). `profile: null` in beiden | `run.json` t2/t3 |
| Belegung t2/t3 | t925, t850, t700, ps und hModEff in **100 %** der Zellschritte (t2 293 304, t3 72 324); gammaEff in 0 % | Sonde, alle 68 Chunks dekodiert |
| Fläche unter Modellgrund (ps < p) | t2: 925 bei 11,0 %, 850 bei 4,4 %, 700 bei 0 %. t3: 11,5 / 4,8 / 0 %. t1: 8,4 / 1,4 / 0 % | ebd. (t1: 24 Chunks) |
| **U-15-Regel `t850 > t925`** | t2 nachts **0,7 %** / tags 0,1 %; t3 2,7 / 3,2 %; t1 0,0 / 0,0 % | ebd.; Nacht = Ortssonnenzeit 21–5 h, Tag = 10–16 h |
| **Bodenregel `t925 > t2m`** (925 über Grund) | t2 nachts **27,1 %** / tags **0,0 %**; t3 57,0 / 0,2 %; t1 50,1 / 0,0 % | ebd. |
| `t700 > t850` | 0 % in allen Stufen | ebd. |
| Hypsometrische minus Standardhöhe (p10 / p50 / p90) | t2: 925 +47 / **+100** / +133 m · 850 +48 / +102 / +142 · 700 +51 / +124 / +186. t3: 925 +16 / +65 / +88 · 700 +49 / +100 / +138 | ebd. (Rd/g · T̄ · ln(ps/p) ab hModEff) |
| **Schattenvergleich t1** (Modelllevel-Profil gegen Druckflächen-Ersatz) | Rohregel (ΔT > 0,2 K): Treffer 46,3 %, Fehlalarm 24,1 % (n 177 440); Γ(Boden → unterste Fläche ≥ 150 m) gegen gammaEff r **0,80**, MAE 2,58 K/km | ebd., t1-Stichprobe |
| **Vorab-Regel** (Nachbarpaare, ΔT ≥ 0,5 K, ps − p ≥ 10 hPa, je Zelle; die Portierung in §2.1 zählt AP15 neu) | Inversionsanteil nachts / tags: t2 **21,3 % / 0,0 %**, t3 51,3 / 2,0 %, t1 32,9 / 0,0 % (fast nur bodennah). Dicke p10 / p50 / p90: 175 / 429 / 702 m (t2); dTInv 0,7 / 1,8 / 3,8 K. Γ über der Obergrenze fehlt in 115 (t2) bzw. 218 (t3) Fällen, dort gilt die Standard-Lapse. t1-Schatten: Treffer **34,6 %**, Fehlalarm **21,0 %**; Γ ohne Inversion MAE **1,84 K/km** (n 189 871) | ebd., zweiter Lauf |
| Ebenenbytes je Chunk | t1: Profil-4 26,9 KB (6,1 %), t850+t700 22,6 KB (5,1 %), Quantile 24,4 %. t2: t850+t700 10,6 KB (6,3 %). t3: 12,4 KB (8,0 %). Nutzlast Ø t1 442 / t2 167 / t3 156 KB | Verzeichnis (Range 0–4095, identity) von 13/14/12 Chunks |
| **Chunk-Rand** bei 405 Archivpunkten (2×2-Block) | t1 51 (**12,6 %**), t2 57 (14,1 %), t3 34 (8,4 %), **irgendeine Stufe 97 (24,0 %)**; je 1 oder 3 Zusatz-Chunks (3 nur an Ecken: t1 2, t2 3, t3 1 Punkt). Gleichverteilt (200 000 Punkte): 11,8 / 11,4 / 10,9 / 24,5 % — **korrigiert in AP14** (analytisch 11,9 / 11,5 / 10,9 %; die erste Sonde hatte 12,9 / 11,5 / 11,0 / 25,4 % aus einem Gleitkomma-LCG, der über 2^53 Stellen verliert). Skript: `audit/fusion-vollform/chunk-border.mjs` | `cellOf` + `blockOffsets` |
| Chunk-Rand an den 10 Orten | Graz t1+t2, Berlin t2+t3 = 4 von 30 Paaren (13 %) — wie §9.7.1 | ebd. |
| Nachbar-Chunk am Edge | alle **HIT** (Publisher-Warm-up wirkt). Desktop ungedrosselt: t1 565 KB 55–63 ms; t2 172–203 KB 27–39 ms; t3 232 KB 30–40 ms | Graz/Berlin, @main, je 3× |
| z0 als GRIB-Feld | ICON-D2 `z0` 0–48 h, ICON-EU `Z0` 0–120 h, ICON global `Z0` 0–180 h — jeweils je Schritt, ≈ 0,97 MB bz2 je Datei. **IFS Open Data: kein Rauhigkeitsfeld** (Parameterliste 0/24/144 h; nur `lsm/sdor/slor` bei 0 h). GFS `SFCR` vorhanden, GFS ist aber keine Cube-Quelle. `fr_lake/fr_land` bei ICON zeitinvariant | DWD-Verzeichnisse, `data.ecmwf.int` Index, GFS `.idx` |
| **Zeitverhalten ICON-z0** (Lauf 18.09. 00z) | Land: ändert sich um > 1 % an 0,1 / 0,5 / 2,0 % der Punkte (ICON-D2, +12/+24/+48 h), Betrag \|ln\| ≈ 0,02; ICON-EU bis +120 h 10,8 %. **Wasser: 79–99 %** der Punkte ändern sich je Schritt (Charnock) | GRIB dekodiert, `decodeGrib2` |
| **d_water** (42 Orte: 10 Harnisch-Orte + jeder 13. Archivpunkt) | Nächster Wasserkörper ≥ 10 px liegt an **42/42** Orten in den Kacheln, die z0 schon lädt (gleich der vollen 20-km-Suche); max 8,6 km. Die volle 20-km-Box bräuchte an 29/42 Orten Zusatzkacheln (bis 9 statt 1–4). Voll-BFS 126–428 ms je Ort (Node) ⇒ zu teuer | WorldCover-Spiegel `cc3ce55`, 219 Abrufe, 21,8 MB |
| **κ-Machbarkeit** | Abdeckung der Nachbarzell-Boxen aus den z0-Kacheln: t1 42/42 (min 0,98), t2 42/42, t3 nur 22/42 ≥ 0,5. κ-Spreizung max/min ≥ 1,5 (bei λ = 0,5): t1 24/42, t2 26/42. Rechnung 3,8 ms je Ort (Punkt + 12 Boxen, Node) | ebd., 12,6 MB |
| Archiv | 4 Slots (14.–17.09.), **alle Schema 1**. 243/243/410/410 Punkte, 10,6/10,6/18,5/18,5 MB gz. Würfelteil 17.09.: 10,33 MB roh / **2,45 MB gz** (nur die nächste Zelle, alle belegten Ebenen) | `C:\dev\buscosun-archiv` |
| Verifier (18.09., einzeln) | `verify:pv-cube` 246/246 · `verify:pv-fusion` 229/229 · `verify:punktarchiv` 103/103 · `verify:point-client` 136/136 | PowerShell, nacheinander |
| Budget | eagerJs 107,9 · totalJs **1 427,6 / 1 430** (2,4 KB Luft) | §9.16.5 (18.09. 12:05 UTC), **nicht neu gebaut** |
| `calib.json` | Schema 1, 20 Einträge, alle `null` außer `phi.shape`/`fixed`. **Kein Client liest die Datei**; der Cube-Pfad rechnet mit Code-Konstanten | `src/point/calibration.ts:62-135`, Agent-Befund |

---

## §1 Analyse je Lücke

### 1.1 d_water (PAP 1)

- **Verbraucher: keiner.**
  - `ABLAUFPLAENE.md` nennt d_water nur im Terrain-Stack (PAP 1 E1).
  - PAP 5 nimmt T, clct, v10, TPI, SVF, imperv und z0; das Feldglossar kennt d_water nicht.
  - Wasser wirkt heute schon über z0 (Klasse 80, 0,0002 m).
- d_water ist damit **reine Ausgabe** (v2 `point.terrain.dWater`) und ein **Schichtungsmerkmal für AP9/AP10**
  (Seeufer-Stationen: Bodensee, Genfersee, Kiel, Grimsel), bis AP10 einen Term benennt.
  Kandidaten, die hier nicht entworfen werden: gedämpfte Tagesamplitude am See, Land-See-Wind.
- Im Code gibt es nur die Konstanten `DWATER_MAX_M = 20_000` und `WORLDCOVER_WATER = 80` (`terrainPoint.ts:48,70`).
- Das Klassenfeld ist privat in `loadZ0AtPoint` (`z0Point.ts:209`).

### 1.2 Profilfelder in t2/t3 (PAP 2 → PAP 4)

- Die Daten liegen seit E-E-4 vollständig vor: 925/850/700 in t2 und t3 zu 100 %.
- Gelesen werden sie nur für das Flag `belowGround925` (`cubePoint.ts:310-316`) — **V-FI-63**.
- `vertical.ts` nimmt `{gammaEff, zBase, zInv, dTInv}` gleich welcher Herkunft. Ein Ersatzprofil braucht dort
  keine Änderung.
- Die in U-15 geplante Regel `t850 > t925` erkennt fast nichts (0,7 % der t2-Nächte). Die
  Bodenregel mit t2m an hModEff trennt Nacht und Tag deutlich (27,1 % gegen 0,0 %) — **V-FI-62**.
- Die Standardatmosphäre setzt die Flächen im Median 100 m zu tief an (t2) — **V-FI-64**.
- Güte des Ersatzes (empfohlene Regel), gemessen am t1-Schatten: Γ ohne Inversion MAE 1,84 K/km; Inversion
  erkannt in 34,6 % der Fälle bei 21,0 % Fehlalarm.
  - Flache Strahlungsinversionen unter der 925-Fläche erscheinen nur als dicke Schicht Boden → 925.
  - Folge: Γ_inv wird unterschätzt, die Korrektur ist konservativ — **V-FI-78**.
- **(a) Producer oder (b) Laufzeit?**
  - Beide rechnen aus denselben Cube-Ebenen: dem Quellenmittel von t925/t850/t700, t2m, ps und hModEff.
  - (b) braucht kein Producer-Gate und kostet 0 Byte.
  - (b) lässt sich im Archiv **mit Varianten nachrechnen** (Schwellen fitbar), weil die Eingaben der nächsten
    Zelle int-kodiert im Slot liegen. Das gilt nur, wenn (b) aus der nächsten Zelle ableitet, nicht aus dem
    Blockmittel — der Sammler speichert keine Nachbarn.
  - (a) schriebe +≈ 0,7 MB je t2-Lauf und +≈ 0,24 MB je t3-Lauf (**R** aus 26,9 KB je t1-Chunk × Schrittzahl) und
    bräuchte einen Manifest-Bump.
  - Dekodierkosten von (b):
    - Voreinstellung (ganze Dateien): 0 ms, weil alle 57 Ebenen ohnehin dekodiert werden.
    - Mit Ebenen-Bereichen (heute aus, V-FI-42): +t850/t700 = +10,6 KB (t2) bzw. +12,4 KB (t3) je Chunk.
    - V-FI-44 (Schema-6-Umordnung) muss t850/t700 dann in die Antwortmenge nehmen.
  - ⇒ **Empfehlung (b)** (E-F-13).

### 1.3 Nachbarn über den Chunk-Rand (PAP 3)

- Neu gezählt: t1 12,6 %, t2 14,1 %, t3 8,4 %, irgendeine Stufe 24,0 % der 405 Punkte.
  - Die „12 %" des Plans stimmen für t1.
  - Die „23 %" des Plans waren der 3×3-Ring, der nicht gebaut ist.
- Das Archiv speichert **nur die nächste Zelle** (`collect.mjs:229`, ohne `neighbours`). Folgen (**V-FI-69**):
  - PAP 3 lässt sich nicht nachrechnen.
  - „AP9s Randbefund" kann so nicht entstehen.
  - L_d, L_h und κ sind aus dem Archiv nicht fitbar.
- **Halo (a):**
  - +12,9 % Zellen, also +11,5 MB je t1-Lauf (**R** aus 89,0 MB).
  - Schema 6 für jeden Leser, auch Sammler und Archiv (AP9-Dateien).
  - Gegen R10 (Repo 307 MiB) nicht vertretbar.
- **Leser (b):**
  - Nachbar-Chunk desselben Laufs: am Edge warm, Desktop +28–63 ms, +172–565 KB je Randstufe, nur für 24 % der Orte.
  - Als späte Ausgabe lässt er die erste Darstellung unberührt.
  - Die Werte ändern sich in der Nachlieferung (Gewichte). Das ist dieselbe Semantik wie bei z0 heute und
    vertretbar, weil die erste Darstellung zählt (Jan, 18.09.). Das Flag `chunkBorderTruncated` fällt in der
    Nachlieferung weg.
- ⇒ **Empfehlung (b)**, dazu im Archiv den vollständigen 2×2-Block (E-F-18/19). Dann liefert der Nachlauf den
  Randbefund gepaart (beschnitten gegen vollständig), statt ihn abzuwarten.

### 1.4 κ Landnutzungs-Ähnlichkeit (PAP 3)

- Anders als im Kickoff angenommen liefert `z0Point.ts` **keine Klassenanteile je Zelle**.
  - Es rechnet je Stufe **eine** Box um den **Punkt** (`z0Point.ts:88-92`).
  - Der Punktkreis-Anteil ist das einzige Klassenergebnis.
  - Die z0_mod-Näherung sieht damit eine um bis zu eine halbe Zellweite verschobene Zelle — **V-FI-65**.
- κ = 1 ist heute ein Skalar je Aufruf und fällt in der Normierung heraus (`grid.ts:108,117`).
- Machbar nur in t1/t2: t3-Boxen sind aus den geladenen Kacheln nur an 22/42 Orten gedeckt, und 28-km-Zellen
  sagen über den Stationsfußabdruck nichts.

### 1.5 z0 der Modellseite (PAP 5, V-FI-58)

- ICON-D2/-EU/-global liefern z0 je Schritt.
- Über Land ist ICON-z0 praktisch statisch; über Wasser ändert es sich je Schritt (**V-FI-73**).
- IFS/AIFS haben in den Open Data kein z0 (**V-FI-72**). Ihr Anteil bleibt WorldCover-Näherung.
- Eine Ebene je Schritt kostete ≈ 49 Schritte × 256 Zellen je t1-Chunk je Lauf für eine über Land konstante Größe.
- Ein statisches Produkt nach dem `static/hmodel`-Muster kostet einmal ≈ 0,2–0,4 MB (**R**: hmodel/v1 = 261 KB für
  5 Spalten).
- ⇒ **statisches Produkt** (E-F-15, S&F).

### 1.6 Kalibrier-Werkzeug (Punkt 7 der Tabelle)

**Fünf Befunde, die das Werkzeug betreffen:**
- **V-FI-66:** Kein Client liest `calib.json`. Ohne Leser bliebe AP10 wirkungslos.
- **V-FI-67:** `CalibEntry` hat weder `n` noch `period`, und der Selbsttest verbietet `measured` pauschal
  (`calibration.ts:165-170`, `verify-point-data.mjs:652`).
- **V-FI-68:** `CALIB_KEYS_OF` und die emittierten Präfixe passen nicht zusammen, `calibByVar` verliert stumm
  Einträge (`output.ts:304-332` gegen `cubeSource.ts:482-522`).
- **V-FI-71:** `dzMin`, `gammaDepthM` und `dTMinK` (`profile.mjs`) sind aus dem Archiv nicht fitbar, weil die
  Modelllevel nicht archiviert sind.
- **V-FI-76 (korrigiert 18.09.):** Die POI-Datei trägt die Niederschlagsart. Gelesen am 18.09. an 10865: 43
  Spalten, darunter `present_weather`, `past_weather_1`, `past_weather_2`, `depth_of_new_snow`, `total_snow_depth`.
  - Der Sammler liest davon nur 9 (`scripts/punktarchiv/lib/truth.mjs:37-47`, `POI_COLS`) und verwirft den Rest;
    deshalb fehlt die Art heute in `TRUTH_SCALES`.
  - Liest der Sammler die fünf Spalten mit (AP9-Datei ⇒ Anforderung an AP9), wird `meltOffset` fitbar (§2.5).
  - Gilt nur an POI-Punkten (DE-Kern); TAWES/SMN ungeprüft.

**Findings dieser Planung (V-FI-62 … 79), je Kurzform:**
- V-FI-62: U-15-Regel verfehlt Bodeninversionen.
- V-FI-63: Druckflächen nur für `belowGround925` gelesen.
- V-FI-64: Standardhöhen liegen ≈ 100 m zu tief.
- V-FI-65: z0_mod-Box um den Punkt statt um die Zelle.
- V-FI-66: `calib.json` ohne Leser.
- V-FI-67: `CalibEntry` ohne `n`/`period`.
- V-FI-68: calib-Präfixe passen nicht zusammen.
- V-FI-69: Archiv ohne Nachbarzellen.
- V-FI-70: hModEff blockgemittelt, t1-Profil aus der nächsten Zelle; `surfaceBased` vergleicht zwei Fußabdrücke
  (`grid.ts:38`, `vertical.ts:147`). t1 bleibt in dieser Phase unverändert, AP9 prüft.
- V-FI-71: dzMin/gammaDepthM nicht fitbar.
- V-FI-72: IFS/AIFS ohne z0.
- V-FI-73: ICON-z0 über Wasser zeitabhängig.
- V-FI-74: 8/49 t1-Schritte ohne Profil.
- V-FI-75: Spiegel ≈ 37 m.
- V-FI-76: Niederschlagsart und Schnee stehen in der POI-Datei, der Sammler verwirft sie (korrigiert 18.09.).
- V-FI-77: `prompt.md` veraltet (Liste unten).
- V-FI-78: Druckflächen lösen flache Inversionen nicht auf.
- V-FI-79: Optionen im Produkt nicht schaltbar, Cache-Schlüssel ohne Optionen.

Jeder Eintrag bekommt im Phasendokument Mehrwert und Umsetzungsskizze (D-28).

**Notiz für Jan — `prompt.md` (AP9-Kickoff) gegen den Baum, nicht umgeschrieben (V-FI-77):**
1. Schema-Angabe (Z. 27):
   - Auch der Slot vom 17.09. ist Schema 1.
   - Der erste Schema-2-Slot ist der vom 18.09. 23:10 UTC.
2. Punktzahl: 405 Punkte gegen 410 in den Slots vom 16. und 17.09. (Z. 25).
3. `verify-pv-score.mjs` (Z. 21–22, 74–76):
   - kein FDR,
   - Brier nur bei 0,1 mm,
   - **keine Exporte**,
   - kein `--archive`.
4. Cube-Pfad aufrufen (Z. 65–67):
   - `registerCubePointSource(io)` oder `getPointForecastFromCube(opts, io)` verwenden.
   - `CubeIo.z0` bleibt aus.
   - Kein `onUpdate`.
   - Ohne `io.obs` gibt es keinen Anker.
5. `anchorMode` gehört zum Live-Pfad; der Cube-Pfad nimmt `FuseCubeOptions.anchor` (Z. 91).
6. `calib` wird nicht aus `calib.json` gelesen (Z. 30–31).
7. `verify:punktarchiv` steht bei 103/103, nicht 87/87. Schema 3 braucht Änderungen am Selbsttest
   (`punktarchiv.mjs:298-303` lehnt Schema 3 ab) und an `verify-punktarchiv.mjs:58` (Z. 73).
8. „flags as bitmask" ist falsch: Der Codec nutzt Index-Tabellen. `encodeV2`/`decodeV2`/`compareV2` importieren
   (`v2codec.ts:299,493,639`; Z. 67–69).
9. `elevationM: p.elev` fehlt am Live-Aufruf (`collect.mjs:461,570`, verlangt in §9.16.3).
10. Wahrheitslücken: Slot 14.09. um 20:46; POI 23 UTC geht in Schema 1 täglich verloren (Z. 85).
11. V-FI-25 ist freigegeben und umgesetzt; B5 ändert sich ab dem Slot vom 18.09. (Z. 91–93).
12. Mobil-4G ist grün (erste Darstellung), nicht rot (Z. 103–105).
13. §9.14–§9.16 existieren inzwischen (Z. 41).
14. `fusion-implementierung.md:1482` sagt „der Sammler ruft cubeSource" — falsch.
15. **Neu aus diesem Plan:** Der Sammler speichert keine Nachbarzellen (V-FI-69, E-F-19).
16. **Neu (18.09., V-FI-76):** Der Sammler verwirft die POI-Spalten `present_weather`, `past_weather_1/2`,
    `depth_of_new_snow`, `total_snow_depth`.

---

## §2 Entwurf

### 2.1 Druckflächen-Profil zur Laufzeit (Lücke 2)

**Wo und wann:**
- Wo: `cubeSource.ts`, Durchgang 1 (`preps`, nach `gridStep`, vor `applyVertical`).
- Neue reine Funktion in `src/point/profileColumn.ts`: eine TS-Portierung von `profileFromColumn`
  (`scripts/point/profile.mjs:64-100`), **dieselbe Semantik wie t1**.
  - Der Producer bleibt unberührt.
  - Der Verifier prüft die Portierung gegen die zehn Säulen aus `profileSelfTest` auf Gleichheit.
- `verticalCorrection` bekommt nur eine Option `extendBelowBase` (Voreinstellung wie heute).
- Greift nur, wenn `pressureProfile` gesetzt ist **und** die Stufe t2/t3 ist **und** alle vier Profilebenen
  MISSING sind.

**Eingabe: die Säule der NÄCHSTEN Zelle** (`a.step.values`), nicht der Blockmittelwert.
- Das ist die PD-B5-Regel: Profil aus der nächsten Zelle.
- Jede Fläche wird mit dem **eigenen** ps der Zelle maskiert. Nachbarzellen tragen kein `belowGroundHPa`; ein
  Blockmittel würde extrapolierte 925-Werte einmischen (11 % der t2-Zellschritte).
- Das Ergebnis ist aus dem Archiv exakt nachrechenbar, weil der Slot die nächste Zelle mit allen Ebenen trägt.

**Regel (E-F-14):**
1. Höhen hypsometrisch (V-FI-64): z_p = hModEff + (R_d/g)·(½(t2m + T_p) + 273,15)·ln(ps/p). Trocken, ohne
   virtuelle Korrektur (< 0,5 % der Höhe, benannt).
2. Säule = [(hModEff + 2 m, t2m)] + alle Flächen mit ps − p ≥ **10 hPa** (`set`). Flächen unter oder an Grund
   fallen heraus; `belowGround925` bleibt.
3. `profileFromColumn` mit Parametern für grobe Säulen: `gammaDepthM` **1 500 m**, `dzMinM` 50 m, `dTMinK`
   **0,5 K** (alle `set`).
   - Weniger als 3 Niveaus ⇒ `profile: null` ⇒ Fall `std` mit `stdLapseFallback`, wie heute.
4. Γ wird auf **≤ 9,8 K/km** gedeckelt (trockenadiabatisch, `physical`).
   - Grund: t2m am Tag ist überadiabatisch, eine 10-hPa-Schicht ist nur ≈ 85 m dick.
   - Gemessen: ohne Deckel liegt p90 bei 11,0 K/km.
5. **Fall C wird beim abgeleiteten Profil nicht verlängert** (`extendBelowBase: false`, E-F-14).
   - Unter der Basis gilt Γ_eff; Fall A und B erreichen damit t2/t3 bis 336 h.
   - Grund: Die Dicke ist hier der Flächenabstand (p50 ≈ 430 m), der V-FI-15-Deckel greift also kaum. Ein
     Talpunkt weit unter der geglätteten t2/t3-Oberfläche würde sonst aus einer groben Säule extrapoliert.
   - Die Variante mit Fall C bleibt als Schalter für den Nachlauf (AP9/AP10 vergleicht beide).
6. Ergebnis:
   - Herkunft `pressure-derived`; Schritt-Flag **`pressureProfile`**.
   - Fehlt Γ über einer Inversion, setzt `vertical.ts` zusätzlich `stdLapseFallback`; beide Flags dürfen dann
     zusammen stehen (benannt).
   - calib `pressureProfile:set — …Schwellen…`, der Schlüssel steht in `CALIB_KEYS_OF.t2m`.
   - σ- und Gewichtsfolgen sind gewollt und benannt (`uncertainty.ts:133-136,182-183`):
     - Fall B bekommt die Aufweitung dT_inv/4 und den Abschlag.
     - Das Cube-Member wiegt in t2/t3 gegen MOSMIX dort weniger; die Konfidenz sinkt.
7. Ebenen-Bereiche: Mit der Option zählen t850/t700 zu `CUBE_ANSWER_PLANES` (39 → 41). Den Ebenen-Test (15) in
   `verify-pv-cube.mjs:964` neu zählen.

**Vorab gemessen** (§0, Paar-Regel ΔT ≥ 0,5 K statt Läufen): t2 nachts 21,3 % / tags 0,0 %. AP15 zählt mit der
Portierung neu.

**Abnahme:**
- `inversionShare` in t2 nachts > tags (U-15-Gate). Mit der Paar-Regel am 18.09. gemessen: t2 21,3 % gegen
  0,0 %, t3 51,3 % gegen 2,0 %.
- Fälle A und B bis 336 h erreichbar, C mit dem Varianten-Schalter.
- Negativkontrollen:
  - Option aus ⇒ byte-gleich.
  - Option an ⇒ **native** t1-Schritte byte-gleich. Die interpolierten Stunden 49–50 h tragen die Stufe t1 und
    ziehen zum geänderten t2-Schritt (`cubeSource.ts:874`); dazu kommt die neue calib-Zeile.
- Schattenvergleich t1 (Treffer 34,6 %, Fehlalarm 21,0 %, Γ-MAE 1,84 K/km) als berichtete Güte.

### 2.2 Landbedeckungs-Durchgang: d_water, κ und die Modellzell-Box (Lücken 1 und 4, V-FI-65)

**Ein Durchgang:**
- `loadZ0AtPoint` wird zu `loadLandCoverAtPoint`: dieselben Kacheln, derselbe Kopf, **0 zusätzliche Bytes**.
- Das Ergebnis trägt:
  - die bisherigen z0-Werte (Variante v1, Negativkontrolle),
  - `dWater`,
  - je Stufe t1/t2 die Klassengruppen-Anteile der **3×3-Zellen um die nächste Zelle**, adressiert nach
    absoluter Zelle (Stufe, iy, ix), jeweils über die Box um die **Zellmitte**.
  - Alles liegt **im** Ergebnis-Eintrag. Ein Cache-Treffer bringt kein Klassenfeld mit (`z0Point.ts:134-141`),
    und der Block hängt von der Seite der Zellmitte ab, auf der der Punkt liegt (`grid.ts:70-77`); die
    0,001°-Rundung des Schlüssels reicht dafür nicht.
- Cache:
  - Neuer Schlüssel-Namensraum `lc:v1:<sha12>:…`.
  - Der Blick nur in den Cache liest **zusätzlich** den alten `z0:v1`-Eintrag. So verliert kein bekannter Ort
    z0 in der ersten Ausgabe (sonst einmal je Ort; Fixtures `verify-pv-cube.mjs:1202`,
    `verify-point-client.mjs:1134` tragen die alte Form ⇒ tolerant parsen).
- Nie auf dem kritischen Pfad: Cache-Treffer wirkt in der ersten Ausgabe, sonst in der z0-Ausgabe (wie heute).
- Im nicht-progressiven Modus hängt κ wie z0 am Gnadenfenster (`cubeSource.ts:1286-1290`); damit hängen dort
  auch T/Td/Niederschlag vom Netz-Timing ab (benannt).
- Sammler und Nachlauf lassen κ aus oder rechnen die Landbedeckung zur Nachlaufzeit aus dem SHA-gepinnten
  Spiegel. Sie ist zeitlos, das Ergebnis deterministisch.

**d_water:**
- Ringsuche vom Punkt nach außen in Pixelauflösung (≈ 37 m), Klasse 80.
- Beim ersten Treffer Flutfüllung bis höchstens **A_min = 10 px ≈ 0,014 km²** (`set`); kleinere Flecken
  verwirft die Suche. Gemessen: 1-px-Rauschen versetzt die Zugspitze von 3 479 auf 394 m.
- Die Suche endet, sobald die Ringdistanz über dem besten Treffer liegt, spätestens am **sicheren Radius r_c**
  (Abstand zum ersten nicht geladenen Pixel) bzw. bei 20 km.
- Ergebnis:
  - `dWaterM` (auf 10 m gerundet) oder `null` mit `dWaterAboveM: r_c` („kein Gewässer ≥ A_min innerhalb r_c"),
    also nie 20 000;
  - dazu `waterBodyPx` (gedeckelt).
  - Fehlt eine Spiegeldatei (Küste, Rand der DACH-Kacheln), heißt das „unbekannt" (`reason: 'coverage'`), nicht
    „kein Wasser".
  - r_c ist der tatsächlich geladene Abstand, mindestens die O-W-Halbbreite der t3-Box (≈ 9,5 km bei 47 °N).
- Grenze durch den Spiegel: ≈ 37 m, Flüsse < ~40 m fehlen (V-FI-75).

**κ:**
- Gruppen: Wasser 80 · Stadt 50 · Wald 10 · Offen 20/30/40/90/95/100 · Kahl 60 · Schnee 70.
- p = Anteile im 500-m-Punktkreis (Fußabdruck der Station, der vorhandene z0-Kreis).
- q_g = Anteile der Zellbox (t1 Schritt 100 m, t2 200 m).
- δ_g = ½·Σ|p − q_g|, κ_g = exp(−δ_g/λ) mit **λ = 1** (`set`, konservativ; bei λ = 0,5 lag die Spreizung
  ≥ 1,5 an 24/42 Orten).
- `GridCell.kappa?` je Zelle; in `grid.ts` gilt `w = wd·wh·(c.kappa ?? kappa)`.
- κ verschiebt auch das gewichtete hModEff und damit das Δh von PAP 4 (benannt).
- κ = 1 für alle Zellen einer Stufe, wenn eine Box oder der Punktkreis < **80 %** bekannt ist (`set`).
  - Die geladene Box reicht nur ±0,125° um den Punkt; t2-Blockboxen reichen bis 0,15°.
  - Gemessen waren an 42/42 Orten 100 %, weil die Kacheln größer sind als die Box; garantiert ist das nicht.
  - Teilabdeckung verzerrt die Anteile, deshalb die höhere Schwelle.
- t3: κ = 1 (benannt).
- calib `kappa:set — λ 1, 6 Gruppen, Kreis 500 m; t3 = 1`.

**Modellzell-Box:**
- z0_mod-Näherung über die 2×2-Blockzellen, log-gemittelt mit den PAP-3-Gewichten, statt über die Box um den Punkt.
- Nur mit der neuen Option; ohne Option byte-gleich.

### 2.3 Nachbar-Chunk im Leser (Lücke 3)

- `readPointBundle({ crossChunk: true })`, Voreinstellung aus.
  - Für jede Stufe, deren 2×2-Block einen anderen Chunk braucht, holt der Leser den Nachbar-Chunk (1 oder 3)
    **desselben Laufs** über denselben Store und Cache.
  - `series.neighbours` trägt dann den Ring über die Grenze; `truncated` wird falsch.
- Im progressiven Modus startet der Abruf mit dem Kern und bekommt eine **eigene Ausgabe** (Muster `z0Later`).
  - Nicht über das `Promise.all` der Nachlieferung (`cubeSource.ts:1332`): dort würden Anker und Radar
    warten (die z0-Lehre, ≈ +0,9 s).
  - Die Nachlieferung sendet nur bei Neuem, und `z0Later` nutzt das alte Bündel (`cubeSource.ts:1353-1354`).
  - Das Ergebnis wäre also sonst verloren.
- Der Abruf ist an **denselben** Index-Zeiger gebunden, nicht an den SWR-Neulesezeiger (`cubeSource.ts:1379`).
- Nicht-progressiv (Sammler, Nachlauf) wirkt er sofort.
- Scheitert der Abruf (403/Frist, V-FI-5), bleibt es beim beschnittenen Block mit Flag. Zellen am Gitterrand
  bleiben beschnitten.
- Der Halo (E-F-2) bleibt „nein".
- `readCubePoint` (vom Sammler benutzt) bekommt keine neue Voreinstellung: kein Mehrabruf, bis AP9 die Option
  setzt.

### 2.4 z0 der Modellseite als statisches Produkt (Lücke 5)

**Producer (S&F):**
- `point/static/z0mod/v1/<Stufe>/<cy>_<cx>.bin`, gleiches Raster und Container wie hmodel.
- Je Quelle eine Spalte ln(z0)·1000 als int16: t1 ICON-D2 + ICON-EU, t2 ICON-EU + ICON global, t3 ICON global.
- Aggregation: log-Mittel der Quellpunkte in der Cube-Zelle.
- Schnappschuss Schritt 000; neu bauen nach der hmodel-Regel (`changed`) oder monatlich (Schnee/LAI, V-FI-73).
- `static.json` nennt `absent` für IFS/AIFS/AICON mit Grund.
- ICON-CH1/-CH2 (MeteoSwiss STAC): z0-Verfügbarkeit in AP17 messen.

**Client:**
- z0_mod,eff je Stufe = ln-Mittel über die Wind-Quellen der Stufe:
  - GRIB-Wert, wo vorhanden (calib `z0Mod:model`);
  - sonst die WorldCover-Zellnäherung (`z0Mod:set`);
  - der Anteil wird ausgewiesen.
- z0_true bleibt WorldCover (`literature`).
- Die Datei kommt mit den statischen Produkten in der Nachlieferung.

**Vor dem Bau in AP17 zu messen:**
- Enthält ICON-z0 einen Orographie-Anteil? Vergleich ICON-z0 gegen die WorldCover-Zellnäherung, Flachland
  gegen Alpenzellen. Die Verteilung ist p90 0,98 m / p99 1,41 m (ICON-D2).
- Wenn ja, ist z0_mod aus GRIB gegen ein orographiefreies z0_true falsch gepaart: Der Faktor stiege im Gebirge.
  Dann nur über flachem Gelände nutzen oder den Anteil abziehen.

**Näherung, benannt:** Die Quellenmischung des Cube-Winds ändert sich mit dem Vorlauf (`hModEff` ist
zeitabhängig, `cubeFormat.ts:282-284`); das statische ln-Mittel je Stufe bildet das nur näherungsweise ab.

**Archiv:**
- Versionen sind unveränderlich und werden nie gelöscht; `static.json` trägt `validFrom`.
- Der Nachlauf wählt die Version nach Slot-Datum. Der Sammler muss dafür nichts ändern.

### 2.5 Kalibrier-Werkzeug (Lücke 6) — der Fit, entworfen vor den Daten

**Ort:**
- Reiner Kern `src/point/calibFit.ts` mit Registry und Schätzern: in keinem App-Import, daher kein Bundle.
- Synthetischer Verifier `scripts/verify-calib-fit.mjs`.
- Die CLI `scripts/punktarchiv/fit-calib.mjs` (Archiv-Leser plus Nachlauf) kommt **erst nach AP9**: sie importiert
  AP9s Nachlauf und fasst vorher keine AP9-Datei an.

**Ausgabe `point/calib.json` Schema 2 (E-F-20):**
- Je Eintrag zusätzlich: `n`, `days`, `period {from,to}`, `estimator`, `strata`, `ci90`, `fitVersion`.
- `provenance: measured` nur bei n ≥ n_min.
- Schema 1 bleibt lesbar.

**Client-Leser** (`CubeIo.calibSource: 'json'`, Voreinstellung `'constants'`):
- **Nur Einträge mit `provenance: measured` wirken.** Schema 1 trägt schon Nicht-null-Einträge (`standardLapse`,
  `z0Table`, `phi.shape`); sie ändern nichts. Byte-gleich wird gegen die **veröffentlichte** Datei geprüft.
- σ_sys gemessen je (v, Lead-Bin) **ersetzt das ganze** max(Boden, Skill-Prior) (`uncertainty.ts:77-82`).
  Nicht nur den Boden: gemessen ist der Gesamtfehler.
- calib.json (6 KB, TTL 24 h, ändert sich am selben Pfad):
  - parallel zum Index, nie blockierend;
  - ist sie beim Kern nicht da, gelten die Konstanten mit Notiz;
  - ein neuer Wert wirkt erst bei der nächsten Abfrage, nie in der Nachlieferung (kein σ-Sprung im Bild);
  - Hash der Datei in v2 `provenance`.
- `verifyCalibration` (`calibration.ts:165-170`) verbietet `measured` heute ⇒ mit Schema 2 auf „measured nur mit
  n ≥ n_min" umstellen.

**Harter Abbruch:**
- „Archiv zu kurz" mit Diagnose: n je Parameter/Bin/Schicht, fehlende Tage, Datum der Reife.
- Nie wird ein Wert geschrieben, wenn n < n_min oder das KI die Null bzw. den Startwert nicht ausschließt
  (bei A, A_uhi).

**Registry**:

| Parameter | Schätzer | n_min (set) | Schichtung | Braucht |
|---|---|---|---|---|
| σ_sys(v, Lead-Bin) | Momente: E[(o−μ)²] − E[σ²_ohne sys], geblockte Raum-CV (1°-Kacheln/Land), Block-Bootstrap über Tage | 30 Tage und ≥ 1 000 Punktfälle je Bin | Land (DE / AT+CH), Höhenband < / ≥ 800 m | Nachlauf AP9 |
| c(p,f) | Spread/Skill: √(E[(o−μ)²] / E[σ_ens²]) an Schritten mit Ensemble | 30 Tage je Bin | Lead-Bin | Nachlauf |
| Konfidenz-Abschläge | CRPS-Verhältnis mit/ohne Flag in gepaarten Schichten, geklemmt 0,3…1 | 200 markierte Fälle je Flag | Flag | Nachlauf |
| L_d, L_h, κ-λ | CRPS-Gittersuche (L_d 0,5–2× Zellweite; L_h 100–800 m; λ 0,5/1/2/∞), Leave-one-region-out | 30 Tage **ab 2×2-Block im Archiv** | Stufe, Gelände | E-F-19 |
| z_b (Wind-Blending) | Regression Wind(obs)/Wind(mod) auf den Blending-Term | 30 Tage | z0-Klasse | z0 zur Fit-Zeit (zeitlos) |
| A, f_rad (a, v_ref, ε) | Residuen-Regression auf g·f_rad·f_saison·(1−Föhn) an Muldenstationen (TPI < −1σ), nachts | ≥ 20 Strahlungsnächte (f_rad ≥ 0,5) × ≥ 10 Stationen | Nacht, Gelände | Gelände zur Fit-Zeit |
| A_uhi | Regression auf A_uhi(imperv, SVF)·f_rad·f_saison, Stadt gegen Umland | ≥ 20 Strahlungsnächte × ≥ 10 Stadtstationen (imperv > 30 %; Anzahl in AP13 auszählen) | Nacht | urban zur Fit-Zeit |
| φ-Stützstellen, poolDepth | Isotone Regression (o − T̄)/dT_inv gegen u in Fall B; Tiefenregel an Fall C | ≥ 200 Fall-B- bzw. ≥ 100 Fall-C-Punktschritte aus ≥ 15 Nächten | Stufe | Nachlauf |
| tpiSigma | Streuung des TPI über die Region — **kein Archiv nötig** | sofort | Region | Gelände |
| meltOffset | Logistische Regression der beobachteten Phase (`present_weather`/`past_weather_1/2` als Schnee / Regen / Misch; Stützung durch `depth_of_new_snow`) gegen T_w am Punkt; der Schmelzversatz ist die Verschiebung der 50-%-Schwelle gegen die Schneefallgrenze des Modells | ≥ 100 Niederschlagsstunden mit T_w in −1…+3 °C aus ≥ 10 Tagen (`set`) | Höhenband; **nur DE** (POI-Punkte) — die Abdeckung steht in jeder Schicht | Sammler liest die fünf POI-Spalten in Schema 3 (V-FI-76, AP9) |
| dzMin, gammaDepthM | nicht aus dem Archiv fitbar (V-FI-71) — nur als Producer-Experiment | — | — | Modelllevel |

**Kalender:**
- Annahme: ein Slot je Tag ab 14.09.
- Reife = Datum des 30. Slots (13.10.) + ⌈(H+1)/24⌉ Tage.
- Diagnose (nur Bericht, nie geschrieben) ab 7 Tagen.

| Bin | Diagnose ab | schreibbar ab |
|---|---|---|
| 0–6 h | 21.09. | ≈ 14.10. |
| 7–24 h | 22.09. | ≈ 15.10. |
| 25–48 h | 23.09. | ≈ 16.10. |
| 51–120 h | 26.09. | ≈ 19.10. |
| 126–240 h | 01.10. | ≈ 24.10. |
| 246–336 h | 05.10. | ≈ 28.10. |

- L_d/L_h/κ: 30 Tage nach dem ersten Slot mit 2×2-Block.
- A, A_uhi, φ: wetterabhängig; frühestens Mitte/Ende November bzw. im Winterhalbjahr (**R**, keine Zusage — der
  Fit meldet n).
- meltOffset (Jan, 18.09.: „mit den Spalten in Schema 3 wird meltOffset im Winter fitbar"):
  - Die Zählung beginnt erst mit dem ersten Slot, der die POI-Wetterspalten speichert.
  - Reife wetterabhängig (Misch- und Schneefall-Fälle), also im Winterhalbjahr.
  - Der Fit meldet n und schreibt nie vor n_min. Abdeckung nur DE.
- tpiSigma: sofort.

**Synthetischer Verifier:**
- Ein erzeugtes Archiv (60 Tage × 120 Punkte, bekannte σ_sys, c, L_h, λ, A, A_uhi, z_b) wird zurückgewonnen:
  - σ_sys, c ±10 %,
  - L_h ±25 %,
  - A, A_uhi ±20 %.
- Ein 10-Tage-Archiv wird mit „Archiv zu kurz" abgelehnt, samt Diagnose und Reifedatum.
- Negativkontrolle: vertauschte Wahrheit ⇒ A, A_uhi nicht geschrieben (KI enthält 0), σ_sys groß.
- Leck-Wächter: Wahrheit nach dem Fit-Datum ist ausgeschlossen.

---

## §3 Laufzeit- und Bytes-Budget

Alle Laufzeiten werden **am selben Tag vorher und nachher auf demselben Harnisch** gemessen:
- `verify:pv-latency --only=cubep`,
- Profile `desktop-none,mobile-4g`,
- 10 Orte, bei AP14 zusätzlich `--places=graz,berlin`,
- berichtet werden die erste Darstellung, das ganze Fenster und die letzte Ausgabe.

| AP | Kritischer Pfad (erste Darstellung) | Späte Ausgabe | Draht | Daten-Repo (R10) | Bundle (**R**, lazy) |
|---|---|---|---|---|---|
| AP13 calib-Leser | +0 (6 KB parallel zum Index, Cache 24 h) — messen | — | +6 KB einmalig/Tag | calib Schema 2 ≈ +2–4 KB | ≈ +2,0 KB |
| AP14 Nachbar-Chunk | 0 | +172–565 KB je Randstufe; Desktop +28–63 ms (gemessen), Mobil-4G ≈ +0,2–0,5 s (**R** 9 Mbit) | nur 24 % der Orte | 0 | ≈ +1,5 KB |
| AP15 Druckflächen-Profil | +< 1 ms Rechnung (Gate im Node-Fixture ≤ 0,05 ms/Schritt) | — | 0 (mit Ebenen-Bereichen +23 KB je Ort) | 0 | ≈ +1,2 KB |
| AP16 d_water + κ | 0 | Ringsuche Gate ≤ 30 ms Desktop / ≤ 120 ms Mobil (CPU 4×); κ ≈ 2,5 ms Desktop (**R** aus 3,8 ms) | 0 | 0 | ≈ +3,0 KB |
| AP17 z0mod | 0 | +3 kleine Dateien (≈ 1–1,5 KB je Stufe, **R** wie hmodel) in der Nachlieferung | ≈ +4 KB | ≈ +0,2–0,4 MB (einmal je Fassung) | ≈ +0,8 KB |
| **Summe** | unverändert | — | — | ≈ +0,3 MB | **≈ +8,5 KB ⇒ über 2,4 KB Luft ⇒ E-F-21** |

eagerJs 107,9 bleibt unverändert (alles hinter `?pf=cube` und `await import`). Der Halo ist verworfen
(+11,5 MB je t1-Lauf).

---

## §4 Arbeitspakete

Legende Gate: **—** lokal + Verifier · **J** Jan · **S&F** STOPP & FRAGEN.
Aufwand: S = 1, M = 2–3 Sitzungen.

### AP13 — Kalibrier-Werkzeug und Archiv-Anforderungen (Lücke 6)

- **Aufwand:** M. **Gate:** — (calib-Schema und Publisher-Weg: **S&F**, E-F-20).
- **Inhalt:**
  - **Voraussetzung für alle folgenden Pakete (V-FI-79):** Optionen durchreichbar machen.
    - Heute ruft `forecastFromBundle` fest `fuseCubePoint(input, { hourly: true, tail: true })` auf
      (`cubeSource.ts:1166`).
    - Der Ergebnis-Cache-Schlüssel (`cubeSource.ts:1223`) kennt keine Optionen, also ist keine neue Option im
      Produkt schaltbar.
    - Kur: `CubeIo.fuse?: Partial<FuseCubeOptions>` durchreichen, die Options-Bits in den Schlüssel.
    - Negativkontrolle: ohne `fuse` byte-gleich.
  - Registry und Kern `src/point/calibFit.ts` mit Metriken aus `dist.ts` (`crpsOf`, `pitOf`); `verify-pv-score.mjs`
    exportiert nichts.
  - `scripts/verify-calib-fit.mjs` als synthetisches Archiv.
  - calib-Schema 2 in `calibration.ts`: `n`/`period`, Selbsttest „measured nur mit n ≥ n_min".
  - Client-Leser `CubeIo.calibSource` mit Negativkontrolle.
  - V-FI-68 behoben: eine Tabelle der Präfixe für emittierte und gelesene Einträge.
  - tpiSigma aus dem Gelände gemessen, zunächst in der Fit-Ausgabe.
  - Anforderungen an AP9 — **geliefert über den neuen `prompt.md` (Schritt 0), nicht in AP13** (E-F-19 mit
    Bedingungen, §6.1):
    - 2×2-Block, Nachbarn nur mit den 31 PAP-3-Ebenen;
    - Slot-Wachstum messen, bevor das Schema eingefroren wird;
    - Optionen-Hash, calib-Hash und Spiegel-SHA im Slot;
    - `elevationM`;
    - die fünf POI-Wetter- und Schneespalten in der Wahrheit (V-FI-76);
    - Verifier „Nachlauf mit gekürzten Nachbarn = Produkt".
- **Abhängig:** — (CLI nach AP9).

### AP14 — Nachbar-Chunk im Leser (Lücke 3)

- **Aufwand:** S. **Gate:** —; Einschalten im Browser: **J** nach Randbefund.
- **Inhalt:**
  - `crossChunk` in `readPoint.ts`/`cubePoint.ts` (Ring über die Grenze).
  - Späte Ausgabe in `cubeSource.ts`.
  - Voreinstellung aus.
  - Der Sammler setzt die Option nach AP9.
- **Abhängig:** — (vor der Sammler-Änderung von AP9).

### AP15 — Druckflächen-Profil t2/t3 (Lücke 2)

- **Aufwand:** S–M. **Gate:** — (im Flag; Motor-Zone innerhalb der freigegebenen Phase, Rule 2).
- **Inhalt:**
  - `pressureProfile()` rein.
  - Option `FuseCubeOptions.pressureProfile`.
  - Flag `pressureProfile` in `StepFlag`, `output.ts` und der `v2codec`-Tabelle.
  - calib-Text.
  - Diagnose-Skript gegen den lebenden Cube: Anteil Nacht/Tag, t1-Schatten.
- **Abnahme-Gate vor dem Archiv (Jan, 18.09.)** — entscheidet, ob AP15 überhaupt etwas verbessert.
  - Im Protokoll zu berichten, **bevor** die Option irgendwo eingeschaltet wird.
  - Messung am t1-Schatten, dieselbe Stichprobe für alle drei Varianten:
    - (i) Standard-Lapse 6,5 K/km;
    - (ii) Druckflächen-Profil;
    - (iii) t1-Modelllevel-Profil als Referenz.
  - Kennzahlen:
    - Γ-MAE gegen (iii);
    - T-Fehler der PAP-4-Korrektur an Punkten mit |h_true − hModEff| > 300 m gegen (iii).
  - Die Wirkung der Fehlalarme (≈ 21 %: Fall B, wo t1 keine Inversion sieht) wird getrennt ausgewiesen.
  - Schlägt (ii) die Standard-Lapse (i) nicht, bleibt die Option aus; das wird mit Zahl berichtet.
  - AP9 wiederholt den Vergleich später gegen Stationswahrheit.
- **Abhängig:** —.

### AP16 — Landbedeckung: d_water, κ, Modellzell-Box (Lücken 1 und 4)

- **Aufwand:** M. **Gate:** — (im Flag).
- **Inhalt:**
  - `loadLandCoverAtPoint` (z0 v1 byte-gleich), Klassenfeld intern geteilt.
  - `dWater` (Ringsuche, zensiert) in `CubeTerrain` und v2 `point.terrain`.
  - Zellanteile t1/t2; `GridCell.kappa`; Option `kappa`; z0_mod-Zellbox.
- **Abhängig:** —.

### AP17 — z0 der Modellseite aus GRIB (Lücke 5, V-FI-58)

- **Aufwand:** M. **Gate:** **S&F** (Producer, Publisher, statisches Produkt).
- **Inhalt:**
  - Producer `static/z0mod/v1` (Adapter dwdRegular/dwdIcosahedral: `z0` Schritt 000, log-Mittel je Zelle).
  - Publisher trägt das Produkt (TIMELESS `point/static/` schon gelistet).
  - Leser `staticPoint.ts`.
  - Mischung in `cubeSource.ts`.
- **Abhängig:** nach AP16 (beide berühren die z0-Übergabe).

**Reihenfolge (Jan, 18.09.):**
0. **Zuerst `prompt.md` (AP9-Kickoff) neu schreiben.**
   - Die 15 Korrekturen aus V-FI-77 (§1.6) einarbeiten.
   - Die Anforderungen ergänzen:
     - gekürzter 2×2-Block je Stufe über den Chunk-Rand; der Sammler liest den Nachbar-Chunk in Node selbst und
       braucht AP14 nicht;
     - Options-, calib-Hash und Spiegel-SHA im Slot;
     - `elevationM`;
     - die fünf POI-Spalten;
     - 23-UTC-Dedupe;
     - `encodeV2`/`decodeV2` mit `V2C_VERSION` im Slot;
     - Schema 3 mit Historie und Selbsttests;
     - die Nachlauf-Prüfung aus §6.1 (a).
   - **AP9 läuft danach parallel und wartet nicht auf AP13/AP14**: Jeder Slot ohne Block ist ein verlorener Fall
     für L_d/L_h/κ.
1. **AP13**: Optionen durchreichen, calib Schema 2 und Leser, Fit-Kern mit synthetischem Verifier.
2. **AP14-Leser** (für den Browser; der Sammler braucht ihn nicht).
3. **AP15**: lokal, 0 Byte, der größte Zuwachs an Wirksamkeit — Profil-Γ und Fall B bis 336 h.
4. **AP16**: lokal.
5. **AP17**: einzige Producer-Stufe mit einem Manifest-Schritt. Die Vorbereitung kann parallel laufen, sobald
   E-F-15 freigegeben ist.

**Summe:** ≈ 8–11 Sitzungen.
**AP10** läuft danach kalendarisch (§2.5) und ist hier nicht Gegenstand.

**Zuständigkeiten ab dem AP9-Start (Jan, 18.09.):**
- **AP9-Session:** `scripts/punktarchiv/**`, `scripts/verify-pv-score.mjs`, §9.13 in
  `audit/fusion-implementierung.md`, V-FI-32…39.
- **Diese Linie (AP13–AP17):**
  - `src/point/**`, `src/pointForecast/**` inkl. `calibration.ts`;
  - `scripts/verify-pv-cube.mjs`, `scripts/verify-point-client.mjs`, `scripts/verify-calib-fit.mjs`;
  - `audit/fusion-vollform.md` (Phasendokument, Protokoll in §9, Findings ab V-FI-80).
- **Geteilt, nur additiv:**
  - Flag-Tabellen in `v2codec.ts`; eine Änderung einer Codec-Tabelle hebt `V2C_VERSION`;
  - `scripts/lib/pvCubeFixtures.mjs`.

**Reproduzierbarkeit (BW-1):**
- Die Diagnose-Skripte hinter §0 kommen nach `audit/fusion-vollform/`, jeweils in der ersten Etappe, die die
  Zahl berührt:
  - Chunk-Rand über 405 Punkte (AP14);
  - Inversionsregeln und t1-Schatten am lebenden Cube (AP15);
  - d_water- und κ-Stichprobe (AP16);
  - z0-GRIB-Zeitverhalten und Orographie-Anteil (AP17).
- AP13 berührt keine §0-Zahl außer dem calib-Zustand.

---

## §5 Verifikation

Jede Etappe erfüllt:
- `typecheck` 0 und `build`;
- `budget`: eagerJs 107,9 unverändert, totalJs ≤ Ratsche nach E-F-21;
- die genannten Verifier einzeln (nie parallel wegen der Kosten-Gates), PowerShell ohne `2>&1`;
- `verify:pv-latency` am selben Tag vorher und nachher.

**AP13:**
- `verify-calib-fit` (neu): Rückgewinnung, Abbruch „Archiv zu kurz", vertauschte Wahrheit, Leck-Wächter.
- `verify:point-data`: calib Schema 2, Selbsttest.
- `verify:point-client`: Leser; Schema 1 alles `null` ⇒ Konstanten.
- `verify:pv-cube`: `calibSource: 'json'` mit calib heute ⇒ byte-gleich; ein gesetzter `measured`-Wert wirkt und
  steht als `:measured` in calib.

**AP15** (`verify:pv-cube`, neuer Block):
- synthetische Säulen:
  - Bodeninversion ⇒ Fall C im Tal, B am Hang;
  - abgehoben ⇒ A/B;
  - keine ⇒ A mit Γ aus den Flächen;
  - 925 unter Grund ⇒ ausgelassen;
- Option aus ⇒ byte-gleich; Option an ⇒ t1 byte-gleich;
- Nacht > Tag an einer Fixture mit echter Datenform (Chunk aus dem Archiv-Slot);
- Codec-Rundweg mit dem neuen Flag. Die Flags liegen als Tabellen je Vorhersage vor (`v2codec.ts:465,608`);
  `StepFlag` (`cubeSource.ts:173`) und `FLAG_TEXT` (`PointForecastBands.tsx:31-46`) erweitern;
- Portierung = `profileFromColumn` an den zehn Selbsttest-Säulen.
- **Mit Option an** ändern sich diese bestehenden Prüfungen (bei Option aus nicht):
  - `verify-pv-cube.mjs:138` (`s2.profile === null`), `:311-312` (t2/t3 Fall `std`), `:315` (96/102 byte-gleich),
    `:803` (t2-Schritt als Positivfall von `stdLapseFallback`), `:813` (14 → 15 Flags), `:964` (39 → 41 Ebenen).
  - Die Fixture (`scripts/lib/pvCubeFixtures.mjs:66-67`, t925 = t2m − 3 ⇒ ≈ 11 K/km) hat keine
    t2/t3-Inversion. Varianten ergänzen: Bodeninversion, abgehoben, 925 unter Grund, überadiabatisch.

**AP14:**
- `verify:point-client`: Ring über die Grenze = Ring aus einem zusammengesetzten 32×32-Feld; Negativkontrolle
  verschobener Chunk; 403/Frist ⇒ beschnitten mit Flag.
- `verify:pv-cube`: Randpunkt vollständig ⇒ gleiche Werte wie Innenpunkt-Rechnung, kein Flag; Option aus ⇒
  byte-gleich.
- Latenz: Graz/Berlin erste Darstellung unverändert, Nachlieferung berichtet.

**AP16** (`verify:point-client`, analytische Klassenfelder):
- d_water:
  - Punkt 300 m vom Seeufer ⇒ 300 ± 40 m;
  - Binnenland ohne Wasser in r_c ⇒ `null` + `dWaterAboveM` (nie 20 000);
  - 1-px-Fleck ignoriert;
  - 2-px-Fluss (≥ 10 px lang) gefunden.
- κ, fünf Fälle:
  - Seeufer ⇒ Seezellen abgewertet;
  - Stadtrand ⇒ Stadtzelle aufgewertet;
  - Waldrand;
  - homogene Ebene ⇒ Gewichte gleich ≤ 1e-12;
  - unbekannte Zelle ⇒ κ = 1 für alle.
- z0 v1 byte-gleich ohne Option.
- Kosten-Gate der Ringsuche.

**AP17:**
- `verify:point-data`: z0mod-Selbsttest (ln-Kodierung Rundweg, log-Mittel, `absent` benannt).
- `verify:point-client`: Leser.
- `verify:pv-cube`: GRIB-z0 wirkt, IFS/AIFS-Anteil Näherung, Herkunft in calib; Produkt fehlt ⇒ byte-gleich zu
  heute.
- Wasserzelle: Faktor-Empfindlichkeit z0 1e-4 → 1e-3 berichtet.

**Selbstverifikation je Etappe:** die fünf Fragen schriftlich mit Beleg.

---

## §6 Entscheidungen für Jan (E-F-13 …)

| # | Frage | Empfehlung |
|---|---|---|
| **E-F-13** | Profil-Ersatz t2/t3 **zur Laufzeit (b)** statt im Producer (U-15) | **Ja.** 0 Byte, kein Producer-Gate, mit Varianten im Archiv nachrechenbar. U-15 als Producer-Etappe entfällt |
| **E-F-14** | Regel des Ersatzprofils:<br>• Säule der nächsten Zelle mit Bodenniveau (t2m an hModEff), hypsometrisch, maskiert ab ps − p < 10 hPa<br>• `profileFromColumn` portiert (eine Semantik mit t1) mit gammaDepth 1 500 m, dTMin 0,5 K<br>• Γ ≤ 9,8 K/km<br>• **Fall C beim abgeleiteten Profil nicht verlängert** (Variante nur im Nachlauf) | **Ja** (V-FI-62/64). Damit sind A und B bis 336 h erreichbar, C erst nach dem Backtest |
| **E-F-15** | z0 der Modellseite als statisches Produkt `point/static/z0mod/v1`. Producer, Publisher, Produkt = S&F | **Ja.** IFS/AIFS bleiben Näherung (V-FI-72) |
| **E-F-16** | κ nur t1/t2 (t3 = 1), TV-Abstand über 6 Gruppen, λ = 1 (`set`), nur mit Klassenfeld (späte Ausgabe) | **Ja** |
| **E-F-17** | d_water nur Ausgabe und Schichtungsmerkmal; zensiert (`null` + Untergrenze) statt 20 000; A_min 10 px | **Ja** |
| **E-F-18** | Chunk-Rand über Nachbar-Chunk im Leser (späte Ausgabe); Halo (E-F-2) bleibt nein; Einschalten im Browser nach dem Befund | **Ja** |
| **E-F-19** | Archiv speichert den **2×2-Block je Stufe** (auch über den Chunk-Rand), ohne Quantil-Ebenen, als **neue Slot-Schemafassung** (nie als gekippte Voreinstellung). Dazu im Slot: gesetzte Optionen, calib-Hash, Spiegel-SHA. **≈ +5–7 MB gz je Slot** (**R** aus 2,45 MB gemessen für die nächste Zelle; in AP9 messen). Umsetzung durch AP9 | **Ja.** Ohne ihn sind L_d/L_h/κ und der Randbefund nicht messbar (V-FI-69). Der 3×3-Ring (+≈ 20 MB) nur, falls PAP 3 je N = 9 braucht |
| **E-F-20** | calib.json Schema 2 (n, period, estimator, strata, ci90). Weg der Fit-Werte: Archiv-Repo schreibt `calib.fit.json`, der Punkt-Publisher übernimmt sie. Client-Leser hinter Flag | **Ja.** Publisher-Weg = S&F |
| **E-F-21** | totalJs-Ratsche 1 430 → **1 440** (≈ +8,5 KB lazy, **R**); eagerJs unverändert | **Ja**, Zahl nach Messung je AP |
| **E-F-22** | t1-Schritte ohne Modelllevel-Profil (8/49) mit dem Druckflächen-Ersatz füllen? | **Nein, jetzt nicht** (t1 byte-gleich). Nach AP9 (V-FI-74) |

### 6.1 Entschieden am 2026-09-18 (Jan)

| # | Entscheidung | Folge im Plan |
|---|---|---|
| E-F-13 | **Ja** | AP15 zur Laufzeit; U-15 als Producer-Etappe entfällt |
| E-F-14 | **Ja** | Regel wie §2.1 |
| E-F-15 | **Ja**, mit Bedingung: Producer- und Publisher-Arbeit nur gegen einen **konkreten Diff, den Jan in AP17 freigibt** | AP17 legt zuerst den Diff vor (Producer `static/z0mod`, Publisher, `static.json`) und misst RV12; danach erst Umsetzung |
| E-F-16 | **Ja** | AP16 |
| E-F-17 | **Ja** | AP16 |
| E-F-18 | **Ja** | AP14; Einschalten im Browser nach dem Randbefund |
| E-F-19 | **Ja, mit zwei Bedingungen** (s. u.) | Anforderung an AP9 |
| E-F-20 | **Ja**; der Publisher-Weg ist S&F, wenn er ansteht | AP13 baut Schema 2 und Leser; der Publisher-Weg ist ein eigenes S&F-Gate |
| E-F-21 | **Ja**, die Zahl wird je AP gemessen | Ratsche je Etappe mit Messwert anheben, nicht vorab auf 1 440 |
| E-F-22 | **Nein, jetzt nicht** | t1 bleibt byte-gleich |

**Bedingungen zu E-F-19.**
Begründung (Jan): Mit V-FI-55 (nur native Schritte, +6,6 MB) und dem vollen Block (+5–7 MB) wüchse ein Slot von
18,5 auf ≈ 30 MB gz, also ≈ 11–12 GB/Jahr. GitHub warnt ab 5 GB, das wären ≈ 5 Monate. Das Kürzen halbiert den
Block.

**(a) Nachbarzellen tragen NUR die Ebenen, die PAP 3 mittelt.** Die nächste Zelle bleibt vollständig.
- Behalten (31 von 57 Ebenen):
  - Mittel, `_sd`, `_sd_ens` von t2m, td2m, u10, v10, gust, precip, clct, ps, snowlmt (27);
  - clcl, clcm, clch (3);
  - hModEff (1).
- Weg (26 Ebenen):
  - 14 Quantil-Ebenen `_q10/_q90`;
  - 4 Profil-Ebenen gammaEff/zBase/zInv/dTInv (nur nächste Zelle, `GRID_NEAREST_ONLY`);
  - 6 Druckflächen-Ebenen t/rh 925/850/700 (AP15 leitet aus der nächsten Zelle ab);
  - srcCount, ensCount (nur nächste Zelle).
- Anteil der weggelassenen Ebenen: t1 ≈ 44 %, t2 ≈ 29 %.
  - Das ist eine **Schätzung aus Chunk-Bytes** (**R** aus §0, ohne Zählwerte), **keine Slot-Messung**.
  - Die Zahl gilt, bis AP9 den echten Slot misst ⇒ (b).
- **Warum das Nachrechnen exakt bleibt** (von Jan am Code bestätigt, 18.09.):
  - `grid.ts` mittelt alles außer `GRID_NEAREST_ONLY` (Profilfelder, srcCount, ensCount); laut seinem Kopf (Z. 18)
    also auch die Quantile.
  - Die Ausgabe ist ohne die 14 Quantil-Ebenen und t850/t700/rh850/rh700 byte-gleich (`CUBE_ANSWER_PLANES`,
    `verify:pv-cube` (15)).
  - Mit AP15 kommen t850/t700 in die Antwortmenge, aber **nur aus der nächsten Zelle**; die bleibt vollständig,
    für den Block ändert sich nichts.
- **Nachweis in AP9 als Verifier:** Nachlauf mit gekürzten Nachbarn = Produkt-v2 byte-gleich, und zwar
  **beide Fälle**:
  - Ebenen-Bereiche **aus** (alle 57 Ebenen dekodiert, Quantile gemittelt, aber ungelesen);
  - Ebenen-Bereiche **an**.
  - Negativkontrolle: eine **behaltene** Nachbarebene stören ⇒ Abweichung.

**(b) Das Slot-Wachstum wird in AP9 gemessen, bevor das Schema eingefroren wird.**
- Gemessen wird am echten Slot mit dem **gekürzten** Block:
  - gz-Bytes des Würfelteils vor und nach dem Block;
  - Hochrechnung GB/Jahr zusammen mit V-FI-55;
  - **Monate bis zur 5-GB-Warnung** bei einem Slot je Tag.
- Erst mit dieser Zahl friert AP9 Schema 3 ein (Jans Freigabe).

---

## §7 Risiken

| # | Risiko | Gegenmaßnahme |
|---|---|---|
| RV1 | Ersatzprofil grob: Treffer 34,6 %, Fehlalarm 21,0 % im t1-Schatten; flache Inversionen < 925 hPa nur als dicke Schicht (Dicke p50 ≈ 430 m) | Flag, `set`, σ-Aufweitung B/C. AP9 vergleicht B1 gegen den Ersatz bei \|Δh\| > 300 m. 1000/950 hPa wären Producer-Ebenen (V-FI-78, R10) |
| RV2 | Späte Werteänderungen (κ, Chunk-Rand) irritieren | Die erste Darstellung zählt; die Nachlieferung markiert (Panel-Marke wie „Windkorrektur folgt") |
| RV3 | totalJs-Ratsche | E-F-21; je AP gemessen |
| RV4 | WorldCover-Kacheln am Edge kalt (V-FI-57) | d_water und κ bleiben spät; Cache je Ort |
| RV5 | Archivwachstum: V-FI-55 und der volle Block ⇒ ≈ 30 MB gz je Slot ≈ 11–12 GB/Jahr; GitHub-Warnung bei 5 GB nach ≈ 5 Monaten (Jan, 18.09.) | E-F-19 (a): Nachbarn nur 31 PAP-3-Ebenen (Block ≈ halbiert). (b): in AP9 messen, bevor das Schema einfriert |
| RV6 | Parallele AP9-Session | Keine Datei unter `scripts/punktarchiv/**` und kein §9.13 vor AP9. Neue Optionen sind voreingestellt aus ⇒ der Sammler ist unverändert, bis er sie setzt |
| RV7 | Nachlauf-Determinismus | Der Slot trägt die Options-Kombination und die calib-Version (Anforderung an AP9) |
| RV8 | 403 am Nachbar-Chunk (V-FI-5) | Rückfall beschnitten + Flag |
| RV9 | z0mod-Schnappschuss im Winter (Schnee) | Monatlich neu; Wintermessung als V-FI |
| RV12 | ICON-z0 könnte einen Orographie-Anteil tragen ⇒ falsche Paarung mit dem orographiefreien z0_true, Faktor im Gebirge zu groß | In AP17 zuerst messen (Flachland gegen Alpen); sonst nur Flachland oder Anteil abziehen |
| RV13 | Neue Optionen nicht schaltbar bzw. Cache mischt Varianten (V-FI-79) | AP13 reicht `CubeIo.fuse` durch und nimmt die Options-Bits in den Schlüssel |
| RV14 | calib.json ändert sich am selben Pfad (TTL 24 h) | Hash in der Provenienz; nie Wirkung in der Nachlieferung |
| RV10 | Lange Tasks auf Mobil (Ringsuche, κ) | Kosten-Gate ≤ 120 ms; sonst in den Worker |
| RV11 | Kalender: A, A_uhi, φ wetterabhängig | Fit meldet n und Reifedatum, schreibt nichts vorher |

---

## §8 Definition of Done und Wirkung

**Je Etappe:**
- Verifier grün mit Negativkontrolle.
- Latenz vorher/nachher am selben Tag.
- Budget.
- Fünf Fragen.
- Jede Zahl gemessen oder `set`.
- Statusblock (CLAUDE.md) ersetzt, `MANUELLE-SCHRITTE.md` §18 mit Jans Gates:
  - Freigabe des konkreten AP17-Diffs (E-F-15) und Producer-Push;
  - Slot-Wachstum vor dem Einfrieren von Schema 3 (E-F-19 b);
  - Publisher-Weg der Fit-Werte (E-F-20, S&F);
  - Ratsche je AP (E-F-21);
  - Einschalten `crossChunk`.
- Keine Pushes.

**Gebaut/wirksam, neu gezählt nach expliziter Regel.**
Regel:
- 36 Elemente = die rechnenden Kästen von PAP 1–6.
- „wirksam" heißt: ändert heute einen ausgegebenen Wert.
- Die 85/65 vom 18.09. hatten keine festgehaltene Regel.

| | vorher | nach AP13–AP17 |
|---|---|---|
| gebaut | 32/36 = **89 %** (fehlen: d_water, Profil t2/t3, κ, Bias-Korrektur je Quelle) | 35/36 = **97 %** (fehlt: Bias-Korrektur je Quelle — Archiv) |
| wirksam | 23/36 = **64 %** | 25/36 = **69 %** (+ Profil t2/t3, + κ; d_water nur Ausgabe) |

- Zusätzlich wirksamer, ohne die Zählung zu ändern:
  - PAP 3 für alle statt 76 % der Punkte;
  - Fall A mit Profil-Γ und Fall B bis 336 h statt 48 h (C in t2/t3 erst nach dem Backtest);
  - Modellseiten-z0 aus GRIB.
- Die übrigen 11 Punkte zu 100 % hängen am Archiv (AP10): TPI/SVF/imperv/f_rad/Kaltluftsee/Wärmeinsel/Föhn/f_saison
  wirken erst mit A/A_uhi; dazu Σ-Fusion, Bias-Korrektur, σ_sys/c gemessen.

---

## §9 Etappenprotokoll

Seit Jans Freigabe (18.09.) ist dieses Dokument das Phasendokument der Linie AP13–AP17. Findings zählen ab
**V-FI-80**. Es gelten die Regeln aus §4 (Zuständigkeiten) und §5.

### 9.1 AP13 — Optionen durchreichbar, calib Schema 2 und Leser, Fit-Kern (ab 2026-09-18, 16:25 UTC)

#### 9.1.1 Diagnose (vor dem Code, am Baum vom 18.09.)

**Ausgangsstand, gemessen:**
- Verifier einzeln (§0):
  - `verify:pv-cube` 246/246,
  - `verify:pv-fusion` 229/229,
  - `verify:punktarchiv` 103/103,
  - `verify:point-client` 136/136.
- Latenz vorher: `audit/fusion-implementierung/latency/2026-09-18T16-25-44-456Z.json` (`--only=cubep`, 10 Orte).

| Profil / Szenario (p50 · p95, ms) | erste Darstellung | ganzes Fenster | letzte Ausgabe |
|---|---|---|---|
| desktop-none kalt (`cube-cold-prog`) | 780 · 911 | 910 · 2 337 | 2 801 · 5 592 |
| desktop-none warm | 111 · 138 | 188 · 213 | 2 587 · 5 089 |
| mobile-4g kalt | 1 678 · 2 006 | 2 593 · 2 913 | 4 281 · 6 276 |
| mobile-4g warm | 139 · 262 | 418 · 535 | 2 052 · 2 195 |

**Wo die Kalibrierwerte heute stehen** (alle im Code, keiner aus `calib.json` — V-FI-66):
- `uncertainty.ts`:
  - `C_SPREAD` 1 (Z. 48);
  - `SIGMA_SYS_FLOOR_A1` (Z. 56–58);
  - `CONF_DISCOUNT` (Z. 65–73);
  - `sigmaSysAt` = max(Boden, Skill-Prior) (Z. 77–82).
- `grid.ts`: `GRID_SET.lhM` 200 (Z. 30); L_d = `tier.deg · GRID_SET.mPerDeg` (`cubeSource.ts:438`).
- `terrainTerms.ts` `TERRAIN_SET`: a, vRef, ε, zBlend (Z. 31–44), modulintern.
- Amplituden: `FuseCubeOptions.terrainCalib` (A, A_uhi, tpiSigma, z0) ist die einzige bestehende Einspeisestelle
  (`cubeSource.ts:391,478`).

**V-FI-79 bestätigt am Code:**
- `forecastFromBundle` ruft fest `fuseCubePoint(input, { hourly: true, tail: true })` auf (`cubeSource.ts:1166`).
- `getPointForecastFromCube` schlüsselt den Ergebnis-Cache mit `pfCacheKey(…)` ohne Optionen (`cubeSource.ts:1223`).
- Folge: Keine `FuseCubeOptions` erreicht das Produkt, und ein Cache-Treffer könnte eine andere Variante liefern.

**calib-Datei:**
- `CALIB_SCHEMA` 1; `CalibEntry` ohne n/period.
- Der Selbsttest verbietet `measured` pauschal (`calibration.ts:165-170`).
- Der Publisher schreibt `CALIBRATION_V1` (`publish-point.mjs:211`). Die veröffentlichte Datei muss **Schema 1
  byte-gleich** bleiben, bis der Publisher-Weg (E-F-20, S&F) ansteht. Schema 2 ist also nur lesbar und prüfbar, wird
  noch nicht ausgeliefert.
- Der Store hält `calib.json` 24 h (`cache.ts:66`).
- Der v2-Codec trägt `provenance` wörtlich (`v2codec.ts:457,613`); ein neues Feld `calibHash` übersteht den Rundweg.

**V-FI-68 bestätigt:**
- `CALIB_KEYS_OF` (`output.ts:304-312`) nennt `vertResidual/lapse/gammaCap/lapseTd/clct`; das emittiert niemand.
- Emittiert, aber nie zugeordnet: `sigmaVert`, `sigmaQuant`, `standardLapse`, `phi`, `dzSurface`, `hTrue`,
  `stationSigma`, `confidence`, `footprint`, `precipSigma`, `meltOffset`.
- `calibByVar` liest außerhalb von `fusion/` niemand (Panel nicht). Die Korrektur ändert nur Metadaten der v2-Ausgabe,
  keine Werte.

**Was AP13 an Parametern verdrahtet** (Entscheidung dieser Etappe; nur `measured` wirkt, alles hinter
`calibSource: 'json'`):

| Schlüssel (calib.json) | Einspeisestelle | Warum jetzt / warum nicht |
|---|---|---|
| `sigmaSys` je Größe × Vorlauf-Bin | `memberSigma` des **Cube-Members** (ersetzt max(Boden, Skill-Prior)) | AP10 schreibt ihn zuerst (≈ 14.10.). Das Stationsmember bleibt `stationSigma:set` — eigener Schlüssel später |
| `cSpread` je Größe × Bin | `memberSigma` (σ = c·σ_ens) | wie σ_sys |
| `Ld` (m je Stufe), `Lh` (m) | `gridStep` | Fit ab 2×2-Block im Archiv |
| `A`, `Auhi`, `tpiSigma` (Wert `default`) | `terrainCalib` (bestehend); ausdrücklich gesetztes `terrainCalib` hat Vorrang | regionale Werte später; heute nur `default` |
| `fRad.a/vRef/epsilon`, `zBlend` | `terrainTerms` / `windBlendingFactor` (neue optionale Parameter) | A wird mit f_rad gemeinsam gefittet; z_b wirkt heute schon (Wind-Blending hinter `?pf=cube`) |
| `confDiscount` je Flag | `confidenceOf` | Registry-Parameter |
| `phi.knots`, `poolDepth`, `kappaLambda`, `meltOffset`, `sigmaMatrix`, `dzMin` | **nicht verdrahtet** — ein `measured`-Wert erscheint als Notiz „gemessen, noch ohne Einspeisestelle" | φ und poolDepth brauchen eine Formänderung in `vertical.ts` (AP10); κ kommt mit AP16; meltOffset wirkt im Motor; Σ und dzMin gehören dem Producer |

**Kostenrahmen:**
- `calibFit.ts` wird von keinem App-Modul importiert ⇒ 0 Bundle.
- Leser und Durchreichung liegen im Cube-Chunk (lazy); gemessen wird nach dem Bau.

#### 9.1.2 Umgesetzt (nur `src/point/**`, `src/pointForecast/**`, eigene Verifier, `budget.json`; kein Producer, kein Publisher, keine AP9-Datei)

| Datei | Was |
|---|---|
| `src/point/calibDoc.ts` (neu) | Schema 2 von `calib.json`, eine Stelle für Fit und Leser. Enthält: Vorlauf-Bins `CALIB_BINS_H`/`calibBinOf` (Lücken fallen in den Bin davor), Mindestbeleg `CALIB_N_MIN` je Fit-Schlüssel (`set`, die Registry aus §2.5), `validateCalibDocument` (nur `measured` mit n, days, period, estimator, fitVersion, binsH; verwirft einzeln mit Grund; Schema 1 ohne `measured`; Producer-Parameter wie `dzMin` nie), `calibOverridesFrom` (Abbildung auf die Einspeisestellen; ohne Einspeisestelle ⇒ `unwired`) und `binnedAt` |
| `src/point/calibration.ts` | `CalibEntry` um die Schema-2-Felder erweitert (optional). **Das ausgelieferte Dokument bleibt Schema 1, byte-gleich** (der Publisher schreibt `CALIBRATION_V1`; E-F-20 = S&F). Selbsttest +4 Prüfungen (Regel an synthetischen Dokumenten, mit Negativkontrollen) |
| `src/point/client/calibPoint.ts` (neu) | `loadCalib(store)`: liest `point/calib.json` über den Store (24 h Cache, Priorität `low`), sha256 der Bytes, Prüfung, Abbildung. Nie still: fehlend, kein JSON, Schema 3 ⇒ Setzungen mit Notiz |
| `src/pointForecast/cubeSource.ts` | **V-FI-79:** `CubeIo.fuse` (Optionen erreichen das Produkt; `hourly`/`tail` fest), `CubeIo.calibSource: 'constants' \| 'json'` (Voreinstellung Konstanten). Cache-Schlüssel mit `cubeIoVariantKey` (leer ohne Optionen) und — **V-FI-80** — der Stunde einer eingespeisten Uhr. calib wird parallel zum Index geholt und **einmal** bei der ersten Ausgabe entschieden (keine Wirkung in der Nachlieferung); nicht-progressiv wartet höchstens `OBS_GRACE_MS`. `FuseCubeOptions.calib`: σ_sys/c je Bin nur für das Cube-Member; L_d je Stufe und L_h in `gridStep`; A/A_uhi/tpiSigma über `terrainCalib` (ein ausdrückliches `terrainCalib` hat Vorrang); f_rad und z_b; Konfidenz-Abschläge. Jede gemessene Wirkung steht als `…:measured — n, Tage, Zeitraum, Schätzer` in calib; ohne `calib` sind die Texte wörtlich die alten |
| `src/pointForecast/fusion/uncertainty.ts` | `memberSigma`: optional `sysOverride`, `cSpread`. `confidenceOf`: optional `discount`. Ohne sie wie bisher |
| `src/pointForecast/fusion/terrainTerms.ts` | `fRadOf(…, p)`, `TerrainTermsInput.fRadParams`, `windBlendingFactor(…, zBlendM)` — Voreinstellungen = `TERRAIN_SET` |
| `src/pointForecast/fusion/output.ts` | `provenance.calibFile` (nur mit `calibSource: 'json'`: Pfad, Schema, sha256, geltende Pfade). **V-FI-68:** `CALIB_KEYS_OF` nennt nur emittierte Schlüssel; elf fehlende ergänzt, fünf erfundene entfernt, `snowline` dazu. Ändert nur `provenance.calibByVar` (Metadaten) |
| `src/point/calibFit.ts` (neu) | Der Fit, entworfen vor den Daten: <br>• Vertrag mit dem Nachlauf (Fallsätze `SigmaCase`, `GridCase`, `TermCase`, `WindCase`, `PhaseCase`); <br>• `CALIB_REGISTRY` (17 Pfade, 14 fitbar); <br>• Schätzer: σ_sys (Momente, Block-Bootstrap über Tage, geblockte Raum-CV), c (Spread/Skill), Konfidenz-Abschläge (CRPS-Verhältnis), L_d/L_h/λ (CRPS-Gittersuche, Leave-one-region-out über die 12 fallstärksten 1°-Kacheln), A/A_uhi gemeinsam mit f_rad-Gittersuche (geschrieben nur, wenn das 90-%-Intervall 0 ausschließt), z_b, meltOffset (Maximum-Likelihood, logistische Phase), tpiSigma (ohne Archiv); <br>• Leck-Wächter (Wahrheit vor dem Slot ⇒ Abbruch; nach dem Stichtag ⇒ ausgeschlossen); <br>• harter Abbruch „Archiv zu kurz" mit Reifedatum je Parameter; <br>• `calibDocumentWith` (Schema-2-Dokument). <br>**In keinem App-Chunk** |
| `scripts/verify-calib-fit.mjs` (neu, `npm run verify:calib-fit`) | synthetisches Archiv mit bekannten Parametern (s. §9.1.3) |
| `scripts/verify-pv-cube.mjs` | Block (19), 10 Prüfungen |
| `scripts/verify-point-client.mjs` | Block (10p), 3 Prüfungen |
| `package.json` | Alias `verify:calib-fit` (additiv) |
| `budget.json` | totalJs 1 430 → 1 432 (E-F-21, Messwert s. §9.1.3; Jans Bestätigung in `MANUELLE-SCHRITTE.md` §18) |

#### 9.1.3 Gates und Messungen (18.09., Verifier einzeln, PowerShell ohne `2>&1`)

| Gate | Vorher | Nachher |
|---|---|---|
| `typecheck` | 0 | **0** |
| `verify:pv-cube` | 246/246 | **256/256** — Block (19): <br>• Negativkontrolle der Rechnung; <br>• σ_sys gemessen nur im belegten Bin; <br>• L_h gegen die Gewichtsformel (mit Negativkontrolle); <br>• A/tpiSigma `measured`, `terrainCalib` hat Vorrang; <br>• Konfidenz-Abschlag 0,5/0,9 exakt; <br>• V-FI-79 Durchreichung und getrennte Cache-Varianten; <br>• V-FI-80 Uhr im Schlüssel; <br>• ausgelieferte calib.json ⇒ v2 byte-gleich zu den Konstanten; <br>• fehlende Datei ⇒ Setzungen; <br>• Schema 2 im Produkt (gültig wirkt, ungültig einzeln verworfen); <br>• V-FI-68 Zuordnung |
| `verify:point-client` | 136/136 | **139/139** — (10p) Leser: sha256 gegen `node:crypto`, Bin-Suche, `unwired`, Producer-Parameter verworfen, nie still |
| `verify:point-data` | 974/974 (CLAUDE.md, 17.09.) | **978/978** — calib-Selbsttest +4 (Schema-2-Regel mit Negativkontrollen) |
| `verify:pv-fusion` | 229/229 | **229/229** (Live-Pfad unberührt) |
| `verify:punktarchiv` | 103/103 | **103/103** (unberührt) |
| `verify:calib-fit` (neu) | — | **14/14** in ≈ 60 s. Einzelergebnisse: <br>• σ_sys ±10 % (t2m 0,99…3,48 bei wahr 1,0…3,5); <br>• geblockte CV Spread/Skill 1,004…1,014; <br>• c 1,354…1,423 (wahr 1,4); <br>• Abschlag 0,801 (0,8); <br>• L_h 300 · L_d 5 529 m · λ 1, Leave-one-region-out-Gewinn 0,59; <br>• A 2,52 / A_uhi 0,98 (±20 %), Mittel über 5 Saaten ±5 %; <br>• z_b 80; meltOffset 180 m (wahr 150, ±30); tpiSigma 35,2 (35); <br>• Ausgabe von `calibDoc` ohne Verwerfung angenommen; <br>• 7 Tage ⇒ „Archiv zu kurz", σ_sys reif ≈ 13.10.; <br>• vertauschte Wahrheit ⇒ A/A_uhi nicht geschrieben; <br>• Leck-Wächter; zwei Läufe byte-gleich |
| Build | 241/241 | **241/241** |
| Budget | eagerJs 107,9 · totalJs 1 427,6 / 1 430 | **eagerJs 107,9 (unverändert)** · eagerCss 2,4 · largestChunk 301,3 (FireRoute, nicht berührt; Bau-Rauschen +0,1) · **totalJs 1 431,5 / 1 432** — Ratsche nach E-F-21 um den Messwert angehoben (+3,9 KB, alles im Lazy-Chunk `cubeSource`). Textsonde am Bau (mit Gegenprobe): `calibFit` in keinem Chunk, Prüfer und Leser nur in `cubeSource-*.js`, nichts in `index-*.js` |

**Byte-Gleichheit gegen den Stand vor AP13**, eigens gemessen:
- Aufbau: `git archive HEAD` = Baum vor AP13, im Scratchpad. Fixture-Produkt über `getPointForecastFromCube`, mit
  Klimatologie und flachem Gelände, einmal ohne und einmal mit Anker.
- Ergebnis: v2 (1,17 MB JSON, ohne `timing`/`fetched`) **byte-gleich**, `hours` gleich, calib-Texte gleich.
- Einziger Unterschied ist die bewusst korrigierte `provenance.calibByVar` (V-FI-68):
  - t2m vorher `Ld, Lh, kappa, cSpread, sigmaSys, A, Auhi, fRad, fSaison, tpiSigma, anchor`;
  - jetzt zusätzlich `phi, dzSurface, standardLapse, sigmaQuant, sigmaVert, confidence, stationSigma`.

**Latenz am selben Tag, derselbe Harnisch** (`--only=cubep --profiles=desktop-none,mobile-4g`, 10 Orte):
- Vorher: `latency/2026-09-18T16-25-44-456Z.json` (Index `e14eced`, t1 `2026091812`).
- Nachher: `latency/2026-09-18T17-02-35-260Z.json` (Index `ebded4b`, t1 `2026091815`).
- Der Cron hat dazwischen einen neuen Lauf veröffentlicht, die Datenlage ist also nicht identisch.

| p50 (p95), ms | erste Darstellung vorher → nachher | ganzes Fenster | letzte Ausgabe |
|---|---|---|---|
| desktop-none kalt | 780 (911) → **735** (941) | 910 → **911** | 2 801 → 1 625 |
| desktop-none warm | 111 (138) → **116** (260) | 188 → **190** | 2 587 → 505 |
| mobile-4g kalt | 1 678 (2 006) → **1 662** (2 019) | 2 593 → **2 610** | 4 281 → 4 314 |
| mobile-4g warm | 139 (262) → **128** (196) | 418 → **376** | 2 052 → 1 522 |

- Lesart: Die erste Darstellung und das ganze Fenster sind im Rahmen des Lauf-zu-Lauf-Rauschens unverändert.
  Erwartet, denn alle Optionen sind voreingestellt aus, und der Browser-Pfad rechnet byte-gleich.
- Die letzte Ausgabe hängt an Anker- und z0-Abrufen (extern) und streut stark; keine Aussage.
- **Nicht gemessen**: der Pfad mit `calibSource: 'json'` im Browser. Er ist nirgends eingeschaltet, `calib.json`
  ist gecacht (6 KB, Priorität `low`), und die Entscheidung fällt nie blockierend.

#### 9.1.4 Befunde (V-FI-80 …)

- **V-FI-80 — behoben (Nachlauf-Falle):** Der Ergebnis-Cache des Cube-Pfads war nur nach Ort und Schaltern
  geschlüsselt, nicht nach der eingespeisten Uhr.
  - Ein Nachlauf oder Sammler, der denselben Punkt für zwei Slots binnen 180 s rechnet, hätte das Ergebnis des
    ersten Slots zurückbekommen, ohne jedes Zeichen.
  - Kur: Mit `io.nowMs` steht die Stunde im Schlüssel.
  - Der Browser speist keine Uhr ein (`defaultCubeIo`), sein Schlüssel bleibt byte-gleich. Prüfung (19) e2.
  - **Mehrwert für Jan:** Der AP9-Nachlauf kann nicht still falsche Slots bewerten.
- **V-FI-81 — offen (Fixture, geteilte Datei):** Im Fixture haben alle vier Blockzellen dasselbe Δh (15 m); der
  Höhenterm von PAP 3 kürzt sich heraus.
  - Keine bestehende Prüfung konnte einen Fehler in L_h finden.
  - Block (19) hebt deshalb lokal eine Nachbarzelle um 150 m an und prüft die Gewichte gegen die Formel, mit
    Negativkontrolle.
  - **Umsetzungsskizze:** eine zusätzliche Fixture-Variante mit verschiedenen `hModEff` je Zelle in
    `scripts/lib/pvCubeFixtures.mjs` (geteilt mit AP9, nur additiv).
- **V-FI-82 — benannt:** Mit `calibSource: 'json'` läuft `calib.json` über denselben Store; `provenance.fetched`
  zählt die Datei mit (+1 Datei, ≈ 6 KB). Werte unberührt; die Prüfungen vergleichen ohne `fetched`.
- **V-FI-83 — offen (AP10):** A, A_uhi und tpiSigma wirken heute nur mit dem Wert `default`; regionale Werte (die
  calib-Form erlaubt sie) haben noch keine Zuordnung Punkt → Region.
  - **Skizze:** Regionen als Ländercode/Höhenband im Fit schreiben und in `calibOverridesFrom` nach `input.country`
    wählen.
- **V-FI-84 — offen (AP10-Registry):** Ein gemessenes σ_sys gilt nur für das Cube-Member. Das MOSMIX-Stationsmember
  behält `stationSigma:set` — gemessen ist der Fehler des Cube-Members, nicht der der Station.
  - **Skizze:** ein eigener Schlüssel `stationSigmaSys` mit einem `SigmaCase` je Stationsstunde.
- **V-FI-85 — offen:** tpiSigma ist ohne Archiv messbar (Registry „sofort"), in AP13 aber **nicht gemessen**. Es
  braucht einen Geländelauf über eine regionale Stichprobe (Terrarium-Kacheln, Netz).
  - **Skizze:** Diagnose-Skript `audit/fusion-vollform/tpi-sigma.mjs` in AP16 (dort wird das Gelände ohnehin
    angefasst); Ergebnis zuerst nur in der Fit-Ausgabe.
- **Beobachtung ohne Befund:** Ein einzelner Fit-Lauf lag bei A_uhi 2 SE daneben (0,98 statt 1,2, 90-%-Intervall
  knapp daneben). Über 5 und 8 Saaten ist der Schätzer unverzerrt (A 2,484 / A_uhi 1,188 bei wahr 2,5 / 1,2). Deshalb
  prüft (6b) das Mittel über Saaten statt eines Einzellaufs.

#### 9.1.5 Selbstverifikation und Gate-Urteil

1. **Funktionserhalt, einzeln:**
   - Keine Funktion entfernt. Alle neuen Wege sind voreingestellt aus (`CubeIo.fuse`, `calibSource`,
     `FuseCubeOptions.calib`).
   - Gegen den Baum vor AP13 ist das Produkt byte-gleich, bis auf die Metadaten `calibByVar` (§9.1.3).
   - Live-Pfad `verify:pv-fusion` 229/229 unverändert. Das veröffentlichte `calib.json` bleibt Schema 1 (der Publisher
     ist unberührt).
2. **Desktop pixelgleich:**
   - Keine UI-Datei geändert.
   - `calibByVar` liest außerhalb von `fusion/` niemand (Suche über `src/pointForecast/*.tsx`). Das Panel zeigt es
     nicht, `calibFile` erscheint nur mit `calibSource: 'json'`.
   - Kein Bildschirmfoto, weil keine Darstellung berührt ist.
3. **Touch-Targets ≥ 44 px:** keine neue UI.
4. **Konsole:**
   - Der Leser schreibt nie auf die Konsole, nur Notizen in die Provenienz.
   - Keine neue `console.*`-Zeile in `src/` (Suche).
5. **Long Tasks:**
   - Im voreingestellten Pfad keine neue Arbeit im Hauptthread.
   - Mit `calibSource: 'json'`: eine JSON-Prüfung von ≈ 6 KB. `fitCalib` läuft nie im Browser.
   - Headless-shell misst keine Long Tasks (bekannte Grenze, Real-Device offen wie §9.15).

**Gate AP13: grün**, mit zwei Vorbehalten, die Jans Entscheidung brauchen (`MANUELLE-SCHRITTE.md` §18):
- die Ratschen-Zahl totalJs 1 432 (E-F-21);
- der Publisher-Weg der Fit-Werte (E-F-20), der erst ansteht, wenn AP10 schreibt.

**Nicht in AP13, benannt:**
- tpiSigma gemessen (V-FI-85 → AP16);
- die CLI `scripts/punktarchiv/fit-calib.mjs` (nach AP9, sie importiert dessen Nachlauf);
- regionale Amplituden (V-FI-83).

### 9.2 AP14 — Nachbar-Chunk im Leser (Lücke 3; ab 2026-09-18, 17:40 UTC)

#### 9.2.1 Diagnose (vor dem Code, am Baum nach AP13)

**Was es heute gibt:**
- `readPointBundle` holt je Stufe **einen** Chunk (`readTier`, `readPoint.ts:310-382`).
- `cubeSeriesFrom` liest mit `neighbours: true` den 3×3-Ring **aus demselben entpackten Chunk**. Am Rand fehlen
  Zellen (`cubePoint.ts:323-350`).
- `gridStep` wählt daraus den 2×2-Block nach `blockOffsets` (`grid.ts:70-78`) und markiert `truncated`, wenn eine
  Blockzelle fehlt. Das Produkt zeigt dann `chunkBorderTruncated`, der Konfidenz-Abschlag ist 0,9.
- Späte Produkte laufen im progressiven Modus als Versprechen in `bundle.late` (static, nowcast, index).
  `cubeSource` rechnet sie in EINER Nachlieferung nach (`update`), z0 in einer eigenen letzten Ausgabe (`z0Later`).
- Die Nachlieferung sendet nur bei Neuem, und `z0Later` nutzt das Bündel seines Zeitpunkts
  (`cubeSource.ts:1353-1354`). Ein zusätzliches spätes Produkt braucht deshalb eine **eigene** Ausgabe.
- Nicht über das `Promise.all` der Nachlieferung: Dort würden Anker und Radar warten (z0-Lehre, ≈ +0,9 s).

**Gemessen:**
- §0, am 18.09.: Randanteil über 405 Archivpunkte t1 12,6 %, t2 14,1 %, t3 8,4 %, irgendeine Stufe 24,0 %.
  Gleichverteilt korrigiert 11,8 / 11,4 / 10,9 / 24,5 % (s. §0).
- Zusatz-Chunks je Randstufe 1, an Ecken 3.
- Nachbar-Chunks am Edge HIT, Desktop +28–63 ms, +172–565 KB je Randstufe.
- Harnisch-Orte am Rand: Graz t1+t2, Berlin t2+t3.
- Das Skript dazu kommt in dieser Etappe nach `audit/fusion-vollform/chunk-border.mjs` (BW-1, Jans Punkt D).

**Entwurf** (§2.3, mit den Punkten des Gegenlesers):
1. **Eine Regel für den Block:**
   - `blockOffsets` zieht aus `grid.ts` nach `cubeFormat.ts` (Geometrie des Cube-Gitters); `grid.ts` exportiert
     sie weiter.
   - Leser und PAP 3 fragen dieselbe Funktion. Ohne das zöge der Leser andere Zellen nach, als PAP 3 wählt.
2. **Leser:**
   - `ReadPointOptions.crossChunk` (Voreinstellung aus; wirkt nur mit `neighbours`).
   - Je Stufe die Blockzellen außerhalb des eigenen Chunks (innerhalb des Gitters) → Chunk-Pfad **desselben Laufs**
     (`series.run`, also an den gelesenen Zeiger gebunden, nie an eine SWR-Nachprüfung).
   - Die Chunks laufen über denselben Store (Cache, raw-Rückfall) und denselben Dekodierer; die Zellen hängen an
     `series.neighbours`, in derselben Form wie die Ring-Zellen.
   - Rein und prüfbar: `cellsFromChunk` (Zelle muss im Chunk liegen, sonst Abbruch — Schutz gegen einen
     verschobenen Chunk).
   - Nicht-progressiv (Sammler, Nachlauf, Verifier): Die Zellen sind im Bündel.
   - Progressiv: `late.crossChunk = { result, skip }`. Das Ergebnis sind die Zellen je Stufe, das Bündel bleibt
     unverändert.
   - Scheitert ein Abruf (403, Frist, 404), gibt es eine Notiz, und der Block bleibt beschnitten mit Flag.
   - `readCubePoint` (vom Sammler benutzt) bleibt unberührt.
3. **cubeSource:**
   - `CubeIo.crossChunk` (Voreinstellung aus, **nicht** in `defaultCubeIo` — Einschalten im Browser erst nach dem
     Randbefund, E-F-18).
   - Steht im Cache-Schlüssel (`cubeIoVariantKey`).
   - Progressiv: eine **eigene** Ausgabe, sobald die Zellen da sind. Sie rechnet mit dem letzten Stand
     (Nachlieferung, z0), und jede spätere Ausgabe trägt die Zellen mit.
   - `pending` nennt `crossChunk`.
4. **Harnisch:** Gruppe `cubecc` im Latenz-Harnisch (ohne gegen mit, kalt und warm, im selben Lauf; Orte Graz,
   Berlin und München als Innenort-Gegenprobe). Lab-Option `cc`.

**Abnahme:**
- Negativkontrolle „Option aus ⇒ byte-gleich".
- Ring über die Grenze = Zellen aus einem zusammengesetzten Feld; verschobener Chunk wird abgewiesen; 403 ⇒
  beschnitten mit Flag.
- Randpunkt mit vollem Block ⇒ kein Flag, gleiche Werte wie eine Rechnung, die alle Zellen in einem Chunk hat.
- Latenz: erste Darstellung an Graz/Berlin unverändert, die eigene Ausgabe berichtet.

#### 9.2.2 Umgesetzt (nur `src/point/**`, `src/pointForecast/**`, eigene Verifier, Harnisch; kein Producer, keine AP9-Datei)

| Datei | Was |
|---|---|
| `src/point/cubeFormat.ts` | **Eine Regel:** `blockOffsets` (aus `grid.ts` hierher) und neu `blockCellsOutsideChunk(tier, lat, lon)` — die Blockzellen außerhalb des eigenen Chunks, nach Chunk gruppiert (leer im Inneren; 1, an Ecken 3 Chunks; jenseits des Gitters keine) |
| `src/pointForecast/fusion/grid.ts` | importiert und exportiert `blockOffsets` weiter (Bestand, Verifier unverändert) |
| `src/point/client/cubePoint.ts` | Das Auslesen einer Zelle ist eine gemeinsame Hilfe (`cellFromChunk`) für den Ring und die Nachbar-Chunks — dieselbe Dequantisierung, dieselbe Form. Neu `cellsFromChunk`: bricht ab, wenn eine Zelle nicht im Chunk liegt oder Ebenen-/Schrittzahl nicht zur Reihe passen (Schutz gegen einen falschen Chunk). `readCubePoint` (Sammler) unberührt |
| `src/point/client/readPoint.ts` | `ReadPointOptions.crossChunk` (voreingestellt aus, nur mit `neighbours`). Je Stufe die Nachbar-Chunks **desselben Laufs** (`series.run`), über denselben Store (Cache, raw-Rückfall), denselben Dekodierer, Priorität `low`. Nicht-progressiv wartet der Leser (Sammler, Nachlauf); progressiv gilt, was zum Kern da ist, sonst `late.crossChunk` mit Grund in `skips`. Rein: `withCrossChunk(bündel, ergebnis)` (Kopie, keine Doppelzellen). Stufen in fester Reihenfolge (deterministische Notizen). Fehlschläge: 404 ⇒ Notiz, Ausnahme ⇒ `errors`; der Block bleibt beschnitten mit Flag |
| `src/pointForecast/cubeSource.ts` | `CubeIo.crossChunk` (voreingestellt aus, **nicht** in `defaultCubeIo`), im Cache-Schlüssel (`…\|cc`; ohne die Option die AP13-Schlüssel wörtlich). Progressiv eine **eigene** Ausgabe, sobald die Zellen da sind: sie rechnet mit dem letzten Stand (Kern, Nachlieferung oder z0), jede spätere Ausgabe trägt die Zellen mit (`cur`), `pending` nennt `crossChunk` bis dahin |
| `scripts/lib/pvCubeFixtures.mjs` (geteilt, additiv) | Optionen `absolute` (Signatur am absoluten Gitterindex) und `neighbourChunks` (die Nachbar-Chunks als weitere Dateien). Ohne sie byte-gleich |
| `scripts/verify-point-client.mjs` | (10q), 4 Prüfungen |
| `scripts/verify-pv-cube.mjs` | (20), 4 Prüfungen |
| `scripts/verify-pv-latency.mjs`, `scripts/pv-latency/lab.ts` | Gruppe `cubecc` (ohne gegen mit, je Variante ein Isolat, kalt dann warm), Lab-Option `cc`; je Ausgabe `border` (Schritte mit Flag) und `cc` |
| `audit/fusion-vollform/chunk-border.mjs` (neu) | das Diagnose-Skript zu §0 (Jans Punkt D) |

#### 9.2.3 Gates und Messungen (18.09., Verifier einzeln)

| Gate | nach AP13 | nach AP14 |
|---|---|---|
| `typecheck` | 0 | **0** |
| `verify:point-client` | 139/139 | **143/143** — (10q): <br>• Ring über die Grenze = zusammengesetztes Feld (4/4 Zellen, Graz t1 + t2); <br>• ohne Option byte-gleich und kein Mehrabruf (10 → 12 Abrufe nur mit Option); <br>• verschobener Chunk abgewiesen, fehlender benannt, 403 als Fehler — Block bleibt beschnitten; <br>• progressiv `late.crossChunk`, Bündel unverändert, `withCrossChunk` idempotent |
| `verify:pv-cube` | 256/256 | **260/260** — (20): <br>• Graz 68 → 0 Schritte mit Flag; <br>• Negativkontrolle byte-gleich, Cache-Schlüssel `…\|cc`, AP13-Schlüssel wörtlich; <br>• PAP 3 n = 4, Versätze = `blockOffsets`, Gewichte nach Formel; <br>• progressiv: Kern mit `pending` crossChunk, dann genau eine eigene Ausgabe ohne Flag. <br>Kosten-Prüfung (4): ein Lauf 124 ms (> 100), zweimal allein wiederholt 61,6 / 64,2 ms ⇒ Rauschen der Maschine, benannt |
| `verify:point-data` / `pv-fusion` / `punktarchiv` / `calib-fit` | 978 / 229 / 103 / 14 | **978 / 229 / 103 / 14** (unberührt) |
| Build · Budget | 241/241 · totalJs 1 431,5 / 1 432 | **241/241** · eagerJs **107,9 (unverändert)** · largestChunk 301,2 · **totalJs 1 432,8 / 1 433** (E-F-21: +1,3 KB, alles im Lazy-Chunk `cubeSource`; Textsonde mit Gegenprobe: nichts in `index-*.js`) |
| Randskript `chunk-border.mjs` | — | reproduziert §0 exakt (Archiv 12,6 / 14,1 / 8,4 / 24,0 %; Graz, Berlin); die gleichverteilten Zahlen korrigiert (V-FI-86) |

**Byte-Gleichheit ohne Option gegen den Stand vor AP13** (`git archive HEAD` im Scratchpad, Fixture mit
Klimatologie und flachem Gelände):
- München und Graz (Randort), je nicht-progressiv und progressiv.
- Alle Ausgaben byte-gleich: gleiche Zahl, gleicher Inhalt, 1,2–2,2 MB JSON je Fall.
- Ausgenommen sind nur `timing`, `fetched` und das bewusst korrigierte `calibByVar` (AP13).

**Latenz, derselbe Tag, derselbe Lauf:**
- Datei: `latency/2026-09-18T17-32-20-129Z.json`.
- Aufbau: `--only=cubecc --places=graz,berlin,muenchen --profiles=desktop-none,mobile-4g --repeats=2`, je Variante
  ein Isolat; Index `ebded4b`.
- Werte je Ort, zwei Wiederholungen, in ms:

| Ort · Profil | erste Darstellung ohne → mit | ganzes Fenster ohne → mit | eigene Ausgabe „voller Block" (kalt · warm) | Draht kalt |
|---|---|---|---|---|
| Graz · Desktop | 835 / 807 → 867 / 861 | 915 / 870 → 927 / 923 | 974 / 975 · 309 / 256 | 2 573 → 3 354 KB (+2 Abrufe) |
| Berlin · Desktop | 791 / 718 → 806 / 877 | 860 / 786 → 880 / 942 | 942 / 1 001 · 306 / 294 | 1 650 → 2 056 KB (+2) |
| München · Desktop (Innenort) | 751 / 739 → 904 / 774 | 816 / 806 → 968 / 837 | — (kein Rand) | 1 845 → 1 845 KB |
| Graz · Mobil-4G | 1 970 / 1 988 → 1 994 / 1 988 | 2 667 / 2 688 → 2 864 / 2 658 | 3 324 / 3 378 · 670 / 616 | 2 573 → 3 348 KB |
| Berlin · Mobil-4G | 1 481 / 1 430 → 1 467 / 1 443 | 2 117 / 2 047 → 2 061 / 2 110 | 2 806 / 2 826 · 803 / 685 | 1 650 → 2 056 KB |
| München · Mobil-4G (Innenort) | 1 790 / 1 859 → 1 884 / 1 838 | 2 496 / 2 560 → 2 542 / 2 531 | — | 1 845 → 1 847 KB |

- **Erste Darstellung und ganzes Fenster: unverändert im Rauschen.** Der Innenort München, an dem die Option
  nichts tut (gleiche Abrufe), streut zwischen den Varianten um bis zu +153 ms (Desktop kalt); dieselbe Größenordnung
  haben die Unterschiede an den Randorten.
- Der volle Block kommt als eigene Ausgabe:
  - kalt auf dem Desktop ≈ 0,1 s nach dem ganzen Fenster;
  - auf Mobil-4G ≈ 0,7 s danach (die +406–781 KB auf 9 Mbit);
  - warm 0,26–0,80 s nach dem Start.
- Das Flag verschwindet in allen Rand-Läufen (70 bzw. 57 Schritte → 0).
- München: keine Zusatzausgabe, keine Zusatzbytes (Gegenprobe).

#### 9.2.4 Befunde (V-FI-86 …)

- **V-FI-86 — behoben (Zahl):** Die gleichverteilten Randanteile der ersten Sonde (§0: 12,9 / 11,5 / 11,0 / 25,4 %)
  kamen aus einem Gleitkomma-LCG `(x·1103515245 + 12345) mod 2^31`. Er rechnet über 2^53 und verliert Stellen, die
  Stichprobe war schief.
  - Mit 32-bit-LCG: 11,8 / 11,4 / 10,9 / 24,5 %; analytisch 11,9 / 11,5 / 10,9 %.
  - Die Archivzahlen (die maßgeblichen) waren nicht betroffen.
  - **Lehre:** Zufallszahlen in Sonden nur mit `Math.imul`-LCG oder aus `crypto`.
- **V-FI-87 — offen (klein):** Die erste Darstellung (nur t1, vor dem Kern) weiß noch nicht, dass ein Nachbar-Chunk
  folgt. Ihr `pending` nennt `crossChunk` nicht, ein Panel könnte „Verfeinerung folgt" also erst ab dem Kern zeigen.
  - **Skizze:** `blockCellsOutsideChunk` braucht nur Index und Koordinaten; der Leser kann den Bedarf vor dem ersten
    Abruf kennen und in `onFirst` nennen.
- **V-FI-88 — offen (Verbesserung):** Beim Wiederbesuch liegen die Nachbar-Chunks im IndexedDB-Cache, kommen aber
  trotzdem als eigene Ausgabe (Desktop 0,26–0,31 s, Mobil 0,62–0,80 s). Der Abruf startet erst, wenn der eigene
  Chunk dekodiert ist, und der Kern wartet nicht.
  - **Skizze:** Die Nachbar-Chunks gleich mit dem eigenen Chunk anstoßen. Pfad und Lauf kennt der Index; die
    Ebenenliste liefert der Kopf des Nachbar-Chunks selbst (`planesForChunkHeader`).
  - Warm stünde der volle Block dann schon im Kern.
  - Kalt auf Mobil teilen sich dann aber die Bytes vor der ersten Darstellung ⇒ nur für Cache-Treffer oder erst nach
    der ersten Stufe; am selben Harnisch messen.
- **V-FI-89 — benannt:** Nicht-progressiv (ohne `onUpdate`) wartet der Leser mit `crossChunk` auf die Nachbar-Chunks
  ohne Frist. So gewollt für Sammler und Nachlauf; im Browser ruft das Panel progressiv auf.
- **Beobachtung:** Die Kosten-Prüfung (4) lag einmal bei 124 ms, zweimal allein wiederholt bei 62/64 ms. Die
  Rechnung ist durch AP14 nicht berührt (nur das Lesen).

#### 9.2.5 Selbstverifikation und Gate-Urteil

1. **Funktionserhalt:**
   - Nichts entfernt; die Option ist voreingestellt aus und nicht in `defaultCubeIo`.
   - Ohne sie ist das Produkt byte-gleich zum Stand vor AP13, auch progressiv und am Randort.
   - `readCubePoint` (Sammler) ist unberührt, `blockOffsets` bleibt aus `grid.ts` exportiert.
2. **Desktop pixelgleich:** keine UI-Datei geändert; ohne Option unveränderte Ausgaben (s. o.).
3. **Touch-Targets:** keine neue UI.
4. **Konsole:** keine neue `console.*`-Zeile in `src/`; Fehlschläge stehen in `errors`/`notes` des Bündels.
5. **Long Tasks:**
   - Der Nachbar-Chunk wird im Worker-Pool dekodiert (derselbe Dekodierer).
   - Die eigene Ausgabe ist eine Rechnung wie jede Nachlieferung (≈ 0,2 s Mobil, §9.14); in headless-shell nicht
     messbar.

**Gate AP14: grün.**
- Offen, bei Jan: Die Ratschen-Zahl totalJs 1 433 (E-F-21).
- **Einschalten im Browser erst nach dem Randbefund aus dem Archiv** (E-F-18). Den Befund liefert der AP9-Nachlauf
  mit dem gekürzten 2×2-Block: beschnitten gegen vollständig, gepaart an denselben Punkten.

### 9.3 AP15 — Druckflächen-Profil t2/t3 zur Laufzeit (Lücke 2; ab 2026-09-18, 18:00 UTC)

#### 9.3.1 Diagnose (vor dem Code, am Baum nach AP14)

**Was es heute gibt:**
- `cubeSampleOf` setzt `profile` nur, wenn eines der vier Profilfelder belegt ist (`cubeSource.ts:323`). In t2/t3 ist
  das nie der Fall ⇒ `applyVertical` → `verticalCorrection` mit `profile: null` ⇒ Fall `std`, 6,5 K/km, Flag
  `stdLapseFallback`.
- Die Druckflächen t925/t850/t700 liegen in t2/t3 zu 100 % vor (§0); gelesen werden sie nur für `belowGround925`.
- `verticalCorrection` verlängert bei aufsitzender Inversion unter die Basis (Fall C, V-FI-15-Deckel = Mächtigkeit).
  Für ein grobes Profil schaltet E-F-14 das ab ⇒ neue Option `extendBelowBase` (voreingestellt wie heute).
- Die Producer-Regel `profileFromColumn` (`scripts/point/profile.mjs:64-100`) ist rein; ihre zehn Selbsttest-Fälle
  sind der Maßstab der TS-Portierung.
- Folgen für bestehende Prüfungen **nur mit der Option** (ohne sie unverändert): `verify-pv-cube.mjs:138, 311-315,
  803, 813` (13: „alle Flags haben eine Kontrolle" — `pressureProfile` wird die 15.) und 964 (Ebenen-Bereiche: mit
  der Option kommen t850/t700 zu `CUBE_ANSWER_PLANES`).
- Das Fixture hat in t2/t3 keine Inversion (t925 = t2m − 3) ⇒ additive Varianten in `pvCubeFixtures.mjs`.

**Reihenfolge dieser Etappe (Jans Punkt C):**
1. Die reine Funktion (Portierung + Säule der nächsten Zelle).
2. **Das Abnahme-Gate vor dem Archiv**, gemessen mit derselben Funktion am t1-Schatten:
   - (i) Standard-Lapse, (ii) Druckflächen-Profil, (iii) t1-Modelllevel-Profil als Referenz;
   - Γ-MAE, T-Fehler an Archivpunkten mit |h_true − hModEff| > 300 m, Wirkung der Fehlalarme getrennt.
   - Skript nach `audit/fusion-vollform/`, dazu das Skript der Druckflächen-Zahlen aus §0 (Punkt D).
3. Erst danach die Verdrahtung in `cubeSource`, voreingestellt aus. Schlägt (ii) die Standard-Lapse nicht, bleibt die
   Option aus — mit Zahl.

**Latenz vorher:** `latency/2026-09-18T17-43-28-696Z.json`, derselbe Aufruf wie in AP13
(`--only=cubep --profiles=desktop-none,mobile-4g`, 10 Orte).

#### 9.3.2 Das Abnahme-Gate vor dem Archiv (Jans Punkt C) — **rot**

**Aufbau** (`audit/fusion-vollform/pressure-profile-shadow.mjs`, netzlesend, deterministisch je Lauf):
- t1-Lauf `2026091815` (Index `ebded4b`), 129 Chunks (65,1 MB), gepinnt über raw.githubusercontent.
- Die 405 Archivpunkte an ihrer NÄCHSTEN t1-Zelle, h_true = Stationshöhe; alle Schritte mit Modelllevel-Profil:
  **17 820 Fälle** an 405 Punkten, davon **3 501 Fälle an 95 Punkten mit |h_true − hModEff| > 300 m**.
- Je Fall T an h_true nach PAP 4 (`verticalCorrection`) mit
  - (i) Standard-Lapse (`profile: null`),
  - (ii) Druckflächen-Profil `pressureProfileFromCell` nach E-F-14 (`extendBelowBase: false`; mit Fall C als „ii+C"),
  - (iii) dem Modelllevel-Profil der Zelle (Referenz, wie heute in t1).
- Ersatzprofil vorhanden in 15 813/17 820 Fällen; sonst < 3 Niveaus über Grund ⇒ Standard-Lapse.
- **(iii) ist keine Wahrheit**, sondern das ICON-D2-Profil. Es beginnt am untersten Modelllevel (20 Vollflächen ab
  Level 65, `dwdRegular.mjs:243-249`), **ohne t2m**, Γ über 500 m. AP9 wiederholt den Vergleich gegen Stationen.

**Γ gegen (iii):** MAE (i) 6,5 K/km **4,08 K/km** · (ii) **2,74 K/km** (n 15 813). Das Ersatz-Γ ist näher an t1 als
die Konstante.

**T-Fehler gegen (iii), |Δh| > 300 m — das Gate** (MAE in K):

| Schicht | n (Punkte) | (i) Standard | (ii) E-F-14 | (ii+C) | Bias (i) / (ii) |
|---|---|---|---|---|---|
| **alle** | 3 501 (95) | **1,39** | **1,94** | 1,93 | +0,57 / +0,26 |
| nachts (Ortssonnenzeit 21–5 h) | 1 275 (95) | 1,64 | 2,79 | 2,79 | +0,96 / +0,28 |
| tags (10–16 h) | 633 (88) | 1,23 | **0,87** | 0,87 | −0,15 / +0,12 |
| Treffer (ii und iii Inversion) | 165 (35) | 4,32 | **2,80** | 2,58 | +3,38 / +0,07 |
| **Fehlalarm** (ii Inversion, iii keine) | **297** (42) | 0,87 | **6,39** | 6,46 | +0,09 / −1,62 |
| verfehlt (iii Inversion, ii keine) | 593 (71) | 3,13 | 2,68 | 2,68 | +2,58 / +2,24 |
| beide ohne Inversion | 2 446 (90) | 0,83 | 1,16 | 1,16 | −0,05 / +0,01 |

- Zum Vergleich: alle |Δh| (17 820): 0,64 / 0,66 / 0,62; **|Δh| ≤ 300 m** (14 319, 331 Punkte): 0,46 / **0,34** /
  0,30.
- Fehlalarme: 297 von 462 (ii)-Inversionen = **64,3 %**. Der Planwert „Fehlalarm 21,0 %" (§1.2, RV1) hatte eine
  andere Basis (alle Zellschritte der t1-Stichprobe, Anteil der Fälle) und ist keine Gate-Zahl (V-FI-92).
- **Urteil nach Punkt C:** (ii) schlägt (i) bei |Δh| > 300 m **nicht** (1,94 gegen 1,39 K) ⇒ **die Option bleibt
  aus.** Tags, an Treffern und bei |Δh| ≤ 300 m ist (ii) besser; die Nächte kippen das Ergebnis.

**Ursache, gemessen mit Varianten an derselben Stichprobe** (nur Diagnose, keine davon ist das Produkt):

| Variante | \|Δh\| > 300 alle | nachts | tags | Punkt über / unter der Zelle (n 1 103 / 2 398) | Inv. Treffer / Fehlalarm | \|Δh\| ≤ 300 |
|---|---|---|---|---|---|---|
| (i) Standard-Lapse | **1,39** | 1,64 | 1,23 | 1,12 / 1,51 | — | 0,46 |
| E-F-14 (gebaut) | 1,94 | 2,79 | 0,87 | 1,94 / 1,94 | 165 / 297 | 0,34 |
| V-a Γ über der Inversion aus der Schicht darüber | 1,56 | 2,06 | 0,87 | 1,55 / 1,57 | 165 / 297 | 0,38 |
| V-b dTMin 1,5 K | 1,94 | 2,79 | 0,87 | 1,94 / 1,94 | 79 / 119 | 0,34 |
| V-c nur Γ, keine Inversion | 1,94 | 2,78 | 0,87 | 1,93 / 1,94 | 0 / 0 | 0,36 |
| V-d = V-a + V-b | 1,75 | 2,42 | 0,87 | 1,69 / 1,77 | 79 / 119 | 0,37 |
| V-e Γ nur aus den Flächen (ohne 2-m-Punkt) | **1,37** | 1,57 | 1,34 | 1,21 / 1,45 | 0 / 0 | 0,45 |
| V-f V-e, Γ ≥ 0 | 1,37 | 1,57 | 1,34 | 1,21 / 1,45 | 0 / 0 | 0,45 |
| V-g 2 m nur ohne Bodeninversion, sonst V-e | 1,41 | 1,78 | 0,87 | 1,22 / 1,50 | 0 / 0 | 0,42 |

- **Nicht die Inversionserkennung verdirbt das Ergebnis, sondern der 2-m-Punkt im Γ.** V-c ohne jede Inversion ist
  so schlecht wie E-F-14 (1,94). Ohne den 2-m-Punkt (V-e) liegt (ii) auf der Standard-Lapse (1,37 gegen 1,39).
- Nachts ist t2m von der Luft darüber entkoppelt (Strahlungs-Bodenschicht). Die Ausgleichsgerade über 1 500 m kippt
  dann gegen null oder ins Negative. (iii) beginnt am untersten Modelllevel und sieht diese Schicht nicht.
- Tags hilft der 2-m-Punkt (0,87 gegen 1,23/1,34). V-g, das den 2-m-Punkt nur ohne Bodeninversion nimmt, landet
  trotzdem bei 1,41.
- **Keine Variante schlägt (i) um mehr als das Rauschen eines Laufs.** Die Varianten sind an derselben Stichprobe
  gewählt (Überanpassung), und die Stichprobe ist eine Wetterlage (ein t1-Lauf, 0–48 h).
- Die t1-Druckflächen stammen nicht aus dem Modell von (iii): ICON-D2 hat keine 925 hPa (PD-E), t925 ist dort das
  Mittel der übrigen t1-Quellen. In t2/t3 sind es ICON-EU/IFS/AIFS bzw. IFS/AIFS. Der Schatten ist also eine
  Näherung für t2/t3 (V-FI-91).

**Druckflächen-Zahlen aus §0, nachgerechnet** (`audit/fusion-vollform/pressure-levels.mjs`, Punkt D; Index
`ebded4b`, Momentaufnahme, keine Klimatologie):

| Stufe · Lauf | unter Grund 925 / 850 / 700 | Inversion nachts / tags: U-15 `t850 > t925` · Boden `t925 > t2m` · **Ersatzprofil AP15** | hypsometrisch − Standard p10 / p50 / p90 (925 · 700) |
|---|---|---|---|
| t2 `2026091812` (§0: `…06`) | 11,0 / 4,4 / 0 % | 0,5 / 0,3 · 27,8 / 0,0 · **21,8 / 0,1 %** | 62 / 101 / 135 · 61 / 126 / 182 m |
| t3 `2026091800` (wie §0) | 11,5 / 4,8 / 0 % | 2,7 / 3,2 · 57,0 / 0,2 · **50,7 / 2,0 %** | 16 / 65 / 88 · 49 / 100 / 138 m |
| t1 `2026091815`, jeder 9. Chunk | 8,1 / 1,4 / 0 % | 0,1 / 0,0 · 47,8 / 0,0 · **41,4 / 0,0 %** | −6 / 57 / 105 · 23 / 96 / 167 m |

- t3 ist derselbe Lauf wie in §0 und reproduziert ihn exakt (Paar-Regel 51,3 / 2,0 % → Portierung 50,7 / 2,0 %).
- Das U-15-Kriterium „t2 nachts > tags" hält (21,8 gegen 0,1 %). Es sagt aber nichts über die Güte der Korrektur;
  das tut das Gate oben.

#### 9.3.3 Umgesetzt — und was bewusst NICHT

**Gebaut** (nur `src/point/**`, `src/pointForecast/**`, eigener Verifier-Block, zwei Diagnose-Skripte):
- `src/point/profileColumn.ts` (neu, rein):
  - `profileFromColumnTs`: wörtliche Portierung von `profileFromColumn` (Producer unberührt);
  - `pressureProfileFromCell`: die Säule der nächsten Zelle nach E-F-14;
  - `hypsometricHeight`, `PRESSURE_PROFILE_SET`.
- `src/pointForecast/fusion/vertical.ts`: Option `extendBelowBase` (Voreinstellung wie bisher). Ohne sie ist das
  Ergebnis bitgleich zur HEAD-Fassung: 20 000/20 000 Zufallsfälle, Negativkontrolle `false` weicht in 3 061 ab.
- `audit/fusion-vollform/pressure-profile-shadow.mjs` (das Gate, mit Varianten) und `pressure-levels.mjs` (§0-Zahlen).
- `scripts/verify-pv-cube.mjs` Block (21), 9 Prüfungen.

**Nicht gebaut, weil das Gate rot ist** (Abweichung vom Plan §4 AP15, meine Entscheidung, bei Jan zur Bestätigung):
- keine `FuseCubeOptions.pressureProfile`, kein Flag `pressureProfile`, keine calib-Zeile, keine Ebenen-Erweiterung;
- **keine Änderung an der `v2codec`-Flagtabelle** — sie ist mit AP9 geteilt, jede Änderung hebt `V2C_VERSION`;
- 0 Byte im Bundle.

Gründe:
- Die Option ließe sich nach Punkt C nirgends einschalten.
- Den Stationsvergleich braucht AP9 nicht im Produkt: Der Slot trägt die nächste Zelle mit allen Ebenen
  (t2m, ps, hModEff, t925/t850/t700). Der Nachlauf rechnet (i), (ii) und die Varianten mit `profileColumn.ts` und
  `verticalCorrection` direkt nach, wie das Gate-Skript.
- Kippt die Stationswahrheit das Urteil, ist die Verdrahtung ein S-Paket nach §2.1.

#### 9.3.4 Gates und Messungen (18.09., Verifier einzeln, PowerShell ohne `2>&1`)

| Gate | nach AP14 | nach AP15 |
|---|---|---|
| `typecheck` | 0 | **0** |
| `verify:pv-cube` | 260/260 | **269/269**. Block (21): <br>• Portierung = Producer an 7 Selbsttest-Säulen + 2 000 Zufallssäulen, bitgleich inkl. NaN; Negativkontrolle dTMin + 0,3 K weicht ab; <br>• Säulenregel von Hand: hypsometrische 925 bei 826,8 m (von Hand), Maske ps − p ≥ 10 hPa, < 3 Niveaus ⇒ null, Γ-Deckel 9,8, Teile fehlen ⇒ null; <br>• `extendBelowBase` fehlt = `true` bitgleich (3 000 Fälle); `false` ändert genau die Fälle mit aufsitzender Inversion und Punkt oder Modellboden unter der Basis; Handrechnung +1,95 / −3,00 K; <br>• nicht verdrahtet: kein `src/`-Modul importiert `profileColumn` (Gegenprobe im Gate-Skript). <br>Kosten-Prüfung (9) einmal 7,7 ms (> 5), allein wiederholt 3,5 ms ⇒ Rauschen, `grid.ts` unberührt |
| `verify:pv-fusion` / `point-client` / `calib-fit` | 229 / 143 / 14 | **229 / 143 / 14** (unberührt) |
| Build · Budget | 241/241 · totalJs 1 432,8 / 1 433 | **241/241** · eagerJs **107,9 (unverändert)** · largestChunk 301,2 · **totalJs 1 432,9 / 1 433** (+0,1 KB: der Zweig in `vertical.ts`; keine Ratschen-Änderung) |

**Bitgleichheit gegen HEAD:**
- `verticalCorrection` der Arbeitskopie gegen `git show HEAD:…/vertical.ts` im Scratchpad: 20 000 Zufallsfälle
  (Fall A/B/C/std, `gammaImplausible`, ohne `ps`) bitgleich.
- Negativkontrolle: `extendBelowBase: false` weicht in 3 061 Fällen ab.
- Sonst ist im Produktpfad nichts geändert: `profileColumn.ts` importiert kein App-Modul (Block 21).

**Latenz, derselbe Tag, derselbe Aufruf:** §9.3.6.

#### 9.3.5 Befunde (V-FI-90 …)

- **V-FI-90 — offen, Jans Gate (AP9):** Das Druckflächen-Profil verschlechtert T bei |Δh| > 300 m gegenüber der
  Standard-Lapse (1,94 gegen 1,39 K, Referenz t1-Profil).
  - **Mehrwert:** Klärt, ob Lücke 2 mit den vorhandenen Flächen überhaupt zu schließen ist, bevor sie jemand
    einschaltet.
  - **Ursache:** Nachts ist der 2-m-Punkt entkoppelt und kippt das Γ.
  - **Skizze:** AP9 rechnet im Nachlauf gegen die Stationen: (i), (ii) E-F-14, V-e (ohne 2 m) und V-g, je nachts/tags
    und Punkt über/unter der Zelle. Für t1 aus dem Slot vom 18.09. an, für t2/t3 ebenso (die nächste Zelle trägt alle
    Ebenen). Werkzeug: `profileColumn.ts` + `verticalCorrection` wie im Gate-Skript.
  - Schlägt eine Regel (i) an der Wahrheit ⇒ Verdrahtung als S-Paket nach §2.1. Sonst ist Lücke 2 ohne 1000/950 hPa
    (V-FI-78, Producer, R10) nicht wirksam.
- **V-FI-91 — benannt:** Der t1-Schatten ist für t2/t3 nur eine Näherung.
  - Die t1-Druckflächen stammen nicht aus dem Referenzmodell (ICON-D2 hat keine 925 hPa, PD-E).
  - t2/t3 mitteln andere Quellen (ICON-EU/IFS/AIFS).
  - Die Stichprobe ist ein Lauf (18.09. 15z, 0–48 h), eine Wetterlage.
  - Die Varianten sind an derselben Stichprobe gewählt.
- **V-FI-92 — behoben (Zahl):** Die Planzahl „Fehlalarm 21,0 %" (§1.2, §2.1, RV1) ist keine Gate-Zahl: Basis sind alle
  Zellschritte, gezählt als Anteil der Fälle.
  - Am Gate (|Δh| > 300 m, Archivpunkte) sind **64,3 % der (ii)-Inversionen Fehlalarme** (297 von 462).
  - Ihr T-Fehler liegt bei 6,39 K gegen 0,87 K mit Standard-Lapse.
- **V-FI-93 — benannt (Semantik):** `extendBelowBase: false` ändert auch Fall B, wenn der Modellboden bis 50 m unter
  der Basis liegt (`DZ_SURFACE_M`), weil P(hModEff) dann kein Inversionsgefälle bekommt.
  - Gewollt: kein Inversionsgefälle unter der Basis, weder am Punkt noch am Boden.
  - Kommentar in `vertical.ts` präzisiert; Block (21) prüft genau diese Menge (die erste Erwartung „nur Fall C" war zu
    eng).

#### 9.3.6 Latenz, Selbstverifikation und Gate-Urteil

**Latenz vorher/nachher**, derselbe Tag, derselbe Aufruf (`--only=cubep --profiles=desktop-none,mobile-4g`,
10 Orte, Index `ebded4b`), p50 in ms:
- Dateien: vorher `latency/2026-09-18T17-43-28-696Z.json`, nachher `…T18-01-48-474Z.json`.

| Profil · Szenario | erste Darstellung (p95) | ganzes Fenster | letzte Ausgabe |
|---|---|---|---|
| Desktop · kalt | 693 → 773 (853 → 868) | 824 → 908 | 1 534 → 1 774 |
| Desktop · warm | 133 → 126 (225 → 157) | 211 → 195 | 498 → 462 |
| Desktop · kalt 24 h | 656 → 663 (1 210 → 761) | 751 → 766 | 1 230 → 1 233 |
| Mobil-4G · kalt | 1 655 → 1 738 (2 031 → 1 998) | 2 573 → 2 589 | 4 182 → 4 248 |
| Mobil-4G · warm | 140 → 169 (200 → 325) | 332 → 420 | 1 230 → 1 146 |
| Mobil-4G · kalt 24 h | 1 724 → 1 708 (2 144 → 2 019) | 1 847 → 1 880 | 3 579 → 3 428 |

- Im Produktpfad ist nur ein Boolean-Zweig in `verticalCorrection` dazugekommen (Voreinstellung bitgleich).
- Die Unterschiede gehen in beide Richtungen und liegen in der Streuung, die AP14 am unveränderten Innenort gemessen
  hat (bis +153 ms) ⇒ **unverändert im Rauschen**.
- Kosten-Prüfungen von `verify:pv-cube`, allein: (8) PAP 4 4,83 ms ≤ 5 + Rauschen, (9) 2,88, (10) 4,92, (11) 0,04.
  Einmal (11) 7,56 ms, als der Latenzlauf sich noch beendete ⇒ wiederholt allein grün, 269/269.

**Die fünf Fragen:**
1. **Funktionserhalt:** Nichts entfernt. `verticalCorrection` ist ohne die neue Option bitgleich zu HEAD
   (20 000 Fälle). Keine Option im Produkt, kein Flag, kein Codec-Eingriff.
2. **Desktop pixelgleich:** keine UI-Datei geändert, Produktausgabe unverändert (s. 1).
3. **Touch-Targets:** keine neue UI.
4. **Konsole:** keine neue `console.*`-Zeile in `src/`.
5. **Long Tasks:** keine neue Rechnung im Browser (die Bausteine sind nicht importiert).

**Gate AP15: Etappe abgeschlossen, Abnahme-Gate der Option ROT ⇒ Option nicht verdrahtet** (Jans Punkt C).
- Offen bei Jan (MANUELLE-SCHRITTE §18):
  - bestätigen, dass erst AP9 gegen Stationen misst (V-FI-90), bevor verdrahtet wird;
  - AP15 ansehen und committen.
- Keine neue Ratschen-Zahl: totalJs 1 432,9 / 1 433.

### 9.4 AP16 — Landbedeckung: d_water, κ, Modellzell-Box, tpiSigma (Lücken 1 und 4; ab 2026-09-18, 19:10 UTC)

#### 9.4.1 Diagnose (vor dem Code, am Baum nach AP15)

**Was es heute gibt:**
- `loadZ0AtPoint` (`z0Point.ts:130-227`) lädt je Ort die WorldCover-Kacheln, die die **t3-Box ±0,125° um den Punkt**
  schneiden, baut daraus eine private Klassenfunktion (`classAt`, Z. 209-220) und rechnet `z0FromClassField`:
  Punktkreis 500 m (Schritt 40 m) und je Stufe **eine Box um den Punkt** (V-FI-65). Das Klassenfeld verlässt die
  Funktion nicht; im Cache (`z0:v1:<sha12>:lat,lon` auf 0,001°) liegt nur das Ergebnis, dazu die Kachelbytes je
  URL und Bereich.
- d_water: nur die Konstanten `DWATER_MAX_M = 20 000` und `WORLDCOVER_WATER = 80` (`terrainPoint.ts:48,70`), kein
  Verbraucher, keine Ausgabe.
- κ: ein Skalar je Aufruf (`GRID_SET.kappa = 1`, `grid.ts:34,101`), fällt in der Normierung heraus; calib-Zeile
  `kappa:set — … κ = 1`.
- `a.series.neighbours` trägt `dy/dx` relativ zur nächsten Zelle, `a.series.cell` deren absolute Adresse `iy/ix`
  (Zellmitte `lat0 + iy·deg`, `cubeFormat.ts:557`) ⇒ jede Blockzelle ist absolut adressierbar.
- v2 `point` reist im Kodierer wortgleich mit (`v2codec.ts:459,616`) ⇒ ein **optionales** neues Feld braucht keine
  Codec-Änderung (geteilte Datei bleibt unberührt).
- tpiSigma (V-FI-85): das Muldengate von PAP 5 nimmt `tpi2000M ?? tpi500M` (`terrainTerms.ts:124`); die Registry
  (`calibFit.ts:153`) schätzt die Streuung je Region aus einer TPI-Stichprobe, die es noch nicht gibt.

**Abgrenzung dieser Etappe (Regel 2, alles voreingestellt aus):**
1. `CubeIo.landCover` (neu, aus): statt `loadZ0AtPoint` läuft `loadLandCoverAtPoint` — **dieselben Kacheln**, derselbe
   Kopf, 0 zusätzliche Bytes. Das Ergebnis ist ein `Z0AtPoint` (die v1-Felder aus **derselben** Funktion
   `z0FromClassField` ⇒ gleich) plus `landCover`: Gruppenanteile im Punktkreis, je Stufe t1/t2 die **3×3 Zellen um
   die nächste Zelle** (absolut adressiert, Box um die Zellmitte: Anteile, Abdeckung, log-Mittel z0) und d_water.
   - Warum 3×3: der Cache-Schlüssel rundet auf 0,001°; ein zweiter Punkt im selben Schlüssel kann eine andere nächste
     Zelle (am Zellrand) oder eine andere Blockseite (an der Zellmitte) haben. Beide Blöcke liegen im 3×3 der ersten
     nächsten Zelle (Zellrand: der Block der Nachbarzelle zeigt zurück) ⇒ jeder Treffer ist richtig adressiert.
   - Cache: neuer Namensraum `lc:v1:…`; der Blick nur in den Cache liest **zusätzlich** `z0:v1` (ein bekannter Ort
     verliert z0 in der ersten Ausgabe nicht). Kam nur der v1-Eintrag, startet der Netzweg trotzdem ⇒ die Kachelbytes
     liegen im Cache, die Landbedeckung folgt ohne Netz.
2. `FuseCubeOptions.kappa` (neu, aus): κ je Zelle in t1/t2 aus den absoluten Zelladressen; t3 κ = 1 (E-F-16).
   `GridCell.kappa?`, in `grid.ts` `w = wd·wh·(c.kappa ?? kappa)` — ohne Feld derselbe Ausdruck wie heute.
   Punktkreis oder eine Blockzelle < 80 % bekannt, oder eine Blockzelle nicht im 3×3 ⇒ κ = 1 für alle Zellen dieser
   Stufe, benannt.
3. `FuseCubeOptions.z0CellBox` (neu, aus): z0_mod je Schritt = ln-Mittel der Blockzellen-z0 mit den PAP-3-Gewichten
   (nach κ, wenn an) statt der Box um den Punkt (V-FI-65). t3 bleibt bei der Box um den Punkt: t3-Blockzellen reichen
   bis 0,375° vom Punkt, geladen ist garantiert nur ±0,125° (benannt).
4. d_water: Ausgabe **`point.dWater`** in v2, nur wenn die Landbedeckung da ist (Feld sonst abwesend ⇒ byte-gleich).
   Abweichung vom Planwort „`point.terrain`": `point.terrain` ist `null`, wenn das DEM fehlt — d_water hängt nicht am
   DEM. Kein Rechenterm (E-F-17).
5. tpiSigma (V-FI-85): Diagnose-Skript `audit/fusion-vollform/tpi-sigma.mjs` — Geländestichprobe mit dem
   Produkt-Lader (`loadTerrainAtPoint`, Terrarium z11 + z8), Ergebnis nur über den Fit-Kern (`fitCalib({ tpi })`) in
   eine Datei unter `audit/fusion-vollform/`, nicht ins Produkt.

**d_water-Regel (E-F-17, Einzelheiten dieser Etappe):**
- Fenster in Pixeln der Spiegel-Ebene (1/3 000° ≈ 37 m N–S, ≈ 25 m O–W bei 47 °N): Schnitt aus den geladenen Kacheln
  und der 20-km-Box, einmal zeilenweise kopiert; nicht Geladenes und Klasse 0 = unbekannt.
- Ringsuche in Pixel-Ringen um das Punktpixel; Abstand metrisch zur Pixelmitte; Abbruch, sobald
  (k − ½)·min(Pixelbreite, Pixelhöhe) über min(bester Treffer, r_c) liegt.
- Wasserpixel ⇒ Flutfüllung (8er-Nachbarschaft, damit 1-px-Diagonalen zusammenhängen) bis **A_min = 10 px**; kleiner ⇒
  verworfen; berührt ein zu kleiner Körper Unbekanntes ⇒ unentscheidbar ⇒ r_c sinkt auf seinen Abstand.
- r_c = Abstand zum nächsten unbekannten Pixel bzw. zum Fensterrand, höchstens 20 km.
- Ergebnis: `m` auf 10 m, `bodyPx` (Flutfüllung bis 10 000 px gedeckelt) oder `m: null` mit `aboveM: r_c` (auf 10 m
  abgerundet) und `reason` `none` / `coverage` (`coverage`, wenn r_c unter der garantierten Ladebreite
  0,125°·m/°Länge liegt ⇒ eine Datei oder Kachel fehlt).

**Gates (je Punkt geprüft, bevor das Protokoll schließt):**
- `verify:point-client` (analytische Klassenfelder, §5): d_water 300 m ± 40 m, 1-px- und 9-px-Fleck verworfen,
  2-px-Fluss und 1-px-Diagonale gefunden, Binnenland ⇒ `null` + `aboveM`, fehlende Datei ⇒ `coverage`; Fenster aus
  den Kacheln = Fenster aus der Klassenfunktion; κ fünf Fälle; Lader-Regeln (Cache `lc:v1`, v1-Rückgriff); z0 v1 aus
  dem Lader = `z0FromClassField`; Kosten der Ringsuche im schlimmsten Fall (kein Wasser, volles Fenster).
- `verify:pv-cube`: ohne Optionen byte-gleich (auch mit Landbedeckung im Eingang); κ an ⇒ Gewichte wie von Hand;
  `z0CellBox`; `point.dWater` im v2 und im Codec-Rundweg; calib-Zeilen.
- Messung an den 42 Orten aus §0 mit dem Produkt-Lader (`audit/fusion-vollform/landcover-places.mjs`): d_water, κ,
  Abdeckung, Rechenzeit.
- Latenz vorher/nachher am selben Tag (`--only=cubep --profiles=desktop-none,mobile-4g`); totalJs nach E-F-21.

**Latenz vorher:** `latency/2026-09-18T18-33-57-166Z.json`, derselbe Aufruf wie in AP13–AP15
(`--only=cubep --profiles=desktop-none,mobile-4g`, 10 Orte).

#### 9.4.2 Umgesetzt (nur `src/point/**`, `src/pointForecast/**`, eigene Verifier und Harnisch, `budget.json`; kein Producer, keine AP9-Datei, keine geteilte Datei)

- **`src/point/client/z0Point.ts`:** Kachel-Laden als `loadWorldCoverTiles` und die Klassenfunktion als `classAtOf`
  herausgelöst (wortgleich); `loadZ0AtPoint` ruft beide auf. `z0FromClassField` und `z0CacheKey` unverändert.
- **`src/point/client/landCover.ts` (neu):**
  - `landCoverFromClassField`: z0 v1 aus `z0FromClassField`, dazu die Gruppenanteile p im Punktkreis (aus den
    v1-Klassenanteilen) und je Stufe t1/t2 die 3×3 Zellen um die nächste Zelle (`cellOf`/`cellCenter`, Box um die
    Zellmitte, Stützraster 100/200 m): Abdeckung, q, log-Mittel z0.
  - Das Stützraster der Zellbox ist abgerundet (`floor`) statt gerundet wie bei den z0-Boxen: jede Stützstelle liegt
    in ihrer Zelle (mit `round` ragte es bis 0,0003° in die Nachbarzelle; bei einer Zelle voller Wasser neben Land
    kam κ dann 0,374 statt e⁻¹ heraus).
  - `windowFromTiles` (zeilenweise Kopie aus den Kacheln) und `windowFromClassAt` (Pixelmitten, für Tests und als
    Gegenprobe), `dWaterFromWindow` (Ringsuche, Flutfüllung bis A_min, r_c, Zensur, Körpergröße bis 10 000 px).
  - `kappaOf`, `kappaAt`, `landCoverCell`; `loadLandCoverAtPoint` mit Cache `lc:v1` und Rückgriff auf `z0:v1`
    nur im Blick-in-den-Cache.
- **`src/pointForecast/fusion/grid.ts`:** `GridCell.kappa?`, `GridWeight.kappa?`; ohne Feld derselbe Ausdruck wie
  vorher. Zwei neue Selbstprüfungen (κ ½ halbiert das relative Gewicht; gleiches κ kürzt sich).
- **`src/pointForecast/cubeSource.ts`:**
  - `FuseCubeOptions.kappa` und `.z0CellBox` (aus).
  - `gridStep` nimmt eine κ-Funktion je absoluter Zelle; κ gilt nur, wenn jede vorhandene Blockzelle einen hat.
  - calib-Zeilen `kappa:set — … je Zelle …` bzw. „Option an, aber keine Landbedeckung", `dWater:set` (nur mit
    Landbedeckung im Eingang), z0-Zeile mit „Blockzellen" (nur mit `z0CellBox`). Notizen zählen je Stufe, wie oft
    die Optionen griffen.
  - `CubeIo.landCover` (aus, wirkt nur mit `z0`): Lader-Wahl, Cache-Schlüssel `|lc`, Notizen „Landbedeckung …
    folgt/nicht verfügbar", z0 aus dem alten Eintrag geht nie verloren (progressiv über den Cache-Blick,
    nicht-progressiv über einen Rückgriff nach gescheitertem Abruf).
- **`src/pointForecast/fusion/output.ts`:** optionales `point.dWater` in v2 (nur mit Landbedeckung; der Kodierer
  trägt `point` wortgleich, `v2codec.ts` unberührt).
- **`src/point/calibFit.ts`:** Herkunftszeile von tpiSigma (V-FI-97).
- **Verifier und Harnisch:** `verify-point-client.mjs` (10r) mit 18 Prüfungen, `verify-pv-cube.mjs` (22) mit 9,
  `verify-calib-fit.mjs` (7) erweitert; `verify-pv-latency.mjs`/`lab.ts` Szenario `cubelc`.
- **Diagnose-Skripte** (`audit/fusion-vollform/`): `landcover-places.mjs` (42 Orte, Produkt-Lader),
  `tpi-sigma.mjs` → `tpi-sigma.fit.json` (nur über den Fit-Kern, nicht im Produkt).
- **Nicht gebaut:** keine Option im Browser eingeschaltet (`defaultCubeIo` unverändert), kein Rechenterm für
  d_water (E-F-17), keine Panel-Anzeige, kein `v2codec`-Eingriff, kein Wert in `calib.json`.

#### 9.4.3 Messungen an echten Orten (18.09., netzlesend, Produkt-Lader in Node)

**Landbedeckung an den 42 Orten aus §0** (`landcover-places.mjs`, Spiegel `cc3ce55`):
- Abrufe: 125 Kacheln, 12,6 MB (geteilte Kachelbytes) — **dieselben Kacheln wie z0**, 0 Byte mehr.
- **d_water:** Treffer an **42/42** (keine Zensur nötig): p50 **1 030 m**, p90 4 040 m, max 8 650 m (Meßstetten).
  - Körpergröße des getroffenen Gewässers: p25 17 px, **p50 49 px (≈ 0,045 km²)**, p75 450 px; ≤ 13 px an 10/42,
    ≥ 1 080 px (≈ 1 km²) nur an 7/42 (Kiel am Deckel, Sarnersee, Wohlensee, Grimsel, Neuruppin, Spittal, Innsbruck).
  - In Städten trifft die Suche Fluss-Stücke zwischen Brücken: Genf 30 m (23 px, die Rhône am Ausfluss, nicht der
    See), Zürich 100 m (35 px), Berlin 340 m (10 px).
  - Zugspitze 980 m (13 px), Weissfluhjoch 540 m (13 px): kleine Gewässer oder Fehlklassen im Hochgebirge — ein
    einzelnes Rauschpixel fällt heraus (A_min), ein Fleck ab 10 px nicht.
- **κ (λ = 1):** in t1 und t2 an **42/42** Orten entscheidbar (alle Boxen ≥ 80 % bekannt).
  - Spreizung max/min im Block ≥ 1,5: t1 **7/42**, t2 **5/42**; bei λ = 0,5 wären es 25/42 bzw. 27/42 (§0 hatte
    24/42 und 26/42 — dieselbe Größenordnung, andere Zellboxen).
  - κ_min p10/p50: t1 0,49/0,63, t2 0,42/0,58. Der gemeinsame Teil (Punktkreis 500 m gegen 5–11-km-Boxen) kürzt sich
    in der Normierung; es wirkt nur die Spreizung.
- **Modellzell-Box gegen Box um den Punkt** (V-FI-65): |ln(z0 Zelle / z0 Punktbox)| p50/p90 t1 **0,17/0,68**,
  t2 0,15/0,77. Beispiel Zermatt: Punktbox 0,13 m, nächste Zelle 0,065 m, Blockmittel 0,016 m.
- **Rechenzeit (Node ≈ Desktop):** der ganze Durchgang (Klassenfeld → Ergebnis) p50 **5,9 ms**, p90 10,6, max 22,2;
  davon Fenster 0,8 ms, Ringsuche 0,2 ms (p90 0,8, max 2,6). Der Lader-Weg p50 6,1 ms, max 17,4.
- Gleichheit: z0 v1 aus der Landbedeckung = `z0FromClassField` an 42/42; Lader = Teile einzeln an 42/42.

**tpiSigma (V-FI-85)** (`tpi-sigma.mjs`, Produkt-Gelände Terrarium z11 + z8, Saat 20260918, zweimal gleich):
- Stichprobe: je 110 gleichverteilte Punkte in DE/AT/CH (Region = Land der nächsten Archivstation ≤ 25 km; 16 im
  Meer verworfen), 10 s.

| Region | σ(TPI) Fit-Kern | p10 / p50 / p90 TPI | σ(TPI500) | Höhe p50 |
|---|---|---|---|---|
| DE | **22,6 m** | −26 / −1 / 25 m | 8,6 m | 211 m |
| AT | **117,1 m** | −155 / 0 / 136 m | 36,5 m | 856 m |
| CH | **135,0 m** | −96 / 0 / 195 m | 36,2 m | 957 m |
| gepoolt (`default`) | **104,6 m** | | | |

- Der Fit-Kern schreibt `measured` mit n 330 nach `tpi-sigma.fit.json` — **nicht** ins Produkt (Publisher-Weg
  E-F-20 ist S&F; A ist ohnehin `null`, das Gate wirkt ohne Amplitude nichts).
- Zum Vergleich 130 Archivstationen (jede 3. in DE/AT/CH): im Muldengate TPI < −σ mit `default` 17 (13,1 %), mit σ
  je Land 22 (16,9 %).

#### 9.4.4 Befunde (V-FI-94 …)

- **V-FI-94 — offen (AP10, Entscheidung):** d_water misst mit A_min 10 px meist einen Teich oder ein Fluss-Stück,
  nicht „den See". Der getroffene Körper hat im Median 49 px (≈ 0,045 km²); ≥ 1 km² nur an 7/42 Orten; in Genf trifft
  die Suche die Rhône zwischen Brücken (30 m), nicht den Genfersee.
  - **Mehrwert:** Für einen Seeufer-Term (gedämpfte Tagesamplitude, Land-See-Wind) ist der Abstand zum großen
    Gewässer die Größe, die wirkt; ein Teich 500 m entfernt verdeckt ihn heute.
  - **Skizze:** eine zweite Ausgabe `dLakeM` mit A_min ≈ 1 080 px (≈ 1 km²) aus demselben Fenster — eine zweite
    Ringsuche kostet 0,2–2,6 ms (gemessen). Fluss-Stücke zwischen Brücken als ein Körper zu zählen, bräuchte eine
    Schließung (Dilatation um 1 px) vor der Flutfüllung. Welche Größe der Term braucht, entscheidet AP10.
- **V-FI-95 — benannt (AP10 misst λ):** Mit λ = 1 spreizt κ den Block nur an 7/42 (t1) bzw. 5/42 (t2) Orten um
  ≥ 1,5; mit λ = 0,5 an 25/42 bzw. 27/42. Die Setzung ist bewusst konservativ (E-F-16); die Registry fittet λ über
  0,5/1/2/∞ (§2.5), sobald der 2×2-Block im Archiv liegt (E-F-19).
- **V-FI-96 — benannt (V-FI-65 beziffert):** Die z0-Näherung über die Box um den Punkt weicht von der Box um die
  nächste Zelle im Median um den Faktor e^0,17 ≈ 1,19 ab, im p90 um e^0,68 ≈ 2,0 (t1); im Gebirge mehr (Zermatt
  Faktor 8 zum Blockmittel). Gebaut hinter `z0CellBox`; AP17 ersetzt den ICON-Anteil ohnehin durch das GRIB-z0.
- **V-FI-97 — behoben:** Der Fit-Kern (AP13) schrieb für tpiSigma die Archiv-Herkunft („buscosun-archiv … Zeitraum
  undefined…undefined"), obwohl der Wert aus dem Gelände kommt und es keine Archivfälle gibt. Jetzt
  „Geländestack (TPI am Punkt, keine Archivfälle) … Stichprobe n, Regionen"; `verify:calib-fit` (7) prüft es.
- **V-FI-98 — offen (AP10, mit V-FI-83):** tpiSigma ist regional sehr verschieden: DE 22,6 m, AT 117,1 m, CH 135,0 m;
  gepoolt 104,6 m. Der Leser nimmt nur `default` (`calibDoc.ts`, `o.tpiSigmaM = val.default`). Mit dem gepoolten
  Wert erreicht in DE praktisch kein Punkt das Muldengate (TPI < −105 m; das p10 von DE liegt bei −26 m).
  - **Mehrwert:** Kaltluftseen im Flachland (Rheingraben, Donautal) würden erst mit σ je Region als Mulden erkannt.
  - **Skizze:** wie V-FI-83 — `calibOverridesFrom` wählt tpiSigma nach `input.country`, `default` nur als Rückfall;
    wirksam erst, wenn A gemessen ist (heute `null` ⇒ keine Wirkung).
- **V-FI-99 — benannt (wie bisher bei z0):** Scheitert der Nachlade-Abruf der Landbedeckung und kommt sonst nichts
  Neues, bleibt `pending: ['z0']` in der letzten Ausgabe stehen (so verhielt sich z0 schon vor AP16, (18)
  „ohne Spiegel"). Die Windkorrektur aus dem alten Eintrag wirkt; es fehlt nur die Schlussmeldung.
  - **Skizze:** den gescheiterten Abruf in einer ohnehin fälligen Ausgabe als „nicht verfügbar" melden, statt eine
    eigene Ausgabe dafür auszulösen.

#### 9.4.5 Gates und Messungen (18.09., Verifier einzeln, PowerShell ohne `2>&1`)

| Prüfung | vorher (AP15) | nachher |
|---|---|---|
| `npm run typecheck` | 0 | **0** |
| `verify:pv-cube` | 269/269 | **280/280** — (22) mit 9 Prüfungen, dazu 2 neue Selbstprüfungen in `verifyGrid` |
| `verify:point-client` | 143/143 | **161/161** — (10r) mit 18 Prüfungen |
| `verify:calib-fit` | 14/14 | **14/14** — (7) prüft die Herkunft von tpiSigma (V-FI-97) |
| `verify:point-data` · `verify:pv-fusion` · `verify:punktarchiv` | 978 · 229 · 103 | **978/978 · 229/229 · 103/103** (unberührt) |
| Build · Budget | 241/241 · totalJs 1 432,9 / 1 433 | **241/241** · eagerJs **107,9 (unverändert)** · largestChunk 301,2 · **totalJs 1 436,2 / 1 437** (E-F-21: +3,3 KB, alles im Lazy-Chunk `cubeSource`; Textsonde mit Gegenprobe: nichts in `index-*.js`, der Fit-Kern in keinem Chunk) |

**Ohne Option byte-gleich zum Stand vor AP16** (Scratch-Kopie von `src/`, in der jede AP16-Laufzeitzeile exakt
zurückgenommen ist, beide Stände im selben Node-Prozess):
- `fuseCubePoint` + v2 mit Nachbarzellen, ohne z0 und mit z0 v1: Schritte, calib, Notizen, v2 gleich (1,17 MB v2).
- Produktweg `getPointForecastFromCube` mit z0 aus dem Cache, nicht-progressiv (1 Ausgabe) und progressiv
  (2 Ausgaben): v2, Stunden, Notizen und `pending` jeder Ausgabe gleich.
- `gridToPoint`: 20 000 Zufallsfälle ohne κ-Feld bitgleich; Gegenprobe mit κ je Zelle weicht in 15 029 ab.
- `z0FromClassField` und `z0CacheKey` unverändert (Quelltext gleich bis auf Zeilenenden CRLF/LF der Kopie).

**Kosten:**
- (10r) Ringsuche im schlimmsten Fall (kein Wasser, volles 20-km-Fenster): Median 10,9 bzw. 16,4 ms (zwei Läufe) ≤ 30 ms.
- `verify:pv-cube` (9) PAP 3 war einmal rot (10,10 ms gegen die Grenze 9,04 ms, als der `cubelc`-Lauf sich noch
  beendete; ein anderer Node-Prozess lief mit hoher Last). Direkter Vergleich vor/nach AP16 im selben Prozess,
  abwechselnd, Median aus 40: PAP 3 **5,69 ms vorher gegen 4,68 ms nachher**, die ganze Rechnung 24,0 gegen 24,3 ms ⇒
  kein Mehrpreis. Allein wiederholt: 280/280, (8) 1,51 · (9) 4,15 · (10) 5,42 · (11) 12,74 ms (Rauschboden 5,03 ms).

#### 9.4.6 Latenz, Selbstverifikation und Gate-Urteil

**Latenz vorher/nachher**, derselbe Tag, derselbe Aufruf (`--only=cubep --profiles=desktop-none,mobile-4g`,
10 Orte), p50 in ms:
- Dateien: vorher `latency/2026-09-18T18-33-57-166Z.json`, nachher `…T19-10-20-564Z.json`.

| Profil · Szenario | erste Darstellung (p95) | ganzes Fenster | letzte Ausgabe |
|---|---|---|---|
| Desktop · kalt | 729 → 739 (1 394 → 1 521) | 878 → 865 | 1 591 → 1 631 |
| Desktop · warm | 119 → 139 (251 → 179) | 218 → 209 | 597 → 485 |
| Desktop · kalt 24 h | 728 → 678 | — | 1 275 → 1 217 |
| Mobil-4G · kalt | 1 665 → 1 671 (1 986 → 2 001) | 2 590 → 2 585 | 4 213 → 4 293 |
| Mobil-4G · warm | 134 → 133 (211 → 160) | 435 → 426 | 1 072 → 1 369 |
| Mobil-4G · kalt 24 h | 1 601 → 1 650 | — | 3 260 → 3 336 |

- Voreinstellung: kein neuer Abruf, keine neue Rechnung im Produktpfad ⇒ die Unterschiede gehen in beide Richtungen
  und liegen in der Streuung, die AP14 am unveränderten Innenort gemessen hat (bis +153 ms). Die letzte Ausgabe warm
  auf Mobil (1 072 → 1 369) ist der Anker (Messungs-Abruf), nicht der Cube-Pfad.

**Landbedeckung an gegen aus im selben Lauf** (`--only=cubelc`, `landCover` + `kappa` + `z0CellBox`; Datei
`…T19-13-40-958Z.json`), p50 in ms:

| Profil · Szenario | erste Darstellung | ganzes Fenster | letzte Ausgabe | z0 ab | Landbedeckung ab |
|---|---|---|---|---|---|
| Desktop · kalt, aus / an | 791 / 816 | 871 / 883 | 1 380 / 1 398 | 1 380 / 1 398 | — / **1 398** (10/10) |
| Desktop · warm, aus / an | 128 / 133 | 177 / 189 | 472 / 474 | 128 / 133 | — / **133**, in der ersten Ausgabe 10/10 |
| Mobil-4G · kalt, aus / an | 1 853 / 1 830 | 2 452 / 2 484 | 4 210 / 4 143 | 4 210 / 4 143 | — / **4 143** (10/10) |
| Mobil-4G · warm, aus / an | 189 / 203 | 401 / 444 | 1 126 / 1 253 | 189 / 203 | — / **203**, in der ersten Ausgabe 10/10 |

- Die Landbedeckung reist kalt mit der z0-Ausgabe (keine zusätzliche Ausgabe, keine späteren Bytes) und steht warm
  (IndexedDB `lc:v1`) schon in der ersten Darstellung. Die Rechenzeit (p50 6 ms Node) verschwindet in der Streuung.

**Die fünf Fragen:**
1. **Funktionserhalt:** Nichts entfernt. `loadZ0AtPoint` nur zerlegt (Lader-Regeln (10n) unverändert grün); ohne
   Option ist die Rechnung byte-gleich zum Stand vor AP16 (§9.4.5). z0 geht mit `landCover` nie verloren (alter
   Eintrag trägt weiter, (22)).
2. **Desktop pixelgleich:** keine UI-Datei geändert; die Produktausgabe ist ohne Option byte-gleich.
3. **Touch-Targets:** keine neue UI.
4. **Konsole:** keine neue `console.*`-Zeile in den geänderten `src/`-Dateien.
5. **Long Tasks:** ohne Option keine neue Rechnung im Browser. Mit `landCover` rechnet der Durchgang p50 6 ms,
   max 22 ms (Node) ⇒ bei CPU ×4 bis ≈ 90 ms synchron — unter 200 ms, auf schwachen Telefonen aber über 50 ms
   (Real-Device wie V-FI-50, erst beim Einschalten).

**Gate AP16: grün.** Alles gebaut, gemessen und voreingestellt aus.
- Offen bei Jan (MANUELLE-SCHRITTE §18):
  - Ratsche 1 437 bestätigen (E-F-21);
  - AP16 ansehen und committen;
  - V-FI-94/98 zur Kenntnis (AP10).

### 9.5 AP17 — z0 der Modelle aus dem GRIB (Lücke 5, V-FI-58; ab 2026-09-18, ≈ 19:40 UTC)

**Gate-Art:** S&F (E-F-15 mit Bedingung, §6.1): Producer- und Publisher-Arbeit nur gegen einen **konkreten Diff, den Jan
freigibt**. Diese Etappe legt den Diff vor (gebaut, lokal geprüft, **nichts eingeschaltet, nichts gepusht**) und misst
vorher RV12. Der Client-Teil liegt in dieser Linie und ist voreingestellt aus.

#### 9.5.1 Diagnose (vor dem Code, am Baum nach AP16)

**Was es heute gibt:**
- `windBlendingFactor(z0Mod, z0True, …)` (`terrainTerms.ts:151`) bringt den 10-m-Wind vom Modellboden über z_b = 60 m
  (`set`) auf den echten Boden. z0 am Punkt (WorldCover, Kreis 500 m) ist `literature`. Für z0 des Modells steht eine
  WorldCover-**Näherung**: die Box um den Punkt (v1) bzw. mit `z0CellBox` die Blockzellen (AP16, V-FI-65).
- Der Producer holt je Quelle HSURF und schreibt das statische Produkt `hmodel` (`staticHmodel.mjs`, BSPC, `nt = 1`,
  Chunk-Raster des Cubes, `static.json` gemergt je Stufe). Der Leser `readStaticProductPoint` (`staticPoint.ts`) ist
  allgemein, der Publisher tastet `point/static/*/*/static.json` ab (`staticIndex.mjs`), `cdnSync` behandelt
  `point/static/` als Klasse `static` (neue Dateien gewärmt, in place geänderte Chunks nicht gepurgt).
- Der Cron-Job klont `buscosun-web@main` und fährt `verify:point-data` als Gate **vor** jedem Bau; die Workflow-Datei
  liegt im Daten-Repo (Kopie von `scripts/repack-repo/workflow-point.yml` durch Jan).

**Gemessen (`audit/fusion-vollform/z0mod-diag.mjs`, Läufe 18.09. 00z/12z, Schritt 000; nur GET):**
- **Verfügbarkeit:** ICON-D2 `z0` (regulär, 0,99 MB bz2), ICON-EU `Z0` (0,97 MB), ICON global `Z0` (ikosaedrisch,
  1,68 MB) je Schritt; **ICON-CH1/-CH2 `Z0`** über den STAC-Katalog („Horizon: All", ctrl-Member, 2,30 / 0,57 MB), die
  Konstanten tragen kein z0, aber `SSO_STDH` (0/3/20). Kein z0 bei IFS/AIFS (V-FI-72), AICON (Parameterliste) und
  C-LAEF (GeoSphere `/metadata`: 16 Parameter, kein z0).
- **RV12 — kein Orographie-Anteil.** z0 gegen die Modellhöhe (native Punkte im DACH-Ausschnitt):

| Modellhöhe | ICON-D2 z0 p50 | ICON-EU | ICON global | ICON-CH1 |
|---|---|---|---|---|
| < 300 m | 0,22 m | 0,35 | 0,41 | 0,20 |
| 700–1 200 m | **0,89 m** | 0,93 | 0,95 | 0,82 |
| 1 800–2 500 m | 0,32 m | 0,34 | 0,38 | 0,26 |
| > 2 500 m | **0,058 m** | 0,085 | 0,075 | 0,058 |

  - Mit einem SSO-Anteil wäre z0 im Hochgebirge am größten; es ist dort am kleinsten (Fels, Eis, alpine Wiese). Das
    Maximum liegt in den bewaldeten Mittelgebirgslagen.
  - ICON-CH1 gegen SSO_STDH: Spearman(ln z0, SSO_STDH) 0,50 unter 1 500 m (Wald und Relief hängen zusammen), **0,08 über
    1 500 m**; die Klasse SSO_STDH 400–2 000 m hat p50 0,46 m, weniger als 50–100 m (0,82 m).
  - ⇒ Die befürchtete falsche Paarung „orographisches z0_mod gegen orographiefreies z0_true" gibt es nicht.
- **Aber: GRIB-z0 liegt systematisch über der WorldCover-Näherung** (42 Orte aus §0, nächste Zelle, Relief = Höhenstreuung
  im 4-km-Kreis):

| Quelle gegen WorldCover | flach (< 50 m) | hügelig (50–200 m) | Gebirge (≥ 200 m) |
|---|---|---|---|
| t1 ICON-D2 / Zellbox | ×2,15 | ×2,93 | ×5,04 |
| t1 ICON-CH1 / Zellbox | ×1,45 | ×2,11 | ×5,23 |
| t2 ICON-EU / Zellbox | ×2,22 | ×3,62 | ×4,76 |
| t3 ICON global / Punktbox | ×2,72 | ×4,20 | ×4,53 |

  (Faktor = e^p50(ln GRIB/WC)). Das ist keine Orographie (s. o.), sondern die andere Klassentabelle bzw. Aggregation der
  Modelle — benannt als V-FI-100, nicht erklärt.
- **Zeitverhalten über Land:** innerhalb eines Laufs konstant (ICON-D2 +12/+24 h: > 1 % Änderung an 0,02/0,44 % der
  reinen Landpunkte, > 10 % an 0,00 %); **zwischen zwei Läufen** (00z gegen 12z, auch bei gleicher Gültigzeit) an 75 %
  der reinen Landpunkte > 1 %, an **16 % > 10 %** (V-FI-101). Über Wasser (fr_land < 0,5) 82 % > 10 % je Schritt
  (Charnock, V-FI-73).
- **Wirkung auf den Faktor:** 10 % z0 des Modells ≈ 1 % im Windfaktor; über Wasser (z0 am Punkt 0,0002 m) bewegt z0_mod
  1e-4 / 3e-4 / 1e-3 m den Faktor auf 0,991 / 1,006 / 1,025 (Plan §5 „Faktor-Empfindlichkeit berichtet").

**Folgerungen für den Entwurf (Abweichungen vom Plan §2.4 benannt):**
1. **ln-Blockmittel statt Nächster Nachbar** für die ikosaedrischen Gitter: ICON-CH1 legt ≈ 25 Zellen in eine t1-Zelle;
   der Nachbarindex der Felder nähme eine davon.
2. **ICON-CH1/-CH2 sind Spalten** (Plan: „in AP17 messen" — gemessen: vorhanden).
3. **Neubau-Regel gegen das Lauf-Rauschen** statt „Hash je Spalte" (die hmodel-Regel schriebe über Land fast jeden Lauf
   neu): erster Bau, neue Spalte, neuer Monat, oder > 1 % der Landzellen mit |Δ ln z0| > 0,5; nie bei fehlender Spalte
   oder schrumpfender Deckung (`Z0MOD_REWRITE`, `set`).
4. **Der Client mischt über die Windquellen des Laufs** (GRIB, wo veröffentlicht, sonst die WorldCover-Näherung) — nicht
   „GRIB je Stufe". `run.json` nennt je Quelle nur die ANZAHL der Stunden (`steps`), nicht welche ⇒ gemittelt über den
   Lauf, benannt (V-FI-102).

#### 9.5.2 Der Diff zur Freigabe (E-F-15) — Producer, Workflow-Vorlage; Publisher unverändert

**Einschalten:** nur `POINT_Z0MOD=1` baut das Produkt. Die Zeile steht in den drei Bauschritten der Cron-Vorlage; der Push
von `buscosun-web` allein schaltet nichts ein — erst Jans Kopie der Vorlage ins Daten-Repo. `POINT_STATIC=0` schaltet es
mit `hmodel` ab.

| Datei | Änderung |
|---|---|
| `scripts/point/staticZ0mod.mjs` (neu) | `lnBlockMeanRegular` (ln vor dem Mittel, dann `sampleRegularToTier`), `lnBlockMeanUnstructured` (Rundung der Zellkoordinate, Lücken ≤ 3 Zellen), `collectZ0mod` (Windquellen = Adapter mit `u10`; kein `safeCall` ⇒ zählt nicht gegen `SRC_MAX_ERRORS`; Domänenmaske), `decideZ0modRewrite` (Regel oben), `writeStaticZ0mod` (BSPC wie hmodel, `static.json` nur mit den Chunks geschrieben — kein Prüfstempel je Lauf), `Z0_ABSENT_REASON` (gemessene Gründe), netzfreier Selbsttest (22 Prüfungen) |
| `scripts/point/adapters/dwdRegular.mjs` | `roughnessParam` `z0`/`Z0`, `roughness(run, tier)` = Schritt 000, inline dekodiert (s. (3w)) |
| `scripts/point/adapters/dwdIcosahedral.mjs` | ICON global `Z0`, AICON `null`; `roughness` über die Zellkoordinaten (CLAT/CLON, schon geholt) |
| `scripts/point/adapters/meteoswiss.mjs` | `roughness` = `Z0` ctrl, Vorlauf 0 (Enumeration an der Laufzeit ist dieselbe wie `leadsFor` h 0 ⇒ Cache) |
| `scripts/point/build-point-cube.mjs` | `runRoughness` nur mit `withZ0mod` eingeplant (Bahnen und Rückfall), `z0mod` in der Stufe und in `run.json` nur mit Statistik; **keine** neue Phasenmarke ((3s)) |
| `scripts/repack-repo/workflow-point.yml` | `POINT_Z0MOD: '1'` in den Bauschritten t1/t2/t3 |
| `src/point/cubeFormat.ts` | `Z0MOD_PRODUCT` / `Z0MOD_VERSION` |
| `scripts/verify-point-data.mjs` | (3az) 11 Prüfungen (Selbsttest, Pfade, Schalter mit Gegenprobe, kein `safeCall`, Vorlage 3×, Adapter, Gründe, Register findet das Produkt, `cdnSync`-Klasse); (3w) um die **benannte Ausnahme** `roughness` erweitert (+ Gegenprobe): ln muss VOR dem Blockmittel stehen, der Pool mittelt arithmetisch |

- **Publisher:** keine Änderung. `scanStaticProducts` findet `z0mod/v1` mit Spalten und Chunkzahl ((3az) an echten
  Dateien), `point/index.json` kündigt es an, `cdnSync` wärmt neue Dateien. In place neu geschriebene Chunks werden wie
  bei `hmodel` nicht gepurgt — der Leser liest `static` über `@main` mit 12 h (V-FI-6); eine Monatsauffrischung erreicht
  Clients also bis zu 12 h später (benannt).
- **Kosten je Job (gemessen):** t1 +4,3 MB (D2 0,99 · EU 0,97 · CH1 2,30), t2 +3,2 MB (EU · CH2 0,57 · global 1,68),
  t3 +1,7 MB ⇒ ≈ 50 MB/Tag auf dem Runner; Wandzeit neben den Feldbahnen (eingeschränkter t3-Bau: 1,8 s, Felder 16,6 s).
- **Daten-Repo:** einmal 265 KiB (t1 208 Chunks / 206 KiB, t2 56 / 54 KiB, t3 12 / 4 KiB), danach nur bei Neubau.

#### 9.5.3 Client (nur `src/point/**`, `src/pointForecast/**`; voreingestellt aus)

- **`readPointBundle({ z0mod })`** (`readPoint.ts`): je Stufe `readStaticProductPoint(…, 'z0mod', 'v1', …)` mit den
  übrigen statischen Produkten (nie auf dem kritischen Pfad; progressiv in `late.static`). Ohne Option kein Abruf, kein
  Feld.
- **`CubeIo.z0mod`** (lesen, Cache-Schlüssel `|zm`) und **`FuseCubeOptions.z0Model`** (rechnen), beide aus.
- **`z0ModelMix`** (`cubeSource.ts`, rein): Windquellen = Spalten ∪ `absent` des Produkts ∩ Quellen des Laufs (`run.json`:
  Mittel, nicht gedroppt); GRIB-Wert, wo die Spalte die Zelle deckt; sonst die Näherung, wenn die Domäne (`geometry`,
  Regel wie `coversPoint`) die Zelle deckt; ohne GRIB-Quelle ⇒ `null` ⇒ die Näherung wie bisher.
- calib `z0Mod:model — …` mit den Werten je Stufe; die z0-Zeile nennt die Näherung dann nur noch für Quellen ohne z0;
  `calibByVar` ordnet `z0Mod` Wind und Böe zu; Notiz zählt die Schritte je Stufe.
- **Nicht gebaut:** kein `defaultCubeIo`-Eintrag (Browser aus), keine Panel-Anzeige, kein `v2codec`-Eingriff.

#### 9.5.4 Messungen

**Probebau aus echtem GRIB** (`audit/fusion-vollform/z0mod-local.mjs`, Beiträger aus dem lebenden `run.json`, Index
`9ada0bb`, Ausgabe nur im Scratchpad):
- t1 (icon_d2@18z, icon_ch1_eps@15z, icon_eu@15z): 208 Chunks, 206 KiB; Deckung D2/EU 48 441/48 441, CH1 23 133 (Domäne).
- t2 (icon_eu, icon_ch2_eps, icon_global @12z): 56 Chunks, 54 KiB; t3 (icon_global@00z): 12 Chunks, 4 KiB.
- `absent`: t1 claef, ifs_hres, aifs_single; t2/t3 aicon, ifs_hres, aifs_single — je mit gemessenem Grund.
- z0 min/max: ICON 6,7e-5 … 1,499 m, **ICON-CH 3,0e-5 … 1,000 m** (V-FI-103).
- Zweiter Durchgang mit denselben Läufen: nicht geschrieben.
- **Neubau-Regel am echten Lauf-Rauschen** (dieselben Quellen, Lauf −12 h): t1 D2 |Δ ln z0| p50 0,038 · p99 0,301 ·
  max 0,685, > 0,5 an **0,05 %** der Landzellen; EU 0,00 %; CH1 0,01 %; t2 0,00 % ⇒ bliebe stehen (Schwelle 1 %).

**Producer-Negativkontrolle** (eingeschränkter echter Bau `--tiers=t3 --only=icon_global,aicon,ifs_hres,aifs_single
--steps=126-132 --run=2026091812`, einmal ohne, einmal mit `POINT_Z0MOD=1`, derselbe Plattencache):
- alle 24 gemeinsamen `.bin` (12 Cube-Chunks, 12 hmodel-Chunks) **byte-gleich**; mit Schalter nur 13 Dateien
  `static/z0mod/v1/*` dazu;
- `run.json`: verschieden nur in `net` und `timing` (flüchtig) und in `tiers[].z0mod` / `timing.blocks.roughness`, die
  ohne Schalter fehlen.

**Wirkung an den 42 Orten** (`audit/fusion-vollform/z0mod-places.mjs`, Probebau + lebende Quellen, z_b 60 m, d0 = 0):

| Stufe | GRIB-Anteil der Windquellen p50 | z0 Mix / Näherung p10/p50/p90 | Windfaktor alt → neu p50 | neu/alt p10/p50/p90, max |
|---|---|---|---|---|
| t1 | 0,50 | ×1,23 / ×1,52 / ×2,99 | 1,009 → 1,049 | 1,023 / **1,041** / 1,068, 1,101 |
| t2 | 0,50 | ×1,21 / ×1,68 / ×2,25 | 1,007 → 1,053 | 1,017 / **1,046** / 1,071, 1,079 |
| t3 | 0,25 | ×1,19 / ×1,37 / ×1,59 | 0,994 → 1,019 | 1,015 / **1,026** / 1,037, 1,039 |

- Der korrigierte Wind stiege mit `z0Model` im Median um 3–5 %, höchstens um 10 % (Nürnberg t2, Zugspitze t1). Ob das
  richtig ist, entscheidet der Stationsvergleich (AP9/AP10), nicht diese Etappe ⇒ aus.

#### 9.5.5 Befunde (V-FI-100 …)

- **V-FI-100 — offen (AP10):** Das GRIB-z0 der ICON-Modelle liegt systematisch 1,5- bis 5-mal über der WorldCover-Näherung
  (flach ×2,2, Gebirge ×5 für ICON-D2), ohne Orographie-Anteil. Mit `z0Model` stiege der Wind im Median um 3–5 %.
  - **Mehrwert:** Welche Rauhigkeit das Modell seinem 10-m-Wind zugrunde legt, entscheidet die Richtung der Korrektur;
    mit der Näherung korrigiert der Cube-Pfad heute an homogenen Flachlandorten fast nichts (Faktor p50 1,01).
  - **Skizze:** AP9 rechnet im Nachlauf beide Varianten (das Produkt ist zeitlos, die Näherung auch); AP10 fittet z_b je
    Variante (Registry §2.5) und wählt die mit dem kleineren Wind-CRPS. Ursache (Klassentabelle, Kachel-Aggregation im
    Modell) nur benannt, nicht geklärt.
- **V-FI-101 — benannt:** z0 über Land ist eine Größe je LAUF: zwischen 00z und 12z ändert es sich an 16 % der reinen
  Landpunkte um > 10 % (auch bei gleicher Gültigzeit), innerhalb eines Laufs praktisch nicht. Das Produkt ist ein
  Schnappschuss (≈ ±1 % im Windfaktor); die Neubau-Regel filtert das Rauschen (0,05 % > Faktor 1,65 gemessen).
- **V-FI-102 — offen (Producer, S&F):** `run.json` nennt je Quelle `steps` als ANZAHL, nicht die Stunden. Der Client
  kann nicht wissen, welche Quelle welchen Schritt trägt (t1: CH1/IFS dreistündlich, AIFS sechsstündlich; t3: ICON global
  und AICON nur bis 180 h) ⇒ z0 des Modells wird über den Lauf gemischt; in t3 zählt ICON global jenseits 180 h mit
  (Anteil ¼), obwohl dort nur IFS/AIFS tragen — dieselbe Klasse wie V-PD-57.
  - **Skizze:** `sources[].leads` (Liste der Stufenstunden, ≤ 49 Zahlen je Quelle) additiv in `run.json`; `z0ModelMix`
    wählt dann je Schritt. Auch AP9 könnte damit die tragenden Quellen je Stunde nachrechnen.
- **V-FI-103 — benannt:** ICON-CH1/-CH2 deckeln z0 bei genau 1,00 m, ICON-D2/-EU/global bei 1,50 m (Maximum im
  Probebau). Im Wald trägt ICON-CH damit ein anderes z0 als ICON-D2 an derselben Zelle; die Mischung nimmt beide, wie sie
  sind.

#### 9.5.6 Gates und Messungen (18.09., Verifier einzeln, PowerShell ohne `2>&1`)

| Prüfung | vorher (AP16) | nachher |
|---|---|---|
| `npm run typecheck` | 0 | **0** |
| `verify:pv-cube` | 280/280 | **290/290** — (23) mit 10 Prüfungen (Mischung rein, Negativkontrollen, Windfaktor gegen die Handrechnung, calib/Notiz, Produktweg, Cache-Schlüssel, progressiv); Kosten allein gelaufen |
| `verify:point-client` | 161/161 | **165/165** — (10s) mit 4 Prüfungen (ohne Option kein Abruf/kein Feld, Werte je Stufe, Produkt fehlt ⇒ `null`, progressiv in `late.static`) |
| `verify:point-data` | 978/978 | **990/990** — (3az) 11 Prüfungen, (3w) Ausnahme + Gegenprobe; läuft im Cron als Gate vor dem Bau |
| `verify:calib-fit` · `verify:pv-fusion` · `verify:punktarchiv` | 14 · 229 · 103 | **14/14 · 229/229 · 103/103** (`punktarchiv` liest die geänderte Cron-Vorlage) |
| Build · Budget | 241/241 · totalJs 1 436,2 / 1 437 | **241/241** · eagerJs **107,9 (unverändert)** · largestChunk 301,2 · **totalJs 1 437,4 / 1 438** (E-F-21: +1,2 KB, alles im Lazy-Chunk `cubeSource`; Textsonde mit Gegenprobe: AP17-Texte nur dort, der Producer in keinem Chunk, nichts in `index-*.js`) |

**Ohne Option byte-gleich zum Stand vor AP17** (Scratch-Kopie von `src/`, jede AP17-Zeile exakt zurückgenommen, beide
Stände im selben Node-Prozess; Junction danach entfernt):
- `readPointBundle` mit Nachbarzellen: Bündel gleich, kein Feld `z0mod`.
- `fuseCubePoint` + v2 ohne z0, mit z0 v1 und mit Landbedeckung + `kappa` + `z0CellBox`: Schritte, calib, Notizen, v2
  gleich.
- Produktweg nicht-progressiv und progressiv, einmal nur z0, einmal mit Landbedeckung + AP16-Optionen: jede Ausgabe (v2,
  Stunden, Notizen, `pending`) und der Cache-Schlüssel gleich.
- Producer: s. §9.5.4 (Chunks byte-gleich ohne Schalter).

#### 9.5.7 Latenz, Selbstverifikation und Gate-Urteil

**Latenz vorher/nachher**, derselbe Tag, derselbe Aufruf (`--only=cubep --profiles=desktop-none,mobile-4g`, 10 Orte),
p50 in ms; vorher = der Nachher-Lauf von AP16 (`…T19-10-20-564Z.json`, derselbe Baum ohne AP17), nachher
`…T20-11-48-289Z.json`:

| Profil · Szenario | erste Darstellung (p95) | ganzes Fenster | letzte Ausgabe |
|---|---|---|---|
| Desktop · kalt | 739 → 777 (1 521 → 803) | 865 → 910 | 1 631 → 1 605 |
| Desktop · warm | 139 → 114 (179 → 166) | 209 → 186 | 485 → 456 |
| Desktop · kalt 24 h | 678 → 744 | — | 1 217 → 1 386 |
| Mobil-4G · kalt | 1 671 → 1 695 (2 001 → 2 250) | 2 585 → 2 623 | 4 293 → 4 239 |
| Mobil-4G · warm | 133 → 146 (160 → 280) | 426 → 442 | 1 369 → 1 212 |
| Mobil-4G · kalt 24 h | 1 650 → 1 610 | — | 3 336 → 3 458 |

- Voreinstellung: kein neuer Abruf, keine neue Rechnung ⇒ die Unterschiede gehen in beide Richtungen und liegen in der
  Streuung, die AP14/AP16 am unveränderten Pfad gemessen haben.
- Mit `CubeIo.z0mod` kämen je Punkt drei kleine Dateien (t1 ≈ 1 KB, t2 ≈ 1 KB, t3 ≈ 0,4 KB) und `static.json` in der
  Nachlieferung dazu — im Browser nicht gemessen, weil das Produkt im Daten-Repo noch nicht liegt (ein 404-Pfad wäre
  keine Messung); nachzuholen nach dem ersten Producer-Lauf.

**Die fünf Fragen:**
1. **Funktionserhalt:** Nichts entfernt. Producer: ohne Schalter nichts eingeplant, Chunks byte-gleich (§9.5.4). Client:
   ohne Option byte-gleich zum Stand vor AP17 (§9.5.6).
2. **Desktop pixelgleich:** keine UI-Datei geändert; die Produktausgabe ist ohne Option byte-gleich.
3. **Touch-Targets:** keine neue UI.
4. **Konsole:** keine neue `console.*`-Zeile in `src/`; der Producer loggt eine Zeile je Stufe (nur mit Schalter).
5. **Long Tasks:** ohne Option keine neue Rechnung im Browser; mit Option `z0ModelMix` je Schritt (≤ 6 Quellen, eine
   Summe) — vernachlässigbar.

**Gate AP17: grün für den Diff, Freigabe offen (S&F).** Gebaut, lokal an echtem GRIB gebaut und geprüft, nichts
eingeschaltet, nichts gepusht.
- Offen bei Jan (MANUELLE-SCHRITTE §18):
  - den Diff freigeben (E-F-15) — Reihenfolge Push `buscosun-web` ⇒ Kopie der Cron-Vorlage;
  - Ratsche 1 438 bestätigen (E-F-21);
  - AP17 ansehen und committen;
  - V-FI-100/102 zur Kenntnis (AP10 bzw. ein weiterer Producer-Diff).
