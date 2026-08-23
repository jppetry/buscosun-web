/**
 * Tool-/Funktions-Landingpages (build-only, reines Node-ESM).
 *
 * Indexierbare Seiten unter /funktionen/<slug>/ je echtem buscosun-Tool. Ziel:
 * teilbare, screenshot-fähige Einstiegsseiten (Community-Seeding, Digital PR) +
 * klassisches SEO. Wertversprechen + Datenbasis im rohen HTML; Live-Canvas ist
 * nur Enhancement. Deep-Link öffnet das Tool in der App.
 *
 * status: 'full' = indexierter Pilot. 'stub' = Scaffold (noindex).
 * deepLink: Pfad-Route in die SPA (Phase RT1, `src/router/routes.ts`) — kein
 *           Hash mehr; `scripts/verify-routing.mjs` prüft jeden Link gegen die Tabelle.
 */

const PUBLISHED = '2026-06-26';
const MODIFIED = '2026-06-26';

export const TOOLS = [
  // ---------------------------------------------------------------- PILOT 1
  {
    slug: 'wetterkarte',
    title: 'Interaktive Wetterkarte',
    h1: 'Interaktive Wetterkarte für DACH',
    status: 'full',
    deepLink: '/wetterkarte',
    answer:
      'Die interaktive Wetterkarte von buscosun zeigt Wind, Niederschlag, Temperatur, Wolken, Satellit, ' +
      'Blitze und Messstationen für Deutschland, Österreich und die Schweiz auf einer flüssigen Vektorkarte. ' +
      'Alle Layer stammen aus amtlichen Quellen, sind höhenkorrigiert und ohne Tracker direkt im Browser nutzbar.',
    bullets: [
      'Layer: Wind (ICON-D2), Niederschlagsradar (RADOLAN-RV/INCA/MeteoSwiss), Temperatur (höhenkorrigiert), Wolken, Satellit, Blitze, Stationen',
      'Flüssige MapLibre-Vektorkarte mit Zeit-Schieber',
      'Amtliche Quellen: DWD · GeoSphere Austria · MeteoSwiss',
      'Keine Tracker, kein Konto, läuft komplett im Browser',
    ],
    sections: [
      {
        id: 'layer',
        h2: 'Welche Wetter-Layer die Karte zeigt',
        html:
          '<p>Die Karte kombiniert mehrere amtliche Datenquellen zu frei kombinierbaren Layern: das ' +
          '<strong>Windfeld</strong> aus ICON-D2, das <strong>Niederschlagsradar</strong> (in Deutschland ' +
          'RADOLAN-RV, in Österreich INCA, in der Schweiz das MeteoSwiss-Radar), die <strong>höhenkorrigierte ' +
          'Temperatur</strong>, Bewölkung, Satellitenbild, Blitzortung und Messstationen. So entsteht ein ' +
          'einheitliches DACH-Bild über alle Landesgrenzen hinweg.</p>',
      },
      {
        id: 'hoehenkorrektur',
        h2: 'Warum die Temperatur höhenkorrigiert ist',
        html:
          '<p>Wettermodelle nutzen ein grobes Geländeraster. buscosun rechnet die Temperatur über ein ' +
          'digitales Geländemodell und eine ortsabhängige Lapse-Rate auf die tatsächliche Höhe um — ein ' +
          'Unterschied von mehreren Grad in Bergregionen. Mehr dazu im Beitrag ' +
          '<a href="/wissen/hoehenkorrektur-lapse-rate/">Höhenkorrektur &amp; Lapse-Rate</a>.</p>',
      },
    ],
    faqs: [
      { q: 'Welche Daten zeigt die Wetterkarte?', a: 'Wind, Niederschlagsradar, höhenkorrigierte Temperatur, Wolken, Satellit, Blitze und Messstationen aus amtlichen Quellen (DWD, GeoSphere Austria, MeteoSwiss).' },
      { q: 'Kostet die Wetterkarte etwas?', a: 'Nein. Die Karte ist kostenlos, benötigt kein Konto, setzt keine Tracker ein und läuft vollständig im Browser.' },
    ],
    relatedExplainers: ['hoehenkorrektur-lapse-rate', 'windboeen-sturm'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },

  // ---------------------------------------------------------------- PILOT 3
  // Waldbrand DACH (Phase WB, 2026-08-14). Bewusst `full`: Die Ansicht ist die
  // einzige im deutschsprachigen Raum, die den EU-Index und die amtlichen
  // Landesstufen NEBENEINANDER zeigt, ohne sie ineinander umzurechnen — und
  // die Österreich-Lücke ausspricht, statt sie zu überdecken. Genau das ist
  // der Grund, warum sich die Seite zu verlinken lohnt.
  {
    slug: 'waldbrandgefahr',
    title: 'Waldbrandgefahr DACH',
    h1: 'Waldbrandgefahr in Deutschland, Österreich und der Schweiz',
    status: 'full',
    deepLink: '/waldbrand',
    answer:
      'Die Waldbrand-Ansicht von buscosun zeigt den europäischen Gefahrenindex als durchgehende Fläche über '
      + 'Deutschland, Österreich und die Schweiz — und daneben die amtlichen Landesstufen von DWD und BAFU, '
      + 'jede mit ihrer eigenen Skala. Dazu aktive Brände aus Satellitendaten und die Feuchte der Luft als '
      + 'Feuerwetter-Treiber. Für Österreich gibt es keinen '
      + 'offenen amtlichen Index; das steht auf der Karte, statt kaschiert zu werden.',
    bullets: [
      'EU-Gefahrenindex (Copernicus GWIS, ECMWF-FWI) bis +9 Tage, durchgehend über alle drei Länder',
      'Amtliche Stufen: DWD-Waldbrandgefahrenindex (484 Stationen) und BAFU-Warnregionen — getrennte Skalen, keine Umrechnung',
      'Aktive Brände als Satelliten-Thermalanomalien (VIIRS), 24 Stunden oder 7 Tage',
      'Feuerwetter-Treiber aus ICON-D2: je trockener die Luft, desto leichter entzündet sich Streu',
      'Datenalter je Layer sichtbar',
    ],
    sections: [
      {
        id: 'skalen',
        h2: 'Warum die nationalen Stufen nicht vergleichbar sind',
        html:
          '<p>„Geringe Gefahr" bedeutet in Deutschland <strong>Stufe 2</strong> und in der Schweiz '
          + '<strong>Stufe 1</strong>. Dahinter stehen verschiedene Modelle — der DWD rechnet ein eigenes '
          + 'Bestandsmodell aus Streu- und Bodenfeuchte, die Schweiz den kanadischen Fire Weather Index, den '
          + 'die Kantone anschließend anpassen können. Eine Zuordnung nach Beschriftung würde die gesamte '
          + 'Schweizer Skala um eine Stufe verschieben.</p>'
          + '<p>buscosun rechnet die Skalen deshalb <strong>nicht</strong> ineinander um. Sie stehen '
          + 'nebeneinander, jede mit eigener Legende und eigenem Quellenlabel. An der Grenze endet die '
          + 'deutsche Stufe und die Schweizer beginnt — sichtbar und gewollt, während der EU-Index '
          + 'darunter durchläuft.</p>',
      },
      {
        id: 'oesterreich',
        h2: 'Warum Österreich anders behandelt wird',
        html:
          '<p>Für Österreich gibt es <strong>keinen offenen amtlichen Waldbrandindex</strong>. GeoSphere '
          + 'Austria führt weder einen entsprechenden Datensatz noch einen Waldbrand-Warntyp; die '
          + 'Risikokarte des Ministeriums und die Waldbrand-Datenbank der BOKU stehen ohne Lizenz und ohne '
          + 'Download bereit. Auf der Karte erscheint für Österreich deshalb nur der EU-Modellwert — und '
          + 'der ist ausdrücklich <em>keine</em> amtliche Stufe. Verbindlich sind die Verordnungen der '
          + 'Bezirkshauptmannschaften, auf die die Ansicht verlinkt.</p>',
      },
      {
        id: 'grenzen',
        h2: 'Was diese Ansicht ausdrücklich nicht ist',
        html:
          '<p>Sie ist <strong>kein amtliches Warnprodukt</strong>. Maßgeblich bleiben der DWD, die '
          + 'Landesforstverwaltungen, die Bezirkshauptmannschaften und die Kantone; jeder Layer sagt das in '
          + 'seinem Steckbrief.</p>'
          + '<p>Die Satelliten-Hotspots sind <strong>Thermalanomalien, keine Einsatzmeldungen</strong>: '
          + 'Kleine Bodenfeuer unterhalb der Pixelgröße bleiben unsichtbar, Überflüge sind lückenhaft, und '
          + 'Erntefeuer erscheinen wie Waldbrände. Der Feuerwetter-Treiber ist ein <strong>Treiber, kein '
          + 'Index</strong> — die kumulativen Codes des Fire Weather Index brauchen Wochen an Vorgeschichte '
          + 'und lassen sich in einer reinen Browser-Anwendung nicht berechnen; sie kommen fertig aus dem '
          + 'europäischen Modell.</p>',
      },
    ],
    faqs: [
      {
        q: 'Ist die Waldbrandgefahr auf buscosun eine amtliche Warnung?',
        a: 'Nein. Die Ansicht gibt amtliche Stufen wieder und ergänzt sie um Modell- und Satellitendaten, '
          + 'ist selbst aber kein Warnprodukt. Verbindlich sind DWD, Landesforstverwaltungen, '
          + 'Bezirkshauptmannschaften und Kantone.',
      },
      {
        q: 'Warum sehe ich für Österreich keine amtliche Stufe?',
        a: 'Weil es keine offen verfügbare gibt. GeoSphere Austria veröffentlicht keinen Waldbrandindex, '
          + 'und die vorhandenen Karten stehen ohne Lizenz und ohne Download bereit. Gezeigt wird dort nur '
          + 'der europäische Modellwert.',
      },
      {
        q: 'Lassen sich die deutsche und die Schweizer Stufe vergleichen?',
        a: 'Nicht direkt. „Geringe Gefahr" ist in Deutschland Stufe 2 und in der Schweiz Stufe 1, und die '
          + 'Modelle dahinter sind verschieden. buscosun zeigt beide Skalen getrennt, statt sie umzurechnen.',
      },
      {
        q: 'Woher kommen die Daten?',
        a: 'Der EU-Index vom Copernicus Global Wildfire Information System (ECMWF-FWI), die deutschen '
          + 'Stationswerte vom Deutschen Wetterdienst, die Schweizer Warnregionen vom BAFU, '
          + 'die Brandpunkte aus VIIRS-Satellitendaten und der Feuerwetter-Treiber aus ICON-D2. Alle Quellen '
          + 'sind offen und ohne Schlüssel nutzbar.',
      },
    ],
    relatedExplainers: ['gewitter-unwetter', 'thermik'],
    datePublished: '2026-08-14', dateModified: '2026-08-14',
  },

  // ---------------------------------------------------------------- PILOT 2
  {
    slug: 'atmosphaere',
    title: 'Atmosphäre & 3D-Querschnitt',
    h1: 'Atmosphäre: die Luftschichten über dir in 3D',
    status: 'full',
    deepLink: '/atmosphaere',
    answer:
      'Die Atmosphäre-Ansicht zeigt die vertikale Schichtung der Luft über einem Ort als interaktiven ' +
      '3D-Querschnitt: Temperatur, Wind und Feuchte mit der Höhe. So werden Föhnlagen, Temperaturinversionen ' +
      'und die Nebel- oder Schneefallgrenze sichtbar. Grundlage sind ICON-EU-Soundings und ein abgeleiteter ' +
      'Höhenschnitt — gerendert als MapLibre-WebGL-Layer.',
    bullets: [
      'Vertikalprofil von Temperatur, Wind und Feuchte mit der Höhe',
      'Linsen für Föhn/Inversion, Thermik und Querschnitt',
      'Profil-Cap 0–4000 m mit „ganze Höhe"-Umschaltung',
      'Datenbasis: ICON-EU-Sounding + digitales Geländemodell',
    ],
    sections: [
      {
        id: 'was',
        h2: 'Was der 3D-Querschnitt zeigt',
        html:
          '<p>Statt nur Bodenwerten zeigt die Atmosphäre-Ansicht, wie sich Temperatur, Wind und Feuchte ' +
          '<strong>mit der Höhe</strong> ändern. Eine wärmere Schicht über kälterer Luft — eine ' +
          '<a href="/wissen/temperaturinversion/">Temperaturinversion</a> — wird so unmittelbar erkennbar, ' +
          'ebenso die Höhe, ab der Hochnebel endet (die <a href="/wissen/nebel-hochnebel-nebelobergrenze/">' +
          'Nebelobergrenze</a>) oder Schnee in Regen übergeht.</p>',
      },
      {
        id: 'daten',
        h2: 'Datenbasis und Grenzen',
        html:
          '<p>Die Vertikaldaten stammen aus ICON-EU-Soundings; daraus wird ein 3D-Höhenschnitt abgeleitet und ' +
          'als WebGL-Layer in MapLibre gerendert (kein Three.js). Sehr dünne Inversionen unter etwa 200 m ' +
          'Mächtigkeit sind modellseitig nur grob aufgelöst und werden als unsicher gekennzeichnet.</p>',
      },
    ],
    faqs: [
      { q: 'Was zeigt die Atmosphäre-Ansicht?', a: 'Die vertikale Schichtung der Luft über einem Ort — Temperatur, Wind und Feuchte mit der Höhe — als interaktiver 3D-Querschnitt. Damit werden Föhn, Inversionen sowie Nebel- und Schneefallgrenze sichtbar.' },
      { q: 'Woher kommen die Höhendaten?', a: 'Aus ICON-EU-Soundings, aus denen ein abgeleiteter Höhenschnitt erzeugt wird. Gerendert wird als MapLibre-WebGL-Layer.' },
    ],
    relatedExplainers: ['temperaturinversion', 'foehn', 'nebel-hochnebel-nebelobergrenze'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },

  // ------------------------------------------------------------- SCAFFOLDS
  {
    slug: 'tourenplanung', title: 'Tourenplanung', h1: 'Tourenplanung mit Wetter entlang der Route',
    status: 'stub', deepLink: '/tourenplanung',
    answer:
      'Die Tourenplanung zeigt das Wetter entlang einer hochgeladenen Route (GPX, TCX, FIT, KML/KMZ) zur ' +
      'voraussichtlichen Ankunftszeit an jedem Kilometer. So lässt sich erkennen, wo unterwegs Regen, Wind ' +
      'oder Kälte drohen — inklusive E-Bike-Reichweiten-Abschätzung. Alle Werte sind höhenkorrigiert und ' +
      'stammen aus amtlichen Quellen.',
    bullets: [
      'Upload von GPX/TCX/FIT/KML/KMZ', 'Wetter je Kilometer zur Ankunftszeit',
      'Höhenkorrigierte Temperatur', 'E-Bike-Reichweite',
    ],
    faqs: [
      { q: 'Welche Dateiformate unterstützt die Tourenplanung?', a: 'GPX, TCX, FIT sowie KML/KMZ. Die Route wird kilometerweise mit der Wettervorhersage zur jeweiligen Ankunftszeit verknüpft.' },
    ],
    relatedExplainers: ['windboeen-sturm', 'gewitter-unwetter'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },
  {
    slug: 'event-tag', title: 'Bester Event-Tag', h1: 'Event-Planung: der beste Tag der Woche',
    status: 'stub', deepLink: '/eventplanung',
    answer:
      'Die Event-Planung vergleicht die nächsten sieben Tage und nennt den besten Tag für ein Vorhaben im ' +
      'Freien — mit Phasen, Plan-B-Tag, Foto-Licht und Astro-Nacht. Statt nur einer Tagesübersicht bewertet ' +
      'sie gezielt die Bedingungen für Hochzeit, Grillfest, Fototour oder Sternbeobachtung.',
    bullets: ['7-Tage-Vergleich', 'Bester Tag + Plan B', 'Foto-Licht & blaue Stunde', 'Astro-Nacht'],
    faqs: [
      { q: 'Wie findet die Event-Planung den besten Tag?', a: 'Sie bewertet die nächsten sieben Tage anhand der für das Vorhaben relevanten Wetterbedingungen und nennt den günstigsten Tag samt Alternative.' },
    ],
    relatedExplainers: ['modellvergleich-unsicherheit', 'gewitter-unwetter'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },
  {
    slug: 'nowcast', title: '6-Stunden-Nowcast', h1: 'Nowcast: Regenvorhersage für die nächsten 6 Stunden',
    status: 'stub', deepLink: '/regenradar',
    answer:
      'Der Nowcast liefert eine Niederschlagsvorhersage für die nächsten sechs Stunden im 15-Minuten-Raster: ' +
      'Radar-Extrapolation für die ersten rund zwei Stunden, danach ein ehrlicher Übergang zu ICON-D2. Bis zum ' +
      'Skill-Horizont (~2 h) nennt er minutengenaue Start- und Stoppzeiten von Schauern, ergänzt um ' +
      'Sturmzellen-Zugbahn und Blitze.',
    bullets: ['Radar (0–2 h) + ICON-D2 (2–6 h)', '6 Stunden im 15-Minuten-Raster', 'Minutengenaue Start/Stopp bis ~2 h Skill-Horizont', 'Sturmzellen-Zugbahn & Blitze'],
    faqs: [
      { q: 'Wie weit reicht der Nowcast?', a: 'Sechs Stunden im 15-Minuten-Raster. Die ersten rund zwei Stunden stammen aus Radar-Extrapolation mit minutengenauen Start- und Stoppzeiten; danach übernimmt ICON-D2. Sturmzellen-Zugbahn und Blitze werden mitgeführt.' },
    ],
    relatedExplainers: ['gewitter-unwetter', 'thermik'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },
  {
    slug: 'modellvergleich', title: 'Modellvergleich', h1: 'Modellvergleich: Vorhersagen ehrlich gegenübergestellt',
    status: 'stub', deepLink: '/vorhersage',
    answer:
      'Der Modellvergleich stellt fünf unabhängige Wettermodelle — ICON (DWD), ECMWF, GFS (NOAA), GEM (Kanada) ' +
      'und Météo-France — nebeneinander und zeigt den Unsicherheits-Spread sowie einen Trefferquoten-Rückblick. ' +
      'Statt einer Scheingenauigkeit macht er sichtbar, wie verlässlich die Vorhersage gerade ist — eng ' +
      'beieinander heißt sicher, weit auseinander heißt Vorsicht.',
    bullets: ['ICON · ECMWF · GFS · GEM · Météo-France', 'Ehrlicher Unsicherheits-Spread (Spannweite & Konsens)', 'Trefferquoten-Rückblick'],
    faqs: [
      { q: 'Welche Modelle vergleicht buscosun?', a: 'Fünf unabhängige globale bzw. regionale Modelle mit DACH-Abdeckung: ICON (DWD), ECMWF, GFS (NOAA), GEM (Kanada) und Météo-France.' },
      { q: 'Was bringt ein Modellvergleich?', a: 'Er zeigt die Streuung mehrerer Wettermodelle als Maß für die Vorhersageunsicherheit, statt eine einzelne Zahl als sicher auszugeben.' },
    ],
    relatedExplainers: ['modellvergleich-unsicherheit', 'hoehenkorrektur-lapse-rate'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },
  {
    slug: 'globus', title: '3D-Wetterglobus', h1: '3D-Wetterglobus: das Wetter der ganzen Erde',
    status: 'stub', deepLink: '/globus',
    answer:
      'Der 3D-Wetterglobus visualisiert globale Wetterfelder — Wind, Temperatur, Feuchte und Luftdruck — auf ' +
      'einer drehbaren Kugel mit animierten Wind-Partikeln. Datenbasis ist der jeweils neueste, live geladene ' +
      'NOAA-GFS-Lauf (Public Domain); vier Höhenstufen (Boden bis 250 hPa) und ein Vorlauf bis +120 Stunden ' +
      'lassen sich durchscrubben.',
    bullets: ['Drehbarer 3D-Globus mit Wind-Partikeln', 'Felder: Wind, Temperatur, Feuchte, Luftdruck', '4 Höhenstufen, Vorlauf bis +120 h', 'Datenbasis: live NOAA GFS (neuester Lauf)'],
    faqs: [
      { q: 'Welche Daten zeigt der Globus?', a: 'Den jeweils neuesten global verfügbaren NOAA-GFS-Lauf (Public Domain), live geladen — Wind, Temperatur, Feuchte und Luftdruck auf vier Höhenstufen mit Vorlauf bis +120 Stunden.' },
    ],
    relatedExplainers: ['windboeen-sturm'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },
  {
    slug: 'historie', title: 'Wetterhistorie', h1: 'Wetterhistorie: wie sich das Wetter verändert hat',
    status: 'stub', deepLink: '/wetterarchiv',
    answer:
      'Die Wetterhistorie zeigt, wie sich Temperatur, Niederschlag, Wind und weitere Größen an einem Ort über ' +
      'die Jahre verändert haben. Sie ordnet das aktuelle Wetter gegen Normal und Rekord ein und macht Trends, ' +
      'Rekorde und Kenntage sichtbar — mit Klimastreifen, Anomaliebalken, Kalender-Heatmap und über einem ' +
      'Dutzend weiterer Diagramme. Datenbasis ist die ERA5-Reanalyse (modelliert, mit Beobachtungen ' +
      'assimiliert, in der App als Reanalyse gekennzeichnet).',
    bullets: ['Langjähriger Verlauf von Temperatur, Niederschlag, Wind u. a.', 'Einordnung des aktuellen Wetters gegen Normal & Rekord', 'Trends, Rekorde & Kenntage in 12+ Diagrammtypen', 'Datenbasis: ERA5-Reanalyse (Open-Meteo Archive)'],
    faqs: [
      { q: 'Worauf basiert die Wetterhistorie?', a: 'Auf der ERA5-Reanalyse über das Open-Meteo-Archiv — modellierte Klimadaten, die mit Beobachtungen assimiliert sind. Die App kennzeichnet dies als Reanalyse (keine reine Stationsmessung).' },
    ],
    relatedExplainers: ['hoehenkorrektur-lapse-rate'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },
  {
    slug: 'arbeitsfenster', title: 'Arbeitsfenster (Go/No-Go)', h1: 'Arbeitsfenster: Go/No-Go für Böen auf Arbeitshöhe',
    status: 'stub', deepLink: '/atmosphaere/querschnitt?ansicht=gonogo',
    answer:
      'Das Arbeitsfenster prüft, ob die Böen auf einer frei wählbaren Arbeits- oder Flughöhe einen Grenzwert ' +
      'überschreiten, und liefert über die nächsten 36 Stunden einen eindeutigen Go/No-Go-Status mit ' +
      'Zeitfenstern. Ein Höhenfaktor rechnet die Bodenböen auf die Arbeitshöhe hoch — entscheidend sind die ' +
      'Böenspitzen auf Höhe, nicht der Mittelwind am Boden. Gedacht für wetterabhängige Vorhaben wie ' +
      'Drohnenflug, Kran- oder Höhenarbeit und Event-Aufbau.',
    bullets: ['Böen-Grenzwert auf wählbarer Arbeitshöhe (m AGL)', 'Go/No-Go mit Zeitfenstern über 36 h', 'Höhenfaktor Boden → Arbeitshöhe', 'Für Drohne, Kran, Höhenarbeit, Event'],
    faqs: [
      { q: 'Wie funktioniert das Arbeitsfenster?', a: 'Du gibst eine Arbeits- oder Flughöhe (m über Grund) und einen Böen-Grenzwert vor. Das Tool rechnet die prognostizierten Bodenböen über ein Grenzschichtprofil auf diese Höhe hoch und meldet über 36 Stunden, wann der Grenzwert überschritten wird (No-Go-Fenster).' },
    ],
    relatedExplainers: ['windboeen-sturm'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },
];

export const TOOLS_BY_SLUG = Object.fromEntries(TOOLS.map((t) => [t.slug, t]));
