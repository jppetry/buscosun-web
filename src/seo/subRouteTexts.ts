/**
 * Texte der indexierbaren Sub-Routen (SEO/GEO 2026, E1) — je kanonischem Pfad
 * H1, Lead, Absätze, Fakten, Explainer. Layer-Texte kommen aus
 * `layerSeoTexts.ts`, Vertikalschnitt und Brand-Sichten stehen hier. Die 56
 * Seewetter-Spots haben einen EIGENEN Lazy-Chunk (`src/sea/seaSeoText.ts`, Phase SS),
 * damit die Layer-Seiten deren Steckbriefe nicht mitladen; Build und Verifier
 * reichen sie als `extra` herein.
 *
 * Verbraucher: `scripts/generate-seo.mjs` (Roh-HTML-Shells), `RouteSeoBlock`
 * (lazy, nach dem App-Mount), `scripts/verify-routing.mjs` (jede indexierbare
 * Sub-Route aus `routes.ts` hat genau einen Eintrag). Nicht im Start-Bundle.
 */

import { ALL_LAYER_KEYS } from '../map/layerTypes';
import { LAYER_SLUGS } from '../router/urlState';
import { LAYER_SEO, wordCount, type SeoText } from './layerSeoTexts';
import { ROAD_SEO_MOTORWAYS } from '../road/roadSeo';
import { roadSeoText } from '../road/roadSeoTexts';
import { ROAD_INDEXABLE } from '../router/routes';

export type { SeoText, LayerFact } from './layerSeoTexts';

const LAYER_ENTRIES: Record<string, SeoText> = Object.fromEntries(
  ALL_LAYER_KEYS.filter((k) => k !== 'warnings').map((k) => [`/wetterkarte/${LAYER_SLUGS[k]}`, LAYER_SEO[k]]),
);

