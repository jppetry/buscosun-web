# buscosun-data

Vorprozessierte Wetterdaten für [buscosun.com](https://buscosun.com).

**Dieses Repo enthält keinen Anwendungscode.** Es ist ein reiner Datenspeicher,
ausgeliefert über [jsDelivr](https://www.jsdelivr.com/). Vier Produktlinien mit verschiedenen
Takten und verschiedenen Zwecken:

| Linie | Verzeichnis | Achse | Takt | Wer schreibt |
|---|---|---|---|---|
| **Kartenlayer** | `runs/`, `index.json`, `hsurf-v1.png` | Fläche je Zeitpunkt | 8 × täglich | `.github/workflows/build.yml` |
| **Radar-Spiegel** | `radar/` | Fläche je Zeitpunkt, Minuten | alle 1–2 min | `.github/workflows/radar.yml` |
| **Punkt-Cube** | `point/` | **Zeitreihe je Ort** | **drei Jobs**: Stufe 1 8 ×, Stufe 2 4 ×, Stufe 3 2 × täglich | `.github/workflows/point.yml` |
| **Straßenwetter** | `road/` | Messpunkte der Glättemeldeanlagen | alle 15 min | `.github/workflows/radar.yml` (Produkt im Radar-Spiegel) |
| **Streckenprognose** | `road/fc/` | Zeitreihe je Punkt der Autobahn | stündlich | `.github/workflows/road-fc.yml` |
| **Seewetter** | `sea/` | Seegangsfelder, Spot-Reihen, amtliche Texte | Texte alle 15 min, Felder 2 × täglich | `.github/workflows/sea.yml` |

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
radar/status.json         schema 3 — keep, imgKeep je Quelle, pollSec, derive, Job-ID, letzte Läufe, Blitz-Haken
radar/rv/                 DWD RADVOR RV, rohe tar.bz2 je 5-Minuten-Schritt
radar/konrad3d/           DWD KONRAD3D, XML je 5-Minuten-Schritt
radar/img/v1/rv/          RV als fertiges PNG + JSON (RD3: Derive im Spiegel statt im Browser)
                          f000…f120.png = 25 Einzelframes (u8, 5 min); seit 02.10.2026 dazu je volle Stunde
                          nach dem Slot ein Stundenmittel m<lead>.png (RGB: R·256+G = Summe der Rohbytes der
                          Frames in (t − 60 min, t], B = gesättigte Frames; meta.json#hourMeans) — E-AX-16
radar/img/v1/inca/        GeoSphere INCA
radar/img/v1/rzc/         MeteoSchweiz RZC/CombiPrecip
radar/img/v1/konrad3d/    Zellbahnen als JSON
radar/img/v1/rv-past/     RV-Analyse f000.png der letzten 2 h (Kopie der f000 des RV-Slots) — Rückblick
radar/img/v1/lightning-de/   Blitze DWD Blitzdichte (NowCastMIX), nur DE-Verbund: frame.png + meta.json je 5 min
radar/img/v1/lightning-mtg/  Blitze EUMETSAT MTG Lightning Imager, ganz DACH: frame.png + meta.json je 5 min
```

Aufbewahrung: Radar-Rohdaten und volle RV-/INCA-Slots `keep: 12` Schritte (RV ≈ 1 Stunde, INCA ≈ 3 Stunden);
die gemessenen Analysen und Zellen (`rv-past`, `rzc`, `konrad3d`) und die Blitze **2 Stunden** — Alter ≤ 23 × 5 min
hinter dem jüngsten Slot derselben Quelle, mindestens 2 Slots. Der Job läuft 345 Minuten am Stück und pusht in seinem
eigenen Takt; `radar-watchdog.yml` startet ihn neu, wenn er ausfällt.

**Blitze sind Werte, keine Farben.** Beide Quellen werden über WCS im nativen Gitter geholt und mit nächstem Nachbarn auf
ein festes EPSG:3857-Raster gelegt (DACH 5,5–17,5 °E × 45,5–55,5 °N, 2 000 m, 668 × 880). `lightning-de`: Wert =
(R·256 + G) / 100, der Index 0…127 der Quelle; A = 0 heißt außerhalb des deutschen Verbunds (keine Messung, nicht
„keine Blitze"). Die Fenster sind 15 Minuten lang und kommen alle 5 Minuten — **sie überlappen, nie aufsummieren**.
`lightning-mtg`: R = Klasse 0…20 (≈ Blitze je 5 min und Pixel, ±1; 0 = keine Blitze **oder** keine Messung), optische
Gesamtblitze aus dem geostationären Orbit, um einige Kilometer nach Norden versetzt (Parallaxe). Österreich und die
Schweiz haben keine offenen Bodennetz-Blitze — dort gibt es nur MTG. Der Stempel ist das Fensterende; ein Slot, den die
Quelle nicht veröffentlicht hat, fehlt (kein Verzeichnis), er ist nie „0". Vertrag: `src/sources/lightningImg.ts`.

---

## Straßenwetter — `road/`

Messwerte der rund 1 500 Glättemeldeanlagen (GMA) des DWD und der Länder (SWIS), alle 15 Minuten
— Fahrbahntemperatur, Fahrbahnzustand, Wasserfilm, Luft, Taupunkt, Sicht, Wind, Niederschlag.
Quelle: `opendata.dwd.de/weather/weather_reports/road_weather_stations/` (BUFR, 23 Reihen in 22 Ordnern).
Kein eigener Cron: das Produkt läuft im Radar-Spiegel mit (`radar.yml`), die Logik liegt im
Anwendungs-Repo (`scripts/road/road-mirror.mjs`, Dekodierung und Prüfung je Slot als Kindprozess
`scripts/road/road-derive.mjs`, Regeln in `src/road/roadContract.ts`).

```
road/v1/status.json                    Job, letzter Slot, je Reihe Stand und Alter, Prüfer-Bilanz, Sperre, Kill-Switch
road/v1/state.json                     Zustand des Producers (Lauflängen für „hängender Sensor") — nicht für den Client
road/v1/obs/<YYMMDDHHMM>.json          alle GÜLTIGEN Messpunkte des Slots: Werte, Klasse, Herkunft
road/v1/h24/<Reihe>/<YYMMDDHHMM>.json  24-h-Verlauf einer Reihe bis zu diesem Slot (Fahrbahn, Luft, Taupunkt)
road/v1/quarantine/<YYMMDDHHMM>.json   verworfene Werte mit Regel und Rohwert, nur für die Diagnose
road/v1/static/stations.json           Stationskatalog aus sws_stations_xls.xlsx (zeitlos, ETag täglich geprüft)
road/v1/static/corridors.json          Autobahn-Korridore (BKG DLM250), km-Achse, Grenzmarken (zeitlos, von Hand)
```

**Unplausibles erreicht `obs/` nie.** Jeder Wert durchläuft die Prüfer des Vertrags (physikalische
Grenzen, Geräteplatzhalter −75 °C, DWD-Flag, hängender Sensor, Zustand nur mit gültiger
Fahrbahntemperatur); ein Slot, in dem zu wenige Reihen geliefert haben oder mehr als 10 % der Werte
verworfen wurden, wird **nicht veröffentlicht** — der letzte gute Slot bleibt stehen. Statistische
Prüfer (Sprung, Nachbarn, Modellabgleich) laufen zunächst nur beobachtend und stehen als „wäre
verworfen" in `status.json` und `quarantine/`.

Slot-Dateien sind inhaltlich unveränderlich — deshalb `@main` am CDN; der Client rechnet den
erwarteten Slot aus der Uhr und tritt bei 404 einen Slot zurück. `static/corridors.json` wird nicht
vom Spiegel gebaut (`scripts/road/build-corridors.mjs`); der Spiegel übernimmt die Fassung aus dem Repo.

⚠️ Kein amtliches Warnprodukt und keine Fahrbahnprognose des DWD: Messwerte an Punkten, nicht für
die ganze Strecke.

---

## Streckenprognose — `road/fc/`

**buscosun Fusion 8** an festen Punkten der Autobahnen, stündlich gerechnet, 0–48 h in Stundenschritten:
Lufttemperatur mit Streuung, Taupunkt, Niederschlagswahrscheinlichkeit und -menge, Schnee-Anteil, Wind,
Böen, Bewölkung. Gerechnet wird aus dem, was in DIESEM Repo liegt — Punkt-Cube (`point/`), MOSMIX-L
(`point/stations/`), Radar-Stundenmittel (`radar/img/v1/rv`) und die gelernten Tabellen — mit derselben
Kette, die der Browser am Ort rechnet (`getPointForecastFromCube`, Stufe `fs`), nur ohne Messungs-Anker.
Producer: `scripts/road/road-forecast.mjs` im Anwendungs-Repo, Vertrag `src/road/roadFc.ts`.

```
road/fc/v1/index.json                 Zeiger: die vorhandenen Läufe, neueste zuerst (veränderlich)
road/fc/v1/<lauf>/c/<korridor>.json   ein Korridor: Achspunkte alle 5 km und seine Stationen, 49 Stunden
road/fc/v1/<lauf>/s/<land>.json       Stationen ohne Korridor (Bundes- und Landesstraßen), je Bundesland
road/fc/v1/static/points.json         die Punkte: Lage, Korridor-km, Brücke, Abstand zur Nennlage
road/fc/v1/static/geo.json            Gelände und Rauhigkeit je Punkt, vorab gerechnet (nur für den Producer)
```

**Punkte.** Achspunkte liegen alle 5 km auf jedem Korridor und sind auf die Fahrbahn derselben Autobahn
aus OpenStreetMap gelegt (`snap` = Abstand zur Nennlage auf der Korridor-Achse; `null` = keine Fahrbahn
in 1 km, der Punkt bleibt auf der Achse — das sind Abschnitte, die noch nicht gebaut sind). Liegt die
Nennlage in einem Tunnel, rückt der Punkt bis 2 km weiter (`slide`). Stationspunkte sind die
Glättemeldeanlagen an ihrer Katalogposition. `<lauf>` = Ausgabezeit `YYMMDDHHMM` (UTC); Schritt i gilt
zu `t0Ms + i · 1 h`.

**Werte** sind ganze Zahlen, `null` = fehlt (fehlt ≠ 0): `t`, `ts`, `td` in 0,1 °C/K · `pp`, `sn`, `n`
in % · `rr` in 0,01 mm/h · `ff`, `fx` in 0,1 m/s · `dd` in Grad · `cf` Konfidenz ×100 · `q` Herkunft
des Schritts (0 Stufe 1, 1 Stufe 2, 2 Stufe 3, 3 Station, 4 Klimatologie; +8 = interpoliert).

**Lesen.** `index.json` ist veränderlich und wird über `raw.githubusercontent.com` gelesen, die
Lauf-Dateien sind unveränderlich (`@main` am CDN). Ein Lauf gilt erst 5 Minuten nach `publishedAt`;
bis dahin der Lauf davor. Ein Lauf, in dem mehr als 10 % der Punkte ohne Ergebnis blieben oder die
gelernten Tabellen nicht gelesen wurden, wird **nicht veröffentlicht** — der vorige bleibt der jüngste.
Aus: Repo-Variable `ROAD_FC=0`.

⚠️ Modellprognose für das **Wetter an der Strecke** — keine Fahrbahntemperatur, kein Fahrbahnzustand,
kein amtliches Warnprodukt.

---

## Seewetter — `sea/`

Seegang an der deutschen Nord- und Ostseeküste aus dem Küstenseegangsmodell **CWAM** des DWD (900 m, zwei
Läufe am Tag, 0–78 h), Reihen an rund 60 Spots mit **Wind und Böen aus buscosun Fusion** (nie der Antriebswind
des Wellenmodells), dazu die amtlichen Texte des Seewetterdienstes Hamburg **wörtlich**. Producer:
`scripts/sea/*` im Anwendungs-Repo, Vertrag `src/sea/seaContract.ts` + `src/sea/seaText.ts`, Workflow
`.github/workflows/sea.yml` (alle 15 min; die Felder nur, wenn das DWD-Inventar einen vollständigen neuen Lauf
zeigt — gemessen ab Lauf + 4:07 h).

```
sea/v1/status.json                          Linien, letzter Lauf, letzte Ausgabe je Text, Prüfer-Bilanz, Sperre, Kill-Switch
sea/v1/run/cwam/<lauf>/run.json             Lauf, Schritte, Gitter, Maskenhash, Prüfer-Bilanz (zuletzt geschrieben)
sea/v1/run/cwam/<lauf>/f/<sss>.png          630 × 387 RGBA: R = Hs (5 cm; 254 = ≥ 12,70 m, 255 = kein Wert), G = Richtung (kommt aus, 256 Stufen), B = Tm−1,0 (0,1 s; 255 = kein Wert), A = 255 Wasser / 0 Land
sea/v1/run/cwam/<lauf>/c/<sss>.png          1260 × 387, links Windsee, rechts Dünung, Kanäle wie f
sea/v1/spots/<lauf>.json                    Stundenreihen je Spot: Welle (Modell CWAM), Wind/Böe/Richtung (buscosun Fusion), Herkunft je Spalte
sea/v1/text/<produkt>/<YYMMDDHHMM>.json     FQDL50, FQDL51, WODL45, FXDL40: raw (Latin-1, Zeichen für Zeichen), Anzeigetext, Gliederung
sea/v1/quarantine/<lauf|text-datei>.json    Verworfenes mit Regel (nur Diagnose)
sea/v1/static/spots.json                    Spotkatalog: Lage, Ufernormale (aus der CWAM-Maske), Seegebiet, Küstenabschnitt, Station, Gitterzelle
sea/v1/static/areas.json                    Seegebiete und Küstenabschnitte (DWD-Warngebiete; © GeoBasis-DE / BKG 2021, Daten modifiziert; VMAP0)
sea/v1/static/mask-cwam.hash                sha256 der Landmaske
sea/v1/static/spot-geo.json                 Gelände/Rauhigkeit an den Spot-Zellen (nur für den Producer; Höhe über Wasser = 0)
```

**Schritte.** `f/` stündlich 0–48 h, dann dreistündlich bis 78 h (59 Bilder), `c/` dreistündlich (27), Spots
stündlich 0–78 h. `<lauf>` = `YYYYMMDDHH` (00 oder 12 UTC); Schritt `sss` gilt zu Lauf + `sss` h.

**Lesen.** Lauf- und Ausgabedateien sind unveränderlich (`@main` am CDN). Der Client rechnet den erwarteten Lauf
aus der Uhr (Lauf + 5 h) und die erwartete Ausgabe je Text, und tritt bei 404 zurück — es gibt keine Zeiger-Datei.
Lauf älter als 18 h = „veraltet“, älter als 30 h oder Kill-Schalter = „Keine Daten“, keine Fläche.

**Sperren.** Ein Lauf wird nur veröffentlicht, wenn das Inventar 13 × 79 Dateien zeigt und jedes Feld Gitter,
Seepunkte (124 011) und Landmaske des Vertrags trägt und höchstens 0,1 % Werte außerhalb hat; sonst bleibt der
vorige. Perioden-Platzhalter (1,0 s bei Hs < 0,05 m) und Windsee-Spitzenperioden über 12 s bei unter 0,3 m
Windsee werden `null`. Ein Bulletin ohne Kopf, Textende oder Ausgabezeit wird verworfen. „Keine Warnung“ gilt nur
aus dem exakten Satz des Seewetterdienstes, alles andere ist „unbekannt“ und steht wörtlich da.

Aufbewahrung: aktueller + voriger Lauf, Texte 48 h. Jeder Push kopiert den ganzen `sea/`-Bestand (heilt nach
Force-Pushes der Karten- und Punktlinie). Aus: Repo-Variable `SEA_KILL=1`.

⚠️ Modell und amtlicher Text — kein amtliches Warnprodukt von buscosun, keine Sicherheitsbewertung.

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
point/stations-s/<lauf>/…        MOSMIX-S je Station — stündliche Läufe, 240 h (AX-8)
point/static/hmodel/v1/…         Modellhöhe JE QUELLE — statisch, zeitlos
point/static/clima-grid/v1/…     Klimanormale 1991–2020 (DE/AT/CH-Gitter) auf Stufe 1 — statisch (AX-9)
```

**Drei Auflösungsstufen**, weil die Quellen drei Auflösungen haben: ICON-D2 ist 2,2 km,
IFS ist 0,25°. Zusammen **109 Zeitschritte** (49 + 24 + 36). Zwischen den Bändern liegen
zwei Lücken in Vorhersagestunden — 49/50 h und 121–125 h; in **Gültigzeit** verschieben
sie sich, weil die Stufen aus verschiedenen Läufen kommen (s. „Ein Verzeichnis ist eine
Veröffentlichung").

Eine Punktabfrage lädt **drei** Chunks — einen je Stufe. Dazu kommen, wenn gebraucht,
1,5 KiB Modellhöhe aus `point/static/` und ein Stationsbündel.

### Was der Cube trägt — 61 Ebenen

```
25 Mittel   12 Zielgrößen (t2m, td2m, u10, v10, gust, precip, clct, clcl, clcm, clch, ps, snowlmt)
            11 Profil- und Flächengrößen (gammaEff, zBase, zInv, dTInv, hModEff,
               t925/t850/t700, rh925/rh850/rh700)
             2 Metaebenen (srcCount, ensCount)
 9 σ_div    <var>_sd      — Streuung ZWISCHEN den Quellen
 9 σ_ens    <var>_sd_ens  — Streuung ZWISCHEN den Membern EINER Quelle
 7 q10 + 7 q90            — gemessene Quantile EINER Quelle (C-LAEF-EPS)
 4 Member-Mittel <var>_ens — Mittel der Member EINER Quelle (IFS-ENS, Stufe 3: t2m, u10, v10, precip; seit Schema 6, 2026-09-30)
```

Das Member-Mittel ist ein **Wert** wie die Quantile (Skala und Versatz der Größe). Es ersetzt das Mittel der Stufe
nicht — die `mean`-Ebene bleibt das Mittel der deterministischen Läufe; der Client kann das Member-Mittel als eigenes
Member führen. In Stufe 1 und 2 sind die vier Ebenen leer. Chunks des Schemas 5 (57 Ebenen) liegen nach dem Wechsel
bis zu 24 h daneben; jeder Leser mit dem Manifest oder mit der Schema-5-Liste liest sie weiter. Der Cron klont den
Producer von `buscosun-web/main` — bis der Stand mit Schema 6 dort liegt, tragen alle Läufe Schema 5; `run.json`
nennt das Schema je Lauf, `index.json` die Ebenenliste.

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

**Drei Ebenen nur im Stationsprodukt** (AX-11, seit 2026-09-30): hinter den Cube-Ebenen
stehen `radGlob` (Globalstrahlung, Stundenmittel W/m² aus `Rad1h`), `sunDur` (Sonnenschein-
dauer der Stunde in Minuten aus `SunD1`) und `vis` (Sichtweite in m aus `VV`) — Größen, die
der Cube nicht führt. Die Ebenenliste steht im Lauf-Manifest (`planes`, `stationPlanes`);
ein Leser nimmt sie von dort, nie aus der Cube-Liste.

**MOSMIX-S daneben — `point/stations-s/`** (AX-8, seit 2026-09-30): dieselbe Pipeline,
derselbe Container, derselbe Katalog (gemessen: dieselben 3 071 Stationen, Lage und Höhe
identisch), aber **stündliche Läufe** (Lauf + 39…41 min, 37 MB je Datei) mit 240 statt
247 Schritten. Ein eigenes Verzeichnis, weil ein 09z-Lauf von S und einer von L denselben
Namen trügen; ein eigener Index-Eintrag (`stationsS`), weil der Leser MOSMIX-L voreingestellt
weiterliest und S nur mit Option nimmt (bis der Stationsvergleich entschieden ist).

### Klimanormale — `point/static/clima-grid/v1/`

Monatliche Klimanormale **1991–2020** (Temperatur Mittel/Max/Min, Niederschlagssumme,
Sonnenscheindauer) aus den drei nationalen 1-km-Gittern — DWD CDC (Gauß-Krüger 3, 1/10 °C),
GeoSphere SPARTACUS v3 (Normale = Wert − Anomalie des Jahres 2020) und MeteoSchweiz OGD
(LV95; die Sonne dort als relativer Anteil, in Stunden über die astronomische Tageslänge
umgerechnet) — als Mittel der Quellzellen je Cube-Zelle der Stufe 1. Alle drei CC BY 4.0.

Gleicher Container, eigene Ebenenliste (`t_mean_01…12`, `t_max_*`, `t_min_*`, `rr_*`, `sun_*`,
dazu `elev_src` = mittlere DEM-Höhe der Quellzellen, `n_src`, `src` = Länder-Bitmaske),
`nt = 1`, nur Stufe 1. Zellen außerhalb DE/AT/CH/LI sind MISSING — Nachbarländer haben hier
kein Gitter. Der Client bringt die Temperaturnormale mit dem Lapse gegen `elev_src` auf
seine Punkthöhe; Tagesgang, Streuung und Nasstag-Wahrscheinlichkeit bleiben Sache der
Stationsklimatologie. `static.json` nennt Quellen, Lizenzen, Ableitung und Wertebereiche.

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

### Kartenfelder — `point/field/v1/`

Nach jedem Stufenbau rechnet der Punkt-Cron aus **genau diesem Cube** Kartenfelder — Etikett **„Modell · Cube"**, nicht
„buscosun Fusion": je Zelle der Stufe die Kette von buscosun Fusion mit dem Cube als **einziger** Quelle (keine Station,
kein Radar, kein Gelände am Ort; am Zellmittelpunkt, Höhe = Modellhöhe der Zelle).

```
point/field/v1/index.json                       jüngster Lauf je Stufe (veränderlich)
point/field/v1/budget.json                      letzter Versuch je Stufe (Dauer, Abbruch) — Grundlage „jeder zweite t1-Lauf"
point/field/v1/<lauf>/<stufe>/field.json        Manifest: Raster, Vorläufe, Kodierung, Chance-Definition mit Messwerten, Kette
point/field/v1/<lauf>/<stufe>/precip-LLL.png    R Chance P(nass) · G Median | nass · B q90 · A 255 gerechnet / 0 fehlt
point/field/v1/<lauf>/<stufe>/snowlmt-LLL.png   R Mitte /25 m · G halbe Bandbreite /25 m · B Herkunft (2 σ_div, 3 σ_ens)
```

- **Raster** = Gitter der Stufe (0,05° / 0,10° / 0,25°), Zeile 0 = Norden; regulär in Grad, nicht in Mercator.
- **Chance** = 1 − pDry der Niederschlags-Hürde (K-2 → gelernte Hürde, Tabellen `point/fusion.client.json`, Hash im
  Manifest). Gemessen am Archiv (16.09.–01.10., 389 Stationen, t1): Brier 0,026–0,028, Skill gegen die Klimatologie
  0,17–0,30 — im Mittel etwas zu nass. Am Ort ohne Station rechnet buscosun Fusion 8 dieselbe Kette.
- **Mengen** sind mittlere Raten in mm/h über das Intervall der Stufe (1 / 3 / 6 h), log-kodiert bis 100 mm/h.
- **Fehlt ≠ 0:** A = 0 heißt „nicht gerechnet" (keine Cube-Quelle, nur Klimatologie); „trocken" ist Chance 0 mit A = 255.
- **Schneefallgrenze**: Mitte und Band ∓ 1,2816·σ wie am Punkt — σ_ens, sonst σ_div (Spanne der Modelle, unkalibriert);
  t3 führt keine (keine Quelle der Stufe 3).
- **Zeit**: der Feldschritt endet spätestens 18 (t1) bzw. 10 min (t2/t3) nach dem Jobstart; ist der Bau langsam, entfällt das
  Feld dieses Laufs; dauert das t1-Feld länger als 5 min, rechnet nur jeder zweite t1-Lauf eines. Ein Feld-Fehler nimmt nie den Cube.
- Vertrag: `src/point/fieldFormat.ts`; Producer `scripts/point/build-point-fields.mjs`.

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
| `point/field/v1/<lauf>/<stufe>/` | solange die Cube-Stufe dieses Laufs im Repo liegt | wie die Stufe |
| `point/stations/` | Alter ≤ 24 h, mindestens 2 Läufe | ≈ 4 Läufe |
| `point/stations-s/` | Alter ≤ **6 h**, mindestens 2 Läufe | ≈ 6 Läufe bei 24 Slots |
| `runs/` | `keep: 4` | ≈ 12 h |
| `radar/` (Rohdaten, volle RV-/INCA-Slots) | `keep: 12` Schritte | RV ≈ 1 h, INCA ≈ 3 h |
| `radar/img/v1/` `rv-past`, `rzc`, `konrad3d`, `lightning-*` | Alter ≤ **115 min** hinter dem jüngsten Slot, mindestens 2 Slots | 24 Slots ≈ 2 h |
| `road/v1/obs/` | Alter ≤ **3 h**, mindestens 2 Slots | 12 Slots |
| `road/v1/quarantine/` | Alter ≤ 24 h, mindestens 2 Slots | 96 Slots |
| `road/v1/h24/<Reihe>/` | Alter ≤ 1 h, mindestens 2 Dateien je Reihe (jede Datei trägt den ganzen 24-h-Verlauf) | ≈ 4 je Reihe |
| `road/fc/v1/<lauf>/` | Alter ≤ **3 h**, mindestens 2 Läufe | 3 Läufe |

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
| Stationen S (AX-8) | `:50` der Stunden 0, 1, 2, 3, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 17, 18, 19, 20, 21, 23 | MOSMIX-S | Lauf + 39…41 min (Last-Modified 30.09.: 09:39:52 · 10:40:47 · 11:39:37 · 12:39:20) ⇒ 9 min Rand; in den t2-Stunden 4/10/16/22 baut der t2-Job das Produkt bei ≈ :38–:40 und trifft meist den Vorlauf — `ageH` sagt es |

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
| `radar/img/v1/lightning-de` | Datenbasis: Deutscher Wetterdienst (NowCastMIX-Blitzdichte), Werte auf eigenes Raster umgesetzt | CC BY 4.0 / GeoNutzV |
| `radar/img/v1/lightning-mtg` | Contains modified EUMETSAT Meteosat data 2026 (MTG-I1 Lightning Imager, Accumulated Flash Area) | CC BY 4.0 |
| `road/` (Messwerte, Stationsliste) | Deutscher Wetterdienst, Glättemeldeanlagen der Länder (SWIS) | GeoNutzV, Quellenvermerk DWD |
| `road/v1/static/corridors.json` | © GeoBasis-DE / BKG (DLM250), GeoNames | dl-de/by-2.0, CC BY 4.0 |
| `road/fc/` (Prognose) | buscosun Fusion 8 aus den Linien dieses Repos | wie die Quellen der Linien |
| `road/fc/v1/static/points.json` (Lage der Achspunkte) | © OpenStreetMap-Mitwirkende | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/) |
| `point/` (C-LAEF), `radar/img/v1/inca` | GeoSphere Austria | CC BY 4.0 |
| `point/` (ICON-CH1/CH2), `radar/img/v1/rzc` | MeteoSchweiz | CC BY 4.0 |
| `point/` (IFS/AIFS) | ECMWF Open Data | CC BY 4.0, ECMWF Terms of Use |

Die Daten wurden **verändert**: räumlich abgetastet, quantisiert und umkodiert.
Sie sind **nicht** für amtliche Zwecke geeignet.

Die Producer liegen im Anwendungs-Repo:

- [`scripts/repack-icon-d2.mjs`](https://github.com/jppetry/buscosun-web/blob/main/scripts/repack-icon-d2.mjs) — Kartenlayer
- [`scripts/radar-mirror/radar-mirror.mjs`](https://github.com/jppetry/buscosun-web/blob/main/scripts/radar-mirror/radar-mirror.mjs) — Radar
- [`scripts/road/road-mirror.mjs`](https://github.com/jppetry/buscosun-web/blob/main/scripts/road/road-mirror.mjs), [`road-derive.mjs`](https://github.com/jppetry/buscosun-web/blob/main/scripts/road/road-derive.mjs) — Straßenwetter
- [`scripts/road/road-forecast.mjs`](https://github.com/jppetry/buscosun-web/blob/main/scripts/road/road-forecast.mjs), [`build-fc-points.mjs`](https://github.com/jppetry/buscosun-web/blob/main/scripts/road/build-fc-points.mjs) — Streckenprognose
- [`scripts/point/build-point-cube.mjs`](https://github.com/jppetry/buscosun-web/blob/main/scripts/point/build-point-cube.mjs) — Punkt-Cube
- [`scripts/point/build-stations.mjs`](https://github.com/jppetry/buscosun-web/blob/main/scripts/point/build-stations.mjs) — Stationsprodukt
- [`scripts/point/publish-point.mjs`](https://github.com/jppetry/buscosun-web/blob/main/scripts/point/publish-point.mjs) — Veröffentlichung und Aufbewahrung der Punktlinie
