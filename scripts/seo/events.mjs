/**
 * Event-/Wetterlage-Artikel (build-only, reines Node-ESM).
 *
 * Zeitbezogene Beiträge unter /wetterlage/<slug>/ für Google Discover / News.
 * Vorlage + Beispielartikel. Echte Ereignisartikel ergänzt die Redaktion bei
 * markanten Wetterlagen (siehe checklist.md „Event-Content-Checkliste").
 *
 * REGELN: akkurat, nie amtliche Warnungen implizieren, gesamter Text im rohen
 * HTML, Attribution DWD. Hero-Bild >= 1200px Breite.
 *
 * Felder: slug, title (Headline, nicht-clickbait), ogTitle (separat optimiert),
 * h1, dek (Lead 40–60 W), datePublished, dateModified, hero {url,w,h,alt},
 * sections [{id,h2,html}], relatedPlaces (slugs), relatedExplainers (slugs),
 * section (Ressort), status.
 */

export const EVENTS = [
  {
    slug: 'omega-lage-mitteleuropa',
    title: 'Omega-Lage: Warum das Wetter tagelang stehen bleibt',
    ogTitle: 'Omega-Lage erklärt: stabiles Wetter über Mitteleuropa',
    h1: 'Omega-Lage: Warum das Wetter tagelang stehen bleibt',
    section: 'Wetterlage',
    status: 'full',
    datePublished: '2026-06-26',
    dateModified: '2026-06-26',
    hero: { url: '/og/omega-lage-mitteleuropa.png', w: 1200, h: 630, alt: 'buscosun — Wetterlage über Mitteleuropa' },
    dek:
      'Eine Omega-Lage ist ein blockierendes Hochdruckgebiet, dessen Strömungsmuster im Höhenwind dem ' +
      'griechischen Buchstaben Ω gleicht. Sie sorgt über Mitteleuropa für tagelang beständiges, oft sonnig-warmes ' +
      'Wetter, während es an ihren Flanken wiederholt regnet. Solche Lagen sind besonders stabil und ändern sich nur langsam.',
    sections: [
      {
        id: 'was',
        h2: 'Was eine Omega-Lage ist',
        html:
          '<p>Bei einer <strong>Omega-Lage</strong> liegt ein kräftiges Hochdruckgebiet zwischen zwei ' +
          'Tiefdruckgebieten. Im Höhenströmungsbild bildet sich dadurch ein Muster, das dem griechischen ' +
          'Buchstaben <strong>Ω (Omega)</strong> ähnelt. Das Hoch in der Mitte „blockiert" die übliche ' +
          'Westströmung, sodass Tiefs nicht durchziehen, sondern an den Rändern festhängen.</p>',
      },
      {
        id: 'wetter',
        h2: 'Welches Wetter sie bringt',
        html:
          '<p>Unter dem zentralen Hoch bleibt es meist <strong>trocken, sonnig und je nach Jahreszeit warm oder ' +
          'kalt</strong>. An den beiden Tiefdruckflanken — oft über Westeuropa und Osteuropa — fällt dagegen ' +
          'wiederholt Regen. Weil das Muster blockiert ist, kann dieselbe Wetterlage <strong>mehrere Tage bis ' +
          'über eine Woche</strong> andauern. Im Sommer begünstigt das Hitzeperioden, im Winter kann es unter ' +
          'einer <a href="/wissen/temperaturinversion/">Inversion</a> für zähen Hochnebel sorgen.</p>',
      },
      {
        id: 'buscosun',
        h2: 'Eine Omega-Lage in buscosun erkennen',
        html:
          '<p>Im <a href="/funktionen/modellvergleich/">Modellvergleich</a> zeigt sich eine Blockadelage daran, ' +
          'dass die Modelle über mehrere Tage ungewöhnlich einig sind — der Unsicherheits-Spread bleibt klein. ' +
          'Auf der <a href="/funktionen/wetterkarte/">Wetterkarte</a> lässt sich das stabile Hoch über die ' +
          'Wolken- und Windlayer verfolgen. Hinweis: buscosun ordnet die Wetterlage ein und gibt keine amtlichen ' +
          'Warnungen heraus — diese veröffentlicht ausschließlich der Wetterdienst.</p>',
      },
    ],
    relatedPlaces: ['muenchen', 'berlin', 'wien', 'zuerich'],
    relatedExplainers: ['temperaturinversion', 'modellvergleich-unsicherheit', 'gewitter-unwetter'],
  },
  {
    slug: 'waldbrandsaison-2026-dach-zwischenbilanz',
    title: 'Waldbrandsaison 2026: Zwischenbilanz für Deutschland, Österreich und die Schweiz',
    ogTitle: 'Waldbrandsaison 2026 in DACH — Zwischenbilanz aus Satellitendaten',
    h1: 'Waldbrandsaison 2026: Zwischenbilanz für Deutschland, Österreich und die Schweiz',
    section: 'Wetterlage',
    status: 'full',
    datePublished: '2026-09-05',
    dateModified: '2026-09-05',
    hero: { url: '/og/waldbrandsaison-2026-dach-zwischenbilanz.png', w: 1200, h: 630, alt: 'buscosun — Waldbrandsaison im DACH-Raum' },
    dek:
      'Bis zum 22. August 2026 zählt das Brandarchiv von buscosun 4 686 Vegetationsbrand-Ereignisse in ' +
      'Deutschland, Österreich und der Schweiz — fast doppelt so viele wie im Mittel der sechs Vorjahre am ' +
      'gleichen Saisontag und mehr, als jede vollständige Saison seit 2020 am Ende erreicht hat. Die Zahlen ' +
      'sind Satellitendetektionen, keine amtliche Brandstatistik. Was sie zeigen und was nicht.',
    sections: [
      {
        id: 'zahl',
        h2: 'Die Zahl und was sie zählt',
        html:
          '<p>Grundlage ist das eigene Archiv der Satellitendetektionen von buscosun: Wärmepunkte des ' +
          'VIIRS-Sensors auf den Satelliten Suomi-NPP und NOAA-20, wie ihn das <strong>NASA-System FIRMS</strong> ' +
          'liefert, gebündelt zu Ereignissen. Ein Ereignis entsteht, wenn Detektionen näher als zwei Kilometer ' +
          'beieinanderliegen und höchstens 48 Stunden auseinander; eine längere Pause beginnt ein neues ' +
          'Ereignis. Gezählt wird es an dem Saisontag, an dem es beginnt. Die Saison läuft vom 1. März bis zum ' +
          '31. Oktober.</p>' +
          '<p>Wichtig ist, was <strong>nicht</strong> mitzählt: Ereignisse auf bekannten Anlagenstandorten. Rund ' +
          '39 Prozent aller Detektionen im DACH-Raum stammen von Stahlwerken, Zementöfen, Raffinerien oder ' +
          'Müllverbrennungsanlagen, die dauerhaft Wärme abstrahlen. buscosun führt dafür eine eigene Liste von ' +
          '218 Standorten und hält sie aus der Brandzählung heraus — sonst stünde jedes Industriewerk als ' +
          'Dauerbrand in der Statistik. In der laufenden Saison betrifft das knapp 1 200 der insgesamt 5 881 ' +
          'erfassten Ereignisse; die Bilanz unten nennt die bereinigten 4 686.</p>',
      },
      {
        id: 'vergleich',
        h2: 'Der Vergleich mit den Vorjahren',
        html:
          '<p>Am 174. Saisontag, dem 22. August, steht die laufende Saison bei <strong>4 686 Ereignissen</strong> ' +
          'im DACH-Raum. Der Mittelwert der sechs Vorjahre liegt am selben Tag bei 2 475,5, die Spanne reicht von ' +
          '1 544 (2021) bis 4 045 (2025). 2026 liegt damit rund 90 Prozent über dem Mittel der Vorjahre und ' +
          'oberhalb des bisherigen Höchstwerts — und zwar nicht am Saisonende, sondern gut zwei Monate davor.</p>' +
          '<table><thead><tr><th>Saison</th><th>am 174. Tag (22.8.)</th><th>am Saisonende (31.10.)</th></tr></thead><tbody>' +
          '<tr><td>2020</td><td>2 338</td><td>2 792</td></tr>' +
          '<tr><td>2021</td><td>1 544</td><td>1 980</td></tr>' +
          '<tr><td>2022</td><td>2 740</td><td>3 171</td></tr>' +
          '<tr><td>2023</td><td>2 167</td><td>2 992</td></tr>' +
          '<tr><td>2024</td><td>2 019</td><td>2 814</td></tr>' +
          '<tr><td>2025</td><td>4 045</td><td>4 528</td></tr>' +
          '<tr><td><strong>2026</strong></td><td><strong>4 686</strong></td><td>läuft noch</td></tr>' +
          '</tbody></table>' +
          '<p>Die Referenz sind die sechs vollständigen Saisons seit 2020, kein langjähriges Klimamittel — für ' +
          'ein solches ist die Reihe zu kurz. Zwei Jahre stechen heraus: 2025 war schon außergewöhnlich, 2026 ' +
          'liegt darüber.</p>',
      },
      {
        id: 'laender',
        h2: 'Deutschland, Österreich, Schweiz',
        html:
          '<p>Die Verteilung ist deutlich: Der weit überwiegende Teil der Ereignisse fällt auf Deutschland, was ' +
          'zunächst schlicht Fläche und Landnutzung spiegelt — große, zusammenhängende Kiefernforste und ' +
          'ehemalige Truppenübungsplätze in Brandenburg, Sachsen und Niedersachsen sind für den Satelliten gut ' +
          'sichtbare Brandflächen, während alpines Gelände kleinteiliger brennt und häufiger unter Wolken oder ' +
          'im Schatten steiler Hänge liegt.</p>' +
          '<table><thead><tr><th>Land</th><th>2026 am 22.8.</th><th>Mittel 2020–2025 am selben Tag</th></tr></thead><tbody>' +
          '<tr><td>Deutschland</td><td>4 330</td><td>2 253,3</td></tr>' +
          '<tr><td>Österreich</td><td>245</td><td>139,2</td></tr>' +
          '<tr><td>Schweiz</td><td>111</td><td>83,0</td></tr>' +
          '</tbody></table>' +
          '<p>Alle drei Länder liegen über ihrem Vorjahresmittel, Deutschland am deutlichsten. Für die Schweiz ' +
          'ist der Abstand am kleinsten und die absolute Zahl so niedrig, dass einzelne Ereignisse den Vergleich ' +
          'merklich verschieben — dort sind Prozentangaben wenig aussagekräftig.</p>',
      },
      {
        id: 'ursache',
        h2: 'Was diese Daten über die Ursache sagen — und was nicht',
        html:
          '<p>Nichts. Eine Detektionszählung sagt, wo und wann ein Satellit Wärme gesehen hat, nicht warum. Ob ' +
          'die hohe Zahl auf eine trockene Witterung, auf mehr Zündungen durch Menschen, auf veränderte ' +
          'Landnutzung oder auf eine Mischung zurückgeht, lässt sich aus diesem Datensatz nicht ableiten — und ' +
          'buscosun behauptet es deshalb nicht. Die Brandursache liefert ohnehin keine der genutzten Quellen; ' +
          'die Dossiers einzelner Brände sagen ausdrücklich „Ursache: keine Quelle".</p>' +
          '<p>Wer den meteorologischen Kontext sehen will, findet ihn an anderer Stelle: Der ' +
          '<a href="/waldbrand/gefahrenindex">Gefahrenindex</a> zeigt den europäischen Fire Weather Index als ' +
          'Fläche samt Perzentil-Einordnung — also wie außergewöhnlich der heutige Wert für genau diesen Ort und ' +
          'diese Jahreszeit ist. Die <a href="/waldbrand/trockenheit">Trockenheits-Ansicht</a> zeigt die ' +
          'Bodenfeuchte in zwei Tiefen. Und im Dossier eines Ereignisses steht die Wetterlage am Brandort aus ' +
          'dem Archiv, nicht aus der Vorhersage. Ein einzelner Brand ist damit einzuordnen; die Saisonbilanz ist ' +
          'es nicht.</p>',
      },
      {
        id: 'bestaetigt',
        h2: 'Detektion, Verdacht, Bestätigung',
        html:
          '<p>Eine Detektion ist eine Messung, keine Einsatzmeldung. Der Regelfall ist der unbestätigte Fall — ' +
          'und das ist kein Mangel, sondern die Datenlage: Für aktive Brände gibt es in Deutschland, Österreich ' +
          'und der Schweiz keine offene behördliche Echtzeitquelle. buscosun nennt ein Ereignis nur dann ' +
          'bestätigt, wenn eine Quelle im selben Satz steht: eine Brandflächen-Kartierung durch das europäische ' +
          'Waldbrandsystem EFFIS oder eine Aktivierung des Copernicus-Notfalldienstes EMS. In der laufenden ' +
          'Saison trifft das auf 120 Ereignisse zu, die ausschließlich über EFFIS und nicht über eine ' +
          'Satellitendetektion in die Liste gelangt sind.</p>' +
          '<p>Umgekehrt gilt: Ein Standort mit bekannter Dauersignatur wird nicht stillschweigend verworfen. ' +
          'Wächst seine Signatur oder tritt sie aus der bekannten Hülle heraus, führt buscosun ihn als ' +
          'Abweichung und behandelt ihn wie einen Brand — in dieser Saison 37 Fälle. Die Trennung soll Fehlalarme ' +
          'vermeiden, nicht echte Brände verstecken.</p>',
      },
      {
        id: 'grenzen',
        h2: 'Grenzen dieser Bilanz',
        html:
          '<ul>' +
          '<li><strong>Ereignisse, keine Fläche.</strong> Gezählt werden Brandereignisse, nicht Hektar. Ein ' +
          'großer Brand zählt wie ein kleiner. Flächenangaben gibt es nur dort, wo EFFIS kartiert hat.</li>' +
          '<li><strong>Kleine Brände fehlen systematisch.</strong> Das Detektionsraster von VIIRS liegt bei ' +
          '375 Metern; ein rasch gelöschter Flächenbrand von wenigen Aren erscheint nie. Die Zahlen liegen damit ' +
          'strukturell unter der Wahrheit.</li>' +
          '<li><strong>Wolken und Überflugzeiten.</strong> Ein Brand unter geschlossener Bewölkung oder zwischen ' +
          'zwei Überflügen bleibt unsichtbar. Eine Lücke in der Reihe ist kein Ende des Feuers.</li>' +
          '<li><strong>Der Rand der laufenden Saison ist vorläufig.</strong> Die jüngsten Tage stützen sich auf ' +
          'Echtzeit-Detektionen, die die spätere Standardverarbeitung noch verschieben kann. Die Vorjahre ' +
          'liegen vollständig in der Standardverarbeitung vor.</li>' +
          '<li><strong>Nur zwei Satelliten.</strong> Ausgewertet werden Suomi-NPP und NOAA-20 — für alle Jahre ' +
          'gleich, damit der Vergleich trägt; neuere Sensoren bleiben außen vor.</li>' +
          '<li><strong>Keine amtliche Statistik.</strong> Die Waldbrandstatistik der Länder zählt gemeldete ' +
          'Einsätze und Flächen und kommt zu anderen Zahlen. Beide Wege messen Verschiedenes.</li>' +
          '</ul>',
      },
      {
        id: 'selbst',
        h2: 'Selbst nachsehen',
        html:
          '<p>Die Kurve, die Ereignisliste und die Einzelfälle stehen in der ' +
          '<a href="/waldbrand/historie">Waldbrand-Historie</a>: Monat oder Saison wählen, Verlauf gegen die ' +
          'Vorjahre lesen, ein Ereignis öffnen und Ort, Zeitraum, Strahlungsleistung, EFFIS-Fläche und ' +
          'Wetterlage nachsehen. Die aktuelle Lage zeigt die Ansicht ' +
          '<a href="/waldbrand/aktive-braende">aktive Brände</a>, die Anlagenstandorte die Ansicht ' +
          '<a href="/waldbrand/thermalanomalien">Thermalanomalien</a>. Wie Detektion, Klassifizierung und ' +
          'Brandnarbe zusammenhängen, steht in der ' +
          '<a href="/methodik/brandradar-detektion-und-brandnarben/">Methodik</a>; die Begriffe erklären ' +
          '<a href="/wissen/fire-weather-index/">Fire Weather Index</a>, ' +
          '<a href="/wissen/waldbrandwarnstufen-de-at-ch/">Waldbrandwarnstufen in DE, AT und CH</a> und ' +
          '<a href="/wissen/thermalanomalien-firms/">Thermalanomalien</a>.</p>' +
          '<p>Stand aller Zahlen: 23. August 2026, Saisontag 174. buscosun gibt keine amtlichen Warnungen ' +
          'heraus; maßgeblich bleiben der Deutsche Wetterdienst, GeoSphere Austria, MeteoSchweiz und die ' +
          'zuständigen Forst- und Katastrophenschutzbehörden.</p>',
      },
    ],
    relatedPlaces: ['dresden', 'potsdam', 'leipzig', 'wien', 'chur'],
    relatedExplainers: ['fire-weather-index', 'waldbrandwarnstufen-de-at-ch', 'thermalanomalien-firms'],
  },
];

export const EVENTS_BY_SLUG = Object.fromEntries(EVENTS.map((e) => [e.slug, e]));
