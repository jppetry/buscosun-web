# Phase BS — Binnenseen auf `/seewetter`

> **Auftrag Jan, 2026-11-21:** die 28 größten Seen in Deutschland, Österreich und der Schweiz mit rund 70 Spots auf
> `/seewetter`. Wind, Böen, Bandbreite, Sicht- und Schauerhinweis aus buscosun Fusion auf dem Punkt-Cube wie an der
> Küste, aber auf der Höhe des Seespiegels. Kein Schalter, an für alle (Jans Entscheidung, Ausnahme zu Rule 2);
> Rückfall: `sea/v1/static/spots-lakes.json` im Daten-Repo löschen. Kein Eingriff in buscosun Fusion, keine Edge
> Function, kein Shader, keine neue Abhängigkeit. Die Sichtprüfung im Browser macht Jan selbst — hier gibt es deshalb
> **keine** Bilder und keinen UI-Beleg.

Messtabellen (erzeugt, keine Zahl von Hand): [`seewetter-binnenseen/tabellen.md`](seewetter-binnenseen/tabellen.md).

## 1. Diagnose — Schritt 0, gemessen am 21.11.2026 08:40–10:25 UTC

Werkzeuge: `scripts/sea/spike/lake-probe.mjs` (Messung, Ergebnis `audit/seewetter-binnenseen/spike/lake-probe.json`,
Rohantworten unter `spike/raw/`), `scripts/sea/build-lake-spots.mjs` (Umrisse, Uferpunkt, Fetch),
`audit/seewetter-binnenseen/fusion-lake-stations.mjs` (buscosun Fusion gegen Seestationen). Die Regeln der Messung
stehen im Kopf der Werkzeuge und wurden vor dem jeweiligen Lauf geschrieben.

### 1.1 Was die Seite heute für einen Spot braucht — und was ein See nicht hat

Ein Spot der Küste hängt an einer **Wasserzelle des Wellenmodells CWAM** (`cell`): daraus kommen Seegang, Ufernormale
(Modellmaske), der Punkt, an dem buscosun Fusion rechnet (Zellmitte, Höhe 0), Seegebiet und Küstenabschnitt des
Seewetterdienstes, die DWD-POI-Station. Alle Reihen eines Laufs stehen in `spots/<lauf>.json`. Ein See hat nichts
davon: kein Wellenmodell, keinen amtlichen Seewetterbericht, keinen Tidenpegel, keine Strömung. Was an seine Stelle
tritt, ist in dieser Phase der **Umriss des Sees** (Uferpunkt, Ufernormale, Wasserpunkt, Fetch je Windrichtung), der
**Seespiegel** (Rechenhöhe) und — wo es sie gibt — die **DWD-Warnzelle für Binnenseen**.

### 1.2 Umrisse (ohne OSM, ohne Anmeldung)

| Quelle | Zugang (gemessen) | Seen | Lizenz / Nennung |
|---|---|---|---|
| BKG DLM250, `dlm250:objart_44006_f` (stehendes Gewässer) | WFS `sgx.geodatenzentrum.de/wfs_dlm250`, GeoJSON, Rahmen + Name | 12 Seen ganz in Deutschland | dl-de/by-2-0, „© GeoBasis-DE / BKG (Jahr des letzten Datenbezugs)“ |
| swisstopo swissTLM3D Gewässernetz (`ch.swisstopo.swisstlm3d-gewaessernetz`) | `api3.geo.admin.ch … /find` nach Name, GeoJSON | 9 Seen ganz in der Schweiz | freie Nutzung, Quellenangabe „© swisstopo“ |
| Copernicus EU-Hydro River Network Database, Ebene 2 „InlandWater“ | ArcGIS REST der EEA (`image.discomap.eea.europa.eu`), Punktabfrage, GeoJSON | 3 Seen in Österreich und die 4 Grenzseen (Bodensee, Genfersee, Lago Maggiore, Luganersee) — je EIN Polygon mit dem fremden Ufer | frei bei Quellenangabe, Angabe von Änderungen, kein Eindruck einer Empfehlung der EU |

Befunde am Umriss: DLM250 teilt Müritz (5 Teile), Schaalsee (12), Schweriner See und Ammersee (je 2) in Teilflächen —
der Fetch behandelt sich berührende Teile als ein Wasser. EU-Hydro kennt vom **Neusiedler See nur die offene
Wasserfläche** (141 km² gegen 320 km² mit Schilfgürtel) und dazu 23 Tümpel und Kanäle im Schilf, die als eigene Teile
weggelassen werden (unter 5 % der größten Teilfläche): ein Spot gehört ans offene Wasser. Alle anderen Umrisse liegen
0–7 % unter der Fläche der Quelle. Namen sind in EU-Hydro unzuverlässig (Neusiedler See „UNK“) ⇒ Auswahl per Punkt.

### 1.3 Lagen der 70 Spots

Lagen von Hand, auf die Uferlinie gezogen: **im Median 103 m, höchstens 535 m** (Walenstadt; Grenze 1 500 m). Gegenprobe
gegen die Koordinate des Wikipedia-Artikels des Orts fand **zwei falsch gesetzte Lagen** (Alt Schwerin 4,1 km, Kummerow
4,5 km — beide korrigiert, Alt Schwerin liegt 1,5 km vom Ufer und steht jetzt am Ufer südlich des Orts) und drei
erklärte Abstände (Schwerin = Zippendorf, 3,9 km vom Zentrum; Mörbisch = Seebad am Ende des Damms, 2,5 km; Weißenbach:
der Artikel leitet auf Steinbach um). Rust liegt in einer vom Schilf umschlossenen Bucht — der Fetch dort ist höchstens
0,8 km, die Schätzung gilt für die Bucht.

### 1.4 buscosun Fusion am Wasserpunkt (Cube über das CDN, Stufe des aktuellen Stands = 14)

