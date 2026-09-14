# Beschreibungen im Daten-Repo — Diagnose und Auffrischung

**Anlass:** Jans Befund vom 2026-09-14: „viele Beschreibungen sind veraltet".
**Gegenstand:** jeder Text, den ein Besucher von `jppetry/buscosun-data` liest — die
Repo-Beschreibung, die Kommentare der Workflows und die Erklärtexte in den Manifesten.
**Nicht Gegenstand:** die Daten selbst, die Fusion, `src/pointForecast/*`.

---

## §1 Wer den Text im Daten-Repo schreibt — gemessen, nicht angenommen

Zwei Klassen, und der Unterschied entscheidet, wie eine Korrektur dort ankommt.

| Datei im Daten-Repo | Herkunft | Wie eine Änderung ankommt |
|---|---|---|
| `README.md` | Kopie von `scripts/repack-repo/README.md` | **nur durch einen Commit ins Daten-Repo** |
| `.github/workflows/point.yml` | Kopie von `scripts/repack-repo/workflow-point.yml` | **nur durch einen Commit** (Jans Gate) |
| `.github/workflows/{build,radar,radar-watchdog}.yml` | Kopien aus `scripts/repack-repo/` bzw. `scripts/radar-mirror/` | **nur durch einen Commit** |
| `scripts/radar-mirror.mjs` | Kopie von `scripts/radar-mirror/radar-mirror.mjs` | **nur durch einen Commit** |
| `point/index.json`, `point/<lauf>/run.json`, `point/static/**/static.json`, `point/stations/<lauf>/stations.json`, `point/sources.json`, `point/calib.json` | vom Producer **je Lauf neu geschrieben** | mit dem nächsten Cron-Lauf von selbst |

Am Remote nachgemessen (Commit `40243a1`, 2026-09-14 17:11 UTC) — alle drei Kopien sind
**byte-gleich** zu ihren Vorlagen:

```
README.md              d82464a206bb05d7e6d44b468ef4c22b  (13 548 B, beide)
workflow point.yml     9d83f47b6e2ec83974ab9d6df3cb90fa  (19 036 B, beide)
scripts/radar-mirror   081e86bc7bb133aa761451ee734e19b1
```

Damit ist die Vorlage **der** Text des Daten-Repos, und die Auffrischung findet in
`buscosun-web` statt. Der Kopierschritt bleibt Jans Gate.

---

## §2 Der Stand, gegen den gemessen wird

Am Remote gelesen, nicht aus dem lokalen Klon (der war fünf Tage alt):

```
point/           2026091318 · 2026091400 · 2026091406 · 2026091409 · 2026091412 · 2026091415
latestByTier     t1 2026091415 · t2 2026091412 · t3 2026091400
schema 5         57 Ebenen (25 Mittel + 9 σ_div + 9 σ_ens + 7 q10 + 7 q90)
point/static/    hmodel/v1/{static.json, t1/…, t2/…, t3/…}
point/stations/  catalog.json + Laufverzeichnisse
retentionByTier  t1 9 h · t2 24 h · t3 24 h
```

⚠ **Damit ist eine Aussage meines eigenen PD-E-Berichts überholt:** „nichts committet,
nichts veröffentlicht" galt am 13.09. Jan hat `5ec08a6` gepusht, der Cron baut seither mit
dem neuen Producer — **PD-E ist live**. Der Lauf `2026091415` trägt in t1 alle sechs
Druckflächen-Ebenen mit **49 von 49 Schritten**, und `point/static/hmodel/v1/` führt in t1
fünf Spalten (`icon_d2`, `icon_ch1_eps`, `icon_eu`, `ifs_hres`, `aifs_single`) — zwei mehr
als beim lokalen Probebau.

---

## §3 Die veralteten Stellen im README, einzeln

Die Vorlage stammt vom 2026-09-09 (Stand PD-A). Seither: PD-B1…B10, PD-C, Block F, PD-D,
PD-E. Was davon im Text steht: nichts.

