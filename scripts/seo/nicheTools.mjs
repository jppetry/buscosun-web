/**
 * Funktionsseiten der Nischen Seewetter, Gletscher und Autobahnwetter (audit/seo-nischen.md). Build-only.
 *
 * Eigene Datei, weil `tools.mjs` schon fast 800 Zeilen trägt. Zahlen stehen mit Beleg im jeweiligen Audit
 * (`audit/seewetter.md`, `audit/wasserstand-bsh.md`, `audit/gletscher.md`, `audit/autobahnwetter.md`).
 * Keine Genauigkeitsbehauptung ohne Verifikationslauf: wo eine Abnahme rot ist, steht das im Text.
 */

const PUBLISHED = '2026-11-01';

export const SEA_TOOL = {
  slug: 'seewetter', title: 'Seewetter Nord- und Ostsee', h1: 'So liest du das Seewetter für Nord- und Ostsee',
  status: 'full', deepLink: '/seewetter',
  answer:
    'Die Seewetter-Ansicht von buscosun zeigt für die deutsche Nord- und Ostseeküste den Seegang mit Windsee und Dünung aus dem '
    + 'Küstenmodell des Deutschen Wetterdienstes, Wind und Böen an rund 60 Spots aus buscosun Fusion, den Wasserstand an den Pegeln des '
    + 'Bundesamts für Seeschifffahrt und Hydrographie (BSH) und den Seewetterbericht des DWD im Wortlaut. Sie ist kein amtliches '
    + 'Warnprodukt und gibt keine Sicherheitsbewertung für eine Ausfahrt.',
  bullets: [
    'Seegang: Wellenhöhe, Windsee und Dünung aus dem DWD-Küstenmodell CWAM',
    'Wind und Böen je Spot aus buscosun Fusion, nicht aus einer einzelnen Modellzelle',
    'Wasserstand: Kurve je BSH-Pegel, an der Nordsee zusätzlich Hoch- und Niedrigwasser mit Unsicherheit',
    'Seewetterbericht und Warnstatus des DWD im Wortlaut, nie umformuliert',
    'Abdeckung: deutsche Nord- und Ostseeküste, keine Binnenseen und kein Mittelmeer',
  ],
  sections: [
    {
      id: 'so-gehts', h2: "So geht's",
      html:
        '<ol><li><strong>Spot wählen.</strong> Auf der Karte oder über die Suche einen Spot antippen, zum Beispiel St. Peter-Ording oder Laboe. '
        + 'Jeder Spot hat einen eigenen Link, der sich teilen lässt.</li>'
        + '<li><strong>Stunde wählen.</strong> Das Stundenband zeigt Wind, Böe und Seegang über die kommenden Stunden.</li>'
        + '<li><strong>Seegang lesen.</strong> Windsee entsteht vor Ort, Dünung läuft von weiter her ein. Beide können aus verschiedenen Richtungen kommen; deshalb stehen sie getrennt da.</li>'
        + '<li><strong>Wasserstand prüfen.</strong> Der nächste Pegel zeigt die Vorhersagekurve des BSH mit Zeitstempel.</li>'
        + '<li><strong>Bericht lesen.</strong> Der Reiter Seegebiet zeigt den Seewetterbericht des DWD im Originaltext.</li></ol>',
    },
    {
      id: 'daten', h2: 'Datenquellen und Aktualisierung',
      html:
        '<ul><li><strong>Seegang:</strong> DWD-Küstenmodell CWAM. Ein neuer Lauf ist erst rund vier Stunden nach seiner Startzeit vollständig. '
        + 'Eine Zelle ohne Wasser im Modell zeigt „kein Seegang“ statt einer erfundenen Null.</li>'
        + '<li><strong>Wind und Böen:</strong> buscosun Fusion an den Spots. Das Modell wird nicht als Messung ausgegeben; Küstenstationen stehen getrennt daneben, wo es sie gibt.</li>'
        + '<li><strong>Wasserstand:</strong> <a href="https://gdi.bsh.de/ldproxy/rest/services/WaterLevelForecast">OGC API des BSH</a> (CC BY 4.0), mit dem Zeitstempel der Quelle. '
        + 'Die Vorhersage reicht je Pegel unterschiedlich weit, im Median rund 54 Stunden.</li>'
        + '<li><strong>Texte:</strong> Seewetterbericht und Warnstatus des DWD, unverändert. buscosun prüft alle 15 Minuten auf neue Ausgaben.</li></ul>'
        + '<p>Den Rechenweg beschreibt die <a href="/methodik/seewetter-quellen/">Methodik des Seewetters</a>.</p>',
    },
    {
      id: 'grenzen', h2: 'Was das Werkzeug nicht kann',
      html:
        '<ul><li><strong>Es warnt nicht.</strong> Wind- und Sturmwarnungen für die See gibt der <a href="https://www.dwd.de/DE/fachnutzer/schifffahrt/schifffahrt_node.html">Deutsche Wetterdienst</a> heraus, '
        + 'Sturmflutwarnungen kommen vom <a href="https://www.sturmflutwarndienst.de/">Sturmflutwarndienst des BSH</a>. buscosun zitiert die Kategorie nur.</li>'
        + '<li><strong>Es entscheidet keine Ausfahrt.</strong> Boot, Crew, Revier und Strömung kennt es nicht. Ein Wert in der Karte ist keine Freigabe.</li>'
        + '<li><strong>Es sieht nicht jede Bucht.</strong> In Häfen, Förden und hinter Sandbänken kann der Seegang vom Modellwert abweichen, und Strömung ist nicht Teil der Anzeige.</li>'
        + '<li><strong>Es endet an der deutschen Küste.</strong> Für andere Reviere zeigt es nichts.</li></ul>',
    },
  ],
  faqs: [
    { q: 'Ist das der amtliche Seewetterbericht?', a: 'Der Text im Reiter Seegebiet ist der Bericht des DWD im Wortlaut. Karte, Spots und Stundenband sind eine eigene Darstellung von buscosun und kein amtliches Produkt.' },
    { q: 'Was ist der Unterschied zwischen Windsee und Dünung?', a: 'Windsee entsteht durch den Wind vor Ort. Dünung sind Wellen, die aus einem anderen Gebiet einlaufen. Die Küstenvorhersage des DWD weist beide getrennt aus, und buscosun zeigt sie ebenso.' },
    { q: 'Woher kommt der Wasserstand?', a: 'Aus der offenen Schnittstelle des Bundesamts für Seeschifffahrt und Hydrographie, Lizenz CC BY 4.0. Bei hohen Wasserständen führt der Link zum Sturmflutwarndienst.' },
    { q: 'Warum steht in manchen Zellen „kein Seegang“?', a: 'Weil das Küstenmodell dort keine Wasserzelle hat. buscosun zeigt das als fehlenden Wert, nicht als 0 Meter.' },
  ],
  seeAlso: [
    { label: 'Wetter in Kiel', href: '/wetter/kiel/' }, { label: 'Wetter in Rostock', href: '/wetter/rostock/' },
    { label: 'Wetter auf Sylt', href: '/wetter/sylt-westerland/' }, { label: 'Wetter in Cuxhaven', href: '/wetter/cuxhaven/' },
    { label: 'buscosun für Segler', href: '/fuer/segler/' },
  ],
  relatedExplainers: ['windboeen-sturm', 'modellvergleich-unsicherheit'],
  datePublished: PUBLISHED, dateModified: PUBLISHED,
};