| Frage | Befund |
|---|---|
| Liegen alle Wasserpunkte im Cube? | ja, 70 von 70 (`CUBE_DOMAIN`) |
| Wind und Böe | an allen 70 Punkten an **80 von 80** Stunden |
| Höhe | der Geländeleser findet am Wasserpunkt **−6 … +1 m** gegen den Seespiegel der Quelle (das Höhenmodell kennt die Seefläche). Die Rechenhöhe steht trotzdem ausdrücklich im Katalog (`lake.elevM`, `static/lake-geo.json`) |
| **Windrichtung** | fehlt an vielen Stunden: an 14 Spots ≥ 72 von 80 Stunden, an 17 Spots 40–71, an 30 Spots 10–39, an **9 Spots unter 10** (Lago Maggiore 1–2, Thunersee 3, Zugersee 3–8, Vierwaldstättersee 4–20, Zürichsee 6–12). Norddeutsche Seen 67–80. Bestand des Motors (wie V-DK-4 an der Küste, in den Alpen viel häufiger), hier nicht angefasst ⇒ V-BS-1 |
| Zeit | ≈ 0,25 s je Spot, ein Lauf der Seen 18 s |

Folge für die Seite: ohne Windrichtung gibt es keinen Fetch und keine Seite zum Ufer. Die Windwelle wird dann als
**Obergrenze über die längste Strecke** gezeigt („höchstens …, Richtung nicht bestimmt“), die Lage zum Ufer als „keine
Richtung“ — nie eine erfundene Richtung.

### 1.5 Stationen (obs/v1)

Nächste Station, die Wind UND Böe in den letzten 90 Minuten lieferte, höchstens 25 km entfernt und höchstens 150 m über
oder unter dem Seespiegel (`set`; ohne die Höhenregel wäre der Feuerkogel, +1 196 m, die „Station am Traunsee“, der
Monte Generoso, +1 329 m, die von Morcote): **69 von 70 Spots**, im Median 7,6 km, 24 Spots ≤ 5 km, höchstens 23,4 km.
Mardorf (Steinhuder Meer) hat keine (Hannover 25,4 km). Tabelle je Netz: `tabellen.md` §3.

### 1.6 buscosun Fusion gegen zehn Seestationen (Prüfstand, kein neuer Lauf)

Konserve `fusion-12x` (= buscosun Fusion 13; Wind und Böe von 14 sind byte-gleich), 38 Ausgaben 14.09.–21.10.2026,
Vorlauf 1–48 h, Wahrheit W1. Zehn Stationen des Prüfnetzes an sieben Seen (Bregenz, Konstanz, Lugano, Chieming,
Wädenswil, Waren, Altdorf, Luzern, Neuchâtel, Neusiedl), 0,6–2,3 km vom Spot.

| Größe | Vorlauf | Fälle | Messung | Bias | MAE | in q10–q90 |
|---|---|---|---|---|---|---|
| Wind | 1–48 h | 16 766 | 3,5 kn | +0,3 kn | 1,4 kn | 86,5 % |
| Böe | 1–48 h | 16 766 | 7,6 kn | +0,5 kn | 2,3 kn | 83,2 % |

Je See (`tabellen.md` §4): Wind-Bias −0,7 kn (Chiemsee) … **+1,8 kn (Neusiedler See, 7–48 h +2,0 kn, nur 68 % in der
Spanne)**; Böen-Bias −1,2 kn (Chiemsee, 1–6 h −2,0 kn, 69 % in der Spanne) … **+3,0 kn (Zürichsee, 72 % in der
Spanne)**. **Grenzen:** Herbst, schwacher Wind (Mittel der Messung 3,5 kn) — über Starkwind auf dem See sagt die Messung
nichts; Landstationen am Ufer, nicht der Wasserpunkt; Entwicklungsmenge, kein Abnahme-Urteil. Deshalb bleiben die
Profilklassen an Seen aus (`LAKE_VERDICTS = false`, E-BS-2).

### 1.7 Amtliche Warnungen des DWD für Binnenseen

- Der Warn-Layer liest genau eine Datei: `…/alerts/cap/DISTRICT_DWD_STAT/Z_CAP_C_EDZW_LATEST_PVW_STATUS_PREMIUMDWD_DISTRICT_DE.zip`
  (`src/sources/dwdCapAlerts.ts`). **Diese Datei trägt die Seewarnungen mit** (Flächen als Polygone neben den
  Landkreisen); eine andere Datei wird nicht gebraucht und nicht gelesen.
- **Warnzellen beginnen mit 2**, nicht mit 9 (CAP-Profil: Typ 2 = Seen). 25 Zellen in der Zellliste, 23 mit Geometrie
  (`dwd:Warngebiete_Binnenseen`, byte-gleich abgelegt als Fixture). Von den 28 Seen liegen **sieben** in einer Zelle:
  Bodensee (West 208439000, Mitte 208438000, Ost 208440000), Chiemsee, Starnberger See, Ammersee, Müritz, Steinhuder
  Meer, und über „Ostholsteinische Seen“ (201068000) der Große Plöner See und der Selenter See. Bregenz, Romanshorn
  und Kreuzlingen liegen in den Bodensee-Zellen des DWD.
- Ereigniscodes: dokumentiert für Binnenseen 57 STARKWIND und 58 STURM (`warning_codes_pdf`); **gemessen** in 49
  Stundenständen der Datei (19.–21.11.): 57 (Bodensee-West), 58 (Bodensee-Ost und -Mitte) und — für die
  niedersächsischen Seen — **51 WINDBÖEN** als Fläche in einer gewöhnlichen Windwarnung. Eine Warnung gehört also über
  ihre **Zelle** zum See, nicht über den Code. Je ein aufgezeichnetes Beispiel liegt bei den Fixtures. Am 21.11. um
  08:45 UTC war keine Seewarnung aktiv.

### 1.8 Wasserstand und Wassertemperatur

