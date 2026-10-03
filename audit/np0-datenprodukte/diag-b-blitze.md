# NP-0a Diagnose B — Blitzquellen live (D-NP0-4 … D-NP0-7)

> Stand 2026-10-03, gemessen 14:20–15:45 UTC (Fork B der NP-0-Diagnose). Nur Diagnose, kein Producer-Code.
> Werkzeuge: `blitz-werkzeuge/` (TIFF-Leser nur mit `node:zlib`, Sampler, Backfill-, WMS-, WCS-Proben).
> Fixtures für den späteren Offline-Verifier: `fixtures/` (141 KB, Liste §8).
> Quellen: L1 DWD `dwd:Blitzdichte` (im Folgenden **BD**), L2 EUMETSAT `mtg_fd:li_afa` (**MTG**).

## 0. Kurzfassung

1. **Werte statt Farben gehen für beide Quellen — aber nur über WCS, nicht über WMS.**
   - **BD:** WCS `GetCoverage` liefert das Rohfeld `GRAY_INDEX` (Float64, Nodata 9999) auf dem nativen
     Gitter 0,0115° (1457 × 691 für ganz DE). WMS liefert nur Palettenbilder (auch `format=image/geotiff`
     gibt gerenderte Palettenindizes 1/15 zurück, `styles=raster` konstant 255) ⇒ **Werte exakt per WCS.**
   - **MTG:** Die Quelle *ist* ein eingefärbtes RGB-Mosaik (WCS-Bänder RED/GREEN/BLUE, Nil 0); der Stil reicht
     nur durch. Die Daten bestehen aus **genau 20 Farben + Schwarz (Nil)** — auf dem nativen WCS-Gitter an fünf
     echten Frames (Afrika heute, DACH 01.08.2025 / 25.06.2026 / 15.08.2026 / 20.07.2026) **jedes** Pixel einer
     der 20 Farben zuordenbar (unbekannt 0). Die 20 Farben sind über den Grünkanal streng monoton
     (249 … 0) ⇒ **exakte Bijektion Farbe ↔ Klasse 1…20**. Der Rundlauf Farbe → Klasse → Farbe ist exakt.
     Styled **WMS** dagegen interpoliert: über DACH 01.08.2025 sind **41 % der belegten Pixel nicht abbildbar**
     (2 484 Mischfarben, 5 131 Pixel mit Teil-Alpha), Vendor-Parameter `interpolations=nearest neighbor`
     wirkungslos (Bytes identisch).
   - Die **Bedeutung** der MTG-Klasse ist nur auf ±1 belegt: 20 gleich breite Klassen (lineare Lage auf der
     Legende, Abweichung ≤ 7 px), Legende „Count / 5 minutes", Ticks „1" am linken Rand, „10" bei x = 405,
     „20+" am rechten Rand — weder linear noch log stimmig. Ehrliche Lesart: *Klasse k ≈ k Blitze je
     FCI-Pixel und 5 min, Klasse 20 = 20 oder mehr; Zuordnung laut Legende, ±1 nicht ausgeschlossen.*
2. **Zeitfenster:** BD = „Blitze der letzten 15 Minuten", **alle 5 min** ⇒ Frames **überlappen dreifach**
   (Layer-Abstract, wörtlich §4). MTG = **5-min-Summe, Zeitstempel = Fensterbeginn**: „the timestamp for 00:25 UTC
   corresponds to accumulations between 00:25 UTC and 00:30 UTC, combining 10 half-minute AFA products"
   (EUMETSAT-Katalog EO:EUM:DAT:0687) ⇒ MTG-Frames überlappen **nicht**, Gültigkeitsende = TIME + 5 min.
3. **Bestand:** BD deklariert `2025-07-02T16:10Z/…/PT5M`, **liefert aber nur ≈ 24 h** (ältester lesbarer Slot
   02.10. 14:20Z um 03.10. 14:26Z; WCS 500 / WMS `InvalidDimensionValue` davor). MTG liefert den vollen
   Bestand (Frames vom 01.08.2025 gelesen). **Backfill 2 h: beide problemlos** (26/26 bzw. 24/26 Slots — die
   zwei MTG-Fehlslots waren die zwei jüngsten, noch nicht erschienenen, HTTP 404).
