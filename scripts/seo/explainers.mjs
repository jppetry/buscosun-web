/**
 * GEO-Explainer-Cluster (build-only, reines Node-ESM).
 *
 * Meteorologie-Wissensartikel unter /wissen/<slug>/. Ziel: AI-Zitierbarkeit
 * (extrahierbare Direktantwort, hohe Faktendichte, Quellen) + klassisches SEO.
 *
 * Genauigkeit hat Vorrang (YMYL-nah). buscosun erklärt nur, gibt keine amtlichen
 * Warnungen heraus. Attribution: Deutscher Wetterdienst (DWD), CC BY 4.0.
 *
 * status: 'full'  = vollständiger, indexierbarer Pilot.
 *         'stub'  = Scaffold mit valider Direktantwort, aber noindex (kein Thin-Spam).
 *
 * Felder: slug, title, h1, status, answer (40–60 W Direktantwort), sections
 * [{id,h2,html}], faqs [{q,a}], sources [{name,url}], relatedExplainers (slugs),
 * relatedPlaces (place-slugs), datePublished, dateModified.
 */

const PUBLISHED = '2026-06-26';
const MODIFIED = '2026-06-26';

export const EXPLAINERS = [
  // ---------------------------------------------------------------- PILOT 1
  {
    slug: 'foehn',
    title: 'Föhn',
    h1: 'Föhn: warmer Fallwind über den Alpen',
    status: 'full',
    answer:
      'Föhn ist ein warmer, trockener Fallwind, der entsteht, wenn Luft über ein Gebirge strömt, ' +
      'an der Luvseite abregnet und auf der Leeseite wieder absinkt. Beim Absinken erwärmt sie sich ' +
      'um rund 1 °C je 100 Höhenmeter. Im Alpenraum bringt Föhn oft ungewöhnlich milde Temperaturen, ' +
      'klare Fernsicht und kräftige, böige Winde.',
    sections: [
      {
        id: 'entstehung',
        h2: 'Wie Föhn entsteht',
        html:
          '<p>Strömt feuchte Luft gegen ein Gebirge, wird sie an der windzugewandten <strong>Luvseite</strong> ' +
          'zum Aufsteigen gezwungen. Dabei kühlt sie zunächst um etwa 1 °C je 100 m ab; sobald Wolken und ' +
          'Niederschlag einsetzen, nur noch um rund 0,5–0,6 °C je 100 m (feuchtadiabatisch), weil bei der ' +
          'Kondensation Wärme frei wird. Auf der windabgewandten <strong>Leeseite</strong> sinkt die nun ' +
          'trockenere Luft ab und erwärmt sich wieder um die vollen rund 1 °C je 100 m (trockenadiabatisch). ' +
          'Diese Differenz ist der Grund, warum es im Lee deutlich wärmer und trockener wird als im Luv.</p>',
      },
      {
        id: 'erkennen',
        h2: 'Woran man Föhn erkennt',
        html:
          '<ul>' +
          '<li><strong>Föhnmauer</strong>: ein Wolkenstau über dem Alpenhauptkamm, während es im Lee aufklart.</li>' +
          '<li><strong>Temperatursprung</strong>: rascher Anstieg um oft 5–15 °C, dazu ein Einbruch der Luftfeuchte.</li>' +
          '<li><strong>Böiger Wind</strong> aus der Leerichtung mit Spitzen, die in exponierten Tälern Sturmstärke erreichen können.</li>' +
          '<li><strong>Außergewöhnliche Fernsicht</strong> durch die trockene, partikelarme Luft.</li>' +
          '<li>Ein deutliches <strong>Luftdruckgefälle</strong> über den Alpen (Südföhn: höherer Druck im Süden).</li>' +
          '</ul>',
      },
      {
        id: 'wo',
        h2: 'Wo Föhn typisch auftritt',
        html:
          '<p>In den Alpen unterscheidet man <strong>Südföhn</strong> (Anströmung aus Süden, warm und mild auf der ' +
          'Alpennordseite) und <strong>Nordföhn</strong> (Anströmung aus Norden, auf der Alpensüdseite). Klassische ' +
          'Föhntäler sind das Inntal um Innsbruck, das Wipptal, das Rheintal sowie die nördlichen Alpentäler in ' +
          'Bayern, Tirol, Vorarlberg und Graubünden. buscosun erkennt Föhnlagen heuristisch aus Anströmung, ' +
          'Druckgefälle und Geländemodell und markiert sie auf der Karte.</p>',
      },
    ],
    faqs: [
      { q: 'Was ist Föhn?', a: 'Föhn ist ein warmer, trockener Fallwind im Lee eines Gebirges. Er entsteht, wenn Luft über einen Bergkamm strömt, auf der Luvseite abregnet und auf der Leeseite absinkt und sich dabei erwärmt.' },
      { q: 'Warum ist es bei Föhn so warm?', a: 'Weil die absinkende Luft auf der Leeseite trockenadiabatisch um rund 1 °C je 100 Höhenmeter erwärmt wird, während sie auf der Luvseite durch die Wolkenbildung nur langsamer abgekühlt war. Diese Differenz erzeugt den Wärmeüberschuss.' },
      { q: 'Wo gibt es in den Alpen am häufigsten Föhn?', a: 'In den großen Nord-Süd-Tälern, etwa im Inntal um Innsbruck, im Wipptal, im Rheintal sowie in den nördlichen Alpentälern Bayerns, Tirols, Vorarlbergs und Graubündens.' },
      { q: 'Ist Föhn gefährlich?', a: 'Föhn selbst ist ein normales Wetterphänomen, kann aber Sturmböen bringen, die Bäume entwurzeln oder den Bergsport erschweren. Amtliche Sturmwarnungen gibt ausschließlich der Wetterdienst heraus; buscosun zeigt nur den meteorologischen Kontext.' },
    ],
    sources: [
      { name: 'DWD Wetterlexikon: Föhn', url: 'https://www.dwd.de/DE/service/lexikon/Functions/glossar.html' },
    ],
    relatedExplainers: ['temperaturinversion', 'nebel-hochnebel-nebelobergrenze', 'schneefallgrenze'],
    relatedPlaces: ['innsbruck', 'garmisch-partenkirchen', 'bad-gastein', 'chur', 'landeck'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },

  // ---------------------------------------------------------------- PILOT 2
  {
    slug: 'temperaturinversion',
    title: 'Temperaturinversion',
    h1: 'Temperaturinversion: wenn es oben wärmer ist als unten',
    status: 'full',
    answer:
      'Eine Temperaturinversion ist die Umkehr des normalen Temperaturverlaufs: Statt mit der Höhe abzunehmen, ' +
      'steigt die Temperatur in einer Schicht an. Unter der Inversion sammeln sich Kaltluft, Nebel und ' +
      'Schadstoffe; darüber ist es oft sonnig und mild. Inversionen entstehen typisch in klaren, windschwachen ' +
      'Winternächten und in Hochdrucklagen.',
    sections: [
      {
        id: 'was',
        h2: 'Was eine Inversion bedeutet',
        html:
          '<p>Normalerweise nimmt die Lufttemperatur in der unteren Atmosphäre mit der Höhe ab — im Mittel um ' +
          'etwa 0,65 °C je 100 m. Bei einer <strong>Inversion</strong> kehrt sich das um: Eine wärmere Schicht ' +
          'liegt wie ein Deckel über kälterer Luft. Dieser Deckel unterdrückt die vertikale Durchmischung, ' +
          'sodass sich darunter Feuchte und Schadstoffe anreichern.</p>',
      },
      {
        id: 'arten',
        h2: 'Arten von Inversionen',
        html:
          '<ul>' +
          '<li><strong>Strahlungs-/Bodeninversion</strong>: In klaren, windstillen Nächten kühlt der Boden stark aus und kühlt die bodennahe Luft ab. Häufig im Winter und in Tälern (Kaltluftseen).</li>' +
          '<li><strong>Absink-/Subsidenzinversion</strong>: In Hochdruckgebieten sinkt Luft großräumig ab und erwärmt sich, wodurch sich in einigen hundert Metern Höhe eine warme Sperrschicht bildet — die typische winterliche Hochnebellage.</li>' +
          '<li><strong>Frontinversion</strong>: Warmluft gleitet auf eine Kaltluftmasse auf.</li>' +
          '</ul>',
      },
      {
        id: 'folgen',
        h2: 'Folgen: Hochnebel, Smog und Kaltluftseen',
        html:
          '<p>Unter der Inversion bleibt es trüb, feucht und kalt, während Gipfel und Hänge oberhalb der ' +
          'Sperrschicht in der Sonne liegen. In Ballungsräumen reichert sich unter der Inversion auch Feinstaub an. ' +
          'Wer der Tristesse entkommen will, muss über die <strong>Inversionsobergrenze</strong> steigen — im ' +
          'DACH-Winter oft zwischen 600 und 1200 m. <em>Sehr dünne Inversionen unter etwa 200 m Mächtigkeit sind ' +
          'in Vorhersagemodellen nur grob aufgelöst und entsprechend unsicher.</em></p>',
      },
    ],
    faqs: [
      { q: 'Was ist eine Temperaturinversion?', a: 'Eine Schicht, in der die Temperatur mit der Höhe ausnahmsweise zunimmt statt abnimmt. Sie wirkt als Deckel, der Kaltluft, Nebel und Schadstoffe darunter einsperrt.' },
      { q: 'Wann treten Inversionen auf?', a: 'Vor allem in klaren, windschwachen Nächten (Strahlungsinversion) und in winterlichen Hochdrucklagen mit großräumigem Absinken (Subsidenzinversion).' },
      { q: 'Warum ist es über dem Nebel oft sonnig und warm?', a: 'Weil die wärmere Inversionsschicht über dem Hochnebel liegt. Steigt man über die Inversionsobergrenze, lässt man Kaltluft und Nebel hinter sich und erreicht die sonnige Warmluft darüber.' },
    ],
    sources: [
      { name: 'DWD Wetterlexikon: Inversion', url: 'https://www.dwd.de/DE/service/lexikon/Functions/glossar.html' },
    ],
    relatedExplainers: ['nebel-hochnebel-nebelobergrenze', 'foehn', 'biowetter'],
    relatedPlaces: ['muenchen', 'zuerich', 'innsbruck', 'salzburg', 'stuttgart'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },

  // ---------------------------------------------------------------- PILOT 3
  {
    slug: 'nebel-hochnebel-nebelobergrenze',
    title: 'Nebel, Hochnebel & Nebelobergrenze',
    h1: 'Nebel, Hochnebel und die Nebelobergrenze',
    status: 'full',
    answer:
      'Nebel ist eine Wolke am Boden mit einer Sichtweite unter 1 km; Hochnebel ist eine tiefe Wolkenschicht, ' +
      'deren Untergrenze über dem Boden liegt. Die Nebelobergrenze ist die Höhe, ab der man aus dem Hochnebel ' +
      'heraustritt — darüber scheint oft die Sonne. Im DACH-Winter liegt sie in den Tälern häufig zwischen ' +
      '600 und 1200 m.',
    sections: [
      {
        id: 'unterschied',
        h2: 'Nebel oder Hochnebel?',
        html:
          '<p>Meteorologisch ist <strong>Nebel</strong> eine Wolke, die den Boden berührt und die Sichtweite ' +
          'auf unter 1000 m drückt. <strong>Hochnebel</strong> (Stratus) ist dieselbe Art tiefe Wolke, ihre ' +
          'Untergrenze schwebt aber einige zehn bis hundert Meter über dem Boden — am Boden ist die Sicht dann ' +
          'oft gut, der Himmel aber grau verhangen.</p>',
      },
      {
        id: 'entstehung',
        h2: 'Wie Nebel entsteht',
        html:
          '<ul>' +
          '<li><strong>Strahlungsnebel</strong>: In klaren, windschwachen Nächten kühlt der Boden aus, die ' +
          'bodennahe Luft erreicht den Taupunkt und kondensiert. Typisch in Flusstälern und Senken.</li>' +
          '<li><strong>Advektionsnebel</strong>: Milde, feuchte Luft strömt über kalten Boden oder kaltes Wasser.</li>' +
          '<li><strong>Hochnebel</strong> entsteht oft unter einer <a href="/wissen/temperaturinversion/">Temperaturinversion</a>, ' +
          'die die feuchte Luft wie ein Deckel einsperrt.</li>' +
          '</ul>',
      },
      {
        id: 'obergrenze',
        h2: 'Die Nebelobergrenze nutzen',
        html:
          '<p>Die <strong>Nebelobergrenze</strong> entscheidet, ob eine Wanderung oder Skitour im Grau endet ' +
          'oder über dem Nebelmeer in der Sonne. buscosun schätzt sie aus der Schichtung und dem Geländemodell, ' +
          'sodass sich Ziele oberhalb der Grenze gezielt ansteuern lassen. Da Hochnebel-Obergrenzen kleinräumig ' +
          'schwanken, bleibt die Angabe ein Richtwert, kein garantierter Wert.</p>',
      },
    ],
    faqs: [
      { q: 'Was ist der Unterschied zwischen Nebel und Hochnebel?', a: 'Nebel berührt den Boden und senkt die Sicht unter 1 km. Hochnebel ist eine tiefe Wolkenschicht, deren Untergrenze über dem Boden liegt — am Boden ist die Sicht dann oft frei, der Himmel aber grau.' },
      { q: 'Was bedeutet Nebelobergrenze?', a: 'Die Höhe, ab der man aus einer Hochnebelschicht nach oben heraustritt. Oberhalb dieser Grenze scheint häufig die Sonne, während es darunter trüb bleibt.' },
      { q: 'Wie hoch liegt die Nebelobergrenze im Winter?', a: 'In den DACH-Tälern häufig zwischen 600 und 1200 m, abhängig von Wetterlage, Inversionshöhe und Gelände. Der genaue Wert schwankt kleinräumig.' },
    ],
    sources: [
      { name: 'DWD Wetterlexikon: Nebel', url: 'https://www.dwd.de/DE/service/lexikon/Functions/glossar.html' },
    ],
    relatedExplainers: ['temperaturinversion', 'foehn', 'thermik'],
    relatedPlaces: ['zuerich', 'muenchen', 'feldberg-schwarzwald', 'davos', 'garmisch-partenkirchen'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },

  // ------------------------------------------------------------- SCAFFOLDS
  {
    slug: 'thermik',
    title: 'Thermik',
    h1: 'Thermik: warum warme Luft aufsteigt',
    status: 'stub',
    answer:
      'Thermik ist aufsteigende warme Luft, die entsteht, wenn die Sonne den Boden ungleich erwärmt. ' +
      'Über stark aufgeheizten Flächen löst sich erwärmte Luft als Blase oder Schlauch und steigt auf. ' +
      'Segelflieger, Gleitschirm- und Drachenflieger nutzen diese Aufwinde; ihre Stärke hängt von Einstrahlung, ' +
      'Bodenbeschaffenheit und Schichtung der Atmosphäre ab.',
    sections: [],
    faqs: [
      { q: 'Was ist Thermik?', a: 'Aufsteigende warme Luft, die durch ungleiche Erwärmung des Bodens entsteht. Über stärker aufgeheizten Flächen löst sich erwärmte Luft und steigt auf.' },
      { q: 'Wann ist die Thermik am stärksten?', a: 'Meist am frühen Nachmittag bei kräftiger Sonneneinstrahlung und labiler Schichtung, häufig im Frühjahr und Sommer.' },
    ],
    sources: [{ name: 'DWD Wetterlexikon', url: 'https://www.dwd.de/DE/service/lexikon/lexikon_node.html' }],
    relatedExplainers: ['nebel-hochnebel-nebelobergrenze', 'gewitter-unwetter'],
    relatedPlaces: ['innsbruck', 'garmisch-partenkirchen'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },
  {
    slug: 'schneefallgrenze',
    title: 'Schneefallgrenze',
    h1: 'Schneefallgrenze: ab welcher Höhe es schneit',
    status: 'stub',
    answer:
      'Die Schneefallgrenze ist die Höhe, unterhalb derer Niederschlag als Regen und oberhalb als Schnee fällt. ' +
      'Sie liegt meist einige hundert Meter unter der Höhe des 0-°C-Niveaus, weil schmelzender Schnee die Luft ' +
      'abkühlt. Niederschlagsintensität, Luftmasse und Geländeform verschieben sie; in Tälern kann sie durch ' +
      'Kaltluft deutlich tiefer liegen.',
    sections: [],
    faqs: [
      { q: 'Was ist die Schneefallgrenze?', a: 'Die Höhe, unterhalb derer Niederschlag als Regen, oberhalb als Schnee fällt. Sie liegt typischerweise einige hundert Meter unter dem 0-°C-Niveau der Atmosphäre.' },
      { q: 'Warum liegt die Schneefallgrenze unter der Nullgradgrenze?', a: 'Weil fallender Schnee beim Schmelzen Energie verbraucht und die Luft abkühlt. Dadurch reicht Schneefall oft mehrere hundert Meter unter das 0-°C-Niveau hinab, besonders bei kräftigem Niederschlag.' },
    ],
    sources: [{ name: 'DWD Wetterlexikon', url: 'https://www.dwd.de/DE/service/lexikon/lexikon_node.html' }],
    relatedExplainers: ['foehn', 'temperaturinversion'],
    relatedPlaces: ['davos', 'zermatt', 'sankt-anton-am-arlberg'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },
  {
    slug: 'gewitter-unwetter',
    title: 'Gewitter & Unwetter',
    h1: 'Gewitter und Unwetter: Entstehung und Gefahren',
    status: 'stub',
    answer:
      'Gewitter entstehen, wenn feuchtwarme Luft rasch aufsteigt, kondensiert und hochreichende Quellwolken ' +
      'bildet. In ihnen entladen sich Blitze; begleitend treten Starkregen, Hagel und Sturmböen auf. Unwetter ' +
      'sind Gewitter oder Wetterlagen, die Schwellen für Gefahr überschreiten. Amtliche Unwetterwarnungen gibt ' +
      'ausschließlich der Wetterdienst heraus.',
    sections: [],
    faqs: [
      { q: 'Wie entsteht ein Gewitter?', a: 'Durch rasch aufsteigende feuchtwarme Luft, die kondensiert und eine hochreichende Gewitterwolke bildet. In ihr trennen sich elektrische Ladungen, die sich als Blitze entladen.' },
      { q: 'Gibt buscosun amtliche Unwetterwarnungen heraus?', a: 'Nein. buscosun zeigt den meteorologischen Kontext und verlinkt amtliche Warnungen des DWD. Verbindliche Warnungen geben ausschließlich die staatlichen Wetterdienste heraus.' },
    ],
    sources: [{ name: 'DWD Wetterlexikon', url: 'https://www.dwd.de/DE/service/lexikon/lexikon_node.html' }],
    relatedExplainers: ['thermik', 'windboeen-sturm'],
    relatedPlaces: ['muenchen', 'wien', 'zuerich'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },
  {
    slug: 'biowetter',
    title: 'Biowetter',
    h1: 'Biowetter: wie Wetter den Körper beeinflusst',
    status: 'stub',
    answer:
      'Biowetter beschreibt den Einfluss von Wetter und Wetterwechseln auf das Befinden. Rasche Luftdruck- und ' +
      'Temperaturänderungen, Föhnlagen oder schwüle Hitze können Kopfschmerz, Kreislaufbeschwerden oder ' +
      'Schlafstörungen begünstigen. Die Zusammenhänge sind individuell verschieden und wissenschaftlich nur ' +
      'teilweise belegt; das Biowetter ist daher ein Anhaltspunkt, keine medizinische Vorhersage.',
    sections: [],
    faqs: [
      { q: 'Was ist Biowetter?', a: 'Der Einfluss von Wetterelementen und Wetterwechseln auf das menschliche Befinden, etwa bei Föhn, Hitze oder raschen Luftdruckänderungen.' },
      { q: 'Ist Wetterfühligkeit wissenschaftlich belegt?', a: 'Teilweise. Zusammenhänge zwischen Wetterwechseln und Beschwerden sind individuell sehr verschieden und nur begrenzt belegt. Biowetter-Angaben sind ein Anhaltspunkt, kein medizinischer Rat.' },
    ],
    sources: [{ name: 'DWD Gesundheit / Biowetter', url: 'https://www.dwd.de/DE/leistungen/gesundheit/gesundheit.html' }],
    relatedExplainers: ['foehn', 'temperaturinversion'],
    relatedPlaces: ['berlin', 'wien', 'zuerich'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },
  {
    slug: 'hoehenkorrektur-lapse-rate',
    title: 'Höhenkorrektur & Lapse-Rate',
    h1: 'Höhenkorrektur: warum die Temperatur mit der Höhe sinkt',
    status: 'stub',
    answer:
      'Die Temperatur nimmt mit der Höhe im Mittel um etwa 0,65 °C je 100 Meter ab — diese Rate heißt Lapse-Rate. ' +
      'Weil Wettermodelle ein grobes Geländeraster nutzen, weicht ihre Modellhöhe oft von der echten Ortshöhe ab. ' +
      'buscosun korrigiert die Temperatur über ein digitales Geländemodell und eine ortsabhängige Lapse-Rate auf ' +
      'die tatsächliche Höhe.',
    sections: [],
    faqs: [
      { q: 'Was ist die Lapse-Rate?', a: 'Die Abnahme der Lufttemperatur mit der Höhe. In der freien Atmosphäre beträgt sie im Mittel rund 0,65 °C je 100 m, schwankt aber je nach Luftmasse und Schichtung.' },
      { q: 'Warum ist eine Höhenkorrektur nötig?', a: 'Weil das Geländeraster der Wettermodelle gröber ist als die echte Topografie. In Bergregionen kann die Modellhöhe um hunderte Meter abweichen, was ohne Korrektur zu falschen Temperaturen führt.' },
    ],
    sources: [{ name: 'DWD Wetterlexikon', url: 'https://www.dwd.de/DE/service/lexikon/lexikon_node.html' }],
    relatedExplainers: ['temperaturinversion', 'schneefallgrenze'],
    relatedPlaces: ['zermatt', 'davos', 'garmisch-partenkirchen'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },
  {
    slug: 'modellvergleich-unsicherheit',
    title: 'Modellvergleich & Unsicherheit',
    h1: 'Wettermodelle vergleichen: Unsicherheit ehrlich lesen',
    status: 'stub',
    answer:
      'Verschiedene Wettermodelle wie ICON-D2, MOSMIX und ICON-EU rechnen mit unterschiedlicher Auflösung und ' +
      'Physik und liefern daher leicht abweichende Vorhersagen. Die Streuung zwischen ihnen ist ein ehrliches Maß ' +
      'für die Unsicherheit: Liegen sie eng beieinander, ist die Prognose verlässlicher; driften sie auseinander, ' +
      'ist Vorsicht geboten. buscosun zeigt diesen Spread statt einer Scheingenauigkeit.',
    sections: [],
    faqs: [
      { q: 'Warum unterscheiden sich Wettermodelle?', a: 'Sie nutzen unterschiedliche Auflösung, Startdaten und physikalische Annahmen. Kleine Unterschiede in den Anfangsbedingungen verstärken sich mit der Vorhersagezeit.' },
      { q: 'Was sagt der Modell-Spread aus?', a: 'Die Streuung zwischen den Modellen ist ein Maß für die Vorhersageunsicherheit. Geringer Spread bedeutet höhere Verlässlichkeit, großer Spread mahnt zur Vorsicht.' },
    ],
    sources: [{ name: 'DWD: numerische Wettervorhersage', url: 'https://www.dwd.de/DE/forschung/wettervorhersage/wettervorhersage_node.html' }],
    relatedExplainers: ['hoehenkorrektur-lapse-rate', 'gewitter-unwetter'],
    relatedPlaces: ['berlin', 'hamburg', 'muenchen'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },
  {
    slug: 'windboeen-sturm',
    title: 'Windböen & Sturm',
    h1: 'Windböen und Sturm: Wind richtig einordnen',
    status: 'stub',
    answer:
      'Eine Böe ist eine kurze, kräftige Windspitze, die den mittleren Wind deutlich übersteigt. Stürme werden ' +
      'nach der Beaufort-Skala eingeordnet: ab Windstärke 8 (rund 62 km/h) spricht man von Sturm, ab Stärke 12 ' +
      '(rund 118 km/h) von Orkan. Für Drohne, Kran oder Höhenarbeit zählen die Böenspitzen, nicht der Mittelwind.',
    sections: [],
    faqs: [
      { q: 'Was ist der Unterschied zwischen Wind und Böe?', a: 'Der Wind ist der über ein Zeitintervall gemittelte Luftstrom; eine Böe ist eine kurze Windspitze, die den Mittelwind deutlich übertrifft. Für Sicherheit am Bau oder beim Fliegen sind die Böen entscheidend.' },
      { q: 'Ab wann spricht man von Sturm?', a: 'Nach der Beaufort-Skala ab Windstärke 8 (rund 62 km/h) von Sturm, ab Stärke 10 von schwerem Sturm und ab Stärke 12 (rund 118 km/h) von Orkan.' },
    ],
    sources: [{ name: 'DWD Wetterlexikon: Beaufort-Skala', url: 'https://www.dwd.de/DE/service/lexikon/lexikon_node.html' }],
    relatedExplainers: ['foehn', 'gewitter-unwetter'],
    relatedPlaces: ['sylt-westerland', 'cuxhaven', 'helgoland'],
    datePublished: PUBLISHED, dateModified: MODIFIED,
  },
];

export const EXPLAINERS_BY_SLUG = Object.fromEntries(EXPLAINERS.map((e) => [e.slug, e]));