export const GLACIER_TOOL = {
  slug: 'gletscher', title: 'Gletscher-Monitor DACH', h1: 'So liest du den Gletscher-Monitor für DE, AT und CH',
  status: 'full', deepLink: '/gletscher',
  answer:
    'Der Gletscher-Monitor von buscosun führt rund 2 200 Gletscher in Deutschland, Österreich und der Schweiz an einem Ort: Inventarflächen mit '
    + 'Bezugsjahr, Längen- und Massenreihen der Messnetze, Satellitenszenen von Sentinel-2 und einen Schmelzindex aus Wettermodellen. Jede Zahl '
    + 'trägt ihre Herkunft, also gemessen, Satellit, Modell oder amtlich. Er ist kein amtliches Produkt und sagt nichts darüber, ob ein Gletscher begehbar ist.',
  bullets: [
    'Rund 2 200 Gletscher aus den Inventaren AGI 5, GI4, dem Schweizer Inventar über GLIMS und RGI 6.2',
    'Längen- und Massenreihen aus dem WGMS, in Österreich auch aus dem Alpenverein-Messdienst',
    'Satellitenszenen von Sentinel-2, je Szene mit Datum und Klaranteil',
    'Schmelzindex von 0 bis 100 aus Modelldaten, ausdrücklich ohne Einheit',
    'Herkunftszeichen an jeder Zahl und Bezugsjahr an jeder Fläche',
  ],
  sections: [
    {
      id: 'so-gehts', h2: "So geht's",
      html:
        '<ol><li><strong>Lage ansehen.</strong> Die Karte zeigt die Gletscher im DACH-Raum, die Rangliste nennt, wo der Schmelzindex gerade hoch ist.</li>'
        + '<li><strong>Gletscher öffnen.</strong> Der Steckbrief, etwa zum Großen Aletschgletscher oder zur Pasterze, gliedert sich in Heute, Saison, Langzeit, Tour und Quellen.</li>'
        + '<li><strong>Zeiten vergleichen.</strong> Frühere Umrisse und der Vergleichsregler zeigen, wie sich die Fläche verändert hat, wo es Daten dafür gibt.</li>'
        + '<li><strong>Herkunft prüfen.</strong> Das Zeichen an jeder Zahl sagt, ob sie gemessen, aus dem Satellitenbild, aus einem Modell oder aus einem amtlichen Bericht stammt.</li></ol>',
    },
    {
      id: 'daten', h2: 'Datenquellen und Aktualisierung',
      html:
        '<ul><li><strong>Inventare:</strong> Österreich AGI 5 und GI4 (PANGAEA), Schweiz über die <a href="https://nsidc.org/data/nsidc-0272">GLIMS Glacier Database</a>, Deutschland über RGI 6.2 und Inventardaten. Sie ändern sich selten, das Bezugsjahr steht an jeder Fläche.</li>'
        + '<li><strong>Reihen:</strong> Längen und Massenbilanzen aus dem Fluctuations-of-Glaciers-Datensatz des WGMS. Für die Schweiz sind die Reihen dadurch kürzer als bei GLAMOS selbst.</li>'
        + '<li><strong>Satellit:</strong> Sentinel-2, zweimal täglich auf neue Szenen geprüft. Bewölkte Szenen werden verworfen.</li>'
        + '<li><strong>Schmelzindex:</strong> alle drei Stunden aus Wettermodellen neu berechnet.</li></ul>'
        + '<p>Die Regeln und die gemessenen Grenzen stehen in der <a href="/methodik/gletscher-daten/">Methodik des Gletscher-Monitors</a>.</p>',
    },
    {
      id: 'grenzen', h2: 'Was das Werkzeug nicht kann',
      html:
        '<ul><li><strong>Es ist kein Gletscherbericht.</strong> Massenbilanzen und Jahresberichte geben <a href="https://www.glamos.ch/">GLAMOS</a> in der Schweiz und der <a href="https://www.alpenverein.at/">Österreichische Alpenverein</a> heraus.</li>'
        + '<li><strong>Die Schneegrenze einer Szene ist keine Gleichgewichtslinie.</strong> Gegen die gemessene Gleichgewichtslinie lag der Median-Abstand bei 282 Metern; die vorab festgelegte Abnahme von höchstens 150 Metern ist verfehlt. Deshalb steht der Wert als Szenenwert mit Datum da.</li>'
        + '<li><strong>Der Schmelzindex ist keine Schmelzmenge.</strong> Seine Eichung auf Millimeter hat die Abnahme nicht bestanden, deshalb hat er keine Einheit. Er taugt für einen Vergleich, nicht für eine Menge.</li>'
        + '<li><strong>Es gibt keine Tourenfreigabe.</strong> Spalten, Steinschlag und Lawinen kennt es nicht. Lawinenlage und Bergführer bleiben maßgeblich.</li></ul>',
    },
  ],
  faqs: [
    { q: 'Wie viele Gletscher sind enthalten?', a: 'Rund 2 200 in Deutschland, Österreich und der Schweiz, aus den Inventaren AGI 5, GI4, dem Schweizer Inventar über GLIMS und RGI 6.2.' },
    { q: 'Sind die Zahlen amtlich?', a: 'Nur dort, wo das Zeichen „amtlich“ steht. Daneben stehen Messreihen, Satellitenwerte und Modellwerte, und jede Zahl trägt ihr eigenes Zeichen.' },
    { q: 'Was bedeutet der Schmelzindex?', a: 'Eine Zahl von 0 bis 100 aus Wettermodelldaten, die Gletscher untereinander einordnet. Sie ist keine Schmelzmenge in Millimetern, weil die Eichung darauf die Abnahme nicht bestanden hat.' },
    { q: 'Kann ich sehen, ob ein Gletscher begehbar ist?', a: 'Nein. Der Reiter Tour nennt Vorbehalte und Links zu den zuständigen Stellen und bewertet keine Route.' },
  ],
  seeAlso: [
    { label: 'Vertikalschnitt der Atmosphäre: Wind über Grat und Tal', href: '/atmosphaere/querschnitt' },
    { label: 'Wetterarchiv: Klima seit 1940 am Ort', href: '/wetterarchiv' },
  ],
  relatedExplainers: ['schneefallgrenze', 'klimastreifen'],
  datePublished: PUBLISHED, dateModified: PUBLISHED,
};

