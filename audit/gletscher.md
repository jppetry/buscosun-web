# Phase GL — Gletscher-Monitor DACH (Kachel 13, `/gletscher`)

Diagnose, Protokoll und Gates der Phase. Plan: `audit/gletscher-plan.md` (bindend: §1 Abweichungen A1–A11, §2 Branch- und
Repo-Modell), Konzept: `audit/gletscher-konzept.md`, UI-Vorgabe: `reference/gletscher-*.dc.html`, Startprompt `prompt-gletscher.md`.
Auftrag Jan 11.10.2026: Stufe 1 (GL-0 … GL-5) im Auto-Modus auf `feat/gletscher`; `GLACIER_LIVE` bleibt `false`; `main`,
`CLAUDE.md`, `MANUELLE-SCHRITTE.md` bleiben Jans (Plan A9) — Status und Jans Schritte stehen deshalb hier (§0, §9).
**Nachtrag am selben Abend (Jan):** die Daten liegen nicht in einem eigenen Repo, sondern in `buscosun-data` (Zweig `glacier` + `main`) und `buscosun-archiv`; die Schweizer Daten kommen über das WGMS und GLIMS statt
von glamos.ch (§6.1b); E-GL-14/15 sind entschieden (§5). Pushs in `buscosun-data` und `buscosun-archiv` hat Jan freigegeben.

## 0 Status (nur der aktuelle Stand)

| Paket | Stand | Beleg |
| --- | --- | --- |
| Branch/Worktree | `feat/gletscher` von `origin/main` (`1798fc5`), Worktree `C:\dev\buscosun-web\.wt-gl`, gepusht (Commit-Tabelle §7); `origin/main` ohne neuen Commit; `git diff --stat origin/main...HEAD -- src/pointForecast src/point scripts/point scripts/punktarchiv` ist **leer** | §7, §8.1 |
| **Daten** | **`buscosun-data` unter `glacier/v1/`** (Jans Entscheidung 11.10.: „ein Branch“, „die kurzfristigen Daten auch in buscosun-data“): `main` trägt die laufend aufgefrischten Linien (Zeiger, Status, `obs/`, `season/`, `melt/`, `feed/`, `card/`), der **verwaiste Zweig `glacier`** die schweren statischen Builds (die zwei neuesten bleiben); ein neuer Build geht zuerst auf den Zweig, der Zeiger danach. **Tagesablage** (Leitgletscher-Zeilen jedes Schmelzlaufs) in `buscosun-archiv` unter `glacier/v1/<Tag>/`. Vier Workflows in `buscosun-data` (`glacier-static|sat|melt|feed.yml`), einer in `buscosun-archiv` (`glacier-archiv.yml`); Producer-Ref = Repo-Variable `GLACIER_PRODUCER_REF`, Standard `feat/gletscher`, fällt auf `main` zurück, sobald der Zweig weg ist. Eingespielt am 11.10.2026 abends: Zweig `glacier` (Build `20261012-1`, 229 Dateien, `660788f`), `main` (Zeiger `3c2ca56`, Satellit `c75f0ec` mit 1 302 Kachel-Tagen und 8 476 Werten, Feed `c330553`, README + vier Workflows `4da589b`), `buscosun-archiv` (Workflow + README `2d42302`); die Seite liest die echten Adressen ohne Konsolenfehler (Prüfung mit dem Produktionscode des Clients). | §6.1b, §7 |
| **GL-1b Schweiz über WGMS und GLIMS** | **fertig, Gate grün** (`verify:glacier-static` 25/25 am vollen Baum `20261012-1`): Umrisse und frühere Umrisse der Schweiz aus der GLIMS Glacier Database (dieselben Inventare, Überdeckung 96–99 %, Beleg `audit/gletscher/glims-identity.md`), Längen- und Massenreihen aus dem WGMS FoG; keine Datei von glamos.ch mehr im Baum (CH 1 396 Gletscher statt 1 400, 961,42 km²; Längenreihen 155 → 120, Massenreihen 41 → 38) | §6.1b |
| GL-0 Spike | Messungen abgeschlossen (§2); Kriterien eingefroren (sha256 in §3, Nachträge je Linie) | §2–§4 |
| Gate A | Entscheidungen E-GL-1 … 12 im Auto-Modus gefällt (§5) | §5 |
| **GL-1** Vertrag, Atlas, DACH-Lage | **fertig, Gate grün** (ohne Real-Device) | §6.1 |
| **GL-2** Satellit | **fertig; Gate B1 ROT** nach dem eingefrorenen Protokoll: B1-1 (Median \|Δ\| gegen die GLAMOS-Gleichgewichtslinie **282 m** statt ≤ 150 m, P90 600 m) und B1-2 (schlechter als die Klimatologie, 261 gegen 164 m) rot; B1-3 (Konsistenz TSLA 2025 Median 111 m), B1-4 (98,2 % / 96,5 % Vollständigkeit), B1-5 (0 Verstöße), B1-6 (Maskenregel an Bildern) grün. Nachträglich und **nur als Hypothese** gerechnet: die höchste Schneegrenze der Saison trifft die Gleichgewichtslinie (Median \|Δ\| 92 m, Bias +14 m an denselben 29 Fällen; 105 m an 31 weiteren) — neuer Anspruch braucht ein Amendment 2 und neue Daten (§6.2). Folge: die Seite zeigt „Schneegrenze je klarer Szene“ und „höchste Schneegrenze“ als Szenenwerte, **nie als Gleichgewichtslinie** | §6.2 |
| **GL-3** Schmelze | **fertig; Gate C ROT**: C-1 (Sommerbilanz-MAE 0,63 / 0,62 m w. e. statt ≤ 0,30), C-2 (0,908 × Basislinie statt ≤ 0,90) und C-5 (Winterbilanz-MAE 0,36 statt ≤ 0,35) rot; C-3 (Bias +0,06 / +0,08 m) und C-4 (Hintereisferner 2024/25: −0,13 m) grün. **Die Einheit bleibt gesperrt:** das Produkt trägt nur den Schmelzindex 0–100 ohne Einheit (kein mm-Feld in der Datei). Betrieb gebaut: `melt.mjs` (2 203 Gletscher in 62–93 s), Zustand, Satellit-Nudge, Szenariosummen, Wiederholungsschutz | §6.3 |
| **GL-4** Steckbrief | **fertig, Gate grün** (ohne Real-Device): fünf Reiter, Karte mit Schneezone, Vergleichsregler, 3D mit MapLibre-Gelände, Diagramme, Tour-Wortprüfung, Quellenliste | §6.4 |
| **GL-5** Updates | **fertig, Gate grün**: Feed mit stabilen Kennungen, Rangliste „Schmelzindex“ (nur Modell, ohne Einheit), Folgen + „Neu seit deinem letzten Besuch“, Wochenkarte (PNG), CSV und Bild-Export | §6.5 |
| Gate D Vorbereitung | Verifier, Pixelvergleich, Antworten auf die zehn Prüffragen: §8.1; **offen für Jan:** Real-Device, Edge-Bündel, Merge, `GLACIER_LIVE` | §8, §9 |
| Gate B2 / E | B2 = 14 Tage `glacier-sat.yml` im echten Daten-Repo: **läuft seit dem 11.10.2026** (Workflows eingespielt 22:10 UTC; erster planmäßiger `glacier-sat.yml`-Lauf 22:48 UTC grün, Einzelheiten V-GL-22; melt 3-stündlich, feed 05:35, archiv alle 6 h um :47); die Auswertung nach 14 Tagen ist Jans Beobachtung (§9); E = Sommer 2027 (neu eingefrorenes Protokoll, E-GL-15) | §8 |
| E-GL-14 / E-GL-15 | **entschieden (Jan 11.10.):** Satellit bleibt Szenenwert; die Regel „höchste Schneegrenze der Saison“ ist als **Nachtrag 2 vorab eingefroren** (`claims-frozen-amendment-2-b1.md`, sha256 in §3) und wird an der Saison 2026 geprüft, sobald GLAMOS/UIBK sie veröffentlichen; der Schmelzindex bleibt ohne Einheit, eine Eichung mit Einheit erst nach dem Sommer 2027 mit neuem Protokoll | §3, §5 |
| Fortsetzung | Alles Gebaute ist grün. Offen für Jan: Real-Device, Merge (+ `npm run edge:share`), `GLACIER_LIVE` (§9). Die nächste Session beginnt mit der Beobachtung der Workflows (Gate B2) und der Auswertung von Nachtrag 2 nach den 2026er Bilanzen (§3); GL-6 (Stufe 2) ist nicht begonnen | §9, §10 |

## 1 Anker (am Code und an den Daten gelesen, 11.10.2026)

- Muster der Einbindung = Phase SW (`4bdade3`): `src/sea/*`, `src/router/pages/SeaRoute.tsx`, `src/App.tsx` (`FeatureId`),
  `src/nav/featureRail.tsx`, `src/SearchPage.tsx` (Kachel, Palette, Zähler), `src/router/routes.ts` (`RouteId`, `subParam`,
  Selbsttests `[SW]`), `src/router/router.tsx`, `netlify.toml` (Redirect-Aliase + 200-Rewrites auf die Shell),
  `scripts/generate-seo.mjs` (`flagGateScript`), `package.json` (`verify:*`), `budget.json`.
- buscosun Fusion in Node: `scripts/road/road-forecast.mjs` (`makeIo`, `dirStore`, `geoBackend`) und `scripts/sea/sea-derive.mjs`
  (`--data=cdn` liest den Cube über `httpStore`; bricht ab, wenn `io.clima()` fehlt — V-SW-18).
- COG-Leser DOM-frei: `src/fire/detail/cogTiff.ts` (`parseCogIfds`, `tilesFor`, `decodeTile`/`U16`/`F32`), Geometrie `sentinelGeo.ts`
  (`utmFwd`/`utmInv`/`pixelOf`), Szenen `fireSatImagery.ts` (`parseS2CogCandidates` liefert nur `swir22`/`nir08`/`red`/`scl` + TCI).
- Neu für die Phase (kein Eingriff in Bestand): `scripts/glacier/lib/{s2cog,raster,png,dwdNew}.mjs`, `scripts/glacier/py/glamos_csv.py`,
  `scripts/glacier/spike/*` (Messskripte), Pins `scripts/glacier/requirements.txt`.

## 2 GL-0 — Messungen gegen die Annahmen des Plans

### 2.1 Inventare (Plan §5.2: „rund 2 200 Gletscher, rund 1 000 km²“)

`scripts/glacier/spike/inventory-count.py` (Klassen A ≥ 1 km², B 0,1–1, C < 0,1):

| Land | Inventar (Bezugsjahr) | Gletscher | Fläche km² | A (n / km²) | B (n / km²) | C (n / km²) |
| --- | --- | --- | --- | --- | --- | --- |
| CH | SGI2016 (2013–2018, Aufnahmejahre 2013…2018) | 1 400 | 961,27 | 160 / 766,5 | 514 / 165,2 | 726 / 29,6 |
| AT | **AGI 5** (2021–2023; 2021: 8 Teile, 2022: 311, 2023: 480) | 799 | 285,49 | 67 / 194,4 | 249 / 75,9 | 483 / 15,2 |
| AT (früher) | GI4 2015 | 783 | 329,05 | 74 / 227,1 | 269 / 86,7 | 440 / 15,2 |
| DE | RGI 6.2 Region 11 (2003-Umrisse) + BAdW-Zahlen | 4 benannt (7 RGI-Einträge: Nördl. Schneeferner 0,351 · Höllentalferner 0,223 · Südl. Schneeferner 1/2 · Blaueis 1/2 · Watzmann) | RGI 0,76; BAdW 2025: 0,262 | 0 / 0 / 4 | | |

- **Summe:** 2 203 Gletscher (CH 1 400 + AT 799 + DE 4) — das Konzept stimmt. **Fläche:** 1 246 km², nicht „rund 1 000“: die
  1 000 km² entstehen nur, wenn man die GLAMOS-Schätzung für CH Ende 2026 (≈ 714 km²) statt des Inventars (961 km², 2013–2018)
  nimmt. Folge für die Anzeige: **jede Fläche mit Bezugsjahr**, nie eine DACH-Summe ohne Jahrangabe (Plan §6 „Fläche“).
- **Klassen:** A 227 (CH 160, AT 67), B 763 (CH 514, AT 249), C 1 213 + 4 DE. 87 % der österreichischen Gletscher < 0,5 km²: gemessen
  AGI 5 mit 483 + 249 von 799 unter 1 km², 483 unter 0,1 km² ⇒ Klasse C = 60 % der AT-Gletscher.
- **AGI 5 ist freigegeben** (PANGAEA 991106: 20 GeoJSON, CC-BY-4.0, Status „Enhanced curation“, einzeln ohne Konto ladbar;
  Begleitpapier The Cryosphere 20(9), 2026; `vanishing_glaciers.geojson`: 95 = 38 verschwunden + 57 „vanishing“). Der Plan nahm
  GI4 als Übergang an (E-GL-9) — nicht nötig.
- **Paul et al. 2020** hat **keinen** Länder-Code `DE` (nur AT/CH/FR/IT); die zwei Zugspitz-Ferner stehen darin unter `AT`
  (Nr. 2844/2845, 0,153/0,147 km², 2015/16), Watzmann und Blaueis **fehlen**. Das Konzept („deckt DE“) stimmt nur zur Hälfte.
- Fehlt: RGI 7.0 (NSIDC-Login = Jans Schritt). RGI 6.0 liegt nicht mehr bei GLIMS (301 auf rgidata.org → NSIDC); als Ersatz dient
  **RGI 6.2** vom Server der OGGM-Gruppe (`rgi62.zip`, Region 11 per Range-Abruf, CRC32 geprüft) — gleiche IDs `RGI60-11.xxxxx`, nur
  Brücke zu GloGEM und Umrisse der vier deutschen Gletscher.

### 2.2 Lizenzen am Originaltext (Plan §5.3) — Register `audit/gletscher/licences.md`