| Quelle | Befund (gemessen) | Urteil |
|---|---|---|
| WSV PEGELONLINE | fünf Pegel an den Seen: Konstanz (Bodensee, `W`), Waren (Müritz, `W`, `WT`), Plau Oberpegel (Plauer See, `W`, `WT`), Schwerin Werderbrücke (`W`, `WT`), Aalbude (Kummerower See, `W`). `W` alle 15 min, `WT` stündlich, CORS offen, DL-DE Zero 2.0. Keiner an Steinhuder Meer, Plöner See, Schaalsee, Selenter See, Kölpinsee, Chiemsee, Starnberger See, Ammersee | nutzbar, live im Browser (vorhandener Weg) |
| Alplakes (Eawag) | 1D-Modell Simstrat für 139 Seen, **18 der 28** (22 Becken; es fehlen Neusiedler See und die neun norddeutschen Seen), 3-stündlich, Vorhersage bis +4 Tage. **Lizenz in der API-Doku: CC BY 4.0**, Nennung „Data: Alplakes, Eawag (CC BY 4.0)“; In-situ-Daten Dritter bleiben bei deren Lizenz (werden nicht gelesen). **CORS nur für eine Liste von Ursprüngen** (Vorabfrage von `buscosun.com`: 400 „Disallowed CORS origin“) ⇒ nur über den Producer. Drossel: 429 dokumentiert, in der Messung nicht gesehen; die Doku verlangt einen beschreibenden User-Agent mit Kontakt und bittet, nicht öfter zu fragen, als die Daten sich ändern. Kein Wasserstand | nutzbar als **Modell**, höchstens alle 6 h, ein Abruf je Becken |
| BAFU über LINDAS | SPARQL (`lindas.admin.ch/query`, Graph `…/foen/hydro`): 34 Seestationen, alle mit Pegel in m ü. M., **keine mit Wassertemperatur** (die 84 Temperaturreihen des Graphen stehen an Flüssen). Aktualisierung alle 10 min, CORS spiegelt den Ursprung, Lizenz im Datensatz „Open use“ (frei, auch kommerziell, Quellenangabe nicht verlangt) | nutzbar, **nur Pegel**, live im Browser |
| GKD Bayern | Pegel und Temperatur an Chiemsee (Stock), Starnberger See, Ammersee (Stegen) als HTML-Tabellen; Lizenz CC BY 4.0, aber wörtlich „Derzeit gibt es noch keine Public-API für eine maschinenlesbare Bereitstellung der Daten“, der Download ist ein Formular, das `robots.txt` ausschließt | **nur Link** (kein dokumentierter Abruf) |
| Hydro OÖ, Wasserportal Burgenland, Landesportale NI/SH/MV, Seewarnungen MeteoSchweiz, Sturmwarndienste in Österreich | nicht geprüfte Lizenz oder kein offener Abruf (Vorgabe des Auftrags) | **nur Link, nie gespeichert** |

Folge: **gemessene Wassertemperatur** gibt es nur an Müritz, Plauer See und Schweriner See (WSV); an allen anderen
Seen steht „keine Station in der Nähe“. **Modell** an 18 Seen (Alplakes). **Pegel** an Bodensee und den vier
norddeutschen Seen (WSV) und an 13 Schweizer Seen (BAFU); an den österreichischen und bayerischen Seen keiner.

### 1.9 Was daraus folgt

1. **Die Seen sind ein eigenes Produkt**, keine Zeilen in `spots/<lauf>.json`: `lakes/<lauf>-w<t1>.json` auf der
   Stundenachse des veröffentlichten Seegangslaufs (die Seite liest sie wie jeden Spot), gerechnet bei jedem neuen
   t1-Lauf des Cubes und nach jedem neuen Seegangslauf. Damit ist die Byte-Gleichheit der Küstenreihen eine Eigenschaft
   des Aufbaus und wird im Prüfer trotzdem gemessen (mit Gegenprobe).
2. **Der Katalog ist eine eigene Datei** (`static/spots-lakes.json`, Muster E-DK-7): die Seite in Produktion und der
   Wellenproducer sehen bis zu Jans Push nichts davon; löschen ist der Rückfall.
3. **Die Windwelle rechnet die Seite**, als reine Funktion aus Wind, Windrichtung, Fetch-Tabelle und mittlerer Tiefe —
   nichts davon steht in einer Datei, es gibt kein Kartenfeld.
4. **Warnungen kommen aus der Datei, die der Warn-Layer schon liest**, und werden über die Zelle dem See zugeordnet.

## 2. Entscheidungen

| Nr. | Frage | Entscheidung |
|---|---|---|
| **E-BS-1** | Schalter | keiner — an für alle (Jan, Ausnahme zu Rule 2). Rückfall: `sea/v1/static/spots-lakes.json` im Daten-Repo löschen ⇒ kein Seespot, kein Lauf des Seen-Producers, die Seite ist die von heute. Producer-Schalter `SEA_LAKES=0` (ganze Linie), `SEA_LAKES_WT=0` (nur Alplakes) |
| **E-BS-2** | Profilklassen an Seen | **aus** (`LAKE_VERDICTS = false`, `set`), bis die Windprüfung von §1.6 auf 14 Tagen Archiv der Seereihen wiederholt ist und Jan entscheidet. Die Seite des Winds zum Ufer und das Tageslicht bleiben |
| **E-BS-3** | Umrissquelle je See | DLM250 für Seen ganz in Deutschland, swisstopo für Seen ganz in der Schweiz, EU-Hydro für Österreich und alle Grenzseen (ein Polygon mit dem fremden Ufer; die Vorgabe „EU-Hydro für die fremden Ufer“) |
| **E-BS-4** | Wellenformel | Shore Protection Manual 1984 (USACE/CERC), Band I, Kapitel 3: Windschubfaktor (3-28a), Tiefwasser (3-33), (3-34) mit der voll entwickelten See als Deckel (3-36), (3-37) über 90 m, konstante Tiefe (3-39), (3-40) bis 90 m; Fetch als Mittel aus neun Strahlen im Abstand von 3° (S. 3-41). `literature`. Geprüft an den Rechenbeispielen 4 und 5 des Handbuchs (Beispiel 5 am Scan gelesen: `seewetter-binnenseen/spm1984-s3-66.jpg`). Gesetzt (`set`): die mittlere Tiefe des ganzen Sees als konstante Tiefe; Stabilitäts- und Lagefaktor 1; keine Prüfung der Winddauer (die Schätzung gilt für anhaltenden Wind) |
| **E-BS-5** | Stunden ohne Windrichtung | Windwelle als Obergrenze über die längste Strecke der Tabelle, in Worten „höchstens“; Lage zum Ufer „keine Richtung“ |
| **E-BS-6** | „Station am See“ | ≤ 25 km und ≤ 150 m über/unter dem Seespiegel (`set`), die nächste liefernde aus obs/v1 |
| **E-BS-7** | Böenhinweis | „Böen ab 25 kn“ / „ab 34 kn“ am Mittelwert der Böe von buscosun Fusion (`set`), mit dem Zusatz, dass er nicht amtlich ist; getrennt von der Warnkarte |
| **E-BS-8** | Wassertemperatur | Messung nur von der WSV-Station AM See (≤ 1 km vom Umriss) und ≤ 20 km vom Spot; Modell = Alplakes Simstrat in 1 m Tiefe je Becken; nie gemischt, „keine Station in der Nähe“, wo keine ist. GKD nur als Link |
| **E-BS-9** | Pegel | nur als Auskunft (aktueller Wert, Zeit, Bezug): WSV in cm über Pegelnull, BAFU in m ü. M. Kein Tidenfenster, kein Füllstand-Glas, keine Strömung, kein Küstentext an Seespots |
| **E-BS-10** | Ufer außerhalb DE/AT/CH | Landesparameter des nächsten der drei Länder mit Vermerk (`lakeForeignNote`); von den 70 Spots liegt keiner an einem fremden Ufer, die Regel greift bei Etappen über den See |
| **E-BS-11** | Windpartikel auf der Seekarte | **nicht gebaut — Jans Entscheidung nötig.** Die Seewetter-Karte trägt bisher keine eigene Ebene in der GL-Pipeline (nur Symbol- und Bildquellen); die Windpartikel der Wetterkarte (`WindLayer`) hier einzuhängen ist ein Eingriff in die WebGL-Pipeline (STOPP-Grenze) und ohne Sichtprüfung nicht zu verantworten. Die Seen zeigen Seefläche, Spots und die vorhandenen Windpfeile an den Spots |

