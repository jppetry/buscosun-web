# Seewetter (Phase SW) — Diagnose, Gate A, Umsetzung

> Phasendokument nach `audit/seewetter-plan.md` (Plan, gilt bei Widerspruch), `audit/seewetter-datenpruefung.md`
> (Quellenanalyse 07.10.), `audit/seewetter-konzept.md` (Konzept). Auftrag: `prompt-seewetter.md` (Jan 07.10.2026,
> Auto-Modus für Stufe 1 = SW-0 … SW-6, Schattenbetrieb und Archiv anstoßen). Alles in `buscosun-web` ist
> **uncommitted** (Jans Gate); Commits in `buscosun-data` und `buscosun-archiv` stehen mit Hash in §8.

## 0. Kurzfassung für Jan

- **Gebaut (Stufe 1, SW-0 … SW-6, alles uncommitted in `buscosun-web`):** Vertrag und Prüfer, Producer der Feld-/Spot-
  und der Textlinie, Publisher, Workflow `sea.yml`, Archiv und Auswertung für Gate D, 56 Spots, die Seite hinter
  `?sea=1` mit Karte, Stundenband, Readout, Profilen. Prüfer grün (`verify:sea-*` 150 Checks, `verify:road-ui` 64/64);
  rot nur `verify:share` 527/528, weil ich das Edge-Bündel nicht neu baue (E-SW-15, Jans `npm run edge:share`).
- **Live in den Daten-Repos:** `sea.yml` (wartet im Leerlauf, bis der Producer auf `main` liegt), ein lokal gebauter
  erster Lauf 2026100700 mit Wind aus buscosun Fusion 9 und 50 amtlichen Textausgaben unter `sea/v1/`, im Archiv
  `sea-archiv.yml` und der erste Tag. Commits §8.
- **Anders gemessen als in der Datenprüfung:** Lauf erst nach + 4:07 h vollständig (Abruf 03:50 wäre zu früh), 13,2 MB je
  Lauf (Browser-Schätzung ≈ 17), 17 liefernde POI-Küstenstationen statt nur Arkona, die Seegebiets-Geometrie gibt es
  beim DWD offen, drei Mockup-Spots lagen 3–4 Gitterpunkte neben ihrer i/j, über Wasser liest der Geländeleser die
  Wassertiefe als Höhe (V-SW-4), buscosun Fusion liefert vereinzelt Böe < Wind (V-SW-3), Richtungen 360,001° aus der
  GRIB-Packung (E-SW-22).
- **Für Jan:** Entscheidungen prüfen (§3), `npm run edge:share`, Push von `main` (startet Gate B), nach 7/14 Tagen Gates
  B/D, dann Real-Device und `SEA_LIVE` (Gate C) — `MANUELLE-SCHRITTE.md` §44.

## 1. Anker (gelesen am 07.10.2026, Stand `buscosun-web` `f9ba2d1` + Arbeitsbaum)

| Anker | Ort | Befund |
|---|---|---|
| GRIB2-Decoder | `src/sources/gribDecode.ts` `decodeGrib2` | dekodiert DRT 5.0 mit Bitmap (Sektion 6) ohne Umsortierung: Werte in Scan-Reihenfolge, NaN = maskiert. CWAM `scanMode 0` ⇒ Zeile 0 = Norden (La1), +i nach Osten — **kein Eingriff nötig** |
| bz2 | `scripts/lib/bz2.mjs` `decompressBz2` | JS oder Binary (`REPACK_BZIP2=1`) |
| PNG | `scripts/lib/png.mjs` `encodePng`/`decodePng` | RGBA ohne Abhängigkeit |
| Straßen-Linie | `src/road/*`, `scripts/road/*` | Vorbild für Vertrag, Derive, Workflow, Archiv, Seite |
| Radar-Spiegel | `scripts/radar-mirror/radar-mirror.mjs` = Daten-Repo `scripts/radar-mirror.mjs` (byte-gleich, `diff` leer) | Haken für `road`, `lightning` über `existsSync` + dynamischen Import |
| Spiegel-Tests | `scripts/radar-mirror-test/mirror-test.mjs` | **Messgerät** (spiegelt Bytes auf den Zweig `radar-test`), kein Regressionstest für `radar-mirror.mjs` — siehe E-SW-4 |
| Fusion im Producer | `scripts/road/road-forecast.mjs` `makeIo`, `dirStore`, `computePoint` | Vorbild für Wind am Spot |
| CAP-Warnungen | `src/sources/dwdCapAlerts.ts` | liest `DISTRICT_DWD_STAT` (Landkreise) |
| Register der Stände | `src/pointForecast/fusion/fusionRelease.ts` | `FUSION_CURRENT` = 9 (Stufe `fs`) |

## 2. SW-0 Spike — Messungen neben der Datenprüfung

Skripte (nur Messung, kein Produktcode): `scripts/sea/spike/{decode-cwam,arrivals,budget,cube-spots,poi-probe,cap-watch,collect-text}.mjs`.
Ergebnisdateien: `audit/seewetter/spike/`.

### 2.1 Dekodieren in Node (`decode-cwam.mjs`, CWAM-Lauf 2026100700, Schritte 0/10/24/34/58/78, alle 13 Größen)

| Größe | Datenprüfung | SW-0 | |
|---|---|---|---|
| Gitter | 630 × 387, La1 56,445835, Lo1 6,173611, Di 0,013889, Dj 0,008333, N → S | 630 × 387, La1 56,445835, Lo1 6,173611, La2 53,229168, Lo2 14,909722, Di 0,013889, Dj 0,008333, `scanMode 0` (N → S) | ✓ |
| Seepunkte CWAM | 124 011 | **124 011** in allen 78 Feldern, **eine** Maske (FNV `ca9d4cde`) für alle 13 Größen und 6 Schritte | ✓ |
| Seepunkte EWAM | 138 388 | **138 388** (526 × 721, 0,1° × 0,05°, Schritte 0/24/78) | ✓ |
| Seepunkte GWAM | „≈ 686 000“ | **686 000** exakt (1440 × 699, 0,25°, La1 89,25, Lo1 0, Schritte 0/174) | gemessen |
| Windboden `sp_10m` = 2,00 m/s | 7 487 | **7 487 bei + 24 h**; + 0 h 65 770 (!), + 10 h 1 234, + 34 h 4 302, + 58/78 h 0 | ✓, stark zeitabhängig |
| `tm10` = 1,0 s | 3 191, alle Hs ≈ 0 | **3 191 bei + 24 h, alle mit Hs < 0,05 m**; je Schritt 2 078–4 402, immer 100 % Hs < 0,05 | ✓ |
| `ppww` > 15 s | 468, Median Hs 0,17 m | **468 bei + 24 h, Median Hs 0,17 m**; Regel `ppww > 12 s ∧ shww < 0,3 m` träfe 496 (+ 24 h), 410 (+ 0 h) | ✓ |
| Wertebereich + 24 h | swh 0–3,11, tm10 1,0–7,8, ppww 1,0–21,8, sp 2,00–17,8 | swh 0–3,11, tm10 1–7,82, ppww 1–21,76, sp 2–17,82 | ✓ |
| GRIB-Kennung | 10/0/3 usw. | Disziplin 10 (Welle), 0 (`sp_10m`, `dd_10m`) | ✓ |

