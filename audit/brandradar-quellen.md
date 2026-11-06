# Brandradar — Quellen-Kachel vollständig (QK)

Stand 06.11.2026. Auftrag Jan: „füge in das Info-Feld im Brandradar alle für die Website notwendigen Quellennennungen hinzu".

## Diagnose

Die Info-Kachel „Quellen" (`src/fire/FireSourcesTile.tsx`, Commit `2bccc6cf`) nannte nur die Quellen des aktuellen Kartenzustands, also Basiskarte, eingeschaltete Ebenen und Ortssuche. Es fehlten:

- die zwei nicht gewählten Basiskarten (Esri World Imagery und World Topo standen nur da, wenn sie gewählt waren);
- alles, was beim Öffnen eines Brands geladen wird: Open-Meteo (DWD ICON und ERA5), Meteostat (Brand-Historie), NASA GIBS/Worldview, Element84 Earth Search, Copernicus Sentinel-2 (10-m-Ansicht), ESA WorldCover und das Historien-Archiv aus FIRMS und EFFIS;
- GeoNames (nächster Ort im Brandflächen-Panel).

Dazu kam: Esri World Topo trug an der Karte nur „Esri World Topo" statt des vorgegebenen Texts, und der Text von World Imagery nannte noch „Maxar". Der MapServer meldet heute „Vantor" (`copyrightText` beider Dienste, am 06.11. per `?f=json` gelesen).

## Umsetzung

- `FireSourcesTile.tsx`: eine vollständige Liste in vier Gruppen (Basiskarte · Kartenebenen · Brand-Details, Dossier und Historie · Suche und Ortsnamen). Je Eintrag: Anbieter mit Link, was die Seite daraus zeigt, vorgegebener Nennungstext wörtlich (wo es einen gibt), Lizenz mit Link, Art der Veränderung. Was der aktuelle Kartenzustand benutzt, trägt die Marke „aktiv". Wortlaute stammen aus den Konstanten der Quellmodule (`CLC_ATTRIBUTION` importiert; der Text von `WC_ATTRIBUTION` ist kopiert, damit das Modul des 10-m-Viewers nicht ins Brandradar-Bundle gezogen wird) und aus `scripts/seo/licenses.mjs`.
- `FireMap.tsx`: die Basiskarten „Satellit" und „Gelände" tragen den `copyrightText` der Esri-MapServer (`ESRI_IMAGERY_CREDIT`, `ESRI_TOPO_CREDIT`). Das gilt auch für die Minikarte (`basemapStyle`).
- `fireDeck.css`: Marke `.br-src-on`, Zitat `.br-src-credit`, Hinweiszeile.

## Belege

- `npm run typecheck` grün, `npm run build` grün (277/277).
- `npm run budget`: eagerJs 115,6/115 KB und totalJs 2001,3/1985 KB, beide ROT. Die Kachel liegt im nachgeladenen Chunk `FireRoute-*.js`, nicht im sofort geladenen Teil. Die Überschreitung bei eagerJs kommt also nicht von hier. Zu totalJs trägt die Kachel geschätzt gut 1 KB gzip bei; das Budget war schon vorher rot (DV, V-HB-1). Die Grenze ist nicht angehoben.
- Sichtprüfung im Prod-Build (`vite preview`), `/waldbrand`: Desktop 1440×900 `.playwright-mcp/br-quellen-desktop.png`, Mobil 390×844 `.playwright-mcp/br-quellen-mobil.png`. 30 Einträge, davon 6 „aktiv" (Satellit + FIRMS-Zustand), die Kachel scrollt im Bild. Die Quellenzeile zeigt „Source: Esri, Vantor, …".
- Konsole: sechs Fehler, alle aus externen Abrufen (EMS ohne CORS, `warnungen.zamg.at` 404). Sie hängen nicht an dieser Änderung.

## QK-2 — Quellenzeile immer sichtbar und obenauf (Jan 06.11.)

Auftrag: „die Quellen unten immer sichtbar machen und auch überlappend über andere Kacheln und Anzeigen".

- **Diagnose (gemessen mit `elementsFromPoint`, Dev-Server, 1440×900 und 390×844):** Der Container der Zeile (`.maplibregl-ctrl-bottom-right`) hatte z 2. Über der Zeile lagen der Gesten-Hinweis `.bs-hint` (z 30) und die Punktlegende `.br-pointlegend` (z 5). Dazu kürzte die Zeile ihren Text mit „…" (`nowrap` + `ellipsis`); ganz lesbar war sie nur beim Überfahren mit der Maus.
- **Umsetzung (`fireDeck.css`):** Zeile und Quellen-Knopf liegen auf z 40, also über allen Kartenkacheln, Legenden, Brand-Karten und dem Gesten-Hinweis. Darüber bleiben Suche/Menüs (50), die mobile Seite (45) und die Leiste (50), die Hover-Karte (60) und das Vollbild (120). Die Zeile kürzt nicht mehr und bricht bei Bedarf in mehrere Zeilen um.
- **Beleg:** Mit sechs Ebenen ist die Zeile auf dem Desktop 772 × 73 px groß und wird nicht abgeschnitten. Alle acht Prüfpunkte treffen die Zeile; vorher war es kein einziger. Mobil misst sie 306 × 132 px und liegt über Hinweis und Legende (`.playwright-mcp/br-attr-mobil.png`). Typecheck und Build sind grün. Das Budget ist unverändert rot (eagerJs 115,6/115, totalJs 2001,8/1985); die Änderung ist reines CSS.
- **Preis:** Bei vielen Ebenen bedeckt die Zeile mobil etwa 130 px des unteren Kartenrands. Klicks auf Brände in diesem Streifen treffen die Zeile, nicht die Karte (V-QK-6).
- Nebenbei: Seit `ca8ec58a` (fremde Linie) zeigt die Ebene „Feuerwetter" im Europa-Blick ICON-EU. Die Kachel nennt jetzt beide Modelle, ICON-EU im Europa-Blick und ICON-D2 im DACH-Blick (`FireMap.tsx:587`).