## 3. Umsetzung

| Datei | Rolle |
|---|---|
| `src/sea/seaLakes.ts` (neu) | **Vertrag**, importfrei: Pfade, `LAKE_VERDICTS`, Böenhinweis, Katalogregeln (`lakeBlockProblems`, `lakeTableProblems`), Produkt `sea-lakes-series` mit Wertsperre und Zeiger `status.lakes`, Übernahme früherer Stunden (`carryLakeColumn`), Messung der Seestation aus obs/v1 (`lakeObsOf`: veraltet, unplausibel, Böe unter Wind), Alplakes (Adresse, `alplakesBasinOf`, Produkt `sea-lakes-watertemp`, Zeiger `status.lakesWt`), WSV- und BAFU-Leser, die nur verlinkten Quellen |
| `src/sea/lakeWave.ts` (neu) | **Windwelle**, reine Funktion nach dem Shore Protection Manual 1984 (E-BS-4), Fetch-Tabelle |
| `src/sea/lakeView.ts`, `lakeWarn.ts`, `lakeClient.ts` (neu) | Schätzung je Stunde (mit Obergrenze ohne Richtung), Böenhinweis voraus, Fetch-Rose; Auswahl der DWD-Seewarnungen über die Zelle, wörtlich; Browser-Leser (Umrisse, Modelltemperatur, WSV, BAFU, Warndatei des Warn-Layers) |
| `src/sea/SeaLakeReadout.tsx` (neu, eigener Lazy-Chunk) | **Dossier eines Seespots** statt `SeaReadout`: Kopf, Warnkarte, Wind/Böen/Windwelle mit Fetch-Rose, Verlauf, Sicht-Hinweis, Wasser (Naht Messung \| Modell, Pegel), Quellen nur dieses Sees |
| `src/sea/seaContract.ts` | `SeaRegion` + `binnensee`, `SeaSpot.cell` optional, `lake`, `normalFrom: 'outline'`, `station.net: 'obs'`; `mergeSpotCatalogs(base, dk, lakes?)`, `spotWaterPoint`, Seespot-Zweig in `spotCatalogProblems` |
| `src/sea/seaClient.ts` | Katalog aus drei Dateien (Seen nur mit gültiger Seetabelle), `loadLakes`, `withLakes` (Seereihen auf derselben Stundenachse, Wellenspalten leer), Stationsmessung `net: 'obs'` direkt aus obs/v1 |
| `src/sea/SeaPage.tsx`, `SeaDock.tsx`, `SeaTripPanels.tsx`, `SeaMap.tsx`, `seaState.ts`, `seaDeck.css` | Zeiger und Dateien der Seen, Revier „Seen“ mit einem Chip je See, Kartenfläche der Seen (Füll- und Linienebene aus `static/lakes.json`), Seen-Dossier, Karte am Spot mit geschätzter Windwelle, Quellenliste; kein BSH-Pegel an Seespots; Stile `sw-lk-*` vor dem Planer, mobil per Media Query |
| `src/sea/seaVerdicts.ts`, `seaPlanner.ts`, `seaTrip.ts`, `seaTripData.ts`, `useSeaTrip.ts`, `seaOwnPoint.ts`, `SeaReadout.tsx` | keine Klasse an Seespots (`LAKE_VERDICTS`), Uferseite und Tageslicht bleiben; Boot, Etappenpunkt und Punktsuche über `spotWaterPoint`; Etappe mit den Landesparametern des Sees; Typen |
| `scripts/sea/lakes-src.json` (neu), `build-lake-spots.mjs` (neu) | Handliste (28 Seen, 70 Spots, Quellen je See) und **Katalogbau**: Umrisse laden, Uferpunkt, Ufernormale, Wasserpunkt, Fetch, Warnzelle, Stationen aus der Messung; `spots-lakes.json`, `lakes.json`, `lake-geo.json` |
| `scripts/sea/sea-lakes.mjs` (neu) | **Producer**: Wind (dieselbe Kette `spotWind`, `stepQuantiles`, `sea-sight.mjs`) und Modelltemperatur; bricht mit Grund ab statt Nullen zu schreiben |
| `scripts/sea/sea-derive.mjs`, `sea-sight.mjs` | `spotWind` und `sightFor` rechnen am `spotWaterPoint` mit den Landesparametern des Spots (Küste: unverändert, Byte-Gleichheit gemessen) |
| `scripts/sea/sea-archive.mjs` | Seereihen, Modelltemperatur und Stundenwerte der Seestationen ins Archiv (`lakes-*.json.gz`, `lakes-wt-*.json.gz`, `lake-obs.json.gz`) |
| `scripts/sea/workflow-sea.yml` | Schritte „Lakes due?“ und „Lakes“ |
| `scripts/sea/gen-spot-names.mjs`, `gen-spot-seo.mjs`, `src/sea/seaSpotNames.ts`, `seaSpotFacts.ts`, `seaSeoText.ts`, `seaSeo.ts`, `seaLink.ts`, `scripts/seo/content.mjs`, `netlify.toml` | 70 Spot-Seiten mit eigenem Text (`textOfLake`, nur Eigenschaften des Orts), Verzeichnis-Abschnitt „Binnenseen“, Sitemap (135 Adressen), 70 Rewrites, Vorschau-Text |
| `scripts/verify-sea-lakes.mjs` (neu), `scripts/lib/fixtures/sea/lakes/`, `scripts/sea/spike/lake-probe.mjs`, `lake-record-fixtures.mjs`, `audit/seewetter-binnenseen/*` | Prüfer, 15 Fixtures (byte-gleich, `-text`), Messwerkzeuge, Tabellen |
| `docs/API.md` §8.14, `docs/DATA_SOURCES.md`, `scripts/repack-repo/README.md`, `package.json`, `.gitattributes`, `budget.json` | Quellen, Dateien im Daten-Repo, Skript, Zeilenenden, Budget-Notiz |