**Elf Mockup-Spots** (Toleranz 0,1 m / 0,2 s gegen den besten Seepunkt): mit dem Suchradius ± 2 Gitterpunkte aus der
Datenprüfung stimmen 8 von 11; St. Peter-Ording, Westerland und Cuxhaven-Duhnen liegen 3–4 Gitterpunkte neben der
angegebenen i/j (SPO −4/−2: 0,42/2,22/1,77 m, Tm 5,9 s · Westerland −4/−3: 0,71/3,21/1,98 m · Cuxhaven +3/−1:
0,18/1,39/0,25 m). Mit ± 6 stimmen **alle 11** (Fehler ≤ 0,05 m). Folgerung: die Lagen im Mockup sind aus Pixeln
zurückgerechnet; der Spotkatalog rechnet den Gitterpunkt selbst (§5, E-SW-5). Vier der elf Mittelpunkte i/j sind
Land (Westerland, Cuxhaven, Norderney, Eckernförde) — der Katalog darf nie „nächste Zelle“ ohne Maske wählen.

### 2.2 Ankunftszeiten (`arrivals.mjs`, Inventar `content.log.bz2`)

Das Inventar deckt ≈ 48 h; der Lauf sammelt im Hintergrund weiter (`audit/seewetter/spike/arrivals.json`).
Erste Aufnahme 07.10. 12:05 UTC, vier Läufe je Modell (05.10. 12 … 07.10. 00):

| Modell | erste Datei | Lauf vollständig (13 × letzter Schritt) | Volumen |
|---|---|---|---|
| CWAM | + 3:31 h | **+ 4:07 h** (alle vier Läufe auf die Minute: 04:06–04:07 / 16:06–16:07 UTC) | 92,5–99,7 MB |
| EWAM | + 3:16 h | + 3:52–3:53 h | 141–145 MB |
| GWAM | + 3:38–3:42 h | + 4:07–4:11 h | 444–446 MB |

Folge: die Abrufzeit **03:50** (Plan) liegt vor dem Laufende — der erste brauchbare Zeitpunkt ist 04:07 UTC. Siehe E-SW-10.
Text: FQDL50/51 erscheinen um :15 (11:15:24), WODL45 um :45 der Stunde vor dem Namensstempel (071200 → 11:45:29),
FXDL40 am 06.10. um 07:52:58 (Name 060000), **am 07.10. um 10:59:30 (Name 070000)** — die Mittelfrist hat keinen festen
Zeitpunkt.

### 2.3 Budget (`budget.mjs`, ein ganzer CWAM-Lauf 2026100700, Encoder `scripts/lib/png.mjs`)

| | Schritte | Summe | je Schritt Ø / max |
|---|---|---|---|
| `f/<sss>.png` (630 × 387 RGBA) | 59 (0–48 stündlich, 51–78 dreistündlich) | **6,52 MB** | 110,5 / 118,9 KB |
| `c/<sss>.png` (1260 × 387 RGBA) | 27 (0–78 dreistündlich) | **6,46 MB** | 239,2 / 267,9 KB |
| **Lauf gesamt** | | **12,98 MB** (Ziel ≤ 25 MB ✓) | |
| Variante `f` stündlich 0–78 | 79 | 8,79 MB | |

Rechenzeit 147 s lokal (Download aus dem Cache, Dekodieren, Kodieren). Die Browser-Messung (152 KB je Schritt) lag
höher, weil der Browser-Encoder nicht filtert.

### 2.4 Daten-Repo gegen die jsDelivr-Grenzen

GitHub-Baum `buscosun-data` `main` `d0de5a1` (07.10. 12:10 UTC, API `git/trees?recursive=1`): **587,2 MB in 7 157
Dateien** (point/<Lauf> je ≈ 95–100 MB, road/fc 59,8, runs 55,4, stations-s 55,0 …); größte Datei
`road/fc/v1/static/geo.json` 5,78 MB. jsDelivr liefert trotzdem jede Datei aus (Probe: `README.md`,
`road/v1/status.json`, `point/index.json`, die 5,8-MB-Datei — alle 200). Die „150 MB je Paket“ binden den Abruf
einzelner Dateien also nicht; bindend ist **20 MB je Datei** — die größte Seewetter-Datei hat 268 KB. Zwei Läufe
(≈ 26 MB) sind 4,4 % des heutigen Bestands ⇒ **E-SW-3: `sea/` passt in `buscosun-data`**.
Falle dieser Sitzung: `git ls-tree -l` in einem Klon ohne Blobs holt jeden Blob einzeln nach (413 MB) — Größen nur über die API.

### 2.5 Textformate (`collect-text.mjs`, läuft die ganze Sitzung, `audit/seewetter/fixtures/collected/` + `index.json`)

Erste Sammlung 07.10. 12:01 UTC: 52 Ausgaben aus dem 48-h-Fenster (FQEN50 16, FQEN51 16, WODL45 16, FXDL40 2,
FQMM60 2), danach jede neue. Die fünf vorgegebenen Fixtures stimmen per SHA-256 mit der README.

**Erster Warnfall:** `WODL45_EDZW_071200` (11:45:29 UTC) trägt im englischen Teil
`GERMAN BIGHT:` / `N to NW 7 later. ` statt `no warning. ` — die Küsten-Blöcke blieben bei „besteht keine …
Warnung“. Als Fixture abgelegt (`audit/seewetter/fixtures/WODL45_EDZW_071200`, 886 B, SHA-256 `e0f44b31…659d04`).
Damit ist das Format eines Seegebiets **mit** Meldung belegt (frei formuliert, eine Zeile, Leerzeichen am Ende);
ein Küstenblock mit aktiver Warnung fehlt noch (der Sammler läuft weiter).

