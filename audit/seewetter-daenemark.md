# Phase DK — dänische Küste auf `/seewetter`

> **Auftrag Jan, 2026-11-18:** acht dänische Spots (Rømø, Fanø, Hvide Sande, Als/Kegnæs, Langeland, Ærø/Marstal,
> Middelfart, Gedser) auf `/seewetter`, Revier-Chip „Dänemark“, ohne Schalter an für alle (Ausnahme zu Rule 2, Jans
> Entscheidung). Welle aus CWAM wie an den deutschen Spots, Wind aus buscosun Fusion wo der Punkt-Cube reicht, sonst
> DMI HARMONIE; Wasserstand vom BSH-Pegel wo einer mit Kurve nahe liegt, sonst DMI DKSS; Messung von der nächsten
> DMI-Station. Kein Eingriff in buscosun Fusion, keine Edge Function, keine neue Abhängigkeit. Die Sichtprüfung im
> Browser macht Jan selbst (seine Entscheidung 18.11.) — hier gibt es deshalb **keine** Bilder und keinen UI-Beleg.

## 1. Diagnose — Schritt 0, gemessen am 18.11.2026 01:40–01:50 UTC

Werkzeug: `scripts/sea/spike/dk-probe.mjs` (nur Messung). Ergebnis `audit/seewetter-daenemark/spike/dk-probe.json` (der
Katalogbau liest es). Die Rohantworten der Messung (1,5 MB) sind nicht eingecheckt; drei davon — DMIs 429-Körper, der
Landpunkt, die leere Station — liegen byte-gleich bei den Fixtures des Prüfers, die übrigen Fixtures hat
`dk-record-fixtures.mjs` mit den Adressen des Producers neu aufgezeichnet (`scripts/lib/fixtures/sea/dk/manifest.json`).

### 1.1 Je Spot

Lage von Hand; wo eine DMI-Station am Ort steht, ist sie der Anker der Lage (Kegnæs Fyr, Bagenkop Havn, Middelfart
Lystbådehavn, Gedser Havn, Hvide Sande Indsejling). CWAM-Zelle nach der Regel des Katalogs (`pickSpotCell`, Lauf
2026100700 + Trockenkarte 2026101100).

| Spot (`id`) | Lage | CWAM-Zelle | trocken | im Cube (Zelle ≤ 55,5° N) | nächster BSH-Pegel mit Kurve | DKSS am Zellpunkt | HARMONIE | metObs (liefert) | oceanObs `sealev_dvr` |
|---|---|---|---|---|---|---|---|---|---|
| Rømø Lakolk (`roemoe`) | 55,146 / 8,465 | 0,02 km | 11 % | ja (55,146) | List, Sylt, Hafen **14,5 km** | `dkss_ws` 121/121, Gitterpunkt 0,62 km | 61/61 | Rømø/Juvre 7,8 km | Esbjerg Havn I 35 km |
| Fanø Bad (`fanoe`) | 55,433 / 8,352 | 0,44 km | 30 % | ja (55,429) | List 46,6 km | `dkss_ws` 121/121, 0,61 km (`nsbs` dort Land: 0/121) | 61/61 | Nordby 2,4 km liefert **nichts** ⇒ Esbjerg Lufthavn 17,0 km | Esbjerg Havn I 6,5 km |
| Hvide Sande (`hvide-sande`) | 56,003 / 8,112 | 0,40 km | 0 % | **nein** (56,004) | List 111,6 km | `nsbs` am Zellpunkt Land (0/121); nächster Wasserpunkt 8,125 / 55,975 = **3,3 km** | 61/61 | Hvide Sande 1,9 km | Esbjerg Havn I 63,8 km |
| Als Kegnæs (`als-kegnaes`) | 54,851 / 9,988 | 0,48 km | 0 % | ja (54,854) | Leuchtturm Kalkgrund **7,0 km** | `dkss_idw` 121/121, 0,04 km | 61/61 | Kegnæs Fyr 0,2 km | Fynshav Havn I 15,9 km |
| Langeland Bagenkop (`langeland-bagenkop`) | 54,752 / 10,670 | 0,70 km | 0 % | ja (54,754) | Leuchtturm Kiel 37,9 km | `dkss_idw` 121/121, 0,05 km | 61/61 | Langø 22,1 km | Bagenkop Havn 0,2 km |
| Ærø Marstal (`aeroe-marstal`) | 54,853 / 10,523 | 0,76 km | 23 % | ja (54,854) | Schleimünde 37,1 km | `dkss_idw` (erste Antwort **429**, s. 1.3) | 61/61 | Elvira Madigan Airport 18,2 km | Bagenkop Havn 14,8 km |
| Middelfart (`middelfart`) | 55,4925 / 9,729 | 0,55 km | 0 % | ja (55,488) | Fynshav 57,7 km | `dkss_lb` 121/121, 0,02 km (`idw` gleichwertig) | 61/61 | Kolding Lufthavn 25,6 km | Fredericia Havn 7,6 km |
| Gedser (`gedser`) | 54,572 / 11,928 | 0,31 km | 0 % | ja (54,571) | Althagen 38,8 km | `dkss_idw` 121/121, 0,05 km (`nsbs` dort Land) | 61/61 | Gedser 1,1 km | Gedser Havn I 0,2 km |

