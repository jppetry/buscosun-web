/**
 * Phase FX-UI — the German copy of the buscosun Fusion explainer, verbatim from the order of 02.11.2026
 * (`audit/fusion-erklaerung.md`). No stand number is written here: the name of the stand comes from `fusionName(FUSION_CURRENT)`
 * at runtime (`fusionRelease.ts`, one number everywhere).
 */

export const PREVIEW = {
  eyebrow: 'DAS FUNDAMENT · POSTPROCESSING',
  h2: 'Was zwischen Wettermodell und deiner Vorhersage passiert',
  lead: 'Wettermodelle rechnen auf geglätteten Gittern und kennen weder dein Tal noch die Messung von eben. buscosun Fusion bündelt mehrere Modelle, rechnet ihre bekannten Fehler heraus und liefert für deinen Ort eine ehrliche Spanne.',
  chips: [['01', 'Bündeln'], ['02', 'Korrigieren'], ['03', 'Herunterrechnen'], ['04', 'Verankern'], ['05', 'Kalibrieren']] as const,
  button: 'So rechnet buscosun Fusion →',
  before: 'VORHER', beforeSub: 'fünf Rohmodelle',
  after: 'BUSCOSUN FUSION', afterSub: 'Wert und Spanne',
  caption: 'SCHEMA, KEINE MESSDATEN · 36 H AN EINEM TALORT',
  aria: 'So rechnet buscosun Fusion: Erklärung öffnen',
};

export const HERO = {
  eyebrow: 'METHODIK · POSTPROCESSING',
  h1: 'Was zwischen Wettermodell und deiner Vorhersage passiert',
  lead: 'Ein Wettermodell rechnet auf einem geglätteten Gitter von 1 bis 25 km. Es kennt weder dein Tal noch die Messung von vor zehn Minuten. buscosun Fusion ist unser Postprocessing: Es bündelt mehrere Modelle, rechnet ihre bekannten Fehler heraus, bringt sie auf die echte Lage deines Ortes und schließt sie an aktuelle Messungen an. Heraus kommt kein Scheinwert, sondern eine ehrliche Spanne.',
  sheetHead: 'AUSGABE JE ORT',
  sheet: [
    ['Horizont', '0–336 h, die ersten 48 h stündlich'],
    ['Größen', 'Temperatur, Taupunkt, Wind, Böen, Niederschlag, Bewölkung'],
    ['Ausgabe', 'wahrscheinlichster Wert, Spanne p10–p90 und Konfidenz'],
    ['Anker', 'rund 3.000 Messstellen in DE · AT · CH'],
    ['Rechnung', 'vorgerechnet je Modelllauf, fertig gerechnet in deinem Browser'],
  ] as const,
};