Wichtigster Befund: **GLAMOS widerspricht sich.** DOI-Landingpages (`doi.glamos.ch/data/inventory/inventory_sgi2016_r2020.html`,
`…/massbalance_2025_r2025.html`) und der DOI-Index: „All GLAMOS products are referenced with DOI and licensed under Creative
Commons Attribution 4.0 International License (CC BY 4.0).“ Die CSV-Köpfe und das Impressum (`glamos.ch/en/imprint`) dagegen:
„GLAMOS data are freely available and may be used for scientific and non-commercial use under the requirement of correct
indication of the source.“ **Einstufung: gelb** (Widerspruch). Entscheidung D-GL-3: die spezifischere, datensatzbezogene und
aktuellere DOI-Lizenz gilt (CC BY 4.0), die GLAMOS-Zahlen liegen aber in **eigenen, einzeln löschbaren Pfaden**
(`series/ch/`, `official.json`-Einträge mit Quelle), und Jan bittet GLAMOS um Bestätigung (§9.4). Die Dateien wurden vor dem Lesen
der Lizenzzeile in den Cache geladen (nur außerhalb der Repos, Analyse) — Abweichung vom „rote Quellen nie laden“, weil die Quelle
zu diesem Zeitpunkt noch nicht als rot galt; sie ist es auch jetzt nicht, sondern gelb.

### 2.3 Messreihen (Plan §5.4)

- **GLAMOS** (Release 2025): Massenbilanz je Beobachtungsperiode mit `Bw`, `Bs`, `Ba`, ELA, AAR, Fläche — **Jahr 2023 / 2024 / 2025:
  29 / 28 / 27 Gletscher**, davon ≥ 1 km²: 20 / 20 / 19; Höhenband-Bilanzen (`massbalance_*_elevationbins.csv`) für dieselben;
  Längenänderungen > 100 Gletscher; Volumen. **2025/26 ist nicht veröffentlicht** (die Release-Dateien sind vom 14./18.11.2025 und
  04.12.2025; die Oktober-Schätzung 2026 steht nur im Pressetext) ⇒ Plan-Ersatz Leave-year-out (§3).
- **WGMS FoG 2026-02-10** (`wgms.ch/data_policy`: „WGMS data are open access under the requirement of correct citation …, which
  corresponds to a CC BY 4.0 license by Creative Commons“): Massenbilanz mit ELA/AAR **und Höhenbänder für Österreich**
  (Hintereisferner 25 Bänder, Kesselwandferner, Vernagtferner, Jamtalferner, Venedigerkees, Hallstätter, Seekarlesferner,
  Zettalunitz/Mullwitz, 2020–2025) und `rgi60_ids`/`rgi70_ids` je Gletscher. Hintereisferner 2025 = Sommer −2,595 / Jahr −1,793 m w. e.
  (stimmt mit dem Plan überein). Goldbergkees, Pasterze, Stubacher Sonnblickkees nur Jahresbilanz.
- **ÖAV-Länge** auf PANGAEA: 1969–2016 (CC-BY-3.0) und je Jahr 2016/17 … 2022/23 (CC-BY-4.0); **2023/24 und 2024/25 sind dort noch
  nicht** (Antwort auf die offene Frage des Plans) — diese Jahre nur als Zitat aus dem ÖAV-Bericht mit Datum (Plan §6).
- **TSLA** (Zenodo 18223929, CC-BY-4.0): Tabellen 14,8 MB (md5 geprüft); End-of-Summer-Schneegrenze 2000–2025 je Gletscher > 1 km²
  mit RGI-7-Attributen inkl. Schwerpunkt — Basislinie „Klimatologie“ für B1-2.
- **GloGEM CMIP6 v2** (Zenodo 17632573, CC-BY-4.0): **nicht** als 3,4-GB-Archiv geladen (Abbruch bei 30 MB), sondern **nur
  `RGI_region_11.nc` (46 MB, 45 MB komprimiert) per Range-Abruf, CRC32 gegen das Zip-Verzeichnis geprüft** (sha256
  `ceeef67e…e7b9a96`). Abweichung vom Plan („Prüfsumme gegen Zenodo“): der md5 des ganzen Archivs wurde nicht geprüft, weil das
  Archiv nie vollständig geladen wurde; die Integrität des genutzten Teils ist über CRC32 belegt. 3 905 Gletscher, 12 GCM × 4 SSP
  (126, 245, 370, 585 — **kein SSP1-1.9**) × 2015–2100, `Volume` in m³ und `Area` in m² (Einheiten sind nicht deklariert, aus der
  Summe 110 km³ abgeleitet). Die Datei trägt keine Koordinaten; die Zuordnung zu den Inventaren geht über RGI 6.2 (Schwerpunkt, Fläche)
  bzw. `rgi60_ids` aus FoG.
- BAdW: keine Daten, nur Pressetexte (Zitat, §6 `official.json`).

### 2.4 Leitgletscher (Plan §5.5)

42 Gletscher, Vertrag für Archiv und Prüfung (Namen aus GLAMOS/FoG; IDs im Static-Build GL-1 gebunden):

- **27 GLAMOS-Gletscher mit Höhenband-Bilanz 2025** (davon 19 ≥ 1 km²): Allalin, Alphubel N, Chessjen NW, Otemma, Claridenfirn, Findelen,
  Basòdino, Corbassière, Orny, Tsanfleuron, Tortin, Corvatsch, Pers, Plaine Morte, Giétro, Sex Rouge, Plattas/Medel, Gries, Großer Aletsch,
  Hohsaas, Hohlaub, Oberaar, Murtèl, Schwarzberg, Silvretta, Rhone, Plan Névé.
- **8 österreichische mit Höhenbändern (FoG):** Hintereisferner, Kesselwandferner, Vernagtferner, Jamtalferner, Venedigerkees, Hallstätter,
  Seekarlesferner, Zettalunitz/Mullwitz.
- **3 weitere österreichische:** Pasterze, Goldbergkees, Stubacher Sonnblickkees.
- **4 deutsche:** Nördlicher Schneeferner, Höllentalferner, Watzmanngletscher, Blaueis.

### 2.5 Sentinel-2 (Plan §5.6)

- **Szenenzahl** (Earth Search, `sentinel-2-l2a`, 01.06.–10.10.2026, `stac-scenes.mjs`): je Gletscher 80–81 Items (Pasterze 80 auf zwei Kacheln),
  davon 66–67 verschiedene Aufnahmetage je Kachel; Items sind teils doppelt (`_0_`, `_1_`, `_2_` am selben Tag). Wolkenarme Szenen
  (Szenen-`eo:cloud_cover` < 20 %): je Monat 1–9 Tage (Hintereisferner Juni 1, Juli 5, Aug. 5, Sept. 9).
- **Assets:** `scl` (20 m), `green` = B03 (10 m), `swir16` = B11 (20 m), `swir22` = B12, `red`, `nir`, `nir08`, `blue`, `visual` (TCI), `snow`,
  `cloud` (Sen2Cor-Wahrscheinlichkeiten, 20 m).
- **COG-Blockgröße 1 024²** (10 m) — der Fensterabruf kostet daher Kacheln, nicht Pixel: ein Gletscher-Fenster (Hintereisferner, 5,6 km²)
  = SCL + B03(10 m) + B11 ≈ **3,0 MB, 6 Requests**, 2,4 s sequentiell lokal. **B03 aus der 20-m-Übersicht** (Overview-Ebene 1) statt 10 m:
  **1,5 MB → 0,4 MB** (−73 %), Schnee/kein-Schnee-Entscheidung (NDSI > 0,4) stimmt an **99,96–99,99 %** der Gletscherpixel überein
  (13.08., 12.09., 19.06.) ⇒ Entscheidung D-GL-5: alles auf dem 20-m-Raster. Die Überschlagsrechnung des Konzepts (650 MB je Aufnahmetag)
  gilt damit als Größenordnung bestätigt; die Messung am Runner steht aus (kein Repo, §9.1) — nachgeholt, sobald das Repo besteht.
- **SCL gegen Wolke/Schnee, an Bildern geprüft** (`scl-check.mjs`, `render-scene.mjs`; Bilder `audit/gletscher/img/`):
  - Klare Tage (Szene < 5 % Wolke): SCL liefert plausible Schneeanteile (13.08.: 48 %, 06.09.: 66 %, 12.09.: 87 %), 0 % Wolke, 8–18 % Schatten/dunkel
    (SCL 2/3: Geländeschatten bei tiefer Sonne — ab September relevant).
  - **08.06.2026: der Gletscher ist ganz schneebedeckt** (Echtfarbe weiß), Sen2Cor zeichnet drei „Wolken“-Flecken hinein (28 % der Maske).
    Die einfache Regel „SCL-Wolke = ungültig“ behält hier 72 % klare Fläche und liefert keine falschen Werte, verliert aber Fläche.
  - **26.07.2026: dichte Wolkendecke** (Echtfarbe weiß, Gletscher unsichtbar), 100 % SCL-Wolke; 75 % der Wolkenpixel haben trotzdem
    NDSI > 0,4 und B11 < 0,12 — **dünne Eiswolke sieht im NDSI wie Schnee aus**. Eine „SWIR-Rettung“ der Wolkenpixel würde an diesem Tag
    75 % Schneeanteil erfinden (tatsächlich ≈ 0 %).
  - B11 ≥ 0,15 bestätigt Wolke (01.07.: 13 389 von 14 034 Wolkenpixeln), kann sie aber nie freisprechen.
  - **Maskenregel (D-GL-4):** ungültig sind SCL 0, 1 (keine Daten/gesättigt), 2 (dunkel/Geländeschatten), 3 (Wolkenschatten), 8, 9, 10 (Wolke, Zirrus).
    Szene gültig ab **≥ 70 % klaren Pixeln** in der Gletschermaske. **Keine SWIR-Rettung.** Die Zahl „Wolke, aber schneeähnlich“ wird je
    Szene als Diagnose mitgeschrieben (kein Wert). Das Gegenteil des Plan-Gedankens („SWIR entscheidet“): SWIR bestätigt, entlastet nicht.

### 2.6 Cube und buscosun Fusion in Node (Plan §5.7)

`scripts/glacier/spike/fusion-probe.mjs` (Cube über das CDN wie `sea-derive --data=cdn`, Land je Punkt, `pointSource: 'cube'`):

- Hintereisferner (46,80 N, 10,78 E, AT): **kalt 1 902 ms, warm 85 ms** für 337 stündliche Schritte (0–336 h); 19 Dateien / 2,1 MB aus dem
  Cube; `hTrue` 2 950 m (Terrarium), Stufe `fs` / buscosun Fusion 12.
- Größen je Schritt: `t2m` (p10/p50/p90, σ, Verteilung), `td2m`, `rh`, `wind`, `gust`, `windDir`, `precip`, `pSnow`, `clct`/`clcl`/`clcm`/`clch`,
  `ps`, `snowline` (alle mit `members`/`sigmaKind`/`calib`). Rohzellen je nativem Schritt (`cube.cells`, 98 Schritte): `t925 t850 t700 rh925 rh850 rh700
  gammaEff zBase zInv dTInv hModEff` — am Hintereisferner `hModEff` 2 884 m, `ps` 712,8 hPa (die 700-hPa-Fläche liegt knapp **über** dem Boden).
- Land je Gletscher: `country` ist ein Argument des Aufrufs (`road-forecast.mjs` fest `'DE'`) — wirkt über Landesparameter des Stationswerts
  (`stack.client.json`, `ws|3|S|CH`); der Gletscher-Job gibt AT/CH/DE je Gletscher mit.
- Gegenprobe V-SW-18: der Gletscher-Job prüft `await io.clima()` und bricht mit rotem Job ab, wenn `public/climaGrid.json` fehlt (wie
  `sea-derive.mjs`); der Verifier `verify:glacier-melt` enthält die Negativkontrolle (§6, GL-3).

### 2.7 `hzerocl` und Strahlung im neuen DWD-Schema (Plan §5.8)

`scripts/glacier/lib/dwdNew.mjs`, `spike/hzerocl-probe.mjs`:

- Pfad `weather/nwp/v1/m/<modell>/p/<PARAM>/r/<ISO-Lauf %3A>/s/PT<HHH>H<MM>M.grib2`; Zeitinvariante `CLAT`/`CLON` im selben Baum
  (`…/CLAT/r/<Lauf>/s/PT000H00M.grib2`); ICON-D2 **542 040** Zellen, ICON-EU **768 608**; Rohes GRIB2 mit CCSDS, Dekoder `gribDecode.ts`
  ohne Änderung; Zellkoordinaten in 0,5 s, **~740 KB und ~0,3 s je Schritt**; ICON-D2-Lauf 09 UTC vollständig (+48 h) um **10:05:55 UTC**
  (+66 min), `+0 h` um 09:43. ICON-D2-Felder auch 15-minütig (196 Dateien je Parameter).
- **Gegenprobe an Messstationen** (11.10.2026 11:00 UTC, `obs/v1/latest.json`): Sonnblick (3 109 m) T −2,8 °C ⇒ aus der Station abgeleitete
  Nullgradgrenze 2 678 m, ICON-D2 `hzerocl` 2 766 m (+88 m); Zugspitze (2 956 m) T −5,3 °C ⇒ 2 140 m, Modell 2 270 m (+130 m). Jungfraujoch
  (3 571 m): T −5,3 °C ⇒ 2 756 m, **ICON-D2 3 363 m und über alle 7 Stunden konstant** — das ist die Geländehöhe der Modellzelle:
  **`hzerocl` ist an Zellen, deren ganze Säule unter 0 °C liegt, auf die Modellorographie gesetzt (zensiert), keine Messgröße**. ICON-EU
  liefert dort 2 579–2 953 m (kleinere, glattere Orographie). **Regel (D-GL-6):** `hzerocl ≤ Modell-Bodenhöhe + 10 m` heißt „Nullgradgrenze unter
  dem Boden der Zelle“ und wird nicht als Höhe verwendet; die Bandsäule fällt dann auf `t2m` + gemessene Rate (Plan A10) zurück und die
  Zensur wird im Lauf mitgeschrieben.
