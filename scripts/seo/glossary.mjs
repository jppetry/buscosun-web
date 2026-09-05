/**
 * Glossary (build-only, plain Node ESM) — SEO/GEO 2026, stage 2.
 *
 * One page `/glossar/` with a DefinedTermSet: every term has an anchor id,
 * a one-sentence `short` (DefinedTerm.description) and a ≥ 40-word `html`.
 * Terms are sorted alphabetically by display name at export time.
 * buscosun-specific numbers are taken from the source code named in the
 * comments; the rest is textbook meteorology with the honesty rules of
 * CLAUDE.md (no official warnings, no "Tornado" wording, DACH asymmetries named).
 */

import { SITE, headBlock, PAGE_CSS, escapeHtml, DEFAULT_OG_IMAGE, ogImageOr } from './content.mjs';

export const GLOSSARY_UPDATED = '2026-09-05';

const TERMS = [
  // ---------------------------------------------------------------- Feuerwetter
  {
    id: 'fwi', term: 'FWI (Fire Weather Index)',
    short: 'Dimensionsloser Gesamtindex des kanadischen Feuerwetter-Systems, der aus Feuchtecodes und Wind die mögliche Feuerintensität beschreibt.',
    html: '<p>Der <strong>Fire Weather Index</strong> ist die Spitze des kanadischen CFFDRS: Aus FFMC, DMC und DC entstehen ISI und BUI, aus beiden der FWI. EFFIS teilt ihn in sechs Klassen von „Low" (unter 11,2) bis „Very Extreme" (über 70,0). buscosun zeigt die ECMWF-basierte GWIS-Fläche unter <a href="/waldbrand/gefahrenindex">Gefahrenindex</a> — ein Modellwert, kein amtliches Warnprodukt. Ausführlich: <a href="/wissen/fire-weather-index/">Fire Weather Index</a>.</p>',
    links: ['/wissen/fire-weather-index/', '/waldbrand/gefahrenindex'],
  },
  {
    id: 'ffmc', term: 'FFMC (Fine Fuel Moisture Code)',
    short: 'Feuchtecode des FWI-Systems für feines Brennmaterial wie Gras, Nadeln und Laub; beschreibt die Zündbereitschaft mit kurzem Gedächtnis.',
    html: '<p>Der <strong>Fine Fuel Moisture Code</strong> reagiert binnen Stunden auf Regen, Sonne und Wind — sein Gedächtnis beträgt rund zwei Drittel eines Tages. Hohe Werte bedeuten trockenes Feinmaterial, das leicht zündet. EFFIS färbt ab 96,0 die höchste Klasse. Im Brandradar heißt die Ansicht „Zündbereitschaft"; sie sagt nichts über tiefere Auflagen, dafür steht der Drought Code.</p>',
    links: ['/wissen/fire-weather-index/', '/waldbrand/gefahrenindex'],
  },
  {
    id: 'dmc', term: 'DMC (Duff Moisture Code)',
    short: 'Feuchtecode des FWI-Systems für locker gelagerte organische Auflagen mittlerer Tiefe mit etwa zwölf Tagen Gedächtnis.',
    html: '<p>Der <strong>Duff Moisture Code</strong> beschreibt die Feuchte der oberen Humus- und Streuschicht, in der Feuer schwelen und sich nach Regen wieder entfachen können. Er reagiert langsamer als der FFMC und schneller als der DC. Gemeinsam mit dem DC bildet er den Build-Up Index. buscosun zeigt den DMC nicht als eigene Ansicht — er steckt im Gesamtindex.</p>',
    links: ['/wissen/fire-weather-index/'],
  },
  {
    id: 'dc', term: 'DC (Drought Code)',
    short: 'Feuchtecode des FWI-Systems für tiefe, verdichtete organische Auflagen mit rund 52 Tagen Gedächtnis — keine Bodenfeuchte.',
    html: '<p>Der <strong>Drought Code</strong> ist die Größe mit der längsten Erinnerung an Trockenheit im Feuerwetter-System: Ein einzelner Regentag ändert ihn kaum. Er beschreibt, wie tief ein Feuer in den Boden brennen und wie lange es glimmen kann. Er ist ausdrücklich <em>keine</em> gemessene oder modellierte Bodenfeuchte; buscosun nennt die Ansicht „Trockenheit der Streuauflage (Modellwert)" und trennt sie vom SMI.</p>',
    links: ['/wissen/fire-weather-index/', '/wissen/trockenperioden/'],
  },
  {
    id: 'isi', term: 'ISI (Initial Spread Index)',
    short: 'Verhaltensindex des FWI-Systems für die erwartete Ausbreitungsrate unmittelbar nach der Zündung, aus FFMC und Wind.',
    html: '<p>Der <strong>Initial Spread Index</strong> kombiniert die Feinmaterial-Feuchte mit der Windgeschwindigkeit und beschreibt, wie schnell ein frisch gezündetes Feuer laufen würde — ohne Berücksichtigung der Brennstoffmenge. EFFIS färbt ab 26,8 die höchste Klasse. Im Brandradar heißt die Ansicht „Ausbreitung"; der Wind stammt dort aus demselben ECMWF-Lauf, der ICON-D2-Windlayer der Wetterkarte ist die feinere Ergänzung.</p>',
    links: ['/wissen/fire-weather-index/', '/waldbrand/gefahrenindex'],
  },
  {
    id: 'bui', term: 'BUI (Build-Up Index)',
    short: 'Verhaltensindex des FWI-Systems für die verfügbare Brennstoffmenge, gebildet aus Duff Moisture Code und Drought Code.',
    html: '<p>Der <strong>Build-Up Index</strong> sagt, wie viel Brennmaterial in mittleren und tiefen Auflagen für ein Feuer verfügbar ist. Er steigt in langen Trockenphasen und fällt erst nach ergiebigem Regen. Zusammen mit dem ISI ergibt er den FWI. buscosun zeigt den BUI nicht als eigene Ansicht; wer die Tiefe der Trockenheit sehen will, nutzt den Drought Code.</p>',
    links: ['/wissen/fire-weather-index/'],
  },
  {
    id: 'frp', term: 'FRP (Fire Radiative Power)',
    short: 'Feuerstrahlungsleistung einer Satellitendetektion in Megawatt — ein Maß für die Intensität, nicht für die Brandfläche.',
    html: '<p>Die <strong>Fire Radiative Power</strong> misst, wie viel Energie ein Pixel im mittleren Infrarot abstrahlt. Sie erlaubt einen Vergleich der Intensität zwischen Detektionen und über die Zeit — der Brandradar zeigt sie je Überflug als Verlauf. Aus FRP lässt sich keine Fläche in Hektar ableiten; buscosun tut das nie. Anlagen wie Stahlwerke liefern konstante FRP-Signaturen, Vegetationsbrände schwankende.</p>',
    links: ['/wissen/thermalanomalien-firms/', '/waldbrand/aktive-braende'],
  },
  {
    id: 'nbr', term: 'NBR (Normalized Burn Ratio)',
    short: 'Spektralindex aus Nahinfrarot und kurzwelligem Infrarot, der gesunde Vegetation von verbrannter Fläche trennt.',
    html: '<p>Der <strong>Normalized Burn Ratio</strong> wird als (NIR − SWIR) / (NIR + SWIR) aus Satellitenbändern berechnet. Gesunde Vegetation reflektiert stark im Nahinfrarot und wenig im SWIR — hoher NBR; Asche und verkohltes Holz kehren das um — niedriger NBR. Für sich allein ist der Wert schwer zu deuten; erst die Differenz zweier Aufnahmen (dNBR) zeigt die Brandnarbe.</p>',
    links: ['/methodik/brandradar-detektion-und-brandnarben/'],
  },
  {
    id: 'dnbr', term: 'dNBR (Differenz des NBR)',
    short: 'Differenz des Normalized Burn Ratio zwischen einer Aufnahme vor und nach dem Brand; hebt die Brandnarbe hervor.',
    html: '<p><strong>dNBR</strong> = NBR vorher − NBR nachher. Große positive Werte markieren verbrannte Vegetation, Werte um null unveränderte Fläche. buscosun rechnet dNBR im Brand-Dossier aus Sentinel-2-Szenen mit gleichem Granulat, blendet Wolken- und Schattenpixel über die Szenenklassifikation aus und dämpft Flächen ohne Vegetation über die WorldCover-Landbedeckung. Es bleibt eine Bildauswertung, keine amtliche Kartierung.</p>',
    links: ['/methodik/brandradar-detektion-und-brandnarben/'],
  },
  {
    id: 'swir', term: 'SWIR (kurzwelliges Infrarot)',
    short: 'Spektralbereich um 1,6 bis 2,2 Mikrometer, in dem Glut sichtbar wird und verbrannte Fläche sich von Vegetation abhebt.',
    html: '<p>Im <strong>kurzwelligen Infrarot</strong> strahlen aktive Glutnester selbst bei Tag hell, während Rauch weitgehend durchsichtig ist. Sentinel-2 führt zwei SWIR-Bänder (B11, B12), die buscosun im 10-m-Satellitenviewer des Brand-Dossiers als Falschfarbenkomposit zeigt: Brandnarben erscheinen rotbraun, Vegetation grün, Glut leuchtend. Der SWIR-Kanal ist auch die Grundlage des NBR.</p>',
    links: ['/methodik/brandradar-detektion-und-brandnarben/'],
  },
  {
    id: 'scl', term: 'SCL (Scene Classification Layer)',
    short: 'Pixelklassifikation der Sentinel-2-Verarbeitung, die Wolken, Schatten, Wasser, Vegetation und unbewachsene Fläche unterscheidet.',
    html: '<p>Der <strong>Scene Classification Layer</strong> begleitet jede Sentinel-2-Level-2A-Szene und ordnet jedes Pixel einer Klasse zu. buscosun nutzt ihn, um Wolken und Schatten aus dNBR und Vorher-nachher-Vergleichen auszuschließen. Wichtig: Eine frische Brandnarbe wird oft als „unbewachsen" klassifiziert — das Nachher-Bild darf deshalb nie binär auf Vegetation maskiert werden, sonst verschwindet genau das, was gezeigt werden soll.</p>',
    links: ['/methodik/brandradar-detektion-und-brandnarben/'],
  },
  {
    id: 'firms', term: 'FIRMS (NASA)',
    short: 'NASA-Dienst, der Thermalanomalien der Satelliteninstrumente MODIS und VIIRS binnen Stunden als offene Daten verteilt.',
    html: '<p>Das <strong>Fire Information for Resource Management System</strong> ist die Primärquelle der aktiven Detektionen im Brandradar: VIIRS-375-m-Detektionen von Suomi-NPP, NOAA-20 und NOAA-21 mit Strahlungsleistung, Konfidenz, Pixelgeometrie und Tag/Nacht-Kennung. Die Area-API liefert höchstens fünf Tage je Abruf; der Schlüssel liegt serverseitig. Ein Hotspot ist eine Thermalanomalie, kein bestätigter Brand.</p>',
    links: ['/wissen/thermalanomalien-firms/', '/waldbrand'],
  },
  {
    id: 'viirs', term: 'VIIRS',
    short: 'Radiometer auf den Satelliten Suomi-NPP, NOAA-20 und NOAA-21, das aktive Feuer mit 375 m Pixelgröße detektiert.',
    html: '<p>Das <strong>Visible Infrared Imaging Radiometer Suite</strong> überfliegt Mitteleuropa je Satellit etwa zweimal täglich, nachmittags und nachts. Sein 375-m-Kanal erkennt kleinere und kühlere Feuer als MODIS. Die Koordinate einer Detektion ist die Pixelmitte; am Bildrand wird das Pixel deutlich länger. buscosun nutzt für die Historie nur Suomi-NPP und NOAA-20, damit die Reihe über die Jahre sensorgleich bleibt.</p>',
    links: ['/wissen/thermalanomalien-firms/'],
  },
  {
    id: 'effis', term: 'EFFIS',
    short: 'Europäisches Waldbrand-Informationssystem des Copernicus-Notfalldienstes: Gefahrenvorhersage und kartierte Brandflächen.',
    html: '<p>Das <strong>European Forest Fire Information System</strong> liefert die tägliche Feuerwetter-Vorhersage (FWI-Familie) und das Rapid Damage Assessment mit kartierten Brandflächen. Liegt eine Detektion in einer solchen Fläche, weist buscosun sie als „von EFFIS kartiert (bestätigt)" aus — das ist einer von zwei Wegen zu „bestätigt". Der Hotspot-Bestand von EFFIS endet 2021 und wird nicht verwendet.</p>',
    links: ['/methodik/brandradar-detektion-und-brandnarben/', '/waldbrand/aktive-braende'],
  },
  {
    id: 'gwis', term: 'GWIS',
    short: 'Globales Waldbrand-Informationssystem von Copernicus und JRC; liefert den FWI als WMS-Fläche und VIIRS-Hotspots als Rückfall.',
    html: '<p>Das <strong>Global Wildfire Information System</strong> stellt die ECMWF-basierten Feuerwetter-Layer (FWI, Perzentil, FFMC, DMC, DC, ISI, BUI) als Kartendienst bereit, aus dem buscosun die Sicht Gefahrenindex zeichnet. Weil der Dienst Bilder liefert, gibt es keine Punktabfrage. Die GWIS-Hotspots dienen als keyloser Rückfall, wenn FIRMS nicht erreichbar ist; sie tragen keine Intensität.</p>',
    links: ['/waldbrand/gefahrenindex', '/wissen/fire-weather-index/'],
  },
  {
    id: 'copernicus-ems', term: 'Copernicus EMS',
    short: 'Notfallkartierungsdienst der EU; eine EMS-Aktivierung für einen Brand ist neben der EFFIS-Kartierung der zweite Weg zu „bestätigt".',
    html: '<p>Der <strong>Copernicus Emergency Management Service</strong> wird von Behörden aktiviert, um Katastrophen satellitengestützt zu kartieren. buscosun ordnet offene Aktivierungen im Umkreis von 25 km und ±30 Tagen einem Ereignis zu und schreibt dann „bestätigt (EMS-Aktivierung EMSR…)" — Quelle im selben Satz. Ohne EFFIS-Kartierung oder EMS-Aktivierung bleibt jede Detektion „unbestätigt", der Normalfall.</p>',
    links: ['/methodik/brandradar-detektion-und-brandnarben/'],
  },
  {
    id: 'smi', term: 'SMI (Bodenfeuchteindex)',
    short: 'Normierter Bodenfeuchteindex des DWD-Modells ICON-D2: 0 entspricht dem Welkepunkt, 1 der Feldkapazität.',
    html: '<p>Der <strong>Soil Moisture Index</strong> macht Bodenfeuchte über verschiedene Bodenarten vergleichbar. buscosun zeigt ihn in der Sicht <a href="/waldbrand/trockenheit">Trockenheit</a> in zwei Tiefen — Oberboden bis 9 cm für das Zündrisiko, Wurzelzone bis 81 cm für die Dürre — mit 2,2 km Auflösung, stündlich bis 24 Stunden. Werte unter 0 (unter dem Welkepunkt) kommen vor; Wasser, Fels und Eis bleiben ohne Wert. Modell, keine Messung.</p>',
    links: ['/waldbrand/trockenheit', '/wissen/trockenperioden/'],
  },
  {
    id: 'welkepunkt', term: 'Welkepunkt',
    short: 'Bodenfeuchte, unterhalb derer Pflanzen kein Wasser mehr aufnehmen können; im SMI der Wert 0.',
    html: '<p>Am <strong>permanenten Welkepunkt</strong> ist das verbleibende Wasser so fest an die Bodenteilchen gebunden, dass Wurzeln es nicht mehr lösen — die Pflanze welkt und erholt sich auch nachts nicht. Das Gegenstück ist die Feldkapazität (SMI 1). Der Readout der Trockenheits-Sicht nennt, wie viel Prozent der Bodenfläche im DACH-Raum im aktuellen ICON-D2-Lauf am oder unter dem Welkepunkt liegen.</p>',
    links: ['/wissen/trockenperioden/', '/waldbrand/trockenheit'],
  },
  // ------------------------------------------------------------------ Radar
  {
    id: 'meshs', term: 'MESHS',
    short: 'MeteoSchweiz-Radarprodukt „Maximum Expected Severe Hail Size": die größte zu erwartende Hagelkorngröße in Millimetern.',
    html: '<p><strong>MESHS</strong> leitet aus der Höhe des 50-dBZ-Radarechos über der Nullgradgrenze die größte plausible Korngröße ab und wird ab etwa 2 cm ausgegeben. buscosun zeichnet es im Layer <a href="/wetterkarte/hagel">Hagel</a> in Stufen von 20 bis 60 mm, nur in der Saison vom 1. April bis 30. September. Eine Obergrenze aus dem Radar, keine Bodenmessung.</p>',
    links: ['/wissen/hagel-meshs-poh/', '/wetterkarte/hagel'],
  },
  {
    id: 'poh', term: 'POH (Probability of Hail)',
    short: 'MeteoSchweiz-Radarprodukt für die Wahrscheinlichkeit von Hagel am Boden, abgeleitet aus der Höhe des 45-dBZ-Echos.',
    html: '<p>Die <strong>Probability of Hail</strong> nutzt die Differenz zwischen der Höhe des 45-dBZ-Echos und der Nullgradgrenze: Je höher das starke Echo über der Frostgrenze, desto wahrscheinlicher Hagel. buscosun zeigt POH ab 10 Prozent — darunter wäre das Produkt Rauschen — in Stufen bis 90 Prozent, wahlweise zu MESHS. Für Österreich gibt es kein vergleichbares offenes Produkt.</p>',
    links: ['/wissen/hagel-meshs-poh/', '/wetterkarte/hagel'],
  },
  {
    id: 'konrad', term: 'KONRAD / KONRAD3D',
    short: 'Zellverfolgungsprodukt des DWD, das alle fünf Minuten konvektive Zellen im Radar erkennt und ihre Zugbahn bis 60 Minuten extrapoliert.',
    html: '<p><strong>KONRAD3D</strong> („Konvektive Entwicklung in Radarprodukten") liefert je Zelle Schwerpunkt, Umriss, Höhe, Zuggeschwindigkeit, Schweregrad 0–3, Hagelkennzeichen und Prognosepunkte mit Unsicherheitsellipsen. buscosun zeichnet daraus die <a href="/wetterkarte/zellbahnen">Zellbahnen</a> mit Zeitmarken bei 15, 30 und 60 Minuten. Aus Zugbahn und eigenem Standort rechnet buscosun zusaetzlich eine Ankunftszeit. Das Produkt deckt nur das deutsche Radarnetz ab und ist eine Auswertung, keine amtliche Warnung.</p>',
    links: ['/wissen/gewitterzellen-konrad/', '/wetterkarte/zellbahnen'],
  },
  {
    id: 'radolan-rv', term: 'RADOLAN-RV',
    short: 'DWD-Radarprodukt „Radar-Vorhersage": alle fünf Minuten 25 Frames von jetzt bis +120 Minuten auf einem 1-km-Gitter.',
    html: '<p><strong>RADOLAN-RV</strong> ist der deutsche Radar-Nowcast: Ein Paket je 5-Minuten-Lauf enthält die Analyse und 24 Vorhersageframes auf dem Gitter DE1200 (1 100 × 1 200 Zellen, polarstereografisch). Jede Zelle trägt den Niederschlag in 0,01 mm je 5 Minuten. buscosun nutzt es für Deutschland im Regenradar und im Niederschlags-Layer bis 2 Stunden, danach ICON-D2.</p>',
    links: ['/wissen/regenradar-radolan-inca-rzc/', '/regenradar'],
  },
  {
    id: 'inca', term: 'INCA',
    short: 'Alpines Nowcasting-System von GeoSphere Austria: 1 km, alle 15 Minuten, Vorhersage bis drei Stunden aus Radar, Stationen und Modell.',
    html: '<p><strong>INCA</strong> (Integrated Nowcasting through Comprehensive Analysis) verbindet Radar, Stationsmessungen und das Modell und berücksichtigt das Gelände — im Gebirge ein Vorteil gegenüber reiner Radar-Advektion. buscosun bezieht das Niederschlagsgitter mit zwölf Frames von +15 Minuten bis +3 Stunden und zeigt es über Österreich; der Zeitregler endet dort bei drei Stunden. Offen unter CC BY 4.0.</p>',
    links: ['/wissen/regenradar-radolan-inca-rzc/', '/regenradar'],
  },
  {
    id: 'rzc', term: 'rzc (MeteoSchweiz)',
    short: 'Radar-Regenrate der MeteoSchweiz, 1 km alle fünf Minuten — eine Analyse für „jetzt", ohne Vorhersage.',
    html: '<p>Das Produkt <strong>rzc</strong> (Produktcode RR) ist das Schweizer Gegenstück zur deutschen Radaranalyse. Es liegt als offene ODIM-HDF5-Datei vor und zeigt den aktuellen und vergangenen Niederschlag; das Schweizer INCA-Nowcasting ist nicht als offenes Gitter publiziert. buscosun nutzt rzc über der Schweiz für die ersten 30 Minuten und wechselt danach zu ICON-D2 — die Zeitachse sagt das.</p>',
    links: ['/wissen/regenradar-radolan-inca-rzc/', '/regenradar'],
  },
  {
    id: 'nowcast', term: 'Nowcast',
    short: 'Kürzestfristvorhersage für die nächsten null bis sechs Stunden, meist durch Verschieben aktueller Radarbilder statt durch ein Wettermodell.',
    html: '<p>Ein <strong>Nowcast</strong> nutzt die Beobachtung von jetzt: Das Radarbild wird mit dem geschätzten Bewegungsfeld weitergeschoben. In der ersten Stunde ist das genauer als jedes Modell, danach fällt die Trefferquote, weil Entstehung und Auflösung von Regen fehlen. buscosun bildet die 6-Stunden-Serie eines Ortes aus Radar bis 120 Minuten und Punktforecast, überblendet zwischen 90 und 150 Minuten.</p>',
    links: ['/methodik/regenradar-nowcast/', '/regenradar'],
  },
  {
    id: 'advektion', term: 'Advektion / Optical Flow',
    short: 'Verschieben eines Feldes mit einem Bewegungsfeld; im Radar-Nowcast wird das Bewegungsfeld per Optical Flow aus zwei Bildern geschätzt.',
    html: '<p><strong>Advektion</strong> bedeutet Transport mit der Strömung. Im Nowcast schätzt buscosun aus zwei RADOLAN-Frames im Abstand von fünf Minuten das Bewegungsfeld nach Horn-Schunck (<strong>Optical Flow</strong>) und schiebt das Bild intensitätserhaltend weiter (semi-Lagrange). Aus fünf Tempo-Skalen mal drei Richtungsstörungen entsteht ein 15-Varianten-Ensemble; der Anteil nasser Varianten je Zelle ist die Regenwahrscheinlichkeit.</p>',
    links: ['/methodik/regenradar-nowcast/'],
  },
  {
    id: 'lpi', term: 'LPI (Lightning Potential Index)',
    short: 'Modellgröße aus ICON-D2, die aus Aufwind und Eis-/Graupelgehalt der Wolke das Potenzial für Blitze abschätzt.',
    html: '<p>Der <strong>Lightning Potential Index</strong> wird im Modell aus dem Produkt von Aufwindgeschwindigkeit und dem Gehalt an Graupel, Schnee und Eis in der Mischphasenschicht berechnet — dort, wo Ladungstrennung stattfindet. buscosun kombiniert ihn im Gewitterpotenzial-Layer mit CAPE und CIN zu einem Index von 0 bis 100. Ein Potenzial, keine Blitzortung und keine Warnung.</p>',
    links: ['/wissen/gewitter-unwetter/', '/wetterkarte'],
  },
  // ---------------------------------------------------------- Thermodynamik
  {
    id: 'cape', term: 'CAPE',
    short: 'Convective Available Potential Energy: Energie in J/kg, die ein aufsteigendes Luftpaket zwischen LFC und EL freisetzen kann.',
    html: '<p><strong>CAPE</strong> ist im Skew-T die Fläche, in der das gehobene Luftpaket wärmer ist als die Umgebung. Werte unter 500 J/kg gelten als gering, 1 000 bis 2 000 als moderat, darüber als hoch — in Mitteleuropa sind mehr als 2 500 J/kg selten. CAPE allein macht kein Gewitter: Ohne Auslöser und bei starkem CIN bleibt die Energie ungenutzt. buscosun nutzt CAPE aus ICON-D2 und im Sounding aus ICON-EU.</p>',
    links: ['/wissen/skew-t/', '/wissen/gewitter-unwetter/'],
  },
  {
    id: 'cin', term: 'CIN',
    short: 'Convective Inhibition: Energie in J/kg, die ein Luftpaket aufbringen muss, um den Deckel unter dem LFC zu überwinden.',
    html: '<p><strong>CIN</strong> ist die Hemmung — im Skew-T die Fläche unter dem LFC, in der das Paket kälter ist als die Umgebung. Kleine Beträge (bis etwa 50 J/kg) lassen Gewitter leicht auslösen; große Beträge halten die Energie zurück, bis ein kräftiger Auslöser kommt — dann oft explosiv. Modellfelder füllen CIN mit Sentinelwerten wie −999,9; buscosun filtert das, bevor daraus ein Index wird.</p>',
    links: ['/wissen/skew-t/', '/wissen/gewitter-unwetter/'],
  },
  {
    id: 'lcl', term: 'LCL (Hebungskondensationsniveau)',
    short: 'Höhe, in der ein vom Boden gehobenes Luftpaket seine Sättigung erreicht — die Basis der Quellwolken.',
    html: '<p>Das <strong>Lifting Condensation Level</strong> folgt aus Temperatur und Taupunkt am Boden: Je größer die Spreizung, desto höher die Wolkenbasis, grob 125 m je Grad Spreizung. Für Gleitschirm und Segelflug ist das LCL die Cumulusbasis und damit die nutzbare Höhe der Thermik. buscosun berechnet es im Sounding und markiert es im Skew-T.</p>',
    links: ['/wissen/skew-t/', '/wissen/thermik/'],
  },
  {
    id: 'lfc', term: 'LFC (Niveau freier Konvektion)',
    short: 'Höhe, ab der ein gehobenes Luftpaket wärmer als die Umgebung ist und ohne weiteren Antrieb aufsteigt.',
    html: '<p>Das <strong>Level of Free Convection</strong> liegt über dem LCL, sobald das feuchtadiabatisch aufsteigende Paket die Umgebungstemperatur überholt. Zwischen Boden und LFC wirkt die Hemmung (CIN), zwischen LFC und EL die Energie (CAPE). Liegt das LFC sehr hoch oder fehlt es, gibt es an diesem Tag keine freie Konvektion. buscosun markiert es im Skew-T des Querschnitts.</p>',
    links: ['/wissen/skew-t/'],
  },
  {
    id: 'el', term: 'EL (Gleichgewichtsniveau)',
    short: 'Höhe, in der ein aufsteigendes Luftpaket wieder so kalt ist wie die Umgebung — die Obergrenze der Gewitterwolke.',
    html: '<p>Das <strong>Equilibrium Level</strong> schließt die CAPE-Fläche nach oben ab. Aufsteigende Luft schießt aus Trägheit noch darüber hinaus (Overshooting Top), breitet sich aber am EL seitlich zum Amboss aus. Ein hohes EL nahe der Tropopause kennzeichnet kräftige Gewitter; buscosun zeigt es als Marker im Skew-T und nutzt es zur Einordnung der Wolkenobergrenze.</p>',
    links: ['/wissen/skew-t/'],
  },
  {
    id: 'lifted-index', term: 'Lifted Index',
    short: 'Temperaturdifferenz in Kelvin zwischen Umgebung und gehobenem Luftpaket in 500 hPa; negative Werte bedeuten Labilität.',
    html: '<p>Der <strong>Lifted Index</strong> ist der klassische Einzahl-Indikator für Gewitterneigung: Umgebungstemperatur in 500 hPa minus Temperatur eines vom Boden gehobenen Pakets. Werte um 0 bis −2 K gelten als leicht labil, −4 bis −6 als deutlich labil, unter −6 als stark labil. Er ist einfacher als CAPE, aber grob; buscosun zeigt ihn im Profi-Panel des Soundings neben CAPE und CIN.</p>',
    links: ['/wissen/skew-t/', '/wissen/gewitter-unwetter/'],
  },
  {
    id: 'updraft-helicity', term: 'Updraft Helicity',
    short: 'Modellgröße aus Aufwind und Vertikalwirbel in der Wolke; hohe Beträge deuten auf rotierende Aufwinde in kräftigen Gewitterzellen hin.',
    html: '<p>Die <strong>Updraft Helicity</strong> integriert das Produkt aus Vertikalgeschwindigkeit und vertikaler Wirbelstärke über eine Schicht, typischerweise 2 bis 5 km. Sie ist ein Hinweis auf organisierte, rotierende Aufwinde — in Mitteleuropa deutlich seltener und schwächer als in den nordamerikanischen Referenzstudien. buscosun nutzt sie im Experten-Layer Rotationspotenzial mit bewusst konservativer, an der gemessenen Skala kalibrierter Wortwahl: ein Verdacht auf rotierende Zellen, nie mehr.</p>',
    links: ['/wissen/gewitter-unwetter/', '/wetterkarte'],
  },
  {
    id: 'sdi', term: 'SDI (Supercell Detection Index)',
    short: 'Modellgröße aus ICON-D2, die aus Rotation und Aufwind das Vorhandensein organisierter, rotierender Gewitterzellen anzeigt.',
    html: '<p>Der <strong>Supercell Detection Index</strong> kombiniert die Korrelation von Vertikalwind und Wirbelstärke in der Wolke zu einem Wert, der organisierte Zellen von gewöhnlicher Konvektion trennt. buscosun glättet ihn zusammen mit der Updraft Helicity über ein 5×5-Fenster und zeigt daraus einen Verdachts-Score im Experten-Layer — mit konservativer Formulierung, ohne Warnsprache. Amtliche Unwetterwarnungen gibt allein der Wetterdienst heraus.</p>',
    links: ['/wissen/gewitter-unwetter/'],
  },
  {
    id: 'lapse-rate', term: 'Lapse-Rate (Temperaturgradient)',
    short: 'Abnahme der Temperatur mit der Höhe; trockenadiabatisch rund 1 °C je 100 m, feuchtadiabatisch etwa 0,5–0,6 °C, im Mittel 0,65 °C.',
    html: '<p>Die <strong>Lapse-Rate</strong> entscheidet über Stabilität: Nimmt die Umgebung schneller ab als ein aufsteigendes Paket abkühlt, ist die Schicht labil. buscosun nutzt die Lapse-Rate für die Höhenkorrektur der Punktvorhersage — Modellgitterpunkte liegen selten auf der Höhe des gesuchten Ortes — und rechnet dafür mit der aktuellen Schichtung statt eines festen Werts. Details: <a href="/wissen/hoehenkorrektur-lapse-rate/">Höhenkorrektur</a>.</p>',
    links: ['/wissen/hoehenkorrektur-lapse-rate/', '/methodik/hoehenkorrektur/'],
  },
  {
    id: 'inversion', term: 'Inversion',
    short: 'Schicht, in der die Temperatur mit der Höhe zunimmt statt abnimmt; wirkt als Deckel für Nebel, Schadstoffe und Konvektion.',
    html: '<p>Eine <strong>Temperaturinversion</strong> entsteht durch nächtliche Ausstrahlung am Boden, durch Absinken in Hochdruckgebieten oder durch aufgleitende Warmluft. Unter ihr sammeln sich Kaltluft, Hochnebel und Feinstaub; darüber ist es oft sonnig und mild. buscosun erkennt Inversionsbänder im ICON-EU-Profil und zeigt sie im Querschnitt; dünne Schichten unter 200 m sind mit dem groben Levelsatz nicht sicher aufgelöst.</p>',
    links: ['/wissen/temperaturinversion/', '/atmosphaere/querschnitt'],
  },
  {
    id: 'nebelobergrenze', term: 'Nebelobergrenze',
    short: 'Höhe, in der eine Nebel- oder Hochnebeldecke endet; darüber beginnt die Sonne, meist direkt unter einer Inversion.',
    html: '<p>Die <strong>Nebelobergrenze</strong> ist die Zahl, die im Winter über Sonne oder Grau entscheidet: Wer oberhalb wandert oder fährt, hat Fernsicht. Sie liegt im DACH-Winter oft zwischen 600 und 1 200 m und fällt in der Regel mit der Untergrenze der Inversion zusammen. buscosun schätzt sie aus Feuchteprofil und Inversion; Webcams und Messungen an Berghängen bleiben die Referenz.</p>',
    links: ['/wissen/nebel-hochnebel-nebelobergrenze/', '/wissen/temperaturinversion/'],
  },
  {
    id: 'grenzschicht', term: 'Grenzschicht',
    short: 'Untere, vom Boden beeinflusste Schicht der Atmosphäre, in der Reibung, Erwärmung und Thermik wirken; tagsüber oft 1 bis 2 km dick.',
    html: '<p>Die <strong>atmosphärische Grenzschicht</strong> wächst tagsüber mit der Erwärmung des Bodens und schrumpft nachts auf wenige hundert Meter. In ihr nimmt der Wind mit der Höhe zu, weil die Bodenreibung nachlässt — buscosun rechnet das im Arbeitsfenster mit einem Potenzgesetz (Exponent 0,2, gedeckelt bei 1 500 m). Ihre Obergrenze ist zugleich die Thermik-Obergrenze; aus ihrer Tiefe schätzt buscosun die Thermikstärke.</p>',
    links: ['/wissen/windgrenzwerte-arbeit-drohne/', '/wissen/thermik/'],
  },
  {
    id: 'foehn', term: 'Föhn',
    short: 'Warmer, trockener Fallwind im Lee eines Gebirges, der beim Absinken um rund 1 °C je 100 m erwärmt wird.',
    html: '<p><strong>Föhn</strong> entsteht, wenn Luft ein Gebirge überströmt, im Luv abregnet und im Lee trockenadiabatisch absinkt. Im Alpenraum bringt er Temperatursprünge von 5 bis 15 °C, kräftige Böen und außergewöhnliche Fernsicht. buscosun erkennt Föhnlagen heuristisch aus Anströmung, Druckgefälle und Feuchte und zeigt sie in der Atmosphären-Ansicht; Sturmwarnungen gibt allein der Wetterdienst heraus.</p>',
    links: ['/wissen/foehn/', '/atmosphaere/querschnitt'],
  },
  {
    id: 'talwind', term: 'Talwind',
    short: 'Tagsüber talaufwärts wehender, thermisch angetriebener Wind im Gebirge; nachts kehrt er sich als Bergwind um.',
    html: '<p>Der <strong>Talwind</strong> setzt am Vormittag ein, wenn sich Hänge und Talboden erwärmen, und erreicht nachmittags in großen Alpentälern 5 bis 8 m/s. Nach Sonnenuntergang dreht die Strömung zum Bergwind. buscosun schätzt die Umkehrzeiten aus dem 48-h-Bodenwind, projiziert auf die aus dem Gelände abgeleitete Hangrichtung — ein Richtwert, kein Talachsenmodell.</p>',
    links: ['/wissen/talwind/', '/atmosphaere/fliegen'],
  },
  {
    id: 'thermik', term: 'Thermik',
    short: 'Aufsteigende Warmluftblasen über sonnenerwärmtem Boden, die Segelflieger, Gleitschirme und Greifvögel tragen.',
    html: '<p><strong>Thermik</strong> entsteht, wenn sich bodennahe Luft stärker erwärmt als ihre Umgebung und als Blase oder Schlauch aufsteigt — bis zur Grenzschicht-Obergrenze oder bis zur Cumulusbasis. Auslöser sind dunkle Flächen, Südhänge und Kanten. buscosun schätzt die Thermikstärke von 0 bis 5 m/s aus der Grenzschichttiefe des ICON-EU-Profils — eine Schätzung, kein gemessener Steigwert.</p>',
    links: ['/wissen/thermik/', '/atmosphaere/fliegen'],
  },
  {
    id: 'taupunkt', term: 'Taupunkt',
    short: 'Temperatur, auf die Luft abgekühlt werden muss, damit ihr Wasserdampf kondensiert; ein direktes Maß für den Feuchtegehalt.',
    html: '<p>Der <strong>Taupunkt</strong> ist aussagekräftiger als die relative Feuchte, weil er nicht von der Temperatur abhängt: 18 °C Taupunkt fühlen sich schwül an, 5 °C trocken. Die Differenz zur Lufttemperatur (Spreizung) bestimmt die Wolkenbasis und das Nebelrisiko. buscosun berechnet ihn nach der Magnus-Formel und nutzt ihn für Tauwarnhinweise in der Astro-Bewertung und für Wolkenschichten im Sounding.</p>',
    links: ['/wissen/skew-t/', '/wissen/nebel-hochnebel-nebelobergrenze/'],
  },
  {
    id: 'nullgradgrenze', term: 'Nullgradgrenze',
    short: 'Höhe, in der die Lufttemperatur 0 °C erreicht; liegt in der Regel einige hundert Meter über der Schneefallgrenze.',
    html: '<p>Die <strong>Nullgradgrenze</strong> wird aus dem Temperaturprofil abgelesen und ist die Bezugshöhe für Hagelprodukte (MESHS, POH) und für die Schneefallgrenze. Weil fallender Schnee beim Schmelzen die Luft kühlt, liegt die Schneefallgrenze bei kräftigem Niederschlag 200 bis 400 m tiefer. buscosun bestimmt sie im Sounding und markiert sie im Querschnitt; bei mehreren Nulldurchgängen zählt der unterste.</p>',
    links: ['/wissen/schneefallgrenze/', '/atmosphaere/querschnitt'],
  },
  {
    id: 'schneefallgrenze', term: 'Schneefallgrenze',
    short: 'Höhe, unterhalb derer Niederschlag als Regen statt als Schnee fällt; sie liegt unter der Nullgradgrenze und sinkt bei Starkniederschlag.',
    html: '<p>Die <strong>Schneefallgrenze</strong> hängt von Temperatur, Feuchte und Niederschlagsintensität ab: Trockene Luft und kräftiger Schneefall drücken sie durch Verdunstungs- und Schmelzkühlung nach unten, in engen Tälern zusätzlich durch Kaltluftseen. buscosun leitet sie im Niederschlags-Layer und in der Punktvorhersage aus dem Modellprofil ab und trennt Regen, Schnee und Graupel als Phase. Ausführlich: <a href="/wissen/schneefallgrenze/">Schneefallgrenze</a>.</p>',
    links: ['/wissen/schneefallgrenze/', '/wetterkarte/niederschlag'],
  },
  {
    id: 'boee', term: 'Böe',
    short: 'Kurzzeitige Windspitze von wenigen Sekunden, deutlich über dem 10-Minuten-Mittelwind; maßgeblich für Schäden und Arbeitsgrenzen.',
    html: '<p>Eine <strong>Böe</strong> ist der Spitzenwert des Windes über etwa drei Sekunden; Modelle geben die maximale Böe je Stunde in 10 m Höhe aus. Sie liegt bei turbulenter Schichtung 1,5- bis 2-fach über dem Mittelwind, bei Gewittern noch höher. buscosun zeigt Böen als ICON-D2-Fläche im Layer <a href="/wetterkarte/boeen">Böen</a> und rechnet sie im Arbeitsfenster auf Arbeitshöhe hoch.</p>',
    links: ['/wissen/windboeen-sturm/', '/wetterkarte/boeen'],
  },
  {
    id: 'beaufort', term: 'Beaufort-Skala',
    short: 'Zwölfstufige Windskala nach Wirkung: 0 Windstille, 6 starker Wind ab 39 km/h, 8 stürmischer Wind ab 62 km/h, 12 Orkan ab 118 km/h.',
    html: '<p>Die <strong>Beaufort-Skala</strong> ordnet Windgeschwindigkeiten Beobachtungen zu — Stufe 6 bewegt große Äste, Stufe 8 bricht Zweige, Stufe 10 entwurzelt Bäume. Sie bezieht sich auf den 10-Minuten-Mittelwind, nicht auf Böen; Prüfstatiken für Zelte und Bühnen nennen ihre Grenzen oft in Beaufort. Wetterdienste warnen nach Böen in km/h; buscosun zeigt km/h und nennt Beaufort nur zur Orientierung.</p>',
    links: ['/wissen/windboeen-sturm/', '/wissen/windgrenzwerte-arbeit-drohne/'],
  },
  // --------------------------------------------------------------- Foto/Astro
  {
    id: 'goldene-stunde', term: 'Goldene Stunde',
    short: 'Phase mit warmem, flachem Sonnenlicht, wenn die Sonne zwischen 6 Grad über und 4 Grad unter dem Horizont steht.',
    html: '<p>Die <strong>goldene Stunde</strong> ist keine Uhrzeit, sondern ein Sonnenstand: buscosun rechnet sie von −4° bis +6° Sonnenhöhe im Minutenraster für jeden Ort und Tag. Sonnenauf- und -untergang (−0,833°) liegen innerhalb. Ihre Dauer schwankt mit Jahreszeit und Breite von unter einer bis über anderthalb Stunden. Die Eventplanung mit Anlass Fotografie zeigt die Fenster und die erwartete Lichtstimmung.</p>',
    links: ['/wissen/goldene-blaue-stunde/', '/eventplanung'],
  },
  {
    id: 'blaue-stunde', term: 'Blaue Stunde',
    short: 'Dämmerungsphase mit tiefblauem Himmel, wenn die Sonne 4 bis 6 Grad unter dem Horizont steht — morgens vor, abends nach der goldenen Stunde.',
    html: '<p>In der <strong>blauen Stunde</strong> streut die Atmosphäre nur noch kurzwelliges Licht, während Kunstlicht und Himmel ähnlich hell sind — die Zeit für Stadt- und Architekturfotografie. buscosun definiert sie von −6° bis −4° Sonnenhöhe; ihr Ende bei −6° ist zugleich das Ende der bürgerlichen Dämmerung. Um die Sommersonnenwende kann sie nördlich der Alpen nachts ausbleiben.</p>',
    links: ['/wissen/goldene-blaue-stunde/', '/eventplanung'],
  },
  {
    id: 'astronomische-dunkelheit', term: 'Astronomische Dunkelheit',
    short: 'Nachtphase, in der die Sonne mehr als 18 Grad unter dem Horizont steht und kein Restlicht der Dämmerung mehr den Himmel aufhellt.',
    html: '<p>Erst in der <strong>astronomischen Dunkelheit</strong> sind schwache Objekte wie Milchstraße und Nebel voll sichtbar. Im Hochsommer wird die Grenze von −18° nördlich von etwa 48° Breite nachts nicht erreicht; buscosun weist solche Nächte als „ohne astronomische Dunkelheit" aus und rechnet das Dunkelheitsfenster für jede Nacht im Minutenraster — die Basis der Astro-Bewertung mit Mond, Wolken und Tau.</p>',
    links: ['/wissen/lichtverschmutzung-bortle/', '/eventplanung'],
  },
  {
    id: 'bortle-skala', term: 'Bortle-Skala',
    short: 'Neunstufige, visuelle Skala der Himmelsqualität von 1 (exzellent dunkel) bis 9 (innerstädtisch), eingeführt 2001 von John Bortle.',
    html: '<p>Die <strong>Bortle-Skala</strong> beschreibt, was ein geübtes Auge sieht — Klasse 1 bis 2 zeigt die Milchstraße mit Struktur, ab Klasse 6 bleiben nur helle Sterne. Die Angabe auf buscosun ist eine Offline-Schätzung aus Entfernung und Größe der nächsten 35 Großstädte, kalibriert auf etwa 8 im Stadtkern und 2 in abgelegener Lage; sie basiert nicht auf Satellitenmessungen und kann lokal abweichen.</p>',
    links: ['/wissen/lichtverschmutzung-bortle/', '/eventplanung'],
  },
  // ------------------------------------------------------------------ Klima
  {
    id: 'gdd', term: 'GDD (Wachstumsgradtage)',
    short: 'Jahressumme der Beträge, um die das Tagesmittel eine Basistemperatur übersteigt; bei buscosun Basis 10 °C.',
    html: '<p><strong>Growing Degree Days</strong> messen die Wärme, die Pflanzen für ihre Entwicklung erhalten: Ein Tag mit 18 °C Mittel zählt 8 Gradtage über Basis 10 °C, ein Tag mit 7 °C null. Die kumulierte Kurve zeigt, ob ein Jahr „vorne" oder „hinten" liegt. buscosun rechnet sie im Wetterarchiv je Jahr und als Verlauf; die Basis ist ein Standardwert, keine Sortenkalibrierung.</p>',
    links: ['/wissen/wachstumsgradtage-heizgradtage/', '/wetterarchiv'],
  },
  {
    id: 'hdd', term: 'HDD (Heizgradtage)',
    short: 'Jahressumme der Beträge, um die das Tagesmittel unter einer Basistemperatur liegt; bei buscosun Basis 15 °C.',
    html: '<p><strong>Heating Degree Days</strong> normieren den Heizbedarf eines Jahres: Ein Tag mit 2 °C Mittel zählt 13 Gradtage unter Basis 15 °C. Die in Deutschland verbreitete Gradtagzahl nach VDI 3807 rechnet zusätzlich mit 20 °C Raumtemperatur (G20/15) und liefert höhere Zahlen; vergleichbar ist der Trend, nicht der Betrag. buscosun zeigt HDD je Jahr im Wetterarchiv.</p>',
    links: ['/wissen/wachstumsgradtage-heizgradtage/', '/wetterarchiv'],
  },
  {
    id: 'kenntage', term: 'Kenntage (Hitzetag, Sommertag, Tropennacht, Frosttag, Eistag)',
    short: 'Tage, an denen eine Temperatur eine feste Schwelle über- oder unterschreitet: Sommertag ≥ 25 °C, Hitzetag ≥ 30 °C, Tropennacht ≥ 20 °C Minimum, Frosttag unter 0 °C Minimum, Eistag unter 0 °C Maximum.',
    html: '<p><strong>Kenntage</strong> machen Klimatrends greifbar, weil sich ihre Zahl stärker ändert als der Mittelwert. buscosun zählt alle fünf Typen je Jahr aus den Tagesbeobachtungen der nächsten Station, listet Rekordjahre und lässt die Schwellen anpassen; der Standard folgt der DWD-Definition. Zusätzlich erkennt es Hitzewellen als mindestens drei Tage in Folge mit 28 °C oder mehr — eine eigene Arbeitsdefinition.</p>',
    links: ['/wissen/kenntage-hitzetage-frosttage/', '/wetterarchiv'],
  },
  {
    id: 'klimastreifen', term: 'Klimastreifen (Warming Stripes)',
    short: 'Grafik von Ed Hawkins (2018): jedes Jahr ein Farbstreifen, blau für kälter, rot für wärmer als ein Bezugswert.',
    html: '<p><strong>Klimastreifen</strong> verzichten auf Achsen und machen den Trend auf einen Blick lesbar. Ihre Farbe hängt vom Bezug ab — buscosun färbt im Wetterarchiv gegen das Mittel der gezeigten Jahre und bietet in der Anomalie-Darstellung die Referenzperioden 1961–1990, 1971–2000 und 1991–2020. Streifen verschiedener Anbieter sind nur mit genanntem Bezug und genannter Farbspanne vergleichbar.</p>',
    links: ['/wissen/klimastreifen/', '/wetterarchiv'],
  },
  {
    id: 'referenzperiode-1961-1990', term: 'Referenzperiode 1961–1990',
    short: 'Von der WMO als feste Bezugsperiode für die Bewertung des Klimawandels empfohlener Dreißigjahreszeitraum.',
    html: '<p>Klimatologische Normalwerte werden über 30 Jahre gemittelt. Die <strong>Periode 1961–1990</strong> gilt als weitgehend unbeeinflusste Referenz, während 1991–2020 die aktuelle Normalperiode für „normales Wetter" ist. Die Differenz beider zeigt die Erwärmung der letzten Jahrzehnte. buscosun berechnet Normalwert und Anomalie je Variable über die gewählte Periode und nennt, wie viele Jahre der Reihe in ihr liegen.</p>',
    links: ['/wissen/klimastreifen/', '/wetterarchiv'],
  },
  {
    id: 'perzentil', term: 'Perzentil',
    short: 'Rangwert einer Verteilung: Das 95. Perzentil ist der Wert, unter dem 95 Prozent aller Beobachtungen liegen.',
    html: '<p><strong>Perzentile</strong> sagen, wie ungewöhnlich ein Wert für einen Ort ist, unabhängig von der absoluten Skala. Im Brandradar ist die Ansicht „Einordnung" das Perzentil des FWI gegenüber einer rund 40-jährigen Reihe für genau diesen Ort — ein hohes Perzentil heißt „ungewöhnlich für hier", nicht „absolut extrem". Bei Thermalanomalien gilt eine Spitzenleistung über dem Doppelten des 95. Perzentils als abweichend.</p>',
    links: ['/waldbrand/gefahrenindex', '/wissen/fire-weather-index/'],
  },
  {
    id: 'trockenperiode', term: 'Trockenperiode',
    short: 'Folge von Tagen praktisch ohne Niederschlag; buscosun zählt mindestens zehn Tage in Folge mit weniger als 1 mm.',
    html: '<p>Eine <strong>Trockenperiode</strong> ist ein meteorologisches Defizit; ob daraus Dürre wird, entscheiden Bodenfeuchte, Verdunstung und Vorgeschichte. Es gibt keine einheitliche Definition — Schwelle und Mindestdauer müssen genannt werden. buscosun erkennt Trockenperioden rückblickend in den Stationsreihen des Wetterarchivs mit Beginn, Ende und Dauer und zeigt vorausschauend den Bodenfeuchteindex aus ICON-D2 in der Sicht Trockenheit.</p>',
    links: ['/wissen/trockenperioden/', '/wetterarchiv'],
  },
  // ---------------------------------------------------------- Modelle/Fusion
  {
    id: 'ensemble', term: 'Ensemble',
    short: 'Vorhersagesystem, das denselben Modelllauf mehrfach mit leicht gestörten Anfangsbedingungen rechnet, um die Unsicherheit abzuschätzen.',
    html: '<p>Ein <strong>Ensemble</strong> ersetzt die eine „beste" Vorhersage durch viele plausible: ICON-D2-EPS rechnet 20 Mitglieder, das ECMWF-Ensemble 51. Streuen die Mitglieder wenig, ist die Lage sicher; streuen sie weit, ist sie offen. buscosun nutzt Ensemble-Informationen in der Fusion der Punktvorhersage und im Radar-Nowcast (15 Advektionsvarianten) und weist die Unsicherheit als Spread aus.</p>',
    links: ['/wissen/modellvergleich-unsicherheit/', '/funktionen/modellvergleich/'],
  },
  {
    id: 'spread', term: 'Spread',
    short: 'Streuung der Ensemble-Mitglieder oder verschiedener Modelle um ihren Mittelwert; ein Maß für die Unsicherheit der Vorhersage.',
    html: '<p>Der <strong>Spread</strong> ist die praktische Übersetzung von Unsicherheit: Ein Temperatur-Spread von 1 °C bedeutet Einigkeit, einer von 6 °C eine offene Lage — etwa bei unsicherer Nebelauflösung oder Frontlage. Im Modellvergleich zeigt buscosun den Spread zwischen ICON-D2, ICON-EU und weiteren Modellen je Stunde; bleibt er über Tage klein, ist das ein Hinweis auf eine Blockadelage.</p>',
    links: ['/wissen/modellvergleich-unsicherheit/', '/funktionen/modellvergleich/'],
  },
  {
    id: 'brier-score', term: 'Brier Score',
    short: 'Gütemaß für Wahrscheinlichkeitsvorhersagen: mittlerer quadratischer Abstand zwischen vorhergesagter Wahrscheinlichkeit und Eintreten (0 oder 1).',
    html: '<p>Der <strong>Brier Score</strong> liegt zwischen 0 (perfekt) und 1 (maximal falsch). Eine Vorhersage von 70 Prozent Regen, gefolgt von Regen, trägt (0,7 − 1)² = 0,09 bei; bleibt es trocken, 0,49. buscosun rechnet ihn auf der Validierungsseite des Regenradar-Nowcasts live gegen das beobachtete Radar nach, damit die angezeigte Regenwahrscheinlichkeit überprüfbar bleibt.</p>',
    links: ['/methodik/regenradar-nowcast/', '/methodik/konfidenz-und-trefferquote/'],
  },
  {
    id: 'bss', term: 'BSS (Brier Skill Score)',
    short: 'Verbesserung des Brier Score gegenüber einer Referenz wie der Klimatologie; 1 ist perfekt, 0 nicht besser als die Referenz, negativ schlechter.',
    html: '<p>Der <strong>Brier Skill Score</strong> beantwortet, ob eine Wahrscheinlichkeitsvorhersage überhaupt etwas kann: BSS = 1 − Brier / Brier(Referenz). Eine Regenwahrscheinlichkeit, die nur die klimatologische Häufigkeit nennt, hat BSS 0. buscosun weist den Skill des Radar-Nowcasts gegen die Persistenz aus — das aktuelle Bild einfach stehen zu lassen — weil das die ehrliche Messlatte für ein Nowcast ist.</p>',
    links: ['/methodik/regenradar-nowcast/', '/methodik/konfidenz-und-trefferquote/'],
  },
  {
    id: 'reliability', term: 'Reliability (Zuverlässigkeit)',
    short: 'Eigenschaft einer Wahrscheinlichkeitsvorhersage, dass Ereignisse mit 70 Prozent Vorhersage auch in 70 Prozent der Fälle eintreten.',
    html: '<p>Ein <strong>Reliability-Diagramm</strong> trägt die vorhergesagte Wahrscheinlichkeit gegen die beobachtete Häufigkeit auf; die Diagonale ist perfekt. Liegt die Kurve darunter, ist die Vorhersage überkonfident. buscosun kalibriert die Regenwahrscheinlichkeit des Nowcasts isotonisch, damit die Kurve auf der Diagonalen liegt, und zeigt das Diagramm auf der Validierungsseite. Ohne Reliability sagt eine Prozentzahl nichts.</p>',
    links: ['/methodik/regenradar-nowcast/', '/methodik/konfidenz-und-trefferquote/'],
  },
  {
    id: 'ece', term: 'ECE (Expected Calibration Error)',
    short: 'Mittlerer Abstand zwischen vorhergesagter Wahrscheinlichkeit und beobachteter Häufigkeit über alle Wahrscheinlichkeitsklassen, gewichtet nach Häufigkeit.',
    html: '<p>Der <strong>Expected Calibration Error</strong> fasst ein Reliability-Diagramm in einer Zahl zusammen: 0 bedeutet perfekte Kalibrierung, 0,1 einen mittleren Fehler von zehn Prozentpunkten. Er ist die Kennzahl, mit der buscosun die Konfidenzangaben der Punktvorhersage und des Nowcasts überwacht — in der Methodik zur Konfidenz und Trefferquote steht, gegen welche Beobachtungen und über welchen Zeitraum.</p>',
    links: ['/methodik/konfidenz-und-trefferquote/'],
  },
  {
    id: 'mosmix', term: 'MOSMIX',
    short: 'Statistisch nachbearbeitete Punktvorhersage des DWD für über 5 000 Stationen weltweit, stündlich bis zehn Tage voraus.',
    html: '<p><strong>MOSMIX</strong> (Model Output Statistics Mix) korrigiert die Modelle ICON und IFS mit der Fehlerstatistik jeder Station und liefert so lokal angepasste Werte für Temperatur, Wind, Niederschlag und mehr. Es ist keine Fläche, sondern eine Liste von Stationen — zwischen ihnen muss interpoliert werden. buscosun nutzt MOSMIX als eine Quelle im Quellenmix der Punktvorhersage; die Gewichtung erklärt die Methodik.</p>',
    links: ['/methodik/punktvorhersage-quellenmix/', '/methodik/wettermodelle/'],
  },
  {
    id: 'icon-d2', term: 'ICON-D2',
    short: 'Hochauflösendes DWD-Regionalmodell mit 2,2 km Gitter über Deutschland und Nachbarländern, acht Läufe täglich bis +48 Stunden.',
    html: '<p><strong>ICON-D2</strong> ist das Arbeitspferd der buscosun-Wetterkarte: Wind, Temperatur, Böen, Niederschlag, Wolken, CAPE, Bodenfeuchte und Feuerwetter-Treiber kommen als Fläche aus diesem Modell, stündlich und mit Läufen alle drei Stunden. Es löst Gewitter explizit auf, ist aber kein Nowcast. Die Daten werden client-seitig aus GRIB2 dekodiert; für die Karte liegen sie als vorverarbeitete Bilder auf einem CDN.</p>',
    links: ['/methodik/wettermodelle/', '/wetterkarte'],
  },
  {
    id: 'icon-eu', term: 'ICON-EU',
    short: 'DWD-Modell mit rund 7 km Gitter über Europa, vier Läufe täglich bis +120 Stunden; Quelle des Vertikalprofils auf buscosun.',
    html: '<p><strong>ICON-EU</strong> ist der Nest-Bereich des globalen ICON über Europa. Es reicht weiter voraus als ICON-D2 und liefert Druckflächen für das Sounding: Temperatur, Feuchte und Wind auf Standardniveaus, aus denen buscosun Skew-T, Grenzschicht und Inversionen ableitet. Die Druckflächen kommen mit CCSDS-Kompression, die der eigene GRIB2-Decoder dekodiert. Für Tage 3 bis 5 ist es die feinste offene DWD-Quelle.</p>',
    links: ['/methodik/wettermodelle/', '/wissen/skew-t/'],
  },
  {
    id: 'arome', term: 'AROME',
    short: 'Hochauflösendes Regionalmodell von Météo-France (1,3 km), das auch für Österreich (GeoSphere) und die Schweiz (COSMO-Nachfolger ICON-CH) verwandt ist.',
    html: '<p><strong>AROME</strong> löst wie ICON-D2 Konvektion explizit auf und ist im Alpenraum eine wichtige zweite Meinung — GeoSphere Austria betreibt eine eigene AROME-Konfiguration. buscosun bezieht AROME-Felder für Frankreich-nahe Gebiete und den Modellvergleich; im DACH-Kern bleibt ICON-D2 der Standard. Wo ein Modell nicht offen verfügbar ist, sagt der Modellvergleich das, statt es stillschweigend zu ersetzen.</p>',
    links: ['/methodik/wettermodelle/', '/funktionen/modellvergleich/'],
  },
  {
    id: 'ifs', term: 'IFS (ECMWF)',
    short: 'Globales Modell des Europäischen Zentrums für mittelfristige Wettervorhersage, rund 9 km Gitter, bis 15 Tage; als Ensemble mit 51 Mitgliedern.',
    html: '<p>Das <strong>Integrated Forecasting System</strong> gilt als bestes globales Modell für die Mittelfrist. Seit 2024 sind Teile der Läufe offen verfügbar. buscosun nutzt IFS im Modellvergleich und als Träger des Feuerwetterindex: Der FWI von EFFIS/GWIS wird aus der ECMWF-Vorhersage gerechnet. Für Stundenwerte im Gebirge ist es zu grob — dort zählen ICON-D2 und AROME.</p>',
    links: ['/methodik/wettermodelle/', '/wissen/fire-weather-index/'],
  },
  {
    id: 'gfs', term: 'GFS (NOAA)',
    short: 'Globales Modell des US-Wetterdienstes NOAA mit rund 13 km Gitter, vier Läufe täglich bis 16 Tage; vollständig offen.',
    html: '<p>Das <strong>Global Forecast System</strong> ist die am längsten frei verfügbare globale Quelle und deshalb in vielen Apps der Standard — mit Nachteilen im Alpenraum, wo 13 km Gitter Täler nicht auflösen. buscosun zieht es für den Modellvergleich und den Globus heran und hält es als Fallback für das Sounding, wenn ICON-EU nicht erreichbar ist. Im DACH-Kern hat ICON-D2 Vorrang.</p>',
    links: ['/methodik/wettermodelle/', '/funktionen/modellvergleich/'],
  },
  {
    id: 'eps', term: 'EPS (Ensemble Prediction System)',
    short: 'Ensemble-Variante eines Modells; ICON-D2-EPS rechnet 20 Mitglieder mit 2,2 km Gitter und liefert Wahrscheinlichkeiten statt einer Zahl.',
    html: '<p>Ein <strong>EPS</strong> beantwortet die Frage „wie sicher?": Aus 20 (ICON-D2-EPS) oder 51 (ECMWF) Mitgliedern entstehen Wahrscheinlichkeiten für Schwellen — etwa „30 Prozent für mehr als 10 mm Regen". buscosun nutzt ICON-D2-EPS in der Fusion der Punktvorhersage; die Felder sind groß und werden nur bei Bedarf geladen. Ein EPS ersetzt kein Nowcast für die nächste Stunde.</p>',
    links: ['/wissen/modellvergleich-unsicherheit/', '/methodik/punktvorhersage-quellenmix/'],
  },
  {
    id: 'dem-terrarium', term: 'DEM / Terrarium',
    short: 'Digitales Geländemodell als Kachel-Raster; Terrarium ist ein Kodierungsformat, das Höhen in den RGB-Kanälen eines PNG speichert.',
    html: '<p>Ein <strong>Digital Elevation Model</strong> liefert die Höhe jedes Punkts. Im <strong>Terrarium</strong>-Format wird sie als Höhe = (R · 256 + G + B / 256) − 32 768 in einem PNG kodiert, das Kartenbibliotheken direkt lesen. buscosun nutzt DEM-Kacheln für die Höhenkorrektur, die Geländebühne der Tourenplanung, den Horizont der Eventfläche und die „bergauf"-Richtung des Talwinds. Die Höhen sind Modelldaten mit einigen Metern Unsicherheit.</p>',
    links: ['/methodik/hoehenkorrektur/', '/methodik/tourenplanung-zeitmodell/'],
  },
  // --------------------------------------------------------- Recht/Warnungen
  {
    id: 'geonutzv', term: 'GeoNutzV',
    short: 'Deutsche Geodatennutzungsverordnung: erlaubt die freie Nutzung der offenen Daten des DWD unter Quellenangabe, auch kommerziell.',
    html: '<p>Die <strong>GeoNutzV</strong> (2013) stellt die Geodaten des Bundes — darunter die Open-Data-Produkte des DWD — unter eine offene Lizenz, die der Creative-Commons-Lizenz CC BY 4.0 entspricht: Nutzung, Veränderung und Weitergabe sind erlaubt, die Quelle ist zu nennen, Änderungen kenntlich zu machen. buscosun erfüllt das mit der Attribution „Deutscher Wetterdienst" an jedem Layer; die Übersicht steht unter <a href="/lizenzen/">Quellen &amp; Lizenzen</a>.</p>',
    links: ['/lizenzen/'],
  },
  {
    id: 'cap', term: 'CAP (Common Alerting Protocol)',
    short: 'Internationales XML-Format für amtliche Warnmeldungen mit Ereignis, Schweregrad, Gültigkeit, Gebiet und Wortlaut.',
    html: '<p>Das <strong>Common Alerting Protocol</strong> macht Warnungen maschinenlesbar: Der DWD veröffentlicht seine Wetterwarnungen je Landkreis als CAP-Dateien, MeteoAlarm bündelt sie europaweit. buscosun liest die CAP-Meldungen für Deutschland und die Schweiz und zeigt den amtlichen Text im Warn-Layer ausschließlich als wörtliches Zitat — nie zusammengefasst, nie umformuliert. Für Österreich ist der Warn-Layer derzeit nicht angebunden.</p>',
    links: ['/wetterkarte', '/lizenzen/'],
  },
  {
    id: 'meteoalarm', term: 'MeteoAlarm',
    short: 'Europäisches Warnportal der nationalen Wetterdienste (EUMETNET), das amtliche Warnungen in einheitlichen Farbstufen bündelt.',
    html: '<p><strong>MeteoAlarm</strong> zeigt die Warnungen von über 30 Wetterdiensten mit den Stufen gelb, orange und rot. Die drei technischen Zugänge liefern nicht dasselbe: Der Atom-Feed ist ein Index ohne Text, das JSON ein großes Archiv, und erst die CAP-Datei je Meldung trägt den Wortlaut. buscosun nutzt für die Schweiz genau diesen Weg und zitiert den Text wörtlich; die Warnung selbst kommt vom nationalen Dienst.</p>',
    links: ['/wetterkarte', '/lizenzen/'],
  },
];

