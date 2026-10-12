# Gletscher-Monitor DACH – Feature-Konzept buscosun

> Export vom 11.10.2026 aus dem claude.ai-Doc „Gletscher-Monitor DACH – Feature-Konzept buscosun“
> (https://claude.ai/artifact/7BcKxBhiCoKPCzKTfdmFti, Revision 22, faktengeprüft). Das Konzept gibt die Richtung vor, es ist
> kein Bauplan: bei Widerspruch gilt `audit/gletscher-plan.md`. UI-Vorgabe: `reference/gletscher-*.dc.html`.
>
> **Abweichungen im Plan** (Details dort §1):
>
> - A1: Entwicklung im Worktree auf `feat/gletscher`.
> - A2: Alle Gletscherdaten liegen in `buscosun-glacier` statt in `buscosun-data/glacier/`.
> - A3: Eigener Melt-Workflow statt eines Schritts im `point.yml`.
> - A4: Kein Eingriff ins Punktarchiv (E-GL-6), stattdessen ein eigenes Tagesarchiv.
> - A5: Gate B und C prüfen an Rückrechnungen; neu ist Gate E (Sommer 2027).
> - A6: **Der Cube führt keine Globalstrahlung** (E-GL-11 neu).
> - A7: Die 3D-Bühnen nutzen eingebautes MapLibre-3D, keinen Custom Layer. Der Hinweis im Abschnitt „Bestand“ unten ist damit überholt.
> - A8: Eigene Favoritenliste.
> - A9: `CLAUDE.md` und `MANUELLE-SCHRITTE.md` werden erst beim Merge angepasst.

2026-10-11 · Jan

**Empfehlung: bauen, als Kachel 13 „Gletscher“.** Kein Angebot zeigt heute alle rund 2 200 Gletscher in Deutschland, Österreich und der Schweiz an einem Ort und zwischen den Jahresberichten. buscosun kann das mit offenen Daten und den eigenen Pipelines: Schmelze täglich aus buscosun Fusion, Schneegrenze und Ausaperung je Sentinel-2-Szene, Langzeitreihen aus den amtlichen Messnetzen.

## Kurzfassung

- **Die Lücke ist belegt.** Die Messnetze arbeiten national und im Jahrestakt: GLAMOS (CH) meldet Anfang Oktober, der ÖAV (AT) und die BAdW (DE) im März. Eine laufende Übersicht über alle drei Länder zwischen den Berichten gibt es nicht.
- **Drei Zeitebenen tragen das Feature.** *Heute*: modellierte Schmelze je Gletscher mit 14-Tage-Ausblick aus buscosun Fusion. *Saison*: Schneegrenze, Ausaperung und Albedo aus jeder wolkenarmen Sentinel-2-Szene. *Jahrzehnte*: Umrisse seit 1850, Längen- und Massenreihen, Projektion als Szenario-Spanne.
- **Der größte Teil der Technik existiert schon.** Sentinel-2-Abruf, eigener COG-Leser, SCL-Maske und WorldCover-Spiegel aus dem Brandradar; Punkt-Cube bis 336 h; Höhen-Zeit-Schnitt, Schneefallgrenze als Fläche und 3D-Bühne; Punktarchiv mit 24 Bergstationen über 1 800 m seit Mai 2023.
- **Die Zusatzdaten sind offen.** Inventare, Messreihen (GLAMOS, WGMS, ÖAV), Schneegrenzen-Klimatologie 2000–2025, Projektionen je Gletscher und IMIS-Stationen stehen unter CC BY 4.0 oder gleichwertig, ohne Key. Blockiert sind Webcams, die österreichischen Gletscherseen (NC) und bayerische Rohdaten (nicht veröffentlicht).
- **Zwei Lücken im eigenen Bestand.** Der Cube endet bei 700 hPa (≈ 3 000 m), die Nullgradgrenze über den Firnbecken fehlt also; 2026 lag sie an 76 Tagen über 4 000 m. Bergorte sind im Cube schwach belegt (V-FI-13). Abhilfe: `hzerocl` aus ICON-D2/-EU und eine Höhenkorrektur, gemessen an den Bergstationen des Archivs.
- **Ehrlichkeit ist Teil des Produkts.** Jeder Wert trägt seine Herkunft (gemessen, Satellit, Modell, amtlich), jede Fläche ihr Bezugsjahr. Gefahren nur als wörtliches Zitat der Behörden, keine eigene Gefahrenstufe. Die vier deutschen Gletscher sind für Satellitenkennzahlen zu klein; dort gelten die BAdW-Zahlen.
- **Weg dorthin:** sieben Stufen GL-0 bis GL-6, Start mit Atlas und Messreihen. Kein Backend, kein Netlify-Traffic, eine neue Datenlinie `glacier/`.

## Was Menschen interessiert

Am stärksten belegt ist der Bedarf vor einer Entscheidung (die Hochtour) und beim Einordnen eines Ereignisses (Hitzesommer, Jahresbericht, Abbruch). Recherche am 11.10.2026 über Alpenvereine, Medien, Studien und bestehende Angebote; das Suchvolumen (Google Trends) ließ sich nicht messen.

### Zielgruppen

| Zielgruppe | Kernfrage | Was sie im Feature sehen will | Beleg |
| --- | --- | --- | --- |
| Hochtourengeher, Bergsteiger | Ist meine Route noch so, wie sie beschrieben ist? | Ausaperung, Blankeis, Nullgradgrenze, Nächte ohne Frost, Neuschnee; Links zu Hütten und Verhältnisberichten | stark: [DAV, 12.08.2026](https://www.alpenverein.de/verband/presse/pressemeldungen/klimawandel-in-den-alpen-tourenplanung-ist-wichtiger-denn-je), [SAC-Warnung, 21.07.2026](https://www.bluewin.ch/de/lifestyle/hitzesommer-sac-warnt-gefahren-hochgebirge-li.3536325) |
| Hüttengäste, Wanderer | Wie komme ich zur Hütte? | Ob der Zustieg über Eis führt und wie er sich verändert | mittel: heute 22 SAC-Hütten mit Gletscherzustieg, in 25 Jahren noch 6 ([SRF](https://www.srf.ch/radio-srf-1/klimawandel-trifft-sac-huetten-jede-dritte-sac-huette-ist-potenziell-gefaehrdet)) |
| Skitourengeher | Wie gut sind die Spalten überdeckt? | Schneehöhe auf dem Gletscher gegen das Mittel | mittel: [DAV, 03.04.2025](https://www.alpenverein.de/artikel/erhohtes-risiko-von-spaltensturzen-auf-skihochtouren_ae5df818-b442-418f-8a3e-b99a7757b82b) |
| Touristen, „Last Chance“ | Wo sehe ich noch Eis, wie sah es früher aus? | Vorher-nachher, Aussichtspunkte, Prognose | stark: Jungfraujoch 2024 mit 1 058 600 Gästen ([Jungfraubahn](https://www.kapitalmarktexperten.de/jungfraubahn-holding-ag-meldet-ueber-1-million-gaeste-in-2024/)), [Mayer et al. 2024](https://ideas.repec.org/a/bpj/touwis/v16y2024i1p15-42n1006.html) |
| Klimainteressierte | Wie schlimm ist es dieses Jahr? | Saisonbilanz, Gletscherschwundtag, Liste verschwundener Gletscher | stark: GLAMOS-Bilanz vom 01.10.2026 ([Uni Fribourg](https://www.unifr.ch/unicom/de/news-events/news/35266/die-schweizer-gletscher-verlieren-weitere-funf-prozent-ihres-volumens)) |
| Bewohner alpiner Täler | Bin ich gefährdet? | Amtliche Hinweise, Gletscherseen, Ereignisse | Bedarf stark ([Blatten 2025](https://en.wikipedia.org/wiki/2025_Blatten_glacier_collapse)), Umsetzung heikel |
| Lehrkräfte, Schüler | Wie zeige ich den Wandel im Unterricht? | Einfacher Vergleich, Messwerkzeug, Download | mittel: [Arbeitsblatt Pasterze im Copernicus Browser](https://gwb.schule.at/pluginfile.php/427001/mod_resource/content/3/Arbeitsblatt.pdf) |
| Medien | Was ist neu, wie ordne ich es ein? | Rangliste, Rekorde, zitierfähige Quellen, Grafik zum Einbetten | mittel |
| Wasserkraft, Wasserwirtschaft | Wie viel Schmelzwasser kommt? | Schmelze im Kontext | schwach: eigene Modelle vorhanden |

### Was nachweislich gefragt ist

- **Vorher-nachher ist das stärkste Format.** Ein Rhonegletscher-Vergleich 2009/2024 erreichte auf X über 4 Mio. Aufrufe ([utopia](https://utopia.de/news/urlaubsfoto-geht-viral-klimakrise-ist-darauf-deutlich-erkennbar_717961/)); ÖAV, GfÖF-Archiv und Ausstellungen arbeiten damit.
- **„Wann ist er weg?“** beantwortet die Forschung je Gletscher, Medien greifen es auf ([Global Glacier Extinction Explorer](https://www.leinetal24.de/welt/viele-gletscher-verschwinden-noch-zu-unseren-lebzeiten-neue-karte-zeigt-wann-zr-94494979.html), Wegweiser „Pfiati Gletscher!?“ in Innsbruck). Nur mit Szenario und Spanne zeigen.
- **Tageswerte im Sommer** stehen in den Nachrichten: Der Rhonegletscher verlor 2026 seit Mitte Juni rund 10 cm Eis am Tag ([Euronews, 08.08.2026](https://de.euronews.com/2026/08/08/hitzewellen-verandern-die-gletscher-der-schweiz)). Der Gletscherschwundtag lag 2025 am 7. Juli, früher nur 2022 (GLAMOS).
- **Gefahren sind Bedarf, aber kein Feld für eigene Aussagen.** Blatten stand nicht auf der Gefahrenkarte; der DAV nennt die Vorhersage von Abbrüchen „schwierig bis unmöglich“ ([DAV](https://www.alpenverein.de/verband/presse/hintergrundinfos/klimawandelfolgen-fuer-den-bergsport)).
- **Touristen suchen eher Landschaftswandel als Eis** ([Mayer et al. 2024](https://ideas.repec.org/a/bpj/touwis/v16y2024i1p15-42n1006.html)): Moränen, neue Seen und Jahresmarken erzählen mehr als „letzte Chance“.

### Saison

Höhepunkt Ende Juni bis Anfang Oktober (Hitzewellen, Warnungen von SAC und DAV, GLAMOS-Bilanz Anfang Oktober), zweite Welle im März (ÖAV- und BAdW-Bericht, Weltgletschertag am 21.03.). Abgeleitet aus den Erscheinungsdaten, nicht aus Suchvolumen.

### Bestehende Angebote und ihre Lücke

| Angebot | Kann | Fehlt |
| --- | --- | --- |
| [GLAMOS](https://glamos.ch/en/mapviewer) (CH) | Mapviewer, Factsheets, Downloads, Inventar aller Schweizer Gletscher | nur Schweiz, Jahresrhythmus, Fachpublikum |
| [ÖAV-Gletschermonitor](https://www.alpenverein.at/gletschermonitor) (AT, seit 2025) | 96 Gletscher, Fotovergleiche | jährlich, Fokus Länge |
| BAdW (DE) | Berichte, Pressemitteilungen | keine Daten zum Download |
| Global Glacier Extinction Explorer | „Wann verschwindet er?“ je Gletscher | global, kein laufender Zustand |
| Copernicus Browser | Satellitenvergleich | hohe Hürde: Wolken, Bänder, Messwerkzeug |
| hikr, gipfelbuch, camptocamp, alpenvereinaktiv | aktuelle Verhältnisberichte | verstreut, unstrukturiert |

**Die Lücke für buscosun:** ein Ort für DE, AT und CH, laufend zwischen den Berichten, verständlich und mobil.

### Bewusst nicht bauen

- Keine eigene Gefahrenstufe, keine Abbruch- oder Seeausbruchs-Vorhersage.
- Keine Routenfreigabe („begehbar“) und keine Spaltenkarte.
- Keine Patenschaft oder Gamification: dafür fand die Recherche keinen Nachfragebeleg.

## Lage der Gletscher 2025/26

Die Schweiz verlor im hydrologischen Jahr 2025/26 rund 5,5 % ihres Eisvolumens, knapp hinter dem Rekord 2022. Österreich und Deutschland berichten für dieses Jahr erst 2027. Zusammen sind es rund 2 200 Gletscher auf etwa 1 000 km².

| Land | Gletscher | Fläche | Jüngste Bilanz | Nächster Bericht |
| --- | --- | --- | --- | --- |
| Schweiz | rund 1 400 im Inventar SGI2016 (Bezug 2013–2018), heute rund 1 300 | ≈ 714 km² Ende 2026 (Schätzung GLAMOS) | 2025/26: − 5,5 % Volumen (≈ 2,5 km³), − 2,86 m w. e.; 2024/25: − 3 % | Bulletin im Februar, Saisonschätzung Anfang Oktober |
| Österreich | rund 800 im Inventar AGI 5 (Bezug vor allem 2022/23; 894 im Vorgänger minus 95 verschwundene) | 285 ± 12 km², − 31 % seit dem Inventar 2004–2012 | 2024/25: im Mittel − 20,3 m Länge, Rang 8 in 135 Jahren; Pasterze − 54 m | ÖAV-Gletscherbericht März 2027 |
| Deutschland | 4: Nördlicher Schneeferner, Höllentalferner, Watzmanngletscher, Blaueis | 26,2 ha (2025), − 27,2 % seit 2023 | Dickenabnahme 1,6 m im Jahr (2023–2025), davor 0,8 m | BAdW nach der nächsten Vermessung |

- Seit 2000 verlor die Schweiz rund ein Drittel ihrer Gletscherfläche. 2026 lag die Nullgradgrenze an 76 Tagen über 4 000 m, so oft wie nie.
- Laut GLAMOS verschwanden 2026 Bella Tola (VS) und Griessfiren/Plattalvafirn (GL), belegt durch Fotos. Als verschwunden gilt ein Gletscher unter 1 ha Eis.
- Der Südliche Schneeferner verlor 2022 den Gletscherstatus. Deutschland dürfte in den 2030er-Jahren gletscherfrei sein; der Nördliche Schneeferner verschwindet etwa zum Ende des Jahrzehnts, der Höllentalferner hält am längsten.
- Alpenweit geht bis 2050 in allen Szenarien rund die Hälfte des Volumens von 2017 verloren. Bis 2100 bleibt bei RCP 2.6 etwa ein Drittel, bei RCP 8.5 höchstens 5 %.

Quellen: [GLAMOS Annual Report 2025](https://doi.glamos.ch/pubs/annualrep/annualrep_2025.pdf), [20 Minuten, 2026](https://www.20min.ch/story/schweizer-gletscher-schrumpfen-25-kubikkilometer-eis-verschwanden-2026-103638723), [ETH News, Oktober 2026](https://ethz.ch/en/news-and-events/eth-news/news/2026/10/devastating-year-for-switzerlands-glaciers.html), [Linsbauer et al. 2021 (SGI2016)](https://public-pages-files-2025.frontiersin.org/journals/earth-science/articles/10.3389/feart.2021.704189/text), [Hartl et al. 2026 (AGI 5, Preprint)](https://egusphere.copernicus.org/preprints/2026/egusphere-2026-1241/), [ÖAV-Gletscherbericht 2024/25](https://www.alpenverein.at/portal/news/2026/2026_03_13_gletscherbericht-24-25.php), [BAdW, 19.03.2026](https://badw.de/presse/news-pressemitteilungen/artikel/neue-vermessung-zeigt-beschleunigten-gletscherschwund), [Öko-Test/dpa](https://www.oekotest.de/freizeit-technik/Rekordschmelze-Deutschland-wohl-in-2030ern-ohne-Gletscher-_16238_1.html), [watson](https://www.watson.ch/schweiz/extremwetter/697510915-so-verheerend-schmolzen-die-schweizer-gletscher-2026), [WSL zu Zekollari et al. 2019](https://www.wsl.ch/en/news/one-third-of-alpine-glaciers-could-be-saved/).

## Bestand: was wir wiederverwenden

Der Satellitenpfad des Brandradars, der Punkt-Cube von buscosun Fusion, die Gelände-Bühnen und das Punktarchiv tragen das Feature. Neu sind die Gletscherdaten selbst und zwei Rechenschritte im Daten-Repo. Gelesen am Arbeitsbaum `buscosun-web` am 11.10.2026.

| Bestand (Ort im Repo) | Was er heute tut | Nutzung im Gletscher-Feature |
| --- | --- | --- |
| Sentinel-2-Pfad: STAC-Szenenwahl `fire/detail/fireSatImagery.ts`, COG-Leser `cogTiff.ts` (uint8, uint16, float32), UTM `sentinelGeo.ts` | Vorher/nachher je Brand, 10-m-Viewer | Szenen je Gletscher finden, Bänder B03/B04/B08/B11 lesen, Vorher-nachher-Regler. Der Leser ist DOM-frei und läuft auch im Producer unter Node |
| SCL-Maske `burnIndex.ts`, WorldCover-Spiegel `buscosun-worldcover` | Wolke, Schnee, Wasser maskieren; Landbedeckung | Wolken- und Schattenmaske je Szene; WorldCover-Klasse 70 „Schnee/Eis“ als Plausibilitätsmaske |
| NASA GIBS HLS (30 m, etwa alle 2–3 Tage) | schnelle Echtfarbbilder im Brandradar | Übersichtsbild „letzte klare Aufnahme“ ohne eigenen Abruf |
| Punkt-Cube `point/` + buscosun Fusion (0–336 h, p10/p50/p90) | Punktvorhersage | Antrieb des Schmelzmodells: T2m, Globalstrahlung, Niederschlag mit Phase, Schneefallgrenze bis ≈ 120 h, T925/850/700 |
| Höhen-Zeit-Schnitt `nowcast/heightTime/` (HZS) | Schneefall- und Nullgradgrenze am Ort, 48 h und 14 Tage | Ansicht „Nullgradgrenze gegen Gletscherhöhe“ im Reiter Tour |
| Schneefallgrenze als Fläche `snowCap/` (SK), 3D-Bühne `nowcast/cellTowers/` (ZT), Terrarium-Gelände | Fläche im Gelände; Karte \| Karte + 3D \| 3D | Schneegrenze und Nullgradgrenze als Fläche auf dem Gletscher; 3D-Steckbrief mit früheren Umrissen |
| Stationen `obsStore.ts` (SwissMetNet, TAWES, DWD) | Messwerte live | Jungfraujoch, Corvatsch, Sonnblick, Zugspitze, Weissfluhjoch als Messung neben dem Modell |
| Punktarchiv + Hindcast (`buscosun-archiv`, `buscosun-hindcast`) | Prüfstand der Fusion | 24 Stationen über 1 800 m mit Messwerten seit 24.05.2023 (u. a. Jungfraujoch 3 571 m, Corvatsch, Sonnblick, Zugspitze, Rudolfshütte, Grimsel Hospiz): Temperaturfehler in der Höhe messen, Schmelzmodell eichen |
| Warn-Layer-Regel, `avalanche.ts`, SLF-CAAML (DATA_SOURCES X3) | Amtliches nur wörtlich, Lawinen-Links | Gefahrenhinweise nur als Zitat, Lawinenbulletin verlinkt |
| Teilen SH0–SH6, `og-meta`, Favoriten, nivo im Lazy-Chunk | Zustand in der URL, Vorschaubild | Gletscher folgen, Steckbrief teilen, Diagramme |
| NASA FIRMS, Thermalanomalien | Brände | **Kein fachlicher Beitrag.** Wiederverwendbar ist nur das Muster der Ereignis-Registry mit stabiler ID, für amtlich gemeldete Gletscherereignisse |

**Zwei Lücken im Bestand:**

1. **Nullgradgrenze über 3 000 m.** Der Cube führt T925/850/700 und keine Geopotentialhöhen; der Höhen-Zeit-Schnitt rechnet deshalb nur bis ≈ 3 000 m (E-HZS-4). Gleichgewichtslinien liegen bei 3 000–3 300 m, Firnbecken bis 4 500 m. Abhilfe: `hzerocl` aus ICON-D2 und ICON-EU (DWD Open Data, CC BY 4.0) direkt im Gletscher-Job lesen, ohne Eingriff in Fusion (E-GL-4).
2. **Temperatur in der Höhe.** An Bergorten trägt der Cube weniger als 5 % (V-FI-13), der Höhenrest dominiert. Das Schmelzmodell nimmt die Temperatur deshalb aus den Druckflächen über dem Höhenband und korrigiert sie mit dem Fehler, den das Archiv an den Bergstationen misst.

Hinweis: Laut `CLAUDE.md` laufen alle 3D-Ansichten als MapLibre-Custom-Layer; Three.js, WebGPU und PMTiles sind nicht im Code. Das Konzept plant ohne sie.

## Zusätzliche Daten

Grüne Quellen reichen für alle Stufen; die gelben erleichtern einzelne Schritte, die roten werden nur verlinkt oder zitiert. Bewertet nach deinen Quellenregeln aus der Waldbrand-Linie: offen, kommerziell nutzbar, ohne Key und ohne NC-Klausel. Lizenzen am Originaltext geprüft, soweit lesbar; „prüfen“ heißt: vor dem Bau nachlesen. Die Ampel-Spalte ist änderbar.

| Bereich | Quelle | Wofür | Takt | Zugriff | Lizenz | Ampel |
| --- | --- | --- | --- | --- | --- | --- |
| Umrisse | [GLAMOS SGI2016 + SGI1850/1931/1973/2010, verschwundene Gletscher](https://glamos.ch/en/downloads) | Umrisse CH, Schutt getrennt kartiert | statisch (r2020, r2025) | ZIP direkt | CC BY 4.0 | Grün |
| Umrisse | [AGI 5, PANGAEA 991106](https://doi.pangaea.de/10.1594/PANGAEA.991106) | Umrisse AT, vor allem 2022/23, rund 800 Gletscher | neu, Datensatz noch in Kuration | PANGAEA | CC BY 4.0; bis zur Freigabe GI4 nutzen | Gelb |
| Umrisse | [GI4 2015, PANGAEA 887415](https://doi.pangaea.de/10.1594/PANGAEA.887415), GI1–GI3 | Umrisse AT 2015 und historisch | statisch | Shapefile | CC BY 3.0; GI1–GI3 prüfen | Grün |
| Umrisse | [Paul et al. 2020, Alpeninventar](https://doi.pangaea.de/10.1594/PANGAEA.909133) | 4 394 Gletscher aus Sentinel-2 2015/16, deckt DE | statisch | ZIP | CC BY 4.0 | Grün |
| Umrisse | [RGI 7.0](https://nsidc.org/data/nsidc-0770/versions/7) | gemeinsamer ID-Schlüssel, Brücke zu den Projektionen | statisch | NSIDC mit Earthdata-Login | CC BY 4.0; einmal laden und spiegeln | Gelb |
| Messreihen | [GLAMOS Massenbilanz, Länge, Volumen, Geschwindigkeit](https://glamos.ch/en/downloads) | Bilanz je Höhenband (≈ 20 Gletscher), Länge (> 100) | jährlich | CSV | CC BY 4.0 | Grün |
| Messreihen | [WGMS FoG und AMCE](https://wgms.ch/mass_change_estimates/) | jährliche Massenänderung je Gletscher 1976–2025 | jährlich (Stand 10.02.2026) | ZIP, CSV/NetCDF | offen mit Zitierpflicht | Grün |
| Messreihen | [ÖAV-Längenänderungen auf PANGAEA](https://doi.pangaea.de/10.1594/PANGAEA.971350) | rund 90 Gletscher je Jahr | jährlich | TSV | CC BY 4.0; Jahrgänge 2023/24 und 2024/25 dort prüfen | Grün |
| Messreihen | Hintereisferner (UIBK), [Goldbergkees (WGMS)](https://wgms.ch/products_ref_glaciers/goldbergkees-alps/) | Bilanz, Gleichgewichtslinie, AAR, Geschwindigkeit | jährlich | PANGAEA, WGMS | CC BY 4.0 | Grün |
| Messreihen | [BAdW, bayerische Gletscher](https://badw.de/presse/news-pressemitteilungen/artikel/neue-vermessung-zeigt-beschleunigten-gletscherschwund) | Fläche und Dicke der vier deutschen Gletscher | Vermessungskampagnen | nur Pressetexte | keine Datenlizenz; Zahlen nur zitieren | Rot |
| Satellit | [Sentinel-2 L2A über Earth Search](https://registry.opendata.aws/sentinel-2-l2a-cogs/) | 10–20 m, alle 5 Tage | Stunden nach der Aufnahme | STAC + COG, anonym | Copernicus, frei | Grün |
| Satellit | [TSLA Alpen 2000–2025](https://zenodo.org/records/18223929) | ≈ 200 000 Schneegrenzen, Gletscher > 1 km² | v1.0, Januar 2026 | Zenodo | CC BY 4.0 (Datensatz zu einem Preprint) | Grün |
| Satellit | [NASA ITS_LIVE](https://its-live.jpl.nasa.gov/) | Fließgeschwindigkeit, 120 m | laufend | S3 ohne Key | CC0; nur für große Gletscher brauchbar | Grün |
| Satellit | Landsat Collection 2 L2 | Rückblick vor 2015 | laufend | USGS Requester Pays; Planetary Computer prüfen | frei | Gelb |
| Satellit | [CLMS HR-S&I / HR-WSI](https://land.copernicus.eu/en/production-updates/european-snow-and-ice-data-production-has-concluded-the-catalogue-will-remain-accessible) | Schneebedeckung 20–60 m | alte Produktion beendet, Nachfolger im Aufbau | Login, Zugangsweg unklar | offen | Gelb |
| Gelände | [swissALTI3D](https://data.geo.admin.ch/api/stac/v1/collections/ch.swisstopo.swissalti3d) | 0,5–2 m, Zeitstand je Fläche | jährlich ein Sechstel der Schweiz | STAC, COG | OGD swisstopo, Quellenangabe Pflicht | Grün |
| Gelände | [Copernicus DEM GLO-30](https://registry.opendata.aws/copernicus-dem/) | 30 m, Epoche 2011–2015 | statisch | S3 ohne Key | frei, fester Vermerk | Grün |
| Gelände | Länder-DGMs (Tirol ALS, BEV 1 m, Bayern DGM1) | 0,5–1 m | alle paar Jahre | Download | CC BY 4.0 nur sekundär belegt | Gelb |
| Gelände | [Hugonnet et al. 2021](https://www.theia-land.fr/en/blog/product/rate-of-glacier-elevation-changes-from-2000-to-2019/) | Höhenänderung 2000–2019, 100 m | statisch | Theia | CC BY 4.0 laut Katalog, Original nicht lesbar | Gelb |
| Gelände | TanDEM-X 30 m EDEM | Höhenmodell | statisch | DLR-Konto | nur nicht-kommerziell | Rot |
| Wetter | [DWD ICON-D2/-EU](https://opendata.dwd.de/weather/nwp/icon-d2/grib/): `hzerocl`, `h_snow`, `alb_rad` | Nullgradgrenze über 3 000 m, Schneedecke | stündlich bzw. 3-stündlich | Open Data | CC BY 4.0 | Grün |
| Wetter | [MeteoSchweiz OGD, SwissMetNet](https://opendatadocs.meteoswiss.ch/general/terms-of-use) | Hochstationen, 10 min | laufend | STAC, CSV | CC BY 4.0 | Grün |
| Wetter | [SLF IMIS](https://www.envidat.ch/dataset/imis-measuring-network) | ≈ 200 Stationen 2 000–3 000 m: Schneehöhe, Temperatur, reflektierte Kurzwelle | 30 min | API | CC BY 4.0, Quelle sichtbar | Grün |
| Wetter | [GeoSphere Data Hub](https://dataset.api.hub.geosphere.at/v1/docs): TAWES, SNOWGRID, SPARTACUS | AT-Stationen, Schnee- und Klimagitter 1 km | laufend | API ohne Key, 240 Anfragen/h | CC BY 4.0; im Job bündeln | Gelb |
| Wetter | [CAMS-Saharastaub](https://ads.atmosphere.copernicus.eu/datasets/cams-global-atmospheric-composition-forecasts) | Staub-AOD, Ablagerung | täglich | Konto + Key | CC BY | Gelb |
| Gefahren, Wasser | [Gletscherseen CH (Mölg et al. 2021)](https://doi.pangaea.de/10.1594/PANGAEA.934190) | 1 192 Seen seit der Kleinen Eiszeit, 987 davon 2016 vorhanden | statisch | PANGAEA | CC BY 4.0 | Grün |
| Gefahren, Wasser | [PERMOS](https://www.permos.ch/data-portal) | Permafrost, Blockgletscher | jährlich | Portal | CC BY 4.0 | Grün |
| Gefahren, Wasser | [SLF-Lawinenbulletin, CAAML](https://aws.slf.ch/api/bulletin/caaml) | Lawinenlage CH im Winter | 2 × täglich | API | CC BY 4.0, nur wörtlich | Grün |
| Gefahren, Wasser | [BAFU Hydrodaten, Hydro-CH2018](https://www.bafu.admin.ch/de/daten-hydro-ch2018) | Abfluss, Szenarien vergletscherter Gebiete | laufend, statisch | data.geo.admin.ch | frei inkl. kommerziell; CC BY 4.0 | Grün |
| Gefahren, Wasser | [Gletscherseen AT (Buckel & Otto 2018)](https://doi.pangaea.de/10.1594/PANGAEA.885931) | Seen in Österreich | statisch | PANGAEA | CC BY-NC-SA 3.0 | Rot |
| Gefahren, Wasser | eHYD (AT), GKD Bayern | Abfluss | laufend | Download | keine veröffentlichte Lizenz | Rot |
| Projektion | [GloGEM CMIP6 v2](https://zenodo.org/records/17632573) | Volumen und Fläche je Gletscher bis 2100, SSP1-1.9 bis SSP5-8.5 | statisch (11/2025) | NetCDF, 3,4 GB | CC BY 4.0 | Grün |
| Projektion | [OGGM-Standardprojektionen](https://docs.oggm.org/en/latest/download-projections.html) | je Gletscher | statisch | Server Uni Bremen | Lizenz nicht gefunden; bis zur Klärung nicht nutzen | Rot |
| Bilder | swisstopo LUBIS, SWISSIMAGE ab 2017, [basemap.at](https://basemap.at/en/) | historische Luftbilder, Orthofotos | je Befliegung | STAC, WMTS | OGD, CC BY 4.0 | Grün |
| Bilder | [foto-webcam.eu](https://www.foto-webcam.eu/impressum/), Roundshot, Panomax | Webcams | – | – | Rechte vorbehalten; nur verlinken | Rot |

**Mindest-Datensatz für Stufe 1:** SGI2016 und GI4/AGI 5 als Umrisse, Paul et al. 2020 für die deutschen Gletscher, GLAMOS-, WGMS- und ÖAV-Reihen, BAdW-Zahlen als Zitat. Für Stufe 2 kommen Sentinel-2, TSLA und Copernicus DEM dazu, für Stufe 3 `hzerocl`, SwissMetNet und IMIS.

**Saharastaub ohne Key:** Die Wirkung auf den Gletscher zeigt die Sentinel-2-Albedo direkt (dunkler als üblich). Die Ursache „Staub“ lässt sich ohne CAMS nicht belegen; das Feature sagt dann „dunkler als üblich“, nicht „Saharastaub“ (E-GL-7).

## Methoden und Technik

Am besten in eine statische Pipeline passen Schneegrenze und AAR, das Schmelzmodell aus buscosun Fusion und die Albedo. Fließgeschwindigkeit lohnt sich nur für etwa zehn große Gletscher.

| Kennzahl | Methode | Eingang | Takt | Eignung |
| --- | --- | --- | --- | --- |
| Schmelze heute und Ausblick | Enhanced Temperature Index je 50-m-Höhenband ([Pellicciotti et al. 2005](https://discovery.dundee.ac.uk/en/publications/an-enhanced-temperature-index-glacier-melt-model-including-the-sh/)) | Fusion-Cube, `hzerocl`, Albedo aus Sentinel-2 | 4 × täglich mit dem Punkt-Cron | hoch, nach Eichung |
| Schneegrenze, AAR, Ausaperung | Schnee/Eis-Klassifikation je wolkenarmer Szene, Höhe aus dem DEM ([Rabatel et al. 2005](https://www.cambridge.org/core/journals/journal-of-glaciology/article/using-remotesensing-data-to-determine-equilibriumline-altitude-and-massbalance-time-series-validation-on-three-french-glaciers-19942002/7EE925C092A3DB1E15EBDAE02E769F68); Verfahren wie [TSLA](https://essd.copernicus.org/preprints/essd-2026-35/)) | Sentinel-2 B03/B04/B08/B11 + SCL, Copernicus DEM | je Szene | hoch |
| Albedo, „dunkler als üblich“ | Liang-Formel in der Sentinel-2-Form von [Naegeli et al. 2017](https://www.mdpi.com/2072-4292/9/2/110), Anomalie gegen die eigene Klimatologie | Sentinel-2 B02/B04/B08/B11/B12 | je Szene | mittel bis hoch |
| Fläche | Inventar-Umriss bleibt Referenz; Sentinel-2 zeigt nur eisfreie Stellen darin (Rot/SWIR, [Paul et al. 2020](https://essd.copernicus.org/articles/12/1805/2020/)) | Sentinel-2 Ende August bis September | jährlich | mittel, nur als Signal |
| Höhenänderung | DEM-Differenz nach Ko-Registrierung ([Nuth & Kääb 2011 in xDEM](https://xdem.readthedocs.io/en/stable/coregistration.html)), Dichte 850 ± 60 kg/m³ ([Huss 2013](https://tc.copernicus.org/articles/7/877/2013/)) | swissALTI3D, Copernicus DEM 2011–2015, Länder-DGMs | je neuer DEM-Epoche | mittel |
| Fließgeschwindigkeit | ITS_LIVE-Jahresmosaik | ITS_LIVE | jährlich | gering; nur ≈ 10 große Gletscher |
| „Wann ist er weg?“ | erstes Jahr mit Volumen unter 10 % von 2020, je SSP | GloGEM CMIP6 v2 | statisch | hoch, nur als Spanne |
| Gemessene Bilanz | Übernahme der Messreihen samt Methode (glaziologisch oder geodätisch) | GLAMOS, WGMS, ÖAV | jährlich | hoch |

### Schmelzmodell

$$
M = TF \cdot T + SRF \cdot (1 - \alpha) \cdot G \quad \text{für } T > T_T, \qquad M = 0 \text{ sonst}
$$

M ist die Schmelze je Zeitschritt in mm w. e., T die Lufttemperatur im Höhenband, G die Globalstrahlung, α die Albedo (Schnee oder Eis je Band). TF, SRF und T_T kommen aus der Eichung.

- **Temperatur im Band:** aus T925/850/700 über dem Ort hypsometrisch interpoliert (wie `profileColumn.ts`), darüber an `hzerocl` aus ICON-D2/-EU verankert; nicht aus T2m mit fester Lapse-Rate. Die Kälteschicht über dem Eis wird an Jungfraujoch, Corvatsch, Sonnblick und Weissfluhjoch gemessen, nicht angenommen.
- **Schnee oder Eis je Band:** Startwert aus der letzten klaren Sentinel-2-Szene. Dazwischen verbraucht das Modell die Schneedecke und baut Neuschnee aus Fusion-Niederschlag mal Schneeanteil auf.
- **Eichung:** GLAMOS-Bilanzen je Höhenband 2023/24 bis 2025/26, angetrieben mit den gemessenen Werten der Bergstationen aus dem Archiv. Geprüft an Gletschern außerhalb der Eichung und am Hintereisferner 2024/25 (Sommerbilanz − 2 595 mm w. e.). Der Gradtagfaktor für Eis ist nicht belegt und kommt aus der Eichung.
- **Ausgabe:** Schmelze heute, in 7 und in 14 Tagen als cm Eis und m³ Wasser, mit p10–p90 aus den Fusion-Quantilen; Zeitraster wie der Cube (0–48 h stündlich, bis 120 h dreistündlich, bis 336 h sechsstündlich).
- **Gate:** Ohne bestandene Eichung zeigt das Feature nur einen Schmelzindex ohne Einheit.

### Schneegrenze aus Sentinel-2

- Je neuer Szene zuerst die SCL (20 m, wenige KB je Gletscher). Erst ab 70 % klarer Gletscherfläche werden die Bänder gelesen.
- Schnee, Eis und Schutt per NDSI und Schwellen; Schuttflächen aus SGI2016 und AGI 5 maskiert, weil optisch nicht trennbar.
- Schneegrenze = Höhe, bei der der Schneeanteil im Höhenband 50 % kreuzt; Genauigkeit etwa 100 m RMSE wie bei TSLA. Ist der Gletscher ganz schneefrei (AAR 0, wie 2022), steht dort „über dem Gipfel“.
- Klimatologie je Gletscher und Kalenderwoche aus TSLA 2000–2025, daraus Sätze wie „Schneegrenze 350 m höher als üblich für Anfang August“.

### Größenklassen

| Klasse | Größe | Was das Feature liefert |
| --- | --- | --- |
| A, Leitgletscher | ab 1 km² | alles: Schneegrenze, AAR, Albedo, Schmelze je Höhenband, 3D; Geschwindigkeit für die größten |
| B | 0,1 bis 1 km² | Ausaperung in %, Albedo-Anomalie, Schmelze als Gletschermittel, Bild |
| C | unter 0,1 km², darunter alle vier deutschen | Inventar, amtliche Zahlen, Schmelze, Bild; keine Satellitenkennzahl |

Blaueis hat 1,5 ha, bei 10 m rund 150 Pixel: zu wenig, um eine Jahresänderung vom Randrauschen zu trennen. 87 % der österreichischen Gletscher sind kleiner als 0,5 km². Die Zahl je Klasse misst GL-0.

### Datenmenge und Rechenzeit

Vergletschert sind in DACH etwa 1 000 km². Mit Puffer und COG-Blockraster liest ein Aufnahmetag höchstens rund 650 MB, eine Saison rund 16 GB (eigene Überschlagsrechnung; die Blockgröße der COGs ist nicht belegt). Gruppiert je Sentinel-2-Kachel und Tag bleibt ein täglicher Job weit unter 6 h und 14 GB. GL-0 misst Durchsatz und Szenenzahl am echten STAC.

## Feature: was der Nutzer erlebt

Der Nutzer sieht zuerst die DACH-Lage auf einer Karte aller Gletscher und springt von dort in den Steckbrief eines Gletschers mit fünf Reitern. Was im Vordergrund steht, folgt der Jahreszeit.

### Einstieg: DACH-Lage

- **Karte aller rund 2 200 Gletscher**, eingefärbt nach einer wählbaren Größe: Schmelze heute (Modell), Ausaperung (Satellit), Verlust dieser Saison (Modell), Längenänderung zuletzt (gemessen), Flächenänderung seit 1973.
- **Lageband** oben: Saisonstatus und die jüngsten amtlichen Zahlen je Land, mit Datum.
- **„Was sich verändert hat“**: ein Verlauf mit neuen Sentinel-2-Szenen, Hitzetagen über der Gleichgewichtslinie, Neuschnee, amtlichen Berichten und Statusverlusten; jede Zeile mit Quelle und Zeit.
- **Ranglisten:** stärkste Schmelze heute, größter Saisonverlust, größter Längenverlust laut ÖAV und GLAMOS, verschwundene Gletscher mit Kriterium.

### Steckbrief je Gletscher

| Reiter | Was er zeigt | Herkunft |
| --- | --- | --- |
| Heute | Schmelze heute, in 7 und in 14 Tagen (cm Eis, m³ Wasser, Spanne); Temperatur an Zunge, Gleichgewichtslinie und Firn; Nullgradgrenze; Neuschnee; Messwert der nächsten Hochstation | Modell, gemessen |
| Saison | Schneegrenze je Szene vor dem Band der Jahre 2000–2025, Ausaperung (AAR), Albedo-Anomalie, modellierter Gletscherschwundtag, Saisonschätzung neben der amtlichen Bilanz | Satellit, Modell, gemessen |
| Langzeit | Umrisse 1850/1973/2016 bzw. GI1 bis AGI 5, Vorher-nachher-Regler (Sentinel-2 2017 gegen heute), Längen- und Massenreihe, Höhenänderung, Projektion als Band je Szenario | gemessen, Modell |
| Tour | Nullgradgrenze gegen Gletscherhöhe (48 h und 14 Tage), Nächte ohne Frost am Zustieg, Blankeis-Anteil, Neuschnee auf Eis; Links zu SAC-Tourenportal, alpenvereinaktiv, Hütte und Lawinenbulletin | Modell, Satellit, Links |
| Quellen | Herkunft, Stand und Lizenz je Kennzahl; blockierte Quellen | – |

### Jahreszeiten

- **Juni bis September:** Schmelze, Schneegrenze, Hitzewellen, dunkle Gletscher. Hier liegt der Höhepunkt des Interesses.
- **Oktober:** Saisonbilanz, Vergleich mit GLAMOS, verschwundene Gletscher, erste Schneedecke.
- **November bis Mai:** Schneehöhe auf den Gletschern (IMIS, Modell), Lawinenbulletin verlinkt, Rückblick; im März ÖAV- und BAdW-Bericht.

### Updates

- **Folgen:** Gletscher als Favorit (bestehende Favoriten), dazu „Neu seit deinem letzten Besuch“ lokal im Browser.
- **Wochenkarte „Gletscher-Update“:** jeden Montag ein teilbares Bild mit den drei wichtigsten Änderungen, über die Share-Linie mit Vorschaubild.
- **Einbetten und Download:** Grafik je Gletscher und CSV der Reihen mit Quellenvermerk, für Bildung und Medien.

### Regeln

- Jeder Wert trägt ein Herkunftszeichen: **gemessen**, **Satellit**, **Modell**, **amtlich**.
- Jede Fläche trägt ihr Bezugsjahr; Inventare verschiedener Länder werden nie als gleiches Jahr ausgegeben.
- „Verschwunden“ nur mit Kriterium und Quelle (GLAMOS: unter 1 ha), nie aus dem eigenen Satellitenbild.
- Gefahren nur als wörtliches Zitat mit Ausgabezeit, wie im Warn-Layer.
- Projektion nie als einzelnes Jahr, immer als Spanne mit Szenario.
- Der Tour-Reiter spricht keine Freigabe aus: kein „begehbar“, kein „sicher“.

## UI-Aufbau

Das Feature übernimmt das Command-Deck von Brandradar, Autobahnwetter und Seewetter: Rail, Topbar, Dock links, Karte in der Mitte, Readout rechts. Das Mockup zeigt Desktop 1440 (DACH-Lage, Steckbrief Hintereisferner) und Mobil 390, alle vier Ansichten klickbar.

Zum Anklicken: [Gletscher-Monitor DACH – UI-Mockup](https://claude.ai/artifact/TWgwJKGeQ6eC3ksDWKsVEY).

| Bereich | Größe (Desktop) | Inhalt |
| --- | --- | --- |
| Rail | 62 px | Feature-Navigation, neues Icon „Gletscher“ |
| Topbar | 60 px | Titel, Stand je Herkunft (Modell, Sentinel-2, Messung), Saisonstatus, Teilen; im Steckbrief Zeitpunkt und Folgen |
| Dock links | 250 px | Suche, Land, „Karte färben nach“ (vier Größen mit Herkunft), Rangliste; im Steckbrief Kennzahlen, Ansicht Karte oder 3D, Ebenen |
| Karte | 728 bzw. 708 px | DACH: Gletscher als Kreise nach Fläche, Farbe nach Größe, Legende, Auswahl-Pille. Steckbrief: Relief, Eis, Umriss 2003, Schneegrenze, Hütte, 3D, Vergleichsregler |
| Unter der Karte (DACH) | 410 px hoch | Saisonverlauf der Massenbilanz je Land, Tage mit Nullgradgrenze über 4 000 m |
| Readout rechts | 400 bzw. 420 px | DACH-Lage je Land, „Was sich verändert hat“, nächste Berichte; im Steckbrief die Reiter Heute, Saison, Langzeit, Tour, Quellen |

### Interaktionen

- **Größe wählen:** Kreise, Legende und Rangliste rechnen neu; ohne Wert erscheint ein gestrichelter Kreis mit Grund (zu klein, keine Messung).
- **Gletscher wählen** (Karte, Liste, Suche): Pille mit Wert und Herkunft, von dort in den Steckbrief.
- **Zeitpunkt im Steckbrief:** „heute“ und „Beispiel Hitzewelle“ zeigen dieselbe Seite im Oktober und im August.
- **Karte oder 3D**, Ebenen Umriss 2003 und Schneegrenze; der Reiter Langzeit schaltet die Karte auf den Vorher-nachher-Regler.
- **Zustand in der URL**, etwa `/gletscher/hintereisferner?tab=saison&t=2026-08-12&v=3d`, passend zur Share-Linie.

### Zeichensprache

- Herkunft als Kennzeichen an jedem Wert: gemessen (Salbei), Satellit (Violett), Modell (Amber), amtlich (Tinte).
- Verlust in Terrakotta, Schnee und Schmelze in Gletscher-Cyan, jeweils eine Farbe von hell nach dunkel. Länderkurven Cyan (CH), Terrakotta (AT), Violett (DE), mit dem Palettenprüfer auf Farbfehlsichtigkeit geprüft.
- Gestrichelter Kreis = kein Wert; gestrichelte Linie = Umriss eines früheren Jahres.
- Token-Namespace `--gl-*`, Akzent `#1E87A8`; Schrift wie im Deck (League Spartan, IBM Plex Mono).

### Mobil (bis 767 px)

Karte oben, darunter Größen-Chips, Länderkarten zum Wischen, Rangliste und Verlauf. Im Steckbrief Karte oder 3D oben, dann Zeitpunkt und vier Reiter; die Schmelze der nächsten 7 Tage als Balken.

### Mockup-Daten

Real: GLAMOS 2025/26, ÖAV 2024/25, AGI 5, BAdW 2025, die UIBK-Werte des Hintereisferners 2024/25, Umrisse RGI 7 (2003), Gelände SRTM, Längenreihe 1847–2003. Illustrativ: Schmelze und Ausblick, Saisonkurven, Schneegrenzen-Verlauf, Ausaperung, Projektion und die Fläche 2026, die aus dem Umriss 2003 geschätzt ist.

## Datenpipeline und Architektur

Alle schweren Schritte laufen in GitHub Actions; der Browser bekommt geprüfte JSON-Dateien über jsDelivr, wie bei Radar, Cube, Autobahn- und Seewetter. Kein Backend, kein Netlify-Traffic.

**Abbildung: Datenpipeline (Stand Konzept)** — Quellen: Messnetze (GLAMOS, AGI 5, WGMS, ÖAV, BAdW) · Sentinel-2 L2A (Earth Search, COG, SCL + 4 Bänder) · Punkt-Cube (buscosun Fusion 0–336 h) · ICON-D2/-EU (`hzerocl`, Nullgrad über 3 000 m) · Bergstationen (SMN, TAWES, IMIS + Punktarchiv, eichen). Jobs: `glacier-static` (jährlich und manuell; Umrisse, IDs, Hypsometrie) · `glacier-sat` (täglich 16 und 22 UTC; Schneegrenze, AAR, Albedo) · `glacier-melt` (im Punkt-Cron, 4 × täglich; Schmelze je Höhenband). Ablagen: `buscosun-glacier` (statisch: outline/, hypso/, series/, proj/) · `buscosun-data/glacier/v1/` (obs/, melt/, feed.json, status.json). Browser: `src/glacier/` als Lazy-Chunk; Vorher-nachher lädt Sentinel-2 direkt per COG-Leser. *Der Plan (`audit/gletscher-plan.md` §1) weicht bei Ablage und Melt-Job davon ab.*

Satellit und Modell laufen getrennt: Ein Fehler im Satellitenjob nimmt nur die Schneegrenzen, nie die Schmelze. Bergstationen und Punktarchiv eichen das Schmelzmodell; Sentinel-2-Bilder für den Vorher-nachher-Regler lädt der Browser direkt wie im Brandradar.

### Bausteine

| Baustein | Ort | Aufgabe |
| --- | --- | --- |
| `glacier-static.yml` + `scripts/glacier/static-build.mjs` | Repo `buscosun-glacier` | Inventare laden, IDs über Flächenüberlappung zuordnen (RGI 6/7, SGI, GI, WGMS), Umrisse in Stufen vereinfachen, Hypsometrie je 50-m-Band, Reihen von GLAMOS, WGMS und ÖAV normieren, GloGEM-Projektion je Gletscher |
| `glacier-sat.yml` + `scripts/glacier/sat-scan.mjs` | buscosun-data | STAC-Suche nach neuen Szenen der letzten 72 h, SCL zuerst, Bänder per HTTP-Range mit dem COG-Leser aus `fire/detail/cogTiff.ts`, Klassifikation, Schneegrenze, AAR, Albedo |
| Schritt `glacier-melt` im `point.yml` + `scripts/glacier/melt.mjs` | buscosun-data | liest den eben gebauten Cube mit `read-point.mjs`, dazu `hzerocl`; rechnet je Höhenband und Schritt; Quantile über `fusion/dist.ts`; ein Fehler nimmt nur die Gletscherdatei, nie den Cube |
| `glacier/v1/obs/<jahr>/<id>.json` | buscosun-data | je Szene: Datum, Klaranteil, Schneegrenze mit Streuung, AAR, Albedo |
| `glacier/v1/melt/<lauf>.json` | buscosun-data | Schmelze je Gletscher und Band 0–336 h mit p10/p50/p90, Gletscherschwundtag |
| `glacier/v1/feed.json`, `status.json` | buscosun-data | Einträge für „Was sich verändert hat“, Laufstatus, Prüfer-Bilanz |
| `src/glacier/` | buscosun-web, Lazy-Chunk | Kartenprofil `glacier` (Muster `mapProfile`), Steckbrief, 3D-Bühne (Muster ZT), Vorher-nachher (Muster `FireCogViewer`), Vertrag `glacierContract.ts` |

### Budget (Schätzung, GL-0 misst)

Je Szene und Gletscher rund 150 Byte, also etwa 7 MB im Jahr für alle Gletscher, gepackt rund 2 MB. Ein Schmelzlauf für 2 200 Gletscher bei 57 Schritten liegt geschätzt bei 1–3 MB gepackt; nur der neueste und der vorige Lauf bleiben liegen. Die vereinfachten Umrisse aller Epochen liegen im eigenen Repo, weil sie fast nie wechseln.

### Repo-Regeln, die direkt greifen

- Flag `?gl=1`, voreingestellt aus bis Gate D.
- Herkunft je Wert im Vertrag: `measured`, `satellite`, `model`, `official`; Amtliches nur wörtlich.
- Prüfer sperren Unplausibles, etwa eine Schneegrenze mehr als 300 m außerhalb der Gletscherhöhe oder eine Schmelze bei Frost im ganzen Band.
- buscosun Fusion wird nur aufgerufen, nie geändert; `hzerocl` liest der Gletscher-Job selbst.
- Verifier im Repo-Stil: `verify:glacier-contract`, `-static`, `-sat`, `-melt`, `-ui`; eigener Chunk, `eagerJs` darf nicht wachsen.

## Stufenplan

Atlas und Messreihen kommen zuerst, weil sie ohne Modell und ohne Eichung ehrlich sind. Die Schmelze folgt erst, wenn die Eichung besteht.

**Abbildung: Stufenplan** — GL-0 Spike (Szenen, MB, Lizenzen, Eichtest) → Gate A (deine Wahl) → GL-1 Atlas (Umrisse, IDs, Messreihen, DACH-Lage; erste Stufe hinter `?gl=1`) → GL-2 Satellit (Schneegrenze, AAR, Albedo, Saison 2026) → Gate B (Werte plausibel) → GL-3 Schmelze (0–336 h, Eichung, Prüfstand) → Gate C (Eichung grün) → GL-4 Steckbrief (fünf Reiter, 3D-Bühne, Vergleich) → GL-5 Updates (Feed, Ranglisten, Wochenkarte) → Gate D (live für alle) → GL-6 Ausbau (DEM-Epochen, Fließen, Winter/IMIS).

Gate A hängt an deinen Entscheidungen E-GL-1 bis E-GL-10. Gate B verlangt 30 Tage Schneegrenzen ohne Prüfer-Ausreißer; Gate C, dass das Schmelzmodell an Gletschern außerhalb der Eichung die GLAMOS-Bilanz trifft (Schwelle legt GL-0 aus den Messwerten fest). Umsetzung je Phase per Claude Code nach Plan; Commits, Pushes und das Einschalten bleiben deine Gates.

## Risiken und Entscheidungen

Das größte Risiko ist Vertrauen: Wer eine Modellzahl als Messung liest oder den Tour-Reiter als Freigabe, entscheidet am Berg falsch. Darum steht die Herkunft an jedem Wert und Amtliches über allem.

| Risiko | Wirkung | Gegenmaßnahme |
| --- | --- | --- |
| Modellschmelze wird als Messung gelesen | falsche Rekordmeldungen, Vertrauensverlust | Herkunftszeichen, Eich-Gate, amtliche Zahl daneben |
| Tour-Reiter wird als Freigabe gelesen | Sicherheits- und Haftungsfrage | keine Freigabesprache, Links zu Hütten und Verhältnisberichten, Vorbehalt auf Reiter und Kachel |
| Temperatur in der Höhe falsch (V-FI-13) | Schmelze systematisch zu hoch oder zu tief | Druckflächen + `hzerocl`, Fehler an 24 Bergstationen gemessen, Prüfstand |
| Wolken und Neuschnee | Schneegrenze fehlt oder liegt zu tief | 70-%-Schwelle, „keine klare Szene seit … Tagen“, Neuschnee aus Fusion als Hinweis |
| Schuttbedeckte Zungen | Eis wird als Fels gelesen | Schuttflächen aus SGI2016 und AGI 5 maskieren, Umriss bleibt das Inventar |
| Inventarjahre passen nicht zusammen (CH 2013–2018, AT 2021–2023, DE 2025) | Länder scheinbar vergleichbar | Bezugsjahr je Umriss, Vergleich nur über Raten |
| IDs passen nicht 1:1 (RGI 6, RGI 7, SGI, GI, WGMS) | Reihen am falschen Gletscher | eigene Zuordnungstabelle über Flächenüberlappung, Verifier |
| AGI 5 noch nicht freigegeben | AT nur mit Stand 2015 | GI4 als Übergang, Bezugsjahr sichtbar |
| Repo- und CDN-Budget | Veröffentlichung scheitert | Statisches im eigenen Repo, je Szene nur Zahlen, keine Bilder ablegen |
| Gefahrenfragen nach Blatten | Erwartung einer Warnung | nur Zitat der Behörden und Deep-Links, keine eigene Stufe |

### Entscheidungen für dich

| Nr. | Frage | Empfehlung |
| --- | --- | --- |
| E-GL-1 | Name, Route, Kachel | „Gletscher“, `/gletscher`, Aliase `/gletscherradar` und `/gletschermonitor`; Kachel 13, Flag `?gl=1` |
| E-GL-2 | Zuschnitt Stufe 1 | alle Gletscher als Atlas mit Messreihen; Satellitenwerte ab Klasse B in Stufe 2 |
| E-GL-3 | Ablage | veränderliche Daten in `glacier/` in buscosun-data; Umrisse und Hypsometrie im eigenen Repo `buscosun-glacier` (Muster `buscosun-worldcover`) |
| E-GL-4 | Nullgradgrenze über 3 000 m | `hzerocl` aus ICON-D2/-EU im Gletscher-Job lesen, ohne Fusion-Änderung; T600/T500 im Cube erst, wenn der Prüfstand es verlangt |
| E-GL-5 | Eichung | GLAMOS-Höhenbandbilanzen 2023/24 bis 2025/26 mit gemessenem Antrieb der Bergstationen |
| E-GL-6 | Gletscherpunkte im Punktarchiv | ja: rund 30 Leitgletscher mit je drei Höhen (Zunge, Gleichgewichtslinie, Firn) ab sofort mitschreiben, damit der Prüfstand die Saison 2027 bewerten kann |
| E-GL-7 | Saharastaub | kein CAMS-Key; „dunkler als üblich“ aus der Albedo reicht |
| E-GL-8 | Umrisse im Browser | GeoJSON in Stufen (Punkte bis Zoom 8, Flächen je Region ab Zoom 9) statt PMTiles; keine neue Abhängigkeit |
| E-GL-9 | Österreich-Umrisse | AGI 5 nach der PANGAEA-Freigabe, bis dahin GI4 2015 |
| E-GL-10 | Akzent und Tokens | Token-Namespace `--gl-*`, Akzent „Gletscher-Cyan“ `#``1E87A8`, abgesetzt von Petrol (Seewetter) und Steel (Regenradar) |

**Offene Prüfpunkte für GL-0:** Zahl der Gletscher je Größenklasse; nutzbare Sentinel-2-Szenen im Sommer 2026 je Leitgletscher; COG-Blockgröße und Durchsatz am Runner; Stand der AGI-5-Freigabe; Lizenzen von OGGM, Hugonnet und den Länder-DGMs am Original; welche Größen das Archiv an den Bergstationen führt (Globalstrahlung?); ob GLAMOS die Höhenbandbilanzen 2025/26 schon veröffentlicht hat; Gletscherschwundtag 2026 (Quellen nennen 29.06. und 02.07.).

## Quellen

Recherche am 11.10.2026; Zahlen vor externer Verwendung am Original gegenprüfen. Lizenzen und Datenquellen stehen zusätzlich in der Tabelle „Zusätzliche Daten“.

**Lage und Berichte:** [GLAMOS Annual Report 2025](https://doi.glamos.ch/pubs/annualrep/annualrep_2025.pdf) · [GLAMOS Bulletin 2025](https://doi.glamos.ch/pubs/glbulletin/glbulletin_2025.pdf) · [ETH News, Oktober 2026](https://ethz.ch/en/news-and-events/eth-news/news/2026/10/devastating-year-for-switzerlands-glaciers.html) · [20 Minuten, 2026](https://www.20min.ch/story/schweizer-gletscher-schrumpfen-25-kubikkilometer-eis-verschwanden-2026-103638723) · [Uni Fribourg, 01.10.2026](https://www.unifr.ch/unicom/de/news-events/news/35266/die-schweizer-gletscher-verlieren-weitere-funf-prozent-ihres-volumens) · [watson, 2026](https://www.watson.ch/schweiz/extremwetter/697510915-so-verheerend-schmolzen-die-schweizer-gletscher-2026) · [ÖAV-Gletscherbericht 2024/25](https://www.alpenverein.at/portal/news/2026/2026_03_13_gletscherbericht-24-25.php) · [vol.at, 18.09.2026](https://www.vol.at/historische-eisverluste-alpenverein-warnt-vor-rekordjahr-fuer-gletscher/10477178) · [BAdW, 19.03.2026](https://badw.de/presse/news-pressemitteilungen/artikel/neue-vermessung-zeigt-beschleunigten-gletscherschwund) · [Linsbauer et al. 2021, SGI2016](https://public-pages-files-2025.frontiersin.org/journals/earth-science/articles/10.3389/feart.2021.704189/text) · [Hartl et al. 2026, AGI 5](https://egusphere.copernicus.org/preprints/2026/egusphere-2026-1241/) · [Universität Innsbruck, Bericht HEF/KWF 2025](https://www.uibk.ac.at/media/filer_public/e3/22/e322c639-2577-4562-bc75-0cbdb76e92a2/bericht_hef-kwf2025.pdf) · [WSL zu Zekollari et al. 2019](https://www.wsl.ch/en/news/one-third-of-alpine-glaciers-could-be-saved/)

**Nutzerinteresse:** [DAV, 12.08.2026](https://www.alpenverein.de/verband/presse/pressemeldungen/klimawandel-in-den-alpen-tourenplanung-ist-wichtiger-denn-je) · [DAV, Klimawandelfolgen](https://www.alpenverein.de/verband/presse/hintergrundinfos/klimawandelfolgen-fuer-den-bergsport) · [SAC-Warnung, 21.07.2026](https://www.bluewin.ch/de/lifestyle/hitzesommer-sac-warnt-gefahren-hochgebirge-li.3536325) · [SRF zu SAC-Hütten](https://www.srf.ch/radio-srf-1/klimawandel-trifft-sac-huetten-jede-dritte-sac-huette-ist-potenziell-gefaehrdet) · [Mayer et al. 2024](https://ideas.repec.org/a/bpj/touwis/v16y2024i1p15-42n1006.html) · [Salim et al. 2026 (MRI)](https://mountainresearchinitiative.org/?p=35291) · [Euronews, 08.08.2026](https://de.euronews.com/2026/08/08/hitzewellen-verandern-die-gletscher-der-schweiz) · [utopia, Rhonegletscher-Vergleich](https://utopia.de/news/urlaubsfoto-geht-viral-klimakrise-ist-darauf-deutlich-erkennbar_717961/) · [Global Glacier Extinction Explorer](https://www.leinetal24.de/welt/viele-gletscher-verschwinden-noch-zu-unseren-lebzeiten-neue-karte-zeigt-wann-zr-94494979.html) · [Blatten 2025](https://en.wikipedia.org/wiki/2025_Blatten_glacier_collapse) · [ÖAV-Gletschermonitor](https://www.alpenverein.at/gletschermonitor) · [GLAMOS Mapviewer](https://glamos.ch/en/mapviewer)

**Methoden:** [Pellicciotti et al. 2005](https://discovery.dundee.ac.uk/en/publications/an-enhanced-temperature-index-glacier-melt-model-including-the-sh/) · [Rabatel et al. 2005](https://www.cambridge.org/core/journals/journal-of-glaciology/article/using-remotesensing-data-to-determine-equilibriumline-altitude-and-massbalance-time-series-validation-on-three-french-glaciers-19942002/7EE925C092A3DB1E15EBDAE02E769F68) · [Sommer et al. 2026, TSLA](https://essd.copernicus.org/preprints/essd-2026-35/) · [Naegeli et al. 2017](https://www.mdpi.com/2072-4292/9/2/110) · [Paul et al. 2020](https://essd.copernicus.org/articles/12/1805/2020/) · [Huss 2013](https://tc.copernicus.org/articles/7/877/2013/) · [xDEM, Ko-Registrierung](https://xdem.readthedocs.io/en/stable/coregistration.html) · [Braithwaite 2008](https://www.cambridge.org/core/journals/journal-of-glaciology/article/temperature-and-precipitation-climate-at-the-equilibriumline-altitude-of-glaciers-expressed-by-the-degreeday-factor-for-melting-snow/6C2362F61B7DE7F153247A039736D54C) · [Gabbi et al. 2015, Staub und Albedo](https://tc.copernicus.org/articles/9/1385/2015/)

**Im Repo gelesen:** `CLAUDE.md` (Stand, Stack), `architecture.md` §16, `audit/brandradar-satellitenbilder.md` (SAT0–SAT2h), `audit/hoehen-zeit-schnitt.md`, `audit/seewetter-konzept.md`, `src/fire/detail/cogTiff.ts`, `worldCover.ts`, `burnIndex.ts`, `src/avalanche.ts`, `src/designTokens.css`, `buscosun-hindcast/truth/stations.json`.
