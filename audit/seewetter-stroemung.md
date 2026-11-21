# Phase ST — Strömung am Spot und „Wind gegen Strom“ auf `/seewetter`

> **Auftrag Jan, 2026-11-18:** Oberflächenströmung des BSH (GRIB2, unkomprimiert, Pakete `db` Deutsche Bucht und `wb`
> Westliche Ostsee, 0,5 sm, 15 min, 3 Tage, zweimal täglich) an jedem Spot: Zeile „Strom“ im Stundenband, Wert im
> Readout mit nächstem Stauwasser und Abstand der Modellzelle, Hinweis „Wind gegen Strom“, wählbare Kartenebene
> „Strömung“. Ohne Schalter an für alle (Jans Entscheidung, Ausnahme zu Rule 2). Kein Partikel- oder Shader-Layer, kein
> Eingriff in buscosun Fusion, keine Edge Function, keine neue Abhängigkeit. Die Sichtprüfung im Browser macht Jan selbst
> (seine Entscheidung 18.11.) — hier gibt es deshalb **keine** Bilder und keinen UI-Beleg.

## 1. Diagnose — Schritt 0, gemessen am 18.11.2026 07:00–07:30 UTC an echten Dateien

Werkzeuge (nur Messung): `scripts/sea/spike/current-probe.mjs` (Sektionen jeder Nachricht), `current-measure.mjs` (ganzer
Lauf, Maske, Nullwerte, Spots). Lauf **2026111800**, sechs Dateien (`Current_{db,wb}_2026111800_0{0,1,2}.grb2`, 79,4 MB).

### 1.1 Zugang

| Frage | Befund |
|---|---|
| FTP | `ftp://ftp.bsh.de/Stroemungsvorhersagen/` anonym; Wurzel: `LICENSE.txt`, `README_en_de.txt`, `grib1/`, `grib2/{Nordsee,Ostsee,Elbe,fixname}`. Listing 1 Zeile je Datei mit Größe, `MDTM` in UTC |
| Filebox | HTTPS: öffentliche ownCloud-Freigabe, von der BSH-Seite „Strömungsvorhersagen für Segler als GRIB-Dateien“ verlinkt (`https://filebox.bsh.de/index.php/s/Z8k9NMB3dKVpOXA`). WebDAV ohne Anmeldung: `PROPFIND …/remote.php/dav/public-files/Z8k9NMB3dKVpOXA/grib2/Nordsee/` → 207 mit Name, Größe, `getlastmodified`, ETag; `GET` → 200, Range-Abrufe 206. Kein CORS-Kopf (für den Browser unbrauchbar, für den Producer gleichgültig) |
| Gleiche Bytes | `Current_db_2026111800_00.grb2` über FTP und Filebox: sha256 `fa162c8a…fc672d`, 12 004 493 B |
| **Von einem GitHub-Runner** | Einmal-Workflow `sea-current-probe.yml` im Daten-Repo (Push `c23fcc38`, Lauf 44258195377, 35 s, danach entfernt `86655a8`; liest nur). Alle fünf Wege grün: FTP-Listing 2,0 s · FTP-Abruf 12,0 MB in 4,5 s · Filebox-Listing (curl) 0,9 s · Filebox-Abruf (curl) 12,0 MB in 6,5 s · **Filebox mit Node `fetch`** (so liest der Producer): `PROPFIND` 207 in 0,9 s, `GET` 15,1 MB in 18,0 s. sha256 auf dem Runner = lokal |
| Lokal | FTP 1,5–8,9 s je Datei (6 Dateien 23 s), Filebox 12 MB in 1,3 s |

**Folge:** der Producer liest über die **Filebox mit `fetch`** (kein FTP-Client, kein fremdes Werkzeug); FTP über `curl` ist
der benannte Rückfall, wenn die Filebox nicht antwortet.

### 1.2 Veröffentlichung, Namen, Größen

| Frage | Befund |
|---|---|
| Namen | `Current_<paket>_<YYYYMMDDHH>_<VV>.grb2` (+ dieselbe Datei als `.bz2`, nicht benutzt). Pakete Nordsee `no db idb nfi ofi`, Ostsee `ba wb kbu mbu rgn snd blt`, Elbe `AusAlt CuxBru BruPag PagHam` |
| Lauf 00 UTC | drei Tagesdateien `_00 _01 _02`; FTP `MDTM` **05:29:48 UTC** (alle `db`/`wb`-Dateien in derselben Minute, die groben `no`/`ba` 05:26), Filebox **05:51:28–05:52:02 UTC** — die Filebox folgt dem FTP um ≈ 22 min. Die README nennt „gegen 10:00 und 22:00 Uhr lokaler Zeit“; gemessen ist Lauf + 5:30 h |
| Lauf 12 UTC | für `db`/`wb` **nicht beobachtet** (im Verzeichnis liegt nur der neueste Lauf, der vorige wird entfernt). Elbe hält mehrere Tage: 12-UTC-Läufe erscheinen 18:55–18:58 UTC und heißen `_01 _02`. Gelesen (Range-Abruf, Sektion 1): `Current_PagHam_2026111712_01.grb2` beginnt **17.11. 00:15** — `_01` des 12-UTC-Laufs ist derselbe Kalendertag wie `_00` des 00-UTC-Laufs. Der Producer liest die Zeit deshalb aus den Nachrichten, nie aus `VV` (V-ST-1) |
| Größen | `db` 12,0 / 11,5 / 11,0 MB, `wb` 15,1 / 15,0 / 14,7 MB je Tag ⇒ **79,4 MB je Lauf** (die README nennt „ca. 3 MB“ und „ca. 5 MB“) |

### 1.3 Aufbau der Dateien

