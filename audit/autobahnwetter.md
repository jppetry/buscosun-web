# Autobahnwetter — Phase AW: Diagnose, Protokoll, Gates

> Stand: 2026-10-03. Plan: `audit/autobahnwetter-plan.md` (bindend), Konzept/Datenlage: `audit/autobahnwetter-konzept.md`,
> UI-Vorgabe: `reference/autobahnwetter-*.dc.html` + `reference/README-autobahnwetter.md`.
> Arbeitszweig `feat/autobahnwetter` im Worktree `C:\dev\buscosun-web-aw` (eine parallele Sitzung arbeitet im
> Haupt-Arbeitsbaum auf `main`, §1.3).

## 0. Kurzfassung für Jan

- **AW-0 Spike (Gate A bestanden):** Rohformat BUFR mit eigenem Decoder (die QA-XML trägt keinen Fahrbahnzustand);
  drei Layouts, gegen eccodes 78 670 Werte ohne Abweichung; 23 aktive DWD-Reihen, Ankunft p90 139 s; 48-h-Replay der
  Regeln: hart verworfen p50 1,5 % / max 2,9 %. Zwei Rückfragen entschieden (E-AW-7 Katalog, E-AW-11 Eis-Codes).
- **AW-1–AW-3 auf `main`, Schattenbetrieb läuft:** Vertrag `road/v1`, Ableitung als Produkt des Radar-Spiegels, Wächter
  R1–R5. Seit 12:47 UTC schreibt der Spiegel je 15 min einen Slot; erster Live-Slot 13:30 UTC nach **235 s** im
  Daten-Repo, über jsDelivr lesbar, 1 546 Punkte, 1,5 % verworfen (§5).
- **AW-4/AW-5 seit 03.10. abends auf `main`** hinter `?road=1` (Flag aus): Kachel, Route, Deck nach der Vorlage
  (jede Abweichung benannt, §6.4). Edge-Bündel mit deinem Ja neu gebaut (**E-AW-14**), alle Gates grün (§11).
- **Gesamtprüfung durch einen frischen Reviewer:** 0 kritisch, 9 wichtig — alle behoben mit vorher roten Tests (§10);
  u. a. Zeitlimits für DWD im Radar-Spiegel (greift ab dem nächsten Jobstart ≈ 18:35 UTC) und Korridor-km, die 15–22 %
  zu lang waren.
