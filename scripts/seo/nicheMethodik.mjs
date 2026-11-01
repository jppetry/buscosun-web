/**
 * Methodik-Seiten der Nischen Seewetter, Gletscher und Autobahnwetter (audit/seo-nischen.md). Build-only.
 *
 * Gleiche Form wie `METHODIK_PAGES` in `methodik.mjs`. Konstanten stehen im Code, Messwerte im Audit der Linie:
 * `src/road/roadContract.ts`, `src/road/roadHazards.ts`, `src/sea/seaContract.ts`, `src/glacier/glacierContract.ts`,
 * `audit/gletscher.md` §3/§6, `audit/wasserstand-bsh.md`, `audit/autobahnwetter.md` §19.
 */
import { ROAD_AIR, ROAD_AIR_SOFT, ROAD_FILL, ROAD_PRECIP_FILL, ROAD_STUCK_RUN } from '../../src/road/roadContract.ts';

const p = (s) => `<p>${s}</p>`;
const ul = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
const de = (n) => String(n).replace('.', ',');

export const SEA_METHODIK = {
  slug: 'seewetter-quellen',
  title: 'Seewetter: Quellen und Rechenweg',
  h1: 'Woher die Seewetter-Werte von buscosun kommen',
  description: 'Seegang aus dem DWD-Küstenmodell, Wind aus buscosun Fusion, Wasserstand vom BSH, Bericht im Wortlaut: Quellen, Takt, Abdeckung und Grenzen des Seewetters.',
  answer: 'Das Seewetter von buscosun setzt sich aus vier getrennten Quellen zusammen: Seegang aus dem Küstenmodell CWAM des Deutschen Wetterdienstes, Wind und Böen aus buscosun Fusion an rund 60 Spots, Wasserstand aus der offenen Schnittstelle des BSH und der Seewetterbericht des DWD im Wortlaut. Keine dieser Quellen wird mit einer anderen verrechnet, und jede steht mit ihrem eigenen Zeitstempel da. Die Ansicht ist kein amtliches Warnprodukt.',
  sections: [
    { h2: 'Seegang', html: p('Der Seegang stammt aus dem Modell CWAM des DWD für Nord- und Ostsee. Es weist die Wellenhöhe gesamt sowie Windsee und Dünung getrennt aus. Eine Lauf-Ausgabe ist beim DWD erst rund vier Stunden nach dem Start vollständig; vorher bleibt der vorige Lauf stehen, statt einen halben anzuzeigen. Jeder Spot liest die nächstgelegene Wasserzelle des Modells. Über Land hat das Modell keinen Wert: Die Anzeige sagt dann „kein Seegang“ und schreibt keine 0 m hin.') },
    { h2: 'Wind und Böen', html: p('Der Wind am Spot kommt aus buscosun Fusion, also aus demselben Algorithmus wie die übrigen Ortsvorhersagen. Er wird mit dem Punkt des Spots gerechnet und nicht aus einer einzelnen Modellzelle abgelesen. Küstenstationen erscheinen, wo es sie gibt, als eigene Messung daneben. Eine Abnahme des Spot-Winds gegen die Küstenmessung gehört zum Gate D dieser Linie; ohne ein bestandenes Urteil nennt buscosun hier keine Trefferquote.') },
    { h2: 'Wasserstand', html: p('Die Pegel und Kurven kommen aus der <a href="https://gdi.bsh.de/ldproxy/rest/services/WaterLevelForecast">OGC API des Bundesamts für Seeschifffahrt und Hydrographie</a> (CC BY 4.0), ausschließlich über diese Schnittstelle. Je Pegel gibt es eine Modellkurve in Schritten von 10 oder 15 Minuten; die Reichweite unterscheidet sich je Pegel und liegt im Median bei rund 54 Stunden. An der Nordsee kommen Hoch- und Niedrigwasser mit einer Unsicherheit in Zentimetern hinzu. Die Warnkategorie des BSH wird nur zitiert; bei hohen Wasserständen führt der Link zum Sturmflutwarndienst.') },
    { h2: 'Texte im Wortlaut', html: p('Seewetterbericht und Warnstatus erscheinen unverändert, wie sie der DWD ausgibt. buscosun fasst sie nicht zusammen, verschärft sie nicht und schwächt sie nicht ab. Der Abruf läuft alle 15 Minuten, kurz nach den üblichen Ausgabezeiten.') },
    { h2: 'Grenzen', html: ul([
      'Keine Sicherheitsbewertung: Boot, Erfahrung und Revier sind unbekannt.',
      'Strömungen sind nicht Teil der Anzeige, Gezeitenströme in Prielen und Seegatten schon gar nicht.',
      'In Häfen, Förden und hinter Sandbänken löst das Modell die Wellen nur grob auf.',
      'Abdeckung: deutsche Nord- und Ostseeküste. Binnenseen, Adria und Mittelmeer fehlen.',
      'Der Wind ist eine Vorhersage, keine Messung, auch in der ersten Stunde.',
    ]) },
  ],
  faqs: [
    { q: 'Warum werden die Quellen nicht verrechnet?', a: 'Weil sie Verschiedenes messen oder modellieren und jede eine eigene Verantwortung hat. Ein Mischwert ließe sich nicht mehr auf den Herausgeber zurückführen.' },
    { q: 'Wie oft wird aktualisiert?', a: 'Texte und Spots werden alle 15 Minuten auf neue Ausgaben geprüft. Neue Modellläufe erscheinen, sobald sie beim DWD vollständig sind.' },
    { q: 'Wer gibt Sturmflutwarnungen heraus?', a: 'Der Sturmflutwarndienst des BSH. buscosun gibt keine eigenen Warnungen heraus und nennt die Kategorie nur als Zitat.' },
  ],
  related: ['/seewetter', '/funktionen/seewetter/', '/wissen/windboeen-sturm/', '/lizenzen/'],
};