| Größe | Befund |
|---|---|
| Edition, Nachrichten | GRIB2, **192 Nachrichten je Datei** (96 Zeitschritte × 2 Größen), ein Feld je Nachricht, jede endet auf `7777`; Zentrum 0, Tabellenversion 4 |
| Zeitachse | jede Nachricht trägt ihre **Gültigkeitszeit als Referenzzeit** (Sektion 1, Bedeutung 1), Vorhersagezeit 0. 15-min-Schritte 00:15 … 24:00 UTC je Tag, 288 Schritte je Lauf, lückenlos |
| Größen | Disziplin 10 (Ozeanographie), Kategorie 1, Nummer **2 = u** und **3 = v** der Strömung, **m/s**; Fläche 160 „Tiefe unter Meeresspiegel“, Wert 1 m. Keine Geschwindigkeit/Richtung als eigene Felder |
| Schicht | laut README die oberste Modellschicht: Mittel von der Oberfläche bis 5 m Tiefe (oder bis zum Boden) |
| Gitter | Template 3.0, regulär. `db` 240 × 387, `wb` 412 × 387; La1 53,229263 (Süden), Dj 0,008333°, Di 0,013889°, `scanMode 64` (**S → N**, W → O). `db` Lo1 6,1736, `wb` Lo1 9,201402. **Das ist das CWAM-Gitter**: `db` = CWAM-Spalten 0–239, `wb` = Spalten 218–629, Zeilen gespiegelt (CWAM-Zeile j = 386 − r) — die Wasserzelle eines Spots liegt in beiden Modellen am selben Ort |
| Packung | **Template 5.40 (JPEG 2000)**, 12 bit, E = −10 oder −11 (Stufe 0,49 bzw. 0,98 mm/s), D = 0, als verlustfrei gekennzeichnet. Codestream von JasPer 1.900.1: ein Tile, eine Komponente, 5 Zerlegungsstufen, reversibles 5/3-Wavelet, keine Quantisierung, Codeblöcke 64 × 64, LRCP, eine Schicht. Das Bild ist **eindimensional** (1 × 59 637 bei `db`, 64 537 × 1 bei `wb`): nur die Wasserpunkte, die Lage steht in der Bitmap. Auf der vollen Auflösung zwei Precincts (2¹⁵ Abtastwerte) |
| Fehlwerte | Bitmap in Sektion 6 (Kennung 0). **Eine** Maske je Paket über alle 576 Felder des Laufs (`db` 59 637 Wasserpunkte, sha256 `7c18f7a0…`; `wb` 64 537, `db2e4b31…`) |
| Zelle ohne Strömung | steht **nicht** als Fehlwert und nicht als exakte 0 in der Datei, sondern als der gepackte Wert, der 0 am nächsten liegt. Verteilung der Geschwindigkeit über alle Wasserpunkte und Schritte von `db`: 231 803 unter 0,5 mm/s, 32 904 bei 0,5–1 mm/s, dann eine Lücke (1 960 bei 1–2 mm/s) ⇒ „kein Strom an der Zelle“ = **unter 1 mm/s** (`measured`). In der Deutschen Bucht folgt die Zahl der Tide (348–2 371 Zellen je Schritt, ≈ 12,4 h), in der Ostsee ist sie fast fest (845–1 103; 761 Zellen in jedem Schritt) |
| Wertebereich | `db` u −1,47 … +1,60, v −1,80 … +1,67 m/s, schnellste Zelle 1,84 m/s (3,6 kn); `wb` bis 1,72 m/s |
| Liest `src/sources/gribDecode.ts` sie? | **Nein:** „DRT 40 (nur simple packing / CCSDS-AEC)“ — Gitter, Bitmap und Template 4.0 passten, die Packung nicht |

**Folge (Auftrag: „add a producer-only reader under scripts/“):** `scripts/sea/jp2k.mjs` (JPEG-2000-Codestream: Marker,
Paketköpfe mit Tag-Bäumen, MQ-Dekoder, Bitebenen-Durchgänge, inverses 5/3-Wavelet) und `scripts/sea/bshGrib.mjs`
(Nachrichten, Sektionen, Bitmap, Template 5.40 und 5.0). Der gemeinsame Dekoder bleibt unberührt. Der Leser nimmt genau
die gemessene Form und lehnt alles andere mit Grund ab (mehrere Tiles oder Komponenten, 9/7-Wavelet, Quantisierung,
andere Codeblock-Stile, ein Strom mit weniger Kodierdurchgängen als Bitebenen).

**Gegenprobe des Lesers** (zwei unabhängige Dekoder, nur zur Messung): gegen **OpenJPEG** (Pillow) zwei Codestreams
Abtastwert für Abtastwert gleich (59 637 und 64 537 Werte, 0 Abweichungen); gegen **ecCodes** zwei ganze Dateien
(`db` Tag 0, `wb` Tag 2: 192 Nachrichten, 11 450 304 bzw. 12 391 104 Werte) **größte Abweichung 0**, Masken gleich,
Zeiten und Größen gleich. Dekodieren: ≈ 37 ms je Nachricht, ein Lauf (1 152 Nachrichten) ≈ 45 s.

### 1.4 Die Spots

Regel wie beim Seegang (V-SW-20): die nächste Wasserzelle, die in höchstens der Hälfte der Schritte ohne Strömung ist,
höchstens 3 km vom Spot. Ergebnis für alle 64 Spots des Katalogs (56 deutsche, 8 dänische):

- **Jeder Spot hat eine Zelle**, Abstand 0,02–1,63 km (Rerik 1,63, Ueckermünde 1,32, Kühlungsborn 1,26, Poel 1,23).
- An **12 Spots ist die allernächste Zelle ohne Strömung** (in jedem Schritt: Helgoland, Husum, Holnis, Schönberger
  Strand, Hohwacht, Fehmarn Grüner Brink und Wulfen, Kühlungsborn, Göhren, Zinnowitz, Ærø Marstal; St. Peter-Ording in
  83 %) — eine Küstenzelle der Maske, durch die das Modell nichts leitet. Die Regel nimmt dort die nächste Zelle mit
  Strömung (0,49–1,26 km).
- **Zellen, die zeitweise keinen Strom führen** (Anteil der Schritte des Laufs): Heiligenhafen 47 %, Husum 45 %,
  St. Peter-Ording 40 %, Cuxhaven-Duhnen 38 %, Schillig 37 %, Dangast 36 %, Langeland Bagenkop 29 %, Amrum 17 %,
  Langeoog 16 %, Föhr Wyk 6 % — im Watt fällt die Zelle im Modell trocken. In diesen Stunden steht kein Wert
  (235 von 4 608 Spot-Stunden des Laufs).
- Pakete: 25 Spots lesen `db`, 39 `wb`.
- `elbe-wittenbergen` liegt in **`wb`** (9,75° O; `db` endet bei 9,49° O): Zelle 0,53 km, bis 1,55 kn. Ein Elbe-Paket
  ist dafür nicht nötig; die Elbe ist dort schmaler als zwei Zellen (V-ST-2).
- Größenordnung am Spot: Sylt Hörnum bis 2,0 kn, Hvide Sande 1,7 kn, Elbe 1,6 kn, Norderney 1,4 kn; an **29 der 64
  Spots bleibt der Strom im ganzen Lauf unter 0,3 kn** (fast die ganze Ostsee).

### 1.5 Lizenz (Jans Vorgabe: DL-DE BY 2.0 laut GDI-BSH-Katalog) — gemessen anders