- **E-AW-16 entschieden:** `health.yml` war unbenutzt und ist gelöscht — damit prüft kein Zeitplan mehr R1–R5 (§4.4).
- **AW-6a Tagesablage (§12, dein „ja mache"):** alle 3 h nach `buscosun-archiv` `road/v1/` — Verlauf und Quarantäne je
  Halbtag, Slot-Protokoll; ≈ 0,47 MB/Tag. Damit sammeln sich die Daten für Gate B und die Kalibrierung; der Job wird rot,
  wenn das Straßenwetter > 3 h steht.
- **Bitte entscheiden:** E-AW-13 (Voreinstellung der Messstelle), dann Gate B nach 7 Tagen Schatten (≈ 10.10.),
  Kalibrierung ≥ 14 Tage, Gate C (Flag an), AW-6 (Prognose). Einzelheiten: `MANUELLE-SCHRITTE.md` §34.

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

## 3. AW-1 Vertrag (`src/road/roadContract.ts`, `src/road/roadClasses.ts`)

Ein Vertrag für Producer, Client und Verifier — Muster `src/sources/radarImg.ts`. Er ist importfrei bis auf
`roadClasses.ts` und `roadFlag.ts` und läuft unverändert in Node (Kindprozess des Spiegels) und im Browser.

### 3.1 Ablage `road/v1/` im Daten-Repo

| Pfad | Inhalt | Schreiber | Aufbewahrung |
|---|---|---|---|
| `status.json` | Lebenszeichen des Spiegels: letzter Slot, letzter **freigegebener** Slot, Sperrgrund, Reihen, Bilanz, Katalog, letzte 24 Slots mit Zeiten | Spiegel bei jedem Push | eine Datei |
| `obs/<YYMMDDHHMM>.json` | die Punkte des Slots (nur bei grünem Slot-Gate) | Derive | 3 h, mindestens 2 |
| `h24/<Reihe>/<Slot>.json` | 24-h-Ring der Reihe (Fahrbahn, Luft, Taupunkt je Station, 96 Slots) — **je Slot unveränderlich** (E-AW-10) | Derive | 1 h, mindestens 2 je Reihe |
| `quarantine/<Slot>.json` | jeder verworfene und jeder „wäre verworfene" Wert mit Regel und Rohwert | Derive, immer | 24 h |
| `state.json` | Lauflängen, Vorwerte je Sensor (Producer-Zustand, vom Client nie gelesen) | Derive | eine Datei |
| `fc/` | leer, reserviert für AW-6 | — | 3 h |
| `static/stations.json` | DWD-Stationskatalog, umkodiert (§2.5) | `road-catalog.mjs`, täglich per ETag | eine Datei |
| `static/corridors.json` | 137 Korridore aus DLM250, 985 Stationszuordnungen (§4.5) | `build-corridors.mjs`, von Hand | eine Datei |

Veränderliche Dateien unter festem Pfad (`status.json`, `state.json`) liest der Client nie über jsDelivr: die Seite
fragt `obs/<Slot>.json` über den **erwarteten Slot-Pfad** an (wie die Radar-Bilder), der Wächter liest `status.json`
über raw.githubusercontent (Lehre „veränderliche Dateien nur `@<commit>`", §4.4).

### 3.2 Regeln

Harte Regeln wirken ab dem ersten Slot; statistische Regeln laufen im **Beobachtungsmodus** („wäre verworfen",
in der Quarantäne mit `mode: observe`) bis zur Kalibrierung nach ≥ 14 Tagen (Gate B).

| Regel | Ebene | Modus | Startwert | Herkunft |
|---|---|---|---|---|
| `limit` | Wert | hart | Fahrbahn −40…+75, Luft −40…+45 °C, Taupunkt −60…+45 °C, Feuchte 0–100 %, Wind/Böe 0–60 m/s, Wasserfilm 0–10 mm, Sicht 0–100 km | `set` (Plan) |
| `placeholder` | Wert | hart | < −60 °C | Plan, gemessen −75,00 |
| `dewAboveAir` | Wert | hart | Taupunkt > Luft + 0,5 K | `set` |
| `gustBelowWind` | Wert | hart | Böe < Mittelwind | Plan |
| `dwdSuspect` | Wert | hart | DWD-Bits 3/4/5/6/7/14/15/18/19/21 je Feld (§2.9) | WMO-No. 306 |
| `stuck` | Wert | hart | 24 gleiche Werte je Sensorposition, Lücken ≤ 4 Slots neutral, Tauplateau ausgenommen | Plan + §2.9 |
| `stateNoTemp`, `iceWarm` | Wert | hart | Zustand/Film nur mit gültiger Fahrbahn desselben Sensors; Eis-Code nur ≤ +3 °C | **E-AW-11** |
| `outsideDE`, `time` | Station | hart | Koordinaten in DE (1,5 km Toleranz); Messzeit ≤ Slot + 5 min und ≤ 3 h alt | Plan |
| `jump` | Wert | Beobachtung | 8 K je 15 min | §2.10 |
| `roadAir` | Wert | Beobachtung | Fahrbahn − Luft < −12 K oder > +30 K | V-AW-3 |
| `neighbours` | Station | Beobachtung | ≤ 25 km, Höhenklasse 300 m, ≥ 3 Nachbarn, \|Δ\| > max(8·MAD, 8 K) | §2.10 |
| `catalog` | Station | Beobachtung | keine Katalogzeile ⇒ Kennzeichen `noCatalog` | **E-AW-7** |
| `cube` | Station | Beobachtung | \|Luft − T2m\| > 8 K — **Referenz noch nicht angebunden** (V-AW-1) | `set` |
| `spread`, `duplicate`, `unknownCode` | Station/Wert | Kennzeichen | > 5 K Spanne; jüngere Messung zählt; Code 8–14 ⇒ „unbekannt" | Plan |
| `slotGroups`, `slotShare`, `slotSchema` | Slot | hart | ≥ 23 − 3 regelmäßige Reihen (SD-BW sporadisch, zählt nicht); ≤ 10 % hart verworfen; geschriebene Datei besteht `parseRoadObs` + Rundweg | Plan, §2.7 |

Ein roter Slot wird **nicht veröffentlicht** (`obs/` und `h24/` bleiben beim letzten guten Slot), Quarantäne und
`status.json` nennen den Grund. Herkunft je Wert: `ok` nur, wenn der DWD geprüft und nichts gefunden hat
(0 33 005 = 0), sonst `unchecked`; Abweichung von der Regel erscheint als `x.<Feld> = <Regel>` am Punkt.

### 3.3 Zeit und Frische

Slot = 15 min UTC. Der Client fragt den Slot `floor((jetzt − 10 min) / 15 min)` (`ROAD_OBS_GATE_MS`, `set`: deckt
p99 = 200 s der Ankunft plus Ableitung und Push) und geht bei 404 bis zu 4 Slots zurück. Älter als 45 min ⇒
„veraltet" (Topbar und Readout), älter als 3 h ⇒ „keine Messdaten" (nie die alte Messung als aktuell). CDN:
jsDelivr mit raw.githubusercontent als Ausweichweg nach 2,5 s (Muster NL-2/V-FI-5).

### 3.4 Klassen (E-AW-9) und „keine Daten ≠ trocken" (D-04)

| Klasse | Bedingung je Sensor | Farbe |
|---|---|---|
| Glätte gemessen (`ice`) | Zustandscode 3–6 (Reif, Schnee, Eis, Glätte) | `--aw-ice` |
| Frostgefahr (`frost`) | Fahrbahn ≤ +1 °C **und** (nass/feucht **oder** Fahrbahn ≤ Taupunkt) | `--aw-frost` |
| Nass (`wet`) | Code 1/2/7 oder Wasserfilm > 0 | `--aw-wet` |
| Trocken (`dry`) | **nur** mit Code 0 | `--aw-dry` |
| Zustand unbekannt (`unknown`) | Fahrbahn gemessen, Zustand fehlt/verworfen | schraffiert |
| keine gültige Messung (`nodata`) | nichts Gültiges | schraffiert |

Stationsklasse: kälteste plausible Fahrbahn, größter Film, schwerster Code (Rang Eis > Glätte > Schnee > Reif > nass >
nicht trocken > feucht > trocken). Der Client rechnet die Klasse aus den Werten exakt nach (`roadPointOk`) und
verwirft Punkte, deren Klasse nicht passt. Eine fehlende Messung erscheint **nie** grün: schraffiert in Karte, Band,
Dock, Badge und Tabelle (`verify:road-ui` F1–F3).

### 3.5 Flag und Kill-Schalter

`src/road/roadFlag.ts`: `ROAD_LIVE = false` (bis Gate C). Reihenfolge `?road=0|1` > `localStorage.road` > `ROAD_LIVE`.
Ohne Flag antwortet `/autobahnwetter` wie ein unbekannter Pfad, Kachel, Rail-Eintrag, ⌘K-Eintrag und Fußzeilen-Link
sind ausgeblendet. Producer-Seite `ROAD_KILL=1`: Slots ohne Punkte mit `killed: true`, `status.killSwitch`.

## 4. AW-2/AW-3 Producer und Spiegel

### 4.1 Decoder (`src/road/swisBufr.ts`)

Handgeschrieben (keine Abhängigkeit): Abschnitte 0–5, Edition 3 und 4, Tabellen B/D nur für die gebrauchten
Deskriptoren (DWD-Lokal 0 01 241 ff. aus der Vorlage 2015, WMO 3 07 102), Replikation verzögert und fest, Operatoren
2 01/2 02 (Breite/Skala, nur `swis-local-film01`), Strings Latin-1. Drei Layouts per Fingerabdruck der expandierten
Deskriptorliste; ein unbekannter Fingerabdruck ⇒ `BufrFormatError` ⇒ Reihe `failed`. Gegen eccodes 2.47: 78 670 Werte,
0 Abweichungen (§2.3).

### 4.2 Ableitung (`scripts/road/road-derive.mjs`)

Kindprozess je Slot: Bulletins dekodieren → normalisieren (Straße `A095S` → `A95`/`S`, km aus dem Bulletin, bei 0 aus
dem Katalog) → `validateRoadSlot` mit dem Zustand der Vorslots → Klassen → atomar schreiben (tmp + rename):
Quarantäne und `state.json` immer, `obs/` und `h24/` nur bei grünem Gate; Zusammenfassung als letzte Zeile auf stdout.
`--plan` liefert die Vertragskonstanten an den Spiegel (der Spiegel läuft ohne TS-Lader).

### 4.3 Im Radar-Spiegel (E-AW-1, E-AW-8)

`scripts/road/road-mirror.mjs` (plain JS) — der Spiegel des Daten-Repos lädt es aus seinem buscosun-web-Klon
(`APP_DIR`) und ruft drei Haken: `seed()` beim Start, `poll()` in jeder Schleife, `copyInto()` in seinem heilenden
`publish()`. Je Slot: HEAD auf den **erwarteten** Bulletin-Pfad jeder Reihe alle 30 s, GET nur was da ist (≈ 23 Dateien,
159 KB), Ableitung sobald alle regelmäßigen Reihen da sind, spätestens Slot + 12 min (Rest `missing`). Beim Start holt
der Spiegel bis zu **96 Slots (24 h)** aus dem 48-h-Fenster des DWD nach (die `stuck`-Regel braucht 6 h Vorgeschichte),
ein Slot je Schleife, Push alle 8 Slots — der Radar-Takt bleibt unberührt. `publish()` kopiert den ganzen Speicher nach
`road/v1` (heilt die Force-Pushes von `build.yml`/`point.yml`) und nimmt `git add radar road`. Fehler im Straßenteil
werden geloggt, der Radar läuft weiter (`try/catch` um `poll()`). Seit `45f12dd` (Befund #1 der Gesamtprüfung, §10):
jede DWD-Anfrage mit Zeitlimit 8 s, höchstens 6 gleichzeitig, ein Durchlauf startet nach 10 s keine neuen Anfragen
mehr (der Rest kommt in der nächsten Schleife) — vorher liefen 23 Anfragen ohne Zeitlimit nacheinander in der
Radar-Schleife. Ein Nachfolge-Job übernimmt den Status des Vorgängers und leitet dessen letzten Slot nicht noch einmal
ab (Befund #2).

Höflichkeit gegen opendata.dwd.de: ≈ 23 HEAD je 30 s nur bis zur Ankunft (p50 31 s) bzw. bis zur Frist, danach
nichts bis zum nächsten Slot; GET nur einmal je Datei; Katalog einmal täglich per ETag.

Datei im Daten-Repo: `scripts/radar-mirror.mjs` (Kopie von `buscosun-web/scripts/radar-mirror/radar-mirror.mjs`,
+25/−2 Zeilen: Haken, `paths`) — gepusht `cb20f86`, die Korridor-Titel `bef7411` und `e9ef1f0`, die bereinigten
Korridor-Achsen `0e801f2` (§4.5, §10).

Klassenspalte und Exportform (E-AW-6, nur vorbereitet): der 24-h-Ring trägt seit `691113c` je Station `k`, die
Klasse je Slot als ein Zeichen (`i f w d u n`, `-` = kein Punkt) — ein Backtest der Glätte-Klassen braucht den
gemessenen Zustand, nicht nur Temperaturen. `scripts/road/road-export.mjs` schreibt aus den jüngsten Ringen und dem
jüngsten obs-Slot EIN Fenster von 96 Slots je Station (Reihe, Stammdaten, `rs/ta/td`, `k`) — ein täglicher Lauf wie
das Punktarchiv sähe aneinandergrenzende Fenster (Dedupe über Station + Slot). Kein Archiv, kein Cron (AW-6, Jans
Freigabe). Rohwerte verworfener Messungen stehen nur in `quarantine/` (24 h) — V-AW-11.

### 4.4 Betriebs-Wächter (`scripts/health-manifests.mjs`)

Der stündliche Wächter (`health.yml`, unverändert) prüft seit `2687a61`/`45f12dd`/`ef6d7af` (auf `main`) zusätzlich
`road/v1/status.json` über raw.githubusercontent: **R1** lesbar · **R2** die Straßen-Ableitung lebt (jüngster
abgeleiteter Slot ≤ 45 min — nicht `updatedAt`, das jeder Radar-Push erneuert) · **R3** letzter **freigegebener** Slot
≤ 45 min (Plan; danach zeigt die Seite „veraltet") · **R4** Katalog vorhanden · **R5** was jsDelivr ausliefert: der
jüngste freigegebene Slot, der ≥ 10 min alt und ≤ 2 h alt ist, über `@main` wie von der Seite gelesen (Produkt, Slot,
Punkte). Ein bewusst gesetzter Kill-Schalter ist grün und benannt. `ROAD_HEALTH=0` schaltet die Prüfung ab. Grenze und
Pfade sind eine Kopie aus dem Vertrag (der Wächter läuft ohne TS-Lader) — `verify:road-contract` F17 hält sie gleich.
`verify:health` **38/38** (vorher 20). Probelauf gegen Produktion 03.10. 13:39 UTC: R1–R4 grün, R5 „nicht geprüft"
(Nachholen), **H2/H3 von `latest-grib.json` rot — wie bei jedem Lauf seit September** (E-AW-16).

**Seit 03.10. abends ohne Zeitplan:** Jan hat `health.yml` als unbenutzt freigegeben, der Workflow ist gelöscht. Die
Prüfungen bleiben: `verify:health` (netzfrei, in `ci.yml`) und ein Handlauf
`node scripts/health-manifests.mjs --url https://buscosun.com` — am 03.10. 15:24 UTC R1–R5 grün (Slot 15:15 nach 7 min,
R5 1 550 Punkte über jsDelivr), H2/H3 rot wie seit September. Ein Straßenausfall fällt bis Gate C nur an
`status.json` und an der Seite auf (V-AW-19).

### 4.5 Korridore (`scripts/road/build-corridors.mjs`, E-AW-12)

BKG DLM250 per WFS (`objart_42003_l`, Widmung 1301, `bez` z. B. `E52#A8` — erster Entwurf verlor Straßen am `#`):
Segmente → Ketten (≤ 60 m) → Abschnitte (Lücken ≤ 3 km) → Douglas-Peucker 80 m → Richtung nach der deutschen
Nummerierung (ungerade N → S, gerade W → O) → Korridor-km ab 0 (unsere Achse, nicht der amtliche Betriebskilometer).
**Bereinigung der Achse (`removeLoops`, Befund #4, §10):** die gierige Verkettung lief auch über Rampen, Kleeblatt-
Schleifen und — bei Autobahnen mit zwei Fahrbahnlinien — hin auf der einen und zurück auf der anderen Fahrbahn; das
blähte Korridor-km um 15–22 % auf (A 8 München → Salzburg 161,3 statt ≈ 128 km, ETA am Ende ≈ 20 min falsch). Kommt
der Weg ≤ 50 m an einen ≥ 150 m früheren Punkt zurück, entscheidet eine Vorschau über 300 m: läuft er weiter über
Besuchtes (Gegenfahrbahn, Rampe zurück) ⇒ diese Punkte fallen weg; verlässt er es wieder (Schleife, Stichweg) ⇒ der
Abschnitt dazwischen wird geschnitten; endet eine Rückfahrt am Kettenanfang, wird die Linie umgedreht und fortgesetzt.
Neubau (`0e801f2`): Summe 16 088 → **13 143 km**, A 8 → **128,7 km**, Wiederkehrpunkte 2 138 → 3, Stationen 985 →
**980** (vier liegen auf Stichästen, V-AW-16), Kennungen und Titel unverändert. `verify:road-contract` K1–K5.
Stationen derselben Autobahn ≤ 2 km werden projiziert: **807 von 833** Autobahn-Anlagen. Endnamen aus GeoNames
(`public/fire/places-dach.json`), an der Grenze die nächste Stadt ≥ 20 000 Einwohner jenseits (≤ 15 km) — „München →
Salzburg"; beginnt und endet ein Abschnitt in derselben Gemeinde, heißt er „A 1 bei Buchholz in der Nordheide"
(17 Abschnitte). Nur Abschnitte mit Stationen: **137 Korridore auf 88 Autobahnen, 980 Zuordnungen** (Richtungs-
fahrbahnen getrennt), 262 KB. Lizenz: „© GeoBasis-DE / BKG (2026), dl-de/by-2.0" in Datei, README und Quellen-Reiter.
AT/CH-Fortsetzungen (GIP.at, OSM) und Prognosepunkte gehören zu AW-6.

## 5. Schattenbetrieb (ab 03.10.2026 12:47 UTC)

### 5.1 Start

Der Radar-Spiegel klont bei jedem Jobstart `main` von buscosun-web. Der Job `37123997416` (Start 12:47:10 UTC) war der
erste mit dem Straßenteil: `road: Start` beim Slot 02.10. 12:45 UTC (24 h Nachholen aus dem DWD-Fenster), Katalog per
ETag (`a681a1dd…`, unverändert) — kein Dispatch, kein Abbruch eines laufenden Jobs. Erster `status.json` auf
`origin/main` mit dem ersten Radar-Push des Jobs um 12:48:43 UTC.

**Nachholen:** 96 Slots in 46 min (12:47 → 13:33), ≈ 2 Slots je Minute, Straßen-Push alle 8 Slots. Belegt über 14
Stichproben des Fortschritts (alle 2 min) und die 24 Einträge von `status.recent`: jeder Slot **freigegeben**, `blocked`
nie gesetzt, 22–23 Reihen, 1 534–1 556 Punkte, hart verworfen **1,07–1,67 %** je Slot; in der Historie seit dem
Force-Push der Kartenlinie (13:07) 11 Straßen-Commits, keiner „(gesperrt)". Lückenlos für alle 96 ist es aus Git nicht
belegbar (Force-Push der Kartenlinie, Aufbewahrung `obs/` 3 h).
**Radar-Takt dabei unverändert:** RV-Komposit jeweils 3:43–3:58 min nach dem Slot auf `origin/main`, wie vorher
(12:23–12:48: 3:50–3:59) — DWD antwortete schnell; der Schutz gegen einen langsamen DWD kam danach (§10, #1).

### 5.2 Erste Live-Slots, Ende zu Ende (DWD → Ableitung → Daten-Repo → jsDelivr)

| Slot (UTC) | Reihen | Punkte | verworfen | letzte DWD-Datei | abgeleitet | Commit `origin/main` | nach Slotbeginn | jsDelivr (eine Anfrage ≥ 4 min nach dem Commit) |
|---|---|---|---|---|---|---|---|---|
| 13:30 | 23 | 1 546 | 1,54 % | 13:33:29 | 13:33:54 (576 ms) | 13:33:55 | **235 s** | 200 MISS 960 ms (später HIT 42 ms), 1 546 Punkte, Client-Prüfer 0 verworfen |
| 13:45 | 23 | 1 547 | 1,54 % | 13:48:12 | 13:48:14 (543 ms) | 13:48:15 | **195 s** | 200 MISS 356 ms, 1 547 / 0 |
| 14:00 | 23 | 1 548 | 1,54 % | 14:03:03 | 14:03:15 (553 ms) | 14:03:16 | **196 s** | 200 MISS 448 ms, 1 548 / 0 |
| 14:15 | 23 | 1 547 | 1,51 % | 14:18:04 | 14:18:33 (546 ms) | 14:18:34 | **214 s** | 200 MISS 517 ms, 1 547 / 0 |

Damit liegt jeder der ersten vier Live-Slots **3:15–3:55 min nach Slotbeginn** im Daten-Repo — gut vor dem Zeit-Gate
des Clients (Slot + 10 min) und der Producer-Frist (Slot + 12 min). Die Zeit wird von der letzten DWD-Reihe bestimmt
(183–209 s, KK/SH wie im Spike §2.7); Ableitung 0,5–0,6 s, Push ≤ 25 s danach. jsDelivr wurde je Slot genau einmal und
erst ≥ 4 min nach dem Commit gefragt (keine früh festgesetzte 404).

Klassen im Slot 13:30: trocken 999 · nass 91 · Zustand unbekannt 82 · keine gültige Messung 374. Ring
`h24/FN-BY/2610031330.json`: 96 Slots, 160 Stationen, Klassenspalte `k` vorhanden. Bilanz harte Regeln (13:30):
`stateNoTemp` 102 · `dwdSuspect` 32 · `stuck` 26 · `limit` 8 · `placeholder` 3 · `dewAboveAir` 1 · `outsideDE` 1 (P758).

### 5.3 Daten-Repo und andere Jobs

`road/` überlebte zwei Force-Pushes von `point.yml` (10:41, 10:58 UTC) und den der Kartenlinie `build.yml` (13:07 UTC,
frische Historie) — die Publisher tragen unbekannte Ordner mit; nach 13:07 geprüft: README-Abschnitt, Haken in
`scripts/radar-mirror.mjs`, 204 Dateien unter `road/`, bereinigte Korridore.
README-Abschnitt und `scripts/radar-mirror.mjs` stehen auf `origin/main`. jsDelivr: `static/corridors.json` nach jedem
Push gepurgt und in beiden Kodierungen geprüft (A 8 = 128,7 km).

## 6. AW-4/AW-5 Kachel, Route, Seite (Zweig `feat/autobahnwetter`, hinter `?road=1`)

### 6.1 AW-4 Kachel und Routing

- `FeatureId` `road`, Route `/autobahnwetter` (Korridor als Pfadsegment `/autobahnwetter/a8`, Zustand in der Query:
  `st`, `t` (nur 0 bis AW-6), `dir`, `tab`; ungültige Werte fallen auf die Voreinstellung), Aliase `/strassenwetter` und `/glaette` (301 in `netlify.toml`), Rewrites auf die Shell.
- Shell aus `generate-seo.mjs` mit `noindex, follow`, Titel „Autobahnwetter — Glätte und Fahrbahnzustand",
  Kanonik `https://buscosun.com/autobahnwetter`, **kein** Sitemap-Eintrag bis Gate C (Ruling: eine Seite, die ohne
  Flag 404 antwortet, gehört nicht in die Sitemap). Die Texte der 20 Autobahn-Unterseiten (E-AW-4) liegen fertig in
  `src/road/roadSeo.ts` (lazy) — in der eager geladenen Routentabelle kosteten sie +0,5 KB eagerJs (V-AW-8, Gate C).
- Kachel 11 am Ende des Bento-Rasters in voller Breite (E-AW-5, keine Änderung an `SearchPage.css`), ⌘K-Eintrag,
  Fußzeilen-Link, Rail-Eintrag — alle nur mit Flag (`toolTileCount()` = 10 ohne, 11 mit). Die Kachel lädt keine
  Daten. Text: „11 · Autobahnwetter — Ist die Strecke glatt? Fahrbahntemperatur und -zustand von rund 1.200
  Glättemeldeanlagen des DWD, alle 15 Minuten — je Autobahn als Streckenband. Kein amtliches Warnprodukt. Österreich
  und die Schweiz ohne offene Fahrbahnmessung."; **ohne** Prognose-Versprechen (AW-6 ist nicht gebaut). „Rund 1.200"
  = 1 192 Anlagen mit gültiger Fahrbahntemperatur im Spike-Slot (§2.5).
- Ohne Flag antwortet die Route wie ein unbekannter Pfad (`verify:road-ui` A1).

### 6.2 AW-5 Seite (`src/road/`)

| Datei | Rolle |
|---|---|
| `RoadPage.tsx` | Zustand (URL, Slot, Ring, Warnungen), 60-s-Takt, Desktop-Raster und Mobil-Ansicht (Pille → Auswahl, Blatt in zwei Stufen) |
| `RoadMap.tsx` | MapLibre, dunkler Stil (OpenFreeMap, deutsche Beschriftung), Korridor-Glow, Messpunkte als Canvas-Bilder (schraffiert für unbekannt/keine Messung), Werte, Warnflächen, Nebel-Ebene, Callout; `setData` nur bei geänderter Referenz (Lehre 3) |
| `RoadBand.tsx` | Streckenband: Punkte je Station, Balken mit Klassen, Lücken > 10 km schraffiert, km-Skala, Grenzmarke |
| `RoadDock.tsx` | Suche, Land, Autobahnliste mit Status, Ebenen (inkl. B/L-Straßen, E-AW-3), blockierte Quelle, Datenlage je Land, Lücken-Hinweis |
| `RoadReadout.tsx` | Reiter Station (Messwerte, Hinweis für Fahrer, Verlauf 24 h, Kacheln „Prognose folgt", Warnungen wörtlich) · Strecke (Abfahrt, ETA je Messpunkt, Briefing) · Quellen (aktiv/geplant/blockiert) |
| `roadClient.ts`, `roadView.ts`, `roadState.ts` | Abruf mit Ausweichweg, Ansichtsrechnungen, URL-Zustand |
| `roadDeck.css` | Command-Deck (D-27), Tokens `--aw-*`, Breakpoints nur 767/1439 |

Zustände: live · veraltet (> 45 min, Topbar und Readout) · keine Messdaten (> 3 h oder alle Slots 404) ·
Kill-Schalter · Korridore nicht ladbar (Punkte erscheinen trotzdem) · Warnungen nicht abrufbar („kein Ersatztext").
Amtliche Warnungen: DWD-CAP über die vorhandenen Leser (`src/sources/dwdCapAlerts`, `src/warnings/warnField`, lazy
nur mit der Ebene „Amtliche Warnungen"), am gewählten Punkt per Polygon-Test, Überschrift und Text **wörtlich in
Anführungszeichen**, gültig von/bis, Quelle. Abgeleitete Werte gibt es noch keine; Zeitchips +1/+3/+6 h und die
Prognose-Kacheln sind gesperrt („Prognose folgt", Gate D).

### 6.3 Prüfung im Browser (`verify:road-ui`, 36/36 nach §10)

Headless Chromium (SwiftShader für MapLibre) gegen `vite preview` des Builds; Daten = der eingefrorene Slot
03.10. 08:00 UTC, durch den **echten** Producer (`road-derive.mjs`) abgeleitet und per Abfang-Regel für jsDelivr und
raw ausgeliefert; Uhr der Seite auf den Slot gestellt. A Flag-Tor · B Maße 62/60/250/400, Band über dem Kartenfuß,
Grenzbeschriftung verdeckt keinen Punkt (B3) · C Voreinstellung A 8, 30 Punkte, Topbar · D Auswahl, URL, Richtung,
Reiter · E Zeitchips · F schraffiert statt trocken, Readout-Kopf nur bei fehlendem Wert „keine gültige Messung" (F3),
jüngster Wert im Verlauf sichtbar (F4) · G keine Daten, Kill-Schalter, veraltet, tot · H Mobil 390 × 844: Pille,
Teilen 44 px, Chips, Blatt, **jeder sichtbare Knopf ≥ 44 px**, Autobahn-Auswahl · I Konsole ohne Fehler.
B3, F3 und F4 kamen nach der Sichtprüfung der Aufnahmen dazu und waren am alten Build **rot** (11 verdeckte
Punkte; „keine gültige Messung" über +16,0 °C; leeres Diagramm bei einem Slot im Ring).

### 6.4 Abweichungen von der Vorlage (`scripts/road-ui-diff.mjs`, Belege `audit/autobahnwetter/ui/`)

Pixelvergleich gegen die gerenderten `reference/autobahnwetter-*.dc.html` (|ΔRGB| > 12): **Desktop 33,2 %**
(Rail 9,3 · Topbar 6,5 · Dock 33,7 · Karte 50,9 · Band 15,2 · Readout 24,1; finaler Build nach §10 — die Dock-Zeilen tragen
jetzt „ohne Zustand“ getrennt von „ohne Messung“), **Mobil 50,1 %** (Pille 15,5 · Teilen
14,7 · Chips 21,4 · Karte 62,4 · Blatt 43,4). Die Vorlage zeichnet eine SVG-Karte und Beispielwerte (06:15, Glätte
am Irschenberg), die Seite eine echte Karte und den Slot 10:00 bei +16 °C — Karte, Werte und Farben weichen daher
bauartbedingt ab. Benannt je Modul:

| Modul | Abweichung | Grund |
|---|---|---|
| Rail | geteilte `FeatureRail` statt Teilmenge der Vorlage; Marke buscosun | Funktionserhalt, ein Rail für alle Decks |
| Topbar | „Messung 10:00 · 23 von 23 DWD-Reihen" statt „22 von 30 DWD-Ordnern · Beispieldaten" | Reihen sind die Einheit des Vertrags (§2.1) |
| Dock | Korridore aus Daten (13 statt 10 Zeilen in „Alle"), AT/CH-Zeilen „keine offene Fahrbahnmessung · Prognosepunkte folgen", Ebene „Bundes- und Landesstraßen" zusätzlich, keine Radar-Ebene | E-AW-3; AW-6 nicht gebaut; Radar-Overlay nicht Teil des Plans für AW-5 |
| Karte | MapLibre statt SVG; kein Legendeneintrag „Prognosepunkt AT/CH"; schraffiert = „Zustand unbekannt / keine Messung" | AW-6; D-04 |
| Band | eigene Zeile für die Grenzbeschriftung (+10 px), Beschriftung kurz („DE \| AT"), keine Prognose-Schraffur | B3; AW-6 |
| Readout | „Verlauf 24 h" ohne „+6 h"-Linien, Kacheln +1/+3/+6 h „Prognose folgt", Badge „Zustand unbekannt" schraffiert | Gate D; D-04 |
| Mobil | Pille öffnet die Autobahn-Auswahl (Vorlage: Chevron ohne Ziel), Blatt in zwei Stufen (414 px / offen), „Abfahrt" als zweiter Knopf | Bedienbarkeit, Touch ≥ 44 px |
| Kachel | ohne Prognose-Versprechen, „rund 1.200" statt Beispielzahl | §6.1 |

Voreingestellte Messstelle ist die **kälteste gemessene Fahrbahn** des Korridors, sonst seine erste Station
(`RoadPage.tsx`; im Beispiel Schweinbach +16,0 °C, Zustand unbekannt). Die Vorlage zeigt die kritischste Stelle —
Entscheidung E-AW-13 (§9). *(Erste Fassung dieses Absatzes beschrieb das Verhalten falsch; Befund der Gesamtprüfung.)*

### 6.5 Fünf Selbstverifikations-Fragen (Gate AW-4/AW-5)

1. **Funktionserhalt:** keine bestehende Funktion entfernt oder versteckt. Geänderte geteilte Dateien: `App.tsx`
   (FeatureId), `routes.ts`/`router.tsx` (Eintrag, Lazy-Verweis), `SearchPage.tsx` (Kachel, Palette, Fußzeile — nur
   mit Flag), `featureRail.tsx` (Eintrag nur mit Flag), `netlify.toml` (Aliase, Rewrites). Beleg: `verify:routing`
   (Build) 252/252, `verify-seo` 803/803, `verify:fire-detail` 483/483, `verify:share` 527/528 (SH6, §6.7).
2. **Desktop pixelgleich:** ohne Flag Startseite, `/eventplanung` und `/wetterarchiv` bei 1440 × 900 und 390 × 844
   (DPR 3) gegen den Kontrollbau ohne AW-4/AW-5: **0 Pixel** Unterschied in allen sechs Aufnahmen; Gegenprobe mit
   `?road=1`: Startseite 58 468 px, Rail 331 px anders (die Messung kann rot werden).
3. **Touch-Ziele ≥ 44 px:** `verify:road-ui` H (jeder sichtbare Knopf der Mobil-Ansicht, Pille, Teilen, Auswahl).
4. **Konsole sauber:** `verify:road-ui` I — keine Ausnahme in allen Läufen (Desktop, Mobil, vier Zustände).
5. **Long Tasks > 200 ms:** in headless-shell nicht messbar (Werkzeugfalle, CLAUDE.md) — offen für Real-Device
   (V-AW-13). Die Rechnung je Slot ist klein (≈ 1 550 Punkte, eine `setData` je Quelle bei Änderung).

### 6.6 Budget

Kontrollbau (gleicher Baum ohne AW-4/AW-5) 108,6 / 1 517,5 KB gegen 108,9 / 1 538,9 KB (nach dem Fix-Durchgang §10:
1 539,3 KB, +0,4 KB für Warnungs-Erneuerung, Sichtmodell und `warnField` im Seiten-Chunk): RoadPage +18,6, RoadRoute
+1,45, roadFlag +0,26 (alle lazy), Startseite +0,33, Rail +0,10; eagerJs +0,3 KB (Routeneintrag, Lazy-Verweis).
Ratschen mit Notiz angehoben: eagerJs 108,7 → **109,0**, totalJs 1 518 → **1 540** (Jan 30.09.: anheben erlaubt).
Nach dem Merge von `main` (`5bb8af1`, Startseiten-Umbau RR/RI1 der parallelen Sitzung, `f9ea3d0`) neu gemessen:
Kontrollbau `main` 108,6 / 1 522,0 gegen den Zweig 108,9 / **1 543,9** = +0,3 / +21,9 KB ⇒ totalJs-Grenze 1 523 → **1 545**.
eagerCss bleibt 2,4: die `--aw-*`-Tokens stehen im lazy `roadDeck.css`, nicht in `designTokens.css` (erster
Entwurf hob eagerCss auf 2,5).

### 6.7 Warum AW-4/AW-5 noch nicht auf `main` liegen

`routes.ts` steckt im Bündel der Edge Function `og-meta` (`netlify/edge-shared/shareParser.js`, erzeugt von
`npm run edge:share`). Der neue Routeneintrag macht das eingecheckte Bündel alt ⇒ `verify:share` SH6 rot — und
`verify:share` läuft in der CI. Das Bündel neu zu schreiben ist eine Änderung an einer Edge Function (Jans Gate).
Vorbereitet: `audit/autobahnwetter/og-meta-bundle.patch` (+19 Zeilen, nur der Routeneintrag; `og-meta` läuft nur auf
den neun teilbaren Pfaden, `/autobahnwetter` gehört nicht dazu ⇒ **keine Laufzeitwirkung**). Danach ist `verify:share`
528/528 und der Zweig kann nach `main` (unsichtbar, Flag aus).

Gemessen (Bündel kurzzeitig mit LF wie in der CI, danach zurückgesetzt): Stand des Zweigs mit altem Bündel **527/528**
(SH6 rot durch den Routeneintrag), mit dem Patch **528/528**. Nebenbefund V-AW-15: in einem frischen Windows-Worktree
ist SH6 **immer** rot — `core.autocrlf=true` checkt das Bündel mit CRLF aus (904 CR), der Verifier vergleicht Byte für
Byte mit der LF-Ausgabe von esbuild; der Haupt-Arbeitsbaum hat das Bündel mit LF (0 CR) und ist deshalb grün. Auch
`main` (`691113c`, ohne AW-4) zeigt im Worktree 527/528 — inhaltlich ist das Bündel dort gleich (`diff
--strip-trailing-cr` leer).

## 7. Verbesserungen (V-AW, D-28)

| Nr. | Befund | Mehrwert für Jan | Umsetzungsskizze |
|---|---|---|---|
| V-AW-1 | Regel `cube` (Luft gegen T2m) läuft ohne Referenz | zweite, unabhängige Prüfung der Lufttemperatur — fängt Anlagen, die alle Nachbarn mitreißen | Ableitung liest stündlich die t1-Stufe des Punkt-Cubes an den ≈ 1 550 Positionen (eine Zelle je Station, gecacht), 14 Tage beobachten, dann entscheiden |
| V-AW-2 | „Verlauf 24 h" zeigt nur Temperaturen | man sieht, wann es nass oder glatt war, nicht nur wie kalt | Farbleiste unter dem Diagramm aus `k` (seit `691113c` im Ring), schraffiert für `u`/`n`/`-` |
| V-AW-3 | `roadAir` (Fahrbahn gegen eigene Luft) nur beobachtet | defekte Fahrbahnfühler früher erkennen | nach ≥ 14 Tagen Quantile aus der Quarantäne, dann hart (Gate B) |
| V-AW-4 | P758 „Am Moosfeld" (A 94) sendet Länge 0 | eine Anlage mehr an der A 94 | Position aus dem Katalog, wenn das Bulletin 0 meldet und die Katalogzeile passt; Herkunft `catalog` am Punkt — Datenänderung, Jans Entscheidung |
| V-AW-5 | Wasserfilm > 10 mm fast nur FN-BY/JO-SO (100, 72, 44 …) | Wasserfilm in Bayern und Sachsen nutzbar statt verworfen | Werte gegen den Zustandscode über Gate B legen; vermutlich Einheit 0,01 mm; beim DWD nachfragen; bis dahin `limit` |
| V-AW-6 | Taupunkt im 0,1-K-Raster hängt bei 65 Anlagen ≥ 6 h | weniger falsch verworfene Taupunkte (Frostgefahr hängt daran) | Stichprobe in Gate B; Option: `stuck` für den Taupunkt nur, wenn auch Luft und Feuchte hängen |
| V-AW-7 | Stationskatalog von 2020, 136 aktive Anlagen fehlen | Straßenklasse und km auch für neue Anlagen | DWD um eine aktuelle Liste bitten; bis dahin Position aus dem Bulletin (E-AW-7) |
| V-AW-8 | 20 Autobahn-Unterseiten (E-AW-4) nicht geschaltet | Suchmaschinen finden „A 8 Glätte" | `roadSeo.ts` als Lazy-Sub-Texte wie `subRouteTexts`, Sitemap-Einträge — mit Gate C |
| V-AW-9 | Ringautobahn heißt „A 10 bei Groß Kreutz", 1-Stations-Abschnitte (z. B. a1-3) | verständliche Namen, kürzere Liste | Namenstabelle für Ringe („Berliner Ring"); Abschnitte < 3 Stationen an den Nachbarabschnitt hängen oder im Dock einklappen |
| V-AW-10 | jeder Slot schreibt 23 Ring-Dateien (voll ≈ 1,7 MB) | kleineres Daten-Repo, weniger Push-Last | im Schattenbetrieb messen (§5); Option: Ring nur stündlich, `obs` bleibt 15 min |
| V-AW-11 | Rohwerte verworfener Messungen nur 24 h in `quarantine/` | Backtest der Regeln (Kalibrierung) über mehr als einen Tag | **erledigt 03.10. (AW-6a, §12):** die Halbtage im Archiv tragen jeden Quarantäne-Eintrag |
| V-AW-12 | `/autobahnwetter` liefert ohne Flag kurz die statische Shell, dann „nicht gefunden" | sauberer bis Gate C | Shell erst mit `ROAD_LIVE` erzeugen, oder Shell ohne Lead — klein, nur wenn gewünscht |
| V-AW-13 | Mobil-Karte (WebGL), Long Tasks, Touch nicht am Gerät geprüft | Sicherheit vor Gate C | Real-Device mit `?road=1` (scrcpy), Trace der ersten 10 s |
| V-AW-14 | Radar-Ebene der Vorlage („Niederschlag jetzt") nicht gebaut | Schauer an der Strecke sehen | RV-Bild des Spiegels als Bild-Quelle auf der Straßenkarte (Module der Wetterkarte), eigene Ebene im Dock |
| V-AW-15 | `verify:share` SH6 ist in jedem frischen Windows-Checkout rot (CRLF durch `autocrlf`, Vergleich Byte für Byte) | ein Verifier, der nur auf einer Maschine grün ist, verdeckt echte Fehler | `.gitattributes`: `netlify/edge-shared/*.js text eol=lf` (dann ist der Checkout überall LF) oder im Verifier Zeilenenden vor dem Vergleich angleichen |
| V-AW-16 | Stichäste einer Autobahn fallen bei der Bereinigung aus der Achse — 4 Stationen ohne Korridor (Larrelt A 31, AD Bayerisches Vogtland A 72, Fürth A 73, AD Hochfranken A 93) | auch diese Anlagen im Streckenband | Äste ≥ 2 km als eigene Abschnitte behalten (eigene Kennung `a31-x`), statt sie abzuschneiden; die Stationen erscheinen bis dahin als Kartenpunkt |
| V-AW-17 | `health.yml` schlägt seit September bei jedem Lauf fehl (H2/H3 `latest-grib.json` ≈ 700 h alt) | ein immer roter Wächter meldet keinen echten Ausfall — auch nicht den des Straßenwetters | E-AW-16 |
| V-AW-18 | Tauplateau-Ausnahme der `stuck`-Regel (Fahrbahn −10…0 °C bei Luft ±10 K) deckt den Großteil des Winters — ein bei −0,01 °C hängender Fühler (Muster K677) würde im Winter nie verworfen und zeigte bei Nässe „Frostgefahr" | weniger falsche Frost-Warnfarbe im Winter | in Gate B kalibrieren: Plateau nur, wenn auch die Luft sich bewegt, oder Ausnahme auf 12 h begrenzen (Hinweis der Gesamtprüfung) |
| V-AW-19 | Seit dem Löschen von `health.yml` (E-AW-16) prüft kein Zeitplan mehr, ob die Straßen-Ableitung lebt (R1–R5) | ein Ausfall des Straßenwetters fällt auf, bevor Nutzer ihn sehen — spätestens ab Gate C nötig | **teilweise seit 03.10. (AW-6a):** der Archiv-Job (alle 3 h) wird rot, wenn der jüngste Ring > 180 min alt ist — grob, aber mit Zeitplan; feiner (45 min, CDN) nur mit eigenem Workflow `ROAD_HEALTH` ohne die H-Prüfungen, Handlauf §4.4 |

## 8. Verifier (Stand Zweig nach dem Fix-Durchgang, gelaufen 03.10. 13:50–14:10 UTC, PowerShell, ohne `2>&1`)

| Verifier | Ergebnis | Inhalt |
|---|---|---|
| `verify:road-decode` | **15/15** | Decoder gegen den eccodes-Fixture (24 Bulletins, 78 670 Werte), drei Layouts, Latin-1, rechtsbündige Strings, Fehlerfälle |
| `verify:road-contract` | **64/64** | Regeln B (Werte), C (hängend, Plateau, Sprung über Slots), D (Station), E (Slot-Sperre), F (Klassen, Client-Prüfer, Frische, Zeit-Gate, Flag, Ring-Prüfer, Wächter-Grenzen F17), K1–K5 Korridor-Bereinigung |
| `verify:road-derive` | **31/31** | Spiegel-Haken im echten `radar-mirror.mjs`, Bare-Repo + Klon + nachgebauter DWD: erste Slots, Sperre, Heilung nach Force-Push, Aufbewahrung, atomares Schreiben, von Hand gepushte Korridore, Klassenspalte + Export (H1–H5), Job-Naht und hängender DWD (I1–I4) |
| `verify:road-ui` | **36/36** | §6.3; dazu V1–V3, W1–W2, D5, M1–M4 aus der Gesamtprüfung (alle am alten Build rot) |
| `verify:health` | **38/38** | Warm-Manifeste wie bisher (20) + R1–R5 mit Negativkontrollen (18) |
| `npm run build` | grün | `verify-seo` 803/803, `verify-routing` **252/252** (vorher 249, +3 AW-Prüfungen) |
| `npm run budget` | grün | eagerJs 108,9 / 109,0 · eagerCss 2,4 / 2,5 · largestChunk 278,4 / 302 · totalJs 1 543,9 / 1 545 (nach dem Merge von `main`) |
| `npm run typecheck` | 0 Fehler | |
| `verify:fire-detail` | 483/483 | liest `designTokens.css` (unverändert) |
| `verify:fire-behoerden` | 100/100 | liest `netlify.toml` |
| `verify:dashboard-switch` | 50/50 (12:25 UTC) · 49/50 (13:55 UTC) | Router, Startseite, Karte ⇄ Dashboard im Browser. Um 13:55 rot: (B) „kein GPU-Render-Loop hinter dem Dashboard" — 3 900 Draws in 3 s; **am Kontrollbau ohne AW-4/AW-5 identisch** (49/50, gleiche Zahl) ⇒ unabhängig von dieser Phase, zeit-/datenabhängig; Beobachtung für die Dashboard-Linie (§10.4) |
| `verify:share` | **528/528** (nach E-AW-14, §11) | vorher 527/528: ✗ SH6 „Edge-Bündel passt Byte für Byte zur Quelle" — durch den Routeneintrag (mit LF-Bündel gemessen); V-AW-15 (§6.7) |
| Startseite/Rail ohne Flag | 0 px Unterschied in 6 Aufnahmen | Gegenprobe mit Flag 58 468 / 331 px (§6.5); nach dem Merge von `main` wiederholt mit eingefrorenen Animationen (die neuen Glyphen laufen ohne Reduced-Motion-Ausnahme — ohne Einfrieren 2 537 px Rauschen zwischen zwei Aufnahmen desselben Builds): 0 px in allen 6, Gegenprobe 75 219 / 331 px |

Producer-Commit `691113c` vor dem Push im sauberen Worktree (Stand `a2bb63a` + nur diese Dateien): typecheck 0,
`verify:road-decode` 15/15, `verify:road-contract` 58/58, `verify:road-derive` 27/27, `verify:health` 20/20, Build
249/249, Budget unverändert (totalJs 1 517,5 — kein App-Chunk importiert die Module).

## 9. Offene Entscheidungen und Jans Gates

| Nr. | Frage | Vorschlag |
|---|---|---|
| **E-AW-13** | Voreingestellte Messstelle: heute die **kälteste gemessene Fahrbahn** (eine gemessene Glätte an einer wärmeren Stelle stünde dahinter); die Vorlage zeigt die kritischste Stelle | kritischste Klasse zuerst (Glätte, Frost, Nässe), bei Gleichstand die kälteste — eine Zeile in `RoadPage.tsx` |
| ~~E-AW-14~~ | Bündel der Edge Function `og-meta` neu schreiben | **entschieden 03.10. (Jan): ja** — `npm run edge:share`, Ergebnis Zeile für Zeile gleich dem Patch, AW-4/AW-5 auf `main` (§11) |
| **E-AW-15** | Vorschaukarte (Open Graph) für `/autobahnwetter` je Korridor | mit Gate C: `og-meta` um die Route erweitern, eine Karte „Autobahnwetter" (Stufe 1 wie SH6) |
| ~~E-AW-16~~ | `health.yml` ist seit September dauerhaft rot | **entschieden 03.10. (Jan): „wird nicht mehr verwendet und kann gelöscht werden"** — gelöscht; Folge V-AW-19 (§4.4) |

## 10. Gesamtprüfung des Zweigs (frischer Reviewer) und Fix-Durchgang

Nach AW-5 hat ein frischer Reviewer (eigener Kontext, nur lesend) den ganzen Zweig `07cc7cf..5999694` gegen Plan,
Audit und CLAUDE.md geprüft: **keine kritischen Befunde, neun wichtige, sechzehn kleine.** Die wichtigen sind alle in
einem Durchgang behoben, jeder mit einem Test, der vorher rot war:

| # | Befund | Wirkung für Nutzer/Betrieb | Behebung | Test (rot → grün) | Commit |
|---|---|---|---|---|---|
| 1 | DWD-Abrufe ohne Zeitlimit, nacheinander, in der Radar-Schleife | ein langsamer DWD hätte den Radar-Spiegel minutenlang angehalten (RV später als das 240-s-Gate) | Zeitlimit 8 s, 6 parallel, 10-s-Budget je Durchlauf | `verify:road-derive` I3/I4 (vorher Abbruch nach 6 s) | `45f12dd` (main) |
| 2 | Status nach einer Job-Naht leer | Wächter rot bei jeder Naht (≈ 1 Fehlmail am Tag), letzter Slot doppelt abgeleitet | Status übernehmen, nächster Slot statt letzter | I1/I2 | `45f12dd` |
| 3 | Wächter maß Radar- statt Straßen-Lebendigkeit, 3 h statt 45 min, kein CDN | Straßenausfall bis 3 h unbemerkt | R2 = Ableitung, R3 = 45 min, R5 = jsDelivr | `verify:health` R2/R3/R5 | `45f12dd`, `ef6d7af` |
| 4 | Schleifen/Rückfahrten in den Korridor-Achsen | Korridor-km +15–22 %, ETA bis ≈ 20 min falsch | `removeLoops` (Rückfahrt verwerfen, Schleife schneiden, am Anfang umdrehen) | `verify:road-contract` K1–K5 | `45f12dd`, Daten `0e801f2` |
| 5 | Korridorwahl bewegte die Karte nicht | Dock-Klick ohne sichtbare Wirkung | Anpassen nach `load`, nicht nach `map.loaded()` | `verify:road-ui` M3 | `31d055e` (Zweig) |
| 6 | Zurück-Taste änderte nur die URL | geteilter Link ≠ Anzeige | POP übergibt den URL-Zustand an die Seite | M4 | `31d055e` |
| 7 | Dock-Punkt „trocken" über 29 unbekannten Stationen | D-04 verletzt | Punkt nur trocken, wenn mehr trocken als unbekannt; „ohne Zustand" ≠ „ohne Messung" | V1–V3 | `31d055e` |
| 8 | Warnungen nie erneuert | abgelaufene Warnung bleibt stehen | alle 5 min neu, beim Zeichnen nach der Uhr gefiltert, Link zum DWD bei Fehler | W1/W2, M2 | `31d055e` |
| 9 | GeoNames ohne Nachweis, DWD-Zeile nicht in der API-§7-Form | Lizenzauflage | Quellen-Zeile GeoNames, „Datenbasis: Deutscher Wetterdienst …" | D5, M1 | `31d055e` |

### 10.1 Was beim Beheben selbst auffiel

- **#4, erster Ansatz verworfen:** eine Richtungsregel („Punkt gegen die Fahrtrichtung der letzten 200 m ⇒ weg")
  bestand die synthetischen Tests, hätte an echten Daten aber 70 % der Stationen aus den Korridoren genommen
  (A 3: 930 → 49 km, 985 → 296 Stationen) — die Ketten laufen nicht sauber vorwärts. Reines Schleifen-Schneiden kürzte
  bei Rückfahrten die **Hinfahrt** (A 602: 23,7 → 5,3 km). Die Vorschau-Regel unterscheidet beides; geprüft an allen 137
  Korridoren, nicht nur an Testfällen.
- **M2 lief bisher gegen den echten DWD-Feed:** die Seite holt Warnungen über den eigenen Proxy-Pfad, und der
  Service Worker der App beantwortete die Anfrage, bevor die Abfang-Regel des Tests sie sah. `verify:road-ui` umgeht den
  Service Worker jetzt per CDP.
- **R5 im Probelauf gegen Produktion:** beim Nachholen fragte R5 einen längst aufgeräumten Slot an (404) — R5 nimmt
  jetzt nur Slots ≤ 2 h (`ef6d7af`).
- **Doku-Fehler:** §6.4 und E-AW-13 beschrieben die Voreinstellung der Messstelle falsch (Code: kälteste gemessene
  Fahrbahn) — korrigiert.

### 10.2 Wirksamkeit auf dem laufenden Betrieb

Die Producer-Fixes liegen auf `main` (`45f12dd`, `ef6d7af`); der Radar-Spiegel lädt sie erst beim **nächsten Jobstart**
(≈ 18:35 UTC). Den laufenden Job breche ich nicht ab (Startprompt §2). Bis dahin läuft der Stand `691113c` — mit dem
Risiko #1 bei einem langsamen DWD (heute gemessen: RV-Takt unverändert).

### 10.3 Aufgeschoben (kleine Befunde, Ledger)

Rückschritt nur 4 Slots (ein frischer Aufruf sieht „veraltet" nie, nur „keine Messdaten" nach ≈ 75 min) · Client-Gate
10 min vor der Producer-Frist 12 min (kurze 404 am Edge bei späten Reihen) · ein Refresh kann einen älteren Slot zeigen
· „veraltet" nur auf der Karte, nicht in Band/Dock/Badge · Stationsklasse „trocken" kann einen kälteren Fühler mit
unbekanntem Zustand verdecken · ETA-Zeilen > +30 min zeigen die Klasse (liest sich wie Prognose) · Fingerabdruck vor dem
Expandieren prüfen, Fehlermeldung kürzen (ENOBUFS) · Ringe vor dem Schreiben durch `parseRoadH24` · Tippziele der
Kartenpunkte 10–15 px, Auswahl-Dialog ohne Fokusführung, Reiter ohne `aria-controls` · Tablet 768–1023 px eng · Erstanzeige
nicht gemessen, `dataAge.ts` nicht wiederverwendet, `'SD-BW'` hart kodiert · `corridors.json` über `@main` (nur durch
Purge sicher) · Flag `road=1` fällt bei der ersten Navigation aus der URL · keine Ladeanzeige, „invalid" mit falschem
Text, `setData` je Render solange `corridors` fehlt. Planebene: Tauplateau (V-AW-18).

### 10.4 Beobachtungen außerhalb der Phase

- `health.yml` war seit September bei jedem Lauf rot (E-AW-16; am 03.10. gelöscht).
- `verify:dashboard-switch` (B) um 13:55 UTC auf beiden Builds rot (3 900 Draws hinter dem Dashboard), um 12:25 grün.
- `verify:share` SH6 in jedem frischen Windows-Worktree rot (V-AW-15).

## 11. Merge nach `main` (03.10. abends, Jans Freigabe)

Jan, 03.10.: „passt für mich so … health.yml wird auch nicht mehr verwendet und kann gelöscht werden … Kannst gerne auf
main mergen". Umgesetzt im Worktree auf dem Zweig, dann `main` vorgespult (kein Force, kein Rebase):

- `origin/main` (`5cafb93`, NP-0-Diagnose) in den Zweig gemergt — keine Überschneidung.
- **E-AW-14:** `npm run edge:share` schreibt `netlify/edge-shared/shareParser.js` (51,4 KB) neu; die Änderung ist Zeile
  für Zeile gleich dem vorbereiteten Patch (19 Zeilen, nur der Routeneintrag `autobahnwetter`).
- **E-AW-16:** `.github/workflows/health.yml` gelöscht. `scripts/health-manifests.mjs` und `verify:health` bleiben
  (CI-Selbsttest, Handlauf §4.4); Folge V-AW-19.

Gates am gemergten Stand: `npm run build` grün (`verify-routing` 252/252, `verify-seo` 803), typecheck 0, Budget
eagerJs 108,9 / 109,0 · totalJs 1 543,9 / 1 545, `verify:share` **528/528**, `verify:road-decode` 15/15,
`verify:road-contract` 64/64, `verify:road-derive` 31/31, `verify:road-ui` 36/36, `verify:health` 38/38,
`verify:fire-detail` 483/483, `verify:fire-behoerden` 100/100, `verify:dashboard-switch` 49/50 — (B) wie in §8 auch ohne
diese Phase rot. Für Nutzer ändert sich ohne `?road=1` nichts (§8, 0 px in 6 Aufnahmen); der Radar-Spiegel lädt mit dem
nächsten Jobstart denselben Producer-Code wie vorher (der Zweig ändert unter `scripts/` nur Verifier und Fixtures).

## 12. AW-6a — Tagesablage in `buscosun-archiv` (Jan 03.10.: „ja mache")

Nur die Ablage, keine Prognose, kein `fc/` (das bleibt AW-6).

### 12.1 Diagnose

- **Das Daten-Repo vergisst:** `quarantine/` hält 24 h (96 Dateien, am 03.10. 15:30 UTC ältester Slot
  `2610021545`), der 24-h-Ring trägt 96 Slots, `status.json` `recent` die letzten **24 Slots = 6 h**, `obs/` 3 h; die
  Kartenlinie kappt die Git-Historie. Älter als 24 h gibt es nichts.
- **Folge für die Gates:** Gate B (≈ 10.10.) misst „Anteil freigegebener Slots, Ankunft gegen Frist" über 7 Tage, die
  Kalibrierung (≈ 17.10.) die Beobachtungsregeln über ≥ 14 Tage — beides läge ohne Ablage nur für 6 bzw. 24 h vor.
- **Größe, gemessen am Stand 03.10. 15:30 UTC:** Ringfenster (`road-export.mjs`, 1 313 Stationen, 96 Slots) 2,1 MB roh /
  **376 KB gz**; die 96 Quarantäne-Dateien 2,6 MB roh / **54 KB gz** (32 013 Einträge: catalog 14 940 beobachtet,
  stateNoTemp 9 131, dwdSuspect 2 591, stuck 2 463, neighbours 931 beobachtet, limit 707, roadAir 512 beobachtet, …) ⇒
  ≈ 0,43 MB/Tag ≈ **160 MB/Jahr**. Zum Vergleich: das Punktarchiv legt 10–18 MB je Tag ab.
- **Archiv-Repo:** Tagesordner `JJJJ-MM-TT/` im Wurzelverzeichnis + `index.json` (Punktarchiv, Cron 23:10 UTC,
  append-only, `GITHUB_TOKEN`); dessen Index liest nur Ordner `^\d{4}-\d{2}-\d{2}$` (`punktarchiv.mjs` Z. 383) — ein
  Unterbaum `road/` stört ihn nicht. Der Punktarchiv-Job checkt das ganze Repo aus; ein Straßen-Job darf das nicht
  (es wächst um ≈ 4–6 GB/Jahr) ⇒ sparse und ohne Blobs.

### 12.2 Plan

| Teil | Form |
|---|---|
| Takt | alle 3 h (`25 */3 * * *`) — `recent` (6 h) überlappt zweimal, die Quarantäne (24 h) achtmal; ein ausgefallener Lauf kostet nichts |
| `road/v1/<Tag>/<HH>.json.gz` | Halbtag (00 / 12 UTC, 48 Slots): je Station Stammdaten, `rs/ta/td` (0,1 °C, nur Werte nach den harten Regeln) und `k` aus den Ringen, dazu jeder Quarantäne-Eintrag der 48 Slots. Geschrieben, sobald der Halbtag zu ist (letzter Slot ≤ jüngster Ring); ein späterer Lauf füllt nur Lücken (verspätete Reihe) — eine Datei verliert nie einen Wert, unverändert ⇒ kein Schreiben |
| `road/v1/<Tag>/slots.json` | Slot-Protokoll aus `status.json` `recent` (freigegeben, Punkte, Anteil verworfen, Reihen, DWD-Ankunft, Ableitung) |
| `road/v1/index.json`, `README.md` | Tage, Halbtage, gefüllte Slots; README aus den Konstanten des Skripts |
| Code | `scripts/road/road-archive.mjs` (reine Merge-Funktionen + CLI), Vorlage `scripts/punktarchiv-repo/workflow-road-archiv.yml`, Verifier `verify:road-archive` |
| Lebenszeichen (V-AW-19) | der Job wird nach dem Commit rot, wenn der jüngste Ring > 3 h alt ist und kein Kill-Schalter gesetzt ist — sonst grün; eine Zeile, entfernbar |
| Erster Lauf | lokal, sofort (sichert die 24 h ab `2610021545`), danach der Cron |

### 12.3 Umsetzung und Gates

- `scripts/road/road-archive.mjs`: reine Funktionen `buildHalfDays` (nur geschlossene Halbtage), `mergeHalfDay` (füllt
  nur Lücken, überschreibt nie, unverändert ⇒ kein Schreiben), `mergeSlotLog` (neu abgeleiteter Slot = späteres
  `derivedAt` ersetzt), `archiveReadme` (README aus den Konstanten); CLI `archiveRoad` schreibt atomar, bricht bei einer
  unlesbaren Archivdatei ab statt sie zu überschreiben, Exit 3 bei Ring > 180 min ohne Kill-Schalter.
- `scripts/road/road-mirror.mjs`: `ROAD_RECENT_SLOTS = 24` als Konstante; ein **gesperrter** Slot trägt im Slot-Protokoll
  `reasons` (für Gate B aus dem Archiv) — wirksam ab dem nächsten Spiegel-Job, sonst unverändert.
- Vorlage `scripts/punktarchiv-repo/workflow-road-archiv.yml` → `.github/workflows/road-archiv.yml` im Archiv-Repo.
- `verify:road-archive` **26/26** (A Halbtage/Merge/IO/Lebenszeichen/Punktarchiv daneben/README mit CRLF, B echter Producer am Slot
  03.10. 08:00: 1 293/1 293 Stationen mit gleichen Werten und Klasse, 149 Quarantäne-Einträge unverändert, C Vorlage
  gegen die Konstanten inkl. Importhülle im sparse-Muster). **Gegenproben:** acht eingebaute Fehler (offene Halbtage
  schreiben, Merge überschreibt, Lebenszeichen nie rot, kaputte Datei überschreiben, Takt 8 h, `--force`, sparse ohne
  `scripts/lib`, rot vor dem Commit) — jeder macht genau die zugehörige Prüfung rot. `verify:road-derive` **32/32** (neu
  C3 Sperrgrund im Slot-Protokoll; ohne die Spiegel-Änderung 31/32).
- **Probelauf gegen den echten Bestand** (03.10. 15:47 UTC, Fenster `2610021545…2610031530`): `2026-10-02/12.json.gz`
  173 KB (Teil ab 15:45, 1 308 Stationen, 10 757 Quarantäne-Einträge), `2026-10-03/00.json.gz` **236 KB** (1 313
  Stationen, 48/48 Slots, 16 041 Einträge), `slots.json` 6,6 KB ⇒ ≈ 0,47 MB/Tag ≈ 170 MB/Jahr.
- **Erster Lauf lokal** (03.10. ≈ 16:00 UTC, Fenster `2610021600…2610031545`) ins Archiv-Repo gepusht (`692915b`, kein
  Force): `2026-10-02/12.json.gz` 169 KB, `2026-10-03/00.json.gz` 236 KB, `slots.json`, Index, README und
  `.github/workflows/road-archiv.yml`. **Workflow-Schritte nachgespielt** (frischer sparse Klon ohne Blobs, App- und
  Daten-Klon wie im Workflow, ohne Push): Checkout 12 s, Archiv-Klon 0,5 MB, Lauf „unverändert" — dabei gefunden: eine
  README mit CRLF (Windows-Checkout) galt als geändert und stempelte den Index neu ⇒ Vergleich ohne `\r`, Test A17
  (vorher rot).
