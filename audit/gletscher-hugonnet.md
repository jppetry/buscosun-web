# Phase GH — Höhenänderung je Gletscher nach Hugonnet et al. 2021 auf `/gletscher`

Auftrag Jan 19.11.2026: je Gletscher die satellitengestützte Höhenänderung der Oberfläche 2000–2019 (Gesamtzeitraum und vier
Fünfjahreszeiträume, je mit Unsicherheit) aus den Pro-Gletscher-Tabellen von Hugonnet et al. 2021. Ohne Schalter an für alle
(Jans Entscheidung 19.11., Ausnahme von Regel 2). Nur die Tabellenwerte; die 100-m-Raster sind nicht Teil der Phase.

## 0 Status

| Punkt | Stand |
| --- | --- |
| Schritt 0 Lizenz | **grün** — CC BY 4.0 auf der Primärseite, ohne Login (§1) |
| Diagnose | §2 |
| Regeln | eingefroren vor dem ersten Zuordnungslauf: `audit/gletscher-hugonnet/regel-eingefroren.md`, sha256 `655e558b2e0fe06985728db0b576afec651a6e0956a26c61e2e7dec507a84e66` |
| Umsetzung | fertig (§3) |
| Lokaler Lauf | **1 081 von 2 199 Gletschern** mit Block (§4) |
| Daten | veröffentlicht 19.11.2026: Zweig `glacier` `b1f55b3b`, Zeiger `main` `4d9136a6` (§5) |
| Gate | **grün** bis auf zwei benannte Punkte: Budget von Hand angehoben, `verify:glacier-ui` (Browser) bricht an einer Stelle ab, die diese Phase nicht anfasst (§6) |
| Offen für Jan | ansehen, Push von `buscosun-web` (§8) |

## 1 Schritt 0 — Lizenz (19.11.2026)

Die Lage war widersprüchlich, deshalb am Original gelesen:

| Fundstelle | Wortlaut | Datum |
| --- | --- | --- |
| **Primärseite SEDOO**, `https://www.sedoo.fr/theia-publication-products/?uuid=c428c5b9-df8f-4f86-9b75-e04c778e29b9` (Ziel von `https://doi.org/10.6096/13`), Reiter „Download“, Abschnitt „Data policy“ | „This work is licensed under a Creative Commons Attribution 4.0 International License.“ (Link `http://creativecommons.org/licenses/by/4.0/`) | Seite gelesen 19.11.2026; Metadatensatz zuletzt geändert 2026-02-09 09:22:32 |
| dieselbe Seite, „Data Access Permissions“ | „Data is freely open for download.“ | 19.11.2026 |
| Metadatensatz hinter der Seite, `https://api.sedoo.fr/theia-catalogue-prod/metadata/c428c5b9-df8f-4f86-9b75-e04c778e29b9` | `distributionInformation`: `"registrationNeeded": false`, `"authenticationNeeded": false`, `dataPolicyDescription` = derselbe CC-BY-4.0-Satz | 19.11.2026 |
| dieselbe Seite, „How to cite“ | „Hugonnet, R., McNabb, R., Berthier, E., Menounos, B., Nuth, C., Girod, L., Farinotti, D., Huss, M., Dussaillant, I., Brun, F. & Kääb, A. (2021). Accelerated global glacier mass loss in the early twenty-first century - Dataset.. [dataset]. Theia. https://doi.org/10.6096/13“ | 19.11.2026 |
| DataCite, `https://api.datacite.org/dois/10.6096/13` | `"rightsList": []` — keine Lizenz eingetragen | 19.11.2026 |
| Theia-Produkttabelle, `https://www.theia-land.fr/en/products/` | Zeile „Rate of Glaciers Elevation Changes … CC-BY-NC 4.0“; auf derselben Seite verlinken andere „CC BY-NC 4.0“-Marken auf `creativecommons.org/licenses/by/4.0/` | 19.11.2026 |
| Theia-Produktseite, `https://www.theia-land.fr/en/blog/product/rate-of-glacier-elevation-changes-from-2000-to-2019/` | keine Lizenzaussage | 19.11.2026 |
| GitHub `rhugonnet/ww_tvol_study` (README) | keine Datenlizenz, verweist auf die DOI | 19.11.2026 |