**Folgen.**

- **Kein Spot fällt weg:** alle acht haben eine brauchbare Wasserzelle (≤ 0,76 km, Grenze des Katalogs 3 km; trocken
  höchstens 30 %, Grenze 50 %).
- **Nur Hvide Sande liegt außerhalb des Cubes.** Middelfart liegt mit der Marina (Lystbådehavn, 55,4925° N) knapp
  darin — der Auftrag hielt „möglicherweise außerhalb“ für denkbar; der alte Hafen (55,506° N) läge draußen.
- **BSH-Pegel mit Kurve „nahe“** (Grenze `DK_BSH_NEAR_KM` = 20 km, `set`): Rømø → List (14,5 km), Als Kegnæs →
  Kalkgrund (7,0 km; Sønderborg 14,6 km und Fynshav 15,9 km wären die dänischen Pegel im BSH-Katalog). Die übrigen
  sechs liegen 37–112 km vom nächsten Pegel ⇒ DMI DKSS.
- **Nordby (Fanø) liefert keinen Wind** (0 Werte in 3 h bei „Active“) — die Station eines Spots ist die nächste, die
  in der Messung wirklich lieferte, wie bei den POI-Stationen (SW-0).

### 1.2 DMI — was der Dienst trägt

| Frage | Befund |
|---|---|
| Host, Schlüssel | `opendataapi.dmi.dk`, **kein API-Schlüssel** (DMI: seit 02.12.2025 nicht mehr verlangt). `/grib` wird nie benutzt |
| CORS | `Access-Control-Allow-Origin: *` auf `metObs`, `oceanObs` und `forecastedr` (`/collections`, `/position`, `items`), Preflight `Allow-Methods: GET`, `Max-Age: 1800` — mit `Origin: https://buscosun.com` geprüft |
| Lizenz | **CC BY 4.0** (DMI „terms of use“): Namensnennung, Link auf die Lizenz, Änderungen angeben, kein Eindruck einer Empfehlung durch DMI. Ein fester Wortlaut der Nennung ist nicht vorgegeben ⇒ „DMI, CC BY 4.0“ je Merkmal mit Link auf Lizenz und Nutzungsbedingungen |
| Wasserstand: Collection, Parameter | Sturmflutmodell **DKSS**, Parameter **`sea-mean-deviation`** („Deviation of sea level from mean“, m), über EDR `/position` als CoverageJSON. Teilmodelle: `dkss_nsbs` (3′ × 5′ ≈ 3 sm), `dkss_idw` (0,5 sm), `dkss_ws` (Wattenmeer, 1 sm), `dkss_lb` (Kleiner Belt, 0,15 sm), `dkss_lf`, `dkss_if` |
| Bezugshöhe | In der Doku **nicht genannt**. Gemessen gegen `sealev_dvr` (Pegel in DVR90) an sechs Pegeln über die gemeinsamen 7–8 Stunden des Laufs, DKSS − Pegel im Mittel: feine Teilmodelle **−0,6 … −3,5 cm** (Bagenkop `idw` −0,6, σ 1,9; Gedser `idw` −1,5, σ 1,6; Fredericia `lb` −2,6, σ 4,9; Esbjerg `ws` −3,5, σ 13,8 — Tide), grobes Nordseegitter −0,6 (Slipshavn), −3,3 (Korsør), **−7,7** (Fredericia, Gitterpunkt 3,0 km entfernt, σ 7,6). Das Mittelwasser des Modells liegt also nahe an **DVR90**; die Anzeige nennt den Bezug als „Abweichung vom mittleren Wasserstand des Modells“ und daneben diese Messung. Ein Abend, keine Klimatologie (V-DK-2) |
| Horizont, Takt | DKSS: 4 Läufe am Tag (00/06/12/18 UTC), stündlich, 121 Werte ≙ **+120 h** ab Laufbeginn; die ersten 60 h mit HARMONIE, danach mit ECMWF angetrieben. HARMONIE DINI (`harmonie_dini_sf`, ≈ 2 km): alle 3 h, stündlich, **+60 h** (61 Werte). EDR hält nur die letzten 24 h |
| Wind (außerhalb des Cubes) | `wind-speed-10m`, `gust-wind-speed-10m`, `wind-dir-10m` in m/s bzw. Grad; die Antwort nennt den getroffenen Gitterpunkt |
| metObs | `wind_speed`, `wind_dir` (10-min-Mittel in 10 m), `wind_max` (höchstes 3-s-Mittel der letzten 10 min); Rohdaten ohne Qualitätskontrolle (DMI). 45 Stationen mit allen drei Größen im Kasten |
| oceanObs | `sealev_dvr` (cm über DVR90, 10 min) an 20 Pegeln im Kasten; `sea_reg` = Meldung der Küstenbehörde |
| Fehlerverhalten | Punkt auf Land: **200 mit lauter `null`** (kein Fehler). Unbekannter Parameter: 400 mit JSON-Körper. Zu viele Abrufe: **429 „Server is busy. Please try again later.“** — in der Messung nach ≈ 40 Abrufen in einer Minute zweimal. Antwort ≈ 6 KB je Punkt, 0,3–6 s |