**Gestaltung** (Command-Deck, Skill `frontend-design`): ein neues Zeichen, die **Fetch-Rose** — der See, wie ihn der Wind vom
Spot aus sieht: 36 Speichen, die Fläche ist die Strecke über das Wasser je Windrichtung, die Speiche der aktuellen
Windrichtung in Petrol mit ihrer Länge in Worten, gestrichelt die Richtung des Ufers. Sie erklärt, warum derselbe Wind hier
eine andere Welle macht, und ersetzt die Balken des Wellenmodells. Alles andere nutzt vorhandene Karten, Kacheln und die Naht
der Wassertemperatur (links Messung, rechts Modell). Keine neue Farbe, keine Bewegung, keine neuen Großbuchstaben-Etiketten;
„Kein amtlicher Warnstatus“ ist wie in Dänemark eine neutrale Karte mit gestricheltem Rand. Mobil: Chips und Links 44 px hoch,
die Rose über dem Text.

**Was bei fehlenden Daten steht**

| Fall | Anzeige |
|---|---|
| kein Seekatalog im Daten-Repo | kein Seespot, kein Revier „Seen“ (Rückfall der Phase) |
| keine Seedatei, älter als 12 h, nicht lesbar | „Keine Daten“ mit Grund am Spot; die Küste bleibt, wie sie ist |
| Stunde ohne Windrichtung | Windwelle „bis x m“ über die längste Strecke, „Richtung nicht bestimmt“ |
| See ohne DWD-Zelle | Karte „Kein amtlicher Warnstatus im Datenbestand“ mit Link zum zuständigen Dienst |
| See mit Zelle, keine Meldung in der Datei | „Keine Warnung für ‚‹Zelle›‘ in der Warndatei“ mit Uhrzeit der Datei |
| Warndatei nicht lesbar | „Warnstatus nicht lesbar“, Link zum Dienst |
| keine Station bis 25 km auf Seehöhe | „keine Station in der Nähe“ |
| Station ohne Wert der letzten 90 min, Wert unplausibel | „keine Messung“ — nie ein alter Wert |
| keine WSV-Station am See | Wassertemperatur gemessen: „keine Station in der Nähe“ — das Modell steht nicht an ihrer Stelle |
| See nicht in Alplakes / Datei älter als 36 h / Becken fehlt | Modell: „kein Modell für diesen See“ bzw. „keine Daten“ mit Grund |

## 4. Gates (21.11.2026)

| Gate | Beleg |
|---|---|
| `verify:sea-lakes` | **118/118** (8 min) — A Fixtures byte-gleich (sha256, Gegenprobe gekipptes Bit, Ausschnitt als Ausschnitt benannt); B Wellenfunktion an den Rechenbeispielen 4 und 5 des Handbuchs, Deckel, Grenzen, Fetch-Tabelle; C Umrisse aus allen drei Quellen (Fläche, Uferpunkt, Normale, Wasserpunkt, Fetch = Katalog), **Spot ohne Wasser**, kein Wasserpunkt, OSM abgelehnt, Teilflächen und Lücke; D Katalog (28 Seen, 70 Spots, Regeln mit Gegenproben, **See ohne Warnzelle**, Zellen aus der aufgezeichneten Geometrie, **nicht lizenzierte Quelle abgelehnt**); E Producer mit Wind-Nachbau (Datei, Zeiger, fällig, Übernahme, Spot ohne Rechnung, unplausible Reihe, **Abbruch statt Nullen**, Kill-Schalter, Aufbewahrung, Alplakes: Antwort, 429, Totalausfall, CORS-Absage); F **Küstenreihen byte-gleich mit und ohne Seekatalog** (Lauf und Wind-Auffrischung), **Gegenprobe**: ein zusätzlicher Küstenspot ändert die Datei; G Seite ohne Browser (Reihen, **veraltete und unplausible Messung**, WSV, BAFU, DWD-Warnung wörtlich zu den Codes 57, 58 und 51, abgelaufen, zurückgezogen, Klassen aus); H Quelltext (kein „sicher“ mit Gegenprobe, Alplakes nur im Producer, nur verlinkte Quellen nie abgerufen, kein OSM, kein Schalter, Workflow) |
| ein lokaler Producer-Lauf | `sea-lakes.mjs --data=cdn` auf einer Kopie des Speichers (Lauf 2026112100, t1 2026112106): **70/70 Spots** mit Wind, Spanne und Hinweisen, buscosun Fusion 14, 18 s, 285 KB; Alplakes **22/22 Becken**, 10 KB. `sea-archive.mjs` auf demselben Speicher: 1 Seedatei, 1 Modelldatei, 1 066 Stationsstunden von 41 Stationen |
| ein lokaler Katalogbau | `build-lake-spots.mjs --out --geo`: 28 Seen, 70 Spots, 0 Befunde, `lake-geo.json` 140 Einträge, 70 Höhen auf den Seespiegel gesetzt |
| bestehende `verify:sea-*` | contract 30/30 · text 35/35 · decode 13/13 · derive **70/70** · waterlevel **64/64** · tide-window 49/49 · wind-band 41/41 · planner 50/50 · trip **73/73** · wizard 28/28 · dk 70/70 · current 108/108 · watertemp 136/136 · sight **76/76** · ripples 122/122 · seo **23/23**. `verify:sea-ui` (Browser) **nicht gelaufen** — Jans Entscheidung, keine Browser-Prüfung |
| `npm run typecheck` | 0 |
| `npm run build` | grün, 281/281 Prüfungen des SEO-Baus; 134 Spot-Shells, `sitemap-seewetter.xml` 135 Adressen |
| `npm run budget` | eagerJs **116,2 / 117**, eagerCss 2,4 / 2,5, largestChunk 278,4 / 302 grün; **totalJs 2 094,1 / 2 083 rot** — der Arbeitsbaum trägt die uncommitteten Linien anderer Phasen und stand schon vorher über der Grenze (Notiz in `budget.json`). Grenzen von Hand mit Notiz angehoben (eagerJs 115 → 117, totalJs 2 054 → 2 083); der Anteil der Phase (≈ +29 KB gzip) ist aus ihren Modulen **geschätzt**, nicht am sauberen Stand gemessen (V-BS-9) |
| `verify:share` | **516/517** — rot genau SH6, die Bytegleichheit des Edge-Bündels (wie E-DK-8: `seaSpotNames.ts` trägt 70 Zeilen mehr, das Bündel kennt sie bis zu Jans `npm run edge:share` nicht) |
| Sichtprüfung | **keine** — weder Bild noch Browser (Jans Vorgabe). Die Fragen 2 (Desktop pixelgleich), 3 (Touch-Ziele am Gerät), 4 (Konsole) und 5 (Long Tasks) der Selbstverifikation sind damit **unbeantwortet**; Frage 1 (Funktionserhalt) nur am Quelltext und an den Prüfern (alle bestehenden Seewetter-Prüfer grün, Küstenreihen byte-gleich) |