- **Strahlung** `ASWDIR_S`/`ASWDIFD_S` (Mittel seit Laufbeginn, W/m²): Jungfraujoch +1 h 584, +2 h 604 (⇒ Schrittmittel 10–11 UTC 624 W/m² direkt);
  gemessen `gr` 641 W/m² (SMN, 11:10) — Größenordnung stimmt, die Prüfung gegen die Eigenrechnung (Klarhimmel × Bewölkung) folgt in GL-3 und
  entscheidet E-GL-11 am Messwert.
- **Der Hindcast führt weder `freezing_level_height` noch Globalstrahlung** (Wahrheit: t, td, rh, ff, dd, fx, rr, n, p). Die Höhenkorrektur über
  3 000 m läuft deshalb nur mit `hzerocl` (live) und den Stationen; die Eichung rechnet die Strahlung als Modell (Klarhimmel × Fusion-Bewölkung).

### 2.8 Messantrieb (Plan §5.9)

Hindcast-Wahrheit `truth/stations.json`: 405 Punkte, davon **24 Stationen ≥ 1 800 m** (Jungfraujoch 3 571 m, Piz Corvatsch 3 294, Sonnblick 3 109,
Zugspitze 2 960, Weissfluhjoch 2 691, Piz Martegnas 2 668, Säntis 2 501, Gd-St-Bernard 2 472, Crap Masegn 2 468, Naluns 2 380, Ischgl/Idalpe 2 327,
Rudolfshütte 2 317, Gütsch 2 286, Patscherkofel 2 251, Villacher Alpe 2 117, Pilatus 2 105, Galzig 2 079, Grimsel Hospiz 1 980, Le Moléson 1 974,
Buffalora 1 971, Schmittenhöhe 1 956, Obergurgl 1 941, Robiei 1 898, Evolène 1 825); stündlich, `t` 0,01 °C, `td`, `rh`, `ff`, `dd`, `fx`, `rr1h`, `n` (Bewölkung %),
`p`. **Keine Globalstrahlung ⇒ ETI mit gemessener Strahlung ist in der Eichung nicht möglich**; Rückfall des Plans ist nicht der reine Gradtag,
sondern **ETI mit Modellstrahlung (Klarhimmel × Bewölkung `n`)**; der Gradtag mit Standard-Lapse bleibt die Basislinie BL-C. Zuordnung Gletscher →
Station (≤ 30 km, |Δh| ≤ 1 800 m) in GL-3.

### 2.9 Budget und Wachstum (Plan §5.10)

- **Umrisse** (WGS84-GeoJSON, 5 Dezimalen, Douglas-Peucker in der lokalen Projektion; `outline-budget.py`): CH L1 (60 m) 0,72 MB roh / 0,19 MB gzip,
  L2 (15 m) 1,82 / 0,49, L3 (4 m) 5,05 / 1,28; AT L1 0,43 / 0,10, L2 0,92 / 0,23, L3 2,41 / 0,58; Flächenabweichung je Stufe −1,4 % … +0,1 % (Regel ±3 %),
  0 ungültige Ringe nach der Vereinfachung. Epochen kommen dazu (SGI1850/1931/1973/2010 je ≈ Größe von L2/L3).
- **Szenen:** Plan rund 150 B je Szene und Gletscher; Messwert folgt in GL-2.
- **Wachstum der Historie:** die Läufe sind der Posten, der zählt (jede Datei bleibt für immer in der Historie). Bei 4 Läufen/Tag und
  ≥ 1,5 MB gzip je Lauf wären es ≥ 2,2 GB/Jahr — über der Grenze 1 GB/Jahr. **Gegenmaßnahme schon im Vertrag:** Bänder nur für Klasse A (227), Klassen B/C als
  Gletschermittel, Quantile nur für Tagessummen, zwei bis vier Läufe täglich je nach Messung in GL-3; Ziel ≤ 0,25 MB gzip je Lauf (≈ 0,4 GB/Jahr).
- **jsDelivr:** Dateien < 20 MB, Paket < 150 MB: statisch ≈ 25 MB roh (alle Epochen, Stufen), laufende Linien < 20 MB.

### 2.10 Offene Prüfpunkte des Konzepts (Plan §5.11)

- Gletscherschwundtag 2026 (Quellen nennen 29.06./02.07.) — ist in dieser Stufe nicht Teil der Anzeige; die amtliche Zahl wird nur mit Quelle zitiert (GL-5).
- AGI 5: freigegeben, s. 2.1.
- Zahl je Klasse: s. 2.1.

## 3 Eingefrorene Kriterien (Plan §5 Punkt 12)

`audit/gletscher/claims-frozen.md`, eingefroren **11.10.2026 11:30 UTC** vor Rückrechnung und Hold-out;
**sha256 (LF-normalisiert) `4c309b2321c1f452bade14f2434657a46699471de00b9fc1f081ba96c4a6ed32`**, Kopie `audit/gletscher/claims-frozen.sha256`.
Inhalt: B1-1 … B1-6 (Median \|Δ\| ≤ 150 m gegen GLAMOS-ELA, P90 ≤ 400 m, ≥ 12 Fälle, besser als TSLA-Klimatologie, Konsistenz TSLA 2025,
Vollständigkeit ≥ 90 %, keine Unmöglichkeiten, Fixtures); C-1 … C-7 (Sommerbilanz MAE ≤ 0,30 m w. e., ≤ 0,9 × Gradtag-Basislinie, \|Bias\| ≤ 0,15,
Hintereisferner ≤ 0,40, Winterbilanz ≤ 0,35 und besser als roher Fusion-Niederschlag, Prognose-Hindcast je Vorlauf-Bin ≤ 35 % / ≤ 20 % für die Anzeige
mit Einheit) — jeweils in **LYO** (leave-year-out über 2023/24/25) **und LGO** (leave-glacier-out).

**Nachtrag 2 zu B1 (E-GL-14, eingefroren 11.10.2026):** `audit/gletscher/claims-frozen-amendment-2-b1.md`, **sha256 `bda6654720e391e5de5c45b9752a5d4fc09aec9cc4d08d039001672f543b10eb`** (Kopie `…-b1.sha256`). Die Regel „höchste Schneegrenze der Saison“
(Maximum der Szenen-Schneegrenzen 15.07.–10.10., ohne Neuschnee-Marke, ≥ 2 Szenen) wurde an denselben 29 Gletscherjahren gefunden und zählt dort **nicht**; geprüft wird an der Saison 2026 mit den Schwellen B1b-1 … B1b-5
(Median ≤ 150 m, P90 ≤ 400 m, |Bias| ≤ 100 m, besser als die Klimatologie, ≥ 12 Gletscher davon ≥ 5 außerhalb der Schweiz). Die Satellitendaten der Saison 2026 sind mit der sortierten Szenenliste (437 Kachel-Tage,
sha256 `e6428a02…f45a`, `scenes-2026-frozen.txt`) festgehalten. Bis zum Urteil heißen Satellitenwerte „Szenenwerte“.

## 4 Verifizierte Bausteine des Spikes

| Baustein | Beleg |
| --- | --- |
| COG-Fenster in Node (`s2cog.mjs`) mit `cogTiff.ts`, Maske aus Polygon (`raster.mjs`) | `scl-check.mjs` an 22 Szenen Hintereisferner, 132 Requests 65 MB, Maske 14 034 px = 5,61 km² (AGI 5: 5,616 km²) |
| Bilder zur Maskenregel | `audit/gletscher/img/render-hintereisferner-2026-{06-08,07-26,07-01}.png` |
| Neues DWD-Schema | `hzerocl-probe.mjs` (ICON-D2, ICON-EU), 16 Requests 11–14 MB |

## 5 Entscheidungen im Auto-Modus (Gate A)

Jede mit Beleg; „Plan“ = Empfehlung des Plans übernommen, es sei denn, eine Messung widerspricht.

| Nr. | Entscheidung | Beleg |
| --- | --- | --- |
| E-GL-1 | Name „Gletscher“, `/gletscher`, Aliase `/gletscherradar`, `/gletschermonitor`, Steckbrief `/gletscher/<slug>`, Kachel 13, Palette 14, Flag `?gl=1` — **Plan** | SW-Muster `4bdade3` |
| E-GL-2 | alle Gletscher als Atlas mit Messreihen; Satellitenwerte nur A (Schneegrenze, AAR, Albedo) und B (Ausaperung, Albedo-Anomalie); Schmelze für alle, C als Gletschermittel — **Plan**; Klassenzahl gemessen (§2.1): A 227, B 763, C 1 213 + 4 DE | §2.1 |
| E-GL-3 | ~~alles in `buscosun-glacier` (A2)~~ **ersetzt durch Jan (11.10.):** `buscosun-data` unter `glacier/v1/` — `main` für die laufenden Linien, verwaister Zweig `glacier` für die schweren statischen Builds —, Tagesablage in `buscosun-archiv`; die Budgets sind egal und werden bei Bedarf angehoben | §0, §6.1b |
| E-GL-4 | `hzerocl` aus ICON-D2/-EU im neuen Schema; **Zensurregel** `hzerocl ≤ Zellboden + 10 m` ⇒ nicht verwendet (D-GL-6); T600/T500 im Cube bleibt Empfehlung an Jan | §2.7 |
| E-GL-5 | Eichung Sommer/Winter getrennt, gemessener Antrieb der Bergstationen — **Plan**, aber 2025/26-Hold-out ersetzt durch LYO über 2023–2025 (nicht veröffentlicht), Strahlung als Modell (Hindcast ohne Globalstrahlung) | §2.3, §2.8, §3 |
| E-GL-6 | eigenes Tagesarchiv auf `archive`, kein Eingriff ins Punktarchiv — **Plan** | A4 |
| E-GL-7 | kein CAMS, „dunkler als üblich“ aus der Albedo — **Plan** | |
| E-GL-8 | GeoJSON in Stufen statt PMTiles — **Plan**, Größen gemessen (§2.9) | §2.9 |
| E-GL-9 | **AGI 5 jetzt**, GI4 2015 als frühere Epoche (Abweichung: der Plan ging von „bis zur Freigabe GI4“ aus) | §2.1 |
| E-GL-10 | Tokens `--gl-*` im lazy `glacierDeck.css`, Akzent `#1E87A8` — **Plan** | README-gletscher |
| E-GL-11 | Klarhimmel aus Sonnenstand und DEM × Bewölkungsfaktor von buscosun Fusion; ICON-Strahlung nur Vergleich — **Plan**; die Messung (ICON gegen Eigenrechnung gegen SMN-`gr`) folgt in GL-3 und kann ICON 0–120 h freigeben | §2.7 |
| E-GL-12 | `@nivo/line` + SVG, keine neue Abhängigkeit — **Plan** (A11) | |
| E-GL-13 | Merge-Zeitpunkt — **bleibt Jan** | |
| E-GL-14 | **entschieden (Jan 11.10.):** Satellitenwerte bleiben Szenenwerte ohne Anspruch auf die Gleichgewichtslinie; die Regel „höchste Schneegrenze der Saison“ wird als **Nachtrag 2 vorab eingefroren** und an der Saison 2026 geprüft (GLAMOS/UIBK, frühestens Spätherbst 2026) | §3, §6.2 |
| E-GL-15 | **entschieden (Jan 11.10.):** der Schmelzindex bleibt **ohne Einheit** (Ranking und Trend), die Seite sagt, was er ist; eine Eichung mit Einheit lohnt erst mit gemessener Strahlung, näheren Antriebsstationen und Höhenband-Wahrheit — **nach dem Sommer 2027 (Gate E) mit neu eingefrorenem Protokoll** | §6.3 |
| E-GL-16 | Datenablage: `buscosun-data` (`glacier/v1/`, Zweige `main` + `glacier`) und `buscosun-archiv` (`glacier/v1/<Tag>/`) statt eines eigenen Repos — Jan | §0 |
| E-GL-17 | **Schweiz über WGMS und GLIMS** (Jan: „zu GLAMOS würde ich den Umweg hierüber machen“): Längen- und Massenreihen aus dem WGMS FoG (Bezug von wgms.ch, nicht die Copernicus-Fassung), Umrisse und frühere Umrisse aus der GLIMS Glacier Database; die Dateien von glamos.ch gehen nicht mehr in den Datenbaum, sie dienen intern als Wahrheit (B1/C, Nachtrag 2) und als Orakel der Entitätsregel | §6.1b |
| E-GL-18 | RGI 7: entfällt (RGI 6.2 reicht für die Brücke und die vier deutschen Umrisse, kein Konto nötig) — Jan (Empfehlung übernommen) | §9 |
| E-GL-19 | Betrieb: im Daten-Repo bleiben nur die jeweils zwei neuesten statischen Builds (Regel im Publisher, `GLACIER_POLICIES.static`, auf dem Zweig `glacier`); der Build `20261011-1` wurde nie veröffentlicht — Jan (Empfehlung übernommen) | §6.1b |