| Ort | Wortlaut |
|---|---|
| BSH-Seite „Strömungsvorhersagen für Segler als GRIB-Dateien“ (`bsh.de/DE/DATEN/Vorhersagen/Stroemungen/Oberflaechenstroemung_fuer_Segler/`) | nennt **keine Lizenz**; nur den rechtlichen Hinweis („Das BSH übernimmt keine Gewährleistung für die Funktionsfähigkeit, Vollständigkeit, Genauigkeit und Aktualität der Vorhersagedaten“) |
| `LICENSE.txt` im Datenverzeichnis selbst (FTP 03.08., Filebox 27.07.2026) | „This dataset is licensed under the Creative Commons Attribution 4.0 International License (**CC BY 4.0**). … Recommended attribution: Data provided by Bundesamt fuer Seeschifffahrt und Hydrographie (BSH), CC BY 4.0.“ Dieselbe Aussage steht in `README_en_de.txt` |
| GDI-BSH, Eintrag „Modellierte Strömungen des operationellen Zirkulationsmodells des BSH … (ca. 900 m) 2026 – Serie“ (`c23126a6-1339-47e0-b72e-ca1e3b7ea399`) | „… gemäß der ‚Creative Commons – Namensnennung – Version 4.0‘ … Quelle: Bundesamt für Seeschifffahrt und Hydrographie“ |
| „Datenlizenz Deutschland – Namensnennung 2.0“ | nur als Suchtreffer eines Spiegels (gdk.gdi-de.org) zu einem Eintrag von 2018 gesehen, die Seite selbst war nicht abrufbar — **nicht belegt** |

**Folge (E-ST-1):** die Seite nennt die Quelle so, dass **beide** Lizenzen erfüllt sind: „Strömung: Bundesamt für
Seeschifffahrt und Hydrographie (BSH)“ (Jans Wortlaut) mit „CC BY 4.0“ als Link auf die Lizenz und dem Vermerk der
Änderung. Die Bestätigung per Mail an opmod@bsh.de bleibt Jans Schritt (`MANUELLE-SCHRITTE.md` §93).

## 2. Entscheidungen

| Nr. | Frage | Entscheidung |
|---|---|---|
| **E-ST-1** | Lizenz | Jans Vorgabe war DL-DE BY 2.0 laut GDI-BSH-Katalog. Gemessen (§1.5): das Datenverzeichnis selbst und der Katalogeintrag nennen **CC BY 4.0**, die Download-Seite nennt nichts. Umgesetzt: Jans Wortlaut des Vermerks, dazu „CC BY 4.0“ mit Link und der Vermerk der Änderung — das erfüllt beide Lizenzen. **Jan entscheidet**, ob das so bleibt; die Bestätigungsmail steht in `MANUELLE-SCHRITTE.md` §93 |
| **E-ST-2** | Schalter | keiner — an für alle (Jan, Ausnahme zu Rule 2). Rückfall: der Zeiger `status.current` (ohne ihn zeigt die Seite überall „keine Daten“ zur Strömung, sonst ist sie die alte) oder den Commit zurücknehmen |
| **E-ST-3** | Zugang | Filebox über `fetch`; FTP über `curl` als Rückfall (§1.1) |
| **E-ST-4** | Leser | eigener JPEG-2000-Leser nur im Producer (`scripts/sea/jp2k.mjs`, `bshGrib.mjs`), streng: er liest die gemessene Form und lehnt alles andere mit Grund ab — auch ein **zweidimensionales** Bild, weil die Kontexte mit waagerechten UND senkrechten Nachbarn an den eindimensionalen Strömen des BSH nie erreicht werden (gefunden mit einer Mutationsprobe: ein vertauschter Kontext blieb unbemerkt). `src/sources/gribDecode.ts` ist unverändert |
| **E-ST-5** | Ablage | eigene Datei `sea/v1/current/<lauf>.json` mit Zeiger `status.current` (wie die Wind-Auffrischung), nicht als Spalten in `spots/<lauf>.json`: die Läufe des BSH (00/12 UTC, +5:30 h) und des CWAM (+4:07 h) fallen nicht zusammen, und Seite wie Producer auf `main` lesen bis zum Push den alten Code |
| **E-ST-6** | Stundenwert | der Wert des 15-min-Schritts zur vollen Stunde (kein Stundenmittel: über das Kentern gemittelt wäre die Richtung sinnlos). Gespeichert in cm/s und ganzen Grad, gezeigt in Knoten; Richtung als „setzt nach“ (wohin), wie in der Seefahrt für Strom üblich — Wind und Welle bleiben „kommt aus“ |
| **E-ST-7** | Zelle des Spots | die nächste Wasserzelle, die in höchstens 50 % der Schritte des Laufs ohne Strom ist, höchstens 3 km vom Spot (`set`, die Regel des Seegangs V-SW-20). Je Lauf neu bestimmt; Zelle, Paket, Abstand und Anteil stehen in der Datei |
| **E-ST-8** | „kein Strom“ | unter 1 mm/s (`measured`, §1.3) ⇒ kein Wert für die Stunde. Ein einzelner solcher Schritt zwischen zwei Schritten mit Strom ist das Kentern, kein Trockenfallen (Elbe, 15:45 UTC: 0,0 cm/s zwischen 10 cm/s ab- und 10 cm/s aufwärts) |
| **E-ST-9** | Stauwasser | der schwächste Schritt innerhalb von ± 2 h, um den der Strom dreht: 2 h davor und danach zeigt er in entgegengesetzte Halbebenen, beide mit mindestens 0,05 m/s, das Minimum höchstens halb so stark wie der schwächere (`set`, am Wert benannt). Auflösung 15 min |
| **E-ST-10** | „Wind gegen Strom“ | Winkel zwischen „Wind weht nach“ und „Strom setzt nach“ über 120°, Wind ab 10 kn, Strom ab 0,5 kn (`set`, stehen unter dem Hinweis). Nur Erklärung: kein Wellenwert und keine Klasse ändert sich |
| **E-ST-11** | Kartenebene | ab Werk **aus** (wählbar unter „Auf der Karte“). Feld 90 × 55 Zellen (jede siebte CWAM-Zelle ≈ 6,3 km, abgetastet, nicht gemittelt), ein PNG je Stunde; ab Zoom 7,5 alle Zellen, darunter jede zweite; Pfeile ab 5 cm/s |
| **E-ST-12** | Uhr | gefragt wird ab Lauf + 4 h und nur, bis der nach der Uhr mögliche Lauf gebaut ist; ein Lauf wird erst gelesen, wenn sich seine Dateien 5 min nicht geändert haben; drei Versuche je Lauf; die Seite zeigt einen Lauf höchstens 30 h (alles `set`) |
| **E-ST-13** | Elbe-Paket | nicht benutzt — `wb` trägt Wittenbergen (§1.4, V-ST-2) |
| **E-ST-14** | Messung vom Runner | über einen Einmal-Workflow im Daten-Repo, der nur liest und nichts schreibt, ausgelöst durch seinen eigenen Push und danach wieder entfernt — der Auftrag verlangt die Messung „from a GitHub runner“, einen anderen Weg dorthin gibt es nicht. Kein Cron-Dispatch, kein Purge |

