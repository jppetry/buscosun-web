import type { SeoText } from './layerSeoTexts';
import { SEA_SPOT_COUNT } from '../sea/seaSeo';

/**
 * Texte der Top-Routen, die mehr brauchen als H1 und Lead (audit/seo-nischen.md). Lead und H1 kommen weiter aus `routes.ts`; hier stehen nur
 * Absätze, Fakten und Querverweise. Verbraucher: `renderRouteRootContent` (Shell) und `RouteSeoBlock` (lazy, im gerenderten DOM).
 */
export type RouteText = Pick<SeoText, 'body' | 'facts' | 'official' | 'links' | 'faq'>;
const ROUTE_TEXTS: Readonly<Record<string, RouteText>> = {
  '/autobahnwetter': {
    body: [
      'Eine Glättemeldeanlage steht an einem Punkt der Strecke und meldet alle 15 Minuten, was ihre Fühler messen. Das Band zeigt diese Messstellen je Autobahn, die Gefahren-Leiste bewertet die Abschnitte mit benannten Schwellen und nennt je Stufe die Herkunft. Die Stunden voraus sind Wetter an der Strecke aus buscosun Fusion und tragen das Wort Prognose; eine Fahrbahnmessung sind sie nicht.',
      'Die Rohwerte kommen aus dem Straßenwetter-System des DWD. Prüfregeln verwerfen physikalisch unmögliche Werte, hängende Fühler, Gerätefüllwerte und Fühler, die weder zur eigenen Luft noch zu den Nachbaranlagen passen. Ein verworfener Wert erscheint als Lücke mit Grund. Das fängt viele Defekte ab, aber nicht jeden: Vor Ort gilt, was du siehst.',
      'Für die 20 Autobahnen mit den meisten Anlagen gibt es eigene Seiten, etwa das Autobahnwetter für die A 7, die A 8 oder die A 1: mit den Teilstrecken, der Zahl der Anlagen je Bundesland, den höchstgelegenen Messstellen und den Ortsmerkmalen der Abschnitte wie Brücken, Wald und Niederungen. Alle anderen Autobahnen wählst du auf der Karte oder in der Liste; dort gelten dieselben Messwerte und Regeln.',
      'Grenzen: Zwischen zwei Anlagen, auf Brücken und in Senken kann die Fahrbahn anders sein. Aus Baden-Württemberg liefert der DWD keine Reihen, Österreich und die Schweiz sind nicht enthalten. Staus und Sperrungen zeigt die Seite nicht.',
    ],
    faq: [
      { q: 'Wie aktuell ist das Autobahnwetter?', a: 'Die Glättemeldeanlagen melden alle 15 Minuten, und buscosun zeigt jede Messung mit ihrer Messzeit. Die Gefahren-Leiste rechnet nach jedem Messtakt neu; die Vorhersage entlang der Strecke aus buscosun Fusion kommt stündlich und reicht 48 Stunden voraus.' },
      { q: 'Was ist eine Glättemeldeanlage?', a: 'Eine Messstation am Rand der Autobahn mit Fühlern in der Fahrbahndecke. Sie misst Fahrbahntemperatur, Fahrbahnzustand (etwa trocken, nass, Reif oder Eis) und Wasserfilm, dazu Lufttemperatur und Taupunkt, je nach Ausstattung auch Wind, Niederschlag und Sicht. Betrieben werden die Anlagen von den Straßenbauverwaltungen, die Daten verteilt der Deutsche Wetterdienst.' },
      { q: 'Ist das Autobahnwetter eine amtliche Glättewarnung?', a: 'Nein. Die Seite zeigt Messwerte und eine regelbasierte Einschätzung mit benannten Schwellen. Amtliche Warnungen gibt der Deutsche Wetterdienst heraus; buscosun zeigt sie nur im Wortlaut auf der Seite Warnungen. Sperrungen und Baustellen meldet die Autobahn GmbH des Bundes.' },
      { q: 'Warum fehlen Messwerte aus Baden-Württemberg?', a: 'Der DWD liefert die Reihen der baden-württembergischen Anlagen derzeit leer aus. Die Anlagen stehen in der Stationsliste; auf ihren Abschnitten zeigt die Seite die Prognose aus buscosun Fusion und sagt das dazu.' },
      { q: 'Gibt es das Autobahnwetter auch für Österreich und die Schweiz?', a: 'Nein. Die Straßenwetterdaten von ASFINAG und ASTRA sind nicht offen nutzbar, deshalb enden die Strecken an der Grenze. Für das Wetter in Österreich und der Schweiz gibt es die Wetterkarte und die Ortsseiten.' },
    ],
    facts: [
      { label: 'Quellen', text: 'Glättemeldeanlagen über das Straßenwetter-System des DWD · buscosun Fusion für die Stunden voraus' },
      { label: 'Aktualisierung', text: 'Messung alle 15 Minuten, Vorhersage stündlich bis 48 Stunden' },
      { label: 'Abdeckung', text: 'deutsche Autobahnen, außer wo der DWD keine Reihen liefert' },
      { label: 'Grenze', text: 'kein amtliches Warnprodukt, keine Verkehrsmeldung; Prognose-Stufen gedeckelt' },
    ],
    official: { text: 'Amtliche Warnungen gibt der Deutsche Wetterdienst heraus, Baustellen und Sperrungen meldet die', label: 'Autobahn GmbH', href: 'https://www.autobahn.de/' },
    links: [
      { label: 'Amtliche Warnungen auf buscosun', href: '/warnungen' },
      { label: 'So liest du das Autobahnwetter', href: '/funktionen/autobahnwetter/' },
      { label: 'Prüfregeln der Messwerte', href: '/methodik/autobahnwetter-pruefregeln/' },
    ],
  },
  '/gletscher': {
    body: [
      'Die Lage zeigt die Gletscher im DACH-Raum auf der Karte und in einer Rangliste; der Steckbrief zu jedem Gletscher, etwa zum Großen Aletschgletscher oder zur Pasterze, gliedert sich in Heute, Saison, Langzeit, Tour und Quellen. Frühere Umrisse und ein Vergleichsregler zeigen die Veränderung der Fläche, soweit Inventare dafür vorliegen. Jede Zahl trägt ein Zeichen: gemessen, Satellit, Modell oder amtlich.',
      'Die Inventare stammen aus AGI 5 und GI4 für Österreich, aus der GLIMS Glacier Database für die Schweiz und aus RGI 6.2; die Längen- und Massenreihen aus dem Datensatz des WGMS, für Österreich auch vom Alpenverein. Sentinel-2-Szenen werden zweimal täglich gesucht und bei Wolken verworfen. Der Schmelzindex wird alle drei Stunden aus Wettermodellen berechnet und hat keine Einheit, weil seine Eichung auf Millimeter die vorab festgelegte Abnahme nicht bestanden hat.',
      'Grenzen: Die Schneegrenze einer Szene ist keine Gleichgewichtslinie; gegen die gemessene Linie lag der Median-Abstand bei 282 Metern. Schweizer Reihen sind über das WGMS kürzer als bei GLAMOS. Massenbilanzen und Jahresberichte geben GLAMOS und der Österreichische Alpenverein heraus. Die Ansicht sagt nichts über Spalten, Steinschlag oder Lawinen und gibt keine Tour frei.',
    ],
    facts: [
      { label: 'Quellen', text: 'AGI 5, GI4 (PANGAEA) · GLIMS (NSIDC-0272, doi:10.7265/N5V98602) · RGI 6.2 · WGMS FoG · Sentinel-2 · ICON-Modelle' },
      { label: 'Aktualisierung', text: 'Szenen zweimal täglich geprüft, Schmelzindex alle 3 Stunden, Inventare selten' },
      { label: 'Abdeckung', text: 'rund 2 200 Gletscher in DE, AT und CH' },
      { label: 'Grenze', text: 'kein amtliches Warnprodukt, keine Tourenfreigabe; Schmelzindex ohne Einheit, Schneegrenze als Szenenwert' },
    ],
    official: { text: 'Amtliche Schweizer Gletscherdaten und Jahresberichte stehen bei', label: 'GLAMOS', href: 'https://www.glamos.ch/' },
    links: [
      { label: 'So liest du den Gletscher-Monitor', href: '/funktionen/gletscher/' },
      { label: 'Gletscher-Atlas: alle Gletscher nach Land und Region', href: '/gletscher-atlas/' },
      { label: 'Daten und Grenzen', href: '/methodik/gletscher-daten/' },
      { label: 'Vertikalschnitt der Atmosphäre', href: '/atmosphaere/querschnitt' },
    ],
  },
  '/buscosun-fusion': {
    body: [
      'Ein Wettermodell rechnet auf einem geglätteten Gitter und kennt weder dein Tal noch die Messung von eben. buscosun Fusion ist das Postprocessing dazwischen: Es bündelt Modelle von DWD, ECMWF, GeoSphere Austria und MeteoSchweiz sowie Radar und stündlich neue Kurzfristläufe, rechnet bekannte Fehler heraus, bringt den Wert auf die tatsächliche Geländehöhe, schließt ihn an die nächsten Messungen an und liefert eine Spanne statt eines Scheinwerts.',
      'Je Stunde entstehen ein wahrscheinlichster Wert, eine Spanne von p10 bis p90, in der das Wetter in acht von zehn Fällen liegen soll, und ein Wort für die Konfidenz. Jeder Stand des Verfahrens bekommt eine Nummer und wird eingefroren; er wird mit dem, was danach gemessen wurde, an Stationen in Deutschland, Österreich und der Schweiz verglichen, auch gegen die Stationsvorhersage MOSMIX des DWD.',
      'Grenzen: Fusion verbessert, was Modelle und Radar liefern; ein Gewitter, das keine Quelle kommen sieht, sieht auch Fusion nicht. Zwischen weit entfernten Stationen ist die Spanne breiter, und je weiter voraus, desto mehr nähert sich die Vorhersage dem Klima. Alle Grafiken der Seite sind Schemata ohne Messdaten.',
    ],
    facts: [
      { label: 'Quellen', text: 'DWD · ECMWF · GeoSphere Austria · MeteoSchweiz, dazu Radar und Messungen der Wetterdienste' },
      { label: 'Aktualisierung', text: 'vorgerechnet je Modelllauf, fertig gerechnet im Browser' },
      { label: 'Horizont', text: '0 bis 336 Stunden, die ersten 48 Stunden stündlich' },
      { label: 'Grenze', text: 'kein amtliches Warnprodukt; Spanne statt Scheinwert; Schemata ohne Messdaten' },
    ],
    official: { text: 'Amtliche Warnungen geben der Deutsche Wetterdienst, GeoSphere Austria und MeteoSchweiz heraus; sie stehen auf buscosun im Wortlaut unter', label: 'Amtliche Warnungen', href: '/warnungen' },
    links: [
      { label: 'Wie gut ist der Nowcast?', href: '/validierung' },
    ],
  },
  // Phase WBS (audit/seo-waldbrand.md): Absätze und Fakten statt leerer Liste; Links auf die Seiten je Land und Region.
  '/waldbrand': {
    body: [
      'Die Karte beantwortet drei Fragen. Brennt es gerade? Die Sicht „Aktive Brände" bündelt die Wärmepunkte der VIIRS-Satelliten aus dem NASA-System FIRMS zu Bränden mit Ort, Stärke und Verlauf; ein Klick öffnet das Brand-Dossier mit Satellitenbild und Wetterlage am Brandort. Wie hoch ist die Gefahr? Der Gefahrenindex zeigt den Fire Weather Index von Copernicus und ECMWF als Fläche, dazu die Einordnung, wie ungewöhnlich der Tag für den Ort ist. Wie trocken ist es? Bodenfeuchte und Luftfeuchte kommen aus dem DWD-Modell ICON-D2.',
      'Für jedes Bundesland und jeden Kanton mit Bränden in der Saison gibt es eine eigene Seite: wer dort die amtliche Stufe festlegt, das Feuerwetter-Bild für heute und die kommenden Tage und die Saisonbilanz aus Satellitendaten mit den von EFFIS kartierten Brandflächen — etwa für Brandenburg, Niedersachsen, Niederösterreich, Tirol, das Tessin oder das Wallis.',
      'Grenzen: Eine Satellitendetektion ist keine Einsatzmeldung. Kleine Brände und Brände unter Wolken fehlen, Felder und Grasflächen zählen mit. Rund 39 Prozent aller Detektionen liegen auf Industrieanlagen; sie stehen als eigene Klasse grau auf der Karte und zählen nicht als Brand. Bestätigt heißt ein Brand nur mit EFFIS-Kartierung oder Copernicus-EMS-Aktivierung. Bei Feuer: Notruf 112, in Österreich Feuerwehr 122, in der Schweiz 118.',
    ],
    facts: [
      { label: 'Quellen', text: 'NASA FIRMS VIIRS (375 m) · EFFIS-Brandflächen · Copernicus EMS GWIS/ECMWF (FWI, CC BY 4.0) · DWD ICON-D2 (Boden- und Luftfeuchte)' },
      { label: 'Aktualisierung', text: 'Satellitenüberflüge mehrmals täglich; Feuerwetterindex täglich, bis 9 Tage voraus; Trockenheit stündlich' },
      { label: 'Abdeckung', text: 'Deutschland, Österreich, Schweiz; Grenzräume mitgezählt; Seiten je Bundesland und Kanton unter /waldbrandgefahr/' },
      { label: 'Grenze', text: 'kein amtliches Warnprodukt; Detektion ist keine Einsatzmeldung; kleine Brände fehlen' },
    ],
    official: { text: 'Das Brandradar ist kein amtliches Warnprodukt. Amtlich sind in Deutschland der DWD und die Länder, in der Schweiz die Kantone; für Deutschland:', label: 'Waldbrandgefahrenindex des DWD', href: 'https://www.dwd.de/DE/leistungen/waldbrandgef/waldbrandgef.html' },
    links: [
      { label: 'Waldbrandgefahr nach Bundesland und Kanton', href: '/waldbrandgefahr/' },
      { label: 'Deutschland', href: '/waldbrandgefahr/deutschland/' },
      { label: 'Österreich', href: '/waldbrandgefahr/oesterreich/' },
      { label: 'Schweiz', href: '/waldbrandgefahr/schweiz/' },
      { label: 'So liest du das Brandradar', href: '/funktionen/waldbrandgefahr/' },
      { label: 'Waldbrandstufen in DE, AT und CH erklärt', href: '/wissen/waldbrandwarnstufen-de-at-ch/' },
      { label: 'Wie die Detektion rechnet', href: '/methodik/brandradar-detektion-und-brandnarben/' },
    ],
  },
  '/seewetter': {
    body: [
      `Die Ansicht beantwortet drei Fragen für einen Spot an der deutschen Küste. Wie weht es, mit welchen Böen? Wie hoch läuft die See, getrennt nach Windsee und Dünung? Wie steht das Wasser am nächsten Pegel? Das Stundenband zeigt die kommenden Stunden, die Karte das Seegangsfeld, und jeder der ${SEA_SPOT_COUNT} Spots hat eine eigene Seite mit Steckbrief, etwa St. Peter-Ording, Sylt Westerland, Laboe, Fehmarn Grüner Brink oder Warnemünde.`,
      'Die Quellen werden nicht verrechnet. Der Seegang stammt aus dem Küstenmodell CWAM des DWD, der Wind am Spot aus buscosun Fusion, der Wasserstand aus der offenen Schnittstelle des BSH. Seewetterbericht und Warnstatus des Seewetterdienstes Hamburg erscheinen unverändert im Wortlaut, die Wassertemperatur von Nord- und Ostsee als Spanne aus der amtlichen Mittelfrist. Texte und Spots werden alle 15 Minuten auf neue Ausgaben geprüft; jeder Wert nennt seinen Stand.',
      'Grenzen: In Häfen, Förden und hinter Sandbänken löst das Modell die Wellen nur grob auf, Strömungen sind nicht Teil der Anzeige, und eine Zelle ohne Wasser im Modell zeigt „kein Seegang“ statt 0 Meter. Binnenseen wie der Bodensee und Reviere im Mittelmeer fehlen. Die Ansicht entscheidet keine Ausfahrt.',
    ],
    facts: [
      { label: 'Quellen', text: 'DWD CWAM (Seegang) · buscosun Fusion (Wind, Böen) · BSH (Wasserstand, CC BY 4.0) · Seewetterdienst Hamburg des DWD (Seewetterbericht und Warnungen im Wortlaut)' },
      { label: 'Aktualisierung', text: 'Prüfung alle 15 Minuten; CWAM-Läufe um 00 und 12 UTC, rund 4 Stunden nach dem Start vollständig; Horizont 78 Stunden' },
      { label: 'Abdeckung', text: `deutsche Nord- und Ostseeküste, ${SEA_SPOT_COUNT} Spots von Borkum bis Ueckermünde` },
      { label: 'Grenze', text: 'kein amtliches Warnprodukt, keine Sicherheitsbewertung, keine Strömung, keine Binnenseen' },
    ],
    faq: [
      { q: 'Wie oft wird das Seewetter aktualisiert?', a: 'Die Seite prüft alle 15 Minuten auf neue Ausgaben. Das Küstenwellenmodell CWAM des DWD rechnet zweimal am Tag, um 00 und 12 UTC, und ist rund vier Stunden nach dem Start vollständig; den Seewetterbericht gibt der Seewetterdienst Hamburg mehrmals täglich heraus.' },
      { q: 'Wo steht der Seewetterbericht für die Deutsche Bucht oder die Westliche Ostsee?', a: 'Auf jeder Spot-Seite im Reiter „Seegebiet“, unverändert im Wortlaut und mit Ausgabezeit: für die Deutsche Bucht etwa bei Helgoland, Sylt oder Cuxhaven, für die Westliche Ostsee bei Kiel, Fehmarn oder Warnemünde.' },
      { q: 'Was ist der Unterschied zwischen Windsee und Dünung?', a: 'Windsee entsteht durch den Wind vor Ort und ist kurz und steil; Dünung läuft aus einem entfernten Windfeld ein, ist länger und regelmäßiger. Die Seite zeigt beide getrennt, dazu die Periode.' },
      { q: 'Wie warm ist die Ostsee oder die Nordsee gerade?', a: 'Die Seite nennt die Wassertemperatur von Nord- und Ostsee als Spanne aus der amtlichen Mittelfrist des Seewetterdienstes Hamburg, mit Ausgabezeit. Messungen an einzelnen Badestellen enthält sie nicht.' },
      { q: 'Ist das eine amtliche Warnung?', a: 'Nein. buscosun gibt keine Warnungen heraus. Der Warnstatus des Seewetterdienstes Hamburg erscheint im Wortlaut; ist er älter als vier Stunden, gilt er als unbekannt.' },
      { q: 'Gibt es Seewetter für den Bodensee oder das Mittelmeer?', a: 'Noch nicht. Das Küstenwellenmodell des DWD rechnet Nord- und Ostsee, aber keine Binnenseen, und Spots im Mittelmeer sind bisher nicht angelegt.' },
    ],
    official: { text: 'Amtliche Wind- und Sturmwarnungen gibt der Seewetterdienst Hamburg des DWD heraus, Sturmflutwarnungen das BSH:', label: 'Sturmflutwarndienst', href: 'https://www.sturmflutwarndienst.de/' },
    links: [
      { label: 'So liest du das Seewetter', href: '/funktionen/seewetter/' },
      { label: 'Seegang, Windsee und Dünung erklärt', href: '/wissen/seegang-wellenhoehe/' },
      { label: 'Den Seewetterbericht lesen', href: '/wissen/seewetterbericht/' },
      { label: 'Quellen und Rechenweg', href: '/methodik/seewetter-quellen/' },
      { label: 'Für Segler', href: '/fuer/segler/' },
    ],
  },
  '/wetterarchiv': {
    body: [
      'Zwei Fragen führen durch die Ansicht. „Rückblick“ schlägt nach, wie das Wetter an einem Tag, in einem Monat oder einem Jahr war, und ordnet es gegen die übrigen Jahre ein. „Veränderung“ zeigt den langen Verlauf: Klimastreifen, Abweichung von der Referenzperiode, Kenntage wie Hitze- und Frosttage und den Trend je Jahrzehnt. Beides geht für jeden Ort in Deutschland, Österreich und der Schweiz; als eigene Adresse lässt sich jeder Ort teilen.',
      'Die Daten kommen aus zwei Quellen, die getrennt ausgewiesen werden. Standard sind Stationsmessungen der nächstgelegenen Station über Meteostat, in Deutschland überwiegend vom DWD; die Ansicht nennt Stationsname und Entfernung. Für Stundenwerte und als Alternative steht die Reanalyse ERA5 von Copernicus über das Open-Meteo-Archiv bereit, zurück bis 1940. Eine Reanalyse ist eine nachträgliche Modellrechnung und keine Messung am Ort, und sie ist als solche gekennzeichnet.',
      'Grenzen: Eine Station kann mehrere Kilometer entfernt liegen und anders im Gelände stehen. ERA5 rechnet grob und glättet Täler und Gipfel. Ein Rekord gilt nur für den geladenen Zeitraum und ist kein amtlicher Rekord. Lücken in den Reihen werden nicht stillschweigend aufgefüllt. Trends sind eine statistische Beschreibung der geladenen Reihe und keine Aussage über einzelne Ereignisse.',
    ],
    facts: [
      { label: 'Quellen', text: 'Stationen über Meteostat (in DE überwiegend DWD) · ERA5 (Copernicus) über das Open-Meteo-Archiv' },
      { label: 'Zeitraum', text: 'ERA5 ab 1940, Stationen je nach Station, in Deutschland teils ab 1931' },
      { label: 'Aktualisierung', text: 'beim Aufruf aus dem Archiv geladen; die jüngsten Tage können noch fehlen' },
      { label: 'Abdeckung', text: 'jeder Ort in DE, AT und CH' },
      { label: 'Grenze', text: 'Reanalyse ist keine Messung; Rekorde gelten nur für den geladenen Zeitraum' },
    ],
    links: [
      { label: 'So funktioniert die Wetterhistorie', href: '/funktionen/historie/' },
      { label: 'Klimastreifen erklärt', href: '/wissen/klimastreifen/' },
      { label: 'Trockenperioden erklärt', href: '/wissen/trockenperioden/' },
      { label: 'Trockenheit aktuell: Boden und Feuerwetter', href: '/waldbrand/trockenheit' },
    ],
  },
};

export function routeText(path: string): RouteText | null {
  return ROUTE_TEXTS[path] ?? null;
}