Zusätzliche Entscheidungen (D-GL): **D-GL-1** Leitgletscher = 42 (§2.4). **D-GL-2** DE-Gletscher aus RGI 6.2 (Umrisse 2003, Bezugsjahr sichtbar) + BAdW-Zitat;
Zugspitz-Ferner optional aus Paul 2020. **D-GL-3** GLAMOS gelb, CC BY 4.0 der DOI-Seiten gilt, separate Pfade. **D-GL-4** Maskenregel ohne SWIR-Rettung.
**D-GL-5** Verarbeitung auf dem 20-m-Raster, B03 aus der Übersicht. **D-GL-6** Zensur von `hzerocl`. **D-GL-7** GloGEM nur Region 11 per Range-Abruf (CRC32).
**D-GL-8** RGI 6.2 vom OGGM-Server (Daten RGI Consortium, CC BY 4.0) als Brücke, nur Region 11 behalten.
Während der Umsetzung dazugekommen (im Auto-Modus, je mit Beleg im Paket): **D-GL-9** Gate B1 rot ⇒ GL-3 läuft parallel weiter, die Satellitenzahlen heißen Szenenwerte (§6.2). **D-GL-10** DN-Versatz je Kachel-Tag
erkannt statt fester Regel (§6.2). **D-GL-11** Albedo außerhalb 0,02–0,98 ⇒ Quarantäne der Szene (§6.2). **D-GL-12** Gate C rot ⇒ Einheit gesperrt, nur der Schmelzindex 0–100 ohne Einheit, kein `mm`-Feld im Dokument (§6.3).
**D-GL-13** Klasse C rechnet mit dem Antrieb des nächsten Gletschers der Klasse A/B derselben Region ≤ 60 km, sonst mit einem eigenen Punkt (§6.3). **D-GL-14** Schneezone des Steckbriefs in 8-ms-Zeitscheiben (§6.4).
Zum GLIMS-/WGMS-Weg (§6.1b): **D-GL-15** ein Schweizer Gletscher wird aus den GLIMS-Teilflächen gebildet — gleicher Name im Abstand ≤ 500 m, namenlos ≤ 20 m (96,4 % der SGI-Gletscher exakt getroffen, am SGI als Orakel gemessen). **D-GL-16** Die Gletscher-Id der Schweiz trägt bei Namensdubletten die GLIMS-Id der größten Teilfläche (`gl_ch_<name>-g006823e46133n`) statt der SGI-Nummer. **D-GL-17** Die fünf Schweizer Teilgebiete sind reine Geografie (Schwerpunkt, Regel in `GLACIER_REGIONS`), weil das Einzugsgebiet (Rhein/Rhone/Po/Inn) ein Attribut der GLAMOS-Dateien ist. **D-GL-18** Heute 0,1-m-Gitter: vereinigte und vereinfachte Umrisse werden auf ein 0,1-m-Gitter gelegt (`shapely.set_precision`), sonst waren 88 der 296 mehrteiligen Gletscher nach der Umrechnung nach lon/lat selbstüberschneidend. **D-GL-19** Der Producer-Ref der Workflows ist `GLACIER_PRODUCER_REF` (Standard `feat/gletscher`) und fällt auf `main` zurück, wenn der Zweig nach dem Merge gelöscht ist.

## 6 Protokoll je Paket

### 6.1 GL-1 — Vertrag, statischer Baum, DACH-Lage (11.10.2026)

> Die Zahlen dieses Abschnitts beschreiben den **ersten** Build `20261011-3` (Schweizer Daten aus den Dateien von glamos.ch, eigenes Daten-Repo). Der veröffentlichte Stand ist der Build `20261012-1` nach Jans Umweg über WGMS und GLIMS — §6.1b.

**Gebaut.**

- `src/glacier/glacierContract.ts`: Pfade (`v1/index.json`, `status.json`, `static/<build>/…`), 25 Regionen, Größenklassen A ≥ 1 km² / B 0,1–1 / C < 0,1, Flächenstempel
  mit Bezugsjahr und Quelle (ohne beide ist ein Katalogeintrag ungültig), Umriss-Stufen L1/L2/L3 mit Flächenregel ±3 %, Reihen, amtliche Einträge mit
  wörtlichem Satz + Quelle + Datum (+ Kriterium bei „verschwunden“), Frische (Satellit 20 Tage, Schmelzlauf 30 h), Einheiten (`mm w. e.`, „cm Eis“ nur mit Dichte),
  Wortsperre (`begehbar`, `sicher`, `frei`).
- Statischer Baum aus `scripts/glacier/py/build_static.py` (78 s): Katalog, Punkte, Umrisse je Region und Stufe + Epochen (SGI1850/1931/1973/2010, GI4 2015),
  Höhenbänder (50 m, Copernicus DEM), Reihen (GLAMOS Länge/Masse, ÖAV Länge, FoG Masse AT/DE, Flächen je Epoche), Projektion (GloGEM, Spanne je Szenario,
  nur GCMs mit positivem 2020-Volumen), `official.json` (9 Einträge, wörtlich), `sources.json`, `report.json`, `index.json`/`status.json`.
  **Bilanz:** CH 1 400 Gletscher / 961,27 km² (amtlich 961), AT 799 / 285,49 km² (285), DE 4 / 0,262 km² (BAdW 0,262); A 227 · B 763 · C 1 213 + 4;
  Leitgletscher 42; Umrisse je Stufe nur 4–5 verworfen (max. Abweichung 1,99 % < 3 %).
- Seite `src/glacier/*` hinter `?gl=1`: Rail, Topbar mit Stand-Chips je Herkunft (Modell · nicht aktiv, Sentinel-2 · nicht aktiv, **Messung · GLAMOS 01.10. · ÖAV 13.03. ·
  BAdW 19.03.** aus den Daten), Dock (Suche, Land, „Karte färben nach“ mit Herkunftsmarke, Rangliste), MapLibre-Karte (Kreise nach Fläche, gestrichelt = kein
  Wert, Umrisse je Zoom), Verlaufsdiagramm (`@nivo/line`), Readout mit drei Länderkarten (Satz der Behörde wörtlich, Datum, Quelle verlinkt), Berichtsliste,
  Berichtsrhythmus; mobil Karte mit Saison- und Satelliten-Chip, Größen-Chips, wischbare Länderkarten. Schmelze und Ausaperung sind sichtbar **gesperrt**
  (kein Platzhalterwert). Der Steckbrief-Knopf bleibt gesperrt bis GL-4. Eintritt wie SW: `FeatureId`, Route (`noindex`), Rail-Eintrag mit Flag-Filter, Kachel 13,
  Palettenpunkt 14, Netlify-Aliase, `generate-seo` mit Flag-Wächter.
- `scripts/glacier/glacier-publish.mjs` (Publisher, nur Teilpfade der eigenen Linie, `index.json`/`status.json` frisch gelesen und gepatcht, nie Force, ≤ 20 MB je Datei /
  ≤ 150 MB je Paket, Archivzweig nur Hinzufügen) und drei Workflow-Vorlagen `workflow-glacier-{static,sat,melt}.yml` mit `PRODUCER_REF`-Wächter und
  gemeinsamer Concurrency-Gruppe `glacier-publish`.

**Verifier (alle ohne Netz bis auf die Basiskarten-Kacheln im UI-Prüfer).**

| Prüfer | Ergebnis | Besonderheit |
| --- | --- | --- |
| `verify:glacier-contract` | **64/64** | an einem echten Auszug des Baums (acht echte Gletscher, drei Stufen), Gegenproben je Regel |
| `verify:glacier-static` | **23/23** (voller Baum), 7/7 (Fixture, CI); mit `--snapshots` 24/24 | Flächen je Land ±2 % gegen amtlich, Geometrie neu gerechnet, Quellenvermerke, Größen |
| `verify:glacier-ui` | **30/30** | Flag-Tor (A1–A4), Layout 62/60/250/400/728 (B1), amtliche Sätze wörtlich + Gegenprobe (C1/C1b), Herkunft an jeder Zahl (C4), Zustand/URL/Neuladen (D1–D7), Kill-Schalter und 404 (E1/E2), Mobil ≥ 44 px (F1–F4), Ehrlichkeit (G1–G5), Konsole (H1) |
| `verify:glacier-publish` | **21/21** | echtes lokales Bare-Remote: Rennen zweier Linien (P3 heilt, P3b Gegenprobe), nie Force (P8: drei überholte Versuche ⇒ rot, nichts überschrieben), Archiv nur Hinzufügen (P9), Kill-Schalter bleibt (P12), Vorlagen-Wächter W1–W7 |
| `verify:routing` | 244/244 (`[GL]`-Selbsttests inbegriffen) | Zählung dieses Zweigs |
| Typecheck / Build / Budget | 0 Fehler / 260/260 / grün nach Anhebung | eagerJs 109,7 → **110,0** (IST 109,9: Eintritt), totalJs 1715 → **1735** (IST 1732,9: GlacierPage 14,1 + Route 2,0 + Flag 0,3 KB gzip, alles lazy); Notiz in `budget.json` |

**Beobachtungen und Korrekturen im Lauf.** Mobil schrumpften die Größen-Chips auf 0 px Höhe (Flex-Kind mit `overflow-x: auto` im Spaltenlayout; behoben mit `flex: 0 0 auto`),
„über 5 %“ brach auf 390 px in zwei Zeilen (jetzt `nowrap`, Beschriftung umbricht darunter), die Diagramm-Umschalter waren mobil 28 px hoch (jetzt 44). Die Vorlage nennt im
Kopf je Quelle das Datum der letzten amtlichen Zahl und mobil Saison- und Satelliten-Chip über der Karte — beides übernommen (ohne Modellwerte).

**Pixelvergleich gegen die Vorlage** (`scripts/glacier/glacier-ui-diff.mjs`, voller Baum, Schwelle |ΔRGB| > 12, Bericht `audit/gletscher/ui/diff-report.json`, Bilder dort):
Desktop gesamt 42,1 % (Rail 9,5 · Topbar 10,7 · Dock 24,6 · Karte 76,4 · Diagramm 16,5 · Readout 43,1), Mobil gesamt 83,8 % (Topbar 23,1 · Karte 89 · Chips 40,5 · darunter 95,1).
Jede Abweichung ist gewollt: die Karte der Vorlage ist ein gemaltes SVG, hier rendert MapLibre mit echter Basiskarte und 2 203 Punkten; die Zahlen der Vorlage sind
größtenteils Beispielwerte (Standardgröße „Verlust Saison“ = Modell, hier „Länge zuletzt“ = gemessen, weil die Schmelze erst mit GL-3 besteht); der Readout zeigt die
amtlichen Sätze statt der Beispielzeilen; mobil liegt der Rest der Seite um die Höhe des Kopfs und der Länderkarten versetzt. Die Aufteilung (Maße, Reihenfolge, Chips,
Zeichensprache) stimmt mit der Vorlage überein.

**Abweichungen vom Plan.** (1) Die statische Linie wird lokal gebaut und im Workflow nur **geprüft** (Wächter): ihre Rohquellen sind von Hand geladen und gegen den Lizenztext gelesen
(D-GL-3), die DEM-Kacheln sind mehrere GB. (2) ~~Der Daten-Repo-Blocker verhindert den ersten Lauf der Workflows~~ — überholt: es gibt kein eigenes Repo mehr (E-GL-16), die Workflows laufen in `buscosun-data` und `buscosun-archiv` (§0). (3) `verify:routing` zählt 244 statt 256, weil dieser Zweig auf `1798fc5` steht (der Stand von `main` mit
den späteren Seewetter-Tests wird beim Merge nachgezogen).

### 6.1b GL-1b — Die Schweiz über WGMS und GLIMS (11.10.2026, Jans Weg)

**Auftrag.** Jan: GLAMOS widerspricht sich bei der Lizenz (DOI-Seiten CC BY 4.0, Impressum „scientific and non-commercial“); die Schweizer Messreihen liegen auch im WGMS (FoG, „offen mit Zitierpflicht, gleichwertig CC BY 4.0“), die Umrisse in der
GLIMS Glacier Database — „dort ist auch kommerzielle Nutzung möglich“ — also den Umweg gehen. Damit entfällt die Antwort von GLAMOS als Voraussetzung.

**Befund 1 — GLIMS führt dieselben Umrisse** (`audit/gletscher/glims-identity.md`, Werkzeug `glims-identity.py`). Die Einreichungen tragen nur Namen wie „University of Zurich“; sie wurden **an der Geometrie** den Inventaren zugeordnet:
SGI2016 = Einreichung 869 (961,4 km², Überdeckung 98,7 %), SGI1931 = 868 (99,0 %), SGI2010 = 596 und 579 (zwei identische Einreichungen, 98,9 %), SGI1973 = 599 (97,0 %, GLIMS führt 25 km² weniger), SGI1850 = 594 + 595 (96,2 %).
Die Restabweichung ist die Datumstransformation ohne Gitter (≈ 1 m) und die Digitalisiergenauigkeit.

**Befund 2 — GLIMS führt Teilflächen, keine Gletscher.** SGI2016 liegt dort als 1 834 Teilflächen der 1 400 SGI-Gletscher; SGI-Nummer, Höhen, Exposition und Einzugsgebiet gehören zu den GLAMOS-Dateien und fehlen. Der Build bildet deshalb
**eigene Gletscher** (`glims_inv.py`, Regel D-GL-15: gleicher Name ≤ 500 m, namenlos ≤ 20 m). Am SGI als Orakel gemessen (`glims-entities.py`, Schwellen-Sweep 5 × 5): 1 396 Gletscher statt 1 400, **96,4 % exakt wie im SGI**, 18 fälschlich zusammengelegt,
14 fälschlich geteilt, Flächensumme bis 0,02 % gleich. Höhen: Copernicus DEM (Minimum, Median aus den 50-m-Bändern, Maximum); die Exposition entfällt (die Seite benutzt sie nirgends). Die Einzugsgebiete (Rhein/Rhone/Po/Inn) ersetzen fünf geografische Teilgebiete
(D-GL-17): West (< 7,55 °E) 195 · Mitte-West (< 8,2 °E) 523 · Mitte-Ost (< 8,75 °E) 283 · Ost 307 · Süd (< 46,45 °N ab 8,35 °E) 88 Gletscher. Gletscher-Ids: Namen wie bisher, Dubletten mit der GLIMS-Id der größten Teilfläche (167 Ids).

**Befund 3 — das WGMS trägt die Schweizer Reihen.** FoG 2026-02-10: 123 Schweizer Gletscher mit Längenänderung (bis 2024), 39 mit Massenbilanz inklusive Gleichgewichtslinie und AAR (bis 2025), 36 mit Höhenband-Bilanzen; die Reihen führen ihren Ursprung
(„GLAMOS 2025 (doi:10.18750/massbalance.2025.r2025)“) im Feld `references`. Verbunden werden sie über die GLIMS-Id, die das FoG nennt (1 147 von 1 984 Schweizer Gletschern), sonst über Lage und Name (≤ 900 m). Gegen die GLAMOS-Fassung: Längenreihen
155 → **120**, Massenreihen 41 → **38**, Flächenreihen 1 320 → 1 311 (die Reihen von Gletschern, die das WGMS nicht führt, fehlen jetzt; drei FoG-Längenreihen — Lischana, Martinets, Paneyrosse — haben keinen Umriss im Inventar 2016 und stehen in `idExceptions`);
Leitgletscher CH unverändert 27 (Massenbilanz 2025), insgesamt 44 mit AT und DE. Die zwei jüngsten Längenjahre (2024/25) fehlen im FoG und damit auf der Seite.