## 3. Umsetzung

| Datei | Rolle |
|---|---|
| `scripts/sea/jp2k.mjs` (neu) | JPEG-2000-Codestream: Marker, Precincts, Paketköpfe mit Tag-Bäumen, MQ-Dekoder, drei Bitebenen-Durchgänge mit den Kontexttabellen, inverses 5/3-Wavelet, Pegelverschiebung. Ohne Abhängigkeit |
| `scripts/sea/bshGrib.mjs` (neu) | GRIB2 der BSH-Dateien: Nachrichten (jede vollständig, sonst Fehler), Sektionen, Bitmap, Template 5.40 und 5.0, Gültigkeitszeit |
| `src/sea/seaContract.ts` | Spalten `cur`, `curTo` mit Herkunft `bsh`, Grenzen, `currentSeriesProblems`, Pfade `current/<lauf>.json` und `…/f/<hhh>.png` |
| `src/sea/seaCurrent.ts` (neu) | **Vertrag**, rein: Quelle, Lizenz, Vermerke; Pakete und Gitterprüfung; Uhr; u/v → Geschwindigkeit und „setzt nach“; Null-Regel; Stauwasser; Zell-Regel; „Wind gegen Strom“ mit Satz und Schwellen; Kartenfeld (Pixel, Pfeile); Produkt, Werteprüfung, Zeiger; Lesen auf der Seite (`currentOnAxis`, `currentViewOf`) |
| `scripts/sea/sea-current.mjs` (neu) | **Producer**: Listing (Filebox `PROPFIND`, FTP `LIST`), Laufwahl, Abruf mit Längenprüfung und sha256, Lesen je Paket (Kandidatenzellen je Spot, Stundenfelder), Zellwahl, Reihen, Stauwasser, PNGs, Datei, Zeiger zuletzt, Aufbewahrung zwei Läufe, Versuchszähler |
| `scripts/sea/workflow-sea.yml` | Schritt „Currents“ (continue-on-error, überspringt sich ohne Producer, reicht den Exit-Code durch), Fehlerbedingung |
| `scripts/sea/sea-archive.mjs` | `current-<lauf>.json.gz` je Lauf, Index `current` |
| `src/sea/seaClient.ts` | `loadCurrent` (Zeiger → geprüfte Datei oder Grund), `loadCurrentField` |
| `src/sea/SeaCurrentPanel.tsx` (neu) | Drift-Pfeil, Kompassscheibe mit Wind und Strom der Stunde, Karte des Abschnitts „Strömung“, Hinweis |
| `src/sea/SeaBand.tsx` | Zeile „Strom kn“ (Pfeil über Zahl; unter 0,1 kn nur der Punkt), Fußnote |
| `src/sea/SeaReadout.tsx` | Abschnitt „Strömung“ im Kapitel „Wetter“ |
| `src/sea/SeaMap.tsx`, `SeaDock.tsx` | Ebene `sw-current` (Symbol-Layer wie `sw-arrows`), Bild `sw-drift`, Schalter „Strömung“, Quellenzeile der Karte |
| `src/sea/SeaPage.tsx` | Zeiger, Datei, Reihe des Spots, Ansicht der Stunde, Feld der Stunde, Legende, Quellenliste |
| `src/sea/seaDeck.css` | Stile `sw-st-*` vor dem Planer-Abschnitt, mobil per Media Query |
| `scripts/verify-sea-current.mjs` (neu), `scripts/lib/fixtures/sea/current/`, `.gitattributes`, `package.json` | Prüfer und Fixtures (697 KB, `-text`) |
| `scripts/sea/spike/current-{probe,measure,record-fixtures}.mjs`, `current-reference.py` | Messwerkzeuge und Aufzeichner (kein Produktcode; die Referenz braucht `pip install eccodes`) |
| `docs/API.md` §8.12, `docs/DATA_SOURCES.md`, `scripts/repack-repo/README.md`, `budget.json` | Quelle, Dateien im Daten-Repo, Ratsche |

**Gestaltung** (Command-Deck, Skill `frontend-design`): EIN Zeichen trägt die Phase, der **Drift-Pfeil** — ein Punkt (der
Schwimmer) und wohin er treibt. Strom wird „setzt nach“ gelesen, Wind und Welle „kommt aus“; der Punkt hält beides im
Stundenband, in der Scheibe und auf der Karte auseinander, ohne dritten Farbton (Strom im Petrol der BSH-Werte, Wind in
Tinte). Die Kompassscheibe zeichnet die beiden echten Vektoren der Stunde: der Wind kommt zur Mitte, der Strom verlässt
sie — Spitze gegen Spitze ist „Wind gegen Strom“. Der Hinweis ist eine Petrol-Leiste, kein Bernstein: er erklärt und
warnt nicht. Ohne Wert steht „keine Daten“ oder „kein Strom“ in Worten da.

**Größe je Lauf im Daten-Repo:** `current/<lauf>.json` **36,8 KB** (gzip 12,2 KB) + 72 PNGs **418 KB** (je 5,6–6,0 KB)
= **455 KB**, zwei Läufe bleiben. Zum Vergleich: ein Seegangslauf 13,5 MB. Der Browser lädt die Datei einmal und je
gewählter Stunde ein PNG — nur bei eingeschalteter Ebene.

## 4. Gates (18.11.2026)

