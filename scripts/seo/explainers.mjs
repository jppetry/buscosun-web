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
/** Etappe E4 (SEO-PLAN.md): Scaffolds zu vollen Seiten ausgebaut. */
const MODIFIED_E4 = '2026-09-05';

import { EXPLAINERS_EXTRA } from './explainers-extra.mjs';

/** Pilot- und Ausbau-Explainer (E0–E4). Die 15 Themen aus E5 stehen in explainers-extra.mjs. */
const EXPLAINERS_BASE = [
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
    status: 'full',
    answer:
      'Thermik ist aufsteigende warme Luft, die entsteht, wenn die Sonne den Boden ungleich erwärmt. ' +
      'Über stark aufgeheizten Flächen löst sich erwärmte Luft als Blase oder Schlauch und steigt auf. ' +
      'Segelflieger, Gleitschirm- und Drachenflieger nutzen diese Aufwinde; ihre Stärke hängt von Einstrahlung, ' +
      'Bodenbeschaffenheit und Schichtung der Atmosphäre ab.',
    sections: [
      {
        id: 'entstehung',
        h2: 'Wie Thermik entsteht',
        html:
          '<p>Die Sonne erwärmt nicht die Luft, sondern den Boden — und der gibt die Wärme sehr ungleich weiter. ' +
          'Ein abgeerntetes Feld, ein Felshang oder eine Schotterfläche heizen sich schneller auf als Wald, Wiese ' +
          'oder ein See. Über den warmen Flächen wird die bodennahe Luft leichter als ihre Umgebung, sammelt sich ' +
          'und löst sich schließlich als <strong>Blase oder Schlauch</strong> vom Boden.</p>' +
          '<p>Steigt dieses Luftpaket auf, dehnt es sich aus und kühlt <strong>trockenadiabatisch</strong> um rund ' +
          '1 °C je 100 Höhenmeter ab. Es steigt so lange weiter, wie es wärmer bleibt als die Luft ringsum. Genau ' +
          'dort, wo sich seine Temperaturkurve mit dem Umgebungsprofil schneidet, endet der Aufwind — das ist die ' +
          'Obergrenze der durchmischten Schicht. Kühlt das Paket vorher bis zum Taupunkt ab, kondensiert die ' +
          'Feuchte: Es entsteht ein Quellwolken-Hütchen, das die Thermik von außen sichtbar macht.</p>',
      },
      {
        id: 'staerke',
        h2: 'Was die Stärke bestimmt',
        html:
          '<ul>' +
          '<li><strong>Einstrahlung</strong>: Sonnenhöhe, Jahreszeit und Bewölkung entscheiden, wie viel Energie ' +
          'überhaupt am Boden ankommt. Im Frühjahr und Sommer ist die Ausbeute am größten.</li>' +
          '<li><strong>Bodenbeschaffenheit</strong>: trockene, dunkle, vegetationsarme Flächen liefern kräftigere ' +
          'Ablösungen als feuchter Boden oder Wasser — Seen sind tagsüber praktisch thermikfrei.</li>' +
          '<li><strong>Schichtung</strong>: Nimmt die Temperatur mit der Höhe rasch ab, ist die Luft labil und die ' +
          'Blase steigt weit. Eine <a href="/wissen/temperaturinversion/">Temperaturinversion</a> wirkt dagegen als ' +
          'Deckel und kappt den Aufwind.</li>' +
          '<li><strong>Feuchte</strong>: Sie legt fest, in welcher Höhe die Wolkenbasis liegt — und ob aus dem ' +
          'Aufwind eine harmlose Quellwolke oder ein <a href="/wissen/gewitter-unwetter/">Gewitter</a> wird.</li>' +
          '<li><strong>Wind</strong>: Kräftiger Höhenwind schert die Blasen ab; die Aufwinde werden zerrissen und ' +
          'schwer nutzbar (siehe <a href="/wissen/windboeen-sturm/">Windböen &amp; Sturm</a>).</li>' +
          '<li><strong>Gelände</strong>: Tiefer und wärmer gelegene Flächen bauen eine mächtigere Durchmischung auf ' +
          'als hochgelegene, kühle Lagen — deshalb unterscheidet sich Thermik über Tal und Grat deutlich.</li>' +
          '</ul>',
      },
      {
        id: 'buscosun',
        h2: 'So zeigt es buscosun',
        html:
          '<p>Die Linse <a href="/atmosphaere/fliegen">Thermik &amp; Fliegen</a> leitet ein Thermik-Feld aus ' +
          '<strong>einem ICON-EU-Umgebungsprofil</strong> (rund 7 km Gitterweite) und dem Geländemodell ab. Für jede ' +
          'Geländezelle wird ein Boden-Luftpaket mit einer festen Tages-Überhitzung von <strong>3 K</strong> ' +
          'angesetzt und trockenadiabatisch mit <strong>9,8 K je Kilometer</strong> gehoben, bis es das ' +
          'Umgebungsprofil schneidet. Aus der so bestimmten Grenzschichttiefe entsteht eine Thermik-Stärke von ' +
          '<strong>0 bis 5 m/s</strong>; die volle Stärke ist bei 2500 m Grenzschichttiefe erreicht. Unter 0,5 m/s ' +
          'bleibt die Fläche transparent, statt schwache Werte als Aufwind auszumalen.</p>' +
          '<p>Die Bewertung darüber ist bewusst grob gerastert: Ab 40 km/h Wind in der unteren Schicht gilt die Lage ' +
          'als zu windig, unter 25 km/h zusammen mit mindestens 2 m/s Thermik als gut. Dazu kommt der ' +
          '<strong>Talwind-Tagesgang</strong> — aus stündlichem Oberflächenwind und der Hangrichtung des ' +
          'Geländemodells nennt buscosun die nächsten Umkehrpunkte zwischen bergauf (anabatisch) und bergab ' +
          '(katabatisch) über 48 Stunden. In flachem Gelände sagt die App, dass es keinen ausgeprägten Tagesgang ' +
          'gibt, statt eine Kurve zu erfinden.</p>',
      },
      {
        id: 'grenzen',
        h2: 'Grenzen der Thermik-Schätzung',
        html:
          '<p>Alles davon ist eine <strong>Ableitung aus einem Modellprofil, kein gemessener Steigwert</strong>. ' +
          'ICON-EU liefert nur grobe Standard-Druckflächen; Strukturen unter etwa 200 Metern Mächtigkeit sind darin ' +
          'nicht aufgelöst. Hangwind- und Einstrahlungsphysik rechnet buscosun nicht, die Tages-Überhitzung ist ein ' +
          'fester Wert statt einer echten Energiebilanz, und die „bergauf"-Richtung des Talwinds ist der lokale ' +
          'Geländegradient, nicht der Verlauf einer echten Talachse. Für Flugentscheidungen bleiben das amtliche ' +
          'Flugwetter und die eigene Beobachtung maßgeblich; buscosun liefert den Richtwert davor.</p>',
      },
    ],
    faqs: [
      { q: 'Was ist Thermik?', a: 'Thermik ist aufsteigende warme Luft, die durch die ungleiche Erwärmung des Bodens entsteht. Über stärker aufgeheizten Flächen löst sich erwärmte Luft als Blase oder Schlauch ab und steigt so lange, wie sie wärmer bleibt als ihre Umgebung.' },
      { q: 'Wann ist die Thermik am stärksten?', a: 'In der Regel am frühen Nachmittag, wenn der Boden die Sonnenenergie des Tages abgegeben hat und die Schichtung am labilsten ist. Über die Jahreszeit gesehen sind Frühjahr und Sommer am ergiebigsten, weil die Sonne hoch steht und der Boden trocken ist.' },
      { q: 'Wie stark ist eine gute Thermik?', a: 'buscosun rechnet die Thermik-Stärke auf einer Skala von 0 bis 5 m/s; ab etwa 2 m/s zusammen mit weniger als 25 km/h Wind gilt die Lage in der Flieger-Linse als gut, unter 0,5 m/s als nicht nutzbar. Das sind Modellwerte, keine gemessenen Steigwerte.' },
      { q: 'Woher weiß buscosun, wo Thermik entsteht?', a: 'Aus einem ICON-EU-Umgebungsprofil und dem Geländemodell: Für jede Geländezelle wird ein Boden-Luftpaket mit fester Überhitzung gehoben, bis es das Profil schneidet. Das ist eine physikalische Abschätzung der Grenzschichttiefe, keine Messung und keine Beobachtung einzelner Aufwinde.' },
    ],
    sources: [
      { name: 'DWD Wetterlexikon', url: 'https://www.dwd.de/DE/service/lexikon/lexikon_node.html' },
      { name: 'DWD: Luftfahrt und Flugwetterberatung', url: 'https://www.dwd.de/DE/fachnutzer/luftfahrt/luftfahrt_node.html' },
    ],
    relatedExplainers: ['nebel-hochnebel-nebelobergrenze', 'gewitter-unwetter', 'temperaturinversion', 'hoehenkorrektur-lapse-rate'],
    relatedPlaces: ['innsbruck', 'garmisch-partenkirchen', 'oberstdorf', 'bad-gastein', 'feldberg-schwarzwald'],
    datePublished: PUBLISHED, dateModified: MODIFIED_E4,
  },
  {
    slug: 'schneefallgrenze',
    title: 'Schneefallgrenze',
    h1: 'Schneefallgrenze: ab welcher Höhe es schneit',
    status: 'full',
    answer:
      'Die Schneefallgrenze ist die Höhe, unterhalb derer Niederschlag als Regen und oberhalb als Schnee fällt. ' +
      'Sie liegt meist einige hundert Meter unter der Höhe des 0-°C-Niveaus, weil schmelzender Schnee die Luft ' +
      'abkühlt. Niederschlagsintensität, Luftmasse und Geländeform verschieben sie; in Tälern kann sie durch ' +
      'Kaltluft deutlich tiefer liegen.',
    sections: [
      {
        id: 'nullgrad',
        h2: 'Nullgradgrenze und Schneefallgrenze sind nicht dasselbe',
        html:
          '<p>Die <strong>Nullgradgrenze</strong> ist die Höhe, in der die Lufttemperatur 0 °C beträgt. Die ' +
          '<strong>Schneefallgrenze</strong> liegt darunter — meist einige hundert Meter. Der Grund ist die ' +
          'Schmelzwärme: Fällt eine Schneeflocke unter die Nullgradgrenze, schmilzt sie nicht sofort, sondern ' +
          'entzieht der Luft dabei Energie und kühlt sie ab. Bei kräftigem Niederschlag fallen so viele Flocken ' +
          'gleichzeitig, dass sich in der Schmelzschicht eine nahezu isotherme Zone um 0 °C aufbaut und der Schnee ' +
          'deutlich tiefer herunterkommt als die Temperaturkurve allein vermuten ließe.</p>' +
          '<p>Deshalb ist die Schneefallgrenze auch keine scharfe Linie, sondern ein <strong>Übergangsband</strong>: ' +
          'Ein paar hundert Meter darüber ist es reiner Schnee, darunter reiner Regen, dazwischen Schneeregen.</p>',
      },
      {
        id: 'verschiebt',
        h2: 'Was die Grenze verschiebt',
        html:
          '<ul>' +
          '<li><strong>Niederschlagsintensität</strong>: Je kräftiger es schneit, desto tiefer sinkt die Grenze — ' +
          'ein Schauer kann sie kurzfristig um mehrere hundert Meter drücken.</li>' +
          '<li><strong>Luftfeuchte</strong>: In trockener Luft verdunstet Schmelzwasser und kühlt zusätzlich; Schnee ' +
          'fällt dann bis in wärmere Höhen. Bei schwülwarmer, gesättigter Luft ist es umgekehrt.</li>' +
          '<li><strong>Kaltluftseen</strong>: Unter einer <a href="/wissen/temperaturinversion/">Temperaturinversion</a> ' +
          'kann es im Tal schneien, während es am Hang darüber regnet — die Grenze steht dann auf dem Kopf.</li>' +
          '<li><strong>Föhn</strong>: Ein <a href="/wissen/foehn/">Föhndurchbruch</a> hebt die Grenze im Lee binnen ' +
          'Stunden um viele hundert Meter an.</li>' +
          '<li><strong>Gelände</strong>: In engen Tälern und an Nordhängen hält sich Kaltluft; auf freien Kuppen ' +
          'mischt der Wind sie weg.</li>' +
          '</ul>',
      },
      {
        id: 'buscosun',
        h2: 'So zeigt es buscosun',
        html:
          '<p>Der Layer <a href="/wetterkarte/schneegrenze">Schneefallgrenze</a> zeichnet die Grenze als Linie, die ' +
          'dem Gelände folgt. Grundlage ist die 2-Meter-Temperatur aus <strong>ICON-D2 (2,2 km, stündlich, 0 bis ' +
          '+24 h)</strong>, die über das Geländemodell mit <strong>6,5 K je Kilometer</strong> auf die echte Höhe ' +
          'gerechnet wird (mehr dazu unter <a href="/methodik/hoehenkorrektur/">Höhenkorrektur</a>). Von diesem Feld ' +
          'wird die Schwellentemperatur abgezogen, bei der Schnee und Regen gleich wahrscheinlich sind, und die ' +
          'Null-Linie extrahiert.</p>' +
          '<p>Diese Schwelle ist kein fester Wert: Sie besteht aus einem physikalischen Anker um <strong>+1 °C</strong> ' +
          'und einer Orts-Korrektur, die aus der Historie der umliegenden DWD-Stationen gelernt wurde — eine ' +
          'logistische Kurve für die Wahrscheinlichkeit von Schnee in Abhängigkeit von Temperatur und relativer ' +
          'Feuchte, begrenzt auf ±1,5 K Abweichung vom Anker. Im <a href="/regenradar">Regenradar</a> wird daraus ' +
          'zusätzlich die Trennung zwischen Tal und Grat: Ab 700 Metern Ortshöhe nennt buscosun beide Werte und sagt ' +
          'ausdrücklich, ob die Grenze über dem Grat, unter dem Tal oder dazwischen liegt. Für Österreich und die ' +
          'Schweiz nennt der Punktforecast zusätzlich die Schneefallgrenze aus dem AROME-Modell in Metern.</p>',
      },
      {
        id: 'grenzen',
        h2: 'Wo die Angabe an ihre Grenze kommt',
        html:
          '<p>Die Linie ist ein <strong>Modellprodukt, keine Messung</strong> — Radar erkennt die Niederschlagsphase ' +
          'nicht, es misst nur Reflektivität. Die gelernte Korrektur bildet Orts-, aber keine Wetterlagen-Effekte ab; ' +
          'die Intensitätsabhängigkeit ist in der Flächenkarte nicht aufgelöst. In milder Tieflandsluft existiert ' +
          'schlicht keine Null-Linie — dann zeigt die Karte keine Grenze, weil überall Regen fällt, statt eine Linie ' +
          'an den Kartenrand zu legen. Und weil 300 Höhenmeter über Pulverschnee oder Regen entscheiden können, ist ' +
          'die Angabe als Richtwert zu lesen, nicht als Garantie für einen bestimmten Ort.</p>',
      },
    ],
    faqs: [
      { q: 'Was ist die Schneefallgrenze?', a: 'Die Höhe, unterhalb derer Niederschlag als Regen und oberhalb als Schnee fällt. Sie liegt typischerweise einige hundert Meter unter dem 0-°C-Niveau der Atmosphäre und ist in Wirklichkeit ein Übergangsband mit Schneeregen, keine scharfe Linie.' },
      { q: 'Warum liegt die Schneefallgrenze unter der Nullgradgrenze?', a: 'Weil fallender Schnee beim Schmelzen Energie verbraucht und die Luft dabei abkühlt. Dadurch reicht Schneefall oft mehrere hundert Meter unter das 0-°C-Niveau hinab, besonders bei kräftigem Niederschlag und in trockener Luft.' },
      { q: 'Warum zeigt die Karte manchmal gar keine Schneefallgrenze?', a: 'Weil in milder Tieflandsluft keine Null-Linie existiert: Es fällt überall Regen. buscosun zeichnet dann bewusst keine Linie, statt eine Grenze an den Kartenrand zu schieben und damit eine Aussage vorzutäuschen, die die Daten nicht hergeben.' },
      { q: 'Wie genau ist die Schneefallgrenze in buscosun?', a: 'Sie stammt aus dem ICON-D2-Modell mit 2,2 km Gitterweite, höhenkorrigiert auf das Geländemodell, mit einer aus DWD-Stationen gelernten Orts-Korrektur. Kleinräumige Effekte wie Kaltluftseen in engen Tälern und die Abhängigkeit von der Niederschlagsintensität bildet die Flächenkarte nicht ab.' },
    ],
    sources: [
      { name: 'DWD Wetterlexikon', url: 'https://www.dwd.de/DE/service/lexikon/lexikon_node.html' },
      { name: 'DWD Open Data (ICON-D2)', url: 'https://opendata.dwd.de/' },
    ],
    relatedExplainers: ['foehn', 'temperaturinversion', 'hoehenkorrektur-lapse-rate', 'nebel-hochnebel-nebelobergrenze'],
    relatedPlaces: ['davos', 'zermatt', 'sankt-anton-am-arlberg', 'innsbruck', 'oberstdorf'],
    datePublished: PUBLISHED, dateModified: MODIFIED_E4,
  },
  {
    slug: 'gewitter-unwetter',
    title: 'Gewitter & Unwetter',
    h1: 'Gewitter und Unwetter: Entstehung und Gefahren',
    status: 'full',
    answer:
      'Gewitter entstehen, wenn feuchtwarme Luft rasch aufsteigt, kondensiert und hochreichende Quellwolken ' +
      'bildet. In ihnen entladen sich Blitze; begleitend treten Starkregen, Hagel und Sturmböen auf. Unwetter ' +
      'sind Gewitter oder Wetterlagen, die Schwellen für Gefahr überschreiten. Amtliche Unwetterwarnungen gibt ' +
      'ausschließlich der Wetterdienst heraus.',
    sections: [
      {
        id: 'zutaten',
        h2: 'Die drei Zutaten eines Gewitters',
        html:
          '<p>Ein Gewitter braucht immer dasselbe Rezept: <strong>Feuchte</strong> in den unteren Schichten, eine ' +
          '<strong>labile Schichtung</strong>, in der aufsteigende Luft wärmer bleibt als ihre Umgebung, und einen ' +
          '<strong>Auslöser</strong>, der die Luft in Gang bringt — Sonneneinstrahlung über einem Berghang, eine ' +
          'Kaltfront, konvergierende Winde. Fehlt eine der drei, passiert nichts.</p>' +
          '<p>Ist alles beisammen, steigt feuchtwarme Luft rasch auf, kondensiert und baut eine hochreichende ' +
          'Quellwolke auf, die bis zur Tropopause reichen und dort den typischen Amboss ausbilden kann. In ihrem ' +
          'Inneren reiben Eiskristalle und Graupel aneinander, trennen elektrische Ladungen und entladen sie als ' +
          'Blitz. Der zugehörige Wärmeschlag der Luft ist der Donner. Der Antrieb der Zelle ist der ' +
          '<a href="/wissen/thermik/">thermische Aufwind</a>, gegen den ein Deckel wie eine ' +
          '<a href="/wissen/temperaturinversion/">Inversion</a> lange halten kann — bis er reißt.</p>',
      },
      {
        id: 'gefahren',
        h2: 'Woraus die Gefahr entsteht',
        html:
          '<ul>' +
          '<li><strong>Blitzschlag</strong>: die unmittelbarste Gefahr, besonders im freien Gelände, auf Graten, auf ' +
          'dem Wasser und unter einzeln stehenden Bäumen.</li>' +
          '<li><strong>Starkregen</strong>: langsam ziehende Zellen können in kurzer Zeit große Mengen abladen; die ' +
          'Folge sind überflutete Unterführungen, Sturzfluten und Hangrutsche.</li>' +
          '<li><strong>Hagel</strong>: kräftige Aufwinde halten Eiskörner in der Schwebe, bis sie schwer genug sind. ' +
          'Größere Körner beschädigen Fahrzeuge, Dächer und Kulturen.</li>' +
          '<li><strong>Sturmböen und Downbursts</strong>: absinkende, durch Verdunstung gekühlte Luft breitet sich am ' +
          'Boden als Böenfront aus — oft am Rand der Zelle und weit vor dem Regen (siehe ' +
          '<a href="/wissen/windboeen-sturm/">Windböen &amp; Sturm</a>).</li>' +
          '<li><strong>Rotierende Gewitter</strong>: bei starker Windscherung kann sich der Aufwind organisieren und ' +
          'länger bestehen. Solche Lagen sind selten, gelten aber als besonders unwetterträchtig.</li>' +
          '</ul>',
      },
      {
        id: 'buscosun',
        h2: 'So zeigt es buscosun',
        html:
          '<p>Der Layer <a href="/wetterkarte/gewitter">Gewitterpotenzial</a> fasst drei ICON-D2-Felder zu einem ' +
          'Index von 0 bis 100 zusammen: die verfügbare Auftriebsenergie (<code>cape_ml</code>), den Deckel ' +
          '(<code>cin_ml</code>) und die Blitzbereitschaft des Modells (<code>lpi</code>). Die Stufen heißen keine, ' +
          'gering, erhöht, deutlich und hoch; unter Wert 8 bleibt die Fläche transparent. Der Layer rechnet mit ' +
          '2,2 km Gitterweite bis <strong>12 Stunden voraus</strong> für DE, AT und CH — und sagt ausdrücklich: ' +
          '<strong>Potenzial ist nicht Auslösung.</strong> Hohes CAPE allein ist noch kein Gewitter.</p>' +
          '<p>Daneben stehen die Messung und die Zugbahn. <a href="/wetterkarte/blitze">Blitze</a> zeigt die ' +
          'gemessenen Einschläge der letzten 60 Minuten aus dem DWD-Blitzortungsnetz, ' +
          '<a href="/wetterkarte/blitzprognose">Blitzprognose</a> das Potenzial bis 12 Stunden voraus. ' +
          '<a href="/wetterkarte/zellbahnen">Zellbahnen</a> übernimmt für Deutschland das amtliche Objektprodukt ' +
          'KONRAD3D: gemessener Zellumriss, prognostizierte Spur bis +60 Minuten im Fünf-Minuten-Takt, dazu die ' +
          'amtliche Unsicherheitsellipse und Hinweise auf Hagel, Böen oder Starkregen in der Zelle. Für rotierende ' +
          'Strukturen gibt es einen bewusst konservativen Experten-Layer, der Modell-Verdacht ausweist und über ein ' +
          '5×5-Mittel geglättet wird, damit ein einzelnes Pixel keine falsche Präzision suggeriert.</p>',
      },
      {
        id: 'warnungen',
        h2: 'Was buscosun ausdrücklich nicht tut',
        html:
          '<p>buscosun gibt <strong>keine amtlichen Warnungen heraus</strong>. Maßgeblich bleiben der Deutsche ' +
          'Wetterdienst, GeoSphere Austria und MeteoSchweiz. Der Layer ' +
          '<a href="/warnungen">Amtliche Warnungen</a> gibt deren Texte <strong>wörtlich</strong> wieder — sie werden ' +
          'nicht zusammengefasst, nicht umformuliert, nicht verschärft und nicht abgeschwächt. Für Österreich fehlt ' +
          'dort weiterhin eine offene amtliche Quelle; das steht auf der Karte, statt kaschiert zu werden.</p>' +
          '<p>Auch die abgeleiteten Layer sind kein Warnprodukt: Der Rotations-Layer benennt einen Verdacht, kein ' +
          'Ereignis, und hat eine hohe Fehlalarmrate. Die Hinweise in den Zellbahnen sind als Hinweis formuliert, ' +
          'nicht als Zusage. Wer eine verbindliche Entscheidung treffen muss, liest die amtliche Warnung — buscosun ' +
          'liefert den Kontext davor und daneben.</p>',
      },
    ],
    faqs: [
      { q: 'Wie entsteht ein Gewitter?', a: 'Aus feuchter Luft, labiler Schichtung und einem Auslöser: Rasch aufsteigende feuchtwarme Luft kondensiert und bildet eine hochreichende Gewitterwolke. In ihr trennen sich durch Reibung von Eis und Graupel elektrische Ladungen, die sich als Blitze entladen.' },
      { q: 'Gibt buscosun amtliche Unwetterwarnungen heraus?', a: 'Nein. buscosun zeigt den meteorologischen Kontext und gibt amtliche Warnungen ausschließlich als wörtliches Zitat wieder. Verbindliche Warnungen geben allein die staatlichen Wetterdienste heraus — DWD, GeoSphere Austria und MeteoSchweiz.' },
      { q: 'Was bedeutet Gewitterpotenzial 0 bis 100?', a: 'Es ist ein aus ICON-D2 abgeleiteter Index aus Auftriebsenergie, Deckelung und Blitzbereitschaft, gestuft in keine, gering, erhöht, deutlich und hoch. Er beschreibt, wie günstig die Zutaten sind — nicht, dass ein Gewitter tatsächlich ausgelöst wird.' },
      { q: 'Wie weit voraus kann man Gewitter vorhersagen?', a: 'Die Zugbahn einer bestehenden Zelle lässt sich etwa eine Stunde voraus extrapolieren, das Gewitterpotenzial rechnet buscosun bis zwölf Stunden voraus. Ob und wo genau eine Zelle entsteht, ist auch am selben Tag oft nicht auf den Ort genau vorhersagbar.' },
    ],
    sources: [
      { name: 'DWD Wetterlexikon', url: 'https://www.dwd.de/DE/service/lexikon/lexikon_node.html' },
      { name: 'DWD: Warnkriterien', url: 'https://www.dwd.de/DE/wetter/warnungen_aktuell/kriterien/warnkriterien.html' },
      { name: 'DWD Open Data (ICON-D2, KONRAD3D)', url: 'https://opendata.dwd.de/' },
    ],
    relatedExplainers: ['thermik', 'windboeen-sturm', 'modellvergleich-unsicherheit', 'temperaturinversion'],
    relatedPlaces: ['muenchen', 'wien', 'zuerich', 'salzburg', 'stuttgart'],
    datePublished: PUBLISHED, dateModified: MODIFIED_E4,
  },
  {
    slug: 'biowetter',
    title: 'Biowetter',
    h1: 'Biowetter: wie Wetter den Körper beeinflusst',
    status: 'full',
    answer:
      'Biowetter beschreibt den Einfluss von Wetter und Wetterwechseln auf das Befinden. Rasche Luftdruck- und ' +
      'Temperaturänderungen, Föhnlagen oder schwüle Hitze können Kopfschmerz, Kreislaufbeschwerden oder ' +
      'Schlafstörungen begünstigen. Die Zusammenhänge sind individuell verschieden und wissenschaftlich nur ' +
      'teilweise belegt; das Biowetter ist daher ein Anhaltspunkt, keine medizinische Vorhersage.',
    sections: [
      {
        id: 'begriff',
        h2: 'Was mit Biowetter gemeint ist',
        html:
          '<p>„Biowetter" ist ein Sammelbegriff für die Wirkung von Wetter und Wetterwechseln auf das menschliche ' +
          'Befinden. Unterschieden wird meist zwischen <strong>Wetterreaktion</strong> (jeder Mensch reagiert auf ' +
          'Hitze, Kälte oder Schwüle), <strong>Wetterfühligkeit</strong> (verstärkte Reaktion auf Wetterwechsel bei ' +
          'ansonsten Gesunden) und <strong>Wetterempfindlichkeit</strong> (Wetterwechsel verschlimmern eine ' +
          'bestehende Erkrankung, etwa Narben-, Rheuma- oder Kopfschmerzen).</p>' +
          '<p>Die Datenlage dazu ist dünner, als die Popularität des Begriffs vermuten lässt. Zusammenhänge sind ' +
          'individuell sehr verschieden, die Studienergebnisse uneinheitlich, und ein sauberer Wirkmechanismus ist ' +
          'für die meisten berichteten Beschwerden nicht belegt. Biowetter-Angaben sind deshalb ein Anhaltspunkt — ' +
          '<strong>keine Diagnose, keine Prognose und kein medizinischer Rat</strong>.</p>',
      },
      {
        id: 'reize',
        h2: 'Welche Wetterreize typischerweise genannt werden',
        html:
          '<ul>' +
          '<li><strong>Föhnlagen</strong>: rascher Temperaturanstieg, Feuchteeinbruch und böiger Wind gelten als ' +
          'klassischer Auslöser für Kopfschmerz und Unruhe — mehr dazu unter <a href="/wissen/foehn/">Föhn</a>.</li>' +
          '<li><strong>Hitze und Schwüle</strong>: hohe Temperatur zusammen mit hoher Luftfeuchte erschwert die ' +
          'Wärmeabgabe und belastet den Kreislauf; Tropennächte verhindern die nächtliche Erholung.</li>' +
          '<li><strong>Rasche Luftdruckänderungen</strong>, meist beim Durchzug von Fronten.</li>' +
          '<li><strong>Kaltlufteinbrüche</strong> mit deutlichem Temperatursturz.</li>' +
          '<li><strong>Reizarme Hochdrucklagen</strong> mit Hochnebel unter einer ' +
          '<a href="/wissen/temperaturinversion/">Inversion</a>: wenig Licht, angereicherte Schadstoffe, gedrückte ' +
          'Stimmung.</li>' +
          '<li><strong>UV und Pollen</strong>: keine Wetterfühligkeit im engeren Sinn, aber die beiden Größen mit ' +
          'der klarsten gesundheitlichen Relevanz — und mit amtlichen Produkten dahinter.</li>' +
          '</ul>',
      },
      {
        id: 'buscosun',
        h2: 'So zeigt es buscosun — und was fehlt',
        html:
          '<p><strong>buscosun hat keinen Biowetter-Index.</strong> Es gibt keine Kopfschmerz-, Migräne-, Rheuma- ' +
          'oder Kreislaufvorhersage, keine Bewertung in Stufen wie „hohe Belastung", und es wird auch keine geben, ' +
          'solange dafür keine belastbare Grundlage existiert. Statt einer solchen Zahl zeigt die ' +
          '<a href="/vorhersage">Vorhersage</a> die Größen, aus denen sich jeder selbst ein Bild machen kann.</p>' +
          '<ul>' +
          '<li><strong>UV-Index</strong>: Für Deutschland stammt er vom DWD, der ein Tagesmaximum für 38 ' +
          'Vorhersageorte auf der ganzzahligen WHO-Skala 0 bis 11+ veröffentlicht; buscosun verteilt diesen ' +
          'Tagespeak über den Sonnenstand auf die Stunden. Für <strong>Österreich und die Schweiz gibt es keinen ' +
          'offenen amtlichen UV-Feed</strong> — dort wird der Wert über ein Klarhimmel-Modell mit Höhen- und ' +
          'Wolkenfaktor geschätzt und ausdrücklich als Schätzung gekennzeichnet.</li>' +
          '<li><strong>Pollen</strong>: Für Deutschland kommt der Pollenflug-Gefahrenindex des DWD für acht Arten — ' +
          'Hasel, Erle, Esche, Birke, Gräser, Roggen, Beifuß und Ambrosia — auf der Skala 0 bis 6. Für ' +
          '<strong>Österreich und die Schweiz gibt es keinen offenen amtlichen Pollen-Feed</strong>; dort lässt sich ' +
          'auf ausdrücklichen Knopfdruck eine externe Quelle (Open-Meteo/CAMS, sechs Arten) zuschalten. Deutsche ' +
          'Werte werden nicht über die Grenze übertragen.</li>' +
          '<li><strong>Föhnlage</strong>: eine transparente Heuristik aus Windrichtung, Windstärke, Böigkeit und ' +
          'Luftfeuchte kennzeichnet Föhnverdacht und nennt die Gründe im Klartext. Die Schichtung dahinter zeigt die ' +
          'Linse <a href="/atmosphaere/berg-und-weg">Föhn, Berg &amp; Weg</a>.</li>' +
          '</ul>',
      },
      {
        id: 'grenzen',
        h2: 'Ehrliche Einordnung',
        html:
          '<p>Wer wetterempfindlich ist, kennt seine Auslöser meist besser als jedes Modell. Sinnvoll ist deshalb ' +
          'der Blick auf die konkreten Größen — Temperatursprung, Böigkeit, Schwüle, UV, Pollen — statt auf eine ' +
          'zusammengefasste Zahl, die Verschiedenes vermengt. Bei anhaltenden Beschwerden ist die ärztliche ' +
          'Abklärung der richtige Weg; Wetterdaten ersetzen sie nicht. Amtliche Hitzewarnungen und den ' +
          'Pollenflug-Gefahrenindex gibt in Deutschland der DWD heraus, nicht buscosun.</p>',
      },
    ],
    faqs: [
      { q: 'Was ist Biowetter?', a: 'Ein Sammelbegriff für die Wirkung von Wetterelementen und Wetterwechseln auf das menschliche Befinden — etwa bei Föhn, Hitze, Schwüle oder raschen Luftdruckänderungen. Unterschieden werden Wetterreaktion, Wetterfühligkeit und Wetterempfindlichkeit bei bestehenden Erkrankungen.' },
      { q: 'Ist Wetterfühligkeit wissenschaftlich belegt?', a: 'Nur teilweise. Zusammenhänge zwischen Wetterwechseln und Beschwerden sind individuell sehr verschieden, die Studienlage ist uneinheitlich und ein klarer Wirkmechanismus fehlt meist. Biowetter-Angaben sind ein Anhaltspunkt, kein medizinischer Rat und keine Diagnose.' },
      { q: 'Hat buscosun eine Biowetter-Vorhersage?', a: 'Nein. Es gibt bewusst keinen Biowetter-Index und keine Beschwerde-Prognose. buscosun zeigt stattdessen die zugrunde liegenden Größen: UV-Index, Pollenflug, Föhnverdacht, Temperatur- und Böenverlauf — damit jeder seine eigenen Auslöser einordnen kann.' },
      { q: 'Warum fehlen Pollen- und UV-Werte für Österreich und die Schweiz?', a: 'Weil es dort keinen offenen amtlichen Feed gibt: Der DWD veröffentlicht UV-Index und Pollenflug-Gefahrenindex nur für Deutschland. buscosun schätzt UV für AT und CH über ein Klarhimmel-Modell und bietet Pollen nur als ausdrücklich zugeschaltete externe Quelle an.' },
    ],
    sources: [
      { name: 'DWD: Gesundheit und Biowetter', url: 'https://www.dwd.de/DE/leistungen/gesundheit/gesundheit.html' },
      { name: 'Bundesamt für Strahlenschutz: UV-Index', url: 'https://www.bfs.de/DE/themen/opt/uv/uv-index/uv-index_node.html' },
      { name: 'DWD Wetterlexikon', url: 'https://www.dwd.de/DE/service/lexikon/lexikon_node.html' },
    ],
    relatedExplainers: ['foehn', 'temperaturinversion', 'nebel-hochnebel-nebelobergrenze', 'gewitter-unwetter'],
    relatedPlaces: ['berlin', 'wien', 'zuerich', 'muenchen', 'innsbruck'],
    datePublished: PUBLISHED, dateModified: MODIFIED_E4,
  },
  {
    slug: 'hoehenkorrektur-lapse-rate',
    title: 'Höhenkorrektur & Lapse-Rate',
    h1: 'Höhenkorrektur: warum die Temperatur mit der Höhe sinkt',
    status: 'full',
    answer:
      'Die Temperatur nimmt mit der Höhe im Mittel um etwa 0,65 °C je 100 Meter ab — diese Rate heißt Lapse-Rate. ' +
      'Weil Wettermodelle ein grobes Geländeraster nutzen, weicht ihre Modellhöhe oft von der echten Ortshöhe ab. ' +
      'buscosun korrigiert die Temperatur über ein digitales Geländemodell und eine ortsabhängige Lapse-Rate auf ' +
      'die tatsächliche Höhe.',
    sections: [
      {
        id: 'physik',
        h2: 'Warum die Temperatur mit der Höhe sinkt',
        html:
          '<p>Luft, die aufsteigt, gerät in Bereiche geringeren Drucks, dehnt sich aus und kühlt dabei ab — ohne dass ' +
          'ihr Wärme entzogen würde. Trockene Luft verliert auf diesem Weg rund <strong>1 °C je 100 Meter</strong> ' +
          '(trockenadiabatisch). Sobald Wolken entstehen, wird bei der Kondensation Wärme frei; die Abkühlung ' +
          'verlangsamt sich auf etwa <strong>0,5 bis 0,6 °C je 100 Meter</strong> (feuchtadiabatisch).</p>' +
          '<p>Der Mittelwert dazwischen — die <strong>Standard-Lapse-Rate von 0,65 °C je 100 Metern</strong> ' +
          'beziehungsweise 6,5 K je Kilometer — beschreibt die reale Atmosphäre im Durchschnitt gut. Sie ist aber ' +
          'genau das: ein Durchschnitt. Je nach Luftmasse und Schichtung schwankt die tatsächliche Rate etwa zwischen ' +
          '3 und 10 K je Kilometer, und bei einer <a href="/wissen/temperaturinversion/">Inversion</a> dreht sich das ' +
          'Vorzeichen sogar um.</p>',
      },
      {
        id: 'problem',
        h2: 'Warum Wettermodelle eine Korrektur brauchen',
        html:
          '<p>Ein Wettermodell wie ICON-D2 rechnet auf einem Gitter von <strong>2,2 Kilometern</strong>. Seine ' +
          'Modelloberfläche ist eine geglättete Landschaft: Ein 2500 Meter hoher Gipfel und das 700 Meter tiefe Tal ' +
          'daneben können sich eine Gitterzelle auf 1400 Metern teilen. Die Modelltemperatur gilt dann für diese ' +
          'Zwischenhöhe — für den Gipfel ist sie zu warm, für das Tal zu kalt.</p>' +
          '<p>Bei 6,5 K je Kilometer sind das im genannten Beispiel rund 7 Grad Fehler nach oben und 4,5 Grad nach ' +
          'unten. Genau daher stammt der Eindruck, Wetter-Apps lägen im Gebirge regelmäßig daneben: Sie zeigen die ' +
          'Temperatur einer Landschaft, die es so nicht gibt.</p>',
      },
      {
        id: 'buscosun',
        h2: 'So rechnet buscosun',
        html:
          '<p>Unter jedes Modellpixel legt buscosun ein digitales Geländemodell (Terrarium-Höhenkacheln, rund ' +
          '<strong>30 Meter</strong> Auflösung im DACH-Raum). Die Modellhöhe (Feld <code>hsurf</code>) reist in ' +
          'derselben Textur mit wie die Temperatur, und der Shader rechnet je Bildpunkt ' +
          '<strong>T<sub>korr</sub> = T<sub>modell</sub> − γ · (h<sub>gelände</sub> − h<sub>modell</sub>)</strong> ' +
          'mit γ = 6,5 K/km. Die Ortslabels auf der <a href="/wetterkarte/temperatur">Temperaturkarte</a> nutzen ' +
          'exakt dieselbe Arithmetik — was am Label steht, ist der Wert der Fläche darunter.</p>' +
          '<p>Für einen einzelnen Ort geht der Punktforecast einen Schritt weiter: Aus den nächstgelegenen ' +
          'Messstationen (DWD, TAWES, SMN) wird die Lapse-Rate per Regression <strong>geschätzt</strong> statt fest ' +
          'angenommen; liefert der Stationssatz keine belastbare Steigung, greift der Standardwert 0,0065 K/m. ' +
          'Dieselbe Korrektur steckt in der <a href="/wissen/schneefallgrenze/">Schneefallgrenze</a>, im Tal/Grat-Vergleich ' +
          'des Regenradars und in der <a href="/tourenplanung">Tourenplanung</a>, die ihre Wetterpunkte zusätzlich in ' +
          'Höhenbändern von 300 Metern bündelt — ohne diese Bänderung lagen Talwerte im Test bis zu 4 °C zu kalt. Die ' +
          'ausführliche Herleitung steht unter <a href="/methodik/hoehenkorrektur/">Methodik: Höhenkorrektur</a>.</p>',
      },
      {
        id: 'grenzen',
        h2: 'Wo die Korrektur an ihre Grenze kommt',
        html:
          '<p>Eine Lapse-Rate ist ein Mittelwert, und bei einer Inversion — Kaltluftsee im Tal, Sonne am Berg — kehrt ' +
          'sich das Verhältnis um; die Flächenkarte kann das Tal dann zu warm zeigen. Das Geländemodell kennt weder ' +
          'Gebäude noch Bewuchs, der städtische Wärmeinseleffekt steckt nicht darin. Korrigiert wird ausschließlich ' +
          'die <strong>Temperatur</strong>, nicht der Wind: Düsen und Kuppen unterhalb der Gitterweite bleiben ' +
          'geglättet. Und das Ergebnis bleibt ein Modellwert; die Messung daneben zeigt der Stationslayer.</p>',
      },
    ],
    faqs: [
      { q: 'Was ist die Lapse-Rate?', a: 'Die Abnahme der Lufttemperatur mit der Höhe. In der freien Atmosphäre beträgt sie im Mittel rund 0,65 °C je 100 Meter, schwankt aber je nach Luftmasse und Schichtung etwa zwischen 3 und 10 K je Kilometer — und kehrt sich bei Inversionen sogar um.' },
      { q: 'Warum ist eine Höhenkorrektur nötig?', a: 'Weil das Geländeraster der Wettermodelle gröber ist als die echte Topografie. Bei 2,2 Kilometern Gitterweite kann die Modellhöhe im Gebirge um hunderte Meter von der echten Höhe abweichen, was ohne Korrektur zu Fehlern von mehreren Grad führt.' },
      { q: 'Welche Lapse-Rate nutzt buscosun?', a: 'Auf der Karte fest 6,5 K je Kilometer, angewandt auf die Differenz zwischen dem digitalen Geländemodell und der Modellhöhe. Im Punktforecast wird die Rate zusätzlich aus den umliegenden Messstationen geschätzt, mit 6,5 K/km als Rückfallwert.' },
      { q: 'Warum ist es im Tal manchmal trotzdem kälter als angezeigt?', a: 'Weil eine Lapse-Rate keine Inversion abbilden kann. Sammelt sich in einer klaren Nacht Kaltluft im Tal, ist es unten kälter als die Rechnung ergibt. Solche Lagen zeigt die Atmosphäre-Ansicht mit Inversionshöhe und Nebelobergrenze.' },
    ],
    sources: [
      { name: 'DWD Wetterlexikon', url: 'https://www.dwd.de/DE/service/lexikon/lexikon_node.html' },
      { name: 'DWD: numerische Wettervorhersage', url: 'https://www.dwd.de/DE/forschung/wettervorhersage/wettervorhersage_node.html' },
    ],
    relatedExplainers: ['temperaturinversion', 'schneefallgrenze', 'modellvergleich-unsicherheit', 'foehn'],
    relatedPlaces: ['zermatt', 'davos', 'garmisch-partenkirchen', 'innsbruck', 'brocken'],
    datePublished: PUBLISHED, dateModified: MODIFIED_E4,
  },
  {
    slug: 'modellvergleich-unsicherheit',
    title: 'Modellvergleich & Unsicherheit',
    h1: 'Wettermodelle vergleichen: Unsicherheit ehrlich lesen',
    status: 'full',
    answer:
      'Verschiedene Wettermodelle wie ICON-D2, MOSMIX und ICON-EU rechnen mit unterschiedlicher Auflösung und ' +
      'Physik und liefern daher leicht abweichende Vorhersagen. Die Streuung zwischen ihnen ist ein ehrliches Maß ' +
      'für die Unsicherheit: Liegen sie eng beieinander, ist die Prognose verlässlicher; driften sie auseinander, ' +
      'ist Vorsicht geboten. buscosun zeigt diesen Spread statt einer Scheingenauigkeit.',
    sections: [
      {
        id: 'warum',
        h2: 'Warum Modelle auseinanderlaufen',
        html:
          '<p>Ein Wettermodell startet mit einem Bild der Atmosphäre, das nie vollständig ist: Messungen sind ' +
          'lückenhaft, und zwischen zwei Gitterpunkten muss interpoliert werden. Winzige Unterschiede in diesen ' +
          'Anfangsbedingungen wachsen mit jedem Rechenschritt — das ist die praktische Folge der ' +
          '<strong>chaotischen Dynamik</strong> der Atmosphäre. Dazu kommen unterschiedliche Gitterweiten und ' +
          'unterschiedliche Annahmen für alles, was feiner ist als das Gitter: Konvektion, Wolkenphysik, Reibung am ' +
          'Boden.</p>' +
          '<p>Deshalb ist die interessante Frage nie „welches Modell hat recht", sondern <strong>wie weit die ' +
          'Modelle auseinanderliegen</strong>. Liegen sie eng beieinander, ist die Wetterlage gut bestimmt. Driften ' +
          'sie auseinander, ist die Lage offen — und eine einzelne Zahl mit Nachkommastelle wäre eine ' +
          'Scheingenauigkeit.</p>',
      },
      {
        id: 'lesen',
        h2: 'Unsicherheit richtig lesen',
        html:
          '<ul>' +
          '<li><strong>Spread</strong> ist die Streuung zwischen den Quellen zu einem Zeitpunkt — das direkteste Maß ' +
          'für Unsicherheit.</li>' +
          '<li><strong>Stabilität</strong> beschreibt, ob sich die Vorhersage von Lauf zu Lauf ändert. Wichtig: ' +
          '<strong>Stabil heißt nicht automatisch richtig</strong> — alle Läufe können denselben Fehler ' +
          'wiederholen.</li>' +
          '<li><strong>Einigkeit ist kein Beweis.</strong> Fünf Modelle sind kein Ensemble; sie teilen ähnliche ' +
          'Beobachtungsdaten und können sich gemeinsam irren.</li>' +
          '<li><strong>Vorlaufzeit</strong> zählt immer mit: Selbst ein zufällig enges Bündel wird mit jedem ' +
          'Vorhersagetag unsicherer.</li>' +
          '<li><strong>Variablen verhalten sich verschieden</strong>: Temperatur ist am längsten belastbar, ' +
          'Niederschlag verliert am schnellsten an Aussagekraft — besonders bei ' +
          '<a href="/wissen/gewitter-unwetter/">konvektiven Lagen</a>.</li>' +
          '</ul>',
      },
      {
        id: 'buscosun',
        h2: 'So zeigt es buscosun',
        html:
          '<p>Die <a href="/vorhersage">Vorhersage-Seite</a> stellt fünf unabhängige Modelle nebeneinander: ICON ' +
          '(DWD), ECMWF, GFS (NOAA), GEM (Kanada) und Météo-France, dazu die Läufe der letzten Tage als Ghost-Linien. ' +
          'Die Linie zeigt den Konsens, das Band den Spread. Ein Konfidenz-Score je Tag entsteht aus dieser Streuung ' +
          'und der Vorlaufzeit und wird in drei Stufen ausgewiesen: <strong>hohe Sicherheit ab 70 %, mittlere ab ' +
          '40 %, darunter niedrige</strong>. Als Faustzahl gilt eine Temperatur-Streuung von 0,6 °C als scharf und ' +
          '4 °C als unsicher; die Einigkeitsanzeige stuft bis 1,2 °C als hoch und bis 2,8 °C als gemischt ein, beim ' +
          'Wind bei 5 und 12 km/h.</p>' +
          '<p>Der Rückblick prüft die eigene Arbeit nach: Über die letzten 30 Tage vergleicht buscosun Vorhersagen ' +
          'mit einem und drei Tagen Vorlauf gegen das eingetretene Wetter — als mittlere absolute Abweichung für ' +
          'Temperatur und Wind, als Ja/Nein-Treffer für Regen. Dabei wird ausdrücklich gesagt, dass die Referenz der ' +
          '<strong>Konsens der Modell-Analysen</strong> ist und nicht eine Stationsmessung; die Reihung der Quellen ' +
          'ist damit belastbar, die absoluten Werte sind eine Untergrenze. Als Fläche zeigt der Layer ' +
          '<a href="/wetterkarte/sicherheit">Vorhersage-Sicherheit</a>, wo es unsicher ist, und ' +
          '<a href="/validierung">Validierung</a> rechnet die Kalibrierung des Regen-Nowcasts live gegen das später ' +
          'beobachtete Radar nach. Die Details stehen unter ' +
          '<a href="/methodik/konfidenz-und-trefferquote/">Methodik: Konfidenz und Trefferquote</a>.</p>',
      },
      {
        id: 'grenzen',
        h2: 'Grenzen dieser Betrachtung',
        html:
          '<p>Der Modellvergleich misst <strong>Einigkeit, nicht Wahrheit</strong>. Er kann nicht erkennen, wenn alle ' +
          'Quellen denselben systematischen Fehler tragen, und er ersetzt kein echtes Ensemble mit gestörten ' +
          'Anfangsbedingungen. Die Trefferquote nutzt Analysen als Referenz, keine Messwerte, und braucht eine ' +
          'Mindest-Datenbasis, bevor sie überhaupt eine Reihung zeigt. Auch „Regen" ist eine Definition und keine ' +
          'Naturkonstante: buscosun zählt eine Tagessumme ab 1 mm als nennenswerten Niederschlag — überall in der ' +
          'App gleich. Alle Aussagen bleiben Wahrscheinlichkeiten.</p>',
      },
    ],
    faqs: [
      { q: 'Warum unterscheiden sich Wettermodelle?', a: 'Sie nutzen unterschiedliche Gitterweiten, Startdaten und physikalische Annahmen für alles, was feiner als das Gitter ist. Kleine Unterschiede in den Anfangsbedingungen verstärken sich mit jedem Rechenschritt — die Atmosphäre verhält sich chaotisch.' },
      { q: 'Was sagt der Modell-Spread aus?', a: 'Die Streuung zwischen den Modellen ist ein Maß für die Vorhersageunsicherheit. Geringer Spread bedeutet, dass die Wetterlage gut bestimmt ist; großer Spread mahnt zur Vorsicht und spricht dafür, eine Entscheidung noch offen zu halten.' },
      { q: 'Heißt eine stabile Vorhersage, dass sie stimmt?', a: 'Nein. Stabilität beschreibt nur, dass sich die Vorhersage von Lauf zu Lauf kaum ändert. Alle Läufe können denselben Fehler wiederholen. buscosun weist Stabilität und Trefferquote deshalb getrennt aus und sagt das ausdrücklich dazu.' },
      { q: 'Welche Modelle vergleicht buscosun?', a: 'Fünf unabhängige Modelle mit DACH-Abdeckung: ICON vom DWD, ECMWF, GFS von der NOAA, GEM aus Kanada und Météo-France. Auf der Karte selbst ist ICON-D2 mit 2,2 Kilometern Gitterweite der Standard, ergänzt um die jeweiligen Landesradare.' },
    ],
    sources: [
      { name: 'DWD: numerische Wettervorhersage', url: 'https://www.dwd.de/DE/forschung/wettervorhersage/wettervorhersage_node.html' },
      { name: 'ECMWF: Forecasts and documentation', url: 'https://www.ecmwf.int/en/forecasts' },
      { name: 'DWD Wetterlexikon', url: 'https://www.dwd.de/DE/service/lexikon/lexikon_node.html' },
    ],
    relatedExplainers: ['hoehenkorrektur-lapse-rate', 'gewitter-unwetter', 'schneefallgrenze', 'windboeen-sturm'],
    relatedPlaces: ['berlin', 'hamburg', 'muenchen', 'wien', 'zuerich'],
    datePublished: PUBLISHED, dateModified: MODIFIED_E4,
  },
  {
    slug: 'windboeen-sturm',
    title: 'Windböen & Sturm',
    h1: 'Windböen und Sturm: Wind richtig einordnen',
    status: 'full',
    answer:
      'Eine Böe ist eine kurze, kräftige Windspitze, die den mittleren Wind deutlich übersteigt. Stürme werden ' +
      'nach der Beaufort-Skala eingeordnet: ab Windstärke 8 (rund 62 km/h) spricht man von Sturm, ab Stärke 12 ' +
      '(rund 118 km/h) von Orkan. Für Drohne, Kran oder Höhenarbeit zählen die Böenspitzen, nicht der Mittelwind.',
    sections: [
      {
        id: 'boee',
        h2: 'Mittelwind, Böe und warum der Unterschied zählt',
        html:
          '<p>Der <strong>Mittelwind</strong> ist der über ein Zeitintervall gemittelte Luftstrom — meist über zehn ' +
          'Minuten. Eine <strong>Böe</strong> ist eine kurze, kräftige Windspitze, die diesen Mittelwert deutlich ' +
          'übersteigt. Sie entsteht, wenn Turbulenz schnellere Luft aus der Höhe nach unten mischt, wenn Hindernisse ' +
          'die Strömung ablösen lassen oder wenn absinkende Kaltluft aus einem ' +
          '<a href="/wissen/gewitter-unwetter/">Gewitter</a> am Boden ausströmt.</p>' +
          '<p>Für Bauwerke, Kräne, Gerüste, Drohnen, Zelte und Bäume ist fast immer die <strong>Spitze</strong> ' +
          'entscheidend, nicht der Mittelwert: Es bricht nichts am Durchschnitt. Der Windschaden folgt zudem grob dem ' +
          'Quadrat der Geschwindigkeit — doppelte Windgeschwindigkeit bedeutet etwa vierfachen Staudruck.</p>',
      },
      {
        id: 'beaufort',
        h2: 'Die Beaufort-Skala als Einordnung',
        html:
          '<p>Die Beaufort-Skala übersetzt Windgeschwindigkeit in beobachtbare Wirkung. Die wichtigsten Marken:</p>' +
          '<ul>' +
          '<li><strong>Bft 6</strong> — starker Wind, ab rund 39 km/h: dicke Äste bewegen sich, Regenschirme werden ' +
          'schwer beherrschbar.</li>' +
          '<li><strong>Bft 8</strong> — Sturm, ab rund 62 km/h: Zweige brechen von Bäumen, Gehen im Freien wird ' +
          'deutlich erschwert.</li>' +
          '<li><strong>Bft 10</strong> — schwerer Sturm, ab rund 89 km/h: Bäume werden entwurzelt, Schäden an ' +
          'Gebäuden.</li>' +
          '<li><strong>Bft 12</strong> — Orkan, ab rund 118 km/h: schwere Verwüstungen.</li>' +
          '</ul>' +
          '<p>In Böen werden diese Schwellen deutlich früher erreicht als im Mittelwind — eine „Sturmböe" bei ' +
          'ansonsten mäßigem Wind ist der Normalfall, nicht die Ausnahme. Im Gebirge kommt der ' +
          '<a href="/wissen/foehn/">Föhn</a> hinzu, der in exponierten Tälern Sturmstärke erreichen kann.</p>',
      },
      {
        id: 'buscosun',
        h2: 'So zeigt es buscosun',
        html:
          '<p>Die <a href="/wetterkarte/boeen">Böenkarte</a> zeigt die erwartete Spitzenböe in 10 Metern Höhe als ' +
          'Fläche über DE, AT und CH. Grundlage ist das Feld <code>vmax_10m</code> aus ICON-D2 — die maximale ' +
          '10-Meter-Böe je Ausgabeintervall — mit <strong>2,2 km Gitterweite, stündlich, bis 24 Stunden voraus</strong>. ' +
          'Die Farbrampe deckt 0 bis 40 m/s ab und ist an Beaufort orientiert: Sie kippt bei etwa 17 m/s (Sturmböe) ' +
          'ins Warme, bei 25 m/s ins Rote und läuft bei 33 m/s in den Orkanbereich. Der Layer ' +
          '<a href="/wetterkarte/wind">Wind</a> zeigt daneben den Mittelwind aus denselben Modellläufen — die ' +
          'Böenkarte zeigt Spitzen, die Windkarte den Durchschnitt.</p>' +
          '<p>Wer auf einer bestimmten Arbeitshöhe unterwegs ist, findet im Go/No-Go-Modus des ' +
          '<a href="/atmosphaere/querschnitt">Vertikalschnitts</a> die passende Auswertung: Eine Arbeits- oder ' +
          'Flughöhe über Grund (Standard 120 m) und ein Böen-Grenzwert (Standard 40 km/h) werden vorgegeben, die ' +
          'Bodenböen über ein Potenzprofil <strong>v(z) = v<sub>10</sub> · (z/10)<sup>0,2</sup></strong> auf diese ' +
          'Höhe hochgerechnet und über 36 Stunden im 15-Minuten-Raster ausgewertet. Das Ergebnis ist ein GO oder ' +
          'NO-GO mit den Zeitfenstern, in denen der Grenzwert überschritten wird.</p>',
      },
      {
        id: 'grenzen',
        h2: 'Grenzen und amtliche Warnungen',
        html:
          '<p>2,2 Kilometer Gitterweite glätten Kuppen, Talausgänge und Straßenschluchten, in denen reale Böen ' +
          'deutlich höher liegen können; eine Höhenkorrektur bekommt die Böenkarte bewusst nicht, weil das Feld die ' +
          'Orografie schon enthält. Das Höhenprofil im Go/No-Go ist eine Standardannahme, kein gemessener Höhenwind — ' +
          'oberhalb von 1500 Metern über Grund sättigt es, und eine verbindliche Betriebsfreigabe ist es ' +
          'ausdrücklich nicht.</p>' +
          '<p>Vor allem: <strong>buscosun gibt keine Sturmwarnungen heraus.</strong> Amtliche Warnungen erscheinen im ' +
          'Layer <a href="/warnungen">Amtliche Warnungen</a> ausschließlich im Wortlaut des jeweiligen Dienstes — ' +
          'DWD und MeteoSchweiz —, ohne Zusammenfassung und ohne Umformulierung. Für Österreich fehlt dort weiterhin ' +
          'eine offene amtliche Quelle; die Böenkarte deckt AT trotzdem ab, weil ICON-D2 über die Grenze reicht.</p>',
      },
    ],
    faqs: [
      { q: 'Was ist der Unterschied zwischen Wind und Böe?', a: 'Der Wind ist der über ein Zeitintervall gemittelte Luftstrom, meist über zehn Minuten; eine Böe ist eine kurze Windspitze, die diesen Mittelwert deutlich übertrifft. Für Sicherheit am Bau, beim Drohnenflug oder beim Zeltaufbau sind die Böen entscheidend.' },
      { q: 'Ab wann spricht man von Sturm?', a: 'Nach der Beaufort-Skala ab Windstärke 8, also rund 62 km/h, von Sturm; ab Stärke 10 (rund 89 km/h) von schwerem Sturm und ab Stärke 12 (rund 118 km/h) von Orkan. In Böen werden diese Schwellen deutlich früher erreicht als im Mittelwind.' },
      { q: 'Wie weit voraus zeigt buscosun Böen?', a: 'Die Böenkarte deckt bis 24 Stunden voraus ab, stündlich und mit 2,2 Kilometern Gitterweite aus dem DWD-Modell ICON-D2. Der Go/No-Go-Check für eine gewählte Arbeitshöhe rechnet über 36 Stunden im 15-Minuten-Raster.' },
      { q: 'Warum ist der Wind auf dem Kran stärker als in der Vorhersage?', a: 'Weil Modelle den Wind in 10 Metern Höhe angeben und er mit der Höhe zunimmt. buscosun rechnet ihn im Go/No-Go über ein Potenzprofil auf die eingestellte Arbeitshöhe hoch — das bleibt eine Standardannahme und ersetzt keine Messung vor Ort.' },
    ],
    sources: [
      { name: 'DWD Wetterlexikon (Beaufort-Skala, Bö)', url: 'https://www.dwd.de/DE/service/lexikon/lexikon_node.html' },
      { name: 'DWD: Warnkriterien für Wind und Sturm', url: 'https://www.dwd.de/DE/wetter/warnungen_aktuell/kriterien/warnkriterien.html' },
    ],
    relatedExplainers: ['foehn', 'gewitter-unwetter', 'thermik', 'modellvergleich-unsicherheit'],
    relatedPlaces: ['sylt-westerland', 'cuxhaven', 'brocken', 'feldberg-schwarzwald', 'hamburg'],
    datePublished: PUBLISHED, dateModified: MODIFIED_E4,
  },
];

/** SEO/GEO 2026 (E5): Basis + neue Themen in EINER Liste — Hub, Sitemap, Feed und Verifier lesen nur diese. */
export const EXPLAINERS = [...EXPLAINERS_BASE, ...EXPLAINERS_EXTRA];

export const EXPLAINERS_BY_SLUG = Object.fromEntries(EXPLAINERS.map((e) => [e.slug, e]));