**Gebaut.** `scripts/glacier/py/fetch_glims.py` (öffentlicher WFS, ein Abruf je Satz, nur in den Cache), `glims_inv.py` (Entitäten, Regionen, frühere Umrisse, Schutt), `series.py` (`wgms_tables` für AT/DE/CH, `wgms_length`), `build_static.py`
(GLIMS statt `inv.ch_current`, Höhen aus dem DEM, Verknüpfung über GLIMS-Id, Leitgletscher aus dem FoG, 0,1-m-Gitter für Vereinigung und Vereinfachung), Vertrag (`GLACIER_REGIONS` mit fünf Schweizer Teilgebieten, `inv.glims`), Quellen
(`glims-sgi` und `wgms` ersetzen `sgi2016`, `sgi-hist`, `glamos-series`; die Lizenzzeile nennt „Quellenangabe Pflicht“ statt „Klärung offen“), `audit/gletscher/licences.md`, Prüfer (K2/K4/K6/O3/R2/B3 an den neuen Bau angepasst, ohne eine Schwelle zu lockern).
**Lizenzbefund (offen genannt):** auf der NSIDC-Seite der GLIMS-Datenbank steht „As a condition of using these data, you must cite the use of this data set“ — eine Zitierpflicht, **kein** NC-Hinweis; das wörtliche „CC BY 4.0“ aus Jans Quelle habe ich dort **nicht gefunden**
(die Fundstelle ist ungeprüft). Der Vermerk steht an jeder Quelle in `sources.json`.

**Bilanz Build `20261012-1`.** Bauzeit 3,5–4,5 min, 39,2 MB (größte Dateien `dem/ch-mitte-west.json` 6,2 MB und `outline/ch-mitte-west-L3.json` 4,2 MB, alle < 20 MB). `verify:glacier-static` **25/25** am vollen Baum (Gletscher 2 199: CH 1 396 / 961,42 km² (SGI2016: 1 400 / 961,27), AT 799 / 285,49, DE 4 / 0,262; Klassen CH A 162 · B 506 · C 728), `verify:glacier-contract` 64/64, Typecheck 0.
Dieselben Namen tragen dieselben Ids (1 202 von 1 400 Ids unverändert, der Rest sind die Namensdubletten); die Fläche je Gletscher weicht im Median um 0,33 % ab (P90 1,8 %, 14 Gletscher > 5 %, fast alle < 0,05 km²).

**Neu gerechnet (alle Ids und Regionen sind neu).** Satellit: sieben Fenster (wie im ersten Lauf, jetzt gegen die neuen Ids) — 1 302 Kachel-Tage, 8 476 Werte, **0 fehlgeschlagen**, rund 1 h 10 min, ≈ 15 GB Bereichsabrufe; veröffentlicht je Region und Jahr nur der **neueste** Stand der Saisonreihe (45 Dateien statt 98), `obs/` 1 302 Dokumente, zusammen 3,3 MB. Schmelze: lokal geprüft (2 199 Gletscher in 96 s, 0 übersprungen, Archivdatei = `melt.mjs --archive-out`), **nicht veröffentlicht** — der erste echte Lauf kommt vom Workflow mit dem aktuellen Cube (der lokale Klon ist einen Tag alt). Feed: Woche 2026-W41 mit 385 Ereignissen und der Wochenkarte (24 KB). Der Satelliten-Zeiger nennt 13 statt 14 Kacheln (31TGM trägt kein Gletscher der Klasse A/B mehr).

### 6.2 GL-2 — Satellit und Gate B1 (11.10.2026)

**Gebaut.**

- `src/glacier/glacierSatContract.ts`: Klassenregel (Satellitenzahl nur für Klasse A und B **außerhalb Deutschlands**; Klasse C und die vier deutschen Gletscher
  tragen keine), Höhengitter je Region, Regeln für `obs/`, `season/` und `clima/` (Schneegrenze nur Klasse A, im Katalogbereich ± 300 m, AAR 0…1, Albedo 0,02…0,98,
  Klaranteil ≥ 0,7; Klasse B ohne Schneegrenze und AAR), Marken `neuschnee`/`schatten`/`schutt` als Bitmaske.
- `scripts/glacier/lib/satcore.mjs` (rein, ohne Netz): Maskenregel (SCL 0, 1, 2, 3, 8, 9, 10 ungültig, ≥ 70 % klar, **keine** SWIR-Rettung, D-GL-4), Schneeentscheidung
  NDSI > 0,4 **und** Grün ≥ 0,45 (trennt Schnee/Firn vom Gletschereis, gemessen am Profil des Hintereisferners vom 25.08.2025), Schneegrenze = Höhe mit der geringsten
  Fehlzuordnung mit Spanne, AAR, Albedo (Liang), Zustände `snowline` / `snow-covered` / `snow-free`, Kodierungsprüfung.
- `scripts/glacier/sat-scan.mjs`: Earth-Search-STAC → COG-Fensterlesen auf dem **20-m-Raster** (Übersichtsebene, D-GL-5; ≈ 0,4 statt 1,5 MB je Gletscher und Szene), Kachel-Zuordnung
  nach Rand und `compareItems` (zwei Granule am Tag, S2A/S2B), Quarantäne mit benanntem Grund (Schneegrenze außerhalb, **Albedo außerhalb 0,02–0,98** — neu, siehe unten),
  Saisonreihen je Region und Jahr (`buildSeasonRows`, daraus die Marke `neuschnee`), Patch für `index.json`/`status.json`; `sat-reindex.mjs` baut den Zeiger aus einem
  Baum neu. Vorlage `workflow-glacier-sat.yml`.
- Oberfläche: Kopfzeile „Sentinel-2 · jüngste Szene dd.mm.“ (oder „keine klare Szene seit N Tagen“ ab 20 Tagen), Metrik „Ausaperung“ (Rangliste „% schneefrei“,
  Herkunft Satellit), Kartenzeile je Klasse; ab GL-4 im Steckbrief (Reiter Heute und Saison).

**Befund im Lauf — der DN-Versatz.** Earth Search meldet für Sen2Cor ≥ 04.00 einen Versatz −0,1 (`raster:offset`); die Daten tragen ihn **meist nicht**, einzelne Kachel-Tage aber doch
(+1 000 DN). Eine feste Regel schnitt Eis ab (negative Reflektanz ⇒ NDSI 1 über Eis) oder erfand Schnee. Gelöst je Kachel-Tag: Erkennung am 5. Perzentil des Rots über
Vegetation (SCL 4) auf einer groben Ebene (Schwelle 430), Rückfall mit einem Fenster der SWIR-Dunkelwerte (0,095 / 0,12); jede Entscheidung steht als `encoding` im Dokument.
Eine erste Rückrechnung wurde nach der Methodenänderung **ungeprüft verworfen** (Nachtrag 1, `audit/gletscher/sat-method-frozen-amendment-1.md`, sha256 in `…amendment-1.sha256`).

**Rückrechnung (Gate B1).** *(Gemessen am ersten Build mit den GLAMOS-Dateien; die Satellitenwerte wurden danach gegen den neuen Baum neu gerechnet, §6.1b — das Urteil ändert sich dadurch nicht, die Wahrheit ist GLAMOS-intern und der Gate-Lauf der ursprüngliche.)* Sieben Fenster nacheinander in EINEN Ausgabebaum: Juni–Oktober 2025 und 2026 für alle Klasse-A- und -B-Gletscher, Spätsommer 2023 und 2024 für die
GLAMOS-Gletscher; **1 349 Kachel-Tage, 8 539 Gletscherwerte** (Zustände: Schneegrenze 6 586, schneebedeckt 158, schneefrei 1 795), ≈ 15 GB Bereichsabrufe in rund 1 h 10 min Rechenzeit;
übersprungen: 8 161 „bewölkt (grobe Maske)“, 4 581 „Klaranteil < 70 %“, 2 Quarantänen (Albedo 0,984 am Balfrin, 27.09.2025 — die Ursache ist nicht geklärt, der Fall ist der Anlass der Albedo-Regel); keine fehlgeschlagene Kachel
am Ende. Auswertung `scripts/glacier/b1-evaluate.mjs` gegen `claims-frozen.md` (sha256 `4c309b23…`), Bericht `audit/gletscher/b1/report.json`.

| Kriterium | Ergebnis | Urteil |
| --- | --- | --- |
| B1-1 Endsaison-Schneegrenze gegen die gemessene Gleichgewichtslinie (GLAMOS, 29 Gletscherjahre 2023–2025) | Median \|Δ\| **282 m** (Schwelle ≤ 150), P90 **600 m** (≤ 400), Bias −281 m | **ROT** |
| B1-2 besser als die Klimatologie (TSLA-Mittel 2000–2022), 18 gemeinsame Fälle | eigene Schätzung 261 m, Klimatologie 164 m | **ROT** |
| B1-3 Konsistenz mit TSLA 2025 (169 Gletscher) | Median 111 m (≤ 150), P90 321 m, Bias −80 m | grün |
| B1-4 Vollständigkeit Klasse A, Fenster 20.08.–10.10. | 2025: 223 von 227 (98,2 %), 2026: 219 von 227 (96,5 %), jede Lücke mit Grund (Klaranteil < 70 %) | grün |
| B1-5 keine Unmöglichkeiten | 0 Verstöße in 8 539 Werten | grün |
| B1-6 Maskenregel an Bildern (Hintereisferner, sieben gespeicherte Szenen) | `verify:glacier-sat` 28/28 (Fixture mit Prüfsumme, Gegenproben, Produktionspfad gegen Fixture) | grün |

**Deutung und nachträgliche Auswertung (Information, ändert das Urteil nicht).** Die Schneegrenze der Satellitenszene ist der Zustand am Aufnahmetag; die eingefrorene Endsaison-Statistik
(Median der Szenen 25.08.–10.10. ohne Neuschnee-Marke) wird von Neuschnee-Ereignissen im September nach unten gezogen (Bias −281 m). Dieselben 29 Fälle mit der **höchsten** Schneegrenze der
Saison (15.07.–10.10.): Median \|Δ\| **92 m**, P90 225 m, Bias +14 m (`audit/gletscher/b1/sensitivity.txt`). Außer Stichprobe (`heldout.txt`: 4 österreichische Gletscherjahre aus WGMS/UIBK und
27 weitere Schweizer Gletscherjahre): Median 105 m, Bias −156 m — das Muster trägt, aber das Maß wurde **an diesen Daten gefunden** und ist darum kein bestandenes Gate. Es braucht ein
Amendment 2 mit vorab eingefrorener Regel und neue Daten (GLAMOS/UIBK-Bilanz 2026, ab Frühjahr 2027) — E-GL-14 (§9). Die Empfindlichkeitsrechnung der Grünschwelle (0,40 / 0,50) und
der Neuschnee-Variante ist **nicht** gerechnet: das Gate ist nach dem eingefrorenen Protokoll bereits rot, die Schwelle 0,45 bleibt gesetzt (`literature`-nah, gemessen am Profil).

**Folgen für das Produkt.** Gate B1 blockierte laut Plan GL-3; es wurde **parallel** weitergebaut (Auto-Modus, die Sommerdaten laufen davon), die Folge ist enger gefasst: die Satellitenzahlen sind
Szenenwerte (Schneeanteil, Schneegrenze, AAR, Albedo einer klaren Szene) und stehen so da; die Seite sagt nirgends „Gleichgewichtslinie aus Satellit“; die gemessene Gleichgewichtslinie
(GLAMOS/UIBK) steht neben der Szene, nicht anstelle. Der Zustand des Schmelzmodells nimmt die Szene nur als „Bänder über der Schneegrenze tragen Schnee“ (Nudge, nicht als Bilanzgröße).

### 6.3 GL-3 — Schmelze und Gate C (11.10.2026)

**Methode (eingefroren vor dem ersten Fit).** `audit/gletscher/gate-c-method-frozen.md` (sha256 `fd03be08…`) und Nachtrag 1 (`…amendment-1.md`, sha256 `767aeb6f…`, vor dem ersten gewerteten Lauf):
Enhanced Temperature Index je 50-m-Band (Pellicciotti et al. 2005), Niederschlagsfaktor aus der Winterbilanz (Normalgleichung, die Winterrechnung akkumuliert nur), TF und SRF aus der
Sommerbilanz (Nelder–Mead), Basislinie BL-C = Gradtag mit Standard-Lapse (Eis = 1,6 × Schnee) auf denselben Daten; Antrieb **stündlich gemessen** (SwissMetNet-OGD, GeoSphere für das Ötztal;
Temperatur-/Strahlungsstation und Niederschlagsstation nach Rollenregel), Wahrheit GLAMOS Bs/Bw (Stichtag) 2023–2025, 75 Gletscherjahre; Hold-out leave-year-out (LYO), leave-glacier-out (LGO),
Hintereisferner 2024/25. Nachtrag 1: Grenzen der Basislinie in der richtigen Einheit (mm h⁻¹ K⁻¹), **TF-Obergrenze 0,06 → 0,12** (Literatur 0,01–0,11 h⁻¹ K⁻¹).
Die Rechnung läuft in Node mit **demselben `simulate()`**, das der Lauf benutzt (`lib/meltcore.mjs`); sie stimmt mit der Python-Rechnung auf 1e-12 überein (`verify:glacier-melt` A1:
1e-6 mm an einem echten Gletscherjahr).

| Kriterium | LYO | LGO | Urteil |
| --- | --- | --- | --- |
| C-1 Sommerbilanz-MAE ≤ 0,30 m w. e. | 0,627 | 0,625 | **ROT** |
| C-2 ETI ≤ 0,90 × Basislinie | 0,908 | 0,908 | **ROT** (knapp) |
| C-3 \|Bias\| ≤ 0,15 m w. e. | +0,061 | +0,078 | grün |
| C-4 Hintereisferner 2024/25 \|Fehler\| ≤ 0,40 m w. e. | −0,133 (Basislinie −0,499) | | grün |
| C-5 Winterbilanz-MAE ≤ 0,35 und besser als ohne Faktor | 0,364 (ohne Faktor 0,450) | | **ROT** |