| # | Behauptung im README | gemessen heute | Klasse |
|---|---|---|---|
| 1 | „Punkt-Cube · 4 × täglich · `point.yml`" | **drei Jobs**: t1 8×, t2 4× (+ Stationen), t3 2× | falsch |
| 2 | Baumbild `point/` ohne `stations/`, ohne `static/`, ohne `.build` | alle drei liegen im Repo | unvollständig |
| 3 | Quellentabelle „Stand 2026-09-09": MOSMIX „offen", C-LAEF/ICON-CH „offen", ECMWF-Ensemble „nur der Kontrolllauf ist lesbar" | MOSMIX seit PD-B9 als eigenes Produkt, C-LAEF seit PD-B4, ICON-CH seit PD-B6, IFS-ENS seit PD-B10 mit **50 Membern**; `enfo-ef` hat **gar keinen** Kontrolllauf (PD-B8 am Katalog gemessen) | falsch |
| 4 | drei Zugriffsfamilien | **acht** (+ GeoSphere-REST/HDF5, MeteoSchweiz-STAC, DWD-EPS-Bündel, KMZ/KML) | falsch |
| 5 | „Aufbewahrung — 24 Stunden, quellenunabhängig", Tabelle „≈ 4 Läufe bei vier Slots" | `RETENTION_HOURS_BY_TIER` = **t1 9 h · t2 24 h · t3 24 h**; t1 kommt achtmal täglich | falsch |
| 6 | Zeitlos-Liste ohne `point/static/` | `TIMELESS_PATHS` führt es seit PD-C4/PD-E | unvollständig |
| 7 | „Der Punkt-Batch läuft vier Slots am Tag" | s. #1; dazu die gemessene Bereitstellung aus PD-F3c (ICON-D2 + 1,36 h, ICON-EU + 3,64 h) | falsch |
| 8 | Lizenztabelle ohne GeoSphere und MeteoSchweiz unter `point/` | beide tragen den Cube seit PD-B4/B6 | unvollständig |
| 9 | Producer-Liste ohne `build-stations.mjs`, `publish-point.mjs` | beide schreiben ins Repo | unvollständig |
| 10 | „Eine Punktabfrage lädt drei Dateien" | drei Chunks **plus** optional 1,5 KiB Modellhöhe und ein Stationsbündel | unvollständig |
| 11 | kein Wort über die 57 Ebenen, die Druckflächen, `srcCount`/`ensCount` | s. §2 | Lücke |
| 12 | „Warum es hier KEIN Geländeprodukt gibt" | gilt weiter — aber seit PD-E liegt die **Modell**orographie je Quelle dort, und genau diese Unterscheidung muss der Abschnitt tragen | irreführend |

Richtig geblieben und nachgeprüft: der Kartenlayer-Abschnitt (`keep: 4` im Wurzel-Index),
der Radar-Abschnitt (`status.json` schema 2, `keep: 12`), die Container-Beschreibung, die
Präfix-Falle der Familienschlüssel, „ein Verzeichnis ist eine Veröffentlichung".

---

## §4 Generierter Text — drei Stellen

Er erneuert sich je Lauf von selbst, also wirkt eine Korrektur im Code sofort; falsch ist
er trotzdem.

1. **`src/point/nowcastFormat.ts:219`** (⇒ `point/index.json → nowcast.note`):
   „der Modelllauf ist beim Bau **3,4–3,8 h alt**". Seit PD-F3c (Drei-Stunden-Takt,
   §52 gemessen) ist Stufe 1 **1,7 h** alt. Dieselbe Zahl steht in drei weiteren
   Kommentaren (`nowcastFormat.ts:13`, `nowcastReader.mjs:10`, `workflow-point.yml:17`).
   Die Aussage des Absatzes bleibt richtig — nur die Zahl trägt sie nicht mehr.

2. **`src/point/manifest.ts`**, Kommentar an `TIMELESS_PATHS`: begründet
   `point/static/` mit „Versiegelung, Gebäudehöhe aus GHS-BUILT" und nennt als Beispiel
   `point/static/ghs-2023-v1/`. Im Repo liegt **`point/static/hmodel/v1/`**; das
   GHS-Produkt ist bis heute nicht gebaut. Ein Kommentar, der ein Verzeichnis nennt, das
   es nicht gibt, und das verschweigt, das es gibt.