### 1.3 Was daraus folgt

1. **DMI-Vorhersagen kommen über den Producer**, nicht aus dem Browser: ein Lauf holt für sechs Spots den Wasserstand
   und für einen den Wind (sieben Abrufe, nacheinander, mit Pause und drei Versuchen bei 429/5xx), prüft und schreibt
   EINE Datei `sea/v1/dmi/<stempel>.json`. Der Zeiger steht in `status.json` (`dmi`), wie beim Wind-Nachlauf.
   Der Schritt ist `continue-on-error`; fehlt ein Spot, steht er in `failed` und die Seite sagt „keine Daten“.
2. **Der DKSS-Abfragepunkt je Spot steht im Katalog** (gemessen: am Zellpunkt kann das Modell Land haben — Hvide
   Sande). Der Katalogbau liest ihn aus der Messdatei; im Producer wird nichts gesucht.
3. **Messungen liest der Browser direkt** (CORS offen, drei kleine Abrufe je Spotwahl) — nur Werte der letzten
   Stunde; sonst „keine Messung“.
4. **Wind innerhalb des Cubes** rechnet buscosun Fusion unverändert (Aufruf mit den deutschen Landesparametern);
   die Seite sagt an jedem dänischen Spot „Kalibrierung für Deutschland, in Dänemark nicht geprüft“.
5. **Kein deutscher Küsten-Warnstatus** an dänischen Spots: `coast: null`, `wodlCoast: null`; die Seite sagt, dass
   es hier keinen amtlichen Warnstatus gibt, und verlinkt DMI. DMI-Texte werden nicht wiedergegeben.

## 2. Entscheidungen