export const ROAD_TOOL = {
  slug: 'autobahnwetter', title: 'Autobahnwetter: Fahrbahn und Glättemeldeanlagen', h1: 'So liest du das Autobahnwetter und die Glättemeldeanlagen',
  status: 'full', deepLink: '/autobahnwetter',
  answer:
    'Das Autobahnwetter von buscosun zeigt, was die Glättemeldeanlagen an deutschen Autobahnen messen: Fahrbahntemperatur, Fahrbahnzustand, '
    + 'Wasserfilm, Luft und Taupunkt, alle 15 Minuten aus dem Straßenwetter-System des Deutschen Wetterdienstes, geprüft und je Autobahn als Streckenband. '
    + 'Dazu kommt eine Wettervorhersage entlang der Strecke. Es ist kein amtliches Warnprodukt und keine Verkehrsmeldung.',
  bullets: [
    'Messwerte der Glättemeldeanlagen im 15-Minuten-Takt, je Autobahn als Band',
    'Prüfregeln gegen defekte Fühler und Gerätefüllwerte, verworfene Werte bleiben als Lücke sichtbar',
    'Gefahren-Leiste je Abschnitt mit benannter Regel und Herkunft',
    'Wetter entlang der Strecke aus buscosun Fusion, stündlich bis 48 Stunden',
    'Abdeckung nur Deutschland, und auch dort nicht lückenlos',
  ],
  sections: [
    {
      id: 'so-gehts', h2: "So geht's",
      html:
        '<ol><li><strong>Autobahn wählen.</strong> Das Band zeigt die Strecke mit Messstellen und Abschnitten.</li>'
        + '<li><strong>Messstelle öffnen.</strong> Dort stehen Fahrbahntemperatur, Zustand, Wasserfilm, Luft, Taupunkt und der Zeitpunkt der Messung.</li>'
        + '<li><strong>Abstand zum Taupunkt lesen.</strong> Liegt die Fahrbahn nahe am Taupunkt und unter dem Gefrierpunkt, kann sich Reif bilden. Das ist ein Hinweis auf die Messung, keine Aussage über die ganze Strecke.</li>'
        + '<li><strong>Vorhersage trennen.</strong> Die Stunden voraus sind Wetter an der Strecke und tragen das Wort Prognose. Sie sind keine Fahrbahnmessung.</li></ol>',
    },
    {
      id: 'daten', h2: 'Datenquellen und Aktualisierung',
      html:
        '<ul><li><strong>Messung:</strong> Glättemeldeanlagen der Länder über das Straßenwetter-System des DWD (opendata.dwd.de), alle 15 Minuten, mit eigenem Decoder dekodiert.</li>'
        + '<li><strong>Prüfung:</strong> Ein Wert wird verworfen, wenn er außerhalb physikalischer Grenzen liegt, hängt, ein bekannter Gerätefüllwert ist oder nicht zur eigenen Luft und zu den Nachbaranlagen passt.</li>'
        + '<li><strong>Vorhersage:</strong> buscosun Fusion an Stützpunkten entlang der Strecke, stündlich neu berechnet.</li>'
        + '<li><strong>Warnungen:</strong> amtliche Warnungen des DWD stehen als wörtliches Zitat daneben.</li></ul>'
        + '<p>Die Regeln im Einzelnen stehen in der <a href="/methodik/autobahnwetter-pruefregeln/">Methodik des Autobahnwetters</a>.</p>',
    },
    {
      id: 'grenzen', h2: 'Was das Werkzeug nicht kann',
      html:
        '<ul><li><strong>Es warnt nicht.</strong> Amtliche Warnungen vor Glätte gibt der <a href="https://www.dwd.de/DE/wetter/warnungen/warnWetter_node.html">Deutsche Wetterdienst</a> heraus. '
        + 'Baustellen, Sperrungen und Staus meldet die <a href="https://www.autobahn.de/">Autobahn GmbH</a>.</li>'
        + '<li><strong>Eine Messstelle ist ein Punkt.</strong> Zwischen zwei Anlagen, auf Brücken und in Senken kann die Fahrbahn anders sein. „Trocken“ an einer Anlage heißt nicht trocken auf der ganzen Strecke.</li>'
        + '<li><strong>Nicht jede Region liefert.</strong> Aus Baden-Württemberg kommen beim DWD keine Reihen; dort ist nur die Vorhersage zu sehen. Österreich und die Schweiz sind nicht enthalten.</li>'
        + '<li><strong>Fühler können ausfallen.</strong> Die Prüfregeln fangen viele Fehler ab, aber nicht jeden. Vor Ort gilt, was du siehst.</li>'
        + '<li><strong>Die Prognose der Fahrbahn ist noch in Erprobung.</strong> Prognose-Stufen sind deshalb gedeckelt und tragen einen Hinweis.</li></ul>',
    },
  ],
  faqs: [
    { q: 'Ist das eine amtliche Glättewarnung?', a: 'Nein. buscosun zeigt Messwerte und eigene Einordnungen. Amtliche Warnungen gibt der Deutsche Wetterdienst heraus; sie stehen auf der Seite nur als wörtliches Zitat.' },
    { q: 'Wie aktuell sind die Werte?', a: 'Die Anlagen melden alle 15 Minuten. Jeder Wert nennt seine Messzeit; fehlt eine Meldung, steht das dort.' },
    { q: 'Warum fehlt an einer Anlage ein Wert?', a: 'Weil er eine Prüfregel nicht bestanden hat oder nicht geliefert wurde. Lieber eine Lücke als ein falscher Wert von einem defekten Fühler.' },
    { q: 'Zeigt die Seite Staus oder Sperrungen?', a: 'Nein. Dafür ist die Autobahn GmbH des Bundes zuständig.' },
  ],
  relatedExplainers: ['windboeen-sturm', 'schneefallgrenze'],
  datePublished: PUBLISHED, dateModified: PUBLISHED,
};