**Urteil:** Die Primärseite des Datensatzes nennt CC BY 4.0, der Download braucht kein Konto. Das „NC“ steht nur in einer
Übersichtstabelle von Theia, die sich an anderer Stelle selbst widerspricht, und nirgends am Datensatz. **Ampel grün**,
Pflichtangabe = der Zitiertext oben plus die Veröffentlichung (doi:10.1038/s41586-021-03436-z).

**Eine eigene README-Datei gibt es nicht:** das Paket der Region 11 (`time_series_11.tar`, 24,2 MB) enthält nur
`dh_11_rgi60_pergla_rates.csv.zip` und `dh_11_rgi60_pergla_cumul.csv.zip`. Die Beschreibung der Spalten steht im
Metadatensatz der Primärseite („Variables names and units in the `.csv` files“): `dhdt` „is the elevation change rate in
meters per year“, `err_*` „are 1-sigma uncertainties of the related variable“, `area` „is the glacier area (same as in RGI
6.0) in meters square“, `rgiid` „is the RGIId as in the RGI 6.0, except for Caucasus Middle East“.

**Bezug:** über den Knopf „Download“ der Primärseite (Reiter „Times series“ → „Per glacier time series“ → „Central Europe“),
ohne Anmeldung. Die Rohdateien liegen nur im Cache `C:\dev\buscosun-glacier-cache\raw\hugonnet\` (außerhalb jedes Repos).
Der direkte Aufruf des Dienstes hinter dem Knopf per Skript wurde von der Sitzung nicht zugelassen — der Bezug ist deshalb
ein Handgriff im Browser (V-GH-1).

## 2 Diagnose

**Tabelle** `dh_11_rgi60_pergla_rates.csv` (20,3 MB, 164 934 Zeilen = 3 927 Gletscher × 42 Zeiträume), Spalten
`rgiid, period, area, dhdt, err_dhdt, dvoldt, err_dvoldt, dmdt, err_dmdt, dmdtda, err_dmdtda, perc_area_meas, perc_area_res, valid_obs, valid_obs_py, reg`.
Gebraucht werden fünf Zeiträume (`2000-01-01_2020-01-01` und die vier Fünfjahreszeilen) und die Spalten `dhdt`, `err_dhdt`,
`area`. Gemessen: alle 3 927 Gletscher tragen alle fünf Zeilen; **515 davon ohne Wert** (leere Zelle); die Unsicherheit ist
mindestens so groß wie der Wert bei 704 Gletschern im Gesamtzeitraum und bei 2 268–2 381 in den Fünfjahreszeiträumen —
die Regel „nur die Spanne“ trifft in den kurzen Zeiträumen also die Mehrheit.

**Katalog** (Build `20261012-1`, lokal byte-gleich mit dem veröffentlichten, sha256 `5a6b76f6…`): 2 199 Gletscher, 1 698 mit
einer RGI-Nummer aus der GloGEM-Brücke (`inv.rgi6` = der RGI-Gletscher mit dem größten Anteil), 1 652 verschiedene; 42
RGI-Nummern werden von mehr als einem Katalog-Gletscher genannt.

**Warum die Brücke allein nicht reicht:** GloGEM verträgt Anteile (ein Volumen lässt sich gewichtet summieren, so rechnet
`projection_for`). Eine mittlere Höhenänderung mit Unsicherheit lässt sich nicht ohne eigene Rechnung aus mehreren
RGI-Gletschern zusammensetzen, und der Wert eines großen RGI-Gletschers beschreibt keinen seiner heutigen Teile. Deshalb
1 : 1 oder gar nicht (Regel R2: gegenseitig größte Schnittfläche und mindestens die Hälfte BEIDER Flächen — die Regel des
Vertrags `GLACIER_MATCH_MIN_OVERLAP`). Der Wert gilt für den RGI-Umriss von rund 2003; das steht an der Zahl.

**Wohin die Daten gehören:** die Kennungen hängen am Katalog eines Builds ⇒ eigene Dateien `dhdt/<region>.json` IM statischen
Build (Zweig `glacier`), wie `proj/<region>.json`. Die Dateien des Builds sind unveränderlich; `sources.json` und
`report.json` werden deshalb nicht angefasst — das Dokument trägt seine Quelle selbst. Ob ein Build die Dateien hat, sagt der
Zeiger: `index.json` → `static.dhdt = "<build>"`. Der Client fragt nur, wenn `static.dhdt === static.build`; ein neuer voller
Build ohne den Hugonnet-Schritt lässt die Seite still auf den heutigen Stand zurückfallen (kein 404 in der Konsole).

**Aufbau:**
1. `scripts/glacier/py/rgi_bridge.py` — Schnittflächen beider Richtungen aus denselben Inventaren wie der Build; bricht ab,
   wenn Kennungen oder `inv.rgi6` nicht den Katalog des Builds ergeben. Ergebnis im Cache.
2. `src/glacier/glacierElevContract.ts` — Vertrag: Zeiträume, Tabellenleser, Regel R2, Dokument, Prüfregeln (ein Ort für
   Producer, Client, Verifier).
3. `scripts/glacier/hugonnet.mjs` — Producer der statischen Linie: Tabelle + Brücke + Katalog → `dhdt/<region>.json`,
   Bericht mit Trefferzahl und der Liste ohne Zuordnung.
4. Client: eine Zahl im Steckbrief, Karte mit vier Säulen im Reiter Langzeit, Quellenzeile.

**Herkunft im Sinn der Seite:** `satellite` (ASTER-Stereobilder, Auswertung der Autoren). Die Legende des Reiters Quellen
sagte bisher „Satellit = aus Sentinel-2 gerechnet“; sie nennt künftig beide.

## 3 Umsetzung

| Datei | Inhalt |
| --- | --- |
| `src/glacier/glacierElevContract.ts` (neu) | Vertrag: Pfad `dhdt/<region>.json`, fünf Zeiträume, Quelle mit Lizenz und Zitiertext, Leser der Tabelle (bricht bei abweichender Kopfzeile ab), Regel R2 (`elevMatch`), Block (`elevBlockOf`), Prüfregeln des Dokuments (`elevProblems`) |
| `scripts/glacier/py/rgi_bridge.py` (neu) | Schnittflächen beider Richtungen je Paar Gletscher ↔ RGI aus denselben Inventaren wie der Build; schreibt nur, wenn Kennungen und `inv.rgi6` den Katalog des Builds ergeben |
| `scripts/glacier/hugonnet.mjs` (neu) | Producer der statischen Linie: Tabelle + Brücke + Katalog → ein Dokument je Region (auch ein leeres, damit der Client nie auf eine fehlende Datei trifft) und `dhdt/report.json` mit Trefferzahl, Gründen und der Liste ohne Zuordnung |
| `src/glacier/glacierClient.ts`, `glacierSheetData.ts`, `GlacierPage.tsx` | Zeiger `static.dhdt`, Lader `loadElev` (ein verletztes Dokument wird ganz verworfen), Abruf nur bei `static.dhdt === static.build` |
| `src/glacier/glacierSheetModel.ts` | `elevView`, `elevFigure`, `elevSentence`, `elevNum`: Wert ± Unsicherheit oder nur die Spanne; Zeile für den Reiter Quellen |
| `src/glacier/GlacierCharts.tsx` | `ElevBars`: vier Säulen als reines SVG, Strich = 1 σ; ein Zeitraum mit „nur Spanne“ bekommt KEINE gefüllte Säule, nur den gestrichelten Rahmen der Spanne; gestrichelte Linie = Mittel 2000–2019 |
| `src/glacier/GlacierSheetTabs.tsx`, `GlacierBrief.tsx`, `glacierSheet.css` | Karte „Höhenänderung der Oberfläche · 2000–2019“ im Reiter Langzeit (auch im Dossier, Ebene Langzeit); eine Zahl im Steckbrief links; Quellenzeile, Lizenzzeile und ergänzte Legende im Reiter Quellen; Stil nur mit `--gl-*`-Tokens, keine neue Media Query |
| `scripts/verify-glacier-hugonnet.mjs`, `scripts/glacier/make-hugonnet-fixture.mjs`, `scripts/lib/fixtures/glacier/hugonnet-extract.json` | Verifier und seine Fixture (49 Originalzeilen der Tabelle, echte Brückenpaare, echte Katalogzeilen von acht Gletschern) |

**Was die Seite sagt:** Steckbrief „Höhenänderung 2000–2019: −1,4 m pro Jahr · ± 0,1 · Satellit · Hugonnet et al. 2021 · endet 2019“.
Reiter Langzeit: dieselbe Zahl groß, ein Satz („Die Oberfläche ist von 2000 bis 2019 im Mittel um 1,4 m pro Jahr gesunken (± 0,1 m).“),
vier Säulen, Legende, Kleingedrucktes: aus Satellitenbildern abgeleitet, gemittelt über den Umriss RGI 6.0 von etwa 2003 mit
dessen Fläche, die Reihe endet 2019, „nicht der Schmelzindex und keine Vorhersage“. Ist die Unsicherheit mindestens so groß wie
der Wert: „−1,0 bis +0,3 m pro Jahr“ und der Satz „… lässt die Messung keine Richtung erkennen …“ — kein einzelner Wert.

**Ohne Block** (1 118 Gletscher) und mit einem Zeiger ohne `dhdt`: kein Abruf, keine Karte, keine Zeile, keine Fehlermeldung.

## 4 Lokaler Lauf (19.11.2026)

`rgi_bridge.py`: 1 396 CH + 799 AT + 4 DE, 2 917 Paare, Identitätsprüfung gegen den Katalog `20261012-1` bestanden (107 s).
`hugonnet.mjs` (Prüfsumme der Tabelle im Bericht, 164 934 Zeilen, 3 927 RGI-Gletscher):

| | Gletscher | mit Block | Anteil der Gletscherfläche |
| --- | --- | --- | --- |
| Schweiz | 1 396 | 791 | 90 % (864,2 von 961,4 km²) |
| Österreich | 799 | 286 | 83 % (237,6 von 285,5 km²) |
| Deutschland | 4 | 4 | 100 % |
| **zusammen** | **2 199** | **1 081** | |

Nach Klasse: A 210 von 229, B 570 von 756, C 301 von 1 214. Leitgletscher 39 von 44.

**Ohne Zuordnung 1 118**, jeder mit Grund in `dhdt/report.json` (Spalten `id, why, rgi, aG, aR`; die Liste ist veröffentlicht):

| Grund | Zahl |
| --- | --- |
| kein RGI-6-Umriss schneidet den Gletscher (`no-rgi`) | 474 |
| nur ein Teil des RGI-Gletschers, unter der Hälfte von dessen Fläche (`part-of-rgi`) | 353 |
| liegt über mehreren RGI-Gletschern, keiner deckt die Hälfte (`several-rgi`) | 176 |
| der RGI-Gletscher gehört mehrheitlich einem anderen Gletscher (`not-mutual`) | 90 |
| die Tabelle trägt für 2000–2019 keinen Wert (`no-value`; dort steht eine Unsicherheit ohne Wert) | 25 |

**Nur die Spanne:** 107 von 1 081 im Gesamtzeitraum; in den Fünfjahreszeiträumen 601 · 556 · 590 · 583 — dort zeigt gut die
Hälfte der Säulen nur einen Rahmen. Wert klar negativ 972, klar positiv 2 (zwei Gletscher von 0,03 km², V-GH-5).
Unsicherheit 2000–2019: 0,10 bis 1,20 m pro Jahr, Median 0,23 — die Regel „zwei Nachkommastellen unter 0,05“ greift nie.
Paket: 27 Dateien, 271 KB (größte: `report.json` 74 KB, `ch-mitte-west.json` 48 KB).

## 5 Veröffentlichung in `buscosun-data` (19.11.2026)

Nur die statische Gletscher-Linie, mit `glacier-publish.mjs --line=static` aus einem frischen Klon (`C:\dev\buscosun-data-gh`),
ohne Force, ohne Rebase; beide Commits hängen an der jeweils aktuellen Spitze.

| Push | Commit | Inhalt | Prüfung danach |
| --- | --- | --- | --- |
| Zweig `glacier` | `b1f55b3b45df835df310a8d5d8da5928aa0a23bf` (Eltern `660788f8`) | 27 neue Dateien unter `glacier/v1/static/20261012-1/dhdt/`, sonst nichts | vier Dateien über raw byte-gleich mit dem lokalen Paket; `catalog.json` unverändert (sha256 `5a6b76f6…`) |
| `main` | `4d9136a6c653a7953b7b711d08e0cabcd36db4f7` (Eltern `23a8e209`) | `glacier/v1/index.json`: `static` = `{"build":"20261012-1","dhdt":"20261012-1"}`, alle anderen Schlüssel unverändert | über raw gelesen; der Lader der Seite liest 26 von 26 Dokumenten mit 1 081 Blöcken (nur raw, ohne CDN-Abruf) |

Rückweg: im Zeiger `static.dhdt` entfernen (ein Commit auf `main`) — die Seite zeigt dann den Stand von heute; die Dateien
auf dem Zweig können liegen bleiben. Die Produktion ignoriert den neuen Schlüssel, bis `buscosun-web` gepusht ist.

## 6 Gate

| Prüfung | Ergebnis |
| --- | --- |
| `verify:glacier-hugonnet` | **30/30** (Fixture), **34/34** mit `--dir/--catalog/--table` am vollen lokalen Baum |
| darin | echte Tabellenform (T1–T3), Gletscher ohne Zuordnung (M1, M2, B2), Unsicherheit größer als der Wert (V2, V3), Gegenproben zu jeder Regel (T3, M3–M5, B1b, B5, P1, V4, W1–W3) |
| `verify:glacier-contract` 64/64 · `-static` 7/7 · `-publish` 34/34 · `-sat` 28/28 · `-melt` 41/41 · `-weather` 21/21 · `-sheet` 45/45 · `-feed` 22/22 | grün |
| `verify:glacier-ui` (Browser) | **bricht ab** bei D4 (Suchfeld der Lageseite, `Illegal invocation`); diese Phase fasst weder die Lageseite noch das Suchfeld an; am sauberen HEAD nicht gegengeprüft (V-GH-6) |
| `npm run typecheck` | grün |
| `npm run build` | grün (281/281 der SEO-/Routing-Prüfungen) |
| `npm run budget` | sauberer HEAD 2 043,6 KB; HEAD + diese Phase **2 046,1 KB** (+2,5 KB gzip, alles im Lazy-Chunk des Steckbriefs; eagerJs 114,9, eagerCss 2,4, largestChunk 278,4 unverändert). Grenze von Hand angehoben, im Commit 2 044 → 2 047. Der Arbeitsbaum mit den fremden uncommitteten Linien steht bei 2 060 KB gegen 2 054 und bleibt rot — das war er schon vorher (2 057,4 gegen 2 051, `audit/satellitenbild-laden.md`) |

Die fünf Fragen: (1) Funktionserhalt — kein bestehender Teil entfernt; ohne Block rendert der Steckbrief dieselben Elemente
(W3, V6). (2) Desktop pixelgleich — **nicht gemessen** (Jans Vorgabe: keine Sichtprüfung); für Gletscher ohne Block kommt
kein Element hinzu, und der Satz der Legende im Reiter Quellen bleibt dort wörtlich gleich. (3) Touch-Ziele — keine neuen
Bedienelemente. (4) Konsole — nicht im Browser gesehen; der Abruf hängt am Zeiger, eine fehlende Datei gibt es je Region
nicht (B3, D1). (5) Long Tasks — nicht gemessen; ein Dokument je Region ist höchstens 48 KB.

## 7 Entscheidungen und Befunde

Von mir im Auftrag gefällt, zum Bestätigen oder Kippen:
- **E-GH-1** 1 : 1 oder gar nicht, Hälfte beider Flächen (eingefroren vor dem Lauf). Folge: 49 % der Gletscher, 83–90 % der Fläche.
- **E-GH-2** eigene Dateien im bestehenden Build + Zeiger `static.dhdt` statt eines neuen vollen Builds.
- **E-GH-3** die Fixture trägt 49 Originalzeilen der Tabelle mit Quellenangabe (CC BY 4.0). Die Vorgabe „keine Rohdateien im
  Repo“ lese ich als „nicht die Tabelle“; ist auch der Auszug zu viel, lässt er sich durch die Zahlenpaare der Blöcke ersetzen.
- **E-GH-4** eine Nachkommastelle („−1,4 m pro Jahr ± 0,1“), Herkunft „Satellit“.
- **E-GH-5** Budget von Hand angehoben (+3 KB).

Befunde:
- **V-GH-1** Der Bezug der Tabelle ist ein Handgriff im Browser (Knopf der Primärseite); der Skriptabruf des Dienstes dahinter
  wurde in der Sitzung nicht zugelassen. Mehrwert einer Freigabe: ein neuer Bezug ohne Handarbeit. Skizze: `prepareglaciertimeserie/11`
  → `check` → `download` in ein Skript unter `scripts/glacier/`, nur mit Jans Wort.
- **V-GH-2** 1 118 Gletscher ohne Zahl, fast alle wegen der Geometrie von 2003 gegen heute. Mehrwert: die 100-m-Raster würden
  jeden heutigen Umriss abdecken. Das wäre eine eigene Mittelung mit eigener Unsicherheit — eine neue Phase mit eigener Regel.
- **V-GH-3** Ein neuer voller statischer Build trägt die Dateien nicht von selbst; die Seite fällt dann still auf den Stand
  ohne Höhenänderung zurück. Skizze: nach `build_static.py` die zwei Schritte laufen lassen (`rgi_bridge.py`, `hugonnet.mjs`);
  im Workflow geht das erst, wenn die Tabelle dort liegen darf (Jans Gate).
- **V-GH-4** Blaueis besteht im RGI aus zwei Gletschern; die Regel gibt ihm den größeren (62,7 % der Fläche). Angezeigt wird
  dort ohnehin nur die Spanne.
- **V-GH-5** Zwei Gletscher von 0,03 km² tragen einen klar positiven Wert (+0,9 ± 0,8 und +3,0 ± 1,1 m pro Jahr); die Seite
  sagt dort „gestiegen“. Das ist der Wert der Autoren; bei so kleinen Flächen ist er fraglich. Skizze: unter einer
  Mindestfläche nur die Spanne zeigen — das wäre eine eigene Regel und deshalb Jans Entscheidung.
- **V-GH-6** `verify:glacier-ui` bricht am Suchfeld der Lageseite ab (Browser-Prüfer). An HEAD gegenprüfen.
- **V-GH-7** Der Wert ist ein Mittel über die Fläche von 2003; Flächen, die seither eisfrei wurden, zählen mit. Das steht im
  Kleingedruckten, nicht an der großen Zahl.
- **V-GH-8** Im Dossier der Lageseite steht die Zahl in der Ebene Langzeit, nicht in den vier Kacheln oben (das Raster der
  Kacheln habe ich ungesehen nicht verändert).

## 8 Jans Schritte

Siehe `MANUELLE-SCHRITTE.md` §105.
