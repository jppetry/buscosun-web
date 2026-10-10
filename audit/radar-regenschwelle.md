# Phase RG — Darstellungsschwelle des Niederschlagsradars, gemessen an Stationen

> Auftrag Jan 10.10.2026: „Wichtig ist es mir, dass es an einer blau gekennzeichneten Stelle (auch hellblau) mindestens ein
> bisschen regnet." — „Erst gegen Messstationen messen und dann eine Schwelle bestimmen", so professionell wie möglich.
> Betrifft die Wetterkarte „Niederschlag" und `/regenradar` (HD-Ebenen DE/AT/CH, 250-m-Kacheln, Komposit `?hd=0`).
> Vorgänger: Phase RS (`audit/radar-randsaum.md`, Saum beim Zeichnen), HD-3 (`audit/radar-hochaufloesung.md` §7.3, Log-Ebene),
> R250 (`audit/radar-250m.md`), E-EX-6 (`audit/fusion-expertenbericht-2026-09-29.md`: RV in RADOLAN-Einheiten).
> Werkzeuge und Belege in `audit/radar-regenschwelle/`; Rohdaten (DWD-Tars, CDC-Zips) außerhalb des Repos in
> `C:\dev\buscosun-radar-truth\`.

## §0 Kurzfassung für Jan

**Stand RG-3 (10.10.2026): Diagnose, Messung (Regel vorab eingefroren), Entscheidungen E-RG-1…3 (Jan 10.10.: Z = 90 % ⇒ 0,060 mm/h,
EINE Schwelle, darunter unsichtbar) und Umsetzung (§6) fertig, Gates grün (§7); Push von `main`, dann die Workflow-Zeile ins
Daten-Repo = Jans Gate (`MANUELLE-SCHRITTE.md` §59).**

- **Gemessen:** an 175 DWD-Stationen mit Niederschlags-**Indikator** (ein eigener Sensor, der auch Niederschlag unter der
  Auflösung des Messbechers meldet — genau „mindestens ein bisschen"), 48 h RV-Analysen 08.–10.10., 49 386 Stations-Intervalle
  (§5). **Heute regnet es an 86,2 % der blauen Stellen** (jedes Echo wird gezeigt). Mit einer Schwelle von **0,06 mm/h auf den
  nativen Werten sind es 93,1 % (90-%-Intervall 90,7–95,0), Hold-out 93,0 %** — das ist die kleinste Stufe, die das empfohlene
  Ziel „9 von 10" sicher erreicht (Regel R-RG-1). Preis: von den Intervallen, in denen der Sensor Niederschlag meldet, verlieren
  15 Prozentpunkte ihr Blau (Erfassung 83 → 68 %), die blaue Fläche sinkt von 29,6 auf 23,6 % der Radarfläche (−20 %). Bei
  0,12 mm/h wären es 95,7 % Treffer, Erfassung 58 %, Fläche −35 %; bei 0,2 mm/h 97,3 % / 49 % / −48 %.
- **Herborn-Fall (07:40 UTC):** der hellblaue Streifen westlich von Herborn (Burbach, Herdorf: nativ 0,024 / 0,048 mm/h, gezeigt
  0,12) verschwindet ab 0,06; im Kasten bleiben 392 statt 881 blaue Pixel (Bild `radar-regenschwelle/herborn-0740-vorher-nachher.png`).
- **Mengen-Messung taugt nicht als Wahrheit:** der Messbecher (0,01 mm) registriert in 10 min keinen Niesel — an denselben
  Stationen sagt er nur 59 % Treffer, wo der Indikator 86 % sagt (§5.3). Deshalb W1 (Indikator) als Wahrheit; CH hat nur 0,1-mm-
  Messungen und keinen Indikator ⇒ dort nicht messbar (§5.5), AT ist zirkulär (INCA nimmt die Stationen auf, §3).
- **Ehrlich:** zwei Herbsttage mit viel Landregen und Schauern (33 % der Radarfläche nass im Median), kein Schnee, keine
  Gewitterlage; 17 Blöcke à 3 h statt Tage. Die Schwelle trägt das Datum, die Sammlung läuft weiter (V-RG-1: nach ≥ 7 Tagen
  und im Winter nachmessen). Stationen fern vom Radar (100–150 km, 2 556 Intervalle) liegen bei 0,06 mit 89,1 % knapp unter
  dem Ziel (§5.4, R-RG-3 ausgelöst ⇒ E-RG-2).
- **Was dann zu tun ist (RG-2, §6):** die Schwelle liegt genau auf der nominellen Untergrenze der Log-Ebene (0,06) — der
  Producer muss die Log-Ebene und die 250-m-Kacheln aus den **nativen** Werten bauen (Schalter, ohne ihn byte-gleich), dann greift
  die Untergrenze von selbst; der Client bekommt die Schwelle als EINE Konstante `measured` (Legende/Status „Radar ab 0,06 mm/h",
  CPU-Vorpass für Schwellen über 0,06, `?rmin=` zum Vergleich). buscosun Fusion, Summen, Regenbeginn, Nowcast bleiben byte-gleich (§2).

**Jans Entscheidungen (STOP & ASK nach RG-1):** E-RG-1 Ziel Z (80 / 85 / 90 / 95 % ⇒ 0,012 / 0,024 / **0,060** / 0,144 mm/h;
Empfehlung 90 %), E-RG-2 eine Schwelle oder nach Radarabstand gestaffelt (§5.4; Empfehlung: EINE Schwelle jetzt, Staffelung
nach der Vorwärtssammlung prüfen), E-RG-3 unter der Schwelle unsichtbar (Empfehlung) oder eine blasse Schraffur „Spuren".

### §0.1 Diagnose (RG-0)

- **Es gibt keine Darstellungsschwelle.** Das DWD-RV-Komposit trägt seine Werte in 0,001 mm je 5 min (0,012 mm/h); der Leser
  hebt beim Nachbilden der RADOLAN-Einheiten jedes Echo auf mindestens eine Einheit = **0,12 mm/h** an (`src/sources/rvHdf5.ts:171`,
  E-EX-6). Die Log-Ebene (0,06 … 200 mm/h) wird aus diesen angehobenen Werten gebaut — ihre nominelle Untergrenze 0,06 mm/h
  greift nie. **Jedes Echo wird Hellblau**, auch Rohwert 1 (0,000 mm/h) und 2 (0,012 mm/h).
- Am Slot 10.10. 07:40 UTC (gemessen, §1.2): 196 538 nasse Pixel in der Domäne, **30,5 % davon angehoben**, 20,7 % liegen nativ
  unter 0,06 mm/h, 28,4 % unter 0,1 mm/h; im Kasten Siegerland/Lahn-Dill 71,4 % der nassen Pixel angehoben. Alle sechs trockenen
  Stationen des Vorbefunds lagen unter Echos mit nativen 10-min-Summen < 0,05 mm.
- AT und CH haben das Problem **nicht**: INCA (0,04-mm/h-Stufen) und rzc (0,01-mm/h-Stufen) werden mit ihren echten Werten
  quantisiert, die 0,06-Schwelle wirkt dort (INCA: 13,8 % der nassen Zellen fallen weg, de facto ab 0,08 mm/h; rzc: 22,9 %,
  de facto ab 0,07 mm/h). Ob 0,06 dort reicht, ist dieselbe Frage.
- **Was zu tun ist:** die Schwelle an DWD-10-min-Stationen messen (Regel vorab eingefroren, §4), dann im Producer die Log-Ebene
  und die 250-m-Kacheln aus den nativen Werten mit der gemessenen Schwelle bauen und im Client dieselbe Schwelle als EINE
  Konstante mit Herkunft `measured` auf alle Niederschlags-Ebenen legen. buscosun Fusion, Summen, Regenbeginn, Regenchance und
  der Nowcast rechnen weiter auf den RADOLAN-Einheiten (E-EX-6) — die Phase ändert nur die Darstellung (§2).

## §1 Diagnose RG-0

### §1.1 Die Kette heute (Stand `d1a5146` + Arbeitsbaum, 10.10.2026)

| Stufe | Code | Was passiert | Schwelle |
|---|---|---|---|
| Quelle DWD RV (ODIM-HDF5) | — | `ACRR` uint32, gain 0,001 mm / 5 min, offset −0,001, `undetect` 0: kleinste Stufe **0,012 mm/h**; Rohwert 1 = 0,000 mm (Echo ohne messbare Menge) | nur die Echo-Erkennung des DWD |
| Leser | `src/sources/rvHdf5.ts:161–171` | `units: 'radolan'` (Voreinstellung): Einheit = max(1, ⌊mm / 0,01⌋) ⇒ **jedes Echo ≥ 0,12 mm/h**; `units: 'native'` gebaut, nirgends benutzt außer im Verifier (`verify-radar-repack.mjs:381`) | 0 (jedes Echo) |
| v1-Byte | `src/scalar/RainLayer.ts:581–586` `precipToU8` | `mmph ≥ 0,06` ⇒ Byte ≥ 1 (0,12 mm/h ⇒ Byte 2); unter 0,06 ⇒ 0 | 0,06 nominell — bei RV wirkungslos (alles ≥ 0,12) |
| Log-Ebene (HD-3) | `RainLayer.ts:592–602` `precipToU8Log`, `PRECIP_LOG_MIN = 0.06` | aus denselben angehobenen Raten (`decodeRvHdf5Tar(…, { secondary })`, `rvHdf5.ts:186–211`; Producer `scripts/radar-mirror/radar-derive.mjs:48,164`) | 0,06 nominell — wirkungslos |
| Farbe | `RainLayer.ts:623–642` `precipRainRampLog` | 0,06 mm/h = `rgba(196,224,250,0.42)`, 0,12 ≈ zwischen 0,1 und 0,15 (α 0,52–0,60): **Hellblau** | — |
| 250-m-Kacheln (R250) | `src/sources/radarHd250.ts:132–162` `anchorToRv` | nimmt `rv.rainRate` in RADOLAN-Einheiten (der Producer ruft `decodeRvHdf5` ohne `units`, `radar-derive.mjs:67`); Blockmittel = angehobener Wert, Struktur aus dem Standort-dBZ | 0 |
| Randregel (RS) | `RainLayer.ts` `sampleWet`, `u_edge` | nass/trocken je Texel aus dem Byte > 0 — also aus „Echo ja/nein", nicht aus einer Rate | 0 |

Der DWD liefert das RV-Produkt als Niederschlagshöhe mit Echo-Erkennung, nicht mit einer Mindestrate; das Altformat RADOLAN
(0,01 mm) schnitt dieselben Werte ab und hob sie auf eine Einheit — der Leser bildet das bewusst nach, damit die Formatumstellung
das Bild nicht änderte (E-EX-6). Seit HD-3 wird aber eine Log-Ebene mit 0,06 mm/h als Untergrenze beworben, die nie greift.

### §1.2 Messung am aktuellen Slot (`audit/radar-regenschwelle/rv-probe.mjs`, Tars lokal)

Lead 0 (Analyse) von `composite_rv_20261010_0740.tar` und `…_0810.tar`, beide Dekodierungen desselben Felds (Maske identisch,
geprüft im Skript):

| | 07:40 UTC | 08:10 UTC |
|---|---|---|
| Pixel mit Radar | 703 682 | 703 598 |
| nass (RADOLAN-Einheit > 0 = im Bild blau) | 196 538 (27,9 %) | 203 308 (28,9 %) |
| davon **angehoben** (Anzeige > nativ) | **59 980 = 30,5 %** | 57 986 = 28,5 % |
| nativ ≥ 0,06 mm/h | 79,3 % | 80,8 % |
| nativ ≥ 0,1 mm/h | 71,6 % | 73,5 % |
| nativ ≥ 0,12 mm/h | 67,4 % | 69,4 % |
| nativ ≥ 0,2 mm/h | 57,5 % | 60,0 % |
| Histogramm nativ (mm/h) 0,000 · 0,012 · 0,024 · 0,036 · 0,048 · 0,06–0,108 · 0,12 · 0,13–0,19 · 0,2–0,5 · ≥ 0,5 | 1 318 · 10 467 · 9 615 · 5 790 · 7 212 · 25 578 · 4 086 · 19 444 · 42 221 · 70 807 | 1 658 · 9 923 · 8 877 · 5 297 · 7 089 · 25 142 · 4 125 · 19 305 · 45 518 · 76 374 |

Kasten Siegerland/Lahn-Dill (50,55–50,95 N / 7,75–8,55 E, 2 891 km²), 07:40 UTC: 881 nasse Pixel, **629 (71,4 %) angehoben**,
nur 24 tragen nativ genau 0,12 mm/h; Histogramm 12 · 168 · 106 · 52 · 91 · 200 · 24 · 85 · 105 · 38. Um 08:10: 846 nass, 490 (57,9 %)
angehoben. Orte (Pixel unter dem Ort, Maximum ±3 km): Herborn 07:40 nativ 0,000 / max 0,024 mm/h — im Bild max 0,12; Burbach
hier 0,024 ⇒ gezeigt 0,121; Herdorf 0,048 ⇒ 0,121; Dillenburg max 0,36, Haiger 0,50, Siegen 0,68 (die trägt das Bild richtig).
Der Vorbefund der Vorsession (59 % im Kasten, Stationssummen < 0,05 mm an sechs trockenen Stationen) ist damit bestätigt — die
Prozentzahl hängt am Kasten und am Slot.

### §1.3 Die 250-m-Kacheln (`hd250-probe.mjs`, Slot 08:10, 17 Standortbilder lokal)

203 308 nasse 1-km-Blöcke, 176 091 mit Struktur, 27 217 flach. Verhältnis Spitze/Blockmittel und Konzentration je Klasse des
**nativen** RV-Werts:

| nativer RV-Wert | Blöcke | Spitze/Mittel p50 / p90 / p99 | 1 nasse Zelle | ≥ 50 % der Masse in einer Zelle | Spitze p50 / p90 (mm/h) |
|---|---:|---|---:|---:|---|
| < 0,06 | 39 056 | 1,36 / 4,20 / **16,0** | 2,4 % | 4,8 % | 0,16 / 0,50 |
| 0,06–0,12 | 23 055 | 1,46 / 3,32 / 16,0 | 1,6 % | 3,2 % | 0,18 / 0,40 |
| 0,12–0,5 | 64 823 | 1,41 / 2,67 / 11,4 | 0,9 % | 1,8 % | 0,32 / 0,69 |
| ≥ 0,5 | 76 374 | 1,38 / 2,19 / 6,2 | 0,3 % | 0,7 % | 1,60 / 4,73 |

Die Konzentration auf eine Zelle (Faktor 16 = die ganze Blockmasse in einer 250-m-Zelle) ist bei schwachen Blöcken am häufigsten:
unter 0,06 mm/h nativ bekommen 4,8 % der Blöcke mindestens die Hälfte ihrer Masse in EINER Zelle — mit dem angehobenen Mittel
0,12 mm/h steht dort eine Zelle mit 1 mm/h und mehr (Spitze p90 0,50 mm/h bei Blöcken, die nativ unter 0,06 liegen). Das sind die
hellen Punkte, wo es kaum regnet. Bei ≥ 0,5 mm/h ist die Verteilung gutmütig (p90 2,19, R250 maß p50 1,34 über alle Blöcke).

### §1.4 Was NICHT die Ursache ist

- Die Maske: nass/trocken ist Pixel für Pixel die des DWD (geprüft im Skript); die Phase RS hat den Zeichensaum entfernt.
- Die Farbskala: sie zeigt 0,12 mm/h korrekt als Hellblau — das Problem ist der Wert, nicht die Farbe.
- Die Verortung (≤ 1 m, Phase KL) und der Filter (Catmull-Rom, interpolierend, Phase HD).

### §1.5 Was Fachdienste tun (Vergleich, keine Messung)

Kachelmann HD+ beginnt bei 0,1 mm/h („minimal" 0,1–0,4, „leicht" ab 0,4); wetterdienst.de (DWD-Daten) 0,1 mm/h ≈ 5 dBZ; SMHI
zählt < 5 dBZ als kein Niederschlag; NWS-Niederschlagsmodus ab 5 dBZ; Arpae < 10 dBZ bzw. < 0,2 mm/h = abwesend. Mit der
DWD-Beziehung Z = 256 R^1,42: 0,1 mm/h ≈ 10 dBZ, 0,06 ≈ 7 dBZ, 0,012 ≈ −3 dBZ. Diese Zahlen sind Setzungen der jeweiligen
Dienste; die Schwelle von buscosun kommt aus §4.

## §2 Inventar: wer liest RV-Werte, und was muss byte-gleich bleiben

| Verbraucher | Liest | Einheit | Bleibt byte-gleich? |
|---|---|---|---|
| `radar/img/v1/rv/<stamp>/f<lead>.png` (v1-Byte, 25 Frames) | `decodeRvHdf5Tar` → `precipToU8` | RADOLAN (angehoben) | **ja** — Komposit `?hd=0`, Nowcast-Frames, Flow, KI-Nowcast, PoP, Autobahnkarte, Punktabfrage |
| `g<lead>.png` Kanal 1 | derselbe Byte | RADOLAN | ja |
| `g<lead>.png` Kanal 2 (Log-Ebene, HD-3) | `precipToU8Log(rate)` | RADOLAN (angehoben) | **nein — Gegenstand dieser Phase** (nur Anzeige: drei HD-Ebenen, `radarDrape.ts` der ZT-Bühne) |
| `m<lead>.png` Stundenmittel (buscosun Fusion 8, E-AX-16) | Summe der v1-Bytes (`radarImgHourMean.ts`) | RADOLAN | **ja** (E-EX-6) |
| `rv-past/<stamp>/f000.png` (Rückblick) | v1-Byte | RADOLAN | ja |
| `rv-past/<stamp>/h<ty><tx>.png` + `hd250.json` (R250) | `anchorToRv(rv.rainRate)` → Log-Byte | RADOLAN als Blockmittel | **nein — Gegenstand** (nur Anzeige, ab Zoom 9) |
| buscosun Fusion Radar-Member (`src/point/nowcastSample.ts`, `scripts/point/nowcastReader.mjs`) | `f`-Bytes bzw. `m`-Bild, `nowcastFromU8` | RADOLAN | ja — Totzone 0,06 (`NOWCAST_DEAD_ZONE`) bleibt nominell |
| Niederschlagssummen (NS): Gefallen | `precipsum/v1` (RW/SF/INCA/CombiPrecip), Stationen | eigene Produkte, kein RV | unberührt |
| Niederschlagssummen: Erwartet 0–2 h | `radarWindowSum.ts` auf den v1-Bytes (`vmax/255`) | RADOLAN | ja |
| Regenbeginn (RB) `rainWindowRadar.ts:16,27` | v1-Bytes (`RADAR_VMAX = 20`) | RADOLAN | ja |
| Regenchance (RC) | Kartenfelder `pexc`/Feld-Chance (Cube), kein RV | — | unberührt |
| Zellen/KONRAD, Blitze | eigene Produkte | — | unberührt |
| Komposit-Karte `precipComposite.ts` (`?hd=0`, `?rr=legacy`) | v1-Bytes, `values2` nur wenn da | RADOLAN | ja (ohne Schalter; mit Log-Ebene zeigt sie die neue Ebene) |
| Verifier `verify:radar-repack` B1h (Live-Vergleich HDF5 ↔ RADOLAN) | beide Leser | — | unberührt |

Folgerung: die Phase ändert **nur die zwei Anzeige-Produkte** (Log-Ebene, 250-m-Kacheln) und legt im Client eine
Darstellungsschwelle auf die Niederschlags-Ebenen. Alles, was rechnet, bleibt in RADOLAN-Einheiten (E-EX-6). Ob die Anzeige
auch die RADOLAN-Pfade (Komposit, Nowcast-Frames +5 … +120 min) mit der Schwelle versieht, entscheidet §4/§6: dort liegen nur
v1-Bytes (Stufe 0,078 mm/h, jedes Echo ≥ Byte 2) — eine Schwelle unter 0,16 mm/h ist auf dem v1-Byte nicht darstellbar, der
Nowcast-Teil braucht also die Log-Ebene (die `g`-Frames tragen sie für alle 25 Leads).

## §3 Österreich und Schweiz

| | AT INCA (`nowcast-v1-15min-1km`, `incaParse.ts`) | CH rzc (`rzcParse.ts`) |
|---|---|---|
| Rohwert | int16 · 0,01 mm je 15 min ⇒ Stufe **0,04 mm/h**; am Lauf 10.10. 08:xx Lead 15 min: 108 791 nasse Zellen, Rohwert 1 (0,04) 15 050 = **13,8 %** | float mm/h in **0,01-Stufen**; Datei 10.10. 08:20: 78 006 nass, unter 0,06: 17 865 = **22,9 %** (Werte 0,01 · 0,02 · 0,03, dann 0,07 ff.) |
| `precipToU8` / `precipToU8Log` | 0,04 ⇒ 0 (fällt weg), 0,08 ⇒ Byte 1: **de facto Schwelle 0,08 mm/h**, gezeigt 86,2 % | 0,01–0,03 ⇒ 0: **de facto 0,07 mm/h**, gezeigt 77,1 % |
| Anhebung wie bei RV | nein | nein |
| Messung an Stationen | INCA ist eine **stationsgestützte Analyse** (TAWES fließt ein) — eine Trefferquote an TAWES wäre zirkulär; der Nowcast-Lead 15 min ist die verschobene Analyse. **Lücke benannt**, keine Schwelle aus AT-Stationen | rzc ist reines Radar (CombiPrecip blendet, rzc nicht); STAC hält **16 Tage** (288 Dateien je Tag, geprüft 26.09.–11.10.); SwissMetNet `ogd-smn` (160 Stationen) + `ogd-smn-precip` (142) liefern 10-min `rre150z0` als `_t_now.csv` (heute) und `_t_recent.csv` (Jahr bis gestern) ⇒ **messbar**, als zweite Stichprobe in RG-1 |

Die 0,06 mm/h wirken in AT/CH heute als Schwelle, ohne je gemessen worden zu sein (`precipToU8` seit Juli: „unter Schwelle →
transparent", eine Setzung). Für CH prüft RG-1 dieselbe Regel; für AT gilt die DE/CH-Schwelle als Setzung mit Herkunft
`set:transfer`, bis eine unabhängige Wahrheit vorliegt (V-RG-3).

## §4 Messprotokoll RG-1 (Regel eingefroren VOR der ersten Metrik)

### §4.1 Daten

**Wahrheit DE** — DWD CDC 10-Minuten-Niederschlag (`observations_germany/climate/10_minutes/precipitation/`): `recent/`
(500 Tage bis gestern, täglich; 1 398 Stationen, am 10.10. geladen, 07.–09.10. behalten) und `now/` (heute, stündlich; 1 372
Stationen, 08:10-Stand geladen). Spalten `MESS_DATUM` (UTC, Ende des Intervalls), `QN`, `RWS_DAU_10` (Dauer min),
`RWS_10` (mm, 0,01-Auflösung), `RWS_IND_10` (Indikator; QN > 1: 0 = kein, 1 = Niederschlag gefallen; Fehlwert −999).
Beschreibung v24.03 (PDF in `C:\dev\buscosun-radar-truth\cdc-probe\`). **Gemessen am 10.10.:** Indikator und Dauer tragen nur
**178 von 1 372** Stationen (`now`), 179 von 1 398 (`recent`); bei ihnen zeigt der Indikator Niederschlag in 1 203 von 3 202
Intervallen OHNE messbare Menge (RWS_10 = 0,00) an — genau „ein bisschen"; umgekehrt RWS_10 > 0 bei Indikator 0 in 152 von
2 151 Intervallen (4,5 %; Tropfen, Verdunstung, Nachlauf). Zeitstempel: rain[e]H3 = Intervallende; Pluvio Ott im Mittel 5 min
träge (Stempel 11:50 ≈ Intervall bis 11:45) — deshalb die Zeit-Sensitivität in §4.3.

**Radar DE** — die Lead-0-Analysen (`…_000-hd5`, ACRR der 5 Minuten bis zur Slotzeit) aller 576 RV-Tars, die der DWD am 10.10.
08:25 UTC listete: **08.10. 08:25 … 10.10. 08:20 UTC** (48 h, lückenlos), Sammler `collect-rv.mjs` (lokal, kein Cron, kein
Workflow), Ablage `C:\dev\buscosun-radar-truth\rv-analysis\` (172 MB). Werte **nativ** (`units: 'native'`) UND in RADOLAN-Einheiten.
Der Sammler läuft in den nächsten Tagen weiter (Vorwärtssammlung 7–14 Tage, §4.5).

**Wahrheit/Radar CH (zweite Stichprobe)** — SwissMetNet + Niederschlagsstationen (10 min, `rre150z0`), rzc-Dateien derselben Tage
vom STAC; dieselbe Regel.

### §4.2 Zuordnung

Station → DE1200-Pixel wie der Client: `psFwd` auf das polar-stereografische Gitter, `uv` linear zwischen `DE1200_CORNERS`,
Pixel = ⌊u · 1100⌋, ⌊v · 1200⌋ (dieselbe Formel wie `quadCellIndex`/`sampleRadarPoint`, Phase RP). Ausgeschlossen: Stationen
außerhalb der RV-Abdeckung (Standortregel: > 150 km von jedem der 17 DWD-Standorte, `src/point/sourceMatrix.ts`), Pixel `nodata`,
Intervalle mit `RWS_10 = −999`.

Je Stations-Intervall (t − 10, t]: die zwei Analysen t − 5 und t (ACRR (t−10, t−5] und (t−5, t]). **Radarwert des Intervalls =
Maximum der beiden nativen Raten am Pixel unter der Station** (primär; „blau" heißt: mindestens ein gezeigtes Bild im Intervall
ist blau). Sensitivitäten (Bericht, nicht Regel): Mittel statt Maximum; Maximum über 3 × 3 Pixel; Zeitversatz +5 min (Pluvio).

### §4.3 Wahrheit

- **W1 (primär, Indikator-Stationen):** nass ⇔ `RWS_IND_10 ∈ {1, 3}` ∨ `RWS_DAU_10 > 0` ∨ `RWS_10 ≥ 0,01`.
- **W2 (alle Stationen, Mengen-Variante):** nass ⇔ `RWS_10 ≥ 0,01`.
- **W3 (Sensitivität):** nass ⇔ `RWS_10 ≥ 0,1`.

### §4.4 Maße je Kandidat s (native Stufen k · 0,012 mm/h, k = 1 … 42, dazu „Echo" = Rohwert > 0)

- **Trefferquote der Farbe** P(nass | Radar ≥ s) — das Maß, an dem Jans Satz hängt.
- **Erfassung** P(Radar ≥ s | nass), FAR = 1 − Trefferquote, CSI.
- **Blaue Fläche**: Anteil der radarbedeckten Pixel mit nativem Wert ≥ s, Mittel über alle Slots.
- Intervalle: Block-Bootstrap (Prüfstand-Konvention `src/pruefstand/stats.ts` `blockBootstrap`, 1 000 Züge, Seed 12345),
  **Blöcke = Kalendertage (UTC)**; solange weniger als 7 Tage vorliegen, Blöcke = 3-h-Fenster (UTC) — Vorabergebnis, so benannt.
  Intervall = 5 %–95 % (90 %).
- Strata (Bericht): Abstand zum nächsten DWD-Standort < 50 / 50–100 / 100–150 km; Tag (06–18 UTC) / Nacht; Phase entfällt im
  Oktober (keine Schneestationen in der Abdeckung — wird im Winter wiederholt, V-RG-1).

### §4.5 Entscheidungsregel (eingefroren, Hash in `radar-regenschwelle/claims-frozen.sha256`)

> **R-RG-1.** Die Darstellungsschwelle s* ist die **kleinste native Stufe s**, deren Trefferquote-**Untergrenze** (90-%-Block-
> Bootstrap-Intervall) über die GANZE DE-Stichprobe mit Wahrheit W1 das Ziel Z erreicht. Z ist Jans Entscheidung **E-RG-1**
> (Optionen 80 / 85 / 90 / 95 %, Empfehlung 90 % — „an 9 von 10 blauen Stellen regnet es wirklich"); die Tabelle nennt s* für
> jede der vier Optionen, und die ganze Kurve wird als Tabelle und Bild berichtet.
> **R-RG-2.** Stationen mit `STATIONS_ID mod 3 = 0` sind Hold-out: sie gehen NICHT in die Wahl von s* ein und tragen die Abnahme
> (RG-3: dort muss die Untergrenze Z ebenfalls erreichen).
> **R-RG-3.** Unterscheiden sich die Strata-Untergrenzen bei s* um ≥ 10 Prozentpunkte, ist eine stratifizierte Schwelle ein
> Kandidat für E-RG-2; sonst gilt EINE Schwelle.
> **R-RG-4.** Die Schwelle trägt das Datum und den Zeitraum ihrer Messung; nach der Vorwärtssammlung (≥ 7 Tage) und im Winter
> wird sie nach derselben Regel nachgemessen (V-RG-1).

Der Hash in `claims-frozen.sha256` (2092e572…, 08:41:56 UTC) gilt der Kopie `claims-frozen.txt` = §4 wörtlich zum Zeitpunkt des
Einfrierens; §4 ist seither unverändert (Prüfung: `diff <(awk '/^## §4/,/^## §5/' audit/radar-regenschwelle.md | head -n -1) claims-frozen.txt`),
die Abschnitte ab §5 kamen danach dazu. Erste Metrik: 08:45:15 UTC (`ergebnis/score.json` `ranAt`).

## §5 Ergebnis RG-1 (10.10.2026, `ergebnis/score.json`, `ergebnis/curve.md`, Bild `kurve-w1.png`)

### §5.1 Stichprobe

576 Analysen 08.10. 08:25 … 10.10. 08:20 UTC; 1 405 Stationen der Listen, 1 404 innerhalb 150 km eines Standorts, 1 357 mit
Zeilen im Fenster; **383 180 Stations-Intervalle**, davon **49 386 an den 175 Indikator-Stationen** (W1; Auswahl 33 219, Hold-out
16 167; nass nach W1 12 518 bzw. 5 881). Nasse Radarfläche je Slot 5,1 … 48,0 % (Median 33,0 %) — ein regenreiches Fenster.
Blöcke: 17 × 3 h (Regel: < 7 Tage ⇒ Vorabergebnis).

### §5.2 Kurve W1 (Auswahl; Hold-out in Klammern)

| s (mm/h) | Trefferquote P(nass \| blau) (90 %) | Hold-out | Erfassung P(blau \| nass) | blaue Fläche (Radarfläche) |
|---|---|---|---|---|
| **Echo = heute** | **86,2 % (83,1–88,6)** | 85,3 % | 83,2 % | 29,6 % |
| 0,012 | 86,6 (83,5–89,1) | 86,0 | 82,6 | 29,2 |
| 0,024 | 88,9 (85,9–91,3) | 88,4 | 79,4 | 27,5 |
| 0,036 | 91,4 (88,8–93,5) | 91,1 | 73,8 | 26,0 |
| **0,060** | **93,1 (90,7–95,0)** | **93,0 (90,1–95,0)** | **68,2** | **23,6** |
| 0,072 | 93,8 (91,7–95,6) | 93,8 | 65,9 | 22,5 |
| 0,096 | 94,3 (92,4–95,9) | — | 63,7 | 20,7 |
| 0,120 | 95,7 (94,3–96,7) | 95,4 | 58,2 | 19,2 |
| 0,144 | 96,3 (95,1–97,2) | 96,0 | 55,2 | 17,9 |
| 0,204 | 97,3 (96,5–97,9) | 96,7 | 49,1 | 15,4 |
| 0,300 | 98,0 (97,4–98,5) | — | 42,2 | 12,5 |
| 0,504 | 99,0 (98,7–99,3) | — | 31,5 | 8,8 |

**Schwelle nach R-RG-1 je Ziel Z:** 80 % ⇒ 0,012 (Hold-out 0,012) · 85 % ⇒ 0,024 (Hold-out 0,036) · **90 % ⇒ 0,060 (Hold-out 0,060)**
· 95 % ⇒ 0,144 (Hold-out 0,204 — nicht robust). Punktschätzer ohne Intervall: 0,012 / 0,012 / 0,036 / 0,120.

### §5.3 Sensitivitäten (W1, Auswahl, bei s = 0,060)

| Variante | Trefferquote (90 %) | Erfassung | Lesart |
|---|---|---|---|
| primär: Max der zwei Analysen, Pixel unter der Station | 93,1 (90,7–95,0) | 68,2 | Regel |
| Mittel statt Maximum | 94,8 (92,9–96,2) | 64,1 | strenger, gleiche Ordnung |
| Maximum über 3 × 3 Pixel | 89,3 (86,5–91,4) | 76,0 | Nachbarpixel verwässern — die Lage stimmt pixelgenau |
| Zeitversatz +5 min (Pluvio-Trägheit) | 89,5 (86,5–91,8) | 65,7 | Stempel = Intervallende ist die bessere Zuordnung |
| **W2** Menge ≥ 0,01 mm, alle 1 357 Stationen | 62,9 (56,7–69,0); Echo 53,3; 0,504: 84,7 | 78,0 | der Messbecher sieht Niesel nicht |
| W2 NUR an den Indikator-Stationen | 69,2 (63,0–75,0); Echo 59,2 | 78,3 | dieselben Stationen, derselbe Regen: die Lücke zu W1 ist der Sensor (38 % der Indikator-nassen Intervalle haben RWS_10 = 0,00) |
| W3 Menge ≥ 0,1 mm | 35,5; Echo 27,7; 0,504: 62,2 | 93,7 | nur als Gegenprobe |

### §5.4 Strata (W1, Auswahl)

| Stratum | n | Echo | s = 0,060 | s* bei Z = 90 % |
|---|---:|---|---|---|
| Standort < 50 km | 10 204 | 86,3 (83,7–88,2) | **96,1 (94,5–97,2)**, Erfassung 70,8 | 0,036 |
| 50–100 km | 20 459 | 86,4 (82,6–89,3) | 92,1 (89,3–94,5), Erfassung 67,2 | 0,072 |
| 100–150 km | 2 556 | 83,7 (77,5–88,2) | **89,1 (84,2–92,6)**, Erfassung 65,9 | 0,204 |
| Tag 06–18 UTC | 16 335 | 88,3 | 94,7 (92,2–96,3) | 0,036 |
| Nacht | 16 884 | 82,7 | 90,1 (89,1–91,1) | 0,072 |

Die Untergrenzen bei 0,060 liegen zwischen 84,2 (fern) und 94,5 (nah): **10,3 Prozentpunkte ⇒ R-RG-3 ausgelöst**, eine
nach Radarabstand gestaffelte Schwelle ist ein Kandidat (E-RG-2). Einordnung: der ferne Streifen trägt nur 917 nasse Intervalle an
wenigen Stationen (DE liegt dicht an den 17 Standorten; 100–150 km trifft Randlagen und Nachbarländer), die Strahlhöhe dort ist
1,5–3 km — Virga und Überschießen sind die erwartete Physik. Tag/Nacht unterscheiden sich um 3 Punkte (keine Staffelung).

### §5.5 Schweiz (`score-ch.mjs`, `ergebnis/curve-ch.md`)

367 rzc-Analysen 09.10. 00:00 … 10.10. 08:40, SwissMetNet + Niederschlagsstationen aus `obs/v1` (26-h-Reihen, 280 Stationen im
Radarbereich, 38 715 Intervalle, 3 045 nass bei ≥ 0,1 mm / 10 min). Die Stationen messen in **0,1-mm-Stufen** und haben keinen
Indikator — das ist das W3-Äquivalent: Echo 21,7 %, 0,06 mm/h 38,9 %, 0,5 mm/h 69,8 % (DE W3: 27,7 / 35,5 / 62,2) — dieselbe
Form, dieselbe Ursache (der Sensor), **kein Maß für die Schwelle**. CH behält die 0,06 (de facto 0,07) mit Herkunft
`set:transfer` aus der DE-Messung (V-RG-2), AT ebenso (V-RG-3).

### §5.6 Was die Messung NICHT sagt

Kein Winter, kein Schnee, keine Gewitterlage (Oktober-Fronten mit Schauern); 2 Tage; die Intervalle sind 3-h-Blöcke, nicht
Tage; „nass" nach W1 heißt „der Sensor hat Niederschlag erkannt" — über Mengen sagt die Trefferquote nichts. Die
Vorwärtssammlung (`collect-rv.mjs`, `collect-cdc.mjs`, von Hand mindestens alle 48 h) ergänzt die Stichprobe; die Regel bleibt
(V-RG-1).

## §6 Umsetzung RG-2 (10.10.2026, uncommitted; E-RG-1…3 von Jan 10.10. je nach Empfehlung: Z = 90 % ⇒ 0,060 mm/h, EINE Schwelle, darunter unsichtbar)

Die Schwelle liegt genau auf der nominellen Untergrenze der Log-Ebene; realisiert wird sie im **Producer**, der die Ebene
aus den nativen Werten baut. Rule 2: Schalter, ohne ihn byte-gleich.

| Datei | Änderung |
|---|---|
| `src/scalar/radarHd.ts` | `RADAR_DISPLAY_MIN_MMH = 0.06` (Herkunft `measured`, `RADAR_DISPLAY_MIN_MEASURED = '2026-10-10'`, Verweis auf §4/§5), `radarDisplayMinFrom` (`?rmin=<mm/h>` / `localStorage.radarrmin`, 0 = kein Vorpass), `applyDisplayMin` (CPU-Vorpass auf der Log-Ebene: unter oder an der Codec-Untergrenze dasselbe Array zurück — kein Byte, keine Allokation; darüber Bytes unter der Schwelle → 0; kein Shader) |
| `src/sources/rvHdf5.ts` | `decodeRvHdf5(…, { withNative })` liefert `rainRateNative` aus derselben Schleife; `decodeRvHdf5Tar(…, { secondary, secondaryUnits: 'native' })` rechnet `values2` aus den feinen Werten; Voreinstellung (RADOLAN-Einheiten, `values`) unverändert — E-EX-6 |
| `src/sources/radolanDecode.ts` | `RadolanGrid.rainRateNative?` (nur Typ) |
| `src/scalar/RainLayer.ts` | `PRECIP_LOG_EPS = 1e-6` in `precipToU8Log` (V-RG-7: die nativen Werte liegen als Float32 vor, 0,06 ist dort 0,0599999986 — ohne Toleranz fiele genau die Schwellenstufe 5 · 0,012 aus dem Bild; kein heute gespiegelter Wert liegt in (0,06 − 1e-6, 0,06), Produkte byte-gleich) |
| `src/sources/radarImg.ts` | `meta.dual.native: true` + `displayMin` (optional; Prüfer: Paar stimmig, `displayMin ≥ log.min`; Slots vor RG ohne die Felder lesbar) |
| `src/sources/radarHd250.ts` | `anchorToRv(rv, comp, { minRate })`: Block unter der Schwelle ⇒ 16 Zellen trocken, gezählt in `belowMinBlocks`/`hd250.json blocks.belowMin`; `hd250.json displayMin` (Prüfer: endlich, ≥ `PRECIP_LOG_MIN`); ohne Option byte-gleich |
| `scripts/radar-mirror/radar-derive.mjs` | `RADAR_LOG_NATIVE=1`: `rv` → `secondaryUnits: 'native'` + `meta.dual.native/displayMin`; `hd250` → Analyse `units: 'native'`, `minRate`, `displayMin`; nur für die HDF5-Lieferform (das Altformat trägt keine feinen Werte); `f`/`m`/Kanal 1 byte-gleich |
| `scripts/radar-mirror/workflow-radar.yml` | Vorlage: `RADAR_LOG_NATIVE: '1'` (Kopie ins Daten-Repo = Jans Gate §59) |
| `src/MapView.tsx` | `rminRef`, `withDisplayMin` (WeakMap je Ebene) in `plane()` der drei HD-Ebenen und auf den 250-m-Kacheln (A/B); Statuszeile „· ab 0,06 mm/h" (zeigt den `?rmin`-Wert); ohne `?rmin` byte-gleicher Pfad (dasselbe Array) |
| `scripts/verify-radar-threshold.mjs`, `package.json`, `.github/workflows/ci.yml` | `verify:radar-threshold` (CI, netzfrei; Rundlauf an der echten Tar mit `RADAR_RG_RAW`), Fixture `scripts/lib/fixtures/radar-threshold-cases.json` (echte DWD-Indikator-Zeilen × RV-Analysen, jede 40. der 49 559 W1-Fälle, 148 KB; Erzeuger `radar-regenschwelle/fixture-export.mjs`) |

**Gemessen an der echten Tar 07:40 UTC (Producer mit/ohne Schalter):** 53 Dateien, `f`/`m` und `g`-Kanal 1 byte-gleich; Kanal 2
nativ = `precipToU8Log(nativ)` auf jedem Pixel; 33 084 Pixel 0 < nativ < 0,06 (16,9 % der nativ nassen) sind nativ 0 und
angehoben > 0; Rohwert 1 (0,000 mm/h, 1 318 Pixel) blau angehoben, nativ weg; Slot 7,8 → 6,8 MB. 250 m (Slot 08:10): nass
203 308 → **170 464 Blöcke, 31 186 unter der Schwelle** (Rohwert-1-Blöcke 1 658 nativ trocken), 15 Kacheln 1,71 → 1,52 MB.

**Nicht angefasst:** Voreinstellung des Lesers (E-EX-6), buscosun Fusion, Summen, Regenbeginn, Regenchance, Nowcast-Member,
INCA/rzc (quantisieren schon nativ — dieselbe 0,06), die v1-Pfade (Komposit `?hd=0`, `?rr=legacy`: jedes Echo ≥ Einheit,
eine Schwelle unter 0,12 ist dort nicht darstellbar — `?hdv2=0` ist damit der sichtbare Rückweg auf „jedes Echo"), Shader.

## §7 Gates RG-3 (10.10.2026)

| Gate | Beleg | Ergebnis |
|---|---|---|
| G1 Verifier | `verify:radar-threshold` mit `RADAR_RG_RAW` = Tar 07:40: A Konstante/Schalter/Vorpass, B Leser-Regel + Codec-Toleranz, C `anchorToRv` minRate, D Verträge (Mutationen), E Regel-Hash + §4 = eingefrorene Kopie, F Reproduktion an 1 239 echten Zeilen (Trefferquote monoton 85,7 → 100 %; Echo 85,1 < 90 ≤ 0,06 91,0; W2 an denselben Zeilen 58,3/68,7 = Negativkontrolle; 96 Zeilen „heute blau, nativ < 0,06"; Teilmenge gegen Vollstichprobe ≤ 3 Punkte), G Verdrahtung, H Producer-Rundlauf (53 Dateien; `f`/`m`/Kanal 1 byte-gleich; 33 084 Pixel unter 0,06 nativ 0 / angehoben > 0; Rohwert 1 1 318 Pixel) | **34/34** (netzfrei 28 + H 6) |
| G2 Hold-out | §5.2: 0,060 erreicht Z = 90 % auch an den Stationen, die nicht in die Wahl eingingen (93,0 %, Untergrenze 90,1) | grün |
| G3 Nachbarn | `verify:radar-hd` 53/53, `verify:radar-edge` 24/24, `verify:radar-250m` grün (E/F ⊘), `verify:radar-repack` 55/55, `verify:precip-source` 30/30, `verify:radar-sampling` 25/25, `verify:precip-sums` 57/57, `verify:rain-window` 63/63, `verify:fusion-release` 28/28, `verify:regenradar-profile` 35/36 (C1b = Phasenwache V-FR-11, an HEAD gleich) | grün |
| G4 typecheck / Build / Budget | typecheck 0; Build 255/255; `npm run budget`: totalJs **1 697,1 / 1 699** (angehoben um 2 KB mit Notiz, +0,5 KB gzip im lazy MapView-Chunk), eagerJs 109,3 unverändert, largestChunk 278,4 | grün |
| G5 Pixel-Diff ohne Schalter | `regenradar-wk-pixeldiff.mjs` Produktionsbuilds HEAD `d1a5146` (Worktree `C:\dev\buscosun-web-wt\rg-head`) ↔ Arbeitsbaum, 11 Szenarien | s. §7.1 |
| G6 Browser-Orakel mit nativem Slot | `radar-hd-pixelcheck.mjs --dualDir` (Vite-Dev 5231, Fenster DE z10, Slot 07:40 lokal erzeugt, einmal angehoben, einmal nativ) | s. §7.1 |

### §7.1 Pixel-Diff und Orakel

**G5 Pixel-Diff** (`pixeldiff/`, `pixeldiff-2/` = Wiederholung der fünf Live-/Flake-Szenarien): Wind Desktop/Mobil 20 / 0 px,
Übersicht Desktop 82 px, Warnungen 20 px, Regenradar Landing Desktop/Mobil 31 / 0 px (Uhr, LIVE-Puls); **Übersicht Mobil und
Regenradar Ort Mobil** im ersten Lauf 68,9 % / 63,0 % (Länder-Maske bzw. Zellenliste in einem der beiden Builds noch nicht geladen —
V-HD-8-Flake), in der Wiederholung **0 px / 0 px**; Niederschlag Desktop 14 760 → **653 px (0,05 %)** = die Statuszeile
„· 1-km-Gitter (HD) · ab 0,06 mm/h" (im Diff als roter Text sichtbar) + Live-Slotwechsel im ersten Lauf; Regenradar Ort Desktop
3 754 → 98 px; Niederschlag Mobil 53 443 → 41 325 px (1,4 %) — ausschließlich das AT/CH-Regenfeld im Südosten (INCA/rzc-Slotwechsel
zwischen den beiden Ladevorgängen, `pixeldiff-2/wk-niederschlag-live-mobile.diff.png`), kein deutsches Radarpixel, keine
Bedienelemente. Ohne Schalter zeichnet der Arbeitsbaum also wie HEAD; die einzige gewollte Abweichung ist der Statustext.

**G6 Browser-Orakel mit untergeschobenem Slot — nicht belegbar (V-RG-9):** `radar-hd-pixelcheck.mjs --dualDir` liefert in dieser
Sitzung für den ANGEHOBENEN wie für den NATIVEN Slot gleichermaßen 7–50 % Übereinstimmung (nass 0 %; Slots 07:40 und frisch 09:30,
Fenster an der Nordseeküste), also unabhängig von RG; der Canvas zeigt neben der Frame-Struktur große 2–4-km-Blöcke, die in beiden
Varianten gleich sind. In Phase HD (G8, 08.10.) und RS (§4, 10.10. früh) traf dasselbe Orakel 99,97–99,99 %. Die Ursache (Zeitwahl
des Frames gegen den umgeschriebenen Stempel, zusätzliche Ebene seit NS/R250) wurde nicht gefunden; Stunden in die Harness zu stecken
war nicht Gegenstand. Beleg an seiner Stelle: (a) Verifier H4 — die native Ebene ist byte-genau `precipToU8Log(nativ)`, jedes Pixel
unter 0,06 ist 0; (b) Canvas = Ebenen-Bytes ist in RS/HD zu 99,99 % belegt und der Zeichenweg ist unverändert (G5 ohne Schalter
pixelgleich, kein Shader); (c) nach dem ersten nativen Spiegel-Slot das Orakel im RS-Modus gegen den Live-Slot (`--edge=1`,
`MANUELLE-SCHRITTE.md` §59). **Konsole** (`radar-hd-console-probe.mjs`, Dev 5231, ohne und mit `?rmin=0.12`): drei HD-Ebenen
sichtbar (Catmull, Maske), 4–5 Konsolenzeilen, nur Logs, keine Ausnahme.

**Selbstverifikation:** (1) Funktionserhalt — `f`/`m`-Frames, Kanal 1, Komposit, Nowcast, buscosun Fusion, Summen, Regenbeginn
unverändert (Verifier H2/H3, Nachbarn grün); ohne Producer-Schalter byte-gleich; `?hdv2=0` = jedes Echo bleibt erreichbar.
(2) Desktop pixelgleich ohne Schalter (G5, Statustext gewollt). (3) Keine neuen Bedienelemente. (4) Konsole sauber. (5) Long Tasks:
kein Shader, kein Hauptthread-Vorpass ohne `?rmin` — headless ohnehin nicht messbar (V-RG-8).

## §8 Befunde und Entscheidungen

- **E-RG-1 (Jan 10.10.2026):** Ziel Z = **90 %** ⇒ s* = 0,060 mm/h (Optionen 80 / 85 / 95 % ⇒ 0,012 / 0,024 / 0,144).
- **E-RG-2 (Jan 10.10.2026):** **EINE Schwelle**; die Staffelung nach Radarabstand (< 50 km 0,036 · 50–100 km 0,072 · 100–150 km
  0,204) wird nach der Vorwärtssammlung erneut geprüft (V-RG-1).
- **E-RG-3 (Jan 10.10.2026):** unter der Schwelle **unsichtbar** („blau = es regnet").
- **V-RG-7 (behoben):** die nativen Werte liegen als Float32 vor; 0,06 ist dort 0,0599999986 und fiel ohne Toleranz aus
  `precipToU8Log` und aus `anchorToRv` heraus — genau die gemessene Schwellenstufe. `PRECIP_LOG_EPS = 1e-6` (B4/C1 im Verifier).
  Die Messung selbst rechnete mit Toleranz 1e-9 und war davon nicht betroffen.
- **V-RG-9** Das Browser-Orakel `radar-hd-pixelcheck.mjs --dualDir` trifft seit dieser Sitzung weder den angehobenen noch den nativen
  Slot (§7.1) — Harness-Befund, nicht RG; Verdacht Frame-Zeitwahl gegen den umgeschriebenen Stempel oder eine seit NS/R250 zusätzlich
  gezeichnete Ebene. Mehrwert: das Orakel wieder nutzbar. Skizze: Variante im Orakel, die den vom Blatt gezeigten Frame (`pick`) statt
  Lead 0 vergleicht, und alle Nicht-HD-Ebenen vor dem Shot ausblenden.
- **V-RG-8** Real-Device: kein neuer Shader; nur mit `?rmin` > 0,06 läuft ein CPU-Vorpass je Ebene (einmal je Frame-Objekt) —
  ohne Schalter nichts zu messen.
- **V-RG-1** Nachmessung nach ≥ 7 Tagen Vorwärtssammlung (Blöcke = Tage) und im Winter (Schnee: Radar sieht Schnee schwach,
  Indikator stark); Skripte liegen bereit, Lauf = `extract.mjs` + `score.mjs`.
- **V-RG-2** CH: Schwelle `set:transfer` (0,1-mm-Stationen ohne Indikator); eine Messung bräuchte eine Wahrheit unter 0,1 mm
  (Disdrometer, MeteoSwiss liefert keine offen).
- **V-RG-3** AT: INCA ist stationsgestützt — keine unabhängige Wahrheit; Schwelle `set:transfer`.
- **V-RG-4** 250-m-Konzentration: bei nativ < 0,06 bekommen 4,8 % der Blöcke ≥ 50 % der Masse in einer Zelle (Spitze p90 0,50 mm/h
  bei einem Blockmittel unter 0,06) — mit der Schwelle fallen diese Blöcke weg; bei ≥ 0,5 mm/h p99 Faktor 6,2. Eine Dämpfung
  (z. B. Deckel Faktor 4 je Zelle) wäre ein Eingriff in das Verfahren B von R250 — erst nach Jans Blick.
- **V-RG-5** Die `now/`-Dateien tragen für wenige Stationen Altzeilen (Juli–September 2026, 20–160 Zeilen je Tag) — Stationen ohne
  frische Lieferung; der Sammler legt sie nach Tag ab, die Messung liest nur das Radarfenster.
- **V-RG-6** `verify:radar-repack` B1h vergleicht HDF5 ↔ RADOLAN live; nach dem 20.10. (Altformat weg) entfällt es — die
  RADOLAN-Nachbildung im Leser bleibt dann ohne Live-Gegenprobe (nur die 46 175-Zellen-Messung vom 29.09.).