4. **Latenz** (Sampler, 60-s-Raster, 80 min): §1.4.
5. **Drei Fallen, die der Producer abfangen muss** (§3): (a) **DWD-WCS erfindet Frames** — jede Zeit ab
   Bestandsbeginn, auch Zukunft (18:00Z) und Zwischenzeiten (14:31Z), liefert HTTP 200 mit einem
   Frame aus lauter 0 **ohne** die Nodata-Maske, die jeder echte Frame trägt (159 386 × 9999 im DACH-Ausschnitt)
   ⇒ „fehlt" würde als „keine Blitze" gespeichert. Existenz nur aus `GetCapabilities` (TIME-Ende) bzw. per
   WMS-Probe, dazu Maskenprüfung. (b) **WMS antwortet auf fehlende Zeit mit HTTP 200** und
   `application/vnd.ogc.se_xml` ⇒ Content-Type prüfen. (c) **MTG ist wackelig:** im Stichprobenzeitraum HTTP
   503 (Afrika-Kachel, Lauf 24 h), 500 (WMS), 503 nach 10 s (WCS bilinear), Einzelabrufe bis 7,0 s.
6. **Lizenz** (§4): DWD — CC BY 4.0 mit Quellenvermerk (DWD-Rechtsseite), GeoNutzV §3 verlangt Quellenvermerk
   + Veränderungshinweis; der DWD bezieht die Blitzdaten von **nowcast GmbH** (LINET) — das Raster ist ein
   DWD-Geodatendienst ohne eigene Beschränkung. EUMETSAT — Core Data CC BY 4.0, Katalog-`rights`
   „NoConditions", Pflicht-Attribution „[Contains modified] EUMETSAT [Meteosat/Metop] [data/product] [Year]".
7. **Takt** (§5): je Quelle und Slot 0,1–0,5 s Capabilities + 0,3–1,4 s WCS (MTG-Ausreißer 7 s) + 0,1–0,2 s
   CPU. Im heutigen **seriellen** `main()`-Strang würde das den RV-Erkennungsdurchlauf um bis zu ≈ 8 s
   verzögern ⇒ **nicht** im `await`-Strang: Hintergrund-Promise (single-flight, Frist 20 s) oder ein
   Durchlauf je Schleife mit Drossel wie INCA; Start-Backfill gestückelt (≤ 2 Slots je Durchlauf).
8. **Empfehlung E-NP0-3: (A) Werte**, beide Quellen über **WCS nativ + eigene Nearest-Abbildung** auf ein
   festes EPSG:3857-Raster; **`LIGHTNING_GATE_MS`** Vorschlag in §6.4.

## 1. D-NP0-4 — Quellen live

### 1.1 Dienste und Zeitdimension (03.10. 14:24Z)

| | BD `dwd:Blitzdichte` | MTG `mtg_fd:li_afa` |
|---|---|---|
| Capabilities (Per-Layer) | `https://maps.dwd.de/geoserver/dwd/Blitzdichte/wms?service=WMS&version=1.3.0&request=GetCapabilities` — 11,5 KB, 0,09–0,5 s | `https://view.eumetsat.int/geoserver/mtg_fd/li_afa/wms?…GetCapabilities` — 7,0 KB, 0,05–0,3 s |
| TIME (deklariert) | `2025-07-02T16:10:00.000Z/2026-10-03T14:15:00.000Z/PT5M`, `default="current"` | `2025-05-30T15:00:00.000Z/2026-10-03T14:10:00.000Z/PT5M`, `default=<jüngste>`, `nearestValue="1"` |
| Bestand (gemessen) | **≈ 24 h** rollierend (Bisektion: ältester lesbarer Slot 2026-10-02T14:20Z) | voll (01.08.2025, 25.06./20.07./15.08.2026 gelesen) |
| WCS | `…/dwd/wcs`, CoverageId `dwd__Blitzdichte`, 1 Band `GRAY_INDEX`, Nil 9999, `nativeFormat image/tiff` | `…/mtg_fd/wcs`, CoverageId `mtg_fd__li_afa`, 3 Bänder RED/GREEN/BLUE 0…255, Nil 0 |
| natives Gitter | EPSG:4326, Ursprung 54,9023 N / 1,7496 E, Schritt 0,011498212619995° (≈ 1,28 km N-S), 1457 × 692 | EPSG:4326, Ursprung 70 N / 70 W, Schritt 0,01°, 14 000 × 14 000 (Mosaik; LI-Physik: FCI-2-km-Gitter am Subsatellitenpunkt) |
| Abdeckung | 46,95–54,91 N, 1,74–18,49 E (nur DE + Rand) | ±70° (ganz DACH) |
| Zeitfenster | „Blitze der letzten 15 Minuten", alle 5 min (Abstract) — Lage des Fensters zu TIME nicht dokumentiert, am Namen „Analyse" ⇒ vermutlich (TIME − 15 min, TIME] | **[TIME, TIME + 5 min)** (Katalog, wörtlich §0) |
| Größe/Einheit | „generische Einheiten … nichtlineare Abbildung von 0 bis 3000 Blitze pro Zeiteinheit und 100qkm auf den Wertebereich 0 bis 127"; SLD-Label „1/min * 100km²" mit Klassengrenzen 0,1 … 127 (Widerspruch Einheit ↔ Index benannt, §2.1) | „Count / 5 minutes" (Legende), optische Gesamtblitze (IC + CG), je Pixel |