Bestehende Prüfer, die ich geändert habe, statt den Code um sie herum zu biegen — jeweils mit dem Grund im Prüfer:
`verify:sea-waterlevel` C1 nimmt `seaLakes.ts` vom Verbot der PEGELONLINE-Webservices aus (die Seepegel sind WSV-Pegel und
kein Teil der BSH-Vorhersage; neu C1c: der Küsten-Wasserstand kennt die Seen-Dateien nicht), `verify:sea-trip` J9 liest den
Länderparameter als Parameter mit `'DE'` als Voreinstellung, `verify:sea-sight` J6 liest die Sicht-Karte als gemeinsamen
Knoten, `verify:sea-seo` und `verify:share` zählen die Handliste der Seen mit und nehmen „im Mittel x Meter tief“ von der
Regel „keine Prognosewerte“ aus (eine Eigenschaft des Sees).

## 5. Daten-Repo (`buscosun-data`, nur `sea/` und `sea.yml`, ohne Force, je Push nachgeprüft)

| Commit | Inhalt | Prüfung nach dem Push |
|---|---|---|
| `faf2b989e78c5fe4517b2d8c4da279fa9cfd370e` (21.11. ≈ 10:17 UTC) | `sea/v1/static/spots-lakes.json` (89 891 B), `lake-geo.json` (92 720 B), `lakes.json` (180 274 B) — drei neue Dateien | raw `@faf2b989`: sha256 aller drei gleich den lokalen Dateien (`897ed6da…`, `bdc16735…`, `7c1ee266…`); `spots.json` unverändert (`32446b5d…`); im Commit genau diese drei Dateien; erster Versuch angenommen |
| `4cfd5f83835c88a85e2ee3f6133c32a806be5ad8` (21.11. ≈ 10:19 UTC) | `.github/workflows/sea.yml`: Schritte „Lakes due?“ und „Lakes“, Bedingung des Cube-Checkouts und des Fehlerschritts, Kopfzeilen (+51/−3) | raw `@4cfd5f83` sha256 gleich der lokalen Datei (`a4e1c022…`); die 54 geänderten Zeilen sind dieselben wie zwischen der alten und der neuen Vorlage (`diff` leer) |
| `1a61bae270d47d76e8a389a7661ded649394fbb8` (21.11. ≈ 10:31 UTC) | **erste Seereihe, lokal gerechnet** (damit Jan vor dem Push auf dem Dev-Server Werte sieht): `sea/v1/lakes/2026112100-w2026112106.json` (285 215 B, 70 Spots, buscosun Fusion 14), `lakes/wt-202611210920.json` (10 421 B, 22 Becken), `status.json` + `lakes`, `lakesWt` (22 Zeilen dazu, sonst nichts) | raw `@1a61bae2`: sha256 beider Dateien gleich den lokalen (`27278d7e…`, `a9507ec9…`), Zeiger zeigen auf sie; ein Push abgelehnt (Cron dazwischen) ⇒ `checkout --detach`, `cherry-pick`, zweiter Versuch angenommen; direkt nach dem Ende des Laufs 3741 eingespielt, damit kein laufender Publisher den Stand überschreibt. Die Reihe gilt für den Seegangslauf 2026112100 — mit dem nächsten Lauf (≈ 16:15 UTC) zeigt die Seite an Seespots „Keine Daten“, bis der Producer auf `main` selbst rechnet |

**Erster Lauf mit den neuen Schritten:** `sea` Nr. 3741 (21.11. 10:21:25 UTC, GitHub-API `actions/runs/44893952113/jobs`): Job `success` in 5:36 min; Schritt 9 „Lakes due?“ `success`, Schritt 10 „Cube checkout“ `skipped`, Schritt 13 „Lakes (buscosun Fusion wind at the lake spots, Alplakes water temperature)“ `success` (überspringt sich, der Producer liegt noch nicht auf `main`), „Publish“ `success`. Danach auf `main`: `spots-lakes.json` 200 / 89 891 B, `lake-geo.json` 200 / 92 720 B, `lakes.json` 200 / 180 274 B (der Publisher legt den ganzen Speicher zurück, die Dateien bleiben), `spots.json` 25 567 B unverändert, `status.json` ohne `lakes` (erwartet), `lastPublishedRun` 2026112100 wie zuvor.

**Lauf nach der eingespielten Seereihe:** `sea` Nr. 3742 (10:36:22 UTC) `success`; danach trägt `status.json` (10:36:56 UTC) weiter `lakes` und `lakesWt`, beide Dateien unter `sea/v1/lakes/` antworten mit 200 und der alten Länge — der Publisher hat sie zurückgelegt.