| Gate | Beleg |
|---|---|
| `verify:sea-current` | **108/108** — A Fixtures byte-gleich (sha256; die GRIB-Ausschnitte sind Schnitte aus echten BSH-Dateien mit Quelle, Versatz, Länge; Gegenprobe gekipptes Bit); B Leser gegen **ecCodes** (Punktzahl, Wasserpunkte, Minimum, Maximum, Summe, Zeit, Größe jeder Nachricht; 256 Werte an den Zellen der Spots, Abweichung < 1e-6 m/s), Ablehnungen (9/7, abgeschnitten, fremder Marker, zweidimensional, GRIB1, unvollständige Datei), gekipptes Bit im Codestream; C u/v → „setzt nach“, Null-Regel, Werteprüfung, Stauwasser an der echten Elbe-Reihe (02:15, 10:15, 15:45, 22:00 UTC, von Hand abgelesen) und an künstlichen Reihen (geradlinig, drehend, trocken, zu schwach), „Wind gegen Strom“ über Nord hinweg (350° → 10°), Schwellen; D echte Listings (Filebox, FTP), Laufwahl, der echte Ausschnitt durch den ganzen Producer (Wert am Spot = ecCodes an derselben Zelle), künstlicher Lauf mit trockener Zelle (immer / zeitweise / ohne Zelle im Umkreis), fehlender, verspäteter, zu alter und unlesbarer Lauf, drei Versuche, Rückfall auf FTP, Kill-Schalter, Aufbewahrung, Archiv; E Seite ohne Browser (Stunde im Lauf, dahinter, trocken; Lauf älter als 30 h ⇒ „keine Daten“; fremde oder verletzte Datei; Leser gegen einen Nachbau des Speichers; Hinweis an der Stunde); F Quelltext (Vermerk, Lizenz, Modellhinweis, Watt, kein „sicher“ mit Gegenprobe, Zeile im Band, Readout, Symbol-Layer, Klassen unberührt, Workflow-Schritt, kein Schalter, nur BSH/.grb2, keine Abhängigkeit) |
| Mutationsprobe am Prüfer | u und v vertauscht ⇒ 5 Prüfungen rot (C1, D11, D25, D28, D29); ein vertauschter Kontext der Bitebenen-Kodierung ⇒ 5 rot (B8, B9, B10, D10, D11). Ein Kontext, den eindimensionale Ströme nie erreichen, blieb grün ⇒ E-ST-4 (zweidimensionale Bilder abgelehnt, B11b) |
| ein lokaler Producer-Lauf | `sea-current.mjs` gegen die **echte Filebox**, Lauf 2026111800: Listing, 6 Dateien / 79,4 MB in 18 s (sha256 je Datei in der Produktdatei), 1 152 Nachrichten gelesen, **64/64 Spots**, 0 ohne Zelle, 72 h ab 18.11. 01:00 UTC, Datei 36 776 B, Feld 418 111 B in 72 Bildern, **67 s** gesamt (ein früherer Lauf: 12 s Abruf, 58 s); zweiter Durchgang „nicht fällig“ ohne Abruf. Aus diesem Lauf stammt die Fixture `doc.json`. Stauwasser: 34 Spots tragen mindestens eines; an den Gezeitenspots alle ≈ 6 h (Büsum, Pellworm, Sylt, Borkum, Elbe) |
| bestehende `verify:sea-*` | contract ✓ · text ✓ · decode ✓ · derive ✓ (461 s) · waterlevel ✓ · tide-window ✓ · wind-band ✓ · planner ✓ · seo **23/23** · dk **70/70** — alle Exit 0. `verify:sea-ui` (Browser) **nicht gelaufen** — Jans Entscheidung, keine Browser-Prüfung; an HEAD stand er rot (V-TF-5) |
| `npm run typecheck` | 0 |
| `npm run build` | grün, 280/280 Prüfungen des SEO-Baus |
| `npm run budget` | grün nach Anheben von Hand mit Notiz in `budget.json`: totalJs **1 990,4 / 1 991** (Grenze 1 986 → 1 991). HEAD laut Audit DK 1 985,0 ⇒ die Phase kostet **+5,4 KB** gzip, ganz im lazy `SeaPage`-Chunk; eagerJs 114,6 / 115, eagerCss 2,4 / 2,5, largestChunk 278,4 / 302 unverändert |
| `verify:share` | 516/517 wie an HEAD — rot nur SH6 (Edge-Bündel, Jans `npm run edge:share` aus Phase DK); diese Phase ändert daran nichts |
| Sichtprüfung | **keine** — weder Bild noch Browser (Jans Entscheidung 18.11.). Von den fünf Selbstverifikations-Fragen sind 2 (Desktop pixelgleich), 3 (Touch-Ziele am Gerät), 4 (Konsole) und 5 (Long Tasks) **unbeantwortet**; Frage 1 (Funktionserhalt) nur am Quelltext und an den Prüfern: keine bestehende Zeile, Karte oder Ebene ist entfernt; neu sind eine Bandzeile, ein Abschnitt, ein Schalter (aus), eine Quellenzeile |

## 5. Daten-Repos (`buscosun-data`, nur Workflows der Seewetter-Linie, ohne Force, je Push nachgeprüft)

| Commit | Inhalt | Prüfung nach dem Push |
|---|---|---|
| `c23fcc38` (18.11. 07:21 UTC) | `.github/workflows/sea-current-probe.yml` (neu, +86): Einmal-Messung des Zugangs vom Runner (§1.1), liest nur | GitHub-API: genau diese Datei im Commit; Lauf 44258195377 `success`, alle fünf Schritte grün, Ergebnisse als Notices gelesen |
| `86655a8a` (18.11. 07:22 UTC) | dieselbe Datei wieder entfernt (−86) | API: genau diese Datei, `removed`; die Liste der Workflows auf `main` trägt sie nicht mehr; `sea` Nr. 3448–3450 danach `success` |
| `945b6a65` (18.11. 08:05 UTC) | `.github/workflows/sea.yml`: Schritt „Currents“, Fehlerbedingung, eine Kopfzeile (+26/−2) | API: genau diese Datei; raw `@945b6a65` sha256 = lokale Datei (`9eb97fc5…`); gegen die Vorlage unterscheidet sich die Live-Datei nur noch um den fremden, offenen `ruc`-Hunk (§78). Der erste Push wurde abgelehnt (Cron dazwischen), ebenso beim Probe-Commit ⇒ `checkout --detach origin/main`, `cherry-pick`, zweiter Versuch grün |

Kein Push in `buscosun-archiv`: `sea-archiv.yml` holt den ganzen Speicher `sea/v1` und den Archivierer von `main`, es
braucht keine Änderung. Keine Strömungsdatei von der lokalen Maschine: der Producer auf `main` schreibt sie nach Jans
Push im nächsten 15-min-Lauf (der Lauf 2026111800 liegt dann schon beim BSH).