### 1.2 Raster-Vorschlag (für beide Quellen dasselbe)

DACH 5,5–17,5 °E × 45,5–55,5 °N (dieselbe Box wie `src/fire/sources/gwisHotspots.ts` `DACH_BBOX_LATLON`) in
EPSG:3857: **x0 = 612 257, y1 (oben) = 7 459 517, Pixel 2 000 m Mercator, 668 × 880** (unten 5 699 517 ≈
45,49 °N). 2 000 m Mercator ≈ 1,29 km am Boden bei 50 °N — feiner als MTG (LI 2 km-FCI, über DACH real
≈ 3–4 km), etwas gröber als BD (0,0115° ≈ 1,28 × 0,82 km bei 50 °N). Ein Pixel des Ziels trifft bei BD
≈ 1,6, bei MTG ≈ 2 native Pixel ⇒ nächster Nachbar verliert bei BD einzelne 1-km-Spitzen (benannt; Alternative
1 000 m, 1 336 × 1 760, ≈ 4× Bytes). MapLibre kann das Raster als `image`-Source mit vier Ecken **ohne** Mesh
zeichnen (reguläres Mercator-Gitter).

Abruf: WCS **nativ** (`subset=Lat(45.4,55.6)&subset=Long(5.4,17.6)`, ohne `outputCrs`/`scalesize`) und eigene
Nearest-Abbildung über die GeoTIFF-Transformation (Tag 34264, `PixelIsArea`), Pixelmitte →
`floor((lon − ox)/sx)`. Begründung: Die serverseitige Umprojektion (`outputCrs=…3857`,
`interpolation=…/nearest-neighbor`, `scalesize=i(),j()`) erhält zwar die Werte (MTG Afrika 1000 × 631:
21 Farben), **rastet aber die Ränder am nativen Gitter ein** und beschneidet auf die Coverage: BD kam mit
Ursprung x = 612 672,9 statt 612 257 und Zeilenhöhe 1 604 m statt 2 000 m zurück ⇒ kein festes Raster
anforderbar. Der native Weg ist deterministisch und unabhängig vom Resampling des Servers.

### 1.3 Dauer und Bytes je Frame (DACH)

| Weg | BD | MTG |
|---|---|---|
| WCS nativ, Deflate (Backfill 26 Slots, seriell, 14:34Z) | **p50 302 ms · p90 396 · max 639**; 17,4 KB (ohne Blitze); gesamt 8,5 s | **p50 478 ms · p90 1 365 · max 6 965**; 5,2 KB (ohne Blitze); gesamt 26,1 s |
| WCS nativ, Deflate, Sommer-Gewitter DACH | — (kein Gewitter im 24-h-Bestand) | 8,7 KB (25.06.2026 17Z) · 15,9 KB (01.08.2025 15Z), je 0,7–0,8 s |
| WCS ohne Kompression | 12,6 MB (ganz DE, Float64) — **immer `geotiff:compression=Deflate`** (18,9 KB, 0,45 s) | — |
| WMS PNG 668 × 879 (heutiger Weg, styled) | 4,2 KB, 0,41–0,50 s | 10,3 KB, 0,67–3,2 s, 1 × HTTP 500 in 5; Sommer 01.08.2025: 50 KB, 5,4 s |
| Ziel-PNG RGBA 668 × 880 (eigene Kodierung) | 3,9 KB (ohne Blitze) | 3,8 KB ohne Blitze · 6,8 KB (25.06.) · 11,6 KB (01.08.); Extrem-Stellvertreter (aktivstes Afrika-Fenster, 18,9 % belegt) 51 KB RGBA / 33 KB Grau |
| CPU (TIFF dekodieren + abbilden + PNG kodieren) | 92–219 ms | 141–190 ms |

**Größe im Spiegel (24 Slots × 2 Quellen):** ruhig ≈ 0,19 MB, Gewittertag (DACH-Sommerframes) ≈ 0,4–0,6 MB,
Extremfall ≤ 2,5 MB. Ohne Blitze ändern sich die PNGs nicht (gleiche Bytes je Slot) — Git speichert sie trotzdem
je Pfad einmal (Blob-Dedup über identische Inhalte).

### 1.4 Latenz (Sampler 60 s, 80 min)

*(siehe §1.4-Tabelle unten — nach Sampler-Ende eingetragen)*

### 1.5 Backfill 2 h

- BD: 26/26 Slots 12:25–14:30Z lesbar — **aber** der Slot 14:30Z war um 14:33:50Z noch nicht veröffentlicht
  (Capabilities um 14:38Z: Ende 14:30Z) und wurde trotzdem mit 200 ausgeliefert ⇒ Falle (a) §3. Echte
  Lesbarkeit: alle Slots ≤ TIME-Ende der Capabilities, rückwärts ≈ 24 h. 2 h Backfill = 24 Abrufe ≈ 8 s seriell.
