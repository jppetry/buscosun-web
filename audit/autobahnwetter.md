# Autobahnwetter — Phase AW: Diagnose, Protokoll, Gates

> Stand: 2026-10-03. Plan: `audit/autobahnwetter-plan.md` (bindend), Konzept/Datenlage: `audit/autobahnwetter-konzept.md`,
> UI-Vorgabe: `reference/autobahnwetter-*.dc.html` + `reference/README-autobahnwetter.md`.
> Arbeitszweig `feat/autobahnwetter` im Worktree `C:\dev\buscosun-web-aw` (eine parallele Sitzung arbeitet im
> Haupt-Arbeitsbaum auf `main`, §1.3).

## 0. Kurzfassung für Jan

*(wird am Ende der Sitzung mit dem Stand je AP ersetzt — s. §9)*

## 1. Auftrag, Entscheidungen, Rahmen

### 1.1 Entscheidungen

| Nr. | Frage | Entscheidung | Quelle |
|---|---|---|---|
| E-AW-1 | Wo läuft der Ingest? | Produkt im Radar-Spiegel (`radar-mirror.mjs` + Kindprozess `scripts/road/road-derive.mjs`), kein eigener Cron | Startprompt §1 |
| E-AW-2 | Rohformat | **BUFR mit eigenem TS-Decoder** — die QA-XML trägt nur Luft, Taupunkt, Fahrbahn (§2.2) | Startprompt §1, Spike |
| E-AW-3 | Bundes-/Landesstraßen | alle Anlagen im Datensatz, Seite zeigt Autobahnen, B/L als zuschaltbare Ebene | Startprompt §1 |
| E-AW-4 | SEO-Unterseiten | Auswahl: die 20 Autobahnen mit den meisten Anlagen (§2.6) | Startprompt §1 |
| E-AW-5 | Platz der Kachel | volle Breite am Ende des Bento-Rasters, keine `SearchPage.css`-Änderung | Startprompt §1 |
| E-AW-6 | Backtest-Archiv | nicht in dieser Sitzung; nur die Exportfunktion vorbereiten | Startprompt §1 |
| **E-AW-7** | Katalogregel (Stopp-Bedingung > 10 %) | **Position aus dem Bulletin**, Katalog nur zur Anreicherung; „keine Katalogzeile" läuft im **Beobachtungsmodus** und markiert den Punkt (`noCatalog`); hart bleibt „Koordinaten fehlen oder außerhalb DE" | **Jan, 03.10.2026** (Rückfrage, §2.5) |
| E-AW-8 | Erkennen per HEAD | HEAD auf den **erwarteten Slot-Pfad** je Reihe statt auf `…_LATEST` (deterministisch, erlaubt Nachholen aus dem 48-h-Fenster); gleiche Anfragezahl | Ruling (§4.3) |
| E-AW-9 | Lesart „Frostgefahr" | Fahrbahn ≤ +1 °C **und** (nass **oder** Fahrbahn ≤ Taupunkt) — eine Fahrbahn unter dem Taupunkt bei +10 °C ist Tau, kein Frost; Stationsklasse aus kältester plausibler Fahrbahn, größtem Wasserfilm und schwerstem Zustandscode (vom Client exakt nachrechenbar) | Ruling (§3) |
| E-AW-10 | Veränderliche Dateien | 24-h-Ring als `h24/<Reihe>/<Slot>.json` (je Slot unveränderlich, CDN-sicher) statt `h24/<Ordner>.json`; Producer-Zustand (Lauflängen, Vorwert) in `road/v1/state.json`, vom Client nie gelesen | Ruling (§3.4) |
| **E-AW-11** | Eis-Codes ohne plausible Temperatur | **neue harte Regel**: Zustand und Wasserfilm eines Sensors gelten nur mit seiner gültigen Fahrbahntemperatur (`stateNoTemp`); ein Eis-/Glätte-/Reif-/Schnee-Code nur bei ≤ +3 °C (`iceWarm`) | **Jan, 03.10.2026** (Rückfrage, §2.9) |
| E-AW-12 | AT/CH-Fortsetzungen | Korridore v1 nur DE (DLM250) mit Grenzmarke; AT/CH-Fortsetzung (GIP.at/OSM) und Prognosepunkte kommen mit AW-6 | Ruling (§4.5) |

