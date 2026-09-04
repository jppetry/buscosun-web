/**
 * Texte der indexierbaren Sub-Routen (SEO/GEO 2026, E1) — je kanonischem Pfad
 * H1, Lead, Absätze, Fakten, Explainer. Layer-Texte kommen aus
 * `layerSeoTexts.ts`, Atmosphäre-Linsen und Brand-Sichten stehen hier.
 *
 * Verbraucher: `scripts/generate-seo.mjs` (Roh-HTML-Shells), `RouteSeoBlock`
 * (lazy, nach dem App-Mount), `scripts/verify-routing.mjs` (jede indexierbare
 * Sub-Route aus `routes.ts` hat genau einen Eintrag). Nicht im Start-Bundle.
 */

import { ALL_LAYER_KEYS } from '../map/layerTypes';
import { LAYER_SLUGS } from '../router/urlState';
import { LAYER_SEO, wordCount, type SeoText } from './layerSeoTexts';

export type { SeoText, LayerFact } from './layerSeoTexts';

const LAYER_ENTRIES: Record<string, SeoText> = Object.fromEntries(
  ALL_LAYER_KEYS.filter((k) => k !== 'warnings').map((k) => [`/wetterkarte/${LAYER_SLUGS[k]}`, LAYER_SEO[k]]),
);