## 6. Befunde

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| **V-ST-1** | **Geschlossen mit ST-N (§7): der 12-UTC-Lauf beginnt am Folgetag 01:00 UTC, die Stunden bis dahin kommen aus dem Lauf davor.** Der 12-UTC-Lauf von `db`/`wb` ist **nicht beobachtet** (Namen der Tagesdateien, Zahl der Tage, Ankunftszeit). An der Elbe heißt sein erster Tag `_01` und beginnt am Lauftag um 00:15 UTC. Der Producer liest die Zeit aus den Nachrichten und nimmt jede lückenlose Tagesfolge, die beide Pakete gleich tragen | Nach dem ersten 12-UTC-Lauf mit dem Producer auf `main` (≈ 18 UTC): `status.current.run` endet auf `12`, `hours` und `t0` ansehen. Begänne der Lauf erst am Folgetag, stünde am Abend „keine Daten“ — dann die Stunden bis dahin aus der eigenen vorigen Datei tragen, mit benanntem Lauf |
| **V-ST-2** | Wittenbergen liegt in einer 0,9-km-Zelle von `wb`; die Elbe ist dort ≈ 2 km breit. Das BSH führt ein Elbe-Paket mit ≈ 90 m (zwei Tage, vier Teilstücke, 28 MB je Tagesdatei im Außenbereich) — am 18.11. waren dessen Dateien einen halben Tag älter als die übrigen | Mehrwert: Strom im Fahrwasser statt im Flächenmittel. Skizze: `PagHam` (Pagensand bis Hamburg, 8 MB je Tag) nur für diesen Spot lesen; die Regel „älter als 30 h ⇒ keine Daten“ gilt dann je Paket |
| **V-ST-3** | Die Stauwasser-Regel ist gesetzt, nicht geeicht. Sie findet an geradlinigen Gezeitenströmen jedes Kentern (Elbe 11 in drei Tagen, Büsum, Pellworm, Sylt), an drehenden Strömen wenig (Norderney eines in drei Tagen: der Strom wird dort schwach und dreht langsam durch Nord, ohne die Schwelle 0,05 m/s zwei Stunden davor zu halten). In der Ostsee meldet sie vereinzelt das Umschlagen eines windgetriebenen Stroms | Mehrwert: eine Zeit, auf die man sich beim Auslaufen verlässt, braucht einen Vergleich. Skizze: gegen die Stromkenterzeiten des BSH-Gezeitenstromatlas an fünf Orten prüfen; für drehende Ströme „schwächster Strom“ statt „Stauwasser“ zeigen |
| **V-ST-4** | Die Zelle eines Spots wird je Lauf bestimmt. An Spots nahe der 50-%-Grenze (Heiligenhafen 47 %, Husum 45 %) kann sie von Lauf zu Lauf wechseln; Heiligenhafens Zelle führt im ganzen Lauf weniger als 1 cm/s | Skizze: feste Zelle je Spot aus 30 Tagen Archiv (`current-<lauf>.json.gz` trägt Zelle und Anteil), in den Katalog |
| **V-ST-5** | An 29 der 64 Spots bleibt der Strom unter 0,3 kn; die Zeile „Strom“ zeigt dort drei Tage lang „0,0“ bis „0,2“ und einen Punkt | Jans Blick: die Zeile dort lassen (ehrlich: es strömt kaum) oder ab einem Höchstwert unter 0,2 kn durch einen Satz ersetzen |
| **V-ST-6** | Node `fetch` lud auf dem Runner 15 MB in 18 s (curl über FTP 12 MB in 4,5 s) ⇒ ein Lauf ≈ 100 s Abruf + ≈ 60–90 s Lesen, zweimal am Tag, im 15-min-Lauf der Seewetter-Linie (Zeitlimit 30 min) | Skizze: zwei Dateien gleichzeitig laden, oder FTP zuerst. Erst messen, wenn der Schritt läuft (`status.current.buildS`) |
| **V-ST-7** | Der Leser nimmt genau die heutige Form (JasPer, eindimensional, 5/3, verlustfrei). Stellt das BSH den Kodierer um, wird der Schritt rot, und nach 30 h zeigt die Seite „keine Daten“ | So gewollt. Skizze: `health-watch.yml` um das Alter von `status.current.run` erweitern, damit es jemand merkt |
| **V-ST-8** | Die Freigabe der Filebox hängt an einem Kürzel in der Adresse (`Z8k9NMB3dKVpOXA`), das das BSH ändern kann | FTP ist der Rückfall und im Prüfer gedeckt; die Adresse steht an EINER Stelle (`BSH_CURRENT_FILEBOX`) |
| **V-ST-9** | Das Kartenfeld kostet 418 KB je Lauf im Daten-Repo (72 PNGs) | Skizze: Schrittweite 10 statt 7 (≈ 200 KB) oder nur 48 h; erst nach Jans Blick auf die Pfeildichte |
| **V-ST-10** | „Ausfahrt planen“ kennt den Strom nicht: die Drift-Pfeile am Boot zeigen nur den Wind | Mehrwert: bei 1–2 kn Strom vor Sylt oder in der Elbe treibt man mit dem Strom, nicht mit dem Wind. Skizze: zweiter Pfeil am Boot aus der Reihe des Spots, als Richtung, weiter ohne Maß |
| **V-ST-11** | Die Güte der Strömungsvorhersage selbst ist ungeprüft (kein Vergleich mit Messungen) | Skizze: Strömungsmessungen der MARNET-Stationen des BSH (FINO, Kiel Leuchtturm, Darßer Schwelle) gegen die Modellzelle, im Seewetter-Archiv |
| **V-ST-12** | `verify:sea-current` steht nicht im CI-Workflow von `buscosun-web` (Workflows dort sind Jans Schritt, wie bei DK, SU, SP) | `MANUELLE-SCHRITTE.md` §93.6 |
| **V-ST-13** | Die README im FTP-Verzeichnis nennt Dateigrößen von „ca. 3 MB“ (`db`) und „ca. 5 MB“ (`wb`) und Zeiten „gegen 10:00 und 22:00 Uhr lokal“; gemessen sind 11–15 MB je Tag und 05:30 UTC | Nur vermerkt — maßgeblich ist, was im Verzeichnis liegt |

**Erster Lauf mit dem neuen Schritt:** `sea` Nr. 3451 (18.11. 08:16:34 UTC, GitHub-API `actions/runs/44265587742/jobs`):
Job `success` in 39 s; Schritt 14 „Currents (BSH surface current at the spots)“ `success` (überspringt sich, der Producer
liegt noch nicht auf `main`), „Publish“ `success`. Danach: `status.json` ohne `current` (erwartet), `lastPublishedRun`
2026111800, `spots.json` 25 567 B unverändert.

## 7. Nachzug ST-N (21.11.2026) — die Abendlücke (V-ST-1, V-SR-1)

### 7.1 Diagnose (gemessen 21.11.2026, 22:48 UTC, nur gelesen)

Jan sah am Abend auf der Ebene „Strömung“: „Keine Daten. Die gewählte Stunde liegt außerhalb des Laufs der
Strömungsvorhersage. Er reicht von So 22.11. 02:00 bis Mi 25.11. 01:00 Uhr.“ Das ist der Fall, den V-ST-1 als offen führte
und V-SR-1 am Lauf 2026111812 gemessen hat — kein Fehler eines Laufs, sondern jeden Abend so.