const OTHER_ENTRIES: Readonly<Record<string, SeoText>> = {
  // Belege: src/atmosphere/AtmosphereDeck.tsx (LAYER_ROWS, PointQuery, SectionChart ohne overlay), src/threed/SectionChart.tsx,
  // src/threed/buildCrossSection.ts (COLUMNS, ANCHORS, FORECAST_HOURS 36, DEM_ZOOM 11, sectionMethod), crossSection.ts (150 m,
  // topM, SHEAR_THRESHOLD, Böenüberschuss, Wolkenbasis ab 35 %), atmoContract.ts (ICON-D2, ATMO_RUN_EVERY_H, ATMO_GRID), radiosonde.ts.
  // Eine 0-°C-Linie zeichnet der Schnitt nicht: darum steht die Nullgradgrenze hier nicht (verify-seo prüft das).
  '/atmosphaere/querschnitt': {
    h1: 'Vertikalschnitt der Atmosphäre: Höhenwind und Böen im Querschnitt über dem Gelände',
    lead: 'Der Vertikalschnitt zeigt den Querschnitt der Atmosphäre entlang einer frei auf die Karte gezogenen Linie: unten das Höhenprofil des Geländes aus dem Höhenmodell, darüber den Wind in fünf benannten Bändern von unter 15 bis über 60 km/h mit Pfeilen für die Richtung. Zuschaltbar sind Böen, Windscherung, Strömungslinien und die Wolkenbasis. Ein Klick in den Schnitt nennt Höhe, Mittelwind, Böe, Richtung und Temperatur an diesem Punkt, ein Zeit-Regler führt rund 36 Stunden voraus.',
    body: [
      'Gerechnet wird mit 64 Spalten entlang der Linie und Höhenstufen von 150 Metern. Wind und Temperatur je Höhe kommen aus einem Höhen-Cube mit den Modellflächen von ICON-D2 des Deutschen Wetterdienstes, neu berechnet für die Läufe 00, 06, 12 und 18 UTC; am Boden ist der Schnitt an fünf Punkten der Linie auf buscosun Fusion verankert. Liegt ein Radiosondenaufstieg höchstens 40 Kilometer neben der Linie und ist höchstens 30 Stunden alt, steht sein gemessener Wind als eigene, beschriftete Säule daneben und wird nie mit dem Modell verrechnet. Die Bildunterschrift nennt Lauf und Rechenweg des aktuellen Schnitts.',
      'Grenzen: Das Wetter am Boden stammt von fünf Punkten der Linie, dazwischen wird interpoliert, und das Modellgitter von rund 2,2 Kilometern glättet enge Täler und Grate. Der Schnitt reicht bis mindestens 3 000 Meter und bei hohem Gelände gut 1 500 Meter über den höchsten Punkt. Die Böen sind der Böenüberschuss vom Boden, der mit der Höhe ausläuft, keine Messung in der Höhe. Die Wolkenbasis ist eine Näherung aus Temperatur und Feuchte am Boden und erscheint nur bei nennenswerter Bewölkung. Fehlt der Höhen-Cube, schätzt der Schnitt den Wind aus dem Bodenwert und schreibt das dazu. Grenzwerte für Drohne oder Kran prüft die Ansicht nicht.',
      'Der Vertikalschnitt ist kein amtliches Produkt und kein amtliches Flugwetter, und er gibt keine Warnungen heraus. Für Flugentscheidungen gelten die Flugwetterberatung der Wetterdienste, die Regeln des Fluggebiets und die eigene Beobachtung; amtliche Warnungen zeigt buscosun nur als wörtliches Zitat auf der Seite Warnungen.',
    ],
    official: { text: 'Zuständig für Flugwetter in Deutschland:', label: 'Deutscher Wetterdienst, Luftfahrt und Flugwetterberatung', href: 'https://www.dwd.de/DE/fachnutzer/luftfahrt/luftfahrt_node.html' },
    facts: [
      { label: 'Quellen', text: 'DWD ICON-D2 (Modellflächen, rund 2,2 km) · buscosun Fusion (Boden) · Radiosonden neben der Linie, sofern vorhanden · Terrarium-DEM (rund 76 m/px)' },
      { label: 'Aktualisierung', text: 'Höhen-Cube alle 6 Stunden (Läufe 00/06/12/18 UTC); Bodenwerte beim Öffnen aus dem neuesten Stand von buscosun Fusion; Zeit-Regler in 15-Minuten-Schritten zwischen Stundenwerten' },
      { label: 'Auflösung', text: '64 Spalten je Schnitt, Wetter am Boden an 5 Punkten der Linie, Höhenstufen 150 m, rund 36 h voraus' },
      { label: 'Windbänder', text: '< 15 · 15–30 · 30–45 · 45–60 · > 60 km/h; Scherung ab 25 km/h je 300 m' },
      { label: 'Abdeckung', text: 'DE, AT, CH (45,5–55,5° N, 5,5–17,5° O); Start über Ort, gezeichnete Linie oder GPX, TCX, FIT, KML' },
      { label: 'Grenze', text: 'Modellwerte, keine Messung; Böen vom Boden abgeleitet; keine Sichtweite; kein amtliches Produkt, kein amtliches Flugwetter' },
    ],
    explainer: 'windboeen-sturm',
  },
  '/waldbrand/gefahrenindex': {
    h1: 'Waldbrandgefahr für Deutschland, Österreich und die Schweiz — der Gefahrenindex',
    lead: 'Die Sicht „Gefahrenindex" zeigt die Waldbrandgefahr als durchgehende Fläche über den ganzen DACH-Raum: den kanadischen Fire Weather Index (FWI), wie ihn der Copernicus-Dienst GWIS (ECMWF) täglich für Europa rechnet, mit Tagesregler bis neun Tage voraus und fünf Teilansichten — Gesamtindex, Perzentil-Einordnung („wie außergewöhnlich ist der Tag hier"), Trockenheit der Streuauflage (DC), Ausbreitungsindex (ISI) und Zündbereitschaft (FFMC). Daneben stehen die nationalen Skalen von DWD und BAFU, jede mit ihrer eigenen Stufenlogik, nie umgerechnet.',
    body: [
      'Der EU-Index hat einen Vorteil, den keine nationale Karte bietet: Er endet nicht an der Grenze. Der DWD-Waldbrandgefahrenindex gilt für Deutschland, die kantonalen Stufen für die Schweiz, und Österreich veröffentlicht keine offene amtliche Stufe — die Sicht sagt das ausdrücklich, statt die Lücke mit dem EU-Wert zu kaschieren. Die Perzentil-Einordnung vergleicht den Tag mit einer rund 40-jährigen Reihe; welche Jahre genau, veröffentlicht EFFIS nicht, und auch das steht in der Legende.',
      'Grenzen: Der Layer ist ein Bild aus dem Kartendienst, kein Zahlenfeld — es gibt keine Punktabfrage und keine abgeleitete Zahl. Bezugszeit ist 12 UTC des gewählten Tages, Auflösung etwa 8 km. Die Farben sind aus den Klassengrenzen abgeleitet und nicht amtlich; ein hoher Index ist eine Gefahrenlage, keine Brandmeldung und kein amtliches Warnprodukt.',
    ],
    facts: [
      { label: 'Quelle', text: 'Copernicus EMS · GWIS (ECMWF), CC BY 4.0' },
      { label: 'Auflösung · Bezug', text: '~8 km · 12 UTC des Tages' },
      { label: 'Horizont', text: 'heute bis +9 Tage' },
      { label: 'Abdeckung', text: 'DE, AT, CH durchgehend; nationale Skalen DE (DWD) und CH (BAFU/Kantone), AT ohne offene Stufe' },
      { label: 'Grenze', text: 'Bild, keine Werte; Farben abgeleitet; kein Warnprodukt' },
    ],
    explainer: 'fire-weather-index',
  },
  '/waldbrand/aktive-braende': {
    h1: 'Aktive Waldbrände in Deutschland, Österreich und der Schweiz aus Satellitendaten',
    lead: 'Die Sicht „Aktive Brände" zeigt, wo Satelliten in den letzten 24 Stunden oder sieben Tagen Wärme gesehen haben: die Detektionen des NASA-Systems FIRMS (VIIRS, 375 m) mit Strahlungsleistung (FRP), Konfidenz und Pixelgeometrie, gebündelt zu einer Liste von Bränden mit Fläche, Status und Ort — dazu die von EFFIS kartierten Brandflächen der letzten sieben Tage. Ein Klick öffnet das Brand-Dossier mit FRP-Verlauf je Überflug, Tendenz, Wetterlage am Brandort und Satellitenbild vorher und nachher.',
    body: [
      'Was die Karte ehrlich unterscheidet: Eine Detektion ist eine Satellitenmessung, keine Einsatzmeldung. Rund 39 Prozent aller Detektionen im DACH-Raum liegen auf Dauerquellen — Stahlwerke, Raffinerien, Fackeln; ein Klassifikator markiert sie grau, sobald sie über Tage ortsfest und ohne Ausdehnung sind. „Bestätigt" heißt ein Brand nur mit Quelle im selben Satz: EFFIS-Kartierung, Copernicus-EMS-Aktivierung oder amtliche Warnung. Unbestätigt ist der Normalfall, kein Versagen.',
      'Grenzen: Kleine Brände unter einigen Hektar fehlen dem Satelliten systematisch; eine Überflugslücke ist kein Ende des Brandes; „keine Hotspots" heißt nicht „keine Brände". Für aktive Brände gibt es in DE, AT und CH keine offene behördliche Echtzeitquelle — buscosun verlinkt NINA/MoWaS, die Einsatzübersichten Oberösterreich und Burgenland und Alertswiss, wertet sie aber nicht aus. Die Brandursache liefert keine der Quellen; die Dossiers sagen „Ursache: keine Quelle".',
    ],
    facts: [
      { label: 'Quellen', text: 'NASA FIRMS VIIRS (375 m, NRT) · GWIS als Notbetrieb · EFFIS Brandflächen · Copernicus EMS · GeoNames' },
      { label: 'Fenster', text: '24 h oder 7 Tage; Historie Monat/Saison aus dem eigenen Archiv (2020–2026)' },
      { label: 'Takt', text: 'mehrere Überflüge täglich (Suomi-NPP, NOAA-20/21)' },
      { label: 'Abdeckung', text: 'DE, AT, CH; Grenzräume mitgezählt' },
      { label: 'Grenze', text: 'Detektion ≠ Einsatzmeldung; kleine Brände fehlen; Ursache ohne Quelle; kein Warnprodukt' },
    ],
    explainer: 'thermalanomalien-firms',
  },
  '/waldbrand/trockenheit': {
    links: [{ label: 'Wetterarchiv: Trockenheit am Ort im Rückblick', href: '/wetterarchiv' }, { label: 'Waldbrand-Historie seit 2020', href: '/waldbrand/historie' }],
    h1: 'Bodentrockenheit und Feuerwetter für Deutschland, Österreich und die Schweiz',
    lead: 'Die Sicht „Trockenheit" zeigt zwei Treiber der Waldbrandgefahr aus dem DWD-Modell ICON-D2: die Bodenfeuchte als Bodenfeuchteindex (SMI) in zwei Tiefen — Oberboden bis 9 cm für das Zündrisiko, Wurzelzone bis 81 cm für die Dürre — und die relative Luftfeuchte in 2 m als stündliches Feuerwetter, bis 24 Stunden voraus. Ein Readout nennt, wie viel Prozent der Bodenfläche im DACH-Raum am oder unter dem Welkepunkt liegen — eine Zahl aus diesem Modelllauf, nicht aus einer Klimatologie.',
    body: [
      'Für Landwirte, Forst und Feuerwehr ist die Bodenfeuchte die Größe, die die Gefahr über Wochen aufbaut; die Luftfeuchte entscheidet über den Tag. Die Sicht trennt beides und färbt die Luft-Trockenheit als Treiber, nicht als Index — die kumulativen FWI-Codes (DC, DMC) stehen in der Sicht „Gefahrenindex". Der Tiefenwechsel verwirft den alten Stand sofort: lieber eine leere Karte als die falsche Tiefe.',
      'Grenzen: Modellwerte, keine Messung — ein flächendeckendes Bodenfeuchte-Messnetz gibt es nicht. Wasser, Fels und Eis bleiben leer; außerhalb von DE, AT und CH ist die Fläche abgedunkelt. Die europäischen EDO-Dürreprodukte sind aus technischen Gründen (CORS) nicht eingebunden und werden nicht nachgebildet; kein Warnprodukt.',
    ],
    facts: [
      { label: 'Quelle', text: 'DWD ICON-D2: smi (zwei Tiefen), relhum_2m' },
      { label: 'Auflösung · Takt', text: '2,2 km · stündlich' },
      { label: 'Horizont', text: '0 bis +24 h (Stundenachse bis +6 h im Brandradar)' },
      { label: 'Abdeckung', text: 'DE, AT, CH' },
      { label: 'Grenze', text: 'Modell, keine Messung; Wasser/Fels/Eis ohne Wert; kein Warnprodukt' },
    ],
    explainer: 'trockenperioden',
  },

  // --- SEO/GEO 2026 (E7): Ansichten, die bisher nur Query oder Hash hatten -----------------
  '/waldbrand/historie': {
    links: [{ label: 'Wetterarchiv: Wetter und Klima am Ort', href: '/wetterarchiv' }, { label: 'Trockenperioden erklärt', href: '/wissen/trockenperioden/' }],
    h1: 'Waldbrand-Historie für Deutschland, Österreich und die Schweiz seit 2020',
    lead: 'Die Historie zeigt nicht die Lage von heute, sondern den Verlauf: Ereignisse eines Monats oder einer ganzen Saison aus dem eigenen Archiv der Satellitendetektionen, dazu eine Kurve, die die laufende Saison gegen die Jahre seit 2020 stellt. Jedes Ereignis lässt sich öffnen — mit Ort, Zeitraum, Zahl der Detektionen, Strahlungsleistung, dem Flächenhinweis, sofern EFFIS eine Kartierung hat, und der Wetterlage am Brandort aus dem Archiv statt aus der Vorhersage.',
    body: [
      'Ein Ereignis ist keine Meldung einer Feuerwehr, sondern eine Rechenregel: Detektionen des VIIRS-Sensors werden zusammengefasst, wenn sie näher als zwei Kilometer beieinander liegen und höchstens 48 Stunden auseinander; eine längere Pause beginnt ein neues Ereignis. Die Saison läuft vom 1. März bis zum 31. Oktober. Standorte mit dauerhafter Wärmesignatur — Stahl- und Zementwerke, Raffinerien — werden über die Standortliste herausgehalten, sonst stünde jedes Industriewerk als Dauerbrand in der Liste.',
      'Grenzen: Die Zahlen sind Satellitendetektionen, keine amtliche Brandstatistik, und sie liegen systematisch unter der Wahrheit, weil kleine Brände unter der Auflösung von 375 Metern bleiben und Bewölkung Überflüge blind macht. Ein Ereignis heißt nur dann bestätigt, wenn EFFIS es kartiert oder Copernicus EMS aktiviert wurde — die Quelle steht dann dabei. Die Vergleichskurve über die Jahre nutzt dieselbe Regel für alle Jahrgänge; unterschiedliche Sensorlaufzeiten bleiben ein Vorbehalt.',
    ],
    facts: [
      { label: 'Quellen', text: 'NASA FIRMS VIIRS (Suomi-NPP, NOAA-20; Standard- und Echtzeit-Verarbeitung) · EFFIS-Brandflächen · Meteostat/ERA5 für die Wetterlage' },
      { label: 'Archiv', text: 'Saisons 2020 bis 2026, Monats- und Saisonfenster; Saison 1. März bis 31. Oktober' },
      { label: 'Zählregel', text: 'Detektionen bündeln sich zu einem Ereignis bei ≤ 2 km Abstand und ≤ 48 h Pause' },
      { label: 'Umfang', text: 'Saison 2026 rund 5 900 Ereignisse in DACH, davon knapp 1 200 auf bekannten Anlagenstandorten (Stand 23. August 2026)' },
      { label: 'Grenze', text: 'Detektion ist keine Brandmeldung; kleine Brände fehlen; keine amtliche Statistik; „bestätigt" nur mit EFFIS- oder EMS-Beleg' },
    ],
    explainer: 'thermalanomalien-firms',
  },
  '/waldbrand/thermalanomalien': {
    h1: 'Thermalanomalien: wenn der Satellit ein Werk sieht und keinen Waldbrand',
    lead: 'Rund 39 Prozent aller Satellitendetektionen im DACH-Raum liegen nicht auf Vegetationsbränden, sondern auf Anlagen, die dauerhaft Wärme abstrahlen: Stahlwerke, Zementöfen, Raffinerien, Müllverbrennung, Fackeln. Diese Sicht zeigt sie als eigene Klasse mit Rauten auf der Karte und einem eigenen Reiter — 218 Standorte, aus sechseinhalb Jahren Archiv abgeleitet und mit Anlagenregistern verknüpft, damit ein Werk nicht als Brand gezählt wird und ein Brand neben einem Werk trotzdem sichtbar bleibt.',
    body: [
      'Die Liste entsteht aus dem Detektionsarchiv von Januar 2020 bis Mai 2026: Eine Rasterzelle gilt als persistent, wenn sie in mindestens zwei Jahren an mindestens fünf Tagen je Jahr gebrannt hat; Zellen, für die EFFIS eine Brandfläche kartiert hat, werden ausgeschlossen. Die verbleibenden Zellen werden zu Standorten zusammengefasst und im Umkreis von 1,5 Kilometern mit den Anlagenregistern verknüpft — E-PRTR der Europäischen Umweltagentur, Marktstammdatenregister der Bundesnetzagentur, Elektrizitätsproduktionsanlagen des Bundesamts für Energie. Häufigste Typen sind Zementwerke, Stahlwerke und Kraftwerke.',
      'Wichtig ist der Gegentest: Eine Anlage, deren Signatur plötzlich wächst oder aus der bekannten Hülle heraustritt, wird nicht stillschweigend verworfen, sondern als Abweichung geführt und wie ein Brand behandelt. Klasse A sind benannte Anlagen, Klasse B unbenannte persistente Standorte, Klasse C reine Tagessignale ohne Anlagenbezug — bewusst nicht „Industrie" genannt, weil dahinter auch Felder oder Solarflächen stecken können. Standorte außerhalb der DACH-Grenzen bleiben in der Liste, weil das Detektionsfenster größer ist als die Region.',
    ],
    facts: [
      { label: 'Quellen', text: 'NASA FIRMS VIIRS-Archiv 2020–2026 (eigene Persistenzzählung) · EEA E-PRTR/IED v16 · Marktstammdatenregister · BFE-Anlagenliste' },
      { label: 'Umfang', text: '218 Standorte (145 benannt, 8 unbenannt, 65 Tagessignal); DE 92, AT 12, CH 8, übrige außerhalb DACH' },
      { label: 'Regel', text: 'persistent ab 2 Jahren mit je ≥ 5 Tagen; Anlagen-Zuordnung im Umkreis von 1,5 km; EFFIS-Brandflächen schließen eine Zelle aus' },
      { label: 'Abdeckung', text: 'DACH plus Grenzräume; Kill-Schalter ?ta=0 blendet die Liste aus' },
      { label: 'Grenze', text: 'Standortliste ist eine Ableitung, keine amtliche Anlagenkarte; Betreibernamen fehlen teils; eine Abweichung wird als Brand behandelt, nicht verworfen' },
    ],
    explainer: 'thermalanomalien-firms',
  },
};