const OTHER_ENTRIES: Readonly<Record<string, SeoText>> = {
  '/atmosphaere/fliegen': {
    h1: 'Thermik und Höhenwind für Gleitschirm, Drachen und Segelflug',
    lead: 'Die Linse „Fliegen" zeigt über jedem Startplatz in Deutschland, Österreich und der Schweiz, was für den Flugtag zählt: die geschätzte Thermikstärke als Karte über dem Gelände, den Höhenwind in fünf Bändern bis über 60 km/h, die Windscherung, die Wolkenbasis und die Umkehrzeiten des Talwinds — aus ICON-D2 am Boden und dem ICON-EU-Profil in der Höhe, stündlich bis 48 Stunden voraus, mit einem Urteil gut, Vorsicht oder schlecht je Stunde.',
    body: [
      'Die Thermik-Karte rechnet für jede Geländezelle einen trockenen Luftpaket-Aufstieg gegen das Modellprofil: Ein fester Tages-Überhitzungswert von 3 K wird auf die Umgebungstemperatur der Zelle gesetzt, der Schnittpunkt mit dem ICON-EU-Profil ergibt die Grenzschichttiefe, daraus die Stärke (volle Stärke bei etwa 2 500 m Tiefe). Ein Tipp aufs Gelände verschiebt den Profil-Marker; Profil und Urteil rechnen neu. Der Nerd-Modus legt das echte Skew-T mit CAPE, CIN, LCL, LFC und EL daneben.',
      'Grenzen, die die Ansicht selbst nennt: Es ist eine Schätzung, kein gemessener Steigwert — ein Profil über die Fläche gehalten, feste Überhitzung, ICON-EU mit rund 7 km Gitter, keine Hangwind- oder Einstrahlungsphysik. Die Vertikalstruktur des Windes ist aus 10-m-Werten und Standardprofilen abgeleitet, nicht aus echten Druckflächen. Kein amtliches Flugwetter, kein Ersatz für das DWD-Segelflugwetter oder das Briefing des Vereins.',
    ],
    facts: [
      { label: 'Quellen', text: 'DWD ICON-D2 (Boden, 2,2 km) · ICON-EU-Profil (Druckflächen, ~7 km) · Terrarium-DEM' },
      { label: 'Horizont', text: '0 bis +48 h, stündlich' },
      { label: 'Abdeckung', text: 'DE, AT, CH; Startplatz per Ortssuche oder GPX/TCX/FIT-Upload' },
      { label: 'Urteil', text: 'nicht fliegbar > 40 km/h; gut < 25 km/h mit Thermik ≥ 2 m/s; keine nutzbare Thermik < 0,5 m/s' },
      { label: 'Grenze', text: 'Thermik geschätzt, kein Messwert; Windprofil aus Standardprofilen; kein amtliches Flugwetter' },
    ],
    explainer: 'thermik',
  },
  '/atmosphaere/berg-und-weg': {
    h1: 'Föhn, Inversion und Höhenwind für Bergtouren',
    lead: 'Die Linse „Berg & Weg" beantwortet für einen Ort im Alpenraum drei Fragen, die im Tal nicht zu sehen sind: Kommt Föhn (Index kein, tendenziell oder aktiv aus kammnahem Südwind über 30 bzw. 45 km/h und trockener Bodenschicht), liegt eine Inversion mit Nebeldecke und wo ist ihre Obergrenze, und wie stark weht es auf Gratniveau. Dazu ein Isentropen-Querschnitt von Nord nach Süd, der das Absinken der Luft im Lee sichtbar macht — aus dem ICON-EU-Profil, bis 48 Stunden voraus.',
    body: [
      'Der Föhn-Index prüft die Kammschicht zwischen 1 200 und 3 500 m über Grund auf Windstärke und Südsektor (120–240°) und die Bodenschicht auf Trockenheit. Was er nicht prüfen kann, sagt die Ansicht ausdrücklich: Die Druckdifferenz zwischen Luv und Lee — der klassische Föhn-Indikator der Wetterdienste — ist ohne Stationsdruck-Pipeline nicht verfügbar. Deshalb ist der Index ein Richtwert mit Südföhn-Fokus, keine amtliche Föhnwarnung.',
      'Die Inversionsschätzung liefert Inversionshöhe, Temperatur im Tal und oberhalb, die Nebelobergrenze und das Aufstiegs-Delta — die Zahl, die entscheidet, ob es sich lohnt, über den Nebel zu steigen. Grenzen: ICON-EU löst Strukturen unter 200 m nicht sicher auf; der Isentropen-Schnitt ist ein qualitatives Bild aus der heuristischen Schnitt-Temperatur, kein exaktes Feld. Für Touren über 1 000 m verlinkt buscosun die amtlichen Lawinenlageberichte, statt eigene Aussagen zu machen.',
    ],
    facts: [
      { label: 'Quellen', text: 'ICON-EU-Profil (~7 km) · DWD ICON-D2 (Boden) · Terrarium-DEM' },
      { label: 'Föhn-Schwellen', text: 'kammnah ≥ 45 km/h aktiv, ≥ 30 km/h tendenziell, Südsektor 120–240°, trockene Bodenschicht' },
      { label: 'Horizont', text: '0 bis +48 h' },
      { label: 'Abdeckung', text: 'Alpenraum AT/CH und bayerische Alpen im Fokus; ganz DACH abrufbar' },
      { label: 'Grenze', text: 'keine Luv-Lee-Druckdifferenz; Richtwert, keine amtliche Föhnwarnung; keine Lawinenaussage' },
    ],
    explainer: 'foehn',
  },
  '/atmosphaere/querschnitt': {
    h1: 'Vertikalschnitt der Atmosphäre — Höhenwind, Inversion und Arbeitsfenster',
    lead: 'Der Vertikalschnitt zeigt die Atmosphäre entlang einer frei auf die Karte gezogenen Linie als Querschnitt: das echte Geländeprofil aus dem Höhenmodell, darüber den Wind in fünf benannten Bändern von unter 15 bis über 60 km/h, Böenpfeile, Temperaturschichtung mit Inversionen, Wolkenbasis und Nullgradgrenze — aus ICON-D2 am Boden und ICON-EU in der Höhe, stündlich bis 48 Stunden voraus. Drei Ansichten teilen sich denselben Schnitt: Höhenwind, Inversion und das Arbeitsfenster Go/No-Go.',
    body: [
      'Die Ansicht „Arbeitsfenster" ist für Drohne, Kran, Gerüst und Höhenarbeit gebaut: Arbeitshöhe in Metern über Grund und ein Böengrenzwert ergeben eine GO/NO-GO-Zeitleiste über den Tag („GO ab 14:30", „NO-GO ganzer Tag"), mit einem Höhenfaktor, der die Böe in Arbeitshöhe aus der 10-m-Böe ableitet. Eigene Zusatzgrenzwerte werden im Browser gespeichert. Referenzanker des Schnitts ist das höchste Gelände der Linie.',
      'Grenzen: Der Wind über Grund folgt einem Potenzprofil mit Sättigung in 1 500 m, keiner Messung; Strukturen unter 200 m sind aus ICON-EU nicht sicher aufgelöst; die Wolkenbasis ist eine LCL-Näherung und trägt das Wort „abgeleitet". Die Zeitleiste ist eine Planungshilfe, kein zertifiziertes Arbeitsschutz-Werkzeug — maßgeblich sind Herstellergrenzwerte und die amtlichen Warnungen.',
    ],
    facts: [
      { label: 'Quellen', text: 'DWD ICON-D2 (Boden) · ICON-EU-Druckflächen · Terrarium-DEM (~76 m/px)' },
      { label: 'Auflösung', text: '64 Spalten je Schnitt, 5 Ankerpunkte, 36–48 h' },
      { label: 'Windbänder', text: '< 15 · 15–30 · 30–45 · 45–60 · > 60 km/h; Scherung ab 25 km/h je 300 m' },
      { label: 'Abdeckung', text: 'DE, AT, CH' },
      { label: 'Grenze', text: 'Windprofil aus 10-m-Wert + Standardprofil; keine Sichtweite; kein zertifiziertes Arbeitsschutz-Tool' },
    ],
    explainer: 'temperaturinversion',
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
};

export const SUB_ROUTE_TEXTS: Readonly<Record<string, SeoText>> = { ...LAYER_ENTRIES, ...OTHER_ENTRIES };

/** Text zu einem kanonischen Sub-Routen-Pfad (z. B. `/wetterkarte/temperatur`); null wenn keiner. */
export function subRouteText(path: string): SeoText | null {
  return SUB_ROUTE_TEXTS[path] ?? null;
}

export interface SubTextCheck { name: string; ok: boolean; detail?: string }

/** Selbstverifikation gegen die Liste der indexierbaren Pfade aus `routes.ts`. */
export function verifySubRouteTexts(paths: readonly string[]): { checks: SubTextCheck[]; passed: number; failed: number } {
  const checks: SubTextCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const missing = paths.filter((p) => !SUB_ROUTE_TEXTS[p]);
  add('jede indexierbare Sub-Route hat einen Text', missing.length === 0, missing.join(', '));
  const extra = Object.keys(SUB_ROUTE_TEXTS).filter((p) => !paths.includes(p));
  add('kein Text ohne Sub-Route', extra.length === 0, extra.join(', '));
  const present = paths.filter((p) => SUB_ROUTE_TEXTS[p]);
  const shortLead = present.filter((p) => wordCount(SUB_ROUTE_TEXTS[p].lead) < 60);
  add('jeder Lead hat ≥ 60 Wörter', shortLead.length === 0, shortLead.join(', '));
  const thin = present.filter((p) => SUB_ROUTE_TEXTS[p].body.length < 2 || SUB_ROUTE_TEXTS[p].body.some((x) => wordCount(x) < 40));
  add('jeder Text hat ≥ 2 Absätze mit ≥ 40 Wörtern', thin.length === 0, thin.join(', '));
  const noFacts = present.filter((p) => SUB_ROUTE_TEXTS[p].facts.length < 4 || !SUB_ROUTE_TEXTS[p].facts.some((f) => f.label === 'Grenze') || !SUB_ROUTE_TEXTS[p].facts.some((f) => /^Quelle/.test(f.label)));
  add('jeder Text nennt ≥ 4 Fakten inkl. Quelle und Grenze', noFacts.length === 0, noFacts.join(', '));
  add('keine zwei Leads sind gleich', new Set(present.map((p) => SUB_ROUTE_TEXTS[p].lead)).size === present.length);
  add('keine zwei H1 sind gleich', new Set(present.map((p) => SUB_ROUTE_TEXTS[p].h1)).size === present.length);
  add('keine Tornado-Sprache', present.every((p) => !/tornado/i.test(SUB_ROUTE_TEXTS[p].lead + SUB_ROUTE_TEXTS[p].body.join(' '))));
  add('„bestätigt" nur mit Quelle im selben Satz', present.every((p) => (SUB_ROUTE_TEXTS[p].lead + ' ' + SUB_ROUTE_TEXTS[p].body.join(' ')).split(/[.!?]/).every((sent) => !/\bbestätigt\b/i.test(sent) || /EFFIS|EMS|amtlich|Quelle|unbestätigt/i.test(sent))));
  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