| Lauf | gebaut | erste Stunde der Achse | Stunden | Tage beim BSH |
|---|---|---|---|---|
| `current/2026112100.json` | 21.11. 06:20 UTC | **21.11. 01:00 UTC** | 72 | `00 01 02` |
| `current/2026112112.json` | 21.11. 18:13 UTC | **22.11. 01:00 UTC** | 72 | `01 02 03` |

- Der 12-UTC-Lauf beginnt am **Folgetag** (sein erster Tag heißt `_01`), der 00-UTC-Lauf am Lauftag. Beide Achsen beginnen um
  01:00 UTC, die des 12-UTC-Laufs einen Tag später.
- `status.current` nennt nur den neuesten Lauf, und die Seite liest nur ihn. Vom Umstellen des Zeigers (21.11. 18:13 UTC)
  bis 22.11. 01:00 UTC hat deshalb keine Stunde ab „jetzt“ einen Strömungswert: rund 6,8 h, jeden Abend. Auf der Achse des
  Stundenbands (sie beginnt mit dem Seegangslauf 12 UTC) sind es 13 leere Stunden.
- **Die Werte liegen im Speicher:** der Producer hält zwei Läufe (`SEA_CURRENT_KEPT = 2`). Gelesen:
  `current/2026112100.json` 200 (37 909 B), `current/2026112100/uv/021.png` 200, `…/uv/023.png` 200, `…/f/021.png` 200. Der
  Lauf davor deckt den ganzen Abend ab (bis 24.11. 00:00 UTC) und ist beim Umstellen 18 h, an der Naht 25 h alt — unter der
  Grenze von 30 h, ab der die Seite einen Lauf nicht mehr zeigt.
- Betroffen ist alles, was den Lauf liest: Zeile „Strom kn“, Abschnitt „Strömung“ (Wert, Stauwasser, „Wind gegen Strom“),
  Strömungspfeile, Riffel-Ebene, Strom entlang der Etappe.

**Ursache:** der Zeiger kennt den Lauf davor nicht, die Seite kann ihn nicht finden. Kein Fehler im Leser der BSH-Dateien, kein
Fehler im Feld.

### 7.2 Entscheidungen (Jan, 21.11.: „ja bitte, und diese Lücke beheben“)

| Nr. | Frage | Entscheidung |
|---|---|---|
| **E-ST-15** | Woher kommen die Stunden vor dem neuesten Lauf? | Aus dem **Lauf davor**, der im Speicher ohnehin liegt. Der Zeiger nennt ihn (`status.current.prev`), die Seite liest ihn. Kein Wert wird zwischen den Läufen kopiert, beide Dateien bleiben, was das BSH geliefert hat |
| **E-ST-16** | Welcher Lauf spricht für welche Stunde? | Ab der ersten Stunde des neuesten Laufs **immer** der neueste — auch wenn der ältere dieselbe Stunde trägt. Davor der ältere. Nichts wird gemischt (`currentDocAt`). Der benutzte Lauf steht im Abschnitt „Strömung“ und in der Legende der Riffel-Ebene, dazu ab wann der neuere gilt |
| **E-ST-17** | Wie alt darf der Lauf davor sein? | Höchstens 30 h, dieselbe Grenze wie für jeden Lauf (`SEA_CURRENT_DEAD_MS`, `set`). Im Normalfall ist er an der Naht 25 h alt. Fällt ein Lauf aus, wäre der Lauf davor 37 h alt und wird nicht gezeigt — dann steht „keine Daten“ wie bisher |
| **E-ST-18** | Wann lädt die Seite den Lauf davor? | Nur solange die Stunde von „jetzt“ vor dem neuesten Lauf liegt (abends); tagsüber kein zweiter Abruf (`currentPrevWanted`). Ein fehlgeschlagener Abruf ändert nichts: die Stunden bleiben „keine Daten“ |
| **E-ST-19** | Schalter | an für alle (Jans Wort), Rückfall `?curprev=0` = die Seite von vorher. Ohne den Eintrag im Zeiger (alter Producer) ist die Seite ebenfalls die von vorher |
| **E-ST-20** | Bestehender Zeiger | wird beim nächsten `sea`-Lauf **einmal nachgetragen**, ohne Bau, ohne Blick ins BSH-Verzeichnis — sonst käme der Eintrag erst mit dem nächsten BSH-Lauf |

### 7.3 Umsetzung

- **Vertrag** (`src/sea/seaCurrent.ts`): `SeaCurrentPrevPointer`, `currentPrevPointerOf` (wohlgeformt, älter als der Zeigerlauf, Pfad passt
  zum Lauf — sonst „keiner“, der Zeiger selbst bleibt gültig), `currentPrevWanted`, `currentDocAt`, `currentAxisOf`;
  `currentLoadOf` nimmt den Lauf davor nur mit derselben Werteprüfung, mit dem Lauf und der ersten Stunde, die der Zeiger
  nennt; `currentViewOf` liest die Stunde aus dem zuständigen Lauf, nennt ihn (`run`, `newerFrom`) und nimmt das nächste
  Stauwasser vor der Naht aus dem älteren, dahinter aus dem neuesten.
- **Producer** (`scripts/sea/sea-current.mjs`): `prevCurrent(storeDir, run)` = der neueste ältere Lauf im Speicher, der die
  Werteprüfung besteht; nach jedem Bau steht er als `current.prev` im Zeiger (`null` = keiner); ein Zeiger ohne den Eintrag
  wird einmal ergänzt. Kein Workflow geändert — `sea.yml` klont den Producer bei jedem Lauf.
- **Seite:** `loadCurrent` (zwei Abrufe nur abends), `SeaPage.tsx` (Zeile „Strom kn“ über `currentAxisOf`; Strömungspfeile
  und Riffel über den Lauf der gewählten Stunde; Legende nennt den Lauf), `SeaCurrentPanel.tsx` (Zeile „Lauf des BSH“),
  `seaTripData.ts` / `useSeaTrip.ts` (Strom der Etappe je Stunde aus dem zuständigen Lauf), `seaFlag.ts`
  (`seaCurrentPrevFrom`). Kein CSS, kein neues Bedienelement.
- **Datenvertrag, mit Namen:** `sea/v1/status.json` → `current.prev = { run, path, builtAt, t0, hours, field, uv }` oder
  `null`. Keine neue Datei, keine geänderte Datei, kein neuer Pfad. Ein alter Client übergeht den Eintrag. Die README-Vorlage
  des Daten-Repos nennt ihn (`scripts/repack-repo/README.md`).
- Nicht angefasst: buscosun Fusion (`src/pointForecast/**`), Shader, Edge Functions, Abhängigkeiten, Workflows.