/** Alphabetical by display name (German collation, ignoring case). */
export const GLOSSARY = [...TERMS].sort((a, b) => a.term.localeCompare(b.term, 'de', { sensitivity: 'base' }));

export const GLOSSARY_BY_ID = Object.fromEntries(GLOSSARY.map((g) => [g.id, g]));

/** First letter for the A–Z jump list (umlauts folded, digits grouped under '#'). */
function letterOf(term) {
  const c = term.trim().charAt(0).toUpperCase();
  const folded = c === 'Ä' ? 'A' : c === 'Ö' ? 'O' : c === 'Ü' ? 'U' : c;
  return /[A-Z]/.test(folded) ? folded : '#';
}

/**
 * Full HTML for `/glossar/` — same skeleton and footer as `renderArticlePage`
 * in content.mjs. JSON-LD: DefinedTermSet + BreadcrumbList.
 */
export function renderGlossaryPage(glossary, updated) {
  const canonicalPath = '/glossar/';
  const url = SITE.url + canonicalPath;
  const title = 'Glossar: Wetter- und Brandradar-Begriffe';
  const description =
    `${glossary.length} Begriffe aus Meteorologie, Radar, Feuerwetter, Klima und Wettermodellen — kurz definiert, mit ` +
    'den Konstanten und Grenzen, wie buscosun sie verwendet. Von CAPE über FWI und MESHS bis zur Nullgradgrenze.';
  const setId = url + '#set';
  const jsonLd = [
    {
      '@context': 'https://schema.org', '@type': 'DefinedTermSet',
      '@id': setId, name: title, url, inLanguage: 'de-DE',
      description, dateModified: updated,
      publisher: { '@type': 'Organization', name: SITE.name, url: SITE.url + '/' },
      hasDefinedTerm: glossary.map((g) => ({
        '@type': 'DefinedTerm', name: g.term, description: g.short,
        url: `${url}#${g.id}`, inDefinedTermSet: { '@id': setId },
      })),
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Start', item: SITE.url + '/' },
        { '@type': 'ListItem', position: 2, name: 'Glossar', item: url },
      ],
    },
  ];
  const head = headBlock({ title: `${title} | ${SITE.name}`, description, canonicalPath, locale: 'de-DE', ogImage: ogImageOr('glossar', DEFAULT_OG_IMAGE), jsonLd });

  // A–Z jump list: only letters that actually occur.
  const letters = [...new Set(glossary.map((g) => letterOf(g.term)))];
  const jump = letters.map((l) => `<a href="#gl-${l === '#' ? 'num' : l}">${escapeHtml(l)}</a>`).join('');

  // Definition list with a letter heading before each new initial.
  let lastLetter = null;
  const items = glossary.map((g) => {
    const l = letterOf(g.term);
    const heading = l !== lastLetter
      ? `        </dl>\n        <h2 id="gl-${l === '#' ? 'num' : l}">${escapeHtml(l)}</h2>\n        <dl>\n`
      : '';
    lastLetter = l;
    const links = g.links?.length
      ? `<div class="links">${g.links.map((p) => `<a href="${p}">${escapeHtml(p.replace(/^\//, '').replace(/\/$/, '').replace(/[-/]/g, ' ').replace(/\?.*$/, ''))}</a>`).join('')}</div>`
      : '';
    return `${heading}        <dt id="${g.id}"><a href="#${g.id}" class="anchor" aria-label="Link zu ${escapeHtml(g.term)}">#</a> ${escapeHtml(g.term)}</dt>\n        <dd><p class="short">${escapeHtml(g.short)}</p>${g.html}${links}</dd>`;
  }).join('\n');

  return `<!doctype html>
<html lang="de">
  <head>
${head}
    <style>${PAGE_CSS}
h3{font-size:1rem;margin:1.1rem 0 .3rem}
code{font-size:.82em;background:#fff;border:1px solid var(--border);border-radius:4px;padding:.05rem .3rem}
section ul{padding-left:1.1rem}section li{margin-bottom:.5rem}
.meta{font-size:.8rem;color:var(--stone)}
.az{display:flex;flex-wrap:wrap;gap:.35rem;margin:1rem 0 1.5rem}
.az a{display:inline-block;min-width:2.2rem;text-align:center;background:#fff;border:1px solid var(--border);border-radius:8px;padding:.3rem .4rem;text-decoration:none;color:var(--ink);font-weight:600}
dl{margin:0}dt{font-weight:600;font-size:1.05rem;margin:1.4rem 0 .3rem;scroll-margin-top:1rem}
dt .anchor{color:var(--stone);text-decoration:none;font-weight:400;margin-right:.2rem}dt .anchor:hover{color:var(--terra)}
dd{margin:0 0 .6rem}dd p{margin:.2rem 0 .5rem}dd p.short{color:var(--stone);font-size:.95rem}
dd .links{margin-top:.4rem}dd .links a{font-size:.82rem}
dt:target{background:#fff;border-left:3px solid var(--terra);padding-left:.5rem}</style>
  </head>
  <body>
    <main class="wrap">
      <nav class="bc" aria-label="Brotkrumen"><a href="/">Start</a> › Glossar</nav>
      <h1>Glossar: Wetter- und Brandradar-Begriffe</h1>
      <p class="lead">${escapeHtml(description)}</p>
      <p class="meta">Stand: ${escapeHtml(updated)} · ${glossary.length} Begriffe · Alle Zahlen zu buscosun stammen aus dem Quellcode (Konstanten und Schwellen), nicht aus Marketingtexten. buscosun gibt keine amtlichen Warnungen heraus.</p>
      <nav class="az" aria-label="Alphabetische Sprungliste">${jump}</nav>
      <section>
        <dl>
${items}
        </dl>
      </section>
      <section>
        <h2>Weiterlesen</h2>
        <div class="links"><a href="/wissen/">Wissen</a><a href="/methodik/">Methodik</a><a href="/funktionen/">Funktionen</a><a href="/lizenzen/">Quellen &amp; Lizenzen</a></div>
      </section>
      <footer>
        ${escapeHtml(SITE.name)} — ${escapeHtml(SITE.tagline)}. Datenbasis: Deutscher Wetterdienst (DWD, GeoNutzV) · GeoSphere Austria · MeteoSwiss. Keine Tracker, keine Werbung.
        <a href="/ueber/">Über buscosun</a> · <a href="/methodik/">Methodik</a> · <a href="/lizenzen/">Quellen &amp; Lizenzen</a> · <a href="/impressum/">Impressum</a> · <a href="/datenschutz/">Datenschutz</a>
      </footer>
    </main>
  </body>
</html>
`;
}