- MTG: 24/26 lesbar; die zwei jüngsten (14:25Z, 14:30Z) HTTP 404 = noch nicht erschienen (korrekt
  abgelehnt). 24 Abrufe ≈ 26 s seriell (zwei Ausreißer 6,6/7,0 s).
- Nach der Naht (Nachfolger-Job) liegt der Bestand schon auf `main` ⇒ Backfill nur für die Lücke der Naht
  (0–2 Slots je Quelle).

## 2. D-NP0-5 — Werte statt Farben (Reihenfolge wie im Plan)

| Schritt | BD | MTG |
|---|---|---|
| WCS `GetCoverage` GeoTIFF | ✅ **Werte**: `GRAY_INDEX` Float64, Nil 9999 | ⚠️ nur **RGB** (das Mosaik ist eingefärbt gespeichert), exakte Klassen über die 20-Farben-Bijektion |
| WMS `format=image/geotiff` | ❌ gerenderte Palette (Werte 1/15) | — (nicht nötig) |
| Stil `raster` | ❌ konstant 255 | — (einziger Stil `mtg_li_afa` = Durchreichen + ContrastEnhancement) |
| `GetStyles` / SLD | ColorMap `type="intervals"`, 15 Einträge (§2.1) | leerer RasterSymbolizer (keine ColorMap) |
| `GetLegendGraphic` | 14 Klassen + Grau „1/min * 100km²" | Verlauf 640 × 80, „Count / 5 minutes", Ticks 1 · 10 · 20+ |
| Rundlauf | entfällt (Werte) — **Nicht-Null-Werte in den 24 h nicht beobachtet** (DE ohne Gewitter; MTG über DE ebenfalls 0 in 48 Halbstunden, §2.3) | ✅ exakt auf WCS nativ (5 Frames, 0 unbekannte Pixel); ❌ WMS 41 % nicht abbildbar |

### 2.1 BD — Klassen aus dem SLD (wörtlich, `fixtures/bd-sld-blitzdichte.xml`)

`ColorMap type="intervals"`: `#7d7d7d` op. 0,3 q 0,0 „1/min * 100km²" · `#ffffff` op. 0 q 1e-16 „0" · `#fcffc1`
q 0,1 „0,1" · `#fbff5c` q 0,2 „0,2 - 0,4" · `#dffc26` q 0,5 „0,5 - 0,9" · `#a0d626` q 1,0 „1,0 - 1,9" · `#45c379`
q 2,0 „2,0 - 4,9" · `#00d6d8` q 5,0 „5,0 - 9,9" · `#11a1d6` q 10 „10,0 - 14,9" · `#0702fc` q 15 „15,0 - 24,9" ·
`#9232b7` q 25 „25,0 - 39,9" · `#da28c6` q 40 „40,0 - 59,9" · `#e70d0c` q 60 „60,0 - 79,0" · `#880e0d` q 80
„80,0 - 99,9" · `#4f0e0d` q 127 „> 100 < 3000". Abstract der Regel: „Mapping 0-127 auf Farbskala (mapped from
0-3000)".

Befunde: (i) Die Klassengrenzen 0,1/0,2/0,5 sprechen für **gebrochene** Werte im Feld; ob das Feld ganzzahlig
0…127 ist (Abstract) oder gebrochen (SLD), ist erst an einer Gewitterlage messbar ⇒ der Producer zählt
gebrochene Pixel ins Meta (§6.2). (ii) Die Label-Einheit „1/min * 100km²" passt nicht zum „generischen"
Index 0…127 des Abstracts — der Meta-Text nennt den **Index** und die SLD-Klasse, keine physikalische Rate.
(iii) GeoServer-`intervals`: ein Eintrag färbt Werte *unter* seiner Grenze ⇒ ein Wert ≥ 127 bliebe in DWDs
eigenem WMS **transparent** (Sättigung wird unsichtbar) — am Code der Doku abgeleitet, nicht an Daten belegt.
(iv) Nullfläche: Wert 0 = „gemessen, keine Blitze" (WMS grau 30 %), 9999 = außerhalb des Verbunds.

### 2.2 MTG — die 20 Klassen (Farben aus den Daten, Grünkanal streng fallend)

| k | RGB | k | RGB | k | RGB | k | RGB |
|---|---|---|---|---|---|---|---|
| 1 | 254,249,189 | 6 | 254,213,113 | 11 | 253,147,62 | 16 | 237,51,33 |
| 2 | 254,243,173 | 7 | 254,200,98 | 12 | 253,130,54 | 17 | 228,30,29 |
| 3 | 255,236,158 | 8 | 254,186,83 | 13 | 253,110,47 | 18 | 212,16,33 |
| 4 | 254,229,143 | 9 | 254,173,73 | 14 | 252,86,42 | 19 | 195,6,36 |
| 5 | 254,222,128 | 10 | 254,160,66 | 15 | 246,68,38 | 20 | 177,0,38 |