### 1.2 Rechte (Startprompt §2)

Daten-Repo: `road/**`, `scripts/radar-mirror.mjs`, README-Abschnitt; Push nach dem Protokoll (build/point-Lauf
abwarten, fetch, rebase, push, nie force); jsDelivr-Purge nur für `road/` und geänderte Dateien;
`radar.yml` dispatchen erlaubt. buscosun-web: Merge nach `main` erlaubt für unsichtbaren Code (hinter `?road=1`),
sobald typecheck, build, budget und alle berührten Verifier grün sind. Nicht erlaubt: `runs/`, `radar/`-Daten,
`point/`, `index.json`, `hsurf-v1.png`, `build.yml`, `point.yml`, `radar-watchdog.yml`, Secrets, Edge Functions,
Flag in Produktion einschalten, Fusion-Motor, WebGL.

### 1.3 Arbeitsumgebung

- Eine **parallele Sitzung** bearbeitet im Haupt-Arbeitsbaum `C:\dev\buscosun-web` die Startseite
  (`src/RadarSweepIcon.tsx`, `src/SearchPage.tsx/.css`, `audit/startseite-radar-icon.md`, uncommitted). Mein
  `git checkout -b` hatte deren Baum kurz auf `feat/autobahnwetter` gestellt — sofort auf `main` zurückgesetzt,
  meine Phase arbeitet seither im Worktree `C:\dev\buscosun-web-aw` (`node_modules` als Junction). Folge für AW-4:
  `SearchPage.tsx` wird von zwei Sitzungen geändert — mein Diff ist additiv (Kachel am Ende, Palette, Zähler),
  der Merge muss die Radar-Glyphe der anderen Sitzung erhalten.
- Daten-Repo: frischer Sparse-Klon `C:\dev\buscosun-data-road` (README, scripts, .github, road). Der vorhandene
  Vollklon `C:\dev\buscosun-data` ist gegen `origin/main` verzweigt (ahead 2 / behind 12) und bleibt unberührt.

## 2. AW-0 Spike (Diagnose, gemessen 03.10.2026 07:55–09:15 UTC)

### 2.1 Quelle und Reihen

`opendata.dwd.de/weather/weather_reports/road_weather_stations/`: 30 Ordner + `quality-assured/`. Aktiv (Datei je
15 min): **22 Ordner mit 23 Reihen** — FN trägt zwei (`DWFN…-BY`, `DWNB…-NB`), HJ trägt `DWKK…-HH`. SD-BW sporadisch
(eine Datei 01.10. 11:56 UTC, nicht im Slot-Raster). Leer: HS, JH, JS, LV, LW, MK, NC. Die Reihe heißt im Vertrag
`<Ordner>-<KZ>` (z. B. `FN-NB`), Liste `ROAD_GROUPS` in `src/road/roadContract.ts`.

Verzeichnislisten kamen nur mit Cache-Buster (`?v=<ts>`) aktuell — die Produktion liest keine Listen, sondern HEAD
auf den erwarteten Dateipfad (E-AW-8).

### 2.2 Rohformat: QA-XML gegen BUFR (E-AW-2)

`quality-assured/observation_<ID>.xml.bz2`: 1 277 Dateien je Station, je 96 Messungen (24 h) — Stand 07:56 UTC für
07:45 UTC (≈ 11 min, Takt erfüllt). **Inhalt nur `at` (Luft), `td` (Taupunkt), `st` (Fahrbahn)** — geprüft an 7
Dateien aus 7 Präfixgruppen. Kein Fahrbahnzustand, kein Wasserfilm, kein Wind, keine Sicht, kein Niederschlag ⇒
die Bedingung „vollständig (inkl. Fahrbahnzustand/Wasserfilm)" ist nicht erfüllt, außerdem wären es ≈ 1 280
Abrufe je Slot statt 23. **Entscheidung: BUFR mit eigenem Decoder** (`src/road/swisBufr.ts`), eccodes nur als
Referenz im Verifier.