export const SECTIONS = {
  s1: {
    num: '01', kicker: 'DAS PROBLEM', h2: 'Ein Modell sieht die Landschaft weichgezeichnet',
    intro: 'Rohe Modellwerte sind für ein Gitter gerechnet, nicht für deinen Ort. Drei Dinge trennen beides.',
    items: [
      ['Geglättete Höhe', 'Eine Gitterzelle hat genau eine Höhe. Grat und Tal darin teilen sie sich, und dein Ort liegt fast nie darauf.'],
      ['Kein Blick auf jetzt', 'Ein Modelllauf ist schon Stunden alt, wenn er ankommt. Was die Station nebenan gerade misst, kennt er nicht.'],
      ['Wiederkehrende Fehler', 'Jedes Modell irrt auf seine Weise, und zwar immer wieder ähnlich, etwa nachts in Tälern zu warm. Wer das weiß, kann es herausrechnen.'],
    ] as const,
    terrainAria: 'Schnitt durch ein Alpental: echte Landschaft gegen die Modelloberfläche mit einer Höhe je Gitterzelle; im Tal liegt Kaltluft unter der Modellhöhe',
    legend: ['echte Landschaft', 'Modell: eine Höhe je Gitterzelle', 'Kaltluft im Tal', 'SCHEMA'] as const,
  },
  s2: {
    num: '02', kicker: 'DER RECHENWEG', h2: 'In fünf Schritten vom Rohmodell zur Spanne',
    intro: 'Dieselbe Kurve, fünfmal gezeigt: Jeder Schritt nimmt einen Fehler heraus, den die Modelle mitbringen.',
    steps: [
      ['01', 'BÜNDELN', 'Quellen bündeln', 'Modelle von DWD, ECMWF, GeoSphere Austria und MeteoSchweiz, dazu Radar und stündlich neue Kurzfristläufe. Je Land und Vorlauf zählt eine andere Mischung.'],
      ['02', 'KORRIGIEREN', 'Bekannte Fehler herausrechnen', 'Jedes Modell irrt systematisch, je nach Größe und Vorlauf. Fusion kennt diese Fehler aus einem Archiv, in dem Vorhersagen Stunde für Stunde neben Messungen liegen.'],
      ['03', 'HERUNTERRECHNEN', 'Aufs echte Gelände', 'Die Modellhöhe ist nicht deine Höhe. Fusion rechnet auf die tatsächliche Geländehöhe um und erkennt in den ersten 48 Stunden Inversionen, wenn das Tal kälter ist als der Hang.'],
      ['04', 'VERANKERN', 'An Messungen anschließen', 'Die Vorhersage startet dort, wo die nächsten Stationen gerade messen. Der Einfluss der Messung klingt mit dem Vorlauf ab.'],
      ['05', 'KALIBRIEREN', 'Spanne statt Scheinwert', 'Je Stunde ein wahrscheinlichster Wert und eine Spanne, in der das Wetter in acht von zehn Fällen liegen soll. Ihre Breite ist an nachgerechneten Vorhersagen geeicht.'],
    ] as const,
    stripHead: 'FÜNF SCHRITTE', stripHint: 'wischen ›', stripAria: 'Die fünf Rechenschritte, seitlich scrollbar',
    legendHead: 'SCHEMA, KEINE MESSDATEN',
    legendSub: 'Temperatur an einem Talort, 36 Stunden ab jetzt',
    legend: ['Rohmodelle', 'gebündelt', 'Stand davor', 'Messung jetzt', 'buscosun Fusion: Wert und Spanne', 'spätere Messung', 'Nacht'] as const,
  },
  s3: {
    num: '03', kicker: 'DIE QUELLEN', h2: 'Wer wie weit nach vorn trägt',
    intro: 'Kurz voraus zählen Radar, Messungen und fein aufgelöste Regionalmodelle. Je weiter voraus, desto mehr übernehmen globale Modelle und Ensembles. Wie stark jede Quelle wann zählt, lernt buscosun Fusion aus dem Archiv.',
    axisCaption: 'ZEITACHSE GESTAUCHT · SCHEMATISCH',
  },
  s4: {
    num: '04', kicker: 'DAS ERGEBNIS', h2: 'Was du davon siehst',
    intro: 'Für jede Stunde ein Wert, eine Spanne und ein Wort dafür, wie sicher die Lage ist. Der typische Fehler daneben ist nachgemessen, nicht geschätzt.',
    items: [
      ['Wahrscheinlichster Wert', 'Die Linie, die du in der App als Zahl liest.'],
      ['Spanne p10–p90', 'In acht von zehn Fällen liegt das Wetter darin.'],
      ['Breiter mit dem Vorlauf', 'Je unsicherer die Lage, desto weiter die Spanne, nachts oft etwas mehr.'],
    ] as const,
    outputAria: 'Schema: Temperaturverlauf über 48 Stunden mit wahrscheinlichstem Wert und Spanne',
    axis: ['JETZT', '+24 H', '+48 H'] as const,
    caption: 'SCHEMA · TEMPERATUR AN EINEM TALORT, 48 STUNDEN',
    readHead: 'SO STEHT ES IN DER APP', readTag: 'Beispiel', readWhen: 'Morgen, 07:00', readChip: 'solide · typisch ±0,9 °C',
  },
  s5: {
    num: '05', kicker: 'NACHGEMESSEN', h2: 'Nachgemessen statt behauptet',
    stripHead: 'STÄNDE VON BUSCOSUN FUSION', stripSub: 'jeder eingefroren und nachgemessen', baseDate: 'Grundstand',
  },
  s6: {
    num: '06', kicker: 'GRENZEN', h2: 'Was buscosun Fusion nicht kann',
    items: [
      ['Modelle bleiben Modelle', 'Fusion verbessert, was Modelle und Radar liefern. Ein Gewitter, das keine Quelle kommen sieht, sieht auch Fusion nicht.'],
      ['Zwischen den Stationen unsicherer', 'Wo die nächste Messung weit weg oder viel höher liegt, fehlt der Anker. Die Spanne ist dort breiter.'],
      ['Je weiter voraus, desto mehr Klima', 'Nach einigen Tagen nähert sich die Vorhersage dem, was zu dieser Jahreszeit üblich ist. Mehr gibt die Atmosphäre nicht her.'],
      ['Keine Warnung', 'buscosun Fusion ersetzt keine amtliche Unwetterwarnung. Die kommen vom DWD, von GeoSphere Austria und von MeteoSchweiz.'],
    ] as const,
  },
  s7: {
    num: '07', kicker: 'FRAGEN', h2: 'Häufige Fragen',
    items: [
      ['Ist buscosun Fusion genauer als die Wetterdienste?', 'Wir messen das laufend, auch gegen die Stationsvorhersage MOSMIX des DWD. Eine belastbare Zahl veröffentlichen wir erst, wenn ein Stand über einen Winter nachgemessen ist. Vorher wäre sie Werbung.'],
      ['Warum zeigt buscosun eine Spanne statt einer Zahl?', 'Weil eine einzelne Zahl Sicherheit vortäuscht. Die Spanne zeigt, wie sicher die Lage ist: schmal bei ruhigem Hochdruck, breit, wenn die Modelle uneins sind oder eine Front durchzieht.'],
      ['Was bedeutet die Nummer hinter buscosun Fusion?', 'Den eingefrorenen Stand des Rechenwegs. Jede Änderung an Tabellen oder Ablauf ergibt eine neue Nummer. So lässt sich jeder Stand mit seinem Vorgänger vergleichen.'],
    ] as const,
  },
};