### 2.6 Offene Quellenfragen

| Frage | Befund | Folge |
|---|---|---|
| CAP-Warnungen Küste und Seen | Die WarncellID-Liste des DWD (`cap_warncellids_csv.csv`, 11 829 Zeilen) führt **Seen** (Typ 2: 25 Zellen, u. a. Bodensee West/Mitte/Ost, Chiemsee, Müritz, Dümmer), **Seegebiete** (Typ 4: 20, `401000008` Deutsche Bucht …) und **Küstengebiete** (Typ 5: 8, `501000001` Ostfriesische Küste … `501000008` Östlich Rügen). Das CAP-Profil v2.1.14 nennt „Wind auf Binnenseen (Starkwind, Sturm)“ und Hochsee-Codes 14/15/16. Ob die offenen Dateien `DISTRICT`/`COMMUNEUNION` Zellen der Typen 2/4/5 tragen, ist nur bei aktiver Warnung sichtbar — am 07.10. 12:20 UTC waren beide Zips **leer** (keine einzige Warnung). `cap-watch.mjs` legt jede Datei mit Typ-2/4/5-Zellen ab | Stufe 1: Warnstatus nur aus WODL45 (wörtlich); CAP-Küste/Seen bleibt offen (V-SW-1), Seen-Ausbau SW-8 |
| Geometrie Seegebiete und Küstenabschnitte | Der DWD veröffentlicht sie selbst: `cap_seegebiete_shape_zip.zip` (`DWD_PVW_SEA`, 20 Polygone, WGS84) und `cap_kueste_shape_zip.zip` (`DWD_PVW_COAST`, 8 Polygone) auf der Open-Data-Hilfeseite, mit WarncellID. Vermerk in der Datei: „© GeoBasis-DE / BKG 2021 (Daten modifiziert); VMAP0 – Daten z. T. modifiziert“ | Lizenz offen nutzbar mit Vermerk ⇒ `sea/v1/static/areas.json` (E-SW-13) |
| Fusion über Wasser | `cube-spots.mjs`: buscosun Fusion (Stufe 9) an allen 11 Spots auf der CWAM-Seezelle: 80 stündliche Schritte bis + 79 h, Wind/Böe in jeder Stunde, Richtung 77–80/80 (bei schwachem Wind fehlt sie — V-FR-5), Ebenen t1 → Station → t2, MOSMIX-Station im Spiel, 0 Lesefehler. **Aber:** die Geländehöhe über Wasser ist die **Bathymetrie** von Terrarium (`hTrue` −1 … −19 m) | Producer setzt `elevationM: 0` am Spot (Meeresoberfläche, E-SW-11) — Eingabe, kein Motor-Eingriff |
| CWAM Wasserstand/Strömung | CWAM liefert nur die 13 Größen (kein Wasserstand, keine Strömung); laut GDI-DE-Dienstbeschreibung (Suchtreffer „Numerical Ocean Wave Prediction for coasts“) berücksichtigt CWAM Strömung und tideabhängige Wassertiefe (DWD/BSH/Hereon) | Hinweis an Watt-Spots: „Modell rechnet mit Gezeit, der Wasserstand selbst wird nicht gezeigt“ |
| POI an der Küste | `poi-probe.mjs` (38 Stationen im Küstenkasten, 25 h): **liefern Wind, Richtung und Böe in allen Stunden** u. a. Helgoland 10015, List/Sylt 10020, St. Peter-Ording 10028, Olpenitz 10042, Kiel-Holtenau 10046, Westermarkelsdorf 10055, Arkona 10091, Putbus 10093, Greifswalder Oie 10097, Norderney 10113, Leuchtturm Alte Weser 10124, Cuxhaven 10131, Pelzerhaken 10152, Boltenhagen 10161, Warnemünde 10170, Barth 10180, Ueckermünde 10193. **Nichts:** UFS Deutsche Bucht 10007, Leuchtturm Kiel 10044 (alle Spalten `---`). Ohne Böe: Flensburg, Jagel, Hohn, Wittmundhaven, Nordholz, Laage | Gate D nicht nur Arkona: 17 Küstenstationen ⇒ Archiv sammelt alle (§7) |
| Bestand Daten-Repo | §2.4 | E-SW-3 |

## 3. Gate A — Entscheidungen im Auto-Modus

Nach `prompt-seewetter.md` Vollmacht 1: Empfehlung des Plans, außer eine Messung widerspricht; sonst die sicherste
umkehrbare Variante. Jede Entscheidung steht in `MANUELLE-SCHRITTE.md` §44 zur Prüfung.