export const GLACIER_METHODIK = {
  slug: 'gletscher-daten',
  title: 'Gletscher-Monitor: Daten und Grenzen',
  h1: 'Wie der Gletscher-Monitor von buscosun zu seinen Zahlen kommt',
  description: 'Inventare, Messreihen, Sentinel-2 und Schmelzindex: Herkunft jeder Zahl im Gletscher-Monitor, die vorab festgelegten Abnahmen und was sie ergeben haben.',
  answer: 'Der Gletscher-Monitor von buscosun trennt vier Arten von Zahlen: Inventarflächen und Messreihen aus Fachdatensätzen, Szenenwerte aus Sentinel-2-Bildern, einen Schmelzindex aus Wettermodellen und zitierte amtliche Angaben. Jede Zahl trägt ihr Zeichen. Zwei vorab festgelegte Abnahmen sind nicht bestanden: Die Schneegrenze trifft die gemessene Gleichgewichtslinie nicht genau genug, und der Schmelzindex hat keine Eichung in Millimetern. Beides steht deshalb ohne diesen Anspruch da.',
  sections: [
    { h2: 'Inventare und Reihen', html: p('Die rund 2 200 Gletscher stammen aus dem österreichischen Inventar AGI 5 und GI4 (PANGAEA, CC BY), für die Schweiz aus der <a href="https://nsidc.org/data/nsidc-0272">GLIMS Glacier Database</a> (NSIDC-0272, doi:10.7265/N5V98602), deren Bedingung die Quellenangabe ist, und aus RGI 6.2. Längen- und Massenreihen liefert der Fluctuations-of-Glaciers-Datensatz des WGMS (Open Access, entspricht laut WGMS CC BY 4.0), für Österreich außerdem der Messdienst des Alpenvereins. Dass die Schweizer Reihen über das WGMS laufen, macht sie kürzer als bei GLAMOS: 120 statt 155 Längenreihen und 38 statt 41 Massenreihen. An jeder Fläche steht das Bezugsjahr.') },
    { h2: 'Satellitenwerte', html: p('Zweimal täglich sucht der Job neue Sentinel-2-Szenen. Eine Szene zählt je Gletscher nur mit genügend klarer Sicht. Werte außerhalb der Höhenspanne des Gletschers oder eine Albedo außerhalb von 0,02 bis 0,98 gehen in die Quarantäne, anstatt angezeigt zu werden. Die höchste belastbare Schneegrenze einer Szene ist ein <strong>Szenenwert</strong>. Gegen die gemessene Gleichgewichtslinie lag der Median-Abstand bei 282 Metern und damit über der vorab festgelegten Grenze von 150 Metern, und im direkten Vergleich war die Klimatologie besser (164 gegen 261 Meter). Die Abnahme ist also rot. Im Betrieb vom 11. bis 31. Oktober 2026 gab es in 138 Szenen keine Quarantäne wegen Höhe oder Albedo; verworfen wurden Werte wegen Wolken. Sprünge von mehreren hundert Metern zwischen zwei Szenen kommen vor, nach Schneefall auch zu Recht, und lassen sich nicht einzeln beurteilen. Blaueisgletscher ohne geeignete Szenen zeigen keine Satellitenzahl.') },
    { h2: 'Schmelzindex', html: p('Der Index wird alle drei Stunden aus Wettermodelldaten berechnet und steht als Zahl von 0 bis 100. Seine Eichung auf Millimeter Sommerbilanz hat die Abnahme nicht bestanden: Der mittlere absolute Fehler lag bei rund 0,6 Meter Wasseräquivalent, erlaubt waren 0,3. Darum trägt er keine Einheit. Eine neue Eichung ist frühestens nach dem Sommer 2027 mit einem neu festgelegten Protokoll vorgesehen.') },
    { h2: 'Amtliche Angaben', html: p('Für die vier deutschen Gletscher zitiert die Seite die Angaben der Bayerischen Akademie der Wissenschaften mit Datum und Link, ohne eine eigene Satellitenzahl daneben. Jahresberichte von GLAMOS und dem Alpenverein werden verlinkt und nicht nachgebildet.') },
    { h2: 'Grenzen', html: ul([
      'Keine Tourenfreigabe: Kein Reiter sagt „begehbar“, „sicher“ oder „frei“.',
      'Bewölkte Herbst- und Wintermonate liefern wenig Szenen, und Neuschnee verdeckt die Eisfläche.',
      'Der Index vergleicht Gletscher untereinander und misst keine Schmelzmenge.',
      'Frühere Umrisse stammen aus Inventaren verschiedener Jahre und Verfahren; kleine Flächenunterschiede sind nicht immer real.',
    ]) },
  ],
  faqs: [
    { q: 'Warum zeigt buscosun Zahlen, deren Abnahme rot ist?', a: 'Weil sie als das bezeichnet werden, was sie sind: ein Szenenwert mit Datum und ein Index ohne Einheit. Die Abnahme entscheidet, welchen Anspruch die Zahl tragen darf, und die strengere Aussage entfällt.' },
    { q: 'Welche Lizenz haben die Schweizer Umrisse?', a: 'Sie kommen aus der GLIMS Glacier Database. NSIDC verlangt die Angabe des Datensatzes als Bedingung der Nutzung. Eine ausdrückliche CC-BY-Angabe haben wir an der Datensatzseite nicht gefunden, deshalb nennt buscosun hier die Zitierpflicht.' },
    { q: 'Wie oft ändern sich die Zahlen?', a: 'Inventare selten, Szenen bei klarem Himmel, der Schmelzindex alle drei Stunden. Jede Zahl trägt ihr Datum.' },
  ],
  related: ['/gletscher', '/funktionen/gletscher/', '/atmosphaere/querschnitt', '/wissen/schneefallgrenze/', '/lizenzen/'],
};