| Nr. | Frage | Entscheidung |
|---|---|---|
| **E-DK-1** | Schalter | keiner — an für alle (Jan, Ausnahme zu Rule 2). Rückfall ist der Katalog: ohne die acht Einträge ist die Seite die alte |
| **E-DK-2** | „nahe“ beim BSH-Pegel | ≤ 20 km zum nächsten Pegel MIT Kurve (`set`). Ergibt Rømø → List, Als Kegnæs → Kalkgrund |
| **E-DK-3** | Lage Middelfart | Marina (Lystbådehavn) — der Ort der Segler, und im Cube |
| **E-DK-4** | Revier | `region` bleibt das Meer (Rømø, Fanø, Hvide Sande = Nordsee; die übrigen Ostsee), dazu `country: 'DK'`. Der Chip „Dänemark“ filtert nach dem Land und stellt die Karte auf die dänischen Spots |
| **E-DK-5** | DMI-Wind am Spot | eigene Reihe aus der DMI-Datei, im Browser auf die Stundenachse des Laufs gelegt; **ohne Spanne**, als „DMI HARMONIE“ benannt; die Datei des Laufs (`spots/<lauf>.json`) bleibt wie sie ist |
| **E-DK-6** | Tidenfenster, Füllstand-Glas an DKSS-Spots | nicht in dieser Phase — beide rechnen mit Bezugshöhen eines Pegels (V-DK-3) |
| **E-DK-7** | Wo die dänischen Spots im Datenspeicher stehen | in einer **eigenen Datei** `sea/v1/static/spots-dk.json` (gleiche Form). Grund: die Seite in Produktion und der Producer auf `main` lesen bis zu Jans Push den alten Code; acht Einträge in `spots.json` hätten dort sofort dänische Spots mit deutschem Küsten-Warnstatus gezeigt. So wirkt der Push von `buscosun-web` allein, ohne Reihenfolge und ohne Handgriff im Daten-Repo, und das Entfernen der Datei ist der Rückfall der Phase |
| **E-DK-9** | Wann die neuen Spots Werte tragen | ohne Zutun erst mit dem nächsten Seegangslauf (bis 12 h nach dem Push). Deshalb baut der Producer den veröffentlichten Lauf **einmal** neu, sobald der Katalog Spots ohne Reihe trägt (82 MB Download, ≈ 1 min) — im ersten 15-min-Lauf nach dem Push, außer in der halben Stunde, in der der neue Lauf schon teilweise im DWD-Inventar steht |
| **E-DK-8** | Edge-Bündel der Vorschau | **nicht** neu gebaut (keine Edge-Function-Änderung, wie E-SW-15): `seaSpotNames.ts` trägt acht Zeilen mehr, das Bündel `netlify/edge-shared/shareParser.js` kennt sie bis zu Jans `npm run edge:share` nicht ⇒ `verify:share` 516/517, geteilte Links auf dänische Spots zeigen bis dahin die allgemeine Seewetter-Vorschau |

## 3. Umsetzung