| Nr. | Frage | Entscheidung | Beleg |
|---|---|---|---|
| E-SW-1 | Name, Route | „Seewetter“, `/seewetter`, Aliase `/kuestenwetter`, `/segelwetter`, `/wellen`, Spot als Pfadsegment | Plan |
| E-SW-2 | Schnitt Stufe 1 | deutsche Küste: CWAM-Felder, Spot-Reihen 0–78 h mit Wind/Böe aus buscosun Fusion, FQDL50/51, WODL45, FXDL40 wörtlich, POI-Messung | Plan; §2.6 Fusion deckt die Spots |
| E-SW-3 | Ablage | Linie `sea/` in `buscosun-data` | §2.3 13 MB/Lauf, §2.4 Datei ≤ 268 KB ≪ 20 MB |
| E-SW-4 | Workflow | **Abweichung:** Felder **und** Texte in EINEM eigenen Workflow `sea.yml` im Daten-Repo (alle 15 min; Texte jedes Mal, Felder nur, wenn ein vollständiger neuer CWAM-Lauf fällig ist). Der Radar-Spiegel bleibt unberührt | Felder: 100 MB Download + 147 s Kodieren + Fusion an den Spots (Würfel-Checkout) — nicht „unkritisch“ für eine 10-s-Schleife. Texte: der Plan fordert den Nachweis, dass ein Haken im Spiegel mit und ohne Modul gefahrlos ist; `mirror-test.mjs` ist ein Messgerät ohne Regressionsfall für `radar-mirror.mjs` — der Nachweis ist nicht zu führen, also die vom Auftrag vorgegebene Rückfallvariante. Verlust: keiner (DWD hält 48 h, der Workflow holt jede fehlende Ausgabe nach); Kosten: GitHub-Startverzug (7–31 min) macht Texte bis ≈ 30 min später sichtbar |
| E-SW-5 | Spotkatalog | eigene Liste (Name, Lage, Typ, Revier) von Hand; **Gitterpunkt und Ufernormale aus der CWAM-Landmaske gerechnet**, Seegebiet/Küstenabschnitt per Punkt-in-Polygon aus den DWD-Shapes, Station = nächste liefernde POI-Station; kein OSM | Plan; §2.1 (Mockup-Lagen 3–4 Zellen daneben, 4 von 11 auf Land) |
| E-SW-6 | DACH-Seen | später (SW-8), ohne Welle; CAP führt Seen-Zellen (§2.6) | Plan |
| E-SW-7 | PEGELONLINE | Ausbau SW-8 | Plan |
| E-SW-8 | Kachel | Nr. 12, volle Breite hinter Autobahnwetter | Plan |
| E-SW-9 | Einheit | Knoten voreingestellt, umschaltbar Bft und km/h | Plan, Mockup |
| E-SW-10 | Abrufzeit Felder | kein fester Zeitpunkt: der 15-min-Workflow prüft per Inventar, ob der erwartete Lauf vollständig ist (13 × 79), und baut ihn dann einmal | §2.2: vollständig + 4:07 h, 03:50 wäre zu früh |
| E-SW-11 | Höhe am Spot | `elevationM: 0` an jedem Spot (Meeresoberfläche) | §2.6: Terrarium liefert über Wasser die Wassertiefe |
| E-SW-12 | PNG-Kanäle | R = Hs in 5 cm (0–253 = 0–12,65 m, **254 = ≥ 12,70 m (gekappt, gezählt)**, 255 = kein Wert); G = Richtung „kommt aus“ in 256 Stufen (1,40625°); B = Periode in 0,1 s (0–254, **255 = kein Wert**, z. B. `tm10`-Platzhalter); A = 255 Wasser, 0 Land | Plan §SW-2; Kappung und Null-Kodierung waren offen |
| E-SW-13 | Seegebiete auf der Karte | `sea/v1/static/areas.json` aus den DWD-Shapes (Seegebiete Nord-/Ostsee + 8 Küstenabschnitte, vereinfacht), Vermerk „© GeoBasis-DE / BKG 2021 (Daten modifiziert); VMAP0“ + DWD | §2.6 |
| E-SW-14 | Warnstatus | Status je Block: `none` nur bei exakt bekanntem Satz (Küste: „Fuer die deutsche …kueste besteht keine Starkwind-, Sturm- oder Orkanwarnung.“ nach Auflösen der Umbrüche; Seegebiet: „no warning.“), **sonst `unknown`** und der Wortlaut steht oben. Nie ein „Warnung“-Status aus Musterabgleich | Plan; §2.5 Warnfall |

**Weitere Entscheidungen im Auto-Modus während der Umsetzung** (gleiche Regel: Empfehlung oder sicherste umkehrbare Variante):

| Nr. | Frage | Entscheidung | Beleg |
|---|---|---|---|
| E-SW-15 | Edge-Bündel `netlify/edge-shared/shareParser.js` | **nicht** neu gebaut (Edge Functions bleiben Jans Gate). Die Routentabelle `routes.ts` ist ins Bündel der Edge Function `og-meta` gebündelt; der neue Eintrag `seewetter` macht es veraltet ⇒ `verify:share` 527/528, rot genau die Bytegleichheit des Bündels. `npm run edge:share` würde nur den Routeneintrag hinzufügen (19-Zeilen-Diff: `audit/seewetter/edge-share-bundle.diff`) | §9.2 |
| E-SW-16 | Tokens `--sw-*` | im lazy `src/sea/seaDeck.css` statt in `designTokens.css` (Plan) | in `designTokens.css` stieg eagerCss auf 2,5 KB über die Ratsche (gemessen am Bau vom 07.10.); dasselbe tat AW mit `--aw-*` |
| E-SW-17 | Stundenband | schlichte `<table>` statt `@nivo/heatmap` | nivo zeichnet das Gitter in ein SVG/Canvas: keine Tabellensemantik für Screenreader, keine fixierte Beschriftungsspalte im Scrollbereich, keine fokussierbare Zelle je Stunde — die Bedingungen des Auftrags. Die Verlaufsdiagramme sind `@nivo/line` (zwei Diagramme, eine Zeitachse, nie gestapelt); kein weiteres `@nivo/*`-Paket nötig |
| E-SW-18 | Zeit-Chips mobil | 44 px statt 36 px (Vorlage) | harte Regel Touch-Targets ≥ 44 px (CLAUDE.md, `verify:sea-ui` G3) |
| E-SW-19 | Wind auf der Karte | Pfeile von **buscosun Fusion** an den Spots (Schalter, voreingestellt an) statt Windpartikeln | Fusion liefert Wind nur an Punkten, keine Fläche; die Partikel der Wetterkarte wären ICON-Wind (andere Quelle), der WAM-Antriebswind ist ausgeschlossen. Partikel als gekennzeichnete ICON-Ebene = V-SW-6 |
| E-SW-20 | Ufernormalen | 52 aus der CWAM-Maske, 4 von Hand (`normalFrom: 'set'` mit Grund und Maskenwert: Warnemünde 320°, Travemünde 45°, Binz 90°, Pelzerhaken 80°) | die Maske im 2,5-km-Kreis zog dort Hafenbecken, Trave/Priwall bzw. Buchtform mit (52°, 129°, 44°, 168°) |
| E-SW-21 | Böe unter Wind (Fusion) | an der betroffenen Stunde Böe `null`, gezählt (`gustDropped`); Wind und Spot bleiben | erster Lauf: Fehmarn Südstrand +42 h 13,1 < 13,8 m/s ⇒ die erste Sperre hätte den ganzen Spot verworfen (V-SW-3) |
| E-SW-22 | Richtung 360,001° | Toleranz ±0,05° um 0–360°, dann auf 0–360 gefaltet | GRIB-Packung: 73 Werte 360,000…360,001 in 21 Richtungsfeldern des Laufs 2026100700 (Bilanz vorher 915 „außerhalb“) |
| E-SW-23 | Meldung im Seegebiet | Status `unknown` ⇒ Kasten „Amtliche Meldung … zuerst lesen“ mit Wortlaut ÜBER dem Urteil; mobil lautet der Kopf „Erst die amtliche Meldung lesen“; die Gebiete der Karte werden bernsteinfarben umrandet | Prüffrage 3; Fixture `WODL45_EDZW_071200` (GERMAN BIGHT „N to NW 7 later.“) |
| E-SW-24 | Budget | eagerJs 109 → 109,4, totalJs 1567 → 1598 mit Notiz in `budget.json` | Jans Erlaubnis 30.09.; je Chunk gemessen, §9.2 |
| E-SW-25 | Wind am Spot | einmal je Wellenlauf gerechnet (Rechenzeit und Würfel-Läufe stehen an jedem Wert) | Plan SW-2; dreistündliches Nachrechnen = V-SW-2 |
| E-SW-26 | Archiv | eigener Workflow `sea-archiv.yml` alle 6 h (:41), POI aller Katalog-Stationen + Arkona | POI hält 25 h ⇒ vierfache Überlappung; 17 liefernde Küstenstationen (§2.6) |
| E-SW-27 | erster Lauf | lokal mit dem echten Producer gebaut und gepusht (Wind aus dem Würfel über das CDN, `--data=cdn`) | Auftrag: Seite gegen echte Daten bauen, bevor der Workflow den Producer auf `main` findet |
| E-SW-29 | Commits des 15-min-Workflows | ein Durchlauf, der nur die Zeitstempel in `status.json` ändert (`updatedAt`, `job`, `textPass`), committet nicht | sonst ≈ 96 inhaltsleere Commits am Tag im Daten-Repo (`verify:sea-derive` B7) |
| E-SW-28 | Probe des Workflows | `sea.yml` einmal von Hand ausgelöst (eigene Linie, kein fremder Cron) | Leerlauf belegt: Lauf 37627568505 grün in 13 s, alle Schritte nach dem Producer-Check übersprungen |