### 2.3 BUFR: drei Layouts

Vorlage: DWD „BUFR-Template für Straßenwetter-Informationen" (März 2015, `bufr_templates_sws_national_pdf.pdf`, am
03.10. von dwd.de geladen) — lokale Deskriptoren 0 01 241–0 02 245, 0 12 241/242, 0 13 241, 0 20 241 mit Skala,
Referenz und Breite (S. 8–9), Codetabellen (S. 5–7, 10–12).

| Layout | Reihen | Merkmal |
|---|---|---|
| `swis-local` | DD, ER, FN-BY (**Edition 3**), HL, HV, JA, KA, KM, LH, MC, ND, NI, RB, RH, SP, WW (16) | Vorlage 2015, Master 13, Local 8, Zentrum 78 |
| `swis-local-film01` | HJ-HH, KK-SH, SH-SH (3) | wie oben, aber Replikation 1 13 000 mit **2 01 131 / 2 02 129** um 0 13 241 ⇒ Wasserfilm 10 bit, 0,1 mm |
| `wmo-307102` | FN-NB, JO-SO, KO-RP, RP-RP (+ SD-BW) (4) | WMO-Sequenz **3 07 102** (Master 26/28): 0 12 128 / 0 13 116 / 0 20 138 |

Alle unkomprimiert, eine Nachricht je Datei, Beobachtungszeit = Slot (291 994 Datensätze, Abweichung 0 min).
Fallen, die der Decoder abfängt: Stationsnamen in **Latin-1** statt IA5 („Brabschütz"), FN-BY richtet Strings
**rechtsbündig** mit führenden Blanks aus (`" V164"`), Abschnitt 1 von FN-BY trägt **Ortszeit** (10:00 für 08:00 UTC)
— nie als Messzeit verwendet. Unbekanntes Layout, Kompression oder andere Operatoren ⇒ `BufrFormatError` ⇒ Reihe
`failed`, kein Müll.

**Decoder gegen eccodes 2.47** (DWD-Lokaltabellen eingebaut): 24 Bulletins des Slots 03.10. 08:00 UTC,
**78 670 Werte, 0 Abweichungen** (Zahlen als skalierte Ganzzahlen, Strings ASCII-maskiert, weil die Python-
Bindung Latin-1 nicht verlustfrei liefert) — eingefroren als Fixture für `verify:road-decode` (§8).

### 2.4 Codetabelle Fahrbahnzustand

0 20 241 (lokal) = 0 20 138 (WMO): **0 trocken · 1 feucht · 2 nass · 3 Reif · 4 Schnee · 5 Eis · 6 Glätte
(„Glaze") · 7 nicht trocken** · 8–14 reserviert · 15 fehlend (PDF S. 7; Hinweis 9: manche Anlagen kennen nur
trocken / nicht trocken / glatt). Im 48-h-Fenster: 0: 169 984 · 1: 33 497 · 2: 23 037 · 7: 4 755 · 3: 4 · 5: 234 ·
6: 341 · fehlend 86 252 (je Sensor). Codes 3–6 fast nur von defekten Anlagen (§2.9).

### 2.5 Stationskatalog und Abdeckung (E-AW-7)

`sws_stations_xls.xlsx` (ETag `a681a1ddc60c378a0583c3e078c9e423`, **Last-Modified 05.06.2020**): ein Blatt
„Tabelle1", 1 688 Stationen, jede Zelle eine Formel in eine externe Arbeitsmappe (nur der gecachte Wert zählt),
Kodierung **Windows-1252 trotz UTF-8-Deklaration**, Spalte „Strecken-kilometer 100 m" in **100-m-Einheiten**
(438 von 822 Paaren exakt gleich dem Bulletin-Kilometer; Sachsen sendet 0 ⇒ Katalog-km als Rückfall).

- Im letzten Slot 1 556 Anlagen, 1 192 mit gültiger Fahrbahntemperatur. **136 davon (11,4 %) ohne Katalogzeile**;
  bei 98 Anlagen liegen Katalog- und Bulletin-Koordinaten > 2 km auseinander (p50 7 m, p90 1,4 km, p99 10 km,
  max 865 km).
- Als harte Regel hätte „keine Katalogzeile" **jeden Slot gesperrt** (> 10 %) ⇒ Stopp-Bedingung ⇒ Rückfrage ⇒
  **E-AW-7** (Jan): Position aus dem Bulletin, Katalog-Regel im Beobachtungsmodus, Flag `noCatalog`.
- P758 „Am Moosfeld" (A94) sendet in jedem Bulletin **Länge 0** ⇒ `outsideDE` verwirft sie (190 von 192 Slots);
  der Katalog hätte gültige Koordinaten — eine Reparatur wäre eine Datenänderung (V-AW-4).

### 2.6 Autobahn-Anteil (E-AW-3/E-AW-4)

Straßenklasse aus dem Bulletin (`A004`, `A095S`), sonst aus dem Katalog (`A7S`): **834 von 1 556 Anlagen
Autobahn (53,6 %), 623 davon mit Fahrbahntemperatur**; Bundesstraße 390 (283), Landes/Staats/Kreis 155 (133),
sonstige/unbekannt 177. Korridor-Zuordnung (§4.5): 807 von 833 Autobahn-Punkten liegen ≤ 2 km an der DLM250-Achse
ihrer Autobahn. Die 20 Autobahnen mit den meisten Anlagen (E-AW-4): A1 68 · A7 62 · A8 57 · A2 56 · A9 55 · A3 52 ·
A4 41 · A44 30 · A6 28 · A45 28 · A96 24 · A93 22 · A99 22 · A71 20 · A5 19 · A61 19 · A20 18 · A46 18 · A73 17 ·
A31 16.

### 2.7 Ankunftszeiten (aus den Verzeichnislisten, 01.10. 08:15 – 03.10. 08:00, 192 Slots)

Verzug Datei-Zeitstempel − Slot, in Sekunden:

| Ordner | p50 | p90 | p99 | max | Lücken |
|---|---|---|---|---|---|
| KO, RP | 6 | 19 | 71 | 127 | 0 |
| KM, JA, ND, SP, RB, LH, KA, JO, WW, FN | 18–27 | 29–84 | 71–128 | 127–183 | 0 |
| DD, HL, HV, MC, NI | 34–36 | 47–50 | 127–128 | 142–183 | 0 |
| ER, HJ, RH | 113–128 | 128–154 | 187–202 | 214 | 0 |
| KK, SH | 186–189 | 200–214 | 226–468 | 253–485 | SH 1 (bis 01.10. 12:30) |
| **alle** | **31** | **139** | **200** | **485** | |

⇒ Frist Slot + 12 min (Plan) deckt alles Gemessene; Zeit-Gate des Clients Slot + 10 min (`set`, §3.3).
Aktive Reihen je Slot: 23 in 139, 22 in 43 (SH-Ausfall), 21 in 6, 20 in 1 (Rest = Artefakte meines Downloads am
Fensteranfang) ⇒ **Basis 23, Toleranz 3 (`set`)**: ein ganzes Land darf fehlen, ohne den Rest zu sperren.

### 2.8 Dateigrößen und Budget

Bulletins: 0,8–36,8 KB, je Reihe **konstant** (feste Bitlayouts), Summe ≈ 159 KB je Slot (4 380 Dateien / 30,6 MB
im 48-h-Fenster). Veröffentlicht je Slot (gemessen an 03.10. 08:00): `obs/<slot>.json` **476 KB roh / 68 KB gz**,
`quarantine/` 25 KB, `state.json` 126 KB, `h24/` 60 KB nach einem Slot (≈ 1,7 MB bei vollem 96-Slot-Ring, über
23 Dateien). Bestand bei Aufbewahrung (obs 3 h = 12, quarantine 24 h = 96, h24 2 je Reihe): ≈ 6 + 2,4 + 3,4 +
0,1 MB ≈ **12 MB** — jsDelivr-Grenzen 20 MB je Datei, 150 MB je Paket (die größte Datei ist der FN-NB-Ring,
≈ 0,5 MB).

### 2.9 Datenqualität im 48-h-Fenster (Replay durch den echten Vertrag)

Alle 4 319 BUFR-Dateien des Fensters (32 Downloads waren 404-Seiten von Dateien, die während des einmaligen,
seriellen Abrufs aus dem Fenster fielen) wurden mit Zustand von Slot zu Slot durch `validateRoadSlot` geschickt
(Skript im Scratchpad, Ergebnis unten):

| Befund | Zahl (48 h) | Regel |
|---|---|---|
| Fahrbahn −75,00 °C (Geräteplatzhalter) | 375 | `placeholder` (hart) |
| Fahrbahn exakt −30,00 / −25,00 / 0,00 °C bei +10…+22 °C Luft | 557 / 185 / 279 | `stuck` (hart, nach 6 h) + `roadAir` (Beobachtung) |
| Eis/Glätte/Reif (Code 3/5/6) | 579 an 16 Anlagen, **557 davon bei Luft > +10 °C** | **E-AW-11** `stateNoTemp` + `iceWarm` (hart) |
| Wasserfilm > 10 mm (Werte 100, 72, 44 …, fast nur FN-BY/JO-SO) | 2 165 | `limit` (hart) — Einheitenfehler der Reihen (V-AW-5) |
| Taupunkt > Luft + 0,5 K | 588 von 226 601 | `dewAboveAir` (hart) |
| Böe < Mittelwind | 96 von 111 397 | `gustBelowWind` (hart) |
| Mehrfachsensoren mit Spanne > 5 K | 457 | `spread` (Kennzeichen) |
| Station in zwei Reihen desselben Slots | 187 | `duplicate` (Kennzeichen) |

**DWD-Flags 0 33 005:** 19 Reihen setzen nur Bit 1 („keine automatische Prüfung") ⇒ `unchecked`. FN-NB setzt
echte, wechselnde Bits (7 Bodentemperatur, 8/9 Bodentemperatur in Tiefe, 18 Niederschlag, 21 Wassergehalt, 4/6).
**FN-BY setzt Bits 11 + 17 + 28 an allen 184 Stationen** (17 = „ice deposit", 11 = Bodentemperatur Tiefe 4,
28 reserviert) — keine Bedeutung für unsere Felder; wörtlich angewandt hätte Bit 17 drei Vierteln Bayerns den
Fahrbahnzustand genommen. Abbildung daher nur: 3 Wind · 4 Luft · 5/6 Taupunkt/Feuchte · 7 Fahrbahn · 14 Sicht ·
15/18 Niederschlag · 19 Zustand · 21 Wasserfilm. Herkunft `ok` nur bei 0 33 005 = 0 (DWD prüfte und fand nichts).

**Hängende Sensoren:** Lauflängen identischer Werte je Station (Maximum über 48 h): Fahrbahn ≥ 24 an 18 Anlagen
(7 davon ≥ 96), Luft ≥ 24 an 20, **Taupunkt ≥ 24 an 65** — 11 Reihen liefern den Taupunkt im 0,1-K-Raster, lange
gleiche Folgen sind dort physikalisch möglich (V-AW-6: Stichprobe in Gate B). Zwei Lücken des ersten Entwurfs
gefunden und behoben: die Regel beobachtete nur den ersten Sensor (K677: zweiter Sensor 189 Slots bei −0,01 °C ⇒
„Frostgefahr" im ganzen Fenster), und jeder fehlende Wert setzte die Zählung zurück (H267: 64 Slots durchgerutscht).
Jetzt: Lauflänge **je Sensorposition**, fehlende Werte/Slots bis 1 h neutral (`ROAD_STUCK_GAP_SLOTS`, `set`).
Rest: ohne Vorgeschichte rutschen hängende Werte bis zu 6 h durch ⇒ der Spiegel holt beim Start **24 h nach** (§4.3).

### 2.10 Startwerte der Prüfer

| Regel | Startwert | Herkunft |
|---|---|---|
| Grenzen Fahrbahn/Luft/Feuchte/Wind/Wasserfilm | −40…+75 / −40…+45 °C / 0–100 % / 0–60 m/s / 0–10 mm | `set` (Plan) |
| Platzhalter | < −60 °C | Plan; gemessen nur −75,00 |
| hängender Sensor | 24 gleiche Werte (6 h), je Sensor, Lücken ≤ 1 h neutral; Tauplateau −10…0 °C bei Luft ±10 K | Plan + §2.9 |
| E-AW-11 `iceWarm` | Eis-Code nur ≤ +3 °C | `set` (Jan) |
| Sprung (Beobachtung) | 8 K je 15 min | gemessen: p99,9 = 4,0 K, p99,99 = 24 K (Kippen defekter Sensoren); 38 „wäre verworfen" in 48 h |
| Nachbarn (Beobachtung) | ≤ 25 km, Höhenklasse 300 m, ≥ 3 Nachbarn, \|Δ\| > max(8·MAD, 8 K) | gemessen: 45 400 Fälle, 1,7 % markiert (k = 20 ⇒ 1,1 %, Rest sind defekte Anlagen) |
| Fahrbahn gegen eigene Luft (Beobachtung, V-AW-3) | < −12 K oder > +30 K | gemessen: p1 = −5,4 K, p99 = +16,2 K |
| Cube-Abgleich (Beobachtung) | \|Luft − T2m\| > 8 K | `set` (Plan); Referenz noch nicht angebunden (V-AW-1) |
| Slot: aktive Reihen | ≥ 23 − 3 | §2.7 |
| Slot: verworfener Anteil | ≤ 10 % | Plan; Replay: **p50 1,5 %, p95 1,7 %, max 2,9 %** |

Bilanz des Replays (192 Slots, 291 994 Stations-Slots, ≈ 11 500 Werte je Slot) — hart verworfen: `stateNoTemp`
17 950 · `stuck` 5 050 · `dwdSuspect` 4 707 · `limit` 2 422 · `dewAboveAir` 588 · `placeholder` 582 · `outsideDE`
190 · `gustBelowWind` 96 · `iceWarm` 32; beobachtet („wäre verworfen"): `catalog` 29 233 · `neighbours` 1 717 ·
`roadAir` 977 · `jump` 38. „Glätte gemessen" danach nur noch an 7 Stations-Slots in den ersten 6 h ohne Vorgeschichte.

### 2.11 Gate A

| Kriterium | Stand | Beleg |
|---|---|---|
| E-AW-1 bis E-AW-3 entschieden | ✓ (E-AW-2: BUFR, eigener Decoder) | §1.1, §2.2 |
| Codetabelle Fahrbahnzustand geklärt | ✓ 0–7, 15 fehlend, beide Deskriptoren | §2.4, DWD-PDF S. 7 |
| Autobahn-Anteil gezählt | ✓ 834 / 1 556 (53,6 %) | §2.6 |
| Startwerte der Schwellen aus dem 48-h-Fenster | ✓ | §2.10 |
| Stopp-Bedingungen | eine ausgelöst (Katalog > 10 %) ⇒ Rückfrage ⇒ E-AW-7; dazu E-AW-11 | §2.5, §2.9 |

**Gate A: bestanden (03.10.2026).**
