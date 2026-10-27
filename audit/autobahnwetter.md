# Autobahnwetter — Phase AW: Diagnose, Protokoll, Gates

> Stand: 2026-10-13 (§19: AW-7/AW-8 Gefahren-Leiste und Detailansicht im Schatten, Zweig `feat/autobahnwetter-gefahren`; davor §18 vom 06.10.). Plan: `audit/autobahnwetter-plan.md` (bindend), Konzept/Datenlage: `audit/autobahnwetter-konzept.md`,
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
- **E-AW-13 entschieden:** Voreinstellung = kritischste Klasse zuerst, dann die kälteste Fahrbahn (§6.4).
- **Flag an für alle seit 03.10. abends (§13, dein „ja")** — vor Gate B/C; `?road=0` blendet je Besucher aus.
- **AW-6.1 Streckenprognose als Datenprodukt (§14, dein Auftrag 04.10.):** buscosun Fusion 8 stündlich an 2 766
  Achspunkten (alle 5 km, auf der OSM-Fahrbahn) und 1 658 Stationen, 0–48 h, in `buscosun-data/road/fc/v1/`; eigener
  Workflow `road-fc.yml`, Leser im Client, Ablage der Stationsprognosen im Archiv. Erster Lauf 4 424/4 424 Punkte; im
  Browser nachgerechnet (T/Td gleich). **Beim ersten Hand-Push stand das Daten-Repo 62 s auf einem alten Radar-/
  Straßen-Stand — sofort zurückgesetzt (§14.5).**
- **AW-6.1b Anzeige (§15, dein „mache das" 04.10.):** Die Seite zeigt die Wetterprognose — eine Zeile „Prognose Luft"
  im Streckenband (auch dort, wo keine Messstelle steht), Kacheln +1/+3/+6 h, gestrichelter Verlauf, Wetter zur
  Ankunft im Reiter Strecke; Prognosepunkte sind wählbar wie Stationen. Die Fahrbahn selbst hat weiter keine Prognose.
- **V-AW-21 Messungs-Anker (§16, dein „mach das" 04.10.):** gebaut und an acht Ausgabezeiten des 04.10. gemessen — mit
  der eigenen Luftmessung der Station ist die Prognose bei +1 h um 40 % genauer (1,31 → 0,79 K), bei +3 h um 12 %.
  **Nicht eingeschaltet:** meine vorab festgelegte Regel verlangt, dass kein einzelner Lauf schlechter wird; der Lauf
  mit der Messung um Sonnenaufgang ist es bei 3–6 h leicht (≈ 0,05 K). Einschalten = eine Zeile, deine Entscheidung
  (E-AW-30, Empfehlung: ja). Achspunkte zwischen Stationen gewinnen nicht und bleiben ohne Anker.
- **Nacht 05./06.10. (§18, Jans Auftrag):** E-AW-30 eingeschaltet (Stationen verankert) und V-AW-1, -2, -7, -9, -12, -14,
  -16, -22 … -29 umgesetzt, sieben Commits auf `main`, **nicht gepusht**; `verify:road-ui` 64/64 mit Aufnahmen in
  `audit/autobahnwetter/ui-0610/`. Dabei gefunden: **die Ablage der Streckenprognose im Archiv steht seit 05.10. 15:36 UTC
  still (V-AW-35, behoben — heilt mit dem Push)**. Neue Korridor-/Punktdateien als Paket für die Kopie ins Daten-Repo.
- **Als Nächstes:** Gate B nach 7 Tagen Schatten (≈ 10.10.), Kalibrierung ≥ 14 Tage (≈ 17.10.), Rest von Gate C (Gerät, Wächter, SEO, Vorschaukarte),
  Anzeige der Prognose (AW-6.1b), Fahrbahn-Prognose AW-6.2 (Gate D). Einzelheiten: `MANUELLE-SCHRITTE.md` §34.

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

Voreingestellte Messstelle seit E-AW-13 (Jan 03.10.): **kritischste gemessene Klasse zuerst** (Glätte vor Frostgefahr
vor Nässe), bei Gleichstand die kälteste Fahrbahn; ohne Warnklasse die kälteste gemessene Fahrbahn, ohne Messung die
erste Station (`defaultRoadStation` in `roadView.ts`). Im Fixture-Slot 03.10. 08:00 zeigt die A 8 damit Brunnthal S
(nass, +18,7 °C) statt Schweinbach (+16,0 °C, Zustand unbekannt) — wie die Vorlage die kritischste Stelle.
`verify:road-ui` V4/V5 (Regel) und C4 (Seite zeigt genau diese Station) waren vor der Umsetzung rot.

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
| V-AW-1 | Regel `cube` (Luft gegen T2m) läuft ohne Referenz | zweite, unabhängige Prüfung der Lufttemperatur — fängt Anlagen, die alle Nachbarn mitreißen | **erledigt 06.10. (§18):** Referenz = Stationsprognose aus `road/fc/v1` ohne Anker, Beobachtung läuft mit dem Push; ursprüngliche Skizze: Ableitung liest stündlich die t1-Stufe des Punkt-Cubes an den ≈ 1 550 Positionen (eine Zelle je Station, gecacht), 14 Tage beobachten, dann entscheiden |
| V-AW-2 | „Verlauf 24 h" zeigt nur Temperaturen | man sieht, wann es nass oder glatt war, nicht nur wie kalt | **erledigt 06.10. (§18):**  Farbleiste unter dem Diagramm aus `k` (seit `691113c` im Ring), schraffiert für `u`/`n`/`-` |
| V-AW-3 | `roadAir` (Fahrbahn gegen eigene Luft) nur beobachtet | defekte Fahrbahnfühler früher erkennen | nach ≥ 14 Tagen Quantile aus der Quarantäne, dann hart (Gate B) |
| V-AW-4 | P758 „Am Moosfeld" (A 94) sendet Länge 0 | eine Anlage mehr an der A 94 | Position aus dem Katalog, wenn das Bulletin 0 meldet und die Katalogzeile passt; Herkunft `catalog` am Punkt — Datenänderung, Jans Entscheidung |
| V-AW-5 | Wasserfilm > 10 mm fast nur FN-BY/JO-SO (100, 72, 44 …) | Wasserfilm in Bayern und Sachsen nutzbar statt verworfen | Werte gegen den Zustandscode über Gate B legen; vermutlich Einheit 0,01 mm; beim DWD nachfragen; bis dahin `limit` |
| V-AW-6 | Taupunkt im 0,1-K-Raster hängt bei 65 Anlagen ≥ 6 h | weniger falsch verworfene Taupunkte (Frostgefahr hängt daran) | Stichprobe in Gate B; Option: `stuck` für den Taupunkt nur, wenn auch Luft und Feuchte hängen |
| V-AW-7 | Stationskatalog von 2020, 136 aktive Anlagen fehlen | Straßenklasse und km auch für neue Anlagen | **erledigt 06.10. (§18):** Prognosepunkte für die 156 Anlagen ohne Katalogzeile; Anfrage an den DWD formuliert (§18.5). Skizze: DWD um eine aktuelle Liste bitten; bis dahin Position aus dem Bulletin (E-AW-7) |
| V-AW-8 | 20 Autobahn-Unterseiten (E-AW-4) nicht geschaltet | Suchmaschinen finden „A 8 Glätte" | `roadSeo.ts` als Lazy-Sub-Texte wie `subRouteTexts`, Sitemap-Einträge — mit Gate C |
| V-AW-9 | Ringautobahn heißt „A 10 bei Groß Kreutz", 1-Stations-Abschnitte (z. B. a1-3) | verständliche Namen, kürzere Liste | **erledigt 06.10. (§18):**  Namenstabelle für Ringe („Berliner Ring"); Abschnitte < 3 Stationen an den Nachbarabschnitt hängen oder im Dock einklappen |
| V-AW-10 | jeder Slot schreibt 23 Ring-Dateien (voll ≈ 1,7 MB) | kleineres Daten-Repo, weniger Push-Last | im Schattenbetrieb messen (§5); Option: Ring nur stündlich, `obs` bleibt 15 min |
| V-AW-11 | Rohwerte verworfener Messungen nur 24 h in `quarantine/` | Backtest der Regeln (Kalibrierung) über mehr als einen Tag | **erledigt 03.10. (AW-6a, §12):** die Halbtage im Archiv tragen jeden Quarantäne-Eintrag |
| V-AW-12 | `/autobahnwetter` liefert ohne Flag kurz die statische Shell, dann „nicht gefunden" | sauberer bis Gate C | **erledigt 06.10. (§18):** Inline-Skript leert die Shell bei Flag aus. Skizze: Shell erst mit `ROAD_LIVE` erzeugen, oder Shell ohne Lead — klein, nur wenn gewünscht |
| V-AW-13 | Mobil-Karte (WebGL), Long Tasks, Touch nicht am Gerät geprüft | Sicherheit vor Gate C | Real-Device mit `?road=1` (scrcpy), Trace der ersten 10 s |
| V-AW-14 | Radar-Ebene der Vorlage („Niederschlag jetzt") nicht gebaut | Schauer an der Strecke sehen | **erledigt 06.10. (§18):**  RV-Bild des Spiegels als Bild-Quelle auf der Straßenkarte (Module der Wetterkarte), eigene Ebene im Dock |
| V-AW-15 | `verify:share` SH6 ist in jedem frischen Windows-Checkout rot (CRLF durch `autocrlf`, Vergleich Byte für Byte) | ein Verifier, der nur auf einer Maschine grün ist, verdeckt echte Fehler | `.gitattributes`: `netlify/edge-shared/*.js text eol=lf` (dann ist der Checkout überall LF) oder im Verifier Zeilenenden vor dem Vergleich angleichen |
| V-AW-16 | **erledigt 06.10. (§18):** (Daten-Paket, Jans Kopie) Stichäste einer Autobahn fallen bei der Bereinigung aus der Achse — 4 Stationen ohne Korridor (Larrelt A 31, AD Bayerisches Vogtland A 72, Fürth A 73, AD Hochfranken A 93) | auch diese Anlagen im Streckenband | Äste ≥ 2 km als eigene Abschnitte behalten (eigene Kennung `a31-x`), statt sie abzuschneiden; die Stationen erscheinen bis dahin als Kartenpunkt |
| V-AW-17 | `health.yml` schlägt seit September bei jedem Lauf fehl (H2/H3 `latest-grib.json` ≈ 700 h alt) | ein immer roter Wächter meldet keinen echten Ausfall — auch nicht den des Straßenwetters | E-AW-16 |
| V-AW-18 | Tauplateau-Ausnahme der `stuck`-Regel (Fahrbahn −10…0 °C bei Luft ±10 K) deckt den Großteil des Winters — ein bei −0,01 °C hängender Fühler (Muster K677) würde im Winter nie verworfen und zeigte bei Nässe „Frostgefahr" | weniger falsche Frost-Warnfarbe im Winter | in Gate B kalibrieren: Plateau nur, wenn auch die Luft sich bewegt, oder Ausnahme auf 12 h begrenzen (Hinweis der Gesamtprüfung) |
| V-AW-19 | Seit dem Löschen von `health.yml` (E-AW-16) prüft kein Zeitplan mehr, ob die Straßen-Ableitung lebt (R1–R5) | ein Ausfall des Straßenwetters fällt auf, bevor Nutzer ihn sehen — spätestens ab Gate C nötig | **teilweise seit 03.10. (AW-6a):** der Archiv-Job (alle 3 h) wird rot, wenn der jüngste Ring > 180 min alt ist — grob, aber mit Zeitplan; feiner (45 min, CDN) nur mit eigenem Workflow `ROAD_HEALTH` ohne die H-Prüfungen, Handlauf §4.4 |

## 8. Verifier (Stand Zweig nach dem Fix-Durchgang, gelaufen 03.10. 13:50–14:10 UTC, PowerShell, ohne `2>&1`)

| Verifier | Ergebnis | Inhalt |
|---|---|---|
| `verify:road-decode` | **15/15** | Decoder gegen den eccodes-Fixture (24 Bulletins, 78 670 Werte), drei Layouts, Latin-1, rechtsbündige Strings, Fehlerfälle |
| `verify:road-contract` | **64/64** | Regeln B (Werte), C (hängend, Plateau, Sprung über Slots), D (Station), E (Slot-Sperre), F (Klassen, Client-Prüfer, Frische, Zeit-Gate, Flag, Ring-Prüfer, Wächter-Grenzen F17), K1–K5 Korridor-Bereinigung |
| `verify:road-derive` | **31/31** | Spiegel-Haken im echten `radar-mirror.mjs`, Bare-Repo + Klon + nachgebauter DWD: erste Slots, Sperre, Heilung nach Force-Push, Aufbewahrung, atomares Schreiben, von Hand gepushte Korridore, Klassenspalte + Export (H1–H5), Job-Naht und hängender DWD (I1–I4) |
| `verify:road-ui` | **39/39** (03.10. abends, +V4/V5/C4 E-AW-13) | §6.3; dazu V1–V3, W1–W2, D5, M1–M4 aus der Gesamtprüfung (alle am alten Build rot) |
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
| ~~E-AW-13~~ | Voreingestellte Messstelle | **entschieden 03.10. (Jan): wie vorgeschlagen** — kritischste Klasse zuerst (Glätte, Frost, Nässe), bei Gleichstand die kälteste (`defaultRoadStation`, §6.4) |
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
- **Erster geplanter Lauf** 03.10. 19:13 UTC (48 min nach dem Termin 18:25 — GitHub-Verzug), 11 s, grün, Archiv-Commit
  `59f47fd`: Slot-Protokoll bis 19:00 UTC; beide Halbtage nur ergänzt (51 Stammdatenfelder von Stationen, die beim
  lokalen Lauf nicht im jüngsten obs-Slot standen, z. B. P011), 0 Werte geändert.

## 13. Flag an für alle (03.10. abends, Jans „ja")

Jan, 03.10.: „kannst du das Feature jetzt auf der Startseite anzeigen?" — „ja". `ROAD_LIVE = true`
(`src/road/roadFlag.ts`): Kachel (11 Werkzeuge), ⌘K, Footer-Link, Rail-Symbol und Seite ohne Parameter; `?road=0`
blendet je Besucher aus, zurück für alle mit `false` + Push. Die automatische Rechteprüfung von Claude Code hielt die
Verifier-Anpassung zunächst an; Jan hat sie freigegeben (`/permissions`).

**Vor Gate B/C eingeschaltet — offen bleibt:** Gate B (7 Tage Schatten, ≈ 10.10.) und die Kalibrierung (≈ 17.10.; bis
dahin wirken nur die harten Regeln), Test am echten Gerät (V-AW-13), feiner Wächter (V-AW-19; mit Zeitplan nur das
Lebenszeichen des Archiv-Jobs, rot ab 3 h), Route weiter `noindex` ohne Sitemap und die 20 Unterseiten (V-AW-8),
Vorschaukarte (E-AW-15).

Gates: `verify:road-contract` **65/65** (F14 auf `ROAD_LIVE` umgestellt, F14b neu), `verify:road-ui` **41/41** (A1
jetzt `?road=0` ⇒ unbekannter Pfad, A3 Seite ohne Parameter, A4 Startseite mit Kachel „11 Werkzeuge"), `verify:share`
528/528, Build 252/252 (`verify-seo` 803), typecheck 0, Budget eagerJs 108,9 / 109,0 · totalJs 1 543,8 / 1 545,
`verify:dashboard-switch` 49/50 (B wie vorher, unabhängig).

## 14. AW-6.1 — Streckenprognose aus buscosun Fusion 8 (Jan 04.10.: „rechne alle Streckenpunkt-Prognosen in buscosun-data, zu fester Zeit, abgelegt für das Frontend; Punkte exakt auf der Autobahn")

Abgrenzung: AW-6.1 ist **Wetter an der Strecke** (Luft, Taupunkt, Niederschlag, Schnee-Anteil, Wind, Böen, Bewölkung)
aus buscosun Fusion 8. Fahrbahntemperatur und Glätte-Klasse bleiben AW-6.2 hinter Gate D — Fusion 8 sagt keine
Fahrbahn vorher. Die Seite zeigt die Prognose noch nicht (eigene Phase); hier entsteht das Datenprodukt mit Leser.

### 14.1 Diagnose (04.10., nur gelesen und gemessen)

| Nr. | Frage | Befund | Beleg |
|---|---|---|---|
| D-FC-1 | Lässt sich Fusion 8 in Node am Autobahnpunkt rechnen, ohne den Motor anzufassen? | **Ja.** `getPointForecastFromCube` mit einem `CubeIo` wie `defaultCubeIo()` (Stufe `fs`, Tabellen `json`, Radar-Stundenmittel), nur Speicher und Dekoder für Node. Am Punkt A 8 bei Stuttgart: Quellen `cube-t1, cube-t2, mosmix, radolan`, Notiz „stage:fs — neueste Stufe (buscosun Fusion 8)", 49 Stunden, 0 Fehler | Prototyp `scripts/road/_proto-fc.mjs` (nicht committet) |
| D-FC-2 | Was fehlt gegenüber dem Browser? | Nur der **Messungs-Anker** (BrightSky je Punkt — bei 4 400 Punkten nicht vertretbar): `obs: null`, der Motor sagt „kein Anker". Gelände (Terrarium z11 + z8) und z0 (WorldCover) sind je Punkt zeitlos ⇒ einmal vorab rechnen | wie oben; V-AW-21 |
| D-FC-3 | Kosten je Punkt | gegen einen lokalen Klon: 393 ms, davon Lesen 355 (jeder Punkt dekodiert Chunks und ≈ 75 Radar-PNGs neu), Rechnung 31, Ausgabe 6 ⇒ mit Dekodier-Merker ≈ 50–60 ms; 4 400 Punkte ≈ 4 min einfädig, mit 4 Prozessen ≈ 1–2 min lokal | Prototyp, 40 Punkte, zweiter Durchlauf |
| D-FC-4 | Wo ablegen? | **Nicht unter `road/v1/`**: der Radar-Spiegel setzt bei jedem Push `road/v1` = sein Bestand (`copyInto`: `rmSync` + Kopie, nur `corridors.json` nimmt er aus dem Repo) — ein fremdes `road/v1/fc/` wäre nach ≤ 5 min wieder weg. Der ICON-Publisher trägt den ganzen Baum mit (Klon → neue Historie), der Punkt-Publisher fasst nur `point/` an | `road-mirror.mjs` Z. 258–270, `publish-repack.mjs` Z. 216–265 |
| D-FC-5 | Wann rechnen? | Eingänge ändern sich: Cube t1 alle 3 h (Start `:40`, fertig ≈ `:52–:57`), Radar-Stundenmittel alle 5 min (wirkt 0–2 h), MOSMIX-L 4×/Tag. GitHub-Zeitpläne starten 5–50 min verspätet (Archiv-Lauf 03.10.: 48 min) ⇒ der Client darf den Lauf nicht aus der Uhr ableiten | Actions-API, §12.3 |
| D-FC-6 | Wie genau liegen die Korridor-Linien? | Punkt auf der vereinfachten Linie (Douglas-Peucker 80 m) gegen die OSM-Fahrbahn: **p50 15 m, p90 82 m, max 210 m** (60 Punkte); gegen die rohe DLM250-Achse p50 16, p99 73, max 553 m. Auch die rohe DLM250-Achse liegt bis 224 m daneben (A 4 bei Jena: Jagdbergtunnel, A 5 bei Karlsruhe) | `geo-acc.mjs` (Scratch), Overpass |
| D-FC-7 | Größe | 4 400 Punkte × 49 h × 11 Größen ≈ 9 MB JSON je Lauf — als eine Datei zu groß, je Korridor 10–400 KB roh | Rechnung |

### 14.2 Entscheidungen (Ruling, je mit Preis)

| Nr. | Entscheidung | Warum | Preis, wenn falsch |
|---|---|---|---|
| E-AW-17 | Prognosepunkte der Achse werden auf die **OSM-Fahrbahn** (`highway=motorway`, passende Nummer, kein Tunnel) gelegt; Lage-Lizenz ODbL, Nennung „© OpenStreetMap-Mitwirkende" in der Punktdatei und im README | Jan: „exakt auf der Autobahn"; DLM250 liegt bis 224 m daneben (D-FC-6). ODbL ist klar und ohne NC (Regel 5); die Punktliste ist öffentlich, Share-alike damit erfüllt | Punktdatei neu bauen ohne Einrasten (ein Schalter) |
| E-AW-18 | Ablage **`road/fc/v1/`** (eigene Linie neben `road/v1/`), der Stub `road/v1/fc/` im Vertrag entfällt | D-FC-4: der Spiegel besitzt `road/v1` | Pfadwechsel = neue Version, alte Clients sehen 404 |
| E-AW-19 | Eigener Workflow `road-fc.yml` im Daten-Repo, **stündlich** (`12 * * * *`), kein Eingriff in `radar.yml`/`point.yml`/`build.yml` und nicht in den Spiegel-Kern | der Spiegel-Kern hat uncommittete NP-0a-Änderungen einer anderen Sitzung; ein eigener Job kann den Radar nie aufhalten | Lauf verspätet ⇒ Prognose bis 1–2 h älter, benannt (`issuedAt`) |
| E-AW-20 | Der Client liest einen **Zeiger** `road/fc/v1/index.json` nur über raw.githubusercontent (5 min Cache, kein hängender 404), die Lauf-Dateien unveränderlich über jsDelivr mit raw als Rückfall — auch bei 404 | D-FC-5; jsDelivr `@main` löst bis 3 min nach dem Push alt auf | ein Abruf mehr |
| E-AW-21 | Punkte: Achse alle **5 km** je Korridor + jede Katalog-Station mit Koordinate (auch Bundes-/Landesstraßen); Horizont **0–48 h stündlich** | Stufe 1 rechnet auf ≈ 2 km; Stationen sind der Ort, an dem die Prognose gegen die Messung prüfbar ist (AW-6.2, Gate D) | Rechenzeit, Dateigröße |
| E-AW-22 | `CubeIo.decodeChunk` (additiv, durchgereicht an `readPointBundle`) für den Dekodier-Merker des Producers | D-FC-3; ohne die Option byte-gleich (der Leser nimmt wie bisher den Pool) | zwei Zeilen zurück |

### 14.3 Plan

1. **Punkte** `scripts/road/build-fc-points.mjs` (von Hand, wie die Korridore): Achspunkte alle 5 km, eingerastet auf OSM
   (Overpass, lokal gecacht), Brücken-Merkmal, Stationspunkte aus dem Katalog; Gelände und z0 je Punkt mit den Lesern
   des Clients vorab ⇒ `road/fc/v1/static/points.json` (öffentlich) und `static/geo.json` (nur Producer).
2. **Vertrag** `src/road/roadFc.ts`: Pfade, Schema, ganzzahlige Kodierung mit Dekodierer, Prüfer, Lauf-Wahl des Clients.
3. **Producer** `scripts/road/road-forecast.mjs`: Verzeichnis-Speicher über den Klon des Daten-Repos, Fusion 8 je Punkt
   (`getPointForecastFromCube`, 48 h), Scherben als Kindprozesse, Dateien je Korridor und je Bundesland, Zeiger,
   Aufbewahrung 3 h / ≥ 2 Läufe, Push mit Neuaufsetzen (Muster Spiegel).
4. **Workflow** `road-fc.yml` (Vorlage `scripts/road/workflow-road-fc.yml`), README-Abschnitt des Daten-Repos.
5. **Leser** in `roadClient.ts`. Anzeige = nächste Phase.
6. **Verifier** `verify:road-fc`: Kodierung, Gleichheit Datei ⇄ direkte Rechnung (mit Negativkontrolle), Push gegen ein
   lokales Bare-Repo (Aufbewahrung, Neuaufsetzen nach Force-Push), Workflow gegen Konstanten, Punktlage.
7. **Live-Prüfung**: erster Lauf von Hand, geplanter Lauf, CDN, Vergleich mit dem Browser-Pfad am selben Ort, erste
   Stichprobe gegen die gemessene Lufttemperatur der Stationen.
8. **Archiv** der Prognosen an den Stationspunkten in `buscosun-archiv` (vergangene Vorhersagen sind nicht nachholbar).

### 14.4 Umsetzung (04.10.)

| Teil | Datei | Was |
|---|---|---|
| Vertrag | `src/road/roadFc.ts` | Pfade `road/fc/v1/…`, Lauf-Stempel auf die Minute, ganzzahlige Kodierung mit Dekodierer (`t`, `ts`, `td`, `pp`, `rr`, `sn`, `ff`, `fx`, `dd`, `n`, `cf`, `q`), Wertschloss, Zeiger-Regel (Sperrfrist 5 min ab `publishedAt`), Aufbewahrung, Achs-Geometrie |
| Punkte | `scripts/road/build-fc-points.mjs` | **2 766 Achspunkte** (alle 5 km auf 137 Korridoren) + **1 658 Stationen**; 2 747 Achspunkte auf der OSM-Fahrbahn (p50 17 m, p90 111 m, max 804 m von der Nennlage), 24 wegen Tunnel oder Korridor-Ende verschoben, 153 auf Brücken, **19 nicht eingerastet** (A 14 km 0–40 und 80–85, A 143, A 44, A 60: dort gibt es noch keine Autobahn — V-AW-22; A 71 km 120: nur Tunnel). Gelände und z0 je Punkt über die Leser des Clients vorab (8 813 Cache-Einträge, 0 Punkte unvollständig, 5,6 MB) |
| Producer | `scripts/road/road-forecast.mjs` | Verzeichnis-Speicher über den Klon, `getPointForecastFromCube` mit den Optionen von `defaultCubeIo()` ohne Anker, Dekodier-Merker, Scherben als Kindprozesse, Freigabe-Regel (≤ 10 % Punkte ohne Ergebnis, Stufe `fs` an jedem Punkt, Stufe-1-Lauf gelesen), Push mit Neuaufsetzen |
| Workflow | `scripts/road/workflow-road-fc.yml` → Daten-Repo `.github/workflows/road-fc.yml` | stündlich `:12`, sparse (`point`, `radar/img`, `road`), Producer aus `buscosun-web` `main`, `bz2`/`jsfive` neben dem Klon, Schalter `ROAD_FC=0` |
| Leser | `src/road/roadClient.ts` | `loadRoadFcIndex` (nur raw), `loadRoadFc(kind, id, now)` (CDN mit raw-Rückfall, auch bei 404), Gründe `no-index`/`no-run`/`no-file` |
| Archiv | `scripts/road/road-fc-archive.mjs`, Schritt in `road-archiv.yml` | alle 3 h der jüngste Lauf, nur Stationspunkte, 0–24 h, 10 Größen ⇒ `buscosun-archiv/road/fc/v1/<tag>/<lauf>.json.gz` (263 KB je Lauf, ≈ 2,1 MB/Tag — **E-AW-23**) |
| Wächter | `scripts/road/road-fc-check.mjs` | von außen: Zeiger, jede Datei über den Leser, Prognose gegen die gemessene Luft an den Stationen |
| Motor | `src/pointForecast/cubeSource.ts` | nur `CubeIo.decodeChunk` (durchgereicht, E-AW-22); ohne Option byte-gleich |

Der Stub `road/v1/fc/` ist aus `roadContract.ts` entfernt (E-AW-18).

### 14.5 Störung beim ersten Push ins Daten-Repo (04.10. 09:01:42–09:02:44 UTC) — Fehler dieser Sitzung

Der Hand-Push von Punktdatei, Workflow und README (`24f5411`) trug einen **veralteten Index** des Klons: nach zwei
abgelehnten Versuchen (der Spiegel pushte dazwischen) stand `HEAD` per `reset --soft` auf dem neuen `origin/main`, der
Index aber auf dem alten Baum. Der Commit setzte damit `radar/` und `road/v1` um ≈ 30 min zurück (559 Dateien; `point/`
und `runs/` unberührt — nachgezählt). Nach 62 s stellte `a0527c4` beide Bäume exakt auf den letzten Stand des Spiegels
(`c6a34db`) zurück (aus dem guten Baum gebaut, Diff nur die vier gewollten Dateien); der Spiegel pushte um 09:03:32
normal weiter. Zweiter Fehler im selben Push: README mit CRLF — `88d6f26` stellt LF wieder her (Diff zum Stand davor:
+44 Zeilen). Mögliche Folge: Clients, die in dieser Minute den jüngsten Radar- oder Straßen-Slot über `@main` anfragten,
bekamen 404; jsDelivr kann so eine Antwort am Edge halten, der raw-Rückfall der Leser fängt Hänger und 403, **kein**
404 (V-AW-25). Lehre, im Code: `publishRun` prüft nach dem frischen Checkout, dass der Index sauber ist, committet nur
den Pfad `road/fc/v1` und prüft den Commit vor dem Push (`verify:road-fc` D9). Lehre für Hand-Pushes ins Daten-Repo: nie
`reset --soft` in einer Wiederholschleife; den Commit aus einem frisch gelesenen Baum bauen oder mit Pfadangabe committen.

### 14.6 Gates

| Prüfung | Ergebnis |
|---|---|
| `verify:road-fc` | **60/60** offline (A Vertrag 13 · B Punkt-Bauer 8 · C Producer Ende zu Ende 13 · D Push gegen lokales Bare-Repo 9 · E Workflow 6 · F Leser 4 · H Archiv 7), **66/66** mit `--data` (G: echte Punkt- und Gelände-Datei) |
| C4/C5 | Datei = direkte Rechnung von buscosun Fusion 8 am selben Punkt (eigener Speicher, eigene Dekoder), T/Td/Böe/Bewölkung über 49 h an 4 Punkten gleich; Negativkontrollen (eine Stunde später, ohne Stufe `fs`) ergeben andere Reihen |
| C8 | zwei Kindprozesse byte-gleich zu einem Prozess |
| C9/C10 | ohne gelernte Tabellen und bei > 10 % verlorenen Punkten wird NICHT veröffentlicht |
| D4–D6, D9 | abgelehnter Push, fremder Push dazwischen, Force-Push der Kartenlinie, fremde Änderung im Index |
| Lage unabhängig | frische Overpass-Abfrage, nicht der Auszug des Bauers: 298/298 eingerastete Stichprobenpunkte mit OSM-Autobahn in 15 m, **179/179 in 3 m**; nicht eingerastete 0/3 |
| sauberer Klon | Producer läuft im sparse-Klon ohne `node_modules` mit `bz2` + `jsfive` (E6 bindet die Liste an den Workflow) |
| übrige | `verify:road-contract` 65/65, `road-derive` 32/32, `road-archive` 26/26, `pv-cube` **417/417**, `pv-fusion` 235/235, `point-data` 1010/1010, `punktarchiv` 127/127, typecheck 0, Build 252/252, Budget eagerJs 108,9 / 109 · totalJs 1 544,3 / 1 545 |
| `verify:point-client` | 170/171 oder 171/171 — (10s) „z0mod nach dem Kern" ist zeitabhängig (V-EX-13): mit der ursprünglichen `cubeSource.ts` 2 von 4 Läufen rot, mit der neuen 4 von 7 |

### 14.7 Live (04.10.)

- `buscosun-web` `main` `89b3e92`, `418015d`; Daten-Repo `24f5411` (+ `a0527c4`, `88d6f26`), Archiv-Repo Workflow mit Prognose-Schritt.
- **Erster Lauf von Hand** `2610040905`: 4 424/4 424 Punkte, 0 ohne Ergebnis, 137 Korridore + 13 Länder, 8,5 MB, 200 s
  lokal mit 4 Prozessen, Commit `1ddb9da` im ersten Versuch. Cube t1 `2026100403`, t2 `2026100400`, MOSMIX `2026100403`,
  Radar-Slot `2610040900`.
- **Von außen** (`road-fc-check.mjs --files=all`, 4 min nach dem Push): Zeiger lesbar, 150/150 Dateien über den Leser des
  Clients, 4 424 Punkte, 0 verworfen, kein Punkt ohne Prognose.
- **Im Browser** (Jans Chrome, `localhost:5201`, Leser + buscosun Fusion 8 live am selben Ort, `obs: null`): Korridor
  `a8-4` 27 Punkte; an `a8-4@70` (Stuttgart), `@35`, `@110` Höhe gleich, **T und Td über 49 h in 0,1 K gleich**, Wind
  gleich bis auf einen Schritt mit 0,1 m/s an einem Punkt — das vorab gerechnete Gelände trägt dasselbe wie das im
  Browser geladene.
- **Gegen die Messung** (Slot 08:45, Vorlauf 0 h, 1 084 Stationen): Luft Bias +0,12 K, MAE 1,27 K, p90 2,6 K; Taupunkt
  Bias −0,95 K, MAE 1,65 K. Ein Zeitpunkt, kein Backtest — er zeigt, was ohne Anker fehlt (V-AW-21).
- **Erster geplanter Lauf** `2610041104` (Auslöser `schedule`, Start 11:04:11 UTC — der Zeitplan `:12` lief damit erst
  2 h nach dem Anlegen des Workflows und 52 min nach seiner Marke an): 4 424/4 424 Punkte, Rechnung 72 s, Job 116 s,
  veröffentlicht 11:06:02. Von außen 8 min danach: 150/150 Dateien, 0 verworfen; gegen die Messung 11:00 (1 081
  Stationen) Luft Bias −0,50 K, MAE 1,22 K, Taupunkt MAE 1,68 K. Aufbewahrung: beide Läufe im Zeiger.

### 14.8 Offen

| Nr. | Was | Mehrwert | Skizze |
|---|---|---|---|
| V-AW-20 | Der DWD liefert die Ordner `LW` und `SD` (Baden-Württemberg, 114 Stationen, alle Autobahn-Anlagen um Stuttgart) leer aus | Messungen an A 8/A 81/A 6 in BW | Anfrage beim DWD-Open-Data-Support (Jan); auf der Seite bis dahin die Prognose und ein Hinweis |
| V-AW-21 | **gebaut und gemessen 04.10. (§16), aus bis E-AW-30** — Der Producer rechnet ohne Messungs-Anker; an den Stationen misst SWIS die Luft selbst (MAE 1,27 K am ersten Zeitpunkt) | genauere erste Stunden genau dort, wo die Fahrbahn bewertet wird | SWIS-Luft und -Taupunkt des jüngsten Slots als `CubeObs` am Stationspunkt (Abstand 0); neue Kette ⇒ am Archiv messen, bevor sie wirkt |
| V-AW-22 | **erledigt 06.10. (§18):** (Daten-Paket, Jans Kopie) Korridore tragen Abschnitte, die noch nicht gebaut sind (A 14, A 143, A 44, A 60 — DLM250 führt sie als Autobahn) | keine Strecke auf der Karte, die es nicht gibt | `build-corridors.mjs`: Abschnitte ohne OSM-Fahrbahn auf ≥ 5 km abschneiden oder markieren |
| V-AW-23 | **erledigt 06.10. (§18):** −21 % Rechenzeit. Der Producer liest Manifeste und Tabellen je Punkt neu (≈ 25 % der Rechenzeit; 77 ms je Punkt einfädig) | Lauf in ≈ 2 statt 3–5 min | Merker für geparste Manifeste im Leser (`memoStore.json`) — Datei der Punktlinie |
| V-AW-24 | **erledigt 06.10. (§18):** Punkt- und Gelände-Datei liegen nur im Daten-Repo; fällt ein Hand-Push in das Fenster eines Force-Pushs der Kartenlinie, sind sie weg und der Job endet mit „points.json fehlt" | kein stiller Ausfall | Kopie beider Dateien im Archiv-Repo, der Job holt sie bei Bedarf zurück |
| V-AW-25 | **erledigt 06.10. (§18):** Die Leser der Radar- und Straßen-Slots holen bei 404 am CDN nicht von raw nach | ein kurz fehlender Slot heilt ohne Purge | wie `fetchRoadFcFile`: 404 am CDN einmal über raw prüfen |
| E-AW-23 | Archiv der Prognosen: Stationen, 0–24 h, alle 3 h ≈ 2,1 MB/Tag (≈ 0,8 GB/Jahr) | Gate D messbar | Jan: Umfang bestätigen oder kürzen (z. B. 4 Läufe/Tag) |
| Anzeige | erledigt 04.10. (§15) | Prognose-Zeile im Band, Kacheln +1/+3/+6 h, Wetter zur Ankunft | — |

## 15. AW-6.1b — Anzeige der Streckenprognose auf der Seite (Jan 04.10.: „mache das")

Auftrag: die Prognose aus §14 auf der Seite zeigen — Zeile im Streckenband, Kacheln +1/+3/+6 h, Wetter zur Ankunft.

### 15.1 Diagnose (gelesen am Code, 04.10.)

| Nr. | Befund | Folge |
|---|---|---|
| D-FCB-1 | Die Seite zeigt nur Messungen: Zeitchips +1/+3/+6 h gesperrt (`ROAD_FORECAST_ENABLED = false`), Kacheln „Prognose folgt", im Verlauf ein leeres 6-h-Feld, im Reiter Strecke bei später Ankunft weiter die Messung | alle vier Stellen sind in der Vorlage schon angelegt — kein neues Layout nötig |
| D-FCB-2 | Das Produkt ist **Wetter** (Luft 2 m, Taupunkt, Niederschlag, Wind, Bewölkung), keine Fahrbahn. Die Klassen der Seite (Glätte, Frostgefahr, Nass, Trocken) sind Fahrbahn-Klassen aus Messungen | die Prognose bekommt eigene Farben und eigene Wörter („Luft …", „Prognose"); keine Fahrbahn-Klasse aus der Prognose (AW-6.2, Gate D) |
| D-FCB-3 | Korridore ohne Messstelle (Baden-Württemberg, V-AW-20) öffnen heute mit „Eine Messstelle wählen" und leerem Band | ein Prognosepunkt muss wählbar sein wie eine Station, sonst bleibt genau dort die Detailspalte leer |
| D-FCB-4 | Der Leser `loadRoadFc` liefert eine Datei je Korridor (Achspunkte + dessen Stationen); Stationen an keinem Korridor liegen in Länder-Dateien, die Messung trägt das Land aber nicht (Reihen-Kürzel ≠ Land an 385 von 1 394 Stationen, nachgezählt) | für Stationen abseits der Korridore zeigt die Seite keine Prognose und sagt das (V-AW-26) |
| D-FCB-5 | `og-meta` (Edge) liest den Autobahnwetter-Zustand nicht; `roadState.ts` hat nur die Route als Leser | `t` und `st=<Achspunkt>` ändern kein Edge-Bündel (kein STOPP) |
| D-FCB-6 | Der Browser-Verifier fängt nur `road/v1/*` ab — Abrufe von `road/fc/v1/*` gingen ins Netz | Fixture: ein echter Lauf (`fc-a8-2610040905.json`), auf die Fixture-Uhr umgestempelt |

### 15.2 Entscheidungen

- **E-AW-24 — Zeitchips wählen die Stunde der Wetterprognose, Karte und Band bleiben Messung.** Marker, Band-Balken und
  Klassen zeigen bei jedem Chip die Messung des Slots; die Prognose liegt als eigene Zeile darunter und als kleine
  Punkte auf dem Korridor. Preis: bei „+3 h" stehen Messung (jetzt) und Prognose (+3 h) nebeneinander — jede Stelle
  nennt ihre Zeit.
- **E-AW-25 — Luft in drei Stufen mit eigenen Farben** (≤ 0 °C · bis +3 °C · darüber; `set`, +3 °C wie E-AW-11),
  Niederschlags-Marke ab 50 % (`set`), Art aus dem Schnee-Anteil (30/70 %, `set`). Kein Wort der Fahrbahnklassen in
  einem Prognose-Text (Prüfung I10 mit Gegenprobe).
- **E-AW-26 — Prognosepunkt als Auswahl:** `st=<korridor>@<km>` in der URL, eigene Karte „Prognosepunkt · buscosun
  Fusion 8"; ein Korridor ohne gemessene Station öffnet auf dem Achspunkt mit der kältesten Prognose-Luft.
- **E-AW-27 — Stunde = nächster voller Schritt des Laufs**, keine Interpolation zwischen Stunden im Client, kein
  Festhalten am Rand (außerhalb des Laufs: kein Wert). Jede Anzeige nennt die gültige Stunde.
- **E-AW-28 — Zustände:** Lauf bis 3 h „Lauf HH:MM", bis 12 h „· veraltet", danach oder ohne Zeiger/Datei keine
  Prognose: Chips gesperrt, Zeile weg, Grund im Text. Die Messung bleibt in jedem Fall vollständig.
- **E-AW-29 — zweiter Auslöser des Jobs** (`workflow_run` nach jedem abgeschlossenen Lauf von `point`): GitHub startete
  den Zeitplan des neuen Workflows am 04.10. in den ersten zwei Stunden nicht (erster Lauf 11:04 UTC, §14.7). `point.yml`
  unberührt. Der Auslöser bleibt als zweiter Weg; wirkt er zu oft, genügt das Entfernen der drei Zeilen.

### 15.3 Umsetzung

| Teil | Datei | Was |
|---|---|---|
| Rechenmodell | `src/road/roadFcView.ts` (neu, ohne DOM) | Schritt und Wert einer Stunde, Luft-Klassen, Niederschlags-Text, Band-Zellen (eine je Achspunkt, Loch statt gestreckter Nachbarn), Lauf-Etikett, Kacheln, Reihe für den Verlauf, Lücken-Punkte der Tabelle, Zusammenfassung „Wetter zur Ankunft" |
| Seite | `RoadPage.tsx` | lädt je Korridor den Lauf (`loadRoadFc`, alle 10 min neu; ein fehlgeschlagener Abruf behält den gezeigten Lauf), Zeit-Zustand `t` in der URL, Auswahl Station oder Prognosepunkt |
| Band | `RoadBand.tsx` | zweite, dünnere Zeile „Prognose Luft <Stunde> · Lauf …" mit einer klickbaren Zelle je 5 km, Marke für Regen/Schnee, eigene Legende; mobil eine Zeile unter dem Mini-Band |
| Karte | `RoadMap.tsx`, Ebene „Prognosepunkte" im Dock | kleine Punkte je Achspunkt in der Luft-Farbe, wählbar (eine Station unter demselben Pixel gewinnt), Callout „Prognose Luft …" |
| Detailspalte | `RoadReadout.tsx` | Kacheln +1/+3/+6 h mit Luft und Niederschlag (Klick = Zeitchip), Verlauf mit gestrichelter Prognose-Luft und -Taupunkt für 6 h, Werte der gewählten Stunde, Karte für Prognosepunkte (24-h-Verlauf), Reiter Strecke: „zur Ankunft: Luft … · Regen …" je Zeile mit später Ankunft, eigene Zeilen für Strecken ohne Messstelle im 10-km-Umkreis, ein Satz im Briefing; Quellen: buscosun Fusion 8 aktiv, OpenStreetMap (ODbL), Quelltext des Vertrags |
| URL | `roadState.ts` | `t=1\|3\|6` gültig, `st` nimmt auch `<korridor>@<km>` |
| Job | `scripts/road/workflow-road-fc.yml` → Daten-Repo `7374e46` | zweiter Auslöser nach `point` (E-AW-29) |

Nicht angefasst: buscosun Fusion, Producer, Vertrag `roadFc.ts`, Edge Functions, Shader. Fahrbahn-Temperatur und
Fahrbahn-Klasse haben weiter keine Prognose (Kachel „Jetzt" = Messung; Quellen nennen die Fahrbahn-Prognose „geplant").

### 15.4 Gates

| Prüfung | Ergebnis |
|---|---|
| `verify:road-fc` | **73/73** — neu Block I (11 Prüfungen des Rechenmodells auf dem echten Lauf: Schrittwahl mit Rändern, Wert = Dekodierung des Vertrags mit Gegenprobe, Klassen an den Grenzen, Zeile lückenlos und gespiegelt, Loch bei verlorenen Punkten, Lücken-Zeilen, Ankunft von Hand nachgerechnet, Lauf-Etikett, URL-Rundweg, kein Fahrbahn-Wort in Prognose-Texten) und E7 (zweiter Auslöser) |
| `verify:road-ui` | **55/55** im Headless-Browser (zweimal in Folge nach der letzten Änderung) — neu P1–P8 (Zeile, Kacheln = Datei, Verlauf, Chip ⇒ URL, Prognosepunkt = Datei, Ankunftszeilen, Quellen, geteilter Link), Q1–Q4 (kein Zeiger, 4 h alt, 13 h alt, Prognose ohne Messdaten), H4 (mobil); die bisherigen Prüfungen unverändert grün, geändert nur E1 (Chips jetzt wählbar) und der Zähler in D3 (Stationszeilen) |
| Funktionserhalt | jede frühere Prüfung der Seite grün: Maße 62/60/250/400, Band über dem Kartenfuß, Voreinstellung E-AW-13, Auswahl, Richtung, Reiter, Zustände ohne Daten, mobil ≥ 44 px |
| live | `/autobahnwetter/a8-4?t=3` (Ettlingen → Deggingen, 3 Messpunkte) gegen das echte Daten-Repo: 24 Prognose-Zellen, Prognosepunkt „A 8 · km 60", Lauf 11:05 |
| übrige | `verify:road-contract` 65/65, `verify:share` 528/528, `verify:routing` 252/252, typecheck 0, Build 252/252, Budget eagerJs 108,9 / 109 · totalJs 1 549,8 / **1 551** (+5,5 KB, alles im nachgeladenen Seiten-Chunk; Notiz in `budget.json`) |

Selbstprüfung: (1) Funktionserhalt — s. o., einzeln im Verifier; (2) Desktop — die Seite bekommt eine Zeile im Band
(+ 32 px Höhe) und gefüllte Kacheln, sonst gleich; (3) Touch — Kacheln mobil ≥ 44 px (H2), Chips 36 px wie die Vorlage;
(4) Konsole — I1 ohne Ausnahme; (5) Long Tasks — in headless-shell nicht messbar, die Rechnung je Anzeige ist ≤ 60
Punkte × 49 Schritte.

### 15.5 Offen

| Nr. | Was | Mehrwert | Skizze |
|---|---|---|---|
| V-AW-26 | **erledigt 06.10. (§18):** Stationen an keinem Korridor (Bundes-/Landesstraßen) zeigen keine Prognose — sie liegt in den Länder-Dateien, die Messung nennt das Land nicht | Kacheln auch abseits der Autobahn | Land je Station in `obs` (Producer des Spiegels) oder eine kleine Zuordnung Station → Datei im Zeiger |
| V-AW-27 | **erledigt 06.10. (§18):** (synthetisch) Der Test-Lauf der Fixture ist warm und trocken: Blau-Stufen und Niederschlags-Marken sind nur im Rechenmodell geprüft, nicht im Bild | Bild-Beleg der Winterlage | beim ersten Frost-Lauf eine zweite Fixture ablegen |
| V-AW-28 | **erledigt 06.10. (§18):** Zeitplan des Workflows startete am 04.10. nicht; der zweite Auslöser hängt am Workflow `point` | Lauf auch, wenn `point` steht | Wächter: Zeiger älter als 3 h ⇒ rot (z. B. im Archiv-Job, der schon alle 3 h liest) |
| V-AW-29 | **erledigt 06.10. (§18):** Reiter Strecke: bei drei Zeilen je Messpunkt wird die Tabelle lang | ruhigere Tabelle | Prognose in eine eigene Spalte ab 1 440 px |
| V-AW-33 | Anker von buscosun Fusion: Messung und Modellwert passen zeitlich nicht zusammen. Am Code bestätigt (04.10.): `cubeSource.ts` paarte jede Messung mit dem ERSTEN Achsenschritt innerhalb ±30 min (`SAME_TIME_MS`) und nahm dessen Modellwert — der Gang des Modells über bis zu 30 min zählte als Innovation. Trifft im Browser jede Messung abseits der vollen Stunde, auch die ohne Zeitstempel (`cubeObsOf` setzt dann „jetzt"). Reproduktion im Verifier: Messung um t0 + 30 min genau auf der Modelllinie ⇒ Schein-Versatz = halber Stundengang statt 0 | der Anker korrigiert den Ortsversatz, nicht den Tagesgang; an den Straßenstationen gemessen +30 % (16:00) gegen +1 % (16:30) | **gebaut:** `FuseCubeOptions.anchorAtObsTime` — Modellwert (T, u, v, Böe) linear auf die Messminute zwischen den zwei Achsenschritten (Lücke ≤ `ANCHOR_BRACKET_MAX_H` 3 h); Messung auf einem Schritt oder vor dem Achsenbeginn wie bisher; ohne Option byte-gleich. `verify:pv-cube` (12) 3 Prüfungen (rot vor der Umsetzung). Wirkung im Browser nicht gemessen (das Archiv trägt Stundenwerte). **Eingeschaltet am 04.10. (Jan: „ja schalte es default mäßig ein") = „buscosun Fusion 9":** `FUSION9_ANCHOR_AT_OBS_TIME` in der Stufe `fs`, Rückfall `?anc=0` / `CubeIo.anchorAtObsTime: false` = Fusion 8 (eigener Cache-Schlüssel); die Streckenprognose (`road-forecast.mjs`, ohne Messungen) setzt den Rückfall und bleibt „buscosun Fusion 8"; `verify:pv-cube` 421/421, `verify:road-fc` 73/73, `verify:pv-fusion` 235/235, `verify:point-client` 170/171 ((10s) wie an HEAD), Build 252/252, totalJs 1 550,3 / 1 551. Commit/Push = Jans Gate. Nicht angefasst: der Stationswert liest die Stationsvorhersage nur zur exakten Gültigzeit (`stationForecastAt`) — eine Messung abseits der vollen Stunde gibt dort gar keine Innovation |
| Real-Device | nur Headless geprüft | — | Jan: Handy, `/autobahnwetter/a8-4` |

## 16. V-AW-21 — gemessene Luft der Stationen als Anker der Prognose (Jan 04.10.: „mach das")

Auftrag: die Luftmessung der Glättemeldeanlagen als Messungs-Anker in die Streckenprognose nehmen — erst messen, dann
einschalten. **Ergebnis: gebaut, gemessen, NICHT eingeschaltet** — die vorab festgelegte Regel ist an einer Stelle
verletzt (Morgenlauf, §16.4). Einschalten ist eine Zeile und Jans Entscheidung (E-AW-30).

### 16.1 Diagnose (04.10., gelesen am Code)

| Nr. | Befund | Folge |
|---|---|---|
| D-ANK-1 | Der Motor hat den Eingang schon: `CubeIo.obs` → `CubeObs[]` (Quelle, Ort, Höhe, Abstand, Zeit, Temperatur …). Der Producer setzte `obs: null` (D-FC-2) | kein Eingriff in buscosun Fusion; der Producer reicht die Messungen durch denselben Haken wie der Browser |
| D-ANK-2 | Der Anker ist eine Innovations-Persistenz: Versatz Messung − gelerntes Cube-Mittel am Punkt, mal Repräsentativität (`spatialWeight`: 20 km ⇒ 0,5), mal Abklingen mit dem Vorlauf. Er wirkt auf T, u, v, Böe — **nicht** auf den Taupunkt | Taupunkt nur berichten |
| D-ANK-3 | Paarung Messung ⇄ Modellschritt im Stundenraster mit ± 30 min Toleranz (`SAME_TIME_MS`); das Fenster beginnt an der vollen Stunde des Laufs | eine Messung von :15/:30/:45 wird mit dem Modellwert der vollen Stunde verglichen (V-AW-33); eine Messung der Vorstunde findet keinen Schritt |
| D-ANK-4 | Der Stationswert (Phase FS) nimmt die jüngste Messung am Punkt als Innovation gegen die MOSMIX-Vorhersage **derselben Minute** — steht eine MOSMIX-Station ≤ 5 km / ≤ 50 m am Punkt (bei 41 % der Glättemeldeanlagen), greift er auch mit der SWIS-Messung, aber nur zur vollen Stunde | zweiter Wirkweg, an den Daten sichtbar (§16.3) |
| D-ANK-5 | Messungen liegen im selben Klon (`road/v1/obs/<slot>.json`, 3 h) — der Workflow checkt `road` schon aus | kein Abruf, keine Workflow-Änderung |
| D-ANK-6 | Die Meldeposition weicht an 182 von 1 369 Stationen um mehr als 1 km vom Katalog ab (bis 131 km) | als Nachbar zählt eine Station nur, wenn beide Lagen auf 2 km übereinstimmen und die Kataloghöhe bekannt ist (V-AW-30) |
| D-ANK-7 | Die 24-h-Ringe tragen nur Fahrbahn, Luft, Taupunkt — keinen Wind | Wind ist nur in den 3-h-Fenstern der Obs-Dateien prüfbar |

### 16.2 Messaufbau und Regel

Regel vorab festgelegt in `audit/autobahnwetter/anker-regel.md` (vor der ersten Auswertung). Werkzeug
`scripts/road/road-fc-anchor-backtest.mjs`: buscosun Fusion 8 an jeder Station mit Messung, je Variante einmal, auf
einem Schnappschuss des Daten-Repos; Wahrheit = die spätere Luftmessung derselben Station; gepaart gegen „ohne Anker".
Schnappschüsse (nur lokal, `C:\dev\buscosun-road-snap\`): 09:10, 19:00, 19:20 UTC; frühere Ausgabezeiten nachgestellt
(Cube-Zeiger auf den damals jüngsten Lauf, Messung aus dem 24-h-Ring).

### 16.3 Ergebnis

**Runde 1 — sechs Ausgabezeiten, jüngste Messung** (`audit/autobahnwetter/anker-messung-1.md`, ≈ 1 090 Stationen je Lauf):

| Variante | Luft +1 h | +2 h | +3 h | 4–6 h | schlechtester Lauf |
|---|---|---|---|---|---|
| S1 eigene Messung | 1,29 → 0,82 K (+36 %*) | +21 %* | +13 %* | +7 %* | 06:25: +15 / +5 / **−1,9** / **−2,9 %!** |
| S6 eigene + Nachbarn | +27 %* | +15 %* | +8 %* | +4 %* | 06:25: −1,4 / −3,4 / −5,1 % |
| L nur Nachbarn (Achspunkte) | +4 %* | +2 %* | −0,5 % | −0,9 % | 06:25: −5,8 / −5,2 / −4,9 % |
| S1w Wind an der Station | Wind +14 %*, Böe +38 %* | +8 / +29 %* | +2 / +16 %* | — | kein Lauf schlechter |

Der Lauf 06:25 fiel heraus — er war der einzige mit einer Viertelstunden-Messung (06:15). Zerlegt nach Wirkweg
(D-ANK-4): mit Messung zur vollen Stunde gewinnen Stationen mit Stationswert +48…+74 % bei +1 h, die übrigen +25…+30 %.

**Runde 2 — volle Stunde gegen Viertelstunde, selber Lauf** (S1, Luft am ersten Stundenschritt nach dem Lauf):

| Lauf | jüngste Viertelstunde | letzte volle Stunde |
|---|---|---|
| 03:40 | 03:30: +15 % | 03:00: +47 % |
| 06:25 | 06:15: +15 % | 06:00: +35 % |
| 06:55 | 06:45: +24 % | 06:00: +35 % |
| 16:40 | 16:30: **+1 %** | 16:00: +30 % |
| 17:55 | 17:45: +23 % | 17:00: +36 % |
| 18:55 | 18:45: +20 % | 18:00: +43 % |

⇒ Der Producer nimmt die Messung der vollen Stunde, in der der Lauf startet (`readSwisTable`). Ein Lauf in den ersten
Minuten einer Stunde, bevor der Spiegel den Slot hat, rechnet ohne Anker und sagt das im Kopf.

**Schlussmessung — eigene Messung der vollen Stunde, acht Ausgabezeiten**
(`audit/autobahnwetter/anker-messung-vollstunde.md`; 03:10 · 06:25 · 09:05 · 14:10 · 16:10 · 17:55 · 18:55 · 19:20):

| Vorlauf | Paare | MAE ohne Anker | mit Anker | Gewinn | je Lauf |
|---|---|---|---|---|---|
| +1 h | 7 564 | 1,31 K | 0,79 K | **+40,0 %*** | +30 … +47 % |
| +2 h | 6 469 | 1,34 | 1,04 | +22,5 %* | +10 … +35 % |
| +3 h | 5 395 | 1,28 | 1,13 | +12,2 %* | +10 … +26 %, **06:25: −2,4 %** |
| 4–6 h | 11 849 | 1,27 | 1,19 | +6,5 %* | +6 … +13 %, **06:25: −3,5 %!** |
| 7–9 h | 9 690 | 1,21 | 1,20 | +0,7 % | −0,7 … +2,7 % |
| 10–12 h | 7 545 | 1,19 | 1,18 | +0,9 %* | |

Taupunkt (nicht verankert, profitiert über den Stationswert): +1 h 1,52 → 1,17 K (+23 %*), +3 h +11 %*, nirgends schlechter.
Bias Luft −0,56 → −0,21 K bei +1 h.

### 16.4 Verdikt nach der Regel

| Regel | Ergebnis |
|---|---|
| 1 Stationspunkte (eigene Messung) | **nicht erfüllt.** Gepoolt bei 1, 2, 3 h signifikant besser und in keinem Bin signifikant schlechter — aber die Bedingung „in keinem einzelnen Lauf bei 1–3 h größer" ist verletzt: der Lauf mit der Messung von 06:00 UTC (Sonnenaufgang) ist bei +3 h um 2,4 % schlechter (nicht signifikant) und bei 4–6 h um 3,5 % (signifikant, ≈ 0,05 K). Der nächtliche Versatz einer Station hält nach Sonnenaufgang nicht; der Motor lässt ihn zu langsam abklingen (V-AW-32) |
| 2 Nachbarn zusätzlich (S6) | nein — S6 ist in jedem Vorlauf schlechter als S1 |
| 3 Achspunkte (nur Nachbarn) | **nein** — bei +3 h kein Gewinn, im Morgenlauf −5 … −6 %. Achspunkte bleiben ohne Anker |
| 4 Wind | Regel erfüllt (Wind und Böe in jedem Lauf besser) — trotzdem nicht eingeschaltet: die Masten messen nicht in 10 m (Prognose-Bias +0,8 m/s Wind, +1,2 m/s Böe gegen die Sensoren); verankert hieße die Größe „Wind am Mast", nur an Stationen, und stünde neben unverankerten Achspunkten. Bedeutungsänderung ⇒ Jans Entscheidung (E-AW-31) |
| 5 Taupunkt | berichtet (s. o.) |

Grenzen: ein Tag, milde trockene Lage, kein Frost; nachgestellte Läufe lesen denselben MOSMIX-Stand wie der Schnappschuss;
p-Werte bei räumlich korrelierten Stationen zu optimistisch. Die Läufe ab 16:10 haben erst einen Teil ihrer Vorläufe.

### 16.5 Umsetzung (alles aus: `ROAD_FC_ANCHOR_MODE = 'none'`)

| Teil | Datei | Was |
|---|---|---|
| Schalter | `src/road/roadFc.ts` | `ROAD_FC_ANCHOR_MODE` (`'none'` · `'stations'` · `'all'`), `RoadFcPoint.anc` = [Versatz 0,1 K, Gewicht %, eigene Messung 1/0], `RoadFcEngine.anchor` `'none' \| 'swis'` + `anchorMode`, `anchorSlot`, `anchored` — der Kopf sagt, was geschah, nicht was verlangt war |
| Producer | `scripts/road/road-forecast.mjs` | `readSwisTable` (Obs-Datei der vollen Stunde des Laufs, nur Werte dieses Zeitpunkts), `swisTable` (Lageprüfung), `anchorObsFor` (eigene Messung allein; sonst ≤ 6 Nachbarn in 30 km), Übergabe über `CubeIo.obs`; Schalter auch per `--anchor=` und `ROAD_FC_ANCHOR` (Rückweg ohne Commit); ohne Messdatei Lauf ohne Anker, benannt |
| Seite | `roadFcView.ts`, `RoadReadout.tsx` | je Punkt ein Halbsatz: „verankert an der Luftmessung dieser Messstelle von HH:MM (Messung − Modell ±x K)" / „… an Messstellen im Umkreis" / „ohne Messungs-Anker" |
| Archiv | `scripts/road/road-fc-archive.mjs` | `anc` je Station mit abgelegt |
| Messung | `scripts/road/road-fc-anchor-backtest.mjs` | `compute` / `score`, wiederholbar auf jedem Schnappschuss |

Motor, Vertrag der Messungen, Workflow, Daten-Repo: unberührt. Mit Schalter `'none'` sind die Lauf-Dateien byte-gleich
zum Stand davor (Verifier J6).

### 16.6 Gates

| Prüfung | Ergebnis |
|---|---|
| `verify:road-fc` | **84/84** — neu Block J (11): Messtabelle und Lageprüfung, Auswahl je Punktart, Lauf „stations" (Kopf, `anc`, Richtung), Achspunkte byte-gleich, Lauf „all", fünf Gegenproben (Schalter aus, Messung der Vorstunde, nur Viertelstunde, `killed`, keine Datei ⇒ byte-gleich zum Lauf ohne Anker), Kindprozesse = ein Prozess, **Datei = direkte Rechnung von buscosun Fusion 8 mit derselben Messung**, Wind unberührt, Leser/Archiv/Text |
| übrige | `verify:road-ui` 55/55, `verify:road-archive` 26/26, `verify:road-contract` 65/65, typecheck 0, Build 252/252, Budget eagerJs 108,9 / 109 · totalJs 1 550,0 / 1 551 |

### 16.7 Offen

| Nr. | Was | Mehrwert | Skizze |
|---|---|---|---|
| ~~E-AW-30~~ | **entschieden 06.10. (Jan: „setze … um"), eingeschaltet (§18, `a42d516`).** Anker an den Stationspunkten einschalten? Empfehlung: **ja** — +1 h 40 %, +3 h 12 % genauer; Preis: Prognosen aus der Messung um Sonnenaufgang sind 3–6 h später ≈ 0,05 K schlechter | genauere erste Stunden dort, wo die Fahrbahn bewertet wird (Gate D) | `ROAD_FC_ANCHOR_MODE = 'stations'` in `roadFc.ts`, Push — der nächste Job rechnet damit; zurück: `'none'` oder `ROAD_FC_ANCHOR: none` im Workflow |
| E-AW-31 | Wind und Böe an den Stationen verankern (Böe +38 % bei +1 h)? | Wind, wie ihn der Mast an der Straße misst | Option `wind` in `anchorObsFor` ist gebaut; die Größe hieße dann „Wind an der Messstelle" |
| V-AW-30 | 182 Stationen: Meldeposition ≠ Katalog (> 1 km, bis 131 km) | richtige Lage der Stationspunkte und Marker | **Liste erzeugt 04.10. (§17.1, `audit/autobahnwetter/stationslage.md`)**; je Station Bulletin gegen Katalog entscheiden = Jan |
| V-AW-31 | **behoben 04.10. (§17.2)** — Der Job `road-fc` läuft nach jedem `point`-Lauf — am 04.10. dreimal in 11 min veröffentlicht (15:37, 15:39, 15:48 UTC) | weniger Leerlauf | der Producer überspringt einen Lauf mit derselben Stunde und denselben Eingaben (`repeatVerdict`) |
| V-AW-32 | Der Versatz einer Messung um Sonnenaufgang hält nicht (−4 … −9 % bei 3–6 h an Stationen ohne Stationswert) | Regel 1 erfüllt | Abklingen nach Tageszeit im Motor — buscosun Fusion, Jans Gate; betrifft auch den Browser-Pfad |
| V-AW-33 | Der Motor paart eine Messung mit dem Modellschritt bis ± 30 min daneben; am Nachmittag fiel der Gewinn damit von 30 % auf 1 % | der Anker im Browser (BrightSky-Messung zur Minute) verliert vermutlich ebenso | Modellwert auf die Messzeit interpolieren oder nur Messungen der vollen Stunde paaren — buscosun Fusion, Jans Gate |
| V-AW-34 | Wiederholung an weiteren Tagen, vor allem bei Frost | belastbare Zahl | `road-fc-anchor-backtest.mjs` an 2–3 Schnappschüssen je Tag; nach E-AW-30 liefert das Archiv verankerte Läufe mit `anc` |

## 17. V-AW-30 Stationsliste und V-AW-31 Wiederholungsschutz (04.10., Jans „setze diese zwei Punkte um")

### 17.1 V-AW-30 — Liste der Stationen mit zwei Lagen

Werkzeug `scripts/road/road-station-positions.mjs` (nur lesend): liest alle Messdateien eines Klons von buscosun-data,
nimmt je Station die Position der Meldung und stellt sie neben den Katalog. Ergebnis
`audit/autobahnwetter/stationslage.md` (Tabelle mit Kartenlinks, weiteste zuerst) und `stationslage.csv`.
Die Entscheidung je Station liegt bei Jan (seine Ansage 04.10.); die Liste entscheidet nichts.

- Messdateien: 12 (2610041730 … 2610042015), Stationen mit Meldeposition: 1555, davon im Katalog mit Lage: 1400, ohne Katalogeintrag: 155
- Abstand > 1 km: 185 — 100–… km: 1 · 20–100 km: 5 · 5–20 km: 22 · 2–5 km: 68 · 1–2 km: 89
- davon durch die Rundung der Meldung allein erklärbar (Abstand ≤ größter Rundungsfehler ihrer Nachkommastellen): 6
- Stationen mit mehr als einer Meldeposition in den Dateien: 0

Befunde aus der Liste:

- **Die Rundung der Meldung erklärt fast nichts** (6 Stationen). Meine Vermutung aus der Erklärung war falsch: die
  Meldungen tragen meist fünf Nachkommastellen. Grob ist an vielen Stellen der **Katalog** — Lagen wie `51.41667, 7.6`
  oder `51.25, 7.6` sind auf Bogenminuten gerundet (bis ≈ 1,2 km), bei einigen offenbar auf einen Ortsnamen statt
  auf die Anlage gesetzt (H508, H448, H557: 6–9 km).
- **Echte Fehler am oberen Ende:** P101 Kahl (131 km), P301 Ensbrücke (69 km), P142 Wildbach (55 km), K441, P670 —
  hier liegt eine der beiden Lagen an einer anderen Straße. P301 und P159 melden dieselbe Position
  (`49.82504, 11.0091`) — eine davon ist in der Meldung falsch.
- **P925** heißt im Katalog „Vogelwirt", in der Meldung „Stuetzelsaege" (19,9 km): die Kennung ist vermutlich neu
  vergeben.
- 155 meldende Stationen stehen nicht im Katalog (bekannt, V-AW-7); keine Station meldet wechselnde Positionen.
- Die Zahl 182 aus §16 stammt aus dem Schnappschuss vom Vormittag; im Bestand von 17:30–20:15 UTC sind es 185.

Wirkung heute unverändert: Marker und Prognosepunkt liegen auf der Kataloglage; als Anker-Nachbar zählt eine Station
nur bei ≤ 2 km Übereinstimmung (D-ANK-6).

### 17.2 V-AW-31 — kein Lauf ohne neue Eingaben

**Diagnose.** `workflow_run` feuert je abgeschlossenem **Lauf** des Workflows `point`; dessen vier Zeitpläne (t1, t2, t3,
MOSMIX-S) sind vier getrennte Läufe, dazu kommt der eigene Stundenplan. Am Zeiger vom 04.10. abgelesen (Lauf · t1 ·
Stationslauf): `1713`/`1736` (12z · 09z), `1801` (12z · 15z), `1813`/`1819` (15z · 15z), `1920`/`1952` (15z · 15z) —
drei von sieben Läufen hatten dieselbe Stunde und dieselben Eingaben wie ihr Vorgänger; am Nachmittag 15:37, 15:39,
15:48 UTC ebenso.

**Entscheidung.** Nicht den Auslöser einschränken (er kann nicht nach Job filtern, und der t2-Job bringt MOSMIX-L —
eine echte Eingabe), sondern im Producer vor dem Rechnen prüfen (`repeatVerdict`, `road-forecast.mjs`): ein Lauf ist
eine Wiederholung, wenn der jüngste veröffentlichte Lauf

1. in derselben Stunde beginnt (`t0Ms`),
2. dieselben Cube- und Stationsläufe gelesen hat, die `point/index.json` des Klons jetzt anbietet (jede Eingabe, die
   der Motor im letzten Lauf nannte: t1, t2, Stationen; MOSMIX-S und t3 sind keine Eingaben), mit denselben Tabellen,
3. und keine Messdatei der vollen Stunde dazugekommen ist, die der Anker jetzt nähme und damals nicht hatte.

Dann endet der Job grün mit „kein neuer Lauf — …", ohne Rechnung und ohne Commit. Unlesbares oder Unbekanntes ⇒ der
Lauf findet statt. Neuere Radarbilder in derselben Stunde zählen bewusst nicht — der nächste Stundenlauf nimmt sie.
`--always` / `ROAD_FC_ALWAYS=1` rechnet immer; der Workflow setzt das beim Start von Hand.

**Wirkung.** Je Stunde ein Lauf, dazu einer je neuem t1-, t2- oder Stationslauf. Ein übersprungener Auslöser kostet
noch Checkout und Klon (≈ 30–40 s), keine ≈ 75 s Rechnung und keinen Commit (≈ 8,5 MB). Am echten Klon geprüft:
19:56 UTC ⇒ Wiederholung von `2610041952`; 20:40 UTC ⇒ „neue Stunde".

**Gates.** `verify:road-fc` **89/89** — neu Block K (5): der Fall vom 04.10., zehn Gegenproben mit benanntem Grund,
Anker-Fall, am Klon mit Tabellen-Hashes, Verdrahtung in Producer und Workflow. `src/` unberührt (kein Build nötig).
Wirksam mit dem Push von `main` (der Job klont den Producer bei jedem Lauf); die Workflow-Kopie im Daten-Repo bringt
nur den Schalter für den Start von Hand.

## 18. E-AW-30 und die offenen Verbesserungen (Nacht 05./06.10., Jans Auftrag „setze im automode um … committen, nicht pushen")

Auftrag: E-AW-30 einschalten und V-AW-1, -2, -7, -9, -12, -14, -16, -22, -23, -24, -25, -26, -27, -28, -29 umsetzen, jede
Änderung im Code und visuell prüfen, committen ohne Push. Alles liegt auf `main` in sieben Commits (`a42d516` … `9cc8c0c`),
**nicht gepusht**. Wirksam wird der Code-Teil mit Jans Push von `main` (die Jobs klonen `main`); die neuen Korridor- und
Punktdateien brauchen zusätzlich die Kopie ins Daten-Repo (§18.4, `MANUELLE-SCHRITTE.md` §41).

### 18.1 Ergebnis je Punkt

| Nr. | Umsetzung | Beleg | Commit |
|---|---|---|---|
| **E-AW-30** | `ROAD_FC_ANCHOR_MODE = 'stations'`: jede Station rechnet mit ihrer eigenen Luftmessung der vollen Stunde, Achspunkte ohne Anker. Der Quelltext des Laufs nennt den Anker nur, wenn der Lauf verankert hat; der Quellen-Reiter sagt, was der geladene Lauf tat. Rückweg ohne Commit: `ROAD_FC_ANCHOR=none` | `verify:road-fc` J12/J13; echter Klon 04.10. 20:20: 8 von 12 Stichproben-Stationen verankert, Achspunkte unverankert; Volllauf auf den neuen Dateien: 1 220 verankerte Punkte | `a42d516` |
| V-AW-1 | Referenz der Beobachtungsregel `cube`: die Ableitung liest im Vollklon des Radar-Spiegels `road/fc/v1` (`groups.json` `_fcDir`, `road-fc-ref.mjs`) — Stationsprognose des jüngsten Laufs vor dem Slot, Schritt 0–1 h, **Anker herausgerechnet** (Reihe − Versatz × Gewicht). Bleibt Beobachtung (Quarantäne `cube`, Detail T2m); Zusammenfassung und `status.json` nennen Lauf und Zahl der Stationen | `verify:road-derive` J1–J4 (zwei Gegenproben); echter Klon 04.10. 20:00/20:15: 1 090 Paare, Median +0,5/+0,6 K, p01 −3,4/−3,7 K, p99 +5,1/+4,8 K, 2 Stationen > 8 K | `f3a5280` |
| V-AW-2 | Verlauf 24 h: Leiste der gemessenen Klasse je 15-min-Slot aus dem Ring (`k`), „unbekannt"/„keine Messung" schraffiert, Lücke leer; Legende und Bildbeschreibung zählen | `verify:road-ui` R3 (Ring mit 96 Slots, Zählung = Ring), Aufnahme `ui-0610/r3-verlauf-leiste.png` | `d0c44b3` |
| V-AW-7 | Stationen ohne Katalogzeile bekommen Prognosepunkte an der Meldeposition (E-AW-7), Datei nach DWD-Reihe, `noCatalog` (156 am 06.10.); Straßenklasse und km kommen weiter aus der Meldung. Die aktuelle Katalogliste kann nur der DWD liefern — Text der Anfrage in §18.5 | `verify:road-contract` K9, `verify:road-fc --data` G5 | `9cc8c0c` |
| V-AW-9 | Ringnamen (`ROAD_RING_NAMES`: Berliner Ring, Autobahnring München, Berliner Stadtring), Schleifen ohne „X → X" in Pille, Band und Briefing; Abschnitte mit < 3 Messpunkten (nicht der Hauptabschnitt, nicht der gewählte, nicht bei der Suche) unter EINER Zeile je Autobahn im Dock | R1 (Rechenmodell), R2 (Browser auf/zu); C3/H3 zählen die Falt-Zeile | `d0c44b3` |
| V-AW-12 | Inline-Skript direkt nach `#root` der Route-Shell (`scripts/seo/flagGate.mjs`) leert die Einleitung, wenn das Flag des Besuchers aus ist (dieselbe Rangfolge wie `roadFlagFrom`) — kein Aufblitzen vor „nicht gefunden" | R8: 18 Fälle gegen `roadFlagFrom`, im Build vorhanden, im Browser `#root` mit `?road=0` leer (App-Bündel blockiert), ohne Schalter gefüllt | `d0c44b3` |
| V-AW-14 | Ebene „Niederschlag jetzt" im Dock: der `RainLayer` der Wetterkarte (exakte DE1200-Verortung) mit der jüngsten RV-Analyse des Spiegels (`fetchRvLatestAnalysis`, f000.png ≈ 30 KB, kein Tar), unter den Ortsnamen der Grundkarte, alle 5 min neu, **voreingestellt aus** | R5: aus ⇒ 0 Radar-Abrufe; an ⇒ 357 499 geänderte Pixel, Legende „Radar 10:05 · DWD RADOLAN"; wieder aus ⇒ 0 Pixel Unterschied. Aufnahme `r5-radar-an.png` | `d0c44b3` |
| V-AW-16 | `removeLoops` sammelt Abgeschnittenes; Äste ≥ 2 km mit einer sonst nicht zugeordneten Station werden eigene Abschnitte (`spur: true`, nach den regulären nummeriert — bestehende Kennungen bleiben). Am Live-Bestand genau die vier Stationen: `a31-2` Larrelt, `a72-2` AD Bayerisches Vogtland, `a73-3` Fürth, `a93-4` AD Hochfranken | K6/K7; Neubau-Diff gegen die Live-Datei | `9cc8c0c` |
| V-AW-22 | Mit `--osm`: Stücke ≥ 5 km ohne OSM-Fahrbahn der eigenen Nummer **und ohne Messstelle** werden am Abschnittsende abgeschnitten (`a14` −41,5 km, `a143` −13 km; `trimmedKm`) oder innen benannt (`unbuilt`: a14 km 36,5–46,5, a44-2 42–47, a44-5 36–45); dort keine Prognosepunkte; das Band schraffiert dunkel, Legende und Briefing sagen „keine Fahrbahn in OpenStreetMap (im Bau oder anders geführt)". a44-2: OSM führt die A 44 dort 1,4 km neben der DLM250-Achse — deshalb nicht „nicht gebaut". A 60 km 0,5–15,5 trägt Messstellen ⇒ bleibt | K8/K9, G2; R9 (Aufnahme `r9-band-ohne-fahrbahn.png`) | `9cc8c0c` |
| V-AW-23 | Merker `PointStore.derived` (nur der Verzeichnis-Speicher des Producers bietet ihn an; der Browser bleibt unverändert): Manifeste je Datei einmal geparst, Tabellen (learned/stack/clima) einmal gehasht und geprüft. Rückweg `ROAD_FC_MEMO=0` | 400 echte Punkte, 4 Läufe abwechselnd: 24,9–26,2 s gegen 32,4–32,6 s (**−21 %**), Dateien mit Merker byte-gleich; C13/C14 | `5f483df` |
| V-AW-24 | Der Archiv-Job legt `static/points.json` + `geo.json` als .gz mit sha-256-Manifest in `buscosun-archiv/road/fc/v1/static/` ab (nur bei Änderung); fehlen sie im Daten-Repo, holt der Producer sie zurück, prüft die Prüfsumme und pusht sie mit dem Lauf (dann ohne Wiederholungsschutz; kein Konflikt, wenn der Remote sie inzwischen wieder hat) | L3–L5 (lokales Bare-Repo), E4 | `fd27a6a` |
| V-AW-25 | Ein 404 am CDN wird in den Lesern der Radar- und Straßen-Slots einmal über raw.githubusercontent geprüft; „nicht da" erst bei 404 auf beiden Wegen. `?radarraw=0` = altes Verhalten | `verify:radar-fallback` A6/A6b/A9b/B4/B5 (25/25), `verify:road-fc` F5; radar-runs 56/56, layer-erstbild 38/38, radar-repack 55/55, np0-radar 39/39 | `5649871` |
| V-AW-26 | Jeder Lauf schreibt `where.json` (Station → `c/<Korridor>` oder `s/<Land/Reihe>`); die Seite lädt bei einer Station abseits der geöffneten Strecke deren Datei und nennt sonst den Grund | M1/M2, R6 (Kacheln = Datei; Lauf ohne where.json ⇒ „keine Zuordnung …") | `d0c44b3` |
| V-AW-27 | Synthetische Winter-Fixture (`scripts/lib/fixtures/road/winterFixture.mjs`: echter Lauf a8, Luft −18…−22 K, Schnee/Schneeregen in den Stunden 1–12) — benannt synthetisch, nur im Verifier; durch den ersten echten Frost-Lauf aus dem Archiv ersetzen | R7: alle drei Luft-Stufen (9/17/1 Zellen), 14 Schnee-Marken, Kacheln und Zeilen „Schnee…", keine Fahrbahnwörter. Aufnahmen `r7-winter-*.png` | `d0c44b3` |
| V-AW-28 | Der Archiv-Job wird rot (Exit 3 nach der Ablage), wenn der Zeiger der Streckenprognose keinen Lauf jünger als 3 h nennt — dieselbe Grenze wie „veraltet"; er liest das Geschwister `road/fc/v1` des Klons, also ohne Workflow-Änderung | L1/L2 (Aufruf wie im Workflow: 65 min ⇒ 0, 240 min ⇒ 3) | `fd27a6a` |
| V-AW-29 | Reiter Strecke ab 1 440 px: eigene Spalte „Luft zur Ankunft" (zwei kurze Zeilen), der Zusatz unter dem Namen entfällt; darunter wie bisher | R4: 1 440 ⇒ 25/25 Zellen sichtbar, Zeilen 46 statt 82 px; 1 280 ⇒ wie bisher. Aufnahme `r4-strecke-spalte-1440.png` | `d0c44b3` |

### 18.2 Neue Befunde dieser Nacht

| Nr. | Befund | Mehrwert für Jan | Stand / Skizze |
|---|---|---|---|
| **V-AW-35** | **Die Ablage der Streckenprognose im Archiv steht seit 05.10. ≈ 15:36 UTC still.** Seit der Phase FR importiert `roadFc.ts` das Fusion-Register; der Archiv-Job checkt nur `src/road` aus ⇒ `road-fc-archive.mjs` scheitert, `continue-on-error` verdeckt es (Archiv-Index: letzter Lauf 2610051500; die Läufe 18:42 und 21:34 UTC legten nichts ab) | vergangene Prognosen sind nicht nachholbar — jede Stunde ohne Ablage fehlt Gate D | **behoben** (`fd27a6a`): der Vertrag lädt das Register nicht mehr (der Producer reicht den Namen hinein); `verify:road-archive` C5 prüft jetzt auch den Prognose-Archivierer. Wirksam ab dem ersten Archiv-Lauf nach dem Push von `main` |
| **V-AW-36** | Der Producer ist nicht ganz deterministisch: zwei Läufe **ohne** Merker auf denselben Eingaben unterschieden sich an 1 von 400 Punkten (a620@5: σ, T um ≈ 0,2–0,5 K, Böe) — in 1 von 4 Läufen; mit Merker 4/4 gleich, im Prozess wiederholt 0/400. Ursache nicht gefunden (Kandidat: Zeitfristen im Motor, die im Browser Sinn haben und im Producer unter Last greifen) | dieselben Eingaben sollen dieselbe Prognose geben — sonst ist jeder Vergleich verrauscht | Notizen je Punkt mitschreiben und die Fristen des Motors im Producer abschalten oder benennen — buscosun Fusion, Jans Gate |
| V-AW-37 | Achspunkte von a60 km 5–15 rasten weiter nicht ein, obwohl dort Messstellen liegen | Prognose genau auf der Fahrbahn | OSM-Nummer/Klasse dort prüfen (A 60 vermutlich anders getaggt) |
| V-AW-38 | Die Stationsprognosen der Stationen ohne Katalogzeile liegen in Dateien je DWD-Reihe (`s/NB`, `s/SO`, `s/LH` …), nicht je Bundesland | für die Seite gleich (where.json), für Auswertungen uneinheitlich | mit der aktuellen Katalogliste (§18.5) das Land nachtragen |
| V-AW-39 | Der Wiederholungsschutz (`repeatVerdict`, V-AW-31) sieht geänderte statische Dateien nicht: nach dem Einspielen von `points.json` am 06.10. 17:24 UTC übersprang der Lauf 17:58 als Wiederholung; erst 2610061831 rechnete mit 4 569 Punkten | neue Punkte wirken sofort statt bis zu einer Stunde später | Blob-Hash oder `builtAt` von `points.json`/`geo.json` in den Lauf schreiben und in `repeatVerdict` vergleichen |

Beobachtungen außerhalb der Phase: `verify:share` SH6 ist auch im Haupt-Arbeitsbaum rot (Bündel mit CRLF ausgecheckt,
V-AW-15; am Stand vor dieser Nacht gleich). `verify:fusion-release` B2/B3 rot durch `scripts/pruefstand/register-bestand.mjs`
(Phase PS). `verify:pv-cube` (16) und `verify:point-client` (10s) zeitabhängig (im zweiten Lauf grün bzw. wie an HEAD).

### 18.3 Gates (gelaufen 06.10. 00:10–03:20 UTC, PowerShell, ohne `2>&1`)

| Prüfung | Ergebnis |
|---|---|
| `verify:road-fc` | **102/102** (neu J12/J13, C13/C14, F5, L1–L5, M1/M2; E4 geändert); mit `--data` auf den neuen Dateien **108/108** (G2/G5 angepasst) |
| `verify:road-ui` | **64/64** gegen `vite preview` des Baus (neu R1–R9; C3/H3 zählen die Falt-Zeile) — Aufnahmen `audit/autobahnwetter/ui-0610/` |
| `verify:road-contract` | **69/69** (K6–K9) |
| `verify:road-derive` | **36/36** (J1–J4) |
| `verify:road-archive` | 26/26 (C5 erfasst jetzt den Prognose-Archivierer) |
| Radar | `radar-fallback` 25/25 · `radar-runs` 56/56 · `layer-erstbild` 38/38 · `radar-repack` 55/55 · `np0-radar` 39/39 · `regenradar-profile` 35/35 |
| Punktlinie | `verify:pv-cube` 421/421 (erster Lauf 420/421, (16) zeitabhängig) · `verify:point-client` 170/171 ((10s), V-EX-13) |
| Build | grün, `verify-routing` 252/252, `verify-seo` 803 |
| Budget | eagerJs 108,9 / 109 · totalJs **1 555,5 / 1 557** (angehoben 1 553 → 1 557; Kontrollbau e6f7626: +3,6 KB, RoadPage +3,0, radolan +0,26) |
| typecheck | 0 |

Selbstprüfung: (1) Funktionserhalt — alle früheren Prüfungen der Seite grün; geändert nur Zählungen, die das Einklappen
(V-AW-9) bewusst ändert; die Radar-Ebene ist voreingestellt aus. (2) Desktop — sichtbar neu: Leiste im Verlauf (+10 px),
Falt-Zeile im Dock, Ringnamen, ab 1 440 px die Spalte in der Tabelle; sonst gleich (Aufnahmen). (3) Touch — Falt-Zeile mobil
≥ 44 px (H3 grün). (4) Konsole — I1 ohne Ausnahme. (5) Long Tasks — headless nicht messbar; die Radar-Ebene lädt erst beim
Einschalten (eine Werte-Textur ≈ 1,3 MB).

### 18.4 Daten-Paket (Kopie ins Daten-Repo = Jans Gate)

`C:\dev\buscosun-road-publish\2026-10-06\` mit `SHA256SUMS`: `road/v1/static/corridors.json` (141 Korridore: +4 Äste,
a14/a143 gekürzt, 3 mit `unbuilt`; gebaut aus dem DLM250-Cache vom 04.10. und der Meldung 04.10. 20:15 wie die Live-Datei),
`road/fc/v1/static/points.json` (2 755 Achse + 1 814 Stationen, davon 156 ohne Katalogzeile), `road/fc/v1/static/geo.json`
(9 095 Einträge). Bauweg: `build-corridors.mjs --stations=… --obs=… --cache=… --osm=<Overpass-Cache>` (mit TS-Lader), dann
`build-fc-points.mjs --corridors=… --obs=<obs>,<obs> --geo-from=<alte geo.json> --osm=…`. Ohne die neuen Optionen
reproduzieren beide Bauer die Live-Dateien exakt (137/137 Korridore, 4 424/4 424 Punkte). Volllauf des Producers auf dem
Paket: 4 569/4 569 Punkte, 0 ohne Ergebnis, 141 Korridore + 16 Dateien je Land/Reihe, 163 s mit 4 Prozessen.
Achtung: die Kennungen der a14-Achspunkte zeigen nach dem Kürzen auf andere Orte (km zählt ab dem neuen Anfang) — geteilte
Links `st=a14@…` landen dann woanders; alle übrigen Kennungen bleiben.

**Eingespielt 06.10. 17:24 UTC (Jans Freigabe):** Daten-Repo `e5597ba` auf `329b609` (Radar-Commit), gebaut aus frischem
`origin/main` mit temporärem Index (`read-tree` + `update-index --cacheinfo`), nur diese drei Pfade, nicht force; der lokale
Klon `buscosun-data-road` hatte nach einem Force-Push der Kartenlinie keinen gemeinsamen Stand mehr (Workflows und statische
Dateien auf dem Remote gleich oder neuer, nichts verloren). Blob-Hashes auf `main` = Paket; jsDelivr-Purge der drei
`@main`-Pfade, danach CDN-Inhalt per sha256 = Paket. Straßen-Slot `2610061730` des laufenden Spiegels (`d6a03b5`) hat die
neue `corridors.json` behalten (`copyInto`: die Datei im Repo gewinnt). Der Lauf 17:58 übersprang als Wiederholung (V-AW-39);
der erste Lauf der 18-UTC-Stunde `2610061831` rechnete **4 569 Punkte, 0 ohne Ergebnis** (`road-fc-check`: „in Ordnung",
12/12 Dateien über den Leser des Clients).

### 18.5 Anfrage an den DWD (V-AW-7, Text für Jan)

> Betreff: Aktueller Stationskatalog Straßenwetter (sws_stations_xls.xlsx)
> Guten Tag, wir nutzen die Daten der Glättemeldeanlagen von opendata.dwd.de. Der Stationskatalog `sws_stations_xls.xlsx`
> trägt den Stand vom 05.06.2020; 156 derzeit meldende Anlagen fehlen darin (u. a. Reihen FN-NB, JO-SO, LH-LH). Gibt es eine
> aktuelle Fassung (Kennung, Name, Straße, Betriebs-km, Lage, Höhe, Bundesland) oder ist eine geplant? Zudem kommen die
> Ordner LW und SD (Baden-Württemberg) seit Anfang Oktober leer an. Vielen Dank.

### 18.6 Offen für Jan

Push von `main` (sieben Commits; vor 23:10 UTC, damit V-AW-35 mit dem nächsten Archiv-Lauf heilt), Kopie des Daten-Pakets
(§18.4) mit Purge der drei Pfade, optional die Workflow-Kopien (`workflow-road-fc.yml` ohne Pflichtprüfung der Punktdatei,
`workflow-road-archiv.yml` mit erweiterter Meldung — der Code wirkt auch ohne), die DWD-Anfrage (§18.5), V-AW-36
(Motor, Jans Gate), Real-Device der Radar-Ebene (WebGL) auf dem Handy.

## 19. AW-7/AW-8 — Gefahren-Leiste und Detailansicht (13.10.2026, Auto-Modus; Startprompt `audit/autobahnwetter-gefahren-startprompt.md`, Spezifikation `audit/autobahnwetter-gefahren.md`)

> Arbeitszweig `feat/autobahnwetter-gefahren` im verschachtelten Worktree `C:\dev\buscosun-web\.wt-hz` (in `.git/info/exclude`;
> `node_modules` per Aufwärtssuche, keine Junction). Der Haupt-Arbeitsbaum trägt uncommittete Dateien anderer Sitzungen (SE, LM,
> WL, RA) und wurde nicht angefasst; die vier Spezifikationsdateien dieser Phase (Gefahren-Dokument, Startprompt, die zwei
> Gefahren-Vorlagen) und die Nachträge in Plan und Vorlagen-README liegen als Kopie im Zweig. Schalter `ROAD_HZ_LIVE = false`
> (`src/road/roadFlag.ts`), `?roadhz=1` > `localStorage.roadhz` > Konstante; `ROAD_LIVE` unberührt.

### 19.0 Vorprüfung (Startprompt §1) und Stand je Arbeitspaket

| Prüfung | Befund |
|---|---|
| Gefahren-Dokument trägt „Stand im Repo und Voraussetzungen“, E-AW-32…37 | ja (Datei vom 13.10., 240 Zeilen) |
| §18 (sieben Commits, Paket §18.4) auf `origin/main` und im Daten-Repo | ja: `main` = `origin/main` = `8e8646a`; die Punktdatei im Daten-Repo ist vom 06.10. 21:32 UTC (4 569 Punkte), die Korridor-Datei vom 06.10. 00:58 UTC (141 Korridore) — das AF-3-Paket (212 Korridore, `C:\dev\buscosun-road-publish\2026-10-11-af3\`) ist **nicht eingespielt** (`road/fc/v1/index.json`: `corridors: 141`); die Abschnitte dieser Phase sind auf den 141 Live-Korridoren gebaut und müssen nach dem Einspielen von AF-3 neu gebaut werden (§19.9) |
| `git status` des Haupt-Arbeitsbaums | 31 geänderte und 20 neue Dateien anderer Sitzungen — unberührt, Zweig nicht gewechselt |
| `gh` CLI | nicht installiert (wie in §1.3 der Vorgänger); Actions-Stand nur lesend über die REST-API, kein Dispatch, Push-Protokoll ohne `gh run list` |

| AP | Stand | Ergebnis |
|---|---|---|
| AW-7.0 Spike | fertig (§19.1) | Befunde D-1…D-9, fehlende Größen, Hagelkennung, Abschnitte, Größen, nivo |
| AW-7.1 Abschnitte und Eingänge | fertig (§19.2, `1adb627`) | `src/road/roadSegments.ts`, `scripts/road/build-segments.mjs`, `segments.json` (Paket `C:\dev\buscosun-road-publish\2026-10-13-hz\`), Zusatzgrößen in `road/fc` |
| AW-7.2 Regeln | fertig (§19.3, `1342eb6`) | `src/road/roadHazards.ts`, `roadSun.ts`, `roadNarrative.ts`, `verify:road-hazards` |
| AW-7.3 Derive | fertig (§19.4, `da8ab94`) | `scripts/road/road-hazards.mjs` im Spiegel, `hz/`, `state.json`, `status.json`, Wächter |
| AW-8.0 Messbasis | fertig (§19.5) | Kontrollbau `8e8646a`: eagerJs 109,9, totalJs 1 767,5, RoadPage 33,7 KB gz |
| AW-8.1 Leiste | fertig (§19.5) | `RoadHazardPanel.tsx`, `RoadHazardMatrix.tsx`, `roadHzView.ts`, `roadNivoTheme.ts`, Schalter `ROAD_HZ_LIVE`/`?roadhz=1` |
| AW-8.2 Detail | fertig (§19.5) | `RoadHazardDetail.tsx`, `RoadCrossSection.tsx`, `RoadHazardCharts.tsx` (lazy) |
| AW-8.3 Karte, Zeit, Mobil | fertig (§19.5) | Abschnittslinien `aw-segs`, stündliche Zeitchips, Reiter Gefahren, Blatt mobil; `verify:road-ui` Block U |

### 19.1 AW-7.0 — Diagnose (13.10.2026, 16:40–17:10 UTC, nur gelesen und gemessen)

**D-1…D-9 der Datenprüfung (06.10.) im Code und im Live-Slot.** Die Regeln M1–M5 aus `audit/autobahnwetter-datenpruefung.md`
§5.1 liegen auf `main` (`roadContract.ts`: `fillValue`, `dewSpread`, `gustNoWind`, `precipFill` hart, `roadAir` hart mit
Nachbar-Schiedsrichter, Plateau-Deckel 48 Slots, `o`-Kennzeichen, `qf`; Anker-Filter M4 in `swisTable`, `road-forecast.mjs`
Z. 179–214); M6 (Stationslage) ist in `18ab8ca`. Live-Slot `2610131615` (16:15 UTC): 1 190 Punkte, Klassen nass 295 ·
trocken 517 · keine Messung 292 · unbekannt 86, **0 Frostgefahr, 0 Glätte**; Quarantäne 378 Einträge: `precipFill` 116,
`catalog` 92 (Beobachtung), `stateNoTemp` 84, `stuck` 30, `limit` 29, `roadAir` 7, `dewSpread` 6, `neighbours` 6,
`placeholder` 3, `dewAboveAir` 2, `jump` 1, `cube` 1, `outsideDE` 1, `fillValue` 0. Der Lauf `road/fc` `2610131630` nennt
`anchor: swis`, `anchored: 893` (von ≈ 1 200 meldenden Stationen; die ausgefilterten sind die mit Beobachtungs-Treffern, M4).
**Befund: D-1…D-4 sind durch harte Regeln abgedeckt; die Voraussetzung von Gate E ist erfüllt.** D-5/D-6/D-7/D-9 sind
umgesetzt (M5/M6), D-8 (Sägezahn, Motor) bleibt Jans Gate und trifft die Gefahren-Stufen über `t2m` der Prognose-Stunden
(Hinweis in §19.6).

**Was `road/fc/v1` trägt und was fehlt** (`roadFc.ts` `ROAD_FC_VARS`, Lauf `2610131630`): `t`, `ts`, `td`, `pp`, `rr`, `sn`,
`ff`, `fx` (Böe), `dd` (Richtung), `n` (Bewölkung), `cf`, `q`. Böe, Richtung und Bewölkung sind also **schon da** (das
Gefahren-Dokument zählt sie als fehlend). Es fehlen: Schneefallgrenze (im Cube: `vars.snowline` aus `snowlmt`), T850 (Cube-
Zellen `t850`, nur native Schritte), Neuschnee (`runs/` `snowFresh`, 1–24 h), Gewitterpotenzial und Blitzpotenzial (`runs/`
`thunder` 0–12 h stündlich und `lightningfc` 1–12 h, beides ICON-D2, Gitter 608 × 373 mit `ss = 2`), CAPE (`runs/` `cape`,
volle Auflösung, 0–27 h), MOSMIX-Sicht (Stationsebene `vis` des Stationsprodukts; der Producer kennt je Punkt die Station
`mos` mit Abstand). Entscheidung §19.2: Schneefallgrenze, T850 und Sicht kommen als **optionale** Größen in die Laufdatei
(`sl`, `t85`, `vs`; alte Dateien ohne sie bleiben gültig, alte Clients ignorieren sie); Gewitter/Blitz/CAPE/Neuschnee liest
der Gefahren-Derive **direkt aus `runs/`** des Spiegel-Klons (der Radar-Job checkt das Daten-Repo vollständig aus, Zeile 43
der Vorlage; der `road-fc`-Job hat `runs/` nicht im Sparse-Checkout — eine Workflow-Änderung wäre nötig gewesen, V-AW-50).

**Hagelkennung.** Das KONRAD3D-XML führt im Block `intensity` ein `hail_flag` (0/1, in `audit/zellbahnen.md` an 38 Zellen
gezählt: 30 × 0, 8 × 1) und im Block `hymec` `area_hail`/`area_large_hail`; der Parser (`src/radar/konrad3d.ts`) liest beides
(`hailFlag`, `hailAreaKm2`, `largeHailAreaKm2`). ⇒ `hagel` Stufe 2 ist aus dem Spiegel-Produkt `img/konrad3d/<Stempel>/cells.json`
möglich. Zellen gibt es nur in ≈ 150 km um die deutschen Radare (Phase ZO) — für die DE-Korridore vollständig.

**Abschnitte.** Overpass liefert für Deutschland **13 463** Knoten `highway=motorway_junction` (Stand 2026-10-13T16:49Z,
3,8 MB, `lz4.overpass-api.de` in 48 s; `overpass-api.de` antwortete 504), davon 11 299 mit Namen, 7 813 mit Nummer; Cache
`C:\dev\buscosun-road-publish\cache\osm-junctions-de-2026-10-13.json`. Der Motorway-Auszug vom 11.10. (71 226 Wege) trägt
`bridge` an 14 797, `surface=concrete` an 8 122, `embankment` an 1 050, `cutting` an 178, `tunnel` an 357 Wegen. Probe an
A 8 und A 93 (§19.2): 87 Knoten → 45 Abschnitte, 5,1–11,9 km, Median 7,8 km.

**MOSMIX-Sicht.** Der Producer ordnet jedem Punkt die nächste MOSMIX-Station zu (`mos: [id, km]`); die Sichtebene `vis` steht
seit AX-11 in `point/stations` (MOSMIX-L) und `stations-s`. Abdeckung ≤ 20 km wird beim ersten Producer-Lauf gezählt (§19.2).

**PNG-Lesen von `runs/` in Node.** `scripts/lib/png.mjs` (`decodePng`, `toRgba`, `node:zlib`) liest die Repack-Bilder ohne neue
Abhängigkeit; Kanal R = Wert · 255 über `vMin…vMax` der Familie, Alpha 0 = außerhalb der Domäne (`scalarFrameBuild.ts`).

**Höhenmodell.** DE: statt BKG DGM200 die Terrarium-Kacheln z11 (Mapzen/AWS), mit denen die Streckenprognose ihr Gelände
rechnet (`geo.json`, `terrain.ts`) — eine Quelle für Punkt-Höhe, TPI und Achsen-Steigung, keine zweite Lizenz (E-AW-38, §19.7).
AT/CH entfallen in v1 (E-AW-12).

**DWD-Streckenlage/-belag.** Der Katalog `sws_stations_xls.xlsx` (v=11) enthält nur `sheet1` mit den Codes `lage` 0–8 und
`belag` 0–7; das im Konzept genannte Register „Typen“ fehlt in der Datei, die Codetabelle ist nirgends belegt ⇒ Damm- und
Betonlage kommen in v1 **nur aus OSM** (`embankment`, `surface=concrete`), die DWD-Codes bleiben ungenutzt (V-AW-48).

**Größenbudget `hz/`.** Gemessen am ersten Derive-Lauf (§19.4); Erwartung aus der Datenform: je Abschnitt mit Stufe ≥ 1 ≈ 250–400
Bytes, ein Winterslot mit 600 Abschnitten ≈ 200 KB, ein ruhiger Herbstslot ≈ 10–30 KB — weit unter 20 MB je Datei.

**nivo.** Installiert `@nivo/core`, `@nivo/line`, `@nivo/radar` **0.99.0**; `@nivo/heatmap`, `@nivo/bullet`, `@nivo/polar-bar`
sind in 0.99.0 auf npm, Peer `react ^16.14 || ^17 || ^18 || ^19`, Abhängigkeiten `@nivo/*` 0.99.0 und `@react-spring/*`
(wie `@nivo/line`) ⇒ kein Upgrade, kein Peer-Konflikt (E-AW-35 ausführbar). Der Verifier `verify:fire-clusters` prüft die
Liste der Laufzeit-Abhängigkeiten Zeichen für Zeichen — er wird mit den drei Paketen und dem Verweis auf E-AW-35 fortgeschrieben.

**Rendering der Vorlagen.** Alle vier Boards über `scripts/lib/cdpBrowser.mjs` (file://, DPR 1) gerendert und angesehen
(`audit/autobahnwetter/hz/boards/*.png`): Leiste = Reiter Gefahren · Strecke · Quellen, Kopf „Gefahrenlage DACH · 11 Abschnitte
mit Hinweisen“, Zeitraum Jetzt / Bis +6 h, Matrix 7 × 7, Legende, Filter-Chips, Gruppen mit Zeilen (Stufenbalken, Schild,
Name, Gefahr · km · Richtung, 7-Stunden-Streifen, „seit/ab/bis“, Stufen-Chip, Nachweis); Detail = Kopf mit Zurück und „2 / 11“,
Abschnittskarte, Richtungs-Schalter, Chips der Gefahren, Querschnitt, Detailtext, Fahrplan −2…+6 h, Temperaturen −12…+6 h, …

### 19.2 AW-7.1 — Abschnitte und Eingänge (13.10.2026)

**Vertrag `src/road/roadSegments.ts`** (importfrei bis auf die Achsgeometrie aus `roadFc.ts`): Abschnitt = Stück eines
Korridors zwischen zwei OSM-Knoten `highway=motorway_junction`, 5–25 km (`ROAD_SEG_MIN_KM`/`MAX_KM`; kürzere mit dem kürzeren
Nachbarn vereint, längere in gleiche Teile geteilt), Name „von – bis“ aus den Knotennamen, Kennung `<Straße>-<km-Beginn 3-stellig>`
(`A8-034`), bei Korridoren mit Zusatz `A8.2-000` (**V-AW-47**, s. u.). Stützpunkte = die Achspunkte der Streckenprognose im
Abschnitt (mindestens der nächste), Stationen im Abschnitt und bis 5 km davor/dahinter (`stations`/`near`), Peilung je
1-km-Stück (`bearings`, Eingang von `sonne` und `quer`), Ortsmerkmale je Feld mit Quelle im Kopf: Brücken-, Tunnel-,
Einschnitt-, Damm- und Betonanteil der Achse plus die Brücken ≥ 100 m (OSM-Wege, Abtastung alle 100 m), Wald im 50-m-Band und
Acker im 1-km-Band (ESA WorldCover, 37-m-Ebene des Spiegels), Höhe und steilstes 1-km-Stück (Terrarium z11), Niederung (TPI 2 km
≤ −30 m an einem Stützpunkt aus `geo.json`), freie Lage. Parser `parseRoadSegments` (Kennungen eindeutig, Peilungen 0…359,
Anteile 0…1). Die Datei ist eine abgeleitete Datenbank aus OSM ⇒ `license: ODbL 1.0`, Quellenvermerk im Kopf.

**Bauer `scripts/road/build-segments.mjs`** (von Hand/monatlich; Eingaben: Korridore, Punkte, `geo.json`, Motorway-Auszug und
Knoten-Cache unter `C:\dev\buscosun-road-publish\cache\`, Kachel-Caches für Terrarium und WorldCover ebendort): Knoten ≤ 120 m
neben der Achse, beide Fahrbahnen mit gleichem Namen innerhalb 1,5 km = ein Knoten (km-Mittel). Ergebnis auf den 141
Live-Korridoren (13 101 km): **1 629 Abschnitte, 3 446 Knoten, Länge min 2,3 (Korridore kürzer als 5 km, 16 Stück) · p50 7,5 ·
max 24,3 km; 574 Knoten-zu-Knoten, 1 017 vereint, 38 Korridorenden, 0 geteilt; 1 235 mit einer GMA in Reichweite, 394 ohne
(dort gilt jetzt der Nachweis Prognose); Brücken 1 296, Beton ≥ 20 % 339, Wald ≥ 30 % 868, Acker ≥ 50 % 285, Steigung ≥ 4 % 490,
Niederung 110, freie Lage 92; 1 036 Terrarium-Kacheln, 14 WorldCover-Dateien, 63 s mit warmen Caches** (erster Lauf ≈ 20 min
Netz). Datei 941 KB roh / **191 KB gz** — weit unter 20 MB; Paket `C:\dev\buscosun-road-publish\2026-10-13-hz\road\v1\static\segments.json`.
Probe A 8: 28 Knoten → 15 Abschnitte (München – Unterhaching-Ost 6,2 km … Anger – Salzburg 8,5 km), Weyarn – Irschenberg
km 34,2–44,4 mit Steigung 7,0 % bei km 42,7–43,7, Wald 39 %, 1 Brücke; Irschenberg – Bad Aibling Gefälle 8,7 %.

**Zusatzgrößen in `road/fc/v1`** (`roadFc.ts`, optional — Läufe vor dem 13.10. bleiben gültig, alte Clients ignorieren sie):
`sl` Schneefallgrenze (`vars.snowline` des Cube-Pfads), `t85` T850 (Cube-Zelle an den nativen Schritten, dazwischen linear,
`t850At`), `vs` MOSMIX-Sicht der Stationsmitglieds-Station, nur ≤ 20 km (`stationVisSeries`: Stationsmanifest + `readStationPoint`,
Ebene `vis`, je Lauf und Station einmal gelesen). Gewitter-/Blitzpotenzial, CAPE und Neuschnee liest der Gefahren-Derive aus
`runs/` des Spiegel-Klons (§19.1). Gates: `verify:road-fc` 107/107, `verify:road-contract` 111/111, `verify:road-derive` 36/36
unverändert grün (die Zusatzgrößen ändern keine bestehende Prüfung). Wirksam wird der Producer-Teil mit dem Push von `main`
(der `road-fc`-Job klont `main`).

### 19.3 AW-7.2 — Regeln, Sonnenstand, Detailtext, Verifier (13.10.2026)

**Vertrag `src/road/roadHazards.ts`**: Katalog der 16 Gefahren in 7 Gruppen (feste Reihenfolge = Rang; `max` 2 für Gischt, Sonne,
Bäume; Staub `observeOnly`; Sonne `perDirection`), **jede Schwelle eine benannte Konstante** in `ROAD_HZ_T` je Gefahr mit Herkunft
im Kommentar (alle `set`, Startwerte des Gefahren-Dokuments), Eingangsalter `ROAD_HZ_INPUT_AGE_MS` (obs 45 min, RV/KONRAD 15 min,
fc 3 h, `runs/` 6 h `set`), Deckelung `ROAD_HZ_CAP_P = 2`. `evaluateSegment(input)` ist eine reine Funktion über `HzSegmentInput`
(Stationen mit Trend, Luft-Verlauf 3 h, Tagesmaximum und `suspect`; Stützpunkte mit 7 Stundenwerten; Radar; Zellen; Zustand;
fehlende Eingänge): je Gefahr und Stunde der beste Kandidat (höchste Stufe, bei Gleichstand gemessen vor abgeleitet vor Prognose),
Nachweis `m` nur bei Stunde 0, `p` gedeckelt; fahrbahnabhängige Glätte in +1…+6 h als **Fortschreibung** der jetzigen Stufe, solange
Cube-T2m ≤ +1 °C, sonst Proxy (bis Gate D, E-AW-34); **Messlücke** (GMA des Abschnitts verworfen, keine gültige in Reichweite) ⇒
Reif/Nässe/Gefrierender Regen/Schnee/Aquaplaning/Gischt jetzt `null` mit `why: gap:<id>`, nie aus dem Modell aufgefüllt; Messung
fehlt (obs zu alt) ⇒ unbekannt überall, wo ein Abschnitt sonst Messpunkte hat; Brücke/Schattenlage heben die Tf-Schwelle der Stufe 1
um 1 K (Lesart des Satzes „senken die Tf-Schwelle um 1 K“, **V-AW-49**); Brücken, Dämme, Waldschneisen senken die Seitenwind-Schwellen
um 10 km/h; Sonne je Fahrtrichtung über die Stück-Peilungen (`roadSun.ts`, NOAA-Algorithmus, Verifier F1–F3 gegen drei
astronomische Referenzen ≤ 0,5°: Äquinoktium-Zenit, wahrer Mittag München zur Sommersonnenwende 65,31° gegen 65,30°, Hamburg zur
Wintersonnenwende gegen die sphärische Formel). Sperren: `roadHzEntryProblems` (Form, `m` in der Zukunft, Stufe 3 bei max 2, Prognose
über der Deckelung, Stufe ohne `why`, Glätte gemessen ohne GMA im Abschnitt), `roadHzConsistencyProblems` (Hitze bei T2m < 25 °C,
Schnee 3 bei T2m > 6 °C ohne Messcode, Nebel 3 ohne Sicht < 50 m), Beobachtungs-Statistik (Anteil > 60 %, Sprung > 3×) nur in der
Bilanz. Dazu `parseRoadHz`, `roadHzFreshness` (45 min / 3 h), `roadHzSummary` (Matrix Gruppe × Stunde, je Gefahr, gesamt).

**Sensorfehler, am echten Slot gefunden (13.10. 17:00 UTC) und abgefangen:** M080 Heringen trug im Ring −15,9 °C Luft nach −30 K in
75 min (jetzt verworfen, `x.ta`), Q290 Wolfskopf meldete Fahrbahn = Luft = −0,01 °C mit `o: jump/cube` (273,14 K — der Füllwert-Test
greift nur bei exakt 0,00/−1,00, **V-AW-48**), E217 Filsum Luft 29,25 °C mit `o: cube`. Ohne Schutz wurden daraus „erster Frost“,
„Temperatursturz Stufe 2“ und ein Sturz −16,5 K aus dem verankerten Prognosewert. Jetzt: Stationen mit Beobachtungs-Treffer oder
verworfener Luft sind `suspect` und tragen weder zu erstem Frost, Temperatursturz noch Hitze bei; gemessene Abkühlungen über 10 K/h
gelten als Gerätefehler; Sturz-Paare nur innerhalb EINER Anlage bzw. EINES Punkts. Verifier D8c/D8d/I7.

**Detailtext `src/road/roadNarrative.ts`**: Satzbausteine in der Reihenfolge des Dokuments (Fahrbahn jetzt mit Wert, Quelle, Uhrzeit;
warum; Ortsmerkmale ohne Messung; Ausblick „Laut Prognose von buscosun Fusion ‹n›: … Prognose-Stufen sind in Erprobung und auf Stufe 2
begrenzt“; nicht messbar; unbekannte Stunden mit Grund und „keine Entwarnung“). Verbotene Wörter als Regex-Liste
(`ROAD_NARRATIVE_BANNED`), Uhrzeiten Europe/Berlin aus den `why`-Zeitstempeln (ms, nicht UTC-Text). Zwölf goldene Texte in
`scripts/lib/fixtures/road/hz/golden/` (Reifnacht, Warmfront, Nebelmorgen, Sturm auf der Talbrücke, Sommergewitter, Hitze auf
Beton, erster Frost, tiefe Sonne, Messlücke, Aquaplaning, Schnee, Temperatursturz).

**`verify:road-hazards` — 91/91** (`scripts/verify-road-hazards.mjs`; Fixtures `scripts/lib/fixtures/road/hz/`: vier echte
Abschnitte, die zwölf Stationen des Slots 2610131700, der Lauf 2610131712, 82 KB): A Katalog · B Glätte (14 Fälle inkl.
Fortschreibung, Proxy, Brücke) · C Aquaplaning/Sicht/Wind (Sonne am 15.11. auf der A 8 genau in den Stunden mit Sonne 0–15° und
≤ 25° neben einer Richtung) · D Gewitter/Hagel/Hitze/Wetterwechsel · E D-04 (Prognose fehlt, Messung fehlt, Messlücke mit
Gegenprobe, Radar zu alt, Deckelung) · F Sonnenstand · G Sperren, Parser, Zusammenfassung · H Abschnittsvertrag und Bauer (Vereinen/
Teilen, Knoten-Cluster, km auf der Linie) · I Derive-Leser (RV-Pixel München 669/936, KONRAD-Zellen über/Zugbahn, Stationseingang)
und Derive Ende zu Ende auf dem Fixture-Bestand (veröffentlicht, fehlende Eingänge benannt, Zustand gemischt, deterministisch,
Spiegel-`copyInto` erhält `segments.json`) · J goldene Texte, verbotene Wörter, jede Zahl mit Quelle im Satz.

### 19.4 AW-7.3 — Derive im Spiegel (13.10.2026)

`scripts/road/road-hazards.mjs` (Kindprozess wie `road-derive.mjs`; Aufruf `<store> <img> <root> <out> <stamp>`): liest `obs/<stamp>`
und die jüngsten Ringe je Reihe (Trend, Luft 3 h, Tagesmaximum), `static/segments.json`, den jüngsten `road/fc/v1`-Lauf ≤ 3 h
(Korridor-Dateien je Abschnitt, Stunde = nächster voller Schritt), den jüngsten RV-Slot ≤ 15 min aus `img/rv/<stempel>/` (Analyse
`f000`/`g000` log-Kanal, Nowcast-Frames 5…60 und 65…120 min als Maximum je Stützpunkt-Pixel, polar-stereografisch über `psFwd`),
den jüngsten KONRAD3D-Lauf ≤ 15 min (`cells.json`: Abstand, Hülle über Stützpunkt, erste Zugbahn-Minute ≤ max(5 km, kleine
Halbachse), Hagelkennung), den jüngsten Repack-Lauf ≤ 6 h aus `index.json` + `runs/<lauf>/*.png` (thunder, lpi, cape, snowfresh;
nächstes Pixel, Alpha 0 = außerhalb). Fehlt oder altert ein Eingang, steht er in `missing` und die betroffenen Gefahren sind `null`.
Schreibt atomar `hz/<stamp>.json`, `state.json` mit dem Block `hz` (Zustand je Abschnitt: Stufe-2-Slots, erster Frost, heiße Tage,
Trockenstunden; die Messlinie bleibt unberührt — der nächste `road-derive`-Lauf schreibt `state.json` neu, deshalb liest der
Gefahren-Derive den Block vom Vorlauf) und `summary.json`.

**Spiegel-Haken `road-mirror.mjs`:** nach jedem GRÜNEN `obs`-Slot `deriveHazards(stamp)` (Fehler sperrt nie die Messung; `hz/` bleibt
beim letzten Slot), Aufbewahrung `hz/` wie `obs/` (3 h, ≥ 2), `status.json` Block `hz` (letzter/freigegebener Slot, Sperre, fehlende
Eingänge, Bilanz je Gefahr, Beobachtung, Laufzeit), `recent[].hz` je Slot (Gate-E-Reihe), `copyInto` übernimmt `static/segments.json`
aus dem Repo wie `corridors.json`; `ROAD_HZ=0` schaltet den Schritt ab, `ROAD_HZ_KILL=1` schreibt leere Slots. Keine Änderung am
Spiegel-Kern des Daten-Repos, keine Workflow-Änderung (der Radar-Job checkt das Daten-Repo vollständig aus und klont `src` + `scripts`
von `main`).

**Lokaler Lauf am Slot 2610131700** (Store = frischer Sparse-Klon, Bilder vom 17:05 UTC, Lauf 2610131712 „buscosun Fusion 12“,
Repack 2026101315 mit allen Schritten): 1 629 Abschnitte, **391 mit Stufe, 5 unbekannt (Messlücken: H267, P309 …), 0 verworfen,
`missing: []`; Datei 77 KB; 25 s** (davon ≈ 20 s PNG-Dekodierung der 25 RV-Frames und 50 Repack-Schritte, V-AW-52). Bilanz: Nebel 292
(Proxy T2m − Td2m ≤ 1 K bei schwachem Wind am Abend — Gate E muss den Proxy kalibrieren, V-AW-53), Gischt 73, Seitenwind 37 (Böen
35–39 km/h quer auf Abschnitten mit Brücken ⇒ Stufe 1 ab 35 km/h), Aquaplaning 22 (Wasserfilm ≥ 0,5 mm, z. B. A866 1,6 mm),
Glätte/Gewitter/Hagel/Hitze/erster Frost/Sturz 0. Wächter: `health-manifests.mjs` R6 (hz-Slot ≤ 45 min) und R7 (keine fehlenden
Eingänge), `verify:health` 44/44.

### 19.5 AW-8 — Gefahren-Leiste, Detailansicht, Karte, Zeit, Mobil (13.10.2026, hinter `ROAD_HZ_LIVE = false` / `?roadhz=1`)

**Schalter.** `src/road/roadFlag.ts`: `ROAD_HZ_LIVE = false`, `roadHzFlagFrom(search)` (`?roadhz=0|1` schlägt `localStorage.roadhz`,
das schlägt die Konstante — Muster D-31 wie `?road=`), `rememberRoadHzFlag`. `RoadRoute` liest den Schalter, übergibt ihn
an `RoadPage` (`hz`) und an `parseRoadUrl(slug, search, hz)`: ohne Schalter ist die URL-Grammatik die von AW-6.1b (Reiter
`station|strecke|quellen`, `t` ∈ {0, 1, 3, 6}); mit Schalter kommen `seg=<Abschnitt>` und `hf=<Gruppe>` dazu, `t` wird
stündlich (0 … 6, `ROAD_HZ_TIMES`), Voreinstellung des Reiters `gefahren` (`ROAD_HZ_DEFAULT_TAB`). Ohne Schalter ist die
Seite die von vorher: `verify:road-ui` Blöcke A–T unverändert grün (der einzige Eingriff dort: A4 zählt seit dem Gletscher-
Merge `8e8646a` 13 Werkzeuge statt 12 — Bestand, nicht AW-8).

**AW-8.0 Messbasis (Kontrollbau).** Merge-Basis `8e8646a` in einem eigenen Worktree gebaut (`.wt-ctl`, gleiche
`node_modules`): eagerJs **109,9 KB** (Ratsche 110), totalJs **1 767,5 KB**, größter Chunk 278,4 (maplibre); RoadPage-Chunk
33,7 KB gz, dazu der geteilte nivo-Chunk (`nivo-line`, 106,4 KB gz — die Seite lud ihn schon vor AW-8 für den Verlauf).

**AW-8.1 Leiste (Lage).** `src/road/RoadHazardPanel.tsx` + `RoadHazardMatrix.tsx` (`@nivo/heatmap`, eigene Zelle als
`<g role="button" tabIndex=0>` mit versteckter Tabelle, Farbe = höchste Stufe im Fenster, Nachweis als Punkt/Halbkreis/Ring),
Kopf „n Abschnitte mit Hinweisen" + Untertitel (Slot, Land, fehlende Eingänge), Modus „Jetzt | Bis +6 h", Filter-Chips je
Gruppe mit Zahl, sieben Gruppen (Glätte, Aquaplaning, Sicht, Wind, Gewitter/Hagel, Hitze, Wetterwechsel) mit Zeilen als
`<button>` (Name, Spanne in km, „beide Richtungen"/Richtung bei Sonne, Stufe, Nachweis, 7-Stunden-Streifen, „außerdem: …");
Reihenfolge Stufe ↓ → Nachweis (m vor d vor p) → Beginn; „unbekannt" schraffiert zuletzt. ↑/↓ wechseln die Zeile, Enter
öffnet, Zelle der Matrix setzt Filter + Stunde (gemeinsamer Zeitzustand mit den Zeitchips der Karte). Sicht: `roadHzView.ts`
(`hzGroupRows`, `hzMatrix`, `rowOrder`, `bestInWindow`, `windowOf`), Theme `roadNivoTheme.ts` (`AW_SEV`, Token
`--aw-sev-0…3`, `roadNivoTheme`, `useReducedMotion`). Zustände: `loading`, `not-there` („Gefahrenlage derzeit nicht
verfügbar … keine Entwarnung", Messung und Band bleiben), `stale` (Hinweis, Leiste bleibt), `dead`, `no-segments`,
`invalid`.

**AW-8.2 Detail.** `RoadHazardDetail.tsx` (Kopf „Abschnitt · DE · Messung", Schilder, Name als `h2` mit Fokus beim Öffnen,
Position „i / n", Vor/Zurück, Esc = zurück; Richtungs-Schalter nur bei Sonne; Chips der aktiven Gefahren; Querschnitt
`RoadCrossSection.tsx` (SVG, Fahrbahn mit Sensorlage, Brücke, Wald, Damm, Zustand am Sensor als Text), Detailtext aus
`roadNarrative` (Jetzt / Ausblick „laut Prognose" / „Nicht messbar" / „unbekannt"), Fahrplan 7 Stunden × 2 Zeilen
(`planRows`, Stufe + Nachweis je Zelle), Diagramme als eigener Lazy-Chunk `RoadHazardCharts.tsx` (`@nivo/line` Temperaturen
−12 … +6 h mit Fahrbahn/Luft/Taupunkt, `@nivo/bullet` vier Schwellen-Zeilen Tf/Td-Spanne/Böe/Sicht, `@nivo/polar-bar`
Windrose Böe jetzt + Querwind) — jedes mit `role="img"`, `aria-label`-Kurzbeschreibung und versteckter Tabelle; Ortsmerkmale
(`featureRows`), Messpunkte des Abschnitts (im Abschnitt und in Reichweite, Klick = Stationskarte darunter), amtliche
Warnungen (Zitat), Herkunft (Quellen je Nachweis, OSM ODbL, WorldCover, Terrarium). Lade-Zustand der Diagramme ohne
Layout-Sprung (feste Höhen).

**AW-8.3 Karte, Zeit, Mobil.** `RoadMap.tsx`: Quelle `aw-segs` mit Ebenen `aw-seg-halo`/`aw-seg-outline`/`aw-seg`
(Linie = Stück der Korridorachse `stretchLine(kmFrom, kmTo)`, Farbe = höchste Stufe im Fenster, „unbekannt" gestrichelt,
Auswahl mit Halo, Hover aus der Leiste, Klick = Detail; Testhaken `data-segs`/`data-segSel`). Zeitchips der Karte werden mit
dem Schalter stündlich (Jetzt · +1 … +6) und teilen den Zustand mit Leiste und Detail (`setTimeShared`); die Legende bekommt
den Block „Gefahren · jetzt/+n h". Reiter mit Schalter: Gefahren · Strecke · Quellen (Quellen nennt die Gefahren-Ableitung
und OSM/ODbL, `HZ_SOURCES`). Mobil (≤ 767 px): Leiste im Blatt als Reiter Gefahren, Matrix waagerecht scrollbar, Zeilen und
Buttons ≥ 44 px, Detail im geöffneten Blatt (Block U10). Reduced Motion: nivo-Animationen aus (`useReducedMotion`).

**Lazy-Schnitt (nach der ersten Messung nachgezogen).** Die erste Fassung importierte Leiste und Detail statisch — ein
Besucher ohne Schalter hätte den RoadPage-Chunk von 33,7 auf 67,7 KB gz wachsen sehen (Heatmap + Leiste). Jetzt sind
`RoadHazardPanel`/`RoadHazardDetail` `React.lazy` in `RoadPage` (Suspense-Fallback „Gefahren werden geladen …"); ohne
Schalter lädt kein Byte davon.

**Messung nach dem Schnitt (Bau dieses Arbeitsbaums, gzip -9).**

| Chunk | vorher (`8e8646a`) | nachher | Bemerkung |
|---|---|---|---|
| eagerJs | 109,9 | **109,9** | unverändert (Ratsche 110) |
| RoadPage | 33,7 | 45,1 | ohne Schalter geladen: Schalter-Logik, URL-Grammatik, Zeitchips, `segLines` |
| Leiste + Detail (`RoadHazardPanel`) | — | 14,9 (+ `nivo-legends` 93,0 = 106,2 KB erst mit Schalter) | nur mit Schalter |
| Diagramme (`RoadHazardCharts`) | — | 12,8 (+ `nivo-line` 18,4) | erst beim ersten Detail |
| nivo geteilt | 106,4 (`nivo-line`) | 93,0 (`nivo-legends`: core, heatmap, bullet, polar-bar) + 18,4 (`nivo-line`) | Rollup gruppiert @nivo/core+heatmap+bullet+polar-bar und @nivo/line neu |
| Pfad-Last ohne Schalter (statischer Importschluss ab RoadPage, 18 Chunks) | 437,4 | 448,9 | +11,5 = RoadPage; V-AW-59: der Gefahren-Vertrag und die Leser könnten mit dem Schalter nachgeladen werden |
| totalJs | 1 767,5 | **1 821,6** | Ratsche 1 772 → 1 825 mit Notiz in `budget.json` (Jan 30.09.) |

**Verifier.** `verify:road-ui` **102/102 (sechs Läufe bis dahin: 90 → 96 → Syntax → 100 → 101 → 102; die letzte Hürde U7 war das entprellte URL-Schreiben der Route, der Verifier wartet jetzt darauf)** (Block U: U0 echter Derive auf dem Fixture-Bestand + Szenario-Einträge, U1 Schalter
aus = Seite von vorher, U2 Leiste, U2b Reihenfolge, U2c Karte, U3 Zeitraum/Matrix/gemeinsame Zeit, U4 Tastatur, U5 Detail,
U6 Diagramme (nachgeladen, a11y, keine Google-Fonts-Anfrage), U7 Vor/Zurück/Esc, U8 Messpunkt → Detail + Quellen, U9 kein
Slot, U10 mobil); Bilder `audit/autobahnwetter/hz/ui/u2-gefahren-lage.png`, `u5-gefahren-detail.png`, `u10-mobil-gefahren.png`.
Drei Verifier-Fehler aus der ersten Fassung des Blocks: Enter über CDP ohne `text: '\r'` löst keinen Klick aus; die
Band-Markierung nennt den Stationsnamen, nicht die Kennung (Auswahl jetzt über die km-Lage); A4 zählte 12 statt 13 Werkzeuge.
Vier, nicht drei: U2c las den Karten-Haken, bevor die Karte ihr `load` hatte (die Leiste steht früher) — wartet jetzt;
U5 erwartete am Querschnitt die Szenario-Stufe („Reif“), der Querschnitt zeigt aber die MESSUNG des Slots (Weyarn 10:00:
trocken, +18,4 °C) — so gewollt (Messung am Sensor, Stufe im Text), Erwartung korrigiert. Dabei gelesen: **V-AW-57**
(`apply` wartet auf `isStyleLoaded()`, also auf jede Kachel — Bestand, unverändert gelassen).
Weitere Gates: `verify:road-hazards` 91/91, `verify:road-fc` 107/107, `verify:road-contract` 111/111, `verify:road-derive`
36/36 (I1 nach der R6-Regel „wartet auf `static/segments.json`" wieder grün), `verify:health` 44/44, `verify:fusion-release`
30/30, `verify:fire-clusters` 108/117 (Basis 107/117 — die neun sind die bekannten BP/BD-Textprüfungen; die Abhängigkeitsliste
mit `@nivo/heatmap`/`bullet`/`polar-bar` ist grün), `verify:seo` 803, `verify:routing` 260/260, typecheck 0.

**Vergleich mit den Vorlagen (`reference/autobahnwetter-gefahren*.dc.html`, Bilder `audit/autobahnwetter/hz/boards/`).**
Struktur übernommen: rechte Spalte 400 px mit Reitern, Kopfzeile, Matrix Gefahr × Stunde mit Farbe = höchste Stufe,
Chips, Gruppen mit Zeilen (Name, km-Spanne, Stufe, Nachweis, Streifen), Detail mit Kopf, Chips, Querschnitt, Text, Fahrplan,
Diagrammen, Merkmalen, Messpunkten, Herkunft. Abweichungen, jede benannt: (a) die Vorlage trägt je Fahrbahn eine Zeile
(`A8-034-R1`), hier eine je Strecke mit Richtung nur bei Sonne (V-AW-47); (b) Matrix 7 × 7 statt 7 × 6 (Stunde „jetzt" dazu);
(c) Zeitchips stündlich statt +1/+3/+6 (E-AW-41); (d) Windrose zeigt Böe jetzt + Querwind-Anteil, keine Vorhersage je
Sektor (die Laufdatei trägt u/v je Stunde nur am Achspunkt, kein Sektorprofil); (e) die Stationskarte unter dem Detail nur
für Stationen des Abschnitts (V-AW-56); (f) Schrift League Spartan + Inter aus `src/fonts.css`, keine Google-Fonts-Anfrage
(U6 prüft es). Pixelvergleich: Vorlage und Seite tragen verschiedene Daten (Vorlage Reifnacht mit erfundenen Werten, Seite
Fixture 03.10. 08:00 + Szenario) — ein Pixel-Diff wäre eine Zahl ohne Aussage (wie §6 der Vorgängerphase, 33,2 %); die
Struktur ist am Bild geprüft.

**Fünf Fragen (Gate).** 1 Funktionserhalt: ohne Schalter Blöcke A–T grün (U1: Reiter Station · Strecke · Quellen, keine
Leiste im DOM, vier Zeitchips); 2 Desktop ohne Schalter pixelgleich — kein Diff-Lauf (die Shots `desktop-1440*.png` des
Verifiers entstehen neu und zeigen dieselbe Seite; ein byte-genauer Vergleich gegen die Basis-Shots steht aus, V-AW-58);
3 Touch-Targets: U10 misst jeden sichtbaren Button der Leiste ≥ 44 px; 4 Konsole: I1 keine ungefangene Ausnahme in allen
Abläufen; 5 Long Tasks: in headless-shell nicht messbar (Real-Device = Jan, wie bisher); das Detail lädt die Diagramme
nach dem ersten Paint.

### 19.6 Entscheidungen dieser Sitzung (Auto-Modus — Jan bestätigt oder ändert)

| Nr. | Frage | Entscheidung | Preis, wenn falsch |
|---|---|---|---|
| E-AW-38 | Höhenmodell für Höhe und Steigung der Achse | **Terrarium z11** (Mapzen/AWS), dieselbe Quelle wie Gelände und `geo.json` der Streckenprognose — eine Quelle, keine zweite Lizenz; BKG DGM200 nicht angebunden | Steigung ≈ 30–50 m Rasterauflösung; beim Wechsel auf DGM200 `build-segments.mjs` um einen Leser erweitern, Datei neu bauen |
| E-AW-39 | Nebel-Proxy der Prognose (T2m − Td2m ≤ 1 K bei Wind < 3 m/s) | wie im Dokument, Stufe 1 mit Nachweis p; am 13.10. 17 UTC 292 von 1 629 Abschnitten — zu viele für einen Abend ohne gemeldeten Nebel | Leiste voller Stufe-1-Nebel; Gate E: Proxy an den gemessenen Sichtweiten kalibrieren (z. B. Spanne ≤ 0,5 K, rF ≥ 97 %) |
| E-AW-40 | Fortschreibung fahrbahnabhängiger Glätte bis Gate D | jetzige Stufe gilt in +1 … +6 h, solange die kälteste Cube-T2m des Abschnitts ≤ +1 °C bleibt (Nachweis p, gedeckelt auf 2), sonst Proxy | eine Reif-Stufe bleibt stehen, obwohl Sonne die Fahrbahn erwärmt — bis AW-6.2 ehrlich als „fortgeschrieben“ benannt |
| E-AW-41 | Zeitraster der Gefahren | `hours[i] = Slot + i h` (Slot 17:15 ⇒ 18:15 …), Prognosewerte vom nächsten vollen Stundenschritt | eine Viertelstunde Versatz zwischen Sonnenstand (exakt) und Prognose (volle Stunde) |
| E-AW-42 | Radar-Nowcast der Stunden +1/+2 | Maximum der 5-min-Frames 5…60 bzw. 65…120 min an den Stützpunkt-Pixeln (nicht das Stundenmittel) | Aquaplaning-Stufe aus einer Spitze; das Stundenmittel `m060.png` wäre milder — Gate E entscheidet |
| E-AW-43 | Messung fehlt (obs zu alt) | fahrbahnabhängige Gefahren jetzt unbekannt, wo der Abschnitt sonst Messpunkte hat; Abschnitte ohne jede GMA rechnen wie immer aus dem Modell (p) | bei DWD-Ausfall zeigt die Leiste viele „?“ statt Modellwerte — gewollt (D-04) |
| E-AW-44 | Hitze (`blowup`) ohne bekannten Belag | kein Eintrag (nicht „unbekannt“): die Gefahr gilt dort als nicht anwendbar, das Detail sagt es nicht aktiv | — |

### 19.7 Befunde und Verbesserungen (V-AW ab 47, D-28)

| Nr. | Befund | Mehrwert | Skizze / Stand |
|---|---|---|---|
| V-AW-47 | Abschnitts-Kennung ohne Richtungszusatz (`A8-034` statt `A8-034-R1`): beide Fahrbahnen sind EIN Abschnitt, die Richtung steht nur bei `sonne` (`dir`); bei Korridoren mit Zusatz `A8.2-000` | eine Zeile je Strecke wie in der Vorlage („beide Richtungen“), halb so große Dateien | umgesetzt (Vertrag, Startprompt §0 erlaubt die Abweichung) |
| V-AW-48 | `fillValue` greift nur bei exakt 0,00/−1,00 °C **und nur mit Taupunkt**; Q290 Wolfskopf fällt zwischendurch auf Fahrbahn = Luft = −0,01 °C (273,14 K), ohne Taupunkt — bleibt gültig, bei Taupunkt −0,01 sogar „Frost" | kein Füllwert als Frost | gemessen 14.10. (§19.10): Toleranz 0,011 allein reicht nicht, dazu Regel 1b (Fahrbahn = Luft am Füllwert, Taupunkt fehlt ⇒ beide verworfen); Jans Gate, vor Dezember |
| V-AW-49 | „Brücke/Schatten senken die Tf-Schwelle der Stufe 1 um 1 K“ als **Anheben** gelesen (Stufe 1 ab +2 °C statt +1 °C): die Brücke ist kälter als die Anlage neben ihr | die Lesart entscheidet, ob Brücken früher oder später auffallen | umgesetzt (`ROAD_HZ_FEATURE_TF_K`), Jan bestätigt die Lesart |
| V-AW-50 | Der `road-fc`-Job hat `runs/` nicht im Sparse-Checkout — Gewitter/Blitz/CAPE/Neuschnee lesen deshalb im Gefahren-Derive (voller Klon des Radar-Jobs), nicht in der Laufdatei | keine Workflow-Änderung nötig | so gebaut; falls die Laufdatei sie tragen soll: Sparse-Liste in `workflow-road-fc.yml` um `runs` erweitern (Jan) |
| V-AW-51 | DWD-Codes `lage`/`belag` des Stationskatalogs sind nirgends erklärt (kein Register „Typen“ in der Datei) | Dammlage und Betonbelag aus der amtlichen Liste | DWD-Anfrage (wie §18.5) oder OSM allein (jetzt) |
| V-AW-52 | Derive 25 s je Slot — davon ≈ 20 s PNG-Dekodierung (25 RV-Frames à 1100 × 1200 mit Log-Kanal, 50 Repack-Schritte) | Radar-Schleife steht kürzer | nur die Zielpixel dekodieren ist bei PNG nicht möglich; Alternativen: Stundenmittel `m060`/`m120` (2 Bilder statt 24), Repack nur die 7 Stunden des Fensters je Familie (je 7 statt 13 Schritte), Worker-Threads |
| V-AW-53 | Nebel-Proxy zu großzügig (292 Abschnitte am Abend des 13.10.) | ehrliche Leiste | E-AW-39, Gate E |
| V-AW-54 | Die Hagel-Stufe 3 („fester Niederschlag bei Luft ≥ +5 °C“) kann Graupel sein — der Text sagt „Hagel oder Graupel“, die Stufe nicht | — | Gate E: Fälle zählen; ggf. Stufe 2 |
| V-AW-55 | Das Gefahren-Fenster endet bei +6 h, die Streckenprognose reicht 48 h; die Vorlage zeigt +6 h | Abfahrt in 8 h | später: Fenster als Parameter des Derive, Datei bleibt dünn |
| V-AW-56 | Stationskarte im Detail nur für Stationen des Abschnitts (im Abschnitt oder in Reichweite); ein Klick auf eine ferne Station im Band öffnet deren Abschnitt | — | so gewollt (E-AW-37) |
| V-AW-57 | `RoadMap.apply` bricht bei `!isStyleLoaded()` ab — das wartet auch auf jede Kachel; ein Datenwechsel während des Kachelladens (Korridor, Abschnittslinien) wird erst mit der nächsten Darstellung nachgeholt (gelesen, nicht gemessen — der leere `data-segs`-Haken im Verifier war Timing: die Leiste steht vor dem `load` der Karte, U2c wartet jetzt) | Linien und Punkte erscheinen, sobald die Daten da sind, nicht erst beim nächsten Render | Bestand seit AW-5, unverändert gelassen (Funktionserhalt): Merker „ausstehend“ + Nachziehen bei `idle`; Testhaken `data-applied` |
| V-AW-58 | Desktop-Pixelgleichheit ohne Schalter nur über den Verifier belegt (Blöcke A–T grün, dieselben Shots), kein byte-genauer Diff gegen die Basis-Shots | Gate-Frage 2 mit Zahl | Diff-Lauf wie `regenradar-wk-pixeldiff.mjs` gegen `.wt-ctl` (Jan oder nächste Sitzung) |
| V-AW-59 | RoadPage-Chunk +11,5 KB gz auch ohne Schalter (Vertrag `roadHazards.ts`, Leser, Sicht, `AW_SEV`) | Besucher ohne Schalter zahlen nichts | die Gefahren-Logik in einen eigenen Lazy-Chunk hinter dem Schalter ziehen (Hook `useRoadHazards`) |
| V-AW-60 | `RouteAnnouncer` holte den Fokus bis ≈ 1 s nach einem Routenwechsel auf `<main>` zurück, auch wenn er inzwischen weitergewandert war (U4 nach dem Merge von `main` 14.10.: Enter öffnet das Detail, die Überschrift bekommt den Fokus, 100 ms später liegt er auf `main.aw-map` mit `tabindex=-1`; reproduzierbar 3/3, vor dem Merge grün — ein Zeitfenster, das der größere Bau verschob) | Tastatur- und Screenreader-Nutzer verlieren nicht die Stelle, die sie gerade geöffnet haben | behoben: der Ansager merkt sich `document.activeElement` beim Routenwechsel und lässt einen Fokus in Ruhe, der seitdem woanders liegt (`src/router/RouteAnnouncer.tsx`); Verifier U4 bleibt streng (kein längeres Warten) |
| V-AW-61 | `npm run health` meldet H2/H3 für `latest-grib.json` rot, obwohl der Warm-Cron seit GBW12 (04.09.) abgeschaltet ist und der Client den Index des Daten-Repos liest (§19.10) | ein rotes Signal ohne Bedeutung verdeckt das nächste echte | H2/H3 für die Datei als „stillgelegt" melden, dafür `index.json` (`publishedAt` ≤ 6 h) prüfen, `verify:health` mitziehen — berührt die Manifest-Mechanik, dein Wort |

### 19.8 Merge nach `main` (14.10.2026)

Jan hat den Hauptbaum committet (`7fbb00b`: Phasen RA, SE, LM, WL-5, neue `CLAUDE.md`), damit war der Blocker aus §19.5 weg.
Die Sitzung hat `main` in den Zweig gemergt (`45ae67e`); einziger Konflikt `MANUELLE-SCHRITTE.md`, weil beide Seiten einen
§70 anfügten — §70 bleibt Phase RA, der Autobahn-Abschnitt heißt §71 (`48c21a4`, Verweise in `health-manifests.mjs` mitgezogen).
`package.json` ging automatisch zusammen (Jans `verify:dach-mask`/`verify:radar-clutter` + die drei nivo-Pakete). `main` per
Fast-Forward auf den Zweig gesetzt und mit Jans Freigabe gepusht (`7fbb00b..83ba8b0`, zwölf Commits).

Gates nach dem Merge, Bau aus dem Worktree: `verify:road-ui` 102/102 (nach V-AW-60; davor 101/102, U4 rot in 3 von 3 Läufen),
`verify:road-hazards` 91/91, `verify:road-contract` 111/111, `verify:road-derive` 36/36, `verify:fusion-release` 30/30,
`verify:routing` 260/260, `verify:seo` grün im Bau, typecheck 0; Budget eagerJs 110,0/110 (gerundet, RouteAnnouncer +6 Zeilen),
largestChunk 278,4/302, totalJs 1 824,7/1 825 (Jans Phasen +3,1 KB gegen §19.5). `health-manifests --url` gegen Produktion:
12/14, rot nur H2/H3 (`latest-grib.json` Lauf 2026090406, 952 h alt — Wind-Manifest der Edge-Function, nicht Teil dieser Phase,
an Jan gemeldet).

### 19.9 Einspielen und erster Live-Slot (14.10.2026, Jans Freigabe im Chat)

- **Daten-Repo:** `road/v1/static/segments.json` als `59d6cdd` auf `origin/main` (Blob-SHA256 `6324e85c…` = Paket), 07:51 UTC;
  Vorgehen `checkout --detach origin/main` → `cherry-pick` → `push HEAD:main`, Push im ersten Versuch. Der README-Abschnitt lag
  schon dort — der `build`-Job kopiert die Vorlage `scripts/repack-repo/README.md` aus `main` (`03ecbf2`). Beide Pfade `@main`
  gepurgt (CF + FY), jsDelivr liefert 968 148 Bytes, 1 629 Abschnitte.
- **Spiegel:** der laufende Radar-Job (Start 05:29 UTC, Code von `83ba8b0`) hatte bis dahin je Slot `hz: segments fehlen`
  geschrieben (`status.hz.blocked`, §71.2 wie vorhergesagt). `copyInto()` übernimmt `static/segments.json` aus dem Klon in den
  Store, beim nächsten Slot rechnete die Ableitung: **erster `hz/`-Slot 2610140830**, `derivedAt` 08:33:13 UTC — 1 629 Abschnitte,
  89 mit Stufe, 2 unbekannt, 20 235 Bytes, **1,1 s** (lokal 25 s, V-AW-52: der Spiegel hält die Eingänge schon im Speicher).
  Verteilung: quer 66, gischt 19, aqua 14, sonne 7, nebel 4, alle Winterklassen 0 (Oktobermorgen, +8 bis +12 °C).
  Eingänge: obs 2610140830, fc-Lauf 2610140804 (buscosun Fusion 12), RV 0825, KONRAD3D 0825, runs vorhanden.
- **`health-manifests --url https://buscosun.com`:** R1–R7 grün (R6 hz-Slot 6 min alt, R7 alle Eingänge), 13/15; rot bleiben
  nur H2/H3 (`latest-grib.json`, s. o.).
- Damit beginnt der Schattenbetrieb der Gefahren (Gate E frühestens 21.10., §71.5). `ROAD_HZ_LIVE` bleibt aus.

### 19.10 Offene Punkte angesehen (14.10.2026, Auftrag „angucken", ohne Gate E; zunächst nur gelesen, gemessen und vorbereitet — Umsetzung nach Jans „ja mach das" in §19.11)

**AF-3 (§71.3) — Paket vorbereitet (eingespielt: §19.11).**
- Voraussetzung nach E-AF-4 („erst wenn der Deploy da ist"): `fd885e2` liegt auf `origin/main`; die ausgelieferte Seite (Chunk
  `RoadPage-ChAjSzU7.js`, buscosun.com, 14.10. 08:49 GMT) trägt „keine Messstelle an diesem Abschnitt"; der Chunk `roadFlag-CWQpjKZh.js` den Schalter `roadhz`.
- Paket `2026-10-11-af3`: `sha256sum -c SHA256SUMS` 3/3 OK; die Rückweg-Dateien `in/…` sind **bytegleich** mit den Live-Dateien im
  Daten-Repo (corridors 263 770 · points 508 201 · geo 5 775 265 Bytes, von raw.githubusercontent gelesen) — kein Drift seit dem 11.10.
  Das Paket bringt 292 881 · 528 076 · 6 030 698 Bytes.
- `segments.json` gegen die neuen Korridore neu gebaut (`build-segments.mjs` mit Korridoren, Punkten, `geo.json` des Pakets, OSM-Auszug
  2026-10-11, Knoten 2026-10-13, warme Caches, 92 s): **1 731 Abschnitte auf 212 Korridoren** (vorher 1 629 auf 141), 13 730 km, 3 735
  Knoten, 775 mit Messstelle im Abschnitt, 1 236 mit einer in Reichweite. Gegen die Live-Datei (`59d6cdd`): **102 neu** (aus den 71
  neuen Korridoren), **0 entfallen, 0 mit gleicher Kennung und anderem Inhalt** — die Änderung ist rein additiv.
  `parseRoadSegments` nimmt sie an, jeder Abschnitt hat einen Korridor der neuen Datei. 1 025 688 Bytes, SHA256 `b0c41d59…`,
  Paket `C:\dev\buscosun-road-publish\2026-10-14-af3-segments\` mit `SHA256SUMS` und Zusammenfassung.
- Wirkung auf die Gefahren: die Ableitung liest den Prognoselauf je Korridor; solange der laufende Lauf (2 958 Punkte) für einen neuen
  Korridor keine Datei hat, sind dessen Stunden `null` — unbekannt, nie 0 (D-04). Die 1 629 bestehenden Abschnitte ändern sich nicht.
  Erst der erste `road-fc`-Lauf mit 4 772 Punkten (stündlich :12) füllt die 102 neuen; ein Einspielen kurz vor :12 hält das Fenster klein.
- **Einspielen = EIN Commit mit vier Dateien** (`road/v1/static/corridors.json`, `road/fc/v1/static/points.json`,
  `road/fc/v1/static/geo.json` aus `2026-10-11-af3` und `road/v1/static/segments.json` aus `2026-10-14-af3-segments`), Vorgehen wie §19.9,
  danach die vier `@main`-Pfade purgen und die SHA256 am CDN gegen beide `SHA256SUMS` prüfen. Daten-Repo = dein Gate, der Auto-Modus lehnt es ab.

**V-AW-48 (§71.7) — gemessen: die vorgeschlagene Toleranz allein reicht nicht.**
- *Ring* (24 Slots à ≈ 1 400 Stationen, 13.10. 14:30–17:00 und 14.10. 06:00–08:45 UTC, 33 598 Stationswerte, 0,01-°C-Raster): Werte
  innerhalb 0,011 K um 0 oder −1, aber nicht exakt, gibt es nur an **Q290 Wolfskopf** (A6; Fahrbahn und Luft −0,01 °C in 17 der 24 Slots, in den
  7 übrigen echte Werte — Fahrbahn 14,3–18,2 °C, Luft 12,1–14,2 °C —, Taupunkt und Feuchte fehlen immer, Kennzeichen `jump`/`neighbours`/`cube`;
  ein Fühler, der zwischendurch auf den Gerätewert fällt, darum löst auch die Stuck-Regel mit 24 gleichen Slots nie aus) und an drei Taupunkten (Q984, Q986,
  Q734: Luft 14 °C bei 36–39 % Feuchte, dort ist ein Taupunkt um 0 °C plausibel, Magnus ≈ −0,7 °C — **kein** Füllwert).
- *Der echte Vertrag* (`validateRoadSlot`, Fixture V164): Fahrbahn = Luft = −0,01 °C **ohne Taupunkt** bleibt gültig (`cls dry`, 0
  `fillValue`); dasselbe bei **exakt** 0,00 ohne Taupunkt. Mit Taupunkt −0,01 wird sogar `cls frost` daraus. Die Regel „Fahrbahn =
  Luft = Taupunkt" (`roadContract.ts`) verlangt einen Taupunkt, die zweite (Luft ≥ 5 K wärmer) eine warme Luft. Eine Toleranz von
  0,011 holt deshalb nur die Variante MIT Taupunkt; **Q290 bliebe**.
- *Archiv* (03.–08.10., 528 Slots, 598 825 Fahrbahnwerte, 0,1-°C-Raster, nur Werte nach den harten Regeln): Fahrbahn ≈ Luft ≈ 0 °C ohne
  Taupunkt an drei Anlagen — P134 Schweinfurt Hafen (14 Slots, 2 Tage), O453 Kaditz (5), V554 Löwenstein (1): 20 Werte = 0,003 %;
  P134 und O453 sind die Füllwert-Anlagen aus M1. Mit Taupunkt 0,0: 16 Fälle (J909 täglich 23:00 UTC, O453 05.10., P134 06.10.) — alle drei Werte 0,0, genau das, was M1 (Commit 07.10.)
  verwirft. Bis auf V554 (ein Slot) lauter bekannte Füllwert-Anlagen, kein Fall mit erkennbar echtem Verlauf.
  Grenzen: Oktober ohne Frostlage, und das 0,1-°C-Raster kann −0,01 nicht von 0,0 trennen — die Toleranz selbst ist nur am Ring (3 h) messbar.
- **Geänderter Vorschlag:** (a) `ROAD_FILL.eps` 0,005 → 0,011 (der Gerätewert 273,14 K statt 273,15 K) **und** (b) eine Regel 1b: Fahrbahn
  und Luft innerhalb `eps` desselben Füllwerts, Taupunkt fehlt oder ist verworfen ⇒ beide `fillValue`. Neue Verifier-Fälle M1e (Q290-Muster ⇒
  Fahrbahn und Luft verworfen, `cls` ≠ frost), M1f (Taupunkt −0,01 ⇒ alle drei), M1g (echte 0,00 bei Luft +1,8 °C und 0,00/0,4 ohne Taupunkt
  bleiben). Risiko: zwei Fühler zugleich innerhalb ±0,011 K bei fehlendem Taupunkt im Winter — die Zahl `fillValue` je Tag in der Bilanz
  (`byRule`) im Dezember beobachten. **Heute ohne Wirkung auf die Gefahren:** Q290 trägt Beobachtungs-Kennzeichen und ist darüber `suspect`
  (§19.3); mit Luft nahe 0 °C im Winter schlägt der Cube-Abgleich nicht an, dann zählte die Anlage als gemessen — also vor Dezember.
  Nicht umgesetzt: es ändert, was die Seite zeigt (dein Gate).

**`latest-grib.json` (H2/H3 rot) — stillgelegt, kein Ausfall (V-AW-61).**
- `warm-grib.yml`: der `schedule` ist seit dem Gate GBW12 (04.09.) auskommentiert; das Manifest trägt `updatedAt` 2026-09-04T07:22Z, Lauf
  2026090406. Der Client liest Lauf und Schritte aus `index.json` des Daten-Repos (`publishedAt` 14.10. 07:07 UTC, jüngster Lauf 2026101406,
  2,8 h alt) und verwirft ein Manifest, dessen Lauf älter als 24 h ist, vorab (`MAX_MANIFEST_RUN_AGE_H`, `gribManifest.ts`); der
  Verzeichnis-Scan übernimmt. Es gibt also weder eine Datenlücke noch einen Alarm: `health.yml` existiert nicht mehr, nur `npm run health` von Hand.
- Rot sind H2/H3 nur, weil `health-manifests.mjs` die Datei weiter wie ein lebendes Manifest prüft. Vorschlag: für `latest-grib.json` H2/H3
  als „stillgelegt" melden (grün, benannt, wie der Kill-Schalter bei R1–R7) und statt dessen den Index prüfen (`publishedAt` ≤ 6 h, jüngster Lauf
  ≤ 9 h), `verify:health` (20/20) mitziehen. Das berührt die Manifest-Mechanik (STOPP-Zone) — nicht geändert.

**`ROAD_HZ_LIVE` (§71.6) — nicht angefasst.** Voraussetzung ist Gate E (7 Tage `hz/` ohne Konsistenzverletzung, `missing` ≤ 2 %, Stichprobe
von 50 Einträgen je Stufe ≥ 2); der erste `hz/`-Slot ist 2610140830, die Schwellen sind `set`, und der Startprompt verbietet
`ROAD_HZ_LIVE = true` ohne dein OK. Der Umschalter selbst ist eine Zeile in `src/road/roadFlag.ts` plus Build, Budget und Push.

### 19.11 Umsetzung nach „ja mach das" (14.10.2026, manueller Modus)

- **AF-3 eingespielt, 09:12 UTC.** Ein Commit mit vier Dateien auf `origin/main` des Daten-Repos: **`8104f73`** (`road/v1/static/corridors.json`,
  `road/fc/v1/static/points.json`, `road/fc/v1/static/geo.json`, `road/v1/static/segments.json`). Vorgehen wie §19.9 (`checkout --detach origin/main`
  → `cherry-pick` → `push HEAD:main`, ein Versuch, kein Force). Vorher: die Blobs auf `origin/main` waren bytegleich mit den Rückweg-Dateien des Pakets.
  Das sparse-Muster des Klons umfasste `road/fc/` nicht (Falle: `git add` verwirft dort still) — erweitert, Blob-SHA256 nach dem Commit gegen beide
  `SHA256SUMS` gelesen. Vier `@main`-Pfade gepurgt (09:12:50 UTC), jsDelivr liefert alle vier mit der Prüfsumme des Pakets (292 881 · 528 076 ·
  6 030 698 · 1 025 688 Bytes). Der Push lag vor dem :12-Lauf, den der `point`-Cron anstieß.
- **Wirkung gemessen.** `road/fc/v1/index.json`: Lauf **2610140928** (09:28 UTC) mit **4 772 Punkten, 212 Korridoren, 0 fehlgeschlagen**, buscosun Fusion 12.
  Gefahren-Slot **2610140930**: 1 731 Abschnitte gerechnet (Status: 316 mit Stufe, 2 unbekannt, 1 s), `missing []`, Eingänge obs/fc/RV/KONRAD3D/runs;
  26 der 102 neuen Abschnitte tragen schon eine Stufe, keiner ist ganz `null`. (Der Sprung von 89 auf 316 Abschnitte mit Stufe zwischen 08:30 und
  09:30 UTC ist `sonne`: das Stundenfenster reicht jetzt bis in die tiefe Nachmittagssonne, 243 von 316.) Die Seite zeigt die neuen Teilstücke ohne
  Messstelle mit „keine Messstelle an diesem Abschnitt" (AF-5, ausgeliefert).
- **V-AW-48 umgesetzt (uncommitted).** `src/road/roadContract.ts`: `ROAD_FILL.eps` 0,005 → **0,011**, dazu **Regel 1b** — Fahrbahn und Luft am selben
  Füllwert und kein Taupunkt ⇒ beide `fillValue` (Detail „Fahrbahn = Luft, kein Taupunkt"); der Regeltext nennt die neue Lage. Neue Fälle in
  `scripts/verify-road-contract.mjs` **V48a–V48f** (Q290-Muster, exakt 0,00/−1,00 ohne Taupunkt, Taupunkt −0,01, Toleranz in Regel 2 für K677s zweiten
  Fühler, gegenprobe: 0,00 bei Luft 0,4 ohne Taupunkt bleibt · 0,00/0,00 mit echtem Taupunkt −3 °C bleibt · −0,01/0,2 bleibt, Konstante).
  Vor dem Eingriff am echten Vertrag gemessen (§19.10), danach: `verify:road-contract` **117/117** (vorher 111), `verify:road-derive` 36/36,
  `verify:road-hazards` 91/91, `verify:road-archive` 26/26, `verify:road-decode` 15/15, `typecheck` grün, `build` 260/260, Budget unverändert
  (eagerJs 110,0/110, totalJs 1824,7/1825). **Wirksam wird es mit dem Push von `main`** (der Spiegel klont `main`). Winter-Beobachtung: die Zahl
  `fillValue` je Tag in `balance.byRule`, ob Regel 1b echte Werte trifft (zwei Fühler zugleich auf ±0,011 K bei fehlendem Taupunkt).
- **V-AW-61 umgesetzt (uncommitted).** `scripts/health-manifests.mjs`: `latest-grib.json` trägt `retired` (H2/H3 grün, benannt, mit dem tatsächlichen
  Alter im Text — `GRIB_MANIFEST_RETIRED=0` schaltet sie wieder scharf; `--file` bleibt streng); neu **I1–I3** auf `index.json` des Daten-Repos
  (lesbar/Schema 1, `publishedAt` < 6 h, je Familie wind/temp/gust/precip der jüngste Lauf mit Schritten < 9 h; `INDEX_HEALTH=0` aus,
  `REPACK_INDEX_URL` überschreibt). `verify:health` **57/57** (vorher 44; dazu Gegenproben: dasselbe eingefrorene Manifest ohne `retired` bleibt rot, `retired`
  lässt H1/H4/H5 scharf, I3 wird rot, wenn nur EINE Familie veraltet). Echt gegen buscosun.com: **18 von 18 Prüfungen grün**, I3 „wind/temp/gust/precip
  2026101406 (3,7 h)".
- **Nicht angefasst:** `ROAD_HZ_LIVE` (Gate E ab 21.10.), `?roadhz=1` bleibt der einzige Weg zur Leiste.

### 19.12 Gate E — Gefahren-Schatten (23.10.2026, Jans „ja starte GATE E"; nur gelesen, gemessen, verifiziert — kein Code geändert)

**Vorbemerkung.** `ROAD_HZ_LIVE` steht seit `0a46c4f3` („update road", 21.10. 20:49 MESZ, auf `origin/main`) auf `true` — die Leiste
ist live, bevor Gate E gelaufen ist. Gate E wird trotzdem über das vorgesehene Fenster bewertet: **14.10. 08:30 – 21.10. 08:30 UTC (672
Slots)**, als der Schalter noch aus war; der Zeitraum danach steht getrennt. Quellen: Slot-Protokoll `road/v1/<Tag>/slots.json` im Archiv
(`buscosun-archiv` `9aa66bc`, enthält `recent[].hz` je Slot), die Halbtagesdateien `road/v1/<Tag>/{00,12}.json.gz`, der Live-`status.json`,
die vorhandenen `hz/`-Slots, `rv-past/` und die Actions-API des Daten-Repos (ohne Token). Werkzeuge und Rohausgaben:
`C:\Users\User\AppData\Local\Temp\claude\C--dev-buscosun-web\f590d117-c332-4ee6-af8e-e11d257df51c\scratchpad\gateE\` (`series.mjs`,
`sample.mjs`, `sample-0430.txt`, `v-*.txt`, `verify-road-ui*.txt`, Bilder `shots-*`).

**Verdikt: Gate E ROT** — zwei der vier Kriterien verfehlt, ein drittes nur ersatzweise belegt.

| Kriterium (`autobahnwetter-gefahren.md` Gates) | Messung | Urteil |
|---|---|---|
| D-1…D-4 erledigt | harte Regeln M1–M5 aktiv (§19.1); **aber** ein Rückfall der Art D-2: GMA Irxleben (N443, A 2) Luft **+41,3 … +40,8 °C** am 16.10. 09:15–10:15 UTC als gültig durchgelassen (V-AW-62) | **gelb** |
| keine Konsistenzverletzung | **17 von 672 Slots gesperrt** (16.10. 09:15–13:15 UTC), alle „Hitze bei T2m < 25 °C" an `A2-372`/`A2-379` (T2m 13,3–19,3 °C); die Sperre hat gewirkt (nicht veröffentlicht, der letzte gute Slot blieb) | **rot** |
| `missing` ≤ 2 % der Slots | 0 von 672 (0,00 %); 672/672 `obs`-Slots frei, 672 Ableitungen, 0 Lücken im Protokoll; ohne nutzbaren `hz`-Slot nur die 17 gesperrten (2,53 %) | grün |
| Stichprobe 50 Einträge Stufe ≥ 2 ohne Fehlbegründung | die `hz/`-Dateien des Fensters gibt es nicht mehr (Aufbewahrung 3 h, das Archiv legt `hz/` nicht ab, Daten-Repo-Historie ≈ 2 h, V-AW-64); ersatzweise **alle 167 Einträge** mit Stufe ≥ 2 des Slots 2610230430: **0 Fehlbegründungen** | grün, nicht im Fenster |
| *nach dem Fenster (21.10. 08:30 – 23.10. 04:00, 174 Slots)* | `missing: fc` in **144 von 172** Slots (83 %) seit 21.10. 15:30 UTC — alle 1 731 Abschnitte „unbekannt" für die Prognose-Stunden, die Leiste ist live | **rot** |

**Der Ausfall seit 21.10. — Ursache: das Terminregister hält den Punkt-Cron an (Wiederholung von V-EX-1).**
- Jeder `point`-Lauf im Daten-Repo scheitert seit **19.10. 13:02 UTC** (Lauf 39256822994; letzter grüner 11:55 UTC) im Schritt „Gate — Form
  der Punktdaten" (`scripts/verify-point-data.mjs`) — t1, t2 und `stations-s` gleich. Lokal an `HEAD`: **1025/1027**, rot genau die zwei
  Prüfungen „Termin nicht überfällig: DWD schaltet die Altformate der Radarprodukte ab … — −3 Tage" (`SCHEDULED_CHANGES` in
  `src/point/sourceMatrix.ts`, Eintrag `on: '2026-10-20'` ohne `resolved`). Das Gate fällt ab 12 UTC des Vortags (V-EX-1).
- Folge: der Cube steht auf den Läufen t1 `2026101909` / t2 `2026101906` (so nennt sie noch der letzte `road-fc`-Lauf `2610211235`); `road-fc`
  scheitert seit 21.10. 13:02 UTC mit Exit 3, `road/fc/v1/index.json` endet bei 21.10. 12:36 UTC. Das trifft **jede Seite, die buscosun Fusion
  aus dem Cube liest**, nicht nur die Autobahn.
- Der Termin selbst ist in den Daten erledigt (gemessen 23.10. ≈ 06:30 UTC): `opendata.dwd.de/weather/radar/radolan/rv/` antwortet **404**,
  `…/composite/rv/` liefert `composite_rv_<JJJJMMTT>_<HHMM>.tar` (HDF5) im 5-min-Takt bis 06:25 UTC, der Spiegel hat frische RV-Slots
  (`hz.inputs.rv` 2610230620), der HDF5-Weg ist seit 30.09. an (EX-3). Der Client liest RV zuerst als HDF5 (`radolanDecode.ts`), das Altformat
  nur noch als benannter Rückfall; `fetchRyLatest` (`radolan/ry/…-latest…bin.bz2`, ebenfalls 404) hat keinen Aufrufer.
- **Vorschlag (dein Gate: Commit + Push von `main`, der Cron klont `main`):** dem Eintrag `resolved: { on: '2026-10-23', evidence: '…' }` mit
  diesen Messungen geben; danach sollte der nächste `point`-Lauf grün sein und `road-fc` von selbst folgen. Nicht umgesetzt.
- Alarm gab es: `road-archiv` (Archiv-Repo) ist seit 21.10. 15:36 UTC in jedem Lauf rot (V-AW-28), `health-manifests --url` meldet R7 rot
  (17/18 grün, rot nur „Gefahren-Eingänge — fehlen oder zu alt: fc"). Gelesen hat es niemand (V-AW-69).

**N443 Irxleben — wie 41 °C durch die harten Regeln kamen (V-AW-62).** Der Luftfühler meldet seit Tagen ≈ +41 °C (Taupunkt ≈ +31 °C);
`roadAir` verwirft ihn sonst in jedem Slot über den Nachbar-Schiedsrichter („Nachbarn Fahrbahn 11, Luft 9"). Am Vormittag des 16.10. erwärmten
sich die Nachbar-Fahrbahnen schneller als die eigene (eigene 13,7 °C, Nachbarn 17,1 °C): die eigene Fahrbahn passte nicht mehr ins Band der
Nachbarn, `off.every(roadFits)` wurde falsch, und der `else`-Zweig verwarf die **Fahrbahn** statt der Luft — fünf Slots 09:15–10:15 UTC mit
Luft 41,3/41,4/41,0/40,9/40,8 °C im Archiv als gültige Werte (`src/road/roadContract.ts` Z. 786–793). Die Luft lag 26 K neben den Nachbarn,
die Fahrbahn 3,4 K. Im Gefahren-Derive zählt `blowupOf` die Luft-Historie **aller** Stationen, auch `suspect` (N443 trug in diesen Slots
`cube(o)`), obwohl der Kommentar in `HzStation.suspect` das ausschließt (V-AW-63) — daher „Hitze" an zwei Betonabschnitten, drei Stunden lang
(Luft-Historie 3 h), bis die Konsistenzsperre griff.

**Stichprobe (Slot 2610230430, 167 Einträge mit Stufe ≥ 2 — sechs Gefahren: Gischt 134, Aquaplaning 24, Reif 2, Erster Frost 4, Überfrierende
Nässe 2, Seitenwind 1).** `sample.mjs` prüft je Eintrag: jeder `why`-Wert mit Messstelle gegen den `obs`-Slot derselben Station (Wasserfilm,
Tf, Td, rF, Böe, Richtung), die Station gegen `stations`/`near` des Abschnitts, die Stufe aus den Schwellen in `ROAD_HZ_T`; die Nowcast-Stunden
+1/+2 gegen die RV-Analysen **danach** (`rv-past/<ts>/g000.png`, Maximum über die Stützpunkte, 12 Analysen je Stunde, alle vorhanden).
- Stunde 0 (gemessen/abgeleitet): **0 Fehlbegründungen** — z. B. A8-069 Reif 2 aus Tf −0,5 / Td +0,69 / rF 91 an P879 (Klasse frost), A48-069
  Seitenwind 2 aus Böe 56,5 km/h quer 54,6 km/h an K164 mit Brücke/Damm (Schwelle 50), A93.2-010 Nässe 2 aus Tf +0,3 und Zustandscode 2.
- Nowcast (Nachweis p): 206 Stunden — **101 Stufe erreicht, 47 schwächer, 58 ohne Regen auf dieser Stufe (28 %)**, z. B. A7-000 Aquaplaning
  +1 h aus 15,1 mm/h, gemessen höchstens 0,2 mm/h. Das ist keine Fehlbegründung (der Wert steht so im Nowcast), aber die Frage von E-AW-42:
  das Maximum der 5-min-Frames ist zu scharf (V-AW-66).
- Wasserfilm: 11 der 34 nassen Stationen melden nur ganze Millimeter (Gruppen KM-NW 9, NI-NI 1, SP-BB 1; E311 6 mm, H326/H500 3 mm) —
  daraus Aquaplaning Stufe 3 an A3-039/087/094 (V-AW-67).

**Verteilung im Fenster.** Abschnitte mit Stufe ≥ 1 je Slot: Minimum 89, Median **879 von 1 731 (51 %)**, p90 1 314, Maximum **1 544
(89 %)**; die Beobachtungsregel „Anteil > 60 %" steht nur in der Bilanz. Welche Gefahr das trägt, sagt das Slot-Protokoll nicht (`recent[].hz`
ohne `byHazard`, V-AW-65); am 13./14.10. waren es Nebel-Proxy und Sonne (§19.4, §19.11). Laufzeit je Slot Median 1,7 s (max 2,0 s), Datei
Median 180 KB (max 380 KB); seit `fc` fehlt 1,6 MB (jeder Abschnitt trägt `null`-Reihen).

**Verifier (23.10., PowerShell, ohne `2>&1`).** Hauptbaum: `verify:road-decode` 15/15, `road-contract` 117/117, `road-derive` 36/36,
`road-archive` 26/26, `road-fc` 107/107, `road-positions` 23/23, `road-hazards` 91/91, `verify:health` 57/57; `health-manifests --url
https://buscosun.com` 17/18 (R7). `verify:road-ui` gegen einen sauberen Bau von `origin/main` (`0a46c4f3`, Worktree, `npm run build` 260/260,
`vite preview` :4199): **bricht im Block R3 ab** (`.aw-chart` fehlt) — die Blöcke A–T öffnen die Seite ohne `roadhz` und erwarten die Seite mit
Schalter aus; seit `ROAD_HZ_LIVE = true` steht dort die Leiste. Mit einer Wegwerf-Kopie, die A–T `roadhz=0` anhängt: **101/102**, rot nur A4
(sucht die Kachel unter `.deck-bento`, sie sitzt seit dem Startseiten-Umbau vom 17.10. in `.deck-quad`) — beides Verifier-Drift, keine
Regression der Seite (V-AW-68). **Gate C+** (Pixelvergleich mit den Vorlagen, Erstanzeige < 1,5 s) nicht gelaufen: die Leiste ist bereits live,
und ein Pixel-Diff gegen Vorlagen mit erfundenen Daten bleibt ohne Aussage (§19.5).

**Befunde (D-28).**

| Nr. | Befund | Mehrwert | Skizze |
|---|---|---|---|
| V-AW-62 | `roadAir`: passt die eigene Fahrbahn UND die Luft nicht zu den Nachbarn, wird die Fahrbahn verworfen — auch wenn die Luft 26 K und die Fahrbahn 3 K daneben liegt (N443, 16.10.) | kein 41-°C-Fühler als Messwert, keine „Hitze" im Oktober | den Sensor verwerfen, der relativ zu seiner Schwelle weiter neben den Nachbarn liegt (\|ta − nbTa\|/thrTa gegen \|rs − nbRs\|/thrRs); Fixture N443 2610160915; Messlinie = dein Gate |
| V-AW-63 | `blowupOf` nimmt `taMax` über alle Stationen, auch `suspect` | eine verdächtige Station baut nie eine Stufe | `st.filter((s) => !s.suspect)` wie bei `rsMax`; Verifier-Fall mit N443-Muster |
| V-AW-64 | `hz/` wird nicht archiviert (3 h Aufbewahrung, Daten-Repo ohne Historie) — Gate E/F können Stufen im Nachhinein nicht prüfen | Stichprobe und Kalibrierung über Wochen | `road-archive.mjs`: je Tag die Einträge mit Stufe ≥ 2 (oder alle `hz/`-Slots gz) ablegen; ≈ 180 KB × 96 ≈ 17 MB/Tag roh — gz und nur Stufe ≥ 1 messen |
| V-AW-65 | `recent[].hz` ohne `byHazard` | man sieht, welche Gefahr die Leiste füllt (51 % der Abschnitte im Median) | `byHazard` in den Protokolleintrag (≈ 200 B je Slot) |
| V-AW-66 | Nowcast-Stufen aus dem Maximum der 5-min-Frames: 28 % der Prognose-Stunden ohne Regen auf der Stufe | weniger Fehlalarme bei Gischt/Aquaplaning | E-AW-42 entscheiden: Stundenmittel `m060`/`m120` (spart auch 22 Bilder, V-AW-52) oder p90 der Frames; an einer Woche Archiv messen (braucht V-AW-64) |
| V-AW-67 | Wasserfilm in ganzen mm bei KM-NW/NI-NI/SP-BB, bis 6 mm | Aquaplaning-Stufe 3 nur aus echter Filmdicke | Auflösung/Einheit je Gruppe im BUFR (Deskriptor, Skala) prüfen; bis dahin ganzzahlige Gruppen auf Stufe 2 deckeln oder `observe` |
| V-AW-68 | `verify:road-ui` nicht mit `ROAD_HZ_LIVE = true` nachgezogen (Abbruch R3), A4-Selektor veraltet | der Verifier prüft wieder die Live-Seite | A–T mit `roadhz=0` als „Seite ohne Leiste", U1 umdrehen (ohne Parameter = Leiste), A4 auf `.deck-quad` |
| V-AW-69 | Rote Läufe (`road-archiv` seit 21.10. 15:36, `point` seit 19.10. 13:02) blieben 2–4 Tage unbemerkt | ein Ausfall wird in Stunden gesehen | ein Kanal, der Jan erreicht (E-Mail-Benachrichtigung der Actions prüfen oder `health-manifests` als Cron mit Issue) |

**Offen für Jan.** (1) Freigabe: `resolved` für den Radar-Termin vom 20.10. (`sourceMatrix.ts`), Commit + Push — behebt den Cube- und
`road-fc`-Ausfall; (2) Entscheidung, ob die Leiste bis zu einem grünen Gate E wieder hinter `ROAD_HZ_LIVE = false` geht — sie zeigt seit
21.10. abends für alle Prognose-Stunden „unbekannt"; (3) V-AW-62/63 (Messlinie bzw. Gefahren-Vertrag), danach Gate E neu: 7 Tage ab dem Fix,
mit V-AW-64 als Beleg für die Stichprobe im Fenster.

**Jans Entscheidungen (23.10.).** (a) **ja**: `resolved` gesetzt und NUR dieser Commit gepusht — **`6303c419`** auf `origin/main`
(`0a46c4f3..6303c419`, direkt auf `origin/main` gebaut; die 38 lokalen, ungepushten Commits von `main` inkl. Fusion 13 bleiben lokal,
der lokale `main` braucht vor dem nächsten Push `git pull --rebase`). Vorher im sauberen Worktree auf `origin/main`: `verify-point-data`
1015/1015, typecheck grün. (Im Hauptbaum zeigt `verify-point-data` zusätzlich „QUELLENMATRIX §1 … ICON-D2-RUC" rot — die uncommittete
RUC-Linie, nicht im Push.) (b) **nein**: `ROAD_HZ_LIVE` bleibt `true`, die Leiste bleibt live. (c) offen.

**Wirkung gemessen (23.10.).** `point`-Lauf 39920349929 (t1, Start 07:49 UTC): „Gate — Form der Punktdaten" grün, Bau und Publish grün;
`stations-s` (39921223017) grün. `road-fc` 08:05 UTC grün: Lauf **2610230806**, 4 772 Punkte, 0 fehlgeschlagen, buscosun Fusion 12, t1
`2026102306` (t2 `2026101906`, t3 `2026101900`, stations `2026101909` ziehen mit ihren eigenen Takten nach). Gefahren-Slot **2610230800**:
`missing []`, 862 von 1 731 Abschnitten mit Stufe, **3 unbekannt** (vorher 1 731), keine Sperre. Der Ausfall dauerte für den Cube 19.10.
13:02 – 23.10. 07:49 UTC (≈ 3 d 19 h), für `road-fc`/`hz` 21.10. 13:02 – 23.10. 08:07 UTC.

### 19.13 Umsetzung der Befunde V-AW-62…69 (23.10.2026, Jans „setze jetzt alle offenen Punkte um"; im Arbeitsbaum, NICHT committet)

Alles unten liegt uncommitted im Hauptbaum (Dateiliste in `MANUELLE-SCHRITTE.md` §71.9) und wirkt erst mit Jans Push von `main`:
der Radar-Job klont `buscosun-web` `main` beim Jobstart (alle 5,75 h), der Archiv-Job bei jedem Lauf (alle 3 h), der Punkt-Cron ebenso.
Reihenfolge der Belege: Diagnose nachgemessen → Code → Verifier-Fall mit echter Datenform → Zahl neu gezählt.

**V-AW-62 — `roadAir` verwarf den richtigen Fühler (umgesetzt).** Die Diagnose aus §19.12 war im Mechanismus ungenau; nachgemessen
am Archiv-Halbtag `road/v1/2026-10-16/00.json.gz`, Slot 2610160915: N443 Fahrbahn **13,73** (Quarantäne, roh), Luft **41,29**, Taupunkt
31,4. Nachbarn nach `ROAD_NEIGHBOUR` (25 km, Höhenklasse 0–300 m): N452 Hohenwarthe 13,4/11,3 · N453 Burg 14,3/11,6 · N422 Morsleben
17,1/15,0 · N450 Schönebeck 17,1/15,3 (Fahrbahn/Luft). Median Fahrbahn 17,1, Luft 15; MAD 2,8 bzw. 3,4; Band `k·MAD` = **22,4 K** bzw.
**27,2 K**. Damit „passte" die Luft (26,3 ≤ 27,2) UND die Fahrbahn (3,4 ≤ 22,4) — der `if`-Zweig (Luft außerhalb, Fahrbahn innerhalb)
griff nicht, und der `else`-Zweig verwarf die Fahrbahn allein wegen `rs < Luft − 12 K` (`roadContract.ts`). Vier Nachbarn, die 3 K
streuen, machen das Band achtmal so breit wie die Streuung; das ist die Falle. **Fix:** liegen Nachbarn für beide vor, wird der Fühler
verworfen, der RELATIV zu seinem Band weiter neben den Nachbarn liegt (`|ta − med|/thr` gegen `|rs − med|/thr`, Luft 0,97 gegen Fahrbahn
0,15 ⇒ Luft und Taupunkt `roadAir`, Fahrbahn bleibt); der bisherige Weg (Luft außerhalb, alle Fahrbahnen innerhalb) bleibt davor. Die
Quarantäne nennt die Verhältnisse („Abstand/Band Luft 0.97, Fahrbahn 0.15"). Kein Schalter: harte Regel der Messlinie wie M1–M5 und
V-AW-48, der Rückweg ist der Verifier mit der echten Nachbarschaft (`verify:road-contract` V62a Gegenprobe auf den alten Weg, V62b N443,
V62c beide daneben/Fahrbahn weiter, V62d Luft weiter; **123/123**). Nicht geändert: `ROAD_NEIGHBOUR.k` — es trägt auch die
Beobachtungsregel `neighbours`, deren Zählung sonst springt.

**V-AW-63 — `blowupOf` zählte verdächtige Stationen (umgesetzt).** `taMax` jetzt über `st.filter((s) => !s.suspect)` wie `rsMax`;
`verify:road-hazards` D5c (41 °C in der Luft-Historie einer `suspect`-Station ⇒ keine Hitze-Stufe; dieselbe Historie sauber ⇒ Stufe ≥ 1 d).

**V-AW-64 — `hz/` wird archiviert (umgesetzt, `scripts/road/road-archive.mjs`).** Je Slot EINE Datei `road/v1/<Tag>/hz/<Slot>.json.gz`:
Kopf wie veröffentlicht (`slot`, `hours`, `inputs`, `missing`, `killed`, `capP`), `seg` nur mit Einträgen, die in irgendeiner Stunde
irgendeiner Gefahr Stufe ≥ `ROAD_HZ_ARCHIVE_MIN_LEVEL` (= 1) tragen, dazu `counts` (Abschnitte, mit Stufe, unbekannt, abgelegt). Einmal
geschrieben, nie neu (ein Slot ist unveränderlich; A19 prüft das gegen veränderten Bestand). Index je Tag `hz: {slots, complete, from, to}`,
README-Zeile. Gemessen an zwei Live-Slots: 2610230430 1,65 MB roh, **20,3 KB gz voll**, **7,9 KB gz mit Stufe ≥ 1** (369 von 1 731
Einträgen), 4,0 KB mit Stufe ≥ 2 (141); 2610230615 20,4 / 8,2 KB (412). Also ≈ 0,8 MB je Tag, ≈ 24 MB je Monat im Archiv-Repo. Verworfen:
eine Halbtagesdatei, die alle 3 h wächst — Git hielte vier wachsende Fassungen je Halbtag. **Aufbewahrung `hz/` im Daten-Repo 3 h → 4 h**
(`ROAD_RETENTION.hzMaxAgeMs`, Spiegel liest es aus dem Plan): der Archiv-Lauf kommt alle 3 h, ein Slot ist ≈ 10 min nach seiner Zeit
abgeleitet — mit 3 h Fenster wäre der Slot direkt nach einem Lauf beim nächsten schon weg (12 → 16 Slots, +0,8 MB im Daten-Repo).
`verify:road-archive` A18 (echter Derive-Slot archiviert, byte-gleiche Einträge, Zähler), A19 (nie neu geschrieben), A20 (Index, README),
A21 (rein), C1b (Aufbewahrung ≥ Takt + 1 h); **33/33**. Der Workflow `road-archiv.yml` braucht keine Änderung (sparse `road/v1` trägt `hz/`).

**V-AW-65 — `byHazard` im Slot-Protokoll (umgesetzt).** `recent[].hz` trägt `byHazard` und `inputs` (≈ 250 B je Slot), das Archiv nimmt es mit.

**V-AW-66 / E-AW-42 — Nowcast-Schärfe (vorbereitet, Entscheidung bleibt bei Jan).** (1) Der Spiegel liefert die Stundenmittel
schon: der Live-Slot `rv/2610230905` trägt `m055.png` und `m115.png` (Summenbild der Frame-Bytes, E-AX-16). `road-hazards.mjs` liest sie
hinter **`ROAD_HZ_RADAR=mean`** (Voreinstellung `max` = heutiges Verhalten; Umgebungsvariable des Mirror-Schritts in `radar.yml`,
`execFileSync` erbt sie): Stunde +1 = erstes Stundenende nach dem Slot, +2 = das nächste, Maximum über die Stützpunkte bleibt; fehlt ein
Mittelbild, kommt DIESE Stunde aus den Frames (`inputs.rvMode` = `max` · `mean` · `mixed`). `verify:road-hazards` I10/I10b mit
synthetischen Frames (12 × 51 Bytes ⇒ 4,0 mm/h Mittel gegen 20 mm/h Maximum). (2) Die Messung: `scripts/road/hz-nowcast-score.mjs
--archive=<buscosun-archiv>/road/v1` vergleicht je Abschnitt die Prognose-Stufe +1 h (p) von Slot S mit der gemessenen Stufe (d) des
Slots S + 1 h — erreicht / schwächer / ohne / unbekannt je Gefahr und Stufe (`verify:road-archive` A22/A23). Nach ≥ 7 Tagen Archiv ist das
eine Zahl, kein Eindruck; dann E-AW-42: `max` behalten oder `ROAD_HZ_RADAR=mean` setzen (Jans Workflow-Gate).

**V-AW-67 — Wasserfilm in ganzen Millimetern (Ursache gemessen, umgesetzt).** Die Ursache steht im BUFR: die DWD-Vorlage von 2015
(`swis-local`, 16 Reihen) trägt den Film als **0 13 241 mit Skala 3 und 7 Bit** = ganze Millimeter bis 127 mm; `swis-local-film01`
(HH/SH, 2 01 131/2 02 129) und `wmo-307102` (0 13 116, Skala 4) liefern 0,1 mm. Live-Slot 2610230430: KM-NW 9 von 9 nassen Stationen
ganzzahlig (max 3 mm), NI-NI 6 mm, SP-BB 2 mm; KO-RP/RP-RP/KK-SH/SD-BW/HJ-HH mit Zehnteln. Im eingefrorenen Slot 03.10. 08:00: E311 Jerxheim
6 mm, F843 2 mm (beide `swis-local`), FN-BY P550/P631/P828 100 mm (fällt an `limit`). **Fix in drei Schritten:** der Decoder kennt das
Layout je Datensatz (`SwisRecord.layout`), der Derive gibt `filmResMm` (1 bzw. 0,1) an die Regeln, der Messpunkt trägt **`wfr: 1`** (nur
mit Filmwert, nur bei 1 mm; Client-Prüfer `roadPointOk` nimmt genau das an); der Gefahren-Derive setzt daraus `HzStation.wfCoarse`, und
`aqua` deckelt grobe Filme auf **Stufe 2** mit `filmRes:1@<Station>` im `why` (Gischt hat ohnehin nur zwei Stufen). Preis: ≈ 600 Punkte je
Slot tragen `wfr` (auch bei 0 mm — „0" heißt dort „< 0,5 mm"), ≈ 5 KB roh von 504 KB. `verify:road-contract` V67a/b, `verify:road-hazards`
C1b, I3b. Offen bleibt die Frage an den DWD, ob die 2015-Reihen wirklich nur ganze Millimeter messen oder nur so senden (E-AW-45).

**V-AW-68 — `verify:road-ui` nachgezogen (umgesetzt).** `openPage` hängt an jede `/autobahnwetter`-Adresse ohne `roadhz=` ein `roadhz=0`
(Blöcke A–T beschreiben die Seite ohne Leiste), Block U übergibt `hz: true`; U1 bleibt der Schalter-aus-Fall, **U1b** neu: ohne Parameter
steht die Leiste (Reiter „Gefahren", 541 Zeilen); A4 sucht die Kachel in `.deck-quad` (seit dem Startseiten-Umbau 17.10.). Lauf gegen
`vite preview` des aktuellen Baus (`npm run build` 260/260): **102/103**, rot nur A4 — der Zähler der Startseite sagt „12 WERKZEUGE":
`toolTileCount()` zieht seit dem Umbau die versteckte Vorhersage-Kachel ab (`FORECAST_TILE_HIDDEN`), der Verifier erwartete fest „13".
Der Verifier liest die Erwartung jetzt aus den Konstanten der Seite (`TOOL_TILE_COUNT` − versteckte Kachel = 12); Wiederholung
gegen denselben Bau: **103/103**.

**V-AW-69 — ein Kanal, der Jan erreicht (umgesetzt, `.github/workflows/health-watch.yml` in DIESEM Repo).** Stündlich (:17) läuft
`scripts/health-manifests.mjs --url https://buscosun.com`; rot ⇒ EIN Issue mit Label `health` (bestehendes bekommt einen Kommentar, keine
Mailflut), grün ⇒ das offene Issue wird mit dem grünen Lauf geschlossen. Issues im eigenen Repo erreichen den Besitzer (E-Mail, Mobil);
rote Läufe im Daten- oder Archiv-Repo taten das nachweislich nicht. Kein `| tee` (ohne pipefail wäre der Schritt nie rot). Dazu die Lücke,
die den Ausfall vom 19.10. unsichtbar ließ: der Wächter prüfte den Index der KARTENLINIE (I1–I3), nicht den Punkt-Cube — neu **P1–P3**
(`point/index.json`: lesbar; `publishedAt` < 6 h; je Stufe jüngster Lauf unter Takt + gemessener Bereitstellung + Rand: t1 7 h, t2 13 h,
t3 22 h, gesetzt aus `workflow-point.yml`, nicht am Ausfall gemessen). `verify:health` **62/62**; Probelauf gegen Produktion 23.10. 09:55 UTC:
20 von 21 grün, rot **P3** „t2 2026101906 (99,9 h) · t3 2026101900 (105,9 h)" — richtig: t2/t3 ziehen erst um 10:30 bzw. 21:55 UTC nach
(§19.12). Am 19.10. hätte P2 um ≈ 19:00 UTC das erste Issue geöffnet statt vier Tage später jemand den Zufall.

**Bau und Budget.** `npm run typecheck` grün, `npm run build` 260/260; `npm run budget`: `eagerJs` **110,1 KB > 110 KB** — nicht diese
Linie: die Vertragsänderungen liegen im Producer (`validateRoadSlot` ist in keinem Chunk) und im lazy `RoadPage`-Chunk (`filmRes`), der
eager-Chunk trägt die fremden uncommitteten Linien des Baums (RUC in `src/nowcast/`, HB); `budget.json` ist gegenüber `HEAD` unverändert.
Nicht angehoben — das ist die Entscheidung der Linie, die es verursacht.

**Verifier (23.10., PowerShell, ohne `2>&1`):** `road-contract` 123/123 · `road-hazards` 96/96 · `road-archive` 33/33 · `road-derive`
36/36 · `road-decode` 15/15 · `road-fc` 107/107 · `road-positions` 23/23 · `health` 62/62 · `road-ui` 103/103 (nach A4-Korrektur, s. V-AW-68).

**Neue Befunde.**

| Nr. | Befund | Mehrwert | Skizze |
|---|---|---|---|
| E-AW-45 | Film-Auflösung der 2015-Reihen: misst der Sensor ganze Millimeter oder rundet nur die Vorlage? | Stufe 3 auch in NRW/NI/BB, wenn echte Zehntel vorliegen | Frage an den DWD (SWIS-Vorlage, 0 13 241 Skala 3); bis dahin Deckel |
| V-AW-70 | `ROAD_NEIGHBOUR.k = 8` macht das Band bei streuenden Nachbarn absurd breit (27 K bei 3,4 K MAD) — die Beobachtungsregel `neighbours` sieht deshalb fast nichts | eine Nachbarregel, die auch Ausreißer < 20 K sieht | Band deckeln (`maxAbsK` ≈ 12 K) und die Trefferzahl von `neighbours` vorher/nachher an einer Woche Archiv zählen; Jans Gate, weil Messlinie |
| V-AW-71 | `wfr` steht an ≈ 600 Punkten je Slot, meist bei 0 mm | 5 KB je Slot weniger, wenn der Client die Auflösung je Reihe aus `status.groups` läse | `layout` je Reihe in `status.json`, `wfr` nur bei Film > 0 — erst, wenn jemand die Bytes braucht |

**Gate E neu:** 7 Tage ab dem Push von `main` (der Spiegel übernimmt die Vertragsfixes beim nächsten Jobstart, der Archiv-Lauf schreibt
ab dann `hz/`), Folgeprompt wie in §19.12, diesmal mit den archivierten `hz`-Slots als Stichprobe im Fenster und mit
`hz-nowcast-score.mjs` für E-AW-42.

## 20. AW-6.2 „Virtueller Fahrbahnsensor" (VS) — Fortsetzung von Phase FB (`audit/autobahn-fahrbahn.md`), Zweig `feat/aw-6.2-virtueller-sensor`, ab 27.10.2026

> Auftrag (Jan, 27.10.2026, Startprompt „AW-6.2: Virtueller Fahrbahnsensor"): Fahrbahntemperatur, -zustand, Wasserfilm und
> Sicht an jedem Achspunkt von `road/fc/v1`, jetzt und 0–48 h stündlich, mit einem eigenen Energiebilanz-Kern nach dem Vorbild
> RoadSurf (FMI, MIT), im Schattenbetrieb hinter `ROAD_VS_LIVE = false`; Gate G mit Prüfstand gegen Persistenz, SWSMOS TS,
> ICON T_G, T2m. FB-1 (§5 der Phase FB, live seit 26.10.) bleibt bis Gate G die sichtbare Fahrbahnprognose.

### 20.0 Pflichtlektüre und ein fehlendes Dokument

Gelesen: `audit/autobahnwetter.md` (§1–§19), `autobahnwetter-plan.md` (AW-6), `autobahnwetter-gefahren.md`,
`autobahnwetter-datenpruefung.md` (D-1…D-9, §5.1), `autobahn-fahrbahn.md`, `road-forecast.mjs`, `roadContract.ts`,
`roadSurface.ts`, `roadHazards.ts`, `workflow-road-fc.yml`, `road/v1/status.json` (live).

**`audit/fahrbahnmodell-recherche.md` existiert nicht** — weder im Repo (`main`, Arbeitsbaum) noch in einem der Verzeichnisse
unter `C:\dev` (Suche nach `*recherche*`, Tiefe 3). Der Startprompt macht diese Datei zur Quelle jeder Konstante. Folge bis
sie vorliegt: **jede Zahl aus dem Startprompt wird im Code als `set` mit Herkunft „Startprompt 27.10.2026" geführt**, eigene
Literaturangaben (RoadSurf-Quelltext, METRo-Paper, BASt V 329, Gallaway 1979) werden am Ort der Zahl genannt. Sobald die
Recherche-Datei da ist, wird jede `set`-Zahl gegen sie geprüft und die Herkunft umgeschrieben (eine Liste aller `set`-Werte
führt §20.6). **Rückfrage an Jan:** Datei nachliefern oder Pfad nennen.

### 20.1 Entscheidungen des Startprompts (festgelegt, Änderung nur nach Rückfrage)

Die Nummern E-AW-38…43 des Startprompts sind in §19.6 schon vergeben (AW-7/AW-8). Damit keine Nummer zweimal gilt, heißen
die Entscheidungen dieser Linie **E-VS-n**; die Prompt-Nummer steht daneben. Jan kann die Benennung ändern.

| Nr. | Prompt | Entscheidung |
|---|---|---|
| E-VS-1 | E-AW-38 | Eigener TypeScript-Kern nach Vorbild RoadSurf (FMI, MIT; github.com/fmidev/RoadSurf), Node in GitHub Actions; kein Fortran; METRo (GPL-2.0) nur als Prinzip, kein Code; MIT-Hinweis in der Datei |
| E-VS-2 | E-AW-39 | „Jetzt" bei totem Sensor: Schattenbetrieb ab sofort; die Anzeige ersetzt „Messlücke → unbekannt" erst nach Gate G hinter `ROAD_VS_LIVE = false` (`?roadvs=1`, Muster `roadhz`) |
| E-VS-3 | E-AW-40 | Salz: v1 nur „ungestreut", Kennzeichnung „Glättepotenzial ohne Streuung" |
| E-VS-4 | E-AW-41 | Geltung v1: DE-Korridore mit ICON-D2; AT/CH mit ihren Korridoren, ICON-CH1 erst dann |
| E-VS-5 | E-AW-42 | Querneigung 2,5 % Standard; Verwindungsbereiche „Geometrie unbekannt", nicht geschätzt |
| E-VS-6 | E-AW-43 | Sicht 27–48 h nach dem 30.11.2026 aus eigener Diagnose der v1-Felder — **durch den Spike erweitert, s. 20.3 (2)** |

### 20.2 AW-6.2.0 Spike (27.10.2026 17:10–18:40 UTC+1, nur gelesen, geladen und gezählt)

**(a) D-1…D-9 im Code und im Live-Slot.** D-1…D-4 hart seit M1–M4 (`datenpruefung.md` §5.1), dazu `roadAir` relativ zum
Nachbar-Band (V-AW-62, committet — `roadContract.ts` ist im Arbeitsbaum unverändert); D-5 Marker auf Katalog-/Jans Lage
(M6, V-AW-44); D-6/D-7 M5 (Wort „Luft", DWD-Prüftext aus den Bits); **D-8 Sägezahn nur diagnostiziert (M7)** — Producer/Motor
sind Jans Gate; D-9 teils. Live-Slot `2610271645` (Status 17:09 UTC): 1 495 Punkte, **1 172 mit Fahrbahntemperatur, 160 mit
Sicht, 1 006 mit Wasserfilm**; 285 von 11 756 Werten verworfen (2,4 %: `precipFill` 121, `stateNoTemp` 98, `stuck` 37, `limit`
10, `roadAir` 5, …), Beobachtung `catalog` 141, `neighbours` 6, `cube` 3. 22 Reihen `ok` (Alter 0–1 min), `LH-LH` und `WW-SO`
`missing`. **DD-DD liefert** (25 Stationen, 17 Fahrbahnwerte) — die Annahme des Startprompts „DD liefert seit 02.10. nichts"
trifft heute nicht zu; die Aktualität je Reihe steht schon in `status.groups` (`state`, `ageMin`), `npm run health` prüft R1–R5
(Slot-Alter, Anteil verworfen), aber **keine einzelne Reihe** — das wird in 6.2.1 ergänzt.

**(b) Was `road/fc/v1` trägt** (Vertrag `roadFc.ts`, Lauf `2610271650`, 4 772 Punkte, 1 204 verankert): Pflicht `t ts td pp rr
sn ff fx dd n cf q`, optional `sl t85 vs` (AW-7.1) und `rs rk rq` (FB-1, 0–6 h; `engine.surface.mode fb1`, 1 094 Punkte mit
eigener Messung). Keine Strahlung, kein Bodenwert, keine Modellflächen — der Antrieb für VS muss neu beschafft werden.
Der Lauf nennt `buscosun Fusion 13`, obwohl `main` seit 26.10. Stand 14 trägt (der Job klont `main`; der nächste Lauf nach dem
Push zieht nach — nicht diese Linie).

**(c) URL-Schema.** Der Punkt-Cube liest ICON-D2/ICON-EU über `dwdRegular.mjs` vom **alten** Pfad `nwp/icon-d2/grib/`
(endet 30.11., eigene Phase E-EX-5); nur der RUC-Producer liest v1. Das v1-Schema am Verzeichnis gemessen (DWD-Newsletter
September 2026 bestätigt die Muster): Einflächenfelder `v1/m/icon-d2/p/<P>/r/<YYYY-MM-DDTHH:00>/s/PT<hhh>H<mm>M.grib2`;
Mehrflächenfelder `p/<P>/lvt1/<typeOfFirstFixedSurface>/lv1/<level>/r/…`: `T/lvt1/150/lv1/1…65`, `HHL/lvt1/150/lv1/1…66`,
`T_SO/lvt1/106/lv1/{0.0 0.005 0.02 0.06 0.18 0.54 1.62 4.86 14.58}`. Jede Datei ist EINE GRIB2-Nachricht, Gitter GDT 101
(542 040 Zellen, 525 072 mit Wert, 16 968 Bitmap-Fehlstellen = Rand), DRT 42 (CCSDS) — der eigene Decoder liest sie
(`gribDecode.ts`, Probe unten). Größen je Schritt: ATHB_S 830 KB, ASWDIR_S 799 KB, T_G 761 KB, TCH 466 KB, FRZ_RAIN 69 KB,
T je Fläche 770 KB, HHL je Fläche 577 KB. Läufe alle 3 h (`r/` 06, 09, 12, 15 UTC), 49 Schritte; Nachbarindex aus `CLAT/CLON`
wie in `dwdIcosahedral.mjs`.

**(d) SWSMOS** (`weather/local_forecasts/swsmos/`, Lauf `swsmos_20261027160000`): **48 Dateien, stündlich** (25.10. 17 UTC …
27.10. 16 UTC), 2,0 MB bz2 / 26,1 MB CSV; Kopf `ID;Lat;Lon;YYYYMMDDHHmm;TL;TLSTA;RRL1c;RRS1c;RR6;WWL6;WWS3;RRS3c;R650;RC;TS;TD`,
zweite Zeile der Lauf; **1 847 Stationen × 167 Stunden** (+1 … +167 h = 7 Tage), keine Lücken. **TS (Fahrbahntemperatur) ist
enthalten** (−0,1 … 23,7 °C; TS − TL p5/p50/p95 −0,4 / +1,2 / +4,7 K), TD ebenso. **RC trägt im Oktoberlauf nur 1 (292 063) und
2 (16 386)** — die Legende des Startprompts (3 Schnee, 4 Reif, 5 überfrierende Nässe, 6 Glatteis) ist am Rohlauf NICHT
belegbar, erst ein Winterlauf zeigt die Codes; eine DWD-Spaltenbeschreibung habe ich nicht gefunden (Bedeutung von TLSTA
0,1–6,1 mit 2 555 Lücken, RRL1c/RRS1c/RRS3c 0–1,5, RR6, WWL6 0–100, WWS3 0–47, R650 0–37,6 bleibt **Vermutung**: σ der Luft,
Regen/Schnee 1 h/3 h, 6-h-Summe, Wahrscheinlichkeiten, Reif-/Nebelgröße — als `unbekannt` geführt, bis belegt).
Katalog `swsKatalog.csv` (91,5 KB, Windows-1252): `Kennung;Name;Streckentyp (1 freie Strecke 1 429, 2 Brücke 455);Streckenbelag
(1 Asphalt 1 733, 2 Beton 151);Breite;Laenge;Hoehe;Flughafen (869 markiert);Inaktiv (0)`, 1 884 Zeilen; 1 846 der 1 847
Lauf-IDs im Katalog; **1 632 der 1 688 GMA aus `road/v1/static/stations.json` liegen im SWSMOS-Lauf** (dieselben Kennungen).
Damit sind Brücke und Belag je GMA aus dem DWD-Katalog verfügbar (6.2.2), und die SWSMOS-Baseline für Gate G ist ab heute
sammelbar — der DWD hält nur 48 h vor (6.2.1).

**(e) Mittelungskonvention ATHB_S / ASWDIR_S / ASWDIFD_S am GRIB belegt** (Lauf 27.10. 12 UTC, Kopf je Datei, Range-Abruf):
PDT 4.8, `statProcess 0` (Mittel), `forecastTime 0`, Intervall 0 → Schritt (60 / 120 / 180 min bei +1/+2/+3 h) ⇒ **Mittel seit
Modellstart**, die Rückrechnung F(t1,t2) = (t2·F(0,t2) − t1·F(0,t1)) / (t2 − t1) ist nötig. RUC (`ASWDIR_S`, Lauf 16 UTC,
Schritt +1 h): dieselbe Konvention. Dekodiert: ATHB_S Mittel −74 W/m² (−178 … +16) = **Netto**-Thermalstrahlung am Boden
(negativ), T_G 266,8 … 300,9 K; Probe an drei Zellen: LW↓ = ATHB_S/ε + σ·T_G⁴ ≈ 250 … 310 W/m² mit ε = 0,95 (plausibel für
Oktober); Intervallmittel der 2. Stunde aus den zwei Startmitteln −82,7 / −85,8 / −141,1 W/m². ε_s der ICON-Oberfläche
ist nicht aus der DWD-Doku belegt ⇒ vorerst `set` 0,95.

**(f) FRZ_RAIN** (ICON-D2 v1, Lauf 12 UTC): Disziplin 0, Kategorie 1, Nummer 67 (WMO 4.2 „freezing rain"), PDT 4.8
`accumulation` seit Modellstart ⇒ **Summe gefrierenden Regens seit Laufbeginn in kg m⁻² (= mm)**, Rate je Stunde = Differenz
zweier Schritte. Oktober-Probe: +6 h überall 0, +12 h max 0,094 mm. Ein DWD-Text zur Größe war nicht auffindbar (Newsletter
September 2026 nennt nur URL-Schema, VIS, DEN/SMI) — Lesart aus dem GRIB-Kopf, mit dem ersten Winterfall gegen die
Bourgouin-Diagnose zu prüfen (V-VS-3).

**(g) TCH / TCM** vorhanden (PDT 4.0, Momentanwert je Schritt; TCH 0,001 … 3,44, Mittel 0,009; TCM 0,001 … 7,55, Mittel 0,019,
dimensionslos) — als Vergleich zur eigenen Monin-Obukhov-Iteration verwendbar, wie der Prompt es will.

**(h) Modellflächen T und HHL** im v1-Schema vorhanden (65 bzw. 66 Flächen, je Fläche eine Datei; Bourgouin braucht die unteren
≈ 20 Flächen ≈ 15 MB je Schritt — nur für Stunden mit Niederschlag und T2m nahe 0 °C abrufen). **T_SO** 9 Tiefen (unterer Rand
der Wärmeleitung ist damit aus dem Modell lesbar, als Vergleich zur Klimatologie).

**(i) VIS.** `icon-d2` v1 hat **kein VIS** (Verzeichnis), `icon-d2-eps` v1 auch nicht; `icon-d2-ruc` v1 hat VIS (15 min bis
+27 h, 109 Schritte, Meter, 78 … 64 383) — **aber der DWD-Newsletter September 2026 sagt, VIS wird nach dem 30.11.2026 auch
aus ICON-D2-RUC entfernt** („die VIS-Felder der ICON-Modellkette sind nicht geeignet, Sichtweiten nach VFR vorherzusagen"), für
ICON-EU/ICON-D2(-EPS) kommt es nicht ins v1-Schema. Siehe 20.3 (2).

**(j) Archiv.** `buscosun-archiv` `road/v1/<Tag>/{00,12}.json.gz, hz/, slots.json` seit 02.10. (27 Tage), `road/fc/v1/<Tag>/`
seit 04.10.; kein SWSMOS; `road-archiv.yml` läuft alle 3 h — drei SWSMOS-Läufe je Archivlauf nachzuholen reicht (DWD 48 h).
Roh wären das 2 MB bz2 je Lauf = 48 MB/Tag — zu viel für ein Git-Archiv; gekürzt auf die 1 632 GMA, Spalten `TL TS TD RC`
und Vorlauf 1–48 h ≈ 1/10 davon (E-VS-7, s. 20.3).

### 20.3 Befunde, die den Plan berühren (kein Umsturz des Designs — SWSMOS hat TS, ATHB_S ist rekonstruierbar; also weiter mit 6.2.1)

1. **Recherche-Datei fehlt** (20.0): Konstanten bis dahin `set` mit Herkunft Startprompt; Liste in 20.6; Rückfrage.
2. **VIS fällt am 30.11. auch im RUC weg** ⇒ E-VS-6 erweitert: **ab Dezember kommt die Sicht 0–48 h aus der eigenen
   Diagnose** (Koschmieder, Gultepe, Niederschlags-β) plus Messung (POI/GMA) plus MOSMIX wwM/VV10; RUC-VIS dient bis zum
   30.11. als Lern- und Vergleichsgröße der Kalibrierung, nicht als Baustein. Entscheidung Jan: so bauen (Vorschlag) oder 6.2.6
   bis zum Nachfolgeprodukt des DWD zurückstellen.
3. **SWSMOS-Legende RC 3–6 und Spaltenbedeutungen** sind unbelegt; der Verifier prüft RC nur auf ∈ {1 … 6}, der Prüfstand
   wertet RC erst, wenn ein Winterlauf die Codes zeigt (V-VS-1). Eine Anfrage an den DWD nach der SWSMOS-Formatbeschreibung
   lohnt (V-VS-2).
4. **E-VS-7 (Vorschlag):** SWSMOS gekürzt archivieren (GMA-Schnittmenge, `TL TS TD RC`, Vorlauf 1–48 h, gz) im `road-archiv`-Lauf
   alle 3 h, drei Läufe je Durchgang ≈ 5 MB/Tag; die Rohdatei nicht. Ohne Jans Nein wird so gebaut.
5. **Nummern E-AW-38…43 doppelt** ⇒ E-VS-n (20.1).
6. **Antriebsbudget:** 4 772 Punkte × 49 Stunden; je ICON-D2-Lauf ≈ 16 Einflächenfelder × 49 Schritte × 0,8 MB ≈ 630 MB Download
   im Action-Lauf, abgetastet auf Punktreihen (≈ 4 772 × 49 × 16 Werte ≈ 15 MB roh, ≈ 2 MB gz) — tragbar alle 3 h; die
   Modellflächen nur bei Bedarf (h). Ein eigener Workflow `road-vs.yml` statt einer Verlängerung von `road-fc.yml` (25 min Limit).

### 20.4 Modellablauf (Programmablaufplan nach DIN 66001, Textform; Sinnbilder: ⬭ Grenzstelle, ▭ Verarbeitung, ◇ Verzweigung, ▱ Daten, ⊟ Unterprogramm)

```
⬭ Start (Lauf ICON-D2 r, Achspunkt p, Modellzustand Z[p] aus buscosun-data)
▱ Eingänge: ICON-D2 v1 (T_2M TD_2M RELHUM_2M U/V_10M ASWDIR_S ASWDIFD_S ATHB_S T_G T_SO PRR/PRS/PRG_GSP FRZ_RAIN CLCT CLCL WW CEILING QC QR QS QG),
             RUC (0–27 h, 15 min), road/fc/v1 (Fusion T Td Wind Niederschlag), GMA-Slot (rs ta td rh wf cond vis), Ortsmerkmale (F_sv, Horizont, Brücke, Belag)
⊟ QC der GMA (Kette 1–9, gemeinsames Modul) → gültig / verworfen / schwach
◇ Pflichteingang fehlt? ─ja─▶ ▱ Ausgabe „unbekannt" (null) für diese Stunde ─▶ nächste Stunde
   └nein
▭ Antrieb je Stunde: Intervallmittel aus Startmitteln; LW↓ = ATHB_S/ε + σT_G⁴ (Rückfall METRo-Bedeckung); Abschattung (Horizont, F_sv)
◇ GMA gültig ≤ 6 h alt? ─ja─▶ ⊟ Kopplung: C ∈ [0,01; 3] per Bisektion im 3-h-Fenster, Abklingen e^(−t/4 h)
   └nein ──▶ ⊟ Standortkorrektur (Residuentabelle Station × Stunde × Wetterklasse; Nachbar-Residuen im Höhenband)
▭ Energiebilanz G0 = (1−α)·SW↓·C_S + ε·LW↓·C_L − εσTs⁴ + H(Monin-Obukhov) − LE(Bulk) + Q_P + Q_V
◇ |Ts − 0 °C| ≤ 0,1 K und Speicher Wasser/Eis > 0? ─ja─▶ ▭ Latentwärme-Halt: G0 wandelt Wasser↔Eis, Ts bleibt
   └nein ──▶ ▭ Wärmeleitung 1-D, 15 Knoten, Δt = 30 s (Stabilität geprüft), unterer Rand Jahres-Sinus; Brücke: zweite Säule
▭ Speicher: Wasser, Porenwasser, Schnee, Eis, Reif (Niederschlag, Deposition/Verdunstung, Schmelze, Verkehrsabrieb)
▭ Zustand (erste Regel gewinnt): Glatteis → Schneeglätte → Matsch → Eis/überfr. Nässe → Reif → nass/feucht/trocken; Wasserfilm (Gallaway); Griffklasse
⊟ Sicht: Messung (POI/GMA) · P(<x) aus Diagnose/MOSMIX/RUC (bis 30.11.)
▱ Ausgabe je Stunde: tf tf_sigma tf_src tf_bruecke · wasser/schnee/eis/reif/wasserfilm_mm · zustand glaette_p griff szenario · vis_p* vis_src · Kaltstart
▭ Modellzustand Z[p] fortschreiben (atomar), Schattenprotokoll
⬭ Ende
```

### 20.5 Offen nach dem Spike (V-VS)

| Nr. | Befund | Mehrwert | Skizze |
|---|---|---|---|
| V-VS-1 | SWSMOS RC 3–6 im Oktober nicht vorhanden | Prüfstand gegen RC erst im Winter aussagekräftig | Verifier zählt Codes je Lauf; Gate-G-Teil „RC" wartet auf den ersten Lauf mit Code ≥ 3 |
| V-VS-2 | Keine DWD-Beschreibung der SWSMOS-Spalten gefunden | Einheiten und Bedeutung belegt statt vermutet | Anfrage an den DWD (Text für Jan in `MANUELLE-SCHRITTE.md`) |
| V-VS-3 | FRZ_RAIN-Lesart nur aus dem GRIB-Kopf | Glatteis-Eingang belegt | ersten Winterfall gegen Bourgouin und GMA-Code 5/6 legen |
| V-VS-4 | `npm run health` prüft keine einzelne GMA-Reihe | tote Reihe (LH-LH, WW-SO heute) sichtbar | R6: Reihe `missing`/`stale` > n h ⇒ rot, n `set` |
| V-VS-5 | ε_s der ICON-Oberfläche nicht belegt | LW↓-Rekonstruktion ohne `set` | ICON-Doku (Surface emissivity, `emis_rad`) nachschlagen; bis dahin 0,95 |

### 20.6 `set`-Register der Linie (wächst je Paket; jede Zeile mit dem Ort im Code und dem Weg zur Kalibrierung)

| Wert | Zahl | Ort | Herkunft heute | Kalibrierung |
|---|---|---|---|---|
| ε_s (ICON-Oberfläche, LW↓-Rückrechnung) | 0,95 | `roadVsForcing.ts` `ROAD_VS_SURFACE_EMISSIVITY` | Startprompt / RoadSurf | ICON-Doku (V-VS-5) |
| LW↓-Rückfall Brunt a, b; Bolz c | 0,52 · 0,065 · 0,22 | `ROAD_VS_LW_FALLBACK` | `literature` (Brunt 1932, Bolz 1949) — die METRo-Achtel-Tabelle steht in der fehlenden Recherche | gegen ATHB_S-LW↓ der Antriebsdateien messen (eine Woche), dann a/b/c fitten |
| Konstanz Fahrbahn UND Luft | 4 h (16 Slots) | `roadVsQc.ts` `VS_QC_CONSTANT_H` | Startprompt | Trefferzahl am Archiv zählen (echte Windstillen-Nächte?) |
| Winterdifferenz Fahrbahn − Luft (schwach) | −10 … +15 K, Nov–Mär | `VS_QC_WINTER` | AW-0 p1/p99 −5,4/+16,2 K über alle Jahreszeiten; Band weiter gesetzt | Verteilung je Monat am Archiv ab Dezember |
| Tukey-Zaun auf Residuen | k 1,5 · n ≥ 5 · IQR-Boden 1 K | `VS_QC_IQR` | k Tukey 1977; n und Boden gesetzt | Fehlalarmquote an Tagen mit gültigen Fühlern |
| Modellkonsistenz | k 4 σ · σ-Boden 1 K | `VS_QC_MODEL` | gesetzt | σ je Wetterklasse aus 6.2.4, k an der Verteilung der Residuen |
| Kopplungsfenster | ≤ 6 h | `VS_QC_COUPLE_MAX_AGE_MS` | Startprompt | — |
| Health R8 | 20 Reihen ok | `health-manifests.mjs` `groupsOkMin` | = Slot-Sperre Basis 23 − Toleranz 3 | — |
| SWSMOS-Archiv | 4 Spalten, 48 h, GMA-Schnittmenge | `swsmos-archive.mjs` | E-VS-7 (Größe) | — |
| Zellindex: größter Abstand Punkt → Zelle | 5 km | `buildCellIndex(maxKm)` | ICON-D2 2,1 km Maschenweite ⇒ nächste Zelle < 1,5 km; 5 km nur als Schutz vor Punkten außerhalb des Gebiets | — |

### 20.7 AW-6.2.1 Eingänge und QC (27.10.2026, Zweig `feat/aw-6.2-virtueller-sensor`)

**Gebaut.**

| Teil | Datei | Was |
|---|---|---|
| Vertrag Antrieb | `src/road/vs/roadVsForcing.ts` | Produkt `road/vs/v1/forcing/<lauf>.json.gz` (27 Felder, Tabelle `ROAD_VS_FIELDS` mit DWD-Parameter, lvt-Pfad, Art `inst`/`avg`/`acc`, Einheit, Skala, Spanne), Zellindex `static/cells.json`, Physik: `intervalFromStartMeans` (Rückrechnung F(t1,t2)), `amountFromStartAccumulations`, `lwDownFromNet`, Brunt/Bolz-Rückfall, Magnus Wasser/Eis + Frostpunkt, Prüfer `roadVsForcingProblems`, Eimer-Zellindex `buildCellIndex` |
| QC-Kette | `src/road/vs/roadVsQc.ts` | `vsQcStation`: Schritte 1–2 aus den Marken der Messlinie (`x` ⇒ `hard:<Regel>`, `o` ⇒ `observe:<Regel>` = Verwurf wie beim Anker, M4), 3 Sprung (`ROAD_JUMP_K` je Slot), 4 Konstanz Fahrbahn UND Luft ≥ 4 h (Lücken ≤ 4 Slots neutral), 5 gleichartige Sensoren (`spread`, `rsHi − rs > 5 K` ⇒ schwach), 6 Winterdifferenz (schwach), 7 Tukey-Zaun auf Residuen gegen das Modell im 25-km/300-m-Band, 8 Modellkonsistenz k·σ (ohne Kaltstart), 9 Codes 3–6 schwach. Was nicht laufen konnte, steht in `skipped` — nie stilles Grün. **Die Messlinie selbst (`roadContract.ts`) ist unverändert**: die Kette sitzt darüber und entscheidet nur, was der VS koppelt und lernt |
| Schalter | `src/road/roadFlag.ts` | `ROAD_VS_LIVE = false`, `?roadvs=0|1`, `localStorage.roadvs` (E-VS-2) |
| Producer Antrieb | `scripts/road/vs/build-forcing.mjs` | jüngster VOLLSTÄNDIGER ICON-D2-Lauf (ATHB_S +48 h als Sonde), CLAT/CLON ⇒ Zellindex einmal (Prüfung: gleiche Punktdatei, gleiche Zellzahl), je Feld und Schritt holen → dekodieren (`gribDecode.ts`, CCSDS) → an den Zellen abtasten → verwerfen; Template-Wächter je Feld (Momentanwert ≠ PDT 4.8, Mittel = Prozess 0 seit Start, Akkumulation = Prozess 1) ⇒ der ganze Lauf wird abgelehnt (Exit 3), nie still falsch; Rückrechnung auf Stundenintervalle, LW↓, RUC-VIS stündlich 0–27 h auf die ICON-Achse gelegt (bis 30.11.), Wiederholungsschutz am Zeiger, Publish mit Neuaufsetzen pfadbegrenzt auf `road/vs/v1` |
| SWSMOS-Archiv | `scripts/road/swsmos-archive.mjs` | Verzeichnis lesen, fehlende Läufe der letzten 48 h (≤ 6 je Durchgang) laden, `reduceSwsmos` (rein): GMA-Schnittmenge, `TL TS TD RC`, Vorlauf 1–48 h, 0,1 °C ⇒ `swsmos/v1/<Tag>/<HH>.json.gz`; Katalog `static/katalog.json` nur bei neuer Prüfsumme; `index.json` mit RC-Zählung je Lauf (V-VS-1 wird so von selbst sichtbar), README |
| Wächter | `scripts/health-manifests.mjs` R8 | je GMA-Reihe: `< 20` Reihen `ok` ⇒ rot; die nicht-ok-Reihen stehen immer im Text (heute `LH-LH missing, WW-SO missing`); Kill-Schalter ⇒ grün; `verify:health` 4 neue Fälle (V-VS-4) |
| Workflows (Vorlagen) | `scripts/road/workflow-road-vs.yml` (Daten-Repo, `25 1,4,…,22`, Sparse `road/fc/v1/static` + `road/vs`, Klon-Ref `vars.ROAD_VS_WEB_REF` bis zum Merge), `scripts/punktarchiv-repo/workflow-road-archiv.yml` (Schritt „Archive SWSMOS", Sparse `road` + `swsmos` — ohne das zweite Muster würde `git add` die Dateien still verwerfen) | noch NICHT in den Repos: beide klonen `buscosun-web`, und die Linie liegt nur im lokalen Zweig (§79 `MANUELLE-SCHRITTE.md`) |
| Verifier | `scripts/verify-road-vs.mjs` (`npm run verify:road-vs`) | **39/39**: A Antrieb (Rückrechnung exakt auf 6 Stunden mit Gegenprobe, Akkumulation, LW↓-Rundlauf, Brunt/Bolz-Spanne, Magnus, Kodierung, Prüfer mit drei roten Fällen, Zellindex = Brute-Force 60/60, URLs = Spike), B QC (16 Slots, Lücken, Sprung, Tukey mit Höhenband, k·σ, Kaltstart, harte/Beobachtungs-Marken, eingefrorener Logger, Vollkette, schwache Hinweise, Oktober ohne Winterregel), C SWSMOS-Reduktion (Spalten, 48 h, Skala, null, RC-Zählung, Gegenprobe ohne TS, Katalog Windows-1252/Dezimalkomma), D Schalter, E R8 = Vertrag + Live-Form 27.10., F Template-Wächter, Abtastung, Zeiger, gz-Rundlauf |

**Gemessen (27.10.2026 18:50–19:20 UTC+1).**

- Antrieb gegen den LIVE-v1-Pfad, 40 Punkte, 7 Felder (`t2m lwnet tg frz prr tso0 qc`), ohne RUC: Lauf **2026-10-27 15 UTC** als vollständig erkannt, Zellindex aus CLAT/CLON (542 040 Zellen) in Sekunden, alle 49 Schritte ohne Lücke, Template-Wächter grün für alle sieben (also stimmen `prr`/`tso0`/`qc` als Momentanwerte, `lwnet` als Mittel seit Start, `frz` als Akkumulation), **23 s** gesamt bei 4 parallelen Abrufen — hochgerechnet 26 Felder ≈ 2–3 min Netz je Lauf, dazu die Abtastung von 4 772 statt 40 Punkten (vernachlässigbar: ein Array-Zugriff je Punkt). Datei 10 KB gz für 40 Punkte × 8 Felder ⇒ **≈ 4 MB gz je Lauf** für alle Punkte und Felder (E-VS-7-Budget: drei Läufe im Daten-Repo ≈ 12 MB).
- SWSMOS-Archiv gegen den LIVE-Ordner in ein Scratch-Verzeichnis: Läufe 27.10. 15 und 16 UTC je **1 632 Stationen, 223 KB gz**, RC-Zählung 66 416/11 920 bzw. 66 053/12 283 (nur 1 und 2 — V-VS-1 bestätigt), Katalog 1 884 Zeilen sha `943da36a748e`. ⇒ **≈ 5,4 MB je Tag, ≈ 160 MB je Monat** im Archiv-Repo.
- `npm run typecheck` grün; `verify:health` **66/66**; `verify:road-archive` s. Lauf (Vorlage geändert).

**Annahmen dieses Pakets (eine Zeile je Annahme).** RUC liefert im Antrieb nur VIS (stündlich); die 5-min-Niederschlagsform kommt im Kern aus dem bestehenden Produkt `ruc/v1` (Leser `rucPoint.ts`), nicht aus einem zweiten RUC-Abgriff. Die QC-Kette läuft ÜBER der Messlinie (Rule 2, V-AW-70: Änderungen an `ROAD_NEIGHBOUR`/harten Regeln sind Jans Gate). Modellflächen T/HHL (Bourgouin) werden erst in 6.2.5 geholt, nur für Stunden mit Niederschlag und T2m nahe 0 °C.

**Offen nach 6.2.1.** Workflows einspielen (§79, braucht den Zweig auf GitHub oder den Merge); erster Volllauf des Antriebs mit allen 4 772 Punkten (Zeit, Größe, `missing`/`outOfRange` messen, Feld `tch` gegen die eigene Iteration in 6.2.3); `rh2m`/`ceil`/`ww`-Spannen am ersten Volllauf prüfen (`outOfRange` zählt); V-VS-6: der Antrieb trägt noch keine Modellflächen; V-VS-7: `fieldSeries` lädt Felder nacheinander (26 × 49 Dateien) — bei Bedarf zwei Felder parallel.