## 4. SW-1 Vertrag und Prüfer (umgesetzt 07.10.)

| Datei | Inhalt |
|---|---|
| `src/sea/seaContract.ts` | Pfade `sea/v1/…`, Modelle (Gitter, Seepunkte, Schritte, Ankunft), 13 Größen mit GRIB-Kennung, `SEA_PARAMS_READ` (11, **ohne** `sp_10m`/`dd_10m`), Schritte `f` 59 / `c` 27 / Spots 79, Uhr-Regeln (Tor Lauf + 5 h, Schritt zurück ≤ 2, veraltet 18 h, keine Daten 30 h, Kill-Schalter), PNG-Kodierung (E-SW-12), Wertregeln (Hs/Periode/Richtung, Platzhalter, ppww-Artefakt, Kappung, E-SW-22), Lauf-Sperre `validateSeaRun` (Inventar 13 × 79, Gitter, Seepunkte, Maske, ≤ 0,1 % außerhalb ⇒ Quarantäne), Spot-Reihen (ganzzahlig, Herkunft je Spalte, E-SW-21), Spotkatalog-Regeln |
| `src/sea/seaText.ts` | Produkte FQDL50/51, WODL45, FXDL40 (FQDL60 Stufe 2), Ausgabestempel, erwartete Ausgaben aus der Uhr, Latin-1 Zeichen für Zeichen, Umbruch-Regel (nur Leerraum), GZ → UTC, Regeln Kopf/Textende/Ausgabezeit, Gliederung (Gebiete × Tage, Warnblöcke, Mittelfrist mit Wassertemperatur), Warnstatus nur aus dem exakten Satz (E-SW-14) |
| `src/sea/seaFlag.ts` | `SEA_LIVE = false`, `?sea=0/1`, Merken in `localStorage.sea` |
| `.gitattributes` | `audit/seewetter/fixtures/** -text` (neu angelegt) |

```
verify:sea-text     35/35   6 Fixtures + 53 gesammelte Bulletins: raw byte-gleich, Anzeigetext nur Leerraum (mit Gegenprobe),
                            Warnfall, 11 Schlechtfälle, Uhr und Kalender
verify:sea-decode   13/13   echte CWAM-Ausschnitte: Gitter, Orientierung N→S (mit Gegenprobe), 124 011, eine Maske, 7 487, 3 191,
                            468/496, elf Spots, PNG ±½ Stufe
verify:sea-contract 29/29   Pfade, Uhr, Wertregeln (inkl. 360,001°, Böe < Wind), Lauf-Sperre am echten Feld (Quarantäne-Fälle),
                            Reihen, Katalog, Flag
```

## 5. Spotkatalog (E-SW-5, `scripts/sea/spots-src.json` → `scripts/sea/build-spots.mjs`)

56 Spots (22 Nordsee, 34 Ostsee) von Borkum bis Ueckermünde; die Lage ist von Hand, alles andere gerechnet: Wasserzelle
(nächste CWAM-Seezelle mit ≥ 3 Wasser-Nachbarn und mittlerem Hs ≥ 2 cm an +10/24/34/58 h; Abstand 0,12–2,18 km, alle
≤ 3 km), Ufernormale (E-SW-20), Seegebiet und Küstenabschnitt per Punkt-in-Polygon in den DWD-Shapes (Ueckermünde im
Stettiner Haff liegt in keinem FQDL50-Seegebiet ⇒ `seaArea: null`, Küstenabschnitt „Boddengewaesser Ost und oestlich
Ruegen“), Station = nächste liefernde POI-Station mit Lage. `static/spot-geo.json`: 112 Gelände-/z0-Einträge, 39
Wassertiefen auf 0 m gesetzt (E-SW-11).

## 6. SW-2 Feldlinie, SW-3 Textlinie, Workflow

