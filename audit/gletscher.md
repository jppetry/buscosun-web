# Phase GL — Gletscher-Monitor DACH (Kachel 13, `/gletscher`)

Diagnose, Protokoll und Gates der Phase. Plan: `audit/gletscher-plan.md` (bindend: §1 Abweichungen A1–A11, §2 Branch- und
Repo-Modell), Konzept: `audit/gletscher-konzept.md`, UI-Vorgabe: `reference/gletscher-*.dc.html`, Startprompt `prompt-gletscher.md`.
Auftrag Jan 11.10.2026: Stufe 1 (GL-0 … GL-5) im Auto-Modus auf `feat/gletscher`; `GLACIER_LIVE` bleibt `false`; `main`,
`CLAUDE.md`, `MANUELLE-SCHRITTE.md` bleiben Jans (Plan A9) — Status und Jans Schritte stehen deshalb hier (§0, §9).

## 0 Status (nur der aktuelle Stand)

| Paket | Stand | Beleg |
| --- | --- | --- |
| Branch/Worktree | `feat/gletscher` von `origin/main` (`1798fc5`), Worktree `C:\dev\buscosun-web\.wt-gl`, gepusht; Planungsunterlagen als erster Commit `2d92087`, aus dem Haupt-Arbeitsbaum entfernt (waren dort untracked, identisch) | §7 |
| **Blocker: Daten-Repo** | `gh` ist auf dieser Maschine **nicht installiert** (weder im PATH noch an den üblichen Orten, kein `GH_TOKEN`); `jppetry/buscosun-glacier` existiert nicht (API 404). Das Token des Git-Credential-Managers wird **nicht** für die REST-API entnommen (es ist für `git` gegeben, nicht für andere Zugriffe). Fallback laut Auftrag: lokales Repo `C:\dev\buscosun-glacier` (git, `main`, README, `.gitattributes`), Producer laufen lokal, Workflows als Vorlage im Branch. **Jans Schritt:** Repo anlegen (§9.1) | §9.1 |
| GL-0 Spike | Messungen bis auf die Läufer-Messung des COG-Durchsatzes (braucht das Repo) und die ID-Zuordnung (GL-1) abgeschlossen; Kriterien eingefroren (sha256 in §3) | §2–§4 |
| Gate A | Entscheidungen E-GL-1 … 12 im Auto-Modus gefällt (§5) | §5 |
| GL-1 … GL-5 | folgen — jeweils mit Verifier-Ausgabe in §6 | §6 |

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
| E-GL-3 | alles in `buscosun-glacier` (A2) — **Plan**; **Blocker:** Repo kann hier nicht angelegt werden, lokale Arbeitskopie `C:\dev\buscosun-glacier`, Anlegen = Jans Schritt | §0, §9.1 |
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

Zusätzliche Entscheidungen (D-GL): **D-GL-1** Leitgletscher = 42 (§2.4). **D-GL-2** DE-Gletscher aus RGI 6.2 (Umrisse 2003, Bezugsjahr sichtbar) + BAdW-Zitat;
Zugspitz-Ferner optional aus Paul 2020. **D-GL-3** GLAMOS gelb, CC BY 4.0 der DOI-Seiten gilt, separate Pfade. **D-GL-4** Maskenregel ohne SWIR-Rettung.
**D-GL-5** Verarbeitung auf dem 20-m-Raster, B03 aus der Übersicht. **D-GL-6** Zensur von `hzerocl`. **D-GL-7** GloGEM nur Region 11 per Range-Abruf (CRC32).
**D-GL-8** RGI 6.2 vom OGGM-Server (Daten RGI Consortium, CC BY 4.0) als Brücke, nur Region 11 behalten.

## 6 Protokoll je Paket

(wird mit jedem Paket ergänzt)

## 7 Commits

| Repo | Commit | Inhalt |
| --- | --- | --- |
| `buscosun-web` `feat/gletscher` | `2d92087` | Planungsunterlagen |

## 8 Gates

| Gate | Stand |
| --- | --- |
| A | entschieden (§5), Kriterien eingefroren (§3) |
| B1, B2, C, D | offen |

## 9 Jans Schritte

1. **`jppetry/buscosun-glacier` anlegen** (öffentlich, leer, ohne README/Lizenz): `gh` ist hier nicht installiert. Entweder auf github.com „New repository“
   oder lokal `gh auth login` und `gh repo create jppetry/buscosun-glacier --public`. Danach pusht die nächste Session `main` und den verwaisten Zweig `archive`
   und setzt die Repo-Variable `PRODUCER_REF=feat/gletscher`.
2. RGI 7.0 (NSIDC-Login) laden, wenn die Brücke RGI 7 gewollt ist (aktuell RGI 6.2 für GloGEM).
3. Edge-Bündel (`npm run edge:share`) und PR erst im Merge-Pfad (Plan §2).
4. GLAMOS (office@glamos.ch) um eine Bestätigung bitten: CC BY 4.0 der DOI-Seiten gegen „scientific and non-commercial use“ im Impressum.
