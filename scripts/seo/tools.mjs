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
/** Etappe E4 (SEO-PLAN.md): Scaffolds zu vollen Seiten ausgebaut. */
const MODIFIED_E4 = '2026-09-05';

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
    status: 'full', deepLink: '/tourenplanung',
    answer:
      'Die Tourenplanung zeigt das Wetter entlang einer hochgeladenen Route (GPX, TCX, FIT, KML/KMZ) zur ' +
      'voraussichtlichen Ankunftszeit an jedem Streckenabschnitt. So lässt sich erkennen, wo unterwegs Regen, Wind ' +
      'oder Kälte drohen — inklusive E-Bike-Akku-Abschätzung. Alle Werte sind höhenkorrigiert und stammen aus ' +
      'amtlichen Quellen.',
    bullets: [
      'Upload von GPX, TCX, FIT, KML und KMZ — am Dateiinhalt erkannt, nicht an der Endung (bis 25 MB, 100.000 Trackpunkte)',
      'Acht Bewegungsarten mit eigenem Zeitmodell: Gehzeit nach DIN 33466/SAC, Rad-Steigungsmodell, Lauf-Pace',
      'Ankunftszeit je Abschnitt inklusive Gegen- und Rückenwind — iterativ mit dem Wetter gerechnet',
      'Höhenkorrigierte Temperatur, Regen aus Radar und Modell, amtliche Warnungen (DE) und Schneefallgrenze (AT/CH)',
      'E-Bike-Akku über eine Leistungsbilanz aus Steigung, Rollwiderstand, Luftwiderstand und Unterstützungsstufe',
      '3D-Bühne: Geländekarte und Schnitt mit der Wetterwand 300 m über Grund',
    ],
    sections: [
      {
        id: 'so-gehts',
        h2: "So geht's",
        html:
          '<ol>' +
          '<li><strong>Route hochladen.</strong> GPX, TCX, FIT, KML oder KMZ — das Format wird an den ersten Bytes ' +
          'erkannt, nicht an der Endung. Grenzen: 25 MB, 100.000 Trackpunkte, mindestens 100 m Länge, höchstens 5 km ' +
          'Lücke zwischen zwei Punkten, Gebiet DACH mit Puffer.</li>' +
          '<li><strong>Höhen prüfen lassen.</strong> Mitgelieferte Höhen werden gegen ein digitales Geländemodell ' +
          '(rund 30 m) geprüft und ersetzt, wenn sie das Gelände nicht beschreiben — falsche Höhen würden sonst über ' +
          'die <a href="/wissen/hoehenkorrektur-lapse-rate/">Höhenkorrektur</a> in Temperatur und Wind ' +
          'weiterwandern.</li>' +
          '<li><strong>Bewegungsart und Startzeit wählen.</strong> Wandern (4,5 km/h flach, 350 Hm/h aufwärts, 500 ' +
          'abwärts), Bergwandern, Jogging, Trail-Running, Rennrad, Gravel, MTB oder E-Bike Trekking — jeweils mit ' +
          'verstellbarem Tempo-Regler. Die Gehzeit folgt DIN 33466/SAC: Die größere von Horizontal- und Vertikalzeit ' +
          'zählt voll, die kleinere halb.</li>' +
          '<li><strong>Pausen ergänzen.</strong> Automatisch je Bewegungsart (Wandern etwa alle 120 Minuten 15 ' +
          'Minuten plus Mahlzeit, Rennrad alle 50 km 10 Minuten) oder als eigene Pause an einem Streckenpunkt; ' +
          'Wegpunktnamen wie „Hütte" oder „Mittag" werden erkannt.</li>' +
          '<li><strong>Ergebnis lesen.</strong> Die Ansicht öffnet mit dem Gelände: Die Strecke färbt sich nach ' +
          'Temperatur, Pfeile zeigen den Wind zur Fahrtrichtung, Blau steht für Regen, Rot für eine amtliche Warnung. ' +
          'Der Zeitplan nennt Änderungen statt Zustände — wann Regen einsetzt, wann das Windband wechselt, wann der ' +
          'Weg über die Schneefallgrenze steigt.</li>' +
          '</ol>',
      },
      {
        id: 'daten',
        h2: 'Woher die Werte kommen',
        html:
          '<p>Für das Wetter läuft dieselbe Punktvorhersage wie auf der Karte: amtliche Messstationen als Anker, ' +
          'MOSMIX, für AT und CH zusätzlich AROME, dazu das Landesradar im Radarhorizont. Abgefragt wird nicht jeder ' +
          'Meter, sondern <strong>Bündel</strong> — räumlich 6, 10 oder 14 km je nach Gelände und zusätzlich in ' +
          'Höhenbändern von 300 Metern. Ohne diese Bänderung lagen Talwerte im Test bis zu 4 °C zu kalt. Die App ' +
          'nennt den tatsächlichen Radius, statt eine Ortsauflösung vorzugeben, die sie nicht hat.</p>' +
          '<p>Der Wind wirkt auf das Tempo zurück: Auf dem Rad mit dem Faktor 1 + 0,04 · Windkomponente (begrenzt auf ' +
          '0,5 bis 1,4), zu Fuß mit 1 + 0,012 · Komponente (0,7 bis 1,2). Weil der Wind zur Ankunftszeit gilt, die ' +
          'Ankunftszeit aber vom Wind abhängt, rechnet buscosun Zeitplan → Wind → Zeitplan iterativ. Für E-Bikes ' +
          'kommt eine Leistungsbilanz dazu: Steigungs-, Roll- und Luftwiderstandsleistung, davon übernimmt der Motor ' +
          'bis zum Deckel seiner Stufe (Eco 200, Tour 350, Sport 500, Turbo 750 W) und oberhalb von 25 km/h nichts ' +
          'mehr; Standardwerte sind 500 Wh Akku, 95 kg Gesamtmasse, 100 W Fahrerleistung und ein Wirkungsgrad von ' +
          '0,85. Mehr dazu in der Methodik zum ' +
          '<a href="/methodik/tourenplanung-zeitmodell/">Zeitmodell</a> und zur ' +
          '<a href="/methodik/e-bike-reichweite/">E-Bike-Reichweite</a>.</p>',
      },
      {
        id: 'grenzen',
        h2: 'Was das Werkzeug nicht kann',
        html:
          '<p>Es ist <strong>keine Navigation und kein Sicherheitsnachweis</strong>. Die Wetterpunkte gelten für ein ' +
          'Bündel von 6 bis 14 Kilometern, nicht für den Meter — für eine einzelne Rinne oder einen Waldweg ist das ' +
          'zu grob. Ein Wegtyp-Faktor ist vorbereitet, aber wirkungslos: Schotter und Asphalt zählen im Zeitmodell ' +
          'gleich. Amtliche Warnungen erscheinen nur für Deutschland, die Schneefallgrenze nur für Österreich und die ' +
          'Schweiz; beides steht so im Ergebnis, statt Lücken zu kaschieren.</p>' +
          '<p>Bewusst nicht enthalten sind eine Sichtweite (aus Bewölkung geschätzt wäre sie eine erfundene Zahl), ' +
          'Zellgeschwindigkeiten und Treffer-Wahrscheinlichkeiten für Gewitter. Die E-Bike-Rechnung ist stationär — ' +
          'ohne Akku-Temperatur, Alterung und Rekuperation — und damit eine Planungshilfe, keine Herstellerangabe. ' +
          'Und je weiter die Startzeit in der Zukunft liegt, desto unsicherer wird alles: Der Horizont beträgt 240 ' +
          'Stunden, jenseits davon warnt die App vor reduzierter Verlässlichkeit. buscosun gibt keine amtlichen ' +
          'Warnungen heraus; maßgeblich bleiben DWD, GeoSphere Austria und MeteoSchweiz.</p>',
      },
    ],
    faqs: [
      { q: 'Welche Dateiformate unterstützt die Tourenplanung?', a: 'GPX, TCX, FIT sowie KML und KMZ — erkannt am Dateiinhalt, nicht an der Endung. Die Grenzen liegen bei 25 MB und 100.000 Trackpunkten; die Strecke muss mindestens 100 Meter lang sein und im DACH-Raum liegen.' },
      { q: 'Wie berechnet buscosun die Gehzeit?', a: 'Nach DIN 33466/SAC: Aus horizontaler Strecke und Höhenmetern entstehen zwei Teilzeiten, die größere zählt voll, die kleinere zur Hälfte. Beim Bergwandern kommt ein Aufschlag für Steilstufen dazu, beim Radfahren ein Steigungsmodell.' },
      { q: 'Berücksichtigt die Ankunftszeit den Wind?', a: 'Ja, und zwar iterativ: Der Wind zur voraussichtlichen Ankunftszeit verändert das Tempo, das wiederum die Ankunftszeit verschiebt. Auf dem Rad wirkt er deutlich stärker als zu Fuß, und beim E-Bike geht Gegenwind zusätzlich in den Akkuverbrauch ein.' },
    ],
    relatedExplainers: ['windboeen-sturm', 'gewitter-unwetter', 'hoehenkorrektur-lapse-rate', 'schneefallgrenze'],
    datePublished: PUBLISHED, dateModified: MODIFIED_E4,
  },
  {
    slug: 'event-tag', title: 'Bester Event-Tag', h1: 'Event-Planung: der beste Tag der Woche',
    status: 'full', deepLink: '/eventplanung',
    answer:
      'Die Event-Planung vergleicht die nächsten sieben Tage und nennt den besten Tag für ein Vorhaben im ' +
      'Freien — mit Phasen, Plan-B-Schwelle, Ausweichort, Foto-Licht und Astro-Nacht. Statt einer allgemeinen ' +
      'Tagesübersicht bewertet sie gezielt die Bedingungen für Hochzeit, Grillfest, Fototour oder ' +
      'Sternbeobachtung.',
    bullets: [
      'Zehn Anlassprofile plus freier Anlass — von Grillen und Hochzeit über Drohne und Fotografie bis Sterne',
      'Score 0 bis 100 aus vier Faktoren (Regen, Temperatur, Wind, Wolken) mit anlassabhängigen Gewichten',
      'Zeitfenster wählbar: ganzer Tag, Vormittag, Nachmittag, Abend oder Kernnacht — Phasen einzeln bewertet',
      'Plan B mit eigenen Schwellen und Ausweichort im Umkreis von 22 km',
      'Event-Fläche statt Punkt: Rechteck mit vier Ecken plus Mitte, dazu Gelände, Horizont und Sonnenuntergang am Grat',
      'Kalender-Export (.ics) je Phase, mit Score, Faktoren und Erinnerung einen Tag vorher',
    ],
    sections: [
      {
        id: 'so-gehts',
        h2: "So geht's",
        html:
          '<ol>' +
          '<li><strong>Anlass wählen.</strong> Jeder Anlass bringt eine eigene Wunschtemperatur und eigene Gewichte ' +
          'mit: Beim Drohnenflug zählt der Wind am stärksten, bei der Fotografie die Bewölkung, beim Baden die ' +
          'Temperatur. Für alles andere gibt es den freien Anlass, dessen Gewichte sich von Hand einstellen ' +
          'lassen.</li>' +
          '<li><strong>Ort und Fenster festlegen.</strong> Ganzer Tag (8–20 Uhr), Vormittag, Nachmittag, Abend ' +
          '(18–23 Uhr) oder Kernnacht (22–4 Uhr). Statt eines Punktes lässt sich auch ein Rechteck von 0,05 bis 60 km ' +
          'Kantenlänge aufziehen; bewertet werden dann vier um 10 % nach innen gerückte Ecken und die Mitte.</li>' +
          '<li><strong>Sieben Tage vergleichen.</strong> Für jeden Tag entsteht ein Score von 0 bis 100 als ' +
          'gewichtete Summe der vier Teilbewertungen, dazu der entscheidende Negativfaktor im Klartext. Ab 70 Punkten ' +
          'gilt ein Tag als gut, ab 45 als brauchbar.</li>' +
          '<li><strong>Verlässlichkeit prüfen.</strong> Jeder Tag trägt eine Konfidenz aus Quellen-Einigkeit mal ' +
          'Vorlaufzeit. Unterhalb von 0,55 wird der Tag als bloße <em>Tendenz</em> gekennzeichnet; Tage jenseits des ' +
          'Quellenhorizonts erscheinen als „keine Vorhersage" statt als Null.</li>' +
          '<li><strong>Plan B setzen.</strong> Schwellen für Regenmenge (Standard 3 mm im Fenster), Böen (Standard ' +
          '13 m/s) und Gesamtscore (Standard 50), dazu die Ausweichoption Zelt, Halle, Unterstand oder nur warnen. ' +
          'Auf Knopfdruck sucht die App in acht Himmelsrichtungen im Radius von 22 km einen besseren Ort und schlägt ' +
          'nur vor, was mindestens 6 Punkte gewinnt.</li>' +
          '<li><strong>In den Kalender legen.</strong> Der .ics-Export schreibt je Phase einen Termin mit Score, ' +
          'Faktoren, Risiken und Quellenhinweis sowie einer Erinnerung einen Tag vorher.</li>' +
          '</ol>',
      },
      {
        id: 'phasen',
        h2: 'Phasen, Licht und Gelände',
        html:
          '<p>Ein größeres Vorhaben hat selten nur einen Zeitpunkt. Eine Hochzeit wird deshalb in drei Phasen ' +
          'bewertet — Trauung 13–15, Empfang 15–18, Abendfeier 18–23 Uhr — und der Tag zählt die <strong>schwächste ' +
          'davon</strong>, nicht den Durchschnitt. Sonnenstand und Lichtfenster sind reine Astronomie und gelten ' +
          'deshalb für jedes Datum, auch Monate voraus: blaue Stunde, goldene Stunde, Auf- und Untergang. Die ' +
          'Wetterwahrscheinlichkeit dazu gibt es erst im Vorhersagehorizont. Die Astro-Nacht bewertet Mondphase und ' +
          '-höhe, Wolkenschichten, Taurisiko und die astronomische Dunkelheit.</p>' +
          '<p>Die Gelände-Bühne zieht das digitale Höhenmodell hinzu: Höhenlage, Neigung, tiefster und exponiertester ' +
          'Punkt der Fläche, Windpfeile zur Böen-Spitzenstunde — und die Stunde, in der die Sonne je Phase hinter dem ' +
          'Grat verschwindet. Der Horizont wird dafür im Umkreis von 30 km abgetastet; ein Grat ab 1° Höhe gilt als ' +
          'Sonnenuntergang. Wie die Bewertung im Detail rechnet, steht unter ' +
          '<a href="/methodik/event-bewertung/">Methodik: Event-Bewertung</a>.</p>',
      },
      {
        id: 'grenzen',
        h2: 'Was das Werkzeug nicht kann',
        html:
          '<p>Der Horizont endet nach <strong>sieben Tagen</strong>, weil die Stationsvorhersage ihn trägt — für ' +
          'einen Termin in drei Wochen gibt es keine Wetteraussage, nur die Lichtfenster. Für Österreich und die ' +
          'Schweiz reicht die feinauflösende Quelle nur etwa 60 Stunden; danach werden Tage ausdrücklich als „keine ' +
          'Vorhersage" ausgewiesen. Über flachem Gelände bringt die Fläche kaum Zusatzinformation — gemessen 0,16 K ' +
          'Spanne bei 8 km Kante —, und die App sagt dann „uniform", statt Nachkommastellen als Ortsauflösung ' +
          'auszugeben.</p>' +
          '<p>Der Score ist eine <strong>Bewertung, keine Genehmigung</strong>: Er kennt weder Veranstaltungsauflagen ' +
          'noch Bodenverhältnisse, Zufahrten oder Lärmschutz. Die Lichtverschmutzung für die Astro-Nacht ist eine ' +
          'Offline-Schätzung aus der Nähe zu Städten, kein Messwert; Milchstraßen-Sichtbarkeit, Meteorströme und ' +
          'Polarlichter fehlen bewusst. Benachrichtigungen funktionieren nur bei geöffneter App, weil buscosun keinen ' +
          'Server hat — der Kalender-Export ist der Ersatz dafür. Amtliche Warnungen gibt buscosun nicht heraus.</p>',
      },
    ],
    faqs: [
      { q: 'Wie findet die Event-Planung den besten Tag?', a: 'Sie bewertet jeden der nächsten sieben Tage im gewählten Zeitfenster mit einem Score von 0 bis 100, der sich aus Regen, Temperatur, Wind und Bewölkung zusammensetzt — gewichtet nach Anlass. Genannt werden der beste Tag, der ausschlaggebende Negativfaktor und eine Alternative.' },
      { q: 'Was bedeutet „nur Tendenz" bei einem Tag?', a: 'Die Konfidenz dieses Tages liegt unter 0,55. Sie entsteht aus der Einigkeit der Quellen mal der Vorlaufzeit. Der Tag wird weiterhin gezeigt, aber nicht als verlässliche Bewertung ausgegeben — hinter einer solchen Zahl steckt zu wenig Sicherheit.' },
      { q: 'Kann ich die goldene Stunde für einen Termin in drei Monaten sehen?', a: 'Ja. Sonnenstand, blaue und goldene Stunde sind reine Astronomie und lassen sich für jedes Datum berechnen. Eine Wetteraussage dazu gibt es dagegen erst innerhalb des Sieben-Tage-Horizonts der Vorhersage.' },
    ],
    relatedExplainers: ['modellvergleich-unsicherheit', 'gewitter-unwetter', 'windboeen-sturm', 'biowetter'],
    datePublished: PUBLISHED, dateModified: MODIFIED_E4,
  },
  {
    slug: 'nowcast', title: '6-Stunden-Nowcast', h1: 'Nowcast: Regenvorhersage für die nächsten 6 Stunden',
    status: 'full', deepLink: '/regenradar',
    answer:
      'Der Nowcast liefert eine Niederschlagsvorhersage für die nächsten sechs Stunden im 15-Minuten-Raster: ' +
      'Radar-Extrapolation für die ersten rund zwei Stunden, danach ein gleitender, gekennzeichneter Übergang zum ' +
      'Modell. Bis zum Skill-Horizont nennt er minutengenaue Start- und Stoppzeiten von Schauern, ergänzt um ' +
      'Sturmzellen-Zugbahn und Blitze.',
    bullets: [
      'Sechs Stunden im 15-Minuten-Raster: Radar 0–2 h, danach gleitender Übergang zum ICON-D2-Punktforecast',
      'Minutengenaue Start- und Stoppzeiten bis zum Skill-Horizont von zwei Stunden — danach ausdrücklich nicht mehr',
      'Landesradare als ein Komposit: DWD RADOLAN-RV (5-Minuten-Takt), GeoSphere INCA (15 Minuten), MeteoSchweiz rzc',
      'Intensitätsbänder von leicht bis sehr stark, dazu Niederschlagsart und Tal/Grat-Trennung im Alpenraum',
      'Zellverfolgung mit Zugrichtung, Tempo und Ankunftszeit; für Deutschland die amtliche KONRAD3D-Spur',
      'Aktualisierung alle 15 Minuten, mit sichtbarem Datenalter statt stillem „jetzt"',
    ],
    sections: [
      {
        id: 'so-gehts',
        h2: "So geht's",
        html:
          '<ol>' +
          '<li><strong>Ort wählen.</strong> Der Nowcast rechnet für einen Punkt und nimmt dafür das Radarprodukt des ' +
          'Landes, in dem der Punkt liegt.</li>' +
          '<li><strong>Die Kernaussage lesen.</strong> Oben steht, ob es gerade regnet, wann der nächste Schauer ' +
          'einsetzt und wie lange das nächste trockene Fenster dauert — mit Intensitätsband und Charakter des ' +
          'Niederschlags.</li>' +
          '<li><strong>Den Zeitstrahl schieben.</strong> Sechs Stunden im Viertelstundentakt, jede Stufe mit Quelle ' +
          'und Konfidenz. Eine Marke zeigt den <strong>Skill-Horizont bei zwei Stunden</strong>: davor gemessenes und ' +
          'extrapoliertes Radar, dahinter gleitend das Modell.</li>' +
          '<li><strong>Zellen verfolgen.</strong> Aus dem gegröberten Radarbild werden zusammenhängende Zellen ' +
          'gebildet, per Block-Matching zwischen zwei Frames verschoben und daraus Tempo, Zugrichtung und Trend ' +
          'bestimmt — daraus wird die Ankunftszeit am eigenen Standort.</li>' +
          '<li><strong>Auf die Fläche wechseln.</strong> Die <a href="/wetterkarte/niederschlag">Niederschlagskarte</a> ' +
          'zeigt dieselbe Messung als Fläche, <a href="/wetterkarte/zellbahnen">Zellbahnen</a> die amtliche Zugbahn ' +
          'mit Unsicherheitstrichter und <a href="/wetterkarte/blitze">Blitze</a> die Einschläge der letzten ' +
          'Stunde.</li>' +
          '</ol>',
      },
      {
        id: 'quellen',
        h2: 'Drei Landesradare, ein Bild',
        html:
          '<p>Deutschland liefert mit <strong>RADOLAN-RV</strong> Analyse und amtliches Nowcast im 5-Minuten-Takt bis ' +
          '+120 Minuten. Österreich liefert mit <strong>INCA</strong> Viertelstundenschritte bis +180 Minuten, aber ' +
          'keine Analyse. Die Schweiz liefert mit dem <strong>rzc</strong>-Produkt nur den aktuellen Stand. Jede ' +
          'Kartenzelle nimmt die Quelle ihres Landes — die Zeitachse endet deshalb je nach Land unterschiedlich, und ' +
          'genau das steht auch dort.</p>' +
          '<p>Radar misst Reflektivität, nicht die Phase. Ob Regen, Schneeregen, Schnee oder gefrierender Regen ' +
          'fällt, leitet buscosun aus der Geländehöhe gegen eine regionale ' +
          '<a href="/wissen/schneefallgrenze/">Schneefallgrenze</a> mit weichem Übergangsband ab. Im Alpenraum trennt ' +
          'der Nowcast ab 700 Metern Ortshöhe zusätzlich Tal und Grat und kennzeichnet den Gratwert als physikalische ' +
          'Hochrechnung. Auf der Wetterkarte selbst zeigt die Niederschlagsfläche bewusst <strong>nur die gemessene ' +
          'Radarhälfte</strong> bis zum jeweiligen Landeshorizont — die Modellhälfte wurde entfernt, weil sie die ' +
          'Verlässlichkeit der Messung verwässerte. Die Details stehen unter ' +
          '<a href="/methodik/regenradar-nowcast/">Methodik: Regenradar &amp; Nowcast</a>.</p>',
      },
      {
        id: 'grenzen',
        h2: 'Was das Werkzeug nicht kann',
        html:
          '<p>Verschieben kann kein <strong>Entstehen und kein Zerfallen</strong>: Eine Extrapolation bewegt das ' +
          'vorhandene Bild weiter, sie erfindet keine neue Zelle. Genau deshalb endet die minutengenaue Aussage am ' +
          'Skill-Horizont — jenseits von rund zwei Stunden nennt buscosun keine Start- und Stoppzeiten mehr, und eine ' +
          'kurze Regenphase markiert nicht den ganzen Zeitraum als „Regen".</p>' +
          '<p>Radar sieht den Niederschlag zudem in der Höhe: Verdunstung auf dem Weg nach unten und Radarschatten ' +
          'hinter Bergrücken verfälschen das Bodenbild. Für die Schweiz gibt es keine Nowcast-Frames, dort endet die ' +
          'Zeitachse nach einer halben Stunde. Vergangene Frames entstehen ohne Archiv-Schnittstelle aus einem ' +
          'Sitzungs-Cache — wer die App gerade erst öffnet, sieht deshalb noch keine lange Vorgeschichte. Alarme ' +
          'funktionieren nur bei geöffneter App, weil buscosun keinen Server betreibt. Und es bleibt dabei: buscosun ' +
          'gibt keine amtlichen Warnungen heraus.</p>',
      },
    ],
    faqs: [
      { q: 'Wie weit reicht der Nowcast?', a: 'Sechs Stunden im 15-Minuten-Raster. Die ersten rund zwei Stunden stammen aus Radar-Extrapolation mit minutengenauen Start- und Stoppzeiten; danach übernimmt gleitend der ICON-D2-Punktforecast. Sturmzellen-Zugbahn und Blitze werden mitgeführt.' },
      { q: 'Warum endet das Regenradar in der Fläche nach zwei Stunden?', a: 'Weil dort das gemessene amtliche Radar-Nowcast endet. In Österreich reicht INCA bis drei Stunden, in der Schweiz gibt es nur den aktuellen Stand. buscosun verlängert die Fläche bewusst nicht mit Modellregen, damit Messung und Modell unterscheidbar bleiben.' },
      { q: 'Woher weiß buscosun, ob es Schnee oder Regen ist?', a: 'Aus der Geländehöhe gegen eine regionale Schneefallgrenze mit weichem Übergangsband — eine Ableitung, keine Radarmessung. Radar misst nur Reflektivität und kennt die Niederschlagsphase nicht; Graupel und Hagel sind ausdrücklich Heuristiken.' },
    ],
    relatedExplainers: ['gewitter-unwetter', 'schneefallgrenze', 'thermik', 'modellvergleich-unsicherheit'],
    datePublished: PUBLISHED, dateModified: MODIFIED_E4,
  },
  {
    slug: 'modellvergleich', title: 'Modellvergleich', h1: 'Modellvergleich: Vorhersagen ehrlich gegenübergestellt',
    status: 'full', deepLink: '/vorhersage',
    answer:
      'Der Modellvergleich stellt fünf unabhängige Wettermodelle — ICON (DWD), ECMWF, GFS (NOAA), GEM (Kanada) ' +
      'und Météo-France — nebeneinander und zeigt den Unsicherheits-Spread sowie einen Trefferquoten-Rückblick. ' +
      'Statt einer Scheingenauigkeit macht er sichtbar, wie verlässlich die Vorhersage gerade ist — eng ' +
      'beieinander heißt sicher, weit auseinander heißt Vorsicht.',
    bullets: [
      'Fünf unabhängige Modelle über sieben Tage: ICON (DWD), ECMWF, GFS (NOAA), GEM (Kanada), Météo-France',
      'Konsenslinie plus Spread-Band für Temperatur, Niederschlag, Wind und Bewölkung',
      'Konfidenz je Tag in drei Stufen: hohe Sicherheit ab 70 %, mittlere ab 40 %, darunter niedrig',
      'Stabilität gegenüber den früheren Läufen — mit dem ausdrücklichen Hinweis, dass stabil nicht richtig heißt',
      'Trefferquoten-Rückblick über 7, 14 oder 30 Tage mit Vorlauf 1 und 3 Tage',
      'Ausreißer-Modelle werden markiert, Quellen lassen sich einzeln ein- und ausblenden',
    ],
    sections: [
      {
        id: 'so-gehts',
        h2: "So geht's",
        html:
          '<ol>' +
          '<li><strong>Ort wählen.</strong> Für ihn werden die fünf Modelle sowie die Läufe der letzten Tage ' +
          'geladen.</li>' +
          '<li><strong>Auf das Band achten, nicht auf die Linie.</strong> Die durchgezogene Linie ist der Konsens, ' +
          'das Band darum der Spread. Ein schmales Band heißt: Die Wetterlage ist gut bestimmt. Ein breites Band ' +
          'heißt: Entscheidung besser offenhalten.</li>' +
          '<li><strong>Metrik umschalten.</strong> Temperatur, Niederschlag, Wind und Wolkendichte werden getrennt ' +
          'bewertet. Als hohe Einigkeit gelten bis 1,2 °C Streuung bei der Temperatur, bis 5 km/h beim Wind und bis ' +
          '10 Prozentpunkte bei der Bewölkung; darüber steht „überwiegende Einigkeit", darüber hinaus „Vorhersagen ' +
          'uneinig".</li>' +
          '<li><strong>Konfidenz und Stabilität lesen.</strong> Der Konfidenz-Score entsteht aus der Streuung und der ' +
          'Vorlaufzeit. Die Stabilität vergleicht die letzten Läufe: Erst ab drei vorliegenden Läufen wird geurteilt, ' +
          'und nur echtes Hin und Her ab 2 °C zählt als wechselhaft — ein durchgehender Trend nicht.</li>' +
          '<li><strong>Rückblick prüfen.</strong> Der Trefferquoten-Panel zeigt für Temperatur, Niederschlag und Wind, ' +
          'wie nah die Vorhersagen mit einem und drei Tagen Vorlauf zuletzt lagen — als mittlere Abweichung ' +
          'beziehungsweise als Ja/Nein-Trefferquote.</li>' +
          '</ol>',
      },
      {
        id: 'ehrlichkeit',
        h2: 'Woran gemessen wird',
        html:
          '<p>Der Rückblick misst gegen das eingetretene Wetter — genauer gegen den <strong>Konsens der ' +
          'Modell-Analysen</strong> je Stunde. Das ist eine faire, quellenunabhängige Referenz für den Vergleich der ' +
          'Quellen untereinander, fällt aber milder aus als ein Abgleich mit Stationsmessungen. buscosun sagt das im ' +
          'Panel ausdrücklich: Die Reihung der Quellen ist belastbar, die absoluten Werte sind eine Untergrenze der ' +
          'tatsächlichen Abweichung. Solange weniger als fünf Tage Datenbasis vorliegen, wird die Reihung als noch ' +
          'unsicher gekennzeichnet.</p>' +
          '<p>Auch „Regen" ist definiert statt vorausgesetzt: Ein Tag zählt ab einer Tagessumme von 1 mm als nass, ' +
          'eine Stunde ab 0,2 mm — überall in der App gleich. Die Regenwahrscheinlichkeit auf dieser Seite ist ' +
          'entsprechend die Modell-Einigkeit, also der Anteil der Modelle mit nennenswertem Niederschlag. Eine Fläche ' +
          'dazu zeigt der Layer <a href="/wetterkarte/sicherheit">Vorhersage-Sicherheit</a>; die Kalibrierung des ' +
          'Regen-Nowcasts rechnet <a href="/validierung">Validierung</a> live nach. Hintergrund: ' +
          '<a href="/methodik/konfidenz-und-trefferquote/">Methodik: Konfidenz und Trefferquote</a> sowie ' +
          '<a href="/wissen/modellvergleich-unsicherheit/">Modellvergleich &amp; Unsicherheit</a>.</p>',
      },
      {
        id: 'grenzen',
        h2: 'Was das Werkzeug nicht kann',
        html:
          '<p>Fünf Modelle sind <strong>kein Ensemble</strong>. Sie teilen ähnliche Beobachtungsdaten und können sich ' +
          'gemeinsam irren; Einigkeit ist deshalb ein Indiz, kein Beweis. Der Vergleich sagt auch nicht, welches ' +
          'Modell „das beste" ist — die Rangfolge wechselt mit Wetterlage, Ort und Variable, und über 30 Tage ist sie ' +
          'eine Momentaufnahme, keine Bestenliste.</p>' +
          '<p>Die Modelle kommen hier als globale beziehungsweise regionale Läufe ohne die Höhenkorrektur der Karte; ' +
          'in Bergregionen sind sie deshalb gröber als die <a href="/wetterkarte/temperatur">Temperaturkarte</a>. Der ' +
          'Rückblick nutzt Analysen statt Messungen als Referenz, die Live-Validierung deckt nur den Regen-Nowcast in ' +
          'Deutschland ab. Alle Aussagen bleiben Wahrscheinlichkeiten — und buscosun gibt keine amtlichen Warnungen ' +
          'heraus; maßgeblich bleiben DWD, GeoSphere Austria und MeteoSchweiz.</p>',
      },
    ],
    faqs: [
      { q: 'Welche Modelle vergleicht buscosun?', a: 'Fünf unabhängige globale beziehungsweise regionale Modelle mit DACH-Abdeckung: ICON vom DWD, ECMWF, GFS von der NOAA, GEM aus Kanada und Météo-France. Dazu kommen die Läufe der letzten Tage als Vergleich gegen die eigene Vorgeschichte.' },
      { q: 'Was bringt ein Modellvergleich?', a: 'Er zeigt die Streuung mehrerer Wettermodelle als Maß für die Vorhersageunsicherheit, statt eine einzelne Zahl als sicher auszugeben. Eng beieinander liegende Modelle sprechen für eine gut bestimmte Wetterlage, weit auseinanderlaufende für Vorsicht.' },
      { q: 'Bedeutet eine stabile Vorhersage, dass sie eintrifft?', a: 'Nein. Stabilität heißt nur, dass sich die Vorhersage von Lauf zu Lauf kaum verändert hat; alle Läufe können denselben Fehler wiederholen. Deshalb steht neben der Stabilität immer auch der Trefferquoten-Rückblick der letzten Wochen.' },
    ],
    relatedExplainers: ['modellvergleich-unsicherheit', 'hoehenkorrektur-lapse-rate', 'gewitter-unwetter'],
    datePublished: PUBLISHED, dateModified: MODIFIED_E4,
  },
  {
    slug: 'globus', title: '3D-Wetterglobus', h1: '3D-Wetterglobus: das Wetter der ganzen Erde',
    status: 'full', deepLink: '/globus',
    answer:
      'Der 3D-Wetterglobus visualisiert globale Wetterfelder — Wind, Temperatur, Feuchte und Luftdruck — auf ' +
      'einer drehbaren Kugel mit animierten Wind-Partikeln. Datenbasis ist der jeweils neueste, live geladene ' +
      'NOAA-GFS-Lauf im 1°-Gitter (Public Domain); vier Höhenstufen (Boden bis 250 hPa) und ein Vorlauf bis ' +
      '+120 Stunden lassen sich durchscrubben.',
    bullets: [
      'Drehbarer 3D-Globus mit animierten Wind-Partikeln, umschaltbar auf eine flache Projektion',
      'Vier Felder: Wind, Temperatur, relative Feuchte und Luftdruck auf Meereshöhe',
      'Vier Höhenstufen: bodennah (10 m Wind, 2 m Temperatur), 850, 500 und 250 hPa',
      'Vorlauf bis +120 Stunden in Drei-Stunden-Schritten, als Animation abspielbar',
      'Datenbasis: der jeweils neueste NOAA-GFS-Lauf, 1°-Gitter, Public Domain, direkt im Browser dekodiert',
      'Klick auf die Kugel setzt einen Punkt und liest Wind, Temperatur und Feuchte dort ab',
    ],
    sections: [
      {
        id: 'so-gehts',
        h2: "So geht's",
        html:
          '<ol>' +
          '<li><strong>Drehen und zoomen.</strong> Der Globus lässt sich frei bewegen; als Umriss dient eine ' +
          'Küstenlinie aus Natural Earth. Wer lieber eine Weltkarte sieht, schaltet auf die flache Projektion um.</li>' +
          '<li><strong>Feld wählen.</strong> Temperatur, Wind, Feuchte oder Druck — jeweils mit eigener Legende und ' +
          'Einheit. „Keins" blendet das Overlay aus und lässt nur die Partikel stehen.</li>' +
          '<li><strong>Höhe wählen.</strong> Bodennah zeigt den 10-Meter-Wind und die 2-Meter-Temperatur; 850 hPa ' +
          'liegen rund 1,5 km hoch, 500 hPa rund 5,5 km, 250 hPa im Bereich des Jetstreams.</li>' +
          '<li><strong>Zeit scrubben.</strong> Der Vorlauf reicht in Drei-Stunden-Schritten bis +120 Stunden und ' +
          'läuft auf Knopfdruck als Schleife durch — so werden Zugbahnen von Tiefdruckgebieten und das Mäandern des ' +
          'Jetstreams sichtbar.</li>' +
          '<li><strong>Punkt setzen.</strong> Ein Klick auf die Kugel pinnt einen Ort und zeigt Windgeschwindigkeit ' +
          'in km/h und m/s samt Richtung sowie die Werte des gewählten Feldes.</li>' +
          '</ol>',
      },
      {
        id: 'daten',
        h2: 'Datenbasis und Technik',
        html:
          '<p>Der Globus lädt den jeweils neuesten verfügbaren Lauf des <strong>Global Forecast System</strong> der ' +
          'NOAA direkt aus dem offenen AWS-Bucket — ohne Zwischenserver, ohne Schlüssel. Aus den mehreren hundert ' +
          'Megabyte großen GRIB2-Dateien holt buscosun per HTTP-Range nur die benötigten Felder, in der ' +
          'Größenordnung von rund 75 KB je Feld, und dekodiert sie mit dem eigenen GRIB2-Decoder in einem ' +
          'Worker-Thread. GFS rechnet viermal täglich; welcher Lauf gerade aktuell ist, ermittelt die App selbst und ' +
          'merkt sich das Ergebnis für zehn Minuten.</p>' +
          '<p>Die Wind-Partikel sind derselbe WebGL-Layer wie auf der Wetterkarte, nur mit anderer Parametrierung: ' +
          'rund 18.000 Partikel als Grundwert, in der HD-Stufe gut das Doppelte. Ihre Geschwindigkeit ist strikt ' +
          'linear an den Modellwert gekoppelt, damit die Optik nicht mehr behauptet, als die Daten hergeben. GFS ist ' +
          'Public Domain und damit frei nutzbar; die Küstenlinie stammt von Natural Earth.</p>',
      },
      {
        id: 'grenzen',
        h2: 'Was das Werkzeug nicht kann',
        html:
          '<p>Ein <strong>1°-Gitter ist grob</strong> — rund 111 Kilometer am Äquator. Der Globus zeigt die große ' +
          'Zirkulation: Tiefdruckgebiete, Fronten, den Jetstream, Passate, tropische Wirbelstürme in ihrer Zugbahn. ' +
          'Er zeigt <em>nicht</em> das Wetter über einem Tal, einer Stadt oder einem Gipfel. Für DACH ist die ' +
          '<a href="/wetterkarte">Wetterkarte</a> mit 2,2 Kilometern Gitterweite und Höhenkorrektur die richtige ' +
          'Ansicht, für den Ortsbezug die <a href="/vorhersage">Vorhersage</a>.</p>' +
          '<p>Es gibt hier bewusst weder Radar noch Niederschlagsflächen, keine Warnungen und keine Stationswerte. ' +
          'Beim Hochsampeln des groben Gitters können an Rändern Kachelstrukturen sichtbar werden. Der Globus ' +
          'braucht WebGL; ohne Grafikbeschleunigung erscheint ein ehrlicher Hinweis statt einer leeren Kugel. Und ' +
          'auch hier gilt: buscosun gibt keine amtlichen Warnungen heraus.</p>',
      },
    ],
    faqs: [
      { q: 'Welche Daten zeigt der Globus?', a: 'Den jeweils neuesten global verfügbaren NOAA-GFS-Lauf im 1°-Gitter (Public Domain), live geladen und im Browser dekodiert — Wind, Temperatur, relative Feuchte und Luftdruck auf vier Höhenstufen mit Vorlauf bis +120 Stunden.' },
      { q: 'Wie genau ist der Wetterglobus?', a: 'Er löst rund einen Breitengrad auf, also etwa 111 Kilometer am Äquator. Das reicht für die große Zirkulation — Tiefdruckgebiete, Fronten, Jetstream —, aber nicht für lokales Wetter. Dafür gibt es die Wetterkarte mit 2,2 Kilometern Gitterweite.' },
      { q: 'Was bedeuten die Höhenstufen 850, 500 und 250 hPa?', a: 'Es sind Druckflächen statt fester Höhen: 850 hPa liegen grob 1,5 Kilometer hoch, 500 hPa etwa 5,5 Kilometer und 250 hPa im Bereich des Jetstreams. Bodennah zeigt der Globus den 10-Meter-Wind und die 2-Meter-Temperatur.' },
    ],
    relatedExplainers: ['windboeen-sturm', 'modellvergleich-unsicherheit', 'gewitter-unwetter'],
    datePublished: PUBLISHED, dateModified: MODIFIED_E4,
  },
  {
    slug: 'historie', title: 'Wetterhistorie', h1: 'Wetterhistorie: wie sich das Wetter verändert hat',
    status: 'full', deepLink: '/wetterarchiv',
    answer:
      'Die Wetterhistorie zeigt, wie sich Temperatur, Niederschlag, Wind und weitere Größen an einem Ort über ' +
      'die Jahre verändert haben. Sie ordnet einen Tag gegen Normal und Rekord ein und macht Trends und Kenntage ' +
      'sichtbar — mit Klimastreifen, Anomaliebalken, Kalender-Heatmap und einem Dutzend weiterer Diagramme, aus ' +
      'Stationsmessungen der nächstgelegenen Station.',
    bullets: [
      'Zwei Modi: „Rückblick" schlägt einen konkreten Tag nach, „Veränderung" zeigt Jahrzehnte',
      'Zwölf Diagrammtypen — Klimastreifen, Anomalie, Tagesband, Kalender, Overlay, Bänder, Box, Windrose, Kenntage, Rekorde, Datum, Verlauf',
      'Sieben Größen: Mittel-, Höchst- und Tiefsttemperatur, Niederschlag, Sonnenstunden, Wind und Luftfeuchte',
      'Kenntage mit klaren Schwellen: Hitzetage ab 30 °C, Sommertage ab 25 °C, Tropennächte ab 20 °C, Frost- und Eistage unter 0 °C',
      'Normalperiode wählbar: 1961–1990, 1971–2000 oder 1991–2020, dazu ein linearer Trend je Jahrzehnt',
      'Export als Bild, CSV, Ansichts-Link, iframe-Einbettung oder Druckbericht — Ort, Zeitraum und Quelle inklusive',
    ],
    sections: [
      {
        id: 'so-gehts',
        h2: "So geht's",
        html:
          '<ol>' +
          '<li><strong>Ort und Modus wählen.</strong> „Wie war das Wetter?" schlägt einen einzelnen Tag, Monat oder ' +
          'ein Jahr nach — mit Stundenverlauf, Minimum, Maximum und Niederschlag. „Wie hat sich das Wetter ' +
          'verändert?" zeigt Klimastreifen, Abweichungen, Kenntage und Trends.</li>' +
          '<li><strong>Zeitraum setzen.</strong> Letztes Jahr, zehn Jahre, dreißig Jahre, alles oder ein eigener ' +
          'Bereich; zusätzlich lassen sich einzelne Monate herausfiltern, um etwa nur die Sommer zu ' +
          'vergleichen.</li>' +
          '<li><strong>Diagramm wählen.</strong> Klimastreifen für den Gesamteindruck, Anomaliebalken für die ' +
          'Abweichung vom Normal, Kalender-Heatmap für einzelne Tage, Box-Plots für die Streuung, Windrose für die ' +
          'Richtungsverteilung.</li>' +
          '<li><strong>Normalperiode festlegen.</strong> Die Abweichung wird gegen 1961–1990, 1971–2000 oder ' +
          '1991–2020 gerechnet. Das ist keine Nebensache: Gegen die jüngste Periode fällt jede Erwärmung kleiner ' +
          'aus, weil die Referenz selbst schon wärmer ist.</li>' +
          '<li><strong>Kenntage und Indizes ansehen.</strong> Neben den fünf Kenntagen berechnet die App Heiz- und ' +
          'Wachstumsgradtage (Basis 15 beziehungsweise 10 °C), Hitzewellen als mindestens drei Tage in Folge ab ' +
          '28 °C und Trockenperioden als mindestens zehn Tage unter einem Millimeter.</li>' +
          '<li><strong>Teilen oder exportieren.</strong> PNG mit Titel und Quelle, CSV mit Semikolon und deutschem ' +
          'Dezimalkomma, ein Link, der genau diese Ansicht wiederherstellt, ein iframe-Schnipsel oder ein ' +
          'Druckbericht.</li>' +
          '</ol>',
      },
      {
        id: 'daten',
        h2: 'Woher die Daten kommen',
        html:
          '<p>Standardquelle sind <strong>Stationsmessungen</strong> der nächstgelegenen Station über Meteostat — für ' +
          'Deutschland überwiegend DWD-Stationen, mit Tageswerten zurück bis 1931. Die App nennt Name, Entfernung und ' +
          'Höhe der Station, damit klar ist, worauf sich die Reihe bezieht, und kennzeichnet die Quelle als ' +
          '<em>Messung</em>. Lücken werden nicht stillschweigend interpoliert; wo der Anbieter Tage mit Modellwerten ' +
          'gefüllt hat, wird deren Anteil ausgewiesen statt als Messung mitgezählt.</p>' +
          '<p>Als Alternative und für Stundenwerte steht die <strong>ERA5-Reanalyse</strong> über das ' +
          'Open-Meteo-Archiv bereit, zurück bis 1940. Sie ist ausdrücklich als <em>Reanalyse</em> gekennzeichnet: ' +
          'modellierte Daten, die mit Beobachtungen assimiliert wurden — flächendeckend, aber in Berglagen mit ' +
          'lokalen Abweichungen. Der Trend entsteht aus einer linearen Regression über die Jahres-Aggregate und wird ' +
          'je Jahrzehnt angegeben; Rekorde beziehen sich auf den geladenen Zeitraum, nicht auf eine amtliche ' +
          'Klimareihe.</p>',
      },
      {
        id: 'grenzen',
        h2: 'Was das Werkzeug nicht kann',
        html:
          '<p>Es ist <strong>kein Klimagutachten und keine Vorhersage</strong>. Eine Station ist ein Punkt: Liegt sie ' +
          '20 Kilometer entfernt oder 400 Meter tiefer, beschreibt sie das eigene Tal nur bedingt — die Entfernung ' +
          'steht deshalb dabei. Die Klimastreifen färben gegen den Mittelwert der <em>angezeigten</em> Jahre, nicht ' +
          'gegen eine feste Klimanormale; wer den Zeitraum ändert, ändert auch die Farbskala.</p>' +
          '<p>Einzelne Jahre sind Wetter, kein Klima — ein warmer Sommer belegt nichts, ein Trend über Jahrzehnte ' +
          'schon eher. Windrichtungen fehlen in der Standardquelle, weshalb die Windrose dort leer bleibt. Und aus ' +
          'einer Zeitreihe lässt sich keine Zukunft ablesen: Für die kommenden Tage ist die ' +
          '<a href="/vorhersage">Vorhersage</a> zuständig, für die Einordnung eines laufenden Tages die ' +
          '<a href="/wetterkarte">Wetterkarte</a>.</p>',
      },
    ],
    faqs: [
      { q: 'Worauf basiert die Wetterhistorie?', a: 'Standardmäßig auf Tages-Stationsmessungen der nächstgelegenen Station (für Deutschland überwiegend DWD), zurück bis 1931. Alternativ und für Stundenwerte steht die ERA5-Reanalyse über das Open-Meteo-Archiv bereit; sie ist in der App ausdrücklich als Reanalyse gekennzeichnet.' },
      { q: 'Welche Kenntage rechnet buscosun?', a: 'Fünf: Hitzetage mit Höchsttemperatur ab 30 °C, Sommertage ab 25 °C, Tropennächte mit Tiefsttemperatur ab 20 °C, Frosttage unter 0 °C Tiefstwert und Eistage unter 0 °C Höchstwert. Die Schwelle lässt sich für eigene Fragestellungen verändern.' },
      { q: 'Warum ändert sich die Farbe der Klimastreifen mit dem Zeitraum?', a: 'Weil die Streifen gegen den Mittelwert der gerade angezeigten Jahre eingefärbt werden, nicht gegen eine feste Klimanormale. Für Abweichungen gegen eine amtliche Referenzperiode gibt es die Anomalie-Ansicht mit wählbarer Normalperiode.' },
    ],
    relatedExplainers: ['hoehenkorrektur-lapse-rate', 'modellvergleich-unsicherheit', 'schneefallgrenze'],
    datePublished: PUBLISHED, dateModified: MODIFIED_E4,
  },
  {
    slug: 'arbeitsfenster', title: 'Arbeitsfenster (Go/No-Go)', h1: 'Arbeitsfenster: Go/No-Go für Böen auf Arbeitshöhe',
    // SEO/GEO 2026 (E7): eigener kanonischer Pfad statt der alten Query-Form.
    status: 'full', deepLink: '/atmosphaere/arbeitsfenster',
    answer:
      'Das Arbeitsfenster prüft, ob die Böen auf einer frei wählbaren Arbeits- oder Flughöhe einen Grenzwert ' +
      'überschreiten, und liefert über die nächsten 36 Stunden einen eindeutigen Go/No-Go-Status mit ' +
      'Zeitfenstern. Ein Höhenfaktor rechnet die Bodenböen auf die Arbeitshöhe hoch — entscheidend sind die ' +
      'Böenspitzen auf Höhe, nicht der Mittelwind am Boden. Gedacht für wetterabhängige Vorhaben wie ' +
      'Drohnenflug, Kran- oder Höhenarbeit und Event-Aufbau.',
    bullets: [
      'Böen-Grenzwert auf frei wählbarer Arbeitshöhe über Grund (Voreinstellung 120 m, 40 km/h)',
      'GO/NO-GO-Zeitleiste im 15-Minuten-Raster über 36 bis 48 Stunden, mit benannten No-Go-Fenstern',
      'Höhenfaktor: um wie viel stärker es oben weht als auf zehn Metern',
      'Eigene Zusatz-Grenzwerte je Gewerk, gespeichert im Browser statt auf einem Server',
      'Datenbasis ICON-D2 (DWD) am Boden, ICON-EU-Profil für die Höhe',
      'Für Drohnenflug, Kran- und Höhenarbeit, Gerüstbau und Event-Aufbau',
    ],
    sections: [
      {
        id: 'so-gehts',
        h2: "So geht's",
        html:
          '<ol>' +
          '<li><strong>Ort und Schnittlinie setzen.</strong> Das Arbeitsfenster sitzt im Vertikalschnitt der ' +
          'Atmosphäre: Eine auf die Karte gezogene Linie legt fest, welches Gelände betrachtet wird. Gerechnet ' +
          'wird am exponiertesten Punkt der Linie, also am höchsten Geländeanker — nicht am geschütztesten.</li>' +
          '<li><strong>Arbeitshöhe eingeben.</strong> Die Höhe über Grund in Metern: die Flughöhe der Drohne, ' +
          'die Hakenhöhe des Krans, die Arbeitsebene am Gerüst. Voreingestellt sind 120 Meter.</li>' +
          '<li><strong>Grenzwert setzen.</strong> Die Böengeschwindigkeit in Kilometern pro Stunde, ab der nicht ' +
          'mehr gearbeitet wird. Voreingestellt sind 40 km/h; der Wert kommt aus der Betriebsanleitung des ' +
          'Geräts oder der eigenen Betriebsanweisung, nicht aus dieser App.</li>' +
          '<li><strong>Zeitleiste ablesen.</strong> Über 36 bis 48 Stunden entsteht im 15-Minuten-Raster eine ' +
          'GO/NO-GO-Bahn: der Status jetzt, die höchste Böe im Zeitraum und jedes Fenster, in dem der Grenzwert ' +
          'gerissen wird — mit Anfang, Ende und Spitzenwert.</li>' +
          '<li><strong>Höhenfaktor prüfen.</strong> Daneben steht, um wie viel stärker es auf Arbeitshöhe weht ' +
          'als am Boden. Bei 120 Metern ist das ein spürbarer Aufschlag gegenüber dem 10-Meter-Wert, den ' +
          'gewöhnliche Wetter-Apps zeigen.</li>' +
          '<li><strong>Eigene Grenzwerte anlegen.</strong> Mehrere Gewerke, mehrere Schwellen: zusätzliche ' +
          'Grenzwerte bleiben im Browser gespeichert, nicht auf einem Server.</li>' +
          '</ol>',
      },
      {
        id: 'rechenweg',
        h2: 'Wie die Böe auf Arbeitshöhe entsteht',
        html:
          '<p>Wettermodelle liefern die Böe auf zehn Metern über Grund. Zwischen dieser Höhe und einer ' +
          'Arbeitsebene in 40, 80 oder 150 Metern liegt die bodennahe Reibungsschicht, in der der Wind mit der ' +
          'Höhe zunimmt. buscosun rechnet den Bodenwert über ein <strong>Potenzprofil der Grenzschicht</strong> ' +
          'mit dem Exponenten 0,2 hoch; der Zuwachs läuft bis rund 1 500 Meter über Grund und sättigt darüber. ' +
          'Datenbasis ist die Böenvorhersage von ICON-D2 (DWD, 2,2 km Gitterweite) am Boden, ergänzt um das ' +
          'ICON-EU-Profil für die Höhe.</p>' +
          '<p>Bewertet wird nicht der Mittelwind, sondern die <strong>Böenspitze</strong> — sie kippt Lasten, ' +
          'nicht der Stundenmittelwert. Zu jedem 15-Minuten-Schritt wird geprüft, ob die hochgerechnete Böe über ' +
          'dem Grenzwert liegt; zusammenhängende Überschreitungen werden zu einem NO-GO-Fenster gebündelt. Der ' +
          'Höhenfaktor ist schlicht das Verhältnis der Böe auf Arbeitshöhe zur Böe auf zehn Metern zum ' +
          'Startzeitpunkt.</p>',
      },
      {
        id: 'grenzen',
        h2: 'Was das Werkzeug nicht kann',
        html:
          '<ul>' +
          '<li><strong>Es misst nicht.</strong> Der Wert auf Arbeitshöhe ist eine Hochrechnung aus einem ' +
          'Modellwert am Boden über ein idealisiertes Profil — kein Anemometer am Ausleger. Wer ein Messgerät ' +
          'am Gerät hat, dem gilt dessen Wert.</li>' +
          '<li><strong>Es kennt die Baustelle nicht.</strong> Gebäude, Hallenschluchten, Kanten und Bewuchs ' +
          'erzeugen Turbulenz und Düsen, die ein Gitter von 2,2 Kilometern nicht auflöst. Strukturen unter ' +
          '200 Metern Ausdehnung bleiben im Modellprofil unsichtbar.</li>' +
          '<li><strong>Es ist kein Arbeitsschutz-Nachweis.</strong> Maßgeblich sind Betriebsanleitung, ' +
          'Herstellergrenzwerte, Gefährdungsbeurteilung und die Regeln der Berufsgenossenschaft. Die Zeitleiste ' +
          'ist eine Planungshilfe für die Frage, wann es sich überhaupt lohnt anzurücken.</li>' +
          '<li><strong>Es warnt nicht amtlich.</strong> Sturm- und Gewitterwarnungen geben ausschließlich die ' +
          'Wetterdienste heraus — DWD, GeoSphere Austria, MeteoSchweiz. buscosun zeigt sie im Original, ' +
          'formuliert sie aber nicht um und erzeugt keine eigenen.</li>' +
          '<li><strong>Es kennt keinen Luftraum.</strong> Für den Drohnenflug sagt es nichts über Sperrgebiete, ' +
          'Flugverbotszonen oder Genehmigungen; dafür gibt es die Dienste der Luftfahrtbehörden.</li>' +
          '<li><strong>Es sieht keine Vereisung und keine Sicht in Metern.</strong> Nebel, Vereisungsgefahr am ' +
          'Rotor und Sichtweiten sind nicht Teil der Auswertung.</li>' +
          '</ul>',
      },
    ],
    faqs: [
      { q: 'Wie funktioniert das Arbeitsfenster?', a: 'Du gibst eine Arbeits- oder Flughöhe über Grund und einen Böen-Grenzwert vor. buscosun rechnet die prognostizierten Bodenböen über ein Grenzschichtprofil auf diese Höhe hoch und meldet im 15-Minuten-Raster über 36 bis 48 Stunden, wann der Grenzwert überschritten wird — als GO/NO-GO-Bahn mit benannten Fenstern.' },
      { q: 'Warum reicht die normale Böenvorhersage nicht?', a: 'Weil sie für zehn Meter über Grund gilt. In 120 Metern Arbeitshöhe weht es deutlich stärker; genau diese Differenz macht der Höhenfaktor sichtbar. Wer den Bodenwert gegen den eigenen Grenzwert hält, unterschätzt die Belastung oben systematisch.' },
      { q: 'Ersetzt das Arbeitsfenster die Freigabe für Kran- oder Drohnenarbeit?', a: 'Nein. Es ist eine Planungshilfe und kein zertifiziertes Arbeitsschutz-Werkzeug. Verbindlich bleiben die Betriebsanleitung des Geräts, die Gefährdungsbeurteilung, die Regeln der Berufsgenossenschaft beziehungsweise der Luftfahrtbehörde und die amtlichen Warnungen der Wetterdienste.' },
    ],
    relatedExplainers: ['windgrenzwerte-arbeit-drohne', 'windboeen-sturm'],
    datePublished: PUBLISHED, dateModified: MODIFIED_E4,
  },
];

export const TOOLS_BY_SLUG = Object.fromEntries(TOOLS.map((t) => [t.slug, t]));