0,0,0 = Nil („keine Blitze" **oder** „keine Messung" — die Quelle trennt das nicht; im Meta so zu sagen).
Häufigkeit fällt mit k (Afrika 14Z: k1 205 059 … k19 2 683; k20 sammelt den Rest, 35 603) — passt zu
„Zählung mit Sättigungsklasse". Lage auf der Legende (nächste Legendenfarbe, Zeile y = 20): x = 160, 183, 205,
227, 250, 272, 294, 317, 334, 361, 379, 401, 423, 450, 467, 490, 513, 540, 569, 591 — linear gleichabständig
(Vorhersage linear 160 … 591, Abweichung ≤ 7 px; log-Vorhersage weicht bis 100 px ab). Keine der 20 Farben kommt
in der geglätteten Legende exakt vor ⇒ **die Legende taugt nicht als Rundlauf-Tabelle, die Daten selbst schon.**

### 2.3 Gegenprobe Aktivität (letzte 24 h)

BD: 24 stündliche Frames 02.10. 14:30Z … 03.10. 13:30Z — alle **0 + Maske** (je 18 881 B, ganzes DE). MTG über
DE (47–55 N, 6–15 E), halbstündlich 48 Frames: alle 0 (ein Abruf 15:30Z war HTTP 503 — nachgeholt: 0). Beide
Quellen sind damit konsistent; **die Nicht-Null-Werte von BD bleiben bis zur ersten Gewitterlage unbelegt**
(V-Kandidat §7).

## 3. Fallen

| # | Falle | Beleg | Abwehr im Producer |
|---|---|---|---|
| a | DWD-WCS liefert für **jede** Zeit ≥ Bestandsbeginn HTTP 200 — auch Zukunft/Zwischenzeit — mit einem Frame aus lauter 0 **ohne Nodata-Maske** | 14:31Z, 14:32Z, 14:35Z, 14:40Z, 16:00Z, 18:00Z → je 12 762 B, Werte {0: 721 756}; echte Frames: {0: 562 370, 9999: 159 386} (DACH-Ausschnitt). `fixtures/bd-wcs-dach-zukunft-18Z-negativ.tif` | TIME nur aus den Capabilities (Ende ≥ TIME); zusätzlich **Maskenprüfung** (Frame ohne 9999-Pixel ⇒ verwerfen); optional WMS-Probe 1 × 1 px (validiert gegen den Granulat-Index, s. b) |
| b | WMS bei fehlender Zeit: **HTTP 200**, `application/vnd.ogc.se_xml`, `InvalidDimensionValue` | 02.09., 14:31Z, 14:40Z | Content-Type prüfen; HTTP-Status allein sagt nichts |
| c | MTG-Dienst wackelt: 503 (WCS, Afrika-Lauf), 500 (WMS), 503 nach 10 s (WCS bilinear), Ausreißer 6,6/7,0 s | Backfill-Log, WMS-Serie | Frist 20 s je Abruf, kein Retry in derselben Schleife, Slot beim nächsten Durchlauf erneut; Fehler nimmt nur die Blitze |
| d | Deklarierte TIME-Ausdehnung ≠ Bestand (BD: 13 Monate deklariert, 24 h vorhanden) | Bisektion §0.3 | Backfill nie weiter als 2 h; 500 auf alten Slot = „nicht vorhanden", nicht Fehler |
| e | MTG-Nil 0,0,0 = keine Blitze **oder** keine Messung | WCS-Rangetype Nil 0 | Meta-Text; „fehlt" nur, wenn der Slot nicht erschien |
| f | MTG-Zeitstempel = **Fensterbeginn** | Katalog-Abstract | `validAtMs = TIME + 5 min`, `windowMin 5`, Lage `start` im Meta |
| g | WCS ohne `geotiff:compression=Deflate` = 12,6 MB Float64 (BD ganz DE) | §1.3 | Kompression Pflicht; LZW nicht nutzen (45 KB, braucht eigenen Dekoder) |
| h | Serverseitige Umprojektion rastet Ränder ein | §1.2 | nativ holen, selbst abbilden |
| i | Dateinamen mit `:` (ISO-Zeit) scheitern unter Windows (Lokaltest) | curl-Probe | Stempel `YYMMDDHHmm` wie `radarImg.ts` |

## 4. D-NP0-6 — Lizenz im Wortlaut

