/**
 * Additional GEO explainers (build-only, plain Node ESM) — SEO/GEO 2026, stage 2.
 *
 * Same shape as `explainers.mjs` (slug, title, h1, status, answer, sections,
 * faqs, sources, relatedExplainers, relatedPlaces, datePublished, dateModified).
 * Every buscosun-specific number below is taken from the source code or the
 * audit files named in the section comments — never from marketing copy.
 *
 * Honesty rules (binding): buscosun issues no official warnings; official
 * warning text only as a literal quote; "bestätigt" only with the source in the
 * same sentence; FIRMS hotspots are unconfirmed by default; no live values.
 */

const PUBLISHED = '2026-09-05';
const MODIFIED = '2026-09-05';

export const EXPLAINERS_EXTRA = [
  // ------------------------------------------------------------ fire-weather-index
  // Numbers: src/fire/dangerViews.ts (class bounds, memory spans, model/resolution),
  // src/fire/sources/gwisFwi.ts (WMS layers, horizon), src/seo/subRouteTexts.ts (Trockenheit view).
  {
    slug: 'fire-weather-index',
    title: 'Fire Weather Index (FWI)',
    h1: 'Fire Weather Index: der kanadische Feuerwetter-Index erklärt',
    status: 'full',
    answer:
      'Der Fire Weather Index (FWI) ist ein dimensionsloser Index des kanadischen Feuerwetter-Systems (CFFDRS). ' +
      'Aus Temperatur, Luftfeuchte, Wind und Niederschlag berechnet er drei Feuchtecodes (FFMC, DMC, DC) und ' +
      'daraus zwei Verhaltensindizes (ISI, BUI), die zum Gesamtindex verschmelzen. Er beschreibt, wie leicht ' +
      'ein Feuer zündet und wie intensiv es sich ausbreiten könnte — kein amtliches Warnprodukt.',
    sections: [
      {
        id: 'aufbau',
        h2: 'Wie der FWI aufgebaut ist',
        html:
          '<p>Das <strong>Canadian Forest Fire Weather Index System</strong> rechnet täglich aus vier Messgrößen ' +
          '(Temperatur, relative Feuchte, Windgeschwindigkeit, 24-h-Niederschlag, Bezug 12 Uhr) sechs Kennzahlen:</p>' +
          '<ul>' +
          '<li><strong><a href="/glossar/#ffmc">FFMC</a></strong> (Fine Fuel Moisture Code): Feuchte des Feinmaterials — Gras, Nadeln, Laub. Gedächtnis rund zwei Drittel eines Tages; steuert die Zündbereitschaft.</li>' +
          '<li><strong><a href="/glossar/#dmc">DMC</a></strong> (Duff Moisture Code): Feuchte locker gelagerter organischer Auflagen, Gedächtnis etwa 12 Tage.</li>' +
          '<li><strong><a href="/glossar/#dc">DC</a></strong> (Drought Code): tiefe, verdichtete Auflagen mit rund 52 Tagen Gedächtnis — die Größe mit der längsten Erinnerung an Trockenheit.</li>' +
          '<li><strong><a href="/glossar/#isi">ISI</a></strong> (Initial Spread Index): erwartete Ausbreitungsrate unmittelbar nach der Zündung, aus FFMC und Wind.</li>' +
          '<li><strong><a href="/glossar/#bui">BUI</a></strong> (Build-Up Index): verfügbare Brennstoffmenge aus DMC und DC.</li>' +
          '<li><strong><a href="/glossar/#fwi">FWI</a></strong>: der Gesamtindex aus ISI und BUI — ein Maß für die mögliche Feuerintensität.</li>' +
          '</ul>' +
          '<p>Der Index kennt keine Vegetation, keine Zündquelle und keinen Menschen. Er sagt, was das Wetter mit ' +
          'trockenem Brennmaterial anstellen würde — nicht, ob es brennt.</p>',
      },
      {
        id: 'klassen',
        h2: 'Die sechs EFFIS-Klassen',
        html:
          '<p>Der europäische Dienst <a href="/glossar/#effis">EFFIS</a>/<a href="/glossar/#gwis">GWIS</a> rechnet den ' +
          'FWI aus der ECMWF-Vorhersage (rund 8 km, Tageswert mit Bezug 12 UTC, bis etwa neun Tage voraus) und teilt ' +
          'ihn in sechs Klassen: <strong>Low</strong> unter 11,2 · <strong>Moderate</strong> 11,2–21,3 · ' +
          '<strong>High</strong> 21,3–38,0 · <strong>Very High</strong> 38,0–50,0 · <strong>Extreme</strong> 50,0–70,0 · ' +
          '<strong>Very Extreme</strong> über 70,0. Die Klassengrenzen der Bausteine sind völlig andere: „Rot" heißt beim ' +
          'Drought Code mehr als 749,4, beim ISI mehr als 26,8 und beim FFMC mehr als 96,0. Eine gemeinsame Legende ' +
          'wäre deshalb eine falsche Aussage in Bildform.</p>' +
          '<p>Wichtig für den DACH-Raum: Das System ist für boreale und mediterrane Regime kalibriert. „High" bedeutet in ' +
          'Brandenburg etwas anderes als in Andalusien. Deshalb gehört zum Index immer die <strong>Einordnung</strong> — ' +
          'das <a href="/glossar/#perzentil">Perzentil</a> des Tageswerts gegenüber einer rund 40-jährigen Reihe für ' +
          'genau diesen Ort. Welche Jahre genau, veröffentlicht EFFIS nicht; die Basisklimatologie ist voraussichtlich ' +
          'ERA5 1980–2018.</p>',
      },
      {
        id: 'buscosun',
        h2: 'So zeigt es buscosun',
        html:
          '<p>Die Sicht <a href="/waldbrand/gefahrenindex">Gefahrenindex</a> im Brandradar zeigt die GWIS-Fläche in ' +
          'fünf Unteransichten: <strong>Index</strong> (FWI), <strong>Einordnung</strong> (Perzentil), ' +
          '<strong>Trockenheit</strong> (DC), <strong>Ausbreitung</strong> (ISI) und <strong>Zündbereitschaft</strong> ' +
          '(FFMC) — jede mit eigener Legende, Einheit, Bezug und ausgesprochener Grenze. DMC und BUI sind bewusst nicht ' +
          'enthalten. Weil der Dienst ein Bild liefert und keine Werte, gibt es keine Punktabfrage und keinen abgeleiteten ' +
          'Zahlenwert; die Legende zeigt die sechs Klassen, mehr wird nicht behauptet.</p>' +
          '<p>Die Sicht <a href="/waldbrand/trockenheit">Trockenheit</a> ergänzt zwei Treiber aus dem DWD-Modell ICON-D2 ' +
          '(2,2 km, stündlich, bis 24 h): den Bodenfeuchteindex <a href="/glossar/#smi">SMI</a> in zwei Tiefen (Oberboden ' +
          'bis 9 cm, Wurzelzone bis 81 cm) und die relative Luftfeuchte in 2 m. Der Drought Code ist dabei ausdrücklich ' +
          '<em>keine</em> Bodenfeuchte — er ist ein Feuerwetter-Code. Aktive Detektionen stehen unter ' +
          '<a href="/waldbrand/aktive-braende">aktive Brände</a>; wie sie entstehen, erklärt die ' +
          '<a href="/methodik/brandradar-detektion-und-brandnarben/">Methodik</a>. buscosun gibt keine amtlichen ' +
          'Warnstufen heraus — die stehen in <a href="/wissen/waldbrandwarnstufen-de-at-ch/">Waldbrandwarnstufen DE/AT/CH</a>.</p>',
      },
    ],
    faqs: [
      { q: 'Was bedeutet ein FWI von 30?', a: 'Nach der EFFIS-Einteilung liegt ein FWI von 30 in der Klasse „High" (21,3–38,0). Ob das für einen Ort in Mitteleuropa ungewöhnlich ist, sagt erst die Perzentil-Einordnung gegenüber der örtlichen Historie — der absolute Wert allein reicht nicht.' },
      { q: 'Ist der FWI eine amtliche Waldbrandwarnstufe?', a: 'Nein. Der FWI ist ein Modellwert aus der ECMWF-Vorhersage. Amtliche Stufen geben in Deutschland der DWD (Waldbrandgefahrenindex) und in der Schweiz Bund und Kantone heraus; buscosun zeigt nur den meteorologischen Kontext und verlinkt die amtlichen Quellen.' },
      { q: 'Warum gibt es fünf Ansichten statt einer?', a: 'Weil die Bausteine unterschiedliche Fragen beantworten: FFMC sagt, wie leicht etwas zündet, ISI, wie schnell es sich ausbreiten würde, DC, wie tief die Trockenheit reicht. Jede Größe hat eigene Klassengrenzen und Einheiten, deshalb hat jede Ansicht eine eigene Legende.' },
      { q: 'Berücksichtigt der FWI die Vegetation oder die Zündquelle?', a: 'Nein. Der Index beschreibt ausschließlich, was das Wetter mit einem standardisierten, trockenen Brennmaterial täte. Baumarten, Bodentyp, Zündquellen oder Löschmöglichkeiten fließen nicht ein — deshalb ist er ein Feuerwetter-Index, kein Brandrisiko-Index.' },
    ],
    sources: [
      { name: 'Natural Resources Canada: Canadian Forest Fire Weather Index (FWI) System', url: 'https://cwfis.cfs.nrcan.gc.ca/background/summary/fwi' },
      { name: 'EFFIS: Fire Danger Forecast — technical background', url: 'https://forest-fire.emergency.copernicus.eu/about-effis/technical-background/fire-danger-forecast' },
      { name: 'Vitolo et al. 2020: ERA5-based global fire danger reanalysis (Scientific Data)', url: 'https://doi.org/10.1038/s41597-020-0554-z' },
    ],
    relatedExplainers: ['waldbrandwarnstufen-de-at-ch', 'trockenperioden', 'thermalanomalien-firms', 'windboeen-sturm'],
    relatedPlaces: ['potsdam', 'dresden', 'magdeburg', 'wiener-neustadt', 'sitten-sion'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },

  // ------------------------------------------------ waldbrandwarnstufen-de-at-ch
  // Numbers: src/fire/sources/dwdFireIndex.ts (5 levels, day 0..+6, 484 station files),
  // src/fire/sources/bafuFire.ts (BAFU publish rhythm), src/officialSources.ts (AT gap),
  // audit/waldbrand-behoerden.md §8–9 (GeoSphere context types/levels, MoWaS decision).
  {
    slug: 'waldbrandwarnstufen-de-at-ch',
    title: 'Waldbrandwarnstufen in DE, AT und CH',
    h1: 'Waldbrandwarnstufen: wer sie in Deutschland, Österreich und der Schweiz herausgibt',
    status: 'full',
    answer:
      'In Deutschland veröffentlicht der DWD den Waldbrandgefahrenindex in fünf Stufen (1 sehr gering bis 5 sehr hoch), ' +
      'in der Schweiz geben Bund und Kantone fünf Gefahrenstufen von „gering" bis „sehr gross" heraus. Österreich hat ' +
      'keine offene, landesweit einheitliche amtliche Stufe — dort informieren Bundesländer und Bezirke. buscosun gibt ' +
      'keine Warnstufen heraus, sondern verlinkt die amtlichen Quellen.',
    sections: [
      {
        id: 'de',
        h2: 'Deutschland: der Waldbrandgefahrenindex des DWD',
        html:
          '<p>Der Deutsche Wetterdienst berechnet täglich den <strong>Waldbrandgefahrenindex (WBI)</strong> und den ' +
          '<strong>Graslandfeuerindex (GLFI)</strong> für heute und die folgenden sechs Tage, jeweils in fünf Stufen: ' +
          '<strong>1</strong> sehr geringe, <strong>2</strong> geringe, <strong>3</strong> mittlere, <strong>4</strong> hohe und ' +
          '<strong>5</strong> sehr hohe Gefahr. Der Index basiert auf dem kanadischen Feuerwetter-System und wird für ' +
          'Stationen gerechnet — im offenen Datenangebot sind das 484 Einzeldateien, eine je Station, ohne offenes Raster. ' +
          'Die rechtlich wirksamen Maßnahmen (Betretungsverbote, Feuerverbote) sprechen die Bundesländer und Forstbehörden ' +
          'aus, nicht der DWD. Wer eine Warnung sucht, findet die amtliche Warnlage über das Portal ' +
          '<a href="https://warnung.bund.de" rel="noopener" target="_blank">warnung.bund.de</a>.</p>',
      },
      {
        id: 'ch',
        h2: 'Schweiz: fünf Gefahrenstufen von Bund und Kantonen',
        html:
          '<p>Das Bundesamt für Umwelt (BAFU) veröffentlicht mit den Kantonen die <strong>Waldbrandgefahr</strong> in ' +
          'fünf Stufen: <strong>1 gering</strong>, <strong>2 mässig</strong>, <strong>3 erheblich</strong>, ' +
          '<strong>4 gross</strong>, <strong>5 sehr gross</strong>. Zuständig für Feuerverbote sind die Kantone; ihre ' +
          'Massnahmen stehen auf <a href="https://www.waldbrandgefahr.ch" rel="noopener" target="_blank">waldbrandgefahr.ch</a>. ' +
          'Die Stufen liegen als offene Geodaten des Bundes vor (Lizenz „Opendata OPEN: Freie Nutzung"), die Regionen tragen ' +
          'jedoch kein Farbfeld — jede Farbe auf einer Karte ist eine Interpretation des Anbieters, nicht Teil der amtlichen ' +
          'Daten. Das BAFU publiziert typischerweise an Werktagen nach Mittag; am Wochenende kann ein Stand daher ' +
          'älter sein, ohne falsch zu sein.</p>',
      },
      {
        id: 'at',
        h2: 'Österreich: keine offene landesweite Stufe',
        html:
          '<p>Für Österreich existiert <strong>keine offene, bundesweit einheitliche amtliche Waldbrandgefahrenstufe</strong>. ' +
          'Die Bundesländer und Bezirkshauptmannschaften erlassen Waldbrandverordnungen und veröffentlichen sie auf ' +
          'eigenen Seiten; eine landesweite offene Einsatz- oder Gefahrenquelle mit klarer Lizenz gibt es nicht. GeoSphere ' +
          'Austria stellt amtliche Wetterwarnungen bereit (sieben Warntypen, drei Stufen), die zur Einordnung dienen ' +
          'können — Hitze- oder Gewitterwarnungen sind aber <em>keine</em> Waldbrandstufe und bestätigen keinen Brand. ' +
          'Genau diese Asymmetrie wird auf buscosun benannt statt kaschiert: Der EU-Index deckt alle drei Länder ' +
          'ab, die amtliche Stufe nur zwei.</p>',
      },
      {
        id: 'buscosun',
        h2: 'So geht buscosun damit um',
        html:
          '<p>buscosun <strong>gibt keine Warnstufen heraus</strong>. Die Sicht <a href="/waldbrand/gefahrenindex">Gefahrenindex</a> ' +
          'zeigt den grenzüberschreitenden EU-Index (<a href="/wissen/fire-weather-index/">FWI</a>) mit seiner ' +
          'Perzentil-Einordnung; ein früherer Layer „Amtliche Stufe" mit DWD-WBI und BAFU-Stufen wurde 2026 bewusst ' +
          'zurückgezogen, damit auf der Karte kein amtliches Produkt neben einem Modellwert steht, das anders gelesen ' +
          'werden könnte. Stattdessen führt jeder Brand-Steckbrief einen Deep-Link „Amtliche Warn-/Einsatzlage nachsehen" ' +
          'je Land. Amtlicher Warntext erscheint auf buscosun ausschließlich als wörtliches Zitat — nie zusammengefasst, ' +
          'nie verschärft, nie abgeschwächt. Satellitendetektionen unter <a href="/waldbrand/aktive-braende">aktive Brände</a> ' +
          'gelten als unbestätigt, solange keine EFFIS-Kartierung oder Copernicus-EMS-Aktivierung im selben Satz ' +
          'steht; die Regeln erklärt die <a href="/methodik/brandradar-detektion-und-brandnarben/">Methodik</a>.</p>',
      },
    ],
    faqs: [
      { q: 'Welche Waldbrandstufe gilt heute in meinem Landkreis?', a: 'Die amtliche Stufe für Deutschland veröffentlicht der DWD täglich für heute und sechs Folgetage; Verbote und Betretungsregeln sprechen die Länder aus. buscosun zeigt keine amtliche Stufe, sondern verlinkt die zuständige Quelle und den EU-Feuerwetterindex als Kontext.' },
      { q: 'Warum gibt es für Österreich keine Stufe auf der Karte?', a: 'Weil es keine offene, landesweit einheitliche amtliche Waldbrandgefahrenstufe gibt. Bundesländer und Bezirke informieren auf eigenen Seiten; eine Quelle ohne klare Lizenz wird auf buscosun nur verlinkt, nie ausgewertet — das ist eine Lücke der Datenlage, nicht der Umsetzung.' },
      { q: 'Ist die Waldbrandstufe dasselbe wie der Fire Weather Index?', a: 'Nein. Der DWD-Index und die Schweizer Stufen sind amtliche Produkte, die auch Vegetation, Region und Erfahrung einbeziehen. Der FWI ist ein reiner Feuerwetter-Modellwert aus der ECMWF-Vorhersage; er endet nicht an Grenzen, ist aber kein Warnprodukt.' },
      { q: 'Bedeutet Stufe 5 ein Feuerverbot?', a: 'Nicht automatisch. Verbote erlassen in Deutschland die Länder und Kommunen, in der Schweiz die Kantone, in Österreich die Bezirke. Die Stufe ist eine Gefahreneinschätzung; welche Maßnahme daraus folgt, steht in der jeweiligen Verordnung, die auf den amtlichen Seiten verlinkt ist.' },
    ],
    sources: [
      { name: 'DWD: Waldbrandgefahrenindex (WBI) und Graslandfeuerindex', url: 'https://www.dwd.de/DE/leistungen/waldbrandgef/waldbrandgef.html' },
      { name: 'BAFU/Kantone: Waldbrandgefahr Schweiz', url: 'https://www.waldbrandgefahr.ch' },
      { name: 'GeoSphere Austria: Wetterwarnungen', url: 'https://warnungen.zamg.at' },
      { name: 'Bundesamt für Bevölkerungsschutz: warnung.bund.de', url: 'https://warnung.bund.de' },
    ],
    relatedExplainers: ['fire-weather-index', 'thermalanomalien-firms', 'trockenperioden'],
    relatedPlaces: ['potsdam', 'berlin', 'wien', 'eisenstadt', 'sitten-sion', 'chur'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },

  // ---------------------------------------------------- thermalanomalien-firms
  // Numbers: src/fire/sources/firmsHotspots.ts (VIIRS 375 m, three streams, 5-day API limit,
  // confidence letters), audit/thermalanomalien.md §1/§4/§7 (archive share, persistence rule,
  // 469 cells, 218 sites, classes A/B/C), src/fire/anomaly/thermalSites.ts (0.01° cells, 1.5 km).
  {
    slug: 'thermalanomalien-firms',
    title: 'Thermalanomalien (NASA FIRMS)',
    h1: 'Thermalanomalien: was ein FIRMS-Hotspot ist — und was nicht',
    status: 'full',
    answer:
      'Eine Thermalanomalie ist ein Satellitenpixel, das deutlich heißer strahlt als seine Umgebung. NASA FIRMS ' +
      'verteilt solche Detektionen des VIIRS-Instruments (375 m) binnen Stunden. Ein Hotspot ist kein bestätigter ' +
      'Brand: Stahlwerke, Raffinerien, Gasfackeln und sogar Reflexionen erzeugen dieselbe Signatur. Unbestätigt ist ' +
      'der Normalfall — bestätigt ist ein Ereignis nur mit EFFIS-Kartierung oder EMS-Aktivierung.',
    sections: [
      {
        id: 'detektion',
        h2: 'Wie der Satellit ein Feuer sieht',
        html:
          '<p>Das Instrument <a href="/glossar/#viirs">VIIRS</a> auf den Satelliten Suomi-NPP, NOAA-20 und NOAA-21 ' +
          'misst im mittleren Infrarot die Strahlung jedes 375-m-Pixels. Weicht ein Pixel stark vom Hintergrund ab, ' +
          'meldet der Algorithmus eine <strong>aktive Feuerdetektion</strong> mit Koordinate, Aufnahmezeit, ' +
          '<a href="/glossar/#frp">Feuerstrahlungsleistung (FRP)</a> in Megawatt, Konfidenz (low/nominal/high), ' +
          'Pixelgeometrie und Tag/Nacht-Kennung. Über <a href="/glossar/#firms">FIRMS</a> stehen die Detektionen als ' +
          'Near-Real-Time-Daten (NRT) bereit; die Area-API liefert je Abruf höchstens fünf Tage.</p>' +
          '<p>Drei Dinge sagt eine Detektion <em>nicht</em>: Der Punkt ist die <strong>Pixelmitte</strong>, nicht der ' +
          'Brandherd; FRP ist eine Leistung, aus der sich <strong>keine Fläche in Hektar</strong> ableiten lässt; und ' +
          'NRT-Detektionen können bei der späteren Standardverarbeitung verschwinden oder umziehen. Kleine oder von ' +
          'Wolken verdeckte Feuer fehlen dem Satelliten systematisch.</p>',
      },
      {
        id: 'anlagen',
        h2: 'Warum drei Viertel der Detektionen keine Brände sind',
        html:
          '<p>Im FIRMS-Archiv für den DACH-Raum (März–Oktober 2020–2026, rund 290 000 Zeilen) trugen ' +
          '<strong>73 Prozent</strong> aller Detektionen NASAs Kennung „statische Landquelle" — Stahlwerke wie ' +
          'Linz, Duisburg, Salzgitter, Dillingen oder Bremen liefern jeweils tausende Detektionen an über tausend ' +
          'verschiedenen Tagen. Nur ein Viertel sind vermutete Vegetationsbrände. NASAs Maske ist zudem unvollständig: ' +
          'Viele Zellen mit Detektionen an dutzenden Tagen über sechs Jahre sind trotzdem als Vegetationsbrand ' +
          'gelabelt. Und es gibt ein <strong>Tagessignal</strong> — Zellen mit null Prozent Nachtanteil über Jahre, ' +
          'bei denen Reflexion von Photovoltaik, Glasdächern oder Gewächshäusern wahrscheinlicher ist als Wärme.</p>',
      },
      {
        id: 'buscosun',
        h2: 'So trennt buscosun Anlagen von Bränden',
        html:
          '<p>Der Brandradar unter <a href="/waldbrand">/waldbrand</a> nutzt FIRMS als Primärquelle (GWIS als ' +
          'keyloser Rückfall) und führt eine eigene <strong>Standortliste</strong> aus dem Archiv: Eine 0,01°-Zelle ' +
          'gilt als persistent, wenn sie in <strong>mindestens zwei Kalenderjahren je mindestens fünf verschiedene ' +
          'Detektionstage</strong> trägt — 469 Zellen, davon 163 nur über die eigene Zählung, nicht über NASAs Label. ' +
          'Daraus entstehen 218 Standorte in drei Klassen: <strong>A</strong> mit benannter Anlage aus E-PRTR, ' +
          'Marktstammdatenregister oder BFE im Umkreis von 1,5 km (145), <strong>B</strong> unbenannt (8) und ' +
          '<strong>C</strong> Tagessignal (65). Eine Gegenprobe an Jüterbog, das 2022 und 2023 brannte, erreicht die ' +
          'Regel nicht — sie trennt wiederkehrende Vegetationsbrände von Anlagen.</p>' +
          '<p>Zur Laufzeit vergleicht buscosun jede neue Detektion mit der Signatur des Standorts: Wächst die Fläche ' +
          'über die Hülle hinaus oder übersteigt die Spitzenleistung das Doppelte des 95. Perzentils, gilt das ' +
          'Ereignis als <strong>abweichend</strong> und bleibt in der Brandliste — rot markiert. Sonst wandert es aus der ' +
          'Liste in den Reiter „Thermalanomalien". Ein Anlagenname steht nur mit Quelle und Abstand im selben Satz. ' +
          'Eine Detektion ist „bestätigt" ausschließlich mit EFFIS-Kartierung oder Copernicus-EMS-Aktivierung im ' +
          'selben Satz; sonst heißt es „unbestätigt" — der Normalfall. Details in der ' +
          '<a href="/methodik/brandradar-detektion-und-brandnarben/">Methodik</a> und bei ' +
          '<a href="/waldbrand/aktive-braende">aktive Brände</a>.</p>',
      },
    ],
    faqs: [
      { q: 'Ist ein FIRMS-Hotspot ein Waldbrand?', a: 'Nicht zwingend. Ein Hotspot ist eine Thermalanomalie — ein Pixel, das heißer strahlt als seine Umgebung. Im DACH-Archiv stammen rund drei Viertel der Detektionen von Industrieanlagen. Ein Brand gilt erst als bestätigt, wenn EFFIS ihn kartiert hat oder Copernicus EMS aktiviert wurde.' },
      { q: 'Wie genau ist die Position einer Detektion?', a: 'Die Koordinate ist die Mitte eines 375-m-Pixels; am Bildrand wird das Pixel deutlich länger. Der tatsächliche Brandherd kann einige hundert Meter entfernt liegen. Deshalb markiert buscosun den Punkt als Pixelmitte und leitet daraus keine Brandfläche ab.' },
      { q: 'Was bedeutet die Konfidenz low, nominal, high?', a: 'Sie beschreibt, wie sicher der Algorithmus ist, dass das Pixel eine echte Anomalie ist — etwa gegenüber Sonnenreflexion oder heißem Boden. Eine hohe Konfidenz sagt nichts darüber, ob die Quelle ein Brand oder eine Anlage ist; das klärt erst der Standortabgleich.' },
      { q: 'Warum stehen Stahlwerke nicht mehr in der Brandliste?', a: 'Weil ihre Zellen über Jahre hinweg an hunderten Tagen Detektionen tragen und damit die Persistenzregel erfüllen. Sie werden als Standort geführt und nur dann als Brand behandelt, wenn Fläche oder Strahlungsleistung deutlich von der gewohnten Signatur abweichen oder eine EMS-Aktivierung vorliegt.' },
    ],
    sources: [
      { name: 'NASA FIRMS: Fire Information for Resource Management System', url: 'https://firms.modaps.eosdis.nasa.gov/' },
      { name: 'NASA Earthdata: VIIRS active fire products (375 m)', url: 'https://www.earthdata.nasa.gov/data/instruments/viirs' },
      { name: 'EEA: European Industrial Emissions Portal (E-PRTR)', url: 'https://industry.eea.europa.eu/' },
      { name: 'Copernicus EMS: Global Wildfire Information System (GWIS)', url: 'https://gwis.jrc.ec.europa.eu/' },
    ],
    relatedExplainers: ['fire-weather-index', 'waldbrandwarnstufen-de-at-ch', 'trockenperioden'],
    relatedPlaces: ['duisburg', 'linz', 'bremen', 'saarbruecken', 'potsdam'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },

  // ------------------------------------------------------ goldene-blaue-stunde
  // Numbers: src/photo/sun.ts (BLUE −6…−4°, GOLD −4…+6°, HORIZON −0.833°, 1-min raster),
  // src/photo/photoLight.ts (cloud mood, fog/afterglow windows, probability formula).
  {
    slug: 'goldene-blaue-stunde',
    title: 'Goldene und blaue Stunde',
    h1: 'Goldene Stunde und blaue Stunde: wann das Licht am schönsten ist',
    status: 'full',
    answer:
      'Die goldene Stunde ist die Zeit, in der die Sonne zwischen etwa 6 Grad über und 4 Grad unter dem Horizont ' +
      'steht — warmes, flaches Licht mit langen Schatten. Die blaue Stunde folgt, wenn die Sonne 4 bis 6 Grad unter ' +
      'dem Horizont ist: der Himmel leuchtet tiefblau, Kunstlicht wirkt ausgewogen. Beide dauern je nach ' +
      'Jahreszeit und Breite unterschiedlich lang.',
    sections: [
      {
        id: 'definition',
        h2: 'Definition über den Sonnenstand',
        html:
          '<p>Beide Begriffe sind keine Uhrzeiten, sondern <strong>Sonnenhöhen</strong>. buscosun rechnet sie nach ' +
          'einer festen Konvention: <strong><a href="/glossar/#goldene-stunde">Goldene Stunde</a></strong> von −4° bis ' +
          '+6° Sonnenhöhe, <strong><a href="/glossar/#blaue-stunde">blaue Stunde</a></strong> von −6° bis −4°. ' +
          'Sonnenauf- und -untergang liegen bei −0,833° (Standardrefraktion, Sonnenoberrand am Horizont) und damit ' +
          '<em>innerhalb</em> der goldenen Stunde. Die Grenze −6° ist zugleich das Ende der bürgerlichen Dämmerung; ' +
          'die astronomische Dunkelheit beginnt erst bei −18°.</p>' +
          '<p>Wie lange die Phasen dauern, hängt vom Winkel ab, in dem die Sonne den Horizont schneidet: Im Sommer ' +
          'nördlich der Alpen sinkt sie flach und die goldene Stunde dauert deutlich über eine Stunde; im Winter ' +
          'steht sie mittags so tief, dass in manchen Tälern der ganze Tag „golden" bleibt. Nahe der Sommersonnenwende ' +
          'kann die Sonne nachts über −6° bleiben — dann gibt es keine vollständige blaue Stunde.</p>',
      },
      {
        id: 'wetter',
        h2: 'Was das Wetter aus dem Licht macht',
        html:
          '<ul>' +
          '<li><strong>Klarer Himmel</strong>: reine, warme Farben, aber hartes Licht und wenig Struktur am Himmel.</li>' +
          '<li><strong>Hohe und mittelhohe Wolken</strong> bei freiem Horizont: das dramatische Abendrot — die tiefstehende Sonne beleuchtet die Wolkenunterseiten von unten.</li>' +
          '<li><strong>Geschlossene tiefe Bewölkung</strong>: flaches, farbloses Licht; die goldene Stunde findet optisch nicht statt.</li>' +
          '<li><strong>Nebel und Hochnebel</strong>: weiches Streulicht am Morgen, besonders nach klaren, windschwachen Nächten mit hoher Feuchte.</li>' +
          '</ul>' +
          '<p>Entscheidend ist also nicht nur der Sonnenstand, sondern die <strong>Schichtung der Wolken</strong> in ' +
          'den zwei Stunden vor Sonnenuntergang und um den Sonnenaufgang.</p>',
      },
      {
        id: 'buscosun',
        h2: 'So zeigt es buscosun',
        html:
          '<p>In der <a href="/eventplanung">Eventplanung</a> mit dem Anlass <strong>Fotografie</strong> berechnet ' +
          'buscosun für jeden Tag die exakten Zeitfenster der blauen und goldenen Stunde morgens und abends im ' +
          'Minutenraster und bewertet dazu die <strong>Lichtstimmung</strong> aus dem Punktforecast: Aus den drei ' +
          'Wolkenschichten entsteht eine Einordnung in „hart", „flach", „dramatisch" oder „weich". Für den Morgen ' +
          'wird die Nebelchance aus den Stunden zwei Stunden vor bis eine Stunde nach Sonnenaufgang geschätzt, für den ' +
          'Abend die Chance auf Abendrot im gleichen Fenster um den Sonnenuntergang. Die angezeigte Wahrscheinlichkeit ' +
          'ist die Lichtqualität, gedämpft um die Modell-Konfidenz — bei unsicherer Vorhersage sinkt sie sichtbar. ' +
          'Die Ortsseiten wie <a href="/wetter/hallstatt/">Hallstatt</a> oder <a href="/wetter/zermatt/">Zermatt</a> ' +
          'nennen die Sonnenzeiten; wer die Nacht plant, findet unter <a href="/wissen/lichtverschmutzung-bortle/">Lichtverschmutzung</a> ' +
          'das Gegenstück für Sternenfotografie.</p>',
      },
    ],
    faqs: [
      { q: 'Wie lange dauert die goldene Stunde wirklich?', a: 'Selten genau sechzig Minuten. Sie umfasst die Sonnenhöhen von 6 Grad über bis 4 Grad unter dem Horizont; im mitteleuropäischen Sommer sind das oft 70 bis 90 Minuten, im Winter kürzer, und in Gebirgstälern verschiebt der Horizont beide Enden zusätzlich.' },
      { q: 'Beginnt die blaue Stunde vor oder nach der goldenen?', a: 'Abends danach: Erst die goldene Stunde bis 4 Grad unter dem Horizont, dann die blaue Stunde bis 6 Grad. Morgens ist die Reihenfolge umgekehrt — zuerst blau, dann golden, bis die Sonne 6 Grad über dem Horizont steht.' },
      { q: 'Warum gibt es an manchen Tagen kein Abendrot?', a: 'Weil Abendrot Wolken in mittlerer und großer Höhe bei freiem Horizont braucht, die von unten beleuchtet werden. Bei wolkenlosem Himmel bleibt der Effekt schwach, bei geschlossener tiefer Bewölkung fehlt er ganz. buscosun schätzt diese Chance aus den Wolkenschichten des Forecasts.' },
      { q: 'Berücksichtigt buscosun Berge am Horizont?', a: 'Die Zeitfenster der goldenen und blauen Stunde werden gegen den mathematischen Horizont gerechnet. Ob ein Grat die Sonne früher verdeckt, zeigt die Terrain-Bühne der Eventplanung, die für eine gezeichnete Fläche den Sonnenstand gegen das Geländemodell prüft.' },
    ],
    sources: [
      { name: 'NOAA Global Monitoring Laboratory: Solar Calculator', url: 'https://gml.noaa.gov/grad/solcalc/' },
      { name: 'U.S. Naval Observatory: Rise, Set, and Twilight Definitions', url: 'https://aa.usno.navy.mil/faq/RST_defs' },
    ],
    relatedExplainers: ['lichtverschmutzung-bortle', 'nebel-hochnebel-nebelobergrenze', 'temperaturinversion'],
    relatedPlaces: ['hallstatt', 'zermatt', 'sylt-westerland', 'berchtesgaden', 'grindelwald'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },

  // ---------------------------------------------------- lichtverschmutzung-bortle
  // Numbers: src/astro/lightPollution.ts (35 cities, 1/(d+4)^2.5 model, log mapping, labels),
  // src/photo/sun.ts (ASTRO_NIGHT −18°), src/astro/astroNight.ts (night 21–06, moon factor, score).
  {
    slug: 'lichtverschmutzung-bortle',
    title: 'Lichtverschmutzung und Bortle-Skala',
    h1: 'Lichtverschmutzung: die Bortle-Skala und der dunkle Himmel im DACH-Raum',
    status: 'full',
    answer:
      'Die Bortle-Skala teilt die Himmelsqualität in neun Klassen von 1 (exzellent dunkel, Milchstraße wirft Schatten) ' +
      'bis 9 (innerstädtisch, nur helle Sterne sichtbar). Lichtverschmutzung entsteht durch nach oben gestreutes ' +
      'Kunstlicht; die Lichtkuppel einer Großstadt reicht dutzende Kilometer weit. In Mitteleuropa sind Klasse 1 und 2 ' +
      'praktisch nur noch in Alpentälern und Mittelgebirgen erreichbar.',
    sections: [
      {
        id: 'skala',
        h2: 'Die neun Klassen nach Bortle',
        html:
          '<p>John Bortle veröffentlichte die Skala 2001, um Beobachtungsorte vergleichbar zu machen. Grob gilt: ' +
          '<strong>Klasse 1–2</strong> exzellent dunkel, die Milchstraße zeigt Struktur bis zum Horizont; ' +
          '<strong>Klasse 3</strong> ländlich dunkel mit schwacher Aufhellung am Horizont; <strong>Klasse 4</strong> ' +
          'ländlicher Übergang, Lichtkuppeln sichtbar; <strong>Klasse 5</strong> Vorstadt, Milchstraße blass; ' +
          '<strong>Klasse 6–7</strong> Stadtrand, nur helle Objekte, Mond und Planeten lohnen; <strong>Klasse 8–9</strong> ' +
          'innerstädtisch. Die Skala ist visuell und subjektiv — sie beschreibt, was ein geübtes Auge sieht, nicht eine ' +
          'physikalische Leuchtdichte. Für Messwerte nutzt man das Sky Quality Meter (mag/arcsec²) oder den ' +
          'Weltatlas der künstlichen Himmelshelligkeit von Falchi et al. (2016).</p>',
      },
      {
        id: 'dach',
        h2: 'Wo es im DACH-Raum noch dunkel ist',
        html:
          '<p>Das Rheinland, das Ruhrgebiet, der Großraum Wien und das Schweizer Mittelland gehören zu den am stärksten ' +
          'aufgehellten Regionen Europas. Dunkle Inseln bleiben die Alpen (Engadin, Ötztal, Gasteinertal), die ' +
          'Mittelgebirge (Rhön, Eifel, Westhavelland, Harz) und Teile Mecklenburgs und Brandenburgs. Mehrere dieser ' +
          'Gebiete sind als Sternenparks anerkannt. Entscheidend ist neben der Entfernung zur nächsten Stadt der ' +
          '<strong>Horizont</strong>: Eine Stadt 40 km entfernt stört tief im Norden, nicht im Zenit.</p>',
      },
      {
        id: 'buscosun',
        h2: 'So schätzt es buscosun — ehrlich als Näherung',
        html:
          '<p>buscosun hat <strong>keinen Satellitenatlas</strong> der Lichtverschmutzung eingebunden. Die Bortle-Angabe ' +
          'in der <a href="/eventplanung">Eventplanung</a> (Anlass Sterne) ist eine <strong>Offline-Schätzung</strong>: ' +
          'Aus einer kuratierten Liste von 35 Großstädten in Deutschland, Österreich und der Schweiz mit Einwohnerzahlen ' +
          'wird die Aufhellung als Summe von Einwohner geteilt durch (Distanz + 4 km) hoch 2,5 gerechnet und ' +
          'logarithmisch auf die Klassen 1 bis 9 abgebildet — kalibriert so, dass ein Großstadtkern etwa 8, rund ' +
          '30 km Abstand etwa 3–4 und abgelegene Lagen etwa 2 ergeben. Das trennt dunkle von aufgehellten Standorten, ' +
          'ersetzt aber keine Messung; Kleinstädte, Gewerbegebiete und Skigebiete fehlen dem Modell.</p>' +
          '<p>Die Nachtbewertung kombiniert das mit dem Wetter: Fenster der <a href="/glossar/#astronomische-dunkelheit">astronomischen ' +
          'Dunkelheit</a> (Sonne unter −18°), Bewölkung in drei Schichten zwischen 21 und 6 Uhr, Mondstörung als ' +
          'Beleuchtungsgrad mal Anteil der Nacht über dem Horizont und das Taurisiko für Optik. Der Nacht-Score ist ' +
          'das Produkt aus Wolkenqualität, Mondfaktor und Taufaktor; Sommernächte ohne astronomische Dunkelheit werden ' +
          'als solche benannt. Orte wie <a href="/wetter/brocken/">Brocken</a>, <a href="/wetter/obergurgl/">Obergurgl</a> ' +
          'oder <a href="/wetter/scuol/">Scuol</a> haben eigene Ortsseiten mit Nachtwerten.</p>',
      },
    ],
    faqs: [
      { q: 'Woher kommt die Bortle-Klasse auf buscosun?', a: 'Aus einer Offline-Schätzung nach Entfernung und Größe der nächsten Großstädte — bewusst grob, um dunkle von aufgehellten Standorten zu unterscheiden. Sie basiert nicht auf Satellitenmessungen der Himmelshelligkeit und kann lokal um ein bis zwei Klassen abweichen.' },
      { q: 'Ab welcher Bortle-Klasse sieht man die Milchstraße?', a: 'Deutlich sichtbar ist die Milchstraße bis etwa Klasse 4, blass noch in Klasse 5. Ab Klasse 6 bleiben im Wesentlichen helle Sterne, Planeten und der Mond. Für Deep-Sky-Fotografie lohnt sich die Fahrt in Klasse 3 oder dunkler.' },
      { q: 'Wann ist es astronomisch dunkel?', a: 'Wenn die Sonne mehr als 18 Grad unter dem Horizont steht. Im mitteleuropäischen Hochsommer wird dieser Wert nördlich von etwa 48 Grad Breite nachts nicht mehr erreicht; buscosun weist solche Nächte als „ohne astronomische Dunkelheit" aus.' },
      { q: 'Stört der Mond mehr als Lichtverschmutzung?', a: 'Um Vollmond ja: Ein heller Mond über dem Horizont hellt den Himmel großflächig auf wie eine Vorstadtlage. buscosun rechnet die Mondstörung aus Beleuchtungsgrad und Anteil der Nacht über dem Horizont und senkt den Nacht-Score um bis zu 70 Prozent.' },
    ],
    sources: [
      { name: 'Sky & Telescope: The Bortle Dark-Sky Scale (Bortle 2001)', url: 'https://skyandtelescope.org/astronomy-resources/light-pollution-and-astronomy-the-bortle-dark-sky-scale/' },
      { name: 'Falchi et al. 2016: The new world atlas of artificial night sky brightness (Science Advances)', url: 'https://doi.org/10.1126/sciadv.1600377' },
      { name: 'DarkSky International: Light pollution', url: 'https://darksky.org/resources/what-is-light-pollution/' },
    ],
    relatedExplainers: ['goldene-blaue-stunde', 'nebel-hochnebel-nebelobergrenze', 'temperaturinversion'],
    relatedPlaces: ['brocken', 'feldberg-schwarzwald', 'obergurgl', 'scuol', 'davos', 'bad-gastein'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },

  // ------------------------------------------------------------- klimastreifen
  // Numbers: src/history/charts/Stripes.tsx (stripe = deviation from mean of shown years),
  // src/history/historyModel.ts (NORMAL_PERIODS 1961–1990/1971–2000/1991–2020, model-filled share).
  {
    slug: 'klimastreifen',
    title: 'Klimastreifen (Warming Stripes)',
    h1: 'Klimastreifen: ein Streifen pro Jahr, gefärbt nach Abweichung',
    status: 'full',
    answer:
      'Klimastreifen (Warming Stripes) zeigen jedes Jahr als senkrechten Farbstreifen: blau für kälter, rot für wärmer ' +
      'als ein Bezugswert. Die 2018 von Ed Hawkins eingeführte Grafik verzichtet auf Achsen und Zahlen und macht den ' +
      'Trend auf einen Blick lesbar. Die Farbe hängt vom gewählten Bezug ab — meist eine Referenzperiode wie 1961–1990 ' +
      'oder das Mittel des gezeigten Zeitraums.',
    sections: [
      {
        id: 'prinzip',
        h2: 'Wie die Streifen entstehen',
        html:
          '<p>Grundlage ist eine Jahresreihe — meist die Jahresmitteltemperatur einer Station, einer Region oder der ' +
          'Welt. Für jedes Jahr wird die <strong>Abweichung vom Bezugswert</strong> gebildet und auf eine zweifarbige, ' +
          'divergierende Skala gelegt: kräftiges Blau für die kältesten, kräftiges Rot für die wärmsten Jahre. ' +
          'Weil Skala und Bezug frei wählbar sind, sind Streifen verschiedener Quellen nur vergleichbar, wenn ' +
          '<a href="/glossar/#referenzperiode-1961-1990">Referenzperiode</a> und Farbspanne genannt sind. Die ' +
          'Originalstreifen von Hawkins nutzen die Periode 1971–2000 als Nullpunkt und spannen die Farben über ' +
          '±2,6 Standardabweichungen.</p>',
      },
      {
        id: 'lesen',
        h2: 'Was man ablesen kann — und was nicht',
        html:
          '<ul>' +
          '<li><strong>Den Trend</strong>: In Mitteleuropa dominieren seit den 1990er-Jahren rote Streifen; die letzten Jahre sind fast durchgehend die wärmsten der Reihe.</li>' +
          '<li><strong>Einzelne Ausreißer</strong>: kalte Jahre wie 1996 oder 2010 bleiben als blaue Streifen sichtbar.</li>' +
          '<li><strong>Nicht ablesbar</strong>: Absolutwerte, Jahreszeiten, Niederschlag. Ein Streifen fasst 365 Tage in eine Farbe.</li>' +
          '<li><strong>Vorsicht bei Stationswechseln</strong>: Verlegungen, neue Messgeräte oder Lücken erzeugen Sprünge, die nichts mit dem Klima zu tun haben.</li>' +
          '</ul>',
      },
      {
        id: 'buscosun',
        h2: 'So zeigt es buscosun',
        html:
          '<p>Im <a href="/wetterarchiv">Wetterarchiv</a> (<a href="/funktionen/historie/">Funktion Historie</a>) ' +
          'ist „Streifen" die erste Darstellung: je Jahr ein Streifen, eingefärbt nach der Abweichung vom ' +
          '<strong>Mittel der gezeigten Jahre</strong>; die Farbspanne wird aus den Anomalien der Reihe selbst ' +
          'bestimmt, damit auch kurze Reihen lesbar bleiben. Wer den klassischen Bezug will, wechselt in die ' +
          'Darstellung „Abweichung vom Normal" — dort stehen die drei WMO-Referenzperioden <strong>1961–1990</strong>, ' +
          '<strong>1971–2000</strong> und <strong>1991–2020</strong> zur Wahl, und die Grafik nennt den Normalwert. ' +
          'Die Daten stammen aus Stationsreihen über Meteostat (DWD, GeoSphere, MeteoSchweiz); der Anteil an ' +
          'Tagen, an denen der Anbieter Modellwerte statt Messungen eingefüllt hat, wird als Prozentzahl ausgewiesen ' +
          'und nicht als Messung gezählt. Ein Klick auf einen Streifen öffnet das Tagesband des Jahres; die ' +
          'Streifen lassen sich als Bild und CSV exportieren. Für Ortsseiten wie <a href="/wetter/berlin/">Berlin</a> ' +
          'oder <a href="/wetter/wien/">Wien</a> ist die nächste Station verlinkt.</p>',
      },
    ],
    faqs: [
      { q: 'Warum sehen Klimastreifen verschiedener Anbieter unterschiedlich aus?', a: 'Weil Bezugswert und Farbspanne frei gewählt werden. Ein Anbieter färbt gegen 1961–1990, ein anderer gegen das Reihenmittel; einer spannt die Farben über die Extremjahre, ein anderer über Standardabweichungen. Derselbe Datensatz kann so deutlich anders wirken.' },
      { q: 'Welche Referenzperiode ist die richtige?', a: 'Die WMO empfiehlt 1991–2020 als aktuelle Normalperiode und 1961–1990 als feste Referenz für die Bewertung des Klimawandels. buscosun bietet beide sowie 1971–2000 an und zeigt in den Streifen selbst das Mittel des gewählten Zeitraums.' },
      { q: 'Kann ich Klimastreifen für meinen Ort erstellen?', a: 'Ja, im Wetterarchiv von buscosun: Ort wählen, Variable und Zeitraum einstellen, Darstellung „Streifen". Die Grafik lässt sich als Bild und die Daten als CSV exportieren; Quelle und Stationsdistanz stehen dabei.' },
      { q: 'Zeigen Klimastreifen auch Niederschlag?', a: 'Grundsätzlich lässt sich jede Jahresreihe so darstellen. buscosun färbt Niederschlag ebenfalls divergierend um das Reihenmittel, kennzeichnet aber, dass die Farbrichtung dort „mehr" und „weniger" bedeutet, nicht „wärmer" und „kälter".' },
    ],
    sources: [
      { name: 'Ed Hawkins / University of Reading: #ShowYourStripes', url: 'https://showyourstripes.info/' },
      { name: 'DWD: Klimaüberwachung und Zeitreihen Deutschland', url: 'https://www.dwd.de/DE/leistungen/zeitreihen/zeitreihen.html' },
      { name: 'Meteostat: Wetter- und Klimadaten (Stationsreihen)', url: 'https://meteostat.net/' },
    ],
    relatedExplainers: ['kenntage-hitzetage-frosttage', 'wachstumsgradtage-heizgradtage', 'trockenperioden'],
    relatedPlaces: ['berlin', 'wien', 'zuerich', 'muenchen', 'basel'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },

  // --------------------------------------------------- kenntage-hitzetage-frosttage
  // Numbers: src/history/historyModel.ts (KENNTAGE thresholds), src/history/historyIndices.ts (heatWaves 28 °C/3 d).
  {
    slug: 'kenntage-hitzetage-frosttage',
    title: 'Kenntage: Hitzetage, Sommertage, Frosttage',
    h1: 'Kenntage: Hitzetage, Sommertage, Tropennächte, Frost- und Eistage',
    status: 'full',
    answer:
      'Kenntage sind Tage, an denen eine Temperatur eine feste Schwelle über- oder unterschreitet: Sommertag ' +
      '(Höchstwert mindestens 25 °C), Hitzetag (mindestens 30 °C), Tropennacht (Tiefstwert mindestens 20 °C), ' +
      'Frosttag (Tiefstwert unter 0 °C) und Eistag (Höchstwert unter 0 °C). Gezählt pro Jahr machen sie ' +
      'Klimatrends und Jahresvergleiche greifbar.',
    sections: [
      {
        id: 'definitionen',
        h2: 'Die fünf Kenntage und ihre Schwellen',
        html:
          '<ul>' +
          '<li><strong>Sommertag</strong>: Tageshöchsttemperatur ≥ 25 °C.</li>' +
          '<li><strong>Hitzetag</strong> (früher „heißer Tag"): Tageshöchsttemperatur ≥ 30 °C.</li>' +
          '<li><strong>Tropennacht</strong>: Tagestiefsttemperatur ≥ 20 °C — nachts kühlt es nicht mehr unter 20 °C ab.</li>' +
          '<li><strong>Frosttag</strong>: Tagestiefsttemperatur &lt; 0 °C.</li>' +
          '<li><strong>Eistag</strong>: Tageshöchsttemperatur &lt; 0 °C — es taut den ganzen Tag nicht.</li>' +
          '</ul>' +
          '<p>Die Schwellen folgen dem DWD; buscosun verwendet exakt diese Werte. Ein Hitzetag ist immer auch ein ' +
          'Sommertag, ein Eistag immer auch ein Frosttag. Die Zahlen hängen stark von der Lage ab: In Rheinnähe ' +
          'sind 20 Hitzetage im Jahr inzwischen normal, auf 1 000 m Höhe bleiben sie die Ausnahme; Eistage gibt es ' +
          'an der Nordsee selten, im Alpenvorland regelmäßig.</p>',
      },
      {
        id: 'trend',
        h2: 'Warum Kenntage den Klimawandel sichtbar machen',
        html:
          '<p>Mittelwerte verändern sich um Zehntelgrade, Kenntage um Tage: Steigt das Sommermittel um ein Grad, ' +
          'verdoppelt sich die Zahl der Hitzetage vielerorts. Deshalb sind Hitzetage und Tropennächte die Größen, mit ' +
          'denen Städte, Gesundheitsämter und Landwirte planen — Nachtwärme belastet den Kreislauf, fehlende Frosttage ' +
          'lassen Schädlinge überwintern. Umgekehrt nehmen Frost- und Eistage ab. Wichtig bleibt die Station: Ein ' +
          'Innenstadtstandort zählt mehr Tropennächte als ein Flughafen wenige Kilometer entfernt.</p>',
      },
      {
        id: 'buscosun',
        h2: 'So zeigt es buscosun',
        html:
          '<p>Im <a href="/wetterarchiv">Wetterarchiv</a> (<a href="/funktionen/historie/">Historie</a>) zählt die ' +
          'Darstellung „Kenntage" alle fünf Typen pro Jahr aus den Tagesbeobachtungen der nächsten Station und ' +
          'listet die fünf Rekordjahre je Kenntag. Die Schwellen sind einstellbar, damit sich zum Beispiel Tage ' +
          'über 35 °C oder Nächte über 22 °C zählen lassen; der Standard bleibt die DWD-Definition. Zusätzlich ' +
          'erkennt buscosun <strong>Hitzewellen</strong> als mindestens drei aufeinanderfolgende Tage mit ' +
          'Höchstwerten von 28 °C oder mehr — eine eigene, bewusst niedrige Schwelle für Mitteleuropa, keine ' +
          'amtliche Definition — und weist Beginn, Ende, Dauer und Spitzenwert aus. Fehlende Tage werden je Jahr ' +
          'als Zahl der ausgewerteten Tage angezeigt, damit ein lückenhaftes Jahr nicht als kühles Jahr erscheint. ' +
          'Die Zusammenfassung benennt, ob die letzten Jahre deutlich mehr Kenntage zeigen als die frühen Jahre der ' +
          'Reihe. Ortsseiten wie <a href="/wetter/frankfurt-am-main/">Frankfurt</a> oder ' +
          '<a href="/wetter/graz/">Graz</a> verlinken die Station.</p>',
      },
    ],
    faqs: [
      { q: 'Was ist der Unterschied zwischen Sommertag und Hitzetag?', a: 'Die Schwelle: Ein Sommertag hat einen Höchstwert von mindestens 25 °C, ein Hitzetag von mindestens 30 °C. Jeder Hitzetag ist damit auch ein Sommertag. Der DWD nennt Hitzetage in älteren Publikationen auch „heiße Tage".' },
      { q: 'Ab wann ist eine Nacht eine Tropennacht?', a: 'Wenn die Tagestiefsttemperatur nicht unter 20 °C sinkt. Tropennächte sind gesundheitlich relevanter als Hitzetage, weil sich der Körper nachts nicht erholt; in dicht bebauten Innenstädten treten sie deutlich häufiger auf als im Umland.' },
      { q: 'Wie definiert buscosun eine Hitzewelle?', a: 'Als mindestens drei aufeinanderfolgende Tage mit Höchstwerten von 28 °C oder mehr. Das ist eine eigene Arbeitsdefinition für Mitteleuropa; Wetterdienste nutzen je nach Zweck andere Schwellen, etwa 30 °C über drei Tage oder Perzentil-basierte Kriterien.' },
      { q: 'Warum zählt meine Station andere Kenntage als die Nachbarstadt?', a: 'Weil Kenntage Schwellenwerte sind: Ein Höchstwert von 29,8 °C ist kein Hitzetag, 30,1 °C schon. Lage, Höhe, Versiegelung und Messumgebung verschieben die Temperatur um ein bis zwei Grad — und damit die Zählung um viele Tage.' },
    ],
    sources: [
      { name: 'DWD Wetterlexikon: Klimatologische Kenntage', url: 'https://www.dwd.de/DE/service/lexikon/Functions/glossar.html' },
      { name: 'DWD: Klimaüberwachung und Zeitreihen Deutschland', url: 'https://www.dwd.de/DE/leistungen/zeitreihen/zeitreihen.html' },
    ],
    relatedExplainers: ['klimastreifen', 'wachstumsgradtage-heizgradtage', 'biowetter'],
    relatedPlaces: ['frankfurt-am-main', 'karlsruhe', 'graz', 'basel', 'muenchen'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },

  // ---------------------------------------------- wachstumsgradtage-heizgradtage
  // Numbers: src/history/historyIndices.ts (GDD base 10 °C, HDD base 15 °C, frost-free period, MID_DOY 183).
  {
    slug: 'wachstumsgradtage-heizgradtage',
    title: 'Wachstumsgradtage und Heizgradtage',
    h1: 'Wachstumsgradtage (GDD) und Heizgradtage (HDD): Wärmesummen erklärt',
    status: 'full',
    answer:
      'Wachstumsgradtage summieren über das Jahr, um wie viel das Tagesmittel eine Basistemperatur (bei buscosun 10 °C) ' +
      'übersteigt — ein Maß für die Wärme, die Pflanzen zur Entwicklung bekommen. Heizgradtage summieren umgekehrt, um ' +
      'wie viel das Tagesmittel unter einer Basis (15 °C) liegt — ein Maß für den Heizbedarf. Beide machen Jahre ' +
      'vergleichbar, unabhängig vom Kalender.',
    sections: [
      {
        id: 'gdd',
        h2: 'Wachstumsgradtage (Growing Degree Days)',
        html:
          '<p>Pflanzen entwickeln sich nicht nach Datum, sondern nach Wärme. <strong><a href="/glossar/#gdd">GDD</a></strong> ' +
          'rechnen das aus: Für jeden Tag wird die Differenz zwischen Tagesmittel und Basistemperatur gebildet, negative ' +
          'Werte werden zu null, und alles wird aufsummiert. Mit Basis 10 °C liefert ein Tag mit 18 °C Mittel 8 Gradtage, ' +
          'ein Tag mit 7 °C null. Weinbau, Obstbau und Maisanbau nutzen Basis 10 °C; für Wintergetreide sind 5 °C ' +
          'üblich, für Wärmeliebendes 12 °C oder mehr. Die <strong>kumulierte Kurve</strong> über das Jahr zeigt, ' +
          'wann ein Jahr „vorne" oder „hinten" liegt — ein Frühjahr, das Anfang Mai schon 200 Gradtage erreicht, ' +
          'bringt Blüte und Ernte um Wochen nach vorn.</p>',
      },
      {
        id: 'hdd',
        h2: 'Heizgradtage (Heating Degree Days)',
        html:
          '<p><strong><a href="/glossar/#hdd">Heizgradtage</a></strong> summieren, um wie viel das Tagesmittel unter ' +
          'einer Basis liegt: Mit Basis 15 °C zählt ein Tag mit 2 °C Mittel 13 Gradtage, ein Tag mit 16 °C null. ' +
          'Je höher die Summe, desto größer der Heizbedarf des Jahres — Energieversorger und Gebäudetechnik ' +
          'normieren damit Verbräuche. In Deutschland ist daneben die <strong>Gradtagzahl nach VDI 3807</strong> ' +
          'verbreitet, die mit Heizgrenze 15 °C und Raumtemperatur 20 °C rechnet (G20/15) und deshalb höhere Zahlen ' +
          'liefert; der DWD veröffentlicht Gradtagzahlen für Stationen. Die einfache 15-°C-Summe von buscosun ist mit ' +
          'G20/15 nicht direkt vergleichbar — der Trend über die Jahre ist es schon.</p>',
      },
      {
        id: 'buscosun',
        h2: 'So zeigt es buscosun',
        html:
          '<p>Im <a href="/wetterarchiv">Wetterarchiv</a> (<a href="/funktionen/historie/">Historie</a>) rechnet ' +
          'buscosun beide Summen aus den Tagesmitteln der nächsten Station: Wachstumsgradtage mit ' +
          '<strong>Basis 10 °C</strong>, Heizgradtage mit <strong>Basis 15 °C</strong>, jeweils gerundet je Jahr und ' +
          'mit der Zahl der ausgewerteten Tage, damit Lücken sichtbar bleiben. Die kumulierte GDD-Kurve eines Jahres ' +
          'lässt sich gegen andere Jahre legen. Dazu kommt die <strong>frostfreie Periode</strong>: der letzte ' +
          'Frost vor der Jahresmitte (Tag 183) und der erste Frost danach, ihre Differenz in Tagen sowie über alle ' +
          'Jahre das mittlere Datum des letzten Frühjahrsfrosts mit seiner Schwankung — die Kenngröße für ' +
          'Aussaat- und Pflanztermine. Für einen Standort wie <a href="/wetter/wuerzburg/">Würzburg</a> oder ' +
          '<a href="/wetter/krems-an-der-donau/">Krems</a> zeigt das, ob die Vegetationszeit sich verlängert. ' +
          'Die Basistemperaturen sind Standardwerte, keine Sortenkalibrierung; wer 5 °C oder 12 °C braucht, muss ' +
          'das derzeit selbst umrechnen.</p>',
      },
    ],
    faqs: [
      { q: 'Welche Basistemperatur verwendet buscosun?', a: 'Für Wachstumsgradtage 10 °C, für Heizgradtage 15 °C. Beides sind verbreitete Standardwerte; landwirtschaftliche Kulturen nutzen je nach Art auch 5 °C oder 12 °C, und die deutsche Gradtagzahl nach VDI 3807 rechnet zusätzlich mit 20 °C Raumtemperatur.' },
      { q: 'Wie viele Wachstumsgradtage braucht Wein?', a: 'Als Richtwert gelten für Rebsorten wie Riesling rund 1 000 bis 1 300 Gradtage (Basis 10 °C) über die Vegetationszeit, für spätreifende rote Sorten mehr. Die Zahlen hängen von Sorte, Lage und Rechenweise ab und sind kein Ersatz für die Beratung vor Ort.' },
      { q: 'Warum unterscheiden sich meine Heizgradtage vom Energieversorger?', a: 'Versorger nutzen meist die Gradtagzahl G20/15 nach VDI 3807, die an Heiztagen die Differenz zu 20 °C summiert. buscosun summiert die Differenz zu 15 °C. Beide messen denselben Verlauf, aber auf unterschiedlichem Niveau; vergleichbar ist der Trend, nicht die Zahl.' },
      { q: 'Was ist die frostfreie Periode?', a: 'Die Tage zwischen dem letzten Frost im Frühjahr und dem ersten Frost im Herbst. buscosun bestimmt beide aus den Tagestiefstwerten, nutzt die Jahresmitte als Trennlinie und gibt das mittlere Datum des letzten Frühjahrsfrosts mit seiner Schwankung in Tagen an.' },
    ],
    sources: [
      { name: 'DWD: Gradtagzahlen', url: 'https://www.dwd.de/DE/leistungen/gradtagzahlen/gradtagzahlen.html' },
      { name: 'NDAWN (North Dakota State University): Growing Degree Days explained', url: 'https://ndawn.ndsu.nodak.edu/help-corn-growing-degree-days.html' },
    ],
    relatedExplainers: ['kenntage-hitzetage-frosttage', 'klimastreifen', 'trockenperioden'],
    relatedPlaces: ['wuerzburg', 'freiburg-im-breisgau', 'krems-an-der-donau', 'sitten-sion', 'mainz'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },

  // ------------------------------------------------------------ trockenperioden
  // Numbers: src/history/historyIndices.ts (drySpells <1 mm, ≥10 days), src/sources/iconD2Smi.ts
  // (SMI 0 = wilting point, 1 = field capacity), src/fire/dangerViews.ts (DC ~52 days).
  {
    slug: 'trockenperioden',
    title: 'Trockenperioden und Dürre',
    h1: 'Trockenperioden: wann aus trockenen Tagen Dürre wird',
    status: 'full',
    answer:
      'Eine Trockenperiode ist eine Folge von Tagen praktisch ohne Niederschlag — bei buscosun mindestens zehn Tage ' +
      'in Folge mit weniger als 1 mm. Dürre ist mehr: ein Wasserdefizit, das sich über Wochen im Boden, in ' +
      'Pflanzen und Flüssen aufbaut. Ob eine Trockenperiode zur Dürre wird, entscheiden Bodenfeuchte, ' +
      'Verdunstung und die Vorgeschichte, nicht die Zahl der Tage allein.',
    sections: [
      {
        id: 'arten',
        h2: 'Meteorologische, Boden- und hydrologische Dürre',
        html:
          '<p>Fachlich werden drei Stufen unterschieden. Die <strong>meteorologische Dürre</strong> ist ein ' +
          'Niederschlagsdefizit gegenüber dem Üblichen — sie beginnt mit jeder längeren Trockenperiode. Die ' +
          '<strong>Bodendürre</strong> (agrarische Dürre) tritt ein, wenn der Boden seinen pflanzenverfügbaren ' +
          'Wasservorrat aufgebraucht hat; im Hochsommer kann das nach zwei bis drei Wochen ohne Regen der Fall sein, ' +
          'im Frühjahr dauert es länger. Die <strong>hydrologische Dürre</strong> folgt mit Monaten Verzögerung in ' +
          'Grundwasser und Flüssen. Deshalb kann ein einzelner Gewitterregen die Trockenperiode beenden, die Dürre ' +
          'aber nicht.</p>',
      },
      {
        id: 'boden',
        h2: 'Bodenfeuchte: Welkepunkt und Feldkapazität',
        html:
          '<p>Der Boden hält Wasser zwischen zwei Marken: der <strong>Feldkapazität</strong> (so viel, wie er gegen ' +
          'die Schwerkraft halten kann) und dem <strong><a href="/glossar/#welkepunkt">Welkepunkt</a></strong> (die ' +
          'Pflanze bekommt kein Wasser mehr). Der Bodenfeuchteindex <a href="/glossar/#smi">SMI</a> normiert das auf ' +
          '0 (Welkepunkt) bis 1 (Feldkapazität). Entscheidend ist die Tiefe: Der Oberboden trocknet in Tagen aus und ' +
          'steuert das Zündrisiko von Gras und Streu, die Wurzelzone in Wochen und steuert Pflanzenstress und ' +
          'Baumvitalität. Ein feuchter Unterboden unter trockenem Oberboden ist im Frühjahr der Normalfall — ' +
          'ein trockener Unterboden im Herbst das Warnzeichen der Landwirtschaft.</p>',
      },
      {
        id: 'buscosun',
        h2: 'So zeigt es buscosun',
        html:
          '<p>Rückblickend erkennt das <a href="/wetterarchiv">Wetterarchiv</a> (<a href="/funktionen/historie/">Historie</a>) ' +
          'Trockenperioden in den Stationsreihen: <strong>mindestens zehn aufeinanderfolgende Tage mit weniger als ' +
          '1 mm Niederschlag</strong>, jeweils mit Beginn, Ende und Dauer; das längste Ereignis eines Jahres wird ' +
          'hervorgehoben. Die Schwelle 1 mm filtert Tau und Nieselreste heraus, ohne einen kurzen Schauer als Ende ' +
          'zu übersehen. Vorausschauend zeigt der Brandradar in der Sicht <a href="/waldbrand/trockenheit">Trockenheit</a> ' +
          'den SMI aus dem DWD-Modell ICON-D2 (2,2 km, stündlich) in zwei Tiefen — Oberboden bis 9 cm, Wurzelzone ' +
          'bis 81 cm — und nennt, wie viel Prozent der Bodenfläche im DACH-Raum am oder unter dem Welkepunkt liegen; ' +
          'das ist ein Modellwert dieses Laufs, keine Klimatologie und keine Messung. Als Feuerwetter-Größe steht ' +
          'daneben der Drought Code des <a href="/wissen/fire-weather-index/">FWI</a> mit rund 52 Tagen Gedächtnis ' +
          'unter <a href="/waldbrand/gefahrenindex">Gefahrenindex</a> — ausdrücklich keine Bodenfeuchte. Die ' +
          'europäischen EDO-Dürreprodukte sind aus technischen Gründen nicht eingebunden und werden nicht nachgebildet.</p>',
      },
    ],
    faqs: [
      { q: 'Ab wann spricht man von einer Trockenperiode?', a: 'Es gibt keine einheitliche Definition. buscosun zählt mindestens zehn aufeinanderfolgende Tage mit weniger als 1 mm Niederschlag. Andere Quellen nutzen 0,1 mm als Schwelle oder verlangen 14 Tage; wichtig ist, dass Schwelle und Mindestdauer genannt werden.' },
      { q: 'Ist Trockenheit dasselbe wie Dürre?', a: 'Nein. Trockenheit beschreibt fehlenden Regen über Tage oder Wochen. Dürre ist das daraus entstehende Wasserdefizit in Boden, Pflanzen und Gewässern, das sich über Wochen aufbaut und nach dem ersten Regen noch Wochen anhält.' },
      { q: 'Woher kommt die Bodenfeuchte auf buscosun?', a: 'Aus dem DWD-Modell ICON-D2 als Bodenfeuchteindex in zwei Tiefen — ein Modellwert, keine Messung. Ein flächendeckendes Messnetz für Bodenfeuchte gibt es nicht; Wasser, Fels und Eis bleiben ohne Wert.' },
      { q: 'Warum zeigt der Drought Code Trockenheit, obwohl der Boden feucht ist?', a: 'Weil der Drought Code ein Feuerwetter-Code für tiefe organische Auflagen mit rund 52 Tagen Gedächtnis ist, keine Bodenfeuchte. Er reagiert langsam auf Regen und beschreibt Brennmaterial, nicht Wurzelraum — beide Größen stehen deshalb getrennt und benannt nebeneinander.' },
    ],
    sources: [
      { name: 'UFZ: Dürremonitor Deutschland', url: 'https://www.ufz.de/index.php?de=37937' },
      { name: 'Copernicus: European Drought Observatory (EDO)', url: 'https://drought.emergency.copernicus.eu/' },
      { name: 'DWD: Bodenfeuchte und agrarmeteorologische Produkte', url: 'https://www.dwd.de/DE/fachnutzer/landwirtschaft/landwirtschaft_node.html' },
    ],
    relatedExplainers: ['fire-weather-index', 'kenntage-hitzetage-frosttage', 'klimastreifen', 'wachstumsgradtage-heizgradtage'],
    relatedPlaces: ['magdeburg', 'potsdam', 'erfurt', 'wiener-neustadt', 'sitten-sion'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },

  // ------------------------------------------------------------------- talwind
  // Numbers: src/atmosphere/TalwindPanel.tsx (48-h forecast, DEM gradient ±0.06°, 40 m flat threshold),
  // src/threed/dynamics.ts (talwindReversals hysteresis ±1 km/h).
  {
    slug: 'talwind',
    title: 'Talwind und Bergwind',
    h1: 'Talwind und Bergwind: der Tagesgang der Winde im Gebirge',
    status: 'full',
    answer:
      'Talwind ist der tagsüber talaufwärts wehende Wind, Bergwind sein nächtliches Gegenstück talabwärts. Beide ' +
      'entstehen, weil sich Hänge und Talböden schneller erwärmen und abkühlen als die freie Atmosphäre in ' +
      'gleicher Höhe. Der Wechsel geschieht typischerweise am Vormittag und am Abend; für Gleitschirm, Segelflug ' +
      'und Bergsport ist die Umkehrzeit oft wichtiger als die Windstärke.',
    sections: [
      {
        id: 'mechanik',
        h2: 'Wie Talwind und Bergwind entstehen',
        html:
          '<p>Am Morgen erwärmt die Sonne die Hänge; die bodennahe Luft steigt als <strong>Hangaufwind</strong> ' +
          '(anabatisch) auf, und Luft aus dem Vorland strömt nach — der <strong>Talwind</strong> setzt ein, oft ' +
          'zwischen 9 und 11 Uhr, und erreicht am Nachmittag Stärken von 3 bis 6 m/s, in großen Alpentälern auch ' +
          'mehr. Nach Sonnenuntergang kühlt die Hangluft aus, wird schwerer und fließt als <strong>Hangabwind</strong> ' +
          '(katabatisch) zu Tal; im Laufe des Abends kehrt sich die Strömung im ganzen Tal um und der ' +
          '<strong>Bergwind</strong> weht bis zum nächsten Morgen talabwärts. Er ist meist schwächer, aber gleichmäßiger. ' +
          'In Kaltluftseen unter einer <a href="/wissen/temperaturinversion/">Inversion</a> kann er ganz einschlafen.</p>',
      },
      {
        id: 'praxis',
        h2: 'Was das für die Praxis bedeutet',
        html:
          '<ul>' +
          '<li><strong>Gleitschirm und Drachen</strong>: Der Talwind bringt Nachmittagsböen in Talenge und an Kreuzungen; Landeplätze im Tal werden ab Mittag turbulent. Die Umkehr am Morgen ist die ruhigste Phase.</li>' +
          '<li><strong>Segelflug und <a href="/wissen/thermik/">Thermik</a></strong>: Hangaufwind und Thermik verstärken sich gegenseitig; Talwind kippt Bärte hangwärts.</li>' +
          '<li><strong>Rad und Wandern</strong>: Talaufwärts am Nachmittag heißt Gegenwind; talabwärts am Abend ebenso.</li>' +
          '<li><strong><a href="/wissen/foehn/">Föhn</a> und Fronten</strong> überlagern den Tagesgang und setzen ihn außer Kraft — ein Talwind, der nachts nicht dreht, ist ein Hinweis auf eine großräumige Strömung.</li>' +
          '</ul>',
      },
      {
        id: 'buscosun',
        h2: 'So zeigt es buscosun',
        html:
          '<p>In der Atmosphären-Ansicht <a href="/atmosphaere/fliegen">Fliegen</a> berechnet buscosun für den ' +
          'gesetzten Punkt den <strong>Talwind-Tagesgang</strong>: Aus dem Geländemodell wird die „bergauf"-Richtung ' +
          'als lokaler Höhengradient über etwa 3 km geschätzt; ist der Reliefunterschied kleiner als 40 m, gilt der ' +
          'Ort als flach und es gibt keine Umkehr. Dann wird der stündliche Bodenwind der nächsten 48 Stunden auf ' +
          'diese Achse projiziert: positive Werte wehen taleinwärts, negative talauswärts. Ein echter ' +
          'Vorzeichenwechsel mit Hysterese von einem Kilometer pro Stunde markiert die <strong>Umkehrzeit</strong> — ' +
          'die Ansicht nennt, wann der Wind auf talauf und wann auf talab dreht. Ehrlich dazu: Die Achse ist die ' +
          'Hangrichtung aus dem Gelände, kein echter Talachsenverlauf, und die Winddaten stammen aus dem Punktforecast ' +
          '(ICON-D2, Fusion), nicht aus einer Messung. Den Höhenwind über dem Tal zeigt der ' +
          '<a href="/atmosphaere/querschnitt">Querschnitt</a>; Orte wie <a href="/wetter/innsbruck/">Innsbruck</a>, ' +
          '<a href="/wetter/chur/">Chur</a> oder <a href="/wetter/zell-am-ziller/">Zell am Ziller</a> liegen in ' +
          'klassischen Talwindtälern.</p>',
      },
    ],
    faqs: [
      { q: 'Wann dreht der Talwind auf Bergwind?', a: 'Meist ein bis zwei Stunden nach Sonnenuntergang, wenn die Hänge im Schatten auskühlen; morgens dreht es ein bis drei Stunden nach Sonnenaufgang zurück. In engen, tief eingeschnittenen Tälern verschieben sich beide Zeiten, weil die Sonne später kommt und früher geht.' },
      { q: 'Wie stark wird der Talwind?', a: 'In großen Alpentälern wie Inn-, Rhein- oder Rhonetal erreicht er nachmittags 5 bis 8 m/s mit Böen darüber, in kleineren Tälern 2 bis 4 m/s. Er ist am kräftigsten an klaren Sommertagen mit starker Einstrahlung und schwacher Großwetterlage.' },
      { q: 'Warum zeigt buscosun für meinen Ort keine Umkehr?', a: 'Entweder ist das Gelände im Umkreis von rund drei Kilometern flacher als 40 m Höhenunterschied, oder eine großräumige Strömung — Föhn, Front, Gradientwind — überlagert den Tagesgang so, dass die auf die Talachse projizierte Windkomponente ihr Vorzeichen nicht wechselt.' },
      { q: 'Ist Talwind dasselbe wie Föhn?', a: 'Nein. Talwind ist ein thermisch angetriebener Tagesgang, der jeden schönen Tag wiederkehrt. Föhn ist ein Fallwind einer großräumigen Anströmung über den Alpenhauptkamm, der tagelang anhalten kann und den Talwind meist völlig überdeckt.' },
    ],
    sources: [
      { name: 'AMS Glossary of Meteorology: Valley wind', url: 'https://glossary.ametsoc.org/wiki/Valley_wind' },
      { name: 'AMS Glossary of Meteorology: Mountain wind', url: 'https://glossary.ametsoc.org/wiki/Mountain_wind' },
      { name: 'DWD Wetterlexikon: Berg- und Talwind', url: 'https://www.dwd.de/DE/service/lexikon/Functions/glossar.html' },
    ],
    relatedExplainers: ['thermik', 'foehn', 'temperaturinversion', 'skew-t'],
    relatedPlaces: ['innsbruck', 'chur', 'zell-am-ziller', 'brig', 'landeck', 'mayrhofen'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },

  // -------------------------------------------------------------------- skew-t
  // Numbers: src/threed/SkewTChart.tsx (−40…+40 °C, skew 0.55, top 200 hPa, CAPE/CIN areas, LCL/LFC/EL),
  // src/sources/iconEuSounding.ts (ICON-EU ~7 km, ~40 files), src/atmosphere/profile-derivations.ts
  // (dry lapse 9.8 K/km, cloud at dewpoint depression <3 °C, thermal strength 0–5 m/s from BL depth).
  {
    slug: 'skew-t',
    title: 'Skew-T-Diagramm',
    h1: 'Skew-T-Diagramm: das Vertikalprofil der Atmosphäre lesen',
    status: 'full',
    answer:
      'Ein Skew-T-log-P-Diagramm zeigt Temperatur und Taupunkt der Atmosphäre gegen den Luftdruck, mit schräg ' +
      'gestellten Isothermen und logarithmischer Höhenachse. Daraus lassen sich Wolkenbasis (LCL), Kondensationsniveau ' +
      'freier Konvektion (LFC), Gleichgewichtsniveau (EL), CAPE und CIN als Flächen ablesen — der Standard, mit dem ' +
      'Meteorologen Gewitter- und Thermikpotenzial beurteilen.',
    sections: [
      {
        id: 'aufbau',
        h2: 'Wie das Diagramm aufgebaut ist',
        html:
          '<p>Die senkrechte Achse ist der Druck, logarithmisch, sodass die Höhe annähernd linear erscheint; oben ' +
          'liegen meist 100 oder 200 hPa. Die <strong>Isothermen</strong> laufen schräg von links unten nach rechts ' +
          'oben — daher „skew". Diese Schrägstellung macht die Flächen zwischen Umgebungs- und Parcel-Kurve ' +
          'proportional zur Energie. Eingezeichnet sind die <strong>Temperaturkurve</strong>, die ' +
          '<strong>Taupunktkurve</strong>, trocken- und feuchtadiabatische Hilfslinien und rechts die ' +
          '<strong>Windfiedern</strong> je Niveau. Liegen Temperatur und Taupunkt eng beieinander, ist die Schicht ' +
          'feucht bis wolkig; klaffen sie auseinander, ist sie trocken.</p>',
      },
      {
        id: 'kennwerte',
        h2: 'Die Kennwerte: LCL, LFC, EL, CAPE, CIN',
        html:
          '<ul>' +
          '<li><strong><a href="/glossar/#lcl">LCL</a></strong>: Hebungskondensationsniveau — die Höhe, in der ein vom Boden gehobenes Luftpaket kondensiert; die Basis der Quellwolken.</li>' +
          '<li><strong><a href="/glossar/#lfc">LFC</a></strong>: Niveau freier Konvektion — ab hier ist das Paket wärmer als die Umgebung und steigt von allein.</li>' +
          '<li><strong><a href="/glossar/#el">EL</a></strong>: Gleichgewichtsniveau — das Paket ist wieder so kalt wie die Umgebung; die Obergrenze der Gewitterwolke (Amboss).</li>' +
          '<li><strong><a href="/glossar/#cape">CAPE</a></strong>: die Fläche zwischen LFC und EL, in der das Paket wärmer ist — verfügbare Energie in J/kg.</li>' +
          '<li><strong><a href="/glossar/#cin">CIN</a></strong>: die Fläche unter dem LFC, in der das Paket kälter ist — der „Deckel", der überwunden werden muss.</li>' +
          '<li><strong><a href="/glossar/#inversion">Inversionen</a></strong> erscheinen als Knick, in dem die Temperatur mit der Höhe zunimmt; die <a href="/glossar/#nullgradgrenze">Nullgradgrenze</a> als Schnitt der Temperaturkurve mit 0 °C.</li>' +
          '</ul>',
      },
      {
        id: 'buscosun',
        h2: 'So zeigt es buscosun',
        html:
          '<p>Im <a href="/atmosphaere/querschnitt">Querschnitt</a> öffnet das Profi-Panel ein echtes Skew-T-log-P aus ' +
          'dem <strong>DWD-Modell ICON-EU</strong> (rund 7 km): Temperatur, Feuchte und Wind auf den Standard-Druckflächen ' +
          'plus reale Bodenwerte, am Punkt bilinear gesampelt. Der Preis dafür ist ehrlich benannt — ein Profil lädt ' +
          'etwa 40 Dateien, deshalb ist es ein Feature auf Abruf, kein Standardbild. Das Diagramm spannt −40 bis ' +
          '+40 °C am unteren Rand, reicht bis 200 hPa, zeichnet den Hebungsparcel gestrichelt, CAPE rot und CIN blau ' +
          'als Flächen und markiert LCL, LFC und EL. Aus demselben Profil leitet buscosun die Grenzschicht-Obergrenze ' +
          '(trockenadiabatisch, 9,8 K/km), Wolkenschichten (Taupunktspreizung unter 3 °C), Inversionsbänder, ' +
          'Scherzonen und eine <strong>Thermikstärke-Schätzung</strong> von 0 bis 5 m/s aus der Grenzschichttiefe ab — ' +
          'eine Schätzung, kein gemessener Steigwert. Dünne Strukturen unter 200 m löst der grobe Levelsatz nicht ' +
          'sicher auf. Die Ansicht <a href="/atmosphaere/fliegen">Fliegen</a> übersetzt dieselben Größen in ' +
          'Höhenwind, <a href="/wissen/thermik/">Thermik</a> und <a href="/wissen/talwind/">Talwind</a>.</p>',
      },
    ],
    faqs: [
      { q: 'Woher kommt das Profil — ist das eine Radiosonde?', a: 'Nein. buscosun zeigt ein Modellprofil aus DWD ICON-EU mit rund 7 km Auflösung auf Standard-Druckflächen. Es ist ein Richtwert für den Punkt, keine Messung; echte Radiosondenaufstiege gibt es nur an wenigen Stationen zweimal täglich.' },
      { q: 'Wie lese ich CAPE im Skew-T ab?', a: 'CAPE ist die Fläche zwischen der Parcel-Kurve und der Umgebungstemperatur oberhalb des LFC, solange das Paket wärmer ist. Je größer und breiter diese rot markierte Fläche, desto mehr Energie steht Gewittern zur Verfügung; die blaue CIN-Fläche darunter zeigt den Deckel.' },
      { q: 'Warum sind die Isothermen schräg?', a: 'Damit Energie als Fläche ablesbar wird und Temperaturkurven in der Troposphäre annähernd senkrecht verlaufen. Ohne die Schrägstellung würden alle Kurven in einer schmalen Diagonale zusammenfallen und CAPE wäre kaum sichtbar.' },
      { q: 'Was sagt eine kleine Taupunktspreizung?', a: 'Dass die Luft in dieser Höhe nahezu gesättigt ist — Wolken sind wahrscheinlich. buscosun markiert Niveaus mit weniger als 3 °C Spreizung als wolkig und leitet daraus die Wolkenschichten des Profils ab.' },
    ],
    sources: [
      { name: 'NOAA Storm Prediction Center: Sounding analysis help', url: 'https://www.spc.noaa.gov/exper/soundings/help/index.html' },
      { name: 'AMS Glossary of Meteorology: Skew T-log p diagram', url: 'https://glossary.ametsoc.org/wiki/Skew_t-logp_diagram' },
      { name: 'DWD Open Data: ICON-EU Modelldaten', url: 'https://www.dwd.de/EN/ourservices/opendata/opendata.html' },
    ],
    relatedExplainers: ['gewitter-unwetter', 'thermik', 'temperaturinversion', 'talwind', 'hoehenkorrektur-lapse-rate'],
    relatedPlaces: ['muenchen', 'stuttgart', 'innsbruck', 'bern', 'nuernberg'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },

  // --------------------------------------------------------- gewitterzellen-konrad
  // Numbers: src/radar/konrad3d.ts (5-min product, ~0.6 MB, ~38 cells, WGS84, sentinel, +5…+60 min,
  // uncertainty ellipses, no direction field), src/radar/cellLayers.ts (severity 0–3, horizon 60 min,
  // marks 15/30/60), src/radar/hailField.ts (hail_flag).
  {
    slug: 'gewitterzellen-konrad',
    title: 'Gewitterzellen und KONRAD',
    h1: 'Gewitterzellen und KONRAD3D: wie der DWD Zellen erkennt und verfolgt',
    status: 'full',
    answer:
      'KONRAD3D ist das Zellverfolgungsprodukt des Deutschen Wetterdienstes: Alle fünf Minuten erkennt es im ' +
      'dreidimensionalen Radarkomposit konvektive Zellen, bestimmt Umriss, Schwerpunkt, Höhe, Zuggeschwindigkeit und ' +
      'Hagelsignal und extrapoliert die Zugbahn bis 60 Minuten voraus — mit einer Unsicherheitsellipse je ' +
      'Stützstelle. Es ist eine Radarauswertung, keine amtliche Warnung.',
    sections: [
      {
        id: 'produkt',
        h2: 'Was KONRAD3D liefert',
        html:
          '<p>Das Produkt <strong>KONRAD3D</strong> („Konvektive Entwicklung in Radarprodukten") erscheint alle fünf ' +
          'Minuten als XML-Datei von rund 0,6 MB mit typischerweise einigen Dutzend Zellen. Je Zelle stehen darin ' +
          'die Referenzzeit (der Messzeitpunkt, nicht der Abruf), der <strong>3D-Schwerpunkt</strong>, der ' +
          '<strong>Umriss</strong> als Polygon, Fläche, Volumen, Echo-Ober- und -Untergrenze, maximale Reflektivität, ' +
          'eine Zuggeschwindigkeit als Betrag, ein <strong>Schweregrad</strong> von 0 bis 3, ein Hagelkennzeichen ' +
          'sowie Prognosepunkte für +5 bis +60 Minuten mit einer amtlichen Unsicherheitsellipse (Halbachsen in km, ' +
          'Winkel). Alle Koordinaten liegen bereits in geografischen Graden vor. Zwei Eigenheiten muss jede ' +
          'Auswertung kennen: Nicht verfügbare Werte tragen den Sentinel −1 000 000 000, und es gibt ' +
          '<strong>kein Richtungsfeld</strong> — die Zugrichtung muss aus Schwerpunkt und erstem Prognosepunkt ' +
          'gepeilt werden.</p>',
      },
      {
        id: 'lesen',
        h2: 'Zugbahn und Trichter richtig lesen',
        html:
          '<p>Die Zugbahn ist eine <strong>Extrapolation</strong>: Sie setzt voraus, dass die Zelle ihre Bewegung ' +
          'beibehält. Genau das tun Gewitter oft nicht — sie bilden sich neu an der Böenfront, verschmelzen oder ' +
          'sterben ab. Deshalb wächst die Unsicherheitsellipse mit der Vorlaufzeit zum Trichter. Eine Zelle mit ' +
          'Schweregrad 3 und Hagelkennzeichen ist ein Hinweis auf eine kräftige Zelle mit Hagel im Radarsignal; ob ' +
          'am Boden Hagel fällt, sagt das Radar nicht sicher. Amtliche Gewitter- und Unwetterwarnungen gibt allein der ' +
          'DWD heraus; KONRAD ist die Auswertung dahinter, nicht die Warnung selbst.</p>',
      },
      {
        id: 'buscosun',
        h2: 'So zeigt es buscosun',
        html:
          '<p>Der Layer <a href="/wetterkarte/zellbahnen">Zellbahnen</a> auf der Wetterkarte und im ' +
          '<a href="/regenradar">Regenradar</a> liest KONRAD3D mit einem eigenen Parser alle fünf Minuten und zeichnet ' +
          'je Zelle Umriss, Schwerpunkt, Zugspur mit Zeitmarken bei <strong>15, 30 und 60 Minuten</strong>, Pfeilkopf ' +
          'und den Unsicherheits-Trichter aus den amtlichen Ellipsen; die Farbe folgt dem Schweregrad von Sand über ' +
          'Amber und Terracotta bis Bordeaux. Jenseits von 60 Minuten ist der Layer bewusst aus — lieber nichts als ' +
          'eine unbelegte Verlängerung. Der Steckbrief einer Zelle nennt Fläche, Echo-Obergrenze, Zuggeschwindigkeit ' +
          'und -richtung, ein „Hinweis auf Hagel in der Zelle" und die geschätzte Spitzenböe; die Wortwahl ist ' +
          'bewusst konservativ. Zellen mit Hagelsignal erscheinen zusätzlich im Layer ' +
          '<a href="/wetterkarte/hagel">Hagel</a> mit Hagelfläche, Großhagelfläche und Hagel-Obergrenze (siehe ' +
          '<a href="/wissen/hagel-meshs-poh/">Hagel: MESHS und POH</a>). Das Produkt deckt das deutsche Radarnetz ab; ' +
          'für Österreich und die Schweiz gibt es keine gleichartige offene Zellverfolgung.</p>',
      },
    ],
    faqs: [
      { q: 'Wie weit voraus zeigt die Zellbahn?', a: 'Bis 60 Minuten, in Stützstellen von 5 Minuten, jede mit einer Unsicherheitsellipse des DWD. buscosun schaltet den Layer jenseits dieses Horizonts ab, weil eine längere Extrapolation nicht durch das Produkt gedeckt wäre.' },
      { q: 'Woher weiß buscosun, wohin die Zelle zieht?', a: 'KONRAD3D enthält nur den Betrag der Zuggeschwindigkeit, kein Richtungsfeld. Die Richtung wird aus dem Schwerpunkt und dem ersten Prognosepunkt gepeilt; die Zeitmarken auf der Spur zeigen, wo die Zelle in 15, 30 und 60 Minuten erwartet wird.' },
      { q: 'Bedeutet eine Zelle über meinem Ort, dass ich gewarnt werde?', a: 'Nein. Der Layer ist eine Radarauswertung, keine Warnung. Amtliche Warnungen gibt ausschließlich der Deutsche Wetterdienst heraus; buscosun zeigt sie im Warn-Layer als wörtliches Zitat und verweist im Zellen-Steckbrief darauf.' },
      { q: 'Gibt es Zellbahnen auch für Österreich und die Schweiz?', a: 'Nicht auf buscosun. KONRAD3D deckt das deutsche Radarnetz ab; für Österreich und die Schweiz existiert kein vergleichbares offenes Zellverfolgungsprodukt mit klarer Lizenz. Das Regenradar zeigt dort Niederschlag aus INCA beziehungsweise rzc, aber keine Zellen.' },
    ],
    sources: [
      { name: 'DWD: KONRAD — Konvektive Entwicklung in Radarprodukten', url: 'https://www.dwd.de/DE/leistungen/konrad/konrad.html' },
      { name: 'DWD Open Data: KONRAD3D Objektprodukt', url: 'https://opendata.dwd.de/weather/radar/konrad3d/' },
    ],
    relatedExplainers: ['gewitter-unwetter', 'hagel-meshs-poh', 'regenradar-radolan-inca-rzc', 'skew-t'],
    relatedPlaces: ['muenchen', 'stuttgart', 'nuernberg', 'leipzig', 'hannover'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },

  // ------------------------------------------------------------ hagel-meshs-poh
  // Numbers: src/radar/hailField.ts (MESHS stops 20–60 mm, POH ≥ 10 %, hail cell fields),
  // src/sources/meteoSwissHail.ts (season 1 Apr – 30 Sep).
  {
    slug: 'hagel-meshs-poh',
    title: 'Hagel: MESHS und POH',
    h1: 'Hagel im Radar: MESHS, POH und Hagelzellen erklärt',
    status: 'full',
    answer:
      'MESHS (Maximum Expected Severe Hail Size) schätzt aus dem Radar die größte zu erwartende Hagelkorngröße in ' +
      'Millimetern, POH (Probability of Hail) die Wahrscheinlichkeit, dass am Boden überhaupt Hagel fällt. Beide ' +
      'Produkte stammen von MeteoSchweiz. In Deutschland kennzeichnet KONRAD3D Zellen mit Hagelsignal; Österreich ' +
      'hat kein vergleichbares offenes Produkt.',
    sections: [
      {
        id: 'radar',
        h2: 'Wie das Radar Hagel erkennt',
        html:
          '<p>Ein Wetterradar sieht keinen Hagel direkt, sondern die Reflektivität von Niederschlag. Hagel verrät ' +
          'sich durch sehr hohe Reflektivität <em>in großer Höhe</em>: Reichen 45 dBZ oder mehr weit über die ' +
          '<a href="/glossar/#nullgradgrenze">Nullgradgrenze</a> hinaus, tragen die Aufwinde große Eiskörner. Daraus ' +
          'leiten sich zwei Klassiker ab. <strong><a href="/glossar/#poh">POH</a></strong> nutzt die Differenz ' +
          'zwischen der Höhe des 45-dBZ-Echos und der Nullgradgrenze und gibt eine Wahrscheinlichkeit von 0 bis ' +
          '100 Prozent. <strong><a href="/glossar/#meshs">MESHS</a></strong> nutzt die Höhe des 50-dBZ-Echos ' +
          'über der Nullgradgrenze und schätzt daraus die größte zu erwartende Korngröße, ausgegeben ab etwa 2 cm. ' +
          'Beide sind Schätzungen aus dem Volumenradar — Bodenmeldungen bestätigen sie, ersetzen tun sie nichts.</p>',
      },
      {
        id: 'schaden',
        h2: 'Korngröße und typische Schäden',
        html:
          '<ul>' +
          '<li><strong>ab 2 cm</strong>: Blüten, Blätter, Lackschäden, Gewächshausfolien.</li>' +
          '<li><strong>ab 3 cm</strong>: Karosseriedellen, beschädigte Rollläden und Photovoltaikmodule.</li>' +
          '<li><strong>ab 4 cm</strong>: Dachziegel, Oberlichter, verletzte Tiere im Freien.</li>' +
          '<li><strong>ab 5 cm</strong> („Großhagel"): Windschutzscheiben, Fassaden, Verletzungsgefahr für Menschen.</li>' +
          '</ul>' +
          '<p>Die Alpennordseite, das Schweizer Mittelland, der Bodenseeraum und das südliche Bayern gehören zu den ' +
          'hagelreichsten Regionen Europas; die Saison läuft von April bis September mit dem Schwerpunkt im Juni ' +
          'und Juli.</p>',
      },
      {
        id: 'buscosun',
        h2: 'So zeigt es buscosun',
        html:
          '<p>Der Layer <a href="/wetterkarte/hagel">Hagel</a> hält zwei Quellen bewusst getrennt. Für die ' +
          '<strong>Schweiz</strong> zeichnet er das MeteoSchweiz-Raster MESHS in Stufen von 20, 30, 40, 50 und 60 mm ' +
          '(Eisblau über Türkis und Amber bis Rot und Violett) oder wahlweise POH ab 10 Prozent in Stufen bis 90 — ' +
          'unter 10 Prozent bleibt die Karte transparent, weil das Produkt dort Rauschen wäre. Die CH-Produkte laufen ' +
          'nur in der Hagelsaison vom <strong>1. April bis 30. September</strong>; außerhalb sagt der Layer das statt ' +
          'eine leere Fläche zu zeigen. Für <strong>Deutschland</strong> zeichnet er die KONRAD3D-Zellen mit ' +
          'Hagelkennzeichen als Fläche (siehe <a href="/wissen/gewitterzellen-konrad/">Zellbahnen</a>) mit Hagelfläche, ' +
          'Großhagelfläche und Hagel-Obergrenze in Kilometern; die Kopfzeile lautet „Radar erkennt Hagel in der ' +
          'Zelle" beziehungsweise „Hinweis auf Großhagel" — nie „es hagelt". Für <strong>Österreich</strong> gibt es ' +
          'derzeit kein offenes Hagelprodukt mit klarer Lizenz; die Fläche bleibt dort leer, und das steht in der ' +
          'Legende. Amtliche Unwetterwarnungen gibt allein der Wetterdienst heraus.</p>',
      },
    ],
    faqs: [
      { q: 'Was ist der Unterschied zwischen MESHS und POH?', a: 'POH sagt, wie wahrscheinlich Hagel am Boden ist — eine Prozentzahl. MESHS sagt, wie groß die Körner höchstens werden dürften — ein Wert in Millimetern ab etwa 2 cm. Für die Frage „Auto in die Garage?" ist MESHS die relevantere Größe, POH für „kommt überhaupt etwas?".' },
      { q: 'Warum zeigt der Hagel-Layer im Winter nichts für die Schweiz?', a: 'Weil MeteoSchweiz MESHS und POH nur in der Hagelsaison vom 1. April bis 30. September produziert. buscosun weist darauf hin, statt eine leere Karte als „kein Hagel" auszugeben.' },
      { q: 'Wie zuverlässig ist die Korngröße aus dem Radar?', a: 'MESHS ist eine Obergrenze aus der Echohöhe, keine Messung am Boden. Studien der MeteoSchweiz zeigen gute Trefferquoten für die Frage „Hagel ja/nein", die Korngröße streut jedoch deutlich. Bodenmeldungen und Versicherungsdaten bleiben die Referenz.' },
      { q: 'Gibt es Hageldaten für Österreich?', a: 'Nicht als offenes Produkt mit klarer Lizenz, das buscosun einbinden könnte. Die Fläche bleibt dort leer und die Legende sagt das. Amtliche Gewitterwarnungen für Österreich veröffentlicht GeoSphere Austria.' },
    ],
    sources: [
      { name: 'MeteoSchweiz: Hagel', url: 'https://www.meteoschweiz.admin.ch/wetter/wetter-und-klima-von-a-bis-z/hagel.html' },
      { name: 'MeteoSchweiz: Open Government Data (Radarprodukte)', url: 'https://www.meteoswiss.admin.ch/services-and-publications/service/open-government-data.html' },
      { name: 'DWD: KONRAD — Konvektive Entwicklung in Radarprodukten', url: 'https://www.dwd.de/DE/leistungen/konrad/konrad.html' },
    ],
    relatedExplainers: ['gewitterzellen-konrad', 'gewitter-unwetter', 'regenradar-radolan-inca-rzc'],
    relatedPlaces: ['zuerich', 'luzern', 'bern', 'konstanz', 'augsburg', 'salzburg'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },

  // ---------------------------------------------- regenradar-radolan-inca-rzc
  // Numbers: src/sources/radolan.ts (RV 25 frames, 5 min, DE1200 1 km, ×0.12), src/sources/geosphereIncaGrid.ts
  // (INCA 1 km/15 min, 12 frames), src/sources/meteoSwissRadar.ts (rzc 1 km/5 min, analysis only),
  // src/scalar/precipComposite.ts (RV_MAX_H 2, INCA_MAX_H 3, RZC_MAX_H 0.5), src/nowcast/nowcastModel.ts
  // (6 h/15 min, skill 120 min, blend 90–150, WET 0.1, HEAVY 2.5, STARKREGEN 5 mm/h / 15 mm),
  // scripts/seo/methodik.mjs (Horn-Schunck, 15 variants).
  {
    slug: 'regenradar-radolan-inca-rzc',
    title: 'Regenradar: RADOLAN, INCA, rzc',
    h1: 'Regenradar im DACH-Raum: RADOLAN-RV, INCA und rzc erklärt',
    status: 'full',
    answer:
      'Die drei Länder liefern drei verschiedene Radarprodukte: Deutschland RADOLAN-RV mit Nowcast bis 2 Stunden in ' +
      '5-Minuten-Schritten, Österreich INCA mit Nowcast bis 3 Stunden in 15-Minuten-Schritten, die Schweiz rzc als ' +
      'reine Analyse ohne Vorhersage. Alle drei haben 1 km Auflösung, unterscheiden sich aber in Gitter, Takt und ' +
      'Horizont — ein grenzüberschreitendes Radarbild muss sie Zelle für Zelle zusammensetzen.',
    sections: [
      {
        id: 'produkte',
        h2: 'Drei Länder, drei Produkte',
        html:
          '<ul>' +
          '<li><strong><a href="/glossar/#radolan-rv">RADOLAN-RV</a> (DWD)</strong>: „Radar-Vorhersage". Alle fünf Minuten ein Paket mit 25 Frames von +0 bis +120 Minuten auf dem Gitter DE1200 (1 100 × 1 200 Zellen, 1 km, polarstereografisch). Frame 0 ist die Analyse; jede Zelle trägt den Niederschlag in 0,01 mm je 5 Minuten, also mm/h = Wert × 0,12. Offen unter CC BY 4.0.</li>' +
          '<li><strong><a href="/glossar/#inca">INCA</a> (GeoSphere Austria)</strong>: das alpine Nowcasting-System, 1 km, Update alle 15 Minuten, 12 Vorhersageframes von +0,25 bis +3 Stunden als ein NetCDF. Es verbindet Radar, Stationen und Modell und kennt das Gelände.</li>' +
          '<li><strong><a href="/glossar/#rzc">rzc</a> (MeteoSchweiz)</strong>: die Radar-Regenrate „RR", 1 km alle 5 Minuten als ODIM-HDF5 — eine Analyse für „jetzt" und die Vergangenheit, <em>ohne</em> Vorhersage. Das Schweizer INCA-Nowcasting ist nicht als offenes Gitter publiziert.</li>' +
          '</ul>',
      },
      {
        id: 'nowcast',
        h2: 'Warum ein Radar-Nowcast nach zwei Stunden endet',
        html:
          '<p>Ein Radar-<a href="/glossar/#nowcast">Nowcast</a> verschiebt das aktuelle Bild mit dem geschätzten ' +
          'Bewegungsfeld (<a href="/glossar/#advektion">Advektion</a>) — er weiß, wohin Regen zieht, aber nicht, ' +
          'wo neuer entsteht oder alter sich auflöst. Deshalb ist die Trefferquote in der ersten Stunde hoch und ' +
          'fällt danach steil ab; jenseits von zwei bis drei Stunden ist ein Wettermodell wie ICON-D2 besser. ' +
          'Im Gebirge ist das Radarbild zusätzlich lückenhaft: Berge schatten Strahlen ab, und in großer Höhe misst ' +
          'das Radar Schnee, der am Boden Regen ist. INCA gleicht das mit Stationen aus; RADOLAN und rzc nutzen ' +
          'eigene Korrekturen.</p>',
      },
      {
        id: 'buscosun',
        h2: 'So zeigt es buscosun',
        html:
          '<p>Der Layer <a href="/wetterkarte/niederschlag">Niederschlag</a> und das <a href="/regenradar">Regenradar</a> ' +
          'rendern <strong>ein</strong> Komposit über DACH und wählen je Kartenzelle das fachlich richtige Produkt: ' +
          'RADOLAN-RV über Deutschland bis 2 Stunden, INCA über Österreich bis 3 Stunden, rzc über der Schweiz nur ' +
          'für „jetzt" (bis 30 Minuten), jenseits des jeweiligen Horizonts ICON-D2. So übermalt INCA nicht ' +
          'Süddeutschland und RADOLAN nicht Vorarlberg. Der Zeitregler endet am Horizont des geladenen Landesradars; ' +
          'die Punktabfrage nennt Quelle und Gültigkeit. Die 6-Stunden-Serie eines Ortes wird in 15-Minuten-Schritten ' +
          'aus Radar (bis 120 Minuten) und Punktforecast gebildet, mit einer Überblendung zwischen 90 und 150 Minuten; ' +
          'als nass gilt ab 0,1 mm/h, als kräftig ab 2,5 mm/h, als Starkregen ab 5 mm/h oder 15 mm Summe. Für ' +
          'Deutschland rechnet buscosun zusätzlich eine Regenwahrscheinlichkeit aus einem 15-Varianten-Ensemble ' +
          '(Horn-Schunck-Bewegungsfeld, fünf Tempo- mal drei Richtungsstörungen) für rund 60 Minuten — die ' +
          '<a href="/methodik/regenradar-nowcast/">Methodik Regenradar-Nowcast</a> erklärt die Kalibrierung.</p>',
      },
    ],
    faqs: [
      { q: 'Warum endet der Regler für die Schweiz bei „jetzt"?', a: 'Weil MeteoSchweiz das Nowcasting nicht als offenes Gitter veröffentlicht. Verfügbar ist die Radar-Regenrate rzc als Analyse; für die kommenden Stunden nutzt buscosun über der Schweiz das Modell ICON-D2 und sagt das an der Zeitachse.' },
      { q: 'Wie aktuell ist das Radarbild?', a: 'RADOLAN-RV und rzc erscheinen alle 5 Minuten, INCA alle 15 Minuten; hinzu kommt die Verarbeitungszeit beim Wetterdienst und der Abruf. Ein Bild ist deshalb typischerweise 5 bis 15 Minuten alt — buscosun zeigt den Messzeitpunkt, nicht die Abrufzeit.' },
      { q: 'Warum ist die Karte im Gebirge lückenhaft?', a: 'Radarstrahlen werden von Bergen abgeschattet und messen in großer Höhe. Täler hinter Kämmen bleiben blind, und Schnee in der Höhe erscheint als schwächeres Signal. INCA korrigiert mit Stationen; RADOLAN und rzc nutzen eigene Aufbereitungen, Restlücken bleiben.' },
      { q: 'Ist die Regenwahrscheinlichkeit auf buscosun kalibriert?', a: 'Für Deutschland ja: Der Anteil nasser Varianten im 15-Varianten-Ensemble wird isotonisch kalibriert, und eine Validierungsseite rechnet Brier Score und Reliability live gegen das beobachtete Radar nach. Für Österreich und die Schweiz gibt es diese Wahrscheinlichkeit nicht.' },
    ],
    sources: [
      { name: 'DWD: RADOLAN — Radar-Online-Aneichung und Nowcast-Produkte', url: 'https://www.dwd.de/DE/leistungen/radolan/radolan.html' },
      { name: 'GeoSphere Austria: Data Hub API (INCA Nowcast)', url: 'https://dataset.api.hub.geosphere.at/v1/docs/' },
      { name: 'MeteoSchweiz: Open Government Data (Radarprodukte)', url: 'https://www.meteoswiss.admin.ch/services-and-publications/service/open-government-data.html' },
    ],
    relatedExplainers: ['gewitterzellen-konrad', 'hagel-meshs-poh', 'schneefallgrenze', 'modellvergleich-unsicherheit'],
    relatedPlaces: ['koeln', 'bregenz', 'basel', 'konstanz', 'passau'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },

  // ------------------------------------------------ windgrenzwerte-arbeit-drohne
  // Numbers: src/threed/goNoGo.ts (height AGL, gust limit, 15-min raster, height factor),
  // src/threed/crossSection.ts (power law alpha 0.2, ref 10 m, cap 1 500 m), src/threed/GoNoGoPanel.tsx
  // (0–1 500 m, 0–200 km/h), src/route/route3d/gonogo.ts (defaults gust 40 km/h, rain 2 mm/h, apparent 0 °C),
  // scripts/seo/tools.mjs (36-h window).
  {
    slug: 'windgrenzwerte-arbeit-drohne',
    title: 'Windgrenzwerte für Arbeit und Drohne',
    h1: 'Windgrenzwerte für Drohne, Kran und Höhenarbeit: was zählt und wo es steht',
    status: 'full',
    answer:
      'Ob ein Drohnenflug, ein Kranhub oder eine Arbeit in der Höhe stattfinden darf, entscheidet nicht der ' +
      'Mittelwind am Boden, sondern die Böe auf Arbeitshöhe gegen den Grenzwert aus Betriebsanleitung, ' +
      'Herstellerangabe oder Gefährdungsbeurteilung. Die EU-Drohnenregeln nennen keine feste Windzahl; für Krane ' +
      'ist die Herstellerangabe maßgeblich. buscosun rechnet die Böe auf Höhe und meldet Go oder No-Go.',
    sections: [
      {
        id: 'regeln',
        h2: 'Was die Regeln sagen — und was nicht',
        html:
          '<p><strong>Drohnen</strong>: Die EU-Durchführungsverordnung 2019/947 und die EASA-Leitlinien schreiben ' +
          'keinen numerischen Windgrenzwert vor. Verbindlich ist die <strong>Herstellerangabe</strong> zur maximalen ' +
          'Windbeständigkeit (bei vielen Multikoptern der Größenordnung 8 bis 12 m/s, das sind rund 30 bis 43 km/h) ' +
          'und die Pflicht des Fernpiloten, nur bei geeigneten Wetterbedingungen zu fliegen. <strong>Krane</strong>: ' +
          'Die Betriebsanleitung des Herstellers nennt die zulässige Windgeschwindigkeit je Konfiguration und Last; ' +
          'die Unfallverhütungsvorschriften der DGUV verlangen, den Betrieb einzustellen, wenn sie überschritten wird — ' +
          'gemessen am Kran, nicht am Boden. <strong>Höhenarbeit, Gerüst, Event-Aufbau</strong>: Grenzwerte stehen ' +
          'in der Gefährdungsbeurteilung, bei Zelten und Bühnen in der Prüfstatik (häufig Windstärken nach ' +
          '<a href="/glossar/#beaufort">Beaufort</a>). Alle genannten Zahlen sind Größenordnungen; die eigene ' +
          'Betriebsanleitung ist maßgeblich.</p>',
      },
      {
        id: 'hoehe',
        h2: 'Warum die Böe auf Höhe zählt',
        html:
          '<p>Wettervorhersagen nennen Wind und <a href="/glossar/#boee">Böen</a> in 10 m über Grund. Mit der Höhe ' +
          'nimmt der Wind zu, weil die Bodenreibung nachlässt — in der <a href="/glossar/#grenzschicht">Grenzschicht</a> ' +
          'näherungsweise nach einem Potenzgesetz. Eine Bodenböe von 40 km/h kann in 100 m Höhe 60 km/h bedeuten. ' +
          'Über Kämmen und Graten kommt die Beschleunigung durch das Gelände dazu, an Gebäudekanten Turbulenz. ' +
          'Entscheidend ist deshalb die <strong>Böe auf Arbeitshöhe</strong> — und weil Böen kurz sind, ihr ' +
          'Spitzenwert im Zeitfenster, nicht der Mittelwert.</p>',
      },
      {
        id: 'buscosun',
        h2: 'So zeigt es buscosun',
        html:
          '<p>Das <a href="/funktionen/arbeitsfenster/">Arbeitsfenster</a> unter ' +
          '<a href="/atmosphaere/querschnitt?ansicht=gonogo">Querschnitt · Go/No-Go</a> nimmt eine Arbeits- oder ' +
          'Flughöhe über Grund (0 bis 1 500 m) und einen Böen-Grenzwert in km/h (0 bis 200) entgegen. Es rechnet die ' +
          'prognostizierte Bodenböe mit einem Potenzgesetz (Exponent 0,2, Bezug 10 m, gesättigt ab 1 500 m über ' +
          'Grund) auf diese Höhe hoch und prüft im 15-Minuten-Raster über rund 36 Stunden, wann der Grenzwert ' +
          'überschritten wird. Ergebnis: Status <strong>Go</strong> oder <strong>No-Go</strong> für jetzt, die ' +
          'Spitzenböe im Fenster, eine Liste der No-Go-Zeitfenster und der <strong>Höhenfaktor</strong> Boden → ' +
          'Arbeitshöhe. Der Referenzpunkt ist der höchste Anker des Schnitts — die exponierteste Lage. Der Grenzwert ' +
          'kommt von dir; buscosun schlägt keinen vor und ersetzt keine Betriebsanleitung. In der 3D-Tourenansicht ' +
          'gibt es dieselbe Logik mit Standardgrenzen von 40 km/h Böen, 2 mm/h Regen und 0 °C gefühlter Temperatur ' +
          'sowie den Zwischenstufen „knapp" und „unklar", wenn die Vorhersage nahe am Grenzwert oder ohne Quelle ist. ' +
          'Die Böen selbst zeigt der Layer <a href="/wetterkarte/boeen">Böen</a> als ICON-D2-Fläche. Amtliche ' +
          'Sturmwarnungen gibt allein der Wetterdienst heraus.</p>',
      },
    ],
    faqs: [
      { q: 'Bei wie viel Wind darf eine Drohne nicht mehr fliegen?', a: 'Die EU-Regeln nennen keine Zahl; maßgeblich sind die Herstellerangabe zur Windbeständigkeit und die Einschätzung des Fernpiloten. Viele Multikopter sind für Größenordnungen von 8 bis 12 m/s ausgelegt — auf Flughöhe, nicht am Boden. Die Betriebsanleitung entscheidet.' },
      { q: 'Wie rechnet buscosun die Böe auf Arbeitshöhe?', a: 'Mit einem Potenzgesetz der Grenzschicht: Böe auf Höhe = Bodenböe × (Höhe / 10 m) hoch 0,2, gedeckelt bei 1 500 m über Grund. Das ist eine Näherung für offenes Gelände; über Graten, an Gebäuden und bei Inversionen kann der reale Wert abweichen.' },
      { q: 'Welcher Grenzwert ist voreingestellt?', a: 'Im Arbeitsfenster keiner — du trägst den Wert aus deiner Betriebsanleitung oder Gefährdungsbeurteilung ein. Die 3D-Tourenansicht nutzt als Standard 40 km/h Böen, 2 mm/h Regen und 0 °C gefühlte Temperatur, jeweils änderbar.' },
      { q: 'Ist ein „Go" eine Freigabe?', a: 'Nein. Es bedeutet nur, dass die prognostizierte Böe auf der gewählten Höhe unter deinem Grenzwert liegt. Die Freigabe trifft die verantwortliche Person vor Ort nach Betriebsanleitung, Sichtprüfung und amtlicher Warnlage — Warnungen gibt ausschließlich der Wetterdienst heraus.' },
    ],
    sources: [
      { name: 'EASA: Drones — Civil drones (unmanned aircraft) regulatory framework', url: 'https://www.easa.europa.eu/en/domains/drones-air-mobility' },
      { name: 'DGUV: Publikationen (Vorschriften, Regeln und Informationen)', url: 'https://publikationen.dguv.de/' },
      { name: 'DWD Wetterlexikon: Beaufort-Skala', url: 'https://www.dwd.de/DE/service/lexikon/Functions/glossar.html' },
    ],
    relatedExplainers: ['windboeen-sturm', 'foehn', 'talwind', 'gewitter-unwetter'],
    relatedPlaces: ['hamburg', 'frankfurt-am-main', 'wien', 'zuerich', 'feldberg-schwarzwald'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },
];

export const EXPLAINERS_EXTRA_BY_SLUG = Object.fromEntries(EXPLAINERS_EXTRA.map((e) => [e.slug, e]));
