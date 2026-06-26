/**
 * Tool-/Funktions-Landingpages (build-only, reines Node-ESM).
 *
 * Indexierbare Seiten unter /funktionen/<slug>/ je echtem buscosun-Tool. Ziel:
 * teilbare, screenshot-fähige Einstiegsseiten (Community-Seeding, Digital PR) +
 * klassisches SEO. Wertversprechen + Datenbasis im rohen HTML; Live-Canvas ist
 * nur Enhancement. Deep-Link öffnet das Tool in der App.
 *
 * status: 'full' = indexierter Pilot. 'stub' = Scaffold (noindex).
 * deepLink: Hash-Permalink in die SPA (präfix-only Hashes sind sicher: #atm=,
 *           #h=, #g=). Tools ohne sauberen Hash verlinken auf '/'.
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
    deepLink: '/',
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

  // ---------------------------------------------------------------- PILOT 2
  {
    slug: 'atmosphaere',
    title: 'Atmosphäre & 3D-Querschnitt',
    h1: 'Atmosphäre: die Luftschichten über dir in 3D',
    status: 'full',
    deepLink: '/#atm=',
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
    status: 'stub', deepLink: '/',
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
    status: 'stub', deepLink: '/',
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
    slug: 'nowcast', title: '6-Stunden-Nowcast', h1: 'Nowcast: minutengenaue Regenvorhersage',
    status: 'stub', deepLink: '/',
    answer:
      'Der Nowcast liefert eine minutengenaue Niederschlagsvorhersage für die nächsten sechs Stunden aus ' +
      'Radar-Extrapolation und ICON-D2, ergänzt um Blitz- und Sturm-Alerts. Damit lässt sich abschätzen, ' +
      'wann ein Schauer beginnt oder endet — präziser als eine Stundenvorhersage.',
    bullets: ['Radar-Extrapolation + ICON-D2', 'Minutengenau, 6 Stunden', 'Blitz- & Sturm-Alerts'],
    faqs: [
      { q: 'Wie weit reicht der Nowcast?', a: 'Sechs Stunden, minutengenau. Er kombiniert Radar-Extrapolation mit ICON-D2 und weist auf Blitz- und Sturmgefahr hin.' },
    ],
    relatedExplainers: ['gewitter-unwetter', 'thermik'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },
  {
    slug: 'modellvergleich', title: 'Modellvergleich', h1: 'Modellvergleich: Vorhersagen ehrlich gegenübergestellt',
    status: 'stub', deepLink: '/',
    answer:
      'Der Modellvergleich stellt ICON-D2, MOSMIX und ICON-EU nebeneinander und zeigt den Unsicherheits-Spread ' +
      'sowie einen Trefferquoten-Rückblick. Statt einer Scheingenauigkeit macht er sichtbar, wie verlässlich ' +
      'die Vorhersage gerade ist — eng beieinander heißt sicher, weit auseinander heißt Vorsicht.',
    bullets: ['ICON-D2 · MOSMIX · ICON-EU', 'Ehrlicher Unsicherheits-Spread', 'Trefferquoten-Rückblick'],
    faqs: [
      { q: 'Was bringt ein Modellvergleich?', a: 'Er zeigt die Streuung mehrerer Wettermodelle als Maß für die Vorhersageunsicherheit, statt eine einzelne Zahl als sicher auszugeben.' },
    ],
    relatedExplainers: ['modellvergleich-unsicherheit', 'hoehenkorrektur-lapse-rate'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },
  {
    slug: 'globus', title: '3D-Wetterglobus', h1: '3D-Wetterglobus: das Wetter der ganzen Erde',
    status: 'stub', deepLink: '/#g=',
    answer:
      'Der 3D-Wetterglobus visualisiert globale Wetterfelder auf einer drehbaren Kugel. Er dient der ' +
      'Veranschaulichung großräumiger Strömungen und nutzt gebündelte Beispieldaten sowie NOAA-GFS — keine ' +
      'globale Live-Vorhersage, sondern ein anschaulicher Überblick über die Dynamik der Atmosphäre.',
    bullets: ['Drehbarer 3D-Globus', 'Globale Strömungsmuster', 'Datenbasis: NOAA GFS + Beispieldaten'],
    faqs: [
      { q: 'Zeigt der Globus eine Live-Vorhersage?', a: 'Nein. Der Globus nutzt gebündelte Beispieldaten und NOAA-GFS zur Veranschaulichung großräumiger Muster, nicht als globale Live-Prognose.' },
    ],
    relatedExplainers: ['windboeen-sturm'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },
  {
    slug: 'historie', title: 'Wetterhistorie', h1: 'Wetterhistorie: wie sich das Wetter verändert hat',
    status: 'stub', deepLink: '/#h=',
    answer:
      'Die Wetterhistorie zeigt, wie sich Temperatur und weitere Größen an einem Ort über die Jahre verändert ' +
      'haben. Sie ordnet das aktuelle Wetter in den langjährigen Verlauf ein und macht Trends und Rekorde ' +
      'sichtbar — auf Basis amtlicher Klimadaten.',
    bullets: ['Langjähriger Temperaturverlauf', 'Einordnung des aktuellen Wetters', 'Trends & Rekorde'],
    faqs: [
      { q: 'Worauf basiert die Wetterhistorie?', a: 'Auf amtlichen Klima- und Messdaten, die den langjährigen Verlauf an einem Ort abbilden.' },
    ],
    relatedExplainers: ['hoehenkorrektur-lapse-rate'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },
  {
    slug: 'arbeitsfenster', title: 'Arbeitsfenster (Go/No-Go)', h1: 'Arbeitsfenster: Go/No-Go für Wind, Regen und Frost',
    status: 'stub', deepLink: '/',
    answer:
      'Das Arbeitsfenster prüft Wind-, Böen-, Regen- und Frostschwellen für Vorhaben wie Drohnenflug, ' +
      'Kranarbeit, Höhenarbeit, Anstrich oder Event-Aufbau und zeigt sie als 48-Stunden-Ampel. Entscheidend ' +
      'sind dabei die Böenspitzen, nicht der Mittelwind.',
    bullets: ['Wind-/Böen-/Regen-/Frost-Schwellen', '48-Stunden-Ampel', 'Für Drohne, Kran, Höhenarbeit, Anstrich'],
    faqs: [
      { q: 'Für wen ist das Arbeitsfenster gedacht?', a: 'Für wetterabhängige Arbeiten wie Drohnenflug, Kran- und Höhenarbeit, Anstrich oder Event-Aufbau. Es bewertet Böen, Regen und Frost als 48-Stunden-Ampel.' },
    ],
    relatedExplainers: ['windboeen-sturm'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },
];

export const TOOLS_BY_SLUG = Object.fromEntries(TOOLS.map((t) => [t.slug, t]));