| Datei | Rolle |
|---|---|
| `src/sea/seaDmi.ts` (neu) | **Vertrag**, importfrei: Host, Lizenz, Links; EDR- und metObs-Adressen; CoverageJSON → Einträge (`dmiCoverageOf`, `dmiWlEntry`, `dmiWindEntry`) mit benannten Gründen (`DmiAnswerError`: DMIs eigener Fehlerkörper, Land, gekürzte Spalte); Produkt `sea-dmi` + Werteprüfung; Zeiger `status.dmi`; Lesen auf der Seite (`dmiWlAt`, `dmiWindOnAxis`, `dmiObsLatest`); Katalogblock `dk` + Regeln |
| `src/sea/seaContract.ts` | `SeaSpot`: `country?: 'DK'`, `dk`, `wodlCoast … \| null`, `station.net`; `SEA_SPOT_CATALOG_DK_PATH`, `mergeSpotCatalogs`; Katalogregeln für dänische Spots |
| `scripts/sea/spots-src.json`, `build-spots.mjs` | acht Einträge mit `country: 'DK'`; der Bauer schreibt `spots.json` (56, unverändert) und `spots-dk.json` (8); `dkServing` liest Station und Versorgung aus der Messdatei, kein DLM250-Zug |
| `scripts/sea/sea-dmi.mjs` (neu) | **Producer**: je Spot ein bis zwei EDR-Abrufe nacheinander mit Pause, drei Versuche bei 429/5xx/Netzfehler; Werteprüfung je Eintrag; `dmi/<stempel>.json` + `status.dmi`; höchstens stündlich, nur bei Änderung; drei Dateien bleiben; kein Spot mit Antwort ⇒ Exit ≠ 0, Speicher unverändert |
| `scripts/sea/sea-derive.mjs` | `readCatalog` (beide Dateien); ein Spot mit `dk.wind: 'dmi'` wird von buscosun Fusion nicht gerechnet und nicht als Ausfall gezählt; **E-DK-9:** `dueRun` meldet einen veröffentlichten Lauf noch einmal als fällig, wenn der Katalog Spots trägt, die seine Spot-Datei nicht kennt (`missingSpots`) — genau EINMAL je Lauf (`status.field.rebuiltFor`, vor der Arbeit gesetzt), vom Lauf verworfene Spots zählen nicht |
| `scripts/sea/workflow-sea.yml` | Schritt „DMI“ (continue-on-error, überspringt sich ohne Producer, reicht den Exit-Code durch) |
| `src/sea/seaClient.ts` | Katalog aus beiden Dateien; `loadDmi` (frisch / veraltet nach 12 h / keine), `withDmiWind`, `loadDmiStationObs` (drei Abrufe direkt beim DMI, nur Werte der letzten Stunde) |
| `src/sea/SeaPage.tsx` | DMI-Zeiger und -Datei, Reihe mit DMI-Wind, BSH-Pegel nur wo der Katalog einen nennt, DMI-Wasserstand, DMI-Punkte als Marker, Revier „Dänemark“ mit Kartenausschnitt, Quellenliste; **eine fehlende Reihe im Lauf stürzt die Seite nicht mehr** (V-DK-1) |
| `src/sea/SeaReadout.tsx` | Karte „Wasserstand · Modell des DMI (DKSS)“, Karte „Kein amtlicher Warnstatus an diesem Spot“ statt des Küstenberichts, `findWarning` ohne Küstenblock, Quellen je Wert (Wind, Messung), Wimpel im Kopf |
| `src/sea/SeaDock.tsx`, `seaState.ts`, `SeaMap.tsx`, `seaDeck.css` | Chip „Dänemark“ (nur wenn der Katalog dänische Spots trägt), Wimpel in der Liste, Startausschnitt 12,0° O / 56,08° N (vorher 11,6 / 55,9), Stile `sw-dk-*` (mobil per Media Query) |
| `scripts/sea/gen-spot-seo.mjs`, `gen-spot-names.mjs`, `src/sea/seaSpotFacts.ts`, `seaSpotNames.ts`, `seaSeoText.ts`, `seaSeo.ts`, `seaLink.ts`, `src/seo/routeTexts.ts`, `scripts/seo/content.mjs`, `netlify.toml` | acht Spot-Seiten mit eigenem Text (`textOfDk`), Verzeichnis-Abschnitt „Dänemark“, Sitemap (64 Spots), acht Rewrites; sechs deutsche Steckbriefe nennen jetzt einen dänischen Nachbarspot |
| `scripts/verify-sea-dk.mjs` (neu), `scripts/lib/fixtures/sea/dk/`, `.gitattributes`, `scripts/sea/spike/dk-probe.mjs`, `dk-record-fixtures.mjs` | Prüfer + 14 Fixtures (byte-gleich, `-text`), Messwerkzeug und Aufzeichner. Nicht im CI-Gate eingetragen (Workflows von `buscosun-web` bleiben Jans Schritt, §92.6) |
| `docs/API.md` §8.11, `docs/DATA_SOURCES.md`, `scripts/repack-repo/README.md` | Quelle DMI, neue Dateien im Daten-Repo |

**Gestaltung** (Command-Deck, Skill `frontend-design`): ein neues Zeichen, der Gastland-Wimpel (Dannebrog, 15 × 11 px, CSS)
am Namen jedes dänischen Spots; alles andere nutzt vorhandene Karten, Chips und das Wasserstands-Diagramm. „Kein
Warnstatus“ ist eine neutrale Karte mit gestricheltem Rand, kein Bernstein — eine Abwesenheit, keine Meldung. Die beiden
DMI-Links dort sind 44 px hoch.

## 4. Gates (18.11.2026)