**DWD (BD).**
- Capabilities: `<Fees>none</Fees>`, `<AccessConstraints>https://www.dwd.de/copyright</AccessConstraints>`.
- DWD „Rechtliche Hinweise" (Ziel von `/copyright`, gelesen 03.10.):
  „Alle frei zugänglichen Geodaten und Geodatendienste sowie die als hochwertige Datensätze / high value datasets
  (HVD) festgelegten Leistungen des DWD dürfen unter den Bedingungen der Lizenz Creative Commons BY 4.0 (CC BY 4.0)
  unter Beigabe eines Quellenvermerks weiterverwendet werden. Zu den Geodaten zählen alle bereitgestellten
  meteorologischen Wetter- und Klimainformationen mit Ortsbezug."
  <https://www.dwd.de/DE/service/rechtliche_hinweise/rechtliche_hinweise_node.html>
- GeoNutzV §3 Quellenvermerke: „Die Nutzer haben sicherzustellen, dass 1. alle den Geodaten, Metadaten und
  Geodatendiensten beigegebenen Quellenvermerke und sonstigen rechtlichen Hinweise erkennbar und in optischem
  Zusammenhang eingebunden werden; 2. Veränderungen, Bearbeitungen, neue Gestaltungen oder sonstige Abwandlungen
  mit einem Veränderungshinweis im beigegebenen Quellenvermerk versehen werden oder, sofern die geodatenhaltende
  Stelle dies verlangt, der beigegebene Quellenvermerk gelöscht wird."
  <https://www.gesetze-im-internet.de/geonutzv/BJNR054700013.html>
- Form für veränderte Rasterdaten (aus `docs/API.md` §7, DWD-Vorlage): „Datenbasis: Deutscher Wetterdienst,
  Rasterdaten bildlich wiedergegeben" bzw. „…, eigene Elemente ergänzt". Für den Spiegel (Werte neu gerastert):
  **„Datenbasis: Deutscher Wetterdienst (NowCastMIX-Blitzdichte), Werte auf eigenes Raster umgesetzt"**.
