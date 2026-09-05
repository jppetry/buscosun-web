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

  // --- SEO/GEO 2026 (E7): Ansichten, die bisher nur Query oder Hash hatten -----------------
  '/atmosphaere/arbeitsfenster': {
    h1: 'Arbeitsfenster Go/No-Go — Böen auf Arbeitshöhe für Drohne, Kran und Höhenarbeit',
    lead: 'Das Arbeitsfenster beantwortet eine einzige Frage: Hält die Böe auf meiner Arbeitshöhe heute unter meinem Grenzwert? Eingegeben werden Arbeits- oder Flughöhe über Grund und ein Böengrenzwert in Kilometern pro Stunde, voreingestellt sind 120 Meter und 40 km/h. Daraus entsteht eine Zeitleiste über den Tag mit klarem GO oder NO-GO, den Fenstern, in denen der Grenzwert reißt, der höchsten Böe im Zeitraum und dem Höhenfaktor, der sagt, um wie viel stärker es oben weht als am Boden.',
    body: [
      'Gerechnet wird am exponiertesten Punkt der gezogenen Schnittlinie: Die Ansicht wählt den Anker mit dem höchsten Gelände und wertet ihn im 15-Minuten-Raster aus. Die Böe auf Arbeitshöhe entsteht aus der 10-Meter-Böe des Modells über ein Potenzprofil der Grenzschicht mit dem Exponenten 0,2, das bis 1 500 Meter über Grund zunimmt und darüber sättigt. Eigene Grenzwerte für weitere Gewerke lassen sich anlegen; sie bleiben im Browser, nicht auf einem Server.',
      'Grenzen, die die Ansicht ausspricht: Das Windprofil ist eine Näherung aus dem Bodenwert, keine Messung in Arbeitshöhe, und es kennt weder Gebäude noch Kranausleger noch Düsen zwischen Hallen. Strukturen unter 200 Metern löst das Modellprofil nicht sicher auf. Die Zeitleiste ist eine Planungshilfe und kein zertifiziertes Arbeitsschutz-Werkzeug: Maßgeblich bleiben die Betriebsanleitung des Geräts, die Vorgaben des Herstellers und die amtlichen Warnungen der Wetterdienste.',
    ],
    facts: [
      { label: 'Quellen', text: 'DWD ICON-D2 (Böe 10 m, 2,2 km) · ICON-EU-Druckflächen · Terrarium-DEM' },
      { label: 'Voreinstellung', text: '120 m über Grund, Grenzwert 40 km/h — beides frei änderbar, Zusatzgrenzwerte im Browser gespeichert' },
      { label: 'Zeitraster', text: '15 Minuten über 36 bis 48 Stunden' },
      { label: 'Höhenprofil', text: 'Potenzgesetz mit Exponent 0,2, Sättigung bei 1 500 m über Grund' },
      { label: 'Grenze', text: 'Näherung statt Messung; keine Gebäude- oder Geräteeffekte; kein zertifiziertes Arbeitsschutz-Werkzeug' },
    ],
    explainer: 'windgrenzwerte-arbeit-drohne',
  },
  '/waldbrand/historie': {
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
  '/eventplanung/grillen': {
    h1: 'Grillwetter: der beste Tag der Woche für Grillabend und Gartenfest',
    lead: 'Für einen Grillabend zählt anderes als für eine Wanderung: Es soll warm sein, trocken bleiben und der Wind soll weder Glut noch Servietten verteilen. Genau so bewertet buscosun die kommenden sieben Tage für den Anlass Grillen — mit einer Idealtemperatur zwischen 19 und 30 Grad, dem stärksten Gewicht auf Niederschlag, deutlichem Gewicht auf Temperatur und einer Vorliebe für wenig Bewölkung. Jeder Tag bekommt eine Punktzahl von 0 bis 100 und einen Satz, der den ausschlaggebenden Nachteil benennt.',
    body: [
      'Bewertet wird das gewählte Zeitfenster, nicht der Kalendertag: ganzer Tag, Vormittag, Nachmittag oder Abend. Für jede Stunde des Fensters fasst die Rechnung Regensumme und Regenstunden, Böenspitzen, Temperatur und Bewölkung zusammen und zieht die schlechteste Einzelstunde als Spitze mit heran — ein Tag mit einer kräftigen Schauerstunde am Abend ist kein guter Grilltag, auch wenn die Tagessumme klein aussieht. Alle vier Gewichte und die Idealtemperatur lassen sich nachjustieren, wenn die Voreinstellung nicht zum eigenen Fest passt.',
      'Ehrlich bleibt die Sicherheit: Jeder Tag trägt eine Konfidenz aus der Einigkeit der Quellen mal Vorlaufzeit. Unter dem Schwellenwert 0,55 wird der Tag als Tendenz gekennzeichnet statt als Empfehlung. Tage jenseits des Horizonts der genutzten Quelle erscheinen als „keine Vorhersage" und nicht als Null, die wie eine Aussage aussieht. Wer eine Fläche aufzieht, bekommt zusätzlich die Spanne über das Gelände statt eines einzelnen Punktwerts.',
    ],
    facts: [
      { label: 'Quellen', text: 'DWD MOSMIX und Messstationen · GeoSphere AROME und INCA · MeteoSchweiz SMN · Radar-Nowcast im Kurzfristbereich' },
      { label: 'Profil', text: 'Idealtemperatur 19–30 °C; Gewichte Regen 1,0 · Temperatur 0,7 · Wind 0,5 · Bewölkung 0,5 (wenig bevorzugt)' },
      { label: 'Horizont', text: '7 Tage; Konfidenz unter 0,55 gilt als Tendenz' },
      { label: 'Abdeckung', text: 'DE, AT, CH; Punkt oder aufgezogene Fläche mit vier Ecken und Mitte' },
      { label: 'Grenze', text: 'Bewertung ist eine Planungshilfe, kein Warnprodukt; jenseits des Quellenhorizonts wird nicht bewertet' },
    ],
    explainer: 'modellvergleich-unsicherheit',
  },
  '/eventplanung/hochzeit': {
    h1: 'Hochzeitswetter: Trauung, Empfang und Abendfeier einzeln bewertet',
    lead: 'Eine Hochzeit im Freien ist kein Tag, sondern eine Abfolge: Die Trauung am frühen Nachmittag, der Empfang danach, die Feier am Abend. buscosun bewertet diese Phasen einzeln — voreingestellt 13 bis 15, 15 bis 18 und 18 bis 23 Uhr — und wertet den Tag nach der schwächsten Phase, weil ein Gewitter um 14 Uhr nicht dadurch besser wird, dass der Abend ruhig ist. Dazu kommt eine Plan-B-Schwelle, ab der die Ansicht ausdrücklich zu Zelt, Halle oder Unterstand rät.',
    body: [
      'Die Schwellen sind sichtbar und änderbar: Voreingestellt lösen drei Millimeter Regen im Fenster, Böen ab 13 Metern je Sekunde oder eine Gesamtpunktzahl unter 50 den Plan B aus. Auf Knopfdruck sucht die Ansicht zusätzlich einen Ausweichort: acht Himmelsrichtungen im Umkreis von 22 Kilometern, mit demselben Anlassprofil bewertet, vorgeschlagen wird nur, was mindestens sechs Punkte besser abschneidet. Die Bewertung nutzt die Idealtemperatur 14 bis 26 Grad mit vollem Gewicht auf Niederschlag.',
      'Für die Location selbst hilft die Flächenansicht: Statt eines Punktes lässt sich das Gelände als Rechteck aufziehen, vier Ecken und die Mitte werden nacheinander abgefragt, und die Geländebühne nennt den tiefsten und den windexponiertesten Punkt sowie die Stunde, in der die Sonne je Phase hinter dem Grat verschwindet. Über flachem Land liegt die Spanne oft unter einem halben Grad — dann sagt die Ansicht „uniform", statt Nachkommastellen als Ortsauflösung auszugeben. Sieben Tage sind der Horizont; für einen Termin in Monaten gibt es keine Wettervorhersage, nur die astronomischen Lichtzeiten.',
    ],
    facts: [
      { label: 'Quellen', text: 'DWD MOSMIX und Messstationen · GeoSphere AROME · MeteoSchweiz SMN · Terrarium-DEM für Gelände und Horizont' },
      { label: 'Phasen', text: 'Trauung 13–15, Empfang 15–18, Abendfeier 18–23 Uhr (frei änderbar); der Tag zählt die schwächste Phase' },
      { label: 'Plan B', text: 'Voreinstellung 3 mm Regen, 13 m/s Böe oder Punktzahl 50; Ausweichort in 8 Richtungen bis 22 km' },
      { label: 'Abdeckung', text: 'DE, AT, CH; Fläche mit Ecken-Abtastung und Geländekennzahlen' },
      { label: 'Grenze', text: '7 Tage Horizont, darüber nur Lichtzeiten; keine amtliche Warnung; Geländemodell ohne Gebäude und Bewuchs' },
    ],
    explainer: 'modellvergleich-unsicherheit',
  },
  '/eventplanung/wandern': {
    h1: 'Wanderwetter: welcher Tag der Woche für die Tour trägt',
    lead: 'Für eine Wanderung zählen Trockenheit, milde Temperaturen und eine Sicht, die den Weg lohnt. Der Anlass Wandern bewertet die kommenden sieben Tage mit Idealtemperatur zwischen 12 und 22 Grad, vollem Gewicht auf Niederschlag, deutlichem Gewicht auf Temperatur und moderatem auf Wind. Das Ergebnis ist eine Punktzahl je Tag mit dem Faktor, der ihn kippt — und eine Konfidenz, die sagt, wie einig sich die Quellen über diesen Tag überhaupt sind.',
    body: [
      'Wer die konkrete Strecke schon hat, ist mit der Tourenplanung besser bedient: Sie liest die GPX-Datei und rechnet das Wetter je Kilometer zur voraussichtlichen Ankunftszeit statt für einen Punkt über den ganzen Tag. Die Event-Ansicht beantwortet die Frage davor — welcher Tag überhaupt. Beide nutzen dieselbe Punktvorhersage aus amtlichen Stationen, MOSMIX und den Landesmodellen, höhenkorrigiert über das Geländemodell, damit der Gipfel nicht die Temperatur des Tals bekommt.',
      'Grenzen: Die Bewertung kennt den Weg nicht, sondern nur den Ort — Nebelgrenzen, Grat und Tal unterscheidet erst die Tourenplanung oder die Atmosphäre-Ansicht. Für alpine Touren im Winter ersetzt nichts davon den Lawinenlagebericht; buscosun verlinkt ihn ab etwa 1 000 Metern, wertet ihn aber nicht aus. Amtliche Warnungen gibt allein der Wetterdienst heraus, in Österreich und der Schweiz mit anderen Stufenlogiken als in Deutschland.',
    ],
    facts: [
      { label: 'Quellen', text: 'DWD MOSMIX und Messstationen · GeoSphere AROME und INCA · MeteoSchweiz SMN · Terrarium-DEM' },
      { label: 'Profil', text: 'Idealtemperatur 12–22 °C; Gewichte Regen 1,0 · Temperatur 0,6 · Wind 0,4 · Bewölkung 0,25' },
      { label: 'Horizont', text: '7 Tage; Konfidenz unter 0,55 gilt als Tendenz' },
      { label: 'Abdeckung', text: 'DE, AT, CH; höhenkorrigiert über das Geländemodell' },
      { label: 'Grenze', text: 'kein Streckenwetter (dafür die Tourenplanung), kein Lawinenlagebericht, kein Warnprodukt' },
    ],
    explainer: 'schneefallgrenze',
  },
  '/eventplanung/drohne': {
    h1: 'Drohnenwetter: der ruhigste Tag für den Flug',
    lead: 'Beim Drohnenflug entscheidet der Wind. Der Anlass Drohne gewichtet Böen mit dem vollen Faktor 1,0, Niederschlag mit 0,9, Bewölkung mit 0,4 und die Temperatur fast gar nicht — der Bereich von 2 bis 30 Grad gilt schlicht als unkritisch. So entsteht für die kommenden sieben Tage eine Reihenfolge, die dem entspricht, was das Fluggerät wirklich stört, und nicht dem allgemeinen Eindruck von schönem Wetter.',
    body: [
      'Den Tag wählt diese Ansicht, die Stunde das Arbeitsfenster: Dort werden Flughöhe über Grund und Böengrenzwert eingegeben, und die Zeitleiste zeigt GO oder NO-GO über den Tag samt Höhenfaktor zwischen Boden und Flughöhe. Voreingestellt sind 120 Meter und 40 km/h; beides lässt sich auf die Grenzwerte des eigenen Geräts stellen. Wer eine Fläche aufzieht, bekommt zusätzlich die Windpfeile zur Böenspitzenstunde über dem Gelände.',
      'Grenzen und Verantwortung: buscosun kennt weder die Betriebsgrenzen des Geräts noch die Luftraumlage. Die Herstellerangabe und die Betriebsanleitung sind maßgeblich, ebenso die Regeln der zuständigen Luftfahrtbehörde und geografische Sperrgebiete — dafür gibt es eigene amtliche Dienste. Die Böe in Flughöhe ist eine Näherung aus dem Bodenwert über ein Grenzschichtprofil, keine Messung, und Turbulenz an Kanten oder zwischen Gebäuden bildet kein Modell mit 2,2 Kilometern Gitterweite ab.',
    ],
    facts: [
      { label: 'Quellen', text: 'DWD ICON-D2 (Böe) und MOSMIX · GeoSphere AROME · MeteoSchweiz SMN · Terrarium-DEM' },
      { label: 'Profil', text: 'Idealtemperatur 2–30 °C; Gewichte Wind 1,0 · Regen 0,9 · Bewölkung 0,4 · Temperatur 0,1' },
      { label: 'Stundenwahl', text: 'Arbeitsfenster Go/No-Go mit Flughöhe und Böengrenzwert (Voreinstellung 120 m, 40 km/h)' },
      { label: 'Abdeckung', text: 'DE, AT, CH' },
      { label: 'Grenze', text: 'keine Luftraum- oder Sperrgebietsdaten; Herstellergrenzwerte maßgeblich; Böe in Höhe ist Näherung, keine Messung' },
    ],
    explainer: 'windgrenzwerte-arbeit-drohne',
  },
  '/eventplanung/fotografie': {
    h1: 'Fotowetter: der Tag mit dem besseren Licht',
    lead: 'Für Fotografie ist ein wolkenloser Tag selten der beste. Der Anlass Fotografie gewichtet deshalb die Bewölkung mit dem vollen Faktor 1,0 und bevorzugt ausdrücklich weiches, strukturiertes Licht statt blanken Himmels; Regen zählt mit 0,7, Wind mit 0,25, die Temperatur zwischen 2 und 28 Grad fast gar nicht. Dazu kommen die Lichtzeiten: goldene und blaue Stunde, berechnet aus dem Sonnenstand, für jedes Datum gültig — auch für einen Termin in drei Monaten.',
    body: [
      'Die Lichtfenster sind reine Astronomie nach dem Verfahren der NOAA und auf etwa eine Minute genau: blaue Stunde bei Sonnenhöhe zwischen minus sechs und minus vier Grad, goldene Stunde zwischen minus vier und plus sechs Grad, Auf- und Untergang bei minus 0,833 Grad. Die Wetterbewertung darüber — Lichtqualität weich, hart oder dramatisch, Nebelchance, Chance auf Abendrot — ist dagegen eine Wahrscheinlichkeit aus Bedeckung und Schichtung und gilt nur im Vorhersagehorizont von sieben Tagen.',
      'Am Gelände wird es konkreter: Wer eine Fläche aufzieht, bekommt die Stunde genannt, in der die Sonne hinter dem Grat verschwindet — der Horizont stammt aus dem Höhenmodell im Umkreis von 30 Kilometern, ein Grat unter einem Grad Höhe gilt als normaler Sonnenuntergang. Grenzen: Das Modell kennt weder Gebäude noch Bäume, die Nebelchance ist eine Schätzung und keine Nebelvorhersage, und ob eine Wolke am Abend wirklich Farbe annimmt, sagt keine Rechnung sicher voraus.',
    ],
    facts: [
      { label: 'Quellen', text: 'Sonnenstand nach NOAA-Verfahren · DWD MOSMIX, GeoSphere AROME, MeteoSchweiz SMN für Bewölkung und Feuchte · Terrarium-DEM für den Horizont' },
      { label: 'Profil', text: 'Idealtemperatur 2–28 °C; Gewichte Bewölkung 1,0 (weiches Licht bevorzugt) · Regen 0,7 · Wind 0,25 · Temperatur 0,15' },
      { label: 'Lichtzeiten', text: 'blaue Stunde −6° bis −4°, goldene Stunde −4° bis +6°, Auf-/Untergang −0,833°; gültig für jedes Datum' },
      { label: 'Abdeckung', text: 'DE, AT, CH; Geländehorizont im Umkreis von 30 km' },
      { label: 'Grenze', text: 'Lichtstimmung ist Wahrscheinlichkeit, keine Zusage; Horizont ohne Gebäude und Bewuchs; Wetterteil nur 7 Tage' },
    ],
    explainer: 'goldene-blaue-stunde',
  },
  '/eventplanung/sterne': {
    h1: 'Sternenwetter: die klarste Nacht der Woche finden',
    lead: 'Für Astrofotografie und Beobachtung zählt die Nacht, nicht der Tag. Der Anlass Sterne bewertet deshalb die Kernnacht von 22 bis 4 Uhr statt des Tagesfensters: Bewölkung mit vollem Gewicht, Niederschlag mit 0,9, Wind mit 0,2, die Temperatur zwischen 0 und 30 Grad praktisch ohne Einfluss. Dazu kommen Mondphase und Mondhöhe, die astronomische Dunkelheit, das Tau-Risiko für die Optik und eine Einordnung der Lichtverschmutzung am Ort.',
    body: [
      'Die Nachtbewertung deckt 21 bis 6 Uhr ab und trennt die Wolkenstockwerke, weil hohe Schleierbewölkung anders stört als eine geschlossene tiefe Decke. Das Tau-Risiko kommt aus dem Taupunkt nach der Magnus-Formel, die Mondbahn aus dem Verfahren nach Schlyter. Die Lichtverschmutzung ist ausdrücklich eine Offline-Schätzung aus der Nähe zu Städten, auf die Bortle-Skala von 1 bis 9 abgebildet — kein Satelliten-Atlas und keine Messung des Himmelshintergrunds.',
      'Was diese Ansicht nicht kann: Sie sagt keine Sichtbarkeit der Milchstraße vorher, keine Meteorströme, keine Polarlichter und keine Durchsicht in Bogensekunden. Sie beantwortet die Frage, in welcher der nächsten Nächte Wolken, Mond und Feuchte am wenigsten im Weg stehen, und liefert die Zeiten, ab denen es astronomisch wirklich dunkel ist. Für den Beobachtungsplan selbst bleiben Ephemeriden und Sternkarten zuständig.',
    ],
    facts: [
      { label: 'Quellen', text: 'DWD MOSMIX, GeoSphere AROME, MeteoSchweiz SMN für Wolken und Feuchte · Sonnen- und Mondstand astronomisch berechnet' },
      { label: 'Profil', text: 'Kernnacht 22–4 Uhr; Gewichte Bewölkung 1,0 · Regen 0,9 · Wind 0,2 · Temperatur 0,15' },
      { label: 'Nachtwerte', text: 'Wolkenstockwerke, Mondphase und -höhe, astronomische Dunkelheit, Tau-Risiko aus dem Taupunkt' },
      { label: 'Abdeckung', text: 'DE, AT, CH; Bortle-Einordnung als Offline-Schätzung' },
      { label: 'Grenze', text: 'keine Milchstraßen-, Meteor- oder Polarlicht-Prognose; Lichtverschmutzung geschätzt, nicht gemessen' },
    ],
    explainer: 'lichtverschmutzung-bortle',
  },
  '/eventplanung/radtour': {
    h1: 'Radwetter: der beste Tag für Rennrad, Gravel und E-Bike-Tour',
    lead: 'Auf dem Rad ist Wind der Faktor, den man am längsten spürt. Der Anlass Radtour gewichtet ihn mit 0,7 und den Niederschlag mit dem vollen Faktor 1,0, die Idealtemperatur liegt zwischen 12 und 24 Grad. Für die kommenden sieben Tage entsteht daraus eine Reihenfolge mit Punktzahl, dem ausschlaggebenden Nachteil je Tag und einer Konfidenz, die offenlegt, wie einig sich die Quellen über diesen Tag sind.',
    body: [
      'Für die Ausfahrt selbst geht die Tourenplanung weiter: Sie liest GPX, TCX, FIT oder KML, rechnet mit Steigung und Bewegungsart eine realistische Geschwindigkeit, berücksichtigt den Wind für die Ankunftszeit je Kilometer und schätzt beim E-Bike den Ladezustand über die Strecke. Diese Ansicht beantwortet die Frage davor — an welchem Tag es überhaupt Sinn ergibt — und übergibt danach an die Streckenrechnung.',
      'Grenzen: Ein Tageswert kennt keine Passhöhe und keine Talinversion; die Höhenkorrektur greift für den gewählten Ort, nicht für jeden Streckenpunkt. Für Gewitterlagen im Sommer ist der Nowcast die schärfere Quelle, weil er gemessenes Radar statt Modellniederschlag zeigt. Amtliche Warnungen kommen ausschließlich von den Wetterdiensten; buscosun bildet sie ab, gibt aber keine eigenen heraus.',
    ],
    facts: [
      { label: 'Quellen', text: 'DWD MOSMIX und Messstationen · GeoSphere AROME und INCA · MeteoSchweiz SMN · Radar-Nowcast im Kurzfristbereich' },
      { label: 'Profil', text: 'Idealtemperatur 12–24 °C; Gewichte Regen 1,0 · Wind 0,7 · Temperatur 0,5 · Bewölkung 0,2' },
      { label: 'Anschluss', text: 'Tourenplanung mit GPX/TCX/FIT/KML, Wind-Effekt auf die Fahrzeit und E-Bike-Reichweite' },
      { label: 'Abdeckung', text: 'DE, AT, CH' },
      { label: 'Grenze', text: 'Tageswert für einen Ort, kein Streckenwetter; kein Warnprodukt; Gewitter kurzfristig besser im Nowcast' },
    ],
    explainer: 'windboeen-sturm',
  },
  '/eventplanung/picknick': {
    h1: 'Picknickwetter: mild, trocken und wenig bewölkt',
    lead: 'Ein Picknick, ein Kindergeburtstag im Park oder das Treffen auf der Wiese braucht wenig: mild, trocken, nicht zu windig, gern sonnig. Der Anlass Picknick bewertet die kommenden sieben Tage mit einer Idealtemperatur zwischen 17 und 28 Grad, vollem Gewicht auf Niederschlag, 0,7 auf Temperatur, 0,5 auf Wind und einer Vorliebe für wenig Bewölkung. Herausgekommen ist eine Rangfolge mit Punktzahl je Tag und dem Faktor, der den Tag kippt.',
    body: [
      'Weil ein einzelner Schauer den Nachmittag entscheidet, zählt nicht nur die Tagessumme: Die Bewertung fasst die Stunden des gewählten Fensters zusammen und zieht die schlechteste Einzelstunde als Spitze mit heran. Wer will, verschiebt das Fenster auf Vormittag oder Nachmittag und bekommt eine andere Reihenfolge. Für die Wiese selbst lässt sich eine Fläche aufziehen; die Ansicht nennt dann die Spanne über das Gelände und den tiefsten, meist kühlsten Punkt.',
      'Zur Ehrlichkeit gehört die Sicherheit je Tag: Sie entsteht aus der Einigkeit der Quellen mal Vorlaufzeit und wird als Balken gezeigt; unter dem Schwellenwert 0,55 gilt der Tag nur noch als Tendenz. Für Tage jenseits des Quellenhorizonts steht „keine Vorhersage" statt einer Zahl. Sieben Tage sind die Grenze; darüber hinaus gibt es keine belastbare Aussage, auch wenn andere Apps welche zeigen.',
    ],
    facts: [
      { label: 'Quellen', text: 'DWD MOSMIX und Messstationen · GeoSphere AROME und INCA · MeteoSchweiz SMN' },
      { label: 'Profil', text: 'Idealtemperatur 17–28 °C; Gewichte Regen 1,0 · Temperatur 0,7 · Wind 0,5 · Bewölkung 0,45 (wenig bevorzugt)' },
      { label: 'Horizont', text: '7 Tage; Konfidenz unter 0,55 gilt als Tendenz' },
      { label: 'Abdeckung', text: 'DE, AT, CH; Punkt oder aufgezogene Fläche' },
      { label: 'Grenze', text: 'Planungshilfe ohne Warncharakter; jenseits des Quellenhorizonts wird nicht bewertet' },
    ],
    explainer: 'modellvergleich-unsicherheit',
  },
  '/eventplanung/laufen': {
    h1: 'Laufwetter: kühl und trocken statt sonnig',
    lead: 'Beim Laufen ist warm nicht gut. Der Anlass Laufen setzt die Idealtemperatur deshalb bewusst niedrig zwischen 5 und 17 Grad, gewichtet Niederschlag mit 0,8, Temperatur mit 0,6, Wind mit 0,4 und die Bewölkung fast gar nicht — Sonne ist beim langen Lauf eher Last als Gewinn. Für die kommenden sieben Tage entsteht daraus eine Rangfolge mit Punktzahl, dem entscheidenden Nachteil und einer Konfidenz je Tag.',
    body: [
      'Das Zeitfenster verschiebt das Ergebnis erheblich: Ein Tag, der nachmittags zu heiß ist, kann früh am Morgen der beste der Woche sein. Deshalb lässt sich zwischen ganzem Tag, Vormittag, Nachmittag und Abend wählen; bewertet werden immer nur die Stunden dieses Fensters, inklusive der gefühlten Temperatur, die Wind und Feuchte einbezieht. Für einen Firmenlauf oder Wettkampf mit fester Uhrzeit passt eine eigene Phase mit genau diesen Stunden.',
      'Grenzen: Es gibt keine Hitzewarnung und keinen medizinischen Rat — buscosun rechnet Wetter, nicht Belastung. Amtliche Warnungen vor Hitze oder Gewitter geben allein die Wetterdienste heraus. Ozon- und Feinstaubwerte sind nicht Teil der Bewertung; der Pollenflug steht nur für Deutschland als amtlicher Feed zur Verfügung, für Österreich und die Schweiz ausdrücklich nicht.',
    ],
    facts: [
      { label: 'Quellen', text: 'DWD MOSMIX und Messstationen · GeoSphere AROME und INCA · MeteoSchweiz SMN' },
      { label: 'Profil', text: 'Idealtemperatur 5–17 °C; Gewichte Regen 0,8 · Temperatur 0,6 · Wind 0,4 · Bewölkung 0,15' },
      { label: 'Fenster', text: 'ganzer Tag, Vormittag, Nachmittag, Abend oder eigene Phase mit fester Startzeit' },
      { label: 'Abdeckung', text: 'DE, AT, CH; gefühlte Temperatur aus Wind und Feuchte' },
      { label: 'Grenze', text: 'kein medizinischer Rat, keine Hitzewarnung, keine Luftqualität; Pollen amtlich nur in Deutschland' },
    ],
    explainer: 'biowetter',
  },
  '/eventplanung/baden': {
    h1: 'Badewetter: heiß und sonnig für Freibad, See und Strandtag',
    lead: 'Beim Baden zählt die Temperatur mehr als alles andere. Der Anlass Baden ist der einzige, der sie mit dem vollen Faktor 1,0 gewichtet, bei einer Idealspanne zwischen 24 und 34 Grad; Niederschlag zählt mit 0,8, Bewölkung mit 0,6 mit Vorliebe für wenig Wolken, Wind mit 0,4. So entsteht für die kommenden sieben Tage die Rangfolge, die zur Frage passt, an welchem Tag ein Ausflug an den See wirklich lohnt.',
    body: [
      'Bewertet wird die Luft, nicht das Wasser: Eine Wassertemperatur führt buscosun nicht, weder für Seen noch für Flüsse oder Freibäder, und auch keine Badegewässerqualität — dafür sind die Gesundheitsämter und Landesportale zuständig. Ebenso wenig gibt es Wellenhöhen für Binnenseen. Was die Ansicht liefert, ist die Luftseite: Temperatur und gefühlte Temperatur, Regenstunden, Böen und Bewölkung im gewählten Fenster, dazu der UV-Index.',
      'Beim UV-Index ist die Herkunft ehrlich getrennt: In Deutschland stammt er vom DWD als amtlicher Tageshöchstwert und wird über den Sonnenstand auf die Stunden verteilt; für Österreich und die Schweiz gibt es keinen entsprechenden offenen Feed, dort ist der Wert eine Klarhimmel-Schätzung. Für Gewitter im Sommer ist zusätzlich der Nowcast die schärfere Quelle, weil er gemessenes Radar zeigt statt Modellniederschlag.',
    ],
    facts: [
      { label: 'Quellen', text: 'DWD MOSMIX, Messstationen und UV-Tagespeak · GeoSphere AROME und INCA · MeteoSchweiz SMN' },
      { label: 'Profil', text: 'Idealtemperatur 24–34 °C; Gewichte Temperatur 1,0 · Regen 0,8 · Bewölkung 0,6 (wenig bevorzugt) · Wind 0,4' },
      { label: 'UV', text: 'Deutschland amtlicher DWD-Tageshöchstwert, über den Sonnenstand verteilt; Österreich und Schweiz Klarhimmel-Schätzung' },
      { label: 'Abdeckung', text: 'DE, AT, CH' },
      { label: 'Grenze', text: 'keine Wassertemperatur, keine Badegewässerqualität, keine Wellenhöhe; kein Warnprodukt' },
    ],
    explainer: 'gewitter-unwetter',
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