Wie bei Phase DK habe ich nur die Hunks dieser Phase auf die Live-Datei gesetzt; ihr bekannter Unterschied zur Vorlage (kein
`ruc/` im Cube-Checkout, offener Schritt aus §78) steht unverändert da (V-BS-11). Die erste Seereihe habe ich einmal von der lokalen Maschine eingespielt (dritte Zeile der Tabelle) — nur damit Jan vor dem Push Werte sieht; ab dem Push von `buscosun-web` schreibt der Producer auf `main` sie im nächsten 15-min-Lauf selbst (der Katalog liegt da, also ist die Rechnung sofort fällig) und danach bei jedem neuen t1-Lauf und jedem neuen Seegangslauf. **Kein Push in `buscosun-archiv`:** dessen Workflow klont `scripts/sea` und `src/sea` von `main`
und legt die Seedateien ab dem ersten Lauf nach dem Push ab (der Speicher hält vier Seedateien je Lauf, der Archivlauf kommt
alle 6 h).

## 6. Befunde

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| **V-BS-1** | buscosun Fusion liefert an den Wasserpunkten der Alpenseen an vielen Stunden **keine Windrichtung** (9 Spots unter 10 von 80 Stunden, 30 Spots 10–39; norddeutsche Seen 67–80). Ohne Richtung keine Seite zum Ufer und nur eine Obergrenze der Windwelle | Mehrwert: Windwelle und „auflandig/ablandig“ an jeder Stunde. Skizze: wie V-DK-4 — Richtung im Motor zwischen den Stunden mit Richtung über u/v führen oder schwachen Wind ausdrücklich als „umlaufend“ ausgeben (eigene Phase, neuer Stand von buscosun Fusion, Jans Entscheidung) |
| **V-BS-2** | An den zehn Seestationen ist buscosun Fusion im Mittel gut (Wind +0,3 kn, Böe +0,5 kn), je See aber verschieden: Neusiedler See Wind +1,8 kn und nur 70 % in der Spanne, Zürichsee Böen +3,0 kn, Chiemsee Böen 1–6 h −2,0 kn. Gemessen bei schwachem Herbstwind an Landstationen | Deshalb bleiben die Klassen aus (E-BS-2). Skizze: nach 14 Tagen Archiv (`lakes-*.json.gz` gegen `lake-obs.json.gz`) dieselbe Tabelle an allen 41 Stationen, dann Jans Entscheidung über `LAKE_VERDICTS` |
| **V-BS-3** | Windpartikel auf der Seekarte sind nicht gebaut (E-BS-11) — die Vorgabe „lake area, spots, wind particles“ ist an dieser Stelle **nicht erfüllt** | Jans Entscheidung: die `WindLayer`-Klasse der Wetterkarte in `SeaMap` einhängen (WebGL-Pipeline, Sichtprüfung nötig) oder bei den Windpfeilen an den Spots bleiben |
| **V-BS-4** | Etappe auf einem See: Wind kommt von buscosun Fusion mit den Landesparametern des Start- oder Zielspots; die Spalten Welle und Strom zeigen „keine Daten“ (das Wellenmodell hat dort kein Wasser), statt ausgeblendet zu sein. An einem Punkt vor fremdem Ufer (Genfersee Südufer) steht in der Etappe kein Vermerk | Skizze: in `SeaTripPanels` die beiden Spalten an Seen weglassen und den Vermerk `lakeForeignNote` an Punkten außerhalb DE/AT/CH zeigen (Länderregel `countryBorders.ts`) |
| **V-BS-5** | Die Sicht-Karte sagt am Seespot „Diesem Spot ist keine Messstation zugeordnet“, obwohl es eine Windstation gibt — obs/v1 trägt keine Sichtweite; die amtliche Zeile nennt kein Seegebiet | Skizze: eigener Satz für Seen („Die Station meldet im Datenbestand keine Sichtweite“) in `SeaSightPanel` |
| **V-BS-6** | Die 70 Lagen sind aus dem Gedächtnis gesetzt und nur am Umriss (Median 103 m zum Ufer) und an der Wikipedia-Koordinate des Orts geprüft; zwei waren falsch und sind korrigiert. Ob ein Spot am Hafen, am Strandbad oder an der Promenade liegt, hat niemand angesehen | Jans Blick auf die Karte, je See; `lakes-src.json` ist die eine Stelle |
| **V-BS-7** | Neusiedler See: EU-Hydro kennt die offene Wasserfläche (141 km²), Rust liegt in einer Bucht im Schilf (Fetch ≤ 0,8 km); die mittlere Tiefe von 1 m macht die Schätzung dort empfindlich gegen den Wasserstand | Skizze: Tiefe aus dem aktuellen Pegel statt aus der Tabelle, sobald eine Quelle mit geklärter Lizenz da ist (Wasserportal Burgenland: nur Link) |
| **V-BS-8** | Seespiegel, mittlere Tiefe und Fläche stammen aus den Infoboxen der Wikipedia (gelesen 21.11., mit Artikeladresse am Wert) — eine Sekundärquelle | Skizze: je See die Primärquelle (IGKB, CIPEL, LfU, BAFU, Land) in `lakes-src.json` eintragen |
| **V-BS-9** | Die Phase kostet geschätzt 29 KB gzip, davon 1,3 KB im Startpfad (Namenstabelle der 70 Seespots) und rund 10 KB Steckbriefe und Texte der Spot-Seiten. Nicht am sauberen Stand gemessen | Skizze: nach dem Commit am sauberen Stand messen; die Seenamen aus dem Startpfad nehmen (nur das Revier, der Name des Sees kommt mit dem Katalog) |
| **V-BS-10** | `verify:sea-lakes` braucht 8 Minuten, fast alles für drei volle Wellenläufe des Byte-Vergleichs (F) | Skizze: `buildRun` um eine Schrittliste für Prüfer erweitern (12 statt 79 Schritte) — Eingriff in den Wellenproducer, eigener kleiner Schritt |
| **V-BS-11** | Der Live-Workflow checkt `ruc/` nicht aus (Bestand, §78). Wind und Böe sind davon unberührt, die Regenchance der Hinweise rechnet im Workflow ohne den RUC-Member | Jans offener Schritt §78 |
| **V-BS-12** | Alplakes bittet um einen User-Agent mit Kontakt; der Producer sendet `buscosun-sea (https://buscosun.com; …)` ohne Mailadresse | Jans Entscheidung, mit der Mail an die Eawag (MANUELLE-SCHRITTE §107.5) |
| **V-BS-13** | Mardorf (Steinhuder Meer) hat keine Station bis 25 km (Hannover 25,4 km), Steinhude am selben See schon (21,9 km) | Regel bleibt, wie vor der Messung gesetzt; Skizze: Station je See statt je Spot |
| **V-BS-14** | Die Übersicht `/seewetter` heißt in Titel, Kopfzeile und Routentext weiter „Nord- und Ostsee“; die Seen stehen im Verzeichnis und im Revier | Skizze: `src/seo/routeTexts.ts` und die Unterzeile der Topbar nach Jans Blick |
| **V-BS-15** | Der Kummerower See misst am Pegel Aalbude (am Ausfluss, 9,1 km vom Spot); der Kölpinsee hat keinen eigenen Pegel | steht so in der Karte (Name und Entfernung) |
| **V-BS-16** | **Commit:** die Dateien der Seite (`SeaPage.tsx`, `SeaDock.tsx`, `SeaMap.tsx`, `SeaTripPanels.tsx`, `seaClient.ts`, `seaDeck.css`, `seaTripData.ts` …) tragen uncommittete Zeilen der Ausfahrt- und Riffel-Linie (AM-N, AM-P, AM-W, SR-B … SR-F), `SeaPage.tsx` importiert deren ungetrackte Dateien (`SeaWizard.tsx`, `seaSteps.ts`, `seaOwnPoint.ts`). Die Zeilen dieser Phase stehen dazwischen; ein Commit „nur Phase BS“, der für sich baut, lässt sich daraus nicht schneiden | Jans Entscheidung (§7) |
| **V-BS-17** | Meine Patch-Skripte haben einige Arbeitsdateien mit LF statt CRLF geschrieben (`SeaPage.tsx`, `seaClient.ts`, `seaDeck.css` u. a.). Git normalisiert beim Hinzufügen, es gibt keinen inhaltlichen Unterschied | — |
| **V-BS-18** | `verify:sea-lakes` ist nicht in der CI eingetragen (`.github/workflows/ci.yml` trägt uncommittete Zeilen einer anderen Linie und bleibt Jans Schritt) | Skizze: wie V-AM-12 einen Schritt nach den übrigen Seewetter-Prüfern; wegen der 8 Minuten erst nach V-BS-10 |