/** Section 05, three cards; the first one names the current stand (`{stand}` is replaced at runtime). */
export const PROOF_CARDS = [
  ['Eingefroren', 'Jeder Stand von buscosun Fusion bekommt eine Nummer, und eine Nummer wird nie umgehängt. Wer „{stand}“ sagt, meint genau diesen Rechenweg.'],
  ['An amtlichen Stationen geprüft', 'Wir vergleichen jeden Stand mit dem, was danach tatsächlich gemessen wurde, an Stationen der Wetterdienste in DE, AT und CH. Ein Teil davon fließt nie ins Verfahren ein und zeigt, wie es zwischen den Stationen rechnet.'],
  ['Gegen wen', 'Gegen den eigenen Vorgänger, gegen die Rohmodelle und gegen die Stationsvorhersage MOSMIX des DWD. Gemessen wird der Fehler des Werts und ob die Spanne hält, was sie verspricht.'],
] as const;

/** Section 03 rows: title, source, range text, window in hours, colour. The anchor row carries four opacity steps. */
export interface SourceRow { title: string; source?: string; range: string; from: number; to: number; color: string; steps?: ReadonlyArray<readonly [from: number, to: number, opacity: number]> }
export const SOURCES: readonly SourceRow[] = [
  { title: 'Radar', range: '0–2 h', from: 0, to: 2, color: '#3A6FA8' },
  { title: 'Messungen als Anker', source: 'rund 3.000 Stationen, Einfluss klingt ab', range: '0–48 h', from: 0, to: 48, color: '#2C2A26', steps: [[0, 6, 0.9], [6, 12, 0.6], [12, 24, 0.35], [24, 48, 0.15]] },
  { title: 'Stündliche Kurzfristläufe (Niederschlag)', range: '0–27 h', from: 0, to: 27, color: '#7A9466' },
  { title: 'Regionalmodelle, 1–2 km', range: '0–48 h', from: 0, to: 48, color: '#C97B47' },
  { title: 'Stationsvorhersage', range: '0–240 h', from: 0, to: 240, color: '#C8935F' },
  { title: 'Europa- und Alpenmodelle, Ensembles', range: '48–120 h', from: 48, to: 120, color: '#6B7A8F' },
  { title: 'Globale Modelle, Ensembles, KI-Modelle', range: '120–336 h', from: 120, to: 336, color: '#7C6BC4' },
];
/** Axis ticks of section 03: hours, label, hidden on mobile. */
export const SOURCE_TICKS: ReadonlyArray<readonly [h: number, label: string, mobileHidden?: true]> = [
  [0, 'jetzt'], [2, '2 h', true], [24, '1 Tag'], [48, '2 Tage'], [120, '5 Tage'], [240, '10 Tage', true], [336, '14 Tage'],
];

export const CLOSING = {
  title: 'Probier es an deinem Ort', sub: 'Wert, Spanne und Konfidenz für jede Stunde bis 14 Tage voraus.', link: 'Ort suchen →',
};
export const FOOTER = 'Quellen: DWD · GeoSphere Austria · MeteoSchweiz · ECMWF. Alle Grafiken auf dieser Seite sind Schemata ohne Messdaten. buscosun ist kein sicherheitskritisches Briefing.';