| Datei | Inhalt |
|---|---|
| `scripts/sea/sea-derive.mjs` | Inventar → fälliger Lauf → Download (11 Größen × 79, Größe gegen Inventar) → je Schritt dekodieren, Regeln, Maskenhash, PNG `f`/`c`, Spot-Werte → Lauf-Sperre → Wind am Spot (buscosun Fusion, Stufe `fs` des Registers, Würfel-Checkout oder CDN, `spot-geo.json`) → `spots/<lauf>.json` → `run.json` zuletzt → `status.json` → Aufbewahrung 2 Läufe; EWAM-Abgleich als Beobachtung |
| `scripts/sea/sea-text.mjs` | Liste + erwartete Namen, jede fehlende Ausgabe der 48 h, Regeln, `text/<produkt>/<ausgabe>.json` mit sha256/dwdAt, Quarantäne einmal, Aufbewahrung 48 h |
| `scripts/sea/sea-publish.mjs` | je Versuch frische Basis `origin/main`, ganzer `sea/v1`-Bestand, Commit nur `sea/`, Push ohne Force, ≤ 6 Versuche |
| `scripts/sea/workflow-sea.yml` → Daten-Repo `.github/workflows/sea.yml` | alle 15 min (`4,19,34,49`), Leerlauf „producer not on main yet“ (Exit 0), Texte, Fälligkeitsprüfung, Würfel-Checkout nur bei fälligem Lauf, `REPACK_BZIP2=1`, `SEA_KILL` als Repo-Variable |
| `scripts/sea/sea-archive.mjs` + `workflow-sea-archiv.yml` → Archiv-Repo | §7 |
| `scripts/sea/build-spots.mjs`, `spots-src.json` | §5 |

Erster Lauf lokal (E-SW-27): 2026100700, **13,2 MB** (f 6,52 + c 6,46 + Spots 0,21 MB), mit `bzip2`-Binary **85 s**
inklusive Wind (reines JS-bz2: 363 s), Wind buscosun Fusion 9 an 56/56 Spots (Würfel t1 2026100709, t2 2026100706,
MOSMIX 2026100709), EWAM-Abgleich Median |ΔHs| 0,025–0,075 m (keine Beobachtung > 0,3 m), Bilanz nach E-SW-22: 0 Werte
außerhalb, 249 650 Perioden-Platzhalter (tm10), 6 995 ppww-Artefakte, Böe < Wind an 1 Stunde (E-SW-21).

```
verify:sea-derive   40/40   echter Producer auf den Ausschnitten: Lauf, Maskenhash, PNG ±½ Stufe (f und c), Spot = Feldwert, kein
                            WAM-Wind, Wind-Fehler hält die Welle nicht auf, Quarantäne (Maske), unvollständig, > 30 h, Aufbewahrung,
                            Kill-Schalter; Texte gegen einen Stand-in-DWD: Ablage, nichts doppelt, Quarantäne einmal, 48 h; Publisher
                            gegen ein lokales Bare-Repo: nur sea/, fremder Push dazwischen, Force-Push einer frischen Historie heilt,
                            nichts Neues = kein Commit, kein Force/Rebase; Workflow-Vorlagen; Archiv; SW-6-Regeln auf der echten Reihe
```

## 7. Archiv für Gate D (`buscosun-archiv/sea/v1/`)

`<tag>/spots-<lauf>.json.gz` (Reihen je Lauf, ≈ 53 KB), `<tag>/poi.json.gz` (stündlich Wind, Richtung, Böe der
Katalog-Stationen + Arkona, m/s), `<tag>/text.json.gz` (alle Ausgaben des Tages mit raw und sha256), `index.json`,
`README.md`. Workflow `sea-archiv.yml` alle 6 h, Leerlauf bis zum Push. Auswertung `scripts/sea/sea-gate-d.mjs` (Paare
Spot ↔ Station ≤ 10 km, Bias/MAE/RMSE in kn je Vorlauf 0–5/6–23/24–47/48–78 h ab der Rechenstunde und je Station).
Zwischenstand auf dem lokal angelegten Tag 07.10. (ein Lauf, eine Stunde je Station): 19 Paare, Wind MAE 1,95 kn
(Bias +1,07), Böe MAE 1,69 kn — **kein Befund**, nur der Beleg, dass Kette und Auswertung laufen.

## 8. Commits in den Daten-Repos

| Repo | Commit | Inhalt | Prüfung nach dem Push |
|---|---|---|---|
| buscosun-data | `fafb81fd` | `.github/workflows/sea.yml` (Leerlauf-Schutz) + README-Abschnitt „Seewetter — sea/“ (+44 Zeilen, LF) | Workflow registriert (`active`); Probe-Lauf 37627568505 grün in 13 s (E-SW-28). Der README-Abschnitt hält, bis die Kartenlinie das README aus `buscosun-web/scripts/repack-repo/README.md` neu legt — dort steht er jetzt auch (uncommitted) |
| buscosun-data | `cdf89f97` | `sea/v1`: Lauf 2026100700 (59 + 27 PNG, run.json), Spots, 50 Textausgaben, static (Katalog, Gebiete, Maskenhash, spot-geo), status | raw 200 für status, run, f/024, spots, text, static; jsDelivr `@cdf89f97` 200; Radar-, Straßen- und Punktlinie committen davor und danach weiter (`c363286e` radar 13:17:23, `e61c0e18` road-fc 13:10) |
| buscosun-data | `1d3814a2` | Katalog mit Stationslage | 2 Dateien, nur `sea/` |
| buscosun-archiv | `493085fa` | `.github/workflows/sea-archiv.yml`, `sea/v1/README.md`, erster Tag (Spots 2026100700, POI 24 Stationen, 50 Texte) | nur `sea/` und der Workflow im Commit (`git diff --cached --name-only`) |

## 9. SW-4 Einstieg, SW-5 Seite, SW-6 Profile (umgesetzt 07.10., uncommitted)

### 9.1 Dateien

Einstieg: `src/App.tsx` (`FeatureId 'sea'`), `src/router/routes.ts` (Route `seewetter`, Aliase `/kuestenwetter`,
`/segelwetter`, `/wellen`, `subParam: 'spot'`, `FEATURE_PATH.sea`, Selbsttests `[SW]`), `src/router/router.tsx`,
`src/router/pages/SeaRoute.tsx` (Flag-Tor, URL-Schreiber), `src/SearchPage.tsx` (Kachel 12 volle Breite, Palette 13,
Fußlink, Zähler — alles hinter `seaFlagFrom()`), `src/nav/featureRail.tsx` (Wellen-Icon hinter dem Flag),
`netlify.toml` (drei 301-Aliase, zwei 200-Rewrites), `scripts/generate-seo.mjs` (Flag-Tor der Shell wie AW),
`scripts/health-manifests.mjs` (+ S1–S3), `budget.json`. Seite: `src/sea/SeaPage.tsx`, `SeaMap.tsx` (Bildquelle, auf der
CPU gefärbt und in Mercator-Zeilen umgerechnet, Wellenpfeile, Gebiete mit Warnstatus, Spots, Stationen, Fusion-Wind),
`SeaDock.tsx`, `SeaBand.tsx`, `SeaReadout.tsx`, `SeaCharts.tsx` (`@nivo/line`), `seaClient.ts`, `seaState.ts`,
`seaView.ts`, `seaProfiles.ts`, `seaDeck.css`.