### 7.4 Belege und Gate (21./22.11.2026)

**Probe an den echten Dateien** (`audit/seewetter-stroemung/prev-probe.mjs` → `prev-probe.json`, 21.11. 23:05 UTC, nur
gelesen; der Producer lief auf einer Kopie von `status.json` und den beiden Laufdateien in einem Temp-Ordner):

| Frage | Ergebnis |
|---|---|
| Producer-Besuch auf dem Stand des Speichers | nichts gebaut, BSH nicht gefragt (0 Listen, 0 Dateien), Zeiger ergänzt: `prev` = 2026112100 ab 21.11. 01:00 UTC, 72 h; beide Laufdateien Byte für Byte unberührt |
| Zeile „Strom kn“, Stunden vor dem neuesten Lauf (64 Spots × 13 h = 832) | **787 mit Wert**, vorher **0**; alle 64 Spots tragen dort Werte (die übrigen 45 Stunden: Zelle im Modell ohne Strom) |
| Riffel-Ebene um 23:00 UTC | Feld `current/2026112100/uv/022.png`, vorher keines („außerhalb des Laufs“) |
| Abschnitt „Strömung“ um 23:00 UTC | Sylt Hörnum 1,34 kn nach 188°, Cuxhaven-Duhnen 0,58 kn, Laboe 0,08 kn — je „Lauf 00 UTC vom 21.11., der neuere beginnt 22.11. 01:00 UTC“; vorher „keine Daten“ |

**Prüfer:** `verify:sea-current` 129/129 (108 + Block G mit 21 Prüfungen: Zeiger, Bedarf, Leser, Naht Wert für Wert mit
Negativkontrolle ohne den älteren Lauf, Stauwasser, Abrufe der Seite und der Etappe gegen einen Stellvertreter-Speicher,
Producer mit zwei Läufen, Nachtrag, Rückfall). **Mutationsprobe:** 16 eingebaute Fehler (älterer Lauf auch hinter der Naht,
toter Lauf genommen, Lauf davor auch tags geladen, ohne Werteprüfung, fremder Lauf, Naht eine Stunde zu spät, Stauwasser
des älteren hinter der Naht, Lauf nicht benannt, jüngerer Lauf als `prev`, Abruf immer, Etappe immer aus dem neuesten, kein
Nachtrag, Nachtrag bei jedem Besuch, Zeiger ohne Eintrag, kaputte Datei benannt, Schalter tot) — alle 16 bemerkt.
`verify:sea-ripples` 122/122 (G15/G17 hingen am alten Wortlaut der Quellzeilen und sind auf den neuen gestellt; G17 sagt
jetzt „ein älteres Feld nie für eine Stunde, die der neueste Lauf trägt“), `verify:sea-trip` 82/82, `-planner` 50/50,
`-wizard` 29/29, `-lakes` 125/125, `-dk` 70/70, `-wind-band` 41/41, `-sight` 80/80, `-watertemp` 136/136, `-contract` 30/30,
`-tide-window` 49/49, `verify:repack-publish` 24/24. Typecheck 0, Build 281/281.

**Budget:** an `e0683791` plus nur diesem Patch (frischer Klon) eagerJs 116,2 / 117, **totalJs 2 096,8 / 2 097** — grün,
Anteil der Phase +0,8 KB. Im geteilten Arbeitsbaum liegen zugleich uncommittete Änderungen der Gletscher-Linie
(`src/glacier/*`); mit ihnen misst das Budget 2 097,8 und ist rot (V-ST-16). Die Grenze habe ich nicht angehoben.

**Nicht geprüft:** nichts im Browser (kein Bild, kein Gerät) — die Verdrahtung der Seite ist an der reinen Logik, an den
Abrufen gegen einen Stellvertreter-Speicher und am Quelltext geprüft; `verify:sea-ui` (Browser) nicht gelaufen.
`verify:sea-derive` und `verify:sea-lakes-bytes` nicht gelaufen (kein Wellen- oder Windproducer berührt).

Die fünf Fragen: (1) Funktionserhalt — nichts entfernt; mit `?curprev=0` und ohne den Eintrag im Zeiger ist die Seite die von
vorher (G8, G10, G21). (2) Desktop pixelgleich — nicht geprüft; kein CSS geändert, die Zeile „Lauf des BSH“ und die
Legendenzeile sind abends um einen Halbsatz länger. (3) Touch-Ziele — kein neues Bedienelement. (4) Konsole — nicht geprüft.
(5) Long Tasks — nicht geprüft; neu ist abends ein zweiter Abruf von rund 38 KB.

### 7.5 Befunde

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| **V-ST-1 / V-SR-1** | **geschlossen** mit §7 (wirkt mit dem Push: Seite mit dem Deploy, Zeiger mit dem ersten `sea`-Lauf danach) | — |
| **V-ST-14** | Die Zeile „Strom kn“ im Stundenband zeigt nicht, an welcher Stunde der Lauf wechselt — der Lauf steht nur im Abschnitt und in der Legende | Mehrwert: wer die Zeile liest, sähe die Naht. Skizze: ein Strich im Band an der ersten Stunde des neuesten Laufs, wie die Naht „nur Gezeit“ beim Wasserstand |
| **V-ST-15** | An der Naht können Wert und Riffel springen (zwei Läufe, je Lauf eigene Zellwahl des Spots — Zelle und Abstand im Abschnitt gehören zum benutzten Lauf) | Nur vermerkt: gemessen ist der Sprung nicht. Skizze: die Stunde der Naht aus beiden Läufen im Seewetter-Archiv vergleichen |
| **V-ST-16** | Budget: totalJs 2 096,8 gegen 2 097 nach dieser Phase; die uncommittete Gletscher-Linie im selben Baum liegt mit 2 097,8 darüber | Die Grenze hebt, wer sie überschreitet — mit Notiz, nie mit `--update` |
| **V-ST-17** | Ein Client mit altem Bündel (Service Worker, offener Tab) übergeht `prev` und zeigt abends weiter „keine Daten“, bis er neu lädt | Nur vermerkt |
| **V-ST-18** | Fällt ein BSH-Lauf aus, zeigt die Seite abends weiter „keine Daten“ (der Lauf davor wäre 37 h alt, E-ST-17) | Ehrlich, aber eine Lücke: Skizze — die Grenze für den Lauf davor gesondert setzen, nach einer Messung, wie stark ein 37 h alter Lauf vom neuen abweicht |
| **V-ST-19** | Die Seite ist nach dieser Phase von mir nicht gesehen | Jans Blick am Abend, `MANUELLE-SCHRITTE.md` §109 |