export const SUB_ROUTE_TEXTS: Readonly<Record<string, SeoText>> = {
  ...LAYER_ENTRIES,
  ...OTHER_ENTRIES,
  ...(ROAD_INDEXABLE ? Object.fromEntries(ROAD_SEO_MOTORWAYS.map(([slug]) => [`/autobahnwetter/${slug}`, roadSeoText(slug) as SeoText])) : {}),
};

/** Text zu einem kanonischen Sub-Routen-Pfad (z. B. `/wetterkarte/temperatur`); null wenn keiner. Seewetter-Spots: `seaSpotSeoText`. */
export function subRouteText(path: string): SeoText | null {
  return SUB_ROUTE_TEXTS[path] ?? null;
}

export interface SubTextCheck { name: string; ok: boolean; detail?: string }

/** Selbstverifikation gegen die Liste der indexierbaren Pfade aus `routes.ts`. */
export function verifySubRouteTexts(paths: readonly string[], extraTexts: Readonly<Record<string, SeoText>> = {}): { checks: SubTextCheck[]; passed: number; failed: number } {
  // Phase SS: Texte aus eigenen Chunks (Seewetter-Spots) werden mitgeprüft, nach denselben Regeln.
  const ALL: Readonly<Record<string, SeoText>> = { ...SUB_ROUTE_TEXTS, ...extraTexts };
  const checks: SubTextCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const missing = paths.filter((p) => !ALL[p]);
  add('jede indexierbare Sub-Route hat einen Text', missing.length === 0, missing.join(', '));
  const extra = Object.keys(ALL).filter((p) => !paths.includes(p));
  add('kein Text ohne Sub-Route', extra.length === 0, extra.join(', '));
  const present = paths.filter((p) => ALL[p]);
  const shortLead = present.filter((p) => wordCount(ALL[p].lead) < 60);
  add('jeder Lead hat ≥ 60 Wörter', shortLead.length === 0, shortLead.join(', '));
  const thin = present.filter((p) => ALL[p].body.length < 2 || ALL[p].body.some((x) => wordCount(x) < 40));
  add('jeder Text hat ≥ 2 Absätze mit ≥ 40 Wörtern', thin.length === 0, thin.join(', '));
  const noFacts = present.filter((p) => ALL[p].facts.length < 4 || !ALL[p].facts.some((f) => f.label === 'Grenze') || !ALL[p].facts.some((f) => /^Quelle/.test(f.label)));
  add('jeder Text nennt ≥ 4 Fakten inkl. Quelle und Grenze', noFacts.length === 0, noFacts.join(', '));
  add('keine zwei Leads sind gleich', new Set(present.map((p) => ALL[p].lead)).size === present.length);
  add('keine zwei H1 sind gleich', new Set(present.map((p) => ALL[p].h1)).size === present.length);
  add('keine Tornado-Sprache', present.every((p) => !/tornado/i.test(ALL[p].lead + ALL[p].body.join(' '))));
  add('„bestätigt" nur mit Quelle im selben Satz', present.every((p) => (ALL[p].lead + ' ' + ALL[p].body.join(' ')).split(/[.!?]/).every((sent) => !/\bbestätigt\b/i.test(sent) || /EFFIS|EMS|amtlich|Quelle|unbestätigt/i.test(sent))));
  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