## 7. Stand des Commits

**Phase BS liegt auf `origin/main`:** Jan hat sie am 21.11. mit der Ausfahrt- und Riffel-Linie zusammen gepusht (`5d92118e`,
Weg (b) aus V-BS-16); `8c876b24` hat danach das Gate grün gemacht (Budget, Edge-Bündel, pv-cube), die CI ist seit Lauf 184
grün. Der Producer der Seen rechnet seitdem auf dem Runner (`status.lakes` 21.11. 17:10 UTC: Lauf 2026112112, t1 2026112115,
70 Spots, 4 s). Die frühere Fassung dieses Abschnitts („nichts ist committet“, „Budget rot“) gilt nicht mehr.

Lokal committet und **nicht gepusht** ist der Nachzug BS-N (§8), beginnend mit `d930e5a4`.

## 8. Nachzug BS-N (21.11.2026) — Richtung an der Küste, See-Etappe, Sicht-Karte, Prüfer, Ablage

Sechs Aufgaben, je ein lokaler Commit auf `main`. Kein Eingriff in buscosun Fusion (`src/pointForecast/**`), in Shader, Edge
Functions oder Abhängigkeiten. Kein Browser, kein Bild, kein Dev-Server (Jans Vorgabe) — die Fragen 2 bis 5 der
Selbstverifikation sind damit unbeantwortet, Frage 1 (Funktionserhalt) nur am Quelltext und an den Prüfern.

### 8.5 Ablage in `buscosun-archiv` (nur gelesen, kein Push)

**Ergebnis: die Ablage trägt die Seedateien seit dem ersten Archivlauf nach dem Push (18:43 UTC).** Der Weg dahin:

Stand 21.11. 18:29 UTC: im Archiv lag noch keine Seedatei — und das war kein Fehler. Der letzte Lauf von `sea-archiv`
(Nr. 181, 12:42 UTC, grün; Index `updatedAt` 12:43 UTC) lief **vor** dem Push von `buscosun-web` (`5d92118e` committet 15:53
UTC, `8c876b24` 16:32 UTC); der Cron läuft alle 6 h um :41. Der Index des 21.11. trägt deshalb weder `lakes` noch `lakesWt`
noch `lakeObsStations`, der Ordner `sea/v1/2026-11-21/` elf Dateien ohne `lakes-*`.

Geprüft, ob der nächste Lauf sie ablegen wird: der Live-Workflow ist Byte für Byte die Vorlage
(`scripts/sea/workflow-sea-archiv.yml`); der Archivierer aus `origin/main`, ausgecheckt mit genau den vier Pfaden des
Workflows (`scripts/sea scripts/lib src/sea package.json`), lief lokal gegen eine Kopie der betroffenen Dateien des
Live-Speichers in ein leeres Verzeichnis: `lakesAdded 3`, `lakesWtAdded 2`, `lakeObsRows 1066` von 41 Stationen, Exit 0 — kein
fehlender Import im Sparse-Checkout. Der Speicher hielt um 18:29 UTC drei Seereihen (`2026112100-w2026112106`,
`2026112112-w2026112112`, `2026112112-w2026112115`) und zwei Modelltemperaturen; bei vier Reihen je Lauf und einem Archivlauf
alle 6 h geht bis dahin nichts verloren.

**Der erste Lauf nach dem Push hat sie abgelegt:** `sea-archiv` Nr. 182 (21.11. 18:43:03 UTC, grün; Index `updatedAt` 18:43:23
UTC). Der Tag `2026-11-21` trägt jetzt `lakes` (die drei Reihen oben), `lakesWt` (`202611210920`, `202611211615`) und
`lakeObsStations: 41`; im Ordner liegen `lakes-2026112100-w2026112106.json.gz` (57 502 B), `lakes-2026112112-w2026112112.json.gz`
(60 666 B), `lakes-2026112112-w2026112115.json.gz` (60 266 B), `lakes-wt-202611210920.json.gz`, `lakes-wt-202611211615.json.gz`
und `lake-obs.json.gz` (5 770 B); auch der 20.11. hat `lakeObsStations: 41` bekommen (die Messreihen reichen einen Tag zurück).
Genau das, was die Nachstellung ergab. Die Seereihe des Laufs 2026112100 mit t1 2026112106 ist die lokal gerechnete aus
§5; spätere Reihen dieses Laufs gab es nicht (der Producer lag da noch nicht auf `main`). Gelesen über `raw` und die
GitHub-API, nichts geschrieben.