## QK-3 — Quellenzeile 5 s nach dem Laden, dann eingeklappt (E-QK-1, Jan 06.11.)

Auftrag: „die Anzeige der aktiven Quellen jetzt für 5 s nach vollständigem Laden der Seite anzeigen, danach in ‚Quellen‘ einklappen".

- **Umsetzung:** `FireSourcesTile` bekommt `ready={pageShown}`. Das ist derselbe Zustand, der die Startabdeckung ausblendet: Karte im Leerlauf, alle eingeschalteten Ebenen fertig, höchstens 10 s. Ab `ready` läuft die Uhr `SOURCE_LINE_VISIBLE_MS = 5000` (`set`). Danach trägt `.br-src` die Klasse `is-folded`, und `fireDeck.css` blendet die Zeile per `.fire-center:has(.br-src.is-folded)` in 0,4 s aus; unter reduced motion springt sie ohne Übergang. Das Einklappen geschieht einmal je Seitenaufruf. Der Knopf „Quellen" bleibt stehen, seine Kachel nennt alle Quellen mit der Marke „aktiv".
- **Beleg (Dev-Server, 1440×900, Abfrage alle 100 ms):** Abdeckung weg bei 8 432 ms, `is-folded` bei 13 152 ms, Zeile `visibility: hidden` bei 13 570 ms. Der Abstand von etwa 4,7 s statt 5,0 s ist Messunschärfe: Die Abfrageschleife hängt hinter dem Haupt-Thread, der beim Ausblenden der Abdeckung rendert. Bild eingeklappt: `.playwright-mcp/br-attr-eingeklappt.png`. Typecheck und Build sind grün, Budget unverändert rot (eagerJs 115,6/115, totalJs 2001,9/1985).
- **Rechtlicher Hinweis, nicht geprüft (V-QK-7):** Nach dem Einklappen ist die Nennung nur noch einen Klick entfernt. Ob das allen Anbietern genügt, ist nicht an den Lizenztexten geprüft. Esri verlangt für World Imagery/Topo eine sichtbare Nennung an der Karte, der DWD verlangt die Quelle bei der Darstellung. QK-1 hatte die Zeile gerade deshalb dauerhaft offen gemacht. *Skizze, falls nötig:* nur den Pflichtteil (Esri bzw. „© OpenStreetMap" + „Datenbasis: DWD") als kleinste Zeile stehen lassen, den Rest einklappen.

## Befunde (D-28)

- **V-QK-6 Die Quellenzeile verdeckt mobil den unteren Kartenrand.** *Mehrwert:* Brände am unteren Rand bleiben anklickbar. **Umgesetzt:** `pointer-events: none` auf der Zeile, nur ihre Links sind klickbar. Nicht im Browser nachgemessen, nur der CSS-Build ist grün. Offen bleibt die Sicht: Die Zeile deckt das Bild weiterhin ab, so ist es gewollt.

- **V-QK-1 Meteostat mit NC-Klausel im Brandradar.** Die Wetterlage am Brandtag (`history/historyDetail.ts` → `MeteostatSource`) nutzt Meteostat unter CC BY-NC 4.0. Lehre 5 der Waldbrand-Linie sagt aber: keine NC-Klausel. *Mehrwert:* rechtlich saubere Seite ohne Nutzungseinschränkung. *Skizze:* Tagesreihe aus den DWD-Stationsdaten (CDC) bzw. GeoSphere/MeteoSchweiz, oder ERA5 allein; Entscheidung Jan.
- **V-QK-2 Open-Meteo, freie API nur nicht-kommerziell.** Wetter am Brandort und ERA5 laufen über die freie Open-Meteo-API (`/lizenzen/` vermerkt das bereits, D-18/V-28). Die Kachel nennt CC BY 4.0, die Nutzungsbedingung bleibt offen.
- **V-QK-3 Alter Esri-Text in der Radar-Ansicht.** `src/radar/RadarMap.tsx` und `/lizenzen/` nennen noch „Maxar"; laut MapServer heißt es jetzt „Vantor". *Skizze:* dieselben Konstanten verwenden.
- **V-QK-4 Anerkennungstexte von NASA FIRMS und GIBS nicht wörtlich.** Die Kachel sagt „Nennung/Anerkennung erbeten". Den genauen Wortlaut, um den NASA bittet, hat buscosun nicht an der Anbieterseite gelesen. *Skizze:* Wortlaut von den FIRMS- und GIBS-Seiten übernehmen und als Konstante ins Quellmodul legen.
- **V-QK-5 Zweitliste.** Die Kachel ist eine handgepflegte zweite Liste neben `licenses.mjs` (das Driftrisiko, das V-80 beschreibt). *Skizze:* eine gemeinsame Datei `src/fire/fireSources.ts`, aus der Kachel und `/lizenzen/` beim Build lesen.

## Offen für Jan

Sichtprüfung, Commit/Push. Entscheidung V-QK-1.