| Gate | Beleg |
|---|---|
| `verify:sea-dk` | **70/70** — A Fixtures byte-gleich (sha256, Gegenprobe gekipptes Bit); B Vertrag an echten Antworten, Land, DMIs 429-Körper, drei verfälschte Antworten; C Katalog (Spot außerhalb des Cubes, Spot ohne Pegel, fünf Gegenproben auf die Regeln, Katalog = Messung); D Producer gegen einen DMI-Nachbau (Datei, Zeiger, 60 min, unverändert, Ausfall an einem Spot mit drei Versuchen, Land, Totalausfall ⇒ rot und Speicher unverändert, Kill-Schalter, Aufbewahrung, Nachbau des Laufs bei gewachsenem Katalog genau einmal, ohne dänische Datei kein Abruf); E Seite ohne Browser (DMI-Wind Wert für Wert, keine Spanne, kein alter Wert, Stundenwert, 12-h-Regel, Messung aus echter Antwort, älter als 1 h ⇒ keine, leere Station, 429); F Quelltext (einziger Datenhost, kein `/grib`, kein Schlüssel — mit Gegenprobe —, Vermerk, kein „sicher“, Workflow-Schritt, kein Schalter) |
| ein lokaler `build-spots`-Lauf | 64 Spots, 0 Befunde; die 56 deutschen Einträge und `areas.json` **byte-gleich** mit dem Stand im Daten-Repo; `spot-geo.json`: die 112 vorhandenen Einträge unverändert übernommen, 16 neu |
| ein lokaler Producer-Lauf | `sea-dmi.mjs` gegen den echten Dienst: 6 Wasserstände, 1 Wind, 0 ausgefallen, 3 980 B, zweiter Durchgang „jünger als 60 min“. `sea-derive.mjs` Lauf 2026111712 mit allen 64 Spots (Cube über das CDN): 13,53 MB, 58 s, Wind buscosun Fusion 14 an **63/64** (Hvide Sande übersprungen, nicht als Ausfall gezählt), Spanne an 63, 0 Spot-Befunde. Nachbau-Regel am echten Inventar: Speicher mit dem Live-Lauf (56 Spots) und der dänischen Datei ⇒ `--check` meldet `{"due":"2026111712","rebuild":8}`, ohne die Datei „schon veröffentlicht“ |
| bestehende `verify:sea-*` | contract ✓ · text ✓ · decode ✓ · derive **70/70** · waterlevel **63/63** · tide-window ✓ · wind-band ✓ · planner **46/46** · seo **23/23**. `verify:sea-ui` (Browser) **nicht gelaufen** — Jans Entscheidung, keine Browser-Prüfung; an HEAD stand er rot (V-TF-5) |
| `npm run typecheck` | 0 |
| `npm run build` | grün, 280/280 Prüfungen des SEO-Baus; 64 Spot-Shells, `sitemap-seewetter.xml` 65 Adressen |
| `npm run budget` | grün nach Anheben von Hand mit Notiz in `budget.json`: totalJs **1 985,0 / 1 986** (Grenze 1 985 → 1 986). Gemessen am sauberen HEAD `b08a6887` (eigener Bau aus `git archive`) **1 976,3** ⇒ die Phase kostet **+8,7 KB** gzip, fast ganz in lazy Chunks; eagerJs 114,4 → **114,6 / 115** (acht Zeilen der Namenstabelle im Teilen-Pfad), eagerCss 2,4 / 2,5, largestChunk 278,4 / 302 |
| `verify:share` | **516/517** — rot genau SH6, die Bytegleichheit des Edge-Bündels (E-DK-8, Jans `npm run edge:share`) |
| Sichtprüfung | **keine** — weder Bild noch Browser (Jans Entscheidung 18.11.). Die Fragen 2 (Desktop pixelgleich), 3 (Touch-Ziele am Gerät), 4 (Konsole) und 5 (Long Tasks) der Selbstverifikation sind damit **unbeantwortet**; Frage 1 (Funktionserhalt) nur am Quelltext und an den Prüfern |

Zwei Dinge, die die bestehenden Prüfer gefunden haben und die ich angepasst habe, statt die Prüfer zu ändern: die
Untertitel der Schalter „Messstationen“/„Wasserstand“ bleiben ohne dänische Spots wörtlich die alten (`verify:sea-waterlevel`
G2), und die neuen Stile stehen vor dem Planer-Abschnitt, damit dessen Media Query die letzte bleibt (`verify:sea-planner`
H10). Geändert habe ich einen Prüfer: `verify:sea-derive` N4 vergleicht die Handliste jetzt mit beiden Katalogdateien.

## 5. Daten-Repo (`buscosun-data`, nur `sea/` und `sea.yml`, ohne Force)