### 9.2 Prüfer und Bau

```
verify:sea-ui        33/33  echter Browser (CDP, SwiftShader), Speicher aus dem echten Producer: Flag-Tor, Maße 62/60/250/728/400,
                            Band 67 Stunden-Spalten als Tabelle, Herkunft, Kartenfeld, Meldung über dem Urteil (Prüffrage 3),
                            Wortlaut WODL45/FQDL51 mit Nummer und Zeit, kein WAM-Wind (Prüffrage 1), kein „sicher“, URL-Zustand
                            (t, u, p, l, Spot, tab), Bft ändert Zahlen, Grenzen lokal, Schraffur, veraltet (19,5 h), keine Daten
                            (30,7 h, Prüffrage 4), Kill-Schalter, mobil (Pille 52, Teilen 44, Sheet, ≥ 44 px), Konsole sauber
verify:health        44/44  (+6: S1–S3 sea/v1/status.json)
verify:fusion-release 28/28 (kein fester Fusion-Name in src/sea)
verify:share       527/528  ✗ nur „Edge-Bündel passt Byte für Byte“ (E-SW-15)
npm run typecheck    0      (Negativprobe: ein Typfehler in src/sea wird gemeldet)
npm run build        grün, verify-routing 255/255 inkl. [SW] ×3, verify-seo grün
npm run budget       grün nach E-SW-24: eagerJs 109,3 / 109,4 · eagerCss 2,4 / 2,5 · largestChunk 278,4 / 302 · totalJs 1596,0 / 1598
                     Chunks (gzip -9): SeaPage 25,05 KB · SeaRoute 3,71 · seaFlag 0,28 · useAppNav 0,30 (abgespalten); Start-Chunk:
                     nur der Routeneintrag (Textsonde: keine sw-Klassen, kein Vertrag, keine Profile)
```

### 9.3 Pixelvergleich (`scripts/sea/sea-ui-diff.mjs`, Schwelle |ΔRGB| > 12, `audit/seewetter/ui/`)

Desktop 1440 × 900 gegen `reference/seewetter-desktop.dc.html`, mobil 390 × 844 (DPR 3, heruntergerechnet) gegen
`seewetter-mobile.dc.html`; Werte des letzten Laufs in `audit/seewetter/ui/diff-report.json`, Bilder daneben. Die
Abweichungen sind benannt: Karte (Vorlage = vorgerendertes PNG eines anderen Zeitpunkts, hier MapLibre mit Grundkarte
und echtem Feld), Zahlen (Vorlage Mi 12:00 mit Mockup-Wind, hier buscosun Fusion zur Prüfuhr), Warnkasten (Fixture mit
Meldung für die Deutsche Bucht), stündliche statt dreistündlicher Bandspalten (README der Vorlage: „in der App stündlich
bis + 48 h“), die gemeinsame FeatureRail der App, Zeit-Chips mobil 44 px (E-SW-18). Rail, Topbar und Pille liegen unter
10 %, die Karte bei 86–97 % (Konstruktion). Letzter Lauf: **Desktop 53,6 %** (Rail 9,4 · Topbar 8,7 · Dock 26,0 · Karte
86,2 · Band 41,9 · Readout 47,8), **mobil 62,5 %** (Pille 9,4 · Teilen 15,6 · Chips 71,9 · Karte 97,4 · Sheet 46,2); Aufnahmen
`got-*.png`, Vorlagen `ref-*.png`, Differenzbilder `diff-*.png`.

### 9.4 Die fünf Selbstverifikations-Fragen (CLAUDE.md)

1. **Funktionserhalt:** Startseite ohne Flag: Kachel, Palette, Fußlink, Rail unverändert, Zähler „11 Werkzeuge“
   (`verify:sea-ui` A2); Autobahnwetter-Seite: `verify:road-ui` (§9.6); Routing 255/255, SEO grün. Nichts entfernt.
2. **Desktop pixelgleich (Rest der Plattform):** ohne `?sea=1` lädt kein Byte der Seite; die einzigen eager-Änderungen
   sind Daten (Routeneintrag) — `verify-routing`, `verify:sea-ui` A1/A2, `verify:road-ui`.
3. **Touch-Targets ≥ 44 px:** `verify:sea-ui` G3 (alle sichtbaren Schaltflächen außerhalb der Bandzellen; Bandzellen sind
   27 px breit wie in der Vorlage — V-SW-8).
4. **Konsole sauber:** `verify:sea-ui` I1 (keine Ausnahme); die Warnung „circle-11“ kommt aus dem OpenFreeMap-Stil (auch
   auf der Autobahnwetter-Seite).
5. **Long Tasks > 200 ms:** in headless-shell nicht messbar (CLAUDE.md); Kandidaten `colourField` (630 × 774 Pixel je
   Stunden-/Ebenenwechsel) und die Klassen 56 Spots × 67 Stunden — Real-Device = Jans Gate (V-SW-10).

### 9.5 Die fünf Seewetter-Prüffragen (Plan)

1. **Modellwind aus WAM?** Nein: `sp_10m`/`dd_10m` werden nicht geladen (`SEA_PARAMS_READ`), stehen in keiner Datei
   (`verify:sea-derive` A6), keine Anfrage der Seite (`verify:sea-ui` H1); Wind und Böe kommen aus buscosun Fusion.
2. **Amtlicher Text wörtlich, mit Ausgabezeit und Quelle?** Ja: `raw` byte-gleich, Anzeigetext nur Leerraum
   (`verify:sea-text` R2/R3); Karte „Amtlich · Seewetterdienst Hamburg · wörtlich“ mit Produkt, Nummer und Zeit (E2).
3. **„passt“ ohne Warnung darüber?** Nein: jede Meldung, die nicht der exakte Satz ist, steht als Kasten über dem Urteil,
   mobil im Kopf (E1, G2); veralteter oder fehlender Warnstatus gilt als „unbekannt“ und wird ebenso gezeigt.