Voll-Fit: pf 1,289, **TF 0,12 (an der Obergrenze)**, SRF 0,00545, DDF 0,165 (`scripts/glacier/melt-calibration.json`, Bericht `audit/gletscher/gate-c-report.json`, 501 Auswertungen / 51 s,
alle Folds 396 s). **Gate C ist rot (C-1, C-2, C-5).** Deutung: TF an der Grenze heißt „mit diesen Daten nicht bestimmt“ — Stunden-Antrieb von Stationen 5–15 km und bis 1 000 m vom Gletscher,
Strahlung als Modell, ein 50-m-Band je Gletscher ohne Bandwerte als Wahrheit; der mittlere Fehler 0,63 m w. e. ist rund 30 % einer Jahres-Sommerbilanz. Gut ist die Richtung (kein Bias,
Hintereisferner −0,13 m statt −0,50 m der Basislinie).

**Folge (Plan §8 „Eich-Gate“).** Die Anzeige mit Einheit bleibt **gesperrt**: das Dokument `melt/<lauf>.json` trägt `gate.unit = false` und **kein Millimeter-Feld** (`mm`, `s7`, `s14` fehlen; der Vertrag
`glacierMeltContract.ts` lehnt sie ohne freigegebene Einheit ab — Gegenprobe im Prüfer). Gezeigt wird der **Schmelzindex 0–100** (100 = 30 mm w. e. Gletschermittel je Tag, *gesetzt*, ein sehr heißer
Sommertag), mit Herkunft „Modell“, Spanne p10–p90 aus 40 Szenarien und dem Satz „keine Einheit, weil die Eichung nicht besteht“. Der Prognose-Hindcast (C-6/C-7: durch die Kette des Gletscher-Jobs, je
Vorlauf-Bin) ist **nicht gerechnet** — er entschiede nur über die Anzeige mit Einheit, die schon am Gate C scheitert.

**Betrieb gebaut.** `scripts/glacier/melt.mjs`: buscosun Fusion (Stufe `fs`, Stand 12) in Node an einem **flachen Punkt in der Medianhöhe** des Gletschers (`terrainOverride`), Antrieb = `t2m` (Mittel, σ), Niederschlag,
Gesamtbewölkung; Strahlung = Klarhimmel (Sonnenstand) × Bewölkungsfaktor auf der horizontalen Fläche, **ohne Gelände-Abschattung** (gesetzt, die Eichung hat sie am Messwert nachgezogen); Nullgradgrenze aus den
Druckflächen des Cube **oder, wo es keine gibt (Gletscher über der 700-hPa-Fläche, ≈ 3 000 m), aus der Temperatur am Gletscher mit dem Standardgradienten** (Feld `zs` sagt es); Bandtemperatur mit dem Gradienten
bis zur Nullgradgrenze verankert (`lapseOf`, 0,0045…0,009 K/m). Klasse C nimmt den Antrieb des nächsten Gletschers der Klasse A/B derselben Region ≤ 60 km (eigene Bänder), sonst einen **eigenen** Punkt (23 Gletscher;
kein Gletscher fällt aus). Summen über 7/14 Tage = **Quantil der Summen von 40 Szenarien** (AR(1)-Rauschen ρ 0,9, gesetzt), nie eine Summe von Quantilen. Zustand `melt/state.json` (Schneewasser und Albedo je Band, nach
6 h Lauf gespeichert, ≤ 30 h alt, sonst Kaltstart — benannt), **Satelliten-Nudge** (Szene ≤ 20 Tage: Bänder über der Schneegrenze 250 mm Schnee, darunter leer; Klasse B über die gleichwertige Linie des Schneeanteils;
579 von 2 203 Gletschern am 11.10.). Wiederholungsschutz (nur bei neuem Lauf t2/t3, höchstens 4 am Tag, `repeatVerdict`-Muster), Läufe der letzten 72 h bleiben, Zeilen der 42 Leitgletscher gehen als eigene Datei
auf `archive`. Ein Lauf ohne `public/climaGrid.json` bricht **rot** ab (V-SW-18). Messung am echten Cube (`C:\dev\buscosun-data`, Lauf t1 10.10. 03 UTC): **2 203 Gletscher in 62–93 s**, 1 014 eigene Fusion-Punkte,
Dokument 726 KB, Zustand 193 KB. Vorlage `workflow-glacier-melt.yml` (Patch-Ordner, Archivschritt).

**Prüfer.** `verify:glacier-melt` **41/41** (in CI): ETI gegen die unabhängige Rechnung auf 1e-6 mm (Winterbilanz, Sommerbilanz, Basislinie am Rhonegletscher 2024), Handrechnung einer Stunde, Schwelle, Schnee/Regen,
Gradient und Säulenverankerung, Antrieb aus der Fusion-Antwort (Lücken), Zustand und Nudge, Szenariosummen **neu nachgerechnet** und die „Summe der Tagesquantile < Quantil der Summe“-Gegenprobe, Einheit gesperrt/freigegeben
mit Negativkontrolle, Wiederholungsschutz, `main` Ende zu Ende mit Fusion-Attrappe (Zustand übernommen, Aufbewahrung 72 h, Klimatologie fehlt ⇒ Fehler), Diff der geschützten Pfade leer.

### 6.4 GL-4 — Steckbrief (11.10.2026)