- Herkunft der Blitze: „Der DWD bezieht aktuelle Blitzdaten aus Deutschland und dem europäischen Ausland zeitnah
  jede Minute von der Firma nowcast GmbH mit Sitz in München." <https://www.dwd.de/DE/derdwd/messnetz/atmosphaerenbeobachtung/_functions/Teasergroup/blitzdaten_teaser4.html>
  — dieselbe Seite nennt **keine** Nutzungsbeschränkung; das abgeleitete NowCastMIX-Raster ist ein frei
  zugänglicher DWD-Geodatendienst (`Fees: none`). Der Satz in `DATA_SOURCES.md` §7 („NowCastMix verarbeitet
  kommerzielle Bodennetz-Daten; das abgeleitete Raster ist offen") ist damit gedeckt; die **Einzelblitze**
  (LINET) bleiben kommerziell und sind nicht Teil des Produkts.
- ⚠️ Altlast: `src/sources/dwdLightning.ts` schreibt „(Sferics/Linet) · CC BY 4.0" für `Accumulated_Flash_Area` —
  laut dessen eigenem Abstract ist das das **MTG-LI-AFA-Produkt** (EUMETSAT), nicht LINET. Nicht Teil von NP-0a,
  V-Kandidat §7.

**EUMETSAT (MTG).**
- Capabilities: `<Fees>none</Fees>`, `<AccessConstraints>none</AccessConstraints>`.
- Katalog EO:EUM:DAT:0687 (Data-Store-API `https://api.eumetsat.int/data/browse/collections/EO%3AEUM%3ADAT%3A0687?format=json`):
  `rights: ["NoConditions"]`; Lizenzseite laut Katalog <https://www.eumetsat.int/eumetsat-data-licensing>, Datenpolitik
  „Free and unrestricted - CC-BY-4.0".
- Datenpolitik (zuletzt geändert 27.06.2024; PDF <https://www-cdn.eumetsat.int/files/2026-01/45173%20-%20Data_Policy.pdf>):
  „Core Data and Products are made available on an unrestricted basis under a CC-BY-4.0 licence …"; Pflicht-
  Attribution „[Contains modified] EUMETSAT [Meteosat/Metop] [data/product] [Year of publication or distribution]".
  **Einschränkung der Quelle:** beide Sätze stammen aus dem Suchindex der PDF; das PDF ließ sich mit Bordmitteln
  nicht textlich auslesen (Schriftkodierung) ⇒ **vor der Veröffentlichung des Meta-Texts einmal von Hand gegen das
  PDF prüfen** (Jans Gate, eine Minute). Vorschlag Meta-Text: **„Contains modified EUMETSAT Meteosat data 2026
  (MTG-I1 Lightning Imager, Accumulated Flash Area) · CC BY 4.0"**.
- Physik-Hinweise (Pflicht im Meta, `DATA_SOURCES.md` §7): optische **Gesamtblitze** (Wolke-Wolke und
  Wolke-Boden), nicht deckungsgleich mit Bodennetz-Erdblitzen; **Parallaxe** (geostationär bei 0°, ≈ 50° N ⇒
  Verschiebung nach Norden/Satellit-abgewandt um einige km je nach Wolkenhöhe, gegenüber Radar systematisch).

**Länder-Asymmetrie (für Meta/README):** AT und CH haben **keine** offenen Bodennetz-Blitze (ALDIS, MeteoSchweiz
kommerziell — `DATA_SOURCES.md` L6/L7) ⇒ dort nur MTG; BD endet an der DE-Grenze (Abdeckung 46,95–54,91 N).

## 5. D-NP0-7 — verträgt der Takt die Blitz-Abrufe?

Die Schleife in `scripts/radar-mirror/radar-mirror.mjs` `main()` (Stand `5bb8af1`) ist **seriell**: je Durchlauf
HEAD auf den erwarteten RV-/KONRAD-Slot je Produkt (Download, `derive` per `execFileSync`, `publish`), dann
`pollInca()`, `pollRzc()`, `road.poll()`, dann `sleep(POLL_SEC = 10 s)`. Jede `await`-Zeit verlängert den
Durchlauf und verschiebt damit die nächste RV-Erkennung.

Kosten je neuer Blitz-Slot (gemessen): Capabilities 0,05–0,5 s + WCS nativ BD p50 0,30 s / max 0,64 s, MTG
p50 0,48 s / p90 1,37 s / max 7,0 s (dazu 503/500-Antworten) + CPU 0,1–0,2 s. Je 5 min kommen zwei neue Slots.

| Variante | Wirkung auf RV DWD→Push |
|---|---|
| im `await`-Strang, beide Quellen im selben Durchlauf | typisch +1–2 s, schlimmstenfalls +8 s in dem Durchlauf, in den der RV-Slot fällt (≈ 2 von ≈ 25 Durchläufen je 5 min) — gegen ein Budget von ≈ 11 s **nicht tragbar** im schlechten Fall |
| Start-Backfill im Strang (24 Slots × 2) | +8 s (BD) +26 s (MTG) einmal je Jobstart — verzögert den ersten RV-Push nach der Naht |
| **Hintergrund-Promise, single-flight, Frist 20 s je Abruf** (Netz läuft asynchron; nur die 0,1–0,2 s CPU blockieren) | ≈ 0; Ergebnis liegt im Spiegel-Verzeichnis und fährt beim nächsten Produkt-Push mit |
| Drossel wie INCA (`LIGHTNING_CHECK_SEC` ≥ 30 s, ein Slot je Quelle und Durchlauf, Backfill ≤ 2 Slots je Durchlauf) | Capabilities-Kosten 0,1–0,5 s je 30 s; Abruf nur bei neuem Slot |

**Empfehlung:** Hintergrund-Promise **plus** Drossel (Capabilities je Quelle alle 30–60 s, nicht jeder 10-s-Durchlauf),
Backfill gestückelt, **kein** `execFileSync`-Kindprozess für die Blitze (der blockiert den Strang für Start + Arbeit;
die Abbildung braucht nur `node:zlib` und läuft in 0,1–0,2 s im Hauptprozess). Push: keiner eigens — die Dateien
fahren beim nächsten RV-/KONRAD-/rzc-Push mit (≤ 5 min), eigener Push nur nach 5 min ohne Produkt-Push
(Plan NP-0a-4).

## 6. Vorschlag für den Vertrag (`src/sources/lightningImg.ts`) und E-NP0-3

### 6.1 Empfehlung E-NP0-3

**(A) Werte** — für BD exakt (Rohfeld), für MTG exakt als Klassenindex 1…20 (Quelle selbst ist klassiert). Damit
gehen eigene Farben (`--np-flash-*`), Farbe nach Alter und „Blitze ≤ 10 km" (Schwelle auf Klasse/Wert).
Rückfall (B) gestyltes RGBA nur, falls Jan die WCS-Abhängigkeit scheut — dann verliert MTG wegen der WMS-Glättung
auch die Klassen (41 % der Pixel).

### 6.2 Kodierung (Vorschlag, RGBA-PNG 668 × 880, Raster §1.2)

| Quelle | R | G | B | A |
|---|---|---|---|---|
| `lightning-de` (BD) | Index `round(v)` 0…127 | SLD-Klasse 0…14 aus dem **ungerundeten** Wert (Grenzen §2.1; 0 = Wert 0) | 0 | 255 = im Verbund gemessen (auch 0), **0 = außerhalb** (Nodata 9999) |
| `lightning-mtg` | Klasse 0…20 (0 = Nil: keine Blitze oder keine Messung; 20 = „20+") | 0 | 0 | 255 im Satellitenbild (DACH immer) |

Meta je Slot (`meta.json`): `validAtMs` (BD = TIME; MTG = TIME + 5 min), `timeIso` (Quell-TIME), `windowMin`
(15 bzw. 5), `windowPos` (`end` bzw. `start`), `overlapping: true` (BD — „nie aufsummieren") / `false` (MTG),
`grid` (x0, y1, px, w, h, EPSG:3857), `classes` (BD: SLD-Grenzen + Labels wörtlich; MTG: 20 RGB + Label
„≈ k Blitze / 5 min, ±1 laut Legende"), `fractionalPx` (BD: Zahl der Pixel mit gebrochenem Wert — macht die offene
Frage §2.1 live messbar), `source` (Dienst-URL, Layer, CoverageId), `license` (Wortlaut §4), `notes`
(MTG: Parallaxe + Gesamtblitze; BD: Bodennetz DE, kein AT/CH).

### 6.3 Existenz- und Plausibilitätsregeln (Prüfer)

BD-Frame nur speichern, wenn (i) TIME ≤ Capabilities-Ende, (ii) Antwort `image/tiff`, (iii) **≥ 1 Pixel 9999** im
DACH-Ausschnitt (sonst erfundener Frame, §3a), (iv) alle übrigen Werte in [0, 127]. MTG-Frame nur, wenn
(i) TIME ≤ Capabilities-Ende, (ii) `image/tiff`, (iii) **jedes** Pixel in {Nil} ∪ 20 Farben (sonst Palettenwechsel
der Quelle ⇒ Frame verwerfen, Log).

### 6.4 `LIGHTNING_GATE_MS` (Vorschlag)

*(nach Sampler-Ende, §1.4)*

## 7. Neue Befunde (V-Kandidaten für §8 des Phasendokuments)

- **BD-Bestand 24 h statt 13 Monate:** die deklarierte TIME-Ausdehnung lügt; ein Rückblick > 24 h geht nur aus dem
  eigenen Spiegel. Mehrwert: kein Nachholen über die Quelle planen. Skizze: `DATA_SOURCES.md` §7 / `API.md` §3.2
  berichtigen.
- **BD-Werte an Gewitterlage unbelegt:** Ganzzahligkeit 0…127 und Sättigung ≥ 127 nach dem ersten Gewitter mit
  dem Live-Verifier messen (`fractionalPx`, Histogramm). Mehrwert: Kodierung bestätigt statt angenommen.
- **MTG-Klassensemantik ±1:** Klasse k ↔ Zählung nur über eine schiefe Legende belegt. Mehrwert: exakte Zahl
  statt „≈". Skizze: einmal einen LI-L2-AFA-NetCDF aus dem EUMETSAT Data Store (Konto nötig) gegen denselben
  5-min-Frame zählen.
- **`dwdLightning.ts`-Attribution falsch** („Sferics/Linet") für ein MTG-Produkt; Mehrwert: korrekte Quelle in der
  Karte. Skizze: Text an den Layer-Abstract binden (eigene kleine Phase, betrifft UI).
- **EUMETSAT-Attribution:** Wortlaut aus dem Suchindex — vor Veröffentlichung gegen das Policy-PDF prüfen.

## 8. Belege

- Fixtures (`fixtures/`): `bd-wcs-dach-20261003T1400Z.tif` (echter Frame, 0 + Maske), `bd-wcs-dach-zukunft-18Z-negativ.tif`
  (erfundener Frame, Negativkontrolle §3a), `mtg-wcs-dach-20250801T1500Z.tif` + `mtg-wcs-dach-20260625T1700Z.tif`
  (Sommergewitter, alle Pixel abbildbar), `mtg-wms-styled-dach-20250801T1500Z-negativ.png` (geglättet,
  41 % nicht abbildbar — Negativkontrolle Rundlauf), `bd-sld-blitzdichte.xml`, `mtg-sld-li_afa.xml`,
  `bd-legende.png`, `mtg-legende.png`, `bd-caps-20261003T1424Z.xml`, `mtg-caps-20261003T1424Z.xml`,
  `mtg-afa-collection-EO-EUM-DAT-0687.json`.
- Werkzeuge (`blitz-werkzeuge/`): `tiff.mjs` (TIFF II/MM, Strips/Tiles, Deflate, Float/Int), `native.mjs`
  (WCS nativ → Ziel-Raster, Klassenzählung), `wcs3857.mjs` (serverseitige Umprojektion — Randbefund),
  `wms-probe.mjs`, `backfill.mjs`, `sampler.mjs` (Latenz). `wms-probe.mjs`/`native.mjs` importieren
  `scripts/lib/png.mjs` per absolutem `file:///`-Pfad (Diagnose, nicht für CI).
- Rohlogs: Session-Scratchpad `ltg/latency.log`, `ltg/backfill-1.log`.