export const ROAD_METHODIK = {
  slug: 'autobahnwetter-pruefregeln',
  title: 'Autobahnwetter: Prüfregeln und Grenzen',
  h1: 'Wie buscosun die Messwerte der Glättemeldeanlagen prüft',
  description: 'Gerätefüllwerte, defekte Fühler und Nachbarvergleich: nach welchen Regeln das Autobahnwetter Messwerte verwirft, woher die Daten kommen und wo die Grenzen liegen.',
  answer: 'Das Autobahnwetter von buscosun zeigt die Messwerte der Glättemeldeanlagen aus dem Straßenwetter-System des Deutschen Wetterdienstes im 15-Minuten-Takt, aber nicht jeden gemeldeten Wert. Prüfregeln verwerfen physikalisch unmögliche Werte, hängende Fühler, Gerätefüllwerte und Fühler, die weder zur eigenen Luft noch zu den Nachbaranlagen passen. Ein verworfener Wert erscheint als Lücke mit Grund. Die Seite ist kein amtliches Warnprodukt und keine Verkehrsmeldung.',
  sections: [
    { h2: 'Warum Messwerte geprüft werden', html: p('Eine Glättemeldeanlage ist ein Gerät im Freien, und Geräte fallen aus. Beim ersten Durchgang durch die Rohdaten stammten alle „Frostgefahr“-Zustände eines Tages von defekten Fühlern oder Füllwerten, etwa −25 °C Fahrbahn bei +15 °C Luft. Ohne Prüfung hätte die Seite daraus eine Gefahr gemacht. Deshalb gilt die Regel: lieber eine Lücke als ein falscher Wert.') },
    { h2: 'Die Regeln', html: ul([
      `<strong>Grenzen und Platzhalter:</strong> Werte außerhalb physikalischer Grenzen und Temperaturen unter −60 °C fallen weg, ebenso vom DWD als zweifelhaft markierte Werte.`,
      `<strong>Hängende Fühler:</strong> ${ROAD_STUCK_RUN} gleiche Werte in Folge, also 6 Stunden, gelten als Defekt; ein schmelzender Belag nahe 0 °C bekommt länger Zeit, aber nicht unbegrenzt.`,
      `<strong>Gerätefüllwerte:</strong> Fahrbahn genau 0,00 oder −1,00 °C bei mindestens ${ROAD_FILL.airK} K wärmerer Luft, oder dieselbe Zahl auf mehreren Kanälen.`,
      `<strong>Fahrbahn gegen Luft:</strong> Mehr als ${ROAD_AIR.belowK} K unter oder ${ROAD_AIR.aboveK} K über der eigenen Luft ist nicht glaubhaft; die Nachbaranlagen entscheiden, welcher Fühler kaputt ist. Schon ab ${ROAD_AIR_SOFT.belowK} K darunter oder ${ROAD_AIR_SOFT.aboveK} K darüber fällt die Fahrbahn weg, wenn die Nachbarn der Luft recht geben (Abstand höchstens ${ROAD_AIR_SOFT.nbAirK} K) und die Fahrbahn mehr als ${ROAD_AIR_SOFT.nbRoadK} K von ihnen abweicht. Eine Anlage ohne Nachbarn behält ihren Wert, damit eine echte einzelne Frostlage nicht verschwindet.`,
      `<strong>Niederschlag ohne Niederschlag:</strong> Die Raten ${ROAD_PRECIP_FILL.valuesMmH.map(de).join(' und ')} mm/h sind Kanalkonstanten und zählen nur auf nasser Fahrbahn, und jede Rate ab ${ROAD_PRECIP_FILL.dryMinMmH} mm/h fällt weg, wenn alle Fühler trocken ohne Wasserfilm melden.`,
      '<strong>Zustand ohne Temperatur:</strong> Zustand und Wasserfilm eines Fühlers gelten nur zusammen mit dessen gültiger Fahrbahntemperatur, und Eis-Codes nur bis +3 °C.',
    ]) + p('Die Schwellen sind gesetzte Startwerte. Sie wurden am Archiv nachgerechnet, bevor sie scharf wurden; die jüngste Regel traf von Oktober 2026 rund 0,26 % der Wertepaare, vor allem an Anlagen, die dauerhaft unplausibel melden. Für eine Wiederholung im Sommer und im Winter fehlen noch Daten.') },
    { h2: 'Vorhersage und Gefahren-Leiste', html: p('Die Stunden voraus sind Wetter entlang der Strecke aus buscosun Fusion, stündlich bis 48 Stunden. Das sind Luft, Taupunkt, Niederschlag, Wind und Bewölkung, keine Fahrbahnmessung. Die Gefahren-Leiste bewertet Abschnitte mit benannten Schwellen und zeigt für jede Stufe, woher sie kommt. Stufen aus der Prognose sind gedeckelt und tragen einen Hinweis, weil die Abnahme gegen spätere Messungen aussteht. Eine eigene Schätzung der Fahrbahntemperatur bis +6 Stunden hat ihr Gate bei +1 Stunde verfehlt; sie läuft als Hinweis und nicht als Messung.') },
    { h2: 'Grenzen', html: ul([
      'Eine Anlage misst an einem Punkt. Brücken, Senken und Waldstücke dazwischen können anders sein.',
      'Der DWD liefert nicht alle Bundesländer; aus Baden-Württemberg kommen keine Reihen.',
      'Österreich und die Schweiz sind nicht enthalten.',
      'Die Prüfregeln fangen nicht jeden Defekt, vor allem nicht, wenn ein Fühler knapp plausibel falsch misst.',
      'Keine Staus, Sperrungen oder Baustellen; dafür ist die <a href="https://www.autobahn.de/">Autobahn GmbH</a> zuständig. Amtliche Warnungen kommen vom <a href="https://www.dwd.de/DE/wetter/warnungen/warnWetter_node.html">Deutschen Wetterdienst</a>.',
    ]) },
  ],
  faqs: [
    { q: 'Warum zeigt eine Anlage manchmal keinen Wert?', a: 'Weil der Wert eine Regel nicht bestanden hat oder der Fühler nichts geliefert hat. Die Seite nennt den Grund, statt eine falsche Zahl zu zeigen.' },
    { q: 'Sind das amtliche Warnungen?', a: 'Nein. Amtliche Warnungen gibt der Deutsche Wetterdienst heraus und buscosun zitiert sie wörtlich. Alles andere ist Messung oder eigene Einordnung.' },
    { q: 'Sagt die Seite die Fahrbahntemperatur vorher?', a: 'Nur als Hinweis bis +6 Stunden und nicht als Messung. Das Gate dieser Schätzung war bei +1 Stunde rot.' },
  ],
  related: ['/autobahnwetter', '/funktionen/autobahnwetter/', '/warnungen', '/lizenzen/'],
};