| Commit | Inhalt | Prüfung nach dem Push |
|---|---|---|
| `8c16adbf` (18.11. ≈ 02:51 UTC) | `sea/v1/static/spots-dk.json` (neu, 5 008 B), `sea/v1/static/spot-geo.json` (+16 Einträge) | raw und jsDelivr `@8c16adbf` 200; sha256 gleich den lokalen Dateien (`cfac53f1…`, `dd3b72fa…`); `spots.json` unverändert (`32446b5d…`); im Commit genau diese zwei Dateien |
| `550b09e5` (18.11. 02:53 UTC) | `.github/workflows/sea.yml`: Schritt „DMI“, Bedingung des Fehlerschritts, eine Kopfzeile (+25/−2) | raw `@550b09e5` sha256 gleich der lokalen Datei; Workflow `active`; ein Push wurde abgelehnt (Cron dazwischen) ⇒ `checkout --detach` auf den neuen Stand, `cherry-pick`, zweiter Versuch grün |

**Erster Lauf mit dem neuen Schritt:** `sea` Nr. 3432 (18.11. 03:15:45 UTC, GitHub-API `actions/runs/44229158862/jobs`):
Job `success` in 55 s; Schritt 13 „DMI (water level and wind for the Danish spots)“ `success` (überspringt sich, der Producer
liegt noch nicht auf `main`), „Publish“ `success`. Danach: `spots-dk.json` weiter 200 / 5 008 B auf `main` (der Publisher legt
den ganzen Speicher zurück, die Datei bleibt), `spots.json` 25 567 B unverändert, `status.json` ohne `dmi` (erwartet),
`lastPublishedRun` 2026111712 wie zuvor.

Die Live-Datei `sea.yml` trug die Zeilen `sparse-checkout set point ruc` der Vorlage **nicht** (offener Schritt aus §78,
buscosun Fusion 14). Ich habe nur die Hunks dieser Phase auf die Live-Datei gesetzt; der Unterschied steht unverändert da.
Kein Push in `buscosun-archiv`. Keine DMI-Datei von der lokalen Maschine: der Producer auf `main` schreibt sie nach Jans
Push im nächsten 15-min-Lauf.

