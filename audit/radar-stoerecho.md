# Phase SE — Radarechos ohne Niederschlag (Störecho-Filter)

> Auftrag Jan 13.10.2026: „Wieso ist auf der Niederschlagskarte gerade ein Fleck im Niederschlagsradar neben Gießen?" — nach der
> Diagnose (V-RG-10 in `audit/radar-regenschwelle.md`): „setze das um", Variante (a) **Filter im Producer**.
> Betrifft die Wetterkarte „Niederschlag" und `/regenradar` (HD-Ebene DE, 250-m-Kacheln). Vorgänger: Phase RG
> (`audit/radar-regenschwelle.md`, „blau = es regnet", Schwelle 0,06 mm/h), HD-3 (Log-Ebene), R250 (Standortbilder `px250`).
> Werkzeuge in `audit/radar-stoerecho/`; Rohdaten außerhalb des Repos in `C:\dev\buscosun-radar-truth\se\`.

## §0 Kurzfassung für Jan

**Stand 13.10.2026: Diagnose, Messung (Regel und Nachtrag vorab eingefroren), Umsetzung im Producer und Gates fertig —
uncommitted, Schalter AUS. Die Bestätigung an frischen Slots (R-SE-8) ist am 13.10. 04:10 UTC gerechnet und nach der
eingefrorenen Regel bestanden — auf schmaler Basis (142 Regen-Intervalle, eines verloren; §7). Offen: dein Einschalten (§8).**

- **Was der Fleck war:** kein Regen. Ein Echo ohne Niederschlag (sehr wahrscheinlich nächtlicher Vogelzug), das nur das Radar
  Offenthal sah und das der Filter des DWD im Nordwest-Quadranten nur zur Hälfte entfernte. Es steht so im amtlichen Komposit;
  selbst die Hydrometeor-Klassifikation des DWD nennt es „Niesel" (§2.1).
- **Woran man es erkennt:** am Korrelationskoeffizienten ρHV aus den Polarscans desselben Niederschlagsscans (17 Standorte,
  ≈ 8 MB je 5 Minuten). Regen liegt nach einer Rauschkorrektur bei 0,97, der Fleck bei 0,65–0,80. Ohne die Korrektur ginge es
  nicht: schwacher echter Regen liest roh ebenfalls 0,6–0,8 (§2.5).
- **Gemessen** an 180 DWD-Stationen mit Niederschlags-Indikator und ≈ 1 300 Mengen-Stationen, 48 h (ein Regentag, ein
  abklingender Tag, die Zugnacht), 288 Radarbilder: der Filter nimmt in der Zugnacht **81 % des falschen Blaus** an den
  Stationen weg (146 von 181 Intervallen) und im Kasten um Gießen **93–99 % der Fläche des Flecks**; an Regentagen ändert er
  0,8 % der blauen Fläche. Der Preis: **7 von 1 000 blauen Regen-Intervallen verlieren ihr Blau** (21 von 2 911 mit
  Randschluss, 20 ohne; fern vom Radar 12 von 1 000).
- **Was stehen bleibt:** ein dünner radialer Strich (≈ 25 km) in Richtung Offenthal, wo das Komposit einen Sektor schließt,
  den das Radar selbst nicht sieht. Eine Variante schließt ihn weiter, kostet aber etwas mehr echten Regen — nach der
  eingefrorenen Regel nicht gewählt (E-SE-2).
- **Gebaut:** der Filter im Derive-Schritt des Radar-Spiegels hinter `RADAR_CLUTTER` (aus). Er ändert nur die Anzeige-Ebene
  (Log-Ebene der `g`-Frames, alle 25 Zeitschritte, und die 250-m-Kacheln); alles, was rechnet — buscosun Fusion, Summen,
  Regenbeginn —, bleibt Byte für Byte gleich. Fehlt eine Eingabe, bleibt das Bild wie geliefert. Ohne Schalter byte-gleich zu
  HEAD (zwei echte Slots, 139 Dateien). Im Client keine Änderung.
- **Ehrlich:** zwei Herbsttage und eine Nacht; kein Schnee, kein Gewitter, kein Sommer. Die Regel trägt ihr Messdatum.
  Regenbeginn und buscosun Fusion sehen das Störecho weiter (V-SE-2), der Rückblick unter Zoom 9 ebenso (V-SE-3).
- **Was der Filter NICHT löst (frische Nacht, V-SE-11):** als nach Mitternacht eine Front aufzog, blieb an trockenen
  Stationen viel Blau stehen — 463 von 609 Intervallen tragen dort eine klare Regen-Signatur (ρc im Median 0,98).
  Das ist Niederschlag in der Höhe, der den Boden nicht oder noch nicht erreicht, kein Störecho; der Filter lässt ihn mit
  Absicht stehen. „Blau = es regnet" traf in diesen Stunden an den Indikator-Stationen nur in 27 von 78 Fällen zu.

**Deine Entscheidungen:** E-SE-1 einschalten (R-SE-8 bestanden), E-SE-2 Nachbarschaftsstimme, E-SE-3 Hinweis in der Statuszeile.

## §1 Befund

In der Nacht 12./13.10.2026 stand ab ≈ 18:35 UTC ein ortsfester hellblauer Fleck von ≈ 25 × 80 km im Niederschlagsradar,
15–35 km westlich von Gießen (Taunus bis Lahn-Dill), nativ 0,06–0,22 mm/h — über der Darstellungsschwelle. Belege (Sonden im
Scratchpad der Sitzung, Zahlen in V-RG-10):

- **Kein Niederschlag am Boden:** alle 8 DWD-Stationen unter dem Fleck 19:00–22:20 UTC Σ 0,00 mm; der Niederschlags-Indikator
  am Kleinen Feldberg 0 von 21 Intervallen.
- **Nur ein Radar sieht ihn:** `px250` 22:35 UTC — Offenthal 2 422 km² mit Echo (2–12 dBZ), Flechtdorf 65, Neuheilenbach und
  Essen 0.
- **Polarimetrie:** im Polarscan Offenthal 22:30 UTC, Sektor 285–360° / 25–90 km, ρHV im Median 0,60, 0 % ≥ 0,95; nur 5 % der
  Bins mit |v| < 1 m/s (kein Bodenecho).
- **Herkunft:** das ungefilterte Echo (`filter_simple`) ist eine volle Scheibe um das Radar (70–90 % der Bins in JEDEM
  Quadranten, 5–90 km) — das Bild nächtlichen Vogelzugs (Insekten kann das Radar nicht ausschließen). Der polarimetrische Filter
  des DWD entfernt davon 95–97 %, im Nordwest-Quadranten nur die Hälfte (86,5 → 47,0 % der Bins); der Rest steht im amtlichen
  RV-Komposit. Kleinere Reste derselben Art um Hannover und Memmingen.

## §2 Diagnose SE-0

### §2.1 Was der DWD selbst dazu sagt: HymecNG taugt nicht

`weather/radar/composite/hymecng/composite_HymecNG_<slot>_000-hd5` ist die Hydrometeor-Klassifikation des DWD auf DEMSELBEN
1-km-Gitter (1100 × 1200, gleiche `projdef`), 37–60 KB je Slot, ≈ 2 min nach dem Slot, Klassen 0 `NO_PRECIPITATION`,
1 `NOT_CLASSIFIED`, 2 `DRIZZLE`, 3 `RAIN`, … 10 `LARGE_HAIL` (254 kein Echo, 255 kein Radar). Es wäre der billigste Filter
gewesen. **Gemessen am Slot 22:35 UTC im Kasten Gießen (50,2–50,95 N / 8,05–9,35 E):** von 1 179 blauen RV-Pixeln nennt HymecNG
**788 `DRIZZLE`**, 147 `NO_PRECIPITATION`, 76 `NOT_CLASSIFIED`, 168 ohne Echo. Die amtliche Klassifikation hält den Fleck
also selbst für Niesel — als Filter unbrauchbar.

### §2.2 Wo der Fleck in unseren Produkten steht

| Produkt | Trägt den Fleck? | Gegenstand dieser Phase |
|---|---|---|
| `radar/img/v1/rv/<stamp>/g<lead>.png` Kanal 2 (Log-Ebene, HD-3/RG) — die DE-Ebene der Karte, Analyse und +5 … +120 min | ja | **ja** |
| `rv-past/<stamp>/h<ty><tx>.png` (250-m-Kacheln, R250, ab Zoom 9) | ja | **ja** |
| `f<lead>.png`, `g`-Kanal 1 (v1-Byte), `m<lead>.png` — Komposit `?hd=0`, Nowcast-Frames, buscosun Fusion Radar-Member, Summen 0–2 h, Regenbeginn | ja | nein — rechnende Pfade bleiben byte-gleich (wie RG §2); V-SE-2 |
| `rv-past/<stamp>/f000.png` (Rückblick 1 km, v1-Byte) | ja | nein (wie RG: der Rückblick unter Zoom 9 zeigt jedes Echo); V-SE-3 |

Die RV-Vorhersage trägt den Fleck weiter: am Slot 22:35 UTC stehen in allen 24 Vorhersage-Frames 889–924 blaue Pixel an
derselben Stelle (Schwerpunkt-Versatz ≤ 1,5 km, 99,9–100 % innerhalb der Analyse-Maske ± 2 km) — das Bewegungsfeld des DWD ist
dort ≈ 0. Der Filter muss also auch die Vorhersage-Frames erfassen (§6.3).

### §2.3 Die Datenquelle: Polarscans des Niederschlagsscans

`weather/radar/sites/sweep_pcp_rhohv/<site>/unfiltered/ras07-pcpng01_sweeph5onem_urhohv_00-<YYYYMMDDHHMMSSss>-<site>-<WMO>-hd5`,
je Standort und 5 Minuten eine Datei (ODIM_H5 V2.2, Leser `src/sources/dwdSweep.ts`):

- 360 Strahlen × 600 Bins à 250 m (150 km), uint16, Größe `URHOHV` (gain 1/65534, nodata 65535, undetect 0); je Strahl das
  wahre Azimut-Intervall (`startazA`/`stopazA`) und die Elevation (`startelA`, geländefolgend 0,5–1,8°).
- **≈ 470 KB je Datei, ≈ 8 MB je Slot** für 17 Standorte; auf dem Server ≈ 45 s nach Scan-Ende (22:35:34 → 22:36:20), also
  ≈ 2 min VOR dem RV-Tar (22:38:14); 48 h Aufbewahrung; Lizenz wie alle DWD-Open-Data (`docs/API.md`).
- Der Dateiname trägt die Sekunden des Scan-Endes (…223534 00), nicht konstruierbar ⇒ Verzeichnislisting oder der Alias
  `…_urhohv_00-LATEST-<site>-<WMO>-hd5` mit Prüfung der Zeit in der Datei.
- `/how/radar_system/dBZ0_H_pw<k>`: Reflektivität in 1 km Entfernung, bei der das Signal gleich dem Rauschen ist (pw2 = die
  0,8-µs-Pulsbreite des Niederschlagsscans, −38,4 … −42,3 dBZ je Standort).

### §2.4 Zuordnung Standortbild ↔ Polarscan

`px250` (Phase R250) ist das kartesische 250-m-Bild genau dieses Scans. Gemessen (Offenthal, Slot 22:35): die Zelle
(a, b) → inverse Projektion → Azimut/Entfernung vom Radar (Großkreis, R = 6 371 km) → Strahl über `startazA`, Bin =
⌊s / cos(el) / 250 m⌋ trifft im `dbzh`-Scan mit dem Namensstempel **2235** an 89,9 % der Echo-Zellen ein Echo, 56,9 % der
Werte auf 0,05 dB gleich (Zellmitte = a · 250 m; mit + 125 m nur 16,2 %); die Nachbarscans 2230/2240 treffen 55 % / 2 %.
**Slot S ⇔ Scan mit Namensminute S** (`/what time` = Slot, der Scan beginnt 4 s später).

### §2.5 URHOHV ist nicht rauschkorrigiert — die Regel muss das SNR kennen

Radar-interne Auswertung ohne Stationswahrheit (`audit/radar-stoerecho/explore-rho.mjs`), jede `px250`-Echo-Zelle mit ρHV,
SNR = dBZ − dBZ0 − 20 · log10(r / km):

| SNR (dB) | Regen 11.10. 04–09 UTC, 17 Standorte (10,2 Mio. Zellen): ρHV p10 / p50 / p90 | Fleck 12.10. 20–22:35 UTC, Offenthal NW 25–90 km (123 185 Zellen): p10 / p50 / p90 |
|---|---|---|
| 3 … 6 | 0,40 / 0,61 / 0,77 | 0,39 / 0,47 / 0,57 |
| 6 … 9 | 0,52 / 0,74 / 0,86 | 0,40 / 0,51 / 0,62 |
| 9 … 12 | 0,66 / 0,84 / 0,92 | 0,47 / 0,60 / 0,70 |
| 12 … 15 | 0,77 / 0,90 / 0,95 | 0,59 / 0,71 / 0,78 |
| 15 … 20 | 0,87 / 0,95 / 0,97 | 0,67 / 0,76 / 0,83 |
| 20 … 25 | 0,92 / 0,97 / 0,99 | — |

Auch echter Regen liest bei schwachem Signal 0,6–0,8: der Lehrbuch-Faktor 1 / (1 + 1/snr). Ein fester ρHV-Schnitt nähme
schwachen echten Regen in der Ferne mit. **Korrektur:** ρc = ρ · (1 + 10^(−(SNR − δ)/10)); δ so, dass der Median von ρc im
Regen über die SNR-Klassen flach ist. Gemessen am 11.10. 09–14 UTC (Tag, 6 Slots, 17 Standorte): δ = 0 ⇒ Spanne 0,145 ·
1,0 ⇒ 0,091 · 2,0 ⇒ 0,034 · **2,5 ⇒ 0,007** (Median 0,974–0,981 über 3–20 dB) · 3,0 ⇒ 0,019 ⇒ `CLUTTER_SNR_OFFSET_DB = 2.5`
(Herkunft `measured`). Unter 3 dB effektivem SNR trägt eine Zelle keine Aussage (`CLUTTER_SNR_MIN_DB`, `set`: der Faktor
übersteigt dort 1,5).

### §2.6 Was NICHT die Ursache ist und was nicht gebaut wird

- Kein Fehler unserer Kette: die Werte stehen so im RV-Tar des DWD.
- Die Darstellungsschwelle (RG) greift nicht: der Kern des Flecks liegt nativ bei 0,06–0,22 mm/h.
- AT und CH: INCA ist stationsgestützt, rzc hat eigene Filter; für beide gibt es offen keine Polarimetrie je Standort
  (V-SE-4). Die Phase betrifft nur Deutschland.

## §3 Daten der Messung

Sammler `audit/radar-stoerecho/collect.mjs` (lokal, kein Cron): je Slot `rv.tar`, `hymec.h5`, 17 × `px250-<site>.h5`,
17 × `rhohv-<site>.h5`, 17 × `dbzh-<site>.h5` nach `C:\dev\buscosun-radar-truth\se\<JJJJMMTT_HHMM>\`.

- **Rückblick 48 h, alle 10 min (Slotminute ≡ 5 mod 10): 10.10. 23:05 … 12.10. 22:55 UTC = 288 Slots, 3,7 GB**, geladen am
  12.10. 22:57–23:06 UTC; 4 Dateien fehlten beim DWD (`missing.txt` im Slot). Danach Mitlauf (`--follow`).
- **Wahrheit:** DWD CDC 10-min-Niederschlag wie RG §4.1 (`audit/radar-regenschwelle/collect-cdc.mjs`), Ablage
  `C:\dev\buscosun-radar-truth\cdc-store\<Tag>.txt`: 11.10. aus `recent/` (195 316 Zeilen), 12.10. aus `now/` (Stand 22:20 UTC,
  183 575 Zeilen; nachgezogen vor 00:00 UTC).
- **Wetter der Stichprobe** (Indikator-Stationen, Anteil der Intervalle mit Indikator 1 je 3-h-Fenster): 11.10. 9–27 %
  (Regentag, 4 664 nasse Intervalle), 12.10. 00–15 UTC 2–8 %, danach < 1 % — und in der Nacht 12./13.10. der Fleck.
  Also ein Regentag, ein abklingender Tag, eine Zugnacht. Kein Schnee, kein Gewitter.

## §4 Messprotokoll SE-1 (Regel eingefroren VOR der ersten Stationsmetrik)

### §4.1 Zuordnung und Wahrheit

Wie RG §4.2/§4.3: Station → DE1200-Pixel (`psFwd`, `DE1200_CORNERS`), nur Stationen innerhalb 150 km um einen DWD-Standort,
Intervalle mit `RWS_10 = −999` ausgeschlossen. **Wahrheit W1** (Indikator-Stationen): nass ⇔ `RWS_IND_10 ∈ {1, 3}` ∨
`RWS_DAU_10 > 0` ∨ `RWS_10 ≥ 0,01`. Je Stations-Intervall (t − 10, t] die EINE gesammelte Analyse t − 5 (Abweichung von RG, das
beide Analysen des Intervalls las — hier liegt jeder zweite Slot vor). **„Blau"** ⇔ nativer RV-Wert am Pixel ≥ 0,06 mm/h
(`RADAR_DISPLAY_MIN_MMH`, die Anzeige seit RG).

- **Menge A** = blau und trocken (W1), **Menge B** = blau und nass (W1).
- **W2** (alle ≈ 1 370 Stationen, nur Bericht): trocken ⇔ `RWS_10 = 0` im Intervall UND in den zwei Nachbarintervallen.

### §4.2 Die Regel-Familie

Je Standort und 1-km-Zelle (Nachbarschaft `kernel` × `kernel` Zellen): die `px250`-Echo-Zellen mit ρHV und effektivem SNR ≥ 3 dB
tragen ρc (§2.5); der Standort **stimmt „kein Niederschlag"**, wenn mindestens 4 solche Zellen je Zelle der Nachbarschaft
vorliegen (`CLUTTER_MIN_CELLS`, set), der **Median von ρc < `rhoMax`** und das **stärkste Echo < `zCap`** ist; mit Aussage,
aber ohne diese Bedingung stimmt er „Niederschlag"; ohne Aussage (kein Echo, zu schwaches Signal) stimmt er nicht. Ein Standort
mit Echo, aber ohne lesbaren Scan des Slots stimmt „Niederschlag" (fail-open). **Eine blaue Zelle wird ausgeblendet, wenn
mindestens ein Standort „kein Niederschlag" und keiner „Niederschlag" stimmt.**

Raster der Kandidaten θ (30): `rhoMax` ∈ {0,70 · 0,75 · 0,80 · 0,85 · 0,90} × `zCap` ∈ {10 · 15 · 20 dBZ} × `kernel` ∈ {1 · 3}.
Fest (nicht im Raster): δ = 2,5 dB, SNR-Minimum 3 dB, 4 Zellen.

### §4.3 Maße je Kandidat

- **Abräumquote** a(θ) = Anteil von A, der ausgeblendet wird (falsches Blau, das verschwindet).
- **Verlust** v(θ) = Anteil von B, der ausgeblendet wird (echter Niederschlag, der sein Blau verliert).
- Trefferquote der Farbe P(nass | blau) vorher/nachher; Erfassung P(blau | nass) vorher/nachher.
- Intervalle: Block-Bootstrap, 1 000 Züge, Seed 12345, **Blöcke = 3-h-Fenster (UTC)** (weniger als 7 Tage ⇒ Vorabergebnis,
  so benannt), Intervall 5–95 %.
- Strata (Bericht): Abstand zum nächsten Standort < 50 / 50–100 / 100–150 km; Tag (06–18 UTC) / Nacht; die Zugnacht
  12.10. 17:00 UTC bis zum Ende der Stichprobe getrennt.

### §4.4 Entscheidungsregel (eingefroren, Hash in `radar-stoerecho/claims-frozen.sha256`)

> **R-SE-1 (Schutz des echten Regens).** Zulässig ist ein Kandidat θ nur, wenn auf der Wahl-Hälfte der Verlust v(θ) ≤ 1,0 %
> ist UND die Obergrenze seines 90-%-Intervalls ≤ 2,0 %.
> **R-SE-2 (Wahl).** Unter den zulässigen Kandidaten gilt der mit der größten Abräumquote a(θ); bei Gleichstand (Differenz
> < 1 Prozentpunkt) der mit dem kleineren `rhoMax`, dann dem kleineren `zCap`, dann `kernel` 1 (der kleinere Eingriff).
> **R-SE-3 (Hold-out).** 3-h-Blöcke mit geradem Index (Zählung ab dem ersten Block der Stichprobe = 0) sind die Wahl-Hälfte,
> ungerade die Abnahme-Hälfte. Abnahme: v(θ*) ≤ 2,0 % (Obergrenze ≤ 3,0 %) und Trefferquote nachher ≥ vorher.
> **R-SE-4 (Urteil).** „Einschalten empfohlen" nur, wenn R-SE-3 besteht UND θ* in der Zugnacht (12.10. ab 17:00 UTC) mindestens
> die Hälfte von A abräumt (W1; liegen dort weniger als 30 Fälle, zählt W2 an den Mengen-Stationen mit derselben Schwelle 50 %).
> Sonst: Filter gebaut, Schalter aus, Befund benannt.
> **R-SE-5 (Zusätze ohne Wahlrecht).** Der Randschluss (`fill`) und die Mitnahme in die Vorhersage-Frames werden mit θ* am
> vollen Feld gerechnet und müssen R-SE-1 mit denselben Grenzen ebenfalls einhalten (Randschluss) bzw. dürfen in einem
> Regen-Slot ohne ausgeblendete Zelle kein Pixel ändern (Vorhersage); sonst bleiben sie aus.

## §5 Ergebnis SE-1 (13.10.2026, `radar-stoerecho/ergebnis/score.md`, `score.json`)

Stichprobe 10.10. 23:05 … 12.10. 23:05 UTC, 288 Slots, 380 538 Stations-Intervalle; W1 an 180 Indikator-Stationen: 49 474
Intervalle, davon blau 3 092 (A trocken 181, B nass 2 911); 17 Blöcke à 3 h (Vorabergebnis nach §4.3).

**θ\* nach R-SE-1/2: ρc < 0,80 · stärkstes Echo < 15 dBZ · Nachbarschaft 3 × 3** — auf der Wahl-Hälfte Abräumquote 9,4 % (8/85),
Verlust 0,77 % [Obergrenze 1,19 %] (11/1 426). Von den 30 Kandidaten sind 13 zulässig; jeder Kandidat mit ρc ≥ 0,85 und
Z ≥ 15 dBZ verliert mehr als 1 % des echten Regens (0,85 · 15 · 3 × 3: 1,33 % [2,39]).

| Menge | A: blau und trocken, davon ausgeblendet | B: blau und nass, davon ausgeblendet [90 %] | Treffer vorher → nachher | blaue Intervalle |
|---|---|---|---|---|
| Wahl-Hälfte (W1) | 9,4 % (8/85) | 0,77 % [0,39–1,19] (11/1 426) | 94,4 → 94,8 % | 1 511 → 1 492 |
| **Abnahme-Hälfte (W1)** | 4,2 % (4/96) | **0,47 % [0,14–0,74]** (7/1 485) | 93,9 → 94,1 % | 1 581 → 1 570 |
| ganze Stichprobe (W1) | 6,6 % (12/181) | 0,62 % [0,39–0,85] (18/2 911) | 94,1 → 94,5 % | 3 092 → 3 062 |
| Zugnacht 12.10. ab 17 UTC (W1) | 2 von 5 | 0 von 2 | — | 7 → 5 |
| **Zugnacht (W2, alle Mengen-Stationen)** | **70,9 % (117/165)** | 0 von 1 | 0,6 → 2,0 % | 166 → 49 |
| ganze Stichprobe (W2) | 3,2 % (190/5 862) | 0,54 % [0,46–0,65] (60/11 029) | 65,3 → 65,9 % | 16 891 → 16 641 |
| < 50 km / 50–100 km / 100–150 km (W1) | 15,0 / 4,4 / 3,7 % | 0,52 / 0,52 / **1,25 %** [2,11] | — | — |
| Tag / Nacht (W1) | 1,6 / 16,9 % | 0,66 / 0,54 % | — | — |
| Regentag 11.10. (W1) | 3,4 % (5/149) | 0,62 % [0,38–0,88] (16/2 592) | 94,6 → 94,7 % | 2 741 → 2 720 |

- **R-SE-3 bestanden** (Abnahme-Hälfte: Verlust 0,47 %, Obergrenze 0,74 %; Treffer 93,9 → 94,1 %).
- **R-SE-4 erreicht:** in der Zugnacht tragen die Indikator-Stationen nur 5 Fälle in A (< 30 ⇒ W2 zählt): an den
  Mengen-Stationen sind 165 von 166 blauen Intervallen trocken, 117 davon (70,9 %) räumt der Filter ab.
- **Lesart:** an Regentagen ändert der Filter fast nichts (das meiste falsche Blau dort ist kein Störecho, sondern Regen,
  der den Boden nicht oder später erreicht); er wirkt, wo es gar nicht regnet. Der Preis: 6 von 1 000 blauen Regen-Intervallen
  verlieren ihr Blau, fern vom Radar (100–150 km) 12 von 1 000.

### §5.1 Was im Fleck stehen bleibt (Slot 22:35 UTC, volles Feld, `bilder/giessen-2235-ohne-randschluss.png`)

Im Kasten Gießen sind 1 179 Zellen blau. Mit θ\*: **945 ausgeblendet** (Offenthal stimmt „kein Niederschlag", Median ρc
0,64–0,73), **126 ohne Stimme** — ein radialer Streifen in Richtung Offenthal: das Komposit des DWD schließt dort einen Sektor,
in dem das Standortbild kein eigenes Echo trägt; die Nachbarzellen tragen volle Aussage (ρc 0,61–0,79) —, **107 mit der Stimme
„Niederschlag"**: Offenthal mit voller Aussage (144 Zellen) und einem Median ρc von **0,80–0,82**, knapp über dem Schnitt.
Es bleibt ein ≈ 25 km langer Streifen mit Krümeln.

## §5a Nachtrag A1 zum Protokoll (eingefroren VOR der ersten Stationsmetrik der neuen Varianten)

Anlass ist allein der Feldbefund §5.1 (keine Stationszahl). Zwei Erweiterungen der Regel, Basis bleibt θ\* (0,80 · 15 dBZ · 3 × 3):

- **N — Nachbarschaftsstimme:** ein Standort stimmt für eine Zelle auch dann, wenn sein EIGENER Block dort kein Echo trägt,
  die 3 × 3-Nachbarschaft aber die Aussage (≥ 12 Zellen). Ein Standort ohne lesbaren Scan stimmt weiter nur mit eigenem Echo.
- **R — Schnitt bei voller Aussage:** trägt die Nachbarschaft mindestens die Hälfte ihrer 144 Zellen als Aussage (≥ 72),
  gilt statt 0,80 der Schnitt `rhoMaxRich` ∈ {0,85 · 0,90} (der Median vieler Zellen streut weniger; der Regen-Median liegt bei
  0,97).

Kandidaten (6): Basis · N · R85 · R90 · N + R85 · N + R90.

> **R-SE-6 (Wahl).** Auf der Wahl-Hälfte (gerade Blöcke, wie R-SE-3) gilt R-SE-1 unverändert (Verlust ≤ 1,0 %, Obergrenze
> ≤ 2,0 %); unter den zulässigen Kandidaten gilt der mit der größten Abräumquote in der **Menge A ∪ A₂** der Wahl-Hälfte
> (A₂ = blau und trocken nach W2 an den Mengen-Stationen — die Indikator-Stationen allein tragen in der Zugnacht 5 Fälle);
> bei Gleichstand (< 1 Prozentpunkt) der frühere in der Reihenfolge Basis, N, R85, R90, N + R85, N + R90.
> **R-SE-7 (Abnahme).** Auf der Abnahme-Hälfte gelten die Grenzen von R-SE-3 (Verlust ≤ 2,0 %, Obergrenze ≤ 3,0 %, Treffer
> nachher ≥ vorher) für W1 UND der Verlust nach W2 (Menge B₂ = blau und `RWS_10 ≥ 0,01`) ≤ 2,0 %. Besteht der gewählte
> Kandidat nicht, gilt die Basis θ\*.
> **R-SE-8 (Bestätigung an frischen Slots, vor dem Einschalten).** Slots NACH der ersten Stichprobe (ab 12.10. 23:15 UTC,
> beim Einfrieren nicht ausgewertet): Verlust nach W1 ≤ 2,0 % (bei ≥ 100 Fällen in B; sonst W2 mit ≥ 100 Fällen in B₂), und
> die Abräumquote nach W2 in den Nachtstunden nicht kleiner als die der Basis auf denselben Slots. Solange das nicht gerechnet
> ist, bleibt der Producer-Schalter Jans Gate mit dieser Bedingung.

## §5b Ergebnis des Nachtrags (13.10.2026, `ergebnis/score2.md`, `score2.json`)

Die sechs Varianten an jedem blauen Stationspixel jedes Slots (`stations.mjs`, Producer-Funktionen), 19 759 blaue
Stations-Intervalle mit Wahrheit in der ersten Stichprobe. Gegenprobe: „Basis" trifft θ* aus `score.mjs` exakt (12/181, 18/2 911).

| Variante | Wahl-Hälfte: Verlust B (W1) [90 %] | zulässig | abgeräumt A ∪ A₂ | ganze Stichprobe: B (W1) | B₂ (W2) | Zugnacht A₂ | mit Randschluss |
|---|---|---|---|---|---|---|---|
| Basis (θ*) | 0,77 % [0,39–1,19] | ja | 4,4 % (130/2 928) | 0,62 % (18/2 911) | 0,54 % (60/11 029) | 71,8 % (130/181) | 74,6 % |
| N | 0,84 % [0,42–1,57] | ja | 4,7 % | 0,79 % | 0,65 % | 75,1 % | 76,2 % |
| **R85** | **0,84 % [0,44–1,22]** | **ja** | **5,1 % (149/2 928)** | **0,69 % (20/2 911)** | **0,62 % (68/11 029)** | **77,9 % (141/181)** | **80,7 % (146/181)** |
| R90 | 1,05 % [0,50–1,53] | nein | 5,5 % | 0,89 % | 0,76 % | 77,9 % | 80,7 % |
| N + R85 | 0,84 % [0,42–1,57] | ja | 5,3 % | 0,82 % | 0,73 % | 81,2 % | 82,3 % |
| N + R90 | 0,91 % [0,42–1,71] | ja | 5,7 % (168/2 928) | 0,96 % | 0,84 % | 81,2 % | 82,3 % |

- **R-SE-6: gewählt R85.** Die größte Abräumquote hat N + R90 (5,7 %); R85 (5,1 %) und N + R85 (5,3 %) liegen weniger als einen
  Prozentpunkt darunter, und unter den Gleichständen gilt der frühere der Reihenfolge. (Die Zugnacht-Zeilen an den Mengen-
  Stationen zählen hier 181 statt 165 Fälle wie in §5: dazwischen kamen Wahrheitszeilen des 12.10. nach.)
- **R-SE-7 bestanden:** Abnahme-Hälfte Verlust W1 0,54 % [0,26–0,80] (8/1 485), Verlust W2 0,62 % [0,53–0,76] (35/5 644),
  Treffer 93,9 → 94,3 %.
- **R-SE-5 Randschluss zulässig:** Wahl-Hälfte Verlust 0,91 % [0,45–1,37] (13/1 426), Abnahme-Hälfte 0,54 % (8/1 485);
  abgeräumt A ∪ A₂ 238 → 250 von 5 913. Die zweite Bedingung (ein leeres Maskenbild ändert kein Pixel der Vorhersage-Frames)
  gilt nach Konstruktion und ist im Verifier belegt (C5b, H7).
- **R-SE-8 (frische Slots) — siehe §7:** gerechnet am 13.10. 04:10 UTC, bestanden (Verlust W2 1 von 142, Abräumquote nachts
  88 gegen 81 von 609).

**Die Regel des Producers** (`CLUTTER_RULE`, `src/sources/radarClutter.ts`, Herkunft `measured` 2026-10-13): ρc < 0,80 — bei
mindestens 72 Aussage-Zellen < 0,85 —, stärkstes Echo < 15 dBZ, Nachbarschaft 3 × 3, Randschluss an, keine Nachbarschaftsstimme.

### §5c Die Regel am vollen Feld (`field.mjs`, alle 293 Slots bis 12.10. 23:55 UTC)

| Zeitraum | blaue Zellen je Slot | davon ausgeblendet | Anteil je Slot Median / Maximum |
|---|---|---|---|
| Regentag 11.10. 06–18 UTC (72 Slots) | 83 988 | 0,79 % | 0,8 / 1,7 % |
| Nacht 10./11.10. (Regen, 36 Slots) | 75 570 | 0,77 % | 0,7 / 1,1 % |
| Nacht 11./12.10. (66 Slots) | 21 083 | 3,13 % | 3,0 / 9,0 % |
| 12.10. 06–16 UTC (60 Slots) | 7 993 | 1,84 % | 1,4 / 6,2 % |
| **Zugnacht 12.10. ab 17 UTC (41 Slots)** | 4 791 | **25,0 %** | **33,1 / 60,5 %** |

Über alle Slots: 85,8 % der blauen Zellen tragen eine „Niederschlag"-Stimme, 12,6 % keine Stimme (bleiben blau), 1,57 % werden
ausgeblendet, davon 4 % durch den Randschluss. **Im Kasten Gießen** (Bild `bilder/giessen-2235-regel.png`, links geliefert,
Mitte Stimmen, rechts nach dem Filter): 20:35 UTC 870 von 918 blauen Zellen ausgeblendet (94,8 %), 21:35 1 224 von 1 230
(99,5 %), **22:35 1 092 von 1 179 (92,6 %)**, 23:35 1 168 von 1 246 (93,7 %). Was um 22:35 stehen bleibt (87 Zellen), ist der
radiale Streifen aus §5.1 — 73 Zellen ohne Stimme, 14 mit „Niederschlag"-Stimme. Die Variante N schlösse ihn weiter
(1 121 von 1 179), kostet aber 0,13 Punkte mehr echten Regen und ist nach R-SE-6 nicht gewählt (E-SE-2).

Die Vorhersage-Frames des Slots 22:35: Analyse 1 890 Zellen ausgeblendet, + 20 … + 120 min je 1 226–1 307 (die Vorhersage
des DWD trägt den Fleck von vornherein kleiner, §2.2).

## §6 Umsetzung SE-2 (13.10.2026, uncommitted; Schalter aus)

Rule 2: neuer Rechenweg hinter einem Producer-Schalter, ohne ihn byte-gleich. Der Client braucht keine Änderung — eine
ausgeblendete Zelle ist in der Log-Ebene 0 wie jede trockene.

| Datei | Änderung |
|---|---|
| `src/sources/dwdSweep.ts` (neu) | Leser der Polarscans `sweep_pcp_*` (ODIM SCAN: Strahl-Azimute, Elevation je Strahl, `dBZ0`), Strahl-Tabelle `sweepRayLut`, Namen aus dem Listing, LATEST-Alias |
| `src/sources/radarClutter.ts` (neu) | Zuordnung Standortbild → Polarbin (`siteLattice`, `siteRho`), Rauschkorrektur, Blöcke je Standort (`siteBlocks`), die Entscheidung (`voteFromStat`, `siteVote`, sortierfrei `siteVoteFast`), Maske (`clutterMask` mit Randschluss), Mitnahme in die Vorhersage (`propagateLabels`, `applyClutterToRun`), die Regel `CLUTTER_RULE` |
| `src/sources/dwdPx250.ts` | `h5SingleChunkU16` exportiert, Option `inflate` (zlib von Node einspeisbar); ohne Option der Leser wie bisher (§6.5) |
| `src/sources/radarImg.ts` | `meta.dual.clutter` (optional, nur auf nativer Ebene): `cells`, `wet`, `sites`, `missing`, `rule`, `file`/`bytes` der Maske; Prüfer mit Mutationen im Verifier; Slots ohne das Feld lesbar |
| `src/sources/radarHd250.ts` | `hd250.json blocks.clutter` (optional) |
| `scripts/radar-mirror/clutter-step.mjs` (neu) | der Schritt: 17 × `px250` + 17 × URHOHV je Slot (LATEST-Alias mit Zeitprüfung, sonst Listing; 10 s Frist je Abruf), Maske, Mitnahme, `clutter.png`; Eingaben auch aus einem Verzeichnis (`RADAR_CLUTTER_DIR`, Verifier und Nachrechnen); die geholten Standortbilder bleiben für den `hd250`-Schritt desselben Slots im Temp-Verzeichnis |
| `scripts/radar-mirror/radar-derive.mjs` | `RADAR_CLUTTER=1` (nur mit `RADAR_IMG_DUAL` + `RADAR_LOG_NATIVE`, HDF5): `rv` filtert KOPIEN der Log-Ebenen und ersetzt sie erst nach Erfolg, ein Fehler lässt den Slot ungefiltert; `hd250` liest `rv/<stamp>/clutter.png` und lässt die Blöcke trocken; Standortbilder mit zlib von Node |
| `scripts/radar-mirror/workflow-radar.yml` | Vorlage: `RADAR_CLUTTER: '0'` mit Bedingung (Einschalten = Jans Gate nach R-SE-8) |
| `scripts/verify-radar-clutter.mjs`, `package.json`, `.github/workflows/ci.yml` | `verify:radar-clutter` (CI, netzfrei; Rundläufe an echten Dateien mit `RADAR_SE_RAW`), Fixture `scripts/lib/fixtures/radar-clutter-cases.json` (3 251 echte blaue Stations-Intervalle mit den Standort-Statistiken, 160 KB; Erzeuger `radar-stoerecho/fixture-export.mjs` aus der Falldatei des Scorers, die mit 1,6 MB neben dem Extrakt außerhalb des Repos liegt) |
| `scripts/verify-radar-threshold.mjs` | E2 unabhängig von Zeilenenden (V-SE-6) |

### §6.1 Was die Regel liest

Je Standort: das `px250`-Bild (wo trägt er ein Echo, wie stark) und der URHOHV-Scan desselben Slots. Jede Echo-Zelle bekommt
das ρHV ihres Polarbins (§2.4), ihr effektives SNR (dBZ − `dBZ0` − 20 · log10(r) − 2,5 dB) und daraus ρc; unter 3 dB keine
Aussage. Je 1-km-Zelle und Standort der Median von ρc über die 3 × 3 Zellen der Nachbarschaft (höchstens 144 Werte) und das
stärkste Echo. **Fail-open in jeder Stufe:** kein Bild, kein Scan, Scan eines anderen Slots, kein ρHV am Bin, zu wenig Zellen
⇒ keine Stimme oder die Stimme „Niederschlag" (Standort mit Echo ohne Scan) — nie eine ausgeblendete Zelle.

### §6.2 Was geändert wird — und was nicht

Nur **Kanal 2 der `g<lead>.png`** (Log-Ebene aller 25 Frames) und die **250-m-Kacheln**; dazu `clutter.png` (1 Kanal,
255 = ausgeblendet, 3 KB) und zwei optionale Meta-Felder. `f<lead>.png`, `m<lead>.png`, Kanal 1 der `g`-Frames bleiben Byte für
Byte gleich — also buscosun Fusion (Radar-Member), Summen 0–2 h, Regenbeginn, Komposit `?hd=0`, Autobahnkarte, Punktabfrage
(wie RG §2). `?hdv2=0` zeigt weiter jedes Echo.

### §6.3 Vorhersage-Frames

Die RV-Vorhersage verlagert die Analyse; die Maske wandert mit: die Etiketten des vorigen Frames (trocken / Niederschlag /
ausgeblendet) gehen an die nassen Zellen des nächsten Frames nach dem NÄCHSTEN etikettierten Nachbarn im Umkreis von 8 km
(Chamfer-3-4-Distanz, zwei Durchläufe, nur im Fenster um die ausgeblendeten Zellen); eine nasse Zelle ohne Nachbarn ist neues
Echo und gilt als Niederschlag, bei gleichem Abstand gewinnt der Niederschlag. Kein Fluss wird geschätzt. Ohne ausgeblendete
Zelle wird kein Byte gelesen oder geschrieben.

### §6.4 Vertrag

`meta.json` → `dual.clutter = { cells, wet, sites, missing, rule: { rhoMax, zCapDbz, kernel, fill, rhoMaxRich }, file?, bytes? }`;
`file` genau dann, wenn `cells > 0`. `hd250.json` → `blocks.clutter`. Alte Clients ignorieren beides.

### §6.5 Rechenzeit

Gemessen am 13.10. auf der Entwicklungsmaschine (unter Fremdlast): `decodePx250` über `DecompressionStream` (Blob + Web-Streams
in Node 22) braucht ≈ 1 000 ms je Standortbild, `zlib.inflateSync` 51 ms bei denselben Bytes (Verifier H2) — der Standort-
Schritt fiel damit von 17–30 s auf **3,4–5,2 s** (trockener / verregneter Slot), die Maske durch die sortierfreie Stimme von
0,5–4,5 s auf 0,2–0,6 s, die Mitnahme ≈ 0,3–2 s. Im Producer-Lauf mit lokalen Dateien 7,0 s (22:35) und 8,7 s (11.10. 10:05)
für den Filter. Derselbe zlib-Weg beschleunigt den bestehenden `hd250`-Schritt: 20–23 s am HEAD gegen 4,4–7,7 s. Auf dem
Runner des Daten-Repos sind beide Zahlen unbekannt, bis der erste Lauf sie schreibt (`clutter: … in N ms` im Job-Log);
dazu kommen 8 MB Abruf vom DWD je Slot.

## §7 Gates SE-3 (13.10.2026)

| Gate | Beleg | Ergebnis |
|---|---|---|
| G1 Verifier | `verify:radar-clutter` netzfrei **39/39**; mit `RADAR_SE_RAW` = Slot 12.10. 22:35 (Zugnacht) und = Slot 11.10. 10:05 (Regen) je **46/46**: Leser (schneller Weg = jsfive = eingespeistes zlib, Wert für Wert), Zuordnung `px250` ↔ DBZH-Scan 95,0 / 95,8 % der Echo-Zellen (um 10° gedreht 44 / 35 % — Gegenprobe), sortierfreie Stimme = Referenz an 150 246 / 1 676 251 Stimmen, Producer-Rundlauf, `hd250` mit Maske, fail-open ohne Standortdateien | grün |
| G2 ohne Schalter byte-gleich zu HEAD | HEAD `8e8646a` als Export (`git archive`) gegen den Arbeitsbaum, `rv` + `hd250`, beide Slots: **69 und 70 Dateien byte-gleich**; Negativkontrolle mit Schalter: 27 Einträge verschieden (25 `g`-Frames, `meta.json`, `clutter.png`) | grün |
| G3 mit Schalter | Verifier H5/H6: 27–28 `f`/`m`-Frames byte-gleich, Kanal 1 aller 25 `g`-Frames gleich, Kanal 2 nur auf 0 und in der Analyse genau an den Zellen der Maske (1 890 bzw. 807); `hd250`: maskierte Blöcke in allen 16 Zellen trocken, jede andere 250-m-Zelle byte-gleich | grün |
| G4 eingefrorene Regeln | Verifier E1–E3 (Hashes, §4 und §5a = Kopien), F1–F6 (Zahlen aus §5/§5b an 3 251 echten Zeilen neu gerechnet, R-SE-1/2 nachvollzogen, zwei Negativkontrollen) | grün |
| G5 Nachbarn | `verify:radar-threshold` 34/34 (mit `RADAR_RG_RAW`; vorher 33/34 wegen V-SE-6), `verify:radar-250m` 29/29 (mit `RADAR_250_RAW`: `decodePx250` mit und ohne zlib-Option), `verify:radar-hd` 53/53, `verify:radar-edge` 24/24, `verify:np0-radar` 39/39, `verify:precip-source` 30/30; `verify:radar-repack` 54/55 — B2c (Zeitprüfung, bekannt lastabhängig; `rvHdf5.ts` unberührt) | grün bis auf B2c |
| G6 typecheck / Build / Budget | typecheck 0; Build 260/260; `npm run budget` grün: eagerJs 109,9 / 110, totalJs 1 766,6 / 1 772 — im Arbeitsbaum liegen daneben die Änderungen der Phase RA (andere Sitzung); der Filter selbst steht nicht im Client-Bündel (Verifier G5), `radarImg.ts`/`radarHd250.ts` tragen je einen Prüfer mehr | grün |
| G7 R-SE-8 frische Slots | `ergebnis/score2.md` Abschnitt „Frische Slots", gerechnet 13.10. 04:10 UTC; Lesehilfe `ergebnis/fresh-classes.md` | **bestanden** (schmale Basis, s. u.) |

**R-SE-8, gerechnet 13.10. 04:10 UTC** (28 frische Slots 12.10. 23:15 … 13.10. 03:45 UTC, alle Nachtstunden; Wahrheit bis
03:50 UTC):

| Variante | Verlust B (W1) | Verlust B₂ (W2) [90 %] | nachts abgeräumt A₂ (W2) | mit Randschluss | abgeräumt A (W1) |
|---|---|---|---|---|---|
| Basis | 0 von 27 | 0,70 % [0,00–1,37] (1/142) | 13,3 % (81/609) | 13,6 % (83/609) | 17/51 |
| N | 0 von 27 | 0,70 % (1/142) | 13,8 % (84/609) | 14,1 % | 17/51 |
| **R85 (Regel)** | **0 von 27** | **0,70 % [0,00–1,37] (1/142)** | **14,4 % (88/609)** | **14,8 % (90/609)** | **18/51** |
| R90 | 0 von 27 | 0,70 % (1/142) | 16,1 % (98/609) | 16,4 % | 19/51 |
| N + R85 | 0 von 27 | 0,70 % (1/142) | 14,9 % (91/609) | 15,3 % (93/609) | 18/51 |
| N + R90 | 0 von 27 | 0,70 % (1/142) | 16,4 % (100/609) | 16,7 % | 19/51 |

- **Nach dem Wortlaut bestanden:** W1 trägt nur 27 Fälle (< 100) ⇒ es gilt W2 mit 142 Fällen: Verlust 0,70 % ≤ 2,0 %; die
  Abräumquote der Regel in den Nachtstunden (14,4 %) ist nicht kleiner als die der Basis (13,3 %).
- **Was das Ergebnis trägt und was nicht.** Der Verlust ruht auf 142 Intervallen aus 4,5 Stunden einer Front (ein verlorenes;
  Obergrenze 1,37 %) — das bestätigt die 0,6–0,7 % der ersten Stichprobe, ersetzt sie nicht. Die Abräumquote ist hier **kein
  Maß für das Störecho**: die frische Nacht war nach Mitternacht keine Zugnacht mehr, sondern der Aufzug einer Front. Die
  Lesehilfe (`fresh-classes.mjs`, je Intervall der Grund der Regel aus der 3 × 3-Statistik; nicht Teil der eingefrorenen
  Regel) zeigt: von den 609 blauen Intervallen an trockenen Mengen-Stationen tragen **463 eine Niederschlag-Stimme mit ρc
  über dem Schnitt** (Standort mit der größten Aussage: Median ρc 0,978, stärkstes Echo im Median 13,8 dBZ; vor allem
  Neuheilenbach 269 und Essen 123), **0** eine Niederschlag-Stimme nur wegen der 15-dBZ-Kappe bei niedrigem ρc (der Weg, auf
  dem ein starkes Störecho durchrutschen würde), 59 keine Aussage, 87 sind ausgeblendet (die Lesehilfe rechnet mit der auf
  drei Stellen gerundeten Statistik der Extraktion — eine Zeile an der Schnittkante fällt anders als im Producer: 87 statt 88).
  Unter den 146 Intervallen OHNE Regen-Signatur sind damit 87 ausgeblendet (60 %); die meisten davon in der Stunde vor
  Mitternacht (35 von 67), als der Vogelzug noch lief.
- **Der Regen dieser Stunden** (B₂, 142): 135 mit ρc über dem Schnitt (Median 0,992, Echo im Median 21,7 dBZ), 6 ohne Aussage,
  1 ausgeblendet.
- Zwischenstand 00:54 UTC (7 Slots): R85 40 von 74 gegen Basis 37 von 74, Verlust nicht messbar — überholt.
- Nachrechnen: die Befehle in `MANUELLE-SCHRITTE.md` §68; die Lesehilfe braucht vorher `extract.mjs` auf den neuen Slots.

**Selbstverifikation:** (1) Funktionserhalt — ohne Schalter byte-gleich zu HEAD (G2); mit Schalter bleiben alle rechnenden
Produkte byte-gleich (G3), `?hdv2=0` zeigt jedes Echo. (2) Desktop: keine Client-Änderung. (3) Keine neuen Bedienelemente.
(4) Konsole: keine Client-Änderung. (5) Long Tasks: nichts im Browser.

## §8 Befunde und Entscheidungen

- **E-SE-1 (Jans Gate): einschalten.** `RADAR_CLUTTER: '1'` im Workflow des Daten-Repos; die Bedingung R-SE-8 ist seit
  13.10. 04:10 UTC erfüllt (§7), der Push von `main` muss vorher liegen (der Spiegel braucht `clutter-step.mjs` in seinem
  Web-Klon). Wirkung ab dem nächsten Spiegel-Job; Rückweg `'0'` (die `g`-Frames der nächsten Slots tragen wieder jedes Echo).
  Kennzeichen im Slot: `meta.dual.clutter`.
- **E-SE-2: Nachbarschaftsstimme (N) dazunehmen?** Sie schließt den radialen Reststreifen weitgehend (Kasten Gießen 22:35:
  1 121 statt 1 092 von 1 179; Zugnacht an den Mengen-Stationen 82,3 statt 80,7 %), kostet 0,13 Punkte mehr echten Regen
  (0,82 statt 0,69 %) und ist nach R-SE-1 zulässig, nach R-SE-6 (Gleichstandsregel) aber nicht gewählt. An den frischen Slots
  (§7) unterscheiden sich beide kaum: N + R85 räumt 91 statt 88 von 609 ab, der Verlust ist gleich (1 von 142) — die Nacht
  enthielt nach Mitternacht kaum Störecho und entscheidet die Frage nicht. Empfehlung: mit der gewählten Regel (ohne N)
  einschalten und N an der nächsten Zugnacht am Feld ansehen; ein Wert in `CLUTTER_RULE`.
- **E-SE-3: Anzeige nennt den Filter?** Heute sagt die Statuszeile „ab 0,06 mm/h". Ehrlich wäre der Zusatz „Echos ohne
  Niederschlag ausgeblendet" (aus `meta.dual.clutter.cells > 0`). Nicht gebaut — `MapView.tsx` und `LayerInfoPanel.tsx`
  waren in dieser Nacht von einer anderen Sitzung in Arbeit (V-SE-7).
- **V-SE-1** Der radiale Reststreifen (§5.1/§5c): das Komposit schließt Sektoren, in denen der Standort kein eigenes Echo
  trägt; ohne N bleibt dort ein ≈ 25 km langer, 2–3 km breiter Strich. Mehrwert: der Fleck verschwindet ganz. Skizze: E-SE-2.
- **V-SE-2** Die rechnenden Pfade sehen das Störecho weiter: buscosun Fusion (Radar-Member 0–2 h), Regenbeginn, Summen 0–2 h
  lesen die `f`-Bytes. In der Zugnacht nennt der Regenbeginn dort Regen, wo keiner fällt. Mehrwert: Text und Karte stimmen
  überein. Skizze: die Maske (`clutter.png`) im Leser der Punktpfade anwenden — ein Eingriff in buscosun Fusion (neuer Stand,
  Prüfstand) und damit eine eigene Phase.
- **V-SE-3** Rückblick unter Zoom 9: `rv-past/<stamp>/f000.png` trägt nur das v1-Byte (jedes Echo, wie schon bei RG). Mehrwert:
  der Rückblick zeigt dasselbe wie „jetzt". Skizze: `g000.png` in den Rückblick kopieren und im Client lesen.
- **V-SE-4** AT/CH: für INCA und rzc gibt es offen keine Polarimetrie je Standort; rzc trägt eigene Filter. Nichts zu tun,
  solange dort kein Fall auffällt.
- **V-SE-5** `verify:radar-repack` B2c: der „schnelle Weg" von `rvHdf5.ts` (ebenfalls `DecompressionStream`) lief auf dieser
  Maschine 41,6 s gegen 14,6 s über jsfive — dieselbe Ursache wie §6.5. Mehrwert: der RV-Derive des Spiegels könnte um ein
  Vielfaches schneller werden (hier 50 s je Slot). Skizze: die `inflate`-Option auch in `decodeRvHdf5`, im Derive zlib von Node
  einspeisen; Bytes bleiben gleich (Rundlauf im Verifier). Ob der Linux-Runner dasselbe zeigt, sagt das Job-Log.
- **V-SE-6 (behoben)** `verify:radar-threshold` E2 verglich §4 des RG-Audits zeichenweise mit der eingefrorenen Kopie; die
  Arbeitskopie trägt CRLF (autocrlf — geschrieben von Git beim `stash pop` einer anderen Sitzung in dieser Nacht, V-SE-7), die
  Kopie LF ⇒ 4 827 gegen 4 766 Zeichen, rot unabhängig vom Inhalt. Jetzt ohne Zeilenenden verglichen.
- **V-SE-7** Der Arbeitsbaum wurde in dieser Nacht von mehreren Sitzungen zugleich bearbeitet (Phase RA: `NowcastDeck.tsx`,
  `MapView.tsx`, drei Verifier), und eine davon legte um 23:22:40 UTC ALLE uncommitteten Änderungen für ≈ 20 min in einen
  `git stash` (Reflog `reset: moving to HEAD`). Betroffen waren hier `radarImg.ts`, `radarHd250.ts` und der Eintrag V-RG-10;
  die neuen Dateien (untracked) blieben liegen, kein Messlauf dieser Phase las in dem Fenster eine der drei Dateien (die
  Extraktion lief seit 23:14 mit geladenen Modulen; der Vergleich gegen HEAD in §7 G2 lief um 00:30 UTC, danach kein Reset
  mehr im Reflog). Sicherung dieser Phase außerhalb des Repos: `C:\dev\buscosun-radar-truth\se-sicherung-20261013\`
  (`tracked.patch`, `untracked.tar`). `CLAUDE.md` und `MANUELLE-SCHRITTE.md` tragen Einträge mehrerer Sitzungen — beim Commit
  trennen.
- **V-SE-8** Die Stichprobe ist klein und einseitig: zwei Herbsttage, eine Zugnacht, kein Schnee, kein Gewitter, keine
  Insektenlage im Sommer; die Indikator-Stationen tragen in der Zugnacht nur 5 Fälle. Schnee und Schmelzschicht haben ein
  niedrigeres ρHV (0,85–0,95) — die Regel bleibt mit 0,80/0,85 darunter, gemessen ist das nicht. Mehrwert: die Regel trägt ihr
  Datum zu Recht. Skizze: Sammler an zwei, drei Tagen je Jahreszeit laufen lassen (48 h Vorhaltezeit beim DWD), `score.mjs`
  und `score2.mjs` wiederholen; die Regel nennt das Messdatum (`CLUTTER_RULE_MEASURED`).
- **V-SE-9** Fern vom Radar (100–150 km) ist der Verlust mit 1,25 % [0,49–2,11] doppelt so hoch wie im Mittel (5 von 400
  Fällen). Mehrwert: kein Regen verschwindet am Rand der Abdeckung. Skizze: nach der Vorwärtssammlung prüfen, ob die Regel ab
  100 km einen strengeren Schnitt braucht.
- **V-SE-10** HymecNG (§2.1): die amtliche Klassifikation nennt den Fleck „DRIZZLE". Kein Handlungsbedarf bei uns; als Hinweis
  an den DWD geeignet.
- **V-SE-11** Blau über trockenem Boden beim Aufzug einer Front (§7, frische Slots 13.10. 00–04 UTC): 463 von 609 blauen
  Intervallen an trockenen Mengen-Stationen tragen eine klare Regen-Signatur (ρc im Median 0,98, Echo im Median 14 dBZ, vor
  allem an den Radaren Neuheilenbach und Essen); nur an 78 davon misst dieselbe Station innerhalb von ± 70 min Niederschlag.
  An den Indikator-Stationen traf die Farbe in diesen Stunden in 27 von 78 Intervallen zu (35 %; RG maß 93 %). Das ist
  Niederschlag in der Höhe, der unterwegs verdunstet oder den Boden erst später erreicht — kein Störecho, der Filter lässt
  ihn mit Absicht stehen, und ρHV kann ihn nicht von Regen am Boden trennen. Nicht belegt ist die Ursache im Einzelnen
  (Verdunstung, Strahlhöhe über der Eifel, Niesel unter der Messschwelle des Bechers). Mehrwert: „blau = es regnet" hielte
  auch vor einer Front. Skizze: eigene Messung in der RG-Linie — Strahlhöhe je Zelle und Feuchte der Schicht darunter
  (Taupunktdifferenz aus `obs/v1` oder dem Cube) gegen die Trefferquote; erst danach eine Regel. Keine Anzeige-Änderung ohne
  diese Messung.