3. **`point/index.json` kündigt das statische Produkt nicht an.** Der Index führt
   `dir`, `sources`, `calibration`, `stations`, `nowcast`, `tiers`, `planes`, `runs` —
   aber keinen Eintrag für `point/static/`. Das Produkt ist veröffentlicht und im Register
   unsichtbar; der Client findet es nur, weil der Pfad in `staticPoint.ts` fest steht.
   Das ist die Umkehrung von V-SH-11 (dort: Leser ohne Schreiber; hier: **Schreiber ohne
   Ankündigung**) — und für jeden Dritten, der das Repo liest, unauffindbar.

---

## §5 Warum es veraltet ist — und was dagegen hilft

Der README trägt ein Dutzend Zahlen, die sonst nirgends stehen: Takte, Aufbewahrungs­stunden,
Bänder, Quellenzahl. Jede davon ist eine **Kopie** einer Konstante aus dem Code, und keine
Prüfung hält sie dagegen. Die sechs bestehenden README-Prüfungen in `verify-point-data.mjs`
(§11) fragen nur, ob Stichworte vorkommen (`point/`, `radar/`, `cape`, `ageH`) — alle sechs
waren grün, während die Hälfte der Aussagen falsch war. **Das ist BW-1 in Textform:** eine
fortgeschriebene Zahl ist keine gemessene.

Die Auffrischung allein wiederholt den Fehler in einem Jahr. Deshalb wird der Text an die
Konstanten **gebunden**: Bänder aus `TIERS`, Aufbewahrung aus `RETENTION_HOURS_BY_TIER`,
Zeitlos-Liste aus `TIMELESS_PATHS`, Takte aus den `cron:`-Zeilen der Vorlage, Verzeichnisse
aus den Pfadbauern. Jede Prüfung mit Negativ-Kontrolle gegen die alte Fassung.

---

## §6 Umsetzung

| Etappe | Inhalt | Beleg |
|---|---|---|
| **D1** | `scripts/repack-repo/README.md` neu — die zwölf Punkte aus §3 | Verifier D4 grün, alte Fassung fällt |
| **D2** | die drei Stellen aus §4: Laufalter je Stufe statt einer toten Zahl, TIMELESS-Kommentar auf `hmodel`, `static`-Block im Index | `point/index.json` nennt das Produkt; Publisher zählt, was wirklich liegt |
| **D3** | Kommentarkopf `workflow-point.yml` (dieselbe Zahl) | byte-gleiche Vorlage bleibt byte-gleich prüfbar |
| **D4** | Verifier: README gegen die Konstanten, nicht gegen Stichworte | neue Prüfungen + Negativ-Kontrollen |

**Nicht Teil der Umsetzung, weil Jans Gate:** der Commit ins Daten-Repo. Die Vorlagen
liegen danach aktuell in `buscosun-web`; bis sie kopiert sind, steht im Daten-Repo der
alte README. Der generierte Text (D2) kommt dagegen mit dem nächsten Cron-Lauf von allein.

---

## §7 Ergebnis

**D1 — README neu.** 13 548 → 21 255 Zeichen. Neu oder berichtigt: die drei Takte, das
vollständige Baumbild (`stations/`, `static/`, `.build`), die acht Zugriffsfamilien mit
Rolle je Quelle, die 57 Ebenen mit ihrer Aufteilung, die Druckflächen-Vorbehalte, die
Aufbewahrung je Stufe, die zeitlose Liste, zwei eigene Abschnitte für Stationsprodukt und
Modellhöhe, die Lizenzzeilen für GeoSphere und MeteoSchweiz, fünf statt drei Producer.