**Gebaut** (lazy Chunk `GlacierBrief`, Seite `/gletscher/<slug>` mit `?tab=`, `t`, `v`, `e`, `o`): `glacierSheetModel.ts` (reine Logik: Reihen, Albedo-Anomalie, TSLA-Band gegen die Schneegrenze, Projektion als Spanne,
Schmelzansicht mit Frische, Tour-Zeilen, Quellenliste, CSV), `glacierSheetData.ts` (parallele, voneinander unabhängige Ladevorgänge; fehlende Pflichtteile werden benannt), `glacierGeo.ts` (Schnitt am Längengrad,
Schneezone aus dem Höhengitter — **in 8-ms-Zeitscheiben** (`renderSnowZoneAsync`, Ergebnis Byte für Byte gleich dem am Stück; Aletsch brauchte 208 ms in einem Block, Gornergletscher 119, Fiescher 89, Hintereisferner 15 — auf dem Handy eine Long Task), `GlacierSheetMap.tsx` (MapLibre: Umriss, früherer Umriss gestrichelt, Schneezone als Bild — Schnee weiß über der Schneegrenze, Eis blau darunter —, Vergleichsregler, 3D mit Terrarium-Gelände
`setTerrain` ×1,3, Blick 62°/−20°, kein Shader), `GlacierCharts.tsx` (`@nivo/line` mit eigenen Ebenen für Bänder, Balken als SVG — kein `@nivo/bar`), `GlacierSheetTabs.tsx` (fünf Reiter), `GlacierBrief.tsx` (Layout
Steckbrief 250 · Karte · Reiter 420, mobil Karte, Chips, Reiter, Spalte). Die Klasse C bekommt keine Satellitenzahl (Text), die vier deutschen auch nicht („es gelten die Zahlen der BAdW“).

- **Heute:** Schmelzindex (Zahl 0–100, Spanne, Satz „keine Einheit“), Nullgradgrenze, Fläche ohne Schneedecke, Nächte über 0 °C an der Zunge, 14-Tage-Balken, Satellitenkarte; ohne frischen Lauf „Keine Daten“ mit dem Grund.
- **Saison:** Schneegrenze je klarer Szene gegen das Band 2000–2025 (TSLA, p10–p90, Median), höchste Schneegrenze, AAR, **Albedo-Anomalie nur mit ≥ 3 Szenen und ≥ 2 früheren Jahren** (sonst „zu wenige frühere Szenen“), Bilanz (gemessen),
  Neuschnee-Szenen mit eigenem Zeichen; Zeitpunkt = heute oder eine der letzten klaren Szenen (Karte, Schneezone).
- **Langzeit:** Vergleichsregler früherer Umriss ↔ heute (Pfeiltasten, role=slider), Längenreihe kumuliert, Flächenänderung mit beiden Jahren, amtlicher Status mit dem **Kriterium der Behörde**, Projektion je Szenario als Spanne
  („Unter 10 % des Volumens von 2020: 2051–2075, je nach Szenario und Klimamodell — nie ein einzelnes Jahr“), CSV und Bild.
- **Tour:** Vorbehalt „Kein Urteil über Begehbarkeit …“, Nullgradgrenze 14 Tage gegen die Höhe des Gletschers, Nächte ohne Frost, Eisanteil des Modells, Zustand per Satellit, Links; ein Prüfer sucht „begehbar“, „sicher“, „frei“.
- **Quellen:** Tabelle „Jede Zahl mit Herkunft und Stand“ (nur Zahlen, die wirklich gezeigt werden), Lizenzen, „nur verlinkt“ / „nicht genutzt“.

**Pixelvergleich gegen die Vorlage** (`glacier-ui-diff.mjs --sheet=1`, `reference/gletscher-*-steckbrief.dc.html`, Schwelle \|ΔRGB\| > 12, Bilder `audit/gletscher/ui/*sheet*`): Desktop gesamt 49,0 % (Rail 9,4 · Topbar 20,1 ·
Steckbrief 22,5 · Karte 73,3 · Reiter 36,8), Mobil gesamt 70,2 % (Topbar 29,2 · Karte 92,9 · darunter 58,1). Die Karten der Vorlagen sind gemalte SVG-Bilder, hier rendert MapLibre mit echter Basiskarte und dem Umriss; die
Zahlen der Vorlagen sind Beispielwerte. **Abweichungen, jede gewollt:** (1) die **Höhenband-Tabelle** (Firn/GWL/Mitte/Zunge mit T 14 Uhr) fehlt — der Lauf trägt nur Gletschermittel, Bandwerte sind Stufe 2; (2) „nächste Messstation mit
Messwert“, „Neuschnee seit … cm“, „Gletscherschwundtag“ und die Saisonbilanz-Schätzung des Modells fehlen — nicht berechnet, die Seite sagt es statt einer Zahl; (3) der Schalter „Beispiel Hitzewelle“ der Vorlage ist durch die
Zeitpunkte „heute | Szene dd.mm.“ ersetzt; (4) „Vorher – nachher“ mit Sentinel-2-Bildern ist nicht gebaut — der Regler vergleicht Umrisse; (5) die Schneegrenze ist als **Fläche auf dem Höhengitter** gezeichnet (kein Linienzug);
(6) das Nullgrad-Diagramm zeigt das Tagesmaximum der nächsten 14 Tage, nicht 48 Stunden stündlich (das Dokument trägt Tagesmaxima).

**Prüfer.** `verify:glacier-sheet` **45/45** (in CI; echte Reihen, Szenen und Schmelzzeilen von vier Gletschern, Schneezone gegen die Höhenbandfläche auf 5 Punkte, Albedo-Anomalie mit vier Gegenproben, CSV mit Maskierung,
Folgen-Liste mit blockiertem Speicher); `verify:glacier-ui` **62/62** (Browser, nicht in CI; Reiter-ARIA, Layout, Zustände, 3D-Schalter und `?gl3d=0`, Mobil ≥ 44 px, Quellentabelle, Tour-Wörter).

### 6.5 GL-5 — Updates (11.10.2026)

**Gebaut.**

- **Feed** `scripts/glacier/feed.mjs` + `glacierFeedContract.ts`: Ereignisse mit **stabiler Kennung** (`ev_<Typ>_<Gletscher>_<Datum>`), Herkunft je Typ gesperrt (Schneegrenze und Neuschnee = Satellit, Hitzetag = Modell, Meldung und Status = amtlich),
  ein Dokument je ISO-Woche (`feed/<Jahr>-W<Woche>.json`, letzte 12 Wochen), Zeiger `index.feed` mit der Liste der Wochen. Typen: Schneegrenzen-Sprung ≥ 100 m gegen die vorige Szene (Klasse A, ohne Neuschnee-Marke), Neuschnee-Szene, **Hitzetag nach Modell**
  (Nullgradgrenze über der Medianhöhe und Index p50 ≥ 60, höchstens 5 je Lauf, Text mit Index „ohne Einheit“), kuratierte amtliche Meldung **wörtlich** (Satz gleich dem in `official.json`) mit Link, Statusverlust **nur mit dem Kriterium
  der Behörde**. Der Vertrag lehnt ab: veränderten Satz, falsche Herkunft, doppelte Kennung, Tourwort, Schmelze mit Einheit, Zitat an einem Satellitenereignis, vier Spitzenereignisse. Vorlage `workflow-glacier-feed.yml`.
- **Wochenkarte** `weekly-card.mjs`: 1200 × 630 PNG der drei wichtigsten Ereignisse (eine Art je Zeile zuerst, nie zwei zum selben Gletscher) über das headless Chrome, das das Repo ohnehin für seine Karten nutzt (`OG_CHROME`), keine neue Abhängigkeit;
  der Montags-Schritt der Vorlage rendert die Karte der Vorwoche aus dem Feed-Stand des Sonntags; Zeiger `index.feed.card`; die Seite verlinkt „Wochenkarte KW 41 / 2026 (Bild, teilbar)“. Die Schrift fällt auf dem Runner auf die Systemschrift zurück.
- **Rangliste:** „Schmelzindex heute“ ist eine Karten-Metrik der Lage, sobald ein **frischer** Lauf (≤ 30 h) vorliegt (Herkunft Modell, „n von 100“, Legende „ohne Einheit“; Rangliste ab 0,1 km², weil die kleinsten Gletscher an der Kappe 100 gleichziehen);
  jede Rangliste hat genau eine Herkunft. „Verschwunden“ steht nur in der Liste der amtlichen Statusmeldungen mit Kriterium.
- **Folgen:** Stern in Pille und Steckbrief, `gl.favs` lokal (nur Kennungen, ≤ 50, Speicher in `try/catch`), Liste „Meine Gletscher“, **„Neu seit deinem letzten Besuch“** (Ereignisse nach dem Tag des letzten Besuchs, die zu gefolgten Gletschern gehören oder amtlich sind; ohne
  Besuch nichts).
- **Download:** CSV der Reihen eines Gletschers (Längenänderung, Bilanz mit Winter/Sommer/Jahr/Gleichgewichtslinie/AAR, Flächen mit Bezugsjahr; je Zeile Herkunft, Einheit, Quelle; Kommentarkopf mit Abrufdatum) und das Längendiagramm als Bild (`imageExport.ts`).

**Nicht gebaut (und warum).** „Größter Saisonverlust (Modell)“ als Rangliste — es gibt keine Saisonbilanz des Modells (Gate C rot). „Neuschnee auf Eis“ als Ereignis nur als Neuschnee-Szene (die Szene kennt keine Eisdecke darunter).

**Prüfer.** `verify:glacier-feed` **22/22** (in CI; echte amtliche Einträge, Szenenzeilen, Schmelzzeilen; ISO-Wochen, Ereignisse mit unabhängig nachgerechneter Erwartung, Gegenproben des Vertrags, Aufbewahrung, Karten-HTML maskiert, gerendertes PNG 1200 × 630),
`verify:glacier-sheet` (CSV, Folgen), `verify:glacier-ui` Block L (Rangliste, Feed, Folgen, „Neu seit …“ nach dem Neuladen, CSV-Inhalt aus dem Blob, Kopfzeilen-Stern).

**Beobachtungen und Fallen dieser Session.**

- Ein Teil der Karten-Läufe zeigt in der Headless-Umgebung zeitweise eine **leere Basiskarte** (Stil nicht geladen); Umriss und Zahlen hängen daran nicht, die Seite bleibt benutzbar; Prüfer mit eigenem Browser sind davon nicht betroffen.
- MapLibre meldet auf der Seite **3 Warnungen** „Expected value to be of type number, but found null“ — sie kommen auch mit einer Karte ohne jede Ebene dieser Linie (Basiskarten-Stil bei Zoom ≥ 13, bisektiert), nicht aus dem Gletscher-Code.
- Die Playwright-MCP legt relative Dateipfade im **Haupt-Arbeitsbaum** ab (nicht im Worktree) — absolute Pfade unter `.wt-gl` benutzen.
- Bash-Heredocs verlieren Rückschrägstriche in Regex und Vorlagen — Skripte mit Regex per Write-Werkzeug schreiben; zwei Fehler dieser Art (`/^\d{4}$/`) sind im Lauf aufgefallen und behoben.
- Geteilte, im Speicher gehaltene Ladevorgänge dürfen nicht am Abbruch-Signal des ersten Aufrufers hängen (der zweite Aufrufer eines Effekts bekam sonst nie eine Antwort) — behoben in `glacierClient.ts`.
- Der Archiv-Lauf des Publishers ließ den Klon auf dem verwaisten Zweig `archive` stehen (dort fehlt `v1/`) — behoben, Prüfung P9b.

## 7 Commits

| Repo | Commit | Inhalt |
| --- | --- | --- |
| `buscosun-web` `feat/gletscher` | `2d92087` | Planungsunterlagen |
| | `1a7e41c` | GL-0 Spike, Kriterien eingefroren |
| | `7d1f818` · `18985cc` · `9700adc` | GL-1: Vertrag, statischer Baum, Prüfer · Seite hinter `?gl=1` · Publisher, Vorlagen, CI |
| | `2b70ea5` · `6c78a75` · `75e049e` | GL-2: Sentinel-2-Scan · DN-Versatz je Kachel-Tag, Metrik „Ausaperung“, B1-Werkzeuge · Rückfall-Fenster, TSLA-Klimatologie |
| | `6b2288e` · `40aff29` | GL-3: Methode Gate C eingefroren · Nachtrag 1, Eichung in Node |
| | `48a398b` | GL-3: Gate C (rot), Schmelzlauf, Schmelzvertrag, Prüfer |
| | `0fa4da9` | GL-4: Steckbrief (fünf Reiter, Schneezone, Vergleichsregler, 3D) |
| | `efb33f7` · `d05932c` | GL-5: Feed, Schmelzindex-Metrik, Folgen, Wochenkarte, CSV · Folgearbeiten |
| | `af2b45e` · `0ec8b1c` · `6c0d063` | Schneezone in Zeitscheiben · Audit der Phase · Hashzeile |
| | `27a84f5` | **Daten in `buscosun-data` (Zweig `glacier` + `main`) und `buscosun-archiv`; Schweiz aus GLIMS und WGMS FoG** (Vertrag, Client, Publisher, fünf Workflow-Vorlagen + Generator, `glacier-archive.mjs`, `glims_inv.py`, `fetch_glims.py`, Prüfer, Fixtures, README der Daten-Repos) |
| | `a1a9d6c` | Nachtrag 2 zu Gate B1 eingefroren (E-GL-14) |
| | `25d8f2b` | Beleg GLIMS = SGI (`glims-identity.md`), Entitätsregel, Lizenzregister |
| | `ec00228` | Publisher: Waisenzweig per Plumbing (`checkout --orphan` ließ im sparse Klon fremde Verzeichnisse im ersten Commit) |
| | `dd626ff` | Die Seite nennt das WGMS als Quelle der gemessenen Reihen (Schweiz: Meldungen des Messnetzes) |
| | `c3e37d1` | Schmelz-Workflow installiert `bz2` und `jsfive`, jede `tee`-Pipe unter `pipefail` (V-GL-24); `verify:glacier-publish` 34/34 |
| | (Audit) | Audit dieser Änderung (dieser Text; ein Nachtragscommit trägt nur diese Hashzeile) |
| `buscosun-data` Zweig `glacier` (verwaist) | `660788f` | Build `20261012-1`: 229 Dateien unter `glacier/v1/static/` |
| `buscosun-data` `main` | `3c2ca56` | Zeiger (`glacier/v1/index.json`, `status.json`) auf den Build |
| | `c75f0ec` | Satellit: 1 302 Kachel-Tage 2023–2026 (`obs/`), neueste Saisonreihe je Region und Jahr (`season/`), Zeiger |
| | `c330553` | Feed 2026-W41 (385 Ereignisse) mit Wochenkarte, Zeiger |
| | `4da589b` | README (sieben Produktlinien, Abschnitt Gletscher, Quellen) und vier Workflows `glacier-static|sat|melt|feed.yml` |
| | `affc548` | **erster planmäßiger Lauf auf GitHub** (`glacier-sat.yml` #1, 22:48 UTC): fünf neue Kachel-Tage, Saisonstände, Zeiger |
| | `2a43783` | Workflows mit `bz2`/`jsfive` und `pipefail` (V-GL-24) |
| | `2c0b640` · `c266b79` | temporäre Testplätze für Schmelze und Feed — von GitHub nicht ausgeführt — und ihre Entfernung |
| `buscosun-archiv` `main` | `2d42302` · `74e0e02` | Workflow `glacier-archiv.yml` und `glacier/v1/README.md` · Workflow unter `pipefail` |

Der erste Anlauf (eigenes Repo, lokaler Bare-Remote `C:\dev\buscosun-glacier-cache\glacier-remote.git`, Build `20261011-3`, 11 Commits) wurde **nie veröffentlicht**; seine Dateien liegen nur lokal (`C:\dev\buscosun-glacier`) und sind überholt.

## 8 Gates

| Gate | Stand |
| --- | --- |
| A | entschieden (§5), Kriterien eingefroren (§3 und je Linie) |
| GL-1 (Vertrag, Atlas, DACH-Lage) | grün: §6.1 (ohne Real-Device) |
| **B1 Satellit plausibel** | **ROT nach dem eingefrorenen Protokoll** (B1-1, B1-2; B1-3 bis B1-6 grün): §6.2. Die Satellitenzahlen sind Szenenwerte; keine Aussage „Gleichgewichtslinie aus Satellit“. Hypothese (höchste Schneegrenze der Saison) = E-GL-14 |
| B2 Winterbetrieb | **läuft** seit dem 11.10.2026: `glacier-sat.yml` zweimal täglich in `buscosun-data` — 14 Tage ohne roten Lauf, Beobachtung nach der Session (§9.3); blockiert nichts |
| **C Eichung** | **ROT** (C-1, C-2, C-5; C-3, C-4 grün): §6.3. Einheit gesperrt, nur der Schmelzindex ohne Einheit |
| GL-4 (Steckbrief) | grün: §6.4 (ohne Real-Device) |
| GL-5 (Updates) | grün: §6.5 (ohne Real-Device) |
| D Merge und live | **Vorbereitung abgeschlossen (§8.1), Entscheidung Jans:** Real-Device, Edge-Bündel, Merge-Pfad, `GLACIER_LIVE` |
| E Sommer 2027 | Jan |

### 8.1 Gate D — Vorbereitung

**Prüfer** (Stand dieses Zweigs, Arbeitsbaum sauber):

| Prüfer | Ergebnis | in CI |
| --- | --- | --- |
| `verify:glacier-contract` | 64/64 | ja |
| `verify:glacier-static` | 7/7 Fixture; **25/25 am vollen Baum** `20261012-1` (mit `--dir=`) | ja (Fixture) |
| `verify:glacier-publish` | **32/32** (Rennen, Nie-Force, **Zeiger nach dem Build** P14, Archiv-Repo mit eigenem Index P9, sparse Klon wie auf dem Runner P13/**P15 Waisenzweig**, fünf Vorlagen W1–W9, Archiv-Skript A1) | ja |
| `verify:glacier-sat` | 28/28 | ja |
| `verify:glacier-melt` | 41/41 | ja |
| `verify:glacier-sheet` | 45/45 | ja |
| `verify:glacier-feed` | 22/22 (mit gerenderter Karte, wo ein Browser da ist) | ja |
| `verify:glacier-ui` | 62/62 (Browser) | nein (braucht Chrome) |
| `verify:routing` | 260/260 | |
| `verify:seo` | 803 Prüfungen, 0 Fehler | |
| `verify:share` | **527/528** — `[SH6]` das Edge-Bündel passt nicht mehr zur Quelle: die neue Route `/gletscher` ist in `routes.ts`; **Jan führt `npm run edge:share` beim Merge aus** (E-GL-13, kein Eingriff in Edge Functions durch diese Session) | |
| Typecheck / Build / Budget | 0 Fehler / 260/260 / grün — eagerJs 109,9 (Grenze 110), largestChunk 278,4, **totalJs 1 759,6 (Grenze 1 770)** (die Anhebungen mit Notiz in `budget.json` stammen aus dem ersten Lauf; diese Änderung bringt +0,6 KB lazy) | |
| `verify:point-data` (liest das README des Daten-Repos) | 1016/1016 | ja |

Geschützte Pfade: `git diff --stat origin/main...HEAD -- src/pointForecast src/point scripts/point scripts/punktarchiv` ist **leer**; **`buscosun-data` und `buscosun-archiv` wurden auf Jans Freigabe vom 11.10. beschrieben — nur unter `glacier/` und mit je einer Workflow-Datei und dem README** (kein Eingriff in `point/`, `radar/`, `obs/`, `road/`, `sea/`, `precipsum/` und deren Workflows); keine Edge Functions, Shader, Custom Layer,
Brandradar-Dateien, `CLAUDE.md`, `MANUELLE-SCHRITTE.md`; keine neue Abhängigkeit (`@nivo/line` und MapLibre im Bundle); `GLACIER_LIVE` bleibt `false` (Seite hinter `?gl=1`, `noindex`, nicht in der Sitemap).

**Pixelvergleich** (`glacier-ui-diff.mjs`, Bilder `audit/gletscher/ui/`; **nicht neu gemessen** — Layout und Vorlagen sind unverändert, nur Region und Quellenzeilen sind neu): Lage Desktop 43,5 % (Rail 9,5 · Topbar 11,5 · Dock 32,5 · Karte 76,4 · Diagramm 16,5 · Readout 43,1), Lage Mobil 83,7 %, Steckbrief Desktop 49,0 %, Steckbrief Mobil 70,2 % —
die Unterschiede sind die Kartenfläche (gemaltes SVG gegen echte Karte), Beispielzahlen der Vorlagen und die in §6.4 benannten Abweichungen. **Gate D verlangt „Pixelvergleich bestanden“:** das Maß ist ein Befund, kein Schwellenwert — Jan entscheidet
(§9.5), ob die benannten Abweichungen genügen.

**Die fünf Fragen aus CLAUDE.md.**

1. *Funktionserhalt einzeln:* nichts entfernt oder versteckt; die gemeinsamen Dateien (`App.tsx`, `featureRail.tsx`, `SearchPage.tsx/.css`, `router/routes.ts`, `router/router.tsx`, `netlify.toml`, `generate-seo.mjs`, `package.json`, `budget.json`, `.gitignore`, `ci.yml`) sind nur ergänzt;
   Beleg: Routing 260/260, SEO 803 ohne Fehler, Build 260/260, kein Brandradar-File berührt (`git diff --name-only`).
2. *Desktop pixelgleich:* die neue Seite steht hinter dem Flag; ohne `?gl=1` gibt es weder Kachel noch Rail-Eintrag (A1–A3: Zähler „12 Werkzeuge“, Pfad antwortet wie ein unbekannter). Ein Pixelvergleich der **bestehenden** Seiten wurde **nicht** gefahren —
   kein gemeinsamer Render-Code ist berührt; Jan sieht beim Real-Device-Gang die Startseite mit und ohne Flag.
3. *Touch-Ziele ≥ 44 px:* mobil gemessen (F1/F2, T13: Reiter 48, Chips 44, Zeitpunkt 44, Zurück 44, Links 44).
4. *Konsole sauber:* keine unbehandelte Ausnahme (H1 in allen Läufen); die Seite fragt keine nicht vorhandene Datei mehr an (Zeiger nennt die Wochen); **3 MapLibre-Warnungen** „Expected value to be of type number, but found null“ stammen vom Basiskarten-Stil (bisektiert, §6.5).
5. *Keine Long Tasks > 200 ms:* in headless-shell nicht messbar (bekannt) — **Real-Device**. Gebaut dagegen: Schneezone in 8-ms-Scheiben (Aletsch 208 ms am Stück gemessen), Vergleichsregler per `requestAnimationFrame`,
   Karten-Daten außerhalb des Hauptpfads geladen; offen bleibt der Parse der Höhengitter (`dem/<region>.json` 0,1–6,4 MB) — auf dem Handy zu messen.

**Die fünf Gletscher-Prüffragen.**

1. *Herkunftszeichen an jeder Zahl, Bezugsjahr an jeder Fläche:* ja — `data-origin` an jeder Zahl (T3, C4: 0 Zahlen ohne Marke), Bezugsjahr an jeder Fläche im Steckbrief, in der Karte und im Dock (D5, G5).
2. *Modellzahl als Messung oder amtlich lesbar?* nein — Rangliste „Schmelzindex“ trägt die Marke Modell und „von 100“, Feld `origin` je Ereignis gesperrt (B4), Hitzetag-Text sagt „nach Modell“ und „ohne Einheit“; jede Rangliste hat genau eine Herkunft.
3. *Ohne bestandene Eichung:* Index ohne Einheit mit Hinweis und Spanne; kein mm-Feld im Dokument (E1/E2, T2, L1b).
4. *Tour-Reiter „begehbar“, „sicher“, „frei“?* nein; Vorbehalt und Links stehen da; der Prüfer sucht über Reiter, Feed, Karte (T6, G1, B3).
5. *Blaueisgletscher im Reiter Saison:* keine Satellitenzahl, „es gelten die Zahlen der BAdW“ mit Datum und Quelle (G-Block; T9, T8 für Klasse C; die vier deutschen Gletscher haben nur Index und Inventar).

## 9 Jans Schritte

Entschieden am 11.10.2026 (Jan, „setze den Rest auch so um“): Repo-Frage (§5 E-GL-3/16), Schweiz über WGMS und GLIMS (E-GL-17), E-GL-14 (Nachtrag 2 eingefroren), E-GL-15 (Index ohne Einheit bleibt, Eichung nach dem Sommer 2027),
RGI 7 entfällt, Aufbewahrung zwei Builds. Das Anlegen eines GitHub-Repos entfällt; die Daten und Workflows liegen in `buscosun-data` und `buscosun-archiv` (eingespielt, §0). **Was bleibt bei Jan:**

1. **Gate D — Real-Device** auf dem Handy mit dem Aletschgletscher (Scrollen, 3D, Vergleichsregler, Karte mit Schneezone) und danach die Startseite **mit und ohne `?gl=1`**. Die Pixelabweichungen gegen die Vorlagen (§8.1) sind
   die gemalten Karten der Vorlagen gegen echte Karten — Empfehlung: akzeptieren.
2. **Merge** von `feat/gletscher` nach `main` zuerst mit `GLACIER_LIVE=false`, danach `npm run edge:share` (E-GL-13; bis dahin ist `[SH6]` in `verify:share` das benannte rote Ergebnis), danach **das Umschalten als eigener Commit** nach dem Real-Device-Test (wie bei Seewetter).
   Die Workflows brauchen dafür nichts: der Producer-Ref fällt auf `main` zurück, sobald der Zweig `feat/gletscher` gelöscht ist; wer ihn behält, setzt unter Settings → Variables `GLACIER_PRODUCER_REF=main`.
3. **Beobachten (Gate B2):** `glacier-sat.yml` zweimal täglich (16:43/22:43 UTC), `glacier-melt.yml` 3-stündlich, `glacier-feed.yml` täglich, `glacier-archiv.yml` (in `buscosun-archiv`) alle 6 h, `glacier-static.yml` montags — 14 Tage ohne roten Lauf (die Actions-Seite genügt; einen eigenen Wächter-Eintrag gibt es für diese Linie nicht).
   Rot heißt: den Lauf öffnen, der Grund steht im Schritt (der Producer endet nie still).
4. **GLIMS-Lizenzwortlaut:** die NSIDC-Seite nennt nur die Zitierpflicht; wer das „CC BY 4.0“ aus der ECMWF-Quelle belegen will, sucht die Fundstelle (V-GL-20). Die Mail an GLAMOS (früher Schritt 6) entfällt.
5. **Nachtrag 2 auswerten**, sobald GLAMOS und die Universität Innsbruck die Gleichgewichtslinien 2026 veröffentlichen (frühestens Spätherbst 2026): eine Session, die Wahrheit erst nach der Auswertung der Satellitenseite öffnet (§3).

## 10 Befunde und Verbesserungen (V-GL)

| Nr. | Befund / Mehrwert | Skizze |
| --- | --- | --- |
| V-GL-1 | Die Wochenkarte fällt auf dem Runner auf die Systemschrift zurück (League Spartan ist dort nicht installiert). | Schrift als Datei neben `weekly-card.mjs` ablegen und per `@font-face` einbinden — oder Systemschrift als gewollt benennen. |
| V-GL-2 | Der Archiv-Lauf des Publishers ließ den Klon auf dem verwaisten Zweig `archive` stehen — **behoben**, Prüfung P9b. | — |
| V-GL-3 | Albedo 0,984 am Balfrin (27.09.2025) — die Ursache ist nicht geklärt; die Regel „Albedo außerhalb 0,02–0,98 ⇒ Quarantäne“ fängt den Fall. | An der Szene nachsehen (Schatten/Wolkenrand/Maskenfehler?), dann Regel begründen oder verschärfen. |
| V-GL-4 | Gate B1 rot; die Hypothese „höchste Schneegrenze der Saison trifft die Gleichgewichtslinie“ wurde an denselben Daten gefunden (§6.2). | E-GL-14: Amendment 2 vorab einfrieren, GLAMOS/UIBK 2026 abwarten. |
| V-GL-5 | Gate C rot; TF an der Obergrenze 0,12, Antrieb 5–15 km und bis 1 000 m vom Gletscher, Strahlung nur Modell, ein 50-m-Band je Gletscher ohne Bandwerte als Wahrheit (§6.3). | E-GL-15: Antrieb näher am Gletscher, gemessene Strahlung, Bandwerte aus GLAMOS, dann neu eingefrorenes Protokoll. |
| V-GL-6 | Der Prognose-Hindcast (C-6/C-7) ist nicht gerechnet — er entschiede nur über die Anzeige mit Einheit. | Erst nach bestandenem C-1 … C-5. |
| V-GL-7 | Steckbrief ohne Höhenband-Tabelle, nächste Messstation, Neuschnee in cm, Gletscherschwundtag und Saisonbilanz-Schätzung des Modells; „Vorher – nachher“ mit Sentinel-2-Bildern nicht gebaut; Nullgrad-Diagramm als Tagesmaximum statt stündlich (§6.4). | Stufe 2 (GL-6); Bandwerte braucht der Lauf. |
| V-GL-8 | Long Tasks > 200 ms sind in headless-shell nicht messbar; gebaut: Schneezone in 8-ms-Scheiben. Offen: der Parse der Höhengitter (`dem/<region>.json` 0,1–6,4 MB) auf dem Handy. | Real-Device (§9.5); bei Bedarf Parse in einen Worker. |
| V-GL-9 | MapLibre meldet auf der Seite 3 Warnungen („Expected value to be of type number, but found null“) — sie kommen auch ohne jede Ebene dieser Linie (Basiskarten-Stil, bisektiert); zeitweise bleibt die Basiskarte in Headless leer. | Basiskarten-Stil prüfen (nicht diese Phase). |
| V-GL-10 | GLAMOS: CC BY 4.0 der DOI-Seiten gegen „scientific and non-commercial use“ im Impressum (`audit/gletscher/licences.md`). | **Umgangen (E-GL-17):** Reihen aus dem WGMS, Umrisse aus GLIMS; die GLAMOS-Dateien sind nicht mehr im Datenbaum. Rest: V-GL-20. |
| V-GL-11 | Der Pixelvergleich gegen die Vorlagen (Lage Desktop 43,5 %, Mobil 83,7 %, Steckbrief 49,0 % / 70,2 %) ist ein Befund, kein Schwellenwert: die Karten der Vorlagen sind gemalt, die Zahlen Beispielwerte (§8.1). | Jans Entscheidung (§9.5). |
| V-GL-12 | `verify:share` zählt 527/528: das Edge-Bündel kennt die neue Route nicht (`[SH6]`). | `npm run edge:share` beim Merge (E-GL-13). |
| V-GL-13 | `v1/static/` wächst mit jedem Build (24,6 und 38,3 MB). | **Erledigt (E-GL-19):** der Publisher hält auf dem Zweig `glacier` nur die zwei neuesten Builds (`GLACIER_POLICIES.static`, Prüfer P4); der erste Build wurde nie veröffentlicht. |
| V-GL-14 | Der Arbeitsklon `C:\devuscosun-glacier` war flach (der Publisher holt `--depth 1`); ein Push von dort auf ein leeres GitHub-Repo kann scheitern. | **Entfallen:** es gibt kein eigenes Repo mehr; die Arbeitsklone von `buscosun-data` und `buscosun-archiv` sind flach und sparse (`glacier`), der Publisher arbeitet darin (Prüfer P13). |
| V-GL-15 | Die Playwright-MCP legt relative Dateipfade im Haupt-Arbeitsbaum ab, nicht im Worktree. | Absolute Pfade unter `.wt-gl` benutzen (Falle, nicht Code). |
| V-GL-16 | Der Pixelvergleich der bestehenden Startseite mit und ohne `?gl=1` wurde nicht gefahren (kein gemeinsamer Render-Code berührt). | Beim Real-Device-Gang mitnehmen (§8.1 Frage 2). |
| V-GL-17 | Die Schweizer Reihen sind kürzer als bei GLAMOS: Längenreihen 155 → 120, Massenreihen 41 → 38, und das FoG endet bei der Länge 2024. | Wenn GLAMOS die Weitergabe bestätigt (V-GL-10 ist umgangen, nicht beantwortet), kann ein Ergänzungsstrang die fehlenden Reihen unter eigener Quelle führen; bis dahin steht es so da. |
| V-GL-18 | Die Entitätsregel trifft 96,4 % der SGI-Gletscher exakt (18 fälschlich zusammengelegt, 14 geteilt); 1 396 statt 1 400 Gletscher. | Namensliste der 32 Abweichungen prüfen; die Regel bleibt, solange kein unabhängiger Gletscherschlüssel (SGI-Nummer) im Daten-Repo darf. |
| V-GL-19 | Die Schweizer Teilgebiete sind Länge/Breite, nicht Einzugsgebiete; die Seite nennt sie „Schweiz West … Süd“. | Wenn eine freie Einzugsgebietsgrenze (BAFU, OGD) geladen wird, kann die Region wieder das Gewässer sein; ein Formatwechsel `v2` wäre nicht nötig (nur neue Schlüssel). |
| V-GL-20 | GLIMS/NSIDC nennen eine Zitierpflicht, kein „CC BY 4.0“ (Jans Quelle sagt CC BY 4.0). | Fundstelle suchen oder den Wortlaut der Zitierpflicht in die Quellenliste setzen (steht dort schon). |
| V-GL-21 | Die Workflows laufen auf dem Kopf von `feat/gletscher`: jeder Push dorthin wirkt auf die nächsten Läufe in `buscosun-data`. | Vor dem Merge nur geprüfte Stände pushen (alle Prüfer grün); nach dem Merge setzt der Rückfall auf `main`. |
| V-GL-22 | GitHub-Actions-Läufe dieser Linie haben vor dem 11.10. nie auf einem Runner gelaufen; die Vorlagen sind lokal gegen echte Bare-Remotes geprüft (Prüfer P1–P14, die Sichtschritte als Skript), nicht auf GitHub. | Erster planmäßiger Lauf auf GitHub: `glacier-sat.yml` #1 (11.10. 22:48 UTC, `schedule`) **grün und veröffentlicht** (`affc548`: fünf neue Kachel-Tage, neue Saisonstände, Zeiger) — Producer-Klon von `feat/gletscher`, Sicht aus `main` + Zweig `glacier`, Scan und Publisher laufen auf dem Runner. `glacier-melt.yml` #1 (23:29 UTC) endete grün **ohne Ergebnis** (V-GL-24: fehlendes `bz2`, Exit-Code von `tee` verdeckt) — behoben (`c3e37d1`, Daten-Repo `2a43783`) und lokal mit dem echten Cube und den echten Daten-Repos nachvollzogen (2 199 Gletscher in 86 s); **der erste Lauf mit der Korrektur steht aus** (02:20 UTC). `glacier-feed.yml` (05:35 UTC, an diesem Montag mit Wochenkarte), `glacier-archiv.yml` (00:47 und 06:47 UTC; archiviert erst, wenn ein Schmelzlauf da ist) und `glacier-static.yml` (montags 05:17) sind noch nicht gelaufen; ihre Schritte liefen lokal gegen die echten Repos (Feed 385 Ereignisse, Wächter 25/25, Daten-Schritt des Archivs). Zusätzliche Testplätze (00:09 und 00:32 UTC) hat GitHub nicht ausgeführt; sie sind wieder entfernt. |
| V-GL-23 | Jeder Satellitenlauf legt je berührter Region einen neuen Stand der Saisonreihe ab (`season/<Jahr>/<Region>/<Stand>.json`, ≈ 20 KB, bis zu 45 Dateien); gelesen wird nur der neueste. Der Verlauf wächst um schätzungsweise 0,8 MB am Tag. | Die Budgets sind laut Jan egal; wer den Verlauf klein halten will, legt nur alle paar Läufe einen neuen Stand ab (Zeiger bleibt) oder fasst die Stände je Woche zusammen. |
| V-GL-24 | Der erste planmäßige Schmelzlauf auf GitHub (11.10. 23:29 UTC) endete „grün“ **ohne Ergebnis**: `melt.mjs` stürzte am fehlenden Paket `bz2` ab, und die Pipe in `tee` verdeckte den Exit-Code (GitHubs Standard-Shell hat kein `pipefail`). Dasselbe Muster steckt in `sea.yml` des Daten-Repos (`| tee`). | **Behoben** für diese Linie: `npm install bz2@1 jsfive@0.4` im Arbeitsverzeichnis, `set -o pipefail` in jedem Schritt mit `tee`, Prüfer W10/W11. Hinweis an Jan: dieselbe Falle in den Workflows anderer Linien prüfen (`sea.yml`: `Texts`-Schritt mit `| tee ../text.log`). |