## 6. Befunde

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| **V-DK-1** | `SeaPage` baute die Stunden eines Spots mit `hourOf(…)!` — ein Spot im Katalog ohne Reihe im veröffentlichten Lauf (jeder neue Spot bis zum nächsten CWAM-Lauf, jeder vom Producer verworfene) hätte die Seite mit einem TypeError beendet. **Behoben:** der Spot zeigt „trägt der veröffentlichte Seegangslauf noch keine Stundenreihe“ | — |
| **V-DK-2** | Die Bezugshöhe des DKSS ist an einem Abend gemessen (sechs Pegel, 7–8 h) | Mehrwert: ein belastbarer Satz statt „nahe an DVR90“. Skizze: im Archiv-Workflow täglich `sealev_dvr` der Pegel neben dem Modell ablegen, nach 30 Tagen Mittel und Streuung je Teilmodell |
| **V-DK-3** | Tidenfenster und Füllstand-Glas gibt es an den sechs DKSS-Spots nicht (E-DK-6) | Mehrwert: „mindestens 40 cm“ auch in Marstal oder Gedser. Skizze: Schwelle gegen das Modell-Mittelwasser als eigener Bezug in `tideWindow.ts`; Messreihe des nächsten DMI-Pegels (`sealev_dvr`, CORS offen) als gemessene Linie |
| **V-DK-4** | **geschlossen (BS-N, 21.11., `b0083b33`; Jans Freigabe für die Küstendateien vom 21.11.; Beleg `audit/seewetter-binnenseen.md` §8.1 und `seewetter-daenemark/coast-dir-probe.mjs` / `.json`).** Die Ursache ist gemessen (V-BS-1): buscosun Fusion nennt an Stunden, die es zwischen zwei eigenen Schritten interpoliert, nie eine Richtung. Diese Stunden sind jetzt in `spots/<lauf>.json` und `spots/<lauf>-w<t1>.json` gefüllt — auf dem kürzeren Bogen zwischen den beiden Schritten, höchstens 90° auseinander (`fillLakeDir`, `set`), gezählt und benannt in `wind.dirFill`; buscosun Fusion ist nicht angefasst. Im Lauf 2026112112: 108 Stunden an 6 Spots (Fanø, Bagenkop, Marstal, Middelfart, Gedser je 18 ab +52 h, dazu Sylt Hörnum), keine andere Stunde verändert; die Stunden hinter der Sperre des Motors (schwacher Wind) bleiben leer. Wirkt mit Jans Push und dem ersten Lauf danach. Ursprünglicher Befund: Im Lauf 2026111712 trägt buscosun Fusion an fünf dänischen Spots (Fanø, Bagenkop, Marstal, Middelfart, Gedser) ab etwa +38 h nur jede dritte Stunde eine **Windrichtung** (19–22 von 65 Stunden leer; Rømø und Als Kegnæs, mit MOSMIX-Station in Reichweite, tragen alle). An deutschen Spots fehlen 0–22 Stunden. Die Seite zeigt dort „aus –“ und klassifiziert den Uferwinkel nicht | Kein Eingriff in buscosun Fusion in dieser Phase. Skizze: Richtung zwischen den Dreistundenwerten über u/v interpolieren (Motor, eigene Phase) oder an diesen Stunden die HARMONIE-Richtung als benannte zweite Quelle |
| **V-DK-5** | Die Windkurve von Rømø springt im Dreistundentakt (Rauigkeit 0,63 m/s gegen Median 0,25) — dieselbe Erscheinung wie an Juist (0,62) und Norddeich (0,61), also Bestand des Motors, in Dänemark aber ohne geprüfte Kalibrierung | Der Hinweis „Kalibrierung für Deutschland, in Dänemark nicht geprüft“ steht an jedem Wert. Skizze: Gate D für Dänemark — DMI-Stationen der Spots ins `sea-archiv` (V-DK-6), dann Bias/MAE wie an der deutschen Küste |
| **V-DK-6** | Für die dänischen Spots sammelt das Archiv keine Messungen (`sea-archive.mjs` liest nur DWD-POI) | Skizze: `metObs` der acht Stationen alle 6 h ablegen (CC BY 4.0), `sea-gate-d.mjs` um das Netz `dmi` erweitern |
| **V-DK-7** | Nordby (Fanø, 2,4 km) meldet „Active“ und liefert keinen Wind — Fanø misst an Esbjerg Lufthavn, 17 km | Steht so in Katalog und Text. Skizze: die Stationswahl im Producer wöchentlich nachmessen statt einmal im Katalogbau |
| **V-DK-8** | `status.gauges.at` ändert sich in jedem 15-min-Lauf und steht nicht in `SEA_STATUS_VOLATILE` — der Publisher committet deshalb jeden Durchgang (≈ 96 Commits am Tag), entgegen E-SW-29. Bestand, beim Lesen gefunden | Skizze: `gauges.at` in die Liste der flüchtigen Schlüssel aufnehmen oder nur bei `changed` schreiben |
| **V-DK-9** | Die Phase kostet 8,7 KB gzip, `totalJs` liegt danach 1,0 KB unter der angehobenen Ratsche, `eagerJs` 0,4 KB unter seiner | Mehrwert: Luft für die nächste Phase. Skizze: die acht dänischen Steckbrief-Texte teilen drei lange Absätze mit den deutschen — als gemeinsame Bausteine in `seaSeoText.ts` spart das etwa 1 KB |
| **V-DK-10** | Die Schritte „Texts“ und „Gauges“ der Vorlage reichen den Exit-Code des Producers nicht durch (`\| tee` ohne `pipefail`) — sie können nicht rot werden. Der neue DMI-Schritt tut es | Skizze: beide Schritte wie den DMI-Schritt schreiben (Workflow, Jans Gate) |
| **V-DK-11** | Die Lagen von Rømø (Lakolk), Fanø Bad und Ærø Marstal sind von Hand gesetzt, ohne Anker an einer Station; „≈ 100–500 m“ wie in der Handliste, aber nicht nachgemessen | Jans Blick auf die Karte; Skizze: Küstenlinie Dänemarks (Dataforsyningen, CC BY 4.0) für einen Zug wie E-SW-31 |
| **V-DK-12** | Ein DMI-Wasserstand „für“ Hvide Sande kommt vom Gitterpunkt 3,2 km südlich vor der Küste (das grobe Nordseemodell hat am Ort Land); die Karte nennt die Entfernung | — |