**D2 — generierter Text.** Laufalter je Stufe statt einer toten Zahl (t1 1,7 h · t2 3,8 h ·
t3 9,9 h, aus Slot − Modelllauf der veröffentlichten Läufe); TIMELESS-Kommentar nennt
`hmodel`; `point/index.json` hat einen `static`-Block. Die Abtastung dafür liegt als
`scripts/point/staticIndex.mjs` **außerhalb** des Publishers — der veröffentlicht beim
Import, eine dort wohnende Funktion wäre nicht prüfbar.

**Am echten Produkt belegt** (Publisher gegen ein Wegwerf-Repo mit dem vom Cron
geschriebenen `static.json`):

```
[publish-point] static/: 1 Produkt(e), 11 KiB — hmodel/v1
point/index.json → static.products[0].tiers
  t1  icon_d2, icon_ch1_eps, icon_eu, ifs_hres, aifs_single   208 Chunks
  t2  icon_eu, icon_ch2_eps, icon_global, ifs_hres, aifs_single  56 Chunks
  t3  …                                                          12 Chunks
```

**D4 — der Text hängt jetzt an den Konstanten.** Fünf neue Prüfungen: `readmeGaps()`
verlangt je Stufe Band, Gitter, Chunkzahl und Aufbewahrungsstunde, dazu Schritt- und
Ebenenzahl, die Aufteilung nach Ebenenart, die Registergröße, die drei Verzeichnisse und
jeden Eintrag aus `TIMELESS_PATHS`; eine zweite Prüfung verlangt jeden Takt, den die
Cron-Vorlage schaltet. Drei Negativ-Kontrollen mutieren den Text mit genau den Fehlern,
die am 2026-09-14 wirklich darin standen. Dazu neun Prüfungen (3ab) für die Abtastung:
schreiben → finden → ankündigen, mit Gegenkontrollen für „kein Produkt", „Verzeichnis ohne
Manifest" und „der Publisher benutzt dieselbe Funktion".

⚠ **Nebenbefund, schwerer als der Anlass: eine Prüfung aus PD-B8 konnte nie fehlschlagen.**
Beim Einfügen von (3ab) wurde `\b` durch die Python-in-Bash-Kette zu einem echten
Backspace-Byte (0x08) — dieselbe Werkzeugfalle wie §52, nur unsichtbar statt laut. Die
Suche danach fand **zwei** davon: das zweite steckt seit PD-B8 in Zeile 1906 in
`(3m) Streuungen werden nur mit dem FAKTOR skaliert`. Gemeint war `/\bconvert\(/`,
dagestanden hat `/<BS>convert\(/` — ein Muster, das auf keine Zeile passt, in einer
**Verneinung**: `!epsCode.some(…)` war damit immer wahr. Die Prüfung war zwei Wochen lang
grün, ohne etwas zu prüfen — genau die Klasse aus §45 („der Verifier hat den Fehler
bestätigt statt gefunden"). Beide Bytes entfernt; die Aussage stimmt auch echt geprüft
(`convert(` kommt im EPS-Code nicht vor), und eine Gegenprobe belegt jetzt, dass das
Muster überhaupt etwas trifft. **Lehre:** eine Prüfung, die eine Abwesenheit behauptet,
braucht eine Gegenprobe, dass ihr Muster im Anwesenheitsfall anschlägt.

⚠ **Zweiter Nebenbefund:** `data/repo` war ein Auscheckstand vom 09.09.; der Vergleich
„deployt gegen Vorlage" im Verifier misst deshalb den lokalen Klon, nicht das Remote. Die
Meldung ist als Auskunft formuliert und bleibt richtig (beide weichen ab), die genannten
Zeichenzahlen sind aber die des Klons. Gemessen wurde für diese Diagnose direkt gegen
`origin/main`.

**Gate:** `verify:point-data` **912/912** (war 897), `verify:point-client` 63/63,
typecheck 0, Build 241/241, Budget unverändert (eagerJs 107,9 · totalJs 1366,1).

**Offen — Jans Gate:** die Kopie von `README.md` (und, falls gewünscht, der unveränderten
`workflow-point.yml`) ins Daten-Repo. Bis dahin steht dort der Text von PD-A.