4. **Lauf 31 h alt?** „Keine Daten“, Hinweis, keine Fläche, kein Band, kein Feld geladen (F2); Kill-Schalter ebenso (F3).
5. **Herkunft an jeder Zahl?** Wind „buscosun Fusion 9“, Seegang „Modell CWAM“, Messung „DWD-Station … Messung an Land“,
   Texte „amtlich · wörtlich“; Band-Fuß, Diagramm-Kopf und Reiter Quellen nennen alle Quellen.

### 9.6 Regression anderer Seiten

`verify:road-ui` (Startseite, Rail und Palette sind geteilt): gegen den Dev-Server 63/64 — rot nur R8 (Inline-Tor der
statisch erzeugten Shell, die es im Dev-Server nicht gibt); gegen `vite preview` des Baus mit allen Seewetter-Änderungen
**64/64**.

## 10. Offene Punkte (V-SW, bis zur Wiederherstellung von improvements.md hier)

| Nr. | Was | Mehrwert | Skizze |
|---|---|---|---|
| V-SW-1 | Ob die offenen CAP-Dateien Küsten-, Seegebiets- oder Binnenseezellen (WarncellID 5/4/2) tragen, ist ohne aktive Warnung nicht zu sehen | Warnungen als Flächen statt nur WODL45; Seen-Ausbau | `cap-watch.mjs` läuft; beim ersten Treffer Fixture ablegen und auswerten |
| V-SW-2 | Wind am Spot wird nur zweimal täglich gerechnet | bis zu 12 h frischerer Wind | im 15-min-Workflow bei jedem neuen t1-Würfel nur die Windreihe nachrechnen (`spots/<lauf>-w<t1>.json`, Client nimmt die neueste) |
| V-SW-3 | buscosun Fusion liefert an einzelnen Stunden Böe < Wind (Fehmarn +42 h) | stimmige Böen überall | an die Fusion-Linie: Böe ≥ Wind in der Ausgabe erzwingen oder begründen |
| V-SW-4 | Über Wasser liest der Geländeleser die Bathymetrie als Höhe (bis −19 m) — jede Punktvorhersage auf dem Wasser (Panel, Dashboard) rechnet mit negativer Höhe | richtige Höhe auf See | im Leser Höhe 0 für Wasser (WorldCover-Klasse 80); Motor-/Leser-Gate (Jan) |
| V-SW-5 | Edge-Bündel `shareParser.js` neu bauen | `verify:share` grün | `npm run edge:share` (E-SW-15) |
| V-SW-6 | Windpartikel als gekennzeichnete ICON-Ebene | Flächenbild des Windes | `WindLayer` der Wetterkarte, Legende „Modell ICON, nicht buscosun Fusion“ |
| V-SW-7 | Ausblick bis 174 h (GWAM) | Wochenendplanung | SW-8 |
| V-SW-8 | Bandzellen 27 px breit (Vorlage) unter 44 px | Touch | mobil Spalten 44 px breit, Band wischt |
| V-SW-9 | Ufernormale aus der Maske ist an Hafenbecken grob | bessere Uferwinkel | Normale aus der Küstenlinie der CWAM-Maske im 500-m-Band (OSM nur mit ODbL-Freigabe) |
| V-SW-10 | Long Tasks auf dem Gerät nicht gemessen | Flüssigkeit mobil | `colourField` in einen Worker, Klassen je Spot cachen; Real-Device |
| V-SW-11 | `scripts/repack-repo/README.md` spricht noch von „vier Produktlinien“ | korrekte Doku | Zählwort ersetzen |
| V-SW-13 | Die Hintergrundläufe der Sitzung (Text-Sammler, Inventar-Schnappschüsse, CAP-Wächter) wurden am 07.10. gegen 16 UTC vom System wegen Speichermangels beendet und nicht neu gestartet; der zweite lokale Lauf (CWAM 12 UTC) wurde deshalb nicht mehr gebaut. Gesammelt sind 53 Bulletins (48 h Fenster bis 07.10. 12 UTC), drei Inventar-Schnappschüsse, CAP-Protokoll bis 14 UTC | Textsammlung über 7 Tage, Warnfall Küste | nach Jans Push übernimmt `sea.yml` die Texte (jede Ausgabe archiviert); die Spike-Skripte bei Bedarf von Hand wieder starten (`scripts/sea/spike/*.mjs --loop`) |
| V-SW-12 | Der Text-Sammler des Spikes schrieb sein `index.json` dreimal nicht (Windows EPERM beim Umbenennen, Datei kurz gesperrt); die Bulletins selbst sind alle da | robuster Sammler | Umbenennen mit Wiederholung |

## 11. Gates

| Gate | Stand 07.10. | Was Jan prüft |
|---|---|---|
| A Spike | entschieden im Auto-Modus (E-SW-1 … 14, dazu E-SW-15 … 28) | die Entscheidungen in §3 |
| B Schattenbetrieb | **startet mit Jans Push von `buscosun-web`**: `sea.yml` läuft seit 07.10. alle 15 min im Leerlauf und findet den Producer beim ersten Lauf nach dem Push (≤ 15 min + GitHub-Verzug). Der nächste fällige Lauf wird dann gebaut (CWAM ab Lauf + 4:07 h) | nach 7 Tagen: ≥ 95 % der Läufe vor Lauf + 5 h veröffentlicht (`status.json` `field.recent`, Commits „sea: … · CWAM <lauf>“), jede Quarantäne begründet (`sea/v1/quarantine/`), Lauf ≤ 25 MB (`run.json` `bytes`), keine Textausgabe verloren (Archiv `text.json.gz` gegen das DWD-Fenster; `npm run health` S1–S3) |
| C Seite live | vorbereitet: Prüfer grün außer E-SW-15, Pixelvergleich mit begründeten Abweichungen, beide Fragenkataloge beantwortet (§9.4/§9.5) | Real-Device, Seite ansehen, `npm run edge:share`, dann `SEA_LIVE = true` und noindex/Sitemap |
| D Wind am Spot | Archiv sammelt (`sea-archiv.yml` nach dem Push alle 6 h; der 07.10. ist lokal angelegt); Auswertung `sea-gate-d.mjs` | nach ≥ 14 Tagen `node scripts/sea/sea-gate-d.mjs --archive=<buscosun-archiv>/sea/v1 --catalog=<…>/sea/v1/static/spots.json` |
| E Stufe 2 | nicht begonnen | — |
